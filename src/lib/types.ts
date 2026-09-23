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
  date: Date
  workoutId: string
  topWeight: number
  bestE1rm: number
  volume: number
  sets: number
  reps: number
  avgRpe: number | null
}

export type PrKind = "e1rm" | "weight" | "volume"

export interface PersonalRecord {
  exercise: string
  muscle: MuscleGroup
  date: Date
  kind: PrKind
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
