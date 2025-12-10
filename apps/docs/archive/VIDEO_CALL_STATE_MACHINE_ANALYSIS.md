# Video Call State Machine - Complete Analysis

## 📋 Table of Contents
1. [Shared Types & Definitions](#1-shared-types--definitions)
2. [Database Schema (Prisma)](#2-database-schema-prisma)
3. [Frontend State Management (Zustand)](#3-frontend-state-management-zustand)
4. [Call Lifecycle States](#4-call-lifecycle-states)
5. [Complete Event Flow](#5-complete-event-flow)
6. [State Transition Diagram](#6-state-transition-diagram)
7. [Consistency Analysis](#7-consistency-analysis)
8. [Issues & Recommendations](#8-issues--recommendations)

---

## 1. Shared Types & Definitions

### Location: `/shared/types/video-call.ts`

**✅ GOOD:** Shared types are properly defined in a central location accessible to both frontend and backend.

### Core Type Definitions:

```typescript
// Call States
type CallStatus = 'initiated' | 'ringing' | 'active' | 'ended';
type CallMode = 'p2p' | 'sfu';
type ParticipantRole = 'initiator' | 'participant';

// Main Interfaces
interface CallSession {
  id: string;
  conversationId: string;
  mode: CallMode;
  status: CallStatus;
  initiatorId: string;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  duration?: number;
  participants: CallParticipant[];
  metadata?: CallMetadata;
}

interface CallParticipant {
  id: string;                  // Database ID (CallParticipant record)
  callSessionId: string;
  userId?: string;             // User ID (for WebRTC identification)
  anonymousId?: string;        // Anonymous ID (for guest users)
  role: ParticipantRole;
  joinedAt: Date;
  leftAt?: Date;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  // Populated fields (not in DB):
  username?: string;
  displayName?: string;
  avatar?: string;
}
```

### Socket.IO Events:

```typescript
// Client → Server
CALL_EVENTS = {
  INITIATE: 'call:initiate',
  JOIN: 'call:join',
  LEAVE: 'call:leave',
  SIGNAL: 'call:signal',
  TOGGLE_AUDIO: 'call:toggle-audio',
  TOGGLE_VIDEO: 'call:toggle-video',
}

// Server → Client
CALL_EVENTS = {
  INITIATED: 'call:initiated',
  PARTICIPANT_JOINED: 'call:participant-joined',
  PARTICIPANT_LEFT: 'call:participant-left',
  ENDED: 'call:ended',
  MEDIA_TOGGLED: 'call:media-toggled',
  ERROR: 'call:error',
}
```

---

## 2. Database Schema (Prisma)

### Location: `/shared/schema.prisma`

```prisma
model CallSession {
  id              String           @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String           @db.ObjectId
  mode            CallMode         @default(p2p)
  status          CallStatus       @default(initiated)
  initiatorId     String           @db.ObjectId
  startedAt       DateTime         @default(now())
  answeredAt      DateTime?
  endedAt         DateTime?
  duration        Int?
  participants    CallParticipant[]
  metadata        Json?
}

model CallParticipant {
  id              String       @id @default(auto())
  callSessionId   String       @db.ObjectId
  userId          String?      @db.ObjectId
  anonymousId     String?
  role            ParticipantRole @default(participant)
  joinedAt        DateTime     @default(now())
  leftAt          DateTime?
  isAudioEnabled  Boolean      @default(true)
  isVideoEnabled  Boolean      @default(true)
  connectionQuality Json?
}

enum CallStatus {
  initiated  // Call created, waiting for participants
  ringing    // Ringing on remote participants (NOT USED IN CURRENT IMPLEMENTATION)
  active     // Call is active with participants
  ended      // Call has ended
}

enum CallMode {
  p2p        // Peer-to-peer (2 participants)
  sfu        // Selective Forwarding Unit (3+ participants, not implemented yet)
}
```

**✅ CONSISTENCY:** Types match perfectly between shared types and Prisma schema.

---

## 3. Frontend State Management (Zustand)

### Location: `/frontend/stores/call-store.ts`

```typescript
interface CallState {
  // Call session data
  currentCall: CallSession | null;

  // WebRTC media streams
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;  // Key: userId or anonymousId

  // WebRTC peer connections
  peerConnections: Map<string, RTCPeerConnection>;  // Key: userId or anonymousId

  // UI controls
  controls: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenShareEnabled: boolean;
  };

  // UI state flags
  isConnecting: boolean;
  isInCall: boolean;
  error: string | null;

  // Future: SFU mode (Phase 1B)
  sfuDevice: any | null;
  sfuTransport: any | null;

  // Future: Transcription (Phase 2)
  transcriptions: Transcription[];
  isTranscribing: boolean;

  // Future: Translation (Phase 3)
  translations: Map<string, Translation[]>;
}
```

**Key Store Actions:**
- `setCurrentCall()` - Set current call session
- `addParticipant()` - Add participant to call
- `removeParticipant()` - Remove participant from call
- `setLocalStream()` - Set local media stream
- `addRemoteStream()` - Add remote participant stream
- `addPeerConnection()` - Add WebRTC peer connection
- `toggleAudio()` - Toggle audio on/off
- `toggleVideo()` - Toggle video on/off
- `reset()` - Complete cleanup (stops all streams, closes all connections)

---

## 4. Call Lifecycle States

### State Diagram:

```
┌─────────────┐
│   NULL      │  No call active
└──────┬──────┘
       │ User clicks "Start Call"
       │ emit('call:initiate')
       ▼
┌─────────────┐
│ INITIATED   │  Call created, initiator waiting
│  (Status)   │  Timeout: 30 seconds
└──────┬──────┘
       │ Another user emit('call:join')
       │ emit('call:participant-joined')
       ▼
┌─────────────┐
│   ACTIVE    │  Call in progress
│  (Status)   │  Participants can join/leave
└──────┬──────┘
       │ Last participant emit('call:leave')
       │ OR initiator explicitly ends call
       ▼
┌─────────────┐
│   ENDED     │  Call completed
│  (Status)   │  Duration recorded
└─────────────┘
       │ emit('call:ended')
       ▼
┌─────────────┐
│   NULL      │  Cleanup complete
│  (Frontend) │  Store reset
└─────────────┘
```

### Call Status Meanings:

| Status | Description | Who Can See | Transitions To |
|--------|-------------|-------------|----------------|
| `initiated` | Call created by initiator, waiting for others | Initiator only | `active` or `ended` |
| `ringing` | **NOT USED** in current implementation | N/A | N/A |
| `active` | 2+ participants connected | All participants | `ended` |
| `ended` | Call finished | All participants (briefly) | NULL (cleanup) |

**⚠️ ISSUE:** `ringing` status exists in schema but is never used in code.

---

## 5. Complete Event Flow

### 5.1. Call Initiation Flow

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│ User A   │                 │ Gateway  │                 │ User B   │
│(Initiator│                 │ Backend  │                 │(Receiver)│
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │ 1. Click "Video Call"      │                            │
     │    Request media perms     │                            │
     │    (getUserMedia)          │                            │
     │                            │                            │
     │ 2. emit('call:initiate')   │                            │
     ├───────────────────────────>│                            │
     │    { conversationId,       │                            │
     │      type: 'video',        │                            │
     │      settings }            │                            │
     │                            │                            │
     │                            │ 3. CallService.initiateCall()
     │                            │    - Check conversation
     │                            │    - Check for active calls
     │                            │    - Create CallSession
     │                            │    - Create CallParticipant
     │                            │                            │
     │ 4. on('call:initiated')    │ 5. emit('call:initiated')  │
     │<───────────────────────────┤───────────────────────────>│
     │    { callId,               │    to conversation room     │
     │      conversationId,       │                            │
     │      initiator,            │ 6. on('call:initiated')    │
     │      participants }        │                            │
     │                            │                            │
     │ 7. CallManager             │                            │ 8. CallManager
     │    - Detect I'm initiator  │                            │    - Show CallNotification
     │    - setCurrentCall()      │                            │    - Play ringtone
     │    - setInCall(true)       │                            │    - Show Accept/Decline
     │    - Start 30s timeout     │                            │    - Start 30s timeout
     │                            │                            │
     │ 9. VideoCallInterface      │                            │
     │    - Initialize local      │                            │
     │      stream (from pre-     │                            │
     │      authorized or new)    │                            │
     │    - Display waiting UI    │                            │
     │                            │                            │
```

### 5.2. Participant Join Flow

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│ User A   │                 │ Gateway  │                 │ User B   │
│(Initiator│                 │ Backend  │                 │(Joining) │
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │                            │      10. User B clicks     │
     │                            │          "Accept"          │
     │                            │                            │
     │                            │ 11. emit('call:join')      │
     │                            │<───────────────────────────┤
     │                            │     { callId, settings }   │
     │                            │                            │
     │                            │ 12. CallService.joinCall() │
     │                            │     - Verify call exists   │
     │                            │     - Check status         │
     │                            │       (initiated/active)   │
     │                            │     - Create CallParticipant
     │                            │     - Update status to     │
     │                            │       'active'             │
     │                            │     - Generate TURN creds  │
     │                            │                            │
     │ 13. on('call:participant-  │ 14. emit('call:participant-│
     │     joined')               │     joined') to call room  │
     │<───────────────────────────┤───────────────────────────>│
     │     { callId,              │                            │
     │       participant,         │ 15. on('call:participant-  │
     │       mode,                │     joined')               │
     │       iceServers }         │                            │
     │                            │                            │
     │ 16. VideoCallInterface     │                            │ 17. VideoCallInterface
     │     - Detect I'm initiator │                            │     - Initialize local
     │     - Create WebRTC offer  │                            │       stream
     │     - emit('call:signal')  │                            │     - Wait for offer
     │                            │                            │
```

### 5.3. WebRTC Signaling Flow

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│ User A   │                 │ Gateway  │                 │ User B   │
│(Initiator│                 │ Backend  │                 │(Joiner)  │
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │ 18. Create RTCPeer         │                            │
     │     Connection             │                            │
     │     - Add local stream     │                            │
     │     - Create offer SDP     │                            │
     │                            │                            │
     │ 19. emit('call:signal')    │                            │
     ├───────────────────────────>│                            │
     │     { callId,              │                            │
     │       signal: {            │                            │
     │         type: 'offer',     │                            │
     │         from: userA_id,    │                            │
     │         to: userB_id,      │                            │
     │         sdp: '...'         │                            │
     │       }                    │                            │
     │     }                      │                            │
     │                            │ 20. Forward signal         │
     │                            ├───────────────────────────>│
     │                            │    emit('call:signal')     │
     │                            │                            │
     │                            │                 21. Receive offer
     │                            │                     - Create RTCPeer
     │                            │                       Connection
     │                            │                     - Set remote SDP
     │                            │                     - Add local stream
     │                            │                     - Create answer
     │                            │                       SDP
     │                            │                            │
     │                            │ 22. emit('call:signal')    │
     │                            │<───────────────────────────┤
     │                            │     { signal: {            │
     │                            │       type: 'answer',      │
     │                            │       from: userB_id,      │
     │                            │       to: userA_id,        │
     │                            │       sdp: '...'           │
     │                            │     }}                     │
     │                            │                            │
     │ 23. Receive answer         │                            │
     │<───────────────────────────┤                            │
     │     - Set remote SDP       │                            │
     │     - Connection established                           │
     │                            │                            │
     │ 24. ICE candidate gathering│                            │
     │     emit('call:signal')    │                            │
     ├───────────────────────────>│                            │
     │     { signal: {            │                            │
     │       type: 'ice-candidate'│                            │
     │       candidate: '...'     │ 25. Forward candidate      │
     │     }}                     ├───────────────────────────>│
     │                            │                            │
     │                            │ 26. ICE candidates from B  │
     │ 27. Receive candidates     │<───────────────────────────┤
     │<───────────────────────────┤                            │
     │                            │                            │
     │ 28. Connection established │                            │
     │     'ontrack' event fires  │                            │
     │     - Receive remote stream│                            │
     │     - Display video        │                            │
     │                            │                            │
     │<═══════════════════════════════════════════════════════>│
     │            WebRTC P2P Connection Active                 │
     │            Audio/Video streaming directly               │
     │<═══════════════════════════════════════════════════════>│
```

### 5.4. Media Toggle Flow

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│ User A   │                 │ Gateway  │                 │ User B   │
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │ User clicks "Mute"         │                            │
     │                            │                            │
     │ - toggleAudio() in store   │                            │
     │ - Disable audio tracks     │                            │
     │                            │                            │
     │ emit('call:toggle-audio')  │                            │
     ├───────────────────────────>│                            │
     │   { callId,                │                            │
     │     enabled: false }       │                            │
     │                            │                            │
     │                            │ Update participant record  │
     │                            │ in database                │
     │                            │                            │
     │                            │ emit('call:media-toggled') │
     │                            ├───────────────────────────>│
     │                            │   to call room             │
     │                            │   { participantId,         │
     │                            │     mediaType: 'audio',    │
     │                            │     enabled: false }       │
     │                            │                            │
     │                            │                            │ Update UI
     │                            │                            │ Show muted
     │                            │                            │ icon
     │                            │                            │
```

### 5.5. Participant Leave Flow

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│ User A   │                 │ Gateway  │                 │ User B   │
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │                            │      User B clicks "Hang Up"
     │                            │                            │
     │                            │ emit('call:leave')         │
     │                            │<───────────────────────────┤
     │                            │   { callId }               │
     │                            │                            │
     │                            │ CallService.leaveCall()    │
     │                            │ - Find participant         │
     │                            │ - Set leftAt timestamp     │
     │                            │ - Check if last participant│
     │                            │   - YES: End call          │
     │                            │     - Set status='ended'   │
     │                            │     - Set endedAt          │
     │                            │     - Calculate duration   │
     │                            │                            │
     │ emit('call:participant-    │                            │
     │ left')                     │                            │
     │<───────────────────────────┤                            │
     │   { callId,                │                            │
     │     participantId,         │                            │
     │     userId }               │                            │
     │                            │                            │
     │ CallManager:               │                            │ CallManager:
     │ - removeRemoteStream()     │                            │ - reset() store
     │ - removePeerConnection()   │                            │ - Stop local stream
     │ - removeParticipant()      │                            │ - Cleanup
     │                            │                            │
     │ IF last participant:       │                            │
     │ emit('call:ended')         │                            │
     │<───────────────────────────┤                            │
     │   { callId,                │                            │
     │     duration,              │                            │
     │     endedBy }              │                            │
     │                            │                            │
     │ CallManager:               │                            │
     │ - reset() store            │                            │
     │ - Stop all streams         │                            │
     │ - Close all connections    │                            │
     │ - Clear UI                 │                            │
     │                            │                            │
```

### 5.6. Cleanup on Page Refresh/Close

```
┌──────────┐                 ┌──────────┐
│ Browser  │                 │ Gateway  │
│(User A)  │                 │ Backend  │
└────┬─────┘                 └────┬─────┘
     │                            │
     │ User refreshes or closes   │
     │ browser                    │
     │                            │
     │ VideoCallInterface:        │
     │ - beforeunload event fires │
     │                            │
     │ emit('call:leave')         │
     ├───────────────────────────>│
     │   { callId }               │
     │                            │
     │ Component unmount:         │ CallService.leaveCall()
     │ - cleanup() in useEffect   │ - Set leftAt timestamp
     │                            │ - Broadcast participant-left
     │                            │ - End call if last participant
     │                            │
     │ [Browser closes]           │
     │                            │
```

**✅ FIX IMPLEMENTED:** Added `beforeunload` listener in VideoCallInterface to ensure cleanup.

---

## 6. State Transition Diagram

### Frontend State Machine (useCallStore):

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND CALL STORE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  State: NULL                                                │
│  ├─ currentCall: null                                       │
│  ├─ isInCall: false                                         │
│  ├─ localStream: null                                       │
│  ├─ remoteStreams: Map()                                    │
│  └─ peerConnections: Map()                                  │
│                                                             │
│         │                                                   │
│         │ setCurrentCall(call)                              │
│         │ setInCall(true)                                   │
│         ▼                                                   │
│                                                             │
│  State: CONNECTING                                          │
│  ├─ currentCall: { status: 'initiated', ... }              │
│  ├─ isInCall: true                                          │
│  ├─ isConnecting: true                                      │
│  ├─ localStream: MediaStream (getUserMedia)                │
│  └─ remoteStreams: Map()                                    │
│                                                             │
│         │                                                   │
│         │ Participant joins                                 │
│         │ addParticipant()                                  │
│         │ WebRTC offer/answer                               │
│         │ addPeerConnection()                               │
│         ▼                                                   │
│                                                             │
│  State: ACTIVE (IN CALL)                                    │
│  ├─ currentCall: { status: 'active', participants: [...] } │
│  ├─ isInCall: true                                          │
│  ├─ isConnecting: false                                     │
│  ├─ localStream: MediaStream                                │
│  ├─ remoteStreams: Map<userId, MediaStream>                │
│  └─ peerConnections: Map<userId, RTCPeerConnection>        │
│                                                             │
│         │                                                   │
│         │ User hangs up OR Last participant leaves          │
│         │ reset()                                           │
│         ▼                                                   │
│                                                             │
│  State: NULL (Cleanup)                                      │
│  ├─ Stop all media tracks                                   │
│  ├─ Close all peer connections                              │
│  └─ Clear all state                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Consistency Analysis

### 7.1. Type Consistency: ✅ EXCELLENT

| Aspect | Frontend | Backend | Shared Types | Status |
|--------|----------|---------|--------------|--------|
| `CallStatus` enum | ✅ Uses shared | ✅ Uses Prisma | ✅ Defined | ✅ Consistent |
| `CallMode` enum | ✅ Uses shared | ✅ Uses Prisma | ✅ Defined | ✅ Consistent |
| `ParticipantRole` | ✅ Uses shared | ✅ Uses Prisma | ✅ Defined | ✅ Consistent |
| `CallSession` interface | ✅ Uses shared | ✅ Uses Prisma | ✅ Defined | ✅ Consistent |
| `CallParticipant` interface | ✅ Uses shared | ✅ Uses Prisma | ✅ Defined | ✅ Consistent |
| Socket event names | ✅ Uses CALL_EVENTS | ✅ Uses CALL_EVENTS | ✅ Defined | ✅ Consistent |

### 7.2. Event Flow Consistency: ✅ GOOD

| Event | Frontend Emits | Backend Handles | Backend Broadcasts | Frontend Handles | Status |
|-------|---------------|-----------------|-------------------|------------------|--------|
| `call:initiate` | ✅ ConversationLayout | ✅ CallEventsHandler | ✅ call:initiated | ✅ CallManager | ✅ |
| `call:join` | ✅ CallPage, CallManager | ✅ CallEventsHandler | ✅ call:participant-joined | ✅ CallManager | ✅ |
| `call:leave` | ✅ VideoCallInterface | ✅ CallEventsHandler | ✅ call:participant-left, call:ended | ✅ CallManager | ✅ |
| `call:signal` | ✅ useWebRTCP2P | ✅ CallEventsHandler | ✅ call:signal | ✅ useWebRTCP2P | ✅ |
| `call:toggle-audio` | ✅ VideoCallInterface | ✅ CallEventsHandler | ✅ call:media-toggled | ✅ CallManager | ✅ |
| `call:toggle-video` | ✅ VideoCallInterface | ✅ CallEventsHandler | ✅ call:media-toggled | ✅ CallManager | ✅ |
| `call:force-leave` | ✅ ConversationLayout | ✅ CallEventsHandler | ✅ (participant-left, ended) | ✅ CallManager | ✅ NEW |

### 7.3. Participant Identification: ⚠️ NEEDS ATTENTION

**Two IDs in Use:**

1. **Database ID (`participant.id`)**:
   - CallParticipant record ID from MongoDB
   - Used for database queries
   - Used in `call:participant-left` event (`participantId`)
   - Used in CallManager for `removeParticipant()`

2. **User/Anonymous ID (`userId` or `anonymousId`)**:
   - Used for WebRTC identification
   - Key for `remoteStreams` Map
   - Key for `peerConnections` Map
   - Used in WebRTC signaling (from/to fields)

**Current Implementation:**
```typescript
// CallManager correctly handles both IDs:
const handleParticipantLeft = (event: CallParticipantLeftEvent) => {
  const userIdForCleanup = event.userId || event.anonymousId;

  // WebRTC cleanup uses userId
  removeRemoteStream(userIdForCleanup);
  removePeerConnection(userIdForCleanup);

  // Database cleanup uses participantId
  removeParticipant(event.participantId);
};
```

**✅ STATUS:** Correctly implemented. The dual-ID system is necessary and properly handled.

---

## 8. Issues & Recommendations

### 8.1. Issues Found & Fixed ✅

#### Issue #1: React Hooks Violation
- **Location**: `VideoCallInterface.tsx`
- **Problem**: Early return before `useEffect` hooks violated React Rules
- **Impact**: "Rendered more hooks than during the previous render" error
- **Fix**: Moved early return AFTER all hooks (line 386)
- **Status**: ✅ FIXED

#### Issue #2: Missing Cleanup on Page Refresh
- **Location**: `VideoCallInterface.tsx`
- **Problem**: No `beforeunload` handler caused stale participant records
- **Impact**: "Call already active" error when retrying
- **Fix**: Added `beforeunload` listener in useEffect (lines 178-203)
- **Status**: ✅ FIXED

#### Issue #3: No Force Cleanup Mechanism
- **Location**: `ConversationLayout.tsx`, `CallEventsHandler.ts`
- **Problem**: Stale calls blocked new calls with no recovery
- **Impact**: User stuck, unable to start new call
- **Fix**: Added `call:force-leave` event handler with auto-retry
- **Status**: ✅ FIXED

### 8.2. Current Issues ⚠️

#### Issue #4: `ringing` Status Never Used
- **Location**: `schema.prisma`, `video-call.ts`
- **Problem**: Status exists in schema but is never set in code
- **Impact**: Minor - unused code, confusing state diagram
- **Recommendation**:
  - Option A: Remove `ringing` from schema (breaking change)
  - Option B: Implement `ringing` status (set when call initiated, clear when joined)
  - Option C: Document as "reserved for future use"

#### Issue #5: No Timeout Cleanup on Backend
- **Location**: `CallService.ts`
- **Problem**: Frontend has 30s timeout, but backend doesn't auto-cleanup stale calls
- **Impact**: If frontend timeout fails to fire, call stays in `initiated` status forever
- **Recommendation**: Add server-side job to cleanup `initiated` calls older than 2 minutes

#### Issue #6: Zombie Call Cleanup is Reactive, Not Proactive
- **Location**: `CallService.ts` lines 133-179
- **Problem**: Zombie calls only cleaned up when new call is initiated
- **Impact**: Stale data in database until next call attempt
- **Recommendation**: Add periodic cleanup job (every 5 minutes)

### 8.3. Future Enhancements 📋

#### Enhancement #1: Call Reconnection
- **Scenario**: Temporary network loss during active call
- **Current**: Call is ended, must restart
- **Proposed**:
  - Add `reconnecting` state
  - Keep call `active` for 60s while waiting for reconnection
  - If reconnection succeeds, resume call
  - If 60s timeout, end call

#### Enhancement #2: Call Quality Monitoring
- **Location**: Already partially implemented in `useCallQuality` hook
- **Proposed**:
  - Emit quality stats to backend
  - Store in `CallParticipant.connectionQuality`
  - Display quality indicators in UI
  - Auto-downgrade video quality on poor connection

#### Enhancement #3: Multi-Party Calls (SFU Mode)
- **Status**: Prepared in types, not implemented
- **Proposed**:
  - Detect when 3rd participant joins
  - Transition from P2P to SFU
  - Use mediasoup or Janus for SFU server
  - Emit `call:mode-changed` event

---

## Summary

### ✅ Strengths:
1. **Excellent type consistency** between frontend, backend, and shared types
2. **Clean separation** of concerns (CallManager, VideoCallInterface, CallService)
3. **Proper event-driven architecture** with Socket.IO
4. **Good error handling** with typed error codes
5. **WebRTC implementation** follows best practices
6. **Recent fixes** addressed major cleanup issues

### ⚠️ Areas for Improvement:
1. Remove or implement `ringing` status
2. Add server-side timeout cleanup for stale calls
3. Implement proactive zombie call cleanup job
4. Consider call reconnection for network interruptions
5. Enhance monitoring and quality tracking

### 🎯 Current Status:
**The video call feature is well-implemented, with strong type safety and good architecture. Recent fixes have resolved the major "call already active" issue. The system is production-ready for P2P video calls.**

---

**Generated**: 2025-11-06
**Reviewed Components**:
- `/shared/types/video-call.ts`
- `/shared/schema.prisma`
- `/frontend/stores/call-store.ts`
- `/frontend/components/video-call/CallManager.tsx`
- `/frontend/components/video-calls/VideoCallInterface.tsx`
- `/frontend/components/conversations/ConversationLayout.tsx`
- `/gateway/src/services/CallService.ts`
- `/gateway/src/socketio/CallEventsHandler.ts`
