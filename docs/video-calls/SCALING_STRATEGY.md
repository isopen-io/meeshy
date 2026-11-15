# Video Call Feature - Scaling Strategy

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Capacity Planning](#capacity-planning)
3. [Horizontal Scaling](#horizontal-scaling)
4. [Performance Optimization](#performance-optimization)
5. [Load Balancing](#load-balancing)
6. [Database Scaling](#database-scaling)
7. [Caching Strategy](#caching-strategy)
8. [CDN & Edge Distribution](#cdn--edge-distribution)
9. [Monitoring & Observability](#monitoring--observability)
10. [Cost Optimization](#cost-optimization)

---

## Executive Summary

This document defines the scaling strategy for the Video Call Feature to support:

- **Target capacity**: 1,000 concurrent calls, 5,000 concurrent participants
- **Growth trajectory**: 3x annual growth over 3 years
- **Performance SLA**: <2s connection establishment, <100ms media routing latency, 99.9% uptime
- **Cost efficiency**: <$0.10 per call-hour at scale

### Scaling Approach
- **Gateway Service**: Horizontal scaling with Socket.IO Redis adapter
- **Media Server**: Horizontal scaling with call-based sharding
- **Database**: MongoDB replica set with read replicas
- **STUN/TURN**: Multi-region deployment with geo-routing

---

## Capacity Planning

### Current Baseline (MVP Launch)

| Component | Capacity | Resources |
|-----------|----------|-----------|
| **Gateway** | 500 concurrent Socket.IO connections | 2 instances × 2 vCPU, 4 GB RAM |
| **Media Server** | 100 concurrent participants (50 calls) | 1 instance × 4 vCPU, 8 GB RAM |
| **MongoDB** | 10K writes/sec, 50K reads/sec | 3-node replica set × 2 vCPU, 8 GB RAM |
| **TURN Server** | 200 concurrent relay sessions | 1 instance × 2 vCPU, 4 GB RAM |

### Target Capacity (Year 1)

| Component | Capacity | Resources |
|-----------|----------|-----------|
| **Gateway** | 5,000 concurrent connections | 5 instances × 2 vCPU, 4 GB RAM |
| **Media Server** | 1,000 concurrent participants (250 calls) | 10 instances × 4 vCPU, 8 GB RAM |
| **MongoDB** | 50K writes/sec, 200K reads/sec | 5-node replica set × 4 vCPU, 16 GB RAM |
| **TURN Server** | 1,000 concurrent relay sessions | 3 instances × 4 vCPU, 8 GB RAM |

### Growth Projections

| Metric | Month 1 | Month 6 | Month 12 | Month 24 | Month 36 |
|--------|---------|---------|----------|----------|----------|
| **Daily active users** | 1,000 | 5,000 | 20,000 | 50,000 | 100,000 |
| **Concurrent calls** | 50 | 200 | 500 | 1,000 | 2,000 |
| **Concurrent participants** | 150 | 600 | 1,500 | 3,000 | 6,000 |
| **Gateway instances** | 2 | 3 | 5 | 8 | 12 |
| **Media Server instances** | 2 | 5 | 10 | 20 | 30 |
| **TURN instances** | 1 | 2 | 3 | 5 | 8 |

### Capacity Calculations

#### Gateway Capacity
- **Connections per instance**: 1,000 concurrent Socket.IO connections
- **Calculation**: 5,000 concurrent participants / 1,000 per instance = **5 instances**

#### Media Server Capacity (SFU)
- **Participants per instance**: 100 concurrent (assumes 25 active calls × 4 avg participants)
- **Bandwidth per instance**: 100 participants × 1.5 Mbps (HD) × 2 (up + down) = **300 Mbps**
- **Calculation**: 5,000 concurrent participants / 100 per instance = **50 instances** (with 20% buffer)

#### Database Capacity
- **Writes**: 100 calls/sec × 20 events/call = **2,000 writes/sec**
- **Reads**: 5,000 active users × 10 queries/sec = **50,000 reads/sec**
- **MongoDB capacity**: 10K writes/sec, 50K reads/sec per replica set → **1 replica set sufficient**

---

## Horizontal Scaling

### Gateway Service Scaling

#### Socket.IO Redis Adapter

**Problem**: Socket.IO rooms are in-memory (single instance) → Can't broadcast across instances

**Solution**: Redis pub/sub adapter

```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Redis adapter for multi-instance Socket.IO
const pubClient = createClient({ url: 'redis://redis:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));

// Now broadcasts work across all Gateway instances
io.to(`call:${callId}`).emit('call:participant-joined', data);
```

**Configuration**:
```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
  volumes:
    - redis-data:/data
  ports:
    - "6379:6379"
```

#### Sticky Sessions (Optional)

**Problem**: Client reconnection might land on different Gateway instance → State loss

**Solution**: Sticky sessions with load balancer

```nginx
# nginx.conf
upstream gateway {
  ip_hash;  # Sticky sessions based on client IP
  server gateway-1:4000;
  server gateway-2:4000;
  server gateway-3:4000;
}

server {
  listen 443 ssl;
  server_name api.meeshy.me;

  location /socket.io/ {
    proxy_pass http://gateway;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

**Alternative**: Client reconnects to any instance (stateless) → Retrieve call state from Redis/DB

### Media Server Scaling

#### Call-based Sharding

**Problem**: mediasoup routers are process-local → Can't span multiple servers

**Solution**: Each call is assigned to a specific Media Server instance

**Algorithm**:
```typescript
// Gateway: Assign call to Media Server
function selectMediaServer(callId: string): string {
  const mediaServers = [
    { id: 'ms-1', url: 'http://media-1:3001', currentLoad: 45 },
    { id: 'ms-2', url: 'http://media-2:3001', currentLoad: 30 },
    { id: 'ms-3', url: 'http://media-3:3001', currentLoad: 60 }
  ];

  // Load balancing strategy: Least-loaded server
  const selectedServer = mediaServers.sort((a, b) => a.currentLoad - b.currentLoad)[0];

  // Store mapping in Redis (cache)
  await redis.set(`call:${callId}:media-server`, selectedServer.id, 'EX', 3600);

  return selectedServer.url;
}

// Get media server for existing call
async function getMediaServerForCall(callId: string): Promise<string> {
  const serverId = await redis.get(`call:${callId}:media-server`);

  if (!serverId) {
    throw new Error('Call not found or expired');
  }

  const server = mediaServers.find(s => s.id === serverId);
  return server.url;
}
```

**Load Metrics**:
- **CPU usage**: <70% (target)
- **Active participants**: <100 per instance
- **Bandwidth**: <500 Mbps per instance

#### Auto-scaling (Kubernetes)

```yaml
# media-server-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: media-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: media-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120
```

### Database Scaling (MongoDB)

#### Read Replicas

**Configuration**:
```yaml
# MongoDB Replica Set
rs.initiate({
  _id: "meeshy-rs",
  members: [
    { _id: 0, host: "mongo-primary:27017", priority: 2 },
    { _id: 1, host: "mongo-secondary-1:27017", priority: 1 },
    { _id: 2, host: "mongo-secondary-2:27017", priority: 1 },
    { _id: 3, host: "mongo-arbiter:27017", arbiterOnly: true }
  ]
})
```

**Prisma read preference**:
```typescript
// Prisma Client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL  // Connection string with read preference
    }
  }
});

// MongoDB connection string with read preference
// DATABASE_URL=mongodb://mongo-primary:27017,mongo-secondary-1:27017,mongo-secondary-2:27017/meeshy?replicaSet=meeshy-rs&readPreference=secondaryPreferred
```

**Query routing**:
- **Writes**: Always to primary
- **Reads** (non-critical): Secondary preferred (call history, transcriptions)
- **Reads** (critical): Primary preferred (active call state)

#### Sharding (Future)

**When to shard**: >50K writes/sec or >500 GB data

**Shard key**: `conversationId` (all call data for a conversation stays on same shard)

```javascript
// MongoDB sharding
sh.enableSharding("meeshy")
sh.shardCollection("meeshy.CallSession", { conversationId: "hashed" })
```

---

## Performance Optimization

### 1. Connection Pooling

**MongoDB connection pool**:
```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Connection pool settings
  log: ['query', 'error', 'warn'],
  errorFormat: 'minimal'
});

// MongoDB driver pool size (set in connection string)
// DATABASE_URL=mongodb://.../?maxPoolSize=50&minPoolSize=10
```

**Redis connection pool**:
```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: 'redis://redis:6379',
  socket: {
    connectTimeout: 5000,
    keepAlive: 5000
  }
});

await redis.connect();
```

### 2. Query Optimization

**Indexes** (see DATA_MODELS.md):
- `CallSession`: `(conversationId, status)`, `(mode, status)`, `(createdAt)`
- `CallParticipant`: `(callSessionId, status)`, `(userId, status)`
- `CallTranscription`: `(callSessionId, timestamp)`, `(participantId, language)`

**Query patterns**:
```typescript
// Good: Use indexes
const activeCalls = await prisma.callSession.findMany({
  where: {
    conversationId: '...',
    status: 'active'
  }
});

// Bad: Full collection scan
const activeCalls = await prisma.callSession.findMany({
  where: {
    endedAt: { equals: null }  // Not indexed
  }
});
```

### 3. WebRTC Optimization

**Codec selection**:
```typescript
// mediasoup router configuration
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      useinbandfec: 1,  // Forward error correction
      usedtx: 1         // Discontinuous transmission (silence suppression)
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,  // Start at 1 Mbps
      'x-google-max-bitrate': 2500,    // Max 2.5 Mbps
      'x-google-min-bitrate': 500      // Min 500 Kbps
    }
  }
];
```

**Simulcast** (adaptive bitrate):
```typescript
// Frontend: Enable simulcast
const videoProducer = await transport.produce({
  kind: 'video',
  track: videoTrack,
  encodings: [
    { maxBitrate: 500000, scaleResolutionDownBy: 4 },   // Low: 180p
    { maxBitrate: 1000000, scaleResolutionDownBy: 2 },  // Medium: 360p
    { maxBitrate: 2500000 }                             // High: 720p
  ],
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
});
```

### 4. Caching

**Redis caching** (see [Caching Strategy](#caching-strategy))

---

## Load Balancing

### Gateway Load Balancing

**Layer 7 (Application) Load Balancer**:
```yaml
# AWS Application Load Balancer (ALB)
LoadBalancer:
  Type: AWS::ElasticLoadBalancingV2::LoadBalancer
  Properties:
    Scheme: internet-facing
    Type: application
    Subnets:
      - subnet-1
      - subnet-2

TargetGroup:
  Type: AWS::ElasticLoadBalancingV2::TargetGroup
  Properties:
    Port: 4000
    Protocol: HTTP
    TargetType: ip
    HealthCheckPath: /health
    HealthCheckIntervalSeconds: 30
    HealthyThresholdCount: 2
    UnhealthyThresholdCount: 3
    Matcher:
      HttpCode: 200

Listener:
  Type: AWS::ElasticLoadBalancingV2::Listener
  Properties:
    LoadBalancerArn: !Ref LoadBalancer
    Port: 443
    Protocol: HTTPS
    Certificates:
      - CertificateArn: arn:aws:acm:...
    DefaultActions:
      - Type: forward
        TargetGroupArn: !Ref TargetGroup
```

**Health Checks**:
```typescript
// Gateway: Health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    socketio: false
  };

  try {
    // Check MongoDB
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;

    // Check Redis
    await redis.ping();
    checks.redis = true;

    // Check Socket.IO
    checks.socketio = io.engine.clientsCount >= 0;

    const allHealthy = Object.values(checks).every(v => v);

    if (allHealthy) {
      res.status(200).json({ status: 'healthy', checks });
    } else {
      res.status(503).json({ status: 'unhealthy', checks });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});
```

### Media Server Load Balancing

**No load balancer** (direct routing from Gateway):
- Gateway assigns calls to specific Media Server instances (call-based sharding)
- Clients connect directly to Media Server (WebRTC UDP)

**DNS round-robin** (for failover):
```
media.meeshy.me → 10.0.1.10 (media-1)
media.meeshy.me → 10.0.1.11 (media-2)
media.meeshy.me → 10.0.1.12 (media-3)
```

### TURN Server Load Balancing

**Geographic load balancing**:
```yaml
# Route53 geo-routing
TurnServerUSWest:
  Type: AWS::Route53::RecordSet
  Properties:
    HostedZoneId: Z123456789
    Name: turn.meeshy.me
    Type: A
    SetIdentifier: turn-us-west
    GeoLocation:
      ContinentCode: NA
    TTL: 60
    ResourceRecords:
      - 34.56.78.90  # TURN server in us-west-2

TurnServerEUWest:
  Type: AWS::Route53::RecordSet
  Properties:
    HostedZoneId: Z123456789
    Name: turn.meeshy.me
    Type: A
    SetIdentifier: turn-eu-west
    GeoLocation:
      ContinentCode: EU
    TTL: 60
    ResourceRecords:
      - 35.67.89.01  # TURN server in eu-west-1
```

---

## Database Scaling

### Indexing Strategy

**Compound indexes** (see DATA_MODELS.md):
```javascript
// MongoDB shell
db.CallSession.createIndex({ conversationId: 1, status: 1, createdAt: -1 })
db.CallParticipant.createIndex({ callSessionId: 1, status: 1 })
db.CallTranscription.createIndex({ callSessionId: 1, timestamp: 1 })
```

### Connection Management

**Prisma middleware** (connection pooling):
```typescript
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();

  // Log slow queries
  if (after - before > 1000) {
    console.warn(`Slow query detected: ${params.model}.${params.action} took ${after - before}ms`);
  }

  return result;
});
```

### Data Archiving

**Archive old calls** (90-day retention):
```typescript
// Cron job: Archive ended calls older than 90 days
async function archiveOldCalls() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const oldCalls = await prisma.callSession.findMany({
    where: {
      status: 'ended',
      endedAt: { lt: ninetyDaysAgo }
    }
  });

  for (const call of oldCalls) {
    // Move to archive collection (or S3)
    await archiveStorage.put(`calls/${call.id}.json`, JSON.stringify(call));

    // Delete from main collection
    await prisma.callSession.delete({ where: { id: call.id } });
  }

  console.log(`Archived ${oldCalls.length} old calls`);
}

// Run daily
cron.schedule('0 2 * * *', archiveOldCalls);  // 2 AM daily
```

---

## Caching Strategy

### Redis Cache Layers

#### 1. Call State Cache

**Cache active call state** (reduce DB reads):
```typescript
// Gateway: Cache call state
async function getCachedCallState(callId: string): Promise<CallSession | null> {
  const cached = await redis.get(`call:${callId}:state`);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss: Fetch from DB
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    include: { participants: true }
  });

  if (call && call.status === 'active') {
    // Cache for 5 minutes
    await redis.set(`call:${callId}:state`, JSON.stringify(call), 'EX', 300);
  }

  return call;
}
```

#### 2. Media Server Mapping Cache

**Cache call → media server mapping**:
```typescript
// Cache media server assignment
await redis.set(`call:${callId}:media-server`, 'media-2', 'EX', 3600);

// Retrieve cached mapping
const mediaServerId = await redis.get(`call:${callId}:media-server`);
```

#### 3. Participant Presence Cache

**Cache active participants**:
```typescript
// Add participant to active set
await redis.sadd(`call:${callId}:participants`, participantId);

// Get all active participants
const participants = await redis.smembers(`call:${callId}:participants`);

// Remove participant
await redis.srem(`call:${callId}:participants`, participantId);

// Set expiration (auto-cleanup after call ends)
await redis.expire(`call:${callId}:participants`, 7200);  // 2 hours
```

#### 4. Translation Cache

**Cache translations** (reduce Translator Service load):
```typescript
// Cache key: hash of (text, from_lang, to_lang)
const cacheKey = `translation:${hashString(`${text}:${fromLang}:${toLang}`)}`;

const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const translation = await translatorService.translate({ text, from: fromLang, to: toLang });

// Cache for 7 days
await redis.set(cacheKey, JSON.stringify(translation), 'EX', 604800);

return translation;
```

---

## CDN & Edge Distribution

### Static Asset CDN

**CloudFlare/Cloudfront for frontend**:
```typescript
// next.config.js
module.exports = {
  images: {
    domains: ['cdn.meeshy.me']
  },
  assetPrefix: process.env.NODE_ENV === 'production' ? 'https://cdn.meeshy.me' : ''
};
```

### STUN/TURN Edge Deployment

**Multi-region TURN servers**:
```
turn-us-west.meeshy.me → 34.56.78.90 (Oregon, US)
turn-us-east.meeshy.me → 35.67.89.01 (Virginia, US)
turn-eu-west.meeshy.me → 34.89.12.34 (Ireland, EU)
turn-ap-southeast.meeshy.me → 35.90.23.45 (Singapore, AP)
```

**Client-side region selection**:
```typescript
// Frontend: Select nearest TURN server
async function getNearestTurnServer(): Promise<string> {
  // Get user's region from IP (CloudFlare CF-IPCountry header)
  const region = await fetch('/api/region').then(r => r.json());

  const turnServers = {
    'NA': 'turn-us-west.meeshy.me',
    'EU': 'turn-eu-west.meeshy.me',
    'AS': 'turn-ap-southeast.meeshy.me',
    'default': 'turn-us-west.meeshy.me'
  };

  return turnServers[region.continent] || turnServers.default;
}
```

---

## Monitoring & Observability

### Key Metrics

#### Application Metrics (Prometheus)

```typescript
// Gateway: Prometheus metrics
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Call metrics
const callsTotal = new Counter({
  name: 'meeshy_calls_total',
  help: 'Total number of calls initiated',
  labelNames: ['type', 'conversation_type']
});

const callDuration = new Histogram({
  name: 'meeshy_call_duration_seconds',
  help: 'Call duration in seconds',
  buckets: [60, 300, 600, 1800, 3600, 7200]  // 1min, 5min, 10min, 30min, 1h, 2h
});

const activeParticipants = new Gauge({
  name: 'meeshy_active_participants',
  help: 'Current number of active call participants'
});

// Socket.IO metrics
const socketioConnections = new Gauge({
  name: 'meeshy_socketio_connections',
  help: 'Current number of Socket.IO connections'
});

// Expose /metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Update metrics
callsTotal.inc({ type: 'video', conversation_type: 'group' });
callDuration.observe(durationInSeconds);
activeParticipants.set(currentParticipantCount);
socketioConnections.set(io.engine.clientsCount);
```

#### WebRTC Quality Metrics

```typescript
// Frontend: Collect WebRTC stats
setInterval(async () => {
  const stats = await peerConnection.getStats();

  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      const qualityMetrics = {
        packetsLost: report.packetsLost,
        packetsReceived: report.packetsReceived,
        packetLossRate: report.packetsLost / (report.packetsReceived + report.packetsLost),
        jitter: report.jitter,
        bytesReceived: report.bytesReceived,
        framesDecoded: report.framesDecoded,
        frameWidth: report.frameWidth,
        frameHeight: report.frameHeight
      };

      // Send to analytics
      fetch('/api/calls/:callId/quality-metrics', {
        method: 'POST',
        body: JSON.stringify(qualityMetrics)
      });
    }
  });
}, 10000);  // Every 10 seconds
```

### Alerting Rules (Prometheus Alertmanager)

```yaml
# alerts.yml
groups:
  - name: video_calls
    interval: 30s
    rules:
      - alert: HighCallFailureRate
        expr: rate(meeshy_calls_failed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High call failure rate: {{ $value }}"

      - alert: MediaServerHighCPU
        expr: rate(process_cpu_seconds_total{job="media-server"}[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Media server CPU high: {{ $value }}"

      - alert: DatabaseSlowQueries
        expr: histogram_quantile(0.95, rate(prisma_query_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database queries slow (p95: {{ $value }}s)"
```

### Distributed Tracing (Jaeger)

```typescript
import { initTracer } from 'jaeger-client';

const tracer = initTracer({
  serviceName: 'meeshy-gateway',
  sampler: {
    type: 'probabilistic',
    param: 0.1  // Sample 10% of traces
  }
}, {
  logger: console
});

// Trace call flow
socket.on('call:initiate', async (data) => {
  const span = tracer.startSpan('call:initiate');
  span.setTag('conversationId', data.conversationId);

  try {
    const call = await createCall(data);
    span.log({ event: 'call_created', callId: call.id });

    // Child span for media server interaction
    const childSpan = tracer.startSpan('media_server:create_router', { childOf: span });
    await mediaServerClient.createRouter(call.id);
    childSpan.finish();

    span.setTag('http.status_code', 201);
  } catch (error) {
    span.setTag('error', true);
    span.log({ event: 'error', message: error.message });
  } finally {
    span.finish();
  }
});
```

---

## Cost Optimization

### Cost Breakdown (1000 concurrent participants)

| Component | Resources | Monthly Cost (AWS) | Notes |
|-----------|-----------|-------------------|-------|
| **Gateway** (5 instances) | t3.medium × 5 | $185 | (5 × $37/month) |
| **Media Server** (10 instances) | c5.xlarge × 10 | $1,530 | (10 × $153/month) |
| **MongoDB** (3-node replica) | r5.large × 3 | $450 | (3 × $150/month) |
| **Redis** (1 instance) | r5.large × 1 | $150 | Cache + Socket.IO adapter |
| **TURN** (3 instances) | c5.large × 3 | $306 | (3 × $102/month) |
| **Data transfer** | ~20 TB/month | $1,800 | ($0.09/GB egress) |
| **Total** | | **$4,421/month** | |
| **Cost per participant-hour** | | **$0.15** | (4421 / (1000 × 720h/month)) |

### Cost Optimization Strategies

#### 1. P2P for 2-person calls
- **Savings**: 70-80% of calls use P2P (no media server cost)
- **Impact**: Reduces Media Server instances from 50 → 10 (~$3,000/month savings)

#### 2. Spot instances (Media Server)
- **Discount**: 60-70% off on-demand price
- **Savings**: $1,530 → $450/month (~$1,080/month savings)
- **Risk**: Instance termination (mitigate with graceful shutdown, call migration)

#### 3. Reserved instances (Gateway, Database)
- **Discount**: 40% off on-demand price
- **Savings**: $635 → $380/month (~$255/month savings)

#### 4. Data transfer optimization
- **CDN**: Cache static assets (reduce data transfer)
- **Compression**: Enable gzip/brotli compression
- **Regional distribution**: Keep traffic within region (avoid cross-region costs)

#### 5. Auto-scaling
- **Scale down**: Off-peak hours (nights, weekends)
- **Savings**: 30% reduction in compute costs (~$600/month)

**Optimized cost**:
- **Original**: $4,421/month
- **With optimizations**: $4,421 - $3,000 - $1,080 - $255 - $600 = **~$1,486/month**
- **Cost per participant-hour**: **$0.05**

---

## Performance Benchmarks

### Target SLAs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Call connection time** | <2s (p95) | Time from call:join → media flowing |
| **Media latency** (P2P) | <100ms (p95) | RTT between peers |
| **Media latency** (SFU) | <150ms (p95) | RTT via media server |
| **Transcription latency** (client) | <500ms (p95) | Speech → subtitle display |
| **Transcription latency** (server) | <1.2s (p95) | Speech → subtitle display |
| **Mode switch duration** | <2s (p95) | P2P ↔ SFU migration |
| **API response time** | <200ms (p95) | REST API calls |
| **Socket.IO latency** | <50ms (p95) | Event delivery |
| **Uptime** | 99.9% | Monthly uptime |

### Load Testing

**Artillery load test** (Gateway):
```yaml
# load-test.yml
config:
  target: "https://api.meeshy.me"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Spike"
  socketio:
    transports: ["websocket"]

scenarios:
  - name: "Socket.IO connection + call join"
    engine: socketio
    flow:
      - emit:
          channel: "authenticate"
          data:
            token: "{{ $randomString() }}"
      - think: 2
      - emit:
          channel: "call:join"
          data:
            callId: "{{ $randomString() }}"
      - think: 60
      - emit:
          channel: "call:leave"
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Draft for Review
