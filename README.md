# Aftersales Workflow Demo

A demo project showcasing an aftersales workflow for automotive retail — covering the customer journey after a vehicle purchase, such as service bookings, maintenance reminders, and follow-up communication.

## Status

🚧 Work in progress — initial setup.

## Getting Started

Clone the repository:

```bash
git clone https://github.com/hussainchassa/aftersales-workflow-demo.git
```

Open `index.html` in a browser. There is nothing to install or build, and no API key is needed.

## What's in the demo

The prototype opens on an **Applications** screen, like the Pinewood DMS. Two of the tiles open, and each app is separate, with its own menu and its own AI Assistance conversation. The Pinewood logo in the top bar goes back to Applications.

- **BI: agentic reporting.** BI opens with AI Assistance ready. Ask "How is my aftersales performing?" and it builds a dashboard in the main area, which you can refine by chatting ("Just Branch 2", "last 30 days"). Each report is listed under Reports. BI only reports. It doesn't change or link to the diary.
- **Service: the technician planner.** A rebuild of the Pinewood workshop planner, with the date range, scale slider, filters and unallocated jobs working. Its AI Assistance books appointments, offers extras, plans improvements ("Fix my workbays and technicians"), answers "What's coming up in the planner?" and runs the simulated AI agent call.

A question for the other app gets a short reply saying where to ask it.

### In Service

- **Booking with technician matching:** "Book an appointment" in the copilot opens a booking form. It suggests a time and technician from each technician's job history, explains why, and offers alternatives. Booking puts the job on the planner.
- **Extras on the booking call:** after the booking form, "Next" looks the car up and lists extra work worth offering:
  - what the service schedule says is due or coming up, from the estimated mileage
  - what the customer turned down on a health check in the last 12 months

  Only extras whose parts can be in Branch 1 by the end of the working day before the appointment are offered, whether from the shelf, a transfer from another branch, or the supplier. The top three are ticked, and the job gets longer to fit them. One "Book and order" confirmation holds the parts and places any transfers or orders, and undo reverses the lot.
- **An AI agent taking a booking call (simulated):** "Simulate incoming call" in the copilot, or `index.html?call=1`, rings in a call from Mr Patel (SC20 UYT). The AI agent answers, and a live transcript plays in the main area while the agent works the real booking flow in the copilot, beside it:
  - it fills in the booking
  - it offers the extras, which the customer accepts
  - it finds a technician and books it once the customer says yes

  Each action is marked in the transcript as it happens. When the job is booked, the planner shows it, and a strip follows the rest of the call. The copilot then posts a call summary.

  Pause and Restart sit under the transcript. Restart puts the diary and parts back as they were when the phone rang. The call is scripted and silent, with about three minutes of real-time conversation; in a live demo, a voice provider would drive the same screens.

In the chat, Enter sends and Shift+Enter starts a new line. Up and down step through earlier questions, and Esc closes the panel. In the booking form, Enter moves to the next step.

Presenter links:
- `index.html?app=service` or `index.html?app=bi` opens an app directly.
- `index.html?ask=How%20is%20my%20aftersales%20performing%3F` opens BI on that answer.
- `index.html?call=1` opens Service on the simulated call.

### Booking scenarios

Each job type is set up to show something different. Book "As soon as possible" today unless stated.

| Job type | What it shows |
| --- | --- |
| Brakes | One clear best technician, free today |
| Diesel | The best diesel technician is away until Friday, so the next best is suggested and Friday is offered |
| Diagnostics (tomorrow, morning) | The fastest technician has the most comebacks. The best is fully booked, so a close second who's less busy gets it |
| Major service | Four equals, so work is spread: book twice and two different people get it |
| Tyres | A newer technician gets the job, with a stronger one named as backup |

### Extras scenarios

Type the registration in the booking form, then click "Next".

| Registration | Job and day | What it shows |
| --- | --- | --- |
| SC20 UYT | Major service, Friday | The full story: brake fluid and front pads on the shelf, the battery by transfer from Branch 2, coolant from the supplier, rear tyres greyed out (can't arrive in time), and the air filter included in the service |
| YF70 KTO | Tyres, today | Everything on the shelf, so it can all be done today |
| GN19 HVD, then WR69 NMC | Any job, Friday | Both want Branch 1's only set of rear discs. Book the first, and the second shows them greyed out |
| KY72 BLN | Any job | Nothing due or outstanding |
| Anything else, e.g. AB12 CDE | Any job | No history, so it goes straight to finding a technician |

Open `tests/scenarios.html` to check the matching and extras scenarios still behave after other copilot actions. It also plays the AI agent call at high speed and checks the booking matches what the agent said. It should say "57 of 57 passed".

### Questions to try

In BI:
- How is my aftersales performing?
- Why is efficiency down at Branch 2?
- Which technicians are under-utilised?
- Compare my branches
- Where am I losing money?
- Follow-ups: "Just Branch 2", "last 30 days", "Break this down by technician", "Compare with last year", "add vhc", "hide scorecard", "reset filters"

In Service:
- Simulate incoming call
- Book an appointment
- What's coming up in the planner?
- Fix my workbays and technicians (then "do it" to approve, "undo" to reverse)

## How it works

| File | Job |
| --- | --- |
| `js/aftersales-data.js` | Generates seeded sample job cards and calculates every metric |
| `js/intent.js` | Turns a question into a state object, then a list of widgets |
| `js/dashboard.js` | Renders the widgets and writes the narrative from the data |
| `js/optimiser.js` | Plans diary changes, checks them for clashes and shows them for approval |
| `js/matching.js` | Scores technicians per job type from their history and suggests who and when for a new appointment |
| `js/parts.js` | Parts stock by branch, holds, transfers and supplier orders, and whether a part can arrive in time |
| `js/vehicles.js` | Sample cars with mileage and health-check history, the service schedule, and what each job already covers |
| `js/upsell.js` | Works out the extras worth offering for a car and appointment day, in the order to raise them |
| `js/call.js` | The simulated call: call events, the agent's tools over the copilot's booking flow, the script and its player. A voice provider adapter would replace the script and emit the same events |
| `js/call-view.js` | The incoming-call card, the call transcript view and the call strip over the planner |
| `tests/scenarios.html` | Runs the matching, extras and AI agent call scenarios after different demo orders |
| `js/charts.js` | SVG and HTML charts, with tooltips |
| `js/copilot.js` | The chat panel, which updates in place so focus and animations carry through |
| `css/chat.css` | The chat panel's styling and motion |
| `js/workshop-planner.js` | The planner screen |
| `js/app.js` | Navigation and view switching |

Question parsing is rule-based, so unusual phrasing can fall back to a "can't answer that yet" reply. To use a real model, replace the body of `plan()` in `js/copilot.js` with a call that returns the same object as `Intent.interpret`. To use real data, replace `generate()` in `js/aftersales-data.js`.

The diary only changes when someone approves a plan, and the whole plan can be undone. Changes last until the page is reloaded.

All aftersales figures, targets and the technicians at Branches 2 and 3 are invented sample data. So is the technician job history used for matching, and the three Thursday bookings added to the planner for the diagnostics scenario. The cars, service schedule, parts, stock, lead times and prices used for extras are invented too. The schedule is sample guidance, not real manufacturer data. Extras prices include VAT; dashboard figures don't. Mr Patel and the call are invented as well. Service uses a fixed Branch 1 labour rate (in `js/optimiser.js`), so it never reads BI's figures.

Chad made this edit
