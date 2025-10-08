import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Domains } from './pages/Domains';
import { Mailboxes } from './pages/Mailboxes';
import { ROUTES } from './utils/constants';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Placeholder pages
function APIKeysPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">API Keys</h1><p className="text-gray-600 mt-2">API key management coming soon...</p></div>;
}

function SettingsPage() {
  return <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-gray-600 mt-2">Settings coming soon...</p></div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path={ROUTES.LOGIN} element={<Login />} />

            {/* Protected routes */}
            <Route element={<AppLayout />}>
              <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
              <Route path={ROUTES.DOMAINS} element={<Domains />} />
              <Route path={ROUTES.MAILBOXES} element={<Mailboxes />} />
              <Route path={ROUTES.API_KEYS} element={<APIKeysPage />} />
              <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
          </Routes>

          {/* Toast notifications */}
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
