'use strict';

/*
 * The presenter's queue. Every request must carry the station's studio token in
 * the x-studio-token header; without it nothing is read and nothing changes.
 *
 * GET  /api/studio -> { pending: [...], approved: [...] }
 * POST /api/studio -> { action: 'approve' | 'reject' | 'delete', id }
 */

const {
  configured,
  mutate,
  readState,
  tokenMatches,
  cleanText,
  readJson,
  clientIp,
  rateLimited,
  sendJson,
  publicView,
} = require('./_lib/wall');

function authorise(req) {
  const expected = String(process.env.STUDIO_TOKEN || '');
  if (!expected) return 'not-configured';
  return tokenMatches(req.headers['x-studio-token'], expected) ? '' : 'unauthorised';
}

function lists(state) {
  const byNewest = (a, b) => Number(b.createdAt) - Number(a.createdAt);

  return {
    ok: true,
    pending: state.messages.filter((item) => item.status === 'pending').sort(byNewest).map(publicView),
    approved: state.messages.filter((item) => item.status === 'approved').sort(byNewest).map(publicView),
  };
}

module.exports = async function handler(req, res) {
  if (!configured()) {
    sendJson(res, 501, { ok: false, error: 'not-configured' });
    return;
  }

  const authError = authorise(req);
  if (authError) {
    sendJson(res, authError === 'not-configured' ? 501 : 401, { ok: false, error: authError });
    return;
  }

  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const { state } = await readState();
      sendJson(res, 200, lists(state));
      return;
    }

    if (req.method === 'POST') {
      if (await rateLimited(clientIp(req), 120, 60)) {
        sendJson(res, 429, { ok: false, error: 'too-many' });
        return;
      }

      const body = await readJson(req);
      const action = cleanText(body.action, 10);
      const id = cleanText(body.id, 40);

      if (!['approve', 'reject', 'delete'].includes(action) || !id) {
        sendJson(res, 400, { ok: false, error: 'bad-request' });
        return;
      }

      const { state, result } = await mutate((draft) => {
        const item = draft.messages.find((entry) => entry.id === id);
        if (!item) return 'missing';

        if (action === 'delete') {
          draft.messages.splice(draft.messages.indexOf(item), 1);
          return 'deleted';
        }

        item.status = action === 'approve' ? 'approved' : 'rejected';
        item.reviewedAt = Date.now();
        return item.status;
      });

      if (result === 'missing') {
        sendJson(res, 404, { ok: false, error: result });
        return;
      }

      sendJson(res, 200, Object.assign({ action, result }, lists(state)));
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { ok: false, error: 'method' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'store-unavailable' });
  }
};
