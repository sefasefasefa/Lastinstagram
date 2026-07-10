import { useState } from "react"
import { useCreateTrackedUser, getListTrackedUsersQueryKey, getGetDashboardSummaryQueryKey, TrackedUserCategory } from "@workspace/api-client-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/radix"
import { Button, Input, Label } from "./ui/core"
import { Plus, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function AddUserDialog() {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [fullName, setFullName] = useState("")
  const [category, setCategory] = useState<TrackedUserCategory>("follower")

  const createUser = useCreateTrackedUser()
  const queryClient = useQueryClient()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !fullName) return

    createUser.mutate({
      data: {
        username: username.replace('@', ''),
        fullName,
        avatarUrl: "", // Use fallback aesthetic with initials
        category
      }
    }, {
      onSuccess: () => {
        toast.success(`@${username} eklendi`)
        queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey({ category }) })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        setOpen(false)
        setUsername("")
        setFullName("")
      },
      onError: () => {
        toast.error("Kullanıcı eklenemedi")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-add-user">
          <Plus className="w-4 h-4" />
          Kullanıcı Ekle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Takip Listesine Ekle</DialogTitle>
          <DialogDescription>
            Bir kullanıcıyı manuel olarak takip listesine ekle.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label htmlFor="category">Kategori</Label>
            <select
              id="category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={category}
              onChange={(e) => setCategory(e.target.value as TrackedUserCategory)}
            >
              <option value="follower">Takipçi</option>
              <option value="liked_post">Beğendiğim Gönderi</option>
              <option value="liked_story">Beğendiğim Hikaye</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı Adı</Label>
            <Input
              id="username"
              placeholder="örn. ahmetyilmaz"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Ad Soyad</Label>
            <Input
              id="fullName"
              placeholder="Ahmet Yılmaz"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={!username || !fullName || createUser.isPending}>
              {createUser.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ekle
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
