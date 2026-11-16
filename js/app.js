/*
 * The Applications screen, the two apps it opens, navigation, breadcrumbs, view
 * switching and the shared click handler. Like the real DMS, Service (the planner)
 * and BI (agentic reporting) are separate apps: each has its own menu, landing view
 * and AI Assistance conversation, and nothing links one to the other.
 */
window.App = (function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const main = document.getElementById('main');

  // The DMS application tiles. Only Service and BI open in this prototype.
  const APPS = [
    ['Accounts Payable', 'in', '#3a8a0e'], ['Accounts Receivable', 'out', '#1f2147'], ['Administration', 'sliders', '#47515f'],
    ['BI', 'bi', '#4b0b6e', 'bi'], ['Cash Book', 'book', '#566b2a'], ['Cashier', 'till', '#00757a'],
    ['CRM', 'hands', '#5056bd'], ['DataPoint', 'trend', '#175c3b'], ['Fixed Assets', 'building', '#b0386d'],
    ['General Ledger', 'ledger', '#c81e1e'], ['Parts', 'disc', '#722b40'], ['Purchase Ordering', 'doc', '#2747b0'],
    ['Service', 'tools', '#c4103a', 'service'], ['Vehicles', 'car', '#9c1a59'], ['Warranty', 'badge', '#00785a'],
  ];

  const LOCATION = { service: 'UK - Branch 1 - Workshop - Main Diary', bi: 'Pinewood Motors' };

  const NAV = [
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'planning', label: 'Planning', icon: 'calendar', open: true, children: [
      { id: 'planner', label: 'Planner', open: true, children: [
        { id: 'arrival', label: 'Arrival Advisor' },
        { id: 'loan', label: 'Loan Vehicle' },
        { id: 'technician', label: 'Technician', view: 'planner' },
        { id: 'wyw', label: 'While You Wait' },
      ] },
    ] },
    { id: 'bookings', label: 'Bookings', icon: 'tools', children: [] },
    { id: 'jobs', label: 'Jobs', icon: 'clip', children: [] },
    { id: 'progress', label: 'Job Progress', icon: 'progress', children: [] },
    { id: 'invoicing', label: 'Invoicing', icon: 'invoice', children: [] },
    { id: 'time', label: 'Time Analysis', icon: 'clock', children: [] },
    { id: 'reporting', label: 'Reporting', icon: 'report', children: [] },
    { id: 'tyre', label: 'Tyre Hotel', icon: 'tyre', children: [] },
    { id: 'settings', label: 'Settings', icon: 'cog', children: [] },
  ];

  // BI's menu: the reports built by asking AI Assistance, newest first.
  const BI_NAV = [{ id: 'reports', label: 'Reports', icon: 'report', open: true, children: [] }];

  // app: null on the Applications screen. last: where each app was left, to return to it.
  const S = { app: null, view: 'launcher', dash: null, navQuery: '', last: { service: 'planner', bi: 'bi-home' }, chatOpen: { service: false, bi: true } };
  const navList = () => (S.app === 'bi' ? BI_NAV : NAV);

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function find(id, list) {
    for (const n of list || navList()) {
      if (n.id === id) return n;
      const hit = n.children && find(id, n.children);
      if (hit) return hit;
    }
    return null;
  }

  function navHtml(list, level) {
    return list.map((n) => {
      const hasKids = !!n.children;
      const active = (n.view === 'planner' && S.view === 'planner') || (n.view === 'dashboard' && S.view === 'dashboard' && S.dash && S.dash.seq === n.seq);
      const cls = ['nv', level ? `l${level + 1}` : '', n.open && hasKids ? 'open' : '', active ? 'on' : ''].join(' ');
      const chev = hasKids ? ic(n.open ? 'down' : 'right', 'chev') : '';
      const kids = hasKids && n.open ? navHtml(n.children, level + 1) : '';
      return `<button class="${cls}" data-a="nav" data-v="${n.id}" ${hasKids ? `aria-expanded="${!!n.open}"` : ''} ${active ? 'aria-current="page"' : ''} title="${esc(n.label)}">${n.icon ? ic(n.icon) : ''}<span>${esc(n.label)}</span>${chev}</button>${kids}`;
    }).join('');
  }

  function flatMatches(list, q, out) {
    list.forEach((n) => {
      if (n.label.toLowerCase().includes(q)) out.push(n);
      if (n.children) flatMatches(n.children, q, out);
    });
    return out;
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (S.navQuery) {
      const hits = flatMatches(navList(), S.navQuery, []);
      nav.innerHTML = hits.length
        ? hits.map((n) => `<button class="nv ${n.view === S.view ? 'on' : ''}" data-a="nav" data-v="${n.id}">${ic(n.icon || 'right')}<span>${esc(n.label)}</span></button>`).join('')
        : '<div class="nav-none">No matches</div>';
      return;
    }
    nav.innerHTML = navHtml(navList(), 0);
  }

  function renderCrumb() {
    const c = document.getElementById('crumb');
    const sep = '<span aria-hidden="true">/</span>';
    if (S.view === 'launcher') {
      c.innerHTML = '<b>Applications</b>';
    } else if (S.view === 'call') {
      c.innerHTML = `<span>Service</span>${sep}<span>Bookings</span>${sep}<b>Live call</b>`;
    } else if (S.view === 'plan') {
      c.innerHTML = `<span>Service</span>${sep}<span>Planning</span>${sep}<b>Improvement plan</b>`;
    } else if (S.view === 'planner') {
      c.innerHTML = `<span>Service</span>${sep}<span>Planning</span>${sep}<span>Planner</span>${sep}<b>Technician</b>`;
    } else if (S.view === 'bi-home') {
      c.innerHTML = '<b>BI</b>';
    } else {
      c.innerHTML = `<span>BI</span>${sep}<span>Reports</span>${sep}<b>${esc(S.dash.spec.crumb)}</b>`;
    }
    document.getElementById('loc').textContent = LOCATION[S.app] || '';
  }

  /** Lists a report under BI's Reports menu, newest first. */
  function addReport(seq, title) {
    const reports = BI_NAV[0];
    if (reports.children.some((n) => n.seq === seq)) return;
    reports.children.unshift({ id: `report-${seq}`, label: title, view: 'dashboard', seq });
    reports.open = true;
    renderNav();
  }

  /* ---------- the Applications screen ---------- */

  function showLauncher() {
    if (window.Call && window.Call.live()) { toast('Finish or restart the call before leaving Service'); return; }
    if (S.app) { S.last[S.app] = S.view; S.chatOpen[S.app] = window.Copilot.isOpen(); }
    window.Copilot.setOpen(false, true);
    S.app = null;
    S.view = 'launcher';
    document.body.classList.add('at-launcher');
    window.Workshop.clearPreview();
    main.innerHTML = `<div class="apps"><section class="apps-card" aria-labelledby="apps-h"><h1 id="apps-h">Applications</h1>
      <div class="apps-grid">${APPS.map(([label, icon, colour, app]) => `<button class="app-tile" style="--tile:${colour}" data-a="app" data-v="${app || ''}">${ic(icon)}<span>${esc(label)}</span></button>`).join('')}</div></section></div>`;
    renderCrumb();
    syncCall();
  }

  /** Opens Service or BI where it was left, with its own menu and conversation. */
  function openApp(app) {
    if (!app) { toast('Not part of this prototype'); return; }
    S.app = app;
    S.navQuery = '';
    document.getElementById('nav-filter').value = '';
    document.body.classList.remove('at-launcher');
    window.Copilot.setMode(app);
    const last = S.last[app];
    if (app === 'bi') {
      if (last === 'dashboard' && S.dash) showDashboard(S.dash.state, S.dash.spec, 'instant', S.dash.seq);
      else showBiHome();
    } else if (last === 'call' && window.Call && window.Call.state().caller) showCall();
    else if (last === 'plan' && window.Copilot.plan()) showPlan();
    else showPlanner();
    if (S.chatOpen[app]) window.Copilot.setOpen(true);
  }

  function showBiHome() {
    S.view = 'bi-home';
    main.innerHTML = '<div class="bi-home" aria-label="BI"></div>';
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
  }

  // A live call follows the user round the app as a strip, so every view re-checks it.
  const syncCall = () => { if (window.CallView) window.CallView.sync(); };

  function showPlanner() {
    S.view = 'planner';
    window.Workshop.render(main, false);
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
    syncCall();
  }

  function showCall() {
    S.view = 'call';
    window.Workshop.clearPreview();
    window.CallView.render(main);
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
    syncCall();
  }

  function showDashboard(state, spec, mode, seq) {
    S.view = 'dashboard';
    S.dash = { state, spec, seq: seq != null ? seq : S.dash && S.dash.seq };
    if (mode === 'skeleton') window.Dashboard.skeleton(main, state, spec);
    else window.Dashboard.render(main, state, spec, mode === 'animate');
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
    syncCall();
  }

  function showPlan() {
    S.view = 'plan';
    window.Workshop.clearPreview();
    window.Optimiser.render(main, window.Copilot.plan());
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
    syncCall();
  }

  function refresh() {
    if (S.view === 'dashboard' && S.dash) window.Dashboard.render(main, S.dash.state, S.dash.spec, false);
  }

  const ACTIONS = {
    chat: () => window.Copilot.setOpen(!window.Copilot.isOpen()),
    'chat-new': () => window.Copilot.newChat(),
    'chat-jump': () => window.Copilot.jump(),
    'chat-steps': (el) => window.Copilot.toggleSteps(el.dataset.m),
    ask: (el) => window.Copilot.send(el.dataset.v),
    reopen: (el) => window.Copilot.reopen(el.dataset.v),
    apps: showLauncher,
    app: (el) => openApp(el.dataset.v || null),
    'go-planner': () => { window.Workshop.clearPreview(); showPlanner(); },
    'pl-view': (el) => window.Workshop.setView(main, el.dataset.v),
    'plan-apply': () => window.Copilot.applyPlan(),
    'plan-undo': () => window.Copilot.undoPlan(),
    'plan-back': () => {
      // A booking preview has no plan screen behind it, only the chat.
      if ((window.Copilot.plan() || {}).booking) { window.Workshop.clearPreview(); showPlanner(); } else showPlan();
    },
    'plan-preview': () => { window.Workshop.preview(window.Copilot.plan()); showPlanner(); },
    collapse: () => {
      const shell = document.getElementById('shell');
      shell.classList.toggle('mini');
      document.getElementById('collapse').setAttribute('aria-label', shell.classList.contains('mini') ? 'Expand navigation' : 'Collapse navigation');
    },
    inert: (el) => {
      if (el.tagName === 'INPUT') el.checked = false;
      toast('Not part of this prototype');
    },
    nav: (el) => {
      const n = find(el.dataset.v);
      if (!n) return;
      if (n.view === 'planner') { showPlanner(); return; }
      if (n.view === 'dashboard') { window.Copilot.reopen(n.seq); return; }
      if (document.getElementById('shell').classList.contains('mini')) document.getElementById('collapse').click();
      if (n.children && n.children.length) { n.open = !n.open; renderNav(); return; }
      toast('Not part of this prototype');
    },
    'pl-search': () => { if (!window.Workshop.search(main)) toast('Choose a valid date range'); },
    'pl-day': (el) => window.Workshop.toggleDay(main, el.dataset.v),
    'w-view': (el) => {
      const card = el.closest('.w');
      const showing = el.getAttribute('aria-pressed') === 'true';
      el.setAttribute('aria-pressed', String(!showing));
      el.innerHTML = ic(showing ? 'table' : 'chart');
      el.title = showing ? 'Table view' : 'Chart view';
      card.querySelector('.w-b').classList.toggle('hide', !showing);
      card.querySelector('.w-t').classList.toggle('hide', showing);
    },
    'df-clear': () => window.Copilot.applyFilter('clear'),
    'bk-type': (el) => window.Copilot.bookingType(el.dataset.m, el.dataset.v),
    'bk-next': (el) => window.Copilot.nextStep(el.dataset.m),
    'bx-tick': (el) => window.Copilot.toggleExtra(el.dataset.m, el.dataset.v),
    'bx-more': (el) => window.Copilot.toggleMore(el.dataset.m),
    'bx-find': (el) => window.Copilot.findTechnician(el.dataset.m),
    'bk-book': (el) => window.Copilot.book(el.dataset.m, el.dataset.v),
    'bk-preview': (el) => window.Copilot.previewBooking(el.dataset.m, el.dataset.v),
    'call-start': () => window.Call.start(),
    'call-open': showCall,
    'call-pause': () => window.Call.togglePause(),
    'call-restart': () => window.Call.restart(),
    'call-take': () => toast('Not part of this prototype'),
  };

  // Booking form fields live in chat messages that repaint, so their values are kept on the message.
  document.addEventListener('input', (e) => {
    const field = e.target.dataset && e.target.dataset.bf;
    if (field) window.Copilot.formInput(e.target.dataset.m, field, e.target.value);
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    if (el.tagName !== 'INPUT') e.preventDefault();
    const fn = ACTIONS[el.dataset.a];
    if (fn) fn(el);
  });

  document.addEventListener('change', (e) => {
    const name = e.target.dataset && e.target.dataset.df;
    if (name) window.Copilot.applyFilter(name, e.target.value);
    const item = e.target.dataset && e.target.dataset.pi;
    if (item) window.Optimiser.toggle(main, window.Copilot.plan(), item, e.target.checked);
    // Mileage is applied when the advisor leaves the field, so typing isn't interrupted.
    if (e.target.dataset && e.target.dataset.bx === 'mileage') window.Copilot.extrasMileage(e.target.dataset.m, e.target.value);
  });

  document.getElementById('nav-filter').addEventListener('input', (e) => {
    S.navQuery = e.target.value.trim().toLowerCase();
    renderNav();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.Copilot.isOpen()) window.Copilot.setOpen(false);
  });

  return {
    view: () => S.view, app: () => S.app, toast, showPlanner, showDashboard, showPlan, showCall, showLauncher, openApp, addReport, refresh,
    start() {
      const params = new URLSearchParams(location.search);
      // Presenter links: ?app=service or ?app=bi open an app; ?ask= goes to BI, ?call=1 to Service.
      const ask = params.get('ask');
      const call = params.get('call');
      const app = call ? 'service' : ask ? 'bi' : params.get('app');
      if (app === 'service' || app === 'bi') openApp(app); else showLauncher();
      if (ask) window.Copilot.send(ask);
      if (call) window.Call.start();
    },
  };
})();
window.App.start();
