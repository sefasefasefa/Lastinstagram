import {
  useListTrackedUsers,
  useListTrackedUserMedia,
  useRecordTrackedUserVisit,
  useRefreshTrackedUserFollowers,
  getListTrackedUsersQueryKey,
  type TrackedUser,
  type LikedMedia,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/radix"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/radix"
import { Button } from "./ui/core"
import {
  Users, Heart, Image as ImageIcon, Video,
  ExternalLink, Clock, Activity, Zap, Calendar,
  CheckCircle2, XCircle, Play, RefreshCw, TrendingUp, TrendingDown, Minus,
} from "lucide-react"
import { toast } from "sonner"

type Category = TrackedUser["category"]

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  follower:    { label: "Takipçi",           icon: <Users className="w-3.5 h-3.5" />,     color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/20" },
  liked_post:  { label: "Beğenilen Gönderi", icon: <Heart className="w-3.5 h-3.5" />,     color: "text-primary",    bg: "bg-primary/10 border-primary/20" },
  liked_story: { label: "Beğenilen Hikaye",  icon: <ImageIcon className="w-3.5 h-3.5" />, color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/20" },
  liked_reel:  { label: "Beğenilen Reel",    icon: <Video className="w-3.5 h-3.5" />,     color: "text-rose-400",   bg: "bg-rose-400/10 border-rose-400/20" },
}

function CategoryBadge({ category }: { category: Category }) {
  const meta = CATEGORY_META[category]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.color} ${meta.bg}`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Az önce"
  if (mins < 60) return `${mins} dakika önce`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} saat önce`
  const days = Math.floor(hrs / 24)
  return `${days} gün önce`
}

// ── Media row (vertical list) ─────────────────────────────────────────────────
function MediaRow({ item }: { item: LikedMedia }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors">
      {/* Thumbnail */}
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.caption ?? ""}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {item.mediaType === "reel" ? <Play className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
          </div>
        )}
        {/* Type badge */}
        {item.mediaType === "reel" && (
          <div className="absolute bottom-0 inset-x-0 bg-black/50 flex items-center justify-center py-0.5">
            <Play className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {item.caption ? (
          <p className="text-sm text-foreground line-clamp-2 leading-relaxed">{item.caption}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Altyazı yok</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Liked badge */}
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full
            ${item.hasLiked ? "bg-rose-500/15 text-rose-400" : "bg-muted text-muted-foreground"}`}>
            {item.hasLiked
              ? <><CheckCircle2 className="w-2.5 h-2.5" /> Beğenildi</>
              : <><XCircle className="w-2.5 h-2.5" /> Beğenilmedi</>}
          </span>
          {/* Time */}
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {formatDate(item.likedAt)}
            <span className="text-muted-foreground/40">·</span>
            {formatRelative(item.likedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────
interface UserDetailDialogProps {
  user: TrackedUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserDetailDialog({ user, open, onOpenChange }: UserDetailDialogProps) {
  const queryClient = useQueryClient()
  const recordVisit = useRecordTrackedUserVisit()
  const refreshFollowers = useRefreshTrackedUserFollowers()

  const handleRefreshFollowers = () => {
    if (!user) return
    refreshFollowers.mutate({ id: user.id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category: user.category }) })
        toast.success(`Takipçi sayısı güncellendi: ${data.followerCount?.toLocaleString("tr-TR")}`)
      },
      onError: (err: unknown) => {
        const msg = err && typeof err === "object" && "data" in err
          ? (err as { data?: { error?: string } }).data?.error
          : undefined
        toast.error(msg ?? "Takipçi sayısı alınamadı")
      },
    })
  }

  const { data: allUsers } = useListTrackedUsers(
    {},
    { query: { enabled: open && !!user } }
  )

  const showMedia = !!user && (user.category === "liked_post" || user.category === "liked_reel")

  const { data: media, isLoading: mediaLoading } = useListTrackedUserMedia(
    user?.id ?? 0,
    { query: { enabled: open && showMedia } }
  )

  if (!user) return null

  // Deduplicate siblings by category (only keep one entry per category)
  const siblings: TrackedUser[] = (() => {
    if (!Array.isArray(allUsers)) return []
    const seenCategories = new Set<Category>([user.category])
    return (allUsers as TrackedUser[]).filter(u => {
      if (u.username !== user.username || u.id === user.id) return false
      if (seenCategories.has(u.category)) return false
      seenCategories.add(u.category)
      return true
    })
  })()

  const categoryOrder: Category[] = ["follower", "liked_post", "liked_story", "liked_reel"]
  const allEntries: TrackedUser[] = [user, ...siblings].sort(
    (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  )

  const totalInteractions = allEntries.reduce((sum, e) => sum + e.interactionCount, 0)
  const lastInteractions = allEntries.map(e => e.lastInteractionAt).filter(Boolean) as string[]
  const mostRecentInteraction = lastInteractions.length > 0 ? lastInteractions.sort().at(-1)! : null

  // Newest first (en üstte en yeni, en altta en eski)
  const mediaItems: LikedMedia[] = Array.isArray(media)
    ? [...(media as LikedMedia[])].sort((a, b) => new Date(b.likedAt).getTime() - new Date(a.likedAt).getTime())
    : []

  const handleOpenInstagram = () => {
    window.open(`https://www.instagram.com/${user.username}/`, "_blank", "noopener,noreferrer")
    recordVisit.mutate({ id: user.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category: user.category }) })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0 translate-y-[-50%] max-h-[90vh] flex flex-col">

        {/* Banner */}
        <div className="relative h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent shrink-0">
          <div className="absolute -bottom-10 left-6">
            <Avatar className="w-20 h-20 ring-4 ring-card shadow-xl">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName} />}
              <AvatarFallback className="text-xl font-mono bg-primary/10 text-primary">
                {user.username.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="absolute top-3 right-3">
            <Button size="sm" variant="outline" onClick={handleOpenInstagram}
              className="text-xs h-8 bg-card/80 backdrop-blur-sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Instagram'da Aç
            </Button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          <div className="pt-12 px-6 pb-6 space-y-5">

            {/* Identity */}
            <DialogHeader className="space-y-0.5 text-left">
              <DialogTitle className="text-xl font-semibold">{user.fullName}</DialogTitle>
              <p className="text-sm text-muted-foreground font-mono">@{user.username}</p>
            </DialogHeader>

            {/* Categories */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Kategoriler</p>
              <div className="flex flex-wrap gap-2">
                {allEntries.map(e => <CategoryBadge key={e.id} category={e.category} />)}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={<Activity className="w-4 h-4 text-primary" />} label="Toplam Etkileşim" value={String(totalInteractions)} />
              <StatTile
                icon={<Zap className="w-4 h-4 text-amber-400" />}
                label="Oto-Beğeni"
                value={allEntries.some(e => e.autoLikeEnabled) ? "Aktif" : "Kapalı"}
                valueClass={allEntries.some(e => e.autoLikeEnabled) ? "text-emerald-400" : "text-muted-foreground"}
              />
            </div>

            {/* Follower count */}
            <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-4 h-4 text-blue-400" />
                  Takipçi Sayısı
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={handleRefreshFollowers}
                  disabled={refreshFollowers.isPending}
                  title="Şimdi güncelle"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshFollowers.isPending ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {user.followerCount == null ? (
                <p className="text-sm text-muted-foreground italic">
                  Henüz alınmadı — güncelle butonuna bas.
                </p>
              ) : (
                <div className="flex items-end gap-3">
                  <span className="text-2xl font-semibold font-mono text-foreground">
                    {user.followerCount.toLocaleString("tr-TR")}
                  </span>
                  {user.previousFollowerCount != null && (() => {
                    const diff = user.followerCount! - user.previousFollowerCount
                    const pct = user.previousFollowerCount > 0
                      ? ((diff / user.previousFollowerCount) * 100).toFixed(1)
                      : "0.0"
                    if (diff === 0) return <span className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Minus className="w-3 h-3" />Değişim yok</span>
                    return (
                      <span className={`flex items-center gap-1 text-xs font-medium mb-1 ${diff > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {diff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {diff > 0 ? "+" : ""}{diff.toLocaleString("tr-TR")} ({diff > 0 ? "+" : ""}{pct}%)
                      </span>
                    )
                  })()}
                </div>
              )}
              {user.followerCountUpdatedAt && (
                <p className="text-[11px] text-muted-foreground/60">
                  Son güncelleme: {new Date(user.followerCountUpdatedAt).toLocaleString("tr-TR")}
                </p>
              )}
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Zaman Çizelgesi</p>
              <TimelineRow icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" />} label="Eklendi" value={formatDate(user.addedAt)} />
              {mostRecentInteraction && (
                <TimelineRow
                  icon={<Clock className="w-3.5 h-3.5 text-primary" />}
                  label="Son Etkileşim"
                  value={`${formatDate(mostRecentInteraction)} · ${formatRelative(mostRecentInteraction)}`}
                />
              )}
            </div>

            {/* ── Media list (liked_post / liked_reel) ── */}
            {showMedia && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {user.category === "liked_reel" ? "Beğenilen Reels" : "Beğenilen Gönderiler"}
                  </p>
                  {!mediaLoading && (
                    <span className="text-xs text-muted-foreground font-mono">{mediaItems.length} içerik</span>
                  )}
                </div>

                {/* Loading skeletons */}
                {mediaLoading && (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card animate-pulse">
                        <div className="w-16 h-16 shrink-0 rounded-lg bg-muted" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-3 bg-muted rounded w-full" />
                          <div className="h-3 bg-muted rounded w-4/5" />
                          <div className="h-2.5 bg-muted rounded w-1/2 mt-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {!mediaLoading && mediaItems.length === 0 && (
                  <div className="py-8 text-center border border-dashed border-border rounded-xl text-sm text-muted-foreground">
                    Henüz içerik kaydedilmemiş.
                  </div>
                )}

                {/* Media rows — newest first */}
                {!mediaLoading && mediaItems.length > 0 && (
                  <div className="space-y-2">
                    {mediaItems.map(item => <MediaRow key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatTile({ icon, label, value, valueClass = "text-foreground" }: {
  icon: React.ReactNode; label: string; value: string; valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className={`text-lg font-semibold font-mono ${valueClass}`}>{value}</p>
    </div>
  )
}

function TimelineRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div><span className="text-muted-foreground">{label}: </span><span className="text-foreground">{value}</span></div>
    </div>
  )
}
