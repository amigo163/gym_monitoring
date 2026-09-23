import { TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { ReferenceArea } from "@/components/charts/reference-area"
import { ExerciseSelect, MuscleBadge, PageHeader, StatCard } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CategoryBarChart, ChartCard, EmptyChart, SERIES, TimeLineChart } from "@/components/viz"
import {
  detectPlateaus,
  exerciseUsage,
  monthlySeries,
  mostImproved,
  summarizeExercise,
} from "@/lib/analysis"
import { formatDate, formatMonth } from "@/lib/dates"
import { fmt1, fmtInt, fmtKg, fmtPct } from "@/lib/format"
import { useData } from "@/state/store"

type Metric = "bestE1rm" | "topWeight" | "volume"

const METRICS: { value: Metric; label: string; description: string }[] = [
  { value: "bestE1rm", label: "Est. 1RM", description: "Best estimated one-rep max per session" },
  { value: "topWeight", label: "Top weight", description: "Heaviest working set per session" },
  { value: "volume", label: "Volume", description: "Load × reps per session" },
]

export function ExercisesPage() {
  const { sessions, workouts, prs } = useData()
  const usage = useMemo(() => exerciseUsage(sessions), [sessions])
  const [picked, setPicked] = useState<string | null>(null)
  const exercise = picked && sessions.has(picked) ? picked : (usage[0]?.exercise ?? "")
  const [metric, setMetric] = useState<Metric>("bestE1rm")

  const list = useMemo(() => sessions.get(exercise) ?? [], [sessions, exercise])
  const summary = useMemo(() => summarizeExercise(list), [list])
  const plateaus = useMemo(() => detectPlateaus(list), [list])
  const improved = useMemo(() => mostImproved(sessions), [sessions])
  const monthly = useMemo(() => monthlySeries(workouts, prs), [workouts, prs])

  const metricInfo = METRICS.find((m) => m.value === metric)!
  const hasE1rm = list.some((s) => s.bestE1rm > 0)
  const chartData = list.map((s) => ({ date: s.date, value: s[metric] }))

  return (
    <>
      <PageHeader description="Progression, plateaus and records for a single movement" title="Exercises">
        <ExerciseSelect exercises={usage} onChange={setPicked} value={exercise} />
      </PageHeader>

      {summary ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard hint={<MuscleBadge muscle={summary.muscle} />} label="Sessions" value={summary.sessions} />
            <StatCard
              hint={hasE1rm ? `on ${formatDate(summary.bestE1rm.date)}` : "Needs weight and ≤ 20 reps"}
              label="Best est. 1RM"
              value={hasE1rm ? fmtKg(summary.bestE1rm.bestE1rm) : "–"}
            />
            <StatCard
              hint={`on ${formatDate(summary.bestWeight.date)}`}
              label="Heaviest set"
              value={fmtKg(summary.bestWeight.topWeight)}
            />
            <StatCard
              hint="First → latest session"
              icon={TrendingUp}
              label="Change"
              value={
                summary.e1rmChangePct != null
                  ? fmtPct(summary.e1rmChangePct)
                  : summary.weightChangePct != null
                    ? fmtPct(summary.weightChangePct)
                    : "–"
              }
            />
          </div>

          <ChartCard
            action={
              <ToggleGroup
                onValueChange={(v) => v && setMetric(v as Metric)}
                size="sm"
                type="single"
                value={metric}
                variant="outline"
              >
                {METRICS.map((m) => (
                  <ToggleGroupItem key={m.value} value={m.value}>
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
            description={
              <>
                {metricInfo.description}
                {plateaus.length ? " · shaded bands are plateaus (4+ sessions without a new best)" : ""}
              </>
            }
            title="Progression"
          >
            <TimeLineChart
              data={chartData}
              format={metric === "volume" ? fmtInt : fmt1}
              series={[{ key: "value", label: metricInfo.label, color: SERIES[0] }]}
            >
              {plateaus.map((p) => (
                <ReferenceArea
                  fill="var(--status-warning)"
                  fillOpacity={0.12}
                  key={p.start.getTime()}
                  x1={p.start}
                  x2={p.end}
                />
              ))}
            </TimeLineChart>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard description="Plateaus are stretches without a new best" title="Plateaus">
              {plateaus.length ? (
                <ul className="grid gap-2 text-sm">
                  {plateaus.map((p) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" key={p.start.getTime()}>
                      <span>
                        {formatDate(p.start)} – {formatDate(p.end)}
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="secondary">{p.sessions} sessions</Badge>
                        stuck at {fmtKg(p.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyChart className="h-32">No plateaus — every few sessions brought a new best</EmptyChart>
              )}
            </ChartCard>

            <ChartCard description="Latest sessions first" title="Session log">
              <div className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Sets</TableHead>
                      <TableHead className="text-right">Top</TableHead>
                      <TableHead className="text-right">Est. 1RM</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...list].reverse().map((s) => (
                      <TableRow key={s.workoutId}>
                        <TableCell className="text-muted-foreground">{formatDate(s.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.sets}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt1(s.topWeight)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.bestE1rm ? fmt1(s.bestE1rm) : "–"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtInt(s.volume)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ChartCard>
          </div>
        </div>
      ) : (
        <EmptyChart>No exercises in this range</EmptyChart>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard description="Mean of first two vs. last two sessions (≥ 3 sessions)" title="Most improved">
          {improved.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercise</TableHead>
                  <TableHead className="text-right">From</TableHead>
                  <TableHead className="text-right">To</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {improved.map((e) => (
                  <TableRow className="cursor-pointer" key={e.exercise} onClick={() => setPicked(e.exercise)}>
                    <TableCell className="font-medium">{e.exercise}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(e.from)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(e.to)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(e.changePct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyChart className="h-32">Log each exercise at least 3 times to rank improvement</EmptyChart>
          )}
        </ChartCard>
        <ChartCard description="Distinct exercises trained each month" title="Exercise variety">
          <CategoryBarChart
            data={monthly.map((m) => ({ month: formatMonth(m.date), exercises: m.uniqueExercises }))}
            format={fmtInt}
            series={[{ key: "exercises", label: "Exercises", color: SERIES[0] }]}
            xKey="month"
          />
        </ChartCard>
      </div>
    </>
  )
}
