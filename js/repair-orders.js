/*
 * Repair orders (job cards) for the Service app's Repair Order Progress and repair
 * order screens. Invented sample data. Mrs Shaw's is filled in for the one-click parts
 * order story: her technician found worn front brakes, listed as Recommended Work.
 *
 * Changes go through Workshop.apply alongside the diary and parts, and their state is
 * saved in the same undo history, so one undo reverses an approval completely.
 */
window.RepairOrders = (function () {
  'use strict';

  const AS = window.AS;
  const rate = () => window.Optimiser.rules.LABOUR_RATE;
  const VAT = 0.2;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const money = (v) => Math.round(v * 100) / 100;

  /* ---------- sample repair orders ---------- */

  // Line kinds follow the DMS tree: requirement > operation > labor / part / environmental / non-labor.
  const req = (code, desc, status) => ({ kind: 'requirement', code, desc, status: status || 'Open' });
  const op = (code, desc, load, account) => ({ kind: 'operation', code, desc, load, aws: load, account, status: 'Open' });
  const labor = (price) => ({ kind: 'labor', desc: '', price });
  const part = (desc, qty, price, status) => ({ kind: 'part', desc, qty, price, status: status || 'Estimate' });
  const env = (price) => ({ kind: 'environmental', desc: 'Environmental Charge', price });
  const nonLabor = (desc, price) => ({ kind: 'nonlabor', desc, price });

  // A repair order's lines are a flat list; `depth` is worked out from the kinds when drawn.
  const GENERIC = (account) => [
    req('A', 'VHC test'), op('1', 'Carry out VHC test', 0.5, account), labor(0), part('MJC1602 - NUT', 1, 200), env(30.46),
    req('B', 'Service'), op('2', 'Testing', 2, account), labor(21.67), nonLabor('Workshop consumables', 70.65),
  ];

  const ORDERS = [
    {
      id: 71512, customer: 'Mrs K Shaw', reg: 'FD70 KLR', vin: 'YV1XZ12V0L2109874', vehicle: 'Volvo XC40 B4 Momentum 5dr Auto',
      account: 'RET01 - Retail Account', out: ['2026-11-04', 17], odometer: 45300, phone: '07700 900789',
      lines: [
        req('A', 'Minor service'), op('1', 'Minor service', 1.6, 'RET01'), labor(231.53),
        part('OIL-5L - Engine oil, 5 litres', 1, 38, 'Issued'), part('FILTER-OIL - Oil filter', 1, 14, 'Issued'), env(4.5),
        req('B', 'Vehicle health check'), op('2', 'Carry out VHC', 0.5, 'RET01'), labor(72.35),
      ],
      // Recommended Work, as the DMS lays it out: each item sits in Awaiting Parts, Awaiting
      // Labor or Awaiting Approval until it's approved and becomes a requirement on Repair Details.
      findings: [
        {
          id: 'f1', title: 'Front brake pads and discs', note: 'Measured 2 mm, red. Replace before driving any distance.', severity: 'red',
          by: 'Ana Ceban', at: '09:15', op: 'Replace front brake pads and discs', type: 'Brakes', hours: 2.2,
          parts: [['PAD-F-XC40', 1], ['DISC-F-XC40', 1]], status: 'recommended', section: 'parts', checklist: 'Default Checklist', priced: null,
        },
        // Checklist lines the technician left at zero, like the DMS shows.
        { id: 'f2', title: 'eVHC START - Ana Ceban -', checklist: 'Default Checklist', by: 'Ana Ceban', status: 'info', section: 'labor', parts: [], hours: 0, priced: { labor: 0, parts: 0, nonLabor: 0 } },
        { id: 'f3', title: 'TREAD DEPTH - O/S Rear -', checklist: 'Default Checklist', by: 'Ana Ceban', status: 'info', section: 'labor', parts: [], hours: 0, priced: { labor: 0, parts: 0, nonLabor: 0 } },
      ],
    },
    { id: 71146, customer: 'Oakfield Motors Ltd', reg: 'YF14 KNM', vin: 'WP0ZZZ99ZES130ABC', vehicle: 'BMW X4 M (F98) X4 M Competition LCI S58T 3.0 (X4CP)', account: 'THR01 - THR Warranty Account', out: ['2026-11-05', 10] },
    { id: 71307, customer: 'Harlow Electrical Supplies', reg: 'V99 LLB', vin: 'WF0XXXGCDXLB71307', vehicle: 'Ford Focus 1.5 EcoBlue ST-Line Hatchback 5dr Diesel Manual Euro 6 (s/s) (120 ps)', account: 'THR01 - THR Warranty Account', out: ['2026-11-05', 12] },
    { id: 71329, customer: 'Mr D Fenwick', reg: 'ML64 OVZ', vin: 'W0LJD7E80EB071329', vehicle: 'VAUXHALL Meriva Estate 1.4T 16V Exclusiv 5dr Auto', account: 'RET01 - Retail Account', out: ['2026-11-06', 12] },
    { id: 71380, customer: 'Mr R Bains', reg: 'LP18 KKL', vin: 'WBA1S520X0V871380', vehicle: 'BMW 1 Series Hatchback Special Edition M140i Shadow Edition 5dr Step Auto', account: 'RET01 - Retail Account', out: ['2026-11-06', 15] },
    { id: 71397, customer: 'Ms T Okoro', reg: 'NV19 TTR', vin: 'SALYA2AN4KA071397', vehicle: 'Range Rover Velar 2.0 D180 R-Dynamic SE 5dr Auto', account: 'RET01 - Retail Account', out: ['2026-11-09', 12] },
    { id: 71428, customer: 'Brightwell Fleet', reg: 'BW70 FLT', vin: 'WBS2U72000VH71428', vehicle: 'BMW M2 Coupe (F87) M2 Competition Coupe S55 3.0i LCI (ZMCO)', account: 'THR01 - THR Warranty Account', out: ['2026-11-09', 16] },
    { id: 71464, customer: 'Mr P Perager', reg: 'LM07 HWR', vin: 'WVWZZZ1KZ7W071464', vehicle: 'Volkswagen Golf 1.4 S Hatchback 5dr Petrol Manual', account: 'RET01 - Retail Account', out: ['2026-11-10', 12] },
  ].map((ro) => Object.assign({ lines: GENERIC(ro.account.split(' ')[0]), findings: [], odometer: 0 }, ro));

  let state = clone(ORDERS);

  /* ---------- reading ---------- */

  const get = (id) => state.find((ro) => ro.id === Number(id)) || null;

  /** Recommended work the customer hasn't approved yet, across every repair order. */
  const pending = () => state.flatMap((ro) => ro.findings.filter((f) => f.status === 'recommended').map((f) => ({ ro, f })));

  /** Invoice figures worked out from the lines, as on the DMS totals row. */
  function totals(ro) {
    const sum = (kinds) => ro.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + (l.price || 0), 0);
    const load = ro.lines.filter((l) => l.kind === 'operation').reduce((a, l) => a + l.load, 0);
    const lab = sum(['labor']);
    const parts = sum(['part', 'environmental']);
    const non = sum(['nonlabor']);
    const sub = lab + parts + non;
    return { load, aws: load, labor: money(lab), parts: money(parts), nonLabor: money(non), sub: money(sub), tax: money(sub * VAT), total: money(sub * (1 + VAT)) };
  }

  /** A requirement's or operation's price: everything under it, up to the next line of its level. */
  function rollup(ro, index) {
    const level = ro.lines[index].kind;
    let total = 0;
    for (let i = index + 1; i < ro.lines.length; i++) {
      const k = ro.lines[i].kind;
      if (k === 'requirement' || (level === 'operation' && k === 'operation')) break;
      if (k === 'labor' || k === 'part' || k === 'environmental' || k === 'nonlabor') total += ro.lines[i].price || 0;
    }
    return money(total);
  }

  /** What the recommended work would cost the customer, including VAT. */
  function findingPrice(f) {
    const partsCost = f.parts.reduce((a, [p, qty]) => a + window.Parts.price(p) * qty, 0);
    return Math.round((partsCost + f.hours * rate()) * (1 + VAT));
  }

  /** The prices a recommended item would carry once it's priced: parts from the catalogue, labour at the Service rate. */
  function quote(f) {
    return { labor: money(f.hours * rate()), parts: money(f.parts.reduce((a, [p, qty]) => a + window.Parts.price(p) * qty, 0)), nonLabor: 0 };
  }

  const itemTotal = (f) => (f.priced ? money(f.priced.labor + f.priced.parts + f.priced.nonLabor) : 0);

  /** The Recommended Work totals table: still-recommended work, this repair order, and both together. */
  function recommendedTotals(ro) {
    const rec = money(ro.findings.filter((f) => f.section !== 'approved').reduce((a, f) => a + itemTotal(f), 0));
    const cur = totals(ro).sub;
    return { rec, recTax: money(rec * (1 + VAT)), cur, curTax: money(cur * (1 + VAT)), all: money(rec + cur), allTax: money((rec + cur) * (1 + VAT)) };
  }

  /* ---------- changing ---------- */

  /**
   * changes: { kind: 'approve', roId, findingId, by, booking: { date, from, tech }, arrives }.
   * Adds the work as a new requirement with operation, labor and parts lines, and marks
   * the finding approved.
   */
  function apply(changes) {
    (changes || []).forEach((c) => {
      const ro = get(c.roId);
      const f = ro && ro.findings.find((x) => x.id === c.findingId);
      if (!f) return;
      if (c.kind === 'price') {
        // Parts and labour filled in, so the item moves along to Awaiting Approval.
        Object.assign(f, { priced: quote(f), section: 'approval' });
        return;
      }
      if (c.kind !== 'approve') return;
      const letter = String.fromCharCode(65 + ro.lines.filter((l) => l.kind === 'requirement').length);
      const opNo = String(ro.lines.filter((l) => l.kind === 'operation').length + 1);
      const day = AS.dateOf(AS.toN(c.arrives)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
      const added = [
        Object.assign(req(letter, `${f.title} (recommended work)`, 'Approved'), { isNew: true }),
        Object.assign(op(opNo, f.op, f.hours, ro.account.split(' ')[0]), { isNew: true }),
        Object.assign(labor(money(f.hours * rate())), { isNew: true }),
        ...f.parts.map(([p, qty]) => Object.assign(part(`${p} - ${window.Parts.name(p)}`, qty, money(window.Parts.price(p) * qty), `On order, arrives ${day}`), { isNew: true })),
      ];
      ro.lines.forEach((l) => { delete l.isNew; });
      ro.lines.push(...added);
      Object.assign(f, { status: 'approved', section: 'approved', approvedBy: c.by, booking: c.booking, requirement: letter });
    });
  }

  return {
    list: () => state, get, pending, totals, rollup, findingPrice, quote, itemTotal, recommendedTotals, apply, VAT,
    snapshot: () => clone(state), restore: (s) => { state = clone(s); },
  };
})();
