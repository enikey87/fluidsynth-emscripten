#!/bin/bash

TAG=0.0.1
set -e
cd ..
wget https://github.com/enikey87/libsndfile-emscripten/archive/refs/tags/${TAG}.tar.gz -O libsndfile-emscripten.tar.gz
tar xvf libsndfile-emscripten.tar.gz
rm libsndfile-emscripten.tar.gz
mv libsndfile-emscripten-${TAG} libsndfile-emscripten
cd libsndfile-emscripten
./deps.sh
./build.sh
