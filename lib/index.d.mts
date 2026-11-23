/** What `dist/gdb.js` defines: Emscripten's factory for GDB. */
export type CreateGdb = (options: object) => Promise<unknown>;

export type GdbOptions = {
    /** `dist/gdb.js`'s export, which the caller loads: `importScripts` in a classic worker, `require` in Node. */
    createGdb: CreateGdb;
    /** `dist/gdb.wasm`, as bytes or compiled. */
    wasm: ArrayBuffer | ArrayBufferView | WebAssembly.Module;
    /** Written into GDB's file system before it starts, as `{ '/program.elf': elf }`. */
    files?: Record<string, Uint8Array | string>;
    /** GDB's command line, without the program's name, as `['--interpreter=mi2', '-nx', '-q']`. */
    args?: readonly string[];
    /** GDB's output as it writes it, which can stop mid-line, as its prompt does; the console when absent. */
    onStdout?: (text: string) => void;
    onStderr?: (text: string) => void;
    /** What GDB writes to `/dev/remote`, its remote connection after `target remote /dev/remote`, for the GDB server. */
    onRemote?: (bytes: Uint8Array) => void;
};

export type Gdb = {
    /** Text for GDB's standard input, such as an MI command and its newline. */
    stdin(text: string): void;
    /** Bytes from the GDB server, which GDB reads from `/dev/remote`. */
    remote(bytes: Uint8Array): void;
    /** GDB's exit status once it exits; rejects if GDB crashes. */
    exited: Promise<number>;
};

/** Whether this host has WebAssembly JSPI, which GDB needs: worth knowing before fetching the wasm. */
export function hasJspi(): boolean;

/** Starts GDB, and throws at once on a host without JSPI. */
export function startGdb(options: GdbOptions): Promise<Gdb>;
