import { useState } from 'react';
import { 
  useListTrackedUsers, 
  useCreateTrackedUser, 
  useDeleteTrackedUser, 
  useRefreshTrackedUserFollowers,
  TrackedUserCategory 
} from '@workspace/api-client-react';
import { getListTrackedUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { formatDistanceToNow } from 'date-fns';

import { 
  Plus, Search, MoreHorizontal, Trash2, RefreshCw, 
  ExternalLink, Loader2, Image as ImageIcon, CheckCircle2, ChevronDown, Filter,
  Users
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const newUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  fullName: z.string().min(1, 'Full name is required'),
  avatarUrl: z.string().url('Must be a valid URL').or(z.literal('')),
  category: z.nativeEnum(TrackedUserCategory),
  autoLikeEnabled: z.boolean().default(false),
});

export default function TrackedUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [filterCategory, setFilterCategory] = useState<TrackedUserCategory | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: users, isLoading } = useListTrackedUsers(
    filterCategory ? { category: filterCategory } : undefined
  );

  const createUser = useCreateTrackedUser();
  const deleteUser = useDeleteTrackedUser();
  const refreshFollowers = useRefreshTrackedUserFollowers();

  const form = useForm<z.infer<typeof newUserSchema>>({
    resolver: zodResolver(newUserSchema),
    defaultValues: {
      username: '',
      fullName: '',
      avatarUrl: '',
      category: 'follower',
      autoLikeEnabled: false,
    },
  });

  const onSubmitNewUser = (values: z.infer<typeof newUserSchema>) => {
    createUser.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey(filterCategory ? { category: filterCategory } : undefined) });
          toast({ title: 'User added successfully' });
          setIsAddDialogOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: 'Failed to add user', variant: 'destructive' });
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this tracked user?')) {
      deleteUser.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey(filterCategory ? { category: filterCategory } : undefined) });
            toast({ title: 'User deleted' });
          }
        }
      );
    }
  };

  const handleRefresh = (id: number) => {
    refreshFollowers.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListTrackedUsersQueryKey(filterCategory ? { category: filterCategory } : undefined) });
          toast({ 
            title: 'Followers refreshed', 
            description: `Current count: ${data.followerCount}` 
          });
        },
        onError: () => {
          toast({ title: 'Refresh failed', variant: 'destructive' });
        }
      }
    );
  };

  const filteredUsers = users?.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Tracked Users</h1>
          <p className="text-muted-foreground">Manage Instagram profiles you are monitoring.</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tracked User</DialogTitle>
              <DialogDescription>
                Add a new Instagram profile to monitor.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitNewUser)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="instagram_user" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="follower">Follower</SelectItem>
                          <SelectItem value="liked_post">Liked Post</SelectItem>
                          <SelectItem value="liked_story">Liked Story</SelectItem>
                          <SelectItem value="liked_reel">Liked Reel</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="avatarUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="autoLikeEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Auto-Like Enable</FormLabel>
                        <FormDescription>
                          Stored preference flag for automation routines.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createUser.isPending}>
                    {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save User
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm border-border/60">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search users..." 
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select 
              value={filterCategory || "all"} 
              onValueChange={(val) => setFilterCategory(val === "all" ? undefined : val as TrackedUserCategory)}
            >
              <SelectTrigger className="w-full sm:w-48 bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="follower">Followers</SelectItem>
                <SelectItem value="liked_post">Liked Posts</SelectItem>
                <SelectItem value="liked_story">Liked Stories</SelectItem>
                <SelectItem value="liked_reel">Liked Reels</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <p>No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Followers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const followerChange = (user.followerCount ?? 0) - (user.previousFollowerCount ?? 0);
                  
                  return (
                    <TableRow key={user.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border/50">
                            {user.avatarUrl ? (
                              <AvatarImage src={user.avatarUrl} alt={user.username} />
                            ) : (
                              <AvatarFallback className="bg-primary/5 text-primary text-xs">
                                {user.username.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm text-foreground flex items-center gap-1.5">
                              {user.username}
                              {user.autoLikeEnabled && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                            </div>
                            <div className="text-xs text-muted-foreground">{user.fullName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal capitalize bg-secondary/10 text-secondary-foreground border-secondary/20 hover:bg-secondary/20">
                          {user.category.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono font-medium">{user.followerCount?.toLocaleString() ?? '-'}</div>
                        {user.followerCount !== null && user.previousFollowerCount !== null && followerChange !== 0 && (
                          <div className={`text-xs font-mono flex items-center justify-end gap-0.5 ${followerChange > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                            {followerChange > 0 ? '+' : ''}{followerChange}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {user.followerCountUpdatedAt ? 
                            `Updated ${formatDistanceToNow(new Date(user.followerCountUpdatedAt), { addSuffix: true })}` : 
                            'Never updated'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <a href={`https://instagram.com/${user.username}`} target="_blank" rel="noopener noreferrer" className="flex items-center cursor-pointer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View on Instagram
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/tracked-users/${user.id}/media`} className="flex items-center cursor-pointer">
                                <ImageIcon className="h-4 w-4 mr-2" />
                                View Media Log
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleRefresh(user.id)}
                              disabled={refreshFollowers.isPending}
                              className="cursor-pointer"
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Refresh Followers
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(user.id)}
                              className="text-destructive focus:text-destructive cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}