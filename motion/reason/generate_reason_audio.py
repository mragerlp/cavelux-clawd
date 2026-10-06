"""CAVELUX / REASON: original synthesised bed, key clicks and scan sfx for the 30 s reel.

Follows motion/audio/generate_audio.py: NumPy synthesis, a fixed seed, 24-bit 48 kHz stereo
stems, FFmpeg loudness measurement. Every event time is read from cues.json (written by
render.mjs --cues from timeline.json and register.json); no event time is typed here.
No samples, recordings or vocals. The bed never ducks for the clicks.

  python motion/reason/generate_reason_audio.py --out DIR [--cues motion/reason/cues.json]
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import subprocess
import wave
import numpy as np

HERE = Path(__file__).resolve().parent
SR, SECONDS = 48000, 30.0
N = int(SR * SECONDS)
FPS = 30
RNG = np.random.default_rng(20261005)
CLICK_PEAK_DBFS = -28.0
TARGET_LUFS, TARGET_TP = -14.0, -1.5
TEMPO = 96  # pulse in the technical middle (B3-B5)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def axis(duration):
    return np.arange(int(round(duration * SR))) / SR


def add(bus, signal, start, gain=1.0, pan=0.0):
    index = int(round(start * SR))
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
    size = int(round(duration * SR))
    spectrum = np.fft.rfft(RNG.normal(size=size))
    freqs = np.fft.rfftfreq(size, 1 / SR)
    weight = np.clip((freqs - lo) / max(150, lo * .25), 0, 1) * np.clip((hi - freqs) / max(250, hi * .15), 0, 1)
    signal = np.fft.irfft(spectrum * weight, n=size)
    return signal / (np.std(signal) + 1e-12)


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def pad(notes, start, end, bright, gain=1.0, fade=.35):
    """Detuned additive pad; brightness(t) opens and closes the upper partials (a filter without a filter)."""
    t = axis(end - start + fade)
    local = t / max(t[-1], 1e-9)
    env = smoothstep(t / fade) * smoothstep((end - start + fade - t) / fade)
    b = np.interp(t + start, bright[0], bright[1])
    out = np.zeros((len(t), 2))
    for i, note in enumerate(notes):
        for side, cents in ((0, -4), (1, 4)):
            f = hz(note) * 2 ** (cents / 1200)
            phase = 2 * np.pi * f * t + i * .7 + side * 1.3
            voice = np.zeros_like(t)
            for k in range(1, 11):
                voice += np.sin(k * phase) / k * b ** (k - 1)
            out[:, side] += voice * (1 + .04 * np.sin(2 * np.pi * (.13 + .05 * i) * t))
    out *= env[:, None] / len(notes)
    return out * gain, start - fade / 2


def pluck(note, duration=.32, brightness=.6):
    t = axis(duration)
    phase = 2 * np.pi * hz(note) * t
    s = np.sin(phase + .3 * np.exp(-t * 20) * np.sin(2 * phase)) + .15 * brightness * np.sin(3 * phase) * np.exp(-t * 18)
    return s * np.minimum(t / .003, 1) * np.exp(-t * 7.5)


def bloom(note, duration=1.6):
    t = axis(duration)
    s = np.sin(2 * np.pi * hz(note) * t) + .35 * np.sin(2 * np.pi * hz(note + 12) * t) * np.exp(-t * 3)
    return s * np.minimum(t / .012, 1) * np.exp(-t * 2.2)


def riser(duration):
    t = axis(duration)
    p = t / duration
    noise = band_noise(duration, 500, 4200) * p ** 2.6 * .5
    glide = np.sin(2 * np.pi * np.cumsum(180 + 420 * p ** 2) / SR) * p ** 2 * .35
    return (noise + glide) * smoothstep((duration - t) / .03)


def bell(note, duration=2.4):
    t = axis(duration)
    s = sum(w * np.sin(2 * np.pi * hz(note) * m * t) * np.exp(-t * d) for m, w, d in [(1, 1, 1.6), (2.01, .4, 2.6), (3.02, .18, 4)])
    return s * np.minimum(t / .004, 1)


def key_click(variant):
    """40-60 ms synthesised key click: a noise transient, a short body tone and a low thock. Dry."""
    duration = [.046, .052, .058][variant]
    t = axis(duration)
    transient = band_noise(duration, 2200 + 600 * variant, 7500) * np.exp(-t / .0035)
    body = np.sin(2 * np.pi * (1650 + 330 * variant) * t) * np.exp(-t / .010)
    thock = np.sin(2 * np.pi * (230 + 35 * variant) * t) * np.exp(-t / .016)
    s = .55 * transient + .35 * body + .45 * thock
    s *= np.minimum(t / .0008, 1) * smoothstep((duration - t) / .008)
    return s / np.max(np.abs(s))


def relay_tick():
    t = axis(.04)
    s = (np.sin(2 * np.pi * 1180 * t) + .5 * np.sin(2 * np.pi * 3150 * t)) * np.exp(-t / .006)
    return s * np.minimum(t / .0006, 1) * smoothstep((.04 - t) / .006)


def shimmer(duration=.25):
    t = axis(duration)
    return np.sin(2 * np.pi * 2400 * t) * (.5 + .5 * np.sin(2 * np.pi * 24 * t)) * np.sin(np.pi * t / duration) ** 2


def whoosh(duration=.32):
    t = axis(duration)
    return band_noise(duration, 220, 1400) * np.sin(np.pi * t / duration) ** 2


def write_pcm24(path, signal):
    assert signal.shape == (N, 2) and np.all(np.isfinite(signal)), signal.shape
    assert np.max(np.abs(signal)) < .999999, np.max(np.abs(signal))
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


def loudness(path):
    log = ffmpeg(['-i', str(path), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    start = log.rfind('{')
    return json.loads(log[start:log.index('}', start) + 1]), log


def short_term(path):
    log = ffmpeg(['-i', str(path), '-af', 'ebur128=framelog=info:peak=true', '-f', 'null', '-'])
    rows = []
    for m in re.finditer(r't:\s*([\d.]+)\s+TARGET:[^M]*M:\s*(-?[\d.]+|-inf)\s+S:\s*(-?[\d.]+|-inf)', log):
        rows.append((float(m.group(1)), float(m.group(3)) if m.group(3) != '-inf' else -120.0,
                     float(m.group(2)) if m.group(2) != '-inf' else -120.0))
    summary = log[log.rfind('Summary:'):]
    return rows, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--cues', default=str(HERE / 'cues.json'))
    options = parser.parse_args()
    out = Path(options.out)
    out.mkdir(parents=True, exist_ok=True)
    cues = json.loads(Path(options.cues).read_text(encoding='utf-8'))
    assert cues['fps'] == FPS and abs(cues['durationSeconds'] - SECONDS) < 1e-9
    beat = {b['id']: b for b in cues['beats']}
    transitions = [item['time'] for item in cues['transitions']]
    ultras = [s['ultracode'] for s in cues['scans']]
    black = cues['blackFrom']
    sheet = []

    # ---- bed: key D minor, free time with a 96 BPM pulse in the middle ----
    bed = np.zeros((N, 2))
    knots_t, knots_b = [0, beat['B2']['in'], beat['B3']['in'], beat['B5']['out'], beat['B7']['in'], SECONDS + 1], [.12, .16, .42, .55, .3, .2]
    bright_t, bright_b = list(knots_t), list(knots_b)
    lands = transitions + ultras
    grid = np.linspace(0, SECONDS + 1, 3101)
    brightness = np.interp(grid, bright_t, bright_b)
    for land in lands:  # each landing opens the pad for a moment
        brightness += .22 * np.where(grid >= land, np.exp(-(grid - land) / .9), np.exp(-(land - grid) / .25) * .4)
    brightness = np.clip(brightness, .08, .82)
    curve = (grid, brightness)
    s1, s2, s3 = ultras
    segments = [
        ([50, 57, 65], 0.15, beat['B2']['in'], .9, 'Dm, dark, alone'),
        ([50, 57, 64, 65], beat['B2']['in'], beat['B3']['in'], 1.0, 'Dm(add9), the pad opens'),
        ([46, 53, 57, 62], beat['B3']['in'], beat['B4']['in'], 1.0, 'Bbmaj7'),
        ([48, 55, 64, 67], beat['B4']['in'], beat['B5']['in'], 1.0, 'C, lifting'),
        ([50, 57, 62, 65], beat['B5']['in'], beat['B6']['in'], 1.0, 'Dm'),
        ([46, 53, 58, 62], beat['B6']['in'], s2, 1.0, 'Bb under the first scan'),
        ([48, 55, 60, 64], s2, s3, 1.0, 'C under the second scan'),
        ([41, 53, 57, 60, 65], s3, beat['B7']['out'], .85, 'F major: the third scan resolves'),
        ([50, 57, 62, 66], beat['B8']['in'], black + .29, .7, 'D major colour under the close'),
    ]
    for notes, start, end, gain, label in segments:
        signal, at = pad(notes, start, end, curve, gain)
        add(bed, signal, at)
        sheet.append((start, 'bed', label))
    # low anchor under every landing
    for land in lands:
        add(bed, bloom(38, 1.6), land, .32)
    # risers land on the transitions and scans; the one into B5 is the long riser the storyboard asks for
    for land in lands:
        length = 2.0 if abs(land - beat['B5']['in']) < 1e-6 else .9
        add(bed, riser(length), land - length, .16)
        sheet.append((land, 'landing', f'{length:.1f} s riser lands, pad opens, low D bloom'))
    # technical-middle pulse, B3 to B5, 96 BPM eighth notes through the chord tones
    step = 60 / TEMPO / 2
    chord_at = [(beat['B3']['in'], [62, 65, 69, 72]), (beat['B4']['in'], [64, 67, 72, 76]), (beat['B5']['in'], [62, 65, 69, 74])]
    t0, end = beat['B3']['in'] + .2, beat['B5']['out'] - .15
    i = 0
    while t0 + i * step < end:
        t = t0 + i * step
        tones = [c for at, c in chord_at if t >= at][-1]
        add(bed, pluck(tones[i % 4], .3), t, .05 * (1 if i % 2 == 0 else .7), .45 if i % 2 else -.45)
        i += 1
    sheet.append((t0, 'pulse', f'{TEMPO} BPM eighth-note pluck enters (technical middle)'))
    sheet.append((end, 'pulse', 'pulse stops before the door'))
    # quiet resolution under the brief, and the close
    add(bed, bell(77, 2.6), beat['B7']['in'] + .05, .07, .2)
    add(bed, bell(74, 2.0), beat['B8']['in'] + .05, .05, -.2)
    sheet.append((beat['B7']['in'], 'resolution', 'F major held quietly, one soft bell'))
    # tail: the picture is black from blackFrom; the music tails for at most 0.3 s, silent before 30.00
    fade = np.ones(N)
    a, b = int(round(black * SR)), int(round((black + .24) * SR))
    fade[a:b] = np.cos(np.linspace(0, np.pi / 2, b - a)) ** 2
    fade[b:] = 0
    fade[:int(.004 * SR)] = np.linspace(0, 1, int(.004 * SR))
    sheet.append((black, 'tail', 'picture black; music tails 0.24 s, then digital silence to 30.00'))

    # ---- sfx: a soft relay tick per laser sweep, a faint shimmer, door air ----
    sfx = np.zeros((N, 2))
    for scan in cues['scans']:
        for sweep in scan['sweeps']:
            add(sfx, relay_tick(), sweep, .45, .25)
            add(sfx, shimmer(.25), sweep, .05, .25)
            sheet.append((sweep, 'sfx', f'{scan["mascot"]} laser sweep: soft relay tick'))
        add(sfx, whoosh(.3), scan['doorOpen'], .06, .3)
        add(sfx, whoosh(.25), scan['doorClose'], .045, .3)
        sheet.append((scan['ultracode'], 'swell', f'{scan["mascot"]} turns ultracode: music swell only (V5)'))

    # ---- clicks: one per glyph, sample-locked to the frame the glyph first shows ----
    variants = [key_click(v) for v in range(3)]
    clicks = np.zeros((N, 2))
    for k, click in enumerate(cues['clicks']):
        start = click['frame'] / FPS
        v = int(RNG.integers(0, 3))
        add(clicks, variants[v], start, 10 ** (RNG.uniform(-1.5, 1.5) / 20), float(RNG.uniform(-.15, .15)))
    for bus in (bed, sfx, clicks):
        bus -= bus.mean(axis=0, keepdims=True)
        bus *= fade[:, None]

    # ---- mastering: one linear gain for all stems, clicks set to -28 dBFS peak in the master ----
    peak = np.max(np.abs(bed + sfx))
    bed *= .5 / peak
    sfx *= .5 / peak
    probe = out / '.probe.wav'
    write_pcm24(probe, bed + sfx)
    first, _ = loudness(probe)
    gain = 10 ** ((TARGET_LUFS - float(first['input_i'])) / 20)
    clicks *= (10 ** (CLICK_PEAK_DBFS / 20) / gain) / np.max(np.abs(clicks))
    premaster_pre = bed + sfx + clicks
    for _ in range(3):  # converge the one linear gain with the clicks included
        if np.max(np.abs(premaster_pre * gain)) >= .99:
            raise SystemExit('Linear master gain would clip; reduce landing levels.')
        write_pcm24(probe, premaster_pre * gain)
        measured, _ = loudness(probe)
        gain *= 10 ** ((TARGET_LUFS - float(measured['input_i'])) / 20)
    probe.unlink()
    if np.max(np.abs(premaster_pre * gain)) >= .99:
        raise SystemExit('Linear master gain would clip; reduce landing levels.')
    for name, bus in (('bed.wav', bed), ('clicks.wav', clicks), ('sfx.wav', sfx)):
        write_pcm24(out / name, bus)
    write_pcm24(out / 'premaster.wav', premaster_pre)
    master = premaster_pre * gain
    write_pcm24(out / 'master.wav', master)
    final, final_log = loudness(out / 'master.wav')
    rows, summary = short_term(out / 'master.wav')
    click_peak_db = 20 * math.log10(np.max(np.abs(clicks * gain)))
    (out / 'mastering-log.txt').write_text(f'linear master gain {20 * math.log10(gain):.3f} dB applied to premaster.wav\n\n' + final_log + '\nEBU R128 SUMMARY\n' + summary, encoding='utf-8')

    # short-term loudness under each typed line (midpoint of its visible span)
    under = []
    times = np.array([r[0] for r in rows]) if rows else np.array([0.0])
    values = np.array([r[1] for r in rows]) if rows else np.array([-120.0])
    momentary = np.array([r[2] for r in rows]) if rows else np.array([-120.0])
    for cap in cues['captions']:
        mid = (cap['firstGlyph'] + cap['out']) / 2
        idx = int(np.argmin(np.abs(times - mid)))
        under.append({'claim': cap['claim'], 'line': cap['line'], 'text': cap['text'], 'midpoint': round(mid, 3),
                      'shortTermLUFS': values[idx], 'momentaryLUFS': momentary[idx],
                      'note': 'short-term needs 3 s of history; -120.7 before t = 3 s means not yet defined' if mid < 3 else ''})

    checks = {}
    for name in ['bed.wav', 'clicks.wav', 'sfx.wav', 'premaster.wav', 'master.wav']:
        path = out / name
        with wave.open(str(path), 'rb') as stream:
            assert stream.getnframes() == N and stream.getnchannels() == 2 and stream.getsampwidth() == 3
            checks[name] = {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest().upper(),
                            'frames': stream.getnframes(), 'sample_rate': stream.getframerate()}
    master_last50 = float(np.max(np.abs(master[-2400:])))
    lines = ['REASON reel cue sheet (times in seconds; generated from cues.json, nothing typed)',
             f'Key D minor; bed in free time; pulse {TEMPO} BPM in B3-B5. Laser red #FF2D3F (picture). Clicks: 3 synthesised variants, '
             f'{len(cues["clicks"])} glyph clicks, peak {click_peak_db:.2f} dBFS in the master, no reverb, never ducked under.', '']
    for t, kind, text in sorted(sheet, key=lambda x: x[0]):
        lines.append(f'{t:6.2f}  {kind:<10} {text}')
    lines.append('')
    lines.append('Typed lines and their clicks:')
    for cap in cues['captions']:
        n = sum(1 for c in cues['clicks'] if c['claim'] == cap['claim'] and c['line'] == cap['line'])
        lines.append(f'{cap["firstGlyph"]:6.2f}-{cap["lastGlyph"]:5.2f}  {cap["claim"]}.{cap["line"]} {n} clicks at {cap["rateCharsPerSecond"]} chars/s: {cap["text"]}')
    (out / 'cue-sheet.txt').write_text('\n'.join(lines) + '\n', encoding='ascii')
    manifest = {'title': 'CAVELUX / REASON', 'composition': 'Original synthesised bed, key clicks and scan sfx; no samples, recordings or vocals.',
                'key': 'D minor (Dm, Dm add9, Bbmaj7, C, Dm, Bb, C, F, D)', 'pulseBpm': TEMPO, 'durationSeconds': SECONDS,
                'stems': ['bed.wav', 'clicks.wav', 'sfx.wav'], 'stemsNote': 'Pre-master stems share one gain; their sum is premaster.wav; master.wav = premaster.wav times one linear gain.',
                'linearMasterGainDb': 20 * math.log10(gain), 'integratedLUFS': float(final['input_i']), 'truePeakDBTP': float(final['input_tp']),
                'loudnessRangeLU': float(final['input_lra']), 'clickPeakDbfsInMaster': click_peak_db, 'masterLast50msPeak': master_last50,
                'shortTermUnderCaptions': under, 'files': checks}
    (out / 'audio-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: manifest[k] for k in ['integratedLUFS', 'truePeakDBTP', 'loudnessRangeLU', 'clickPeakDbfsInMaster', 'linearMasterGainDb', 'masterLast50msPeak']}, indent=2))
    print('short-term / momentary under captions:', ', '.join(f"{u['claim']}.{u['line']}={u['shortTermLUFS']:.1f}/{u['momentaryLUFS']:.1f}" for u in under))
    ok = abs(float(final['input_i']) - TARGET_LUFS) <= .5 and float(final['input_tp']) <= TARGET_TP and master_last50 <= 1 / 8388608 and len(rows) > 100
    raise SystemExit(0 if ok else 1)


if __name__ == '__main__':
    main()
