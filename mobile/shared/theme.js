export const COLORS = {
  bgBase: '#eef6ff',
  surface: '#ffffff',
  surface2: '#f0f8ff',
  surfaceMuted: '#f8fafc',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: 'rgba(37, 99, 235, 0.10)',
  primaryGlow: 'rgba(37, 99, 235, 0.18)',
  violet: '#7c3aed',
  violetLight: 'rgba(124, 58, 237, 0.10)',
  cyan: '#0891b2',
  cyanBright: '#22d3ee',
  cyanLight: 'rgba(8, 145, 178, 0.10)',
  success: '#059669',
  successLight: 'rgba(5, 150, 105, 0.12)',
  warning: '#d97706',
  warningLight: 'rgba(217, 119, 6, 0.12)',
  danger: '#dc2626',
  dangerLight: 'rgba(220, 38, 38, 0.12)',
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  border: 'rgba(37, 99, 235, 0.14)',
  borderSlate: '#e2e8f0',
};

export const GRADIENTS = {
  nexusBg: ['#070d1f', '#0b224f', '#0c4d78', '#3c2f96'],
  primaryCta: ['#0284c7', '#2563eb', '#6366f1'],
  successCta: ['#059669', '#10b981'],
  dangerCta: ['#dc2626', '#ef4444'],
};

export const DISPOSITIONS = [
  { key: 'Lead', label: 'Lead', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  { key: 'Appointment', label: 'Appointment', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  { key: 'CallNotAnswered', label: 'Call Not Answered', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  { key: 'HungUp', label: 'Hung Up', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' },
  { key: 'Invalid', label: 'Invalid / Wrong No.', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  { key: 'DoNotCall', label: 'Do Not Call', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  { key: 'NotInterested', label: 'Not Interested', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  { key: 'LanguageBarrier', label: 'Language Barrier', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  { key: 'CallBack', label: 'Call Back', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
];

export const LEAD_STATUS_OPTIONS = [
  'Converted',
  'Not Interested',
  'DNC/DND',
  'Call Back',
  'Others',
];

export const SHADOWS = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  primary: {
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
};
