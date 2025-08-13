import { describe, it, expect } from 'vitest';
import { serializeCookie } from '../src/cookies';

describe('serializeCookie', () => {
  it('serializes with defaults', () => {
    const s = serializeCookie('sid', 'abc');
    expect(s).toMatch(/^sid=abc; Path=\//);
  });

  it('includes attributes', () => {
    const expires = new Date('2030-01-01T00:00:00Z');
    const s = serializeCookie('sid', 'abc', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: 'example.com',
      path: '/auth',
      maxAge: 3600,
      expires,
    });
    expect(s).toContain('HttpOnly');
    expect(s).toContain('Secure');
    expect(s).toContain('SameSite=Lax');
    expect(s).toContain('Domain=example.com');
    expect(s).toContain('Path=/auth');
    expect(s).toContain('Max-Age=3600');
    expect(s).toContain('Expires=');
  });
});
