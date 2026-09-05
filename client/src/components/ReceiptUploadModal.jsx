import React, { useState, useEffect, useRef } from 'react';
import { X, UploadCloud, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, RotateCw, FileText } from 'lucide-react';
import api from '../utils/api';

const ReceiptUploadModal = ({ lead, onClose, onSuccess }) => {
  const [imageBase64, setImageBase64] = useState('');
  const [imageName, setImageName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null); // 'success' | 'failed' | null
  const [scanMessage, setScanMessage] = useState('');
  
  const [formData, setFormData] = useState({
    leadAmount: lead?.leadAmount || '',
    transactionId: lead?.transactionId || '',
    remarks: '[Auto-converted via payment receipt upload]'
  });
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Preserve scroll position
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  if (!lead) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const processImageFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, or JPEG).');
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      setImageBase64(base64);
      runOcrExtraction(base64);
    };
    reader.readAsDataURL(file);
  };

  const runOcrExtraction = async (base64) => {
    setScanning(true);
    setScanStatus(null);
    setScanMessage('');
    try {
      const res = await api.post('/leads/extract-transaction', { imageBase64: base64 });
      if (res.data.success && res.data.transactionId && res.data.transactionId !== 'NOT_FOUND') {
        const txId = res.data.transactionId;
        const amount = res.data.amount;
        
        setFormData(prev => ({
          ...prev,
          transactionId: txId,
          leadAmount: amount || prev.leadAmount,
          remarks: `[Auto-converted via receipt scan] Transaction ID: ${txId}${amount ? ` (Amount updated to ₹${amount})` : ''}`
        }));
        setScanStatus('success');
        setScanMessage(`Transaction ID detected: ${txId}${amount ? ` | Amount: ₹${amount}` : ''}`);
      } else {
        setScanStatus('failed');
        setScanMessage('Could not detect Transaction ID automatically. Please fill in details manually.');
      }
    } catch (err) {
      console.warn('OCR extraction error:', err);
      setScanStatus('failed');
      setScanMessage('AI scanning unavailable. Please verify and enter Amount and Transaction ID manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.transactionId) {
      alert('Please enter a Transaction ID / UTR number.');
      return;
    }
    setSubmitting(true);
    try {
      const parsedAmount = parseFloat(formData.leadAmount) || (lead.leadAmount || 0);
      const updatePayload = {
        status: 'Converted',
        leadAmount: parsedAmount,
        transactionId: formData.transactionId.trim(),
        remarks: formData.remarks.trim(),
        receiptImage: imageBase64 || undefined
      };

      // 1. Update Lead Record
      await api.put(`/leads/${lead._id}`, updatePayload);

      // 2. If contactId exists, update Contact record too
      if (lead.contactId) {
        await api.put(`/contacts/${lead.contactId}/status`, {
          status: 'Converted',
          leadAmount: parsedAmount,
          transactionId: formData.transactionId.trim(),
          remarks: formData.remarks.trim(),
          receiptImage: imageBase64 || undefined
        });
      }

      if (onSuccess) onSuccess({ ...lead, ...updatePayload });
      onClose();
    } catch (err) {
      console.error('Failed to convert lead:', err);
      alert(err.response?.data?.error || 'Failed to save conversion details.');
    } finally {
      setSubmitting(false);
    }
  };

  const leadName = lead.fields?.Name || lead.fields?.name || lead.name || 'Lead';

  return (
    <div className="detail-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="detail-modal-content animate-scale-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="detail-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <ImageIcon size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Upload Receipt & Convert</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lead: {leadName}</p>
            </div>
          </div>
          <button onClick={onClose} className="detail-modal-close" type="button">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="detail-modal-body">
          {/* Upload Drop Zone */}
          <div style={{ marginBottom: 16 }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={handleFileChange} 
            />

            {!imageBase64 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 14,
                  padding: '28px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-surface-2)',
                  transition: 'all 0.2s ease'
                }}
              >
                <UploadCloud size={36} color="var(--primary)" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.8 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Click or drag payment receipt here
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Supports PNG, JPG, JPEG (Max 10MB)
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-surface-2)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
                <img 
                  src={imageBase64} 
                  alt="Receipt Preview" 
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} 
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {imageName || 'Receipt Image'}
                  </div>
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 4 }}
                  >
                    Change Receipt Image
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Scan Status Feedback */}
          {scanning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, marginBottom: 14 }}>
              <Loader2 size={16} className="animate-spin" />
              <span>AI scanning receipt for transaction details...</span>
            </div>
          )}

          {scanStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, marginBottom: 14 }}>
              <CheckCircle2 size={16} />
              <span>{scanMessage}</span>
            </div>
          )}

          {scanStatus === 'failed' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, marginBottom: 14 }}>
              <AlertCircle size={16} />
              <span>{scanMessage}</span>
            </div>
          )}

          {/* Amount Field */}
          <div className="input-group" style={{ marginBottom: 14 }}>
            <label htmlFor="receiptModalAmount" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Conversion Amount (₹) *</label>
            <input 
              id="receiptModalAmount"
              type="number" 
              step="any"
              className="input-field" 
              value={formData.leadAmount} 
              onChange={e => setFormData(p => ({ ...p, leadAmount: e.target.value }))}
              placeholder="e.g. 3000"
              required
              style={{ marginBottom: 0 }}
            />
          </div>

          {/* Transaction ID / UTR */}
          <div className="input-group" style={{ marginBottom: 14 }}>
            <label htmlFor="receiptModalTxId" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Transaction ID / UTR *</label>
            <input 
              id="receiptModalTxId"
              type="text" 
              className="input-field" 
              value={formData.transactionId} 
              onChange={e => setFormData(p => ({ ...p, transactionId: e.target.value }))}
              placeholder="Enter or confirm UTR / Transaction Reference ID..."
              required
              style={{ marginBottom: 0 }}
            />
          </div>

          {/* Remarks */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="receiptModalRemarks" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4, display: 'block' }}>Remarks / Notes *</label>
            <textarea 
              id="receiptModalRemarks"
              className="input-field" 
              rows="3"
              value={formData.remarks} 
              onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
              placeholder="Enter conversion remarks..."
              required
              style={{ marginBottom: 0, resize: 'vertical' }}
            />
          </div>

          <div className="detail-modal-footer">
            <button type="button" onClick={onClose} className="btn btn-outline" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }} disabled={submitting || scanning}>
              {submitting ? <RotateCw className="animate-spin" size={18} /> : 'Save & Mark Converted'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .detail-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 20px 16px;
          overflow-y: auto;
        }
        .detail-modal-content {
          background: var(--bg-surface);
          width: 100%;
          border-radius: 20px;
          box-shadow: 0 30px 90px -10px rgba(0, 0, 0, 0.5);
          border: 1px solid var(--border);
          margin: 0 auto;
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
    </div>
  );
};

export default ReceiptUploadModal;
