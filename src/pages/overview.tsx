import { CalendarCheck, Clock, Dumbbell, Flame, Layers, Repeat, Trophy, Weight } from "lucide-react"
import { useMemo } from "react"
import { PieCenter } from "@/components/charts/pie-center"
import { PieChart } from "@/components/charts/pie-chart"
import { PieSlice } from "@/components/charts/pie-slice"
import { CalendarHeatmap, MUSCLE_COLOR, MuscleBadge, PageHeader, StatCard } from "@/components/common"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CategoryBarChart, ChartCard, EmptyChart, SERIES, TimeLineChart } from "@/components/viz"
import {
  dailySets,
  exerciseUsage,
  muscleDistribution,
  overviewStats,
  weeklySeries,
} from "@/lib/analysis"
import { formatDate } from "@/lib/dates"
import { fmt1, fmtInt, fmtKg, fmtTonnes } from "@/lib/format"
import { useData } from "@/state/store"

export function OverviewPage() {
  const { workouts, prs, rows, sessions } = useData()
  const stats = useMemo(() => overviewStats(workouts, prs), [workouts, prs])
  const weekly = useMemo(() => weeklySeries(workouts), [workouts])
  const muscles = useMemo(() => muscleDistribution(rows), [rows])
  const topExercises = useMemo(() => exerciseUsage(sessions).slice(0, 8), [sessions])
  const counts = useMemo(() => dailySets(workouts), [workouts])
  const recentPrs = prs.filter((p) => p.kind === "e1rm").slice(0, 6)

  const totalSets = muscles.reduce((a, m) => a + m.sets, 0)
  const pieData = muscles.map((m) => ({ label: m.muscle, value: m.sets, color: MUSCLE_COLOR[m.muscle] }))

  return (
    <>
      <PageHeader
        description={
          stats.firstDate && stats.lastDate
            ? `${formatDate(stats.firstDate)} – ${formatDate(stats.lastDate)}`
            : undefined
        }
        title="Overview"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard hint={`${fmt1(stats.workoutsPerWeek)} per week`} icon={CalendarCheck} label="Workouts" value={fmtInt(stats.workouts)} />
        <StatCard hint="Load × reps, working sets" icon={Weight} label="Total volume" value={fmtTonnes(stats.volume)} />
        <StatCard hint={`${fmtInt(stats.reps)} reps`} icon={Layers} label="Working sets" value={fmtInt(stats.sets)} />
        <StatCard hint="Per workout" icon={Clock} label="Avg duration" value={`${fmtInt(stats.avgDurationMin)} min`} />
        <StatCard hint={`Longest: ${stats.longestWeekStreak} weeks`} icon={Flame} label="Week streak" value={stats.currentWeekStreak} />
        <StatCard hint="Estimated 1RM records" icon={Trophy} label="PRs" value={fmtInt(prs.filter((p) => p.kind === "e1rm").length)} />
        <StatCard hint="Distinct movements" icon={Dumbbell} label="Exercises" value={fmtInt(stats.exercises)} />
        <StatCard
          hint="Average per workout"
          icon={Repeat}
          label="Sets / workout"
          value={stats.workouts ? fmt1(stats.sets / stats.workouts) : "–"}
        />
      </div>

      <div className="mt-4 grid gap-4">
        <ChartCard description="Each square is a day, shaded by working sets" title="Training calendar">
          {stats.firstDate && stats.lastDate ? (
            <CalendarHeatmap counts={counts} from={stats.firstDate} to={stats.lastDate} />
          ) : (
            <EmptyChart>No workouts in this range</EmptyChart>
          )}
        </ChartCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard description="Total load lifted per week (kg)" title="Weekly volume">
            <TimeLineChart
              data={weekly as unknown as Record<string, unknown>[]}
              format={fmtTonnes}
              series={[{ key: "volume", label: "Volume", color: SERIES[0] }]}
            />
          </ChartCard>
          <ChartCard description="Working sets per week" title="Weekly sets">
            <TimeLineChart
              data={weekly as unknown as Record<string, unknown>[]}
              format={fmtInt}
              series={[{ key: "sets", label: "Sets", color: SERIES[0] }]}
            />
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <ChartCard className="lg:col-span-2" description="Share of working sets" title="Muscle groups">
            {pieData.length ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <PieChart data={pieData} innerRadius={62} size={200}>
                  {pieData.map((d, i) => (
                    <PieSlice index={i} key={d.label} />
                  ))}
                  <PieCenter defaultLabel="Sets" />
                </PieChart>
                <ul className="grid w-full gap-1.5 text-sm">
                  {muscles.map((m) => (
                    <li className="flex items-center justify-between gap-2" key={m.muscle}>
                      <MuscleBadge muscle={m.muscle} />
                      <span className="tabular-nums text-muted-foreground">
                        {fmtInt(m.sets)} · {fmtInt((m.sets / totalSets) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyChart>No sets in this range</EmptyChart>
            )}
          </ChartCard>
          <ChartCard className="lg:col-span-3" description="By working sets" title="Most trained exercises">
            <CategoryBarChart
              data={topExercises.map((e) => ({ name: e.exercise, sets: e.sets }))}
              format={fmtInt}
              height={300}
              horizontal
              series={[{ key: "sets", label: "Sets", color: SERIES[0] }]}
              xKey="name"
            />
          </ChartCard>
        </div>

        <ChartCard description="Latest estimated one-rep-max records" title="Recent PRs">
          {recentPrs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Exercise</TableHead>
                  <TableHead className="text-right">Set</TableHead>
                  <TableHead className="text-right">Est. 1RM</TableHead>
                  <TableHead className="text-right">Gain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPrs.map((p) => (
                  <TableRow key={`${p.exercise}-${p.date.getTime()}`}>
                    <TableCell className="text-muted-foreground">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">{p.exercise}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt1(p.weight)} × {p.reps}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtKg(p.value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      +{fmt1(p.value - (p.previous ?? 0))} kg
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyChart className="h-24">No PRs in this range yet</EmptyChart>
          )}
        </ChartCard>
      </div>
    </>
  )
}
