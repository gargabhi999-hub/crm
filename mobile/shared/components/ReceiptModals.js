import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, LEAD_STATUS_OPTIONS } from '../theme';
import {
  GradientButton,
  Badge,
  getContactName,
  getContactPhone,
  getContactEmail,
  formatCurrency,
  formatDateTime,
  openDialer,
  openWhatsApp,
} from './UI';
import {
  X,
  Camera,
  Image as ImageIcon,
  ShieldCheck,
  PhoneCall,
  MessageCircle,
  Plus,
  CheckCircle2,
  Star,
} from 'lucide-react-native';

export async function pickAndExtractReceipt(useCamera = false) {
  const perm = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    Alert.alert('Permission Required', 'Please grant camera/photo access to scan payment receipts.');
    return null;
  }

  const pickerRes = useCamera
    ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.75 })
    : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.75 });

  if (pickerRes.canceled || !pickerRes.assets?.[0]?.base64) {
    return null;
  }

  const asset = pickerRes.assets[0];
  const mime = asset.mimeType || 'image/jpeg';
  const base64DataUrl = `data:${mime};base64,${asset.base64}`;
  return { uri: asset.uri, base64DataUrl };
}

export const ReceiptUploadModal = ({ lead, onClose, onSuccess }) => {
  const [imageBase64, setImageBase64] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [leadAmount, setLeadAmount] = useState(String(lead?.leadAmount || ''));
  const [transactionId, setTransactionId] = useState(lead?.transactionId || '');
  const [remarks, setRemarks] = useState('[Auto-converted via payment receipt upload]');
  const [submitting, setSubmitting] = useState(false);

  if (!lead) return null;

  const handlePick = async (useCamera) => {
    const picked = await pickAndExtractReceipt(useCamera);
    if (!picked) return;
    setImageBase64(picked.base64DataUrl);
    setScanning(true);
    setScanMsg('');
    try {
      const res = await api.post('/leads/extract-transaction', { imageBase64: picked.base64DataUrl });
      if (res.data?.success && res.data.transactionId && res.data.transactionId !== 'NOT_FOUND') {
        setTransactionId(res.data.transactionId);
        if (res.data.amount) setLeadAmount(String(res.data.amount));
        setRemarks(
          `[Auto-converted via receipt scan] Transaction ID: ${res.data.transactionId}${
            res.data.amount ? ` (Amount: ₹${res.data.amount})` : ''
          }`
        );
        setScanMsg(`Detected ID: ${res.data.transactionId}`);
      } else {
        setScanMsg('Could not auto-detect Transaction ID. Please enter manually.');
      }
    } catch {
      setScanMsg('AI OCR unavailable. Please enter Transaction ID manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async () => {
    if (!transactionId.trim()) {
      Alert.alert('Required', 'Please enter Transaction ID / UTR.');
      return;
    }
    setSubmitting(true);
    try {
      const parsedAmount = parseFloat(leadAmount) || lead.leadAmount || 0;
      const payload = {
        status: 'Converted',
        leadAmount: parsedAmount,
        transactionId: transactionId.trim(),
        remarks: remarks.trim(),
        receiptImage: imageBase64 || undefined,
      };
      const leadId = lead._id || lead.id;
      await api.put(`/leads/${leadId}`, payload);
      const contactId = lead.contactId || leadId;
      if (contactId) {
        await api.put(`/contacts/${contactId}/status`, payload).catch(() => {});
      }
      if (onSuccess) onSuccess({ ...lead, ...payload });
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save conversion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Upload Receipt & Convert</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sub}>Lead: {getContactName(lead.fields)}</Text>
            <View style={styles.rowBtns}>
              <TouchableOpacity onPress={() => handlePick(true)} style={styles.pickerBtn}>
                <Camera size={16} color={COLORS.primary} />
                <Text style={styles.pickerBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handlePick(false)} style={styles.pickerBtn}>
                <ImageIcon size={16} color={COLORS.primary} />
                <Text style={styles.pickerBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>
            {scanning && (
              <View style={styles.scanRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.scanText}>Scanning receipt with Groq AI OCR...</Text>
              </View>
            )}
            {!!scanMsg && <Text style={styles.scanMsg}>{scanMsg}</Text>}
            {!!imageBase64 && <Image source={{ uri: imageBase64 }} style={styles.previewImg} resizeMode="contain" />}

            <Text style={styles.label}>TRANSACTION ID / UTR *</Text>
            <TextInput value={transactionId} onChangeText={setTransactionId} placeholder="UTR / Ref No." style={styles.input} />
            <Text style={styles.label}>AMOUNT (₹)</Text>
            <TextInput keyboardType="numeric" value={leadAmount} onChangeText={setLeadAmount} placeholder="0" style={styles.input} />
            <Text style={styles.label}>REMARKS</Text>
            <TextInput value={remarks} onChangeText={setRemarks} multiline style={[styles.input, { height: 70, paddingTop: 10 }]} />

            <GradientButton title="Convert & Save" onPress={handleSubmit} loading={submitting} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const LeadStatusModal = ({ lead, newStatus, onClose, onSave, submitting }) => {
  const [leadAmount, setLeadAmount] = useState(String(lead?.leadAmount || ''));
  const [transactionId, setTransactionId] = useState(lead?.transactionId || '');
  const [callBackDt, setCallBackDt] = useState('');
  const [statusDetails, setStatusDetails] = useState(lead?.statusDetails || '');
  const [remarks, setRemarks] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [scanning, setScanning] = useState(false);

  if (!lead || !newStatus) return null;

  const handleScan = async (useCamera) => {
    const picked = await pickAndExtractReceipt(useCamera);
    if (!picked) return;
    setReceiptImage(picked.base64DataUrl);
    setScanning(true);
    try {
      const res = await api.post('/leads/extract-transaction', { imageBase64: picked.base64DataUrl });
      if (res.data?.success && res.data.transactionId && res.data.transactionId !== 'NOT_FOUND') {
        setTransactionId(res.data.transactionId);
        if (res.data.amount) setLeadAmount(String(res.data.amount));
      }
    } catch {
      // Fallback to manual entry
    } finally {
      setScanning(false);
    }
  };

  const handleSave = () => {
    const payload = {
      leadAmount: parseFloat(leadAmount) || 0,
      transactionId: transactionId.trim(),
      statusDetails: statusDetails.trim(),
      remarks: remarks.trim(),
      ...(receiptImage ? { receiptImage } : {}),
      ...(newStatus === 'Converted' ? { conversionDate: new Date().toISOString() } : {}),
      ...(callBackDt ? { callBackDt: new Date(callBackDt).toISOString() } : {}),
    };
    onSave(payload);
  };

  return (
    <Modal visible={!!lead && !!newStatus} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Update Status: {newStatus}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {newStatus === 'Converted' && (
              <>
                <View style={styles.rowBtns}>
                  <TouchableOpacity onPress={() => handleScan(true)} style={styles.pickerBtn}>
                    <Camera size={16} color={COLORS.primary} />
                    <Text style={styles.pickerBtnText}>Scan Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleScan(false)} style={styles.pickerBtn}>
                    <ImageIcon size={16} color={COLORS.primary} />
                    <Text style={styles.pickerBtnText}>Upload Receipt</Text>
                  </TouchableOpacity>
                </View>
                {scanning && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 8 }} />}
                <Text style={styles.label}>AMOUNT (₹)</Text>
                <TextInput keyboardType="numeric" value={leadAmount} onChangeText={setLeadAmount} style={styles.input} />
                <Text style={styles.label}>TRANSACTION ID</Text>
                <TextInput value={transactionId} onChangeText={setTransactionId} style={styles.input} />
              </>
            )}
            {newStatus === 'Call Back' && (
              <>
                <Text style={styles.label}>CALLBACK DATE/TIME (YYYY-MM-DDTHH:MM)</Text>
                <TextInput
                  value={callBackDt}
                  onChangeText={setCallBackDt}
                  placeholder="e.g. 2026-11-28T14:30"
                  style={styles.input}
                />
              </>
            )}
            {newStatus === 'Others' && (
              <>
                <Text style={styles.label}>STATUS DETAILS</Text>
                <TextInput value={statusDetails} onChangeText={setStatusDetails} style={styles.input} />
              </>
            )}
            <Text style={styles.label}>REMARKS</Text>
            <TextInput
              value={remarks}
              onChangeText={setRemarks}
              multiline
              placeholder="Add update remarks..."
              style={[styles.input, { height: 72, paddingTop: 10 }]}
            />
            <GradientButton title="Save Status" onPress={handleSave} loading={submitting} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const CharityConfirmModal = ({ lead, onClose, onSuccess }) => {
  const [utrCharity, setUtrCharity] = useState(lead?.utrCharity || '');
  const [charityAmount, setCharityAmount] = useState(
    lead?.charityAmount !== null && lead?.charityAmount !== undefined
      ? String(lead.charityAmount)
      : String(lead?.leadAmount || '')
  );
  const [submitting, setSubmitting] = useState(false);

  if (!lead) return null;

  const handleSubmit = async () => {
    if (!utrCharity.trim()) {
      Alert.alert('Required', 'Please enter the UTR / Transaction ID provided by the charity.');
      return;
    }
    const numAmount = parseFloat(charityAmount);
    if (isNaN(numAmount) || numAmount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid non-negative amount.');
      return;
    }
    setSubmitting(true);
    try {
      const leadId = lead._id || lead.id || lead.contactId;
      const payload = { utrCharity: utrCharity.trim(), charityAmount: numAmount };
      const res = await api.put(`/leads/${leadId}/confirm-charity`, payload);
      if (res.data?.success) {
        if (onSuccess) {
          onSuccess({
            ...lead,
            ...payload,
            isCharityConfirmed: true,
            charityConfirmedAt: new Date().toISOString(),
          });
        }
        onClose();
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Charity confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={19} color={COLORS.success} />
              <Text style={styles.title}>Confirm by Charity</Text>
            </View>
            <TouchableOpacity onPress={onClose}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
          </View>
          <Text style={styles.sub}>
            Donor: {getContactName(lead.fields)} | Agent UTR: {lead.transactionId || 'N/A'} | Agent Amount: {formatCurrency(lead.leadAmount)}
          </Text>
          <Text style={styles.label}>CHARITY UTR / TRANSACTION ID *</Text>
          <TextInput value={utrCharity} onChangeText={setUtrCharity} placeholder="Charity verified UTR" style={styles.input} />
          <Text style={styles.label}>CONFIRMED CHARITY AMOUNT (₹) *</Text>
          <TextInput keyboardType="numeric" value={charityAmount} onChangeText={setCharityAmount} style={styles.input} />
          <GradientButton title="Confirm Charity Receipt" onPress={handleSubmit} loading={submitting} />
        </View>
      </View>
    </Modal>
  );
};

export const CreateLeadModal = ({ visible, onClose, onSave, submitting }) => {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    leadAmount: '',
    status: 'Converted',
    transactionId: '',
    callBackDt: '',
    remarks: '',
    assignedTo: user?._id || user?.id || '',
  });

  useEffect(() => {
    if (visible && ['tl', 'admin', 'superadmin'].includes(user?.role)) {
      const endpoint = user.role === 'tl' ? '/users/my-agents' : '/users';
      api.get(endpoint).then((res) => {
        setAgents((res.data || []).filter((u) => u.active && u.role === 'agent'));
      }).catch(() => {});
    }
  }, [visible, user]);

  if (!visible) return null;

  const handleSave = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      Alert.alert('Required', 'Contact Name and Phone are required.');
      return;
    }
    const payload = {
      ...form,
      leadAmount: parseFloat(form.leadAmount) || 0,
      createdAt: new Date().toISOString(),
      ...(form.status === 'Call Back' && form.callBackDt ? { callBackDt: new Date(form.callBackDt).toISOString() } : {}),
    };
    onSave(payload);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Plus size={19} color={COLORS.primary} />
              <Text style={styles.title}>Create New Lead</Text>
            </View>
            <TouchableOpacity onPress={onClose}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>CONTACT NAME *</Text>
            <TextInput value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} style={styles.input} />
            <Text style={styles.label}>PHONE NUMBER *</Text>
            <TextInput keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} style={styles.input} />
            <Text style={styles.label}>EMAIL</Text>
            <TextInput keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} style={styles.input} />
            <Text style={styles.label}>LEAD AMOUNT (₹)</Text>
            <TextInput keyboardType="numeric" value={form.leadAmount} onChangeText={(v) => setForm((p) => ({ ...p, leadAmount: v }))} style={styles.input} />
            <Text style={styles.label}>STATUS</Text>
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
            {form.status === 'Converted' && (
              <>
                <Text style={styles.label}>TRANSACTION ID</Text>
                <TextInput value={form.transactionId} onChangeText={(v) => setForm((p) => ({ ...p, transactionId: v }))} style={styles.input} />
              </>
            )}
            {agents.length > 0 && (
              <>
                <Text style={styles.label}>ASSIGN AGENT</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {agents.map((a) => {
                    const aid = a._id || a.id;
                    const active = form.assignedTo === aid;
                    return (
                      <TouchableOpacity
                        key={aid}
                        onPress={() => setForm((p) => ({ ...p, assignedTo: aid }))}
                        style={[styles.chip, { marginRight: 6 }, active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                      >
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>{a.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <Text style={styles.label}>REMARKS</Text>
            <TextInput value={form.remarks} onChangeText={(v) => setForm((p) => ({ ...p, remarks: v }))} multiline style={[styles.input, { height: 70, paddingTop: 10 }]} />
            <GradientButton title="Create Lead" onPress={handleSave} loading={submitting} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export const LeadDetailModal = ({ lead, onClose, onStatusSelect, onOpenReceipt, onOpenCharityConfirm, canConfirmCharity }) => {
  if (!lead) return null;

  const name = getContactName(lead.fields);
  const phone = getContactPhone(lead.fields);
  const email = getContactEmail(lead.fields);

  return (
    <Modal visible={!!lead} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Star size={19} color={COLORS.primary} />
              <Text style={styles.title} numberOfLines={1}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose}><X size={20} color={COLORS.textMuted} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailCard}>
              <Text style={styles.detailRow}>Phone: {phone || '—'}</Text>
              <Text style={styles.detailRow}>Email: {email || '—'}</Text>
              <Text style={styles.detailRow}>Amount: {formatCurrency(lead.leadAmount)}</Text>
              <Text style={styles.detailRow}>Status: {lead.status || '—'}</Text>
              <Text style={styles.detailRow}>Transaction ID: {lead.transactionId || '—'}</Text>
              <Text style={styles.detailRow}>Agent: {lead.agentName || '—'}</Text>
              <Text style={styles.detailRow}>Created: {formatDateTime(lead.conversionDate || lead.createdAt)}</Text>
              {lead.isCharityConfirmed && (
                <View style={{ marginTop: 6 }}>
                  <Badge label={`Charity Confirmed • ${formatCurrency(lead.charityAmount)} (${lead.utrCharity})`} color={COLORS.success} bg={COLORS.successLight} />
                </View>
              )}
            </View>

            <View style={styles.rowBtns}>
              {!!phone && (
                <>
                  <TouchableOpacity onPress={() => openDialer(phone)} style={[styles.actionPill, { backgroundColor: COLORS.successLight }]}>
                    <PhoneCall size={15} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontWeight: '700', fontSize: 13 }}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openWhatsApp(phone)} style={[styles.actionPill, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                    <MessageCircle size={15} color="#16a34a" />
                    <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 13 }}>WhatsApp</Text>
                  </TouchableOpacity>
                </>
              )}
              {onOpenReceipt && (
                <TouchableOpacity onPress={() => { onClose(); onOpenReceipt(lead); }} style={[styles.actionPill, { backgroundColor: COLORS.primaryLight }]}>
                  <ImageIcon size={15} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}>Receipt OCR</Text>
                </TouchableOpacity>
              )}
            </View>

            {canConfirmCharity && onOpenCharityConfirm && (
              <TouchableOpacity
                onPress={() => { onClose(); onOpenCharityConfirm(lead); }}
                style={[styles.charityBtn]}
              >
                <CheckCircle2 size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>
                  {lead.isCharityConfirmed ? 'Update Charity Confirmation' : 'Confirm by Charity'}
                </Text>
              </TouchableOpacity>
            )}

            {onStatusSelect && (
              <>
                <Text style={styles.label}>CHANGE STATUS</Text>
                <View style={styles.chipGrid}>
                  {LEAD_STATUS_OPTIONS.map((st) => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => { onClose(); onStatusSelect(lead, st); }}
                      style={[styles.chip, lead.status === st && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                    >
                      <Text style={[styles.chipText, lead.status === st && { color: '#fff' }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {!!lead.remarks && (
              <View style={styles.remarksBox}>
                <Text style={styles.label}>REMARKS</Text>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 }}>{lead.remarks}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginBottom: 12 },
  rowBtns: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scanText: { fontSize: 12.5, color: COLORS.primary, fontWeight: '600' },
  scanMsg: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 },
  previewImg: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f8fafc', marginBottom: 12 },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6, marginBottom: 5 },
  input: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  detailCard: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, marginBottom: 12, gap: 5 },
  detailRow: { fontSize: 13.5, color: COLORS.textPrimary, fontWeight: '500' },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  charityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  remarksBox: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 16 },
});
