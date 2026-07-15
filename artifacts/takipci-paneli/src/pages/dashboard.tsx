import { useState } from "react"
import { useGetMonitoringStatus, useUpdateMonitoringStatus, useGetDashboardSummary, getGetMonitoringStatusQueryKey, useGetMe, useLogout } from "@workspace/api-client-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import { Button, Card, Input } from "../components/ui/core"
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/radix"
import { Activity, Users, Heart, Image as ImageIcon, LogOut, Radio, Settings, Video, ChevronDown, ChevronUp, Search, RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { TrackedUserList } from "../components/tracked-user-list"
import { useAdminMode } from "../hooks/use-admin-mode"

interface MyProfile {
  username: string
  pk: string
  fullName: string
  profilePicUrl?: string
  followerCount?: number
  followingCount?: number
  mediaCount?: number
  biography?: string
  isPrivate?: boolean
}

interface FollowUser {
  pk: string
  username: string
  fullName: string
  profilePicUrl?: string
  isPrivate?: boolean
  isVerified?: boolean
}

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const { data: me } = useGetMe()
  const logout = useLogout()

  const { data: monitoring } = useGetMonitoringStatus()
  const updateMonitoring = useUpdateMonitoringStatus()

  const { data: summary } = useGetDashboardSummary()

  const { data: myProfileData, isLoading: myProfileLoading } = useQuery<{ success: boolean; profile?: MyProfile }>({
    queryKey: ["instagram-me"],
    queryFn: () => fetch("/api/instagram/me").then(r => r.json()),
    enabled: !!me?.username,
    retry: false,
  })
  const myProfile = myProfileData?.profile

  const [showFollowers, setShowFollowers] = useState(false)
  const [followerSearch, setFollowerSearch] = useState("")
  const [followerLimit, setFollowerLimit] = useState(200)

  const { data: followersData, isFetching: followersFetching, refetch: refetchFollowers } = useQuery<{
    success: boolean
    users?: FollowUser[]
    count?: number
  }>({
    queryKey: ["instagram-followers", followerLimit],
    queryFn: () => fetch(`/api/instagram/followers?limit=${followerLimit}`).then(r => r.json()),
    enabled: showFollowers && !!me?.username,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 dakika cache
  })

  const followers = followersData?.users ?? []
  const filteredFollowers = followerSearch.trim()
    ? followers.filter(u =>
        u.username.toLowerCase().includes(followerSearch.toLowerCase()) ||
        u.fullName.toLowerCase().includes(followerSearch.toLowerCase())
      )
    : followers

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
        toast.success(enabled ? "İzleme Aktif" : "İzleme Durduruldu")
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
            title="Takipçilerim"
            value={myProfile?.followerCount}
            icon={<Users className="w-5 h-5 text-blue-400" />}
            trend={myProfile?.followingCount !== undefined ? `${myProfile.followingCount} takip edilen` : myProfileLoading ? "Yükleniyor..." : "Instagram bağlı değil"}
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

        {/* Kendi Instagram Hesabım */}
        {myProfile && (
          <section className="space-y-4">
            <Card className="overflow-hidden">
              {/* Profil Başlığı */}
              <div className="flex items-center gap-4 p-5 border-b border-border/50">
                {myProfile.profilePicUrl ? (
                  <img
                    src={myProfile.profilePicUrl}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover border-2 border-primary/30 flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold">{myProfile.fullName || myProfile.username}</h2>
                    {myProfile.isPrivate && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Gizli</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">@{myProfile.username}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span>
                      <strong className="text-foreground font-semibold">{myProfile.followerCount?.toLocaleString("tr-TR") ?? "—"}</strong>
                      <span className="text-muted-foreground ml-1">takipçi</span>
                    </span>
                    <span>
                      <strong className="text-foreground font-semibold">{myProfile.followingCount?.toLocaleString("tr-TR") ?? "—"}</strong>
                      <span className="text-muted-foreground ml-1">takip</span>
                    </span>
                    <span>
                      <strong className="text-foreground font-semibold">{myProfile.mediaCount?.toLocaleString("tr-TR") ?? "—"}</strong>
                      <span className="text-muted-foreground ml-1">gönderi</span>
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => setShowFollowers(v => !v)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Takipçi Listesi
                  {showFollowers ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                </Button>
              </div>

              {/* Takipçi Listesi Paneli */}
              {showFollowers && (
                <div className="p-5 space-y-4">
                  {/* Araç çubuğu */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm">
                        Takipçi Listesi
                        {followersData?.count !== undefined && (
                          <span className="ml-2 text-muted-foreground font-normal">
                            ({followersData.count.toLocaleString("tr-TR")} kişi)
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={followerSearch}
                          onChange={e => setFollowerSearch(e.target.value)}
                          placeholder="Kullanıcı ara..."
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                      <select
                        value={followerLimit}
                        onChange={e => setFollowerLimit(Number(e.target.value))}
                        className="h-8 px-2 text-sm rounded-md border border-input bg-background text-foreground"
                      >
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => refetchFollowers()}
                        disabled={followersFetching}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${followersFetching ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* Liste */}
                  {followersFetching && followers.length === 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
                      ))}
                    </div>
                  ) : filteredFollowers.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {followerSearch ? "Aramayla eşleşen takipçi bulunamadı." : "Takipçi bulunamadı."}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {filteredFollowers.map(user => (
                          <FollowerCard key={user.pk} user={user} />
                        ))}
                      </div>
                      {followers.length >= followerLimit && !followerSearch && (
                        <p className="text-xs text-center text-muted-foreground pt-2">
                          İlk {followerLimit} takipçi gösteriliyor. Daha fazlası için limit artırın.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          </section>
        )}

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

function FollowerCard({ user }: { user: FollowUser }) {
  return (
    <a
      href={`https://instagram.com/${user.username}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/30 transition-colors group"
    >
      {user.profilePicUrl ? (
        <img
          src={user.profilePicUrl}
          alt=""
          className="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Users className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate leading-tight group-hover:text-primary transition-colors">
          @{user.username}
          {user.isVerified && <span className="ml-1 text-blue-400">✓</span>}
        </p>
        {user.fullName && (
          <p className="text-xs text-muted-foreground truncate">{user.fullName}</p>
        )}
      </div>
      {user.isPrivate && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
          Gizli
        </span>
      )}
    </a>
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
          {value !== undefined ? value.toLocaleString("tr-TR") : "--"}
        </h3>
        <p className="text-xs text-muted-foreground mt-2 border-l-2 border-primary/50 pl-2">{trend}</p>
      </div>
    </Card>
  )
}
