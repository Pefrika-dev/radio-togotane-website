'use strict';

/*
 * GET  /api/wall  -> the approved messages every listener may see
 * POST /api/wall  -> submit name, location and a message for the presenter,
 *                    or remove a message you submitted earlier
 *
 * Submissions wait in a queue. Nothing reaches the feed until a presenter
 * approves it, so the wall only ever carries what the station chose to publish.
 */

const {
  LIMITS,
  configured,
  mutate,
  readState: peek,
  digest,
  cleanText,
  readJson,
  clientIp,
  rateLimited,
  sendJson,
  publicView,
  retentionDays,
} = require('./_lib/wall');

function feed(state) {
  const approved = state.messages
    .filter((item) => item.status === 'approved')
    .sort((a, b) => Number(b.approvedAt || b.createdAt) - Number(a.approvedAt || a.createdAt))
    .slice(0, LIMITS.feedSize)
    .map(publicView);

  const pending = state.messages.filter((item) => item.status === 'pending').length;

  return { ok: true, messages: approved, pending, retentionDays: retentionDays() };
}

function newId(state, now) {
  state.seq = Number(state.seq || 0) + 1;
  return `${now.toString(36)}-${state.seq.toString(36)}`;
}

async function submit(req, res, body) {
  // Hidden field only a bot fills in.
  if (String(body.website || '').length) {
    sendJson(res, 400, { ok: false, error: 'rejected' });
    return;
  }

  if (body.consent !== true) {
    sendJson(res, 400, { ok: false, error: 'consent-required' });
    return;
  }

  const name = cleanText(body.name, LIMITS.name);
  const location = cleanText(body.location, LIMITS.location);
  const message = cleanText(body.message, LIMITS.message);
  const programme = cleanText(body.programme, LIMITS.programme);

  if (!name || !location || !message) {
    sendJson(res, 400, { ok: false, error: 'fields-required' });
    return;
  }

  if (await rateLimited(clientIp(req), 5, 60)) {
    sendJson(res, 429, { ok: false, error: 'too-many' });
    return;
  }

  const secret = require('node:crypto').randomBytes(18).toString('hex');
  const now = Date.now();

  const { state, result } = await mutate((draft) => {
    const item = {
      id: newId(draft, now),
      name,
      location,
      message,
      programme,
      status: 'pending',
      createdAt: now,
      secretHash: digest(secret),
    };
    draft.messages.push(item);
    return item;
  });

  const mine = publicView(result);
  sendJson(res, 201, {
    ok: true,
    id: mine.id,
    status: mine.status,
    secret,
    message: mine,
    feed: feed(state),
  });
}

async function removeOwn(res, body) {
  const id = cleanText(body.id, 40);
  const secret = cleanText(body.secret, 64);

  if (!id || !secret) {
    sendJson(res, 400, { ok: false, error: 'fields-required' });
    return;
  }

  const { result } = await mutate((draft) => {
    const index = draft.messages.findIndex((item) => item.id === id);
    if (index === -1) return 'missing';
    if (draft.messages[index].secretHash !== digest(secret)) return 'forbidden';
    draft.messages.splice(index, 1);
    return 'deleted';
  });

  if (result === 'deleted') {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, result === 'forbidden' ? 403 : 404, { ok: false, error: result });
}

module.exports = async function handler(req, res) {
  if (!configured()) {
    sendJson(res, 501, { ok: false, error: 'not-configured' });
    return;
  }

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const { state } = await peek();
      sendJson(res, 200, feed(state));
      return;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (body && body.action === 'delete') {
        await removeOwn(res, body);
        return;
      }
      await submit(req, res, body);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { ok: false, error: 'method' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'store-unavailable' });
  }
};
