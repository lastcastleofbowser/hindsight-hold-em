import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { handleApi } from '../api';
import { Auth } from '../auth';
import { Store } from '../db';
import { History } from '../history';

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('account API email flows', () => {
  it('registers, verifies email, requests a reset, and accepts the new password', async () => {
    const store = await Store.open(null);
    const verificationMail: string[] = [];
    const resetMail: string[] = [];
    const auth = new Auth(store, {
      sendEmailVerification: async (_email, url) => { verificationMail.push(url); },
      sendPasswordReset: async (_email, url) => { resetMail.push(url); },
    }, 'http://localhost');
    const history = new History(store);
    const server = createServer((req, res) => {
      void handleApi(req, res, new URL(req.url ?? '/', 'http://localhost').pathname, auth, history);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const register = await fetch(`${base}/api/register`, json({ username: 'ApiUser', email: 'api@example.com', password: 'oldpassword' }));
      expect(register.status).toBe(201);
      const registered = await register.json() as { token: string; user: { emailVerified: boolean } };
      expect(registered.user.emailVerified).toBe(false);

      const resetBeforeVerify = await fetch(`${base}/api/password-reset/request`, json({ email: 'api@example.com' }));
      expect(resetMail).toHaveLength(0);
      expect((await resetBeforeVerify.json() as { message: string }).message).toContain('If an account exists');

      const verifyToken = new URL(verificationMail[0]).searchParams.get('verify');
      const verify = await fetch(`${base}/api/email-verification/complete`, json({ token: verifyToken }));
      expect(verify.status).toBe(200);

      const requestReset = await fetch(`${base}/api/password-reset/request`, json({ email: 'API@example.com' }));
      expect(requestReset.status).toBe(200);
      const resetToken = new URL(resetMail[0]).searchParams.get('reset');
      const reset = await fetch(`${base}/api/password-reset/complete`, json({ token: resetToken, password: 'newpassword' }));
      expect(reset.status).toBe(200);

      const login = await fetch(`${base}/api/login`, json({ username: 'ApiUser', password: 'newpassword' }));
      expect(login.status).toBe(200);
      expect((await login.json() as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);
      const oldLogin = await fetch(`${base}/api/login`, json({ username: 'ApiUser', password: 'oldpassword' }));
      expect(oldLogin.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
