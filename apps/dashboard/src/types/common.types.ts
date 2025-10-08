export interface HealthResponse {
  status: string;
  database: string;
  version: string;
}

export interface ErrorResponse {
  detail: string;
  status_code?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
