/*
 * Swapping into a customer's preferred time. When the time a caller wanted is taken,
 * findSwap works out whose single appointment is in the way, what would move, and
 * which other times would suit that customer. Nothing here changes the diary: the
 * swap is only applied after an advisor approves the request AND the other customer
 * says yes on the phone. Uses Optimiser's rules, so a swap obeys the same shift,
 * absence, clash, bay and apprentice checks as everything else.
 */
window.Swap = (function () {
  'use strict';

  const AS = window.AS;
  const R = () => window.Optimiser.rules;
  const LATEST = 17.5;

  const nextWorking = (iso) => { let n = AS.toN(iso) + 1; while (AS.dateOf(n).getUTCDay() === 0) n++; return AS.toIso(n); };
  const span = (c) => [R().abs(c.from[0], c.from[1]), R().abs(c.to[0], c.to[1])];

  /** Can this technician take a job here, given the cards in `cards`? Returns a bay, or null. */
  function fits(snap, cards, techName, date, from, to, kind, job, preferBay) {
    const r = R();
    const tech = snap.techs.find((t) => t.name === techName);
    const shift = tech && tech.shift(r.dowOf(date));
    if (!shift || from < shift[0] || to > shift[1]) return null;
    if (r.isApprentice(techName) && r.needsSeniorTech(job)) return null;
    const a1 = r.abs(date, from);
    const a2 = r.abs(date, to);
    if (r.techAway(tech, a1, a2)) return null;
    const view = Object.assign({}, snap, { cards });
    if (r.techBusy(view, techName, a1, a2)) return null;
    const bays = r.baysFor(kind, snap.bays);
    const order = preferBay && bays.includes(preferBay) ? [preferBay, ...bays.filter((b) => b !== preferBay)] : bays;
    return order.find((b) => !r.bayBusy(view, b, a1, a2)) || null;
  }

  /** Up to two other times for the customer who'd move: later the same day, then the next working day. */
  function alternatives(snap, cards, blocker) {
    const dur = blocker.to[1] - blocker.from[1];
    const job = { hrs: dur, l2: blocker.l2 };
    const out = [];
    [blocker.from[0], nextWorking(blocker.from[0])].forEach((date, dayIdx) => {
      for (let h = dayIdx ? 8 : 9; h + dur <= LATEST; h += 0.5) {
        const bay = fits(snap, cards, blocker.res, date, h, h + dur, 'ramp', job, blocker.bay);
        if (bay) { out.push({ date, from: h, to: h + dur, res: blocker.res, bay }); break; }
      }
    });
    return out;
  }

  /**
   * preference: { date, hour }. booked: the caller's booked card ({ id, res, bay, from, to }).
   * Returns the swap, or null when the time is already theirs or no single move frees it.
   */
  function findSwap(preference, booked, typeId) {
    const r = R();
    const snap = window.Workshop.snapshot();
    const { date, hour } = preference;
    if (booked.from[0] === date && booked.from[1] === hour) return null;
    const dur = booked.to[1] - booked.from[1];
    const type = window.Matching.typeOf(typeId);
    const job = { hrs: dur, l2: type.desc };
    const others = snap.cards.filter((c) => c.id !== booked.id);
    const want = [r.abs(date, hour), r.abs(date, hour + dur)];
    const techs = window.Matching.stats(typeId).filter((s) => !s.limited).map((s) => s.tech);

    for (const techName of techs) {
      const blockers = others.filter((c) => c.res === techName && r.overlaps(want[0], want[1], ...span(c)));
      // Only one appointment in the way, and a customer the agent can phone.
      if (blockers.length !== 1 || !blockers[0].phone || blockers[0].hrs >= 40) continue;
      const blocker = blockers[0];
      const without = others.filter((c) => c.id !== blocker.id);
      const bay = fits(snap, without, techName, date, hour, hour + dur, type.kind, job, blocker.bay);
      if (!bay) continue;
      const moved = { id: booked.id, res: techName, bay, from: [date, hour], to: [date, hour + dur] };
      const alts = alternatives(snap, [...without, Object.assign({}, booked, moved)], blocker);
      if (!alts.length) continue;
      return { preference, booked: Object.assign({}, booked), moved, blocker, alternatives: alts, deadline: 17 };
    }
    return null;
  }

  /** The two moves as one change set, checked for clashes. Null if the diary no longer allows it. */
  function swapPlan(swap, choice) {
    const alt = swap.alternatives[choice];
    const b = swap.blocker;
    const changes = [
      { kind: 'move', id: b.id, res: alt.res, bay: alt.bay, from: [alt.date, alt.from], to: [alt.date, alt.to] },
      { kind: 'move', id: swap.moved.id, res: swap.moved.res, bay: swap.moved.bay, from: swap.moved.from, to: swap.moved.to },
    ];
    const snap = window.Workshop.snapshot();
    changes.forEach((c) => Object.assign(snap.cards.find((x) => x.id === c.id) || {}, { res: c.res, bay: c.bay, from: c.from, to: c.to }));
    const plan = { changes };
    const ok = R().validate(snap, plan).every((x) => x.pass) && changes.every((c) => snap.cards.some((x) => x.id === c.id));
    return ok ? plan : null;
  }

  /** What the advisor's preview shows: the caller dotted into the preferred time, the other customer marked. */
  function previewPlan(swap) {
    return { changes: [
      { kind: 'move', id: swap.moved.id, res: swap.moved.res, bay: swap.moved.bay, from: swap.moved.from, to: swap.moved.to },
      { kind: 'mark', id: swap.blocker.id },
    ] };
  }

  return { findSwap, swapPlan, previewPlan };
})();
