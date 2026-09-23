import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  HeatmapCells,
  HeatmapChart,
  type HeatmapColumn,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from "@/components/charts/heatmap"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addDays, dayKey, startOfDay } from "@/lib/dates"
import { MUSCLE_GROUPS } from "@/lib/muscles"
import type { MuscleGroup } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SERIES } from "./viz"

/** Colour follows the muscle group everywhere, regardless of rank or filter. */
export const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  Chest: SERIES[0],
  Back: SERIES[1],
  Legs: SERIES[2],
  Shoulders: SERIES[3],
  Arms: SERIES[4],
  Core: SERIES[5],
  Cardio: SERIES[6],
  Olympic: SERIES[7],
  Compound: "var(--muted-foreground)",
  Other: "var(--muted-foreground)",
}

export function MuscleBadge({ muscle }: { muscle: MuscleGroup }) {
  return (
    <Badge className="gap-1.5 font-normal" variant="outline">
      <span aria-hidden className="size-2 rounded-full" style={{ background: MUSCLE_COLOR[muscle] }} />
      {muscle}
    </Badge>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <Card className={cn("gap-1 py-4", className)}>
      <CardContent className="grid gap-1 px-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {Icon ? <Icon className="size-3.5" /> : null}
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function ExerciseSelect({
  exercises,
  value,
  onChange,
  className,
}: {
  exercises: { exercise: string; muscle: MuscleGroup; sessions: number }[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const groups = MUSCLE_GROUPS.map((m) => ({ muscle: m, items: exercises.filter((e) => e.muscle === m) })).filter((g) => g.items.length)
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label="Exercise" className={cn("w-full sm:w-72", className)}>
        <SelectValue placeholder="Pick an exercise" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g.muscle}>
            <SelectLabel>{g.muscle}</SelectLabel>
            {g.items.map((e) => (
              <SelectItem key={e.exercise} value={e.exercise}>
                {e.exercise} <span className="text-muted-foreground">· {e.sessions}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Contribution-style calendar: one column per week (Sun–Sat), one cell per day, shaded by working sets. */
export function CalendarHeatmap({ counts, from, to }: { counts: Map<string, number>; from: Date; to: Date }) {
  // The heatmap shades by fixed levels 0–4; map sets onto them relative to your busiest day.
  const max = Math.max(...counts.values(), 1)
  const level = (sets: number) => (sets <= 0 ? 0 : Math.min(4, Math.ceil((sets / max) * 4)))
  const columns: HeatmapColumn[] = []
  const start = startOfDay(from)
  start.setDate(start.getDate() - start.getDay())
  for (let week = start, col = 0; week <= to; week = addDays(week, 7), col++) {
    columns.push({
      bin: col,
      bins: Array.from({ length: 7 }, (_, d) => {
        const date = addDays(week, d)
        return { bin: d, date, count: level(counts.get(dayKey(date)) ?? 0) }
      }),
    })
  }
  return (
    <HeatmapInteractionProvider>
      <HeatmapInteractionBoundary>
        <div className="flex w-full flex-col items-stretch gap-3">
          <HeatmapChart
            className="w-full"
            data={columns}
            layout="fluid"
            maxBinSize={20}
            levelColors={["var(--muted)", "var(--chart-scale-02)", "var(--chart-scale-03)", "var(--chart-scale-04)", "var(--chart-scale-05)"]}
          >
            <HeatmapCells />
            <HeatmapXAxis />
            <HeatmapYAxis />
            <HeatmapTooltip
              formatLabel={(_, date) => {
                const sets = counts.get(dayKey(date)) ?? 0
                return sets ? `${sets} working ${sets === 1 ? "set" : "sets"}` : "Rest day"
              }}
            />
          </HeatmapChart>
          <HeatmapLegend />
        </div>
      </HeatmapInteractionBoundary>
    </HeatmapInteractionProvider>
  )
}
