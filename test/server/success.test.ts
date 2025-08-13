import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

vi.mock('better-auth/api', () => {
  class APIError extends Error {
    status: number;
    code?: string;
    constructor(code: string, init: any = {}) {
      super(init?.message ?? code);
      this.code = init?.code ?? code;
      const map: Record<string, number> = {
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        INTERNAL_SERVER_ERROR: 500,
      };
      this.status = map[code] ?? 500;
    }
  }
  return {
    APIError,
    createAuthEndpoint: (path: string, options: any, handler: any) => ({
      path,
      options,
      handler,
    }),
  };
});

async function importPlugin() {
  const mod = await import('../../src/server');
  return mod.credentialsPlugin;
}

function makeCtx(overrides: Partial<any> = {}) {
  const request = new Request('http://localhost/credentials/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'x' }),
  });

  return {
    request,
    context: {
      internalAdapter: {
        getUserByEmail: async () => null,
        createUser: async (u: any) => ({ id: '1', email: u.email }),
        createSession: async () => ({ token: 'tok' }),
      },
      createAuthCookie: () => ({
        name: 'auth_session',
        attributes: { httpOnly: true, path: '/' },
      }),
    },
    json: async (body: any, init?: any) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
    ...overrides,
  } as any;
}

describe('credentialsPlugin - success paths', () => {
  it('200 + Set-Cookie on successful verify and create', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx();
    const res = await endpoint.handler(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeTruthy();
  });

  it('respects custom path and input schema', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      path: '/api/credentials/login',
      inputSchema: z.object({ username: z.string(), password: z.string() }),
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    expect((plugin as any).endpoints.signIn.path).toBe(
      '/api/credentials/login'
    );
  });

  it('normalizes full path including base to relative path', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      path: '/api/auth/sign-in/credentials',
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    expect((plugin as any).endpoints.signIn.path).toBe('/sign-in/credentials');
  });

  it('forwards onSessionData and sessionExpiresIn', async () => {
    const credentialsPlugin = await importPlugin();
    let captured: any = undefined;
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
      sessionExpiresIn: 1234,
      onSessionData: async () => ({ foo: 'bar' }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({
      context: {
        internalAdapter: {
          getUserByEmail: async () => ({ id: '42', email: 'a@b.com' }),
          createSession: async (_userId: any, data: any) => {
            captured = data;
            return { token: 'tok' };
          },
        },
        createAuthCookie: () => ({ name: 'auth', attributes: { path: '/' } }),
      },
    });
    const res = await endpoint.handler(ctx);
    expect(res.status).toBe(200);
    expect(captured?.data).toEqual({ foo: 'bar' });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=1234');
  });
});
