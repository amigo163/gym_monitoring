import { curveMonotoneX } from "@visx/curve"
import { area } from "d3-shape"
import type { ReactNode } from "react"
import { Bar } from "@/components/charts/bar"
import { useChartStable } from "@/components/charts/chart-context"
import { BarChart } from "@/components/charts/bar-chart"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Grid } from "@/components/charts/grid"
import { Line } from "@/components/charts/line"
import { LineChart } from "@/components/charts/line-chart"
import { ChartTooltip } from "@/components/charts/tooltip"
import { XAxis } from "@/components/charts/x-axis"
import { YAxis } from "@/components/charts/y-axis"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dataGaps } from "@/lib/analysis"
import { cn } from "@/lib/utils"

/** Categorical slots, in the validated fixed order. Never cycle past these. */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const

export interface Series {
  key: string
  label: string
  color: string
  /** Index from which the line is dashed (projection). */
  dashFromIndex?: number
  strokeWidth?: number
  /** Draw the legend swatch dashed (projections). */
  legendDashed?: boolean
  /** Leave out of the legend (e.g. confidence bounds). */
  hideInLegend?: boolean
  /** Omit from tooltip rows. */
  hideInTooltip?: boolean
}

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}

export function SeriesLegend({
  series,
  bands = [],
  gaps = false,
}: {
  series: Series[]
  bands?: Pick<Band, "label" | "color">[]
  /** Add a "No data" entry for dotted gap segments. */
  gaps?: boolean
}) {
  const items = series.filter((s) => !s.hideInLegend)
  if (items.length + bands.length + (gaps ? 1 : 0) < 2) return null
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((s) => (
        <li className="flex items-center gap-1.5" key={s.key}>
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{
              background: s.legendDashed ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color,
            }}
          />
          {s.label}
        </li>
      ))}
      {bands.map((b) => (
        <li className="flex items-center gap-1.5" key={b.label}>
          <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm" style={{ background: b.color, opacity: 0.25 }} />
          {b.label}
        </li>
      ))}
      {gaps ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4"
            style={{ background: "radial-gradient(circle, currentColor 1px, transparent 1.5px) 0 50% / 5px 2px repeat-x" }}
          />
          No data
        </li>
      ) : null}
    </ul>
  )
}

export function EmptyChart({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-[240px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground", className)}>
      {children}
    </div>
  )
}

/** A shaded range between two keys (e.g. a forecast's 80% interval). */
export interface Band {
  lower: string
  upper: string
  label: string
  color: string
}

function BandArea({ band }: { band: Band }) {
  const { data, xScale, yScale, xAccessor } = useChartStable()
  // Start where the range opens (from the point before it), so nothing is drawn under the history.
  const opens = data.findIndex((d) => typeof d[band.lower] === "number" && d[band.lower] !== d[band.upper])
  const points = opens < 0 ? [] : data.slice(Math.max(0, opens - 1)).filter((d) => typeof d[band.lower] === "number" && typeof d[band.upper] === "number")
  const path = area<Record<string, unknown>>()
    .x((d) => xScale(xAccessor(d)))
    .y0((d) => yScale(d[band.lower] as number))
    .y1((d) => yScale(d[band.upper] as number))
    .curve(curveMonotoneX)(points)
  return path ? <path d={path} fill={band.color} fillOpacity={0.14} /> : null
}

export function TimeLineChart({
  data,
  series,
  format,
  height = 260,
  children,
  xKey = "date",
  includeY,
  band,
  showGaps = false,
  unit,
  regions = [],
}: {
  data: Record<string, unknown>[]
  series: Series[]
  format: (v: number) => string
  height?: number
  children?: ReactNode
  xKey?: string
  /** Shown above the y-axis and after tooltip values, e.g. "kg". */
  unit?: string
  /** Values the y-axis must reach, e.g. the top of a reference band. */
  includeY?: number[]
  band?: Band
  /** Legend entries for shaded regions passed as children, e.g. `<ReferenceArea>`s. */
  regions?: Pick<Band, "label" | "color">[]
  /**
   * Draw long stretches without data (well beyond the series' usual spacing)
   * dotted. Only for sparse measurements; aggregates that are genuinely 0
   * should carry the zero instead.
   */
  showGaps?: boolean
}) {
  if (data.length < 2) return <EmptyChart>Not enough data for a trend yet</EmptyChart>
  let yDomainMax: number | undefined
  if (includeY?.length) {
    const values = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number")
    // Only for non-negative series: a fixed max implies a zero baseline.
    if (!values.some((v) => v < 0)) yDomainMax = Math.max(...values, ...includeY)
  }
  const gapsByKey = new Map(
    series.map((s) => {
      if (!showGaps) return [s.key, [] as [number, number][]]
      const points = data.flatMap((d, i) => (typeof d[s.key] === "number" ? [i] : []))
      const dates = points.map((i) => data[i][xKey] as Date)
      const dashFrom = s.dashFromIndex
      // Only logged points count: the projected tail is evenly spaced by construction.
      const until = dashFrom == null ? undefined : points.filter((i) => i <= dashFrom).length - 1
      // Gap indices are over the defined points; the line only has vertices there, so map back to rows.
      return [s.key, dataGaps(dates, until).map((g): [number, number] => [points[g], points[g + 1]])]
    }),
  )
  const hasGaps = [...gapsByKey.values()].some((g) => g.length > 0)
  const withUnit = (v: number) => (unit ? `${format(v)} ${unit}` : format(v))
  return (
    <div>
      <SeriesLegend bands={[...(band ? [band] : []), ...regions]} gaps={hasGaps} series={series} />
      {unit ? <div className="-mb-2 text-xs text-muted-foreground">{unit}</div> : null}
      <LineChart aspectRatio="" data={data} margin={{ left: 44 }} style={{ height }} xDataKey={xKey} yDomainMax={yDomainMax}>
        <Grid horizontal />
        {children}
        {band ? <BandArea band={band} /> : null}
        {/* Invisible bounds keep the band inside the y-domain. */}
        {band
          ? [band.lower, band.upper].map((key) => (
              <Line dataKey={key} fadeEdges={false} key={key} showHighlight={false} stroke="transparent" strokeWidth={0} />
            ))
          : null}
        {series.map((s) => (
          <Line
            curve={curveMonotoneX}
            dashFromIndex={s.dashFromIndex}
            dataKey={s.key}
            fadeEdges={false}
            gapSegments={gapsByKey.get(s.key)}
            key={s.key}
            showHighlight={false}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
          />
        ))}
        <YAxis formatValue={format} />
        <XAxis />
        <ChartTooltip
          rows={(p) => [
            ...series.map((s) => ({
              color: s.color,
              label: s.label,
              value: s.hideInTooltip || typeof p[s.key] !== "number" ? "–" : withUnit(p[s.key] as number),
            })),
            ...(band && typeof p[band.lower] === "number" && typeof p[band.upper] === "number" && p[band.upper] !== p[band.lower]
              ? [{ color: band.color, label: band.label, value: `${format(p[band.lower] as number)}–${withUnit(p[band.upper] as number)}` }]
              : []),
          ]}
        />
      </LineChart>
    </div>
  )
}

export function CategoryBarChart({
  data,
  xKey,
  series,
  format,
  height = 240,
  stacked = false,
  horizontal = false,
}: {
  data: Record<string, unknown>[]
  xKey: string
  series: Series[]
  format: (v: number) => string
  height?: number
  stacked?: boolean
  /** Horizontal bars with category labels on the left — for long names. */
  horizontal?: boolean
}) {
  if (!data.length) return <EmptyChart>No data in this range</EmptyChart>
  return (
    <div>
      <SeriesLegend series={series} />
      <div style={{ height }}>
        <BarChart
          aspectRatio=""
          className="h-full"
          data={data}
          margin={horizontal ? { left: 150, right: 16 } : { left: 44 }}
          orientation={horizontal ? "horizontal" : "vertical"}
          stacked={stacked}
          xDataKey={xKey}
        >
          <Grid horizontal={!horizontal} vertical={horizontal} />
          {series.map((s) => (
            <Bar dataKey={s.key} fill={s.color} key={s.key} lineCap={4} />
          ))}
          {horizontal ? <BarYAxis /> : <YAxis formatValue={format} />}
          {horizontal ? null : <BarXAxis />}
          <ChartTooltip
            rows={(p) =>
              series.map((s) => ({
                color: s.color,
                label: s.label,
                value: typeof p[s.key] === "number" ? format(p[s.key] as number) : "–",
              }))
            }
          />
        </BarChart>
      </div>
    </div>
  )
}
