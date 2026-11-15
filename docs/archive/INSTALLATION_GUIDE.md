# Installation Guide - Backend Security Improvements

This guide will help you install and deploy the backend security improvements.

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
npm install isomorphic-dompurify ioredis pino pino-pretty zod
```

### 2. Apply Database Migration

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
npx prisma migrate dev --name add_notification_indexes_and_fields
npx prisma generate
```

### 3. Update Route Registration

Update your main server file (likely `gateway/src/server.ts` or `gateway/src/index.ts`):

```typescript
// REPLACE THIS LINE:
// import { notificationRoutes } from './routes/notifications';

// WITH THIS:
import { notificationRoutes } from './routes/notifications-secured';
```

### 4. Environment Variables

Add to your `.env` file:

```bash
# Logging
LOG_LEVEL=info                    # Options: debug, info, warn, error
LOG_SAMPLING_RATE=0.1             # 10% of debug logs in production

# Redis (optional - uses in-memory fallback if not provided)
REDIS_URL=redis://localhost:6379
```

### 5. Test Installation

```bash
# Run tests
npm test -- NotificationService.test.ts

# Start server
npm run dev

# Check health
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-21T10:00:00Z",
  "uptime": 123,
  "version": "1.0.0",
  "environment": "development"
}
```

## Detailed Installation

### Dependencies Installed

| Package | Version | Purpose |
|---------|---------|---------|
| isomorphic-dompurify | ^2.9.0 | XSS sanitization |
| ioredis | ^5.3.2 | Redis client for distributed rate limiting |
| pino | ^8.16.2 | High-performance structured logging |
| pino-pretty | ^10.2.3 | Pretty-print logs in development |
| zod | ^3.22.4 | Runtime type validation |

### File Structure

```
gateway/
├── src/
│   ├── utils/
│   │   ├── sanitize.ts                  # NEW - XSS sanitization
│   │   ├── rate-limiter.ts              # NEW - Rate limiting
│   │   ├── logger-enhanced.ts           # NEW - Structured logging
│   │   └── circuitBreaker.ts            # NEW - Circuit breaker
│   ├── validation/
│   │   └── notification-schemas.ts      # NEW - Zod schemas
│   ├── routes/
│   │   ├── notifications-secured.ts     # NEW - Secured routes
│   │   └── health.ts                    # NEW - Health checks
│   ├── services/
│   │   └── NotificationService.ts       # MODIFIED - Added sanitization
│   ├── __tests__/
│   │   └── NotificationService.test.ts  # NEW - 20+ tests
│   └── swagger/
│       └── notifications.yaml           # NEW - OpenAPI spec
└── shared/
    └── prisma/
        └── schema.prisma                # MODIFIED - Added indexes
```

## Integration with Existing Code

### Health Checks

Add health routes to your server:

```typescript
// server.ts or index.ts
import { healthRoutes } from './routes/health';

// After other route registrations
await fastify.register(healthRoutes);
```

### Structured Logging

Replace console.log with structured logger:

```typescript
// OLD
console.log('User logged in:', userId);

// NEW
import { enhancedLogger } from './utils/logger-enhanced';
enhancedLogger.info('User logged in', { userId });
```

### Optional: Redis Setup

If you want distributed rate limiting:

```typescript
// server.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Make Redis available to routes
fastify.decorate('redis', redis);

// Graceful shutdown
fastify.addHook('onClose', async () => {
  await redis.quit();
});
```

## Verification Checklist

After installation, verify everything works:

- [ ] Tests pass: `npm test`
- [ ] Server starts: `npm run dev`
- [ ] Health check responds: `curl http://localhost:5000/health`
- [ ] Readiness check responds: `curl http://localhost:5000/health/ready`
- [ ] Notifications endpoint works: `curl -H "Authorization: Bearer <token>" http://localhost:5000/notifications`
- [ ] Rate limiting works: Make 101 requests rapidly, 101st should return 429
- [ ] Logs are structured: Check console output for JSON logs
- [ ] Database indexes created: Check MongoDB with `db.notifications.getIndexes()`

## Troubleshooting

### Issue: Prisma migration fails

**Solution:**
```bash
# Reset database (WARNING: deletes data)
npx prisma migrate reset

# Or apply manually
npx prisma db push
```

### Issue: Redis connection fails

**Solution:** The rate limiter will automatically fall back to in-memory storage. If you want to use Redis, ensure it's running:
```bash
# Start Redis
docker run -d -p 6379:6379 redis:alpine

# Or using brew
brew services start redis
```

### Issue: Tests fail with module not found

**Solution:**
```bash
# Install dev dependencies
npm install --save-dev @types/jest jest ts-jest

# Update jest.config.js if needed
```

### Issue: TypeScript errors in new files

**Solution:**
```bash
# Regenerate Prisma client
npx prisma generate

# Check TypeScript config includes new files
# Ensure tsconfig.json has: "include": ["src/**/*"]
```

## Production Deployment

### 1. Build Application

```bash
npm run build
```

### 2. Run Tests

```bash
npm test
```

### 3. Set Environment Variables

```bash
export NODE_ENV=production
export LOG_LEVEL=info
export LOG_SAMPLING_RATE=0.1
export REDIS_URL=redis://production-redis:6379
```

### 4. Deploy

**Using PM2:**
```bash
pm2 start dist/server.js --name meeshy-gateway
pm2 save
```

**Using Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY shared ./shared
CMD ["node", "dist/server.js"]
```

**Using Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meeshy-gateway
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: gateway
        image: meeshy/gateway:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Monitoring Setup

### Recommended Tools

1. **Logs:** Send structured logs to ELK stack or Datadog
2. **Metrics:** Prometheus + Grafana for metrics
3. **APM:** New Relic or Datadog APM for performance monitoring
4. **Errors:** Sentry for error tracking

### Example Prometheus Metrics

```typescript
// Add to server.ts
import promClient from 'prom-client';

const register = new promClient.Registry();

const notificationCreatedCounter = new promClient.Counter({
  name: 'notifications_created_total',
  help: 'Total notifications created',
  labelNames: ['type', 'priority']
});

const rateLimitHitsCounter = new promClient.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total rate limit hits'
});

register.registerMetric(notificationCreatedCounter);
register.registerMetric(rateLimitHitsCounter);

// Metrics endpoint
fastify.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

## Next Steps

After installation:

1. Review README_BACKEND_IMPROVEMENTS.md for detailed changes
2. Check Swagger documentation at /gateway/src/swagger/notifications.yaml
3. Set up monitoring and alerting
4. Configure log aggregation
5. Test in staging environment before production

## Support

For issues or questions:
- Review README_BACKEND_IMPROVEMENTS.md
- Check test files for usage examples
- Review Swagger documentation for API details

**Installation complete!** ✅
