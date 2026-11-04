# Technician matching: build plan

Design: [2026-11-04-technician-matching-design.md](../specs/2026-11-04-technician-matching-design.md)
Branch: `feature/technician-matching`

There is no build step or test framework, so checks are a scenario test page that runs in the browser (step 8), plus a walkthrough in the real app (step 10). Each step should leave the app working.

## 1. Share the optimiser's diary checks

`js/optimiser.js` already has the rules the matching needs: `techBusy`, `techAway`, `bayBusy`, `baysFor`, `isApprentice`, `needsSeniorTech`, `dayLoad` and `totalLoad`. Export them from `window.Optimiser` (for example under `Optimiser.rules`) so `js/matching.js` uses the same rules instead of copies.

- Check what `needsSeniorTech` does with the new types. It returns true for jobs over 2 hours or with "diagnos" in the description. That gives Diagnostics, Brakes (2.2 h) and Major service (2.6 h) as senior work, and Tyres (1.5 h) and Diesel (2.0 h) as allowed for apprentices. That's acceptable. Note it in a comment where the job types are defined.
- **Done when:** the app still loads, and "Fix my workbays and technicians" builds the same plan as before.

## 2. Job types and seeded history: `js/matching.js` (new)

- `TYPES`: the five types from the design, each with its standard time, a description for the card, and a `kind` for `baysFor` (`tyre` for Tyres, `ramp` for the rest).
- **Its own seeded random generator**, separate from `aftersales-data.js`. Never call `AS`'s random functions.
- **About 12 months of past jobs** for each planner technician (the `RESOURCES` rows with `tech: 1`). Each job has the technician, type, date, registration, standard hours and clocked hours. Each technician has a profile per type (speed, how often they get that type, how likely a car is to come back), set by hand where a scenario needs it and randomised otherwise.
- **Comebacks are generated as real repeat visits:** a later job with the same registration and type within 30 days. The comeback count is then worked out from the history, as the design says, not read from a flag.
- `stats(type)` returns, for each technician: job count, speed (clocked ÷ standard) and comebacks.
- **Done when:** `Matching.stats('Diagnostics')` in the console shows Louis fastest with the most comebacks, Isobel slower with none, and Justin close behind Isobel. Everyone else is unremarkable.

## 3. Scoring

- `score(stat, teamAverage)` returns a number where higher is better. Comebacks count more than speed, but about 10% comebacks still scores close to a clean record, and limited history is pulled towards the team average.
- **This is a good piece for you to write.** It's short, and it's where the "what makes a good technician" judgement lives. I'll set up the function and its inputs, and leave a `TODO(human)` for the formula itself.
- **Done when:** the diagnostics ranking reads Isobel, then Justin, then Louis, close enough that Justin counts as "good enough".

## 4. `suggest(request, snapshot)`

- **Request:** `{ type, date, window }`, where `window` is `asap`, `morning`, `afternoon`, or a specific start hour.
- **Steps:**
  1. Find who's available: on shift, not away, not booked, with a suitable bay, and passing the apprentice rule.
  2. Keep everyone within the "good enough" margin of the best available score.
  3. Pick the least busy by hours booked that day, then that week.
  4. Allow newer technicians only when a stronger technician for that type is on shift that day.
  5. Add alternatives: the best technician overall at their earliest slot (if different), and the next best fit in the requested window.
- **Nobody free:** move to the nearest suitable slot later that day, or the next working day, and start the reason with that. Search no further than the planner's two-week range.
- **Returns:** `{ main, alts, moved, steps }`.
  - `main` and each alternative are `{ date, from, to, tech, bay, reason, label, stats }`.
  - `steps` holds the working-step lines the chat shows.
- **Done when:** calling it from the console for each scenario gives the expected technician.

## 5. Scenario jobs in the diary

- **Add future jobs to `ALLOCATED`** in `js/workshop-planner.js` so the scenarios work: Isobel's Thursday morning, the best diesel technician's days until Friday, and a spread of booked hours so "least busy" has something to compare. Use absences already in the diary where they fit.
- **Keep scenario slots out of reach of "Fix my workbays".** The optimiser only books the existing unallocated jobs on their own dates, so place scenario-critical free time on days and technicians it won't fill, and confirm this in step 8.
- **Done when:** the planner shows the new cards, and nothing overlaps.

## 6. Planner: a new change kind

- Add `appointment` to `applyChanges` in `js/workshop-planner.js`. It pushes a brand-new card (`id`, `res`, `bay`, `from`, `to`, `hrs`, `l1` = reg, make and model, `l2` = job description and customer name) with the given mark.
- Preview, apply and undo then work through the existing `preview`, `apply` and `undo`.
- **Done when:** a hand-built `{ changes: [{ kind: 'appointment', … }] }` previews, applies and undoes from the console.

## 7. Copilot: form and suggestion cards

- **`js/intent.js`:** `interpret` returns `{ kind: 'book' }` for "book an appointment", "new booking", "make a booking" and similar, checked before the dashboard rules.
- **`js/copilot.js`:**
  - Add "Book an appointment" as the first entry in `STARTERS`.
  - The `book` result kind pushes a `booking-form` message.
  - Form fields: customer name, phone, registration, make and model, a job type chip, a day, and a time window.
  - "Find a technician" runs `runSteps` with `suggest().steps`, then pushes a `booking-suggestion` message.
  - Clicking "Book" or "Book instead" builds a single-change plan and goes through the existing apply path, so the chat confirms it, switches to the planner, and "undo" works.
  - "Preview on planner" uses `Workshop.preview`.
- **`js/app.js`:** add the new `data-a` actions to `ACTIONS`, and a `change` handler for the form fields if needed.
- **`css/copilot.css`:** form and suggestion card styles, following the mockup and the existing `.card`, `.qchip` and `.btn` styles.
- **`index.html`:** add `<script src="js/matching.js">` after `optimiser.js`.
- **Done when:** the whole flow works in the browser for one scenario.

## 8. Scenario test page: `tests/scenarios.html`

This is a static page that loads the app's scripts and runs every scenario after each of these setups, printing a pass or fail table:
- a fresh load
- after applying "Fix my workbays and technicians"
- after booking each of the other four types once
- after a booking and then an undo
- the major service check: booking it twice gives two different people

Each check compares the suggested technician (or story, such as "moved" or "limited history") with what the design expects.

- **Done when:** everything passes.

## 9. README

- Add "Book an appointment" to "Questions to try".
- Add `js/matching.js` and `tests/scenarios.html` to the file table.
- Add a line that the matching history is invented sample data.

## 10. Walkthrough in the app

- Run all five scenarios through the copilot in the browser, in a mixed order, plus "Fix my workbays" and "undo".
- Check the dashboard question "How is my aftersales performing?" still says "Sales are down 4.2%" and £5,900.
- Check phone width (the chat panel at 375px).
