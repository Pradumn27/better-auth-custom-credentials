export type CredentialsClientOptions = {
  path?: string; // server plugin relative path (default: "/credentials/sign-in")
  basePath?: string; // Better Auth mount base (default: "/api/auth")
};

export type CredentialsSignIn = (
  body: Record<string, unknown>,
  init?: RequestInit
) => Promise<any>;

export type CredentialsAugmentation = {
  signIn: {
    credentials: CredentialsSignIn;
  };
};

export function extendAuthClientWithCredentials<T extends Record<string, any>>(
  client: T,
  opts: CredentialsClientOptions = {}
): T & CredentialsAugmentation {
  const normalizePath = (p?: string): string => {
    const base = opts.basePath ?? '/api/auth';
    // If full URL provided, use as-is
    if (p && /^(https?:)?\/\//i.test(p)) return p;
    const provided = p ?? '/credentials/sign-in';
    // If caller already provided an absolute API path, use it
    if (provided.startsWith('/api/')) {
      return provided.replace(/\/+?/g, '/');
    }
    // Otherwise, treat as relative to Better Auth base
    const joined = `${base.replace(/\/+?$/g, '')}/${provided.replace(
      /^\/+?/g,
      ''
    )}`;
    return joined.replace(/\/+?/g, '/');
  };
  const path = normalizePath(opts.path);

  const signIn = (client as any).signIn ?? {};
  (client as any).signIn = signIn;
  signIn.credentials = async (
    body: Record<string, unknown>,
    init?: RequestInit
  ) => {
    const fetcher: any = (client as any).fetch ?? (globalThis as any).fetch;
    if (typeof fetcher !== 'function') {
      throw new Error('No fetch available on client or global');
    }
    const res = await fetcher(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...init,
    });

    if (!res.ok) {
      let msg = 'Invalid credentials';
      try {
        const j = await res.json();
        msg = (j as any)?.error ?? msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }

    return res.json().catch(() => ({}));
  };

  return client as T & CredentialsAugmentation;
}

export async function signInWithCredentials(
  endpoint: string,
  body: Record<string, unknown>,
  init?: RequestInit
) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    let msg = 'Invalid credentials';
    try {
      const j = await res.json();
      msg = (j as any)?.error ?? msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}
