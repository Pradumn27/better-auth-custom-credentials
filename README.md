# better-auth-custom-credentials

A Credentials (NextAuth-like) plugin for Better Auth. Adds a `POST /credentials/sign-in` endpoint and `authClient.signIn.credentials(...)`.

## Install

pnpm add better-auth-custom-credentials zod

## Server

````ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { credentialsPlugin } from "better-auth-custom-credentials";
import { db, authenticationSchema } from "./db";

export const auth = betterAuth({
  plugins: [
    nextCookies(),
    credentialsPlugin({
      verify: async ({ input, req }) => {
        // Example: call your backend to verify email/password
        const r = await fetch(process.env.API_URL + "/internal/login/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.API_SECRET_TOKEN}` },
          body: JSON.stringify({ email: input.email, password: input.password })
        });
        if (!r.ok) return { ok: false, reason: "INVALID_CREDENTIALS" };
        const data = await r.json();
        // Must return at least user.email; name optional
        return { ok: true, user: { email: data.user.email, name: data.user.name ?? null }, meta: data };
      },
      autoSignUp: true,
      onSessionData: async ({ verified }) => {
        // Optional: attach backend JWT (from verified.meta?) to session data
        const railsJwt = (verified.meta as any)?.jwt;
        return railsJwt ? { railsJwt } : undefined;
      }
    })
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { ...authenticationSchema, user: authenticationSchema.users }
  })
});

## Client (two options)

```ts
// lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { extendAuthClientWithCredentials, signInWithCredentials } from "better-auth-custom-credentials";

// A) Extend an existing Better Auth client instance
const authClient = extendAuthClientWithCredentials(
  createAuthClient(),
  { path: "/credentials/sign-in" }
);
await authClient.signIn.credentials({ email: "jsmith@example.com", password: "secret" });

// B) Or call the endpoint directly
await signInWithCredentials("/credentials/sign-in", { email: "jsmith@example.com", password: "secret" });
````
