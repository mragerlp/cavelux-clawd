import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const HOST = '127.0.0.1';
export const PORT = 8766;
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon',
}));

function withinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative));
}

function reply(response, status, text) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}

export async function startServer({ port = PORT } = {}) {
  const realRoot = await realpath(ROOT);
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        return reply(response, 405, 'Method not allowed');
      }
      const url = new URL(request.url, `http://${HOST}:${port}`);
      if (url.pathname === '/__cavelux_health') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify({
          service: 'cavelux-motion-film', root: ROOT,
        }));
        return;
      }
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); }
      catch { return reply(response, 400, 'Invalid URL encoding'); }
      if (decoded.includes('\0') || decoded.includes('\\')) {
        return reply(response, 400, 'Invalid path');
      }
      const candidate = path.resolve(ROOT, `.${decoded === '/' ? '/index.html' : decoded}`);
      if (!withinRoot(candidate, ROOT)) return reply(response, 403, 'Path denied');
      const resolved = await realpath(candidate);
      if (!withinRoot(resolved, realRoot)) return reply(response, 403, 'Path denied');
      const info = await stat(resolved);
      if (!info.isFile()) return reply(response, 404, 'Not found');
      response.setHeader('Content-Type', MIME.get(path.extname(resolved).toLowerCase())
        ?? 'application/octet-stream');
      response.setHeader('Accept-Ranges', 'bytes');
      let start = 0;
      let end = info.size - 1;
      let status = 200;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!match || (!match[1] && !match[2]) || info.size === 0) {
          response.setHeader('Content-Range', `bytes */${info.size}`);
          return reply(response, 416, 'Invalid range');
        }
        if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
        else start = Number(match[1]);
        if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
          || start > end || start >= info.size || end < 0) {
          response.setHeader('Content-Range', `bytes */${info.size}`);
          return reply(response, 416, 'Invalid range');
        }
        status = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      response.setHeader('Content-Length', info.size === 0 ? 0 : end - start + 1);
      response.writeHead(status);
      if (request.method === 'HEAD' || info.size === 0) return response.end();
      const stream = createReadStream(resolved, { start, end });
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      reply(response, missing ? 404 : 500, missing ? 'Not found' : 'Server error');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`CAVELUX preview: http://${HOST}:${PORT}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(() => process.exit(0)); });
  }
}
