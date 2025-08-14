# Better Auth Custom Credentials

A plugin for [Better Auth](https://better-auth.com) that adds custom credentials authentication support. This plugin allows you to integrate with any authentication backend (Rails, Django, custom APIs, LDAP, etc.) while maintaining Better Auth's session management.

## Features

- 🔐 **Custom Authentication**: Integrate with any backend authentication system
- 📝 **Flexible Input Schema**: Use Zod to define your own input fields
- 🎯 **Session Data**: Store custom data (JWT, permissions, etc.) in sessions
- 🔄 **Auto Sign-up**: Automatically create users or disable for security
- ⏰ **Custom Expiry**: Configure session expiration per authentication method
- 🛡️ **Robust Error Handling**: Comprehensive error handling and validation
- 📱 **Client Support**: Easy-to-use client utilities for React/Next.js

## Installation

```bash
npm install better-auth-custom-credentials
# or
pnpm add better-auth-custom-credentials
# or
yarn add better-auth-custom-credentials
```

## Quick Start

### Server Setup

```typescript
import { betterAuth } from 'better-auth';
import { credentialsPlugin } from 'better-auth-custom-credentials';
import { z } from 'zod';

export const auth = betterAuth({
  plugins: [
    credentialsPlugin({
      // Define your input schema
      inputSchema: z.object({
        email: z.string().email(),
        otp: z.string().min(6),
        rememberMe: z.boolean().optional(),
      }),

      // Your authentication logic
      verify: async ({ input: { email, otp }, req }) => {
        try {
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
            // Store additional data for session
            meta: {
              jwt: data.jwt,
              permissions: data.permissions,
            },
          };
        } catch (error) {
          return { ok: false, reason: 'Authentication failed' };
        }
      },

      // Store custom data in session
      onSessionData: async ({ verified }) => {
        const { jwt, permissions } = verified.meta as any;
        return { jwt, permissions };
      },
    }),
  ],
  // ... rest of your better-auth config
});
```

### Client Setup

```typescript
import { createAuthClient } from 'better-auth/react';
import { extendAuthClientWithCredentials } from 'better-auth-custom-credentials';

export const authClient = extendAuthClientWithCredentials(
  createAuthClient({
    fetch: (url, init) => {
      return fetch(url, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
      });
    },
  })
);

// Sign in
const result = await authClient.signIn.credentials({
  email: 'user@example.com',
  otp: '123456',
  rememberMe: true,
});

// Get session data
const { data: session } = await authClient.getSession();
const jwt = session?.data?.jwt;
const permissions = session?.data?.permissions;
```

## Advanced Examples

### Multi-Method Authentication

```typescript
credentialsPlugin({
  inputSchema: z.object({
    email: z.string().email(),
    method: z.enum(['otp', 'password', 'magic_link']),
    otp: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
  }),

  verify: async ({ input: { email, method, otp, password, token }, req }) => {
    const origin = req.headers.get('origin');

    let response: Response;

    switch (method) {
      case 'otp':
        response = await fetch(`${origin}/api/auth/verify-otp`, {
          method: 'POST',
          body: JSON.stringify({ email, otp }),
        });
        break;
      case 'password':
        response = await fetch(`${origin}/api/auth/verify-password`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        break;
      case 'magic_link':
        response = await fetch(`${origin}/api/auth/verify-magic-link`, {
          method: 'POST',
          body: JSON.stringify({ email, token }),
        });
        break;
    }

    if (!response.ok) {
      return { ok: false, reason: 'Authentication failed' };
    }

    const data = await response.json();
    return {
      ok: true,
      user: { email: data.user.email, name: data.user.name },
      meta: { jwt: data.jwt, authMethod: method },
    };
  },

  onSessionData: async ({ verified }) => {
    const { jwt, authMethod } = verified.meta as any;
    return {
      jwt,
      authMethod,
      lastLogin: new Date().toISOString(),
    };
  },
});
```

### Comprehensive Session Management

```typescript
// Server: Store rich session data
onSessionData: async ({ verified, userRecord, req }) => {
  const { jwt, permissions, roles, authMethod } = verified.meta as any;

  return {
    jwt,
    permissions,
    roles,
    authMethod,
    loginIp: req.headers.get('x-forwarded-for'),
    loginUserAgent: req.headers.get('user-agent'),
    sessionCreated: new Date().toISOString(),
    preferences: { theme: 'light', language: 'en' },
    features: {
      canEditProfile: permissions?.includes('profile:edit'),
      isAdmin: roles?.includes('admin'),
    },
  };
},
  // Client: Access session data
  class AuthManager {
    static async getSessionInfo() {
      const { data: session } = await authClient.getSession();

      if (!session) return { authenticated: false };

      return {
        authenticated: true,
        user: session.user,
        jwt: session.data?.jwt,
        permissions: session.data?.permissions || [],
        roles: session.data?.roles || [],
        features: session.data?.features || {},
        preferences: session.data?.preferences || {},
      };
    }

    static async hasPermission(permission: string): Promise<boolean> {
      const sessionInfo = await this.getSessionInfo();
      return sessionInfo.permissions?.includes(permission) || false;
    }

    static async updatePreferences(preferences: Record<string, any>) {
      const response = await fetch('/api/auth/update-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        await authClient.getSession(); // Refresh session
      }
    }
  };
```

### React Hook Example

```typescript
import React from 'react';

export function useSession() {
  const [sessionInfo, setSessionInfo] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadSession() {
      setLoading(true);
      const info = await AuthManager.getSessionInfo();
      setSessionInfo(info);
      setLoading(false);
    }

    loadSession();
  }, []);

  return {
    session: sessionInfo,
    loading,
    isAuthenticated: sessionInfo?.authenticated || false,
    user: sessionInfo?.user,
    permissions: sessionInfo?.permissions || [],
    features: sessionInfo?.features || {},
  };
}

// Usage in component
function UserProfile() {
  const { session, loading, isAuthenticated, user, permissions } = useSession();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in</div>;

  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      {permissions.includes('profile:edit') && <button>Edit Profile</button>}
    </div>
  );
}
```

## API Reference

### `credentialsPlugin(options)`

#### Options

- `inputSchema?: z.ZodTypeAny` - Zod schema for request body validation
- `verify: VerifyFn` - Your authentication verification function
- `autoSignUp?: boolean` - Whether to automatically create users (default: `true`)
- `onSessionData?: (args) => Promise<Record<string, unknown> | undefined>` - Function to compute session data
- `sessionExpiresIn?: number` - Session expiry in seconds

#### `verify` Function

```typescript
type VerifyFn = (args: {
  input: Record<string, unknown>;
  req: Request;
}) => Promise<VerifyResult>;

type VerifyResult =
  | {
      ok: true;
      user: { email: string; name?: string | null; id?: string | number };
      meta?: Record<string, unknown>;
    }
  | { ok: false; reason?: string; code?: string };
```

#### `onSessionData` Function

```typescript
type OnSessionDataFn = (args: {
  verified: Extract<VerifyResult, { ok: true }>;
  userRecord: { id: string | number; email: string };
  req: Request;
}) =>
  | Promise<Record<string, unknown> | undefined>
  | Record<string, unknown>
  | undefined;
```

### Client Utilities

#### `extendAuthClientWithCredentials(client, options?)`

Extends a Better Auth client with credentials authentication.

#### `signInWithCredentials(endpoint, body, init?)`

Standalone function for signing in with credentials.

## Configuration Options

### Session Data Persistence

The `onSessionData` callback allows you to store custom data in the session:

```typescript
onSessionData: async ({ verified, userRecord, req }) => {
  const { jwt, permissions } = verified.meta as any;

  return {
    jwt,                    // Store JWT for API calls
    permissions,            // User permissions
    lastLogin: new Date().toISOString(),
    customField: "value",   // Any custom data
  };
},
```

### Custom Session Expiry

```typescript
credentialsPlugin({
  // ... other options
  sessionExpiresIn: 60 * 60 * 24 * 30, // 30 days
});
```

### Disable Auto Sign-up

```typescript
credentialsPlugin({
  // ... other options
  autoSignUp: false, // Users must exist before authentication
});
```

## Error Handling

The plugin provides comprehensive error handling:

- **400 BAD_REQUEST**: Invalid input schema
- **401 UNAUTHORIZED**: Authentication failed or user not found (when `autoSignUp: false`)
- **500 INTERNAL_SERVER_ERROR**: User creation or session creation failed

## Testing

Run the test suite:

```bash
npm test
```

The test suite covers:

- Server success and failure scenarios
- Client utilities
- Session data handling
- Error cases
- Race condition handling

## Examples

See the `examples/` directory for complete working examples:

- `basic-server.ts` - Simple OTP authentication
- `basic-client.ts` - Basic client usage
- `advanced-server.ts` - Multi-method authentication
- `advanced-client.ts` - Comprehensive session management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT
