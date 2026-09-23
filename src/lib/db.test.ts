import "fake-indexeddb/auto"
import { openDB } from "idb"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  clearWorkouts,
  importSets,
  lastImport,
  loadExerciseSettings,
  loadGoalHistory,
  loadGoals,
  loadProfile,
  loadProfileHistory,
  loadSets,
  openGymDb,
  planImport,
  saveExerciseSettings,
  saveGoal,
  saveProfile,
} from "./db"
import { DEFAULT_PROFILE } from "./models/physiology"
import { parseStrongExport } from "./strong"

const HEADER = "Date;Workout Name;Exercise Name;Set Order;Weight (kg);Reps"
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n")

const monday = [
  "2024-01-01 10:00:00;Push;Bench Press (Barbell);1;80;5",
  "2024-01-01 10:00:00;Push;Bench Press (Barbell);2;80;5",
]
const wednesday = ["2024-01-03 10:00:00;Pull;Deadlift (Barbell);1;140;3"]
const friday = ["2024-01-05 10:00:00;Legs;Squat (Barbell);1;120;5"]

let dbCount = 0
const freshDb = () => openGymDb(`test-${dbCount++}`)

describe("parseStrongExport keys", () => {
  it("are identical across parses of the same export", () => {
    const a = parseStrongExport(csv(...monday, ...wednesday))
    const b = parseStrongExport(csv(...monday, ...wednesday))
    expect(a.map((s) => s.key)).toEqual(b.map((s) => s.key))
    expect(new Set(a.map((s) => s.key)).size).toBe(a.length)
  })

  it("stay unique when an exercise repeats within a workout", () => {
    const sets = parseStrongExport(csv(...monday, "2024-01-01 10:00:00;Push;Bench Press (Barbell);1;60;10"))
    expect(new Set(sets.map((s) => s.key)).size).toBe(3)
  })
})

describe("planImport", () => {
  const first = parseStrongExport(csv(...monday, ...wednesday))

  it("adds everything into an empty store", () => {
    const plan = planImport([], first)
    expect(plan.put).toHaveLength(3)
    expect(plan.summary).toMatchObject({ added: 2, updated: 0, unchanged: 0, removed: 0 })
  })

  it("is a no-op for an export that's already stored", () => {
    const plan = planImport(first, parseStrongExport(csv(...monday, ...wednesday)))
    expect(plan.put).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.summary).toMatchObject({ added: 0, updated: 0, unchanged: 2 })
  })

  it("adds only the new workouts from a later export", () => {
    const plan = planImport(first, parseStrongExport(csv(...monday, ...wednesday, ...friday)))
    expect(plan.put.map((s) => s.exercise)).toEqual(["Squat (Barbell)"])
    expect(plan.summary).toMatchObject({ added: 1, unchanged: 2 })
  })

  it("replaces a workout edited in Strong", () => {
    const edited = parseStrongExport(csv(monday[0], "2024-01-01 10:00:00;Push;Bench Press (Barbell);2;82.5;5", ...wednesday))
    const plan = planImport(first, edited)
    expect(plan.put).toHaveLength(1)
    expect(plan.put[0].weightKg).toBe(82.5)
    expect(plan.summary).toMatchObject({ updated: 1, unchanged: 1 })
  })

  it("drops sets deleted from a workout", () => {
    const plan = planImport(first, parseStrongExport(csv(monday[0], ...wednesday)))
    expect(plan.remove).toHaveLength(1)
    expect(plan.summary.updated).toBe(1)
  })

  it("drops workouts deleted within the export's span but keeps older history", () => {
    const stored = parseStrongExport(csv(...monday, ...wednesday, ...friday))
    // A later export that starts after Monday and no longer has Wednesday.
    const plan = planImport(stored, parseStrongExport(csv("2024-01-02 10:00:00;Push;Bench Press (Barbell);1;80;5", ...friday)))
    expect(plan.remove).toEqual([parseStrongExport(csv(...wednesday))[0].key])
    expect(plan.summary).toMatchObject({ added: 1, unchanged: 1, removed: 1 })
  })
})

describe("database", () => {
  it("imports idempotently", async () => {
    const db = await freshDb()
    const text = readFileSync(new URL("../../public/sample-strong.csv", import.meta.url), "utf8")
    const first = await importSets(db, parseStrongExport(text), "sample.csv")
    const count = (await loadSets(db)).length
    const second = await importSets(db, parseStrongExport(text), "sample.csv")

    expect(count).toBe(parseStrongExport(text).length)
    expect((await loadSets(db)).length).toBe(count)
    expect(first.summary.added).toBeGreaterThan(0)
    expect(second.summary).toMatchObject({ added: 0, updated: 0, removed: 0 })
    expect((await lastImport(db))?.summary).toEqual(second.summary)
  })

  it("clears workouts but keeps the profile", async () => {
    const db = await freshDb()
    await importSets(db, parseStrongExport(csv(...monday)), "a.csv")
    await saveProfile(db, DEFAULT_PROFILE)
    await clearWorkouts(db)
    expect(await loadSets(db)).toEqual([])
    expect(await lastImport(db)).toBeNull()
    expect(await loadProfile(db)).toEqual(DEFAULT_PROFILE)
  })

  it("keeps one profile snapshot per day", async () => {
    const db = await freshDb()
    await saveProfile(db, { ...DEFAULT_PROFILE, sleepHours: 6 }, new Date(2024, 0, 1, 9))
    await saveProfile(db, { ...DEFAULT_PROFILE, sleepHours: 7 }, new Date(2024, 0, 1, 21))
    await saveProfile(db, { ...DEFAULT_PROFILE, sleepHours: 8 }, new Date(2024, 0, 2, 9))

    const history = await loadProfileHistory(db)
    expect(history.map((h) => [h.date, h.profile.sleepHours])).toEqual([
      ["2024-01-01", 7],
      ["2024-01-02", 8],
    ])
    expect(history[0].profile).not.toHaveProperty("bodyweightLog")
    expect((await loadProfile(db))?.sleepHours).toBe(8)
  })

  it("saves goals with a daily history and removes cleared ones", async () => {
    const db = await freshDb()
    const goal = { exercise: "Bench Press (Barbell)", target: 100, start: 85, repRange: { min: 5, max: 8 }, deadline: "2024-06-01", updatedAt: "" }
    await saveGoal(db, goal.exercise, goal, new Date(2024, 0, 1, 9))
    await saveGoal(db, goal.exercise, { ...goal, target: 105 }, new Date(2024, 0, 1, 21))
    expect(await loadGoals(db)).toEqual([{ ...goal, target: 105 }])

    await saveGoal(db, goal.exercise, null, new Date(2024, 0, 2, 9))
    expect(await loadGoals(db)).toEqual([])
    const history = await loadGoalHistory(db)
    expect(history.map((h) => [h.date, h.target])).toEqual([
      ["2024-01-01", 105],
      ["2024-01-02", null],
    ])
  })

  it("upgrades a version 1 database without losing workouts", async () => {
    const name = `test-${dbCount++}`
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        const sets = db.createObjectStore("sets", { keyPath: "key" })
        sets.createIndex("workoutKey", "workoutKey")
        db.createObjectStore("imports", { keyPath: "id", autoIncrement: true })
        db.createObjectStore("profile")
        db.createObjectStore("profileHistory", { keyPath: "date" })
      },
    })
    const stored = parseStrongExport(csv(...monday))
    await Promise.all(stored.map((s) => v1.put("sets", s)))
    v1.close()

    const db = await openGymDb(name)
    expect(await loadSets(db)).toHaveLength(stored.length)
    expect(await loadGoals(db)).toEqual([])
  })

  it("moves 1RM-only goals to the generic target fields", async () => {
    const name = `test-${dbCount++}`
    const v2 = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore("sets", { keyPath: "key" }).createIndex("workoutKey", "workoutKey")
        db.createObjectStore("imports", { keyPath: "id", autoIncrement: true })
        db.createObjectStore("profile")
        db.createObjectStore("profileHistory", { keyPath: "date" })
        db.createObjectStore("goals", { keyPath: "exercise" })
        db.createObjectStore("goalHistory", { keyPath: ["exercise", "date"] })
      },
    })
    const old = { exercise: "Bench Press (Barbell)", targetE1rm: 100, startE1rm: 85, repRange: null, deadline: null, updatedAt: "" }
    await v2.put("goals", old)
    await v2.put("goalHistory", { ...old, date: "2024-01-01" })
    v2.close()

    const db = await openGymDb(name)
    const expected = { exercise: "Bench Press (Barbell)", target: 100, start: 85, repRange: null, deadline: null, updatedAt: "" }
    expect(await loadGoals(db)).toEqual([expected])
    expect(await loadGoalHistory(db)).toEqual([{ ...expected, date: "2024-01-01" }])
  })

  it("saves exercise corrections and drops ones that override nothing", async () => {
    const db = await freshDb()
    await saveExerciseSettings(db, { exercise: "Chin Up", muscle: "Back", kind: "reps" })
    expect(await loadExerciseSettings(db)).toEqual([{ exercise: "Chin Up", muscle: "Back", kind: "reps" }])
    await saveExerciseSettings(db, { exercise: "Chin Up", muscle: null, kind: null })
    expect(await loadExerciseSettings(db)).toEqual([])
  })
})
