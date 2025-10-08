import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { domainsService } from '../services/domains.service';
import { QUERY_KEYS } from '../utils/constants';
import type {
  Domain,
  CreateDomainRequest,
  DNSRecordsResponse,
  RotateDKIMRequest,
} from '../types/domain.types';

/**
 * Hook to fetch all domains
 */
export function useDomains() {
  return useQuery<Domain[]>({
    queryKey: QUERY_KEYS.DOMAINS,
    queryFn: () => domainsService.getDomains(),
  });
}

/**
 * Hook to fetch single domain
 */
export function useDomain(id: number) {
  return useQuery<Domain>({
    queryKey: QUERY_KEYS.DOMAIN(id),
    queryFn: () => domainsService.getDomain(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch DNS records for domain
 */
export function useDNSRecords(domainId: number) {
  return useQuery<DNSRecordsResponse>({
    queryKey: QUERY_KEYS.DNS_RECORDS(domainId),
    queryFn: () => domainsService.getDNSRecords(domainId),
    enabled: !!domainId,
  });
}

/**
 * Hook to create domain
 */
export function useCreateDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDomainRequest) => domainsService.createDomain(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DOMAINS });
    },
  });
}

/**
 * Hook to delete domain
 */
export function useDeleteDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => domainsService.deleteDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DOMAINS });
    },
  });
}

/**
 * Hook to rotate DKIM key
 */
export function useRotateDKIM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domainId, data }: { domainId: number; data: RotateDKIMRequest }) =>
      domainsService.rotateDKIM(domainId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DOMAIN(variables.domainId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DNS_RECORDS(variables.domainId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DOMAINS });
    },
  });
}
