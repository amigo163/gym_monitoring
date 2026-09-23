import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  type DateRangeKey,
  buildExerciseSessions,
  buildWorkouts,
  filterByRange,
  findPersonalRecords,
} from "@/lib/analysis"
import { daysBetween } from "@/lib/dates"
import { type WeightUnit, setWeightUnit } from "@/lib/format"
import {
  type GymDatabase,
  type ImportRecord,
  clearWorkouts,
  importSets,
  lastImport as loadLastImport,
  loadExerciseSettings,
  loadGoals,
  loadProfile,
  loadSets,
  openGymDb,
  planImport,
  saveExerciseSettings,
  saveGoal,
  saveProfile,
} from "@/lib/db"
import { DEFAULT_PROFILE, bodyweightAt } from "@/lib/models/physiology"
import { setMuscleOverrides } from "@/lib/muscles"
import { StrongParseError, parseStrongExport, toSetRows } from "@/lib/strong"
import { inferTrackingKinds } from "@/lib/tracking"
import type {
  ExerciseGoal,
  ExerciseSession,
  ExerciseSettings,
  MuscleGroup,
  PersonalRecord,
  Profile,
  SetRow,
  StoredSet,
  TrackingKind,
  Workout,
} from "@/lib/types"

/** Where the CSV and profile lived before the local database; migrated on first load. */
const LEGACY_CSV_KEY = "gymviz.csv"
const LEGACY_PROFILE_KEY = "gymviz.profile"
/** Target 1RMs typed into the Strength tab, as strings keyed by exercise. */
const LEGACY_GOALS_KEY = "gymviz.predictions.goals"
const RANGE_KEY = "gymviz.range"
const UNIT_KEY = "gymviz.unit"

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode): the app still works for this session.
  }
}

/** useState that survives reloads, for per-page UI choices (selected exercise, tab…). */
export function usePersistentState<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  const set = useCallback(
    (v: T) => {
      setValue(v)
      save(key, v)
    },
    [key],
  )
  return [value, set]
}

export interface Dataset {
  /** Every parsed set (unfiltered) — models use full history. */
  allRows: SetRow[]
  allSessions: Map<string, ExerciseSession[]>
  /** Rows within the selected date range — descriptive pages use these. */
  rows: SetRow[]
  workouts: Workout[]
  sessions: Map<string, ExerciseSession[]>
  prs: PersonalRecord[]
  /** How each exercise is measured: your override, else inferred from the full history. */
  kinds: Map<string, TrackingKind>
  /** The inferred kinds, to show next to your overrides. */
  autoKinds: Map<string, TrackingKind>
  /** "Now" for the models: today, or the last workout if the export is stale. */
  asOf: Date
  isStale: boolean
}

interface Store {
  /** False until the local database has been read. */
  ready: boolean
  error: string | null
  data: Dataset | null
  lastImport: ImportRecord | null
  profile: Profile
  /** Goals by exercise. */
  goals: Record<string, ExerciseGoal>
  /** Your muscle-group and tracking corrections by exercise. */
  exerciseSettings: Record<string, ExerciseSettings>
  range: DateRangeKey
  /** The unit weights are displayed in; stored data stays in kg. */
  unit: WeightUnit
  /** Merge a Strong export into the stored history. Resolves to null when the file can't be used. */
  importCsv: (text: string, fileName: string) => Promise<ImportRecord | null>
  clearData: () => Promise<void>
  setProfile: (p: Profile) => void
  /** Save an exercise's goal; a goal with nothing set is removed. */
  setGoal: (goal: ExerciseGoal) => void
  /** Save corrections for an exercise; one with nothing overridden is removed. */
  setExerciseSettings: (settings: ExerciseSettings) => void
  setRange: (r: DateRangeKey) => void
  setUnit: (u: WeightUnit) => void
}

const StoreContext = createContext<Store | null>(null)

/** An export older than this is treated as historical: models anchor at its last workout. */
const STALE_AFTER_DAYS = 21

function buildDataset(sets: StoredSet[], profile: Profile, range: DateRangeKey, settings: Record<string, ExerciseSettings>): Dataset {
  const all = Object.values(settings)
  // Rows carry their muscle group, so overrides must be in place before they're built.
  setMuscleOverrides(new Map(all.filter((s) => s.muscle).map((s): [string, MuscleGroup] => [s.exercise, s.muscle!])))
  const allRows = toSetRows(sets, bodyweightAt(profile))
  const autoKinds = inferTrackingKinds(allRows)
  const kinds = new Map(autoKinds)
  for (const s of all) if (s.kind && kinds.has(s.exercise)) kinds.set(s.exercise, s.kind)
  const rows = filterByRange(allRows, range)
  const sessions = buildExerciseSessions(rows, kinds)
  const allSessions = buildExerciseSessions(allRows, kinds)
  const last = allRows.at(-1)!.date
  const today = new Date()
  const isStale = daysBetween(last, today) > STALE_AFTER_DAYS
  return {
    allRows,
    allSessions,
    rows,
    workouts: buildWorkouts(rows),
    sessions,
    prs: findPersonalRecords(sessions, rows),
    kinds,
    autoKinds,
    asOf: isStale ? last : today,
    isStale,
  }
}

async function migrateLocalStorage(db: GymDatabase) {
  const csv = load<{ text: string; name: string } | null>(LEGACY_CSV_KEY, null)
  if (csv) {
    try {
      await importSets(db, parseStrongExport(csv.text), csv.name)
    } catch (e) {
      if (!(e instanceof StrongParseError)) throw e
    }
    save(LEGACY_CSV_KEY, null)
  }
  const profile = load<Partial<Profile> | null>(LEGACY_PROFILE_KEY, null)
  if (profile) {
    if (!(await loadProfile(db))) await saveProfile(db, { ...DEFAULT_PROFILE, ...profile })
    save(LEGACY_PROFILE_KEY, null)
  }
  const goals = load<Record<string, string> | null>(LEGACY_GOALS_KEY, null)
  if (goals) {
    const existing = new Set((await loadGoals(db)).map((g) => g.exercise))
    for (const [exercise, raw] of Object.entries(goals)) {
      const target = Number(raw)
      if (existing.has(exercise) || !(target > 0)) continue
      await saveGoal(db, exercise, { exercise, target, start: null, repRange: null, deadline: null, updatedAt: new Date().toISOString() })
    }
    save(LEGACY_GOALS_KEY, null)
  }
}

const isEmptyGoal = (g: ExerciseGoal) => g.target == null && g.repRange == null && g.deadline == null

/** Opened once per page load; StrictMode's double effect must not migrate or read twice. */
let startup: Promise<{
  db: GymDatabase
  sets: StoredSet[]
  profile: Profile | null
  last: ImportRecord | null
  goals: ExerciseGoal[]
  settings: ExerciseSettings[]
}> | null = null

function openStore() {
  startup ??= (async () => {
    const db = await openGymDb()
    await migrateLocalStorage(db)
    const [sets, profile, last, goals, settings] = await Promise.all([
      loadSets(db),
      loadProfile(db),
      loadLastImport(db),
      loadGoals(db),
      loadExerciseSettings(db),
    ])
    return { db, sets, profile, last, goals, settings }
  })()
  return startup
}

const importError = (e: unknown) => (e instanceof StrongParseError ? e.message : "Could not read this file.")

export function StoreProvider({ children }: { children: ReactNode }) {
  /** Null when IndexedDB is unavailable (e.g. blocked): data then lives in memory for the session. */
  const db = useRef<GymDatabase | null>(null)
  const [ready, setReady] = useState(false)
  const [sets, setSets] = useState<StoredSet[]>([])
  const [lastImport, setLastImport] = useState<ImportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE)
  const [goals, setGoals] = useState<Record<string, ExerciseGoal>>({})
  const [exerciseSettings, setSettingsState] = useState<Record<string, ExerciseSettings>>({})
  const [range, setRangeState] = useState<DateRangeKey>(() => load(RANGE_KEY, "all"))
  const [unit, setUnitState] = useState<WeightUnit>(() => {
    const u = load<WeightUnit>(UNIT_KEY, "kg") === "lb" ? "lb" : "kg"
    setWeightUnit(u)
    return u
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await openStore()
        if (cancelled) return
        db.current = loaded.db
        setSets(loaded.sets)
        setLastImport(loaded.last)
        if (loaded.profile) setProfileState({ ...DEFAULT_PROFILE, ...loaded.profile })
        setGoals(Object.fromEntries(loaded.goals.map((g) => [g.exercise, g])))
        setSettingsState(Object.fromEntries(loaded.settings.map((s) => [s.exercise, s])))
      } catch {
        if (!cancelled) setError("Couldn't open local storage. Imports will only last until you close the tab.")
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const data = useMemo(
    () => (sets.length ? buildDataset(sets, profile, range, exerciseSettings) : null),
    [sets, profile, range, exerciseSettings],
  )

  const importCsv = useCallback(async (text: string, fileName: string) => {
    let incoming: StoredSet[]
    try {
      incoming = parseStrongExport(text)
    } catch (e) {
      setError(importError(e))
      return null
    }
    let record: ImportRecord
    if (db.current) {
      record = await importSets(db.current, incoming, fileName)
      setSets(await loadSets(db.current))
    } else {
      const plan = planImport(sets, incoming)
      const replaced = new Set([...plan.remove, ...plan.put.map((s) => s.key)])
      setSets([...sets.filter((s) => !replaced.has(s.key)), ...plan.put])
      record = { fileName, importedAt: new Date().toISOString(), summary: plan.summary }
    }
    setLastImport(record)
    setError(null)
    return record
  }, [sets])

  const clearData = useCallback(async () => {
    if (db.current) await clearWorkouts(db.current)
    setSets([])
    setLastImport(null)
  }, [])

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p)
    if (db.current) void saveProfile(db.current, p)
  }, [])

  const setGoal = useCallback((goal: ExerciseGoal) => {
    const empty = isEmptyGoal(goal)
    setGoals((prev) => {
      const { [goal.exercise]: _, ...rest } = prev
      return empty ? rest : { ...rest, [goal.exercise]: goal }
    })
    if (db.current) void saveGoal(db.current, goal.exercise, empty ? null : goal)
  }, [])

  const setExerciseSettings = useCallback((settings: ExerciseSettings) => {
    const empty = settings.muscle == null && settings.kind == null
    setSettingsState((prev) => {
      const { [settings.exercise]: _, ...rest } = prev
      return empty ? rest : { ...rest, [settings.exercise]: settings }
    })
    if (db.current) void saveExerciseSettings(db.current, settings)
  }, [])

  const setRange = useCallback((r: DateRangeKey) => {
    setRangeState(r)
    save(RANGE_KEY, r)
  }, [])

  const setUnit = useCallback((u: WeightUnit) => {
    // The formatters read the module-level unit, so set it before the re-render.
    setWeightUnit(u)
    setUnitState(u)
    save(UNIT_KEY, u)
  }, [])

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      data,
      lastImport,
      profile,
      goals,
      exerciseSettings,
      range,
      unit,
      importCsv,
      clearData,
      setProfile,
      setGoal,
      setExerciseSettings,
      setRange,
      setUnit,
    }),
    [ready, error, data, lastImport, profile, goals, exerciseSettings, range, unit, importCsv, clearData, setProfile, setGoal, setExerciseSettings, setRange, setUnit],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used inside StoreProvider")
  return ctx
}

/** For pages rendered only once data exists. */
export function useData(): Dataset {
  const { data } = useStore()
  if (!data) throw new Error("useData called without data")
  return data
}
