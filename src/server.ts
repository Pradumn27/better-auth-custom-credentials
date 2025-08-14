import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';
import { setSessionCookie } from 'better-auth/cookies';

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
  const path = '/sign-in/credentials';
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

        const { adapter, internalAdapter, createAuthCookie, logger } =
          ctx.context;

        // Simplified body parsing
        let body: unknown = {};
        const hintedBody = (ctx as any)?.body ?? (ctx as any)?.requestBody;
        if (hintedBody && typeof hintedBody === 'object') {
          body = hintedBody;
        } else {
          try {
            const contentType =
              req.headers.get('content-type')?.toLowerCase() ?? '';
            if (contentType.includes('application/json')) {
              body = await req.json();
            } else if (
              contentType.includes('application/x-www-form-urlencoded')
            ) {
              const text = await req.text();
              const params = new URLSearchParams(text);
              body = Object.fromEntries(params.entries());
            } else {
              // Fallback to JSON
              body = await req.json().catch(() => ({}));
            }
          } catch {
            body = {};
          }
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

        const rawEmail = verifyRes.user.email;
        if (!rawEmail) {
          throw new APIError('BAD_REQUEST', {
            message: 'Verifier must return user.email',
          });
        }
        const email = String(rawEmail).trim().toLowerCase();

        async function fetchUserByEmail(e: string) {
          return (
            (await (internalAdapter as any).findUserByEmail?.(e)).user ??
            (await (adapter as any)?.findUserByEmail?.(e)) ??
            null
          );
        }

        let user = await fetchUserByEmail(email);

        if (!user && !autoSignUp) {
          throw new APIError('UNAUTHORIZED', {
            message: 'USER_NOT_FOUND',
          });
        }

        const isUniqueViolation = (err: unknown): boolean => {
          const anyErr = err as any;
          return (
            anyErr?.code === '23505' ||
            (typeof anyErr?.message === 'string' &&
              (anyErr.message.includes('duplicate key value') ||
                anyErr.message.includes('UNIQUE constraint failed')))
          );
        };

        if (!user) {
          try {
            user = await (internalAdapter as any).createUser?.({
              email,
              name: verifyRes.user.name ?? email.split('@')[0],
              image: null,
              emailVerified: true,
            });
          } catch (e) {
            logger.error('credentials:createUser_failed', e as any);
            if (isUniqueViolation(e)) {
              for (let attempt = 0; attempt < 3 && !user; attempt++) {
                await new Promise((r) => setTimeout(r, 50));
                user = await fetchUserByEmail(email);
              }
            }
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'FAILED_TO_CREATE_USER',
              });
            }
          }
        }

        if (!user) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'USER_CREATION_FAILED',
          });
        }

        const now = Date.now();
        const defaultExpSec = opts.sessionExpiresIn ?? 60 * 60 * 24 * 7;
        const remember = (input as any).rememberMe === true;
        const expiresInSec = remember ? defaultExpSec : defaultExpSec;
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

        const created = await internalAdapter.createSession(
          String(user.id),
          ctx,
          !remember,
          {
            expiresAt,
            ipAddress: ip,
            userAgent: ua,
            ...sessionData,
          },
          false
        );

        if (!created.id) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'FAILED_TO_CREATE_SESSION',
          });
        }

        await setSessionCookie(ctx, {
          session: created,
          user,
        });

        return ctx.json({
          ok: true,
          userId: user.id,
        });
      }),
    },
  };
}
