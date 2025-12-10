# Secure Password Reset - Implementation Guide

**Version**: 1.0
**Target**: Development Team
**Estimated Time**: 16-24 hours (2-3 days)
**Dependencies**: Redis, MongoDB, Email Service (SendGrid/Mailgun), hCaptcha

---

## Overview

This guide provides step-by-step instructions to implement the security-hardened password reset architecture. Follow the phases sequentially to ensure proper implementation and testing.

---

## Phase 1: Database Schema Updates (2 hours)

### 1.1 Update User Model

Add new security fields to the `User` model in Prisma schema:

```prisma
// gateway/shared/prisma/schema.prisma

model User {
  // ... existing fields ...

  // Security & Verification (UPDATE EXISTING)
  emailVerifiedAt             DateTime?
  phoneVerifiedAt             DateTime?
  twoFactorEnabledAt          DateTime?
  twoFactorSecret             String?   // TOTP secret (encrypted)

  // Account Lockout (NEW)
  failedLoginAttempts         Int       @default(0)
  lockedUntil                 DateTime?
  lockedReason                String?

  // Password Management (NEW)
  lastPasswordChange          DateTime  @default(now())
  passwordResetAttempts       Int       @default(0)
  lastPasswordResetAttempt    DateTime?

  // Device & Location Tracking (NEW)
  lastLoginIp                 String?
  lastLoginLocation           String?
  lastLoginDevice             String?

  // Relations (NEW)
  passwordResetTokens         PasswordResetToken[]
  passwordHistory             PasswordHistory[]
  securityEvents              SecurityEvent[]
  sessions                    UserSession[]
}
```

### 1.2 Create New Models

Add four new models to the schema:

```prisma
// 1. PasswordResetToken
model PasswordResetToken {
  id                String    @id @default(auto()) @map("_id") @db.ObjectId
  userId            String    @db.ObjectId
  tokenHash         String    @unique
  expiresAt         DateTime
  usedAt            DateTime?
  isRevoked         Boolean   @default(false)
  revokedReason     String?
  ipAddress         String?
  userAgent         String?
  deviceFingerprint String?
  geoLocation       String?
  geoCoordinates    String?
  createdAt         DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}

// 2. PasswordHistory
model PasswordHistory {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  userId        String    @db.ObjectId
  passwordHash  String
  changedVia    String
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime  @default(now())

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([createdAt])
  @@map("password_history")
}

// 3. SecurityEvent
model SecurityEvent {
  id                String    @id @default(auto()) @map("_id") @db.ObjectId
  userId            String?   @db.ObjectId
  eventType         String
  severity          String
  status            String
  description       String?
  metadata          Json?
  ipAddress         String?
  userAgent         String?
  deviceFingerprint String?
  geoLocation       String?
  createdAt         DateTime  @default(now())

  user              User?     @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([eventType])
  @@index([severity])
  @@index([createdAt])
  @@map("security_events")
}

// 4. UserSession
model UserSession {
  id                String    @id @default(auto()) @map("_id") @db.ObjectId
  userId            String    @db.ObjectId
  sessionToken      String    @unique
  refreshToken      String?   @unique
  ipAddress         String?
  userAgent         String?
  deviceFingerprint String?
  expiresAt         DateTime
  isValid           Boolean   @default(true)
  invalidatedAt     DateTime?
  invalidatedReason String?
  createdAt         DateTime  @default(now())
  lastActivityAt    DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionToken])
  @@index([expiresAt])
  @@index([isValid])
  @@map("user_sessions")
}
```

### 1.3 Run Migrations

```bash
cd gateway
npx prisma generate
npx prisma db push
```

### 1.4 Verify Schema

```bash
# Check that new collections exist in MongoDB
npx prisma studio
```

**Checkpoint**: All new models should be visible in Prisma Studio.

---

## Phase 2: Install Dependencies (30 minutes)

### 2.1 Install NPM Packages

```bash
cd gateway
npm install --save speakeasy @types/speakeasy
npm install --save zxcvbn @types/zxcvbn  # For password strength
```

### 2.2 Update Environment Variables

Add to `.env`:

```bash
# Email Service (choose one)
EMAIL_PROVIDER=sendgrid  # or 'mailgun'
SENDGRID_API_KEY=your-sendgrid-api-key
# OR
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.meeshy.com

# Email Configuration
EMAIL_FROM=noreply@meeshy.com
EMAIL_FROM_NAME=Meeshy

# CAPTCHA
HCAPTCHA_SECRET=your-hcaptcha-secret-key
HCAPTCHA_SITE_KEY=your-hcaptcha-site-key

# GeoIP (optional, free tier available)
GEOIP_LICENSE_KEY=your-maxmind-license-key
MAXMIND_ACCOUNT_ID=your-maxmind-account-id

# Frontend URL
FRONTEND_URL=https://meeshy.com  # or http://localhost:3000 for dev

# Redis (already configured)
REDIS_URL=redis://localhost:6379

# JWT Secret (MUST be strong, min 256 bits)
JWT_SECRET=your-super-secure-random-secret-min-32-chars
```

### 2.3 Verify Redis is Running

```bash
# Check Redis connection
redis-cli ping
# Should return: PONG
```

**Checkpoint**: All environment variables configured, Redis accessible.

---

## Phase 3: Create Supporting Services (2 hours)

### 3.1 Copy Service Files

The following files have been created:

- `/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/src/services/EmailService.ts` ✅
- `/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/src/services/GeoIPService.ts` ✅
- `/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/src/services/RedisWrapper.ts` ✅ (already exists)

### 3.2 Create PasswordResetService

Create the main service (code provided in architecture document):

```bash
# File location:
gateway/src/services/PasswordResetService.ts
```

Copy the implementation from Section 6.1 of the architecture document.

### 3.3 Test Services Individually

```typescript
// Test EmailService
import { EmailService } from './services/EmailService';

const emailService = new EmailService();
await emailService.sendPasswordResetEmail({
  to: 'test@example.com',
  name: 'Test User',
  resetLink: 'https://meeshy.com/reset-password?token=test',
  expiryMinutes: 15
});
```

**Checkpoint**: Services compile without errors, email test successful.

---

## Phase 4: Create API Routes (2 hours)

### 4.1 Create Password Reset Routes

Create file: `gateway/src/routes/password-reset.ts`

Copy implementation from Section 6.2 of the architecture document.

### 4.2 Register Routes in Main App

Update `gateway/src/app.ts` or `gateway/src/server.ts`:

```typescript
import { passwordResetRoutes } from './routes/password-reset';

// Register routes
await app.register(passwordResetRoutes, { prefix: '/auth' });
```

### 4.3 Test Routes with curl

```bash
# Test forgot-password endpoint
curl -X POST http://localhost:4000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "captchaToken": "test-token"
  }'

# Expected: Generic success response
```

**Checkpoint**: Routes accessible, return expected responses.

---

## Phase 5: Update bcrypt Cost (30 minutes)

### 5.1 Update AuthService

Update `gateway/src/services/auth.service.ts`:

```typescript
// OLD (line ~155)
const hashedPassword = await bcrypt.hash(data.password, 10);

// NEW
const BCRYPT_COST = 12;
const hashedPassword = await bcrypt.hash(data.password, BCRYPT_COST);
```

### 5.2 Verify Performance

```typescript
// Test bcrypt performance with cost=12
import bcrypt from 'bcryptjs';

const start = Date.now();
await bcrypt.hash('test-password', 12);
const end = Date.now();

console.log(`bcrypt cost=12 took ${end - start}ms`);
// Should be 200-500ms (acceptable)
```

**Checkpoint**: bcrypt cost updated, performance acceptable.

---

## Phase 6: Session Management (3 hours)

### 6.1 Create Session Tracking

Update login endpoint to create sessions:

```typescript
// In auth.service.ts -> authenticate()

// After successful authentication:
await this.prisma.userSession.create({
  data: {
    userId: user.id,
    sessionToken: crypto.createHash('sha256').update(token).digest('hex'),
    ipAddress: requestIp,
    userAgent: requestUserAgent,
    deviceFingerprint: requestDeviceFingerprint,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    isValid: true
  }
});
```

### 6.2 Update Logout to Invalidate Sessions

```typescript
// In auth routes -> logout

await prisma.userSession.update({
  where: { sessionToken: hashedToken },
  data: {
    isValid: false,
    invalidatedAt: new Date(),
    invalidatedReason: 'LOGOUT'
  }
});
```

### 6.3 Add Session Validation Middleware

```typescript
// In middleware/auth.ts

async function validateSession(token: string): Promise<boolean> {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const session = await prisma.userSession.findUnique({
    where: { sessionToken: hashedToken }
  });

  if (!session) return false;
  if (!session.isValid) return false;
  if (session.expiresAt < new Date()) return false;

  // Update last activity
  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() }
  });

  return true;
}
```

**Checkpoint**: Sessions created on login, validated on requests, invalidated on logout.

---

## Phase 7: Frontend Integration (4 hours)

### 7.1 Create Forgot Password Page

```typescript
// frontend/app/forgot-password/page.tsx

'use client';

import { useState } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, captchaToken })
    });

    if (response.ok) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="success-message">
        <h2>Check Your Email</h2>
        <p>If an account exists with this email, a password reset link has been sent.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Reset Password</h1>

      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <HCaptcha
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
        onVerify={(token) => setCaptchaToken(token)}
      />

      <button type="submit" disabled={!captchaToken}>
        Send Reset Link
      </button>
    </form>
  );
}
```

### 7.2 Create Reset Password Page

```typescript
// frontend/app/reset-password/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        newPassword,
        confirmPassword,
        twoFactorCode: twoFactorCode || undefined
      })
    });

    const data = await response.json();

    if (data.success) {
      setSuccess(true);
    } else {
      setError(data.error || 'An error occurred');
    }
  };

  if (!token) {
    return <div>Invalid reset link</div>;
  }

  if (success) {
    return (
      <div className="success-message">
        <h2>Password Reset Successful</h2>
        <p>You can now sign in with your new password.</p>
        <a href="/signin">Go to Sign In</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Create New Password</h1>

      {error && <div className="error">{error}</div>}

      <input
        type="password"
        placeholder="New Password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        minLength={12}
        required
      />

      <input
        type="password"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        minLength={12}
        required
      />

      <input
        type="text"
        placeholder="2FA Code (if enabled)"
        value={twoFactorCode}
        onChange={(e) => setTwoFactorCode(e.target.value)}
        pattern="[0-9]{6}"
      />

      <div className="password-requirements">
        <p>Password must contain:</p>
        <ul>
          <li>At least 12 characters</li>
          <li>One uppercase letter</li>
          <li>One lowercase letter</li>
          <li>One digit</li>
          <li>One special character</li>
        </ul>
      </div>

      <button type="submit">Reset Password</button>
    </form>
  );
}
```

### 7.3 Install hCaptcha for Frontend

```bash
cd frontend
npm install --save @hcaptcha/react-hcaptcha
```

**Checkpoint**: Frontend pages functional, CAPTCHA working, form validation correct.

---

## Phase 8: Testing (4 hours)

### 8.1 Unit Tests

Run the test suite provided in the architecture document (Section 8).

```bash
cd gateway
npm test -- password-reset.service.test.ts
```

### 8.2 Integration Tests

```bash
npm test -- password-reset.integration.test.ts
```

### 8.3 Manual Testing Checklist

- [ ] Request reset with valid email (verified)
- [ ] Request reset with valid email (not verified) → generic response
- [ ] Request reset with invalid email → generic response
- [ ] Request reset without CAPTCHA → generic response
- [ ] Request reset 6 times from same IP → rate limited
- [ ] Click reset link → password form displayed
- [ ] Submit new password (weak) → error
- [ ] Submit new password (strong) → success
- [ ] Submit with expired token → error
- [ ] Submit with used token → error
- [ ] Submit with 2FA enabled but no code → error
- [ ] Submit with 2FA enabled and valid code → success
- [ ] Verify all sessions invalidated after reset
- [ ] Verify confirmation email received
- [ ] Verify password history prevents reuse
- [ ] Verify account lockout after 10 failed attempts

**Checkpoint**: All tests pass, manual testing complete.

---

## Phase 9: Security Audit (2 hours)

### 9.1 Code Review Checklist

- [ ] Tokens hashed before storage (SHA-256)
- [ ] Constant-time token comparison implemented
- [ ] bcrypt cost = 12
- [ ] Rate limiting functional (IP + email)
- [ ] Distributed locks working (Redis)
- [ ] Account lockout functional
- [ ] Generic responses (no information disclosure)
- [ ] Email verification required
- [ ] 2FA enforced if enabled
- [ ] Password strength validation
- [ ] Password history check (last 10)
- [ ] Session invalidation working
- [ ] Security events logged
- [ ] Email notifications sent

### 9.2 Penetration Testing

Recommended tools:
- **OWASP ZAP**: Automated security scanner
- **Burp Suite**: Manual testing
- **sqlmap**: SQL injection testing (not applicable for MongoDB, but good practice)

Focus areas:
- Token enumeration attempts
- Timing attacks on token validation
- Rate limit bypass attempts
- CAPTCHA bypass attempts
- Session fixation
- CSRF attacks (ensure CSRF tokens on frontend)

**Checkpoint**: All security checks pass, no critical vulnerabilities.

---

## Phase 10: Monitoring & Alerting (2 hours)

### 10.1 Setup Security Event Dashboard

Create admin dashboard to view security metrics:

```typescript
// frontend/app/admin/security/page.tsx

// Display:
// - Password reset requests (24h)
// - Failed resets (24h)
// - Account lockouts (24h)
// - Suspicious locations (24h)
// - 2FA failures (24h)
```

### 10.2 Configure Alerts

Setup alerts for:
- More than 10 password reset failures per hour
- More than 5 account lockouts per hour
- Any "IMPOSSIBLE_TRAVEL" event
- More than 50 CAPTCHA failures per hour

Use: Slack webhook, email, or PagerDuty.

**Checkpoint**: Dashboard functional, alerts configured.

---

## Phase 11: Documentation (1 hour)

### 11.1 Update API Documentation

Add to Swagger/OpenAPI spec:
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

### 11.2 Create User Guide

Write help article: "How to Reset Your Password"

### 11.3 Create Admin Guide

Document: "How to Handle Password Reset Security Events"

**Checkpoint**: Documentation complete and published.

---

## Phase 12: Deployment (2 hours)

### 12.1 Staging Deployment

```bash
# Deploy to staging
git checkout staging
git merge feature/secure-password-reset
git push origin staging

# Run migrations on staging DB
npx prisma db push --preview-feature
```

### 12.2 Production Deployment

```bash
# Deploy to production (after staging validation)
git checkout main
git merge staging
git push origin main

# Run migrations on production DB
npx prisma db push --preview-feature

# Verify health
curl https://api.meeshy.com/health
```

### 12.3 Post-Deployment Smoke Tests

Run all manual tests in production environment.

**Checkpoint**: Deployed successfully, all smoke tests pass.

---

## Rollback Procedure

If critical issues discovered:

```bash
# 1. Disable endpoints immediately
# Add to route config:
fastify.post('/forgot-password', async (req, reply) => {
  return reply.status(503).send({
    success: false,
    error: 'Password reset temporarily unavailable. Please try again later.'
  });
});

# 2. Revoke all active reset tokens
db.password_reset_tokens.updateMany(
  { usedAt: null, isRevoked: false },
  { $set: { isRevoked: true, revokedReason: 'EMERGENCY_DISABLE' } }
);

# 3. Rollback deployment
git revert <commit-hash>
git push origin main

# 4. Investigate and fix
# Review security event logs
# Identify root cause
# Implement fix

# 5. Re-test and re-deploy
```

---

## Success Criteria

✅ All unit tests pass
✅ All integration tests pass
✅ All manual tests pass
✅ Security audit complete with no critical issues
✅ Monitoring and alerts configured
✅ Documentation complete
✅ Deployed to production successfully
✅ Post-deployment smoke tests pass

---

## Timeline

| Phase | Task | Duration | Cumulative |
|-------|------|----------|------------|
| 1 | Database Schema Updates | 2h | 2h |
| 2 | Install Dependencies | 0.5h | 2.5h |
| 3 | Create Supporting Services | 2h | 4.5h |
| 4 | Create API Routes | 2h | 6.5h |
| 5 | Update bcrypt Cost | 0.5h | 7h |
| 6 | Session Management | 3h | 10h |
| 7 | Frontend Integration | 4h | 14h |
| 8 | Testing | 4h | 18h |
| 9 | Security Audit | 2h | 20h |
| 10 | Monitoring & Alerting | 2h | 22h |
| 11 | Documentation | 1h | 23h |
| 12 | Deployment | 2h | 25h |

**Total Estimated Time**: 25 hours (3-4 days for single developer)

---

## Support

For questions or issues during implementation:
- Review architecture document: `SECURE_PASSWORD_RESET_ARCHITECTURE.md`
- Check security best practices: OWASP Password Reset Cheat Sheet
- Contact security team: security@meeshy.com

---

**Last Updated**: 2025-11-21
**Version**: 1.0
**Owner**: Development Team
