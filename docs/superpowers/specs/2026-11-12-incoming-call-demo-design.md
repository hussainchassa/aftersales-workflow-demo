# Showing an AI agent handling a booking call: design

Date: 2026-11-12
Status: approved 2026-11-12
Builds on:
- [technician matching](2026-11-04-technician-matching-design.md)
- [offering extras on the booking call](2026-11-04-upsell-on-booking-design.md)

## Intent

Show what it could look like if an **AI agent answered a customer's booking call** and did the whole job itself: it finds out what's needed, looks up the car, offers extras, finds a technician and books.

**This is for a demo, and the audience has to see everything the agent does for it to land.** A customer call comes in, the agent answers, and a live transcript plays alongside the AI Assistance copilot. Every action the agent takes shows in the copilot at the moment it happens on the call. In production nobody would need to watch this.

**The voice approach hasn't been decided.** This is a concept to show what it could look like. At a real demo, the plan would be a live call from a presenter through a voice provider the business is partnering with. For the prototype, a scripted call stands in for that live call, built so the scripted call could later be swapped for the live one.

## Goals

- **A realistic incoming call:** ringing, matched to a known customer and car, and answered by the agent.
- **A live transcript** that plays in real time, at a natural speaking pace, next to the copilot.
- **The agent works the real booking flow in the copilot,** in step with the conversation: filling in the booking, "Next" to see extras, ticking what the customer agrees to, "Find a technician", then "Book and order". The planner, parts holds, orders and undo behave exactly as they do when an advisor books.
- **What the agent says always matches what the copilot shows:** the same technician, time, extras and price.
- **Built around a stream of call events,** so a live voice provider could drive the same screens later.

## Non-goals

- **Sound.** No audio in the prototype. A live demo would have real voices, and browser voices would distract.
- **Real phone calls or a voice provider connection.**
- **A customer who pushes back, changes their mind or goes off script.** One smooth call only.
- **More than one scripted call.**
- **A person taking over the call.** The button is shown, but it says it isn't part of this demo.
- **Recording, call history, or a call log screen.**

## Anti-goals (would count as failure even if it technically works)

- **The transcript and the copilot out of step,** for example the agent saying "booked" before the copilot has done it.
- **The agent saying something the screen contradicts,** such as naming John while the copilot suggests Ana, or quoting a different price.
- **The demo stalling or needing a click to keep going,** apart from the presenter's own pause.
- **Breaking anything that already works:** the 55 scenario checks, manual booking through the copilot, or the dashboard figures.

## Decisions made together

- **An AI agent talks to the customer,** not an advisor. The demo exists to show everything the agent does.
- **Real time:** the call plays through on its own, with **pause** and **restart** for the presenter.
- **No audio in the prototype.** A "speaking" indicator shows who's talking.
- **A smooth call:** the customer agrees to what the agent suggests.
- **Layout A from the mockup:** while the call is live, the call view takes over the main area. A big transcript sits on the left, with the copilot beside it at its normal size. When the agent books, the main area switches back to the planner so the room sees the job land.
- **Built as a call event stream with a script feeding it** (option 1), so a voice provider adapter can replace the script later.

## Approaches considered

1. **A call event stream fed by a script (chosen).** The screens only react to events. The script produces them now, and an adapter for the voice provider could produce them later. Agent actions call the copilot's real functions. It's slightly more structure now, but it isn't throwaway.
2. **A hard-coded animation:** a fixed timeline of lines and clicks. Quicker to build, but it would have to be rebuilt to go live.
3. **Connecting the voice provider now.** Ruled out: undecided, and the prototype has no phone or audio connection.

The layout was chosen separately, from three options:
- **A, the call takes over the main area (chosen).**
- **B, three columns:** too narrow on a projector.
- **C, the transcript inside the copilot:** too cramped.

## The design

### Starting the call

- **A "Simulate incoming call" starter** in the copilot's opening list, and a presenter link `index.html?call=1`.
- **An incoming-call card** appears over the current screen, top right. It shows:
  - the caller's number, 07700 900123
  - "matched to Mr R Patel"
  - the car and last visit
  - a "ringing" animation

  After about 3 seconds it shows "AI agent answering…" and the call is answered.
- **"Take the call myself"** shows the prototype's usual "Not part of this prototype" toast.

### The call view (main area)

- **Header:** a pulsing "LIVE" badge, the customer's name, number, a running timer, and "Handled by the AI agent".
- **Transcript:** agent lines on the left in brand tint, customer lines on the right.
  - Each line types out at about speaking speed. The pace is the builder's call, roughly 14 characters a second.
  - A "speaking" indicator shows who's talking in the pauses.
  - The transcript scrolls to follow the call.
- **Action notes:** each agent action adds a small dashed note in the transcript at that moment, e.g. "Agent looked up SC20 UYT · checked schedule, health checks and parts". The same thing happens in the copilot at the same time.
- **Footer:** **Pause**, **Restart**, and a "Simulated call" label.
- **The copilot opens automatically.** It shows "Agent is working in the copilot", and its message box is disabled with a note that the agent is using it.

### What the agent does, in order (SC20 UYT, a major service on Friday morning)

1. **Greeting and request.** The customer wants their E-Pace serviced, ideally Friday morning.
2. **Registration.** The agent asks, and the customer gives SC20 UYT.
   - **Action:** opens the booking form in the copilot and fills it in visibly, with the customer's name and phone from the call match, the registration, the car, Major service, Friday and Morning.
3. **Action:** "Next". The copilot shows the extras card.
4. **The agent offers the top three extras by name,** with their reasons in plain words, and says that everything's in stock or will arrive in time. The customer says yes to all three.
5. **Action:** the agent makes sure those three are ticked, then clicks "Find a technician".
6. **The agent reads back the slot:** the technician's first name, day and time, the total for the extras including VAT, and that parts will be held or ordered. It asks "Shall I go ahead?" The customer says yes.
7. **Action:** "Book and order".
   - The main area switches to the planner, and the new job is highlighted.
   - The copilot shows the confirmation with Undo.
   - **A call strip appears over the planner** (your decision), docked at the top or bottom of the main area. It shows the LIVE badge, the customer's name and timer, the line being said right now with the speaking indicator, and an "Open call" button that returns to the full call view.
8. **The agent confirms and says goodbye,** and the room follows it in the call strip. The call ends.
   - The strip shows "Call ended · 2:58" and stays for a few seconds, then folds away.
   - The copilot posts a short **call summary:** length, what was booked, extras, and parts held or ordered. It includes a "View transcript" link back to the full call view.

### Keeping what's said in line with what's shown

- **Agent lines are templates,** filled from the results of the actions just before them: extras names and reasons, technician, slot, total and parts. They're never hard-coded.
- **If the preferred result isn't available,** for example because the presenter already booked something that took John's Friday, the agent says whatever the copilot actually suggests. It still reads naturally, because the template wording works for any technician and time.

### The call event stream (the bit a voice provider would replace later)

- **Events:**
  - `ringing { caller: { number, name, reg } }`
  - `answered`
  - `line { speaker: 'agent' | 'customer', text }`
  - `action { tool, args, note }`
  - `ended { summary }`
- **The call view and the copilot subscribe to these events.** They don't know whether the source is a script or a live call.
- **Agent tools** are the actions a voice agent would call. Each runs the copilot's real booking function and returns its result, so later lines can use it:
  - `start_booking(details)`
  - `show_extras()`
  - `choose_extras(ids)`
  - `find_technician()`
  - `book(option)`
- **The script** is a list of steps (lines, waits and tool calls) played by a small player with **pause**, **restart** and a **speed** setting. The speed is for tests.

### Restart and undo

- **Restart** stops the call and rolls the diary and parts back to **exactly where they were when the call started**, using a snapshot taken at "ringing". It then clears the copilot conversation and starts again from ringing. Undo is one shared, last-in-first-out stack. Undoing "once" could remove the wrong change if the presenter did anything after the call, so a snapshot is the safe option. *(My call.)* Anything the presenter did after the call is thrown away by Restart, and that's what a restart should do.
- **After the call,** the presenter can still use **Undo** in the copilot as usual.
- **Mr Patel's customer record** (name, phone 07700 900123, and his link to SC20 UYT) is added to the sample data, so the call can be "matched". *(My call.)*

### Tests

- **Add to `tests/scenarios.html`:** play the scripted call at high speed in a fresh frame and check that:
  - the booking lands on the planner with the extras
  - the parts are held or ordered
  - every agent line that names a technician, time or price matches the booked result
- **Run it from a fresh load, and after "Fix my workbays".** The existing 55 checks must still pass.
- *(My call:)* the call test loads the full `index.html` in its frame, because it drives the copilot. The existing checks only load the logic files.

### Code touchpoints (expected)

- **New `js/call.js`:** the event stream, the script player, the agent tools, and the SC20 UYT script.
- **New `css/call.css`:** the incoming-call card, call view, transcript, action notes and the call strip over the planner, following the copilot's style.
- **`js/copilot.js`:**
  - the "Simulate incoming call" starter
  - letting the agent drive the booking functions and fill the form visibly
  - the locked message box while the agent works
  - the call summary message
- **`js/app.js`:**
  - a "call" view for the main area, and switching to the planner on booking
  - the `?call=1` link
  - the "Take the call myself" toast
- **`index.html`:** the new script and style tags.
- **`README.md`:** how to run the call demo, and a note that it's simulated.

Mockup: `.superpowers/brainstorm/call-layout.html` (not committed).

## Left to the builder

- **The exact script wording,** in a natural, friendly tone, as long as it follows the order above and the templates.
- **Timings and animations,** with a total call length of roughly 2 to 3 minutes.
- **The look of the incoming-call card and call view,** following the mockup and the copilot's existing style.
- **Small screens:** whether the call view works below 900 px or simply asks for a wider window.
