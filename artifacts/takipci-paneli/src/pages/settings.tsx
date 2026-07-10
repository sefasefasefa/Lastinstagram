import { useEffect, useState, type FormEvent } from "react"
import { Link } from "wouter"
import { useGetRequestConfig, useUpdateRequestConfig, useTestRequestConfig, getGetRequestConfigQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Card, Input, Label } from "../components/ui/core"
import { ArrowLeft, Plus, Trash2, Send } from "lucide-react"
import { toast } from "sonner"

type KeyValuePair = { key: string; value: string }

function recordToPairs(record: Record<string, string> | undefined): KeyValuePair[] {
  const pairs = Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
  return pairs.length > 0 ? pairs : [{ key: "", value: "" }]
}

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const { key, value } of pairs) {
    if (key.trim()) record[key.trim()] = value
  }
  return record
}

function KeyValueEditor({
  title,
  pairs,
  onChange,
}: {
  title: string
  pairs: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
}) {
  const updatePair = (index: number, field: "key" | "value", value: string) => {
    const next = pairs.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair))
    onChange(next)
  }

  const removePair = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index))
  }

  const addPair = () => {
    onChange([...pairs, { key: "", value: "" }])
  }

  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <div className="space-y-2">
        {pairs.map((pair, index) => (
          <div key={index} className="flex gap-2">
            <Input
              placeholder="ad"
              value={pair.key}
              onChange={(e) => updatePair(index, "key", e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="değer"
              value={pair.value}
              onChange={(e) => updatePair(index, "value", e.target.value)}
              className="flex-1"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removePair(index)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addPair}>
        <Plus className="w-4 h-4 mr-2" /> Satır Ekle
      </Button>
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: config, isPending } = useGetRequestConfig()
  const updateConfig = useUpdateRequestConfig()
  const testConfig = useTestRequestConfig()

  const [targetUrl, setTargetUrl] = useState("")
  const [headerPairs, setHeaderPairs] = useState<KeyValuePair[]>([{ key: "", value: "" }])
  const [cookiePairs, setCookiePairs] = useState<KeyValuePair[]>([{ key: "", value: "" }])
  const [testResult, setTestResult] = useState<{ status: number; statusText: string; bodyPreview: string } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    if (!config) return
    setTargetUrl(config.targetUrl ?? "")
    setHeaderPairs(recordToPairs(config.headers))
    setCookiePairs(recordToPairs(config.cookies))
  }, [config])

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    updateConfig.mutate(
      {
        data: {
          targetUrl: targetUrl.trim() || null,
          headers: pairsToRecord(headerPairs),
          cookies: pairsToRecord(cookiePairs),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRequestConfigQueryKey() })
          toast.success("Ayarlar kaydedildi")
        },
        onError: () => {
          toast.error("Ayarlar kaydedilemedi")
        },
      },
    )
  }

  const handleTest = () => {
    setTestResult(null)
    setTestError(null)
    testConfig.mutate(undefined, {
      onSuccess: (result) => {
        setTestResult(result)
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "İstek başarısız oldu"
        setTestError(message)
      },
    })
  }

  if (isPending) return null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-semibold tracking-tight">İstek Ayarları</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-6">
            Dışarıya (örneğin bir Instagram uç noktasına) istek gönderirken kullanılacak hedef URL,
            header ve cookie değerlerini burada tanımla. Kaydettikten sonra "Test Et" ile gerçek bir
            istek gönderip cevabı görebilirsin.
          </p>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="targetUrl">Hedef URL</Label>
              <Input
                id="targetUrl"
                placeholder="https://..."
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </div>

            <KeyValueEditor title="Header'lar" pairs={headerPairs} onChange={setHeaderPairs} />
            <KeyValueEditor title="Cookie'ler" pairs={cookiePairs} onChange={setCookiePairs} />

            <div className="flex gap-3">
              <Button type="submit" disabled={updateConfig.isPending}>
                {updateConfig.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testConfig.isPending || !targetUrl.trim()}
              >
                <Send className="w-4 h-4 mr-2" />
                {testConfig.isPending ? "Gönderiliyor..." : "Test Et"}
              </Button>
            </div>
          </form>
        </Card>

        {(testResult || testError) && (
          <Card className="p-6">
            <h3 className="font-medium mb-3">Test Sonucu</h3>
            {testError && <p className="text-sm text-destructive">{testError}</p>}
            {testResult && (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Durum: </span>
                  <span className="font-mono">{testResult.status} {testResult.statusText}</span>
                </p>
                <div>
                  <p className="text-muted-foreground mb-1">Cevap önizlemesi:</p>
                  <pre className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs whitespace-pre-wrap max-h-64">
                    {testResult.bodyPreview}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  )
}
