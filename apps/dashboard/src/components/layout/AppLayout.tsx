import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageLoader } from '../shared/LoadingSpinner';
import { ROUTES } from '../../utils/constants';

export function AppLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar onLogout={logout} />

      <div className="flex-1 flex flex-col lg:ml-0">
        <Header />

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
