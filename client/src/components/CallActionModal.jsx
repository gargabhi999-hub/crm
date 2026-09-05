import React, { useState, useEffect } from 'react';
import { X, PhoneCall, Star, Calendar, XCircle, RotateCw, Image } from 'lucide-react';
import api from '../utils/api';

const CallActionModal = ({ lead, onClose, onSubmit }) => {
  const [action, setAction] = useState(null); // 'Lead', 'Followup', 'Not Interested'
  const [scanning, setScanning] = useState(false);
  const [formData, setFormData] = useState({
    leadAmount: '',
    status: '',
    transactionId: '',
    statusDetails: '',
    callBackDt: '',
    remarks: '',
    receiptImage: ''
  });
  const [submitting, setSubmitting] = useState(false);

  if (!lead) return null;

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setScanning(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const imageBase64 = reader.result;
          const res = await api.post('/leads/extract-transaction', { imageBase64 });
          
          if (res.data.success && res.data.transactionId) {
            const txId = res.data.transactionId;
            const amount = res.data.amount;

            setFormData(p => {
              let updatedRemarks = p.remarks || '';
              const prefix = `[Auto-converted via receipt scan] Transaction ID: ${txId}` + (amount ? ` (Amount updated to ₹${amount})` : '');
              if (!updatedRemarks.includes('[Auto-converted via receipt scan]')) {
                updatedRemarks = prefix + (updatedRemarks ? ` - ${updatedRemarks}` : '');
              }
              return {
                ...p,
                status: 'Converted',
                transactionId: txId,
                leadAmount: amount || p.leadAmount || '',
                remarks: updatedRemarks,
                receiptImage: imageBase64
              };
            });
          } else {
            alert(res.data.error || 'Failed to extract transaction details from receipt.');
          }
        } catch (err) {
          console.error(err);
          alert(err.response?.data?.error || 'Error extracting transaction from receipt.');
        } finally {
          setScanning(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setScanning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let payload = { action, ...formData };
      if (payload.callBackDt) {
        payload.callBackDt = new Date(payload.callBackDt).toISOString();
      }
      await onSubmit(payload);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAction = () => {
    setAction(null);
    setFormData({
      leadAmount: '',
      status: '',
      transactionId: '',
      statusDetails: '',
      callBackDt: '',
      remarks: '',
      receiptImage: ''
    });
  };

  return (
    <div className="call-modal-overlay animate-fade-in">
      <div className="call-modal-content animate-scale-up">
        <div className="call-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="status-icon-wrapper" style={{ background: '#3b82f615', color: '#3b82f6' }}>
              <PhoneCall size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Log Call Action</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{lead.fields?.Name || 'Lead'}</p>
            </div>
          </div>
          <button onClick={onClose} className="call-modal-close">
            <X size={20} />
          </button>
        </div>

        <div className="call-modal-body">
          {!action ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Select an action. A new workflow record will be securely generated for this contact.
              </p>
              <button className="action-choice-btn" style={{ '--acc': 'var(--success)' }} onClick={() => setAction('Lead')}>
                <Star size={20} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800 }}>Convert to Lead</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Create a new successful lead record</div>
                </div>
              </button>
              <button className="action-choice-btn" style={{ '--acc': 'var(--danger)' }} onClick={() => setAction('Not Interested')}>
                <XCircle size={20} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800 }}>Not Interested</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Log a rejection</div>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="animate-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button type="button" onClick={resetAction} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  &larr; Back
                </button>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {action === 'Lead' && 'Convert to Lead'}
                  {action === 'Not Interested' && 'Mark as Not Interested'}
                </div>
              </div>

              {action === 'Lead' && (
                <>
                  <div className="input-group" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Scan Payment Receipt (Optional)</span>
                      {scanning && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--violet)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <RotateCw className="animate-spin" size={12} /> Scanning...
                        </span>
                      )}
                    </label>
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <input 
                        type="file" 
                        accept="image/*" 
                        id="modal-receipt-upload" 
                        style={{ display: 'none' }} 
                        onChange={handleReceiptUpload} 
                        disabled={scanning} 
                      />
                      <label 
                        htmlFor="modal-receipt-upload" 
                        className="btn" 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '8px', 
                          cursor: scanning ? 'not-allowed' : 'pointer', 
                          width: '100%', 
                          background: 'var(--bg-surface-2)', 
                          border: '1px dashed var(--border)',
                          padding: '10px',
                          borderRadius: '12px',
                          color: 'var(--text-primary)',
                          transition: 'all 0.2s',
                          fontSize: '0.9rem'
                        }}
                      >
                        <Image size={16} style={{ color: 'var(--violet)' }} />
                        {formData.receiptImage ? 'Receipt Selected (Change)' : 'Choose Receipt Image'}
                      </label>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Lead Amount (₹) *</label>
                    <input type="number" className="input-field" value={formData.leadAmount} onChange={e => setFormData(p => ({...p, leadAmount: e.target.value}))} required autoFocus />
                  </div>
                  <div className="input-group">
                    <label>Status *</label>
                    <select className="input-field" value={formData.status} onChange={e => setFormData(p => ({...p, status: e.target.value}))} required>
                      <option value="">Select Status...</option>
                      <option value="Converted">Converted</option>
                      <option value="Not Interested">Not Interested</option>
                      <option value="DNC/DND">DNC/DND</option>
                      <option value="Call Back">Call Back</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  {formData.status === 'Converted' && (
                    <div className="input-group animate-slide-up">
                      <label>Transaction ID / UTR *</label>
                      <input type="text" className="input-field" value={formData.transactionId} onChange={e => setFormData(p => ({...p, transactionId: e.target.value}))} required />
                    </div>
                  )}
                  {formData.status === 'Call Back' && (
                    <div className="input-group animate-slide-up">
                      <label>Callback Date & Time *</label>
                      <input type="datetime-local" className="input-field" value={formData.callBackDt} min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={e => setFormData(p => ({...p, callBackDt: e.target.value}))} required />
                    </div>
                  )}
                </>
              )}

              <div className="input-group">
                <label>Remarks *</label>
                <textarea className="input-field" rows="3" value={formData.remarks} onChange={e => setFormData(p => ({...p, remarks: e.target.value}))} required placeholder="Enter call notes..." autoFocus={action === 'Not Interested'} />
              </div>

              <div className="call-modal-footer">
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
                  {submitting ? <RotateCw className="animate-spin" size={18} /> : 'Save & Clone Record'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .call-modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
          display: flex; align-items: flex-start; justify-content: center; z-index: 99999; padding: 40px 16px;
          overflow-y: auto;
        }
        .call-modal-content {
          background: var(--bg-surface); width: 100%; max-width: 450px; border-radius: 24px;
          box-shadow: 0 40px 100px -12px rgba(0, 0, 0, 0.6); border: 1px solid var(--border);
          margin: 0 auto;
        }
        .call-modal-header { padding: 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .call-modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 8px; border-radius: 10px; transition: all 0.2s; }
        .call-modal-close:hover { background: var(--bg-surface-2); color: var(--text-primary); }
        .call-modal-body { padding: 24px; }
        .call-modal-footer { margin-top: 24px; display: flex; gap: 12px; }
        
        .action-choice-btn {
          display: flex; align-items: center; gap: 16px; width: 100%; padding: 18px 20px;
          border-radius: 16px; border: 2px solid transparent; background: var(--bg-surface-2);
          color: var(--acc); cursor: pointer; transition: all 0.2s;
        }
        .action-choice-btn:hover {
          background: #fff; border-color: var(--acc); box-shadow: 0 10px 30px -10px var(--acc);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};

export default CallActionModal;
