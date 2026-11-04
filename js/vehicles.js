/*
 * Sample cars with mileage and service history, and a service schedule. All invented.
 * The schedule is sample guidance shaped for the demo, not real manufacturer data.
 * Seeded separately, so nothing here can shift a dashboard figure.
 */
window.Vehicles = (function () {
  'use strict';

  const AS = window.AS;

  // miles / months: interval, either of which makes it due. No interval: only ever
  // offered because a health check flagged it. hrs: labour on top of the booked job.
  const ITEMS = {
    'oil-service': { name: 'Oil and filter', miles: 12000, months: 12, hrs: 0.5, parts: [['OIL-5L', 1], ['FILTER-OIL', 1]] },
    'air-filter': { name: 'Air filter', miles: 40000, months: 48, hrs: 0.3, parts: [['FILTER-AIR', 1]] },
    'cabin-filter': { name: 'Cabin filter', miles: 12000, months: 12, hrs: 0.3, parts: [['FILTER-CABIN', 1]] },
    'brake-fluid': { name: 'Brake fluid change', months: 24, safety: true, hrs: 0.5, parts: [['FLUID-DOT4', 1]] },
    coolant: { name: 'Coolant replacement', miles: 44000, months: 96, hrs: 0.8, parts: [['COOLANT-5L', 1]] },
    'front-pads': { name: 'Front brake pads', safety: true, hrs: 1.0, parts: [['PAD-F', 1]] },
    'rear-discs': { name: 'Rear brake discs', safety: true, hrs: 1.4, parts: [['DISC-R', 1]] },
    battery: { name: 'Battery', hrs: 0.3, parts: [['BATT-70', 1]] },
    wipers: { name: 'Wiper blades', hrs: 0.1, parts: [['WIPER-SET', 1]] },
    'rear-tyres': { name: 'Rear tyres (2)', safety: true, hrs: 0.6, parts: [['TYRE-235-55R19', 2]] },
  };

  // What each bookable job already includes, so it's never sold again as an extra.
  const COVERS = {
    Brakes: ['front-pads', 'rear-discs', 'brake-fluid'],
    Tyres: ['rear-tyres'],
    'Major service': ['oil-service', 'air-filter', 'cabin-filter'],
    Diesel: [],
    Diagnostics: [],
  };

  /* ---------- cars ---------- */

  // reg: make, model, registered, miles a year, visits [date, mileage], last done
  // { item: [date, mileage] }, health-check flags [date, item, amber|red, note, turned down].
  const SCENARIO = {
    // The mockup: a major service on Friday with a lot worth raising.
    'SC20 UYT': {
      make: 'Jaguar', model: 'E-Pace D180', registered: '2020-03-01', mpy: 11000,
      visits: [['2023-04-20', 18200], ['2024-10-15', 27400], ['2026-05-12', 35900]],
      done: { 'brake-fluid': ['2024-10-15', 27400], 'cabin-filter': ['2026-05-12', 35900], 'oil-service': ['2026-05-12', 35900] },
      flags: [
        ['2026-05-12', 'front-pads', 'amber', 'Measured 4 mm', true],
        ['2026-05-12', 'battery', 'amber', 'Weak on the battery test', true],
        ['2026-05-12', 'wipers', 'amber', 'Smearing', true],
        ['2026-05-12', 'rear-tyres', 'amber', 'Measured 3 mm', true],
      ],
    },
    // Today, and everything worth offering is on the shelf.
    'YF70 KTO': {
      make: 'Audi', model: 'A4 Avant 2.0 TDI', registered: '2020-09-01', mpy: 9000,
      visits: [['2024-06-10', 31000], ['2025-11-20', 42000]],
      done: { 'brake-fluid': ['2024-06-10', 31000], 'cabin-filter': ['2025-11-20', 42000], 'air-filter': ['2025-11-20', 42000], 'oil-service': ['2025-11-20', 42000], coolant: ['2025-11-20', 42000] },
      flags: [['2025-11-20', 'wipers', 'amber', 'Smearing', true]],
    },
    // A pair that both want Branch 1's one set of rear discs.
    'GN19 HVD': {
      make: 'Ford', model: 'Transit Custom 2.0 EcoBlue', registered: '2019-03-01', mpy: 18000,
      visits: [['2026-08-14', 101500]],
      done: { 'brake-fluid': ['2026-08-14', 101500], 'cabin-filter': ['2026-08-14', 101500], 'air-filter': ['2026-08-14', 101500], 'oil-service': ['2026-08-14', 101500], coolant: ['2026-08-14', 101500] },
      flags: [['2026-08-14', 'rear-discs', 'amber', 'Worn, with a lip on the edge', true]],
    },
    'WR69 NMC': {
      make: 'BMW', model: 'X3 xDrive20d', registered: '2019-09-01', mpy: 12000,
      visits: [['2026-07-02', 74800]],
      done: { 'brake-fluid': ['2026-07-02', 74800], 'cabin-filter': ['2026-07-02', 74800], 'air-filter': ['2026-07-02', 74800], 'oil-service': ['2026-07-02', 74800], coolant: ['2026-07-02', 74800] },
      flags: [['2026-07-02', 'rear-discs', 'amber', 'Worn, with a lip on the edge', true]],
    },
    // Recently serviced, nothing to raise.
    'KY72 BLN': {
      make: 'Volkswagen', model: 'Tiguan 1.5 TSI', registered: '2022-09-01', mpy: 8000,
      visits: [['2026-09-01', 24000]],
      done: Object.fromEntries(['brake-fluid', 'cabin-filter', 'air-filter', 'oil-service', 'coolant'].map((k) => [k, ['2026-09-01', 24000]])),
      flags: [],
    },
  };

  // The other cars already in the planner, with plain made-up histories.
  const OTHERS = [
    'LK21 ABX - BMW - 3 Series', 'MA68 ZPL - Volkswagen - Golf', 'BD22 LWE - Mercedes-benz - C Class', 'DE71 PFA - Audi - Q5',
    'PX18 RGK - Ford - Focus', 'HF21 WJS - BMW - 1 Series', 'EO19 TVM - Mercedes-benz - A Class', 'LN70 CXR - Ford - Puma',
    'VK22 GHT - Audi - A3', 'RJ20 ZOB - Jaguar - XF', 'NU68 DSE - Volkswagen - Polo', 'SB71 PLK - BMW - 5 Series',
    'CT22 MVA - Mercedes-benz - GLC', 'FG69 YRU - Ford - Kuga', 'OE21 NHC - Audi - A6', 'KE70 RWD - Land Rover - Discovery Sport',
    'MW19 HKP - Volvo - XC60', 'GY21 NBF - Skoda - Octavia', 'BN77 JUJ - Jaguar - F-Pace',
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** UK plates: "21" is March 2021, "71" is September 2021. */
  function registeredFrom(reg) {
    const n = Number(reg.slice(2, 4));
    return n >= 50 ? `20${String(n - 50).padStart(2, '0')}-09-01` : `20${String(n).padStart(2, '0')}-03-01`;
  }

  function generate() {
    const rnd = mulberry32(6112026);
    const cars = {};
    OTHERS.forEach((line) => {
      const [reg, make, model] = line.split(' - ');
      const registered = registeredFrom(reg);
      const mpy = 7000 + Math.round(rnd() * 6) * 1000;
      const last = AS.toIso(AS.toN('2026-11-04') - 60 - Math.floor(rnd() * 240));
      const miles = Math.round((((AS.toN(last) - AS.toN(registered)) / 365) * mpy) / 100) * 100;
      const done = Object.fromEntries(['brake-fluid', 'cabin-filter', 'air-filter', 'oil-service', 'coolant'].map((k) => [k, [last, miles]]));
      const flags = rnd() < 0.4 ? [[last, ['wipers', 'front-pads', 'battery'][Math.floor(rnd() * 3)], 'amber', 'Flagged amber', true]] : [];
      cars[reg] = { make: make.replace('Mercedes-benz', 'Mercedes-Benz'), model, registered, mpy, visits: [[last, miles]], done, flags };
    });
    return Object.assign(cars, SCENARIO);
  }

  const CARS = generate();

  const norm = (reg) => String(reg || '').toUpperCase().replace(/\s+/g, '');

  /** The car for a registration, ignoring spaces and case, or null. */
  function lookup(reg) {
    const key = Object.keys(CARS).find((k) => norm(k) === norm(reg));
    return key ? Object.assign({ reg: key }, CARS[key]) : null;
  }

  /** Last recorded mileage plus average daily miles since, to the nearest 100. */
  function estimateMileage(car, date) {
    const [last, miles] = car.visits[car.visits.length - 1];
    const days = Math.max(0, AS.toN(date) - AS.toN(last));
    return Math.round((miles + (car.mpy / 365) * days) / 100) * 100;
  }

  return { ITEMS, COVERS, lookup, estimateMileage, regs: () => Object.keys(CARS) };
})();
