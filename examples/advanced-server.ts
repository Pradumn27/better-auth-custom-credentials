// Advanced server example
import { betterAuth } from 'better-auth';
import { credentialsPlugin } from 'better-auth-custom-credentials';
import { z } from 'zod';

// Example: Advanced credentials plugin with multiple authentication methods
export const auth = betterAuth({
  plugins: [
    credentialsPlugin({
      // Support multiple authentication methods
      inputSchema: z.object({
        email: z.string().email(),
        method: z.enum(['otp', 'password', 'magic_link']),
        otp: z.string().optional(),
        password: z.string().optional(),
        token: z.string().optional(),
        rememberMe: z.boolean().optional(),
      }),

      verify: async ({
        input: { email, method, otp, password, token },
        req,
      }) => {
        const origin = req.headers.get('origin');

        try {
          let response: Response;

          switch (method) {
            case 'otp':
              if (!otp) {
                return { ok: false, reason: 'OTP required' };
              }
              response = await fetch(`${origin}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
              });
              break;

            case 'password':
              if (!password) {
                return { ok: false, reason: 'Password required' };
              }
              response = await fetch(`${origin}/api/auth/verify-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              break;

            case 'magic_link':
              if (!token) {
                return { ok: false, reason: 'Token required' };
              }
              response = await fetch(`${origin}/api/auth/verify-magic-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, token }),
              });
              break;

            default:
              return { ok: false, reason: 'Invalid authentication method' };
          }

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
              ok: false,
              reason: errorData.message || 'Authentication failed',
              code: errorData.code || 'AUTH_FAILED',
            };
          }

          const data = await response.json();

          return {
            ok: true,
            user: {
              email: data.user.email,
              name: data.user.name,
              id: data.user.id,
            },
            meta: {
              jwt: data.jwt,
              permissions: data.permissions,
              roles: data.roles,
              lastLogin: new Date().toISOString(),
              authMethod: method,
              // Store additional context
              ipAddress: req.headers.get('x-forwarded-for'),
              userAgent: req.headers.get('user-agent'),
            },
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return { ok: false, reason: 'Internal authentication error' };
        }
      },

      onSessionData: async ({ verified, userRecord, req }) => {
        const {
          jwt,
          permissions,
          roles,
          lastLogin,
          authMethod,
          ipAddress,
          userAgent,
        } = verified.meta as any;

        // Store comprehensive session data
        return {
          jwt,
          permissions,
          roles,
          lastLogin,
          authMethod,
          // Security context
          loginIp: ipAddress,
          loginUserAgent: userAgent,
          // Session metadata
          sessionCreated: new Date().toISOString(),
          // Custom business logic data
          preferences: {
            theme: 'light', // default
            language: 'en', // default
          },
          // Feature flags or access control
          features: {
            canEditProfile: permissions?.includes('profile:edit'),
            canDeleteAccount: permissions?.includes('account:delete'),
            isAdmin: roles?.includes('admin'),
          },
        };
      },

      // Disable auto sign-up for security
      autoSignUp: false,

      // Shorter session for magic links
      sessionExpiresIn: 60 * 60 * 24 * 7, // 7 days
    }),
  ],
  // ... rest of your better-auth config
});

// Example: Helper function to validate JWT from session
export async function validateSessionJWT(session: any) {
  if (!session?.data?.jwt) {
    return { valid: false, reason: 'No JWT in session' };
  }

  try {
    const response = await fetch('/api/auth/validate-jwt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt: session.data.jwt }),
    });

    if (!response.ok) {
      return { valid: false, reason: 'JWT validation failed' };
    }

    const data = await response.json();
    return { valid: true, user: data.user };
  } catch (error) {
    return { valid: false, reason: 'JWT validation error' };
  }
}

// Example: Update session data
export async function updateSessionData(
  sessionId: string,
  updates: Record<string, any>
) {
  // This would typically update the session in your database
  // and then refresh the session cookie

  try {
    // Update session data in database
    await updateSessionInDatabase(sessionId, updates);

    // Return updated session data
    return { success: true, data: updates };
  } catch (error) {
    console.error('Failed to update session:', error);
    return { success: false, error: error.message };
  }
}

// Mock function - replace with your actual database update
async function updateSessionInDatabase(
  sessionId: string,
  updates: Record<string, any>
) {
  // Implementation depends on your database adapter
  console.log('Updating session', sessionId, 'with', updates);
}
