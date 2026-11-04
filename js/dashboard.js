/*
 * Renders a dashboard spec. Every figure and every sentence is calculated from the
 * dataset when the dashboard is built, so changing a filter rewrites the narrative too.
 */
window.Dashboard = (function () {
  'use strict';

  const AS = window.AS;
  const M = AS.METRICS;
  const Intent = window.Intent;
  const Charts = window.Charts;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmt = (k, v) => AS.format(k, v);
  const fmtFull = (k, v) => AS.format(k, v, { full: true });

  // Colour follows the entity: Branch 2 and Labour keep their slot in every chart.
  const BRANCH_COLOR = { 'Branch 1': Charts.COLORS[0], 'Branch 2': Charts.COLORS[1], 'Branch 3': Charts.COLORS[2] };
  const SERIES_COLOR = (name, i) => BRANCH_COLOR[name] || Charts.COLORS[i % Charts.COLORS.length];

  /* ---------- axis formats ---------- */
  function axisFormatter(key) {
    const kind = M[key].kind;
    return (v) => {
      if (kind === 'gbp' || kind === 'gbpr') return Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toFixed(1) + 'm' : Math.abs(v) >= 1e4 ? '£' + Math.round(v / 1e3) + 'k' : '£' + Math.round(v).toLocaleString('en-GB');
      if (kind === 'pct') return Math.round(v * 100) + '%';
      if (kind === 'pct1') return (v * 100).toFixed(1) + '%';
      if (kind === 'hrs') return Math.round(v).toLocaleString('en-GB');
      if (kind === 'days' || kind === 'score') return String(Number(v.toFixed(1)));
      return Math.round(v).toLocaleString('en-GB');
    };
  }

  const targetOf = (key) => (M[key].target != null ? { value: M[key].target, label: `Target ${fmt(key, M[key].target)}` } : null);
  // Compared as displayed, because "2.0%, target 2.0%" flagged as a miss reads as a bug.
  const missesTarget = (key, v) => {
    if (M[key].target == null || v == null || fmt(key, v) === fmt(key, M[key].target)) return false;
    return M[key].up ? v < M[key].target : v > M[key].target;
  };
  const lower = (key) => M[key].label.toLowerCase().replace('vhc', 'VHC');
  const badWord = (key) => (M[key].up ? 'down' : 'up');
  const isAre = (key) => (/(sales|hours|cards|sold|clocked|identified)$/i.test(M[key].label) ? 'are' : 'is');
  const aTarget = (key) => { const t = fmt(key, M[key].target); return `${/^(8|11|18)/.test(t) ? 'an' : 'a'} ${t} target`; };

  /* ---------- narrative ---------- */
  function worstGroup(s, key) {
    const f = Intent.filterOf(s);
    const fallback = s.branch == null && s.tech == null ? 'branch' : s.tech == null ? 'tech' : 'type';
    const dim = s.by && s[s.by] == null ? s.by : fallback; // Talk about the split that was asked for.
    if (M[key].att && !AS.DIM[dim].att) return null;
    const rows = AS.group(f, dim).map((g) => ({ name: g.name, v: AS.value(key, g.s) })).filter((g) => g.v != null);
    if (rows.length < 2) return null;
    rows.sort((a, b) => (M[key].up ? a.v - b.v : b.v - a.v));
    return { worst: rows[0], best: rows[rows.length - 1] };
  }

  const changeWord = (d) => (d.dir === 'up' ? 'up' : d.dir === 'down' ? 'down' : 'flat');
  const changeText = (key, cur, prev) => {
    const d = AS.delta(key, cur, prev);
    if (!d) return '';
    return d.dir === 'flat' ? 'flat' : `${changeWord(d)} ${d.text.replace(/^[+−]/, '')}`;
  };

  function narrate(s, key) {
    const cur = AS.summary(Intent.filterOf(s));
    const pf = Intent.prevFilterOf(s);
    const prev = pf ? AS.summary(pf) : null;
    const val = (k, summ) => (summ ? AS.value(k, summ) : null);

    if (s.why) return narrateWhy(s, key, cur, prev);

    if (s.topics[0] === 'leakage' && AS.attendanceValid(s)) {
      const l = AS.leakage(Intent.filterOf(s));
      return {
        title: `You're leaving about ${AS.approx(l.perWeek)} a week on the table: ${AS.approx(l.bay.perWeek)} in blocked workbays and ${AS.approx(l.tech.perWeek)} in technician time.`,
        detail: `That's about ${AS.approx(l.total)} of labour sales over ${s.range.label.toLowerCase()}. Each lost hour is counted once, under one cause.`,
      };
    }

    if (s.topics[0] === 'overview') {
      const salesV = val('sales', cur);
      const change = changeText('sales', salesV, val('sales', prev));
      const lead = `Sales are ${change ? change + ' to ' : ''}${fmt('sales', salesV)}`;
      const missing = AS.attendanceValid(s) ? ['efficiency', 'utilisation', 'vhcConv', 'csi'] : ['efficiency', 'vhcConv', 'csi'];
      const gaps = missing
        .map((k) => ({ k, v: val(k, cur), gap: (M[k].target - val(k, cur)) / M[k].target }))
        .filter((g) => g.v != null && g.gap > 0)
        .sort((a, b) => b.gap - a.gap);
      const salesDown = AS.delta('sales', salesV, val('sales', prev));
      const join = salesDown && salesDown.good ? ', but' : ', and';
      let title;
      let detail = '';
      if (AS.attendanceValid(s)) {
        const l = AS.leakage(Intent.filterOf(s));
        if (l.perWeek >= 100) {
          title = `${lead}${join} you're leaving about ${AS.approx(l.perWeek)} a week on the table in workbays and technician time.`;
          const split = worstGroup(s, 'efficiency');
          if (split && missesTarget('efficiency', split.worst.v)) detail = `${split.worst.name} is the weakest on efficiency at ${fmt('efficiency', split.worst.v)}, while ${split.best.name} is at ${fmt('efficiency', split.best.v)}.`;
          return { title, detail };
        }
      }
      if (gaps.length) {
        const g = gaps[0];
        title = `${lead}${join} ${lower(g.k)} is ${fmt(g.k, g.v)} against ${aTarget(g.k)}.`;
        const split = worstGroup(s, 'efficiency');
        const parts = [];
        if (split && missesTarget('efficiency', split.worst.v)) parts.push(`${split.worst.name} is the weakest on efficiency at ${fmt('efficiency', split.worst.v)}, while ${split.best.name} is at ${fmt('efficiency', split.best.v)}.`);
        const vhcSplit = worstGroup(s, 'vhcConv');
        if (vhcSplit && missesTarget('vhcConv', vhcSplit.worst.v)) parts.push(`${vhcSplit.worst.name} is also below target on health checks at ${fmt('vhcConv', vhcSplit.worst.v)}.`);
        detail = parts.join(' ');
      } else {
        title = `${lead}, and every core measure is on target.`;
      }
      return { title, detail };
    }

    const k = key || 'sales';
    const v = val(k, cur);
    const change = changeText(k, v, val(k, prev));
    const target = M[k].target != null ? `, against ${aTarget(k)}` : '';
    const title = `${M[k].label} ${isAre(k)} ${fmt(k, v)}${change ? `, ${change} on the ${Intent.compareLabel(s)}` : ''}${target}.`;
    const split = worstGroup(s, k);
    const detail = split ? `${split.best.name} is strongest at ${fmt(k, split.best.v)}. ${split.worst.name} is weakest at ${fmt(k, split.worst.v)}.` : '';
    return { title, detail };
  }

  const driverFmt = (key) => {
    if (['pct', 'pct1', 'score'].includes(M[key].kind)) {
      return (v) => { const r = Number(v.toFixed(1)); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} pts`; };
    }
    return (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(key, Math.abs(v))}`;
  };

  function narrateWhy(s, key, cur, prev) {
    const v = AS.value(key, cur);
    const pv = prev ? AS.value(key, prev) : null;
    if (pv == null) return { title: `${M[key].label} is ${fmt(key, v)}. I can't explain a change because there's no earlier period to compare with.`, detail: '' };
    const d = AS.delta(key, v, pv);
    const verb = d.dir === 'flat' ? 'held' : d.dir === 'up' ? 'rose' : 'fell';
    const title = d.dir === 'flat'
      ? `${M[key].label} held at ${fmt(key, v)} against the ${Intent.compareLabel(s)}.`
      : `${M[key].label} ${verb} ${d.text.replace(/^[+−]/, '')} to ${fmt(key, v)} against the ${Intent.compareLabel(s)}.`;
    const f = Intent.filterOf(s);
    const pf = Intent.prevFilterOf(s);
    const dim = s.tech != null ? (M[key].att ? null : 'type') : 'tech';
    if (!dim) return { title, detail: '' };
    const rows = AS.drivers(f, pf, key, dim);
    const moved = d.raw < 0 ? rows.slice(0, 2) : rows.slice(-2).reverse();
    const names = moved.filter((r) => (d.raw < 0 ? r.contribution < 0 : r.contribution > 0));
    const f2 = driverFmt(key);
    const detail = names.length && d.dir !== 'flat'
      ? `Biggest contributors: ${names.map((r) => `${r.name} (${f2(r.contribution)})`).join(' and ')}. Contributions add up to the overall change.`
      : '';
    return { title, detail };
  }

  /* ---------- attention list ---------- */
  function attentionItems(s) {
    const f = Intent.filterOf(s);
    const dim = s.branch == null ? 'branch' : 'tech';
    const keys = dim === 'branch' ? ['efficiency', 'utilisation', 'vhcConv', 'csi', 'comeback'] : ['efficiency', 'utilisation', 'comeback'];
    const items = [];
    AS.group(f, dim).forEach((g) => {
      keys.forEach((k) => {
        const v = AS.value(k, g.s);
        if (!missesTarget(k, v)) return;
        const gap = Math.abs(M[k].target - v) / M[k].target;
        if (gap < 0.03) return;
        items.push({
          gap,
          sev: gap >= 0.1 ? 'crit' : 'warn',
          text: `${g.name}: ${lower(k)} ${fmt(k, v)}, target ${fmt(k, M[k].target)}`,
          ask: `Why is ${lower(k)} ${badWord(k)} at ${g.name}?`,
          askScoped: dim === 'branch',
        });
      });
    });
    return items.sort((a, b) => b.gap - a.gap).slice(0, 4);
  }

  /* ---------- table ---------- */
  function tableHtml(columns, rows) {
    return `<div class="tw"><table class="dt"><thead><tr>${columns.map((c, i) => `<th class="${i ? 'num' : ''}" scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- card shell ---------- */
  function card(widget, opts) {
    const el = document.createElement('section');
    el.className = `w s${widget.span}`;
    el.innerHTML = `<header class="w-h"><div><h3>${esc(widget.title)}</h3>${opts.sub ? `<p>${esc(opts.sub)}</p>` : ''}</div>${opts.table ? `<div class="w-acts"><button class="icbtn sm" data-a="w-view" aria-pressed="false" aria-label="Show ${esc(widget.title)} as a table" title="Table view">${ic('table')}</button></div>` : ''}</header><div class="w-b"></div>${opts.table ? `<div class="w-t hide">${tableHtml(opts.table.columns, opts.table.rows)}</div>` : ''}`;
    return { el, body: el.querySelector('.w-b') };
  }

  const bucketWord = (bks) => ({ day: 'daily', week: 'weekly, by week ending', month: 'by full calendar month' }[bks.grain]);

  /* ---------- widgets ---------- */
  const W = {
    headline(w, s) {
      const n = narrate(s, w.metric);
      const el = document.createElement('section');
      el.className = 'w s12 w-head';
      el.innerHTML = `<div class="spark">${ic('spark', 'sm')}</div><div><div class="head-t">${esc(n.title)}</div>${n.detail ? `<div class="head-d">${esc(n.detail)}</div>` : ''}</div>`;
      return el;
    },

    kpis(w, s) {
      const cur = AS.summary(Intent.filterOf(s));
      const pf = Intent.prevFilterOf(s);
      const prev = pf ? AS.summary(pf) : null;
      const bks = AS.buckets(s.range, s.grain);
      const hero = w.hero;
      const el = document.createElement('section');
      el.className = `w-kpis s12${hero ? ' is-hero' : ''}`;
      el.setAttribute('aria-label', w.title);
      el.innerHTML = w.metrics.map((k) => {
        const v = AS.value(k, cur);
        const d = prev ? AS.delta(k, v, AS.value(k, prev)) : null;
        const sr = !hero && bks.length >= 3 ? AS.series(Intent.filterOf(s), k, bks.slice(-12), null) : [];
        const spark = sr.length ? Charts.sparkline(sr[0].values) : '';
        const target = M[k].target != null ? `<span class="kpi-tg${missesTarget(k, v) ? ' miss' : ''}">${missesTarget(k, v) ? ic('alert', 'sm') : ''}Target ${esc(fmt(k, M[k].target))}</span>` : '';
        const deltaHtml = d
          ? `<span class="kpi-d ${d.dir === 'flat' ? 'flat' : d.good ? 'good' : 'bad'}">${d.dir === 'flat' ? '' : ic(d.dir === 'up' ? 'up' : 'dn', 'sm')}${esc(d.text)}</span><span class="kpi-v">vs ${esc(Intent.compareLabel(s))}</span>`
          : '<span class="kpi-v">No earlier period</span>';
        const why = d && d.dir !== 'flat' ? `<button class="kpi-why" data-a="ask" data-v="Why is ${esc(lower(k))} ${d.dir === 'up' ? 'up' : 'down'}?">Why?</button>` : '';
        return `<div class="kpi" title="${esc(M[k].def)}"><div class="kpi-l">${esc(M[k].label)}${why}</div><div class="kpi-n">${esc(fmt(k, v))}</div><div class="kpi-m">${deltaHtml}</div>${target}${spark}${hero ? `<p class="kpi-def">${esc(M[k].def)}</p>` : ''}</div>`;
      }).join('');
      return el;
    },

    stack(w, s) {
      const bks = AS.buckets(s.range, s.grain);
      const f = Intent.filterOf(s);
      const labour = AS.series(f, 'labour', bks, null)[0];
      const parts = AS.series(f, 'parts', bks, null)[0];
      if (!labour || !parts) return null;
      const series = [{ name: 'Labour', color: Charts.COLORS[0], values: labour.values }, { name: 'Parts', color: Charts.COLORS[1], values: parts.values }];
      const table = { columns: ['Period', 'Labour', 'Parts', 'Total'], rows: bks.map((b, i) => [b.label, fmtFull('sales', series[0].values[i]), fmtFull('sales', series[1].values[i]), fmtFull('sales', (series[0].values[i] || 0) + (series[1].values[i] || 0))]) };
      const { el, body } = card(w, { sub: `Sales ${bucketWord(bks)}`, table });
      Charts.columns(body, { labels: bks.map((b) => b.label), series, fmt: (v) => fmt('sales', v), axisFmt: axisFormatter('sales'), aria: w.title });
      return el;
    },

    trend(w, s) {
      const bks = AS.buckets(s.range, s.grain);
      const key = w.metric;
      const raw = AS.series(Intent.filterOf(s), key, bks, w.by);
      if (!raw.length) return null;
      const series = raw.map((r, i) => ({ name: w.by ? r.name : M[key].label, color: SERIES_COLOR(r.name, i), values: r.values }));
      const table = { columns: ['Period', ...series.map((x) => x.name)], rows: bks.map((b, i) => [b.label, ...series.map((x) => fmtFull(key, x.values[i]))]) };
      const { el, body } = card(w, { sub: `${M[key].short} ${bucketWord(bks)}`, table });
      Charts.line(body, { labels: bks.map((b) => b.label), series, fmt: (v) => fmt(key, v), axisFmt: axisFormatter(key), target: targetOf(key), zeroBase: w.zeroBase, aria: `${w.title}, ${series.length} series` });
      return el;
    },

    rank(w, s) {
      const key = w.metric;
      const rows = AS.group(Intent.filterOf(s), w.by).map((g) => ({ name: g.name, value: AS.value(key, g.s) })).filter((r) => r.value != null);
      if (!rows.length) return null;
      const lowFirst = w.low;
      rows.sort((a, b) => (lowFirst ? a.value - b.value : b.value - a.value));
      const target = targetOf(key);
      if (target) rows.forEach((r) => { r.emph = missesTarget(key, r.value); });
      const allEmph = !target || rows.every((r) => r.emph) || rows.every((r) => !r.emph);
      if (allEmph) rows.forEach((r) => { r.emph = undefined; });
      const table = { columns: [Intent.dimName(w.by)[0].toUpperCase() + Intent.dimName(w.by).slice(1), M[key].label], rows: rows.map((r) => [r.name, fmtFull(key, r.value)]) };
      const { el, body } = card(w, { sub: lowFirst ? 'Lowest first' : null, table });
      Charts.rankBars(body, { rows, fmt: (v) => fmt(key, v), target, limit: w.limit, metricName: M[key].label, emphNote: target && !allEmph ? (M[key].up ? 'Coloured bars are below target' : 'Coloured bars are above target') : null });
      return el;
    },

    seg(w, s) {
      const key = w.metric;
      const groups = AS.group(Intent.filterOf(s), w.by);
      const parts = groups.map((g) => ({ name: g.name, value: AS.value(key, g.s), color: Charts.COLORS[AS.DIM[w.by].names.indexOf(g.name) % 6] }));
      const total = parts.reduce((a, p) => a + p.value, 0) || 1;
      const table = { columns: ['Job type', M[key].label, 'Share'], rows: parts.map((p) => [p.name, fmtFull(key, p.value), Math.round((p.value / total) * 100) + '%']) };
      const { el, body } = card(w, { table });
      Charts.segBar(body, { parts, fmt: (v) => fmt(key, v), metricName: M[key].label });
      return el;
    },

    scorecard(w, s) {
      const f = Intent.filterOf(s);
      const pf = Intent.prevFilterOf(s);
      const prev = pf ? new Map(AS.group(pf, w.by).map((g) => [g.id, g])) : new Map();
      const att = AS.attendanceValid(s);
      const cols = ['sales', 'gp', 'efficiency', ...(att ? ['utilisation'] : []), 'vhcConv', 'csi', 'comeback'];
      const groups = AS.group(f, w.by);
      const missCount = (g) => cols.filter((k) => missesTarget(k, AS.value(k, g.s))).length;
      groups.sort((a, b) => missCount(a) - missCount(b) || AS.value('sales', b.s) - AS.value('sales', a.s));
      const el = document.createElement('section');
      el.className = `w s${w.span}`;
      const rows = groups.map((g) => {
        const misses = missCount(g);
        const status = misses === 0 ? ['ok', 'check', 'On target'] : misses === 1 ? ['warn', 'info', 'Watch'] : ['crit', 'alert', 'Below target'];
        const cells = cols.map((k) => {
          const v = AS.value(k, g.s);
          const p = prev.get(g.id);
          const d = p ? AS.delta(k, v, AS.value(k, p.s)) : null;
          const miss = missesTarget(k, v);
          return `<td class="num${miss ? ' cell-miss' : ''}"${miss ? ` title="Target ${esc(fmt(k, M[k].target))}"` : ''}>${miss ? ic('alert', 'sm') : ''}${esc(fmt(k, v))}${d ? `<small>${esc(d.text)}</small>` : ''}</td>`;
        }).join('');
        return `<tr><th scope="row">${esc(g.name)}</th>${cells}<td><span class="status ${status[0]}">${ic(status[1], 'sm')}${status[2]}</span></td></tr>`;
      }).join('');
      el.innerHTML = `<header class="w-h"><div><h3>${esc(w.title)}</h3><p>Change is against the ${esc(Intent.compareLabel(s))}. Alert icons mark a measure that misses its target.</p></div></header><div class="tw"><table class="dt score"><thead><tr><th scope="col">${esc(Intent.dimName(w.by)[0].toUpperCase() + Intent.dimName(w.by).slice(1))}</th>${cols.map((k) => `<th class="num" scope="col">${esc(M[k].short)}</th>`).join('')}<th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      return el;
    },

    heat(w, s) {
      const bks = AS.buckets(s.range, s.grain);
      const key = w.metric;
      const shown = bks.slice(-16);
      const raw = AS.series(Intent.filterOf(s), key, shown, w.by);
      if (!raw.length) return null;
      const rows = raw.map((r) => ({ name: r.name, values: r.values, avg: r.values.filter((v) => v != null).reduce((a, b, _, arr) => a + b / arr.length, 0) })).sort((a, b) => a.avg - b.avg);
      const table = { columns: ['Technician', ...shown.map((b) => b.label)], rows: rows.map((r) => [r.name, ...r.values.map((v) => fmt(key, v))]) };
      const { el, body } = card(w, { sub: `Lowest average first. ${shown.length < bks.length ? `Latest ${shown.length} periods.` : ''}`, table });
      Charts.heatmap(body, { rows, cols: shown.map((b) => b.label), mid: M[key].target, span: 0.25, fmt: (v) => fmt(key, v), metricName: M[key].label });
      return el;
    },

    drivers(w, s) {
      const key = w.metric;
      const pf = Intent.prevFilterOf(s);
      if (!pf) return null;
      const f2 = driverFmt(key);
      const all = AS.drivers(Intent.filterOf(s), pf, key, w.by).filter((r) => Math.abs(r.contribution) > 1e-6);
      if (!all.length) return null;
      const sorted = M[key].up ? all : all.slice().reverse();
      const rows = sorted.slice(0, 8).map((r) => ({
        name: r.name, value: r.contribution, good: r.contribution > 0 === M[key].up,
        detail: `${fmt(key, r.prev)} before, ${fmt(key, r.cur)} now`,
      }));
      const table = { columns: [Intent.dimName(w.by)[0].toUpperCase() + Intent.dimName(w.by).slice(1), 'Before', 'Now', 'Contribution'], rows: all.map((r) => [r.name, fmt(key, r.prev), fmt(key, r.cur), f2(r.contribution)]) };
      const { el, body } = card(w, { sub: all.length > 8 ? `Largest 8 of ${all.length}, weakest first` : 'Weakest first', table });
      Charts.diverging(body, { rows, fmt: f2 });
      return el;
    },

    attention(w, s) {
      const items = attentionItems(s);
      const el = document.createElement('section');
      el.className = `w s${w.span}`;
      const list = items.length
        ? items.map((it) => `<button class="att" data-a="ask" data-v="${esc(it.ask)}"><span class="status ${it.sev}">${ic('alert', 'sm')}${it.sev === 'crit' ? 'Below' : 'Watch'}</span><span class="att-t">${esc(it.text)}</span>${ic('right', 'sm')}</button>`).join('')
        : `<div class="att-empty">${ic('check', 'sm')} Nothing is more than 3% off target.</div>`;
      el.innerHTML = `<header class="w-h"><div><h3>${esc(w.title)}</h3><p>Largest gaps to target. Select one to see why.</p></div></header><div class="w-b att-list">${list}</div>`;
      return el;
    },

    leak(w, s) {
      const l = AS.leakage(Intent.filterOf(s));
      const el = document.createElement('section');
      el.className = 'w s12 leak';
      const applied = window.Workshop.canUndo();
      const option = (title, gbp, lines, cta, ask) => `<button class="leak-o" data-a="ask" data-v="${esc(ask)}"><span class="leak-ot">${esc(title)}</span><span class="leak-ov">${esc(AS.approx(gbp))}<small> a week</small></span>${lines.map((x) => `<span class="leak-ol">${esc(x)}</span>`).join('')}<span class="leak-cta">${ic('sparks', 'sm')}${esc(cta)}${ic('arrow', 'sm')}</span></button>`;
      el.innerHTML = `<div class="leak-s"><h3>${esc(w.title)}</h3><div class="leak-n">${esc(AS.approx(l.perWeek))}<small> a week</small></div><p>Estimated labour sales lost to avoidable idle time, ${esc(s.range.label.toLowerCase())}.</p>${applied ? `<p class="leak-done">${ic('check', 'sm')}A plan is live in the diary. This figure is history, so it won't move until new jobs close.</p>` : ''}</div>
      ${option('Workbays', l.bay.perWeek, [`${Math.round(l.bay.hrs).toLocaleString('en-GB')} technician hours lost to blocked bays`, 'Vehicles parked on ramps with nobody working on them'], 'Show me the fix', 'Fix my workbays')}
      ${option('Technician optimisation', l.tech.perWeek, [`${Math.round(l.tech.noJobHrs).toLocaleString('en-GB')} hours attended with no job allocated`, `${Math.round(l.tech.effHrs).toLocaleString('en-GB')} hours clocked but not sold`], 'Show me the fix', 'Fix my technician allocation')}`;
      return el;
    },

    bayuse(w, s) {
      const l = AS.leakage(Intent.filterOf(s));
      const rows = l.bays.slice().sort((a, b) => b.blocked / b.open - a.blocked / a.open);
      const table = { columns: ['Bay', 'Working', 'Blocked', 'Empty'], rows: rows.map((b) => [b.label, Math.round(b.working) + ' h', Math.round(b.blocked) + ' h', Math.round(b.empty) + ' h']) };
      const { el, body } = card(w, { sub: 'Share of open hours', table });
      Charts.stackRows(body, {
        rows: rows.map((b) => ({ name: s.branch != null ? b.name : b.label, values: [b.working, b.blocked, b.empty] })),
        series: [{ name: 'Working', color: Charts.COLORS[0] }, { name: 'Blocked', color: Charts.COLORS[1] }, { name: 'Empty', color: Charts.DIM }],
        limit: 10, labelSeries: 1,
      });
      return el;
    },

    techleak(w, s) {
      const l = AS.leakage(Intent.filterOf(s));
      const rows = l.rows.map((r) => ({ name: r.name, value: r.bayGbp + r.techGbp, r })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
      const table = { columns: ['Technician', 'Blocked bay', 'No job', 'Not sold', 'Lost sales'], rows: rows.map((x) => [x.name, Math.round(x.r.blocked) + ' h', Math.round(x.r.noJob) + ' h', Math.round(x.r.eff) + ' h', fmtFull('sales', x.value)]) };
      const { el, body } = card(w, { sub: `Over ${s.range.label.toLowerCase()}. Apprentices are excluded from the efficiency part.`, table });
      Charts.rankBars(body, { rows, fmt: (v) => fmt('sales', v), limit: 10, metricName: 'Lost labour sales' });
      return el;
    },

    forward(w) {
      const c = window.Workshop.capacity();
      const el = document.createElement('section');
      el.className = `w s${w.span}`;
      el.innerHTML = `<header class="w-h"><div><h3>${esc(w.title)}</h3><p>Branch 1 main diary</p></div></header><div class="w-b fw"><div class="fw-n">${c.unallocated}</div><div class="fw-l">unallocated jobs, ${c.unallocatedToday} due today</div><div class="fw-s">${c.absentToday.length} technicians away today</div><button class="btn s" data-a="go-planner">Open planner ${ic('arrow', 'sm')}</button></div>`;
      return el;
    },

    'capacity-head'() {
      const c = window.Workshop.capacity();
      const el = document.createElement('section');
      el.className = 'w s12 w-head';
      const avail = c.days.reduce((a, d) => a + d.avail, 0);
      el.innerHTML = `<div class="spark">${ic('spark', 'sm')}</div><div><div class="head-t">${c.unallocated} jobs (${c.unallocatedHrs.toFixed(1)} hours) are still unallocated, and ${c.unallocatedToday} of them are due today.</div><div class="head-d">${c.absentToday.length} technicians are away today. The diary shows ${Math.round(avail).toLocaleString('en-GB')} technician hours available over the next 14 days. Only the Branch 1 main diary is included.</div></div>`;
      return el;
    },

    'capacity-chart'(w) {
      const c = window.Workshop.capacity();
      const labels = c.days.map((d) => AS.fmtShort(d.n));
      const series = [{ name: 'Hours available', color: Charts.COLORS[0], values: c.days.map((d) => d.avail) }, { name: 'Unallocated hours', color: Charts.COLORS[1], values: c.days.map((d) => d.unallocHrs) }];
      const table = { columns: ['Day', 'Hours available', 'Unallocated hours', 'Unallocated jobs', 'Technicians away'], rows: c.days.map((d, i) => [labels[i], d.avail.toFixed(1), d.unallocHrs.toFixed(1), String(d.unallocJobs), String(d.absent.length)]) };
      const { el, body } = card(w, { sub: 'Hours are from technician shifts, less absences', table });
      Charts.columns(body, { labels, series, grouped: true, fmt: (v) => v.toFixed(1) + ' h', axisFmt: (v) => String(Math.round(v)), aria: w.title, height: 240 });
      return el;
    },

    'capacity-absent'(w) {
      const c = window.Workshop.capacity();
      const el = document.createElement('section');
      el.className = `w s${w.span}`;
      const days = c.days.filter((d) => d.absent.length);
      el.innerHTML = `<header class="w-h"><div><h3>${esc(w.title)}</h3><p>Away for four hours or more</p></div></header><div class="w-b away">${days.map((d) => `<div><b>${esc(AS.fmtShort(d.n))}</b><span>${d.absent.map(esc).join(', ')}</span></div>`).join('') || '<div>Nobody is away.</div>'}<button class="btn s" data-a="go-planner" style="align-self:flex-start">Open planner ${ic('arrow', 'sm')}</button></div>`;
      return el;
    },
  };

  /* ---------- filters and shell ---------- */
  function filterRow(s, spec) {
    if (spec.forward) return '<span class="df-note">Today forward, from the live diary</span>';
    const presets = Object.values(Intent.PRESETS).map((p) => p());
    const custom = !s.range.key;
    const opts = (custom ? `<option value="custom" selected>${esc(s.range.label)}</option>` : '') + presets.map((p) => `<option value="${p.key}" ${s.range.key === p.key ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
    const branch = ['<option value="">All branches</option>', ...AS.BRANCHES.map((b, i) => `<option value="${i}" ${s.branch === i ? 'selected' : ''}>${esc(b)}</option>`)].join('');
    const cmp = `<option value="previous" ${s.compare === 'previous' ? 'selected' : ''}>Previous period</option><option value="year" ${s.compare === 'year' ? 'selected' : ''}>Same period last year</option>`;
    const chips = spec.chips.map((c) => `<span class="df-chip">${esc(c)}</span>`).join('');
    return `<label class="df"><span>Period</span><select data-df="range">${opts}</select></label><label class="df"><span>Branch</span><select data-df="branch">${branch}</select></label><label class="df"><span>Compare with</span><select data-df="compare">${cmp}</select></label>${chips ? `<span class="df-chips">${chips}<button class="df-clear" data-a="df-clear">Clear</button></span>` : ''}<span class="df-range">${esc(AS.rangeText(s.range))}</span>`;
  }

  function provenance(s, spec) {
    if (spec.forward) return `<footer class="prov">${ic('lock', 'sm')}<span>Read from the Technician planner. Sample data.</span></footer>`;
    const cur = AS.summary(Intent.filterOf(s));
    const used = new Set();
    spec.widgets.forEach((w) => { if (w.metric) used.add(w.metric); (w.metrics || []).forEach((k) => used.add(k)); });
    const pr = AS.prevRange(s.range, s.compare);
    const defs = [...used].map((k) => `<li><b>${esc(M[k].label)}:</b> ${esc(M[k].def)}${M[k].target != null ? ` Demo target ${esc(fmt(k, M[k].target))}.` : ''}</li>`).join('');
    return `<footer class="prov">${ic('lock', 'sm')}<span>Built from ${cur.jobs.toLocaleString('en-GB')} job cards, ${esc(AS.rangeText(s.range))}${pr ? `, compared with ${esc(AS.rangeText(pr))}` : ''}. Sample data. Dashboards don't change anything.</span><details><summary>How these are calculated</summary><ul>${defs}</ul></details></footer>`;
  }

  function header(s, spec) {
    return `<div class="d-top"><div><h1>${esc(spec.title)}</h1><p class="d-q">${ic('spark', 'sm')}<span>${esc(s.question || 'Built by AI Assistance')}</span></p></div><span class="sp"></span><button class="btn s ghost" data-a="go-planner">${ic('back', 'sm')} Technician planner</button></div><form class="d-filters" id="d-filters" aria-label="Dashboard filters">${filterRow(s, spec)}</form>`;
  }

  function skeleton(mount, s, spec) {
    const cells = spec.widgets.map((w) => {
      if (w.type === 'headline' || w.type === 'capacity-head') return '<div class="sk s12" style="height:76px"></div>';
      if (w.type === 'kpis') return '<div class="sk s12" style="height:112px"></div>';
      return `<div class="sk s${w.span}" style="height:${w.type === 'scorecard' ? 170 : 290}px"></div>`;
    }).join('');
    mount.innerHTML = `<div class="dash" id="dash">${header(s, spec)}<div class="d-grid">${cells}</div></div>`;
  }

  function render(mount, s, spec, animate) {
    const scroller = mount.querySelector('#dash');
    const top = scroller ? scroller.scrollTop : 0;
    mount.innerHTML = `<div class="dash" id="dash">${header(s, spec)}<div class="d-grid" id="d-grid"></div>${provenance(s, spec)}</div>`;
    const grid = mount.querySelector('#d-grid');
    let order = 0;
    spec.widgets.forEach((w) => {
      const el = W[w.type] ? W[w.type](w, s) : null;
      if (!el) return;
      if (animate) { el.classList.add('rise'); el.style.animationDelay = `${order++ * 70}ms`; }
      grid.appendChild(el);
    });
    if (!animate) mount.querySelector('#dash').scrollTop = top;
  }

  /** Short facts for the chat result card. */
  function resultStats(s, spec) {
    const k = spec.widgets.find((w) => w.type === 'kpis');
    const keys = k ? k.metrics.slice(0, 3) : [];
    if (!keys.length) return [];
    const cur = AS.summary(Intent.filterOf(s));
    return keys.map((key) => ({ label: M[key].short, value: fmt(key, AS.value(key, cur)) }));
  }

  /** Suggested next questions, chosen from what the data currently shows. */
  function followUps(s) {
    const out = [];
    // Stay on the subject of the question where it has a target; otherwise suggest the biggest gap.
    const worst = s.focus && M[s.focus].target != null ? s.focus : Intent.worstMetric(s);
    const topic = s.topics[0];
    if (topic === 'capacity') return ['How is my aftersales performing?', 'Which technicians are under-utilised?'];
    if (topic !== 'why') out.push(`Why is ${lower(worst)} ${badWord(worst)}?`);
    const split = s.branch == null ? worstGroup(s, worst) : null;
    if (split && topic !== 'why' && s.tech == null) out.push(`Just ${split.worst.name}`);
    if (topic === 'overview' || topic === 'leakage') out.unshift('Fix my workbays and technicians');
    if (topic === 'overview') out.push('Break this down by technician');
    if (topic === 'why' && s.branch == null) out.push(`Show ${lower(s.focus)} by technician`);
    if (s.compare !== 'year' && AS.prevRange(s.range, 'year')) out.push('Compare with last year');
    if (!out.length || topic === 'why') out.push("What's coming up in the planner?");
    return out.slice(0, 3);
  }

  return { render, skeleton, narrate, resultStats, followUps };
})();
