/*
 * Parts stock for the three branches, invented sample data. Answers one question
 * for the upsell: can this part be in Branch 1 by the end of the working day
 * before the appointment? Sources are tried in order: the shelf, a transfer from
 * another branch, then the supplier.
 *
 * Holds, transfers and orders made in the demo change what's available until the
 * page reloads. Workshop.apply() and undo() save and restore this state with the
 * diary, so one undo reverses a booking and its parts together.
 */
window.Parts = (function () {
  'use strict';

  const AS = window.AS;
  const BRANCHES = AS.BRANCHES;
  const HOME = 0; // Branch 1, the only diary in the demo.
  const TRANSFER_DAYS = 1;

  // id: [name, price excluding VAT, supplier lead time in working days]
  const PARTS = {
    'FLUID-DOT4': ['Brake fluid, 1 litre', 12, 1],
    'PAD-F': ['Front brake pads', 68, 1],
    'DISC-R': ['Rear brake discs, pair', 140, 3],
    'BATT-70': ['Battery, 70 Ah', 145, 2],
    'WIPER-SET': ['Wiper blades, pair', 22, 1],
    'COOLANT-5L': ['Coolant, 5 litres', 28, 1],
    'TYRE-235-55R19': ['Tyre, 235/55 R19', 135, 4],
    'FILTER-CABIN': ['Cabin filter', 24, 1],
    'FILTER-AIR': ['Air filter', 30, 1],
    'OIL-5L': ['Engine oil, 5 litres', 38, 1],
    'FILTER-OIL': ['Oil filter', 14, 1],
  };

  // Stock on the shelf, by branch. Shaped for the demo scenarios: the battery is only
  // at Branch 2, nobody has coolant or the 19-inch tyres, and Branch 1 has one set of
  // rear discs, so the second car to want them can't have them in time.
  const START = [
    { 'FLUID-DOT4': 6, 'PAD-F': 3, 'DISC-R': 1, 'WIPER-SET': 4, 'FILTER-CABIN': 5, 'FILTER-AIR': 4, 'OIL-5L': 8, 'FILTER-OIL': 8 },
    { 'FLUID-DOT4': 4, 'PAD-F': 2, 'BATT-70': 1, 'WIPER-SET': 2, 'FILTER-CABIN': 2 },
    { 'FLUID-DOT4': 3, 'PAD-F': 1, 'WIPER-SET': 3, 'FILTER-AIR': 2 },
  ];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  let state = { stock: clone(START), partHolds: [], orders: [] };

  /* ---------- working days (Monday to Saturday) ---------- */

  const isOpen = (n) => AS.dateOf(n).getUTCDay() !== 0;
  function addWorking(iso, days) {
    let n = AS.toN(iso);
    for (let i = 0; i < days;) { n++; if (isOpen(n)) i++; }
    return AS.toIso(n);
  }
  function prevWorking(iso) {
    let n = AS.toN(iso) - 1;
    while (!isOpen(n)) n--;
    return AS.toIso(n);
  }

  /* ---------- availability ---------- */

  const shelf = (part) => (state.stock[HOME][part] || 0) - state.partHolds.filter((h) => h.part === part).reduce((a, h) => a + h.qty, 0);
  const at = (branch, part) => state.stock[branch][part] || 0;

  /**
   * How a quantity of a part can be in Branch 1 for an appointment on `date`.
   * Returns { source: 'shelf' | 'transfer' | 'order', from, arrives } or
   * { source: null, earliest } with the first appointment day it could make.
   */
  function availability(part, qty, date, today) {
    if (shelf(part) >= qty) return { source: 'shelf', arrives: today };
    const readyBy = date === today ? null : prevWorking(date);
    const options = [];
    for (let b = 0; b < BRANCHES.length; b++) {
      if (b !== HOME && at(b, part) >= qty) options.push({ source: 'transfer', from: BRANCHES[b], fromIdx: b, arrives: addWorking(today, TRANSFER_DAYS) });
    }
    options.push({ source: 'order', from: 'Supplier', arrives: addWorking(today, PARTS[part][2]) });
    const ok = options.find((o) => readyBy && o.arrives <= readyBy);
    if (ok) return ok;
    const first = options.reduce((a, o) => (o.arrives < a ? o.arrives : a), options[0].arrives);
    return { source: null, earliest: addWorking(first, 1) };
  }

  /**
   * Parts changes for a booking, working through the needs in turn so two needs for
   * the same part can't both count the last one. Returns null if anything can't make it.
   */
  function plan(needs, date, today, booking) {
    const saved = clone(state);
    const changes = [];
    try {
      for (const n of needs) {
        const a = availability(n.part, n.qty, date, today);
        if (!a.source) return null;
        const c = a.source === 'shelf'
          ? { kind: 'hold', part: n.part, qty: n.qty, booking }
          : { kind: a.source, part: n.part, qty: n.qty, from: a.from, fromIdx: a.fromIdx, arrives: a.arrives, booking };
        changes.push(c);
        apply([c]);
      }
      return changes;
    } finally {
      state = saved;
    }
  }

  function apply(changes) {
    (changes || []).forEach((c) => {
      if (c.kind === 'hold') state.partHolds.push({ part: c.part, qty: c.qty, booking: c.booking });
      if (c.kind === 'transfer') state.stock[c.fromIdx][c.part] -= c.qty;
      // Transferred and ordered parts are reserved for their booking, so they never join the shelf.
      if (c.kind === 'transfer' || c.kind === 'order') state.orders.push({ kind: c.kind, part: c.part, qty: c.qty, from: c.from, arrives: c.arrives, booking: c.booking });
    });
  }

  /** One line per change, for the confirmation and the log. */
  function describe(c) {
    const n = PARTS[c.part][0];
    const name = `${c.qty} × ${n[0].toLowerCase()}${n.slice(1)}`;
    const day = AS.dateOf(AS.toN(c.arrives || '2026-11-04')).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    if (c.kind === 'hold') return `Hold ${name} from Branch 1 stock`;
    if (c.kind === 'transfer') return `Request ${name} from ${c.from}, arriving ${day}`;
    return `Order ${name} from the supplier, arriving ${day}`;
  }

  return {
    PARTS, availability, plan, apply, describe, addWorking, prevWorking,
    name: (part) => PARTS[part][0], price: (part) => PARTS[part][1],
    snapshot: () => clone(state), restore: (s) => { state = clone(s); }, state: () => clone(state),
  };
})();
