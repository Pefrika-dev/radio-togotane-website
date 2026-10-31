# Radio Togotane 88.3 FM — official station website

A complete, dependency-free website for **Radio Togotane 88.3 FM**, Kehancha, Migori County, Kenya. It was built as a design proposal and the station has since approved it as its own site, so the pages speak as Radio Togotane and carry no builder credit. The site is built as static HTML, CSS and vanilla JavaScript, with a bilingual English/Kiswahili interface, a persistent light/dark theme, a published programme schedule, a live player connected to the station's online stream, an automatic listen-back archive of recent broadcast hours, presenter and news layouts, advertising and community-announcement pages, and a contact page. It carries the station's own logo and its verified public channels.

Everything that was not supplied or publicly published by the station is either omitted or clearly marked as pending. No presenters' biographies, news stories, events, social profiles, audience figures, awards, coverage claims or advertising rates have been invented.

**Live site:** <https://radio-togotane-website.vercel.app> — this is the canonical address, and every canonical tag, Open Graph URL and `sitemap.xml` entry points here. The same build is also served at <https://pefrika-dev.github.io/radio-togotane-website/> as a mirror; its pages carry canonical tags to Vercel, so search engines credit one address only. The station's own domain can replace it at any time by running `npm run seo -- https://your-domain`, rebuilding and redeploying.

---

## 1. What is included

- **Home** — hero, live-listening panel, station facts, schedule preview, presenter preview, news preview, advertising band, community/events preview, an official-channels strip and a contact band.
- **About** — an identity plate with the station's logo and its verified public channels, what the station publishes today, a photograph from the station's own public post, audience, principles and a visible list of information still to be supplied.
- **Programs** — the published weekday and Saturday schedule in tabs, a Sunday placeholder, East Africa Time clock, current-programme highlighting and keyboard support.
- **Listen back** — recordings of the online stream in hourly files, tagged with the programme that was published for that hour, with programme filters, a built-in player, seeking and honest empty/error states. One genuine four-minute clip is included; longer archives appear as the recorder runs.
- **Presenters** — the seven named presenters, one portrait taken from the station's own public post, neutral placeholders instead of invented portraits or biographies, and the separately named news team with roles marked as unconfirmed.
- **News** — category filters, a featured sample card, sample story cards and an accessible article dialog. Every sample is labelled as a sample.
- **Advertise** — the twelve advertising services, the four contact routes and a request-quote checklist, without invented prices, reach figures or guarantees.
- **Announcements** — community categories, a submission form, review and privacy notices, and a clear statement that nothing is published automatically.
- **Contact** — exact phone, WhatsApp and email details, an international dialling note, a contact form, a card with the station's verified public channels and an honest note about the unpublished studio address.
- **404** — a branded not-found page served by the preview server.

The site has no database, no analytics, no cookies and no third-party JavaScript.

Listening is continuous. The player dock sits outside the page content, so moving between pages does not stop the stream or a listen-back clip — the site fetches the next page, replaces only `<main>` and updates the address, title, description, navigation state and language in place. Only one sound plays at a time: starting the live stream pauses an archive clip, and starting a clip pauses the live stream. If the browser cannot fetch or parse the next page, or anything about it is unexpected, the link performs a normal page load instead, so navigation is never left half-done.

---

## 2. Quick start

Requires **Node.js 20 or newer**. There are no npm dependencies to install.

```sh
node build.js        # or: npm run build
node server.js       # or: npm start
```

Open <http://127.0.0.1:4173>. Set `PORT` or `HOST` to override the preview address.

Run the consistency checks after a build:

```sh
node build.js
node scripts/check.js   # or: npm run check
```

`build.js` reads the page files in `src/pages/`, injects the shared layout, header, footer, player and structured data, writes the built `.html` files to the project root, regenerates `robots.txt`, and writes `sitemap.xml` only after a real site URL is configured.

`check.js` verifies English/Kiswahili key parity, markup translation keys, dynamic translation keys, page titles/descriptions, a single `h1` per page, duplicate IDs, local link and image targets, form labels, icon-button labels and the station's contact configuration.

Before blaming the website for silence, ask the stream itself:

```sh
node tools/check-stream.js            # or: npm run stream
node tools/check-stream.js --watch    # or: npm run stream -- --watch
```

It reads the one configured `streamUrl`, follows the provider's redirect, samples audio and prints either the stream's own identity or the provider's refusal. Exit code is `0` while audio flows and `1` while it does not, so it can run from a cron job. See [§4.1](#41-live-stream--connected-pending-station-confirmation).

---

## 3. File structure

```
radio-togotane/
├─ build.js                  # tiny static-site builder
├─ server.js                 # local preview server with security headers
├─ site.json                 # public site URL (empty until launch)
├─ scripts/
│  ├─ check.js               # build/output consistency checks
│  └─ set-site-url.js        # writes site.json from a URL argument
├─ tools/
│  ├─ check-stream.js        # asks the provider whether the mount carries audio
│  └─ record.js              # continuous stream recorder for listen-back
├─ src/
│  ├─ layout.html            # shared page shell
│  ├─ partials/
│  │  ├─ header.html         # navigation, language and theme controls
│  │  ├─ footer.html         # footer, share control, contact details
│  │  ├─ player.html         # fixed player dock and stream dialog
│  │  └─ structured-data.html# RadioStation JSON-LD
│  └─ pages/                 # one file per page, with front matter
├─ assets/
│  ├─ css/styles.css         # design system and responsive layout
│  ├─ fonts/                 # self-hosted Manrope and Fraunces (OFL)
│  ├─ images/                # station logo, illustrative studio photography
│  │  ├─ logo-togotane.png       # full logo published by the station
│  │  ├─ logo-togotane-mark.png  # cropped emblem used in the header/footer
│  │  ├─ presenters/             # portraits from the station's own posts
│  │  └─ studio/                 # photographs from the station's own posts
│  ├─ data/
│  │  └─ episodes.json       # generated recording index (do not edit by hand)
│  └─ js/
│     ├─ boot.js             # applies saved theme/language before paint
│     ├─ config.js           # station config and live stream URL
│     ├─ data.js             # published programme schedule
│     ├─ i18n.js             # English/Kiswahili strings
│     └─ app.js              # all interactions, no dependencies
├─ media/
│  └─ podcasts/              # recorded hourly MP3 files
├─ index.html                # built pages (do not edit by hand)
├─ about.html
├─ programs.html
├─ podcasts.html
├─ presenters.html
├─ news.html
├─ advertise.html
├─ announce.html
├─ contact.html
├─ 404.html
├─ robots.txt
└─ sitemap.xml               # generated only when site.json has a URL
```

Built HTML files, `robots.txt` and `sitemap.xml` are generated. Edit the files in `src/` and `assets/`, then rebuild. `assets/data/episodes.json` and `media/podcasts/` are written by the recorder, not by the builder.

---

## 4. Configuration

### 4.1 Live stream — connected, pending station confirmation

The one place to set the stream is [`assets/js/config.js`](assets/js/config.js):

```js
window.RT_CONFIG = {
  streamUrl: 'https://stream.zeno.fm/1dahxtvjx47vv',
  // …
};
```

This is Radio Togotane 88.3 FM's public Zeno.fm feed, taken from the station's own Zeno profile (station id `17f52439-0a69-47ff-8dc2-f7c16cbd5b8e`, `zeno.fm/radio/radio-togotane-88-3-fm`), which also links the station's website and Facebook page.

Verified on 2026-10-30:

- `https://stream.zeno.fm/1dahxtvjx47vv` answers over HTTPS with a 302 to a tokenised Zeno edge host;
- the edge returns `content-type: audio/mpeg`, `icy-name: RADIO TOGOTANE 88.3 FM`, `icy-br: 128`;
- a downloaded sample decodes as MPEG layer III, 128 kbps, 44.1 kHz stereo;
- in a real browser, clicking “Listen live” issues the media request, receives `200 audio/mpeg`, and the player reaches its live state and stays there.

**Still to confirm with the station:** that this Zeno feed is the authorised address. If the station or its provider issues a different URL, replace the value above and rebuild — nothing else needs to change. The feed sits on a third-party provider, so if the station stops paying for or maintaining the Zeno account, the stream will go offline; the player will then show an off-air state rather than pretend to play.

**The mount follows the station's own source, and goes quiet when they do.** Re-checked on the morning of 2026-10-31: at 09:19 EAT the address answered `302` and the Zeno edge returned `503 Service Unavailable` with the body `Mount point not active, try again later.` — the station was not feeding its mount, so no listener anywhere could hear it, including the station's own Zeno page and its `radio-togotane-88-3-fm.mdn.live` site, which publish this same single address. Fourteen minutes later, at 09:33 EAT, the identical check answered `ON AIR · audio/mpeg · "RADIO TOGOTANE 88.3 FM" · 128 kbps`, and the website player streamed it. This is a source-side condition the station controls; there is no website setting that can make a cold mount answer.

Two things follow from that, and both are implemented:

- `node tools/check-stream.js` (also `npm run stream`) reads the same configured address, follows the provider's redirect, samples audio and prints the provider's own words when the mount is cold, with exit code `0` on air and `1` off air. `--watch`, optionally `--every 15`, logs each state change, so an hour of evidence costs one command.
- The player treats a failed attempt as a question, not a verdict. It re-attempts on its own with a growing pause — about 1.1 s, 3 s, 8 s, 15 s, then 30 s twice — because a mount that is starting up often refuses the first listener and serves audio to the next. Each attempt carries its own query value, which Zeno ignores, so an attempt really re-contacts the provider instead of replaying the browser's cached refusal.
- **It does not give up while the listener still wants the radio.** After that ladder the player goes into stand-by and asks the station again every minute, because the mount has been seen to be cold for ten minutes and streaming again the next; a listener who pressed once gets audio the moment the station returns, with no second press. When the browser reports the network is back, or the page is opened again after being backgrounded, it asks immediately instead of waiting for the minute. The stand-by is only ever a reaction to a press — it never starts on its own, and nothing plays before the listener asks. Pressing the control once more while it is searching ends the search and returns the status to “Ready”; a further press starts it again.
- A feed that stops *after* it started is caught too. Chrome leaves a dead live connection sitting in its buffer without ever reporting an error, so the player watches its own progress: if the audio position has not moved for twelve seconds while it is supposed to be live, it drops that connection and rejoins through the same ladder. A listener whose phone walked out of range, or whose station's source blinked, comes back to the live edge without pressing anything.
- If an archive clip takes over, or the listener pauses live audio, the live request is withdrawn and every pending attempt is cancelled — one sound at a time, and no reconnecting behind a clip the listener chose instead.

Because a refused or offline source reaches the browser as the same media error as a codec the browser cannot decode, the states are worded apart: “Stream off air — auto-reconnecting” while the quick ladder is running, “Stream off air — searching again every minute” in stand-by, “Stream off air — press play to retry” when an attempt is refused and nothing is pending, and the “your browser does not support this stream format” wording is reserved for browsers that genuinely cannot decode MP3.

**What “live” means here.** The station's mount is a single relay of the same broadcast that goes out over 88.3 FM, and every listener is served that one feed: two connections opened at the same moment received byte-identical audio (`icy-name: RADIO TOGOTANE 88.3 FM`, 128 kbps). Each device still buffers a second or two of its own, so two phones are close together rather than sample-exact, and any internet relay sits a little behind the transmitter. The site narrows that gap by always joining the live edge — it never plays a stored file and never rewinds to catch up — but closing the remaining seconds would need a synchronised clock on a backend, which this dependency-free site does not have and does not claim.

The player never autoplays: `new Audio()` is created only when a play control is pressed, and playback is driven by real audio events. With an empty `streamUrl` the controls open the pending dialog instead, the status reads “Stream not connected”, and no audio element is created.

Use a direct **HTTPS MP3 or AAC** stream for the widest browser support. An HLS (`.m3u8`) address plays natively in Safari only; Chrome and Firefox need an HLS library that this dependency-free build does not include.

### 4.2 Station details

The same file holds the station name, frequency, town, county, timezone, WhatsApp number, email and phone numbers. The values currently in the file are the exact details supplied by the station. The public pages also contain the clickable phone, WhatsApp and email links, so search for `254714426619`, `togotaneradiofm@gmail.com`, `+254701395196` and `+254728506650` if any of them change.

### 4.3 Social profiles — verified, pending station confirmation

Official `https://` profile URLs live under `social` in `config.js`:

```js
social: {
  facebook: 'https://www.facebook.com/TogotaneRadioOfficial/',
  youtube: 'https://www.youtube.com/@togotaneradiofm3254',
  x: 'https://x.com/togotane',
  tiktok: '',
  instagram: '',
},
```

These three handles were cross-checked on 2026-10-30 against the station's own Zeno profile, its YouTube channel (`UCzsFhPV3h2NYbXPNXxeNkAw`) and the public radio directory radio.ke. No official Instagram or TikTok account could be verified, so those entries are deliberately left empty and the site says so rather than guessing.

One source drives four places: the footer social row, the About identity plate (`about.html#official`), the home “Find the station online.” strip and the Contact aside. Channel cards are rendered by `renderChannels()` in [`assets/js/app.js`](assets/js/app.js) and are re-translated on an EN/SW switch. Empty or non-HTTPS values are skipped; if every value is empty the sections hide themselves. Ask the station to confirm the three handles before launch — replace or clear a value in `config.js` and rebuild, nothing else changes.

### 4.4 Programme schedule

[`assets/js/data.js`](assets/js/data.js) is the single source for both the home preview and the full schedule. Each programme has an `id`, `name`, `days` (0 = Sunday), 24-hour `start`/`end` times and presenters. Times are Africa/Nairobi. Change a time or presenter in this one file and rebuild; do not edit the generated cards by hand.

Sunday is intentionally empty with a clear “schedule being confirmed” state. Do not add a Sunday programme until the station confirms it.

### 4.5 Language and theme

- English and Kiswahili strings live in [`assets/js/i18n.js`](assets/js/i18n.js); the two dictionaries must have the same keys.
- The switcher updates all interface and content text, the document title, `<html lang>` and the persisted `rt-lang` value.
- The theme control updates the page and the `theme-color` meta value and persists `rt-theme`.
- `boot.js` applies the saved theme and language before first paint to avoid a flash.
- With no saved preference, the site follows `prefers-color-scheme`, defaulting to the dark studio palette.

### 4.6 Forms

The announcement and contact forms validate on the client and then hand the completed message to **WhatsApp** or **email**. There is no backend and no database: nothing is stored by this website, and the page never claims that a submission reached the station. The success message says the message is ready to send and offers a direct link as a fallback. Connect a backend or form service later if the station wants submissions delivered automatically.

The contact form supports `contact.html?topic=advertising` (and the other topic values in the form) to preselect a subject, which is how the advertising page's quote links work.

### 4.7 Listen-back archive and recorder

The **Listen back** page ([`podcasts.html`](podcasts.html)) replays recent hours of the online stream. It is fed by a small recorder, [`tools/record.js`](tools/record.js), which uses the same `streamUrl` in `config.js` — there is no second address to maintain.

```sh
npm run record                 # record continuously
node tools/record.js --minutes 10   # record a ten-minute test, then stop
```

What the recorder does:

- connects to the stream over HTTPS with a `Range`-free request and writes the MP3 data as received;
- closes the file at the top of every clock hour and starts a new one, so each file maps to one broadcast hour;
- names each file `YYYY-MM-DD_HHMMSS_<programme-id>.mp3` and tags it with the programme that [`data.js`](assets/js/data.js) publishes for that start time (`off-air` outside published hours);
- writes each file as `.part` and renames it only when it is complete, so a half-written file is never served as an episode;
- discards segments shorter than ten seconds, reconnects with a 3–60 second backoff after a dropped stream, and rotates even if the connection stalls;
- rewrites [`assets/data/episodes.json`](assets/data/episodes.json) atomically after every segment, newest first, dropping entries whose MP3 no longer exists;
- writes `podcast.xml` at the project root only when `site.json` has a real site URL (see §6), so the archive can also be subscribed to as a podcast feed.

The page fetches `assets/data/episodes.json` on load, shows recordings newest first, offers programme filters with counts, and pre-selects the newest recording without loading or playing it. Audio is created only when a play control is pressed; no autoplay, no background prefetch. The preview server sends `audio/mpeg` with byte-range support, so seeking inside a recording works.

**Automatic does not mean unattended.** The archive only grows while the recorder runs on a machine with a stable connection. Run it on the studio PC or a small always-on server under a process manager (systemd, pm2, NSSM or Task Scheduler), or the archive will simply have gaps — the page never fills them with invented episodes. A stopped recorder produces a shorter list, not an error, and the page's notes say so.

**Storage:** at 128 kbps a recording is about 57 MB per hour, roughly 1.4 GB per day if the stream is captured around the clock. Decide a retention window (for example seven or thirty days); delete old MP3s and the manifest will drop them at the next hourly rewrite, or remove the entries in `episodes.json` yourself.

**Rights:** the recorder captures whatever the stream carries, including music and advertising that may be licensed only for live broadcast. Before publishing the archive, the station must confirm it holds the rights to make recordings available on demand — especially for music. The four-minute clip included here was captured from the station's own public stream solely to demonstrate that the page and player work; it should be replaced by the station's own retention policy (or removed) before the archive is promoted.

### 4.8 Logo and station imagery

The identity artwork is the station's own, taken from places it publishes:

- `assets/images/logo-togotane.png` — the full logo as the station publishes it on its stream profile and YouTube channel avatar;
- `assets/images/logo-togotane-mark.png` — the same emblem cropped to the roundel only, used in the header and footer brand tiles;
- `assets/images/presenters/lucas-magesa.webp` — portrait cropped from the station's own “Omogeka Show With Lucas Magesa” post, which names the presenter on the graphic itself;
- `assets/images/studio/togotane-studio-1.webp` — a photograph published on the station's official Facebook page, shown in the About “From the studio” section with a credit line.

Replace any of these by dropping in a file of the same name and rebuilding. If the station supplies its own logo or higher-resolution portraits, prefer those: they are the rights-holders, and the site's copy already treats every image as supplied-by-station. Presenter cards that have no verified portrait keep a neutral monogram and a visible “photograph to be supplied” note — do not substitute a stock face for a named person.

---

## 5. Information still required from the station

The station has adopted the site and publishes it in its own voice, so no approval item is outstanding and no page carries builder credit. What remains are the details still to be supplied:

1. Confirmation that the connected stream feed (`https://stream.zeno.fm/1dahxtvjx47vv`) is the station's authorised address.
2. Sunday programme schedule.
3. Photographs and short biographies for the six presenters still shown with monogram placeholders.
4. Confirmed news stories and events.
5. Confirmation of the three public channels now linked (Facebook, YouTube, X), plus official Instagram/TikTok handles if they exist.
6. Exact studio address and office hours (only Kehancha, Migori County is published).
7. Confirmed advertising packages or rates, if the station offers them.
8. Final domain name.
9. The station's own logo files, if the artwork currently taken from its public profile should be replaced with a supplied original.
10. Permission to publish the photographs already taken from the station's public posts (§4.8).
11. Confirmed roles or titles for the news team (Weiria Rose, Jomo, Johnes Mairari).
12. Permission to make stream recordings available on demand, and a retention period for the archive (see §4.7).
13. A machine that can run the recorder continuously, or agreement on how the archive will be hosted.
14. A decision on keeping the station's broadcast source connected to its Zeno mount. The mount was heard to be silent at 09:19 EAT and carrying the live 128 kbps programme at 09:33 EAT the same morning (§4.1); while it is cold, every player on the internet fails identically, including the station's own pages. `node tools/check-stream.js --watch` produces the evidence.

The “Johnes Mairari may present Tabataba on some occasions” detail is stated as a possibility, not as a fixed pairing with Terry Rhobi.

---

## 6. SEO and launch checklist

Per-page titles, descriptions, canonical URLs, Open Graph tags, a `RadioStation` JSON-LD block, `robots.txt` and a sitemap are supported. Canonical/OG URLs and the sitemap are only emitted after a real URL is set, so the site cannot accidentally claim a domain.

```sh
npm run seo -- https://your-domain.example
npm run build
npm run check
```

Then:

1. Confirm the stream still plays from the deployed domain (the CSP in §6 must allow the Zeno hosts).
2. Replace sample news cards and the empty events state with confirmed content, or leave them labelled as samples.
3. Add the remaining presenter photographs and bios once supplied (§4.8).
4. Confirm Sunday programming before adding it to `data.js`.
5. Confirm the three linked channels and add any other official profiles to `config.js` (§4.3).
6. Confirm recording rights and a retention period before publishing the archive (§4.7).
7. Verify the site in Google Search Console against the **exact deployed URL prefix** — `https://radio-togotane-website.vercel.app/` — using the **HTML tag** method. [src/layout.html](src/layout.html) already carries `<meta name="google-site-verification">` on all ten pages, and both hosts serve it. A *Domain* property cannot be verified from this project: it asks for a DNS TXT record on a zone the repository does not control, and the HTML-file method needs Google's own `google….html` upload placed at the same path prefix.
8. Submit **Sitemaps → `sitemap.xml`** on that same Vercel property. A sitemap only counts for the host and prefix it is read from: while `siteUrl` was the Pages address, submitting the file from either host produced “URL not allowed for a Sitemap at this location” on the other one. After changing `siteUrl` with `npm run seo`, rebuild and let the new `sitemap.xml` deploy before resubmitting.
7. Rebuild and test the deployed copy.

### Deployment

The built site is plain static files. Deploy the generated root HTML files, `assets/` (including `assets/data/episodes.json`), `media/`, `robots.txt` and (when generated) `sitemap.xml` and `podcast.xml` to any static host — Netlify, Cloudflare Pages, GitHub Pages, Vercel, or the station's own server. Do **not** upload `src/`, `scripts/`, `tools/`, `server.js`, `build.js`, `package.json`, the README or temporary folders.

If the host runs a build step, use `node build.js` with the project root as the publish directory. If it serves files directly, build locally and upload the outputs.

**Current hosting:** **Vercel** at <https://radio-togotane-website.vercel.app> is the canonical site, and GitHub Pages (legacy build from the `main` branch root, at <https://pefrika-dev.github.io/radio-togotane-website/>) mirrors the same commit with canonical tags pointing back to Vercel. On Vercel, [vercel.json](vercel.json) pins the project to a static deployment (`node build.js`, repository root as output) — without it, Vercel detects `server.js` and deploys the local preview server as a Node function that cannot serve the site. Both hosts verified on 2026-10-30: every page and asset returns 200, the Zeno stream plays (“Live audio playing”), the archive clip plays and seeks (`206 Partial Content`, so byte ranges work), the custom 404 page answers unknown paths, and the EN/SW and light/dark switches persist across pages and reloads. Re-verified on the morning of 2026-10-31 after the live-edge work: both hosts serve the identical bundle (`app.js?v=3be81c74`), and pressing “Listen live” on the public Pages URL produced 30 seconds of real station audio, including one network stutter the player recovered from by itself at the 11-second mark without a press, continuing across a swap to Presenters. The same test run against the Vercel URL a minute later landed on a cold mount — `node tools/check-stream.js` confirmed `OFF AIR HTTP 503 … Mount point not active` at 10:23 EAT, provider-side — and the Vercel page showed “Stream off air — auto-reconnecting” and kept working through the ladder instead of claiming to play. Both outcomes are the intended behaviour of the same build. Because both hosts serve the whole repository, `/src/`, `/scripts/` and `/tools/` are also reachable as plain text; they contain no secrets, but for a tighter deploy use a workflow that publishes only the built files. Neither Pages nor this Vercel configuration allows the custom security headers below, which apply to hosts that do.

The recorder is a server-side process, not part of the static site. Run it where it can stay online, then sync or upload `media/podcasts/` and `assets/data/episodes.json` to the host after each hour (or serve `media/` from the same always-on machine). A static host alone will not record anything. The host must support HTTP byte ranges for MP3 files, or seeking inside recordings will not work; the preview server does.

The builder appends a short content hash to CSS and JavaScript URLs (for example `app.js?v=f4ddce40`), so a new build is picked up without asking visitors to clear their cache. Serve HTML with a short cache lifetime and assets with a longer one.

Recommended security headers for static hosts:

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; media-src 'self' https://stream.zeno.fm https://*.surfernetwork.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

`media-src` must list the stream hosts, otherwise the browser blocks the audio. Zeno answers on `stream.zeno.fm` and redirects to an edge host such as `stream-287.surfernetwork.com`; both are included above. If the station moves to a different provider, add that host here.

The local preview server already sends the first four headers. Google Maps is linked out to a Kehancha search; no map embed or third-party script is loaded.

---

## 7. Tests performed

- `node build.js` — 10 pages built (9 public pages plus 404) and `sitemap.xml` regenerated with 9 entries for the configured Pages address.
- `node scripts/check.js` — PASS: 401 markup keys, 56 dynamic keys, 10 built pages, 486 strings per language, no broken local links or missing labels, and every built page present in the player's in-page navigation list (a page it does not know would silently stop the stream).
- `node --check` — `app.js`, `i18n.js`, `config.js`, `data.js`, `server.js`, `tools/record.js`, `tools/check-stream.js`.
- Browser testing at 390 px and 539 px mobile viewports and a 1440 px desktop capture:
  - no horizontal overflow on any of the ten pages at mobile width, or in a 1440 px-wide desktop frame;
  - all local image references resolve and load; below-the-fold photographs use native lazy loading;
  - mobile menu opens, traps focus in the dialog, closes and returns focus;
  - light/dark toggle changes colours, updates `theme-color` and persists across reloads;
  - EN/SW switch translates visible content, hides the duplicate Kiswahili hero line, updates the document title and persists across reloads;
  - schedule tabs switch panels, support Arrow keys/Home/End, show the Nairobi clock and mark only the current published programme;
  - Sunday shows the confirmed-information placeholder, not invented programmes;
  - every “Listen live” control with no stream configured shows the pending dialog, creates no audio element and never shows a playing state;
  - with the stream configured, a reload leaves the player in “Ready — press play to listen” for at least six seconds, with no audio element and no media request, confirming no autoplay;
  - pressing “Listen live” issues the media request (`200 audio/mpeg`), reaches “Live audio playing” and stays there across a nine-second sample; the pause control stops playback and the resume control restarts it;
  - the recorder captured a real 4 min 09 s Tabataba segment (3,977,300 bytes) from the station's public stream; the file header is MPEG-1 Layer III, 128 kbps, 44.1 kHz;
  - the Listen back page lists that recording, shows its programme, time, presenters and duration, offers programme filters with counts and pre-selects the newest item without creating an audio element or making a media request;
  - pressing play on the archive requests the MP3 (`206 Partial Content`, `audio/mpeg`), advances the progress and clock, pauses and resumes, and seeks to 2:06;
  - playback survives an EN/SW switch and a theme change, with the layout intact;
  - **continuous listening across pages** — with the live player playing, clicking Home → About → Presenters → Listen back kept the status at “Live audio playing” with the dock still marked as playing, while the address, `data-page`, body class, `<main>` content, navigation `aria-current` and the description/Open Graph/canonical values all changed; a value written to `window` before the click was still there afterwards, which proves the document never reloaded;
  - **one sound at a time** — starting an archive clip moved the live player to “Paused — press play to resume” and the clip to “Playing recording”; pressing play in the dock returned the live player to “Live audio playing” and the clip to “Paused”;
  - the clip's clock ran on across the swap: 0:05 when it started, 0:12 after the visitor had walked to Contact and back, and the list re-selected the same episode with its filter chips intact;
  - after a swap the page controls bind exactly once — podcast filters, presenter filters, schedule tabs, the news article dialog (opens and closes on one click each), the in-page “Listen live” buttons and the contact form (a valid submit opened exactly one WhatsApp handoff, not two);
  - browser Back restores the previous page without reloading the document or interrupting audio; `#anchor` links on the current page, `target="_blank"` channel links, off-site links, downloaded files and modifier/right-click requests all keep native browser behaviour;
  - Kiswahili applies to swapped-in content (Advertise heading, the player status and the footer navigation rendered in Swahili after the switch), and the theme and language choices still persist across a real reload;
  - **the station's own audio, live** — on 2026-10-31 at 09:33 EAT the configured mount was carrying the broadcast, and the player streamed it for 46 seconds continuously while swapping Home → Presenters → Listen back → News → Home: one media element, its position advancing every second, no pause or error event on the element;
  - **stream health tool** — `node tools/check-stream.js` printed `OFF AIR HTTP 503 from stream-287.surfernetwork.com · Mount point not active, try again later.` (exit 1) at 09:19 EAT and `ON AIR audio/mpeg · “RADIO TOGOTANE 88.3 FM” · 128 kbps · 48,902 bytes in 2.6 s` (exit 0) at 09:33 EAT; pointed at a local MP3 it also reports ON AIR, so the passing path is tested too, not only the failure;
  - **a cold mount gets its second attempt** — with the first request answered `503` and the second served real audio, the player retried on its own 1.1 s later and reached “Live audio playing”, the dock stayed playing and the pause control then stopped it;
  - **a feed that dies mid-programme is recovered** — against a test server streaming real MP3 frames at 128 kbps, playback reached “Live audio playing”, the server then stopped feeding the already-open connection and the browser never reported an error: the progress watchdog reconnected on its own, moved the status to “Stream off air — auto-reconnecting”, worked through the backoff ladder, and when the server resumed about 40 seconds later the player returned to “Live audio playing” and its position advanced again — with no one pressing anything;
  - **two listeners, one broadcast** — on 2026-10-31, minutes after the 10:11 EAT ON AIR check, two connections opened at the same moment against the station's live mount each received 260,855 bytes of `icy-name: RADIO TOGOTANE 88.3 FM` at 128 kbps, and the second connection's first audio frame was located 64 bytes into the first — 0 ms of skew, one byte-identical relay rather than a per-listener copy. Two browser tabs of the site opened side by side both reached “Live audio playing” and advanced one second per second together (25.5 s and 21.8 s at the same instant, t+24); the 3.7 s gap is the 2 s by which the second tab was started plus its own buffering, and §8 states plainly that devices are close together rather than sample-exact;
  - **every press really re-contacts the provider** — four presses against the live mount each produced fresh requests with distinct `_r=` query values (an attempt and its automatic retry). Before that value existed, a second press three seconds later produced zero network requests: the browser replayed its cached refusal while the status text invited a retry;
  - **cancelling while connecting is clean** — pressing the control during “Connecting to the stream…” aborts the attempt and returns the status to “Ready — press play to listen”, and the retired element's later error cannot overwrite the state the listener chose;
  - **off-air wording fits a phone** — “Stream off air — press play to retry” and “Mtandao umezimwa — bonyeza cheza ujaribu tena” both wrap inside the fixed dock at exactly 390 px with `scrollWidth` equal to `clientWidth` (390 = 390) and no clipped text; the Swahili string had pushed the dock to 502 px, which is why `.dock__status` is now allowed to shrink. The automatic-reconnecting wording was measured the same way against a live test feed at 390 px in both languages: “Stream off air — auto-reconnecting” and “Mtandao umezimwa — tunajaribu tena kiotomatiki” each fit in three wrapped lines with the dock still 390/390 and `textClipped: false`; the first Swahili draft (“tunajiunganisha tena kiotomatiki”) needed five lines and was shortened;
  - **one press outlasts a long cold spell** — with every stream request answered the way a cold mount answers (`503 Mount point not active, try again later.`), one press produced the measured gap sequence `1.2, 3, 8.1, 15.1, 31, 30.4, 60.9` seconds: the ladder, then the minute stand-by asking again on its own, and the status reading “Stream off air — searching again every minute” while it waited — seven refused attempts, then an eighth at 150 s without any press. Dispatching the browser's own `online` event mid-stand-by produced fresh stream requests within four seconds. Pressing the control once while it searched returned the status to “Ready — press play to listen” with the button label back to “Listen live” and **zero** further requests across the following 75 seconds, and a later press started looking again (two requests within three seconds) — so the search can always be ended by the listener;
  - a missing manifest shows the error state, and an empty manifest shows “No recordings yet” with filters hidden and play disabled — no invented episodes;
  - the archive page has no horizontal overflow at 390 px, and the player is placed above the list on mobile;
  - presenter filters return the correct weekday/Saturday presenters;
  - news category filters and the article dialog work, with paragraphs rendered from the translation body;
  - contact and announcement forms show inline errors, mark fields `aria-invalid`, then produce a WhatsApp handoff with the exact station number; `?topic=advertising` preselects the topic;
  - the header and footer brand tiles show the cropped station emblem at 58×41 (50×35 on small screens), and the About identity plate shows the full logo, in both themes;
  - the three verified channels render as cards in the footer, on the About plate, in the home follow strip and in the Contact aside, each opening in a new tab with `rel="noopener noreferrer"` and an accessible name that states the handle and the new tab;
  - the channel cards re-translate on an EN/SW switch, and stay hidden when no `https://` value is configured;
  - the Lucas Magesa presenter card shows the station-published portrait with its credit line, while every other card keeps a monogram and a pending note;
  - the About “From the studio” photograph loads lazily, carries a translated alt string and a “Station photograph” caption;
  - 404 page renders with navigation and footer.
- SEO with the Pages address configured: canonical tags, Open Graph URLs and a 9-page `sitemap.xml` are written on every build. `podcast.xml` is only written by the recorder, and only while a real URL is set.

---

## 8. Known limitations

- **Adopted, but still incomplete** — Radio Togotane approved the site as its own and publishes it in its own voice, so the pages no longer describe themselves as a draft and carry no builder credit. What is still outstanding is content, not permission: the items in §5 remain visibly marked as pending, and nothing has been invented to fill them.
- **Stream confirmed, provider not yet approved** — the player carries the station's Zeno.fm feed, which was verified to be live and identify itself as “RADIO TOGOTANE 88.3 FM”. The station still needs to confirm that this is its authorised address; the feed depends on its third-party provider staying active and on the station keeping its own source connected — the same address answered `503 Mount point not active` at 09:19 EAT and streamed the programme at 128 kbps at 09:33 EAT (§4.1). HLS playback in Chrome/Firefox would require an additional library.
- **Live means the same relay, not sample-exact sync** — every listener is served one continuous stream by the provider, so two phones pressed at the same moment hear the same programme and the same words (§4.1). Each device still buffers and decodes on its own, so playback positions differ by a fraction of a second, and a phone that starts later is further behind until it catches up at the live edge. There is no backend clock that could force two devices to align, and none is claimed.
- **Archive depends on the recorder** — only hours captured while `tools/record.js` is running appear on the Listen back page. The included archive is one genuine 4 min 09 s demonstration clip, not a complete day; gaps are left as gaps. Continuous capture needs an always-on machine, storage space (about 1.4 GB per day at 128 kbps) and a retention decision.
- **Recording rights unconfirmed** — on-demand recordings of a live stream can include music and advertising licensed only for broadcast. The station must confirm the right to publish them before the archive goes public.
- **No backend** — forms hand off to WhatsApp or email; the website does not store or deliver submissions itself.
- **Continuous listening needs JavaScript** — pages are swapped in place only when the browser supports `fetch`, the History API and `DOMParser`; every other visitor gets ordinary page loads, and in that case the stream restarts when the page changes. There is no service worker keeping audio alive across a hard reload, and adding one is a deliberate next step rather than an assumption. The JSON-LD block belongs to the page first loaded, so a crawler or a manually reloaded page always reads the server-rendered file for that URL.
- **Sample content** — news stories are layout samples, clearly labelled. Events are empty until confirmed.
- **Presenter images and bios** — one portrait (Lucas Magesa) comes from the station's own public post; the other six cards keep neutral monograms and pending notes, and no biography has been written for anyone. No real presenter photograph or biography was invented.
- **Public channels** — Facebook, YouTube and X were verified against the station's own publications and a public radio directory, but the station has not yet confirmed them for this site, and no official Instagram or TikTok account could be found.
- **News team roles** — names are shown without titles or credentials.
- **Studio location** — only “Kehancha, Migori County, Kenya” is published; no street address, coordinates or office hours.
- **Logo** — the artwork is the logo the station publishes on its own stream profile and channel avatar, cropped and optimised locally. It is a derivative of that public artwork rather than a supplied original file, so the station's own logo files should replace it (§4.8, §5).
- **Page descriptions** — visible content and page titles switch language; the `<meta name="description">` text remains English so search engines have one consistent summary. It can be localised later if required.
- **Brand names** — presenter names, programme titles and place names are preserved in both languages, as proper names should be.

---

## 9. Credits

- **Design and build:** prepared as a website proposal by **Thomas Hondo Chacha, Software Engineer**.
- **Station artwork and photography:** the logo, the Lucas Magesa portrait and the studio photograph were taken from Radio Togotane's own public posts and profiles, cropped and optimised locally, and are credited on the pages where they appear. They remain the property of the station; if the station asks for any of them to be removed, delete the file and rebuild.
- **Illustrative photography:** stock studio photographs from [Unsplash](https://unsplash.com), downloaded and optimised locally. These are **not** photographs of Radio Togotane's studio or staff. Each one used as a content figure carries a visible “Illustrative studio photograph” caption (home live panel, About at-a-glance, advertise and news); the home hero and advertising band use stock scenes as backgrounds with descriptive alt text.
  - `photo-1485579149621-3123dd979885`
  - `photo-1478737270239-2f02b77fc618`
  - `photo-1590602847861-f357a9332bbc`
  - `photo-1598488035139-bdbb2231ce04`
- **Fonts:** [Manrope](https://github.com/sharanda/manrope) and [Fraunces](https://github.com/undercasetype/Fraunces), self-hosted under the SIL Open Font License. The licence files are in `assets/fonts/`.
- **Archive audio:** the included demonstration clip was recorded from Radio Togotane's own public stream; no other audio was added. Programme labels come from the station's published schedule.
- **Station information:** contact details, the frequency, the schedule and the presenter names were supplied for this proposal; the public channel handles were taken from the station's own posts and profiles and cross-checked as described in §4.3. Unconfirmed details are marked as pending throughout the site.

Prepared as a website proposal by Thomas Hondo Chacha, Software Engineer.
