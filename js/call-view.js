/*
 * What the room sees of the call: the incoming-call card, the call view in the main
 * area, and the strip that follows the call over the planner once the job is booked.
 * Everything here reacts to Call events, never to the script itself.
 */
window.CallView = (function () {
  'use strict';

  const Call = window.Call;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const main = () => document.getElementById('main');
  const onCall = () => window.App.view() === 'call';
  const st = () => Call.state();

  let ringTimer = null;
  let stripTimer = null;
  let stripGone = false;

  /* ---------- the incoming-call card ---------- */

  function ringHtml(caller, answering) {
    const car = caller.car;
    const out = st().direction === 'outbound';
    const carLine = car ? `<div class="ring-car"><span class="plate">${esc(car.reg)}</span>${esc(car.registered.slice(0, 4))} ${esc(car.make)} ${esc(car.model)}${out ? '' : ` · last in ${esc(window.Matching.dayShort(car.visits[car.visits.length - 1][0]).split(' ').slice(2).join(' '))}`}</div>` : '';
    if (out) {
      return `<div class="ring-top"><span class="ring-ic out">${ic('phone')}</span><div><b>Calling ${esc(caller.name)}</b><span>${esc(caller.phone)} · outgoing, approved by you</span></div></div>
        ${carLine}<div class="ring-acts"><span class="ring-agent on">${ic('spark', 'sm')} The AI agent is calling…</span></div>`;
    }
    return `<div class="ring-top"><span class="ring-ic">${ic('phone')}</span><div><b>Incoming call</b><span>${esc(caller.phone)} · matched to ${esc(caller.name)}</span></div></div>
      ${carLine}
      <div class="ring-acts"><span class="ring-agent ${answering ? 'on' : ''}">${answering ? `${ic('spark', 'sm')} AI agent answering…` : 'Ringing…'}</span><button class="btn s" data-a="call-take">Take the call myself</button></div>`;
  }

  function showRing(caller) {
    let el = document.getElementById('call-ring');
    if (!el) {
      el = document.createElement('div');
      el.id = 'call-ring';
      el.className = 'ring';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.classList.remove('out');
    el.innerHTML = ringHtml(caller, false);
    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => { if (st().status === 'ringing') el.innerHTML = ringHtml(caller, true); }, 2200 / st().speed);
  }

  function hideRing() {
    clearTimeout(ringTimer);
    const el = document.getElementById('call-ring');
    if (!el) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }

  /* ---------- the call view ---------- */

  const who = (speaker) => (speaker === 'agent' ? 'AI agent' : st().caller.title);

  function entryHtml(e, i) {
    if (e.kind === 'action') return `<div class="tx-act ${e.done ? 'done' : ''}" data-i="${i}">${e.done ? ic('check', 'sm') : '<span class="spin"></span>'}<span>${esc(e.note)}</span></div>`;
    return `<div class="tx-line ${e.speaker}" data-i="${i}"><small>${esc(who(e.speaker))}</small><span class="tx-t">${esc(e.text)}</span></div>`;
  }

  function speakingHtml() {
    const s = st().speaking;
    return s ? `<div class="tx-speaking ${s}"><i></i><i></i><i></i><span>${esc(who(s))} is speaking</span></div>` : '';
  }

  function statusBadge() {
    const s = st();
    if (s.status === 'ended') return `<span class="live off">Call ended</span>`;
    if (s.paused) return `<span class="live paused">Paused</span>`;
    return `<span class="live">${s.status === 'ringing' ? 'Ringing' : 'Live'}</span>`;
  }

  function render(mount) {
    const s = st();
    const c = s.caller;
    if (!c) { mount.innerHTML = '<div class="call-v"><p class="call-none">No call yet. Click <b>Simulate incoming call</b> in AI Assistance.</p></div>'; return; }
    mount.innerHTML = `<div class="call-v">
      <div class="call-h">${statusBadge()}<b>${esc(c.name)}</b><span class="muted">${esc(c.phone)} · <span data-call-timer>${Call.clock(Call.elapsed())}</span></span><span class="sp"></span><span class="call-by">${ic('spark', 'sm')} ${s.direction === 'outbound' ? 'Outgoing call by the AI agent' : 'Handled by the AI agent'}</span></div>
      <div class="call-tx" id="call-tx" aria-live="polite">${s.entries.map(entryHtml).join('')}<div class="tx-tail">${speakingHtml()}</div></div>
      <div class="call-f"><button class="btn s" data-a="call-pause" ${s.status === 'ended' ? 'disabled' : ''}>${ic(s.paused ? 'play' : 'pause', 'sm')} ${s.paused ? 'Resume' : 'Pause'}</button><button class="btn s" data-a="call-restart">${ic('restart', 'sm')} Restart</button><span class="sp"></span><span class="muted">Simulated call. No sound.</span></div>
    </div>`;
    scrollDown(true);
  }

  function scrollDown(instant) {
    const tx = document.getElementById('call-tx');
    if (tx) tx.scrollTo({ top: tx.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
  }

  /** Types a line out over its speaking time, so the transcript keeps pace with the call. */
  function typeOut(node, text, ms) {
    const t0 = performance.now();
    node.textContent = '';
    const tick = () => {
      if (!node.isConnected) return;
      const n = Math.min(text.length, Math.ceil(((performance.now() - t0) / ms) * text.length));
      node.textContent = text.slice(0, n);
      if (n % 12 === 0) scrollDown();
      if (n < text.length) requestAnimationFrame(tick);
      else scrollDown();
    };
    requestAnimationFrame(tick);
  }

  function appendEntry(e) {
    const tx = document.getElementById('call-tx');
    if (!tx || !onCall()) return;
    const i = st().entries.indexOf(e);
    const t = document.createElement('template');
    t.innerHTML = entryHtml(e, i);
    const node = t.content.firstElementChild;
    node.classList.add('pop');
    tx.insertBefore(node, tx.querySelector('.tx-tail'));
    if (e.kind === 'line') typeOut(node.querySelector('.tx-t'), e.text, e.ms);
    updateTail();
    scrollDown();
  }

  function updateEntry(e) {
    const i = st().entries.indexOf(e);
    const node = document.querySelector(`#call-tx [data-i="${i}"]`);
    if (!node) return;
    const t = document.createElement('template');
    t.innerHTML = entryHtml(e, i);
    node.replaceWith(t.content.firstElementChild);
  }

  function updateTail() {
    const tail = document.querySelector('#call-tx .tx-tail');
    if (tail) tail.innerHTML = speakingHtml();
    const h = document.querySelector('.call-h .live');
    if (h) h.outerHTML = statusBadge();
  }

  /* ---------- the strip over the planner ---------- */

  function stripHtml() {
    const s = st();
    const last = [...s.entries].reverse().find((e) => e.kind === 'line');
    const line = s.speaking ? `<span class="tx-speaking ${s.speaking}"><i></i><i></i><i></i></span><span>${esc(who(s.speaking))} is speaking</span>`
      : last ? `<b>${esc(who(last.speaker))}:</b> <span class="strip-t">${esc(last.text)}</span>` : '';
    return `${statusBadge()}<b class="strip-n">${esc(s.caller.name)}</b><span class="muted" data-call-timer>${Call.clock(Call.elapsed())}</span><span class="strip-line">${line}</span><button class="btn s" data-a="call-open">${ic('phone', 'sm')} Open call</button>`;
  }

  /** Shows the strip whenever a call is on but the call view isn't, until a few seconds after it ends. */
  function sync() {
    const s = st();
    const content = document.querySelector('.content');
    let strip = document.getElementById('call-strip');
    const want = s.caller && !onCall() && !stripGone && (s.status === 'live' || s.status === 'ended');
    if (!want) { if (strip) strip.remove(); return; }
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'call-strip';
      strip.className = 'call-strip';
      strip.setAttribute('role', 'status');
      content.appendChild(strip);
    }
    strip.classList.toggle('ended', s.status === 'ended');
    strip.innerHTML = stripHtml();
  }

  /* ---------- wiring ---------- */

  Call.on('ringing', (caller) => { stripGone = false; clearTimeout(stripTimer); showRing(caller); });
  Call.on('answered', () => { hideRing(); window.App.showCall(); });
  Call.on('speaking', () => { if (onCall()) updateTail(); sync(); });
  Call.on('line', (e) => { appendEntry(e); sync(); });
  Call.on('action', (e) => { appendEntry(e); sync(); });
  Call.on('update', (e) => { updateEntry(e); sync(); });
  Call.on('paused', () => { if (onCall()) render(main()); sync(); });
  Call.on('reset', () => { hideRing(); stripGone = false; sync(); });
  Call.on('ended', () => {
    if (onCall()) render(main());
    sync();
    clearTimeout(stripTimer);
    stripTimer = setTimeout(() => {
      stripGone = true;
      const strip = document.getElementById('call-strip');
      if (strip) { strip.classList.add('out'); setTimeout(sync, 260); }
    }, 6000 / st().speed);
  });

  // The call timer, wherever it's showing.
  setInterval(() => {
    if (!Call.live()) return;
    document.querySelectorAll('[data-call-timer]').forEach((el) => { el.textContent = Call.clock(Call.elapsed()); });
  }, 500);

  return { render, sync };
})();
