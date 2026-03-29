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

- Add Opus SDP munging (same parameters as iOS Section 4.4)
- Add adaptive bitrate with same QualityThresholds as iOS
- Add ICE restart support on connection failure
- Add ACK callback handling for call:initiate, call:join, call:signal, call:end
- Wait for call:participant-joined before creating SDP offer

### 13.3 Call Store Updates (Zustand)

- Sync CallStatus type (9 values)
- Add CallEndReason tracking
- Add heartbeat timer (15s interval)
- Add reconnection state (3 attempts)
- Add quality monitoring state

### 13.4 Browser Compatibility

| Feature | Chrome 120+ | Safari 17+ | Firefox 120+ |
|---------|------------|-----------|-------------|
| VP8/H.264 | ✅ | ✅ | ✅ |
| Opus | ✅ | ✅ | ✅ |
| Insertable Streams | ✅ | ✅ (18+) | ❌ |
| Screen Sharing | ✅ | ✅ | ✅ |

Safari-specific: HTTPS required, getUserMedia constraints must use exact instead of ideal for resolution.

---

## 14. Video Processing Pipeline

### 14.1 Allowed Filters

**Basic filters** (always available):
- Color temperature (warm/cool white balance)
- Brightness, contrast, saturation, exposure
- Color grading via LUT (Look-Up Table)

**Simple face filters** (opt-in):
- Face detection: Vision framework (iOS), MediaPipe (web)
- 2D overlay on face landmarks (glasses, hats, masks)
- Face smoothing / beauty mode (gaussian blur on face region)
- Background blur (portrait mode)

**NOT allowed**: Heavy AR effects, 3D face mesh deformation, Snapchat-style lenses.

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

### 14.4 Face Detection (Phase 2)

iOS: `VNDetectFaceRectanglesRequest` → face bounding box → apply CIFilter region mask.
Web: MediaPipe Face Detection → canvas overlay compositing.

---

## 15. Audio Effects Pipeline

### 15.1 Existing Effects (Reuse from Recording)

| Effect | Parameters | Web Status | iOS Status |
|--------|-----------|-----------|-----------|
| VoiceCoder | pitch, harmonization, strength, retuneSpeed, scale, key | ✅ Implemented | ❌ New |
| BabyVoice | pitch, formant, breathiness | ✅ Implemented | ❌ New |
| DemonVoice | pitch, distortion, reverb | ✅ Implemented | ❌ New |
| BackSound | soundFile, volume, loopMode | ✅ Implemented | ❌ New |

### 15.2 Dual-Stream Architecture

During a call, audio effects create TWO streams:
1. **Processed stream** → sent to remote participant (they hear the effect)
2. **Clean stream** → fed to Speech framework for transcription (no effect artifacts)

```
Microphone → [AudioNode split]
              ├─ Clean → Speech Framework (transcription)
              └─ Effects chain → WebRTC send track (remote hears effect)
```

### 15.3 Web: Reuse `useAudioEffects()` hook

Apply existing `BiquadFilterNode` + `GainNode` + `PitchShiftProcessor` chain to the live `MediaStreamTrack` instead of the `MediaRecorder` input.

### 15.4 iOS: New `CallAudioEffectsService`

Use `AVAudioEngine` pipeline:
- `AVAudioEngine` → `AVAudioUnitEQ` (for basic effects)
- Custom `AVAudioUnit` for pitch shifting
- Output node splits to WebRTC track + Speech recognition

Performance budget: <5ms latency for audio effects.

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

### 16.3 Dual-Stream Diarization

P2P calls have naturally separated audio streams — no ML diarization needed:
- Local audio → transcription with `speakerId = self.userId`
- Remote audio → transcription with `speakerId = remote.userId`
- Merge chronologically by `startTime`

### 16.4 Server-Assisted Translation

New Socket.IO events:
```typescript
CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT: 'call:transcription-segment'
SERVER_EVENTS.CALL_TRANSLATED_SEGMENT: 'call:translated-segment'
```

Flow:
1. Client sends final transcription segment to server
2. Server runs NLLB translation to remote user's `preferredContentLanguages`
3. Server pushes translated segment to remote client
4. Remote UI displays translated text (Prisme Linguistique applies)

### 16.5 Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Background noise | VAD (Silero) filters non-speech; Speech framework handles naturally |
| Echo from speaker | Hardware AEC (CallKit .voiceChat) prevents; clean stream for transcription |
| Cross-talk | Dual-stream separation; each stream transcribed independently |
| Code-switching | Whisper large-v3 handles multilingual; Speech framework may struggle |
| Connection drop mid-sentence | Mark last segment as `isFinal: false`, merge on reconnect |
| Low bandwidth audio (16kbps) | Server-side Whisper for better accuracy on degraded audio |
| Opus compression artifacts | Whisper trained on compressed audio; minimal accuracy loss |

### 16.6 Latency Target

Speech → capture → encode → decode → transcribe → translate → display: **< 2 seconds**.

Breakdown:
- On-device transcription: ~300ms (partial result)
- Socket.IO round trip: ~100ms
- NLLB translation: ~200-500ms (single sentence)
- UI render: ~16ms

### 16.7 Privacy Modes

- **On-device only** (default): Transcription stays on device, no server involvement
- **Server-assisted**: Audio chunks sent to Whisper for higher accuracy (opt-in)
- **Translation mode**: Transcription sent to server for NLLB translation (requires consent from both parties)

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
- Video filters full implementation
- Audio effects during live calls
