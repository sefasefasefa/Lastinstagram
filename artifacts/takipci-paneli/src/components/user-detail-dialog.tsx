import { useListTrackedUsers, useRecordTrackedUserVisit, getListTrackedUsersQueryKey, type TrackedUser } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "./ui/radix"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/radix"
import { Button } from "./ui/core"
import {
  Users, Heart, Image as ImageIcon, Video,
  ExternalLink, Clock, Activity, Zap, Calendar,
} from "lucide-react"

type Category = TrackedUser["category"]

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  follower:    { label: "Takipçi",          icon: <Users className="w-3.5 h-3.5" />,     color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/20" },
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

interface UserDetailDialogProps {
  user: TrackedUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserDetailDialog({ user, open, onOpenChange }: UserDetailDialogProps) {
  const queryClient = useQueryClient()
  const recordVisit = useRecordTrackedUserVisit()

  // Fetch ALL tracked users (no category filter) to find every category this username appears in
  const { data: allUsers } = useListTrackedUsers({}, { query: { enabled: open && !!user } })

  if (!user) return null

  const siblings: TrackedUser[] = Array.isArray(allUsers)
    ? (allUsers as TrackedUser[]).filter(
        (u) => u.username === user.username && u.id !== user.id
      )
    : []

  // All entries for this user (primary + siblings), sorted by category order
  const categoryOrder: Category[] = ["follower", "liked_post", "liked_story", "liked_reel"]
  const allEntries: TrackedUser[] = [user, ...siblings].sort(
    (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  )

  const handleOpenInstagram = () => {
    window.open(`https://www.instagram.com/${user.username}/`, "_blank", "noopener,noreferrer")
    recordVisit.mutate({ id: user.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category: user.category }) })
      },
    })
  }

  // Aggregate stats across all entries
  const totalInteractions = allEntries.reduce((sum, e) => sum + e.interactionCount, 0)
  const lastInteractions = allEntries
    .map((e) => e.lastInteractionAt)
    .filter(Boolean) as string[]
  const mostRecentInteraction = lastInteractions.length > 0
    ? lastInteractions.sort().at(-1)!
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 translate-y-[-50%]">

        {/* Header — gradient banner + avatar */}
        <div className="relative h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
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
              {allEntries.map((e) => (
                <CategoryBadge key={e.id} category={e.category} />
              ))}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<Activity className="w-4 h-4 text-primary" />}
              label="Toplam Etkileşim"
              value={String(totalInteractions)}
            />
            <StatTile
              icon={<Zap className="w-4 h-4 text-amber-400" />}
              label="Oto-Beğeni"
              value={allEntries.some((e) => e.autoLikeEnabled) ? "Aktif" : "Kapalı"}
              valueClass={allEntries.some((e) => e.autoLikeEnabled) ? "text-emerald-400" : "text-muted-foreground"}
            />
          </div>

          {/* Timeline */}
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Zaman Çizelgesi</p>
            <div className="space-y-2">
              <TimelineRow
                icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" />}
                label="Eklendi"
                value={formatDate(user.addedAt)}
              />
              {mostRecentInteraction && (
                <TimelineRow
                  icon={<Clock className="w-3.5 h-3.5 text-primary" />}
                  label="Son Etkileşim"
                  value={`${formatDate(mostRecentInteraction)} — ${formatRelative(mostRecentInteraction)}`}
                />
              )}
            </div>
          </div>

          {/* Per-category breakdown (if multiple) */}
          {allEntries.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Kategori Detayı</p>
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {allEntries.map((e) => {
                  const meta = CATEGORY_META[e.category]
                  return (
                    <div key={e.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                      <span className={`flex items-center gap-2 font-medium ${meta.color}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {e.interactionCount} etkileşim
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatTile({ icon, label, value, valueClass = "text-foreground" }: {
  icon: React.ReactNode
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-semibold font-mono ${valueClass}`}>{value}</p>
    </div>
  )
}

function TimelineRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  )
}
