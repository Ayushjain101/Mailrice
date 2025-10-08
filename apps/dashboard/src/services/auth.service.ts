import { api } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type { LoginRequest, LoginResponse, User } from '../types/auth.types';

export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>(API_ENDPOINTS.LOGIN, credentials);
    return response.data;
  },

  /**
   * Get current user info (placeholder - implement when backend supports)
   */
  async getCurrentUser(): Promise<User> {
    // TODO: Implement when backend has /auth/me endpoint
    // For now, return a mock user based on token existence
    throw new Error('Not implemented yet');
  },

  /**
   * Logout - clear local storage
   */
  logout(): void {
    localStorage.clear();
  },
};
