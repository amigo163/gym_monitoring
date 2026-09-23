import { useMemo, useState } from "react"
import { RadarArea } from "@/components/charts/radar-area"
import { RadarAxis } from "@/components/charts/radar-axis"
import { RadarChart } from "@/components/charts/radar-chart"
import { RadarGrid } from "@/components/charts/radar-grid"
import { RadarLabels } from "@/components/charts/radar-labels"
import { ReferenceArea } from "@/components/charts/reference-area"
import { MUSCLE_COLOR, MuscleBadge, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CategoryBarChart, ChartCard, EmptyChart, SERIES, SeriesLegend, TimeLineChart } from "@/components/viz"
import { exerciseUsage, muscleDistribution, weeklyMuscleSets, workingSets } from "@/lib/analysis"
import { formatMonth, startOfMonth } from "@/lib/dates"
import { fmt1, fmtInt, fmtTonnes, weightUnit } from "@/lib/format"
import { personalLandmarks, VOLUME_GROUPS } from "@/lib/models/volume"
import { TRAINABLE_GROUPS } from "@/lib/muscles"
import type { MuscleGroup } from "@/lib/types"
import { useData, useStore } from "@/state/store"

function volumeStatus(sets: number, lm: { mev: number; mavHigh: number; mrv: number }) {
  if (sets < lm.mev) return { label: "Below MEV", variant: "outline" as const }
  if (sets <= lm.mavHigh) return { label: "Productive", variant: "secondary" as const }
  if (sets <= lm.mrv) return { label: "Near MRV", variant: "outline" as const }
  return { label: "Above MRV", variant: "destructive" as const }
}

export function MusclesPage() {
  const { rows, sessions, allRows } = useData()
  const { profile } = useStore()
  const [muscle, setMuscle] = useState<MuscleGroup>("Chest")

  const distribution = useMemo(() => muscleDistribution(rows), [rows])
  const weekly = useMemo(() => weeklyMuscleSets(rows), [rows])
  const usage = useMemo(() => exerciseUsage(sessions), [sessions])
  const trainingYears =
    profile.priorTrainingYears + (allRows.at(-1)!.date.getTime() - allRows[0].date.getTime()) / (365.25 * 86_400_000)

  // Balance radar: weekly hard sets as a share of each group's own productive target
  // (legs need more sets than shoulders to be "trained enough"), scaled so the top group = 100.
  // A round shape means every group gets the same fraction of what it needs.
  const radar = useMemo(() => {
    const shares = (weeks: typeof weekly) => {
      const ratios = Object.fromEntries(
        TRAINABLE_GROUPS.map((g) => {
          const l = personalLandmarks(g, profile, trainingYears)
          const perWeek = weeks.length ? weeks.reduce((a, w) => a + (w[g] ?? 0), 0) / weeks.length : 0
          return [g, l ? perWeek / ((l.mavLow + l.mavHigh) / 2) : 0]
        }),
      )
      const max = Math.max(...Object.values(ratios), 1e-9)
      return Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, (v / max) * 100]))
    }
    return [
      { label: "Selected range", color: SERIES[0], values: shares(weekly) },
      { label: "Last 4 weeks", color: SERIES[1], values: shares(weekly.slice(-4)) },
    ]
  }, [weekly, profile, trainingYears])

  const monthly = useMemo(() => {
    const map = new Map<number, Record<string, unknown>>()
    for (const r of workingSets(rows)) {
      const m = startOfMonth(r.date)
      const row = map.get(m.getTime()) ?? { month: formatMonth(m) }
      row[r.muscle] = ((row[r.muscle] as number) ?? 0) + r.volume
      map.set(m.getTime(), row)
    }
    return [...map.values()].map((row) => {
      for (const g of TRAINABLE_GROUPS) row[g] ??= 0
      return row
    })
  }, [rows])

  const lm = personalLandmarks(muscle, profile, trainingYears)
  const muscleWeekly = weekly.map((w) => ({ date: w.date, sets: w[muscle] ?? 0 }))
  const avg = (g: MuscleGroup) => {
    const recent = weekly.slice(-4)
    return recent.length ? recent.reduce((a, w) => a + (w[g] ?? 0), 0) / recent.length : 0
  }

  return (
    <>
      <PageHeader
        description="How your training is spread across muscle groups, and whether weekly volume sits in the productive range for your recovery capacity"
        title="Muscle groups"
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard className="lg:col-span-2" description="Weekly sets relative to each group's productive target (top group = 100). Round = balanced." title="Balance">
          <SeriesLegend series={radar.map((r, i) => ({ key: String(i), label: r.label, color: r.color }))} />
          <div className="flex justify-center">
            <RadarChart
              data={radar}
              metrics={TRAINABLE_GROUPS.map((g) => ({ key: g, label: g }))}
              size={300}
            >
              <RadarGrid />
              <RadarAxis />
              <RadarLabels fontSize={11} offset={16} />
              {radar.map((r, i) => (
                <RadarArea color={r.color} index={i} key={r.label} />
              ))}
            </RadarChart>
          </div>
        </ChartCard>
        <ChartCard className="lg:col-span-3" description={`Volume (${weightUnit()}) per month, stacked by group`} title="Monthly volume by group">
          <SeriesLegend series={TRAINABLE_GROUPS.map((g) => ({ key: g, label: g, color: MUSCLE_COLOR[g] }))} />
          <CategoryBarChart
            data={monthly}
            format={fmtTonnes}
            height={280}
            series={TRAINABLE_GROUPS.map((g) => ({ key: g, label: g, color: MUSCLE_COLOR[g], hideInLegend: true }))}
            stacked
            xKey="month"
          />
        </ChartCard>
      </div>

      <ChartCard
        action={
          <ToggleGroup onValueChange={(v) => v && setMuscle(v as MuscleGroup)} size="sm" type="single" value={muscle} variant="outline">
            {VOLUME_GROUPS.map((g) => (
              <ToggleGroupItem key={g} value={g}>
                {g}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
        className="mt-4"
        description={
          lm
            ? "Hard sets per week against your volume landmarks, personalised from your recovery inputs and training age."
            : "Hard sets per week"
        }
        title={`Weekly sets · ${muscle}`}
      >
        {lm && muscleWeekly.length >= 2 ? (
          <SeriesLegend
            bands={[
              { label: `Productive (${lm.mev}–${lm.mavHigh})`, color: "var(--status-good)" },
              { label: `Above recoverable (${lm.mrv}+)`, color: "var(--status-critical)" },
            ]}
            series={[{ key: "sets", label: "Hard sets", color: MUSCLE_COLOR[muscle] }]}
          />
        ) : null}
        {muscleWeekly.length >= 2 ? (
          <TimeLineChart
            data={muscleWeekly}
            format={fmt1}
            includeY={lm ? [lm.mrv] : undefined}
            series={[{ key: "sets", label: "Sets", color: MUSCLE_COLOR[muscle] }]}
          >
            {lm ? (
              <>
                <ReferenceArea fill="var(--status-good)" fillOpacity={0.1} y1={lm.mev} y2={lm.mavHigh} />
                <ReferenceArea fill="var(--status-critical)" fillOpacity={0.08} y2={lm.mrv} />
              </>
            ) : null}
          </TimeLineChart>
        ) : (
          <EmptyChart>Not enough weeks in this range</EmptyChart>
        )}
      </ChartCard>

      <ChartCard className="mt-4" title="Group summary">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Sets</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">Sets/wk (last 4)</TableHead>
              <TableHead className="text-right">Productive range</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Top exercise</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {distribution.map((d) => {
              const l = personalLandmarks(d.muscle, profile, trainingYears)
              const a = avg(d.muscle)
              const status = l ? volumeStatus(a, l) : null
              return (
                <TableRow key={d.muscle}>
                  <TableCell>
                    <MuscleBadge muscle={d.muscle} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(d.sets)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtTonnes(d.volume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt1(a)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {l ? `${l.mev}–${l.mavHigh}` : "–"}
                  </TableCell>
                  <TableCell>{status ? <Badge variant={status.variant}>{status.label}</Badge> : null}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {usage.find((u) => u.muscle === d.muscle)?.exercise ?? "–"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ChartCard>
    </>
  )
}
