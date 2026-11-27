import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthProvider, useAuth } from '../shared/contexts/AuthContext';
import { SocketProvider, useSocket } from '../shared/contexts/SocketContext';
import api from '../shared/services/api';
import { COLORS } from '../shared/theme';
import { AppTopBar } from '../shared/components/UI';
import ChangePasswordModal from '../shared/components/ChangePasswordModal';
import NotificationsModal from '../shared/components/NotificationsModal';
import LoginScreen from '../shared/screens/LoginScreen';
import DashboardScreen from '../shared/screens/DashboardScreen';
import UsersScreen from '../shared/screens/UsersScreen';
import MyLeadsScreen from '../shared/screens/MyLeadsScreen';
import ContactsScreen from '../shared/screens/ContactsScreen';
import ScheduleScreen from '../shared/screens/ScheduleScreen';
import AgentLogsScreen from '../shared/screens/AgentLogsScreen';
import UploadScreen from '../shared/screens/UploadScreen';
import ReportsScreen from '../shared/screens/ReportsScreen';
import {
  LayoutDashboard,
  Users,
  Star,
  Database,
  Calendar,
  Activity,
  UploadCloud,
  BarChart2,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const ADMIN_LOGO = require('./assets/nexus-logo.png');

const AdminPipelineHub = () => {
  const [subTab, setSubTab] = useState('leads');
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgBase }}>
      <View style={styles.subTabBar}>
        {[
          { key: 'leads', label: 'Leads', Icon: Star },
          { key: 'contacts', label: 'Contacts', Icon: Database },
          { key: 'schedule', label: 'Schedule', Icon: Calendar },
        ].map(({ key, label, Icon }) => {
          const active = subTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSubTab(key)}
              style={[styles.subTabBtn, active && styles.subTabActive]}
            >
              <Icon size={14} color={active ? '#fff' : COLORS.textSecondary} />
              <Text style={[styles.subTabTxt, active && styles.subTabTxtActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {subTab === 'leads' ? (
        <MyLeadsScreen />
      ) : subTab === 'contacts' ? (
        <ContactsScreen />
      ) : (
        <ScheduleScreen includeHungUp />
      )}
    </View>
  );
};

const AdminOpsHub = () => {
  const [subTab, setSubTab] = useState('logs');
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgBase }}>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          onPress={() => setSubTab('logs')}
          style={[styles.subTabBtn, subTab === 'logs' && styles.subTabActive]}
        >
          <Activity size={14} color={subTab === 'logs' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.subTabTxt, subTab === 'logs' && styles.subTabTxtActive]}>Agent Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSubTab('upload')}
          style={[styles.subTabBtn, subTab === 'upload' && styles.subTabActive]}
        >
          <UploadCloud size={14} color={subTab === 'upload' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.subTabTxt, subTab === 'upload' && styles.subTabTxtActive]}>Data Import</Text>
        </TouchableOpacity>
      </View>
      {subTab === 'logs' ? <AgentLogsScreen /> : <UploadScreen />}
    </View>
  );
};

const AdminShell = () => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const [activeTitle, setActiveTitle] = useState(
    user?.role === 'superadmin' ? 'Command Center' : 'Admin Dashboard'
  );
  const [securityOpen, setSecurityOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return;
    api.get('/contacts/notifications')
      .then((res) => {
        const past = (res.data || []).map((a, i) => ({
          id: `past_${Date.now()}_${i}`,
          type: a.type,
          title: a.title,
          message: a.message,
          time: new Date(),
          path: a.path,
        }));
        setNotifications(past.slice(0, 25));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const onBatch = (data) => {
      setNotifications((prev) => [
        {
          id: `batch_${Date.now()}`,
          type: 'workflow',
          title: 'Batch Uploaded',
          message: data?.batchName ? `Imported ${data.batchName}` : 'New contact batch imported',
          time: new Date(),
        },
        ...prev,
      ].slice(0, 25));
    };
    const onLead = () => {
      setNotifications((prev) => [
        {
          id: `lead_${Date.now()}`,
          type: 'lead',
          title: 'Lead Activity',
          message: 'A new lead or conversion was updated.',
          time: new Date(),
        },
        ...prev,
      ].slice(0, 25));
    };
    socket.on('batch_uploaded', onBatch);
    socket.on('lead_disposed', onLead);
    return () => {
      socket.off('batch_uploaded', onBatch);
      socket.off('lead_disposed', onLead);
    };
  }, [socket]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
      <StatusBar style="dark" />
      <AppTopBar
        title={activeTitle}
        role={user?.role}
        connected={connected}
        unreadCount={notifications.length}
        onPressBell={() => setNotifOpen(true)}
        onPressSecurity={() => setSecurityOpen(true)}
      />

      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarStyle: {
              borderTopColor: COLORS.border,
              backgroundColor: '#ffffff',
              height: 60,
              paddingBottom: 6,
              paddingTop: 4,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            listeners={{
              focus: () => setActiveTitle(user?.role === 'superadmin' ? 'Command Center' : 'Admin Dashboard'),
            }}
            options={{
              tabBarLabel: 'Home',
              tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
            }}
            component={DashboardScreen}
          />

          <Tab.Screen
            name="Users"
            listeners={{ focus: () => setActiveTitle('User Management') }}
            options={{
              tabBarLabel: 'Users',
              tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
            }}
            component={UsersScreen}
          />

          <Tab.Screen
            name="Pipeline"
            listeners={{ focus: () => setActiveTitle('Leads, Contacts & Schedule') }}
            options={{
              tabBarLabel: 'Pipeline',
              tabBarIcon: ({ color, size }) => <Star size={size} color={color} />,
            }}
            component={AdminPipelineHub}
          />

          <Tab.Screen
            name="Ops"
            listeners={{ focus: () => setActiveTitle('Agent Logs & Import') }}
            options={{
              tabBarLabel: 'Logs & Data',
              tabBarIcon: ({ color, size }) => <Activity size={size} color={color} />,
            }}
            component={AdminOpsHub}
          />

          <Tab.Screen
            name="Reports"
            listeners={{ focus: () => setActiveTitle('Reports & Export') }}
            options={{
              tabBarLabel: 'Reports',
              tabBarIcon: ({ color, size }) => <BarChart2 size={size} color={color} />,
            }}
            component={ReportsScreen}
          />
        </Tab.Navigator>
      </NavigationContainer>

      <ChangePasswordModal visible={securityOpen} onClose={() => setSecurityOpen(false)} />
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
      />
    </SafeAreaView>
  );
};

const RootGate = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }
  return isAuthenticated ? (
    <AdminShell />
  ) : (
    <>
      <StatusBar style="light" />
      <LoginScreen appTitle="Nexus CRM." appBadge="ADMIN CONSOLE • ADMIN & SUPERADMIN" logoSource={ADMIN_LOGO} />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider
        allowedRoles={['admin', 'superadmin']}
        appName="Nexus Admin"
        wrongAppMessage="Agent and Team Leader accounts must sign in using the Nexus Staff app."
      >
        <SocketProvider>
          <RootGate />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070d1f' },
  subTabBar: { flexDirection: 'row', gap: 8, padding: 14, paddingBottom: 4 },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
  },
  subTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  subTabTxt: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  subTabTxtActive: { color: '#fff' },
});
