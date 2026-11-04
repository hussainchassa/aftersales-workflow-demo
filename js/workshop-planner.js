/*
 * Technician planner screen, rebuilt from the reference screenshot.
 * Rows, shifts, absences and cards below were transcribed from the screenshot.
 * The unallocated job details are invented so that the panel can expand.
 */
window.Workshop = (function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FIRST_HOUR = 7;
  const HOURS_PER_DAY = 12;
  const RES_WIDTH = 141;
  const PX_PER_SCALE = 0.32; // Scale 100 = 32px per hour, as in the screenshot.
  const NOW_HOUR = 9 + 42 / 60;
  const TODAY = '2026-11-04';

  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const NORMAL = [8, 17.5];
  const week = (overrides) => (dow) => {
    for (const [k, v] of Object.entries(overrides || {})) if (DOW[k] === dow) return v;
    return NORMAL;
  };
  const always = (s) => () => s;

  // alert: red triangle on the row. tech: counts towards workshop capacity.
  const RESOURCES = [
    { name: 'Abida Begum', alert: 1, tech: 1, shift: always([8, 12]), abs: [['2026-11-04', 7, '2026-11-05', 12, 'test']] },
    { name: 'Alina Rodina (Invoicing)', shift: always(NORMAL) },
    { name: 'Ana Ceban', alert: 1, tech: 1, shift: always(NORMAL) },
    { name: 'Anisha Sales Person', alert: 1, shift: week({ mon: [8, 19], tue: [8, 19], wed: [8, 19], thu: [8, 19], fri: [8, 19], sat: [8, 17], sun: [8, 17] }) },
    { name: 'Ant Tech', alert: 1, tech: 1, shift: week({ wed: [8, 19] }) },
    { name: 'Ash Meehan Tech', tech: 1, shift: always(NORMAL) },
    { name: 'Callum Tech Birch', alert: 1, tech: 1, shift: always(NORMAL), abs: [['2026-11-04', 8, '2026-11-04', 17.5, 'Holiday'], ['2026-11-05', 8, '2026-11-05', 17.5, 'Holiday']] },
    { name: 'Ciaran Tech', tech: 1, shift: always(null) },
    { name: 'Daniel Smith', alert: 1, tech: 1, shift: always(NORMAL), abs: [['2026-11-05', 8, '2026-11-05', 17, 'Training'], ['2026-11-06', 8, '2026-11-06', 17.5, 'Training']] },
    { name: 'Esme Apprentice', alert: 1, tech: 1, shift: week({ fri: [8, 16] }) },
    { name: 'Febin Tech 2', alert: 1, tech: 1, shift: always(NORMAL), abs: [['2026-11-04', 8, '2026-11-04', 17.5, 'Sickness'], ['2026-11-05', 8, '2026-11-05', 17.5, 'Sickness'], ['2026-11-06', 8, '2026-11-06', 12, 'Sickness'], ['2026-11-06', 12, '2026-11-06', 17.75, 'Authorised'], ['2026-11-09', 8, '2026-11-09', 17.5, 'Training']] },
    { name: 'Febin Tech 1', alert: 1, tech: 1, shift: always(NORMAL), abs: [['2026-11-04', 8, '2026-11-04', 17.5, 'Holiday']] },
    { name: 'Hugin Technician', tech: 1, shift: always(NORMAL) },
    { name: 'idrees sulaiman', alert: 1, tech: 1, shift: always(NORMAL) },
    { name: 'Isobel Weaver', tech: 1, shift: always(NORMAL) },
    { name: 'John TECH Celeste', tech: 1, shift: always(NORMAL) },
    { name: 'Justin Smith', tech: 1, shift: always(NORMAL) },
    { name: 'Krzysztof Dyner', tech: 1, shift: always(NORMAL) },
    { name: 'Lewis Durkin', alert: 1, tech: 1, shift: always(NORMAL) },
    { name: 'Louis TWilbourne', alert: 1, tech: 1, shift: always([8, 19]), abs: [['2026-11-04', 12, '2026-11-04', 13, 'Lunch']] },
    { name: 'Mark Tech Bacalla', alert: 1, tech: 1, shift: always(NORMAL) },
    { name: 'Megan Livermore', alert: 1, tech: 1, shift: week({ thu: null }) },
    { name: 'Megan Megan Tech', alert: 1, tech: 1, shift: always([8, 15]) },
    { name: 'Megan Walker - Tech', alert: 1, tech: 1, shift: always(NORMAL) },
  ];

  const ALLOCATED = [
    { bay: 'Ramp 1', res: 'Ana Ceban', from: ['2026-11-05', 8.5], to: ['2026-11-05', 16], l1: 'DEW - BMW - 5 Series Touring - 520d M Sport', l2: 'Load Hours: 7.50', hrs: 7.5, tags: [] },
    { bay: 'Ramp 2', res: 'Ash Meehan Tech', from: ['2026-11-04', 7], to: ['2026-11-15', 17.5], l1: 'ND01001 - Mercedes-benz - Diesel - WDC156946ND01A0001 - 94177', l2: 'London Borough Of Croydon - Load Hours: 110.20', hrs: 110.2, tags: ['arrived'] },
    { bay: 'Ramp 3', res: 'Callum Tech Birch', from: ['2026-11-04', 11.8], to: ['2026-11-04', 15.2], l1: 'BN77 JUJ - Jaguar - F-Pace', l2: 'Pinewood - Load Hours: 3.40', hrs: 3.4, ghost: 1, tags: [] },
    { bay: 'Ramp 6', res: 'Febin Tech 1', from: ['2026-11-04', 12], to: ['2026-11-04', 13.5], l1: 'Acura - MDX', l2: 'Mr B Thomas - Load Hours: 1.50', hrs: 1.5, ghost: 1, tags: ['wyw'] },
    // Not in the screenshot. Thursday bookings that set up the diagnostics matching scenario.
    { bay: 'Ramp 3', res: 'Isobel Weaver', from: ['2026-11-05', 8], to: ['2026-11-05', 13.5], l1: 'KE70 RWD - Land Rover - Discovery Sport', l2: 'Ms L Grant - Load Hours: 5.50', hrs: 5.5, tags: [] },
    { bay: 'Ramp 6', res: 'Louis TWilbourne', from: ['2026-11-05', 8], to: ['2026-11-05', 10.5], l1: 'MW19 HKP - Volvo - XC60', l2: 'Mr D Okafor - Load Hours: 2.50', hrs: 2.5, tags: [] },
    { bay: 'Ramp 7', res: 'Justin Smith', from: ['2026-11-05', 8], to: ['2026-11-05', 9], l1: 'GY21 NBF - Skoda - Octavia', l2: 'Mrs P Hughes - Load Hours: 1.00', hrs: 1, tags: [] },
  ];

  const j = (date, l1, l2, hrs, tags) => ({ date, l1, l2, hrs, tags: tags || [] });
  const UNALLOCATED = [
    j('2026-11-04', 'LK21 ABX - BMW - 3 Series', 'Major service', 2.5, ['arrived']),
    j('2026-11-04', 'YF70 KTO - Audi - A4 Avant', 'MOT and minor service', 1.8),
    j('2026-11-04', 'GN19 HVD - Ford - Transit Custom', 'Brake pads and discs', 2.2),
    j('2026-11-04', 'MA68 ZPL - Volkswagen - Golf', 'Clutch replacement', 5.5),
    j('2026-11-04', 'BD22 LWE - Mercedes-benz - C Class', 'Warranty: infotainment fault', 1.6),
    j('2026-11-04', 'SC20 UYT - Jaguar - E-Pace', 'Diagnostics', 1.2),
    j('2026-11-04', 'WR69 NMC - BMW - X3', 'Timing chain inspection', 3.0),
    j('2026-11-04', 'DE71 PFA - Audi - Q5', 'Air conditioning service', 1.0),
    j('2026-11-04', 'PX18 RGK - Ford - Focus', 'Pre-sale preparation', 2.0, ['internal']),
    j('2026-11-05', 'KY72 BLN - Volkswagen - Tiguan', 'Major service', 2.8),
    j('2026-11-06', 'HF21 WJS - BMW - 1 Series', 'Tyres x 4 and alignment', 1.5),
    j('2026-11-07', 'EO19 TVM - Mercedes-benz - A Class', 'Minor service', 1.4),
    j('2026-11-07', 'LN70 CXR - Ford - Puma', 'MOT', 0.8),
    j('2026-11-07', 'VK22 GHT - Audi - A3', 'Front suspension', 3.2),
    j('2026-11-08', 'RJ20 ZOB - Jaguar - XF', 'Major service', 2.6, ['arrived']),
    j('2026-11-08', 'NU68 DSE - Volkswagen - Polo', 'MOT and minor service', 1.8),
    j('2026-11-09', 'SB71 PLK - BMW - 5 Series', 'Coolant leak investigation', 2.4),
    j('2026-11-10', 'CT22 MVA - Mercedes-benz - GLC', 'Warranty: tailgate motor', 1.9),
    j('2026-11-13', 'FG69 YRU - Ford - Kuga', 'Timing belt', 4.5),
    j('2026-11-16', 'OE21 NHC - Audi - A6', 'Major service', 2.7),
  ];

  ALLOCATED.forEach((c, i) => { c.id = `c${i + 1}`; });
  UNALLOCATED.forEach((x, i) => { x.id = `j${i + 1}`; });

  const BAYS = ['Ramp 1', 'Ramp 2', 'Ramp 3', 'Ramp 4', 'Ramp 5', 'Ramp 6', 'Ramp 7', 'MOT lane', 'Tyre bay', 'Long-stay bay'];

  // Vehicles parked on a ramp with no technician working on them. Invented sample data.
  const HOLDS = [
    { id: 'h1', bay: 'Ramp 4', vehicle: 'WR66 TKB - Audi - A4', reason: 'Waiting for parts', from: ['2026-11-04', 8], to: ['2026-11-06', 17.5] },
    { id: 'h2', bay: 'Ramp 5', vehicle: 'KP19 VOD - Ford - Ranger', reason: 'Waiting for customer authorisation', from: ['2026-11-04', 8], to: ['2026-11-05', 17.5] },
  ];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const live = { cards: ALLOCATED, jobs: UNALLOCATED, holds: HOLDS };
  const history = [];

  const FILTERS = [
    { key: 'external', label: 'Excluding Internal Preparation', count: 23 },
    { key: 'internal', label: 'Internal Preparation', count: 1 },
    { key: 'arrived', label: 'Vehicle has Arrived', count: 2 },
    { key: 'wyw', label: 'While You Wait', count: 1 },
  ];

  const state = {
    from: TODAY, to: '2026-11-18', scale: 100, filters: new Set(), notStarted: false,
    query: '', open: new Set(), scrollLeft: 0, scrollTop: 0, view: 'tech', preview: null,
  };
  const shown = () => (state.preview ? state.preview.result : live);

  const n = (iso) => window.AS.toN(iso);
  const iso = (x) => window.AS.toIso(x);

  function jobMatches(job) {
    if (state.query && !(job.l1 + ' ' + job.l2).toLowerCase().includes(state.query)) return false;
    if (!state.filters.size) return true;
    for (const f of state.filters) {
      if (f === 'external' && !job.tags.includes('internal')) return true;
      if (job.tags.includes(f)) return true;
    }
    return false;
  }

  function offBlocks(res, start, days, h) {
    let html = '';
    const block = (left, width) => { if (width > 0) html += `<div class="pl-off" style="left:${left}px;width:${width}px"></div>`; };
    for (let i = 0; i < days; i++) {
      const dayLeft = i * HOURS_PER_DAY * h;
      const shift = res.shift(window.AS.dateOf(start + i).getUTCDay());
      if (!shift) { block(dayLeft, HOURS_PER_DAY * h); continue; }
      block(dayLeft, (shift[0] - FIRST_HOUR) * h);
      block(dayLeft + (shift[1] - FIRST_HOUR) * h, (FIRST_HOUR + HOURS_PER_DAY - shift[1]) * h);
    }
    return html;
  }

  /** Converts a date and hour to a pixel offset, clamped to the visible range. */
  function offset(date, hour, start, days, h) {
    const d = n(date) - start;
    const px = d * HOURS_PER_DAY * h + (hour - FIRST_HOUR) * h;
    return Math.max(0, Math.min(days * HOURS_PER_DAY * h, px));
  }

  /** Applies plan changes to a copy or to the live diary. */
  function applyChanges(target, changes, mark) {
    changes.forEach((c) => {
      if (c.kind === 'hold') {
        const hold = target.holds.find((x) => x.id === c.id);
        if (hold) { hold.bay = null; hold.yard = true; }
      } else if (c.kind === 'bay') {
        const card = target.cards.find((x) => x.id === c.id);
        card.bay = c.bay; card[mark] = true;
      } else if (c.kind === 'reassign') {
        const card = target.cards.find((x) => x.id === c.id);
        card.res = c.res; card.ghost = 0; card[mark] = true;
      } else if (c.kind === 'book') {
        const i = target.jobs.findIndex((x) => x.id === c.id);
        const job = target.jobs[i];
        target.jobs.splice(i, 1);
        target.cards.push({
          id: `b${job.id}`, res: c.res, bay: c.bay, from: c.from, to: c.to, hrs: job.hrs, tags: job.tags,
          l1: job.l1, l2: `${job.l2} - Load Hours: ${job.hrs.toFixed(2)}`, [mark]: true,
        });
      } else if (c.kind === 'appointment') {
        target.cards.push({
          id: c.id, res: c.res, bay: c.bay, from: c.from, to: c.to, hrs: c.hrs, tags: [],
          l1: c.l1, l2: `${c.l2} - Load Hours: ${c.hrs.toFixed(2)}`, [mark]: true,
        });
      }
    });
  }

  function cardHtml(c, start, days, h) {
    const left = offset(c.from[0], c.from[1], start, days, h);
    const width = offset(c.to[0], c.to[1], start, days, h) - left;
    if (width <= 0) return '';
    const hidden = (state.filters.size && !jobMatches(c)) || (state.query && !jobMatches(c));
    const sub = state.view === 'bay' ? `${c.res} - ${c.l2}` : c.bay ? `${c.bay} - ${c.l2}` : c.l2;
    const cls = [c.ghost ? 'ghost' : '', hidden ? 'dim' : '', c.ai ? 'ai' : '', c.prop ? 'prop' : ''].join(' ');
    return `<div class="pl-card ${cls}" style="left:${left}px;width:${width}px" title="${esc(c.l1 + ' · ' + sub)}"><div>${esc(c.l1)}</div><div><small>${esc(sub)}</small></div></div>`;
  }

  function renderBayRows(start, days, h) {
    const open = { shift: always(NORMAL) };
    const data = shown();
    return BAYS.map((bay) => {
      const holds = data.holds.filter((x) => x.bay === bay).map((x) => {
        const left = offset(x.from[0], x.from[1], start, days, h);
        const width = offset(x.to[0], x.to[1], start, days, h) - left;
        return width > 0 ? `<div class="pl-abs" style="left:${left}px;width:${width}px" title="${esc(x.vehicle + ': ' + x.reason)}">${esc(x.vehicle)} · ${esc(x.reason)}</div>` : '';
      }).join('');
      const cards = data.cards.filter((c) => c.bay === bay).map((c) => cardHtml(c, start, days, h)).join('');
      return `<div class="pl-row"><div class="pl-res" title="${esc(bay)}"><span>${esc(bay)}</span></div><div class="pl-track">${offBlocks(open, start, days, h)}${holds}${cards}</div></div>`;
    }).join('');
  }

  function renderGrid(start, days, h) {
    const hours = Array.from({ length: HOURS_PER_DAY }, (_, i) => `<span>${FIRST_HOUR + i}</span>`).join('');
    const dayHeads = Array.from({ length: days }, (_, i) => {
      const title = window.AS.dateOf(start + i).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      return `<div class="pl-dayh"><div class="pl-dayt">${esc(title)}</div><div class="pl-hours">${hours}</div></div>`;
    }).join('');

    const rows = state.view === 'bay' ? renderBayRows(start, days, h) : RESOURCES.map((res) => {
      const abs = (res.abs || []).map(([d1, h1, d2, h2, label]) => {
        const left = offset(d1, h1, start, days, h);
        const width = offset(d2, h2, start, days, h) - left;
        return width > 0 ? `<div class="pl-abs" style="left:${left}px;width:${width}px" title="${esc(label)}">${esc(label)}</div>` : '';
      }).join('');
      const cards = shown().cards.filter((c) => c.res === res.name).map((c) => cardHtml(c, start, days, h)).join('');
      const alert = res.alert ? '<svg class="i" aria-label="Needs attention" role="img"><use href="#i-warn-fill"/></svg>' : '';
      return `<div class="pl-row"><div class="pl-res" title="${esc(res.name)}">${alert}<span>${esc(res.name)}</span></div><div class="pl-track">${offBlocks(res, start, days, h)}${abs}${cards}</div></div>`;
    }).join('');

    const todayIdx = n(TODAY) - start;
    const now = todayIdx >= 0 && todayIdx < days
      ? `<div class="pl-now" style="left:${RES_WIDTH + (todayIdx * HOURS_PER_DAY + NOW_HOUR - FIRST_HOUR) * h}px"></div>`
      : '';

    return `<div class="pl-inner" style="--h:${h}px;--res:${RES_WIDTH}px;--w:${days * HOURS_PER_DAY * h}px">
      <div class="pl-head"><div class="pl-corner"></div>${dayHeads}</div>${rows}${now}</div>`;
  }

  function renderPanel() {
    const filters = FILTERS.map((f) => `<label class="pl-f"><input class="check" type="checkbox" data-pf="${f.key}" ${state.filters.has(f.key) ? 'checked' : ''}><span>${esc(f.label)}</span><b>${f.count}</b></label>`).join('');
    const byDay = new Map();
    shown().jobs.filter(jobMatches).forEach((job) => {
      if (!byDay.has(job.date)) byDay.set(job.date, []);
      byDay.get(job.date).push(job);
    });
    const days = [...byDay.entries()].map(([date, jobs]) => {
      const open = state.open.has(date);
      const list = open ? jobs.map((x) => `<div class="pl-job"><b>${esc(x.l1)}</b>${esc(x.l2)} · ${x.hrs.toFixed(2)} h</div>`).join('') : '';
      return `<button class="pl-day" data-a="pl-day" data-v="${date}" aria-expanded="${open}"><svg class="i"><use href="#i-right"/></svg>${date}<b>${jobs.length}</b></button>${list}`;
    }).join('') || `<div class="pl-f" style="display:block;cursor:default">${shown().jobs.length ? 'No matching jobs' : 'All jobs allocated'}</div>`;
    return `<div class="pl-section"><div class="pl-h">Filter</div>${filters}</div>
      <div class="pl-section"><div class="pl-h">Unallocated</div><input class="pl-search" id="pl-search" placeholder="Search" aria-label="Search unallocated jobs" value="${esc(state.query)}" autocomplete="off">${days}</div>
      <div class="pl-section"><div class="pl-h"><span>Allocated Statuses</span><span>${shown().cards.length}</span></div><label class="pl-f"><input class="check" type="checkbox" data-pf="ns" ${state.notStarted ? 'checked' : ''}><span>Not Started</span><b class="pl-chip">${shown().cards.length}</b></label></div>`;
  }

  function render(mount, runProgress) {
    const start = n(state.from);
    const days = Math.max(1, n(state.to) - start + 1);
    const h = state.scale * PX_PER_SCALE;
    const banner = state.preview ? `<div class="pl-banner"><svg class="i sm"><use href="#i-sparks"/></svg><span><b>Preview.</b> ${state.preview.count} changes shown with dashed outlines. Nothing is saved yet.</span><span class="sp"></span><button class="btn s" data-a="plan-back">Back to plan</button><button class="btn s p" data-a="plan-apply">Apply ${state.preview.count} changes</button></div>` : '';
    mount.innerHTML = `<div class="planner">${banner}
      <div class="pl-toolbar">
        <input type="date" id="pl-from" aria-label="From date" value="${state.from}">
        <input type="date" id="pl-to" aria-label="To date" value="${state.to}">
        <button class="pl-go" data-a="pl-search" aria-label="Search"><svg class="i"><use href="#i-search"/></svg></button>
        <label class="pl-check"><input class="check" type="checkbox" data-a="inert">Operations</label>
        <div class="pl-seg" role="group" aria-label="Diary rows"><button data-a="pl-view" data-v="tech" aria-pressed="${state.view === 'tech'}">Technicians</button><button data-a="pl-view" data-v="bay" aria-pressed="${state.view === 'bay'}">Workbays</button></div>
        <label class="pl-scale"><span>25</span><input type="range" id="pl-scale" min="25" max="400" value="${state.scale}" aria-label="Timeline scale"><span>400</span></label>
        <div class="pl-progress${runProgress ? ' run' : ''}"></div>
      </div>
      <div class="pl-body">
        <div class="pl-panel" id="pl-panel">${renderPanel()}</div>
        <div class="pl-grid" id="pl-grid">${renderGrid(start, days, h)}</div>
      </div>
    </div>`;
    const grid = mount.querySelector('#pl-grid');
    grid.scrollLeft = state.scrollLeft;
    grid.scrollTop = state.scrollTop;
    grid.addEventListener('scroll', () => { state.scrollLeft = grid.scrollLeft; state.scrollTop = grid.scrollTop; }, { passive: true });
    wire(mount);
  }

  function refreshGrid(mount) {
    const g = mount.querySelector('#pl-grid');
    g.innerHTML = renderGrid(n(state.from), Math.max(1, n(state.to) - n(state.from) + 1), state.scale * PX_PER_SCALE);
  }

  function wire(mount) {
    const scale = mount.querySelector('#pl-scale');
    scale.addEventListener('input', () => {
      const g = mount.querySelector('#pl-grid');
      const ratio = scale.value / state.scale;
      const centre = g.scrollLeft + (g.clientWidth - RES_WIDTH) / 2;
      state.scale = Number(scale.value);
      refreshGrid(mount);
      g.scrollLeft = centre * ratio - (g.clientWidth - RES_WIDTH) / 2;
    });
    const panel = mount.querySelector('#pl-panel');
    panel.addEventListener('change', (e) => {
      const key = e.target.dataset.pf;
      if (!key) return;
      if (key === 'ns') state.notStarted = e.target.checked;
      else if (e.target.checked) state.filters.add(key);
      else state.filters.delete(key);
      panel.innerHTML = renderPanel();
      refreshGrid(mount);
    });
    panel.addEventListener('input', (e) => {
      if (e.target.id !== 'pl-search') return;
      state.query = e.target.value.trim().toLowerCase();
      const pos = e.target.selectionStart;
      panel.innerHTML = renderPanel();
      const input = panel.querySelector('#pl-search');
      input.focus();
      input.setSelectionRange(pos, pos);
      refreshGrid(mount);
    });
  }

  function search(mount) {
    const from = mount.querySelector('#pl-from').value;
    const to = mount.querySelector('#pl-to').value;
    if (!from || !to || n(to) < n(from)) return false;
    state.from = from; state.to = to; state.scrollLeft = 0;
    render(mount, true);
    return true;
  }

  function toggleDay(mount, date) {
    if (state.open.has(date)) state.open.delete(date); else state.open.add(date);
    mount.querySelector('#pl-panel').innerHTML = renderPanel();
  }

  /** Forward view of the diary, used by the copilot's capacity dashboard. */
  function capacity() {
    const start = n(TODAY);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = start + i;
      const date = iso(d);
      let avail = 0;
      const absent = [];
      RESOURCES.filter((r) => r.tech).forEach((r) => {
        const shift = r.shift(window.AS.dateOf(d).getUTCDay());
        if (!shift) return;
        let hours = shift[1] - shift[0];
        (r.abs || []).filter((a) => a[0] === date || (n(a[0]) < d && n(a[2]) >= d)).forEach((a) => {
          const from = a[0] === date ? a[1] : FIRST_HOUR;
          const to = a[2] === date ? a[3] : FIRST_HOUR + HOURS_PER_DAY;
          const overlap = Math.max(0, Math.min(to, shift[1]) - Math.max(from, shift[0]));
          hours -= overlap;
          if (overlap >= 4 && !absent.includes(r.name)) absent.push(r.name);
        });
        avail += Math.max(0, hours);
      });
      const jobs = live.jobs.filter((x) => x.date === date);
      days.push({ date, n: d, avail, unallocHrs: jobs.reduce((a, x) => a + x.hrs, 0), unallocJobs: jobs.length, absent });
    }
    return {
      days,
      unallocated: live.jobs.length,
      unallocatedToday: live.jobs.filter((x) => x.date === TODAY).length,
      unallocatedHrs: live.jobs.reduce((a, x) => a + x.hrs, 0),
      allocated: live.cards.length,
      absentToday: days[0].absent,
    };
  }

  function setView(mount, view) {
    state.view = view;
    render(mount, false);
  }

  function preview(plan) {
    const result = clone(live);
    applyChanges(result, plan.changes, 'prop');
    state.preview = { result, count: plan.changes.length };
    state.view = plan.changes.every((c) => c.kind === 'hold' || c.kind === 'bay') ? 'bay' : 'tech';
  }

  function clearPreview() { state.preview = null; }

  function apply(plan) {
    history.push(clone({ cards: live.cards, jobs: live.jobs, holds: live.holds }));
    live.cards.forEach((c) => { delete c.ai; });
    applyChanges(live, plan.changes, 'ai');
    state.preview = null;
    state.view = plan.changes.every((c) => c.kind === 'hold' || c.kind === 'bay') ? 'bay' : 'tech';
  }

  function undo() {
    const prior = history.pop();
    if (!prior) return false;
    live.cards = prior.cards; live.jobs = prior.jobs; live.holds = prior.holds;
    state.preview = null;
    return true;
  }

  /** A copy of the diary for the optimiser to plan against. */
  function snapshot() {
    return {
      today: TODAY, nowHour: NOW_HOUR, bays: BAYS.slice(), cards: clone(live.cards), jobs: clone(live.jobs), holds: clone(live.holds),
      techs: RESOURCES.filter((r) => r.tech).map((r) => ({ name: r.name, shift: r.shift, abs: r.abs || [] })),
    };
  }

  return { render, search, toggleDay, capacity, setView, preview, clearPreview, apply, undo, snapshot, canUndo: () => history.length > 0 };
})();
