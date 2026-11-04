/*
 * AI Assistance chat panel. The layout, message types and read-only stance follow
 * the Pinewood Accelerator prototype. Each answer shows its working, builds the
 * dashboard in the main area, then summarises it in the chat.
 */
window.Copilot = (function () {
  'use strict';

  const AS = window.AS;
  const Intent = window.Intent;
  const Dashboard = window.Dashboard;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const wait = (ms) => new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));

  const S = { open: false, messages: [], busy: false, state: null, resultSeq: 0, plan: null, returnTo: null };

  const STARTERS = [
    'Book an appointment',
    'How is my aftersales performing?',
    'Which technicians are under-utilised?',
    'Where am I losing money?',
    'Compare my branches',
    "What's coming up in the planner?",
  ];

  /**
   * The seam for a real model. Replace the body with a call that returns the same
   * object as Intent.interpret; the rest of the flow doesn't need to change.
   */
  async function plan(question, prevState) {
    return Intent.interpret(question, prevState);
  }

  const root = () => document.getElementById('chat');
  const body = () => document.getElementById('chat-b');

  function emptyHtml() {
    return `<div class="c-empty"><h2>Morning. What do you want to know?</h2>
      <div class="c-chips">${STARTERS.map((q) => `<button class="qchip" data-a="ask" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <p class="c-safe">${ic('lock', 'sm')}<span>I can read workshop data, build dashboards and plan improvements. The diary only changes when you approve a plan, and you can undo it. I can't post anything.</span></p></div>`;
  }

  function msgHtml(m) {
    if (m.role === 'u') return `<div class="msg-u">${esc(m.text)}</div>`;
    if (m.role === 'typing') return '<div class="msg-a"><span class="typing"><i></i><i></i><i></i></span></div>';
    if (m.kind === 'steps') {
      return `<div class="ccard steps" aria-live="polite">${m.steps.map((st, i) => {
        const state = i < m.at ? 'done' : i === m.at && !m.finished ? 'run' : m.finished ? 'done' : 'todo';
        return `<div class="step ${state}">${state === 'done' ? ic('check', 'sm') : state === 'run' ? '<span class="spin"></span>' : '<span class="dot"></span>'}<span>${esc(st)}</span></div>`;
      }).join('')}</div>`;
    }
    if (m.kind === 'plan') {
      const live = S.plan === m.plan && !m.plan.applied;
      return `<div class="ccard"><div class="c-result">${esc(m.plan.summary)}</div>
        <div class="kv3">${m.plan.stats.map((x) => `<div><span class="xs muted">${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>
        ${live && m.plan.changes.length ? `<div class="c-acts"><button class="btn s p" data-a="plan-apply">Apply ${m.plan.changes.length} changes</button><button class="btn s" data-a="plan-preview">Preview on planner</button></div>` : ''}
        <div class="safe">${ic('lock', 'sm')}${m.plan.applied ? 'You approved this plan.' : m.plan.changes.length ? 'Nothing has changed yet. You approve it first.' : 'Nothing has changed.'}</div></div>`;
    }
    if (m.kind === 'booking-form') return bookingFormHtml(m);
    if (m.kind === 'booking-extras') return extrasHtml(m);
    if (m.kind === 'booking-suggestion') return suggestionHtml(m);
    if (m.kind === 'applied') {
      return `<div class="ccard"><div class="c-result">${ic('check', 'sm')} Done. ${m.count === 1 ? '1 change is' : `${m.count} changes are`} in the diary.</div><div class="sm">${esc(m.detail)}</div>
        <ul class="c-log">${m.log.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${m.undone ? '<div class="sm muted">Undone.</div>' : `<div class="c-acts"><button class="btn s" data-a="plan-undo">Undo all</button><button class="btn s" data-a="go-dash">Back to the dashboard</button></div>`}
        <div class="safe">${ic('info', 'sm')}Approved by you at 09:42. Sample diary, so nothing leaves this demo.</div></div>`;
    }
    if (m.kind === 'result') {
      const showing = m.seq === S.resultSeq && window.App.view() === 'dashboard';
      return `<div class="ccard">
        <div class="c-result">${esc(m.title)}</div>
        ${m.detail ? `<div class="sm">${esc(m.detail)}</div>` : ''}
        ${m.stats.length ? `<div class="kv3">${m.stats.map((x) => `<div><span class="xs muted">${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>` : ''}
        ${m.notes.map((n) => `<div class="sm c-note">${ic('info', 'sm')}<span>${esc(n)}</span></div>`).join('')}
        ${showing ? '' : `<button class="btn s p" data-a="reopen" data-v="${m.seq}" style="align-self:flex-start">View this dashboard</button>`}
        <div class="safe">${ic('lock', 'sm')}Sample data. Nothing has changed.</div>
      </div>${m.chips.length ? `<div class="c-chips">${m.chips.map((q) => `<button class="qchip" data-a="ask" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}`;
    }
    return `<div class="msg-a col"><span>${rich(m.text)}</span>${m.planner ? `<button class="lnk" data-a="go-planner"><span>Open the Technician planner</span>${ic('right', 'sm')}</button>` : ''}${m.chips && m.chips.length ? `<div class="c-chips">${m.chips.map((q) => `<button class="qchip" data-a="ask" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}</div>`;
  }

  function paint(scroll) {
    const b = body();
    if (!b) return;
    const near = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
    b.innerHTML = S.messages.length ? S.messages.map(msgHtml).join('') : emptyHtml();
    if (scroll || near) b.scrollTop = b.scrollHeight;
    const send = root().querySelector('.send');
    if (send) send.disabled = S.busy;
  }

  function mount() {
    const ctx = window.App.view() === 'dashboard' ? 'Dashboard' : 'Technician planner';
    root().innerHTML = `<div class="chat-h"><div class="spark">${ic('spark', 'sm')}</div><b>AI Assistance</b><span class="ctx" id="chat-ctx">${esc(ctx)}</span><span class="sp"></span><button class="icbtn" data-a="chat" aria-label="Close AI Assistance">${ic('x')}</button></div>
      <div class="chat-b" id="chat-b" aria-live="polite"></div>
      <form class="chat-f" id="chat-f"><input name="q" placeholder="Ask about your aftersales" autocomplete="off" aria-label="Message"><button class="btn sq p send" aria-label="Send">${ic('send', 'sm')}</button></form>`;
    root().querySelector('#chat-f').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.target.q;
      const q = input.value.trim();
      if (!q || S.busy) return;
      input.value = '';
      send(q);
    });
    paint(true);
  }

  function setOpen(open) {
    S.open = open;
    const c = root();
    c.classList.toggle('hide', !open);
    const btn = document.getElementById('ai-btn');
    btn.setAttribute('aria-pressed', String(open));
    if (open) {
      if (!c.firstChild) mount();
      paint(true);
      c.querySelector('input').focus();
    }
  }

  const steppers = {
    dashboard(state, spec) {
      if (spec.forward) {
        const c = window.Workshop.capacity();
        return ['Reading the Branch 1 main diary', `Found ${c.unallocated} unallocated jobs and ${c.allocated} allocated`, `Laying out ${spec.widgets.length} cards`];
      }
      const f = Intent.filterOf(state);
      const cur = AS.summary(f);
      const pr = AS.prevRange(state.range, state.compare);
      return [
        `Reading ${cur.jobs.toLocaleString('en-GB')} job cards, ${AS.rangeText(state.range)}`,
        pr ? `Comparing with ${AS.rangeText(pr)}` : 'No earlier period to compare with',
        `Laying out ${spec.widgets.length} cards for this question`,
      ];
    },
  };

  async function send(question) {
    if (S.busy) return;
    S.busy = true;
    if (!S.open) setOpen(true);
    S.messages.push({ role: 'u', text: question });
    const typing = { role: 'typing' };
    S.messages.push(typing);
    paint(true);
    await wait(350);

    try {
      const result = await plan(question, S.state);
      S.messages.splice(S.messages.indexOf(typing), 1);
      if (result.kind === 'reply') {
        S.messages.push({ role: 'a', text: result.text, chips: result.chips, planner: result.planner });
      } else if (result.kind === 'optimise') {
        await buildPlan(result.focus);
      } else if (result.kind === 'approve') {
        if (S.plan && !S.plan.applied && S.plan.changes.length) await applyPlan();
        else S.messages.push({ role: 'a', text: 'There\'s no plan waiting for approval.', chips: ['Fix my workbays and technicians'] });
      } else if (result.kind === 'undo') {
        undoPlan();
      } else if (result.kind === 'book') {
        openBooking();
      } else if (result.kind === 'nav') {
        S.messages.push({ role: 'a', text: result.text });
        window.App.showPlanner();
      } else {
        await buildDashboard(result);
      }
    } catch (err) {
      console.error(err);
      const stuck = S.messages.indexOf(typing);
      if (stuck >= 0) S.messages.splice(stuck, 1);
      S.messages.push({ role: 'a', text: "Something went wrong building that. Nothing has changed. Please try asking another way." });
    }
    S.busy = false;
    paint(true);
    const input = root().querySelector('input');
    if (input && document.activeElement === document.body) input.focus();
  }

  async function buildDashboard(result) {
    const state = result.state;
    const spec = Intent.buildSpec(state);
    S.state = state;
    const steps = { role: 'a', kind: 'steps', steps: steppers.dashboard(state, spec), at: 0 };
    S.messages.push(steps);
    window.App.showDashboard(state, spec, 'skeleton');
    paint(true);
    for (let i = 0; i < steps.steps.length; i++) {
      steps.at = i;
      paint(true);
      await wait(420);
    }
    steps.finished = true;
    steps.at = steps.steps.length;
    window.App.showDashboard(state, spec, 'animate');
    S.resultSeq++;
    const narrative = spec.forward ? forwardNarrative() : Dashboard.narrate(state, (spec.widgets.find((w) => w.type === 'headline') || {}).metric);
    S.messages.push({
      role: 'a', kind: 'result', seq: S.resultSeq, state, title: narrative.title, detail: narrative.detail,
      stats: Dashboard.resultStats(state, spec), notes: result.notes || [], chips: Dashboard.followUps(state),
    });
  }

  async function runSteps(labels) {
    const steps = { role: 'a', kind: 'steps', steps: labels, at: 0 };
    S.messages.push(steps);
    for (let i = 0; i < labels.length; i++) {
      steps.at = i;
      paint(true);
      await wait(420);
    }
    steps.finished = true;
    steps.at = labels.length;
    paint(true);
  }

  async function buildPlan(focus) {
    const snap = window.Workshop.snapshot();
    await runSteps([
      `Reading ${snap.cards.length + snap.jobs.length} jobs and ${snap.holds.length} parked vehicles from the diary`,
      `Checking ${snap.techs.length} technicians' shifts and absences, and ${snap.bays.length} bays`,
      'Working out the changes and testing them for clashes',
    ]);
    S.plan = window.Optimiser.create(focus);
    S.messages.push({ role: 'a', kind: 'plan', plan: S.plan });
    window.App.showPlan();
    if (!S.plan.changes.length) S.messages.push({ role: 'a', text: "I can't find anything left to change in the diary right now. What's left needs a person, and it's listed on the plan." });
  }

  /** The plan screen re-selects items, so it passes the new plan back here. */
  function planChanged(plan) {
    const m = S.messages.find((x) => x.kind === 'plan' && x.plan === S.plan);
    S.plan = plan;
    if (m) m.plan = plan;
    paint();
  }

  async function applyPlan() {
    const plan = S.plan;
    if (!plan || plan.applied || !plan.changes.length) return;
    const wasBusy = S.busy;
    S.busy = true;
    plan.applied = true;
    window.Workshop.clearPreview();
    await runSteps(plan.items.filter((i) => i.on && i.changes.length).map((i) => `${i.doing}`));
    window.Workshop.apply(plan);
    S.messages.push({
      role: 'a', kind: 'applied', count: plan.changes.length, detail: plan.doneText, booking: plan.booking,
      log: plan.items.filter((i) => i.on && i.changes.length).map((i) => i.logText),
    });
    window.App.showPlanner();
    S.busy = wasBusy;
    paint(true);
  }

  function undoPlan() {
    if (!window.Workshop.undo()) {
      S.messages.push({ role: 'a', text: 'There\'s nothing to undo.' });
      paint(true);
      return;
    }
    const m = [...S.messages].reverse().find((x) => x.kind === 'applied' && !x.undone);
    if (m) m.undone = true;
    if (m && m.booking) {
      const sug = S.messages.find((x) => x.kind === 'booking-suggestion' && x.id === m.booking.id);
      if (sug) sug.booked = null;
    }
    S.plan = null;
    S.messages.push({ role: 'a', text: 'I\'ve put the diary back as it was.' });
    window.App.showPlanner();
    paint(true);
  }

  /* ---------- booking an appointment ---------- */

  let bookingSeq = 0;
  const hhmm = (h) => window.Optimiser.rules.hhmm(h);
  const findMsg = (kind, id) => S.messages.find((x) => x.kind === kind && x.id === Number(id));

  function openBooking() {
    const snap = window.Workshop.snapshot();
    S.messages.push({ role: 'a', text: "Fill in what the customer tells you, and I'll find the best technician and time." });
    S.messages.push({
      role: 'a', kind: 'booking-form', id: ++bookingSeq, done: false, error: '',
      form: { customer: '', phone: '', reg: '', vehicle: '', type: null, date: snap.today, window: 'asap' },
    });
  }

  /** Working days from today, for the day picker. */
  function bookingDays(snap) {
    const out = [];
    for (let i = 0; out.length < 12; i++) {
      const date = AS.toIso(AS.toN(snap.today) + i);
      if (AS.dateOf(AS.toN(date)).getUTCDay() === 0) continue; // Closed on Sundays.
      const word = window.Matching.dayWord(date, snap);
      out.push({ date, label: word === 'today' || word === 'tomorrow' ? `${word[0].toUpperCase()}${word.slice(1)}, ${window.Matching.dayShort(date)}` : window.Matching.dayShort(date) });
    }
    return out;
  }

  const WINDOWS = [['asap', 'As soon as possible'], ['morning', 'Morning'], ['afternoon', 'Afternoon'],
    ...Array.from({ length: 10 }, (_, i) => [String(8 + i), `From ${String(8 + i).padStart(2, '0')}:00`])];

  function bookingFormHtml(m) {
    const f = m.form;
    if (m.done) {
      const day = bookingDays(window.Workshop.snapshot()).find((d) => d.date === f.date);
      return `<div class="ccard bk"><div class="bk-h">New appointment</div>
        <div class="sm"><b>${esc(f.type)}</b> for ${esc(f.customer || 'the customer')}${f.reg ? `, ${esc(f.reg)}` : ''}${f.vehicle ? ` ${esc(f.vehicle)}` : ''}</div>
        <div class="sm muted">${esc(day ? day.label : f.date)}, ${esc(WINDOWS.find((w) => w[0] === f.window)[1].toLowerCase())}${f.phone ? ` · ${esc(f.phone)}` : ''}</div></div>`;
    }
    const field = (name, label, ph) => `<label class="bk-f"><span>${label}</span><input data-bf="${name}" data-m="${m.id}" value="${esc(f[name])}" placeholder="${ph}" autocomplete="off"></label>`;
    const days = bookingDays(window.Workshop.snapshot());
    return `<div class="ccard bk"><div class="bk-h">New appointment</div>
      ${field('customer', 'Customer', 'Name')}
      ${field('phone', 'Phone', 'Number')}
      ${field('reg', 'Registration', 'e.g. SC20 UYT')}
      ${field('vehicle', 'Make and model', 'e.g. Jaguar E-Pace')}
      <div class="bk-f"><span>Job</span><div class="bk-types" role="group" aria-label="Job type">${window.Matching.TYPES.map((t) => `<button class="qchip" data-a="bk-type" data-m="${m.id}" data-v="${esc(t.id)}" aria-pressed="${f.type === t.id}">${esc(t.id)}</button>`).join('')}</div></div>
      <label class="bk-f"><span>Day</span><select data-bf="date" data-m="${m.id}">${days.map((d) => `<option value="${d.date}" ${d.date === f.date ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      <label class="bk-f"><span>Time</span><select data-bf="window" data-m="${m.id}">${WINDOWS.map(([v, l]) => `<option value="${v}" ${v === f.window ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${m.error ? `<div class="sm bk-err">${ic('alert', 'sm')}<span>${esc(m.error)}</span></div>` : ''}
      <div class="c-acts"><button class="btn s p" data-a="bk-next" data-m="${m.id}" ${S.busy ? 'disabled' : ''}>Next</button></div></div>`;
  }

  /* ---------- extras worth offering ---------- */

  const gbp0 = (v) => `£${Math.round(v).toLocaleString('en-GB')}`;
  const weekday = (iso) => AS.dateOf(AS.toN(iso)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const picked = (x) => (x && x.ex.items ? x.ex.items.filter((i) => x.ticked.has(i.id)) : []);
  const needsOf = (items) => items.flatMap((i) => i.parts.map((p) => ({ part: p.part, qty: p.qty })));

  /** Where an item's parts come from, as one short tag. */
  function sourceTag(item) {
    if (item.earliest) return { text: `Earliest ${window.Matching.dayShort(item.earliest)}`, tone: 'off' };
    const away = item.parts.find((p) => p.source !== 'shelf');
    if (!away) return { text: 'On the shelf', tone: 'ok' };
    return { text: away.source === 'transfer' ? `Transfer from ${away.from}, arrives ${weekday(away.arrives)}` : `Supplier, arrives ${weekday(away.arrives)}`, tone: 'amb' };
  }

  function extraRow(m, i, mode) {
    const tags = [...i.tags.map((t) => ({ text: t, tone: t === 'Safety' ? 'safe' : '' })), mode === 'covered' ? { text: `Included in the ${m.form.type.toLowerCase()}`, tone: 'ok' } : sourceTag(i)];
    const tagHtml = `<div class="bx-tags">${tags.map((t) => `<span class="${t.tone}">${esc(t.text)}</span>`).join('')}</div>`;
    const body = `<div><b>${esc(i.name)}</b><div class="sm">${esc(i.reason)}</div>${tagHtml}</div>`;
    if (mode !== 'offer' || m.done) {
      const on = mode === 'offer' && m.ticked.has(i.id);
      return `<div class="bx-item ${mode === 'offer' ? '' : 'off'}"><span class="bx-box ${on ? 'on' : ''}" aria-hidden="true"></span>${body}<div class="bx-price">${mode === 'covered' ? '' : `${gbp0(i.price)}<span>+${i.hours.toFixed(1)} h</span>`}</div></div>`;
    }
    const on = m.ticked.has(i.id);
    return `<button class="bx-item" data-a="bx-tick" data-m="${m.id}" data-v="${esc(i.id)}" aria-pressed="${on}"><span class="bx-box ${on ? 'on' : ''}" aria-hidden="true"></span>${body}<div class="bx-price">${gbp0(i.price)}<span>+${i.hours.toFixed(1)} h</span></div></button>`;
  }

  function extrasHtml(m) {
    const ex = m.ex;
    const go = m.done ? '' : `<button class="btn s p" data-a="bx-find" data-m="${m.id}" ${S.busy ? 'disabled' : ''}>Find a technician</button>`;
    if (!ex.car) return `<div class="ccard bx"><div class="sm">No history for ${esc(ex.reg || 'this car')}, so I can't suggest extras.</div>${go ? `<div class="c-acts">${go}</div>` : ''}</div>`;
    const car = ex.car;
    const [lastDate, lastMiles] = ex.lastVisit;
    const head = `<div class="bx-car"><div><b>${esc(car.registered.slice(0, 4))} ${esc(car.make)} ${esc(car.model)}</b><span>Last in ${esc(window.Matching.dayShort(lastDate).split(' ').slice(1).join(' '))} ${esc(lastDate.slice(0, 4))} at ${lastMiles.toLocaleString('en-GB')} miles</span></div>
      <label class="bx-miles"><span>${ex.estimated ? 'Estimated' : 'Mileage'}</span>${m.done ? `<b>${ex.estimated ? '~' : ''}${ex.mileage.toLocaleString('en-GB')}</b>` : `<input data-bx="mileage" data-m="${m.id}" value="${ex.mileage}" inputmode="numeric" aria-label="Current mileage">`}</label></div>`;
    const offer = ex.items;
    if (!offer.length && !ex.unavailable.length) {
      return `<div class="ccard bx">${head}<div class="sm">Nothing is due or outstanding on ${esc(ex.reg)}.${ex.covered.length ? ` ${esc(ex.covered.map((i) => i.name).join(', '))} ${ex.covered.length > 1 ? 'are' : 'is'} included in the ${esc(m.form.type.toLowerCase())}.` : ''}</div>${go ? `<div class="c-acts">${go}</div>` : ''}</div>`;
    }
    const top = offer.slice(0, 3);
    const rest = offer.slice(3);
    const hidden = rest.length + ex.unavailable.length + ex.covered.length;
    const sel = picked(m);
    const hours = sel.reduce((a, i) => a + i.hours, 0);
    const total = sel.length ? `${sel.length} extra${sel.length > 1 ? 's' : ''}: ${gbp0(sel.reduce((a, i) => a + i.price, 0))} inc VAT, +${hours.toFixed(1)} h` : 'No extras ticked';
    return `<div class="ccard bx">${head}
      ${top.map((i) => extraRow(m, i, 'offer')).join('')}
      ${hidden ? `<button class="bx-more" data-a="bx-more" data-m="${m.id}" aria-expanded="${m.more}">${m.more ? '▴ Show less' : `▾ ${hidden} more`}</button>` : ''}
      ${m.more ? [...rest.map((i) => extraRow(m, i, 'offer')), ...ex.unavailable.map((i) => extraRow(m, i, 'unavailable')), ...ex.covered.map((i) => extraRow(m, i, 'covered'))].join('') : ''}
      <div class="bx-total"><span>${esc(total)}</span>${go}</div></div>`;
  }

  async function nextStep(id) {
    const form = findMsg('booking-form', id);
    if (!form || form.done || S.busy) return;
    if (!form.form.type) { form.error = 'Choose the job type first.'; paint(); return; }
    S.busy = true;
    form.done = true;
    const f = form.form;
    const snap = window.Workshop.snapshot();
    const reg = f.reg.trim().toUpperCase();
    try {
      await runSteps([
        reg ? `Looking up ${reg}` : 'No registration given',
        'Checking the service schedule and past health checks',
        'Checking parts at Branch 1, the other branches and the supplier',
      ]);
      const ex = window.Upsell.extras({ reg, type: f.type, date: f.date, today: snap.today });
      S.messages.push({ role: 'a', text: ex.car && ex.items.length ? `Here's what's worth raising with ${f.customer.trim() || 'the customer'}. The top three are ticked for you to read out.` : 'Nothing extra to offer on this one.' });
      S.messages.push({ role: 'a', kind: 'booking-extras', id: form.id, form: Object.assign({}, f), ex, ticked: new Set((ex.items || []).filter((i) => i.ticked).map((i) => i.id)), more: false, done: false });
    } catch (err) {
      console.error(err);
      form.done = false;
      S.messages.push({ role: 'a', text: 'Something went wrong looking up the car. Nothing has been booked.' });
    }
    S.busy = false;
    paint(true);
  }

  function toggleExtra(id, itemId) {
    const m = findMsg('booking-extras', id);
    if (!m || m.done) return;
    if (m.ticked.has(itemId)) m.ticked.delete(itemId); else m.ticked.add(itemId);
    paint();
  }

  function toggleMore(id) {
    const m = findMsg('booking-extras', id);
    if (!m) return;
    m.more = !m.more;
    paint();
  }

  /** A corrected mileage re-works the list, back to the default top three. */
  function extrasMileage(id, value) {
    const m = findMsg('booking-extras', id);
    const miles = Number(String(value).replace(/[^\d]/g, ''));
    if (!m || m.done || !miles) return;
    m.ex = window.Upsell.extras({ reg: m.ex.reg, mileage: miles, type: m.form.type, date: m.form.date, today: window.Workshop.snapshot().today });
    m.ticked = new Set(m.ex.items.filter((i) => i.ticked).map((i) => i.id));
    paint();
  }

  function optionHtml(m, o, i) {
    const chips = `<div class="bk-stats">${o.stats.map((s) => `<span class="${s.tone || ''}">${esc(s.text)}</span>`).join('')}</div>`;
    const open = m.booked == null;
    if (i === 0) {
      const first = o.tech.split(/\s+/)[0];
      const extras = m.extras || [];
      const parts = extras.length ? window.Parts.plan(needsOf(extras), o.date, window.Workshop.snapshot().today, `a${m.id}`) : [];
      const ordering = parts && parts.some((c) => c.kind !== 'hold');
      const will = open && extras.length ? `<div class="bk-will"><div class="bk-h">When you book, I'll</div>
        <div>Add the ${(o.to - o.from).toFixed(2).replace(/\.?0+$/, '')}-hour job to ${esc(first)}'s ${esc(window.Matching.dayWord(o.date, window.Workshop.snapshot()))}</div>
        ${parts ? parts.map((c) => `<div>${esc(window.Parts.describe(c))}</div>`).join('') : '<div class="bk-err">Some parts can no longer get here in time for this day.</div>'}</div>` : '';
      return `<div class="bk-slot">${esc(window.Matching.dayShort(o.date))}, ${hhmm(o.from)} to ${hhmm(o.to)}</div>
        <div class="bk-who">${esc(o.tech)} · ${esc(o.bay)}</div>
        ${extras.length ? `<div class="sm"><b>${esc(m.form.type)} plus ${extras.length} extra${extras.length > 1 ? 's' : ''}</b>: ${esc(extras.map((x) => x.name.toLowerCase()).join(', '))}.</div>` : ''}
        <div class="sm">${esc(o.reason)}</div>${chips}${will}
        ${open ? `<div class="c-acts"><button class="btn s p" data-a="bk-book" data-m="${m.id}" data-v="0">${ordering ? 'Book and order' : `Book ${esc(first)}, ${esc(window.Matching.dayShort(o.date).split(' ')[0])} ${hhmm(o.from)}`}</button><button class="btn s" data-a="bk-preview" data-m="${m.id}" data-v="0">Preview on planner</button></div>` : ''}`;
    }
    return `<div class="bk-alt"><div class="bk-alt-h"><div><b>${esc(o.label)}</b><span>${esc(o.tech)} · ${esc(window.Matching.dayShort(o.date))} ${hhmm(o.from)}</span></div>
      ${open ? `<button class="btn s" data-a="bk-book" data-m="${m.id}" data-v="${i}">Book instead</button>` : ''}</div>
      ${o.reason ? `<div class="sm">${esc(o.reason)}</div>` : ''}${chips}</div>`;
  }

  function suggestionHtml(m) {
    const r = m.result;
    if (!r.main) return `<div class="msg-a col"><span>Nobody can take ${esc(m.req.type.toLowerCase())} work in the next two weeks. Try another job type, or check the planner for absences.</span></div>`;
    const opts = [r.main, ...r.alts];
    const booked = m.booked != null ? opts[m.booked] : null;
    return `<div class="ccard bk-s">${opts.map((o, i) => optionHtml(m, o, i)).join('')}
      <div class="safe">${ic(booked ? 'check' : 'lock', 'sm')}${booked ? `Booked with ${esc(booked.tech)}, ${esc(window.Matching.dayShort(booked.date))} ${hhmm(booked.from)}.` : 'Sample data. Nothing is booked until you click.'}</div></div>`;
  }

  /** Typing into the form updates its message without a repaint, so focus stays put. */
  function formInput(id, field, value) {
    const m = findMsg('booking-form', id);
    if (m && !m.done) m.form[field] = value;
  }

  function bookingType(id, type) {
    const m = findMsg('booking-form', id);
    if (!m || m.done) return;
    m.form.type = type;
    m.error = '';
    paint();
  }

  async function findTechnician(id) {
    const m = findMsg('booking-extras', id);
    if (!m || m.done || S.busy) return;
    S.busy = true;
    m.done = true;
    const f = m.form;
    const extras = picked(m);
    const extraHours = extras.reduce((a, x) => a + x.hours, 0);
    const req = { type: f.type, date: f.date, window: /^\d+$/.test(f.window) ? Number(f.window) : f.window, customer: f.customer.trim(), extraHours };
    try {
      const result = window.Matching.suggest(req, window.Workshop.snapshot());
      await runSteps(result.steps);
      S.messages.push({ role: 'a', kind: 'booking-suggestion', id: m.id, req, form: Object.assign({}, f), extras, result, booked: null });
    } catch (err) {
      console.error(err);
      m.done = false;
      S.messages.push({ role: 'a', text: 'Something went wrong finding a technician. Nothing has been booked.' });
    }
    S.busy = false;
    paint(true);
  }

  /**
   * A one-change plan, so booking reuses the approve, preview and undo flow. Parts for
   * the extras ride along as partChanges; null means a part can't get here in time.
   */
  function bookingPlan(m, idx) {
    const o = idx === 0 ? m.result.main : m.result.alts[idx - 1];
    const f = m.form;
    const type = window.Matching.typeOf(f.type);
    const extras = m.extras || [];
    const partChanges = extras.length ? window.Parts.plan(needsOf(extras), o.date, window.Workshop.snapshot().today, `a${m.id}`) : [];
    const change = {
      kind: 'appointment', id: `a${m.id}`, res: o.tech, bay: o.bay, from: [o.date, o.from], to: [o.date, o.to], hrs: o.to - o.from,
      l1: [f.reg.trim().toUpperCase(), f.vehicle.trim()].filter(Boolean).join(' - ') || 'New appointment',
      l2: [extras.length ? `${type.desc} + ${extras.map((x) => x.name.toLowerCase()).join(', ')}` : type.desc, f.customer.trim()].filter(Boolean).join(' - '),
    };
    const when = `${window.Matching.dayShort(o.date)} ${hhmm(o.from)}`;
    const items = [{ on: true, changes: [change], doing: `Adding the appointment to ${o.tech.split(/\s+/)[0]}'s diary`, logText: `${change.l1} booked with ${o.tech}, ${when}, ${o.bay}` }];
    (partChanges || []).forEach((c) => items.push({ on: true, changes: [c], doing: window.Parts.describe(c).replace(/^(\w+)/, (w) => ({ Hold: 'Holding', Request: 'Requesting', Order: 'Ordering' }[w] || w)), logText: window.Parts.describe(c) }));
    return {
      changes: [change], partChanges, booking: { id: m.id, idx }, items,
      doneText: partChanges && partChanges.length ? 'The new appointment is highlighted on the planner, and its parts are held or on their way.' : 'The new appointment is highlighted on the planner.',
    };
  }

  /** The diary may have changed since the suggestion, so re-check before booking. */
  function stillFree(plan) {
    const snap = window.Workshop.snapshot();
    const c = plan.changes[0];
    snap.cards.push({ id: c.id, res: c.res, bay: c.bay, from: c.from, to: c.to, hrs: c.hrs, l2: c.l2 });
    return window.Optimiser.rules.validate(snap, plan).every((x) => x.pass);
  }

  async function book(id, idx) {
    const m = findMsg('booking-suggestion', id);
    if (!m || m.booked != null || S.busy) return;
    const plan = bookingPlan(m, Number(idx));
    const extras = findMsg('booking-extras', id);
    if (!plan.partChanges) {
      if (extras) { extras.done = false; extras.ex = window.Upsell.extras({ reg: extras.ex.reg, mileage: extras.ex.estimated ? null : extras.ex.mileage, type: extras.form.type, date: extras.form.date, today: window.Workshop.snapshot().today }); extras.ticked = new Set(extras.ex.items.filter((i) => i.ticked).map((i) => i.id)); }
      S.messages.push({ role: 'a', text: "A part for one of the extras can no longer get here in time, so I haven't booked it. I've refreshed the extras above. Tick again and click **Find a technician**." });
      paint(true);
      return;
    }
    if (!stillFree(plan)) {
      if (extras) extras.done = false;
      S.messages.push({ role: 'a', text: "That time has just been taken in the diary, so I haven't booked it. Click **Find a technician** again for a fresh suggestion." });
      paint(true);
      return;
    }
    m.booked = Number(idx);
    S.plan = plan;
    await applyPlan();
  }

  function previewBooking(id, idx) {
    const m = findMsg('booking-suggestion', id);
    if (!m || m.booked != null) return;
    S.plan = bookingPlan(m, Number(idx));
    window.Workshop.preview(S.plan);
    window.App.showPlanner();
  }

  function forwardNarrative() {
    const c = window.Workshop.capacity();
    return { title: `${c.unallocated} jobs are unallocated, ${c.unallocatedToday} of them due today.`, detail: `${c.absentToday.length} technicians are away today.` };
  }

  /** Filter-row changes rebuild the dashboard without adding to the chat. */
  function applyFilter(name, value) {
    if (!S.state) return;
    const s = Object.assign({}, S.state);
    if (name === 'range') s.range = Intent.PRESETS[value]();
    if (name === 'branch') s.branch = value === '' ? null : Number(value);
    if (name === 'compare') s.compare = value;
    if (name === 'clear') { s.tech = null; s.type = null; s.make = null; s.advisor = null; }
    const empty = !AS.summary(Intent.filterOf(s)).jobs;
    if (empty) { window.App.toast('No job cards match those filters'); window.App.refresh(); return; }
    S.state = s;
    S.resultSeq = 0;
    window.App.showDashboard(s, Intent.buildSpec(s), 'instant');
    paint();
  }

  function reopen(seq) {
    const m = S.messages.find((x) => x.seq === Number(seq));
    if (!m) return;
    S.state = m.state;
    S.resultSeq = m.seq;
    window.App.showDashboard(m.state, Intent.buildSpec(m.state), 'instant');
    paint();
  }

  function setContext() {
    const el = document.getElementById('chat-ctx');
    if (el) el.textContent = { dashboard: 'Dashboard', plan: 'Improvement plan' }[window.App.view()] || 'Technician planner';
    paint();
  }

  return { send, setOpen, isOpen: () => S.open, applyFilter, reopen, setContext, state: () => S.state, plan: () => S.plan, planChanged, applyPlan, undoPlan, formInput, bookingType, nextStep, toggleExtra, toggleMore, extrasMileage, findTechnician, book, previewBooking };
})();
