/*
 * Sample aftersales dataset and metric engine.
 *
 * Every number the copilot shows is calculated here from generated job cards and
 * technician attendance, never written by hand. The generator is seeded, so the
 * demo gives the same figures on every run. All records are invented.
 *
 * To use real data, replace generate() with a loader that returns the same
 * { jobs, attendance } shape. Nothing downstream needs to change.
 */
window.AS = (function () {
  'use strict';

  const DAY_MS = 864e5;
  const toN = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY_MS);
  const toIso = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  const dateOf = (n) => new Date(n * DAY_MS);

  // The demo clock is fixed to the moment of the reference screenshot.
  const TODAY = toN('2026-11-04');
  const END = TODAY - 1; // Job cards close overnight, so data runs to yesterday.
  const START = toN('2025-01-01');

  const BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];
  const TYPES = ['Service', 'MOT', 'Repair', 'Warranty', 'Tyres', 'Internal'];
  const MAKES = ['BMW', 'Mercedes-Benz', 'Jaguar', 'Audi', 'Volkswagen', 'Ford'];

  const TECHS = [
    // Branch 1 names match the technician planner.
    ['Ana Ceban', 0, 1.1, 0.84], ['Ant Tech', 0, 1.06, 0.82], ['Ash Meehan Tech', 0, 1.12, 0.88],
    ['Callum Tech Birch', 0, 1.03, 0.8], ['Daniel Smith', 0, 1.08, 0.83], ['Esme Apprentice', 0, 0.82, 0.74],
    ['Febin Tech 1', 0, 1.09, 0.86], ['Febin Tech 2', 0, 1.01, 0.79], ['Lewis Durkin', 0, 1.14, 0.87],
    ['Mark Tech Bacalla', 0, 1.05, 0.84],
    ['Priya Nair', 1, 1.1, 0.84], ['Tom Hadley', 1, 1.04, 0.8], ['Kasia Nowak', 1, 1.07, 0.83],
    ['Ben Osei', 1, 1.02, 0.81], ['Liam Foster', 1, 1.08, 0.82], ['Ruth Adeyemi', 1, 0.84, 0.72],
    ['Owen Clarke', 2, 1.09, 0.86], ['Sam Whitfield', 2, 1.05, 0.84], ['Nadia Rahman', 2, 1.11, 0.85],
    ['Joe Marsh', 2, 1.03, 0.8], ['Chloe Bennett', 2, 1.06, 0.83],
  ].map(([name, branch, eff, util]) => ({ name, branch, eff, util }));

  const APPRENTICES = new Set(['Esme Apprentice', 'Ruth Adeyemi']);
  const RAMPS = (n) => Array.from({ length: n }, (_, i) => `Ramp ${i + 1}`);
  const BAYS = [
    [...RAMPS(7), 'MOT lane', 'Tyre bay', 'Long-stay bay'],
    [...RAMPS(5), 'MOT lane', 'Tyre bay'],
    [...RAMPS(5), 'MOT lane', 'Tyre bay'],
  ];
  // Each technician works from a home bay, in listed order within the branch.
  const homeCount = [0, 0, 0];
  TECHS.forEach((t) => { t.bay = homeCount[t.branch]++; });

  const IDLE_ALLOWANCE = { target: 0.8, bayShuffle: 0.05 };

  const ADVISORS = [
    ['Sarah Whitlock', 0, 0.4], ['Imran Sheikh', 0, 0.37],
    ['Gemma Rowe', 1, 0.36], ['Paul Dempsey', 1, 0.34],
    ['Holly Marsden', 2, 0.38], ['Dev Patel', 2, 0.39],
  ].map(([name, branch, conv]) => ({ name, branch, conv }));

  const TYPE_SPEC = {
    //           weight clocked soldFactor rate  parts  partsMargin vhc
    Service:  { w: 34, hrs: 2.1, sf: 1.12, rate: 146, parts: 105, pm: 0.34, vhc: 0.7 },
    MOT:      { w: 15, hrs: 0.8, sf: 1.22, rate: 118, parts: 9,   pm: 0.3,  vhc: 0.55 },
    Repair:   { w: 26, hrs: 3.4, sf: 1.0,  rate: 138, parts: 265, pm: 0.31, vhc: 0.45 },
    Warranty: { w: 10, hrs: 2.8, sf: 0.84, rate: 104, parts: 210, pm: 0.14, vhc: 0 },
    Tyres:    { w: 9,  hrs: 0.9, sf: 1.14, rate: 108, parts: 232, pm: 0.24, vhc: 0 },
    Internal: { w: 6,  hrs: 1.7, sf: 0.92, rate: 74,  parts: 58,  pm: 0.18, vhc: 0 },
  };

  const LABOUR_COST_PER_HR = 26;
  const STORY = {
    b2Slide: toN('2026-08-03'), // Branch 2 efficiency slips, led by two technicians.
    b2Quality: toN('2026-09-01'), // Branch 2 comebacks rise and CSI dips.
    b3Vhc: toN('2026-09-01'), // One Branch 3 advisor stops converting health checks.
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate() {
    const rnd = mulberry32(20261104);
    const rndBay = mulberry32(4112026); // Separate stream, so bay data can't shift the other figures.
    const jitter = (spread) => 1 + (rnd() - 0.5) * 2 * spread;
    const pick = (weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rnd() * total;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
      return weights.length - 1;
    };
    const makeWeights = [24, 22, 12, 16, 14, 12];
    const jobs = [];
    const attendance = [];
    let ref = 90000;

    for (let d = START; d <= END; d++) {
      const dt = dateOf(d);
      const dow = dt.getUTCDay();
      if (dow === 0) continue; // Closed on Sundays.
      const month = dt.getUTCMonth();
      const years = (d - START) / 365;
      const season = 1 + 0.04 * Math.cos(((month - 3) / 12) * 2 * Math.PI);

      for (let ti = 0; ti < TECHS.length; ti++) {
        const tech = TECHS[ti];
        if (rnd() < 0.065) continue; // Holiday, sickness or training.
        if (dow === 6 && rnd() > 0.28) continue; // Saturday rota.
        const attended = dow === 6 ? 4 : 8.5;
        const rec = { d, tech: ti, branch: tech.branch, hrs: attended, idle: 0, bayWait: 0 };
        attendance.push(rec);
        let clockedToday = 0;

        let effAdj = 1;
        if (tech.branch === 1 && d >= STORY.b2Slide) {
          const ramp = Math.min(1, (d - STORY.b2Slide) / 45);
          const hit = tech.name === 'Tom Hadley' ? 0.26 : tech.name === 'Ben Osei' ? 0.2 : 0.04;
          effAdj = 1 - hit * ramp;
        }
        let remaining = attended * tech.util * season * jitter(0.1);
        while (remaining > 0.25) {
          const weights = TYPES.map((t) => {
            let w = TYPE_SPEC[t].w;
            if (t === 'Tyres') w *= 1 + 0.55 * years;
            if (t === 'Warranty' && tech.branch === 1 && d >= STORY.b2Slide) w *= 1.7;
            return w;
          });
          const type = TYPES[pick(weights)];
          const spec = TYPE_SPEC[type];
          const clocked = Math.min(remaining, spec.hrs * jitter(0.45));
          remaining -= clocked;
          clockedToday += clocked;
          const sold = clocked * tech.eff * spec.sf * effAdj * jitter(0.1);
          const rate = spec.rate * [1.03, 0.97, 1][tech.branch] * (1 + 0.045 * years);
          const labour = sold * rate;
          const parts = spec.parts * jitter(0.65) * (1 + 0.03 * years);

          const branchAdvisors = ADVISORS.map((a, i) => [a, i]).filter(([a]) => a.branch === tech.branch);
          const [advisor, advisorIdx] = branchAdvisors[Math.floor(rnd() * branchAdvisors.length)];
          let vhcIdent = 0;
          let vhcSold = 0;
          if (rnd() < spec.vhc) {
            vhcIdent = 60 + rnd() * 460;
            let conv = advisor.conv;
            if (advisor.name === 'Dev Patel' && d >= STORY.b3Vhc) conv = 0.14;
            vhcSold = vhcIdent * Math.max(0, Math.min(1, conv * jitter(0.45)));
          }

          const quality = tech.branch === 1 && d >= STORY.b2Quality;
          const comeback = rnd() < (type === 'Repair' ? 0.03 : 0.012) * (quality ? 2.7 : 1);
          const surveyed = rnd() < 0.32;
          const csi = surveyed
            ? Math.min(100, Math.max(40, 92.5 + [1, 0, -1][tech.branch] - (quality ? 6 : 0) - (comeback ? 16 : 0) + (rnd() - 0.5) * 14))
            : null;

          jobs.push({
            ref: ref++, d, tech: ti, branch: tech.branch, advisor: advisorIdx,
            type: TYPES.indexOf(type), make: pick(makeWeights),
            clocked, sold, labour, parts,
            gp: labour - clocked * LABOUR_COST_PER_HR + parts * spec.pm,
            vhcIdent, vhcSold, csi, comeback,
            lead: 2 + rnd() * 5 + (tech.branch === 1 && d >= STORY.b2Slide ? 1.8 : 0),
          });
        }
        // Why this technician wasn't on a job. Ramps 4 and 5 at Branch 1 keep getting
        // blocked by parked vehicles, and Branch 2 bays clog up during its slide.
        rec.idle = Math.max(0, attended - clockedToday);
        let share = 0.25;
        if (tech.branch === 0 && (tech.bay === 3 || tech.bay === 4)) share = 0.78;
        if (tech.branch === 1 && d >= STORY.b2Slide) share = 0.55;
        rec.bayWait = rec.idle * Math.min(1, share * (0.8 + rndBay() * 0.4));
      }
    }
    return { jobs, attendance };
  }

  const DATA = generate();

  /* ------------------------------ metrics ------------------------------ */

  const one = () => 1;
  const METRICS = {
    sales: { label: 'Aftersales sales', short: 'Sales', kind: 'gbp', up: true, num: (s) => s.labour + s.parts, den: one, def: 'Labour plus parts sales, excluding VAT.' },
    labour: { label: 'Labour sales', short: 'Labour', kind: 'gbp', up: true, num: (s) => s.labour, den: one, def: 'Sold hours multiplied by the charged rate.' },
    parts: { label: 'Parts sales', short: 'Parts', kind: 'gbp', up: true, num: (s) => s.parts, den: one, def: 'Parts sold through the workshop.' },
    gp: { label: 'Gross profit', short: 'Gross profit', kind: 'gbp', up: true, num: (s) => s.gp, den: one, def: 'Labour less technician cost, plus parts margin.' },
    soldHrs: { label: 'Hours sold', short: 'Hours sold', kind: 'hrs', up: true, num: (s) => s.sold, den: one, def: 'Hours charged to customers, warranty and internal accounts.' },
    clockedHrs: { label: 'Hours clocked', short: 'Hours clocked', kind: 'hrs', up: true, num: (s) => s.clocked, den: one, def: 'Hours technicians were clocked on to jobs.' },
    efficiency: { label: 'Efficiency', short: 'Efficiency', kind: 'pct', up: true, target: 1, num: (s) => s.sold, den: (s) => s.clocked, def: 'Hours sold divided by hours clocked on to jobs.' },
    utilisation: { label: 'Utilisation', short: 'Utilisation', kind: 'pct', up: true, target: 0.8, att: true, num: (s) => s.clocked, den: (s) => s.attended, def: 'Hours clocked on to jobs divided by hours attended.' },
    productivity: { label: 'Productivity', short: 'Productivity', kind: 'pct', up: true, target: 0.85, att: true, num: (s) => s.sold, den: (s) => s.attended, def: 'Hours sold divided by hours attended.' },
    elr: { label: 'Effective labour rate', short: 'Labour rate', kind: 'gbpr', up: true, num: (s) => s.labour, den: (s) => s.sold, def: 'Labour sales divided by hours sold.' },
    vhcConv: { label: 'VHC conversion', short: 'VHC conversion', kind: 'pct', up: true, target: 0.35, num: (s) => s.vhcSold, den: (s) => s.vhcIdent, def: 'Value of health check work sold divided by value identified.' },
    vhcIdent: { label: 'VHC work identified', short: 'VHC identified', kind: 'gbp', up: true, num: (s) => s.vhcIdent, den: one, def: 'Value of work found on vehicle health checks.' },
    vhcSold: { label: 'VHC work sold', short: 'VHC sold', kind: 'gbp', up: true, num: (s) => s.vhcSold, den: one, def: 'Value of health check work the customer agreed to.' },
    csi: { label: 'Customer satisfaction', short: 'CSI', kind: 'score', up: true, target: 90, num: (s) => s.csiSum, den: (s) => s.csiN, def: 'Average post-visit survey score out of 100.' },
    comeback: { label: 'Comeback rate', short: 'Comebacks', kind: 'pct1', up: false, target: 0.02, num: (s) => s.comebacks, den: (s) => s.jobs, def: 'Share of jobs where the vehicle returned for the same fault.' },
    aov: { label: 'Average invoice', short: 'Avg invoice', kind: 'gbp', up: true, num: (s) => s.labour + s.parts, den: (s) => s.jobs, def: 'Sales divided by job cards.' },
    jobs: { label: 'Job cards', short: 'Job cards', kind: 'int', up: true, num: (s) => s.jobs, den: one, def: 'Job cards closed in the period.' },
    leadDays: { label: 'Booking lead time', short: 'Lead time', kind: 'days', up: false, target: 5, num: (s) => s.leadSum, den: (s) => s.jobs, def: 'Average days between booking and arrival.' },
  };

  function value(key, s) {
    const m = METRICS[key];
    const den = m.den(s);
    return den ? m.num(s) / den : null;
  }

  /** Whether up is good and the delta is in points rather than percent. */
  function format(key, v, opts) {
    if (v == null || Number.isNaN(v)) return '–';
    const full = opts && opts.full;
    switch (METRICS[key].kind) {
      case 'gbp': {
        if (!full && Math.abs(v) >= 1e6) return '£' + (v / 1e6).toFixed(2) + 'm';
        if (!full && Math.abs(v) >= 1e4) return '£' + Math.round(v / 1e3) + 'k';
        return '£' + Math.round(v).toLocaleString('en-GB');
      }
      case 'gbpr': return '£' + v.toFixed(2);
      case 'hrs': return Math.round(v).toLocaleString('en-GB') + ' h';
      case 'pct': return Math.round(v * 100) + '%';
      case 'pct1': return (v * 100).toFixed(1) + '%';
      case 'score': return v.toFixed(1);
      case 'days': return v.toFixed(1) + ' days';
      default: return Math.round(v).toLocaleString('en-GB');
    }
  }

  /** Estimates read better rounded: "about £5,900", not "about £5,909". */
  const approx = (v) => '£' + (Math.round(v / 100) * 100).toLocaleString('en-GB');

  const isRatioKind = (key) => ['pct', 'pct1', 'score'].includes(METRICS[key].kind);

  /** Change between two values, in points for ratios and percent otherwise. */
  function delta(key, cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    const m = METRICS[key];
    const pts = isRatioKind(key);
    const raw = pts ? (cur - prev) * (m.kind === 'score' ? 1 : 100) : ((cur - prev) / Math.abs(prev)) * 100;
    const decimals = m.kind === 'pct' ? 0 : 1;
    const rounded = Number(raw.toFixed(decimals));
    const unit = pts ? (Math.abs(rounded) === 1 ? ' pt' : ' pts') : '%';
    return {
      raw,
      text: (rounded > 0 ? '+' : rounded < 0 ? '−' : '') + Math.abs(rounded).toFixed(decimals) + unit,
      dir: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
      good: rounded === 0 ? null : rounded > 0 === m.up,
    };
  }

  /* ------------------------------ queries ------------------------------ */

  function emptySummary() {
    return { jobs: 0, labour: 0, parts: 0, gp: 0, sold: 0, clocked: 0, attended: 0, vhcIdent: 0, vhcSold: 0, csiSum: 0, csiN: 0, comebacks: 0, leadSum: 0 };
  }
  function addJob(s, j) {
    s.jobs++; s.labour += j.labour; s.parts += j.parts; s.gp += j.gp; s.sold += j.sold; s.clocked += j.clocked;
    s.vhcIdent += j.vhcIdent; s.vhcSold += j.vhcSold; s.leadSum += j.lead;
    if (j.csi != null) { s.csiSum += j.csi; s.csiN++; }
    if (j.comeback) s.comebacks++;
  }

  const DIM = {
    branch: { names: BRANCHES, key: 'branch', att: true },
    tech: { names: TECHS.map((t) => t.name), key: 'tech', att: true },
    type: { names: TYPES, key: 'type', att: false },
    make: { names: MAKES, key: 'make', att: false },
    advisor: { names: ADVISORS.map((a) => a.name), key: 'advisor', att: false },
  };

  /** True when filters leave technician attendance meaningful. */
  const attendanceValid = (f) => f.type == null && f.make == null && f.advisor == null;

  function matches(rec, f) {
    if (rec.d < f.from || rec.d > f.to) return false;
    if (f.branch != null && rec.branch !== f.branch) return false;
    if (f.tech != null && rec.tech !== f.tech) return false;
    if (f.type != null && rec.type !== f.type) return false;
    if (f.make != null && rec.make !== f.make) return false;
    if (f.advisor != null && rec.advisor !== f.advisor) return false;
    return true;
  }

  function summary(f) {
    const s = emptySummary();
    for (const j of DATA.jobs) if (matches(j, f)) addJob(s, j);
    if (attendanceValid(f)) for (const a of DATA.attendance) if (matches(a, f)) s.attended += a.hrs;
    return s;
  }

  /** One summary per member of a dimension; empty members are left out. */
  function group(f, dim) {
    const d = DIM[dim];
    const out = d.names.map((name, id) => ({ name, id, s: emptySummary() }));
    for (const j of DATA.jobs) if (matches(j, f)) addJob(out[j[d.key]].s, j);
    if (d.att && attendanceValid(f)) {
      for (const a of DATA.attendance) if (matches(a, f)) out[a[d.key]].s.attended += a.hrs;
    }
    return out.filter((g) => g.s.jobs > 0);
  }

  const fmtDay = (n) => {
    const d = dateOf(n);
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  };
  const fmtShort = (n) => dateOf(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtMonth = (n, withYear) => dateOf(n).toLocaleDateString('en-GB', withYear ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' });

  /**
   * Splits a range into equal buckets so that totals are comparable: whole weeks
   * counted back from the end date, or whole calendar months. A part week or part
   * month at the edge of the range is dropped rather than shown as a false dip.
   */
  function buckets(range, grain) {
    const len = range.to - range.from + 1;
    const g = grain || (len <= 21 ? 'day' : len <= 190 ? 'week' : 'month');
    const out = [];
    if (g === 'day') {
      for (let d = range.from; d <= range.to; d++) {
        if (dateOf(d).getUTCDay() === 0) continue;
        out.push({ from: d, to: d, label: fmtShort(d) });
      }
    } else if (g === 'week') {
      for (let e = range.to; e - 6 >= range.from; e -= 7) out.unshift({ from: e - 6, to: e, label: fmtShort(e) });
    } else {
      const start = dateOf(range.from);
      let y = start.getUTCFullYear();
      let m = start.getUTCMonth();
      if (start.getUTCDate() !== 1) m++;
      const spansYears = dateOf(range.from).getUTCFullYear() !== dateOf(range.to).getUTCFullYear();
      for (;;) {
        const a = Math.round(Date.UTC(y, m, 1) / DAY_MS);
        const b = Math.round(Date.UTC(y, m + 1, 0) / DAY_MS);
        if (b > range.to) break;
        out.push({ from: a, to: b, label: fmtMonth(a, spansYears) });
        m++;
      }
    }
    out.grain = g;
    return out;
  }

  /** A metric across buckets, overall or split by one dimension. */
  function series(f, key, bks, by) {
    const groups = by ? DIM[by].names : ['All'];
    const out = groups.map((name) => ({ name, values: bks.map(() => emptySummary()), any: false }));
    const lookup = new Map();
    bks.forEach((b, i) => { for (let d = b.from; d <= b.to; d++) lookup.set(d, i); });
    const base = Object.assign({}, f, { from: bks[0].from, to: bks[bks.length - 1].to });
    const idx = (r) => (by ? r[DIM[by].key] : 0);
    for (const j of DATA.jobs) {
      if (!matches(j, base)) continue;
      const i = lookup.get(j.d);
      if (i == null) continue;
      addJob(out[idx(j)].values[i], j);
      out[idx(j)].any = true;
    }
    if (attendanceValid(f) && (!by || DIM[by].att)) {
      for (const a of DATA.attendance) {
        if (!matches(a, base)) continue;
        const i = lookup.get(a.d);
        if (i != null) out[idx(a)].values[i].attended += a.hrs;
      }
    }
    return out.filter((o) => o.any).map((o) => ({ name: o.name, values: o.values.map((s) => value(key, s)) }));
  }

  /**
   * Splits a metric's change into each member's contribution. The contributions
   * add up exactly to the overall change.
   *
   * Ratios are measured against the earlier overall average, so a low-efficiency
   * job type that grows its share counts against the result rather than for it:
   *   share_now * (value_now - avg_before) - share_before * (value_before - avg_before)
   */
  function drivers(f, prev, key, dim) {
    const m = METRICS[key];
    const curTotal = summary(f);
    const prevTotal = summary(prev);
    const curDen = m.den(curTotal);
    const prevDen = m.den(prevTotal);
    if (!curDen || !prevDen) return [];
    const prevAvg = m.num(prevTotal) / prevDen;
    const prevById = new Map(group(prev, dim).map((g) => [g.id, g]));
    const scale = isRatioKind(key) ? (m.kind === 'score' ? 1 : 100) : 1;
    return group(f, dim).map((g) => {
      const p = prevById.get(g.id);
      let contribution;
      if (m.den === one) {
        contribution = m.num(g.s) - (p ? m.num(p.s) : 0);
      } else {
        const shareNow = m.den(g.s) / curDen;
        const sharePrev = p ? m.den(p.s) / prevDen : 0;
        const now = m.den(g.s) ? m.num(g.s) / m.den(g.s) : prevAvg;
        const before = p && m.den(p.s) ? m.num(p.s) / m.den(p.s) : prevAvg;
        contribution = (shareNow * (now - prevAvg) - sharePrev * (before - prevAvg)) * scale;
      }
      return { name: g.name, contribution, cur: value(key, g.s), prev: p ? value(key, p.s) : null };
    }).sort((a, b) => a.contribution - b.contribution);
  }

  function prevRange(range, mode) {
    const len = range.to - range.from + 1;
    const r = mode === 'year'
      ? { from: range.from - 364, to: range.to - 364 }
      : { from: range.from - len, to: range.from - 1 };
    return r.from < START ? null : r;
  }

  /**
   * Money left on the table. Each lost hour is counted once, under one cause:
   *   workbays    bay-blocked time beyond a normal allowance for moving vehicles
   *   no job      remaining shortfall against the utilisation target
   *   efficiency  clocked hours that were not sold (apprentices are excluded)
   * Hours are valued at each technician's own effective labour rate.
   */
  function leakage(f) {
    const techs = TECHS.map((t, id) => ({ id, name: t.name, branch: t.branch, attended: 0, bayWait: 0, clocked: 0, sold: 0, labour: 0 }));
    const bays = new Map();
    const bayKey = (t) => `${t.branch}|${t.bay}`;
    for (const a of DATA.attendance) {
      if (!matches(a, f)) continue;
      techs[a.tech].attended += a.hrs;
      techs[a.tech].bayWait += a.bayWait;
    }
    for (const j of DATA.jobs) {
      if (!matches(j, f)) continue;
      const t = techs[j.tech];
      t.clocked += j.clocked; t.sold += j.sold; t.labour += j.labour;
    }
    let openHours = 0;
    for (let d = f.from; d <= f.to; d++) {
      const dow = dateOf(d).getUTCDay();
      if (dow !== 0) openHours += dow === 6 ? 4 : 9.5;
    }
    let bayHrs = 0; let bayGbp = 0; let noJobHrs = 0; let noJobGbp = 0; let effHrs = 0; let effGbp = 0;
    const rows = techs.filter((t) => t.attended > 0).map((t) => {
      const rate = t.sold ? t.labour / t.sold : 0;
      const blocked = Math.max(0, t.bayWait - IDLE_ALLOWANCE.bayShuffle * t.attended);
      const noJob = Math.max(0, IDLE_ALLOWANCE.target * t.attended - t.clocked - blocked);
      const eff = APPRENTICES.has(t.name) ? 0 : Math.max(0, t.clocked - t.sold);
      bayHrs += blocked; bayGbp += blocked * rate;
      noJobHrs += noJob; noJobGbp += noJob * rate;
      effHrs += eff; effGbp += eff * rate;
      const home = TECHS[t.id];
      const key = bayKey(home);
      if (!bays.has(key)) bays.set(key, { branch: t.branch, name: BAYS[t.branch][home.bay], open: openHours, working: 0, blocked: 0, lost: 0 });
      const b = bays.get(key);
      b.working += t.clocked; b.blocked += t.bayWait; b.lost += blocked * rate;
      return { name: t.name, branch: t.branch, blocked, noJob, eff, bayGbp: blocked * rate, techGbp: (noJob + eff) * rate };
    });
    // Bays with no home technician still cost money to run, so they appear as empty.
    if (f.tech == null) {
      BAYS.forEach((names, branch) => {
        if (f.branch != null && f.branch !== branch) return;
        names.forEach((name, i) => {
          if (!bays.has(`${branch}|${i}`)) bays.set(`${branch}|${i}`, { branch, name, open: openHours, working: 0, blocked: 0, lost: 0 });
        });
      });
    }
    const weeks = (f.to - f.from + 1) / 7;
    const techGbp = noJobGbp + effGbp;
    return {
      weeks, rows,
      bays: [...bays.values()].map((b) => Object.assign(b, { label: `${BRANCHES[b.branch]} · ${b.name}`, empty: Math.max(0, b.open - b.working - b.blocked) })),
      bay: { hrs: bayHrs, gbp: bayGbp, perWeek: bayGbp / weeks },
      tech: { noJobHrs, noJobGbp, effHrs, effGbp, hrs: noJobHrs + effHrs, gbp: techGbp, perWeek: techGbp / weeks },
      total: bayGbp + techGbp,
      perWeek: (bayGbp + techGbp) / weeks,
    };
  }

  const rangeText = (r) => `${fmtDay(r.from)} to ${fmtDay(r.to)}`;

  return {
    TODAY, END, START, BRANCHES, TYPES, MAKES, TECHS, ADVISORS, METRICS, DIM,
    toN, toIso, dateOf, fmtDay, fmtShort, rangeText,
    value, format, delta, summary, group, buckets, series, drivers, prevRange, attendanceValid, leakage, APPRENTICES, approx,
    size: { jobs: DATA.jobs.length, attendance: DATA.attendance.length },
  };
})();
