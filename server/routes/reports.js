const router = require('express').Router();
const { prisma } = require('../shared/db');
const { verify, authorize } = require('../shared/authMiddleware');
const XLSX = require('xlsx');

const DISP_LABELS = {
  Lead: 'Lead',
  Appointment: 'Appointment',
  CallNotAnswered: 'Call Not Answered',
  HungUp: 'Hung Up',
  Invalid: 'Invalid / Wrong No.',
  DoNotCall: 'Do Not Call',
  CallBack: 'Call Back',
  NotInterested: 'Not Interested',
  LanguageBarrier: 'Language Barrier',
};

// Helper: Format seconds into HH:MM:SS
const formatSeconds = (secs) => {
  if (!secs || isNaN(secs)) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Helper: Safe date string
const formatDateTime = (dt) => {
  if (!dt) return '';
  try {
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN');
  } catch {
    return '';
  }
};

const formatDateOnly = (dt) => {
  if (!dt) return '';
  try {
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

// Helper to sanitize filename
const sanitizeFilename = (str) => {
  return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
};

/**
 * GET /api/reports/companies
 * Returns list of companies (Admins) for Superadmin, or single company for Company Admin
 */
router.get('/companies', verify, authorize(['superadmin', 'admin']), async (req, res) => {
  try {
    if (req.user.role === 'superadmin') {
      const companies = await prisma.user.findMany({
        where: { role: 'admin', isDeleted: false },
        select: { id: true, name: true, username: true, receiverMail: true },
        orderBy: { name: 'asc' }
      });
      return res.json(companies.map(c => ({
        id: c.id,
        name: c.name || c.username || 'Unnamed Company',
        username: c.username,
        email: c.receiverMail || c.username
      })));
    } else {
      const company = await prisma.user.findUnique({
        where: { id: req.user._id || req.user.id },
        select: { id: true, name: true, username: true, receiverMail: true }
      });
      return res.json(company ? [{
        id: company.id,
        name: company.name || company.username || 'My Company',
        username: company.username,
        email: company.receiverMail || company.username
      }] : []);
    }
  } catch (err) {
    console.error('Failed to fetch companies for reports:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

/**
 * GET /api/reports/agents
 * Returns list of agents based on company/admin selection and user role
 */
router.get('/agents', verify, authorize(['superadmin', 'admin', 'tl']), async (req, res) => {
  try {
    const { adminId } = req.query;
    let where = { role: 'agent', isDeleted: false };

    if (req.user.role === 'admin') {
      where.adminId = req.user._id || req.user.id;
    } else if (req.user.role === 'tl') {
      where.tlId = req.user._id || req.user.id;
    } else if (req.user.role === 'superadmin') {
      if (adminId && adminId !== 'all') {
        where.adminId = adminId;
      }
    }

    const agents = await prisma.user.findMany({
      where,
      select: { id: true, name: true, username: true, adminId: true, tlId: true },
      orderBy: { name: 'asc' }
    });
    res.json(agents);
  } catch (err) {
    console.error('Failed to fetch agents for reports:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

/**
 * Shared query builder and row formatter for Preview and Download
 */
async function buildReportData(req, options = {}) {
  const { isPreview = false, limit: requestedLimit } = options;
  const {
    reportType = 'all-leads',
    adminId,
    agentId,
    batchId,
    disposition,
    fromDate,
    toDate,
    status
  } = req.query;

  // 1. Resolve Company / Admin scoping
  let effectiveAdminId = null;
  if (req.user.role === 'admin') {
    effectiveAdminId = req.user._id || req.user.id;
  } else if (req.user.role === 'superadmin') {
    if (adminId && adminId !== 'all') {
      effectiveAdminId = adminId;
    }
  }

  // 2. Fetch admin and agent maps for fast labeling
  const [admins, allUsers] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, name: true, username: true }
    }),
    prisma.user.findMany({
      select: { id: true, name: true, username: true, tlId: true, role: true, adminId: true }
    })
  ]);

  const adminMap = {};
  admins.forEach(a => { adminMap[a.id] = a.name || a.username || 'Company'; });

  const userMap = {};
  const userTlMap = {};
  allUsers.forEach(u => {
    userMap[u.id] = u.name || u.username || 'Unknown';
    if (u.tlId) userTlMap[u.id] = u.tlId;
  });

  // 3. Handle AGENT WORK LOGS separately
  if (reportType === 'agent-log' || reportType === 'agent-logs') {
    const logWhere = {};
    if (fromDate && toDate) {
      logWhere.loginAt = {
        gte: new Date(fromDate),
        lte: new Date(new Date(toDate).setHours(23, 59, 59, 999))
      };
    } else if (fromDate) {
      logWhere.loginAt = { gte: new Date(fromDate) };
    } else if (toDate) {
      logWhere.loginAt = { lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)) };
    }

    if (req.user.role === 'agent') {
      logWhere.userId = req.user._id || req.user.id;
    } else if (req.user.role === 'tl') {
      const agents = allUsers.filter(u => u.role === 'agent' && u.tlId === (req.user._id || req.user.id));
      const agentIds = agents.map(a => a.id);
      if (agentId && agentIds.includes(agentId)) {
        logWhere.userId = agentId;
      } else {
        logWhere.userId = { in: agentIds };
      }
    } else if (req.user.role === 'admin') {
      const adminUserId = req.user._id || req.user.id;
      const agents = allUsers.filter(u => u.role === 'agent' && u.adminId === adminUserId);
      const agentIds = agents.map(a => a.id);
      if (agentId && agentIds.includes(agentId)) {
        logWhere.userId = agentId;
      } else {
        logWhere.userId = { in: agentIds };
      }
    } else if (req.user.role === 'superadmin') {
      if (agentId) {
        logWhere.userId = agentId;
      } else if (effectiveAdminId) {
        const agents = allUsers.filter(u => u.role === 'agent' && u.adminId === effectiveAdminId);
        logWhere.userId = { in: agents.map(a => a.id) };
      }
    }

    const totalCount = await prisma.agentWorkLog.count({ where: logWhere });
    const takeAmount = isPreview ? 15 : (requestedLimit ? parseInt(requestedLimit) : 50000);

    const logs = await prisma.agentWorkLog.findMany({
      where: logWhere,
      include: {
        user: {
          select: {
            name: true,
            username: true,
            tlId: true,
            adminId: true
          }
        }
      },
      orderBy: { loginAt: 'desc' },
      take: takeAmount
    });

    const rows = logs.map((log, index) => {
      const totalBreakSeconds = (log.lunchDuration || 0) + (log.bioDuration || 0) + (log.teaDuration || 0);
      const totalSessionTime = log.logoutAt
        ? Math.max(0, Math.floor((new Date(log.logoutAt) - new Date(log.loginAt)) / 1000))
        : Math.max(0, Math.floor((new Date(log.lastActiveAt) - new Date(log.loginAt)) / 1000));
      const computedWorkTime = Math.max(0, totalSessionTime - totalBreakSeconds);
      const actualWorkTime = log.logoutAt ? (log.totalWorkTime || computedWorkTime) : computedWorkTime;
      const compName = log.user.adminId ? (adminMap[log.user.adminId] || 'Company') : 'Company';
      const tlName = log.user.tlId ? (userMap[log.user.tlId] || 'Unassigned') : 'None';

      return {
        'S.No.': index + 1,
        'Company Name': compName,
        'Agent Name': log.user.name || 'Unknown',
        'Username / Email': log.user.username || 'N/A',
        'Team Lead': tlName,
        'Login Time': formatDateTime(log.loginAt),
        'Logout Time': log.logoutAt ? formatDateTime(log.logoutAt) : 'Active Session',
        'Last Active At': formatDateTime(log.lastActiveAt),
        'Session Duration': formatSeconds(totalSessionTime),
        'Work Time (HH:MM:SS)': formatSeconds(actualWorkTime),
        'Lunch Break (HH:MM:SS)': formatSeconds(log.lunchDuration),
        'Bio Break (HH:MM:SS)': formatSeconds(log.bioDuration),
        'Tea Break (HH:MM:SS)': formatSeconds(log.teaDuration),
        'Total Break Duration (HH:MM:SS)': formatSeconds(totalBreakSeconds)
      };
    });

    return {
      totalCount,
      rows,
      metrics: {
        totalSessions: totalCount,
        reportType: 'agent-log'
      },
      companyName: effectiveAdminId ? (adminMap[effectiveAdminId] || 'Company') : 'All Companies'
    };
  }

  // 4. Build Contact-based Where Clause
  let where = { isDeleted: false };

  // Role scoping
  if (req.user.role === 'agent') {
    where.assignedTo = req.user._id || req.user.id;
  } else if (req.user.role === 'tl') {
    const agents = allUsers.filter(u => u.role === 'agent' && u.tlId === (req.user._id || req.user.id));
    const agentIds = agents.map(a => a.id);
    if (agentId && agentIds.includes(agentId)) {
      where.assignedTo = agentId;
    } else {
      where.assignedTo = { in: agentIds };
    }
  } else if (req.user.role === 'admin') {
    where.adminId = req.user._id || req.user.id;
    if (agentId) where.assignedTo = agentId;
  } else if (req.user.role === 'superadmin') {
    if (effectiveAdminId) where.adminId = effectiveAdminId;
    if (agentId) where.assignedTo = agentId;
  }

  if (batchId) where.batchId = batchId;

  // Date parsing
  const hasDateRange = Boolean(fromDate || toDate);
  const start = fromDate ? new Date(fromDate) : null;
  const end = toDate ? new Date(new Date(toDate).setHours(23, 59, 59, 999)) : null;

  // Report Type specifics
  const isConvertedReport = ['converted', 'converted-leads'].includes(reportType);
  const isAllLeadsReport = ['all-leads', 'lead', 'leads'].includes(reportType);
  const isAppointmentsReport = ['appointments', 'appointment'].includes(reportType);
  const isCallbacksReport = ['callbacks', 'callback'].includes(reportType);
  const isAllContactsReport = ['all-contacts', 'contacts', 'contact'].includes(reportType);

  if (isConvertedReport) {
    where.disposition = 'Lead';
    where.status = 'Converted';

    if (hasDateRange) {
      const dateConditions = [];
      if (start && end) {
        dateConditions.push(
          { conversionDate: { gte: start, lte: end } },
          { conversionDate: null, disposedAt: { gte: start, lte: end } },
          { conversionDate: null, createdAt: { gte: start, lte: end } }
        );
      } else if (start) {
        dateConditions.push(
          { conversionDate: { gte: start } },
          { conversionDate: null, disposedAt: { gte: start } },
          { conversionDate: null, createdAt: { gte: start } }
        );
      } else if (end) {
        dateConditions.push(
          { conversionDate: { lte: end } },
          { conversionDate: null, disposedAt: { lte: end } },
          { conversionDate: null, createdAt: { lte: end } }
        );
      }
      where.OR = dateConditions;
    }
  } else if (isAllLeadsReport) {
    where.disposition = 'Lead';
    if (status && status !== 'all') {
      where.status = status;
    }
    if (hasDateRange) {
      if (start && end) {
        where.OR = [
          { disposedAt: { gte: start, lte: end } },
          { disposedAt: null, createdAt: { gte: start, lte: end } }
        ];
      } else if (start) {
        where.OR = [
          { disposedAt: { gte: start } },
          { disposedAt: null, createdAt: { gte: start } }
        ];
      } else if (end) {
        where.OR = [
          { disposedAt: { lte: end } },
          { disposedAt: null, createdAt: { lte: end } }
        ];
      }
    }
  } else if (isAppointmentsReport) {
    where.disposition = 'Appointment';
    if (hasDateRange) {
      if (start && end) {
        where.OR = [
          { appointmentDt: { gte: start, lte: end } },
          { appointmentDt: null, disposedAt: { gte: start, lte: end } },
          { appointmentDt: null, createdAt: { gte: start, lte: end } }
        ];
      } else if (start) {
        where.OR = [
          { appointmentDt: { gte: start } },
          { appointmentDt: null, disposedAt: { gte: start } }
        ];
      } else if (end) {
        where.OR = [
          { appointmentDt: { lte: end } },
          { appointmentDt: null, disposedAt: { lte: end } }
        ];
      }
    }
  } else if (isCallbacksReport) {
    where.disposition = 'CallBack';
    if (hasDateRange) {
      if (start && end) {
        where.OR = [
          { callBackDt: { gte: start, lte: end } },
          { callBackDt: null, disposedAt: { gte: start, lte: end } },
          { callBackDt: null, createdAt: { gte: start, lte: end } }
        ];
      } else if (start) {
        where.OR = [
          { callBackDt: { gte: start } },
          { callBackDt: null, disposedAt: { gte: start } }
        ];
      } else if (end) {
        where.OR = [
          { callBackDt: { lte: end } },
          { callBackDt: null, disposedAt: { lte: end } }
        ];
      }
    }
  } else if (isAllContactsReport) {
    if (disposition === 'pending') where.disposition = null;
    else if (disposition && disposition !== 'all') where.disposition = disposition;

    if (hasDateRange) {
      if (start && end) {
        where.OR = [
          { disposedAt: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } }
        ];
      } else if (start) {
        where.OR = [
          { disposedAt: { gte: start } },
          { createdAt: { gte: start } }
        ];
      } else if (end) {
        where.OR = [
          { disposedAt: { lte: end } },
          { createdAt: { lte: end } }
        ];
      }
    }
  } else {
    // Workflow / General
    if (disposition === 'pending') where.disposition = null;
    else if (disposition && disposition !== 'all') where.disposition = disposition;

    if (hasDateRange) {
      if (start && end) {
        where.OR = [
          { disposedAt: { gte: start, lte: end } },
          { disposition: null, createdAt: { gte: start, lte: end } },
          { disposition: '', createdAt: { gte: start, lte: end } }
        ];
      } else if (start) {
        where.OR = [
          { disposedAt: { gte: start } },
          { disposition: null, createdAt: { gte: start } },
          { disposition: '', createdAt: { gte: start } }
        ];
      } else if (end) {
        where.OR = [
          { disposedAt: { lte: end } },
          { disposition: null, createdAt: { lte: end } },
          { disposition: '', createdAt: { lte: end } }
        ];
      }
    }
  }

  // 5. Query Count & Records
  const totalCount = await prisma.contact.count({ where });

  const takeAmount = isPreview ? 15 : (requestedLimit ? parseInt(requestedLimit) : 50000);

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [
      { lastModified: 'desc' },
      { createdAt: 'desc' }
    ],
    take: takeAmount
  });

  // Extract all unique dynamic field names across the dataset (excluding standard ones)
  const standardFieldKeys = new Set(['name', 'Name', 'Full Name', 'phone', 'Phone', 'Mobile', 'email', 'Email', 'address', 'Address', 'area', 'Area', 'pincode', 'Pincode']);
  const dynamicFieldCols = [...new Set(contacts.flatMap(c => {
    const f = c.fields || {};
    return Object.keys(f).filter(k => !standardFieldKeys.has(k));
  }))];

  // Calculate metrics
  let totalAmount = 0;
  let convertedCount = 0;
  let leadsCount = 0;
  let apptsCount = 0;
  let callbacksCount = 0;

  contacts.forEach(c => {
    const effAmt = (c.isCharityConfirmed && c.charityAmount !== null && c.charityAmount !== undefined)
      ? c.charityAmount
      : (c.leadAmount || 0);
    totalAmount += effAmt;
    if (c.disposition === 'Lead') leadsCount++;
    if (c.status === 'Converted') convertedCount++;
    if (c.disposition === 'Appointment') apptsCount++;
    if (c.disposition === 'CallBack') callbacksCount++;
  });

  // 6. Format Rows based on Report Type
  const rows = contacts.map((c, index) => {
    const companyName = c.adminId ? (adminMap[c.adminId] || 'Company') : 'Company';
    const agentName = c.assignedTo ? (userMap[c.assignedTo] || c.agentName || 'Unassigned') : (c.agentName || 'Unassigned');
    const tlId = c.assignedTo ? userTlMap[c.assignedTo] : null;
    const tlName = tlId ? (userMap[tlId] || 'Unassigned') : 'Unassigned';

    const f = c.fields || {};
    const name = f.Name || f.name || f['Full Name'] || '';
    const phone = f.Phone || f.phone || f.Mobile || f.mobile || '';
    const email = f.Email || f.email || '';
    const address = f.Address || f.address || '';
    const area = f.Area || f.area || '';
    const pincode = f.Pincode || f.pincode || '';

    const effectiveAmount = (c.isCharityConfirmed && c.charityAmount !== null && c.charityAmount !== undefined)
      ? c.charityAmount
      : (c.leadAmount || '');

    // Format 1: CONVERTED LEADS
    if (isConvertedReport) {
      const leadDate = c.createdAt ? new Date(c.createdAt) : new Date();
      const yy = String(leadDate.getFullYear()).slice(-2);
      const mm = String(leadDate.getMonth() + 1).padStart(2, '0');
      const seq = String(index + 1).padStart(3, '0');
      const slNo = `SS${yy}${mm}-${seq}`;

      let txId = c.transactionId || '';
      if (!txId && c.remarks && c.remarks.includes('Transaction ID:')) {
        const match = c.remarks.match(/Transaction ID:\s*([^\s)]+)/);
        if (match) txId = match[1];
      }

      const txDate = c.conversionDate
        ? formatDateOnly(c.conversionDate)
        : (c.lastModified ? formatDateOnly(c.lastModified) : '');

      const row = {
        'Sl No': slNo,
        'Company Name': companyName,
        'Donor Title (Mr/Ms/Mrs/Firm)': 'Mr.',
        'Full Name As per PAN Card(Mandatory)': name,
        'Address (Mandatory)': address,
        'Area': area,
        'Pincode': pincode,
        'Mobile No (Mandatory)': phone,
        'Email ID ( Mandatory)': email,
        'Amount': effectiveAmount,
        'Agent Amount': c.leadAmount || '',
        'Charity Amount': c.charityAmount || '',
        'UTR-Internal': c.transactionId || '',
        'UTR-Charity': c.utrCharity || '',
        'Confirmed by Charity': c.isCharityConfirmed ? 'Yes' : 'No',
        'Charity Confirmed At': formatDateTime(c.charityConfirmedAt),
        'Charity Confirmed By': c.charityConfirmedBy || '',
        'Transaction No / Cheque No': c.transactionId || '',
        'Updated Transaction No': c.utrCharity || txId,
        'Transaction / Cheque Date': txDate,
        'Bank Name': '',
        'Mode Of Payment': 'Online',
        'Conversion Date': formatDateTime(c.conversionDate),
        'Agent Name': agentName,
        'Team Lead': tlName,
        'Status': c.status || 'Confirmed',
        'Agent Remarks': c.remarks || ''
      };

      // Append custom fields
      dynamicFieldCols.forEach(col => { row[col] = f[col] || ''; });
      return row;
    }

    // Format 2: TOTAL LEADS REPORT
    if (isAllLeadsReport) {
      const row = {
        'S.No.': index + 1,
        'Company Name': companyName,
        'Customer Name': name,
        'Phone / Mobile': phone,
        'Email': email,
        'Lead Amount': effectiveAmount,
        'Agent Amount': c.leadAmount || '',
        'Charity Amount': c.charityAmount || '',
        'Lead Status': c.status || 'Open',
        'Transaction ID': c.transactionId || '',
        'UTR Charity': c.utrCharity || '',
        'Confirmed by Charity': c.isCharityConfirmed ? 'Yes' : 'No',
        'Assigned Agent': agentName,
        'Team Lead': tlName,
        'Disposed Date': formatDateTime(c.disposedAt),
        'Conversion Date': formatDateTime(c.conversionDate),
        'Created Date': formatDateTime(c.createdAt),
        'Address': address,
        'Area / City': area,
        'Pincode': pincode,
        'Agent Remarks': c.remarks || ''
      };
      dynamicFieldCols.forEach(col => { row[col] = f[col] || ''; });
      return row;
    }

    // Format 3: APPOINTMENTS REPORT
    if (isAppointmentsReport) {
      const row = {
        'S.No.': index + 1,
        'Company Name': companyName,
        'Customer Name': name,
        'Phone / Mobile': phone,
        'Email': email,
        'Appointment Date & Time': formatDateTime(c.appointmentDt),
        'Appointment Status': c.appointmentStatus || 'Scheduled',
        'Assigned Agent': agentName,
        'Team Lead': tlName,
        'Remarks': c.remarks || '',
        'Scheduled At': formatDateTime(c.disposedAt || c.createdAt),
        'Address': address,
        'Area': area,
        'Pincode': pincode
      };
      dynamicFieldCols.forEach(col => { row[col] = f[col] || ''; });
      return row;
    }

    // Format 4: CALLBACKS REPORT
    if (isCallbacksReport) {
      const row = {
        'S.No.': index + 1,
        'Company Name': companyName,
        'Customer Name': name,
        'Phone / Mobile': phone,
        'Email': email,
        'Callback Date & Time': formatDateTime(c.callBackDt),
        'Call Attempts': c.callAttempts || 0,
        'Assigned Agent': agentName,
        'Team Lead': tlName,
        'Remarks': c.remarks || '',
        'Scheduled At': formatDateTime(c.disposedAt || c.createdAt),
        'Address': address,
        'Area': area,
        'Pincode': pincode
      };
      dynamicFieldCols.forEach(col => { row[col] = f[col] || ''; });
      return row;
    }

    // Format 5: ALL CONTACTS / WORKFLOW / MASTER REPORT
    const row = {
      'S.No.': index + 1,
      'Company Name': companyName,
      'Customer Name': name,
      'Phone / Mobile': phone,
      'Email': email,
      'Disposition': c.disposition ? (DISP_LABELS[c.disposition] || c.disposition) : 'Pending',
      'Sub Disposition': c.subDisposition || '',
      'Lead Status': c.status || '',
      'Amount': effectiveAmount,
      'Transaction ID': c.transactionId || '',
      'UTR Charity': c.utrCharity || '',
      'Assigned Agent': agentName,
      'Team Lead': tlName,
      'Call Attempts': c.callAttempts || 0,
      'Appointment Date': formatDateTime(c.appointmentDt),
      'Callback Date': formatDateTime(c.callBackDt),
      'Disposed Date': formatDateTime(c.disposedAt),
      'Created Date': formatDateTime(c.createdAt),
      'Address': address,
      'Area': area,
      'Pincode': pincode,
      'Remarks': c.remarks || ''
    };
    dynamicFieldCols.forEach(col => { row[col] = f[col] || ''; });
    return row;
  });

  return {
    totalCount,
    rows,
    metrics: {
      totalCount,
      totalAmount,
      leadsCount,
      convertedCount,
      apptsCount,
      callbacksCount
    },
    companyName: effectiveAdminId ? (adminMap[effectiveAdminId] || 'Company') : 'All Companies'
  };
}

/**
 * GET /api/reports/preview
 * Returns total count, metrics, column headers and first 15 preview rows
 */
router.get('/preview', verify, authorize(['superadmin', 'admin', 'tl', 'agent']), async (req, res) => {
  try {
    const data = await buildReportData(req, { isPreview: true });
    const columns = data.rows.length > 0 ? Object.keys(data.rows[0]) : [];

    res.json({
      success: true,
      totalCount: data.totalCount,
      companyName: data.companyName,
      metrics: data.metrics,
      columns,
      sampleRows: data.rows
    });
  } catch (err) {
    console.error('Report preview error:', err);
    res.status(500).json({ error: 'Failed to generate report preview' });
  }
});

/**
 * GET /api/reports/download
 * Downloads the complete report as Excel (.xlsx) or CSV
 */
router.get('/download', verify, authorize(['superadmin', 'admin', 'tl', 'agent']), async (req, res) => {
  try {
    const { format = 'csv', reportType = 'all-leads', fromDate, toDate } = req.query;
    const data = await buildReportData(req, { isPreview: false });
    const rows = data.rows;

    const companyPart = sanitizeFilename(data.companyName || 'all_companies');
    const reportPart = sanitizeFilename(reportType);
    const datePart = fromDate && toDate ? `${fromDate}_to_${toDate}` : new Date().toISOString().split('T')[0];
    const filename = `${companyPart}_${reportPart}_${datePart}`;

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Message': 'No matching records found' }]);

      // Format column widths
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        ws['!cols'] = headers.map(h => {
          const sampleLengths = rows.slice(0, 50).map(r => String(r[h] ?? '').length);
          const maxLen = Math.max(h.length, ...sampleLengths);
          return { wch: Math.min(45, Math.max(12, maxLen + 3)) };
        });
      }

      const wb = XLSX.utils.book_new();
      const sheetTitle = reportType.replace(/-/g, ' ').toUpperCase().slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetTitle);

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(buffer);
    }

    // CSV format
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const escapeCsv = v => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvContent = rows.length > 0
      ? [
          headers.map(escapeCsv).join(','),
          ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(','))
        ].join('\r\n')
      : 'No matching records found';

    // Prepend UTF-8 BOM (\uFEFF) so Excel opens UTF-8 characters properly
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error('Report download error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

module.exports = router;