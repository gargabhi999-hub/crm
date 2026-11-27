import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NexusLogoMark from '../components/NexusLogoMark';
import TurnstileWidget from '../components/TurnstileWidget';
import { ShieldAlert, ShieldCheck, CheckCircle2, Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react';

const ResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const token = new URLSearchParams(location.search).get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (turnstileRequired && !turnstileToken) {
      setError('Please complete the Cloudflare Turnstile security check.');
      return;
    }

    setIsLoading(true);
    const result = await resetPassword(token, newPassword, turnstileToken);
    setIsLoading(false);
    setTurnstileToken('');
    setTurnstileResetSignal((n) => n + 1);

    if (result.success) {
      setSuccess(result.message);
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } else {
      setError(result.error);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(20px, 4vw, 48px)',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      background:
        'radial-gradient(circle at 82% 24%, rgba(34, 211, 238, 0.34) 0%, transparent 44%), radial-gradient(circle at 72% 78%, rgba(124, 58, 237, 0.42) 0%, transparent 48%), linear-gradient(125deg, #070d1f 0%, #0b224f 36%, #0c4d78 68%, #3c2f96 100%)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 1080,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        alignItems: 'center',
        gap: 'clamp(32px, 6vw, 96px)',
      }}>
        <section style={{
          background: '#ffffff',
          borderRadius: 22,
          padding: '30px 30px 20px',
          maxWidth: 420,
          width: '100%',
          margin: '0 auto',
          boxShadow: '0 32px 75px -16px rgba(2, 6, 23, 0.58)',
          color: '#0f172a',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(79, 70, 229, 0.12))',
              color: '#1d4ed8', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em',
            }}>
              RESET PASSWORD
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Workspace Access</span>
          </div>

          <h1 style={{ fontSize: '1.52rem', fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
            Establish New Password
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 22px', lineHeight: 1.45 }}>
            Use at least 8 characters including uppercase, lowercase, number, and symbol.
          </p>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px',
              borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca',
              color: '#b91c1c', fontSize: '0.8rem', fontWeight: 600, marginBottom: 16,
            }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px',
              borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0',
              color: '#047857', fontSize: '0.8rem', fontWeight: 600, marginBottom: 16,
            }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#334155', letterSpacing: '0.07em' }}>
                NEW PASSWORD
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={16} style={{ position: 'absolute', left: 13, color: '#94a3b8' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{
                    width: '100%', height: 44, background: '#f8fafc', border: '1.5px solid #e2e8f0',
                    borderRadius: 10, padding: '0 40px 0 39px', fontSize: '0.88rem', color: '#0f172a',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  aria-label="Toggle password visibility"
                  style={{
                    position: 'absolute', right: 11, background: 'none', border: 'none',
                    color: '#64748b', cursor: 'pointer', display: 'flex',
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#334155', letterSpacing: '0.07em' }}>
                CONFIRM NEW PASSWORD
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={16} style={{ position: 'absolute', left: 13, color: '#94a3b8' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{
                    width: '100%', height: 44, background: '#f8fafc', border: '1.5px solid #e2e8f0',
                    borderRadius: 10, padding: '0 14px 0 39px', fontSize: '0.88rem', color: '#0f172a',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <TurnstileWidget
                action="reset_password"
                resetSignal={turnstileResetSignal}
                onVerify={(tok) => setTurnstileToken(tok)}
                onExpire={() => setTurnstileToken('')}
                onError={() => setTurnstileToken('')}
                onConfigLoaded={({ enabled }) => setTurnstileRequired(enabled)}
              />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#475569' }}>
                <ShieldCheck size={14} color="#059669" />
                <span>Protected by Cloudflare Turnstile Authentication</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !!success}
              style={{
                width: '100%', height: 45, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 52%, #6366f1 100%)',
                color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                boxShadow: '0 8px 22px rgba(37, 99, 235, 0.34)',
              }}
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </div>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', userSelect: 'none' }}>
          <div style={{ marginBottom: 14 }}>
            <NexusLogoMark size={178} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.02 }}>
            <span style={{ fontSize: 'clamp(3.6rem, 6vw, 5.15rem)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em' }}>
              Nexus
            </span>
            <span style={{ fontSize: 'clamp(3.6rem, 6vw, 5.15rem)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em' }}>
              CRM<span style={{ background: 'linear-gradient(135deg, #22d3ee, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>.</span>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ResetPassword;
