import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
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
  openDialer,
  openWhatsApp,
} from '../components/UI';
import { Database, Search, PhoneCall, MessageCircle, RotateCw, Trash2 } from 'lucide-react-native';

const ContactsScreen = ({ onOpenWorkflow }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const isAgent = user?.role === 'agent';

  const [contacts, setContacts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then((res) => {
        setAgents((res.data || []).filter((u) => u.role === 'agent'));
      }).catch(() => {});
    } else if (user?.role === 'tl') {
      api.get('/users/my-agents').then((res) => {
        setAgents(res.data || []);
      }).catch(() => {});
    }
  }, [isAdmin, user]);

  const trimmed = search.trim();
  const isPhoneLike = /^[0-9\s+\-()]+$/.test(trimmed);
  const digitCount = (trimmed.match(/\d/g) || []).length;
  const isShortPhone = isAgent && isPhoneLike && digitCount > 0 && digitCount < 5;

  const fetchContacts = useCallback(async () => {
    if ((isAdmin || isAgent) && !selectedAgent && (!trimmed || isShortPhone)) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (selectedAgent) params.append('agentId', selectedAgent);
      if (trimmed) params.append('search', trimmed);
      const res = await api.get(`/contacts?${params.toString()}`);
      setContacts(res.data?.contacts || (Array.isArray(res.data) ? res.data : []));
    } catch {
      // Keep previous list on transient error
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isAgent, selectedAgent, trimmed, isShortPhone]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, 300);
    return () => clearTimeout(t);
  }, [fetchContacts]);

  useEffect(() => {
    if (!socket) return;
    const h = () => fetchContacts();
    ['contacts_updated', 'batch_uploaded'].forEach((e) => socket.on(e, h));
    return () => ['contacts_updated', 'batch_uploaded'].forEach((e) => socket.off(e, h));
  }, [socket, fetchContacts]);

  const handleRequeue = async (id) => {
    try {
      await api.post(`/contacts/${id}/requeue`);
      if (onOpenWorkflow) onOpenWorkflow(id);
      else Alert.alert('Queued', 'Contact moved to calling queue.');
    } catch {
      Alert.alert('Error', 'Unable to requeue contact.');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Contact', 'Remove this contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/contacts/${id}`);
            fetchContacts();
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
        data={contacts}
        keyExtractor={(item) => item._id || item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchContacts} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 10 }}>
            <View style={styles.searchWrap}>
              <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={isAgent ? 'Search name or min 5 phone digits...' : 'Search name, phone, batch...'}
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
              />
            </View>

            {agents.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  onPress={() => setSelectedAgent('')}
                  style={[styles.pill, !selectedAgent && styles.pillActive]}
                >
                  <Text style={[styles.pillText, !selectedAgent && styles.pillTextActive]}>All Agents</Text>
                </TouchableOpacity>
                {agents.map((a) => {
                  const aid = a._id || a.id;
                  const active = selectedAgent === aid;
                  return (
                    <TouchableOpacity
                      key={aid}
                      onPress={() => setSelectedAgent(aid)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{a.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Database}
            title={
              isShortPhone
                ? 'Enter at least 5 digits'
                : (isAdmin || isAgent) && !selectedAgent && !trimmed
                ? 'Search or Filter Contacts'
                : 'No Matching Contacts'
            }
            subtitle={
              isAgent
                ? 'For privacy, search by customer name or at least 5 phone digits.'
                : 'Enter a search query or choose an agent filter above.'
            }
          />
        }
        renderItem={({ item }) => {
          const id = item._id || item.id;
          const name = getContactName(item.fields);
          const phone = getContactPhone(item.fields);

          return (
            <GlassCard style={styles.card}>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Text style={styles.sub}>{phone || 'No Phone'} • {item.agentName || 'Unassigned'}</Text>
                </View>
                <Badge
                  label={item.disposition || 'Pending'}
                  color={item.disposition ? COLORS.primary : COLORS.warning}
                  bg={item.disposition ? COLORS.primaryLight : COLORS.warningLight}
                />
              </View>
              <View style={styles.actionsRow}>
                {!!phone && (
                  <>
                    <TouchableOpacity onPress={() => openDialer(phone)} style={styles.actionBtn}>
                      <PhoneCall size={14} color={COLORS.success} />
                      <Text style={[styles.actionTxt, { color: COLORS.success }]}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openWhatsApp(phone)} style={styles.actionBtn}>
                      <MessageCircle size={14} color="#16a34a" />
                      <Text style={[styles.actionTxt, { color: '#16a34a' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  </>
                )}
                {isAgent && (
                  <TouchableOpacity onPress={() => handleRequeue(id)} style={styles.actionBtn}>
                    <RotateCw size={14} color={COLORS.primary} />
                    <Text style={[styles.actionTxt, { color: COLORS.primary }]}>Queue</Text>
                  </TouchableOpacity>
                )}
                {isAdmin && (
                  <TouchableOpacity onPress={() => handleDelete(id)} style={styles.actionBtn}>
                    <Trash2 size={14} color={COLORS.danger} />
                    <Text style={[styles.actionTxt, { color: COLORS.danger }]}>Delete</Text>
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
  listContent: { padding: 14, paddingBottom: 32 },
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
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
    marginRight: 6,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  pillTextActive: { color: '#fff' },
  card: { marginBottom: 10, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceMuted,
  },
  actionTxt: { fontSize: 12, fontWeight: '700' },
});

export default ContactsScreen;
