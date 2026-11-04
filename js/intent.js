/*
 * Turns a typed question into a dashboard specification.
 *
 *   question -> interpret() -> state (topics, metrics, filters, range)
 *   state -> buildSpec() -> ordered list of widgets, rendered by dashboard.js
 *
 * interpret() is a rule-based parser, so the demo needs no API key or backend.
 * It is the only part an LLM would replace: have the model return the same state
 * object (for example through a tool call) and everything downstream still works.
 */
window.Intent = (function () {
  'use strict';

  const AS = window.AS;
  const M = AS.METRICS;
  const END = AS.END;

  /* ---------- vocabulary ---------- */
  const METRIC_WORDS = [
    ['productivity', /productiv/],
    ['utilisation', /utili[sz]|under[- ]?used|idle/],
    ['efficiency', /efficien/],
    ['elr', /labou?r rate|\belr\b|recovery rate/],
    ['vhcConv', /vhc conver|health check conver|conversion|upsell/],
    ['comeback', /come ?backs?|rework|first[- ]time fix|repeat repair/],
    ['csi', /\bcsi\b|satisf|\bnps\b/],
    ['leadDays', /lead[- ]time/],
    ['aov', /average invoice|invoice value|per job|average spend/],
    ['soldHrs', /sold hours|hours sold/],
    ['clockedHrs', /clocked/],
    ['gp', /gross profit|\bprofit\b|\bmargin\b|\bgp\b/],
    ['labour', /labou?r( sales| revenue)?/],
    ['parts', /\bparts\b/],
    ['sales', /\bsales\b|revenue|turnover|takings/],
    ['jobs', /how many jobs|job cards?|number of jobs|throughput/],
  ];

  const TOPIC_WORDS = [
    ['capacity', /capacity|\bload\b|planner|diary|unallocated|booked in|absen|holiday|sickness|next (week|fortnight|two weeks)|coming up|ahead/],
    ['vhc', /\bvhc\b|health checks?/],
    ['customer', /customers?\b|satisf|\bcsi\b|come ?backs?/],
    ['technicians', /technicians?|\btechs?\b|mechanics?|workshop team|workshop performance/],
    ['financial', /financ|\bmoney\b|profit|revenue|turnover|takings|labou?r and parts|parts and labou?r/],
    ['branches', /compare (the |my |our )?(branch|site)|(branch|site)(es|s)? (compar|league)|which (branch|site)|(best|worst) (branch|site)|\b(branches|sites)\b/],
    ['overview', /how('s| is| are| am| have)\b.*(perform|doing|going|look|tracking|been)|perform|overview|summary|overall|dashboard|snapshot|how('s| is) (business|it going)|health of/],
  ];

  const WHY = /\bwhy\b|what('s| is) (causing|driving|behind)|\breason\b|root cause|what changed/;
  const OUT_OF_SCOPE = /\b(new car|used car|car sales|vehicle sales|stock turn|payroll|finance agreement|f&i|weather|share price)\b/;
  const WRITE = /^(please |can you |could you |pls )?(allocate|assign|move|reschedule|re-schedule|book in|cancel|delete|post|send|approve|change|update|edit)\b/;
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const BY_WORDS = [['tech', /by (technician|tech|mechanic)s?|per (technician|tech)/], ['branch', /by (branch|site)|per (branch|site)|across (branch|site)/], ['type', /by (job |work )?(type|department)|per (job )?type/], ['make', /by (make|manufacturer|franchise|brand)/], ['advisor', /by (service )?advis[eo]rs?|per advis[eo]r/]];

  const monthStart = (y, m) => AS.toN(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
  const monthEnd = (y, m) => AS.toN(new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10));
  const endDate = AS.dateOf(END);

  const PRESETS = {
    last30: () => ({ key: 'last30', label: 'Last 30 days', from: END - 29, to: END }),
    last90: () => ({ key: 'last90', label: 'Last 90 days', from: END - 89, to: END }),
    thisQuarter: () => { const q = Math.floor(endDate.getUTCMonth() / 3); return { key: 'thisQuarter', label: 'This quarter', from: monthStart(endDate.getUTCFullYear(), q * 3), to: END }; },
    lastQuarter: () => { let q = Math.floor(endDate.getUTCMonth() / 3) - 1; let y = endDate.getUTCFullYear(); if (q < 0) { q = 3; y--; } return { key: 'lastQuarter', label: 'Last quarter', from: monthStart(y, q * 3), to: monthEnd(y, q * 3 + 2) }; },
    thisYear: () => ({ key: 'thisYear', label: 'This year', from: monthStart(endDate.getUTCFullYear(), 0), to: END }),
    last12m: () => ({ key: 'last12m', label: 'Last 12 months', from: END - 364, to: END }),
  };

  /* ---------- time phrases ---------- */
  function parseRange(t, notes) {
    let m;
    if (/\b(today|right now|so far today)\b/.test(t)) { notes.push("Today's job cards haven't closed yet, so I've used yesterday."); return { label: 'Yesterday', from: END, to: END }; }
    if (/\byesterday\b/.test(t)) return { label: 'Yesterday', from: END, to: END };
    if ((m = t.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/))) {
      const n = Number(m[1]);
      const days = m[2] === 'day' ? n : m[2] === 'week' ? n * 7 : Math.round(n * 30.4);
      if (days > 0) return { label: `Last ${n} ${m[2]}${n > 1 ? 's' : ''}`, from: END - days + 1, to: END };
    }
    const dow = (endDate.getUTCDay() + 6) % 7;
    const monday = END - dow;
    if (/\bthis week\b|\bweek to date\b|\bwtd\b/.test(t)) return { label: 'This week', from: monday, to: END };
    if (/\b(last|past|previous) week\b/.test(t)) return { label: 'Last week', from: monday - 7, to: monday - 1 };
    if (/\bthis month\b|\bmonth to date\b|\bmtd\b/.test(t)) return { label: 'This month', from: monthStart(endDate.getUTCFullYear(), endDate.getUTCMonth()), to: END };
    if (/\b(last|past|previous) month\b/.test(t)) { const y = endDate.getUTCFullYear(); const mo = endDate.getUTCMonth() - 1; return { label: 'Last month', from: monthStart(y, mo), to: monthEnd(y, mo) }; }
    if (/\bthis quarter\b|\bqtd\b/.test(t)) return PRESETS.thisQuarter();
    if (/\b(last|past|previous) quarter\b/.test(t)) return PRESETS.lastQuarter();
    if (/\bthis year\b|\bytd\b|year to date/.test(t)) return PRESETS.thisYear();
    const comparing = /\b(vs|versus|against|compared? (to|with)|than)\b.*last year/.test(t);
    if (/\blast year\b/.test(t) && !comparing) { const y = endDate.getUTCFullYear() - 1; return { label: String(y), from: monthStart(y, 0), to: monthEnd(y, 11) }; }
    if (/\b(last|past) 12 months\b|\bpast year\b/.test(t) && !comparing) return PRESETS.last12m();
    if ((m = t.match(/\bq([1-4])(?:\s+(20\d\d))?\b/))) {
      const q = Number(m[1]) - 1;
      let y = m[2] ? Number(m[2]) : endDate.getUTCFullYear();
      if (!m[2] && monthStart(y, q * 3) > END) y--;
      return { label: `Q${q + 1} ${y}`, from: monthStart(y, q * 3), to: Math.min(END, monthEnd(y, q * 3 + 2)) };
    }
    const named = MONTHS.map((name, i) => ({ name, i })).find(({ name }) => new RegExp(`\\b${name}\\b`).test(t) && (name !== 'may' || /\b(in|for|during|since|from) may\b/.test(t)));
    if (named) {
      const yr = t.match(new RegExp(`${named.name}\\s+(20\\d\\d)`));
      let y = yr ? Number(yr[1]) : endDate.getUTCFullYear();
      if (!yr && monthStart(y, named.i) > END) y--;
      const title = named.name[0].toUpperCase() + named.name.slice(1);
      if (new RegExp(`\\b(since|from) ${named.name}\\b`).test(t)) return { label: `Since ${title} ${y}`, from: monthStart(y, named.i), to: END };
      return { label: `${title} ${y}`, from: monthStart(y, named.i), to: Math.min(END, monthEnd(y, named.i)) };
    }
    return null;
  }

  /* ---------- entities ---------- */
  function findPerson(raw, t, list) {
    const hits = [];
    list.forEach((name, id) => {
      const first = name.split(' ')[0];
      if (t.includes(name.toLowerCase())) hits.push({ id, name, exact: true });
      else if (new RegExp(`\\b${first}\\b`).test(raw)) hits.push({ id, name, exact: false });
    });
    const exact = hits.filter((h) => h.exact);
    return exact.length ? exact : hits;
  }

  function parseEntities(raw, t) {
    const out = {};
    let m;
    if ((m = t.match(/\b(?:branch|site)\s*([123])\b/))) out.branch = Number(m[1]) - 1;
    if (/\b(all|every) (branch|branches|site|sites)\b|\bgroup[- ]wide\b/.test(t)) out.branch = null;
    const techNames = AS.TECHS.map((x) => x.name);
    const techs = findPerson(raw, t, techNames);
    if (techs.length > 1) out.ambiguous = techs.map((x) => x.name);
    else if (techs.length === 1) out.tech = techs[0].id;
    const advisors = findPerson(raw, t, AS.ADVISORS.map((x) => x.name));
    if (advisors.length === 1) out.advisor = advisors[0].id;

    const makeHit = [['BMW', /\bbmw\b/], ['Mercedes-Benz', /\bmercedes|\bmerc\b/], ['Jaguar', /\bjaguar\b|\bjag\b/], ['Audi', /\baudi\b/], ['Volkswagen', /\bvolkswagen\b|\bvw\b/], ['Ford', /\bford\b/]].find(([, re]) => re.test(t));
    if (makeHit) out.make = AS.MAKES.indexOf(makeHit[0]);

    const typeHit = [['MOT', /\bmots?\b/], ['Warranty', /\bwarrant/], ['Tyres', /\btyres?\b/], ['Internal', /\binternal\b/], ['Repair', /\brepairs?\b/], ['Service', /\b(service|services|servicing)\b(?! (advis|manager|department))/]].find(([, re]) => re.test(t));
    if (typeHit && !/customer service/.test(t)) out.type = AS.TYPES.indexOf(typeHit[0]);
    return out;
  }

  function defaultState() {
    return { topics: ['overview'], metrics: [], focus: null, range: PRESETS.last90(), compare: 'previous', branch: null, tech: null, type: null, make: null, advisor: null, by: null, grain: null, top: null, direction: null, why: false, hidden: [], question: '' };
  }

  /* ---------- interpret ---------- */
  const reply = (text, chips) => ({ kind: 'reply', text, chips: chips || [] });

  function interpret(question, prev) {
    const raw = question.trim().replace(/[’]/g, "'");
    const t = raw.toLowerCase();
    const body = t.replace(/after[\s-]?sales?/g, ' ');
    const scoped = /after[\s-]?sales?/.test(t);

    if (/^(hi|hello|hey|morning|good morning|thanks|thank you|cheers)\b[\s!.]*$/.test(t)) {
      return reply('Hello. Ask me how the workshop is performing and I\'ll build a dashboard from the job data.', ['How is my aftersales performing?']);
    }
    if (/^(yes|yep|apply( it| the plan)?|do it|go ahead|approve( it)?|confirm)\b/.test(t)) return { kind: 'approve' };
    if (/^undo\b/.test(t)) return { kind: 'undo' };
    const bayWord = /work ?bays?|\bbays?\b|\bramps?\b/.test(t);
    const techWord = /technicians?|\btechs?\b|unallocated/.test(t);
    if (/\b(fix|optimi[sz]e|improve|sort out)\b/.test(t) || /^(allocate|assign|book in)\b.*\b(unallocated|all|everything)\b/.test(t)) {
      return { kind: 'optimise', focus: bayWord && !techWord ? 'bays' : techWord && !bayWord ? 'techs' : 'all' };
    }
    if (WRITE.test(t)) {
      return { kind: 'reply', text: "I don't make one-off moves or post anything. I can work out a plan for the whole diary, and you approve it before anything changes.", chips: ['Fix my technician allocation'], planner: true };
    }
    if (/losing money|lose money|lost money|leak|wast(e|ed|ing)|on the table|work ?bays?|\bramps?\b/.test(t)) {
      const s = prev ? Object.assign({}, prev) : defaultState();
      Object.assign(s, { topics: ['leakage'], metrics: [], focus: null, why: false, by: null, tech: null, type: null, make: null, advisor: null, hidden: [], question: raw });
      const r = parseRange(t, []);
      if (r) s.range = r;
      const e = parseEntities(raw, body);
      if ('branch' in e) s.branch = e.branch;
      return { kind: 'dashboard', state: s, notes: [], refined: false };
    }
    if (/\b(open|show|go to|back to)\b.*\b(the )?(technician )?planner\b/.test(t) && !/\bload\b/.test(t)) {
      return { kind: 'nav', view: 'planner', text: 'Here\'s the Technician planner.' };
    }
    if ((/^(what('s| is| does)|define|explain|how (is|do you)|how do you)\b/.test(t) && /\b(mean|means|calculated?|work(ed)? out|defin|what is|what's)\b/.test(t)) || /^define\b/.test(t)) {
      const hit = METRIC_WORDS.find(([, re]) => re.test(body));
      if (hit && !/\b(my|our|branch|last|this|by)\b/.test(t) && t.split(/\s+/).length <= 6) {
        const m = M[hit[0]];
        return reply(`**${m.label}:** ${m.def}${m.target != null ? ` The demo target is ${AS.format(hit[0], m.target)}.` : ''}`, [`How is ${m.short.toLowerCase()} trending?`]);
      }
    }
    if (OUT_OF_SCOPE.test(body)) {
      return reply("I only have aftersales data here: workshop jobs, technicians, parts, health checks, customer scores and the planner. I can't answer that one.", ['How is my aftersales performing?']);
    }
    if (/\b(reset|clear|remove) (the )?(filters?|everything)\b|\bstart again\b/.test(t) && prev) {
      const s = Object.assign({}, prev, { branch: null, tech: null, type: null, make: null, advisor: null, hidden: [], range: PRESETS.last90(), compare: 'previous', question: raw });
      return { kind: 'dashboard', state: s, notes: ['Filters cleared.'], refined: true };
    }

    const hideMatch = t.match(/^(?:please )?(?:hide|remove|get rid of|take out)\s+(?:the\s+)?(.+?)[.?!]*$/);
    if (hideMatch && prev) {
      const term = hideMatch[1].replace(/\b(chart|widget|table|card|section|panel)\b/g, '').trim();
      const spec = buildSpec(prev);
      if (!term || !spec.widgets.some((w) => w.title && w.title.toLowerCase().includes(term))) {
        return reply(`I couldn't find "${hideMatch[1]}" on this dashboard. Use a word from the card's title.`);
      }
      return { kind: 'dashboard', state: Object.assign({}, prev, { hidden: prev.hidden.concat(term), question: raw }), notes: [`Removed "${term}".`], refined: true };
    }

    const notes = [];
    const range = parseRange(t, notes);
    const metrics = METRIC_WORDS.filter(([, re]) => re.test(body)).map(([k]) => k).filter((k, _, all) => !(k === 'labour' && all.includes('elr')) && !(k === 'sales' && (all.includes('parts') || all.includes('labour'))));
    const topicBody = BY_WORDS.reduce((acc, [, re]) => acc.replace(re, ' '), body).replace(/\b(all|every) (branch|branches|site|sites)\b/g, ' ');
    const topics = TOPIC_WORDS.filter(([, re]) => re.test(topicBody)).map(([k]) => k);
    const ents = parseEntities(raw, body);
    if (ents.ambiguous) {
      return reply(`Which one do you mean: ${ents.ambiguous.join(' or ')}?`, ents.ambiguous.map((n) => `How is ${n} performing?`));
    }

    const byHit = BY_WORDS.find(([, re]) => re.test(body));
    const grainHit = /\b(daily|by day|per day)\b/.test(body) ? 'day' : /\b(weekly|by week|per week)\b/.test(body) ? 'week' : /\b(monthly|by month|per month)\b/.test(body) ? 'month' : null;
    const compare = /year[- ]on[- ]year|\byoy\b|(vs|versus|against|compared? (to|with)|than) (the same .*)?last year/.test(t) ? 'year' : /(vs|versus|against|compared? (to|with)) (the )?previous/.test(t) ? 'previous' : null;
    const topM = body.match(/\b(top|best|bottom|worst|lowest|highest)\s+(\d{1,2})\b/);
    const direction = /\b(worst|bottom|lowest|under[- ]?(perform|util|used)|struggling|poor)/.test(body) ? 'low' : /\b(best|top|highest|strongest)\b/.test(body) ? 'high' : null;
    const notBreakdown = t.replace(/\b(break(ing)?|drill(ing)?|split(ting)?)\b.*\bdown\b/, ' ');
    const why = WHY.test(t) || (/\b(down|dropp?ed|falling|fell|declin\w*|worse)\b/.test(notBreakdown) && metrics.length > 0);
    const addMatch = /^(also |and )?(add|include|plus)\b/.test(t);
    const hasFilter = range || 'branch' in ents || ents.tech != null || ents.type != null || ents.make != null || ents.advisor != null || compare || byHit || grainHit;

    if (!metrics.length && !topics.length && !hasFilter && !scoped && !why) {
      return reply('I can\'t turn that into a dashboard yet. I can cover sales and profit, technician efficiency and utilisation, health checks, customer scores, branch comparisons and upcoming workshop load, for any period.', ['How is my aftersales performing?', 'Which technicians are under-utilised?', 'Compare my branches']);
    }

    const followUp = prev && !topics.includes('overview');
    const s = followUp && !(metrics.length && !prev) ? Object.assign({}, prev) : defaultState();
    if (!followUp) s.hidden = [];
    s.question = raw;
    // A filter-only follow-up keeps the question it refines, including a "why".
    const refinesOnly = followUp && !why && !topics.length && !metrics.length;
    if (!refinesOnly) { s.why = false; s.focus = null; }
    s.by = null; s.top = null; s.direction = null;

    // A new subject drops filters on one person, make or job type, which would
    // otherwise narrow the answer silently. Branch and period carry over, and say so.
    if (followUp && !addMatch && !why && (topics.length || metrics.length)) {
      s.tech = null; s.type = null; s.make = null; s.advisor = null; s.hidden = [];
      const kept = [];
      if (s.branch != null && !('branch' in ents)) kept.push(AS.BRANCHES[s.branch]);
      if (s.range.key !== 'last90' && !range) kept.push(s.range.label.toLowerCase());
      if (kept.length) notes.push(`Still showing ${kept.join(', ')} from your last question. Say "reset filters" to clear it.`);
    }
    if (range) s.range = range;
    if (compare) s.compare = compare;
    if ('branch' in ents) s.branch = ents.branch;
    ['tech', 'type', 'make', 'advisor'].forEach((k) => { if (ents[k] != null) s[k] = ents[k]; });
    if (grainHit) s.grain = grainHit;
    if (byHit) s.by = byHit[0];
    if (topM) s.top = Number(topM[2]);
    s.direction = direction;

    if (why) {
      s.why = true;
      s.focus = metrics[0] || (prev && prev.focus) || worstMetric(s);
      s.topics = ['why'];
      s.metrics = [s.focus];
    } else if (addMatch && prev && (topics.length || metrics.length)) {
      s.topics = [...new Set([...prev.topics.filter((x) => x !== 'why'), ...topics.filter((x) => x !== 'overview')])];
      s.metrics = [...new Set([...prev.metrics, ...metrics])];
      if (metrics.length && !topics.length && !s.topics.includes('metric')) s.topics.push('metric');
      s.focus = s.metrics[0] || null;
    } else if (topics.length || metrics.length) {
      const specific = topics.filter((x) => x !== 'overview');
      if (specific.length) {
        s.topics = specific;
        s.metrics = metrics;
        s.focus = metrics[0] || null;
      } else if (metrics.length) {
        s.topics = ['metric'];
        s.metrics = metrics.slice(0, 3);
        s.focus = metrics[0];
      } else {
        s.topics = ['overview'];
        s.metrics = [];
      }
    } else if (!prev) {
      s.topics = ['overview'];
    }
    if (ents.tech != null && s.topics.includes('overview')) { s.topics = ['technicians']; }

    const needsAttendance = (s.metrics.length ? s.metrics : s.focus ? [s.focus] : []).filter((k) => M[k].att);
    if (needsAttendance.length && !AS.attendanceValid(s) && s.topics[0] !== 'technicians') {
      return reply(`${M[needsAttendance[0]].label} can't be split by job type, make or advisor, because attendance is recorded per technician rather than per job. Efficiency can.`, [`Efficiency ${s.type != null ? 'on ' + AS.TYPES[s.type] + ' jobs' : 'by branch'}`]);
    }

    if (s.topics.includes('capacity') && s.branch != null && s.branch !== 0 && s.topics.length === 1) {
      return reply('Planner data in this demo only covers the Branch 1 main diary, so I can\'t show upcoming load for that branch.', ["What's coming up in the planner?"]);
    }

    if (s.topics[0] !== 'capacity') {
      if (s.range.to < AS.START || s.range.from > END) {
        return reply(`I have no job data for that period. The sample covers ${AS.fmtDay(AS.START)} to ${AS.fmtDay(END)}.`);
      }
      if (s.range.from < AS.START) {
        s.range = Object.assign({}, s.range, { from: AS.START });
        notes.push(`The sample data starts on ${AS.fmtDay(AS.START)}, so that period is shorter than you asked for.`);
      }
      const check = AS.summary(filterOf(s));
      if (!check.jobs) return reply(`There are no job cards matching that in ${s.range.label.toLowerCase()}. Try a wider period or fewer filters.`);
      if (s.compare === 'year' && !AS.prevRange(s.range, 'year')) {
        notes.push('The sample data doesn\'t go back far enough for a year-on-year comparison, so changes are hidden.');
      }
    }
    return { kind: 'dashboard', state: s, notes, refined: !!followUp };
  }

  /* ---------- helpers on state ---------- */
  function filterOf(s, range) {
    const r = range || s.range;
    return { from: r.from, to: r.to, branch: s.branch, tech: s.tech, type: s.type, make: s.make, advisor: s.advisor };
  }

  function prevFilterOf(s) {
    const r = AS.prevRange(s.range, s.compare);
    return r ? filterOf(s, r) : null;
  }

  const compareLabel = (s) => (s.compare === 'year' ? 'same period last year' : 'previous period');
  const usesAttendance = (s) => AS.attendanceValid(s);

  /** Largest shortfall against target, used when someone asks "why" without naming a metric. */
  function worstMetric(s) {
    const cur = AS.summary(filterOf(s));
    let worst = 'efficiency';
    let gap = -Infinity;
    ['efficiency', 'utilisation', 'vhcConv', 'csi', 'comeback'].forEach((k) => {
      if (M[k].att && !usesAttendance(s)) return;
      const v = AS.value(k, cur);
      if (v == null) return;
      const g = ((M[k].target - v) / M[k].target) * (M[k].up ? 1 : -1);
      if (g > gap) { gap = g; worst = k; }
    });
    return worst;
  }

  /* ---------- layouts ---------- */
  const KPI = {
    overview: ['sales', 'gp', 'efficiency', 'utilisation', 'vhcConv', 'csi'],
    financial: ['sales', 'labour', 'parts', 'gp', 'elr', 'aov'],
    technicians: ['soldHrs', 'clockedHrs', 'efficiency', 'utilisation', 'productivity'],
    vhc: ['vhcIdent', 'vhcSold', 'vhcConv', 'jobs'],
    customer: ['csi', 'comeback', 'leadDays', 'jobs'],
    branches: ['sales', 'gp', 'efficiency', 'utilisation', 'vhcConv', 'csi'],
  };

  const w = (type, title, extra) => Object.assign({ type, title, span: 6 }, extra);

  function layout(topic, s) {
    const focus = s.focus;
    switch (topic) {
      case 'overview': return [
        w('headline'),
        w('leak', 'Money left on the table', { span: 12 }),
        w('kpis', 'Headline numbers', { metrics: KPI.overview, span: 12 }),
        w('stack', 'Labour and parts sales', { span: 7 }),
        w('trend', 'Efficiency', { metric: 'efficiency', by: 'branch', span: 5 }),
        w('scorecard', 'Scorecard', { by: 'branch', span: 12 }),
        w('rank', 'Gross profit by job type', { metric: 'gp', by: 'type', span: 4 }),
        w('attention', 'What needs your attention', { span: 5 }),
        w('forward', 'Next 14 days', { span: 3 }),
      ];
      case 'financial': return [
        w('headline', null, { metric: focus || 'sales' }),
        w('kpis', 'Headline numbers', { metrics: KPI.financial, span: 12 }),
        w('stack', 'Labour and parts sales', { span: 12 }),
        w('rank', 'Gross profit by branch', { metric: 'gp', by: 'branch', span: 4 }),
        w('rank', 'Gross profit by job type', { metric: 'gp', by: 'type', span: 4 }),
        w('rank', 'Sales by make', { metric: 'sales', by: 'make', span: 4 }),
        w('seg', 'Sales mix by job type', { metric: 'sales', by: 'type', span: 12 }),
      ];
      case 'technicians': {
        const main = focus && ['efficiency', 'utilisation', 'productivity', 'soldHrs', 'clockedHrs'].includes(focus) ? focus : s.direction === 'low' ? 'utilisation' : 'efficiency';
        const other = main === 'utilisation' ? 'efficiency' : 'utilisation';
        if (s.tech != null) {
          return [
            w('headline', null, { metric: main }),
            w('kpis', 'Headline numbers', { metrics: KPI.technicians, span: 12 }),
            w('trend', `${M[main].label} over time`, { metric: main, by: null, span: 7 }),
            w('rank', 'Efficiency by job type', { metric: 'efficiency', by: 'type', span: 5 }),
          ];
        }
        return [
          w('headline', null, { metric: main }),
          w('kpis', 'Headline numbers', { metrics: KPI.technicians, span: 12 }),
          w('rank', `${M[main].label} by technician`, { metric: main, by: 'tech', span: 6, limit: s.top || 12, low: s.direction === 'low' }),
          w('rank', `${M[other].label} by technician`, { metric: other, by: 'tech', span: 6, limit: 12, low: s.direction === 'low' }),
          w('trend', `${M[main].label} over time`, { metric: main, by: 'branch', span: 12 }),
          w('heat', `${M.efficiency.label} by technician over time`, { metric: 'efficiency', by: 'tech', span: 12 }),
        ];
      }
      case 'vhc': return [
        w('headline', null, { metric: 'vhcConv' }),
        w('kpis', 'Headline numbers', { metrics: KPI.vhc, span: 12 }),
        w('trend', 'VHC conversion over time', { metric: 'vhcConv', by: 'branch', span: 7 }),
        w('rank', 'VHC conversion by advisor', { metric: 'vhcConv', by: 'advisor', span: 5, low: true }),
        w('rank', 'Work identified by branch', { metric: 'vhcIdent', by: 'branch', span: 6 }),
        w('rank', 'Work sold by branch', { metric: 'vhcSold', by: 'branch', span: 6 }),
      ];
      case 'customer': return [
        w('headline', null, { metric: focus === 'comeback' ? 'comeback' : 'csi' }),
        w('kpis', 'Headline numbers', { metrics: KPI.customer, span: 12 }),
        w('trend', 'Customer satisfaction over time', { metric: 'csi', by: 'branch', span: 6 }),
        w('trend', 'Comeback rate over time', { metric: 'comeback', by: 'branch', span: 6 }),
        w('rank', 'Comeback rate by technician', { metric: 'comeback', by: 'tech', span: 6, limit: 10 }),
        w('rank', 'Customer satisfaction by advisor', { metric: 'csi', by: 'advisor', span: 6 }),
      ];
      case 'branches': return [
        w('headline', null, { metric: focus || 'sales' }),
        w('scorecard', 'Branch league table', { by: 'branch', span: 12 }),
        w('trend', 'Sales by branch', { metric: 'sales', by: 'branch', span: 6, zeroBase: true }),
        w('trend', 'Efficiency by branch', { metric: 'efficiency', by: 'branch', span: 6 }),
        w('rank', 'Gross profit by branch', { metric: 'gp', by: 'branch', span: 4 }),
        w('rank', 'VHC conversion by branch', { metric: 'vhcConv', by: 'branch', span: 4 }),
        w('rank', 'Customer satisfaction by branch', { metric: 'csi', by: 'branch', span: 4 }),
      ];
      case 'leakage': return [
        w('headline'),
        w('leak', 'Money left on the table', { span: 12 }),
        w('bayuse', 'Workbay use, most blocked first', { span: 6 }),
        w('techleak', 'Lost technician time by person', { span: 6 }),
      ];
      case 'capacity': return [
        w('capacity-head'),
        w('capacity-chart', 'Hours available and unallocated, next 14 days', { span: 8 }),
        w('capacity-absent', 'Technicians away', { span: 4 }),
      ];
      case 'why': return [
        w('headline', null, { metric: focus, why: true }),
        w('kpis', 'The change', { metrics: focus ? [focus] : [], hero: true, span: 12 }),
        w('trend', `${M[focus].label} over time`, { metric: focus, by: 'branch', span: 12 }),
        w('drivers', 'What moved it, by branch', { metric: focus, by: 'branch', span: 4 }),
        w('drivers', 'What moved it, by technician', { metric: focus, by: 'tech', span: 4 }),
        w('drivers', 'What moved it, by job type', { metric: focus, by: 'type', span: 4 }),
      ];
      case 'metric': {
        const out = [w('headline', null, { metric: s.metrics[0] })];
        if (s.metrics.length === 1) out.push(w('kpis', M[s.metrics[0]].label, { metrics: s.metrics, hero: true, span: 12 }));
        else out.push(w('kpis', 'Headline numbers', { metrics: s.metrics, span: 12 }));
        s.metrics.forEach((k) => {
          out.push(w('trend', `${M[k].label} over time`, { metric: k, by: 'branch', span: 12, zeroBase: M[k].kind === 'gbp' || M[k].kind === 'hrs' }));
        });
        const k = s.metrics[0];
        ['tech', 'type', 'advisor'].forEach((d) => out.push(w('rank', `${M[k].label} by ${dimName(d)}`, { metric: k, by: d, span: 4, limit: s.top || 10, low: s.direction === 'low' })));
        return out;
      }
      default: return [];
    }
  }

  function dimName(d) { return { branch: 'branch', tech: 'technician', type: 'job type', make: 'make', advisor: 'advisor' }[d]; }

  /** Adjusts a layout to the active filters so no widget shows a meaningless split. */
  function adapt(widgets, s) {
    const fixed = { branch: s.branch, tech: s.tech, type: s.type, make: s.make, advisor: s.advisor };
    const attOk = usesAttendance(s);
    const bks = AS.buckets(s.range, s.grain);
    const out = [];
    const prev = AS.prevRange(s.range, s.compare);
    widgets.forEach((src) => {
      const x = Object.assign({}, src);
      if (x.metric && M[x.metric].att && !attOk) return;
      if (['leak', 'bayuse', 'techleak'].includes(x.type) && !attOk) return;
      if (x.type === 'bayuse' && fixed.tech != null) return;
      if (x.metrics) x.metrics = x.metrics.filter((k) => !(M[k].att && !attOk));
      if (x.type === 'scorecard' && fixed.branch != null) { x.by = 'tech'; x.title = 'Technician scorecard'; }
      if (x.type === 'scorecard' && fixed.tech != null) return;
      if (x.type === 'trend' && x.by && fixed[x.by] != null) x.by = null;
      if ((x.type === 'rank' || x.type === 'seg') && fixed[x.by] != null) return;
      if (x.type === 'heat' && (fixed.tech != null || !attOk && x.metric !== 'efficiency')) return;
      if (x.type === 'drivers' && (fixed[x.by] != null || !prev)) return;
      if (x.type === 'drivers' && M[x.metric].att && !AS.DIM[x.by].att) return;
      if ((x.type === 'trend' || x.type === 'stack' || x.type === 'heat') && bks.length < 3) return;
      if (x.type === 'forward' && fixed.branch != null && fixed.branch !== 0) return;
      out.push(x);
    });
    // A dropped neighbour can leave a row short, so let the last card fill the row.
    return out;
  }

  /** Repacks spans so that every row of the 12-column grid is full. */
  function pack(widgets) {
    let row = [];
    let used = 0;
    const flush = () => {
      if (!row.length) return;
      if (used < 12) {
        const each = Math.floor(12 / row.length);
        row.forEach((r) => { r.span = each; });
        row[row.length - 1].span = 12 - each * (row.length - 1);
      }
      row = [];
      used = 0;
    };
    widgets.forEach((x) => {
      if (x.type === 'headline' || x.type === 'capacity-head') { flush(); x.span = 12; return; }
      if (used + x.span > 12) flush();
      row.push(x);
      used += x.span;
      if (used >= 12) flush();
    });
    flush();
    return widgets;
  }

  function filterChips(s) {
    const out = [];
    if (s.tech != null) out.push(AS.TECHS[s.tech].name);
    if (s.type != null) out.push(AS.TYPES[s.type]);
    if (s.make != null) out.push(AS.MAKES[s.make]);
    if (s.advisor != null) out.push(AS.ADVISORS[s.advisor].name);
    return out;
  }

  const TOPIC_TITLE = {
    overview: 'Aftersales performance', financial: 'Sales and profit', technicians: 'Technician performance',
    leakage: 'Where the money is going', vhc: 'Vehicle health checks', customer: 'Customer experience', branches: 'Branch comparison', capacity: 'Upcoming workshop load',
  };

  function buildSpec(s) {
    let widgets = [];
    const seen = new Set();
    s.topics.forEach((topic) => {
      layout(topic, s).forEach((x) => {
        const id = `${x.type}|${x.metric || ''}|${x.by || ''}|${x.title || ''}`;
        const singleton = ['headline', 'kpis'].includes(x.type);
        if (seen.has(id) || (singleton && seen.has(x.type))) return;
        seen.add(id);
        if (singleton) seen.add(x.type);
        widgets.push(x);
      });
    });

    // "by technician" on any question adds that split straight after the numbers.
    if (s.by && s.topics[0] !== 'capacity') {
      const k = s.focus || s.metrics[0] || 'sales';
      if (!widgets.some((x) => x.type === 'rank' && x.by === s.by && x.metric === k)) {
        const at = widgets.findIndex((x) => x.type === 'kpis');
        widgets.splice(at + 1, 0, w('rank', `${M[k].label} by ${dimName(s.by)}`, { metric: k, by: s.by, span: 12, limit: s.top || 12, low: s.direction === 'low' }));
      }
    }

    widgets = adapt(widgets, s);
    if (s.hidden.length) widgets = widgets.filter((x) => !x.title || !s.hidden.some((h) => x.title.toLowerCase().includes(h)));
    widgets = pack(widgets);

    const forward = s.topics.length === 1 && s.topics[0] === 'capacity';
    let title;
    if (s.topics[0] === 'why') title = `Why ${M[s.focus].label.toLowerCase().replace('vhc', 'VHC')} moved`;
    else if (s.topics[0] === 'metric') title = s.metrics.map((k) => M[k].label).join(', ');
    else title = s.topics.length > 1 ? s.topics.map((x) => TOPIC_TITLE[x] || 'More').slice(0, 2).join(' and ') : TOPIC_TITLE[s.topics[0]];

    return { title, widgets, forward, chips: filterChips(s), crumb: title };
  }

  return { interpret, buildSpec, defaultState, filterOf, prevFilterOf, compareLabel, PRESETS, worstMetric, dimName };
})();
