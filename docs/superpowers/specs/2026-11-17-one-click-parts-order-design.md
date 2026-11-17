# One-click parts order from the job card: design

Date: 2026-11-17
Status: approved 2026-11-17
Builds on:
- [extras on the booking call](2026-11-04-upsell-on-booking-design.md): the parts logic
- [technician matching](2026-11-04-technician-matching-design.md)
- [the AI agent call](2026-11-12-incoming-call-demo-design.md)
- [the preferred-time swap](2026-11-16-preferred-time-swap-design.md)
- [the Service and BI split](2026-11-16-separate-service-and-bi-design.md)

## Intent

**In the real Pinewood DMS, getting a part onto a repair order and ordered takes 7–8 clicks:**
1. Repair Order Progress
2. Expand Work In Progress
3. Open the repair order
4. Repair Details
5. **+**
6. Part
7. Pick the operation
8. Part number, quantity, save

Even then it's only an *estimate* part. Ordering it happens separately in Parts.

**The idea is to make it one click, straight from the job card, in the Service app.** When a technician finds work the car needs, the advisor clicks once, and the AI agent does the rest:
- it phones the customer for approval
- on her yes, it adds the work and parts to the repair order and orders the parts
- if the parts can't be here today, it books her a return visit for after they arrive

Everything the agent does is visible, as in the earlier call demos.

## Goals

- **Simple copies of two DMS screens in Service,** following the screenshots:
  - **Repair Order Progress**, with its columns and counts. Expanding Work In Progress lists job cards.
  - **The repair order page,** with its header, tabs, totals row and Repair Details tree. **Recommended Work** and **Repair Details** work; the other tabs say "Not part of this prototype".
- **Recommended Work shows the technician's finding** on the demo car:
  - what was found, e.g. "Front brake pads and discs: measured 2 mm, red"
  - who found it and when
  - the parts needed, and where they'd come from and when they'd arrive
  - the price including VAT
  - **one button: Get approval and order**
- **That one click starts the AI agent's outgoing call to the customer,** through the existing call screens. The agent:
  - explains the finding and the price
  - says the parts have to be ordered and can't arrive today
  - offers a return visit after they arrive, with a time from technician matching
  - confirms what she chooses
- **On her yes:**
  - the work is added to **Repair Details** as a new requirement, with its operation, labour and part lines, marked approved
  - the parts are ordered (or transferred, using the existing parts logic)
  - the return visit is booked on the planner
  - the copilot posts a summary
- **One Undo reverses all of it:** the repair order lines, the parts orders and the return booking.

## Non-goals

- **The "no" path, and the "parts on the shelf, done today" path.** Only the scripted story is shown (your decision).
- **The other repair order tabs, editing repair order lines by hand,** and the Add Estimate Part dialog (that's the old way).
- **More than one finding on the demo car,** and recommended work on other cars.
- **Real suppliers, real calls or texts.**
- **The rest of the Service menu** (Appointments, Repair Orders, Invoicing and so on) beyond what the two screens need.

## Anti-goals

- **Ordering parts, or changing the repair order, before the customer says yes.**
- **A return visit booked before the parts can be in,** or one that clashes with the diary.
- **The agent saying something the screens contradict:** a different price, time, technician or arrival day.
- **Breaking what works:** the earlier demos, the 58 scenario checks, or BI's figures.

## Decisions made together

- **The part comes from Recommended Work,** once it's approved.
- **The AI agent gets the customer's approval by phone.**
- **The demo story:** the parts must be ordered, and the customer comes back for the work.
- **Approach 1:** simple copies of the DMS repair order screens, not a planner side panel or copilot only.

## Approaches considered

1. **Simple copies of the DMS screens (chosen).** It looks like the real system, so the "used to be 7–8 clicks" contrast lands, and Service gains a home for job card features. The trade-off is two new screens to build.
2. **A job card panel from the planner.** Less to build, but it doesn't look like the job card, and it isn't where advisors handle recommended work.
3. **Copilot only.** The least to build, but it loses "straight from the job card", which is the point.

## The design

### Where it lives

- **The Service menu gains Repair Order Progress,** with Operation, Repair Order > **Detailed**, and Today as children, as in the screenshot. Only **Detailed** opens. *(My call:)* it goes in alongside the existing menu items, without rebuilding the rest of the menu to match the screenshot exactly.
- **Breadcrumbs follow the DMS:**
  - "Service / Repair Order Progress / Repair Order / Detailed"
  - then, on the repair order page, "Service / … / Detailed / 71xxx - Recommended Work"

### Repair Order Progress (Detailed)

- **A grey "Preparation: Included" strip** sits at the top. Below it are **four white panels in three columns**, each row a status label with a red count badge and a chevron. Rows with a count of 0 show a plain 0, with no badge and no chevron. The labels and counts are from the screenshot:
  - **Due In** (top left):
    - Vehicle Arrived, Not Received: 33
    - Repair Orders Not Arrived: 203
    - Appointments Not Arrived: 17
  - **Health Check Progress** (bottom left):
    - Awaiting Parts: 11
    - Awaiting Approval: 13
    - Awaiting Sending: 21
    - Awaiting Labor: 112
  - **Work In Progress** (middle):
    - Not Started: 1547
    - Work In Progress: 193
    - Resume: 23
    - Awaiting Authorization: 24
    - On Hold: 27
    - Quality Control: 1
    - 60-Day Warranty Claim Authorisation: 2
  - **Due Out** (right):
    - Completed: 150
    - Costed: 0
    - Contacted: 0

  *(My call:)* the screenshot's test rows ("test222 dfdfs", "test 123", "test 77", "tes1 Due Date") are left out.
- **Only Work In Progress > "Work In Progress" expands.** The chevron turns down, and it lists about 8 job cards, with a scrollbar. Its badge keeps the sample count, 193. Each job card has:
  - a red left border
  - the customer's name with ›, the registration with ›, and the vehicle description, ending "- {repair order number}"
  - "Out: {date} {time}" on the right
  - a small expand chevron under the card
  - a row of purple action icons at the top right, which are decorative and inert
  - the demo car first, with a small **Recommended work** marker beside those icons
- **Clicking a job card's customer or registration** opens that repair order. Only the demo car's repair order is fully filled in. Others open with a header and their Repair Details, and an empty Recommended Work.

### The demo car and customer (sample data)

- **Mrs K Shaw,** 07700 900789. A car that's in the workshop today for a minor service, so it's on today's planner with a technician.
- **Its repair order has existing Repair Details lines** (the minor service), so the tree and totals look real.
- **The finding:** front brake pads and discs, measured 2 mm, red, found by the technician this morning.
- **New sample parts for her car,** such as front pads and front discs for that model:
  - **Stock:** none at any branch.
  - **Supplier lead time:** one working day, so they arrive tomorrow and the work can be done the day after.

### The repair order page

- **Header:** "Repair Order ID: 71xxx", customer · registration · VIN, and the vehicle description.
- **Tabs as in the DMS:**
  - **Customer/Vehicle**
  - **Reminders**
  - **Repair Order Details**
  - **Repair Details**
  - **Recommended Work**
  - **Insurance Excess**
  - **Purchase Order**
  - **Upsell**
  - **Follow Up**
  - **Overview**
- **A row of purple action icons** sits under the header. They're decorative.
- **Totals row (from the screenshot):** Account (e.g. "THR01 - THR Warranty Account"), Status (warning icon), Cash (tick), Load Hours, Order Number, Odometer, Invoice AWs, Labor, Parts, Non-Labor, Sub Total, Tax, Invoice Total, Available Balance.
  - Load Hours, Labor, Parts, Non-Labor, Sub Total, Tax and Invoice Total are worked out from the lines, with tax at 20%.
  - Below it are an Account dropdown and a search button, both inert.
- **Repair Details:** a tree with a **+** menu at the top right (inert) and these columns: Description, Type, Load Hours, Invoice AWs, Quantity, Price, Account, Parts (tick), Fixed, Status.
  - **Requirements** are bold, lettered rows ("A - VHC test", "B - Service"), with Type "Requirement" and the requirement total as Price.
  - Under each requirement: **Operation** rows ("1 - Carry out VHC test") with load hours, Invoice AWs and Status "Open"; a **Labor** row with the labour price; **Part** rows ("MJC1602 - NUT") with quantity and price, Status "Estimate" for a part not yet in; and sometimes **Environmental Charge** and **Non-Labor** rows.
  - Statuses are "Open" for requirements and operations, and "Estimate" or "On order" for parts. Pencil, menu-pricing and delete icons on the right are decorative.
  - **New lines from the approval** appear as a new lettered requirement, e.g. "C - Front brakes (recommended work)", highlighted like the planner's new cards. Its parts show Status "On order", with the arrival day.
- **Recommended Work:**
  - the finding card, with the parts and their availability ("Supplier, arrives Thu") and the price including VAT
  - **Get approval and order**, with a short line underneath saying what will happen
  - **after the call:** "Approved by Mrs Shaw on the call", plus links to the new Repair Details lines and the return booking

### The one click and the call

- **Get approval and order** opens Service's AI Assistance. An agent note explains what's happening, and the outgoing call to Mrs Shaw starts, through the same call card, transcript, strip and pacing as the other calls.
- **What the agent says**, filled from real results:
  1. who it is, and that the technician found her front brakes are worn
  2. the work and the price
  3. the parts have to be ordered and arrive tomorrow, so it can't be done today
  4. would she like to come back? She says Monday morning suits her. The agent offers the time that technician matching finds for brakes on Monday morning, naming whoever matching suggests, and confirms it.
  5. she agrees, and the agent confirms

  *(My call: the return visit is on **Monday**, not Friday.)* On the page-load diary, Friday morning is deliberately full to set up the preferred-time swap story. A Friday return would compete with Mr Patel's booking and the swap. Monday keeps the two stories independent. The time and technician always come from matching, never fixed in the script.
- **The agent's tools, each shown as an action note:**
  1. check the parts
  2. add the work to the repair order, as an approved requirement with operation, labour and parts
  3. order the parts
  4. find a return slot
  5. book the return visit
- **After the call:**
  - the planner shows the return booking
  - the repair order shows the new lines and updated totals
  - the copilot posts a summary with one Undo
  - Mrs Shaw is sent a confirmation message

### Undo and restart

- **Repair order lines join the same undo history as the diary and parts,** so one Undo reverses the whole approval.
- **The stories must work in the same page session, in any order** *(my call, as with "any order" before)*. That covers Mr Patel's call and swap, and this story, before or after each other. Tests cover this story from a fresh load, and after the Mr Patel call and swap.
- **Restart on this call** *(my call)* rolls back to a snapshot taken when the advisor clicked **Get approval and order**, and replays this call. It only removes the copilot messages added since that click, so the other stories' messages stay. Today `Call.restart()` always replays Mr Patel's incoming call and clears the whole chat, so restart is fixed to replay the call that's on screen: inbound, swap or this one.

### Tests and README

- **Add a scenario that plays this story fast and checks:**
  - the parts are ordered from the supplier
  - the repair order has the new requirement and lines, and the totals went up by the right amount
  - the return visit is booked after the parts can arrive, with a brakes-capable technician and no clashes
  - the agent's words match the price, day, time and technician
  - Undo reverses it all
- **All existing checks still pass.**
- **The README describes the story and the new screens.**

## Left to the builder

- **The exact sample repair orders, customers, cars, technicians, prices and counts,** shaped so the story plays as described.
- **Visual details of the two screens,** following the screenshots and the prototype's existing style.
- **The script wording,** following the earlier calls' tone.

## Revision, 2026-11-17: Recommended Work as it really works (short)

Status: approved 2026-11-17

New screenshots showed that the DMS Recommended Work tab isn't a finding card. It's a working area with its own sections. Keep it simple: mirror that layout, and put the one click on the item's row.

- **The tab's layout, after the screenshots:**
  - **A row of icons:** heart, refresh, forward arrow and thumbs-down. They're decorative.
  - **A totals table** with three rows, each excluding and including tax:
    - Recommended Work Cost Total
    - Current Account Repair Order Total
    - Overall Account Total
  - **Linked Account** ("RET01 - Repair Order") and **Search Account**, both inert.
  - **Three sections:** **Awaiting Parts**, **Awaiting Labor** and **Awaiting Approval**. Each is a table with these columns:
    - a checkbox
    - Description
    - Checklist
    - Account
    - Labor
    - Parts
    - Available
    - Alternatives
    - Non-Labor
    - Total
    - Total (With Tax)
    - Identified By
    - row icons

    Each section has its toolbar (forward arrow, thumbs-down, back and forward arrows, **+** and the parts icon, all inert) and a "Total Cost" line. An empty section says "No items to show."
- **Mrs Shaw's item sits in Awaiting Parts,** as the technician left it:
  - "Front brake pads and discs - Measured 2 mm, red"
  - Default Checklist, RET01, all values 0.00
  - Identified By Ana Ceban

  *(My call:)* two zero-value checklist rows sit in Awaiting Labor for realism, like the screenshot's eVHC and tread depth rows.
- **The one click:** a **Get approval and order** button on her row. It replaces the old card and its button. Clicking it:
  1. **The agent prices the item first,** as a step in the transcript. It fills in the parts from the catalogue (front pads and discs, "on order Thu"), the labour (2.2 h) and the totals. The row moves to **Awaiting Approval**. These are the clicks the DMS makes you do by hand: Parts Details, part search, add part, labour, move along.
  2. **Then the approval call plays as already built.** On her yes, the item leaves Recommended Work and becomes requirement C on Repair Details, the parts are ordered, and Monday is booked. One change, with one Undo.
  3. **A short green note** at the top of the tab says it was approved on the call and links to Repair Details and the booking.
- **Totals follow the items:** the Recommended Work Cost Total rises when it's priced and drops back to 0 once it's approved. The repair order total rises by the approved amount.
- **Undo** puts the item back in Awaiting Approval, priced, and removes the repair order lines, the orders and the booking. **Restart** goes back to how things were before the click, with the item in Awaiting Parts.
- **Not included:** the Add Recommended Work dialog, the Parts Details window, or moving items between sections by hand.
- **Tests:** the existing parts order checks, plus checks that the row moved from Awaiting Parts to Awaiting Approval before the call and is gone after approval. All 60 checks still pass.
