const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const oneFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const compactFmt = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })

export const fmtInt = (n: number) => intFmt.format(n)
export const fmt1 = (n: number) => oneFmt.format(n)
export const fmtCompact = (n: number) => compactFmt.format(n)

export type WeightUnit = "kg" | "lb"
export const KG_PER_LB = 0.45359237

/** The unit weights are shown in. Data is always stored in kg; the store sets this before rendering. */
let displayUnit: WeightUnit = "kg"
export const setWeightUnit = (unit: WeightUnit) => {
  displayUnit = unit
}
export const weightUnit = () => displayUnit
/** kg → the display unit. */
export const toUnit = (kg: number) => (displayUnit === "lb" ? kg / KG_PER_LB : kg)
/** Display unit → kg, for values typed into inputs. */
export const fromUnit = (v: number) => (displayUnit === "lb" ? v * KG_PER_LB : v)

export const fmtKg = (kg: number) => `${oneFmt.format(toUnit(kg))} ${displayUnit}`
export const fmtKgInt = (kg: number) => `${intFmt.format(toUnit(kg))} ${displayUnit}`
export function fmtTonnes(kg: number) {
  if (displayUnit === "lb") {
    const lb = toUnit(kg)
    return lb >= 10_000 ? `${oneFmt.format(lb / 1000)}k lb` : `${intFmt.format(lb)} lb`
  }
  return kg >= 1000 ? `${oneFmt.format(kg / 1000)} t` : `${intFmt.format(kg)} kg`
}
export const fmtPct = (n: number, signed = true) => `${signed && n > 0 ? "+" : ""}${oneFmt.format(n)}%`
