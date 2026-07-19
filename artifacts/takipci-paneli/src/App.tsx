import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout';

import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import TrackedUsersPage from '@/pages/tracked-users';
import TrackedUserMediaPage from '@/pages/tracked-user-media';
import InstagramPage from '@/pages/instagram';
import AutomationPage from '@/pages/automation';
import SettingsPage from '@/pages/settings';
import InstagramLoginPage from '@/pages/instagram-login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx client errors (auth, not found, etc.)
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/dashboard">
        <AppLayout><DashboardPage /></AppLayout>
      </Route>
      <Route path="/tracked-users">
        <AppLayout><TrackedUsersPage /></AppLayout>
      </Route>
      <Route path="/tracked-users/:id/media">
        <AppLayout><TrackedUserMediaPage /></AppLayout>
      </Route>
      <Route path="/instagram">
        <AppLayout><InstagramPage /></AppLayout>
      </Route>
      <Route path="/automation">
        <AppLayout><AutomationPage /></AppLayout>
      </Route>
      <Route path="/settings">
        <AppLayout><SettingsPage /></AppLayout>
      </Route>
      <Route path="/settings/instagram-login">
        <AppLayout><InstagramLoginPage /></AppLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;