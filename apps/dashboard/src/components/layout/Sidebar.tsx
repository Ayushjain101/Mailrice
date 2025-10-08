import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Globe, Mail, Key, Settings, LogOut, Menu, X } from 'lucide-react';
import { ROUTES, APP_NAME } from '../../utils/constants';
import { cn } from '../../utils/helpers';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { name: 'Domains', href: ROUTES.DOMAINS, icon: Globe },
  { name: 'Mailboxes', href: ROUTES.MAILBOXES, icon: Mail },
  { name: 'API Keys', href: ROUTES.API_KEYS, icon: Key },
  { name: 'Settings', href: ROUTES.SETTINGS, icon: Settings },
];

export interface SidebarProps {
  onLogout: () => void;
}

export function Sidebar({ onLogout }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const NavItems = () => (
    <>
      {navigation.map((item) => (
        <NavLink
          key={item.name}
          to={item.href}
          onClick={() => setIsMobileMenuOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-700 hover:bg-gray-100'
            )
          }
        >
          <item.icon className="w-5 h-5" />
          {item.name}
        </NavLink>
      ))}

      <button
        onClick={onLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full"
      >
        <LogOut className="w-5 h-5" />
        Logout
      </button>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg"
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{APP_NAME}</h1>
              <p className="text-xs text-gray-500">v2.0.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <NavItems />
        </nav>
      </aside>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 left-0 w-64 bg-white h-screen z-50 shadow-xl">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{APP_NAME}</h1>
                  <p className="text-xs text-gray-500">v2.0.0</p>
                </div>
              </div>
            </div>

            <nav className="px-4 space-y-1">
              <NavItems />
            </nav>
          </aside>
        </>
      )}
    </>
  );
}
