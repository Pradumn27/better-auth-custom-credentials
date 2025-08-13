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
      signInWithCredentials('/credentials/sign-in', {
        email: 'a@b.com',
        password: 'x',
      })
    ).rejects.toThrowError();
    globalThis.fetch = server;
  });

  it('uses custom path when provided', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = extendAuthClientWithCredentials(
      { fetch: fetchMock } as any,
      {
        path: '/api/credentials/login',
      }
    );
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/credentials/login',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('defaults to /api/auth/sign-in/credentials when no path provided', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = extendAuthClientWithCredentials({ fetch: fetchMock } as any);
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/sign-in/credentials');
  });

  it('prefixes relative path with basePath', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = extendAuthClientWithCredentials(
      { fetch: fetchMock } as any,
      {
        path: '/sign-in/credentials',
        basePath: '/api/auth',
      }
    );
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/sign-in/credentials');
  });

  it('uses absolute URL path as-is', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = extendAuthClientWithCredentials(
      { fetch: fetchMock } as any,
      {
        path: 'https://example.com/api/auth/sign-in/credentials',
      }
    );
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.com/api/auth/sign-in/credentials'
    );
  });

  it('falls back to global fetch when client has no fetch', async () => {
    const original = globalThis.fetch;
    const gfetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = gfetch as any;
    const client = extendAuthClientWithCredentials({} as any);
    await client.signIn.credentials({ email: 'a@b.com', password: 'x' });
    expect(gfetch).toHaveBeenCalledOnce();
    globalThis.fetch = original;
  });
});
