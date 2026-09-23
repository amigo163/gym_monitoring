import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  type DateRangeKey,
  buildExerciseSessions,
  buildWorkouts,
  filterByRange,
  findPersonalRecords,
} from "@/lib/analysis"
import { daysBetween } from "@/lib/dates"
import {
  type GymDatabase,
  type ImportRecord,
  clearWorkouts,
  importSets,
  lastImport as loadLastImport,
  loadProfile,
  loadSets,
  openGymDb,
  planImport,
  saveProfile,
} from "@/lib/db"
import { DEFAULT_PROFILE, bodyweightAt } from "@/lib/models/physiology"
import { StrongParseError, parseStrongExport, toSetRows } from "@/lib/strong"
import type { ExerciseSession, PersonalRecord, Profile, SetRow, StoredSet, Workout } from "@/lib/types"

/** Where the CSV and profile lived before the local database; migrated on first load. */
const LEGACY_CSV_KEY = "gymviz.csv"
const LEGACY_PROFILE_KEY = "gymviz.profile"
const RANGE_KEY = "gymviz.range"

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

/** useState that survives reloads, for per-page UI choices (selected exercise, goals…). */
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
  range: DateRangeKey
  /** Merge a Strong export into the stored history. Resolves to null when the file can't be used. */
  importCsv: (text: string, fileName: string) => Promise<ImportRecord | null>
  clearData: () => Promise<void>
  setProfile: (p: Profile) => void
  setRange: (r: DateRangeKey) => void
}

const StoreContext = createContext<Store | null>(null)

/** An export older than this is treated as historical: models anchor at its last workout. */
const STALE_AFTER_DAYS = 21

function buildDataset(sets: StoredSet[], profile: Profile, range: DateRangeKey): Dataset {
  const allRows = toSetRows(sets, bodyweightAt(profile))
  const rows = filterByRange(allRows, range)
  const sessions = buildExerciseSessions(rows)
  const allSessions = buildExerciseSessions(allRows)
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
}

/** Opened once per page load; StrictMode's double effect must not migrate or read twice. */
let startup: Promise<{ db: GymDatabase; sets: StoredSet[]; profile: Profile | null; last: ImportRecord | null }> | null = null

function openStore() {
  startup ??= (async () => {
    const db = await openGymDb()
    await migrateLocalStorage(db)
    const [sets, profile, last] = await Promise.all([loadSets(db), loadProfile(db), loadLastImport(db)])
    return { db, sets, profile, last }
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
  const [range, setRangeState] = useState<DateRangeKey>(() => load(RANGE_KEY, "all"))

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
    () => (sets.length ? buildDataset(sets, profile, range) : null),
    [sets, profile, range],
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

  const setRange = useCallback((r: DateRangeKey) => {
    setRangeState(r)
    save(RANGE_KEY, r)
  }, [])

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      data,
      lastImport,
      profile,
      range,
      importCsv,
      clearData,
      setProfile,
      setRange,
    }),
    [ready, error, data, lastImport, profile, range, importCsv, clearData, setProfile, setRange],
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
