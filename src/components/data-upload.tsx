import { FileUp, Lock, Sparkles } from "lucide-react"
import { useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useStore } from "@/state/store"

export function DataUpload() {
  const { loadCsv, error } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const readFile = async (file: File) => loadCsv(await file.text(), file.name)

  const loadSample = async () => {
    setLoadingSample(true)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-strong.csv`)
      loadCsv(await res.text(), "sample-strong.csv")
    } finally {
      setLoadingSample(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6 py-8">
      <div className="grid gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Load your Strong export</h2>
        <p className="text-muted-foreground">
          In the Strong app: Settings → Export Strong Data. Drop the CSV here to see your progress and predictions.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load that file</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card
        className={cn("border-2 border-dashed transition-colors", dragging && "border-primary bg-muted/50")}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
      >
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
            <FileUp className="size-5" />
          </div>
          <CardTitle>Drop your CSV here</CardTitle>
          <CardDescription>Semicolon or comma separated, kg or lbs</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()}>
            <FileUp /> Choose file
          </Button>
          <Button disabled={loadingSample} onClick={loadSample} variant="outline">
            <Sparkles /> Try the sample data
          </Button>
          <input
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ""
            }}
            ref={input}
            type="file"
          />
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" /> Everything runs in your browser. Your data never leaves this device.
      </p>
    </div>
  )
}
