import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './useAuth';

afterEach(() => vi.unstubAllGlobals());

describe('auth API errors', () => {
  it('explains when the development account server is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('http proxy error', {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    })));

    await expect(api('/register', { method: 'POST', body: { username: 'Taylor', password: 'password123' } }))
      .rejects.toMatchObject({
        message: expect.stringContaining('npm run server'),
        status: 500,
      });
  });

  it('keeps the server message for account validation failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Passwords need at least 8 characters.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(api('/register', { method: 'POST', body: { username: 'Taylor', password: 'short' } }))
      .rejects.toMatchObject({
        message: 'Passwords need at least 8 characters.',
        status: 400,
      } satisfies Partial<ApiError>);
  });
});