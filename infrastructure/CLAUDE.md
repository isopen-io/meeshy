# infrastructure - Docker, Traefik & Deployment

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

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

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : secrets hors dépôt et surface exposée minimale (sécurité), healthchecks et temps de démarrage (performance), limites mémoire des containers, observabilité (Sentry, métriques) qui permet de MESURER les autres dimensions, reproductibilité dev / local / prod (compatibilité, maintenabilité).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
