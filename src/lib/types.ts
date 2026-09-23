export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Legs"
  | "Shoulders"
  | "Arms"
  | "Core"
  | "Cardio"
  | "Olympic"
  | "Compound"
  | "Other"

/**
 * What an exercise is measured by: load × reps (bench press), reps alone (toes to bar),
 * hold time (plank) or distance (running).
 */
export type TrackingKind = "weight" | "reps" | "time" | "distance"

/** Your corrections to how an exercise was classified; null keeps the automatic choice. */
export interface ExerciseSettings {
  exercise: string
  muscle: MuscleGroup | null
  kind: TrackingKind | null
}

/**
 * One set as it's kept in the local database: the Strong export row with units normalized,
 * but before anything that depends on the profile (bodyweight share, e1RM).
 */
export interface StoredSet {
  /** Stable across exports: workout key, exercise, set order and occurrence. */
  key: string
  /** Workout start time as exported plus the workout name. */
  workoutKey: string
  /** "yyyy-mm-dd hh:mm:ss" exactly as exported (local time). */
  date: string
  workoutName: string
  durationSec: number
  exercise: string
  /** Raw "Set Order" value: a number, or "W"/"D"… for warm-up and drop sets. */
  setOrder: string
  /** Row position within its workout in the export, to keep the logged order. */
  position: number
  weightKg: number
  reps: number
  rpe: number | null
  distanceM: number | null
  seconds: number | null
  notes: string
}

/** One logged set, normalized from a Strong CSV row. */
export interface SetRow {
  workoutId: string
  date: Date
  workoutName: string
  durationSec: number
  exercise: string
  setOrder: number
  isWarmup: boolean
  /** External load in kg as logged (0 for bodyweight movements). */
  weight: number
  reps: number
  rpe: number | null
  distanceM: number | null
  seconds: number | null
  notes: string
  muscle: MuscleGroup
  /** Load actually moved: external load plus the bodyweight share for bodyweight movements. */
  effectiveLoad: number
  /** Estimated one-rep max (kg) for this set, 0 when not estimable. */
  e1rm: number
  /** weight × reps using the effective load. */
  volume: number
}

export interface Workout {
  id: string
  date: Date
  name: string
  durationSec: number
  sets: SetRow[]
  volume: number
  reps: number
  exercises: string[]
}

/** Best performance of one exercise within one workout. */
export interface ExerciseSession {
  exercise: string
  kind: TrackingKind
  date: Date
  workoutId: string
  topWeight: number
  bestE1rm: number
  volume: number
  sets: number
  reps: number
  /** Most reps in one set. */
  bestReps: number
  /** Longest set, in seconds. */
  bestSeconds: number
  totalSeconds: number
  totalDistanceM: number
  /** Seconds per km over the session's distance sets; null without distance. */
  paceSecPerKm: number | null
  /** The number that tracks progress for this kind of exercise (see `primaryValue`). */
  primary: number
  avgRpe: number | null
}

export type PrKind = "e1rm" | "weight" | "volume" | "reps" | "totalReps" | "duration" | "totalDuration" | "distance" | "pace"

export interface PersonalRecord {
  exercise: string
  muscle: MuscleGroup
  date: Date
  kind: PrKind
  /** The record in the exercise's main metric (e1RM, most reps, longest hold, distance). */
  primary: boolean
  value: number
  previous: number | null
  weight: number
  reps: number
}

export type Sex = "male" | "female"
export type NutritionState = "deficit" | "maintenance" | "surplus"

export interface BodyweightEntry {
  date: string // yyyy-mm-dd
  kg: number
}

/** Physiological and health inputs that drive the prediction models. */
export interface Profile {
  sex: Sex
  age: number
  heightCm: number
  bodyweightKg: number
  bodyFatPct: number | null
  /** Lifting experience before the first logged workout, in years. */
  priorTrainingYears: number
  sleepHours: number
  /** 1 (very low) … 5 (very high) perceived life stress. */
  stress: number
  nutrition: NutritionState
  proteinGPerKg: number
  restingHr: number | null
  restingHrBaseline: number | null
  hrvMs: number | null
  hrvBaselineMs: number | null
  bodyweightLog: BodyweightEntry[]
}

/** What you're working towards on one exercise; every field is optional. */
export interface ExerciseGoal {
  exercise: string
  /**
   * Target in the exercise's main metric: est. 1RM in kg (on the same effective-load scale as
   * the forecast), reps in one set, or hold seconds.
   */
  target: number | null
  /** Where you were in that metric when the target was set, to measure progress from. */
  start: number | null
  /** Reps per top set; double progression builds from min to max, then adds weight. */
  repRange: { min: number; max: number } | null
  /** yyyy-mm-dd */
  deadline: string | null
  /** ISO timestamp of the last change. */
  updatedAt: string
}
