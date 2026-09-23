import { fmt1, fmtInt, fmtKg, fmtKgInt } from "./format"
import { bodyweightShare, isAssisted } from "./muscles"
import type { ExerciseSession, PrKind, SetRow, TrackingKind } from "./types"

export const TRACKING_KINDS: TrackingKind[] = ["weight", "reps", "time", "distance"]

export const KIND_LABEL: Record<TrackingKind, string> = {
  weight: "Weight × reps",
  reps: "Reps",
  time: "Time",
  distance: "Distance",
}

type Logged = Pick<SetRow, "exercise" | "isWarmup" | "weight" | "reps" | "seconds" | "distanceM">

/**
 * Guess what an exercise is measured by from what you logged, since Strong's export doesn't say:
 * distance on most sets → distance; weight on at least half the rep sets → weight; reps → reps;
 * only seconds → time. Bodyweight lifts with a known bodyweight share (pull-ups, dips, push-ups)
 * count as weight, so their est. 1RM includes your bodyweight.
 */
export function inferTrackingKind(sets: Logged[]): TrackingKind {
  const working = sets.filter((s) => !s.isWarmup)
  const list = working.length ? working : sets
  const exercise = list[0]?.exercise ?? ""
  const count = (f: (s: Logged) => boolean) => list.filter(f).length
  const distance = count((s) => (s.distanceM ?? 0) > 0)
  const reps = count((s) => s.reps > 0)
  const weighted = count((s) => s.reps > 0 && s.weight > 0)
  const timed = count((s) => (s.seconds ?? 0) > 0)
  if (distance > 0 && distance * 2 >= list.length) return "distance"
  if (reps > 0 && (weighted * 2 >= reps || bodyweightShare(exercise) > 0 || isAssisted(exercise))) return "weight"
  if (reps > 0 && reps >= timed) return "reps"
  if (timed > 0) return "time"
  return "weight"
}

/** Automatic kinds for every exercise in the rows. */
export function inferTrackingKinds(sets: Logged[]): Map<string, TrackingKind> {
  const byExercise = new Map<string, Logged[]>()
  for (const s of sets) {
    const list = byExercise.get(s.exercise)
    if (list) list.push(s)
    else byExercise.set(s.exercise, [s])
  }
  return new Map([...byExercise].map(([exercise, list]) => [exercise, inferTrackingKind(list)]))
}

/** The PR kind that tracks progress for each kind of exercise. */
export const PRIMARY_PR: Record<TrackingKind, PrKind> = {
  weight: "e1rm",
  reps: "reps",
  time: "duration",
  distance: "distance",
}

/** The records worth tracking for each kind; bodyweight lifts also get rep records. */
export function prKindsFor(kind: TrackingKind, exercise: string): PrKind[] {
  switch (kind) {
    case "weight":
      return bodyweightShare(exercise) > 0 && !isAssisted(exercise) ? ["e1rm", "weight", "volume", "reps"] : ["e1rm", "weight", "volume"]
    case "reps":
      return ["reps", "totalReps", "e1rm"]
    case "time":
      return ["duration", "totalDuration"]
    case "distance":
      return ["distance", "pace", "duration"]
  }
}

/** Pace is the only record where lower is better. */
export const lowerIsBetter = (kind: PrKind) => kind === "pace"

/** One session's value for a record kind (0 when it doesn't apply). */
export function sessionMetric(s: ExerciseSession, kind: PrKind): number {
  switch (kind) {
    case "e1rm":
      return s.bestE1rm
    case "weight":
      return s.topWeight
    case "volume":
      return s.volume
    case "reps":
      return s.bestReps
    case "totalReps":
      return s.reps
    case "duration":
      return s.kind === "distance" ? s.totalSeconds : s.bestSeconds
    case "totalDuration":
      return s.totalSeconds
    case "distance":
      return s.totalDistanceM
    case "pace":
      return s.paceSecPerKm ?? 0
  }
}

/** Main progress number of a session: e1RM (top weight when not estimable), most reps, longest hold or distance. */
export function primaryValue(s: Omit<ExerciseSession, "primary">): number {
  switch (s.kind) {
    case "weight":
      return s.bestE1rm || s.topWeight
    case "reps":
      return s.bestReps
    case "time":
      return s.bestSeconds
    case "distance":
      return s.totalDistanceM
  }
}

export const PR_LABEL: Record<PrKind, string> = {
  e1rm: "Est. 1RM",
  weight: "Heaviest",
  volume: "Volume",
  reps: "Most reps",
  totalReps: "Total reps",
  duration: "Longest",
  totalDuration: "Total time",
  distance: "Distance",
  pace: "Best pace",
}

/** "1:05" or "1:02:05". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

export const fmtDistance = (m: number) => (m >= 1000 ? `${fmt1(m / 1000)} km` : `${fmtInt(m)} m`)

/** A record value with its unit. */
export function fmtMetric(kind: PrKind, value: number): string {
  switch (kind) {
    case "e1rm":
    case "weight":
      return fmtKg(value)
    case "volume":
      return fmtKgInt(value)
    case "reps":
    case "totalReps":
      return `${fmtInt(value)} reps`
    case "duration":
    case "totalDuration":
      return fmtDuration(value)
    case "distance":
      return fmtDistance(value)
    case "pace":
      return `${fmtDuration(value)} /km`
  }
}

/** Gain from `previous` to `value`, signed so improvements are positive (faster pace included). */
export function improvementPct(kind: PrKind, previous: number, value: number): number {
  if (previous <= 0) return 0
  return ((lowerIsBetter(kind) ? previous - value : value - previous) / previous) * 100
}

/** Which record a session's `primary` is: est. 1RM, or top weight for lifts without an estimable 1RM. */
export function primaryKind(s: Pick<ExerciseSession, "kind" | "bestE1rm">): PrKind {
  return s.kind === "weight" && !s.bestE1rm ? "weight" : PRIMARY_PR[s.kind]
}

/** A session's main metric with its unit. */
export const fmtPrimary = (s: ExerciseSession) => fmtMetric(primaryKind(s), s.primary)

export const primaryLabel = (s: ExerciseSession) => PR_LABEL[primaryKind(s)]
