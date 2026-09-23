/** Above this rep count, 1RM estimates are too noisy to use for strength modelling. */
export const MAX_REPS_FOR_E1RM = 20

/**
 * Estimated one-rep max.
 *
 * Brzycki is the most accurate at ≤10 reps; Epley degrades more gracefully above
 * that. When RPE is logged, reps in reserve (10 − RPE) are added, so a set of
 * 5 @ RPE 8 is treated like a 7-rep max (Helms et al., 2016).
 */
export function estimateOneRepMax(load: number, reps: number, rpe: number | null = null): number {
  if (load <= 0 || reps <= 0) return 0
  const rir = rpe != null && rpe >= 5 && rpe <= 10 ? 10 - rpe : 0
  const effectiveReps = reps + rir
  if (effectiveReps > MAX_REPS_FOR_E1RM) return 0
  if (effectiveReps === 1) return load
  if (effectiveReps <= 10) return load * (36 / (37 - effectiveReps))
  return load * (1 + effectiveReps / 30)
}

/** Inverse of Brzycki/Epley: weight you should manage for `reps` given a 1RM. */
export function loadForReps(oneRepMax: number, reps: number): number {
  if (reps <= 1) return oneRepMax
  if (reps <= 10) return (oneRepMax * (37 - reps)) / 36
  return oneRepMax / (1 + reps / 30)
}
