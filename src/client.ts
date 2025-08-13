export type CredentialsClientOptions = {
  path?: string; // must match server plugin path (default: "/credentials/sign-in")
};

type HasFetch = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

export function extendAuthClientWithCredentials<
  T extends HasFetch & Record<string, any>
>(client: T, opts: CredentialsClientOptions = {}): T {
  const path = opts.path ?? '/credentials/sign-in';

  const signIn = (client as any).signIn ?? {};
  (client as any).signIn = signIn;
  signIn.credentials = async (
    body: Record<string, unknown>,
    init?: RequestInit
  ) => {
    const res = await client.fetch(path, {
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

  return client;
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
