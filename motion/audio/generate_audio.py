"""CAVELUX / Engineered Momentum: original synthesized electro launch cue.

45.000 seconds, 128 BPM, 24 bars, six 7.5-second movements. NumPy and FFmpeg.
Every instrument is synthesized; no samples, recordings, or vocals.
"""
from pathlib import Path
import hashlib
import json
import math
import subprocess
import wave
import numpy as np

OUT = Path(__file__).resolve().parent
SR, N, BPM = 48000, 2160000, 128
SECONDS, BEAT = 45.0, 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(26092904)
drums = np.zeros((N, 2), np.float64)
low, synths, arp_bus, fx = [np.zeros_like(drums) for _ in range(4)]
cues = []


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def axis(duration):
    return np.arange(round(duration * SR)) / SR


def envelope(t, attack, release, duration):
    return np.minimum(t / attack, 1) * np.minimum(np.maximum(duration - t, 0) / release, 1) ** 1.5


def add(bus, signal, start, gain=1, pan=0):
    index = round(start * SR)
    if index >= N:
        return
    if index < 0:
        signal, index = signal[-index:], 0
    signal = signal[:N - index]
    if signal.ndim == 1:
        angle = (pan + 1) * math.pi / 4
        signal = signal[:, None] * np.array([math.cos(angle), math.sin(angle)])[None, :]
    bus[index:index + len(signal)] += gain * signal


def band_noise(duration, lo, hi):
    size = round(duration * SR)
    spectrum = np.fft.rfft(RNG.normal(size=size))
    frequencies = np.fft.rfftfreq(size, 1 / SR)
    weight = np.clip((frequencies - lo) / max(150, lo * .25), 0, 1)
    weight *= np.clip((hi - frequencies) / max(250, hi * .15), 0, 1)
    signal = np.fft.irfft(spectrum * weight, n=size)
    return signal / (np.std(signal) + 1e-12)


def kick():
    t = axis(.38)
    phase = 2 * np.pi * (49 * t + 102 * .022 * (1 - np.exp(-t / .022)))
    punch = .88 * np.sin(phase) * np.exp(-t * 12.7)
    punch += .16 * np.sin(2 * np.pi * 49 * t) * np.exp(-t * 8.2)
    attack = .09 * band_noise(.38, 1300, 4900) * np.exp(-t * 220)
    return (punch + attack) * envelope(t, .0007, .045, .38)


def snare():
    t = axis(.25)
    noise = np.tanh(band_noise(.25, 1700, 11200) * .75)
    clap = np.exp(-t * 32)
    for delay, level in [(.012, .45), (.026, .28)]:
        clap += np.where(t >= delay, level * np.exp(-np.maximum(t - delay, 0) * 45), 0)
    body = .54 * np.sin(2 * np.pi * 189 * t) * np.exp(-t * 35)
    body += .16 * np.sin(2 * np.pi * 317 * t) * np.exp(-t * 47)
    return (body + .69 * noise * clap) * envelope(t, .0008, .04, .25)


def hat(opened=False):
    duration = .16 if opened else .052
    t = axis(duration)
    noisy = .8 * np.tanh(band_noise(duration, 4700, 13200) * .90)
    metal = .095 * np.sin(2 * np.pi * 7811 * t) + .06 * np.sin(2 * np.pi * 10307 * t)
    return (noisy + metal) * np.exp(-t * (28 if opened else 82)) * envelope(t, .0005, .013, duration)


def rim():
    t = axis(.09)
    signal = np.sin(2 * np.pi * 1190 * t) + .34 * np.sin(2 * np.pi * 1733 * t)
    return signal * np.exp(-t * 72) * envelope(t, .0008, .015, .09)


def fm_bass(note, duration=.20, bite=1):
    t = axis(duration)
    phase = 2 * np.pi * hz(note) * t
    index = bite * (.95 * np.exp(-t * 19) + .22)
    fm = np.sin(phase + index * np.sin(2 * phase + .25))
    saw = np.zeros_like(t)
    for harmonic in range(1, 9):
        saw += np.sin(harmonic * phase) / harmonic * np.exp(-(harmonic - 1) * (.22 + t * 4))
    source = .72 * fm + .34 * saw + .12 * np.sin(phase / 2)
    source = np.tanh(source * 1.12) / 1.12
    return source * envelope(t, .003, .045, duration) * np.exp(-t * 3.6)


def chord_stab(notes, duration=.24):
    t = axis(duration)
    channels = []
    for side in (-1, 1):
        signal = np.zeros_like(t)
        for i, note in enumerate(notes):
            phase = 2 * np.pi * hz(note) * (1 + side * .00085) * t + i * .13
            for harmonic, weight in [(1, 1), (2, .34), (3, .19), (4, .065), (5, .045)]:
                signal += weight * np.sin(harmonic * phase) * np.exp(-(harmonic - 1) * t * 10)
        channels.append(signal / len(notes) * envelope(t, .004, .10, duration) * np.exp(-t * 5.8))
    return np.stack(channels, axis=1)


def arp(note, duration=.15, brightness=.8):
    t = axis(duration)
    phase = 2 * np.pi * hz(note) * t
    signal = np.sin(phase + .34 * np.exp(-t * 24) * np.sin(phase * 2))
    signal += .19 * brightness * np.sin(3 * phase) * np.exp(-t * 25)
    signal += .06 * brightness * np.sin(5 * phase) * np.exp(-t * 30)
    return signal * envelope(t, .002, .05, duration) * np.exp(-t * 9)


def tone_sweep(start, duration, gain, down=False):
    t = axis(duration)
    p = t / duration
    frequencies = 210 + 1600 * (1 - p if down else p) ** 2
    phase = 2 * np.pi * np.cumsum(frequencies) / SR
    signal = np.sin(phase + .8 * np.sin(phase * 2)) * np.sin(np.pi * p) ** 2
    signal += .11 * band_noise(duration, 2800, 8800) * np.sin(np.pi * p) ** 3
    pans = .45 * np.sin(p * np.pi - np.pi / 2)
    stereo = signal[:, None] * np.stack([np.cos((pans + 1) * np.pi / 4), np.sin((pans + 1) * np.pi / 4)], axis=1)
    add(fx, stereo, start, gain)


def electronic_mark(note, duration=1.6):
    t = axis(duration)
    phase = 2 * np.pi * hz(note) * t
    signal = np.sin(phase + .95 * np.exp(-t * 10) * np.sin(phase * 2))
    signal += .16 * np.sin(3 * phase) * np.exp(-t * 9)
    return signal * envelope(t, .002, .35, duration) * np.exp(-t * 3.6)


cells = [
    {'root': 38, 'chord': [50, 57, 62, 65], 'arp': [62, 69, 74, 77, 81]},
    {'root': 34, 'chord': [46, 53, 58, 62], 'arp': [62, 65, 70, 74, 77]},
    {'root': 41, 'chord': [53, 60, 65, 69], 'arp': [65, 69, 72, 77, 81]},
    {'root': 36, 'chord': [48, 55, 60, 64], 'arp': [60, 67, 72, 76, 79]},
]
chapters = ['INITIALIZE', 'BUILD', 'PARALLEL', 'SYNCHRONIZE', 'THROUGHPUT', 'DELIVER']
kick_sound, snare_sound, rim_sound = kick(), snare(), rim()
hats = [hat() for _ in range(8)]
open_hat = hat(True)

for bar in range(24):
    stage, local = divmod(bar, 4)
    start = bar * BAR
    cell = cells[local] if bar < 22 else cells[0]
    cues.append({'time_seconds': start, 'cue': f'{chapters[stage]} / bar {bar + 1}'})
    kick_positions = [0, 2] if stage == 0 and local < 2 else [0, 1, 2, 3]
    if stage == 3 and local == 0:
        kick_positions = [0, 2, 3]
    if bar == 22:
        kick_positions = [0]
    if bar == 23:
        kick_positions = []
    if bar in (7, 15, 19):
        kick_positions += [3.5]
    for position in kick_positions:
        add(drums, kick_sound, start + position * BEAT, .76 if stage == 4 else .68)
    if bar < 22:
        for position in [1, 3]:
            if stage != 0 or local >= 1:
                add(drums, snare_sound, start + position * BEAT, .31 if stage == 4 else .265, .03)
        # Articulated sixteenth hats: alternate velocities create forward motion.
        for step in range(16):
            if stage == 0 and local == 0 and step % 4:
                continue
            if stage == 0 and local == 1 and step % 2:
                continue
            gain = [.150, .145, .180, .150][step % 4]
            if stage == 0:
                gain *= .78
            if stage == 5:
                gain *= .84
            add(drums, hats[(step + bar) % len(hats)], start + step * BEAT / 4, gain, -.50 if step % 2 else .50)
        if stage in (1, 2, 4):
            for position in [.5, 2.5]:
                add(drums, open_hat, start + position * BEAT, .044, .28)
        if stage in (2, 4):
            for position in [1.75, 2.75, 3.75]:
                add(drums, rim_sound, start + position * BEAT, .046, -.32 if position < 2 else .32)
        if local == 3:
            for step in range(3):
                add(drums, snare_sound, start + (3.5 + step * .125) * BEAT, .052 + step * .021, (step - 1) * .18)
    # A sequenced FM/saw bass line replaces the previous sustained harmonic bed.
    bass_pattern = [(0.5, 0), (1.25, 0), (1.75, 12), (2.5, 0), (3.25, 7), (3.75, 0)]
    if stage == 0 and local < 2:
        bass_pattern = [(0.5, 0), (2.5, 0), (3.5, 12)]
    if stage == 2:
        bass_pattern = [(0.5, 0), (1, 0), (1.5, 12), (1.75, 0), (2.5, 0), (3, 7), (3.5, 0), (3.75, 12)]
    if stage == 4:
        bass_pattern = [(0.5, 0), (.75, 12), (1.5, 0), (1.75, 0), (2.5, 0), (2.75, 7), (3.25, 12), (3.75, 0)]
    if bar >= 22:
        bass_pattern = [(0, 0)] if bar == 22 else []
    for position, octave in bass_pattern:
        duration = .55 if bar == 22 else .15 if position % 1 == .75 else .22
        add(low, fm_bass(cell['root'] + octave, duration, 1.15 if stage == 4 else 1),
            start + position * BEAT, .42 if stage == 4 else .35)
    stab_positions = [.5, 2.5] if stage in (0, 3) else [.5, 1.75, 2.5, 3.5]
    if bar >= 22:
        stab_positions = [0] if bar == 22 else []
    for position in stab_positions:
        add(synths, chord_stab(cell['chord'], .32 if stage == 4 else .23),
            start + position * BEAT, .205 if stage == 4 else .13)
    if bar < 22:
        steps = [2, 6, 10, 14] if stage == 0 else list(range(16))
        if stage == 3 and local == 0:
            steps = [0, 3, 6, 8, 11, 14]
        melody = [0, 2, 1, 3, 2, 4, 1, 2, 0, 3, 2, 4, 3, 1, 2, 0]
        for step in steps:
            note = cell['arp'][melody[step]]
            if stage in (2, 4) and step in (6, 14):
                note += 12
            level = (.105 if stage == 4 else .085) * (.77 if step % 2 else 1)
            add(arp_bus, arp(note, .16, .78), start + step * BEAT / 4, level,
                .65 * math.sin(step * 1.7 + bar * .31))

# A measured low tom run supplies sync-stage tension without a noise wall.
for i in range(8):
    t = axis(.16)
    tom = np.sin(2 * np.pi * hz(45 + i) * t + 2.4 * (1 - np.exp(-t * 55)))
    tom *= np.exp(-t * 23) * envelope(t, .001, .035, .16)
    add(drums, tom, 28.125 + i * BEAT / 2, .075 + i * .007, -.4 + i * .8 / 7)
original_arp = arp_bus.copy()
for delay, gain in [(BEAT * .75, .19), (BEAT * 1.5, .07)]:
    offset = round(delay * SR)
    arp_bus[offset:] += gain * original_arp[:-offset, ::-1]
original_stabs = synths.copy()
for delay, gain in [(.067, .14), (.119, .065)]:
    offset = round(delay * SR)
    synths[offset:] += gain * original_stabs[:-offset, ::-1]
times = np.arange(N) / SR
duck = 1 - .24 * np.exp(-((times / BEAT) % 1) * 15)
music = drums + (low + synths + arp_bus) * duck[:, None]
music = .78 * music + .22 * np.tanh(1.6 * music) / 1.6

for chapter_time in [0, 7.5, 15, 22.5, 30, 37.5]:
    t = axis(.25)
    pulse = np.sin(2 * np.pi * 97 * t + .75 * np.sin(2 * np.pi * 194 * t))
    pulse *= np.exp(-t * 27) * envelope(t, .0008, .035, .25)
    add(fx, pulse, chapter_time, .09)
for start, duration, level in [(6.80, .66, .050), (14.42, .54, .056), (21.94, .51, .055), (28.125, 1.82, .074)]:
    tone_sweep(start, duration, level)
tone_sweep(37.48, .48, .045, True)
for start in [7.5, 15, 22.5, 30]:
    for step in range(4):
        add(fx, arp(86 + [0, 3, 7, 12][step], .075, .4), start + .035 + step * .059, .022, -.45 + step * .30)
for note, time, level in [(74, 41.94, .115), (81, 42.10, .103), (86, 42.28, .095)]:
    add(fx, electronic_mark(note), time, level, -.12 if note == 74 else .12 if note == 86 else 0)
add(fx, fm_bass(38, .65, .65), 41.94, .17)
tone_sweep(42.02, .40, .018, True)
cues += [
    {'time_seconds': 0, 'cue': 'Immediate electronic downbeat; initialize the engineering story'},
    {'time_seconds': 7.5, 'cue': 'BUILD: complete drum groove and gated chord stabs'},
    {'time_seconds': 15, 'cue': 'PARALLEL: denser bass and interlocking sixteenth-note sequence'},
    {'time_seconds': 22.5, 'cue': 'SYNCHRONIZE: controlled tension, spatial details, rising tom sequence'},
    {'time_seconds': 30, 'cue': 'THROUGHPUT: maximum groove, stronger bass, open harmonic voicing'},
    {'time_seconds': 37.5, 'cue': 'DELIVER: carry momentum into the brand reveal'},
    {'time_seconds': 41.94, 'cue': 'Electronic D-A-D sonic identity, low anchor, controlled tail'},
]
original_fx = fx.copy()
for delay, gain in [(.083, .13), (.167, .065)]:
    offset = round(delay * SR)
    fx[offset:] += gain * original_fx[:-offset, ::-1]
fade = np.ones(N)
fade[:round(.004 * SR)] = np.linspace(0, 1, round(.004 * SR))
fade_start, fade_end = round(43.7 * SR), round(44.9 * SR)
fade[fade_start:fade_end] = np.cos(np.linspace(0, np.pi / 2, fade_end - fade_start)) ** 2
fade[fade_end:] = 0
for bus in [music, fx]:
    bus -= bus.mean(axis=0, keepdims=True)
    bus *= fade[:, None]
gain = 10 ** (-3 / 20) / np.max(np.abs(music + fx))
music *= gain
fx *= gain
premaster = music + fx


def write_pcm24(path, signal):
    assert signal.shape == (N, 2) and np.all(np.isfinite(signal))
    assert np.max(np.abs(signal)) < .999999
    integers = np.rint(signal * 8388607).astype(np.int32).ravel()
    packed = np.empty((integers.size, 3), np.uint8)
    packed[:, 0], packed[:, 1], packed[:, 2] = integers & 255, (integers >> 8) & 255, (integers >> 16) & 255
    with wave.open(str(path), 'wb') as stream:
        stream.setnchannels(2)
        stream.setsampwidth(3)
        stream.setframerate(SR)
        stream.writeframes(packed.tobytes())


def ffmpeg(args):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stderr


def read_measurement(log):
    start = log.rfind('{')
    return json.loads(log[start:log.index('}', start) + 1])


write_pcm24(OUT / 'score.wav', music)
write_pcm24(OUT / 'sfx.wav', fx)
write_pcm24(OUT / 'premaster.wav', premaster)
first_log = ffmpeg(['-i', str(OUT / 'premaster.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-'])
first = read_measurement(first_log)
filter_text = ('loudnorm=I=-14:TP=-1.5:LRA=7:'
               f'measured_I={first["input_i"]}:measured_TP={first["input_tp"]}:'
               f'measured_LRA={first["input_lra"]}:measured_thresh={first["input_thresh"]}:'
               f'offset={first["target_offset"]}:linear=true:print_format=json')
second_log = ffmpeg(['-y', '-i', str(OUT / 'premaster.wav'), '-af', filter_text, '-ar', str(SR),
                     '-ac', '2', '-t', '45', '-c:a', 'pcm_s24le', str(OUT / 'master.wav')])
measure_log = ffmpeg(['-i', str(OUT / 'master.wav'), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-'])
measured = read_measurement(measure_log)
assert abs(float(measured['input_i']) + 14) <= .5
assert float(measured['input_tp']) <= -1
(OUT / 'mastering-log.txt').write_text(first_log + '\nSECOND PASS\n' + second_log + '\nINDEPENDENT MEASUREMENT\n' + measure_log, encoding='utf-8')
checks = {}
for name in ['score.wav', 'sfx.wav', 'premaster.wav', 'master.wav']:
    path = OUT / name
    with wave.open(str(path), 'rb') as stream:
        checks[name] = {'channels': stream.getnchannels(), 'sample_rate': stream.getframerate(),
                        'sample_width_bytes': stream.getsampwidth(), 'frames': stream.getnframes(),
                        'duration_seconds': stream.getnframes() / stream.getframerate(),
                        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        assert stream.getnframes() == N and stream.getnchannels() == 2 and stream.getsampwidth() == 3
manifest = {
    'title': 'CAVELUX / Engineered Momentum', 'revision': 4,
    'composition': 'Original synthesized industrial/electro business launch cue; no external samples, recordings, or vocals.',
    'duration_seconds': SECONDS, 'bpm': BPM, 'meter': '4/4', 'bars': 24,
    'key': 'D minor; Dm, Bb, F, C with open power voicings',
    'chapter_seconds': [0, 7.5, 15, 22.5, 30, 37.5], 'chapters': chapters,
    'master': 'master.wav', 'stems': ['score.wav', 'sfx.wav'],
    'stems_note': 'Pre-master stems share one gain; their sum is premaster.wav. master.wav adds two-pass loudness normalization.',
    'arrangement': 'Punch kick and layered snare, articulated sixteenth hats and arpeggios, syncopated FM/saw bass, short harmonic stabs, restrained transition effects; no sustained pad bed.',
    'integrated_loudness_lufs': float(measured['input_i']), 'true_peak_dbtp': float(measured['input_tp']),
    'loudness_range_lu': float(measured['input_lra']), 'file_checks': checks,
    'cues': sorted(cues, key=lambda item: item['time_seconds']),
    'verification': '../validate-audio.py compares actual PCM and normalized rhythmic attacks with the archived cue.',
    'verification_boundary': 'Signal measurements do not establish subjective listening quality or final video synchronization.',
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'title': manifest['title'], 'lufs': manifest['integrated_loudness_lufs'],
                  'true_peak_dbtp': manifest['true_peak_dbtp'], 'range_lu': manifest['loudness_range_lu'],
                  'master': checks['master.wav']}, indent=2))
