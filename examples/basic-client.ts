// Minimal client example
import { createAuthClient } from 'better-auth/client';
import { extendAuthClientWithCredentials } from '../src/client';

const client = extendAuthClientWithCredentials(createAuthClient());

async function demo() {
  try {
    const res = await client.signIn.credentials({
      email: 'demo@example.com',
      password: 'demo',
    });
    console.log('signed in:', res);
  } catch (e) {
    console.error('failed:', e);
  }
}

demo();
