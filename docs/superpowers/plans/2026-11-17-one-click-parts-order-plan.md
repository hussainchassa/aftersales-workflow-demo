# One-click parts order: build plan

Design: [2026-11-17-one-click-parts-order-design.md](../specs/2026-11-17-one-click-parts-order-design.md)
Branch: `feature/one-click-parts-order`

As before, the checks are `tests/scenarios.html` and a walkthrough in the app. Each step should leave the app working.

## 1. Repair orders: `js/repair-orders.js` (new)

- **Sample repair orders:**
  - Mrs Shaw's, fully filled in: a minor service in Repair Details, and one Recommended Work finding (front pads and discs, 2 mm, red, found by today's technician).
  - About 7 others for the job card list, each with a header and a few Repair Details lines.
- **Each line has:** a type (requirement, operation, labor, part, environmental, non-labor), its parent, description, load hours, Invoice AWs, quantity, price, account and status.
- **`totals(ro)`:** Load Hours, Labor, Parts, Non-Labor, Sub Total, Tax at 20% and Invoice Total.
- **`apply(changes)`:** adds a requirement with its lines, and marks a finding approved.
- **`snapshot()` / `restore()`:** these join `Workshop.apply` and undo, the same way parts do.
- **Done when:** the totals for Mrs Shaw's repair order add up, and adding then undoing a requirement leaves them unchanged.

## 2. Mrs Shaw's car, customer and parts

- **The customer and car** go into `js/vehicles.js` (`lookupCaller`), and her minor service goes on today's planner with a technician.
- **New parts in `js/parts.js`:** front pads and front discs for her car, with no stock at any branch and a supplier lead time of 1 working day.
- **The brakes job for her return visit:** her pads and discs, with a load time set so matching finds a Monday-morning slot.
- **Done when:** `Parts.availability` says "order, arrives Thu" for both parts, and `Matching.suggest` finds a brakes slot on Monday morning from a fresh load and after the Patel story.

## 3. Repair Order Progress (Detailed) screen

- **The Service menu** gains Repair Order Progress > Repair Order > **Detailed**, plus Operation and Today, which are inert. The breadcrumbs follow the DMS.
- **The screen,** with the panels, rows and counts from the design. Work In Progress > "Work In Progress" expands to the job cards, with Mrs Shaw first and her "Recommended work" marker.
- **New CSS** in `css/repair-orders.css`.
- **Done when:** it matches the screenshot closely, and clicking a job card opens its repair order.

## 4. The repair order page

- **The layout:** header, tabs, the decorative icon row, the totals row, then the inert Account dropdown and search.
- **The Repair Details tree,** with the columns and statuses from the design.
- **Recommended Work:** the finding card, with parts, availability, price including VAT, and **Get approval and order**. After approval it shows the approved state and links.
- **Other tabs** show "Not part of this prototype".
- **Done when:** both tabs render for Mrs Shaw and for another repair order.

## 5. The call: `js/call.js`

- **Restart replays whichever call is on screen.** Each story keeps its own snapshot (when the phone rang, or when the advisor clicked) and a marker of where its copilot messages start. Restart only removes the messages added since that marker, so other stories' messages stay.
- **A third script, for Mrs Shaw.** Its tools are:
  1. `check_parts`
  2. `approve_work`: adds the requirement and lines to the repair order
  3. `order_parts`
  4. `find_return_slot`: matching for brakes, Monday morning
  5. `book_return`: through the copilot booking plan, so it lands on the planner with one undo, together with the repair order lines and parts
  6. `notify_customer`

  Her lines are filled from the tool results.
- **`startApproval(ro)`** starts the outgoing call. The copilot posts the agent note and, after the call, the summary.
- **Done when:** the full call plays fast from the console, and one Undo reverses the repair order lines, the parts and the return booking.

## 6. Wiring

- **`js/app.js`:**
  - the new views and menu
  - a `ro-approve` action
  - `?app=service&ro=<id>` opens a repair order directly, for presenting
- **`js/copilot.js`:**
  - the agent note
  - summaries in the Service chat
  - the planner reveal of the return booking
- **`index.html`:** the new scripts and CSS.

## 7. Tests, README, walkthrough, commit

- **`tests/scenarios.html`:** play Mrs Shaw's call fast and check:
  - the parts are ordered
  - the repair order has the new requirement, and the totals went up
  - the return visit is after the parts arrive, with a brakes-capable technician and no clashes
  - the agent's words match the results
  - Undo reverses it all

  Run it from a fresh load, and after the Patel call and swap. All existing checks still pass.
- **README:** the new screens and story.
- **Walkthrough in real time.**
- **Commit.**
