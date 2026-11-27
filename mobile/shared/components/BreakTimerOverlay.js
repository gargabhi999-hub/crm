import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Coffee, Clock, ShieldAlert } from 'lucide-react-native';

const BREAK_META = {
  lunch: { label: 'Lunch Break', limit: 30 * 60, color: '#f59e0b', bg: ['#1e1b4b', '#0f172a'] },
  bio: { label: 'Bio Break', limit: 10 * 60, color: '#10b981', bg: ['#064e3b', '#0f172a'] },
  tea: { label: 'Tea Break', limit: 15 * 60, color: '#3b82f6', bg: ['#1e3a8a', '#0f172a'] },
};

const BreakTimerOverlay = ({ activeBreak, onEndBreak }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!activeBreak?.startTime) return;
    const calc = () => {
      const start = new Date(activeBreak.startTime).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [activeBreak]);

  if (!activeBreak) return null;

  const info = BREAK_META[activeBreak.type] || {
    label: 'Break',
    limit: 10 * 60,
    color: '#6366f1',
    bg: ['#312e81', '#0f172a'],
  };

  const remaining = info.limit - elapsedSeconds;
  const isOvertime = remaining < 0;
  const absSecs = Math.abs(remaining);
  const mins = Math.floor(absSecs / 60).toString().padStart(2, '0');
  const secs = (absSecs % 60).toString().padStart(2, '0');

  const gradientColors = isOvertime ? ['#450a0a', '#090101'] : info.bg;
  const accent = isOvertime ? '#ef4444' : info.color;

  return (
    <Modal visible={Boolean(activeBreak)} animationType="fade" transparent={false}>
      <LinearGradient colors={gradientColors} style={styles.container}>
        <View style={[styles.badge, { borderColor: `${accent}66`, backgroundColor: `${accent}20` }]}>
          {isOvertime ? <ShieldAlert size={16} color={accent} /> : <Clock size={16} color={accent} />}
          <Text style={[styles.badgeText, { color: accent }]}>
            {isOvertime ? 'OVERTIME ALERT' : 'BREAK IN PROGRESS'}
          </Text>
        </View>

        <Coffee size={44} color={accent} style={{ marginBottom: 14 }} />
        <Text style={styles.title}>{info.label}</Text>
        <Text style={styles.subtitle}>
          {isOvertime ? 'Break allowance exceeded. Please resume work.' : 'Session paused safely. Take your break.'}
        </Text>

        <View style={[styles.timerBox, { borderColor: `${accent}55` }]}>
          <Text style={[styles.timerLabel, { color: accent }]}>
            {isOvertime ? 'OVERTIME DURATION' : 'TIME REMAINING'}
          </Text>
          <Text style={[styles.timerDigits, { color: isOvertime ? '#fca5a5' : '#ffffff' }]}>
            {isOvertime ? '+' : ''}{mins}:{secs}
          </Text>
        </View>

        <TouchableOpacity onPress={onEndBreak} activeOpacity={0.85} style={styles.endBtn}>
          <Text style={styles.endBtnText}>End Break & Resume Work</Text>
        </TouchableOpacity>
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 22,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'center',
    marginBottom: 32,
  },
  timerBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 34,
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  timerDigits: {
    fontSize: 54,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  endBtn: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  endBtnText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default BreakTimerOverlay;
