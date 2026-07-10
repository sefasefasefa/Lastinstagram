import { useState, type FormEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLogin } from "@workspace/api-client-react"
import { Button, Card, Input, Label } from "../components/ui/core"
import { Activity } from "lucide-react"

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
        onError: () => {
          setError("Kullanıcı adı veya şifre hatalı.")
        },
      },
    )
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-[400px] max-w-full p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 mb-4">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Tekrar hoş geldin</h1>
          <p className="text-sm text-muted-foreground mt-1">Hesabına giriş yap</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı adı</Label>
            <Input
              id="username"
              autoComplete="username"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
