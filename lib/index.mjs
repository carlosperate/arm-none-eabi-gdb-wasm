// Starts GDB from the caller's createGdb and wasm, since each host loads the classic gdb.js its own
// way. Its stdin and its serial line are devices whose poll() wakes it (Emscripten's async poll
// under JSPI), so GDB waits on JavaScript without threads.

const POLLIN = 1, POLLOUT = 4, EAGAIN = 6;

export function hasJspi() {
  const wasm = globalThis.WebAssembly;
  return typeof wasm?.Suspending === 'function' && typeof wasm?.promising === 'function';
}

export async function startGdb({ createGdb, wasm, files = {}, args = [], onStdout, onStderr, onSerial = () => {} }) {
  if (!hasJspi()) {
    throw new Error('GDB needs WebAssembly JavaScript Promise Integration (JSPI), which this host lacks. ' +
      'Node 24 needs --experimental-wasm-jspi and --experimental-wasm-exnref.');
  }
  // In Node, Emscripten gives GDB's exit status to the host's process too, right after onExit.
  let hostExitCode = globalThis.process?.exitCode;
  // Emscripten never hears of a failed asynchronous instantiation, so the failure ends the race.
  let failed;
  const failure = new Promise((_, reject) => { failed = reject; });
  const Module = await Promise.race([failure, createGdb({
    print: onStdout,
    printErr: onStderr,
    onExit: () => { hostExitCode = globalThis.process?.exitCode; },
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasm, imports).then((result) => done(result.instance ?? result)).catch(failed);
      return {};
    },
  })]);

  const { FS } = Module;
  for (const [path, data] of Object.entries(files)) {
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/') + 1));
    FS.writeFile(path, data);
  }
  const remote = device(FS, '/dev/remote', 64, onSerial);
  const input = device(FS, '/dev/input', 65, () => {});
  FS.close(FS.getStream(0));
  FS.open('/dev/input', 0);

  // A copy, since callMain puts the program's name in front of the array it gets.
  const exited = Promise.resolve(Module.callMain([...args])).finally(() => {
    if (globalThis.process) globalThis.process.exitCode = hostExitCode;
  });
  const encoder = new TextEncoder();
  return {
    stdin: (text) => input.push(encoder.encode(text)),
    serial: (bytes) => remote.push(bytes),
    exited,
  };
}

// A character device whose reads never block: poll() tells GDB when there is data.
function device(FS, path, major, onWrite) {
  const queue = [];
  const id = FS.makedev(major, 0);
  FS.registerDevice(id, {
    open() {},
    close() {},
    read(stream, buffer, offset, length) {
      if (!queue.length) throw new FS.ErrnoError(EAGAIN);
      const bytes = queue.splice(0, length);
      buffer.set(bytes, offset);
      return bytes.length;
    },
    // The buffer is Emscripten's signed view of memory, so the bytes are copied out unsigned.
    write(stream, buffer, offset, length) {
      onWrite(new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length).slice());
      return length;
    },
    poll: () => (queue.length ? POLLIN : 0) | POLLOUT,
  });
  FS.mkdev(path, 0o666, id);
  const node = FS.lookupPath(path).node;
  return {
    push(bytes) {
      for (const byte of bytes) queue.push(byte);
      node.notifyListeners(POLLIN);
    },
  };
}
