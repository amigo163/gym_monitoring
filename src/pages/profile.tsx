import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { PageHeader, StatCard } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ChartCard, SERIES, TimeLineChart } from "@/components/viz"
import { dayKey, formatDate, parseDayKey } from "@/lib/dates"
import { fmt1 } from "@/lib/format"
import { bmi, combine, ffmi, leanMassKg, recoveryFactors } from "@/lib/models/physiology"
import type { NutritionState, Profile, Sex } from "@/lib/types"
import { useStore } from "@/state/store"

function NumberField({
  id,
  label,
  value,
  onChange,
  unit,
  optional,
  step = 1,
  min,
  max,
}: {
  id: string
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  optional?: boolean
  step?: number
  min?: number
  max?: number
}) {
  const [text, setText] = useState(value == null ? "" : String(value))
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      <div className="relative">
        <Input
          className={unit ? "pr-12" : undefined}
          id={id}
          inputMode="decimal"
          max={max}
          min={min}
          onBlur={() => setText(value == null ? "" : String(value))}
          onChange={(e) => {
            setText(e.target.value)
            const v = e.target.value.trim()
            if (v === "") {
              if (optional) onChange(null)
              return
            }
            const n = Number(v)
            if (Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) onChange(n)
          }}
          step={step}
          type="number"
          value={text}
        />
        {unit ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  )
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format: (v: number) => string
  hint?: string
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <Slider aria-label={label} max={max} min={min} onValueChange={([v]) => onChange(v)} step={step} value={[value]} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ProfilePage() {
  const { profile, setProfile } = useStore()
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value })

  const factors = recoveryFactors(profile)
  const recovery = combine(factors)
  const lean = leanMassKg(profile)
  const ffmiValue = ffmi(profile)

  const [logDate, setLogDate] = useState(dayKey(new Date()))
  const [logKg, setLogKg] = useState(String(profile.bodyweightKg))
  const log = [...profile.bodyweightLog].sort((a, b) => a.date.localeCompare(b.date))

  const addEntry = () => {
    const kg = Number(logKg)
    if (!Number.isFinite(kg) || kg < 25 || kg > 350 || !logDate) return
    const next = [...profile.bodyweightLog.filter((e) => e.date !== logDate), { date: logDate, kg }]
    const latest = next.reduce((a, b) => (b.date > a.date ? b : a))
    setProfile({ ...profile, bodyweightLog: next, bodyweightKg: latest.kg })
  }

  return (
    <>
      <PageHeader
        description="These inputs drive the prediction models: bodyweight and body composition set your strength potential; sleep, stress, diet and age set how quickly you adapt and how much volume you can recover from. Everything stays in this browser."
        title="Body & health"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard hint="Rate multiplier from recovery inputs" label="Recovery capacity" value={`${Math.round(recovery * 100)}%`} />
        <StatCard hint="Body-mass index" label="BMI" value={fmt1(bmi(profile))} />
        <StatCard hint={profile.bodyFatPct == null ? "Add body fat % to compute" : "Fat-free mass"} label="Lean mass" value={lean ? `${fmt1(lean)} kg` : "–"} />
        <StatCard hint="Height-normalised; ~25 is a common natural ceiling" label="FFMI" value={ffmiValue ? fmt1(ffmiValue) : "–"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Body</CardTitle>
            <CardDescription>Sets bodyweight-scaled strength standards and the load of bodyweight exercises</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Sex</Label>
              <ToggleGroup onValueChange={(v) => v && set("sex", v as Sex)} type="single" value={profile.sex} variant="outline">
                <ToggleGroupItem value="male">Male</ToggleGroupItem>
                <ToggleGroupItem value="female">Female</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NumberField id="age" label="Age" max={100} min={12} onChange={(v) => v != null && set("age", v)} unit="yrs" value={profile.age} />
              <NumberField id="height" label="Height" max={250} min={120} onChange={(v) => v != null && set("heightCm", v)} unit="cm" value={profile.heightCm} />
              <NumberField id="bw" label="Bodyweight" max={350} min={25} onChange={(v) => v != null && set("bodyweightKg", v)} step={0.1} unit="kg" value={profile.bodyweightKg} />
              <NumberField id="bf" label="Body fat" max={60} min={3} onChange={(v) => set("bodyFatPct", v)} optional step={0.5} unit="%" value={profile.bodyFatPct} />
              <NumberField
                id="prior"
                label="Lifting before first log"
                max={50}
                min={0}
                onChange={(v) => v != null && set("priorTrainingYears", v)}
                step={0.5}
                unit="yrs"
                value={profile.priorTrainingYears}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recovery & lifestyle</CardTitle>
            <CardDescription>Scale how fast you adapt and how much weekly volume you can recover from</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SliderField
              format={(v) => `${v} h`}
              hint="7–9 h supports full recovery; chronic < 6 h blunts strength gains"
              label="Average sleep"
              max={10}
              min={4}
              onChange={(v) => set("sleepHours", v)}
              step={0.5}
              value={profile.sleepHours}
            />
            <SliderField
              format={(v) => ["", "Very low", "Low", "Moderate", "High", "Very high"][v]}
              label="Life stress"
              max={5}
              min={1}
              onChange={(v) => set("stress", v)}
              step={1}
              value={profile.stress}
            />
            <SliderField
              format={(v) => `${v} g/kg`}
              hint="Benefits plateau around 1.6 g per kg of bodyweight per day"
              label="Protein intake"
              max={3}
              min={0.6}
              onChange={(v) => set("proteinGPerKg", v)}
              step={0.1}
              value={profile.proteinGPerKg}
            />
            <div className="grid gap-1.5">
              <Label>Energy balance</Label>
              <ToggleGroup onValueChange={(v) => v && set("nutrition", v as NutritionState)} type="single" value={profile.nutrition} variant="outline">
                <ToggleGroupItem value="deficit">Deficit</ToggleGroupItem>
                <ToggleGroupItem value="maintenance">Maintenance</ToggleGroupItem>
                <ToggleGroupItem value="surplus">Surplus</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health markers</CardTitle>
            <CardDescription>From a wearable or a morning measurement; used for today's readiness score</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <NumberField id="rhr" label="Resting HR" max={120} min={30} onChange={(v) => set("restingHr", v)} optional unit="bpm" value={profile.restingHr} />
            <NumberField id="rhrb" label="Usual resting HR" max={120} min={30} onChange={(v) => set("restingHrBaseline", v)} optional unit="bpm" value={profile.restingHrBaseline} />
            <NumberField id="hrv" label="HRV (rMSSD)" max={250} min={5} onChange={(v) => set("hrvMs", v)} optional unit="ms" value={profile.hrvMs} />
            <NumberField id="hrvb" label="Usual HRV" max={250} min={5} onChange={(v) => set("hrvBaselineMs", v)} optional unit="ms" value={profile.hrvBaselineMs} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How your inputs affect adaptation</CardTitle>
            <CardDescription>Each factor multiplies the rate at which strength approaches your potential</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {factors.map((f) => (
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

      <ChartCard className="mt-4" description="Used to weight bodyweight exercises on the date you did them" title="Bodyweight log">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid content-start gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="log-date">Date</Label>
                <Input id="log-date" onChange={(e) => setLogDate(e.target.value)} type="date" value={logDate} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="log-kg">Weight (kg)</Label>
                <Input id="log-kg" inputMode="decimal" onChange={(e) => setLogKg(e.target.value)} step={0.1} type="number" value={logKg} />
              </div>
            </div>
            <Button onClick={addEntry} variant="outline">
              <Plus /> Add entry
            </Button>
            <ul className="grid max-h-56 gap-1 overflow-auto text-sm">
              {[...log].reverse().map((e) => (
                <li className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted" key={e.date}>
                  <span className="text-muted-foreground">{formatDate(parseDayKey(e.date))}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {fmt1(e.kg)} kg
                    <Button
                      aria-label={`Remove ${e.date}`}
                      onClick={() => set("bodyweightLog", profile.bodyweightLog.filter((x) => x.date !== e.date))}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-2">
            <TimeLineChart
              data={log.map((e) => ({ date: parseDayKey(e.date), kg: e.kg }))}
              format={fmt1}
              height={240}
              series={[{ key: "kg", label: "Bodyweight", color: SERIES[0] }]}
            />
          </div>
        </div>
      </ChartCard>
    </>
  )
}
