'use strict';

/*
 * Shared store for the on-air message wall.
 *
 * State lives in one KV key and is replaced with Upstash's CAS command, which
 * only writes when the value still matches what was read. A competing writer
 * makes CAS return 0 and the caller re-reads and retries, so two presenters
 * approving at the same moment cannot overwrite each other's decision.
 *
 * Secrets are never stored here: the credentials arrive as environment
 * variables at request time, and a listener's delete token is stored only as a
 * digest.
 */

const crypto = require('node:crypto');

const STATE_KEY = 'rt:wall:v1';
const CAS_RETRIES = 4;

const LIMITS = {
  name: 40,
  location: 60,
  message: 240,
  programme: 60,
  bodyBytes: 8 * 1024,
  maxMessages: 200,
  feedSize: 40,
};

function kvUrl() {
  return String(process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

function kvToken() {
  return String(process.env.KV_REST_API_TOKEN || '');
}

function configured() {
  return Boolean(kvUrl() && kvToken());
}

async function command(...args) {
  const response = await fetch(`${kvUrl()}/v3/${encodeURIComponent(args[0])}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${kvToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args.slice(1)),
  });

  if (!response.ok) {
    throw new Error(`kv ${args[0]} failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload && payload.result !== undefined ? payload.result : null;
}

function emptyState() {
  return { v: 1, seq: 0, messages: [] };
}

function parseState(raw) {
  if (typeof raw !== 'string' || !raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) return emptyState();
    return parsed;
  } catch (err) {
    return emptyState();
  }
}

function retentionDays() {
  const days = Number(process.env.WALL_RETENTION_DAYS);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function retentionMs() {
  return retentionDays() * 24 * 60 * 60 * 1000;
}

function purge(state, now) {
  const cutoff = now - retentionMs();
  state.messages = state.messages.filter((item) => Number(item.createdAt) >= cutoff);
  if (state.messages.length > LIMITS.maxMessages) {
    state.messages = state.messages.slice(state.messages.length - LIMITS.maxMessages);
  }
  return state;
}

async function readState() {
  const raw = await command('GET', STATE_KEY);
  return { raw: typeof raw === 'string' ? raw : null, state: purge(parseState(raw), Date.now()) };
}

async function writeState(rawBefore, next) {
  const candidate = JSON.stringify(next);

  if (rawBefore === null) {
    // First write wins only if the key is still absent.
    const created = await command('SET', STATE_KEY, candidate, 'NX');
    if (created === 'OK') return true;
    return false;
  }

  const applied = await command('CAS', STATE_KEY, rawBefore, candidate);
  return Number(applied) === 1;
}

async function mutate(fn) {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt += 1) {
    const { raw, state } = await readState();
    const before = JSON.stringify(state);
    const result = fn(state, Date.now());

    if (JSON.stringify(state) === before) return { state, result, changed: false };
    if (await writeState(raw, state)) return { state, result, changed: true };
  }

  throw new Error('wall store is busy');
}

function digest(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMITS.bodyBytes) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('bad-json'));
      }
    });

    req.on('error', reject);
  });
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const first = forwarded.split(',')[0].trim();
  return first || 'unknown';
}

async function rateLimited(ip, limit, windowSeconds) {
  // Without a real client address the bucket would be shared by every listener,
  // so one busy minute could lock the whole town out.
  if (ip === 'unknown') return false;
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rt:rl:${ip}:${bucket}`;
  const count = await command('INCR', key);
  if (Number(count) === 1) await command('EXPIRE', key, windowSeconds);
  return Number(count) > limit;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, body) {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function publicView(item) {
  return {
    id: item.id,
    name: item.name,
    location: item.location,
    message: item.message,
    programme: item.programme || '',
    createdAt: Number(item.createdAt),
    status: item.status,
  };
}

module.exports = {
  STATE_KEY,
  LIMITS,
  configured,
  mutate,
  readState,
  digest,
  tokenMatches,
  cleanText,
  readJson,
  clientIp,
  rateLimited,
  sendJson,
  noStore,
  publicView,
  retentionDays,
};
