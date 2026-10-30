'use strict';

// Runs before first paint so the saved theme and language are applied without a flash.
(function () {
  try {
    var theme = localStorage.getItem('rt-theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    var lang = localStorage.getItem('rt-lang');
    if (lang === 'en' || lang === 'sw') {
      document.documentElement.setAttribute('lang', lang);
    }
  } catch (err) {
    /* Storage can be unavailable in private modes; defaults still apply. */
  }
})();
