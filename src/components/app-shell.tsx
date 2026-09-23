import {
  Activity,
  BrainCircuit,
  CalendarClock,
  Dumbbell,
  LayoutDashboard,
  type LucideIcon,
  Moon,
  PersonStanding,
  Sun,
  Trash2,
  Trophy,
  Upload,
  UserRound,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { ImportButton } from "@/components/data-upload"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DateRangeKey } from "@/lib/analysis"
import { formatDate } from "@/lib/dates"
import { describeImport } from "@/lib/db"
import { useStore } from "@/state/store"

export type PageId = "overview" | "exercises" | "muscles" | "patterns" | "records" | "predictions" | "profile"

interface NavItem {
  id: PageId
  label: string
  icon: LucideIcon
}

const ANALYTICS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "exercises", label: "Exercises", icon: Dumbbell },
  { id: "muscles", label: "Muscle groups", icon: PersonStanding },
  { id: "patterns", label: "Workout patterns", icon: CalendarClock },
  { id: "records", label: "Records", icon: Trophy },
]

const MODELLING: NavItem[] = [
  { id: "predictions", label: "Predictions", icon: BrainCircuit },
  { id: "profile", label: "Body & health", icon: UserRound },
]

export const PAGE_TITLES: Record<PageId, string> = Object.fromEntries(
  [...ANALYTICS, ...MODELLING].map((i) => [i.id, i.label]),
) as Record<PageId, string>

function readHash(): PageId {
  const id = window.location.hash.slice(1) as PageId
  return id in PAGE_TITLES ? id : "overview"
}

export function usePage(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(readHash)
  useEffect(() => {
    const onHash = () => setPage(readHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return [page, (p) => (window.location.hash = p)]
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem("gymviz.theme")
      if (stored) return stored === "dark"
    } catch {
      // ignore
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.dataset.theme = dark ? "dark" : "light"
  }, [dark])
  const toggle = () => {
    setDark((d) => {
      try {
        localStorage.setItem("gymviz.theme", d ? "light" : "dark")
      } catch {
        // ignore
      }
      return !d
    })
  }
  return { dark, toggle }
}

function NavGroup({ label, items, page, onNavigate }: { label: string; items: NavItem[]; page: PageId; onNavigate: (p: PageId) => void }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton isActive={page === item.id} onClick={() => onNavigate(item.id)} tooltip={item.label}>
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

const RANGES: { value: DateRangeKey; label: string }[] = [
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
]

export function AppShell({ page, onNavigate, children }: { page: PageId; onNavigate: (p: PageId) => void; children: ReactNode }) {
  const { data, error, lastImport, range, setRange, clearData } = useStore()
  const theme = useTheme()
  const rangeMatters = page !== "predictions" && page !== "profile"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="size-4" />
            </div>
            <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
              <span className="font-semibold">GymViz</span>
              <span className="text-xs text-muted-foreground">Progress & predictions</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup items={ANALYTICS} label="Analytics" onNavigate={onNavigate} page={page} />
          <NavGroup items={MODELLING} label="Modelling" onNavigate={onNavigate} page={page} />
        </SidebarContent>
        <SidebarFooter>
          {data ? (
            <div className="grid gap-2 px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {lastImport ? (
                <div className="truncate" title={`${lastImport.fileName} · ${formatDate(new Date(lastImport.importedAt))}`}>
                  Last import: {describeImport(lastImport.summary)}
                </div>
              ) : null}
              {error ? <div className="text-destructive">{error}</div> : null}
              <div>
                {formatDate(data.allRows[0].date)} – {formatDate(data.allRows.at(-1)!.date)}
              </div>
              <ImportButton size="sm" variant="outline">
                <Upload /> Import new export
              </ImportButton>
              <Button
                onClick={() => {
                  if (window.confirm("Delete every stored workout from this browser? Your profile is kept.")) void clearData()
                }}
                size="sm"
                variant="ghost"
              >
                <Trash2 /> Clear workouts
              </Button>
            </div>
          ) : null}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator className="mr-1 data-[orientation=vertical]:h-4" orientation="vertical" />
          <h1 className="truncate text-sm font-medium">{PAGE_TITLES[page]}</h1>
          <div className="ml-auto flex items-center gap-2">
            {data && rangeMatters ? (
              <ToggleGroup
                aria-label="Date range"
                onValueChange={(v) => v && setRange(v as DateRangeKey)}
                size="sm"
                type="single"
                value={range}
                variant="outline"
              >
                {RANGES.map((r) => (
                  <ToggleGroupItem aria-label={`Show ${r.label}`} key={r.value} value={r.value}>
                    {r.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
            <Button aria-label="Toggle theme" onClick={theme.toggle} size="icon" variant="ghost">
              {theme.dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl min-w-0 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
