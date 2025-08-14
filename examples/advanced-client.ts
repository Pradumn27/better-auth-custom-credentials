import { createAuthClient } from 'better-auth/react';
import { extendAuthClientWithCredentials } from 'better-auth-custom-credentials';

// Example: Advanced client with comprehensive session management
export const authClient = extendAuthClientWithCredentials(createAuthClient(), {
  fetch: (url, init) => {
    return fetch(url, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
    });
  },
});

// Example: Multi-method authentication
export class AuthManager {
  // Sign in with OTP
  static async signInWithOTP(email: string, otp: string, rememberMe = false) {
    try {
      const result = await authClient.signIn.credentials({
        email,
        method: 'otp',
        otp,
        rememberMe,
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Sign in with password
  static async signInWithPassword(
    email: string,
    password: string,
    rememberMe = false
  ) {
    try {
      const result = await authClient.signIn.credentials({
        email,
        method: 'password',
        password,
        rememberMe,
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Sign in with magic link
  static async signInWithMagicLink(email: string, token: string) {
    try {
      const result = await authClient.signIn.credentials({
        email,
        method: 'magic_link',
        token,
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get comprehensive session data
  static async getSessionInfo() {
    try {
      const { data: session } = await authClient.getSession();

      if (!session) {
        return { authenticated: false };
      }

      const sessionData = session.data || {};

      return {
        authenticated: true,
        user: session.user,
        // Authentication context
        jwt: sessionData.jwt,
        authMethod: sessionData.authMethod,
        lastLogin: sessionData.lastLogin,
        loginIp: sessionData.loginIp,
        loginUserAgent: sessionData.loginUserAgent,

        // Permissions and roles
        permissions: sessionData.permissions || [],
        roles: sessionData.roles || [],

        // Feature flags
        features: sessionData.features || {},

        // User preferences
        preferences: sessionData.preferences || {},

        // Session metadata
        sessionCreated: sessionData.sessionCreated,
      };
    } catch (error) {
      console.error('Failed to get session info:', error);
      return { authenticated: false, error: error.message };
    }
  }

  // Check specific permissions
  static async hasPermission(permission: string): Promise<boolean> {
    const sessionInfo = await this.getSessionInfo();
    if (!sessionInfo.authenticated) return false;

    return sessionInfo.permissions?.includes(permission) || false;
  }

  // Check if user has any of the given roles
  static async hasRole(roles: string | string[]): Promise<boolean> {
    const sessionInfo = await this.getSessionInfo();
    if (!sessionInfo.authenticated) return false;

    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.some((role) => sessionInfo.roles?.includes(role)) || false;
  }

  // Check feature access
  static async canAccessFeature(feature: string): Promise<boolean> {
    const sessionInfo = await this.getSessionInfo();
    if (!sessionInfo.authenticated) return false;

    return sessionInfo.features?.[feature] || false;
  }

  // Update user preferences
  static async updatePreferences(preferences: Record<string, any>) {
    try {
      const response = await fetch('/api/auth/update-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      // Refresh session to get updated data
      await authClient.getSession();

      return { success: true };
    } catch (error) {
      console.error('Failed to update preferences:', error);
      return { success: false, error: error.message };
    }
  }

  // Validate JWT with backend
  static async validateJWT(): Promise<boolean> {
    try {
      const sessionInfo = await this.getSessionInfo();
      if (!sessionInfo.authenticated || !sessionInfo.jwt) {
        return false;
      }

      const response = await fetch('/api/auth/validate-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jwt: sessionInfo.jwt }),
      });

      return response.ok;
    } catch (error) {
      console.error('JWT validation failed:', error);
      return false;
    }
  }

  // Refresh session data
  static async refreshSession() {
    try {
      await authClient.getSession();
      return { success: true };
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return { success: false, error: error.message };
    }
  }

  // Sign out
  static async signOut() {
    try {
      await authClient.signOut();
      return { success: true };
    } catch (error) {
      console.error('Sign out failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Example: React hook for session management
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

  const refresh = React.useCallback(async () => {
    setLoading(true);
    const info = await AuthManager.getSessionInfo();
    setSessionInfo(info);
    setLoading(false);
  }, []);

  return {
    session: sessionInfo,
    loading,
    refresh,
    isAuthenticated: sessionInfo?.authenticated || false,
    user: sessionInfo?.user,
    permissions: sessionInfo?.permissions || [],
    roles: sessionInfo?.roles || [],
    features: sessionInfo?.features || {},
    preferences: sessionInfo?.preferences || {},
  };
}

// Example: Usage in a React component
export function UserProfile() {
  const { session, loading, isAuthenticated, user, permissions, features } =
    useSession();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in</div>;

  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      <p>Email: {user?.email}</p>

      {permissions.includes('profile:edit') && <button>Edit Profile</button>}

      {features.isAdmin && (
        <div>
          <h2>Admin Panel</h2>
          <button>Manage Users</button>
        </div>
      )}

      <button onClick={() => AuthManager.signOut()}>Sign Out</button>
    </div>
  );
}
