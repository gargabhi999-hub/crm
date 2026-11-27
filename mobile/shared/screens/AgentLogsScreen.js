import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import api from '../services/api';
import { COLORS } from '../theme';
import { GlassCard, StatCard, Badge, EmptyState, formatDateTime } from '../components/UI';
import { Activity, Coffee, AlertTriangle, Clock, Search } from 'lucide-react-native';

const LIMITS = { lunch: 30 * 60, bio: 10 * 60, tea: 15 * 60 };

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? `${h}h ` : ''}${m > 0 || h > 0 ? `${m}m ` : ''}${s}s`;
}

const AgentLogsScreen = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/agent-logs/admin-logs');
      setLogs(res.data || []);
    } catch {
      // Keep previous logs
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const activeCount = logs.filter((l) => !l.logoutAt).length;
  const breakCount = logs.filter((l) => !l.logoutAt && l.activeBreakType).length;
  const overtimeCount = logs.filter(
    (l) => l.lunchDuration > LIMITS.lunch || l.bioDuration > LIMITS.bio || l.teaDuration > LIMITS.tea
  ).length;

  const filtered = logs.filter((l) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const match =
        (l.agentName || '').toLowerCase().includes(q) ||
        (l.agentEmail || '').toLowerCase().includes(q) ||
        (l.tlName || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    const isActive = !l.logoutAt;
    if (statusFilter === 'active') return isActive && !l.activeBreakType;
    if (statusFilter === 'break') return isActive && Boolean(l.activeBreakType);
    if (statusFilter === 'overtime') {
      return l.lunchDuration > LIMITS.lunch || l.bioDuration > LIMITS.bio || l.teaDuration > LIMITS.tea;
    }
    return true;
  });

  const renderBreakBar = (label, duration, limit) => {
    const pct = Math.min(100, Math.round((duration / limit) * 100));
    const isOver = duration > limit;
    const color = isOver ? COLORS.danger : pct > 75 ? COLORS.warning : COLORS.success;
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.breakLabel}>
          {label}: <Text style={{ color }}>{fmtDuration(duration)}</Text>
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLogs} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 10 }}>
            <View style={styles.statsRow}>
              <StatCard title="Active Now" value={activeCount} icon={Activity} accent={COLORS.success} />
              <StatCard title="On Break" value={breakCount} icon={Coffee} accent={COLORS.primary} />
              <StatCard title="Overtime" value={overtimeCount} icon={AlertTriangle} accent={COLORS.danger} />
            </View>

            <View style={styles.searchWrap}>
              <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search agent or Team Lead..."
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.filterRow}>
              {[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Working' },
                { key: 'break', label: 'On Break' },
                { key: 'overtime', label: 'Overtime' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setStatusFilter(f.key)}
                  style={[styles.pill, statusFilter === f.key && styles.pillActive]}
                >
                  <Text style={[styles.pillText, statusFilter === f.key && styles.pillTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={!loading && <EmptyState icon={Clock} title="No Work Logs Found" />}
        renderItem={({ item }) => {
          const isOnline = !item.logoutAt;
          const gross = Math.max(
            0,
            Math.floor(((item.logoutAt ? new Date(item.logoutAt).getTime() : Date.now()) - new Date(item.loginAt).getTime()) / 1000)
          );
          const netWork = item.logoutAt ? item.totalWorkTime : Math.max(0, gross - (item.lunchDuration + item.bioDuration + item.teaDuration));

          return (
            <GlassCard style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{item.agentName}</Text>
                  <Text style={styles.agentMeta}>TL: {item.tlName || 'None'} • Net Work: {fmtDuration(netWork)}</Text>
                </View>
                <Badge
                  label={item.activeBreakType ? `Break (${item.activeBreakType})` : isOnline ? 'Online' : 'Logged Out'}
                  color={item.activeBreakType ? COLORS.warning : isOnline ? COLORS.success : COLORS.textMuted}
                  bg={item.activeBreakType ? COLORS.warningLight : isOnline ? COLORS.successLight : '#f1f5f9'}
                />
              </View>

              <Text style={styles.sessionTimes}>
                In: {formatDateTime(item.loginAt)}  •  Out: {item.logoutAt ? formatDateTime(item.logoutAt) : 'Active'}
              </Text>

              <View style={styles.breaksRow}>
                {renderBreakBar('Lunch', item.lunchDuration || 0, LIMITS.lunch)}
                {renderBreakBar('Tea', item.teaDuration || 0, LIMITS.tea)}
                {renderBreakBar('Bio', item.bioDuration || 0, LIMITS.bio)}
              </View>
            </GlassCard>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  searchWrap: {
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.borderSlate },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  pillTextActive: { color: '#fff' },
  card: { marginBottom: 10, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  agentName: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  agentMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sessionTimes: { fontSize: 11.5, color: COLORS.textSecondary },
  breaksRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  breakLabel: { fontSize: 10.5, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 },
  track: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});

export default AgentLogsScreen;
