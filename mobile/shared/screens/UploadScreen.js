import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';
import { COLORS } from '../theme';
import { GlassCard, GradientButton, Badge, formatDateOnly } from '../components/UI';
import { UploadCloud, FileSpreadsheet, Trash2 } from 'lucide-react-native';

const UploadScreen = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [batchName, setBatchName] = useState('');
  const [isLeadUpload, setIsLeadUpload] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/users' : '/users/my-agents';
      const [uRes, bRes] = await Promise.all([api.get(endpoint), api.get('/upload/batches')]);
      setAgents((uRes.data || []).filter((u) => u.role === 'agent' && u.active));
      setBatches(bRes.data || []);
    } catch {
      // Keep state
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const h = () => fetchData();
    ['batch_uploaded', 'users_updated', 'contacts_updated'].forEach((e) => socket.on(e, h));
    return () => ['batch_uploaded', 'users_updated', 'contacts_updated'].forEach((e) => socket.off(e, h));
  }, [socket, fetchData]);

  const handlePickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      setPickedFile(res.assets[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedAgent || !pickedFile) {
      Alert.alert('Required', 'Please select an agent (or Multi-Agent) and a CSV/XLSX file.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', {
        uri: pickedFile.uri,
        name: pickedFile.name || 'import.xlsx',
        type: pickedFile.mimeType || 'application/octet-stream',
      });
      fd.append('agentId', selectedAgent);
      fd.append('isLeadUpload', String(isLeadUpload));
      if (batchName.trim()) fd.append('batchName', batchName.trim());

      const res = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPickedFile(null);
      setBatchName('');
      fetchData();
      Alert.alert('Import Complete', res.data?.message || 'Contacts imported successfully.');
    } catch (err) {
      Alert.alert('Upload Failed', err.response?.data?.error || 'Could not process uploaded file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBatch = (batchId) => {
    Alert.alert('Delete Batch', 'Delete this batch and all its contacts?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/contacts/batch/${batchId}`);
            fetchData();
          } catch {
            Alert.alert('Error', 'Batch deletion failed.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
    >
      <GlassCard style={{ gap: 12 }}>
        <View style={styles.titleRow}>
          <UploadCloud size={20} color={COLORS.primary} />
          <Text style={styles.heading}>Data Import (CSV / Excel)</Text>
        </View>

        <Text style={styles.label}>ASSIGN TO AGENT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            onPress={() => setSelectedAgent('multi')}
            style={[styles.pill, selectedAgent === 'multi' && styles.pillActive]}
          >
            <Text style={[styles.pillText, selectedAgent === 'multi' && styles.pillTextActive]}>
              Multi-Agent (File Column)
            </Text>
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

        <Text style={styles.label}>BATCH NAME (OPTIONAL)</Text>
        <TextInput
          value={batchName}
          onChangeText={setBatchName}
          placeholder="e.g. Nov_2026_Campaign"
          style={styles.input}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Direct Lead Upload (skip calling queue)</Text>
          <Switch value={isLeadUpload} onValueChange={setIsLeadUpload} trackColor={{ true: COLORS.primary }} />
        </View>

        <TouchableOpacity onPress={handlePickDocument} style={styles.fileDrop}>
          <FileSpreadsheet size={24} color={COLORS.primary} />
          <Text style={styles.fileDropText}>
            {pickedFile ? pickedFile.name : 'Tap to choose .CSV or .XLSX file'}
          </Text>
        </TouchableOpacity>

        <GradientButton title="Upload & Import Contacts" icon={UploadCloud} onPress={handleUpload} loading={uploading} />
      </GlassCard>

      <Text style={styles.subHeading}>Uploaded Batches ({batches.length})</Text>
      {batches.map((b) => {
        const bid = b._id || b.id;
        return (
          <GlassCard key={bid} style={styles.batchCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.batchName}>{b.name || bid}</Text>
              <Text style={styles.batchMeta}>{b.contactCount || 0} contacts • {formatDateOnly(b.createdAt)}</Text>
            </View>
            <Badge label={b.status || 'uploaded'} color={COLORS.success} bg={COLORS.successLight} />
            {isAdmin && (
              <TouchableOpacity onPress={() => handleDeleteBatch(bid)} style={styles.delBtn}>
                <Trash2 size={16} color={COLORS.danger} />
              </TouchableOpacity>
            )}
          </GlassCard>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgBase },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  label: { fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
    marginRight: 6,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  pillTextActive: { color: '#fff' },
  input: {
    height: 43,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  fileDrop: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  fileDropText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  subHeading: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', marginTop: 4 },
  batchCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  batchName: { fontSize: 14.5, fontWeight: '800', color: COLORS.textPrimary },
  batchMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  delBtn: { padding: 6 },
});

export default UploadScreen;
