import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { dayKey } from "./dates"
import type { Profile, StoredSet } from "./types"

/** What an import changed, counted in workouts. */
export interface ImportSummary {
  added: number
  updated: number
  unchanged: number
  /** Workouts inside the export's date span that are no longer in it (deleted or renamed in Strong). */
  removed: number
  sets: number
}

/** "2 new · 1 updated workouts", or a note that the export was already imported. */
export function describeImport(s: ImportSummary): string {
  const parts = [
    s.added && `${s.added} new`,
    s.updated && `${s.updated} updated`,
    s.removed && `${s.removed} removed`,
  ].filter(Boolean)
  if (!parts.length) return "Already up to date"
  return `${parts.join(" · ")} workout${s.added + s.updated + s.removed === 1 ? "" : "s"}`
}

export interface ImportRecord {
  id?: number
  fileName: string
  importedAt: string
  summary: ImportSummary
}

/** One snapshot per day; the bodyweight log already keeps its own history. */
export interface ProfileSnapshot {
  date: string // yyyy-mm-dd
  profile: Omit<Profile, "bodyweightLog">
}

interface GymDb extends DBSchema {
  sets: { key: string; value: StoredSet; indexes: { workoutKey: string } }
  imports: { key: number; value: ImportRecord }
  profile: { key: string; value: Profile }
  profileHistory: { key: string; value: ProfileSnapshot }
}

export type GymDatabase = IDBPDatabase<GymDb>

const CURRENT_PROFILE = "current"

export function openGymDb(name = "gymviz"): Promise<GymDatabase> {
  return openDB<GymDb>(name, 1, {
    upgrade(db) {
      const sets = db.createObjectStore("sets", { keyPath: "key" })
      sets.createIndex("workoutKey", "workoutKey")
      db.createObjectStore("imports", { keyPath: "id", autoIncrement: true })
      db.createObjectStore("profile")
      db.createObjectStore("profileHistory", { keyPath: "date" })
    },
  })
}

const SET_FIELDS = [
  "workoutKey",
  "date",
  "workoutName",
  "durationSec",
  "exercise",
  "setOrder",
  "position",
  "weightKg",
  "reps",
  "rpe",
  "distanceM",
  "seconds",
  "notes",
] as const satisfies readonly (keyof StoredSet)[]

const sameSet = (a: StoredSet, b: StoredSet) => SET_FIELDS.every((f) => a[f] === b[f])

export interface ImportPlan {
  put: StoredSet[]
  remove: string[]
  summary: ImportSummary
}

/**
 * Merge an export into what's stored. Strong exports the whole history, so each workout in the
 * export replaces its stored copy, and stored workouts inside the export's date span that it no
 * longer contains are dropped. Workouts outside that span (older exports) are kept.
 */
export function planImport(existing: StoredSet[], incoming: StoredSet[]): ImportPlan {
  const stored = new Map<string, Map<string, StoredSet>>()
  for (const s of existing) {
    let w = stored.get(s.workoutKey)
    if (!w) stored.set(s.workoutKey, (w = new Map()))
    w.set(s.key, s)
  }
  const byWorkout = new Map<string, StoredSet[]>()
  for (const s of incoming) {
    const w = byWorkout.get(s.workoutKey)
    if (w) w.push(s)
    else byWorkout.set(s.workoutKey, [s])
  }

  const put: StoredSet[] = []
  const remove: string[] = []
  const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0, removed: 0, sets: incoming.length }

  for (const [workoutKey, sets] of byWorkout) {
    const old = stored.get(workoutKey)
    if (!old) {
      summary.added++
      put.push(...sets)
      continue
    }
    const changed = sets.filter((s) => {
      const prev = old.get(s.key)
      return !prev || !sameSet(prev, s)
    })
    const keys = new Set(sets.map((s) => s.key))
    const gone = [...old.keys()].filter((k) => !keys.has(k))
    put.push(...changed)
    remove.push(...gone)
    if (changed.length || gone.length) summary.updated++
    else summary.unchanged++
  }

  let first = incoming[0]?.date ?? ""
  let last = first
  for (const s of incoming) {
    if (s.date < first) first = s.date
    if (s.date > last) last = s.date
  }
  for (const [workoutKey, sets] of stored) {
    if (byWorkout.has(workoutKey)) continue
    const date = sets.values().next().value!.date
    if (date < first || date > last) continue
    summary.removed++
    remove.push(...sets.keys())
  }

  return { put, remove, summary }
}

/** Import parsed sets in one transaction. Re-importing the same export changes nothing. */
export async function importSets(db: GymDatabase, incoming: StoredSet[], fileName: string): Promise<ImportRecord> {
  const tx = db.transaction(["sets", "imports"], "readwrite")
  const sets = tx.objectStore("sets")
  const plan = planImport(await sets.getAll(), incoming)
  const record: ImportRecord = { fileName, importedAt: new Date().toISOString(), summary: plan.summary }
  await Promise.all([
    ...plan.remove.map((k) => sets.delete(k)),
    ...plan.put.map((s) => sets.put(s)),
    tx.objectStore("imports").add(record),
    tx.done,
  ])
  return record
}

export function loadSets(db: GymDatabase): Promise<StoredSet[]> {
  return db.getAll("sets")
}

export async function lastImport(db: GymDatabase): Promise<ImportRecord | null> {
  const cursor = await db.transaction("imports").store.openCursor(null, "prev")
  return cursor?.value ?? null
}

/** Delete every stored workout and the import log; the profile is kept. */
export async function clearWorkouts(db: GymDatabase): Promise<void> {
  const tx = db.transaction(["sets", "imports"], "readwrite")
  await Promise.all([tx.objectStore("sets").clear(), tx.objectStore("imports").clear(), tx.done])
}

export async function loadProfile(db: GymDatabase): Promise<Profile | null> {
  return (await db.get("profile", CURRENT_PROFILE)) ?? null
}

/** Save the profile and today's snapshot of it (later edits the same day overwrite it). */
export async function saveProfile(db: GymDatabase, profile: Profile, now = new Date()): Promise<void> {
  const { bodyweightLog: _, ...rest } = profile
  const tx = db.transaction(["profile", "profileHistory"], "readwrite")
  await Promise.all([
    tx.objectStore("profile").put(profile, CURRENT_PROFILE),
    tx.objectStore("profileHistory").put({ date: dayKey(now), profile: rest }),
    tx.done,
  ])
}

export function loadProfileHistory(db: GymDatabase): Promise<ProfileSnapshot[]> {
  return db.getAll("profileHistory")
}
