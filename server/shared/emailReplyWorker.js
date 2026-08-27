const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { prisma } = require('./db');

async function processAdminInbox(admin) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: admin.smtpGmail.trim(),
      password: admin.smtpPassword.trim(),
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Search for UNSEEN emails received in the last 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        imap.search(['UNSEEN', ['SINCE', threeDaysAgo]], async (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (!results || results.length === 0) {
            imap.end();
            return resolve();
          }

          // Fetch recent converted leads for this admin to match against transactionId
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const activeLeads = await prisma.contact.findMany({
            where: {
              adminId: admin.id,
              disposition: 'Lead',
              status: 'Converted',
              transactionId: { not: null, not: '' },
              createdAt: { gte: thirtyDaysAgo }
            },
            select: { id: true, transactionId: true, remarks: true }
          });

          if (activeLeads.length === 0) {
            imap.end();
            return resolve();
          }

          const f = imap.fetch(results, {
            bodies: '',
            markSeen: false
          });

          let processedCount = 0;
          const totalToProcess = results.length;

          f.on('message', (msg, seqno) => {
            let buffer = '';
            let uid = null;

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                const subject = parsed.subject || '';
                const bodyText = parsed.text || '';
                const bodyHtml = parsed.html || '';
                const from = parsed.from?.text || '';

                const fullContent = `${subject} ${bodyText} ${bodyHtml}`.toLowerCase();

                for (const lead of activeLeads) {
                  if (lead.transactionId && fullContent.includes(lead.transactionId.toLowerCase())) {
                    console.log(`[Email Reply Worker] Matched reply for transaction ${lead.transactionId} on Admin ${admin.smtpGmail}`);
                    
                    const cleanBody = (bodyText || bodyHtml.replace(/<[^>]*>/g, '')).trim().substring(0, 300);
                    const replySnippet = `[Reply from ${from} on ${new Date().toLocaleString()}]: "${cleanBody}..."\n\n`;

                    // 1. Update Contact Remarks
                    const currentContact = await prisma.contact.findUnique({ where: { id: lead.id } });
                    const newContactRemarks = currentContact.remarks 
                      ? `${replySnippet}${currentContact.remarks}` 
                      : replySnippet;

                    await prisma.contact.update({
                      where: { id: lead.id },
                      data: { remarks: newContactRemarks }
                    });

                    // 2. Update Lead Remarks if exist
                    const leadRecord = await prisma.lead.findFirst({ where: { contactId: lead.id } });
                    if (leadRecord) {
                      const newLeadRemarks = leadRecord.remarks 
                        ? `${replySnippet}${leadRecord.remarks}` 
                        : replySnippet;

                      await prisma.lead.update({
                        where: { id: leadRecord.id },
                        data: { remarks: newLeadRemarks }
                      });
                    }

                    // 3. Mark the email as read (SEEN)
                    imap.addFlags(uid, '\\Seen', (flagErr) => {
                      if (flagErr) console.error(`[Email Reply Worker] Failed to mark email ${uid} seen:`, flagErr);
                    });

                    break;
                  }
                }
              } catch (parseErr) {
                console.error('[Email Reply Worker] Error parsing message:', parseErr);
              } finally {
                processedCount++;
                if (processedCount === totalToProcess) {
                  imap.end();
                }
              }
            });
          });

          f.once('error', (err) => {
            console.error('[Email Reply Worker] Fetch error:', err);
            imap.end();
            reject(err);
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error(`[Email Reply Worker] IMAP client error for ${admin.smtpGmail}:`, err.message);
      reject(err);
    });

    imap.once('end', () => {
      resolve();
    });

    imap.connect();
  });
}

async function checkAllAdmins() {
  console.log('[Email Reply Worker] Starting check for new email replies...');
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: 'admin',
        active: true,
        isDeleted: false,
        smtpGmail: { not: null, not: '' },
        smtpPassword: { not: null, not: '' }
      }
    });

    for (const admin of admins) {
      try {
        await processAdminInbox(admin);
      } catch (err) {
        console.error(`[Email Reply Worker] Error processing inbox for ${admin.smtpGmail}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Email Reply Worker] Error fetching admins:', err.message);
  }
}

function startEmailReplyWorker() {
  // Check every 2 minutes
  console.log('[Email Reply Worker] Initialized background replies tracker.');
  setInterval(checkAllAdmins, 120000);
  
  // Run once on startup after 30 seconds to allow server boot up
  setTimeout(checkAllAdmins, 30000);
}

module.exports = { startEmailReplyWorker };
