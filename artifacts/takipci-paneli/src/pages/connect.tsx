import { useConnectAccount, getGetConnectionQueryKey } from "@workspace/api-client-react"
import { Button, Card } from "../components/ui/core"
import { SiInstagram } from "react-icons/si"
import { Activity, ArrowRight, ShieldCheck } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useState } from "react"

export default function ConnectPage() {
  const queryClient = useQueryClient()
  const connect = useConnectAccount()
  const [username] = useState("mission_control")

  const handleConnect = () => {
    connect.mutate({ data: { username } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetConnectionQueryKey() })
        toast.success(`Connected as @${username}`)
      },
      onError: () => {
        toast.error("Failed to connect")
      }
    })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-card border border-border rounded-2xl flex items-center justify-center mb-6 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent" />
            <Activity className="w-8 h-8 text-primary relative z-10" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">Watchlist Control</h1>
          <p className="text-muted-foreground text-sm max-w-[280px] mx-auto leading-relaxed">
            Beğendiğin kişileri ve takipçilerini sakin bir kontrol panelinden takip et.
          </p>
        </div>

        <Card className="p-8 backdrop-blur-sm bg-card/80 border-border shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                <span className="leading-snug">Read-only monitoring. No credentials stored. No automated actions.</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                size="lg"
                className="w-full text-base font-medium h-12 gap-3 group relative overflow-hidden"
                onClick={handleConnect}
                disabled={connect.isPending}
                data-testid="button-connect"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/0 via-black/10 to-black/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {connect.isPending ? (
                  <Activity className="w-5 h-5 animate-pulse" />
                ) : (
                  <>
                    <SiInstagram className="w-5 h-5" />
                    <span>Instagram ile Bağlan</span>
                    <ArrowRight className="w-4 h-4 ml-auto opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
