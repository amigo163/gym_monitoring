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
import { detrainingFraction, forecastStrength, recencyWeights, weeksToTarget } from "./models/strength"
import { personalLandmarks, planVolume } from "./models/volume"
import { planNextSession } from "./models/next-session"
import { muscleGroupFor, setMuscleOverrides } from "./muscles"
import { estimateOneRepMax } from "./one-rep-max"
import { parseStrongCsv } from "./strong"
import { fmtDuration, fmtMetric, inferTrackingKind } from "./tracking"
import type { ExerciseGoal, ExerciseSession, SetRow } from "./types"

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
    ["Chin Up", "Back"],
    ["Hypopressives", "Core"],
    ["Steering Wheel", "Shoulders"],
    ["Straight Leg Deadlift", "Legs"],
    ["Romanian Deadlift (Barbell)", "Legs"],
    ["Deadlift (Barbell)", "Back"],
    ["Face Pull (Cable)", "Shoulders"],
    ["Reverse Fly (Dumbbell)", "Shoulders"],
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
      (v, i) => ({ bestE1rm: v, topWeight: v, primary: v, date: new Date(2024, 0, i + 1) }) as ExerciseSession,
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

  it("weights recent sessions most", () => {
    // An old session, then weekly training for 30 weeks.
    const ts = [0, ...Array.from({ length: 31 }, (_, i) => 70 + i)]
    const { weights, halfLifeWeeks } = recencyWeights(ts)
    expect(halfLifeWeeks).toBe(12)
    expect(weights.at(-1)).toBe(1)
    expect(weights[ts.indexOf(88)]).toBeCloseTo(0.5)
    expect(weights[0]).toBeLessThan(0.01)
  })

  it("stretches the half-life for rarely trained exercises", () => {
    const ts = [0, 30, 60, 90, 120, 150, 180, 210]
    const { weights, halfLifeWeeks } = recencyWeights(ts)
    expect(halfLifeWeeks).toBeGreaterThan(12)
    expect(weights.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(6)
  })

  it("follows recent sessions over an old peak", () => {
    const at = (week: number) => new Date(2023, 0, 2 + week * 7)
    // Strong two years ago, a long break, then a lower but rising restart.
    const old = [0, 1, 2, 3, 4, 5].map((w) => ({ date: at(w), value: 100 + w }))
    const recent = [100, 101, 102, 103, 104, 105, 106, 107].map((w, i) => ({ date: at(w), value: 70 + i * 1.5 }))
    const series = [...old, ...recent].map(({ date, value }) => ({ ...bench[0], date, bestE1rm: value, workoutId: String(date.getTime()) }))
    const f = forecastStrength(series, { profile: DEFAULT_PROFILE, horizonWeeks: 4, today: at(107) })!
    expect(f.current).toBeLessThan(85)
    expect(f.effectiveSessions).toBeLessThan(series.length)
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

describe("next session", () => {
  const LB = 0.45359237
  const bench = (day: number, sets: [number, number][]): SetRow[] =>
    sets.map(([weight, reps], i) => ({
      workoutId: String(day),
      date: new Date(2024, 0, day, 18),
      workoutName: "Push",
      durationSec: 3600,
      exercise: "Bench Press (Barbell)",
      setOrder: i + 1,
      isWarmup: false,
      weight,
      reps,
      rpe: null,
      distanceM: null,
      seconds: null,
      notes: "",
      muscle: "Chest",
      effectiveLoad: weight,
      e1rm: estimateOneRepMax(weight, reps),
      volume: weight * reps,
    }))
  const plan = (rows: SetRow[], asOf: Date, goal: Partial<ExerciseGoal> | null = null) =>
    planNextSession({
      exercise: "Bench Press (Barbell)",
      rows,
      sessions: buildExerciseSessions(rows).get("Bench Press (Barbell)")!,
      profile: DEFAULT_PROFILE,
      asOf,
      goal: goal && { exercise: "Bench Press (Barbell)", target: null, start: null, repRange: null, deadline: null, updatedAt: "", ...goal },
    })!

  it("adds weight once every top set hits the usual reps", () => {
    const w = 135 * LB
    const rows = [...bench(1, [[w, 8], [w, 7], [w, 7]]), ...bench(4, [[w, 8], [w, 8], [w, 8]])]
    const p = plan(rows, new Date(2024, 0, 5, 12))
    expect(p.action).toBe("add-weight")
    // Plates go up 5 lb, since Strong data is always logged in pounds.
    expect(p.target.weight / LB).toBeCloseTo(140)
    expect(p.target).toMatchObject({ reps: 8, sets: 3, seconds: null })
    expect(p.typicalGapDays).toBe(3)
  })

  it("adds a rep when the last session fell short", () => {
    const rows = [...bench(1, [[60, 8], [60, 8]]), ...bench(4, [[62.5, 8], [62.5, 6]])]
    const p = plan(rows, new Date(2024, 0, 5, 12))
    expect(p.action).toBe("add-reps")
    expect(p.target).toEqual({ weight: 62.5, reps: 7, sets: 2, seconds: null })
  })

  it("waits for the muscle to recover and follows your usual gap", () => {
    const rows = [...bench(1, [[60, 8]]), ...bench(4, [[60, 8]])]
    expect(plan(rows, new Date(2024, 0, 5, 12)).status).toBe("upcoming")
    expect(plan(rows, new Date(2024, 0, 7, 20)).status).toBe("due")
    expect(plan(rows, new Date(2024, 0, 12, 20)).status).toBe("overdue")
  })

  it("flags recovery only when it delays a session that is due", () => {
    // Daily bench: due the next day, but chest needs ~52 h.
    const rows = [...bench(1, [[60, 8]]), ...bench(2, [[60, 8]]), ...bench(3, [[60, 8]])]
    expect(plan(rows, new Date(2024, 0, 4, 12)).status).toBe("recovering")
  })

  it("eases back in after a layoff", () => {
    const rows = [...bench(1, [[100, 5]]), ...bench(4, [[100, 5]])]
    const p = plan(rows, new Date(2024, 1, 20))
    expect(p.action).toBe("ease-back")
    expect(p.target.weight).toBeLessThan(100)
  })

  it("builds reps through the goal's range before adding weight", () => {
    const rows = [...bench(1, [[60, 6], [60, 6]]), ...bench(4, [[60, 6], [60, 6]])]
    const asOf = new Date(2024, 0, 5, 12)
    // Without a range, 6 is the usual rep count, so it's time for more weight.
    expect(plan(rows, asOf).action).toBe("add-weight")
    const p = plan(rows, asOf, { repRange: { min: 5, max: 8 } })
    expect(p.action).toBe("add-reps")
    expect(p.target).toEqual({ weight: 60, reps: 7, sets: 2, seconds: null })
    expect(p.repRangeFromGoal).toBe(true)
  })

  it("adds weight and drops to the bottom of the range at the top", () => {
    const w = 135 * LB
    const rows = [...bench(1, [[w, 8], [w, 8]]), ...bench(4, [[w, 8], [w, 8]])]
    const p = plan(rows, new Date(2024, 0, 5, 12), { repRange: { min: 5, max: 8 } })
    expect(p.action).toBe("add-weight")
    expect(p.target.weight / LB).toBeCloseTo(140)
    expect(p.target).toMatchObject({ reps: 5, sets: 2, seconds: null })
  })

  it("re-weights sets well outside a new rep range", () => {
    const rows = [...bench(1, [[50, 12], [50, 12]]), ...bench(4, [[50, 12], [50, 12]])]
    const p = plan(rows, new Date(2024, 0, 5, 12), { repRange: { min: 3, max: 5 } })
    expect(p.action).toBe("adjust")
    expect(p.target.reps).toBe(3)
    expect(p.target.weight).toBeGreaterThan(50)
    // Heavier, but still below a true 3-rep max.
    expect(p.targetE1rm).toBeLessThan(estimateOneRepMax(50, 12))
  })

  it("reports progress towards a target 1RM", () => {
    const rows = [...bench(1, [[60, 8], [60, 8]]), ...bench(4, [[60, 8], [60, 8]])]
    const p = plan(rows, new Date(2024, 0, 5, 12), { target: 100, start: 70 })
    expect(p.goal?.target).toBe(100)
    // Measured from where you are now (best e1RM last session), not from the planned target.
    expect(p.goal?.progress).toBeCloseTo((estimateOneRepMax(60, 8) - 70) / 30)
    expect(plan(rows, new Date(2024, 0, 5, 12)).goal).toBeNull()
  })

  it("suggests lower reps for a 1RM goal trained with high reps", () => {
    const rows = [...bench(1, [[50, 12]]), ...bench(4, [[50, 12]])]
    expect(plan(rows, new Date(2024, 0, 5, 12), { target: 100 }).note).toMatch(/3–6/)
    expect(plan(rows, new Date(2024, 0, 5, 12), { target: 100, repRange: { min: 10, max: 12 } }).note).toBeNull()
  })
})

describe("user overrides", () => {
  it("win over the automatic muscle group until cleared", () => {
    setMuscleOverrides(new Map([["Toes To Bar", "Other"]]))
    expect(muscleGroupFor("Toes To Bar")).toBe("Other")
    setMuscleOverrides(new Map())
    expect(muscleGroupFor("Toes To Bar")).toBe("Core")
  })
})

/** Working sets for one exercise, one workout per `day` of January 2024. */
function setsOf(exercise: string, days: [day: number, sets: Partial<SetRow>[]][]): SetRow[] {
  return days.flatMap(([day, sets]) =>
    sets.map((s, i) => {
      const weight = s.weight ?? 0
      const reps = s.reps ?? 0
      return {
        workoutId: `w${day}`,
        date: new Date(2024, 0, day, 18),
        workoutName: "Workout",
        durationSec: 3600,
        exercise,
        setOrder: i + 1,
        isWarmup: false,
        weight,
        reps,
        rpe: null,
        distanceM: null,
        seconds: null,
        notes: "",
        muscle: muscleGroupFor(exercise),
        effectiveLoad: weight,
        e1rm: estimateOneRepMax(weight, reps),
        volume: weight * reps,
        ...s,
      }
    }),
  )
}

describe("tracking kinds", () => {
  it("infers what each exercise is measured by", () => {
    expect(inferTrackingKind(setsOf("Plank", [[1, [{ seconds: 60 }, { seconds: 45 }]]]))).toBe("time")
    expect(inferTrackingKind(setsOf("Toes To Bar", [[1, [{ reps: 10 }, { reps: 8 }]]]))).toBe("reps")
    expect(inferTrackingKind(setsOf("Running (Treadmill)", [[1, [{ distanceM: 4000, seconds: 1200 }]]]))).toBe("distance")
    expect(inferTrackingKind(setsOf("Bench Press (Barbell)", [[1, [{ weight: 60, reps: 8 }]]]))).toBe("weight")
    // Bodyweight lifts keep an est. 1RM that includes your bodyweight.
    expect(inferTrackingKind(setsOf("Pull Up", [[1, [{ reps: 8 }]]]))).toBe("weight")
    // Mostly bodyweight, with the odd weighted set: still rep-based.
    expect(inferTrackingKind(setsOf("Knee Raise (Captain's Chair)", [[1, [{ reps: 12 }, { reps: 12 }, { reps: 10, weight: 5 }]]]))).toBe("reps")
  })

  it("infers kinds for sessions built without them", () => {
    const sessions = buildExerciseSessions(setsOf("Plank", [[1, [{ seconds: 60 }]]]))
    expect(sessions.get("Plank")![0]).toMatchObject({ kind: "time", bestSeconds: 60, primary: 60 })
  })

  it("records the longest hold for timed exercises", () => {
    const rows = setsOf("Plank", [
      [1, [{ seconds: 60 }, { seconds: 45 }]],
      [3, [{ seconds: 75 }, { seconds: 50 }]],
      [5, [{ seconds: 70 }]],
    ])
    const prs = findPersonalRecords(buildExerciseSessions(rows), rows)
    expect(prs.filter((p) => p.primary).map((p) => [p.kind, p.value, p.previous])).toEqual([["duration", 75, 60]])
    expect(prs.find((p) => p.kind === "totalDuration")?.value).toBe(125)
  })

  it("records the most reps for rep-based exercises", () => {
    const rows = setsOf("Toes To Bar", [
      [1, [{ reps: 10 }, { reps: 8 }]],
      [3, [{ reps: 12 }, { reps: 9 }]],
    ])
    const sessions = buildExerciseSessions(rows)
    expect(sessions.get("Toes To Bar")![1]).toMatchObject({ kind: "reps", bestReps: 12, reps: 21, primary: 12 })
    const prs = findPersonalRecords(sessions, rows)
    expect(prs.find((p) => p.primary)).toMatchObject({ kind: "reps", value: 12, previous: 10, reps: 12 })
  })

  it("counts a faster pace as a record", () => {
    const rows = setsOf("Running (Treadmill)", [
      [1, [{ distanceM: 4000, seconds: 1440 }]],
      [3, [{ distanceM: 4000, seconds: 1320 }]],
    ])
    const prs = findPersonalRecords(buildExerciseSessions(rows), rows)
    expect(prs.find((p) => p.kind === "pace")).toMatchObject({ value: 330, previous: 360 })
  })

  it("formats values with their units", () => {
    expect(fmtDuration(75)).toBe("1:15")
    expect(fmtDuration(3725)).toBe("1:02:05")
    expect(fmtMetric("pace", 330)).toBe("5:30 /km")
    expect(fmtMetric("reps", 12)).toBe("12 reps")
  })

  it("forecasts max reps for rep-based exercises", () => {
    const rows = setsOf(
      "Toes To Bar",
      [8, 9, 9, 10, 11, 11, 12].map((reps, i): [number, Partial<SetRow>[]] => [1 + i * 4, [{ reps }]]),
    )
    const f = forecastStrength(buildExerciseSessions(rows).get("Toes To Bar")!, {
      profile: DEFAULT_PROFILE,
      horizonWeeks: 8,
      today: new Date(2024, 0, 26),
    })!
    expect(f.metric).toBe("reps")
    expect(f.mainLift).toBeNull()
    expect(f.history.map((h) => h.value)).toEqual([8, 9, 9, 10, 11, 11, 12])
    expect(f.forecast.at(-1)!.expected).toBeGreaterThan(f.current)
    expect(f.ceiling).toBeGreaterThan(12)
  })

  it("doesn't forecast distance work", () => {
    const rows = setsOf("Running", [
      [1, [{ distanceM: 4000, seconds: 1440 }]],
      [3, [{ distanceM: 5000, seconds: 1800 }]],
    ])
    expect(forecastStrength(buildExerciseSessions(rows).get("Running")!, { profile: DEFAULT_PROFILE, horizonWeeks: 4 })).toBeNull()
  })

  it("counts timed holds towards training load, but not stretching", () => {
    const plank = setsOf("Plank", [[1, [{ seconds: 60 }]]])
    const stretch = setsOf("Stretching", [[1, [{ seconds: 600 }]]])
    expect(dailyLoads(plank).get("2024-01-01")).toBeGreaterThan(0)
    expect(dailyLoads(stretch).get("2024-01-01")).toBe(0)
  })
})

describe("next session for reps and holds", () => {
  const planFor = (exercise: string, rows: SetRow[], asOf: Date, goal: Partial<ExerciseGoal> | null = null) =>
    planNextSession({
      exercise,
      rows,
      sessions: buildExerciseSessions(rows).get(exercise)!,
      profile: DEFAULT_PROFILE,
      asOf,
      goal: goal && { exercise, target: null, start: null, repRange: null, deadline: null, updatedAt: "", ...goal },
    })

  it("adds time to every hold", () => {
    const rows = setsOf("Plank", [
      [1, [{ seconds: 60 }, { seconds: 60 }]],
      [4, [{ seconds: 60 }, { seconds: 50 }]],
    ])
    const p = planFor("Plank", rows, new Date(2024, 0, 6, 12))!
    expect(p.kind).toBe("time")
    expect(p.action).toBe("add-time")
    // From the shortest hold, 0:50 → 1:00.
    expect(p.target).toEqual({ weight: 0, reps: 0, sets: 2, seconds: 60 })
    expect(p.isPr).toBe(false)
    expect(p.lastSets.map((s) => s.seconds)).toEqual([60, 50])
  })

  it("suggests a harder variation past three minutes", () => {
    const rows = setsOf("Plank", [[1, [{ seconds: 200 }]], [4, [{ seconds: 190 }]]])
    const p = planFor("Plank", rows, new Date(2024, 0, 6, 12))!
    expect(p.action).toBe("repeat")
    expect(p.reason).toMatch(/harder/)
  })

  it("measures goal progress for holds in seconds", () => {
    const rows = setsOf("Plank", [[1, [{ seconds: 60 }]], [4, [{ seconds: 70 }]]])
    const p = planFor("Plank", rows, new Date(2024, 0, 6, 12), { target: 120, start: 60 })!
    expect(p.targetValue).toBe(80)
    expect(p.goal).toEqual({ target: 120, start: 60, progress: expect.closeTo(10 / 60) })
  })

  it("adds reps for rep-based exercises and flags rep PRs", () => {
    const rows = setsOf("Toes To Bar", [[1, [{ reps: 10 }, { reps: 10 }]], [4, [{ reps: 10 }, { reps: 9 }]]])
    const p = planFor("Toes To Bar", rows, new Date(2024, 0, 6, 12))!
    expect(p.kind).toBe("reps")
    expect(p.action).toBe("add-reps")
    expect(p.target).toMatchObject({ weight: 0, reps: 10, sets: 2 })
    expect(p.targetValue).toBe(10)
    expect(p.isPr).toBe(false)
  })

  it("skips stretching and cardio", () => {
    expect(planFor("Stretching", setsOf("Stretching", [[1, [{ seconds: 600 }]]]), new Date(2024, 0, 3))).toBeNull()
    expect(planFor("Cycling (Indoor)", setsOf("Cycling (Indoor)", [[1, [{ seconds: 1200 }]]]), new Date(2024, 0, 3))).toBeNull()
  })
})
