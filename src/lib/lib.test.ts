import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildExerciseSessions,
  buildWorkouts,
  detectPlateaus,
  findPersonalRecords,
  overviewStats,
} from "./analysis"
import { acuteChronic, dailyLoads, fitnessFatigue, readiness } from "./models/load"
import { DEFAULT_PROFILE, bodyweightAt, classify, dots, mainLiftOf } from "./models/physiology"
import { detrainingFraction, forecastStrength, weeksToTarget } from "./models/strength"
import { personalLandmarks, planVolume } from "./models/volume"
import { muscleGroupFor } from "./muscles"
import { estimateOneRepMax } from "./one-rep-max"
import { parseStrongCsv } from "./strong"
import type { ExerciseSession } from "./types"

const csv = readFileSync(new URL("../../public/sample-strong.csv", import.meta.url), "utf8")
const rows = parseStrongCsv(csv, bodyweightAt(DEFAULT_PROFILE))

describe("parsing", () => {
  it("reads the Strong sample export", () => {
    expect(rows.length).toBe(384)
    expect(rows[0].exercise).toBe("Chest Dip")
    expect(rows[0].date.getFullYear()).toBe(2023)
  })

  it("adds bodyweight to bodyweight movements", () => {
    const dip = rows.find((r) => r.exercise === "Chest Dip")!
    expect(dip.weight).toBe(0)
    expect(dip.effectiveLoad).toBeCloseTo(80 * 0.92)
  })

  it("rejects files that aren't Strong exports", () => {
    expect(() => parseStrongCsv("a,b\n1,2")).toThrow(/Strong export/)
  })

  it("handles comma-delimited exports in lbs", () => {
    const parsed = parseStrongCsv(
      'Date,Workout Name,Exercise Name,Set Order,Weight (lbs),Reps\n2024-01-01 10:00:00,A,Squat (Barbell),1,225,5',
    )
    expect(parsed[0].weight).toBeCloseTo(102.06, 1)
  })
})

describe("muscle mapping", () => {
  it.each([
    ["Bench Press (Barbell)", "Chest"],
    ["Seated Row (Cable)", "Back"],
    ["Squat (Barbell)", "Legs"],
    ["Arnold Press (Dumbbell)", "Shoulders"],
    ["Bicep Curl (Dumbbell)", "Arms"],
    ["Toes To Bar", "Core"],
    ["Running (Treadmill)", "Cardio"],
    ["Lateral Glute Kickback (Cable)", "Legs"],
    ["Knee Raise (Captain's Chair)", "Core"],
    ["Torso Rotation (Cable)", "Core"],
  ])("%s → %s", (name, group) => {
    expect(muscleGroupFor(name)).toBe(group)
  })
})

describe("one-rep max", () => {
  it("uses Brzycki up to 10 reps and accounts for RPE", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(112.5)
    expect(estimateOneRepMax(100, 5, 8)).toBeCloseTo(estimateOneRepMax(100, 7))
    expect(estimateOneRepMax(50, 25)).toBe(0)
  })
})

describe("analysis", () => {
  const workouts = buildWorkouts(rows)
  const sessions = buildExerciseSessions(rows)
  const prs = findPersonalRecords(sessions, rows)

  it("groups sets into workouts", () => {
    expect(workouts.length).toBe(23)
    const stats = overviewStats(workouts, prs)
    expect(stats.sets).toBe(384)
    expect(stats.avgDurationMin).toBeGreaterThan(30)
  })

  it("never counts an exercise's first session as a PR", () => {
    for (const [exercise, list] of sessions) {
      expect(prs.some((p) => p.exercise === exercise && p.date.getTime() === list[0].date.getTime())).toBe(false)
    }
  })

  it("detects plateaus", () => {
    const flat = [100, 100, 99, 100, 105].map(
      (v, i) => ({ bestE1rm: v, topWeight: v, date: new Date(2024, 0, i + 1) }) as ExerciseSession,
    )
    expect(detectPlateaus(flat, 4)).toEqual([expect.objectContaining({ sessions: 4, value: 100 })])
  })
})

describe("physiology", () => {
  it("classifies lifts against bodyweight-scaled standards", () => {
    expect(classify("male", "bench", 100, 80).level).toBe("Intermediate")
    expect(classify("male", "bench", 30, 80).level).toBe("Untrained")
  })

  it("computes DOTS", () => {
    expect(dots("male", 600, 83)).toBeCloseTo(403, -1)
  })

  it("recognises main lifts", () => {
    expect(mainLiftOf("Bench Press (Barbell)")).toBe("bench")
    expect(mainLiftOf("Incline Bench Press (Barbell)")).toBeNull()
    expect(mainLiftOf("Deadlift (Barbell)")).toBe("deadlift")
    expect(mainLiftOf("Romanian Deadlift (Barbell)")).toBeNull()
  })
})

describe("strength forecast", () => {
  const sessions = buildExerciseSessions(rows)
  const bench = sessions.get("Bench Press (Barbell)")!
  const asOf = bench.at(-1)!.date

  it("forecasts upward with diminishing returns below the ceiling", () => {
    const f = forecastStrength(bench, { profile: DEFAULT_PROFILE, horizonWeeks: 12, today: asOf })!
    expect(f).not.toBeNull()
    const exp = f.forecast.map((p) => p.expected)
    expect(exp.at(-1)!).toBeGreaterThan(exp[0])
    expect(exp.at(-1)!).toBeLessThan(f.ceiling)
    const firstGain = exp[1] - exp[0]
    const lastGain = exp.at(-1)! - exp.at(-2)!
    expect(lastGain).toBeLessThan(firstGain)
    expect(f.forecast.every((p) => p.lower <= p.expected && p.expected <= p.upper)).toBe(true)
  })

  it("responds to health inputs", () => {
    const good = forecastStrength(bench, { profile: DEFAULT_PROFILE, horizonWeeks: 12, today: asOf })!
    const poor = forecastStrength(bench, {
      profile: DEFAULT_PROFILE,
      horizonWeeks: 12,
      today: asOf,
      scenario: { sleepHours: 5, stress: 5, nutrition: "deficit" },
    })!
    expect(poor.forecast.at(-1)!.expected).toBeLessThan(good.forecast.at(-1)!.expected)
  })

  it("applies detraining after a long layoff", () => {
    expect(detrainingFraction(14)).toBe(0)
    expect(detrainingFraction(70)).toBeGreaterThan(0)
    const later = new Date(asOf.getTime() + 120 * 86_400_000)
    const f = forecastStrength(bench, { profile: DEFAULT_PROFILE, horizonWeeks: 4, today: later })!
    expect(f.detrainingPct).toBeGreaterThan(0)
  })

  it("solves time to a target", () => {
    const f = forecastStrength(bench, { profile: DEFAULT_PROFILE, horizonWeeks: 12, today: asOf })!
    expect(weeksToTarget(f, f.current - 1)).toBe(0)
    expect(weeksToTarget(f, f.ceiling * 2)).toBeNull()
    expect(weeksToTarget(f, (f.current + f.ceiling) / 2)).toBeGreaterThan(0)
  })
})

describe("volume and load", () => {
  it("scales MRV with recovery", () => {
    const good = personalLandmarks("Chest", DEFAULT_PROFILE, 2)!
    const poor = personalLandmarks("Chest", { ...DEFAULT_PROFILE, sleepHours: 5, stress: 5 }, 2)!
    expect(poor.mrv).toBeLessThan(good.mrv)
    const plan = planVolume(10, good, 10)
    expect(plan.filter((w) => w.deload).length).toBe(2)
    expect(Math.max(...plan.map((w) => w.sets))).toBeLessThanOrEqual(good.mrv)
  })

  it("computes fitness/fatigue, ACWR and readiness", () => {
    const loads = dailyLoads(rows)
    const last = rows.at(-1)!.date
    const ff = fitnessFatigue(loads, 14, "rest", last)
    expect(ff.at(-1)!.fatigue).toBeLessThan(ff.find((p) => p.projected)!.fatigue)
    const acwr = acuteChronic(loads, last)
    expect(acwr.at(-1)!.ratio).not.toBeNull()
    const r = readiness(ff.filter((p) => !p.projected).at(-1), DEFAULT_PROFILE)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })
})
