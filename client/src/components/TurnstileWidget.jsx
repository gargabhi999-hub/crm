import React, { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoadPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Cloudflare Turnstile')));
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cloudflare Turnstile'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

const TurnstileWidget = ({ action = 'login', resetSignal = 0, onVerify, onExpire, onError, onConfigLoaded }) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [siteKey, setSiteKey] = useState(import.meta.env.VITE_TURNSTILE_SITE_KEY || '');
  const [enabled, setEnabled] = useState(Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY));
  const [statusError, setStatusError] = useState('');

  // Resolve active siteKey from backend config if not explicitly bundled via VITE_TURNSTILE_SITE_KEY
  useEffect(() => {
    let active = true;
    if (import.meta.env.VITE_TURNSTILE_SITE_KEY) {
      if (onConfigLoaded) onConfigLoaded({ enabled: true });
      return () => { active = false; };
    }

    api.get('/auth/cloudflare-config')
      .then((res) => {
        if (!active) return;
        const cfg = res.data || {};
        setEnabled(Boolean(cfg.turnstileEnabled));
        setSiteKey(cfg.siteKey || '');
        if (onConfigLoaded) onConfigLoaded({ enabled: Boolean(cfg.turnstileEnabled) });
      })
      .catch(() => {
        if (!active) return;
        // Fallback to official Cloudflare test key in local dev if backend is waking up
        if (import.meta.env.DEV) {
          setEnabled(true);
          setSiteKey('1x00000000000000000000AA');
          if (onConfigLoaded) onConfigLoaded({ enabled: true });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !siteKey) return;

    let cancelled = false;
    setStatusError('');

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        if (widgetIdRef.current !== null) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Ignore cleanup errors
          }
          widgetIdRef.current = null;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          action,
          callback: (token) => {
            setStatusError('');
            if (onVerify) onVerify(token);
          },
          'expired-callback': () => {
            if (onExpire) onExpire();
          },
          'error-callback': () => {
            setStatusError('Cloudflare verification check failed. Please retry.');
            if (onError) onError();
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatusError('Unable to load Cloudflare Turnstile widget.');
          if (onError) onError();
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore unmount errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [enabled, siteKey, action]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // Ignore reset errors
      }
    }
  }, [resetSignal]);

  if (!enabled || !siteKey) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div
        ref={containerRef}
        style={{
          minHeight: 65,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      />
      {statusError && (
        <span style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 4 }}>{statusError}</span>
      )}
    </div>
  );
};

export default TurnstileWidget;
