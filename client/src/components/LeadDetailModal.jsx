import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Star, Phone, PhoneCall, TrendingUp, Calendar, CreditCard, Clock, 
  User, CheckCircle2, AlertCircle, Trash2, Edit3, MessageCircle, 
  Image as ImageIcon, ExternalLink, ShieldCheck, Copy, Check, 
  Layers, FileText, ChevronRight, RotateCw, Mail, MapPin, Hash, Sparkles
} from 'lucide-react';
import api from '../utils/api';
import WhatsAppIcon from './WhatsAppIcon';
import './LeadDetailModal.css';

const formatSafeDateTime = (val) => {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) 
      ? 'N/A' 
      : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (e) {
    return 'N/A';
  }
};

const formatSafeDate = (val) => {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return 'N/A';
  }
};

const LeadDetailModal = ({
  lead,
  rowNumber,
  onClose,
  user,
  onStatusChange,
  onOpenReceipt,
  onOpenCharity,
  onOpenCallAction,
  onDelete,
  addToast
}) => {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'c360' | 'history'
  const [copiedField, setCopiedField] = useState(null);

  // Customer 360 state
  const [c360Data, setC360Data] = useState(null);
  const [loadingC360, setLoadingC360] = useState(false);

  // Conversion History state
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Lock background scrolling completely while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const fields = lead?.fields || {};
  const name = fields.Name || fields.name || fields['Full Name'] || lead?.name || 'Unknown';
  const rawPhone = fields.Phone || fields.phone || fields.Mobile || fields.mobile || lead?.phone || '';
  const cleanPhone = String(rawPhone).replace(/\D/g, '');
  const displayPhone = rawPhone || 'N/A';
  const email = fields.Email || fields.email || 'N/A';
  const leadId = lead?._id || lead?.id;
  const isConverted = lead?.status === 'Converted';
  const isNegative = lead?.status === 'Not Interested' || lead?.status === 'DNC/DND';
  const isCallBack = lead?.status === 'Call Back';
  const isLocked = isConverted;
  const hasActiveLeadInHistory = Array.isArray(lead?.historyStatuses) && 
    lead.historyStatuses.some(s => s !== 'Converted' && s !== 'Not Interested');
  const isCallButtonLocked = hasActiveLeadInHistory && lead?.status !== 'Call Back';

  const effAmount = lead?.isCharityConfirmed && (lead?.charityAmount !== null && lead?.charityAmount !== undefined)
    ? lead.charityAmount
    : lead?.leadAmount;

  const statusColor = isConverted ? '#10b981' : isNegative ? '#ef4444' : isCallBack ? '#06b6d4' : 'var(--primary)';

  // Fetch Customer 360 & History when modal opens or phone changes
  useEffect(() => {
    if (!cleanPhone) return;

    const fetch360 = async () => {
      try {
        setLoadingC360(true);
        const res = await api.get(`/contacts/customer-360/${cleanPhone}`);
        setC360Data(res.data);
      } catch (err) {
        console.error('Failed to load Customer 360 data:', err);
      } finally {
        setLoadingC360(false);
      }
    };

    const fetchHistory = async () => {
      try {
        setLoadingHistory(true);
        const res = await api.get(`/leads/history/${cleanPhone}`);
        setHistoryData(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load history data:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetch360();
    fetchHistory();
  }, [cleanPhone]);

  const copyToClipboard = (text, fieldName) => {
    if (!text || text === 'N/A') return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      if (addToast) addToast(`Copied ${fieldName} to clipboard!`, 'success');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const getEntryMeta = (type, label) => {
    const normLabel = (label || '').toLowerCase();
    if (normLabel.includes('lead') || normLabel.includes('convert')) return { color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.12)', border: '#10b981' };
    if (normLabel.includes('appointment')) return { color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.12)', border: '#8b5cf6' };
    if (normLabel.includes('not answered')) return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b' };
    if (normLabel.includes('hung up')) return { color: '#f43f5e', bgColor: 'rgba(244, 63, 94, 0.12)', border: '#f43f5e' };
    if (normLabel.includes('invalid') || normLabel.includes('wrong')) return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.12)', border: '#ef4444' };
    if (normLabel.includes('do not call') || normLabel.includes('dnc')) return { color: '#b91c1c', bgColor: 'rgba(185, 28, 28, 0.12)', border: '#b91c1c' };
    if (normLabel.includes('not interested')) return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.12)', border: '#ef4444' };
    if (normLabel.includes('language barrier')) return { color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6' };
    if (normLabel.includes('call back') || normLabel.includes('callback')) return { color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.12)', border: '#06b6d4' };
    if (normLabel.includes('requeued')) return { color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6' };
    if (normLabel.includes('status:')) return { color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.12)', border: '#8b5cf6' };
    return { color: 'var(--primary)', bgColor: 'rgba(37, 99, 235, 0.12)', border: 'var(--primary)' };
  };

  if (!lead) return null;

  return createPortal(
    <div 
      className="lead-detail-overlay animate-fade-in" 
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="lead-detail-modal-container" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── MODAL HEADER ── */}
        <div className="lead-detail-header">
          <div className="lead-detail-header-left">
            {rowNumber !== undefined && rowNumber !== null && (
              <span className="lead-detail-serial-badge" title="Lead Serial Number">
                #{rowNumber}
              </span>
            )}
            <div 
              className="lead-detail-avatar"
              style={{
                background: isConverted ? 'rgba(16,185,129,0.15)' : isNegative ? 'rgba(239,68,68,0.15)' : isCallBack ? 'rgba(6,182,212,0.15)' : 'rgba(37,99,235,0.12)',
                color: statusColor
              }}
            >
              <Star size={22} fill={(isConverted || isNegative || isCallBack) ? "currentColor" : "none"} />
            </div>
            <div className="lead-detail-title-box">
              <div className="lead-detail-name-row">
                <h2 className="lead-detail-title" title={name}>{name}</h2>
                <span 
                  className={`badge ${
                    isConverted ? 'badge-success' :
                    isCallBack ? 'badge-cyan' :
                    isNegative ? 'badge-danger' :
                    'badge-primary'
                  }`}
                  style={{ fontSize: '0.72rem', padding: '3px 8px', fontWeight: 800 }}
                >
                  {lead.status || 'Active Lead'}
                </span>
                {lead.isCharityConfirmed && (
                  <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '3px 8px', fontWeight: 800 }}>
                    ✓ Confirmed by Charity
                  </span>
                )}
              </div>
              <div className="lead-detail-subtitle">
                {lead.agentName && (
                  <span>
                    <User size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                    Agent: <strong>{lead.agentName}</strong>
                  </span>
                )}
                <span>•</span>
                <span>
                  <Clock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  Created: {formatSafeDateTime(lead.createdAt)}
                </span>
                {lead.conversionDate && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>
                      Converted: {formatSafeDate(lead.conversionDate)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose} 
            className="lead-detail-close-btn"
            title="Close Pop-up (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── ACTION TOOLBAR ── */}
        <div className="lead-detail-actions-bar">
          <div className="lead-detail-actions-group">
            {/* Status Dropdown */}
            <div className="lead-status-select-wrap">
              <select
                className="lead-status-select"
                value=""
                disabled={isLocked}
                title={isLocked ? "Conversion locked - Status cannot be altered" : "Change Lead Status"}
                onChange={(e) => {
                  if (e.target.value) {
                    onStatusChange(lead, e.target.value);
                  }
                }}
              >
                <option value="" disabled>{lead.status ? `Status: ${lead.status}` : 'Set Status'}</option>
                <option value="Converted">Converted</option>
                <option value="Not Interested">Not Interested</option>
                <option value="DNC/DND">DNC/DND</option>
                <option value="Call Back">Call Back</option>
                <option value="Others">Others</option>
              </select>
            </div>

            {/* Upload Receipt & Convert */}
            {!isLocked && user?.role !== 'admin' && (
              <button
                type="button"
                className="lead-action-pill-btn btn-receipt"
                onClick={() => onOpenReceipt(lead)}
                title="Upload or scan receipt to convert this lead"
              >
                <ImageIcon size={15} />
                <span>Scan Receipt</span>
              </button>
            )}

            {/* Confirmed by Charity Button */}
            {lead.isCharityConfirmed ? (
              <span className="badge badge-success" style={{ fontSize: '0.74rem', padding: '6px 10px', fontWeight: 800 }}>
                ✓ UTR: {lead.utrCharity || lead.transactionId}
              </span>
            ) : (
              (lead.status === 'Converted' || lead.transactionId) && (
                <button
                  type="button"
                  className="lead-action-pill-btn btn-charity"
                  onClick={() => onOpenCharity(lead)}
                  title="Confirm donation with Charity UTR and verified amount"
                >
                  <ShieldCheck size={15} />
                  <span>✓ Confirmed by Charity</span>
                </button>
              )
            )}

            {/* Edit Remarks button */}
            {!isLocked && (
              <button
                type="button"
                className="lead-action-pill-btn"
                style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                onClick={() => onStatusChange(lead, lead.status || 'Others')}
                title="Update remarks or notes for this lead"
              >
                <Edit3 size={14} />
                <span>Edit Remarks</span>
              </button>
            )}
          </div>

          <div className="lead-detail-actions-group">
            {/* WhatsApp Button */}
            {cleanPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="lead-action-pill-btn btn-whatsapp"
                title={`Chat with ${name} on WhatsApp`}
              >
                <WhatsAppIcon size={15} fill="#ffffff" />
                <span>WhatsApp</span>
              </a>
            )}

            {/* Call Customer Button */}
            {cleanPhone && (
              <button
                type="button"
                className={`lead-action-pill-btn btn-call ${isCallButtonLocked ? 'locked' : ''}`}
                disabled={isCallButtonLocked}
                onClick={() => onOpenCallAction(lead)}
                title={isCallButtonLocked ? "Call Locked: Active lead in history" : `Call ${displayPhone} & log action`}
              >
                <PhoneCall size={15} />
                <span>{isCallButtonLocked ? 'Call Locked' : 'Call Lead'}</span>
              </button>
            )}

            {/* Delete button (Admins only) */}
            {user?.role === 'admin' && (
              <button
                type="button"
                className="lead-action-pill-btn btn-delete"
                onClick={() => onDelete(leadId)}
                title="Delete this lead"
              >
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* ── TAB NAVIGATION ── */}
        <div className="lead-detail-tabs-nav">
          <button 
            type="button"
            className={`lead-detail-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            <FileText size={16} />
            <span>Complete Details</span>
          </button>
          
          <button 
            type="button"
            className={`lead-detail-tab-btn ${activeTab === 'c360' ? 'active' : ''}`}
            onClick={() => setActiveTab('c360')}
          >
            <TrendingUp size={16} />
            <span>Customer 360</span>
            {c360Data?.timeline && (
              <span className="lead-detail-tab-count">
                {c360Data.timeline.length}
              </span>
            )}
          </button>

          <button 
            type="button"
            className={`lead-detail-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Layers size={16} />
            <span>Conversion History</span>
            {historyData.length > 0 && (
              <span className="lead-detail-tab-count">
                {historyData.length}
              </span>
            )}
          </button>
        </div>

        {/* ── MODAL BODY (SCROLLABLE) ── */}
        <div className="lead-detail-body">
          {/* TAB 1: COMPLETE DETAILS */}
          {activeTab === 'details' && (
            <>
              {/* Financial & Status Metrics */}
              <div className="lead-stat-grid">
                <div className="lead-stat-card">
                  <div className="lead-stat-card-label">Lead Amount</div>
                  <div className="lead-stat-card-value" style={{ color: '#10b981' }}>
                    ₹{(effAmount || 0).toLocaleString()}
                  </div>
                  <div className="lead-stat-card-sub">
                    {lead.isCharityConfirmed && lead.charityAmount ? (
                      <span style={{ color: '#10b981', fontWeight: 700 }}>
                        ✓ Charity Confirmed (Agent: ₹{(lead.leadAmount || 0).toLocaleString()})
                      </span>
                    ) : (
                      <span>Expected revenue value</span>
                    )}
                  </div>
                </div>

                <div className="lead-stat-card">
                  <div className="lead-stat-card-label">Charity / UTR</div>
                  <div className="lead-stat-card-value" style={{ fontSize: '1rem', wordBreak: 'break-all' }}>
                    {lead.utrCharity || lead.transactionId || 'None'}
                  </div>
                  <div className="lead-stat-card-sub">
                    {lead.isCharityConfirmed ? 'Confirmed with NGO receipt' : lead.transactionId ? 'Internal reference recorded' : 'No UTR attached'}
                  </div>
                </div>

                <div className="lead-stat-card">
                  <div className="lead-stat-card-label">Current Status</div>
                  <div className="lead-stat-card-value" style={{ color: statusColor, fontSize: '1.15rem' }}>
                    {lead.status || 'Active'}
                  </div>
                  <div className="lead-stat-card-sub">
                    Last modified: {formatSafeDate(lead.lastModified || lead.createdAt)}
                  </div>
                </div>

                <div className="lead-stat-card">
                  <div className="lead-stat-card-label">Handled By</div>
                  <div className="lead-stat-card-value" style={{ fontSize: '1.1rem' }}>
                    {lead.agentName || 'Unassigned'}
                  </div>
                  <div className="lead-stat-card-sub">
                    {fields.manuallyCreated ? '✍️ Manually Created Lead' : 'Batch Lead'}
                  </div>
                </div>
              </div>

              {/* Contact Information & Quick Actions */}
              <div className="lead-section-card">
                <div className="lead-section-header">
                  <h3 className="lead-section-title">
                    <User size={16} color="var(--primary)" /> Primary Contact Details
                  </h3>
                </div>

                <div className="lead-fields-grid">
                  <div className="lead-field-item">
                    <span className="lead-field-label">Customer Name</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span className="lead-field-value">{name}</span>
                      <button 
                        type="button" 
                        onClick={() => copyToClipboard(name, 'Name')} 
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                        title="Copy Name"
                      >
                        {copiedField === 'Name' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="lead-field-item">
                    <span className="lead-field-label">Phone Number</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span className="lead-field-value" style={{ color: 'var(--primary)', fontWeight: 900 }}>
                        {displayPhone}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button 
                          type="button" 
                          onClick={() => copyToClipboard(displayPhone, 'Phone')} 
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                          title="Copy Phone"
                        >
                          {copiedField === 'Phone' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        </button>
                        {cleanPhone && (
                          <a href={`tel:${cleanPhone}`} style={{ color: 'var(--primary)' }} title="Direct Tel Call">
                            <Phone size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lead-field-item">
                    <span className="lead-field-label">Email Address</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span className="lead-field-value">{email}</span>
                      {email !== 'N/A' && (
                        <a href={`mailto:${email}`} style={{ color: 'var(--primary)' }} title="Send Email">
                          <Mail size={14} />
                        </a>
                      )}
                    </div>
                  </div>

                  {lead.callBackDt && (
                    <div className="lead-field-item" style={{ borderLeft: '3px solid var(--cyan)' }}>
                      <span className="lead-field-label" style={{ color: 'var(--cyan)' }}>Scheduled Callback</span>
                      <span className="lead-field-value" style={{ color: 'var(--cyan)' }}>
                        <Calendar size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                        {formatSafeDateTime(lead.callBackDt)}
                      </span>
                    </div>
                  )}

                  {lead.appointmentDt && (
                    <div className="lead-field-item" style={{ borderLeft: '3px solid #8b5cf6' }}>
                      <span className="lead-field-label" style={{ color: '#8b5cf6' }}>Scheduled Appointment</span>
                      <span className="lead-field-value" style={{ color: '#8b5cf6' }}>
                        <Calendar size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                        {formatSafeDateTime(lead.appointmentDt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks / Notes Section */}
              <div className="lead-section-card">
                <div className="lead-section-header">
                  <h3 className="lead-section-title">
                    <MessageCircle size={16} color="var(--primary)" /> Agent Remarks & Notes
                  </h3>
                  {!isLocked && (
                    <button 
                      type="button" 
                      onClick={() => onStatusChange(lead, lead.status || 'Others')}
                      className="btn btn-sm"
                      style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6 }}
                    >
                      <Edit3 size={12} style={{ marginRight: 4 }} /> Edit Remarks
                    </button>
                  )}
                </div>
                <div className="lead-remarks-container">
                  <p className="lead-remarks-text">
                    "{lead.remarks || lead.statusDetails || 'No specific remarks or interaction notes recorded yet.'}"
                  </p>
                </div>
              </div>

              {/* All Additional Lead Fields (Dynamic Custom Fields) */}
              {Object.keys(fields).length > 0 && (
                <div className="lead-section-card">
                  <div className="lead-section-header">
                    <h3 className="lead-section-title">
                      <Sparkles size={16} color="var(--primary)" /> Additional Lead Fields & Metadata
                    </h3>
                  </div>
                  <div className="lead-fields-grid">
                    {Object.entries(fields)
                      .filter(([k]) => !['Name', 'name', 'Phone', 'phone', 'Mobile', 'mobile', 'Email', 'email', 'manuallyCreated', 'createdByName'].includes(k))
                      .map(([key, val]) => (
                        <div key={key} className="lead-field-item">
                          <span className="lead-field-label">{key}</span>
                          <span className="lead-field-value">
                            {val !== null && val !== undefined && val !== '' ? String(val) : '—'}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: CUSTOMER 360 */}
          {activeTab === 'c360' && (
            <>
              {loadingC360 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <RotateCw className="animate-spin" size={32} style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>Loading Customer 360 timeline & metrics...</p>
                </div>
              ) : !c360Data ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>No Customer 360 record found for phone: {displayPhone}</p>
                </div>
              ) : (
                <>
                  {/* Lifetime Customer Metrics Bar */}
                  <div className="lead-stat-grid">
                    <div className="lead-stat-card">
                      <div className="lead-stat-card-label">Total Leads</div>
                      <div className="lead-stat-card-value" style={{ color: 'var(--primary)' }}>
                        {c360Data.leadsCount || 0}
                      </div>
                      <div className="lead-stat-card-sub">Recorded across campaigns</div>
                    </div>
                    <div className="lead-stat-card">
                      <div className="lead-stat-card-label">Total Contacts</div>
                      <div className="lead-stat-card-value">
                        {c360Data.contactsCount || 0}
                      </div>
                      <div className="lead-stat-card-sub">In queue & batch files</div>
                    </div>
                    <div className="lead-stat-card">
                      <div className="lead-stat-card-label">Scheduled Callbacks</div>
                      <div className="lead-stat-card-value" style={{ color: 'var(--cyan)' }}>
                        {c360Data.callbacksCount || 0}
                      </div>
                      <div className="lead-stat-card-sub">Follow-up commitments</div>
                    </div>
                    <div className="lead-stat-card">
                      <div className="lead-stat-card-label">Appointments</div>
                      <div className="lead-stat-card-value" style={{ color: '#8b5cf6' }}>
                        {c360Data.appointmentsCount || 0}
                      </div>
                      <div className="lead-stat-card-sub">Scheduled demo/meetings</div>
                    </div>
                  </div>

                  {/* Converted History Banner */}
                  {c360Data.hasConvertedLead && Array.isArray(c360Data.convertedLeads) && c360Data.convertedLeads.length > 0 && (
                    <div className="c360-converted-banner">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#10b981', fontWeight: 900, fontSize: '0.96rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <CheckCircle2 size={18} />
                        <span>🌟 Converted Lead History Found ({c360Data.convertedLeads.length})</span>
                      </div>
                      <div className="c360-converted-grid">
                        {c360Data.convertedLeads.map((conv, idx) => (
                          <div key={idx} className="c360-converted-card">
                            <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                              Amt: ₹{((conv.isCharityConfirmed && conv.charityAmount ? conv.charityAmount : conv.leadAmount) || 0).toLocaleString()}
                            </span>
                            {conv.isCharityConfirmed && conv.utrCharity ? (
                              <>
                                <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                  UTR-Internal: {conv.transactionId || 'N/A'}
                                </span>
                                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 900, color: '#10b981', wordBreak: 'break-all' }}>
                                  ✓ UTR-Charity: {conv.utrCharity}
                                </span>
                              </>
                            ) : (
                              <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                UTR: {conv.transactionId || 'N/A'}
                              </span>
                            )}
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              By {conv.agentName || 'Agent'} on {formatSafeDate(conv.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interaction Timeline */}
                  <div className="lead-section-card">
                    <div className="lead-section-header">
                      <h3 className="lead-section-title">
                        <Clock size={16} color="var(--primary)" /> Complete Interaction Timeline
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        {c360Data.timeline?.length || 0} Interactions Recorded
                      </span>
                    </div>

                    {(!c360Data.timeline || c360Data.timeline.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No past touches or interaction history found.
                      </div>
                    ) : (
                      <div className="c360-timeline-container">
                        {c360Data.timeline.map((entry, idx) => {
                          const meta = getEntryMeta(entry.type, entry.label);

                          return (
                            <div key={idx} className="c360-timeline-item">
                              <div 
                                className="c360-timeline-node" 
                                style={{ border: `3px solid ${meta.color}` }}
                              />
                              <div className="c360-timeline-card" style={{ borderLeft: `3px solid ${meta.color}` }}>
                                <div className="c360-timeline-header">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      color: meta.color,
                                      background: meta.bgColor,
                                      border: `1px solid ${meta.border}`,
                                      padding: '2px 8px',
                                      borderRadius: '16px',
                                      textTransform: 'uppercase'
                                    }}>
                                      {entry.label || 'Interaction'}
                                    </span>
                                    {entry.agent && (
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        by <strong style={{ color: 'var(--primary)' }}>{entry.agent}</strong>
                                      </span>
                                    )}
                                  </div>
                                  {entry.date && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      {formatSafeDateTime(entry.date)}
                                    </span>
                                  )}
                                </div>
                                {entry.content && (
                                  <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--text-secondary)',
                                    lineHeight: 1.45,
                                    fontStyle: entry.type === 'legacy' ? 'normal' : 'italic',
                                    background: 'var(--bg-surface)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    marginTop: 4,
                                    wordBreak: 'break-word'
                                  }}>
                                    {entry.content}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 3: CONVERSION HISTORY */}
          {activeTab === 'history' && (
            <>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <RotateCw className="animate-spin" size={32} style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>Fetching conversion history...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>No historical conversion records found for this contact.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {historyData.slice().sort((a, b) => {
                    if (a.status === 'Converted' && b.status !== 'Converted') return -1;
                    if (a.status !== 'Converted' && b.status === 'Converted') return 1;
                    return (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
                  }).map((h, i) => {
                    const hId = h._id || h.id;
                    const hConverted = h.status === 'Converted';
                    const hNegative = h.status === 'Not Interested' || h.status === 'DNC/DND';
                    const hColor = hConverted ? '#10b981' : hNegative ? '#ef4444' : h.status === 'Call Back' ? '#06b6d4' : 'var(--border)';

                    return (
                      <div 
                        key={hId || i}
                        style={{
                          padding: 16,
                          borderRadius: 14,
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border)',
                          borderLeft: `4px solid ${hColor}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span 
                              className={`badge ${
                                hConverted ? 'badge-success' : 
                                h.status === 'Call Back' ? 'badge-cyan' : 
                                hNegative ? 'badge-danger' : 
                                'badge-primary'
                              }`}
                              style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 800 }}
                            >
                              {h.status || 'Lead'}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {formatSafeDateTime(h.createdAt)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {!hConverted && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6 }}
                                onClick={() => onOpenReceipt(h)}
                                title="Upload receipt for this historical lead"
                              >
                                <ImageIcon size={13} style={{ marginRight: 4 }} /> Upload Receipt
                              </button>
                            )}
                            {hConverted && !h.isCharityConfirmed && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid #10b981', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}
                                onClick={() => onOpenCharity(h)}
                                title="Confirm Charity UTR"
                              >
                                <ShieldCheck size={13} style={{ marginRight: 4 }} /> Confirm Charity
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            {h.isCharityConfirmed && (h.charityAmount !== null && h.charityAmount !== undefined) ? (
                              <div>
                                <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Charity Confirmed</span>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981' }}>₹{(h.charityAmount || 0).toLocaleString()}</div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Agent Amt: ₹{(h.leadAmount || 0).toLocaleString()}</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                                ₹{(h.leadAmount || 0).toLocaleString()}
                              </div>
                            )}

                            {h.agentName && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                Handled by: <strong style={{ color: 'var(--text-primary)' }}>{h.agentName}</strong>
                              </div>
                            )}

                            {h.status === 'Call Back' && h.callBackDt && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--cyan)', fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={12} /> Callback: {formatSafeDateTime(h.callBackDt)}
                              </div>
                            )}
                          </div>

                          {hConverted && (
                            <div style={{ textAlign: 'right' }}>
                              {h.isCharityConfirmed ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                                  <span className="badge" style={{ fontSize: '0.65rem' }}>UTR: {h.transactionId || 'N/A'}</span>
                                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>✓ Charity: {h.utrCharity}</span>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transaction ID</span>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981' }}>{h.transactionId || 'N/A'}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {(h.remarks || h.statusDetails) && (
                          <div style={{
                            fontSize: '0.82rem',
                            color: 'var(--text-secondary)',
                            background: 'rgba(0,0,0,0.03)',
                            padding: '8px 12px',
                            borderRadius: 8,
                            fontStyle: 'italic',
                            wordBreak: 'break-word'
                          }}>
                            "{h.remarks || h.statusDetails}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="lead-detail-footer">
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Sr. No: <strong>#{rowNumber || 1}</strong></span>
            <span>•</span>
            <span>Status: <strong>{lead.status || 'Active'}</strong></span>
            <span>•</span>
            <span>Value: <strong>₹{(effAmount || 0).toLocaleString()}</strong></span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="btn btn-secondary"
            style={{ padding: '7px 20px', fontSize: '0.82rem', borderRadius: 8 }}
          >
            Close Pop-up
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LeadDetailModal;
