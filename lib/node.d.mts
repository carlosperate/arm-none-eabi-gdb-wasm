import type { Gdb, GdbOptions } from './index.mjs';

export * from './index.mjs';

/**
 * Starts GDB from the package's own `dist/gdb.js` and `dist/gdb.wasm`, unless the options give
 * others. Its output goes to this process's stdout and stderr when no callback takes it.
 */
export function startGdb(options?: Partial<GdbOptions>): Promise<Gdb>;
