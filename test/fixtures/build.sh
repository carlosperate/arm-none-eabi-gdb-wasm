#!/usr/bin/env bash
# Rebuilds the test programs, checked in so the tests need no Arm compiler. Made with
# arm-none-eabi-gcc from Arm GNU Toolchain 12.3.Rel1.
set -euxo pipefail
cd "$(dirname "$0")"

# The prefix map keeps this folder's absolute path out of the debug information.
FLAGS="-g -O0 -nostdlib -Wl,-e,main -fdebug-prefix-map=$PWD=."
arm-none-eabi-gcc -mcpu=cortex-m0plus -mthumb $FLAGS -o cortex-m0plus.elf program.c
arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb $FLAGS -o cortex-m3.elf program.c
arm-none-eabi-gcc -mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard $FLAGS -o cortex-m4-hard.elf program.c
arm-none-eabi-gcc -mcpu=cortex-m33 -mthumb $FLAGS -o cortex-m33.elf program.c
arm-none-eabi-gcc -mcpu=cortex-m55 -mthumb -mfloat-abi=hard $FLAGS -o cortex-m55-hard.elf program.c
arm-none-eabi-gcc -mcpu=cortex-r5 -marm -mbig-endian $FLAGS -o cortex-r5-be8.elf program.c
arm-none-eabi-gcc -mcpu=cortex-a7 -mthumb $FLAGS -o cortex-a7-thumb.elf program.c
arm-none-eabi-gcc -mcpu=cortex-a53 -marm $FLAGS -o cortex-a53.elf program.c
