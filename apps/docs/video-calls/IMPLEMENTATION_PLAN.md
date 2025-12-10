# Video Calls Feature - Implementation Plan

**Project**: Meeshy Video Calls with Real-time Translation
**Date**: 2025-10-28
**Status**: Planning Phase

---

## 🎯 Vision

Enable video calling between conversation participants (DIRECT and GROUP) with automatic real-time translation to each participant's language.

---

## 📊 Development Phases (Incremental)

### PHASE 1A: P2P Video Calls (MVP) ⭐ PRIORITY #1
**Duration**: 2 weeks
**Goal**: Basic 1-to-1 video calls for DIRECT conversations

#### Features
- ✅ Initiate video call (1-to-1)
- ✅ Accept/reject call
- ✅ WebRTC P2P connection (audio + video)
- ✅ Basic controls: mute, camera off, hang up
- ✅ Simple UI: 2 video streams (local + remote)
- ✅ Signaling via existing Socket.IO

#### Out of Scope
- ❌ Transcription
- ❌ Translation
- ❌ Group calls (3+ participants)
- ❌ Screen sharing
- ❌ Recording

#### Technologies
- Frontend: `simple-peer` (WebRTC wrapper)
- Backend: Socket.IO signaling
- No media server needed

#### Agents Assigned
1. **backend-microservices-architect** → `feature/vc-gateway-signaling`
   - Basic CallService (initiate, join, leave)
   - Socket.IO events: call:*, participant:*
   - REST routes /api/calls/* (CRUD)

2. **senior-frontend-architect** → `feature/vc-webrtc-p2p`
   - CallManager component
   - P2P WebRTC with simple-peer
   - UI: 2-grid video layout
   - Controls: mute, video, leave

3. **microservices-architect** → `feature/vc-architecture-design`
   - P2P-only architecture
   - Sequence diagrams
   - API contracts Phase 1A

**Deliverable**: Functional 1-to-1 video calls

---

### PHASE 1B: Group Video Calls (SFU) ⭐ PRIORITY #2
**Duration**: 2-3 weeks
**Goal**: Support 3+ participants with auto-switch P2P → SFU

#### Features
- ✅ Auto-detection: 2 participants → P2P, 3+ → SFU
- ✅ Seamless migration P2P ↔ SFU
- ✅ Media server (mediasoup) for SFU routing
- ✅ UI grid layout (up to 50 participants)
- ✅ Dynamic participant management: join/leave

#### Technologies
- Media Server: `mediasoup` (Node.js SFU)
- Frontend: `mediasoup-client`
- Deployment: Docker container for media server

#### Agents Assigned
1. **backend-microservices-architect** → `feature/vc-media-server-sfu`
   - New service `media-server/`
   - Mediasoup router/transport setup
   - WebSocket signaling SFU
   - Docker + docker-compose

2. **senior-frontend-architect** → `feature/vc-webrtc-sfu`
   - mediasoup-client integration
   - Device/Transport management
   - Producer/Consumer logic
   - P2P → SFU migration state machine

3. **elite-testing-architect** → `feature/vc-tests-e2e`
   - Test P2P flow
   - Test SFU flow (3+ users)
   - Test P2P ↔ SFU migration

**Deliverable**: Group video calls (3-50 participants) with auto-switch

---

### PHASE 2A: Client-Side Transcription ⭐ PRIORITY #3
**Duration**: 1 week
**Goal**: Display real-time transcription (P2P mode)

#### Features
- ✅ Web Speech API (primary)
- ✅ Whisper.js fallback
- ✅ Auto-detect browser compatibility
- ✅ UI overlay with transcriptions
- ✅ Auto-detect language

#### Technologies
- Web Speech API (native browser)
- `@huggingface/transformers` (Whisper.js)
- Store transcriptions locally (no DB for MVP)

#### Agents Assigned
1. **senior-frontend-architect** → `feature/vc-transcription-client`
   - TranscriptionService class
   - Web Speech API integration
   - Whisper.js fallback
   - UI overlay component

2. **backend-microservices-architect** → `feature/vc-database-models`
   - Prisma schema: Transcription model (optional)
   - API to save transcriptions

**Deliverable**: Live transcription during P2P calls

---

### PHASE 2B: Server-Side Transcription ⭐ PRIORITY #4
**Duration**: 1 week
**Goal**: Server-side transcription for SFU calls (3+ participants)

#### Features
- ✅ Media server captures audio streams
- ✅ faster-whisper Python worker
- ✅ Real-time transcription
- ✅ Broadcast transcriptions to all participants

#### Technologies
- `faster-whisper` (Python)
- Audio processing pipeline
- WebSocket for streaming transcriptions

#### Agents Assigned
1. **backend-microservices-architect** → `feature/vc-transcription-server`
   - Python microservice faster-whisper
   - Audio buffer processing
   - Integration with media server
   - Docker container

**Deliverable**: Server-side transcription for SFU mode

---

### PHASE 3: Voice Translation ⭐ PRIORITY #5
**Duration**: 2 weeks
**Goal**: Translate transcriptions to each participant's language

#### Features
- ✅ Integration with existing `translator/` service
- ✅ Auto-translate transcriptions
- ✅ Multi-language display for each participant
- ✅ User language preference (from profile)

#### Technologies
- Existing translator service
- WebSocket for real-time translations
- Multi-language UI overlay

#### Agents Assigned
1. **backend-microservices-architect** → `feature/vc-translation-integration`
   - API calls to translator service
   - Cache translations
   - Broadcast logic

2. **senior-frontend-architect** → `feature/vc-frontend-ui`
   - Translation display panel
   - Multi-user translation views
   - Settings: preferred language

**Deliverable**: Automatic voice translation in real-time

---

## 🌳 Git Branching Strategy

```
main (production)
  │
  ├── dev (develop branch)
  │     │
  │     └── feature/video-calls-base (main feature branch)
  │           │
  │           ├── phase-1a-p2p-video          [PHASE 1A - MVP]
  │           │     ├── feature/vc-gateway-signaling
  │           │     ├── feature/vc-webrtc-p2p
  │           │     └── feature/vc-architecture-design
  │           │
  │           ├── phase-1b-sfu-group           [PHASE 1B - Core]
  │           │     ├── feature/vc-media-server-sfu
  │           │     ├── feature/vc-webrtc-sfu
  │           │     └── feature/vc-tests-e2e
  │           │
  │           ├── phase-2a-client-transcription [PHASE 2A - Enhancement]
  │           │     ├── feature/vc-transcription-client
  │           │     └── feature/vc-database-models
  │           │
  │           ├── phase-2b-server-transcription [PHASE 2B - Enhancement]
  │           │     └── feature/vc-transcription-server
  │           │
  │           └── phase-3-translation          [PHASE 3 - Advanced]
  │                 ├── feature/vc-translation-integration
  │                 └── feature/vc-frontend-ui
  │
  └── (after all phases complete, merge to dev → main)
```

### Workflow
1. Each phase has its own integration branch (`phase-1a-p2p-video`, etc.)
2. Agents work in feature sub-branches
3. Merge sub-branches → phase branch → test
4. When phase is stable → merge phase branch → `feature/video-calls-base`
5. After all phases → merge `feature/video-calls-base` → `dev` → `main`

---

## 📅 Timeline (10 weeks)

```
Week 1-2:   PHASE 1A - P2P Video MVP
            └─> Merge → dev → TEST

Week 3-5:   PHASE 1B - SFU Group Video
            └─> Merge → dev → TEST

Week 6:     PHASE 2A - Client Transcription
            └─> Merge → dev → TEST

Week 7:     PHASE 2B - Server Transcription
            └─> Merge → dev → TEST

Week 8-9:   PHASE 3 - Voice Translation
            └─> Merge → dev → TEST

Week 10:    Final polish, security review, production deploy
```

---

## 🔐 Security Considerations (All Phases)

### WebRTC Security
- DTLS-SRTP encryption (end-to-end)
- TURN server authentication
- Signaling server authentication (JWT tokens)
- SDP validation (prevent injection)

### Transcription Privacy
- Transcriptions encrypted at rest
- Auto-delete after 30 days (GDPR)
- User consent before recording
- Anonymous users: no persistent storage

### Network Requirements
- STUN servers: stun:stun.l.google.com:19302
- TURN servers: To be configured (coturn)
- Ports: UDP 3478 (STUN), 5349 (TURNS)

---

## 🎯 Success Criteria

### Phase 1A (MVP)
- [ ] 2 users can start a video call
- [ ] Audio and video work reliably
- [ ] Basic controls (mute, camera, hang up) functional
- [ ] <2s connection time
- [ ] Works on Chrome, Firefox, Safari

### Phase 1B (Core)
- [ ] 3+ users can join group call
- [ ] Automatic P2P → SFU switch when 3rd joins
- [ ] Automatic SFU → P2P switch when drops to 2
- [ ] Transition time <2s
- [ ] Supports up to 50 participants

### Phase 2A (Enhancement)
- [ ] Real-time transcription appears during call
- [ ] Web Speech API works on Chrome/Edge/Safari
- [ ] Whisper.js fallback works on Firefox
- [ ] <1s transcription delay

### Phase 2B (Enhancement)
- [ ] Server-side transcription for SFU mode
- [ ] All participants see transcriptions
- [ ] <1s transcription delay
- [ ] Handles 50 concurrent speakers

### Phase 3 (Advanced)
- [ ] Transcriptions automatically translated
- [ ] Each participant sees their language
- [ ] <2s total delay (transcription + translation)
- [ ] Translation accuracy >90%

---

## 📊 Technical Stack Summary

| Component | Technology | Phase |
|-----------|-----------|-------|
| P2P WebRTC | simple-peer | 1A |
| SFU Server | mediasoup | 1B |
| Signaling | Socket.IO | 1A |
| Client Transcription | Web Speech API + Whisper.js | 2A |
| Server Transcription | faster-whisper (Python) | 2B |
| Translation | Existing translator service | 3 |
| Database | MongoDB + Prisma | All |
| Frontend | React/Next.js + TypeScript | All |
| Deployment | Docker + docker-compose | 1B+ |

---

## 🚀 Next Steps

1. ✅ Git branching structure created
2. 🔄 Launch microservices-architect for Phase 1A architecture
3. ⏳ Generate base files (schemas, interfaces, configs)
4. ⏳ Launch agents in parallel for Phase 1A development

---

## 📝 Notes

- **Incremental delivery**: Each phase delivers value independently
- **User feedback loops**: Test with real users after each phase
- **Risk mitigation**: Start simple (P2P), add complexity gradually
- **Rollback strategy**: Each phase can be disabled via feature flag
- **Performance monitoring**: Set up metrics from Phase 1A

---

**Last Updated**: 2025-10-28
**Document Owner**: Tech Lead
