#!/usr/bin/env node
'use strict';

/*
 * Listen-back recorder.
 *
 * Captures the station's online stream to disk and keeps the archive manifest
 * used by podcasts.html up to date. One file per hour (or per reconnection),
 * named for the published programme that was scheduled at the moment the
 * recording started.
 *
 *   node tools/record.js                 run until stopped (Ctrl+C)
 *   node tools/record.js --minutes 5     run for five minutes, then stop
 *
 * Requirements: Node.js 20+, an internet connection, and permission to record
 * the station's stream. The stream URL and schedule are read from
 * assets/js/config.js and assets/js/data.js so there is still one source of
 * truth. Nothing here invents audio: if the feed is offline, no file is written.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'media', 'podcasts');
const MANIFEST = path.join(ROOT, 'assets', 'data', 'episodes.json');
const TZ = 'Africa/Nairobi';
const BITRATE = 128000;
const BYTES_PER_SECOND = BITRATE / 8;
const MIN_SECONDS = 10;
const MAX_REDIRECTS = 5;
const STALL_MS = 45000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function loadScript(relative) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(relative), sandbox, { filename: relative });
  return sandbox.window;
}

const config = loadScript('assets/js/config.js').RT_CONFIG || {};
const schedule = (loadScript('assets/js/data.js').RT_DATA || {}).schedule || [];
const streamUrl = String(config.streamUrl || '').trim();

let siteUrl = '';
try {
  siteUrl = String(JSON.parse(read('site.json')).siteUrl || '').replace(/\/+$/, '');
} catch (err) {
  siteUrl = '';
}

if (!/^https?:\/\//i.test(streamUrl)) {
  console.error('No stream URL in assets/js/config.js. Nothing to record.');
  process.exit(1);
}

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nairobiNow(date) {
  const parts = clock.formatToParts(date || new Date());
  const value = {};
  parts.forEach(function (part) {
    value[part.type] = part.value;
  });
  const hour = Number(value.hour) % 24;
  return {
    date: value.year + '-' + value.month + '-' + value.day,
    hh: String(hour).padStart(2, '0'),
    mm: value.minute,
    ss: value.second,
    day: WEEKDAYS[value.weekday],
    minutes: hour * 60 + Number(value.minute),
    iso:
      value.year + '-' + value.month + '-' + value.day + 'T' + String(hour).padStart(2, '0') + ':' +
      value.minute + ':' + value.second + '+03:00',
  };
}

function toMinutes(time) {
  const parts = String(time).split(':');
  return Number(parts[0]) * 60 + Number(parts[1] || 0);
}

function programmeAt(now) {
  for (let i = 0; i < schedule.length; i++) {
    const programme = schedule[i];
    if (programme.days.indexOf(now.day) === -1) continue;
    const start = toMinutes(programme.start);
    let end = toMinutes(programme.end);
    if (end <= start) end += 1440;
    if (now.minutes >= start && now.minutes < end) return programme;
  }
  return null;
}

function log(message) {
  console.log('[' + nairobiNow().iso.slice(11, 19) + '] ' + message);
}

function secondsToClock(total) {
  const seconds = Math.max(0, Math.round(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  return minutes + ':' + String(rest).padStart(2, '0');
}

/* Manifest --------------------------------------------------------------- */

function readManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (parsed && Array.isArray(parsed.episodes)) return parsed.episodes;
  } catch (err) {
    /* A missing or unreadable manifest is rebuilt from the files on disk. */
  }
  return [];
}

function existingEpisodes() {
  return readManifest().filter(function (episode) {
    if (!episode || !episode.id || !episode.file) return false;
    if (!/^media\/podcasts\/[A-Za-z0-9._-]+\.mp3$/.test(episode.file)) return false;
    return fs.existsSync(path.join(ROOT, episode.file));
  });
}

function writeManifest(episode) {
  const episodes = existingEpisodes().filter(function (item) {
    return item.id !== episode.id;
  });
  episodes.push(episode);
  episodes.sort(function (a, b) {
    return String(b.startedAt).localeCompare(String(a.startedAt));
  });

  const payload = {
    generatedAt: nairobiNow().iso,
    timezone: TZ,
    bitrateKbps: BITRATE / 1000,
    note: 'One file per hour of the online stream. Programme labels follow the published schedule.',
    episodes: episodes,
  };

  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  const tmp = MANIFEST + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, MANIFEST);

  log('manifest now lists ' + episodes.length + ' recording(s)');
  writeRss(episodes);
}

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rssTitle(episode) {
  const date = new Date(episode.startedAt);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = {};
  parts.forEach(function (part) {
    value[part.type] = part.value;
  });
  return (episode.programme || 'Between programmes') + ' — ' + value.day + ' ' + value.month + ' ' + value.year + ', ' + value.hour + ':' + value.minute + ' EAT';
}

function writeRss(episodes) {
  if (!siteUrl) {
    log('podcast.xml skipped: set site.json siteUrl to publish an RSS feed');
    return;
  }

  const items = episodes
    .map(function (episode) {
      return [
        '    <item>',
        '      <title>' + xml(rssTitle(episode)) + '</title>',
        '      <guid isPermaLink="false">' + xml(episode.id) + '</guid>',
        '      <pubDate>' + new Date(episode.startedAt).toUTCString() + '</pubDate>',
        '      <enclosure url="' + xml(siteUrl + '/' + episode.file) + '" length="' + episode.bytes + '" type="audio/mpeg" />',
        '      <itunes:duration>' + episode.durationSeconds + '</itunes:duration>',
        '      <description>' + xml(episode.presenters && episode.presenters.length ? episode.presenters.join(', ') : 'Between programmes') + '</description>',
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const rss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">',
    '  <channel>',
    '    <title>Radio Togotane 88.3 FM — Listen back</title>',
    '    <link>' + xml(siteUrl + '/podcasts.html') + '</link>',
    '    <description>Automatic hourly recordings of Radio Togotane 88.3 FM, Kehancha, Migori County.</description>',
    '    <language>en</language>',
    '    <itunes:author>Radio Togotane 88.3 FM</itunes:author>',
    '    <itunes:explicit>false</itunes:explicit>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  fs.writeFileSync(path.join(ROOT, 'podcast.xml'), rss);
  log('podcast.xml written with ' + episodes.length + ' item(s)');
}

/* Recorder --------------------------------------------------------------- */

const state = {
  session: null,
  segment: null,
  rotating: false,
  retryTimer: null,
  retryDelay: 3000,
  lastDataAt: 0,
  stopping: false,
  startedAt: Date.now(),
};

function openSegment(now) {
  const programme = programmeAt(now);
  const slug = programme ? programme.id : 'off-air';
  const stamp = now.hh + now.mm + now.ss;
  const id = now.date + '-' + stamp + '-' + slug;
  const fileName = now.date + '_' + stamp + '_' + slug + '.mp3';
  const finalPath = path.join(OUT_DIR, fileName);
  const partPath = finalPath + '.part';

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const stream = fs.createWriteStream(partPath, { flags: 'w' });
  stream.on('error', function (error) {
    log('write error: ' + error.message);
    shutdown('write error', 1);
  });

  state.segment = {
    id: id,
    slug: slug,
    file: 'media/podcasts/' + fileName,
    partPath: partPath,
    finalPath: finalPath,
    hourKey: now.date + ' ' + now.hh,
    startedAt: now.iso,
    programme: programme
      ? {
          id: programme.id,
          name: programme.name,
          presenters: programme.presenters.map(function (person) {
            return person.alias ? person.name + ' (' + person.alias + ')' : person.name;
          }),
        }
      : null,
    stream: stream,
    bytes: 0,
    waitingForDrain: false,
    closed: false,
  };

  log(
    'recording ' + (programme ? programme.name : 'between programmes') +
      ' → ' + fileName
  );
}

function writeChunk(session, chunk) {
  const segment = state.segment;
  if (!segment || segment.closed) return;
  segment.bytes += chunk.length;
  const ok = segment.stream.write(chunk);
  if (!ok && !segment.waitingForDrain) {
    segment.waitingForDrain = true;
    session.res.pause();
    segment.stream.once('drain', function () {
      segment.waitingForDrain = false;
      if (!session.closed) session.res.resume();
    });
  }
}

function closeSegment() {
  const segment = state.segment;
  if (!segment) return Promise.resolve();
  state.segment = null;

  return new Promise(function (resolve) {
    segment.closed = true;
    segment.stream.end(function () {
      const seconds = Math.round(segment.bytes / BYTES_PER_SECOND);
      if (segment.bytes < BYTES_PER_SECOND * MIN_SECONDS) {
        fs.rmSync(segment.partPath, { force: true });
        log('discarded short capture (' + secondsToClock(seconds) + ')');
        resolve();
        return;
      }

      try {
        fs.renameSync(segment.partPath, segment.finalPath);
      } catch (error) {
        log('could not finalise file: ' + error.message);
        resolve();
        return;
      }

      const endedAt = nairobiNow().iso;
      const episode = {
        id: segment.id,
        file: segment.file,
        programmeId: segment.programme ? segment.programme.id : '',
        programme: segment.programme ? segment.programme.name : '',
        presenters: segment.programme ? segment.programme.presenters : [],
        startedAt: segment.startedAt,
        endedAt: endedAt,
        durationSeconds: seconds,
        bytes: segment.bytes,
      };

      writeManifest(episode);
      log(
        'saved ' + segment.file + ' · ' + secondsToClock(seconds) + ' · ' +
          (segment.bytes / 1024 / 1024).toFixed(1) + ' MB'
      );
      resolve();
    });
  });
}

function rotate(session) {
  if (state.rotating) return;
  state.rotating = true;
  session.res.pause();
  state.rotatingPromise = closeSegment().then(function () {
    state.rotating = false;
    state.rotatingPromise = null;
    if (state.stopping || session.closed) return;
    openSegment(nairobiNow());
    session.res.resume();
  });
}

function retry(reason) {
  if (state.stopping) return;
  const delay = state.retryDelay;
  state.retryDelay = Math.min(state.retryDelay * 2, 60000);
  log(reason + ' — retrying in ' + Math.round(delay / 1000) + 's');
  clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(connect, delay);
}

function endSession(reason) {
  const session = state.session;
  if (!session || session.closed) return;
  session.closed = true;
  state.session = null;
  try {
    session.req.destroy();
  } catch (err) {
    /* Already closed. */
  }
  closeSegment();
  retry('stream ended (' + reason + ')');
}

function requestStream(url, hops, done) {
  const parsed = new URL(url);
  const lib = parsed.protocol === 'http:' ? http : https;
  let settled = false;

  function finish(error, res, req) {
    if (settled) return;
    settled = true;
    done(error, res, req);
  }

  const req = lib.get(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'audio/mpeg, audio/*;q=0.9, */*;q=0.8',
        'Icy-MetaData': '0',
        'Cache-Control': 'no-cache',
      },
    },
    function (res) {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].indexOf(status) !== -1 && res.headers.location) {
        settled = true;
        res.resume();
        if (hops >= MAX_REDIRECTS) {
          done(new Error('too many redirects'));
          return;
        }
        requestStream(new URL(res.headers.location, url).toString(), hops + 1, done);
        return;
      }
      if (status !== 200) {
        res.resume();
        finish(new Error('HTTP ' + status));
        return;
      }
      const type = String(res.headers['content-type'] || '');
      if (!/^(audio\/|application\/octet-stream)/i.test(type)) {
        res.resume();
        finish(new Error('unexpected content type ' + (type || 'unknown')));
        return;
      }
      finish(null, res, req);
    }
  );

  req.setTimeout(30000, function () {
    req.destroy(new Error('connection timed out'));
  });
  req.on('error', function (error) {
    finish(error);
  });
}

function connect() {
  if (state.stopping) return;

  requestStream(streamUrl, 0, function (error, res, req) {
    if (state.stopping) {
      if (req) req.destroy();
      return;
    }
    if (error) {
      retry('could not connect (' + error.message + ')');
      return;
    }

    const session = { req: req, res: res, closed: false };
    state.session = session;
    state.retryDelay = 3000;
    state.lastDataAt = Date.now();

    req.on('error', function (streamError) {
      if (!session.closed) endSession(streamError.message);
    });
    res.on('error', function (streamError) {
      if (!session.closed) endSession(streamError.message);
    });
    res.on('end', function () {
      if (!session.closed) endSession('connection closed');
    });

    res.on('data', function (chunk) {
      if (session.closed) return;
      state.lastDataAt = Date.now();

      const now = nairobiNow();
      if (!state.segment) {
        openSegment(now);
      } else if (!state.rotating && state.segment.hourKey !== now.date + ' ' + now.hh) {
        writeChunk(session, chunk);
        rotate(session);
        return;
      }
      writeChunk(session, chunk);
    });

    log('connected to the stream');
  });
}

function shutdown(reason, code) {
  if (state.stopping) return;
  state.stopping = true;
  clearTimeout(state.retryTimer);
  log('stopping (' + reason + ')');

  const session = state.session;
  if (session && !session.closed) {
    session.closed = true;
    state.session = null;
    try {
      session.req.destroy();
    } catch (err) {
      /* Already closed. */
    }
  }

  const pending = state.rotatingPromise || Promise.resolve();
  pending
    .then(function () {
      return closeSegment();
    })
    .then(function () {
      process.exit(code || 0);
    });
}

/* Start ------------------------------------------------------------------ */

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(MANIFEST)) writeManifestFallback();

function writeManifestFallback() {
  const payload = {
    generatedAt: nairobiNow().iso,
    timezone: TZ,
    bitrateKbps: BITRATE / 1000,
    note: 'One file per hour of the online stream. Programme labels follow the published schedule.',
    episodes: [],
  };
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(payload, null, 2) + '\n');
}

const minuteArgIndex = process.argv.indexOf('--minutes');
if (minuteArgIndex !== -1) {
  const minutes = Number(process.argv[minuteArgIndex + 1]);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.error('Usage: node tools/record.js [--minutes N]');
    process.exit(1);
  }
  setTimeout(function () {
    shutdown('time limit reached');
  }, minutes * 60000);
  log('capture limit: ' + minutes + ' minute(s)');
}

process.on('SIGINT', function () {
  shutdown('Ctrl+C');
});
process.on('SIGTERM', function () {
  shutdown('SIGTERM');
});

setInterval(function () {
  const session = state.session;
  if (session && !session.closed && Date.now() - state.lastDataAt > STALL_MS) {
    log('no audio for ' + Math.round(STALL_MS / 1000) + 's');
    endSession('stalled');
  }
}, 15000).unref();

connect();
