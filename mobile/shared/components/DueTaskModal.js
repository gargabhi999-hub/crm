import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { COLORS, DISPOSITIONS, LEAD_STATUS_OPTIONS } from '../theme';
import { GradientButton, getContactName, getContactPhone, openDialer } from './UI';
import { X, PhoneCall, Clock } from 'lucide-react-native';

const DueTaskModal = ({ onDisposed }) => {
  const { socket } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);
  const [taskData, setTaskData] = useState(null);
  const [contact, setContact] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    disposition: '',
    remarks: '',
    leadAmount: '',
    status: '',
    transactionId: '',
    appointmentDt: '',
    callBackDt: '',
  });

  useEffect(() => {
    if (!socket || !isAuthenticated || !user) return;
    const uid = user._id || user.id;

    const handleReminder = async (data) => {
      if (data.agentId !== uid) return;
      if (data.type === 'upcoming' && data.minutesUntil > 2) return;
      const contactId = data.contactId || data.appointmentId;
      if (!contactId) return;

      try {
        const res = await api.get(`/contacts/${contactId}`);
        setContact(res.data);
        setTaskData(data);
        setVisible(true);
      } catch {
        // Ignore transient fetch errors
      }
    };

    const handleCallbackDue = (data) => {
      if (data.agentId !== uid) return;
      handleReminder({ ...data, type: 'callback' });
    };

    socket.on('appointment_reminder', handleReminder);
    socket.on('callback_due', handleCallbackDue);

    return () => {
      socket.off('appointment_reminder', handleReminder);
      socket.off('callback_due', handleCallbackDue);
    };
  }, [socket, isAuthenticated, user]);

  const handleSubmit = async () => {
    if (!contact || !form.disposition) {
      Alert.alert('Disposition Required', 'Please select a disposition.');
      return;
    }
    if (form.disposition === 'Lead' && (!form.leadAmount || !form.status)) {
      Alert.alert('Missing Details', 'Lead Amount and Status are required.');
      return;
    }
    if (!form.remarks.trim()) {
      Alert.alert('Remarks Required', 'Please enter call remarks.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form };
      if (payload.appointmentDt) payload.appointmentDt = new Date(payload.appointmentDt).toISOString();
      if (payload.callBackDt) payload.callBackDt = new Date(payload.callBackDt).toISOString();

      const cid = contact._id || contact.id;
      await api.post(`/contacts/${cid}/dispose`, payload);
      setVisible(false);
      setContact(null);
      setTaskData(null);
      setForm({ disposition: '', remarks: '', leadAmount: '', status: '', transactionId: '', appointmentDt: '', callBackDt: '' });
      if (onDisposed) onDisposed(cid);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to dispose task.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible || !contact) return null;

  const name = getContactName(contact.fields);
  const phone = getContactPhone(contact.fields);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock size={19} color={COLORS.warning} />
              <Text style={styles.title}>
                {taskData?.type === 'callback' ? 'Callback Due Now' : 'Appointment Due'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setVisible(false)}>
              <X size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.contactBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{name}</Text>
                <Text style={styles.contactPhone}>{phone || 'No phone'}</Text>
              </View>
              {!!phone && (
                <TouchableOpacity onPress={() => openDialer(phone)} style={styles.callBtn}>
                  <PhoneCall size={16} color="#fff" />
                  <Text style={styles.callBtnText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>SELECT DISPOSITION</Text>
            <View style={styles.chipGrid}>
              {DISPOSITIONS.map((d) => {
                const active = form.disposition === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => setForm((p) => ({ ...p, disposition: d.key }))}
                    style={[
                      styles.chip,
                      active && { backgroundColor: d.color, borderColor: d.color },
                    ]}
                  >
                    <Text style={[styles.chipText, active && { color: '#fff' }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.disposition === 'Lead' && (
              <>
                <Text style={styles.label}>LEAD AMOUNT (₹) *</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.leadAmount}
                  onChangeText={(v) => setForm((p) => ({ ...p, leadAmount: v }))}
                  placeholder="Amount"
                  style={styles.input}
                />
                <Text style={styles.label}>LEAD STATUS *</Text>
                <View style={styles.chipGrid}>
                  {LEAD_STATUS_OPTIONS.map((st) => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => setForm((p) => ({ ...p, status: st }))}
                      style={[styles.chip, form.status === st && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                    >
                      <Text style={[styles.chipText, form.status === st && { color: '#fff' }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>REMARKS *</Text>
            <TextInput
              multiline
              numberOfLines={3}
              value={form.remarks}
              onChangeText={(v) => setForm((p) => ({ ...p, remarks: v }))}
              placeholder="Enter call outcome remarks..."
              style={[styles.input, { height: 78, textAlignVertical: 'top', paddingTop: 10 }]}
            />

            <GradientButton title="Submit Disposition" onPress={handleSubmit} loading={submitting} style={{ marginTop: 8 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  contactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  contactName: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  contactPhone: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 6, marginTop: 6 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  input: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
});

export default DueTaskModal;
