# Technician matching for new appointments: design

Date: 2026-11-04
Status: approved 2026-11-04

## Intent

Make better use of the whole workshop team by matching each incoming appointment to a technician who is good at that kind of work and free when the customer wants it.

The person using it is whoever takes the call at the service desk (a service advisor or the service manager), with the customer still on the phone. They enter the customer's details, the car, the job and when the customer wants it done. The system suggests a time and a technician, explains why, and offers alternatives. The advisor books it there and then.

The point of the demo is that **the AI Assistance copilot does this**. The real Pinewood system already has a booking screen, so the prototype doesn't recreate one. The copilot chat is the entry point.

Matching is driven by each technician's job history:

- **Speed:** time taken against the standard time for that job type. Raw time in the workshop is not used, because it includes waiting for parts or customer sign-off.
- **Quality:** whether the same car came back within 30 days, which counts against the technician.

In production these data points would build up as jobs are completed, so the system improves over time. In this demo the history is pre-generated sample data.

It doesn't need to be perfect. The goal is spreading work sensibly, not finding the single best match every time.

## Goals

- From the copilot, an advisor can enter a booking and get one suggested time and technician with a plain-English reason, plus up to two alternatives.
- The suggestion avoids always picking the top technician. Work is spread across everyone who is good enough, and newer technicians get suitable jobs to build up history.
- If the customer asks for a specific time, the suggestion respects it. When a clearly better technician is free at another time, that is shown as an alternative the advisor can offer.
- Booking puts the job onto the technician planner, with the same preview, clash checks and undo the copilot's existing diary plans have.
- Five job types, each set up to demonstrate a different behaviour (see Scenarios).

## Non-goals (for now)

- **Live learning.** Booking or finishing a job in the demo doesn't change anyone's scores.
- **Manager-set skills or qualifications.** Matching comes purely from history. Skills can be added later.
- **Looking up existing customers or vehicles.** There's no customer database.
- **Other branches.** The planner only has Branch 1's diary, so only Branch 1 is covered.
- **Editing or cancelling bookings,** beyond the copilot's existing "undo".
- **Multiple jobs in one booking,** SMS or email confirmations, or courtesy cars.
- **Real data or a real AI model.**

## Anti-goals (would count as failure even if it technically works)

- **The best technician gets every job** and everyone else sits idle.
- **A suggestion that clashes** with a shift, an absence, another job or a busy bay.
- **The booking flow breaks or misreads input mid-demo.** That's why the entry point is a form, not free text.
- **Any existing AI dashboard number changes.** The current demo story, like "Sales are down 4.2%", must stay exactly as it is. This covers the figures from `js/aftersales-data.js`. *(My call:)* The planner diary may gain future jobs to set up the scenarios, so diary-based figures can shift: "What's coming up in the planner?" capacity, and the counts in the "Fix my workbays" plan. Those are worked out live from the diary, not part of the scripted story.

## Constraints

- **Plain static site.** HTML, CSS and plain JavaScript, with no build step, nothing to install and no API key. It opens from `index.html`.
- **History stays separate from the dashboard data.** `js/aftersales-data.js` generates its job history from one seeded random sequence, so any change to that generator shifts every dashboard figure. The matching history must live in its own module with its own seed.
- **Technician names must match the planner.** The history covers the technicians in the planner's `RESOURCES` list (rows with `tech: 1` in `js/workshop-planner.js`). The dashboard's `TECHS` list uses a different set of Branch 1 names, and that's fine, because the two don't interact.
- **Times come from the planner.** "Now" is `TODAY` = 2026-11-04 and `NOW_HOUR` = 09:42 in `js/workshop-planner.js`.
- **Everything is in memory.** Bookings last until the page is reloaded, like existing applied plans.

## Approaches considered

### Where booking starts

1. **A booking panel on the planner.** A "New appointment" button opens a side panel over the timeline.
2. **A separate Appointments screen.**
3. **The AI Assistance copilot (chosen).**

The real system already has a booking screen, and the point of the demo is the copilot doing the work. Options 1 and 2 would have recreated something that already exists.

### How the advisor enters the details in the copilot

1. **Type one line, and the copilot fills a card to check.** This feels the most like talking to it, and a wrong guess is a quick fix. It's the most work to build.
2. **Chat only, with follow-up questions.** This is the most natural chat. But question handling is rule-based (`js/intent.js`), so unusual wording could fail mid-demo.
3. **A form in the chat (chosen).** A starter button opens a booking form in the chat. It's the most reliable, and that matters most with a customer on the phone and a presenter in front of dealers. The trade-off is that the copilot does less of the visible "understanding".

### How the choice is presented

1. **Recommend one, and the manager can override (chosen).** One suggested time and technician with a reason, plus alternatives each with "Book instead". This keeps a person in the loop without making them do the analysis.
2. **A ranked shortlist with no default.** Rejected because it slows the advisor down on a live call.

## The design

### Flow

1. The copilot's starter list gets a new first chip, **"Book an appointment"**. Typing something that clearly asks to book, such as "book an appointment" or "new booking", does the same thing. These phrases are recognised in `Intent.interpret`.
2. The copilot replies with a **booking form card** in the chat:
   - Customer name.
   - Phone number.
   - Vehicle registration.
   - Make and model, as free text.
   - Job type: one of five chips (Brakes, Tyres, Major service, Diesel, Diagnostics).
   - When: a day, plus a time of day (As soon as possible, Morning, Afternoon, or a specific start time).

   Only the job type and when are needed to find a technician. The other fields are shown on the booked card.
3. **"Find a technician"** shows the copilot's usual working steps, then a **suggestion card**:
   - **Main line:** the suggested day and time slot, e.g. "Thu 5 Nov, 09:00 to 10:15", in large type, because that's what the advisor reads out.
   - **Technician and bay.**
   - **A one-sentence reason** saying why this person, and why not the obvious top choice if they were skipped.
   - **Stat chips:** jobs of this type on record, speed against standard time (e.g. "1.1×"), and came back within 30 days (e.g. "1 of 21").
   - **Buttons:** "Book [name], [day time]" and "Preview on planner".
   - **Up to two alternatives,** each with a short label written so the advisor can say it to the customer, such as "If Mr Patel can do the afternoon" or "Also free Thursday morning". Each has the same stat chips and a "Book instead" button.
   - **A footnote:** "Sample data. Nothing is booked until you click."
4. **Booking** adds the job to the planner on that technician's row, highlighted like other copilot changes, and switches to the planner. The chat confirms it and offers "Undo".
5. **"Preview on planner"** shows the proposed card on the planner without booking it, as plan previews do today.

### Job types

| Type | Standard time | Bay | Notes |
| --- | --- | --- | --- |
| Brakes | 2.2 h | Ramp | Pads and discs |
| Tyres | 1.5 h | Tyre bay, then ramps | Tyres and alignment |
| Major service | 2.6 h | Ramp | |
| Diesel | 2.0 h | Ramp | Diesel particulate filter (DPF) cleaning or regeneration, and injector work |
| Diagnostics | 1.2 h | Ramp | |

Standard times are taken from similar jobs already in the planner's unallocated list. The booked slot length is the standard time, rounded up to the nearest quarter hour.

### Matching history (new, sample data)

There's a new module, `js/matching.js`, with its own seeded generator. It produces about 12 months of past jobs for each Branch 1 planner technician across the five job types. Each past job records:
- the technician
- the job type
- the date
- a vehicle registration
- the standard time
- the hours clocked

A **comeback** is worked out from the data, not flagged: the same registration returning for the same job type within 30 days of the first job.

The generator is tuned so the five scenarios below play out. It isn't meant to be realistic in every detail.

### Scoring and choosing (my proposal, needs your check)

For each technician and job type:
- **Speed** = total hours clocked ÷ total standard hours. Below 1.0 is faster than standard.
- **Comeback rate** = comebacks ÷ jobs.
- **Score** combines the two, with comebacks weighted more heavily than speed, but a single comeback doesn't sink anyone. You said about 10% comebacks "isn't that bad", so a fast technician at 10% should still score close to a slower one at 0%.
- **Limited history:** with only a few jobs on record, the score is pulled towards the team average for that job type, and the card says "limited history".

Choosing a suggestion for a requested time:
1. **Who's available:** technicians on shift, not absent, not already booked, and with a suitable bay free for the whole slot. Apprentices are still excluded from complex work, using the existing rule in `js/optimiser.js`.
2. **Good enough:** anyone whose score is within a set margin of the best available score counts as a fit.
3. **Least busy wins:** among those who fit, the suggestion goes to whoever has the fewest hours booked that day, then that week. This is what spreads the work around.
4. **Room for newer technicians:** a technician with limited history for that job type can be suggested only if a stronger technician for that job type is on shift the same day as backup. The reason says so.
5. **The better option at another time:** if the best technician overall isn't free at the requested time, their earliest free slot is shown as an alternative. The other alternative is the next best fit at the requested time.

"As soon as possible" means the earliest slot today after 09:42, searching forward day by day. "Morning" is 08:00 to 12:00, and "Afternoon" is 12:00 to the end of the shift.

*(My call:)* **When nobody suitable is free in the requested window,** the main suggestion moves to the nearest free slot that fits, later the same day if possible, otherwise the next working day. The reason starts by saying so, e.g. "Nobody's free at 09:00. The earliest good fit is 10:30." The card always has one main slot. There is no separate "nothing free" state, apart from a plain message if nothing fits within the planner's two-week range.

### Scenarios the sample data must produce

Each of these should happen when you book that job type for "As soon as possible", or for a time given in the scenario.

**They must hold in any order** (your decision), not just from a fresh page load. For example:
- after "Fix my workbays and technicians" has been applied
- after the other four types have been booked
- after an undo

Plan the scenario jobs and history so the copilot's other features can't take the slots the scenarios rely on. Check every scenario against several demo orders before calling it done.

*(My call:)* "Hold" means the same behaviour and story. Booking the same type over and over will naturally fill people up and move on to others, and that's correct.

| Job type | What it shows |
| --- | --- |
| Brakes | **Simple case:** one technician is clearly best and free today, so they're suggested. |
| Diesel | **Top match busy:** the best diesel technician is booked until Friday, so the next best who's free today is suggested. The best technician's Friday slot is the alternative. |
| Diagnostics | **Speed vs. quality:** for Thursday morning, the fastest technician has the most comebacks. A slower technician with none is the best. Because the best technician's morning is full, a close-behind technician who's less busy is suggested. Matches the mockup (Justin suggested, Isobel in the afternoon, Louis listed). |
| Major service | **Spreading work:** several technicians are equally good, so it goes to the least busy one. Booking twice in a row suggests two different people. |
| Tyres | **Newer technician:** a technician with only a few tyre jobs gets the suggestion, with "limited history" and a stronger tyre technician named as on hand. |

**Setting up the scenarios (my call).** Today's diary is nearly empty from Wednesday on, so the scenarios need some future jobs added to `ALLOCATED` in `js/workshop-planner.js`. For example, Isobel's Thursday morning and the best diesel technician's days until Friday. Use absences already in the diary where they fit, like Callum's holiday on Wednesday and Thursday. Matching the mockup's names and story is required. Its exact figures (job counts, speeds, times) are rough targets, not fixed numbers.

### Code touchpoints

- **`js/matching.js` (new):** the seeded history, scores, and a `suggest(request, snapshot)` function. It returns a suggestion and alternatives, each with time, technician, bay, reason and stats.
- **`js/copilot.js`:** the new starter chip, form card, suggestion card, and book, preview and undo handling.
- **`js/intent.js`:** recognises booking requests and returns a new result kind.
- **`js/workshop-planner.js`:** a new change kind for adding a brand-new appointment card. The existing `book` kind only moves a job from the unallocated list. It's needed in `applyChanges`, so preview, apply and undo work the same way as today.
- **`css/copilot.css`:** styles for the form and suggestion cards, matching the current copilot.
- **`index.html`:** a script tag for `js/matching.js`.
- **`README.md`:** add "Book an appointment" to "Questions to try", and `js/matching.js` to the file table.

The mockups are in `.superpowers/brainstorm/` for reference: `tech-match-booking.html` and `copilot-booking.html`. Add `.superpowers/` to `.gitignore`.

## Left to the builder

- **The exact scoring formula and margins,** including the "good enough" margin and how strongly limited history is pulled towards the average. They need to be tuned so the scenarios above happen.
- **How the form handles missing or invalid input,** kept light, as this is a demo.
- **The exact wording of reasons and alternative labels,** following the mockup's tone.
- **Whether the copilot asks "Book another?"** after a booking.
