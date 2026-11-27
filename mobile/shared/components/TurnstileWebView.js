import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import api from '../services/api';
import { COLORS } from '../theme';

function buildTurnstileHtml(siteKey, action) {
  const safeAction = String(action || 'login').replace(/[^a-zA-Z0-9_-]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 70px; font-family: system-ui, sans-serif; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
</head>
<body>
  <div id="cf-turnstile-box"></div>
  <script>
    function postToRN(payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }
    function initWidget(retries) {
      if (window.turnstile) {
        window.turnstile.render('#cf-turnstile-box', {
          sitekey: ${JSON.stringify(siteKey)},
          theme: 'light',
          action: ${JSON.stringify(safeAction)},
          callback: function (token) { postToRN({ type: 'verified', token: token }); },
          'expired-callback': function () { postToRN({ type: 'expired' }); },
          'error-callback': function (code) { postToRN({ type: 'error', message: 'Verification error (' + (code || 'retry') + ')' }); }
        });
        return;
      }
      if (retries > 0) {
        setTimeout(function () { initWidget(retries - 1); }, 150);
      } else {
        postToRN({ type: 'error', message: 'Turnstile script failed to load.' });
      }
    }
    window.addEventListener('load', function () { initWidget(30); });
  </script>
</body>
</html>`;
}

const TurnstileWebView = ({
  action = 'login',
  resetSignal = 0,
  serverUrl,
  onVerify,
  onExpire,
  onError,
  onConfigLoaded,
}) => {
  const fallbackSiteKey = Constants.expoConfig?.extra?.turnstileSiteKey || '';
  const [siteKey, setSiteKey] = useState(fallbackSiteKey);
  const [enabled, setEnabled] = useState(Boolean(fallbackSiteKey));
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingConfig(true);
    api
      .get('/auth/cloudflare-config')
      .then((res) => {
        if (!active) return;
        const nextKey = res.data?.siteKey || fallbackSiteKey;
        const isEnabled = Boolean(res.data?.turnstileEnabled && nextKey);
        setSiteKey(nextKey);
        setEnabled(isEnabled);
        if (onConfigLoaded) onConfigLoaded({ enabled: isEnabled });
      })
      .catch(() => {
        if (!active) return;
        const hasFallback = Boolean(fallbackSiteKey);
        setSiteKey(fallbackSiteKey);
        setEnabled(hasFallback);
        if (onConfigLoaded) onConfigLoaded({ enabled: hasFallback });
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });

    return () => {
      active = false;
    };
  }, [serverUrl, fallbackSiteKey]);

  useEffect(() => {
    if (resetSignal > 0) {
      setWebViewKey((k) => k + 1);
      setStatusError('');
    }
  }, [resetSignal]);

  if (loadingConfig) {
    return (
      <View style={styles.loaderBox}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loaderText}>Initializing Cloudflare protection...</Text>
      </View>
    );
  }

  if (!enabled || !siteKey) {
    return null;
  }

  const html = buildTurnstileHtml(siteKey, action);

  return (
    <View style={styles.wrapper}>
      <View style={styles.webViewFrame}>
        <WebView
          key={`${webViewKey}-${action}-${siteKey}`}
          source={{ html, baseUrl: 'https://crm-eight-sage.vercel.app' }}
          style={styles.webView}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data || '{}');
              if (payload.type === 'verified' && payload.token) {
                setStatusError('');
                if (onVerify) onVerify(payload.token);
              } else if (payload.type === 'expired') {
                if (onExpire) onExpire();
              } else if (payload.type === 'error') {
                setStatusError(payload.message || 'Cloudflare verification failed.');
                if (onError) onError();
              }
            } catch {
              // Ignore malformed messages
            }
          }}
          onError={() => {
            setStatusError('Unable to load Cloudflare verification.');
            if (onError) onError();
          }}
        />
      </View>
      {!!statusError && <Text style={styles.errorText}>{statusError}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
  },
  webViewFrame: {
    width: '100%',
    height: 76,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  webView: {
    width: '100%',
    height: 76,
    backgroundColor: '#ffffff',
  },
  loaderBox: {
    height: 72,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loaderText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 4,
    fontSize: 11.5,
    color: COLORS.danger,
    fontWeight: '600',
  },
});

export default TurnstileWebView;
