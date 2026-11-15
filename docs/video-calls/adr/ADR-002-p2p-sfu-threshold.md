# ADR-002: P2P vs SFU Threshold at 2 Participants

**Status**: Accepted

**Date**: 2025-10-28

**Deciders**: Microservices Architecture Team

---

## Context

The Video Call Feature must support both P2P (Peer-to-Peer) and SFU (Selective Forwarding Unit) modes. We need to determine:

1. When to use P2P vs SFU
2. When to migrate between modes (switching threshold)
3. How to handle DIRECT vs GROUP conversations

### Key Constraints
- **DIRECT conversations**: Always 2 participants (by definition)
- **GROUP conversations**: 2-50 participants
- **Performance**: Minimize server load while maintaining call quality
- **User experience**: Seamless mode transitions

### Network Topology Comparison

#### P2P (Peer-to-Peer)
```
User A ←─────────→ User B
  (Direct WebRTC connection)
```
- **Bandwidth (each user)**: Upload 1 stream, Download 1 stream
- **Server role**: Signaling only (no media routing)
- **Latency**: Lowest (direct path)
- **Server cost**: Minimal (no media processing)

#### SFU (Selective Forwarding Unit)
```
User A ─────┐
            ├─→ Media Server ←─→ User B
User C ─────┘
```
- **Bandwidth (each user)**: Upload 1 stream, Download (N-1) streams
- **Server role**: Media routing (selective forwarding)
- **Latency**: Slightly higher (+50-100ms routing)
- **Server cost**: Moderate (CPU for routing, bandwidth)

### Alternatives Considered

| Threshold | P2P Range | SFU Range | Pros | Cons |
|-----------|-----------|-----------|------|------|
| **2 participants** | 2 only | 3+ | Max P2P usage, lowest server load | Mode switch on 3rd join |
| **3 participants** | 2-3 | 4+ | Fewer mode switches | Higher bandwidth for 3-person calls |
| **Always SFU** | Never | 2+ | No mode switching | Server load for 2-person calls |
| **Always P2P** | 2+ | Never | Zero server load | Not scalable for 4+ participants |

---

## Decision

We will use **P2P for 2 participants, SFU for 3+ participants**.

### Switching Rules

| Conversation Type | Participant Count | Mode | Rationale |
|-------------------|-------------------|------|-----------|
| **DIRECT** | Always 2 | P2P (always) | Fixed participant count, no mode switching |
| **GROUP** | 2 participants | P2P | Optimize for low latency, zero server cost |
| **GROUP** | 3+ participants | SFU | Required for 3+ (P2P mesh doesn't scale) |
| **GROUP** | 3rd joins | P2P → SFU | Trigger migration |
| **GROUP** | 3rd leaves | SFU → P2P | Trigger migration back |

---

## Rationale

### 1. **P2P is Optimal for 2 Participants**

**Bandwidth comparison** (HD 720p video @ 1.5 Mbps):

| Mode | User A Bandwidth | User B Bandwidth | Server Bandwidth |
|------|------------------|------------------|------------------|
| P2P | ↑1.5 + ↓1.5 = 3 Mbps | ↑1.5 + ↓1.5 = 3 Mbps | 0 Mbps |
| SFU | ↑1.5 + ↓1.5 = 3 Mbps | ↑1.5 + ↓1.5 = 3 Mbps | ↑3 + ↓3 = 6 Mbps |

**Result**: P2P has:
- **Same client bandwidth** as SFU (3 Mbps)
- **Lower latency** (~50-100ms less)
- **Zero server cost** (no media routing)

**Conclusion**: P2P is strictly better for 2 participants.

### 2. **SFU is Required for 3+ Participants**

**P2P mesh doesn't scale**:

| Participants | P2P Connections | Upload Streams | Bandwidth per User (HD) |
|--------------|-----------------|----------------|-------------------------|
| 2 | 1 | 1 | 3 Mbps (↑1.5, ↓1.5) |
| 3 | 3 | 2 | 6 Mbps (↑3, ↓3) |
| 4 | 6 | 3 | 9 Mbps (↑4.5, ↓4.5) |
| 5 | 10 | 4 | 12 Mbps (↑6, ↓6) |
| 10 | 45 | 9 | 27 Mbps (↑13.5, ↓13.5) |

**Issues**:
- **Exponential connections**: N×(N-1)/2 connections
- **Client CPU overload**: Encoding N-1 video streams
- **Bandwidth explosion**: Average home upload is 10-20 Mbps (4 participants maxes out)

**SFU bandwidth** (same HD quality):

| Participants | Upload | Download | Total per User |
|--------------|--------|----------|----------------|
| 3 | 1.5 Mbps | 3 Mbps | 4.5 Mbps |
| 5 | 1.5 Mbps | 6 Mbps | 7.5 Mbps |
| 10 | 1.5 Mbps | 13.5 Mbps | 15 Mbps |

**Conclusion**: SFU is required for 3+ participants.

### 3. **Why 2 Participants (Not 3)?**

**Option 1: Threshold = 2 (P2P for 2 only)**
- ✅ Maximum P2P usage (2-person calls are most common)
- ✅ Zero server cost for 1-on-1 calls
- ✅ Lowest latency for 2-person calls
- ❌ Mode switch when 3rd joins

**Option 2: Threshold = 3 (P2P for 2-3)**
- ✅ Fewer mode switches
- ❌ 3-person P2P mesh: 6 Mbps per user (2× bandwidth vs SFU)
- ❌ 3-person P2P: 3 connections (higher CPU)
- ❌ Poor call quality if users have limited bandwidth

**Data-driven decision**:
- **Call statistics**: 70-80% of video calls have 2 participants (1-on-1 meetings)
- **Bandwidth availability**: Average upload speed varies widely (5-50 Mbps)
- **Mobile users**: Limited bandwidth on cellular networks

**Conclusion**: Optimize for the common case (2 participants), use SFU for 3+.

---

## Consequences

### Positive

1. **Cost savings**: 70-80% of calls use P2P (zero server cost)
2. **Best latency**: 2-person calls have direct connection (<50ms latency)
3. **Scalability**: SFU handles 3-50 participants efficiently
4. **Bandwidth efficiency**: Users with limited bandwidth can join 3+ calls (SFU scales better)
5. **Simple logic**: Clear threshold, easy to implement and debug

### Negative

1. **Mode switching**: 3rd participant joining triggers P2P → SFU migration
   - **Impact**: ~1-2s interruption for existing participants
   - **Mitigation**: Optimized migration protocol, "Switching mode..." UI indicator
2. **Rare oscillation**: If 3rd participant joins/leaves repeatedly, frequent mode switches
   - **Mitigation**: Hysteresis (delay SFU → P2P migration by 10s)
3. **Testing complexity**: Must test both P2P and SFU modes, plus migration

### User Experience Impact

#### Mode Switch UX
1. **P2P → SFU (3rd joins)**:
   - Existing participants: 1-2s video freeze, "Upgrading call quality..." message
   - 3rd participant: Joins directly to SFU (no interruption)

2. **SFU → P2P (3rd leaves)**:
   - Remaining participants: 1-2s reconnection, "Optimizing connection..." message

3. **DIRECT conversations**:
   - Always P2P, never switch (best experience)

---

## Implementation Details

### Mode Selection Logic

```typescript
function determineCallMode(
  conversationType: ConversationType,
  activeParticipantCount: number
): 'p2p' | 'sfu' {
  if (conversationType === 'direct') {
    // DIRECT always has 2 participants, always P2P
    return 'p2p';
  }

  if (conversationType === 'group') {
    // GROUP: P2P for 2, SFU for 3+
    return activeParticipantCount <= 2 ? 'p2p' : 'sfu';
  }

  // PUBLIC, GLOBAL do not support video calls
  throw new Error('Invalid conversation type for video calls');
}
```

### Migration Triggers

```typescript
// Trigger P2P → SFU migration
async function onParticipantJoined(callId: string) {
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    include: { participants: { where: { status: 'connected' } } }
  });

  const activeCount = call.participants.length;

  if (call.mode === 'p2p' && activeCount === 3) {
    // Trigger migration to SFU
    await migratePeerToPeerToSFU(callId);
  }
}

// Trigger SFU → P2P migration (with hysteresis)
async function onParticipantLeft(callId: string) {
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    include: { participants: { where: { status: 'connected' } } }
  });

  const activeCount = call.participants.length;

  if (call.mode === 'sfu' && activeCount === 2) {
    // Wait 10 seconds (hysteresis) before migrating back to P2P
    // (in case 3rd participant reconnects)
    setTimeout(async () => {
      const updatedCall = await prisma.callSession.findUnique({
        where: { id: callId },
        include: { participants: { where: { status: 'connected' } } }
      });

      if (updatedCall.participants.length === 2) {
        await migrateSFUToPeerToPeer(callId);
      }
    }, 10000); // 10s delay
  }
}
```

---

## Alternatives Rejected

### Alternative 1: Always SFU (No P2P)
**Rejected because**:
- 70-80% of calls are 2-person (1-on-1)
- Wasted server resources for 2-person calls
- Higher latency for 2-person calls
- Unnecessary operational cost

### Alternative 2: P2P for 2-3, SFU for 4+
**Rejected because**:
- 3-person P2P mesh doubles bandwidth (6 Mbps vs 4.5 Mbps SFU)
- Poor experience for users with limited bandwidth (mobile, rural)
- Mode switch from 3 to 4 is less common (most calls stay at 2-3)

### Alternative 3: User-selectable mode
**Rejected because**:
- Adds UI complexity ("Use server mode?" ❓)
- Users don't understand P2P vs SFU technical details
- Optimal mode is deterministic (no need for user choice)

---

## Monitoring & Metrics

Track these metrics to validate the decision:

1. **Call distribution**:
   - % of calls with 2 participants (expect 70-80%)
   - % of calls with 3+ participants (expect 20-30%)
   - Average call size (expect 2.3-2.5 participants)

2. **Mode switch frequency**:
   - Avg mode switches per call (expect <1 for most calls)
   - Time spent in migration (expect <2s)
   - Failed migrations (expect <0.1%)

3. **Server load**:
   - % of active calls using P2P (expect 70-80%)
   - % of active calls using SFU (expect 20-30%)
   - Media server CPU usage

4. **User experience**:
   - Call quality scores (MOS - Mean Opinion Score)
   - User-reported issues related to mode switching
   - Reconnection rate during migration

---

## Review Criteria

This decision will be reviewed after **6 months** or **10,000 calls**, whichever comes first.

**Success criteria**:
- ✅ Server cost <$0.01 per 2-person call (P2P)
- ✅ Mode switch success rate >99.9%
- ✅ Mode switch duration <2s (p95)
- ✅ Call quality score >4.0/5.0 (user ratings)

**Reconsider if**:
- Mode switch failures >1%
- User complaints about "call drops" when 3rd joins
- Majority of calls have 3+ participants (shift in usage pattern)

---

**Approved by**: Architecture Team
**Implementation start**: Week 1
**Review date**: 6 months post-deployment
