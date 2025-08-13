// Minimal server example (pseudo-code) – integrate into your framework of choice
import { betterAuth } from 'better-auth';
import { credentialsPlugin } from '../src/server';

export const auth = betterAuth({
  plugins: [
    credentialsPlugin({
      verify: async ({ input }) => {
        // Replace with your backend auth call
        if (input.email === 'demo@example.com' && input.password === 'demo') {
          return {
            ok: true,
            user: { email: 'demo@example.com', name: 'Demo' },
          };
        }
        return { ok: false, reason: 'INVALID_CREDENTIALS' };
      },
    }),
  ],
});
