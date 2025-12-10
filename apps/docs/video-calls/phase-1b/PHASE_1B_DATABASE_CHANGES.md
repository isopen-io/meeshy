# Phase 1B: Database Schema Changes

## Table of Contents
1. [Overview](#overview)
2. [Schema Modifications](#schema-modifications)
3. [Migration Strategy](#migration-strategy)
4. [Data Access Patterns](#data-access-patterns)
5. [Performance Considerations](#performance-considerations)
6. [Rollback Plan](#rollback-plan)

---

## Overview

Phase 1B extends the existing Phase 1A database schema to support SFU mode and automatic P2P ↔ SFU transitions. All changes are **backward compatible** and **additive** (no existing fields removed).

### Design Principles
1. **Backward compatibility**: Existing Phase 1A P2P calls continue to work
2. **Minimal schema changes**: Add only essential fields for SFU support
3. **Performance-first**: Add indexes for new query patterns
4. **GDPR compliance**: Maintain data retention and deletion policies

---

## Schema Modifications

### 1. CallSession Model

**Changes**: Add SFU-specific fields and mode transition tracking.

**Diff**:
```diff
model CallSession {
  id                String              @id @default(auto()) @map("_id") @db.ObjectId
  conversationId    String              @db.ObjectId
  mode              String              // 'p2p' | 'sfu'
  status            String              @default("initiated")
  type              String              // 'video' | 'audio'
  initiatorId       String              @db.ObjectId

+ /// mediasoup router ID (SFU mode only)
+ sfuRoomId         String?
+
+ /// RTP capabilities for SFU mode (JSON encoded)
+ sfuRtpCapabilities Json?
+
+ /// Mode transition tracking
+ lastModeChange    DateTime?
+ modeChangeCount   Int                 @default(0)

  /// Call settings
  settings          Json?

  /// Call lifecycle timestamps
  createdAt         DateTime            @default(now())
  startedAt         DateTime?
  endedAt           DateTime?
  duration          Int?
  endReason         String?
  endedBy           String?             @db.ObjectId
  updatedAt         DateTime            @updatedAt

  // Relations
  conversation      Conversation        @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  initiator         User                @relation("CallInitiator", fields: [initiatorId], references: [id])
  participants      CallParticipant[]
  transcriptions    CallTranscription[]
  recording         CallRecording?
  analytics         CallAnalytics?

  @@index([conversationId])
  @@index([status])
  @@index([createdAt])
  @@index([mode])
  @@index([initiatorId])
+ @@index([sfuRoomId])
+ @@index([mode, status])
}
```

**New Fields**:

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `sfuRoomId` | String | Yes | mediasoup Router ID (only set when mode='sfu') |
| `sfuRtpCapabilities` | Json | Yes | Router RTP capabilities for client negotiation |
| `lastModeChange` | DateTime | Yes | Timestamp of last P2P ↔ SFU transition |
| `modeChangeCount` | Int | No (default: 0) | Number of mode transitions (analytics) |

**New Indexes**:
- `@@index([sfuRoomId])`: Lookup call by Media Server router ID
- `@@index([mode, status])`: Query active calls by mode

---

### 2. CallParticipant Model

**Changes**: Add SFU transport and producer IDs.

**Diff**:
```diff
model CallParticipant {
  id                String              @id @default(auto()) @map("_id") @db.ObjectId
  callSessionId     String              @db.ObjectId
  userId            String?             @db.ObjectId
  anonymousUserId   String?             @db.ObjectId
  role              String              @default("participant")
  status            String              @default("connecting")
  joinedAt          DateTime            @default(now())
  leftAt            DateTime?

  /// Media state
  audioEnabled      Boolean             @default(true)
  videoEnabled      Boolean             @default(true)
  screenShareEnabled Boolean            @default(false)

+ /// SFU-specific identifiers (only in SFU mode)
+ sfuSendTransportId    String?         // mediasoup send transport ID
+ sfuRecvTransportId    String?         // mediasoup receive transport ID
+ sfuAudioProducerId    String?         // mediasoup audio producer ID
+ sfuVideoProducerId    String?         // mediasoup video producer ID
+ sfuScreenProducerId   String?         // mediasoup screen share producer ID

  /// Connection quality metrics (JSON)
  qualityMetrics    Json?
  deviceInfo        Json?
  updatedAt         DateTime            @updatedAt

  // Relations
  callSession       CallSession         @relation(fields: [callSessionId], references: [id], onDelete: Cascade)
  user              User?               @relation("CallParticipantUser", fields: [userId], references: [id])
  anonymousUser     AnonymousParticipant? @relation("CallParticipantAnonymous", fields: [anonymousUserId], references: [id])
  transcriptions    CallTranscription[]

  @@index([callSessionId])
  @@index([userId])
  @@index([anonymousUserId])
  @@index([status])
  @@index([joinedAt])
+ @@index([sfuSendTransportId])
+ @@index([sfuAudioProducerId])
+ @@index([sfuVideoProducerId])

  @@unique([callSessionId, userId])
  @@unique([callSessionId, anonymousUserId])
}
```

**New Fields**:

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `sfuSendTransportId` | String | Yes | mediasoup send transport ID (client → server) |
| `sfuRecvTransportId` | String | Yes | mediasoup receive transport ID (server → client) |
| `sfuAudioProducerId` | String | Yes | mediasoup audio producer ID |
| `sfuVideoProducerId` | String | Yes | mediasoup video producer ID |
| `sfuScreenProducerId` | String | Yes | mediasoup screen share producer ID |

**New Indexes**:
- `@@index([sfuSendTransportId])`: Lookup participant by transport ID
- `@@index([sfuAudioProducerId])`: Lookup participant by producer ID
- `@@index([sfuVideoProducerId])`: Lookup participant by video producer ID

---

### 3. CallMetrics Model (New - Optional)

**Purpose**: Track call quality and mode transitions for analytics.

**Full Schema**:
```prisma
/// Call quality metrics and mode transition analytics
model CallMetrics {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  callSessionId   String   @unique @db.ObjectId

  /// Mode transition metrics
  modeTransitions Json?    // [{ from: 'p2p', to: 'sfu', timestamp, duration }]

  /// Call quality metrics
  avgPacketLoss   Float?   // Average packet loss (0-1)
  avgJitter       Float?   // Average jitter (ms)
  avgRtt          Float?   // Average round-trip time (ms)
  avgBitrate      Float?   // Average bitrate (kbps)

  /// Participant metrics
  peakParticipants Int?    // Maximum concurrent participants
  totalParticipants Int?   // Total unique participants (incl. dropped)

  /// Network issues
  reconnections   Int      @default(0)
  iceFailures     Int      @default(0)
  transportErrors Int      @default(0)

  /// Data transfer
  totalDataSent     BigInt?
  totalDataReceived BigInt?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  callSession     CallSession @relation(fields: [callSessionId], references: [id], onDelete: Cascade)

  @@index([callSessionId])
  @@map("call_metrics")
}
```

**Key Fields**:
- `modeTransitions`: JSON array tracking each P2P ↔ SFU transition
  ```json
  [
    {
      "from": "p2p",
      "to": "sfu",
      "timestamp": "2025-10-28T10:30:45Z",
      "duration": 1.8,
      "reason": "participant_joined"
    },
    {
      "from": "sfu",
      "to": "p2p",
      "timestamp": "2025-10-28T10:45:12Z",
      "duration": 1.5,
      "reason": "participant_left"
    }
  ]
  ```

---

## Migration Strategy

### Phase 1: Create Migration File

**File**: `prisma/migrations/20251028_add_sfu_support/migration.sql`

```sql
-- Add SFU fields to CallSession
ALTER TABLE "CallSession" ADD COLUMN "sfuRoomId" TEXT;
ALTER TABLE "CallSession" ADD COLUMN "sfuRtpCapabilities" JSONB;
ALTER TABLE "CallSession" ADD COLUMN "lastModeChange" TIMESTAMP(3);
ALTER TABLE "CallSession" ADD COLUMN "modeChangeCount" INTEGER DEFAULT 0 NOT NULL;

-- Add indexes for CallSession
CREATE INDEX "CallSession_sfuRoomId_idx" ON "CallSession"("sfuRoomId");
CREATE INDEX "CallSession_mode_status_idx" ON "CallSession"("mode", "status");

-- Add SFU fields to CallParticipant
ALTER TABLE "CallParticipant" ADD COLUMN "sfuSendTransportId" TEXT;
ALTER TABLE "CallParticipant" ADD COLUMN "sfuRecvTransportId" TEXT;
ALTER TABLE "CallParticipant" ADD COLUMN "sfuAudioProducerId" TEXT;
ALTER TABLE "CallParticipant" ADD COLUMN "sfuVideoProducerId" TEXT;
ALTER TABLE "CallParticipant" ADD COLUMN "sfuScreenProducerId" TEXT;

-- Add indexes for CallParticipant
CREATE INDEX "CallParticipant_sfuSendTransportId_idx" ON "CallParticipant"("sfuSendTransportId");
CREATE INDEX "CallParticipant_sfuAudioProducerId_idx" ON "CallParticipant"("sfuAudioProducerId");
CREATE INDEX "CallParticipant_sfuVideoProducerId_idx" ON "CallParticipant"("sfuVideoProducerId");

-- Create CallMetrics table (optional)
CREATE TABLE "call_metrics" (
    "_id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "modeTransitions" JSONB,
    "avgPacketLoss" DOUBLE PRECISION,
    "avgJitter" DOUBLE PRECISION,
    "avgRtt" DOUBLE PRECISION,
    "avgBitrate" DOUBLE PRECISION,
    "peakParticipants" INTEGER,
    "totalParticipants" INTEGER,
    "reconnections" INTEGER DEFAULT 0 NOT NULL,
    "iceFailures" INTEGER DEFAULT 0 NOT NULL,
    "transportErrors" INTEGER DEFAULT 0 NOT NULL,
    "totalDataSent" BIGINT,
    "totalDataReceived" BIGINT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_metrics_pkey" PRIMARY KEY ("_id")
);

CREATE UNIQUE INDEX "call_metrics_callSessionId_key" ON "call_metrics"("callSessionId");
CREATE INDEX "call_metrics_callSessionId_idx" ON "call_metrics"("callSessionId");

-- Add foreign key constraint
ALTER TABLE "call_metrics" ADD CONSTRAINT "call_metrics_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("_id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Phase 2: Prisma Migration Commands

**Development**:
```bash
# Generate migration
npx prisma migrate dev --name add_sfu_support

# Apply migration
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

**Production**:
```bash
# Dry run (check for issues)
npx prisma migrate deploy --preview-feature

# Apply migration (zero downtime)
npx prisma migrate deploy

# Verify migration
npx prisma migrate status
```

### Phase 3: Data Backfill (Optional)

**Set default values for existing calls**:

```typescript
// Backfill script: scripts/backfill-sfu-fields.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillSFUFields() {
  // Set modeChangeCount to 0 for existing calls
  const result = await prisma.callSession.updateMany({
    where: {
      modeChangeCount: null
    },
    data: {
      modeChangeCount: 0
    }
  });

  console.log(`✅ Backfilled ${result.count} CallSession records`);
}

backfillSFUFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Phase 4: Backward Compatibility Test

**Test Plan**:
1. ✅ Existing P2P calls continue to work (no SFU fields set)
2. ✅ New P2P calls work without SFU fields
3. ✅ New SFU calls populate SFU fields correctly
4. ✅ Mode transitions update fields properly
5. ✅ Queries return correct results for both P2P and SFU calls

---

## Data Access Patterns

### 1. Create Call Session (P2P Mode)

**Before (Phase 1A)**:
```typescript
const callSession = await prisma.callSession.create({
  data: {
    conversationId,
    initiatorId,
    mode: 'p2p',
    type: 'video',
    status: 'initiated'
  }
});
```

**After (Phase 1B)** - Same code, backward compatible:
```typescript
const callSession = await prisma.callSession.create({
  data: {
    conversationId,
    initiatorId,
    mode: 'p2p',
    type: 'video',
    status: 'initiated'
    // sfuRoomId, sfuRtpCapabilities remain null
  }
});
```

---

### 2. Switch to SFU Mode

```typescript
async function switchToSFU(callId: string, routerId: string, rtpCapabilities: any) {
  const now = new Date();

  await prisma.callSession.update({
    where: { id: callId },
    data: {
      mode: 'sfu',
      sfuRoomId: routerId,
      sfuRtpCapabilities: rtpCapabilities,
      lastModeChange: now,
      modeChangeCount: { increment: 1 }
    }
  });

  // Optionally log mode transition in CallMetrics
  await prisma.callMetrics.upsert({
    where: { callSessionId: callId },
    create: {
      callSessionId: callId,
      modeTransitions: [
        {
          from: 'p2p',
          to: 'sfu',
          timestamp: now.toISOString(),
          reason: 'participant_joined'
        }
      ]
    },
    update: {
      modeTransitions: {
        push: {
          from: 'p2p',
          to: 'sfu',
          timestamp: now.toISOString(),
          reason: 'participant_joined'
        }
      }
    }
  });
}
```

---

### 3. Store SFU Participant Data

```typescript
async function updateParticipantSFUData(
  participantId: string,
  sfuData: {
    sendTransportId: string;
    recvTransportId: string;
    audioProducerId?: string;
    videoProducerId?: string;
  }
) {
  await prisma.callParticipant.update({
    where: { id: participantId },
    data: {
      sfuSendTransportId: sfuData.sendTransportId,
      sfuRecvTransportId: sfuData.recvTransportId,
      sfuAudioProducerId: sfuData.audioProducerId,
      sfuVideoProducerId: sfuData.videoProducerId
    }
  });
}
```

---

### 4. Query Active SFU Calls

```typescript
async function getActiveSFUCalls() {
  return await prisma.callSession.findMany({
    where: {
      mode: 'sfu',
      status: 'active'
    },
    include: {
      participants: {
        where: { status: 'connected' }
      }
    }
  });
}
```

---

### 5. Find Participant by Producer ID

```typescript
async function findParticipantByProducerId(producerId: string) {
  return await prisma.callParticipant.findFirst({
    where: {
      OR: [
        { sfuAudioProducerId: producerId },
        { sfuVideoProducerId: producerId },
        { sfuScreenProducerId: producerId }
      ]
    },
    include: {
      user: true,
      anonymousUser: true,
      callSession: true
    }
  });
}
```

---

### 6. Switch Back to P2P Mode

```typescript
async function switchToP2P(callId: string) {
  const now = new Date();

  await prisma.callSession.update({
    where: { id: callId },
    data: {
      mode: 'p2p',
      sfuRoomId: null,
      sfuRtpCapabilities: null,
      lastModeChange: now,
      modeChangeCount: { increment: 1 }
    }
  });

  // Clear SFU data from participants
  await prisma.callParticipant.updateMany({
    where: { callSessionId: callId },
    data: {
      sfuSendTransportId: null,
      sfuRecvTransportId: null,
      sfuAudioProducerId: null,
      sfuVideoProducerId: null,
      sfuScreenProducerId: null
    }
  });

  // Log transition
  await prisma.callMetrics.update({
    where: { callSessionId: callId },
    data: {
      modeTransitions: {
        push: {
          from: 'sfu',
          to: 'p2p',
          timestamp: now.toISOString(),
          reason: 'participant_left'
        }
      }
    }
  });
}
```

---

### 7. Get Mode Transition Analytics

```typescript
async function getModeTransitionStats(startDate: Date, endDate: Date) {
  const calls = await prisma.callSession.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      modeChangeCount: {
        gt: 0
      }
    },
    include: {
      metrics: true
    }
  });

  const stats = {
    totalCalls: calls.length,
    totalTransitions: calls.reduce((sum, c) => sum + c.modeChangeCount, 0),
    avgTransitionsPerCall: 0,
    avgTransitionDuration: 0,
    transitionsByReason: {} as Record<string, number>
  };

  // Calculate averages and breakdown
  let totalDuration = 0;
  let durationCount = 0;

  calls.forEach(call => {
    const transitions = call.metrics?.modeTransitions as any[];
    if (transitions) {
      transitions.forEach(t => {
        if (t.duration) {
          totalDuration += t.duration;
          durationCount++;
        }
        stats.transitionsByReason[t.reason] =
          (stats.transitionsByReason[t.reason] || 0) + 1;
      });
    }
  });

  stats.avgTransitionsPerCall = stats.totalTransitions / stats.totalCalls;
  stats.avgTransitionDuration = durationCount > 0 ? totalDuration / durationCount : 0;

  return stats;
}
```

---

## Performance Considerations

### Index Strategy

**Query**: Find active SFU call by room ID
```typescript
await prisma.callSession.findFirst({
  where: { sfuRoomId: 'router-abc123', status: 'active' }
});
```
**Index Used**: `CallSession_sfuRoomId_idx`
**Expected Performance**: <5ms (indexed lookup)

---

**Query**: Find participant by producer ID
```typescript
await prisma.callParticipant.findFirst({
  where: { sfuAudioProducerId: 'producer-abc123' }
});
```
**Index Used**: `CallParticipant_sfuAudioProducerId_idx`
**Expected Performance**: <5ms (indexed lookup)

---

**Query**: Get all active SFU calls
```typescript
await prisma.callSession.findMany({
  where: { mode: 'sfu', status: 'active' }
});
```
**Index Used**: `CallSession_mode_status_idx` (composite)
**Expected Performance**: <10ms (composite index scan)

---

### Database Load Estimates

**Write Operations (per mode transition)**:
- 1x `CallSession` update (mode, sfuRoomId, etc.)
- Nx `CallParticipant` updates (N = participant count)
- 1x `CallMetrics` upsert (optional)

**Total**: ~10-50ms per transition (depending on participant count)

**Read Operations (per call)**:
- Frequent: Participant queries (~10/sec during active call)
- Moderate: Call status checks (~1/sec)
- Rare: Analytics queries (~1/hour)

**Index Overhead**:
- Storage: +5-10% per indexed field
- Write latency: +1-2ms per additional index
- Benefit: 10-100x faster queries

---

### Optimization Recommendations

1. **Connection Pooling**: Configure Prisma connection pool
   ```typescript
   // prisma/schema.prisma
   datasource db {
     provider = "mongodb"
     url      = env("DATABASE_URL")
     connectionLimit = 20  // Increase for high load
   }
   ```

2. **Caching**: Cache active call data in Redis
   ```typescript
   // Cache active call session for 5 minutes
   await redis.setex(`call:${callId}`, 300, JSON.stringify(callSession));
   ```

3. **Batch Updates**: Use `updateMany` for bulk operations
   ```typescript
   // Clear SFU data for all participants at once
   await prisma.callParticipant.updateMany({
     where: { callSessionId: callId },
     data: { sfuSendTransportId: null, /* ... */ }
   });
   ```

---

## Rollback Plan

### Scenario 1: Migration Fails During Deployment

**Symptom**: Migration errors, schema conflicts

**Action**:
```bash
# Revert migration
npx prisma migrate resolve --rolled-back 20251028_add_sfu_support

# Restore previous schema
git checkout HEAD~1 -- prisma/schema.prisma
npx prisma generate

# Restart services
pm2 restart gateway
```

---

### Scenario 2: Performance Degradation After Migration

**Symptom**: Slow queries, high database CPU

**Diagnosis**:
```sql
-- Check slow queries (PostgreSQL)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan < 100;
```

**Action**:
1. Identify slow query
2. Add missing index or optimize query
3. If issue persists, rollback migration and investigate offline

---

### Scenario 3: Data Corruption

**Symptom**: Null values where not expected, orphaned SFU data

**Action**:
```typescript
// Cleanup script: scripts/cleanup-sfu-data.ts
async function cleanupOrphanedSFUData() {
  // Find calls in P2P mode with SFU fields set (invalid state)
  const invalidCalls = await prisma.callSession.findMany({
    where: {
      mode: 'p2p',
      sfuRoomId: { not: null }
    }
  });

  // Clear SFU fields
  for (const call of invalidCalls) {
    await prisma.callSession.update({
      where: { id: call.id },
      data: {
        sfuRoomId: null,
        sfuRtpCapabilities: null
      }
    });
  }

  console.log(`✅ Cleaned ${invalidCalls.length} invalid calls`);
}
```

---

## Summary

### Schema Changes
- ✅ 5 new fields in `CallSession`
- ✅ 5 new fields in `CallParticipant`
- ✅ 1 new model `CallMetrics` (optional)
- ✅ 6 new indexes for performance

### Migration Impact
- **Downtime**: Zero (additive changes only)
- **Migration Duration**: <30 seconds (small collections)
- **Backward Compatibility**: 100% (all new fields nullable)
- **Performance Impact**: Minimal (+1-2ms write latency, 10-100x faster reads)

### Rollback Safety
- ✅ Simple rollback procedure
- ✅ Data integrity maintained
- ✅ No destructive operations

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Final for Review
