import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from '../theme';
import { GradientButton } from './UI';
import { KeyRound, X, ShieldAlert, CheckCircle2, LogOut } from 'lucide-react-native';

const ChangePasswordModal = ({ visible, onClose }) => {
  const { changePassword, logout, logoutAll, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const resetAndClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (!currentPassword || !newPassword) {
      setError('Please enter your current and new passwords.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    const res = await changePassword(currentPassword, newPassword);
    setSaving(false);

    if (res.success) {
      setSuccess(res.message);
      setTimeout(resetAndClose, 1200);
    } else {
      setError(res.error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <KeyRound size={19} color={COLORS.primary} />
              <Text style={styles.title}>Account & Security</Text>
            </View>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <X size={19} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.userMeta}>
            Signed in as <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{user?.name || user?.username}</Text> ({user?.role})
          </Text>

          {!!error && (
            <View style={[styles.alert, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <ShieldAlert size={15} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontSize: 12.5, fontWeight: '600', flex: 1 }}>{error}</Text>
            </View>
          )}

          {!!success && (
            <View style={[styles.alert, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
              <CheckCircle2 size={15} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 12.5, fontWeight: '600', flex: 1 }}>{success}</Text>
            </View>
          )}

          <Text style={styles.label}>CURRENT PASSWORD</Text>
          <TextInput
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <Text style={styles.label}>NEW PASSWORD (8+ CHARS, AA1!)</Text>
          <TextInput
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New strong password"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
          <TextInput
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <GradientButton
            title="Update Password"
            onPress={handleSubmit}
            loading={saving}
            style={{ marginTop: 6 }}
          />

          <View style={styles.divider} />

          <View style={styles.sessionActions}>
            <TouchableOpacity
              onPress={() => {
                resetAndClose();
                logout();
              }}
              style={[styles.actionBtn, { backgroundColor: COLORS.dangerLight }]}
            >
              <LogOut size={15} color={COLORS.danger} />
              <Text style={[styles.actionText, { color: COLORS.danger }]}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                resetAndClose();
                logoutAll();
              }}
              style={[styles.actionBtn, { backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.borderSlate }]}
            >
              <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Sign Out All Devices</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  userMeta: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  input: {
    height: 43,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});

export default ChangePasswordModal;
