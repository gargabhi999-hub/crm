import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { COLORS, DISPOSITIONS, LEAD_STATUS_OPTIONS } from '../theme';
import {
  GlassCard,
  GradientButton,
  EmptyState,
  Badge,
  getContactName,
  getContactPhone,
  openDialer,
  openWhatsApp,
  formatDateTime,
} from '../components/UI';
import { pickAndExtractReceipt } from '../components/ReceiptModals';
import { PhoneCall, MessageCircle, RotateCw, Camera, Image as ImageIcon, CheckCircle2 } from 'lucide-react-native';

const WorkflowScreen = ({ targetContactId, onClearTargetContact }) => {
  const { user, recordActivity } = useAuth();
  const { socket } = useSocket();

  const [queueData, setQueueData] = useState(null);
  const queueRef = useRef(queueData);
  queueRef.current = queueData;

  const [customer360, setCustomer360] = useState(null);
  const [emptySchedule, setEmptySchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);

  const [form, setForm] = useState({
    disposition: '',
    remarks: '',
    appointmentDt: '',
    callBackDt: '',
    leadAmount: '',
    status: '',
    statusDetails: '',
    transactionId: '',
    receiptImage: '',
  });

  const resetForm = () => {
    setForm({
      disposition: '',
      remarks: '',
      appointmentDt: '',
      callBackDt: '',
      leadAmount: '',
      status: '',
      statusDetails: '',
      transactionId: '',
      receiptImage: '',
    });
  };

  const fetchNext = useCallback(async (explicitContactId) => {
    setLoading(true);
    try {
      const cid = explicitContactId || targetContactId;
      const url = cid ? `/contacts/queue?contactId=${cid}` : '/contacts/queue';
      const res = await api.get(url);
      setQueueData(res.data);

      if (res.data?.contact) {
        const phone = getContactPhone(res.data.contact.fields);
        if (phone) {
          api.get(`/contacts/customer-360/${encodeURIComponent(phone)}`)
            .then((r) => setCustomer360(r.data))
            .catch(() => setCustomer360(null));
        } else {
          setCustomer360(null);
        }
        setEmptySchedule([]);
      } else {
        setCustomer360(null);
        const [appts, cbs] = await Promise.all([
          api.get('/contacts?disposition=Appointment'),
          api.get('/contacts?disposition=CallBack'),
        ]);
        const merged = [
          ...(Array.isArray(appts.data) ? appts.data : appts.data?.contacts || []),
          ...(Array.isArray(cbs.data) ? cbs.data : cbs.data?.contacts || []),
        ];
        setEmptySchedule(merged.slice(0, 20));
      }
    } catch {
      Alert.alert('Queue Error', 'Unable to fetch next contact from queue.');
    } finally {
      setLoading(false);
    }
  }, [targetContactId]);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = (evt) => {
      const activeId = queueRef.current?.contact?._id || queueRef.current?.contact?.id;
      if (activeId) {
        if (evt?.contactId === activeId) fetchNext();
        return;
      }
      fetchNext();
    };
    socket.on('contacts_updated', onRefresh);
    socket.on('batch_uploaded', onRefresh);
    socket.on('contact_disposed', onRefresh);
    return () => {
      socket.off('contacts_updated', onRefresh);
      socket.off('batch_uploaded', onRefresh);
      socket.off('contact_disposed', onRefresh);
    };
  }, [socket, fetchNext]);

  const handleReceiptScan = async (useCamera) => {
    const picked = await pickAndExtractReceipt(useCamera);
    if (!picked) return;
    setForm((p) => ({ ...p, receiptImage: picked.base64DataUrl }));
    setScanningReceipt(true);
    try {
      const res = await api.post('/leads/extract-transaction', { imageBase64: picked.base64DataUrl });
      if (res.data?.success && res.data.transactionId && res.data.transactionId !== 'NOT_FOUND') {
        setForm((p) => ({
          ...p,
          transactionId: res.data.transactionId,
          leadAmount: res.data.amount ? String(res.data.amount) : p.leadAmount,
          status: 'Converted',
        }));
      }
    } catch {
      // Manual entry fallback
    } finally {
      setScanningReceipt(false);
    }
  };

  const handleDispose = async () => {
    if (!queueData?.contact) return;
    recordActivity();

    if (!form.disposition) {
      Alert.alert('Required', 'Please select a call disposition.');
      return;
    }
    if (form.disposition === 'Lead') {
      if (!form.leadAmount) return Alert.alert('Required', 'Lead Amount is required.');
      if (!form.status) return Alert.alert('Required', 'Lead Status is required.');
    }
    if (form.disposition === 'Appointment' && !form.appointmentDt) {
      return Alert.alert('Required', 'Enter Appointment Date/Time (e.g., 2026-11-28T15:00).');
    }
    if (form.disposition === 'CallBack' && !form.callBackDt) {
      return Alert.alert('Required', 'Enter Callback Date/Time (e.g., 2026-11-28T15:00).');
    }
    if (!form.remarks.trim()) {
      return Alert.alert('Required', 'Remarks are mandatory.');
    }

    setSubmitting(true);
    try {
      const cid = queueData.contact._id || queueData.contact.id;
      const payload = {
        ...form,
        ...(form.leadAmount ? { leadAmount: parseFloat(form.leadAmount) } : {}),
        ...(form.appointmentDt ? { appointmentDt: new Date(form.appointmentDt).toISOString() } : {}),
        ...(form.callBackDt ? { callBackDt: new Date(form.callBackDt).toISOString() } : {}),
      };
      await api.post(`/contacts/${cid}/dispose`, payload);
      resetForm();
      if (onClearTargetContact) onClearTargetContact();
      await fetchNext();
    } catch (err) {
      Alert.alert('Dispose Error', err.response?.data?.error || 'Failed to save disposition.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequeue = async (cid) => {
    try {
      await api.post(`/contacts/${cid}/requeue`);
      fetchNext(cid);
    } catch {
      Alert.alert('Error', 'Unable to requeue contact.');
    }
  };

  const contact = queueData?.contact;
  const stats = queueData?.stats;

  if (loading && !contact) {
    return (
      <View style={styles.centerLoader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.textMuted, fontWeight: '600' }}>Loading next contact...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchNext()} />}
    >
      {/* Queue Counter Bar */}
      {stats && (
        <GlassCard style={styles.progressBarCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>Pending: {stats.pending || 0}</Text>
            <Text style={styles.progressText}>Disposed: {stats.disposed || 0}</Text>
            <Text style={styles.progressText}>Total: {stats.total || 0}</Text>
          </View>
        </GlassCard>
      )}

      {!contact ? (
        <>
          <EmptyState
            icon={CheckCircle2}
            title="Queue Completed"
            subtitle="All pending contacts in your queue are handled. Pull to refresh or pick a scheduled callback/appointment below."
            action={
              <GradientButton
                title="Refresh Queue"
                icon={RotateCw}
                onPress={() => fetchNext()}
                style={{ marginTop: 16, width: 180 }}
              />
            }
          />
          {emptySchedule.map((item) => {
            const id = item._id || item.id;
            return (
              <GlassCard key={id} style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactName}>{getContactName(item.fields)}</Text>
                    <Text style={styles.metaText}>{item.disposition} • {formatDateTime(item.appointmentDt || item.callBackDt)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRequeue(id)} style={styles.requeueBtn}>
                    <Text style={styles.requeueText}>Call Now</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            );
          })}
        </>
      ) : (
        <>
          {/* Customer Data Card */}
          <GlassCard>
            <View style={styles.customerHeader}>
              <View style={{ flex: 1 }}>
                <Badge label={queueData.queueSource || 'Calling Queue'} color={COLORS.primary} bg={COLORS.primaryLight} />
                <Text style={styles.contactNameLarge}>{getContactName(contact.fields)}</Text>
                <Text style={styles.phoneLarge}>{getContactPhone(contact.fields) || 'No Phone'}</Text>
              </View>
            </View>

            {/* One-tap Native Call & WhatsApp */}
            <View style={styles.callActionsRow}>
              <TouchableOpacity
                onPress={() => {
                  recordActivity();
                  openDialer(getContactPhone(contact.fields));
                }}
                style={[styles.nativeActionBtn, { backgroundColor: COLORS.success }]}
              >
                <PhoneCall size={18} color="#ffffff" />
                <Text style={styles.nativeActionText}>Call Customer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  recordActivity();
                  openWhatsApp(getContactPhone(contact.fields));
                }}
                style={[styles.nativeActionBtn, { backgroundColor: '#16a34a' }]}
              >
                <MessageCircle size={18} color="#ffffff" />
                <Text style={styles.nativeActionText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Uploaded Custom Columns */}
            <View style={styles.fieldsGrid}>
              {Object.entries(contact.fields || {}).map(([k, v]) => (
                <View key={k} style={styles.fieldChip}>
                  <Text style={styles.fieldKey}>{k}</Text>
                  <Text style={styles.fieldVal}>{String(v || '—')}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* Customer 360 Timeline */}
          {customer360?.history?.length > 0 && (
            <GlassCard>
              <Text style={styles.sectionHeading}>Customer 360 History ({customer360.history.length})</Text>
              {customer360.history.slice(0, 4).map((h, i) => (
                <View key={i} style={styles.historyRow}>
                  <Text style={styles.historyTitle}>{h.disposition || h.status || 'Call'} • {h.agentName || 'Agent'}</Text>
                  <Text style={styles.historySub}>{h.remarks || 'No remarks'}</Text>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Call Disposition Form */}
          <GlassCard>
            <Text style={styles.sectionHeading}>Dispose Call</Text>
            <View style={styles.dispGrid}>
              {DISPOSITIONS.map((d) => {
                const active = form.disposition === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => setForm((p) => ({ ...p, disposition: d.key }))}
                    style={[
                      styles.dispBtn,
                      active && { backgroundColor: d.color, borderColor: d.color },
                    ]}
                  >
                    <Text style={[styles.dispText, active && { color: '#fff' }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.disposition === 'Lead' && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity onPress={() => handleReceiptScan(true)} style={styles.scanBtn}>
                    <Camera size={16} color={COLORS.primary} />
                    <Text style={styles.scanBtnText}>Camera OCR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleReceiptScan(false)} style={styles.scanBtn}>
                    <ImageIcon size={16} color={COLORS.primary} />
                    <Text style={styles.scanBtnText}>Gallery OCR</Text>
                  </TouchableOpacity>
                </View>
                {scanningReceipt && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 8 }} />}

                <Text style={styles.label}>LEAD AMOUNT (₹) *</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.leadAmount}
                  onChangeText={(v) => setForm((p) => ({ ...p, leadAmount: v }))}
                  placeholder="Amount"
                  style={styles.input}
                />

                <Text style={styles.label}>LEAD STATUS *</Text>
                <View style={styles.dispGrid}>
                  {LEAD_STATUS_OPTIONS.map((st) => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => setForm((p) => ({ ...p, status: st }))}
                      style={[styles.dispBtn, form.status === st && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                    >
                      <Text style={[styles.dispText, form.status === st && { color: '#fff' }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>TRANSACTION ID</Text>
                <TextInput
                  value={form.transactionId}
                  onChangeText={(v) => setForm((p) => ({ ...p, transactionId: v }))}
                  placeholder="UTR / Transaction Reference"
                  style={styles.input}
                />
              </View>
            )}

            {form.disposition === 'Appointment' && (
              <View>
                <Text style={styles.label}>APPOINTMENT DATE & TIME (YYYY-MM-DDTHH:MM) *</Text>
                <TextInput
                  value={form.appointmentDt}
                  onChangeText={(v) => setForm((p) => ({ ...p, appointmentDt: v }))}
                  placeholder="2026-11-28T15:30"
                  style={styles.input}
                />
              </View>
            )}

            {form.disposition === 'CallBack' && (
              <View>
                <Text style={styles.label}>CALLBACK DATE & TIME (YYYY-MM-DDTHH:MM) *</Text>
                <TextInput
                  value={form.callBackDt}
                  onChangeText={(v) => setForm((p) => ({ ...p, callBackDt: v }))}
                  placeholder="2026-11-28T16:00"
                  style={styles.input}
                />
              </View>
            )}

            <Text style={styles.label}>REMARKS *</Text>
            <TextInput
              multiline
              numberOfLines={3}
              value={form.remarks}
              onChangeText={(v) => setForm((p) => ({ ...p, remarks: v }))}
              placeholder="Write detailed call summary..."
              style={[styles.input, { height: 82, textAlignVertical: 'top', paddingTop: 10 }]}
            />

            <GradientButton title="Submit & Load Next Contact" onPress={handleDispose} loading={submitting} />
          </GlassCard>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  centerLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgBase },
  progressBarCard: { paddingVertical: 10, paddingHorizontal: 14 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 12.5, fontWeight: '800', color: COLORS.textPrimary },
  customerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  contactNameLarge: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, marginTop: 8 },
  phoneLarge: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginTop: 3 },
  callActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 14 },
  nativeActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nativeActionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  fieldsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldChip: {
    minWidth: '47%',
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fieldKey: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase' },
  fieldVal: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginTop: 2 },
  sectionHeading: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10 },
  historyRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  historyTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.textPrimary },
  historySub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  dispGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  dispBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  dispText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  scanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scanBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6, marginBottom: 5 },
  input: {
    height: 43,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  contactName: { fontSize: 14.5, fontWeight: '800', color: COLORS.textPrimary },
  metaText: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  requeueBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  requeueText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

export default WorkflowScreen;
