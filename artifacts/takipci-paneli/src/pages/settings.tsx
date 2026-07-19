import { useState, useEffect } from 'react';
import { 
  useGetRequestConfig, 
  useUpdateRequestConfig, 
  useTestRequestConfig,
  useGetRequestRunHistory,
  useGetInstagramStatus,
  useLogoutInstagram
} from '@workspace/api-client-react';
import { getGetRequestConfigQueryKey, getGetRequestRunHistoryQueryKey, getGetInstagramStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Settings2, Save, Play, Clock, CheckCircle2, XCircle, Instagram, LogOut, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: igStatus, isLoading: isLoadingIg } = useGetInstagramStatus();
  const logoutIg = useLogoutInstagram();

  const { data: config, isLoading: isLoadingConfig } = useGetRequestConfig();
  const { data: history, isLoading: isLoadingHistory } = useGetRequestRunHistory();
  const updateConfig = useUpdateRequestConfig();
  const testConfig = useTestRequestConfig();

  // Local state for forms
  const [targetUrl, setTargetUrl] = useState('');
  const [headersJson, setHeadersJson] = useState('{}');
  const [cookiesJson, setCookiesJson] = useState('{}');

  // Initialize form when data loads
  useEffect(() => {
    if (config) {
      setTargetUrl(config.targetUrl || '');
      setHeadersJson(JSON.stringify(config.headers, null, 2));
      setCookiesJson(JSON.stringify(config.cookies, null, 2));
    }
  }, [config]);

  const handleSaveConfig = () => {
    try {
      const headers = JSON.parse(headersJson);
      const cookies = JSON.parse(cookiesJson);
      
      updateConfig.mutate(
        { data: { targetUrl: targetUrl || null, headers, cookies } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetRequestConfigQueryKey() });
            toast({ title: 'Configuration saved' });
          },
          onError: () => {
            toast({ title: 'Failed to save config', variant: 'destructive' });
          }
        }
      );
    } catch (e) {
      toast({ title: 'Invalid JSON', description: 'Headers and cookies must be valid JSON objects', variant: 'destructive' });
    }
  };

  const handleTestConfig = () => {
    testConfig.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetRequestRunHistoryQueryKey() });
        if (data.isCaptcha) {
          toast({ 
            title: `Challenge Detected: ${data.captchaType || 'Unknown'}`, 
            description: `Status: ${data.status}`,
            variant: 'destructive' 
          });
        } else {
          toast({ 
            title: `Test Complete: ${data.status} ${data.statusText}`, 
            description: 'Check run history for details.'
          });
        }
      },
      onError: () => {
        toast({ title: 'Test failed to execute', variant: 'destructive' });
      }
    });
  };

  const handleIgLogout = () => {
    logoutIg.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInstagramStatusQueryKey() });
        toast({ title: 'Instagram session disconnected' });
      }
    });
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Settings</h1>
        <p className="text-muted-foreground">Manage connections and low-level request configurations.</p>
      </div>

      {/* Instagram Connection */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-secondary/5 to-transparent h-2 absolute top-0 left-0 right-0" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            Instagram Connection
          </CardTitle>
          <CardDescription>Manage your active Instagram session.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingIg ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking session...</div>
          ) : igStatus?.authenticated ? (
            <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-emerald-700">Connected</p>
                  <p className="text-sm text-emerald-600/80">Active Instagram session established.</p>
                </div>
              </div>
              <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleIgLogout} disabled={logoutIg.isPending}>
                {logoutIg.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Not Connected</p>
                  <p className="text-sm text-muted-foreground">Login required to use tracking features.</p>
                </div>
              </div>
              <Button asChild>
                <Link href="/settings/instagram-login">
                  Connect Account
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Configuration */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Request Configuration
          </CardTitle>
          <CardDescription>Low-level configuration for outgoing proxy requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingConfig ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="targetUrl">Target URL</Label>
                <Input 
                  id="targetUrl" 
                  placeholder="https://..." 
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="headers">Headers (JSON)</Label>
                  <Textarea 
                    id="headers" 
                    className="font-mono text-xs h-48 bg-muted/30 resize-none" 
                    value={headersJson}
                    onChange={(e) => setHeadersJson(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cookies">Cookies (JSON)</Label>
                  <Textarea 
                    id="cookies" 
                    className="font-mono text-xs h-48 bg-muted/30 resize-none" 
                    value={cookiesJson}
                    onChange={(e) => setCookiesJson(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex justify-between border-t border-border/50 pt-6">
          <Button variant="outline" onClick={handleTestConfig} disabled={testConfig.isPending || isLoadingConfig}>
            {testConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2 text-primary" />}
            Run Test
          </Button>
          <Button onClick={handleSaveConfig} disabled={updateConfig.isPending || isLoadingConfig}>
            {updateConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>

      {/* Test Run History */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Test Run History
          </CardTitle>
          <CardDescription>Logs of manually triggered test requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
              No test history available.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(log.ranAt), 'MMM d, HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.success ? 'default' : 'destructive'} className={log.success ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' : ''}>
                        {log.status ? `${log.status} ${log.statusText}` : 'Failed'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground truncate max-w-md">
                      {log.errorMessage || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}