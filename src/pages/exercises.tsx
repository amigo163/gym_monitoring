import { TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { ReferenceArea } from "@/components/charts/reference-area"
import { ExerciseSelect, MuscleBadge, PageHeader, StatCard } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { fmt1, fmtInt, fmtPct, toUnit } from "@/lib/format"
import { MUSCLE_GROUPS, defaultMuscleGroup } from "@/lib/muscles"
import {
  KIND_LABEL,
  PRIMARY_PR,
  PR_LABEL,
  TRACKING_KINDS,
  fmtDuration,
  fmtMetric,
  fmtPrimary,
  lowerIsBetter,
  primaryLabel,
  prKindsFor,
  sessionMetric,
} from "@/lib/tracking"
import type { ExerciseSession, MuscleGroup, PrKind, TrackingKind } from "@/lib/types"
import { useData, useStore } from "@/state/store"

const METRIC_DESCRIPTION: Record<PrKind, string> = {
  e1rm: "Best estimated one-rep max per session",
  weight: "Heaviest working set per session",
  volume: "Load × reps per session",
  reps: "Most reps in one set per session",
  totalReps: "Reps across all working sets per session",
  duration: "Longest set per session",
  totalDuration: "Time across all working sets per session",
  distance: "Distance per session",
  pace: "Time per km per session (lower is faster)",
}

/** Chart and table formatting without units, for axes and dense columns. */
function fmtAxis(kind: PrKind): (v: number) => string {
  if (kind === "duration" || kind === "totalDuration" || kind === "pace") return fmtDuration
  if (kind === "distance") return (v) => fmt1(v / 1000)
  if (kind === "volume") return (v) => fmtInt(toUnit(v))
  if (kind === "weight" || kind === "e1rm") return (v) => fmt1(toUnit(v))
  return kind === "reps" || kind === "totalReps" ? fmtInt : fmt1
}

/** The records that have data for this exercise, main metric first. */
function metricsFor(list: ExerciseSession[]): PrKind[] {
  if (!list.length) return []
  return prKindsFor(list[0].kind, list[0].exercise).filter((k) => list.some((s) => sessionMetric(s, k) > 0))
}

function bestOf(list: ExerciseSession[], kind: PrKind): ExerciseSession | null {
  const withValue = list.filter((s) => sessionMetric(s, kind) > 0)
  if (!withValue.length) return null
  const better = (a: ExerciseSession, b: ExerciseSession) =>
    lowerIsBetter(kind) ? sessionMetric(b, kind) < sessionMetric(a, kind) : sessionMetric(b, kind) > sessionMetric(a, kind)
  return withValue.reduce((a, b) => (better(a, b) ? b : a))
}

export function ExercisesPage() {
  const { sessions, workouts, prs } = useData()
  const usage = useMemo(() => exerciseUsage(sessions), [sessions])
  const [picked, setPicked] = useState<string | null>(null)
  const exercise = picked && sessions.has(picked) ? picked : (usage[0]?.exercise ?? "")
  const [pickedMetric, setMetric] = useState<PrKind | null>(null)

  const list = useMemo(() => sessions.get(exercise) ?? [], [sessions, exercise])
  const summary = useMemo(() => summarizeExercise(list), [list])
  const improved = useMemo(() => mostImproved(sessions), [sessions])
  const monthly = useMemo(() => monthlySeries(workouts, prs), [workouts, prs])

  const metrics = useMemo(() => metricsFor(list), [list])
  const metric = pickedMetric && metrics.includes(pickedMetric) ? pickedMetric : (metrics[0] ?? "e1rm")
  const secondary = metrics.find((m) => m !== metric && m !== PRIMARY_PR[list[0]?.kind ?? "weight"]) ?? null
  const secondaryBest = secondary ? bestOf(list, secondary) : null
  const plateaus = useMemo(() => detectPlateaus(list, 4, metric), [list, metric])
  const chartData = useMemo(
    () => list.filter((s) => sessionMetric(s, metric) > 0).map((s) => ({ date: s.date, value: sessionMetric(s, metric) })),
    [list, metric],
  )

  return (
    <>
      <PageHeader description="Progression, plateaus and records for a single movement" title="Exercises">
        <ExerciseSelect exercises={usage} onChange={setPicked} value={exercise} />
      </PageHeader>

      {exercise ? <ClassificationEditor exercise={exercise} key={exercise} /> : null}

      {summary ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard hint={<MuscleBadge muscle={summary.muscle} />} label="Sessions" value={summary.sessions} />
            <StatCard
              hint={summary.best.primary > 0 ? `Best, on ${formatDate(summary.best.date)}` : "Nothing measurable logged"}
              label={primaryLabel(summary.best)}
              value={summary.best.primary > 0 ? fmtPrimary(summary.best) : "–"}
            />
            <StatCard
              hint={secondaryBest ? `on ${formatDate(secondaryBest.date)}` : "–"}
              label={secondary ? PR_LABEL[secondary] : "–"}
              value={secondary && secondaryBest ? fmtMetric(secondary, sessionMetric(secondaryBest, secondary)) : "–"}
            />
            <StatCard
              hint="First → latest session"
              icon={TrendingUp}
              label="Change"
              value={summary.primaryChangePct != null ? fmtPct(summary.primaryChangePct) : "–"}
            />
          </div>

          <ChartCard
            action={
              <ToggleGroup
                onValueChange={(v) => v && setMetric(v as PrKind)}
                size="sm"
                type="single"
                value={metric}
                variant="outline"
              >
                {metrics.map((m) => (
                  <ToggleGroupItem key={m} value={m}>
                    {PR_LABEL[m]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
            description={
              <>
                {METRIC_DESCRIPTION[metric]}
                {metric === "distance" ? " (km)" : ""}
                {plateaus.length ? " · shaded bands are plateaus (4+ sessions without a new best)" : ""}
              </>
            }
            title="Progression"
          >
            <TimeLineChart
              data={chartData}
              format={fmtAxis(metric)}
              regions={plateaus.length ? [{ label: "Plateau", color: "var(--status-warning)" }] : []}
              series={[{ key: "value", label: PR_LABEL[metric], color: SERIES[0] }]}
              showGaps
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
            <ChartCard description={`Stretches without a new best (${PR_LABEL[metric]})`} title="Plateaus">
              {plateaus.length ? (
                <ul className="grid gap-2 text-sm">
                  {plateaus.map((p) => (
                    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" key={p.start.getTime()}>
                      <span>
                        {formatDate(p.start)} – {formatDate(p.end)}
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="secondary">{p.sessions} sessions</Badge>
                        stuck at {fmtMetric(metric, p.value)}
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
                      {metrics.map((m) => (
                        <TableHead className="text-right" key={m}>
                          {PR_LABEL[m]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...list].reverse().map((s) => (
                      <TableRow key={s.workoutId}>
                        <TableCell className="text-muted-foreground">{formatDate(s.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.sets}</TableCell>
                        {metrics.map((m) => {
                          const v = sessionMetric(s, m)
                          return (
                            <TableCell className="text-right tabular-nums" key={m}>
                              {v > 0 ? fmtAxis(m)(v) : "–"}
                            </TableCell>
                          )
                        })}
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
                    <TableCell className="text-right tabular-nums">{fmtMetric(PRIMARY_PR[e.kind], e.from)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMetric(PRIMARY_PR[e.kind], e.to)}</TableCell>
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

/** Correct how an exercise is classified: its muscle group and what it's measured by. */
function ClassificationEditor({ exercise }: { exercise: string }) {
  const { exerciseSettings, setExerciseSettings } = useStore()
  const { autoKinds } = useData()
  const settings = exerciseSettings[exercise] ?? { exercise, muscle: null, kind: null }
  const autoKind = autoKinds.get(exercise) ?? "weight"
  const save = (patch: Partial<typeof settings>) => setExerciseSettings({ ...settings, ...patch, exercise })
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="exercise-kind">Measured by</Label>
        <Select onValueChange={(v) => save({ kind: v === "auto" ? null : (v as TrackingKind) })} value={settings.kind ?? "auto"}>
          <SelectTrigger className="w-48" id="exercise-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto · {KIND_LABEL[autoKind]}</SelectItem>
            {TRACKING_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="exercise-muscle">Muscle group</Label>
        <Select onValueChange={(v) => save({ muscle: v === "auto" ? null : (v as MuscleGroup) })} value={settings.muscle ?? "auto"}>
          <SelectTrigger className="w-48" id="exercise-muscle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto · {defaultMuscleGroup(exercise)}</SelectItem>
            {MUSCLE_GROUPS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="basis-full text-xs text-muted-foreground sm:basis-auto sm:pb-2">
        Records, forecasts and next-session targets follow these. Auto is guessed from what you logged.
      </p>
    </div>
  )
}
