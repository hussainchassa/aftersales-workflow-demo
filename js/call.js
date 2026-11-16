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
      // Did the caller get the time they asked for? If not, could a swap free it?
      const m = ctx.main;
      ctx.gotPreferred = !!m && m.date === ctx.details.date && m.from === ctx.wantHour;
      ctx.canSwap = !!m && !ctx.gotPreferred && !!window.Swap.findSwap({ date: ctx.details.date, hour: ctx.wantHour }, bookedCard(ctx, m), ctx.details.type);
      return ctx.main;
    },
    async book(ctx) {
      await C().book(ctx.id, 0);
      const sug = C().bookingInfo(ctx.id).suggestion;
      ctx.booked = sug && sug.booked === 0 ? ctx.main : null;
      return ctx.booked;
    },
    /** Records the caller's first choice as a swap request for an advisor. Nobody is contacted yet. */
    async log_preference(ctx) {
      ctx.swap = window.Swap.findSwap({ date: ctx.details.date, hour: ctx.wantHour }, bookedCard(ctx, ctx.booked), ctx.details.type);
      return ctx.swap;
    },
    /** On the outbound call: keeps only the alternatives the diary still allows. */
    async offer_alternatives(ctx) {
      ctx.swap.alternatives = ctx.swap.alternatives.filter((a, i) => window.Swap.swapPlan(ctx.swap, i));
      return ctx.swap.alternatives;
    },
    /** Applies both moves as one change, only after the customer has said yes. */
    async apply_swap(ctx, choice) {
      ctx.choice = choice;
      ctx.swapped = await C().applySwap(ctx.swap, choice);
      return ctx.swapped;
    },
    async notify_customer(ctx) {
      const s = ctx.swap;
      ctx.notice = `Good news, ${s.callerTitle}: we've moved you to ${dayOf(s.moved.from[0]).replace(/^on /, '')} at ${spokenTime(s.moved.from[1])}, with the same work and parts. See you then.`;
      C().notifyCustomer(s.callerName, ctx.notice);
      return ctx.notice;
    },
  };

  /** The caller's booking as a planner card, for working out a swap. */
  const bookedCard = (ctx, m) => ({ id: `a${ctx.id}`, res: m.tech, bay: m.bay, from: [m.date, m.from], to: [m.date, m.to], hrs: m.to - m.from });

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
    const parts = `I'll hold the parts we have in stock${ordering ? ' and arrange the rest to arrive before then' : ''}${ctx.chosen.length ? `, and the extras come to ${total(ctx.chosen)} including VAT` : ''}.`;
    const ready = `With everything, it's about ${hoursWords(hours)}, so it should be ready by around ${spokenTime(m.to)}.`;
    if (ctx.gotPreferred) return `I can book you in with ${first(m.tech)} ${dayOf(m.date)} at ${spokenTime(m.from)}. ${ready} ${parts} Shall I go ahead?`;
    const asked = spokenTime(ctx.wantHour);
    const earliest = `${asked} is already taken, I'm afraid. The earliest I can do is ${spokenTime(m.from)} ${dayOf(m.date)}, with ${first(m.tech)}. ${ready} ${parts}`;
    if (ctx.canSwap) return `${earliest} I can book ${spokenTime(m.from)} for you now, and ask the team whether ${asked} can be freed up. If it can, we'll let you know. Shall I book ${spokenTime(m.from)} for now?`;
    return `${earliest} Shall I go ahead?`;
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
    const details = { customer: caller.name, phone: caller.phone, reg: car.reg, type: 'Major service', date: friday, window: '8', dayName: 'Friday' };
    S.ctx.details = details;
    S.ctx.wantHour = 8;
    return [
      { say: 'agent', text: `Good afternoon, thanks for calling the service team. Am I speaking with ${caller.title}?` },
      { say: 'customer', text: "Yes, that's me." },
      { say: 'agent', text: `Lovely. How can I help today?` },
      { say: 'customer', text: `I need to book the ${car.make} in for its service. Friday, first thing around 8 if you can. I need it back by lunchtime.` },
      { say: 'agent', text: `No problem. Just to check, is that the ${car.make} ${car.model.split(' ')[0]} on ${car.reg}?` },
      { say: 'customer', text: "That's the one." },
      { tool: 'start_booking', args: () => details, working: 'Filling in the booking', note: () => 'Agent filled in a major service booking for Friday from 08:00' },
      { say: 'agent', text: "Thanks. It's due its major service, so I'll book that in. Give me a moment to check the car's history and what we have in stock." },
      { tool: 'show_extras', working: `Looking up ${car.reg}`, note: (ctx) => `Agent looked up ${car.reg} · checked the schedule, past health checks and parts · ${ctx.offer.length} worth offering` },
      { say: 'agent', text: offerLine },
      { say: 'customer', text: "Yes, go on. Let's get it all done while it's in." },
      { tool: 'choose_extras', args: (ctx) => ctx.offer.map((i) => i.id), working: 'Adding the extras', note: (ctx) => `Agent added ${ctx.chosen.map((i) => i.name.toLowerCase()).join(', ')}` },
      { say: 'agent', text: 'Great. Let me find the best technician for Friday at 8.' },
      { tool: 'find_technician', working: 'Finding a technician', note: (ctx) => (ctx.main ? `Agent found ${ctx.main.tech} · ${window.Matching.dayShort(ctx.main.date)} ${R().hhmm(ctx.main.from)}${ctx.gotPreferred ? '' : ' (08:00 is taken)'}` : 'No technician free') },
      { say: 'agent', text: slotLine },
      { say: 'customer', text: (ctx) => (ctx.gotPreferred ? "Yes please, that's perfect." : "Yes, book that for now, thanks. 8 would be much better if it comes up.") },
      { tool: 'book', when: (ctx) => !!ctx.main, working: 'Booking and arranging the parts', note: (ctx) => (ctx.booked ? 'Agent booked the job and arranged the parts' : "Agent couldn't book that slot") },
      { tool: 'log_preference', when: (ctx) => !!ctx.booked && ctx.canSwap, working: 'Logging the preferred time', note: (ctx) => (ctx.swap ? `Agent logged a preference for Fri 08:00 · an advisor will be asked about a swap with ${ctx.swap.blocker.customer}` : 'No swap possible for Fri 08:00') },
      { say: 'agent', text: (ctx) => (ctx.booked ? `You're all booked in ${dayOf(ctx.booked.date)} at ${spokenTime(ctx.booked.from)} with ${first(ctx.booked.tech)}.${ctx.swap ? ` If ${spokenTime(ctx.wantHour)} frees up, we'll let you know straight away.` : ''} Is there anything else I can help with?` : "I'm sorry, that slot has just gone. I'll ask the service team to call you back.") },
      { say: 'customer', text: "No, that's everything. Thanks very much." },
      { say: 'agent', text: (ctx) => `Thanks, ${caller.title}.${ctx.booked ? ` See you ${dayOf(ctx.booked.date).replace(/^on /, '')}.` : ''} Goodbye.` },
    ];
  }

  /** The outbound call: asking the customer in the way whether they'd move. Only the "yes" path exists. */
  function outboundScript(swap) {
    const b = swap.blocker;
    const car = window.Vehicles.lookup(b.l1.split(' - ')[0]);
    const carName = car ? `${car.make} ${car.model.split(' ')[0]}` : 'car';
    const when = (a) => `${dayOf(a.date).replace(/^on /, '')} at ${spokenTime(a.from)}`;
    const altWords = (alts) => alts.map(when).join(', or ');
    return [
      { say: 'agent', text: `Hello, is that ${b.title}? I'm the AI assistant from the service team, calling about your ${carName} booking.` },
      { say: 'customer', text: 'Yes, speaking.' },
      { tool: 'offer_alternatives', working: 'Checking the other times are still free', note: (ctx) => `Agent checked ${ctx.swap.alternatives.map((a) => `${window.Matching.dayShort(a.date)} ${R().hhmm(a.from)}`).join(' and ')} are still free` },
      { say: 'agent', text: (ctx) => `You're booked in ${dayOf(b.from[0])} at ${spokenTime(b.from[1])} for your ${b.job}. Another customer is hoping for that time, so I wondered if you'd be happy to move. I could do ${altWords(ctx.swap.alternatives)}. If not, that's absolutely fine and nothing changes.` },
      { say: 'customer', text: (ctx) => `Actually, ${when(ctx.swap.alternatives[0])} suits me better. Let's do that.` },
      { tool: 'apply_swap', args: () => 0, working: 'Moving both appointments', note: (ctx) => (ctx.swapped ? `Agent moved ${b.title} to ${window.Matching.dayShort(ctx.swap.alternatives[0].date)} ${R().hhmm(ctx.swap.alternatives[0].from)} and ${ctx.swap.callerTitle} to ${window.Matching.dayShort(ctx.swap.moved.from[0])} ${R().hhmm(ctx.swap.moved.from[1])}` : "Agent couldn't make the swap, so nothing moved") },
      { say: 'agent', text: (ctx) => (ctx.swapped ? `Done. You're now booked in ${dayOf(ctx.swap.alternatives[0].date)} at ${spokenTime(ctx.swap.alternatives[0].from)} with ${first(ctx.swap.alternatives[0].res)}. Thank you, that really helps.` : "I'm sorry, the diary's just changed, so I'll leave your booking as it is. Thanks for your time.") },
      { say: 'customer', text: 'No problem. Bye.' },
      { say: 'agent', text: 'Thanks again. Goodbye.' },
      { tool: 'notify_customer', when: (ctx) => !!ctx.swapped, working: `Letting ${swap.callerTitle} know`, note: () => `Agent texted ${swap.callerTitle} the new time, ${R().hhmm(swap.moved.from[1])}` },
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
    const lines = [`Call length ${clock(elapsed())}, handled by the AI agent`];
    if (S.direction === 'outbound') {
      const s = ctx.swap;
      const a = s.alternatives[ctx.choice || 0];
      if (ctx.swapped) {
        lines.push(`${s.blocker.customer} moved to ${window.Matching.dayShort(a.date)} ${R().hhmm(a.from)} with ${a.res}`);
        lines.push(`${s.callerName} moved to ${window.Matching.dayShort(s.moved.from[0])} ${R().hhmm(s.moved.from[1])} with ${s.moved.res}`);
        lines.push(`${s.callerTitle} was sent a message`);
      }
      return { title: ctx.swapped ? `${s.blocker.title} agreed to move. ${s.callerTitle} now has ${R().hhmm(s.moved.from[1])}.` : 'Nothing moved.', lines };
    }
    const b = ctx.booked;
    if (b) {
      lines.push(`${ctx.details.type}${ctx.chosen.length ? ` plus ${ctx.chosen.map((i) => i.name.toLowerCase()).join(', ')}` : ''}`);
      lines.push(`${b.tech}, ${window.Matching.dayShort(b.date)} ${R().hhmm(b.from)} to ${R().hhmm(b.to)}, ${b.bay}`);
      if (ctx.chosen.length) lines.push(`Extras ${total(ctx.chosen)} inc VAT`);
      (ctx.parts || []).forEach((c) => lines.push(window.Parts.describe(c)));
      if (ctx.swap) lines.push(`Preferred ${R().hhmm(ctx.wantHour)}: swap request waiting for an advisor`);
    }
    return { title: b ? `${S.caller.title} is booked in ${dayOf(b.date)} at ${R().hhmm(b.from)}.` : `${S.caller.title} wasn't booked.`, lines };
  }

  /** Plays one call, inbound or outbound, through the same events and screens. */
  async function play(run, caller, direction, steps) {
    Object.assign(S, { status: 'ringing', direction, entries: [], speaking: null, startedAt: 0, endedAt: 0, paused: false, pausedAt: 0, pausedTotal: 0, caller });
    emit('ringing', caller);
    await sleep(direction === 'outbound' ? 3000 : 3600, run);
    S.status = 'live';
    S.startedAt = now();
    emit('answered', caller);
    C().agentBegin(caller.name);
    for (const step of steps()) {
      if (step.say) await playLine(step, run);
      else if (step.tool) await playTool(step, run);
    }
    S.status = 'ended';
    S.endedAt = now();
    const sum = summary();
    C().agentEnd(`The AI agent finished the call with ${caller.name}.`);
    C().callSummary(sum.title, sum.lines);
    emit('ended', sum);
    return sum;
  }

  /** After an advisor approves a swap request: the agent phones the customer in the way. */
  async function startOutbound(swap, opts) {
    if (S.status === 'ringing' || S.status === 'live') return null;
    const run = ++S.run;
    if (opts && opts.speed) S.speed = opts.speed;
    S.ctx = { swap };
    const b = swap.blocker;
    const caller = Object.assign(window.Vehicles.lookupCaller(b.phone) || {}, { name: b.customer, title: b.title, phone: b.phone });
    try {
      return await play(run, caller, 'outbound', () => outboundScript(swap));
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

  /** Starts the simulated call. Resolves when it ends, or when it's restarted. */
  async function start(opts) {
    if (S.status === 'ringing' || S.status === 'live') return null;
    const run = ++S.run;
    S.speed = (opts && opts.speed) || 1;
    S.snapshot = window.Workshop.saveState();
    const caller = window.Vehicles.lookupCaller(CALLER);
    S.ctx = { chosen: [], offer: [] };
    try {
      const sum = await play(run, caller, 'inbound', () => script(caller));
      // The caller's first choice goes to an advisor; nobody is contacted until they approve.
      if (S.ctx.swap) C().swapRequest(Object.assign(S.ctx.swap, { callerName: caller.name, callerTitle: caller.title }));
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
    on, emit, start, startOutbound, restart, togglePause, elapsed, clock,
    state: () => S, live: () => S.status === 'ringing' || S.status === 'live',
  };
})();
