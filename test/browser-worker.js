// GDB in a classic worker, as VS Code Web runs it: gdb.js by importScripts, the loader by import().
importScripts('../dist/gdb.js');

const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

(async () => {
  try {
    const { startGdb } = await import('../lib/index.mjs');
    const gdb = await startGdb({
      createGdb,
      wasm: await bytes('../dist/gdb.wasm'),
      files: { '/program.elf': await bytes('fixtures/cortex-m4-hard.elf') },
      args: ['-nx', '-batch', '/program.elf', '-ex', 'info line add_one', '-ex', 'x/i main', '-ex', 'show version'],
      onStdout: (line) => postMessage(line),
      onStderr: (line) => postMessage(line),
    });
    postMessage(`GDB exited with status ${await gdb.exited}`);
  } catch (error) {
    postMessage(`Failed: ${error.message}`);
  }
})();
