FROM emscripten/emsdk:3.1.10
ENV PYTHONUNBUFFERED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
          libgeos-dev ed \
          automake autoconf libtool \
          pkg-config wget xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# signalsmith-audio-basics needs CMake >= 3.24; the emsdk image ships 3.16.
RUN pip3 install cmake==3.28.3
WORKDIR /code

# From /code, build.sh resolves ../libsndfile-emscripten to /libsndfile-emscripten.
COPY build_libsndfile.sh emsdk-env.sh ./
# a+rwX on the cache lets the build run as the host user, so ./dist is not root-owned.
RUN ./build_libsndfile.sh \
    && chmod -R a+rwX /emsdk/upstream/emscripten/cache
