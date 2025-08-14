import { betterAuth } from 'better-auth';
import { credentialsPlugin } from 'better-auth-custom-credentials';
import { z } from 'zod';

// Example: Basic credentials plugin setup with session data
export const auth = betterAuth({
  plugins: [
    credentialsPlugin({
      // Custom input schema for your authentication flow
      inputSchema: z.object({
        email: z.string().email(),
        otp: z.string().min(6),
        rememberMe: z.boolean().optional(),
      }),

      // Your verification logic - call your backend, LDAP, etc.
      verify: async ({ input: { email, otp }, req }) => {
        try {
          // Call your authentication backend
          const response = await fetch(
            `${req.headers.get('origin')}/api/auth/verify`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, otp_code: otp }),
            }
          );

          if (!response.ok) {
            return { ok: false, reason: 'Invalid credentials' };
          }

          const data = await response.json();

          return {
            ok: true,
            user: {
              email: data.user.email,
              name: data.user.name,
              id: data.user.id,
            },
            // Store additional data in meta for session
            meta: {
              jwt: data.jwt,
              permissions: data.permissions,
              lastLogin: new Date().toISOString(),
            },
          };
        } catch (error) {
          return { ok: false, reason: 'Authentication failed' };
        }
      },

      // Store custom data in the session
      onSessionData: async ({ verified, userRecord, req }) => {
        // Extract data from meta and store in session
        const { jwt, permissions, lastLogin } = verified.meta as any;

        return {
          jwt,
          permissions,
          lastLogin,
          // You can add any other session data here
          customField: 'session_value',
        };
      },

      // Optional: Custom session expiry
      sessionExpiresIn: 60 * 60 * 24 * 30, // 30 days
    }),
  ],
  // ... rest of your better-auth config
});
