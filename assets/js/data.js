'use strict';

/*
 * Published programme schedule supplied for this proposal.
 * Times are 24-hour East Africa Time (Africa/Nairobi). days: 0 = Sunday.
 * Only update this file when the station confirms a change; the homepage and
 * the programs page both render from it.
 */
window.RT_DATA = {
  schedule: [
    {
      id: 'ikihita',
      name: 'Ikihita',
      days: [1, 2, 3, 4, 5],
      start: '05:00',
      end: '09:00',
      presenters: [
        { id: 'john-rioba', name: 'John Rioba', alias: 'Warioba Senior' },
        { id: 'isimba', name: 'Isimba', alias: '' },
      ],
    },
    {
      id: 'tabataba',
      name: 'Tabataba',
      days: [1, 2, 3, 4, 5],
      start: '09:00',
      end: '13:00',
      presenters: [{ id: 'terry-rhobi', name: 'Terry Rhobi', alias: 'Superlady' }],
      noteKey: 'schedule.tabatabaNote',
    },
    {
      id: 'the-wire',
      name: 'The Wire',
      days: [1, 2, 3, 4, 5],
      start: '13:00',
      end: '16:00',
      presenters: [{ id: 'malenga-wa-kilimanjaro', name: 'Malenga wa Kilimanjaro', alias: '' }],
    },
    {
      id: 'ukiwirania',
      name: 'Ukiwirania',
      days: [1, 2, 3, 4, 5],
      start: '16:00',
      end: '20:00',
      presenters: [{ id: 'lucas-mwikabe', name: 'Lucas Mwikabe', alias: 'Mzee wa Kijiji' }],
    },
    {
      id: 'omogeka',
      name: 'Omogeka',
      days: [1, 2, 3, 4, 5],
      start: '20:00',
      end: '00:00',
      presenters: [{ id: 'lucas-magesa', name: 'Lucas Magesa', alias: 'Chunga Sumacho' }],
    },
    {
      id: 'sabato',
      name: 'Sabato',
      days: [6],
      start: '05:00',
      end: '09:00',
      presenters: [{ id: 'lucas-mwikabe', name: 'Lucas Mwikabe', alias: '' }],
    },
    {
      id: 'sauti-ya-watoto-wetu',
      name: 'Sauti ya Watoto Wetu',
      days: [6],
      start: '09:00',
      end: '12:00',
      presenters: [{ id: 'terry-rhobi', name: 'Terry Rhobi', alias: 'Superlady' }],
    },
  ],
};
