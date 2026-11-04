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

- **Technician planner:** a rebuild of the Pinewood workshop planner, with the date range, scale slider, filters and unallocated jobs working.
- **AI Assistance:** the copilot panel, opened from the bottom of the left navigation. Ask "How is my aftersales performing?" and it builds a dashboard in the main area.

- **Booking with technician matching:** "Book an appointment" in the copilot opens a booking form. It suggests a time and technician from each technician's job history, explains why, and offers alternatives. Booking puts the job on the planner.

To open straight on an answer when presenting, use `index.html?ask=How%20is%20my%20aftersales%20performing%3F`.

### Booking scenarios

Each job type is set up to show something different. Book "As soon as possible" today unless stated.

| Job type | What it shows |
| --- | --- |
| Brakes | One clear best technician, free today |
| Diesel | The best diesel technician is away until Friday, so the next best is suggested and Friday is offered |
| Diagnostics (tomorrow, morning) | The fastest technician has the most comebacks. The best is fully booked, so a close second who's less busy gets it |
| Major service | Four equals, so work is spread: book twice and two different people get it |
| Tyres | A newer technician gets the job, with a stronger one named as backup |

Open `tests/scenarios.html` to check all five still behave after other copilot actions. It should say "30 of 30 passed".

### Questions to try

- Book an appointment
- How is my aftersales performing?
- Why is efficiency down at Branch 2?
- Which technicians are under-utilised?
- Compare my branches
- What's coming up in the planner?
- Where am I losing money?
- Fix my workbays and technicians (then "do it" to approve, "undo" to reverse)
- Follow-ups: "Just Branch 2", "last 30 days", "Break this down by technician", "Compare with last year", "add vhc", "hide scorecard", "reset filters"

## How it works

| File | Job |
| --- | --- |
| `js/aftersales-data.js` | Generates seeded sample job cards and calculates every metric |
| `js/intent.js` | Turns a question into a state object, then a list of widgets |
| `js/dashboard.js` | Renders the widgets and writes the narrative from the data |
| `js/optimiser.js` | Plans diary changes, checks them for clashes and shows them for approval |
| `js/matching.js` | Scores technicians per job type from their history and suggests who and when for a new appointment |
| `tests/scenarios.html` | Runs the five booking scenarios after different demo orders |
| `js/charts.js` | SVG and HTML charts, with tooltips |
| `js/copilot.js` | The chat panel |
| `js/workshop-planner.js` | The planner screen |
| `js/app.js` | Navigation and view switching |

Question parsing is rule-based, so unusual phrasing can fall back to a "can't answer that yet" reply. To use a real model, replace the body of `plan()` in `js/copilot.js` with a call that returns the same object as `Intent.interpret`. To use real data, replace `generate()` in `js/aftersales-data.js`.

The diary only changes when someone approves a plan, and the whole plan can be undone. Changes last until the page is reloaded.

All aftersales figures, targets and the technicians at Branches 2 and 3 are invented sample data. So is the technician job history used for matching, and the three Thursday bookings added to the planner for the diagnostics scenario.

Chad made this edit
