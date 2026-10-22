import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Auth, AuthError, type User } from './auth';
import type { History } from './history';

/**
 * JSON API for accounts and history:
 *   POST /api/register  { username, email, password } → { user, token }
 *   POST /api/password-reset/request { email }
 *   POST /api/password-reset/complete { token, password }
 *   POST /api/email-verification/request (Authorization: Bearer <token>)
 *   POST /api/email-verification/complete { token }
 *   POST /api/login     { username, password } → { user, token }
 *   POST /api/logout                            (Authorization: Bearer <token>)
 *   GET  /api/me                                → { user }
 *   GET  /api/profile                           → Profile
 * Tokens are sent in the Authorization header (never cookies), so the API
 * isn't exposed to cross-site request forgery.
 */

const MAX_BODY = 10 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return reject(new AuthError('Expected JSON.', 415));
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AuthError('Request too large.', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new AuthError('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export const bearer = (req: IncomingMessage) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';

export function clientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Handles /api/* requests. Returns false if the path isn't an API route. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, path: string, auth: Auth, history: History): Promise<boolean> {
  if (!path.startsWith('/api/')) return false;
  const requireUser = (): User => {
    const user = auth.userForToken(bearer(req));
    if (!user) throw new AuthError('Please log in.', 401);
    return user;
  };
  try {
    if (req.method === 'POST' && path === '/api/register') {
      const body = await readJson(req);
      send(res, 201, await auth.register(body.username, body.email, body.password));
    } else if (req.method === 'POST' && path === '/api/password-reset/request') {
      const body = await readJson(req);
      send(res, 200, { message: await auth.requestPasswordReset(body.email, clientIp(req)) });
    } else if (req.method === 'POST' && path === '/api/password-reset/complete') {
      const body = await readJson(req);
      await auth.resetPassword(body.token, body.password);
      send(res, 200, { ok: true });
    } else if (req.method === 'POST' && path === '/api/email-verification/request') {
      const body = await readJson(req);
      send(res, 200, { message: await auth.requestEmailVerification(requireUser().id, body.email) });
    } else if (req.method === 'POST' && path === '/api/email-verification/complete') {
      const body = await readJson(req);
      auth.verifyEmail(body.token);
      send(res, 200, { ok: true });
    } else if (req.method === 'POST' && path === '/api/login') {
      const body = await readJson(req);
      send(res, 200, await auth.login(body.username, body.password, clientIp(req)));
    } else if (req.method === 'POST' && path === '/api/logout') {
      auth.logout(bearer(req));
      send(res, 200, { ok: true });
    } else if (req.method === 'GET' && path === '/api/me') {
      send(res, 200, { user: requireUser() });
    } else if (req.method === 'GET' && path === '/api/profile') {
      send(res, 200, history.profile(requireUser().id));
    } else {
      send(res, 404, { error: 'Not found.' });
    }
  } catch (err) {
    if (err instanceof AuthError) send(res, err.status, { error: err.message });
    else {
      console.error(err);
      send(res, 500, { error: 'Something went wrong.' });
    }
  }
  return true;
}
