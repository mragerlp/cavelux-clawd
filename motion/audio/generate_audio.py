"""Original CAVELUX 45-second electronic cue. Numpy + system FFmpeg only.

All instruments and effects are synthesized here; no samples or recordings.
Regenerate with: python generate_audio.py
"""
from pathlib import Path
import json
import math
import subprocess
import wave

import numpy as np

OUT = Path(__file__).resolve().parent
SR = 48000
SECONDS = 45.0
N = int(SR * SECONDS)
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(260929)
music = np.zeros((N, 2), np.float64)
fx = np.zeros_like(music)
padbus = np.zeros_like(music)
pluckbus = np.zeros_like(music)
drumbus = np.zeros_like(music)
cues = []


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def pan_gains(pan):
    a = (pan + 1) * math.pi / 4
    return np.array([math.cos(a), math.sin(a)])


def add(bus, signal, start, gain=1, pan=0):
    i = int(round(start * SR))
    if i >= N or i + len(signal) <= 0:
        return
    if i < 0:
        signal = signal[-i:]
        i = 0
    signal = signal[:N - i]
    if signal.ndim == 1:
        signal = signal[:, None] * pan_gains(pan)[None, :]
    bus[i:i + len(signal)] += gain * signal


def env(t, attack, release, duration):
    return np.minimum(t / attack, 1) ** 1.5 * np.minimum(np.maximum(duration - t, 0) / release, 1) ** 1.5


def synth_pad(notes, duration, color=1):
    t = np.arange(int(duration * SR)) / SR
    channels = []
    for side in (-1, 1):
        y = np.zeros_like(t)
        for k, note in enumerate(notes):
            f = hz(note) * (1 + side * (0.0007 + 0.00012 * k))
            phase = 2 * np.pi * f * t + 0.026 * np.sin(2 * np.pi * (0.21 + k * .06) * t)
            y += np.sin(phase + k * .31)
            y += .20 * color * np.sin(2 * phase + .4)
            y += .073 * color * np.sin(3 * phase + .6)
            y += .025 * color * np.sin(5 * phase)
        y /= len(notes)
        channels.append(y * env(t, .20, .80, duration))
    return np.stack(channels, axis=1)


def pluck(note, duration=.65, bright=1):
    t = np.arange(int(duration * SR)) / SR
    p = 2 * np.pi * hz(note) * t
    y = np.sin(p) * np.exp(-t * 4.6)
    y += .32 * bright * np.sin(2 * p) * np.exp(-t * 10)
    y += .10 * bright * np.sin(3 * p) * np.exp(-t * 14)
    y += .045 * bright * np.sin(5 * p) * np.exp(-t * 20)
    return y * env(t, .003, .16, duration)


def bass(note, duration=.43):
    t = np.arange(int(duration * SR)) / SR
    p = 2 * np.pi * hz(note) * t
    y = np.sin(p) + .23 * np.sin(2 * p) + .07 * np.sin(3 * p)
    return y * env(t, .008, .10, duration) * np.exp(-t * 1.6)


def kick():
    t = np.arange(int(.48 * SR)) / SR
    phase = 2 * np.pi * (46 * t + 69 * .026 * (1 - np.exp(-t / .026)))
    body = np.sin(phase) * np.exp(-t * 10)
    click = .13 * np.sin(2 * np.pi * 1350 * t) * np.exp(-t * 220)
    return (body + click) * env(t, .001, .07, .48)


def noise_band(duration, lo, hi):
    length = int(duration * SR)
    n = RNG.normal(size=length)
    spectrum = np.fft.rfft(n)
    f = np.fft.rfftfreq(length, 1 / SR)
    weight = np.clip((f - lo) / (max(100, lo * .35)), 0, 1)
    weight *= np.clip((hi - f) / (max(500, hi * .20)), 0, 1)
    y = np.fft.irfft(spectrum * weight, n=length)
    return y / (np.std(y) + 1e-9)


def snare():
    t = np.arange(int(.22 * SR)) / SR
    noise = noise_band(.22, 900, 9500)
    body = .50 * np.sin(2 * np.pi * 179 * t) * np.exp(-t * 32)
    body += .20 * np.sin(2 * np.pi * 310 * t) * np.exp(-t * 45)
    return (body + .34 * noise * np.exp(-t * 28)) * env(t, .001, .06, .22)


def hat(opened=False):
    duration = .19 if opened else .065
    t = np.arange(int(duration * SR)) / SR
    noise = noise_band(duration, 5800, 15000)
    return noise * np.exp(-t * (24 if opened else 75)) * env(t, .0008, .022, duration)


def pulse(note, duration=.16):
    t = np.arange(int(duration * SR)) / SR
    p = 2 * np.pi * hz(note) * t
    y = np.sin(p) + .12 * np.sin(3 * p) + .04 * np.sin(5 * p)
    return y * np.sin(np.pi * t / duration) ** 2


def cue(t, label):
    cues.append({"time_seconds": t, "cue": label})


# Four harmonic cells, deliberately voiced to share tones instead of jumping.
# D minor 9 -> B-flat major 9 -> F major 9 -> C add 9.
cells = [
    {"pad": [50, 57, 60, 64, 65], "root": 38, "arp": [74, 77, 81, 84, 88]},
    {"pad": [46, 53, 57, 60, 62], "root": 34, "arp": [74, 77, 81, 84, 86]},
    {"pad": [48, 53, 57, 60, 64], "root": 41, "arp": [72, 77, 81, 84, 88]},
    {"pad": [48, 55, 60, 62, 64], "root": 36, "arp": [72, 76, 79, 84, 86]},
]
stage_names = ["wake", "build", "swarm", "synchronize", "spectrum", "reveal"]
pad_levels = [.19, .19, .20, .24, .30, .24]
arp_levels = [.12, .15, .12, .095, .165, .115]
kick_wave = kick()
snare_wave = snare()
hat_wave = hat()
open_hat = hat(True)

for bar in range(24):
    stage = bar // 4
    local = bar % 4
    start = bar * BAR
    cell = cells[local]
    # End on a stable Dm(add9), rather than leave an unresolved looping chord.
    if bar >= 22:
        cell = cells[0]
    cue(start, f"{stage_names[stage]} / bar {bar + 1}")
    add(padbus, synth_pad(cell["pad"], BAR + .9, 1.12 if stage == 4 else .85), start, pad_levels[stage])

    if stage == 0:
        positions = [0, 2] if local < 2 else [0, 1.5, 2.5, 3.5]
        indexes = [0, 2, 1, 3]
    elif stage == 1:
        positions = [0, .75, 1.5, 2, 2.75, 3.5]
        indexes = [0, 2, 1, 3, 2, 4]
    elif stage == 2:
        positions = list(np.arange(0, 4, .5))
        indexes = [0, 2, 1, 3, 2, 4, 3, 1]
    elif stage == 3:
        positions = [0, .5, 1.5, 2, 2.5, 3.25, 3.5]
        indexes = [0, 2, 3, 1, 2, 4, 3]
    elif stage == 4:
        positions = list(np.arange(0, 4, .5))
        indexes = [0, 2, 1, 3, 2, 4, 3, 2]
    else:
        positions = [0, 1.5, 2.5] if local < 2 else ([0, 2] if local == 2 else [0])
        indexes = [2, 1, 0]

    for j, position in enumerate(positions):
        note = cell["arp"][indexes[j % len(indexes)]]
        if stage == 0:
            note -= 12
        if bar >= 22 and position > 1:
            continue
        gain = arp_levels[stage] * (.76 if j % 2 else 1)
        add(pluckbus, pluck(note, .70, .60 if stage == 0 else .8), start + position * BEAT, gain, .35 * math.sin(j * 1.5 + bar))
        if stage in (2, 4) and j in (3, 7):
            add(pluckbus, pulse(note + 12, .09), start + (position + .25) * BEAT, .020, -.60 if j == 3 else .60)

    if stage != 0 and bar < 22:
        bass_positions = [0, 1.5, 2.5, 3.5] if stage in (2, 4) else [0, 2, 3.5]
        for j, position in enumerate(bass_positions):
            note = cell["root"] + (12 if j == 3 else 0)
            add(music, bass(note, .50 if j == 0 else .32), start + position * BEAT, .30 if stage == 4 else .23)
    elif stage == 0 and local in (0, 2):
        add(music, bass(cell["root"], 1.3), start, .12)
    elif bar >= 22:
        add(music, bass(38, 1.5), start, .18)

    if stage == 0:
        if local >= 2:
            add(drumbus, kick_wave, start, .23)
        continue
    if bar >= 22:
        if bar == 22:
            add(drumbus, kick_wave, start, .31)
        continue
    kick_positions = [0, 2.5] if stage == 3 else [0, 1.5, 2, 3.5]
    if stage == 4:
        kick_positions = [0, 1, 2, 3]
    if stage == 5:
        kick_positions = [0, 2]
    for position in kick_positions:
        add(drumbus, kick_wave, start + position * BEAT, .43 if stage == 4 else .35)
    for position in [1, 3]:
        if stage != 3 or position == 3:
            add(drumbus, snare_wave, start + position * BEAT, .18 if stage == 4 else .14)
    for j in range(8):
        gain = (.037 if j % 2 else .028) * (1.1 if stage == 4 else 1)
        if stage == 3:
            gain *= .65
        add(drumbus, hat_wave, start + j * BEAT / 2, gain, -.16 if j % 2 else .16)
    if stage in (2, 4):
        add(drumbus, open_hat, start + 3.5 * BEAT, .034, .25)
    if local == 3 and stage in (1, 2, 4):
        for j in range(3):
            add(drumbus, snare_wave, start + (3.5 + j * .125) * BEAT, .04 + .012 * j, (j - 1) * .3)

# Small melody returns as an identity; high register gives the full-color release lift.
motif = [(0, 74), (.75, 77), (1.5, 81), (2.5, 76), (3.25, 77)]
for start, level, transpose in [(0.9375, .095, -12), (15.0, .070, 0), (30.0, .13, 0), (33.75, .10, 0)]:
    for offset, note in motif:
        add(pluckbus, pluck(note + transpose, 1.0, .55), start + offset * BEAT, level, .12 * math.sin(note))

# Delays are rhythmic and decay rapidly enough to keep micro-typography cuts precise.
for repeats, gain in [(1, .23), (2, .10), (3, .045)]:
    offset = int(BEAT * .75 * repeats * SR)
    pluckbus[offset:] += gain * pluckbus[:-offset, ::-1].copy()
for delay, gain in [(.061, .18), (.109, .11), (.173, .075), (.293, .045)]:
    offset = int(delay * SR)
    padbus[offset:] += gain * padbus[:-offset, ::-1].copy()

# A restrained breathing envelope makes the big section move without aggressive pumping.
t_all = np.arange(N) / SR
phase = (t_all / BEAT) % 1
pump = 1 - .15 * np.exp(-phase * 12)
pump[(t_all < 7.5) | (t_all >= 41.25)] = 1
music += padbus * pump[:, None] + pluckbus + drumbus

# SFX stem: tactile clicks, harmonic boot signal, spatial data passes and transitions.
cue(0.0, "Soft power-on, two clean harmonic signal notes")
add(fx, pulse(86, .19), .08, .08, -.2)
add(fx, pulse(93, .25), .33, .065, .2)
for start, count in [(7.5, 7), (15.0, 12), (22.5, 8)]:
    for j in range(count):
        duration = .027 + .005 * (j % 3)
        ti = np.arange(int(duration * SR)) / SR
        click = np.sin(2 * np.pi * (1500 + 150 * (j % 4)) * ti) * np.exp(-ti * 180)
        click *= env(ti, .0006, .009, duration)
        add(fx, click, start + .07 + j * .095, .029, -.7 + 1.4 * j / max(count - 1, 1))
    cue(start, "Stereo micro-click sequence / work-state transition")

def airy_rise(start, duration, gain, descending=False):
    ti = np.arange(int(duration * SR)) / SR
    progress = ti / duration
    noise = noise_band(duration, 1800, 10000)
    shaped = noise * np.sin(np.pi * progress) ** 2 * .14
    freq = 260 + 1100 * (1 - progress if descending else progress) ** 2
    phase = 2 * np.pi * np.cumsum(freq) / SR
    shaped += .35 * np.sin(phase) * np.sin(np.pi * progress) ** 3
    pan = np.sin(progress * np.pi - np.pi / 2) * .65
    stereo = shaped[:, None] * np.stack([np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)], axis=1)
    add(fx, stereo, start, gain)

airy_rise(14.50, .49, .065)
airy_rise(21.80, .68, .065, True)
airy_rise(28.125, 1.83, .085)
cue(28.125, "Restrained ascending spectrum reveal riser")
airy_rise(37.48, .65, .050, True)

# Bright harmonic bloom, more like a glass resonator than a crash cymbal.
for note, position, level in [(62, 30, .11), (69, 30.02, .075), (77, 30.04, .055), (86, 30.07, .035)]:
    add(fx, pluck(note, 2.3, .40), position, level, (note - 74) / 35)
cue(30.0, "Full-spectrum harmonic bloom")

# Three-note mark timed independently of bars for the final wordmark.
for note, position, gain in [(74, 41.96, .12), (81, 42.12, .105), (86, 42.31, .09)]:
    add(fx, pluck(note, 1.9, .45), position, gain, 0)
cue(41.96, "CAVELUX sonic mark: D5, A5, D6, warm and clean")

# A short ambience tail behind effects keeps silence from feeling abruptly gated.
for delay, gain in [(.093, .20), (.211, .12), (.397, .06)]:
    offset = int(delay * SR)
    fx[offset:] += gain * fx[:-offset, ::-1].copy()

# All fades happen before mastering. The final 100ms is exactly digital silence.
fade = np.ones(N)
fade[:int(.02 * SR)] = np.linspace(0, 1, int(.02 * SR))
fade_start = int(43.50 * SR)
fade_end = int(44.90 * SR)
fade[fade_start:fade_end] = np.cos(np.linspace(0, np.pi / 2, fade_end - fade_start)) ** 2
fade[fade_end:] = 0
music *= fade[:, None]
fx *= fade[:, None]
music -= music.mean(axis=0, keepdims=True)
fx -= fx.mean(axis=0, keepdims=True)
music[fade_end:] = 0
fx[fade_end:] = 0

# Keep source stems coherent, with the SFX safely below the music bed.
raw_master = music + fx
common_gain = 10 ** (-3.5 / 20) / np.max(np.abs(raw_master))
music *= common_gain
fx *= common_gain
raw_master = music + fx


def write_pcm24(path, data):
    integer = np.rint(np.clip(data, -.999999, .999999) * 8388607).astype(np.int32)
    packed = np.empty((integer.size, 3), np.uint8)
    flat = integer.ravel()
    packed[:, 0] = flat & 255
    packed[:, 1] = (flat >> 8) & 255
    packed[:, 2] = (flat >> 16) & 255
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(2)
        stream.setsampwidth(3)
        stream.setframerate(SR)
        stream.writeframes(packed.tobytes())


def run_ffmpeg(args):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stderr


def extract_measurement(log):
    start = log.rfind('{')
    return json.loads(log[start:log.index('}', start) + 1])


write_pcm24(OUT / 'score.wav', music)
write_pcm24(OUT / 'sfx.wav', fx)
write_pcm24(OUT / 'premaster.wav', raw_master)
first_log = run_ffmpeg(['-i', str(OUT / 'premaster.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'])
first = extract_measurement(first_log)
filter_text = (
    'loudnorm=I=-16:TP=-1.5:LRA=9:'
    f'measured_I={first["input_i"]}:measured_TP={first["input_tp"]}:'
    f'measured_LRA={first["input_lra"]}:measured_thresh={first["input_thresh"]}:'
    f'offset={first["target_offset"]}:linear=true:print_format=json'
)
master_log = run_ffmpeg(['-y', '-i', str(OUT / 'premaster.wav'), '-af', filter_text,
                         '-ar', str(SR), '-ac', '2', '-t', '45', '-c:a', 'pcm_s24le', str(OUT / 'master.wav')])
measured_log = run_ffmpeg(['-i', str(OUT / 'master.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'])
measured = extract_measurement(measured_log)
(OUT / 'mastering-log.txt').write_text(first_log + '\nSECOND PASS\n' + master_log + '\nINDEPENDENT MEASUREMENT\n' + measured_log, encoding='utf-8')


def read_pcm24(path):
    with wave.open(str(path), 'rb') as stream:
        metadata = dict(channels=stream.getnchannels(), sample_rate=stream.getframerate(), sample_width_bytes=stream.getsampwidth(), frames=stream.getnframes())
        payload = np.frombuffer(stream.readframes(stream.getnframes()), dtype=np.uint8).reshape(-1, 3)
    values = (payload[:, 0].astype(np.int32) | payload[:, 1].astype(np.int32) << 8 | payload[:, 2].astype(np.int32) << 16)
    values = np.where(values & 8388608, values - 16777216, values).reshape(-1, 2) / 8388608
    metadata.update(duration_seconds=metadata['frames'] / metadata['sample_rate'],
                    peak_dbfs=float(20 * np.log10(np.max(np.abs(values)) + 1e-16)),
                    rms_dbfs=float(20 * np.log10(np.sqrt(np.mean(values ** 2)) + 1e-16)),
                    clipping_samples=int(np.count_nonzero(np.abs(values) >= .999999)),
                    last_50ms_peak=float(np.max(np.abs(values[-2400:]))),
                    stereo_correlation=float(np.corrcoef(values[:, 0], values[:, 1])[0, 1]))
    assert metadata['frames'] == N and metadata['sample_rate'] == SR and metadata['channels'] == 2
    assert metadata['clipping_samples'] == 0 and metadata['peak_dbfs'] < -1
    return metadata


checks = {name: read_pcm24(OUT / name) for name in ['score.wav', 'sfx.wav', 'master.wav']}
assert float(measured['input_tp']) <= -1.0
assert abs(float(measured['input_i']) + 16) <= .5
manifest = {
    'title': 'CAVELUX / Signal to Spectrum',
    'composition': 'Original procedural composition and sound design; no vocals, recordings, or external samples.',
    'duration_seconds': SECONDS,
    'bpm': BPM,
    'meter': '4/4',
    'bars': 24,
    'key': 'D minor with Dm9, Bbmaj9, Fmaj9, Cadd9 color',
    'master': 'master.wav',
    'stems': ['score.wav', 'sfx.wav'],
    'stems_note': 'Pre-master stems share a common gain; master.wav adds two-pass loudness normalization.',
    'integrated_loudness_lufs': float(measured['input_i']),
    'true_peak_dbtp': float(measured['input_tp']),
    'loudness_range_lu': float(measured['input_lra']),
    'file_checks': checks,
    'cues': sorted(cues, key=lambda item: item['time_seconds']),
    'verification_boundary': 'File metadata, samples, clipping, channel correlation, and FFmpeg loudness measured. Human listening and final video synchronization remain unverified.',
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
readme = '''# CAVELUX / Signal to Spectrum

Original 45.000-second instrumental cue: 128 BPM, 24 bars, 4/4, D minor.
All sounds are synthesized in `generate_audio.py`; no external samples or vocals.

Use `master.wav` for the finished film. `score.wav` and `sfx.wav` are pre-master
stems with a shared gain for alternate editorial mixes. `premaster.wav` is their sum.
All WAV files are stereo, 48 kHz, 24-bit PCM.

| Time | Movement | Sound and intended picture |
| --- | --- | --- |
| 0.000-7.500 | Wake | Soft boot signal, warm pad, sparse identity motif; mascot wakes. |
| 7.500-15.000 | Build | Tight drums, warm bass, precision micro-clicks; code and work states. |
| 15.000-22.500 | Swarm | Interlocking arpeggios, wide data ticks; agents multiply. |
| 22.500-30.000 | Synchronize | Reduced backbeat, spatial detail, restrained rising tone. |
| 30.000-37.500 | Spectrum | Harmonic bloom, fuller drums and melody; rainbow transformation. |
| 37.500-45.000 | Reveal | Elements fall away; D-A-D sonic mark at 41.96-42.31, clean fade. |

The final 100 ms is silence in the source mix. Mastering uses a two-pass FFmpeg
loudness target of -16 LUFS with a -1.5 dBTP ceiling. Actual results and all cue
times are in `manifest.json`; detailed FFmpeg output is in `mastering-log.txt`.

Regenerate with the bundled Python runtime and `python generate_audio.py`.
Dependency: NumPy; `ffmpeg` on PATH. The random source uses a fixed seed.

Verified: exact sample count and duration, stereo sample format, clipping,
sample peaks, channel correlation, and independent FFmpeg loudness measurement.
Unverified: human listening assessment and synchronization to the final rendered film.
'''
(OUT / 'README.md').write_text(readme, encoding='utf-8')
print(json.dumps({'master_loudness': {k: manifest[k] for k in ['integrated_loudness_lufs', 'true_peak_dbtp', 'loudness_range_lu']}, 'file_checks': checks}, indent=2))
