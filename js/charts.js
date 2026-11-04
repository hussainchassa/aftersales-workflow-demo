/*
 * Small SVG and HTML chart library.
 * Marks follow one spec: 2px lines, bars at most 24px with a 4px rounded data end,
 * a 2px surface gap between fills, hairline grid, and a tooltip on every mark.
 * Palette validated with the dataviz CVD checker. Slots below 3:1 contrast are
 * backed by direct labels and the table view on each widget.
 */
window.Charts = (function () {
  'use strict';

  const COLORS = ['#6a3fc2', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  const DIM = '#c9c7d3';
  const POS = '#6a3fc2';
  const NEG = '#eb6834';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- tooltip ---------- */
  const tipEl = () => document.getElementById('tip');
  function showTip(evtOrRect, title, rows) {
    const tip = tipEl();
    tip.textContent = '';
    const t = document.createElement('div');
    t.className = 'tip-t';
    t.textContent = title;
    tip.appendChild(t);
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'tip-r';
      if (r.color) {
        const key = document.createElement('i');
        key.style.background = r.color;
        row.appendChild(key);
      }
      const v = document.createElement('b');
      v.textContent = r.value;
      row.appendChild(v);
      const n = document.createElement('span');
      n.textContent = r.name;
      row.appendChild(n);
      tip.appendChild(row);
    });
    tip.hidden = false;
    const x = evtOrRect.clientX != null ? evtOrRect.clientX : evtOrRect.left + evtOrRect.width / 2;
    const y = evtOrRect.clientY != null ? evtOrRect.clientY : evtOrRect.top;
    const box = tip.getBoundingClientRect();
    const left = x + 14 + box.width > innerWidth - 8 ? x - box.width - 14 : x + 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - box.height - 8, y - box.height / 2)) + 'px';
  }
  const hideTip = () => { tipEl().hidden = true; };

  /* ---------- helpers ---------- */
  function responsive(el, draw) {
    let last = 0;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0 && w !== last) { last = w; draw(w); }
    });
    ro.observe(el);
  }

  function ticks(lo, hi, count) {
    const span = hi - lo || Math.abs(hi) || 1;
    const raw = span / (count || 4);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const r = raw / mag;
    const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step * 0.001; v += step) out.push(Number(v.toFixed(6)));
    return out;
  }

  function legend(items, kind) {
    return `<div class="legend">${items.map((it) => `<span><i class="${kind === 'line' ? 'k-line' : 'k-rect'}" style="background:${it.color}"></i>${esc(it.name)}</span>`).join('')}</div>`;
  }

  /** Thin the x labels so they never collide. */
  function xLabelStep(n, w, labels) {
    const longest = Math.max(...labels.map((l) => String(l).length)) * 6.6 + 10;
    return Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / longest))));
  }

  const roundTop = (x, y, w, h, r) => {
    const rad = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + rad}Q${x},${y} ${x + rad},${y}H${x + w - rad}Q${x + w},${y} ${x + w},${y + rad}V${y + h}Z`;
  };

  /* ---------- line ---------- */
  function line(el, o) {
    const H = o.height || 220;
    const multi = o.series.length > 1;
    el.innerHTML = '<div class="plot"></div>' + (multi ? legend(o.series, 'line') : '');
    const plot = el.querySelector('.plot');
    responsive(plot, (W) => {
      const vals = o.series.flatMap((s) => s.values).filter((v) => v != null);
      if (o.target) vals.push(o.target.value);
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.12;
      lo -= pad; hi += pad;
      if (o.zeroBase) lo = 0;
      const ts = ticks(lo, hi, 4);
      lo = ts[0]; hi = ts[ts.length - 1];
      const labelled = o.series.length <= 3;
      const m = { l: 46, r: labelled ? (multi ? 96 : 54) : 12, t: 10, b: 24 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const n = o.labels.length;
      const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
      const step = xLabelStep(n, iw, o.labels);

      let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}" tabindex="0">`;
      ts.forEach((t) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(o.axisFmt(t))}</text>`; });
      o.labels.forEach((l, i) => {
        if ((n - 1 - i) % step === 0) s += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`;
      });
      if (o.target) {
        s += `<line class="target" x1="${m.l}" x2="${W - m.r}" y1="${y(o.target.value)}" y2="${y(o.target.value)}"/><text class="ax tgt" x="${m.l + 4}" y="${y(o.target.value) - 5}">${esc(o.target.label)}</text>`;
      }
      o.series.forEach((sr) => {
        let d = '';
        let pen = false;
        sr.values.forEach((v, i) => {
          if (v == null) { pen = false; return; }
          d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
        });
        if (!multi) {
          const first = sr.values.findIndex((v) => v != null);
          s += `<path d="${d}L${x(n - 1)},${m.t + ih}L${x(first)},${m.t + ih}Z" fill="${sr.color}" opacity=".1"/>`;
        }
        s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      });
      // End labels: a label that would collide with its neighbour is left to the legend.
      const ends = o.series
        .map((sr) => { const i = sr.values.length - 1; return { sr, v: sr.values[i], i }; })
        .filter((e) => e.v != null)
        .sort((a, b) => y(a.v) - y(b.v));
      let lastY = -99;
      ends.forEach((e) => {
        s += `<circle cx="${x(e.i)}" cy="${y(e.v)}" r="4" fill="${e.sr.color}" stroke="#fff" stroke-width="2"/>`;
        if (labelled && y(e.v) - lastY >= 14) {
          s += `<text class="end" x="${x(e.i) + 9}" y="${y(e.v) + 4}">${esc(multi ? e.sr.name.replace('Branch ', 'B') + ' ' : '')}${esc(o.fmt(e.v))}</text>`;
          lastY = y(e.v);
        }
      });
      s += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/><g class="cross-dots"></g>`;
      s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
      plot.innerHTML = s;

      const svg = plot.querySelector('svg');
      const cross = svg.querySelector('.cross');
      const dots = svg.querySelector('.cross-dots');
      let cur = n - 1;
      const paint = (i, at) => {
        cur = i;
        cross.setAttribute('x1', x(i));
        cross.setAttribute('x2', x(i));
        cross.setAttribute('visibility', 'visible');
        dots.innerHTML = o.series.map((sr) => (sr.values[i] == null ? '' : `<circle cx="${x(i)}" cy="${y(sr.values[i])}" r="4" fill="${sr.color}" stroke="#fff" stroke-width="2"/>`)).join('');
        showTip(at, o.labels[i], o.series.map((sr) => ({ color: sr.color, name: sr.name, value: o.fmt(sr.values[i]) })));
      };
      const clear = () => { cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; hideTip(); };
      svg.querySelector('.hit').addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const i = n === 1 ? 0 : Math.round(((e.clientX - r.left - m.l) / iw) * (n - 1));
        paint(Math.max(0, Math.min(n - 1, i)), e);
      });
      svg.querySelector('.hit').addEventListener('pointerleave', clear);
      svg.addEventListener('blur', clear);
      svg.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        const next = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
        paint(next, { clientX: r.left + x(next), clientY: r.top + 40 });
      });
    });
  }

  /* ---------- columns, stacked or grouped ---------- */
  function columns(el, o) {
    const H = o.height || 220;
    const multi = o.series.length > 1;
    el.innerHTML = '<div class="plot"></div>' + (multi ? legend(o.series, 'rect') : '');
    const plot = el.querySelector('.plot');
    responsive(plot, (W) => {
      const n = o.labels.length;
      const totals = o.labels.map((_, i) => o.series.reduce((a, s) => a + (s.values[i] || 0), 0));
      const max = o.grouped ? Math.max(...o.series.flatMap((s) => s.values)) : Math.max(...totals);
      const ts = ticks(0, max || 1, 4);
      const top = ts[ts.length - 1];
      const m = { l: 46, r: 8, t: 16, b: 24 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const band = iw / n;
      const y = (v) => m.t + ih - (v / top) * ih;
      const step = xLabelStep(n, iw, o.labels);
      let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}">`;
      ts.forEach((t) => { s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(o.axisFmt(t))}</text>`; });
      o.labels.forEach((l, i) => {
        const cx = m.l + band * (i + 0.5);
        if ((n - 1 - i) % step === 0) s += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`;
        if (o.grouped) {
          const bw = Math.min(24, (band * 0.8 - 2 * (o.series.length - 1)) / o.series.length);
          o.series.forEach((sr, si) => {
            const v = sr.values[i] || 0;
            if (v <= 0) return;
            const bx = cx - (bw * o.series.length + 2 * (o.series.length - 1)) / 2 + si * (bw + 2);
            s += `<path d="${roundTop(bx, y(v), bw, y(0) - y(v), 4)}" fill="${sr.color}"/>`;
          });
        } else {
          const bw = Math.min(24, band * 0.66);
          let base = 0;
          const present = o.series.filter((sr) => (sr.values[i] || 0) > 0);
          present.forEach((sr, si) => {
            const v = sr.values[i];
            const y1 = y(base + v);
            const h = Math.max(1, y(base) - y1 - (si < present.length - 1 ? 2 : 0));
            const yy = si < present.length - 1 ? y1 + 2 : y1;
            s += si === present.length - 1
              ? `<path d="${roundTop(cx - bw / 2, yy, bw, h, 4)}" fill="${sr.color}"/>`
              : `<rect x="${cx - bw / 2}" y="${yy}" width="${bw}" height="${Math.max(1, y(base) - yy)}" fill="${sr.color}"/>`;
            base += v;
          });
        }
        if (i === n - 1 && !o.grouped) s += `<text class="end" x="${cx}" y="${y(totals[i]) - 5}" text-anchor="middle">${esc(o.fmt(totals[i]))}</text>`;
        s += `<rect class="band" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" tabindex="0" aria-label="${esc(l)}"/>`;
      });
      s += '</svg>';
      plot.innerHTML = s;
      const show = (rect, at) => {
        const i = Number(rect.dataset.i);
        const rows = o.series.map((sr) => ({ color: sr.color, name: sr.name, value: o.fmt(sr.values[i] || 0) }));
        if (multi && !o.grouped) rows.push({ name: 'Total', value: o.fmt(totals[i]) });
        showTip(at, o.labels[i], rows);
      };
      plot.querySelectorAll('.band').forEach((b) => {
        b.addEventListener('pointermove', (e) => { b.classList.add('on'); show(b, e); });
        b.addEventListener('pointerleave', () => { b.classList.remove('on'); hideTip(); });
        b.addEventListener('focus', () => { b.classList.add('on'); show(b, b.getBoundingClientRect()); });
        b.addEventListener('blur', () => { b.classList.remove('on'); hideTip(); });
      });
    });
  }

  /* ---------- ranked bars (HTML, one baseline) ---------- */
  function rankBars(el, o) {
    const max = Math.max(...o.rows.map((r) => r.value), o.target ? o.target.value : 0) || 1;
    const pct = (v) => (v / max) * 100;
    const shown = o.limit ? o.rows.slice(0, o.limit) : o.rows;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'rank';
    if (o.target) wrap.style.setProperty('--tgt', pct(o.target.value) + '%');
    shown.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'rank-r';
      row.tabIndex = 0;
      const name = document.createElement('span');
      name.className = 'rank-n';
      name.textContent = r.name;
      name.title = r.name;
      const track = document.createElement('span');
      track.className = 'rank-t' + (o.target ? ' has-tgt' : '');
      const fill = document.createElement('i');
      fill.style.width = pct(r.value) + '%';
      fill.style.background = r.emph === false ? DIM : o.color || COLORS[0];
      track.appendChild(fill);
      const val = document.createElement('b');
      val.textContent = o.fmt(r.value);
      row.append(name, track, val);
      const rows = [{ color: fill.style.background, name: o.metricName, value: o.fmt(r.value) }];
      if (o.target) rows.push({ name: o.target.label, value: o.fmt(o.target.value) });
      row.addEventListener('pointermove', (e) => showTip(e, r.name, rows));
      row.addEventListener('pointerleave', hideTip);
      row.addEventListener('focus', () => showTip(row.getBoundingClientRect(), r.name, rows));
      row.addEventListener('blur', hideTip);
      wrap.appendChild(row);
    });
    el.appendChild(wrap);
    const notes = [];
    if (o.target) notes.push(o.target.label + ' marked on each row');
    if (o.emphNote) notes.push(o.emphNote);
    if (o.limit && o.rows.length > o.limit) notes.push(`${o.rows.length - o.limit} more in the table view`);
    if (notes.length) {
      const note = document.createElement('div');
      note.className = 'chart-note';
      note.textContent = notes.join(' · ');
      el.appendChild(note);
    }
  }

  /* ---------- stacked rows: one whole per row ---------- */
  function stackRows(el, o) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'rank';
    const shown = o.limit ? o.rows.slice(0, o.limit) : o.rows;
    shown.forEach((r) => {
      const total = r.values.reduce((a, b) => a + b, 0) || 1;
      const row = document.createElement('div');
      row.className = 'rank-r';
      row.tabIndex = 0;
      const name = document.createElement('span');
      name.className = 'rank-n';
      name.textContent = r.name;
      name.title = r.name;
      const track = document.createElement('span');
      track.className = 'stack-t';
      r.values.forEach((v, i) => {
        if (!v) return;
        const seg = document.createElement('i');
        seg.style.flex = `${v / total} 1 0`;
        seg.style.background = o.series[i].color;
        track.appendChild(seg);
      });
      const val = document.createElement('b');
      val.textContent = `${Math.round((r.values[o.labelSeries] / total) * 100)}%`;
      row.append(name, track, val);
      const rows = r.values.map((v, i) => ({ color: o.series[i].color, name: o.series[i].name, value: `${Math.round((v / total) * 100)}%` }));
      row.addEventListener('pointermove', (e) => showTip(e, r.name, rows));
      row.addEventListener('pointerleave', hideTip);
      row.addEventListener('focus', () => showTip(row.getBoundingClientRect(), r.name, rows));
      row.addEventListener('blur', hideTip);
      wrap.appendChild(row);
    });
    el.appendChild(wrap);
    el.insertAdjacentHTML('beforeend', legend(o.series, 'rect'));
    const note = document.createElement('div');
    note.className = 'chart-note';
    note.textContent = `Figure shows the ${o.series[o.labelSeries].name.toLowerCase()} share${o.limit && o.rows.length > o.limit ? ` · ${o.rows.length - o.limit} more in the table view` : ''}`;
    el.appendChild(note);
  }

  /* ---------- diverging bars ---------- */
  function diverging(el, o) {
    const max = Math.max(...o.rows.map((r) => Math.abs(r.value))) || 1;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'div';
    o.rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'div-r';
      row.tabIndex = 0;
      const name = document.createElement('span');
      name.className = 'rank-n';
      name.textContent = r.name;
      name.title = r.name;
      const track = document.createElement('span');
      track.className = 'div-t';
      const fill = document.createElement('i');
      const w = (Math.abs(r.value) / max) * 50;
      fill.style.width = w + '%';
      fill.style[r.value >= 0 ? 'left' : 'right'] = '50%';
      fill.className = r.value >= 0 ? 'pos' : 'neg';
      fill.style.background = r.good ? POS : NEG;
      track.appendChild(fill);
      const val = document.createElement('b');
      val.textContent = o.fmt(r.value);
      row.append(name, track, val);
      const rows = [{ color: fill.style.background, name: 'contribution to the change', value: o.fmt(r.value) }];
      if (r.detail) rows.push({ name: r.detail, value: '' });
      row.addEventListener('pointermove', (e) => showTip(e, r.name, rows));
      row.addEventListener('pointerleave', hideTip);
      row.addEventListener('focus', () => showTip(row.getBoundingClientRect(), r.name, rows));
      row.addEventListener('blur', hideTip);
      wrap.appendChild(row);
    });
    el.appendChild(wrap);
    el.insertAdjacentHTML('beforeend', legend([{ name: 'Helped', color: POS }, { name: 'Held it back', color: NEG }], 'rect'));
  }

  /* ---------- heatmap, diverging around a target ---------- */
  const mix = (a, b, t) => {
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
  };
  function heatmap(el, o) {
    const mid = o.mid;
    const span = o.span;
    const color = (v) => {
      if (v == null) return '#f7f7f9';
      const t = Math.max(-1, Math.min(1, (v - mid) / span));
      return t >= 0 ? mix('#f1f0f4', POS, t) : mix('#f1f0f4', NEG, -t);
    };
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'heat';
    wrap.style.gridTemplateColumns = `minmax(90px,130px) repeat(${o.cols.length}, minmax(26px,1fr))`;
    wrap.appendChild(document.createElement('span'));
    o.cols.forEach((c, i) => {
      const h = document.createElement('span');
      h.className = 'heat-c';
      h.textContent = i % Math.max(1, Math.ceil(o.cols.length / 8)) === (o.cols.length - 1) % Math.max(1, Math.ceil(o.cols.length / 8)) ? c : '';
      wrap.appendChild(h);
    });
    o.rows.forEach((r) => {
      const n = document.createElement('span');
      n.className = 'rank-n';
      n.textContent = r.name;
      n.title = r.name;
      wrap.appendChild(n);
      r.values.forEach((v, i) => {
        const cell = document.createElement('i');
        cell.className = 'heat-v';
        cell.tabIndex = 0;
        cell.style.background = color(v);
        const rows = [{ color: color(v), name: o.metricName, value: o.fmt(v) }];
        cell.addEventListener('pointermove', (e) => showTip(e, `${r.name} · ${o.cols[i]}`, rows));
        cell.addEventListener('pointerleave', hideTip);
        cell.addEventListener('focus', () => showTip(cell.getBoundingClientRect(), `${r.name} · ${o.cols[i]}`, rows));
        cell.addEventListener('blur', hideTip);
        wrap.appendChild(cell);
      });
    });
    el.appendChild(wrap);
    const low = o.fmt(mid - span);
    const high = o.fmt(mid + span);
    el.insertAdjacentHTML('beforeend', `<div class="heat-key"><span>${esc(low)} or below</span><i style="background:linear-gradient(90deg,${NEG},#f1f0f4,${POS})"></i><span>${esc(high)} or above</span><span class="muted">· grey is on target (${esc(o.fmt(mid))})</span></div>`);
  }

  /* ---------- tall segmented bar ---------- */
  function segBar(el, o) {
    const total = o.parts.reduce((a, p) => a + p.value, 0) || 1;
    const luminance = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    el.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'seg';
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', o.parts.map((p) => `${p.name} ${Math.round((p.value / total) * 100)}%`).join(', '));
    o.parts.forEach((p) => {
      const share = p.value / total;
      const part = document.createElement('i');
      part.style.flex = `${share} 1 0`;
      part.style.background = p.color;
      part.style.color = luminance(p.color) > 0.3 ? '#1d1b26' : '#fff';
      part.tabIndex = 0;
      if (share > 0.07) part.textContent = Math.round(share * 100) + '%';
      const rows = [{ color: p.color, name: `${Math.round(share * 100)}% of ${o.metricName.toLowerCase()}`, value: o.fmt(p.value) }];
      part.addEventListener('pointermove', (e) => showTip(e, p.name, rows));
      part.addEventListener('pointerleave', hideTip);
      part.addEventListener('focus', () => showTip(part.getBoundingClientRect(), p.name, rows));
      part.addEventListener('blur', hideTip);
      bar.appendChild(part);
    });
    el.appendChild(bar);
    el.insertAdjacentHTML('beforeend', legend(o.parts, 'rect'));
  }

  /* ---------- sparkline ---------- */
  function sparkline(values) {
    const pts = values.filter((v) => v != null);
    if (pts.length < 2) return '';
    const W = 120;
    const H = 26;
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const x = (i) => 2 + (i / (values.length - 1)) * (W - 8);
    const y = (v) => 4 + (hi === lo ? (H - 8) / 2 : (1 - (v - lo) / (hi - lo)) * (H - 8));
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    const lastI = values.length - 1;
    const last = values[lastI];
    // The line stretches to fit its tile, so the end dot is positioned in HTML to stay round.
    const dot = last == null ? '' : `<i class="spark-d" style="left:${(x(lastI) / W) * 100}%;top:${(y(last) / H) * 100}%;background:${COLORS[0]}"></i>`;
    return `<div class="spark-w" aria-hidden="true"><svg class="spark-l" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${DIM}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>${dot}</div>`;
  }

  return { COLORS, DIM, ticks, line, columns, rankBars, stackRows, diverging, heatmap, segBar, sparkline, hideTip };
})();
