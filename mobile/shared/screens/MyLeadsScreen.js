import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { COLORS, LEAD_STATUS_OPTIONS } from '../theme';
import {
  GlassCard,
  StatCard,
  Badge,
  EmptyState,
  getContactName,
  getContactPhone,
  formatCurrency,
  formatDateTime,
  openDialer,
  openWhatsApp,
} from '../components/UI';
import {
  ReceiptUploadModal,
  LeadStatusModal,
  CharityConfirmModal,
  CreateLeadModal,
  LeadDetailModal,
} from '../components/ReceiptModals';
import { Star, TrendingUp, Search, Plus, PhoneCall, MessageCircle, Trash2, ShieldCheck } from 'lucide-react-native';

const STATUS_COLORS = {
  Converted: { color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  'Call Back': { color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  'Not Interested': { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  'DNC/DND': { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  Others: { color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
};

const MyLeadsScreen = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const canConfirmCharity = ['admin', 'superadmin'].includes(user?.role);

  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ totalLeads: 0, totalAmount: 0, allLeadsCount: 0, allLeadsAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [detailLead, setDetailLead] = useState(null);
  const [statusModal, setStatusModal] = useState({ lead: null, status: null });
  const [receiptLead, setReceiptLead] = useState(null);
  const [charityLead, setCharityLead] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '60' });
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);

      const [leadsRes, statsRes] = await Promise.all([
        api.get(`/leads/my-leads?${params.toString()}`),
        api.get('/leads/stats'),
      ]);
      setLeads(leadsRes.data?.leads || (Array.isArray(leadsRes.data) ? leadsRes.data : []));
      if (statsRes.data) setStats(statsRes.data);
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sourceFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchLeads(), 250);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchLeads(true);
    ['lead_disposed', 'lead_updated', 'contacts_updated'].forEach((e) => socket.on(e, handler));
    return () => ['lead_disposed', 'lead_updated', 'contacts_updated'].forEach((e) => socket.off(e, handler));
  }, [socket, fetchLeads]);

  const handleCreateLead = async (payload) => {
    setSubmitting(true);
    try {
      await api.post('/leads', payload);
      setCreateOpen(false);
      fetchLeads();
    } catch (err) {
      Alert.alert('Create Lead Error', err.response?.data?.error || 'Could not create lead.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveStatus = async (payload) => {
    if (!statusModal.lead || !statusModal.status) return;
    setSubmitting(true);
    try {
      const id = statusModal.lead._id || statusModal.lead.id;
      await api.put(`/leads/${id}`, { status: statusModal.status, ...payload });
      setStatusModal({ lead: null, status: null });
      fetchLeads();
    } catch (err) {
      Alert.alert('Update Error', err.response?.data?.error || 'Failed to update lead status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = (leadId) => {
    Alert.alert('Delete Lead', 'Delete this lead permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/leads/${leadId}`);
            fetchLeads();
          } catch {
            Alert.alert('Error', 'Delete failed.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={leads}
        keyExtractor={(item) => item._id || item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchLeads()} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 10 }}>
            <View style={styles.statsRow}>
              <StatCard title="Converted" value={stats.totalLeads || 0} subtext={formatCurrency(stats.totalAmount)} icon={Star} accent="#10b981" />
              <StatCard title="All Leads" value={stats.allLeadsCount || 0} subtext={formatCurrency(stats.allLeadsAmount)} icon={TrendingUp} accent="#2563eb" />
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search lead name, phone, UTR..."
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity onPress={() => setCreateOpen(true)} style={styles.addBtn}>
                <Plus size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterRow}>
              {['all', ...LEAD_STATUS_OPTIONS].map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => setStatusFilter(st)}
                  style={[styles.pill, statusFilter === st && styles.pillActive]}
                >
                  <Text style={[styles.pillText, statusFilter === st && styles.pillTextActive]}>
                    {st === 'all' ? 'All Status' : st}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterRow}>
              {[
                { key: 'all', label: 'All Sources' },
                { key: 'created', label: 'Created' },
                { key: 'uploaded', label: 'Uploaded' },
              ].map((src) => (
                <TouchableOpacity
                  key={src.key}
                  onPress={() => setSourceFilter(src.key)}
                  style={[styles.pill, sourceFilter === src.key && styles.pillActive]}
                >
                  <Text style={[styles.pillText, sourceFilter === src.key && styles.pillTextActive]}>
                    {src.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon={Star}
              title="No Leads Found"
              subtitle="Adjust your filters or tap + to add a new lead."
            />
          )
        }
        renderItem={({ item }) => {
          const id = item._id || item.id;
          const name = getContactName(item.fields);
          const phone = getContactPhone(item.fields);
          const sc = STATUS_COLORS[item.status] || { color: COLORS.primary, bg: COLORS.primaryLight };

          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setDetailLead(item)}>
              <GlassCard style={styles.leadCard}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leadName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.leadPhone}>{phone || 'No Phone'} • {item.agentName || 'Agent'}</Text>
                  </View>
                  <Text style={styles.amountText}>{formatCurrency(item.leadAmount)}</Text>
                </View>

                <View style={styles.badgeRow}>
                  <Badge label={item.status || 'Lead'} color={sc.color} bg={sc.bg} />
                  {item.isCharityConfirmed && (
                    <Badge label="Charity Confirmed" color={COLORS.success} bg={COLORS.successLight} />
                  )}
                  {!!item.transactionId && (
                    <Text style={styles.utrText}>UTR: {item.transactionId}</Text>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.dateText}>{formatDateTime(item.conversionDate || item.createdAt)}</Text>
                  <View style={styles.quickIcons}>
                    {!!phone && (
                      <>
                        <TouchableOpacity onPress={() => openDialer(phone)} style={styles.miniBtn}>
                          <PhoneCall size={15} color={COLORS.success} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openWhatsApp(phone)} style={styles.miniBtn}>
                          <MessageCircle size={15} color="#16a34a" />
                        </TouchableOpacity>
                      </>
                    )}
                    {canConfirmCharity && (
                      <TouchableOpacity onPress={() => setCharityLead(item)} style={styles.miniBtn}>
                        <ShieldCheck size={15} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                    {canConfirmCharity && (
                      <TouchableOpacity onPress={() => handleDeleteLead(id)} style={styles.miniBtn}>
                        <Trash2 size={15} color={COLORS.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          );
        }}
      />

      <LeadDetailModal
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onStatusSelect={(lead, st) => setStatusModal({ lead, status: st })}
        onOpenReceipt={(lead) => setReceiptLead(lead)}
        onOpenCharityConfirm={(lead) => setCharityLead(lead)}
        canConfirmCharity={canConfirmCharity}
      />

      <LeadStatusModal
        lead={statusModal.lead}
        newStatus={statusModal.status}
        onClose={() => setStatusModal({ lead: null, status: null })}
        onSave={handleSaveStatus}
        submitting={submitting}
      />

      <ReceiptUploadModal
        lead={receiptLead}
        onClose={() => setReceiptLead(null)}
        onSuccess={() => fetchLeads()}
      />

      <CharityConfirmModal
        lead={charityLead}
        onClose={() => setCharityLead(null)}
        onSuccess={() => fetchLeads()}
      />

      <CreateLeadModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreateLead}
        submitting={submitting}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  listContent: { padding: 14, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 10 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchWrap: {
    flex: 1,
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
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.textSecondary },
  pillTextActive: { color: '#fff' },
  leadCard: { marginBottom: 10, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  leadName: { fontSize: 15.5, fontWeight: '800', color: COLORS.textPrimary },
  leadPhone: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  amountText: { fontSize: 16, fontWeight: '900', color: COLORS.success },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  utrText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textSecondary },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  dateText: { fontSize: 11, color: COLORS.textMuted },
  quickIcons: { flexDirection: 'row', gap: 8 },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MyLeadsScreen;
