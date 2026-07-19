import { useGetDashboardSummary, useGetMonitoringStatus, useUpdateMonitoringStatus, useGetInstagramStatus } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users, Heart, PlaySquare, AlertCircle, Activity, Loader2, RefreshCw, Instagram, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: monitoring, isLoading: isLoadingMonitoring } = useGetMonitoringStatus();
  const { data: igStatus, isLoading: isLoadingIg } = useGetInstagramStatus();
  const updateMonitoring = useUpdateMonitoringStatus();

  const handleToggleMonitoring = (enabled: boolean) => {
    updateMonitoring.mutate({ data: { enabled } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      }
    });
  };

  const getRateLimitColor = (status?: string) => {
    switch(status) {
      case 'safe': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoadingSummary || isLoadingMonitoring || isLoadingIg) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your Instagram tracking operations.</p>
      </div>

      {!igStatus?.authenticated && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Instagram Session Missing</AlertTitle>
          <AlertDescription>
            You are not currently logged into an Instagram account. Navigate to Settings to connect an account.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Cards */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Followers</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{summary?.followerCount.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liked Posts</CardTitle>
            <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center">
              <Heart className="h-4 w-4 text-secondary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{summary?.likedPostCount.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liked Stories</CardTitle>
            <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{summary?.likedStoryCount.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Liked Reels</CardTitle>
            <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
              <PlaySquare className="h-4 w-4 text-indigo-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono tracking-tight">{summary?.likedReelCount.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              System Status
            </CardTitle>
            <CardDescription>Current operational state of the tracker</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Global Monitoring</p>
                <p className="text-sm text-muted-foreground">Enable or disable all tracking jobs</p>
              </div>
              <Switch 
                checked={monitoring?.enabled ?? false} 
                onCheckedChange={handleToggleMonitoring}
                disabled={updateMonitoring.isPending}
              />
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <div>
                <p className="font-medium">Rate Limit Status</p>
                <p className="text-sm text-muted-foreground">Current Instagram API pressure</p>
              </div>
              <Badge variant="outline" className={`px-3 py-1 ${getRateLimitColor(summary?.rateLimitStatus)}`}>
                {(summary?.rateLimitStatus ?? 'Unknown').toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-gradient-to-br from-card to-accent/20">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start h-12" asChild>
              <a href="/tracked-users">
                <Users className="h-4 w-4 mr-3 text-primary" />
                Manage Tracked Users
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start h-12" asChild>
              <a href="/automation">
                <Zap className="h-4 w-4 mr-3 text-amber-500" />
                Configure Automation Jobs
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start h-12" asChild>
              <a href="/instagram">
                <Instagram className="h-4 w-4 mr-3 text-secondary" />
                Manual Instagram Actions
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}