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
import BreakTimerOverlay from '../shared/components/BreakTimerOverlay';
import ChangePasswordModal from '../shared/components/ChangePasswordModal';
import NotificationsModal from '../shared/components/NotificationsModal';
import DueTaskModal from '../shared/components/DueTaskModal';
import LoginScreen from '../shared/screens/LoginScreen';
import DashboardScreen from '../shared/screens/DashboardScreen';
import WorkflowScreen from '../shared/screens/WorkflowScreen';
import MyLeadsScreen from '../shared/screens/MyLeadsScreen';
import ContactsScreen from '../shared/screens/ContactsScreen';
import ScheduleScreen from '../shared/screens/ScheduleScreen';
import UploadScreen from '../shared/screens/UploadScreen';
import ReportsScreen from '../shared/screens/ReportsScreen';
import {
  LayoutDashboard,
  PhoneCall,
  Star,
  Calendar,
  Database,
  UploadCloud,
  BarChart2,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator();
const STAFF_LOGO = require('./assets/nexus-logo.png');

const TLToolsScreen = () => {
  const [subTab, setSubTab] = useState('upload');
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgBase }}>
      <View style={styles.subTabBar}>
        <TouchableOpacity
          onPress={() => setSubTab('upload')}
          style={[styles.subTabBtn, subTab === 'upload' && styles.subTabActive]}
        >
          <UploadCloud size={15} color={subTab === 'upload' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.subTabTxt, subTab === 'upload' && styles.subTabTxtActive]}>Data Import</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSubTab('reports')}
          style={[styles.subTabBtn, subTab === 'reports' && styles.subTabActive]}
        >
          <BarChart2 size={15} color={subTab === 'reports' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.subTabTxt, subTab === 'reports' && styles.subTabTxtActive]}>Reports</Text>
        </TouchableOpacity>
      </View>
      {subTab === 'upload' ? <UploadScreen /> : <ReportsScreen />}
    </View>
  );
};

const StaffShell = () => {
  const { user, activeBreak, setActiveBreak } = useAuth();
  const { socket, connected } = useSocket();

  const [activeTitle, setActiveTitle] = useState('Dashboard');
  const [targetContactId, setTargetContactId] = useState(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const isTl = user?.role === 'tl';

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
        setNotifications((prev) => [...past, ...prev].slice(0, 25));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket || !user) return;
    const uid = user._id || user.id;

    const onAppt = (data) => {
      if (data.agentId !== uid) return;
      setNotifications((prev) => [
        {
          id: `appt_${Date.now()}`,
          type: 'appointment',
          title: 'Appointment Reminder',
          message: `${data.contactName} — ${data.minutesUntil} min`,
          time: new Date(),
          path: 'Schedule',
        },
        ...prev,
      ].slice(0, 25));
    };

    const onCb = (data) => {
      if (data.agentId !== uid) return;
      setNotifications((prev) => [
        {
          id: `cb_${Date.now()}`,
          type: 'callback',
          title: 'Callback Reminder',
          message: `${data.contactName} — scheduled follow-up`,
          time: new Date(),
          path: 'Schedule',
        },
        ...prev,
      ].slice(0, 25));
    };

    socket.on('appointment_reminder', onAppt);
    socket.on('callback_reminder', onCb);
    socket.on('callback_due', onCb);
    return () => {
      socket.off('appointment_reminder', onAppt);
      socket.off('callback_reminder', onCb);
      socket.off('callback_due', onCb);
    };
  }, [socket, user]);

  const handleEndBreak = async () => {
    try {
      await api.post('/agent-logs/end-break');
      setActiveBreak(null);
    } catch {
      setActiveBreak(null);
    }
  };

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
            listeners={{ focus: () => setActiveTitle('Dashboard') }}
            options={{
              tabBarLabel: 'Home',
              tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
            }}
          >
            {({ navigation }) => (
              <DashboardScreen onNavigate={(routeName) => navigation.navigate(routeName)} />
            )}
          </Tab.Screen>

          {!isTl ? (
            <Tab.Screen
              name="Workflow"
              listeners={{ focus: () => setActiveTitle('Agent Workflow') }}
              options={{
                tabBarLabel: 'Workflow',
                tabBarIcon: ({ color, size }) => <PhoneCall size={size} color={color} />,
              }}
            >
              {() => (
                <WorkflowScreen
                  targetContactId={targetContactId}
                  onClearTargetContact={() => setTargetContactId(null)}
                />
              )}
            </Tab.Screen>
          ) : (
            <Tab.Screen
              name="Contacts"
              listeners={{ focus: () => setActiveTitle('All Contacts') }}
              options={{
                tabBarLabel: 'Contacts',
                tabBarIcon: ({ color, size }) => <Database size={size} color={color} />,
              }}
              component={ContactsScreen}
            />
          )}

          <Tab.Screen
            name="Leads"
            listeners={{ focus: () => setActiveTitle('Lead Tracking') }}
            options={{
              tabBarLabel: 'Leads',
              tabBarIcon: ({ color, size }) => <Star size={size} color={color} />,
            }}
            component={MyLeadsScreen}
          />

          <Tab.Screen
            name="Schedule"
            listeners={{ focus: () => setActiveTitle(isTl ? 'Schedule & Hung Up' : 'Appointments & Callbacks') }}
            options={{
              tabBarLabel: 'Schedule',
              tabBarIcon: ({ color, size }) => <Calendar size={size} color={color} />,
            }}
          >
            {({ navigation }) => (
              <ScheduleScreen
                includeHungUp={isTl}
                onOpenWorkflow={(cid) => {
                  setTargetContactId(cid);
                  if (!isTl) navigation.navigate('Workflow');
                }}
              />
            )}
          </Tab.Screen>

          {!isTl ? (
            <Tab.Screen
              name="Contacts"
              listeners={{ focus: () => setActiveTitle('Search Contacts') }}
              options={{
                tabBarLabel: 'Search',
                tabBarIcon: ({ color, size }) => <Database size={size} color={color} />,
              }}
            >
              {({ navigation }) => (
                <ContactsScreen
                  onOpenWorkflow={(cid) => {
                    setTargetContactId(cid);
                    navigation.navigate('Workflow');
                  }}
                />
              )}
            </Tab.Screen>
          ) : (
            <Tab.Screen
              name="Tools"
              listeners={{ focus: () => setActiveTitle('Import & Reports') }}
              options={{
                tabBarLabel: 'Tools',
                tabBarIcon: ({ color, size }) => <BarChart2 size={size} color={color} />,
              }}
              component={TLToolsScreen}
            />
          )}
        </Tab.Navigator>
      </NavigationContainer>

      <BreakTimerOverlay activeBreak={activeBreak} onEndBreak={handleEndBreak} />
      <ChangePasswordModal visible={securityOpen} onClose={() => setSecurityOpen(false)} />
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
      />
      <DueTaskModal />
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
    <StaffShell />
  ) : (
    <>
      <StatusBar style="light" />
      <LoginScreen appTitle="Nexus CRM." appBadge="STAFF APP • AGENT & TL" logoSource={STAFF_LOGO} />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider
        allowedRoles={['agent', 'tl']}
        appName="Nexus Staff"
        wrongAppMessage="Admin and SuperAdmin accounts must sign in using the Nexus Admin app."
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
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.borderSlate,
  },
  subTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  subTabTxt: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  subTabTxtActive: { color: '#fff' },
});
