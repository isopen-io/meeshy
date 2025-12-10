# Meeshy

Real-time multilingual messaging platform with AI-powered translation.

## Monorepo Structure

```
meeshy/
├── apps/                    # User-facing applications
│   ├── web/                 # Next.js web application
│   ├── ios/                 # iOS native app (future)
│   ├── android/             # Android native app (future)
│   └── docs/                # Documentation
│
├── services/                # Backend microservices
│   ├── gateway/             # Fastify API & WebSocket gateway
│   └── translator/          # Python ML translation service
│
├── packages/                # Shared libraries
│   └── shared/              # TypeScript types, Prisma schema, utilities
│
├── infrastructure/          # Infrastructure configuration
│   ├── docker/              # Docker configs (nginx, supervisor)
│   ├── kubernetes/          # K8s manifests (future)
│   └── terraform/           # IaC (future)
│
├── scripts/                 # Build & deploy scripts
│
├── docker-compose.yml       # Local development
├── package.json             # Root workspace config
├── pnpm-workspace.yaml      # PNPM workspace
└── turbo.json               # Turborepo config
```

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker & Docker Compose
- Python 3.12+ (for translator service)

### Installation

```bash
# Clone the repository
git clone https://github.com/isopen-io/meeshy.git
cd meeshy

# Install dependencies
pnpm install

# Start development services
pnpm docker:up

# Start development (all services)
pnpm dev
```

### Development Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:web          # Start web app only
pnpm dev:gateway      # Start gateway only
pnpm dev:translator   # Start translator only

# Build
pnpm build            # Build all packages
pnpm build:web        # Build web app
pnpm build:gateway    # Build gateway

# Test
pnpm test             # Run all tests
pnpm test:web         # Test web app
pnpm test:gateway     # Test gateway

# Quality
pnpm lint             # Lint all packages
pnpm type-check       # Type check all packages

# Docker
pnpm docker:up        # Start Docker services
pnpm docker:down      # Stop Docker services
pnpm docker:logs      # View logs
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3100 | Next.js web application |
| Gateway | 3000 | Fastify API & WebSocket |
| Translator | 8000 | FastAPI ML translation |
| MongoDB | 27017 | Database |
| Redis | 6379 | Cache & sessions |

## Tech Stack

### Frontend (apps/web)
- Next.js 15
- React 19
- TailwindCSS
- Socket.io Client
- Zustand

### Gateway (services/gateway)
- Fastify 5
- Socket.io
- Prisma
- gRPC/ZeroMQ

### Translator (services/translator)
- FastAPI
- PyTorch
- Transformers (HuggingFace)
- gRPC/ZeroMQ

### Shared (packages/shared)
- TypeScript types
- Prisma schema
- Utilities

## CI/CD

GitHub Actions workflows:
- **CI**: Lint, type-check, test on every push/PR
- **Docker**: Build & push images on main/dev
- **Release**: Automated version bump & GitHub release

## License

MIT
