# Video Call Feature - Architecture Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Context](#system-context)
3. [Container Architecture](#container-architecture)
4. [Component Architecture](#component-architecture)
5. [Technology Stack](#technology-stack)
6. [P2P ↔ SFU Transition Logic](#p2p--sfu-transition-logic)
7. [Data Flow](#data-flow)
8. [Deployment Architecture](#deployment-architecture)
9. [Infrastructure Requirements](#infrastructure-requirements)

---

## Executive Summary

This document defines the architecture for Meeshy's **Video Call Feature with Real-time Translation**, supporting:

- **Dynamic P2P/SFU switching**: P2P for 2 participants, SFU for 3-50 participants
- **Conversation type support**: DIRECT (always 2 max) and GROUP (2+ users)
- **Anonymous participants**: Full video call support in GROUP conversations
- **Real-time transcription**: Client-side (P2P) and server-side (SFU) with translation
- **Seamless integration**: Leverages existing Socket.IO, Gateway, Translator services

### Key Design Principles
1. **Progressive Enhancement**: Start with P2P, scale to SFU only when needed
2. **Existing Infrastructure Reuse**: Socket.IO for signaling, Prisma/MongoDB for persistence
3. **Privacy-First**: End-to-end encryption for P2P, secure SFU routing
4. **Developer Experience**: Clear APIs, comprehensive error handling, debugging tools

---

## System Context

### C4 Level 1: System Context Diagram

```mermaid
C4Context
    title System Context - Meeshy Video Calls

    Person(user_auth, "Authenticated User", "Registered Meeshy user")
    Person(user_anon, "Anonymous User", "Guest via share link")

    System_Boundary(meeshy, "Meeshy Platform") {
        System(frontend, "Frontend App", "Next.js/React application")
        System(gateway, "Gateway Service", "Node.js/Express + Socket.IO")
        System(media_server, "Media Server", "mediasoup SFU server")
        System(translator, "Translator Service", "Python translation service")
    }

    System_Ext(stun_turn, "STUN/TURN Servers", "Coturn or cloud provider")
    System_Ext(whisper_api, "Transcription Engine", "faster-whisper or Whisper API")
    SystemDb_Ext(mongodb, "MongoDB", "Prisma + MongoDB database")

    Rel(user_auth, frontend, "Uses", "HTTPS/WSS")
    Rel(user_anon, frontend, "Uses", "HTTPS/WSS")
    Rel(frontend, gateway, "REST API + Socket.IO", "HTTPS/WSS")
    Rel(frontend, media_server, "WebRTC", "UDP/TCP")
    Rel(gateway, media_server, "Control API", "HTTP/WS")
    Rel(gateway, translator, "Translation requests", "HTTP/gRPC")
    Rel(gateway, mongodb, "Read/Write", "MongoDB Wire Protocol")
    Rel(media_server, whisper_api, "Transcription", "HTTP/WebSocket")
    Rel(frontend, stun_turn, "ICE/NAT", "UDP/TCP")
    Rel(media_server, stun_turn, "ICE/NAT", "UDP/TCP")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### External Systems
- **STUN/TURN Servers**: NAT traversal and relay (Coturn, Twilio, AWS, etc.)
- **Transcription Engine**: faster-whisper (self-hosted) or OpenAI Whisper API
- **MongoDB**: Existing database via Prisma ORM

---

## Container Architecture

### C4 Level 2: Container Diagram

```mermaid
C4Container
    title Container Diagram - Video Call Components

    Person(user, "User", "Authenticated or Anonymous")

    Container_Boundary(frontend_boundary, "Frontend (Next.js)") {
        Container(ui_components, "Call UI Components", "React/TypeScript", "CallInterface, VideoGrid, Controls")
        Container(webrtc_manager, "WebRTC Manager", "TypeScript", "Handles P2P and SFU connections")
        Container(transcription_client, "Transcription Client", "TypeScript/Whisper.js", "Web Speech API + Whisper.js fallback")
        Container(socket_client, "Socket.IO Client", "TypeScript", "Signaling and events")
    }

    Container_Boundary(gateway_boundary, "Gateway Service (Node.js)") {
        Container(rest_api, "REST API", "Express", "Call management endpoints")
        Container(socketio_server, "Socket.IO Server", "Socket.IO", "Signaling and real-time events")
        Container(call_orchestrator, "Call Orchestrator", "TypeScript", "P2P/SFU logic, participant management")
        Container(media_controller, "Media Server Controller", "TypeScript", "mediasoup integration")
    }

    Container(media_server, "Media Server", "mediasoup (Node.js)", "SFU routing, recording, transcription")
    Container(translator_service, "Translator Service", "Python/FastAPI", "Real-time translation")
    ContainerDb(database, "MongoDB", "Prisma ORM", "Call sessions, participants, transcriptions")

    System_Ext(stun_turn, "STUN/TURN", "NAT traversal")
    System_Ext(whisper_engine, "faster-whisper", "Speech-to-text")

    Rel(user, ui_components, "Interacts", "HTTPS")
    Rel(ui_components, webrtc_manager, "Controls")
    Rel(webrtc_manager, socket_client, "Signaling")
    Rel(webrtc_manager, transcription_client, "Audio stream")
    Rel(socket_client, socketio_server, "WSS")
    Rel(ui_components, rest_api, "HTTPS")

    Rel(socketio_server, call_orchestrator, "Events")
    Rel(call_orchestrator, media_controller, "Controls")
    Rel(call_orchestrator, database, "Persists")
    Rel(media_controller, media_server, "HTTP/WS")

    Rel(webrtc_manager, media_server, "WebRTC (SFU mode)", "UDP/TCP")
    Rel(webrtc_manager, stun_turn, "ICE", "UDP/TCP")
    Rel(media_server, whisper_engine, "Audio stream")
    Rel(call_orchestrator, translator_service, "Translation")
    Rel(transcription_client, translator_service, "Translation (P2P)")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

### Container Responsibilities

#### **Frontend Containers**
1. **Call UI Components**: Video grid, participant tiles, controls (mute, camera, screen share)
2. **WebRTC Manager**: Peer connection management, media stream handling, mode switching
3. **Transcription Client**: Web Speech API (primary), Whisper.js (fallback) for P2P mode
4. **Socket.IO Client**: Signaling, presence, events (call:initiated, participant:joined, etc.)

#### **Gateway Containers**
1. **REST API**: CRUD operations for calls (initiate, join, leave, history)
2. **Socket.IO Server**: Real-time signaling, SDP exchange, ICE candidate relay
3. **Call Orchestrator**: Core business logic - P2P/SFU decision, participant lifecycle
4. **Media Server Controller**: mediasoup API wrapper, router management, worker scaling

#### **Media Server**
- **mediasoup**: SFU routing, recording, server-side transcription pipeline integration

---

## Component Architecture

### Frontend Call Components

```mermaid
graph TB
    subgraph "Frontend Application"
        CallPage[Call Page Component]
        CallInterface[CallInterface Component]
        VideoGrid[VideoGrid Component]
        ParticipantTile[ParticipantTile Component]
        CallControls[CallControls Component]
        TranscriptionPanel[TranscriptionPanel Component]

        CallPage --> CallInterface
        CallInterface --> VideoGrid
        CallInterface --> CallControls
        CallInterface --> TranscriptionPanel
        VideoGrid --> ParticipantTile
    end

    subgraph "WebRTC Layer"
        WebRTCManager[WebRTC Manager]
        P2PConnection[P2P Connection Handler]
        SFUConnection[SFU Connection Handler]
        MediaStreamManager[Media Stream Manager]

        WebRTCManager --> P2PConnection
        WebRTCManager --> SFUConnection
        WebRTCManager --> MediaStreamManager
    end

    subgraph "Transcription Layer"
        TranscriptionClient[Transcription Client]
        WebSpeechAPI[Web Speech API]
        WhisperJS[Whisper.js Fallback]
        TranslationClient[Translation Client]

        TranscriptionClient --> WebSpeechAPI
        TranscriptionClient --> WhisperJS
        TranscriptionClient --> TranslationClient
    end

    subgraph "Communication Layer"
        SocketIOClient[Socket.IO Client]
        SignalingHandler[Signaling Handler]
        EventEmitter[Event Emitter]

        SocketIOClient --> SignalingHandler
        SocketIOClient --> EventEmitter
    end

    CallInterface --> WebRTCManager
    CallInterface --> SocketIOClient
    WebRTCManager --> TranscriptionClient
    TranscriptionClient --> SocketIOClient

    style CallInterface fill:#4A90E2
    style WebRTCManager fill:#7B68EE
    style TranscriptionClient fill:#50C878
    style SocketIOClient fill:#FF6B6B
```

### Gateway Call Service Components

```mermaid
graph TB
    subgraph "API Layer"
        RESTRouter[REST API Router]
        CallController[Call Controller]
        ValidationMiddleware[Validation Middleware]
        AuthMiddleware[Auth Middleware]
    end

    subgraph "Socket.IO Layer"
        SocketIOHandler[Socket.IO Handler]
        SignalingService[Signaling Service]
        RoomManager[Room Manager]
    end

    subgraph "Business Logic Layer"
        CallOrchestrator[Call Orchestrator]
        ModeSelector[P2P/SFU Mode Selector]
        ParticipantManager[Participant Manager]
        CallStateMachine[Call State Machine]
    end

    subgraph "Media Server Integration"
        MediaServerController[Media Server Controller]
        RouterManager[mediasoup Router Manager]
        TransportManager[Transport Manager]
        ProducerConsumerManager[Producer/Consumer Manager]
    end

    subgraph "Data Layer"
        CallRepository[Call Repository]
        ParticipantRepository[Participant Repository]
        TranscriptionRepository[Transcription Repository]
        PrismaClient[Prisma Client]
    end

    RESTRouter --> CallController
    CallController --> ValidationMiddleware
    CallController --> AuthMiddleware
    CallController --> CallOrchestrator

    SocketIOHandler --> SignalingService
    SocketIOHandler --> RoomManager
    SignalingService --> CallOrchestrator

    CallOrchestrator --> ModeSelector
    CallOrchestrator --> ParticipantManager
    CallOrchestrator --> CallStateMachine
    CallOrchestrator --> MediaServerController

    MediaServerController --> RouterManager
    MediaServerController --> TransportManager
    MediaServerController --> ProducerConsumerManager

    CallOrchestrator --> CallRepository
    ParticipantManager --> ParticipantRepository
    CallOrchestrator --> TranscriptionRepository
    CallRepository --> PrismaClient

    style CallOrchestrator fill:#4A90E2
    style MediaServerController fill:#7B68EE
    style ModeSelector fill:#FF6B6B
```

---

## Technology Stack

### Technology Selection with Rationale

#### **Frontend Technologies**

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Next.js 14** | React framework | Already used, SSR/SSG support, API routes |
| **TypeScript** | Type safety | Existing standard, WebRTC type definitions |
| **mediasoup-client 3.x** | WebRTC SFU client | Production-grade, matches server, excellent docs |
| **simple-peer** | WebRTC P2P | Lightweight, easy P2P implementation, fallback |
| **Web Speech API** | Transcription (P2P) | Native browser support, zero latency, no cost |
| **Whisper.js (tfjs)** | Transcription fallback | Browser-based, works offline, privacy-preserving |
| **Socket.IO Client 4.x** | Real-time signaling | Already integrated, reliable, auto-reconnect |
| **Zustand** | State management | Lightweight, better than Redux for WebRTC state |
| **Tailwind CSS** | Styling | Existing design system |

#### **Backend Technologies**

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Node.js 20.x** | Runtime | Existing Gateway runtime, async I/O for WebRTC |
| **Express 4.x** | REST API | Already used, middleware ecosystem |
| **Socket.IO 4.x** | Signaling server | Already integrated, rooms support, scaling |
| **mediasoup 3.x** | SFU media server | Best-in-class SFU, MIT license, active development |
| **TypeScript** | Type safety | Gateway standard, shared types with frontend |
| **Prisma 5.x** | ORM | Already used, MongoDB support, type safety |
| **MongoDB 7.x** | Database | Existing database, flexible schema for calls |

#### **Media & Transcription**

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **faster-whisper** | Server transcription | 4x faster than OpenAI, GPU support, self-hosted |
| **mediasoup-recorder** | Call recording | Native integration with mediasoup |
| **FFmpeg** | Media processing | Video format conversion, thumbnails |
| **Existing Translator** | Translation | Reuse Python service, proven translation pipeline |

#### **Infrastructure**

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Coturn** | STUN/TURN server | Open-source, self-hosted, cost-effective |
| **Docker** | Containerization | Already used, consistent environments |
| **Kubernetes** | Orchestration (optional) | Future scaling, auto-healing, load balancing |
| **Redis** | Session/state cache | Socket.IO adapter, call state caching |
| **Nginx** | Reverse proxy | Load balancing, SSL termination |

---

## P2P ↔ SFU Transition Logic

### Mode Selection Algorithm

```mermaid
flowchart TD
    Start([Call Initiated]) --> CheckType{Conversation Type?}

    CheckType -->|DIRECT| Direct[Set Mode: P2P]
    CheckType -->|GROUP| CheckParticipants{Active Participants?}

    CheckParticipants -->|≤ 2| P2P[Set Mode: P2P]
    CheckParticipants -->|≥ 3| SFU[Set Mode: SFU]

    Direct --> Monitor[Monitor Call]
    P2P --> Monitor
    SFU --> Monitor

    Monitor --> Event{Event Occurred?}

    Event -->|Participant Joins| CountAfterJoin{Count after join?}
    Event -->|Participant Leaves| CountAfterLeave{Count after leave?}
    Event -->|Call Ends| End([End Call])

    CountAfterJoin -->|= 3| MigrateToSFU[Migrate P2P → SFU]
    CountAfterJoin -->|≤ 2 or ≥ 4| NoChange1[No Mode Change]

    CountAfterLeave -->|= 2 & GROUP| MigrateToP2P[Migrate SFU → P2P]
    CountAfterLeave -->|≠ 2 or DIRECT| NoChange2[No Mode Change]

    MigrateToSFU --> Monitor
    MigrateToP2P --> Monitor
    NoChange1 --> Monitor
    NoChange2 --> Monitor

    style Direct fill:#4A90E2
    style P2P fill:#4A90E2
    style SFU fill:#FF6B6B
    style MigrateToSFU fill:#FFA500
    style MigrateToP2P fill:#FFA500
```

### Transition Triggers

| Scenario | Trigger | Action | Duration |
|----------|---------|--------|----------|
| **3rd participant joins GROUP** | `participant:joined` event | Migrate P2P → SFU | < 2s |
| **3rd participant leaves GROUP** | `participant:left` event | Migrate SFU → P2P | < 2s |
| **DIRECT call (always 2 max)** | N/A | Always P2P | N/A |
| **GROUP initialized with 3+** | `call:initiated` | Start with SFU | N/A |

### Migration Protocol

#### **P2P → SFU Migration**

```mermaid
sequenceDiagram
    participant A as User A (P2P)
    participant B as User B (P2P)
    participant G as Gateway
    participant M as Media Server
    participant C as User C (New)

    C->>G: call:join (3rd participant)
    G->>G: Detect count = 3, trigger SFU mode

    G->>M: Create SFU router, transports for A, B, C
    M-->>G: Router created, transport IDs

    G->>A: call:mode-switch (P2P → SFU, transport credentials)
    G->>B: call:mode-switch (P2P → SFU, transport credentials)
    G->>C: call:joined (SFU mode, transport credentials)

    par Parallel Connections
        A->>M: Connect to SFU, send producer
        B->>M: Connect to SFU, send producer
        C->>M: Connect to SFU, send producer
    end

    par Parallel Consumption
        M->>A: Consumers for B, C
        M->>B: Consumers for A, C
        M->>C: Consumers for A, B
    end

    A->>A: Close P2P connection with B
    B->>B: Close P2P connection with A

    G->>A: call:mode-switched (success)
    G->>B: call:mode-switched (success)
    G->>C: call:joined (success)
```

#### **SFU → P2P Migration**

```mermaid
sequenceDiagram
    participant A as User A (SFU)
    participant B as User B (SFU)
    participant C as User C (SFU)
    participant G as Gateway
    participant M as Media Server

    C->>G: call:leave
    G->>G: Detect count = 2, trigger P2P mode

    G->>A: call:mode-switch (SFU → P2P, initiator)
    G->>B: call:mode-switch (SFU → P2P, receiver)

    A->>B: WebRTC offer (direct P2P via Socket.IO)
    B->>A: WebRTC answer (direct P2P via Socket.IO)

    A->>B: ICE candidates exchange
    B->>A: ICE candidates exchange

    A->>B: Establish P2P connection

    A->>M: Close SFU transport
    B->>M: Close SFU transport
    M->>G: Transports closed

    G->>M: Destroy router (no more participants)
    M-->>G: Router destroyed

    G->>A: call:mode-switched (success)
    G->>B: call:mode-switched (success)
```

---

## Data Flow

### Call Initiation (P2P - DIRECT Conversation)

```mermaid
sequenceDiagram
    autonumber
    participant UA as User A (Caller)
    participant FE as Frontend
    participant GW as Gateway
    participant DB as MongoDB
    participant UB as User B (Callee)

    UA->>FE: Click "Call" button
    FE->>GW: POST /api/calls {conversationId, type: 'video'}
    GW->>DB: Find conversation, verify membership
    DB-->>GW: Conversation data
    GW->>DB: Create CallSession (mode: 'p2p', status: 'initiated')
    DB-->>GW: CallSession ID
    GW->>DB: Create CallParticipant for User A
    DB-->>GW: Participant created

    GW->>UB: Socket.IO: call:incoming {callId, caller: UserA}
    GW-->>FE: {callId, mode: 'p2p', participants: [A]}

    UB->>GW: Socket.IO: call:accept {callId}
    GW->>DB: Update CallSession (status: 'active')
    GW->>DB: Create CallParticipant for User B

    GW->>UA: Socket.IO: call:accepted {callId, callee: UserB}
    GW->>UB: Socket.IO: call:started {callId, mode: 'p2p'}

    UA->>UB: WebRTC Offer (via Socket.IO)
    UB->>UA: WebRTC Answer (via Socket.IO)
    UA->>UB: ICE Candidates exchange

    Note over UA,UB: P2P connection established
    UA->>UB: Direct media stream (audio/video)
```

### Transcription & Translation Flow (P2P Mode)

```mermaid
sequenceDiagram
    autonumber
    participant UA as User A (English)
    participant WebSpeech as Web Speech API
    participant Trans as Translator Service
    participant UB as User B (French)

    Note over UA: User A speaks in English
    UA->>WebSpeech: Audio stream from microphone
    WebSpeech-->>UA: Transcription: "Hello, how are you?"

    UA->>Trans: POST /translate {text, from: 'en', to: 'fr'}
    Trans-->>UA: "Bonjour, comment allez-vous?"

    UA->>UA: Display English subtitle (local)
    UA->>UB: Socket.IO: call:transcription {text: "Hello...", lang: 'en', translation: "Bonjour...", targetLang: 'fr'}

    UB->>UB: Display French subtitle

    Note over UB: User B speaks in French
    UB->>WebSpeech: Audio stream from microphone
    WebSpeech-->>UB: Transcription: "Très bien, merci"

    UB->>Trans: POST /translate {text, from: 'fr', to: 'en'}
    Trans-->>UB: "Very well, thank you"

    UB->>UB: Display French subtitle (local)
    UB->>UA: Socket.IO: call:transcription {text: "Très bien...", lang: 'fr', translation: "Very well...", targetLang: 'en'}

    UA->>UA: Display English subtitle
```

### Transcription & Translation Flow (SFU Mode)

```mermaid
sequenceDiagram
    autonumber
    participant UA as User A (English)
    participant MS as Media Server
    participant Whisper as faster-whisper
    participant Trans as Translator Service
    participant GW as Gateway
    participant UB as User B (French)
    participant UC as User C (Spanish)

    Note over UA: User A speaks in English
    UA->>MS: Audio stream (WebRTC producer)
    MS->>MS: Tap audio stream
    MS->>Whisper: Audio buffer (every 2s)
    Whisper-->>MS: Transcription: "Hello everyone"

    MS->>GW: POST /api/calls/:id/transcription {userId: A, text, lang: 'en'}
    GW->>Trans: POST /translate {text, from: 'en', to: ['fr', 'es']}
    Trans-->>GW: {fr: "Bonjour tout le monde", es: "Hola a todos"}

    GW->>GW: Store transcription in DB

    par Broadcast to participants
        GW->>UA: call:transcription {text: "Hello...", lang: 'en'}
        GW->>UB: call:transcription {text: "Bonjour...", lang: 'fr'}
        GW->>UC: call:transcription {text: "Hola...", lang: 'es'}
    end

    UA->>UA: Display English subtitle
    UB->>UB: Display French subtitle
    UC->>UC: Display Spanish subtitle
```

### 3rd Participant Joins (P2P → SFU)

```mermaid
sequenceDiagram
    autonumber
    participant A as User A (P2P with B)
    participant B as User B (P2P with A)
    participant C as User C (New)
    participant GW as Gateway
    participant MS as Media Server
    participant DB as MongoDB

    C->>GW: POST /api/calls/:id/participants {userId: C}
    GW->>DB: Find CallSession
    DB-->>GW: CallSession {mode: 'p2p', activeCount: 2}

    GW->>GW: Detect activeCount + 1 = 3 → Trigger SFU mode
    GW->>MS: POST /create-router {callId}
    MS-->>GW: {routerId, rtpCapabilities}

    GW->>DB: Update CallSession {mode: 'sfu', routerId, status: 'migrating'}

    par Notify all participants
        GW->>A: call:mode-switch {mode: 'sfu', routerId, rtpCapabilities}
        GW->>B: call:mode-switch {mode: 'sfu', routerId, rtpCapabilities}
        GW->>C: call:joined {mode: 'sfu', routerId, rtpCapabilities}
    end

    par Connect to SFU
        A->>MS: createTransport (send + receive)
        B->>MS: createTransport (send + receive)
        C->>MS: createTransport (send + receive)
    end

    par Produce media
        A->>MS: produce(audio, video)
        B->>MS: produce(audio, video)
        C->>MS: produce(audio, video)
    end

    par Consume media
        MS->>A: consume(B's media, C's media)
        MS->>B: consume(A's media, C's media)
        MS->>C: consume(A's media, B's media)
    end

    A->>A: Close P2P connection with B
    B->>B: Close P2P connection with A

    GW->>DB: Update CallSession {status: 'active'}

    GW->>A: call:mode-switched {success: true}
    GW->>B: call:mode-switched {success: true}
    GW->>C: call:participant-joined {success: true}
```

---

## Deployment Architecture

### Docker Compose Deployment (Development/Small Scale)

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "Frontend Container"
            NextJS[Next.js App<br/>Port: 3000]
        end

        subgraph "Gateway Container"
            Express[Express + Socket.IO<br/>Port: 4000]
        end

        subgraph "Media Server Container"
            Mediasoup[mediasoup Server<br/>Port: 3001<br/>RTP Ports: 10000-10100]
        end

        subgraph "Translator Container"
            Python[Python FastAPI<br/>Port: 5000]
        end

        subgraph "Infrastructure Containers"
            MongoDB[(MongoDB<br/>Port: 27017)]
            Redis[(Redis<br/>Port: 6379)]
            Coturn[Coturn TURN<br/>Port: 3478/5349]
        end
    end

    subgraph "External Access"
        User[Users]
        Nginx[Nginx Reverse Proxy<br/>Port: 80/443]
    end

    User -->|HTTPS| Nginx
    Nginx -->|/| NextJS
    Nginx -->|/api| Express
    Nginx -->|/socket.io| Express

    NextJS --> Express
    NextJS --> Mediasoup
    Express --> MongoDB
    Express --> Redis
    Express --> Python
    Express --> Mediasoup
    Mediasoup --> Coturn
    NextJS --> Coturn

    style Mediasoup fill:#FF6B6B
    style Express fill:#4A90E2
    style NextJS fill:#50C878
```

### Kubernetes Deployment (Production/High Scale)

```mermaid
graph TB
    subgraph "Ingress Layer"
        Ingress[Ingress Controller<br/>nginx/Traefik]
    end

    subgraph "Frontend Namespace"
        FE_Deployment[Frontend Deployment<br/>3 replicas]
        FE_Service[Frontend Service<br/>ClusterIP]
    end

    subgraph "Gateway Namespace"
        GW_Deployment[Gateway Deployment<br/>3 replicas]
        GW_Service[Gateway Service<br/>ClusterIP]
        GW_HPA[Horizontal Pod Autoscaler]
    end

    subgraph "Media Server Namespace"
        MS_StatefulSet[Media Server StatefulSet<br/>3 replicas]
        MS_Service[Media Server Service<br/>NodePort/LoadBalancer]
        MS_HPA[HPA - CPU/Memory]
    end

    subgraph "Translator Namespace"
        TR_Deployment[Translator Deployment<br/>2 replicas]
        TR_Service[Translator Service<br/>ClusterIP]
    end

    subgraph "Data Layer"
        MongoDB_StatefulSet[MongoDB StatefulSet<br/>3 replicas - Replica Set]
        Redis_StatefulSet[Redis StatefulSet<br/>3 replicas - Cluster]
        PV[Persistent Volumes]
    end

    subgraph "External Services"
        Coturn_External[Coturn<br/>External or StatefulSet]
    end

    Ingress --> FE_Service
    Ingress --> GW_Service

    FE_Deployment --> FE_Service
    FE_Deployment --> GW_Service
    FE_Deployment --> MS_Service

    GW_Deployment --> GW_Service
    GW_Deployment --> MongoDB_StatefulSet
    GW_Deployment --> Redis_StatefulSet
    GW_Deployment --> TR_Service
    GW_Deployment --> MS_Service

    MS_StatefulSet --> MS_Service
    MS_StatefulSet --> Coturn_External

    TR_Deployment --> TR_Service

    MongoDB_StatefulSet --> PV
    Redis_StatefulSet --> PV

    GW_HPA -.->|monitors| GW_Deployment
    MS_HPA -.->|monitors| MS_StatefulSet

    style MS_StatefulSet fill:#FF6B6B
    style GW_Deployment fill:#4A90E2
    style FE_Deployment fill:#50C878
```

### Network Topology

```mermaid
graph TB
    subgraph "Internet"
        User[End Users]
    end

    subgraph "Edge Layer (CDN/Load Balancer)"
        LB[Load Balancer<br/>Cloudflare/AWS ALB]
    end

    subgraph "DMZ (Public Subnet)"
        TURN[TURN Servers<br/>Public IPs for relay]
        Ingress[Ingress/Reverse Proxy<br/>SSL Termination]
    end

    subgraph "Application Layer (Private Subnet)"
        FE[Frontend Servers]
        GW[Gateway Servers]
        MS[Media Servers<br/>Direct UDP if possible]
    end

    subgraph "Service Layer (Private Subnet)"
        TR[Translator Service]
        Cache[Redis Cache]
    end

    subgraph "Data Layer (Private Subnet)"
        DB[(MongoDB<br/>Replica Set)]
        Storage[(Object Storage<br/>Recordings)]
    end

    User -->|HTTPS/WSS| LB
    User -->|WebRTC/UDP| TURN
    User -.->|Direct WebRTC<br/>(if NAT allows)| MS

    LB --> Ingress
    Ingress --> FE
    Ingress --> GW

    FE --> GW
    GW --> MS
    GW --> TR
    GW --> Cache
    GW --> DB
    MS --> TR
    MS --> Storage
    MS --> TURN

    style MS fill:#FF6B6B
    style GW fill:#4A90E2
    style FE fill:#50C878
    style TURN fill:#FFA500
```

---

## Infrastructure Requirements

### Hardware Specifications

#### **Media Server (SFU)**
- **CPU**: 4-8 cores (2.5+ GHz) - high single-thread performance
- **RAM**: 8-16 GB (allocate ~100 MB per active participant)
- **Network**: 1 Gbps NIC, low-latency (<50ms to users)
- **Scaling**: 1 server supports ~50 concurrent participants (HD video)
- **OS**: Ubuntu 22.04 LTS or similar (kernel 5.10+)

#### **Gateway Service**
- **CPU**: 2-4 cores
- **RAM**: 4-8 GB
- **Network**: 1 Gbps NIC
- **Scaling**: Horizontal with Socket.IO Redis adapter
- **OS**: Ubuntu 22.04 LTS or Docker

#### **Translator Service**
- **CPU**: 4-8 cores (existing Python service)
- **RAM**: 4-8 GB
- **GPU**: Optional - for faster-whisper acceleration
- **Scaling**: Horizontal with load balancer

#### **STUN/TURN Server (Coturn)**
- **CPU**: 2-4 cores
- **RAM**: 4 GB
- **Network**: 1 Gbps NIC, **public IP required**
- **Bandwidth**: High (relay traffic for failed P2P)
- **Scaling**: Multiple TURN servers for geo-distribution

### Network Requirements

#### **Ports**
| Service | Protocol | Ports | Purpose |
|---------|----------|-------|---------|
| Frontend | HTTPS/WSS | 443 | HTTPS + WebSocket |
| Gateway | HTTPS/WSS | 443 (via proxy) | REST API + Socket.IO |
| Media Server | HTTP/WS | 3001 | Control API |
| Media Server | UDP/TCP | 10000-10100 | RTP/RTCP (WebRTC) |
| TURN | UDP/TCP | 3478, 5349 | STUN/TURN (TLS optional) |
| MongoDB | TCP | 27017 | Database |
| Redis | TCP | 6379 | Cache/Session |

#### **Bandwidth Estimates**
- **HD Video (720p)**: ~1.5 Mbps per stream
- **Audio**: ~50-100 Kbps per stream
- **Per participant (SFU)**:
  - Upload: 1 stream = ~1.6 Mbps
  - Download: (N-1) streams = ~1.6 Mbps × (participants - 1)
- **Example (10 participants in SFU)**:
  - Each participant: 1.6 Mbps up + 14.4 Mbps down = **16 Mbps**
  - Media server aggregate: 16 Mbps × 10 = **160 Mbps**

### Storage Requirements

#### **Database (MongoDB)**
- **Call Sessions**: ~5 KB per session
- **Participants**: ~2 KB per participant
- **Transcriptions**: ~1 KB per 10-second chunk
- **Estimate for 10,000 calls/month**: ~100 MB/month (metadata only)

#### **Object Storage (Recordings - Optional)**
- **HD Video Recording**: ~100 MB per 10 minutes per participant
- **Estimate for 1,000 hours/month**: ~600 GB/month
- **Recommendation**: Amazon S3, DigitalOcean Spaces, or self-hosted MinIO

---

## Architecture Validation Checklist

- [x] Service boundaries follow single responsibility principle
- [x] APIs are RESTful and WebSocket conventions
- [x] Security controls address OWASP Top 10 (see SECURITY.md)
- [x] Scalability patterns support 10x growth (horizontal scaling)
- [x] Failure modes identified with mitigation (reconnection, fallback)
- [x] Data consistency model is explicit (eventual consistency for transcriptions)
- [x] Observability is built-in (logs, metrics, traces - see below)
- [x] Cost implications are reasonable (open-source stack)
- [x] Migration path from current state is clear (incremental rollout)
- [x] Technology choices align with existing stack (Node.js, TypeScript, Socket.IO)

---

## Observability & Monitoring

### Key Metrics to Track

#### **Call Quality Metrics**
- WebRTC stats: packet loss, jitter, RTT, bitrate
- Audio/video quality scores (MOS - Mean Opinion Score)
- Connection establishment time (P2P and SFU)
- Mode switch duration (P2P ↔ SFU)

#### **Performance Metrics**
- Media server CPU/memory usage
- Active calls and participants count
- Transcription latency (client and server)
- Translation latency
- API response times

#### **Business Metrics**
- Total calls initiated/completed
- Average call duration
- Anonymous vs authenticated participants
- Transcription usage rate
- Failed call attempts (with reasons)

### Recommended Tools
- **Prometheus + Grafana**: Time-series metrics and dashboards
- **Jaeger/Zipkin**: Distributed tracing (trace call flow)
- **ELK Stack**: Centralized logging (Elasticsearch, Logstash, Kibana)
- **mediasoup-client**: Built-in WebRTC stats
- **Socket.IO Admin UI**: Real-time connection monitoring

---

## Next Steps

1. **Review ADR documents** for detailed technology justifications
2. **Review API_CONTRACTS.md** for complete API specifications
3. **Review DATA_MODELS.md** for database schema design
4. **Review SEQUENCE_DIAGRAMS.md** for detailed interaction flows
5. **Review SECURITY.md** for security architecture
6. **Review SCALING_STRATEGY.md** for performance and scaling

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Draft for Review
