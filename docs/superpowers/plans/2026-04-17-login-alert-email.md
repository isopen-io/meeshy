# Enriched Login Alert Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty login notification email with a detailed alert showing device, location, previous session, static map, and a signed "revoke all sessions" link.

**Architecture:** Four changes: (1) new `LoginAlertEmailData` interface + `sendLoginAlertEmail()` in EmailService, (2) enriched data pipeline in NotificationService, (3) revoke token generation in login flow, (4) new GET endpoint for session revocation.

**Tech Stack:** TypeScript, Fastify, jsonwebtoken, Prisma (UserSession), OpenStreetMap static maps, existing multi-provider email service (Brevo/SendGrid/Mailgun).

---

### Task 1: Add `LoginAlertEmailData` interface and i18n labels in EmailService

**Files:**
- Modify: `services/gateway/src/services/EmailService.ts`

- [ ] **Step 1: Add the interface after `SecurityAlertEmailData` (after line 80)**

```typescript
export interface LoginAlertEmailData {
  to: string;
  name: string;
  language?: string;
  deviceName: string | null;
  deviceOS: string | null;
  appOrBrowser: string | null;
  location: string | null;
  ip: string | null;
  loginTime: Date;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  previousDeviceName: string | null;
  previousLocation: string | null;
  previousLoginTime: Date | null;
  revokeAllUrl: string;
}
```

- [ ] **Step 2: Add `loginAlert` translations to `EmailTranslations` interface (after `securityAlert` block, around line 206)**

```typescript
  loginAlert: {
    subject: string;
    title: string;
    intro: string;
    deviceLabel: string;
    appLabel: string;
    locationLabel: string;
    ipLabel: string;
    timeLabel: string;
    previousTitle: string;
    revokeTitle: string;
    revokeButton: string;
    revokeExpiry: string;
    mapAlt: string;
  };
```

- [ ] **Step 3: Add FR translations in the `fr` translations object**

Find the `fr` translations object (search for `securityAlert:` inside the `fr:` block) and add after it:

```typescript
    loginAlert: {
      subject: 'Nouvelle connexion detectee - Meeshy',
      title: 'Nouvelle connexion detectee',
      intro: 'Une connexion a ete effectuee sur votre compte.',
      deviceLabel: 'Appareil',
      appLabel: 'Application',
      locationLabel: 'Localisation',
      ipLabel: 'Adresse IP',
      timeLabel: 'Date/heure',
      previousTitle: 'Derniere connexion connue',
      revokeTitle: 'Ce n\'est pas vous ?',
      revokeButton: 'Deconnecter tous mes appareils',
      revokeExpiry: 'Ce lien expire dans 24 heures.',
      mapAlt: 'Carte',
    },
```

- [ ] **Step 4: Add EN translations in the `en` translations object**

Find the `en` translations object (search for `securityAlert:` inside the `en:` block) and add after it:

```typescript
    loginAlert: {
      subject: 'New login detected - Meeshy',
      title: 'New login detected',
      intro: 'A login was made to your account.',
      deviceLabel: 'Device',
      appLabel: 'Application',
      locationLabel: 'Location',
      ipLabel: 'IP address',
      timeLabel: 'Date/time',
      previousTitle: 'Previous login',
      revokeTitle: 'Not you?',
      revokeButton: 'Disconnect all my devices',
      revokeExpiry: 'This link expires in 24 hours.',
      mapAlt: 'Map',
    },
```

- [ ] **Step 5: Add the same `loginAlert` block to all other language objects (es, pt, it, de)**

Copy the EN block into each language. These can be refined later — having the keys present prevents runtime errors.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/EmailService.ts
git commit -m "feat(gateway): add LoginAlertEmailData interface and i18n labels"
```

---

### Task 2: Implement `sendLoginAlertEmail()` in EmailService

**Files:**
- Modify: `services/gateway/src/services/EmailService.ts`

- [ ] **Step 1: Add the method after `sendSecurityAlertEmail()` (after line 904)**

```typescript
  async sendLoginAlertEmail(data: LoginAlertEmailData): Promise<EmailResult> {
    const t = this.getTranslations(data.language);
    const locale = this.getLocale(data.language);
    const la = t.loginAlert;

    const timeFormatted = data.loginTime.toLocaleString(locale, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: data.timezone || 'UTC',
    });
    const tzLabel = data.timezone || 'UTC';

    const prevTimeFormatted = data.previousLoginTime
      ? data.previousLoginTime.toLocaleString(locale, {
          year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: data.timezone || 'UTC',
        })
      : null;

    const mapUrl = data.latitude != null && data.longitude != null
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${data.latitude},${data.longitude}&zoom=10&size=300x150&markers=${data.latitude},${data.longitude},red-pushpin`
      : null;

    const detailRow = (icon: string, label: string, value: string | null) =>
      value ? `<tr><td style="padding:6px 12px;color:#6b7280;white-space:nowrap;vertical-align:top">${icon} ${label}</td><td style="padding:6px 12px;font-weight:600">${value}</td></tr>` : '';

    const detailsHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0">${detailRow('&#128241;', la.deviceLabel, [data.deviceName, data.deviceOS].filter(Boolean).join(' &middot; '))}${detailRow('&#127760;', la.appLabel, data.appOrBrowser)}${detailRow('&#128205;', la.locationLabel, data.location)}${detailRow('&#127758;', la.ipLabel, data.ip)}${detailRow('&#128336;', la.timeLabel, `${timeFormatted} (${tzLabel})`)}</table>`;

    const mapHtml = mapUrl
      ? `<div style="margin:16px 0;text-align:center"><img src="${mapUrl}" alt="${la.mapAlt} — ${data.location || ''}" style="border-radius:8px;max-width:100%;height:auto" width="300" height="150"></div>`
      : '';

    const previousHtml = prevTimeFormatted
      ? `<div style="border-top:1px dashed #d1d5db;margin:20px 0;padding-top:16px"><p style="font-size:13px;color:#6b7280;margin:0 0 8px;font-weight:600">${la.previousTitle}</p><table style="width:100%;border-collapse:collapse">${detailRow('&#128241;', la.deviceLabel, data.previousDeviceName)}${detailRow('&#128205;', la.locationLabel, data.previousLocation)}${detailRow('&#128336;', la.timeLabel, prevTimeFormatted)}</table></div>`
      : '';

    const revokeHtml = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:24px 0;text-align:center"><p style="font-weight:600;color:#991b1b;margin:0 0 12px">&#9888;&#65039; ${la.revokeTitle}</p><a href="${data.revokeAllUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px">${la.revokeButton}</a><p style="font-size:12px;color:#6b7280;margin:12px 0 0">${la.revokeExpiry}</p></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${this.getBaseStyles()}</style></head><body><div class="container"><div class="header" style="background:linear-gradient(135deg,#6366F1 0%,#4338CA 100%)"><h1>&#128274; ${la.title}</h1></div><div class="content"><p>${t.common.greeting} <strong>${data.name}</strong>,</p><p>${la.intro}</p>${detailsHtml}${mapHtml}${previousHtml}${revokeHtml}<p>${t.common.footer}</p></div><div class="footer">${this.getFooterContentHtml(data.language)}</div></div></body></html>`;

    const detailText = (label: string, value: string | null) =>
      value ? `  ${label}: ${value}\n` : '';
    const text = [
      `${la.title}\n`,
      `${t.common.greeting} ${data.name},\n`,
      la.intro, '\n',
      detailText(la.deviceLabel, [data.deviceName, data.deviceOS].filter(Boolean).join(' - ')),
      detailText(la.appLabel, data.appOrBrowser),
      detailText(la.locationLabel, data.location),
      detailText(la.ipLabel, data.ip),
      detailText(la.timeLabel, `${timeFormatted} (${tzLabel})`),
      prevTimeFormatted ? `\n--- ${la.previousTitle} ---\n${detailText(la.deviceLabel, data.previousDeviceName)}${detailText(la.locationLabel, data.previousLocation)}${detailText(la.timeLabel, prevTimeFormatted)}` : '',
      `\n${la.revokeTitle}\n${data.revokeAllUrl}\n${la.revokeExpiry}\n`,
      `\n${t.common.footer}\n\n${this.getFooterContentText(data.language)}`,
    ].join('');

    return this.sendEmail({ to: data.to, subject: la.subject, html, text, trackingType: 'login_alert', trackingLang: data.language });
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | grep -c error`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/services/EmailService.ts
git commit -m "feat(gateway): implement sendLoginAlertEmail with device/location/map/revoke"
```

---

### Task 3: Add revoke-all-sessions endpoint

**Files:**
- Create: `services/gateway/src/routes/auth/revoke-all-sessions.ts`
- Modify: `services/gateway/src/routes/auth/index.ts`

- [ ] **Step 1: Create the revoke endpoint file**

Create `services/gateway/src/routes/auth/revoke-all-sessions.ts`:

```typescript
import jwt from 'jsonwebtoken';
import { AuthRouteContext } from './types';
import { invalidateAllSessions } from '../../services/SessionService';

const JWT_SECRET = process.env.JWT_SECRET || 'meeshy-secret-key-dev';

interface RevokeAllPayload {
  userId: string;
  action: 'revoke-all';
}

export function registerRevokeAllSessionsRoute(context: AuthRouteContext) {
  const { fastify } = context;

  fastify.get<{ Querystring: { token: string } }>(
    '/auth/revoke-all-sessions',
    {
      schema: {
        description: 'Revoke all sessions for a user via signed email link',
        tags: ['auth'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { token } = request.query;

      let payload: RevokeAllPayload;
      try {
        payload = jwt.verify(token, JWT_SECRET) as RevokeAllPayload;
      } catch {
        reply.type('text/html').code(400);
        return '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Link expired or invalid</h2><p>This security link has expired. Please log in to manage your sessions.</p></body></html>';
      }

      if (payload.action !== 'revoke-all' || !payload.userId) {
        reply.type('text/html').code(400);
        return '<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invalid link</h2></body></html>';
      }

      const count = await invalidateAllSessions(payload.userId, undefined, 'email_revoke_all');
      reply.type('text/html').code(200);
      return `<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>All sessions disconnected</h2><p>${count} session(s) have been revoked. Please log in again.</p><p><a href="https://meeshy.me" style="color:#6366F1">Go to Meeshy</a></p></body></html>`;
    }
  );
}
```

- [ ] **Step 2: Register the route in `index.ts`**

In `services/gateway/src/routes/auth/index.ts`, add the import at the top (after line 10):

```typescript
import { registerRevokeAllSessionsRoute } from './revoke-all-sessions';
```

Add the registration call at the end of `authRoutes()` (before the closing `}`):

```typescript
  registerRevokeAllSessionsRoute(context);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | grep -c error`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/routes/auth/revoke-all-sessions.ts services/gateway/src/routes/auth/index.ts
git commit -m "feat(gateway): add GET /auth/revoke-all-sessions endpoint with signed JWT"
```

---

### Task 4: Enrich NotificationService to pass full data to email

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`
- Modify: `services/gateway/src/routes/auth/login.ts`

- [ ] **Step 1: Update the `createLoginNewDeviceNotification` params to accept new fields**

In `NotificationService.ts`, replace the params type (lines 1584-1600) with:

```typescript
  async createLoginNewDeviceNotification(params: {
    recipientUserId: string;
    deviceInfo?: {
      type?: string;
      vendor?: string | null;
      model?: string | null;
      os?: string | null;
      osVersion?: string | null;
      browser?: string | null;
      browserVersion?: string | null;
    } | null;
    ipAddress?: string;
    geoData?: {
      country?: string | null;
      countryName?: string | null;
      city?: string | null;
      location?: string | null;
      timezone?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    revokeToken?: string;
  }): Promise<Notification | null> {
```

- [ ] **Step 2: Replace the email sending block inside `createNotification` (lines 400-408)**

Find the block that calls `sendSecurityAlertEmail` inside the high-priority email section. Replace it to detect `login_new_device` and call `sendLoginAlertEmail` instead:

```typescript
              if (params.type === 'login_new_device' && (params as any)._loginAlertData) {
                const alertData = (params as any)._loginAlertData;
                this.emailService.sendLoginAlertEmail({
                  to: user.email,
                  name: user.username || 'User',
                  language: user.systemLanguage || 'fr',
                  ...alertData,
                }).catch(err => {
                  notificationLogger.error('Login alert email failed', { error: err, userId: params.userId });
                });
              } else {
                this.emailService.sendSecurityAlertEmail({
                  to: user.email,
                  name: user.username || 'User',
                  language: user.systemLanguage || 'fr',
                  alertType: params.type,
                  details: params.content.substring(0, 500),
                }).catch(err => {
                  notificationLogger.error('Immediate email failed', { error: err, userId: params.userId });
                });
              }
```

- [ ] **Step 3: Enrich `createLoginNewDeviceNotification` body to fetch previous session and build email data**

Replace the body of `createLoginNewDeviceNotification` (lines 1601-1629) with:

```typescript
    const device = params.deviceInfo;
    const geo = params.geoData;

    const deviceName = [device?.vendor, device?.model].filter(Boolean).join(' ') || null;
    const deviceOS = device?.os
      ? (device.osVersion ? `${device.os} ${device.osVersion}` : device.os)
      : null;
    const appOrBrowser = device?.browser
      ? (device.browserVersion ? `${device.browser} ${device.browserVersion}` : device.browser)
      : null;
    const location = geo?.location || [geo?.city, geo?.countryName].filter(Boolean).join(', ') || null;

    const apiBase = process.env.API_PUBLIC_URL || 'https://gate.meeshy.me';
    const revokeAllUrl = params.revokeToken
      ? `${apiBase}/api/v1/auth/revoke-all-sessions?token=${params.revokeToken}`
      : `${apiBase}`;

    let previousDeviceName: string | null = null;
    let previousLocation: string | null = null;
    let previousLoginTime: Date | null = null;

    try {
      const { getUserSessions } = await import('../SessionService');
      const sessions = await getUserSessions(params.recipientUserId);
      const previous = sessions.find(s => !s.isCurrentSession);
      if (previous) {
        previousDeviceName = [previous.browserName, previous.osName].filter(Boolean).join(' - ');
        previousLocation = previous.location || null;
        previousLoginTime = previous.lastActivityAt ? new Date(previous.lastActivityAt) : null;
      }
    } catch {
      // Non-blocking — previous session is optional
    }

    const loginAlertData = {
      deviceName,
      deviceOS,
      appOrBrowser,
      location,
      ip: params.ipAddress || null,
      loginTime: new Date(),
      timezone: geo?.timezone || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      previousDeviceName,
      previousLocation,
      previousLoginTime,
      revokeAllUrl,
    };

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'login_new_device',
      priority: 'high',
      content: '',
      context: {},
      metadata: {
        action: 'view_details' as const,
        deviceName,
        deviceVendor: device?.vendor || null,
        deviceOS,
        deviceOSVersion: device?.osVersion || null,
        deviceType: device?.type || null,
        ipAddress: params.ipAddress || null,
        country: geo?.country || null,
        countryName: geo?.countryName || null,
        city: geo?.city || null,
        location,
      },
      _loginAlertData: loginAlertData,
    } as any);
```

- [ ] **Step 4: Update login.ts to generate revoke token and pass extra device fields**

In `services/gateway/src/routes/auth/login.ts`, add at the top of the file:

```typescript
import jwt from 'jsonwebtoken';
```

Find the first notification block (around line 119-128). Replace:

```typescript
      if (!session.isTrusted) {
        const notificationService = (fastify as any).notificationService;
        if (notificationService) {
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.deviceInfo,
            ipAddress: requestContext.ip,
            geoData: requestContext.geoData,
          }).catch((err: unknown) => console.error('[AUTH] Notification error (login_new_device):', err));
        }
      }
```

With:

```typescript
      if (!session.isTrusted) {
        const notificationService = (fastify as any).notificationService;
        if (notificationService) {
          const jwtSecret = process.env.JWT_SECRET || 'meeshy-secret-key-dev';
          const revokeToken = jwt.sign(
            { userId: user.id, action: 'revoke-all' },
            jwtSecret,
            { expiresIn: '24h' }
          );
          notificationService.createLoginNewDeviceNotification({
            recipientUserId: user.id,
            deviceInfo: requestContext.deviceInfo,
            ipAddress: requestContext.ip,
            geoData: requestContext.geoData,
            revokeToken,
          }).catch((err: unknown) => console.error('[AUTH] Notification error (login_new_device):', err));
        }
      }
```

- [ ] **Step 5: Apply the same change to the 2FA login block (around line 239-248)**

Replace the same pattern in the 2FA section with identical code (same `revokeToken` generation + `revokeToken` param).

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | grep -c error`
Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/services/notifications/NotificationService.ts services/gateway/src/routes/auth/login.ts
git commit -m "feat(gateway): wire enriched login data + revoke token through notification pipeline"
```

---

### Task 5: Verify with a real login

- [ ] **Step 1: Check `SessionData` type to confirm fields used in Task 4 exist**

Confirmed: `SessionData` has `browserName`, `osName`, `location`, `lastActivityAt`, `isCurrentSession`. The code in Task 4 Step 3 uses these exact field names.

- [ ] **Step 2: Deploy to production or run locally**

If deploying: SSH to `root@meeshy.me`, pull the changes, restart the gateway container.

If local: start gateway via `cd services/gateway && pnpm dev`.

- [ ] **Step 3: Trigger a login and verify email**

```bash
curl -X POST https://gate.meeshy.me/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"atabeth","password":"pD5p1ir9uxLUf2X2FpNE"}'
```

Check the email inbox for the enriched login alert with device info, location, map, previous session, and revoke button.

- [ ] **Step 4: Test the revoke link**

Click the "Disconnect all my devices" button in the email. Verify the HTML response says sessions were disconnected. Verify the user's API token is no longer valid (401 on authenticated requests).

- [ ] **Step 5: Final commit (if any adjustments needed)**

```bash
git add -A && git commit -m "fix(gateway): adjust login alert email after integration testing"
```
