# Separating Service and BI: design (short)

Date: 2026-11-16
Status: approved 2026-11-16

## Intent

Hussain asked for the aftersales data dashboard to become a thing of its own, not linked to planning, with the planning side independent.

The real Pinewood DMS is a set of separate applications chosen from an Applications screen. The prototype will copy that:
- **Service** is the planning side.
- **BI** is agentic reporting.

**Each app has its own AI Assistance chat.** Agentic reporting is a feature worth showing on its own.

## Goals

- **The prototype opens on an Applications screen** matching the DMS: 15 coloured tiles (Accounts Payable, Accounts Receivable, Administration, BI, Cash Book, Cashier, CRM, DataPoint, Fixed Assets, General Ledger, Parts, Purchase Ordering, Service, Vehicles, Warranty). Only Service and BI open. The others show the usual "Not part of this prototype" note.
- **Service** opens the technician planner. Its AI Assistance only does planning work:
  - booking an appointment, with technician matching and extras
  - the "Fix my workbays and technicians" improvement plans
  - "What's coming up in the planner?"
  - the simulated AI agent call
- **BI** opens like the real BI landing page:
  - "BI" in the top bar and "Pinewood Motors" as the location
  - a left menu with **Reports**
  - an empty grey page
  - **AI Assistance already open**

  It only does reporting: ask a question, get a dashboard, refine it. Built dashboards are listed under Reports.
- **No links between the apps:**
  - The money-lost dashboard loses its **Show me the fix** buttons. It still shows where money is lost.
  - The dashboard loses its **← Technician planner** and **Open planner** buttons.
  - "What's coming up in the planner?" moves to Service.
  - Service stops using BI's figures. It gets its own fixed labour rate.
- **A way back to Applications** from inside either app.

## Non-goals

- Building any of the other DMS applications.
- Real separation into separate pages or code bundles. That's for the development team.
- Changing what either chat can already do, apart from moving the questions to the right app.

## Anti-goals

- **Any number changing:** the dashboard figures ("Sales are down 4.2%", £5,900), extras prices, or the improvement plan's £ values.
- **Breaking existing demos:** the call demo, booking and extras, or the scenario checks.
- **One app's chat answering the other app's questions,** or a button that jumps between them.

## Approach

**Chosen: one page that switches apps** (your decision). The launcher and both apps live in `index.html`. Choosing a tile swaps the top bar, left menu, main area and chat mode. The production version will be built by a development team, so a quick, clean switch in the prototype is enough.

**Considered: separate pages per app** (`service.html` and `bi.html`). It would give stronger separation, but means more rework of shared chat code for a prototype.

**Ruled out: two separate copies of the chat.** They would drift apart.

## How it works (my calls, for you to check)

- **Addresses:**
  - `index.html` opens on Applications.
  - `?app=service` and `?app=bi` open an app directly.
  - The existing presenter links go to the right app: `?call=1` to Service, `?ask=…` to BI.
- **Top bar:** the Pinewood logo goes back to Applications, followed by the app name ("Service" or "BI").
  - **Service** keeps its current location text and breadcrumb.
  - **BI** shows "Pinewood Motors".
- **Each app keeps its own conversation** while the page is open. Going to Applications and back doesn't wipe it.
- **Opening suggestions:**
  - **Service:**
    - Simulate incoming call
    - Book an appointment
    - Fix my workbays and technicians
    - What's coming up in the planner?
  - **BI:**
    - How is my aftersales performing?
    - Why is efficiency down at Branch 2?
    - Which technicians are under-utilised?
    - Where am I losing money?
    - Compare my branches
- **A question meant for the other app** gets a short reply naming where to ask it, e.g. "That's a reporting question. Open BI from Applications to ask it." There's no button across.
- **"What's coming up in the planner?" in Service** is answered in the chat: unallocated jobs, how many are due today, and who's away. The planner stays in view, and no dashboard is built in Service.
- **Service's labour rate** is fixed at the value it calculates from BI's data today, so every price and £ figure stays exactly the same.
- **The improvement plan's "For you to decide" notes** use BI's figures (who has hours clocked but not sold, and the Branch 2 bay loss), so they come out of Service.
- **BI's menu:** Reports, holding each dashboard built in this visit by its title, with the newest at the top.
- **README and tests:**
  - The README explains the Applications screen and the two apps.
  - The call test loads `index.html?app=service`.
  - All 57 checks must still pass.

## Left to the builder

- Tile colours and icons, matching the screenshot as closely as practical.
- The exact BI menu styling, following the existing left menu.
