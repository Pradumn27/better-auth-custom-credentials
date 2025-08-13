import { createAuthEndpoint, APIError } from 'better-auth/api';
import { z } from 'zod';

// src/server.ts

// src/cookies.ts
function serializeCookie(name, value, attrs = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (attrs.maxAge != null) parts.push(`Max-Age=${Math.floor(attrs.maxAge)}`);
  if (attrs.expires) parts.push(`Expires=${attrs.expires.toUTCString()}`);
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  parts.push(`Path=${attrs.path ?? "/"}`);
  if (attrs.secure) parts.push("Secure");
  if (attrs.httpOnly) parts.push("HttpOnly");
  if (attrs.sameSite) {
    parts.push(
      attrs.sameSite === "lax" ? "SameSite=Lax" : attrs.sameSite === "strict" ? "SameSite=Strict" : "SameSite=None"
    );
  }
  return parts.join("; ");
}

// src/server.ts
var defaultSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional()
});
function credentialsPlugin(opts) {
  const path = opts.path ?? "/credentials/sign-in";
  const inputSchema = opts.inputSchema ?? defaultSchema;
  const autoSignUp = opts.autoSignUp ?? true;
  return {
    id: "credentials",
    endpoints: {
      signIn: createAuthEndpoint(path, { method: "POST" }, async (ctx) => {
        const req = ctx.request;
        if (!req)
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "INTERNAL_SERVER_ERROR"
          });
        const { adapter, internalAdapter, createAuthCookie, session, logger } = ctx.context;
        let body = {};
        try {
          body = await req.json();
        } catch {
        }
        const parsed = inputSchema.safeParse(body);
        if (!parsed.success) {
          throw new APIError("BAD_REQUEST", {
            message: "INVALID_INPUT",
            cause: parsed.error.flatten()
          });
        }
        const input = parsed.data;
        const verifyRes = await opts.verify({ input, req });
        if (!verifyRes.ok) {
          throw new APIError("UNAUTHORIZED", {
            message: verifyRes.reason ?? "INVALID_CREDENTIALS",
            code: verifyRes.code ?? "INVALID_CREDENTIALS"
          });
        }
        const email = verifyRes.user.email;
        if (!email) {
          throw new APIError("BAD_REQUEST", {
            message: "Verifier must return user.email"
          });
        }
        let user = await internalAdapter.getUserByEmail?.(email);
        if (!user && !autoSignUp) {
          throw new APIError("UNAUTHORIZED", {
            message: "USER_NOT_FOUND"
          });
        }
        if (!user) {
          try {
            user = await internalAdapter.createUser?.({
              email,
              name: verifyRes.user.name ?? email.split("@")[0],
              image: null,
              emailVerified: true
            });
          } catch (e) {
            logger?.error?.("credentials:createUser_failed", e);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "FAILED_TO_CREATE_USER"
            });
          }
        }
        if (!user) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "USER_CREATION_FAILED"
          });
        }
        const now = Date.now();
        const defaultExpSec = opts.sessionExpiresIn ?? 60 * 60 * 24 * 7;
        const remember = input.rememberMe === true;
        const expiresInSec = remember ? defaultExpSec : defaultExpSec;
        const expiresAt = new Date(now + expiresInSec * 1e3);
        let sessionData = void 0;
        if (opts.onSessionData) {
          sessionData = await opts.onSessionData({
            verified: verifyRes,
            userRecord: { id: user.id, email: user.email },
            req
          });
        }
        const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
        const ua = req.headers.get("user-agent") ?? null;
        const created = await internalAdapter.createSession?.(
          user.id,
          {
            expiresAt,
            ipAddress: ip,
            userAgent: ua,
            data: sessionData
          }
        );
        if (!created) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "FAILED_TO_CREATE_SESSION"
          });
        }
        const cookieCfg = createAuthCookie("session_token");
        const cookie = serializeCookie(cookieCfg.name, created.token, {
          ...cookieCfg.attributes,
          // keep in sync with session expiration
          maxAge: expiresInSec,
          expires: expiresAt,
          sameSite: "lax"
        });
        return ctx.json(
          {
            ok: true,
            userId: user.id
          },
          { status: 200, headers: { "Set-Cookie": cookie } }
        );
      })
    }
  };
}

// src/client.ts
function extendAuthClientWithCredentials(client, opts = {}) {
  const path = opts.path ?? "/credentials/sign-in";
  const signIn = client.signIn ?? {};
  client.signIn = signIn;
  signIn.credentials = async (body, init) => {
    const res = await client.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...init
    });
    if (!res.ok) {
      let msg = "Invalid credentials";
      try {
        const j = await res.json();
        msg = j?.error ?? msg;
      } catch {
      }
      throw new Error(msg);
    }
    return res.json().catch(() => ({}));
  };
  return client;
}
async function signInWithCredentials(endpoint, body, init) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init
  });
  if (!res.ok) {
    let msg = "Invalid credentials";
    try {
      const j = await res.json();
      msg = j?.error ?? msg;
    } catch {
    }
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

export { credentialsPlugin, extendAuthClientWithCredentials, signInWithCredentials };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map