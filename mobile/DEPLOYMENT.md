# Nexus CRM Mobile Apps — Android (Play Store) & iOS (App Store) Guide

This directory contains **two dedicated Expo React Native apps** sharing [mobile/shared](file:///e:/CRM%20new/mobile/shared) and backed by the same Express + PostgreSQL + Redis + Cloudflare Turnstile API:

1. **Nexus Staff** (`mobile/nexus-staff`, Android package `com.nexuscrm.staff`, iOS bundle `com.nexuscrm.staff`)
   - For **Agents** & **Team Leaders (TL)**.
   - Includes Dashboard + Break Controller + Break Timer Overlay, Calling Workflow Queue (native `tel:` dialer, WhatsApp deep link, Customer 360, all 9 dispositions, Camera/Gallery Groq Receipt OCR), Lead Tracking, Appointments/Callbacks/Hung-Up, Contact Search, Data Import (TL), Reports & Excel Export/Share (TL), Real-time Socket.io alerts, and Account Security.

2. **Nexus Admin** (`mobile/nexus-admin`, Android package `com.nexuscrm.admin`, iOS bundle `com.nexuscrm.admin`)
   - For **Company Admins** & **Super Admins**.
   - Includes Admin Dashboard & SuperAdmin Command Center (with Global Wipe), User Management (create/edit TLs, Agents, Admins, SMTP settings & Test Connection, TL inactivation disposition), Lead Tracking (with Charity UTR Confirmation), All Contacts, Appointments/Callbacks/Hung-Up, Live Agent Work & Break Logs, Data Import (CSV/XLSX), Reports & Excel Export/Share, Real-time Socket.io updates, and Account Security.

---

## 1. Local Development & Testing (Expo Go / Emulator)

```powershell
# Staff App
cd "E:\CRM new\mobile\nexus-staff"
npm install
npx expo start

# Admin App
cd "E:\CRM new\mobile\nexus-admin"
npm install
npx expo start
```

- When testing on a physical phone against your local PC server (`http://localhost:4000`), tap the **Server** chip on the Login screen and enter your PC's Wi-Fi LAN IP (for example `http://192.168.1.10:4000`).
- In Cloudflare Turnstile **Hostname Management**, add your production backend domain (`nexus-2xsa.onrender.com`) so the native Turnstile WebView bridge (`/api/auth/turnstile-frame`) validates cleanly in production.

---

## 2. Building APK & Google Play Store (`.aab`) / Apple App Store (`.ipa`)

Install EAS CLI once globally and authenticate with your Expo account:

```powershell
npm install -g eas-cli
eas login
```

### Build Nexus Staff (`com.nexuscrm.staff`)
```powershell
cd "E:\CRM new\mobile\nexus-staff"
eas init
# Direct Android APK for device QA:
eas build -p android --profile preview
# Signed Google Play Store AAB:
eas build -p android --profile production
# Signed Apple App Store IPA:
eas build -p ios --profile production
```

### Build Nexus Admin (`com.nexuscrm.admin`)
```powershell
cd "E:\CRM new\mobile\nexus-admin"
eas init
# Direct Android APK for device QA:
eas build -p android --profile preview
# Signed Google Play Store AAB:
eas build -p android --profile production
# Signed Apple App Store IPA:
eas build -p ios --profile production
```

### Submit to Google Play Console & App Store Connect
```powershell
eas submit -p android --latest
eas submit -p ios --latest
```
