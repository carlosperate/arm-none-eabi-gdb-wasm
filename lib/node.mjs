// GDB's own files come off the package's disk, so the caller passes neither.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hasJspi, startGdb as start } from './index.mjs';

// Everything but startGdb, which this file's own declaration takes over.
export * from './index.mjs';

export async function startGdb(options = {}) {
  // Without JSPI, the loader's own error comes first, before reading 6 MB for nothing.
  if (!hasJspi()) return start(options);
  let { createGdb, wasm } = options;
  try {
    createGdb ??= createRequire(import.meta.url)('../dist/gdb.js');
    wasm ??= await readFile(new URL('../dist/gdb.wasm', import.meta.url));
  } catch (cause) {
    // A bundle moves this file away from dist/, and empties import.meta when it is CommonJS.
    throw new Error("startGdb() could not load GDB from the package's dist/: a bundled caller " +
      'passes createGdb and wasm.', { cause });
  }
  return start({
    ...options, createGdb, wasm,
    onStdout: options.onStdout ?? ((text) => process.stdout.write(text)),
    onStderr: options.onStderr ?? ((text) => process.stderr.write(text)),
  });
}
