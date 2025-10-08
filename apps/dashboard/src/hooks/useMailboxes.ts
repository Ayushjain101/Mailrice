import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mailboxesService } from '../services/mailboxes.service';
import { QUERY_KEYS } from '../utils/constants';
import type {
  Mailbox,
  CreateMailboxRequest,
  UpdateMailboxPasswordRequest,
  UpdateMailboxRequest,
} from '../types/mailbox.types';

/**
 * Hook to fetch all mailboxes
 */
export function useMailboxes(workspaceId?: number, domainId?: number) {
  return useQuery<Mailbox[]>({
    queryKey: [...QUERY_KEYS.MAILBOXES, { workspaceId, domainId }],
    queryFn: () => mailboxesService.getMailboxes(workspaceId, domainId),
  });
}

/**
 * Hook to fetch single mailbox
 */
export function useMailbox(id: number) {
  return useQuery<Mailbox>({
    queryKey: QUERY_KEYS.MAILBOX(id),
    queryFn: () => mailboxesService.getMailbox(id),
    enabled: !!id,
  });
}

/**
 * Hook to create mailbox
 */
export function useCreateMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMailboxRequest) => mailboxesService.createMailbox(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MAILBOXES });
    },
  });
}

/**
 * Hook to update mailbox
 */
export function useUpdateMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateMailboxRequest }) =>
      mailboxesService.updateMailbox(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MAILBOX(variables.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MAILBOXES });
    },
  });
}

/**
 * Hook to update mailbox password
 */
export function useUpdateMailboxPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateMailboxPasswordRequest }) =>
      mailboxesService.updatePassword(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MAILBOX(variables.id) });
    },
  });
}

/**
 * Hook to delete mailbox
 */
export function useDeleteMailbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => mailboxesService.deleteMailbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MAILBOXES });
    },
  });
}
