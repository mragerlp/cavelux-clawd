// REASON reel renderer. Follows motion/render.mjs (same server, browser fallback and
// encode chain); a sibling file so the v6 renderer and its 1350-frame contract stay untouched.
//   node motion/reason/render.mjs --cues                      write motion/reason/cues.json
//   node motion/reason/render.mjs --stills DIR --frames a,b   PNG stills
//   node motion/reason/render.mjs --out DIR --audio WAV       reason-reel_v1.mp4 + render-report.json
import path from 'node:path';
import { mkdir, rename, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ROOT, HOST, PORT, startServer } from '../server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FRAMES = 900, FPS = 30, WIDTH = 1080, HEIGHT = 1920;
const BASE_URL = `http://${HOST}:${PORT}`;
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const mode = args.includes('--cues') ? 'cues' : option('--stills') ? 'stills' : option('--out') ? 'video' : null;
if (!mode) throw new Error('Choose --cues, --stills DIR or --out DIR --audio WAV');

let ownedServer, browser, encoder;
const browserErrors = [];

async function ensureServer() {
  try { ownedServer = await startServer(); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const response = await fetch(`${BASE_URL}/__cavelux_health`, { signal: AbortSignal.timeout(3000) });
    const health = await response.json();
    if (!response.ok || health.service !== 'cavelux-motion-film' || path.resolve(health.root) !== path.resolve(ROOT)) {
      throw new Error(`Port ${PORT} belongs to another service or checkout; refusing to render it.`);
    }
  }
}
function assertClean() { if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join('\n')}`); }

async function capture(page, frame, format = 'image/png') {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAMES) throw new Error(`Frame outside 0..${FRAMES - 1}: ${frame}`);
  const { dataUrl, text } = await page.evaluate(({ frame, format, width, height }) => {
    window.reelText = [];
    window.renderFrame(frame);
    const canvas = document.querySelector('canvas#reel');
    if (!canvas || canvas.width !== width || canvas.height !== height) throw new Error(`Expected canvas#reel ${width}x${height}`);
    const text = window.reelText; window.reelText = null;
    return { dataUrl: canvas.toDataURL(format, format === 'image/jpeg' ? 0.97 : undefined), text };
  }, { frame, format, width: WIDTH, height: HEIGHT });
  assertClean();
  const prefix = `data:${format};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new Error(`Invalid canvas capture at frame ${frame}`);
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (bytes.length < 100) throw new Error(`Empty canvas capture at frame ${frame}`);
  return { bytes, text };
}

async function encode(page, outDir, audio) {
  await access(audio);
  await mkdir(outDir, { recursive: true });
  const output = path.join(outDir, 'reason-reel_v1.mp4'), temp = path.join(outDir, '.reason-reel_v1.rendering.mp4');
  const ffArgs = ['-hide_banner', '-loglevel', 'warning', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
    '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=in_range=full:out_range=limited:in_color_matrix=bt470bg:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(FPS), '-frames:v', String(FRAMES), '-t', '30',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', temp];
  encoder = spawn('ffmpeg', ffArgs, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '', stdinError;
  encoder.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-65536); });
  encoder.stdin.on('error', e => { stdinError = e; });
  const finished = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}:\n${stderr}`))); });
  finished.catch(() => {});
  const corpus = new Map(), started = Date.now();
  for (let frame = 0; frame < FRAMES; frame++) {
    const { bytes, text } = await capture(page, frame, 'image/jpeg');
    for (const s of text) { const e = corpus.get(s) ?? { text: s, firstFrame: frame, lastFrame: frame, frames: 0 }; e.lastFrame = frame; e.frames++; corpus.set(s, e); }
    if (stdinError) throw stdinError;
    if (!encoder.stdin.write(bytes)) await Promise.race([once(encoder.stdin, 'drain'), finished.then(() => { throw new Error('ffmpeg closed early'); })]);
    if ((frame + 1) % 150 === 0) console.log(`Render ${frame + 1}/${FRAMES}; ${Math.round((Date.now() - started) / 1000)}s elapsed.`);
  }
  encoder.stdin.end(); await finished; assertClean();
  await rename(temp, output);
  const report = { output, frames: FRAMES, fps: FPS, width: WIDTH, height: HEIGHT, audio, ffmpegWarnings: stderr.trim(),
    drawnText: [...corpus.values()].sort((a, z) => a.firstFrame - z.firstFrame) };
  await writeFile(path.join(outDir, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Render complete: ${output}`);
  if (stderr.trim()) console.log(`ffmpeg warnings:\n${stderr.trim()}`);
}

try {
  await ensureServer();
  const executablePath = [process.env.CAVELUX_BROWSER_PATH, chromium.executablePath(),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(c => c && existsSync(c));
  if (!executablePath) throw new Error('No installed Chromium browser found. Set CAVELUX_BROWSER_PATH.');
  browser = await chromium.launch({ executablePath, headless: true });
  console.log(`Browser: ${executablePath}`);
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on('pageerror', e => browserErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') browserErrors.push(`${m.text()} (${m.location().url || 'page'})`); });
  const response = await page.goto(`${BASE_URL}/reason/index.html?export=1`, { waitUntil: 'load' });
  if (!response?.ok()) throw new Error(`Reel page returned HTTP ${response?.status()}`);
  await page.waitForFunction(() => Boolean(window.reelReady), null, { timeout: 60000 });
  await page.evaluate(async () => { await window.reelReady; });
  assertClean();
  if (mode === 'cues') {
    const cues = await page.evaluate(() => window.reelCues);
    const file = path.join(ROOT, 'reason', 'cues.json');
    await writeFile(file, JSON.stringify(cues, null, 1) + '\n');
    console.log(`Cues: ${file} (${cues.clicks.length} glyph clicks, ${cues.transitions.length} transitions, ${cues.scans.length} scans)`);
  } else if (mode === 'stills') {
    const dir = option('--stills'); await mkdir(dir, { recursive: true });
    const frames = (option('--frames') ?? '0,90,300,500,700,950').split(',').map(Number);
    for (const frame of frames) await writeFile(path.join(dir, `frame-${String(frame).padStart(4, '0')}.png`), (await capture(page, frame)).bytes);
    console.log(`Stills: ${frames.length} PNG in ${dir}`);
  } else {
    const audio = option('--audio'); if (!audio) throw new Error('--audio WAV is required');
    await encode(page, option('--out'), audio);
  }
} catch (error) {
  console.error(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGKILL');
  if (browser) await browser.close();
  if (ownedServer) await new Promise(resolve => ownedServer.close(resolve));
}
