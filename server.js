'use strict';

/*
 * Local preview server for the built static site.
 *
 * This is not production hosting. Any static host works (Netlify, Cloudflare
 * Pages, GitHub Pages, Vercel, or a plain web server) because the site is
 * plain HTML, CSS and JavaScript with no server-side code.
 *
 * The two /api endpoints below exist only so the on-air message wall can be
 * exercised in a browser before the real store is connected. They keep messages
 * in this process, so everything is gone when the server stops, and production
 * never runs this file — the deployed site answers /api from Vercel functions in
 * api/. Set WALL_DEV=0 to serve them as unavailable, the way a host without the
 * store configured would.
 *
 * Usage: node server.js   →   http://localhost:4173
 * Set PORT to change the port. Run `npm run build` first.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const WALL_DEV = process.env.WALL_DEV !== '0';
const DEV_STUDIO_TOKEN = process.env.STUDIO_TOKEN || 'dev-studio-token';

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

/* -------------------------------------------------------------------------- */
/* Local message wall store — preview only, see the header comment.           */
/* -------------------------------------------------------------------------- */

const devWall = { seq: 0, messages: [] };

function devJson(res, status, body) {
  send(res, status, JSON.stringify(body), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function devClean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function devReadBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        resolve({});
      }
    });
  });
}

function devView(item) {
  return {
    id: item.id,
    name: item.name,
    location: item.location,
    message: item.message,
    programme: item.programme || '',
    createdAt: item.createdAt,
    status: item.status,
  };
}

function devFeed() {
  const approved = devWall.messages
    .filter((item) => item.status === 'approved')
    .sort((a, b) => b.approvedAt - a.approvedAt)
    .slice(0, 40)
    .map(devView);

  return {
    ok: true,
    messages: approved,
    pending: devWall.messages.filter((item) => item.status === 'pending').length,
    retentionDays: 30,
    preview: true,
  };
}

function devLists() {
  const byNewest = (a, b) => b.createdAt - a.createdAt;
  return {
    ok: true,
    preview: true,
    pending: devWall.messages.filter((item) => item.status === 'pending').sort(byNewest).map(devView),
    approved: devWall.messages.filter((item) => item.status === 'approved').sort(byNewest).map(devView),
  };
}

const devHits = new Map();

function devRateLimited(req, limit = 5) {
  const ip = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'local');
  const windowStart = Math.floor(Date.now() / 60000);
  const key = `${ip}:${windowStart}`;
  if (devHits.size > 500) devHits.clear();
  const next = (devHits.get(key) || 0) + 1;
  devHits.set(key, next);
  return next > limit;
}

async function handleDevWall(req, res) {
  if (!WALL_DEV) {
    devJson(res, 501, { ok: false, error: 'not-configured' });
    return;
  }

  if (req.method === 'GET') {
    devJson(res, 200, devFeed());
    return;
  }

  const body = await devReadBody(req);

  if (req.method === 'POST' && body.action === 'delete') {
    const index = devWall.messages.findIndex((item) => item.id === devClean(body.id, 40));
    if (index === -1 || devWall.messages[index].secretHash !== crypto.createHash('sha256').update(String(body.secret || '')).digest('hex')) {
      devJson(res, index === -1 ? 404 : 403, { ok: false, error: index === -1 ? 'missing' : 'forbidden' });
      return;
    }
    devWall.messages.splice(index, 1);
    devJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST') {
    devJson(res, 405, { ok: false, error: 'method' });
    return;
  }

  const name = devClean(body.name, 40);
  const location = devClean(body.location, 60);
  const message = devClean(body.message, 240);

  if (String(body.website || '').length) {
    devJson(res, 400, { ok: false, error: 'rejected' });
    return;
  }

  if (body.consent !== true || !name || !location || !message) {
    devJson(res, 400, { ok: false, error: body.consent !== true ? 'consent-required' : 'fields-required' });
    return;
  }

  if (devRateLimited(req)) {
    devJson(res, 429, { ok: false, error: 'too-many' });
    return;
  }

  devWall.seq += 1;
  const createdAt = Date.now();
  const secret = crypto.randomBytes(18).toString('hex');
  const item = {
    id: `${createdAt.toString(36)}-${devWall.seq.toString(36)}`,
    name,
    location,
    message,
    programme: devClean(body.programme, 60),
    status: 'pending',
    createdAt,
    approvedAt: 0,
    secretHash: crypto.createHash('sha256').update(secret).digest('hex'),
  };
  devWall.messages.push(item);

  devJson(res, 201, { ok: true, id: item.id, status: item.status, secret, message: devView(item), feed: devFeed() });
}

async function handleDevStudio(req, res) {
  if (!WALL_DEV) {
    devJson(res, 501, { ok: false, error: 'not-configured' });
    return;
  }

  if (req.headers['x-studio-token'] !== DEV_STUDIO_TOKEN) {
    devJson(res, 401, { ok: false, error: 'unauthorised' });
    return;
  }

  if (req.method === 'GET') {
    devJson(res, 200, devLists());
    return;
  }

  const body = await devReadBody(req);
  const id = devClean(body.id, 40);
  const item = devWall.messages.find((entry) => entry.id === id);

  if (!item) {
    devJson(res, 404, { ok: false, error: 'missing' });
    return;
  }

  if (body.action === 'delete') {
    devWall.messages.splice(devWall.messages.indexOf(item), 1);
  } else {
    item.status = body.action === 'approve' ? 'approved' : 'rejected';
    item.reviewedAt = Date.now();
    if (body.action === 'approve') item.approvedAt = Date.now();
  }

  devJson(res, 200, Object.assign({ action: devClean(body.action, 10), result: item.status }, devLists()));
}
/* -------------------------------------------------------------------------- */

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
  const route = decodeURIComponent(String(req.url || '/').split('?')[0]);

  if (route === '/api/wall') {
    handleDevWall(req, res).catch(() => devJson(res, 500, { ok: false, error: 'store-unavailable' }));
    return;
  }

  if (route === '/api/studio') {
    handleDevStudio(req, res).catch(() => devJson(res, 500, { ok: false, error: 'store-unavailable' }));
    return;
  }

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
