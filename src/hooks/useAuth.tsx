import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AccountUser, AuthResponse } from '../friends/protocol';

/**
 * Accounts (online only). The session token is kept in this browser and sent
 * as a Bearer header to the server's /api routes and on the Friends socket.
 * Training tabs never need an account.
 */

const TOKEN_KEY = 'hindsight-holdem.auth.v1';

export type AuthStatus = 'checking' | 'ready' | 'unreachable';

interface AuthApi {
  user: AccountUser | null;
  token: string | null;
  status: AuthStatus;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Forget a token the server says is no longer valid. */
  expire: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the login lasts until the page closes.
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Calls the server's JSON API. Network failures become a friendly ApiError with status 0. */
export async function api<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the account server. In local development, run `npm run server` in a second terminal.", 0);
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data: { error?: string } = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const message = data.error ?? (res.status >= 500
      ? `The account server returned an unreadable response (HTTP ${res.status}). In local development, run \`npm run server\` in a second terminal.`
      : `The account server returned an unexpected response (HTTP ${res.status}).`);
    throw new ApiError(message, res.status);
  }
  if (!isJson) throw new ApiError('The account server returned an unreadable response. Please check the server and try again.', res.status);
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(token ? 'checking' : 'ready');

  // Check a saved token once on load.
  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    api<{ user: AccountUser }>('/me', { token })
      .then((r) => !cancelled && (setUser(r.user), setStatus('ready')))
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 401) {
          writeToken(null);
          setToken(null);
          setStatus('ready');
        } else setStatus('unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const accept = useCallback((r: AuthResponse) => {
    writeToken(r.token);
    setToken(r.token);
    setUser(r.user);
    setStatus('ready');
  }, []);

  const login = useCallback(async (username: string, password: string) => accept(await api<AuthResponse>('/login', { method: 'POST', body: { username, password } })), [accept]);
  const register = useCallback(async (username: string, password: string) => accept(await api<AuthResponse>('/register', { method: 'POST', body: { username, password } })), [accept]);
  const expire = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);
  const logout = useCallback(async () => {
    const old = token;
    expire();
    if (old) await api('/logout', { method: 'POST', token: old }).catch(() => {});
  }, [token, expire]);

  const value = useMemo(() => ({ user, token, status, login, register, logout, expire }), [user, token, status, login, register, logout, expire]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
