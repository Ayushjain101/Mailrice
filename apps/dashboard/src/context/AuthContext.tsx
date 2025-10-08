import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { TOKEN_KEY, ROUTES } from '../utils/constants';
import type { LoginRequest, User } from '../types/auth.types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
      // TODO: Fetch user info when backend supports /auth/me
      // For now, just set authenticated state
    }
    setIsLoading(false);
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authService.login(credentials);
      const { access_token } = response;

      // Store token
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);

      // TODO: Fetch and set user when backend supports it
      // For now, create a basic user object from email
      const mockUser: User = {
        id: 1,
        email: credentials.email,
        tenant_id: 1,
        created_at: new Date().toISOString(),
      };
      setUser(mockUser);

      // Navigate to dashboard
      navigate(ROUTES.DASHBOARD);
    } catch (error) {
      // Re-throw to let component handle the error
      throw error;
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setToken(null);
    navigate(ROUTES.LOGIN);
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
