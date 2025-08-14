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

function makeCtx(body: any) {
  const request = new Request('http://localhost/sign-in/credentials/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  } as any;
}

describe('credentialsPlugin - failure paths', () => {
  it('400 on schema mismatch', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      inputSchema: z.object({ username: z.string(), password: z.string() }),
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(400);
  });

  it('401 when verify returns ok:false', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: false, reason: 'NOPE', code: 'NOPE' }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(401);
  });

  it('400 when verify ok but missing user.email', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: '' as any } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(400);
  });

  it('401 when autoSignUp=false and user not found', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
      autoSignUp: false,
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(401);
  });

  it('500 when createUser fails', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    // override createUser to throw
    ctx.context.internalAdapter.createUser = async () => {
      throw new Error('fail');
    };
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(500);
  });

  it('recovers from duplicate email race by refetching', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'A@B.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'A@B.com', password: 'x' });
    // Simulate duplicate key on first create, then user appears
    let first = true;
    ctx.context.internalAdapter.createUser = async () => {
      if (first) {
        first = false;
        const err: any = new Error('duplicate key value');
        err.code = '23505';
        throw err;
      }
      return { id: '1', email: 'a@b.com' };
    };
    ctx.context.internalAdapter.findUserByEmail = async () =>
      first ? { user: null } : { user: { id: '1', email: 'a@b.com' } };
    const res = await endpoint.handler(ctx);
    expect(res.status).toBe(200);
  });

  it('500 when createSession fails', async () => {
    const credentialsPlugin = await importPlugin();
    const plugin = credentialsPlugin({
      verify: async () => ({ ok: true, user: { email: 'a@b.com' } }),
    });
    const endpoint = (plugin as any).endpoints.signIn;
    const ctx = makeCtx({ email: 'a@b.com', password: 'x' });
    ctx.context.internalAdapter.createUser = async (u: any) => ({
      id: '1',
      email: u.email,
    });
    ctx.context.internalAdapter.createSession = async () => ({
      id: null as any,
    });
    const err = await endpoint.handler(ctx).catch((e: any) => e);
    expect(err.status).toBe(500);
  });
});
