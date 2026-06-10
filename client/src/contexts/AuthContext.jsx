import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeBreak, setActiveBreak] = useState(null);

  const logout = React.useCallback(async () => {
    if (localStorage.getItem('crm_token')) {
      try {
        await api.post('/agent-logs/logout');
      } catch (e) {
        console.error('Failed to log out session on server', e);
      }
    }
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_login_time');
    setUser(null);
  }, []);

  const checkSession = React.useCallback(() => {
    const loginTime = localStorage.getItem('crm_login_time');
    if (loginTime) {
      const twoHours = 2 * 60 * 60 * 1000;
      const elapsed = Date.now() - parseInt(loginTime);

      if (elapsed >= twoHours) {
        console.log('Session expired due to 2h limit');
        logout().then(() => {
          window.location.href = '/login?expired=true';
        });
      }
    }
  }, [logout]);

  const initSession = React.useCallback(async () => {
    try {
      const res = await api.post('/agent-logs/session-init');
      const session = res.data;
      if (session.activeBreakType && session.activeBreakStart) {
        setActiveBreak({
          type: session.activeBreakType,
          startTime: session.activeBreakStart
        });
      } else {
        setActiveBreak(null);
      }
    } catch (e) {
      console.error('Failed to initialize agent session:', e);
    }
  }, []);

  useEffect(() => {
    // Initial load: Check if user is logged in
    const token = localStorage.getItem('crm_token');
    const storedUser = localStorage.getItem('crm_user');

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        checkSession();
      } catch (e) {
        console.error('Failed to parse stored user', e);
      }
    }
    setLoading(false);

    // Setup a background interval to check for expiration every 30 seconds
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [checkSession]);

  // Handle active session initialization on login/user change
  useEffect(() => {
    if (user && user.role === 'agent') {
      initSession();
    } else {
      setActiveBreak(null);
    }
  }, [user, initSession]);

  // Client-side 7 minutes inactivity logout and ping throttling
  useEffect(() => {
    if (!user || user.role !== 'agent') return;

    let inactivityTimer;
    let lastPing = Date.now();
    const INACTIVITY_LIMIT = 7 * 60 * 1000; // 7 minutes
    const PING_INTERVAL = 30 * 1000; // 30 seconds

    const resetInactivity = () => {
      // If user is currently on break, do not count inactivity
      if (activeBreak) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        return;
      }

      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        console.log('Logging out due to inactivity...');
        logout().then(() => {
          window.location.href = '/login?expired=true';
        });
      }, INACTIVITY_LIMIT);

      const now = Date.now();
      if (now - lastPing > PING_INTERVAL) {
        lastPing = now;
        api.post('/agent-logs/ping').catch(err => {
          console.error('Failed to send activity ping', err);
        });
      }
    };

    resetInactivity();

    const events = ['mousedown', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetInactivity);
    });

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      events.forEach(event => {
        window.removeEventListener(event, resetInactivity);
      });
    };
  }, [user, activeBreak, logout]);

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      
      if (response.data.error) {
        return { success: false, error: response.data.error };
      }

      const { token, user } = response.data;

      localStorage.setItem('crm_token', token);
      localStorage.setItem('crm_user', JSON.stringify(user));
      localStorage.setItem('crm_login_time', Date.now().toString());

      setUser(user);

      // Background fetch for past-due alerts after login
      api.get('/contacts/notifications').then(res => {
        const pastDueAlerts = res.data;
        if (pastDueAlerts && pastDueAlerts.length > 0) {
          const existing = JSON.parse(localStorage.getItem(`notifications_${user._id}`) || '[]');
          const newAlerts = pastDueAlerts.map((a, i) => ({
            id: `pastdue_${Date.now()}_${i}`,
            type: a.type,
            title: a.title,
            message: a.message,
            time: new Date(),
            path: a.path
          }));
          const merged = [...newAlerts, ...existing].slice(0, 20);
          localStorage.setItem(`notifications_${user._id}`, JSON.stringify(merged));
          // Emit a custom event so NotificationBell can refresh if needed
          window.dispatchEvent(new CustomEvent('notifications_updated'));
        }
      }).catch(err => console.error('Failed to fetch background notifications', err));

      return { success: true };
    } catch (error) {
      console.error('❌ Login failure detail:', error);
      let errorMessage = 'Login failed. Please check credentials.';
      
      if (error.response?.status === 502 || error.message === 'Network Error' || !error.response) {
        errorMessage = '📡 Server is waking up from sleep (Render Free Tier cold start). Please wait 10-15 seconds and try again!';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  };

  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem('crm_user', JSON.stringify(updatedUser));
  };

  const value = {
    user,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    activeBreak,
    setActiveBreak,
    initSession
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
