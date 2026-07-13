import {
  Route,
  Switch,
  Router as WouterRouter,
  Redirect,
} from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useGetMe } from '@workspace/api-client-react';
import LoginPage from './pages/login';
import DashboardPage from './pages/dashboard';
import RequestSettingsPage from './pages/request-settings';
import SettingsPage from './pages/settings';
import InstagramPage from './pages/instagram';
import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

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

function SettingsRoute() {
  const { data: me, isPending } = useGetMe();

  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  if (import.meta.env.VITE_ADMIN_ENABLED !== 'true') return <Redirect to="/dashboard" />;
  return <SettingsPage />;
}

function InstagramRoute() {
  const { data: me, isPending } = useGetMe();

  if (isPending) return null;
  if (!me) return <Redirect to="/login" />;
  return <InstagramPage />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/login" component={LoginRoute} />
        <Route path="/dashboard" component={DashboardRoute} />
        <Route path="/request-settings" component={RequestSettingsRoute} />
        <Route path="/settings" component={SettingsRoute} />
        <Route path="/instagram" component={InstagramRoute} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
