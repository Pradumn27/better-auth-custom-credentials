import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, APIError } from 'better-auth/api';
import { z } from 'zod';
import { serializeCookie } from './cookies';

export type VerifyResult =
  | {
      ok: true;
      user: { email: string; name?: string | null; id?: string | number };
      // optionally anything else from your backend
      meta?: Record<string, unknown>;
    }
  | { ok: false; reason?: string; code?: string };

export type VerifyFn = (args: {
  input: Record<string, unknown>;
  req: Request;
}) => Promise<VerifyResult>;

export type CredentialsPluginOptions = {
  /**
   * POST path for credentials sign-in
   * Use a unique, namespaced path to avoid conflicts with other plugins
   */
  path?: string; // default: "/credentials/sign-in"
  /**
   * Zod schema for request body (customize your fields)
   * Default is { email, password, rememberMe? }
   */
  inputSchema?: z.ZodTypeAny;
  /**
   * Your verification callback. Do whatever you want here (call Rails, LDAP, etc).
   * Returns { ok: true, user } to sign in, or { ok: false } to reject.
   */
  verify: VerifyFn;
  /**
   * If true, automatically create the user if not found
   * Default: true
   */
  autoSignUp?: boolean;
  /**
   * Compute extra session data stored in the session row (JSONB)
   * Example: attach a Rails JWT
   */
  onSessionData?: (args: {
    verified: Extract<VerifyResult, { ok: true }>;
    userRecord: { id: string | number; email: string };
    req: Request;
  }) =>
    | Promise<Record<string, unknown> | undefined>
    | Record<string, unknown>
    | undefined;
  /**
   * Override session expiry in seconds (by default uses Better Auth config `session.expiresIn`)
   */
  sessionExpiresIn?: number;
};

const defaultSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export function credentialsPlugin(
  opts: CredentialsPluginOptions
): BetterAuthPlugin {
  const normalizePath = (p?: string): string => {
    const raw = p ?? '/sign-in/credentials';
    // Strip Better Auth default base if user passed full path
    let out = raw.replace(/^\/?api\/auth\/?/i, '/');
    // Ensure leading slash
    if (!out.startsWith('/')) out = '/' + out;
    // Collapse duplicate slashes
    out = out.replace(/\/+?/g, '/');
    return out;
  };
  const path = normalizePath(opts.path);
  const inputSchema = opts.inputSchema ?? defaultSchema;
  const autoSignUp = opts.autoSignUp ?? true;

  return {
    id: 'credentials',
    endpoints: {
      signIn: createAuthEndpoint(path, { method: 'POST' }, async (ctx) => {
        const req = ctx.request;

        if (!req)
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'INTERNAL_SERVER_ERROR',
          });

        const { adapter, internalAdapter, createAuthCookie, session, logger } =
          ctx.context;

        let body: unknown = {};
        try {
          body = await req.json();
        } catch {
          // ignore
        }

        const parsed = inputSchema.safeParse(body);
        if (!parsed.success) {
          throw new APIError('BAD_REQUEST', {
            message: 'INVALID_INPUT',
            cause: parsed.error.flatten(),
          });
        }

        const input = parsed.data as Record<string, unknown>;
        const verifyRes = await opts.verify({ input, req });

        if (!verifyRes.ok) {
          throw new APIError('UNAUTHORIZED', {
            message: verifyRes.reason ?? 'INVALID_CREDENTIALS',
            code: verifyRes.code ?? 'INVALID_CREDENTIALS',
          });
        }

        const email = verifyRes.user.email;
        if (!email) {
          throw new APIError('BAD_REQUEST', {
            message: 'Verifier must return user.email',
          });
        }

        // 1) Find or create user using Better Auth adapter/internalAdapter
        // Prefer internalAdapter to keep compatibility with BA internals
        let user = await (internalAdapter as any).getUserByEmail?.(email);

        if (!user && !autoSignUp) {
          throw new APIError('UNAUTHORIZED', {
            message: 'USER_NOT_FOUND',
          });
        }

        if (!user) {
          try {
            user = await (internalAdapter as any).createUser?.({
              email,
              name:
                (verifyRes.user.name as string | null | undefined) ??
                email.split('@')[0],
              image: null,
              emailVerified: true,
            });
          } catch (e) {
            logger?.error?.('credentials:createUser_failed', e as any);
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'FAILED_TO_CREATE_USER',
            });
          }
        }

        if (!user) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'USER_CREATION_FAILED',
          });
        }

        // 2) Create a session via internalAdapter
        const now = Date.now();
        // Determine expiry in seconds. If not provided, default to 7 days.
        const defaultExpSec = opts.sessionExpiresIn ?? 60 * 60 * 24 * 7;
        // rememberMe (if present) can extend expiry, customize as you like
        const remember = (input as any).rememberMe === true;
        const expiresInSec = remember ? defaultExpSec : defaultExpSec; // adjust if you want shorter non-remember sessions
        const expiresAt = new Date(now + expiresInSec * 1000);

        let sessionData: Record<string, unknown> | undefined = undefined;
        if (opts.onSessionData) {
          sessionData = await opts.onSessionData({
            verified: verifyRes,
            userRecord: { id: user.id, email: user.email },
            req,
          });
        }

        const ip =
          req.headers.get('x-forwarded-for') ??
          req.headers.get('cf-connecting-ip') ??
          null;
        const ua = req.headers.get('user-agent') ?? null;

        const created = await (internalAdapter as any).createSession?.(
          user.id,
          {
            expiresAt,
            ipAddress: ip,
            userAgent: ua,
            data: sessionData,
          } as any
        );

        if (!created) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'FAILED_TO_CREATE_SESSION',
          });
        }

        // 3) Set the session cookie header
        // Use Better Auth cookie config (prefix, secure, samesite, etc.)
        const cookieCfg = createAuthCookie('session_token');
        const cookie = serializeCookie(cookieCfg.name, created.token, {
          ...cookieCfg.attributes,
          // keep in sync with session expiration
          maxAge: expiresInSec,
          expires: expiresAt,
          sameSite: 'lax',
        });

        return ctx.json(
          {
            ok: true,
            userId: user.id,
          },
          { status: 200, headers: { 'Set-Cookie': cookie } as any }
        );
      }),
    },
  };
}
