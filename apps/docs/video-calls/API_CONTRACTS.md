# Video Call Feature - API Contracts

## Table of Contents
1. [Overview](#overview)
2. [REST API Endpoints](#rest-api-endpoints)
3. [Socket.IO Events](#socketio-events)
4. [Media Server API](#media-server-api)
5. [Error Codes](#error-codes)
6. [Versioning Strategy](#versioning-strategy)

---

## Overview

This document defines all API contracts for the Video Call Feature, including:
- **REST API**: HTTP endpoints for call management (CRUD operations)
- **Socket.IO Events**: Real-time signaling and events
- **Media Server API**: mediasoup integration for SFU mode

### Base URLs
- **Gateway REST API**: `https://api.meeshy.com/api`
- **Gateway Socket.IO**: `wss://api.meeshy.com` (path: `/socket.io`)
- **Media Server**: `http://media-server:3001` (internal) or `wss://media.meeshy.com` (public WebSocket)

### Authentication
- **REST API**: JWT Bearer token in `Authorization` header
- **Socket.IO**: JWT token sent via `authenticate` event after connection
- **Anonymous Users**: Session token from `ConversationShareLink`

---

## REST API Endpoints

### 1. Initiate Call

**Endpoint**: `POST /api/calls`

**Description**: Initiate a new video call in a conversation.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Request Body**:
```json
{
  "conversationId": "65abc123def456789012345",
  "type": "video",
  "settings": {
    "audioEnabled": true,
    "videoEnabled": true,
    "screenShareEnabled": false
  }
}
```

**Request Schema**:
```typescript
interface InitiateCallRequest {
  conversationId: string;           // MongoDB ObjectId
  type: 'video' | 'audio';          // Call type
  settings?: {
    audioEnabled?: boolean;          // Default: true
    videoEnabled?: boolean;          // Default: true (false for audio-only)
    screenShareEnabled?: boolean;    // Default: false
  };
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "callId": "65abc789def012345678901",
    "conversationId": "65abc123def456789012345",
    "mode": "p2p",
    "status": "initiated",
    "initiator": {
      "userId": "65abc456def789012345678",
      "username": "john_doe"
    },
    "participants": [
      {
        "participantId": "65abc111def222333444555",
        "userId": "65abc456def789012345678",
        "username": "john_doe",
        "role": "initiator",
        "status": "connected",
        "joinedAt": "2025-10-28T10:30:00.000Z"
      }
    ],
    "createdAt": "2025-10-28T10:30:00.000Z",
    "expiresAt": "2025-10-28T11:30:00.000Z"
  }
}
```

**Response Schema**:
```typescript
interface InitiateCallResponse {
  success: true;
  data: {
    callId: string;
    conversationId: string;
    mode: 'p2p' | 'sfu';
    status: 'initiated' | 'active' | 'ended';
    initiator: {
      userId: string;
      username: string;
    };
    participants: CallParticipant[];
    createdAt: Date;
    expiresAt: Date;
  };
}

interface CallParticipant {
  participantId: string;
  userId?: string;
  anonymousUserId?: string;
  username: string;
  role: 'initiator' | 'participant';
  status: 'connecting' | 'connected' | 'disconnected';
  joinedAt: Date;
  leftAt?: Date;
}
```

**Error Responses**:
- `400 Bad Request`: Invalid conversation ID or user not a member
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Conversation type does not support video calls (PUBLIC, GLOBAL)
- `404 Not Found`: Conversation not found
- `409 Conflict`: Call already active in this conversation
- `500 Internal Server Error`: Server error

---

### 2. Get Call Details

**Endpoint**: `GET /api/calls/:callId`

**Description**: Retrieve details of an active or past call.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters**:
- `callId`: MongoDB ObjectId of the call

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "callId": "65abc789def012345678901",
    "conversationId": "65abc123def456789012345",
    "mode": "sfu",
    "status": "active",
    "initiator": {
      "userId": "65abc456def789012345678",
      "username": "john_doe"
    },
    "participants": [
      {
        "participantId": "65abc111def222333444555",
        "userId": "65abc456def789012345678",
        "username": "john_doe",
        "role": "initiator",
        "status": "connected",
        "joinedAt": "2025-10-28T10:30:00.000Z"
      },
      {
        "participantId": "65abc222def333444555666",
        "userId": "65abc567def890123456789",
        "username": "jane_smith",
        "role": "participant",
        "status": "connected",
        "joinedAt": "2025-10-28T10:31:00.000Z"
      },
      {
        "participantId": "65abc333def444555666777",
        "anonymousUserId": "65abc678def901234567890",
        "username": "Guest_Alice",
        "role": "participant",
        "status": "connected",
        "joinedAt": "2025-10-28T10:32:00.000Z"
      }
    ],
    "mediaServerConfig": {
      "routerId": "router-abc123",
      "rtpCapabilities": { /* RtpCapabilities object */ }
    },
    "createdAt": "2025-10-28T10:30:00.000Z",
    "endedAt": null,
    "duration": 180
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User not a participant in this call
- `404 Not Found`: Call not found
- `500 Internal Server Error`: Server error

---

### 3. Join Call

**Endpoint**: `POST /api/calls/:callId/participants`

**Description**: Join an active call.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters**:
- `callId`: MongoDB ObjectId of the call

**Request Body**:
```json
{
  "audioEnabled": true,
  "videoEnabled": true
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "participantId": "65abc444def555666777888",
    "callId": "65abc789def012345678901",
    "mode": "sfu",
    "status": "active",
    "mediaServerConfig": {
      "routerId": "router-abc123",
      "rtpCapabilities": { /* RtpCapabilities object */ }
    },
    "participants": [ /* List of all participants */ ],
    "joinedAt": "2025-10-28T10:33:00.000Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Call not active or max participants reached
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User not allowed to join (not conversation member)
- `404 Not Found`: Call not found
- `409 Conflict`: User already a participant
- `500 Internal Server Error`: Server error

---

### 4. Leave Call

**Endpoint**: `DELETE /api/calls/:callId/participants/:participantId`

**Description**: Leave an active call.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters**:
- `callId`: MongoDB ObjectId of the call
- `participantId`: MongoDB ObjectId of the participant

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "message": "Left call successfully",
    "participantId": "65abc444def555666777888",
    "leftAt": "2025-10-28T10:45:00.000Z"
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Participant does not belong to this user
- `404 Not Found`: Call or participant not found
- `500 Internal Server Error`: Server error

---

### 5. End Call

**Endpoint**: `DELETE /api/calls/:callId`

**Description**: End an active call (only initiator or admin).

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters**:
- `callId`: MongoDB ObjectId of the call

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "message": "Call ended successfully",
    "callId": "65abc789def012345678901",
    "endedAt": "2025-10-28T11:00:00.000Z",
    "duration": 1800
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Only initiator or admin can end call
- `404 Not Found`: Call not found
- `500 Internal Server Error`: Server error

---

### 6. Get Call History

**Endpoint**: `GET /api/conversations/:conversationId/calls`

**Description**: Retrieve call history for a conversation.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Path Parameters**:
- `conversationId`: MongoDB ObjectId of the conversation

**Query Parameters**:
- `limit` (optional): Number of calls to return (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status ('active', 'ended')

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "callId": "65abc789def012345678901",
        "mode": "sfu",
        "status": "ended",
        "participantCount": 5,
        "createdAt": "2025-10-28T10:30:00.000Z",
        "endedAt": "2025-10-28T11:00:00.000Z",
        "duration": 1800
      }
    ],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 7. Switch Call Mode (Internal/Admin)

**Endpoint**: `PUT /api/calls/:callId/mode`

**Description**: Manually switch call mode (P2P ↔ SFU) - typically triggered automatically.

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Request Body**:
```json
{
  "mode": "sfu"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "callId": "65abc789def012345678901",
    "mode": "sfu",
    "switchedAt": "2025-10-28T10:32:00.000Z",
    "mediaServerConfig": {
      "routerId": "router-abc123",
      "rtpCapabilities": { /* RtpCapabilities object */ }
    }
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid mode or mode switch not allowed
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Call not found
- `500 Internal Server Error`: Server error

---

### 8. Submit Transcription (Server-side)

**Endpoint**: `POST /api/calls/:callId/transcriptions`

**Description**: Submit a transcription chunk from the media server.

**Request Headers**:
```
Authorization: Bearer <MEDIA_SERVER_SECRET>
Content-Type: application/json
```

**Request Body**:
```json
{
  "participantId": "65abc111def222333444555",
  "text": "Hello everyone, how are you doing today?",
  "language": "en",
  "timestamp": "2025-10-28T10:35:12.000Z",
  "confidenceScore": 0.95
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "transcriptionId": "65abc999def888777666555",
    "translations": {
      "fr": "Bonjour à tous, comment allez-vous aujourd'hui?",
      "es": "Hola a todos, ¿cómo están hoy?"
    }
  }
}
```

---

## Socket.IO Events

### Connection & Authentication

#### **Client → Server: `authenticate`**

**Description**: Authenticate Socket.IO connection with JWT or session token.

**Payload**:
```typescript
interface AuthenticatePayload {
  userId?: string;                  // For authenticated users
  sessionToken?: string;            // For anonymous users
  language?: string;                // User's preferred language
}
```

**Example**:
```typescript
socket.emit('authenticate', {
  userId: '65abc456def789012345678',
  language: 'en'
});
```

**Server Response**: `authenticated` event

---

#### **Server → Client: `authenticated`**

**Description**: Confirmation of successful authentication.

**Payload**:
```typescript
interface AuthenticatedPayload {
  success: boolean;
  user?: {
    id: string;
    username: string;
    isAnonymous: boolean;
  };
  error?: string;
}
```

**Example**:
```typescript
socket.on('authenticated', (data) => {
  if (data.success) {
    console.log('Authenticated as:', data.user.username);
  } else {
    console.error('Authentication failed:', data.error);
  }
});
```

---

### Call Signaling Events

#### **Client → Server: `call:initiate`**

**Description**: Initiate a call (alternative to REST API).

**Payload**:
```typescript
interface CallInitiatePayload {
  conversationId: string;
  type: 'video' | 'audio';
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}
```

**Example**:
```typescript
socket.emit('call:initiate', {
  conversationId: '65abc123def456789012345',
  type: 'video',
  settings: { audioEnabled: true, videoEnabled: true }
}, (response) => {
  if (response.success) {
    console.log('Call initiated:', response.data.callId);
  }
});
```

**Server Response**: Callback with `SocketIOResponse<{ callId: string, mode: string }>`

---

#### **Server → Client: `call:incoming`**

**Description**: Notify user of an incoming call.

**Payload**:
```typescript
interface CallIncomingPayload {
  callId: string;
  conversationId: string;
  type: 'video' | 'audio';
  caller: {
    userId?: string;
    anonymousUserId?: string;
    username: string;
    avatar?: string;
  };
  expiresAt: Date;
}
```

**Example**:
```typescript
socket.on('call:incoming', (data) => {
  showIncomingCallNotification(data.caller.username, data.callId);
});
```

---

#### **Client → Server: `call:accept`**

**Description**: Accept an incoming call.

**Payload**:
```typescript
interface CallAcceptPayload {
  callId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
```

**Example**:
```typescript
socket.emit('call:accept', {
  callId: '65abc789def012345678901',
  audioEnabled: true,
  videoEnabled: true
}, (response) => {
  if (response.success) {
    console.log('Joined call:', response.data);
  }
});
```

**Server Response**: Callback with `SocketIOResponse<{ mode: string, participants: CallParticipant[] }>`

---

#### **Client → Server: `call:reject`**

**Description**: Reject an incoming call.

**Payload**:
```typescript
interface CallRejectPayload {
  callId: string;
  reason?: 'busy' | 'declined' | 'unavailable';
}
```

**Example**:
```typescript
socket.emit('call:reject', {
  callId: '65abc789def012345678901',
  reason: 'busy'
});
```

---

#### **Server → Client: `call:started`**

**Description**: Notify that the call has started (after acceptance).

**Payload**:
```typescript
interface CallStartedPayload {
  callId: string;
  mode: 'p2p' | 'sfu';
  participants: CallParticipant[];
  mediaServerConfig?: {
    routerId: string;
    rtpCapabilities: any;  // mediasoup RtpCapabilities
  };
}
```

**Example**:
```typescript
socket.on('call:started', (data) => {
  if (data.mode === 'p2p') {
    initializeP2PConnection(data.participants);
  } else {
    initializeSFUConnection(data.mediaServerConfig);
  }
});
```

---

#### **Client → Server: `call:join`**

**Description**: Join an active call (for additional participants).

**Payload**:
```typescript
interface CallJoinPayload {
  callId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
```

**Example**:
```typescript
socket.emit('call:join', {
  callId: '65abc789def012345678901',
  audioEnabled: true,
  videoEnabled: true
}, (response) => {
  if (response.success) {
    console.log('Joined call:', response.data.mode);
  }
});
```

---

#### **Server → Client: `call:participant-joined`**

**Description**: Notify all participants when a new participant joins.

**Payload**:
```typescript
interface CallParticipantJoinedPayload {
  callId: string;
  participant: {
    participantId: string;
    userId?: string;
    anonymousUserId?: string;
    username: string;
    avatar?: string;
    joinedAt: Date;
  };
  totalParticipants: number;
}
```

**Example**:
```typescript
socket.on('call:participant-joined', (data) => {
  addParticipantToGrid(data.participant);
  showNotification(`${data.participant.username} joined the call`);
});
```

---

#### **Client → Server: `call:leave`**

**Description**: Leave an active call.

**Payload**:
```typescript
interface CallLeavePayload {
  callId: string;
  participantId: string;
}
```

**Example**:
```typescript
socket.emit('call:leave', {
  callId: '65abc789def012345678901',
  participantId: '65abc111def222333444555'
});
```

---

#### **Server → Client: `call:participant-left`**

**Description**: Notify all participants when someone leaves.

**Payload**:
```typescript
interface CallParticipantLeftPayload {
  callId: string;
  participantId: string;
  userId?: string;
  username: string;
  leftAt: Date;
  totalParticipants: number;
}
```

**Example**:
```typescript
socket.on('call:participant-left', (data) => {
  removeParticipantFromGrid(data.participantId);
  showNotification(`${data.username} left the call`);
});
```

---

#### **Server → Client: `call:ended`**

**Description**: Notify all participants that the call has ended.

**Payload**:
```typescript
interface CallEndedPayload {
  callId: string;
  reason: 'normal' | 'timeout' | 'error' | 'forced';
  endedBy?: string;
  endedAt: Date;
  duration: number;  // In seconds
}
```

**Example**:
```typescript
socket.on('call:ended', (data) => {
  cleanupCall();
  showNotification(`Call ended after ${formatDuration(data.duration)}`);
  navigateToConversation();
});
```

---

### P2P Signaling Events

#### **Client → Server: `call:signal`**

**Description**: Relay WebRTC signaling data (offer, answer, ICE candidates) in P2P mode.

**Payload**:
```typescript
interface CallSignalPayload {
  callId: string;
  targetParticipantId: string;
  signal: {
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: string;              // For offer/answer
    candidate?: RTCIceCandidate;  // For ICE candidate
  };
}
```

**Example**:
```typescript
// Send offer
socket.emit('call:signal', {
  callId: '65abc789def012345678901',
  targetParticipantId: '65abc222def333444555666',
  signal: {
    type: 'offer',
    sdp: peerConnection.localDescription.sdp
  }
});

// Send ICE candidate
socket.emit('call:signal', {
  callId: '65abc789def012345678901',
  targetParticipantId: '65abc222def333444555666',
  signal: {
    type: 'ice-candidate',
    candidate: event.candidate
  }
});
```

---

#### **Server → Client: `call:signal`**

**Description**: Receive WebRTC signaling data from another participant.

**Payload**:
```typescript
interface CallSignalReceivedPayload {
  callId: string;
  fromParticipantId: string;
  signal: {
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: string;
    candidate?: RTCIceCandidate;
  };
}
```

**Example**:
```typescript
socket.on('call:signal', async (data) => {
  if (data.signal.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: 'offer',
      sdp: data.signal.sdp
    }));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('call:signal', {
      callId: data.callId,
      targetParticipantId: data.fromParticipantId,
      signal: { type: 'answer', sdp: answer.sdp }
    });
  } else if (data.signal.type === 'ice-candidate') {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
  }
});
```

---

### Mode Switch Events

#### **Server → Client: `call:mode-switch`**

**Description**: Notify participants of a mode switch (P2P ↔ SFU).

**Payload**:
```typescript
interface CallModeSwitchPayload {
  callId: string;
  oldMode: 'p2p' | 'sfu';
  newMode: 'p2p' | 'sfu';
  reason: 'participant-count-changed' | 'manual' | 'quality-fallback';
  mediaServerConfig?: {
    routerId: string;
    rtpCapabilities: any;
  };
  switchDeadline: Date;  // Time by which switch must complete
}
```

**Example**:
```typescript
socket.on('call:mode-switch', async (data) => {
  console.log(`Switching from ${data.oldMode} to ${data.newMode}`);

  if (data.newMode === 'sfu') {
    // Close P2P connections
    closePeerConnections();
    // Connect to SFU
    await connectToSFU(data.mediaServerConfig);
  } else {
    // Close SFU connection
    disconnectFromSFU();
    // Wait for P2P signaling
  }

  socket.emit('call:mode-switch-ack', {
    callId: data.callId,
    success: true
  });
});
```

---

#### **Client → Server: `call:mode-switch-ack`**

**Description**: Acknowledge successful mode switch.

**Payload**:
```typescript
interface CallModeSwitchAckPayload {
  callId: string;
  participantId: string;
  success: boolean;
  error?: string;
}
```

**Example**:
```typescript
socket.emit('call:mode-switch-ack', {
  callId: '65abc789def012345678901',
  participantId: '65abc111def222333444555',
  success: true
});
```

---

### Transcription & Translation Events

#### **Client → Server: `call:transcription`**

**Description**: Send transcription chunk (P2P mode - client-side transcription).

**Payload**:
```typescript
interface CallTranscriptionPayload {
  callId: string;
  participantId: string;
  text: string;
  language: string;
  timestamp: Date;
  isFinal: boolean;  // true = final, false = interim
}
```

**Example**:
```typescript
// Web Speech API integration
recognition.onresult = (event) => {
  const transcript = event.results[event.results.length - 1][0].transcript;
  const isFinal = event.results[event.results.length - 1].isFinal;

  socket.emit('call:transcription', {
    callId: currentCallId,
    participantId: myParticipantId,
    text: transcript,
    language: 'en',
    timestamp: new Date(),
    isFinal
  });
};
```

---

#### **Server → Client: `call:transcription`**

**Description**: Receive transcription with translation for participant.

**Payload**:
```typescript
interface CallTranscriptionReceivedPayload {
  callId: string;
  participantId: string;
  username: string;
  text: string;               // Original text
  language: string;            // Original language
  translation?: string;        // Translated text (user's preferred language)
  targetLanguage?: string;     // Target language for translation
  timestamp: Date;
  isFinal: boolean;
}
```

**Example**:
```typescript
socket.on('call:transcription', (data) => {
  const subtitle = data.translation || data.text;
  displaySubtitle(data.username, subtitle, data.isFinal);
});
```

---

### Media Control Events

#### **Client → Server: `call:media-state-change`**

**Description**: Notify media state changes (mute/unmute, camera on/off).

**Payload**:
```typescript
interface CallMediaStateChangePayload {
  callId: string;
  participantId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
}
```

**Example**:
```typescript
socket.emit('call:media-state-change', {
  callId: '65abc789def012345678901',
  participantId: '65abc111def222333444555',
  audioEnabled: false,  // Muted
  videoEnabled: true,
  screenShareEnabled: false
});
```

---

#### **Server → Client: `call:participant-media-state`**

**Description**: Notify of another participant's media state change.

**Payload**:
```typescript
interface CallParticipantMediaStatePayload {
  callId: string;
  participantId: string;
  username: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
}
```

**Example**:
```typescript
socket.on('call:participant-media-state', (data) => {
  updateParticipantMediaState(data.participantId, {
    audioEnabled: data.audioEnabled,
    videoEnabled: data.videoEnabled,
    screenShareEnabled: data.screenShareEnabled
  });

  if (!data.audioEnabled) {
    showMutedIndicator(data.participantId);
  }
});
```

---

### Error Events

#### **Server → Client: `call:error`**

**Description**: Notify of call-related errors.

**Payload**:
```typescript
interface CallErrorPayload {
  callId?: string;
  code: string;
  message: string;
  details?: any;
}
```

**Example**:
```typescript
socket.on('call:error', (data) => {
  console.error('Call error:', data.code, data.message);
  showErrorNotification(data.message);

  if (data.code === 'CALL_ENDED' || data.code === 'KICKED') {
    cleanupCall();
    navigateToConversation();
  }
});
```

---

## Media Server API

### Overview

The Media Server (mediasoup) exposes HTTP and WebSocket APIs for SFU operations. Communication is primarily via WebSocket for real-time control.

**Base URL**: `http://media-server:3001` (internal) or `wss://media.meeshy.com` (public)

**Authentication**: Shared secret between Gateway and Media Server

---

### 1. Create Router

**Endpoint**: `POST /routers`

**Description**: Create a new mediasoup router for a call.

**Request Headers**:
```
Authorization: Bearer <MEDIA_SERVER_SECRET>
Content-Type: application/json
```

**Request Body**:
```json
{
  "callId": "65abc789def012345678901",
  "mediaCodecs": [
    {
      "kind": "audio",
      "mimeType": "audio/opus",
      "clockRate": 48000,
      "channels": 2
    },
    {
      "kind": "video",
      "mimeType": "video/VP8",
      "clockRate": 90000
    }
  ]
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "routerId": "router-abc123",
    "rtpCapabilities": {
      "codecs": [ /* ... */ ],
      "headerExtensions": [ /* ... */ ]
    }
  }
}
```

---

### 2. Create WebRTC Transport

**Endpoint**: `POST /routers/:routerId/transports`

**Description**: Create a WebRTC transport for a participant (send or receive).

**Request Body**:
```json
{
  "participantId": "65abc111def222333444555",
  "direction": "send",
  "enableUdp": true,
  "enableTcp": true,
  "preferUdp": true,
  "preferTcp": false,
  "initialAvailableOutgoingBitrate": 1000000
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "transportId": "transport-def456",
    "iceParameters": { /* ... */ },
    "iceCandidates": [ /* ... */ ],
    "dtlsParameters": { /* ... */ },
    "sctpParameters": null
  }
}
```

---

### 3. Connect Transport

**Endpoint**: `POST /transports/:transportId/connect`

**Description**: Connect a transport with DTLS parameters.

**Request Body**:
```json
{
  "dtlsParameters": {
    "role": "client",
    "fingerprints": [ /* ... */ ]
  }
}
```

**Response (200 OK)**:
```json
{
  "success": true
}
```

---

### 4. Create Producer

**Endpoint**: `POST /transports/:transportId/producers`

**Description**: Create a producer (audio or video) for a participant.

**Request Body**:
```json
{
  "kind": "video",
  "rtpParameters": { /* ... */ },
  "paused": false,
  "appData": {
    "participantId": "65abc111def222333444555"
  }
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "producerId": "producer-ghi789"
  }
}
```

---

### 5. Create Consumer

**Endpoint**: `POST /transports/:transportId/consumers`

**Description**: Create a consumer to receive another participant's media.

**Request Body**:
```json
{
  "producerId": "producer-ghi789",
  "rtpCapabilities": { /* Client's RTP capabilities */ },
  "paused": false,
  "appData": {
    "peerId": "65abc222def333444555666"
  }
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "consumerId": "consumer-jkl012",
    "kind": "video",
    "rtpParameters": { /* ... */ },
    "paused": false
  }
}
```

---

### 6. Close Producer/Consumer/Transport

**Endpoint**: `DELETE /producers/:producerId` (or `/consumers/:consumerId`, `/transports/:transportId`)

**Description**: Close a producer, consumer, or transport.

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Producer closed"
}
```

---

### 7. Delete Router

**Endpoint**: `DELETE /routers/:routerId`

**Description**: Delete a router when call ends.

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Router deleted"
}
```

---

### WebSocket Events (Media Server)

#### **Server → Client: `new-producer`**

**Description**: Notify that a new producer (participant media) is available.

**Payload**:
```typescript
interface NewProducerPayload {
  producerId: string;
  participantId: string;
  kind: 'audio' | 'video';
}
```

---

#### **Client → Server: `consume`**

**Description**: Request to consume a producer.

**Payload**:
```typescript
interface ConsumeRequestPayload {
  producerId: string;
  rtpCapabilities: any;
}
```

**Response**: Consumer details

---

#### **Server → Client: `producer-closed`**

**Description**: Notify that a producer has been closed.

**Payload**:
```typescript
interface ProducerClosedPayload {
  producerId: string;
  participantId: string;
}
```

---

## Error Codes

### HTTP Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 400 | `INVALID_REQUEST` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | User not allowed to perform action |
| 404 | `NOT_FOUND` | Resource (call, conversation, participant) not found |
| 409 | `CONFLICT` | Call already active or user already participant |
| 422 | `INVALID_CONVERSATION_TYPE` | Conversation type does not support video calls |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Media server or translator unavailable |

### Socket.IO Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| `CALL_NOT_FOUND` | Call does not exist |
| `CALL_ALREADY_ACTIVE` | Call already active in conversation |
| `CALL_ENDED` | Call has ended |
| `PARTICIPANT_NOT_FOUND` | Participant not found |
| `ALREADY_PARTICIPANT` | User already a participant |
| `MAX_PARTICIPANTS_REACHED` | Maximum participants (50) reached |
| `INVALID_MODE` | Invalid call mode requested |
| `MODE_SWITCH_FAILED` | Failed to switch call mode |
| `MEDIA_SERVER_ERROR` | Media server error |
| `TRANSCRIPTION_ERROR` | Transcription service error |
| `TRANSLATION_ERROR` | Translation service error |
| `SIGNALING_ERROR` | WebRTC signaling error |
| `PERMISSION_DENIED` | User lacks permission |
| `KICKED` | User was kicked from call |
| `TIMEOUT` | Operation timed out |

---

## Versioning Strategy

### API Versioning

**Approach**: URL-based versioning for REST API, event prefixes for Socket.IO

#### REST API
- Current version: `v1` (implicit in base path `/api`)
- Future versions: `/api/v2/calls` (when breaking changes needed)
- **Deprecation policy**: 6 months notice, support 2 versions concurrently

#### Socket.IO
- Current events: `call:*` (no version prefix)
- Future versions: `call:v2:*` (if breaking changes)
- **Backward compatibility**: Support both `call:*` and `call:v2:*` for 6 months

### API Evolution Guidelines

1. **Non-breaking changes** (no version bump):
   - Adding new optional fields
   - Adding new endpoints/events
   - Adding new error codes
   - Performance improvements

2. **Breaking changes** (requires version bump):
   - Removing or renaming fields
   - Changing field types
   - Removing endpoints/events
   - Changing authentication mechanism

### Client SDK Versioning

- Frontend SDK version should match API version
- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Example: `@meeshy/call-sdk@1.2.3`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Draft for Review
