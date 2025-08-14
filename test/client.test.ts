import { describe, it, expect, vi } from 'vitest';
import {
  extendAuthClientWithCredentials,
  signInWithCredentials,
} from '../src/client';

describe('client helpers', () => {
  it('extendAuthClientWithCredentials adds signIn.credentials', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const base = { fetch: fetchMock } as any;
    const client = extendAuthClientWithCredentials(base);
    expect(typeof client.signIn.credentials).toBe('function');
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('signInWithCredentials throws on error', async () => {
    const server = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response('no', { status: 401 })
    ) as any;
    await expect(
      signInWithCredentials('/sign-in/credentials', {
        email: 'a@b.com',
        password: 'x',
      })
    ).rejects.toThrowError();
    globalThis.fetch = server as any;
  });

  it('uses custom path when provided', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = extendAuthClientWithCredentials({ fetch: fetchMock } as any);
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/sign-in/credentials',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
