# Meeshy

> Real-time multilingual messaging platform with AI-powered translation and voice cloning capabilities.

[![Node.js](https://img.shields.io/badge/Node.js-22.0+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.7.4-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.5-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5.6.2-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.6-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47A248?logo=mongodb&logoColor=white)](https://mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-8--alpine-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Platform Overview

Meeshy is a production-ready messaging platform that enables seamless cross-language communication. Users can send messages in their native language, and recipients receive them translated with optional AI-generated voice that preserves the sender's vocal characteristics.

### Key Features

- **Real-time Translation** - Instant message translation across 8+ languages using HuggingFace transformers
- **Voice Cloning** - AI-generated audio that mimics the sender's voice using Chatterbox TTS
- **Speech-to-Text** - Voice message transcription with faster-whisper (CTranslate2 optimized)
- **End-to-End Encryption** - Optional Signal Protocol encryption with three security modes
- **Cross-Platform** - Web (PWA) and iOS native applications with real-time sync
- **Real-time Presence** - Live online status and typing indicators via Socket.io
- **Voice Messages** - Speech-to-text transcription with automatic translation

---

## Architecture

```
                                    ┌─────────────────────────────────────────────────────────────────────────────┐
                                    │                              CLIENTS                                        │
                                    ├─────────────────────────────────────────────────────────────────────────────┤
                                    │                                                                              │
                                    │    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
                                    │    │   Web (Next.js)  │    │   iOS (SwiftUI)  │    │  Android (Soon)  │     │
                                    │    │     :3100        │    │     Native       │    │      Native      │     │
                                    │    │   React 19.2.3   │    │   iOS 16+        │    │                  │     │
                                    │    │   TypeScript     │    │   Combine        │    │                  │     │
                                    │    └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
                                    │             │                       │                       │               │
                                    │             └───────────────────────┼───────────────────────┘               │
                                    │                                     │                                       │
                                    │                    HTTP/REST + WebSocket (Socket.io 4.8.3)                  │
                                    │                                     │                                       │
                                    └─────────────────────────────────────┼───────────────────────────────────────┘
                                                                          │
┌─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┐
│                                                         REVERSE PROXY (Traefik v3.6)                                                                │
│                                                         • Auto SSL (Let's Encrypt)                                                                  │
│                                                         • Load Balancing                                                                            │
│                                                         • Dynamic Routing                                                                           │
└─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┘
                                                                          │
┌─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┐
│                                                                  GATEWAY LAYER                                                                      │
├─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
│                                                                         ▼                                                                           │
│                                              ┌────────────────────────────────────────┐                                                             │
│                                              │      Gateway (Fastify 5.6.2)           │                                                             │
│                                              │               :3000                    │                                                             │
│                                              │   • REST API endpoints                 │                                                             │
│                                              │   • WebSocket handlers (Socket.io)    │                                                             │
│                                              │   • Authentication (JWT + bcrypt)     │                                                             │
│                                              │   • Real-time broadcasting            │                                                             │
│                                              │   • Rate limiting (@fastify/rate-limit)│                                                             │
│                                              │   • File uploads (Sharp processing)   │                                                             │
│                                              │   • Push notifications (Firebase)     │                                                             │
│                                              └───────────────────┬────────────────────┘                                                             │
│                                                                  │                                                                                  │
└──────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┘
                                                                   │
                    ┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
                    │                                              │                                              │
                    ▼                                              ▼                                              ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────────┐  ┌───────────────────────────────────────────────────────────────┐
│       MongoDB 8.0 :27017          │  │         Redis 8-alpine :6379          │  │              Translator (FastAPI 0.115.6)                     │
│       ─────────────────           │  │         ────────────────────          │  │                       :8000                                   │
│   • Users & Profiles              │  │   • Session storage                   │  │   ───────────────────────────────────────                     │
│   • Messages & Threads            │  │   • Real-time cache                   │  │   • Translation (HuggingFace Transformers)                   │
│   • Conversations                 │  │   • Pub/Sub messaging                 │  │   • STT (faster-whisper 1.2.1 - CTranslate2)                 │
│   • Translations cache            │  │   • Rate limit counters               │  │   • TTS (chatterbox-tts 0.1.6 - Apache 2.0)                  │
│   • Attachments metadata          │  │   • Typing indicators                 │  │   • Voice cloning (speaker embedding)                        │
│   • Voice samples                 │  │   • Presence status                   │  │   • Audio processing (librosa, pydub)                        │
│                                   │  │                                       │  │                                                               │
│   Access: Prisma 6.19.1 ORM       │  │   Access: ioredis 5.9.1               │  │   Communication: ZeroMQ 6.5.0 + gRPC 1.69.0                  │
│   Replica Set for transactions    │  │   Cluster-ready                       │  │   Push/Pull + Pub/Sub patterns                               │
└───────────────────────────────────┘  └───────────────────────────────────────┘  └───────────────────────────────────────────────────────────────┘
```

### Communication Flow

```
┌─────────────┐      HTTPS/WSS       ┌─────────────┐      ZeroMQ Push      ┌─────────────┐
│   Client    │ ──────────────────► │   Gateway   │ ──────────────────► │ Translator  │
│  (Web/iOS)  │                      │  (Fastify)  │                      │  (FastAPI)  │
└─────────────┘                      └─────────────┘                      └─────────────┘
       │                                    │                                    │
       │ 1. Send message                    │ 2. Store in MongoDB                │
       │    (REST/WebSocket)                │    (Prisma ORM)                    │
       │                                    │                                    │
       │                                    │ 3. Queue translation task          │
       │                                    │    (ZeroMQ push)                   │
       │                                    │                                    │
       │                                    │ ◄──────────────────────────────────┤
       │                                    │ 4. Receive translation             │
       │                                    │    (ZeroMQ subscribe)              │
       │                                    │                                    │
       │ ◄──────────────────────────────────┤ 5. Broadcast to recipients         │
       │ 6. Real-time update                │    (Socket.io rooms)               │
       │    (WebSocket)                     │                                    │
```

### Data Flow Patterns

| Flow | Protocol | Use Case |
|------|----------|----------|
| **Client → Gateway** | HTTP REST | CRUD operations (messages, users, conversations) |
| **Client ↔ Gateway** | Socket.io (WebSocket) | Real-time messaging, presence, typing indicators |
| **Gateway → Translator** | ZeroMQ Push | Async ML task queuing (translation, STT, TTS) |
| **Translator → Gateway** | ZeroMQ Pub/Sub | Task completion notifications |
| **Gateway ↔ MongoDB** | Prisma ORM | Data persistence with type safety |
| **Gateway ↔ Redis** | ioredis | Session cache, rate limiting, pub/sub |

---

## Technology Stack

### Frontend - `apps/web`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Next.js** | `15.3.5` | App Router with React Server Components (RSC), Server-Side Rendering (SSR), Static Site Generation (SSG), built-in image optimization, and API routes. The leading React framework for production applications with excellent DX and performance. |
| **React** | `19.2.3` | Latest stable with concurrent rendering, Server Components, and Actions API. Provides improved performance and better developer experience over previous versions. |
| **TypeScript** | `5.9.3` | Full type safety across the entire codebase, enhanced IDE support with autocompletion, and compile-time error detection. Essential for large-scale applications. |
| **TailwindCSS** | `3.4.19` | Utility-first CSS framework with JIT (Just-In-Time) compilation for minimal bundle size. Enables rapid prototyping while maintaining a consistent design system. |
| **Socket.io-client** | `4.8.3` | Reliable WebSocket implementation with automatic reconnection, room support for group messaging, binary streaming for voice messages, and fallback to HTTP long-polling. |
| **Zustand** | `5.0.10` | Lightweight state management (2KB gzipped) with minimal boilerplate. Simpler than Redux with excellent TypeScript support, perfect for React 19's concurrent features. |
| **TanStack Query** | `5.90.16` | Server state management with automatic caching, background refetching, and optimistic updates. Handles API data fetching with minimal code. |
| **Radix UI** | `latest` | Unstyled, accessible UI primitives that are WAI-ARIA compliant. Provides solid accessibility foundation while allowing custom styling with Tailwind. |
| **Framer Motion** | `12.26.1` | Production-ready animations with gesture support, layout animations, and exit animations. Provides smooth UX transitions without performance overhead. |
| **Jest** | `30.2.0` | Modern testing framework with native ESM support, fast parallel execution, and excellent React Testing Library integration. |

### Gateway Service - `services/gateway`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Fastify** | `5.6.2` | 2-3x faster than Express.js with built-in JSON schema validation, plugin architecture, and TypeScript-first design. Optimal for high-throughput API servers. |
| **Prisma** | `6.19.1` | Type-safe ORM with auto-generated TypeScript client, visual database browser (Prisma Studio), and MongoDB support. Ensures database queries are type-checked at compile time. |
| **Socket.io** | `4.8.3` | Real-time bidirectional communication with room-based broadcasting for conversations, binary support for voice messages, and automatic client reconnection handling. |
| **MongoDB Driver** | `6.21.0` | Native MongoDB driver for advanced queries, change streams for real-time sync, and transaction support with replica sets. |
| **ioredis** | `5.9.1` | High-performance Redis client with cluster support, Lua scripting for atomic operations, pipelining for batch commands, and built-in reconnection logic. |
| **gRPC** | `1.14.3` | Efficient binary protocol for service-to-service communication using Protocol Buffers. Provides streaming support for audio data transfer. |
| **ZeroMQ** | `6.5.0` | Async messaging patterns (push/pull for load balancing, pub/sub for broadcasting). Handles ML task queuing without blocking the main event loop. |
| **JSON Web Tokens** | `9.0.3` | Stateless authentication with RS256 asymmetric signing support. Enables horizontal scaling without session storage overhead. |
| **bcrypt** | `6.0.0` | Industry-standard password hashing with configurable work factor. Protects user credentials with computationally expensive hashing. |
| **Firebase Admin** | `13.6.0` | Server-side SDK for push notifications to iOS/Android devices. Provides reliable message delivery with topic-based broadcasting. |
| **Sharp** | `0.34.5` | High-performance image processing for avatar resizing, format conversion (WebP), and thumbnail generation. 10x faster than ImageMagick. |
| **Pino** | `9.14.0` | Ultra-fast JSON logger (5x faster than Winston) with low overhead. Essential for high-throughput services requiring structured logging. |

### Translator Service - `services/translator`

| Technology | Version | Justification |
|------------|---------|---------------|
| **FastAPI** | `0.115.6` | Modern async Python framework with automatic OpenAPI documentation, Pydantic validation, and dependency injection. Optimal for ML service APIs. |
| **Uvicorn** | `0.34.0` | ASGI server with HTTP/2 support, optimal for async workloads. Provides excellent performance for CPU-bound ML inference tasks. |
| **faster-whisper** | `1.2.1` | CTranslate2-optimized Whisper model that runs 4x faster than OpenAI's original implementation with 50% less memory usage. Essential for real-time STT. |
| **chatterbox-tts** | `0.1.6` | Apache 2.0 licensed TTS with voice cloning capability. Production-ready for commercial use, supports speaker embedding for voice preservation. |
| **Transformers** | `latest` | HuggingFace NLP models (MBART, M2M100) for neural machine translation. Provides state-of-the-art translation quality across 100+ languages. |
| **PyTorch** | `latest` | ML framework backing all models with CUDA support for GPU acceleration. Enables efficient batch processing for translation tasks. |
| **Pydantic** | `2.10.5` | Data validation with JSON Schema generation, seamlessly integrates with FastAPI for request/response validation. |
| **Prisma (Python)** | `0.15.0` | Same schema as Node.js services ensuring database consistency. Provides type-safe async database access from Python. |
| **gRPC** | `1.69.0` | Binary protocol for communication with gateway service. Streaming support enables efficient audio data transfer. |
| **Librosa** | `0.11.0` | Audio analysis library for feature extraction, resampling, and preprocessing. Essential for voice cloning speaker embedding. |
| **Pytest** | `8.3.4` | Async test support, fixtures, and parametrized testing. Provides comprehensive test coverage for ML service endpoints. |

### Shared Package - `packages/shared`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Prisma** | `6.19.1` | Single source of truth for database schema shared across all services. Ensures type consistency between Gateway and Translator. |
| **Zod** | `3.25.76` | Runtime validation matching TypeScript types with schema inference. Validates API payloads at runtime while maintaining type safety. |
| **TypeScript** | `5.9.3` | Shared type definitions exported to frontend and backend. Eliminates type drift between services. |
| **Signal Protocol** | `0.58.3` | Optional E2E encryption using the same protocol as Signal and WhatsApp. Provides perfect forward secrecy and post-compromise security. |
| **Vitest** | `3.2.4` | Fast unit testing framework with native ESM support, compatible with Jest API. 10x faster than Jest for pure TypeScript packages. |

### Mobile - `apps/ios`

| Technology | Details | Justification |
|------------|---------|---------------|
| **SwiftUI** | iOS 16+ | Modern declarative UI framework with native performance and built-in animations. Provides consistent design language across Apple devices. |
| **Combine** | Native | Reactive data flow and async handling using Apple's official framework. Seamlessly integrates with SwiftUI for state management. |
| **MVVM** | Pattern | Separation of concerns with testable ViewModel layer. Standard architecture pattern for SwiftUI applications. |
| **Socket.io-client** | Swift | Real-time messaging with feature parity to web client. Enables consistent cross-platform communication. |

### Infrastructure

| Technology | Version | Justification |
|------------|---------|---------------|
| **Docker** | `Compose` | Containerization for consistent development and production environments. Enables reproducible deployments across any infrastructure. |
| **Traefik** | `v3.6` | Dynamic reverse proxy with automatic Let's Encrypt SSL certificates, Docker-native service discovery, and load balancing. |
| **MongoDB** | `8.0` | Document database with replica set for ACID transactions, flexible schema for evolving data models, and change streams for real-time sync. |
| **Redis** | `8-alpine` | In-memory data store for session cache, rate limiting counters, and pub/sub messaging. Sub-millisecond latency for real-time features. |
| **Nginx** | `alpine` | Static file serving for user uploads with caching headers and gzip compression. Lightweight container for CDN-like performance. |
| **Node.js** | `22.0+` | LTS version with native ESM modules, built-in fetch API, and improved performance. Required for latest Fastify and Next.js features. |
| **Python** | `3.11+` | Required for ML libraries with async support and type hints. Chatterbox TTS specifically requires Python 3.11. |
| **pnpm** | `9.15.0` | Fast, disk-efficient package manager with strict dependency resolution. 2x faster than npm with 50% less disk usage. |
| **Turborepo** | `2.7.4` | Monorepo build orchestration with remote caching, parallel task execution, and intelligent task scheduling based on file changes. |
| **Playwright** | `1.57.0` | Cross-browser E2E testing with auto-waiting, network interception, and mobile emulation. Provides reliable integration tests. |

---

## Project Structure

```
meeshy/
├── apps/                           # Client applications
│   ├── web/                        # Next.js 15 web application
│   │   ├── app/                    # App Router pages and layouts
│   │   ├── components/             # React components (UI, features)
│   │   ├── lib/                    # Utilities, hooks, helpers
│   │   ├── services/               # API clients, WebSocket handlers
│   │   ├── stores/                 # Zustand state stores
│   │   └── public/                 # Static assets (icons, images)
│   ├── ios/                        # SwiftUI iOS application
│   │   ├── Meeshy/                 # Main app target
│   │   │   ├── Views/              # SwiftUI views
│   │   │   ├── ViewModels/         # MVVM view models
│   │   │   ├── Models/             # Data models
│   │   │   └── Services/           # API and WebSocket services
│   │   └── MeeshyTests/            # Unit tests
│   └── docs/                       # Documentation site
│
├── services/                       # Backend microservices
│   ├── gateway/                    # Fastify API & WebSocket server
│   │   ├── src/
│   │   │   ├── routes/             # API endpoints (REST)
│   │   │   ├── socketio/           # WebSocket event handlers
│   │   │   ├── services/           # Business logic layer
│   │   │   ├── middleware/         # Auth, validation, rate limiting
│   │   │   └── config/             # Environment configuration
│   │   └── __tests__/              # Jest unit & integration tests
│   └── translator/                 # FastAPI ML service
│       ├── src/
│       │   ├── api/                # API routes (FastAPI)
│       │   ├── services/           # Translation, STT, TTS logic
│       │   ├── models/             # ML model loaders & management
│       │   └── workers/            # ZeroMQ task workers
│       └── tests/                  # Pytest unit & integration tests
│
├── packages/                       # Shared libraries
│   └── shared/                     # Cross-service package
│       ├── prisma/                 # Database schema
│       │   └── schema.prisma       # MongoDB models (single source)
│       ├── types/                  # TypeScript definitions
│       ├── utils/                  # Shared utilities
│       └── encryption/             # Signal Protocol implementation
│
├── infrastructure/                 # DevOps configuration
│   ├── docker/
│   │   ├── compose/                # Docker Compose files
│   │   │   ├── docker-compose.dev.yml     # Development with hot reload
│   │   │   ├── docker-compose.local.yml   # Local full stack
│   │   │   └── docker-compose.prod.yml    # Production deployment
│   │   ├── images/                 # Custom Dockerfiles
│   │   │   ├── web/Dockerfile      # Next.js container
│   │   │   ├── gateway/Dockerfile  # Fastify container
│   │   │   └── translator/Dockerfile # FastAPI container
│   │   ├── nginx/                  # Nginx configs (static files)
│   │   └── caddy/                  # Caddy server configs
│   └── envs/                       # Environment templates
│       └── .env.example
│
├── scripts/                        # Build & deployment scripts
│   ├── development/                # Local dev utilities
│   └── production/                 # Production deployment scripts
│
├── tests/                          # E2E tests (Playwright)
│   └── e2e/                        # End-to-end test suites
│
├── package.json                    # Workspace root configuration
├── pnpm-workspace.yaml             # pnpm workspace definition
├── turbo.json                      # Turborepo task configuration
├── Makefile                        # Build automation recipes
└── tsconfig.json                   # TypeScript base configuration
```

---

## Encryption & Security

Meeshy provides **industry-leading encryption** with three modes designed to balance security and functionality. Users can choose the level of protection that fits their needs.

### Encryption Modes

| Mode | Security Level | Translation | Use Case |
|------|----------------|-------------|----------|
| **None** (default) | Standard | Server-side | Public/casual conversations |
| **Server** | High | Server-side | Business conversations requiring translation |
| **Hybrid** | Very High | Server-side | High security with server-assisted translation |
| **E2EE** | Maximum | Edge-only (Coming Soon) | Maximum privacy - no server processing, all ML on-device |

### Mode Details

#### No Encryption (Default)
- Messages stored and transmitted in plaintext
- Full translation support with AI-powered accuracy
- Suitable for public conversations and casual messaging
- **Default for all new conversations**

#### Server-Side Encryption (`server`)
- **Protocol**: AES-256-GCM (Advanced Encryption Standard)
- Messages encrypted at rest and in transit
- Server can decrypt for translation processing
- Keys managed securely in server vault
- **Best for**: Teams needing both security and translation

#### Hybrid Encryption (`hybrid`)
- **Protocol**: Signal Protocol v3 + AES-256-GCM (Double Layer)
- **E2EE Layer**: Client-side Signal Protocol encryption (only sender/recipient can decrypt)
- **Server Layer**: Additional AES-256-GCM encryption for translation
- Messages are double-encrypted for maximum protection
- Translation still works via the server layer
- **Best for**: High-security environments requiring translation

#### End-to-End Encryption (`e2ee`)
- **Protocol**: Signal Protocol v3 (same as WhatsApp, Signal)
- Messages encrypted on sender's device, decrypted only on recipient's device
- **Server CANNOT read messages** - this is by design
- **Edge Translation**: Coming soon - on-device ML for translation without server access
- **Best for**: Maximum privacy where translation is either not needed or fully processed on-device (Edge ML)

### Encryption Technologies

| Component | Technology | Why It's Best-in-Class |
|-----------|------------|------------------------|
| **E2EE Protocol** | Signal Protocol v3 | Used by Signal, WhatsApp, Facebook Messenger. Open-source, audited, quantum-resistant key exchange. |
| **Server Encryption** | AES-256-GCM | NIST-approved, military-grade. 256-bit keys with authenticated encryption. |
| **Key Exchange** | X3DH + Double Ratchet | Perfect forward secrecy. Compromised keys don't expose past messages. |
| **Key Storage** | Secure Vault | Keys never leave the server. Hardware-backed in production. |
| **Transport** | TLS 1.3 | Latest transport security. Zero round-trip handshakes. |

---

## Edge Translation for E2EE (Coming Soon)

> **Status**: Architecture Design Phase | Target: Q4 2026

With E2EE, the server cannot access message content. To enable translation while preserving maximum privacy, Meeshy is developing **Edge Translation** - a complete on-device ML pipeline for real-time translation, transcription, and voice synthesis.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    E2EE EDGE TRANSLATION ARCHITECTURE                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                                         SENDER DEVICE                                                    │    │
│  ├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                                                          │    │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │    │
│  │   │   Voice      │     │  Edge STT    │     │    Edge      │     │  Edge TTS    │     │   Signal     │  │    │
│  │   │   Input      │────►│  (Whisper)   │────►│ Translation  │────►│   (Piper)    │────►│  Protocol    │  │    │
│  │   │              │     │              │     │  (M2M100)    │     │              │     │  Encrypt     │  │    │
│  │   │  🎤 Record   │     │  WebGPU /    │     │  ONNX /      │     │  WASM /      │     │              │  │    │
│  │   │              │     │  CoreML      │     │  WebGPU      │     │  CoreML      │     │  🔐 E2EE     │  │    │
│  │   └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘  │    │
│  │                                                                                               │          │    │
│  │   Input: "Bonjour, comment ça va?"                                                            │          │    │
│  │   STT Output: "Bonjour, comment ça va?" (French detected)                                     │          │    │
│  │   Translation: "Hello, how are you?" (→ English)                                              │          │    │
│  │   TTS Output: audio_en.opus (sender's cloned voice)                                           │          │    │
│  │                                                                                               │          │    │
│  └───────────────────────────────────────────────────────────────────────────────────────────────┼──────────┘    │
│                                                                                                  │               │
│                                              Encrypted Payload:                                  │               │
│                                              • Original text (encrypted)                        │               │
│                                              • Translated text (encrypted)                      │               │
│                                              • Original audio (encrypted)                       │               │
│                                              • Translated audio (encrypted)                     │               │
│                                              • Speaker embedding (encrypted)                    │               │
│                                                                                                  │               │
│                                                         │                                        │               │
│                                                         ▼                                        │               │
│                                    ┌────────────────────────────────────┐                        │               │
│                                    │           MEESHY SERVER            │                        │               │
│                                    │          (Zero Knowledge)          │                        │               │
│                                    │                                    │                        │               │
│                                    │   • Routes encrypted blobs         │                        │               │
│                                    │   • Cannot decrypt content         │                        │               │
│                                    │   • Stores ciphertext only         │                        │               │
│                                    │   • Handles key exchange (X3DH)    │                        │               │
│                                    │   • Push notification triggers     │                        │               │
│                                    │                                    │                        │               │
│                                    └────────────────────────────────────┘                        │               │
│                                                         │                                        │               │
│                                                         ▼                                        │               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                                        RECIPIENT DEVICE                                                  │    │
│  ├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤    │
│  │                                                                                                          │    │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │    │
│  │   │   Signal     │     │   Select     │     │   Display    │     │    Play      │     │   Voice      │  │    │
│  │   │   Protocol   │────►│  Language    │────►│    Text      │────►│   Audio      │────►│   Output     │  │    │
│  │   │   Decrypt    │     │              │     │              │     │              │     │              │  │    │
│  │   │              │     │  Preferred:  │     │  "Hello,     │     │  🔊 Play     │     │  🔈 Speaker  │  │    │
│  │   │  🔓 Decrypt  │     │  English     │     │  how are     │     │  audio_en    │     │              │  │    │
│  │   │              │     │              │     │  you?"       │     │              │     │              │  │    │
│  │   └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘  │    │
│  │                                                                                                          │    │
│  │   ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │    │
│  │   │  FALLBACK: If sender's translation unavailable, recipient can translate locally using Edge ML   │  │    │
│  │   └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │    │
│  │                                                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Edge ML Technology Stack

| Component | Technology | Platform | Size | Justification |
|-----------|------------|----------|------|---------------|
| **Edge STT** | Whisper.cpp (tiny/base) | WASM + WebGPU | 75-150 MB | OpenAI Whisper optimized for edge. 4-bit quantization reduces size while maintaining accuracy. Real-time transcription on modern devices. |
| **Edge Translation** | M2M100-small (ONNX) | WASM + WebGPU | 200-400 MB | Facebook's multilingual model supporting 100 languages. Quantized ONNX for cross-platform inference. |
| **Edge TTS** | Piper TTS | WASM + CoreML | 50-100 MB | Fast, lightweight neural TTS. Apache 2.0 licensed. Supports voice cloning with speaker embeddings. |
| **Voice Cloning** | Speaker Embedding | Pre-computed | 5-10 KB | ECAPA-TDNN embeddings computed once, stored locally. Enables voice preservation without full model. |
| **Runtime** | ONNX Runtime Web | WebGPU | Included | Microsoft's cross-platform ML runtime. Hardware acceleration via WebGPU on browsers, Metal on iOS. |
| **Encryption** | Signal Protocol | Native | 50 KB | libsignal-client compiled to WASM for browsers. Native Swift library for iOS. |

### Real-Time Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              REAL-TIME EDGE PROCESSING PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│   │   CAPTURE   │    │     STT     │    │  TRANSLATE  │    │     TTS     │    │   ENCRYPT   │   │
│   │             │    │             │    │             │    │             │    │             │   │
│   │  Audio In   │───►│  Whisper    │───►│   M2M100    │───►│   Piper     │───►│   Signal    │   │
│   │  PCM 16kHz  │    │  Streaming  │    │   ONNX      │    │   Neural    │    │   X3DH      │   │
│   │             │    │             │    │             │    │             │    │             │   │
│   │  ~50ms      │    │  ~200ms     │    │  ~150ms     │    │  ~100ms     │    │  ~10ms      │   │
│   │  chunks     │    │  latency    │    │  latency    │    │  latency    │    │  latency    │   │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                                                                  │
│   Total End-to-End Latency: ~500ms (real-time capable)                                          │
│                                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                            STREAMING MODE (Voice Messages)                               │   │
│   ├─────────────────────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                                          │   │
│   │   Audio Chunks ──► STT (streaming) ──► Translation (sentence) ──► TTS ──► Encrypt       │   │
│   │        │                  │                     │                    │          │        │   │
│   │        ▼                  ▼                     ▼                    ▼          ▼        │   │
│   │   [chunk 1] ─────► "Bonjour" ──────────► "Hello" ─────────► [audio] ──► [cipher]        │   │
│   │   [chunk 2] ─────► "comment" ──────────► "how" ───────────► [audio] ──► [cipher]        │   │
│   │   [chunk 3] ─────► "ça va?" ───────────► "are you?" ──────► [audio] ──► [cipher]        │   │
│   │                                                                                          │   │
│   │   Progressive delivery: Recipient sees/hears translation as sender speaks               │   │
│   │                                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              BATCH MODE (Text Messages)                                  │   │
│   ├─────────────────────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                                          │   │
│   │   Text Input ──► Language Detect ──► Translation ──► TTS (optional) ──► Encrypt         │   │
│   │        │                │                  │                │                │           │   │
│   │        ▼                ▼                  ▼                ▼                ▼           │   │
│   │   "Salut!"  ────► French (99%) ───► "Hi!" ────────► [audio] ───────► [encrypted]        │   │
│   │                                                                                          │   │
│   │   Latency: ~100ms for text-only, ~250ms with TTS                                        │   │
│   │                                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Platform-Specific Implementation

#### Web (PWA) - WebGPU Acceleration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WEB EDGE ML STACK                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Browser (Chrome 113+, Edge 113+, Firefox 118+)                        │
│   ┌───────────────────────────────────────────────────────────────────┐ │
│   │                                                                    │ │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐             │ │
│   │   │  WebGPU     │   │  ONNX       │   │  WebCodecs  │             │ │
│   │   │  Compute    │   │  Runtime    │   │  Audio API  │             │ │
│   │   │  Shaders    │   │  Web        │   │             │             │ │
│   │   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘             │ │
│   │          │                 │                 │                     │ │
│   │          └─────────────────┼─────────────────┘                     │ │
│   │                            │                                       │ │
│   │                            ▼                                       │ │
│   │   ┌───────────────────────────────────────────────────────────┐   │ │
│   │   │                    Web Workers                             │   │ │
│   │   │   • STT Worker (Whisper WASM + WebGPU)                    │   │ │
│   │   │   • Translation Worker (M2M100 ONNX + WebGPU)             │   │ │
│   │   │   • TTS Worker (Piper WASM)                               │   │ │
│   │   │   • Crypto Worker (Signal Protocol WASM)                  │   │ │
│   │   └───────────────────────────────────────────────────────────┘   │ │
│   │                                                                    │ │
│   │   Model Storage: IndexedDB (cached after first download)          │ │
│   │   Total Cache Size: ~500 MB (all languages)                       │ │
│   │                                                                    │ │
│   └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   Technologies:                                                          │
│   • @aspect-build/aspect-wasm - WASM bundling                           │
│   • onnxruntime-web - ML inference                                      │
│   • @aspect-build/aspect-webgpu - GPU compute                           │
│   • libsignal-protocol-typescript - E2EE                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### iOS (Native) - CoreML + Metal

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         iOS EDGE ML STACK                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   iOS 16+ / iPadOS 16+ (A12 Bionic or later)                            │
│   ┌───────────────────────────────────────────────────────────────────┐ │
│   │                                                                    │ │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐             │ │
│   │   │   CoreML    │   │    Metal    │   │  AVFoundation│            │ │
│   │   │   Models    │   │   Compute   │   │    Audio    │             │ │
│   │   │   (.mlmodel)│   │   Shaders   │   │             │             │ │
│   │   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘             │ │
│   │          │                 │                 │                     │ │
│   │          └─────────────────┼─────────────────┘                     │ │
│   │                            │                                       │ │
│   │                            ▼                                       │ │
│   │   ┌───────────────────────────────────────────────────────────┐   │ │
│   │   │                  Swift Concurrency                         │   │ │
│   │   │   • STT Actor (Whisper CoreML - ANE accelerated)          │   │ │
│   │   │   • Translation Actor (M2M100 CoreML)                     │   │ │
│   │   │   • TTS Actor (Piper CoreML)                              │   │ │
│   │   │   • Crypto Actor (libsignal-client Swift)                 │   │ │
│   │   └───────────────────────────────────────────────────────────┘   │ │
│   │                                                                    │ │
│   │   Model Storage: App Bundle + On-Demand Resources                 │ │
│   │   Base App Size: ~100 MB | With All Languages: ~600 MB           │ │
│   │   ANE (Apple Neural Engine): 15.8 TOPS on A15+                   │ │
│   │                                                                    │ │
│   └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   Frameworks:                                                            │
│   • CoreML - Apple's ML framework                                       │
│   • Metal Performance Shaders - GPU acceleration                        │
│   • Speech Framework - Fallback STT                                     │
│   • AVSpeechSynthesizer - Fallback TTS                                  │
│   • libsignal-client - Signal Foundation's official Swift library       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Voice Cloning in E2EE Mode

Voice cloning with E2EE requires special handling since the server cannot store voice samples:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              E2EE VOICE CLONING ARCHITECTURE                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│   ENROLLMENT PHASE (One-time setup on sender's device)                                          │
│   ─────────────────────────────────────────────────────                                         │
│                                                                                                  │
│   ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│   │   Record    │     │  ECAPA-TDNN     │     │    Speaker      │     │   Encrypted         │   │
│   │   Voice     │────►│  Embedding      │────►│   Embedding     │────►│   Distribution      │   │
│   │   Sample    │     │  Extraction     │     │   (512-dim)     │     │                     │   │
│   │             │     │                 │     │                 │     │   • To contacts     │   │
│   │   30s audio │     │   On-device     │     │   ~2 KB file    │     │   • Via Signal key  │   │
│   │             │     │   processing    │     │                 │     │     exchange        │   │
│   └─────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────────┘   │
│                                                                                                  │
│   RUNTIME PHASE (For each message with voice)                                                   │
│   ──────────────────────────────────────────                                                    │
│                                                                                                  │
│   Sender Device:                                                                                │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                                           │  │
│   │   Input Text ──► Edge TTS (Piper) + Sender's Embedding ──► Cloned Voice ──► Encrypt     │  │
│   │                                                                                           │  │
│   │   The TTS model uses the 512-dim speaker embedding to generate audio                     │  │
│   │   that sounds like the sender's voice.                                                   │  │
│   │                                                                                           │  │
│   └──────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│   Recipient Device:                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                                           │  │
│   │   Option A: Play sender's pre-generated audio (included in encrypted payload)            │  │
│   │                                                                                           │  │
│   │   Option B: Regenerate locally using sender's embedding (if only text received)          │  │
│   │             Decrypt text ──► Edge TTS + Sender's Embedding ──► Cloned Voice              │  │
│   │                                                                                           │  │
│   └──────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                  │
│   SECURITY NOTES:                                                                               │
│   • Voice samples NEVER leave the device                                                        │
│   • Only 512-dim embedding is shared (cannot reconstruct original voice)                        │
│   • Embedding is encrypted with recipient's Signal key                                          │
│   • Server cannot access embeddings or generate voice                                           │
│                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Message Payload Structure (E2EE Mode)

```json
{
  "envelope": {
    "type": "e2ee_message",
    "version": 2,
    "timestamp": 1704067200000,
    "sender_device_id": "device_abc123"
  },
  "signal_header": {
    "registration_id": 12345,
    "pre_key_id": 67890,
    "signed_pre_key_id": 11111,
    "base_key": "base64_encoded_key",
    "identity_key": "base64_encoded_identity"
  },
  "encrypted_payload": "base64_encoded_ciphertext",

  "_decrypted_structure": {
    "content": {
      "original": {
        "text": "Bonjour, comment ça va?",
        "language": "fr",
        "audio": "base64_opus_audio",
        "duration_ms": 2500
      },
      "translations": {
        "en": {
          "text": "Hello, how are you?",
          "audio": "base64_opus_audio",
          "duration_ms": 2200
        },
        "es": {
          "text": "Hola, ¿cómo estás?",
          "audio": "base64_opus_audio",
          "duration_ms": 2400
        }
      }
    },
    "voice_embedding": {
      "model": "ecapa-tdnn-512",
      "vector": [0.123, -0.456, ...],
      "checksum": "sha256_hash"
    },
    "metadata": {
      "client_version": "2.0.0",
      "edge_models": {
        "stt": "whisper-tiny-q4",
        "translation": "m2m100-small-onnx",
        "tts": "piper-en-us-amy"
      }
    }
  }
}
```

### Supported Languages (Edge Models)

| Language | Code | STT | Translation | TTS | Voice Clone |
|----------|------|-----|-------------|-----|-------------|
| English | en | ✅ | ✅ | ✅ | ✅ |
| French | fr | ✅ | ✅ | ✅ | ✅ |
| Spanish | es | ✅ | ✅ | ✅ | ✅ |
| German | de | ✅ | ✅ | ✅ | ✅ |
| Italian | it | ✅ | ✅ | ✅ | ✅ |
| Portuguese | pt | ✅ | ✅ | ✅ | ✅ |
| Chinese | zh | ✅ | ✅ | ✅ | ✅ |
| Japanese | ja | ✅ | ✅ | ✅ | ✅ |
| Korean | ko | ✅ | ✅ | ✅ | Coming |
| Arabic | ar | ✅ | ✅ | ✅ | Coming |
| Russian | ru | ✅ | ✅ | ✅ | Coming |
| Hindi | hi | ✅ | ✅ | Coming | Coming |

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **STT Latency** | < 200ms | Per sentence, streaming mode |
| **Translation Latency** | < 150ms | Per sentence |
| **TTS Latency** | < 100ms | Per sentence |
| **Total E2E Latency** | < 500ms | Voice input → Encrypted output |
| **Model Download** | One-time | ~500 MB for all languages |
| **Memory Usage** | < 512 MB | Peak during inference |
| **Battery Impact** | < 5% | Per hour of active use |
| **Offline Support** | Full | After initial model download |

### Implementation Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| **Phase 1** | Q1 2026 | Edge STT (Whisper.cpp) - Text transcription on-device |
| **Phase 2** | Q2 2026 | Edge Translation (M2M100 ONNX) - Text translation on-device |
| **Phase 3** | Q2 2026 | Edge TTS (Piper) - Voice synthesis on-device |
| **Phase 4** | Q3 2026 | Voice Cloning (ECAPA-TDNN embeddings) - Voice preservation |
| **Phase 5** | Q4 2026 | Full E2EE Integration - Complete pipeline with Signal Protocol |
| **Phase 6** | Q4 2026 | Streaming Mode - Real-time progressive translation |

### Comparison: Server vs Edge Translation

| Aspect | Server-Side | Edge (E2EE) |
|--------|-------------|-------------|
| **Privacy** | Server sees plaintext | Zero-knowledge |
| **Latency** | ~300ms (network) | ~500ms (on-device) |
| **Quality** | Higher (large models) | Good (optimized models) |
| **Offline** | ❌ Requires internet | ✅ Fully offline |
| **Battery** | Low (server compute) | Higher (local compute) |
| **Storage** | None | ~500 MB models |
| **Voice Clone** | Full quality | Embedding-based |
| **Languages** | 100+ | 12 (initial release) |

---

## Getting Started

### Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| Node.js | `>=22.0.0` | [nodejs.org](https://nodejs.org/) or `nvm install 22` |
| pnpm | `>=9.0.0` | `npm install -g pnpm` |
| Python | `3.11.x` | [python.org](https://python.org/) or `pyenv install 3.11.13` |
| Docker | `latest` | [docker.com](https://docker.com/get-started) |

### Quick Start

```bash
# Clone repository
git clone https://github.com/isopen-io/meeshy.git
cd meeshy

# Install dependencies (Prisma client auto-generated via postinstall)
pnpm install

# Start infrastructure (MongoDB, Redis)
pnpm docker:up

# Start all services in development mode
pnpm dev
```

### Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3100 | Next.js web application |
| Gateway API | http://localhost:3000 | REST API & WebSocket |
| Translator | http://localhost:8000 | ML translation service |
| MongoDB | mongodb://localhost:27017 | Database |
| Redis | redis://localhost:6379 | Cache & sessions |

---

## Development Commands

```bash
# ─────────────────────────────────────────────────────────────
# DEVELOPMENT
# ─────────────────────────────────────────────────────────────
pnpm dev                    # Start all services (Turborepo)
pnpm dev:web                # Start frontend only
pnpm dev:gateway            # Start gateway only
pnpm dev:translator         # Start translator only
pnpm start                  # Start all services in production mode

# ─────────────────────────────────────────────────────────────
# BUILD
# ─────────────────────────────────────────────────────────────
pnpm build                  # Build all packages
pnpm build:web              # Build frontend
pnpm build:gateway          # Build gateway
pnpm build:translator       # Build translator

# ─────────────────────────────────────────────────────────────
# TESTING
# ─────────────────────────────────────────────────────────────
pnpm test                   # Run all tests
pnpm test:web               # Frontend tests (Jest)
pnpm test:gateway           # Gateway tests (Jest)
pnpm test:translator        # Translator tests (Pytest)
pnpm test:coverage          # With coverage reports

# ─────────────────────────────────────────────────────────────
# CODE QUALITY
# ─────────────────────────────────────────────────────────────
pnpm lint                   # ESLint all packages
pnpm type-check             # TypeScript validation

# ─────────────────────────────────────────────────────────────
# DOCKER
# ─────────────────────────────────────────────────────────────
pnpm docker:up              # Start infrastructure
pnpm docker:down            # Stop all containers
pnpm docker:logs            # View container logs
pnpm docker:build           # Build custom images
pnpm docker:dev             # Start dev infrastructure
```

---

## Testing Strategy

| Level | Framework | Scope | Location |
|-------|-----------|-------|----------|
| **Unit** | Jest 30.2.0 / Pytest 8.3.4 | Functions, utilities, services | `services/*/tests/`, `apps/web/__tests__/` |
| **Integration** | Jest / Pytest | API endpoints, middleware | `services/*/__tests__/integration/` |
| **E2E** | Playwright 1.57.0 | User workflows | `tests/e2e/` |
| **Component** | React Testing Library | UI components | `apps/web/__tests__/components/` |

---

## Deployment

### Docker Images

```bash
# Build all images
pnpm docker:build

# Images produced:
# - isopen/meeshy-web:latest         (Next.js on Node.js 22)
# - isopen/meeshy-gateway:latest     (Fastify on Node.js 22)
# - isopen/meeshy-translator:latest  (FastAPI on Python 3.11)
```

### Production Compose

```bash
docker compose -f infrastructure/docker/compose/docker-compose.prod.yml up -d
```

### Production URLs (*.meeshy.me)

| Service | Domain | Port |
|---------|--------|------|
| Frontend | meeshy.me | 443 |
| Gateway API | gate.meeshy.me | 443 |
| Translator | ml.meeshy.me | 443 |
| Static Files | static.meeshy.me | 443 |
| MongoDB UI | mongo.meeshy.me | 443 |
| Redis UI | redis.meeshy.me | 443 |
| Traefik | traefik.meeshy.me | 443 |

---

## Version Summary

| Component | Technology | Version |
|-----------|------------|---------|
| **Frontend** | Next.js | 15.3.5 |
| | React | 19.2.3 |
| | TypeScript | 5.9.3 |
| | TailwindCSS | 3.4.19 |
| | Zustand | 5.0.10 |
| | TanStack Query | 5.90.16 |
| | Socket.io-client | 4.8.3 |
| | Framer Motion | 12.26.1 |
| **Gateway** | Fastify | 5.6.2 |
| | Prisma | 6.19.1 |
| | Socket.io | 4.8.3 |
| | ioredis | 5.9.1 |
| | ZeroMQ | 6.5.0 |
| | gRPC | 1.14.3 |
| | Firebase Admin | 13.6.0 |
| **Translator** | FastAPI | 0.115.6 |
| | Uvicorn | 0.34.0 |
| | faster-whisper | 1.2.1 |
| | chatterbox-tts | 0.1.6 |
| | gRPC | 1.69.0 |
| | Prisma (Python) | 0.15.0 |
| **Database** | MongoDB | 8.0 |
| **Cache** | Redis | 8-alpine |
| **Proxy** | Traefik | v3.6 |
| **Runtime** | Node.js | 22.0+ |
| | Python | 3.11+ |
| **Build** | pnpm | 9.15.0 |
| | Turborepo | 2.7.4 |
| **Testing** | Jest | 30.2.0 |
| | Vitest | 3.2.4 |
| | Pytest | 8.3.4 |
| | Playwright | 1.57.0 |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with modern technologies for real-time multilingual communication.
</p>
