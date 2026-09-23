import { AlertTriangle, BatteryCharging, Info, RotateCcw, Target } from "lucide-react"
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
import { addDays, formatDate } from "@/lib/dates"
import { fmt1, fmtInt, fmtKg, fmtTonnes } from "@/lib/format"
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
import { type StrengthForecast, dateAfterWeeks, forecastStrength, weeksToTarget } from "@/lib/models/strength"
import { VOLUME_GROUPS, personalLandmarks, planVolume, projectTonnage } from "@/lib/models/volume"
import { muscleGroupFor } from "@/lib/muscles"
import { loadForReps } from "@/lib/one-rep-max"
import type { MuscleGroup, NutritionState } from "@/lib/types"
import { type Dataset, useData, useStore } from "@/state/store"

const HORIZONS = [4, 8, 12, 26] as const
const DAY = 86_400_000

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
      <Tabs defaultValue="strength">
        <TabsList className="mb-2 h-auto flex-wrap justify-start">
          <TabsTrigger value="strength">Strength</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="fatigue">Fatigue & readiness</TabsTrigger>
          <TabsTrigger value="standards">Standards</TabsTrigger>
        </TabsList>
        <TabsContent value="strength">
          <StrengthTab ctx={ctx} data={data} />
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
// Strength
// ---------------------------------------------------------------------------

function forecastRows(f: StrengthForecast, baseline: StrengthForecast | null) {
  const rows: Record<string, unknown>[] = f.history.map((h) => ({
    date: h.date,
    e1rm: h.e1rm,
    upper: h.e1rm,
    lower: h.e1rm,
    baseline: h.e1rm,
    fitted: h.fitted,
    projected: false,
  }))
  const last = f.history.at(-1)!
  // Skip the forecast anchor when it coincides with the last session.
  const future = f.forecast.filter((p) => p.date.getTime() > last.date.getTime())
  future.forEach((p, i) => {
    rows.push({
      date: p.date,
      e1rm: p.expected,
      upper: p.upper,
      lower: p.lower,
      baseline: baseline?.forecast.find((b) => b.date.getTime() === p.date.getTime())?.expected ?? p.expected,
      fitted: p.trend,
      projected: true,
      week: i + 1,
    })
  })
  return rows
}

function StrengthTab({ data, ctx }: { data: Dataset; ctx: ModelContext }) {
  const { profile } = ctx
  const candidates = useMemo(
    () =>
      exerciseUsage(data.allSessions).filter(
        (u) => (data.allSessions.get(u.exercise) ?? []).filter((s) => s.bestE1rm > 0).length >= 2,
      ),
    [data.allSessions],
  )
  const defaultExercise = candidates.find((c) => mainLiftOf(c.exercise))?.exercise ?? candidates[0]?.exercise ?? ""
  const [picked, setPicked] = useState<string | null>(null)
  const exercise = picked && data.allSessions.has(picked) ? picked : defaultExercise
  const [horizon, setHorizon] = useState<number>(12)
  const baseScenario: RecoveryInputs = {
    sleepHours: profile.sleepHours,
    stress: profile.stress,
    nutrition: profile.nutrition,
    proteinGPerKg: profile.proteinGPerKg,
    age: profile.age,
  }
  const [scenario, setScenario] = useState<RecoveryInputs>(baseScenario)
  const scenarioChanged = (Object.keys(baseScenario) as (keyof RecoveryInputs)[]).some((k) => baseScenario[k] !== scenario[k])
  const [target, setTarget] = useState("")

  const forecast = useMemo(
    () => (exercise ? forecastFor(data, ctx, exercise, horizon, scenario) : null),
    [data, ctx, exercise, horizon, scenario],
  )
  const baseline = useMemo(
    () => (exercise && scenarioChanged ? forecastFor(data, ctx, exercise, horizon) : null),
    [data, ctx, exercise, horizon, scenarioChanged],
  )

  if (!candidates.length) {
    return <EmptyChart>Log an exercise with weight at least twice to get a strength forecast</EmptyChart>
  }

  const rows = forecast ? forecastRows(forecast, baseline) : []
  const dashFrom = forecast ? forecast.history.length - 1 : undefined
  const series: Series[] = [
    { key: "upper", label: "80% range", color: SERIES[0], dashFromIndex: dashFrom, strokeWidth: 1, hideInLegend: true },
    { key: "lower", label: "80% range", color: SERIES[0], dashFromIndex: dashFrom, strokeWidth: 1, hideInLegend: true },
    { key: "fitted", label: "Log trend (data only)", color: "var(--muted-foreground)", strokeWidth: 1.5, legendDashed: false },
    ...(baseline
      ? [{ key: "baseline", label: "Current habits", color: SERIES[1], dashFromIndex: dashFrom, legendDashed: true } satisfies Series]
      : []),
    { key: "e1rm", label: scenarioChanged ? "Est. 1RM · what-if" : "Est. 1RM", color: SERIES[0], dashFromIndex: dashFrom, strokeWidth: 2.5 },
  ]
  const end = forecast?.forecast.at(-1)
  const targetKg = Number(target)
  const targetWeeks = forecast && targetKg > 0 ? weeksToTarget(forecast, targetKg) : undefined
  const start = forecast?.forecast[0].date ?? ctx.asOf

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ExerciseSelect exercises={candidates} onChange={setPicked} value={exercise} />
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
              hint={forecast.detrainingPct > 0 ? `−${fmt1(forecast.detrainingPct * 100)}% from the layoff` : `from ${forecast.sessions} sessions`}
              label="Current est. 1RM"
              value={fmtKg(forecast.current)}
            />
            <StatCard hint={`80% range ${fmt1(end.lower)}–${fmt1(end.upper)} kg`} label={`In ${horizon} weeks`} value={fmtKg(end.expected)} />
            <StatCard hint="Slows as you approach your potential" label="Expected gain now" value={`${fmt1(forecast.weeklyGain)} kg/wk`} />
            <StatCard
              hint={`Potential ≈ ${fmtKg(forecast.ceiling)}${forecast.mainLift ? " (bodyweight-scaled standard)" : " (from training age)"}`}
              label="Of potential"
              value={`${fmtInt(forecast.percentOfPotential * 100)}%`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              description="Solid = logged sessions, dashed = forecast with its 80% range. The grey line is a pure log-trend fit for comparison."
              title={`${exercise} forecast`}
            >
              <TimeLineChart data={rows} format={fmt1} height={320} series={series}>
                <ReferenceArea
                  fill="var(--muted-foreground)"
                  fillOpacity={0.06}
                  fadeEdges={false}
                  x1={forecast.history.at(-1)!.date}
                />
              </TimeLineChart>
            </ChartCard>

            <Card>
              <CardHeader>
                <CardTitle>What if…</CardTitle>
                <CardDescription>Change recovery inputs for the forecast period</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
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
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4" /> Goal
                </CardTitle>
                <CardDescription>When will you hit a target 1RM?</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="relative">
                  <Input
                    aria-label="Target 1RM in kg"
                    inputMode="decimal"
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={String(Math.round((forecast.current * 1.1) / 2.5) * 2.5)}
                    type="number"
                    value={target}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">kg</span>
                </div>
                {targetWeeks === undefined ? (
                  <p className="text-sm text-muted-foreground">Enter a target weight.</p>
                ) : targetWeeks === null ? (
                  <p className="text-sm">
                    Beyond your estimated potential of {fmtKg(forecast.ceiling)} — gaining bodyweight or lean mass would raise it.
                  </p>
                ) : targetWeeks === 0 ? (
                  <p className="text-sm">You're already there.</p>
                ) : (
                  <p className="text-sm">
                    Around <span className="font-semibold">{formatDate(dateAfterWeeks(start, targetWeeks))}</span>
                    <span className="text-muted-foreground"> · {fmtInt(targetWeeks)} weeks at your current habits and training</span>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rep maxes in {horizon} weeks</CardTitle>
                <CardDescription>Working weights from the forecast 1RM</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reps</TableHead>
                      <TableHead className="text-right">Now</TableHead>
                      <TableHead className="text-right">Forecast</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 3, 5, 8, 10].map((r) => (
                      <TableRow key={r}>
                        <TableCell>{r}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt1(loadForReps(forecast.current, r))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt1(loadForReps(end.expected, r))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>What drives this forecast</CardTitle>
                <CardDescription>
                  Rate {(forecast.rate * 100).toFixed(2)}%/wk of the gap to potential
                  {forecast.dataRate != null ? ` · your history alone suggests ${(forecast.dataRate * 100).toFixed(2)}%` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {forecast.factors.map((f) => (
                  <div className="grid gap-1" key={f.key}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{f.label}</span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(f.value * 100)}%</span>
                    </div>
                    <Progress aria-label={f.label} value={f.value * 100} />
                    <p className="text-xs text-muted-foreground">{f.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <HowItWorks />
        </>
      ) : (
        <EmptyChart>Not enough weighted sessions of {exercise} to forecast</EmptyChart>
      )}
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

function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4" /> How the strength model works
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <p>
          Strength approaches a personal ceiling exponentially: <code className="text-foreground">e1RM(t) = C − (C − S₀)·e^(−k·t)</code>. Early
          gains are fast; they slow as you close the gap. This captures diminishing returns better than a straight line.
        </p>
        <p>
          <span className="text-foreground">C (potential)</span> comes from bodyweight-scaled strength standards for squat, bench, deadlift and
          overhead press (strength ∝ mass<sup>⅔</sup>), adjusted for lean mass and age. Other lifts use training age to estimate headroom.
        </p>
        <p>
          <span className="text-foreground">k (rate)</span> is fitted to your sessions and blended with a physiological prior built from sleep,
          stress, energy balance, protein, age, training frequency and weekly volume for the muscle group. Few sessions → the prior dominates.
        </p>
        <p>
          The 80% range widens with the horizon, scaled by how noisy your sessions are. Layoffs longer than three weeks apply detraining
          (≈0.6%/week). Energy balance also shifts projected bodyweight, which moves the ceiling.
        </p>
      </CardContent>
    </Card>
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
      .filter((f): f is StrengthForecast => f != null && f.current > 0)
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
                    <div className="tabular-nums">{fmtInt(cls.thresholds[i])}</div>
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
