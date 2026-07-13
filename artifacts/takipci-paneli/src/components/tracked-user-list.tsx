import { useState } from "react"
import { useListTrackedUsers, useDeleteTrackedUser, useRecordTrackedUserVisit, getListTrackedUsersQueryKey, getGetDashboardSummaryQueryKey, TrackedUserCategory, type TrackedUser } from "@workspace/api-client-react"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/radix"
import { Button } from "./ui/core"
import { Trash2, User as UserIcon, ExternalLink } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserDetailDialog } from "./user-detail-dialog"

export function TrackedUserList({ category }: { category: TrackedUserCategory }) {
  const { data: usersData, isLoading } = useListTrackedUsers({ category })
  const users = usersData && Array.isArray(usersData) ? usersData : [];

  const deleteUser = useDeleteTrackedUser()
  const recordVisit = useRecordTrackedUserVisit()
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
              {user.lastInteractionAt && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Son ziyaret: {new Date(user.lastInteractionAt).toLocaleString("tr-TR")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
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
