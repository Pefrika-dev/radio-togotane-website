'use strict';

/*
 * Pre-flight checks for the built site.
 *
 * Run `npm run build` first, then `npm run check`. The script verifies:
 *   - every data-i18n key exists in both English and Kiswahili
 *   - the two dictionaries have identical keys
 *   - dynamic keys used by app.js and data.js exist
 *   - internal links, images and fonts resolve to real files
 *   - pages have a title, description, one h1, no leftover build tokens
 *   - ids are unique and every form control has a label
 *   - every built page is one the player can swap to without reloading
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const notes = [];

function report(message) {
  errors.push(message);
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function list(dir) {
  return fs.readdirSync(path.join(ROOT, dir));
}

/* Dictionaries ---------------------------------------------------------- */

const sandbox = { window: {} };
vm.runInNewContext(read('assets/js/i18n.js'), sandbox, { filename: 'i18n.js' });
const i18n = sandbox.window.RT_I18N || {};
const en = i18n.en || {};
const sw = i18n.sw || {};

if (!Object.keys(en).length || !Object.keys(sw).length) report('i18n.js does not expose en and sw dictionaries');

Object.keys(en).forEach((key) => {
  if (typeof sw[key] !== 'string' || !sw[key].trim()) report(`Missing Kiswahili string: ${key}`);
});
Object.keys(sw).forEach((key) => {
  if (typeof en[key] !== 'string' || !en[key].trim()) report(`Missing English string: ${key}`);
});

/* Markup keys ----------------------------------------------------------- */

const sources = [];
list('src/pages').forEach((file) => sources.push({ name: `src/pages/${file}`, text: read(`src/pages/${file}`) }));
list('src/partials').forEach((file) => sources.push({ name: `src/partials/${file}`, text: read(`src/partials/${file}`) }));

const usedKeys = new Set();
sources.forEach(({ name, text }) => {
  const pattern = /data-i18n(?:-aria-label|-placeholder|-title)?="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(text))) {
    usedKeys.add(match[1]);
  }
});

usedKeys.forEach((key) => {
  if (typeof en[key] !== 'string') report(`data-i18n key without English string: ${key}`);
  if (typeof sw[key] !== 'string') report(`data-i18n key without Kiswahili string: ${key}`);
});

/* Dynamic keys ---------------------------------------------------------- */

const appSource = read('assets/js/app.js');
const dataSource = read('assets/js/data.js');
const dynamicKeys = new Set();
let dynamic;
const callPattern = /\bt\('([^']+)'/g;
while ((dynamic = callPattern.exec(appSource))) dynamicKeys.add(dynamic[1]);
const notePattern = /noteKey:\s*'([^']+)'/g;
while ((dynamic = notePattern.exec(dataSource))) dynamicKeys.add(dynamic[1]);

dynamicKeys.forEach((key) => {
  if (typeof en[key] !== 'string') report(`Dynamic key without English string: ${key}`);
  if (typeof sw[key] !== 'string') report(`Dynamic key without Kiswahili string: ${key}`);
});

/* Built pages ----------------------------------------------------------- */

const pages = fs
  .readdirSync(ROOT)
  .filter((file) => file.endsWith('.html'));

if (!pages.length) report('No built HTML files. Run "npm run build" first.');

/* In-page navigation keeps the audio playing; a page it does not know about stops it. */
const routeList = appSource.match(/const PAGE_NAMES = \[([^\]]*)\]/);
if (!routeList) {
  report('assets/js/app.js: the PAGE_NAMES navigation list is missing');
} else {
  const routed = (routeList[1].match(/'([^']+)'/g) || []).map((token) => token.slice(1, -1));
  pages.forEach((file) => {
    const name = file.replace(/\.html$/, '');
    if (name === 'index' || name === '404') return;
    if (!routed.includes(name)) report(`${file} is not in PAGE_NAMES, so listening stops there`);
  });
  routed.forEach((name) => {
    if (!pages.includes(name + '.html')) report(`PAGE_NAMES lists ${name}, but ${name}.html was not built`);
  });
}

function localTarget(url) {
  const clean = url.split('#')[0].split('?')[0].replace(/&amp;/g, '&').trim();
  if (!clean) return null;
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(clean)) return null;
  return clean.replace(/^\//, '');
}

pages.forEach((file) => {
  const html = read(file);

  if (/\{\{[A-Z_]+\}\}/.test(html)) report(`${file}: un-replaced build token`);
  if (!/<html[^>]+lang="(en|sw)"/.test(html)) report(`${file}: html lang attribute missing or not en/sw`);
  if (!/<title>[^<]{10,}<\/title>/.test(html)) report(`${file}: title missing or too short`);
  if (!/<meta name="description" content="[^"]{40,}"/.test(html)) report(`${file}: meta description missing or too short`);

  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) report(`${file}: expected exactly one h1, found ${h1}`);

  const ids = new Set();
  let idMatch;
  const idPattern = /\sid="([^"]+)"/g;
  while ((idMatch = idPattern.exec(html))) {
    if (ids.has(idMatch[1])) report(`${file}: duplicate id "${idMatch[1]}"`);
    ids.add(idMatch[1]);
  }

  let linkMatch;
  const linkPattern = /\s(?:href|src)="([^"]+)"/g;
  while ((linkMatch = linkPattern.exec(html))) {
    const target = localTarget(linkMatch[1]);
    if (!target) continue;
    if (target === '') continue;
    if (!fs.existsSync(path.join(ROOT, target))) report(`${file}: linked file missing → ${target}`);
  }

  let srcsetMatch;
  const srcsetPattern = /\ssrcset="([^"]+)"/g;
  while ((srcsetMatch = srcsetPattern.exec(html))) {
    srcsetMatch[1].split(',').forEach((entry) => {
      const target = localTarget(entry.trim().split(/\s+/)[0]);
      if (target && !fs.existsSync(path.join(ROOT, target))) report(`${file}: srcset file missing → ${target}`);
    });
  }

  if (file !== '404.html') {
    const hrefs = (html.match(/href="#"/g) || []).length;
    if (hrefs) report(`${file}: ${hrefs} empty href="#" link(s)`);
  }

  const controls = html.match(/<(?:input|select|textarea)\b[^>]*>/g) || [];
  controls.forEach((tag) => {
    if (/type="(hidden|submit|button)"/.test(tag)) return;
    const idMatchControl = tag.match(/\sid="([^"]+)"/);
    if (!idMatchControl) {
      report(`${file}: form control without an id → ${tag.slice(0, 60)}`);
      return;
    }
    const id = idMatchControl[1];
    if (!new RegExp(`for="${id}"`).test(html)) report(`${file}: form control "${id}" has no label[for]`);
  });

  const viewLabels = html.match(/<button\b[^>]*>\s*<svg/g) || [];
  viewLabels.forEach((button) => {
    if (!/aria-label=|data-i18n-aria-label=/.test(button)) {
      report(`${file}: icon-only button without an accessible label`);
    }
  });
});

/* Config sanity --------------------------------------------------------- */

const config = read('assets/js/config.js');
if (!/streamUrl:\s*''/.test(config) && !/streamUrl:\s*'https:\/\//.test(config)) {
  report('config.js: streamUrl should be empty or an https:// address');
}
if (!/whatsapp:\s*'254714426619'/.test(config)) report('config.js: WhatsApp number is not the station number');
if (!/email:\s*'togotaneradiofm@gmail\.com'/.test(config)) report('config.js: station email is not exact');

/* Result ---------------------------------------------------------------- */

notes.push(`${usedKeys.size} markup keys, ${dynamicKeys.size} dynamic keys`);
notes.push(`${pages.length} built pages, ${Object.keys(en).length} strings per language`);

if (errors.length) {
  console.error(`FAIL — ${errors.length} problem(s):`);
  errors.forEach((message) => console.error(`  • ${message}`));
  process.exit(1);
}

notes.forEach((note) => console.log(`ok: ${note}`));
console.log('PASS — markup, translations, links and labels look consistent.');
