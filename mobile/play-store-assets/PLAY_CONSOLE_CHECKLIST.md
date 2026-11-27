# Google Play Console Copy-Paste Kit (`UniVerseOrder`)

Use this file to copy and paste every required field into Google Play Console (`https://play.google.com/console`).

---

## 1. Nexus Staff (`com.nexuscrm.staff`)

- **App Name:** `Nexus Staff`
- **Default Language:** English (`en-US` or `en-IN`)
- **App / Game:** App
- **Free / Paid:** Free
- **App Icon (512×512 PNG):** `mobile/play-store-assets/nexus-staff-icon-512.png`
- **Feature Graphic (1024×500 PNG):** `mobile/play-store-assets/nexus-staff-feature-1024x500.png`
- **Privacy Policy URL:** `https://crm-eight-sage.vercel.app/privacy.html`
- **Account Deletion URL:** `https://crm-eight-sage.vercel.app/account-deletion.html`

### Short Description (<= 80 chars)
`Mobile calling workflow, lead tracking, appointments & AI receipts for Nexus CRM.`

### Full Description
```text
Nexus Staff is the official companion app for sales agents and team leaders using Nexus CRM.

Built for high-velocity calling teams, Nexus Staff keeps your daily workflow, follow-ups, and lead conversions synchronized in real time with your company's Nexus CRM web workspace.

Key Features:
• Calling Workflow Queue: Call leads directly via your phone dialer, open WhatsApp chats in one tap, inspect Customer 360 history, and log all 9 call dispositions cleanly.
• Break & Work Session Tracking: Start and track work shifts along with Lunch, Bio, and Tea breaks synced live to your team dashboard.
• Appointments & Callbacks: Never miss scheduled customer follow-ups with real-time reminders and overdue task alerts.
• AI Receipt Verification: Capture or upload payment screenshots to verify transactions with automated OCR extraction and email confirmation receipts.
• Team Leader Tools: Manage team imports (CSV/XLSX), review live lead statuses, and export reports directly from mobile.
• Enterprise Security: Argon2id password protection, rotating refresh tokens stored in encrypted device storage, and Cloudflare Turnstile sign-in verification.

Note: Requires an authorized company account on Nexus CRM.
```

---

## 2. Nexus Admin (`com.nexuscrm.admin`)

- **App Name:** `Nexus Admin`
- **Default Language:** English (`en-US` or `en-IN`)
- **App / Game:** App
- **Free / Paid:** Free
- **App Icon (512×512 PNG):** `mobile/play-store-assets/nexus-admin-icon-512.png`
- **Feature Graphic (1024×500 PNG):** `mobile/play-store-assets/nexus-admin-feature-1024x500.png`
- **Privacy Policy URL:** `https://crm-eight-sage.vercel.app/privacy.html`
- **Account Deletion URL:** `https://crm-eight-sage.vercel.app/account-deletion.html`

### Short Description (<= 80 chars)
`Admin command center for Nexus CRM: manage teams, agent logs, leads & reports.`

### Full Description
```text
Nexus Admin is the official management and oversight app for Company Admins and SuperAdmins on Nexus CRM.

Monitor live team activity, manage users and role permissions, audit payment receipts, and export company-wide analytics directly from your Android device.

Key Features:
• Executive & Company Overview: Real-time KPIs across calling workflows, conversions, revenue, and company tenants.
• User & Team Management: Create, edit, and manage Agents, Team Leaders, and Company Admins, configure SMTP mail credentials, and test mail delivery on the go.
• Live Agent Work & Break Logs: Track shift logins, active breaks, idle sessions, and completed hours in real time.
• Lead & Payment Oversight: Search all contacts, verify charity/conversion receipts and UTR references, and inspect Customer 360 records.
• Data Import & Excel Reporting: Upload lead batches (CSV/XLSX) and generate/share detailed Excel reports anywhere.
• Enterprise Security: Role-based tenant isolation, Argon2id hashing, encrypted mobile token storage, and Cloudflare Turnstile protection.

Note: Designed for authorized Nexus CRM Admins and SuperAdmins.
```

---

## 3. Google Play Data Safety & Policy Quick Answers

- **Does your app collect or share any required user data types?** **Yes**
  - **Is all data encrypted in transit?** **Yes** (`HTTPS` / `TLS`)
  - **Do you provide a way for users to request that their data is deleted?** **Yes** (`https://crm-eight-sage.vercel.app/account-deletion.html`)
  - **Personal info:** Name, Email address *(Collected, Required, App functionality & Account management — Not shared with third parties)*
  - **Photos & videos / Files & docs (Optional):** Only when user captures or uploads receipt screenshots or CSV/XLSX imports *(Collected, User-initiated, App functionality)*
  - **App activity / Device or other IDs:** Session security / rate-limiting & push/socket activity *(App functionality, Security & fraud prevention)*
- **Ads:** No, my app does not contain ads.
- **Target audience:** 18 and over.
- **App access:** All or some functionality is restricted → provide a dedicated non-destructive demo reviewer email & password for each app.
