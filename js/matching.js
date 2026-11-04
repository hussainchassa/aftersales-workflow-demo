/*
 * Suggests a technician and time for a new appointment, from each technician's
 * job history. The history is invented sample data with its own seed, so it can't
 * shift any dashboard figure. Diary rules come from Optimiser, so a suggestion
 * obeys the same shift, absence, clash, bay and apprentice checks as a plan.
 *
 * Choosing: everyone within MARGIN of the best available score counts as a fit,
 * and the least busy fit wins. That spreads work instead of loading up the best.
 */
window.Matching = (function () {
  'use strict';

  const AS = window.AS;
  const R = window.Optimiser.rules;

  // needsSeniorTech treats Brakes, Major service and Diagnostics as senior work
  // (over 2 hours, or diagnostics), so apprentices only get Tyres and Diesel.
  const TYPES = [
    { id: 'Brakes', noun: 'brake', std: 2.2, kind: 'ramp', desc: 'Brake pads and discs' },
    { id: 'Tyres', noun: 'tyre', std: 1.5, kind: 'tyre', desc: 'Tyres and alignment' },
    { id: 'Major service', noun: 'major service', std: 2.6, kind: 'ramp', desc: 'Major service' },
    { id: 'Diesel', noun: 'diesel', std: 2.0, kind: 'ramp', desc: 'Diesel: DPF and injector work' },
    { id: 'Diagnostics', noun: 'diagnostics', std: 1.2, kind: 'ramp', desc: 'Diagnostics' },
  ];
  const typeOf = (id) => TYPES.find((t) => t.id === id);

  const MARGIN = 6; // Score points behind the best available that still count as a fit.
  const NEW_MARGIN = 12; // Wider for limited history, which is already pulled towards the team average.
  const LIMITED = 8; // Fewer jobs than this is limited history.
  const SHRINK = 5; // Limited history leans towards the team average, as if it had this many average jobs.
  const COMEBACK_DAYS = 30;
  const HISTORY_END = AS.toN('2026-11-03');
  const HISTORY_DAYS = 365;

  /* ---------- sample history ---------- */

  // [jobs, speed (clocked ÷ standard), comebacks]. Shaped for the five demo scenarios:
  // Brakes, one clear best. Diesel, the best is away until Friday. Diagnostics, fast
  // but more comebacks vs slower and clean. Major service, four equals. Tyres, a
  // newer technician with a strong one to back them up.
  const PROFILES = {
    Brakes: {
      'Mark Tech Bacalla': [46, 0.86, 0], 'Lewis Durkin': [30, 1.14, 3], 'Hugin Technician': [24, 1.16, 2],
      'Ana Ceban': [19, 1.12, 2], 'John TECH Celeste': [17, 1.22, 1],
    },
    Diesel: {
      'Callum Tech Birch': [40, 0.88, 0], 'Krzysztof Dyner': [28, 0.99, 1], 'idrees sulaiman': [22, 1.18, 3],
      'Ash Meehan Tech': [26, 1.02, 1],
    },
    Diagnostics: {
      'Isobel Weaver': [38, 1.1, 0], 'Justin Smith': [21, 1.0, 1], 'Louis TWilbourne': [33, 0.8, 4],
      'Lewis Durkin': [12, 1.26, 2], 'Ana Ceban': [10, 1.3, 2],
    },
    'Major service': {
      'Ana Ceban': [35, 1.0, 1], 'Hugin Technician': [34, 1.01, 1], 'John TECH Celeste': [36, 0.99, 1],
      'Megan Livermore': [33, 1.0, 1], 'Daniel Smith': [14, 1.24, 2], 'Megan Megan Tech': [12, 1.28, 2],
    },
    Tyres: {
      'Lewis Durkin': [40, 0.92, 0], 'Megan Walker - Tech': [4, 0.96, 0], 'Mark Tech Bacalla': [15, 1.12, 1],
      'Ant Tech': [18, 1.2, 2], 'Esme Apprentice': [9, 1.3, 1],
    },
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
    const rnd = mulberry32(5112026);
    const L = 'ABCDEFGHJKLMNOPRSTUVWXY';
    const letter = () => L[Math.floor(rnd() * L.length)];
    const reg = () => `${letter()}${letter()}${String(15 + Math.floor(rnd() * 10)).padStart(2, '0')} ${letter()}${letter()}${letter()}`;
    const jobs = [];
    TYPES.forEach((type) => {
      Object.entries(PROFILES[type.id]).forEach(([tech, [n, speed, comebacks]]) => {
        // Spread jitter evenly around the target, so each technician's speed lands on it.
        const firsts = n - comebacks;
        for (let i = 0; i < firsts; i++) {
          const d = HISTORY_END - Math.floor(rnd() * (HISTORY_DAYS - COMEBACK_DAYS));
          const r = reg();
          const wobble = 1 + 0.12 * (((i * 7) % firsts) / Math.max(1, firsts - 1) - 0.5);
          jobs.push({ tech, type: type.id, d, reg: r, std: type.std, clocked: type.std * speed * wobble });
          if (i < comebacks) jobs.push({ tech, type: type.id, d: d + 3 + Math.floor(rnd() * 24), reg: r, std: type.std, clocked: type.std * speed });
        }
      });
    });
    return jobs.sort((a, b) => a.d - b.d);
  }

  const HISTORY = generate();

  /** Per technician for one job type: jobs, speed and comebacks, worked out from the history. */
  function rawStats(typeId) {
    const jobs = HISTORY.filter((j) => j.type === typeId);
    const by = {};
    jobs.forEach((j, i) => {
      const s = by[j.tech] || (by[j.tech] = { tech: j.tech, jobs: 0, std: 0, clocked: 0, comebacks: 0 });
      s.jobs++; s.std += j.std; s.clocked += j.clocked;
      const back = jobs.slice(i + 1).some((k) => k.reg === j.reg && k.d - j.d <= COMEBACK_DAYS);
      if (back) s.comebacks++;
    });
    return Object.values(by).map((s) => Object.assign(s, { speed: s.clocked / s.std, comebackRate: s.comebacks / s.jobs }));
  }

  /* ---------- scoring ---------- */

  /**
   * How good a technician is at one job type, from 0 to 100 (higher is better).
   * speed: hours clocked ÷ standard hours, so 0.8 is fast and 1.2 is slow.
   * comebackRate: share of their jobs that came back within 30 days (0.1 = 1 in 10).
   * Both are already leaned towards the team average when history is limited.
   */
  function score(speed, comebackRate) {
    // Each 0.1 slower than standard costs 4 points, and each 1 in 10 coming back costs 20,
    // so quality outweighs speed: a 10% comeback rate costs as much as being 0.5 slower.
    return 100 - 40 * (speed - 1) - 200 * comebackRate;
  }

  function stats(typeId) {
    const raw = rawStats(typeId);
    const total = raw.reduce((a, s) => ({ jobs: a.jobs + s.jobs, std: a.std + s.std, clocked: a.clocked + s.clocked, comebacks: a.comebacks + s.comebacks }), { jobs: 0, std: 0, clocked: 0, comebacks: 0 });
    const team = { speed: total.clocked / total.std, comebackRate: total.comebacks / total.jobs };
    return raw.map((s) => {
      const w = s.jobs / (s.jobs + SHRINK);
      const speed = w * s.speed + (1 - w) * team.speed;
      const comebackRate = w * s.comebackRate + (1 - w) * team.comebackRate;
      return Object.assign(s, { limited: s.jobs < LIMITED, score: score(speed, comebackRate) });
    }).sort((a, b) => b.score - a.score);
  }

  /* ---------- finding slots ---------- */

  const firstName = (name) => name.split(/\s+/)[0];
  const dayName = (date) => AS.dateOf(AS.toN(date)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const dayShort = (date) => AS.dateOf(AS.toN(date)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  function dayWord(date, snap) {
    const d = AS.toN(date) - AS.toN(snap.today);
    return d === 0 ? 'today' : d === 1 ? 'tomorrow' : dayName(date);
  }

  /** Start hours to try on a date for a time window, never before now. */
  function startRange(window, date, snap) {
    let r = window === 'morning' ? [8, 11.75] : window === 'afternoon' ? [12, 19] : typeof window === 'number' ? [window, window] : [7, 19];
    if (date === snap.today) r = [Math.max(r[0], R.ceilQuarter(snap.nowHour)), r[1]];
    return r;
  }

  /** The earliest slot in [h1, h2] that this technician can take, or null. */
  function firstSlot(snap, tech, type, date, h1, h2) {
    const dur = R.ceilQuarter(type.std);
    const shift = tech.shift(R.dowOf(date));
    if (!shift) return null;
    const job = { hrs: dur, l2: type.desc };
    if (R.isApprentice(tech.name) && R.needsSeniorTech(job)) return null;
    for (let s = Math.max(h1, shift[0]); s <= h2 && s + dur <= shift[1]; s += 0.25) {
      const a1 = R.abs(date, s);
      const a2 = R.abs(date, s + dur);
      if (R.techAway(tech, a1, a2) || R.techBusy(snap, tech.name, a1, a2)) continue;
      const bay = R.baysFor(type.kind, snap.bays).find((b) => !R.bayBusy(snap, b, a1, a2));
      if (bay) return { date, from: s, to: s + dur, bay };
    }
    return null;
  }

  const onShiftAllDay = (tech, date) => {
    const shift = tech.shift(R.dowOf(date));
    return shift && !R.techAway(tech, R.abs(date, shift[0]), R.abs(date, shift[1]));
  };
  const weekLoad = (snap, name, date) => Array.from({ length: 7 }, (_, i) => R.dayLoad(snap, name, AS.toIso(AS.toN(date) + i))).reduce((a, b) => a + b, 0);

  /** Technicians with history who can take the job in a window, ranked. */
  function candidates(snap, type, ranked, date, window) {
    const [h1, h2] = startRange(window, date, snap);
    if (h1 > h2) return [];
    const top = ranked.find((s) => !s.limited);
    const out = [];
    ranked.forEach((s) => {
      const tech = snap.techs.find((t) => t.name === s.tech);
      const slot = tech && firstSlot(snap, tech, type, date, h1, h2);
      if (slot) out.push(Object.assign({}, s, slot, { day: R.dayLoad(snap, s.tech, date), week: weekLoad(snap, s.tech, date) }));
    });
    if (!out.length) return out;
    const best = Math.max(...out.filter((c) => !c.limited).map((c) => c.score), -Infinity);
    // Limited history only counts as a fit when a stronger technician is in that day to back them up.
    const backup = ranked.find((s) => !s.limited && top && s.score >= top.score - MARGIN && onShiftAllDay(snap.techs.find((t) => t.name === s.tech), date));
    out.forEach((c) => {
      c.fit = c.limited ? !!backup && c.score >= best - NEW_MARGIN : c.score >= best - MARGIN;
      c.backup = c.limited && backup ? backup.tech : null;
    });
    const senior = R.needsSeniorTech({ hrs: R.ceilQuarter(type.std), l2: type.desc });
    // Fits first. Among fits: newer technicians on routine work, then least busy that day, then that week.
    return out.sort((a, b) => Number(b.fit) - Number(a.fit)
      || (senior ? 0 : Number(b.fit && b.limited) - Number(a.fit && a.limited))
      || (a.fit ? a.day - b.day || a.week - b.week : 0)
      || b.score - a.score || a.from - b.from);
  }

  /* ---------- suggest ---------- */

  const HORIZON = 14;

  /** Searches forward from the requested day for the first day anyone can take it. */
  function searchForward(snap, type, ranked, date, window, filter) {
    for (let i = 0; i <= HORIZON; i++) {
      const d = AS.toIso(AS.toN(date) + i);
      if (AS.toN(d) > AS.toN(snap.today) + HORIZON) break;
      const w = i === 0 ? window : 'asap';
      let c = candidates(snap, type, ranked, d, w).filter(filter || (() => true));
      if (!c.length && i === 0 && w !== 'asap') {
        // Nobody in the window, so try later the same day.
        const end = startRange(w, d, snap)[1];
        c = candidates(snap, type, ranked, d, 'asap').filter((x) => x.from > end).filter(filter || (() => true));
      }
      if (c.length) return { list: c, moved: i > 0 || (w !== 'asap' && c[0].from > startRange(w, d, snap)[1]) };
    }
    return null;
  }

  function windowWords(window, date, snap) {
    const day = dayWord(date, snap);
    if (window === 'morning') return `${day} morning`;
    if (window === 'afternoon') return `${day} afternoon`;
    if (typeof window === 'number') return `${day} at ${R.hhmm(window)}`;
    return day;
  }

  function statChips(c, type) {
    const chips = [
      { text: `${c.jobs} ${type.noun} jobs` },
      { text: `${c.speed.toFixed(1)}× standard time`, tone: c.speed <= 0.9 ? 'good' : '' },
      { text: `${c.comebacks} of ${c.jobs} came back`, tone: c.comebackRate === 0 ? 'good' : c.comebackRate >= 0.1 ? 'bad' : '' },
    ];
    if (c.limited) chips.push({ text: 'Limited history', tone: 'bad' });
    return chips;
  }

  function option(c, type, reason, label) {
    return { tech: c.tech, bay: c.bay, date: c.date, from: c.from, to: c.to, reason, label, stats: statChips(c, type), limited: c.limited };
  }

  /**
   * request: { type, date, window: 'asap' | 'morning' | 'afternoon' | start hour, customer, extraHours }
   * Returns { main, alts, moved, steps } or null when nobody can take it in the next two weeks.
   */
  function suggest(request, snap) {
    // Extras agreed on the call make the job longer, so the slot has to fit the lot.
    const base = typeOf(request.type);
    const type = request.extraHours ? Object.assign({}, base, { std: base.std + request.extraHours }) : base;
    const ranked = stats(type.id);
    const date = request.date || snap.today;
    const window = request.window || 'asap';
    const who = request.customer || 'the customer';
    const noun = type.noun;
    const steps = [
      `Reading ${HISTORY.filter((j) => j.type === type.id).length} past ${noun} jobs for ${ranked.length} technicians`,
      `Checking shifts, absences, jobs and bays for ${windowWords(window, date, snap)}`,
      'Ranking by speed against standard time and cars that came back within 30 days',
    ];

    const found = searchForward(snap, type, ranked, date, window);
    if (!found) return { main: null, alts: [], moved: false, steps };
    const list = found.list;
    const pick = list[0];
    const top = ranked.find((s) => !s.limited);
    const asked = windowWords(window, date, snap);
    const slotWords = `${dayWord(pick.date, snap)} at ${R.hhmm(pick.from)}`;

    let reason;
    if (pick.limited) {
      reason = `Building ${noun} experience, with ${pick.jobs} jobs so far. ${firstName(pick.backup)} is in ${dayWord(pick.date, snap)} if needed.`;
    } else if (top && pick.tech === top.tech) {
      reason = `Best ${noun} record on the team, and free ${slotWords}.`;
    } else {
      const close = top && pick.score >= top.score - MARGIN;
      const fits = list.filter((c) => c.fit).length;
      const lead = close ? `Close behind the best on ${noun} jobs` : `Next best on ${noun} jobs who's free`;
      const light = fits > 1 ? `, and the lightest ${dayWord(pick.date, snap) === 'today' ? 'day' : dayName(pick.date)} of the ${fits} who fit` : '';
      let why = '';
      if (top) {
        const topTech = snap.techs.find((t) => t.name === top.tech);
        const inList = list.find((c) => c.tech === top.tech);
        if (!onShiftAllDay(topTech, pick.date)) why = ` ${firstName(top.tech)} is away ${dayWord(pick.date, snap)}.`;
        else if (!inList) why = ` ${firstName(top.tech)} is fully booked ${found.moved ? dayWord(pick.date, snap) : asked}.`;
        else if (inList.day > pick.day) why = ` ${firstName(top.tech)} already has ${inList.day.toFixed(1)} h booked that day.`;
      }
      reason = `${lead}${light}.${why}`;
    }
    if (found.moved) reason = `Nobody suitable is free ${asked}. The earliest good fit is ${slotWords}. ${reason}`;
    const main = option(pick, type, reason, null);

    const alts = [];
    const used = new Set([pick.tech]);
    if (top && !used.has(top.tech)) {
      const best = searchForward(snap, type, ranked, date, window, (c) => c.tech === top.tech)
        || searchForward(snap, type, ranked, date, 'asap', (c) => c.tech === top.tech);
      if (best) {
        const c = best.list[0];
        let label;
        if (c.date === pick.date && c.from === pick.from) label = 'Or the most experienced, at the same time';
        else if (c.date === pick.date) label = c.from >= 12 && pick.from < 12 ? `If ${who} can do the afternoon` : `If ${who} can do ${R.hhmm(c.from)}`;
        else label = `If ${who} can wait until ${dayWord(c.date, snap) === 'tomorrow' ? 'tomorrow' : dayName(c.date)}`;
        alts.push(option(c, type, `Best ${noun} record on the team.`, label));
        used.add(top.tech);
      }
    }
    list.filter((c) => !used.has(c.tech) && c.fit && !c.limited).slice(0, 2 - alts.length).forEach((c) => {
      alts.push(option(c, type, '', `Also free ${c.date === pick.date && !found.moved ? asked : dayWord(c.date, snap)}`));
      used.add(c.tech);
    });
    return { main, alts, moved: found.moved, steps };
  }

  return { TYPES, typeOf, stats, suggest, history: () => HISTORY, dayShort, dayWord };
})();
