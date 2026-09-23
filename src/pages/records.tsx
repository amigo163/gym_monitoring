import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { MuscleBadge, PageHeader } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CategoryBarChart, ChartCard, EmptyChart, SERIES } from "@/components/viz"
import { monthlySeries, summarizeExercise } from "@/lib/analysis"
import { formatDate, formatMonth } from "@/lib/dates"
import { fmt1, fmtInt } from "@/lib/format"
import { MUSCLE_GROUPS } from "@/lib/muscles"
import { PRIMARY_PR, PR_LABEL, fmtMetric, fmtPrimary, primaryLabel, improvementPct, prKindsFor, sessionMetric } from "@/lib/tracking"
import type { ExerciseSession, PrKind } from "@/lib/types"
import { useData } from "@/state/store"

type LogFilter = "main" | "all"

/** The strongest secondary record for the bests table: heaviest set, total reps or time, best pace. */
function secondaryBest(list: ExerciseSession[]): { kind: PrKind; value: number } | null {
  const kind = prKindsFor(list[0].kind, list[0].exercise).find((k) => k !== PRIMARY_PR[list[0].kind])
  if (!kind) return null
  const values = list.map((s) => sessionMetric(s, kind)).filter((v) => v > 0)
  if (!values.length) return null
  return { kind, value: kind === "pace" ? Math.min(...values) : Math.max(...values) }
}

export function RecordsPage() {
  const { sessions, prs, workouts } = useData()
  const [query, setQuery] = useState("")
  const [muscle, setMuscle] = useState("all")
  const [filter, setFilter] = useState<LogFilter>("main")

  const bests = useMemo(
    () =>
      [...sessions.values()]
        .map((list) => {
          const s = summarizeExercise(list)!
          return { ...s, secondary: secondaryBest(list), prCount: prs.filter((p) => p.exercise === s.exercise && p.primary).length }
        })
        .sort((a, b) => b.sessions - a.sessions),
    [sessions, prs],
  )
  const monthly = useMemo(() => monthlySeries(workouts, prs), [workouts, prs])

  const matches = (exercise: string, m: string) =>
    exercise.toLowerCase().includes(query.toLowerCase()) && (muscle === "all" || m === muscle)
  const filteredBests = bests.filter((b) => matches(b.exercise, b.muscle))
  const log = prs.filter((p) => (filter === "all" || p.primary) && matches(p.exercise, p.muscle))

  return (
    <>
      <PageHeader description="Every personal best, and when you set it" title="Records">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search exercises" className="pl-8" onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises" value={query} />
          </div>
          <Select onValueChange={setMuscle} value={muscle}>
            <SelectTrigger aria-label="Muscle group" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {MUSCLE_GROUPS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <ChartCard description="Records in each exercise's main metric (est. 1RM, most reps, longest hold or distance) per month" title="PR frequency">
        <CategoryBarChart
          data={monthly.map((m) => ({ month: formatMonth(m.date), prs: m.prs }))}
          format={fmtInt}
          height={200}
          series={[{ key: "prs", label: "PRs", color: SERIES[0] }]}
          xKey="month"
        />
      </ChartCard>

      <ChartCard className="mt-4" description="Your best performance for every exercise" title="Personal bests">
        {filteredBests.length ? (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercise</TableHead>
                  <TableHead className="hidden sm:table-cell">Group</TableHead>
                  <TableHead className="text-right">Best</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Also</TableHead>
                  <TableHead className="text-right">PRs</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Set on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBests.map((b) => (
                  <TableRow key={b.exercise}>
                    <TableCell className="font-medium">{b.exercise}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <MuscleBadge muscle={b.muscle} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>{fmtPrimary(b.best)}</div>
                      <div className="text-xs text-muted-foreground">{primaryLabel(b.best)}</div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {b.secondary ? (
                        <>
                          <div>{fmtMetric(b.secondary.kind, b.secondary.value)}</div>
                          <div className="text-xs text-muted-foreground">{PR_LABEL[b.secondary.kind]}</div>
                        </>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.prCount}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                      {formatDate(b.best.date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyChart className="h-24">No exercises match</EmptyChart>
        )}
      </ChartCard>

      <ChartCard
        action={
          <ToggleGroup onValueChange={(v) => v && setFilter(v as LogFilter)} size="sm" type="single" value={filter} variant="outline">
            <ToggleGroupItem value="main">Main</ToggleGroupItem>
            <ToggleGroupItem value="all">All records</ToggleGroupItem>
          </ToggleGroup>
        }
        className="mt-4"
        description="Each time you beat a previous best. Main shows each exercise's headline metric; All adds heaviest set, volume, totals and pace. First sessions are baselines, not PRs."
        title="PR log"
      >
        {log.length ? (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Exercise</TableHead>
                  <TableHead className="hidden sm:table-cell">Record</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Gain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((p) => (
                  <TableRow key={`${p.exercise}-${p.kind}-${p.date.getTime()}`}>
                    <TableCell className="text-muted-foreground">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">{p.exercise}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{PR_LABEL[p.kind]}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMetric(p.kind, p.previous ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMetric(p.kind, p.value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      +{fmt1(improvementPct(p.kind, p.previous ?? 0, p.value))}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyChart className="h-24">No records match</EmptyChart>
        )}
      </ChartCard>
    </>
  )
}
