// Advanced server example
import { betterAuth } from 'better-auth';
import { credentialsPlugin } from '../src/server';
import { z } from 'zod';

const inputSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const auth = betterAuth({
  plugins: [
    credentialsPlugin({
      path: '/api/credentials/login',
      inputSchema,
      sessionExpiresIn: 60 * 60, // 1 hour
      autoSignUp: true,
      verify: async ({ input }) => {
        // Custom auth flow (e.g., LDAP, external API)
        if (input.username === 'admin' && input.password === 'admin') {
          return {
            ok: true,
            user: { email: 'admin@example.com', name: 'Admin' },
          };
        }
        return { ok: false, reason: 'INVALID_CREDENTIALS' };
      },
      onSessionData: async ({ verified }) => {
        // Attach extra session data (e.g., external JWT)
        return { role: 'admin', src: verified.meta ? 'external' : 'local' };
      },
    }),
  ],
});
