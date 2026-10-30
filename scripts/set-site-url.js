'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run seo -- https://your-domain.example');
  process.exit(1);
}

let url;
try {
  url = new URL(input);
} catch {
  console.error('That is not a valid URL.');
  process.exit(1);
}
if (url.protocol !== 'https:') {
  console.error('Use an https:// address. The live site must be served over HTTPS.');
  process.exit(1);
}

const siteUrl = url.origin + url.pathname.replace(/\/+$/, '');
fs.writeFileSync(path.join(root, 'site.json'), `${JSON.stringify({ siteUrl }, null, 2)}\n`);
console.log(`Saved siteUrl: ${siteUrl}`);
execFileSync(process.execPath, [path.join(root, 'build.js')], { stdio: 'inherit' });
