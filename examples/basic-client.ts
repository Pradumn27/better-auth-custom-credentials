import { createAuthClient } from 'better-auth/react';
import { extendAuthClientWithCredentials } from 'better-auth-custom-credentials';

// Example: Basic client setup with credentials
export const authClient = extendAuthClientWithCredentials(createAuthClient(), {
  // Configure fetch to include credentials and avoid caching
  fetch: (url, init) => {
    return fetch(url, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
    });
  },
});

// Example: Sign in with credentials
export async function signInWithOTP(
  email: string,
  otp: string,
  rememberMe = false
) {
  try {
    const result = await authClient.signIn.credentials({
      email,
      otp,
      rememberMe,
    });

    console.log('Sign in successful:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('Sign in failed:', error);
    return { success: false, error: error.message };
  }
}

// Example: Read session data (including custom data from onSessionData)
export async function getSessionData() {
  try {
    const { data: session } = await authClient.getSession();

    if (!session) {
      return { authenticated: false };
    }

    // Access custom session data stored via onSessionData
    const jwt = session.data?.jwt;
    const permissions = session.data?.permissions;
    const lastLogin = session.data?.lastLogin;
    const customField = session.data?.customField;

    return {
      authenticated: true,
      user: session.user,
      jwt,
      permissions,
      lastLogin,
      customField,
    };
  } catch (error) {
    console.error('Failed to get session:', error);
    return { authenticated: false, error: error.message };
  }
}

// Example: Update session data (if your backend supports it)
export async function updateSessionData(newData: Record<string, any>) {
  try {
    // This would typically call your backend to update session data
    const response = await fetch('/api/auth/update-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(newData),
    });

    if (!response.ok) {
      throw new Error('Failed to update session');
    }

    // Refresh session to get updated data
    await authClient.getSession();

    return { success: true };
  } catch (error) {
    console.error('Failed to update session:', error);
    return { success: false, error: error.message };
  }
}

// Example: Sign out
export async function signOut() {
  try {
    await authClient.signOut();
    console.log('Signed out successfully');
    return { success: true };
  } catch (error) {
    console.error('Sign out failed:', error);
    return { success: false, error: error.message };
  }
}
