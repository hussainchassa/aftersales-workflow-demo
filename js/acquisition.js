/*
 * Service line acquisition: whether the used car team would want a service customer's
 * car, and a suggested offer for it, built from its condition and how badly it's needed.
 * Stock needs, retail and trade prices are invented sample data, standing in for the
 * used car team's stock list and a price guide like Autotrader or CAP HPI.
 */
window.Acquisition = (function () {
  'use strict';

  const AS = window.AS;
  const V = window.Vehicles;

  const RULES = {
    PREP: 450, // valet, MOT and warranty, on every car bought
    MARGIN_HIGH: 0.09, // accepted when the car is badly needed
    MARGIN_NORMAL: 0.14,
    MARGIN_FLOOR: 0.07, // the most the used car manager would go to
    RANGE_BELOW: 0.03,
    MAX_AGE_YEARS: 6,
    AVG_MILES_YEAR: 7500, // UK average
    MILES_STRETCH: 0.4, // within 40% of average counts as usual mileage
    PER_MILE: 0.06, // retail moves this much per mile away from average
    FAST_SALE_DAYS: 21,
  };

  // What the used car team has and how fast it sells, by make and model.
  // sold: days the last ones took to sell. waiting: buyers asking for one.
  const NEEDS = {
    'Kia Sportage': { inStock: 0, sold: [12, 15], waiting: 3 },
    'Jaguar E-Pace': { inStock: 2, sold: [38, 44], waiting: 0 },
    'Audi A4': { inStock: 3, sold: [29, 35], waiting: 0 },
    'Volkswagen Tiguan': { inStock: 4, sold: [21, 26], waiting: 1 },
    'Volkswagen Golf': { inStock: 3, sold: [18, 22], waiting: 1 },
    'Volvo XC40': { inStock: 2, sold: [18, 24], waiting: 0 },
    'Ford Transit': { inStock: 1, sold: [30], waiting: 0 },
    'BMW X3': { inStock: 2, sold: [33, 40], waiting: 0 },
    'Skoda Octavia': { inStock: 2, sold: [25, 31], waiting: 0 },
  };

  // Retail and trade prices at average mileage, by make and model and year registered.
  const GUIDE = {
    'Kia Sportage': { 2022: { retail: 23995, trade: 19800 } },
  };

  const keyOf = (car) => Object.keys(NEEDS).find((k) => `${car.make} ${car.model}`.startsWith(k)) || null;
  const round50 = (v) => Math.round(v / 50) * 50;
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  const lower = (s) => s.replace(/^./, (c) => c.toLowerCase());
  // "Front brake pads and wiper blades": only the first item keeps its capital.
  const list = (xs) => { const ys = xs.map((x, i) => (i ? lower(x) : x)); return ys.length < 2 ? ys.join('') : `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`; };
  const notes = (xs) => xs.map((x, i) => (i ? lower(x) : x)).join(', ');

  /** High need: none in stock, the last ones sold fast, and someone's waiting for one. */
  function needOf(n) {
    const avg = n.sold.reduce((a, d) => a + d, 0) / n.sold.length;
    return n.inStock === 0 && avg <= RULES.FAST_SALE_DAYS && n.waiting > 0 ? 'high' : 'normal';
  }

  /**
   * car: from Vehicles.lookup. date: the appointment day. fixed: item ids being fixed on
   * this visit (ticked extras and what the booked job covers).
   * Returns null unless the used car team would want the car; otherwise the reasons,
   * the offer, its range and the breakdown behind it.
   */
  function assess(car, date, fixed) {
    const key = car && keyOf(car);
    if (!key || needOf(NEEDS[key]) !== 'high') return null;
    const year = Number(car.registered.slice(0, 4));
    const guide = GUIDE[key] && GUIDE[key][year];
    if (!guide) return null;
    const ageYears = (AS.toN(date) - AS.toN(car.registered)) / 365;
    if (ageYears > RULES.MAX_AGE_YEARS) return null;
    const miles = V.estimateMileage(car, date);
    const avgMiles = ageYears * RULES.AVG_MILES_YEAR;
    if (Math.abs(miles - avgMiles) > avgMiles * RULES.MILES_STRETCH) return null;

    const done = new Set(fixed || []);
    const lastCheck = car.flags.length ? car.flags[car.flags.length - 1][0] : null;
    const open = car.flags.filter((f) => f[0] === lastCheck && !done.has(f[1]));
    if (open.some((f) => f[2] === 'red')) return null;

    // Retail, adjusted for mileage; under £50 either way reads as "in line".
    const adjust = Math.round(((avgMiles - miles) * RULES.PER_MILE) / 5) * 5;
    const mileAdj = Math.abs(adjust) < 50 ? 0 : adjust;
    const retail = guide.retail + mileAdj;

    // Reconditioning: cosmetic marks always; health-check items only if they aren't fixed this visit.
    const cosmetic = (car.cosmetic || []).map(([, note, price]) => ({ note, price }));
    const mechanical = open.map(([, id]) => {
      const item = V.ITEMS[id];
      const parts = item.parts.reduce((a, [p, qty]) => a + window.Parts.price(p) * qty, 0);
      return { id, note: item.name, price: Math.round(parts + item.hrs * window.Optimiser.rules.LABOUR_RATE) };
    });
    const fixedNow = car.flags.filter((f) => f[0] === lastCheck && done.has(f[1])).map((f) => V.ITEMS[f[1]].name);
    const cosmeticCost = cosmetic.reduce((a, c) => a + c.price, 0);
    const mechanicalCost = mechanical.reduce((a, c) => a + c.price, 0);

    const before = retail - cosmeticCost - mechanicalCost - RULES.PREP;
    const margin = Math.round(retail * RULES.MARGIN_HIGH);
    const offer = round50(before - margin);
    const high = round50(before - retail * RULES.MARGIN_FLOOR);
    const low = round50(offer * (1 - RULES.RANGE_BELOW));

    const n = NEEDS[key];
    const plural = (k, one, many) => (k === 1 ? one : many);
    const reasons = [
      { head: 'High need.', text: `None in stock. The last ${plural(n.sold.length, 'one', `${words[n.sold.length].toLowerCase()}`)} sold in ${list(n.sold.map(String))} days, and ${n.waiting} ${plural(n.waiting, 'buyer is', 'buyers are')} waiting for one.` },
      {
        head: 'Good condition.',
        text: [
          `Full service history at Branch 1 (${car.visits.length} visits).`,
          fixedNow.length ? `${list(fixedNow)} ${plural(fixedNow.length, 'is', 'are')} being done on this visit.` : '',
          mechanical.length ? `Still to fix: ${lower(list(mechanical.map((m) => m.note)))}.` : '',
          cosmetic.length ? `${words[cosmetic.length] || cosmetic.length} cosmetic ${plural(cosmetic.length, 'mark', 'marks')}.` : '',
        ].filter(Boolean).join(' '),
      },
      { head: `${mileAdj > 0 ? 'Low' : mileAdj < 0 ? 'High' : 'Average'} mileage`, text: `for its age, about ${miles.toLocaleString('en-GB')} miles.` },
    ];

    const lines = [
      { label: 'Retail price (similar cars)', amount: guide.retail },
      mileAdj ? { label: `Mileage, ${mileAdj > 0 ? 'below' : 'above'} average`, amount: mileAdj } : null,
      { label: 'Cosmetic reconditioning', note: notes(cosmetic.map((c) => `${c.note} £${c.price}`)), amount: -cosmeticCost },
      {
        label: 'Mechanical reconditioning',
        note: mechanical.length ? notes(mechanical.map((m) => `${m.note} £${m.price}`)) : fixedNow.length ? `${list(fixedNow)} ${plural(fixedNow.length, 'is', 'are')} being fixed on this visit` : 'Nothing outstanding',
        amount: -mechanicalCost,
      },
      { label: 'Standard prep: valet, MOT, warranty', amount: -RULES.PREP },
      { label: `Margin: ${Math.round(RULES.MARGIN_HIGH * 100)}%, thinner because it's in high need`, note: `Normally ${Math.round(RULES.MARGIN_NORMAL * 100)}%`, amount: -margin },
    ].filter(Boolean);

    return {
      reg: car.reg, title: `${car.make} ${car.model}`, name: key, registered: car.registered, miles, need: n,
      reasons, lines, retail, trade: guide.trade, offer, low, high, aboveTrade: offer - guide.trade,
      cosmetic, mechanical, fixedNow,
    };
  }

  return { assess, needOf, RULES, NEEDS, GUIDE };
})();
