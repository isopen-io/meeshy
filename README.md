# Meeshy

> Real-time multilingual messaging platform with AI-powered translation and voice cloning capabilities.

[![Node.js](https://img.shields.io/badge/Node.js-22.0+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.3.3-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Platform Overview

Meeshy is a production-ready messaging platform that enables seamless cross-language communication. Users can send messages in their native language, and recipients receive them translated with optional AI-generated voice that preserves the sender's vocal characteristics.

### Key Features

- **Real-time Translation** - Instant message translation across 8+ languages
- **Voice Cloning** - AI-generated audio that mimics the sender's voice
- **End-to-End Encryption** - Optional Signal Protocol encryption
- **Cross-Platform** - Web (PWA) and iOS native applications
- **Real-time Presence** - Live online status and typing indicators
- **Voice Messages** - Speech-to-text transcription with translation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│    │   Web (Next.js)  │    │   iOS (SwiftUI)  │    │  Android (Soon)  │     │
│    │     :3100        │    │     Native       │    │      Native      │     │
│    └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
│             │                       │                       │                │
│             └───────────────────────┼───────────────────────┘                │
│                                     │                                        │
│                          HTTP/REST + WebSocket (Socket.io)                   │
│                                     │                                        │
└─────────────────────────────────────┼────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼────────────────────────────────────────┐
│                              GATEWAY LAYER                                   │
├─────────────────────────────────────┼────────────────────────────────────────┤
│                                     ▼                                        │
│                    ┌────────────────────────────────┐                        │
│                    │     Gateway (Fastify 5.6.1)    │                        │
│                    │            :3000               │                        │
│                    │   • REST API endpoints         │                        │
│                    │   • WebSocket handlers         │                        │
│                    │   • Authentication (JWT)       │                        │
│                    │   • Real-time broadcasting     │                        │
│                    └───────────────┬────────────────┘                        │
│                                    │                                         │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
┌─────────────────────┐  ┌───────────────────┐  ┌─────────────────────────────┐
│   MongoDB :27017    │  │   Redis :6379     │  │  Translator (FastAPI)       │
│   ─────────────     │  │   ───────────     │  │         :8000               │
│   • Users           │  │   • Sessions      │  │   ─────────────────────     │
│   • Messages        │  │   • Cache         │  │   • Translation (HuggingFace│
│   • Conversations   │  │   • Pub/Sub       │  │   • STT (faster-whisper)    │
│   • Translations    │  │   • Rate limiting │  │   • TTS (chatterbox-tts)    │
│   • Attachments     │  │                   │  │   • Voice cloning           │
└─────────────────────┘  └───────────────────┘  └─────────────────────────────┘
                                                           ▲
                                                           │
                                                    ZeroMQ + gRPC
                                                    (tcp://:5555, :5558)
```

### Communication Flow

1. **Client → Gateway**: HTTP REST for CRUD operations, Socket.io for real-time
2. **Gateway → Translator**: ZeroMQ push/subscribe pattern for async ML tasks
3. **Gateway → MongoDB**: Prisma ORM for data persistence
4. **Gateway → Redis**: Session storage, caching, and pub/sub

---

## Technology Stack

### Frontend - `apps/web`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Next.js** | `15.3.5` | App Router with RSC, SSR/SSG, optimized image handling, built-in API routes. Best-in-class React framework for production. |
| **React** | `19.2.3` | Concurrent rendering, Server Components, Actions API. Latest stable with improved performance. |
| **TypeScript** | `5.9.3` | Full type safety, enhanced IDE support, catch errors at compile time. |
| **TailwindCSS** | `3.4.19` | Utility-first CSS with JIT compilation. Rapid prototyping, consistent design system. |
| **Socket.io-client** | `4.8.3` | Reliable WebSocket with automatic reconnection, room support, binary streaming. |
| **Zustand** | `5.0.10` | Lightweight state management (2KB). Simpler than Redux, perfect for React 19. |
| **Radix UI** | `latest` | Unstyled, accessible primitives. WAI-ARIA compliant components. |
| **Framer Motion** | `12.26.1` | Production-ready animations with gesture support. |
| **Jest** | `30.2.0` | Modern testing with native ESM support, fast execution. |

### Gateway Service - `services/gateway`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Fastify** | `5.6.2` | 2-3x faster than Express. Built-in schema validation, plugin architecture, TypeScript-first. |
| **Prisma** | `6.19.1` | Type-safe ORM with auto-generated client. MongoDB support, migrations, query optimization. |
| **Socket.io** | `4.8.3` | Real-time bidirectional communication. Room-based broadcasting, binary support. |
| **MongoDB Driver** | `6.21.0` | Native driver for advanced queries, change streams, transactions. |
| **ioredis** | `5.9.1` | High-performance Redis client with cluster support, Lua scripting, pipelining. |
| **gRPC** | `1.14.3` | Efficient binary protocol for service-to-service. Protocol Buffers, streaming. |
| **ZeroMQ** | `6.5.0` | Async messaging patterns (push/pull, pub/sub). Handles ML task queuing. |
| **JSON Web Tokens** | `9.0.3` | Stateless authentication, RS256 signing support. |
| **bcrypt** | `6.0.0` | Industry-standard password hashing with configurable work factor. |
| **Firebase Admin** | `13.6.0` | Push notifications to iOS/Android devices. |
| **Sharp** | `0.34.5` | High-performance image processing (resize, format conversion). |

### Translator Service - `services/translator`

| Technology | Version | Justification |
|------------|---------|---------------|
| **FastAPI** | `0.115.6` | Async Python framework with auto OpenAPI docs. Best for ML services. |
| **Uvicorn** | `0.34.0` | ASGI server with HTTP/2, optimal for async workloads. |
| **faster-whisper** | `1.2.1` | CTranslate2-optimized Whisper. 4x faster than original, lower memory. |
| **chatterbox-tts** | `0.1.6` | Apache 2.0 licensed TTS with voice cloning. Production-ready. |
| **Transformers** | `latest` | HuggingFace NLP models for translation, MBART, M2M100. |
| **PyTorch** | `latest` | ML framework backing all models. CUDA support for GPU acceleration. |
| **Pydantic** | `2.10.5` | Data validation with JSON Schema generation. FastAPI integration. |
| **Prisma (Python)** | `0.15.0` | Same schema as Node.js services. Type-safe async database access. |
| **gRPC** | `1.69.0` | Service communication with gateway. Streaming for audio. |
| **Librosa** | `0.11.0` | Audio analysis, feature extraction, preprocessing. |
| **Pytest** | `8.3.4` | Async test support, fixtures, parametrized testing. |

### Shared Package - `packages/shared`

| Technology | Version | Justification |
|------------|---------|---------------|
| **Prisma** | `6.19.1` | Single source of truth for database schema. Shared across services. |
| **Zod** | `3.25.76` | Runtime validation matching TypeScript types. Schema inference. |
| **TypeScript** | `5.9.3` | Shared type definitions across frontend and backend. |
| **Signal Protocol** | `0.58.3` | Optional E2E encryption. Industry-standard secure messaging. |

### Mobile - `apps/ios`

| Technology | Details | Justification |
|------------|---------|---------------|
| **SwiftUI** | iOS 16+ | Modern declarative UI framework. Native performance, animations. |
| **Combine** | Native | Reactive data flow, async handling. Apple's official solution. |
| **MVVM** | Pattern | Separation of concerns, testable architecture. |
| **Socket.io-client** | Swift | Real-time messaging, parity with web client. |

### Infrastructure

| Technology | Version | Justification |
|------------|---------|---------------|
| **Docker** | `latest` | Containerization for consistent environments. |
| **MongoDB** | `8.0` | Document database with replica set for transactions. Flexible schema. |
| **Redis** | `8-alpine` | In-memory cache, session store, pub/sub. Sub-millisecond latency. |
| **Traefik** | `3.x` | Dynamic reverse proxy with auto SSL. Docker-native. |
| **Node.js** | `22.0+` | LTS with native ESM, fetch API, improved performance. |
| **Python** | `3.11+` | Required for ML libraries. Async support, type hints. |
| **pnpm** | `9.15.0` | Fast, disk-efficient package manager. Strict dependency resolution. |
| **Turborepo** | `2.7.4` | Monorepo build orchestration. Remote caching, parallel execution. |

---

## Encryption & Security

Meeshy provides **industry-leading encryption** with three modes designed to balance security and functionality. Users can choose the level of protection that fits their needs.

### Encryption Modes

| Mode | Security Level | Translation | Use Case |
|------|----------------|-------------|----------|
| **None** (default) | Standard | ✅ Full support | Public/casual conversations |
| **Server** | High | ✅ Full support | Business conversations requiring translation |
| **Hybrid** | Very High | ✅ Full support | High security with translation capability |
| **E2EE** | Maximum | ❌ Not available | Maximum privacy, no server access |

### Mode Details

#### 🔓 No Encryption (Default)
- Messages stored and transmitted in plaintext
- Full translation support with AI-powered accuracy
- Suitable for public conversations and casual messaging
- **Default for all new conversations**

#### 🔐 Server-Side Encryption (`server`)
- **Protocol**: AES-256-GCM (Advanced Encryption Standard)
- Messages encrypted at rest and in transit
- Server can decrypt for translation processing
- Keys managed securely in server vault
- **Best for**: Teams needing both security and translation

#### 🔐🔒 Hybrid Encryption (`hybrid`)
- **Protocol**: Signal Protocol v3 + AES-256-GCM (Double Layer)
- **E2EE Layer**: Client-side Signal Protocol encryption (only sender/recipient can decrypt)
- **Server Layer**: Additional AES-256-GCM encryption for translation
- Messages are double-encrypted for maximum protection
- Translation still works via the server layer
- **Best for**: High-security environments requiring translation

#### 🔒 End-to-End Encryption (`e2ee`)
- **Protocol**: Signal Protocol v3 (same as WhatsApp, Signal)
- Messages encrypted on sender's device, decrypted only on recipient's device
- **Server CANNOT read messages** - this is by design
- ⚠️ **Translation NOT available** - the server cannot translate what it cannot read
- **Best for**: Maximum privacy where translation is not needed

### Why E2EE Blocks Translation

With true end-to-end encryption, **the server never sees the plaintext message**. This is the fundamental security guarantee of E2EE:

```
┌──────────┐                      ┌──────────┐
│  Sender  │ ──── Encrypted ────► │  Server  │ ──── Encrypted ────► │ Recipient │
│ (encrypts)│      (ciphertext)   │(can't read)│    (ciphertext)     │ (decrypts) │
└──────────┘                      └──────────┘                      └──────────┘
```

- The server only sees encrypted ciphertext
- Without the decryption key, translation is impossible
- **This is a feature, not a bug** - it ensures true privacy

For users who need both encryption AND translation, we offer **Hybrid mode** which provides strong protection while maintaining translation capability.

### Permission Model

| Conversation Type | Who Can Enable Encryption |
|-------------------|---------------------------|
| **Direct (1:1)** | Any participant |
| **Group** | Moderators, Admins, or Owners only |

⚠️ **Encryption is immutable** - once enabled, it cannot be disabled. This prevents downgrade attacks.

### Encryption Technologies

| Component | Technology | Why It's Best-in-Class |
|-----------|------------|------------------------|
| **E2EE Protocol** | Signal Protocol v3 | Used by Signal, WhatsApp, Facebook Messenger. Open-source, audited, quantum-resistant key exchange. |
| **Server Encryption** | AES-256-GCM | NIST-approved, military-grade. 256-bit keys with authenticated encryption. |
| **Key Exchange** | X3DH + Double Ratchet | Perfect forward secrecy. Compromised keys don't expose past messages. |
| **Key Storage** | Secure Vault | Keys never leave the server. Hardware-backed in production. |
| **Transport** | TLS 1.3 | Latest transport security. Zero round-trip handshakes. |

### Security Features

- **Perfect Forward Secrecy**: Each message uses a unique key. Compromising one key doesn't expose other messages.
- **Post-Compromise Security**: After a key compromise, security is automatically restored after a few messages.
- **Deniable Authentication**: Messages can't be cryptographically proven to come from a specific sender (protects against coercion).
- **Key Verification**: Users can verify each other's identity keys to prevent MITM attacks.

---

## Project Structure

```
meeshy/
├── apps/                           # Client applications
│   ├── web/                        # Next.js 15 web application
│   │   ├── app/                    # App Router pages
│   │   ├── components/             # React components
│   │   ├── lib/                    # Utilities, hooks
│   │   ├── services/               # API clients
│   │   ├── stores/                 # Zustand state stores
│   │   └── public/                 # Static assets
│   ├── ios/                        # SwiftUI iOS application
│   │   ├── Meeshy/                 # Main app target
│   │   └── MeeshyTests/            # Unit tests
│   └── docs/                       # Documentation site
│
├── services/                       # Backend microservices
│   ├── gateway/                    # Fastify API & WebSocket
│   │   ├── src/
│   │   │   ├── routes/             # API endpoints
│   │   │   ├── socketio/           # WebSocket handlers
│   │   │   ├── services/           # Business logic
│   │   │   ├── middleware/         # Auth, validation
│   │   │   └── config/             # Environment config
│   │   └── __tests__/              # Jest tests
│   └── translator/                 # FastAPI ML service
│       ├── src/
│       │   ├── api/                # API routes
│       │   ├── services/           # Translation, STT, TTS
│       │   └── models/             # ML model management
│       └── tests/                  # Pytest tests
│
├── packages/                       # Shared libraries
│   └── shared/                     # Cross-service package
│       ├── prisma/                 # Database schema
│       │   └── schema.prisma       # MongoDB models
│       ├── types/                  # TypeScript definitions
│       ├── utils/                  # Shared utilities
│       └── encryption/             # Signal Protocol
│
├── infrastructure/                 # DevOps configuration
│   ├── docker/
│   │   ├── compose/                # Docker Compose files
│   │   │   ├── docker-compose.dev.yml
│   │   │   ├── docker-compose.local.yml
│   │   │   └── docker-compose.prod.yml
│   │   ├── images/                 # Custom Dockerfiles
│   │   ├── nginx/                  # Reverse proxy configs
│   │   ├── caddy/                  # Caddy server configs
│   │   └── scripts/                # Docker helper scripts
│   └── envs/                       # Environment files
│       └── .env.example
│
├── scripts/                        # Build & deployment
│   └── development/                # Local dev scripts
│
├── package.json                    # Workspace root
├── pnpm-workspace.yaml             # pnpm configuration
├── turbo.json                      # Turborepo tasks
├── Makefile                        # Build recipes
└── tsconfig.json                   # TypeScript base
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| Node.js | `≥22.0.0` | [nodejs.org](https://nodejs.org/) or `nvm install 22` |
| pnpm | `≥9.0.0` | `npm install -g pnpm` |
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
| MongoDB UI | http://localhost:3001 | NoSQL client |
| Redis UI | http://localhost:7843 | Redis browser |

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
pnpm docker:up              # Start infrastructure (docker-compose.yml)
pnpm docker:down            # Stop all containers
pnpm docker:logs            # View container logs
pnpm docker:build           # Build custom images
pnpm docker:dev             # Start dev infrastructure (docker-compose.dev.yml)
```

> **Note**: Prisma client is auto-generated via `postinstall`. For manual database operations, use the scripts in the `packages/shared` directory.

---

## Testing Strategy

| Level | Framework | Scope | Location |
|-------|-----------|-------|----------|
| **Unit** | Jest / Pytest | Functions, utilities, services | `apps/web/__tests__/`, `services/gateway/__tests__/` |
| **Integration** | Jest / Pytest | API endpoints, middleware | `apps/web/__tests__/integration/` |
| **E2E** | Playwright | User workflows | `tests/e2e/` (root) |
| **Component** | React Testing Library | UI components | `apps/web/__tests__/components/` |

### Running Tests

```bash
# All tests with coverage
pnpm test:coverage

# Specific service
pnpm test:web
pnpm test:gateway
pnpm test:translator
```

---

## Environment Configuration

Copy the example environment file and configure:

```bash
cp infrastructure/envs/.env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MongoDB connection | `mongodb://localhost:27017/meeshy?replicaSet=rs0` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | Token signing key | `your-secure-secret-key` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:3100` |
| `TRANSLATOR_URL` | ML service URL | `http://localhost:8000` |

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

### CI/CD

GitHub Actions workflows:
- **CI**: Lint, type-check, test on every push/PR
- **Docker**: Build & push images on main/dev branches
- **Release**: Automated versioning and GitHub releases

---

## Version Summary

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend | Next.js | 15.3.5 |
| Frontend | React | 19.2.3 |
| Gateway | Fastify | 5.6.2 |
| Gateway | Prisma | 6.19.1 |
| Translator | FastAPI | 0.115.x |
| Translator | faster-whisper | 1.x |
| Database | MongoDB | 8.0 |
| Cache | Redis | 8-alpine |
| Runtime | Node.js | 22.0+ |
| Runtime | Python | 3.11+ |
| Package Manager | pnpm | 9.15.0 |
| Build System | Turborepo | 2.7.4 |

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
