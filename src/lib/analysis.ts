import {
  DAY_MS,
  addDays,
  dayKey,
  daysBetween,
  parseDayKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayIndex,
} from "./dates"
import { muscleGroupFor } from "./muscles"
import { PRIMARY_PR, inferTrackingKinds, lowerIsBetter, prKindsFor, primaryValue, sessionMetric } from "./tracking"
import type {
  ExerciseSession,
  MuscleGroup,
  PersonalRecord,
  PrKind,
  SetRow,
  TrackingKind,
  Workout,
} from "./types"

/** Working sets only — warm-ups don't count toward volume or records. */
export function workingSets(rows: SetRow[]): SetRow[] {
  return rows.filter((r) => !r.isWarmup)
}

export function buildWorkouts(rows: SetRow[]): Workout[] {
  const byId = new Map<string, Workout>()
  for (const r of rows) {
    let w = byId.get(r.workoutId)
    if (!w) {
      w = {
        id: r.workoutId,
        date: r.date,
        name: r.workoutName,
        durationSec: r.durationSec,
        sets: [],
        volume: 0,
        reps: 0,
        exercises: [],
      }
      byId.set(r.workoutId, w)
    }
    w.sets.push(r)
    if (!r.isWarmup) {
      w.volume += r.volume
      w.reps += r.reps
    }
    if (!w.exercises.includes(r.exercise)) w.exercises.push(r.exercise)
  }
  return [...byId.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Per-exercise, per-workout best performance, ordered by date. `kinds` says how each exercise is
 * measured; exercises missing from it get the kind inferred from their rows.
 */
export function buildExerciseSessions(rows: SetRow[], kinds: Map<string, TrackingKind> = new Map()): Map<string, ExerciseSession[]> {
  const grouped = new Map<string, Map<string, SetRow[]>>()
  for (const r of workingSets(rows)) {
    let byWorkout = grouped.get(r.exercise)
    if (!byWorkout) grouped.set(r.exercise, (byWorkout = new Map()))
    const list = byWorkout.get(r.workoutId)
    if (list) list.push(r)
    else byWorkout.set(r.workoutId, [r])
  }

  const missing = rows.filter((r) => grouped.has(r.exercise) && !kinds.has(r.exercise))
  const inferred = missing.length ? inferTrackingKinds(missing) : new Map<string, TrackingKind>()
  const out = new Map<string, ExerciseSession[]>()
  for (const [exercise, byWorkout] of grouped) {
    const kind = kinds.get(exercise) ?? inferred.get(exercise) ?? "weight"
    const sessions: ExerciseSession[] = []
    for (const [workoutId, sets] of byWorkout) {
      const rpes = sets.map((s) => s.rpe).filter((v): v is number => v != null)
      const sum = (f: (s: SetRow) => number) => sets.reduce((acc, s) => acc + f(s), 0)
      const distanceSets = sets.filter((s) => (s.distanceM ?? 0) > 0 && (s.seconds ?? 0) > 0)
      const paceDistance = distanceSets.reduce((a, s) => a + s.distanceM!, 0)
      const session: Omit<ExerciseSession, "primary"> = {
        exercise,
        kind,
        date: sets[0].date,
        workoutId,
        topWeight: Math.max(...sets.map((s) => s.effectiveLoad)),
        bestE1rm: Math.max(...sets.map((s) => s.e1rm)),
        volume: sum((s) => s.volume),
        sets: sets.length,
        reps: sum((s) => s.reps),
        bestReps: Math.max(...sets.map((s) => s.reps)),
        bestSeconds: Math.max(...sets.map((s) => s.seconds ?? 0)),
        totalSeconds: sum((s) => s.seconds ?? 0),
        totalDistanceM: sum((s) => s.distanceM ?? 0),
        paceSecPerKm: paceDistance > 0 ? distanceSets.reduce((a, s) => a + s.seconds!, 0) / (paceDistance / 1000) : null,
        avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
      }
      sessions.push({ ...session, primary: primaryValue(session) })
    }
    sessions.sort((a, b) => a.date.getTime() - b.date.getTime())
    out.set(exercise, sessions)
  }
  return out
}

/**
 * A PR is a session that beats every earlier session of the same exercise.
 * The first session of an exercise is a baseline, not a record.
 */
export function findPersonalRecords(
  sessions: Map<string, ExerciseSession[]>,
  rows: SetRow[],
): PersonalRecord[] {
  // The set behind a record: heaviest-e1RM for load records, most reps for rep records.
  const bestSetByWorkout = new Map<string, SetRow>()
  const mostRepsByWorkout = new Map<string, SetRow>()
  for (const r of workingSets(rows)) {
    const key = `${r.exercise}|${r.workoutId}`
    const cur = bestSetByWorkout.get(key)
    if (!cur || r.e1rm > cur.e1rm || (r.e1rm === cur.e1rm && r.effectiveLoad > cur.effectiveLoad)) {
      bestSetByWorkout.set(key, r)
    }
    const most = mostRepsByWorkout.get(key)
    if (!most || r.reps > most.reps) mostRepsByWorkout.set(key, r)
  }

  const prs: PersonalRecord[] = []
  for (const [exercise, list] of sessions) {
    if (!list.length) continue
    const muscle = muscleGroupFor(exercise)
    const kind = list[0].kind
    for (const prKind of prKindsFor(kind, exercise)) {
      const lower = lowerIsBetter(prKind)
      let best: number | null = null
      for (const s of list) {
        const v = sessionMetric(s, prKind)
        if (v <= 0) continue
        const beats = best != null && (lower ? v < best - 1e-6 : v > best + 1e-6)
        if (beats) {
          const key = `${exercise}|${s.workoutId}`
          const set = prKind === "reps" || prKind === "totalReps" ? mostRepsByWorkout.get(key) : bestSetByWorkout.get(key)
          prs.push({
            exercise,
            muscle,
            date: s.date,
            kind: prKind,
            primary: prKind === PRIMARY_PR[kind],
            value: v,
            previous: best,
            weight: set?.effectiveLoad ?? s.topWeight,
            reps: set?.reps ?? 0,
          })
        }
        if (best == null || beats) best = v
      }
    }
  }
  return prs.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export interface OverviewStats {
  workouts: number
  sets: number
  reps: number
  volume: number
  avgDurationMin: number
  workoutsPerWeek: number
  exercises: number
  prs: number
  currentWeekStreak: number
  longestWeekStreak: number
  firstDate: Date | null
  lastDate: Date | null
}

export function overviewStats(workouts: Workout[], prs: PersonalRecord[]): OverviewStats {
  const sets = workouts.reduce((a, w) => a + w.sets.filter((s) => !s.isWarmup).length, 0)
  const durations = workouts.map((w) => w.durationSec).filter((d) => d > 0)
  const first = workouts[0]?.date ?? null
  const last = workouts.at(-1)?.date ?? null
  const weeks = first && last ? Math.max(1, (last.getTime() - first.getTime()) / (7 * DAY_MS)) : 1
  const streaks = weekStreaks(workouts)
  return {
    workouts: workouts.length,
    sets,
    reps: workouts.reduce((a, w) => a + w.reps, 0),
    volume: workouts.reduce((a, w) => a + w.volume, 0),
    avgDurationMin: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 60 : 0,
    workoutsPerWeek: workouts.length / weeks,
    exercises: new Set(workouts.flatMap((w) => w.exercises)).size,
    prs: prs.filter((p) => p.primary).length,
    currentWeekStreak: streaks.current,
    longestWeekStreak: streaks.longest,
    firstDate: first,
    lastDate: last,
  }
}

/** Consecutive calendar weeks with at least one workout. */
export function weekStreaks(workouts: Workout[], today = new Date()) {
  const weeks = [...new Set(workouts.map((w) => startOfWeek(w.date).getTime()))].sort((a, b) => a - b)
  let longest = 0
  let run = 0
  let prev: number | null = null
  for (const w of weeks) {
    run = prev != null && Math.round((w - prev) / (7 * DAY_MS)) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = w
  }
  const thisWeek = startOfWeek(today).getTime()
  const lastWeek = weeks.at(-1)
  const alive = lastWeek != null && Math.round((thisWeek - lastWeek) / (7 * DAY_MS)) <= 1
  return { current: alive ? run : 0, longest }
}

export interface WeeklyPoint {
  date: Date
  workouts: number
  volume: number
  sets: number
  reps: number
  minutes: number
}

/** Dense weekly series (weeks without training are zero rows). */
export function weeklySeries(workouts: Workout[]): WeeklyPoint[] {
  if (!workouts.length) return []
  const map = new Map<number, WeeklyPoint>()
  const start = startOfWeek(workouts[0].date)
  const end = startOfWeek(workouts.at(-1)!.date)
  for (let d = start; d <= end; d = addDays(d, 7)) {
    map.set(d.getTime(), { date: d, workouts: 0, volume: 0, sets: 0, reps: 0, minutes: 0 })
  }
  for (const w of workouts) {
    const p = map.get(startOfWeek(w.date).getTime())!
    p.workouts += 1
    p.volume += w.volume
    p.sets += w.sets.filter((s) => !s.isWarmup).length
    p.reps += w.reps
    p.minutes += w.durationSec / 60
  }
  return [...map.values()]
}

export interface MonthlyPoint {
  date: Date
  workouts: number
  volume: number
  uniqueExercises: number
  prs: number
}

export function monthlySeries(workouts: Workout[], prs: PersonalRecord[]): MonthlyPoint[] {
  if (!workouts.length) return []
  const map = new Map<number, MonthlyPoint & { ex: Set<string> }>()
  const end = startOfMonth(workouts.at(-1)!.date)
  for (let d = startOfMonth(workouts[0].date); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    map.set(d.getTime(), { date: d, workouts: 0, volume: 0, uniqueExercises: 0, prs: 0, ex: new Set() })
  }
  for (const w of workouts) {
    const p = map.get(startOfMonth(w.date).getTime())!
    p.workouts += 1
    p.volume += w.volume
    w.exercises.forEach((e) => p.ex.add(e))
  }
  for (const pr of prs) {
    const p = map.get(startOfMonth(pr.date).getTime())
    if (p && pr.primary) p.prs += 1
  }
  return [...map.values()].map(({ ex, ...p }) => ({ ...p, uniqueExercises: ex.size }))
}

export interface MuscleShare {
  muscle: MuscleGroup
  sets: number
  volume: number
}

export function muscleDistribution(rows: SetRow[]): MuscleShare[] {
  const map = new Map<MuscleGroup, MuscleShare>()
  for (const r of workingSets(rows)) {
    const m = map.get(r.muscle) ?? { muscle: r.muscle, sets: 0, volume: 0 }
    m.sets += 1
    m.volume += r.volume
    map.set(r.muscle, m)
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets)
}

export interface ExerciseUsage {
  exercise: string
  muscle: MuscleGroup
  sessions: number
  sets: number
  volume: number
  lastDate: Date
}

export function exerciseUsage(sessions: Map<string, ExerciseSession[]>): ExerciseUsage[] {
  return [...sessions.entries()]
    .map(([exercise, list]) => ({
      exercise,
      muscle: muscleGroupFor(exercise),
      sessions: list.length,
      sets: list.reduce((a, s) => a + s.sets, 0),
      volume: list.reduce((a, s) => a + s.volume, 0),
      lastDate: list.at(-1)!.date,
    }))
    .sort((a, b) => b.sets - a.sets)
}

export interface Plateau {
  start: Date
  end: Date
  sessions: number
  value: number
}

const tolerance = 1.005 // ignore rounding-level "gains"

/**
 * Stretches of ≥ `window` sessions where `metric` (default: the main one — e1RM, most reps,
 * longest hold…) never beat the value at the start of the stretch. Sessions without that
 * metric are skipped. A layoff (see {@link dataGaps}) ends the stretch: time off isn't being stuck.
 */
export function detectPlateaus(sessions: ExerciseSession[], window = 4, metric?: PrKind): Plateau[] {
  const value = (s: ExerciseSession) => (metric ? sessionMetric(s, metric) : s.primary)
  const list = metric ? sessions.filter((s) => value(s) > 0) : sessions
  const beats = (v: number, ref: number) => (metric && lowerIsBetter(metric) ? v * tolerance < ref : v > ref * tolerance)
  const plateaus: Plateau[] = []
  if (list.length < window) return plateaus
  let startIdx = 0
  let ref = value(list[0])
  const close = (endIdx: number) => {
    const n = endIdx - startIdx + 1
    if (n >= window) {
      plateaus.push({ start: list[startIdx].date, end: list[endIdx].date, sessions: n, value: ref })
    }
  }
  const layoffs = new Set(dataGaps(list.map((s) => s.date)))
  for (let i = 1; i < list.length; i++) {
    const v = value(list[i])
    if (layoffs.has(i - 1) || beats(v, ref)) {
      close(i - 1)
      startIdx = i
      ref = v
    }
  }
  close(list.length - 1)
  return plateaus
}

export interface ExerciseSummary {
  exercise: string
  muscle: MuscleGroup
  kind: TrackingKind
  sessions: number
  first: ExerciseSession
  last: ExerciseSession
  /** Session with the best main metric. */
  best: ExerciseSession
  bestE1rm: ExerciseSession
  bestWeight: ExerciseSession
  e1rmChangePct: number | null
  weightChangePct: number | null
  primaryChangePct: number | null
  volumeChangePct: number | null
}

function pct(from: number, to: number): number | null {
  return from > 0 ? ((to - from) / from) * 100 : null
}

export function summarizeExercise(list: ExerciseSession[]): ExerciseSummary | null {
  if (!list.length) return null
  const first = list[0]
  const last = list.at(-1)!
  const bestE1rm = list.reduce((a, b) => (b.bestE1rm > a.bestE1rm ? b : a))
  const bestWeight = list.reduce((a, b) => (b.topWeight > a.topWeight ? b : a))
  const best = list.reduce((a, b) => (b.primary > a.primary ? b : a))
  return {
    exercise: first.exercise,
    muscle: muscleGroupFor(first.exercise),
    kind: first.kind,
    sessions: list.length,
    first,
    last,
    best,
    bestE1rm,
    bestWeight,
    e1rmChangePct: pct(first.bestE1rm, last.bestE1rm),
    weightChangePct: pct(first.topWeight, last.topWeight),
    primaryChangePct: pct(first.primary, last.primary),
    volumeChangePct: pct(first.volume, last.volume),
  }
}

/** Improvement from the mean of the first two sessions to the mean of the last two. */
export function mostImproved(sessions: Map<string, ExerciseSession[]>, minSessions = 3, top = 8) {
  const out: { exercise: string; muscle: MuscleGroup; kind: TrackingKind; changePct: number; from: number; to: number; sessions: number }[] = []
  for (const [exercise, list] of sessions) {
    if (list.length < minSessions) continue
    const val = (s: ExerciseSession) => s.primary
    const head = list.slice(0, 2).map(val)
    const tail = list.slice(-2).map(val)
    const from = head.reduce((a, b) => a + b, 0) / head.length
    const to = tail.reduce((a, b) => a + b, 0) / tail.length
    if (from <= 0) continue
    out.push({ exercise, muscle: muscleGroupFor(exercise), kind: list[0].kind, changePct: ((to - from) / from) * 100, from, to, sessions: list.length })
  }
  return out.sort((a, b) => b.changePct - a.changePct).slice(0, top)
}

export function weekdayCounts(workouts: Workout[]): number[] {
  const counts = Array(7).fill(0)
  for (const w of workouts) counts[weekdayIndex(w.date)] += 1
  return counts
}

export function hourCounts(workouts: Workout[]): number[] {
  const counts = Array(24).fill(0)
  for (const w of workouts) counts[w.date.getHours()] += 1
  return counts
}

/** Histogram of rest days between consecutive workout days, bucketed 0..6 and 7+. */
export function restDayHistogram(workouts: Workout[]): { label: string; count: number }[] {
  const days = [...new Set(workouts.map((w) => dayKey(w.date)))].sort()
  const buckets = Array(8).fill(0)
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(parseDayKey(days[i - 1]), parseDayKey(days[i])) - 1
    buckets[Math.min(Math.max(gap, 0), 7)] += 1
  }
  return buckets.map((count, i) => ({ label: i === 7 ? "7+" : String(i), count }))
}

/** Working sets per day keyed by yyyy-mm-dd, for the calendar heatmap. */
export function dailySets(workouts: Workout[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of workouts) {
    const k = dayKey(w.date)
    map.set(k, (map.get(k) ?? 0) + w.sets.filter((s) => !s.isWarmup).length)
  }
  return map
}

/** Weekly set counts per muscle group (dense, Monday weeks). */
export function weeklyMuscleSets(rows: SetRow[], from?: Date, to?: Date) {
  const working = workingSets(rows)
  if (!working.length) return []
  const start = startOfWeek(from ?? working[0].date)
  const end = startOfWeek(to ?? working.at(-1)!.date)
  const map = new Map<number, { date: Date } & Partial<Record<MuscleGroup, number>>>()
  for (let d = start; d <= end; d = addDays(d, 7)) map.set(d.getTime(), { date: d })
  for (const r of working) {
    const p = map.get(startOfWeek(r.date).getTime())
    if (!p) continue
    // A set at RPE < 6 is too far from failure to count as a full hard set.
    const credit = r.rpe != null && r.rpe < 6 ? 0.5 : 1
    p[r.muscle] = (p[r.muscle] ?? 0) + credit
  }
  return [...map.values()]
}

export type DateRangeKey = "3m" | "6m" | "1y" | "all"

export function filterByRange(rows: SetRow[], range: DateRangeKey): SetRow[] {
  if (range === "all" || !rows.length) return rows
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12
  const end = rows.at(-1)!.date
  const cutoff = startOfDay(new Date(end.getFullYear(), end.getMonth() - months, end.getDate()))
  return rows.filter((r) => r.date >= cutoff)
}

/**
 * Indices `i` where the stretch from `dates[i]` to `dates[i + 1]` is a real
 * break in the record rather than the usual spacing: longer than 3× the
 * median interval and at least two weeks. Only stretches before `until` count
 * (e.g. the last logged point before a forecast).
 */
export function dataGaps(dates: Date[], until = dates.length - 1): number[] {
  const intervals = dates.slice(1, until + 1).map((d, i) => d.getTime() - dates[i].getTime())
  if (intervals.length < 3) return []
  const sorted = [...intervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const threshold = Math.max(3 * median, 14 * DAY_MS)
  return intervals.flatMap((ms, i) => (ms > threshold ? [i] : []))
}
