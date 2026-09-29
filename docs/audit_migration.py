"""Map source folders and delivery ZIP contents to exact repository file bytes.

Read-only except for docs/archive-inventory.json. Run after copying/migrating.
An exit code of 1 means at least one original file has no byte-identical copy.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=ROOT.parent)
parser.add_argument('--generated-root', type=Path, help='Optional original image-generation output directory')
parser.add_argument('--reference', type=Path, help='Optional user-supplied original Clawd reference')
args = parser.parse_args()
SOURCE = args.source_root.resolve()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files_under(root):
    for directory, subdirectories, names in os.walk(root):
        subdirectories[:] = sorted(name for name in subdirectories
                                    if name not in {'.git', 'node_modules', '__pycache__', '.frames', '.local'})
        for name in sorted(names):
            yield Path(directory) / name


by_hash = {}
for file in files_under(ROOT):
    if file.relative_to(ROOT).parts[0] == 'docs':
        continue
    by_hash.setdefault(digest(file.read_bytes()), []).append(file.relative_to(ROOT).as_posix())


def item(name, data):
    sha = digest(data)
    return {'source_path': name, 'bytes': len(data), 'sha256': sha,
            'repository_paths': sorted(by_hash.get(sha, []))}


folders = []
for name in ['cavelux-motion-film', 'cavelux-clawd-clean-variations']:
    path = SOURCE / name
    if not path.is_dir():
        raise SystemExit(f'Missing source directory: {path}')
    records = [item(file.relative_to(path).as_posix(), file.read_bytes()) for file in files_under(path)]
    folders.append({'source_folder': name, 'files': records})

if args.generated_root:
    path = args.generated_root.resolve()
    if not path.is_dir():
        raise SystemExit(f'Missing generated-image directory: {path}')
    folders.append({'source_folder': 'generated-images', 'files': [
        item(file.relative_to(path).as_posix(), file.read_bytes()) for file in files_under(path)]})
if args.reference:
    path = args.reference.resolve()
    if not path.is_file():
        raise SystemExit(f'Missing user reference: {path}')
    folders.append({'source_folder': 'user-reference', 'files': [item(path.name, path.read_bytes())]})

archives = []
for name in ['cavelux-motion-kit.zip', 'cavelux-motion-kit-v2.zip', 'cavelux-clawd-clean-variations.zip']:
    path = SOURCE / name
    if not path.is_file():
        raise SystemExit(f'Missing source archive: {path}')
    with zipfile.ZipFile(path) as archive:
        records = [item(entry.filename, archive.read(entry))
                   for entry in archive.infolist() if not entry.is_dir()]
    archives.append({'source_archive': name, 'archive_sha256': digest(path.read_bytes()), 'files': records})

all_records = [record for group in folders + archives for record in group['files']]
missing = [record['source_path'] for record in all_records if not record['repository_paths']]
report = {
    'description': 'Local migration snapshot. Every source entry is matched by SHA-256 to at least one stored repository file when complete=true.',
    'method': 'SHA-256 over raw file bytes; archive members read without extraction. Duplicate content shares a repository copy.',
    'complete': not missing,
    'source_file_count': sum(len(group['files']) for group in folders),
    'archive_member_count': sum(len(group['files']) for group in archives),
    'unique_source_content_count': len({record['sha256'] for record in all_records}),
    'missing_entry_count': len(missing),
    'source_folders': folders,
    'source_archives': archives,
}
output = ROOT / 'docs' / 'archive-inventory.json'
output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({key: report[key] for key in ['complete', 'source_file_count', 'archive_member_count', 'unique_source_content_count', 'missing_entry_count']}, indent=2))
if missing:
    print('Missing original content:\n' + '\n'.join(missing))
    raise SystemExit(1)
