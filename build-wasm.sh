#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Check if the emsdk directory does not exist
if [ ! -d "../emsdk" ]; then
    # Clone the emsdk repository into the parent directory
    git clone https://github.com/emscripten-core/emsdk.git ../emsdk
fi

cd ../emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../fluidsynth-emscripten
rm -rf build
mkdir -p build

# debug
#

if [ -n "$DEBUG" ]; then
  echo "Configure CMake projects for Debug"
  emcmake cmake -B build -Denable-oss=off  -Denable-separate-wasm=on -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1 -s" -DCMAKE_CXX_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1" .
else
  echo "Configure CMake projects for Release"
  emcmake cmake -B build -Denable-oss=off -Denable-separate-wasm=on -DCMAKE_BUILD_TYPE=Release .
fi

emmake make -C build
