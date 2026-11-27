import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { COLORS } from '../theme';
import { GlassCard, StatCard, Badge, GradientButton, EmptyState } from '../components/UI';
import { Users as UsersIcon, Shield, UserCheck, Search, Plus, Edit2, Trash2, X } from 'lucide-react-native';

const UsersScreen = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isSuperAdmin = user?.role === 'superadmin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [tlActionModal, setTlActionModal] = useState(false);
  const [tlDisposition, setTlDisposition] = useState({ action: 'reassign', newTlId: '' });

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'agent',
    active: true,
    tlId: '',
    receiverMail: '',
    smtpGmail: '',
    smtpPassword: '',
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch {
      // Keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!socket) return;
    socket.on('users_updated', fetchUsers);
    return () => socket.off('users_updated', fetchUsers);
  }, [socket, fetchUsers]);

  const tls = users.filter((u) => u.role === 'tl');
  const admins = users.filter((u) => u.role === 'admin');
  const agents = users.filter((u) => u.role === 'agent');

  const filtered = users
    .filter((u) => (isSuperAdmin ? true : u.role !== 'admin'))
    .filter(
      (u) =>
        (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(search.toLowerCase())
    );

  const openModal = (u = null) => {
    if (u) {
      setEditing(u);
      setForm({
        name: u.name || '',
        username: u.username || '',
        password: '',
        role: u.role,
        active: Boolean(u.active),
        tlId: u.tlId || '',
        receiverMail: u.receiverMail || '',
        smtpGmail: u.smtpGmail || '',
        smtpPassword: '',
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        username: '',
        password: '',
        role: isSuperAdmin ? 'admin' : 'agent',
        active: true,
        tlId: '',
        receiverMail: '',
        smtpGmail: '',
        smtpPassword: '',
      });
    }
    setModalOpen(true);
  };

  const submitUser = async (forceDisposition = false) => {
    if (!form.name.trim() || (!editing && !form.username.trim())) {
      Alert.alert('Required', 'Full name and username/email are required.');
      return;
    }
    if (!editing && !form.password) {
      Alert.alert('Required', 'Password is required when creating a user.');
      return;
    }

    if (editing && editing.role === 'tl' && form.active === false && editing.active === true && !forceDisposition) {
      const assignedCount = agents.filter((a) => a.tlId === (editing._id || editing.id)).length;
      if (assignedCount > 0) {
        setTlActionModal(true);
        return;
      }
    }

    setSaving(true);
    try {
      if (editing) {
        const uid = editing._id || editing.id;
        const payload = {
          name: form.name.trim(),
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
          ...(form.role === 'agent' ? { tlId: form.tlId } : {}),
          ...(form.role === 'admin'
            ? {
                receiverMail: form.receiverMail,
                smtpGmail: form.smtpGmail,
                ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
              }
            : {}),
          ...(forceDisposition
            ? {
                agentAction: tlDisposition.action,
                ...(tlDisposition.action === 'reassign' ? { newTlId: tlDisposition.newTlId } : {}),
              }
            : {}),
        };
        await api.put(`/users/${uid}`, payload);
      } else {
        await api.post('/users', form);
      }
      setModalOpen(false);
      setTlActionModal(false);
      fetchUsers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save user.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!form.smtpGmail || !form.smtpPassword || !form.receiverMail) {
      Alert.alert('Required', 'Fill in SMTP Gmail, App Password, and Receiver Email.');
      return;
    }
    setTestingSmtp(true);
    try {
      await api.post('/mail/test-connection', {
        smtpGmail: form.smtpGmail,
        smtpPassword: form.smtpPassword,
        receiverMail: form.receiverMail,
      });
      Alert.alert('Success', 'Test email sent successfully!');
    } catch (err) {
      Alert.alert('SMTP Error', err.response?.data?.error || 'Connection test failed.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleDelete = (u) => {
    const uid = u._id || u.id;
    Alert.alert('Delete User', `Delete ${u.name || u.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/users/${uid}`);
            fetchUsers();
          } catch (err) {
            Alert.alert('Error', err.response?.data?.error || 'Delete failed.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id || item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchUsers} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 10 }}>
            <View style={styles.statsRow}>
              {isSuperAdmin && <StatCard title="Admins" value={admins.length} icon={Shield} accent="#f59e0b" />}
              <StatCard title="Team Leads" value={tls.length} icon={UserCheck} accent="#2563eb" />
              <StatCard title="Agents" value={agents.length} icon={UsersIcon} accent="#059669" />
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search users by name or email..."
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity onPress={() => openModal()} style={styles.addBtn}>
                <Plus size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={!loading && <EmptyState icon={UsersIcon} title="No Users Found" />}
        renderItem={({ item }) => (
          <GlassCard style={styles.userCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.name || item.username}</Text>
              <Text style={styles.userMeta}>@{item.username}</Text>
              <View style={styles.badges}>
                <Badge label={item.role.toUpperCase()} color={COLORS.primary} bg={COLORS.primaryLight} />
                <Badge
                  label={item.active ? 'Active' : 'Inactive'}
                  color={item.active ? COLORS.success : COLORS.danger}
                  bg={item.active ? COLORS.successLight : COLORS.dangerLight}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => openModal(item)} style={styles.iconAction}>
                <Edit2 size={16} color={COLORS.primary} />
              </TouchableOpacity>
              {isSuperAdmin && item.role !== 'superadmin' && (
                <TouchableOpacity onPress={() => handleDelete(item)} style={[styles.iconAction, { backgroundColor: COLORS.dangerLight }]}>
                  <Trash2 size={16} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>
        )}
      />

      {/* Create / Edit User Modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit User' : 'Create User'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>FULL NAME *</Text>
              <TextInput value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} style={styles.input} />

              <Text style={styles.label}>USERNAME / EMAIL *</Text>
              <TextInput
                value={form.username}
                onChangeText={(v) => setForm((p) => ({ ...p, username: v }))}
                editable={!editing}
                autoCapitalize="none"
                style={[styles.input, editing && { opacity: 0.6 }]}
              />

              <Text style={styles.label}>{editing ? 'NEW PASSWORD (BLANK = KEEP)' : 'PASSWORD (8+ CHARS, AA1!) *'}</Text>
              <TextInput
                value={form.password}
                onChangeText={(v) => setForm((p) => ({ ...p, password: v }))}
                secureTextEntry
                style={styles.input}
              />

              {!editing && (
                <>
                  <Text style={styles.label}>ROLE</Text>
                  <View style={styles.chipRow}>
                    {(isSuperAdmin ? ['admin'] : ['agent', 'tl']).map((r) => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setForm((p) => ({ ...p, role: r }))}
                        style={[styles.chip, form.role === r && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, form.role === r && styles.chipTextActive]}>{r.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {editing && (
                <>
                  <Text style={styles.label}>ACCOUNT STATUS</Text>
                  <View style={styles.chipRow}>
                    {[true, false].map((val) => (
                      <TouchableOpacity
                        key={String(val)}
                        onPress={() => setForm((p) => ({ ...p, active: val }))}
                        style={[styles.chip, form.active === val && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, form.active === val && styles.chipTextActive]}>
                          {val ? 'Active' : 'Inactive'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {form.role === 'agent' && tls.length > 0 && (
                <>
                  <Text style={styles.label}>ASSIGN TEAM LEAD</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <TouchableOpacity onPress={() => setForm((p) => ({ ...p, tlId: '' }))} style={[styles.chip, !form.tlId && styles.chipActive]}>
                      <Text style={[styles.chipText, !form.tlId && styles.chipTextActive]}>Unassigned</Text>
                    </TouchableOpacity>
                    {tls.map((t) => {
                      const tid = t._id || t.id;
                      return (
                        <TouchableOpacity key={tid} onPress={() => setForm((p) => ({ ...p, tlId: tid }))} style={[styles.chip, form.tlId === tid && styles.chipActive]}>
                          <Text style={[styles.chipText, form.tlId === tid && styles.chipTextActive]}>{t.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {form.role === 'admin' && (
                <>
                  <Text style={styles.label}>RECEIVER EMAIL *</Text>
                  <TextInput value={form.receiverMail} onChangeText={(v) => setForm((p) => ({ ...p, receiverMail: v }))} autoCapitalize="none" style={styles.input} />
                  <Text style={styles.label}>ADMIN SMTP GMAIL *</Text>
                  <TextInput value={form.smtpGmail} onChangeText={(v) => setForm((p) => ({ ...p, smtpGmail: v }))} autoCapitalize="none" style={styles.input} />
                  <Text style={styles.label}>GMAIL APP PASSWORD {editing?.hasSmtpPassword ? '(BLANK = KEEP)' : '*'}</Text>
                  <TextInput value={form.smtpPassword} onChangeText={(v) => setForm((p) => ({ ...p, smtpPassword: v }))} secureTextEntry style={styles.input} />
                  <TouchableOpacity onPress={handleTestSmtp} disabled={testingSmtp} style={styles.testSmtpBtn}>
                    <Text style={{ color: COLORS.success, fontWeight: '700', fontSize: 13 }}>
                      {testingSmtp ? 'Testing SMTP...' : 'Test SMTP Connection'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <GradientButton title={editing ? 'Save Changes' : 'Create User'} onPress={() => submitUser(false)} loading={saving} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TL Inactivation Agent Disposition Modal */}
      <Modal visible={tlActionModal} transparent animationType="fade" onRequestClose={() => setTlActionModal(false)}>
        <View style={styles.centerOverlay}>
          <View style={styles.centerBox}>
            <Text style={[styles.modalTitle, { color: COLORS.danger, marginBottom: 8 }]}>Handle Assigned Agents</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => setTlDisposition((p) => ({ ...p, action: 'reassign' }))}
                style={[styles.chip, tlDisposition.action === 'reassign' && styles.chipActive]}
              >
                <Text style={[styles.chipText, tlDisposition.action === 'reassign' && styles.chipTextActive]}>Reassign to TL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTlDisposition((p) => ({ ...p, action: 'inactivate' }))}
                style={[styles.chip, tlDisposition.action === 'inactivate' && styles.chipActive]}
              >
                <Text style={[styles.chipText, tlDisposition.action === 'inactivate' && styles.chipTextActive]}>Inactivate Agents</Text>
              </TouchableOpacity>
            </View>
            {tlDisposition.action === 'reassign' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {tls.filter((t) => (t._id || t.id) !== (editing?._id || editing?.id) && t.active).map((t) => {
                  const tid = t._id || t.id;
                  return (
                    <TouchableOpacity
                      key={tid}
                      onPress={() => setTlDisposition((p) => ({ ...p, newTlId: tid }))}
                      style={[styles.chip, tlDisposition.newTlId === tid && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, tlDisposition.newTlId === tid && styles.chipTextActive]}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <GradientButton title="Confirm & Save" onPress={() => submitUser(true)} loading={saving} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  searchRow: { flexDirection: 'row', gap: 10 },
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
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  userName: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  userMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, marginBottom: 6 },
  badges: { flexDirection: 'row', gap: 6 },
  iconAction: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 18 },
  centerOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: 20 },
  centerBox: { backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6, marginBottom: 5 },
  input: { height: 42, backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, fontSize: 13.5, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', marginRight: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  chipTextActive: { color: '#fff' },
  testSmtpBtn: { paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.successLight, marginBottom: 12 },
});

export default UsersScreen;
