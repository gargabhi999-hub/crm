import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  Clock, Search, Calendar, RefreshCw, Coffee, Activity, User, ShieldAlert, CheckCircle2, ArrowLeft, Users, AlertTriangle 
} from 'lucide-react';
import { Link } from 'react-router-dom';

const AgentLogs = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, break, overtime

  // Limits in seconds
  const limits = {
    lunch: 30 * 60,
    bio: 10 * 60,
    tea: 15 * 60
  };

  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      let url = '/agent-logs/admin-logs';
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      const res = await api.get(url);
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch agent logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [startDate, endDate]);

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let result = '';
    if (hrs > 0) result += `${hrs}h `;
    if (mins > 0 || hrs > 0) result += `${mins}m `;
    result += `${secs}s`;
    return result;
  };

  const formatTime = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const calculateGrossDuration = (loginAt, logoutAt) => {
    const login = new Date(loginAt).getTime();
    const logout = logoutAt ? new Date(logoutAt).getTime() : Date.now();
    return Math.max(0, Math.floor((logout - login) / 1000));
  };

  // Filter logs by search term and status tab
  const filteredLogs = logs.filter(log => {
    // 1. Search term filter
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      const matchesSearch = 
        (log.agentName && log.agentName.toLowerCase().includes(term)) ||
        (log.agentEmail && log.agentEmail.toLowerCase().includes(term)) ||
        (log.tlName && log.tlName.toLowerCase().includes(term));
      
      if (!matchesSearch) return false;
    }

    // 2. Status filter
    const isCurrentlyActive = !log.logoutAt;
    if (statusFilter === 'active') {
      return isCurrentlyActive && !log.activeBreakType;
    } else if (statusFilter === 'break') {
      return isCurrentlyActive && log.activeBreakType;
    } else if (statusFilter === 'overtime') {
      return log.lunchDuration > limits.lunch || log.bioDuration > limits.bio || log.teaDuration > limits.tea;
    }

    return true;
  });

  // Calculate live statistics for metrics ribbon
  const activeSessions = logs.filter(l => !l.logoutAt).length;
  const breakSessions = logs.filter(l => !l.logoutAt && l.activeBreakType).length;
  const overtimeSessions = logs.filter(l => {
    return l.lunchDuration > limits.lunch || l.bioDuration > limits.bio || l.teaDuration > limits.tea;
  }).length;

  const validWorkTimes = logs.map(l => {
    const gross = calculateGrossDuration(l.loginAt, l.logoutAt);
    return l.logoutAt ? l.totalWorkTime : (gross - (l.lunchDuration + l.bioDuration + l.teaDuration));
  }).filter(t => t > 0);
  const avgWorkTime = validWorkTimes.length > 0 ? Math.round(validWorkTimes.reduce((s, t) => s + t, 0) / validWorkTimes.length) : 0;

  // Visual Break Progress Bar Component
  const renderBreakProgressBar = (duration, limit, label) => {
    if (duration === 0) {
      return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>—</span>;
    }
    
    const pct = Math.min(100, Math.round((duration / limit) * 100));
    const isOver = duration > limit;
    
    // Color scheme
    let barColor = '#10b981'; // green
    if (isOver) barColor = '#ef4444'; // red
    else if (pct > 75) barColor = '#f59e0b'; // orange
    
    const overtimeText = isOver ? `+${formatDuration(duration - limit)}` : '';
    
    return (
      <div style={{ minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700 }}>
          <span style={{ color: isOver ? '#ef4444' : '#334155' }}>
            {formatDuration(duration)}
          </span>
          <span style={{ color: isOver ? '#ef4444' : '#64748b', fontWeight: 600 }}>
            {pct}%
          </span>
        </div>
        
        <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(226, 232, 240, 0.8)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ 
            width: `${pct}%`, 
            height: '100%', 
            background: barColor, 
            borderRadius: 3,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' 
          }} />
        </div>
        
        {isOver && (
          <span style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <ShieldAlert size={10} /> Overtime {overtimeText}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ animation: 'revealUp 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--violet))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#fff" strokeWidth={2.5} />
            </div>
            <h1 style={{ fontSize: 'var(--h1)', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.03em' }}>
              Agents Logs Dashboard
            </h1>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
            Advanced real-time tracking of work shifts, lunch breaks, bio breaks, and tea break allocations.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing || loading}
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '8px 14px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Sync Logs
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          {
            title: 'Active Agents',
            value: activeSessions,
            desc: `${breakSessions} currently on break`,
            icon: <Users size={20} color="#10b981" />,
            bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))',
            border: 'rgba(16, 185, 129, 0.15)',
          },
          {
            title: 'Avg Shift Duration',
            value: formatDuration(avgWorkTime),
            desc: 'Net work time per agent',
            icon: <Clock size={20} color="#6366f1" />,
            bg: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(99, 102, 241, 0.02))',
            border: 'rgba(99, 102, 241, 0.15)',
          },
          {
            title: 'Active Breaks',
            value: breakSessions,
            desc: 'Away from workstation',
            icon: <Coffee size={20} color="#f59e0b" />,
            bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02))',
            border: 'rgba(245, 158, 11, 0.15)',
          },
          {
            title: 'Break Overtime',
            value: overtimeSessions,
            desc: 'Exceeded break limits today',
            icon: <ShieldAlert size={20} color="#ef4444" />,
            bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.02))',
            border: 'rgba(239, 68, 68, 0.15)',
          }
        ].map((card, idx) => (
          <div 
            key={idx}
            className="glass-panel"
            style={{ 
              padding: '20px 22px', 
              borderRadius: 16, 
              background: card.bg, 
              border: `1px solid ${card.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 8px 24px -2px rgba(0,0,0,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {card.title}
              </span>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', margin: '6px 0 2px 0', letterSpacing: '-0.02em' }}>
                {card.value}
              </h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {card.desc}
              </span>
            </div>
            <div style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 12, 
              background: '#fff', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
            }}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Control Panel */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: 16, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border)' }}>
        
        {/* Row 1: Search & Date Range */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search agent, email, or team leader..."
              style={{ paddingLeft: 38, margin: 0, background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }}
            />
          </div>

          {/* Date range filters */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>From</span>
              <input
                type="date"
                className="input-field"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ margin: 0, padding: '6px 12px', background: '#fff', fontSize: '0.78rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>To</span>
              <input
                type="date"
                className="input-field"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ margin: 0, padding: '6px 12px', background: '#fff', fontSize: '0.78rem', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>

            {(startDate || endDate || searchTerm) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSearchTerm('');
                }}
                style={{
                  background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', marginLeft: 8
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Status Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Sessions', count: logs.length },
            { id: 'active', label: 'Active Now', count: logs.filter(l => !l.logoutAt && !l.activeBreakType).length },
            { id: 'break', label: 'On Break', count: breakSessions },
            { id: 'overtime', label: 'Limits Exceeded', count: overtimeSessions }
          ].map(tab => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive ? 'var(--primary)' : 'rgba(0, 0, 0, 0.03)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  padding: '1px 6px',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontWeight: 800
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {/* Logs Table Panel */}
      <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 16, border: '1px solid var(--border)' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1.4s linear infinite', marginBottom: 12, color: 'var(--primary)' }} />
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Polling live shift logs...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Clock size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: 14 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>No Active Filter Matches</h3>
            <p style={{ fontSize: '0.8rem', margin: 0, fontWeight: 500 }}>
              No log sessions matched the selected status tab or query terms.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.6)', borderBottom: '1px solid var(--border)' }}>
                  {['Agent Details', 'Date', 'Session Times', 'Gross Login', 'Lunch Break (30m)', 'Bio Break (10m)', 'Tea Break (15m)', 'Net Work Time', 'Status'].map(h => (
                    <th key={h} style={{ 
                      padding: '14px 20px', 
                      textAlign: 'left', 
                      fontSize: '0.7rem', 
                      fontWeight: 800, 
                      color: 'var(--text-muted)', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const grossSeconds = calculateGrossDuration(log.loginAt, log.logoutAt);
                  const isCurrentlyActive = !log.logoutAt;
                  
                  return (
                    <tr 
                      key={log.id} 
                      style={{ 
                        borderBottom: '1px solid rgba(0,0,0,0.04)', 
                        transition: 'background 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Agent details */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ 
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary), var(--violet))',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.72rem', fontWeight: 800, flexShrink: 0
                          }}>
                            {log.agentName?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>{log.agentName}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>TL: {log.tlName || 'N/A'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.loginAt)}
                      </td>

                      {/* Session Times */}
                      <td style={{ padding: '14px 20px', fontSize: '0.76rem', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div><span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.68rem', marginRight: 4 }}>IN:</span> {formatTime(log.loginAt)}</div>
                          <div><span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.68rem', marginRight: 4 }}>OUT:</span> {formatTime(log.logoutAt)}</div>
                        </div>
                      </td>

                      {/* Gross Duration */}
                      <td style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                        {formatDuration(grossSeconds)}
                      </td>

                      {/* Lunch Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakProgressBar(log.lunchDuration, limits.lunch, 'Lunch')}
                      </td>

                      {/* Bio Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakProgressBar(log.bioDuration, limits.bio, 'Bio')}
                      </td>

                      {/* Tea Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakProgressBar(log.teaDuration, limits.tea, 'Tea')}
                      </td>

                      {/* Net Work Time */}
                      <td style={{ padding: '14px 20px', fontSize: '0.84rem', fontWeight: 900, color: 'var(--primary)' }}>
                        {formatDuration(isCurrentlyActive ? (grossSeconds - (log.lunchDuration + log.bioDuration + log.teaDuration)) : log.totalWorkTime)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 20px' }}>
                        {isCurrentlyActive ? (
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: 99, 
                            background: log.activeBreakType ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                            color: log.activeBreakType ? '#f59e0b' : '#10b981',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            border: `1px solid ${log.activeBreakType ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'}`
                          }}>
                            {log.activeBreakType ? `On ${log.activeBreakType}` : 'Active'}
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: 99, 
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            border: '1px solid #e2e8f0'
                          }}>
                            Logged Out
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shimmer animations */}
      <style>{`
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AgentLogs;
