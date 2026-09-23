# GymViz

Local analytics and predictions for [Strong](https://www.strong.app/) workout exports. A lightweight Vite + React app built with
[shadcn/ui](https://ui.shadcn.com) components and [Bklit](https://bklit.com) charts. It runs entirely in your browser: there is no
backend and your data never leaves your machine.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Export your data from Strong (**Settings → Export Strong Data**), then drop the CSV on the page. Or click **Try the sample data**.
Workouts and your profile are kept in a local IndexedDB database in your browser (see [Local storage](#local-storage)).

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Type-check and build a static site into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm test` | Run the unit tests (parsing, analysis and every model) |
| `pnpm lint` | Lint with oxlint |

## Pages

**Analytics**: everything the previous Streamlit app did, plus a few additions.

- **Overview**: key stats, a training calendar, weekly volume and sets, muscle-group split, most-trained exercises and recent PRs.
- **Exercises**: per-exercise progression (est. 1RM / top weight / volume), plateau detection shaded on the chart, a session log,
  the most-improved ranking and exercise variety per month.
- **Muscle groups**: a balance radar (whole range vs. last 4 weeks), monthly volume by group, and weekly sets against your
  personal volume landmarks.
- **Workout patterns**: frequency, duration, training density, day of week, time of day, rest days and routines.
- **Records**: current bests for every exercise, PR frequency and a searchable PR log (est. 1RM, weight, volume).

A global 3M / 6M / 1Y / All range filters the analytics pages. The models always use your full history.

**Modelling**

- **Body & health**: sex, age, height, bodyweight (with a dated log), body fat, prior training experience, sleep, stress,
  energy balance, protein, resting HR and HRV. It also shows BMI, lean mass, FFMI and how each input affects adaptation.
- **Predictions**, in four tabs:
  - **Strength**: an est. 1RM forecast with an 80% range, what-if sliders (sleep, stress, protein, energy balance), a
    goal-date calculator, forecast rep maxes and a breakdown of the factors driving the forecast.
  - **Volume**: personal MEV / MAV / MRV per muscle group, a mesocycle plan (progressive sets with deloads) and projected
    weekly tonnage.
  - **Fatigue & readiness**: the Banister fitness–fatigue model with 4-week projections (keep going / deload / rest), the
    acute:chronic workload ratio with risk zones, and a readiness score.
  - **Standards**: bodyweight-scaled strength standards for squat, bench, deadlift and OHP, a projected date for reaching
    the next level, and your DOTS score.

## The models

All models live in `src/lib/models/` as plain TypeScript with unit tests.

### Strength (`strength.ts`)

Strength approaches a personal ceiling with diminishing returns:

```
e1RM(t) = C − (C − S₀)·e^(−k·t)
```

- **C (potential)**: for the main barbell lifts, bodyweight-scaled strength standards (strength ∝ mass^⅔) between the
  "advanced" and "elite" levels. It uses lean mass when body fat is known and is adjusted for age. Other exercises get
  headroom above their current best that shrinks with training age.
- **k (rate)**: fitted to your sessions and blended in log space with a physiological prior (6 pseudo-observations). The
  prior is a base rate multiplied by factors for:
  - sleep (Knowles 2018)
  - stress (Bartholomew 2008)
  - energy balance
  - protein (plateau at 1.6 g/kg, Morton 2018)
  - age (after 35)
  - weekly frequency for the lift (Schoenfeld 2016)
  - weekly sets for the muscle group relative to its landmarks
- **Scenario**: the what-if inputs rescale k for the forecast period. Energy balance also projects a bodyweight change,
  which moves C.
- **Detraining**: after 3+ weeks off, strength declines ≈0.6 %/week, capped at 15% (Bosquet 2013).
- **Uncertainty**: an 80% band from the residual spread, widening with the horizon.

Estimated 1RM uses Brzycki up to 10 reps and Epley up to 20. When RPE is logged, reps in reserve are added. Bodyweight
movements (dips, pull-ups, push-ups…) add your bodyweight share on the date of the set, and assisted variations subtract
the assistance.

### Volume (`volume.ts`)

Renaissance Periodization-style landmarks per muscle group. MRV scales with recovery capacity (sleep, stress, diet,
protein, age), and MEV rises with training age. The plan adds 1–2 sets per week up to MRV, deloads every 5th week, and
restarts each block slightly higher. Projected tonnage = planned sets × typical reps × working load, with the load growing
at your forecast strength rate.

### Fatigue & readiness (`load.ts`)

- **Training load**: each set counts reps × relative intensity (load ÷ best e1RM so far), scaled by RPE when logged.
- **Banister model**: fitness (τ = 42 d) and fatigue (τ = 7 d); form = fitness − fatigue.
- **ACWR**: 7-day vs 28-day load. 0.8–1.3 is the sweet spot; above 1.5 is high risk.
- **Readiness**: form, sleep, stress, and resting HR / HRV relative to your baselines.

These are evidence-informed heuristics for planning, not medical advice.

## Local storage

Everything lives in an IndexedDB database called `gymviz` (`src/lib/db.ts`). Nothing is uploaded.

- **Workouts** (`sets`): one record per set, keyed by workout start time, workout name, exercise, set order and
  occurrence. Keys come from the data itself, so importing the same export again changes nothing.
- **Imports**: Strong always exports your full history, so each new export is merged in. Workouts in the export replace
  their stored copy (edits and deleted sets are picked up). Stored workouts that fall inside the export's date range but
  are missing from it were deleted or renamed in Strong, so they are dropped. Older workouts outside that range are kept.
  Each import is logged with how many workouts were new, updated or removed.
- **Profile** (`profile`, `profileHistory`): the current Body & health inputs, plus one snapshot per day, so you can
  see how sleep, stress, nutrition and so on changed over time. The bodyweight log keeps its own dated history.

Data from older versions that stored the CSV and profile in `localStorage` is moved into the database on first load.

## Project layout

```
src/
├── lib/                  # framework-free logic (unit tested)
│   ├── strong.ts         # Strong CSV parser (; or , delimited, kg or lbs)
│   ├── db.ts             # IndexedDB storage and idempotent import merging
│   ├── analysis.ts       # workouts, sessions, PRs, plateaus, patterns
│   ├── muscles.ts        # exercise → muscle group mapping
│   ├── one-rep-max.ts
│   └── models/           # physiology, strength, volume, load
├── state/store.tsx       # data + profile context, backed by the local database
├── pages/                # one component per page
└── components/
    ├── charts/           # Bklit chart sources (installed via the shadcn registry)
    ├── ui/               # shadcn/ui components
    └── viz.tsx, common.tsx
```

Add more Bklit charts with `pnpm dlx shadcn@latest add @bklit/<chart>`. The registry is already configured in
`components.json`.
