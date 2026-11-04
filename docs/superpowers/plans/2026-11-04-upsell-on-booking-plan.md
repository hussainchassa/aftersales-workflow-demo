# Offering extras on the booking call: build plan

Design: [2026-11-04-upsell-on-booking-design.md](../specs/2026-11-04-upsell-on-booking-design.md)
Branch: `feature/upsell-on-booking`

As before, there's no build step. Checks are the scenario test page (step 8) and a walkthrough in the app (step 10). Each step should leave the app working.

## 1. Parts: `js/parts.js` (new)

- **Part numbers:** name, price excluding VAT, and supplier lead time in working days.
- **Stock by branch:** Branch 1, 2 and 3. Transfers between branches take 1 working day. Working days are Monday to Saturday.
- **State that can change:**
  - `partHolds`: parts held for a booking
  - `orders`: supplier orders and transfers, each with its arrival date

  Expose `snapshot()` / `restore()` so undo can put them back.
- **`availability(part, qty, date)`** returns the cheapest source that gets the part into Branch 1 by the end of the working day before `date`, or the shelf for today. The order is shelf, then transfer, then supplier. If none works in time, it returns `null` with the earliest possible date.
- **`apply(changes)`** handles three kinds of change: `hold`, `transfer` and `order`. A transfer takes the stock from the other branch straight away.
- **Done when:** `Parts.availability(...)` in the console gives shelf, transfer, supplier and `null` answers for the parts in the SC20 UYT scenario.

## 2. Cars and the schedule: `js/vehicles.js` (new)

- **About 30 cars,** keyed by registration, with their own seed. Each car has:
  - make, model, year and engine
  - mileage history
  - average miles per year
  - when each schedule item was last done
  - health-check flags (item, date, amber or red, note, turned down)
- **Include the registrations from the planner's unallocated list** and the scenario cars: SC20 UYT, a "today, all on the shelf" car, a "same last part" pair, and a "nothing due" car.
- **`SCHEDULE`:** maintenance items, each with an interval in miles and/or months, a safety flag, parts, labour hours and price, labelled as sample guidance.
- **`COVERS`:** what each booking job type already includes. For example, a major service covers oil, filters and spark plugs.
- **`lookup(reg)`** returns the car, or `null` if it isn't in the sample data. **`estimateMileage(car, date)`** returns the estimated mileage.
- **Done when:** `Vehicles.lookup('SC20 UYT')` returns the car, with an estimate of about 41,200 miles.

## 3. The extras list: `js/upsell.js` (new)

- **`extras({ reg, mileage, type, date })`** returns `{ car, mileage, estimated, items, covered, unavailable }`. Each item includes:
  - id and name
  - a reason the advisor can read out
  - tags: safety, due, coming up, turned down, and how far over
  - price including VAT, and hours
  - the parts plan, with the source and arrival day for each part
  - whether it's ticked
- **The rules come from the design:** due, coming up, turned down within 12 months and not done since, no repeats, already covered by the job, and parts in time.
- **Ordering:** safety, then most overdue (as a share of the interval), then turned down, then value. The top three offerable items come back ticked.
- **This ordering is a good piece for you to write.** It's a short comparison function, and it's where "this shouldn't feel like a sales push" turns into code. I'll leave it as a `TODO(human)` once everything around it works.
- **Done when:** the console output for SC20 UYT matches the design's scenario list.

## 4. Matching: longer jobs

- **`Matching.suggest(request, snap)`** accepts `request.extraHours`. The slot length becomes the standard time plus the extra hours, rounded up to the quarter hour.
- **The apprentice and bay rules use the longer job.** The bay stays based on the main job type.
- **Done when:** `tests/scenarios.html` still says 30 of 30 with no extra hours.

## 5. Undo covers parts too

- **`Workshop.apply(plan)`** also saves `Parts.snapshot()` in its history entry, and applies `plan.partChanges` through `Parts.apply`. **`Workshop.undo()`** restores both.
- **Plans without parts changes,** like "Fix my workbays", behave exactly as before.
- **The booking's planner card** lists its extras in its second line, e.g. "Major service + brake fluid, front pads".
- **Done when:** in the console, a plan with a hold and an order applies and then undoes cleanly.

## 6. Copilot: the extras step

- **The booking form's button becomes "Next".** It runs the working steps, then pushes a `booking-extras` message.
- **The extras card,** following the mockup:
  - the car, and the mileage with an edit field (changing it re-works the list)
  - the ticked top three
  - "N more", collapsed
  - items covered by the job, and greyed items that can't be done in time
  - the running total, and "Find a technician"
- **No history:** one line saying so, then straight to "Find a technician". **Nothing to offer:** one line, then the same button.
- **"Find a technician"** passes the extra hours to matching.
- **The suggestion card** gains the "When you book, I'll" list. Its button says "Book and order" when there are transfers or orders.
- **Booking re-checks** both the diary and the parts.
- **`js/app.js`:** new `data-a` actions for ticking an item, expanding "N more", the mileage field and "Next".
- **`css/copilot.css`:** styles for the extras card. **`index.html`:** script tags for the new modules, in the order parts, vehicles, upsell.
- **Done when:** the SC20 UYT booking works end to end in the browser.

## 7. Your piece: the ordering function

Before the scenarios are tuned, the ordering function in `js/upsell.js` is handed to you as `TODO(human)`.

## 8. Scenario test page

Add the upsell scenarios to `tests/scenarios.html`:
- **SC20 UYT's list:** the order, the sources, the greyed rear tyres, and the filters shown as included.
- **The today car:** everything comes from the shelf.
- **The same-last-part pair:** after booking the first car, the second car's item moves to a transfer or order, or is greyed out.
- **The nothing-due car**, and an **unknown registration**.

Run them after the same setups as before, plus "after the other upsell bookings". The existing 30 checks must still pass.

## 9. README

Add the upsell scenarios, the new files, and a note that the cars, schedule, stock and prices are sample data.

## 10. Walkthrough in the app

- **Every upsell scenario** through the copilot, then undo.
- **The five matching scenarios** with a no-history registration.
- **The dashboard** still shows "Sales are down 4.2%" and £5,900.
- **Console errors:** none.
