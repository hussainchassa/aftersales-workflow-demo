/*
 * Works out the extra work worth offering on a booking call: what the schedule says
 * is due or coming up, and what the customer turned down on a health check in the
 * last 12 months. Only items whose parts can be in Branch 1 by the end of the working
 * day before the appointment are offerable; the rest are listed with their earliest day.
 *
 * Returns plain data with reasons written to be read out, so a person or a future
 * voice agent can use the same answer.
 */
window.Upsell = (function () {
  'use strict';

  const AS = window.AS;
  const V = window.Vehicles;
  const P = window.Parts;

  const VAT = 0.2;
  const COMING_MILES = 3000;
  const COMING_DAYS = 91;
  const FLAG_DAYS = 365;
  const TOP = 3;
  const MONTH = 30.44;

  let rate = null;
  const labourRate = () => rate || (rate = AS.value('elr', AS.summary({ from: AS.END - 89, to: AS.END, branch: 0 })) || 0);

  const fmtMiles = (n) => Math.round(n).toLocaleString('en-GB');
  const monthYear = (iso) => AS.dateOf(AS.toN(iso)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthName = (iso) => AS.dateOf(AS.toN(iso)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const every = (months) => (months % 12 === 0 && months >= 24 ? `${months / 12} years` : `${months} months`);

  /** Where the schedule stands for one item: due, coming up, or neither. */
  function scheduleStatus(car, id, item, miles, date) {
    if (!item.miles && !item.months) return null;
    const [lastDate, lastMiles] = car.done[id] || [car.registered, 0];
    const dueMiles = item.miles ? lastMiles + item.miles : null;
    const dueN = item.months ? AS.toN(lastDate) + item.months * MONTH : null;
    const milesShare = item.miles ? (miles - dueMiles) / item.miles : -Infinity;
    const timeShare = item.months ? (AS.toN(date) - dueN) / (item.months * MONTH) : -Infinity;
    const share = Math.max(milesShare, timeShare);
    const byMiles = milesShare >= timeShare;
    if (share >= 0) {
      const over = miles - dueMiles;
      const reason = byMiles
        ? (car.done[id] ? `Due every ${fmtMiles(item.miles)} miles. You're about ${fmtMiles(over)} over.` : `Due at ${fmtMiles(dueMiles)} miles. You're about ${fmtMiles(over)} over.`)
        : `Due every ${every(item.months)}. Last done ${car.done[id] ? monthYear(lastDate) : 'when new'}.`;
      return { kind: 'due', share, reason, tag: byMiles && over >= 100 ? `${fmtMiles(over)} miles over` : 'Due now' };
    }
    const milesAway = item.miles ? dueMiles - miles : Infinity;
    const daysAway = item.months ? dueN - AS.toN(date) : Infinity;
    if (milesAway <= COMING_MILES || daysAway <= COMING_DAYS) {
      const reason = milesAway <= COMING_MILES
        ? `Due at ${fmtMiles(dueMiles)} miles, about ${fmtMiles(milesAway)} away. Doing it now saves a visit.`
        : `Due in ${monthName(AS.toIso(Math.round(dueN)))}. Doing it now saves a visit.`;
      return { kind: 'coming', share, reason, tag: 'Coming up' };
    }
    return null;
  }

  /** The latest health-check flag the customer turned down, if it still stands. */
  function turnedDown(car, id, date) {
    const done = car.done[id];
    return car.flags
      .filter((f) => f[1] === id && f[4] && AS.toN(date) - AS.toN(f[0]) <= FLAG_DAYS && !(done && done[0] > f[0]))
      .sort((a, b) => b[0].localeCompare(a[0]))[0] || null;
  }

  /** Where each part comes from, and whether all of them make it in time. */
  function partsPlan(item, date, today) {
    const parts = item.parts.map(([part, qty]) => Object.assign({ part, qty, name: P.name(part) }, P.availability(part, qty, date, today)));
    const ok = parts.every((p) => p.source);
    const earliest = ok ? null : parts.filter((p) => !p.source).map((p) => p.earliest).sort().pop();
    return { parts, ok, earliest };
  }

  /**
   * The order extras are offered in. Negative when a should come before b.
   * Each item has: safety (true/false), kind ('due' | 'coming' | null),
   * share (how far past due, as a fraction of its interval; higher is more overdue),
   * flagged (turned down before) and price (inc VAT).
   */
  function compare(a, b) {
    if (a.safety !== b.safety) return a.safety ? -1 : 1;
    // Due beats turned down, which beats coming up: what's needed now before what's optional.
    const stage = (x) => (x.kind === 'due' ? 0 : x.flagged ? 1 : 2);
    if (stage(a) !== stage(b)) return stage(a) - stage(b);
    if (a.kind === 'due' && b.kind === 'due' && a.share !== b.share) return b.share - a.share;
    return b.price - a.price;
  }

  /**
   * request: { reg, mileage (optional, overrides the estimate), type, date, today }
   * Returns { car: null } for an unknown registration, otherwise the car, the mileage
   * used, offerable items (top three ticked), items the booked job already covers,
   * and items whose parts can't arrive in time.
   */
  function extras(request) {
    const car = V.lookup(request.reg);
    if (!car) return { car: null, reg: request.reg };
    const estimate = V.estimateMileage(car, request.today);
    const miles = request.mileage || estimate;
    const covers = V.COVERS[request.type] || [];
    const offer = [];
    const covered = [];
    const unavailable = [];

    Object.entries(V.ITEMS).forEach(([id, item]) => {
      const status = scheduleStatus(car, id, item, miles, request.date);
      const flag = turnedDown(car, id, request.date);
      if (!status && !flag) return;
      const tags = [];
      if (item.safety) tags.push('Safety');
      if (status) tags.push(status.tag);
      if (flag) tags.push(`Turned down ${monthName(flag[0]).slice(0, 3)}`);
      let reason = status ? status.reason : `${flag[3]} in ${monthName(flag[0])}, and you said not yet.`;
      if (status && flag) reason += ` Also flagged in ${monthName(flag[0])}: ${flag[3].toLowerCase()}.`;
      const partsCost = item.parts.reduce((a, [part, qty]) => a + P.price(part) * qty, 0);
      const out = {
        id, name: item.name, reason, tags, hours: item.hrs,
        price: Math.round((partsCost + item.hrs * labourRate()) * (1 + VAT)),
        safety: !!item.safety, kind: status ? status.kind : null, share: status ? status.share : -Infinity, flagged: !!flag,
      };
      if (covers.includes(id)) { covered.push(out); return; }
      const plan = partsPlan(item, request.date, request.today);
      Object.assign(out, { parts: plan.parts, earliest: plan.earliest });
      (plan.ok ? offer : unavailable).push(out);
    });

    offer.sort(compare);
    offer.forEach((x, i) => { x.ticked = i < TOP; });
    return { car, reg: car.reg, mileage: miles, estimated: !request.mileage, lastVisit: car.visits[car.visits.length - 1], items: offer, covered, unavailable };
  }

  return { extras, compare, VAT };
})();
