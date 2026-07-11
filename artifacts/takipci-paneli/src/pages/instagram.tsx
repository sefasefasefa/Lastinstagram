import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetInstagramPostsQueryKey,
  getGetInstagramProfileQueryKey,
  getGetInstagramReelsQueryKey,
  getGetInstagramStatusQueryKey,
  getGetInstagramStoriesQueryKey,
  useGetInstagramPosts,
  useGetInstagramProfile,
  useGetInstagramReels,
  useGetInstagramStatus,
  useGetInstagramStories,
  useLikeInstagramPost,
  useLikeInstagramReel,
  useLikeInstagramStory,
  useLoginInstagram,
  useLogoutInstagram,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Heart,
  Image as ImageIcon,
  Instagram,
  LogIn,
  LogOut,
  Search,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input } from "../components/ui/core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/radix";

export default function InstagramPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("");
  const status = useGetInstagramStatus();
  const queriesEnabled = Boolean(username) && Boolean(status.data?.authenticated);
  const profile = useGetInstagramProfile(username, {
    query: { queryKey: getGetInstagramProfileQueryKey(username), enabled: queriesEnabled },
  });
  const posts = useGetInstagramPosts(username, {
    query: { queryKey: getGetInstagramPostsQueryKey(username), enabled: queriesEnabled },
  });
  const stories = useGetInstagramStories(username, {
    query: { queryKey: getGetInstagramStoriesQueryKey(username), enabled: queriesEnabled },
  });
  const reels = useGetInstagramReels(username, {
    query: { queryKey: getGetInstagramReelsQueryKey(username), enabled: queriesEnabled },
  });
  const login = useLoginInstagram();
  const logout = useLogoutInstagram();
  const likePost = useLikeInstagramPost();
  const likeStory = useLikeInstagramStory();
  const likeReel = useLikeInstagramReel();

  const refreshStatus = () =>
    queryClient.invalidateQueries({ queryKey: getGetInstagramStatusQueryKey() });

  const handleLogin = () => {
    login.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message);
        void refreshStatus();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: (data) => {
        setUsername("");
        toast.success(data.message);
        void refreshStatus();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim().replace(/^@/, "");
    if (!normalized) {
      toast.error("Bir Instagram kullanıcı adı girin.");
      return;
    }
    if (!status.data?.authenticated) {
      toast.error("Önce Instagram oturumunu başlatın.");
      return;
    }
    setUsername(normalized);
  };

  const isLoading = profile.isFetching || posts.isFetching || stories.isFetching || reels.isFetching;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
              <Instagram className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">Instagram Merkezi</p>
              <p className="text-xs text-muted-foreground">Profil ve içerik yönetimi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Panele Dön
              </Button>
            </Link>
            {status.data?.authenticated ? (
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending}>
                <LogOut className="mr-2 h-4 w-4" />
                Oturumu Kapat
              </Button>
            ) : (
              <Button size="sm" onClick={handleLogin} disabled={login.isPending}>
                <LogIn className="mr-2 h-4 w-4" />
                {login.isPending ? "Bağlanıyor" : "Instagram'a Bağlan"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <Card className="p-6">
            <h1 className="text-2xl font-semibold tracking-tight">Profil Ara</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bir hesabın son gönderilerini, aktif hikâyelerini ve video içeriklerini görüntüleyin.
            </p>
            <form onSubmit={handleSearch} className="mt-5 flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="kullaniciadi"
                aria-label="Instagram kullanıcı adı"
              />
              <Button type="submit" disabled={!status.data?.authenticated || isLoading}>
                <Search className="mr-2 h-4 w-4" />
                Ara
              </Button>
            </form>
          </Card>
          <Card className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">Bağlantı durumu</p>
              <p className="mt-1 font-medium">
                {status.data?.authenticated ? "Oturum hazır" : "Bağlantı bekleniyor"}
              </p>
            </div>
            <span
              className={`h-3 w-3 rounded-full ${status.data?.authenticated ? "bg-emerald-500" : "bg-amber-500"}`}
              aria-hidden="true"
            />
          </Card>
        </section>

        {profile.data?.profile && (
          <Card className="flex items-center gap-4 p-5">
            {profile.data.profile.profilePicUrl ? (
              <img
                src={profile.data.profile.profilePicUrl}
                alt=""
                className="h-16 w-16 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted" />
            )}
            <div>
              <h2 className="text-lg font-semibold">{profile.data.profile.fullName}</h2>
              <p className="text-sm text-muted-foreground">@{profile.data.profile.username}</p>
            </div>
          </Card>
        )}

        {username && (
          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="posts"><ImageIcon className="mr-2 h-4 w-4" />Gönderiler</TabsTrigger>
              <TabsTrigger value="stories"><Heart className="mr-2 h-4 w-4" />Hikâyeler</TabsTrigger>
              <TabsTrigger value="reels"><Video className="mr-2 h-4 w-4" />Reels</TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="mt-5">
              <MediaGrid
                items={posts.data?.posts ?? []}
                emptyText="Gönderi bulunamadı."
                pendingId={likePost.variables?.data.postId}
                onLike={(id) => likePost.mutate({ data: { postId: id } }, {
                  onSuccess: (data) => toast.success(data.message),
                  onError: (error) => toast.error(error.message),
                })}
              />
            </TabsContent>

            <TabsContent value="stories" className="mt-5">
              <MediaGrid
                items={stories.data?.stories ?? []}
                emptyText="Aktif hikâye bulunamadı."
                pendingId={likeStory.variables?.data.storyId}
                onLike={(id) => likeStory.mutate({ data: { storyId: id } }, {
                  onSuccess: (data) => toast.success(data.message),
                  onError: (error) => toast.error(error.message),
                })}
              />
            </TabsContent>

            <TabsContent value="reels" className="mt-5">
              <MediaGrid
                items={reels.data?.reels ?? []}
                emptyText="Reels veya video gönderisi bulunamadı."
                pendingId={likeReel.variables?.data.reelId}
                onLike={(id) => likeReel.mutate({ data: { reelId: id } }, {
                  onSuccess: (data) => toast.success(data.message),
                  onError: (error) => toast.error(error.message),
                })}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

type MediaItem = {
  id: string;
  displayUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  caption?: string;
  likeCount?: number;
  hasLiked?: boolean;
};

function MediaGrid({
  items,
  emptyText,
  pendingId,
  onLike,
}: {
  items: MediaItem[];
  emptyText: string;
  pendingId?: string;
  onLike: (id: string) => void;
}) {
  if (!items.length) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">{emptyText}</Card>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden">
          <div className="aspect-square bg-muted">
            {item.displayUrl || item.thumbnailUrl ? (
              <img
                src={item.displayUrl ?? item.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {item.videoUrl ? <Video className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
              </div>
            )}
          </div>
          <div className="space-y-3 p-4">
            {item.caption && <p className="line-clamp-2 text-sm">{item.caption}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {typeof item.likeCount === "number" ? `${item.likeCount} beğeni` : "Instagram içeriği"}
              </span>
              <Button
                size="sm"
                variant={item.hasLiked ? "secondary" : "outline"}
                disabled={pendingId === item.id || item.hasLiked}
                onClick={() => onLike(item.id)}
              >
                <Heart className="mr-2 h-4 w-4" />
                {item.hasLiked ? "Beğenildi" : "Beğen"}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
