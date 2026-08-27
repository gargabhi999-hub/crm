import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { smtpGmail, smtpPassword, to, subject, html, attachments } = req.body;
  if (!smtpGmail || !smtpPassword || !to) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpGmail.trim(),
        pass: smtpPassword.trim()
      }
    });

    const mailOptions = {
      from: `"Spike CRM" <${smtpGmail.trim()}>`,
      to,
      subject,
      html,
      attachments: attachments || []
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('SMTP Vercel relay error:', error);
    return res.status(500).json({ error: error.message });
  }
}
