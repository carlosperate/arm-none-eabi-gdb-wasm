// The built GDB in Node: programs for several Arm cores, MI, and a session with a fake target.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { hasJspi, startGdb } from '../lib/index.mjs';
import { fakeTarget } from './fake-target.mjs';

const createGdb = createRequire(import.meta.url)('../dist/gdb.js');
const wasm = readFileSync(new URL('../dist/gdb.wasm', import.meta.url));
const program = (core) => readFileSync(new URL(`fixtures/${core}.elf`, import.meta.url));

// GDB run to its exit on CLI commands, as `-batch` does.
async function batch(core, ...commands) {
  const lines = [];
  const gdb = await startGdb({
    createGdb, wasm, files: { '/program.elf': program(core) },
    args: Object.freeze(['-nx', '-batch', '/program.elf', ...commands.flatMap((command) => ['-ex', command])]),
    onStdout: (line) => lines.push(line), onStderr: () => {},
  });
  return { status: await gdb.exited, output: lines.join('\n') };
}

// GDB over MI, as a debugger's front end drives it.
async function startMi(core, onSerial) {
  const waiters = [];
  const gdb = await startGdb({
    createGdb, wasm, files: { '/program.elf': program(core) }, args: ['--interpreter=mi2', '-nx', '-q'],
    onStdout: (line) => {
      const index = waiters.findIndex((waiter) => line.startsWith(waiter.prefix));
      if (index >= 0) waiters.splice(index, 1)[0].resolve(line);
    },
    onStderr: () => {},
    onSerial,
  });
  const next = (prefix) => new Promise((resolve) => waiters.push({ prefix, resolve }));
  let token = 0;
  // Sends a command, and gives its result record.
  const mi = (command) => {
    token += 1;
    const result = next(`${token}^`);
    gdb.stdin(`${token}${command}\n`);
    return result;
  };
  return { gdb, mi, next };
}

// What GDB decides from each program. One core per path: M-profile from the architecture or, for
// v7-M, the profile alone; hard float; BE8, where only data is big-endian; Thumb on a core with both.
const programs = {
  'cortex-m0plus': ['armv6s-m', 'M', 'softvfp', 'little', 'thumb'],
  'cortex-m3': ['armv7', 'M', 'softvfp', 'little', 'thumb'],
  'cortex-m4-hard': ['armv7e-m', 'M', 'vfp', 'little', 'thumb'],
  'cortex-m33': ['armv8-m.main', 'M', 'softvfp', 'little', 'thumb'],
  'cortex-m55-hard': ['armv8.1-m.main', 'M', 'vfp', 'little', 'thumb'],
  'cortex-r5-be8': ['armv7', 'R', 'softvfp', 'big', 'arm'],
  'cortex-a7-thumb': ['armv7', 'A', 'softvfp', 'little', 'thumb'],
  'cortex-a53': ['armv8-a', 'A', 'softvfp', 'little', 'arm'],
};
for (const [core, [architecture, profile, float, endian, code]] of Object.entries(programs)) {
  test(`reads a ${core} program`, async () => {
    const { status, output } = await batch(core, 'show architecture', 'show arm fpu', 'show endian',
      'maint print architecture', 'info line add_one', 'x/i main');
    assert.equal(status, 0);
    const expected = [
      `architecture is set to "auto" (currently "${architecture}")`,
      `floating point model is "auto" (currently "${float}")`,
      `(currently ${endian} endian)`,
      `is_m = ${profile === 'M' ? 'yes' : 'no'}`,
      'Line 2 of "program.c"',
      // GCC keeps the frame in r7 in Thumb code and in r11 in Arm code.
      `<main>:\tpush\t{${code === 'thumb' ? 'r7' : 'r11'}, lr}`,
    ];
    for (const text of expected) assert.ok(output.includes(text), `GDB never said: ${text}`);
  });
}

test('answers MI', async () => {
  const { gdb, mi } = await startMi('cortex-m4-hard');
  assert.match(await mi('-file-exec-and-symbols /program.elf'), /\^done/);
  assert.match(await mi('-break-insert add_one'), /\^done,bkpt=.*func="add_one",file="program\.c".*line="2"/);
  assert.match(await mi('-gdb-exit'), /\^exit/);
  assert.equal(await gdb.exited, 0);
});

test('debugs a target over the remote protocol, and pauses it while it runs', async () => {
  let gdb;
  const target = fakeTarget((bytes) => gdb.serial(bytes));
  const session = await startMi('cortex-m4-hard', (bytes) => target.receive(bytes));
  ({ gdb } = session);
  const { mi, next } = session;
  await mi('-gdb-set mi-async off');
  await mi('-file-exec-and-symbols /program.elf');
  assert.match(await mi('-target-select remote /dev/remote'), /\^connected/);
  assert.match(await mi('-break-insert -h add_one'), /\^done/);
  const continued = target.continued();
  assert.match(await mi('-exec-continue'), /\^running/);
  await continued;
  const stopped = next('*stopped');
  target.halt();
  assert.match(await stopped, /func="add_one"/);
  assert.match(await mi('-stack-list-frames'), /func="add_one"/);
  assert.match(await mi('-gdb-exit'), /\^exit/);
  assert.equal(await gdb.exited, 0);
});

test("gives GDB's exit status, leaving the host's alone", async () => {
  const { status } = await batch('cortex-m4-hard', 'no-such-command');
  assert.equal(status, 1);
  assert.equal(process.exitCode, undefined);
  // An exit code the host sets while GDB runs survives GDB's exit.
  const { gdb, mi } = await startMi('cortex-m4-hard');
  process.exitCode = 7;
  try {
    await mi('-gdb-exit');
    assert.equal(await gdb.exited, 0);
    assert.equal(process.exitCode, 7);
  } finally {
    process.exitCode = undefined;
  }
});

// The timeout turns a startup that never settles, the bug this guards, into a failure.
test('rejects a wasm module that is not GDB', { timeout: 5000 }, async () => {
  const empty = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  await assert.rejects(startGdb({ createGdb, wasm: empty, onStderr: () => {} }));
});

test('refuses a host without JSPI, before loading anything', async () => {
  const { Suspending } = WebAssembly;
  delete WebAssembly.Suspending;
  try {
    assert.equal(hasJspi(), false);
    await assert.rejects(startGdb({ createGdb, wasm }), /JSPI/);
  } finally {
    WebAssembly.Suspending = Suspending;
  }
});
