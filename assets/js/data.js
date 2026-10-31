'use strict';

/*
 * Programme schedule as published by the station.
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
    {
      id: 'agakarai-numukuria',
      name: 'Agakarai Numukuria',
      days: [6],
      start: '12:00',
      end: '16:00',
      presenters: [],
    },
    {
      id: 'iritara-reemehooro',
      name: 'Iritara Reemehooro',
      days: [6],
      start: '16:00',
      end: '18:00',
      presenters: [],
    },
    {
      id: 'omongoroba-umunyoohu',
      name: 'Omongoroba Umunyoohu',
      days: [6],
      start: '18:00',
      end: '21:00',
      presenters: [],
    },
    {
      id: 'amaitabiryo',
      name: 'Amaitabiryo',
      days: [0],
      start: '05:00',
      end: '09:00',
      presenters: [],
    },
    {
      id: 'tusimane',
      name: 'Tusimane',
      days: [0],
      start: '09:00',
      end: '13:00',
      presenters: [],
    },
    {
      id: 'reggae-brast',
      name: 'Reggae Brast',
      days: [0],
      start: '13:00',
      end: '16:00',
      presenters: [],
    },
    {
      id: 'misa-mix',
      name: 'Misa Mix',
      days: [0],
      start: '16:00',
      end: '19:00',
      presenters: [],
    },
    {
      id: 'gospel-sunday',
      name: 'Gospel Sunday',
      days: [0],
      start: '19:00',
      end: '22:00',
      presenters: [],
    },
  ],
};
