import { detectPlateaus } from "../analysis"
import { DAY_MS, daysBetween, startOfDay } from "../dates"
import { isAssisted, muscleGroupFor } from "../muscles"
import { estimateOneRepMax, loadForReps } from "../one-rep-max"
import type { ExerciseSession, MuscleGroup, Profile, SetRow } from "../types"
import { ageRateFactor, clamp, combine, mainLiftOf, sleepFactor, stressFactor } from "./physiology"
import { type StrengthForecast, detrainingFraction } from "./strength"

const HOUR_MS = 3_600_000
const LB = 0.45359237

export type WeightUnit = "kg" | "lb"

export type NextAction = "add-weight" | "add-reps" | "repeat" | "reset" | "ease-back"

/** recovering: due, but the muscle still needs rest · upcoming: before your usual day · due: usual day is now · overdue: well past it */
export type NextStatus = "recovering" | "upcoming" | "due" | "overdue"

export interface NextSession {
  exercise: string
  muscle: MuscleGroup
  lastDate: Date
  lastSets: { weight: number; reps: number; rpe: number | null }[]
  /** The unit you load this exercise in (Strong exports lb entries converted to kg). */
  unit: WeightUnit
  /** Smallest plate step, in kg. */
  increment: number
  /** Suggested top working sets for the next session (weight in kg, as logged). */
  target: { weight: number; reps: number; sets: number }
  action: NextAction
  reason: string
  /** e1RM the target implies (0 when not estimable). */
  targetE1rm: number
  /** Hitting the target would beat your best e1RM for this exercise. */
  isPr: boolean
  /** Same effort at other rep counts; null for bodyweight/assisted movements. */
  alternatives: { reps: number; weight: number }[] | null
  /** Earliest date the muscle group has recovered from its last session. */
  readyFrom: Date
  /** Last session + your usual gap between sessions of this exercise. */
  dueOn: Date
  /** When to do it: the later of readyFrom and dueOn, but never before today. */
  suggestedDate: Date
  status: NextStatus
  typicalGapDays: number
  restHours: number
}

/**
 * Strong's export is always in kg, but lb entries come through converted
 * (135 lb → 61.23492). Weights that are whole pounds but not round kilos give
 * the logging unit away.
 */
export function detectUnit(weights: number[]): WeightUnit {
  const loaded = weights.filter((w) => w > 0)
  if (!loaded.length) return "kg"
  const near = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 0.01
  // Half pounds too: machine stacks often go in 2.5 lb steps (49.5 lb → 22.45 kg).
  const lbOnly = loaded.filter((w) => near(w, LB / 2) && !near(w, 0.25)).length
  return lbOnly / loaded.length >= 0.5 ? "lb" : "kg"
}

/** Smallest practical jump in kg: 5 lb when you log in pounds, else 2 kg for dumbbells/kettlebells and 2.5 kg otherwise. */
export function weightIncrement(exercise: string, unit: WeightUnit = "kg"): number {
  if (unit === "lb") return 5 * LB
  return /dumbbell|kettlebell/i.test(exercise) ? 2 : 2.5
}

export function formatLoad(kg: number, unit: WeightUnit): string {
  return unit === "lb" ? `${Math.round((kg / LB) * 2) / 2} lb` : `${Math.round(kg * 100) / 100} kg`
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Minimum rest before training a muscle group hard again. ~48 h for most
 * groups, ~72 h for legs and deadlifts (Schoenfeld & Grgic 2018), stretched by
 * short sleep, high stress and age.
 */
export function restHoursFor(exercise: string, profile: Pick<Profile, "sleepHours" | "stress" | "age">): number {
  const lift = mainLiftOf(exercise)
  const base = muscleGroupFor(exercise) === "Legs" || lift === "deadlift" ? 72 : 48
  const recovery = combine([sleepFactor(profile.sleepHours), stressFactor(profile.stress), ageRateFactor(profile.age)])
  return Math.round(base / clamp(recovery, 0.5, 1))
}

export interface NextSessionInput {
  exercise: string
  /** All logged rows up to `asOf` (any exercise — used for muscle-group recovery). */
  rows: SetRow[]
  sessions: ExerciseSession[]
  profile: Profile
  asOf: Date
  forecast?: StrengthForecast | null
}

/**
 * Short-term plan for one exercise using double progression: hit the target reps
 * on every top set → add the smallest weight step; otherwise add a rep at the
 * same weight. The strength forecast caps weight jumps the model thinks are too
 * big, stalls trigger a 10 % reset, and layoffs ease you back in.
 */
export function planNextSession({ exercise, rows, sessions, profile, asOf, forecast }: NextSessionInput): NextSession | null {
  const lastSession = sessions.at(-1)
  if (!lastSession) return null
  const muscle = muscleGroupFor(exercise)
  if (muscle === "Cardio") return null
  const byWorkout = new Map<string, SetRow[]>()
  for (const r of rows) {
    if (r.exercise !== exercise || r.isWarmup || r.reps <= 0) continue
    const list = byWorkout.get(r.workoutId)
    if (list) list.push(r)
    else byWorkout.set(r.workoutId, [r])
  }
  const lastSets = byWorkout.get(lastSession.workoutId)
  if (!lastSets?.length) return null

  const assisted = isAssisted(exercise)
  const top = lastSets.reduce((a, b) => (b.effectiveLoad > a.effectiveLoad ? b : a))
  const W = top.weight
  const atTop = lastSets.filter((s) => s.weight === W)
  const R = Math.min(...atTop.map((s) => s.reps))
  const rpes = atTop.map((s) => s.rpe).filter((v): v is number => v != null)
  const maxRpe = rpes.length ? Math.max(...rpes) : null
  const sets = atTop.length

  // Your usual rep target: median reps of the top set over recent sessions.
  const recentTopReps = sessions.slice(-6).flatMap((s) => {
    const list = byWorkout.get(s.workoutId)
    if (!list?.length) return []
    const t = list.reduce((a, b) => (b.effectiveLoad > a.effectiveLoad ? b : a))
    return [t.reps]
  })
  const repTarget = Math.max(1, Math.round(median(recentTopReps.length ? recentTopReps : [R])))

  // Load actually moved for a logged weight (bodyweight share added, assistance subtracted).
  const offset = top.effectiveLoad - (assisted ? -W : W)
  const effective = (w: number) => offset + (assisted ? -w : w)
  const unit = detectUnit(rows.filter((r) => r.exercise === exercise).map((r) => r.weight))
  const inc = weightIncrement(exercise, unit)
  const step = (w: number, n: number) => Math.max(0, roundTo(w + (assisted ? -n : n) * inc, inc))
  const bodyweightOnly = W === 0 && !assisted

  // Timing
  const recent = sessions.slice(-7)
  const gaps = recent.slice(1).map((s, i) => daysBetween(recent[i].date, s.date)).filter((g) => g > 0 && g <= 28)
  const typicalGapDays = gaps.length ? Math.max(1, Math.round(median(gaps))) : 7
  const restHours = restHoursFor(exercise, profile)
  const lastMuscle = rows.reduce<Date>((d, r) => (!r.isWarmup && r.muscle === muscle && r.date > d ? r.date : d), lastSession.date)
  const readyFrom = new Date(lastMuscle.getTime() + restHours * HOUR_MS)
  const dueOn = new Date(lastSession.date.getTime() + typicalGapDays * DAY_MS)
  const later = readyFrom > dueOn ? readyFrom : dueOn
  const suggestedDate = startOfDay(later) < startOfDay(asOf) ? startOfDay(asOf) : later
  // Recovery only shows as the status when it's what is holding the session back.
  const status: NextStatus =
    asOf < readyFrom && dueOn <= readyFrom
      ? "recovering"
      : daysBetween(asOf, dueOn) > 0
        ? "upcoming"
        : daysBetween(dueOn, asOf) > 2
          ? "overdue"
          : "due"

  // Progression
  const daysOff = daysBetween(lastSession.date, asOf)
  const detraining = detrainingFraction(daysOff)
  // Stuck for 5+ sessions *and* missing reps — hovering at a weight while hitting your reps is normal.
  const stalled = R < repTarget && detectPlateaus(sessions, 5).some((p) => p.end.getTime() === lastSession.date.getTime())
  const weeksAhead = Math.max(0, (suggestedDate.getTime() - lastSession.date.getTime()) / (7 * DAY_MS))
  // Heaviest e1RM the forecast expects you can show by then (upper edge of its 80% range).
  const ceilingNext = forecast ? forecast.current + forecast.weeklyGain * weeksAhead + 1.28 * forecast.residualSd : Number.POSITIVE_INFINITY

  let target = { weight: W, reps: R, sets }
  let action: NextAction
  let reason: string
  if (detraining > 0) {
    const drop = detraining + 0.05
    target = { weight: step(W * (assisted ? 1 + drop : 1 - drop), 0), reps: repTarget, sets }
    action = "ease-back"
    reason = `${Math.round(daysOff / 7)} weeks since you last did this — start ~${Math.round((detraining + 0.05) * 100)}% lighter and build back up over 2–3 sessions.`
  } else if (bodyweightOnly) {
    target = { weight: 0, reps: R + 1, sets }
    action = "add-reps"
    reason = `Bodyweight movement: add a rep to every set (last time ${R} on the weakest set).`
  } else if (stalled) {
    target = { weight: step(assisted ? W * 1.1 : W * 0.9, 0), reps: repTarget, sets }
    action = "reset"
    reason = "No e1RM progress in 5+ sessions and you're missing reps — drop ~10% and build back up with clean reps."
  } else if (R >= repTarget && (maxRpe == null || maxRpe <= 9)) {
    const next = step(W, 1)
    if (estimateOneRepMax(effective(next), repTarget) <= ceilingNext || assisted) {
      target = { weight: next, reps: repTarget, sets }
      action = "add-weight"
      reason = `You hit ${R} reps on all ${sets} top set${sets > 1 ? "s" : ""}${maxRpe != null ? ` at RPE ≤ ${maxRpe}` : ""} — add ${formatLoad(inc, unit)}.`
    } else {
      target = { weight: W, reps: R + 1, sets }
      action = "add-reps"
      reason = `A ${formatLoad(inc, unit)} jump is ahead of your forecast strength — earn it with one more rep first.`
    }
  } else if (R < repTarget) {
    target = { weight: W, reps: Math.min(R + 1, repTarget), sets }
    action = "add-reps"
    reason = `Your weakest top set had ${R} reps; your usual target is ${repTarget}. Same weight, one more rep.`
  } else {
    action = "repeat"
    reason = `Hit the reps but at RPE ${maxRpe} — repeat the weight and aim for it to feel easier.`
  }

  const targetE1rm = estimateOneRepMax(effective(target.weight), target.reps)
  const bestE1rm = Math.max(...sessions.map((s) => s.bestE1rm))
  return {
    exercise,
    muscle,
    lastDate: lastSession.date,
    unit,
    increment: inc,
    lastSets: lastSets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe })),
    target,
    action,
    reason,
    targetE1rm,
    isPr: targetE1rm > bestE1rm * 1.001,
    alternatives: !assisted && offset < 1 && target.weight > 0 ? repOptions(targetE1rm, inc) : null,
    readyFrom,
    dueOn,
    suggestedDate,
    status,
    typicalGapDays,
    restHours,
  }
}

/** Working weights for other rep counts that match an e1RM, rounded to plates. */
export function repOptions(e1rm: number, increment: number, reps = [3, 5, 8, 10, 12]) {
  return reps.map((r) => ({ reps: r, weight: roundTo(loadForReps(e1rm, r), increment) }))
}
