import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Calendar, MessageSquare, CreditCard, RotateCw, XCircle, ShieldAlert } from 'lucide-react';

const LeadStatusModal = ({ lead, newStatus, onClose, onSave, submitting }) => {
  const [formData, setFormData] = useState({
    leadAmount: lead?.leadAmount || '',
    transactionId: lead?.transactionId || '',
    callBackDt: (() => {
      try {
        if (!lead?.callBackDt) return '';
        const d = new Date(lead.callBackDt);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
      } catch (e) {
        return '';
      }
    })(),
    statusDetails: lead?.statusDetails || '',
    remarks: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    let payload = { ...formData };
    if (payload.callBackDt) {
      try {
        const d = new Date(payload.callBackDt);
        payload.callBackDt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch (e) {
        payload.callBackDt = new Date().toISOString();
      }
    }
    if (payload.leadAmount) {
      payload.leadAmount = parseFloat(payload.leadAmount) || 0;
    }
    onSave(payload);
  };

  if (!lead || !newStatus) return null;

  const getTitle = () => {
    switch (newStatus) {
      case 'Converted': return 'Mark as Converted';
      case 'Call Back': return 'Schedule Callback';
      case 'Not Interested': return 'Mark as Not Interested';
      case 'DNC/DND': return 'Mark as DNC / DND';
      case 'Others': return 'Set Status: Others';
      default: return `Update Status to ${newStatus}`;
    }
  };

  const getIcon = () => {
    switch (newStatus) {
      case 'Converted': return <CreditCard className="text-success" size={24} color="#10b981" />;
      case 'Call Back': return <Calendar className="text-cyan" size={24} color="#06b6d4" />;
      case 'Not Interested': return <XCircle size={24} color="#ef4444" />;
      case 'DNC/DND': return <ShieldAlert size={24} color="#f59e0b" />;
      case 'Others': return <MessageSquare className="text-primary" size={24} color="#6366f1" />;
      default: return <Check className="text-primary" size={24} color="#6366f1" />;
    }
  };

  const leadName = lead.fields?.Name || lead.fields?.name || lead.name || 'Lead';

  return createPortal(
    <div className="detail-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="detail-modal-content animate-scale-up" onClick={e => e.stopPropagation()}>
        <div className="detail-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="status-icon-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'var(--bg-surface-2)' }}>
              {getIcon()}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{getTitle()}</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Updating {leadName}</p>
            </div>
          </div>
          <button onClick={onClose} className="detail-modal-close" type="button">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="detail-modal-body">
          {newStatus === 'Converted' && (
            <>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label htmlFor="modalAmount" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Conversion Amount (₹)</label>
                <input 
                  id="modalAmount"
                  type="number" 
                  step="any"
                  className="input-field" 
                  value={formData.leadAmount} 
                  onChange={e => setFormData(p => ({ ...p, leadAmount: e.target.value }))}
                  placeholder="e.g. 3000"
                  style={{ marginBottom: 0 }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label htmlFor="modalTransactionId" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Transaction ID / UTR *</label>
                <input 
                  id="modalTransactionId"
                  type="text" 
                  className="input-field" 
                  value={formData.transactionId} 
                  onChange={e => setFormData(p => ({ ...p, transactionId: e.target.value }))}
                  required
                  placeholder="Enter payment reference ID / UTR..."
                  autoFocus
                  style={{ marginBottom: 0 }}
                />
              </div>
            </>
          )}

          {newStatus === 'Call Back' && (
            <div className="input-group" style={{ marginBottom: 14 }}>
              <label htmlFor="modalCallBackDt" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Next Callback Date & Time *</label>
              <input 
                id="modalCallBackDt"
                type="datetime-local" 
                className="input-field" 
                value={formData.callBackDt} 
                min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={e => setFormData(p => ({ ...p, callBackDt: e.target.value }))}
                required
                autoFocus
                style={{ marginBottom: 0 }}
              />
            </div>
          )}

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="modalRemarks" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>
              {newStatus === 'Not Interested' || newStatus === 'DNC/DND' ? 'Reason / Remarks *' : 'Remarks / Notes *'}
            </label>
            <textarea 
              id="modalRemarks"
              className="input-field" 
              rows="3"
              value={formData.remarks} 
              onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
              required
              placeholder={
                newStatus === 'Not Interested' ? 'Why is the customer not interested? (e.g. Financial issue, high price, etc.)' :
                newStatus === 'DNC/DND' ? 'Enter DNC / Do Not Call reason...' :
                newStatus === 'Call Back' ? 'Notes for next follow-up call...' :
                'Enter detailed remarks regarding this lead...'
              }
              autoFocus={newStatus !== 'Converted' && newStatus !== 'Call Back'}
              style={{ marginBottom: 0, resize: 'vertical' }}
            />
          </div>

          <div className="detail-modal-footer">
            <button type="button" onClick={onClose} className="btn btn-outline" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <RotateCw className="animate-spin" size={18} /> : 'Save Status & Remarks'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .detail-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000000;
          padding: 20px 16px;
          overflow-y: auto;
          box-sizing: border-box;
        }
        .detail-modal-content {
          background: var(--bg-surface);
          width: 100%;
          max-width: 460px;
          border-radius: 20px;
          box-shadow: 0 30px 90px -10px rgba(0, 0, 0, 0.5);
          border: 1px solid var(--border);
          margin: auto;
          max-height: calc(100vh - 40px);
          overflow-y: auto;
        }
        .detail-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .detail-modal-close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .detail-modal-close:hover {
          background: var(--bg-surface-2);
          color: var(--text-primary);
        }
        .detail-modal-body {
          padding: 20px 24px;
        }
        .detail-modal-footer {
          margin-top: 20px;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default LeadStatusModal;
