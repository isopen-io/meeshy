# Password Reset Deployment Guide

**Version**: 1.0
**Last Updated**: 2025-11-21

---

## Pre-Deployment Checklist

### 1. Database Setup

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway

# Generate Prisma client
npx prisma generate --schema=../shared/schema.prisma

# Push schema changes to database
npx prisma db push --schema=../shared/schema.prisma

# Verify collections were created
# Check MongoDB for these new collections:
# - password_reset_tokens
# - password_history
# - security_events
# - user_sessions
```

### 2. Environment Variables

Update `.env.local` or `.env.production`:

```bash
# Required
HCAPTCHA_SECRET=your-hcaptcha-secret-key
HCAPTCHA_SITE_KEY=your-hcaptcha-site-key
EMAIL_PROVIDER=sendgrid  # or mailgun
SENDGRID_API_KEY=your-sendgrid-api-key
FRONTEND_URL=https://meeshy.me

# Optional but recommended
GEOIP_LICENSE_KEY=your-maxmind-license-key
MAXMIND_ACCOUNT_ID=your-maxmind-account-id
SECURITY_ADMIN_EMAILS=security@meeshy.me,admin@meeshy.me

# Development only
BYPASS_CAPTCHA=false  # NEVER set to true in production
```

### 3. Service Accounts

**hCaptcha** (https://www.hcaptcha.com/):
1. Create account
2. Create new site
3. Get Site Key and Secret Key
4. Add to environment variables

**SendGrid** or **Mailgun**:
1. Create account
2. Verify sender email (noreply@meeshy.me)
3. Get API key
4. Add to environment variables

**MaxMind GeoIP2** (Optional):
1. Create free account at https://www.maxmind.com/en/geolite2/signup
2. Generate license key
3. Add to environment variables

---

## Server Integration

### Step 1: Register Routes

In your main server file (`src/server.ts` or similar):

```typescript
import { passwordResetRoutes } from './routes/password-reset';
import { BackgroundJobsManager } from './jobs';

// After other route registrations
await fastify.register(passwordResetRoutes, { prefix: '/auth' });

// Initialize background jobs
const jobsManager = new BackgroundJobsManager(fastify.prisma);
jobsManager.startAll();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  jobsManager.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  jobsManager.stopAll();
  process.exit(0);
});
```

### Step 2: Verify Routes

```bash
# Start server
npm run dev

# Check routes are registered
curl http://localhost:4000/auth/forgot-password
# Should return 400 (missing required fields)

curl http://localhost:4000/auth/reset-password
# Should return 400 (missing required fields)
```

---

## Testing

### Unit Tests

```bash
npm test -- password-reset.service.test.ts
```

### Integration Tests

Create test user:
```sql
-- In MongoDB
db.users.insertOne({
  email: "test@example.com",
  username: "testuser",
  firstName: "Test",
  lastName: "User",
  password: "$2a$12$..." // bcrypt hash of "OldPassword123!"
  emailVerifiedAt: new Date(),
  isActive: true,
  role: "USER",
  createdAt: new Date()
});
```

Test flow:
```bash
# 1. Request reset
curl -X POST http://localhost:4000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "captchaToken": "test-token-or-bypass-if-dev"
  }'

# 2. Check email inbox for reset link

# 3. Extract token from email URL

# 4. Complete reset
curl -X POST http://localhost:4000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TOKEN_FROM_EMAIL",
    "newPassword": "NewSecurePassword123!",
    "confirmPassword": "NewSecurePassword123!"
  }'

# 5. Verify password changed
# Try logging in with new password
```

---

## Monitoring Setup

### 1. Security Event Monitoring

Query security events:
```javascript
// MongoDB
db.security_events.find({
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
}).sort({ createdAt: -1 }).limit(100);
```

### 2. Alert Configuration

Configure admin emails in environment:
```bash
SECURITY_ADMIN_EMAILS=security@meeshy.me,admin@meeshy.me
```

### 3. Metrics Dashboard

Add metrics endpoint (optional):
```typescript
// In routes/admin/security.ts
fastify.get('/admin/security/password-reset/metrics', {
  preValidation: [fastify.authenticate, requireAdmin]
}, async (request, reply) => {
  const securityMonitor = new SecurityMonitor(fastify.prisma);
  const metrics = await securityMonitor.getMetrics(24);
  return reply.send(metrics);
});
```

---

## Production Deployment

### Step 1: Build

```bash
cd gateway
npm run build
```

### Step 2: Environment Check

```bash
# Verify all required environment variables
node -e "
const required = ['HCAPTCHA_SECRET', 'EMAIL_PROVIDER', 'SENDGRID_API_KEY', 'FRONTEND_URL'];
required.forEach(key => {
  if (!process.env[key]) console.error(\`Missing: \${key}\`);
});
"
```

### Step 3: Database Migration

```bash
# In production
NODE_ENV=production npx prisma db push --schema=../shared/schema.prisma
```

### Step 4: Start Server

```bash
NODE_ENV=production npm start
```

### Step 5: Smoke Tests

```bash
# Test forgot-password endpoint
curl -X POST https://api.meeshy.me/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","captchaToken":"test"}'

# Should return 200 OK with generic message
```

---

## Rollback Procedure

If issues are discovered:

### Immediate Actions

1. **Disable endpoints temporarily**:
```typescript
// In password-reset.ts
fastify.post('/forgot-password', async (request, reply) => {
  return reply.status(503).send({
    success: false,
    error: 'Password reset temporarily unavailable. Please contact support.'
  });
});
```

2. **Revoke all active reset tokens**:
```javascript
// MongoDB
db.password_reset_tokens.updateMany(
  { usedAt: null, isRevoked: false },
  { $set: { isRevoked: true, revokedReason: 'EMERGENCY_DISABLE' } }
);
```

3. **Notify users**:
```bash
# Send email to active users
# "Password reset feature temporarily unavailable"
```

### Investigation

1. Check security event logs
2. Review error logs
3. Check rate limiting metrics
4. Verify CAPTCHA service status
5. Check email service status

### Recovery

1. Fix identified issues
2. Test in staging environment
3. Gradual rollout (canary deployment)
4. Monitor metrics closely

---

## Post-Deployment Verification

### Checklist

- [ ] Database migrations applied successfully
- [ ] All environment variables configured
- [ ] Routes registered and responding
- [ ] Background jobs running
- [ ] CAPTCHA verification working
- [ ] Email sending working
- [ ] Rate limiting functional
- [ ] Security events logging
- [ ] Admin alerts configured
- [ ] Monitoring dashboard accessible
- [ ] All smoke tests passing
- [ ] Documentation updated

### Monitoring Points

**First 24 Hours**:
- Monitor error rates
- Check email delivery rates
- Review security events
- Monitor rate limiting hits
- Check background job execution

**First Week**:
- Review password reset success rates
- Check for anomaly patterns
- Monitor account lockouts
- Review user feedback

---

## Support & Troubleshooting

### Common Issues

**Emails not sending**:
- Check EMAIL_PROVIDER configuration
- Verify API keys
- Check sender email verification
- Review email service logs

**CAPTCHA failing**:
- Verify HCAPTCHA_SECRET is correct
- Check hCaptcha service status
- For dev: Enable BYPASS_CAPTCHA

**Rate limiting too strict**:
- Review Redis connection
- Adjust thresholds if needed
- Check IP extraction logic

**Background jobs not running**:
- Verify BackgroundJobsManager.startAll() is called
- Check server logs
- Verify Prisma connection

### Contact

- **Security Issues**: security@meeshy.me
- **Technical Support**: support@meeshy.me
- **Documentation**: See PASSWORD_RESET_README.md

---

## Success Metrics

Track these metrics post-deployment:

1. **Password Reset Success Rate**: Target > 95%
2. **Email Delivery Rate**: Target > 98%
3. **CAPTCHA Pass Rate**: Target > 90%
4. **Account Lockout Rate**: Target < 0.1%
5. **Average Reset Time**: Target < 5 minutes
6. **Security Alert Rate**: Monitor for spikes

---

**Deployment Complete!** 🚀

For architecture details, see `SECURE_PASSWORD_RESET_ARCHITECTURE.md`
For usage guide, see `PASSWORD_RESET_README.md`
