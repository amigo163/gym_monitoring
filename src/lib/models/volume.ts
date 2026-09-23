import { addDays, startOfWeek } from "../dates"
import type { MuscleGroup, Profile } from "../types"
import { type Factor, clamp, combine, recoveryFactors } from "./physiology"

/**
 * Weekly hard-set landmarks (Israetel / Renaissance Periodization):
 * MEV = minimum effective volume, MAV = most productive range,
 * MRV = maximum recoverable volume.
 */
export interface VolumeLandmarks {
  mev: number
  mavLow: number
  mavHigh: number
  mrv: number
}

const BASE_LANDMARKS: Partial<Record<MuscleGroup, VolumeLandmarks>> = {
  Chest: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  Back: { mev: 10, mavLow: 14, mavHigh: 22, mrv: 25 },
  Legs: { mev: 12, mavLow: 16, mavHigh: 26, mrv: 30 },
  Shoulders: { mev: 8, mavLow: 16, mavHigh: 22, mrv: 26 },
  Arms: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 26 },
  Core: { mev: 0, mavLow: 16, mavHigh: 20, mrv: 25 },
}

export const VOLUME_GROUPS = Object.keys(BASE_LANDMARKS) as MuscleGroup[]

/**
 * Personal landmarks. Recovery capacity (sleep, stress, diet, protein, age)
 * scales MRV and the top of MAV; experienced lifters need more volume to grow,
 * so MEV rises with training age.
 */
export function personalLandmarks(muscle: MuscleGroup, profile: Profile, trainingYears: number): VolumeLandmarks | null {
  const base = BASE_LANDMARKS[muscle]
  if (!base) return null
  const recovery = clamp(combine(recoveryFactors(profile)), 0.55, 1.1)
  // Map the multiplier's 0.55…1 range onto 0.7…1 for MRV so bad recovery doesn't zero it out.
  const mrvScale = 0.7 + (recovery - 0.55) * (0.3 / 0.45)
  const mevScale = trainingYears < 1 ? 0.8 : trainingYears < 3 ? 1 : 1.2
  const mrv = Math.round(base.mrv * mrvScale)
  const mev = Math.round(base.mev * mevScale)
  const mavHigh = Math.min(Math.round(base.mavHigh * mrvScale), mrv - 1)
  const mavLow = Math.min(Math.max(Math.round(base.mavLow * mevScale), mev + 1), mavHigh)
  return { mev, mavLow, mavHigh, mrv }
}

/** How productive current weekly volume is for gains (dose-response, Schoenfeld 2017). */
export function volumeFactor(weeklySets: number, lm: VolumeLandmarks): Factor {
  let value: number
  let detail: string
  if (weeklySets < lm.mev) {
    value = clamp(0.5 + 0.5 * (weeklySets / Math.max(lm.mev, 1)), 0.5, 1)
    detail = `${weeklySets.toFixed(1)} sets/wk — below MEV (${lm.mev})`
  } else if (weeklySets <= lm.mavHigh) {
    value = 1
    detail = `${weeklySets.toFixed(1)} sets/wk — productive range`
  } else if (weeklySets <= lm.mrv) {
    value = 0.95
    detail = `${weeklySets.toFixed(1)} sets/wk — near MRV (${lm.mrv})`
  } else {
    value = 0.75
    detail = `${weeklySets.toFixed(1)} sets/wk — above MRV, recovery limited`
  }
  return { key: "volume", label: "Weekly volume", value, detail }
}

export interface PlanWeek {
  date: Date
  week: number
  sets: number
  deload: boolean
}

/**
 * Mesocycle projection: start at the productive end of recent volume, add sets
 * each week toward MRV, deload every `mesoLength` weeks, then restart a little
 * higher (the lifter has adapted).
 */
export function planVolume(
  currentSets: number,
  lm: VolumeLandmarks,
  weeks: number,
  from = new Date(),
  mesoLength = 5,
): PlanWeek[] {
  const plan: PlanWeek[] = []
  const step = lm.mrv >= 25 ? 2 : 1
  let start = clamp(Math.round(currentSets), lm.mev, lm.mavHigh)
  const weekStart = startOfWeek(addDays(from, 7))
  for (let w = 0; w < weeks; w++) {
    const inMeso = w % mesoLength
    if (w > 0 && inMeso === 0) start = Math.min(start + 1, lm.mavHigh)
    const deload = inMeso === mesoLength - 1
    const sets = deload ? Math.round(Math.max(lm.mev, start) / 2) : Math.min(start + inMeso * step, lm.mrv)
    plan.push({ date: addDays(weekStart, w * 7), week: w + 1, sets, deload })
  }
  return plan
}

export interface TonnagePoint {
  date: Date
  actual: number | null
  projected: number | null
}

/**
 * Weekly tonnage projection = planned sets × typical reps × working load, with
 * the working load growing at the forecast strength growth rate.
 */
export function projectTonnage(
  history: { date: Date; volume: number; sets: number; reps: number }[],
  plannedSets: number[],
  weeklyStrengthGrowth: number,
): TonnagePoint[] {
  const recent = history.filter((h) => h.sets > 0).slice(-6)
  const out: TonnagePoint[] = history.map((h) => ({ date: h.date, actual: h.volume, projected: null }))
  if (!recent.length || !history.length) return out
  const repsPerSet = recent.reduce((a, h) => a + h.reps, 0) / recent.reduce((a, h) => a + h.sets, 0)
  const loadPerRep = recent.reduce((a, h) => a + h.volume, 0) / recent.reduce((a, h) => a + h.reps, 0)
  const last = out.at(-1)!
  last.projected = last.actual
  let load = loadPerRep
  plannedSets.forEach((sets, i) => {
    load *= 1 + weeklyStrengthGrowth
    out.push({ date: addDays(history.at(-1)!.date, (i + 1) * 7), actual: null, projected: sets * repsPerSet * load })
  })
  return out
}
