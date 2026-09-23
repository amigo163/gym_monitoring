// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react"
import { curveLinear } from "d3-shape"
import { describe, expect, it, vi } from "vitest"
import { computeSeriesPathPoints, seriesPathFromPoints } from "./series-path-utils"
import { useAnimatedSeriesPath, type UseAnimatedSeriesPathOptions } from "./use-animated-series-path"

// Drive motion's tweens by hand so each "frame" is deterministic.
const tweens: { onUpdate: (v: number) => void; onComplete: () => void; stopped: boolean }[] = []
vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  animate: (_from: number, _to: number, opts: { onUpdate: (v: number) => void; onComplete: () => void }) => {
    const tween = { ...opts, stopped: false }
    tweens.push(tween)
    return { stop: () => (tween.stopped = true) }
  },
}))

function frame(progress: number) {
  act(() => {
    for (const t of tweens.filter((t) => !t.stopped)) {
      t.onUpdate(progress)
      if (progress >= 1) {
        t.stopped = true
        t.onComplete()
      }
    }
  })
}

const dates = [new Date(2025, 0, 1), new Date(2025, 0, 8), new Date(2025, 0, 15)]
const rows = (values: number[]) => values.map((value, i) => ({ date: dates[i], value }))
const xAccessor = (d: Record<string, unknown>) => d.date as Date
const xScale = Object.assign((d: Date) => (d.getTime() - dates[0].getTime()) / 86_400_000, {
  domain: () => [dates[0], dates[2]],
})
const yScaleFor = (max: number) => (v: number) => 100 - (v / max) * 100

function props(overrides: Partial<UseAnimatedSeriesPathOptions>): UseAnimatedSeriesPathOptions {
  return {
    renderData: rows([80, 90, 100]),
    xAccessor,
    xScale,
    yScale: yScaleFor(110),
    dataKey: "value",
    curve: curveLinear,
    chartPhase: "ready",
    durationMs: 500,
    innerWidth: 300,
    enabled: true,
    ...overrides,
  }
}

describe("useAnimatedSeriesPath", () => {
  it("settles on the new data when the y-scale tweens alongside it", () => {
    const { result, rerender } = renderHook((p: UseAnimatedSeriesPathOptions) => useAnimatedSeriesPath(p), {
      initialProps: props({}),
    })

    // Switch metric (e.g. Est. 1RM → Volume): new values, and a y-domain the
    // chart tweens over the same frames, producing a fresh yScale each time.
    const next = rows([1500, 2500, 3800])
    rerender(props({ renderData: next }))
    const maxes = [500, 1500, 3000, 4180]
    maxes.forEach((max, i) => {
      frame((i + 1) / (maxes.length + 1))
      rerender(props({ renderData: next, yScale: yScaleFor(max) }))
    })
    frame(1)

    const expected = seriesPathFromPoints(
      computeSeriesPathPoints(next, xAccessor, xScale, yScaleFor(4180), "value"),
      curveLinear,
    )
    expect(result.current.isPathAnimating).toBe(false)
    expect(result.current.pathD).toBe(expected)
  })
})
