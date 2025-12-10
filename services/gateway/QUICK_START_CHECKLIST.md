# Password Reset Implementation - Quick Start Checklist

**Target Audience**: Developers
**Time**: 3-4 days
**Prerequisites**: Redis running, MongoDB accessible, Email service account (SendGrid/Mailgun)

---

## Pre-Implementation Checklist

### Environment Setup

- [ ] Redis running and accessible (`redis-cli ping` returns `PONG`)
- [ ] MongoDB accessible
- [ ] Email service account created (SendGrid OR Mailgun)
- [ ] hCaptcha account created (free tier)
- [ ] MaxMind GeoIP2 account created (optional, free tier available)

### Environment Variables

Add to `.env` file:

```bash
# Email Service (choose one)
EMAIL_PROVIDER=sendgrid  # or 'mailgun'
SENDGRID_API_KEY=your-sendgrid-api-key
# OR
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.meeshy.com

EMAIL_FROM=noreply@meeshy.com
EMAIL_FROM_NAME=Meeshy

# CAPTCHA
HCAPTCHA_SECRET=your-hcaptcha-secret-key
HCAPTCHA_SITE_KEY=your-hcaptcha-site-key

# GeoIP (optional)
GEOIP_LICENSE_KEY=your-maxmind-license-key
MAXMIND_ACCOUNT_ID=your-maxmind-account-id

# Frontend
FRONTEND_URL=https://meeshy.com  # or http://localhost:3000 for dev

# Redis (should already exist)
REDIS_URL=redis://localhost:6379

# JWT Secret (CRITICAL: must be strong, min 256 bits)
JWT_SECRET=your-super-secure-random-secret-min-32-chars
```

- [ ] All environment variables configured
- [ ] `.env` file backed up
- [ ] Strong JWT secret generated (min 32 characters)

---

## Implementation Checklist (12 Phases)

### Phase 1: Database Schema (2 hours)

- [ ] Update `User` model with new security fields
- [ ] Create `PasswordResetToken` model
- [ ] Create `PasswordHistory` model
- [ ] Create `SecurityEvent` model
- [ ] Create `UserSession` model
- [ ] Run `npx prisma generate`
- [ ] Run `npx prisma db push`
- [ ] Verify in Prisma Studio (all collections visible)

**Files Modified**:
- `gateway/shared/prisma/schema.prisma`

---

### Phase 2: Install Dependencies (30 minutes)

```bash
cd gateway
npm install --save speakeasy @types/speakeasy
npm install --save zxcvbn @types/zxcvbn
```

- [ ] Dependencies installed
- [ ] No installation errors
- [ ] TypeScript compilation successful

---

### Phase 3: Create Services (2 hours)

- [ ] `EmailService.ts` created (already provided)
- [ ] `GeoIPService.ts` created (already provided)
- [ ] `PasswordResetService.ts` created (copy from architecture doc)
- [ ] All services compile without errors
- [ ] Services export correctly

**Files Created**:
- `gateway/src/services/EmailService.ts` ✅
- `gateway/src/services/GeoIPService.ts` ✅
- `gateway/src/services/PasswordResetService.ts` (from arch doc)

---

### Phase 4: Create Routes (2 hours)

- [ ] `password-reset.ts` route file created
- [ ] Routes registered in main app
- [ ] Schemas defined for validation
- [ ] Error handling implemented

**Files Created**:
- `gateway/src/routes/password-reset.ts`

**Files Modified**:
- `gateway/src/app.ts` or `gateway/src/server.ts`

---

### Phase 5: Update bcrypt Cost (30 minutes)

- [ ] Update `auth.service.ts` register method (cost=10 → cost=12)
- [ ] Update `PasswordResetService.ts` (cost=12)
- [ ] Test performance (should be 200-500ms)

**Files Modified**:
- `gateway/src/services/auth.service.ts`

---

### Phase 6: Session Management (3 hours)

- [ ] Update login to create sessions
- [ ] Update logout to invalidate sessions
- [ ] Add session validation middleware
- [ ] Update JWT middleware to check sessions

**Files Modified**:
- `gateway/src/services/auth.service.ts`
- `gateway/src/routes/auth.ts`
- `gateway/src/middleware/auth.ts`

---

### Phase 7: Frontend Integration (4 hours)

**Frontend (Next.js)**:

- [ ] Install hCaptcha: `npm install --save @hcaptcha/react-hcaptcha`
- [ ] Create `/forgot-password` page
- [ ] Create `/reset-password` page
- [ ] Add CAPTCHA widget to forgot password page
- [ ] Add password strength indicator
- [ ] Test both flows

**Files Created**:
- `frontend/app/forgot-password/page.tsx`
- `frontend/app/reset-password/page.tsx`

**Environment Variables** (frontend):
- [ ] `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` added to `.env.local`

---

### Phase 8: Testing (4 hours)

#### Unit Tests

- [ ] `password-reset.service.test.ts` created
- [ ] Test: Generic response for invalid CAPTCHA
- [ ] Test: Generic response for non-existent email
- [ ] Test: Distributed lock prevents race conditions
- [ ] Test: Weak password rejected
- [ ] Test: Constant-time token comparison
- [ ] Test: Password history enforced
- [ ] Test: 2FA required if enabled
- [ ] All unit tests pass

#### Integration Tests

- [ ] `password-reset.integration.test.ts` created
- [ ] Test: Full password reset flow (request → reset)
- [ ] Test: Rate limiting enforced
- [ ] Test: Account lockout after 10 attempts
- [ ] Test: Session invalidation works
- [ ] All integration tests pass

#### Manual Testing

- [ ] Request reset with valid email → email received
- [ ] Request reset with invalid email → generic response, no email
- [ ] Request reset without CAPTCHA → error or generic response
- [ ] Click reset link → form displayed
- [ ] Submit weak password → error
- [ ] Submit strong password → success
- [ ] Verify all sessions logged out
- [ ] Verify confirmation email received
- [ ] Test with 2FA enabled → requires code
- [ ] Test account lockout (10 failed attempts)
- [ ] Test rate limiting (6 requests from same IP)

---

### Phase 9: Security Audit (2 hours)

- [ ] Code review completed
- [ ] Tokens hashed before storage (SHA-256) ✅
- [ ] Constant-time comparison implemented ✅
- [ ] bcrypt cost = 12 ✅
- [ ] Rate limiting functional ✅
- [ ] Account lockout functional ✅
- [ ] Generic responses (no enumeration) ✅
- [ ] Email verification required ✅
- [ ] 2FA enforced if enabled ✅
- [ ] Password strength validation ✅
- [ ] Password history check ✅
- [ ] Session invalidation working ✅
- [ ] Security events logged ✅

**Optional**: Run OWASP ZAP or Burp Suite scan

---

### Phase 10: Monitoring & Alerting (2 hours)

- [ ] Security event dashboard created
- [ ] Alerts configured for:
  - [ ] >10 failed resets/hour
  - [ ] >5 account lockouts/hour
  - [ ] Any "IMPOSSIBLE_TRAVEL" event
  - [ ] >50 CAPTCHA failures/hour
- [ ] Test alerts working

**Files Created**:
- `frontend/app/admin/security/page.tsx` (optional)

---

### Phase 11: Documentation (1 hour)

- [ ] API documentation updated (Swagger/OpenAPI)
- [ ] User guide: "How to Reset Your Password"
- [ ] Admin guide: "Security Event Response"
- [ ] README updated

---

### Phase 12: Deployment (2 hours)

#### Staging Deployment

- [ ] Deploy to staging environment
- [ ] Run Prisma migrations on staging DB
- [ ] Run all smoke tests
- [ ] Verify emails sent successfully
- [ ] Verify CAPTCHA working
- [ ] Verify rate limiting working

#### Production Deployment

- [ ] Deploy to production
- [ ] Run Prisma migrations on production DB
- [ ] Run all smoke tests in production
- [ ] Monitor error logs for 1 hour
- [ ] Verify security metrics dashboard

#### Post-Deployment

- [ ] Smoke tests passed
- [ ] Error rate < 1%
- [ ] No critical alerts triggered
- [ ] Users able to reset passwords successfully

---

## Rollback Checklist (If Needed)

- [ ] Disable endpoints (return 503)
- [ ] Revoke all active reset tokens
- [ ] Rollback git deployment
- [ ] Investigate root cause
- [ ] Fix and re-test
- [ ] Re-deploy

```bash
# Emergency disable
db.password_reset_tokens.updateMany(
  { usedAt: null, isRevoked: false },
  { $set: { isRevoked: true, revokedReason: 'EMERGENCY_DISABLE' } }
)
```

---

## Success Criteria

✅ All unit tests pass (100% coverage on security features)
✅ All integration tests pass
✅ All manual tests pass
✅ Security audit complete (no CRITICAL issues)
✅ Monitoring and alerts configured
✅ Documentation complete
✅ Deployed successfully
✅ Post-deployment smoke tests pass
✅ Error rate < 1% for 24 hours

---

## Common Issues & Solutions

### Issue: Redis connection fails

**Solution**: Check Redis is running
```bash
redis-cli ping
# Should return: PONG
```

If not running:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis
```

---

### Issue: Email not sending

**Solution**: Check email service credentials
```bash
# Test SendGrid
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Check logs
tail -f gateway/logs/error.log | grep EmailService
```

---

### Issue: CAPTCHA validation fails

**Solution**: Verify hCaptcha secret key
```bash
# Test CAPTCHA verification
curl -X POST https://hcaptcha.com/siteverify \
  -d "secret=YOUR_SECRET&response=test-token"
```

---

### Issue: Prisma migrations fail

**Solution**: Check MongoDB connection
```bash
# Test MongoDB connection
npx prisma db pull

# Force push schema
npx prisma db push --force-reset  # CAUTION: Deletes data
```

---

### Issue: TypeScript compilation errors

**Solution**: Check dependencies
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Regenerate Prisma client
npx prisma generate
```

---

## Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- password-reset.service.test.ts

# Run tests with coverage
npm test -- --coverage

# Run integration tests only
npm test -- --testPathPattern=integration

# Watch mode (for development)
npm test -- --watch
```

---

## Useful Commands

```bash
# Check Redis stats
redis-cli info stats

# View security events (MongoDB)
db.security_events.find().sort({createdAt: -1}).limit(10)

# Count password reset tokens
db.password_reset_tokens.countDocuments()

# Check account lockouts
db.users.find({lockedUntil: {$gt: new Date()}}).count()

# View recent password resets
db.password_history.find().sort({createdAt: -1}).limit(5)

# Clear rate limit cache (Redis)
redis-cli KEYS "ratelimit:password-reset:*" | xargs redis-cli DEL
```

---

## Quick Reference: Security Features

| Feature | Status | Location |
|---------|--------|----------|
| SHA-256 hashed tokens | ✅ | `PasswordResetService.ts:138` |
| Constant-time comparison | ✅ | `PasswordResetService.ts:214` |
| bcrypt cost=12 | ✅ | `PasswordResetService.ts:12` |
| Rate limiting | ✅ | `PasswordResetService.ts:163-190` |
| Account lockout | ✅ | `PasswordResetService.ts:192-218` |
| CAPTCHA | ✅ | `PasswordResetService.ts:152-161` |
| Email verification | ✅ | `PasswordResetService.ts:127` |
| 2FA enforcement | ✅ | `PasswordResetService.ts:329-343` |
| Password history | ✅ | `PasswordResetService.ts:392-405` |
| Session invalidation | ✅ | `PasswordResetService.ts:384-389` |
| Anomaly detection | ✅ | `PasswordResetService.ts:352-368` |
| Security logging | ✅ | `PasswordResetService.ts:424-440` |

---

## Time Tracking

Use this to track your progress:

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| 1. Database | 2h | ___ | |
| 2. Dependencies | 0.5h | ___ | |
| 3. Services | 2h | ___ | |
| 4. Routes | 2h | ___ | |
| 5. bcrypt | 0.5h | ___ | |
| 6. Sessions | 3h | ___ | |
| 7. Frontend | 4h | ___ | |
| 8. Testing | 4h | ___ | |
| 9. Security Audit | 2h | ___ | |
| 10. Monitoring | 2h | ___ | |
| 11. Documentation | 1h | ___ | |
| 12. Deployment | 2h | ___ | |
| **Total** | **25h** | ___ | |

---

## Need Help?

1. **Architecture Questions**: Read `SECURE_PASSWORD_RESET_ARCHITECTURE.md`
2. **Implementation Details**: Read `IMPLEMENTATION_GUIDE.md`
3. **Security Concerns**: Read `PASSWORD_RESET_SECURITY_SUMMARY.md`
4. **Code Examples**: Check architecture doc Section 6
5. **Testing**: Check architecture doc Section 8

---

**Last Updated**: 2025-11-21
**Version**: 1.0
**Maintainer**: Development Team
