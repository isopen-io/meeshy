# WebRTC P2P Calling — Phase 1 Specification

**Date**: 2026-03-29
**Status**: Draft
**Scope**: P2P 1:1 Audio + Video calls, end-to-end, iOS + Gateway
**Goal**: Production-grade calling competitive with FaceTime and Teams — zero latency perception, zero dropped calls, zero ghost states.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [State Machine](#2-state-machine)
3. [Signaling Protocol](#3-signaling-protocol)
4. [WebRTC Media Engine](#4-webrtc-media-engine)
5. [ICE & TURN Infrastructure](#5-ice--turn-infrastructure)
6. [CallKit Integration](#6-callkit-integration)
7. [UI States & Transitions](#7-ui-states--transitions)
8. [Transcription Pipeline](#8-transcription-pipeline)
9. [Post-Call Summary & Export](#9-post-call-summary--export)
10. [Shared Type Enrichments](#10-shared-type-enrichments)
11. [Edge Cases & Failure Modes](#11-edge-cases--failure-modes)
12. [Files Modified/Created](#12-files-modifiedcreated)

---

## 1. System Overview

```
iOS App
  CallView (State A) / FloatingPillView (State B)
  CallTranscriptionService (Speech framework)
       |
  CallManager (singleton)
  State machine, CallKit, Timer, Display mode
       |
  WebRTCService (orchestrator)
  ICE buffering, SDP negotiation, Adaptive bitrate, quality monitor
       |
  P2PWebRTCClient (SDK wrapper)
  RTCPeerConnection, Audio/Video tracks, Camera, Stats
       |
  MessageSocketManager (Socket.IO)
  call:initiate, call:signal, call:end, reconnect
       | Socket.IO (WSS)
Gateway
  CallEventsHandler (Socket.IO)
  Validation, Signal relay, Room management
       |
  CallService
  Session CRUD, Participant management, TURN creds
       |
  MongoDB (CallSession, CallParticipant)

  coturn (STUN + TURN, Docker)
  turn.meeshy.me:3478 (UDP/TCP)
  turns.meeshy.me:5349 (TLS)
```

### Layer Responsibilities

| Layer | Role | Delegates to |
|-------|------|-------------|
| CallManager | State machine, CallKit, timers, UI state, Socket.IO emit/receive | WebRTCService |
| WebRTCService | ICE candidate buffering, SDP lifecycle, adaptive bitrate, quality stats | P2PWebRTCClient |
| P2PWebRTCClient | Raw SDK wrapper: RTCPeerConnection, tracks, capturer, stats API | WebRTC SDK |

CallManager is the ONLY entry point for call operations. Views and ViewModels interact with CallManager only.

### Design Principles

1. **Deterministic state machine** — Every call state transition is explicit, logged, and reversible. No implicit states. No orphaned calls.
2. **Timeout everything** — Every waiting state has a maximum duration. No infinite ringing, no infinite connecting, no zombie calls.
3. **Idempotent operations** — Ending a call twice is safe. Joining a call that already ended returns a clean error. Sending a signal to a closed connection is a no-op.
4. **Server is authoritative** — The gateway validates every state transition. The client proposes, the server disposes.
5. **Graceful degradation** — Network loss does not crash. Audio continues if video fails. Reconnection is automatic and transparent.
6. **Cleanup is guaranteed** — disconnect event, heartbeat timeout, and periodic garbage collection ensure no ghost sessions persist.

---

## 2. State Machine

### 2.1 Server-Side Call States (Gateway)

```
          call:initiate
               |
          INITIATED  (DB created, status=initiated)
               |  (emit call:initiated to conversation members)
               v
           RINGING   (callee device received notification)
          /    |    \
    join /     |     \ timeout 30s      \ reject
        v     |      v                   v
  CONNECTING  |    MISSED             REJECTED
     |        |
     | ICE    | timeout 15s
     v        v
  ACTIVE    FAILED
   / \
  /   \  end/leave/disconnect
 |     v
 |   ENDED
 |
 | ICE disconnected
 v
RECONNECTING
  / \
 /   \ timeout 30s
v     v
ACTIVE  ENDED (reason: connectionLost)

All terminal states (ENDED, MISSED, REJECTED, FAILED) --> cleanup()
```

**State transition: INITIATED vs RINGING**: `call:initiate` creates the session with status `initiated`. When the server successfully emits `call:initiated` to the callee's socket (confirmed by Socket.IO room delivery), the status transitions to `ringing`. If the callee has no active socket, status stays `initiated` and the 30s timeout applies from `initiated`.

### 2.2 Server-Side Timeouts (CRITICAL — prevents ghost calls)

| State | Timeout | Action |
|-------|---------|--------|
| INITIATED (no socket delivery) | 10s | Mark as MISSED, notify caller |
| RINGING | 30s from INITIATED | Mark as MISSED, notify caller, cleanup |
| CONNECTING | 15s | Mark as FAILED, notify both, cleanup |
| RECONNECTING | 30s | Mark as ENDED (reason: connectionLost), cleanup |
| ACTIVE (no heartbeat) | 60s | Mark as ENDED (reason: heartbeatTimeout), cleanup |
| Any state (socket disconnect) | 5s grace | If not reconnected in 5s, trigger leave/end |

### 2.3 Heartbeat Protocol

```
Client --> Server: call:heartbeat { callId } every 15s
Server tracks: lastHeartbeat per participant
Server cron (every 30s): check all active calls, end any with lastHeartbeat > 60s ago
```

This prevents zombie calls where one side thinks the call is active but the other has crashed/lost network.

### 2.4 Client-Side Call States (iOS CallManager)

```swift
enum CallState {
    case idle
    case ringing(isOutgoing: Bool)
    case connecting
    case connected
    case reconnecting(attempt: Int)   // NEW
    case ended(reason: CallEndReason)
}

enum CallEndReason {
    case local            // User hung up
    case remote           // Other party hung up
    case rejected         // Other party rejected
    case missed           // Ringing timeout (30s)
    case failed(String)   // ICE/network failure
    case connectionLost   // Reconnection failed after 3 attempts
}

enum CallDisplayMode {
    case fullScreen   // State A
    case pip          // State B (PiP + pill)
}
```

### 2.5 State Transition Table (Client)

| From | Event | To | Side Effects |
|------|-------|----|-------------|
| idle | user taps call | ringing(outgoing) | emit call:initiate (wait for ACK), start 30s timer, report to CallKit |
| idle | receive call:initiated | ringing(incoming) | report incoming call to CallKit, start 30s timer |
| ringing(out) | receive call:participant-joined + iceServers | connecting | stop ring timer, configure WebRTC with iceServers, start local media, create SDP offer, emit call:signal(offer), start 15s timer |
| ringing(in) | user taps accept | connecting | emit call:join (wait for ACK with iceServers), configure WebRTC, start local media, wait for remote offer via call:signal, start 15s timer, report answer to CallKit |
| ringing(in) | user taps reject | ended(rejected) | emit call:end reason=rejected, report end to CallKit |
| ringing(any) | 30s timeout | ended(missed) | emit call:end, report end to CallKit |
| connecting | ICE state connected | connected | stop connect timer, start duration timer, start heartbeat, start quality monitor |
| connecting | 15s timeout | ended(failed) | emit call:end, close WebRTC, report end to CallKit |
| connected | ICE state disconnected | reconnecting(1) | emit call:reconnecting, start 5s wait, then ICE restart |
| connected | user swipe down (video) | connected | displayMode = pip, start PiP controller |
| connected | user taps end | ended(local) | emit call:end, close WebRTC, stop PiP, report end to CallKit |
| connected | receive call:ended | ended(remote) | close WebRTC, stop PiP, report end to CallKit |
| reconnecting(n) | ICE state connected | connected | emit call:reconnected, reset attempt counter, resume quality monitor |
| reconnecting(n) | 5s wait expired, n < 3 | reconnecting(n+1) | ICE restart with new offer (iceRestart=true) |
| reconnecting(3) | 5s wait expired | ended(connectionLost) | emit call:end, close WebRTC, report end to CallKit |
| ended(any) | 3s auto-dismiss | idle | reset all state, deactivate audio session |

**CRITICAL CHANGE from existing code**: The current `CallManager.startCall()` creates the SDP offer BEFORE emitting `call:initiate`. The new flow waits for `call:participant-joined` (which provides iceServers with TURN credentials) BEFORE configuring WebRTC and creating the offer. This requires a full rewrite of `CallManager.startCall()`.

### 2.6 Cleanup Guarantees

**Client cleanup on ANY transition to ended:**
1. Stop heartbeat timer
2. Stop duration timer
3. Stop quality monitor
4. Close WebRTC connection (P2PWebRTCClient.disconnect())
5. Stop PiP controller if active
6. Deactivate audio session
7. Report end call action to CallKit
8. Emit call:end to server (idempotent — server ignores if already ended)
9. After 3s: reset to idle, clear currentCallId, remoteUserId, remoteUsername

**Server cleanup on ANY terminal state:**
1. Update CallSession status in DB
2. Set endedAt timestamp and compute duration
3. Set leftAt on all participants still in call
4. Emit call:ended to all participants in call room
5. Remove all sockets from call room
6. Clear heartbeat tracking for this call

**Garbage collection (server cron, every 60s):**
1. Find all CallSessions with status in (initiated, ringing) AND startedAt > 60s ago: force MISSED
2. Find all CallSessions with status in (connecting) AND startedAt > 30s ago: force FAILED
3. Find all CallSessions with status in (active, reconnecting) AND startedAt > 2h ago: force ENDED (garbageCollected)
4. Log all forced transitions as warnings

---

## 3. Signaling Protocol

### 3.1 Complete Event Catalog

#### Client to Server (with ACK callbacks)

| Event | Payload | ACK Response | Rate Limit | Validation |
|-------|---------|-------------|-----------|------------|
| call:initiate | { conversationId, type, settings? } | { success, data: { callId, mode } } | 5/min | Conversation exists, is DIRECT/GROUP, user is member, no active call |
| call:join | { callId, settings? } | { success, data: { callSession, iceServers } } | 20/min | Call exists, status is initiated/ringing, user is invited participant |
| call:signal | { callId, signal: WebRTCSignal } | { success } | 100/10s | Call exists, user is participant, signal size < 64KB, signal.from matches socket user |
| call:toggle-audio | { callId, enabled: boolean } | { success } | 50/min | Call is active, user is participant |
| call:toggle-video | { callId, enabled: boolean } | { success } | 50/min | Call is active, user is participant |
| call:end | { callId, reason? } | { success } | 20/min | Call exists, user is participant (ANY participant, not just initiator) |
| call:heartbeat | { callId } | none (fire-and-forget) | 10/15s | Call is active, user is participant |
| call:quality-report | { callId, stats } | none (fire-and-forget) | 1/10s | Call is active, user is participant |
| call:reconnecting | { callId, participantId, attempt } | none | 3/30s | Call is active, user is participant |
| call:reconnected | { callId, participantId } | none | 3/30s | Call is active, user is participant |

**CRITICAL FIX (C4)**: `call:end` is now allowed for ANY active participant in a P2P call, not just the initiator. The existing `CallService.endCall()` permission check must be changed from `role === 'initiator'` to `isActiveParticipant`.

**ACK callback pattern**: All events that require server validation use Socket.IO acknowledgment callbacks. The client MUST NOT proceed until the ACK confirms success. Events that are fire-and-forget (heartbeat, quality-report, reconnecting, reconnected) do not use callbacks.

#### Server to Client

| Event | Payload | When |
|-------|---------|------|
| call:initiated | CallInitiatedEvent | After successful call:initiate, sent to ALL conversation members |
| call:participant-joined | { callId, participant, mode, iceServers } | After successful call:join |
| call:participant-left | { callId, participantId, userId?, mode } | After leave/disconnect |
| call:signal | { callId, signal: WebRTCSignal } | Relay SDP/ICE to TARGET participant only (socket.to(targetSocketId).emit, NOT room broadcast) |
| call:media-toggled | { callId, participantId, mediaType, enabled } | After toggle |
| call:ended | { callId, duration, endedBy, reason } | After call ends (reason field is NEW) |
| call:error | { code, message, details? } | On any validation/processing error |
| call:missed | { callId, conversationId, callerId, callerName } | After ringing timeout |
| call:quality-alert | { callId, participantId, metric, value, threshold } | Quality degrades below threshold |

**Deprecation note (N3)**: The existing `call:leave` event (CLIENT_EVENTS.CALL_LEAVE) is RETAINED but unused in P2P Phase 1. In P2P, `call:end` terminates for both parties. `call:leave` will be used in Phase 2 group calls where a participant leaves without ending the call for everyone. Do NOT remove it from CLIENT_EVENTS.

**CRITICAL FIX (I3)**: `call:signal` MUST use targeted emit (`socket.to(targetSocketId).emit`) not room broadcast. The existing code broadcasts to the room which works for P2P but is a security issue for group calls. Fix now for correctness.

### 3.2 WebRTC Signal Types

```typescript
// Updated WebRTCSignal union — add 'ice-restart' to offer/answer types
export type WebRTCSignalType = 'offer' | 'answer' | 'ice-restart'

export interface WebRTCOfferAnswerSignal {
  readonly type: WebRTCSignalType  // WAS: 'offer' | 'answer' — NOW includes 'ice-restart'
  readonly from: string
  readonly to: string
  readonly sdp: string
}

export interface WebRTCIceCandidateSignal {
  readonly type: 'ice-candidate'
  readonly from: string
  readonly to: string
  readonly candidate: string
  readonly sdpMLineIndex?: number
  readonly sdpMid?: string
}

export type WebRTCSignal = WebRTCOfferAnswerSignal | WebRTCIceCandidateSignal
```

**FIX (C2)**: `ice-restart` is added to `WebRTCSignalType`. The implementation MUST keep the existing `extends WebRTCSignalBase` inheritance pattern from video-call.ts and only widen the type literal from `'offer' | 'answer'` to include `'ice-restart'`. Do not restructure the interfaces — only extend the type union.
