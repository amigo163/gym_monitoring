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
import { mean } from "./regression"
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

/** A gap between sessions longer than this is a layoff: strength holds for ~3 weeks (Bosquet 2013). */
export const LAYOFF_WEEKS = 3
/** Layoffs longer than this are a fresh start: muscle memory isn't counted on to bring back the old level. */
const MAX_COMEBACK_GAP_WEEKS = 26
/** A comeback ends at the first session back within this share of the pre-layoff level… */
const COMEBACK_DONE = 0.97
/** …or this many weeks after returning, whichever comes first. */
const COMEBACK_MAX_WEEKS = 8
/**
 * Weekly rate (share of the remaining deficit) at which lost strength comes back, before the recovery
 * factors. Retraining is much faster than first-time gains (Staron 1991, Ogasawara 2013): at typical
 * recovery it's ≈ half the deficit in 2 weeks.
 */
export const REGAIN_RATE = 0.6

/** Week-to-week drift of true strength, as a share of your level, in the Kalman filter. */
const LEVEL_DRIFT = 0.015
/** Session bests below your level are often light days or bad days, so they count this much less. */
const LIGHT_DAY_NOISE = 4

/** A session this many weeks older than your latest counts half as much in the fit. */
export const HALF_LIFE_WEEKS = 12
/** The half-life stretches until at least this many sessions' worth of weight is left (rarely trained exercises). */
const MIN_EFFECTIVE_SESSIONS = 6

/**
 * Recency weights 0.5^(age / half-life), with age in weeks before the latest session. Old
 * sessions still shape the long-term curve but barely move where you are now.
 */
export function recencyWeights(ts: number[], halfLifeWeeks = HALF_LIFE_WEEKS): { weights: number[]; halfLifeWeeks: number } {
  const last = ts.at(-1) ?? 0
  const needed = Math.min(MIN_EFFECTIVE_SESSIONS, 0.8 * ts.length)
  let halfLife = halfLifeWeeks
  let weights = ts.map((t) => 0.5 ** ((last - t) / halfLife))
  while (weights.reduce((a, b) => a + b, 0) < needed && halfLife < 520) {
    halfLife *= 1.5
    weights = ts.map((t) => 0.5 ** ((last - t) / halfLife))
  }
  return { weights, halfLifeWeeks: halfLife }
}

export interface ForecastPoint {
  date: Date
  expected: number
  lower: number
  upper: number
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
  /** Where you are right now (Kalman-filtered level), after any detraining. */
  current: number
  /** Level you're regaining after a layoff; equals `current` when there's nothing to regain. */
  retained: number
  /** Weekly share of the gap to `retained` that comes back. */
  regainRate: number
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
  /** Recency half-life the fit used (stretched for rarely trained exercises). */
  halfLifeWeeks: number
  /** Sessions' worth of weight in the fit (sum of recency weights). */
  effectiveSessions: number
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
  /** Every day you trained anything. A layoff is a gap in all training; without these, in this exercise. */
  trainingDates?: Date[]
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

/**
 * Your true strength after each session, as a local-level Kalman filter: each session is a noisy
 * reading of a level that drifts over time. The level trusts a session more after a gap (more time for
 * it to have changed) and less when it's below your level (a light day rather than lost strength).
 * Lower sessions after a layoff count as real, and during a comeback the level is expected to
 * climb back toward where it was (at `regainRate`), so it keeps up with a fast return.
 */
export function strengthLevels(
  ts: number[],
  ys: number[],
  noiseSd: number,
  layoffs = defaultLayoffs(ts),
  regain?: { comebacks: Comeback[]; rate: number },
): number[] {
  const R = noiseSd ** 2
  let x = ys[0]
  let P = R
  const levels = [x]
  for (let i = 1; i < ys.length; i++) {
    const dt = Math.max(ts[i] - ts[i - 1], 0)
    const comeback = regain?.comebacks.find((c) => i > c.from && i < c.until)
    if (comeback && x < comeback.peak) x = comeback.peak - (comeback.peak - x) * Math.exp(-regain!.rate * dt)
    P += (LEVEL_DRIFT * x) ** 2 * dt
    const K = P / (P + (ys[i] < x && !layoffs[i] && !comeback ? R * LIGHT_DAY_NOISE : R))
    x += K * (ys[i] - x)
    P *= 1 - K
    levels.push(x)
  }
  return levels
}

/** Whether each session came after a layoff, judged from this exercise's own gaps. */
const defaultLayoffs = (ts: number[]) => ts.map((t, i) => i > 0 && t - ts[i - 1] > LAYOFF_WEEKS)

/**
 * Whether each session came after a layoff: a stretch of more than 3 weeks with no training at all.
 * A lift you only do every month isn't laid off while you keep training everything else.
 */
export function layoffsBefore(dates: Date[], trainingDates: Date[]): boolean[] {
  const days = trainingDates.map((d) => d.getTime()).sort((a, b) => a - b)
  return dates.map((d, i) => {
    if (i === 0) return false
    const from = dates[i - 1].getTime()
    const to = d.getTime()
    let prev = from
    for (const t of days) {
      if (t <= from) continue
      if (t > to) break
      if (t - prev > LAYOFF_WEEKS * WEEK_MS) return true
      prev = t
    }
    return to - prev > LAYOFF_WEEKS * WEEK_MS
  })
}

export interface Comeback {
  /** Index of the first session back after the layoff. */
  from: number
  /** Index of the first session no longer regaining (the number of sessions if still regaining). */
  until: number
  /** Your level before the layoff, which the comeback regains. */
  peak: number
}

/**
 * Layoffs in the history and the sessions spent regaining what they cost: from the first session back
 * until one reaches ≈ the pre-layoff level, up to 8 weeks.
 */
export function findComebacks(ts: number[], ys: number[], levels: number[], layoffs = defaultLayoffs(ts)): Comeback[] {
  const comebacks: Comeback[] = []
  for (let i = 1; i < ts.length; i++) {
    if (!layoffs[i] || ts[i] - ts[i - 1] > MAX_COMEBACK_GAP_WEEKS) continue
    const peak = levels[i - 1]
    let j = i
    while (j < ts.length && ys[j] < COMEBACK_DONE * peak && ts[j] - ts[i] < COMEBACK_MAX_WEEKS) j++
    comebacks.push({ from: i, until: j, peak })
    i = Math.max(i, j - 1)
  }
  return comebacks
}

/**
 * Training time in weeks: layoffs and the comebacks after them add nothing, so progress picks up
 * where it left off rather than counting time off as time spent not improving.
 */
function trainingWeeks(ts: number[], comebacks: Comeback[]): number[] {
  const paused = new Set<number>()
  for (const c of comebacks) for (let j = c.from; j <= Math.min(c.until, ts.length - 1); j++) paused.add(j)
  const out = [0]
  for (let i = 1; i < ts.length; i++) out.push(out[i - 1] + (paused.has(i) ? 0 : ts[i] - ts[i - 1]))
  return out
}

function fitRate(ts: number[], ys: number[], ws: number[], ceiling: number) {
  // For fixed C and k, the best a in y = C − a·e^(−k·t) has a closed form.
  let best = { k: BASE_RATE, a: ceiling - mean(ys), sse: Number.POSITIVE_INFINITY }
  for (let i = 0; i <= 120; i++) {
    const k = 0.001 * Math.pow(300, i / 120) // 0.001 … 0.3 per week, log-spaced
    let num = 0
    let den = 0
    for (let j = 0; j < ts.length; j++) {
      const u = Math.exp(-k * ts[j])
      num += ws[j] * (ceiling - ys[j]) * u
      den += ws[j] * u * u
    }
    const a = Math.max(num / den, 0)
    let sse = 0
    for (let j = 0; j < ts.length; j++) sse += ws[j] * (ys[j] - (ceiling - a * Math.exp(-k * ts[j]))) ** 2
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
 * - k is fitted to your history, recent sessions weighted most (12-week
 *   half-life), and blended with a prior built from sleep,
 *   stress, energy balance, protein, age, training frequency and weekly volume.
 *   Layoffs don't count as training time, and the sessions spent regaining
 *   after one are left out of the fit.
 * - Where you are now is a Kalman-filtered level, so one light day doesn't drag it down.
 * - After a layoff the forecast first regains the pre-layoff level (fast), then
 *   progresses along the curve.
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

  // Layoffs and comebacks, from a first pass of the level at a rough noise estimate.
  const n = points.length
  const layoffs = opts.trainingDates ? layoffsBefore(points.map((p) => p.date), opts.trainingDates) : defaultLayoffs(ts)
  const roughLevels = strengthLevels(ts, ys, Math.max(best * 0.04, 1e-6), layoffs)
  const comebacks = findComebacks(ts, ys, roughLevels, layoffs)
  const regaining = new Set(comebacks.flatMap((c) => Array.from({ length: c.until - c.from }, (_, k) => c.from + k)))
  const tt = trainingWeeks(ts, comebacks)

  // Data rate on training time, blended with the prior in log space. Comeback sessions are left out.
  const { weights: recency, halfLifeWeeks } = recencyWeights(ts)
  const ws = recency.map((w, j) => (regaining.has(j) ? 0 : w))
  const effectiveSessions = ws.reduce((a, b) => a + b, 0)
  const fit = n - regaining.size >= 3 ? fitRate(tt, ys, ws, ceiling) : null
  const dataRate = fit?.k ?? null
  const rate = dataRate
    ? Math.exp((effectiveSessions * Math.log(dataRate) + PRIOR_WEIGHT * Math.log(priorRate)) / (effectiveSessions + PRIOR_WEIGHT))
    : priorRate

  // Refit the intercept with the blended rate so history and forecast agree.
  let numA = 0
  let denA = 0
  for (let j = 0; j < n; j++) {
    const u = Math.exp(-rate * tt[j])
    numA += ws[j] * (ceiling - ys[j]) * u
    denA += ws[j] * u * u
  }
  const a = denA > 0 ? Math.max(numA / denA, 0) : 0
  const model = (t: number) => ceiling - a * Math.exp(-rate * t)
  const weightedSq = ys.reduce((acc, y, j) => acc + ws[j] * (y - model(tt[j])) ** 2, 0)
  const residualSd = Math.max(effectiveSessions > 0 ? Math.sqrt(weightedSq / effectiveSessions) : 0, best * 0.02)

  // Where you are now: the filtered level, with the session noise the fit found.
  const level = strengthLevels(ts, ys, residualSd, layoffs, { comebacks, rate: REGAIN_RATE * baseMultiplier }).at(-1)!
  const ongoing = comebacks.at(-1)?.until === n ? comebacks.at(-1)! : null
  let retained = ongoing ? Math.max(ongoing.peak, level) : level
  const daysOff = Math.max(0, daysBetween(points.at(-1)!.date, today))
  const detrainingPct = detrainingFraction(daysOff)
  const current = level * (1 - detrainingPct)
  // A layoff too long for muscle memory to count on: start over from where you are.
  if (daysOff / 7 > MAX_COMEBACK_GAP_WEEKS) retained = current
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
  const regainRate = REGAIN_RATE * combine(scenarioFactors)
  const bwWeekly = WEEKLY_BW_CHANGE[scenarioInputs.nutrition]

  const forecast: ForecastPoint[] = []
  const steps = Math.max(1, Math.round(horizonWeeks))
  for (let h = 0; h <= steps; h++) {
    // A load ceiling tracks projected bodyweight (strength ∝ mass^⅔); reps and holds don't get easier with mass.
    const bwRatio = isLoad ? Math.max(0.5, 1 + bwWeekly * h) : 1
    const c = Math.max(ceiling * Math.pow(bwRatio, 2 / 3), retained)
    const expected = curveAt(c, retained, current, futureRate, regainRate, h)
    const sd = residualSd * Math.sqrt(1 + h / 6)
    forecast.push({
      date: addDays(start, h * 7),
      expected,
      lower: Math.max(0, expected - 1.28 * sd),
      upper: expected + 1.28 * sd,
    })
  }

  return {
    exercise,
    metric,
    mainLift,
    history: points.map((p, j) => ({ date: p.date, value: ys[j], fitted: model(tt[j]) })),
    forecast,
    ceiling,
    current,
    retained,
    regainRate,
    rate: futureRate,
    priorRate,
    dataRate,
    percentOfPotential: current / ceiling,
    weeklyGain: futureRate * (ceiling - retained) + regainRate * (retained - current),
    factors: scenarioFactors,
    detrainingPct,
    residualSd,
    sessions: n,
    halfLifeWeeks,
    effectiveSessions,
  }
}

/** Regain toward `retained`, then progress from it toward the ceiling `c`, `h` weeks ahead. */
function curveAt(c: number, retained: number, current: number, rate: number, regainRate: number, h: number) {
  return c - (c - retained) * Math.exp(-rate * h) - (retained - current) * Math.exp(-regainRate * h)
}

/** Expected value `weeks` ahead (at today's bodyweight). */
export function expectedAt(f: StrengthForecast, weeks: number): number {
  return curveAt(Math.max(f.ceiling, f.retained), f.retained, f.current, f.rate, f.regainRate, weeks)
}

/** Weeks until the forecast reaches `target` (in its metric), or null if it is beyond the ceiling. */
export function weeksToTarget(f: StrengthForecast, target: number): number | null {
  if (target <= f.current) return 0
  if (target >= Math.max(f.ceiling, f.retained) * 0.999) return null
  let lo = 0
  let hi = 1
  while (expectedAt(f, hi) < target) {
    hi *= 2
    if (hi > 1e5) return null
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (expectedAt(f, mid) < target) lo = mid
    else hi = mid
  }
  return hi
}

export function dateAfterWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * WEEK_MS)
}
