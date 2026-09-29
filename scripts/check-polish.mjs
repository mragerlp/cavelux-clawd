import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'performance-evidence');
const mode = process.argv.includes('--control') ? 'control' : process.argv.includes('--candidate') ? 'candidate' : null;
if (!mode || process.argv.includes('--control') && process.argv.includes('--candidate')) throw new Error('Use exactly one of --control or --candidate');
const digest = value => createHash('sha256').update(value).digest('hex');
const boundaries = [225, 450, 675, 900, 1125];
const workload = {
  version: 1, width: 1080, height: 1920, deviceScaleFactor: 1,
  frames: [...new Set([150, 375, 600, 825, 1050, 1290, ...boundaries.flatMap(f => [f - 1, f, f + 8])])].sort((a, b) => a - b),
  warmupReplays: 1, timedReplaysPerAttempt: 7,
  operation: 'renderFrame(frame), then synchronous getImageData(0,0,1,1) readback',
};
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
const stats = values => ({count: values.length, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), minMs: Math.min(...values), maxMs: Math.max(...values)});
const summarize = attempts => {
  const samples = attempts.flatMap(a => a.samples);
  return {overall: stats(samples.map(s => s.milliseconds)), frames: workload.frames.map(frame => ({frame, ...stats(samples.filter(s => s.frame === frame).map(s => s.milliseconds))}))};
};
const report = {mode, startedAt: new Date().toISOString(), workload, workloadSHA256: digest(JSON.stringify(workload)), checks: [], attempts: [], pageErrors: []};
const check = (name, fn) => {
  try { report.checks.push({name, status: 'PASS', evidence: fn()}); }
  catch (error) { report.checks.push({name, status: 'FAIL', error: error.message}); }
};
await mkdir(output, {recursive: true});
const filmSourcePath = path.join(root, mode === 'control' ? 'archive/motion-v4/film.js' : 'motion/film.js');
const filmSource = await readFile(filmSourcePath);
report.filmSourcePath = path.relative(root, filmSourcePath).replaceAll('\\', '/');
report.sourceHashes = {
  film: digest(filmSource),
  packageLock: digest(await readFile(path.join(root, 'package-lock.json'))),
};
const health = await fetch('http://127.0.0.1:8766/__cavelux_health').then(r => r.json());
assert.equal(health.service, 'cavelux-motion-film');
assert.equal(path.resolve(health.root).toLowerCase(), path.join(root, 'motion').toLowerCase(), '8766 must serve this checkout');
const browser = await chromium.launch({channel: 'msedge', headless: true});
report.environment = {node: process.version, edge: browser.version(), platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, headless: true};
report.environmentSHA256 = digest(JSON.stringify(report.environment));
try {
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.route('**/film.js', route => route.fulfill({contentType: 'text/javascript', body: filmSource}));
  await page.goto('http://127.0.0.1:8766/?export=1', {waitUntil: 'load'});
  await page.evaluate(() => window.filmReady);
  const runAttempt = async () => {
    const result = await page.evaluate(({frames, timedReplaysPerAttempt}) => {
      const context = document.getElementById('film').getContext('2d');
      const draw = frame => {window.renderFrame(frame); context.getImageData(0, 0, 1, 1);};
      for (const frame of frames) draw(frame);
      const samples = [];
      for (let replay = 0; replay < timedReplaysPerAttempt; replay++) for (const frame of frames) {
        const started = performance.now(); draw(frame);
        samples.push({replay, frame, milliseconds: performance.now() - started});
      }
      return {samples};
    }, workload);
    result.statistics = summarize([result]);
    report.attempts.push(result);
  };
  await runAttempt();
  if (mode === 'candidate') {
    const control = JSON.parse(await readFile(path.join(output, 'control.json'), 'utf8'));
    if (!control.environmentSHA256) {
      control.environmentSHA256 = digest(JSON.stringify(control.environment));
      await writeFile(path.join(output, 'control.json'), JSON.stringify(control, null, 2) + '\n');
    }
    check('control and candidate use identical workload and toolchain', () => {
      assert.equal(control.workloadSHA256, report.workloadSHA256);
      assert.equal(control.sourceHashes.packageLock, report.sourceHashes.packageLock);
      assert.deepEqual(control.environment, report.environment);
      assert.equal(control.environmentSHA256, report.environmentSHA256);
      return {controlFilmSHA256: control.sourceHashes.film, candidateFilmSHA256: report.sourceHashes.film};
    });
    const compare = summary => {
      const baseline = control.statistics.overall;
      return {p50Ratio: summary.overall.p50Ms / baseline.p50Ms, p95Ratio: summary.overall.p95Ms / baseline.p95Ms,
        ceilingExceeded: summary.overall.p95Ms > 1000 / 30,
        regressionExceeded: summary.overall.p50Ms > baseline.p50Ms * 1.25 || summary.overall.p95Ms > baseline.p95Ms * 1.25,
        perFrame: summary.frames.map(s => {
          const b = control.statistics.frames.find(f => f.frame === s.frame);
          return {frame: s.frame, p50Ratio: s.p50Ms / b.p50Ms, p95Ratio: s.p95Ms / b.p95Ms, p95CeilingExceeded: s.p95Ms > 1000 / 30};
        })};
    };
    const initial = compare(summarize(report.attempts));
    if (initial.ceilingExceeded || initial.regressionExceeded || initial.perFrame.some(f => f.p95CeilingExceeded)) {
      report.retryReason = 'Initial threshold exceeded; two additional complete attempts retained to assess timing noise.';
      await runAttempt(); await runAttempt();
    }
    report.statistics = summarize(report.attempts);
    report.comparison = compare(report.statistics);
    check('render workload p95 remains within 33.333ms ceiling', () => {
      assert.ok(!report.comparison.ceilingExceeded, `Overall p95 ${report.statistics.overall.p95Ms}ms`);
      assert.deepEqual(report.comparison.perFrame.filter(f => f.p95CeilingExceeded), []);
      return report.statistics.overall;
    });
    check('render workload p50 and p95 regress no more than 25 percent', () => {
      assert.ok(!report.comparison.regressionExceeded, JSON.stringify(report.comparison));
      return {p50Ratio: report.comparison.p50Ratio, p95Ratio: report.comparison.p95Ratio, attempts: report.attempts.length};
    });
    report.boundaries = await page.evaluate(cuts => {
      const canvas = document.getElementById('film'), context = canvas.getContext('2d');
      const capture = frame => {window.renderFrame(frame); return context.getImageData(0, 0, canvas.width, canvas.height).data;};
      const differences = (a, b) => {let changed = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2] || a[i+3] !== b[i+3]) changed++; return changed;};
      return cuts.map(frame => {
        const previous = capture(frame-1), first = capture(frame), later = capture(frame+8), repeated = capture(frame);
        return {frame, firstVsPreviousChangedPixels: differences(first, previous), laterVsFirstChangedPixels: differences(later, first), repeatedChangedPixels: differences(first, repeated)};
      });
    }, boundaries);
    for (const result of report.boundaries) check(`cut ${result.frame} retains outgoing pixels, progresses, and repeats exactly`, () => {
      assert.equal(result.firstVsPreviousChangedPixels, 0);
      assert.ok(result.laterVsFirstChangedPixels > 0);
      assert.equal(result.repeatedChangedPixels, 0);
      return result;
    });
    const corpus = await page.evaluate(() => {
      const prototype = CanvasRenderingContext2D.prototype, original = prototype.fillText, originalStroke = prototype.strokeText;
      const found = new Map(); let frame = -1, drawCalls = 0;
      const observe = (method, context, args) => {
        if (context.canvas.id === 'film') {
          const text = String(args[0]), key = method + '\u0000' + text;
          const record = found.get(key) || {method, text, firstFrame: frame, lastFrame: frame, calls: 0};
          record.lastFrame = frame; record.calls++; drawCalls++; found.set(key, record);
        }
      };
      prototype.fillText = function(...args) {observe('fillText', this, args); return original.apply(this, args);};
      prototype.strokeText = function(...args) {observe('strokeText', this, args); return originalStroke.apply(this, args);};
      try {for (frame = 0; frame < 1350; frame++) window.renderFrame(frame);}
      finally {prototype.fillText = original; prototype.strokeText = originalStroke;}
      return {frames: 1350, drawCalls, entries: [...found.values()]};
    });
    await writeFile(path.join(output, 'text-corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
    const forbidden = [
      ['private names', /\b(?:FABLE|SOL|Bloodwave|Codex|Jared)\b/i],
      ['Windows filesystem path', /(?:[A-Za-z]:[\\/]|\\\\[^\s\\]+\\)/],
      ['absolute filesystem path', /(?:^|\s)(?:~?\/(?:Users|home|tmp|var|etc|opt|mnt|workspace|cavelux)(?:\/|\b))/i],
      ['filesystem path segments', /(?:^|\s)(?:~?\/|\.\.?\/)?[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/],
      ['UUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
      ['long hexadecimal hash', /\b[0-9a-f]{20,}\b/i],
    ];
    report.corpus = {frames: corpus.frames, drawCalls: corpus.drawCalls, uniqueEntries: corpus.entries.length, sha256: digest(JSON.stringify(corpus)), violations: corpus.entries.flatMap(entry => forbidden.filter(([, pattern]) => pattern.test(entry.text)).map(([rule]) => ({rule, ...entry})))};
    check('all 1350 rendered frames contain no private names, filesystem paths, UUIDs, or long hashes', () => {
      assert.equal(corpus.frames, 1350); assert.ok(corpus.drawCalls > 1350);
      assert.deepEqual(report.corpus.violations, []);
      return {frames: corpus.frames, drawCalls: corpus.drawCalls, uniqueEntries: corpus.entries.length};
    });
  } else {
    report.statistics = summarize(report.attempts);
    report.scope = 'Control records timing only; new candidate visual/copy assertions intentionally do not run against the old wipe.';
  }
  check('browser has no page errors', () => {assert.deepEqual(report.pageErrors, []); return [];});
  const endFilm = digest(await readFile(filmSourcePath));
  const endLock = digest(await readFile(path.join(root, 'package-lock.json')));
  check('film and dependency sources remained unchanged during capture', () => {
    assert.equal(endFilm, report.sourceHashes.film); assert.equal(endLock, report.sourceHashes.packageLock);
    return {filmSourcePath: report.filmSourcePath};
  });
} catch (error) {
  report.checks.push({name: 'harness execution', status: 'FAIL', error: error.stack});
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.summary = {passed: report.checks.filter(c => c.status === 'PASS').length, failed: report.checks.filter(c => c.status === 'FAIL').length};
  report.limitations = ['Timing covers synchronous Canvas rendering and a readback, not encoded video playback or GPU presentation.', 'The 33.333ms Canvas ceiling does not measure or establish a peak process-memory bound.', 'This fixed workload and host do not establish cross-platform performance or an optimization claim.', 'Text instrumentation observes Canvas fillText/strokeText; text embedded inside image assets requires separate visual review.'];
  await writeFile(path.join(output, `${mode}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({mode, ...report.summary, sourceHashes: report.sourceHashes, workloadSHA256: report.workloadSHA256, statistics: report.statistics?.overall, comparison: report.comparison && {p50Ratio: report.comparison.p50Ratio, p95Ratio: report.comparison.p95Ratio}}, null, 2));
  process.exitCode = report.summary.failed ? 1 : 0;
}
