import { useState } from "react"
import { useListTrackedUsers, useDeleteTrackedUser, useRecordTrackedUserVisit, useRefreshTrackedUserFollowers, getListTrackedUsersQueryKey, getGetDashboardSummaryQueryKey, TrackedUserCategory, type TrackedUser } from "@workspace/api-client-react"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/radix"
import { Button } from "./ui/core"
import { Trash2, User as UserIcon, ExternalLink, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserDetailDialog } from "./user-detail-dialog"

function FollowerBadge({ current, previous }: { current: number | null | undefined; previous: number | null | undefined }) {
  if (current == null) return null

  const fmt = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : String(n)

  if (previous == null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
        <Minus className="w-3 h-3" />{fmt(current)}
      </span>
    )
  }

  const diff = current - previous
  const pct = previous > 0 ? ((diff / previous) * 100) : 0
  const isUp = diff > 0
  const isDown = diff < 0

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium
      ${isUp ? "text-emerald-400" : isDown ? "text-rose-400" : "text-muted-foreground"}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {fmt(current)}
      {diff !== 0 && (
        <span className="opacity-70">
          ({diff > 0 ? "+" : ""}{pct.toFixed(1)}%)
        </span>
      )}
    </span>
  )
}

export function TrackedUserList({ category }: { category: TrackedUserCategory }) {
  const { data: usersData, isLoading } = useListTrackedUsers({ category })
  const users = usersData && Array.isArray(usersData) ? usersData : [];

  const deleteUser = useDeleteTrackedUser()
  const recordVisit = useRecordTrackedUserVisit()
  const refreshFollowers = useRefreshTrackedUserFollowers()
  const queryClient = useQueryClient()

  const [selectedUser, setSelectedUser] = useState<TrackedUser | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleCardClick = (user: TrackedUser) => {
    setSelectedUser(user)
    setDialogOpen(true)
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground animate-pulse">Yükleniyor...</div>
  }

  if (!users || users.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-border rounded-xl bg-card/30 flex flex-col items-center justify-center animate-in fade-in duration-500">
        <UserIcon className="w-10 h-10 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">Bu kategoride kullanıcı yok.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Veriler senkronize edildiğinde burada görünecek.</p>
      </div>
    )
  }

  const handleDelete = (e: React.MouseEvent, id: number, username: string) => {
    e.stopPropagation()
    deleteUser.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category }) })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        toast.success(`Removed @${username}`)
      }
    })
  }

  const handleRefreshFollowers = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    refreshFollowers.mutate({ id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category }) })
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

  const handleOpenInstagram = (e: React.MouseEvent, id: number, username: string) => {
    e.stopPropagation()
    window.open(`https://www.instagram.com/${username}/`, "_blank", "noopener,noreferrer")
    recordVisit.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category }) })
      },
    })
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user, index) => (
          <div
            key={user.id}
            onClick={() => handleCardClick(user)}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 hover:shadow-[0_0_16px_rgba(217,119,87,0.08)] transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 group select-none"
            style={{ animationFillMode: "both", animationDelay: `${index * 50}ms` }}
          >
            <Avatar className="w-12 h-12 ring-2 ring-background shrink-0">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName} />}
              <AvatarFallback className="bg-primary/10 text-primary font-mono text-xs">
                {user.username.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-foreground truncate">{user.fullName}</h4>
              <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">@{user.username}</p>
              <div className="mt-1">
                <FollowerBadge current={user.followerCount} previous={user.previousFollowerCount} />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={(e) => handleRefreshFollowers(e, user.id)}
                disabled={refreshFollowers.isPending}
                title="Takipçi sayısını güncelle"
              >
                <RefreshCw className={`w-4 h-4 ${refreshFollowers.isPending ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={(e) => handleOpenInstagram(e, user.id, user.username)}
                disabled={recordVisit.isPending}
                title="Instagram'da aç"
                data-testid={`button-open-instagram-${user.username}`}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => handleDelete(e, user.id, user.username)}
                disabled={deleteUser.isPending}
                data-testid={`button-remove-${user.username}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <UserDetailDialog
        user={selectedUser}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setSelectedUser(null)
        }}
      />
    </>
  )
}
