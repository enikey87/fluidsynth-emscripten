#!/usr/bin/env python3
"""Writes level.sf2, level.sf3 and drums.sf2: looped sines as SF2 and SF3.

level.*: the same two looped sines as PCM and as Ogg Vorbis. Program 0 peaks at 0.25
in both files. Program 1 peaks at 1.0 in the sf2 and at 1.5 in the sf3, which only a
float codec can hold. Needs ffmpeg with libvorbis.

drums.sf2: one preset on bank 128, the GM drum-kit bank, so drum-typed channels
have a kit to land on (VintageDreamsWaves stores its kits elsewhere).
"""
import math
import pathlib
import struct
import subprocess

RATE = 22050
FRAMES = 4000
PERIOD = 50  # 441 Hz, close enough to A4 for original pitch 69
LOOP = (1000, 3000)
HERE = pathlib.Path(__file__).parent


def sine(amplitude):
    return [amplitude * math.sin(2 * math.pi * i / PERIOD) for i in range(FRAMES)]


def pcm(samples):
    return b''.join(struct.pack('<h', max(-32768, min(32767, round(v * 32767)))) for v in samples)


def vorbis(samples):
    raw = b''.join(struct.pack('<f', v) for v in samples)
    cmd = ['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0',
           '-c:a', 'libvorbis', '-q:a', '8', '-bitexact', '-f', 'ogg', 'pipe:1']
    return subprocess.run(cmd, input=raw, stdout=subprocess.PIPE, check=True).stdout


def chunk(tag, body):
    return tag + struct.pack('<I', len(body)) + body + (b'\0' if len(body) % 2 else b'')


def name(text, size=20):
    return text.encode().ljust(size, b'\0')


def soundfont(blobs, compressed, bank=0):
    smpl, headers, offset = b'', b'', 0
    for index, blob in enumerate(blobs):
        if compressed:
            start, end, loop = offset, offset + len(blob), LOOP
            offset += len(blob)
            smpl += blob
        else:
            start, end = offset, offset + FRAMES
            loop = (start + LOOP[0], start + LOOP[1])
            offset += FRAMES + 46
            smpl += blob + b'\0' * 92
        headers += name(f'sine{index}') + struct.pack('<IIIIIBbHH', start, end, loop[0], loop[1], RATE,
                                                      69, 0, 0, 0x11 if compressed else 1)
    headers += name('EOS') + b'\0' * 26

    count = len(blobs)
    phdr = b''.join(name(f'level{i}') + struct.pack('<HHHIII', i, bank, i, 0, 0, 0) for i in range(count))
    phdr += name('EOP') + struct.pack('<HHHIII', 0, 0, count, 0, 0, 0)
    bags = b''.join(struct.pack('<HH', i, 0) for i in range(count + 1))
    pgen = b''.join(struct.pack('<HH', 41, i) for i in range(count)) + struct.pack('<HH', 0, 0)
    inst = b''.join(name(f'level{i}') + struct.pack('<H', i) for i in range(count))
    inst += name('EOI') + struct.pack('<H', count)
    igen = b''.join(struct.pack('<HH', 54, 1) + struct.pack('<HH', 53, i) for i in range(count))
    igen += struct.pack('<HH', 0, 0)
    ibag = b''.join(struct.pack('<HH', i * 2, 0) for i in range(count + 1))
    mod = b'\0' * 10

    info = chunk(b'ifil', struct.pack('<HH', 3 if compressed else 2, 1 if not compressed else 0))
    info += chunk(b'isng', b'EMU8000\0') + chunk(b'INAM', b'level fixture\0')
    pdta = b''.join(chunk(tag, body) for tag, body in [
        (b'phdr', phdr), (b'pbag', bags), (b'pmod', mod), (b'pgen', pgen),
        (b'inst', inst), (b'ibag', ibag), (b'imod', mod), (b'igen', igen), (b'shdr', headers)])
    body = b'sfbk' + chunk(b'LIST', b'INFO' + info) + chunk(b'LIST', b'sdta' + chunk(b'smpl', smpl))
    body += chunk(b'LIST', b'pdta' + pdta)
    return chunk(b'RIFF', body)


(HERE / 'level.sf2').write_bytes(soundfont([pcm(sine(0.25)), pcm(sine(1.0))], compressed=False))
(HERE / 'level.sf3').write_bytes(soundfont([vorbis(sine(0.25)), vorbis(sine(1.5))], compressed=True))
(HERE / 'drums.sf2').write_bytes(soundfont([pcm(sine(0.5))], compressed=False, bank=128))
