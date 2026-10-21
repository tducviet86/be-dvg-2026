export type AuthUser = {
  id: string;
  email: string;
  name: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  /** cookie: browser session (CSRF enforced); bearer: API client. */
  via: 'cookie' | 'bearer';
};
