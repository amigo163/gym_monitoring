import { DAY_MS, addDays, daysBetween } from "../dates"
import type { ExerciseSession, Profile, TrackingKind } from "../types"
import {
  type Factor,
  type MainLift,
  type RecoveryInputs,
  WEEKLY_BW_CHANGE,
  clamp,
  combine,
  genericHeadroom,
  liftCeilingKg,
  mainLiftOf,
  recoveryFactors,
  scalingBodyweight,
} from "./physiology"
import { logFit, mean } from "./regression"
import { type VolumeLandmarks, volumeFactor } from "./volume"

const WEEK_MS = 7 * DAY_MS

/**
 * Baseline adaptation rate (per week) of the distance-to-ceiling model. At 50%
 * of potential this gives ≈1 % of potential per week — typical novice gains —
 * and naturally slows as the lifter nears their ceiling.
 */
export const BASE_RATE = 0.02

/** Pseudo-observations given to the physiological prior when blending with the data fit. */
const PRIOR_WEIGHT = 6

export interface ForecastPoint {
  date: Date
  expected: number
  lower: number
  upper: number
  trend: number
}

/** What a forecast is in: est. 1RM (kg), most reps in a set, or longest hold (seconds). */
export type ForecastMetric = "e1rm" | "reps" | "seconds"

const METRIC_OF: Record<TrackingKind, ForecastMetric | null> = { weight: "e1rm", reps: "reps", time: "seconds", distance: null }

const metricValue: Record<ForecastMetric, (s: ExerciseSession) => number> = {
  e1rm: (s) => s.bestE1rm,
  reps: (s) => s.bestReps,
  seconds: (s) => s.bestSeconds,
}

/** Sessions with a value to forecast from (at least two are needed for a forecast). */
export function forecastableSessions(sessions: ExerciseSession[]): ExerciseSession[] {
  const metric = sessions.length ? METRIC_OF[sessions[0].kind] : null
  return metric ? sessions.filter((s) => metricValue[metric](s) > 0) : []
}

/**
 * Rep maxes and hold times grow faster than 1RM: a few percent more strength buys many more
 * reps near the end of a set, so their headroom is wider.
 */
const ENDURANCE_HEADROOM = 2.5

/** The metric an exercise's forecast uses, or null for exercises that aren't forecast (distance). */
export const forecastMetricFor = (kind: TrackingKind) => METRIC_OF[kind]

export interface StrengthForecast {
  exercise: string
  metric: ForecastMetric
  mainLift: MainLift | null
  history: { date: Date; value: number; fitted: number }[]
  forecast: ForecastPoint[]
  /** Estimated potential at today's bodyweight/age, in the forecast's metric. */
  ceiling: number
  /** Where you are right now, after any detraining. */
  current: number
  /** Adaptation rate actually used for the forecast (per week). */
  rate: number
  priorRate: number
  dataRate: number | null
  /** Share of the ceiling already reached. */
  percentOfPotential: number
  /** Expected gain per week right now, in the forecast's metric. */
  weeklyGain: number
  factors: Factor[]
  detrainingPct: number
  residualSd: number
  sessions: number
}

export interface ForecastOptions {
  horizonWeeks: number
  /** Baseline health inputs (what the logged history was trained under). */
  profile: Profile
  /** What-if inputs for the future. Defaults to the profile itself. */
  scenario?: Partial<RecoveryInputs> & { bodyweightKg?: number }
  /** Average hard sets/week for the exercise's muscle group. */
  weeklySets?: number
  landmarks?: VolumeLandmarks
  /** Sessions per week in which this exercise was trained recently. */
  frequency?: number
  today?: Date
}

/** Training frequency: 2×/week per muscle beats 1× for equal volume (Schoenfeld 2016). */
export function frequencyFactor(perWeek: number): Factor {
  const value = perWeek >= 2 ? 1 : clamp(0.75 + 0.25 * (perWeek - 1), 0.6, 1)
  return {
    key: "frequency",
    label: "Frequency",
    value,
    detail: `${perWeek.toFixed(1)}×/week for this lift`,
  }
}

/**
 * Loss of strength during a layoff. Strength is well maintained for ~3 weeks
 * (Bosquet 2013) and then declines ~0.6 %/week, capped at 15 %.
 */
export function detrainingFraction(daysOff: number): number {
  const weeks = daysOff / 7
  return weeks <= 3 ? 0 : Math.min(0.15, (weeks - 3) * 0.006)
}

function fitRate(ts: number[], ys: number[], ceiling: number) {
  // For fixed C and k, the best a in y = C − a·e^(−k·t) has a closed form.
  let best = { k: BASE_RATE, a: ceiling - mean(ys), sse: Number.POSITIVE_INFINITY }
  for (let i = 0; i <= 120; i++) {
    const k = 0.001 * Math.pow(300, i / 120) // 0.001 … 0.3 per week, log-spaced
    let num = 0
    let den = 0
    for (let j = 0; j < ts.length; j++) {
      const u = Math.exp(-k * ts[j])
      num += (ceiling - ys[j]) * u
      den += u * u
    }
    const a = Math.max(num / den, 0)
    let sse = 0
    for (let j = 0; j < ts.length; j++) sse += (ys[j] - (ceiling - a * Math.exp(-k * ts[j]))) ** 2
    if (sse < best.sse) best = { k, a, sse }
  }
  return best
}

/**
 * Physiology-informed strength forecast.
 *
 * Strength approaches a personal ceiling exponentially:
 *   e1RM(t) = C − (C − S₀)·e^(−k·t)
 * - C comes from bodyweight-scaled strength standards (for the main lifts) or
 *   from training age for everything else, adjusted for age and lean mass.
 * - k is fitted to your history and blended with a prior built from sleep,
 *   stress, energy balance, protein, age, training frequency and weekly volume.
 * - The future uses the scenario's recovery inputs, so changing sleep or diet
 *   changes the forecast.
 */
export function forecastStrength(sessions: ExerciseSession[], opts: ForecastOptions): StrengthForecast | null {
  const metric = sessions.length ? METRIC_OF[sessions[0].kind] : null
  if (!metric) return null
  const points = forecastableSessions(sessions)
  if (points.length < 2) return null
  const { profile, horizonWeeks } = opts
  const today = opts.today ?? new Date()
  const exercise = points[0].exercise
  const isLoad = metric === "e1rm"
  const mainLift = isLoad ? mainLiftOf(exercise) : null

  const t0 = points[0].date.getTime()
  const ts = points.map((p) => (p.date.getTime() - t0) / WEEK_MS)
  const ys = points.map((p) => metricValue[metric](p))
  const best = Math.max(...ys)

  const spanYears = ts.at(-1)! / 52
  const trainingYears = profile.priorTrainingYears + spanYears
  const bw = scalingBodyweight(profile)
  const headroom = genericHeadroom(trainingYears, profile.age) * (isLoad ? 1 : ENDURANCE_HEADROOM)
  let ceiling = mainLift ? liftCeilingKg(profile.sex, mainLift, bw, profile.age) : best * (1 + headroom)
  ceiling = Math.max(ceiling, best * 1.05)

  // Prior rate from physiology
  const recent = points.filter((p) => today.getTime() - p.date.getTime() < 8 * WEEK_MS)
  const window = recent.length >= 2 ? recent : points.slice(-4)
  const windowWeeks = Math.max(1, (window.at(-1)!.date.getTime() - window[0].date.getTime()) / WEEK_MS + 1)
  const frequency = opts.frequency ?? window.length / windowWeeks
  const baseFactors = [
    ...recoveryFactors(profile),
    frequencyFactor(frequency),
    ...(opts.weeklySets != null && opts.landmarks ? [volumeFactor(opts.weeklySets, opts.landmarks)] : []),
  ]
  const baseMultiplier = combine(baseFactors)
  const priorRate = BASE_RATE * baseMultiplier

  // Data rate, blended with the prior in log space
  const n = points.length
  const fit = n >= 3 ? fitRate(ts, ys, ceiling) : null
  const dataRate = fit?.k ?? null
  const rate = dataRate
    ? Math.exp((n * Math.log(dataRate) + PRIOR_WEIGHT * Math.log(priorRate)) / (n + PRIOR_WEIGHT))
    : priorRate

  // Refit the intercept with the blended rate so history and forecast agree.
  let numA = 0
  let denA = 0
  for (let j = 0; j < n; j++) {
    const u = Math.exp(-rate * ts[j])
    numA += (ceiling - ys[j]) * u
    denA += u * u
  }
  const a = Math.max(numA / denA, 0)
  const model = (t: number) => ceiling - a * Math.exp(-rate * t)
  const residuals = ys.map((y, j) => y - model(ts[j]))
  const residualSd = Math.max(Math.sqrt(mean(residuals.map((r) => r * r))), best * 0.02)

  // Anchor the forecast between the model and your latest actual sessions.
  const lastT = ts.at(-1)!
  const recentActual = mean(ys.slice(-3))
  let current = 0.5 * model(lastT) + 0.5 * recentActual
  const daysOff = Math.max(0, daysBetween(points.at(-1)!.date, today))
  const detrainingPct = detrainingFraction(daysOff)
  current *= 1 - detrainingPct
  const start = daysOff > 7 ? today : points.at(-1)!.date

  // Scenario
  const scenarioInputs: RecoveryInputs = {
    sleepHours: opts.scenario?.sleepHours ?? profile.sleepHours,
    stress: opts.scenario?.stress ?? profile.stress,
    nutrition: opts.scenario?.nutrition ?? profile.nutrition,
    proteinGPerKg: opts.scenario?.proteinGPerKg ?? profile.proteinGPerKg,
    age: opts.scenario?.age ?? profile.age,
  }
  const scenarioFactors = [
    ...recoveryFactors(scenarioInputs),
    ...baseFactors.filter((f) => f.key === "frequency" || f.key === "volume"),
  ]
  const futureRate = rate * (combine(scenarioFactors) / baseMultiplier)
  const bwWeekly = WEEKLY_BW_CHANGE[scenarioInputs.nutrition]

  const trend = logFit(ts, ys)
  const forecast: ForecastPoint[] = []
  const steps = Math.max(1, Math.round(horizonWeeks))
  for (let h = 0; h <= steps; h++) {
    // A load ceiling tracks projected bodyweight (strength ∝ mass^⅔); reps and holds don't get easier with mass.
    const bwRatio = isLoad ? Math.max(0.5, 1 + bwWeekly * h) : 1
    const c = Math.max(ceiling * Math.pow(bwRatio, 2 / 3), current)
    const expected = c - (c - current) * Math.exp(-futureRate * h)
    const sd = residualSd * Math.sqrt(1 + h / 6)
    const tFuture = (start.getTime() - t0) / WEEK_MS + h
    forecast.push({
      date: addDays(start, h * 7),
      expected,
      lower: Math.max(0, expected - 1.28 * sd),
      upper: expected + 1.28 * sd,
      trend: trend.predict(tFuture),
    })
  }

  return {
    exercise,
    metric,
    mainLift,
    history: points.map((p, j) => ({ date: p.date, value: ys[j], fitted: model(ts[j]) })),
    forecast,
    ceiling,
    current,
    rate: futureRate,
    priorRate,
    dataRate,
    percentOfPotential: current / ceiling,
    weeklyGain: futureRate * (ceiling - current),
    factors: scenarioFactors,
    detrainingPct,
    residualSd,
    sessions: n,
  }
}

/** Weeks until the forecast reaches `target` (in its metric), or null if it is beyond the ceiling. */
export function weeksToTarget(f: StrengthForecast, target: number): number | null {
  if (target <= f.current) return 0
  if (target >= f.ceiling * 0.999) return null
  return -Math.log((f.ceiling - target) / (f.ceiling - f.current)) / f.rate
}

export function dateAfterWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * WEEK_MS)
}
