import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken, clearAccessToken, setCsrfToken, clearCsrfToken, setUnauthorizedHandler } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeBreak, setActiveBreak] = useState(null);

  const clearLegacyClientStorage = useCallback(() => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_login_time');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors during logout
    }
    clearAccessToken();
    clearCsrfToken();
    clearLegacyClientStorage();
    setUser(null);
    setActiveBreak(null);
  }, [clearLegacyClientStorage]);

  const logoutAll = useCallback(async () => {
    try {
      await api.post('/auth/logout-all');
    } catch {
      // Ignore network errors during logout-all
    }
    clearAccessToken();
    clearCsrfToken();
    clearLegacyClientStorage();
    setUser(null);
    setActiveBreak(null);
  }, [clearLegacyClientStorage]);

  const initSession = useCallback(async () => {
    try {
      const res = await api.post('/agent-logs/session-init');
      const session = res.data;
      if (session.activeBreakType && session.activeBreakStart) {
        setActiveBreak({
          type: session.activeBreakType,
          startTime: session.activeBreakStart,
        });
      } else {
        setActiveBreak(null);
      }
    } catch (e) {
      console.error('Failed to initialize agent session:', e);
    }
  }, []);

  // Restore session purely via server-verified HttpOnly cookie + refresh flow
  useEffect(() => {
    clearLegacyClientStorage();

    setUnauthorizedHandler(() => {
      setUser(null);
      setActiveBreak(null);
      if (window.location.pathname !== '/login' && window.location.pathname !== '/reset-password') {
        window.location.href = '/login?expired=true';
      }
    });

    let cancelled = false;
    async function restoreSession() {
      try {
        const res = await api.get('/auth/me');
        if (!cancelled && res.data?.user) {
          if (res.data.accessToken) setAccessToken(res.data.accessToken);
          if (res.data.csrfToken) setCsrfToken(res.data.csrfToken);
          setUser(res.data.user);
        }
      } catch {
        if (!cancelled) {
          clearAccessToken();
          clearCsrfToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [clearLegacyClientStorage]);

  useEffect(() => {
    if (user && user.role === 'agent') {
      initSession();
    } else {
      setActiveBreak(null);
    }
  }, [user, initSession]);

  // Agent inactivity ping & auto-logout (10 minutes)
  useEffect(() => {
    if (!user || user.role !== 'agent') return;

    let inactivityTimer;
    let lastPing = Date.now();
    const INACTIVITY_LIMIT = 10 * 60 * 1000;
    const PING_INTERVAL = 30 * 1000;

    const resetInactivity = () => {
      if (activeBreak) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        return;
      }

      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        logout().then(() => {
          window.location.href = '/login?expired=true';
        });
      }, INACTIVITY_LIMIT);

      const now = Date.now();
      if (now - lastPing > PING_INTERVAL) {
        lastPing = now;
        api.post('/agent-logs/ping').catch(() => {});
      }
    };

    resetInactivity();

    const events = ['mousedown', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetInactivity));

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      events.forEach((event) => window.removeEventListener(event, resetInactivity));
    };
  }, [user, activeBreak, logout]);

  const login = async (identifier, password, turnstileToken = null) => {
    try {
      const response = await api.post('/auth/login', { identifier, password, turnstileToken });
      if (response.data.error) {
        return { success: false, error: response.data.error };
      }

      const { accessToken, csrfToken, user: loggedInUser } = response.data;
      setAccessToken(accessToken);
      if (csrfToken) setCsrfToken(csrfToken);
      setUser(loggedInUser);

      // Background fetch for past-due alerts after login
      api.get('/contacts/notifications')
        .then((res) => {
          const pastDueAlerts = res.data;
          if (pastDueAlerts && pastDueAlerts.length > 0) {
            const uid = loggedInUser._id || loggedInUser.id;
            const existing = JSON.parse(localStorage.getItem(`notifications_${uid}`) || '[]');
            const newAlerts = pastDueAlerts.map((a, i) => ({
              id: `pastdue_${Date.now()}_${i}`,
              type: a.type,
              title: a.title,
              message: a.message,
              time: new Date(),
              path: a.path,
            }));
            const merged = [...newAlerts, ...existing].slice(0, 20);
            localStorage.setItem(`notifications_${uid}`, JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent('notifications_updated'));
          }
        })
        .catch(() => {});

      return { success: true };
    } catch (error) {
      let errorMessage = 'Invalid credentials.';
      if (error.response?.status === 502 || error.message === 'Network Error' || !error.response) {
        errorMessage = '📡 Server is waking up from sleep. Please wait 10-15 seconds and try again!';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      return { success: false, error: errorMessage };
    }
  };

  const register = async ({ name, email, password, turnstileToken = null }) => {
    try {
      const res = await api.post('/auth/register', { name, email, password, turnstileToken });
      return { success: true, message: res.data?.message || 'Registration successful.' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Unable to register account.',
      };
    }
  };

  const forgotPassword = async (email, turnstileToken = null) => {
    try {
      const res = await api.post('/auth/forgot-password', { email, turnstileToken });
      return {
        success: true,
        message: res.data?.message || 'If an account matching that email exists, a password reset link has been sent.',
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Unable to process password reset request.',
      };
    }
  };

  const resetPassword = async (token, newPassword, turnstileToken = null) => {
    try {
      const res = await api.post('/auth/reset-password', { token, newPassword, turnstileToken });
      return { success: true, message: res.data?.message || 'Password reset successfully.' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Invalid or expired password reset token.',
      };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken);
      }
      if (res.data?.csrfToken) {
        setCsrfToken(res.data.csrfToken);
      }
      if (res.data?.user) {
        setUser(res.data.user);
      }
      return { success: true, message: res.data?.message || 'Password updated successfully.' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update password.',
      };
    }
  };

  const updateUser = (updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    logoutAll,
    forgotPassword,
    resetPassword,
    changePassword,
    updateUser,
    isAuthenticated: !!user,
    activeBreak,
    setActiveBreak,
    initSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
