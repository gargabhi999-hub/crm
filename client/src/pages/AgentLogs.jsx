import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  Clock, Search, Calendar, RefreshCw, Coffee, Activity, User, ShieldAlert, CheckCircle2, ArrowLeft 
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

  // Filter logs by search term (agent name or email)
  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      log.agentName.toLowerCase().includes(term) ||
      log.agentEmail.toLowerCase().includes(term) ||
      log.tlName.toLowerCase().includes(term)
    );
  });

  // Limits in seconds
  const limits = {
    lunch: 30 * 60,
    bio: 10 * 60,
    tea: 15 * 60
  };

  const renderBreakBadge = (duration, limit, label) => {
    if (duration === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>—</span>;
    const isOver = duration > limit;
    const overTimeText = isOver ? ` (+${formatDuration(duration - limit)})` : '';
    
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ 
          padding: '3px 8px', 
          borderRadius: 8, 
          background: isOver ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          color: isOver ? '#ef4444' : '#10b981',
          fontSize: '0.75rem',
          fontWeight: 700,
          border: `1px solid ${isOver ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`
        }}>
          {formatDuration(duration)}
        </span>
        {isOver && (
          <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
            Overtime {overTimeText}
          </span>
        )}
      </div>
    );
  };

  const calculateGrossDuration = (loginAt, logoutAt) => {
    const login = new Date(loginAt).getTime();
    const logout = logoutAt ? new Date(logoutAt).getTime() : Date.now();
    return Math.max(0, Math.floor((logout - login) / 1000));
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
              Agents Logs
            </h1>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
            Monitor working hours, lunch breaks, bio breaks, and tea breaks for agents under your administration.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing || loading}
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: 16, marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.6)' }}>
        
        {/* Search */}
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by agent name, email, or TL..."
            style={{ paddingLeft: 38, margin: 0, background: '#fff', border: '1px solid var(--border)' }}
          />
        </div>

        {/* Date filters */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>From</span>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ margin: 0, padding: '6px 12px', background: '#fff', fontSize: '0.8rem', border: '1px solid var(--border)' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>To</span>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ margin: 0, padding: '6px 12px', background: '#fff', fontSize: '0.8rem', border: '1px solid var(--border)' }}
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
                background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Logs Table Panel */}
      <div className="glass-panel" style={{ overflow: 'hidden', borderRadius: 20 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1.4s linear infinite', marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Loading agent logs...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Clock size={40} strokeWidth={1.5} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: 16 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>No Logs Found</h3>
            <p style={{ fontSize: '0.82rem', margin: 0, fontWeight: 500 }}>
              There are no agent work logs matching your criteria.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(248,251,255,0.4)', borderBottom: '1px solid rgba(37,99,235,0.06)' }}>
                  {['Agent', 'Date', 'Session Times', 'Gross Login', 'Lunch Break (30m)', 'Bio Break (10m)', 'Tea Break (15m)', 'Net Work Time', 'Status'].map(h => (
                    <th key={h} style={{ 
                      padding: '14px 20px', 
                      textAlign: 'left', 
                      fontSize: '0.7rem', 
                      fontWeight: 900, 
                      color: '#94a3b8', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.08em', 
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
                        borderBottom: '1px solid rgba(37,99,235,0.05)', 
                        transition: 'background 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Agent details */}
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ 
                            width: 34, height: 34, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 800, flexShrink: 0
                          }}>
                            {log.agentName?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{log.agentName}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>TL: {log.tlName}</div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '14px 20px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.loginAt)}
                      </td>

                      {/* Session Times */}
                      <td style={{ padding: '14px 20px', fontSize: '0.8rem', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div><span style={{ color: '#10b981', fontWeight: 700 }}>In:</span> {formatTime(log.loginAt)}</div>
                          <div><span style={{ color: '#ef4444', fontWeight: 700 }}>Out:</span> {formatTime(log.logoutAt)}</div>
                        </div>
                      </td>

                      {/* Gross Duration */}
                      <td style={{ padding: '14px 20px', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                        {formatDuration(grossSeconds)}
                      </td>

                      {/* Lunch Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakBadge(log.lunchDuration, limits.lunch, 'Lunch')}
                      </td>

                      {/* Bio Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakBadge(log.bioDuration, limits.bio, 'Bio')}
                      </td>

                      {/* Tea Break */}
                      <td style={{ padding: '14px 20px' }}>
                        {renderBreakBadge(log.teaDuration, limits.tea, 'Tea')}
                      </td>

                      {/* Net Work Time */}
                      <td style={{ padding: '14px 20px', fontSize: '0.875rem', fontWeight: 900, color: 'var(--primary)' }}>
                        {formatDuration(isCurrentlyActive ? (grossSeconds - (log.lunchDuration + log.bioDuration + log.teaDuration)) : log.totalWorkTime)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 20px' }}>
                        {isCurrentlyActive ? (
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: 99, 
                            background: log.activeBreakType ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                            color: log.activeBreakType ? '#f59e0b' : '#10b981',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {log.activeBreakType ? `On ${log.activeBreakType}` : 'Active'}
                          </span>
                        ) : (
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: 99, 
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
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
          from { opacity: 0; transform: translateY(16px); }
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
