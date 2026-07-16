import { useState, useEffect, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useLogin,
  useVerifyTwoFactor,
  useGetCheckpointOptions,
  useSelectCheckpointMethod,
  useVerifyCheckpoint,
  type VerifyTwoFactorRequestMethod,
  type CheckpointChoice,
} from "@workspace/api-client-react"
import { Button, Card, Input, Label } from "../components/ui/core"
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert"
import { ShieldAlert } from "lucide-react"

type TwoFactorMethod = VerifyTwoFactorRequestMethod

const TWO_FACTOR_METHODS: { value: TwoFactorMethod; label: string }[] = [
  { value: "totp", label: "Authenticator uygulaması (TOTP)" },
  { value: "sms", label: "SMS ile kod" },
  { value: "backup_codes", label: "Yedek kod" },
]

// Instagram gradient logo (inline SVG, no external deps)
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ig-grad-1" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497"/>
          <stop offset="5%" stopColor="#fdf497"/>
          <stop offset="45%" stopColor="#fd5949"/>
          <stop offset="60%" stopColor="#d6249f"/>
          <stop offset="90%" stopColor="#285AEB"/>
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ig-grad-1)"/>
      <rect x="9" y="9" width="14" height="14" rx="4.5" stroke="white" strokeWidth="2" fill="none"/>
      <circle cx="16" cy="16" r="3.5" stroke="white" strokeWidth="2"/>
      <circle cx="23" cy="9" r="1.2" fill="white"/>
    </svg>
  )
}

export default function LoginPage() {
  const queryClient = useQueryClient()
  const login = useLogin()
  const verifyTwoFactor = useVerifyTwoFactor()
  const selectCheckpointMethod = useSelectCheckpointMethod()
  const verifyCheckpoint = useVerifyCheckpoint()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isCaptcha, setIsCaptcha] = useState(false)
  const [captchaType, setCaptchaType] = useState<string | null>(null)

  // İki adımlı doğrulama gerektiğinde /auth/login yerine bu adıma geçilir.
  const [twoFactorRequired, setTwoFactorRequired] = useState(false)
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>("totp")
  const [verificationCode, setVerificationCode] = useState("")

  // Instagram checkpoint (güvenlik doğrulaması) çözümleme akışı — /auth/login
  // checkpointRequired: true döndürdüğünde başlar. Instagram'ın adımı önce
  // bir yöntem seçimi ("select_verify_method") isteyebilir, ya da doğrudan
  // kod girişi ("verify_code") isteyebilir; bu yüzden akış tek bir kod ekranı
  // yerine yöntem seçimini opsiyonel bir ilk adım olarak ele alır.
  const [checkpointRequired, setCheckpointRequired] = useState(false)
  const [checkpointStep, setCheckpointStep] = useState<"loading" | "select-method" | "verify-code" | null>(null)
  const [checkpointChoices, setCheckpointChoices] = useState<CheckpointChoice[]>([])
  const [checkpointChoice, setCheckpointChoice] = useState("")
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null)
  const [checkpointCode, setCheckpointCode] = useState("")
  const [checkpointVerifyUrl, setCheckpointVerifyUrl] = useState<string | null>(null)

  const checkpointOptions = useGetCheckpointOptions({
    query: { enabled: checkpointRequired && checkpointStep === "loading" },
  })

  useEffect(() => {
    if (!checkpointOptions.data) return
    const { stepName, choices, message } = checkpointOptions.data
    setCheckpointMessage(message ?? null)
    if (stepName === "select_verify_method" && choices && choices.length > 0) {
      setCheckpointChoices(choices)
      setCheckpointChoice(choices[0]?.value ?? "")
      setCheckpointStep("select-method")
    } else {
      // Zaten "verify_code" adımındaysa (veya tek yöntem otomatik seçildiyse)
      // doğrudan kod girişine geç.
      setCheckpointStep("verify-code")
    }
  }, [checkpointOptions.data])

  useEffect(() => {
    if (checkpointOptions.isError) {
      const msg =
        (checkpointOptions.error as { data?: { error?: string } })?.data?.error
        ?? "Checkpoint adımı sorgulanamadı."
      setError(msg)
      setCheckpointRequired(false)
      setCheckpointStep(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpointOptions.isError])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsCaptcha(false)
    setCaptchaType(null)
    login.mutate(
      { data: { username, password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries()
        },
        onError: (err: unknown) => {
          // The generated API client (@workspace/api-client-react) throws an
          // ApiError whose parsed JSON body lives directly on `.data` — NOT
          // nested under `.response.data` (that's an axios convention this
          // client doesn't follow; `.response` here is the raw Fetch
          // Response object). Reading `.response.data` silently returns
          // undefined, which is why isCaptcha/captchaType never surfaced.
          const data = (err as { data?: {
            error?: string
            twoFactorRequired?: boolean
            isCaptcha?: boolean
            captchaType?: string | null
            checkpointRequired?: boolean
            checkpointVerifyUrl?: string
          } })?.data

          if (data?.twoFactorRequired) {
            setTwoFactorRequired(true)
            setError(null)
            return
          }

          if (data?.checkpointRequired) {
            setCheckpointRequired(true)
            setCheckpointStep("loading")
            if (data.checkpointVerifyUrl) setCheckpointVerifyUrl(data.checkpointVerifyUrl)
            setError(null)
            return
          }

          // Captcha/checkpoint/rate-limit/spam-block failures are not a wrong
          // password — show the challenge-specific message instead of the
          // generic "check your username or password" text.
          setIsCaptcha(Boolean(data?.isCaptcha))
          setCaptchaType(data?.captchaType ?? null)
          setError(data?.error ?? "Giriş başarısız. Kullanıcı adı veya şifrenizi kontrol edin.")
        },
      },
    )
  }

  const handleVerify = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    verifyTwoFactor.mutate(
      { data: { verificationCode, method: twoFactorMethod } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries()
        },
        onError: (err: unknown) => {
          const msg =
            (err as { data?: { error?: string } })?.data?.error
            ?? "Doğrulama kodu kabul edilmedi. Lütfen tekrar deneyin."
          setError(msg)
        },
      },
    )
  }

  const handleSelectCheckpointMethod = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    selectCheckpointMethod.mutate(
      { data: { choice: checkpointChoice } },
      {
        onSuccess: (data) => {
          // stepName:"login_completed" → Instagram challenge'ı bypass etti,
          // sunucu tarafında oturum kuruldu. /auth/me sorgusunu yenile.
          if (data?.stepName === "login_completed") {
            queryClient.invalidateQueries()
          } else {
            setCheckpointStep("verify-code")
          }
        },
        onError: (err: unknown) => {
          const msg =
            (err as { data?: { error?: string } })?.data?.error
            ?? "Doğrulama yöntemi seçilemedi. Lütfen tekrar deneyin."
          setError(msg)
        },
      },
    )
  }

  const handleVerifyCheckpoint = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    verifyCheckpoint.mutate(
      { data: { verificationCode: checkpointCode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries()
        },
        onError: (err: unknown) => {
          const msg =
            (err as { data?: { error?: string } })?.data?.error
            ?? "Doğrulama kodu kabul edilmedi. Lütfen tekrar deneyin."
          setError(msg)
        },
      },
    )
  }

  const resetCheckpoint = () => {
    setCheckpointRequired(false)
    setCheckpointStep(null)
    setCheckpointChoices([])
    setCheckpointChoice("")
    setCheckpointMessage(null)
    setCheckpointCode("")
    setError(null)
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-[400px] max-w-full p-8">

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-7">
          <InstagramIcon className="w-14 h-14 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {checkpointRequired
              ? "Güvenlik Doğrulaması"
              : twoFactorRequired ? "İki Adımlı Doğrulama" : "Instagram ile Giriş Yap"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {checkpointRequired
              ? (checkpointStep === "select-method"
                  ? "Instagram'ın kodu göndereceği yöntemi seçin"
                  : "Instagram'ın gönderdiği doğrulama kodunu girin")
              : twoFactorRequired
                ? "Instagram hesabınız için gönderilen doğrulama kodunu girin"
                : "Instagram kullanıcı adı ve şifrenizi girin"}
          </p>
        </div>

        {checkpointRequired ? (
          <div className="space-y-4">
            {/* Instagram'ın tarayıcı doğrulaması gerektiğinde manuel açılabilecek link */}
            {checkpointVerifyUrl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Kod gelmiyor mu?</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Instagram sunucu ortamından gönderilen kod isteklerini engelliyor olabilir.
                  Aşağıdaki butona tıklayıp doğrulamayı <strong>kendi tarayıcında</strong> tamamla,
                  ardından buraya geri dön ve kodu gir.
                </p>
                <a
                  href={checkpointVerifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:text-amber-600"
                >
                  ↗ Instagram Doğrulama Sayfasını Aç
                </a>
              </div>
            )}

            {checkpointStep === "loading" && (
              <p className="text-sm text-muted-foreground text-center py-4">Doğrulama adımı sorgulanıyor...</p>
            )}

            {checkpointStep === "select-method" && (
              <form onSubmit={handleSelectCheckpointMethod} className="space-y-4">
                {checkpointMessage && (
                  <p className="text-sm text-muted-foreground">{checkpointMessage}</p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="checkpoint-method">Doğrulama Yöntemi</Label>
                  <select
                    id="checkpoint-method"
                    value={checkpointChoice}
                    onChange={(e) => setCheckpointChoice(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {checkpointChoices.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <p className="text-sm text-destructive leading-snug">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
                  disabled={selectCheckpointMethod.isPending}
                >
                  {selectCheckpointMethod.isPending ? "Gönderiliyor..." : "Kodu Gönder"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={resetCheckpoint}>
                  Geri dön
                </Button>
              </form>
            )}

            {checkpointStep === "verify-code" && (
              <form onSubmit={handleVerifyCheckpoint} className="space-y-4">
                {checkpointMessage && (
                  <p className="text-sm text-muted-foreground">{checkpointMessage}</p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="checkpoint-code">Doğrulama Kodu</Label>
                  <Input
                    id="checkpoint-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={8}
                    value={checkpointCode}
                    onChange={(e) => setCheckpointCode(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <p className="text-sm text-destructive leading-snug">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
                  disabled={verifyCheckpoint.isPending}
                >
                  {verifyCheckpoint.isPending ? "Doğrulanıyor..." : "Doğrula"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={resetCheckpoint}>
                  Geri dön
                </Button>
              </form>
            )}
          </div>
        ) : twoFactorRequired ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="two-factor-method">Doğrulama Yöntemi</Label>
              <select
                id="two-factor-method"
                value={twoFactorMethod}
                onChange={(e) => setTwoFactorMethod(e.target.value as TwoFactorMethod)}
                className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {TWO_FACTOR_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-code">Doğrulama Kodu</Label>
              <Input
                id="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={twoFactorMethod === "backup_codes" ? "12345678" : "123456"}
                maxLength={twoFactorMethod === "backup_codes" ? 8 : 6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive leading-snug">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
              disabled={verifyTwoFactor.isPending}
            >
              {verifyTwoFactor.isPending ? "Doğrulanıyor..." : "Doğrula"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setTwoFactorRequired(false)
                setVerificationCode("")
                setError(null)
              }}
            >
              Geri dön
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Instagram Kullanıcı Adı</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="kullaniciadi"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && isCaptcha && (
              <Alert variant="destructive" className="border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-500">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Güvenlik Doğrulaması Gerekiyor</AlertTitle>
                <AlertDescription>
                  {error}
                  {captchaType && (
                    <span className="block mt-1 text-xs opacity-80">Tespit türü: {captchaType}</span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {error && !isCaptcha && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-sm text-destructive leading-snug">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#d6249f] via-[#fd5949] to-[#fdf497] text-white hover:opacity-90 transition-opacity"
              disabled={login.isPending}
            >
              {login.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground leading-relaxed">
          Giriş bilgileriniz yalnızca bu cihazda kullanılır
          ve Instagram API'sine doğrudan iletilir.
        </p>
      </Card>
    </div>
  )
}
