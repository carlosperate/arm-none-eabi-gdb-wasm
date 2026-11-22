#!/usr/bin/env bash
# Runs inside the Dockerfile's image: GMP, MPFR, expat, then GDB for arm-none-eabi, from the pinned
# submodules in sources/, unpatched, linked once as WebAssembly for web workers and Node alike.
# Builds from zero on the container's own disk; /proj is this repository, whose dist/ gets GDB.
set -euxo pipefail

PREFIX=/tmp/build/prefix
export MAKEFLAGS="-j$(nproc)"

# Wasm exceptions, since GDB reports every error by throwing. No -pthread anywhere.
export CFLAGS="-O2 -fwasm-exceptions -sSUPPORT_LONGJMP=wasm"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-fwasm-exceptions -sSUPPORT_LONGJMP=wasm"

# Copies, since bootstrapping and building write into the source trees.
mkdir /tmp/build
cp -a /proj/sources/{binutils-gdb,gmp,mpfr} /proj/sources/libexpat/expat /tmp/build

# Each library's bootstrap script makes the configure script its repository does not commit.
cd /tmp/build/gmp
./.bootstrap
emconfigure ./configure --prefix="$PREFIX" --disable-shared --enable-static \
  --host none --disable-assembly CC_FOR_BUILD=gcc
emmake make install MAKEINFO=true

cd /tmp/build/mpfr
./autogen.sh
emconfigure ./configure --prefix="$PREFIX" --disable-shared --enable-static \
  --with-gmp="$PREFIX"
emmake make install MAKEINFO=true

cd /tmp/build/expat
./buildconf.sh
emconfigure ./configure --prefix="$PREFIX" --disable-shared --enable-static \
  --without-docbook --without-examples --without-tests --without-xmlwf
emmake make install MAKEINFO=true

mkdir /tmp/build/build-gdb
cd /tmp/build/build-gdb
# A real cross build, so build-time tools such as bfd's chew are compiled natively and can run.
emconfigure /tmp/build/binutils-gdb/configure --prefix="$PREFIX" --target=arm-none-eabi \
  --build="$(gcc -dumpmachine)" --host=wasm32-unknown-emscripten \
  --disable-nls --disable-werror --disable-threading --disable-source-highlight --disable-tui --disable-sim \
  --disable-libctf --disable-libbacktrace --without-python --without-guile --without-debuginfod --without-xxhash \
  --without-lzma --without-zstd --without-babeltrace --without-intel-pt \
  --with-gmp="$PREFIX" --with-mpfr="$PREFIX" --with-expat --with-libexpat-prefix="$PREFIX"

# Answers for the configure scripts make runs next. Readline's probe misses Emscripten's POSIX
# signals, and Emscripten declares psignal, which libiberty must not define again.
export bash_cv_signal_vintage=posix ac_cv_func_psignal=yes
# The pthread probe gives Clang -pthread, which cannot link here; Emscripten's libc has
# single-threaded pthreads, from -lpthread.
export ax_cv_PTHREAD_CLANG=no PTHREAD_LIBS=-lpthread
# GDB's final link takes these from LOADLIBES. Classic rather than an ES module: VS Code's web
# worker shim loads workers with importScripts, and Node can require it. JSPI lets GDB's poll()
# wait on JavaScript without threads or Asyncify.
export LOADLIBES="-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sSTACK_SIZE=8MB -sEXIT_RUNTIME=1 \
  -sENVIRONMENT=web,worker,node -sMODULARIZE=1 -sEXPORT_NAME=createGdb -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS -sJSPI -sJSPI_EXPORTS=main"
emmake make all-gdb MAKEINFO=true

mkdir -p /proj/dist
cp gdb/gdb /proj/dist/gdb.js
cp gdb/gdb.wasm /proj/dist/gdb.wasm
ls -l /proj/dist
gzip -9 -c gdb/gdb.wasm | wc -c
