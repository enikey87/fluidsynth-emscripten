#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

if command -v emcmake >/dev/null 2>&1; then
    echo "emcmake is available"
    # Proceed with your script that uses emcmake
else
    echo "emcmake is not available"

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
fi

rm -rf build
rm -rf dist

# Build separated wasm file + js file

mkdir -p build
mkdir -p dist

if [ -n "$DEBUG" ]; then
  echo "Configure CMake projects for Debug"
  emcmake cmake -B build -Denable-oss=off  -Denable-separate-wasm=on -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1 -s" -DCMAKE_CXX_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1" .
else
  echo "Configure CMake projects for Release"
  emcmake cmake -B build -Denable-oss=off -Denable-separate-wasm=on -DCMAKE_BUILD_TYPE=Release .
fi

emmake make -C build

cp build/src/libfluidsynth-2.3.0.js dist
cp build/src/libfluidsynth-2.3.0.wasm dist

# Build all-in-one version with wasm code inlined into js

rm -rf build
mkdir -p build

if [ -n "$DEBUG" ]; then
  echo "Configure CMake projects for Debug"
  emcmake cmake -B build -Denable-oss=off -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1 -s" -DCMAKE_CXX_FLAGS="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1" .
else
  echo "Configure CMake projects for Release"
  emcmake cmake -B build -Denable-oss=off -DCMAKE_BUILD_TYPE=Release .
fi

emmake make -C build

cp build/src/libfluidsynth-2.3.0.js dist/libfluidsynth-2.3.0-all-in-one.js
