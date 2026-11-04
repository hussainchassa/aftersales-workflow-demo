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
    if (m.kind === 'applied') {
      return `<div class="ccard"><div class="c-result">${ic('check', 'sm')} Done. ${m.count} changes are in the diary.</div><div class="sm">${esc(m.detail)}</div>
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
      role: 'a', kind: 'applied', count: plan.changes.length, detail: plan.doneText,
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
    S.plan = null;
    S.messages.push({ role: 'a', text: 'I\'ve put the diary back as it was.' });
    window.App.showPlanner();
    paint(true);
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

  return { send, setOpen, isOpen: () => S.open, applyFilter, reopen, setContext, state: () => S.state, plan: () => S.plan, planChanged, applyPlan, undoPlan };
})();
