import { useEffect, useState, type FormEvent } from "react"
import { Link } from "wouter"
import {
  useGetRequestConfig,
  useUpdateRequestConfig,
  useTestRequestConfig,
  useGetRequestRunHistory,
  getGetRequestConfigQueryKey,
  getGetRequestRunHistoryQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Card, Input, Label, cn } from "../components/ui/core"
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert"
import { ArrowLeft, Plus, Trash2, Send, Clock, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

const REMINDER_THRESHOLD_MINUTES = 15

function minutesSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000)
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes < 1) return "az önce"
  if (minutes < 60) return `${minutes} dakika önce`
  const hours = Math.floor(minutes / 60)
  return `${hours} saat önce`
}

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
  const { data: history } = useGetRequestRunHistory()
  const updateConfig = useUpdateRequestConfig()
  const testConfig = useTestRequestConfig()

  const [targetUrl, setTargetUrl] = useState("")
  const [headerPairs, setHeaderPairs] = useState<KeyValuePair[]>([{ key: "", value: "" }])
  const [cookiePairs, setCookiePairs] = useState<KeyValuePair[]>([{ key: "", value: "" }])
  const [testResult, setTestResult] = useState<{ status: number; statusText: string; bodyPreview: string } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

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
        queryClient.invalidateQueries({ queryKey: getGetRequestConfigQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetRequestRunHistoryQueryKey() })

        if (result.isCaptcha) {
          toast.warning(
            `Captcha / anti-bot koruması tespit edildi! (${result.captchaType ?? "genel"})`,
            { duration: 8000 },
          )
        }
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "İstek başarısız oldu"
        setTestError(message)
        queryClient.invalidateQueries({ queryKey: getGetRequestConfigQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetRequestRunHistoryQueryKey() })
      },
    })
  }

  const lastRunAt = config?.lastRunAt ? new Date(config.lastRunAt) : null
  const minutesSinceLastRun = lastRunAt ? minutesSince(lastRunAt) : null
  const showReminder =
    minutesSinceLastRun !== null && minutesSinceLastRun >= REMINDER_THRESHOLD_MINUTES
  void nowTick

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
        {showReminder && minutesSinceLastRun !== null && (
          <Card className="p-4 border-primary/40 bg-primary/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span>
                Son taramadan {formatRelativeMinutes(minutesSinceLastRun)} geçti. Tekrar çalıştırmak
                ister misin?
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleTest}
              disabled={testConfig.isPending || !targetUrl.trim()}
            >
              {testConfig.isPending ? "Gönderiliyor..." : "Tekrar Çalıştır"}
            </Button>
          </Card>
        )}

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-6">
            Dışarıya (örneğin bir Instagram uç noktasına) istek gönderirken kullanılacak hedef URL,
            header ve cookie değerlerini burada tanımla. Kaydettikten sonra "Test Et" ile gerçek bir
            istek gönderip cevabı görebilirsin. Bu istek her zaman senin tıklamanla gönderilir —
            arka planda otomatik çalışan hiçbir şey yok.
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
              <div className="space-y-4 text-sm">
                {testResult.isCaptcha && (
                  <Alert variant="destructive" className="border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Captcha / Anti-Bot Koruması Tespit Edildi</AlertTitle>
                    <AlertDescription>
                      Hedef site ({testResult.captchaType ?? "bilinmeyen"}) bir captcha veya bot
                      koruması gösteriyor. Cookie/header değerlerini güncelleyip tekrar deneyin.
                    </AlertDescription>
                  </Alert>
                )}
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

        <Card className="p-6">
          <h3 className="font-medium mb-3">Çalıştırma Geçmişi</h3>
          {(!history || history.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Henüz bir test isteği gönderilmedi.
            </p>
          )}
          {history && history.length > 0 && (
            <ul className="space-y-2 text-sm">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0"
                >
                  <span className="text-muted-foreground">
                    {new Date(entry.ranAt).toLocaleString("tr-TR")}
                  </span>
                  <span
                    className={cn(
                      "font-mono",
                      entry.success ? "text-foreground" : "text-destructive",
                    )}
                  >
                    {entry.success ? `${entry.status} ${entry.statusText}` : entry.errorMessage}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  )
}
