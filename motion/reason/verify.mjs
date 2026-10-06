// REASON reel delivery checks (R1). Follows motion/verify.mjs; adds the reel's profile,
// colour, audio-format, loudness, safe-zone and eye-on-screen checks.
//   node motion/reason/verify.mjs PATH/reason-reel_v1.mp4
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const videoPath = path.resolve(process.argv[2] ?? '');
const cuesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cues.json');
function run(command, args, binary = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; let stderr = '';
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-262144); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({ stdout: binary ? Buffer.concat(out) : Buffer.concat(out).toString(), stderr, exitCode: code })
      : reject(new Error(`${command} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}
const rate = text => { const [n, d = 1] = String(text).split('/').map(Number); return n / d; };
const report = { file: videoPath, checks: [] };
const check = (name, ok, evidence) => { report.checks.push({ name, status: ok ? 'PASS' : 'FAIL', evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(evidence)}`); };
try {
  const probe = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', videoPath]);
  assert.equal(probe.stderr.trim(), '', 'ffprobe reported errors');
  const meta = JSON.parse(probe.stdout), v = meta.streams.find(s => s.codec_type === 'video'), a = meta.streams.find(s => s.codec_type === 'audio');
  report.ffprobe = { video: v, audio: a, format: meta.format };
  check('one video and one audio stream', meta.streams.length === 2 && v && a, meta.streams.map(s => s.codec_type));
  check('1080x1920', v.width === 1080 && v.height === 1920, [v.width, v.height]);
  check('H.264 High yuv420p', v.codec_name === 'h264' && v.profile === 'High' && v.pix_fmt === 'yuv420p', [v.codec_name, v.profile, v.pix_fmt]);
  check('bt709 colour tags', v.color_space === 'bt709' && v.color_transfer === 'bt709' && v.color_primaries === 'bt709', [v.color_space, v.color_transfer, v.color_primaries, v.color_range]);
  check('30 fps', rate(v.avg_frame_rate) === 30 && rate(v.r_frame_rate) === 30, [v.avg_frame_rate, v.r_frame_rate]);
  check('900 decoded frames', Number(v.nb_read_frames) === 900, v.nb_read_frames);
  check('video duration 30.00 s', Math.abs(Number(v.duration) - 30) <= 1 / 30, v.duration);
  check('AAC 48 kHz stereo', a.codec_name === 'aac' && Number(a.sample_rate) === 48000 && a.channels === 2, [a.codec_name, a.sample_rate, a.channels]);
  check('audio and container 30.00 s', Math.abs(Number(a.duration) - 30) <= .1 && Math.abs(Number(meta.format.duration) - 30) <= .1, [a.duration, meta.format.duration]);
  const decode = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', videoPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
  check('full decode exit 0, no errors', decode.exitCode === 0 && decode.stderr.trim() === '', { exitCode: decode.exitCode });
  const loud = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', videoPath, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = loud.stderr.slice(loud.stderr.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), LRA = Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]), TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  report.ebur128 = summary.trim();
  check('integrated -14 LUFS +/- 0.5 (ebur128 on the MP4)', Math.abs(I + 14) <= .5, { I, LRA });
  check('true peak <= -1.5 dBTP (ebur128 on the MP4)', TP <= -1.5, { TP });
  // safe zone: every frame's top 250 rows and bottom 420 rows stay black (limited-range luma <= 20)
  for (const [name, crop] of [['top 250 px', 'crop=1080:250:0:0'], ['bottom 420 px', 'crop=1080:420:0:1500']]) {
    const stats = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', videoPath, '-map', '0:v:0', '-vf', `${crop},signalstats,metadata=print:key=lavfi.signalstats.YMAX`, '-f', 'null', '-']);
    const values = [...stats.stderr.matchAll(/lavfi\.signalstats\.YMAX=(\d+)/g)].map(m => Number(m[1]));
    check(`safe zone ${name} empty on every frame`, values.length === 900 && Math.max(...values) <= 20, { frames: values.length, maxY: Math.max(...values) });
  }
  // the CAVELUX eye is on screen from frame 0 (first impression and loop seam) through 3.0 s:
  // lime pixels around the hook eye's centre (540, 712) at frames 0, 21 and 90
  for (const frame of [0, 21, 90]) {
    const raw = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', videoPath, '-vf', `select=eq(n\\,${frame}),crop=360:360:360:532`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], true);
    let lime = 0; for (let i = 0; i < raw.stdout.length; i += 3) { const r = raw.stdout[i], g = raw.stdout[i + 1], b = raw.stdout[i + 2]; if (g > 170 && r < 210 && b < 110 && g > r) lime++; }
    check(`eye (lime) on screen at frame ${frame}`, lime > 300, { limePixels: lime, region: 'x360-720 y532-892' });
  }
  // mono safety for phone speakers: decoded MP4 audio L/R correlation
  const pcm = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', videoPath, '-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], true);
  const f32 = new Float32Array(pcm.stdout.buffer, pcm.stdout.byteOffset, Math.floor(pcm.stdout.length / 4));
  let sl = 0, sr = 0, sll = 0, srr = 0, slr = 0, n = 0;
  for (let i = 0; i + 1 < f32.length; i += 2) { const l = f32[i], r = f32[i + 1]; sl += l; sr += r; sll += l * l; srr += r * r; slr += l * r; n++; }
  const corr = (slr - sl * sr / n) / Math.sqrt((sll - sl * sl / n) * (srr - sr * sr / n));
  check('audio is mono-safe (MP4 L/R correlation >= 0.5)', corr >= .5, { correlation: Number(corr.toFixed(3)) });
  // Instagram layout, from the cue file that ships with this code: every caption row (cursor included)
  // stays left of the right-side action rail and inside the caption band
  const cues = JSON.parse(await readFile(cuesPath, 'utf8'));
  const rows = cues.captions.flatMap(c => c.rows.map(r => ({ ...r, claim: c.claim })));
  const maxRight = Math.max(...rows.map(r => r.right)), top = Math.min(...rows.map(r => r.baseline)) - 54, bottom = Math.max(...rows.map(r => r.baseline)) + 16;
  check('captions clear of the Reels action rail (row right edge incl. cursor <= 936)', rows.every(r => Number.isFinite(r.right) && r.right <= 936), { rows: rows.length, maxRight });
  check('caption rows inside y 250-1490', top >= 250 && bottom <= 1490, { top, bottom });
} catch (error) { check('verification execution', false, String(error.stack ?? error)); }
report.status = report.checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify({ status: report.status, passed: report.checks.filter(c => c.status === 'PASS').length, failed: report.checks.filter(c => c.status === 'FAIL').length }));
if (process.argv[3]) await (await import('node:fs/promises')).writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.status === 'PASS' ? 0 : 1;
