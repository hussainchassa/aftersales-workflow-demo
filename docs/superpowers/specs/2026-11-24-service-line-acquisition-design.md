# Service line acquisition: design

Date: 2026-11-24
Status: approved 2026-11-24
Builds on:
- [technician matching](2026-11-04-technician-matching-design.md): the booking form
- [extras on the booking call](2026-11-04-upsell-on-booking-design.md): the car data and health-check flags
- [the preferred-time swap](2026-11-16-preferred-time-swap-design.md): an internal request the advisor approves
- [the Service and BI split](2026-11-16-separate-service-and-bi-design.md)

Mockup: `.superpowers/brainstorm/acquisition-flag.html`. Its figures are illustrative. The real ones come from the calculation below.

## Intent

**Used cars are hard to buy well.** Auctions are expensive and competitive. A dealer's own service customers already own good cars, and the dealer knows those cars' history. Dealers call buying from them *service-to-sales* or *equity mining*.

**How it works in real dealerships:**
1. **The service advisor spots a candidate** and refers it. If the car is bought, the advisor (and so the service department) gets credit, often a referral bonus.
2. **The used car manager owns the price.** They hold the used stock budget and know which cars sell fast.
3. **A salesperson makes the offer** in person while the car is in for its service. It's "subject to inspection", lasts a few days, and is often paired with an upgrade.

**The idea:** when an advisor books a service, the AI agent checks the car against what the used car team needs. If the car is wanted, it flags it to the advisor with a suggested offer, built from **the car's condition** and **how badly the dealership needs it**. Nothing reaches the customer. The advisor approves the referral, and the offer waits on the appointment for the salesperson.

**Credit stays with service.** The referral records who made it. We don't want to shake up who gets the win.

## Goals

- **A separate story with its own car:** an invented 2022 Kia Sportage hybrid, KS22 VRT, owned by Mr D Okafor, booked with the **booking form** in Service's AI Assistance.
- **After "Book", the agent checks the car quietly.** If it's wanted, an **acquisition flag** card appears in the chat, under the booking confirmation.
- **The flag explains itself:**
  - **why it's wanted:** need (stock, how fast they sell, buyers waiting), condition (history here, last health check), and mileage for its age
  - **the suggested offer,** a range the salesperson can negotiate within, and how far it is above trade value
  - **the breakdown:** retail price, less reconditioning (priced from the health-check flags), less standard prep, less a margin that **gets thinner when the car is badly needed**
- **"Refer to used car team"** approves it. The card then reads "Referred by you (Service)", and Friday's planner card shows **Offer prepared**. One Undo reverses it.
- **"Dismiss"** drops the flag with no changes.
- **Cars that aren't wanted get no flag** and no message.

## Non-goals

- Telling the customer anything, by call, text or on screen.
- A Sales app, or a screen for the salesperson beyond the planner marker.
- Real valuation services (Autotrader, CAP HPI) or real stock data. All figures are invented sample data.
- Finance positions (PCP settlement, equity). They're a common real-world signal, but there's no finance data in the demo. This could be a later addition.
- Negotiation, inspection results or a completed purchase.
- Flagging during the AI agent's call. The check runs after any booking, but only KS22 VRT is set up to be wanted.

## Anti-goals

- **Anything that feels like selling to the customer during a service booking.** The flag must look internal.
- **An offer without its working shown.** A number on its own won't be trusted.
- **Anything that suggests service loses the credit.**
- **Changing other stories.** Mr Patel's call, the extras scenarios, the swap and Mrs Shaw's order behave as before. Their cars must not be flagged.

## Constraints

- Static vanilla JS on `window`, like the rest of the prototype. No build step and no API key.
- Changes go through `Workshop.apply(plan)` so they share the single undo history.
- Service's fixed labour rate (`Optimiser.rules.LABOUR_RATE`) and the parts catalogue prices are used for reconditioning, so nothing reads BI's figures.
- The demo clock: today is Wed 4 Nov 2026, 09:42.
- The test page (`tests/scenarios.html`) must keep passing, with new checks added.

## Approaches

- **A. A small new acquisition module, checked after booking (chosen).** A new `js/acquisition.js` holds invented stock needs and price guides, and works the offer out from the car's real data. The copilot asks it about each new booking. It's the most new code. But the offer comes from real inputs, so condition and need really do move it, and adding another car later is just data.
- **B. Inside the extras step.** The "Next" screen already looks up the car. Rejected because that screen is what's offered *to the customer*, so it would mix the internal flag into customer-facing work.
- **C. A hard-coded card for one registration.** Fastest, but the figures would be fixed text. Rejected because it breaks if the booking changes (e.g. extras fix a flagged item), and can't show how need moves the price.

## What was decided

### The car

Add **KS22 VRT** to `Vehicles` `SCENARIO`:
- Kia Sportage 1.6 T-GDi HEV GT-Line, registered March 2022, about 7,500 miles a year
- two or three earlier visits at Branch 1 (a full history)
- the last health check flagged **front pads** and **wipers** amber
- **cosmetic notes** from the last check-in, each with a repair price: a **kerbed front-left alloy** (about £95 to refurbish) and a **scuff on the rear bumper** (about £180 for a smart repair). This is a new, optional field. No other car has any.

Cosmetic notes are never offered as service extras. They exist so the offer always reflects the car's condition. *Decided after the builder check: the extras step ticks the pads and wipers by default, which would otherwise leave no reconditioning to show.*

The mileage estimate for Friday should come out at about 35,000 miles: average for its age (UK average is about 7,500 a year), so no mileage adjustment. *My call, after the builder check: the earlier 26,000 figure was low mileage, not average.* The customer is **Mr D Okafor**, with an invented 07700 9xxxxx phone number.

The booking itself is ordinary: a **Major service**, typed into the booking form. *My call: the form has no "Minor service" type, and adding one would change the form in every other story. Major service doesn't include pads or wipers.* Work the booked job already includes (`Vehicles.COVERS`) also counts as being fixed on this visit. "Next" offers extras as usual (it will suggest the pads and wipers).

### What the used car team needs (invented data)

A short table of stock needs by make and model:
- how many are in stock
- how long the last ones took to sell, in days
- how many buyers are waiting

The Kia Sportage hybrid has **high need**: none in stock, the last two sold in 12 and 15 days, and 3 buyers waiting. Add a few other models at **normal** need (some in stock) so the logic has something to say no to. Include the makes and models of the other scenario cars (Jaguar E-Pace, Audi A4, VW Tiguan, Volvo XC40 and so on), so none of them is flagged.

**Need levels:** high or normal. Only **high-need** cars are flagged.

**Also required to flag:**
- the car is 6 years old or less
- the mileage is within the usual range for its age
- there are no open **red** health-check flags

### The offer

Worked out when the flag is created, in this order:
1. **Retail price:** from an invented guide for that model and year at average mileage, adjusted a little for mileage above or below average for its age.
2. **Less reconditioning,** in two parts, each listed in the breakdown:
   - **Cosmetic:** every cosmetic note, at its repair price. Always counted.
   - **Mechanical:** each open health-check flag *not being fixed in this booking*, at parts price plus labour hours times Service's labour rate. An item is being fixed if it's a ticked extra or the booked job covers it.

   On the default path (top extras ticked), the pads and wipers are fixed on this visit and paid for by the customer, so only the cosmetic items count. Untick them and they join reconditioning, so the offer drops. The breakdown names each item, so the reader sees why.
3. **Less standard prep:** a fixed £450 for valet, MOT and warranty.
4. **Less margin:** a percentage of retail. **9% for high need** (normally 14%). The breakdown shows both, so the reader sees how need raised the offer.
5. **Suggested offer:** rounded to the nearest £50.

**Also shown:**
- **The range:** from about 3% below the offer, up to the offer with a 7% margin. The used car manager decides within it.
- **Trade value:** an invented trade price for the model. The card says how far the offer is above it ("£1,350 above trade value"). That's the salesperson's talking point.

### The flag card

It appears in Service's AI Assistance after the booking's "Done" card, following a short visible step ("Checking KS22 VRT against used stock"). It looks like the mockup:
- "Acquisition opportunity"
- the car and customer
- three reasons
- the offer box
- the breakdown table
- **Refer to used car team** and **Dismiss**
- a footer: "Nothing is said to Mr Okafor. The used car manager sets the final price, subject to inspection."

### Referring

"Refer to used car team" applies a plan through `Workshop.apply` with one new change kind, which marks the booked appointment's card as having an offer prepared (its amount and range, and who referred it). It shares the single undo history, so:
- **the card** then shows "Referred to the used car team" and "Referred by you (Service) at 09:42", the offer, and Undo
- **the planner card** for that appointment shows a small **Offer prepared** marker
- **Undo** removes the marker and puts the card back to its waiting state with both buttons

**Dismiss** changes nothing in the diary. The card says "Dismissed. Nothing was sent."

**If the booking itself is undone** while the flag is still waiting, the flag is withdrawn: "The booking was undone, so this isn't needed."

### Tests

Add to `tests/scenarios.html`:
- Booking KS22 VRT on the default path (top extras ticked) gives a flag. Reconditioning is the cosmetic items only, and the offer matches the calculation, with a high-need margin.
- Booking it with nothing ticked gives a lower offer, and the pads and wipers are in the reconditioning.
- Refer marks the planner card. Undo removes the mark and restores the card.
- Bookings for SC20 UYT, YF70 KTO, KY72 BLN, GN19 HVD and AB12 CDE, and Mr Patel's call, give no flag.

### README

A new "Service line acquisition" section under "In Service", covering the steps to demo it, and the invented data in the closing note.

## Left to the builder

- The exact invented guide prices, mileage adjustment, other stock-need rows and trade values, as long as KS22 VRT comes out at a believable figure (around £20,000–£22,000) on the default path.
- The exact cosmetic repair prices, as long as they're believable.
- The new change kind's name and where the offer is stored on the planner card.
- How the waiting flag and the referral fit with the existing "undo the latest applied change" logic in `Copilot.undoPlan`. Undo must reverse the most recent change, whichever it is.
- How the planner marker looks, within the planner's existing card styles.
- The visible step's wording and timing.
