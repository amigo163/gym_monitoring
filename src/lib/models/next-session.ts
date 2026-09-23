import { detectPlateaus } from "../analysis"
import { DAY_MS, daysBetween, startOfDay } from "../dates"
import { isAssisted, muscleGroupFor } from "../muscles"
import { estimateOneRepMax, loadForReps } from "../one-rep-max"
import { KG_PER_LB, fmtKg } from "../format"
import { fmtDuration } from "../tracking"
import type { ExerciseGoal, ExerciseSession, MuscleGroup, Profile, SetRow, TrackingKind } from "../types"
import { ageRateFactor, clamp, combine, mainLiftOf, sleepFactor, stressFactor } from "./physiology"
import { type StrengthForecast, detrainingFraction } from "./strength"

const HOUR_MS = 3_600_000
export type NextAction = "add-weight" | "add-reps" | "add-time" | "repeat" | "reset" | "ease-back" | "adjust"

/** recovering: due, but the muscle still needs rest · upcoming: before your usual day · due: usual day is now · overdue: well past it */
export type NextStatus = "recovering" | "upcoming" | "due" | "overdue"

export interface NextSession {
  exercise: string
  muscle: MuscleGroup
  kind: TrackingKind
  lastDate: Date
  lastSets: { weight: number; reps: number; seconds: number | null; rpe: number | null }[]
  /** Smallest plate step, in kg. */
  increment: number
  /** Suggested top working sets for the next session (weight in kg, as logged; seconds for timed holds). */
  target: { weight: number; reps: number; sets: number; seconds: number | null }
  action: NextAction
  reason: string
  /** e1RM the target implies (0 when not estimable). */
  targetE1rm: number
  /** The target in the exercise's main metric: est. 1RM, reps in a set or hold seconds (0 when not estimable). */
  targetValue: number
  /** Hitting the target would beat your best in that metric. */
  isPr: boolean
  /** Reps per top set the plan works in: your goal's range, or your usual reps. */
  repRange: { min: number; max: number }
  repRangeFromGoal: boolean
  /** How far hitting the target gets you towards your goal, in the main metric (0–1; null without a starting point). */
  goal: { target: number; start: number | null; progress: number | null } | null
  /** Advice that follows from your goal. */
  note: string | null
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

/** Smallest practical jump in kg: 5 lb, since everything is logged in pounds (Strong exports it converted to kg). */
export const WEIGHT_INCREMENT = 5 * KG_PER_LB

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
  goal?: ExerciseGoal | null
}

/**
 * Short-term plan for one exercise using double progression within a rep range
 * (your goal's, or your usual reps): hit the top of the range on every top set →
 * add the smallest weight step and drop to the bottom; otherwise add a rep at the
 * same weight. Sets well outside the range are re-weighted to land in it. The
 * strength forecast caps weight jumps the model thinks are too big, stalls
 * trigger a 10 % reset, and layoffs ease you back in.
 */
export function planNextSession({ exercise, rows, sessions, profile, asOf, forecast, goal }: NextSessionInput): NextSession | null {
  const lastSession = sessions.at(-1)
  if (!lastSession) return null
  const muscle = muscleGroupFor(exercise)
  const kind = lastSession.kind
  // Cardio, distance work and stretching/mobility don't progress set by set.
  if (muscle === "Cardio" || muscle === "Other" || kind === "distance") return null
  const counts = (r: SetRow) => (kind === "time" ? (r.seconds ?? 0) > 0 : r.reps > 0)
  const byWorkout = new Map<string, SetRow[]>()
  for (const r of rows) {
    if (r.exercise !== exercise || r.isWarmup || !counts(r)) continue
    const list = byWorkout.get(r.workoutId)
    if (list) list.push(r)
    else byWorkout.set(r.workoutId, [r])
  }
  const lastSets = byWorkout.get(lastSession.workoutId)
  if (!lastSets?.length) return null

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
  const daysOff = daysBetween(lastSession.date, asOf)
  const detraining = detrainingFraction(daysOff)
  const timing = { readyFrom, dueOn, suggestedDate, status, typicalGapDays, restHours }
  const base = {
    exercise,
    muscle,
    kind,
    lastDate: lastSession.date,
    lastSets: lastSets.map((s) => ({ weight: s.weight, reps: s.reps, seconds: s.seconds, rpe: s.rpe })),
    ...timing,
  }
  const goalFor = (value: number) => {
    const target = goal?.target ?? null
    const start = goal?.start ?? null
    if (target == null || !(target > 0) || !(value > 0)) return null
    return { target, start, progress: start != null && target > start ? clamp((value - start) / (target - start), 0, 1) : null }
  }

  if (kind === "time") {
    const hold = planHold(lastSets, detraining, daysOff)
    const best = Math.max(...sessions.map((s) => s.bestSeconds))
    return {
      ...base,
      increment: 0,
      target: { weight: 0, reps: 0, sets: lastSets.length, seconds: hold.seconds },
      action: hold.action,
      reason: hold.reason,
      targetE1rm: 0,
      targetValue: hold.seconds,
      isPr: hold.seconds > best,
      repRange: { min: 0, max: 0 },
      repRangeFromGoal: false,
      goal: goalFor(hold.seconds),
      note: null,
      alternatives: null,
    }
  }

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
  const repRangeFromGoal = goal?.repRange != null
  const range = goal?.repRange ?? { min: repTarget, max: repTarget }
  const rangeLabel = !repRangeFromGoal
    ? `your usual ${repTarget}`
    : range.min === range.max
      ? `your target of ${range.min}`
      : `your ${range.min}–${range.max} range`

  // Load actually moved for a logged weight (bodyweight share added, assistance subtracted).
  const offset = top.effectiveLoad - (assisted ? -W : W)
  const effective = (w: number) => offset + (assisted ? -w : w)
  const inc = WEIGHT_INCREMENT
  const step = (w: number, n: number) => Math.max(0, roundTo(w + (assisted ? -n : n) * inc, inc))
  const bodyweightOnly = W === 0 && !assisted
  /** Logged weight for an effective load, rounded to plates. */
  const weightFor = (load: number) => Math.max(0, roundTo(assisted ? offset - load : load - offset, inc))

  // Progression
  // Stuck for 5+ sessions *and* missing reps — hovering at a weight while hitting your reps is normal.
  const stalled = R < range.max && detectPlateaus(sessions, 5).some((p) => p.end.getTime() === lastSession.date.getTime())
  const weeksAhead = Math.max(0, (suggestedDate.getTime() - lastSession.date.getTime()) / (7 * DAY_MS))
  // Heaviest e1RM the forecast expects you can show by then (upper edge of its 80% range).
  const ceilingNext =
    forecast?.metric === "e1rm" ? forecast.current + forecast.weeklyGain * weeksAhead + 1.28 * forecast.residualSd : Number.POSITIVE_INFINITY

  // e1RM of the weakest top set, the basis for moving into a new rep range.
  const lastE1rm = estimateOneRepMax(top.effectiveLoad, R, maxRpe)
  const outOfRange = repRangeFromGoal && !bodyweightOnly && lastE1rm > 0 && (R > range.max + 2 || R < range.min - 2)

  let target = { weight: W, reps: R, sets, seconds: null as number | null }
  let action: NextAction
  let reason: string
  if (detraining > 0) {
    const drop = detraining + 0.05
    target = bodyweightOnly
      ? { ...target, reps: Math.max(1, Math.round(R * (1 - drop))) }
      : { ...target, weight: step(W * (assisted ? 1 + drop : 1 - drop), 0), reps: range.min }
    action = "ease-back"
    reason = `${Math.round(daysOff / 7)} weeks since you last did this — start ~${Math.round(drop * 100)}% ${bodyweightOnly ? "fewer reps" : "lighter"} and build back up over 2–3 sessions.`
  } else if (bodyweightOnly) {
    if (repRangeFromGoal && R >= range.max) {
      target = { ...target, reps: range.max }
      action = "repeat"
      reason = `You're at the top of ${rangeLabel} with bodyweight — add load (belt or vest) or move to a harder variation.`
    } else {
      target = { ...target, reps: R + 1 }
      action = "add-reps"
      reason = `Bodyweight movement: add a rep to every set (last time ${R} on the weakest set).${R >= 20 ? " Past ~20 reps, a harder variation or added load builds more strength than extra reps." : ""}`
    }
  } else if (outOfRange) {
    // Your rep max at the top of the range, done for the bottom: some reps in reserve to build up from.
    target = { ...target, weight: weightFor(loadForReps(lastE1rm, range.max)), reps: range.min }
    action = "adjust"
    reason = `Last time was ${R} reps, outside ${rangeLabel}. ${range.min} rep${range.min === 1 ? "" : "s"} at this weight is the same effort with some in reserve — build up from there.`
  } else if (stalled) {
    target = { ...target, weight: step(assisted ? W * 1.1 : W * 0.9, 0), reps: range.min }
    action = "reset"
    reason = "No progress in 5+ sessions and you're missing reps — drop ~10% and build back up with clean reps."
  } else if (R >= range.max && (maxRpe == null || maxRpe <= 9)) {
    const next = step(W, 1)
    if (estimateOneRepMax(effective(next), range.min) <= ceilingNext || assisted) {
      target = { ...target, weight: next, reps: range.min }
      action = "add-weight"
      reason = `You hit ${R} reps on all ${sets} top set${sets > 1 ? "s" : ""}${maxRpe != null ? ` at RPE ≤ ${maxRpe}` : ""} — add ${fmtKg(inc)}${range.min < range.max ? ` and go back to ${range.min} rep${range.min === 1 ? "" : "s"}` : ""}.`
    } else {
      target = { ...target, reps: R + 1 }
      action = "add-reps"
      reason = `A ${fmtKg(inc)} jump is ahead of your forecast strength — earn it with one more rep first.`
    }
  } else if (R < range.max) {
    target = { ...target, reps: R + 1 }
    action = "add-reps"
    reason = repRangeFromGoal
      ? `Your weakest top set had ${R} reps — build to ${range.max} (top of ${rangeLabel}) before adding weight. Same weight, one more rep.`
      : `Your weakest top set had ${R} reps; your usual target is ${repTarget}. Same weight, one more rep.`
  } else {
    action = "repeat"
    reason = `Hit the reps but at RPE ${maxRpe} — repeat the weight and aim for it to feel easier.`
  }

  const targetE1rm = estimateOneRepMax(effective(target.weight), target.reps)
  // Rep-based exercises progress in reps; the rest in est. 1RM.
  const targetValue = kind === "reps" ? target.reps : targetE1rm
  const best = Math.max(...sessions.map((s) => (kind === "reps" ? s.bestReps : s.bestE1rm)))
  // Strength is fairly rep-specific: a 1RM target is best served by heavier, lower-rep sets.
  const note =
    kind === "weight" && goal?.target != null && !repRangeFromGoal && !bodyweightOnly && repTarget > 8
      ? `You usually do ${repTarget} reps. Sets of 3–6 carry over better to a 1RM target — set a rep range in your goal to train there.`
      : null
  return {
    ...base,
    increment: inc,
    target,
    action,
    reason,
    targetE1rm,
    targetValue,
    isPr: targetValue > 0 && targetValue > best * 1.001,
    repRange: range,
    repRangeFromGoal,
    goal: goalFor(targetValue),
    note,
    alternatives: !assisted && offset < 1 && target.weight > 0 ? repOptions(targetE1rm, inc) : null,
  }
}

/** Past this, a longer hold stops adding much; a harder variation does more. */
const HOLD_CAP_SECONDS = 180

/**
 * Timed holds progress by time: +5 s on short holds, +10 s up to 1:30, +15 s beyond,
 * all measured from your shortest hold last time.
 */
export function planHold(lastSets: SetRow[], detraining: number, daysOff: number): { seconds: number; action: NextAction; reason: string } {
  const shortest = Math.min(...lastSets.map((s) => s.seconds ?? 0))
  if (detraining > 0) {
    const drop = detraining + 0.05
    return {
      seconds: Math.max(5, roundTo(shortest * (1 - drop), 5)),
      action: "ease-back",
      reason: `${Math.round(daysOff / 7)} weeks since you last did this — hold ~${Math.round(drop * 100)}% shorter and build back up over 2–3 sessions.`,
    }
  }
  if (shortest >= HOLD_CAP_SECONDS) {
    return {
      seconds: shortest,
      action: "repeat",
      reason: `You hold ${fmtDuration(shortest)} already — make it harder (added weight, longer lever, RKC-style bracing) rather than longer.`,
    }
  }
  const stepSec = shortest < 30 ? 5 : shortest < 90 ? 10 : 15
  return {
    seconds: roundTo(shortest, 5) + stepSec,
    action: "add-time",
    reason: `Your shortest hold last time was ${fmtDuration(shortest)} — add ${stepSec} s to every set.`,
  }
}

/** Working weights for other rep counts that match an e1RM, rounded to plates. */
export function repOptions(e1rm: number, increment: number, reps = [3, 5, 8, 10, 12]) {
  return reps.map((r) => ({ reps: r, weight: roundTo(loadForReps(e1rm, r), increment) }))
}
