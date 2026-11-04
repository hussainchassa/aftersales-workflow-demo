/* Navigation, breadcrumbs, view switching and the shared click handler. */
window.App = (function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const main = document.getElementById('main');

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

  const S = { view: 'planner', dash: null, navQuery: '' };

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function find(id, list) {
    for (const n of list || NAV) {
      if (n.id === id) return n;
      const hit = n.children && find(id, n.children);
      if (hit) return hit;
    }
    return null;
  }

  function navHtml(list, level) {
    return list.map((n) => {
      const hasKids = !!n.children;
      const active = (n.view === 'planner' && S.view === 'planner') || (n.view === 'dashboard' && S.view === 'dashboard');
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
      const hits = flatMatches(NAV, S.navQuery, []);
      nav.innerHTML = hits.length
        ? hits.map((n) => `<button class="nv ${n.view === S.view ? 'on' : ''}" data-a="nav" data-v="${n.id}">${ic(n.icon || 'right')}<span>${esc(n.label)}</span></button>`).join('')
        : '<div class="nav-none">No matches</div>';
      return;
    }
    nav.innerHTML = navHtml(NAV, 0);
  }

  function renderCrumb() {
    const c = document.getElementById('crumb');
    const sep = '<span aria-hidden="true">/</span>';
    if (S.view === 'plan') {
      c.innerHTML = `<button data-a="inert">Workshop</button>${sep}<span>Planning</span>${sep}<b>Improvement plan</b>`;
    } else if (S.view === 'planner') {
      c.innerHTML = `<button data-a="inert">Workshop</button>${sep}<span>Planning</span>${sep}<span>Planner</span>${sep}<b>Technician</b>`;
    } else {
      c.innerHTML = `<button data-a="inert">Workshop</button>${sep}<span>Reporting</span>${sep}<span>AI dashboard</span>${sep}<b>${esc(S.dash.spec.crumb)}</b>`;
    }
  }

  function addDashboardNav() {
    const reporting = find('reporting');
    if (!find('aidash')) reporting.children.push({ id: 'aidash', label: 'AI dashboard', view: 'dashboard' });
    reporting.open = true;
  }

  function showPlanner() {
    S.view = 'planner';
    window.Workshop.render(main, false);
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
  }

  function showDashboard(state, spec, mode) {
    S.view = 'dashboard';
    S.dash = { state, spec };
    addDashboardNav();
    if (mode === 'skeleton') window.Dashboard.skeleton(main, state, spec);
    else window.Dashboard.render(main, state, spec, mode === 'animate');
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
  }

  function showPlan() {
    S.view = 'plan';
    window.Workshop.clearPreview();
    window.Optimiser.render(main, window.Copilot.plan());
    renderNav();
    renderCrumb();
    window.Copilot.setContext();
  }

  function refresh() {
    if (S.view === 'dashboard' && S.dash) window.Dashboard.render(main, S.dash.state, S.dash.spec, false);
  }

  const ACTIONS = {
    chat: () => window.Copilot.setOpen(!window.Copilot.isOpen()),
    ask: (el) => window.Copilot.send(el.dataset.v),
    reopen: (el) => window.Copilot.reopen(el.dataset.v),
    'go-planner': () => { window.Workshop.clearPreview(); showPlanner(); },
    'go-dash': () => { if (S.dash) showDashboard(S.dash.state, S.dash.spec, 'instant'); else showPlanner(); },
    'pl-view': (el) => window.Workshop.setView(main, el.dataset.v),
    'plan-apply': () => window.Copilot.applyPlan(),
    'plan-undo': () => window.Copilot.undoPlan(),
    'plan-back': showPlan,
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
      if (n.view === 'dashboard') { if (S.dash) showDashboard(S.dash.state, S.dash.spec, 'instant'); return; }
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
    view: () => S.view, toast, showPlanner, showDashboard, showPlan, refresh,
    start() {
      renderCrumb();
      showPlanner();
      // Lets a presenter deep-link a question: index.html?ask=How%20is%20my%20aftersales%20performing
      const ask = new URLSearchParams(location.search).get('ask');
      if (ask) window.Copilot.send(ask);
    },
  };
})();
window.App.start();
