import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { Toaster } from 'sonner';
import ConnectPage from './pages/connect';
import DashboardPage from './pages/dashboard';
import NotFound from './pages/not-found';
import { useGetConnection } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { ComponentType } from 'react';

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { data, isLoading } = useGetConnection();
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }
  if (!data?.connected) {
    return <Redirect to="/connect" />;
  }
  return <Component />;
}

function PublicRoute({ component: Component }: { component: ComponentType }) {
  const { data, isLoading } = useGetConnection();
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }
  if (data?.connected) {
    return <Redirect to="/dashboard" />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/connect">
        <PublicRoute component={ConnectPage} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
