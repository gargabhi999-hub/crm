const router = require('express').Router();
const multer = require('multer');
const csvSync = require('csv-parse/sync');
const XLSX = require('xlsx');
const { prisma } = require('../shared/db');
const { authorize, verify } = require('../shared/authMiddleware');
const { normalizePhone } = require('../shared/callbackUtils');
const { broadcast } = require('../shared/notificationClient');

const upload = multer({ storage: multer.memoryStorage() });

function parseCSV(buffer) {
  return csvSync.parse(buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
}

function parseRecordDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'number') {
    if (val > 100000000000) {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;

    if (/^\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      if (num > 100000000000) {
        const d = new Date(num);
        if (!isNaN(d.getTime())) return d;
      } else if (num > 10000 && num < 100000) {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) return d;
      }
    }

    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
      const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
      const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
      const d = new Date(year, month, day, hour, min, sec);
      if (!isNaN(d.getTime())) return d;
    }

    const standard = new Date(s);
    if (!isNaN(standard.getTime())) return standard;
  }
  return null;
}

function findRowDate(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  const dateCandidates = [
    'date', 'leaddate', 'lead_date', 'lead date',
    'conversiondate', 'conversion_date', 'conversion date',
    'createddate', 'created_date', 'created date',
    'createdat', 'created_at',
    'uploaddate', 'upload_date', 'upload date',
    'datetime', 'timestamp'
  ];

  for (const candidate of dateCandidates) {
    const foundKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim() === candidate);
    if (foundKey && row[foundKey]) {
      const parsed = parseRecordDate(row[foundKey]);
      if (parsed) return parsed;
    }
  }

  const fallbackKey = keys.find(k => k.toLowerCase().includes('date'));
  if (fallbackKey && row[fallbackKey]) {
    const parsed = parseRecordDate(row[fallbackKey]);
    if (parsed) return parsed;
  }

  return null;
}

router.post('/', verify, authorize(['admin', 'tl', 'agent']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { agentId, batchName, isLeadUpload } = req.body;
    if (!agentId) return res.status(400).json({ error: 'Agent ID required' });

    let selectedAgent = null;
    if (agentId !== 'multi') {
      selectedAgent = await prisma.user.findUnique({ where: { id: agentId } });
      if (!selectedAgent) return res.status(404).json({ error: 'Selected agent not found' });
      if (selectedAgent.active === false || selectedAgent.isDeleted) return res.status(400).json({ error: 'Selected agent is inactive or deleted' });
      if (selectedAgent.role === 'tl') return res.status(400).json({ error: 'Selected user is a Team Leader (only Agents can be assigned contacts)' });
    }

    let records = req.file.originalname.toLowerCase().endsWith('.xlsx') ? parseExcel(req.file.buffer) : parseCSV(req.file.buffer);
    if (!records.length) return res.status(400).json({ error: 'No records found' });

    const batchId = 'batch_' + Date.now();
    const allUsers = await prisma.user.findMany({ 
      where: { 
        role: { in: ['agent', 'tl'] }, 
        active: true, 
        isDeleted: false 
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true
      }
    });
    
    // Safely map users by name, username, and ID.
    // In case of duplicate names (e.g. TL named 'Rahul' and Agent named 'Rahul'),
    // we prefer the Agent since contacts can only be assigned to agents.
    const userMap = allUsers.reduce((acc, u) => { 
      if (u.name) {
        const nameKey = u.name.toLowerCase().trim();
        if (!acc[nameKey] || u.role === 'agent') {
          acc[nameKey] = u;
        }
      }
      if (u.username) {
        const usernameKey = u.username.toLowerCase().trim();
        if (!acc[usernameKey] || u.role === 'agent') {
          acc[usernameKey] = u;
        }
      }
      acc[u.id.toString()] = u; 
      return acc; 
    }, {});

    const isLead = String(isLeadUpload) === 'true';
    const uploadErrors = [];

    // Pre-detect agent column once to optimize loop performance
    const agentCol = records.length > 0 
      ? Object.keys(records[0]).find(k => k.toLowerCase().includes('agent'))
      : null;

    let totalUploaded = 0;
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunkRecords = records.slice(i, i + CHUNK_SIZE);
      const contactsChunk = [];

      chunkRecords.forEach((row, chunkIndex) => {
        const index = i + chunkIndex;
        let assignedId = selectedAgent?.id;
        let errorReason = null;

        if (agentId === 'multi') {
          if (agentCol && row[agentCol]) {
            const agentNameStr = row[agentCol].toString().toLowerCase().trim();
            const u = userMap[agentNameStr];
            if (u) {
              if (u.role === 'tl') {
                errorReason = `User '${row[agentCol]}' is a Team Leader (only Agents can be assigned contacts).`;
              } else {
                assignedId = u.id;
              }
            } else {
              errorReason = `Agent '${row[agentCol]}' not found or inactive.`;
            }
          } else {
            errorReason = 'Agent column missing or empty.';
          }
        }

        if (!assignedId && !errorReason) {
           errorReason = 'No valid agent assignment.';
        }

        if (errorReason) {
          uploadErrors.push({
            rowNumber: index + 2,
            name: row.Name || row.name || 'Unknown',
            phone: row.Phone || row.Mobile || row.phone || row.mobile || 'N/A',
            error: errorReason
          });
          return;
        }
        
        const capturedDate = findRowDate(row) || new Date();
        const contactDoc = {
          assignedTo: assignedId,
          batchId,
          adminId: req.user.role === 'admin' ? (req.user._id || req.user.id) : (req.user.adminId ? req.user.adminId : null),
          fields: {
            ...row,
            Date: row.Date || row.date || capturedDate.toISOString()
          },
          isDeleted: false,
          disposition: isLead ? 'Lead' : null,
          queueOrder: 0,
          createdAt: capturedDate
        };

        if (isLead) {
          contactDoc.status = row.Status || row.status || 'Converted';
          contactDoc.leadAmount = Number(row.LeadAmount || row.leadAmount || row.Amount || row.amount || 0);
          contactDoc.conversionDate = capturedDate;
          const transactionId = row.TransactionId || row.transactionId || '';
          contactDoc.remarks = (row.Remarks || row.remarks || 'Uploaded via Lead Template') + (transactionId ? ` (TXN: ${transactionId})` : '');
        }

        contactsChunk.push(contactDoc);
      });

      if (contactsChunk.length > 0) {
        await prisma.contact.createMany({ data: contactsChunk });
        totalUploaded += contactsChunk.length;
      }
    }

    if (totalUploaded === 0) {
      if (uploadErrors.length > 0) {
        return res.status(400).json({ success: false, error: 'All records failed to upload.', totalUploaded: 0, totalFailed: uploadErrors.length, uploadErrors });
      }
      return res.status(400).json({ error: 'No valid assignments could be created from the uploaded file.' });
    }
    
    await prisma.batch.create({
      data: {
        id: batchId,
        name: batchName || `Upload - ${new Date().toLocaleDateString()}`,
        adminId: req.user.role === 'admin' ? (req.user._id || req.user.id) : (req.user.adminId ? req.user.adminId : null),
        contactCount: totalUploaded,
        status: 'uploaded'
      }
    });

    broadcast('batch_uploaded', { batchId, totalUploaded });
    broadcast('dashboard_update');

    res.json({ success: true, batchId, totalUploaded, totalFailed: uploadErrors.length, uploadErrors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/batches', verify, authorize(['superadmin', 'admin', 'tl']), async (req, res) => {
  try {
    let where = {};
    if (req.user.role === 'admin') {
      where.adminId = req.user._id || req.user.id;
    } else if (req.user.role === 'tl') {
      if (req.user.adminId) where.adminId = req.user.adminId;
    }
    const batches = await prisma.batch.findMany({ 
      where, 
      orderBy: { createdAt: 'desc' } 
    });
    res.json(batches.map(b => ({ ...b, _id: b.id, uploadedAt: b.createdAt })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

router.get('/template', verify, authorize(['admin', 'tl', 'agent']), async (req, res) => {
  const format = req.query.format || 'csv';
  const type = req.query.type || 'contacts';
  
  let headers = [];
  let sampleRow = [];

  if (type === 'leads') {
    headers = ['Date', 'Name', 'Phone', 'Email', 'LeadAmount', 'Status', 'Remarks', 'TransactionId', 'Agent'];
    sampleRow = [new Date().toISOString().slice(0, 10), 'John Doe', '9876543210', 'john@example.com', '5000', 'Converted', 'Interested in premium plan', 'TXN123456', 'Priya (Agent)'];
  } else {
    headers = ['Name', 'Phone', 'Email', 'City', 'Source', 'Agent'];
    sampleRow = ['Jane Smith', '9123456780', 'jane@example.com', 'Mumbai', 'Website', 'Amit (Agent)'];
  }

  if (format === 'csv') {
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment(`crm-${type}-template.csv`);
    return res.send(csvContent);
  } else if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    try {
      const agents = await prisma.user.findMany({ where: { role: 'agent', isDeleted: false } });
      const referenceData = [['Agents available for assignment (Use exact name in Agent column)']];
      agents.forEach(a => referenceData.push([a.name]));
      
      referenceData.push([]);
      referenceData.push(['Valid Status/Dispositions (Use exact text)']);
      const statuses = ['Lead', 'Appointment', 'Call Not Answered', 'Hung Up', 'Invalid', 'Do Not Call', 'Call Back', 'Converted', 'Not Interested', 'DNC/DND', 'Others'];
      statuses.forEach(s => referenceData.push([s]));
      
      const wsRef = XLSX.utils.aoa_to_sheet(referenceData);
      XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Data');
    } catch(err) {
      console.error('Failed to append reference data sheet', err);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`crm-${type}-template.xlsx`);
    return res.send(buffer);
  } else {
    return res.status(400).json({ error: 'Invalid format requested' });
  }
});

module.exports = router;
