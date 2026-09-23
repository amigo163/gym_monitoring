import { type ComponentType, Suspense, lazy } from "react"
import { AppShell, type PageId, usePage } from "@/components/app-shell"
import { DataUpload } from "@/components/data-upload"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { StoreProvider, useStore } from "@/state/store"

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const PAGES: Record<PageId, ComponentType> = {
  overview: page(() => import("@/pages/overview"), "OverviewPage"),
  exercises: page(() => import("@/pages/exercises"), "ExercisesPage"),
  muscles: page(() => import("@/pages/muscles"), "MusclesPage"),
  patterns: page(() => import("@/pages/patterns"), "PatternsPage"),
  records: page(() => import("@/pages/records"), "RecordsPage"),
  predictions: page(() => import("@/pages/predictions"), "PredictionsPage"),
  profile: page(() => import("@/pages/profile"), "ProfilePage"),
}

function PageFallback() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton className="h-24" key={i} />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

function Content({ page: id }: { page: PageId }) {
  const { ready, data } = useStore()
  if (!ready) return <PageFallback />
  // The profile doesn't need workout data; everything else does.
  if (id !== "profile" && !data) return <DataUpload />
  const Page = PAGES[id]
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  )
}

export default function App() {
  const [current, navigate] = usePage()
  return (
    <StoreProvider>
      <TooltipProvider>
        <AppShell onNavigate={navigate} page={current}>
          <Content page={current} />
        </AppShell>
      </TooltipProvider>
    </StoreProvider>
  )
}
