import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Calendar, MessageSquare, CreditCard, RotateCw, User, Phone, Mail, Award, DollarSign } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const CreateLeadModal = ({ onClose, onSave, submitting }) => {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    leadAmount: '',
    status: 'Converted',
    remarks: '',
    transactionId: '',
    callBackDt: '',
    createdAt: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    assignedTo: user?._id || user?.id || ''
  });

  useEffect(() => {
    // Fetch agents if the user is a Team Leader, Admin, or Super Admin
    if (['tl', 'admin', 'superadmin'].includes(user?.role)) {
      const fetchAgents = async () => {
        try {
          setLoadingAgents(true);
          const endpoint = user.role === 'tl' ? '/users/my-agents' : '/users';
          const res = await api.get(endpoint);
          
          // Filter only active agents (and include themselves in the choices)
          const teamAgents = res.data.filter(u => u.active && u.role === 'agent');
          setAgents(teamAgents);
        } catch (err) {
          console.error('Failed to fetch team agents', err);
        } finally {
          setLoadingAgents(false);
        }
      };
      fetchAgents();
    }
  }, [user]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Name and Phone are required.');
      return;
    }
    
    const payload = { ...formData };
    
    // Convert dates to proper ISO formats
    if (payload.createdAt) {
      payload.createdAt = new Date(payload.createdAt).toISOString();
    }
    if (payload.status === 'Call Back' && payload.callBackDt) {
      payload.callBackDt = new Date(payload.callBackDt).toISOString();
    }

    onSave(payload);
  };

  return createPortal(
    <div className="create-lead-overlay" onClick={onClose}>
      <div className="create-lead-content" onClick={e => e.stopPropagation()}>
        <div className="create-lead-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="status-icon-wrapper" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
              <Plus size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Create New Lead</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Manually insert a successful conversion or callback</p>
            </div>
          </div>
          <button onClick={onClose} className="create-lead-close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="create-lead-body">
          
          {/* Main Fields Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="leadName" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} /> Contact Name *
              </label>
              <input 
                id="leadName"
                type="text" 
                className="input-field" 
                value={formData.name} 
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="Enter client's full name..."
                autoFocus
              />
            </div>

            <div className="input-group">
              <label htmlFor="leadPhone" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={14} /> Contact Phone *
              </label>
              <input 
                id="leadPhone"
                type="tel" 
                className="input-field" 
                value={formData.phone} 
                onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                required
                placeholder="Mobile number..."
              />
            </div>

            <div className="input-group">
              <label htmlFor="leadEmail" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={14} /> Email Address
              </label>
              <input 
                id="leadEmail"
                type="email" 
                className="input-field" 
                value={formData.email} 
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                placeholder="client@example.com"
              />
            </div>

            <div className="input-group">
              <label htmlFor="leadAmount" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={14} /> Lead Value (₹) *
              </label>
              <input 
                id="leadAmount"
                type="number" 
                className="input-field" 
                value={formData.leadAmount} 
                onChange={e => setFormData(p => ({ ...p, leadAmount: e.target.value }))}
                required
                min="0"
                placeholder="Amount in Rupees..."
              />
            </div>

            <div className="input-group">
              <label htmlFor="leadStatus" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={14} /> Initial Status *
              </label>
              <select 
                id="leadStatus"
                className="input-field" 
                value={formData.status} 
                onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                required
              >
                <option value="Converted">Converted</option>
                <option value="Call Back">Call Back</option>
                <option value="Not Interested">Not Interested</option>
                <option value="DNC/DND">DNC/DND</option>
                <option value="Others">Others</option>
              </select>
            </div>
          </div>

          {/* Conditional Input Groups based on status */}
          {formData.status === 'Converted' && (
            <div className="input-group" style={{ marginTop: '4px' }}>
              <label htmlFor="leadTransactionId" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={14} className="text-success" /> Transaction ID / UTR *
              </label>
              <input 
                id="leadTransactionId"
                type="text" 
                className="input-field" 
                value={formData.transactionId} 
                onChange={e => setFormData(p => ({ ...p, transactionId: e.target.value }))}
                required
                placeholder="Enter unique payment transaction reference..."
              />
            </div>
          )}

          {formData.status === 'Call Back' && (
            <div className="input-group" style={{ marginTop: '4px' }}>
              <label htmlFor="leadCallBackDt" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} className="text-cyan" /> Next Callback Date & Time *
              </label>
              <input 
                id="leadCallBackDt"
                type="datetime-local" 
                className="input-field" 
                value={formData.callBackDt} 
                min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={e => setFormData(p => ({ ...p, callBackDt: e.target.value }))}
                required
              />
            </div>
          )}

          {/* Lead Creation Date & Time (for custom date override and duplicate check mapping) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
            <div className="input-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="leadCreatedAt" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} /> Lead Date & Time (Created At) *
              </label>
              <input 
                id="leadCreatedAt"
                type="datetime-local" 
                className="input-field" 
                value={formData.createdAt} 
                onChange={e => setFormData(p => ({ ...p, createdAt: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Agent Assignment dropdown (Visible only to TL, Admin, Superadmin) */}
          {['tl', 'admin', 'superadmin'].includes(user?.role) && (
            <div className="input-group" style={{ marginTop: '4px' }}>
              <label htmlFor="leadAssignment" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} /> Assign Lead to Agent *
              </label>
              {loadingAgents ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <RotateCw className="animate-spin" size={14} /> Loading team agents...
                </div>
              ) : (
                <select 
                  id="leadAssignment"
                  className="input-field" 
                  value={formData.assignedTo} 
                  onChange={e => setFormData(p => ({ ...p, assignedTo: e.target.value }))}
                  required
                >
                  <option value={user?._id || user?.id}>{user?.name} (TL - Self)</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.username})</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="input-group" style={{ marginTop: '4px' }}>
            <label htmlFor="leadRemarks" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={14} /> Remarks & Client Notes
            </label>
            <textarea 
              id="leadRemarks"
              className="input-field" 
              rows="3"
              value={formData.remarks} 
              onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
              placeholder="Enter client conversation details or payment notes..."
            />
          </div>

          <div className="create-lead-footer">
            <button type="button" onClick={onClose} className="btn btn-outline" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <RotateCw className="animate-spin" size={18} /> : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .create-lead-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000000;
          padding: 20px 16px;
          overflow-y: auto;
          box-sizing: border-box;
          animation: createLeadFadeIn 0.25s ease-out;
        }
        
        .create-lead-content {
          background: var(--bg-surface);
          width: 100%;
          max-width: 520px;
          border-radius: 24px;
          box-shadow: 0 40px 100px -12px rgba(0, 0, 0, 0.6);
          border: 1px solid var(--border);
          margin: auto;
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          animation: createLeadSlideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
          overflow: hidden;
        }

        .create-lead-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-surface-2);
        }

        .create-lead-close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 8px;
          border-radius: 10px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .create-lead-close:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }

        .create-lead-body {
          padding: 24px;
        }

        .create-lead-footer {
          margin-top: 24px;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          border-top: 1px solid var(--border);
          padding-top: 20px;
        }

        @keyframes createLeadFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes createLeadSlideDown {
          from { transform: translateY(-40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default CreateLeadModal;
