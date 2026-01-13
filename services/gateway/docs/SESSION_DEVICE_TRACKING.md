# Session & Device Tracking Documentation

## Overview

Meeshy tracks sessions with full device and location information for security auditing and to provide different session durations based on device type.

## Session Duration Configuration

| Device Type | Default Duration | Environment Variable |
|-------------|-----------------|---------------------|
| **Mobile Apps** (iOS/Android) | 365 days | `SESSION_EXPIRY_MOBILE_DAYS` |
| **Desktop Browsers** | 30 days | `SESSION_EXPIRY_DESKTOP_DAYS` |
| **Trusted Devices** | 365 days | `SESSION_EXPIRY_TRUSTED_DAYS` |
| **Max Sessions/User** | 10 | `MAX_SESSIONS_PER_USER` |

## User-Agent Detection

### iOS App

The iOS app sets its User-Agent in `apps/ios/Meeshy/API/Core/APIClient.swift`:

```swift
configuration.httpAdditionalHeaders = [
    "Accept": "application/json",
    "User-Agent": "Meeshy-iOS/\(Bundle.main.appVersion)"
]
```

**Example User-Agent:** `Meeshy-iOS/1.0.0`

### Android App (Future)

Pattern: `Meeshy-Android/x.x.x`

### Web App

Standard browser User-Agent (Safari, Chrome, Firefox, etc.)

### Backend Detection

The `SessionService.ts` detects mobile apps using regex pattern:

```typescript
const isMobileApp = /Meeshy-(iOS|Android)\/[\d.]+/.test(userAgent) ||
                    userAgent.includes('MeeshyApp') ||
                    (deviceInfo?.type === 'mobile' && !userAgent.includes('Safari') && !userAgent.includes('Chrome'));
```

**Location:** `services/gateway/src/services/SessionService.ts`

## Device Information Captured

### GeoIPService

**File:** `services/gateway/src/services/GeoIPService.ts`

Captures from the request:

```typescript
interface DeviceInfo {
  type: string;           // mobile, tablet, desktop, smarttv
  vendor: string | null;  // Apple, Samsung, Huawei
  model: string | null;   // iPhone, Galaxy S21
  os: string | null;      // iOS, Android, Windows
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  isMobile: boolean;
  isTablet: boolean;
  rawUserAgent: string;
}
```

### What's NOT Captured (Requires Client-Side Collection)

The following information is NOT automatically available from the User-Agent:

- **Screen size/resolution** - Must be sent by client
- **Device language** - Must be sent by client
- **App version** (for web) - Must be sent by client
- **Device UUID** - Must be generated and sent by client
- **Battery level** - Must be sent by client
- **Network type** (WiFi/Cellular) - Must be sent by client

### How to Capture Additional Device Info

#### iOS App

Add custom headers in `APIClient.swift`:

```swift
configuration.httpAdditionalHeaders = [
    "Accept": "application/json",
    "User-Agent": "Meeshy-iOS/\(Bundle.main.appVersion)",
    "X-Device-Language": Locale.current.languageCode ?? "unknown",
    "X-Device-Model": UIDevice.current.modelName,
    "X-Screen-Size": "\(UIScreen.main.bounds.width)x\(UIScreen.main.bounds.height)",
    "X-Device-UUID": UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
]
```

#### Web App

Send via headers or body in login/register requests:

```typescript
const deviceInfo = {
  screenWidth: window.screen.width,
  screenHeight: window.screen.height,
  deviceLanguage: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  deviceMemory: navigator.deviceMemory,
  hardwareConcurrency: navigator.hardwareConcurrency
};
```

## Session Storage

Sessions are stored in the **UserSession** table (MongoDB via Prisma):

```prisma
model UserSession {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  userId        String   @db.ObjectId

  // Token (hashed)
  sessionToken  String   @unique
  refreshToken  String?  @unique

  // Device Information
  deviceType     String?  // mobile, tablet, desktop
  deviceVendor   String?  // Apple, Samsung
  deviceModel    String?  // iPhone, Galaxy S23
  osName         String?  // iOS, Android, Windows
  osVersion      String?
  browserName    String?
  browserVersion String?
  isMobile       Boolean  @default(false)
  userAgent      String?

  // Network & Location
  ipAddress String?
  country   String?  // ISO 3166-1 alpha-2
  city      String?
  location  String?  // "Paris, France"
  latitude  Float?
  longitude Float?
  timezone  String?

  // Security
  deviceFingerprint String?
  isTrusted         Boolean @default(false)

  // Lifecycle
  expiresAt         DateTime
  isValid           Boolean @default(true)
  invalidatedReason String?

  createdAt      DateTime @default(now())
  lastActivityAt DateTime @default(now())
}
```

## Session Management API

### Extend Session

```typescript
sessionService.extendExpiry(token, days?)
```

Extends session expiry. Uses device-appropriate default if `days` not specified.

### Rotate Refresh Token

```typescript
sessionService.rotateRefresh(currentRefreshToken)
```

Returns new refresh token and extends session. Used by mobile apps for long-term sessions.

### Mark Session Trusted

```typescript
sessionService.markTrusted(sessionId)
```

Extends session to `SESSION_EXPIRY_TRUSTED_DAYS` (365 days default).

## Security Events

All authentication events are logged to `SecurityEvent` table:

- `MAGIC_LINK_REQUESTED` - Magic link email sent
- `MAGIC_LINK_LOGIN_SUCCESS` - Successful magic link login
- `MAGIC_LINK_REUSE_ATTEMPT` - Attempt to reuse magic link
- `MAGIC_LINK_EXPIRED` - Expired magic link used
- `LOGIN_SUCCESS` - Standard login successful
- `LOGIN_FAILED` - Failed login attempt
- `PASSWORD_RESET_REQUESTED` - Password reset requested
- `PASSWORD_RESET_SUCCESS` - Password successfully reset

## Best Practices

1. **iOS App**: Use `Meeshy-iOS/x.x.x` User-Agent pattern
2. **Android App**: Use `Meeshy-Android/x.x.x` User-Agent pattern
3. **Web App**: Let browser set standard User-Agent
4. **Additional Info**: Send via custom headers (`X-Device-*`)
5. **Refresh Tokens**: Use for mobile apps to maintain long sessions
6. **Session Extension**: Call periodically on app foreground
