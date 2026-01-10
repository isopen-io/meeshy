# Video Call Feature - Architecture Documentation

## Overview

This directory contains comprehensive architecture documentation for Meeshy's **Video Call Feature with Real-time Translation**.

### Feature Highlights
- **Dynamic P2P/SFU switching**: P2P for 2 participants, automatic migration to SFU for 3-50 participants
- **Conversation type support**: DIRECT (always 2) and GROUP (2+) conversations
- **Anonymous participants**: Full video call support via share links
- **Real-time transcription & translation**: Client-side (P2P) and server-side (SFU) with multi-language support
- **Seamless integration**: Leverages existing Socket.IO, Gateway, Translator Service, MongoDB infrastructure

---

## Documentation Structure

### Core Architecture Documents

| Document | Description | Status |
|----------|-------------|--------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System context, container architecture, component diagrams, technology stack, deployment | Complete |
| **[API_CONTRACTS.md](./API_CONTRACTS.md)** | REST API, Socket.IO events, Media Server API, error codes, versioning | Complete |
| **[DATA_MODELS.md](./DATA_MODELS.md)** | Prisma schemas, database design, indexes, GDPR compliance, sample queries | Complete |
| **[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md)** | Detailed interaction flows for all critical scenarios (Mermaid diagrams) | Complete |
| **[SECURITY.md](./SECURITY.md)** | Security architecture, threat model, WebRTC security, OWASP Top 10 mitigation | Complete |
| **[SCALING_STRATEGY.md](./SCALING_STRATEGY.md)** | Capacity planning, horizontal scaling, performance optimization, cost analysis | Complete |

### Architecture Decision Records (ADRs)

| ADR | Title | Status |
|-----|-------|--------|
| **[ADR-001](./adr/ADR-001-mediasoup-for-sfu.md)** | Use mediasoup for SFU Implementation | Accepted |
| **[ADR-002](./adr/ADR-002-p2p-sfu-threshold.md)** | P2P vs SFU Threshold at 2 Participants | Accepted |
| **[ADR-003](./adr/ADR-003-client-vs-server-transcription.md)** | Client-side (P2P) vs Server-side (SFU) Transcription Strategy | Accepted |

---

## Quick Start Guide

### For Product Owners
1. Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Understand system design and technology choices
2. Read **[API_CONTRACTS.md](./API_CONTRACTS.md)** - Understand user-facing features and API capabilities
3. Review **[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md)** - Visualize user flows

### For Backend Developers
1. Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Gateway and Media Server architecture
2. Read **[API_CONTRACTS.md](./API_CONTRACTS.md)** - Implement REST and Socket.IO endpoints
3. Read **[DATA_MODELS.md](./DATA_MODELS.md)** - Prisma schema and database queries
4. Read **[SECURITY.md](./SECURITY.md)** - Security requirements

### For Frontend Developers
1. Read **[API_CONTRACTS.md](./API_CONTRACTS.md)** - Socket.IO events and REST API usage
2. Read **[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md)** - Understand call flows
3. Read **ADR-003** - Transcription client implementation

### For DevOps Engineers
1. Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Deployment architecture (Docker/Kubernetes)
2. Read **[SCALING_STRATEGY.md](./SCALING_STRATEGY.md)** - Scaling, monitoring, and cost optimization
3. Read **[SECURITY.md](./SECURITY.md)** - Security infrastructure requirements

### For QA Engineers
1. Read **[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md)** - Test scenarios
2. Read **[API_CONTRACTS.md](./API_CONTRACTS.md)** - API test cases
3. Read **[SCALING_STRATEGY.md](./SCALING_STRATEGY.md)** - Performance benchmarks and load testing

---

## Key Architectural Decisions

### 1. Technology Stack
- **Frontend**: Next.js/React, TypeScript, mediasoup-client, Web Speech API, Whisper.js
- **Backend**: Node.js/Express, Socket.IO, mediasoup (SFU), Prisma, MongoDB
- **Transcription**: Web Speech API (client), faster-whisper (server)
- **Translation**: Existing Translator Service (Python/FastAPI)
- **Infrastructure**: Docker, Redis, Coturn (STUN/TURN), Prometheus/Grafana

**Rationale**: See [ADR-001](./adr/ADR-001-mediasoup-for-sfu.md)

### 2. P2P vs SFU Mode Switching
- **P2P**: 2 participants (DIRECT always, GROUP with 2)
- **SFU**: 3-50 participants (GROUP only)
- **Automatic migration**: P2P ↔ SFU on participant join/leave

**Rationale**: See [ADR-002](./adr/ADR-002-p2p-sfu-threshold.md)

### 3. Transcription Strategy
- **Client-side (P2P)**: Web Speech API (primary), Whisper.js (fallback)
- **Server-side (SFU)**: faster-whisper on media server

**Rationale**: See [ADR-003](./adr/ADR-003-client-vs-server-transcription.md)

---

## Implementation Roadmap

### Phase 1: MVP (Weeks 1-4)
- [ ] Gateway: REST API endpoints (call CRUD)
- [ ] Gateway: Socket.IO signaling events
- [ ] Frontend: WebRTC P2P implementation (simple-peer)
- [ ] Frontend: Basic call UI (video grid, controls)
- [ ] Database: Prisma schema migration
- [ ] DIRECT conversation video calls (P2P only)

### Phase 2: SFU & Mode Switching (Weeks 5-8)
- [ ] Media Server: mediasoup integration
- [ ] Gateway: Media Server controller
- [ ] Frontend: mediasoup-client integration
- [ ] P2P → SFU migration logic
- [ ] SFU → P2P migration logic
- [ ] GROUP conversation video calls (P2P + SFU)

### Phase 3: Transcription & Translation (Weeks 9-12)
- [ ] Frontend: Web Speech API transcription client
- [ ] Frontend: Whisper.js fallback
- [ ] Media Server: faster-whisper integration
- [ ] Gateway: Translation pipeline integration
- [ ] Frontend: Subtitle display UI

### Phase 4: Anonymous & Polish (Weeks 13-16)
- [ ] Anonymous participant support (share links)
- [ ] Call recording (optional)
- [ ] Screen sharing
- [ ] Mobile optimization (iOS/Android)
- [ ] Performance optimization
- [ ] Load testing

### Phase 5: Production Readiness (Weeks 17-20)
- [ ] Monitoring & alerting (Prometheus/Grafana)
- [ ] Security audit & penetration testing
- [ ] Documentation & training
- [ ] Staged rollout (10% → 50% → 100%)
- [ ] Post-launch monitoring

---

## Architecture Diagrams

### System Context (C4 Level 1)
See [ARCHITECTURE.md#system-context](./ARCHITECTURE.md#system-context)

### Container Architecture (C4 Level 2)
See [ARCHITECTURE.md#container-architecture](./ARCHITECTURE.md#container-architecture)

### Call Flow Sequences
See [SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md):
- Call Initiation (P2P)
- 3rd Participant Joins (P2P → SFU)
- Participant Leaves (SFU → P2P)
- Client-side Transcription Flow
- Server-side Transcription Flow
- Error Handling & Reconnection
- Anonymous Participant Joins

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Call connection time** | <2s (p95) | Time from join → media flowing |
| **Media latency (P2P)** | <100ms (p95) | Direct peer-to-peer RTT |
| **Media latency (SFU)** | <150ms (p95) | Via media server routing |
| **Transcription latency (client)** | <500ms (p95) | Web Speech API |
| **Transcription latency (server)** | <1.2s (p95) | faster-whisper |
| **Mode switch duration** | <2s (p95) | P2P ↔ SFU migration |
| **Uptime** | 99.9% | ~43 minutes downtime/month |
| **Max participants per call** | 50 | SFU mode |
| **Cost per call-hour** | <$0.10 | At scale (1000 concurrent) |

---

## Security Highlights

- **WebRTC encryption**: DTLS-SRTP (mandatory)
- **Signaling**: WSS (WebSocket Secure), JWT authentication
- **API**: HTTPS only, rate limiting, input validation
- **STUN/TURN**: Short-lived credentials, authentication
- **Transcriptions**: TLS in transit, encryption at rest, 30-day retention
- **GDPR**: Right to erasure, data minimization, audit logs

See [SECURITY.md](./SECURITY.md) for details.

---

## Scaling Capacity

| Phase | Concurrent Calls | Concurrent Participants | Infrastructure |
|-------|------------------|-------------------------|----------------|
| **MVP** | 50 | 150 | 2 Gateway, 2 Media Server |
| **Year 1** | 500 | 1,500 | 5 Gateway, 10 Media Server |
| **Year 2** | 1,000 | 3,000 | 8 Gateway, 20 Media Server |
| **Year 3** | 2,000 | 6,000 | 12 Gateway, 30 Media Server |

See [SCALING_STRATEGY.md](./SCALING_STRATEGY.md) for details.

---

## Cost Estimates

### MVP Infrastructure (50 concurrent calls)
- **Monthly cost**: ~$500
- **Cost per call-hour**: ~$0.30

### Production Scale (1000 concurrent calls)
- **Monthly cost**: ~$1,500 (with optimizations)
- **Cost per call-hour**: ~$0.05

See [SCALING_STRATEGY.md#cost-optimization](./SCALING_STRATEGY.md#cost-optimization) for breakdown.

---

## Open Questions & Risks

### Open Questions
1. **Recording storage**: Where to store call recordings? S3, MinIO, or DigitalOcean Spaces?
2. **GPU availability**: Do we have GPU instances for faster-whisper, or use CPU only?
3. **TURN provider**: Self-host Coturn or use Twilio/Cloudflare for TURN?
4. **Monitoring**: Prometheus + Grafana (self-hosted) or DataDog (SaaS)?

### Identified Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Mode switch failures** | Medium | High | Extensive testing, fallback to SFU-only mode |
| **Transcription accuracy** | Medium | Medium | User feedback, fallback to manual captions |
| **Media server scaling** | Low | High | Horizontal scaling, load testing, auto-scaling |
| **TURN server costs** | Medium | Medium | Optimize P2P success rate (reduce TURN usage) |
| **Security vulnerabilities** | Low | Critical | Security audit, penetration testing, bug bounty |

---

## References

### External Resources
- **mediasoup**: https://mediasoup.org
- **WebRTC**: https://webrtc.org
- **faster-whisper**: https://github.com/guillaumekln/faster-whisper
- **Socket.IO**: https://socket.io
- **Prisma**: https://www.prisma.io

### Internal Resources
- **Existing Translator Service**: `/translator/`
- **Gateway Service**: `/gateway/`
- **Frontend App**: `/apps/web/`
- **Shared Types**: `/apps/web/shared/types/`

---

## Change Log

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-10-28 | 1.0 | Microservices Architect (Claude) | Initial architecture documentation |

---

## Contact & Feedback

For questions or feedback on this architecture:
- **Architecture Review**: [Schedule review meeting]
- **Implementation Questions**: [Slack #video-calls channel]
- **Documentation Updates**: [Submit PR to docs/video-calls/]

---

**Document Status**: Draft for Review
**Next Steps**: Architecture review meeting with stakeholders
**Approval Required**: Product Owner, Tech Lead, DevOps Lead
