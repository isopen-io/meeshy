# Phase 1B: Media Server API Design

## Table of Contents
1. [Overview](#overview)
2. [REST API Endpoints](#rest-api-endpoints)
3. [WebSocket Events](#websocket-events)
4. [Request/Response Schemas](#requestresponse-schemas)
5. [Error Handling](#error-handling)
6. [Authentication & Authorization](#authentication--authorization)
7. [Rate Limiting](#rate-limiting)
8. [API Examples](#api-examples)

---

## Overview

The Media Server exposes two interfaces:
1. **REST API** (HTTP): Room/transport/producer/consumer management
2. **WebSocket API**: Real-time events (new producers, producer closed, etc.)

### Base URL
- Development: `http://localhost:3001`
- Production: `https://media.meeshy.com`

### Authentication
All requests require JWT token in `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

JWT is validated by Media Server (shared secret with Gateway).

---

## REST API Endpoints

### 1. Create Room (Router)

**Endpoint**: `POST /api/rooms/:callId/create`

**Description**: Create mediasoup Router for a call session.

**Path Parameters**:
- `callId` (string, required): CallSession ID from database

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "roomId": "65abc123...",
    "routerId": "router-abc123",
    "rtpCapabilities": {
      "codecs": [
        {
          "kind": "audio",
          "mimeType": "audio/opus",
          "clockRate": 48000,
          "channels": 2,
          "parameters": {}
        },
        {
          "kind": "video",
          "mimeType": "video/VP8",
          "clockRate": 90000,
          "parameters": {}
        }
      ],
      "headerExtensions": [...]
    }
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid callId
- `409 Conflict`: Room already exists for this call
- `500 Internal Server Error`: Worker/Router creation failed

**Example**:
```bash
curl -X POST https://media.meeshy.com/api/rooms/65abc123/create \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### 2. Get Room Info

**Endpoint**: `GET /api/rooms/:callId`

**Description**: Get Router RTP capabilities and participant count.

**Path Parameters**:
- `callId` (string, required): CallSession ID

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "roomId": "65abc123...",
    "routerId": "router-abc123",
    "rtpCapabilities": { ... },
    "participantCount": 3,
    "createdAt": "2025-10-28T10:30:00Z"
  }
}
```

**Error Responses**:
- `404 Not Found`: Room does not exist

---

### 3. Create WebRTC Transport

**Endpoint**: `POST /api/rooms/:callId/transports`

**Description**: Create WebRTC transport for sending or receiving media.

**Path Parameters**:
- `callId` (string, required): CallSession ID

**Request Body**:
```json
{
  "participantId": "participant-abc123",
  "direction": "send",  // or "recv"
  "forceTcp": false,
  "producing": true,
  "consuming": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transportId": "transport-send-abc123",
    "iceParameters": {
      "usernameFragment": "abc123",
      "password": "xyz789",
      "iceLite": true
    },
    "iceCandidates": [
      {
        "foundation": "udpcandidate",
        "priority": 1076302079,
        "ip": "192.168.1.100",
        "protocol": "udp",
        "port": 10000,
        "type": "host"
      }
    ],
    "dtlsParameters": {
      "role": "auto",
      "fingerprints": [
        {
          "algorithm": "sha-256",
          "value": "A1:B2:C3:..."
        }
      ]
    },
    "sctpParameters": null
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid direction or missing participantId
- `404 Not Found`: Room not found
- `500 Internal Server Error`: Transport creation failed

---

### 4. Connect WebRTC Transport

**Endpoint**: `POST /api/rooms/:callId/transports/:transportId/connect`

**Description**: Connect WebRTC transport with DTLS parameters from client.

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `transportId` (string, required): Transport ID from create endpoint

**Request Body**:
```json
{
  "dtlsParameters": {
    "role": "client",
    "fingerprints": [
      {
        "algorithm": "sha-256",
        "value": "D4:E5:F6:..."
      }
    ]
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Transport connected"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid DTLS parameters
- `404 Not Found`: Transport not found
- `500 Internal Server Error`: Connection failed

---

### 5. Produce Media

**Endpoint**: `POST /api/rooms/:callId/transports/:transportId/produce`

**Description**: Produce audio or video track to SFU.

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `transportId` (string, required): Send transport ID

**Request Body**:
```json
{
  "participantId": "participant-abc123",
  "kind": "audio",  // or "video"
  "rtpParameters": {
    "codecs": [
      {
        "mimeType": "audio/opus",
        "payloadType": 111,
        "clockRate": 48000,
        "channels": 2,
        "parameters": {}
      }
    ],
    "headerExtensions": [...],
    "encodings": [
      {
        "ssrc": 12345678
      }
    ],
    "rtcp": {
      "cname": "participant-abc123",
      "reducedSize": true
    }
  },
  "appData": {
    "source": "microphone"  // or "camera", "screen"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "producerId": "producer-audio-abc123",
    "kind": "audio"
  }
}
```

**Side Effect**:
- Media Server emits WebSocket event `new-producer` to Gateway
- Gateway broadcasts to all other participants in call

**Error Responses**:
- `400 Bad Request`: Invalid RTP parameters or kind
- `404 Not Found`: Transport not found
- `409 Conflict`: Producer already exists for this kind
- `500 Internal Server Error`: Producer creation failed

---

### 6. Consume Media

**Endpoint**: `POST /api/rooms/:callId/consume`

**Description**: Consume remote participant's media track.

**Path Parameters**:
- `callId` (string, required): CallSession ID

**Request Body**:
```json
{
  "participantId": "participant-abc123",
  "producerId": "producer-audio-xyz789",
  "rtpCapabilities": {
    "codecs": [...],
    "headerExtensions": [...]
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "consumerId": "consumer-abc123",
    "producerId": "producer-audio-xyz789",
    "kind": "audio",
    "rtpParameters": {
      "codecs": [...],
      "headerExtensions": [...],
      "encodings": [...],
      "rtcp": {...}
    },
    "type": "simple",
    "producerPaused": false
  }
}
```

**Note**: Consumer is created in paused state. Client must call `/resume` to start receiving media.

**Error Responses**:
- `400 Bad Request`: Invalid RTP capabilities or producer ID
- `404 Not Found`: Room or producer not found
- `422 Unprocessable Entity`: Client cannot consume this codec
- `500 Internal Server Error`: Consumer creation failed

---

### 7. Resume Consumer

**Endpoint**: `POST /api/rooms/:callId/consumers/:consumerId/resume`

**Description**: Resume paused consumer to start receiving media.

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `consumerId` (string, required): Consumer ID

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Consumer resumed"
}
```

**Error Responses**:
- `404 Not Found`: Consumer not found
- `500 Internal Server Error`: Resume failed

---

### 8. Pause Consumer

**Endpoint**: `POST /api/rooms/:callId/consumers/:consumerId/pause`

**Description**: Pause consumer to stop receiving media.

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `consumerId` (string, required): Consumer ID

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Consumer paused"
}
```

---

### 9. Close Producer

**Endpoint**: `DELETE /api/rooms/:callId/producers/:producerId`

**Description**: Close producer (e.g., when user disables camera).

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `producerId` (string, required): Producer ID

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Producer closed"
}
```

**Side Effect**:
- Media Server emits WebSocket event `producer-closed`
- All consumers of this producer are automatically closed

---

### 10. Leave Room

**Endpoint**: `POST /api/rooms/:callId/participants/:participantId/leave`

**Description**: Remove participant from room, close all transports/producers/consumers.

**Path Parameters**:
- `callId` (string, required): CallSession ID
- `participantId` (string, required): Participant ID

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Participant left room"
}
```

**Side Effect**:
- All participant's producers closed (triggers `producer-closed` events)
- All participant's consumers closed
- Transports closed
- If last participant, room is destroyed

---

### 11. Destroy Room

**Endpoint**: `DELETE /api/rooms/:callId`

**Description**: Destroy room and all associated resources (called by Gateway when call ends).

**Path Parameters**:
- `callId` (string, required): CallSession ID

**Request Body**: None

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Room destroyed"
}
```

**Side Effect**:
- All transports, producers, consumers closed
- Router closed
- Room removed from registry

---

## WebSocket Events

### Connection

**URL**: `wss://media.meeshy.com`

**Authentication**:
```javascript
const socket = io('wss://media.meeshy.com', {
  auth: {
    token: jwtToken
  }
});
```

### Events (Server → Client)

#### 1. `new-producer`

**Description**: New media producer available for consumption.

**Payload**:
```json
{
  "callId": "65abc123...",
  "participantId": "participant-xyz789",
  "producerId": "producer-audio-abc123",
  "kind": "audio",
  "appData": {
    "source": "microphone"
  }
}
```

**Client Action**: Call `POST /api/rooms/:callId/consume` to consume this producer.

---

#### 2. `producer-closed`

**Description**: Producer closed (user disabled media or left).

**Payload**:
```json
{
  "callId": "65abc123...",
  "participantId": "participant-xyz789",
  "producerId": "producer-audio-abc123",
  "kind": "audio"
}
```

**Client Action**: Close associated consumer, remove video tile from UI.

---

#### 3. `consumer-paused`

**Description**: Consumer paused (by producer or network issue).

**Payload**:
```json
{
  "callId": "65abc123...",
  "consumerId": "consumer-abc123",
  "producerId": "producer-video-xyz789"
}
```

**Client Action**: Show "paused" indicator on video tile.

---

#### 4. `consumer-resumed`

**Description**: Consumer resumed.

**Payload**:
```json
{
  "callId": "65abc123...",
  "consumerId": "consumer-abc123",
  "producerId": "producer-video-xyz789"
}
```

**Client Action**: Hide "paused" indicator.

---

### Events (Client → Server)

#### 1. `join-room`

**Description**: Join room to receive producer notifications.

**Payload**:
```json
{
  "callId": "65abc123...",
  "participantId": "participant-abc123"
}
```

**Server Response**: Emits all existing producers to client.

---

#### 2. `leave-room`

**Description**: Leave room (cleanup).

**Payload**:
```json
{
  "callId": "65abc123...",
  "participantId": "participant-abc123"
}
```

---

## Request/Response Schemas

### TypeScript Definitions

```typescript
// Request Types
export interface CreateTransportRequest {
  participantId: string;
  direction: 'send' | 'recv';
  forceTcp?: boolean;
  producing?: boolean;
  consuming?: boolean;
}

export interface ConnectTransportRequest {
  dtlsParameters: {
    role: 'client' | 'server' | 'auto';
    fingerprints: Array<{
      algorithm: string;
      value: string;
    }>;
  };
}

export interface ProduceRequest {
  participantId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  appData?: Record<string, any>;
}

export interface ConsumeRequest {
  participantId: string;
  producerId: string;
  rtpCapabilities: RtpCapabilities;
}

// Response Types
export interface CreateRoomResponse {
  success: boolean;
  data: {
    roomId: string;
    routerId: string;
    rtpCapabilities: RtpCapabilities;
  };
}

export interface CreateTransportResponse {
  success: boolean;
  data: {
    transportId: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    sctpParameters?: SctpParameters;
  };
}

export interface ProduceResponse {
  success: boolean;
  data: {
    producerId: string;
    kind: 'audio' | 'video';
  };
}

export interface ConsumeResponse {
  success: boolean;
  data: {
    consumerId: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
    type: 'simple' | 'simulcast' | 'svc';
    producerPaused: boolean;
  };
}

// WebSocket Event Types
export interface NewProducerEvent {
  callId: string;
  participantId: string;
  producerId: string;
  kind: 'audio' | 'video';
  appData?: Record<string, any>;
}

export interface ProducerClosedEvent {
  callId: string;
  participantId: string;
  producerId: string;
  kind: 'audio' | 'video';
}
```

---

## Error Handling

### Error Response Format

All errors follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "TRANSPORT_NOT_FOUND",
    "message": "Transport with ID transport-abc123 not found",
    "details": {
      "transportId": "transport-abc123",
      "callId": "65abc123..."
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ROOM_NOT_FOUND` | 404 | Room does not exist |
| `ROOM_ALREADY_EXISTS` | 409 | Room already created for this call |
| `TRANSPORT_NOT_FOUND` | 404 | Transport ID not found |
| `PRODUCER_NOT_FOUND` | 404 | Producer ID not found |
| `CONSUMER_NOT_FOUND` | 404 | Consumer ID not found |
| `INVALID_RTP_CAPABILITIES` | 400 | Invalid RTP capabilities |
| `UNSUPPORTED_CODEC` | 422 | Client cannot consume codec |
| `TRANSPORT_CONNECTION_FAILED` | 500 | Transport connection error |
| `PRODUCER_CREATION_FAILED` | 500 | Producer creation error |
| `CONSUMER_CREATION_FAILED` | 500 | Consumer creation error |
| `UNAUTHORIZED` | 401 | Invalid or missing JWT token |
| `FORBIDDEN` | 403 | User not participant in call |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Generic server error |

### Error Handling Best Practices

**Client-Side**:
```typescript
try {
  const response = await fetch('/api/rooms/:callId/transports', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ participantId, direction: 'send' })
  });

  if (!response.ok) {
    const error = await response.json();
    if (error.error.code === 'ROOM_NOT_FOUND') {
      // Room doesn't exist, maybe call ended
      handleCallEnded();
    } else {
      throw new Error(error.error.message);
    }
  }

  const data = await response.json();
  return data.data;
} catch (err) {
  console.error('Transport creation failed:', err);
  showErrorToUser('Failed to join call. Please try again.');
}
```

---

## Authentication & Authorization

### JWT Token Structure

**Payload**:
```json
{
  "sub": "userId-abc123",
  "callId": "65abc123...",
  "participantId": "participant-xyz789",
  "role": "participant",
  "exp": 1698765432,
  "iat": 1698761832
}
```

**Validation**:
- Token signed with shared secret (HS256) between Gateway and Media Server
- `callId` claim verified against request path
- `participantId` claim verified against request body
- Token expiration checked

**Example Validation (Media Server)**:
```typescript
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing token' }
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify callId matches
    if (decoded.callId !== req.params.callId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Token callId mismatch' }
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
    });
  }
}
```

---

## Rate Limiting

### Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `POST /api/rooms/:callId/create` | 10 | 1 minute | Per callId |
| `POST /api/rooms/:callId/transports` | 50 | 1 minute | Per participantId |
| `POST /api/rooms/:callId/consume` | 100 | 1 minute | Per participantId |
| `POST /api/rooms/:callId/transports/:id/connect` | 50 | 1 minute | Per participantId |
| All other endpoints | 200 | 1 minute | Per IP |

### Rate Limit Response

**429 Too Many Requests**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Retry after 30 seconds.",
    "retryAfter": 30
  }
}
```

**Headers**:
```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1698765462
Retry-After: 30
```

---

## API Examples

### Complete Call Flow (SFU Mode)

#### Step 1: Create Room (Gateway calls Media Server)

```bash
POST /api/rooms/65abc123/create
Authorization: Bearer <gateway_service_token>

Response:
{
  "success": true,
  "data": {
    "roomId": "65abc123",
    "routerId": "router-abc123",
    "rtpCapabilities": { ... }
  }
}
```

#### Step 2: Client Creates Send Transport

```javascript
const response = await fetch('/api/rooms/65abc123/transports', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    participantId: 'participant-xyz789',
    direction: 'send'
  })
});

const { data } = await response.json();
// data.transportId, data.iceParameters, data.dtlsParameters
```

#### Step 3: Client Connects Send Transport

```javascript
// mediasoup-client Device
const sendTransport = device.createSendTransport({
  id: data.transportId,
  iceParameters: data.iceParameters,
  iceCandidates: data.iceCandidates,
  dtlsParameters: data.dtlsParameters
});

sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
  try {
    await fetch(`/api/rooms/65abc123/transports/${data.transportId}/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dtlsParameters })
    });

    callback();
  } catch (err) {
    errback(err);
  }
});
```

#### Step 4: Client Produces Audio Track

```javascript
sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
  try {
    const response = await fetch(`/api/rooms/65abc123/transports/${data.transportId}/produce`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participantId: 'participant-xyz789',
        kind,
        rtpParameters
      })
    });

    const { data } = await response.json();
    callback({ id: data.producerId });
  } catch (err) {
    errback(err);
  }
});

// Produce audio track
const audioTrack = localStream.getAudioTracks()[0];
const audioProducer = await sendTransport.produce({ track: audioTrack });
```

#### Step 5: Client Receives New Producer Event (WebSocket)

```javascript
socket.on('new-producer', async ({ callId, participantId, producerId, kind }) => {
  // Create receive transport if not exists
  if (!recvTransport) {
    const response = await fetch('/api/rooms/65abc123/transports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participantId: 'participant-xyz789',
        direction: 'recv'
      })
    });

    const { data } = await response.json();
    recvTransport = device.createRecvTransport({
      id: data.transportId,
      iceParameters: data.iceParameters,
      iceCandidates: data.iceCandidates,
      dtlsParameters: data.dtlsParameters
    });

    // Connect receive transport (similar to send transport)
  }

  // Consume producer
  const consumeResponse = await fetch('/api/rooms/65abc123/consume', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      participantId: 'participant-xyz789',
      producerId,
      rtpCapabilities: device.rtpCapabilities
    })
  });

  const { data: consumerData } = await consumeResponse.json();

  const consumer = await recvTransport.consume({
    id: consumerData.consumerId,
    producerId: consumerData.producerId,
    kind: consumerData.kind,
    rtpParameters: consumerData.rtpParameters
  });

  // Resume consumer
  await fetch(`/api/rooms/65abc123/consumers/${consumerData.consumerId}/resume`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });

  // Add track to UI
  const remoteStream = new MediaStream([consumer.track]);
  addRemoteVideoTile(participantId, remoteStream);
});
```

#### Step 6: Client Leaves Call

```javascript
await fetch(`/api/rooms/65abc123/participants/participant-xyz789/leave`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${userToken}` }
});

sendTransport.close();
recvTransport.close();
socket.emit('leave-room', { callId: '65abc123', participantId: 'participant-xyz789' });
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Microservices Architect (Claude)
**Status**: Final for Review
