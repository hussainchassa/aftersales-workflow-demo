# Service and BI split, then the preferred-time swap: build plan

Designs:
- [separating Service and BI](../specs/2026-11-16-separate-service-and-bi-design.md)
- [the preferred-time swap](../specs/2026-11-16-preferred-time-swap-design.md)

Branch: `feature/separate-service-and-bi`

Part A ships first and is committed on its own, then Part B. As before, the checks are `tests/scenarios.html` and a walkthrough in the app.

## Part A: Service and BI

### A1. Applications screen
- **The launcher** in `index.html` and `js/app.js`: the 15 tiles from the screenshot, with matching colours and icons. Only Service and BI open; the rest show "Not part of this prototype".
- **Addresses:**
  - `?app=service` and `?app=bi` open an app directly.
  - `?call=1` opens Service, and `?ask=…` opens BI.
  - No parameter opens Applications.
- **The top bar:** the Pinewood logo goes back to Applications, followed by the app name.
- **Done when:** both tiles open their app, and the logo comes back.

### A2. App switching
- **`App` gains a current app.** Each app has its own left menu, breadcrumb, location text and landing view:
  - **Service:** the menu it has today, with no Reporting > AI dashboard, landing on the planner.
  - **BI:** a Reports menu holding the dashboards built so far, an empty landing page, and AI Assistance opened automatically.
- **Done when:** switching back and forth keeps each app's state.

### A3. Two chats from one copilot
- **The copilot gets a mode,** `service` or `bi`, with its own conversation, opening suggestions and placeholder for each.
- **`Intent.interpret` results are routed by mode:**
  - **BI** only builds dashboards.
  - **Service** handles booking, plans, the call and "What's coming up?", answered in the chat.
  - **Anything meant for the other app** gets a one-line reply naming where to ask it.
- **Done when:** each chat's opening suggestions all work, and a cross-app question gets the reply.

### A4. Cut the ties
Remove from the dashboard:
- **Show me the fix**
- **← Technician planner**
- **Open planner**

Then make Service independent of BI's figures:
- **Labour rate:** Service gets a fixed rate, set to the value BI calculates today. Read it off before changing anything, and use it in the improvement plan and extras prices.
- **"For you to decide" notes:** remove them from the improvement plan.

**Done when:** every price and £ figure is unchanged, and the dashboard figures are unchanged.

### A5. Tests, README, walkthrough, commit
- **The call test** loads `index.html?app=service`.
- **The README** describes the Applications screen and the two apps.
- **57 of 57 checks pass,** and there are no console errors.
- **Commit Part A.**

## Part B: the preferred-time swap

### B1. Sample data
- **Mrs P Hughes:** 07700 900456, GY21 NBF.
- **Her current Thursday booking** with Justin is given to another invented car and customer.
- **She gets a Friday 08:00 job,** e.g. an MOT and minor service.
- **Friday 8:00 is blocked for Mr Patel's 4.5-hour job** with every suitable technician, using technicians' Friday jobs, not bays.
- **At least two alternatives suit her,** and her freed slot fits Mr Patel's job.
- **Done when:** a major service for SC20 UYT on "Friday from 08:00" can't get 8:00 from a fresh load, or after "Fix my workbays". The existing scenario checks still pass.

### B2. Swap logic
A new `js/swap.js`:
- **`findSwap(preference, booking)`** returns the appointment blocking the preferred time, the alternatives that suit that customer, and both proposed moves. It returns `null` if no single move frees the time.
- **`applySwap(swap, choice)`** builds one change set with both moves, checked for clashes, which goes through `Workshop.apply` so one Undo reverses it.
- **The planner gets a change kind that moves an existing card in time,** plus a "would move" mark for previews.
- **Done when:** both functions work from the console and Undo reverses the swap.

### B3. Mr Patel's call, updated
- **He asks for Friday around 8:00.**
- **The agent's lines branch at one point:**
  - **8:00 free:** it books 8:00.
  - **Swap possible:** it offers the later time as a backup, books it and logs the preference.
  - **No swap possible:** it books the later time and keeps him in mind.
- **A new tool, `log_preference`,** creates the swap request after the call.
- **The summary mentions the preference.**

### B4. Advisor swap request
- **A swap card in the Service chat:** the request, the alternatives for Mrs Hughes and a deadline countdown.
- **Its buttons:**
  - **Preview on planner:** Mr Patel dotted at 8:00, and Mrs Hughes marked "would move".
  - **Approve and call Mrs Hughes.**
  - **Decline.**
- **Done when:** Decline changes nothing, and Approve starts the outbound call.

### B5. Outbound call
- **The call event stream gains a direction.** The outgoing card says "Calling …".
- **Mrs Hughes's script:**
  - the agent explains and offers the alternatives
  - she picks one
  - tools `offer_alternatives` and `apply_swap` run, with lines filled from their results
- **After the swap:**
  - the planner shows both moved cards
  - the copilot reports it, with one Undo for both moves
  - an action note and copilot line say Mr Patel was told he's now at 8:00
- **Restart** still goes back to when Mr Patel's call rang.

### B6. Tests, README, walkthrough, commit
- **Update the call test to the full story,** approving the swap from code. Check:
  - Mr Patel is at Friday 8:00, and Mrs Hughes is at her chosen time
  - there are no clashes
  - parts are held
  - both calls' lines match the results
- **Run it from a fresh load, and after "Fix my workbays".**
- **Add a fallback check:** with 8:00 already free, there's no swap request.
- **README:** describe the swap story.
- **Walk through it in real time.**
- **Commit Part B.**
