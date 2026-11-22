# arm-none-eabi-gdb-wasm

This project takes upstream GNU GDB and compiles it for `arm-none-eabi` to WebAssembly.

It debugs any bare-metal 32-bit Arm program (Cortex-M, Cortex-R, and Cortex-A in AArch32)
over GDB's remote protocol in a browser or Node.
Not built for 64-bit Arm or Arm Linux programs.

## Getting the source

GDB and the three libraries it needs are git submodules in `sources/`, each pinned to its release.
They are marked shallow in `.gitmodules`, so a clone fetches only the pinned commit, not the decades
of history in GDB's repository:

```sh
git clone --recurse-submodules https://github.com/carlosperate/arm-none-eabi-gdb-wasm.git
```

## Building

In Docker, with the image this repository describes:

```sh
docker build -t arm-none-eabi-gdb-wasm .
docker run --rm -v "$PWD":/proj arm-none-eabi-gdb-wasm bash /proj/build.sh
```

The build writes `dist/gdb.js` and `dist/gdb.wasm`, about 6 MB of WebAssembly, 2.2 MB gzipped.

None of the upstream sources are patched.
GDB is built without Python, the text UI, threads, the simulator and the other options a browser
cannot use, and links once for both web workers and Node.
Running it needs WebAssembly JavaScript Promise Integration (JSPI), which lets GDB wait for
input without threads, and WebAssembly's standard exception handling,
so it requires Chrome/Edge 137+, Safari 27+, Firefox 153+,
or Node 24 with `--experimental-wasm-jspi --experimental-wasm-exnref`.
