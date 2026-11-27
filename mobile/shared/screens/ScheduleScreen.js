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
import { COLORS } from '../theme';
import {
  GlassCard,
  Badge,
  EmptyState,
  getContactName,
  getContactPhone,
  formatDateTime,
  openDialer,
} from '../components/UI';
import { Calendar, Clock, PhoneOff, Search, PhoneCall, Trash2 } from 'lucide-react-native';

const ScheduleScreen = ({ onOpenWorkflow, includeHungUp = false }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isAgent = user?.role === 'agent';
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  const [tab, setTab] = useState('appointments'); // 'appointments' | 'callbacks' | 'hungup'
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'appointments') {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (search.trim()) params.append('search', search.trim());
        const res = await api.get(`/leads/appointments?${params.toString()}`);
        setItems(res.data?.appointments || (Array.isArray(res.data) ? res.data : []));
      } else if (tab === 'callbacks') {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (search.trim()) params.append('search', search.trim());
        const res = await api.get(`/leads/callbacks?${params.toString()}`);
        const list = res.data?.callbacks || (Array.isArray(res.data) ? res.data : []);
        list.sort((a, b) => {
          if (!a.callBackDt) return -1;
          if (!b.callBackDt) return 1;
          return new Date(a.callBackDt) - new Date(b.callBackDt);
        });
        setItems(list);
      } else {
        const [hung, unans] = await Promise.all([
          api.get('/contacts?disposition=HungUp'),
          api.get('/contacts?disposition=CallNotAnswered'),
        ]);
        const hList = Array.isArray(hung.data) ? hung.data : hung.data?.contacts || [];
        const uList = Array.isArray(unans.data) ? unans.data : unans.data?.contacts || [];
        const permanent = [...hList, ...uList].filter((c) => c.queueOrder === 999999);
        permanent.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        setItems(permanent);
      }
    } catch {
      // Keep previous list
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(fetchTab, 250);
    return () => clearTimeout(t);
  }, [fetchTab]);

  useEffect(() => {
    if (!socket) return;
    const h = () => fetchTab();
    ['contact_disposed', 'contacts_updated', 'appointment_scheduled', 'appointment_cancelled'].forEach((e) =>
      socket.on(e, h)
    );
    return () =>
      ['contact_disposed', 'contacts_updated', 'appointment_scheduled', 'appointment_cancelled'].forEach((e) =>
        socket.off(e, h)
      );
  }, [socket, fetchTab]);

  const handleContactNow = async (item) => {
    const targetId = item.contactId || item._id || item.id;
    try {
      await api.post(`/contacts/${targetId}/requeue`);
      if (onOpenWorkflow) onOpenWorkflow(targetId);
      else Alert.alert('Queued', 'Added to calling workflow queue.');
    } catch {
      Alert.alert('Error', 'Could not requeue contact.');
    }
  };

  const handleDelete = (item) => {
    const id = item._id || item.id;
    const endpoint = tab === 'appointments' ? `/leads/appointments/${id}` : `/leads/callbacks/${id}`;
    Alert.alert('Delete Record', 'Remove this record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(endpoint);
            fetchTab();
          } catch {
            Alert.alert('Error', 'Delete failed.');
          }
        },
      },
    ]);
  };

  const filteredItems =
    tab === 'hungup' && search.trim()
      ? items.filter((c) =>
          Object.values(c.fields || {}).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
        )
      : items;

  const tabs = [
    { key: 'appointments', label: 'Appointments', Icon: Calendar },
    { key: 'callbacks', label: 'Callbacks', Icon: Clock },
    ...(includeHungUp ? [{ key: 'hungup', label: 'Hung Up', Icon: PhoneOff }] : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {tabs.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tabBtn, active && styles.tabBtnActive]}>
              <Icon size={15} color={active ? '#fff' : COLORS.textSecondary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchBox}>
        <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${tab}...`}
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item, idx) => item._id || item.id || String(idx)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTab} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon={tab === 'appointments' ? Calendar : tab === 'callbacks' ? Clock : PhoneOff}
              title={`No ${tab} found`}
              subtitle="Scheduled follow-ups and call outcomes will appear here."
            />
          )
        }
        renderItem={({ item }) => {
          const name = getContactName(item.fields);
          const phone = getContactPhone(item.fields);
          const dt = tab === 'appointments' ? item.appointmentDt : tab === 'callbacks' ? item.callBackDt : item.lastModified;
          const isDue = dt && new Date(dt).getTime() <= Date.now();

          return (
            <GlassCard style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={styles.sub}>{phone || 'No Phone'} • {item.agentName || 'Agent'}</Text>
                  <Text style={styles.timeText}>{formatDateTime(dt)}</Text>
                </View>
                {tab !== 'hungup' ? (
                  <Badge
                    label={isDue ? 'Due / Past' : 'Upcoming'}
                    color={isDue ? COLORS.danger : COLORS.primary}
                    bg={isDue ? COLORS.dangerLight : COLORS.primaryLight}
                  />
                ) : (
                  <Badge label={item.disposition || 'Failed'} color={COLORS.danger} bg={COLORS.dangerLight} />
                )}
              </View>

              {!!item.remarks && <Text style={styles.remarks} numberOfLines={2}>{item.remarks}</Text>}

              <View style={styles.cardActions}>
                {!!phone && (
                  <TouchableOpacity onPress={() => openDialer(phone)} style={styles.actionBtn}>
                    <PhoneCall size={14} color={COLORS.success} />
                    <Text style={[styles.actionText, { color: COLORS.success }]}>Call</Text>
                  </TouchableOpacity>
                )}
                {isAgent && tab !== 'hungup' && (
                  <TouchableOpacity onPress={() => handleContactNow(item)} style={[styles.actionBtn, { backgroundColor: COLORS.primaryLight }]}>
                    <Text style={[styles.actionText, { color: COLORS.primary }]}>Contact Now</Text>
                  </TouchableOpacity>
                )}
                {isAdmin && tab !== 'hungup' && (
                  <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.actionBtn, { backgroundColor: COLORS.dangerLight }]}>
                    <Trash2 size={14} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
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
  tabBar: { flexDirection: 'row', gap: 8, padding: 14, paddingBottom: 8 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
  },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },
  searchBox: {
    marginHorizontal: 14,
    height: 42,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.textPrimary },
  card: { marginBottom: 10, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  timeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 3 },
  remarks: { fontSize: 12, color: COLORS.textSecondary },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceMuted,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});

export default ScheduleScreen;
