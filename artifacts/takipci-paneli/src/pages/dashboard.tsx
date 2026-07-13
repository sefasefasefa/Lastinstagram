import { useGetMonitoringStatus, useUpdateMonitoringStatus, useGetDashboardSummary, getGetMonitoringStatusQueryKey, useGetMe, useLogout } from "@workspace/api-client-react"
import { Link } from "wouter"
import { Button, Card } from "../components/ui/core"
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/radix"
import { Activity, Users, Heart, Image as ImageIcon, LogOut, Radio, Settings, Video } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { TrackedUserList } from "../components/tracked-user-list"
import { useAdminMode } from "../hooks/use-admin-mode"

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const { data: me } = useGetMe()
  const logout = useLogout()

  const { data: monitoring } = useGetMonitoringStatus()
  const updateMonitoring = useUpdateMonitoringStatus()

  const { data: summary } = useGetDashboardSummary()

  const handleSignOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries()
      },
    })
  }

  const toggleMonitoring = (enabled: boolean) => {
    updateMonitoring.mutate({ data: { enabled } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMonitoringStatusQueryKey() })
        toast.success(enabled ? "Monitoring Activated" : "Monitoring Paused")
      }
    })
  }

  const isAdmin = useAdminMode()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">Mission Control</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-foreground">
                {me?.username ?? "hesabım"}
              </span>
            </div>
            {isAdmin && (
              <Link href="/request-settings">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4 mr-2" />
                  İstek Ayarları
                </Button>
              </Link>
            )}
            {import.meta.env.VITE_ADMIN_ENABLED === 'true' ? (
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4 mr-2" />
                  Ayarlar
                </Button>
              </Link>
            ) : null}
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">

        {/* Hero Section */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Watchlist Overview</h1>
            <p className="text-muted-foreground">Hesapları ve gönderileri beğendiğin kişileri takip et.</p>
          </div>

          <Card className="flex items-center gap-4 p-4 min-w-[280px] justify-between bg-card/50 border-primary/20 shadow-[0_0_30px_rgba(217,119,87,0.05)]">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-md ${monitoring?.enabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Radio className={`w-5 h-5 ${monitoring?.enabled ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-medium">System Status</p>
                <p className="text-xs text-muted-foreground">{monitoring?.enabled ? 'Actively Monitoring' : 'Paused'}</p>
              </div>
            </div>
            <Switch
              checked={monitoring?.enabled ?? false}
              onCheckedChange={toggleMonitoring}
              disabled={updateMonitoring.isPending}
            />
          </Card>
        </section>

        {/* Stats Row */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Takipçiler"
            value={summary?.followerCount}
            icon={<Users className="w-5 h-5 text-blue-400" />}
            trend="+12 bu hafta"
          />
          <StatCard
            title="Beğendiğim Gönderiler"
            value={summary?.likedPostCount}
            icon={<Heart className="w-5 h-5 text-primary" />}
            trend="Bugün aktif"
          />
          <StatCard
            title="Beğendiğim Hikayeler"
            value={summary?.likedStoryCount}
            icon={<ImageIcon className="w-5 h-5 text-purple-400" />}
            trend="Yüksek etkileşim"
          />
          <StatCard
            title="Beğendiğim Reels"
            value={summary?.likedReelCount}
            icon={<Video className="w-5 h-5 text-rose-400" />}
            trend="Video içerikler"
          />
        </section>

        {/* Tabs & Lists */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-medium tracking-tight">Takip Edilenler</h2>
          </div>

          <Tabs defaultValue="follower" className="w-full">
            <TabsList className="mb-6 w-full sm:w-auto grid grid-cols-2 sm:grid-cols-4 sm:flex">
              <TabsTrigger value="follower" className="flex items-center gap-2">
                <Users className="w-4 h-4 hidden sm:block" /> Takipçiler
              </TabsTrigger>
              <TabsTrigger value="liked_post" className="flex items-center gap-2">
                <Heart className="w-4 h-4 hidden sm:block" /> Gönderiler
              </TabsTrigger>
              <TabsTrigger value="liked_story" className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 hidden sm:block" /> Hikayeler
              </TabsTrigger>
              <TabsTrigger value="liked_reel" className="flex items-center gap-2">
                <Video className="w-4 h-4 hidden sm:block" /> Reels
              </TabsTrigger>
            </TabsList>

            <TabsContent value="follower" className="min-h-[300px]">
              <TrackedUserList category="follower" />
            </TabsContent>
            <TabsContent value="liked_post" className="min-h-[300px]">
              <TrackedUserList category="liked_post" />
            </TabsContent>
            <TabsContent value="liked_story" className="min-h-[300px]">
              <TrackedUserList category="liked_story" />
            </TabsContent>
            <TabsContent value="liked_reel" className="min-h-[300px]">
              <TrackedUserList category="liked_reel" />
            </TabsContent>
          </Tabs>
        </section>

      </main>
    </div>
  )
}

function StatCard({ title, value, icon, trend }: { title: string, value?: number, icon: React.ReactNode, trend: string }) {
  return (
    <Card className="p-6 flex flex-col justify-between overflow-hidden relative group">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full translate-x-8 -translate-y-8 group-hover:translate-x-4 group-hover:-translate-y-4 transition-transform duration-500" />
      <div className="flex items-start justify-between mb-4 relative z-10">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="p-2 bg-muted/50 rounded-lg">{icon}</div>
      </div>
      <div className="relative z-10">
        <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground">
          {value !== undefined ? value : "--"}
        </h3>
        <p className="text-xs text-muted-foreground mt-2 border-l-2 border-primary/50 pl-2">{trend}</p>
      </div>
    </Card>
  )
}
