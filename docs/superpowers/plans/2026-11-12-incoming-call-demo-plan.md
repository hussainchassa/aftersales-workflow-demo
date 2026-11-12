# Showing an AI agent handling a booking call: build plan

Design: [2026-11-12-incoming-call-demo-design.md](../specs/2026-11-12-incoming-call-demo-design.md)
Branch: `feature/incoming-call-demo`

As before, there's no build step. Checks are the scenario test page (step 8) and a walkthrough in the app (step 9). Each step should leave the app working.

## 1. Mr Patel's customer record

- Add a small customer list to `js/vehicles.js`: Mr R Patel, 07700 900123, linked to SC20 UYT.
- Add `lookupCaller(number)`, which returns the customer and car, or `null`.
- **Done when:** `Vehicles.lookupCaller('07700 900123')` returns Mr Patel with SC20 UYT.

## 2. The call event stream: `js/call.js` (new)

- **A tiny event hub:** `Call.on(type, fn)` and `Call.emit(type, data)`. The event types are `ringing`, `answered`, `line`, `action`, `ended`, plus `reset` for restart.
- **Call state** that the screens read: `live`, the caller, the transcript so far, the start time, and the snapshot taken at ringing.
- **Done when:** emitting events by hand in the console updates the call state.

## 3. The agent tools

These are thin wrappers in `js/call.js` over the copilot's booking functions. Each returns its result for later lines to use:
- **`start_booking(details)`:** opens the booking form, then fills the fields one by one with short pauses, so the audience sees them typed.
- **`show_extras()`:** runs "Next" and returns the extras list.
- **`choose_extras(ids)`:** makes the ticks match the list.
- **`find_technician()`:** returns the main suggestion.
- **`book(option)`:** returns the booking and its parts changes.

`js/copilot.js` needs small additions so the booking functions can be called and awaited from outside (they already mostly are). It also gains an "agent is using the copilot" lock, which disables the message box and the card buttons and shows a marker.

**Done when:** calling the tools in order from the console books SC20 UYT through the real copilot.

## 4. The script and the player

- **The SC20 UYT script:** a list of steps (`line`, `pause`, `tool`), with agent lines as templates filled from earlier tool results, following the order in the design.
- **The player** emits events in real time:
  - lines take time in proportion to their length
  - there are short gaps between turns
  - tool steps wait for their tool to finish
- **`pause()`, `resume()`, `restart()` and a `speed` setting** for tests.
- **Restart** restores the diary and parts from the ringing snapshot, clears the copilot conversation and starts again.
- **Done when:** the call plays to the end at high speed in the console, and its lines name the booked technician, time and total.

## 5. Screens: incoming card, call view, call strip

- **The incoming-call card** (top right, over any screen): number, match and car. It rings, then shows "AI agent answering…". "Take the call myself" shows the existing "Not part of this prototype" toast.
- **The call view in the main area,** shown when the call is answered:
  - a header with LIVE, the name, number, timer and "Handled by the AI agent"
  - the transcript, with lines that type out, a speaking indicator and dashed action notes
  - a footer with Pause, Restart and "Simulated call"
- **The call strip:** when the `book` tool finishes, the app shows the planner, and the strip docks over the main area. It shows LIVE, the name, timer and the current line, and has an "Open call" button. On `ended` it shows "Call ended · m:ss" and folds away after a few seconds.
- **`js/app.js`:**
  - a `call` view
  - the planner switch on booking
  - the strip
  - `?call=1`
- **`css/call.css`:** follows the mockup and the copilot's styles.
- **Done when:** the whole call plays in the browser from the starter button.

## 6. Copilot details

- **The "Simulate incoming call" starter** goes first in the opening list, and the existing starters stay below it.
- **The call summary message** at the end: length, the booking, extras, and parts held or ordered, with a "View transcript" link.
- **Wording when the agent books:** the confirmation says the agent booked it on the call, not "Approved by you".

## 7. README

Add how to run the call demo (the starter or `?call=1`), that it's simulated and has no sound, and the new files.

## 8. Tests

Add a call scenario to `tests/scenarios.html`. It loads the full `index.html` in the frame, plays the call at high speed, and checks:
- the booking lands with the extras
- the parts are held or ordered
- the agent's lines match the booked technician, time and total

Run it from a fresh load and after "Fix my workbays". The existing 55 checks must still pass.

## 9. Walkthrough in the app

Check the following, with no console errors:
- the full call in real time, from the starter and from `?call=1`
- pause, then resume
- restart after the booking, which puts the diary back
- manual booking still works afterwards
- the dashboard figures are unchanged
