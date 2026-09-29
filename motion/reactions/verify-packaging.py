from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name('package.py')


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copyfile(SCRIPT, self.root / 'package.py')
        (self.root / 'output').mkdir()
        (self.root / '.frames' / 'probe').mkdir(parents=True)
        (self.root / 'catalog.json').write_text('[{"id":"probe","duration":0.05,"fps":20}]')
        for name in ('README.md', 'PRODUCTION-BOARD.md', 'output/manifest.json', 'output/probe.gif', 'output/probe.png', 'output/probe.mp4'):
            (self.root / name).write_bytes(b'fixture ' + name.encode())
        self.archive = self.root / 'output' / 'cavelux-clawd-pack-01.zip'

    def run_package(self):
        return subprocess.run([sys.executable, str(self.root / 'package.py')], capture_output=True)

    def test_missing_master_preserves_previous_archive(self):
        with zipfile.ZipFile(self.archive, 'w') as archive:
            archive.writestr('prior.txt', 'A previously good pack')
        before = self.archive.read_bytes()
        result = self.run_package()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.archive.read_bytes(), before, 'A failed build overwrote the previous good archive')

    def test_completed_archive_contains_exact_inputs_and_is_reproducible(self):
        (self.root / '.frames/probe/0000.png').write_bytes(b'master frame fixture')
        result = self.run_package()
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        before = self.archive.read_bytes()
        with zipfile.ZipFile(self.archive) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(len(archive.namelist()), 8)
            self.assertEqual(archive.read('masters/probe/0000.png'), b'master frame fixture')
            self.assertEqual(archive.read('probe.gif'), b'fixture output/probe.gif')
        self.assertEqual(self.run_package().returncode, 0)
        self.assertEqual(self.archive.read_bytes(), before)


result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PackagingTests))
print(json.dumps({'check': 'archive failure handling', 'passed': result.testsRun-len(result.failures)-len(result.errors), 'failed': len(result.failures)+len(result.errors), 'exitCode': 0 if result.wasSuccessful() else 1}))
raise SystemExit(0 if result.wasSuccessful() else 1)
