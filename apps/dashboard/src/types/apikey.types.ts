export interface APIKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
  scopes: string[];
}

export interface CreateAPIKeyRequest {
  name: string;
  scopes?: string[];
}

export interface CreateAPIKeyResponse {
  id: number;
  name: string;
  api_key: string; // Full key, shown only once
  key_prefix: string;
  created_at: string;
  scopes: string[];
}
