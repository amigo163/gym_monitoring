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
import { fmt1, fmtInt, fmtKg } from "@/lib/format"
import { MUSCLE_GROUPS } from "@/lib/muscles"
import type { PrKind } from "@/lib/types"
import { useData } from "@/state/store"

const KIND_LABEL: Record<PrKind, string> = { e1rm: "Est. 1RM", weight: "Weight", volume: "Volume" }

export function RecordsPage() {
  const { sessions, prs, workouts } = useData()
  const [query, setQuery] = useState("")
  const [muscle, setMuscle] = useState("all")
  const [kind, setKind] = useState<PrKind>("e1rm")

  const bests = useMemo(
    () =>
      [...sessions.values()]
        .map((list) => {
          const s = summarizeExercise(list)!
          const bestVolume = list.reduce((a, b) => (b.volume > a.volume ? b : a))
          return { ...s, bestVolume, prCount: prs.filter((p) => p.exercise === s.exercise && p.kind === "e1rm").length }
        })
        .sort((a, b) => b.sessions - a.sessions),
    [sessions, prs],
  )
  const monthly = useMemo(() => monthlySeries(workouts, prs), [workouts, prs])

  const matches = (exercise: string, m: string) =>
    exercise.toLowerCase().includes(query.toLowerCase()) && (muscle === "all" || m === muscle)
  const filteredBests = bests.filter((b) => matches(b.exercise, b.muscle))
  const log = prs.filter((p) => p.kind === kind && matches(p.exercise, p.muscle))

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

      <ChartCard description="Estimated-1RM records per month" title="PR frequency">
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
                  <TableHead className="text-right">Est. 1RM</TableHead>
                  <TableHead className="text-right">Heaviest</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Best volume</TableHead>
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
                    <TableCell className="text-right tabular-nums">{b.bestE1rm.bestE1rm ? fmtKg(b.bestE1rm.bestE1rm) : "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtKg(b.bestWeight.topWeight)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{fmtInt(b.bestVolume.volume)} kg</TableCell>
                    <TableCell className="text-right tabular-nums">{b.prCount}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                      {formatDate((b.bestE1rm.bestE1rm ? b.bestE1rm : b.bestWeight).date)}
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
          <ToggleGroup onValueChange={(v) => v && setKind(v as PrKind)} size="sm" type="single" value={kind} variant="outline">
            {(Object.keys(KIND_LABEL) as PrKind[]).map((k) => (
              <ToggleGroupItem key={k} value={k}>
                {KIND_LABEL[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
        className="mt-4"
        description="Each time you beat a previous best. First sessions are baselines, not PRs."
        title="PR log"
      >
        {log.length ? (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Exercise</TableHead>
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
                    <TableCell className="text-right tabular-nums">{fmt1(p.previous ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt1(p.value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      +{fmt1(((p.value - (p.previous ?? 0)) / (p.previous || 1)) * 100)}%
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
