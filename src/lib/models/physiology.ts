import { dayKey } from "../dates"
import type { NutritionState, Profile, Sex } from "../types"

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const DEFAULT_PROFILE: Profile = {
  sex: "male",
  age: 30,
  heightCm: 178,
  bodyweightKg: 80,
  bodyFatPct: null,
  priorTrainingYears: 0,
  sleepHours: 7.5,
  stress: 2,
  nutrition: "maintenance",
  proteinGPerKg: 1.6,
  restingHr: null,
  restingHrBaseline: null,
  hrvMs: null,
  hrvBaselineMs: null,
  bodyweightLog: [],
}

/** Inputs that can be changed in a "what-if" scenario. */
export type RecoveryInputs = Pick<Profile, "sleepHours" | "stress" | "nutrition" | "proteinGPerKg" | "age">

export interface Factor {
  key: string
  label: string
  /** Multiplier applied to the adaptation rate (1 = neutral). */
  value: number
  detail: string
}

/**
 * Sleep: chronic restriction (< 6 h) blunts strength gains and muscle protein
 * synthesis (Knowles 2018; Lamon 2021). 7–9 h is treated as neutral.
 */
export function sleepFactor(hours: number): Factor {
  const value = clamp(0.55 + 0.45 * ((hours - 5) / 2), 0.55, 1)
  return {
    key: "sleep",
    label: "Sleep",
    value,
    detail: hours >= 7 ? `${hours} h/night — enough for full recovery` : `${hours} h/night — short sleep slows adaptation`,
  }
}

/** High perceived stress roughly halves 12-week strength gains (Bartholomew 2008). */
export function stressFactor(level: number): Factor {
  const value = clamp(1 - (level - 1) * 0.08, 0.68, 1)
  return { key: "stress", label: "Stress", value, detail: `Level ${level}/5` }
}

const NUTRITION: Record<NutritionState, [number, string]> = {
  surplus: [1, "Caloric surplus supports the fastest progress"],
  maintenance: [0.9, "Maintenance calories — steady but slower gains"],
  deficit: [0.7, "Caloric deficit — expect slower strength gains"],
}

export function nutritionFactor(state: NutritionState): Factor {
  const [value, detail] = NUTRITION[state]
  return { key: "nutrition", label: "Energy balance", value, detail }
}

/** Gains plateau around 1.6 g/kg/day (Morton 2018 meta-analysis). */
export function proteinFactor(gPerKg: number): Factor {
  const value = clamp(0.8 + 0.2 * ((gPerKg - 0.8) / 0.8), 0.8, 1)
  return {
    key: "protein",
    label: "Protein",
    value,
    detail: gPerKg >= 1.6 ? `${gPerKg} g/kg — at the benefit plateau` : `${gPerKg} g/kg — below the 1.6 g/kg plateau`,
  }
}

/** Trainability declines slowly after ~35 (anabolic resistance, slower recovery). */
export function ageRateFactor(age: number): Factor {
  const value = age <= 35 ? 1 : clamp(1 - (age - 35) * 0.012, 0.55, 1)
  return { key: "age", label: "Age", value, detail: age <= 35 ? `${age} — peak trainability` : `${age} — adaptation slows ~1%/yr after 35` }
}

/** Multiplier on how fast strength approaches the ceiling, from health/lifestyle inputs. */
export function recoveryFactors(p: RecoveryInputs): Factor[] {
  return [
    sleepFactor(p.sleepHours),
    stressFactor(p.stress),
    nutritionFactor(p.nutrition),
    proteinFactor(p.proteinGPerKg),
    ageRateFactor(p.age),
  ]
}

export function combine(factors: Factor[]): number {
  return factors.reduce((acc, f) => acc * f.value, 1)
}

/**
 * Peak strength potential vs. age. Roughly flat 23–40, −0.8 %/yr afterwards
 * (masters age coefficients), and still developing before 23.
 */
export function ageCeilingFactor(age: number): number {
  if (age < 23) return clamp(1 - (23 - age) * 0.02, 0.85, 1)
  if (age <= 40) return 1
  return clamp(1 - (age - 40) * 0.008, 0.6, 1)
}

/** Typical body-fat share used to normalise lean mass back to a bodyweight. */
const REFERENCE_BF: Record<Sex, number> = { male: 0.15, female: 0.25 }

/**
 * Bodyweight used for strength scaling. With a body-fat reading we scale by
 * lean mass, since fat mass contributes little to force output.
 */
export function scalingBodyweight(p: Pick<Profile, "bodyweightKg" | "bodyFatPct" | "sex">): number {
  if (p.bodyFatPct == null) return p.bodyweightKg
  const lean = p.bodyweightKg * (1 - p.bodyFatPct / 100)
  return lean / (1 - REFERENCE_BF[p.sex])
}

export function leanMassKg(p: Pick<Profile, "bodyweightKg" | "bodyFatPct">): number | null {
  return p.bodyFatPct == null ? null : p.bodyweightKg * (1 - p.bodyFatPct / 100)
}

/** Fat-free mass index, height-normalised (Kouri 1995). */
export function ffmi(p: Pick<Profile, "bodyweightKg" | "bodyFatPct" | "heightCm">): number | null {
  const lean = leanMassKg(p)
  if (lean == null) return null
  const h = p.heightCm / 100
  return lean / (h * h) + 6.1 * (1.8 - h)
}

export function bmi(p: Pick<Profile, "bodyweightKg" | "heightCm">): number {
  const h = p.heightCm / 100
  return p.bodyweightKg / (h * h)
}

// ---------------------------------------------------------------------------
// Strength standards
// ---------------------------------------------------------------------------

export type MainLift = "squat" | "bench" | "deadlift" | "ohp"

export const LIFT_LABEL: Record<MainLift, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  ohp: "Overhead press",
}

export const LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"] as const
export type Level = (typeof LEVELS)[number]

/** 1RM ÷ bodyweight thresholds at an ~80 kg male / ~60 kg female reference. */
const STANDARDS: Record<Sex, Record<MainLift, number[]>> = {
  male: {
    squat: [0.75, 1.25, 1.5, 2.25, 2.75],
    bench: [0.5, 0.75, 1.0, 1.5, 2.0],
    deadlift: [1.0, 1.5, 2.0, 2.5, 3.0],
    ohp: [0.35, 0.55, 0.8, 1.05, 1.35],
  },
  female: {
    squat: [0.5, 0.75, 1.25, 1.5, 2.0],
    bench: [0.25, 0.5, 0.75, 1.0, 1.5],
    deadlift: [0.5, 1.0, 1.25, 1.75, 2.5],
    ohp: [0.2, 0.35, 0.5, 0.75, 1.0],
  },
}

const REFERENCE_BW: Record<Sex, number> = { male: 80, female: 60 }

/**
 * Strength scales with body mass^(2/3) (muscle cross-section vs. volume), so a
 * heavier lifter's standards grow less than linearly.
 */
export function standardKg(sex: Sex, lift: MainLift, level: number, bodyweight: number): number {
  const ref = REFERENCE_BW[sex]
  return STANDARDS[sex][lift][level] * ref * Math.pow(bodyweight / ref, 2 / 3)
}

export function classify(sex: Sex, lift: MainLift, e1rm: number, bodyweight: number) {
  const thresholds = LEVELS.map((_, i) => standardKg(sex, lift, i, bodyweight))
  let idx = -1
  thresholds.forEach((t, i) => {
    if (e1rm >= t) idx = i
  })
  const next = idx + 1 < thresholds.length ? thresholds[idx + 1] : null
  const prev = idx >= 0 ? thresholds[idx] : 0
  const progress = next == null ? 1 : clamp((e1rm - prev) / (next - prev), 0, 1)
  return {
    level: idx >= 0 ? LEVELS[idx] : ("Untrained" as const),
    levelIndex: idx,
    nextLevel: idx + 1 < LEVELS.length ? LEVELS[idx + 1] : null,
    nextKg: next,
    progress,
    thresholds,
    ratio: e1rm / bodyweight,
  }
}

/** Identify the barbell competition lifts from Strong exercise names. */
export function mainLiftOf(exercise: string): MainLift | null {
  const n = exercise.toLowerCase()
  if (!/barbell/.test(n) && !/^(squat|deadlift|bench press|overhead press)$/.test(n)) return null
  if (/incline|decline|close|paused|floor|pin|box|front|split|romanian|stiff|sumo|deficit|rack/.test(n)) return null
  if (/^(back\s+)?squat/.test(n)) return "squat"
  if (/^bench press/.test(n)) return "bench"
  if (/^deadlift/.test(n)) return "deadlift"
  if (/^(overhead|military|strict) press/.test(n)) return "ohp"
  return null
}

/**
 * Realistic drug-free potential for a lift: a bit beyond the "advanced"
 * standard, scaled by bodyweight and age.
 */
export function liftCeilingKg(sex: Sex, lift: MainLift, bodyweight: number, age: number): number {
  const advanced = standardKg(sex, lift, 3, bodyweight)
  const elite = standardKg(sex, lift, 4, bodyweight)
  return (advanced + (elite - advanced) * 0.4) * ageCeilingFactor(age)
}

/** Headroom above current best for exercises without published standards. */
export function genericHeadroom(trainingYears: number, age: number): number {
  return (0.5 * Math.exp(-trainingYears / 2.5) + 0.1) * ageCeilingFactor(age)
}

/** DOTS score — bodyweight-adjusted powerlifting total (IPF, 2019). */
export function dots(sex: Sex, totalKg: number, bodyweight: number): number {
  const c =
    sex === "male"
      ? [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076]
      : [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288]
  const bw = clamp(bodyweight, 40, sex === "male" ? 210 : 150)
  const denom = c[0] * bw ** 4 + c[1] * bw ** 3 + c[2] * bw ** 2 + c[3] * bw + c[4]
  return (totalKg * 500) / denom
}

// ---------------------------------------------------------------------------
// Bodyweight
// ---------------------------------------------------------------------------

/** Expected weekly bodyweight change as a fraction, from the energy-balance setting. */
export const WEEKLY_BW_CHANGE: Record<NutritionState, number> = {
  deficit: -0.005,
  maintenance: 0,
  surplus: 0.0025,
}

/** Bodyweight on a date: nearest logged entry at or before it, else the profile value. */
export function bodyweightAt(profile: Profile) {
  const log = [...profile.bodyweightLog].sort((a, b) => a.date.localeCompare(b.date))
  return (date: Date): number => {
    let bw = log[0]?.kg ?? profile.bodyweightKg
    const key = dayKey(date)
    for (const e of log) {
      if (e.date <= key) bw = e.kg
      else break
    }
    return bw || profile.bodyweightKg
  }
}
