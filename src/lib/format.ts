const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const oneFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const compactFmt = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })

export const fmtInt = (n: number) => intFmt.format(n)
export const fmt1 = (n: number) => oneFmt.format(n)
export const fmtCompact = (n: number) => compactFmt.format(n)
export const fmtKg = (n: number) => `${oneFmt.format(n)} kg`
export const fmtTonnes = (kg: number) => (kg >= 1000 ? `${oneFmt.format(kg / 1000)} t` : `${intFmt.format(kg)} kg`)
export const fmtPct = (n: number, signed = true) => `${signed && n > 0 ? "+" : ""}${oneFmt.format(n)}%`
