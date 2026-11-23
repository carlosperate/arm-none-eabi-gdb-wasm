// GDB's console in the terminal, on a program of yours or the tests' Cortex-M4 one. Given a port,
// `target remote /dev/remote` reaches the GDB server listening there, such as OpenOCD's on 3333.
//   node --experimental-wasm-jspi --experimental-wasm-exnref example/node.mjs [program.elf] [port]
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { startGdb } from 'arm-none-eabi-gdb-wasm';

const [path = fileURLToPath(new URL('../test/fixtures/cortex-m4-hard.elf', import.meta.url)), port] = process.argv.slice(2);
// GDB's files live in its own memory: the program keeps its name there, at the root.
const program = `/${basename(path)}`;
const server = port && connect(Number(port)).on('error', (error) => {
  // A refused localhost is an AggregateError, for IPv6 and IPv4, with only its code to say why.
  console.error(`GDB server on port ${port}: ${error.message || error.code}`);
  process.exit(1);
});

// GDB reads whole lines, so readline edits each one, with the arrow keys and a history.
const prompt = '(gdb) ';
const terminal = createInterface({ input: process.stdin, output: process.stdout, prompt });
console.log('Type GDB commands, such as "info line main" or "help"; "quit" or Ctrl-D to end.');

const gdb = await startGdb({
  files: { [program]: readFileSync(path) },
  args: ['-nx', '-q', program],
  // GDB prints its prompt when it waits for a command: readline shows it instead, to edit after it.
  onStdout: (text) => {
    const waiting = text.endsWith(prompt);
    process.stdout.write(waiting ? text.slice(0, -prompt.length) : text);
    if (waiting) terminal.prompt();
  },
  // GDB's remote protocol, both ways between /dev/remote and the server.
  onRemote: (bytes) => server?.write(bytes),
});
server?.on('data', (bytes) => gdb.remote(bytes));

terminal
  .on('line', (line) => gdb.stdin(`${line}\n`))
  .on('SIGINT', () => terminal.close())
  .on('close', () => gdb.stdin('quit\n'));

process.exit(await gdb.exited);
