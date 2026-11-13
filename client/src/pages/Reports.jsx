import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import {
  BarChart2, Download, FileSpreadsheet, User, Building,
  Trash2, RefreshCw, Calendar, CheckCircle2, Clock,
  Star, PhoneCall, Database, ShieldAlert, ArrowUpRight,
  TrendingUp, Activity, Eye, Search
} from 'lucide-react';

const PALETTE = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-surface, #1e293b)',
      border: '1px solid var(--border, rgba(255,255,255,0.1))',
      borderRadius: 'var(--r-md, 8px)',
      padding: '10px 14px',
      fontSize: '0.8rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
    }}>
      <strong style={{ color: 'var(--text-primary, #fff)' }}>{label || payload[0]?.name}</strong>
      <div style={{ color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
        Count: <strong style={{ color: 'var(--primary, #6366f1)' }}>{payload[0]?.value}</strong>
      </div>
    </div>
  );
};

const formatDateStr = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const REPORT_OPTIONS = [
  { value: 'all-leads',    label: 'Total Leads (All Generated)', icon: Star, color: '#f59e0b', desc: 'All generated leads across statuses with assigned agents and financials' },
  { value: 'converted',    label: 'Converted Leads (With Payments)', icon: CheckCircle2, color: '#10b981', desc: 'Confirmed conversions with donor details, UTR numbers and charity verification' },
  { value: 'all-contacts', label: 'All Contacts (Master Database)', icon: Database, color: '#6366f1', desc: 'Full contact list including pending, disposed, and in-progress records' },
  { value: 'appointments', label: 'Appointments (Scheduled)', icon: Calendar, color: '#8b5cf6', desc: 'Scheduled customer appointments with status and agent follow-up' },
  { value: 'callbacks',    label: 'Callbacks (Follow-ups)', icon: Clock, color: '#06b6d4', desc: 'Requested callbacks and pending retry schedules' },
  { value: 'agent-log',    label: 'Agent Work Logs (Sessions & Breaks)', icon: Activity, color: '#ec4899', desc: 'Agent attendance, active login hours, lunch, tea, and bio breaks' },
  { value: 'workflow',     label: 'Workflow Analytics (Funnel & Charts)', icon: BarChart2, color: '#3b82f6', desc: 'Interactive funnel metrics and visual disposition distribution' },
];

const Reports = () => {
  const { user }   = useAuth();
  const { socket } = useSocket();

  // Filter States
  const [reportType,    setReportType]    = useState('all-leads');
  const [companies,     setCompanies]     = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [agents,        setAgents]        = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [fromDate,      setFromDate]      = useState('');
  const [toDate,        setToDate]        = useState('');
  const [quickPreset,   setQuickPreset]   = useState('');

  // Data States
  const [stats,         setStats]         = useState(null);
  const [adminStats,    setAdminStats]    = useState([]);
  const [previewData,   setPreviewData]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isExporting,   setIsExporting]   = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');

  // Quick Preset Date Helpers
  const setQuickFilter = (type) => {
    setQuickPreset(type);
    const today = new Date();

    if (type === 'today') {
      const todayStr = formatDateStr(today);
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = formatDateStr(yesterday);
      setFromDate(yesterdayStr);
      setToDate(yesterdayStr);
    } else if (type === 'lastweek') {
      const lastWeekStart = new Date();
      lastWeekStart.setDate(today.getDate() - 7);
      setFromDate(formatDateStr(lastWeekStart));
      setToDate(formatDateStr(today));
    } else if (type === 'thismonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(formatDateStr(firstDay));
      setToDate(formatDateStr(today));
    } else if (type === 'lastmonth') {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setFromDate(formatDateStr(firstDayLastMonth));
      setToDate(formatDateStr(lastDayLastMonth));
    } else if (type === 'alltime') {
      setFromDate('');
      setToDate('');
    }
  };

  // 1. Fetch Companies (for Superadmin)
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/reports/companies');
        setCompanies(res.data || []);
      } catch (err) {
        console.error('Failed to load companies:', err);
      }
    };
    if (['superadmin', 'admin'].includes(user?.role)) {
      fetchCompanies();
    }
  }, [user]);

  // 2. Fetch Agents (scoped by company/admin)
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const params = new URLSearchParams();
        if (user?.role === 'superadmin' && selectedAdmin) {
          params.append('adminId', selectedAdmin);
        }
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await api.get(`/reports/agents${qs}`);
        setAgents(res.data || []);
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    };
    if (user?.role !== 'agent') {
      fetchAgents();
    }
  }, [selectedAdmin, user]);

  // 3. Fetch Overview Stats & Admin Comparison
  const fetchOverviewStats = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (selectedAdmin) queryParams.append('adminId', selectedAdmin);
      if (selectedAgent) queryParams.append('agentId', selectedAgent);
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

      const reqs = [api.get(`/contacts/stats${queryString}`)];
      if (user?.role === 'superadmin') {
        reqs.push(api.get(`/contacts/admin-stats${queryString}`));
      }

      const [statsRes, adminStatsRes] = await Promise.all(reqs);
      setStats(statsRes.data);
      if (adminStatsRes) setAdminStats(adminStatsRes.data || []);
    } catch (err) {
      console.error('Reports stats fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAdmin, selectedAgent, fromDate, toDate, user]);

  // 4. Fetch Live Preview Data for selected Report Type
  const fetchPreview = useCallback(async () => {
    if (reportType === 'workflow') return;
    try {
      setPreviewLoading(true);
      const queryParams = new URLSearchParams({ reportType });
      if (selectedAdmin) queryParams.append('adminId', selectedAdmin);
      if (selectedAgent) queryParams.append('agentId', selectedAgent);
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);

      const res = await api.get(`/reports/preview?${queryParams.toString()}`);
      setPreviewData(res.data);
    } catch (err) {
      console.error('Preview fetch failed:', err);
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [reportType, selectedAdmin, selectedAgent, fromDate, toDate]);

  useEffect(() => {
    fetchOverviewStats();
    fetchPreview();
  }, [fetchOverviewStats, fetchPreview]);

  // Socket updates
  useEffect(() => {
    if (!socket) return;
    const events = ['contacts_updated', 'contact_disposed', 'lead_disposed', 'batch_uploaded', 'users_updated'];
    const handler = () => {
      fetchOverviewStats();
      fetchPreview();
    };
    events.forEach(e => socket.on(e, handler));
    return () => events.forEach(e => socket.off(e, handler));
  }, [socket, fetchOverviewStats, fetchPreview]);

  // 5. Handle Export Download (CSV or XLSX)
  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams({ format, reportType });
      if (selectedAdmin) queryParams.append('adminId', selectedAdmin);
      if (selectedAgent) queryParams.append('agentId', selectedAgent);
      if (fromDate) queryParams.append('fromDate', fromDate);
      if (toDate) queryParams.append('toDate', toDate);

      const res = await api.get(`/reports/download?${queryParams.toString()}`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv;charset=utf-8;'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const dateTag = fromDate && toDate ? `${fromDate}_to_${toDate}` : new Date().toISOString().split('T')[0];
      const adminNameTag = selectedAdmin
        ? (companies.find(c => c.id === selectedAdmin)?.name?.replace(/\s+/g, '_') || 'company')
        : (user?.role === 'admin' ? (user?.name?.replace(/\s+/g, '_') || 'company') : 'all_companies');

      const filename = `${adminNameTag}_${reportType}_${dateTag}.${format}`;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export download error:', err);
      alert('Failed to export report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Superadmin Global Wipe Action
  const handleGlobalWipe = async () => {
    const confirmation = window.prompt("GLOBAL SYSTEM WIPE. This will delete EVERY record in the database except your superadmin account. Type 'DELETE' to confirm.");
    if (confirmation === 'DELETE') {
      try {
        await Promise.all([
          api.delete('/users/wipe'),
          api.delete('/contacts/wipe'),
          api.delete('/leads/wipe'),
          api.delete('/leads/appointments/wipe'),
          api.delete('/leads/callbacks/wipe')
        ]);
        alert('GLOBAL WIPE SUCCESSFUL. All data has been deleted.');
        window.location.reload();
      } catch (err) {
        alert('Failed during global wipe. Check console for details.');
        console.error(err);
      }
    }
  };

  // Funnel & Pie Chart Data
  const chartData = stats ? [
    { name: 'Pending',        value: stats.pending || 0 },
    { name: 'Total Leads',    value: stats.allLead || stats.lead || 0 },
    { name: 'Appointments',   value: stats.appointment || 0 },
    { name: 'Callbacks',      value: stats.callBack || 0 },
    { name: 'No Answer',      value: stats.callNotAnswered || 0 },
    { name: 'Hung Up',        value: stats.hungUp || 0 },
    { name: 'Not Interested', value: stats.notInterested || 0 },
    { name: 'DNC',            value: stats.doNotCall || 0 },
    { name: 'Invalid',        value: stats.invalid || 0 },
  ].filter(d => d.value > 0) : [];

  const funnelData = stats ? [
    { name: 'Total Contacts', value: stats.total || 0 },
    { name: 'Processed',      value: Math.max(0, (stats.total || 0) - (stats.pending || 0)) },
    { name: 'Total Leads',    value: stats.allLead || stats.lead || 0 },
    { name: 'Converted',      value: stats.lead || 0 },
  ] : [];

  // Summary Metrics Pills
  const currentTotalRecords = previewData ? previewData.totalCount : (stats?.total || 0);
  const currentTotalAmount = previewData?.metrics?.totalAmount !== undefined
    ? previewData.metrics.totalAmount
    : (stats?.totalLeadAmount || 0);

  const activeReportMeta = REPORT_OPTIONS.find(r => r.value === reportType) || REPORT_OPTIONS[0];

  // Filter preview rows by local search
  const filteredPreviewRows = (previewData?.sampleRows || []).filter(row => {
    if (!previewSearch.trim()) return true;
    const term = previewSearch.toLowerCase();
    return Object.values(row).some(v => String(v || '').toLowerCase().includes(term));
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 40 }}>
      {/* ──────────────── Top Header ──────────────── */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--h1, 1.6rem)', fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <BarChart2 size={24} color="var(--primary)" /> Reporting & Data Export
            </h1>
            {user?.role === 'admin' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20,
                background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)',
                color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 700
              }}>
                <Building size={14} /> Company: {user?.name || 'My Organization'}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Generate, preview, and download comprehensive real-time CRM reports across all leads, conversions, contacts, appointments, and agent activity.
          </p>
        </div>

        {/* Global Wipe for Superadmin */}
        {user?.role === 'superadmin' && (
          <button
            onClick={handleGlobalWipe}
            className="btn btn-danger"
            style={{ height: 36, padding: '0 12px', fontSize: '0.8rem' }}
            title="Emergency System Wipe"
          >
            <Trash2 size={14} /> <span className="hide-mobile">Global System Wipe</span>
          </button>
        )}
      </div>

      {/* ──────────────── Filter & Control Console ──────────────── */}
      <div className="glass-panel" style={{ padding: 18, marginBottom: 20 }}>
        {/* Row 1: Primary Selectors (Report Type, Company Filter, Agent Filter) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
          {/* Report Type Selector */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Select Report Type
            </label>
            <select
              className="input-field"
              style={{ marginBottom: 0, height: 38, fontSize: '0.82rem', fontWeight: 600, width: '100%' }}
              value={reportType}
              onChange={e => setReportType(e.target.value)}
            >
              {REPORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Company Selector (Only for SuperAdmin) */}
          {user?.role === 'superadmin' && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Filter By Company (Admin)
              </label>
              <select
                className="input-field"
                style={{ marginBottom: 0, height: 38, fontSize: '0.82rem', fontWeight: 600, width: '100%' }}
                value={selectedAdmin}
                onChange={e => {
                  setSelectedAdmin(e.target.value);
                  setSelectedAgent(''); // Reset agent when company changes
                }}
              >
                <option value="">🏢 All Companies (System-Wide)</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>
                    🏢 {c.name} ({c.username})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Agent Filter (For SuperAdmin, Admin, TL) */}
          {user?.role !== 'agent' && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Filter By Agent
              </label>
              <select
                className="input-field"
                style={{ marginBottom: 0, height: 38, fontSize: '0.82rem', fontWeight: 600, width: '100%' }}
                value={selectedAgent}
                onChange={e => setSelectedAgent(e.target.value)}
              >
                <option value="">Full Team Overview</option>
                {agents.map(a => (
                  <option key={a.id || a._id} value={a.id || a._id}>
                    👤 {a.name || a.username}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Row 2: Date Range Presets & Date Pickers & Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
          {/* Quick Date Presets */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 4 }}>Date Range:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'lastweek', label: 'Last 7 Days' },
              { id: 'thismonth', label: 'This Month' },
              { id: 'lastmonth', label: 'Last Month' },
              { id: 'alltime', label: 'All Time' },
            ].map(preset => {
              const isActive = quickPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="btn btn-outline"
                  style={{
                    padding: '4px 10px', fontSize: '0.72rem', borderRadius: 20, height: 28,
                    borderColor: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.12)',
                    background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 800 : 600
                  }}
                  onClick={() => setQuickFilter(preset.id)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Pickers & Downloads */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="input-field"
                style={{ marginBottom: 0, height: 34, fontSize: '0.78rem', padding: '0 8px' }}
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setQuickPreset(''); }}
                title="From Date"
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>to</span>
              <input
                type="date"
                className="input-field"
                style={{ marginBottom: 0, height: 34, fontSize: '0.78rem', padding: '0 8px' }}
                value={toDate}
                onChange={e => { setToDate(e.target.value); setQuickPreset(''); }}
                title="To Date"
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 30, padding: '0 6px', fontSize: '0.7rem' }}
                  onClick={() => { setFromDate(''); setToDate(''); setQuickPreset('alltime'); }}
                  title="Clear Dates"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Export Action Buttons */}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button
                className="btn btn-outline"
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                style={{ height: 36, padding: '0 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                title="Download CSV format"
              >
                <Download size={15} /> <span>CSV</span>
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleExport('xlsx')}
                disabled={isExporting}
                style={{ height: 36, padding: '0 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                title="Download Microsoft Excel Spreadsheet (.xlsx)"
              >
                <FileSpreadsheet size={15} /> <span>Download Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── KPI Metric Cards ──────────────── */}
      {!loading && stats && (
        <div className="grid-stats" style={{ marginBottom: 20 }}>
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '4px solid var(--primary)' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Contacts
            </span>
            <span style={{ fontWeight: 900, fontSize: '1.45rem', color: 'var(--text-primary)', lineHeight: 1 }}>
              {(stats.total || 0).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {stats.pending || 0} Pending Dispositions
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '4px solid #f59e0b' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Leads Generated
            </span>
            <span style={{ fontWeight: 900, fontSize: '1.45rem', color: '#f59e0b', lineHeight: 1 }}>
              {(stats.allLead || stats.lead || 0).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              All statuses & stages
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '4px solid #10b981' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Confirmed Conversions
            </span>
            <span style={{ fontWeight: 900, fontSize: '1.45rem', color: '#10b981', lineHeight: 1 }}>
              {(stats.lead || 0).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Value: ₹{(stats.totalLeadAmount || 0).toLocaleString()}
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '4px solid #8b5cf6' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Appointments & Callbacks
            </span>
            <span style={{ fontWeight: 900, fontSize: '1.45rem', color: '#8b5cf6', lineHeight: 1 }}>
              {((stats.appointment || 0) + (stats.callBack || 0)).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {stats.appointment || 0} Appts / {stats.callBack || 0} Callbacks
            </span>
          </div>
        </div>
      )}

      {/* ──────────────── Main Content Section ──────────────── */}
      {reportType === 'workflow' ? (
        /* ───── WORKFLOW & ANALYTICS VIEW ───── */
        <div>
          {loading ? (
            <div className="grid-2">
              {[0, 1].map(i => (
                <div key={i} className="glass-panel" style={{ height: 380, padding: 'var(--card-p)' }}>
                  <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 20 }} />
                  <div className="skeleton" style={{ height: 300 }} />
                </div>
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="glass-panel" style={{ padding: '70px 40px', textAlign: 'center' }}>
              <BarChart2 size={54} style={{ opacity: 0.1, margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ marginBottom: 6 }}>No Data for Current Scope</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No contacts or dispositions found matching this company/agent/date range.</p>
            </div>
          ) : (
            <>
              <div className="grid-2">
                <div className="glass-panel" style={{ padding: 'var(--card-p)', minHeight: 420 }}>
                  <h2 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 20 }}>
                    Disposition Breakdown
                  </h2>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%" cy="50%"
                        innerRadius={75} outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                        animationDuration={1000}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>{v}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass-panel" style={{ padding: 'var(--card-p)', minHeight: 420 }}>
                  <h2 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 20 }}>
                    Workflow Efficiency Funnel
                  </h2>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={funnelData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1200}>
                        {funnelData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Superadmin Cross-Company Comparison */}
              {user?.role === 'superadmin' && adminStats && adminStats.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-primary)', marginBottom: 16 }}>
                    Cross-Company Performance Comparison
                  </h2>
                  <div className="grid-2">
                    <div className="glass-panel" style={{ padding: 'var(--card-p)', minHeight: 380 }}>
                      <h3 style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
                        Conversions by Company
                      </h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={adminStats} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.04)' }} />
                          <Bar dataKey="leads" name="Leads" radius={[6, 6, 0, 0]} barSize={36}>
                            {adminStats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="glass-panel" style={{ padding: 'var(--card-p)', minHeight: 380 }}>
                      <h3 style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
                        Revenue by Company
                      </h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={adminStats}
                            nameKey="name"
                            dataKey="totalLeadAmount"
                            cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={4}
                          >
                            {adminStats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="none" />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600 }}>{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ───── TABULAR REPORT PREVIEW & EXPORT VIEW ───── */
        <div className="glass-panel animate-fade-in" style={{ padding: 22 }}>
          {/* Header Bar of Table Preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--r-md, 10px)',
                background: `${activeReportMeta.color}15`, color: activeReportMeta.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <activeReportMeta.icon size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {activeReportMeta.label}
                  <span style={{
                    padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)',
                    fontSize: '0.72rem', fontWeight: 700
                  }}>
                    {previewData ? `${previewData.totalCount.toLocaleString()} Total Records` : 'Loading...'}
                  </span>
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                  {activeReportMeta.desc}
                </p>
              </div>
            </div>

            {/* Quick in-table search filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Filter preview..."
                  style={{ marginBottom: 0, height: 34, fontSize: '0.78rem', paddingLeft: 30, width: '100%' }}
                  value={previewSearch}
                  onChange={e => setPreviewSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          {previewLoading ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <RefreshCw size={32} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading report preview...</p>
            </div>
          ) : !previewData || previewData.sampleRows.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--border, rgba(255,255,255,0.1))', borderRadius: 'var(--r-md, 10px)' }}>
              <Database size={48} style={{ opacity: 0.15, margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>No Records Found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 440, margin: '0 auto 16px' }}>
                There are no records matching your current filter criteria. Try adjusting the date range, company or agent filter.
              </p>
            </div>
          ) : (
            <div>
              <div style={{
                maxHeight: 460, overflowX: 'auto', overflowY: 'auto',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 'var(--r-md, 8px)',
                background: 'rgba(0,0,0,0.12)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
                      {previewData.columns.map((col, idx) => (
                        <th
                          key={idx}
                          style={{
                            padding: '10px 14px',
                            fontWeight: 800,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.03em',
                            fontSize: '0.72rem',
                            textTransform: 'uppercase'
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviewRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {previewData.columns.map((col, cIdx) => {
                          const val = row[col];
                          const isAmount = col.toLowerCase().includes('amount');
                          const isStatus = ['status', 'disposition', 'lead status'].includes(col.toLowerCase());
                          return (
                            <td
                              key={cIdx}
                              style={{
                                padding: '9px 14px',
                                color: isStatus ? 'var(--primary)' : 'var(--text-primary)',
                                fontWeight: isAmount ? 700 : 400,
                                whiteSpace: 'nowrap',
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={String(val ?? '')}
                            >
                              {val !== null && val !== undefined && val !== ''
                                ? (isAmount && typeof val === 'number' ? `₹${val.toLocaleString()}` : String(val))
                                : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview Footer Info Banner */}
              <div style={{
                marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 10, padding: '10px 14px',
                borderRadius: 'var(--r-md, 8px)', background: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.15)', fontSize: '0.78rem'
              }}>
                <div style={{ color: 'var(--text-secondary)' }}>
                  Showing top <strong>{filteredPreviewRows.length}</strong> preview records of{' '}
                  <strong style={{ color: 'var(--primary)' }}>{previewData.totalCount.toLocaleString()}</strong> total matching in this report.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => handleExport('csv')}
                    disabled={isExporting}
                    style={{ height: 32, padding: '0 12px', fontSize: '0.75rem' }}
                  >
                    <Download size={13} /> Export CSV
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleExport('xlsx')}
                    disabled={isExporting}
                    style={{ height: 32, padding: '0 14px', fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    <FileSpreadsheet size={13} /> Export Excel ({previewData.totalCount.toLocaleString()})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;