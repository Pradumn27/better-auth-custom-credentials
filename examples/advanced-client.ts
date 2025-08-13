// Advanced client example
import { createAuthClient } from 'better-auth/client';
import { extendAuthClientWithCredentials } from '../src/client';

const client = extendAuthClientWithCredentials(createAuthClient(), {
  path: '/api/credentials/login',
});

async function login() {
  await client.signIn.credentials({
    username: 'admin',
    password: 'admin',
    rememberMe: true,
  });
}

login();
