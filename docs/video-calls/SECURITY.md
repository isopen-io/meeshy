# Video Call Feature - Security Architecture

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Threat Model](#threat-model)
3. [WebRTC Security](#webrtc-security)
4. [Signaling Security](#signaling-security)
5. [Authentication & Authorization](#authentication--authorization)
6. [Media Server Security](#media-server-security)
7. [STUN/TURN Security](#stunturn-security)
8. [Data Privacy](#data-privacy)
9. [OWASP Top 10 Mitigation](#owasp-top-10-mitigation)
10. [Security Checklist](#security-checklist)

---

## Executive Summary

This document defines the security architecture for the Video Call Feature, addressing:
- **Confidentiality**: End-to-end encryption (P2P), secure routing (SFU)
- **Integrity**: Signaling validation, SDP sanitization, tamper detection
- **Availability**: DDoS mitigation, rate limiting, circuit breakers
- **Privacy**: GDPR compliance, minimal data collection, secure deletion
- **Anonymous Security**: Secure share links, limited permissions

### Security Posture
- **WebRTC**: DTLS-SRTP (mandatory encryption)
- **Signaling**: WSS (WebSocket Secure), JWT authentication
- **API**: HTTPS only, JWT bearer tokens, rate limiting
- **Database**: Encrypted at rest, audit logs
- **STUN/TURN**: Authentication, short-lived credentials
- **Transcriptions**: TLS in transit, encryption at rest, 30-day retention

---

## Threat Model

### Assets
1. **Audio/Video streams**: Real-time media (confidential)
2. **Transcriptions**: Speech-to-text content (sensitive, may contain PII)
3. **Call metadata**: Participants, timestamps, duration (privacy-sensitive)
4. **Signaling data**: SDP offers/answers, ICE candidates (can reveal IP addresses)
5. **Session tokens**: JWT (authenticated users), session tokens (anonymous)
6. **User identity**: UserID, AnonymousParticipantID

### Threat Actors
| Actor | Motivation | Capability | Likelihood |
|-------|------------|------------|------------|
| **Eavesdropper** | Intercept calls, steal data | Network sniffing, MITM | High |
| **Malicious participant** | Disrupt call, DoS attack | Join call, spam signaling | Medium |
| **Anonymous abuser** | Join calls without permission, spam | Access share links | Medium |
| **Compromised server** | Data exfiltration | Server access, database dump | Low |
| **Nation-state actor** | Surveillance, targeted attacks | Advanced persistent threat | Very Low |

### Attack Vectors
1. **MITM (Man-in-the-Middle)**: Intercept signaling or media
2. **Replay attacks**: Reuse old ICE candidates or SDP offers
3. **Signaling injection**: Inject malicious SDP, forge participant identity
4. **DoS (Denial of Service)**: Flood server with connection requests
5. **Call hijacking**: Join call without permission, impersonate participant
6. **Transcription leakage**: Intercept or access stored transcriptions
7. **Share link abuse**: Brute-force share links, exhaust max uses

---

## WebRTC Security

### 1. Mandatory Encryption (DTLS-SRTP)

**Requirement**: All WebRTC media MUST be encrypted.

#### P2P Mode
- **DTLS**: Datagram Transport Layer Security for key exchange
- **SRTP**: Secure Real-time Transport Protocol for media encryption
- **Cipher suites**: AES-128-GCM (preferred), AES-256-GCM

**Configuration**:
```typescript
const peerConnection = new RTCPeerConnection({
  iceServers: [/* STUN/TURN servers */],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',      // Bundle media on single port
  rtcpMuxPolicy: 'require',         // Multiplex RTP and RTCP
  iceTransportPolicy: 'all',        // Use both STUN and TURN
  // Enforce DTLS-SRTP (default in modern browsers)
});
```

#### SFU Mode (mediasoup)
- **DTLS-SRTP**: mediasoup enforces DTLS-SRTP by default
- **Certificate rotation**: Generate new DTLS certificates per router

**mediasoup configuration**:
```typescript
const worker = await mediasoup.createWorker({
  dtlsCertificateFile: undefined,  // Auto-generate per worker
  dtlsPrivateKeyFile: undefined
});
```

### 2. Certificate Validation

**Prevent MITM**:
- **DTLS fingerprint verification**: Validate DTLS fingerprint in SDP
- **Certificate pinning**: Not required (DTLS uses self-signed certs, fingerprint is verified via signaling)

**Frontend validation**:
```typescript
peerConnection.addEventListener('connectionstatechange', () => {
  if (peerConnection.connectionState === 'connected') {
    // Verify DTLS fingerprint matches SDP
    const stats = await peerConnection.getStats();
    const certificate = stats.get('certificate');
    console.log('DTLS fingerprint:', certificate.fingerprint);
  }
});
```

### 3. SDP Sanitization

**Threat**: Malicious SDP can reveal private IPs, inject STUN servers

**Mitigation**:
```typescript
// Gateway: Sanitize SDP before relay
function sanitizeSDP(sdp: string): string {
  // Remove private IP candidates (192.168.x.x, 10.x.x.x)
  sdp = sdp.replace(/a=candidate:.*?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])).*?\r\n/g, '');

  // Remove IPv6 local addresses (fe80::)
  sdp = sdp.replace(/a=candidate:.*?fe80:.*?\r\n/g, '');

  // Validate STUN/TURN server URLs (whitelist)
  const allowedStunServers = ['stun.meeshy.me', 'turn.meeshy.me'];
  // ... validation logic

  return sdp;
}
```

**Gateway enforcement**:
- Validate SDP schema (JSON Schema validation)
- Reject SDP with unknown attributes
- Log suspicious SDP patterns

### 4. ICE Candidate Filtering

**Threat**: Attackers inject malicious ICE candidates to leak IPs

**Mitigation**:
```typescript
// Frontend: Filter ICE candidates before sending
peerConnection.addEventListener('icecandidate', (event) => {
  if (event.candidate) {
    const candidate = event.candidate.candidate;

    // Only send relay (TURN) candidates for enhanced privacy
    if (candidate.includes('typ relay')) {
      socket.emit('call:signal', {
        signal: { type: 'ice-candidate', candidate: event.candidate }
      });
    } else {
      console.log('Filtered non-relay candidate:', candidate);
    }
  }
});
```

**Trade-off**: Filtering all but relay candidates hides IPs but increases TURN server load.

---

## Signaling Security

### 1. WebSocket Security (WSS)

**Requirement**: All Socket.IO connections MUST use WSS (WebSocket Secure).

**nginx configuration**:
```nginx
server {
  listen 443 ssl http2;
  server_name api.meeshy.me;

  ssl_certificate /etc/letsencrypt/live/meeshy.me/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/meeshy.me/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';

  location /socket.io/ {
    proxy_pass http://gateway:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### 2. Authentication (JWT)

**Authenticated users**:
```typescript
// Frontend: Send JWT after Socket.IO connection
socket.on('connect', () => {
  const jwt = localStorage.getItem('authToken');
  socket.emit('authenticate', { token: jwt });
});

// Gateway: Verify JWT
socket.on('authenticate', async (data) => {
  try {
    const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.emit('authenticated', { success: true });
  } catch (error) {
    socket.emit('authenticated', { success: false, error: 'Invalid token' });
    socket.disconnect();
  }
});
```

**Anonymous users**:
```typescript
// Session token from ConversationShareLink
socket.emit('authenticate', { sessionToken: anonymousSessionToken });

// Gateway: Verify session token
const anonymousParticipant = await prisma.anonymousParticipant.findUnique({
  where: { sessionToken: data.sessionToken }
});

if (!anonymousParticipant || !anonymousParticipant.isActive) {
  socket.emit('authenticated', { success: false, error: 'Invalid session' });
  socket.disconnect();
}
```

### 3. Rate Limiting

**Prevent DoS attacks**:
```typescript
import rateLimit from 'express-rate-limit';

// REST API rate limiting
const callApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/calls', callApiLimiter);

// Socket.IO rate limiting (per user)
const socketRateLimiter = new Map<string, { count: number, resetAt: number }>();

socket.on('call:signal', (data) => {
  const userId = socket.userId;
  const now = Date.now();
  const limit = socketRateLimiter.get(userId) || { count: 0, resetAt: now + 60000 };

  if (now > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = now + 60000;
  }

  if (limit.count > 100) {
    socket.emit('call:error', { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many signals' });
    return;
  }

  limit.count++;
  socketRateLimiter.set(userId, limit);

  // Process signal...
});
```

### 4. Input Validation

**Validate all Socket.IO events**:
```typescript
import { z } from 'zod';

const CallSignalSchema = z.object({
  callId: z.string().regex(/^[a-f\d]{24}$/i),
  targetParticipantId: z.string().regex(/^[a-f\d]{24}$/i),
  signal: z.object({
    type: z.enum(['offer', 'answer', 'ice-candidate']),
    sdp: z.string().max(10000).optional(),
    candidate: z.any().optional()
  })
});

socket.on('call:signal', async (data) => {
  try {
    const validated = CallSignalSchema.parse(data);
    // Process validated data...
  } catch (error) {
    socket.emit('call:error', { code: 'INVALID_INPUT', message: error.message });
  }
});
```

---

## Authentication & Authorization

### 1. Conversation Access Control

**Verify user can access conversation**:
```typescript
async function canAccessCall(userId: string, callId: string): Promise<boolean> {
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    include: {
      conversation: {
        include: {
          members: { where: { userId, isActive: true } }
        }
      }
    }
  });

  if (!call) return false;

  // Check conversation membership
  const isMember = call.conversation.members.length > 0;

  // Check conversation type supports video calls
  const allowedTypes = ['direct', 'group'];
  const typeAllowed = allowedTypes.includes(call.conversation.type);

  return isMember && typeAllowed;
}
```

### 2. Anonymous Participant Permissions

**ConversationShareLink validation**:
```typescript
async function validateAnonymousAccess(
  anonymousUserId: string,
  conversationId: string
): Promise<{ allowed: boolean, permissions: any }> {
  const anonymousParticipant = await prisma.anonymousParticipant.findFirst({
    where: {
      id: anonymousUserId,
      conversationId,
      isActive: true
    },
    include: {
      shareLink: true
    }
  });

  if (!anonymousParticipant) {
    return { allowed: false, permissions: null };
  }

  const shareLink = anonymousParticipant.shareLink;

  // Check link expiration
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
    return { allowed: false, permissions: null };
  }

  // Check max uses
  if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
    return { allowed: false, permissions: null };
  }

  // Check concurrent users
  if (shareLink.maxConcurrentUsers && shareLink.currentConcurrentUsers >= shareLink.maxConcurrentUsers) {
    return { allowed: false, permissions: null };
  }

  return {
    allowed: true,
    permissions: {
      canSendMessages: anonymousParticipant.canSendMessages,
      canSendFiles: anonymousParticipant.canSendFiles,
      canSendImages: anonymousParticipant.canSendImages,
      // Video calls: always allowed if link is active
      canJoinVideoCall: true
    }
  };
}
```

### 3. Call Participant Authorization

**Verify user is call participant**:
```typescript
async function isCallParticipant(userId: string, callId: string): Promise<boolean> {
  const participant = await prisma.callParticipant.findFirst({
    where: {
      callSessionId: callId,
      OR: [
        { userId },
        { anonymousUserId: userId }  // Support anonymous
      ],
      status: { in: ['connecting', 'connected'] }
    }
  });

  return !!participant;
}

// Middleware: Protect Socket.IO events
socket.on('call:signal', async (data) => {
  const isAuthorized = await isCallParticipant(socket.userId, data.callId);

  if (!isAuthorized) {
    socket.emit('call:error', { code: 'PERMISSION_DENIED', message: 'Not a call participant' });
    return;
  }

  // Process signal...
});
```

---

## Media Server Security

### 1. Gateway ↔ Media Server Authentication

**Shared secret authentication**:
```typescript
// Media Server: Verify requests from Gateway
import crypto from 'crypto';

function verifyGatewayRequest(req: Request): boolean {
  const signature = req.headers['x-meeshy-signature'];
  const timestamp = req.headers['x-meeshy-timestamp'];
  const body = JSON.stringify(req.body);

  // Reject old requests (prevent replay attacks)
  if (Date.now() - parseInt(timestamp) > 60000) {
    return false;
  }

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.MEDIA_SERVER_SECRET)
    .update(timestamp + body)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

app.post('/routers', (req, res) => {
  if (!verifyGatewayRequest(req)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Create router...
});
```

### 2. Transport Security

**Limit transport creation**:
```typescript
// Media Server: Rate limit transport creation per callId
const transportLimits = new Map<string, number>();

app.post('/routers/:routerId/transports', (req, res) => {
  const { callId } = req.body;
  const count = transportLimits.get(callId) || 0;

  if (count > 200) {  // Max 100 participants × 2 transports (send + receive)
    return res.status(429).json({ error: 'Transport limit exceeded' });
  }

  transportLimits.set(callId, count + 1);

  // Create transport...
});
```

### 3. Resource Limits

**Prevent resource exhaustion**:
```typescript
// mediasoup worker configuration
const worker = await mediasoup.createWorker({
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 10100,  // Limit port range
  maxRtpPorts: 100,   // Max 50 participants (2 ports each)
  maxSendBitrate: 5000000  // 5 Mbps per producer
});

// Router limits
const router = await worker.createRouter({
  mediaCodecs: [/* ... */]
});

// Max producers per router
let producerCount = 0;
const MAX_PRODUCERS = 200;  // 50 participants × 4 tracks (audio, video, screen × 2)

// Before creating producer
if (producerCount >= MAX_PRODUCERS) {
  throw new Error('Router at capacity');
}
```

---

## STUN/TURN Security

### 1. TURN Authentication

**Short-lived credentials** (recommended):
```typescript
import crypto from 'crypto';

function generateTurnCredentials(username: string, ttl: number = 3600): { username: string, credential: string } {
  const timestamp = Math.floor(Date.now() / 1000) + ttl;
  const turnUsername = `${timestamp}:${username}`;

  // HMAC-SHA1 signature
  const credential = crypto
    .createHmac('sha1', process.env.TURN_SECRET)
    .update(turnUsername)
    .digest('base64');

  return { username: turnUsername, credential };
}

// REST API: Generate credentials on call initiation
app.post('/api/calls', async (req, res) => {
  const call = await createCall(req.body);

  // Generate TURN credentials (valid for 1 hour)
  const turnCredentials = generateTurnCredentials(req.user.id, 3600);

  res.json({
    call,
    iceServers: [
      { urls: 'stun:stun.meeshy.me:3478' },
      {
        urls: 'turn:turn.meeshy.me:3478',
        username: turnCredentials.username,
        credential: turnCredentials.credential
      }
    ]
  });
});
```

**Coturn configuration** (`/etc/turnserver.conf`):
```conf
# Use long-term credential mechanism
lt-cred-mech
use-auth-secret
static-auth-secret=YOUR_TURN_SECRET

# Limit sessions
max-bps=1000000  # 1 Mbps per session
user-quota=100   # Max 100 sessions per user

# Security
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

# TLS
tls-listening-port=5349
cert=/etc/letsencrypt/live/turn.meeshy.me/fullchain.pem
pkey=/etc/letsencrypt/live/turn.meeshy.me/privkey.pem
```

### 2. STUN/TURN Server Whitelisting

**Frontend**: Only use whitelisted STUN/TURN servers:
```typescript
const allowedIceServers = [
  { urls: 'stun:stun.meeshy.me:3478' },
  { urls: 'stun:stun.l.google.com:19302' },  // Google STUN (public)
  {
    urls: ['turn:turn.meeshy.me:3478', 'turn:turn.meeshy.me:5349'],
    username: turnUsername,
    credential: turnCredential
  }
];

const peerConnection = new RTCPeerConnection({
  iceServers: allowedIceServers
});
```

---

## Data Privacy

### 1. GDPR Compliance

**Right to Erasure (Art. 17)**:
```typescript
async function deleteUserCallData(userId: string) {
  // 1. Anonymize CallParticipant records
  await prisma.callParticipant.updateMany({
    where: { userId },
    data: {
      userId: null,
      deviceInfo: null,
      qualityMetrics: null
    }
  });

  // 2. Delete transcriptions
  const participantIds = await prisma.callParticipant.findMany({
    where: { userId },
    select: { id: true }
  });

  await prisma.callTranscription.deleteMany({
    where: { participantId: { in: participantIds.map(p => p.id) } }
  });

  // 3. Delete recordings
  const recordings = await prisma.callRecording.findMany({
    where: { requestedBy: userId }
  });

  for (const recording of recordings) {
    await objectStorage.delete(recording.filePath);
    await prisma.callRecording.update({
      where: { id: recording.id },
      data: { status: 'deleted', deletedAt: new Date() }
    });
  }
}
```

**Data Minimization**:
- **Don't store**: Raw audio/video (unless recording explicitly enabled)
- **Hash IPs**: `deviceInfo.ipAddress = hashIP(realIP)` (one-way hash)
- **Aggregate metrics**: Store averages, not raw packet captures

### 2. Encryption at Rest

**MongoDB encryption**:
```yaml
# mongod.conf
security:
  enableEncryption: true
  encryptionKeyFile: /etc/mongodb/encryption-key
```

**Application-level encryption** (for transcriptions):
```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.TRANSCRIPTION_ENCRYPTION_KEY, 'hex');

function encryptTranscription(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptTranscription(encryptedText: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}
```

### 3. Audit Logging

**Log security-sensitive events**:
```typescript
enum AuditEventType {
  CALL_INITIATED = 'call_initiated',
  CALL_JOINED = 'call_joined',
  CALL_LEFT = 'call_left',
  CALL_ENDED = 'call_ended',
  MODE_SWITCHED = 'mode_switched',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded'
}

async function logAuditEvent(
  eventType: AuditEventType,
  userId: string | null,
  callId: string | null,
  metadata: any
) {
  await prisma.auditLog.create({
    data: {
      eventType,
      userId,
      callId,
      metadata: JSON.stringify(metadata),
      ipAddress: hashIP(metadata.ipAddress),  // Hash IP
      userAgent: metadata.userAgent,
      timestamp: new Date()
    }
  });
}

// Example usage
socket.on('call:join', async (data) => {
  await logAuditEvent(
    AuditEventType.CALL_JOINED,
    socket.userId,
    data.callId,
    { ipAddress: socket.handshake.address, userAgent: socket.handshake.headers['user-agent'] }
  );
});
```

---

## OWASP Top 10 Mitigation

| OWASP Risk | Mitigation |
|------------|------------|
| **A01: Broken Access Control** | JWT authentication, conversation membership checks, participant authorization |
| **A02: Cryptographic Failures** | DTLS-SRTP (WebRTC), WSS (signaling), HTTPS (REST), encryption at rest (transcriptions) |
| **A03: Injection** | Input validation (Zod schemas), SDP sanitization, parameterized queries (Prisma) |
| **A04: Insecure Design** | Threat modeling, security ADRs, least privilege, defense in depth |
| **A05: Security Misconfiguration** | Secure defaults, HTTPS-only, CSP headers, HSTS, no debug logs in production |
| **A06: Vulnerable Components** | Automated dependency updates (Dependabot), npm audit, mediasoup updates |
| **A07: Authentication Failures** | JWT secret rotation, short-lived TURN credentials, session token validation |
| **A08: Software & Data Integrity** | Code signing, immutable Docker images, audit logs, GDPR compliance |
| **A09: Security Logging Failures** | Audit logs, Prometheus metrics, alert on suspicious activity (rate limits, failed auth) |
| **A10: Server-Side Request Forgery (SSRF)** | Whitelist STUN/TURN servers, validate ICE candidates, no user-controlled URLs |

---

## Security Checklist

### Pre-Deployment
- [ ] All API endpoints use HTTPS
- [ ] Socket.IO uses WSS (no fallback to HTTP)
- [ ] JWT secret is strong (256-bit) and rotated regularly
- [ ] TURN server uses authentication (short-lived credentials)
- [ ] SDP sanitization enabled
- [ ] Rate limiting configured (REST + Socket.IO)
- [ ] Input validation on all events
- [ ] MongoDB encryption at rest enabled
- [ ] Transcription encryption at rest enabled
- [ ] GDPR deletion scripts tested
- [ ] Audit logging enabled
- [ ] Security headers configured (CSP, HSTS, X-Frame-Options)

### Post-Deployment
- [ ] Monitor failed authentication attempts (alert if >100/hour)
- [ ] Monitor rate limit triggers (alert if >1000/hour)
- [ ] Monitor unauthorized call access attempts
- [ ] Review audit logs weekly
- [ ] Security dependency updates (npm audit, Dependabot)
- [ ] Penetration testing (quarterly)
- [ ] GDPR compliance audit (annual)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Draft for Review
