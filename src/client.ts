export type CredentialsClientOptions = {
  path?: string; // must match server plugin path (default: "/credentials/sign-in")
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
  const path = opts.path ?? '/credentials/sign-in';

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
