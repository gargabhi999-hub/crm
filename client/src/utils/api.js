import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Keep short-lived access token strictly in memory — never in localStorage/sessionStorage
let inMemoryAccessToken = null;
let unauthorizedHandler = null;
let refreshPromise = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token || null;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function getCookieValue(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isPublicAuthRequest(url = '') {
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

// Attach in-memory short-lived access token and double-submit CSRF header
api.interceptors.request.use(
  (config) => {
    if (inMemoryAccessToken) {
      config.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }

    const method = (config.method || 'get').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = getCookieValue('crm_csrf');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

async function refreshAccessToken() {
  if (!refreshPromise) {
    const csrfToken = getCookieValue('crm_csrf');
    refreshPromise = axios
      .post(
        `${BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        }
      )
      .then((res) => {
        const nextToken = res.data?.accessToken || null;
        setAccessToken(nextToken);
        return res.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor: Render cold-start 502 retry + automatic 401 refresh token rotation
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (response && response.status === 502 && config) {
      config.__retryCount = config.__retryCount || 0;
      const maxRetries = 3;
      const retryDelay = 4000;

      if (config.__retryCount < maxRetries) {
        config.__retryCount += 1;
        console.warn(`⚠️ [Render Cold Start (502)] detected. Retrying request (${config.__retryCount}/${maxRetries})...`, config.url);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return api(config);
      }
    }

    if (response && response.status === 401 && config && !config.__isRetryAfterRefresh && !isPublicAuthRequest(config.url)) {
      config.__isRetryAfterRefresh = true;
      try {
        await refreshAccessToken();
        if (inMemoryAccessToken) {
          config.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
        }
        return api(config);
      } catch {
        clearAccessToken();
        if (unauthorizedHandler) {
          unauthorizedHandler();
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
