import exerciseMap from "./data/exercise-muscle-map.json"
import type { MuscleGroup } from "./types"

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core",
  "Cardio",
  "Olympic",
  "Compound",
  "Other",
]

/** Groups we train for hypertrophy/strength; used by balance and volume models. */
export const TRAINABLE_GROUPS: MuscleGroup[] = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"]

const PATTERNS: [MuscleGroup, RegExp[]][] = [
  ["Chest", [/bench\s*press/, /push\s*up/, /chest\s*press/, /chest\s*fly/, /incline\s*press/, /decline\s*press/, /\bdip/, /svend\s*press/, /pec\s*deck/, /cable\s*cross/]],
  ["Back", [/deadlift/, /\brow\b/, /pull[\s-]*up/, /lat\s*pull/, /chin[\s-]*up/, /pulldown/, /back\s*extension/, /good\s*morning/, /hyper\s*extension/, /pull\s*over/, /shrug/, /face\s*pull/, /t\s*bar/]],
  ["Legs", [/squat/, /lunge/, /leg\s*press/, /leg\s*extension/, /leg\s*curl/, /calf\s*raise/, /hip\s*thrust/, /glute\s*bridge/, /bulgarian\s*split/, /step\s*up/, /box\s*jump/, /pistol/, /wall\s*sit/, /hip\s*a[bd]duct/]],
  ["Shoulders", [/shoulder\s*press/, /overhead\s*press/, /military\s*press/, /\bohp\b/, /lateral\s*raise/, /front\s*raise/, /rear\s*delt/, /upright\s*row/, /arnold\s*press/, /reverse\s*fly/, /backward\s*raise/]],
  ["Arms", [/curl/, /tricep/, /extension/, /pushdown/, /skull\s*crusher/, /close\s*grip/, /kickback/]],
  ["Core", [/crunch/, /sit[\s-]*up/, /plank/, /\bab\b/, /russian\s*twist/, /leg\s*raise/, /mountain\s*climber/, /hollow\s*hold/, /v[\s-]*up/, /bicycle/, /hanging\s*leg/, /rollout/, /dragon\s*flag/, /toes\s*to\s*bar/]],
  ["Cardio", [/\brun/, /cardio/, /elliptical/, /\bbike/, /cycling/, /treadmill/, /rowing/, /jump\s*rope/, /burpee/, /jumping\s*jack/, /sprint/, /hiit/, /interval/, /stairmaster/, /walk/]],
  ["Olympic", [/clean/, /jerk/, /snatch/, /push\s*press/]],
]

const directMap = new Map(
  Object.entries(exerciseMap as Record<string, MuscleGroup>).map(([k, v]) => [k.toLowerCase(), v]),
)

/** Strip Strong's equipment suffix, e.g. "Bench Press (Barbell)" → "bench press". */
export function baseExerciseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase()
}

const cache = new Map<string, MuscleGroup>()

/** Same lookup order as the original Python app: exact → base name → regex patterns → Other. */
export function muscleGroupFor(exercise: string): MuscleGroup {
  const cached = cache.get(exercise)
  if (cached) return cached
  const lower = exercise.trim().toLowerCase()
  const base = baseExerciseName(exercise)
  let group: MuscleGroup | undefined = directMap.get(lower) ?? directMap.get(base)
  if (!group) {
    for (const [g, patterns] of PATTERNS) {
      if (patterns.some((p) => p.test(lower))) {
        group = g
        break
      }
    }
  }
  group ??= "Other"
  cache.set(exercise, group)
  return group
}

/**
 * Share of bodyweight moved in common bodyweight exercises (from force-plate and
 * kinematic studies, e.g. push-up ≈ 64% BW, dips/pull-ups ≈ BW minus forearms/hands).
 */
const BODYWEIGHT_SHARE: [RegExp, number][] = [
  [/pull[\s-]*up|chin[\s-]*up|muscle[\s-]*up/, 0.95],
  [/\bdip/, 0.92],
  [/push[\s-]*up/, 0.64],
  [/inverted\s*row/, 0.6],
  [/pistol|single\s*leg\s*squat/, 0.85],
]

export function bodyweightShare(exercise: string): number {
  const lower = exercise.toLowerCase()
  if (/assisted/.test(lower)) return 0.95
  for (const [re, share] of BODYWEIGHT_SHARE) if (re.test(lower)) return share
  return 0
}

/** Assisted machines log the assistance as weight, which must be subtracted. */
export function isAssisted(exercise: string): boolean {
  return /assisted/i.test(exercise)
}
