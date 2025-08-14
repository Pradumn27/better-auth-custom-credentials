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

vi.mock('better-auth/cookies', () => ({
  setSessionCookie: vi.fn().mockResolvedValue(undefined),
}));

async function importPlugin() {
  const mod = await import('../../src/server');
  return mod.credentialsPlugin;
}

function makeCtx(overrides: Partial<any> = {}) {
  const request = new Request('http://localhost/sign-in/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'x' }),
  });

  return {
    request,
    context: {
      internalAdapter: {
        findUserByEmail: async () => ({ user: null }),
        createUser: async (u: any) => ({ id: '1', email: u.email }),
        createSession: async () => ({ id: 'session1' }),
      },
      adapter: {
        findUserByEmail: async () => null,
      },
      createAuthCookie: () => ({
        name: 'auth_session',
        attributes: { httpOnly: true, path: '/' },
      }),
      logger: {
        error: vi.fn(),
      },
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
  });

  it('accepts application/x-www-form-urlencoded', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      inputSchema: z.object({ email: z.string().email(), otp: z.string() }),
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const body = new URLSearchParams({
      email: 'a@b.com',
      otp: '123456',
    }).toString();
    const ctx = makeCtx({
      request: new Request('http://localhost/sign-in/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    });
    const res = await endpoint.handler(ctx);
    expect(res.status).toBe(200);
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
          findUserByEmail: async () => ({ user: null }),
          createUser: async (u: any) => ({ id: '42', email: u.email }),
          createSession: async (
            _userId: any,
            _ctx: any,
            _dont: any,
            override: any
          ) => {
            captured = override;
            return { id: 'session1' };
          },
        },
        adapter: {
          findUserByEmail: async () => null,
        },
        createAuthCookie: () => ({ name: 'auth', attributes: { path: '/' } }),
        logger: { error: vi.fn() },
      },
    });
    const res = await endpoint.handler(ctx);
    expect(res.status).toBe(200);
    expect(captured?.foo).toEqual('bar');
  });
});
