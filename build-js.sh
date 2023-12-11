#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

cd ../emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd ../fluidsynth-emscripten
mkdir -p build
cd build
emcmake cmake -Denable-oss=off -DCMAKE_BUILD_TYPE=Release ..
emmake make
