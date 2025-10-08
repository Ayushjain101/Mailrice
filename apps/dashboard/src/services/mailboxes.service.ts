import { api } from './api';
import { API_ENDPOINTS } from '../utils/constants';
import type {
  Mailbox,
  CreateMailboxRequest,
  UpdateMailboxPasswordRequest,
  UpdateMailboxRequest,
} from '../types/mailbox.types';

export const mailboxesService = {
  /**
   * Get all mailboxes
   */
  async getMailboxes(workspaceId?: number, domainId?: number): Promise<Mailbox[]> {
    const params = new URLSearchParams();
    if (workspaceId) params.append('workspace_id', workspaceId.toString());
    if (domainId) params.append('domain_id', domainId.toString());

    const response = await api.get<Mailbox[]>(
      `${API_ENDPOINTS.MAILBOXES}${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Get mailbox by ID
   */
  async getMailbox(id: number): Promise<Mailbox> {
    const response = await api.get<Mailbox>(`${API_ENDPOINTS.MAILBOXES}/${id}`);
    return response.data;
  },

  /**
   * Create new mailbox
   */
  async createMailbox(data: CreateMailboxRequest): Promise<Mailbox> {
    const response = await api.post<Mailbox>(API_ENDPOINTS.MAILBOXES, data);
    return response.data;
  },

  /**
   * Update mailbox
   */
  async updateMailbox(id: number, data: UpdateMailboxRequest): Promise<Mailbox> {
    const response = await api.put<Mailbox>(`${API_ENDPOINTS.MAILBOXES}/${id}`, data);
    return response.data;
  },

  /**
   * Update mailbox password
   */
  async updatePassword(id: number, data: UpdateMailboxPasswordRequest): Promise<void> {
    await api.put(API_ENDPOINTS.MAILBOX_PASSWORD(id), data);
  },

  /**
   * Delete mailbox
   */
  async deleteMailbox(id: number): Promise<void> {
    await api.delete(`${API_ENDPOINTS.MAILBOXES}/${id}`);
  },
};
