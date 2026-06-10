import React, { useState, useEffect } from 'react';
import { Coffee, ShieldAlert, Clock, LogOut } from 'lucide-react';

const BreakTimerOverlay = ({ activeBreak, onEndBreak }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const breakInfo = {
    lunch: { label: 'Lunch Break', limit: 30 * 60, color: '#f59e0b', bgGradient: 'linear-gradient(135deg, #1e1b4b, #0f172a)' },
    bio: { label: 'Bio Break', limit: 10 * 60, color: '#10b981', bgGradient: 'linear-gradient(135deg, #064e3b, #0f172a)' },
    tea: { label: 'Tea Break', limit: 15 * 60, color: '#3b82f6', bgGradient: 'linear-gradient(135deg, #1e3a8a, #0f172a)' }
  };

  const currentInfo = breakInfo[activeBreak?.type] || { label: 'Break', limit: 10 * 60, color: '#6366f1', bgGradient: 'linear-gradient(135deg, #312e81, #0f172a)' };

  useEffect(() => {
    if (!activeBreak?.startTime) return;

    const calculateElapsed = () => {
      const start = new Date(activeBreak.startTime).getTime();
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - start) / 1000));
      setElapsedSeconds(elapsed);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeBreak]);

  const remainingSeconds = currentInfo.limit - elapsedSeconds;
  const isOvertime = remainingSeconds < 0;
  const displaySeconds = Math.abs(remainingSeconds);

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Styled overlay when overtime happens
  const overtimeStyle = {
    bgGradient: 'linear-gradient(135deg, #270606, #090101)',
    color: '#ef4444'
  };

  const currentBg = isOvertime ? overtimeStyle.bgGradient : currentInfo.bgGradient;
  const currentAccent = isOvertime ? overtimeStyle.color : currentInfo.color;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: currentBg,
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: "'Outfit', 'Inter', sans-serif",
      transition: 'background 0.5s ease'
    }}>
      {/* Glow Effects */}
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: currentAccent,
        filter: 'blur(150px)',
        opacity: isOvertime ? 0.15 : 0.08,
        pointerEvents: 'none',
        zIndex: 1,
        transition: 'all 0.5s ease'
      }} />

      {/* Main Container */}
      <div style={{
        width: '100%',
        maxWidth: 500,
        textAlign: 'center',
        zIndex: 2,
        animation: 'fadeIn 0.5s ease-out'
      }}>
        {/* Status Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: isOvertime ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.06)',
          border: `1px solid ${isOvertime ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)'}`,
          padding: '8px 16px',
          borderRadius: 99,
          fontSize: '0.875rem',
          fontWeight: 700,
          color: currentAccent,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 24,
          boxShadow: isOvertime ? '0 0 15px rgba(239, 68, 68, 0.1)' : 'none',
          animation: isOvertime ? 'pulseRed 2s infinite' : 'none'
        }}>
          {isOvertime ? <ShieldAlert size={16} /> : <Clock size={16} />}
          <span>{isOvertime ? 'Overtime Alert' : 'Break In Progress'}</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 900,
          margin: '0 0 8px 0',
          letterSpacing: '-0.03em',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          {currentInfo.label}
        </h1>
        
        <p style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.95rem',
          margin: '0 0 48px 0',
          fontWeight: 500
        }}>
          Allocated duration: <strong style={{ color: '#ffffff' }}>{currentInfo.limit / 60} minutes</strong>
        </p>

        {/* Counter Display */}
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 260,
          height: 260,
          margin: '0 auto 48px auto',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.02)',
          border: `3px solid ${isOvertime ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
          boxShadow: isOvertime ? 'inset 0 0 30px rgba(239, 68, 68, 0.1), 0 0 30px rgba(239, 68, 68, 0.15)' : 'inset 0 0 20px rgba(255,255,255,0.01)',
          transition: 'all 0.5s ease'
        }}>
          {/* Inner ring */}
          <div style={{
            position: 'absolute',
            inset: 10,
            borderRadius: '50%',
            border: `1px dashed ${isOvertime ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
            pointerEvents: 'none'
          }} />

          {/* Time text */}
          <span style={{
            fontSize: '3.5rem',
            fontWeight: 900,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            color: isOvertime ? '#ef4444' : '#ffffff',
            textShadow: isOvertime ? '0 0 20px rgba(239, 68, 68, 0.5)' : '0 0 10px rgba(255,255,255,0.1)',
            animation: isOvertime ? 'pulseText 1.5s infinite' : 'none'
          }}>
            {isOvertime ? `-${formatTime(displaySeconds)}` : formatTime(displaySeconds)}
          </span>

          <span style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: isOvertime ? '#ef4444' : 'rgba(255,255,255,0.4)',
            marginTop: 4
          }}>
            {isOvertime ? 'Minutes Overtime' : 'Time Remaining'}
          </span>
        </div>

        {/* End Break Action */}
        <button
          onClick={onEndBreak}
          className="btn-end-break"
          style={{
            background: isOvertime ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#ffffff',
            border: 'none',
            padding: '16px 42px',
            fontSize: '1.05rem',
            fontWeight: 800,
            borderRadius: 16,
            cursor: 'pointer',
            boxShadow: isOvertime ? '0 8px 30px rgba(239, 68, 68, 0.35)' : '0 8px 30px rgba(99, 102, 241, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            transition: 'transform 0.2s, box-shadow 0.2s',
            outline: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = isOvertime ? '0 12px 40px rgba(239, 68, 68, 0.5)' : '0 12px 40px rgba(99, 102, 241, 0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = isOvertime ? '0 8px 30px rgba(239, 68, 68, 0.35)' : '0 8px 30px rgba(99, 102, 241, 0.35)';
          }}
        >
          <LogOut size={20} />
          <span>End Break & Resume Work</span>
        </button>
      </div>

      {/* Embedded Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseRed {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes pulseText {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
};

export default BreakTimerOverlay;
