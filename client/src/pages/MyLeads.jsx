import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../utils/api';
import { Star, TrendingUp, Users, Calendar, Search, PhoneCall, Award, Target, Trash2, X, CheckSquare, Square, RotateCw, MessageCircle, Image as ImageIcon, Loader2, Plus, AlertTriangle } from 'lucide-react';
import LeadStatusModal from '../components/LeadStatusModal';
import CallActionModal from '../components/CallActionModal';
import ReceiptUploadModal from '../components/ReceiptUploadModal';
import WhatsAppIcon from '../components/WhatsAppIcon';
import CreateLeadModal from '../components/CreateLeadModal';
import './SuperAdminDashboard.css';

const StatCard = ({ title, value, subtext, icon: Icon, accent, delay = 0, glow = false }) => (
  <div className={`sa-glass-card sa-slide-up ${glow ? 'sa-glow' : ''}`} style={{ animationDelay: `${delay}ms`, '--card-accent': accent }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
      <div>
        <div className="sa-card-title">{title}</div>
        <div className="sa-card-value">{value}</div>
        <div className="sa-card-subtext">{subtext}</div>
      </div>
      <div className="sa-card-icon-wrapper" style={{ background: `${accent}15`, color: accent }}>
        <Icon size={20} strokeWidth={2.2} />
      </div>
    </div>
    <div className="sa-card-bg-blob" style={{ background: accent }} />
  </div>
);

const MyLeads = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ totalLeads: 0, totalAmount: 0, allLeadsCount: 0, allLeadsAmount: 0 });
  const [selectedIds, setSelectedIds] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [duplicateLead, setDuplicateLead] = useState(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Status Modal State
  const [modalLead, setModalLead] = useState(null);
  const [modalStatus, setModalStatus] = useState(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  
  // Receipt Conversion Modal State
  const [receiptModalLead, setReceiptModalLead] = useState(null);

  // Call Action Modal State
  const [callActionLead, setCallActionLead] = useState(null);

  // History State
  const [historyContact, setHistoryContact] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Scroll Position Persistence
  useEffect(() => {
    const handleScroll = () => {
      try {
        if (window.scrollY > 0) {
          sessionStorage.setItem('myleads_scroll_pos', window.scrollY.toString());
        }
      } catch (e) {}
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const restoreScrollPosition = () => {
    try {
      const saved = sessionStorage.getItem('myleads_scroll_pos');
      if (saved) {
        const top = parseInt(saved, 10);
        if (!isNaN(top) && top > 0) {
          requestAnimationFrame(() => {
            window.scrollTo({ top, behavior: 'instant' });
          });
        }
      }
    } catch (e) {}
  };

  const fetchData = async (silent = false) => {
    try {
      if (!silent && (!leads || leads.length === 0)) {
        setLoading(true);
      }
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (sourceFilter !== 'all') params.append('source', sourceFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', page);
      params.append('limit', limit);

      const [leadsRes, statsRes] = await Promise.all([
        api.get(`/leads/my-leads?${params.toString()}`),
        api.get('/leads/stats'),
      ]);

      const incomingLeads = Array.isArray(leadsRes.data?.leads) 
        ? leadsRes.data.leads 
        : (Array.isArray(leadsRes.data) ? leadsRes.data : []);
      
      setLeads(incomingLeads);
      if (leadsRes.data?.pages) setTotalPages(leadsRes.data.pages);
      if (statsRes.data) setStats(statsRes.data);

      if (!silent) {
        setTimeout(restoreScrollPosition, 60);
      }
    } catch (err) {
      console.error('Fetch leads failed', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (phone, name) => {
    try {
      setHistoryLoading(true);
      setHistoryContact({ phone, name });
      const res = await api.get(`/leads/history/${phone}`);
      setHistoryData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Fetch history failed', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (!socket) return;
    const handleSilentSync = () => fetchData(true);

    socket.on('contact_disposed', handleSilentSync);
    socket.on('dashboard_update', handleSilentSync);
    socket.on('contacts_updated', handleSilentSync);

    const emailStatusHandler = (data) => {
      if (data && (data.agentId === user?._id || data.agentId === user?.id)) {
        if (data.success) {
          addToast('📧 Receipt email sent successfully!', 'success');
        } else {
          addToast(`⚠️ Email sending failed: ${data.reason}`, 'error');
        }
      }
    };
    socket.on('email_status', emailStatusHandler);

    return () => {
      socket.off('contact_disposed', handleSilentSync);
      socket.off('dashboard_update', handleSilentSync);
      socket.off('contacts_updated', handleSilentSync);
      socket.off('email_status', emailStatusHandler);
    };
  }, [socket, page, limit, searchTerm, sourceFilter, statusFilter]);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (!Array.isArray(leads)) return;
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map(lead => lead._id || lead.id));
    }
  };

  const toggleSelectHistory = (id) => {
    setSelectedHistoryIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this lead? This will remove all associated data.')) return;
    try {
      await api.delete(`/leads/${id}`);
      fetchData(true);
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected leads?`)) return;
    try {
      await api.post('/leads/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      fetchData(true);
    } catch (err) {
      alert('Bulk delete failed');
    }
  };

  const handleHistoryBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedHistoryIds.length} selected history records?`)) return;
    try {
      await api.post('/leads/bulk-delete', { ids: selectedHistoryIds });
      setSelectedHistoryIds([]);
      addToast('Selected history records deleted successfully!', 'success');
      fetchData(true);
      if (historyContact) {
        fetchHistory(historyContact.phone, historyContact.name);
      }
    } catch (err) {
      alert('Failed to delete history records');
    }
  };

  const handleWipeLeads = async () => {
    const confirmation = window.prompt("WARNING: This will delete ALL leads and lead history. Type 'DELETE' to confirm.");
    if (confirmation === 'DELETE') {
      try {
        await api.delete('/leads/wipe');
        fetchData();
        alert('All leads have been wiped.');
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to wipe leads');
      }
    }
  };

  const handleStatusChange = (target, newStatus, type = 'lead') => {
    if (!newStatus || !target) return;
    setModalLead({ ...target, type });
    setModalStatus(newStatus);
  };

  const handleModalSave = async (formData) => {
    setModalSubmitting(true);
    try {
      const cid = modalLead.contactId || modalLead._id || modalLead.id;
      const leadId = modalLead._id || modalLead.id;

      if (modalStatus === 'Call Back') {
        const checkRes = await api.get(`/contacts/${cid}/check-callback`);
        if (checkRes.data?.exists) {
          const existing = checkRes.data.callback;
          const choice = window.confirm(
            `A callback already exists for this contact scheduled for ${new Date(existing.callBackDt).toLocaleString()}.\n\n` +
            `Click OK to EDIT the existing callback.\n` +
            `Click CANCEL to CREATE A NEW separate callback record.`
          );

          if (choice) {
            await api.put(`/leads/callbacks/${existing._id || existing.id}`, {
              callBackDt: formData.callBackDt,
              remarks: formData.remarks || `[Status update to Call Back]`
            });
            alert('Existing callback updated successfully!');
            setModalLead(null);
            setModalStatus(null);
            fetchData(true);
            return;
          }
        }
      }

      if (modalLead.type === 'lead') {
        await api.put(`/leads/${leadId}`, {
          status: modalStatus,
          ...formData
        });
        if (historyContact) fetchHistory(historyContact.phone, historyContact.name);
      } else {
        await api.put(`/contacts/${cid}/status`, {
          status: modalStatus,
          ...formData
        });
      }
      
      if (modalStatus === 'Converted') {
        addToast('Lead Converted! Email will be sent in background.', 'success');
      } else {
        addToast(`Lead status updated to ${modalStatus}!`, 'success');
      }
      
      setModalLead(null);
      setModalStatus(null);
      fetchData(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleCreateLeadSave = async (formData) => {
    setCreateSubmitting(true);
    try {
      const res = await api.post('/leads/create', formData);
      if (res.data?.success) {
        setShowCreateModal(false);
        fetchData();
        addToast('Lead created successfully!', 'success');
        
        if (res.data.hasDuplicates && res.data.duplicates?.length > 0) {
          setDuplicateLead({
            lead: res.data.lead,
            duplicates: res.data.duplicates
          });
        }
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create lead');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleCallActionSubmit = async (data) => {
    try {
      const cid = callActionLead.contactId || callActionLead._id || callActionLead.id;
      const res = await api.post(`/leads/${cid}/clone-and-dispose`, data);
      
      if (res.data?.success) {
        setCallActionLead(null);
        fetchData(true);
        addToast(`Call action saved. Lead status: ${data.status || 'Updated'}`, 'success');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to clone and dispose lead');
    }
  };

  const rawLeads = Array.isArray(leads) ? leads : [];
  const filtered = rawLeads.filter(lead => {
    if (!lead) return false;
    const fields = lead.fields || {};
    const name = (fields.Name || fields.name || lead.name || '').toLowerCase();
    const phone = (fields.Phone || fields.phone || fields.Mobile || lead.phone || '').toLowerCase();
    const s = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || name.includes(s) || phone.includes(s);
    const matchesSource = sourceFilter === 'all' || 
      (sourceFilter === 'created' ? fields.manuallyCreated : !fields.manuallyCreated);
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesSource && matchesStatus;
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 60 }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Award size={20} color="var(--primary)" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>My Leads</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            Track and manage your successful conversions
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button 
              className="btn btn-primary" 
              onClick={() => setShowCreateModal(true)}
              style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} /> Create Lead
            </button>
            <span className="badge badge-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              {rawLeads.length} Leads
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <>
              {selectedIds.length > 0 ? (
                <button className="btn btn-danger animate-scale-up" onClick={handleBulkDelete} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trash2 size={16} /> Delete Selected ({selectedIds.length})
                </button>
              ) : (
                <button className="btn btn-outline" onClick={handleWipeLeads} style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trash2 size={16} /> Wipe All Leads
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div className="sa-stats-grid" style={{ marginBottom: 28 }}>
        <StatCard
          title="TOTAL LEADS"
          value={stats?.allLeadsCount ?? stats?.totalLeads ?? 0}
          subtext="All acquired leads"
          icon={Star}
          accent="#6366f1"
          delay={0}
          glow
        />
        <StatCard
          title="TOTAL REVENUE"
          value={`₹${((stats?.allLeadsAmount ?? stats?.totalAmount ?? 0) || 0).toLocaleString()}`}
          subtext="Expected lead value"
          icon={TrendingUp}
          accent="#06b6d4"
          delay={60}
        />
        <StatCard
          title="CONVERTED LEADS"
          value={stats?.totalLeads ?? 0}
          subtext="Successfully closed"
          icon={Award}
          accent="#10b981"
          delay={120}
        />
        <StatCard
          title="CONVERTED REVENUE"
          value={`₹${((stats?.totalAmount ?? 0) || 0).toLocaleString()}`}
          subtext="Aggregate lead value"
          icon={Target}
          accent="#8b5cf6"
          delay={180}
        />
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {user?.role === 'admin' && rawLeads.length > 0 && (
          <button className="btn btn-ghost btn-icon" onClick={toggleSelectAll} title={selectedIds.length === rawLeads.length ? "Deselect All" : "Select All"}>
            {selectedIds.length === rawLeads.length ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} />}
          </button>
        )}

        <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" className="input-field" placeholder="Search by name, phone…" style={{ paddingLeft: 36, marginBottom: 0 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <select className="input-field" style={{ width: 'auto', flex: 1, minWidth: 140, marginBottom: 0 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Converted">Converted</option>
          <option value="Not Interested">Not Interested</option>
          <option value="DNC/DND">DNC/DND</option>
          <option value="Call Back">Call Back</option>
          <option value="Others">Others</option>
        </select>

        <select className="input-field" style={{ width: 'auto', flex: 1, minWidth: 140, marginBottom: 0 }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="all">All Sources</option>
          <option value="created">Agent Added</option>
          <option value="uploaded">Uploaded</option>
        </select>
      </div>

      {/* ── LEADS LIST ── */}
      {loading && rawLeads.length === 0 ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : filtered.length === 0 ? (
        <div className="glass-panel" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <Star size={64} style={{ opacity: 0.08, margin: '0 auto 20px', display: 'block' }} />
          <h3>No matching leads found</h3>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(lead => {
            if (!lead) return null;
            const fields = lead.fields || {};
            const name = fields.Name || fields.name || lead.name || 'Unknown';
            const phone = fields.Phone || fields.phone || fields.Mobile || lead.phone || 'N/A';
            const leadId = lead._id || lead.id;
            const isSelected = selectedIds.includes(leadId);

            const isNegative = lead.status === 'Not Interested' || lead.status === 'DNC/DND';
            const isConverted = lead.status === 'Converted';
            const isLocked = isConverted;
            const hasActiveLeadInHistory = Array.isArray(lead.historyStatuses) && lead.historyStatuses.some(status => status !== 'Converted' && status !== 'Not Interested');
            const isCallButtonLocked = hasActiveLeadInHistory && lead.status !== 'Call Back';

            return (
              <div key={leadId} className={`glass-panel lead-list-item ${isSelected ? 'selected' : ''}`} style={{
                padding: '16px 20px',
                borderLeft: isSelected ? '4px solid var(--primary)' : `4px solid ${isConverted ? '#10b981' : isNegative ? '#ef4444' : lead.status === 'Call Back' ? '#06b6d4' : 'var(--border)'}`,
                position: 'relative',
                opacity: isLocked ? 0.9 : 1
              }}>

                {user?.role === 'admin' && (
                  <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(leadId)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                  </div>
                )}

                <div className="lead-card-container">
                  <div className="lead-card-main">
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                      <div className="lead-card-icon" style={{
                        background: isConverted ? 'linear-gradient(135deg,#10b981,#059669)' : isNegative ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : lead.status === 'Call Back' ? 'linear-gradient(135deg,#06b6d4,#0891b2)' : 'var(--bg-surface-2)',
                        color: (isConverted || isNegative || lead.status === 'Call Back') ? '#fff' : 'var(--text-muted)',
                        marginTop: 2
                      }}>
                        <Star size={20} fill={(isConverted || isNegative || lead.status === 'Call Back') ? "white" : "none"} />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        {/* ── Line 1: Name | Phone | Date ── */}
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', marginBottom: 6 }}>
                          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                            {name}
                          </h3>
                          <span style={{ color: 'var(--border)', opacity: 0.8 }}>|</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
                            <PhoneCall size={13} style={{ color: 'var(--primary)' }} /> {phone}
                          </span>
                          <span style={{ color: 'var(--border)', opacity: 0.8 }}>|</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500 }}>
                            <Calendar size={13} /> {new Date(lead.lastModified || lead.createdAt).toLocaleDateString()}
                          </span>
                          {lead.leadsCount > 1 && (
                            <button onClick={() => fetchHistory(phone, name)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--violet)', fontWeight: 700, background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}>
                              <TrendingUp size={12} /> {lead.leadsCount} Conv.
                            </button>
                          )}
                          {lead.status === 'Call Back' && (
                            <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                              Lead Callback
                            </span>
                          )}
                        </div>

                        {/* ── Line 2: Agent: <Name> ── */}
                        {lead.agentName && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            <span>Agent: <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{lead.agentName}</span></span>
                            {user?.role === 'superadmin' && lead.tlName && lead.tlName !== 'N/A' && (
                              <> <span style={{ opacity: 0.4 }}>|</span> <span>TL: <span style={{ color: 'var(--violet)' }}>{lead.tlName}</span></span></>
                            )}
                            {user?.role === 'superadmin' && lead.adminName && lead.adminName !== 'N/A' && (
                              <> <span style={{ opacity: 0.4 }}>|</span> <span>Admin: <span style={{ color: 'var(--success)' }}>{lead.adminName}</span></span></>
                            )}
                            {fields.manuallyCreated && (
                              <span style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '0.62rem', marginLeft: 4 }}>
                                ✍️ Manually added by {fields.createdByName || 'Staff'}
                              </span>
                            )}
                          </div>
                        )}

                        {/* ── Line 3: Status Dropdown & Badges ── */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                          <select 
                            className="input-field" 
                            style={{ 
                              marginBottom: 0, 
                              padding: '4px 10px', 
                              fontSize: '0.78rem', 
                              height: 32, 
                              width: 'auto', 
                              minWidth: 120, 
                              fontWeight: 700,
                              cursor: isLocked ? 'not-allowed' : 'pointer' 
                            }} 
                            value={lead.status || ''} 
                            disabled={isLocked} 
                            onChange={(e) => handleStatusChange(lead, e.target.value, 'lead')}
                          >
                            <option value="">Set Status</option>
                            <option value="Converted">Converted</option>
                            <option value="Not Interested">Not Interested</option>
                            <option value="DNC/DND">DNC/DND</option>
                            <option value="Call Back">Call Back</option>
                            <option value="Others">Others</option>
                          </select>

                          {lead.status === 'Call Back' && lead.callBackDt && (
                            <span className="badge badge-cyan" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                              <Calendar size={11} /> {new Date(lead.callBackDt).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                          {lead.transactionId && <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>UTR: {lead.transactionId}</span>}
                        </div>
                        
                        {/* ── Line 4: Remarks Box ── */}
                        <div style={{ 
                          fontSize: '0.78rem', 
                          color: 'var(--text-secondary)', 
                          background: 'var(--bg-surface-2)', 
                          padding: '8px 12px', 
                          borderRadius: 10, 
                          border: '1px solid var(--border)',
                          lineHeight: 1.4
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Remarks: </span>
                          <span style={{ fontStyle: 'italic' }}>
                            {lead.remarks || lead.statusDetails || 'Uploaded via Lead Template'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── RIGHT ACTION COLUMN: AMOUNT & BUTTONS ── */}
                  <div className="lead-card-actions">
                    <div className="lead-amount-box" style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#10b981', lineHeight: 1.1, margin: '2px 0' }}>
                        ₹{(lead.leadAmount || 0).toLocaleString()}
                      </div>
                      {lead.totalAmount > lead.leadAmount && (
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--violet)' }}>
                          Total: ₹{lead.totalAmount.toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {user?.role !== 'admin' && phone !== 'N/A' && (
                        <>
                          {!isLocked && (
                            <button
                              className="btn btn-icon"
                              style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                              title="Upload / Scan Receipt & Convert"
                              onClick={() => setReceiptModalLead(lead)}
                              type="button"
                            >
                              <ImageIcon size={17} />
                            </button>
                          )}
                          <a 
                            href={`https://wa.me/${String(phone).replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn btn-icon" 
                            style={{ width: 36, height: 36, borderRadius: 10, background: '#25D366', color: '#fff' }}
                            title="Message on WhatsApp"
                          >
                            <WhatsAppIcon size={17} fill="currentColor" />
                          </a>
                          <button 
                            className="btn btn-primary btn-icon" 
                            style={{ 
                              width: 36, 
                              height: 36, 
                              borderRadius: 10,
                              ...(isCallButtonLocked ? {
                                background: 'var(--bg-surface-2)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-muted)',
                                opacity: 0.5,
                                cursor: 'not-allowed'
                              } : {})
                            }}
                            disabled={isCallButtonLocked}
                            onClick={async () => {
                              if (lead.status === 'Call Back') {
                                window.location.href = `tel:${phone}`;
                                return;
                              }

                              try {
                                const response = await api.get(`/leads/history/${phone}`);
                                const history = response.data || [];
                                const activeLead = history.find(item => (item._id || item.id) !== leadId && item.status !== 'Converted');
                                if (activeLead) {
                                  alert(`Already containing the lead with the lead status: ${activeLead.status}`);
                                  return;
                                }
                              } catch (err) {
                                console.error('Failed to check lead history', err);
                              }

                              window.location.href = `tel:${phone}`;
                              setCallActionLead(lead);
                            }}
                            title={isCallButtonLocked ? "Call Locked - Active lead in history" : "Call Lead"}
                            type="button"
                          >
                            <PhoneCall size={16} fill={isCallButtonLocked ? "gray" : "white"} />
                          </button>
                        </>
                      )}
                      {user?.role === 'admin' && (
                        <button className="btn btn-danger btn-icon" onClick={() => handleDelete(leadId)} style={{ width: 36, height: 36, borderRadius: 10 }} type="button">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24, paddingBottom: 24 }}>
          <button 
            className="btn btn-outline" 
            disabled={page === 1} 
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button 
            className="btn btn-outline" 
            disabled={page === totalPages} 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      <style>{`
        .lead-list-item { transition: all 0.2s; }
        .lead-list-item:hover { transform: translateX(4px); box-shadow: var(--shadow-lg); }
        
        .lead-card-container { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding-left: 24px; }
        .lead-card-main { display: flex; gap: 18px; align-items: center; flex: 1; min-width: 0; }
        .lead-card-icon { width: 44px; height: 44px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lead-card-actions { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; min-width: 130px; }

        .history-upload-btn {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--bg-surface-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .history-upload-btn .upload-icon {
          width: 14px;
          height: 14px;
        }

        @media (max-width: 768px) {
          .lead-card-container { flex-direction: column; align-items: stretch; gap: 16px; padding-left: 0; padding-top: 20px; }
          .lead-card-actions { flex-direction: row; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px; }
          .lead-card-actions .lead-amount-box { text-align: left; }
          
          .history-upload-btn {
            width: 38px;
            height: 38px;
            border-radius: 10px;
          }
          .history-upload-btn .upload-icon {
            width: 18px;
            height: 18px;
          }
        }
      `}</style>

      {/* ── STATUS UPDATE MODAL ── */}
      {modalLead && (
        <LeadStatusModal
          lead={modalLead}
          newStatus={modalStatus}
          onClose={() => { setModalLead(null); setModalStatus(null); }}
          onSave={handleModalSave}
          submitting={modalSubmitting}
        />
      )}

      {/* ── RECEIPT UPLOAD & CONVERSION MODAL ── */}
      {receiptModalLead && (
        <ReceiptUploadModal
          lead={receiptModalLead}
          onClose={() => setReceiptModalLead(null)}
          onSuccess={(updatedLead) => {
            addToast('Lead converted successfully from receipt!', 'success');
            fetchData(true);
            if (historyContact) fetchHistory(historyContact.phone, historyContact.name);
          }}
        />
      )}

      {/* ── CALL ACTION MODAL ── */}
      {callActionLead && (
        <CallActionModal
          lead={callActionLead}
          onClose={() => setCallActionLead(null)}
          onSubmit={handleCallActionSubmit}
        />
      )}

      {/* ── HISTORY MODAL ── */}
      {historyContact && (
        <div className="status-modal-overlay animate-fade-in" onClick={() => { setHistoryContact(null); setSelectedHistoryIds([]); }}>
          <div className="status-modal-content animate-scale-up" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="status-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="status-icon-wrapper" style={{ background: '#8b5cf615', color: '#8b5cf6', width: 50, height: 50, minWidth: 50, borderRadius: 14 }}>
                  <TrendingUp size={28} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>Conversion History</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{historyContact.name} ({historyContact.phone})</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {(user?.role === 'admin' || user?.role === 'superadmin') && selectedHistoryIds.length > 0 && (
                  <button 
                    className="btn btn-danger" 
                    onClick={handleHistoryBulkDelete}
                    style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={14} /> Delete ({selectedHistoryIds.length})
                  </button>
                )}
                <button onClick={() => { setHistoryContact(null); setSelectedHistoryIds([]); }} className="status-modal-close">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="status-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {historyLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}><RotateCw className="animate-spin" size={32} /></div>
              ) : historyData.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No historical records found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {historyData.slice().sort((a, b) => {
                    if (a.status === 'Converted' && b.status !== 'Converted') return 1;
                    if (a.status !== 'Converted' && b.status === 'Converted') return -1;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                  }).map((h, i) => {
                    const hId = h._id || h.id;
                    const isHistorySelected = selectedHistoryIds.includes(hId);
                    return (
                      <div key={hId || i} style={{
                        padding: 16,
                        borderRadius: 16,
                        background: 'var(--bg-surface-2)',
                        borderLeft: `4px solid ${h.status === 'Converted' ? '#10b981' : h.status === 'Not Interested' ? '#ef4444' : 'var(--border)'}`,
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start'
                      }}>
                        {(user?.role === 'admin' || user?.role === 'superadmin') && (
                          <div style={{ display: 'flex', alignItems: 'center', height: 28 }}>
                            <input
                              type="checkbox"
                              checked={isHistorySelected}
                              onChange={() => toggleSelectHistory(hId)}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                            />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <select
                              className="input-field"
                              style={{ marginBottom: 0, padding: '2px 8px', fontSize: '0.7rem', height: 28, width: 'auto', minWidth: 120 }}
                              value={h.status || ''}
                              disabled={h.status === 'Converted'}
                              title={h.status === 'Converted' ? "Locked conversions cannot be modified." : ""}
                              onChange={(e) => handleStatusChange(h, e.target.value, 'lead')}
                            >
                              <option value="">Set Status</option>
                              <option value="Converted">Converted</option>
                              <option value="Not Interested">Not Interested</option>
                              <option value="DNC/DND">DNC/DND</option>
                              <option value="Call Back">Call Back</option>
                              <option value="Others">Others</option>
                            </select>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(h.createdAt).toLocaleString()}</span>
                              {h.status !== 'Converted' && (
                                <button
                                  className="btn btn-icon history-upload-btn"
                                  title="Upload Receipt & Convert"
                                  onClick={() => setReceiptModalLead(h)}
                                  type="button"
                                >
                                  <ImageIcon className="upload-icon" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)' }}>₹{(h.leadAmount || 0).toLocaleString()}</div>
                              {h.agentName && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                  <span>Handled by: {h.agentName}</span>
                                  {h.fields?.manuallyCreated && (
                                    <span style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0 4px', borderRadius: '3px', fontWeight: 800, fontSize: '0.55rem', marginLeft: 4 }}>
                                      ✍️ Manually added by {h.fields.createdByName || 'Staff'}
                                    </span>
                                  )}
                                </div>
                              )}

                              {h.status === 'Call Back' && h.callBackDt && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--cyan)', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Calendar size={12} /> Callback: {new Date(h.callBackDt).toLocaleString()}
                                </div>
                              )}
                              {h.status === 'Appointment' && h.appointmentDt && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--violet)', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Calendar size={12} /> Appointment: {new Date(h.appointmentDt).toLocaleString()}
                                </div>
                              )}
                            </div>
                            {h.status === 'Converted' && h.transactionId && (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>UTR / Trans ID</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>{h.transactionId}</div>
                              </div>
                            )}
                          </div>
                          {(h.statusDetails || h.remarks) && (
                            <div style={{ marginTop: 12, fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.03)', padding: '8px 12px', borderRadius: 8 }}>
                              "{h.statusDetails || h.remarks}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="status-modal-footer">
              <button onClick={() => setHistoryContact(null)} className="btn btn-primary" style={{ width: '100%' }}>Close History</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateLeadModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateLeadSave}
          submitting={createSubmitting}
        />
      )}

      {/* ── DUPLICATE WARNING MODAL ── */}
      {duplicateLead && (
        <div className="status-modal-overlay animate-fade-in" style={{ zIndex: 999999 }}>
          <div className="status-modal-content animate-scale-up" style={{ maxWidth: 500, border: '2px solid var(--danger)' }}>
            <div className="status-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '24px 24px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="status-icon-wrapper" style={{ background: '#ef444415', color: '#ef4444', width: 56, height: 56, minWidth: 56, borderRadius: 14 }}>
                  <AlertTriangle size={32} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#ef4444' }}>Duplicate Lead Detected!</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Potential duplicate record found in the database</p>
                </div>
              </div>
              <button onClick={() => setDuplicateLead(null)} className="status-modal-close">
                <X size={20} />
              </button>
            </div>

            <div className="status-modal-body" style={{ padding: 24 }}>
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 16, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  A lead has been successfully created. However, our system detected that <strong>{duplicateLead.duplicates.length} duplicate lead(s)</strong> already exist for the <strong>same contact</strong>, on the <strong>same date and time</strong>, with the <strong>same transaction ID</strong> under your company.
                </p>
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Pre-existing Duplicate Lead(s):</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '200px', overflowY: 'auto' }}>
                {(Array.isArray(duplicateLead.duplicates) ? duplicateLead.duplicates : []).map((d, index) => (
                  <div key={d.id || index} style={{ padding: '12px 16px', background: 'var(--bg-surface-2)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>Handled by: {d.agentName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Created at: {new Date(d.createdAt).toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--success)' }}>₹{(d.leadAmount || 0).toLocaleString()}</div>
                      <span className={`badge ${d.status === 'Converted' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.65rem', marginTop: 4, display: 'inline-block' }}>{d.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="status-modal-footer" style={{ padding: '0 24px 24px' }}>
              <button onClick={() => setDuplicateLead(null)} className="btn btn-danger" style={{ width: '100%', padding: '12px 0', borderRadius: 12 }}>I Acknowledge</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATIONS ── */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{ 
            background: toast.type === 'error' ? '#ef4444' : '#10b981', 
            color: '#fff', padding: '12px 20px', borderRadius: 8, 
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
            fontWeight: 700, fontSize: '0.9rem',
            animation: 'revealUp 0.3s ease-out'
          }}>
            {toast.message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyLeads;
