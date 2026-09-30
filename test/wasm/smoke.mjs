// Loads every dist/ variant the way consumers do and checks what the C unit tests cannot:
// the export contract, sf2/sf3 loading, rendering, JS callbacks and the MIDI player.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const base = path.basename(pkg.main, '.js')
const dist = path.join(root, 'dist')
const sf2 = readFileSync(path.join(root, 'sf2', 'VintageDreamsWaves-v2.sf2'))
const sf3 = readFileSync(path.join(root, 'sf2', 'VintageDreamsWaves-v2.sf3'))
// fixtures/make-level-fixture.py: program 0 peaks at 0.25, program 1 at 1.0 (1.5 inside the sf3's Ogg stream).
const levelSf2 = readFileSync(path.join(root, 'test', 'wasm', 'fixtures', 'level.sf2'))
const levelSf3 = readFileSync(path.join(root, 'test', 'wasm', 'fixtures', 'level.sf3'))
const exportsTxt = readFileSync(path.join(root, 'emscripten', 'exports.txt'), 'utf8')
const expectedExports = [...exportsTxt.matchAll(/"(_[A-Za-z0-9_]+)"/g)].map(m => m[1])
const runtimeMethods = ['ccall', 'cwrap', 'FS', 'addFunction', 'removeFunction', 'MEMFS',
  'lengthBytesUTF8', 'UTF8ArrayToString', 'UTF8ToString', 'stringToUTF8Array', 'stringToUTF8',
  'HEAP32', 'HEAPU8', 'HEAPF32']

// Release variants only: the debug ones are built with ASSERTIONS=1 and abort under node
// ("node environment detected but not enabled at build time").
const suffixes = ['', '-all-in-one', '-sf3', '-sf3-all-in-one']

const FRAMES = 4096
const FLUID_ERR = 1
const FLUID_PLAYER_DONE = 3

function assert (cond, msg) {
  if (!cond) throw new Error(msg)
}

function cstr (M, s) {
  const n = M.lengthBytesUTF8(s) + 1
  const ptr = M._malloc(n)
  M.stringToUTF8(s, ptr, n)
  return ptr
}

function energy (M, synth, frames = FRAMES) {
  const l = M._malloc(frames * 4)
  const r = M._malloc(frames * 4)
  M._fluid_synth_write_float(synth, frames, l, 0, 1, r, 0, 1)
  let e = 0
  for (const v of new Float32Array(M.HEAPF32.buffer, l, frames)) e += v * v
  M._free(l)
  M._free(r)
  return e
}

// Reverb and chorus off, so all_sounds_off leaves true silence instead of an effect tail.
function newSynth (M) {
  const settings = M._new_fluid_settings()
  for (const key of ['synth.reverb.active', 'synth.chorus.active']) {
    const k = cstr(M, key)
    M._fluid_settings_setint(settings, k, 0)
    M._free(k)
  }
  return { settings, synth: M._new_fluid_synth(settings) }
}

function deleteSynth (M, { settings, synth }) {
  M._delete_fluid_synth(synth)
  M._delete_fluid_settings(settings)
}

function loadSoundfont (M, synth, name, bytes) {
  M.FS.writeFile('/' + name, bytes)
  const p = cstr(M, '/' + name)
  const id = M._fluid_synth_sfload(synth, p, 1)
  M._free(p)
  return id
}

// Format 0, one track: note on C4, note off 96 ticks later, end of track.
function smf () {
  const track = [0x00, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00]
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
  ])
}

const checks = {
  exports (M) {
    const missing = expectedExports.filter(k => typeof M[k] !== 'function')
    assert(missing.length === 0, `missing exports: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`)
    const gone = runtimeMethods.filter(k => !(k in M))
    assert(gone.length === 0, `missing runtime methods: ${gone.join(', ')}`)
    return `${expectedExports.length} exports`
  },

  sf2 (M) {
    const s = newSynth(M)
    const id = loadSoundfont(M, s.synth, 'test.sf2', sf2)
    assert(id >= 0, `sfload(.sf2) returned ${id}`)
    M._fluid_synth_program_select(s.synth, 0, id, 0, 0)
    M._fluid_synth_noteon(s.synth, 0, 60, 100)
    const loud = energy(M, s.synth)
    assert(loud > 1e-3, `no sound after noteon: energy ${loud}`)
    M._fluid_synth_noteoff(s.synth, 0, 60)
    M._fluid_synth_all_sounds_off(s.synth, -1)
    const quiet = energy(M, s.synth)
    assert(quiet < 1e-9, `sound after all_sounds_off: energy ${quiet}`)
    deleteSynth(M, s)
    return `energy ${loud.toExponential(1)} → ${quiet.toExponential(1)}`
  },

  sf3 (M, variant) {
    const s = newSynth(M)
    const id = loadSoundfont(M, s.synth, 'test.sf3', sf3)
    let result
    if (variant.sf3) {
      assert(id >= 0, `sfload(.sf3) returned ${id} on an sf3 build`)
      M._fluid_synth_program_select(s.synth, 0, id, 0, 0)
      M._fluid_synth_noteon(s.synth, 0, 60, 100)
      const loud = energy(M, s.synth)
      assert(loud > 1e-3, `no sound from .sf3: energy ${loud}`)
      result = `loaded, energy ${loud.toExponential(1)}`
    } else {
      assert(id === -1, `sfload(.sf3) returned ${id} on a build without libsndfile`)
      result = 'rejected as expected'
    }
    deleteSynth(M, s)
    return result
  },

  // An Ogg sample must play as loud as its PCM twin: neither lifted to full scale nor clipped.
  level (M, variant) {
    if (!variant.sf3) return 'n/a without sf3'
    const frames = 22050
    const rms = (name, bytes, program) => {
      const s = newSynth(M)
      const id = loadSoundfont(M, s.synth, name, bytes)
      assert(M._fluid_synth_program_select(s.synth, 0, id, 0, program) === 0, `${name}: no program ${program}`)
      M._fluid_synth_noteon(s.synth, 0, 69, 100)
      const value = Math.sqrt(energy(M, s.synth, frames) / frames)
      deleteSynth(M, s)
      return value
    }
    const deltas = [0, 1].map(program => {
      const pcm = rms('level.sf2', levelSf2, program)
      assert(pcm > 1e-3, `level.sf2 program ${program} is silent`)
      return 20 * Math.log10(rms('level.sf3', levelSf3, program) / pcm)
    })
    deltas.forEach((delta, program) => assert(Math.abs(delta) < 0.5, `program ${program}: sf3 is ${delta.toFixed(2)} dB off its sf2 twin`))
    return `quiet ${deltas[0].toFixed(2)} dB, loud ${deltas[1].toFixed(2)} dB`
  },

  callback (M) {
    let calls = 0
    const fn = M.addFunction((level, msg) => { calls += 1 }, 'viii')
    const previous = M._fluid_set_log_function(FLUID_ERR, fn, 0)
    const s = newSynth(M)
    const p = cstr(M, '/does-not-exist.sf2')
    M._fluid_synth_sfload(s.synth, p, 1)
    M._free(p)
    deleteSynth(M, s)
    M._fluid_set_log_function(FLUID_ERR, previous, 0)
    M.removeFunction(fn)
    assert(calls > 0, 'log callback registered through addFunction was never called')
    return `${calls} call(s)`
  },

  player (M) {
    const s = newSynth(M)
    const id = loadSoundfont(M, s.synth, 'test.sf2', sf2)
    assert(id >= 0, `sfload returned ${id}`)
    const player = M._new_fluid_player(s.synth)
    const bytes = smf()
    const p = M._malloc(bytes.length)
    M.HEAPU8.set(bytes, p)
    assert(M._fluid_player_add_mem(player, p, bytes.length) === 0, 'fluid_player_add_mem failed')
    M._free(p)
    assert(M._fluid_player_play(player) === 0, 'fluid_player_play failed')
    let loud = 0
    let blocks = 0
    while (M._fluid_player_get_status(player) !== FLUID_PLAYER_DONE && blocks < 200) {
      loud = Math.max(loud, energy(M, s.synth))
      blocks += 1
    }
    const tick = M._fluid_player_get_current_tick(player)
    assert(M._fluid_player_get_status(player) === FLUID_PLAYER_DONE, `player not done after ${blocks} blocks`)
    assert(tick > 0, `player tick did not advance (${tick})`)
    assert(loud > 1e-3, `player produced no sound: energy ${loud}`)
    M._delete_fluid_player(player)
    deleteSynth(M, s)
    return `done after ${blocks} blocks, tick ${tick}`
  },

  // The three 2.6 knobs consumers may turn: each must change the rendered audio.
  knobs (M) {
    const NOTE_ON = (M, synth) => { M._fluid_synth_program_select(synth, 0, 1, 0, 0); M._fluid_synth_noteon(synth, 0, 60, 127) }
    const render = (settingsFn, synthFn) => {
      const settings = M._new_fluid_settings()
      settingsFn(settings)
      const synth = M._new_fluid_synth(settings)
      if (synthFn) synthFn(synth)
      loadSoundfont(M, synth, 'test.sf2', sf2)
      NOTE_ON(M, synth)
      const frames = 8192
      const l = M._malloc(frames * 4)
      const r = M._malloc(frames * 4)
      M._fluid_synth_write_float(synth, frames, l, 0, 1, r, 0, 1)
      const out = Float32Array.from(new Float32Array(M.HEAPF32.buffer, l, frames))
      M._free(l)
      M._free(r)
      M._delete_fluid_synth(synth)
      M._delete_fluid_settings(settings)
      return out
    }
    const setStr = (settings, key, value) => { const k = cstr(M, key); const v = cstr(M, value); M._fluid_settings_setstr(settings, k, v); M._free(k); M._free(v) }
    const setInt = (settings, key, value) => { const k = cstr(M, key); M._fluid_settings_setint(settings, k, value); M._free(k) }
    const setNum = (settings, key, value) => { const k = cstr(M, key); M._fluid_settings_setnum(settings, k, value); M._free(k) }
    const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-6)
    const peak = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

    const dat = render(s => setStr(s, 'synth.reverb.engine', 'dat'))
    const fdn = render(s => setStr(s, 'synth.reverb.engine', 'fdn'))
    assert(differs(dat, fdn), 'synth.reverb.engine=fdn renders the same audio as dat')

    const loud = s => { setNum(s, 'synth.gain', 10) }
    const unlimited = render(loud)
    const limited = render(s => { loud(s); setInt(s, 'synth.limiter.active', 1) })
    assert(peak(unlimited) > 1, `gain 10 without a limiter should clip: peak ${peak(unlimited)}`)
    assert(peak(limited) <= 1.0001 && peak(limited) < peak(unlimited), `limiter left peak at ${peak(limited)} (unlimited ${peak(unlimited)})`)

    const interp4 = render(() => {}, synth => M._fluid_synth_set_interp_method(synth, -1, 4))
    const interp5 = render(() => {}, synth => M._fluid_synth_set_interp_method(synth, -1, 5))
    assert(differs(interp4, interp5), 'FLUID_INTERP_MID renders the same audio as 4th order')
    return `reverb fdn≠dat, limiter peak ${peak(unlimited).toFixed(2)}→${peak(limited).toFixed(2)}, interp 5≠4`
  },

  leak (M) {
    for (let i = 0; i < 10; i++) deleteSynth(M, newSynth(M))
    const before = M.HEAPU8.byteLength
    for (let i = 0; i < 50; i++) deleteSynth(M, newSynth(M))
    const after = M.HEAPU8.byteLength
    assert(after === before, `heap grew from ${before} to ${after} over 50 synth create/delete cycles`)
    return `heap stable at ${before}`
  },
}

async function instantiate (variant) {
  const { default: factory } = await import(path.join(dist, `${base}${variant.suffix}.js`))
  const options = variant.wasm ? { wasmBinary: readFileSync(path.join(dist, variant.wasm)) } : {}
  return factory(options)
}

let failures = 0
for (const suffix of suffixes) {
  const variant = {
    suffix,
    sf3: suffix.includes('sf3'),
    wasm: suffix.includes('all-in-one') ? null : `${base}${suffix}.wasm`,
  }
  const label = `${base}${suffix}.js`
  let M
  try {
    const t = Date.now()
    M = await instantiate(variant)
    console.log(`${label}: instantiated in ${Date.now() - t} ms`)
  } catch (e) {
    failures += 1
    console.log(`${label}: FAIL instantiate — ${e.message}`)
    continue
  }
  for (const [name, check] of Object.entries(checks)) {
    try {
      console.log(`  ok   ${name}: ${check(M, variant)}`)
    } catch (e) {
      failures += 1
      console.log(`  FAIL ${name}: ${e.message}`)
    }
  }
}

console.log(failures === 0 ? 'all wasm smoke checks passed' : `${failures} wasm smoke check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
