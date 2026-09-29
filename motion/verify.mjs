import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './server.mjs';

const videoPath = path.resolve(process.argv[2] ?? path.join(ROOT, 'output', 'cavelux-from-signal-to-spectrum.mp4'));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    process.stdout.on('data', data => { stdout += data.toString(); });
    process.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-65536); });
    process.once('error', reject);
    process.once('close', code => code === 0 ? resolve({ stdout, stderr, exitCode: code })
      : reject(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}

function rate(text) {
  const [numerator, denominator = 1] = String(text).split('/').map(Number);
  return numerator / denominator;
}

try {
  const probe = await run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams',
    '-show_format', '-of', 'json', videoPath]);
  assert.equal(probe.stderr.trim(), '', 'ffprobe reported errors');
  const metadata = JSON.parse(probe.stdout);
  const videos = metadata.streams.filter(stream => stream.codec_type === 'video');
  const audios = metadata.streams.filter(stream => stream.codec_type === 'audio');
  assert.equal(videos.length, 1, 'Expected exactly one video stream');
  assert.equal(audios.length, 1, 'Expected exactly one audio stream');
  const video = videos[0];
  const audio = audios[0];
  assert.equal(video.width, 1080, 'Video width');
  assert.equal(video.height, 1920, 'Video height');
  assert.equal(video.codec_name, 'h264', 'Video codec');
  assert.equal(video.pix_fmt, 'yuv420p', 'Video pixel format');
  assert.equal(rate(video.avg_frame_rate), 30, 'Average frame rate');
  assert.equal(rate(video.r_frame_rate), 30, 'Nominal frame rate');
  assert.equal(Number(video.nb_read_frames), 1350, 'Decoded frame count');
  if (video.nb_frames !== undefined) assert.equal(Number(video.nb_frames), 1350, 'Container frame count');
  assert.ok(Math.abs(Number(video.duration) - 45) <= 1 / 30, `Video duration ${video.duration}`);
  assert.equal(audio.codec_name, 'aac', 'Audio codec');
  assert.ok(Math.abs(Number(audio.duration) - 45) <= 0.1, `Audio duration ${audio.duration}`);
  assert.ok(Math.abs(Number(metadata.format.duration) - 45) <= 0.1,
    `Container duration ${metadata.format.duration}`);
  const decoded = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', videoPath,
    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
  assert.equal(decoded.stderr.trim(), '', 'Full video/audio decode reported errors');
  console.log(JSON.stringify({
    status: 'PASS', file: videoPath,
    video: { width: video.width, height: video.height, codec: video.codec_name,
      pixelFormat: video.pix_fmt, fps: rate(video.avg_frame_rate),
      frames: Number(video.nb_read_frames), duration: Number(video.duration) },
    audio: { codec: audio.codec_name, duration: Number(audio.duration),
      sampleRate: Number(audio.sample_rate), channels: audio.channels },
    ffprobeExitCode: probe.exitCode, fullDecodeExitCode: decoded.exitCode,
    unverified: ['Instagram upload/transcode behavior', 'human aesthetic approval'],
  }, null, 2));
} catch (error) {
  console.error(`Verification FAIL: ${error.stack ?? error}`);
  process.exitCode = 1;
}
