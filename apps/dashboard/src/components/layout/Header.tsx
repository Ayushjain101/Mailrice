import { useAuth } from '../../context/AuthContext';
import { User, Bell } from 'lucide-react';

export function Header() {
  const { user } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Welcome back!</h2>
          <p className="text-sm text-gray-600">Manage your email infrastructure</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors relative">
            <Bell className="w-5 h-5" />
            {/* Notification badge (example) */}
            {/* <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" /> */}
          </button>

          {/* User menu */}
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900">{user?.email || 'Admin'}</p>
              <p className="text-xs text-gray-500">Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
