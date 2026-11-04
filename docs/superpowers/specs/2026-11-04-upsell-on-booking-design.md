# Offering extras on the booking call: design

Date: 2026-11-04
Status: approved 2026-11-04
Builds on: [technician matching](2026-11-04-technician-matching-design.md)

## Intent

While a customer is on the phone booking an appointment, the service advisor is shown the extra work worth offering on that car. The suggestions come from three sources:

- **Mileage:** the car's current mileage, estimated from its history.
- **Turned-down work:** items flagged on earlier health checks that the customer said "not yet" to.
- **Manufacturer schedule:** maintenance that is due or coming up.

Only extras that can actually be done on the day are offered. That means the parts must be in the shop by the appointment, whether they're on the shelf, transferred from another branch, or ordered from the supplier. The customer should never arrive to hear "we can't do that today, maybe next time."

Extras are agreed on the call, **before** the time slot is chosen, so the booking is long enough for everything.

**The long-term goal:** a customer calls in and an AI agent does all of this, including suggesting, booking and ordering parts. For now a person runs it, so it should be built in a way that makes that later step easy.

## Goals

- After the booking form, the copilot looks up the car and replies with a card of extras.
  - The **top three** are ticked and ordered.
  - **Everything else** is listed underneath.
  - Each item shows a reason the advisor can read out, a price, the extra time, and where its part comes from.
- Ticked extras add time to the job. The technician and time suggestion then uses the longer job.
- **One confirmation** covers everything:
  - the booking
  - holding parts from stock
  - requesting transfers from other branches
  - placing supplier orders

  The advisor approves it once, and **Undo** reverses all of it.
- Parts that are held or on order can't be offered to the next caller, so two customers can't be promised the same last part.

## Non-goals (for now)

- **Restocking the shop in general:** proactive ordering ahead of demand, or moving stock between branches to balance it. That's a separate feature to brainstorm later. This feature only orders or transfers parts for the extras it books.
- **A customer-facing voice agent.** The design leaves room for one, but nothing is built for it now.
- **Real supplier or parts systems.** Orders and transfers exist only inside the prototype.
- **Changing an existing booking** to add extras later.
- **Extras discovered during the visit,** from that day's health check.
- **A full parts or stock screen.**

## Anti-goals (would count as failure even if it technically works)

- **Offering something that can't be done on the day,** because the part won't arrive in time or the booking isn't long enough.
- **Two customers promised the same last part.**
- **Feeling like a sales push:** too many items pushed at once, or items ranked by price.
- **Offering work that's already been done since it was flagged or became due.**
- **Any existing dashboard figure changing,** such as "Sales are down 4.2%" or £5,900. The same rule as before.

## Decisions made together

- **When:** on the booking call, by the service advisor. Not at drop-off.
- **Where it appears:** option A from the mockup, a separate step in the chat after the booking form. The form stays as it is, and its button becomes "Next". The copilot replies with the extras card, which ends with "Find a technician". Option B, putting the extras inside the form, was rejected because the form gets long and the reasons get squeezed out.
- **Parts counted as available** if they reach the branch by the appointment day. The sources are checked in this order:
  1. on the shelf at this branch
  2. a transfer from another branch, if it arrives in time
  3. the supplier, if their lead time is short enough

  A transfer is preferred over a supplier order when both are in time.
- **Items whose parts can't arrive in time** stay visible but greyed out and can't be ticked. They show the earliest date they could be done.
- **The top three** are ordered by safety items first (brakes, tyres), then most overdue, then turned down before. Value comes last. This can be changed later.
- **Everything else stays visible** under "N more".
- **The agent places orders and transfers,** and a person confirms them. This is the same confirm-then-apply pattern as the copilot's diary plans.

## Approaches considered

1. **A separate step after the booking form (chosen).** It reads like a conversation, in the same order a voice agent would use later: details, then what's worth doing, then the booking. The cost is one more click.
2. **A section inside the booking form.** Everything sits on one card, but the form gets long and the readable reasons get squeezed out.
3. **Offering extras at drop-off.** Rejected by you, because extras need to be agreed before the time slot is chosen.

## The design

### Flow

1. **"Book an appointment"** works as it does today. The form gains a **"Next"** button in place of "Find a technician".
2. **On "Next",** the copilot shows its working steps ("Looking up SC20 UYT", "Checking the schedule and past health checks", "Checking parts at Branch 1, the other branches and the supplier"). It then replies with the **extras card**:
   - **The car:** year, make, model and engine; the last visit's date and mileage; and the **estimated current mileage**, which the advisor can edit. Changing the mileage re-works the list.
   - **The top three, ticked.** Each shows:
     - the name
     - a reason written so it can be read out ("Measured 4 mm in May and you said not yet")
     - tags: Safety, "Turned down May", "Due now", "1,200 miles over", "Coming up"
     - where the part comes from and when it arrives
     - the price and the extra time
   - **"N more",** collapsed. These are the other offerable items, unticked, plus any items that can't be done in time, greyed out with their earliest date.
   - **A running total** ("3 extras: £359, +1.9 h") and a **"Find a technician"** button. The advisor ticks or unticks as the customer decides.
3. **"Find a technician"** runs the existing matching, with the job length set to the standard time **plus** the ticked extras. The suggestion card shows "Major service plus 3 extras, 4.5 hours".
4. **The suggestion card** gains a **"When you book, I'll"** list:
   - add the job to the technician's day
   - hold the named parts from Branch 1 stock
   - request the named parts from Branch N, arriving on a given day
   - order the named parts from the supplier, arriving on a given day

   The book button becomes **"Book and order"** when there are transfers or orders, and stays "Book" otherwise.
5. **Booking re-checks** the diary, as it does today, and also the parts. If a part has gone since the suggestion, the copilot says so and asks the advisor to go back to the extras step.
6. **The confirmation message** lists the booking, the holds and the transfers or orders. **Undo** reverses all of them together.

If the booking is for a day other than today, parts are only needed by that day. If no extras are offerable, the card says so in one line and goes straight to "Find a technician". If the registration isn't recognised, the copilot says "No history for this car, so I can't suggest extras", skips the step, and the booking carries on as today.

### Sample data (new, invented, with its own seed)

- **Vehicles:** about 30 cars, keyed by registration. They include the registrations already in the planner's unallocated list and the ones used in the demo scenarios. Each car has:
  - make, model, year and engine
  - a mileage history (visit dates and mileages)
  - an average distance per year
  - which schedule items were last done, and when or at what mileage
  - past health-check flags: item, date, amber or red, a measurement or note, and whether it was turned down
- **The manufacturer schedule:** a short list of maintenance items. Each has an interval in miles and/or months, a safety flag, the parts it needs, the labour hours and the price.
  - Make-specific intervals only where they help a scenario. Otherwise use one generic schedule.
  - Label it as **sample guidance**, not real manufacturer data.
- **Parts:** part numbers with names and prices.
  - **Stock** by branch: Branch 1, 2 and 3.
  - **Supplier lead time** in working days per part.
  - **Transfer time** between branches: one working day.
  - Holds and orders made in the demo change what's available, until the page is reloaded.

### Rules

- **Estimated mileage** = the last recorded mileage + average miles per day × days since that visit, rounded to the nearest 100. It's shown with "~" and labelled as an estimate. If the advisor types a number, that's used instead.
- **Due:** a schedule item is due when the mileage or time since it was last done has reached its interval, whichever comes first. "Overdue by" is measured as a share of the interval, so miles and months can be compared.
- **Coming up:** an item due within 3,000 miles or 3 months. It's offered as "could be done now to save a visit" and ranked after anything due.
- **Turned down:** a health-check flag from the last 12 months that the customer turned down, and that hasn't been done since.
- **No repeats:** an item that's both turned down and due appears once, with both tags.
- **Parts available:** the earliest arrival across the sources, after subtracting holds. An item is offerable only if every part it needs is in the branch by the **end of the working day before** the appointment. For a booking today, that means on the shelf now. *(My call: the stricter reading, because "ready to do it that day" matters more than offering a little more.)* Working days are Monday to Saturday, matching the planner's Sunday closing.
- **Already covered by the booked job:** each job type lists what it already includes. For example, the sample major service covers the oil and filter, air filter, cabin filter and spark plugs. Those items are never offered as extras. If one is due or was turned down, it's shown once, unticked, as "Included in your major service", so the advisor can mention it. *(My call.)* The booked job's own parts are assumed to be in stock. Checking them is out of scope.
- **Price:** the part price plus labour hours × the Branch 1 labour rate already used in the prototype, **including VAT** at 20%, and labelled "inc VAT". That's what an advisor quotes a private customer. *(My call.)* Dashboard figures stay excluding VAT and don't change.

### Making the later agent step easy

- **The logic lives in its own module** (proposed `js/upsell.js`), separate from the screen. It returns plain data: the items, their order, reasons, tags, parts plan, price and hours. A future voice agent could call the same function.
- **Reasons are written in customer language,** in full sentences, so a person or an agent can say them out loud.
- **Every change goes through one plan,** made of a booking, part holds, transfers and orders, and is applied only on confirmation. That's the step where a future agent would ask "Shall I go ahead?"

### Demo scenarios (the sample data must produce these)

| Registration | What it shows |
| --- | --- |
| SC20 UYT (Jaguar E-Pace, major service, Friday) | **The mockup's story:**<ul><li>brake fluid (due) and front brake pads (turned down) on the shelf</li><li>battery (turned down) by transfer from Branch 2</li><li>wiper blades on the shelf</li><li>coolant (coming up) from the supplier</li><li>rear tyres greyed out (can't arrive in time)</li><li>air and cabin filters shown as included in the major service</li></ul> *(My call: the mockup offered filters as extras, which a major service already covers.)* |
| A second car, today | **Everything on the shelf,** so it can be done today |
| A third car, needing the same last part as an earlier booking | **Holds working:** book the first car, and the second car's item now needs a transfer or order, or is greyed out |
| A car with nothing due and nothing turned down | **One line,** straight on to "Find a technician" |
| A registration that isn't in the sample data | **No history, so the step is skipped** |

These should hold up in any order, the same as the technician matching scenarios. Extend `tests/scenarios.html` to check them.

**How this fits with the technician matching scenarios (my call):**
- **The five matching scenarios keep working exactly as now** when no extras are ticked. They're presented with cars that have nothing to offer, or with registrations that aren't in the sample data. The existing test checks stay as they are.
- **With extras ticked,** a longer job may get a different technician or slot. The apprentice rule and the choice of bay apply to the longer job, and that's correct.
- **The upsell scenarios check the extras list and the parts plan,** not a particular technician or time. The mockup's "John, Ramp 1, Fri 08:00" is a rough target only.
- **Ordering:** the rule you agreed (safety, then most overdue, then turned down) decides the order, even where the mockup showed something different. On SC20 UYT that puts brake fluid (due) first, then front pads (turned down), then the battery.

### Code touchpoints

- **New `js/vehicles.js`:** sample cars, the schedule, and health-check history.
- **New `js/parts.js`:** stock, holds and orders, availability by date, and the plan for each part.
- **New `js/upsell.js`:** builds the extras list for a car and an appointment day.
- **`js/matching.js`:** `suggest()` accepts extra hours on top of the job type's standard time.
- **`js/copilot.js`:**
  - the "Next" step, the extras card, and the running total
  - passing extra hours into matching
  - the "When you book, I'll" list on the suggestion card
  - applying the parts changes together with the booking
- **Naming:** parts holds should be called something distinct, such as `partHolds`, so they don't clash with the planner's existing `holds` (vehicles parked on ramps).
- **`js/workshop-planner.js` / `js/app.js`:**
  - Undo must reverse the parts changes too. Today the history only snapshots the diary, so parts holds and orders need to join the same undo step.
  - The planner card for the booking lists the extras.
- **`js/intent.js`:** no change expected.
- **`css/copilot.css`:** extras card styles, following the mockup.
- **`index.html`:** the new script tags.
- **`README.md`:** the scenarios and file table.
- **`tests/scenarios.html`:** the upsell scenarios.

Mockup: `.superpowers/brainstorm/upsell-booking.html` (not committed).

## Left to the builder

- **The exact sample cars, parts, prices, stock levels and lead times,** shaped so the scenarios happen.
- **The wording of reasons and tags,** following the mockup's tone.
- **How "N more" expands,** and how the greyed items look.
- **How the confirmation message lists the parts changes.**
