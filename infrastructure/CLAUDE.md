# infrastructure - Docker, Traefik & Deployment

## Directory Structure
```
config/             → Traefik, TLS configs
docker/
  compose/          → docker-compose files (symlinked from root)
envs/               → Environment variable files
scripts/            → Deployment & migration scripts
services/           → Service-specific Docker configs
```

## Docker Environments

| Environment | Compose File | SSL | Hosts |
|-------------|-------------|-----|-------|
| dev | docker-compose.dev.yml | HTTP | localhost:3100/3000/8000 |
| local | docker-compose.local.yml | mkcert | *.meeshy.local |
| staging | docker-compose.staging.yml | Let's Encrypt | staging.meeshy.me |
| prod | docker-compose.prod.yml | Let's Encrypt | meeshy.me |

## Docker Services
| Service | Image | Port | Runtime |
|---------|-------|------|---------|
| web (frontend) | node:22-alpine | 3100 | Next.js standalone |
| gateway | node:22-alpine → node:22-slim | 3000 | Fastify |
| translator | python:3.11-slim | 8000 | FastAPI + PyTorch |
| database | mongo:8.0 | 27017 | MongoDB + replica set |
| redis | redis:8-alpine | 6379 | Append-only |
| traefik | traefik:v3.6 | 80/443 | Reverse proxy |

## Critical Rules

### Environment Variables - NO QUOTES
```yaml
# CORRECT
environment:
  NEXT_PUBLIC_API_URL=https://gate.meeshy.me

# WRONG - quotes become part of value, breaks JS at runtime
environment:
  NEXT_PUBLIC_API_URL="https://gate.meeshy.me"
```
The `docker-entrypoint.sh` uses `sed` to replace `__RUNTIME_*__` placeholders. Quoted values cause `""value""` in JS = syntax error.

### Production vs Repo Differences
| | Repo | Production |
|---|---|---|
| Container name | meeshy-web | meeshy-frontend |
| Image name | isopen/meeshy-web | isopen/meeshy-frontend |
| Compose file | docker-compose.prod.yml | /opt/meeshy/production/docker-compose.yml |

Always backup docker-compose.yml before editing on production.

## Traefik Configuration
- **Local**: mkcert certs in `/certs/`, dashboard at `traefik.meeshy.local`
- **Production**: Let's Encrypt ACME TLS challenge, dashboard at `traefik.meeshy.me`
- Routes defined via Docker labels on services
- Middlewares: secure-headers, cors, basic auth (dashboard)
- Healthcheck takes ~30s (start_period + first check) before routing traffic

## MongoDB Setup
- Version 8.0 with replica set (`rs0`)
- Init via `mongo-init` one-shot service
- Connection: `mongodb://database:27017/meeshy?replicaSet=rs0`
- Volumes: `database_data`, `database_config`

## Key Environment Variables
```env
# Database
DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=<change-in-production>
ATTACHMENT_MASTER_KEY=<base64-32-bytes>

# Services
ZMQ_PUSH_URL=tcp://translator:5555
ZMQ_SUB_URL=tcp://translator:5558
TRANSLATOR_URL=http://translator:8000

# Frontend (no quotes!)
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3100

# ML
TTS_MAX_NEW_TOKENS=2048
HF_TOKEN=<huggingface-token>
HF_HOME=/workspace/models/huggingface
```

## Deployment Commands
```bash
# Restart frontend only
docker compose up -d frontend

# Full rebuild
docker compose up -d --build

# View logs
docker compose logs -f gateway

# Production (SSH to meeshy.me)
ssh root@meeshy.me
cd /opt/meeshy/production
docker compose up -d frontend
```

## CI/CD (GitHub Actions)
- **ci.yml**: Lint, type-check, tests (JS + Python) on push/PR
- **docker.yml**: Multi-arch Docker builds, push to Docker Hub (`isopen/meeshy-*`)
- Change detection: only rebuilds modified services
- Turborepo caching for faster builds

## Makefile Targets
```bash
make setup              # Full setup (certs + DNS + install + build)
make dev-web            # Run Next.js dev
make dev-gateway        # Run Fastify dev
make dev-translator     # Run FastAPI dev
make docker-infra       # Start MongoDB + Redis + Traefik
make docker-start       # Full Docker Compose (dev)
make docker-start-local # Docker with HTTPS (local)
make test               # Run all tests
```
