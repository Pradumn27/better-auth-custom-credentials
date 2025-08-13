export type CookieAttrs = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
};

export function serializeCookie(
  name: string,
  value: string,
  attrs: CookieAttrs = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (attrs.maxAge != null) parts.push(`Max-Age=${Math.floor(attrs.maxAge)}`);
  if (attrs.expires) parts.push(`Expires=${attrs.expires.toUTCString()}`);
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  parts.push(`Path=${attrs.path ?? '/'}`);

  if (attrs.secure) parts.push('Secure');
  if (attrs.httpOnly) parts.push('HttpOnly');

  if (attrs.sameSite) {
    parts.push(
      attrs.sameSite === 'lax'
        ? 'SameSite=Lax'
        : attrs.sameSite === 'strict'
        ? 'SameSite=Strict'
        : 'SameSite=None'
    );
  }

  return parts.join('; ');
}
