import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../utils/api';
import {
  Database, Search, PhoneCall, Check, X, Calendar,
  Star, Clock, Plus, Trash2, Filter, TrendingUp, Lock, CheckSquare, Square
} from 'lucide-react';

const DISPS = [
  { key: 'Lead',            label: 'Lead',              color: '#10b981' },
  { key: 'Appointment',     label: 'Appointment',       color: '#8b5cf6' },
  { key: 'CallNotAnswered', label: 'Call Not Answered', color: '#f59e0b' },
  { key: 'HungUp',          label: 'Hung Up',           color: '#f43f5e' },
  { key: 'Invalid',         label: 'Invalid / Wrong No.', color: '#ef4444' },
  { key: 'DoNotCall',       label: 'Do Not Call',       color: '#64748b' },
  { key: 'NotInterested',    label: 'Not Interested',    color: '#ef4444' },
  { key: 'LanguageBarrier',  label: 'Language Barrier',  color: '#3b82f6' },
  { key: 'CallBack',        label: 'Call Back',         color: '#06b6d4' },
];

const Contacts = ({ filterType }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const [contacts, setContacts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  // Pagination states
  const [page, setPage]               = useState(1);
  const [limit]                       = useState(50);
  const [totalPages, setTotalPages]   = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalLeadValue, setTotalLeadValue] = useState(0);

  const [selectedContact, setSelectedContact] = useState(null);
  const [dispForm, setDispForm] = useState({ disposition: '', remarks: '', appointmentDt: '', callBackDt: '', leadAmount: '' });

  const [selectedTl,       setSelectedTl]       = useState('');
  const [selectedAgent,    setSelectedAgent]    = useState('');
  const [tls,              setTls]              = useState([]);
  const [allAgents,        setAllAgents]        = useState([]);
  const [filteredAgents,   setFilteredAgents]   = useState([]);

  const queryStr = debouncedSearchTerm.trim();
  const isPhoneLike = /^[0-9\s+\-()]+$/.test(queryStr);
  const digitCount = (queryStr.match(/\d/g) || []).length;
  const isPhoneSearchInvalid = user?.role === 'agent' && isPhoneLike && digitCount > 0 && digitCount < 5;

  // Debouncing search term to prevent spamming queries
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [filterType, selectedTl, selectedAgent, debouncedSearchTerm]);

  const fetchContacts = async () => {
    try {
      setLoading(true);

      const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
      const isAgent = user?.role === 'agent';
      const isAllContacts = !filterType || filterType === 'all';
      const hasNoFilters = !selectedTl && !selectedAgent && !debouncedSearchTerm;

      // Load TLs/Agents dropdown options if they aren't loaded yet
      if (isAdmin && tls.length === 0) {
        try {
          const usersRes = await api.get('/users');
          const all = usersRes.data;
          setTls(all.filter(u => u.role === 'tl'));
          setAllAgents(all.filter(u => u.role === 'agent'));
          setFilteredAgents(all.filter(u => u.role === 'agent'));
        } catch (err) {
          console.error('Failed to fetch users', err);
        }
      }

      if ((isAdmin || isAgent) && isAllContacts && (hasNoFilters || isPhoneSearchInvalid)) {
        setContacts([]);
        setTotalRecords(0);
        setTotalPages(1);
        setTotalLeadValue(0);
        setError(null);
        setLoading(false);
        return;
      }

      let query = `?page=${page}&limit=${limit}`;
      
      if (filterType === 'leads')        query += '&disposition=Lead';
      else if (filterType === 'appointments') query += '&disposition=Appointment';
      else if (filterType === 'workflow') query += '&disposition=pending';
      
      if (selectedTl)    query += `&tlId=${selectedTl}`;
      if (selectedAgent) query += `&agentId=${selectedAgent}`;
      if (debouncedSearchTerm) query += `&search=${encodeURIComponent(debouncedSearchTerm)}`;

      const res = await api.get(`/contacts${query}`);
      
      // The API returns paginated data structure: { contacts, total, page, limit, pages, totalLeadValue }
      setContacts(res.data.contacts || []);
      setTotalRecords(res.data.total || 0);
      setTotalPages(res.data.pages || 1);
      setTotalLeadValue(res.data.totalLeadValue || 0);
      setError(null);

      if (isAdmin && tls.length === 0) {
        const usersRes = await api.get('/users');
        const all = usersRes.data;
        setTls(all.filter(u => u.role === 'tl'));
        setAllAgents(all.filter(u => u.role === 'agent'));
        setFilteredAgents(all.filter(u => u.role === 'agent'));
      }
    } catch (err) {
      console.error('Fetch contacts failed', err);
      setError(err.response?.data?.details || err.response?.data?.error || 'Failed to connect to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    if (!socket) return;
    const handler = () => fetchContacts();
    ['contacts_updated', 'batch_uploaded', 'users_updated'].forEach(e => socket.on(e, handler));
    return () => ['contacts_updated', 'batch_uploaded', 'users_updated'].forEach(e => socket.off(e, handler));
  }, [filterType, socket, location.pathname, selectedTl, selectedAgent, page, debouncedSearchTerm]);

  useEffect(() => {
    if (selectedTl) {
      setFilteredAgents(allAgents.filter(a => a.tlId === selectedTl));
    } else {
      setFilteredAgents(allAgents);
    }
  }, [selectedTl, allAgents]);

  useEffect(() => {
    if (selectedContact) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedContact]);

  // Backward compatible filtered variable which points to contacts directly
  const filtered = contacts;

  const handleDispose = async (e) => {
    e.preventDefault();
    try {
      const remarkWords = dispForm.remarks.trim().split(/\s+/).filter(w => w.length > 0);
      if (remarkWords.length < 1) { alert('Remarks are mandatory'); return; }

      let transactionId = '';
      if (dispForm.disposition === 'Lead') {
        const tid = window.prompt('Please enter Transaction ID:');
        if (tid === null) return;
        transactionId = tid;
      }

      const payload = { ...dispForm, transactionId };
      if (payload.appointmentDt) payload.appointmentDt = new Date(payload.appointmentDt).toISOString();
      if (payload.callBackDt) payload.callBackDt = new Date(payload.callBackDt).toISOString();
      
      await api.post(`/contacts/${selectedContact._id}/dispose`, payload);
      setSelectedContact(null);
      setDispForm({ disposition: '', remarks: '', appointmentDt: '', callBackDt: '', leadAmount: '' });
      fetchContacts();
    } catch (err) {
      alert(err.response?.data?.error || 'Disposition failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await api.delete(`/contacts/${id}`);
      fetchContacts();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} selected contacts?`)) return;
    try {
      await api.post('/contacts/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      fetchContacts();
    } catch (err) {
      alert('Bulk delete failed');
    }
  };

  const handleWipeContacts = async () => {
    const confirmation = window.prompt("WARNING: This will delete ALL contacts in the system. Type 'DELETE' to confirm.");
    if (confirmation === 'DELETE') {
      try {
        await api.delete('/contacts/wipe');
        fetchContacts();
        alert('All contacts have been wiped.');
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to wipe data');
      }
    }
  };

  const handleExportDeletePending = async () => {
    const agentObj = allAgents.find(a => a._id === selectedAgent);
    const agentName = agentObj ? agentObj.name : 'Selected Agent';
    
    const confirm = window.confirm(`WARNING: This will permanently delete ALL pending (undisposed) contacts assigned to ${agentName} from the database. A CSV copy will be downloaded first. Are you sure you want to proceed?`);
    if (!confirm) return;

    try {
      setLoading(true);
      const res = await api.post('/contacts/export-delete-pending', { agentId: selectedAgent }, { responseType: 'blob' });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      const cleanAgentName = agentName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `pending_contacts_${cleanAgentName}_${new Date().toISOString().split('T')[0]}.csv`;
      a.setAttribute('download', filename);
      document.body.appendChild(a); a.click(); a.remove();
      
      alert('Pending contacts exported and deleted successfully.');
      setSelectedAgent('');
      fetchContacts();
    } catch (err) {
      console.error(err);
      if (err.response?.data) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          alert(parsed.error || 'Failed to export and delete pending contacts');
        } catch {
          alert('Failed to export and delete pending contacts');
        }
      } else {
        alert('Failed to export and delete pending contacts');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(c => c._id));
    }
  };

  const pageInfo = {
    leads:        { title: 'Leads',         icon: <Star size={22} style={{ color: '#10b981' }} /> },
    appointments: { title: 'Appointments',  icon: <Calendar size={22} style={{ color: '#8b5cf6' }} /> },
    workflow:     { title: 'Workflow Queue', icon: <Clock size={22} style={{ color: '#f59e0b' }} /> },
    all:          { title: 'All Contacts',  icon: <Database size={22} style={{ color: 'var(--primary)' }} /> },
  };
  const { title, icon } = pageInfo[filterType] || pageInfo.all;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: 'var(--h1)' }}>{icon} {title}</h1>
          <p className="page-subtitle">{filterType === 'workflow' ? 'Your pending contacts to call' : `Manage and view your ${title.toLowerCase()}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {user?.role === 'superadmin' && (!filterType || filterType === 'all') && (
            <button className="btn btn-danger" onClick={handleWipeContacts} style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
              <Trash2 size={15} /> Wipe All Contacts
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <button className="btn btn-outline" onClick={toggleSelectAll} style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
              {selectedIds.length === filtered.length ? <CheckSquare size={15} /> : <Square size={15} />} 
              {selectedIds.length === filtered.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          {selectedIds.length > 0 && (user?.role === 'admin' || user?.role === 'superadmin') && (
            <button className="btn btn-danger" onClick={handleBulkDelete} style={{ boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>
              <Trash2 size={15} /> Delete Selected ({selectedIds.length})
            </button>
          )}
          <span className="badge badge-primary" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>{totalRecords} Records</span>
        </div>
      </div>

      {filterType === 'leads' && (
        <div className="glass-panel" style={{ marginBottom: 'var(--gap)', padding: 'var(--card-p)', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap', boxShadow: '0 10px 30px rgba(16,185,129,0.25)' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff', marginBottom: 6 }}>Total Revenue Generated</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>₹{totalLeadValue.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff', marginBottom: 6 }}>Total Leads</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>{totalRecords}</div>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ marginBottom: 'var(--gap)', padding: '14px 18px' }}>
        <div className="contacts-filter-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" className="input-field" placeholder="Search..." style={{ paddingLeft: 42, marginBottom: 0 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <>
              <select className="input-field" style={{ marginBottom: 0, minWidth: 150 }} value={selectedTl} onChange={e => setSelectedTl(e.target.value)}>
                <option value="">All TLs</option>
                {tls.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <select className="input-field" style={{ marginBottom: 0, minWidth: 150 }} value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
                <option value="">All Agents</option>
                {filteredAgents.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
              {selectedAgent && (
                <button 
                  className="btn btn-danger animate-fade-in" 
                  onClick={handleExportDeletePending} 
                  style={{ 
                    marginBottom: 0, 
                    padding: '10px 18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    boxShadow: '0 6px 20px rgba(239, 68, 68, 0.25)',
                    border: 'none',
                    borderRadius: 'var(--r-md)',
                    transition: 'all 0.2s ease',
                    fontSize: '0.8rem',
                    fontWeight: '700'
                  }}
                >
                  <Trash2 size={16} /> Export & Delete Pending
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid-cards">
        {loading ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : error ? (
          <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center', gridColumn: '1 / -1', border: '1px solid #fee2e2' }}>
            <X size={40} style={{ color: '#ef4444', marginBottom: 16 }} />
            <h3 style={{ color: '#ef4444' }}>Connection Error</h3>
            <p style={{ color: 'var(--text-muted)' }}>{error}</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={fetchContacts}>Retry Connection</button>
          </div>
        ) : (user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'agent') && (!filterType || filterType === 'all') && !selectedTl && !selectedAgent && (!debouncedSearchTerm || isPhoneSearchInvalid) ? (
          <div className="glass-panel animate-fade-in" style={{ padding: '60px 40px', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Search size={40} style={{ color: isPhoneSearchInvalid ? 'var(--warning)' : 'var(--primary)', marginBottom: 16, opacity: 0.8 }} />
            <h3>{isPhoneSearchInvalid ? 'Search Validation' : 'Please search to find contacts'}</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              {isPhoneSearchInvalid 
                ? 'Please enter at least 5 digits to search by contact number.' 
                : (user?.role === 'agent' ? 'Contacts allocated to you will be shown once you use the search bar.' : 'Contacts will be shown once you apply a filter or use the search bar.')
              }
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Database size={40} style={{ color: 'var(--text-muted)', marginBottom: 16, opacity: 0.5 }} />
            <h3>No contacts found</h3>
            <p style={{ color: 'var(--text-muted)' }}>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          filtered.map(contact => {
            const fields = contact.fields || {};
            const mainName = fields.Name || fields.name || 'Unknown';
            const phone = fields.Phone || fields.phone || fields.Mobile || 'No Phone';
            const disp = DISPS.find(d => d.key === contact.disposition);
            const isSel = selectedIds.includes(contact._id);

            return (
              <div key={contact._id} className="glass-panel contact-card" style={{ padding: 16, position: 'relative', border: isSel ? '2px solid var(--primary)' : undefined }}>
                {(user?.role === 'admin' || user?.role === 'superadmin') && (
                  <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleSelect(contact._id)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </div>
                )}
                
                <div style={{ display: 'flex', justifySelf: 'space-between', marginBottom: 12, paddingLeft: (user?.role === 'admin' || user?.role === 'superadmin') ? 28 : 0 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{mainName}</h3>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}><PhoneCall size={13} /> {phone}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {disp && <span className="badge" style={{ background: `${disp.color}18`, color: disp.color }}>{disp.label}</span>}
                    {contact.isDeleted && <span className="badge" style={{ background: '#ef444418', color: '#ef4444', marginLeft: 6 }}>Deleted</span>}
                    {contact.leadAmount > 0 && <div className="badge badge-success">₹{contact.leadAmount.toLocaleString()}</div>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 12, background: 'var(--bg-surface-2)', borderRadius: 'var(--r-md)' }}>
                  {Object.entries(fields).slice(0, 4).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{String(v)}</div>
                    </div>
                  ))}
                  {contact.remarks && <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>"{contact.remarks}"</div>}
                  {contact.transactionId && <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>UTR/ID: {contact.transactionId}</div>}
                  
                  {filterType === 'leads' && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                      <select className="input-field" value={contact.status || ''}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          let transactionId = contact.transactionId;
                          if (newStatus === 'Converted') {
                            const tid = window.prompt('Enter Transaction ID:', transactionId || '');
                            if (tid === null) return;
                            transactionId = tid;
                          }
                          try {
                            await api.put(`/contacts/${contact._id}/status`, { status: newStatus, transactionId });
                            fetchContacts();
                          } catch(err) { alert(err.response?.data?.error || 'Update failed'); }
                        }}
                      >
                        <option value="">Set Status</option>
                        <option value="Converted">Converted</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="DNC/DND">DNC/DND</option>
                        <option value="Call Back">Call Back</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span>Agent: <strong>{contact.agentName}</strong></span>
                    {user?.role === 'superadmin' && contact.tlName && contact.tlName !== 'N/A' && (
                      <> <span>|</span> <span>TL: <strong>{contact.tlName}</strong></span></>
                    )}
                    {user?.role === 'superadmin' && contact.adminName && contact.adminName !== 'N/A' && (
                      <> <span>|</span> <span>Admin: <strong>{contact.adminName}</strong></span></>
                    )}
                    {fields.manuallyCreated && (
                      <span style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '0.6rem', marginLeft: 4 }}>
                        ✍️ Manually added by {fields.createdByName || 'Staff'}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(user?.role === 'admin' || user?.role === 'superadmin') && <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(contact._id)}><Trash2 size={15} style={{ color: 'var(--danger)' }} /></button>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'var(--gap)',
          padding: '14px 18px',
          background: 'var(--bg-surface-1)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          gap: 16,
          flexWrap: 'wrap'
        }} className="glass-panel animate-fade-in">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing <strong>{(page - 1) * limit + 1}</strong> to <strong>{Math.min(page * limit, totalRecords)}</strong> of <strong>{totalRecords}</strong> records
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-outline"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Previous
            </button>
            
            {/* Direct Page Jump Buttons */}
            {(() => {
              const pages = [];
              const startPage = Math.max(1, page - 2);
              const endPage = Math.min(totalPages, page + 2);
              
              if (startPage > 1) {
                pages.push(
                  <button key={1} className={`btn ${page === 1 ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(1)} style={{ padding: '6px 10px', fontSize: '0.8rem', minWidth: 32 }}>
                    1
                  </button>
                );
                if (startPage > 2) {
                  pages.push(<span key="dots-start" style={{ color: 'var(--text-muted)', margin: '0 4px' }}>...</span>);
                }
              }
              
              for (let i = startPage; i <= endPage; i++) {
                pages.push(
                  <button key={i} className={`btn ${page === i ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(i)} style={{ padding: '6px 10px', fontSize: '0.8rem', minWidth: 32 }}>
                    {i}
                  </button>
                );
              }
              
              if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                  pages.push(<span key="dots-end" style={{ color: 'var(--text-muted)', margin: '0 4px' }}>...</span>);
                }
                pages.push(
                  <button key={totalPages} className={`btn ${page === totalPages ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(totalPages)} style={{ padding: '6px 10px', fontSize: '0.8rem', minWidth: 32 }}>
                    {totalPages}
                  </button>
                );
              }
              
              return pages;
            })()}
            
            <button
              className="btn btn-outline"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedContact && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header"><h2>Update Disposition</h2><button onClick={() => setSelectedContact(null)}><X size={18} /></button></div>
            <form onSubmit={handleDispose}>
              <div className="input-group">
                <label htmlFor="modalDisp">Disposition</label>
                <select id="modalDisp" name="disposition" className="input-field" value={dispForm.disposition} onChange={e => setDispForm({ ...dispForm, disposition: e.target.value, appointmentDt: '', callBackDt: '', leadAmount: '' })} required>
                  <option value="">-- Select --</option>
                  {DISPS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>

              {dispForm.disposition === 'Appointment' && (
                <div className="input-group">
                  <label htmlFor="modalApptDt">Appointment Date & Time</label>
                  <input id="modalApptDt" name="appointmentDt" type="datetime-local" className="input-field" value={dispForm.appointmentDt} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setDispForm({ ...dispForm, appointmentDt: e.target.value })} required />
                </div>
              )}

              {dispForm.disposition === 'CallBack' && (
                <div className="input-group">
                  <label htmlFor="modalCBDt">Callback Date & Time</label>
                  <input id="modalCBDt" name="callBackDt" type="datetime-local" className="input-field" value={dispForm.callBackDt} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setDispForm({ ...dispForm, callBackDt: e.target.value })} required />
                </div>
              )}

              {dispForm.disposition === 'Lead' && (
                <div className="input-group">
                  <label htmlFor="modalLeadAmt">Lead Amount (₹)</label>
                  <input id="modalLeadAmt" name="leadAmount" type="number" className="input-field" value={dispForm.leadAmount} onChange={e => setDispForm({ ...dispForm, leadAmount: e.target.value })} required />
                </div>
              )}
              <div className="input-group">
                <label htmlFor="modalRemarks">Remarks *</label>
                <textarea id="modalRemarks" name="remarks" className="input-field" rows="3" value={dispForm.remarks} onChange={e => setDispForm({ ...dispForm, remarks: e.target.value })} placeholder="Notes..." required />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setSelectedContact(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;
