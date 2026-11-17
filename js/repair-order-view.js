/*
 * Service's Repair Order Progress (Detailed) board and the repair order page, simple
 * copies of the DMS screens. Recommended Work carries the one-click "Get approval and
 * order": the AI agent phones the customer, then adds the work, orders the parts and
 * books the return visit (see Call.startApproval).
 */
window.RepairOrderView = (function () {
  'use strict';

  const AS = window.AS;
  const RO = window.RepairOrders;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const num = (v) => Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gbp = (v) => `£${Math.round(v).toLocaleString('en-GB')}`;

  /** DMS-style date and time, e.g. 11/4/2026 5:00 PM. */
  function when([date, hour]) {
    const [y, m, d] = date.split('-').map(Number);
    const h = Math.floor(hour);
    const mins = String(Math.round((hour % 1) * 60)).padStart(2, '0');
    return `${m}/${d}/${y} ${h % 12 || 12}:${mins} ${h < 12 ? 'AM' : 'PM'}`;
  }

  const ui = { expanded: true };

  /* ---------- Repair Order Progress (Detailed) ---------- */

  const PANELS = {
    'Due In': [['Vehicle Arrived, Not Received', 33], ['Repair Orders Not Arrived', 203], ['Appointments Not Arrived', 17]],
    'Health Check Progress': [['Awaiting Parts', 11], ['Awaiting Approval', 13], ['Awaiting Sending', 21], ['Awaiting Labor', 112]],
    'Work In Progress': [['Not Started', 1547], ['Work In Progress', 193, 'wip'], ['Resume', 23], ['Awaiting Authorization', 24], ['On Hold', 27], ['Quality Control', 1], ['60-Day Warranty Claim Authorisation', 2]],
    'Due Out': [['Completed', 150], ['Costed', 0], ['Contacted', 0]],
  };

  const CARD_ICONS = ['car', 'clip', 'doc', 'invoice', 'phone', 'tools', 'user', 'book', 'info'];

  function jobCard(ro) {
    const pending = ro.findings.some((f) => f.status === 'recommended');
    return `<div class="ro-card">
      <div class="ro-card-top"><div class="ro-card-who">
        <button class="ro-lnk" data-a="ro-open" data-v="${ro.id}">${esc(ro.customer)} ›</button>
        <button class="ro-lnk" data-a="ro-open" data-v="${ro.id}">${esc(ro.reg)} ›</button>
        <span class="ro-veh">${esc(ro.vehicle)} - ${ro.id}</span></div>
        <div class="ro-card-icons">${pending ? `<span class="ro-rec">${ic('alert', 'sm')}Recommended work</span>` : ''}${CARD_ICONS.map((n) => ic(n, 'sm')).join('')}</div></div>
      <div class="ro-out">Out: ${esc(when(ro.out))}</div><span class="ro-more">${ic('down', 'sm')}</span></div>`;
  }

  function row([label, count, key]) {
    const open = key === 'wip' && ui.expanded;
    const badge = count ? `<span class="ro-badge">${count}</span>` : '<span class="ro-zero">0</span>';
    const chev = count ? ic(open ? 'down' : 'right', 'sm') : '<span class="ro-nochev"></span>';
    const head = key === 'wip'
      ? `<button class="ro-row" data-a="ro-expand" aria-expanded="${open}"><span>${esc(label)}</span>${badge}${chev}</button>`
      : `<div class="ro-row"><span>${esc(label)}</span>${badge}${chev}</div>`;
    return open ? `${head}<div class="ro-cards">${RO.list().map(jobCard).join('')}</div>` : head;
  }

  const panel = (title) => `<section class="ro-panel"><h2>${esc(title)}</h2>${PANELS[title].map(row).join('')}</section>`;

  function renderProgress(mount) {
    mount.innerHTML = `<div class="ro-page"><div class="ro-tools"><span class="sp"></span>${ic('report', 'sm')}${ic('dn', 'sm')}${ic('up', 'sm')}</div>
      <div class="ro-prep">Preparation: Included</div>
      <div class="ro-board"><div class="ro-col">${panel('Due In')}${panel('Health Check Progress')}</div><div class="ro-col">${panel('Work In Progress')}</div><div class="ro-col">${panel('Due Out')}</div></div></div>`;
  }

  /* ---------- the repair order page ---------- */

  const TABS = ['Customer/Vehicle', 'Reminders', 'Repair Order Details', 'Repair Details', 'Recommended Work', 'Insurance Excess', 'Purchase Order', 'Upsell', 'Follow Up', 'Overview'];
  const LIVE_TABS = ['Repair Details', 'Recommended Work'];
  const HEAD_ICONS = ['clock', 'calendar', 'restart', 'play', 'invoice', 'table', 'doc', 'pin', 'tyre', 'phone', 'car', 'search', 'tools', 'book', 'new'];

  function detailsTable(ro) {
    const depth = { requirement: 0, operation: 1, labor: 2, part: 2, nonlabor: 2, environmental: 3 };
    const type = { requirement: 'Requirement', operation: 'Operation', labor: 'Labor', part: 'Part', environmental: 'Environmental Charge', nonlabor: 'Non-Labor' };
    const rows = ro.lines.map((l, i) => {
      const price = l.kind === 'requirement' || l.kind === 'operation' ? RO.rollup(ro, i) : l.price;
      const label = l.kind === 'requirement' ? `${l.code} - ${l.desc}` : l.kind === 'operation' ? `${l.code} - ${l.desc}` : l.desc;
      const parent = l.kind === 'requirement' || l.kind === 'operation';
      return `<tr class="rd-${l.kind} ${l.isNew ? 'rd-new' : ''}">
        <td><span class="rd-d" style="--d:${depth[l.kind]}">${parent ? ic('down', 'sm') : ''}${esc(label)}</span></td>
        <td>${type[l.kind]}</td><td class="n">${l.load ? num(l.load) : ''}</td><td class="n">${l.aws ? num(l.aws) : ''}</td>
        <td class="n">${l.qty ? num(l.qty) : ''}</td><td class="n">${price != null ? num(price) : ''}</td><td>${esc(l.account || '')}</td>
        <td>${l.kind === 'operation' && l.account ? ic('check', 'sm ok') : ''}</td><td></td><td class="rd-st">${esc(l.status || '')}</td>
        <td class="rd-acts">${parent || l.kind === 'part' || l.kind === 'nonlabor' ? ic('new', 'sm') : ''}</td></tr>`;
    }).join('');
    return `<div class="ro-sheet"><div class="rd-add">${ic('up', 'sm')}<span class="sp"></span><span title="Add">+</span></div>
      <div class="tw"><table class="rd"><thead><tr><th>Description</th><th>Type</th><th class="n">Load Hours</th><th class="n">Invoice AWs</th><th class="n">Quantity</th><th class="n">Price</th><th>Account</th><th>Parts</th><th>Fixed</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function findingHtml(ro, f) {
    const price = RO.findingPrice(f);
    const today = window.Workshop.snapshot().today;
    const parts = f.parts.map(([p, qty]) => {
      const a = window.Parts.availability(p, qty, AS.toIso(AS.toN(today) + 5), today);
      const day = (iso) => AS.dateOf(AS.toN(iso)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      const where = a.source === 'shelf' ? 'On the shelf' : a.source === 'transfer' ? `Transfer from ${a.from}, arrives ${day(a.arrives)}` : a.source === 'order' ? `Supplier, arrives ${day(a.arrives)}` : `Earliest ${day(a.earliest)}`;
      return `<li><b>${esc(window.Parts.name(p))}</b> × ${qty}<span class="rw-src ${a.source === 'shelf' ? 'ok' : 'amb'}">${esc(where)}</span></li>`;
    }).join('');
    const approved = f.status === 'approved';
    const action = approved
      ? `<div class="rw-done">${ic('check', 'sm')}<div><b>Approved by ${esc(ro.customer)} on the call.</b><span>Added to Repair Details as requirement ${esc(f.requirement)}. Parts ordered. Return visit ${esc(AS.dateOf(AS.toN(f.booking.date)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }))} at ${window.Optimiser.rules.hhmm(f.booking.from)} with ${esc(f.booking.tech)}.</span></div></div>
         <div class="c-acts"><button class="btn s" data-a="ro-tab" data-v="Repair Details">View Repair Details</button><button class="btn s" data-a="go-planner">Open planner</button></div>`
      : `<div class="c-acts"><button class="btn s p rw-go" data-a="ro-approve" data-v="${ro.id}">${ic('sparks', 'sm')} Get approval and order</button></div>
         <p class="rw-what">${ic('info', 'sm')}<span>The AI agent phones ${esc(ro.customer)} for approval. On a yes it adds the work to this repair order, orders the parts and books a return visit for after they arrive.</span></p>`;
    return `<section class="rw ${f.severity} ${approved ? 'approved' : ''}">
      <div class="rw-h"><span class="rw-sev">${f.severity === 'red' ? 'Red' : 'Amber'}</span><h3>${esc(f.title)}</h3><span class="sp"></span><span class="rw-price">${gbp(price)}<small>inc VAT</small></span></div>
      <p class="rw-note">${esc(f.note)}</p><p class="rw-by">Found by ${esc(f.by)} at ${esc(f.at)} today · ${esc(f.op)}, ${f.hours.toFixed(1)} h</p>
      <ul class="rw-parts">${parts}</ul>${action}</section>`;
  }

  function renderRo(mount, id, tab) {
    const ro = RO.get(id);
    if (!ro) { mount.innerHTML = '<div class="ro-page"><p>Repair order not found.</p></div>'; return; }
    const t = RO.totals(ro);
    const cell = (label, value, cls) => `<div class="ro-t ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
    let body;
    if (tab === 'Repair Details') body = detailsTable(ro);
    else if (tab === 'Recommended Work') body = ro.findings.length ? ro.findings.map((f) => findingHtml(ro, f)).join('') : '<div class="ro-sheet ro-empty">No recommended work on this repair order.</div>';
    else body = '<div class="ro-sheet ro-empty">Not part of this prototype.</div>';
    mount.innerHTML = `<div class="ro-page ro-detail">
      <nav class="ro-tabs" aria-label="Repair order">${TABS.map((x) => `<button class="${x === tab ? 'on' : ''}" data-a="ro-tab" data-v="${esc(x)}" ${LIVE_TABS.includes(x) ? '' : 'data-off="1"'}>${esc(x)}</button>`).join('')}</nav>
      <header class="ro-head"><h1>Repair Order ID: ${ro.id}</h1><p>${esc(ro.customer)} - ${esc(ro.reg)} - ${esc(ro.vin)}</p><p>${esc(ro.vehicle)}</p></header>
      <div class="ro-icons">${HEAD_ICONS.map((n) => ic(n, 'sm')).join('')}</div>
      <div class="ro-sheet ro-totals">${cell('Account', esc(ro.account), 'wide')}${cell('Status', ic('warn-fill', 'sm warn'))}${cell('Cash', ic('check', 'sm ok'))}${cell('Load Hours', num(t.load))}${cell('Order Number', '')}${cell('Odometer', ro.odometer.toLocaleString('en-GB'))}${cell('Invoice AWs', num(t.aws))}${cell('Labor', num(t.labor))}${cell('Parts', num(t.parts))}${cell('Non-Labor', num(t.nonLabor))}${cell('Sub Total', num(t.sub))}${cell('Tax', num(t.tax))}${cell('Invoice Total', num(t.total))}</div>
      <div class="ro-sheet ro-acct"><label><span>Account</span><select disabled><option></option></select></label><span class="sp"></span><span class="ro-search">${ic('search', 'sm')}</span></div>
      ${body}</div>`;
  }

  function toggleWip() { ui.expanded = !ui.expanded; }

  return { renderProgress, renderRo, toggleWip, TABS, LIVE_TABS };
})();
