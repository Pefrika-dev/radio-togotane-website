'use strict';

/*
 * Single configuration point for the station and the live player.
 *
 * STREAM URL
 * ----------
 * This is the station's public Zeno.fm feed, taken from its own Zeno station
 * profile (station id 17f52439-0a69-47ff-8dc2-f7c16cbd5b8e, published at
 * zeno.fm/radio/radio-togotane-88-3-fm). Verified on 2026-10-30: the feed
 * answers over HTTPS as 128 kbps MP3 and identifies itself as
 * "RADIO TOGOTANE 88.3 FM". Ask the station to confirm this is the authorised
 * feed; if its provider issues a different address, replace the value below.
 *
 * A direct MP3 or AAC stream over HTTPS plays natively everywhere. HLS (.m3u8)
 * only plays natively in Safari; Chrome and Firefox need an HLS library, so a
 * direct stream URL is preferred. An empty value disables playback and the
 * player explains that online audio is not connected.
 */
window.RT_CONFIG = {
  streamUrl: 'https://stream.zeno.fm/1dahxtvjx47vv',

  station: {
    name: 'Radio Togotane 88.3 FM',
    frequency: '88.3',
    town: 'Kehancha',
    county: 'Migori County',
    country: 'Kenya',
    timezone: 'Africa/Nairobi',
    whatsapp: '254714426619',
    email: 'togotaneradiofm@gmail.com',
    phones: ['+254701395196', '+254728506650'],
  },

  // Official station accounts, as published by the station itself and by the
  // public radio directory radio.ke. They were cross-checked against the Zeno
  // profile and the YouTube channel on 2026-10-30. No official Instagram or
  // TikTok account could be verified, so none is listed. Entries with an empty
  // or non-https value are skipped; with none set, social rows stay hidden.
  social: {
    facebook: 'https://www.facebook.com/TogotaneRadioOfficial/',
    youtube: 'https://www.youtube.com/@togotaneradiofm3254',
    x: 'https://x.com/togotane',
    tiktok: '',
    instagram: '',
  },
};
