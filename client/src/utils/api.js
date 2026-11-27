import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Keep short-lived access token and cross-site CSRF token strictly in memory
let inMemoryAccessToken = null;
let inMemoryCsrfToken = null;
let unauthorizedHandler = null;
let refreshPromise = null;
let csrfPromise = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token || null;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
}

export function setCsrfToken(token) {
  inMemoryCsrfToken = token || null;
}

export function clearCsrfToken() {
  inMemoryCsrfToken = null;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

function getCookieValue(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getCurrentCsrfToken() {
  return inMemoryCsrfToken || getCookieValue('crm_csrf');
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
  '/auth/csrf-token',
];

const CSRF_EXEMPT_REQUEST_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isPublicAuthRequest(url = '') {
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

function isCsrfExemptRequest(url = '') {
  return CSRF_EXEMPT_REQUEST_PATHS.some((path) => url.includes(path));
}

async function fetchFreshCsrfToken() {
  if (!csrfPromise) {
    csrfPromise = axios
      .get(`${BASE_URL}/auth/csrf-token`, { withCredentials: true })
      .then((res) => {
        const token = res.data?.csrfToken || null;
        if (token) setCsrfToken(token);
        return token;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function ensureCsrfToken() {
  return getCurrentCsrfToken() || fetchFreshCsrfToken();
}

// Attach in-memory short-lived access token and double-submit CSRF header
api.interceptors.request.use(
  async (config) => {
    if (inMemoryAccessToken) {
      config.headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }

    const method = (config.method || 'get').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !isCsrfExemptRequest(config.url)) {
      try {
        const csrfToken = await ensureCsrfToken();
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }
      } catch {
        // Proceed cleanly; response interceptor handles 403/401 recovery if needed
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const csrfToken = await ensureCsrfToken().catch(() => null);
      const res = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        }
      );
      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken);
      }
      if (res.data?.csrfToken) {
        setCsrfToken(res.data.csrfToken);
      }
      return res.data;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Response interceptor: keep in-memory CSRF/access tokens synced, retry 502s, heal CSRF, and handle 401 refresh
api.interceptors.response.use(
  (response) => {
    if (response?.data?.csrfToken) {
      setCsrfToken(response.data.csrfToken);
    }
    return response;
  },
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

    if (
      response &&
      response.status === 403 &&
      response.data?.error === 'CSRF validation failed.' &&
      config &&
      !config.__isRetryAfterCsrf
    ) {
      config.__isRetryAfterCsrf = true;
      try {
        clearCsrfToken();
        const freshCsrf = await fetchFreshCsrfToken();
        if (freshCsrf) {
          config.headers['X-CSRF-Token'] = freshCsrf;
          return api(config);
        }
      } catch {
        // Fall through to error rejection
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
        clearCsrfToken();
        if (unauthorizedHandler) {
          unauthorizedHandler();
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
