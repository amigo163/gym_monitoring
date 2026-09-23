import Papa from "papaparse"
import { bodyweightShare, isAssisted, muscleGroupFor } from "./muscles"
import { estimateOneRepMax } from "./one-rep-max"
import type { SetRow } from "./types"

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

/** Parse a Strong app CSV export into normalized set rows. */
export function parseStrongCsv(text: string, bodyweightAt: BodyweightAt = () => null): SetRow[] {
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

  const rows: SetRow[] = []
  for (const raw of result.data) {
    const date = parseDate(raw["Date"] ?? "")
    const exercise = raw["Exercise Name"]?.trim()
    if (!date || !exercise) continue
    // Newer Strong exports include "Rest Timer" pseudo-sets.
    const setOrderRaw = (raw["Set Order"] ?? "").trim()
    if (/rest/i.test(setOrderRaw)) continue

    const reps = num(raw["Reps"]) ?? 0
    const weight = parseWeightKg(raw)
    const rpe = num(raw["RPE"])
    const share = bodyweightShare(exercise)
    const bw = share > 0 ? bodyweightAt(date) : null
    let effectiveLoad = weight
    if (bw != null) {
      effectiveLoad = isAssisted(exercise) ? Math.max(bw * share - weight, 0) : bw * share + weight
    }

    const workoutName = raw["Workout Name"]?.trim() || "Workout"
    const workoutNo = raw["Workout #"]?.trim()
    rows.push({
      workoutId: workoutNo ? `w${workoutNo}` : `${date.toISOString()}|${workoutName}`,
      date,
      workoutName,
      durationSec: parseDuration(raw),
      exercise,
      setOrder: num(setOrderRaw) ?? 0,
      isWarmup: /^w/i.test(setOrderRaw),
      weight,
      reps,
      rpe,
      distanceM: num(raw["Distance (meters)"] ?? raw["Distance"]),
      seconds: num(raw["Seconds"]),
      notes: raw["Notes"]?.trim() ?? "",
      muscle: muscleGroupFor(exercise),
      effectiveLoad,
      e1rm: estimateOneRepMax(effectiveLoad, reps, rpe),
      volume: effectiveLoad * reps,
    })
  }

  if (!rows.length) throw new StrongParseError("No sets found in the file.")
  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.setOrder - b.setOrder)
  return rows
}
