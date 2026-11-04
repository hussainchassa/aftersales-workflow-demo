/*
 * Works out an improvement plan against the live diary, then shows it for approval.
 * Nothing here changes the diary: Workshop.apply() does that, after a person approves.
 *
 * Rules are hard constraints, re-tested by validate() on the finished plan:
 * inside the technician's shift, no absences, no double booking of a technician or
 * a bay, right bay for the work, and apprentices only on short routine jobs.
 */
window.Optimiser = (function () {
  'use strict';

  const AS = window.AS;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const abs = (date, hour) => AS.toN(date) * 24 + hour;
  const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
  const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const when = (date, h) => `${AS.fmtShort(AS.toN(date))} ${hhmm(h)}`;
  const ceilQuarter = (h) => Math.ceil(h * 4 - 1e-9) / 4;
  const dowOf = (date) => AS.dateOf(AS.toN(date)).getUTCDay();
  const gbp = (v) => AS.approx(v);

  const jobKind = (job) => {
    const t = `${job.l1} ${job.l2}`;
    if (/tyres?\b/i.test(t)) return 'tyre';
    if (/\bMOT\b/.test(job.l2) && !/service/i.test(job.l2)) return 'mot';
    return 'ramp';
  };
  const needsSeniorTech = (job) => job.hrs > 2 || /warranty|diagnos|timing|clutch|investigation/i.test(job.l2);
  const isApprentice = (name) => /apprentice/i.test(name);
  const baysFor = (kind, all) => {
    const ramps = all.filter((b) => b.startsWith('Ramp'));
    if (kind === 'mot') return ['MOT lane', ...ramps];
    if (kind === 'tyre') return ['Tyre bay', ...ramps];
    return ramps;
  };

  function techBusy(snap, name, a1, a2) {
    return snap.cards.some((c) => c.res === name && overlaps(a1, a2, abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1])));
  }
  function techAway(tech, a1, a2) {
    return tech.abs.some((x) => overlaps(a1, a2, abs(x[0], x[1]), abs(x[2], x[3])));
  }
  function bayBusy(snap, bay, a1, a2) {
    return snap.cards.some((c) => c.bay === bay && overlaps(a1, a2, abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1])))
      || snap.holds.some((h) => h.bay === bay && overlaps(a1, a2, abs(h.from[0], h.from[1]), abs(h.to[0], h.to[1])));
  }

  /* ---------- the individual moves ---------- */

  function planHolds(snap) {
    const changes = [];
    const rows = [];
    let freed = 0;
    snap.holds.filter((h) => h.bay).forEach((h) => {
      for (let d = AS.toN(h.from[0]); d <= AS.toN(h.to[0]); d++) {
        const date = AS.toIso(d);
        const from = date === h.from[0] ? h.from[1] : 8;
        const to = date === h.to[0] ? h.to[1] : 17.5;
        const start = date === snap.today ? Math.max(from, snap.nowHour) : from;
        freed += Math.max(0, to - start);
      }
      rows.push([h.vehicle, h.bay, 'Holding yard', h.reason]);
      changes.push({ kind: 'hold', id: h.id });
      h.bay = null;
    });
    return { changes, rows, freed };
  }

  function planLongJob(snap) {
    const changes = [];
    const rows = [];
    let freed = 0;
    const longBay = 'Long-stay bay';
    snap.cards.filter((c) => c.hrs >= 40 && c.bay !== longBay).forEach((c) => {
      const a1 = abs(c.from[0], c.from[1]);
      const a2 = abs(c.to[0], c.to[1]);
      if (bayBusy(snap, longBay, a1, a2)) return;
      for (let d = AS.toN(snap.today); d <= AS.toN(c.to[0]); d++) {
        const date = AS.toIso(d);
        freed += Math.max(0, 17.5 - (date === snap.today ? snap.nowHour : 8));
      }
      rows.push([c.l1, c.bay, longBay, `${c.hrs.toFixed(1)}-hour job. It ties up a ramp until ${AS.fmtShort(AS.toN(c.to[0]))}`]);
      changes.push({ kind: 'bay', id: c.id, bay: longBay });
      c.bay = longBay;
    });
    return { changes, rows, freed };
  }

  function planReassign(snap) {
    const changes = [];
    const rows = [];
    let hours = 0;
    const unplaced = [];
    snap.cards.filter((c) => {
      const owner = snap.techs.find((t) => t.name === c.res);
      return owner && techAway(owner, abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1]));
    }).forEach((c) => {
      const pick = freeTechs(snap, c, c.from[0], c.from[1], c.to[1], c.res)[0];
      if (!pick) { unplaced.push(c.l1); return; }
      rows.push([c.l1, c.res, pick.name, `${c.res} is away. Same time, ${when(c.from[0], c.from[1])}`]);
      changes.push({ kind: 'reassign', id: c.id, res: pick.name });
      c.res = pick.name; c.ghost = 0;
      hours += c.hrs;
    });
    return { changes, rows, hours, unplaced };
  }

  /** Technicians free for a window, least loaded that day first. */
  function freeTechs(snap, job, date, h1, h2, exclude) {
    const a1 = abs(date, h1);
    const a2 = abs(date, h2);
    const dow = dowOf(date);
    return snap.techs.filter((t) => {
      if (t.name === exclude) return false;
      const shift = t.shift(dow);
      if (!shift || h1 < shift[0] || h2 > shift[1]) return false;
      if (isApprentice(t.name) && needsSeniorTech(job)) return false;
      return !techAway(t, a1, a2) && !techBusy(snap, t.name, a1, a2);
    }).map((t) => ({ name: t.name, load: dayLoad(snap, t.name, date), total: totalLoad(snap, t.name) }))
      .sort((a, b) => a.load - b.load || a.total - b.total); // Spread work across the team, not just within a day.
  }

  function totalLoad(snap, name) {
    return snap.cards.filter((c) => c.res === name && c.hrs < 40).reduce((sum, c) => sum + c.hrs, 0);
  }

  function dayLoad(snap, name, date) {
    const d1 = abs(date, 0);
    const d2 = abs(date, 24);
    return snap.cards.filter((c) => c.res === name).reduce((sum, c) => {
      const a1 = Math.max(d1, abs(c.from[0], c.from[1]));
      const a2 = Math.min(d2, abs(c.to[0], c.to[1]));
      return sum + Math.max(0, a2 - a1);
    }, 0);
  }

  function planBooking(snap) {
    const changes = [];
    const rows = [];
    const unplaced = [];
    let hours = 0;
    const order = snap.jobs.slice().sort((a, b) => a.date.localeCompare(b.date)
      || Number(b.tags.includes('arrived')) - Number(a.tags.includes('arrived')) || b.hrs - a.hrs);
    order.forEach((job) => {
      const earliest = job.date === snap.today ? ceilQuarter(snap.nowHour) : 8;
      const kind = jobKind(job);
      let placed = null;
      for (let start = earliest; start + job.hrs <= 19 && !placed; start += 0.25) {
        const end = start + job.hrs;
        const bay = baysFor(kind, snap.bays).find((b) => !bayBusy(snap, b, abs(job.date, start), abs(job.date, end)));
        if (!bay) continue;
        const tech = freeTechs(snap, job, job.date, start, end)[0];
        if (tech) placed = { start, end, bay, tech: tech.name };
      }
      if (!placed) { unplaced.push(job.l1); return; }
      const from = [job.date, placed.start];
      const to = [job.date, placed.end];
      rows.push([job.l1, 'Unallocated', `${placed.tech}, ${placed.bay}`, `${when(job.date, placed.start)} to ${hhmm(placed.end)}. ${job.l2}`]);
      changes.push({ kind: 'book', id: job.id, res: placed.tech, bay: placed.bay, from, to });
      snap.cards.push({ id: `b${job.id}`, res: placed.tech, bay: placed.bay, from, to, hrs: job.hrs, l1: job.l1, l2: job.l2, tags: job.tags, isNew: true });
      hours += job.hrs;
    });
    return { changes, rows, hours, unplaced };
  }

  /* ---------- independent checks on the finished diary ---------- */

  function validate(snap, plan) {
    const touched = new Set(plan.changes.filter((c) => c.kind !== 'hold').map((c) => (c.kind === 'book' ? `b${c.id}` : c.id)));
    const moved = snap.cards.filter((c) => touched.has(c.id));
    const shiftOk = moved.every((c) => {
      if (c.hrs >= 40) return true; // Long jobs keep the times they already had.
      const t = snap.techs.find((x) => x.name === c.res);
      const s = t && t.shift(dowOf(c.from[0]));
      return s && c.from[1] >= s[0] && c.to[1] <= s[1];
    });
    const awayOk = moved.every((c) => {
      if (c.hrs >= 40) return true;
      const t = snap.techs.find((x) => x.name === c.res);
      return t && !techAway(t, abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1]));
    });
    const clash = (key) => moved.some((c) => c[key] && snap.cards.some((o) => o.id !== c.id && o[key] === c[key] && overlaps(abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1]), abs(o.from[0], o.from[1]), abs(o.to[0], o.to[1]))));
    const holdClash = moved.some((c) => snap.holds.some((h) => h.bay && h.bay === c.bay && overlaps(abs(c.from[0], c.from[1]), abs(c.to[0], c.to[1]), abs(h.from[0], h.from[1]), abs(h.to[0], h.to[1]))));
    const skillOk = moved.every((c) => !isApprentice(c.res) || !needsSeniorTech(c));
    return [
      { label: 'Inside technician shifts', pass: shiftOk },
      { label: 'Nobody booked while away', pass: awayOk },
      { label: 'No technician double-booked', pass: !clash('res') },
      { label: 'No bay double-booked', pass: !clash('bay') && !holdClash },
      { label: 'Apprentices on routine work only', pass: skillOk },
    ];
  }

  /* ---------- building a plan ---------- */

  const ITEMS = {
    holds: { group: 'bays', doing: 'Moving parked vehicles to the holding yard' },
    long: { group: 'bays', doing: 'Moving the long job to the long-stay bay' },
    reassign: { group: 'techs', doing: 'Reassigning jobs from technicians who are away' },
    book: { group: 'techs', doing: 'Booking unallocated jobs onto free technicians' },
  };

  function build(selected, focus) {
    const snap = window.Workshop.snapshot();
    const rate = AS.value('elr', AS.summary({ from: AS.END - 89, to: AS.END, branch: 0 })) || 0;
    const on = (id) => selected.has(id);

    // Order matters: clearing bays first gives the bookings more room.
    const holds = on('holds') ? planHolds(snap) : previewOf(planHolds, snap);
    const long = on('long') ? planLongJob(snap) : previewOf(planLongJob, snap);
    const reassign = on('reassign') ? planReassign(snap) : previewOf(planReassign, snap);
    const book = on('book') ? planBooking(snap) : previewOf(planBooking, snap);
    const rowHead = ['What', 'From', 'To', 'Why'];

    const items = [
      {
        id: 'holds', title: `Clear ${holds.changes.length} parked vehicles off ramps`,
        why: 'These vehicles sit on Ramps 4 and 5 with nobody working on them. They can wait in the holding yard. Your workshop controller moves them.',
        gain: `${Math.round(holds.freed)} ramp hours freed`, changes: holds.changes, rows: holds.rows,
        logText: `${holds.changes.length} parked vehicles moved to the holding yard`,
      },
      {
        id: 'long', title: 'Move the 110-hour Mercedes to the long-stay bay',
        why: "A job this long doesn't need a full ramp for 12 days, and the long-stay bay is free.",
        gain: `${Math.round(long.freed)} ramp hours freed`, changes: long.changes, rows: long.rows,
        logText: 'Long job moved to the long-stay bay',
      },
      {
        id: 'reassign', title: `Reassign ${reassign.changes.length} jobs from technicians who are away`,
        why: "Both jobs are booked on technicians who are on holiday today, so they won't get done as planned.",
        gain: `${reassign.hours.toFixed(1)} h, ${gbp(reassign.hours * rate)}`, changes: reassign.changes, rows: reassign.rows,
        logText: `${reassign.changes.length} jobs reassigned to technicians who are in`,
      },
      {
        id: 'book', title: `Book ${book.changes.length} unallocated jobs onto free technicians`,
        why: 'These jobs have no technician or bay yet, while technicians have free time on the same days.',
        gain: `${book.hours.toFixed(1)} h, ${gbp(book.hours * rate)}`, changes: book.changes, rows: book.rows,
        logText: `${book.changes.length} jobs booked with a technician and bay`,
      },
    ].map((x) => Object.assign(x, ITEMS[x.id], { on: on(x.id), rowHead }));

    const live = items.filter((i) => i.on);
    const changes = live.flatMap((i) => i.changes);
    const hours = (on('reassign') ? reassign.hours : 0) + (on('book') ? book.hours : 0);
    const freed = (on('holds') ? holds.freed : 0) + (on('long') ? long.freed : 0);
    const unplaced = [...(on('reassign') ? reassign.unplaced : []), ...(on('book') ? book.unplaced : [])];

    const stats = [
      { label: 'Changes', value: String(changes.length) },
      { label: 'Job hours', value: `${hours.toFixed(1)} h` },
      { label: 'Ramp hours', value: `${Math.round(freed)} h` },
    ];
    const plan = {
      focus, items, changes, stats, hours, freed, rate, unplaced, selected,
      value: hours * rate,
      summary: changes.length
        ? `I can make ${changes.length} changes to the diary${hours ? `, placing ${hours.toFixed(1)} job hours worth about ${gbp(hours * rate)} in labour` : ''}${freed ? `${hours ? ' and' : ','} freeing ${Math.round(freed)} ramp hours` : ''}.`
        : selected.size ? "There's nothing left in the diary for me to change." : 'Tick at least one improvement to build a plan.',
      doneText: `${hours ? `${hours.toFixed(1)} job hours are now placed. ` : ''}${freed ? `${Math.round(freed)} ramp hours are freed. ` : ''}New and moved cards are highlighted.`,
    };
    plan.checks = validate(snap, plan);
    return plan;
  }

  /** Works out what an unticked item would do, without keeping its effect on the plan. */
  function previewOf(fn, snap) {
    const copy = Object.assign({}, snap, {
      cards: JSON.parse(JSON.stringify(snap.cards)), jobs: snap.jobs, holds: JSON.parse(JSON.stringify(snap.holds)),
    });
    return fn(copy);
  }

  function create(focus) {
    const ids = Object.keys(ITEMS).filter((id) => focus === 'all' || ITEMS[id].group === focus);
    return build(new Set(ids), focus);
  }

  /* ---------- people decisions ---------- */

  function advisory() {
    const f = { from: AS.END - 89, to: AS.END };
    const l = AS.leakage(f);
    const notes = [];
    const fmtH = (h) => `${Math.round(h)} hours`;
    l.rows.slice().filter((r) => !AS.APPRENTICES.has(r.name)).sort((a, b) => b.eff - a.eff).slice(0, 2).forEach((r) => {
      notes.push({
        title: `Talk to ${r.name} (${AS.BRANCHES[r.branch]})`,
        text: `${fmtH(r.eff)} clocked but not sold in the last 90 days. Check whether it's job mix, training or time-recording before changing anything.`,
      });
    });
    const b2 = l.bays.filter((b) => b.branch === 1).reduce((a, b) => a + b.lost, 0);
    if (b2 > 0) notes.push({ title: 'Branch 2 bays', text: `About ${gbp(b2)} lost to blocked bays in the last 90 days. Its diary isn't in this demo, so I can't plan the moves. Someone needs to review parts holds there.` });
    return notes;
  }

  /* ---------- screen ---------- */

  function itemHtml(i) {
    const rows = i.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('');
    const empty = !i.changes.length;
    return `<section class="w plan-i${i.on ? '' : ' off'}">
      <label class="plan-ih"><input class="check" type="checkbox" data-pi="${i.id}" ${i.on ? 'checked' : ''}><div><b>${esc(empty ? `${i.doing}: nothing left to do` : i.title)}</b><span>${esc(i.why)}</span></div><span class="plan-gain">${esc(empty ? '' : i.gain)}</span></label>
      ${empty ? '' : `<details><summary>${i.changes.length === 1 ? 'See the change' : `See all ${i.changes.length} changes`}</summary><div class="tw"><table class="dt"><thead><tr>${i.rowHead.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details>`}
    </section>`;
  }

  function render(mount, plan) {
    const group = (key) => plan.items.filter((i) => i.group === key).map(itemHtml).join('');
    const allPass = plan.checks.every((c) => c.pass);
    const notes = advisory().map((n) => `<div class="plan-note">${ic('info', 'sm')}<div><b>${esc(n.title)}</b><span>${esc(n.text)}</span></div></div>`).join('');
    const blocked = plan.unplaced.length ? `<div class="plan-note">${ic('alert', 'sm')}<div><b>${plan.unplaced.length} jobs I couldn't place</b><span>${esc(plan.unplaced.join(', '))}. No free technician and bay on the due date, so these need a person.</span></div></div>` : '';
    mount.innerHTML = `<div class="dash" id="dash">
      <div class="d-top"><div><h1>Improvement plan</h1><p class="d-q">${ic('spark', 'sm')}<span>Branch 1 main diary, next 14 days. Untick anything you don't want.</span></p></div><span class="sp"></span><button class="btn s ghost" data-a="go-dash">${ic('back', 'sm')} Back</button></div>
      <div class="plan-sum">${plan.stats.map((x) => `<div class="kpi"><div class="kpi-l">${esc(x.label)}</div><div class="kpi-n">${esc(x.value)}</div></div>`).join('')}<div class="kpi"><div class="kpi-l">Labour in those hours</div><div class="kpi-n">${esc(gbp(plan.value))}</div></div></div>
      <h2 class="plan-g">Workbays</h2>${group('bays')}
      <h2 class="plan-g">Technician optimisation</h2>${group('techs')}
      ${blocked}
      <div class="plan-checks" aria-label="Plan checks">${plan.checks.map((c) => `<span class="${c.pass ? 'pass' : 'fail'}">${ic(c.pass ? 'check' : 'alert', 'sm')}${esc(c.label)}</span>`).join('')}</div>
      <h2 class="plan-g">For you to decide</h2>${notes}
      <footer class="prov">${ic('info', 'sm')}<span>Labour value uses the Branch 1 effective rate of ${esc(AS.format('elr', plan.rate))} an hour. It's an estimate of the work placed, not guaranteed extra sales. Sample data.</span></footer>
      <div class="plan-bar"><span class="sm">${esc(plan.summary)}</span><span class="sp"></span><button class="btn s" data-a="plan-preview" ${plan.changes.length ? '' : 'disabled'}>Preview on planner</button><button class="btn s p" data-a="plan-apply" ${plan.changes.length && allPass ? '' : 'disabled'}>Apply ${plan.changes.length} changes</button></div>
    </div>`;
  }

  function toggle(mount, plan, id, checked) {
    const selected = new Set(plan.selected);
    if (checked) selected.add(id); else selected.delete(id);
    const next = build(selected, plan.focus);
    window.Copilot.planChanged(next);
    const top = mount.querySelector('#dash').scrollTop;
    render(mount, next);
    mount.querySelector('#dash').scrollTop = top;
  }

  // Shared with Matching, so new appointments obey the same diary rules as plans.
  const rules = { abs, overlaps, hhmm, when, ceilQuarter, dowOf, techBusy, techAway, bayBusy, baysFor, isApprentice, needsSeniorTech, dayLoad, validate };

  return { create, render, toggle, rules };
})();
