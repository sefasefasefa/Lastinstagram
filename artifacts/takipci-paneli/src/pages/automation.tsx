import { useState } from 'react';
import { 
  useListAutomationJobs, 
  useCreateAutomationJob, 
  useDeleteAutomationJob,
  ActionType,
  AutomationJobStatus
} from '@workspace/api-client-react';
import { getListAutomationJobsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import { Plus, Trash2, Zap, Play, Pause, AlertTriangle, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const newJobSchema = z.object({
  targetUsername: z.string().min(1, 'Target username is required'),
  actionType: z.nativeEnum(ActionType),
  frequencyMinutes: z.coerce.number().min(15).max(1440),
  randomizeDelay: z.boolean().default(true),
});

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: jobs, isLoading } = useListAutomationJobs();
  const createJob = useCreateAutomationJob();
  const deleteJob = useDeleteAutomationJob();

  const form = useForm<z.infer<typeof newJobSchema>>({
    resolver: zodResolver(newJobSchema),
    defaultValues: {
      targetUsername: '',
      actionType: 'like',
      frequencyMinutes: 60,
      randomizeDelay: true,
    },
  });

  const onSubmit = (values: z.infer<typeof newJobSchema>) => {
    createJob.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAutomationJobsQueryKey() });
          toast({ title: 'Job created successfully' });
          setIsAddDialogOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: 'Failed to create job', variant: 'destructive' });
        }
      }
    );
  };

  const handleDelete = (jobId: string) => {
    if (confirm('Delete this automation job?')) {
      deleteJob.mutate(
        { jobId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAutomationJobsQueryKey() });
            toast({ title: 'Job deleted' });
          }
        }
      );
    }
  };

  const getStatusBadge = (status: AutomationJobStatus) => {
    switch(status) {
      case 'active': return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-0"><Play className="w-3 h-3 mr-1"/> Active</Badge>;
      case 'paused': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-0"><Pause className="w-3 h-3 mr-1"/> Paused</Badge>;
      case 'failed': return <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"><AlertTriangle className="w-3 h-3 mr-1"/> Failed</Badge>;
    }
  };

  const getActionLabel = (action: ActionType) => {
    switch(action) {
      case 'like': return 'Auto Like Posts';
      case 'view_story': return 'Auto View Stories';
      case 'follow': return 'Auto Follow';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Automation Jobs</h1>
          <p className="text-muted-foreground">Configure background tasks and routine actions.</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Automation Job</DialogTitle>
              <DialogDescription>
                Define a new scheduled action against an Instagram target.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="targetUsername"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Username</FormLabel>
                      <FormControl>
                        <Input placeholder="instagram_user" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="actionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Action Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="like">Like New Posts</SelectItem>
                          <SelectItem value="view_story">Watch Stories</SelectItem>
                          <SelectItem value="follow">Follow Target</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="frequencyMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" min={15} max={1440} {...field} />
                      </FormControl>
                      <FormDescription>How often should this job run? (Min: 15, Max: 1440)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="randomizeDelay"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Randomize Delay</FormLabel>
                        <FormDescription>
                          Add random jitter to execution times to appear more human.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createJob.isPending}>
                    {createJob.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Job
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm border-border/60">
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <Zap className="h-12 w-12 text-muted-foreground/30" />
            <p>No automation jobs configured.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.jobId}>
                  <TableCell className="font-medium">{job.targetUsername}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                        <Zap className="h-3 w-3" />
                      </div>
                      {getActionLabel(job.actionType)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Every {job.frequencyMinutes}m
                      {job.randomizeDelay && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-1">~jitter</span>}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {format(new Date(job.nextRunAt), 'HH:mm')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(job.jobId)}
                      disabled={deleteJob.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}