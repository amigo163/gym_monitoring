import { AlertTriangle, BatteryCharging, CalendarClock, ChevronRight, Info, RotateCcw, Target, Trophy } from "lucide-react"
import { useMemo, useState } from "react"
import { Gauge } from "@/components/charts/gauge"
import { ReferenceArea } from "@/components/charts/reference-area"
import { ExerciseSelect, MUSCLE_COLOR, PageHeader, StatCard } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ChartCard, EmptyChart, SERIES, type Series, TimeLineChart } from "@/components/viz"
import { exerciseUsage, weeklyMuscleSets, weeklySeries, buildWorkouts } from "@/lib/analysis"
import { addDays, daysBetween, formatDate, parseDayKey } from "@/lib/dates"
import { fmt1, fmtInt, fmtKg, fmtTonnes, fromUnit, toUnit, weightUnit } from "@/lib/format"
import { type NextAction, type NextSession, type NextStatus, planNextSession } from "@/lib/models/next-session"
import { type LoadScenario, acuteChronic, acwrZone, dailyLoads, fitnessFatigue, readiness } from "@/lib/models/load"
import {
  LEVELS,
  LIFT_LABEL,
  type MainLift,
  type RecoveryInputs,
  classify,
  dots,
  mainLiftOf,
  scalingBodyweight,
} from "@/lib/models/physiology"
import {
  type ForecastMetric,
  HALF_LIFE_WEEKS,
  type StrengthForecast,
  dateAfterWeeks,
  forecastStrength,
  forecastableSessions,
  weeksToTarget,
} from "@/lib/models/strength"
import { VOLUME_GROUPS, personalLandmarks, planVolume, projectTonnage } from "@/lib/models/volume"
import { isAssisted, muscleGroupFor } from "@/lib/muscles"
import { loadForReps } from "@/lib/one-rep-max"
import { fmtDuration } from "@/lib/tracking"
import type { ExerciseGoal, MuscleGroup, NutritionState } from "@/lib/types"
import { type Dataset, useData, usePersistentState, useStore } from "@/state/store"

const HORIZONS = [4, 8, 12, 26] as const
const DAY = 86_400_000

/** How each forecast metric is named and written. */
const METRIC: Record<ForecastMetric, { label: string; unit: string; goal: string; format: (v: number) => string }> = {
  e1rm: {
    label: "Est. 1RM",
    get unit() {
      return weightUnit()
    },
    goal: "Target 1RM",
    format: fmtKg,
  },
  reps: { label: "Max reps", unit: "reps", goal: "Target reps", format: (v) => `${fmt1(v)} reps` },
  seconds: { label: "Longest hold", unit: "s", goal: "Target hold", format: fmtDuration },
}

/** A per-week rate in the metric's unit: "1.2 kg/wk", "0.4 reps/wk", "3 s/wk". */
const fmtRate = (metric: ForecastMetric, v: number) => `${fmt1(metric === "e1rm" ? toUnit(v) : v)} ${METRIC[metric].unit}/wk`

/** Shared inputs for every model: anchor date, training age, recent weekly sets per group. */
function useModelContext(data: Dataset, layoff: boolean) {
  const { profile } = useStore()
  return useMemo(() => {
    const asOf = layoff ? new Date() : data.asOf
    const first = data.allRows[0].date
    const trainingYears = profile.priorTrainingYears + (asOf.getTime() - first.getTime()) / (365.25 * DAY)
    const recentFrom = new Date(asOf.getTime() - 28 * DAY)
    const recentRows = data.allRows.filter((r) => r.date >= recentFrom && r.date <= asOf)
    const weekly = weeklyMuscleSets(recentRows, recentFrom, asOf)
    const weeks = Math.max(1, weekly.length)
    const setsPerWeek = (m: MuscleGroup) => weekly.reduce((a, w) => a + (w[m] ?? 0), 0) / weeks
    return { asOf, trainingYears, setsPerWeek, profile }
  }, [data, layoff, profile])
}

type ModelContext = ReturnType<typeof useModelContext>

function forecastFor(data: Dataset, ctx: ModelContext, exercise: string, horizonWeeks: number, scenario?: Partial<RecoveryInputs>) {
  const list = data.allSessions.get(exercise)?.filter((s) => s.date <= ctx.asOf)
  if (!list) return null
  const muscle = muscleGroupFor(exercise)
  const landmarks = personalLandmarks(muscle, ctx.profile, ctx.trainingYears) ?? undefined
  return forecastStrength(list, {
    profile: ctx.profile,
    horizonWeeks,
    scenario,
    weeklySets: landmarks ? ctx.setsPerWeek(muscle) : undefined,
    landmarks,
    today: ctx.asOf,
  })
}

export function PredictionsPage() {
  const data = useData()
  const [layoff, setLayoff] = useState(false)
  const ctx = useModelContext(data, layoff)
  const [tab, setTab] = usePersistentState("gymviz.predictions.tab", "next")
  // Shared by the Next session, Strength and Goals tabs so switching keeps your exercise.
  const [exercise, setExercise] = usePersistentState<string | null>("gymviz.predictions.exercise", null)
  const editGoal = (e: string) => {
    setExercise(e)
    setTab("goals")
  }

  return (
    <>
      <PageHeader
        description="Forecasts that combine your logged history with physiology: bodyweight-scaled strength potential, recovery capacity (sleep, stress, energy balance, protein, age), training frequency and volume, and fitness–fatigue dynamics."
        title="Predictions"
      />
      {data.isStale ? (
        <Alert className="mb-4">
          <Info />
          <AlertTitle>Your export ends on {formatDate(data.asOf)}</AlertTitle>
          <AlertDescription>
            <p>Predictions start from your last workout. Switch on to model the layoff since then (detraining) and forecast from today instead.</p>
            <div className="mt-2 flex items-center gap-2">
              <Switch checked={layoff} id="layoff" onCheckedChange={setLayoff} />
              <Label htmlFor="layoff">Forecast from today</Label>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="mb-2 h-auto flex-wrap justify-start">
          <TabsTrigger value="next">Next session</TabsTrigger>
          <TabsTrigger value="strength">Strength</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="fatigue">Fatigue & readiness</TabsTrigger>
          <TabsTrigger value="standards">Standards</TabsTrigger>
        </TabsList>
        <TabsContent value="next">
          <NextSessionTab ctx={ctx} data={data} onEditGoal={editGoal} onPick={setExercise} picked={exercise} />
        </TabsContent>
        <TabsContent value="strength">
          <StrengthTab ctx={ctx} data={data} onEditGoal={editGoal} onPick={setExercise} picked={exercise} />
        </TabsContent>
        <TabsContent value="goals">
          <GoalsTab ctx={ctx} data={data} onPick={setExercise} picked={exercise} />
        </TabsContent>
        <TabsContent value="volume">
          <VolumeTab ctx={ctx} data={data} />
        </TabsContent>
        <TabsContent value="fatigue">
          <FatigueTab ctx={ctx} data={data} />
        </TabsContent>
        <TabsContent value="standards">
          <StandardsTab ctx={ctx} data={data} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------------------------------------------------------------------------
// Next session
// ---------------------------------------------------------------------------

const STATUS: Record<NextStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  overdue: { label: "Overdue", variant: "destructive" },
  due: { label: "Due", variant: "default" },
  recovering: { label: "Recovering", variant: "secondary" },
  upcoming: { label: "Upcoming", variant: "outline" },
}
const STATUS_ORDER: NextStatus[] = ["overdue", "due", "recovering", "upcoming"]

const ACTION: Record<NextAction, string> = {
  "add-weight": "Add weight",
  "add-reps": "Add a rep",
  "add-time": "Add time",
  repeat: "Repeat",
  reset: "Reset",
  "ease-back": "Ease back in",
  adjust: "Move into range",
}

function loadLabel(p: NextSession, weight: number) {
  if (isAssisted(p.exercise)) return `${fmtKg(weight)} assist`
  return weight > 0 ? fmtKg(weight) : "Bodyweight"
}

/** "60 kg × 8, 8, 7 · 65 kg × 5", or "1:00, 0:50" for timed holds. */
function setsLabel(p: NextSession) {
  if (p.kind === "time") return p.lastSets.map((s) => fmtDuration(s.seconds ?? 0)).join(", ")
  const groups: { weight: number; reps: number[] }[] = []
  for (const s of p.lastSets) {
    const g = groups.at(-1)
    if (g && g.weight === s.weight) g.reps.push(s.reps)
    else groups.push({ weight: s.weight, reps: [s.reps] })
  }
  return groups.map((g) => `${loadLabel(p, g.weight)} × ${g.reps.join(", ")}`).join(" · ")
}

/** "60 kg × 8", "Bodyweight × 12" or "1:10 hold". */
function targetLabel(p: NextSession) {
  return p.kind === "time" ? `${fmtDuration(p.target.seconds ?? 0)} hold` : `${loadLabel(p, p.target.weight)} × ${p.target.reps}`
}

/** A value in the plan's main metric: est. 1RM in your unit, reps, or hold time. */
function planValue(p: NextSession, v: number) {
  if (p.kind === "time") return fmtDuration(v)
  if (p.kind === "reps") return `${fmtInt(v)} reps`
  return fmtKg(v)
}

const PLAN_METRIC_LABEL = { weight: "est. 1RM", reps: "reps", time: "hold", distance: "distance" } as const

function relativeDay(from: Date, to: Date) {
  const n = daysBetween(from, to)
  if (n === 0) return "today"
  if (n === 1) return "tomorrow"
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "est. 1RM 100 kg · 5–8 reps", or where the plan's reps come from without a goal. */
function goalSummary(p: NextSession) {
  const reps =
    p.kind === "time"
      ? null
      : p.repRangeFromGoal
        ? `${p.repRange.min === p.repRange.max ? p.repRange.min : `${p.repRange.min}–${p.repRange.max}`} reps`
        : `usual ${p.repRange.min} reps`
  const target = p.goal ? `Goal ${PLAN_METRIC_LABEL[p.kind]} ${planValue(p, p.goal.target)}` : null
  return [target ?? "No goal", reps].filter(Boolean).join(" · ")
}

/** Collapsed-by-default section for the secondary parts of a card. */
function Disclosure({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="font-medium">{title}</span>
        {summary ? <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span> : null}
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}

interface TabProps {
  data: Dataset
  ctx: ModelContext
  picked: string | null
  onPick: (e: string) => void
  /** Open the Goals tab on this exercise. */
  onEditGoal: (e: string) => void
}

function NextSessionTab({ data, ctx, picked, onPick, onEditGoal }: TabProps) {
  const { goals, unit } = useStore()
  const plans = useMemo(() => {
    const lastLogged = data.allRows.at(-1)!.date
    const rows = data.allRows.filter((r) => r.date <= ctx.asOf)
    const out: NextSession[] = []
    for (const [exercise, all] of data.allSessions) {
      const sessions = all.filter((s) => s.date <= ctx.asOf)
      const last = sessions.at(-1)
      // Only exercises that are part of your current routine.
      if (!last || daysBetween(last.date, lastLogged) > 56) continue
      const forecast = forecastFor(data, ctx, exercise, 4)
      const plan = planNextSession({ exercise, rows, sessions, profile: ctx.profile, asOf: ctx.asOf, forecast, goal: goals[exercise] })
      if (plan) out.push(plan)
    }
    out.sort(
      (a, b) =>
        a.suggestedDate.getTime() - b.suggestedDate.getTime() ||
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.dueOn.getTime() - b.dueOn.getTime(),
    )
    return out
    // `unit` isn't read here, but the reasons are written with the display-unit formatters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ctx, goals, unit])

  if (!plans.length) {
    return <EmptyChart>No exercises to progress in the 8 weeks before your last workout</EmptyChart>
  }
  const plan = plans.find((p) => p.exercise === picked) ?? plans[0]
  const counts = STATUS_ORDER.map((st) => ({ st, n: plans.filter((p) => p.status === st).length }))

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {counts.map(({ st, n }) => (
          <StatCard
            hint={
              st === "overdue"
                ? "Well past your usual gap"
                : st === "due"
                  ? "Your usual day is now"
                  : st === "recovering"
                    ? "Due, but the muscle needs rest"
                    : "Not due yet"
            }
            key={st}
            label={STATUS[st].label}
            value={n}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {plan.exercise}
              <Badge variant={STATUS[plan.status].variant}>{STATUS[plan.status].label}</Badge>
            </CardTitle>
            <CardDescription className="grid gap-0.5">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <CalendarClock className="size-4" />
                {capitalize(relativeDay(ctx.asOf, plan.suggestedDate))} · {formatDate(plan.suggestedDate)}
              </span>
              <span className="text-xs">
                Every ~{plan.typicalGapDays} day{plan.typicalGapDays > 1 ? "s" : ""} · {plan.muscle.toLowerCase()} recovered {formatDate(plan.readyFrom)} ({plan.restHours} h rest)
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{targetLabel(plan)}</span>
                <Badge variant="outline">{ACTION[plan.action]}</Badge>
                {plan.isPr ? (
                  <Badge variant="secondary">
                    <Trophy /> PR
                  </Badge>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {plan.target.sets} {plan.kind === "time" ? "" : "top "}set{plan.target.sets > 1 ? "s" : ""}
                {plan.targetE1rm > 0 ? ` · est. 1RM ${fmtKg(plan.targetE1rm)}` : ""}
              </div>
              <p className="mt-2 text-sm">{plan.reason}</p>
              <p className="text-xs text-muted-foreground">
                Last time ({formatDate(plan.lastDate)}): {setsLabel(plan)}
              </p>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="size-3.5" /> {goalSummary(plan)}
                </span>
                <span className="flex items-center gap-2">
                  {plan.goal && plan.targetValue >= plan.goal.target ? (
                    <span>Reached with this target</span>
                  ) : plan.goal?.progress != null ? (
                    <span className="tabular-nums">{fmtInt(plan.goal.progress * 100)}%</span>
                  ) : null}
                  <Button className="h-auto p-0 text-xs" onClick={() => onEditGoal(plan.exercise)} variant="link">
                    {plan.goal || plan.repRangeFromGoal ? "Edit" : "Set goal"}
                  </Button>
                </span>
              </div>
              {plan.goal?.progress != null ? <Progress aria-label="Progress towards goal" value={plan.goal.progress * 100} /> : null}
              {plan.note ? <p className="text-xs text-muted-foreground">{plan.note}</p> : null}
            </div>

            {plan.alternatives ? (
              <div className="grid border-t text-sm">
                <Disclosure title="Same effort at other reps">
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {plan.alternatives.map((a) => (
                      <div className="rounded-md bg-muted/50 py-1.5" key={a.reps}>
                        <div className="text-xs text-muted-foreground">{a.reps} reps</div>
                        <div className="tabular-nums">{fmtKg(a.weight)}</div>
                      </div>
                    ))}
                  </div>
                </Disclosure>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ChartCard className="lg:col-span-3" description="Everything from your current routine, ordered by when to train it. Pick one to see the details." title="Up next">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exercise</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow data-state={p.exercise === plan.exercise ? "selected" : undefined} key={p.exercise}>
                  <TableCell>
                    <button className="flex items-center gap-2 text-left hover:underline" onClick={() => onPick(p.exercise)} type="button">
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: MUSCLE_COLOR[p.muscle] }} />
                      {p.exercise}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                      <span className="text-muted-foreground">{relativeDay(ctx.asOf, p.suggestedDate)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.kind === "time" ? `${p.target.sets} × ${fmtDuration(p.target.seconds ?? 0)}` : `${p.target.sets} × ${p.target.reps} @ ${loadLabel(p, p.target.weight)}`}
                    {p.isPr ? <Trophy aria-label="PR" className="ml-1 inline size-3.5 text-muted-foreground" /> : null}
                    {p.goal ? (
                      <div className="text-xs text-muted-foreground">
                        Goal {PLAN_METRIC_LABEL[p.kind]} {planValue(p, p.goal.target)}
                        {p.goal.progress != null ? ` · ${fmtInt(p.goal.progress * 100)}%` : ""}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Targets use double progression on your top sets, inside your goal's rep range or at your usual reps: hit the top of the range on
        every set → add the smallest plate step (5 lb) and go back to the bottom;
        otherwise add a rep. Sets well outside a range you set are re-weighted to land in it. The strength forecast holds back jumps it thinks are too big,
        5+ stalled sessions while missing reps suggests a 10% reset, and layoffs over 3 weeks start you lighter. Bodyweight and rep-based exercises
        add a rep per set; timed holds add 5–15 s until about 3 minutes, then it's time for a harder variation. Timing is the later of your usual gap for the exercise and ~48 h (72 h for legs
        and deadlifts) of muscle recovery, lengthened by short sleep, high stress and age.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

function forecastRows(f: StrengthForecast, baseline: StrengthForecast | null) {
  const rows: Record<string, unknown>[] = f.history.map((h) => ({
    date: h.date,
    value: h.value,
    upper: h.value,
    lower: h.value,
    baseline: h.value,
    projected: false,
  }))
  const last = f.history.at(-1)!
  // Skip the forecast anchor when it coincides with the last session.
  const future = f.forecast.filter((p) => p.date.getTime() > last.date.getTime())
  future.forEach((p, i) => {
    rows.push({
      date: p.date,
      value: p.expected,
      upper: p.upper,
      lower: p.lower,
      baseline: baseline?.forecast.find((b) => b.date.getTime() === p.date.getTime())?.expected ?? p.expected,
      projected: true,
      week: i + 1,
    })
  })
  return rows
}

/** Exercises with enough sessions to forecast, most used first. */
function useForecastCandidates(data: Dataset) {
  return useMemo(
    () => exerciseUsage(data.allSessions).filter((u) => forecastableSessions(data.allSessions.get(u.exercise) ?? []).length >= 2),
    [data.allSessions],
  )
}

function pickExercise(candidates: { exercise: string }[], picked: string | null, preferred?: (e: string) => boolean) {
  if (picked && candidates.some((c) => c.exercise === picked)) return picked
  return candidates.find((c) => preferred?.(c.exercise))?.exercise ?? candidates.find((c) => mainLiftOf(c.exercise))?.exercise ?? candidates[0]?.exercise ?? ""
}

/** When a forecast reaches a target: "Reached", "Beyond potential" or a date. */
function etaLabel(f: StrengthForecast, target: number) {
  const weeks = weeksToTarget(f, target)
  if (weeks === 0) return "Reached"
  if (weeks === null) return "Beyond potential"
  return formatDate(dateAfterWeeks(f.forecast[0].date, weeks))
}

function StrengthTab({ data, ctx, picked, onPick, onEditGoal }: TabProps) {
  const { profile } = ctx
  const candidates = useForecastCandidates(data)
  const exercise = pickExercise(candidates, picked)
  const [horizon, setHorizon] = usePersistentState<number>("gymviz.predictions.horizon", 12)
  const baseScenario: RecoveryInputs = {
    sleepHours: profile.sleepHours,
    stress: profile.stress,
    nutrition: profile.nutrition,
    proteinGPerKg: profile.proteinGPerKg,
    age: profile.age,
  }
  const [scenario, setScenario] = useState<RecoveryInputs>(baseScenario)
  const scenarioChanged = (Object.keys(baseScenario) as (keyof RecoveryInputs)[]).some((k) => baseScenario[k] !== scenario[k])
  const { goals } = useStore()
  const goal = goals[exercise]

  const forecast = useMemo(
    () => (exercise ? forecastFor(data, ctx, exercise, horizon, scenario) : null),
    [data, ctx, exercise, horizon, scenario],
  )
  const baseline = useMemo(
    () => (exercise && scenarioChanged ? forecastFor(data, ctx, exercise, horizon) : null),
    [data, ctx, exercise, horizon, scenarioChanged],
  )

  if (!candidates.length) {
    return <EmptyChart>Log an exercise at least twice to get a forecast</EmptyChart>
  }

  const metric = forecast?.metric ?? "e1rm"
  const m = METRIC[metric]
  const target = goal?.target ?? 0
  const rows = forecast ? forecastRows(forecast, baseline).map((r) => (target > 0 ? { ...r, goal: target } : r)) : []
  const dashFrom = forecast ? forecast.history.length - 1 : undefined
  const series: Series[] = [
    ...(baseline
      ? [{ key: "baseline", label: "Current habits", color: SERIES[1], dashFromIndex: dashFrom, legendDashed: true } satisfies Series]
      : []),
    { key: "value", label: scenarioChanged ? `${m.label} · what-if` : m.label, color: SERIES[0], dashFromIndex: dashFrom, strokeWidth: 2.5 },
    ...(target > 0
      ? [{ key: "goal", label: "Goal", color: SERIES[2], dashFromIndex: 0, strokeWidth: 1.5, legendDashed: true } satisfies Series]
      : []),
  ]
  const end = forecast?.forecast.at(-1)
  const pace = forecast && goal ? goalPace(forecast, goal, forecast.forecast[0].date) : null

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ExerciseSelect exercises={candidates} onChange={onPick} value={exercise} />
        <ToggleGroup onValueChange={(v) => v && setHorizon(Number(v))} type="single" value={String(horizon)} variant="outline">
          {HORIZONS.map((h) => (
            <ToggleGroupItem aria-label={`${h} weeks`} key={h} value={String(h)}>
              {h}w
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {forecast && end ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              hint={forecast.detrainingPct > 0 ? `−${fmt1(forecast.detrainingPct * 100)}% from the layoff` : "Recent sessions weighted most"}
              label={`Current ${m.label.toLowerCase()}`}
              value={m.format(forecast.current)}
            />
            <StatCard hint={`+${fmtRate(metric, forecast.weeklyGain)} now · 80% ${m.format(end.lower)}–${m.format(end.upper)}`} label={`In ${horizon} weeks`} value={m.format(end.expected)} />
            <StatCard hint={`of a potential ≈ ${m.format(forecast.ceiling)}`} label="Of potential" value={`${fmtInt(forecast.percentOfPotential * 100)}%`} />
            <StatCard
              hint={
                goal?.target != null ? (
                  <>
                    Goal {m.format(goal.target)}
                    {pace ? (pace.weeksLeft <= 0 ? " · deadline passed" : pace.onTrack ? " · on track" : " · behind deadline") : ""}
                  </>
                ) : (
                  <Button className="h-auto p-0 text-xs" onClick={() => onEditGoal(exercise)} variant="link">
                    Set a goal
                  </Button>
                )
              }
              label="Goal"
              value={goal?.target != null ? etaLabel(forecast, goal.target) : "—"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
            <ChartCard
              className="xl:col-span-2"
              description="Solid = logged sessions, dashed = forecast. The shaded band is where you'll land 8 times out of 10."
              title={`${exercise} forecast`}
            >
              <TimeLineChart
                band={{ lower: "lower", upper: "upper", label: "80% range", color: SERIES[0] }}
                data={rows}
                format={metric === "seconds" ? fmtDuration : fmt1}
                height={320}
                series={series}
              >
                <ReferenceArea fadeEdges={false} fill="var(--muted-foreground)" fillOpacity={0.06} x1={forecast.history.at(-1)!.date} />
              </TimeLineChart>
            </ChartCard>

            <div className="grid content-start gap-4">
              {metric === "e1rm" ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Rep maxes</CardTitle>
                    <CardDescription>Heaviest weight for each rep count, now and in {horizon} weeks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reps</TableHead>
                          <TableHead className="text-right">Now</TableHead>
                          <TableHead className="text-right">In {horizon}w</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[1, 3, 5, 8, 10].map((r) => (
                          <TableRow key={r}>
                            <TableCell>{r}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt1(toUnit(loadForReps(forecast.current, r)))}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt1(toUnit(loadForReps(end.expected, r)))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="py-0">
                <CardContent className="text-sm">
                  <Disclosure summary={scenarioChanged ? "Changed" : "Your profile"} title="What if…">
                    <div className="grid gap-5 pt-1">
                      <ScenarioSlider label="Sleep" format={(v) => `${v} h`} max={10} min={4} onChange={(v) => setScenario({ ...scenario, sleepHours: v })} step={0.5} value={scenario.sleepHours} />
                      <ScenarioSlider label="Stress" format={(v) => `${v}/5`} max={5} min={1} onChange={(v) => setScenario({ ...scenario, stress: v })} step={1} value={scenario.stress} />
                      <ScenarioSlider label="Protein" format={(v) => `${v} g/kg`} max={3} min={0.6} onChange={(v) => setScenario({ ...scenario, proteinGPerKg: v })} step={0.1} value={scenario.proteinGPerKg} />
                      <div className="grid gap-1.5">
                        <Label>Energy balance</Label>
                        <ToggleGroup
                          onValueChange={(v) => v && setScenario({ ...scenario, nutrition: v as NutritionState })}
                          size="sm"
                          type="single"
                          value={scenario.nutrition}
                          variant="outline"
                        >
                          <ToggleGroupItem value="deficit">Deficit</ToggleGroupItem>
                          <ToggleGroupItem value="maintenance">Maintain</ToggleGroupItem>
                          <ToggleGroupItem value="surplus">Surplus</ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                      <Button disabled={!scenarioChanged} onClick={() => setScenario(baseScenario)} size="sm" variant="outline">
                        <RotateCcw /> Reset to my profile
                      </Button>
                    </div>
                  </Disclosure>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="py-0">
            <CardContent className="text-sm">
              <Disclosure summary={`${(forecast.rate * 100).toFixed(2)}%/wk of the gap to potential`} title="How this is calculated">
                <HowItWorks forecast={forecast} />
              </Disclosure>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyChart>Not enough sessions of {exercise} to forecast</EmptyChart>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function GoalsTab({ data, ctx, picked, onPick }: Omit<TabProps, "onEditGoal">) {
  const { goals, setGoal } = useStore()
  const candidates = useForecastCandidates(data)
  const exercise = pickExercise(candidates, picked, (e) => goals[e] != null)
  // Bumped on "Remove" so the editor's drafts reset.
  const [cleared, setCleared] = useState(0)

  const rows = useMemo(
    () =>
      Object.values(goals)
        .filter((g) => candidates.some((c) => c.exercise === g.exercise))
        .map((goal) => {
          const forecast = forecastFor(data, ctx, goal.exercise, 12)
          const progress =
            forecast && goal.target != null && goal.start != null && goal.target > goal.start
              ? Math.min(1, Math.max(0, (forecast.current - goal.start) / (goal.target - goal.start)))
              : null
          return { goal, forecast, progress, pace: forecast ? goalPace(forecast, goal, forecast.forecast[0].date) : null }
        })
        .sort((a, b) => a.goal.exercise.localeCompare(b.goal.exercise)),
    [goals, candidates, data, ctx],
  )

  if (!candidates.length) {
    return <EmptyChart>Log an exercise at least twice to set a goal</EmptyChart>
  }
  const forecast = forecastFor(data, ctx, exercise, 12)
  const metric = forecast?.metric ?? "e1rm"
  const m = METRIC[metric]
  const goal = goals[exercise]
  const pace = forecast && goal ? goalPace(forecast, goal, forecast.forecast[0].date) : null

  return (
    <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" /> Goal
          </CardTitle>
          <CardDescription>
            {metric === "seconds"
              ? "A target hold and a deadline."
              : `A ${metric === "e1rm" ? "target 1RM" : "target rep count"}, a deadline, and the rep range your next-session targets work in.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ExerciseSelect className="sm:w-full" exercises={candidates} onChange={onPick} value={exercise} />
          <GoalEditor current={forecast?.current ?? null} exercise={exercise} key={`${exercise}-${cleared}`} metric={metric} />
          {forecast ? (
            <div className="grid gap-1 text-sm">
              <p className="text-muted-foreground">Now: {m.format(forecast.current)}</p>
              {goal?.target != null ? (
                <p>
                  {weeksToTarget(forecast, goal.target) === null ? (
                    <>
                      Beyond your estimated potential of {m.format(forecast.ceiling)}
                      {metric === "e1rm" ? ". Gaining bodyweight or lean mass would raise it." : " for now. It grows with training age."}
                    </>
                  ) : (
                    <>
                      Expected: <span className="font-semibold">{etaLabel(forecast, goal.target)}</span>
                      <span className="text-muted-foreground"> at your current habits</span>
                    </>
                  )}
                </p>
              ) : null}
              {pace ? (
                <p className="text-muted-foreground">
                  {pace.weeksLeft <= 0
                    ? "Your deadline has passed. Set a new one."
                    : `${pace.onTrack ? "On track" : "Behind"} for ${formatDate(pace.deadline)}: needs ${fmtRate(metric, pace.requiredPerWeek)}, forecast ${fmtRate(metric, forecast.weeklyGain)} now.`}
                </p>
              ) : null}
            </div>
          ) : null}
          {goal ? (
            <Button
              className="justify-self-start"
              onClick={() => {
                setGoal({ ...goal, target: null, start: null, repRange: null, deadline: null, updatedAt: new Date().toISOString() })
                setCleared((n) => n + 1)
              }}
              size="sm"
              variant="outline"
            >
              Remove goal
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ChartCard className="lg:col-span-3" description="Pick one to edit it." title="Your goals">
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exercise</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ goal: g, forecast: f, progress, pace: p }) => {
                const gm = METRIC[f?.metric ?? "e1rm"]
                return (
                  <TableRow data-state={g.exercise === exercise ? "selected" : undefined} key={g.exercise}>
                    <TableCell>
                      <button className="grid text-left hover:underline" onClick={() => onPick(g.exercise)} type="button">
                        <span>{g.exercise}</span>
                        <span className="text-xs text-muted-foreground">
                          {[
                            g.target != null ? `${f ? `${gm.format(f.current)} → ` : ""}${gm.format(g.target)}` : null,
                            g.repRange ? `${g.repRange.min === g.repRange.max ? g.repRange.min : `${g.repRange.min}–${g.repRange.max}`} reps` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="w-32">
                      {progress != null ? (
                        <div className="grid gap-1">
                          <span className="text-xs tabular-nums text-muted-foreground">{fmtInt(progress * 100)}%</span>
                          <Progress aria-label={`Progress towards ${g.exercise} goal`} value={progress * 100} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{f && g.target != null ? etaLabel(f, g.target) : <span className="text-muted-foreground">–</span>}</TableCell>
                    <TableCell>
                      {g.deadline ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">{formatDate(parseDayKey(g.deadline))}</span>
                          {p ? (
                            <Badge variant={p.weeksLeft <= 0 || !p.onTrack ? "destructive" : "secondary"}>
                              {p.weeksLeft <= 0 ? "Passed" : p.onTrack ? "On track" : "Behind"}
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyChart>No goals yet. Pick an exercise and set a target or rep range.</EmptyChart>
        )}
      </ChartCard>
    </div>
  )
}

/** Required vs forecast pace for a goal with a deadline. */
function goalPace(f: StrengthForecast, goal: ExerciseGoal, from: Date) {
  if (goal.target == null || goal.deadline == null || goal.target <= f.current) return null
  const deadline = parseDayKey(goal.deadline)
  const weeksLeft = (deadline.getTime() - from.getTime()) / (7 * DAY)
  const weeks = weeksToTarget(f, goal.target)
  return {
    deadline,
    weeksLeft,
    requiredPerWeek: weeksLeft > 0 ? (goal.target - f.current) / weeksLeft : Number.POSITIVE_INFINITY,
    onTrack: weeks != null && weeks <= weeksLeft,
  }
}

const parseNum = (v: string) => (v.trim() === "" ? null : Number(v))

/** Suggested target: ~10% above a 1RM (to plates), ~20% more reps or hold time. */
function suggestedTarget(metric: ForecastMetric, current: number): number {
  if (metric === "e1rm") return weightUnit() === "lb" ? Math.round((toUnit(current) * 1.1) / 5) * 5 : Math.round((current * 1.1) / 2.5) * 2.5
  if (metric === "reps") return Math.ceil(current * 1.2)
  return Math.round((current * 1.2) / 5) * 5
}

/**
 * Target (1RM, reps or hold seconds), rep range and deadline for one exercise; key it by exercise
 * so drafts reset on switch.
 */
function GoalEditor({ exercise, current, metric }: { exercise: string; current: number | null; metric: ForecastMetric }) {
  const { goals, setGoal } = useStore()
  const goal: ExerciseGoal = goals[exercise] ?? {
    exercise,
    target: null,
    start: null,
    repRange: null,
    deadline: null,
    updatedAt: "",
  }
  // 1RM targets are stored in kg and typed in the display unit.
  const toInput = (v: number) => (metric === "e1rm" ? Math.round(toUnit(v) * 10) / 10 : v)
  const fromInput = (v: number) => (metric === "e1rm" ? fromUnit(v) : v)
  const [target, setTarget] = useState(goal.target != null ? String(toInput(goal.target)) : "")
  const [minReps, setMinReps] = useState(goal.repRange?.min.toString() ?? "")
  const [maxReps, setMaxReps] = useState(goal.repRange && goal.repRange.max !== goal.repRange.min ? goal.repRange.max.toString() : "")

  const save = (patch: Partial<ExerciseGoal>) => setGoal({ ...goal, ...patch, exercise, updatedAt: new Date().toISOString() })

  const onTarget = (v: string) => {
    setTarget(v)
    const typed = parseNum(v)
    if (typed != null && !(typed > 0)) return
    const value = typed == null ? null : fromInput(typed)
    // Progress is measured from where you were when the target was first set.
    const start = value == null ? null : (goal.start ?? (current != null ? Math.round(current * 10) / 10 : null))
    save({ target: value, start })
  }

  const min = parseNum(minReps)
  const max = parseNum(maxReps) ?? min
  const validReps = (n: number | null) => n == null || (Number.isInteger(n) && n >= 1 && n <= 30)
  const rangeValid = validReps(min) && validReps(max) && (min == null || max == null || min <= max) && (min != null || parseNum(maxReps) == null)
  const onReps = (nextMin: string, nextMax: string) => {
    setMinReps(nextMin)
    setMaxReps(nextMax)
    const lo = parseNum(nextMin)
    const hi = parseNum(nextMax) ?? lo
    if (!validReps(lo) || !validReps(hi)) return
    if (lo == null) {
      if (parseNum(nextMax) == null) save({ repRange: null })
      return
    }
    if (hi != null && lo <= hi) save({ repRange: { min: lo, max: hi } })
  }

  return (
    <div className={metric === "seconds" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
      <div className="grid gap-1.5">
        <Label htmlFor={`goal-1rm-${exercise}`}>{METRIC[metric].goal}</Label>
        <div className="relative">
          <Input
            id={`goal-1rm-${exercise}`}
            inputMode="decimal"
            onChange={(e) => onTarget(e.target.value)}
            placeholder={current ? String(suggestedTarget(metric, current)) : ""}
            type="number"
            value={target}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{METRIC[metric].unit}</span>
        </div>
      </div>
      {metric === "seconds" ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor={`goal-reps-${exercise}`}>Rep range</Label>
          <div className="flex items-center gap-1.5">
            <Input
              aria-invalid={!rangeValid || undefined}
              aria-label="Lowest reps"
              id={`goal-reps-${exercise}`}
              inputMode="numeric"
              onChange={(e) => onReps(e.target.value, maxReps)}
              placeholder="5"
              type="number"
              value={minReps}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-invalid={!rangeValid || undefined}
              aria-label="Highest reps"
              inputMode="numeric"
              onChange={(e) => onReps(minReps, e.target.value)}
              placeholder="8"
              type="number"
              value={maxReps}
            />
          </div>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`goal-deadline-${exercise}`}>Deadline</Label>
        <Input
          id={`goal-deadline-${exercise}`}
          onChange={(e) => save({ deadline: e.target.value || null })}
          type="date"
          value={goal.deadline ?? ""}
        />
      </div>
    </div>
  )
}

function ScenarioSlider(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-between text-sm">
        <Label>{props.label}</Label>
        <span className="tabular-nums text-muted-foreground">{props.format(props.value)}</span>
      </div>
      <Slider aria-label={props.label} max={props.max} min={props.min} onValueChange={([v]) => props.onChange(v)} step={props.step} value={[props.value]} />
    </div>
  )
}

function HowItWorks({ forecast: f }: { forecast: StrengthForecast }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid content-start gap-3">
        <p className="text-muted-foreground">
          Rate {(f.rate * 100).toFixed(2)}%/wk of the gap to potential
          {f.dataRate != null ? ` · your history alone suggests ${(f.dataRate * 100).toFixed(2)}%` : ""}. What moves it:
        </p>
        {f.factors.map((factor) => (
          <div className="grid gap-1" key={factor.key}>
            <div className="flex items-center justify-between">
              <span>{factor.label}</span>
              <span className="tabular-nums text-muted-foreground">{Math.round(factor.value * 100)}%</span>
            </div>
            <Progress aria-label={factor.label} value={factor.value * 100} />
            <p className="text-xs text-muted-foreground">{factor.detail}</p>
          </div>
        ))}
      </div>
      <div className="grid content-start gap-2 text-muted-foreground">
        <p>
          Strength approaches a personal ceiling exponentially: <code className="text-foreground">e1RM(t) = C − (C − S₀)·e^(−k·t)</code>. Early
          gains are fast; they slow as you close the gap.
        </p>
        <p>
          <span className="text-foreground">Recent sessions count most.</span> A session {f.halfLifeWeeks > HALF_LIFE_WEEKS ? fmtInt(f.halfLifeWeeks) : HALF_LIFE_WEEKS} weeks older
          than your latest counts half as much, so this fit rests on about {fmtInt(f.effectiveSessions)} of your {f.sessions} sessions' worth of data.
          {f.halfLifeWeeks > HALF_LIFE_WEEKS ? " The window is stretched because you train this exercise rarely." : ""}
        </p>
        <p>
          <span className="text-foreground">C (potential)</span> comes from bodyweight-scaled strength standards for squat, bench, deadlift and
          overhead press (strength ∝ mass<sup>⅔</sup>), adjusted for lean mass and age. Other lifts use training age to estimate headroom.
        </p>
        <p>
          <span className="text-foreground">k (rate)</span> is fitted to your sessions and blended with a physiological prior built from the
          factors on the left. Few recent sessions → the prior dominates.
        </p>
        <p>
          The 80% range widens with the horizon, scaled by how noisy your recent sessions are. Layoffs longer than three weeks apply detraining
          (≈0.6%/week). Rep-based and timed exercises use the same curve on your most reps or longest hold, with wider headroom.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

function VolumeTab({ data, ctx }: { data: Dataset; ctx: ModelContext }) {
  const [muscle, setMuscle] = useState<MuscleGroup>("Chest")
  const [weeks, setWeeks] = useState(10)
  const lm = personalLandmarks(muscle, ctx.profile, ctx.trainingYears)

  const history = useMemo(() => {
    const from = new Date(ctx.asOf.getTime() - 12 * 7 * DAY)
    return weeklyMuscleSets(
      data.allRows.filter((r) => r.date >= from && r.date <= ctx.asOf),
      from,
      ctx.asOf,
    )
  }, [data.allRows, ctx.asOf])

  const plans = useMemo(() => {
    const out = new Map<MuscleGroup, ReturnType<typeof planVolume>>()
    for (const g of VOLUME_GROUPS) {
      const l = personalLandmarks(g, ctx.profile, ctx.trainingYears)
      if (l) out.set(g, planVolume(ctx.setsPerWeek(g), l, weeks, ctx.asOf))
    }
    return out
  }, [ctx, weeks])

  // Average weekly strength growth across the lifts you train, for the tonnage projection.
  const growth = useMemo(() => {
    const rates = exerciseUsage(data.allSessions)
      .slice(0, 8)
      .map((u) => forecastFor(data, ctx, u.exercise, 1))
      .filter((f): f is StrengthForecast => f != null && f.metric === "e1rm" && f.current > 0)
      .map((f) => f.weeklyGain / f.current)
    return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
  }, [data, ctx])

  const tonnage = useMemo(() => {
    const workouts = buildWorkouts(data.allRows.filter((r) => r.date <= ctx.asOf))
    const weekly = weeklySeries(workouts).slice(-16)
    const totalPlanned = Array.from({ length: weeks }, (_, i) =>
      [...plans.values()].reduce((a, p) => a + (p[i]?.sets ?? 0), 0),
    )
    // Scale the plan to the share of your sets that it covers (cardio/other aren't planned).
    const recentTotal = weekly.slice(-4).reduce((a, w) => a + w.sets, 0) / Math.max(1, Math.min(4, weekly.length))
    const recentPlanned = VOLUME_GROUPS.reduce((a, g) => a + ctx.setsPerWeek(g), 0)
    const scale = recentPlanned > 0 ? recentTotal / recentPlanned : 1
    return projectTonnage(weekly, totalPlanned.map((s) => s * scale), growth)
  }, [data.allRows, ctx, plans, weeks, growth])

  const plan = plans.get(muscle) ?? []
  const hist = history.map((w) => ({ date: w.date, sets: w[muscle] ?? 0 }))
  const rows = [...hist, ...plan.map((p) => ({ date: p.date, sets: p.sets }))]
  const tonnageRows = tonnage.map((t) => ({ date: t.date, volume: t.actual ?? t.projected ?? 0 }))
  const tonnageDashFrom = tonnage.findIndex((t) => t.projected != null)
  const deloads = plan.filter((p) => p.deload)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup onValueChange={(v) => v && setMuscle(v as MuscleGroup)} size="sm" type="single" value={muscle} variant="outline">
          {VOLUME_GROUPS.map((g) => (
            <ToggleGroupItem key={g} value={g}>
              {g}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup onValueChange={(v) => v && setWeeks(Number(v))} size="sm" type="single" value={String(weeks)} variant="outline">
          {[5, 10, 15, 20].map((w) => (
            <ToggleGroupItem key={w} value={String(w)}>
              {w}w
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {lm ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard hint="Last 4 weeks" label="Current sets/wk" value={fmt1(ctx.setsPerWeek(muscle))} />
          <StatCard hint="Minimum effective volume" label="MEV" value={lm.mev} />
          <StatCard hint="Most productive range" label="MAV" value={`${lm.mavLow}–${lm.mavHigh}`} />
          <StatCard hint="Max recoverable, from your recovery inputs" label="MRV" value={lm.mrv} />
        </div>
      ) : null}

      <ChartCard
        description={`Last 12 weeks, then a ${weeks}-week plan: add sets each week toward your MRV, deload every 5th week${deloads.length ? ` (${deloads.map((d) => formatDate(d.date)).join(", ")})` : ""}.`}
        title={`Weekly sets plan · ${muscle}`}
      >
        <TimeLineChart
          data={rows}
          format={fmt1}
          includeY={lm ? [lm.mrv] : undefined}
          series={[{ key: "sets", label: "Sets", color: MUSCLE_COLOR[muscle], dashFromIndex: Math.max(0, hist.length - 1) }]}
        >
          {lm ? (
            <>
              <ReferenceArea fill="var(--status-good)" fillOpacity={0.1} y1={lm.mev} y2={lm.mavHigh} />
              <ReferenceArea fill="var(--status-critical)" fillOpacity={0.08} y2={lm.mrv} />
            </>
          ) : null}
        </TimeLineChart>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          description={`Weekly tonnage following the plan, with working weights rising ${fmt1(growth * 100)}%/week (the average forecast strength gain of your main exercises).`}
          title="Projected weekly volume"
        >
          <TimeLineChart
            data={tonnageRows}
            format={fmtTonnes}
            series={[{ key: "volume", label: "Volume", color: SERIES[0], dashFromIndex: tonnageDashFrom >= 0 ? tonnageDashFrom : undefined }]}
          />
        </ChartCard>
        <ChartCard description="Where each group sits against its personal landmarks" title="Plan by muscle group">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Now</TableHead>
                <TableHead className="text-right">Next week</TableHead>
                <TableHead className="text-right">Peak</TableHead>
                <TableHead>Advice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {VOLUME_GROUPS.map((g) => {
                const p = plans.get(g) ?? []
                const l = personalLandmarks(g, ctx.profile, ctx.trainingYears)!
                const now = ctx.setsPerWeek(g)
                const advice =
                  now < l.mev ? "Add volume" : now > l.mrv ? "Cut back — above MRV" : now > l.mavHigh ? "Deload soon" : "Keep progressing"
                return (
                  <TableRow key={g}>
                    <TableCell>{g}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(now)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p[0]?.sets ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.length ? Math.max(...p.map((w) => w.sets)) : "–"}</TableCell>
                    <TableCell className="text-muted-foreground">{advice}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </ChartCard>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fatigue & readiness
// ---------------------------------------------------------------------------

function FatigueTab({ data, ctx }: { data: Dataset; ctx: ModelContext }) {
  const [scenario, setScenario] = useState<LoadScenario>("maintain")
  const loads = useMemo(() => dailyLoads(data.allRows.filter((r) => r.date <= addDays(ctx.asOf, 1))), [data.allRows, ctx.asOf])
  const ff = useMemo(() => fitnessFatigue(loads, 28, scenario, ctx.asOf), [loads, scenario, ctx.asOf])
  const acwr = useMemo(() => acuteChronic(loads, ctx.asOf), [loads, ctx.asOf])

  const windowStart = new Date(ctx.asOf.getTime() - 120 * DAY)
  const ffRows = ff.filter((p) => p.date >= windowStart)
  const dashFrom = ffRows.findIndex((p) => p.projected)
  const today = ff.filter((p) => !p.projected).at(-1)
  const ready = readiness(today, ctx.profile)
  const acwrRows = acwr.filter((p) => p.date >= windowStart && p.ratio != null).map((p) => ({ date: p.date, ratio: p.ratio }))
  const currentAcwr = acwr.at(-1)?.ratio ?? null
  const zone = acwrZone(currentAcwr)
  const peak = ff.filter((p) => p.projected).reduce<(typeof ff)[number] | null>((a, b) => (!a || b.form > a.form ? b : a), null)

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BatteryCharging className="size-4" /> Readiness
            </CardTitle>
            <CardDescription>As of {formatDate(ctx.asOf)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex justify-center">
              <Gauge centerValue={Math.round(ready.score)} defaultLabel="Ready" height={150} totalNotches={36} value={ready.score} width={240} />
            </div>
            <ul className="grid gap-2 text-sm">
              {ready.parts.map((p) => (
                <li className="grid gap-1" key={p.label}>
                  <div className="flex justify-between">
                    <span>{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(p.score)}</span>
                  </div>
                  <Progress aria-label={p.label} value={p.score} />
                  <span className="text-xs text-muted-foreground">{p.detail}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Add resting HR and HRV on the Body & health page to sharpen this score.</p>
          </CardContent>
        </Card>

        <ChartCard
          action={
            <ToggleGroup onValueChange={(v) => v && setScenario(v as LoadScenario)} size="sm" type="single" value={scenario} variant="outline">
              <ToggleGroupItem value="maintain">Keep going</ToggleGroupItem>
              <ToggleGroupItem value="deload">Deload</ToggleGroupItem>
              <ToggleGroupItem value="rest">Rest</ToggleGroupItem>
            </ToggleGroup>
          }
          className="lg:col-span-2"
          description={
            <>
              Banister fitness–fatigue model: fitness builds slowly (τ 42 d), fatigue fast (τ 7 d); form = fitness − fatigue. Dashed = next 4 weeks
              if you {scenario === "maintain" ? "keep your recent routine" : scenario === "deload" ? "halve your training load" : "stop training"}.
              {peak ? ` Form peaks around ${formatDate(peak.date)}.` : ""}
            </>
          }
          title="Fitness, fatigue & form"
        >
          <TimeLineChart
            data={ffRows as unknown as Record<string, unknown>[]}
            format={fmt1}
            height={300}
            series={[
              { key: "fitness", label: "Fitness", color: SERIES[0], dashFromIndex: dashFrom >= 0 ? dashFrom : undefined },
              { key: "fatigue", label: "Fatigue", color: SERIES[1], dashFromIndex: dashFrom >= 0 ? dashFrom : undefined },
              { key: "form", label: "Form", color: SERIES[2], dashFromIndex: dashFrom >= 0 ? dashFrom : undefined },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard
        action={
          <Badge variant={zone.tone === "critical" ? "destructive" : zone.tone === "good" ? "secondary" : "outline"}>
            {zone.tone === "critical" || zone.tone === "warning" ? <AlertTriangle /> : null}
            {currentAcwr != null ? `${fmt1(currentAcwr)} · ` : ""}
            {zone.label}
          </Badge>
        }
        description="Acute (7-day) vs chronic (28-day) training load. 0.8–1.3 is the sweet spot; above 1.5 load is rising faster than your body has adapted to, which is associated with higher injury risk."
        title="Acute:chronic workload ratio"
      >
        {acwrRows.length >= 2 ? (
          <TimeLineChart data={acwrRows} format={(v) => v.toFixed(2)} series={[{ key: "ratio", label: "ACWR", color: SERIES[0] }]}>
            <ReferenceArea fill="var(--status-good)" fillOpacity={0.12} y1={0.8} y2={1.3} />
            <ReferenceArea fill="var(--status-warning)" fillOpacity={0.12} y1={1.3} y2={1.5} />
            <ReferenceArea fill="var(--status-critical)" fillOpacity={0.1} y2={1.5} />
          </TimeLineChart>
        ) : (
          <EmptyChart>Needs at least 4 weeks of history</EmptyChart>
        )}
      </ChartCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

function StandardsTab({ data, ctx }: { data: Dataset; ctx: ModelContext }) {
  const { profile } = ctx
  const bw = scalingBodyweight(profile)
  const lifts = useMemo(() => {
    const best = new Map<MainLift, { exercise: string; e1rm: number }>()
    for (const [exercise, list] of data.allSessions) {
      const lift = mainLiftOf(exercise)
      if (!lift) continue
      const e1rm = Math.max(...list.filter((s) => s.date <= ctx.asOf).map((s) => s.bestE1rm), 0)
      if (e1rm > (best.get(lift)?.e1rm ?? 0)) best.set(lift, { exercise, e1rm })
    }
    return (["squat", "bench", "deadlift", "ohp"] as MainLift[])
      .filter((l) => best.has(l))
      .map((lift) => {
        const { exercise, e1rm } = best.get(lift)!
        const cls = classify(profile.sex, lift, e1rm, bw)
        const f = forecastFor(data, ctx, exercise, 52)
        const weeks = f && cls.nextKg ? weeksToTarget(f, cls.nextKg) : null
        return { lift, exercise, e1rm, cls, eta: f && weeks != null ? dateAfterWeeks(f.forecast[0].date, weeks) : null }
      })
  }, [data, ctx, profile.sex, bw])

  const sbd = lifts.filter((l) => l.lift !== "ohp")
  const total = sbd.reduce((a, l) => a + l.e1rm, 0)

  if (!lifts.length) {
    return (
      <EmptyChart>
        Log barbell squat, bench press, deadlift or overhead press to compare against strength standards
      </EmptyChart>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard hint={profile.bodyFatPct != null ? "Lean-mass adjusted" : "From your profile"} label="Scaling bodyweight" value={fmtKg(bw)} />
        <StatCard hint={sbd.length === 3 ? "Squat + bench + deadlift" : `${sbd.length}/3 lifts logged`} label="Est. total" value={fmtKg(total)} />
        <StatCard hint="Bodyweight-adjusted total (IPF)" label="DOTS" value={sbd.length === 3 ? fmtInt(dots(profile.sex, total, profile.bodyweightKg)) : "–"} />
        <StatCard hint="Estimated from standards" label="Lifts assessed" value={lifts.length} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {lifts.map(({ lift, exercise, e1rm, cls, eta }) => (
          <Card key={lift}>
            <CardHeader>
              <CardTitle>{LIFT_LABEL[lift]}</CardTitle>
              <CardDescription>
                {exercise} · est. 1RM {fmtKg(e1rm)} · {fmt1(cls.ratio)}× bodyweight
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between">
                <Badge>{cls.level}</Badge>
                {cls.nextLevel ? (
                  <span className="text-sm text-muted-foreground">
                    {cls.nextLevel} at {fmtKg(cls.nextKg!)}
                  </span>
                ) : null}
              </div>
              <Progress aria-label={`Progress to ${cls.nextLevel ?? "top level"}`} value={cls.progress * 100} />
              <div className="grid grid-cols-5 gap-1 text-center text-[11px] text-muted-foreground">
                {LEVELS.map((l, i) => (
                  <div className={i === cls.levelIndex ? "font-medium text-foreground" : undefined} key={l}>
                    {l}
                    <div className="tabular-nums">{fmtInt(toUnit(cls.thresholds[i]))}</div>
                  </div>
                ))}
              </div>
              {cls.nextLevel ? (
                <p className="text-sm">
                  {eta ? (
                    <>
                      Forecast to reach <span className="font-medium">{cls.nextLevel}</span> around{" "}
                      <span className="font-medium">{formatDate(eta)}</span>.
                    </>
                  ) : (
                    <span className="text-muted-foreground">{cls.nextLevel} is beyond this lift's estimated potential at your current bodyweight.</span>
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Standards are 1RM-to-bodyweight ratios at an 80 kg (men) / 60 kg (women) reference, scaled to your bodyweight by mass<sup>⅔</sup>. They are
        approximate and meant for orientation, not competition.
      </p>
    </div>
  )
}
