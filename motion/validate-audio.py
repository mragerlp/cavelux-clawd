"""Check real WAV exports and compare groove measurements with the archived cue.

Red/green regression targets: reject old music merely turned up; reject missing
sixteenth-note percussion; reject truncated, mono, clipped, or over-limit audio.
Metrics describe signal behavior, not subjective musical quality.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent
BASELINE = ROOT.parent / 'archive' / 'motion-v3' / 'audio' / 'master.wav'
BASELINE_SHA = 'd6594c6518354d71f4fd01ec9040abfb473afac4fff432c9ea9f1d7285972b35'
SR = 48000
N = 2160000
BEAT = 60 / 128


def read_wav(path):
    with wave.open(str(path), 'rb') as stream:
        header = {'sample_rate': stream.getframerate(), 'channels': stream.getnchannels(),
                  'sample_width_bytes': stream.getsampwidth(), 'frames': stream.getnframes()}
        assert header == {'sample_rate': 48000, 'channels': 2, 'sample_width_bytes': 3, 'frames': 2160000}, header
        packed = np.frombuffer(stream.readframes(stream.getnframes()), np.uint8).reshape(-1, 3)
    value = packed[:, 0].astype(np.int32) | packed[:, 1].astype(np.int32) << 8 | packed[:, 2].astype(np.int32) << 16
    value = np.where(value & 8388608, value - 16777216, value)
    audio = value.reshape(-1, 2).astype(np.float64) / 8388608
    return audio, header


def db(value):
    return float(20 * np.log10(max(float(value), 1e-16)))


def loudness(path):
    process = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(path),
                              '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json',
                              '-f', 'null', '-'], capture_output=True, text=True, check=True)
    text = process.stderr
    start = text.rfind('{')
    result = json.loads(text[start:text.index('}', start) + 1])
    return {'integrated_lufs': float(result['input_i']), 'true_peak_dbtp': float(result['input_tp']),
            'loudness_range_lu': float(result['input_lra'])}


def groove(audio):
    """Gain-invariant high-band attack count on the off-eighth sixteenth grid.

    A 1024-sample Hann STFT at 5ms hops measures 4-12kHz energy. At each
    sixteenth in 7.5-37.5s, compare its initial 45ms to its 65-105ms tail.
    An attack must exceed 12% of the track's 95th-percentile attack energy
    and have >=1.8x its tail energy. Odd positions are the subdivisions absent
    from an ordinary eighth-note hat pattern. Global gain cancels out.
    """
    mono = audio.mean(axis=1)
    size, hop = 1024, 240
    windows = np.lib.stride_tricks.sliding_window_view(mono, size)[::hop]
    powers = np.abs(np.fft.rfft(windows * np.hanning(size), axis=1)) ** 2
    freqs = np.fft.rfftfreq(size, 1 / SR)
    high = powers[:, (freqs >= 4000) & (freqs <= 12000)].sum(axis=1)
    times = (np.arange(len(high)) * hop + size / 2) / SR
    peaks, tails = [], []
    for step in range(256):
        time = 7.5 + step * BEAT / 4
        peaks.append(float(high[(times >= time - .01) & (times < time + .045)].max()))
        tails.append(float(np.mean(high[(times >= time + .065) & (times < time + .105)])))
    peaks, tails = np.array(peaks), np.array(tails)
    threshold = float(np.percentile(peaks, 95) * .12)
    attacks = (peaks > threshold) & (peaks > 1.8 * tails + 1e-16)
    core = (times >= 7.5) & (times < 37.5)
    high_share = float(high[core].sum() / powers[core].sum())
    return {'off_eighth_sixteenth_attacks': int(attacks[1::2].sum()),
            'all_sixteenth_grid_attacks': int(attacks.sum()),
            'high_band_energy_fraction': high_share,
            'attack_to_tail_median': float(np.median(peaks / (tails + 1e-16)))}


def measure(path):
    audio, header = read_wav(path)
    rms = np.sqrt(np.mean(audio ** 2))
    mono = audio.mean(axis=1)
    side = (audio[:, 0] - audio[:, 1]) / 2
    metadata = {**header, 'duration_seconds': header['frames'] / header['sample_rate'],
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'sample_peak_dbfs': db(np.max(np.abs(audio))), 'rms_dbfs': db(rms),
                'clipped_samples': int(np.count_nonzero(np.abs(audio) >= .999999)),
                'last_50ms_peak': float(np.max(np.abs(audio[-2400:]))),
                'stereo_correlation': float(np.corrcoef(audio[:, 0], audio[:, 1])[0, 1]),
                'side_to_mid_db': db(np.sqrt(np.mean(side ** 2)) / (np.sqrt(np.mean(mono ** 2)) + 1e-16)),
                'chapter_rms_dbfs': [db(np.sqrt(np.mean(audio[int(i * 7.5 * SR):int((i + 1) * 7.5 * SR)] ** 2))) for i in range(6)],
                **loudness(path), **groove(audio)}
    return audio, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', action='store_true', help='Save the expected-failing pre-change report')
    options = parser.parse_args()
    evidence = ROOT / 'output' / 'audio-checks'
    evidence.mkdir(parents=True, exist_ok=True)
    assert hashlib.sha256(BASELINE.read_bytes()).hexdigest() == BASELINE_SHA, 'Archived comparison baseline changed'
    old, old_metrics = measure(BASELINE)
    current, current_metrics = measure(ROOT / 'audio' / 'master.wav')
    normalized_correlation = float(np.corrcoef(old.ravel(), current.ravel())[0, 1])
    checks = []

    def check(name, condition, detail):
        checks.append({'name': name, 'status': 'PASS' if condition else 'FAIL', 'evidence': detail})
        print(('PASS ' if condition else 'FAIL ') + name)

    for name in ['score.wav', 'sfx.wav', 'premaster.wav', 'master.wav']:
        samples, header = read_wav(ROOT / 'audio' / name)
        peak = float(np.max(np.abs(samples)))
        check(name + ': exact 45s stereo 48kHz 24-bit, no clipped samples', peak < .999999,
              {**header, 'peak_dbfs': db(peak)})
    check('master reaches the requested -14 LUFS delivery level', -14.5 <= current_metrics['integrated_lufs'] <= -13.5,
          current_metrics['integrated_lufs'])
    check('master true peak remains at or below -1 dBTP', current_metrics['true_peak_dbtp'] <= -1,
          current_metrics['true_peak_dbtp'])
    check('master retains stereo content and avoids destructive negative correlation',
          -.1 < current_metrics['stereo_correlation'] < .995 and current_metrics['side_to_mid_db'] > -35,
          {'correlation': current_metrics['stereo_correlation'], 'side_to_mid_db': current_metrics['side_to_mid_db']})
    check('clean final silence avoids an export boundary click', current_metrics['last_50ms_peak'] <= 1 / 8388608,
          current_metrics['last_50ms_peak'])
    check('new composition is not the old cue with a gain change', abs(normalized_correlation) < .85,
          {'gain_invariant_waveform_correlation': normalized_correlation})
    old_count = old_metrics['off_eighth_sixteenth_attacks']
    new_count = current_metrics['off_eighth_sixteenth_attacks']
    check('core groove adds substantial sixteenth-note percussion beyond the old eighth-note feel',
          new_count >= 96 and new_count >= old_count + 64,
          {'archived_attacks': old_count, 'new_attacks': new_count, 'available_off_eighth_positions': 128})
    report = {'check': 'authored electro soundtrack', 'baseline': old_metrics, 'current': current_metrics,
              'gain_invariant_waveform_correlation': normalized_correlation, 'checks': checks,
              'passed': sum(item['status'] == 'PASS' for item in checks),
              'failed': sum(item['status'] == 'FAIL' for item in checks),
              'measurement_boundary': 'Actual WAV samples and FFmpeg loudness. Gain-invariant rhythm counts quantify articulation; they do not prove taste, listening quality, or final video synchronization.'}
    filename = 'audio-red-results.json' if options.baseline else 'audio-results.json'
    (evidence / filename).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'failed': report['failed'],
                      'baseline_groove': {key: old_metrics[key] for key in ['off_eighth_sixteenth_attacks', 'all_sixteenth_grid_attacks', 'high_band_energy_fraction']},
                      'current_groove': {key: current_metrics[key] for key in ['off_eighth_sixteenth_attacks', 'all_sixteenth_grid_attacks', 'high_band_energy_fraction']}}))
    raise SystemExit(1 if report['failed'] else 0)


if __name__ == '__main__':
    main()
