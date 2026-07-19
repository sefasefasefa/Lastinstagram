import { useRoute } from 'wouter';
import { useListTrackedUserMedia, useListTrackedUsers } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, Image as ImageIcon, Video, Heart, Loader2, Calendar } from 'lucide-react';
import { Link } from 'wouter';
import { format } from 'date-fns';

export default function TrackedUserMediaPage() {
  const [, params] = useRoute('/tracked-users/:id/media');
  const userId = params?.id ? parseInt(params.id, 10) : 0;

  const { data: mediaItems, isLoading: isLoadingMedia } = useListTrackedUserMedia(userId, { 
    query: { enabled: !!userId } 
  });
  
  const { data: users } = useListTrackedUsers();
  const user = users?.find(u => u.id === userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/tracked-users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            Media Log
            {user && <span className="text-muted-foreground font-normal text-xl">/ {user.username}</span>}
          </h1>
          <p className="text-muted-foreground">History of media items interacted with for this user.</p>
        </div>
      </div>

      {isLoadingMedia ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !mediaItems || mediaItems.length === 0 ? (
        <Card className="border-dashed bg-transparent shadow-none">
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
            <p>No media records found for this user.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {mediaItems.map((media) => (
            <Card key={media.id} className="overflow-hidden group">
              <div className="aspect-square bg-muted relative">
                {media.thumbnailUrl ? (
                  <img 
                    src={media.thumbnailUrl} 
                    alt={media.caption || 'Media thumbnail'} 
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {media.mediaType === 'reel' ? <Video className="h-12 w-12 opacity-20" /> : <ImageIcon className="h-12 w-12 opacity-20" />}
                  </div>
                )}
                
                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="secondary" size="sm" asChild>
                    <a href={`https://instagram.com/p/${media.externalId}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Instagram
                    </a>
                  </Button>
                </div>

                <div className="absolute top-2 right-2 flex gap-1">
                  <div className="bg-black/70 backdrop-blur-md text-white text-xs px-2 py-1 rounded flex items-center font-medium">
                    {media.mediaType === 'reel' ? <Video className="h-3 w-3 mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                    <span className="capitalize">{media.mediaType}</span>
                  </div>
                </div>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(media.likedAt), 'MMM d, yyyy HH:mm')}
                  </div>
                  {media.hasLiked && (
                    <div className="flex items-center gap-1 text-primary text-xs font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                      <Heart className="h-3 w-3 fill-primary" /> Liked
                    </div>
                  )}
                </div>
                
                {media.caption && (
                  <p className="text-sm line-clamp-2 text-foreground/80">
                    {media.caption}
                  </p>
                )}
                
                <div className="text-[10px] text-muted-foreground/50 font-mono break-all pt-2 border-t border-border">
                  ID: {media.externalId}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}