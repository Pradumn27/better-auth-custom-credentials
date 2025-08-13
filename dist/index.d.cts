import { BetterAuthPlugin } from 'better-auth';
import { z } from 'zod';

type VerifyResult = {
    ok: true;
    user: {
        email: string;
        name?: string | null;
        id?: string | number;
    };
    meta?: Record<string, unknown>;
} | {
    ok: false;
    reason?: string;
    code?: string;
};
type VerifyFn = (args: {
    input: Record<string, unknown>;
    req: Request;
}) => Promise<VerifyResult>;
type CredentialsPluginOptions = {
    /**
     * POST path for credentials sign-in
     * Use a unique, namespaced path to avoid conflicts with other plugins
     */
    path?: string;
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
        verified: Extract<VerifyResult, {
            ok: true;
        }>;
        userRecord: {
            id: string | number;
            email: string;
        };
        req: Request;
    }) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
    /**
     * Override session expiry in seconds (by default uses Better Auth config `session.expiresIn`)
     */
    sessionExpiresIn?: number;
};
declare function credentialsPlugin(opts: CredentialsPluginOptions): BetterAuthPlugin;

type CredentialsClientOptions = {
    path?: string;
};
type HasFetch = {
    fetch: (path: string, init?: RequestInit) => Promise<Response>;
};
declare function extendAuthClientWithCredentials<T extends HasFetch & Record<string, any>>(client: T, opts?: CredentialsClientOptions): T;
declare function signInWithCredentials(endpoint: string, body: Record<string, unknown>, init?: RequestInit): Promise<any>;

export { type CredentialsClientOptions, type CredentialsPluginOptions, type VerifyFn, type VerifyResult, credentialsPlugin, extendAuthClientWithCredentials, signInWithCredentials };
