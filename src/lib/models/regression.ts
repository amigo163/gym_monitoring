export interface LinearFit {
  slope: number
  intercept: number
  r2: number
  residualSd: number
  predict: (x: number) => number
}

/** Ordinary least squares y = intercept + slope·x. */
export function linearFit(xs: number[], ys: number[]): LinearFit {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  const slope = sxx > 0 ? sxy / sxx : 0
  const intercept = my - slope * mx
  const predict = (x: number) => intercept + slope * x
  let ssr = 0
  let sst = 0
  for (let i = 0; i < n; i++) {
    ssr += (ys[i] - predict(xs[i])) ** 2
    sst += (ys[i] - my) ** 2
  }
  return {
    slope,
    intercept,
    r2: sst > 0 ? 1 - ssr / sst : 0,
    residualSd: n > 2 ? Math.sqrt(ssr / (n - 2)) : 0,
    predict,
  }
}

/** Logarithmic trend y = a + b·ln(1 + x): the classic diminishing-returns curve. */
export function logFit(xs: number[], ys: number[]) {
  const fit = linearFit(xs.map((x) => Math.log1p(Math.max(x, 0))), ys)
  return { ...fit, predict: (x: number) => fit.predict(Math.log1p(Math.max(x, 0))) }
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}
