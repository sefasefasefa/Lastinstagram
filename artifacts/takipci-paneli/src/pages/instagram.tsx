import { useState } from 'react';
import { 
  useGetInstagramStatus, 
  useGetInstagramProfile, 
  useGetInstagramPosts,
  useGetInstagramStories,
  useGetInstagramReels,
  useLikeInstagramPost,
  useUnlikeInstagramPost,
  useLikeInstagramStory,
  useLikeInstagramReel,
  useUnlikeInstagramReel,
  useMarkInstagramStorySeen
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Search, ExternalLink, AlertCircle, Loader2, Image as ImageIcon, Video, Heart, Eye, Instagram as IgIcon, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function InstagramPage() {
  const { toast } = useToast();
  const { data: status, isLoading: isLoadingStatus } = useGetInstagramStatus();
  
  const [searchUsername, setSearchUsername] = useState('');
  const [activeUsername, setActiveUsername] = useState('');

  // Queries
  const { data: profileData, isLoading: isLoadingProfile, isError: isErrorProfile } = useGetInstagramProfile(activeUsername, { 
    query: { enabled: !!activeUsername, retry: false } 
  });
  const { data: postsData, isLoading: isLoadingPosts } = useGetInstagramPosts(activeUsername, { 
    query: { enabled: !!activeUsername } 
  });
  const { data: storiesData, isLoading: isLoadingStories } = useGetInstagramStories(activeUsername, { 
    query: { enabled: !!activeUsername } 
  });
  const { data: reelsData, isLoading: isLoadingReels } = useGetInstagramReels(activeUsername, { 
    query: { enabled: !!activeUsername } 
  });

  // Mutations
  const likePost = useLikeInstagramPost();
  const unlikePost = useUnlikeInstagramPost();
  const likeStory = useLikeInstagramStory();
  const likeReel = useLikeInstagramReel();
  const unlikeReel = useUnlikeInstagramReel();
  const markStorySeen = useMarkInstagramStorySeen();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchUsername.trim()) {
      setActiveUsername(searchUsername.trim().toLowerCase());
    }
  };

  const handleAction = (type: 'post' | 'story' | 'reel', action: 'like' | 'unlike' | 'seen', id: string) => {
    const successCallback = () => toast({ title: `Action ${action} successful` });
    const errorCallback = () => toast({ title: `Action ${action} failed`, variant: 'destructive' });

    if (type === 'post' && action === 'like') likePost.mutate({ data: { postId: id } }, { onSuccess: successCallback, onError: errorCallback });
    if (type === 'post' && action === 'unlike') unlikePost.mutate({ data: { postId: id } }, { onSuccess: successCallback, onError: errorCallback });
    if (type === 'story' && action === 'like') likeStory.mutate({ data: { storyId: id } }, { onSuccess: successCallback, onError: errorCallback });
    if (type === 'reel' && action === 'like') likeReel.mutate({ data: { reelId: id } }, { onSuccess: successCallback, onError: errorCallback });
    if (type === 'reel' && action === 'unlike') unlikeReel.mutate({ data: { reelId: id } }, { onSuccess: successCallback, onError: errorCallback });
    if (type === 'story' && action === 'seen' && profileData?.profile.pk) {
      markStorySeen.mutate({ data: { storyId: id, ownerId: profileData.profile.pk } }, { onSuccess: successCallback, onError: errorCallback });
    }
  };

  if (isLoadingStatus) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!status?.authenticated) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <IgIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Instagram Session Required</CardTitle>
            <CardDescription>You must connect an Instagram account to use these features.</CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button size="lg" asChild>
              <Link href="/settings/instagram-login">
                Connect Instagram Account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Instagram Explorer</h1>
        <p className="text-muted-foreground">Search profiles and perform manual actions directly through the API.</p>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input 
                placeholder="Enter Instagram username..." 
                className="pl-10 h-12 text-lg bg-background"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8" disabled={isLoadingProfile || !searchUsername.trim()}>
              {isLoadingProfile ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              Lookup
            </Button>
          </form>
        </CardContent>
      </Card>

      {isErrorProfile && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Profile Not Found</AlertTitle>
          <AlertDescription>Could not fetch data for "{activeUsername}". The account might be private, non-existent, or the API is rate-limited.</AlertDescription>
        </Alert>
      )}

      {profileData?.profile && (
        <div className="space-y-6">
          <Card className="overflow-hidden border-border/60 shadow-sm">
            <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent h-24"></div>
            <div className="px-6 pb-6 relative">
              <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end -mt-12 mb-4">
                <Avatar className="h-24 w-24 border-4 border-card bg-muted shadow-sm">
                  {profileData.profile.profilePicUrl ? (
                    <AvatarImage src={profileData.profile.profilePicUrl} alt={profileData.profile.fullName} />
                  ) : (
                    <AvatarFallback className="text-2xl">{profileData.profile.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">{profileData.profile.username}</h2>
                    {profileData.profile.isPrivate && <Badge variant="secondary">Private</Badge>}
                  </div>
                  <p className="text-muted-foreground">{profileData.profile.fullName}</p>
                </div>
                <Button variant="outline" asChild>
                  <a href={`https://instagram.com/${profileData.profile.username}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in App
                  </a>
                </Button>
              </div>

              <div className="flex gap-6 mb-6 pb-6 border-b border-border/50">
                <div><span className="font-bold">{profileData.profile.mediaCount?.toLocaleString() ?? '-'}</span> <span className="text-muted-foreground">posts</span></div>
                <div><span className="font-bold">{profileData.profile.followerCount?.toLocaleString() ?? '-'}</span> <span className="text-muted-foreground">followers</span></div>
                <div><span className="font-bold">{profileData.profile.followingCount?.toLocaleString() ?? '-'}</span> <span className="text-muted-foreground">following</span></div>
              </div>

              {profileData.profile.biography && (
                <div className="whitespace-pre-wrap text-sm">{profileData.profile.biography}</div>
              )}
            </div>
          </Card>

          {!profileData.profile.isPrivate && (
            <Tabs defaultValue="posts" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-12">
                <TabsTrigger value="posts" className="data-[state=active]:bg-background">Posts</TabsTrigger>
                <TabsTrigger value="reels" className="data-[state=active]:bg-background">Reels</TabsTrigger>
                <TabsTrigger value="stories" className="data-[state=active]:bg-background">Stories</TabsTrigger>
              </TabsList>
              
              <TabsContent value="posts" className="mt-6">
                {isLoadingPosts ? (
                  <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : !postsData?.posts?.length ? (
                  <div className="text-center py-12 text-muted-foreground">No posts found.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {postsData.posts.map((post) => (
                      <Card key={post.id} className="overflow-hidden group border-0 shadow-none bg-muted/30">
                        <div className="aspect-square relative bg-muted">
                          {post.displayUrl ? (
                            <img src={post.displayUrl} alt="Post" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground/30" /></div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            <div className="flex gap-4 text-white font-bold text-lg mb-4">
                              <span className="flex items-center gap-1"><Heart className="h-5 w-5 fill-white" /> {post.likeCount}</span>
                              <span className="flex items-center gap-1"><ImageIcon className="h-5 w-5" /> {post.commentCount}</span>
                            </div>
                            {post.hasLiked ? (
                              <Button size="sm" variant="destructive" onClick={() => handleAction('post', 'unlike', post.id)}>Unlike</Button>
                            ) : (
                              <Button size="sm" onClick={() => handleAction('post', 'like', post.id)}><Heart className="h-4 w-4 mr-2" /> Like</Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reels" className="mt-6">
                {isLoadingReels ? (
                  <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : !reelsData?.reels?.length ? (
                  <div className="text-center py-12 text-muted-foreground">No reels found.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {reelsData.reels.map((reel) => (
                      <Card key={reel.id} className="overflow-hidden group border-0 shadow-none bg-muted/30">
                        <div className="aspect-[9/16] relative bg-muted">
                          {reel.displayUrl ? (
                            <img src={reel.displayUrl} alt="Reel" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Video className="h-8 w-8 text-muted-foreground/30" /></div>
                          )}
                          <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {reel.playCount.toLocaleString()}
                          </div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            {reel.hasLiked ? (
                              <Button size="sm" variant="destructive" onClick={() => handleAction('reel', 'unlike', reel.id)}>Unlike</Button>
                            ) : (
                              <Button size="sm" onClick={() => handleAction('reel', 'like', reel.id)}><Heart className="h-4 w-4 mr-2" /> Like</Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="stories" className="mt-6">
                {isLoadingStories ? (
                  <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : !storiesData?.stories?.length ? (
                  <div className="text-center py-12 text-muted-foreground">No active stories.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {storiesData.stories.map((story) => (
                      <Card key={story.id} className="overflow-hidden group border-0 shadow-none bg-muted/30">
                        <div className="aspect-[9/16] relative bg-muted">
                          {story.thumbnailUrl || story.displayUrl ? (
                            <img src={story.thumbnailUrl || story.displayUrl} alt="Story" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground/30" /></div>
                          )}
                          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded text-[10px]">
                            {formatDistanceToNow(story.timestamp * 1000, { addSuffix: true })}
                          </div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                            <Button size="sm" variant="secondary" onClick={() => handleAction('story', 'seen', story.id)}>
                              <Eye className="h-4 w-4 mr-2" /> Mark Seen
                            </Button>
                            <Button size="sm" onClick={() => handleAction('story', 'like', story.id)}>
                              <Heart className="h-4 w-4 mr-2" /> Like Story
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
}