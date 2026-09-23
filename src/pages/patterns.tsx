import { useMemo } from "react"
import { PageHeader, StatCard } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CategoryBarChart, ChartCard, SERIES, TimeLineChart } from "@/components/viz"
import { hourCounts, restDayHistogram, weekStreaks, weekdayCounts, weeklySeries } from "@/lib/analysis"
import { WEEKDAYS, formatDate } from "@/lib/dates"
import { fmt1, fmtInt } from "@/lib/format"
import { useData } from "@/state/store"

export function PatternsPage() {
  const { workouts } = useData()
  const weekly = useMemo(() => weeklySeries(workouts), [workouts])
  const weekdays = useMemo(() => weekdayCounts(workouts), [workouts])
  const hours = useMemo(() => hourCounts(workouts), [workouts])
  const rest = useMemo(() => restDayHistogram(workouts), [workouts])
  const streaks = useMemo(() => weekStreaks(workouts), [workouts])

  const durations = workouts
    .filter((w) => w.durationSec > 0)
    .map((w) => ({ date: w.date, minutes: w.durationSec / 60, density: w.volume / (w.durationSec / 60) }))

  const templates = useMemo(() => {
    const map = new Map<string, { name: string; count: number; minutes: number; last: Date }>()
    for (const w of workouts) {
      const t = map.get(w.name) ?? { name: w.name, count: 0, minutes: 0, last: w.date }
      t.count += 1
      t.minutes += w.durationSec / 60
      t.last = w.date
      map.set(w.name, t)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [workouts])

  const firstHour = hours.findIndex((c) => c > 0)
  const lastHour = 23 - [...hours].reverse().findIndex((c) => c > 0)
  const hourData =
    firstHour >= 0
      ? hours.slice(firstHour, lastHour + 1).map((count, i) => ({ hour: `${String(firstHour + i).padStart(2, "0")}h`, count }))
      : []
  const favouriteDay = WEEKDAYS[weekdays.indexOf(Math.max(...weekdays))]
  const gaps = rest.reduce((a, b, i) => a + b.count * Math.min(i, 7), 0) / Math.max(1, rest.reduce((a, b) => a + b.count, 0))

  return (
    <>
      <PageHeader description="When, how often and how long you train" title="Workout patterns" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard hint="Most workouts start on" label="Favourite day" value={workouts.length ? favouriteDay : "–"} />
        <StatCard hint="Between training days" label="Avg rest" value={`${fmt1(gaps)} days`} />
        <StatCard hint={`Longest: ${streaks.longest}`} label="Current week streak" value={streaks.current} />
        <StatCard
          hint="kg lifted per minute"
          label="Avg density"
          value={durations.length ? fmtInt(durations.reduce((a, d) => a + d.density, 0) / durations.length) : "–"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard description="Sessions per week" title="Training frequency">
          <TimeLineChart data={weekly as unknown as Record<string, unknown>[]} format={fmtInt} series={[{ key: "workouts", label: "Workouts", color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard description="Minutes per workout" title="Workout duration">
          <TimeLineChart data={durations} format={fmtInt} series={[{ key: "minutes", label: "Minutes", color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard description="Workouts started on each weekday" title="Day of week">
          <CategoryBarChart
            data={WEEKDAYS.map((d, i) => ({ day: d, count: weekdays[i] }))}
            format={fmtInt}
            series={[{ key: "count", label: "Workouts", color: SERIES[0] }]}
            xKey="day"
          />
        </ChartCard>
        <ChartCard description="Workout start time" title="Time of day">
          <CategoryBarChart data={hourData} format={fmtInt} series={[{ key: "count", label: "Workouts", color: SERIES[0] }]} xKey="hour" />
        </ChartCard>
        <ChartCard description="Days off between consecutive training days" title="Rest days">
          <CategoryBarChart data={rest} format={fmtInt} series={[{ key: "count", label: "Times", color: SERIES[0] }]} xKey="label" />
        </ChartCard>
        <ChartCard description="kg lifted per minute of workout" title="Training density">
          <TimeLineChart data={durations} format={fmtInt} series={[{ key: "density", label: "kg/min", color: SERIES[0] }]} />
        </ChartCard>
      </div>

      <ChartCard className="mt-4" description="Workout names as logged in Strong" title="Routines">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Routine</TableHead>
              <TableHead className="text-right">Times</TableHead>
              <TableHead className="text-right">Avg minutes</TableHead>
              <TableHead className="text-right">Last done</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.name}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(t.minutes / t.count)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDate(t.last)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartCard>
    </>
  )
}
