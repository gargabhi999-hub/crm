import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { COLORS, GRADIENTS } from '../theme';
import { StatCard, GlassCard, GradientButton, formatCurrency } from '../components/UI';
import {
  Users,
  Clock,
  PhoneCall,
  Star,
  TrendingUp,
  Calendar,
  PhoneOff,
  Coffee,
  Shield,
  Trash2,
  Settings,
  X,
} from 'lucide-react-native';

function formatDateStr(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DashboardScreen = ({ onNavigate }) => {
  const { user, activeBreak, setActiveBreak, updateUser } = useAuth();
  const { socket } = useSocket();
  const role = user?.role || 'agent';

  const [stats, setStats] = useState(null);
  const [adminStats, setAdminStats] = useState([]);
  const [queues, setQueues] = useState([]);
  const [agentCallsData, setAgentCallsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [datePreset, setDatePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [receiverMail, setReceiverMail] = useState(user?.receiverMail || '');
  const [savingSettings, setSavingSettings] = useState(false);

  const [wipeModal, setWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === 'today') {
      const s = formatDateStr(today);
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(today.getDate() - 1);
      const s = formatDateStr(y);
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'lastweek') {
      const lw = new Date();
      lw.setDate(today.getDate() - 7);
      setFromDate(formatDateStr(lw));
      setToDate(formatDateStr(today));
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const query = fromDate && toDate ? `?fromDate=${fromDate}&toDate=${toDate}` : '';
      const statsRes = await api.get(`/contacts/stats${query}`);
      setStats({ ...statsRes.data, totalLeadValue: statsRes.data?.totalLeadAmount || 0 });

      if (role === 'superadmin') {
        const admRes = await api.get(`/contacts/admin-stats${query}`);
        setAdminStats(admRes.data || []);
      } else if (role !== 'agent') {
        const [qRes, sRes] = await Promise.all([
          api.get('/contacts/agent-queues'),
          api.get(`/contacts/agent-calls-summary${query}`),
        ]);
        setQueues(qRes.data || []);
        setAgentCallsData(sRes.data || []);
      }
    } catch {
      // Keep previous stats on transient failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const events = [
      'contacts_updated',
      'contact_disposed',
      'lead_disposed',
      'dashboard_update',
      'batch_uploaded',
      'users_updated',
      'appointment_scheduled',
      'appointment_cancelled',
    ];
    const handler = () => fetchData(true);
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket, fetchData]);

  const handleStartBreak = async (type) => {
    try {
      const res = await api.post('/agent-logs/start-break', { breakType: type });
      setActiveBreak({
        type,
        startTime: res.data?.activeBreakStart || new Date().toISOString(),
      });
    } catch (err) {
      Alert.alert('Break Error', err.response?.data?.error || 'Could not start break.');
    }
  };

  const handleSaveAdminMail = async () => {
    if (!receiverMail.trim()) {
      Alert.alert('Required', 'Please enter a valid notification email.');
      return;
    }
    setSavingSettings(true);
    try {
      const uid = user._id || user.id;
      await api.put(`/users/${uid}`, { receiverMail: receiverMail.trim() });
      await updateUser({ receiverMail: receiverMail.trim() });
      setShowSettings(false);
      Alert.alert('Saved', 'Notification email settings updated.');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGlobalWipe = async () => {
    if (wipeConfirmText !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE in all caps to confirm.');
      return;
    }
    try {
      await Promise.all([
        api.delete('/users/wipe'),
        api.delete('/contacts/wipe'),
        api.delete('/leads/wipe'),
        api.delete('/leads/appointments/wipe'),
        api.delete('/leads/callbacks/wipe'),
      ]);
      setWipeModal(false);
      setWipeConfirmText('');
      fetchData();
      Alert.alert('Global Wipe Complete', 'All records except your SuperAdmin account were removed.');
    } catch {
      Alert.alert('Error', 'Global wipe failed.');
    }
  };

  const maxQueue = Math.max(1, ...queues.map((q) => (q.pending || 0) + (q.disposed || 0)));
  const maxAdminRev = Math.max(1, ...adminStats.map((a) => a.totalLeadAmount || 0));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={() => fetchData(true)} />}
    >
      {/* Welcome & Quick Actions Header */}
      <GlassCard style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {role === 'superadmin' ? 'Command Center' : `Hello, ${user?.name || 'User'}`}
            </Text>
            <Text style={styles.heroSub}>
              {role === 'superadmin'
                ? 'Global multi-tenant analytics and controls'
                : 'Real-time CRM performance & workflow pulse'}
            </Text>
          </View>
          {role === 'admin' && (
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.toolBtn}>
              <Settings size={18} color={COLORS.primary} />
            </TouchableOpacity>
          )}
          {role === 'superadmin' && (
            <TouchableOpacity onPress={() => setWipeModal(true)} style={[styles.toolBtn, { backgroundColor: COLORS.dangerLight }]}>
              <Trash2 size={18} color={COLORS.danger} />
            </TouchableOpacity>
          )}
        </View>

        {/* Date Quick Presets */}
        <View style={styles.presetRow}>
          {[
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'lastweek', label: '7 Days' },
          ].map((p) => (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.presetPill, datePreset === p.key && styles.presetPillActive]}
            >
              <Text style={[styles.presetText, datePreset === p.key && styles.presetTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      {/* Agent Break Controller */}
      {role === 'agent' && (
        <GlassCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Coffee size={17} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Break Controller</Text>
          </View>
          <View style={styles.breakRow}>
            {[
              { key: 'lunch', label: 'Lunch (30m)', color: '#d97706' },
              { key: 'tea', label: 'Tea (15m)', color: '#2563eb' },
              { key: 'bio', label: 'Bio (10m)', color: '#059669' },
            ].map((b) => (
              <TouchableOpacity
                key={b.key}
                onPress={() => handleStartBreak(b.key)}
                disabled={Boolean(activeBreak)}
                style={[styles.breakBtn, { borderColor: `${b.color}40`, backgroundColor: `${b.color}10` }]}
              >
                <Text style={[styles.breakBtnText, { color: b.color }]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {onNavigate && (
            <GradientButton
              title="Open Calling Workflow Queue"
              icon={PhoneCall}
              onPress={() => onNavigate('Workflow')}
              style={{ marginTop: 12 }}
            />
          )}
        </GlassCard>
      )}

      {/* Overview Stats Grid */}
      <Text style={styles.groupHeading}>Platform Overview</Text>
      <View style={styles.grid}>
        <StatCard title="Total Contacts" value={stats?.total || 0} subtext="In system" icon={Users} accent="#6366f1" />
        <StatCard title="Pending Queue" value={stats?.pending || 0} subtext="Awaiting call" icon={Clock} accent="#f59e0b" />
        <StatCard title="Calls Today" value={stats?.todayCalls || 0} subtext="Today's activity" icon={PhoneCall} accent="#06b6d4" />
        {role === 'superadmin' ? (
          <StatCard title="Total Admins" value={stats?.totalAdmins || 0} subtext="Active tenants" icon={Shield} accent="#ec4899" />
        ) : (
          <StatCard title="Appointments" value={stats?.appointment || 0} subtext="Scheduled" icon={Calendar} accent="#8b5cf6" />
        )}
      </View>

      {/* Revenue & Conversions Grid */}
      <Text style={styles.groupHeading}>Revenue & Conversions</Text>
      <View style={styles.grid}>
        <StatCard title="Total Leads" value={stats?.allLead || 0} subtext="All generated" icon={Star} accent="#3b82f6" />
        <StatCard title="Expected Revenue" value={formatCurrency(stats?.allLeadAmount)} subtext="Pipeline value" icon={TrendingUp} accent="#0ea5e9" />
        <StatCard title="Converted Leads" value={stats?.lead || 0} subtext="Closed deals" icon={Star} accent="#10b981" />
        <StatCard title="Converted Revenue" value={formatCurrency(stats?.totalLeadValue)} subtext="Confirmed value" icon={TrendingUp} accent="#8b5cf6" />
      </View>

      {/* Secondary Stats */}
      <View style={[styles.grid, { marginTop: 10 }]}>
        <StatCard title="Callbacks" value={stats?.callback || 0} subtext="Follow-ups" icon={Clock} accent="#0891b2" />
        <StatCard title="Hung Up / Failed" value={(stats?.hungUp || 0) + (stats?.invalid || 0)} subtext="Unreachable" icon={PhoneOff} accent="#ef4444" />
      </View>

      {/* SuperAdmin: Admin Revenue Performance */}
      {role === 'superadmin' && adminStats.length > 0 && (
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Admin Revenue Generation</Text>
          {adminStats.map((adm, idx) => {
            const pct = Math.max(6, Math.round(((adm.totalLeadAmount || 0) / maxAdminRev) * 100));
            return (
              <View key={adm.id || idx} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>{adm.name}</Text>
                  <Text style={styles.barValue}>
                    {adm.leads || 0} leads • {formatCurrency(adm.totalLeadAmount)}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: COLORS.primary }]} />
                </View>
              </View>
            );
          })}
        </GlassCard>
      )}

      {/* TL / Admin: Agent Queues & Calls Summary */}
      {(role === 'tl' || role === 'admin') && queues.length > 0 && (
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Agent Queue Progress</Text>
          {queues.map((q, idx) => {
            const total = (q.pending || 0) + (q.disposed || 0);
            const pct = Math.max(6, Math.round((total / maxQueue) * 100));
            return (
              <View key={q.agentId || idx} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={styles.barLabel}>{q.agentName || 'Agent'}</Text>
                  <Text style={styles.barValue}>{q.pending || 0} pending / {q.disposed || 0} done</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: COLORS.cyan }]} />
                </View>
              </View>
            );
          })}
        </GlassCard>
      )}

      {(role === 'tl' || role === 'admin') && agentCallsData.length > 0 && (
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Agent Calls Summary</Text>
          {agentCallsData.map((a, idx) => (
            <View key={a.agentId || idx} style={styles.summaryRow}>
              <Text style={styles.barLabel}>{a.agentName || 'Agent'}</Text>
              <Text style={styles.barValue}>
                {a.totalCalls || 0} calls • {a.leads || 0} leads • {formatCurrency(a.leadAmount)}
              </Text>
            </View>
          ))}
        </GlassCard>
      )}

      {/* Admin Notification Receiver Mail Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conversion Receiver Email</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}><X size={18} color={COLORS.textMuted} /></TouchableOpacity>
            </View>
            <TextInput
              value={receiverMail}
              onChangeText={setReceiverMail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="notifications@company.com"
              style={styles.modalInput}
            />
            <GradientButton title="Save Settings" onPress={handleSaveAdminMail} loading={savingSettings} />
          </View>
        </View>
      </Modal>

      {/* SuperAdmin Wipe Modal */}
      <Modal visible={wipeModal} transparent animationType="fade" onRequestClose={() => setWipeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.danger }]}>Global System Wipe</Text>
              <TouchableOpacity onPress={() => setWipeModal(false)}><X size={18} color={COLORS.textMuted} /></TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>
              This permanently deletes ALL users, contacts, leads, appointments, and callbacks except your SuperAdmin account. Type DELETE to confirm.
            </Text>
            <TextInput
              value={wipeConfirmText}
              onChangeText={setWipeConfirmText}
              placeholder="Type DELETE"
              style={styles.modalInput}
            />
            <GradientButton title="Execute Global Wipe" colors={GRADIENTS.dangerCta} onPress={handleGlobalWipe} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  heroCard: { padding: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitle: { fontSize: 19, fontWeight: '900', color: COLORS.textPrimary },
  heroSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
  },
  presetPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  presetText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  presetTextActive: { color: '#ffffff' },
  groupHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 4,
    marginLeft: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionCard: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  breakRow: { flexDirection: 'row', gap: 8 },
  breakBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  breakBtnText: { fontSize: 12, fontWeight: '800' },
  barItem: { marginTop: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  barValue: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  barTrack: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  modalDesc: { fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 18 },
  modalInput: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
});

export default DashboardScreen;
