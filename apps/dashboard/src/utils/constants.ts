export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Mailrice Dashboard';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.0.0';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const TOKEN_KEY = 'mailrice_token';
export const USER_KEY = 'mailrice_user';

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  DOMAINS: '/domains',
  MAILBOXES: '/mailboxes',
  API_KEYS: '/api-keys',
  SETTINGS: '/settings',
} as const;

export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  HEALTH: '/health',
  DOMAINS: '/domains',
  MAILBOXES: '/mailboxes',
  API_KEYS: '/apikeys',
  DNS_RECORDS: (domainId: number) => `/domains/${domainId}/dns-records`,
  ROTATE_DKIM: (domainId: number) => `/domains/${domainId}/rotate-dkim`,
  MAILBOX_PASSWORD: (mailboxId: number) => `/mailboxes/${mailboxId}/password`,
} as const;

export const QUERY_KEYS = {
  DOMAINS: ['domains'],
  DOMAIN: (id: number) => ['domains', id],
  DNS_RECORDS: (id: number) => ['domains', id, 'dns'],
  MAILBOXES: ['mailboxes'],
  MAILBOX: (id: number) => ['mailboxes', id],
  API_KEYS: ['apikeys'],
  HEALTH: ['health'],
} as const;
