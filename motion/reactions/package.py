"""Package exact exports and transparent frame masters with stable ZIP metadata."""
from pathlib import Path
import json
import os
import tempfile
import zipfile

root = Path(__file__).resolve().parent
output = root / 'output'
catalog = json.loads((root / 'catalog.json').read_text(encoding='utf-8'))
files = [(root / 'catalog.json', 'catalog.json'), (root / 'README.md', 'README.md'),
         (root / 'PRODUCTION-BOARD.md', 'PRODUCTION-BOARD.md'), (output / 'manifest.json', 'manifest.json')]
for item in catalog:
    key = item['id']
    for ext in ('gif', 'mp4', 'png'):
        files.append((output / f'{key}.{ext}', f'{key}.{ext}'))
    for i in range(round(item['duration'] * item['fps'])):
        files.append((root / '.frames' / key / f'{i:04d}.png', f'masters/{key}/{i:04d}.png'))
archive = output / 'cavelux-clawd-pack-01.zip'
for source, _ in files:
    with source.open('rb'):
        pass
with tempfile.NamedTemporaryFile(dir=output, prefix='.pack-', suffix='.tmp', delete=False) as handle:
    temporary = Path(handle.name)
try:
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for source, name in files:
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 29, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, source.read_bytes())
    with zipfile.ZipFile(temporary) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files)
    os.replace(temporary, archive)
finally:
    if temporary.exists():
        temporary.unlink()
print(json.dumps({'package': archive.name, 'members': len(files), 'bytes': archive.stat().st_size, 'exitCode': 0}))
