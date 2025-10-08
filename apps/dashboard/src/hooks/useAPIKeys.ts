import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysService } from '../services/apikeys.service';
import { QUERY_KEYS } from '../utils/constants';
import type { APIKey, CreateAPIKeyRequest } from '../types/apikey.types';

/**
 * Hook to fetch all API keys
 */
export function useAPIKeys() {
  return useQuery<APIKey[]>({
    queryKey: QUERY_KEYS.API_KEYS,
    queryFn: () => apiKeysService.getAPIKeys(),
  });
}

/**
 * Hook to create API key
 */
export function useCreateAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAPIKeyRequest) => apiKeysService.createAPIKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.API_KEYS });
    },
  });
}

/**
 * Hook to delete API key
 */
export function useDeleteAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => apiKeysService.deleteAPIKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.API_KEYS });
    },
  });
}
