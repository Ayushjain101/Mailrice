export interface Mailbox {
  id: number;
  workspace_id: number;
  domain_id: number;
  local_part: string;
  email: string;
  quota_mb: number;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateMailboxRequest {
  workspace_id: number;
  domain_id: number;
  local_part: string;
  password: string;
  quota_mb?: number;
}

export interface UpdateMailboxPasswordRequest {
  new_password: string;
}

export interface UpdateMailboxRequest {
  quota_mb?: number;
  enabled?: boolean;
}
