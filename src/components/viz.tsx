import { curveMonotoneX } from "@visx/curve"
import type { ReactNode } from "react"
import { Bar } from "@/components/charts/bar"
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

export function SeriesLegend({ series }: { series: Series[] }) {
  const items = series.filter((s) => !s.hideInLegend)
  if (items.length < 2) return null
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

export function TimeLineChart({
  data,
  series,
  format,
  height = 260,
  children,
  xKey = "date",
  includeY,
}: {
  data: Record<string, unknown>[]
  series: Series[]
  format: (v: number) => string
  height?: number
  children?: ReactNode
  xKey?: string
  /** Values the y-axis must reach, e.g. the top of a reference band. */
  includeY?: number[]
}) {
  if (data.length < 2) return <EmptyChart>Not enough data for a trend yet</EmptyChart>
  let yDomainMax: number | undefined
  if (includeY?.length) {
    const values = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number")
    // Only for non-negative series: a fixed max implies a zero baseline.
    if (!values.some((v) => v < 0)) yDomainMax = Math.max(...values, ...includeY)
  }
  return (
    <div>
      <SeriesLegend series={series} />
      <LineChart aspectRatio="" data={data} margin={{ left: 44 }} style={{ height }} xDataKey={xKey} yDomainMax={yDomainMax}>
        <Grid horizontal />
        {children}
        {series.map((s) => (
          <Line
            curve={curveMonotoneX}
            dashFromIndex={s.dashFromIndex}
            dataKey={s.key}
            fadeEdges={false}
            key={s.key}
            showHighlight={false}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
          />
        ))}
        <YAxis formatValue={format} />
        <XAxis />
        <ChartTooltip
          rows={(p) =>
            series.map((s) => ({
              color: s.color,
              label: s.label,
              value: s.hideInTooltip || typeof p[s.key] !== "number" ? "–" : format(p[s.key] as number),
            }))
          }
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
