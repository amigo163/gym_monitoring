import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import {
  type DateRangeKey,
  buildExerciseSessions,
  buildWorkouts,
  filterByRange,
  findPersonalRecords,
} from "@/lib/analysis"
import { daysBetween } from "@/lib/dates"
import { DEFAULT_PROFILE, bodyweightAt } from "@/lib/models/physiology"
import { StrongParseError, parseStrongCsv } from "@/lib/strong"
import type { ExerciseSession, PersonalRecord, Profile, SetRow, Workout } from "@/lib/types"

const CSV_KEY = "gymviz.csv"
const PROFILE_KEY = "gymviz.profile"
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
  csv: string | null
  fileName: string | null
  error: string | null
  data: Dataset | null
  profile: Profile
  range: DateRangeKey
  loadCsv: (text: string, fileName: string) => void
  clearData: () => void
  setProfile: (p: Profile) => void
  setRange: (r: DateRangeKey) => void
}

const StoreContext = createContext<Store | null>(null)

/** An export older than this is treated as historical: models anchor at its last workout. */
const STALE_AFTER_DAYS = 21

function buildDataset(csv: string, profile: Profile, range: DateRangeKey): Dataset {
  const allRows = parseStrongCsv(csv, bodyweightAt(profile))
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState(() => load<{ text: string; name: string } | null>(CSV_KEY, null))
  const [profile, setProfileState] = useState<Profile>(() => ({ ...DEFAULT_PROFILE, ...load(PROFILE_KEY, {}) }))
  const [range, setRangeState] = useState<DateRangeKey>(() => load(RANGE_KEY, "all"))

  const { data, error } = useMemo(() => {
    if (!stored) return { data: null, error: null }
    try {
      return { data: buildDataset(stored.text, profile, range), error: null }
    } catch (e) {
      return { data: null, error: e instanceof StrongParseError ? e.message : "Could not read this file." }
    }
  }, [stored, profile, range])

  const loadCsv = useCallback((text: string, name: string) => {
    const next = { text, name }
    setStored(next)
    save(CSV_KEY, next)
  }, [])

  const clearData = useCallback(() => {
    setStored(null)
    save(CSV_KEY, null)
  }, [])

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p)
    save(PROFILE_KEY, p)
  }, [])

  const setRange = useCallback((r: DateRangeKey) => {
    setRangeState(r)
    save(RANGE_KEY, r)
  }, [])

  const value = useMemo<Store>(
    () => ({
      csv: stored?.text ?? null,
      fileName: stored?.name ?? null,
      error,
      data,
      profile,
      range,
      loadCsv,
      clearData,
      setProfile,
      setRange,
    }),
    [stored, error, data, profile, range, loadCsv, clearData, setProfile, setRange],
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
