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

# Function to compile libfluidsynth with specified flags and output suffix
compile_libfluidsynth() {
  local suffix="$1"
  local extra_cmake_flags="$2"
  local extra_c_flags="$3"
  local extra_cxx_flags="${4:-$3}" # Use extra_c_flags if extra_cxx_flags is not provided

  echo "Building libfluidsynth with suffix: $suffix"

  # Clean emscripten build dir
  rm -rf build
  mkdir -p build

  # Configure CMake projects based on DEBUG environment variable
  if [ -n "$DEBUG" ]; then
    echo "Configure CMake projects for Debug"
    local c_debug_flags="-Wbad-function-cast -Wcast-function-type -g4 -sSAFE_HEAP=1 -sASSERTIONS=1"
    emcmake cmake -B build -Denable-oss=off ${extra_cmake_flags} -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS="${c_debug_flags} ${extra_c_flags}" -DCMAKE_CXX_FLAGS="${c_debug_flags} ${extra_cxx_flags}" .
  else
    echo "Configure CMake projects for Release"
    emcmake cmake -B build -Denable-oss=off ${extra_cmake_flags} -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS="${extra_c_flags}" -DCMAKE_CXX_FLAGS="${extra_cxx_flags}" .
  fi

  # Build the project
  emmake make -C build

  # Replace the hardcoded .wasm filename with the variant
  sed -i "s/libfluidsynth-2.3.0.wasm/libfluidsynth-2.3.0${suffix}.wasm/g" build/src/libfluidsynth-2.3.0.js

  # Move the artifacts to the dist folder with the specified suffix
  cp build/src/libfluidsynth-2.3.0.js "dist/libfluidsynth-2.3.0${suffix}.js"
  [ -f build/src/libfluidsynth-2.3.0.wasm ] && cp build/src/libfluidsynth-2.3.0.wasm "dist/libfluidsynth-2.3.0${suffix}.wasm"
  echo "*** BUILD VARIANT FOR SUFFIX '${suffix}' COMPLETE *** "
}

# Prepare output folder
rm -rf dist
mkdir -p dist

function compile_libfluidsynth_configurations () {
  DEBUG=0

  # Build RELEASE variants
  compile_libfluidsynth "${LIBFLUIDSYNTH_OUTPUT_FILENAME_PREFIX}" "-Denable-separate-wasm=on" "-s EXPORT_ES6=1" # ES6 + WASM
  compile_libfluidsynth "${LIBFLUIDSYNTH_OUTPUT_FILENAME_PREFIX}-all-in-one" "-Denable-separate-wasm=off" "-s EXPORT_ES6=1" # ES6 + INLINE WASM

  # temporary disable building of debug artifacts
  return 0

  compile_libfluidsynth "${LIBFLUIDSYNTH_OUTPUT_FILENAME_PREFIX}-debug" "-Denable-separate-wasm=on" "-s EXPORT_ES6=1" # ES6 + WASM
  compile_libfluidsynth "${LIBFLUIDSYNTH_OUTPUT_FILENAME_PREFIX}-all-in-one-debug" "-Denable-separate-wasm=off" "-s EXPORT_ES6=1" # ES6 + INLINE WASM
}

# Configuration without sf3 support
compile_libfluidsynth_configurations

# Configuration with sf3 support though libsndfile addon
LIBFLUIDSYNTH_DEPS_PKG_CONFIG_PATH=$(readlink -f ../libsndfile-emscripten/deps/lib/pkgconfig)

if [ ! -d "$LIBFLUIDSYNTH_DEPS_PKG_CONFIG_PATH" ]; then
    echo "Error: libsndfile artifacts directory '$LIBFLUIDSYNTH_DEPS_PKG_CONFIG_PATH' does not exist."
    exit 1
fi

export PKG_CONFIG_PATH=${LIBFLUIDSYNTH_DEPS_PKG_CONFIG_PATH}

LIBFLUIDSYNTH_OUTPUT_FILENAME_PREFIX="-sf3"

compile_libfluidsynth_configurations