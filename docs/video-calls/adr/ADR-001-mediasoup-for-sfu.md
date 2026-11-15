# ADR-001: Use mediasoup for SFU Implementation

**Status**: Accepted

**Date**: 2025-10-28

**Deciders**: Microservices Architecture Team

---

## Context

The Video Call Feature requires an SFU (Selective Forwarding Unit) media server to support 3-50 concurrent participants efficiently. We need a production-grade WebRTC SFU solution that:

1. Supports selective forwarding (routing, not mixing)
2. Handles dynamic scaling (participants join/leave)
3. Provides low latency (<2s)
4. Integrates with our Node.js/TypeScript stack
5. Supports audio/video transcription pipelines
6. Is open-source and actively maintained

### Alternatives Considered

| Solution | License | Language | Maturity | Pros | Cons |
|----------|---------|----------|----------|------|------|
| **mediasoup** | MIT | C++/Node.js | Production | Fast, flexible, excellent docs, active community, Node.js API | Requires C++ build tools |
| **Jitsi Videobridge** | Apache 2.0 | Java | Production | Full-featured, battle-tested (Jitsi Meet) | Java stack, harder to embed, less flexible |
| **Janus Gateway** | GPL v3 | C | Production | Powerful, plugin-based | GPL license, C API (harder integration), complex config |
| **Kurento** | Apache 2.0 | C++ | Declining | Media processing features | Project less active, heavier resource usage |
| **ion-SFU** | MIT | Go | Beta | Modern, Go-based | Newer project, smaller community, Go ecosystem |
| **LiveKit** | Apache 2.0 | Go | Production | Modern, scalable, commercial support | Newer, less flexible for custom transcription |

---

## Decision

We will use **mediasoup 3.x** as the SFU media server for the following reasons:

### 1. **Perfect Stack Alignment**
- **Node.js API**: Native TypeScript/JavaScript API matches our Gateway (Node.js) and Frontend (TypeScript)
- **Shared types**: Easy to share types between Frontend (mediasoup-client) and Backend (mediasoup)
- **No language barriers**: Team already proficient in Node.js/TypeScript

### 2. **Production-Grade Performance**
- **C++ core**: High-performance libwebrtc-based core for media routing
- **Benchmarks**: Handles 50+ participants per worker with minimal CPU usage
- **Low latency**: <100ms routing latency, <2s connection establishment
- **Optimized for VP8/VP9/H.264**: Modern video codecs with excellent compression

### 3. **Flexibility & Customization**
- **API-first design**: Full control over routing logic (no black box)
- **Worker model**: Multi-core scaling via worker processes
- **Custom pipelines**: Easy to tap audio streams for transcription (faster-whisper)
- **No vendor lock-in**: Open-source, self-hosted, zero recurring costs

### 4. **Excellent Documentation & Community**
- **Official docs**: https://mediasoup.org - comprehensive API reference
- **Active maintainers**: Regular releases, responsive GitHub issues
- **Large community**: 5k+ GitHub stars, many production deployments
- **Examples**: Multiple full-stack examples (React, Vue, Angular)

### 5. **Feature Completeness**
- **Simulcast**: Multiple video quality layers (adaptive bitrate)
- **Bandwidth estimation**: Built-in REMB, Transport-CC support
- **DTLS-SRTP**: Secure media encryption
- **Data channels**: Support for in-call messaging (future feature)
- **Recording**: Audio/video recording via RTP packet capture

### 6. **Cost-Effective**
- **MIT License**: No licensing fees, commercial use allowed
- **Self-hosted**: No per-minute or per-participant charges
- **Resource efficient**: ~100 MB RAM per 50 participants (vs. 500 MB+ for Janus)

---

## Consequences

### Positive

1. **Fast time-to-market**: Well-documented API, existing examples, easy integration
2. **Team velocity**: No new language to learn (stays in Node.js/TypeScript)
3. **Customizability**: Full control over transcription pipeline integration
4. **Cost savings**: No SaaS fees (Twilio, Vonage, Agora charge $0.004/min/participant)
5. **Privacy**: Self-hosted, no third-party data access
6. **Scalability**: Proven to handle large-scale deployments (hundreds of participants)

### Negative

1. **Build complexity**: Requires C++ build tools (node-gyp, Python 3, C++ compiler) during deployment
   - **Mitigation**: Docker image with pre-compiled binaries, CI/CD handles builds
2. **Operational overhead**: Self-hosting requires server management, monitoring, updates
   - **Mitigation**: Docker/Kubernetes deployment, Prometheus metrics, automated alerts
3. **Learning curve**: Requires understanding of WebRTC concepts (SDP, ICE, RTP, RTCP)
   - **Mitigation**: Team already familiar with WebRTC from P2P implementation
4. **No GUI**: mediasoup is API-only (no built-in admin UI)
   - **Mitigation**: Build custom admin dashboard (call monitoring, stats)

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **C++ build fails in CI/CD** | Medium | High | Use pre-built Docker images, test builds in staging |
| **Performance issues at scale** | Low | High | Load testing (50+ participants), worker scaling, multi-server setup |
| **Breaking changes in updates** | Low | Medium | Pin version in package.json, test updates in staging |
| **Security vulnerabilities** | Low | High | Subscribe to security advisories, automated dependency updates (Dependabot) |

---

## Implementation Notes

### Installation
```bash
npm install mediasoup@3.x mediasoup-client@3.x
```

### Worker Configuration
```typescript
import mediasoup from 'mediasoup';

const worker = await mediasoup.createWorker({
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 10100
});

const router = await worker.createRouter({
  mediaCodecs: [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000
      }
    }
  ]
});
```

### Transcription Pipeline Integration
```typescript
// Tap audio producer for transcription
const audioProducer = await transport.produce({ kind: 'audio', rtpParameters });

// Create PlainTransport to receive RTP packets
const plainTransport = await router.createPlainTransport({
  listenIp: '127.0.0.1',
  rtcpMux: false,
  comedia: true
});

// Pipe audio to transcription service (faster-whisper)
await plainTransport.connect({ ip: '127.0.0.1', port: 5004 });
const consumer = await plainTransport.consume({
  producerId: audioProducer.id,
  rtpCapabilities: router.rtpCapabilities
});

// faster-whisper receives RTP stream, transcribes, sends back text
```

---

## References

- **mediasoup documentation**: https://mediasoup.org
- **mediasoup GitHub**: https://github.com/versatica/mediasoup
- **mediasoup-client**: https://github.com/versatica/mediasoup-client
- **WebRTC SFU comparison**: https://webrtchacks.com/sfu-benchmark-2021/
- **Production deployments**:
  - MiroTalk: https://github.com/miroslavpejic85/mirotalk
  - Galene: https://galene.org
  - edumeet: https://github.com/edumeet/edumeet

---

## Approval

**Approved by**: Architecture Team
**Implementation start**: Week 1 (Post-Architecture Review)
**Review date**: 6 months post-deployment
