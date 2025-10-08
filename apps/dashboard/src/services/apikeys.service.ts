import { api } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type { APIKey, CreateAPIKeyRequest, CreateAPIKeyResponse } from '../types/apikey.types';

export const apiKeysService = {
  /**
   * Get all API keys
   */
  async getAPIKeys(): Promise<APIKey[]> {
    const response = await api.get<APIKey[]>(API_ENDPOINTS.API_KEYS);
    return response.data;
  },

  /**
   * Create new API key
   */
  async createAPIKey(data: CreateAPIKeyRequest): Promise<CreateAPIKeyResponse> {
    const response = await api.post<CreateAPIKeyResponse>(API_ENDPOINTS.API_KEYS, data);
    return response.data;
  },

  /**
   * Delete API key
   */
  async deleteAPIKey(id: number): Promise<void> {
    await api.delete(`${API_ENDPOINTS.API_KEYS}/${id}`);
  },
};
