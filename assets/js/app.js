'use strict';

/*
 * Radio Togotane 88.3 FM — interface behaviour.
 *
 * No build step and no dependencies. Everything here degrades honestly:
 * without a stream URL the player explains that audio is not connected, and
 * forms hand the message to WhatsApp or email instead of pretending a server
 * received it.
 */
(function () {
  const doc = document;
  const root = doc.documentElement;
  const config = window.RT_CONFIG || {};
  const data = window.RT_DATA || { schedule: [] };
  const dictionary = window.RT_I18N || { en: {} };
  const LANGS = ['en', 'sw'];
  const DEFAULT_LANG = 'en';
  const STORE_THEME = 'rt-theme';
  const STORE_LANG = 'rt-lang';
  const STORE_VOLUME = 'rt-volume';
  const TZ = (config.station && config.station.timezone) || 'Africa/Nairobi';

  const PAGE_TITLE_KEYS = {
    home: 'title.home',
    about: 'title.about',
    programs: 'title.programs',
    podcasts: 'title.podcasts',
    presenters: 'title.presenters',
    news: 'title.news',
    'kuria-night': 'title.event',
    advertise: 'title.advertise',
    announce: 'title.announce',
    contact: 'title.contact',
    studio: 'title.studio',
    404: 'title.404',
  };

  let lang = DEFAULT_LANG;
  let scheduleCards = [];
  let currentArticle = null;
  const archive = {
    episodes: [],
    filter: 'all',
    selectedId: '',
    audio: null,
    state: 'idle',
    ready: false,
    failed: false,
  };

  const nairobiClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  function $(selector, scope) {
    return (scope || doc).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || doc).querySelectorAll(selector));
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      /* Private browsing can block storage; the session still works. */
    }
  }

  function t(key, vars) {
    const table = dictionary[lang] || {};
    const fallback = dictionary[DEFAULT_LANG] || {};
    let value = typeof table[key] === 'string' ? table[key] : fallback[key];
    if (typeof value !== 'string') return key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.replace(new RegExp('\\{' + name + '\\}', 'g'), vars[name]);
      });
    }
    return value;
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function toMinutes(time) {
    const parts = String(time).split(':');
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }

  function formatRange(programme) {
    return programme.start + '–' + programme.end;
  }

  function nairobiNow() {
    const parts = nairobiClock.formatToParts(new Date());
    const values = {};
    parts.forEach(function (part) {
      values[part.type] = part.value;
    });
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hour = Number(values.hour) % 24;
    const minute = Number(values.minute);
    return {
      day: dayMap[values.weekday],
      minutes: hour * 60 + minute,
      hh: pad(hour) + ':' + pad(minute),
    };
  }

  const DAYS_BY_GROUP = { weekday: [1, 2, 3, 4, 5], saturday: [6], sunday: [0] };

  function groupForDay(day) {
    if (day >= 1 && day <= 5) return 'weekday';
    if (day === 6) return 'saturday';
    if (day === 0) return 'sunday';
    return '';
  }

  function findCurrent(now) {
    for (let i = 0; i < data.schedule.length; i++) {
      const programme = data.schedule[i];
      if (programme.days.indexOf(now.day) === -1) continue;
      const start = toMinutes(programme.start);
      let end = toMinutes(programme.end);
      if (end <= start) end += 1440;
      if (now.minutes >= start && now.minutes < end) {
        return programme;
      }
    }
    return null;
  }

  function findNext(now) {
    let best = null;
    for (let offset = 0; offset <= 7; offset++) {
      const day = (now.day + offset) % 7;
      data.schedule.forEach(function (programme) {
        if (programme.days.indexOf(day) === -1) return;
        const start = toMinutes(programme.start);
        if (offset === 0 && start <= now.minutes) return;
        if (!best || offset < best.offset || (offset === best.offset && start < best.start)) {
          best = { programme: programme, offset: offset, start: start };
        }
      });
      if (best && best.offset === 0) break;
    }
    return best;
  }

  /* Language ------------------------------------------------------------- */

  function applyLanguage(next, persist) {
    lang = LANGS.indexOf(next) !== -1 ? next : DEFAULT_LANG;
    root.setAttribute('lang', lang);
    if (persist) storageSet(STORE_LANG, lang);

    const page = doc.body.getAttribute('data-page');
    const titleKey = PAGE_TITLE_KEYS[page];
    if (titleKey) doc.title = t(titleKey);

    $$('[data-i18n]').forEach(function (el) {
      const value = t(el.getAttribute('data-i18n'));
      if (value !== el.getAttribute('data-i18n')) el.textContent = value;
    });

    $$('[data-i18n-aria-label]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });

    $$('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });

    $$('[data-i18n-alt]').forEach(function (el) {
      el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
    });

    $$('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });

    $$('.js-lang').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === lang));
    });

    const heroAlt = $('[data-hero-alt]');
    if (heroAlt) heroAlt.hidden = lang === 'sw';

    updateThemeButtons();
    renderSchedule();
    updateNow();
    setPlayerState(player.state);
    refreshArticle();
    refreshPodcasts();
    renderChannels();
    renderWallFeed();
    renderStudio();
    updateWallClock();
    clearFormFeedback();
  }

  function initLanguage() {
    $$('.js-lang').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = btn.getAttribute('data-lang');
        if (next && next !== lang) applyLanguage(next, true);
      });
    });
  }

  function htmlLanguageFromStorage() {
    const saved = storageGet(STORE_LANG);
    lang = LANGS.indexOf(saved) !== -1 ? saved : DEFAULT_LANG;
    root.setAttribute('lang', lang);
  }

  /* Theme ---------------------------------------------------------------- */

  const themeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function preferredTheme() {
    const saved = storageGet(STORE_THEME);
    if (saved === 'light' || saved === 'dark') return saved;
    return themeQuery && themeQuery.matches ? 'light' : 'dark';
  }

  function updateThemeButtons() {
    const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    $$('.js-theme').forEach(function (btn) {
      if (btn.classList.contains('icon-btn')) {
        btn.setAttribute('aria-label', t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark'));
      } else {
        btn.textContent = t('theme.switch');
      }
    });
  }

  function setTheme(theme, persist) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    if (persist) storageSet(STORE_THEME, next);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f7f2e9' : '#090c10');
    updateThemeButtons();
  }

  function initTheme() {
    $$('.js-theme').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
      });
    });
    if (themeQuery && typeof themeQuery.addEventListener === 'function') {
      themeQuery.addEventListener('change', function (event) {
        if (!storageGet(STORE_THEME)) setTheme(event.matches ? 'light' : 'dark', false);
      });
    }
    setTheme(preferredTheme(), false);
  }

  /* Dialogs and navigation ----------------------------------------------- */

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function initDialogs() {
    ['#nav-dialog', '#stream-dialog'].forEach(function (selector) {
      const dialog = $(selector);
      if (dialog) bindDialog(dialog);
    });

    const menuOpen = $('#menu-open');
    const navDialog = $('#nav-dialog');
    if (menuOpen && navDialog) {
      menuOpen.addEventListener('click', function () {
        openDialog(navDialog);
      });
    }
  }

  function bindDialog(dialog) {
    $$('[data-close-dialog], #menu-close', dialog).forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeDialog(dialog);
      });
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  /* Dialogs inside a page are rebound whenever content is swapped. */
  function bindDialogControls(scope) {
    $$('dialog', scope).forEach(bindDialog);
  }

  /* Schedule ------------------------------------------------------------- */

  function buildProgrammeCard(programme, group) {
    const card = doc.createElement('article');
    card.className = 'program';
    card.setAttribute('data-programme-id', programme.id);
    card.setAttribute('data-group', group);

    const top = doc.createElement('div');
    top.className = 'program__top';

    const time = doc.createElement('span');
    time.className = 'program__time';
    time.textContent = formatRange(programme);

    const badge = doc.createElement('span');
    badge.className = 'program__badge';
    badge.textContent = t('schedule.scheduledNow');
    badge.hidden = true;

    top.appendChild(time);
    top.appendChild(badge);

    const name = doc.createElement('h3');
    name.className = 'program__name';
    name.textContent = programme.name;

    const line = doc.createElement('p');
    line.className = 'program__presenters';

    const label = doc.createElement('span');
    label.className = 'program__label';
    if (programme.presenters.length) {
      label.textContent = programme.presenters.length > 1 ? t('schedule.presentersLabel') : t('schedule.presenterLabel');
      line.appendChild(label);
    } else {
      const tbc = doc.createElement('span');
      tbc.textContent = t('schedule.presenterTbc');
      line.appendChild(tbc);
    }

    programme.presenters.forEach(function (person, index) {
      if (index > 0) line.appendChild(doc.createTextNode(', '));
      const link = doc.createElement('a');
      link.href = 'presenters.html#' + person.id;
      link.textContent = person.name;
      line.appendChild(link);
      if (person.alias) {
        const alias = doc.createElement('span');
        alias.className = 'program__alias';
        alias.textContent = ' (' + person.alias + ')';
        line.appendChild(alias);
      }
    });

    card.appendChild(top);
    card.appendChild(name);
    card.appendChild(line);

    if (programme.noteKey) {
      const note = doc.createElement('p');
      note.className = 'program__note';
      note.textContent = t(programme.noteKey);
      card.appendChild(note);
    }

    scheduleCards.push({ el: card, badge: badge, programme: programme, group: group });
    return card;
  }

  function renderSchedule() {
    const grids = $$('[data-programs]');
    scheduleCards = [];
    if (!grids.length) return;

    grids.forEach(function (grid) {
      const panel = grid.closest('.schedule__panel');
      const group = (panel && panel.id.replace('panel-', '')) || 'weekday';
      const days = DAYS_BY_GROUP[group] || DAYS_BY_GROUP.weekday;
      grid.textContent = '';

      data.schedule.forEach(function (programme) {
        const matches = programme.days.some(function (day) {
          return days.indexOf(day) !== -1;
        });
        if (matches) grid.appendChild(buildProgrammeCard(programme, group));
      });
    });
  }

  function updateTuneIn(now, current) {
    const programmeEl = $('#tunein-program');
    const metaEl = $('#tunein-meta');
    if (!programmeEl || !metaEl) return;

    if (current) {
      programmeEl.textContent = current.name;
      const names = current.presenters
        .map(function (person) {
          return person.alias ? person.name + ' (' + person.alias + ')' : person.name;
        })
        .join(', ');
      metaEl.textContent = names + ' · ' + formatRange(current);
      return;
    }

    programmeEl.textContent = t('schedule.offAirTitle');
    const next = findNext(now);
    metaEl.textContent = next
      ? t('schedule.nextAt', { programme: next.programme.name, time: next.programme.start })
      : t('schedule.offAirBody');
  }

  function updateNow() {
    const now = nairobiNow();
    const clock = $('#eat-clock');
    if (clock) clock.textContent = now.hh;

    const current = findCurrent(now);
    const activeGroup = groupForDay(now.day);

    scheduleCards.forEach(function (item) {
      const isNow = Boolean(current) && current.id === item.programme.id && item.group === activeGroup;
      item.el.classList.toggle('is-now', isNow);
      item.badge.hidden = !isNow;
      if (isNow) item.el.setAttribute('aria-current', 'true');
      else item.el.removeAttribute('aria-current');
    });

    updateTuneIn(now, current);
    updateWallClock();
    updateEventCountdown();

    const dockNow = $('#dock-now');
    if (dockNow) {
      dockNow.textContent = current ? current.name + ' · ' + formatRange(current) : t('schedule.offAirTitle');
    }
  }

  /* The event page counts down to the start printed in its own <time> element,
   * so the copy and the timer can never drift apart. After the night has passed
   * it says so instead of showing a negative count. */
  function updateEventCountdown() {
    const box = $('[data-event-count]');
    const start = $('[data-event-start]');
    if (!box || !start) return;

    const label = $('[data-event-count-label]', box);
    const value = $('[data-event-count-value]', box);
    const at = Date.parse(start.getAttribute('datetime'));
    if (!label || !value || isNaN(at)) return;

    const ms = at - Date.now();
    const labelKey = ms <= 0 ? (ms > -6 * 3600 * 1000 ? 'event.countLive' : 'event.countPast') : 'event.countPrefix';
    label.setAttribute('data-i18n', labelKey);
    label.textContent = t(labelKey);

    if (ms <= 0) {
      value.textContent = '';
      return;
    }

    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const parts = [];
    if (days) parts.push(days + ' ' + t('event.abbrDays'));
    parts.push(hours + ' ' + t('event.abbrHours'));
    parts.push((totalMinutes % 60) + ' ' + t('event.abbrMins'));
    value.textContent = parts.join(' · ');
  }

  function initTabs(scope) {
    $$('.tabs', scope).forEach(function (tabs) {
      const buttons = $$('.tab', tabs);

      function activate(button, focus) {
        buttons.forEach(function (btn) {
          const selected = btn === button;
          btn.setAttribute('aria-selected', String(selected));
          btn.tabIndex = selected ? 0 : -1;
          const panel = doc.getElementById(btn.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
        if (focus) button.focus();
      }

      buttons.forEach(function (button, index) {
        button.addEventListener('click', function () {
          activate(button, false);
        });
        button.addEventListener('keydown', function (event) {
          let target = null;
          if (event.key === 'ArrowRight') target = buttons[(index + 1) % buttons.length];
          if (event.key === 'ArrowLeft') target = buttons[(index - 1 + buttons.length) % buttons.length];
          if (event.key === 'Home') target = buttons[0];
          if (event.key === 'End') target = buttons[buttons.length - 1];
          if (target) {
            event.preventDefault();
            activate(target, true);
          }
        });
      });
    });
  }

  /* Live player ---------------------------------------------------------- */

  const streamUrl = String(config.streamUrl || '').trim();
  const player = {
    audio: null,
    state: 'idle',
    url: streamUrl,
    lastPosition: -1,
    lastProgress: 0,
    // True while the listener's request for live radio still stands, so the
    // player keeps looking for the station without being pressed again.
    wantsLive: false,
  };

  // The station broadcasts MP3. Only a browser that cannot decode MP3 at all
  // may honestly be told the format is unsupported; a refused or offline
  // source reaches the player as the same media error and is not the
  // listener's fault, so it is reported as an unavailable stream instead.
  const playerSupportsMp3 = doc.createElement('audio').canPlayType('audio/mpeg') !== '';

  // A live mount can refuse one listener, answer the next, or stop feeding a
  // connection that is already open. The player therefore re-attempts on its own
  // with a growing pause. After the fast ladder it does not give up and wait for
  // another press: the station's own source comes and goes, so once a listener
  // has asked for live radio, the site keeps looking for it every minute until
  // it answers or the listener presses stop.
  const LIVE_RETRY_STEPS = [1100, 3000, 8000, 15000, 30000, 30000];
  const LIVE_STANDBY_MS = 60000;
  const LIVE_STALL_MS = 12000;
  let retryTimer = null;
  let standbyTimer = null;
  let retriesDone = 0;

  function clearRetry() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function clearStandby() {
    if (standbyTimer !== null) {
      clearTimeout(standbyTimer);
      standbyTimer = null;
    }
  }

  // A failed media request is remembered against its address, so a later attempt
  // would replay the cached refusal instead of asking the station again. Each
  // attempt gets its own query value, which Zeno ignores, so the mount is really
  // contacted again — and every listener is served what the mount holds now.
  function attemptUrl() {
    return player.url + (player.url.indexOf('?') === -1 ? '?' : '&') + '_r=' + Date.now();
  }

  // An element that failed, stalled or was cancelled will not fetch again and
  // must stop speaking for the player, so it is marked retired and dropped.
  function discardPlayerAudio() {
    if (!player.audio) return;
    player.audio.__retired = true;
    player.audio.pause();
    player.audio.removeAttribute('src');
    player.audio.load();
    player.audio = null;
  }

  function failPlayback() {
    discardPlayerAudio();

    if (!playerSupportsMp3) {
      setPlayerState('unsupported', t('player.announceError'));
      return;
    }

    if (retriesDone < LIVE_RETRY_STEPS.length) {
      const delay = LIVE_RETRY_STEPS[retriesDone];
      retriesDone += 1;
      // The first recovery attempt is quick, so the listener still sees a
      // connection being made. From the second onward the status says plainly
      // that the station is silent and that the player keeps trying.
      setPlayerState(retriesDone === 1 ? 'loading' : 'retrying');
      clearRetry();
      retryTimer = setTimeout(function () {
        retryTimer = null;
        startPlayback(true);
      }, delay);
      return;
    }

    setPlayerState('standby', t('player.announceError'));
    clearStandby();
    standbyTimer = setTimeout(function () {
      standbyTimer = null;
      if (player.wantsLive) rejoinLive();
    }, LIVE_STANDBY_MS);
  }

  // One fresh round of attempts, starting from the quick first retry: used by
  // the minute-by-minute stand-by and by the browser reporting that the network
  // or the page is back, so a listener never has to press again.
  function rejoinLive() {
    clearRetry();
    clearStandby();
    retriesDone = 0;
    startPlayback(true);
  }

  // A dead live connection can sit in the buffer with the browser never
  // reporting an error, so progress itself is watched: a player that has not
  // moved for twelve seconds reconnects instead of waiting for the listener.
  function watchLiveProgress() {
    if (!player.audio || player.audio.__retired) return;
    if (player.state !== 'live' && player.state !== 'loading') return;

    const now = Date.now();
    if (player.audio.currentTime !== player.lastPosition) {
      player.lastPosition = player.audio.currentTime;
      player.lastProgress = now;
      return;
    }
    if (player.lastProgress && now - player.lastProgress > LIVE_STALL_MS) {
      player.lastProgress = 0;
      failPlayback();
    }
  }

  function setPlayerState(state, announcement) {
    player.state = state;

    const labels = {
      idle: player.url ? t('player.status.ready') : t('player.status.idle'),
      loading: t('player.status.loading'),
      live: t('player.status.live'),
      paused: t('player.status.paused'),
      retrying: t('player.status.retrying'),
      standby: t('player.status.standby'),
      error: t('player.status.error'),
      unsupported: t('player.status.unsupported'),
    };

    $$('#hero-status, #player-status').forEach(function (el) {
      el.classList.toggle('is-live', state === 'live');
      el.classList.toggle('is-loading', state === 'loading' || state === 'retrying');
      el.classList.toggle('is-error', state === 'error' || state === 'unsupported' || state === 'retrying' || state === 'standby');
    });

    $$('[data-player-status-text], #player-status-text').forEach(function (el) {
      el.textContent = labels[state] || labels.idle;
    });

    const dock = $('#player-dock');
    if (dock) {
      dock.classList.toggle('is-playing', state === 'live');
      dock.classList.toggle('is-loading', state === 'loading' || state === 'retrying');
    }

    const playButton = $('.dock__play');
    if (playButton) {
      let label = t('player.playLabel');
      if (state === 'live') label = t('player.pauseLabel');
      else if (state === 'paused') label = t('player.resumeLabel');
      playButton.setAttribute('aria-label', label);
    }

    if (announcement) {
      const announcer = $('#player-announcer');
      if (announcer) announcer.textContent = announcement;
    }
  }

  function getVolume() {
    const saved = parseFloat(storageGet(STORE_VOLUME));
    // The station asked for a full-volume start; a slider position a listener has
    // moved themselves is kept instead.
    if (isNaN(saved) || saved < 0 || saved > 1) return 1;
    return saved;
  }

  function startPlayback(isRetry) {
    if (!player.url) {
      openStreamDialog();
      return;
    }

    if (!isRetry) {
      clearRetry();
      clearStandby();
      retriesDone = 0;
    }
    player.wantsLive = true;

    player.lastPosition = -1;
    player.lastProgress = Date.now();

    if (!player.audio) {
      const audio = new Audio();
      audio.preload = 'none';
      audio.src = attemptUrl();
      audio.volume = getVolume();

      audio.addEventListener('playing', function () {
        if (audio.__retired) return;
        clearRetry();
        clearStandby();
        retriesDone = 0;
        setPlayerState('live', t('player.announceLive'));
      });
      audio.addEventListener('waiting', function () {
        if (audio.__retired) return;
        setPlayerState('loading');
      });
      audio.addEventListener('stalled', function () {
        if (audio.__retired) return;
        setPlayerState('loading');
      });
      audio.addEventListener('pause', function () {
        if (audio.__retired) return;
        if (player.state === 'live' || player.state === 'loading') {
          // Either the listener stopped it or an archive clip took over: the
          // request for live radio is withdrawn, so reconnecting must stop too.
          player.wantsLive = false;
          clearRetry();
          clearStandby();
          setPlayerState('paused', t('player.announcePaused'));
        }
      });
      audio.addEventListener('error', function () {
        if (audio.__retired) return;
        failPlayback();
      });

      player.audio = audio;
    }

    // Only one sound at a time: live audio takes over from an archive clip.
    if (archive.audio && !archive.audio.paused) archive.audio.pause();

    setPlayerState('loading');
    const element = player.audio;
    const result = element.play();
    if (result && typeof result.catch === 'function') {
      result.catch(function (error) {
        if (element.__retired) return;
        if (error && error.name === 'AbortError') {
          setPlayerState('idle');
        } else if (error && error.name === 'NotAllowedError') {
          setPlayerState('paused', t('player.announcePaused'));
        } else if (error && error.name === 'NotSupportedError') {
          failPlayback();
        } else {
          setPlayerState('error', t('player.announceError'));
        }
      });
    }
  }

  function togglePlayback() {
    if (!player.url) {
      openStreamDialog();
      return;
    }
    if (player.state === 'loading' || (player.audio && !player.audio.paused)) {
      // Stopping during the retry gap must cancel the pending attempt too.
      player.wantsLive = false;
      clearRetry();
      clearStandby();
      retriesDone = 0;
      if (player.state === 'loading') {
        // Nothing was ever heard, so the attempt is dropped rather than paused:
        // the control goes back to Ready, not to a Paused state that would
        // promise audio that never arrived.
        discardPlayerAudio();
        setPlayerState('idle');
      } else {
        player.audio.pause();
      }
      return;
    }
    // A listener who has changed their mind while the player is pursuing the
    // station presses once to stop the search, exactly as they would during a
    // first connection attempt; a second press would then start it again.
    if (player.state === 'retrying' || player.state === 'standby') {
      player.wantsLive = false;
      clearRetry();
      clearStandby();
      discardPlayerAudio();
      setPlayerState('idle');
      return;
    }
    startPlayback();
  }

  function openStreamDialog() {
    setPlayerState('idle', t('player.announcePending'));
    openDialog($('#stream-dialog'));
  }

  function initPlayer() {
    const aside = $('.dock__aside');
    if (aside) aside.hidden = Boolean(player.url);

    const volume = $('#volume');
    if (volume) {
      volume.value = String(Math.round(getVolume() * 100));
      volume.addEventListener('input', function () {
        const value = Number(volume.value) / 100;
        storageSet(STORE_VOLUME, String(value));
        if (player.audio) player.audio.volume = value;
        if (archive.audio) archive.audio.volume = value;
      });
    }

    $$('#player-dock .js-play, #nav-dialog .js-play, .header__listen').forEach(function (button) {
      button.addEventListener('click', togglePlayback);
    });

    if (player.url) {
      window.setInterval(watchLiveProgress, 5000);

      // A listener waiting through an off-air spell should not have to press
      // again: the moment the browser says the network is back, or the page is
      // opened again after being backgrounded, the station is asked once more.
      window.addEventListener('online', function () {
        if (player.wantsLive && !audioStillPlaying()) rejoinLive();
      });
      doc.addEventListener('visibilitychange', function () {
        if (!doc.hidden && player.wantsLive && !audioStillPlaying()) rejoinLive();
      });
    }

    setPlayerState('idle');
  }

  function audioStillPlaying() {
    return Boolean(player.audio) && !player.audio.paused;
  }

  /* Play buttons that live inside a page are rebound whenever content is swapped. */
  function bindPlayButtons(scope) {
    $$('.js-play', scope).forEach(function (button) {
      button.addEventListener('click', togglePlayback);
    });
  }

  /* Listen-back archive -------------------------------------------------- */

  const archiveStatusKeys = {
    idle: 'podcasts.playerReady',
    loading: 'podcasts.playerLoading',
    playing: 'podcasts.playerPlaying',
    paused: 'podcasts.playerPaused',
    ended: 'podcasts.playerEnded',
    error: 'podcasts.playerError',
  };

  function archiveFormat(iso, options) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const settings = Object.assign({ timeZone: TZ }, options);
    try {
      return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-KE' : 'en-GB', settings).format(date);
    } catch (err) {
      return new Intl.DateTimeFormat('en-GB', settings).format(date);
    }
  }

  function formatArchiveClock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    if (hours) return hours + ':' + pad(minutes) + ':' + pad(rest);
    return minutes + ':' + pad(rest);
  }

  function episodeKey(episode) {
    return episode.programmeId || 'off-air';
  }

  function episodeLabel(episode) {
    return episode.programme || t('podcasts.offAir');
  }

  function episodeWhen(episode) {
    const date = archiveFormat(episode.startedAt, { weekday: 'short', day: 'numeric', month: 'short' });
    const start = archiveFormat(episode.startedAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const end = episode.endedAt
      ? archiveFormat(episode.endedAt, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      : '';
    return date + ' · ' + start + (end ? '–' + end : '');
  }

  function currentEpisode() {
    for (let i = 0; i < archive.episodes.length; i++) {
      if (archive.episodes[i].id === archive.selectedId) return archive.episodes[i];
    }
    return null;
  }

  function validEpisode(episode) {
    if (!episode || typeof episode.id !== 'string' || !episode.id) return false;
    if (typeof episode.file !== 'string' || !/^media\/podcasts\/[A-Za-z0-9._-]+\.mp3$/.test(episode.file)) return false;
    if (isNaN(new Date(episode.startedAt).getTime())) return false;
    if (!Number.isFinite(Number(episode.durationSeconds)) || Number(episode.durationSeconds) <= 0) return false;
    return true;
  }

  function renderPodcastFilters() {
    const holder = $('[data-podcast-filters]');
    if (!holder) return;
    holder.textContent = '';

    if (!archive.episodes.length) {
      holder.hidden = true;
      return;
    }

    const groups = [];
    archive.episodes.forEach(function (episode) {
      const key = episodeKey(episode);
      let group = null;
      groups.forEach(function (item) {
        if (item.key === key) group = item;
      });
      if (!group) {
        group = { key: key, label: episodeLabel(episode), count: 0 };
        groups.push(group);
      }
      group.count++;
    });

    const known = archive.filter === 'all' || groups.some(function (group) {
      return group.key === archive.filter;
    });
    if (!known) archive.filter = 'all';

    function addChip(key, label, count) {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('data-filter', key);
      chip.setAttribute('aria-pressed', String(archive.filter === key));
      chip.appendChild(doc.createTextNode(label));

      const countEl = doc.createElement('span');
      countEl.className = 'chip__count';
      countEl.textContent = String(count);
      chip.appendChild(countEl);

      chip.addEventListener('click', function () {
        archive.filter = key;
        renderPodcastFilters();
        renderPodcastList();
      });

      holder.appendChild(chip);
    }

    addChip('all', t('podcasts.all'), archive.episodes.length);
    groups.forEach(function (group) {
      addChip(group.key, group.label, group.count);
    });

    holder.hidden = false;
  }

  function renderPodcastCount() {
    const countEl = $('#podcasts-count');
    if (!countEl) return;

    if (!archive.ready) {
      countEl.textContent = t('podcasts.loadingList');
      return;
    }

    const total = archive.episodes.length;
    if (!total) {
      countEl.textContent = t('podcasts.emptyTitle');
      return;
    }

    const label = total === 1 ? t('podcasts.countOne') : t('podcasts.count', { count: total });
    const newest = archiveFormat(archive.episodes[0].startedAt, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    countEl.textContent = label + ' · ' + t('podcasts.newest', { when: newest });
  }

  function createEpisodeRow(episode) {
    const item = doc.createElement('li');
    item.className = 'episode';
    item.setAttribute('data-episode-id', episode.id);
    if (episode.id === archive.selectedId) item.classList.add('is-selected');

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'episode__button';
    button.setAttribute('data-episode-id', episode.id);
    button.setAttribute('aria-pressed', String(episode.id === archive.selectedId));
    button.setAttribute(
      'aria-label',
      t('podcasts.playEpisode', { programme: episodeLabel(episode), when: episodeWhen(episode) })
    );

    const time = doc.createElement('span');
    time.className = 'episode__time';
    time.textContent = archiveFormat(episode.startedAt, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const body = doc.createElement('span');
    body.className = 'episode__body';

    const programme = doc.createElement('span');
    programme.className = 'episode__programme';
    programme.textContent = episodeLabel(episode);

    const meta = doc.createElement('span');
    meta.className = 'episode__meta';
    meta.textContent = episodeWhen(episode);

    body.appendChild(programme);
    body.appendChild(meta);

    if (episode.presenters && episode.presenters.length) {
      const presenters = doc.createElement('span');
      presenters.className = 'episode__presenters';
      presenters.textContent = episode.presenters.join(', ');
      body.appendChild(presenters);
    }

    const duration = doc.createElement('span');
    duration.className = 'episode__duration';
    duration.textContent = formatArchiveClock(episode.durationSeconds);

    button.appendChild(time);
    button.appendChild(body);
    button.appendChild(duration);
    item.appendChild(button);
    return item;
  }

  function renderPodcastList() {
    const list = $('[data-episode-list]');
    if (!list || !archive.ready) return;

    const empty = $('[data-podcast-empty]');
    list.textContent = '';

    const filtered = archive.episodes.filter(function (episode) {
      return archive.filter === 'all' || episodeKey(episode) === archive.filter;
    });

    if (empty) empty.hidden = archive.episodes.length !== 0;

    if (!filtered.length) return;

    const fragment = doc.createDocumentFragment();
    filtered.forEach(function (episode) {
      fragment.appendChild(createEpisodeRow(episode));
    });
    list.appendChild(fragment);
  }

  function setArchiveStatus(state) {
    archive.state = state;

    const panel = $('[data-archive-player]');
    if (panel) {
      panel.classList.toggle('is-playing', state === 'playing');
      panel.classList.toggle('is-loading', state === 'loading');
      panel.classList.toggle('is-error', state === 'error');
    }

    const status = $('[data-archive-status]');
    if (status) status.textContent = t(archiveStatusKeys[state] || archiveStatusKeys.idle);

    const play = $('[data-archive-play]');
    if (play && archive.selectedId) {
      play.setAttribute('aria-label', t(state === 'playing' ? 'podcasts.pause' : 'podcasts.play'));
    }
  }

  function renderArchiveMeta() {
    if (!$('[data-archive-player]')) return;

    const title = $('[data-archive-player-title]');
    const meta = $('[data-archive-player-meta]');
    const play = $('[data-archive-play]');
    const seek = $('[data-archive-seek]');
    const episode = currentEpisode();

    if (!episode) {
      if (title) title.textContent = t('podcasts.playerTitle');
      if (meta) meta.textContent = t('podcasts.playerReady');
      if (play) {
        play.disabled = true;
        play.setAttribute('aria-label', t('podcasts.play'));
      }
      if (seek) seek.disabled = true;
      setArchiveStatus('idle');
      return;
    }

    if (title) title.textContent = episodeLabel(episode);
    if (meta) {
      const presenters = episode.presenters && episode.presenters.length ? ' · ' + episode.presenters.join(', ') : '';
      meta.textContent = episodeWhen(episode) + presenters;
    }
    if (play) play.disabled = false;
    if (seek) seek.disabled = false;
    setArchiveStatus(archive.state);
  }

  function refreshPodcasts() {
    if (!$('[data-archive-player]')) return;

    if (archive.failed) {
      showPodcastLoadError();
      return;
    }

    renderPodcastCount();
    if (!archive.ready) return;

    renderPodcastFilters();
    renderPodcastList();
    renderArchiveMeta();
  }

  function archiveAudio() {
    if (archive.audio) return archive.audio;

    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = getVolume();

    audio.addEventListener('playing', function () {
      setArchiveStatus('playing');
    });
    audio.addEventListener('waiting', function () {
      if (archive.state !== 'error') setArchiveStatus('loading');
    });
    audio.addEventListener('stalled', function () {
      if (archive.state !== 'error') setArchiveStatus('loading');
    });
    audio.addEventListener('pause', function () {
      if (archive.state === 'playing' || archive.state === 'loading') setArchiveStatus('paused');
    });
    audio.addEventListener('ended', function () {
      setArchiveStatus('ended');
      const seek = $('[data-archive-seek]');
      if (seek) seek.value = '100';
    });
    audio.addEventListener('error', function () {
      setArchiveStatus('error');
    });
    audio.addEventListener('timeupdate', function () {
      updateArchiveProgress();
    });
    audio.addEventListener('loadedmetadata', function () {
      updateArchiveProgress();
    });

    archive.audio = audio;
    return audio;
  }

  function archiveDuration() {
    const audio = archive.audio;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    const episode = currentEpisode();
    return episode ? Number(episode.durationSeconds) : 0;
  }

  function updateArchiveProgress() {
    const audio = archive.audio;
    const duration = archiveDuration();
    if (!audio || !duration) return;

    const seek = $('[data-archive-seek]');
    const current = $('[data-archive-current]');
    const total = $('[data-archive-duration]');

    if (seek && !seek.disabled) seek.value = String((audio.currentTime / duration) * 100);
    if (current) current.textContent = formatArchiveClock(audio.currentTime);
    if (total) total.textContent = formatArchiveClock(duration);
  }

  function playArchive() {
    const audio = archiveAudio();
    // Only one sound at a time: an archive clip takes over from live audio.
    if (player.audio && !player.audio.paused) player.audio.pause();
    if (archive.state === 'ended') audio.currentTime = 0;
    setArchiveStatus('loading');

    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(function (error) {
        if (error && error.name === 'AbortError') return;
        setArchiveStatus(error && error.name === 'NotAllowedError' ? 'paused' : 'error');
      });
    }
  }

  function selectPodcast(id, play) {
    let episode = null;
    archive.episodes.forEach(function (item) {
      if (item.id === id) episode = item;
    });
    if (!episode) return;

    const changed = archive.selectedId !== episode.id;
    archive.selectedId = episode.id;

    if (changed) {
      const audio = archiveAudio();
      audio.pause();
      audio.src = episode.file;

      const seek = $('[data-archive-seek]');
      if (seek) seek.value = '0';
      const current = $('[data-archive-current]');
      if (current) current.textContent = '0:00';
      const total = $('[data-archive-duration]');
      if (total) total.textContent = formatArchiveClock(episode.durationSeconds);
      setArchiveStatus('idle');
    }

    renderPodcastList();
    renderArchiveMeta();

    if (play) playArchive();
  }

  function toggleArchive() {
    if (!currentEpisode()) return;

    const audio = archiveAudio();
    if (archive.state === 'playing' || archive.state === 'loading') {
      audio.pause();
      setArchiveStatus('paused');
      return;
    }
    playArchive();
  }

  function showPodcastLoadError() {
    archive.ready = false;
    archive.failed = true;

    const list = $('[data-episode-list]');
    if (list) list.textContent = '';
    const filters = $('[data-podcast-filters]');
    if (filters) filters.hidden = true;
    const empty = $('[data-podcast-empty]');
    if (empty) empty.hidden = true;
    const error = $('[data-podcast-error]');
    if (error) error.hidden = false;
    const count = $('#podcasts-count');
    if (count) count.textContent = t('podcasts.listErrorTitle');

    renderArchiveMeta();
  }

  function loadPodcastManifest() {
    const list = $('[data-episode-list]');
    if (!list) return Promise.resolve();

    return fetch('assets/data/episodes.json', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        const raw = payload && Array.isArray(payload.episodes) ? payload.episodes : [];
        archive.episodes = raw
          .filter(validEpisode)
          .sort(function (a, b) {
            return new Date(b.startedAt) - new Date(a.startedAt);
          });
        archive.ready = true;
        archive.failed = false;

        const error = $('[data-podcast-error]');
        if (error) error.hidden = true;

        if (!archive.selectedId && archive.episodes.length) {
          selectPodcast(archive.episodes[0].id, false);
        }

        refreshPodcasts();
      })
      .catch(function () {
        showPodcastLoadError();
      });
  }

  function initPodcasts(scope) {
    if (!$('[data-archive-player]', scope)) return;

    const play = $('[data-archive-play]', scope);
    if (play) play.addEventListener('click', toggleArchive);

    const list = $('[data-episode-list]', scope);
    if (list) {
      list.addEventListener('click', function (event) {
        const button = event.target.closest ? event.target.closest('.episode__button') : null;
        if (!button) return;
        selectPodcast(button.getAttribute('data-episode-id'), true);
      });
    }

    const seek = $('[data-archive-seek]', scope);
    if (seek) {
      seek.addEventListener('input', function () {
        const audio = archive.audio;
        const duration = archiveDuration();
        if (!audio || !archive.selectedId || !duration) return;
        audio.currentTime = (Number(seek.value) / 100) * duration;
        const current = $('[data-archive-current]');
        if (current) current.textContent = formatArchiveClock(audio.currentTime);
      });
    }

    const refresh = $('[data-podcast-refresh]', scope);
    if (refresh) {
      refresh.addEventListener('click', function () {
        refresh.disabled = true;
        archive.ready = false;
        loadPodcastManifest().then(function () {
          refresh.disabled = false;
        });
      });
    }

    // The episode list is fetched once and kept in memory, so returning to the
    // page while a recording plays restores it without a second request.
    if (archive.ready || archive.failed) {
      refreshPodcasts();
      return;
    }
    refreshPodcasts();
    loadPodcastManifest();
  }

  /* Presenters and news filters ------------------------------------------ */

  function initPresenters(scope) {
    const filters = $('[data-presenter-filters]', scope);
    const grid = $('[data-presenter-grid]', scope);
    if (!filters || !grid) return;

    const buttons = $$('.chip', filters);
    const cards = $$('.presenter-card', grid);

    function apply(filter) {
      buttons.forEach(function (button) {
        const active = button.getAttribute('data-filter') === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      cards.forEach(function (card) {
        const groups = (card.getAttribute('data-groups') || '').split(/\s+/);
        card.hidden = filter !== 'all' && groups.indexOf(filter) === -1;
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-filter'));
      });
    });

    if (location.hash) {
      const target = doc.getElementById(location.hash.slice(1));
      if (target && target.classList.contains('presenter-card')) apply('all');
    }
  }

  function initNews(scope) {
    const filters = $('[data-news-filters]', scope);
    const grid = $('[data-news-grid]', scope);
    if (!filters || !grid) return;

    const buttons = $$('.chip', filters);
    const cards = $$('.news-card', grid);
    const empty = $('[data-news-empty]', scope);

    function apply(filter) {
      let visible = 0;
      buttons.forEach(function (button) {
        const active = button.getAttribute('data-filter') === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      cards.forEach(function (card) {
        const match = filter === 'all' || card.getAttribute('data-category') === filter;
        card.hidden = !match;
        if (match) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        apply(button.getAttribute('data-filter'));
      });
    });
  }

  /* Article dialog ------------------------------------------------------- */

  function refreshArticle() {
    if (!currentArticle) return;

    const title = $('#article-title');
    if (title) title.textContent = t(currentArticle.titleKey);

    const category = $('#article-category');
    if (category && currentArticle.categoryKey) category.textContent = t(currentArticle.categoryKey);

    const body = $('#article-body');
    if (body) {
      body.textContent = '';
      String(t(currentArticle.bodyKey) || '')
        .split('\n\n')
        .forEach(function (text) {
          const paragraph = doc.createElement('p');
          paragraph.textContent = text;
          body.appendChild(paragraph);
        });
    }
  }

  function initArticle(scope) {
    $$('[data-article]', scope).forEach(function (button) {
      button.addEventListener('click', function () {
        currentArticle = {
          titleKey: button.getAttribute('data-title-key'),
          categoryKey: button.getAttribute('data-category-key'),
          bodyKey: button.getAttribute('data-body-key'),
        };
        refreshArticle();
        openDialog($('#article-dialog'));
      });
    });
  }

  /* Forms ---------------------------------------------------------------- */

  function fieldErrorKey(field) {
    const value = String(field.value || '').trim();
    if (field.name === 'name' && value.length < 2) return 'forms.errorName';
    if (field.name === 'phone' && value.replace(/\D/g, '').length < 9) return 'forms.errorPhone';
    if (field.name === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'forms.errorEmail';
    if (field.name === 'category' && !value) return 'forms.errorCategory';
    if (field.name === 'details' && value.length < 10) return 'forms.errorDetails';
    if (field.name === 'message' && value.length < 10) return 'forms.errorMessage';
    if (field.name === 'consent' && !field.checked) return 'forms.errorConsent';
    return '';
  }

  function setFieldError(field, message) {
    const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/);
    let errorEl = null;
    ids.forEach(function (id) {
      if (/-error$/.test(id)) errorEl = doc.getElementById(id);
    });
    if (!errorEl) return;

    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      field.setAttribute('aria-invalid', 'true');
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      field.removeAttribute('aria-invalid');
    }
  }

  function validateField(field) {
    const key = fieldErrorKey(field);
    setFieldError(field, key ? t(key) : '');
    return !key;
  }

  function validateForm(form) {
    const invalid = [];
    $$('input, select, textarea', form).forEach(function (field) {
      if (field.type === 'submit' || field.type === 'button') return;
      if (!validateField(field)) invalid.push(field);
    });
    return invalid;
  }

  function selectedText(select) {
    if (!select) return '';
    const option = select.selectedOptions && select.selectedOptions[0];
    if (option) return option.textContent.trim();
    const fallback = select.options[select.selectedIndex];
    return fallback ? fallback.textContent.trim() : '';
  }

  function buildMessage(form, kind) {
    const lines = [];
    function value(name) {
      const field = form.elements[name];
      return field ? String(field.value || '').trim() : '';
    }

    if (kind === 'announce') {
      lines.push(t('announce.formCategory') + ': ' + selectedText(form.elements.category));
      lines.push(t('forms.name') + ': ' + value('name'));
      lines.push(t('forms.phone') + ': ' + value('phone'));
      if (value('email')) lines.push(t('forms.emailOptional') + ': ' + value('email'));
      lines.push(t('announce.formPreferred') + ': ' + selectedText(form.elements.preference));
      lines.push('');
      lines.push(t('announce.formDetails') + ':');
      lines.push(value('details'));
    } else {
      lines.push(t('forms.name') + ': ' + value('name'));
      lines.push(t('forms.phone') + ': ' + value('phone'));
      if (value('email')) lines.push(t('forms.emailOptional') + ': ' + value('email'));
      if (form.elements.topic) lines.push(t('contact.formTopic') + ' ' + selectedText(form.elements.topic));
      lines.push('');
      lines.push(t('forms.message') + ':');
      lines.push(value('message'));
    }

    lines.push('');
    lines.push('— Radio Togotane 88.3 FM');
    return lines.join('\n');
  }

  function showFormStatus(statusEl, message, href, label, tone, external) {
    if (!statusEl) return;
    statusEl.className = 'form-status is-' + tone;
    statusEl.textContent = '';

    const paragraph = doc.createElement('p');
    paragraph.textContent = message;
    statusEl.appendChild(paragraph);

    if (href && label) {
      const link = doc.createElement('a');
      link.href = href;
      link.textContent = label;
      if (external) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      const hint = doc.createElement('span');
      hint.textContent = ' ' + t('forms.openHint') + ' ';
      statusEl.appendChild(hint);
      statusEl.appendChild(link);
    }
  }

  function submitForm(form, mode) {
    const statusEl = $('.form-status', form);
    const invalid = validateForm(form);

    if (invalid.length) {
      showFormStatus(statusEl, t('forms.errorFix'), '', '', 'error');
      invalid[0].focus();
      return;
    }

    const kind = form.getAttribute('data-form');
    const body = buildMessage(form, kind);
    const subject =
      (kind === 'announce' ? t('announce.formTitle') : t('contact.formTitle')) + ' — Radio Togotane 88.3 FM';
    const email = (config.station && config.station.email) || 'togotaneradiofm@gmail.com';

    if (mode === 'email') {
      const mailto =
        'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      window.location.href = mailto;
      showFormStatus(statusEl, t('forms.emailReady'), mailto, t('forms.openEmail'), 'info', false);
      return;
    }

    const number = (config.station && config.station.whatsapp) || '254714426619';
    const whatsapp = 'https://wa.me/' + number + '?text=' + encodeURIComponent(body);
    window.open(whatsapp, '_blank', 'noopener');
    showFormStatus(statusEl, t('forms.whatsappReady'), whatsapp, t('forms.openWhatsApp'), 'success', true);
  }

  function clearFormFeedback() {
    $$('.form-status').forEach(function (el) {
      el.textContent = '';
      el.className = 'form-status';
    });
    $$('.field__error').forEach(function (el) {
      el.textContent = '';
      el.hidden = true;
    });
    $$('[aria-invalid="true"]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
  }

  function initForms(scope) {
    $$('form[data-form]', scope).forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitForm(form, 'whatsapp');
      });

      const emailButton = $('[data-form-email]', form);
      if (emailButton) {
        emailButton.addEventListener('click', function () {
          submitForm(form, 'email');
        });
      }

      $$('input, select, textarea', form).forEach(function (field) {
        const revalidate = function () {
          if (field.getAttribute('aria-invalid') !== 'true') return;
          validateField(field);
          const statusEl = $('.form-status', form);
          if (statusEl && !$('[aria-invalid="true"]', form)) {
            statusEl.textContent = '';
            statusEl.className = 'form-status';
          }
        };
        field.addEventListener('blur', revalidate);
        field.addEventListener('input', revalidate);
        field.addEventListener('change', revalidate);
      });
    });
  }

  function preselectTopic() {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic');
    if (!topic) return;
    const select = $('#contact-topic');
    if (!select) return;
    const exists = Array.prototype.some.call(select.options, function (option) {
      return option.value === topic;
    });
    if (exists) select.value = topic;
  }

  /* Sharing -------------------------------------------------------------- */

  function copyLink(text, done) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        function () {
          done(t('share.copied'));
        },
        function () {
          done(t('share.failed'));
        }
      );
      return;
    }
    done(t('share.failed'));
  }

  function shareSite(button) {
    const url = window.location.href.split('#')[0];
    const status = $('#share-status');
    const textKey = button && button.getAttribute('data-share-text');
    const text = textKey ? t(textKey) : t('share.siteText');
    function report(message) {
      if (status) status.textContent = message;
    }

    if (navigator.share) {
      navigator
        .share({ title: doc.title, text: text, url: url })
        .then(function () {
          report(t('share.shared'));
        })
        .catch(function (error) {
          if (error && error.name === 'AbortError') return;
          copyLink(url, report);
        });
      return;
    }
    copyLink(url, report);
  }

  function initShare(scope) {
    $$('.js-share', scope).forEach(function (button) {
      button.addEventListener('click', function () {
        shareSite(button);
      });
    });
  }

  function initSocial() {
    const holder = $('[data-social]');
    if (!holder) return;

    const labels = { facebook: 'Facebook', youtube: 'YouTube', x: 'X', tiktok: 'TikTok', instagram: 'Instagram' };
    const social = config.social || {};
    const entries = Object.keys(labels)
      .map(function (key) {
        return { key: key, url: String(social[key] || '').trim() };
      })
      .filter(function (item) {
        return /^https:\/\//i.test(item.url);
      });

    entries.forEach(function (item) {
      const link = doc.createElement('a');
      link.href = item.url;
      link.textContent = labels[item.key];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      holder.appendChild(link);
    });

    holder.hidden = entries.length === 0;
  }

  /* Official channels ----------------------------------------------------- */

  const CHANNEL_META = [
    {
      key: 'facebook',
      name: 'Facebook',
      handle: 'TogotaneRadioOfficial',
      noteKey: 'channels.facebookNote',
      path: 'M13.5 21v-7h2.4l.4-3h-2.8V9.3c0-.9.3-1.5 1.5-1.5h1.4V5.1c-.2 0-1.1-.1-2.1-.1-2.1 0-3.5 1.3-3.5 3.6V11H8.5v3h2.3v7Z',
    },
    {
      key: 'youtube',
      name: 'YouTube',
      handle: '@togotaneradiofm3254',
      noteKey: 'channels.youtubeNote',
      path: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3Z',
      evenOdd: true,
    },
    {
      key: 'x',
      name: 'X',
      handle: '@togotane',
      noteKey: 'channels.xNote',
      path: 'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.2 3h6.6l4.5 5.6L17.5 3Zm-1.1 16.1h1.8L7.7 4.8H5.8l10.6 14.3Z',
    },
  ];

  function channelIcon(meta) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', meta.path);
    if (meta.evenOdd) path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    return svg;
  }

  function channelArrow() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'channel-card__arrow');
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', 'M7 17 17 7M9 7h8v8');
    svg.appendChild(path);
    return svg;
  }

  function renderChannels() {
    const holders = $$('[data-official-channels]');
    if (!holders.length) return;

    const social = config.social || {};
    const items = CHANNEL_META.map(function (meta) {
      return { meta: meta, url: String(social[meta.key] || '').trim() };
    }).filter(function (item) {
      return /^https:\/\//i.test(item.url);
    });

    holders.forEach(function (holder) {
      holder.textContent = '';

      items.forEach(function (item) {
        const meta = item.meta;
        const link = doc.createElement('a');
        link.className = 'channel-card';
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute(
          'aria-label',
          meta.name + ', ' + t('channels.official') + ', ' + meta.handle + ' ' + t('channels.newTab')
        );

        const icon = doc.createElement('span');
        icon.className = 'channel-card__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(channelIcon(meta));

        const body = doc.createElement('span');
        body.className = 'channel-card__body';

        const name = doc.createElement('span');
        name.className = 'channel-card__name';
        name.textContent = meta.name;
        const flag = doc.createElement('span');
        flag.className = 'channel-card__flag';
        flag.textContent = t('channels.official');
        name.appendChild(flag);

        const handle = doc.createElement('span');
        handle.className = 'channel-card__handle';
        handle.textContent = meta.handle;

        const note = doc.createElement('span');
        note.className = 'channel-card__note';
        note.textContent = t(meta.noteKey);

        body.append(name, handle, note);
        link.append(icon, body, channelArrow());
        holder.appendChild(link);
      });

      holder.hidden = items.length === 0;
    });
  }

  /* Page routing --------------------------------------------------------- */

  /*
   * Both the live stream and an archive clip are Audio objects owned by this
   * script, not elements inside the page, so a normal page reload is what
   * silences the listener. Clicking a link therefore replaces only <main> and
   * leaves the header, footer, player dock and the playing audio untouched.
   * Any page the browser cannot fetch or parse the way it expects falls back
   * to an ordinary navigation, so nothing is ever left half-loaded.
   */

  const DIRECTORY = window.location.pathname.replace(/[^/]*$/, '');
  const PAGE_NAMES = ['about', 'programs', 'podcasts', 'presenters', 'news', 'advertise', 'announce', 'contact', 'studio', 'kuria-night'];
  const canRoute = Boolean(window.fetch && window.history && window.history.pushState && window.DOMParser);

  let currentPage = '';
  let routeAbort = null;

  function pageForPathname(pathname) {
    if (pathname === DIRECTORY || pathname === DIRECTORY + 'index.html') return 'home';
    for (let index = 0; index < PAGE_NAMES.length; index++) {
      if (pathname === DIRECTORY + PAGE_NAMES[index] + '.html') return PAGE_NAMES[index];
    }
    return '';
  }

  function copyMeta(parsed, selector, attribute) {
    const source = parsed.querySelector(selector);
    const target = doc.querySelector(selector);
    if (!source || !target) return;
    const value = source.getAttribute(attribute);
    if (value !== null) target.setAttribute(attribute, value);
  }

  function swapContent(parsed, page) {
    const nextMain = parsed.querySelector('main');
    const currentMain = $('main');
    if (!nextMain || !currentMain) return false;

    currentMain.replaceWith(doc.adoptNode(nextMain));
    currentPage = page;

    doc.body.className = parsed.body.className;
    doc.body.setAttribute('data-page', page);
    copyMeta(parsed, 'meta[name="description"]', 'content');
    copyMeta(parsed, 'meta[property="og:title"]', 'content');
    copyMeta(parsed, 'meta[property="og:description"]', 'content');
    copyMeta(parsed, 'meta[property="og:url"]', 'content');
    copyMeta(parsed, 'link[rel="canonical"]', 'href');

    $$('[data-nav]').forEach(function (link) {
      if (link.getAttribute('data-nav') === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    return true;
  }

  function landOnPage(hash) {
    if (hash && hash.length > 1) {
      const target = doc.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo(0, 0);
    const main = $('main');
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }

  function routeTo(url, push) {
    if (routeAbort) routeAbort.abort();
    const controller = new AbortController();
    routeAbort = controller;

    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (markup) {
        const target = new window.URL(url, window.location.href);
        const parsed = new window.DOMParser().parseFromString(markup, 'text/html');
        const page = pageForPathname(target.pathname);
        if (!page || !swapContent(parsed, page)) throw new Error('Unexpected page');

        if (push) window.history.pushState({ page: page }, '', target.href);
        else window.history.replaceState({ page: page }, '', target.href);

        initContent();
        landOnPage(target.hash);
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return;
        window.location.href = url;
      });
  }

  function initRouter() {
    if (!canRoute) return;
    currentPage = pageForPathname(window.location.pathname);

    doc.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest ? event.target.closest('a[href]') : null;
      if (!link) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      const raw = link.getAttribute('href') || '';
      if (raw.charAt(0) === '#') return;

      const url = new window.URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // index.html and the folder itself are the same page, so keep the short URL.
      const path = url.pathname === DIRECTORY + 'index.html' ? DIRECTORY : url.pathname;
      const page = pageForPathname(path);
      if (!page) return;
      if (page === currentPage && url.search === window.location.search && !url.hash) return;

      event.preventDefault();
      closeDialog($('#nav-dialog'));
      routeTo(path + url.search + url.hash, true);
    });

    window.addEventListener('popstate', function () {
      routeTo(window.location.pathname + window.location.search + window.location.hash, false);
    });
  }

  /* Message wall ---------------------------------------------------------
   *
   * The wall is the one part of this site that talks to a server. It is honest
   * about that: when /api/wall answers 501 the form and the feed are replaced
   * by a plain "not connected" notice, and nothing is ever shown as accepted
   * that the station did not accept. A listener's own note is tracked only in
   * this tab, together with the delete token the API handed back.
   */

  const STORE_WALL = 'rt-wall-mine';
  const STORE_STUDIO = 'rt-studio-token';
  const WALL_POLL_MS = 4000;
  const STUDIO_POLL_MS = 3000;

  const wall = { connected: null, messages: [], mine: [], unavailable: false };
  const studio = { token: '', pending: [], approved: [], loaded: false, denied: false, statusKey: '' };

  const eatFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  function eatClock(stamp) {
    return eatFormatter.format(new Date(Number(stamp)));
  }

  function readMine() {
    try {
      const raw = window.sessionStorage.getItem(STORE_WALL);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeMine() {
    try {
      window.sessionStorage.setItem(STORE_WALL, JSON.stringify(wall.mine));
    } catch (err) {
      /* Storage can be blocked; the wall still works for this view. */
    }
  }

  function mineOf(id) {
    return wall.mine.filter(function (entry) {
      return entry.id === id;
    })[0] || null;
  }

  function forgetMine(id) {
    wall.mine = wall.mine.filter(function (entry) {
      return entry.id !== id;
    });
    writeMine();
  }

  function currentProgrammeName() {
    const now = nairobiNow();
    const programme = findCurrent(now);
    return programme ? programme.name : '';
  }

  function setWallStatus(key, tone) {
    const status = $('[data-wall-status]');
    if (!status) return;
    status.textContent = key ? t(key) : '';
    status.className = key ? 'form-status is-' + tone : 'form-status';
  }

  function markWallConnected(ok) {
    wall.connected = ok;
    wall.unavailable = !ok;
    const section = $('[data-wall]');
    const offline = $('[data-wall-offline]');
    if (offline) offline.hidden = ok;
    if (section) section.classList.toggle('is-offline', !ok);
  }

  function buildWallItem(item) {
    const li = doc.createElement('li');
    li.className = 'wall__item';

    const head = doc.createElement('p');
    head.className = 'wall__item-head';

    const name = doc.createElement('strong');
    name.className = 'wall__item-name';
    name.textContent = item.name;
    head.appendChild(name);

    const place = doc.createElement('span');
    place.className = 'wall__item-place';
    place.textContent = item.location;
    head.appendChild(place);

    const clock = doc.createElement('time');
    clock.className = 'wall__item-time';
    clock.dateTime = new Date(Number(item.createdAt)).toISOString();
    clock.textContent = eatClock(item.createdAt);
    head.appendChild(clock);

    if (mineOf(item.id)) {
      const tag = doc.createElement('span');
      tag.className = 'wall__item-tag';
      tag.textContent = t('wall.mineTag');
      head.appendChild(tag);
      li.classList.add('is-mine');
    }

    const body = doc.createElement('p');
    body.className = 'wall__item-text';
    body.textContent = item.message;

    li.appendChild(head);
    li.appendChild(body);

    if (item.programme) {
      const meta = doc.createElement('p');
      meta.className = 'wall__item-during';
      meta.textContent = t('studio.sentDuring') + ' ' + item.programme;
      li.appendChild(meta);
    }

    if (mineOf(item.id)) {
      const entry = mineOf(item.id);
      const drop = doc.createElement('button');
      drop.type = 'button';
      drop.className = 'wall__item-remove btn btn--ghost btn--sm';
      drop.textContent = t('actions.removeMine');
      drop.addEventListener('click', function () {
        removeMineNote(entry, drop);
      });
      li.appendChild(drop);
    }

    return li;
  }

  function renderWallFeed() {
    const feed = $('[data-wall-feed]');
    if (!feed) return;

    feed.textContent = '';
    wall.messages.forEach(function (item) {
      feed.appendChild(buildWallItem(item));
    });

    const empty = $('[data-wall-empty]');
    if (empty) empty.hidden = wall.messages.length > 0;

    const remove = $('[data-wall-remove]');
    if (remove) remove.hidden = !pendingMine();
  }

  function pendingMine() {
    const ids = {};
    wall.messages.forEach(function (item) {
      ids[item.id] = true;
    });
    return wall.mine.filter(function (entry) {
      return !ids[entry.id];
    })[0] || null;
  }

  function removeMineNote(entry, button) {
    if (!entry || !entry.id) return;
    if (button) button.disabled = true;

    sendWallNote({ action: 'delete', id: entry.id, secret: entry.secret })
      .then(function (outcome) {
        if (outcome.status === 200) {
          forgetMine(entry.id);
          wall.messages = wall.messages.filter(function (item) {
            return item.id !== entry.id;
          });
          renderWallFeed();
          setWallStatus('wall.removed', 'success');
          return;
        }
        if (button) button.disabled = false;
        setWallStatus(outcome.body && outcome.body.error === 'not-configured' ? '' : 'wall.errorRemove', 'error');
      })
      .catch(function () {
        if (button) button.disabled = false;
        setWallStatus('wall.errorRemove', 'error');
      });
  }

  function fetchWall() {
    if (doc.visibilityState === 'hidden') return Promise.resolve();

    return window
      .fetch('/api/wall', { headers: { accept: 'application/json' } })
      .then(function (response) {
        if (response.status === 501) {
          markWallConnected(false);
          return null;
        }
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (!payload) return;
        markWallConnected(true);
        wall.messages = Array.isArray(payload.messages) ? payload.messages : [];
        renderWallFeed();
        const waiting = pendingMine();
        if (waiting) setWallStatus('wall.waiting', 'info');
      })
      .catch(function () {
        markWallConnected(false);
      });
  }

  function sendWallNote(payload) {
    return window
      .fetch('/api/wall', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (body) {
          return { status: response.status, body: body };
        });
      });
  }

  function validateWall(form) {
    const errors = [];
    const name = $('#wall-name', form);
    const location = $('#wall-location', form);
    const message = $('#wall-message', form);
    const consent = $('#wall-consent', form);

    const rules = [
      [name, name.value.trim().length < 2 ? 'wall.errorName' : ''],
      [location, location.value.trim().length < 2 ? 'wall.errorLocation' : ''],
      [message, message.value.trim().length < 3 ? 'wall.errorMessage' : ''],
      [consent, consent.checked ? '' : 'wall.errorConsent'],
    ];

    rules.forEach(function (rule) {
      const key = rule[1];
      setFieldError(rule[0], key ? t(key) : '');
      if (key) errors.push(key);
    });

    return errors.length === 0;
  }

  function initWallForm(form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!validateWall(form)) {
        setWallStatus('wall.errorFields', 'error');
        return;
      }

      const submit = $('[data-wall-submit]', form);
      if (submit) submit.disabled = true;
      setWallStatus('wall.sending', 'info');

      sendWallNote({
        name: $('#wall-name', form).value.trim(),
        location: $('#wall-location', form).value.trim(),
        message: $('#wall-message', form).value.trim(),
        consent: true,
        programme: currentProgrammeName(),
        website: $('#wall-website', form).value,
      })
        .then(function (outcome) {
          if (outcome.status === 201 && outcome.body && outcome.body.id) {
            wall.mine.push({ id: outcome.body.id, secret: outcome.body.secret });
            writeMine();
            if (outcome.body.feed && Array.isArray(outcome.body.feed.messages)) {
              wall.messages = outcome.body.feed.messages;
            }
            renderWallFeed();
            form.reset();
            $$('[aria-invalid="true"]', form).forEach(function (el) {
              setFieldError(el, '');
            });
            const count = $('[data-wall-count]', form);
            if (count) count.textContent = '0';
            markWallConnected(true);
            setWallStatus('wall.sent', 'success');
            return;
          }

          const code = outcome.body && outcome.body.error;
          if (code === 'not-configured') markWallConnected(false);
          setWallStatus(code === 'too-many' ? 'wall.errorTooMany' : 'wall.errorStore', 'error');
        })
        .catch(function () {
          markWallConnected(false);
          setWallStatus('wall.errorStore', 'error');
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });

    const message = $('#wall-message', form);
    const count = $('[data-wall-count]', form);
    if (message && count) {
      message.addEventListener('input', function () {
        count.textContent = String(message.value.length);
      });
    }

    const remove = $('[data-wall-remove]');
    if (remove) {
      remove.addEventListener('click', function () {
        removeMineNote(pendingMine(), remove);
      });
    }
  }

  function initWall(scope) {
    const section = $('[data-wall]', scope);
    if (!section) return;

    wall.mine = readMine();

    const form = $('[data-wall-form]', section);
    if (form && !form.dataset.wallBound) {
      form.dataset.wallBound = '1';
      initWallForm(form);
    }

    markWallConnected(wall.connected === null ? true : wall.connected);
    renderWallFeed();
    fetchWall();
  }

  function updateWallClock() {
    const clock = $('[data-wall-clock]');
    const label = $('[data-wall-programme]');
    const studioClock = $('[data-studio-clock]');
    const studioLabel = $('[data-studio-programme]');
    if (!clock && !label && !studioClock && !studioLabel) return;

    const now = nairobiNow();
    const programme = findCurrent(now);
    const name = programme ? programme.name + ' · ' + formatRange(programme) : t('wall.offAir');

    if (clock) clock.textContent = now.hh;
    if (label) label.textContent = name;
    if (studioClock) studioClock.textContent = now.hh;
    if (studioLabel) studioLabel.textContent = name;
  }

  /* Studio queue --------------------------------------------------------- */

  function studioToken() {
    try {
      return window.sessionStorage.getItem(STORE_STUDIO) || '';
    } catch (err) {
      return '';
    }
  }

  function rememberStudioToken(value) {
    studio.token = value || '';
    try {
      if (value) window.sessionStorage.setItem(STORE_STUDIO, value);
      else window.sessionStorage.removeItem(STORE_STUDIO);
    } catch (err) {
      /* A tab without storage can still use the queue for the current view. */
    }
  }

  function setStudioStatus(key, tone) {
    const status = $('[data-studio-status]');
    studio.statusKey = key || '';
    if (!status) return;
    status.textContent = key ? t(key) : '';
    status.className = 'form-status studio__status' + (tone ? ' is-' + tone : '');
  }

  function showBoard(show) {
    const board = $('[data-studio-board]');
    const leave = $('[data-studio-leave]');
    const gate = $('.studio__gate');
    if (board) board.hidden = !show;
    if (leave) leave.hidden = !show;
    if (gate) gate.hidden = show;
    if (show) updateWallClock();
  }

  function studioAction(url, body) {
    return window
      .fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-studio-token': studio.token },
        body: JSON.stringify(body || {}),
      })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (payload) {
          return { status: response.status, body: payload };
        });
      });
  }

  function buildStudioCard(item, index) {
    const li = doc.createElement('li');
    li.className = 'studio__item';
    li.setAttribute('data-studio-id', item.id);
    if (index === 0) li.classList.add('is-top');

    const head = doc.createElement('p');
    head.className = 'studio__item-head';

    const name = doc.createElement('strong');
    name.textContent = item.name;
    head.appendChild(name);

    const place = doc.createElement('span');
    place.className = 'studio__item-place';
    place.textContent = item.location;
    head.appendChild(place);

    const clock = doc.createElement('time');
    clock.className = 'studio__item-time';
    clock.textContent = eatClock(item.createdAt);
    head.appendChild(clock);

    const body = doc.createElement('p');
    body.className = 'studio__item-text';
    body.textContent = item.message;

    const actions = doc.createElement('p');
    actions.className = 'studio__item-actions';

    function action(labelKey, tone, verb) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--sm ' + tone;
      button.textContent = t(labelKey);
      button.addEventListener('click', function () {
        review(verb, item.id);
      });
      actions.appendChild(button);
    }

    if (item.status === 'pending') {
      action('studio.approveLabel', 'btn--accent', 'approve');
      action('studio.rejectLabel', 'btn--ghost', 'reject');
    } else {
      const state = doc.createElement('span');
      state.className = 'studio__item-state';
      state.textContent = t(item.status === 'approved' ? 'studio.onWallTag' : 'studio.rejectedTag');
      actions.appendChild(state);
    }

    action('studio.deleteLabel', 'btn--ghost btn--sm studio__danger', 'delete');

    li.appendChild(head);
    li.appendChild(body);

    if (item.programme) {
      const during = doc.createElement('p');
      during.className = 'studio__item-during';
      during.textContent = t('studio.sentDuring') + ' ' + item.programme;
      li.appendChild(during);
    }

    li.appendChild(actions);
    return li;
  }

  function renderStudio() {
    const queue = $('[data-studio-queue]');
    if (!queue) return;

    queue.textContent = '';
    studio.pending.forEach(function (item, index) {
      queue.appendChild(buildStudioCard(item, index));
    });

    const empty = $('[data-studio-empty]');
    if (empty) empty.hidden = studio.pending.length > 0;

    const onWall = $('[data-studio-onwall]');
    if (onWall) {
      onWall.textContent = '';
      studio.approved.forEach(function (item) {
        onWall.appendChild(buildStudioCard(item, -1));
      });
    }

    const wallEmpty = $('[data-studio-onwall-empty]');
    if (wallEmpty) wallEmpty.hidden = studio.approved.length > 0;
  }

  function fetchStudio() {
    if (doc.visibilityState === 'hidden') return Promise.resolve();
    if (!studio.token) return Promise.resolve();

    return window
      .fetch('/api/studio', { headers: { 'x-studio-token': studio.token, accept: 'application/json' } })
      .then(function (response) {
        if (response.status === 401) {
          studio.denied = true;
          rememberStudioToken('');
          showBoard(false);
          setStudioStatus('');
          const error = doc.getElementById('studio-token-error');
          if (error) {
            error.hidden = false;
            error.textContent = t('studio.badCode');
          }
          return null;
        }
        if (response.status === 501) {
          setStudioStatus('studio.offline', 'info');
          return null;
        }
        if (!response.ok) throw new Error('status ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (!payload) return;
        studio.denied = false;
        studio.loaded = true;
        studio.pending = Array.isArray(payload.pending) ? payload.pending : [];
        studio.approved = Array.isArray(payload.approved) ? payload.approved : [];
        renderStudio();
        if (studio.statusKey === 'studio.loading') setStudioStatus('');
      })
      .catch(function () {
        setStudioStatus('studio.offline', 'info');
      });
  }

  function review(verb, id) {
    setStudioStatus('studio.working', 'info');

    studioAction('/api/studio', { action: verb, id: id })
      .then(function (outcome) {
        if (outcome.status === 200) {
          studio.pending = Array.isArray(outcome.body.pending) ? outcome.body.pending : [];
          studio.approved = Array.isArray(outcome.body.approved) ? outcome.body.approved : [];
          renderStudio();
          setStudioStatus(
            verb === 'approve' ? 'studio.approved' : verb === 'reject' ? 'studio.rejected' : 'studio.deleted',
            'success'
          );
          return;
        }
        if (outcome.status === 401) {
          rememberStudioToken('');
          showBoard(false);
          setStudioStatus('');
          return;
        }
        setStudioStatus('studio.offline', 'error');
      })
      .catch(function () {
        setStudioStatus('studio.offline', 'error');
      });
  }

  function initStudioGate(form) {
    if (form.dataset.studioBound) return;
    form.dataset.studioBound = '1';

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const input = $('#studio-token', form);
      const value = input.value.trim();
      const error = doc.getElementById('studio-token-error');

      if (!value) {
        if (error) {
          error.hidden = false;
          error.textContent = t('studio.tokenRequired');
        }
        input.setAttribute('aria-invalid', 'true');
        return;
      }

      if (error) error.hidden = true;
      input.removeAttribute('aria-invalid');
      rememberStudioToken(value);
      showBoard(true);
      setStudioStatus('studio.loading', 'info');
      fetchStudio();
    });

    const leave = $('[data-studio-leave]', form);
    if (leave) {
      leave.addEventListener('click', function () {
        rememberStudioToken('');
        studio.pending = [];
        studio.approved = [];
        showBoard(false);
        setStudioStatus('');
      });
    }
  }

  let studioKeysBound = false;

  function initStudioKeys() {
    if (studioKeysBound) return;
    studioKeysBound = true;

    doc.addEventListener('keydown', function (event) {
      const board = $('[data-studio-board]');
      if (!board || board.hidden || event.metaKey || event.ctrlKey || event.altKey) return;

      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const top = studio.pending[0];
      if (!top) return;

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        review('approve', top.id);
      } else if (key === 'r') {
        event.preventDefault();
        review('reject', top.id);
      } else if (key === 'd') {
        event.preventDefault();
        review('delete', top.id);
      }
    });
  }

  function initStudio(scope) {
    const gate = $('[data-studio-gate-form]', scope);
    if (!gate) return;

    initStudioGate(gate);
    initStudioKeys();

    studio.token = studioToken();
    if (studio.token) {
      showBoard(true);
      fetchStudio();
    } else {
      showBoard(false);
    }

    renderStudio();
  }

  /* Boot ----------------------------------------------------------------- */

  function setYear() {
    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* Bindings that live outside <main> and are set up once per browser load. */
  function initChrome() {
    htmlLanguageFromStorage();
    initTheme();
    initDialogs();
    initPlayer();
    initSocial();
    initLanguage();
    setYear();

    const footer = $('.site-footer');
    if (footer) initShare(footer);

    initRouter();
    window.setInterval(updateNow, 15000);

    /* The wall and the queue are polled, not pushed: a county station does not
     * need a socket, and a few seconds is inside the pace of a live show. The
     * poll is silent while the tab is hidden and refetches on the way back. */
    window.setInterval(function () {
      if ($('[data-wall]')) fetchWall();
    }, WALL_POLL_MS);

    window.setInterval(function () {
      if ($('[data-studio-board]') && studio.token) fetchStudio();
    }, STUDIO_POLL_MS);

    window.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'hidden') {
        if ($('[data-wall]')) fetchWall();
        if ($('[data-studio-board]') && studio.token) fetchStudio();
      }
    });
  }

  /* Bindings for the current page, re-run after every content swap. */
  function initContent() {
    const main = $('main');
    if (!main) return;

    initTabs(main);
    initPresenters(main);
    initNews(main);
    initArticle(main);
    initForms(main);
    bindDialogControls(main);
    bindPlayButtons(main);
    initShare(main);
    initPodcasts(main);
    initWall(main);
    initStudio(main);
    preselectTopic();
    applyLanguage(lang, false);
  }

  function init() {
    initChrome();
    initContent();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
