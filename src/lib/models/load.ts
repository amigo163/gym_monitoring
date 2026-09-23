import { addDays, dayKey, startOfDay } from "../dates"
import type { Profile, SetRow } from "../types"
import { clamp } from "./physiology"

/** Seconds of a hold that count like one rep (≈ the time under tension of a controlled rep). */
const SECONDS_PER_REP = 3

/**
 * Internal training load of one set in arbitrary units: reps weighted by
 * relative intensity (load ÷ best e1RM so far for that exercise). Proximity to
 * failure (RPE) scales it when logged. Cardio uses minutes; timed holds (planks)
 * count one rep per few seconds; stretching and mobility ("Other") don't count.
 */
export function dailyLoads(rows: SetRow[]): Map<string, number> {
  const bestSoFar = new Map<string, number>()
  const loads = new Map<string, number>()
  for (const r of rows) {
    if (r.isWarmup) continue
    let impulse: number
    if (r.muscle === "Cardio") {
      impulse = (r.seconds ?? 0) / 60
    } else if (r.reps <= 0) {
      impulse = r.muscle === "Other" ? 0 : ((r.seconds ?? 0) / SECONDS_PER_REP) * 0.5
    } else {
      const best = Math.max(bestSoFar.get(r.exercise) ?? 0, r.e1rm)
      if (r.e1rm > 0) bestSoFar.set(r.exercise, best)
      const intensity = best > 0 && r.effectiveLoad > 0 ? r.effectiveLoad / best : 0.5
      const effort = r.rpe != null ? clamp(r.rpe / 8, 0.6, 1.25) : 1
      impulse = r.reps * intensity * effort
    }
    const k = dayKey(r.date)
    loads.set(k, (loads.get(k) ?? 0) + impulse)
  }
  return loads
}

export interface FitnessFatiguePoint {
  date: Date
  load: number
  fitness: number
  fatigue: number
  form: number
  projected: boolean
}

export type LoadScenario = "maintain" | "deload" | "rest"

const FITNESS_TAU = 42
const FATIGUE_TAU = 7

/**
 * Banister impulse–response model in its exponentially weighted form
 * (fitness τ = 42 d, fatigue τ = 7 d; form = fitness − fatigue).
 * Continues `projectDays` into the future under a load scenario.
 */
export function fitnessFatigue(
  loads: Map<string, number>,
  projectDays = 28,
  scenario: LoadScenario = "maintain",
  today = new Date(),
): FitnessFatiguePoint[] {
  const keys = [...loads.keys()].sort()
  if (!keys.length) return []
  const [y, m, d] = keys[0].split("-").map(Number)
  const first = new Date(y, m - 1, d)
  const lastLogged = startOfDay(today)
  const out: FitnessFatiguePoint[] = []
  const a1 = 1 - Math.exp(-1 / FITNESS_TAU)
  const a2 = 1 - Math.exp(-1 / FATIGUE_TAU)
  let fitness = 0
  let fatigue = 0

  // Typical weekly pattern from the last 4 weeks drives the projection.
  const recentDays: number[] = []
  for (let i = 27; i >= 0; i--) recentDays.push(loads.get(dayKey(addDays(lastLogged, -i))) ?? 0)
  const scale = scenario === "maintain" ? 1 : scenario === "deload" ? 0.5 : 0

  const end = addDays(lastLogged, projectDays)
  let projIdx = 0
  for (let day = first; day <= end; day = addDays(day, 1)) {
    const projected = day > lastLogged
    const load = projected ? recentDays[projIdx++ % 28] * scale : (loads.get(dayKey(day)) ?? 0)
    fitness += a1 * (load - fitness)
    fatigue += a2 * (load - fatigue)
    out.push({ date: day, load, fitness, fatigue, form: fitness - fatigue, projected })
  }
  return out
}

export interface AcwrPoint {
  date: Date
  acute: number
  chronic: number
  ratio: number | null
}

/** Acute:chronic workload ratio (7-day vs 28-day rolling average load). */
export function acuteChronic(loads: Map<string, number>, today = new Date()): AcwrPoint[] {
  const keys = [...loads.keys()].sort()
  if (!keys.length) return []
  const [y, m, d] = keys[0].split("-").map(Number)
  const first = new Date(y, m - 1, d)
  const end = startOfDay(today)
  const series: number[] = []
  const out: AcwrPoint[] = []
  for (let day = first; day <= end; day = addDays(day, 1)) {
    series.push(loads.get(dayKey(day)) ?? 0)
    const n = series.length
    const acute = series.slice(Math.max(0, n - 7)).reduce((a, b) => a + b, 0) / 7
    const chronic = series.slice(Math.max(0, n - 28)).reduce((a, b) => a + b, 0) / 28
    out.push({ date: day, acute, chronic, ratio: n >= 28 && chronic > 0 ? acute / chronic : null })
  }
  return out
}

export function acwrZone(ratio: number | null): { label: string; tone: "good" | "warning" | "critical" | "neutral" } {
  if (ratio == null) return { label: "Not enough data", tone: "neutral" }
  if (ratio < 0.8) return { label: "Under-training", tone: "warning" }
  if (ratio <= 1.3) return { label: "Sweet spot", tone: "good" }
  if (ratio <= 1.5) return { label: "Caution", tone: "warning" }
  return { label: "High injury risk", tone: "critical" }
}

export interface ReadinessComponent {
  label: string
  score: number
  weight: number
  detail: string
}

/**
 * Readiness 0–100 from training form plus health markers. Components without
 * data are dropped and the remaining weights renormalised.
 */
export function readiness(ff: FitnessFatiguePoint | undefined, p: Profile) {
  const parts: ReadinessComponent[] = []
  if (ff && ff.fitness > 0) {
    const tsb = ff.form / ff.fitness // −∞ … 1
    parts.push({
      label: "Training form",
      score: clamp(((tsb + 0.3) / 0.5) * 100, 0, 100),
      weight: 0.45,
      detail: tsb >= 0 ? "Fresh — fatigue has dissipated" : "Carrying fatigue from recent training",
    })
  }
  parts.push({
    label: "Sleep",
    score: clamp(((p.sleepHours - 5) / 3) * 100, 0, 100),
    weight: 0.2,
    detail: `${p.sleepHours} h average`,
  })
  parts.push({
    label: "Stress",
    score: ((5 - p.stress) / 4) * 100,
    weight: 0.1,
    detail: `${p.stress}/5 perceived`,
  })
  if (p.restingHr != null && p.restingHrBaseline != null) {
    const delta = p.restingHr - p.restingHrBaseline
    parts.push({
      label: "Resting HR",
      score: clamp(100 - (delta / 8) * 100, 0, 100),
      weight: 0.125,
      detail: `${delta >= 0 ? "+" : ""}${delta} bpm vs baseline`,
    })
  }
  if (p.hrvMs != null && p.hrvBaselineMs != null && p.hrvBaselineMs > 0) {
    const ratio = p.hrvMs / p.hrvBaselineMs
    parts.push({
      label: "HRV",
      score: clamp(((ratio - 0.8) / 0.2) * 100, 0, 100),
      weight: 0.125,
      detail: `${Math.round(ratio * 100)}% of baseline`,
    })
  }
  const total = parts.reduce((a, c) => a + c.weight, 0)
  const score = parts.reduce((a, c) => a + c.score * c.weight, 0) / total
  return { score, parts }
}
