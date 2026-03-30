# WebRTC P2P Calling — Phase 1 Specification

**Date**: 2026-03-29
**Status**: Draft (Reviewed 2026-03-29)
**Scope**: P2P 1:1 Audio + Video calls, end-to-end, iOS + Web + Gateway
**Goal**: Production-grade calling competitive with FaceTime and Teams — zero latency perception, zero dropped calls, zero ghost states.

### Implementation Status Legend

Sections added or modified during the review are tagged with:
- ✅ **Exists** — verified implemented in codebase
- 🔧 **To Implement** — spec describes the target design, code does not exist yet
- 📐 **Design Only** — architectural proposal, no code counterpart, may need architectural decisions

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
13. [Web (Next.js) Implementation](#13-web-nextjs-implementation)
14. [Video Processing Pipeline](#14-video-processing-pipeline)
15. [Audio Effects Pipeline](#15-audio-effects-pipeline)
16. [Real-Time Transcription & Translation](#16-real-time-transcription--translation)
17. [Multi-Device Handling](#17-multi-device-handling)
18. [Network Quality Indicators](#18-network-quality-indicators)
19. [Bluetooth & Audio Routing](#19-bluetooth--audio-routing)
20. [Accessibility](#20-accessibility)
21. [Low Power Mode](#21-low-power-mode)
22. [Implementation Status & Review Notes](#22-implementation-status--review-notes)
23. [Post-Call Experience](#23-post-call-experience)
24. [Monitoring & Analytics](#24-monitoring--analytics)
25. [New Socket.IO Events Summary](#25-new-socketio-events-summary-review-additions)
26. [Files Modified/Created (Review Additions)](#26-files-modifiedcreated-review-additions)

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
| reconnecting(n) | wait expired, n < 3 | reconnecting(n+1) | ICE restart with new offer (iceRestart=true). Backoff: attempt 1 = 2s, attempt 2 = 5s, attempt 3 = 10s |
| reconnecting(3) | 10s wait expired | ended(connectionLost) | emit call:end, close WebRTC, report end to CallKit |
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

### 3.3 Signal Relay Rules (Gateway)

1. **Validate sender identity**: signal.from MUST match the authenticated socket userId/participantId
2. **Validate target exists**: signal.to MUST be an active participant in the call
3. **Targeted delivery**: Resolve target userId to socketId via the gateway's `socketToUser` map (maintained by `ConnectionManager` on connect/disconnect). Emit to `socket.to(targetSocketId).emit()`, NOT room broadcast. If target has multiple sockets (multi-device), emit to ALL sockets for that userId within the call room.
4. **Size limit**: Signal payload MUST be < 64KB. Reject with error code SIGNAL_TOO_LARGE
5. **Relay only**: Gateway NEVER modifies signal content — pure relay

### 3.4 Complete Signaling Flow (Happy Path)

```
Time  Caller (Alice)              Gateway                    Callee (Bob)
 0ms  call:initiate
      {conversationId, 'video'}
      --> wait for ACK
                                  validate conversation
                                  check no active call
                                  create CallSession (status=initiated)
                                  start 30s global timer

20ms  <-- ACK {callId, mode}
      state: ringing(outgoing)
      report to CallKit
                                  call:initiated ----------> state: ringing(incoming)
                                  {callId, initiator,        report to CallKit
                                   participants, mode}       show IncomingCallView
                                  status -> ringing

                                                       ~5s: user taps Accept
                                  <-------- call:join ------
                                  {callId}
                                  --> wait for ACK

                                  validate, add participant
                                  status -> connecting
                                  generate TURN creds
                                  stop global timer
                                  start 15s connect timer

                                  ACK --> {callSession, iceServers}
                                                            configure WebRTC
                                                            with iceServers
                                                            start local media

      call:participant-joined
      <-- {callId, participant,
           mode, iceServers}
      configure WebRTC with
        iceServers (TURN creds!)
      start local media

~6s   create SDP offer
      call:signal(offer) ------->
      {type:'offer', sdp,        targeted emit ---------> setRemoteDescription
       from:alice, to:bob}                                 create SDP answer

~6.5s                            <-- call:signal(answer) --
      setRemoteDescription <---- {type:'answer', sdp,
                                  from:bob, to:alice}

      flush buffered ICE                                    flush buffered ICE

~7s   call:signal(ICE) -------->  targeted relay ---------> addIceCandidate
                                 <-- call:signal(ICE) -----
      addIceCandidate <---------

~8s   ICE: connected                                        ICE: connected
      state: CONNECTED           status -> active           state: CONNECTED
      start heartbeat            stop connect timer         start heartbeat
      start quality monitor      answeredAt = now()         start quality monitor
      start duration timer                                  start duration timer

      ============== MEDIA FLOWING (Opus HD + H264/VP8) =============

      call:heartbeat (15s) ----> update lastHeartbeat
                                 <-- call:heartbeat (15s) --
      call:quality-report -----> store metrics
                                 <-- call:quality-report ---

~60s  user taps End
      call:end {callId} -------->
      close WebRTC               status -> ended
      stop all timers            endedAt = now()
      report to CallKit          duration = answeredAt..now
      state: ENDED(local)        endReason = 'completed'

                                 call:ended --------------> close WebRTC
                                 {callId, duration,         stop all timers
                                  endedBy:'alice',          report to CallKit
                                  reason:'completed'}       state: ENDED(remote)

                                 cleanup call room

 +3s  state: IDLE                                            state: IDLE
```

### 3.5 ACK Callback Type Definitions

```typescript
// Add to ClientToServerEvents type map
interface ClientToServerEvents {
  'call:initiate': (data: CallInitiateEvent, ack: (response: CallInitiateAck) => void) => void
  'call:join': (data: CallJoinEvent, ack: (response: CallJoinAck) => void) => void
  'call:signal': (data: CallSignalEvent, ack: (response: { success: boolean }) => void) => void
  'call:toggle-audio': (data: { callId: string; enabled: boolean }, ack: (response: { success: boolean }) => void) => void
  'call:toggle-video': (data: { callId: string; enabled: boolean }, ack: (response: { success: boolean }) => void) => void
  'call:end': (data: { callId: string; reason?: string }, ack: (response: { success: boolean }) => void) => void
  'call:heartbeat': (data: CallHeartbeatEvent) => void
  'call:quality-report': (data: CallQualityReportEvent) => void
  'call:reconnecting': (data: CallReconnectingEvent) => void
  'call:reconnected': (data: CallReconnectedEvent) => void
}

interface CallInitiateAck {
  success: boolean
  data?: { callId: string; mode: CallMode }
  error?: { code: string; message: string }
}

interface CallJoinAck {
  success: boolean
  data?: { callSession: CallSession; iceServers: RTCIceServerConfig[] }
  error?: { code: string; message: string }
}

interface RTCIceServerConfig {
  urls: string[]
  username?: string
  credential?: string
}
```

---

## 4. WebRTC Media Engine

### 4.1 SDK Integration

**Package**: webrtc-sdk/Specs from https://github.com/webrtc-sdk/Specs
**Import**: import WebRTC
**Minimum iOS**: 16.0
**Swift compatibility**: 6.0 - 6.2

**Removal**: Delete apps/ios/WebRTCStubs.swift entirely. All stub types are replaced by the real SDK.

### 4.2 RTCPeerConnectionFactory (Singleton)

SSL init/cleanup MUST be at app lifecycle, NOT per-client instance.

```swift
// In MeeshyApp.swift — ONCE at app launch:
RTCInitializeSSL()
let factory = RTCPeerConnectionFactory(
    encoderFactory: RTCDefaultVideoEncoderFactory(),
    decoderFactory: RTCDefaultVideoDecoderFactory()
)
WebRTCFactoryProvider.shared.configure(factory: factory)

// In MeeshyApp.swift — ONCE at app terminate:
RTCCleanupSSL()
```

WebRTCFactoryProvider is a thread-safe singleton with a `configure()` method that can only be called once. Subsequent calls are no-ops. Access via `WebRTCFactoryProvider.shared.factory` (non-optional after configure).

Remove RTCInitializeSSL()/RTCCleanupSSL() from P2PWebRTCClient init/deinit.

### 4.3 Peer Connection Configuration

```
RTCConfiguration:
  iceServers: [from server payload — injected at configure() time]
  iceTransportPolicy: .all
  bundlePolicy: .maxBundle
  rtcpMuxPolicy: .require
  sdpSemantics: .unifiedPlan
  continualGatheringPolicy: .gatherContinually
  candidateNetworkPolicy: .all
  tcpCandidatePolicy: .enabled

RTCMediaConstraints:
  mandatory: none
  optional: ["DtlsSrtpKeyAgreement": "true"]
```

### 4.4 Audio Configuration

```
Audio source constraints:
  echoCancellation: true
  noiseSuppression: true
  autoGainControl: true

Opus codec (via SDP munging on offer/answer):
  maxaveragebitrate: 128000
  stereo: 1
  sprop-stereo: 1
  useinbandfec: 1
  usedtx: 0
  maxplaybackrate: 48000

Audio session (managed by CallKit):
  category: .playAndRecord
  mode: .voiceChat
  options: [.defaultToSpeaker] when speaker enabled
```

### 4.5 Video Configuration

```
Camera:
  Default: front (builtInWideAngleCamera, .front)
  Format: highest <= 1280x720
  FPS: 30

Track: "meeshy-video-0"

Rendering:
  Local: RTCMTLVideoView, .scaleAspectFill, mirror: true
  Remote: RTCMTLVideoView, .scaleAspectFill

PiP: AVPictureInPictureVideoCallViewController
  sourceView: remote RTCMTLVideoView
```

### 4.6 Track Management

- Audio + video tracks added with streamIds: ["meeshy-stream-0"]
- RTCRtpSender stored for bitrate control
- Remote tracks from peerConnection(_:didAdd:stream)
- Mute: audioTrack.isEnabled toggle + emit call:toggle-audio { callId, enabled }
- Video off: stop capturer + track disable + emit call:toggle-video { callId, enabled }
- Camera switch: stop capturer, select opposite device, restart (no renegotiation)

### 4.7 Adaptive Bitrate

Thresholds defined as constants:

```swift
enum QualityThresholds {
    static let packetLossHigh: Double = 0.05
    static let packetLossLow: Double = 0.01
    static let rttHigh: Double = 300
    static let rttLow: Double = 100
    static let stableDuration: TimeInterval = 10
    static let bitrateReduction: Double = 0.70
    static let bitrateIncrease: Double = 1.20
    static let minAudioBitrate = 30_000
    static let maxAudioBitrate = 128_000
    static let minVideoBitrate = 100_000
    static let maxVideoBitrate = 2_500_000
}
```

Monitor every 3s, report every 10s via call:quality-report.

### 4.8 Resolution/FPS Degradation Ladder 🔧

> **Status**: To implement — `P2PWebRTCClient.swift` has fixed 720p/30fps selection. No runtime adaptation exists. Initial bandwidth estimate (64kbps audio, 500kbps video) not in `WebRTCTypes.swift`.

Adaptive bitrate (Section 4.7) adjusts bitrate but NOT resolution/FPS. For severe degradation, the video capture parameters must also adapt:

| Quality Level | RTT | Packet Loss | Resolution | FPS | Video Bitrate |
|--------------|-----|-------------|-----------|-----|--------------|
| Excellent | <100ms | <1% | 720p | 30 | 2500 kbps |
| Good | <200ms | <3% | 720p | 24 | 1500 kbps |
| Fair | <300ms | <5% | 480p | 20 | 800 kbps |
| Poor | >300ms | >5% | 360p | 15 | 400 kbps |
| Critical | >500ms | >10% | Audio-only | - | 0 (video disabled) |

**Implementation**: Adjust `RTCCameraVideoCapturer` format and FPS when quality level changes. Use `capturer.stopCapture()` → reconfigure → `capturer.startCapture()`. Debounce level changes by 5s to avoid rapid switching.

**Initial bandwidth estimate**: Start with conservative values (audio: 64kbps, video: 500kbps) on call connect. Scale up after first quality measurement at 3s mark. This prevents oversubscription in the first seconds of a call.

### 4.9 DTLS-SRTP Security

WebRTC SDK handles DTLS-SRTP negotiation automatically:
- **DTLS 1.2** for key exchange (negotiated via `DtlsSrtpKeyAgreement: true` in constraints)
- **SRTP with AES-128-CM-HMAC-SHA1-80** for media encryption
- **Certificate fingerprint** validated via SDP `a=fingerprint` attribute
- No custom cipher suite configuration needed — WebRTC SDK defaults are secure and compliant
- E2E encryption verification UI is Phase 2 (compare fingerprint hashes between parties)

### 4.10 Jitter Buffer

WebRTC SDK manages an adaptive jitter buffer internally:
- **Audio**: ~50-150ms buffer (auto-adjusts based on network jitter)
- **Video**: ~100-300ms buffer (trades latency for smoothness)
- Buffer size is NOT directly configurable via the iOS WebRTC SDK
- **Monitoring**: Track `jitterBufferDelay` and `jitterBufferTargetDelay` from RTCStatsReport for quality reporting
- On high jitter (>50ms sustained), the quality monitor should emit `call:quality-alert` with metric `jitter`

---

## 5. ICE & TURN Infrastructure

### 5.1 coturn Docker

```yaml
coturn:
  image: coturn/coturn:4.6
  container_name: meeshy-coturn
  network_mode: host
  volumes:
    - ./config/turnserver.conf:/etc/turnserver.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
  restart: unless-stopped
```

Security: network_mode host required for 16K UDP relay ports. Mitigate with iptables restricting coturn to 3478, 5349, 49152-65535 only.

### 5.2 turnserver.conf

```
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=<SERVER_PUBLIC_IP>
min-port=49152
max-port=65535
realm=meeshy.me
server-name=turn.meeshy.me
use-auth-secret
static-auth-secret=<SHARED_SECRET>
cert=/etc/letsencrypt/live/meeshy.me/fullchain.pem
pkey=/etc/letsencrypt/live/meeshy.me/privkey.pem
no-multicast-peers
no-cli
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
total-quota=100
stale-nonce=600
fingerprint
```

### 5.3 Ephemeral Credentials

```typescript
function generateTURNCredentials(userId: string) {
  const ttl = 3600
  const timestamp = Math.floor(Date.now() / 1000) + ttl
  const username = `${timestamp}:${userId}`
  const credential = crypto.createHmac('sha1', TURN_SHARED_SECRET).update(username).digest('base64')
  return { username, credential }
}
```

### 5.4 DNS & Firewall

- A record: turn.meeshy.me -> same IP as meeshy.me
- Ports: 3478/tcp+udp, 5349/tcp, 49152-65535/udp

---

## 6. CallKit Integration

### 6.1 Provider Configuration

```swift
config.maximumCallsPerCallGroup = 1
config.maximumCallGroups = 1
config.supportsVideo = true
config.supportedHandleTypes = [.generic]
config.ringtoneSound = "meeshy_ringtone.caf"
config.includesCallsInRecents = true
```

### 6.2 Outgoing Call Flow

```
User taps Call -> CallManager.startCall()
  -> CXCallController.request(CXStartCallAction)
  -> provider delegate: startCallAction
    -> action.fulfill()
    -> emit call:initiate, wait for ACK
    -> on ACK success: state = ringing(outgoing), wait for call:participant-joined
    -> on ACK failure: report failed to CXProvider, cleanup
```

### 6.3 Incoming Call Flow (Foreground)

```
call:initiated received -> CallManager
  -> CXProvider.reportNewIncomingCall(uuid, update)
  -> iOS shows native call banner

Accept -> provider delegate: answerCallAction
  -> action.fulfill()
  -> emit call:join, wait for ACK with iceServers
  -> configure WebRTC with iceServers, start local media
  -> wait for call:signal(offer) from caller

Reject -> provider delegate: endCallAction
  -> action.fulfill()
  -> emit call:end reason "rejected"
```

### 6.4 VoIP Push (Phase 2 Note)

Phase 1 handles incoming calls only when app is foreground (Socket.IO connected). Phase 2 adds PushKit/PKPushRegistry for background/killed app calls. Phase 1 architecture is designed to support Phase 2 without breaking changes.

### 6.5 Audio Session

CallKit owns the audio session. Remove manual setActive calls from WebRTCService.

### 6.6 System Interruptions

- Cellular call: hold via setHeldCallAction
- Siri: temporary mute via CallKit
- FaceTime: same as cellular

---

## 7. UI States & Transitions

### 7.1 State A — Full-Screen

- Remote video: RTCMTLVideoView full screen (or avatar for audio)
- Local PiP: 100x140pt, draggable, snaps to corners, tap to flip camera
- Control bar: Mute, Speaker, Video, Camera Flip, Transcript toggle, End
- Transcript overlay: bottom, blur bg, color-coded, last 3 segments, hidden by default
- Swipe down: triggers AVPictureInPictureController + displayMode = .pip

### 7.2 State B — PiP + Pill

- System PiP: AVPictureInPictureVideoCallViewController (video only)
- Pill: 64pt, glass bg, avatar + name + duration + mute/expand/hangup
- Injected in Router ZStack with zIndex(999)
- Tap pill: stop PiP, return to State A
- Audio-only: pill only, no PiP

### 7.3 Transitions

| Transition | Animation |
|-----------|-----------|
| A -> B | Spring(0.5, 0.8), shrink + PiP appear |
| B -> A | Spring(0.4, 0.75), expand + PiP stop |
| Incoming appear | Slide top + spring |
| Ended | Fade 0.3s, 3s delay, dismiss |

### 7.4 iPad Multitasking

- **Split View**: Call UI adapts to compact width. Local PiP shrinks to 80x112pt. Controls become icon-only (no labels).
- **Slide Over**: Same as Split View compact layout.
- **PiP during multitasking**: System PiP (State B) stays active during Split View/Slide Over. User can interact with other apps while in PiP.
- **Stage Manager (iPadOS 16+)**: Call window can be resized. Minimum window size: 400x300pt. Below that, auto-switch to PiP.

### 7.5 Haptic Feedback 🔧

> **Status**: To implement — `CallManager.swift` only has basic haptics on initiation/answer. Missing: connect, disconnect, reconnecting, quality transitions.

| Event | Haptic | Pattern |
|-------|--------|---------|
| Call connected | `.impact(.heavy)` | Single heavy impact |
| Call disconnected | `.notification(.warning)` | Warning notification |
| Reconnecting | `.impact(.light)` | Light impact every 2s while reconnecting |
| Quality degraded (→ Poor) | `.notification(.error)` | Error notification (once per transition) |
| Quality restored (→ Good+) | `.notification(.success)` | Success notification |
| Screen recording detected | `.notification(.warning)` | Warning notification |
| Reduce Motion enabled | No haptic | Respect `UIAccessibility.isReduceMotionEnabled` |

---

## 8. Transcription Pipeline

### 8.1 On-Device Speech Framework

```swift
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang))
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
request.requiresOnDeviceRecognition = true
request.addsPunctuation = true
```

### 8.2 Dual-Stream Diarization (P2P)

- Local audio -> Speech framework -> segments (speakerId = self.userId)
- Remote audio -> Speech framework -> segments (speakerId = remote.userId)
- Merge chronologically by startTime
- No ML diarization needed (streams naturally separated)

### 8.3 Privacy & Consent

- All on-device, no audio sent to server
- Toggle per call in control bar
- When enabled, other participant sees "Transcription active" indicator
- Transcript stored in call-summary only if initiator enabled it

---

## 9. Post-Call Summary & Export

### 9.1 Call Summary Message

```typescript
{
  type: 'call-summary',
  content: '',
  metadata: {
    callId, callType, duration, participants,
    endReason: CallEndReason,
    transcriptionEnabled: boolean,
    transcription: {  // AttachmentTranscription shape
      type: 'audio', text, language, confidence,
      source: 'mobile', segments: TranscriptionSegment[],
      speakerCount: 2, primarySpeakerId, durationMs
    }
  }
}
```

Call-summary messages arrive via REST (message history) only. They are NOT pushed via Socket.IO live events. This means the Swift `MessageTranscriptionSegment` CodingKeys (snake_case) are correct for decoding these payloads.

### 9.2 Export: TXT, PDF, SRT via UIActivityViewController

### 9.3 Prisme Linguistique applies to call-summary messages

---

## 10. Shared Type Enrichments

### 10.1 Prisma Schema Migration

File: packages/shared/prisma/schema.prisma

Current CallStatus enum: `{ initiated, ringing, active, ended, missed, rejected }`

New CallStatus enum: `{ initiated, ringing, connecting, active, reconnecting, ended, missed, rejected, failed }`

Note: `connecting`, `reconnecting`, and `failed` are persisted to DB so the server can run garbage collection queries against them.

New CallEndReason enum: `{ completed, missed, rejected, failed, connectionLost, heartbeatTimeout, garbageCollected }`

Add to CallSession model:
```
endReason            CallEndReason?
transcriptionEnabled Boolean @default(false)
```

The Prisma `transcriptionEnabled` field replaces the optional `CallMetadata.transcriptionEnabled` in the JSON metadata blob. The Prisma field is the source of truth.

### 10.2 video-call.ts Enrichments

File: packages/shared/types/video-call.ts

```typescript
// SYNC with Prisma
export type CallStatus = 'initiated' | 'ringing' | 'connecting' | 'active' | 'reconnecting' | 'ended' | 'missed' | 'rejected' | 'failed'

// NEW
export type CallEndReason = 'completed' | 'missed' | 'rejected' | 'failed' | 'connectionLost' | 'heartbeatTimeout' | 'garbageCollected'

// UPDATE WebRTCSignalType — keep extends WebRTCSignalBase pattern
export type WebRTCSignalType = 'offer' | 'answer' | 'ice-restart'
// In WebRTCOfferAnswerSignal: change type from 'offer' | 'answer' to WebRTCSignalType

// UPDATE CallEndedEvent — add reason
export interface CallEndedEvent {
  readonly callId: string
  readonly duration: number
  readonly endedBy: string
  readonly reason: CallEndReason  // NEW
}

// UPDATE CallSession — add fields
// endReason?: CallEndReason
// transcriptionEnabled?: boolean
```

### 10.3 TranscriptionSegment (TypeScript)

Files: packages/shared/types/attachment-audio.ts AND attachment-transcription.ts (keep in sync)

```typescript
export interface TranscriptionSegment {
  // EXISTING
  text: string; startMs: number; endMs: number
  speakerId?: string; voiceSimilarityScore?: number
  confidence?: number; language?: string
  // NEW
  isFinal?: boolean
  translatedText?: string
  translatedLanguage?: string
}
```

### 10.4 MessageTranscriptionSegment (Swift)

File: packages/MeeshySDK/Sources/MeeshySDK/Models/TranscriptionModels.swift

```swift
public struct MessageTranscriptionSegment: Identifiable, Sendable, Codable, Equatable {
    public let id: UUID
    public let text: String
    public let startTime: Double?    // seconds (from TS startMs / 1000)
    public let endTime: Double?      // seconds (from TS endMs / 1000)
    public let speakerId: String?
    public let confidence: Double?
    public let language: String?
    public let voiceSimilarityScore: Double?
    public let isFinal: Bool?
    public let translatedText: String?
    public let translatedLanguage: String?

    // CodingKeys for snake_case REST API responses.
    // This struct is used for REST API (call-summary history) ONLY.
    // Socket.IO live payloads use camelCase and are decoded via
    // a separate SocketTranscriptionSegment without CodingKeys,
    // per project convention.
    enum CodingKeys: String, CodingKey {
        case id, text, confidence, language
        case startTime = "start_time"
        case endTime = "end_time"
        case speakerId = "speaker_id"
        case voiceSimilarityScore = "voice_similarity_score"
        case isFinal = "is_final"
        case translatedText = "translated_text"
        case translatedLanguage = "translated_language"
    }

    // Custom decode: convert ms from API to seconds
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? container.decode(UUID.self, forKey: .id)) ?? UUID()
        text = try container.decode(String.self, forKey: .text)
        if let ms = try container.decodeIfPresent(Double.self, forKey: .startTime) {
            startTime = ms / 1000.0
        } else { startTime = nil }
        if let ms = try container.decodeIfPresent(Double.self, forKey: .endTime) {
            endTime = ms / 1000.0
        } else { endTime = nil }
        speakerId = try container.decodeIfPresent(String.self, forKey: .speakerId)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        language = try container.decodeIfPresent(String.self, forKey: .language)
        voiceSimilarityScore = try container.decodeIfPresent(Double.self, forKey: .voiceSimilarityScore)
        isFinal = try container.decodeIfPresent(Bool.self, forKey: .isFinal)
        translatedText = try container.decodeIfPresent(String.self, forKey: .translatedText)
        translatedLanguage = try container.decodeIfPresent(String.self, forKey: .translatedLanguage)
    }
}
```

### 10.5 Socket.IO Events

File: packages/shared/types/socketio-events.ts

Add to CLIENT_EVENTS:
```typescript
CALL_HEARTBEAT: 'call:heartbeat',
CALL_QUALITY_REPORT: 'call:quality-report',
CALL_RECONNECTING: 'call:reconnecting',
CALL_RECONNECTED: 'call:reconnected',
```

Add to SERVER_EVENTS:
```typescript
CALL_MISSED: 'call:missed',
CALL_QUALITY_ALERT: 'call:quality-alert',
```

**Deprecation**: `CALL_LEAVE` is RETAINED in CLIENT_EVENTS but unused in P2P Phase 1. It will be used in Phase 2 group calls (leave without ending).

Update ClientToServerEvents type map with ACK callbacks (see Section 3.5).
Update ServerToClientEvents type map with new event payload types.

New payload types (with Zod schemas in validation/call-schemas.ts):

```typescript
export interface CallHeartbeatEvent { callId: string }
export interface ConnectionQualityStats {
  rtt: number; packetLoss: number; bitrate: number
  jitter?: number; codec?: string; resolution?: string
}
export interface CallQualityReportEvent { callId: string; stats: ConnectionQualityStats }
export interface CallMissedEvent { callId: string; conversationId: string; callerId: string; callerName: string }
export interface CallReconnectingEvent { callId: string; participantId: string; attempt: number }
export interface CallReconnectedEvent { callId: string; participantId: string }
export interface CallQualityAlertEvent {
  callId: string; participantId: string
  metric: 'rtt' | 'packetLoss' | 'bitrate' | 'jitter'
  value: number; threshold: number
}
```

---

## 11. Edge Cases & Failure Modes

### 11.1 Glare (Simultaneous Initiation)
Server rejects second initiate with CALL_ALREADY_ACTIVE. Client shows incoming call UI instead.

### 11.2 Network Loss During Call
ICE disconnected -> client emits call:reconnecting -> 5s wait -> ICE restart (type 'ice-restart') -> 3 attempts max -> ended(connectionLost).

### 11.3 Socket.IO Disconnect During Call
Gateway 5s grace. Auto-reconnect. Re-emit call:heartbeat on reconnect. Gateway re-adds to room. WebRTC media continues independently.

### 11.4 App Backgrounded
Audio continues (CallKit). Video paused. Heartbeat via background task. Resume on foreground.

### 11.5 App Killed
No heartbeat -> server ends after 60s. Other participant notified.

### 11.6 Infinite Ringing Prevention
Server: single 30s timer starts at INITIATED (not reset at RINGING transition). After 30s from session creation -> MISSED. Client: 30s timer -> ended(missed) -> auto-dismiss 3s.

### 11.7 Incomplete Hangup
Both sides emit call:end (idempotent). ICE closed/failed without call:ended -> cleanup locally. GC every 60s.

### 11.8 Cannot Recall After Failed Call
Server checks active calls: terminal states ignored. Stale active (no heartbeat 60s) force-ended. Client offers "Forcer la fin" on CALL_ALREADY_ACTIVE.

### 11.9 One-Sided Audio
Start local media BEFORE SDP exchange. Quality monitor detects zero inbound bitrate -> quality-alert -> UI warning.

### 11.10 Echo Prevention
Hardware AEC (.voiceChat), Opus, RTCMediaConstraints, CallKit audio routing.

### 11.11 Camera Permission Denied
.denied -> audio-only with toast. Mic denied -> abort.

### 11.12 Rapid Call/End/Call
3s cooldown in ended state. All ops idempotent.

### 11.13 ICE Candidate Burst
Client batches 200ms. Server rate limit 100/10s.

### 11.14 SDK Not Available
canImport(WebRTC) guard. Throws WebRTCError.notSupported.

### 11.15 Call Waiting (Second Incoming Call During Active Call) 🔧

> **Status**: To implement — current code silently rejects. `CXProviderConfiguration.maximumCallGroups = 1` must be increased to 2. No banner UI exists.

**Current behavior**: Silently reject with a log warning. **New behavior**:

1. When `call:initiated` arrives while `callState != .idle`:
   - Do NOT auto-reject
   - Show notification banner at top: "{callerName} vous appelle" with [Refuser] [Raccrocher et repondre]
   - Banner auto-dismisses after 15s (shorter than normal 30s ring — don't distract too long)
2. **Refuser**: Emit `call:end { callId, reason: 'rejected' }` for the incoming call. Continue current call.
3. **Raccrocher et repondre**: Emit `call:end` for current call → wait for `ended` state → auto-accept new call via `call:join`
4. **CallKit handles this natively**: CXProvider supports multiple calls. Use `CXSetHeldCallAction` if holding is desired (Phase 2 — for now, only end-and-switch).
5. **Server-side**: No change needed. Server allows multiple CallSessions for the same user (one active, one ringing).

### 11.16 Crash Recovery on App Restart 🔧

> **Status**: To implement — existing endpoint is conversation-scoped (`/api/conversations/:id/active-call`). A new user-scoped `GET /api/v1/calls/active` endpoint must be created. No app-launch recovery code exists.

If the app is killed during a call (crash, force-quit, OOM), on next launch:

1. **On app launch** (in `MeeshyApp.swift` or `AppDelegate`):
   ```swift
   // Query server for any active calls for this user
   let response = try await api.get("/api/v1/calls/active")
   if let activeCall = response.data {
       // Force-end the orphaned call
       try await api.delete("/api/v1/calls/\(activeCall.id)")
       Logger.calls.warning("Cleaned up orphaned call \(activeCall.id) from previous session")
   }
   ```
2. **New REST endpoint**: `GET /api/v1/calls/active` — returns the user's active call (if any) or 404
3. **Server GC already handles this** (60s heartbeat timeout), but client cleanup on launch reduces the window from 60s to instant
4. **Web**: Same pattern in `useEffect` on app mount — check for active calls and clean up

### 11.17 Codec Negotiation Failure

If SDP exchange completes but the agreed codecs are not supported by one peer:

1. **Detection**: `peerConnection(_:didChange:)` with `RTCSignalingState.haveRemoteOffer` and empty `codecs` in the SDP
2. **Audio fallback**: If Opus is not available (extremely rare), accept any audio codec. Log warning.
3. **Video fallback**: If neither H264 nor VP8 is available, fall back to audio-only call with toast: "Video non disponible avec cet appareil"
4. **SDP validation**: Before `setRemoteDescription`, parse the SDP and verify at least one audio codec is present. If not, reject and end call with reason `failed`.

### 11.18 Network Transition Bandwidth Adaptation

When `NWPathMonitor` detects a network change (WiFi → Cellular or vice versa):

1. **Immediately reduce video bitrate** to 500kbps (conservative) before ICE restart completes
2. **ICE restart** creates new candidates for the new interface
3. After ICE reconnects, quality monitor resumes and gradually increases bitrate based on measured bandwidth
4. **WiFi → Cellular**: Expect higher latency, lower bandwidth. Consider auto-switching to 480p/20fps
5. **Cellular → WiFi**: Expect lower latency, higher bandwidth. Allow quality monitor to scale up to 720p/30fps
6. **IP address change**: New ICE candidates are gathered automatically via `continualGatheringPolicy: .gatherContinually`

### 11.19 Screen Recording Detection 🔧

> **Status**: To implement — `UIScreen.isCaptured` not used anywhere in iOS codebase.

During video calls, monitor for screen recording:

```swift
// iOS
NotificationCenter.default.addObserver(forName: UIScreen.capturedDidChangeNotification) { _ in
    if UIScreen.main.isCaptured {
        // Notify remote participant via call:media-toggled
        emit call:screen-capture-detected { callId, participantId, isCapturing: true }
        // Remote shows indicator: "Enregistrement d'ecran detecte"
    }
}
```

- **Privacy indicator**: Both parties see a red dot + "REC" label in the call header
- **No blocking**: Do not prevent recording — just inform (matches FaceTime behavior)
- **Web**: Check `navigator.mediaDevices.getDisplayMedia` grants or `document.pictureInPictureElement` — harder to detect reliably

### 11.20 Socket.IO Reconnection State Synchronization

When Socket.IO disconnects and reconnects during an active call (WebRTC media continues independently):

1. On Socket.IO reconnect, **immediately**:
   - Re-join the call room: server re-adds socket to `call:${callId}` room
   - Emit `call:heartbeat { callId }` to prove liveness
   - Emit `call:reconnected { callId, participantId }` to inform remote
2. **Server-side**: On socket reconnect, verify call still exists and participant is still active. If call was ended during disconnect, emit `call:ended` to the reconnected client.
3. **Grace period**: Server already has 5s grace before treating disconnect as leave (Section 2.2). Socket.IO reconnect typically completes within 2-3s.

### 11.21 Audio Session Conflicts

When the user has Spotify/Apple Music playing and starts a Meeshy call:
- **CallKit automatically pauses** the other app's audio session (via `AVAudioSession.setActive(true)` with `.notifyOthersOnDeactivation`)
- On call end, CallKit deactivates the audio session, allowing the music app to resume
- **No custom code needed** — document this behavior for QA testing

### 11.22 Do Not Disturb Mode

- **CallKit respects DND settings automatically**: If DND is enabled, incoming calls are silenced per iOS system settings (favorites, repeated calls, etc.)
- **No custom code needed** — CallKit integration handles this
- **Silent mode**: CallKit still shows the call UI banner but without sound/vibration

---

## 12. Files Modified/Created

### New Files

| File | Purpose |
|------|---------|
| apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift | State B pill overlay |
| apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift | On-device Speech framework |
| infrastructure/config/turnserver.conf | coturn configuration |

### Deleted Files

| File | Reason |
|------|--------|
| apps/ios/WebRTCStubs.swift | Replaced by real SDK |

### Modified Files

| File | Changes |
|------|---------|
| packages/shared/prisma/schema.prisma | Add connecting, reconnecting, failed to CallStatus. Add CallEndReason enum. Add endReason, transcriptionEnabled to CallSession |
| packages/shared/types/video-call.ts | Sync CallStatus. Add CallEndReason. Extend WebRTCSignalType. Add reason to CallEndedEvent. Add fields to CallSession |
| packages/shared/types/socketio-events.ts | Add events to CLIENT_EVENTS, SERVER_EVENTS. Add ACK callbacks to ClientToServerEvents. Add payload types. Add Zod schemas |
| packages/shared/types/attachment-audio.ts | Add isFinal, translatedText, translatedLanguage to TranscriptionSegment |
| packages/shared/types/attachment-transcription.ts | Same additions (keep in sync) |
| packages/MeeshySDK/Sources/MeeshySDK/Models/TranscriptionModels.swift | Add fields, CodingKeys, custom decoder |
| apps/ios/Meeshy.xcodeproj/project.pbxproj | SPM webrtc-sdk/Specs, background modes |
| apps/ios/Meeshy/Info.plist | Background modes (voip, audio), PiP entitlement |
| apps/ios/MeeshyApp.swift | RTCInitializeSSL at launch, RTCCleanupSSL at terminate |
| apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift | Full rewrite with real SDK. Remove SSL init/deinit |
| apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift | Adaptive bitrate, quality monitor, ICE restart, remove manual audio session |
| apps/ios/Meeshy/Features/Main/Services/CallManager.swift | FULL REWRITE startCall() flow. Add DisplayMode, reconnecting, heartbeat, PiP, CallKit enhancements |
| apps/ios/Meeshy/Features/Main/Views/CallView.swift | RTCMTLVideoView, draggable PiP, transcript, swipe gesture |
| apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift | CallKit as primary, view as fallback |
| apps/ios/Meeshy/Features/Main/Navigation/Router.swift | Pill overlay in ZStack |
| services/gateway/src/services/CallService.ts | CHANGE endCall() to allow any participant. Add heartbeat, timeouts, GC cron, CallEndReason |
| services/gateway/src/socketio/CallEventsHandler.ts | Add new handlers. Change call:signal to targeted emit via socketToUser map. Add ACK callbacks. Use constants not raw strings |
| infrastructure/docker-compose.prod.yml | Add coturn service |

---

## Appendix A — Quality Targets

| Metric | Target | FaceTime Ref |
|--------|--------|-------------|
| Setup (ring to audio) | < 3s | ~2-3s |
| Audio latency | < 150ms | ~100-150ms |
| Video latency | < 200ms | ~150-200ms |
| Audio quality (Opus) | MOS > 4.0 | ~4.2 |
| Packet loss tolerance | < 10% | ~5-8% |
| Reconnection | < 10s | ~5-10s |
| Drop rate | < 1% | ~0.5% |
| Battery audio 1h | < 8% | ~5-7% |
| Battery video 1h | < 20% | ~15-18% |

## Appendix B — Error Codes

| Code | When | Client Behavior |
|------|------|----------------|
| CALL_ALREADY_ACTIVE | Initiate while call exists | Show incoming or force-end |
| CALL_NOT_FOUND | Signal for dead call | Reset to idle |
| NOT_AUTHENTICATED | No valid session | Re-login |
| MEDIA_PERMISSION_DENIED | No mic/camera | Settings redirect |
| RATE_LIMIT_EXCEEDED | Too many events | Exponential backoff |
| CONNECTION_FAILED | ICE/DTLS failure | ICE restart then end |
| MAX_PARTICIPANTS_REACHED | P2P full | "Appel complet" |
| SIGNAL_SENDER_MISMATCH | Spoofed signal | Silently drop |
| SIGNAL_TOO_LARGE | Signal > 64KB | Reject, log warning |
| TARGET_NOT_FOUND | Signal to ghost | Silently drop |

---

## 13. Web (Next.js) Implementation

### 13.1 Scope

The existing web codebase has partial WebRTC implementation:
- `apps/web/services/webrtc-service.ts` (~400 lines)
- `apps/web/stores/call-store.ts` (~320 lines, Zustand)
- `apps/web/components/video-calls/` (UI components)
- `apps/web/hooks/use-webrtc-p2p.ts`, `use-call-quality.ts`

The web implementation MUST mirror the iOS spec for consistency.

### 13.2 WebRTC Service Updates

File: `apps/web/services/webrtc-service.ts` (784 lines — already has SDP munging, RED, TWCC)

- ✅ Opus SDP munging already implemented (maxaveragebitrate=128000, stereo, FEC, DTX)
- ✅ Audio redundancy (RED) already implemented
- ✅ Transport-CC already implemented
- ✅ Video bitrate hints already implemented
- ✅ ICE restart on failed state already implemented
- **TODO**: Add ACK callback handling for call:initiate, call:join, call:signal, call:end
- **TODO**: Wait for `call:participant-joined` before creating SDP offer (currently creates offer immediately)
- **TODO**: Add adaptive bitrate (SDP hints exist but no dynamic runtime control based on quality)
- **TODO**: Add resolution/FPS degradation ladder matching iOS Section 4.8

### 13.3 Call Store Updates (Zustand)

File: `apps/web/stores/call-store.ts` (420 lines)

- ✅ CallStatus type with all 9 values already defined
- ✅ CallEndReason tracking already implemented (7 values)
- ✅ Heartbeat timer (15s interval) already implemented
- ✅ Reconnection state (attempt counter) already implemented
- **TODO**: Add audio effects state integration (track which effect is active)
- **TODO**: Add video filter state (track current VideoFilterConfig)
- **TODO**: Add per-participant connection quality (currently only call-wide)

### 13.4 Call Lifecycle Completion 🔧

> **Status**: To implement — only `startCall()` exists. `answerCall()`, `rejectCall()`, `endCall()`, `toggleAudio()`, `toggleVideo()` must be added.

File: `apps/web/hooks/conversations/use-video-call.ts` (147 lines — **INCOMPLETE**)

Currently only `startCall()` is implemented. Missing:

```typescript
// NEEDED:
function answerCall(callId: string): Promise<void>
  // emit call:join with ACK, receive iceServers, configure WebRTC,
  // set remote description from caller's offer, create answer

function rejectCall(callId: string): Promise<void>
  // emit call:end { callId, reason: 'rejected' }

function endCall(callId: string): Promise<void>
  // emit call:end { callId, reason: 'completed' }
  // stop all streams, close peer connections, reset store

function toggleAudio(callId: string, enabled: boolean): Promise<void>
  // emit call:toggle-audio, toggle local audio track

function toggleVideo(callId: string, enabled: boolean): Promise<void>
  // emit call:toggle-video, toggle local video track + capturer
```

### 13.5 TURN Server Integration (CRITICAL) 🔧

> **Status**: To implement — `createPeerConnection()` does NOT accept server-provided iceServers. Blocking for Phase 1 launch (~10-15% user failure rate without TURN).

File: `apps/web/services/webrtc-service.ts`

**Currently**: Only uses hardcoded Google STUN servers. TURN credentials from server are NOT used.

**Fix**: When `call:participant-joined` arrives with `iceServers`, pass them to `RTCPeerConnection` configuration:

```typescript
// In webrtc-service.ts — createPeerConnection()
const config: RTCConfiguration = {
  iceServers: iceServersFromServer,  // From call:participant-joined ACK
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};
const pc = new RTCPeerConnection(config);
```

Without TURN, calls will fail behind restrictive NATs/corporate firewalls (estimated 10-15% of users).

### 13.6 Quality Report Emission 🔧

> **Status**: To implement — stats collected locally but never emitted to server.

File: `apps/web/hooks/use-call-quality.ts` (222 lines)

**Currently**: Collects RTT, packet loss, bitrate, jitter locally but does NOT emit to server.

**Fix**: Add `call:quality-report` emission every 10 seconds:

```typescript
useEffect(() => {
  if (!callId || !stats) return;
  const interval = setInterval(() => {
    socket.emit('call:quality-report', {
      callId,
      stats: { rtt: stats.rtt, packetLoss: stats.packetLoss, bitrate: stats.bitrate, jitter: stats.jitter }
    });
  }, 10_000);
  return () => clearInterval(interval);
}, [callId, stats]);
```

### 13.7 Audio Effects → WebRTC Stream Integration 🔧

> **Status**: To implement — hook outputs processed stream but it's not connected to WebRTC.

File: `apps/web/utils/audio-effects.ts` + `apps/web/hooks/use-audio-effects.ts`

**Currently**: Audio effects output a processed `MediaStream` via `MediaStreamAudioDestinationNode`. This stream is used for recording. It is NOT connected to the WebRTC `RTCPeerConnection`.

**Integration pattern**:
1. Get the processed stream from `useAudioEffects` output
2. Find the audio sender: `peerConnection.getSenders().find(s => s.track?.kind === 'audio')`
3. Replace the track: `sender.replaceTrack(processedStream.getAudioTracks()[0])`
4. On effect disable: `sender.replaceTrack(originalMicTrack)`
5. Clean stream for transcription: keep original `getUserMedia` stream for Web Speech API / server-side Whisper

### 13.8 Browser Compatibility

| Feature | Chrome 120+ | Safari 17+ | Firefox 120+ |
|---------|------------|-----------|-------------|
| VP8/H.264 | ✅ | ✅ | ✅ |
| Opus | ✅ | ✅ | ✅ |
| Insertable Streams | ✅ | ✅ (18+) | ❌ |
| Screen Sharing | ✅ | ✅ | ✅ |
| Tone.js (audio effects) | ✅ | ✅ | ✅ |
| WebGL (video filters) | ✅ | ✅ | ✅ |
| replaceTrack() | ✅ | ✅ | ✅ |

Safari-specific: HTTPS required, getUserMedia constraints must use exact instead of ideal for resolution. Mono→stereo upmix needed (already handled in `useAudioEffects`).

---

## 14. Video Processing Pipeline

### 14.1 Allowed Filters

**Colorimetry filters only** (always available):
- Color temperature (warm/cool white balance via CITemperatureAndTint)
- Tint (green-to-magenta correction)
- Brightness (-1.0 to 1.0)
- Contrast (0.5 to 4.0)
- Saturation (0.0 to 2.0)
- Exposure (EV stops)

**NOT allowed**: Face detection, face filters, beauty mode, background blur, AR effects, 3D mesh, Snapchat-style lenses, LUT color grading. Only colorimetry adjustments are in scope.

### 14.1.1 Filter Presets

Users should not need to manually adjust 6 sliders. Provide presets:

| Preset | Temperature | Tint | Brightness | Contrast | Saturation | Exposure |
|--------|-------------|------|------------|----------|------------|----------|
| Natural | 6500 | 0 | 0 | 1.0 | 1.0 | 0 |
| Warm | 7500 | 5 | 0.02 | 1.05 | 1.1 | 0 |
| Cool | 5500 | -5 | 0 | 1.05 | 0.95 | 0 |
| Vivid | 6500 | 0 | 0.03 | 1.15 | 1.3 | 0.1 |
| Muted | 6500 | 0 | -0.02 | 0.9 | 0.7 | -0.1 |

Presets are starting points — user can customize after selecting.

### 14.1.2 Dark Frame Detection

`VideoFilterCapturerDelegate` samples every 10th frame for brightness analysis. On persistent dark frames (>3 seconds of consecutive dark frames):
- Show toast: "Votre camera semble obstruee"
- Offer button to switch camera (front ↔ back)
- If dark persists 10s after switch, suggest "Verifier l'eclairage"

### 14.2 iOS Implementation

```swift
// CIFilter chain on RTCCameraVideoCapturer output
class VideoFilterPipeline {
    private let context = CIContext(options: [.useSoftwareRenderer: false])

    func process(_ pixelBuffer: CVPixelBuffer) -> CVPixelBuffer {
        var image = CIImage(cvPixelBuffer: pixelBuffer)
        image = image.applyingFilter("CITemperatureAndTint", parameters: [
            "inputNeutral": CIVector(x: CGFloat(temperature), y: 0),
            "inputTargetNeutral": CIVector(x: 6500, y: 0)
        ])
        image = image.applyingFilter("CIColorControls", parameters: [
            "inputBrightness": brightness,
            "inputContrast": contrast,
            "inputSaturation": saturation
        ])
        context.render(image, to: pixelBuffer)
        return pixelBuffer
    }
}
```

Performance budget: <2ms per frame at 30fps 720p on iPhone 12+.

### 14.3 Web Implementation

WebGL shader pipeline on `<canvas>` element:
1. Video frame → WebGL texture
2. Apply color temperature/brightness/contrast fragment shader
3. Output → `canvas.captureStream()` → WebRTC track

### 14.4 Performance & Memory

- **GPU rendering**: `CIContext(options: [.useSoftwareRenderer: false, .cacheIntermediates: false])` — Metal-accelerated, no intermediate cache accumulation
- **Skip-if-default**: Each filter step checks if parameters are at default values and skips processing (zero cost when neutral)
- **In-place rendering**: `context.render(image, to: pixelBuffer)` writes back to same buffer — no copy
- **Memory for long calls**: CIContext with `.cacheIntermediates: false` prevents memory growth. No additional cleanup needed
- **Thermal throttling**: When `ProcessInfo.thermalState == .critical`, auto-disable filters (return raw pixelBuffer)
- **iPad Split View**: Filters remain active during multitasking — PiP video is filtered

---

## 15. Audio Effects Pipeline

### 15.1 Existing Effects (Reuse from Recording)

| Effect | Parameters | Web Status | iOS Status |
|--------|-----------|-----------|-----------|
| VoiceCoder | pitch, harmonization, strength, retuneSpeed, scale, key, naturalVibrato | ✅ Implemented (Tone.js + Pitchy) | ❌ New (AVAudioEngine) |
| BabyVoice | pitch (+6 to +12), formant (1.2-1.5x), breathiness (pink noise) | ✅ Implemented | ❌ New |
| DemonVoice | pitch (-8 to -12), distortion, reverb (3-8s decay) | ✅ Implemented | ❌ New |
| BackSound | soundFile, volume (0-100%), loopMode (N_TIMES/N_MINUTES) | ✅ Implemented | ❌ New |

Source of truth: `packages/shared/types/video-call.ts` (AudioEffectType, VoiceCoderParams, BabyVoiceParams, DemonVoiceParams, BackSoundParams)
Web implementation: `apps/web/utils/audio-effects.ts` (652 lines, 4 AudioEffectProcessor classes)
Web hook: `apps/web/hooks/use-audio-effects.ts` (470 lines, Tone.js pipeline management)

### 15.1.1 Effect Mutual Exclusivity Rules 🔧

Voice effects (VoiceCoder, BabyVoice, DemonVoice) are **mutually exclusive** — only one can be active at a time. Enabling VoiceCoder automatically disables BabyVoice/DemonVoice and vice versa.

BackSound **can be combined** with any voice effect (it operates on a separate audio graph branch).

When BackSound is active during a call:
- Show warning toast on activation: "La musique de fond sera entendue par votre correspondant"
- Auto-duck BackSound volume by -12dB when voice activity is detected (WebRTC VAD or Silero VAD)
- Resume full volume after 500ms of silence

### 15.2 Dual-Stream Architecture 📐

> **Status**: Design only — neither iOS nor Web implements the dual-stream split yet. `useAudioEffects` outputs one processed stream. Clean path for transcription must be added.

During a call, audio effects create TWO streams:
1. **Processed stream** → sent to remote participant (they hear the effect)
2. **Clean stream** → fed to Speech framework for transcription (no effect artifacts)

```
Microphone (raw PCM)
    │
    ├──[CLEAN PATH]──→ SFSpeechRecognizer (transcription)
    │                   No effects, no noise suppression bypass
    │                   WebRTC noiseSuppression/echoCancellation ACTIVE here
    │
    └──[EFFECTS PATH]──→ Effect chain ──→ RTCPeerConnection send track
                         VoiceCoder OR BabyVoice OR DemonVoice
                         + BackSound (optional mix)
                         WebRTC noiseSuppression BYPASSED here
                         (effects would be suppressed as "noise")
```

**CRITICAL**: When audio effects are enabled, the processed stream MUST bypass WebRTC's built-in `noiseSuppression` constraint. Otherwise, the noise suppression algorithm will attempt to remove the effect artifacts (distortion, pitch-shifted harmonics, etc.) treating them as noise. The clean stream retains full noise suppression for transcription quality.

### 15.3 Web: Reuse `useAudioEffects()` Hook 🔧

> **Status**: Hook exists and outputs a processed `MediaStream`. Missing: dual-stream split (clean path), `replaceTrack()` integration with WebRTC, dynamic `noiseSuppression` toggling, mutual exclusivity enforcement.

The existing `useAudioEffects()` hook (`apps/web/hooks/use-audio-effects.ts`) manages the Tone.js audio pipeline. For live calling:

1. **Input**: `getUserMedia()` returns a `MediaStream` with the raw microphone track
2. **Split**: The raw stream feeds both the clean path and the effects path
3. **Effects path**: Tone.js `UserMedia` → effect chain → `MediaStreamAudioDestinationNode` → processed `MediaStream`
4. **Track replacement**: Replace the raw audio track in WebRTC with the processed track:

```typescript
const sender = peerConnection.getSenders().find(s => s.track?.kind === 'audio');
if (sender && processedStream) {
  await sender.replaceTrack(processedStream.getAudioTracks()[0]);
}
```

5. **Clean path**: Original `MediaStream` audio track continues feeding `SFSpeechRecognizer` (web: Web Speech API or server-side Whisper)
6. **Toggle**: When effects are disabled, call `replaceTrack()` again with the original raw track
7. **Noise suppression**: When effects are active, recreate the audio track with `noiseSuppression: false` for the processed path. The clean path retains `noiseSuppression: true`.

**Existing mono→stereo upmix** (iOS Safari fix) in `useAudioEffects` applies automatically.

### 15.4 iOS: New `CallAudioEffectsService` 📐

> **Status**: Design only — no AVAudioEngine code exists in the iOS codebase. Files `CallAudioEffectsService.swift` and `MeeshyAudioDeviceModule.swift` must be created from scratch.

**IMPORTANT**: No `AVAudioEngine` code exists in the iOS codebase today. This is a full new implementation.

#### 15.4.1 Architecture Challenge

WebRTC's `RTCAudioTrack` on iOS does not expose raw PCM samples directly. The WebRTC SDK manages its own audio device module internally. To inject processed audio, we use the **Custom Audio Device Module** approach:

```swift
// Custom audio device that intercepts microphone input
// and routes it through AVAudioEngine before sending to WebRTC
final class MeeshyAudioDeviceModule: NSObject, RTCAudioDevice {
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()  // For BackSound
    private var effectNodes: [AVAudioNode] = []

    // RTCAudioDevice protocol — WebRTC calls this to get audio samples
    func deliverRecordedData(
        _ buffer: UnsafeMutableRawPointer,
        sampleRate: Int,
        numberOfChannels: Int,
        numberOfFrames: Int
    ) -> Int {
        // 1. Read raw mic samples from AVAudioEngine input node
        // 2. Route through effect chain
        // 3. Copy processed samples to buffer
        // 4. Return number of frames written
    }
}
```

Alternatively, if the WebRTC SDK version does not expose `RTCAudioDevice`, use `RTCAudioRenderer` to tap audio + `AVAudioSourceNode` to inject:

```swift
// Approach B: Tap + re-inject
// 1. Mic → AVAudioEngine inputNode → install tap (get raw PCM)
// 2. Raw PCM → AVAudioEngine processing chain → processed PCM
// 3. Processed PCM → custom RTCAudioSource → RTCAudioTrack
//
// Clean path: Raw PCM from tap → SFSpeechAudioBufferRecognitionRequest.append()
```

#### 15.4.2 AVAudioEngine Effect Chain

```swift
final class CallAudioEffectsService: ObservableObject {
    private let engine = AVAudioEngine()
    private var currentEffect: CallAudioEffect?  // Mutually exclusive

    enum CallAudioEffect {
        case voiceCoder(VoiceCoderNode)
        case babyVoice(BabyVoiceNode)
        case demonVoice(DemonVoiceNode)
    }

    // Effect node mapping:
    //
    // VoiceCoder:
    //   AVAudioUnitTimePitch (pitch shift: -12 to +12 semitones)
    //   + AVAudioUnitDelay (chorus for harmonization, 20-40ms delay, mix 0.3)
    //   + Wet/dry mix via AVAudioMixerNode
    //
    // BabyVoice:
    //   AVAudioUnitTimePitch (pitch shift: +6 to +12 semitones)
    //   + AVAudioUnitEQ (high-pass at 800Hz * formant)
    //   + AVAudioPlayerNode (pink noise for breathiness, volume 0-20%)
    //
    // DemonVoice:
    //   AVAudioUnitTimePitch (pitch shift: -8 to -12 semitones)
    //   + AVAudioUnitDistortion (overdrive preset, wetDryMix based on distortion param)
    //   + AVAudioUnitReverb (cathedral preset, 3-8s decay)
    //   + AVAudioUnitEQ (low-pass at 2000Hz for darkness)
    //
    // BackSound (independent branch, combinable with any voice effect):
    //   AVAudioPlayerNode (load audio file, loop mode)
    //   + AVAudioMixerNode (volume control, auto-duck on VAD)
    //   Mixed into main output via AVAudioMixerNode

    func setEffect(_ effect: CallAudioEffect?) {
        // Tear down previous effect nodes
        // Connect new effect nodes to engine graph
        // engine graph: inputNode → [effect chain] → mixerNode → outputNode
        // If BackSound active, merge BackSound branch into mixerNode
    }

    func updateParams(_ params: AudioEffectParamsUnion) {
        // Real-time parameter updates (thread-safe via AVAudioEngine main thread)
    }
}
```

#### 15.4.3 Dual-Stream Split (iOS)

```swift
// In CallManager or WebRTCService:

// 1. Install tap on AVAudioEngine inputNode for CLEAN audio
engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, time in
    // Feed clean audio to Speech framework for transcription
    self.transcriptionService.appendAudioBuffer(buffer)
}

// 2. Effect chain processes audio and outputs to WebRTC
// The processed output from AVAudioEngine's outputNode feeds into
// the custom RTCAudioSource (see 15.4.1)

// 3. When effects disabled: bypass effect chain, route input directly to output
```

#### 15.4.4 Performance Budget

- **Target**: <5ms total latency for the effect chain at 48kHz, 1024-sample buffers
- **AVAudioUnitTimePitch**: ~2ms (hardware-accelerated on Apple Silicon)
- **AVAudioUnitDistortion**: ~1ms
- **AVAudioUnitReverb**: ~1ms
- **AVAudioMixerNode**: <0.5ms
- **Total chain**: ~4.5ms (within budget)
- **Monitoring**: Log processing time per buffer; if >5ms for 10 consecutive buffers, disable effects and show toast "Effets audio desactives (performances insuffisantes)"

#### 15.4.5 Effect Lifecycle During Calls

1. **Activation**: User taps effect in control bar → `setEffect(.voiceCoder(...))` → rebuild engine graph → `replaceTrack()` on WebRTC sender
2. **Parameter update**: User adjusts slider → `updateParams()` → real-time change (no graph rebuild)
3. **Deactivation**: User taps active effect → `setEffect(nil)` → bypass chain → `replaceTrack()` with clean audio
4. **Call end**: `engine.stop()` → remove all taps → deallocate nodes
5. **Backgrounding**: Effects continue (AVAudioEngine runs in background with CallKit audio session)
6. **Thermal critical**: Auto-disable effects, show toast, keep clean audio flowing

---

## 16. Real-Time Transcription & Translation

### 16.1 Architecture

```
Local mic → Speech Framework → text segments ─→ Socket.IO → Translator
                                                              ├─ NLLB translation
                                                              └─ translated segment → remote client
Remote audio → Speech Framework → text segments (local display)
```

### 16.2 On-Device Transcription (Primary)

**iOS 16-18**: `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`
**iOS 26+**: `SpeechAnalyzer` with `DictationTranscriber` (better accuracy, long-form support)

Configuration:
```swift
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang))
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
request.requiresOnDeviceRecognition = true
request.addsPunctuation = true
```

#### 16.2.1 SFSpeechRecognizer 1-Minute Limit Rotation (CRITICAL) 🔧

> **Status**: To implement — `CallTranscriptionService.swift` does NOT handle this. Calls >60s will lose transcription.

Apple's `SFSpeechRecognizer` limits continuous recognition to ~1 minute per request. After that, the recognition task fires `isFinal=true` and stops accepting audio. **The current `CallTranscriptionService` does NOT handle this.**

**Solution — Seamless Request Rotation:**

```swift
// In CallTranscriptionService:
func handleRecognitionResult(_ result: SFSpeechRecognitionResult?, error: Error?, stream: StreamRecognizer) {
    guard let result else {
        if let error {
            // Recognition ended (1-minute limit or error)
            // Immediately create a new request and continue
            rotateRecognitionRequest(for: stream)
        }
        return
    }

    if result.isFinal {
        // 1-minute limit reached — Apple sends final result
        // Buffer the last partial text to avoid dropping words at boundary
        let boundaryText = result.bestTranscription.formattedString

        // Rotate: create new SFSpeechAudioBufferRecognitionRequest
        rotateRecognitionRequest(for: stream, boundaryText: boundaryText)
    } else {
        // Normal partial result — update UI
        processPartialResult(result, for: stream)
    }
}

private func rotateRecognitionRequest(for stream: StreamRecognizer, boundaryText: String? = nil) {
    // 1. End current request
    stream.request?.endAudio()
    stream.task?.cancel()

    // 2. Create new request (same recognizer, new request object)
    let newRequest = SFSpeechAudioBufferRecognitionRequest()
    newRequest.shouldReportPartialResults = true
    newRequest.requiresOnDeviceRecognition = true
    newRequest.addsPunctuation = true

    // 3. Start new recognition task
    stream.request = newRequest
    startRecognitionTask(for: stream)

    // 4. Audio tap continues feeding buffers to the new request seamlessly
    // No gap in audio capture — the AVAudioEngine tap is not interrupted

    Logger.calls.info("Rotated SFSpeech request for \(stream.speakerId), boundary: \(boundaryText ?? "none")")
}
```

**Key behaviors:**
- Rotation is transparent to the user (no visible interruption)
- Last 2-3 words may be duplicated across boundary — dedup by comparing with `boundaryText`
- Average rotation every ~55-60 seconds
- If rotation fails 3 times consecutively, fall back to server-assisted Whisper for that stream

### 16.3 Dual-Stream Diarization

P2P calls have naturally separated audio streams — no ML diarization needed:
- Local audio → transcription with `speakerId = self.userId`
- Remote audio → transcription with `speakerId = remote.userId`
- Merge chronologically by `startTime`

### 16.4 Server-Assisted Translation

New Socket.IO events:
```typescript
CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT: 'call:transcription-segment'
CLIENT_EVENTS.CALL_TRANSLATION_REQUEST: 'call:translation-request'
CLIENT_EVENTS.CALL_TRANSLATION_RESPONSE: 'call:translation-response'
SERVER_EVENTS.CALL_TRANSLATED_SEGMENT: 'call:translated-segment'
SERVER_EVENTS.CALL_TRANSLATION_REQUESTED: 'call:translation-requested'
```

#### 16.4.1 Translation Consent Flow 📐

> **Status**: Design only — events `call:translation-request`, `call:translation-response`, `call:translation-requested` do NOT exist in `socketio-events.ts` yet. Must be added.

Translation sends transcription text to the server (NLLB). This requires **explicit consent from both parties**:

```
Alice taps "Traduction" button
  → emit call:translation-request { callId, sourceLanguage }
  → Server relays call:translation-requested to Bob
  → Bob sees banner: "Alice souhaite activer la traduction en temps reel"
     [Accepter] [Refuser]

Bob taps Accepter:
  → emit call:translation-response { callId, accepted: true }
  → Server enables translation for this call
  → Both clients see "Traduction active" indicator
  → Transcription segments now sent to server for NLLB translation

Bob taps Refuser:
  → emit call:translation-response { callId, accepted: false }
  → Alice sees toast: "Bob a refuse la traduction"
  → Transcription stays on-device only
```

Either party can disable translation at any time by tapping the translation button again. This sends `call:translation-request { callId, disable: true }` and immediately stops sending segments to the server.

#### 16.4.2 Translation Pipeline Flow

1. Client sends final transcription segment to server via `call:transcription-segment`
2. Gateway routes to Translator service via ZMQ (fast queue — short text <100 chars)
3. Translator runs NLLB translation to remote user's `preferredContentLanguages` (resolved via `resolveUserLanguage()` from `packages/shared/utils/conversation-helpers.ts`)
4. Translator returns via ZMQ PUB socket
5. Gateway pushes `call:translated-segment` to remote client
6. Remote UI displays translated text (**Prisme Linguistique applies**: show in user's `systemLanguage`, fall back to `regionalLanguage`, then original)

#### 16.4.3 Whisper Chunking for Server-Assisted Mode 📐

> **Status**: Design only — `call:audio-chunk` and `call:transcription-result` events do not exist. Translator service uses ZMQ batch processing; this proposes Socket.IO binary for lower latency (architectural decision needed).

The current translator uses batch Whisper processing (not streaming). For server-assisted transcription during calls:

1. Client accumulates 3-5 second audio chunks (configurable, start at 4s)
2. Send audio chunk via Socket.IO binary event `call:audio-chunk` (not ZMQ — latency sensitive)
3. Gateway forwards to Translator ZMQ with `type: "call_transcription"` and `priority: "fast"`
4. Translator runs Whisper distil-large-v3 on the chunk (~200-400ms for 4s audio)
5. Result pushed back as `call:transcription-result` with text, language, confidence
6. Client displays result and chains with NLLB translation if enabled

**Chunk overlap**: Each chunk overlaps the previous by 500ms to avoid word-boundary cuts.
**Silence detection**: Skip sending chunks that are pure silence (save bandwidth and compute).

### 16.5 Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Background noise | VAD (Silero) filters non-speech; Speech framework handles naturally |
| Echo from speaker | Hardware AEC (CallKit .voiceChat) prevents; clean stream for transcription |
| Cross-talk | Dual-stream separation; each stream transcribed independently |
| Code-switching | See 16.5.1 below |
| Connection drop mid-sentence | Mark last segment as `isFinal: false`, merge on reconnect |
| Low bandwidth audio (16kbps) | Server-side Whisper for better accuracy on degraded audio |
| Opus compression artifacts | Whisper trained on compressed audio; minimal accuracy loss |
| 1-minute SFSpeech limit | Request rotation (see 16.2.1) |
| Translation >3s latency | Show "..." indicator, then swap text when ready (see 16.6) |
| Both parties same language | Translation is no-op; server detects source==target and skips NLLB |
| Unsupported language pair | Show original text with "Traduction non disponible" badge |
| Audio effects active | Clean stream (no effects) feeds transcription; effects only on send stream |

#### 16.5.1 Code-Switching (Multilingual Speech)

When a speaker switches languages mid-sentence (e.g., French→English→French), the on-device `SFSpeechRecognizer` may produce low-confidence results since it's initialized with a single locale.

**Fallback strategy:**
1. Monitor `confidence` on transcription segments
2. If average confidence drops below 0.3 for 3 consecutive segments, switch to server-assisted Whisper for that speaker's stream
3. Whisper (distil-large-v3) handles multilingual speech natively
4. Show subtle indicator: "Transcription serveur active (meilleure precision multilingue)"
5. Return to on-device when user speaks consistently in one language (confidence >0.7 for 5 segments)

### 16.6 Latency Target & UX

Speech → capture → encode → decode → transcribe → translate → display: **< 2 seconds**.

Breakdown:
- On-device transcription: ~300ms (partial result)
- Socket.IO round trip: ~100ms
- NLLB translation: ~200-500ms (single sentence, fast queue)
- UI render: ~16ms

**When translation is slow (>2s):**
1. Show partial transcription immediately in original language (from on-device Speech)
2. Show "..." typing indicator next to the segment while translation is pending
3. When translation arrives, smoothly replace original text with translated text (cross-fade animation, 200ms)
4. If translation takes >5s, keep original text and show small translate icon (tap to retry)
5. Never block the transcription overlay waiting for translation — always show something

### 16.7 Privacy Modes

- **On-device only** (default): Transcription stays on device, no server involvement
- **Server-assisted**: Audio chunks sent to Whisper for higher accuracy (opt-in, single-party consent)
- **Translation mode**: Transcription sent to server for NLLB translation (requires consent from both parties — see 16.4.1)

### 16.8 Prisme Linguistique for Transcription Overlay 🔧

> **Status**: To implement — iOS `TranscriptionSegment` struct in `CallTranscriptionService.swift` lacks `translatedText: String?` and `translatedLanguage: String?` fields. Must be added to match TypeScript type.

The transcription overlay MUST respect the Prisme Linguistique principles:

1. **Display language**: Show segments in the user's preferred content language (`resolveUserLanguage()` from `packages/shared/utils/conversation-helpers.ts`), not the speaker's language
2. **Resolution order**: `systemLanguage` > `regionalLanguage` > `customDestinationLanguage` > `'fr'`
3. **If translation available** (from server NLLB): Show `translatedText` in the segment
4. **If no translation** (on-device only mode, or same language): Show original `text`
5. **Never use device locale** (`Locale.current`) for content display — only for UI strings
6. **Subtle indicator**: Small flag emoji or language code badge next to translated segments (e.g., "🇬🇧" for English translation)
7. **Long press**: Reveal original text in a tooltip/popover

### 16.9 Transcription Overlay Speaker Diarization Display

Segments from different speakers must be visually distinguishable:
- **Local speaker**: Segments use conversation `accentColor` (primary from `ColorGeneration.swift`)
- **Remote speaker**: Segments use conversation `secondaryColor` (hue-shifted +30°)
- **Format**: `[SpeakerName] text` with speaker name in bold, truncated to first name
- **Last 3 segments visible** (configurable), oldest fade out with 200ms animation
- **Scroll gesture**: Swipe up on overlay to reveal full transcript (up to 50 segments)

---

## 17. Multi-Device Handling

### 17.1 Simultaneous Ringing

Both iOS and Web devices ring simultaneously on incoming call.

### 17.2 First-Join Wins

First device to `call:join` wins. Server sends `call:already-answered` to other devices of the same user.

### 17.3 Active Call Indicator

Non-active devices show "In call on another device" indicator via user presence socket.

---

## 18. Network Quality Indicators

### 18.1 Quality Bar

| Level | RTT | Packet Loss | Icon | Color |
|-------|-----|-------------|------|-------|
| Excellent | < 100ms | < 1% | Full bars | Green |
| Good | < 200ms | < 3% | 3 bars | Green |
| Fair | < 300ms | < 5% | 2 bars | Yellow |
| Poor | > 300ms | > 5% | 1 bar | Red |

### 18.2 Toast Notifications

- "Mauvaise connexion" on transition to Poor
- "Connexion rétablie" on transition from Poor to Good+
- "Vidéo désactivée automatiquement" on severe degradation (>10% packet loss)

---

## 19. Bluetooth & Audio Routing

### 19.1 Audio Route Handling

CallKit manages primary routing. Additional handling for:
- `AVAudioSession.routeChangeNotification` for AirPods connect/disconnect
- Speaker button cycles: earpiece → speaker → bluetooth (if available)
- UI indicator shows current audio output device name

---

## 20. Accessibility

### 20.1 Requirements

- VoiceOver announcements for all call state transitions
- Haptic feedback: heavy impact on connect, notification on disconnect
- Dynamic Type support in call UI (minimum 44pt touch targets)
- Reduce Motion: replace spring animations with cross-dissolve
- High Contrast: ensure call controls meet WCAG AA contrast ratios

---

## 21. Low Power Mode

### 21.1 Adaptations

When `ProcessInfo.processInfo.isLowPowerModeEnabled`:
- Reduce video to 15fps, 480p
- Reduce quality monitor frequency to 10s (from 3s)
- Disable video filters
- Audio quality unchanged (Opus FEC still active)

---

## 22. Implementation Status & Review Notes

### 22.1 Changes Implemented (This PR)

**Shared Types (packages/shared/)**:
- ✅ CallStatus enum: 9 values (added connecting, reconnecting, failed)
- ✅ CallEndReason enum: 7 values (new)
- ✅ WebRTCSignalType: added ice-restart
- ✅ ACK callback types for call events
- ✅ 6 new Socket.IO events (4 client, 2 server)
- ✅ TranscriptionSegment: isFinal, translatedText, translatedLanguage
- ✅ Prisma schema: endReason, transcriptionEnabled fields

**Gateway (services/gateway/)**:
- ✅ CallService: heartbeat tracking, state machine transitions, any-participant end
- ✅ CallEventsHandler: ACK callbacks, targeted signal emit, 4 new handlers
- ✅ CallCleanupService: 60s GC interval, proper timeouts
- ✅ Validation schemas: ice-restart, heartbeat, quality-report, reconnecting
- ✅ TURN TTL: 1h default

**iOS (apps/ios/)**:
- ✅ WebRTCTypes: ice-restart, QualityThresholds, CallEndReason, CallDisplayMode
- ✅ P2PWebRTCClient: audio constraints, SDP munging, stream IDs
- ✅ WebRTCService: adaptive bitrate, quality monitor, ICE restart
- ✅ CallManager: heartbeat, reconnection, display mode

### 22.2 Remaining for Phase 2

- VoIP Push (PushKit) for background/killed app calls
- SFU mode for 3+ participant group calls
- Screen sharing
- Call history/logs view
- E2E encryption verification UI
- Call recording (`MediaRecorder` on web, `AVAssetWriter` on iOS — architecture supports it, not implemented)

---

## 23. Post-Call Experience 🔧

### 23.1 Missed Call Push Notification 🔧

> **Status**: To implement — no push notification sent on MISSED state currently.

When the server marks a call as MISSED (Section 2.2 — 30s ringing timeout), send a **regular push notification** (not VoIP push) to the callee:

```json
{
  "title": "Appel manque",
  "body": "Vous avez manque un appel de {callerName}",
  "data": {
    "type": "missed-call",
    "callId": "abc123",
    "conversationId": "conv456",
    "callerId": "user789",
    "callerName": "Alice"
  }
}
```

- Tap notification → open conversation → show call-summary message
- Badge count increments on missed call
- **Phase 1**: Regular APNs push (foreground Socket.IO handles live calls)
- **Phase 2**: VoIP Push (PushKit) for background/killed app incoming calls

### 23.2 Post-Call Quality Feedback 📐

> **Status**: Design only — `CallSession` Prisma schema missing `feedback Json?` field. `CallQualityFeedbackEvent` type not defined. `call:quality-feedback` event not in `socketio-events.ts`.

After calls lasting >30 seconds, show an optional quality feedback prompt (3s delay after call ends):

```
Comment etait la qualite de cet appel ?
[⭐ ⭐ ⭐ ⭐ ⭐]   (1-5 stars, tap to rate)
[Ignorer]

If rating <= 3, show issue tags:
[ ] Qualite audio mediocre
[ ] Qualite video mediocre
[ ] Appel coupe
[ ] Echo
[ ] Decalage audio/video
[ ] Autre
```

**Data storage**: New Socket.IO event `call:quality-feedback`:
```typescript
interface CallQualityFeedbackEvent {
  callId: string
  rating: 1 | 2 | 3 | 4 | 5
  issues?: ('audio_quality' | 'video_quality' | 'dropped' | 'echo' | 'sync' | 'other')[]
  comment?: string
}
```

Store in `CallSession.feedback` (new JSON field in Prisma schema).

---

## 24. Monitoring & Analytics 📐

### 24.1 Call Metrics Collection 📐

> **Status**: Design only — `CallAnalytics` type not defined. Metrics not collected or stored.

Every call should persist structured analytics in `CallSession.metadata`:

```typescript
interface CallAnalytics {
  setupTimeMs: number          // Time from call:initiate to ICE connected
  iceMethod: 'direct' | 'stun' | 'turn'  // How ICE connected
  codec: { audio: string; video: string }  // Negotiated codecs (e.g., 'opus', 'H264')
  averageRtt: number           // Average RTT over call duration
  averagePacketLoss: number    // Average packet loss
  maxPacketLoss: number        // Peak packet loss
  averageBitrate: { audio: number; video: number }
  reconnectionCount: number    // Number of ICE restarts
  networkTransitions: number   // WiFi↔Cellular switches
  effectsUsed: AudioEffectType[]  // Audio effects activated during call
  filtersUsed: boolean         // Whether video filters were active
  transcriptionEnabled: boolean
  translationEnabled: boolean
  qualityDistribution: { excellent: number; good: number; fair: number; poor: number }  // % time at each level
  platform: 'ios' | 'web'
  deviceModel?: string         // e.g., 'iPhone 15 Pro', 'Chrome 120'
}
```

Collected from `call:quality-report` events and stored at call end.

### 24.2 TURN Server Health Monitoring 📐

> **Status**: Design only — coturn not in any docker-compose file. TURN infrastructure not deployed yet.

coturn has no built-in health check endpoint. Monitor via:

1. **Periodic STUN binding request** from Gateway (every 60s):
   ```bash
   turnutils_stunclient -p 3478 turn.meeshy.me
   ```
   If fails 3 times consecutively → alert ops team.

2. **Docker health check** in `docker-compose.prod.yml`:
   ```yaml
   coturn:
     healthcheck:
       test: ["CMD", "turnutils_stunclient", "-p", "3478", "localhost"]
       interval: 30s
       timeout: 5s
       retries: 3
   ```

3. **Metrics**: Track TURN relay usage percentage (calls using TURN vs direct/STUN). If >50% use TURN, investigate NAT configuration.

### 24.3 Memory Management for Long Calls (1h+)

Periodic resource cleanup every 5 minutes during active calls:

| Resource | Cleanup Strategy |
|----------|-----------------|
| WebRTC stats history | Keep only last 5 minutes. Aggregate older stats into averages |
| Transcription segments | Already capped at 50 (CallTranscriptionService). No action needed |
| Video filter CIContext | `.cacheIntermediates: false` prevents growth. No action needed |
| Audio effect nodes | AVAudioEngine manages lifecycle. Nodes deallocated on `setEffect(nil)` |
| Socket.IO event listeners | Verify no listener leaks on reconnect (each reconnect should NOT add duplicate listeners) |
| Quality report history | Keep last 30 reports (5 minutes at 10s interval). Discard older |

**iOS memory warning handling**:
```swift
NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification) { _ in
    // Disable video filters (free CIContext GPU memory)
    // Reduce transcription segment retention to 20
    // Force quality report history trim
    Logger.calls.warning("Memory warning during call — reducing resource usage")
}
```

### 24.4 Simulcast Dead Code

`P2PWebRTCClient.enableSimulcast()` exists but is never called. **Keep for Phase 2 SFU** but mark with `// Phase 2: SFU simulcast` comment. Do not remove — it will be needed for multi-party calls.

---

## 25. New Socket.IO Events Summary (Review Additions)

All new events introduced by this review (in addition to existing spec events):

### Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `call:translation-request` | `{ callId, sourceLanguage?, disable? }` | Request/disable translation |
| `call:translation-response` | `{ callId, accepted }` | Accept/reject translation request |
| `call:audio-chunk` | `{ callId, chunk: binary, chunkIndex }` | Server-assisted Whisper (binary) |
| `call:quality-feedback` | `{ callId, rating, issues?, comment? }` | Post-call quality rating |
| `call:screen-capture-detected` | `{ callId, participantId, isCapturing }` | Screen recording notification |

### Server → Client

| Event | Payload | Purpose |
|-------|---------|---------|
| `call:translation-requested` | `{ callId, requesterId, sourceLanguage }` | Relay translation request to peer |
| `call:translation-enabled` | `{ callId }` | Both parties accepted translation |
| `call:transcription-result` | `{ callId, text, language, confidence }` | Server Whisper result |
| `call:already-answered` | `{ callId }` | Another device answered (multi-device) |
| `call:screen-capture-alert` | `{ callId, participantId, isCapturing }` | Notify of screen recording |

### New REST Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/calls/active` | Get user's current active call (crash recovery) |

---

## 26. Files Modified/Created (Review Additions)

### New Files (in addition to Section 12)

| File | Purpose |
|------|---------|
| apps/ios/Meeshy/Features/Main/Services/CallAudioEffectsService.swift | AVAudioEngine audio effects during calls |
| apps/ios/Meeshy/Features/Main/Services/MeeshyAudioDeviceModule.swift | Custom WebRTC audio device for effect injection |
| services/gateway/src/routes/calls-active.ts | GET /api/v1/calls/active endpoint |

### Modified Files (in addition to Section 12)

| File | Changes |
|------|---------|
| apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift | Add SFSpeech 1-minute rotation (16.2.1) |
| apps/ios/Meeshy/Features/Main/Services/CallManager.swift | Add call waiting (11.15), crash recovery (11.16), screen recording detection (11.19) |
| apps/ios/Meeshy/Features/Main/Services/VideoFilterPipeline.swift | Add dark frame toast handling, filter presets |
| apps/ios/Meeshy/Features/Main/Views/CallView.swift | Add transcription speaker colors (16.9), quality feedback (23.2) |
| apps/web/services/webrtc-service.ts | Add TURN server integration (13.5), resolution degradation (13.2) |
| apps/web/hooks/conversations/use-video-call.ts | Add answerCall, rejectCall, endCall (13.4) |
| apps/web/hooks/use-call-quality.ts | Add server emission of call:quality-report (13.6) |
| apps/web/hooks/use-audio-effects.ts | Add replaceTrack integration for WebRTC (13.7) |
| packages/shared/types/socketio-events.ts | Add 10 new events (Section 25) |
| packages/shared/types/video-call.ts | Add CallQualityFeedbackEvent, CallAnalytics types |
| packages/shared/prisma/schema.prisma | Add feedback JSON field to CallSession |
| services/gateway/src/socketio/CallEventsHandler.ts | Add translation consent handlers, audio chunk relay, crash recovery endpoint |
