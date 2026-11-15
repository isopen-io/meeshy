# Phase 1A: P2P Video Calls MVP - Development Guide

**Timeline**: 2 weeks
**Goal**: Basic 1-to-1 video calls for DIRECT conversations
**Status**: 🚧 In Development

---

## 📋 Overview

Phase 1A delivers the **Minimum Viable Product** for video calls:
- ✅ Initiate 1-to-1 video calls (DIRECT conversations only)
- ✅ Accept/reject calls
- ✅ WebRTC P2P connection (audio + video)
- ✅ Basic controls: mute, camera off, hang up
- ✅ Simple UI: 2 video streams (local + remote)
- ✅ Signaling via Socket.IO

**Out of scope for Phase 1A:**
- ❌ Group calls (3+ participants) → Phase 1B
- ❌ Transcription → Phase 2A/2B
- ❌ Translation → Phase 3
- ❌ Screen sharing → Later
- ❌ Recording → Later

---

## 🏗️ Architecture (P2P Only)

```
┌─────────────────────────────────────────────────────────┐
│                    P2P CALL FLOW                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  User A (Initiator)         User B (Receiver)           │
│  ┌─────────────┐            ┌─────────────┐            │
│  │  Browser    │            │  Browser    │            │
│  │  (Chrome)   │            │  (Chrome)   │            │
│  └──────┬──────┘            └──────┬──────┘            │
│         │                          │                    │
│         │  1. call:initiate        │                    │
│         ├──────────────────────────┤                    │
│         │                          │                    │
│         │  2. call:initiated       │                    │
│         │◄─────────────────────────┤                    │
│         │                          │                    │
│         │  3. Offer (SDP)          │                    │
│         ├─────────►│               │                    │
│         │          │  Gateway      │                    │
│         │          │  (Socket.IO)  │                    │
│         │          │               │                    │
│         │          │◄─────────────►│                    │
│         │          │  4. Answer    │                    │
│         │◄─────────┤               │                    │
│         │                          │                    │
│         │  5. ICE Candidates       │                    │
│         ├─────────►│◄──────────────┤                    │
│         │          │               │                    │
│         │  6. P2P WebRTC (direct)  │                    │
│         ├═════════════════════════►│                    │
│         │   Audio/Video Streams    │                    │
│         │◄════════════════════════─┤                    │
│         │                          │                    │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Base Files Created

### Frontend
- ✅ `frontend/shared/types/video-call.ts` - TypeScript types
- ✅ `frontend/stores/call-store.ts` - Zustand state management
- ⏳ `frontend/components/video-call/` - UI components (to be created)
- ⏳ `frontend/hooks/use-webrtc-p2p.ts` - P2P WebRTC hook (to be created)
- ⏳ `frontend/services/webrtc-service.ts` - WebRTC service (to be created)

### Backend (Gateway)
- ✅ `gateway/shared/prisma/schema-video-calls.prisma` - Database models
- ⏳ `gateway/src/services/call-service.ts` - Call business logic (to be created)
- ⏳ `gateway/src/routes/calls.ts` - REST API routes (to be created)
- ⏳ `gateway/src/socketio/call-events.ts` - Socket.IO events (to be created)

### Documentation
- ✅ `docs/video-calls/ARCHITECTURE.md` - Complete architecture
- ✅ `docs/video-calls/API_CONTRACTS.md` - API specifications
- ✅ `docs/video-calls/DATA_MODELS.md` - Database design
- ✅ `docs/video-calls/SEQUENCE_DIAGRAMS.md` - Interaction flows
- ✅ `docs/video-calls/IMPLEMENTATION_PLAN.md` - Overall plan

---

## 🤖 Agent Assignments

### 1. **backend-microservices-architect** → Branch: `feature/vc-gateway-signaling`

#### Tasks
- [ ] Implement `CallService` (`gateway/src/services/call-service.ts`)
  - `initiateCall(conversationId, initiatorId)` → Create CallSession
  - `joinCall(callId, userId)` → Add participant
  - `leaveCall(callId, userId)` → Remove participant, end call if empty
  - `getCallSession(callId)` → Retrieve call details
  - Validation: Only DIRECT and GROUP conversations

- [ ] Implement REST API routes (`gateway/src/routes/calls.ts`)
  - `POST /api/calls` → Initiate call
  - `GET /api/calls/:callId` → Get call details
  - `DELETE /api/calls/:callId` → End call
  - `POST /api/calls/:callId/participants` → Join call
  - `DELETE /api/calls/:callId/participants/:participantId` → Leave call

- [ ] Implement Socket.IO events (`gateway/src/socketio/call-events.ts`)
  - Listen: `call:initiate`, `call:join`, `call:leave`, `call:signal`
  - Emit: `call:initiated`, `call:participant-joined`, `call:participant-left`, `call:signal`, `call:ended`, `call:error`

- [ ] Integrate Prisma schema
  - Import `schema-video-calls.prisma` into main `schema.prisma`
  - Run migration: `npx prisma migrate dev --name add_video_calls`
  - Generate Prisma client

- [ ] Unit tests
  - Test CallService methods
  - Test REST API endpoints
  - Test Socket.IO event handlers

#### Reference Files
- Read: `gateway/src/socketio/MeeshySocketIOHandler.ts` (existing Socket.IO)
- Read: `gateway/src/routes/conversations.ts` (existing routes pattern)
- Read: `docs/video-calls/API_CONTRACTS.md` (API specs)
- Read: `docs/video-calls/SEQUENCE_DIAGRAMS.md` (flows)

#### Success Criteria
- [ ] CallService creates/manages CallSession in MongoDB
- [ ] REST API endpoints work (test with Postman/curl)
- [ ] Socket.IO events emit correctly (test with Socket.IO client)
- [ ] Only DIRECT/GROUP conversations can initiate calls
- [ ] Call ends when last participant leaves

---

### 2. **senior-frontend-architect** → Branch: `feature/vc-webrtc-p2p`

#### Tasks Part A: WebRTC Service & Hook
- [ ] Implement WebRTC service (`frontend/services/webrtc-service.ts`)
  - `createPeerConnection(iceServers)` → Create RTCPeerConnection
  - `createOffer()` → Generate SDP offer
  - `createAnswer(offer)` → Generate SDP answer
  - `addIceCandidate(candidate)` → Handle ICE candidates
  - `addTrack(track, stream)` → Add local media track
  - `getLocalStream()` → Get user media (audio+video)
  - Error handling + logging

- [ ] Implement `use-webrtc-p2p.ts` hook
  - Initialize peer connection
  - Handle offer/answer exchange via Socket.IO
  - Handle ICE candidates
  - Manage connection state
  - Return: `{ localStream, remoteStream, connect, disconnect, error }`

- [ ] STUN/TURN configuration
  - Configure ICE servers (Google STUN for MVP)
  - Error handling for connection failures

#### Tasks Part B: UI Components
- [ ] `CallManager.tsx` - Main call orchestrator
  - Listens to Socket.IO events
  - Manages call state via `useCallStore`
  - Handles call initiation/joining/leaving
  - Error boundary

- [ ] `VideoGrid.tsx` - Video display
  - 2-grid layout (local + remote)
  - Responsive design (mobile + desktop)
  - Show participant names
  - Mirror local video

- [ ] `CallControls.tsx` - Call controls
  - Mute/unmute audio button
  - Enable/disable video button
  - Hang up button
  - Visual feedback (muted icon, etc.)

- [ ] `CallNotification.tsx` - Incoming call UI
  - Show caller info
  - Accept/Reject buttons
  - Ringtone (optional)

#### Integration
- [ ] Add call button to conversation header
  - Only show for DIRECT conversations
  - Check if other participant is online
  - Disable if already in call

- [ ] Socket.IO event listeners
  - `call:initiated` → Show incoming call notification
  - `call:participant-joined` → Establish WebRTC connection
  - `call:signal` → Handle SDP/ICE exchange
  - `call:ended` → Clean up and show "Call ended" message

#### Testing
- [ ] Test with 2 browser windows (same machine)
- [ ] Test with 2 different devices (same network)
- [ ] Test with 2 different networks (via TURN)
- [ ] Test error scenarios (denied permissions, connection failures)

#### Reference Files
- Read: `frontend/hooks/use-socketio-messaging.ts` (Socket.IO pattern)
- Read: `frontend/components/conversations/ConversationLayout.tsx` (layout)
- Read: `docs/video-calls/SEQUENCE_DIAGRAMS.md` (P2P flow)

#### Success Criteria
- [ ] User can initiate call from conversation
- [ ] User can accept/reject incoming call
- [ ] Both users see/hear each other
- [ ] Controls work (mute, video, hang up)
- [ ] Call ends cleanly
- [ ] Works on Chrome, Firefox, Safari

---

### 3. **microservices-architect** → Branch: `feature/vc-architecture-design`

#### Tasks
- [ ] Update architecture docs for Phase 1A specifics
  - Clarify P2P-only architecture
  - Update diagrams if needed
  - Add troubleshooting guide

- [ ] Create developer onboarding guide
  - Setup instructions
  - How to test locally
  - Common issues and solutions

- [ ] Review API contracts
  - Ensure consistency with implementation
  - Update any discrepancies

#### Success Criteria
- [ ] Docs reflect Phase 1A implementation
- [ ] New developers can onboard easily

---

## 🔧 Development Workflow

### 1. Setup Local Environment

```bash
# Clone and checkout branch
git checkout feature/vc-gateway-signaling  # or feature/vc-webrtc-p2p

# Install dependencies
cd gateway && pnpm install
cd frontend && pnpm install

# Setup database
cd gateway
npx prisma migrate dev --name add_video_calls
npx prisma generate

# Start services
cd gateway && pnpm dev     # Port 3000
cd frontend && pnpm dev    # Port 3001
```

### 2. Testing P2P Connection Locally

#### Option A: Same Machine (2 Browser Windows)
1. Open `http://localhost:3001` in Chrome window 1 (User A)
2. Open `http://localhost:3001` in Chrome window 2 (User B)
3. Login as different users
4. Start DIRECT conversation
5. User A initiates call
6. User B accepts call
7. ✅ Both should see/hear each other

#### Option B: Different Devices (Same Network)
1. Find local IP: `ifconfig | grep inet`
2. Device A: Open `http://<YOUR_IP>:3001`
3. Device B: Open `http://<YOUR_IP>:3001`
4. Follow steps above

#### Option C: Different Networks (TURN Required)
- Setup Coturn server or use cloud TURN provider
- Configure in `webrtc-service.ts`

### 3. Debugging WebRTC

**Chrome DevTools**:
- Navigate to `chrome://webrtc-internals/`
- See ICE candidates, connection state, stats

**Console Logs**:
- Enable verbose logging in `webrtc-service.ts`
- Check Socket.IO events in Network tab

**Common Issues**:
- **No video**: Check camera permissions
- **Connection failed**: Check STUN/TURN config
- **No audio**: Check microphone permissions

---

## 📊 Phase 1A Success Metrics

### Functional Requirements
- [ ] User can initiate call from DIRECT conversation
- [ ] User can accept/reject incoming call
- [ ] Audio/video streams work both ways
- [ ] Controls work (mute, video, hang up)
- [ ] Call persists in database (CallSession, CallParticipant)
- [ ] Call ends cleanly when user leaves

### Non-Functional Requirements
- [ ] Connection time <2 seconds
- [ ] Audio latency <200ms
- [ ] Video quality 720p @ 30fps (default)
- [ ] Works on Chrome, Firefox, Safari
- [ ] Mobile responsive (basic support)

### Code Quality
- [ ] TypeScript types are correct
- [ ] Eslint passes with no errors
- [ ] Unit tests cover main logic
- [ ] Code is documented
- [ ] No console errors in production

---

## 🚀 Next Steps After Phase 1A

Once Phase 1A is complete and tested:

1. **Merge to base branch**
   ```bash
   git checkout feature/video-calls-base
   git merge feature/vc-gateway-signaling
   git merge feature/vc-webrtc-p2p
   git push origin feature/video-calls-base
   ```

2. **Deploy to dev environment** for user testing

3. **Gather feedback** from real users

4. **Start Phase 1B** (Group calls with SFU)

---

## 📞 Questions & Support

- **Architecture questions**: Check `docs/video-calls/ARCHITECTURE.md`
- **API questions**: Check `docs/video-calls/API_CONTRACTS.md`
- **Git issues**: Ask tech-lead-guide agent
- **WebRTC issues**: Check `chrome://webrtc-internals/`

---

**Happy coding! 🎉**
