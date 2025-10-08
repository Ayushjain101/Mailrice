export interface Domain {
  id: number;
  workspace_id: number;
  domain: string;
  hostname: string;
  dkim_selector: string;
  dkim_public_key: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateDomainRequest {
  workspace_id: number;
  domain: string;
  hostname: string;
  dkim_selector?: string;
}

export interface DNSRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  ttl?: number;
}

export interface DNSRecordsResponse {
  domain: string;
  records: DNSRecord[];
}

export interface RotateDKIMRequest {
  new_selector: string;
}

export interface RotateDKIMResponse {
  domain: string;
  new_selector: string;
  new_public_key: string;
  old_selector: string;
  message: string;
}
