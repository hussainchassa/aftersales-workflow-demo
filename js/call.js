/*
 * A customer call handled by an AI agent, for the demo. The screens only listen to
 * call events (ringing, answered, line, action, ended), so they can't tell whether a
 * script or a live call is behind them. Today a script plays the call in real time;
 * a voice provider adapter could emit the same events from a live call instead.
 *
 * The agent's tools drive the copilot's real booking flow, and what the agent says is
 * filled from what those tools return, so the call never contradicts the screen.
 */
window.Call = (function () {
  'use strict';

  const AS = window.AS;
  const R = () => window.Optimiser.rules;
  const CALLER = '07700 900123';
  const CPS = 14; // Characters a second, roughly speaking pace.

  /* ---------- events ---------- */

  const listeners = {};
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  function emit(type, data) { [...(listeners[type] || []), ...(listeners['*'] || [])].forEach((fn) => fn(data, type)); }

  /* ---------- state ---------- */

  const S = {
    status: 'idle', caller: null, entries: [], speaking: null, startedAt: 0, endedAt: 0,
    paused: false, pausedAt: 0, pausedTotal: 0, speed: 1, run: 0, snapshot: null, ctx: null,
  };

  const now = () => Date.now();
  function elapsed() {
    if (!S.startedAt) return 0;
    const end = S.endedAt || (S.paused ? S.pausedAt : now());
    return Math.max(0, end - S.startedAt - S.pausedTotal);
  }
  const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

  const CANCEL = { cancelled: true };
  /** Waits in small steps so pause, restart and speed all take effect promptly. */
  async function sleep(ms, run) {
    let left = ms / S.speed;
    while (left > 0) {
      if (run !== S.run) throw CANCEL;
      const step = Math.min(left, 80);
      await new Promise((r) => setTimeout(r, step));
      if (!S.paused) left -= step;
    }
    if (run !== S.run) throw CANCEL;
  }

  /* ---------- the agent's tools: the copilot's real booking flow ---------- */

  const C = () => window.Copilot;
  const needsOf = (items) => items.flatMap((i) => i.parts.map((p) => ({ part: p.part, qty: p.qty })));

  const TOOLS = {
    async start_booking(ctx, args) {
      ctx.id = await C().agentStartBooking(args, 45 / S.speed);
      ctx.details = args;
      return ctx.id;
    },
    async show_extras(ctx) {
      await C().nextStep(ctx.id);
      const ex = C().bookingInfo(ctx.id).extras;
      ctx.extras = ex ? ex.ex : null;
      ctx.offer = ctx.extras && ctx.extras.items ? ctx.extras.items.filter((i) => i.ticked) : [];
      return ctx.offer;
    },
    async choose_extras(ctx, ids) {
      C().setExtras(ctx.id, ids);
      ctx.chosen = (ctx.extras.items || []).filter((i) => ids.includes(i.id));
      return ctx.chosen;
    },
    async find_technician(ctx) {
      await C().findTechnician(ctx.id);
      const sug = C().bookingInfo(ctx.id).suggestion;
      ctx.main = sug && sug.result.main;
      ctx.parts = ctx.main && ctx.chosen.length ? window.Parts.plan(needsOf(ctx.chosen), ctx.main.date, window.Workshop.snapshot().today, 'call') : [];
      return ctx.main;
    },
    async book(ctx) {
      await C().book(ctx.id, 0);
      const sug = C().bookingInfo(ctx.id).suggestion;
      ctx.booked = sug && sug.booked === 0 ? ctx.main : null;
      return ctx.booked;
    },
  };

  /* ---------- what the agent says, filled from what the tools returned ---------- */

  const snap = () => window.Workshop.snapshot();
  const first = (name) => name.split(/\s+/)[0];
  const gbp = (v) => `£${Math.round(v).toLocaleString('en-GB')}`;
  const total = (items) => gbp(items.reduce((a, i) => a + i.price, 0));
  const dayOf = (date) => { const w = window.Matching.dayWord(date, snap()); return w === 'today' || w === 'tomorrow' ? w : `on ${w}`; };
  const spokenTime = (h) => R().hhmm(h).replace(/^0/, '');

  /** An item's reason, turned from the advisor's note into something said to the customer. */
  function spoken(item) {
    const reason = item.reason
      .replace(/, and you said not yet\.$/, ', and you said to leave it for now.')
      .replace(/\. (\w)/g, (_, c) => `, ${c.toLowerCase()}`)
      .replace(/^./, (c) => c.toLowerCase());
    return `the ${item.name.toLowerCase()}: ${reason}`;
  }

  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
  const hoursWords = (h) => (h % 1 ? `${Math.floor(h)} and a half hours` : `${h} hours`);

  function offerLine(ctx) {
    const items = ctx.offer;
    if (!items.length) return "Everything's up to date on the car, so it's just the service.";
    const list = items.map((i, n) => `${n === 0 ? 'First, ' : n === items.length - 1 ? 'And ' : 'Then '}${spoken(i)}`).join(' ');
    const shelf = items.every((i) => i.parts.every((p) => p.source === 'shelf'));
    const parts = shelf ? 'We have the parts for all of them in stock.' : `We have most of the parts in stock, and the rest can be here before ${ctx.details.dayName}.`;
    return `While it's in, there ${items.length === 1 ? 'is one thing' : `are ${WORDS[items.length] || items.length} things`} worth doing. ${list} ${parts} Together they'd add ${total(items)} including VAT. Would you like me to add ${items.length === 1 ? 'it' : 'them'}?`;
  }

  function slotLine(ctx) {
    const m = ctx.main;
    if (!m) return "I'm sorry, I can't find anyone free for that in the next two weeks. I'll ask the service team to call you back.";
    const hours = Math.round((m.to - m.from) * 2) / 2;
    const ordering = (ctx.parts || []).some((c) => c.kind !== 'hold');
    return `I can book you in with ${first(m.tech)} ${dayOf(m.date)} at ${spokenTime(m.from)}. With everything, it's about ${hoursWords(hours)}, so it should be ready by around ${spokenTime(m.to)}. I'll hold the parts we have in stock${ordering ? ' and arrange the rest to arrive before then' : ''}${ctx.chosen.length ? `, and the extras come to ${total(ctx.chosen)} including VAT` : ''}. Shall I go ahead?`;
  }

  /* ---------- the script ---------- */

  function nextFriday(today) {
    let n = AS.toN(today) + 1;
    while (AS.dateOf(n).getUTCDay() !== 5) n++;
    return AS.toIso(n);
  }

  function script(caller) {
    const car = caller.car;
    const friday = nextFriday(snap().today);
    const details = { customer: caller.name, phone: caller.phone, reg: car.reg, type: 'Major service', date: friday, window: 'morning', dayName: 'Friday' };
    return [
      { say: 'agent', text: `Good afternoon, thanks for calling the service team. Am I speaking with ${caller.title}?` },
      { say: 'customer', text: "Yes, that's me." },
      { say: 'agent', text: `Lovely. How can I help today?` },
      { say: 'customer', text: `I need to book the ${car.make} in for its service. Friday morning would be ideal if you've got anything.` },
      { say: 'agent', text: `No problem. Just to check, is that the ${car.make} ${car.model.split(' ')[0]} on ${car.reg}?` },
      { say: 'customer', text: "That's the one." },
      { tool: 'start_booking', args: () => details, working: 'Filling in the booking', note: () => 'Agent filled in a major service booking for Friday morning' },
      { say: 'agent', text: "Thanks. It's due its major service, so I'll book that in. Give me a moment to check the car's history and what we have in stock." },
      { tool: 'show_extras', working: `Looking up ${car.reg}`, note: (ctx) => `Agent looked up ${car.reg} · checked the schedule, past health checks and parts · ${ctx.offer.length} worth offering` },
      { say: 'agent', text: offerLine },
      { say: 'customer', text: "Yes, go on. Let's get it all done while it's in." },
      { tool: 'choose_extras', args: (ctx) => ctx.offer.map((i) => i.id), working: 'Adding the extras', note: (ctx) => `Agent added ${ctx.chosen.map((i) => i.name.toLowerCase()).join(', ')}` },
      { say: 'agent', text: 'Great. Let me find the best technician for Friday morning.' },
      { tool: 'find_technician', working: 'Finding a technician', note: (ctx) => (ctx.main ? `Agent found ${ctx.main.tech} · ${window.Matching.dayShort(ctx.main.date)} ${R().hhmm(ctx.main.from)}` : 'No technician free') },
      { say: 'agent', text: slotLine },
      { say: 'customer', text: "Yes please, that's perfect." },
      { tool: 'book', when: (ctx) => !!ctx.main, working: 'Booking and arranging the parts', note: (ctx) => (ctx.booked ? 'Agent booked the job and arranged the parts' : "Agent couldn't book that slot") },
      { say: 'agent', text: (ctx) => (ctx.booked ? `You're all booked in ${dayOf(ctx.booked.date)} at ${spokenTime(ctx.booked.from)} with ${first(ctx.booked.tech)}. Is there anything else I can help with?` : "I'm sorry, that slot has just gone. I'll ask the service team to call you back.") },
      { say: 'customer', text: "No, that's everything. Thanks very much." },
      { say: 'agent', text: (ctx) => `Thanks, ${caller.title}.${ctx.booked ? ` See you ${dayOf(ctx.booked.date).replace(/^on /, '')}.` : ''} Goodbye.` },
    ];
  }

  /* ---------- the player ---------- */

  async function playLine(step, run) {
    const text = typeof step.text === 'function' ? step.text(S.ctx) : step.text;
    S.speaking = step.say;
    emit('speaking', { speaker: step.say });
    await sleep(step.say === 'customer' ? 900 : 500, run);
    const ms = Math.max(900, (text.length / CPS) * 1000);
    const entry = { kind: 'line', speaker: step.say, text, ms: ms / S.speed, at: elapsed() };
    S.entries.push(entry);
    S.speaking = null;
    emit('line', entry);
    await sleep(ms + 350, run);
  }

  async function playTool(step, run) {
    if (step.when && !step.when(S.ctx)) return;
    const entry = { kind: 'action', tool: step.tool, note: `${step.working}…`, done: false, at: elapsed() };
    S.entries.push(entry);
    emit('action', entry);
    const args = typeof step.args === 'function' ? step.args(S.ctx) : step.args;
    const result = await TOOLS[step.tool](S.ctx, args);
    if (run !== S.run) throw CANCEL;
    entry.done = true;
    entry.note = step.note ? step.note(S.ctx, result) : entry.note;
    emit('update', entry);
    await sleep(400, run);
  }

  function summary() {
    const ctx = S.ctx;
    const b = ctx.booked;
    const lines = [`Call length ${clock(elapsed())}, handled by the AI agent`];
    if (b) {
      lines.push(`${ctx.details.type}${ctx.chosen.length ? ` plus ${ctx.chosen.map((i) => i.name.toLowerCase()).join(', ')}` : ''}`);
      lines.push(`${b.tech}, ${window.Matching.dayShort(b.date)} ${R().hhmm(b.from)} to ${R().hhmm(b.to)}, ${b.bay}`);
      if (ctx.chosen.length) lines.push(`Extras ${total(ctx.chosen)} inc VAT`);
      (ctx.parts || []).forEach((c) => lines.push(window.Parts.describe(c)));
    }
    return { title: b ? `${S.caller.title} is booked in ${dayOf(b.date)} at ${R().hhmm(b.from)}.` : `${S.caller.title} wasn't booked.`, lines };
  }

  /** Starts the simulated call. Resolves when it ends, or when it's restarted. */
  async function start(opts) {
    if (S.status === 'ringing' || S.status === 'live') return null;
    const run = ++S.run;
    S.speed = (opts && opts.speed) || 1;
    Object.assign(S, { status: 'ringing', entries: [], speaking: null, startedAt: 0, endedAt: 0, paused: false, pausedAt: 0, pausedTotal: 0 });
    S.snapshot = window.Workshop.saveState();
    S.caller = window.Vehicles.lookupCaller(CALLER);
    S.ctx = { chosen: [], offer: [] };
    try {
      emit('ringing', S.caller);
      await sleep(3600, run);
      S.status = 'live';
      S.startedAt = now();
      emit('answered', S.caller);
      C().agentBegin(S.caller.name);
      for (const step of script(S.caller)) {
        if (step.say) await playLine(step, run);
        else if (step.tool) await playTool(step, run);
      }
      S.status = 'ended';
      S.endedAt = now();
      const sum = summary();
      C().agentEnd(`The AI agent finished the call with ${S.caller.name}.`);
      C().callSummary(sum.title, sum.lines);
      emit('ended', sum);
      return sum;
    } catch (err) {
      if (err === CANCEL) return null;
      console.error(err);
      S.status = 'ended';
      S.endedAt = now();
      C().agentEnd('The call stopped because something went wrong.');
      emit('ended', { title: 'The call stopped', lines: [] });
      return null;
    }
  }

  function togglePause() {
    if (S.status !== 'live' && S.status !== 'ringing') return;
    if (S.paused) { S.pausedTotal += now() - S.pausedAt; S.paused = false; } else { S.paused = true; S.pausedAt = now(); }
    emit('paused', S.paused);
  }

  /** Puts the diary and parts back as they were when the phone rang, then plays the call again. */
  async function restart() {
    if (!S.snapshot) return start();
    S.run++;
    S.paused = false;
    for (let i = 0; i < 100 && C().busy(); i++) await new Promise((r) => setTimeout(r, 50));
    window.Workshop.restoreState(S.snapshot);
    C().resetForCall();
    S.status = 'idle';
    emit('reset');
    window.App.showPlanner();
    return start({ speed: S.speed });
  }

  return {
    on, emit, start, restart, togglePause, elapsed, clock,
    state: () => S, live: () => S.status === 'ringing' || S.status === 'live',
  };
})();
