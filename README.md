# arm-none-eabi-gdb-wasm

This project takes upstream GNU GDB and compiles it for `arm-none-eabi` to WebAssembly.

It debugs any bare-metal 32-bit Arm program (Cortex-M, Cortex-R, and Cortex-A in AArch32)
over GDB's remote protocol in a browser or Node.
Not built for 64-bit Arm or Arm Linux programs.

## Using it

```sh
npm install arm-none-eabi-gdb-wasm
```

In Node:

```js
import { readFileSync } from 'node:fs';
import { startGdb } from 'arm-none-eabi-gdb-wasm';

const gdb = await startGdb({
  files: { '/program.elf': readFileSync('program.elf') },
  args: ['-nx', '-batch', '/program.elf', '-ex', 'info line main'],
});
await gdb.exited;
```

- `files` go into GDB's own file system, in memory.
- `gdb.stdin()` sends commands. GDB's output goes to `onStdout` and `onStderr`, or the console.
- To debug a board, give GDB `target remote /dev/remote`. Its packets come out of `onRemote`, and
  pass the GDB server's replies to `gdb.remote()`.

In a browser, load `dist/gdb.js` with a `<script>` tag or `importScripts()`.
It defines `createGdb`: pass it to `startGdb()` with the bytes of `dist/gdb.wasm`.
Do the same in Node when your code is bundled.

[`example/`](example/) has a GDB console for Node and one for a browser.
For the browser one, run `npm run serve` and open http://localhost:8000/example/browser.html.

It needs WebAssembly JSPI and exception handling: Chrome/Edge 137+, Firefox 153+, Safari 27+,
desktop VS Code 1.103+, or Node 24 run with `--experimental-wasm-jspi --experimental-wasm-exnref`.
`hasJspi()` checks for it before you download 6 MB.

## Building

Clone with sumodules:

```
git clone --recurse-submodules https://github.com/carlosperate/arm-none-eabi-gdb-wasm.git
```

In Docker, with the image this repository describes:

```sh
docker build -t arm-none-eabi-gdb-wasm .
docker run --rm -v "$PWD":/proj arm-none-eabi-gdb-wasm bash /proj/build.sh
```

The build writes `dist/gdb.js` and `dist/gdb.wasm`, about 6 MB of WebAssembly, 2.2 MB gzipped,
and the licence notices in `dist/licenses/`.

None of the upstream sources are patched.
GDB is built without Python, the text UI, threads, the simulator and the other options a browser
cannot use, and links once for both web workers and Node.

## Licences

GDB is free software under the GNU GPL version 3 or later, and the libraries linked into it keep
their own licences. This repository's own code is MIT.
[`LICENSES`](LICENSES) contains all the licence notices, and the package carries them in `dist/licenses/`.
