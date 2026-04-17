# Enriched Login Alert Email

**Status:** Approved (2026-04-17)
**Scope:** `services/gateway/src/services/EmailService.ts`, `NotificationService.ts`, `routes/auth/`

## Problem

The current "new login detected" email is uninformative:

```
Nouvelle connexion detectee
Une connexion a ete effectuee depuis un nouvel appareil ou navigateur.
L'equipe Meeshy
```

No device info, no location, no IP, no way to act if the login is
unauthorized. The `NotificationService` already collects all relevant
data (device, OS, browser, IP, geolocation) in the notification
`metadata`, but the email template ignores it — the `content` field
passed to the email is an empty string.

## Goals

1. Display full connection details: device, OS, browser/app, location,
   IP, date/time.
2. Show a static map when coordinates are available.
3. Compare with the user's previous session (device + location + time).
4. Provide a "Revoke all sessions" button with a signed 24h link.
5. Support FR/EN based on user's `systemLanguage`.

## Non-goals

- Interactive map (email clients block JS).
- Per-session revocation (revoke-all is simpler and safer for
  compromised accounts).
- Push notification redesign (only the email is addressed here).

## Design

### Email content layout

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Meeshy logo]

Nouvelle connexion detectee

Bonjour {displayName},

Une connexion a ete effectuee sur votre compte.

  Appareil       iPhone 15 Pro - iOS 18.2
  Application    Meeshy iOS 2.1.0
  Localisation   Douala, Cameroon
  Adresse IP     41.202.219.72
  Date/heure     17 avril 2026 a 13:42 (Africa/Douala)

  [static map image 300x150px, centered on lat/lon]

  --- Derniere connexion connue ---
  Appareil       Safari - macOS 15.1
  Localisation   Paris, France
  Date/heure     14 avril 2026 a 09:15

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ce n'est pas vous ?

  [ Deconnecter tous mes appareils ]
       (red button, signed 24h link)

Ce lien expire dans 24 heures.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Email language

Follows the user's `systemLanguage` field. Two label sets: FR (default)
and EN. All static text (headings, field labels, button text, footer)
is translated. Dynamic data (device names, city/country) stays as-is.

### Static map

Provider: OpenStreetMap static map service (free, no API key).

```
https://staticmap.openstreetmap.de/staticmap.php
  ?center={lat},{lon}
  &zoom=10
  &size=300x150
  &markers={lat},{lon},red-pushpin
```

When `latitude`/`longitude` are null (VPN, unknown IP), the map
section is omitted entirely. The textual location (city/country/IP)
is always shown regardless.

The map image is referenced via `<img src="...">`. Email clients that
block remote images will show the alt text "Map — {city}, {country}".
The textual location row above the map ensures the info is always
visible.

### Revocation mechanism

**Token generation** (in `login.ts`, after login succeeds):

```typescript
const revokeToken = jwt.sign(
  { userId: user.id, action: 'revoke-all' },
  JWT_SECRET,
  { expiresIn: '24h' }
)
```

The token is passed through `createLoginNewDeviceNotification()` →
email template as a URL parameter.

**Endpoint** — `GET /api/v1/auth/revoke-all-sessions`:

```
Query: ?token=<jwt>
```

1. Verify JWT signature and expiry.
2. Extract `userId` from payload.
3. Delete all sessions for that user via `SessionService`.
4. Return an HTML page: "All your sessions have been disconnected.
   Please log in again."
5. Rate limited: 5 requests per minute per IP.

This is a GET because it is triggered by an email link click. The
JWT is single-purpose (`action: 'revoke-all'`) and short-lived (24h).
The endpoint is idempotent — clicking twice is harmless.

### Previous session comparison

Before creating the notification, `NotificationService` calls
`SessionService.getUserSessions(userId)` and picks the most recent
session that is NOT the current one (filter by session ID or by
`createdAt < now - 5s`).

Fields extracted from the previous session:

- `previousDeviceName` — e.g. "Safari - macOS 15.1"
- `previousLocation` — e.g. "Paris, France"
- `previousLastActivity` — ISO timestamp

If no previous session exists (first login ever), the "Previous
login" section is omitted.

### Date/time formatting

The login timestamp is formatted in the user's timezone (from
`geoData.timezone` or fallback `UTC`). Format:

- FR: `17 avril 2026 a 13:42 (Africa/Douala)`
- EN: `April 17, 2026 at 1:42 PM (Africa/Douala)`

Use `Intl.DateTimeFormat` with the appropriate locale and timezone.

## Files

### Modified

- `services/gateway/src/services/EmailService.ts`
  - New method `sendLoginAlertEmail(data: LoginAlertEmailData)`
  - New interface `LoginAlertEmailData` with fields: `to`, `name`,
    `language`, `deviceName`, `deviceOS`, `appOrBrowser`,
    `location`, `ip`, `loginTime`, `timezone`, `latitude`,
    `longitude`, `previousDeviceName`, `previousLocation`,
    `previousLoginTime`, `revokeAllUrl`
  - HTML template with inline CSS, dark mode support, responsive
    layout, static map image
  - Plaintext fallback version

- `services/gateway/src/services/notifications/NotificationService.ts`
  - In `createLoginNewDeviceNotification()`: fetch previous session,
    generate revoke token, pass all data to `sendLoginAlertEmail()`
    instead of `sendSecurityAlertEmail()`

- `services/gateway/src/routes/auth/login.ts`
  - Generate `revokeToken` JWT after successful login
  - Pass it to `createLoginNewDeviceNotification()`

### New

- `services/gateway/src/routes/auth/revoke-all-sessions.ts`
  - `GET /api/v1/auth/revoke-all-sessions?token=XXX`
  - JWT verification, session deletion, HTML response page
  - Rate limiting: 5 req/min/IP

### Registration

- `services/gateway/src/routes/auth/index.ts`
  - Register the new revoke-all-sessions route

## Risks

- **OpenStreetMap static map availability.** If the service is down,
  the `<img>` shows alt text. No functional impact — location text
  is always present. If this becomes unreliable, swap to Mapbox
  static images (free tier: 50k/month).

- **Revoke-all URL in email could be forwarded.** The JWT is scoped
  to `action: 'revoke-all'` and cannot be used for login or any
  other action. Worst case: someone clicks a forwarded link and
  logs the user out. Acceptable risk.

- **Previous session lookup adds a DB query.** One indexed query on
  `Session.userId` + `orderBy lastActivityAt`. Negligible latency
  (~5ms). Only runs on login, not on every request.

## Verification

1. Login with `atabeth` credentials. Check inbox for the enriched
   email with device info, location, IP, timestamp, and map.
2. Login from a second device/browser. Verify the "Previous login"
   section shows the first device's details.
3. Click "Revoke all sessions" link. Verify all sessions are
   invalidated and the HTML confirmation page renders.
4. Click the same link again. Verify idempotent behavior (no error).
5. Wait 24h (or set TTL to 1m for testing). Click the link. Verify
   it returns "Link expired".
6. Test with `systemLanguage=en` user — verify English labels.
7. Test with a VPN/unknown IP — verify map section is omitted,
   textual location shows what's available.
