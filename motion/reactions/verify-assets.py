"""Verify actual GIF, PNG, MP4, and master archive deliverables, not just metadata."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import hashlib
import io
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'
EVIDENCE = ROOT / 'e2e-evidence'
EXPECTED = {'share-break': 2.4, 'typing': 2.4, 'approved': 2.0, 'panic': 2.4,
            'side-eye': 2.4, 'shrug': 2.4, 'celebrate': 2.4, 'presenting': 2.4}
checks = []


def check(name, body):
    try:
        evidence = body()
        checks.append({'name': name, 'status': 'PASS', 'evidence': evidence})
        print('PASS ' + name)
    except Exception as error:
        checks.append({'name': name, 'status': 'FAIL', 'error': str(error)})
        print('FAIL ' + name + ': ' + str(error))


def verify_gif(key, seconds):
    file = OUT / (key + '.gif')
    assert file.exists(), 'Finished GIF has not been produced'
    with Image.open(file) as im:
        assert im.format == 'GIF' and im.size == (512, 512)
        assert im.info.get('loop') == 0, 'GIF must repeat indefinitely'
        assert im.n_frames >= 12, 'Reaction must contain actual motion frames'
        frames, hashes, elapsed = [], set(), 0
        for i in range(im.n_frames):
            im.seek(i)
            frame = im.convert('RGBA')
            elapsed += im.info.get('duration', 0)
            assert frame.getpixel((0, 0))[3] == 0, f'Frame {i} lost transparency'
            alpha = frame.getchannel('A')
            bounds = alpha.getbbox()
            assert bounds and min(bounds[:2]) >= 4 and max(bounds[2:]) <= 508, f'Clipped edge at frame {i}: {bounds}'
            frames.append(frame.copy())
            hashes.add(hashlib.sha256(frame.tobytes()).hexdigest())
        assert abs(elapsed / 1000 - seconds) < .051, f'Wrong playback duration {elapsed}ms'
        assert len(hashes) >= 12, 'Frames do not contain enough distinct motion'
        assert file.stat().st_size < 2_000_000, 'GIF exceeds the pack size budget'
        # A broken last-to-first transition should not be a large outlier.
        # Exact cycle equivalence is independently checked at render time.
        def delta(a, b):
            return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean)
        steps = [delta(a, b) for a, b in zip(frames, frames[1:])]
        seam = delta(frames[-1], frames[0])
        assert seam <= max(steps) * 1.4 + 1, f'Visible loop discontinuity {seam}'
        return {'frames': len(frames), 'distinctFrames': len(hashes), 'durationMs': elapsed,
                'bytes': file.stat().st_size, 'loop': 0, 'seamDelta': seam, 'maxStepDelta': max(steps)}


def verify_png(key):
    with Image.open(OUT / (key + '.png')) as im:
        assert im.size == (512, 512) and im.mode == 'RGBA'
        assert im.getpixel((0, 0))[3] == 0
    return {'size': [512, 512], 'alpha': True}


def verify_mp4(key, seconds):
    file = OUT / (key + '.mp4')
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(file)]))
    stream = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert (stream['width'], stream['height']) == (512, 512)
    assert stream['codec_name'] == 'h264' and stream['pix_fmt'] == 'yuv420p'
    assert abs(float(stream['duration']) - seconds) < .051
    assert int(stream['nb_frames']) == round(seconds * 20)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'null', '-'], check=True, capture_output=True)
    return {'codec': 'h264', 'duration': float(stream['duration']), 'decodeExitCode': 0}


def verify_archive():
    with zipfile.ZipFile(OUT / 'cavelux-clawd-pack-01.zip') as archive:
        assert archive.testzip() is None
        names = set(archive.namelist())
        expected_names = {'catalog.json', 'README.md', 'PRODUCTION-BOARD.md', 'manifest.json'}
        for name in expected_names:
            source = OUT / name if name == 'manifest.json' else ROOT / name
            assert archive.read(name) == source.read_bytes(), f'Stale archive document: {name}'
        for key, seconds in EXPECTED.items():
            for ext in ('gif', 'mp4', 'png'):
                expected_names.add(f'{key}.{ext}')
                assert archive.read(f'{key}.{ext}') == (OUT / f'{key}.{ext}').read_bytes()
            for frame in range(round(seconds * 20)):
                name = f'masters/{key}/{frame:04d}.png'
                expected_names.add(name)
                data = archive.read(name)
                with Image.open(io.BytesIO(data)) as master:
                    master.load()
                    assert master.format == 'PNG' and master.size == (512, 512) and master.mode == 'RGBA', name
                    assert master.getpixel((0, 0))[3] == 0, name
                loose = ROOT / '.frames' / key / f'{frame:04d}.png'
                if loose.exists():
                    assert loose.read_bytes() == data, f'Master byte mismatch: {name}'
        assert names == expected_names and len(archive.namelist()) == len(expected_names)
        return {'members': len(names), 'masterFrames': sum(round(t * 20) for t in EXPECTED.values())}


def verify_manifest():
    manifest = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8'))
    for name, expected in manifest['sources'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, f'Exports are stale after source change: {name}'
    assert {r['id'] for r in manifest['reactions']} == set(EXPECTED)
    for item in manifest['reactions']:
        for ext, record in item['files'].items():
            data = (OUT / (item['id'] + '.' + ext)).read_bytes()
            assert hashlib.sha256(data).hexdigest() == record['sha256'], f'Export bytes differ from manifest: {item["id"]}.{ext}'
            assert len(data) == record['bytes']
    return {'sourceFiles': len(manifest['sources']), 'exportFiles': 24}


for key, seconds in EXPECTED.items():
    check(key + ' GIF motion, loop, transparency and size', lambda key=key, seconds=seconds: verify_gif(key, seconds))
    check(key + ' transparent poster', lambda key=key: verify_png(key))
    check(key + ' MP4 format and full decode', lambda key=key, seconds=seconds: verify_mp4(key, seconds))
check('complete reusable master archive', verify_archive)
check('exports match current animation sources and manifest', verify_manifest)
EVIDENCE.mkdir(exist_ok=True)
passed = sum(c['status'] == 'PASS' for c in checks)
failed = len(checks) - passed
report = {'check': 'reaction deliverables', 'passed': passed, 'failed': failed, 'checks': checks,
          'unverified': ['Physical iMessage sending, Apple transcoding, and rendering on an iPhone']}
(EVIDENCE / ('assets-red-results.json' if failed and not OUT.exists() else 'assets-results.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'check': 'reaction deliverables', 'passed': passed, 'failed': failed, 'exitCode': 1 if failed else 0}))
raise SystemExit(1 if failed else 0)
