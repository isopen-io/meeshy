# Secure Password Reset Implementation

**Version**: 1.0
**Status**: Production-Ready
**Security Level**: CRITICAL
**Last Updated**: 2025-11-21

---

## Overview

This document provides implementation details for the secure password reset feature in the Meeshy messaging platform. The implementation follows OWASP and NIST security best practices.

## Quick Start

### 1. Database Migration

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
npx prisma generate --schema=../shared/schema.prisma
npx prisma db push --schema=../shared/schema.prisma
```

### 2. Environment Configuration

Copy `.env.example` to `.env.local` and configure:

```bash
# Required
HCAPTCHA_SECRET=your-hcaptcha-secret-key
HCAPTCHA_SITE_KEY=your-hcaptcha-site-key
EMAIL_PROVIDER=sendgrid  # or mailgun
SENDGRID_API_KEY=your-sendgrid-api-key
FRONTEND_URL=https://meeshy.com

# Optional but recommended
GEOIP_LICENSE_KEY=your-maxmind-license-key
MAXMIND_ACCOUNT_ID=your-maxmind-account-id
SECURITY_ADMIN_EMAILS=security@meeshy.com
```

### 3. Register Routes

In your main server file (e.g., `src/server.ts`):

```typescript
import { passwordResetRoutes } from './routes/password-reset';

// Register password reset routes
await fastify.register(passwordResetRoutes, { prefix: '/auth' });
```

### 4. Start Background Jobs

```typescript
import { BackgroundJobsManager } from './jobs';

// In your server startup
const jobsManager = new BackgroundJobsManager(prisma);
jobsManager.startAll();

// Graceful shutdown
process.on('SIGTERM', () => {
  jobsManager.stopAll();
});
```

---

## API Endpoints

### POST /auth/forgot-password

Request password reset via email.

**Request Body:**
```json
{
  "email": "user@example.com",
  "captchaToken": "hcaptcha-token-from-frontend",
  "deviceFingerprint": "optional-device-id"
}
```

**Response (Always 200 OK):**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Security Features:**
- hCaptcha verification
- Rate limiting (3 requests/hour per email, 5/hour per IP)
- Email verification check
- Account lockout check
- Generic response (prevents email enumeration)
- Distributed locking (prevents race conditions)
- Geolocation tracking
- Security event logging

---

### POST /auth/reset-password

Complete password reset with token from email.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePassword123!",
  "confirmPassword": "NewSecurePassword123!",
  "twoFactorCode": "123456",  // Required if user has 2FA enabled
  "deviceFingerprint": "optional-device-id"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. All sessions have been invalidated."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid or expired reset token"
}
```

**Security Features:**
- SHA-256 hashed tokens in database
- Constant-time token comparison
- Token expiry check (15 minutes)
- Single-use tokens
- Password strength validation (zxcvbn)
- Password history check (last 10 passwords)
- 2FA verification (if enabled)
- Session invalidation (all devices)
- Anomaly detection (impossible travel)
- Security event logging
- Email notifications

---

### GET /auth/reset-password/verify-token

Verify token validity without consuming it.

**Query Parameters:**
```
token=reset-token-from-email
```

**Response:**
```json
{
  "valid": true,
  "requires2FA": true,
  "expiresAt": "2025-11-21T16:30:00.000Z"
}
```

---

## Security Features

### Token Security
- **256-bit random tokens**: Cryptographically secure
- **SHA-256 hashing**: Tokens hashed before storage
- **Constant-time comparison**: Prevents timing attacks
- **Single-use**: Tokens marked as used immediately
- **15-minute expiry**: Short-lived tokens
- **Automatic revocation**: Old tokens revoked on new request

### Password Security
- **bcrypt cost=12**: Strong password hashing
- **Password strength validation**:
  - Minimum 12 characters
  - Uppercase + lowercase letters
  - Digits + special characters
  - zxcvbn score ≥ 3/4
- **Password history**: Prevents reuse of last 10 passwords
- **No common passwords**: Built-in blacklist

### Account Protection
- **Rate limiting**: Multiple layers (IP, email, global, user)
- **Account lockout**: 10 failed attempts in 24 hours
- **Auto-unlock**: Accounts unlock after 24 hours
- **Email verification required**: Only verified emails can reset
- **2FA enforcement**: Required if user has 2FA enabled

### Anomaly Detection
- **Device fingerprinting**: Tracks known devices
- **Geolocation validation**: Detects impossible travel
- **IP tracking**: Monitors IP addresses
- **Security event logging**: Comprehensive audit trail

### Session Management
- **Session invalidation**: All sessions terminated on reset
- **JWT blacklisting**: Old tokens invalidated
- **Force re-authentication**: Users must sign in again

---

## Background Jobs

### Cleanup Expired Tokens
**Frequency**: Every 15 minutes
**Purpose**: Delete expired, used, and revoked tokens

```typescript
// Manual execution
await jobsManager.getJobs().cleanupTokens.runNow();
```

### Unlock Accounts
**Frequency**: Every 24 hours
**Purpose**: Unlock accounts with expired lockouts

```typescript
// Manual execution
await jobsManager.getJobs().unlockAccounts.runNow();
```

---

## Monitoring & Alerting

### Security Events

All security events are logged to the `security_events` collection:

```typescript
{
  "eventType": "PASSWORD_RESET_SUCCESS",
  "severity": "MEDIUM",
  "status": "SUCCESS",
  "userId": "user_id",
  "ipAddress": "192.168.1.1",
  "geoLocation": "Paris, France",
  "metadata": { /* additional context */ },
  "createdAt": "2025-11-21T15:30:00.000Z"
}
```

### Alert Thresholds

| Event Type | Threshold | Window | Action |
|------------|-----------|--------|--------|
| Password Reset Failed | 10 | 1 hour | Email alert |
| Account Locked | 5 | 1 hour | Email alert |
| Suspicious Password Reset | 1 | Immediate | Email + log |
| Impossible Travel | 1 | Immediate | Email + log |
| 2FA Failed | 5 | 1 hour | Email alert |

### Metrics Endpoint

```typescript
GET /admin/security/password-reset/metrics

Response:
{
  "period": "24h",
  "totalEvents": 150,
  "criticalEvents": 2,
  "highEvents": 8,
  "eventsByType": [...]
}
```

---

## Testing

### Unit Tests

```bash
cd gateway
npm test -- password-reset.service.test.ts
```

### Integration Tests

```bash
npm test -- password-reset.routes.test.ts
```

### Manual Testing

1. **Request Reset**:
```bash
curl -X POST http://localhost:4000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "captchaToken": "test-token"
  }'
```

2. **Complete Reset**:
```bash
curl -X POST http://localhost:4000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "token-from-email",
    "newPassword": "NewSecurePassword123!",
    "confirmPassword": "NewSecurePassword123!"
  }'
```

---

## Troubleshooting

### Common Issues

**1. CAPTCHA verification failing**
- Check `HCAPTCHA_SECRET` is set correctly
- Verify hCaptcha account is active
- For dev: Set `BYPASS_CAPTCHA=true` in `.env.local`

**2. Emails not sending**
- Check `EMAIL_PROVIDER` configuration
- Verify API keys (SendGrid/Mailgun)
- Check `EMAIL_FROM` is a verified sender
- Review email service logs

**3. Rate limiting too strict**
- Redis connection issues → Falls back to memory cache
- Adjust thresholds in `PasswordResetService.ts`

**4. Database migration errors**
- Run `npx prisma generate --schema=../shared/schema.prisma`
- Then `npx prisma db push --schema=../shared/schema.prisma`

---

## Production Checklist

- [ ] All environment variables configured
- [ ] hCaptcha keys obtained and tested
- [ ] Email service configured and tested
- [ ] Database migrations applied
- [ ] Redis connection verified
- [ ] Background jobs started
- [ ] Security admin emails configured
- [ ] GeoIP service configured (optional)
- [ ] Rate limiting tested
- [ ] Password strength requirements communicated to users
- [ ] Frontend integration complete
- [ ] Monitoring and alerts configured
- [ ] All tests passing
- [ ] Security audit conducted

---

## Security Considerations

### Never Do
- ❌ Store unhashed tokens in database
- ❌ Reveal if email exists in error messages
- ❌ Allow unlimited reset attempts
- ❌ Skip CAPTCHA verification
- ❌ Allow password reuse
- ❌ Log sensitive information (passwords, tokens)

### Always Do
- ✅ Hash tokens with SHA-256
- ✅ Use constant-time comparison
- ✅ Implement rate limiting
- ✅ Require email verification
- ✅ Enforce 2FA if enabled
- ✅ Invalidate all sessions
- ✅ Log security events
- ✅ Send email notifications
- ✅ Use bcrypt cost=12
- ✅ Monitor anomalies

---

## Support

For security issues: `security@meeshy.com`
For technical support: `support@meeshy.com`

---

**Architecture Reference**: See `SECURE_PASSWORD_RESET_ARCHITECTURE.md`
**Implementation Guide**: See `IMPLEMENTATION_GUIDE.md`
