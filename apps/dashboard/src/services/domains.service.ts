import { api } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type {
  Domain,
  CreateDomainRequest,
  DNSRecordsResponse,
  RotateDKIMRequest,
  RotateDKIMResponse,
} from '../types/domain.types';

export const domainsService = {
  /**
   * Get all domains
   */
  async getDomains(): Promise<Domain[]> {
    const response = await api.get<Domain[]>(API_ENDPOINTS.DOMAINS);
    return response.data;
  },

  /**
   * Get domain by ID
   */
  async getDomain(id: number): Promise<Domain> {
    const response = await api.get<Domain>(`${API_ENDPOINTS.DOMAINS}/${id}`);
    return response.data;
  },

  /**
   * Create new domain
   */
  async createDomain(data: CreateDomainRequest): Promise<Domain> {
    const response = await api.post<Domain>(API_ENDPOINTS.DOMAINS, data);
    return response.data;
  },

  /**
   * Delete domain
   */
  async deleteDomain(id: number): Promise<void> {
    await api.delete(`${API_ENDPOINTS.DOMAINS}/${id}`);
  },

  /**
   * Get DNS records for domain
   */
  async getDNSRecords(id: number): Promise<DNSRecordsResponse> {
    const response = await api.get<DNSRecordsResponse>(API_ENDPOINTS.DNS_RECORDS(id));
    return response.data;
  },

  /**
   * Rotate DKIM key
   */
  async rotateDKIM(id: number, data: RotateDKIMRequest): Promise<RotateDKIMResponse> {
    const response = await api.post<RotateDKIMResponse>(API_ENDPOINTS.ROTATE_DKIM(id), data);
    return response.data;
  },
};
