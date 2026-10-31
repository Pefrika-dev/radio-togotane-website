#!/usr/bin/env node
'use strict';

/*
 * Is Radio Togotane 88.3 FM actually feeding its online stream right now?
 *
 * The website plays whatever assets/js/config.js points at, so this tool answers
 * the one question that matters before blaming the site: does the station's
 * mount carry audio at this moment? It samples a few kilobytes, reports the
 * provider's own words when the mount is cold, and changes nothing on disk.
 *
 *   node tools/check-stream.js            check the configured address once
 *   node tools/check-stream.js --watch    check every minute, report each change
 *   node tools/check-stream.js --watch --every 15
 *   node tools/check-stream.js <url>      check any other address without
 *                                         editing assets/js/config.js
 *
 * Exit code is 0 when audio is flowing and 1 when it is not, so this can sit in
 * a cron job or a shell script. Ctrl+C stops --watch.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const MAX_REDIRECTS = 5;
const SAMPLE_BYTES = 32 * 1024;
const SAMPLE_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function configuredStreamUrl() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'), sandbox, {
    filename: 'assets/js/config.js',
  });
  const config = sandbox.window.RT_CONFIG || {};
  return String(config.streamUrl || '').trim();
}

function clock() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

function readBodyText(response) {
  return new Promise((resolve) => {
    let text = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(text);
    };
    const timer = setTimeout(finish, SAMPLE_MS);
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      text += chunk;
      if (text.length > 400) finish();
    });
    response.on('end', finish);
    response.on('error', finish);
  }).then((text) => {
    response.destroy();
    return text.slice(0, 400);
  });
}

function openUrl(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { headers: { 'User-Agent': USER_AGENT, Icy: 'Name=RadioTogotaneWebCheck' } }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      const isRedirect = [301, 302, 303, 307, 308].includes(status) && location;

      if (isRedirect && redirectsLeft > 0) {
        response.resume();
        openUrl(new URL(location, url).href, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      // Zeno answers with a signed redirect, so the address that finally replies
      // is not the configured one and belongs in the report.
      response.requestedUrl = url;
      resolve(response);
    });
    request.setTimeout(SAMPLE_MS, () => {
      request.destroy(new Error('timed out after ' + SAMPLE_MS + ' ms'));
    });
    request.on('error', reject);
  });
}

function looksLikeMp3(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x53) return true; // ID3
  for (let offset = 0; offset + 1 < bytes.length; offset++) {
    if (bytes[offset] === 0xff && (bytes[offset + 1] & 0xe0) === 0xe0) return true; // frame sync
  }
  return false;
}

async function check(url) {
  const started = Date.now();
  const response = await openUrl(url, MAX_REDIRECTS);
  const headers = response.headers;
  const finalHost = new URL(response.requestedUrl || url).host;
  const contentType = String(headers['content-type'] || '').toLowerCase();
  const isAudio = contentType.includes('audio') || contentType.includes('mpeg') || contentType.includes('icy');

  if (response.statusCode !== 200 || !isAudio) {
    const text = (await readBodyText(response)).replace(/\s+/g, ' ').trim();
    return {
      onAir: false,
      status: response.statusCode,
      host: finalHost,
      contentType: contentType || 'none',
      detail: text || 'no explanation from the provider',
    };
  }

  const chunks = [];
  let collected = 0;
  await new Promise((resolve) => {
    response.on('data', (chunk) => {
      chunks.push(chunk);
      collected += chunk.length;
      if (collected >= SAMPLE_BYTES) {
        response.destroy();
        resolve();
      }
    });
    response.on('end', resolve);
    response.on('close', resolve);
    response.on('error', resolve);
    setTimeout(() => {
      response.destroy();
      resolve();
    }, SAMPLE_MS);
  });

  const bytes = Buffer.concat(chunks);
  return {
    onAir: bytes.length > 0 && looksLikeMp3(bytes),
    status: response.statusCode,
    host: finalHost,
    contentType: contentType || 'none',
    stationName: headers['icy-name'] || '',
    bitrate: headers['icy-br'] ? headers['icy-br'] + ' kbps' : '',
    bytes: bytes.length,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  };
}

function describe(result) {
  if (result.onAir) {
    const parts = [
      result.contentType,
      result.stationName ? '“' + result.stationName + '”' : '',
      result.bitrate,
      result.bytes + ' bytes in ' + result.seconds + ' s',
    ].filter(Boolean);
    return 'ON AIR  ' + parts.join(' · ');
  }
  // A refused mount and an unanswered one are different facts: the first is the
  // station's source not being fed, the second is the provider not answering.
  if (!result.status) {
    return 'NOT ANSWERING  ' + result.host + ' · ' + result.detail;
  }
  return 'OFF AIR  HTTP ' + result.status + ' from ' + result.host + ' · ' + result.detail;
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((arg) => /^https?:\/\//i.test(arg)) || configuredStreamUrl();

  if (!/^https?:\/\//i.test(url)) {
    console.log('No stream address in assets/js/config.js, so there is nothing to check.');
    process.exit(1);
  }

  console.log('Checking: ' + url);

  if (!args.includes('--watch')) {
    let result;
    try {
      result = await check(url);
    } catch (error) {
      result = { onAir: false, status: 0, host: new URL(url).host, detail: String(error.message || error) };
    }
    console.log(clock() + ' EAT — ' + describe(result));
    console.log(
      result.onAir
        ? 'The station is feeding its online mount; the website player will play it.'
        : result.status
          ? 'The provider refused the mount. The station is not feeding it; no website setting can fix that — the browser is not the problem.'
          : 'The provider did not answer at all, so nothing can be heard from it; this is a network or provider condition, not a website bug.'
    );
    process.exit(result.onAir ? 0 : 1);
  }

  const everyIndex = args.indexOf('--every');
  const minutes = everyIndex !== -1 ? Math.max(1, Number(args[everyIndex + 1]) || 1) : 1;
  console.log('Watching every ' + minutes + ' minute(s). Ctrl+C to stop.');

  let last = null;
  async function poll() {
    let result;
    try {
      result = await check(url);
    } catch (error) {
      result = { onAir: false, status: 0, host: new URL(url).host, detail: String(error.message || error) };
    }
    if (result.onAir !== last) {
      console.log('');
      console.log(clock() + ' EAT — state changed to ' + (result.onAir ? 'ON AIR' : 'OFF AIR'));
      last = result.onAir;
    }
    console.log(clock() + ' EAT — ' + describe(result));
  }

  await poll();
  const timer = setInterval(() => poll().catch(() => {}), minutes * 60 * 1000);
  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\nStopped watching.');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Check failed: ' + (error && error.message ? error.message : error));
  process.exit(1);
});
