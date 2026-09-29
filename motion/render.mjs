import path from 'node:path';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ROOT, HOST, PORT, startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const FRAME_COUNT = 1350;
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_DIRECTORY = path.join(ROOT, 'output');
const OUTPUT = path.join(OUTPUT_DIRECTORY, 'cavelux-from-signal-to-spectrum.mp4');
const TEMP_OUTPUT = path.join(OUTPUT_DIRECTORY, '.cavelux-from-signal-to-spectrum.rendering.mp4');
const AUDIO = path.join(ROOT, 'audio', 'master.wav');
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!['--stills-only', '--check-only'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
}
if (flags.size > 1) throw new Error('Choose --stills-only or --check-only, not both.');

let ownedServer;
let browser;
let encoder;
const browserErrors = [];

async function ensureServer() {
  try { ownedServer = await startServer(); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const response = await fetch(`${BASE_URL}/__cavelux_health`, { signal: AbortSignal.timeout(3000) });
    const health = await response.json();
    if (!response.ok || health.service !== 'cavelux-motion-film'
      || path.resolve(health.root) !== path.resolve(ROOT)) {
      throw new Error(`Port ${PORT} belongs to another service; refusing to render it.`);
    }
  }
}

function assertBrowserClean() {
  if (browserErrors.length) throw new Error(`Browser errors:\n${browserErrors.join('\n')}`);
}

async function capture(page, frame, format = 'image/png') {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAME_COUNT) {
    throw new Error(`Frame outside 0..${FRAME_COUNT - 1}: ${frame}`);
  }
  const dataUrl = await page.evaluate(({ frame, format, width, height }) => {
    const result = window.renderFrame(frame);
    if (typeof result === 'number' && !Number.isFinite(result)) {
      throw new Error(`renderFrame(${frame}) returned a non-finite number`);
    }
    const canvas = document.querySelector('canvas#film');
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      throw new Error(`Expected canvas#film ${width}x${height}; got ${canvas?.width}x${canvas?.height}`);
    }
    return canvas.toDataURL(format, format === 'image/jpeg' ? 0.97 : undefined);
  }, { frame, format, width: WIDTH, height: HEIGHT });
  assertBrowserClean();
  const prefix = `data:${format};base64,`;
  if (!dataUrl.startsWith(prefix)) throw new Error(`Invalid canvas capture at frame ${frame}`);
  const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (bytes.length < 100) throw new Error(`Empty canvas capture at frame ${frame}`);
  return bytes;
}

async function checkFlow(page) {
  const frames = [0, 1, 149, 150, 299, 300, 449, 450, 599, 600, 749, 750,
    899, 900, 1049, 1050, 1199, 1200, 1348, 1349];
  for (const frame of frames) await capture(page, frame);
  assertBrowserClean();
  console.log(`Flow PASS: ${frames.length} boundary samples; canvas ${WIDTH}x${HEIGHT}; no console/page errors or non-finite canvas arguments.`);
}

async function exportStills(page) {
  const directory = path.join(OUTPUT_DIRECTORY, 'stills');
  await mkdir(directory, { recursive: true });
  for (const frame of [90, 315, 540, 765, 990, 1260]) {
    const name = `keyframe-${String(frame).padStart(4, '0')}.png`;
    await writeFile(path.join(directory, name), await capture(page, frame));
  }
  await writeFile(path.join(OUTPUT_DIRECTORY, 'cover.png'), await capture(page, 1245));
  console.log('Stills PASS: six PNG keyframes in output/stills and output/cover.png (frame 1245).');
}

async function exportVideo(page) {
  await access(AUDIO);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const args = ['-hide_banner', '-loglevel', 'warning', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
    '-i', AUDIO, '-map', '0:v:0', '-map', '1:a:0',
    // Canvas JPEG is full-range BT.601 (ffprobe: pc/bt470bg); convert samples,
    // then label the limited-range BT.709 H.264 output explicitly.
    '-vf', 'scale=in_range=full:out_range=limited:in_color_matrix=bt470bg:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'fast',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(FPS), '-frames:v', String(FRAME_COUNT), '-t', '45',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', TEMP_OUTPUT];
  encoder = spawn('ffmpeg', args, { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let stdinError;
  encoder.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-65536); });
  encoder.stdin.on('error', error => { stdinError = error; });
  const finished = new Promise((resolve, reject) => {
    encoder.once('error', reject);
    encoder.once('close', code => code === 0 ? resolve() : reject(
      new Error(`ffmpeg exited ${code}:\n${stderr}`)));
  });
  finished.catch(() => {});
  const started = Date.now();
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const jpeg = await capture(page, frame, 'image/jpeg');
    if (stdinError) throw stdinError;
    if (!encoder.stdin.write(jpeg)) {
      await Promise.race([once(encoder.stdin, 'drain'), finished.then(() => {
        throw new Error('ffmpeg closed before all frames were supplied.');
      })]);
    }
    if ((frame + 1) % 150 === 0) {
      console.log(`Render ${frame + 1}/${FRAME_COUNT} (${Math.round((frame + 1) / FRAME_COUNT * 100)}%); ${Math.round((Date.now() - started) / 1000)}s elapsed.`);
    }
  }
  encoder.stdin.end();
  await finished;
  assertBrowserClean();
  await rename(TEMP_OUTPUT, OUTPUT);
  console.log(`Render complete: ${OUTPUT}`);
  if (stderr.trim()) console.log(`ffmpeg warnings:\n${stderr.trim()}`);
}

try {
  await ensureServer();
  const executablePath = [process.env.CAVELUX_BROWSER_PATH, chromium.executablePath(),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(candidate => candidate && existsSync(candidate));
  if (!executablePath) throw new Error('No installed Chromium browser found. Set CAVELUX_BROWSER_PATH to its executable.');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log(`Browser: ${executablePath}`);
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`${message.text()} (${message.location().url || 'page'})`);
  });
  await page.addInitScript(() => {
    const methods = ['setTransform', 'transform', 'translate', 'rotate', 'scale',
      'fillRect', 'strokeRect', 'clearRect', 'moveTo', 'lineTo', 'bezierCurveTo',
      'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'drawImage',
      'createLinearGradient', 'createRadialGradient', 'createConicGradient',
      'putImageData', 'fillText', 'strokeText'];
    for (const name of methods) {
      const original = CanvasRenderingContext2D.prototype[name];
      if (typeof original !== 'function') continue;
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        if (args.some(value => typeof value === 'number' && !Number.isFinite(value))) {
          throw new Error(`Non-finite canvas argument in ${name}`);
        }
        return original.apply(this, args);
      };
    }
    for (const name of ['globalAlpha', 'lineWidth', 'miterLimit', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY']) {
      const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, name);
      if (!descriptor?.set) continue;
      Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
        ...descriptor,
        set(value) {
          if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Non-finite canvas property ${name}`);
          descriptor.set.call(this, value);
        },
      });
    }
  });
  const response = await page.goto(`${BASE_URL}/index.html?export=1`, { waitUntil: 'load' });
  if (!response?.ok()) throw new Error(`Film page returned HTTP ${response?.status()}`);
  await page.waitForFunction(() => Boolean(window.filmReady) && typeof window.renderFrame === 'function', null, { timeout: 60000 });
  await page.evaluate(async () => { await window.filmReady; });
  await checkFlow(page);
  if (!flags.has('--check-only')) await exportStills(page);
  if (!flags.has('--check-only') && !flags.has('--stills-only')) await exportVideo(page);
} catch (error) {
  console.error(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGKILL');
  if (browser) await browser.close();
  if (ownedServer) await new Promise(resolve => ownedServer.close(resolve));
}
