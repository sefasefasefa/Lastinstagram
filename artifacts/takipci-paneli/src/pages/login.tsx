import { useState, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLogin } from "@workspace/api-client-react"
import { Button, Card, Input, Label } from "../components/ui/core"

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
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    login.mutate(
      { data: { username, password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries()
        },
        onError: (err: unknown) => {
          const msg =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Giriş başarısız. Kullanıcı adı veya şifrenizi kontrol edin."
          setError(msg)
        },
      },
    )
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-[400px] max-w-full p-8">

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-7">
          <InstagramIcon className="w-14 h-14 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Instagram ile Giriş Yap</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Instagram kullanıcı adı ve şifrenizi girin
          </p>
        </div>

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

          {error && (
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

        <p className="mt-5 text-center text-xs text-muted-foreground leading-relaxed">
          Giriş bilgileriniz yalnızca bu cihazda kullanılır
          ve Instagram API'sine doğrudan iletilir.
        </p>
      </Card>
    </div>
  )
}
