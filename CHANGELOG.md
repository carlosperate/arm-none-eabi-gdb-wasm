# Changelog

## 17.2.0-alpha.1 - 2026/11/26

- First release: GNU GDB 17.2 for `arm-none-eabi`, compiled to WebAssembly with Emscripten 6.0.13
  and no source patch, with GMP 6.3.0, MPFR 4.2.2 and Expat 2.10.0. One build runs in a browser's
  workers and in Node.
- `startGdb()` runs it on your program and command line, with its standard input, its output and its
  remote connection to a GDB server, and `hasJspi()` says whether the host can. In Node it loads
  GDB's files itself; in a browser the page passes them. GDB's output arrives as it is written,
  its prompt included, and is never paged.
- `example/` holds GDB's console for a terminal and for a page.
- Each GitHub release carries the source of GDB and the three libraries, as built.
