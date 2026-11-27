import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../contexts/AuthContext';
import api, { getApiBaseUrl, getAccessToken } from '../services/api';
import { COLORS } from '../theme';
import { GlassCard, StatCard, GradientButton, formatCurrency } from '../components/UI';
import { BarChart2, Download, Star, PhoneCall, CheckCircle2 } from 'lucide-react-native';

const REPORT_TYPES = [
  { value: 'all-leads', label: 'Total Leads' },
  { value: 'converted', label: 'Converted' },
  { value: 'all-contacts', label: 'All Contacts' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'callbacks', label: 'Callbacks' },
  { value: 'agent-log', label: 'Agent Logs' },
];

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ReportsScreen = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [reportType, setReportType] = useState('all-leads');
  const [companies, setCompanies] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [preset, setPreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [stats, setStats] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const applyPreset = (p) => {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      const s = fmtDate(now);
      setFromDate(s);
      setToDate(s);
    } else if (p === 'week') {
      const w = new Date();
      w.setDate(now.getDate() - 7);
      setFromDate(fmtDate(w));
      setToDate(fmtDate(now));
    } else if (p === 'month') {
      setFromDate(fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(fmtDate(now));
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/reports/companies').then((r) => setCompanies(r.data || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const qs = isSuperAdmin && selectedAdmin ? `?adminId=${selectedAdmin}` : '';
    api.get(`/reports/agents${qs}`).then((r) => setAgents(r.data || [])).catch(() => {});
  }, [isSuperAdmin, selectedAdmin]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAdmin) params.append('adminId', selectedAdmin);
      if (selectedAgent) params.append('agentId', selectedAgent);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const pParams = new URLSearchParams(params);
      pParams.append('type', reportType);

      const [statsRes, prevRes] = await Promise.all([
        api.get(`/contacts/stats${qs}`),
        api.get(`/reports/preview?${pParams.toString()}`),
      ]);
      setStats(statsRes.data);
      setPreview(prevRes.data);
    } catch {
      // Keep previous report data
    } finally {
      setLoading(false);
    }
  }, [reportType, selectedAdmin, selectedAgent, fromDate, toDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ type: reportType });
      if (selectedAdmin) params.append('adminId', selectedAdmin);
      if (selectedAgent) params.append('agentId', selectedAgent);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const downloadUrl = `${getApiBaseUrl()}/reports/export?${params.toString()}`;
      const targetUri = `${FileSystem.cacheDirectory}nexus_${reportType}_${Date.now()}.xlsx`;
      const token = getAccessToken();

      const res = await FileSystem.downloadAsync(downloadUrl, targetUri, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Client-Platform': 'mobile',
        },
      });

      if (res.status >= 400) {
        Alert.alert('Export Failed', 'No matching records or unauthorized export.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri);
      } else {
        Alert.alert('Downloaded', `Saved to ${res.uri}`);
      }
    } catch {
      Alert.alert('Export Error', 'Unable to download report file.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchReport} />}
    >
      <GlassCard style={{ gap: 10 }}>
        <View style={styles.titleRow}>
          <BarChart2 size={20} color={COLORS.primary} />
          <Text style={styles.heading}>Analytics & Export</Text>
        </View>

        <Text style={styles.label}>REPORT TYPE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {REPORT_TYPES.map((rt) => {
            const active = reportType === rt.value;
            return (
              <TouchableOpacity
                key={rt.value}
                onPress={() => setReportType(rt.value)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{rt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>DATE RANGE</Text>
        <View style={styles.wrapRow}>
          {[
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'Last 7 Days' },
            { key: 'month', label: 'This Month' },
          ].map((p) => (
            <TouchableOpacity
              key={p.key}
              onPress={() => applyPreset(p.key)}
              style={[styles.pill, preset === p.key && styles.pillActive]}
            >
              <Text style={[styles.pillText, preset === p.key && styles.pillTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSuperAdmin && companies.length > 0 && (
          <>
            <Text style={styles.label}>COMPANY / ADMIN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setSelectedAdmin('')} style={[styles.pill, !selectedAdmin && styles.pillActive]}>
                <Text style={[styles.pillText, !selectedAdmin && styles.pillTextActive]}>All Companies</Text>
              </TouchableOpacity>
              {companies.map((c) => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedAdmin(c.id)} style={[styles.pill, selectedAdmin === c.id && styles.pillActive]}>
                  <Text style={[styles.pillText, selectedAdmin === c.id && styles.pillTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {agents.length > 0 && (
          <>
            <Text style={styles.label}>AGENT FILTER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setSelectedAgent('')} style={[styles.pill, !selectedAgent && styles.pillActive]}>
                <Text style={[styles.pillText, !selectedAgent && styles.pillTextActive]}>All Agents</Text>
              </TouchableOpacity>
              {agents.map((a) => (
                <TouchableOpacity key={a.id} onPress={() => setSelectedAgent(a.id)} style={[styles.pill, selectedAgent === a.id && styles.pillActive]}>
                  <Text style={[styles.pillText, selectedAgent === a.id && styles.pillTextActive]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <GradientButton title="Export & Share Excel (.xlsx)" icon={Download} onPress={handleExport} loading={exporting} />
      </GlassCard>

      <View style={styles.statsRow}>
        <StatCard title="Calls Today" value={stats?.todayCalls || 0} subtext="Disposed" icon={PhoneCall} accent="#06b6d4" />
        <StatCard title="Converted" value={stats?.lead || 0} subtext={formatCurrency(stats?.totalLeadAmount)} icon={CheckCircle2} accent="#10b981" />
      </View>

      <GlassCard style={{ gap: 8 }}>
        <Text style={styles.heading}>Preview ({preview?.rows?.length || 0} rows)</Text>
        {(preview?.rows || []).slice(0, 15).map((row, i) => (
          <View key={i} style={styles.previewRow}>
            <Text style={styles.previewMain} numberOfLines={1}>
              {row.Name || row.name || row['Agent Name'] || row['Donor Name'] || `Row #${i + 1}`}
            </Text>
            <Text style={styles.previewMeta} numberOfLines={1}>
              {Object.entries(row).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' • ')}
            </Text>
          </View>
        ))}
        {(!preview?.rows || preview.rows.length === 0) && (
          <Text style={styles.emptyMeta}>No records match the selected filters.</Text>
        )}
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
    marginRight: 6,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  pillTextActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 10 },
  previewRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  previewMain: { fontSize: 13.5, fontWeight: '700', color: COLORS.textPrimary },
  previewMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  emptyMeta: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 14 },
});

export default ReportsScreen;
