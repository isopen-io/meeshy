# PWA Notifications Implementation Guide

Complete guide for implementing push notifications and PWA badges in Meeshy.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [Firebase Configuration](#firebase-configuration)
- [Usage Examples](#usage-examples)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Browser Compatibility](#browser-compatibility)

---

## Overview

This implementation provides a comprehensive push notification system with:

- **PWA Badging API**: Native badge on app icon (supported browsers)
- **Firebase Cloud Messaging (FCM)**: Cross-platform push notifications
- **iOS Support**: Graceful handling of iOS limitations
- **Service Workers**: Background notification handling
- **Permission Management**: User-friendly permission prompts

---

## Features

### 1. PWA Badge Management

- ✅ Real-time badge updates synchronized with notification count
- ✅ Support for Chrome, Edge, Samsung Internet
- ✅ Graceful fallback for unsupported browsers
- ✅ Auto-sync with notification store

### 2. Push Notifications

- ✅ Firebase Cloud Messaging integration
- ✅ Background and foreground message handling
- ✅ Click actions to navigate to conversations
- ✅ Rich notifications with images and actions
- ✅ Token management and refresh

### 3. iOS Support

- ✅ iOS 16.4+ push notification support
- ✅ Installation guide for "Add to Home Screen"
- ✅ Automatic fallback to in-app notifications for older iOS
- ✅ Safari-specific instructions

### 4. User Experience

- ✅ Non-intrusive permission prompts
- ✅ Settings page for notification preferences
- ✅ Test notification functionality
- ✅ Clear status indicators

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Notification  │  │  PWA Badge   │  │  FCM Manager    │ │
│  │  Store V2      │──│  Manager     │  │                 │ │
│  │  (Zustand)     │  │              │  │  - Token Mgmt   │ │
│  └────────────────┘  └──────────────┘  │  - Permissions  │ │
│         │                    │          │  - Messages     │ │
│         │                    │          └─────────────────┘ │
│         │                    │                    │          │
│         └────────────────────┼────────────────────┘          │
│                              │                               │
│  ┌──────────────────────────▼──────────────────────────┐   │
│  │          Service Worker Manager                      │   │
│  │  - SW Registration                                   │   │
│  │  - Update Management                                 │   │
│  │  - Message Passing                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
        ┌──────────────────────▼──────────────────────┐
        │         Service Workers                     │
        ├─────────────────────────────────────────────┤
        │                                             │
        │  ┌──────────────┐   ┌──────────────────┐  │
        │  │   sw.js      │   │  firebase-       │  │
        │  │              │   │  messaging-sw.js │  │
        │  │ - Push       │   │                  │  │
        │  │ - Badge      │   │ - FCM Messages   │  │
        │  │ - Click      │   │ - Background     │  │
        │  │ - Cache      │   │                  │  │
        │  └──────────────┘   └──────────────────┘  │
        │                                             │
        └─────────────────────────────────────────────┘
                               │
        ┌──────────────────────▼──────────────────────┐
        │       Firebase Cloud Messaging              │
        └─────────────────────────────────────────────┘
                               │
        ┌──────────────────────▼──────────────────────┐
        │       Meeshy Backend (Gateway)              │
        │  - POST /api/users/push-token               │
        │  - DELETE /api/users/push-token             │
        │  - Send FCM messages on new notifications   │
        └─────────────────────────────────────────────┘
```

---

## Setup Instructions

### 1. Install Dependencies

The required dependencies are already in `package.json`:

```json
{
  "firebase": "^10.7.1",
  "firebase/app": "^10.7.1",
  "firebase/messaging": "^10.7.1"
}
```

If not installed:

```bash
cd frontend
pnpm install firebase
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in Firebase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key

# Feature Flags
NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_PWA_BADGES=true
NEXT_PUBLIC_DEBUG_NOTIFICATIONS=false
```

### 3. Initialize in Your Application

Add to your main layout (`app/layout.tsx` or `_app.tsx`):

```tsx
'use client';

import { useEffect } from 'react';
import { usePWABadgeSync } from '@/hooks/use-pwa-badge';
import { swRegistration } from '@/utils/service-worker-registration';
import { fcm } from '@/utils/fcm-manager';

export default function RootLayout({ children }) {
  // Auto-sync PWA badge with notification count
  usePWABadgeSync();

  useEffect(() => {
    // Register Service Worker
    const initializeServiceWorker = async () => {
      const registered = await swRegistration.register('/sw.js');

      if (registered) {
        console.log('Service Worker registered successfully');
      }
    };

    // Initialize FCM
    const initializeFCM = async () => {
      const initialized = await fcm.initialize();

      if (initialized && fcm.hasPermission()) {
        // Get or refresh token
        const token = await fcm.getToken();

        if (token) {
          // Send to backend
          await pushTokenService.sync(token);
        }
      }
    };

    initializeServiceWorker();
    initializeFCM();
  }, []);

  return (
    <html>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 4. Add Permission Prompt

Use the `NotificationPermissionPrompt` component strategically:

```tsx
import { NotificationPermissionPrompt } from '@/components/notifications-v2/NotificationPermissionPrompt';

function MyComponent() {
  const [showPrompt, setShowPrompt] = useState(false);

  // Show prompt after user engagement (e.g., after 3 minutes)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fcm.shouldPrompt()) {
        setShowPrompt(true);
      }
    }, 3 * 60 * 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Your content */}

      <NotificationPermissionPrompt
        open={showPrompt}
        onClose={() => setShowPrompt(false)}
        onPermissionGranted={async () => {
          const token = await fcm.getToken();
          await pushTokenService.register(token);
        }}
      />
    </>
  );
}
```

### 5. Add iOS Install Prompt

For iOS users, show installation guide:

```tsx
import { IOSInstallBanner } from '@/components/notifications-v2/IOSInstallPrompt';

function Layout({ children }) {
  return (
    <>
      <IOSInstallBanner />
      {children}
    </>
  );
}
```

---

## Firebase Configuration

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter project name (e.g., "Meeshy Notifications")
4. Follow the setup wizard

### Step 2: Add Web App

1. In project overview, click Web icon (</>) to add web app
2. Enter app nickname (e.g., "Meeshy Web")
3. Check "Also set up Firebase Hosting" (optional)
4. Copy the configuration object

### Step 3: Enable Cloud Messaging

1. In Firebase Console, go to "Project Settings" > "Cloud Messaging"
2. Under "Web configuration", find your Web Push certificates
3. If none exist, click "Generate key pair"
4. Copy the VAPID key (starts with "B...")

### Step 4: Configure Service Account (Backend)

For the backend to send push notifications:

1. Go to "Project Settings" > "Service Accounts"
2. Click "Generate New Private Key"
3. Save the JSON file securely
4. Add to your backend environment:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
```

---

## Usage Examples

### Example 1: Manual Permission Request

```tsx
import { fcm } from '@/utils/fcm-manager';
import { pushTokenService } from '@/services/push-token.service';

async function requestNotificationPermission() {
  const permission = await fcm.requestPermission();

  if (permission === 'granted') {
    const token = await fcm.getToken();
    await pushTokenService.register(token);
    console.log('Notifications enabled!');
  } else {
    console.log('Permission denied');
  }
}
```

### Example 2: Update Badge Manually

```tsx
import { pwaBadge } from '@/utils/pwa-badge';

// Set badge count
await pwaBadge.setCount(5);

// Clear badge
await pwaBadge.clear();

// Increment
await pwaBadge.increment(1);
```

### Example 3: Check iOS Capabilities

```tsx
import { iosNotifications } from '@/utils/ios-notification-manager';

const capabilities = iosNotifications.getCapabilities();

if (capabilities.needsHomeScreenInstall) {
  console.log('Show iOS install guide');
} else if (capabilities.canReceivePushNotifications) {
  console.log('Can enable push notifications');
} else {
  console.log('Use in-app notifications only');
}
```

### Example 4: Settings Page

```tsx
import { NotificationSettings } from '@/components/notifications-v2/NotificationSettings';

export default function SettingsPage() {
  return (
    <div className="container">
      <h1>Notification Settings</h1>
      <NotificationSettings />
    </div>
  );
}
```

---

## Testing

### Local Testing (Development)

1. **Start Development Server**:
   ```bash
   cd frontend
   pnpm dev
   ```

2. **Open in Browser**:
   - Chrome/Edge: `http://localhost:3100`
   - For HTTPS (required for notifications in some browsers):
     ```bash
     pnpm dev:https
     ```

3. **Test PWA Badge**:
   - Open DevTools > Console
   - Run: `pwaBadge.setCount(5)`
   - Check app icon in taskbar/dock for badge

4. **Test Notifications**:
   - Navigate to Settings > Notifications
   - Click "Allow Notifications"
   - Click "Send Test Notification"

### Testing on Mobile

#### Android

1. Deploy to staging/production (HTTPS required)
2. Open in Chrome mobile
3. Add to Home Screen
4. Test notifications

#### iOS (16.4+)

1. Open in Safari
2. Tap Share → "Add to Home Screen"
3. Open installed PWA
4. Test notifications

**Note**: iOS notifications only work in standalone mode (PWA installed).

### Testing Service Worker

```bash
# Open DevTools > Application > Service Workers
# Check registration status
# Test "Update on reload"
# Test "Skip waiting"
```

---

## Troubleshooting

### Issue: Service Worker Not Registering

**Solution**:
- Ensure HTTPS (or localhost)
- Check console for errors
- Verify `/sw.js` is accessible
- Clear browser cache and re-register

### Issue: Badge Not Showing

**Possible Causes**:
- Browser doesn't support Badging API (check `pwaBadge.isSupported()`)
- PWA not installed
- Badge count is 0

**Solution**:
```tsx
if (pwaBadge.isSupported()) {
  await pwaBadge.setCount(5);
} else {
  console.log('Badging not supported on this browser');
}
```

### Issue: Push Notifications Not Working

**Checklist**:
- [ ] Firebase configured correctly
- [ ] VAPID key added to `.env`
- [ ] Permission granted
- [ ] Token registered on backend
- [ ] Service Worker active
- [ ] HTTPS enabled (not localhost)

**Debug Steps**:
```tsx
// 1. Check support
const supported = await fcm.isSupported();
console.log('FCM supported:', supported);

// 2. Check permission
const permission = fcm.getPermissionStatus();
console.log('Permission:', permission);

// 3. Check token
const token = fcm.getCurrentToken();
console.log('Token:', token);

// 4. Check SW registration
const registration = swRegistration.getRegistration();
console.log('SW registered:', !!registration);
```

### Issue: iOS Not Receiving Notifications

**Common Issues**:
- iOS version < 16.4 (not supported)
- PWA not installed ("Add to Home Screen")
- In Safari browser (must be standalone PWA)

**Solution**:
```tsx
const capabilities = iosNotifications.getCapabilities();
console.log('iOS capabilities:', capabilities);

if (capabilities.needsHomeScreenInstall) {
  // Show installation guide
}
```

### Issue: Token Not Syncing with Backend

**Check**:
1. Backend endpoint exists: `POST /api/users/push-token`
2. Authentication cookie sent (`withCredentials: true`)
3. CORS configured correctly
4. Network tab for errors

**Manual Test**:
```bash
curl -X POST http://localhost:3000/api/users/push-token \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{"token": "test-token", "deviceInfo": {}}'
```

---

## Browser Compatibility

### PWA Badges

| Browser          | Badging API | Notes                          |
|------------------|-------------|--------------------------------|
| Chrome Desktop   | ✅          | Full support                   |
| Chrome Android   | ✅          | Full support                   |
| Edge Desktop     | ✅          | Full support                   |
| Samsung Internet | ✅          | Full support                   |
| Safari macOS     | ✅          | iOS 16.4+, limited             |
| Safari iOS       | ❌          | Not supported                  |
| Firefox          | ❌          | Not supported                  |

### Push Notifications

| Platform              | Push Notifications | Notes                                    |
|-----------------------|-------------------|------------------------------------------|
| Chrome Desktop        | ✅                | Full support                             |
| Chrome Android        | ✅                | Full support                             |
| Edge Desktop          | ✅                | Full support                             |
| Firefox Desktop       | ✅                | Full support                             |
| Safari macOS 16+      | ✅                | Full support                             |
| Safari iOS 16.4+      | ✅                | Only in standalone PWA                   |
| Safari iOS < 16.4     | ❌                | Not supported, use in-app notifications  |
| Samsung Internet      | ✅                | Full support                             |

### Recommendations

1. **Always provide fallback**: Use in-app notifications for unsupported browsers
2. **Detect capabilities**: Use `fcm.isSupported()` and `iosNotifications.getCapabilities()`
3. **Progressive enhancement**: Core functionality should work without push notifications
4. **Clear communication**: Tell users why notifications might not be available on their device

---

## Next Steps

1. **Backend Implementation**: See [BACKEND_PUSH_NOTIFICATIONS_REQUIREMENTS.md](./BACKEND_PUSH_NOTIFICATIONS_REQUIREMENTS.md)
2. **iOS Limitations**: See [IOS_NOTIFICATIONS_LIMITATIONS.md](./IOS_NOTIFICATIONS_LIMITATIONS.md)
3. **Compatibility Matrix**: See [PWA_NOTIFICATIONS_COMPATIBILITY.md](./PWA_NOTIFICATIONS_COMPATIBILITY.md)

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review browser compatibility
- Check Firebase Console for errors
- Enable debug mode: `NEXT_PUBLIC_DEBUG_NOTIFICATIONS=true`

---

**Last Updated**: 2025-11-21
**Version**: 1.0.0
