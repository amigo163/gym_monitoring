import { Pencil, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { MUSCLE_COLOR, MuscleBadge, PageHeader, StatCard } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate, parseDayKey } from "@/lib/dates"
import { fmt1, fmtInt, fmtKg } from "@/lib/format"
import { LIFT_LABEL, bmi, combine, ffmi, leanMassKg, mainLiftOf, recoveryFactors } from "@/lib/models/physiology"
import { MUSCLE_GROUPS, bodyweightShare, defaultMuscleGroup, isAssisted, muscleGroupFor } from "@/lib/muscles"
import { KIND_LABEL, PR_LABEL, PRIMARY_PR, TRACKING_KINDS, fmtMetric, fmtPrimary } from "@/lib/tracking"
import type { ExerciseSession, MuscleGroup, TrackingKind } from "@/lib/types"
import { usePersistentState, useData, useStore } from "@/state/store"

const STRESS = ["", "Very low", "Low", "Moderate", "High", "Very high"]
const NUTRITION = { deficit: "Deficit", maintenance: "Maintenance", surplus: "Surplus" }

interface CatalogueEntry {
  exercise: string
  muscle: MuscleGroup
  kind: TrackingKind
  muscleOverridden: boolean
  kindOverridden: boolean
  /** Share of bodyweight added to the logged load, 0 for loaded lifts. */
  bodyweightShare: number
  assisted: boolean
  mainLift: string | null
  sessions: number
  sets: number
  first: Date
  last: Date
  best: ExerciseSession
}

function buildCatalogue(
  sessions: Map<string, ExerciseSession[]>,
  kinds: Map<string, TrackingKind>,
  overrides: Record<string, { muscle: MuscleGroup | null; kind: TrackingKind | null }>,
): CatalogueEntry[] {
  return [...sessions.entries()]
    .map(([exercise, list]) => {
      const lift = mainLiftOf(exercise)
      return {
        exercise,
        muscle: muscleGroupFor(exercise),
        kind: kinds.get(exercise) ?? "weight",
        muscleOverridden: overrides[exercise]?.muscle != null,
        kindOverridden: overrides[exercise]?.kind != null,
        bodyweightShare: bodyweightShare(exercise),
        assisted: isAssisted(exercise),
        mainLift: lift ? LIFT_LABEL[lift] : null,
        sessions: list.length,
        sets: list.reduce((a, s) => a + s.sets, 0),
        first: list[0].date,
        last: list.at(-1)!.date,
        best: list.reduce((a, b) => (b.primary > a.primary ? b : a)),
      }
    })
    .sort((a, b) => MUSCLE_GROUPS.indexOf(a.muscle) - MUSCLE_GROUPS.indexOf(b.muscle) || a.exercise.localeCompare(b.exercise))
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

function ProfileTab() {
  const { profile } = useStore()
  const recovery = combine(recoveryFactors(profile))
  const lean = leanMassKg(profile)
  const ffmiValue = ffmi(profile)
  const opt = (v: number | null, unit: string) => (v == null ? "–" : `${fmt1(v)} ${unit}`)
  const latestLog = profile.bodyweightLog.reduce<{ date: string; kg: number } | null>((a, b) => (!a || b.date > a.date ? b : a), null)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Body</CardTitle>
          <CardDescription>Scales strength standards and bodyweight exercises</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Sex" value={profile.sex === "male" ? "Male" : "Female"} />
          <Row label="Age" value={`${profile.age} yrs`} />
          <Row label="Height" value={`${profile.heightCm} cm`} />
          <Row label="Bodyweight" value={fmtKg(profile.bodyweightKg)} />
          <Row label="Body fat" value={opt(profile.bodyFatPct, "%")} />
          <Row label="Lean mass" value={lean ? fmtKg(lean) : "–"} />
          <Row label="BMI · FFMI" value={`${fmt1(bmi(profile))} · ${ffmiValue ? fmt1(ffmiValue) : "–"}`} />
          <Row label="Lifting before first log" value={`${fmt1(profile.priorTrainingYears)} yrs`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recovery & lifestyle</CardTitle>
          <CardDescription>Combined recovery capacity: {Math.round(recovery * 100)}%</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Sleep" value={`${profile.sleepHours} h`} />
          <Row label="Life stress" value={STRESS[profile.stress]} />
          <Row label="Protein" value={`${profile.proteinGPerKg} g/kg`} />
          <Row label="Energy balance" value={NUTRITION[profile.nutrition]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Health markers</CardTitle>
          <CardDescription>Today vs. your usual values</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Resting HR" value={opt(profile.restingHr, "bpm")} />
          <Row label="Usual resting HR" value={opt(profile.restingHrBaseline, "bpm")} />
          <Row label="HRV" value={opt(profile.hrvMs, "ms")} />
          <Row label="Usual HRV" value={opt(profile.hrvBaselineMs, "ms")} />
          <Row
            label="Bodyweight log"
            value={
              latestLog
                ? `${profile.bodyweightLog.length} entries · last ${formatDate(parseDayKey(latestLog.date))}`
                : "No entries"
            }
          />
        </CardContent>
      </Card>
      <div className="lg:col-span-3">
        <Button onClick={() => (window.location.hash = "profile")} variant="outline">
          <Pencil /> Edit in Body & health
        </Button>
      </div>
    </div>
  )
}

function ClassificationSelect<T extends string>({
  label,
  value,
  auto,
  options,
  format,
  onChange,
}: {
  label: string
  value: T | null
  auto: T
  options: readonly T[]
  format: (v: T) => string
  onChange: (v: T | null) => void
}) {
  return (
    <Select onValueChange={(v) => onChange(v === "auto" ? null : (v as T))} value={value ?? "auto"}>
      <SelectTrigger aria-label={label} className="w-40" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto · {format(auto)}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {format(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ExercisesTab({ catalogue }: { catalogue: CatalogueEntry[] }) {
  const { exerciseSettings, setExerciseSettings } = useStore()
  const { autoKinds } = useData()
  const [query, setQuery] = useState("")
  const [muscle, setMuscle] = usePersistentState<MuscleGroup | "all">("gymviz.library.muscle", "all")
  const [kind, setKind] = usePersistentState<TrackingKind | "all">("gymviz.library.kind", "all")

  const q = query.trim().toLowerCase()
  const shown = catalogue.filter(
    (e) => (muscle === "all" || e.muscle === muscle) && (kind === "all" || e.kind === kind) && (!q || e.exercise.toLowerCase().includes(q)),
  )
  const save = (exercise: string, patch: { muscle?: MuscleGroup | null; kind?: TrackingKind | null }) =>
    setExerciseSettings({ ...(exerciseSettings[exercise] ?? { exercise, muscle: null, kind: null }), ...patch })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise catalogue</CardTitle>
        <CardDescription>
          Every exercise in your history, how it's classified and what it's measured by. Changes here apply across records, forecasts and
          next-session targets.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search exercises" className="pl-8" onChange={(e) => setQuery(e.target.value)} placeholder="Search" value={query} />
          </div>
          <Select onValueChange={(v) => setMuscle(v as MuscleGroup | "all")} value={muscle}>
            <SelectTrigger aria-label="Muscle group" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All muscle groups</SelectItem>
              {MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => setKind(v as TrackingKind | "all")} value={kind}>
            <SelectTrigger aria-label="Measured by" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TRACKING_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="self-center text-xs text-muted-foreground">
            {shown.length} of {catalogue.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exercise</TableHead>
              <TableHead>Muscle group</TableHead>
              <TableHead>Measured by</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Sets</TableHead>
              <TableHead className="text-right">Best</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((e) => (
              <TableRow key={e.exercise}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: MUSCLE_COLOR[e.muscle] }} />
                    {e.exercise}
                  </span>
                </TableCell>
                <TableCell>
                  <ClassificationSelect
                    auto={defaultMuscleGroup(e.exercise)}
                    format={(m) => m}
                    label={`Muscle group of ${e.exercise}`}
                    onChange={(m) => save(e.exercise, { muscle: m })}
                    options={MUSCLE_GROUPS}
                    value={exerciseSettings[e.exercise]?.muscle ?? null}
                  />
                </TableCell>
                <TableCell>
                  <ClassificationSelect
                    auto={autoKinds.get(e.exercise) ?? "weight"}
                    format={(k) => KIND_LABEL[k]}
                    label={`What ${e.exercise} is measured by`}
                    onChange={(k) => save(e.exercise, { kind: k })}
                    options={TRACKING_KINDS}
                    value={exerciseSettings[e.exercise]?.kind ?? null}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {e.mainLift ? <Badge variant="secondary">{e.mainLift}</Badge> : null}
                    {e.assisted ? (
                      <Badge variant="outline">Assisted</Badge>
                    ) : e.bodyweightShare > 0 ? (
                      <Badge variant="outline">{Math.round(e.bodyweightShare * 100)}% BW</Badge>
                    ) : null}
                    {e.muscleOverridden || e.kindOverridden ? <Badge variant="outline">Edited</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(e.sessions)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(e.sets)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtPrimary(e.best)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(e.first)} – {formatDate(e.last)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!shown.length ? <p className="py-8 text-center text-sm text-muted-foreground">No exercises match.</p> : null}
      </CardContent>
    </Card>
  )
}

function MuscleGroupsTab({ catalogue }: { catalogue: CatalogueEntry[] }) {
  const groups = MUSCLE_GROUPS.map((m) => ({ muscle: m, items: catalogue.filter((e) => e.muscle === m) })).filter((g) => g.items.length)
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.muscle}>
          <CardHeader>
            <CardTitle>
              <MuscleBadge muscle={g.muscle} />
            </CardTitle>
            <CardDescription>
              {g.items.length} {g.items.length === 1 ? "exercise" : "exercises"} · {fmtInt(g.items.reduce((a, e) => a + e.sets, 0))} sets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {[...g.items]
                .sort((a, b) => b.sets - a.sets)
                .map((e) => (
                  <li className="flex items-center justify-between gap-3" key={e.exercise}>
                    <span className="truncate">{e.exercise}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{KIND_LABEL[e.kind]}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function GoalsTab() {
  const { goals } = useStore()
  const { allSessions, kinds } = useData()
  const list = Object.values(goals).sort((a, b) => a.exercise.localeCompare(b.exercise))
  if (!list.length)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No goals yet. Set them from the Goals tab in{" "}
          <Button className="h-auto p-0" onClick={() => (window.location.hash = "predictions")} variant="link">
            Predictions
          </Button>
          .
        </CardContent>
      </Card>
    )
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exercise</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead>Rep range</TableHead>
              <TableHead>Deadline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((g) => {
              const metric = PRIMARY_PR[kinds.get(g.exercise) ?? "weight"]
              const current = allSessions.get(g.exercise)?.at(-1)
              return (
                <TableRow key={g.exercise}>
                  <TableCell className="font-medium">{g.exercise}</TableCell>
                  <TableCell className="text-right tabular-nums">{current ? fmtPrimary(current) : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.target != null ? `${fmtMetric(metric, g.target)}` : "–"}
                    {g.target != null ? <span className="ml-1 text-xs text-muted-foreground">{PR_LABEL[metric]}</span> : null}
                  </TableCell>
                  <TableCell>{g.repRange ? `${g.repRange.min}–${g.repRange.max}` : "–"}</TableCell>
                  <TableCell>{g.deadline ? formatDate(parseDayKey(g.deadline)) : "–"}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function LibraryPage() {
  const { exerciseSettings, goals } = useStore()
  const { allSessions, kinds } = useData()
  const catalogue = useMemo(() => buildCatalogue(allSessions, kinds, exerciseSettings), [allSessions, kinds, exerciseSettings])
  const [tab, setTab] = usePersistentState("gymviz.library.tab", "exercises")
  const edited = catalogue.filter((e) => e.muscleOverridden || e.kindOverridden).length
  const muscles = new Set(catalogue.map((e) => e.muscle)).size

  return (
    <>
      <PageHeader
        description="Reference data behind the analytics and models: your profile, every exercise you've logged with its muscle group and type, and your goals. Covers your full history regardless of the date range."
        title="Library"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Exercises" value={fmtInt(catalogue.length)} />
        <StatCard label="Muscle groups" value={fmtInt(muscles)} />
        <StatCard hint="Muscle group or type changed by you" label="Edited" value={fmtInt(edited)} />
        <StatCard label="Goals" value={fmtInt(Object.keys(goals).length)} />
      </div>
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="exercises">Exercises</TabsTrigger>
          <TabsTrigger value="muscles">By muscle group</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
        </TabsList>
        <TabsContent value="exercises">
          <ExercisesTab catalogue={catalogue} />
        </TabsContent>
        <TabsContent value="muscles">
          <MuscleGroupsTab catalogue={catalogue} />
        </TabsContent>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="goals">
          <GoalsTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
