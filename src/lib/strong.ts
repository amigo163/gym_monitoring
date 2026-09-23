import Papa from "papaparse"
import { bodyweightShare, isAssisted, muscleGroupFor } from "./muscles"
import { estimateOneRepMax } from "./one-rep-max"
import type { SetRow, StoredSet } from "./types"

const LBS_TO_KG = 0.45359237

export class StrongParseError extends Error {}

type RawRow = Record<string, string | undefined>

function num(value: string | undefined): number | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  const n = Number(trimmed.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Strong writes duration either as seconds or as "1h 20m" / "45m". */
function parseDuration(row: RawRow): number {
  const secs = num(row["Duration (sec)"])
  if (secs != null) return secs
  const text = row["Duration"]?.trim()
  if (!text) return 0
  const h = /(\d+)\s*h/.exec(text)
  const m = /(\d+)\s*m/.exec(text)
  const s = /(\d+)\s*s/.exec(text)
  const total = (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0)
  return total || (num(text) ?? 0)
}

function parseWeightKg(row: RawRow): number {
  const kg = num(row["Weight (kg)"])
  if (kg != null) return kg
  const lbs = num(row["Weight (lbs)"])
  if (lbs != null) return lbs * LBS_TO_KG
  const plain = num(row["Weight"])
  if (plain == null) return 0
  return /lb/i.test(row["Weight Unit"] ?? "") ? plain * LBS_TO_KG : plain
}

function parseDate(text: string): Date | null {
  // "2023-06-05 18:57:00" → treat as local time
  const iso = text.trim().replace(" ", "T")
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Returns the bodyweight (kg) to use on a given date. */
export type BodyweightAt = (date: Date) => number | null

/**
 * Parse a Strong app CSV export into sets ready for the local database. Keys are derived from
 * the data itself, so importing the same export twice yields the same keys.
 */
export function parseStrongExport(text: string): StoredSet[] {
  const result = Papa.parse<RawRow>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [";", ",", "\t"],
    transformHeader: (h) => h.replace(/"/g, "").trim(),
  })

  const fields = result.meta.fields ?? []
  const required = ["Date", "Exercise Name", "Reps"]
  const missing = required.filter((f) => !fields.includes(f))
  if (missing.length) {
    throw new StrongParseError(
      `This doesn't look like a Strong export — missing column(s): ${missing.join(", ")}`,
    )
  }

  const sets: StoredSet[] = []
  const positions = new Map<string, number>()
  // The same exercise can appear twice in a workout with the set order restarting.
  const occurrences = new Map<string, number>()
  for (const raw of result.data) {
    const date = raw["Date"]?.trim() ?? ""
    const exercise = raw["Exercise Name"]?.trim()
    if (!parseDate(date) || !exercise) continue
    // Newer Strong exports include "Rest Timer" pseudo-sets.
    const setOrder = (raw["Set Order"] ?? "").trim()
    if (/rest/i.test(setOrder)) continue

    const workoutName = raw["Workout Name"]?.trim() || "Workout"
    const workoutKey = `${date}|${workoutName}`
    const position = positions.get(workoutKey) ?? 0
    positions.set(workoutKey, position + 1)
    const base = `${workoutKey}|${exercise}|${setOrder}`
    const n = occurrences.get(base) ?? 0
    occurrences.set(base, n + 1)

    sets.push({
      key: `${base}#${n}`,
      workoutKey,
      date,
      workoutName,
      durationSec: parseDuration(raw),
      exercise,
      setOrder,
      position,
      weightKg: parseWeightKg(raw),
      reps: num(raw["Reps"]) ?? 0,
      rpe: num(raw["RPE"]),
      distanceM: num(raw["Distance (meters)"] ?? raw["Distance"]),
      seconds: num(raw["Seconds"]),
      notes: raw["Notes"]?.trim() ?? "",
    })
  }

  if (!sets.length) throw new StrongParseError("No sets found in the file.")
  return sets
}

/** Derive analysis rows from stored sets, using the bodyweight on each set's date. */
export function toSetRows(sets: StoredSet[], bodyweightAt: BodyweightAt = () => null): SetRow[] {
  const dates = new Map<string, Date>()
  const rows = sets.map((s): [SetRow, number] => {
    let date = dates.get(s.date)
    if (!date) {
      date = parseDate(s.date)!
      dates.set(s.date, date)
    }
    const share = bodyweightShare(s.exercise)
    const bw = share > 0 ? bodyweightAt(date) : null
    let effectiveLoad = s.weightKg
    if (bw != null) {
      effectiveLoad = isAssisted(s.exercise) ? Math.max(bw * share - s.weightKg, 0) : bw * share + s.weightKg
    }
    const row: SetRow = {
      workoutId: s.workoutKey,
      date,
      workoutName: s.workoutName,
      durationSec: s.durationSec,
      exercise: s.exercise,
      setOrder: num(s.setOrder) ?? 0,
      isWarmup: /^w/i.test(s.setOrder),
      weight: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      distanceM: s.distanceM,
      seconds: s.seconds,
      notes: s.notes,
      muscle: muscleGroupFor(s.exercise),
      effectiveLoad,
      e1rm: estimateOneRepMax(effectiveLoad, s.reps, s.rpe),
      volume: effectiveLoad * s.reps,
    }
    return [row, s.position]
  })
  rows.sort(([a, pa], [b, pb]) => a.date.getTime() - b.date.getTime() || a.setOrder - b.setOrder || pa - pb)
  return rows.map(([row]) => row)
}

/** Parse a Strong app CSV export into normalized set rows. */
export function parseStrongCsv(text: string, bodyweightAt: BodyweightAt = () => null): SetRow[] {
  return toSetRows(parseStrongExport(text), bodyweightAt)
}
