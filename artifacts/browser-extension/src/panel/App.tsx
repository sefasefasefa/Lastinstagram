import { Route, Switch, Redirect } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useGetMe } from '@workspace/api-client-react';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import RequestSettingsPage from '@/pages/request-settings';
import NotFound from '@/pages/not-found';

// ─── Auth-aware route wrappers ─────────────────────────────────────────────────
function HomeRedirect() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  return me ? <Redirect to="/dashboard" /> : <Redirect to="/login" />;
}

function LoginRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (me) return <Redirect to="/dashboard" />;
  return <LoginPage />;
}

function DashboardRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  return <DashboardPage />;
}

function RequestSettingsRoute() {
  const { data: me, isPending } = useGetMe();
  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  return <RequestSettingsPage />;
}

// ─── Main app ──────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={useHashLocation}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/login" component={LoginRoute} />
          <Route path="/dashboard" component={DashboardRoute} />
          <Route path="/request-settings" component={RequestSettingsRoute} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
