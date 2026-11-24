# Service line acquisition: build plan

Design: [2026-11-24-service-line-acquisition-design.md](../specs/2026-11-24-service-line-acquisition-design.md)
Branch: `feature/service-line-acquisition`

As before, the checks are `tests/scenarios.html` and a walkthrough in the app. Each step should leave the app working.

## 1. The car: `js/vehicles.js`

- **Add KS22 VRT to `SCENARIO`:**
  - Kia Sportage 1.6 T-GDi HEV GT-Line, registered 2022-03-01, about 7,500 miles a year
  - two or three visits at Branch 1, the last one with amber **front pads** and **wipers** (turned down)
  - a new optional `cosmetic` field: `[date, note, price]` for the kerbed front-left alloy and the rear bumper scuff
- **Add Mr D Okafor** to the customers list with an invented phone number.
- **Done when:**
  - `Vehicles.lookup('KS22 VRT')` returns the car, with a mileage estimate for Fri 6 Nov of about 35,000
  - the extras step for a Major service on it ticks the pads and wipers by default
  - the existing extras scenarios are unchanged

## 2. The acquisition module: `js/acquisition.js` (new)

- **Invented data:**
  - `NEEDS`: by make and model, how many are in stock, the days the last ones took to sell, and buyers waiting. The Kia Sportage hybrid is high need. The other scenario cars' models, plus a few more, are normal need.
  - `GUIDE`: retail and trade prices by model and year, at average mileage.
- **`assess(car, date, fixed)`:**
  - takes the car, the appointment date, and the item ids being fixed on this visit (ticked extras plus what the booked job covers)
  - returns `null` unless the car is high need, 6 years old or less, of usual mileage, and has no open red flags
  - otherwise returns the reasons, the breakdown lines (retail, mileage adjustment, cosmetic and mechanical reconditioning item by item, prep, margin with the normal margin alongside), the offer rounded to £50, the range, and the amount above trade
- **Constants** sit at the top: the £450 prep, margins of 9% (high need), 14% (normal) and 7% (floor), the 3% range below, and the age and mileage limits.
- **Done when:** from the console, KS22 VRT on the default path comes out between £20,000 and £22,000 with only cosmetic reconditioning. With nothing fixed it's lower, by the pads and wipers. Every other scenario car returns `null`.

## 3. Planner marker: `js/workshop-planner.js`

- **A new change kind, `offer`,** in the apply function. It sets `offer` (amount, range, referred by, at) on the appointment card with that id. Undo restores the card through the existing history.
- **`cardHtml`** shows a small **Offer prepared** marker on cards with an offer, using the existing card styles.
- **Done when:** applying `{ kind: 'offer', id }` marks the card, and `Workshop.undo()` clears it.

## 4. The flag in the copilot: `js/copilot.js`, `css/copilot.css`

- **After a booking applies** (`applyPlan` with `plan.booking`), the copilot:
  1. looks the car up
  2. works out what's being fixed (ticked extras and `Vehicles.COVERS` for the job type)
  3. calls `Acquisition.assess`

  If the result isn't null, it runs a short visible step ("Checking KS22 VRT against used stock") and pushes a new `acquisition` message: the booking id, card id, the result, and a state of waiting, referred, dismissed or withdrawn. This happens for the AI agent's bookings too, but none of those cars is wanted.
- **`acquisitionHtml`** draws the card as in the mockup: reasons, offer box, breakdown, **Refer to used car team** and **Dismiss**, and the footer. The referred, dismissed and withdrawn states follow the design.
- **Refer** applies a plan with one `offer` change through `Workshop.apply`. **Dismiss** only changes the message.
- **Undo order:** whatever was applied most recently is what `undoPlan` reverses, whether it's a booking, a plan or a referral. Give each applied booking or plan and each referral a sequence number, and have `undoPlan` pick the highest one not yet undone. Undoing a referral puts its flag back to waiting. Undoing a booking with a waiting flag sets that flag to withdrawn.
- **New app actions** in `js/app.js`: `acq-refer`, `acq-dismiss`, and `acq-undo` (which calls `undoPlan`).
- **Done when:** in the app, booking KS22 VRT shows the flag. Refer marks the planner card. Undo puts it back. Undoing the booking withdraws a waiting flag. The other stories show no flag.

## 5. Tests: `tests/scenarios.html`

- **A new group, run from a fresh load and after the Patel story.** It books KS22 VRT through the booking form functions:
  - On the default path: a flag, cosmetic-only reconditioning, and an offer that matches `assess`.
  - With nothing ticked: a lower offer, with the pads and wipers in reconditioning.
  - Refer marks the card. Undo clears it and the flag goes back to waiting.
  - Bookings for SC20 UYT, YF70 KTO, KY72 BLN, GN19 HVD and AB12 CDE give no flag.
- **Done when:** the page says all passed, with the new count.

## 6. README and wiring

- **`index.html`:** add `js/acquisition.js` after `vehicles.js` and `parts.js`.
- **README:**
  - a "Service line acquisition" section under "In Service", with the demo steps
  - the file in the "How it works" table
  - the invented stock needs and prices in the closing note
  - the new test count
- **Walkthrough** in the browser pane, with screenshots, and no console errors.
- **Commit** on the branch. Push only when asked.
