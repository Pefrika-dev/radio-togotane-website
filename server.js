'use strict';

/*
 * Local preview server for the built static site.
 *
 * This is not production hosting. Any static host works (Netlify, Cloudflare
 * Pages, GitHub Pages, Vercel, or a plain web server) because the site is
 * plain HTML, CSS and JavaScript with no server-side code.
 *
 * Usage: node server.js   →   http://localhost:4173
 * Set PORT to change the port. Run `npm run build` first.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(body);
}

function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = path.posix.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const requested = path.join(ROOT, clean === '/' ? 'index.html' : clean);
  const relative = path.relative(ROOT, requested);

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (relative.split(path.sep).some((part) => part.startsWith('.') && part !== '')) return null;
  if (path.basename(requested) === 'server.js' || path.basename(requested) === 'build.js') return null;

  return requested;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return;
  }

  let target;
  try {
    target = resolveFile(req.url || '/');
  } catch (err) {
    send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  if (!target) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  fs.stat(target, (statError, stats) => {
    let file = target;

    if (!statError && stats.isDirectory()) {
      file = path.join(target, 'index.html');
    }

    if (statError) {
      serveNotFound(res);
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isMedia = ext === '.mp3';
    const cache = ext === '.html' ? 'no-cache' : isMedia ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate';

    if (isMedia && req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range).trim());
      if (!match || (match[1] === '' && match[2] === '')) {
        send(res, 416, '', { 'Content-Type': type, 'Content-Range': `bytes */${stats.size}` });
        return;
      }

      let start = match[1] === '' ? null : Number(match[1]);
      let end = match[2] === '' ? null : Number(match[2]);

      if (start === null) {
        start = Math.max(0, stats.size - end);
        end = stats.size - 1;
      } else if (end === null || end >= stats.size) {
        end = stats.size - 1;
      }

      if (start > end || start >= stats.size) {
        send(res, 416, '', { 'Content-Type': type, 'Content-Range': `bytes */${stats.size}` });
        return;
      }

      res.writeHead(206, Object.assign({}, SECURITY_HEADERS, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cache,
      }));

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    fs.readFile(file, (readError, buffer) => {
      if (readError) {
        serveNotFound(res);
        return;
      }

      const headers = { 'Content-Type': type, 'Cache-Control': cache };
      if (isMedia) {
        headers['Accept-Ranges'] = 'bytes';
        headers['Content-Length'] = buffer.length;
      }

      if (req.method === 'HEAD') {
        send(res, 200, '', headers);
        return;
      }

      send(res, 200, buffer, headers);
    });
  });
});

function serveNotFound(res) {
  const notFound = path.join(ROOT, '404.html');
  fs.readFile(notFound, (missingError, page) => {
    if (missingError) {
      send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    } else {
      send(res, 404, page, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    }
  });
}

server.listen(PORT, HOST, () => {
  console.log(`Radio Togotane preview: http://${HOST}:${PORT}`);
  console.log('Static preview only. Run "npm run build" after editing src/.');
});
