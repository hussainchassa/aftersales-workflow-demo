# Asking another customer to swap for a preferred time: design

Date: 2026-11-16
Status: approved 2026-11-16
Builds on:
- [the AI agent call demo](2026-11-12-incoming-call-demo-design.md)
- [technician matching](2026-11-04-technician-matching-design.md)
- [extras on the booking call](2026-11-04-upsell-on-booking-design.md)
- [separating Service and BI](2026-11-16-separate-service-and-bi-design.md), which should be built first (this lives in Service)

## Intent

Hussain wanted to show that when a booking would change the schedule, the knock-on effect on other appointments is visible, and a person decides.

The shape we settled on:
- **A customer has a preferred time that's already taken** by another customer's appointment.
- **They get a confirmed appointment at a free time straight away.**
- **If the taken time is their number one preference,** the shop can ask the other customer whether they'd be willing to move. An advisor must approve before anyone is contacted.
- **The other customer is phoned by the AI agent.** Only if they agree before a strict deadline do the appointments swap.
- **Nobody's appointment moves without that customer's yes.**
- **If the answer is no, or nobody answers in time, nothing happens and nobody is told.** The first customer keeps their confirmed time, like a restaurant saying "we'll try to get you in".

## Goals

One continuous demo, extending the AI agent call (your decision, option 1):

1. **Mr Patel calls** and asks for Friday at 8:00, because he needs the car back by lunchtime. **8:00 is taken** by Mrs Hughes's appointment.
2. **The agent books him at the best free time** (say 10:30) with his extras, as today. It notes that 8:00 is his first choice, and tells him it will ask the team whether 8:00 can be freed up. If it can, he'll be told.
3. **After the call, a swap request appears in Service's AI Assistance for the advisor:**
   - Mr Patel would prefer Friday 8:00.
   - That slot is Mrs Hughes's appointment: her car, her job, the technician and the bay.
   - The alternative times that would suit Mrs Hughes, checked against the diary.
   - What would move on the planner if she agrees, shown as dotted "proposed" cards.
   - The reply deadline, with a countdown.

   There are two buttons: **Approve and call Mrs Hughes**, and **Decline**.
4. **When the advisor approves, the agent phones Mrs Hughes.** There's an outgoing call card, then the same live transcript view, with the agent's actions marked in step. The agent explains politely, offers her the alternatives, and she picks one.
5. **The swap is applied as one change:** Mrs Hughes moves to the time she chose, and Mr Patel moves into Friday 8:00.
   - The planner shows both moved cards.
   - The copilot reports the swap, with one Undo for both.
   - Mr Patel is let know he's now at 8:00.

## Non-goals

- **The "no" and "no answer" paths.** They're only shown by their absence: nothing happens. The deadline is displayed, but the demo never lets it run out.
- **Swaps started from the advisor's own booking form,** for example a "preferred time" field. The swap logic should be its own piece so that can be added later.
- **More than one preference, or chains of moves** that involve three or more customers.
- **Real calls or texts.** The outbound call is simulated like the inbound one.
- **Incentives for the customer who moves,** such as a discount.

## Anti-goals

- **Anyone's appointment moving without their yes** on the call.
- **Contacting Mrs Hughes before the advisor approves.**
- **The swap looking done before it is.** Proposed cards must look clearly different until it's applied.
- **A double booking at any point,** including during the swap.
- **Breaking what works:** the dashboard figures, extras prices, or the existing scenario checks. Some call-demo checks will need updating, because the story changes.

## Decisions made together

- **Show the knock-on as a customer-preference swap,** not as the system silently shuffling jobs.
- **The advisor must approve before the other customer is contacted.**
- **The other customer is contacted by voice,** through the AI agent.
- **Only the "yes" path is shown.** "No" or "no answer" means nothing changes and nobody is told.
- **There's a strict reply deadline.**
- **One continuous demo extending the existing call** (option 1). The current "everything goes smoothly" version of Mr Patel's call is replaced.

## Approaches considered

1. **Extend the call demo into one story (chosen).** It shows the agent, the advisor's approval and the planner working together. It's longer, around five minutes.
2. **A separate demo started from a manual booking.** Shorter, but it splits the story in two.
3. **Both: swap logic in the booking flow and a second call version.** The most flexible, but the most to build and test.

## The design

### Sample data

- **Mrs Hughes:** Mrs P Hughes, 07700 900456, a Skoda Octavia (GY21 NBF).
  - *(My call:)* her existing Thursday booking with Justin, which sets up the diagnostics matching scenario, is handed to another invented car and customer, so that scenario and its checks don't change.
  - Mrs Hughes gets a new Friday booking.
- **She has a short job on Friday at 8:00,** such as an MOT and minor service. It takes the slot Mr Patel wants.
- **Friday 8:00 must be genuinely unavailable for Mr Patel's 4.5-hour job with every suitable technician and bay,** so the agent has to offer a later time. **This is tuning work for the builder.** Today Friday morning is quite empty, and several technicians are equally good at major services.
  - *(My call:)* block it with **technicians' existing Friday jobs, not with bays**. "Fix my workbays" frees ramps on Friday, so a bay-based setup would fall apart after it.
  - The full swap story must play from a fresh load, and after "Fix my workbays".
- **At least two alternatives must suit Mrs Hughes,** such as Friday afternoon and Saturday morning.
- **Mrs Hughes's slot, once freed, must fit Mr Patel's 4.5-hour job** with a suitable technician and bay.

### Mr Patel's call (changed)

- **He asks for "Friday, first thing, around 8"**, because he needs the car back by lunchtime.
- **When the agent finds a technician, it can only offer a later time.** It says so, offers it, and asks if he'd like it as a backup while it asks the team about 8:00.
- **He agrees. The agent books the later time, with the extras, exactly as today,** then logs the preference. The action note reads "Agent logged a preference for Fri 08:00", and the swap request is created for the advisor.
- **The call ends as today,** with the strip and summary. The summary also mentions the preference.
- **When the diary doesn't set up a swap** *(my call: fall back gracefully, as the earlier call design did)*. The swap logic finds whoever's appointment blocks the preferred time; it isn't fixed to Mrs Hughes. The agent says whatever is actually true:
  - **8:00 is free:** it books 8:00 directly, and there's no swap request.
  - **8:00 is blocked, but no single appointment could move to free it:** it books the later time and says it'll keep him in mind, and there's no swap request.
  - **It's blocked by someone else:** the swap request names that customer.

  The script branches only at this one point.

### The swap request (advisor)

- **It appears in Service's AI Assistance after the call:** a card showing the request, the proposed moves, the alternatives for Mrs Hughes, and a **deadline countdown**. The deadline is a fixed time, e.g. "reply by 17:00 today", shown as time remaining.
- **"Preview on planner"** *(my call)* shows:
  - **Mr Patel's booking as a dotted proposed card at 8:00**
  - **Mrs Hughes's card at 8:00 marked "would move"**, without drawing her at any new time, because she hasn't chosen yet

  Her alternatives are listed on the swap card instead. Showing her at a time she hasn't picked would make the swap look decided.
- **"Approve and call Mrs Hughes"** starts the outbound call straight away.
- **"Decline"** closes the request. Nothing changes and nobody is contacted.
- **The demo waits for this click.** It's the human step, and must never be automated in the live demo.

### The outbound call (Mrs Hughes)

- **It uses the same call event stream and screens as the inbound call,** with an outgoing direction: "Calling Mrs P Hughes · 07700 900456", ringing, then answered.
- **The script:**
  1. The agent introduces itself and explains that another customer is hoping for her Friday 8:00 slot.
  2. It asks whether she'd be happy to move, and offers the alternatives by day and time.
  3. She picks one, say Friday at 13:00, and the agent confirms it.
- **The agent's tools** check the alternatives against the diary, then apply the swap. Each one shows as an action note.
- **The lines are filled from real results,** the same as the inbound call: her name, car, job, the alternatives and the time she picks.

### Applying the swap

- **One change:** Mrs Hughes's appointment moves to her chosen time and technician, and Mr Patel's booking moves to Friday 8:00. Both go through the existing clash checks.
- **Mr Patel's parts holds and orders stay valid,** because it's the same day. They're re-checked anyway.
- **The planner shows both moved cards highlighted** and scrolls to them.
- **The copilot reports the swap,** with one **Undo** for both moves.
- **Mr Patel is told.** The agent sends him a short message, shown as an action note and in the copilot: "Good news, Mr Patel, we've moved you to Friday at 8:00."

### Restart, tests, README

- **Restart** still puts the diary and parts back to how they were when Mr Patel's call rang. That covers the whole story.
- **Tests:** play the full story fast, approving the swap from code, and check:
  - Mr Patel is at Friday 8:00, Mrs Hughes is at her chosen time, and there are no clashes
  - the extras and parts still hold
  - the agent's lines on both calls match the results
- **Update the existing call-demo checks to the new story.** All other checks still pass.
- **The README describes the swap story.**

## Left to the builder

- **Exact technicians, bays and times,** shaped so the story plays as described.
- **Script wording,** following the inbound call's tone.
- **The look of the swap card and the outgoing call card,** following the existing copilot and call styles.
- **The deadline time,** and how the countdown is shown.
