# Meeshy Monorepo - Architecture Reorganization Plan

## Executive Summary

Ce document décrit la réorganisation complète du monorepo Meeshy pour:
1. Séparer clairement le code source de l'infrastructure
2. Supporter le développement natif (bun/pnpm) sans Docker
3. Permettre le développement local avec/sans services externes
4. Unifier les docker-compose avec support HTTPS local (mkcert)
5. Maintenir la compatibilité CI/CD

---

## 1. Structure Actuelle (Problèmes)

```
meeshy/                           # PROBLÈMES IDENTIFIÉS
├── docker-compose.yml            # ❌ 5 compose files à la racine
├── docker-compose.dev.yml        # ❌ Difficile de savoir lequel utiliser
├── docker-compose.local.yml      # ❌ Redondance significative
├── docker-compose.monorepo.yml
├── docker-compose.traefik.yml
├── Caddyfile                     # ❌ Config mixte à la racine
├── Makefile                      # ❌ Orienté Docker uniquement
│
├── apps/web/
│   ├── Dockerfile                # ❌ 3 variantes Dockerfile
│   ├── Dockerfile.monorepo
│   └── Dockerfile.optimized
│
├── services/gateway/
│   ├── Dockerfile                # ❌ 3 variantes
│   ├── Dockerfile.mongodb
│   └── Dockerfile.monorepo
│
├── services/translator/
│   ├── Dockerfile                # ❌ Symlink confus
│   └── Dockerfile.mongodb
│
├── infrastructure/
│   ├── docker/                   # ❌ Incomplet
│   ├── env.example
│   └── env.production
│
├── scripts/                      # ❌ 98 scripts, 23K+ lignes
│   ├── meeshy.sh                 #    Beaucoup de redondance
│   ├── deployment/               #    Difficile à maintenir
│   ├── development/
│   └── production/
│
└── config/
    └── production.env            # ❌ Éparpillé avec infrastructure/
```

---

## 2. Structure Cible (Native-First)

```
meeshy/
├── apps/                         # ✅ CODE SOURCE PUR
│   ├── web/                      #    Aucun fichier Docker
│   │   ├── src/
│   │   ├── package.json
│   │   └── next.config.js
│   └── docs/
│
├── services/                     # ✅ CODE SOURCE PUR
│   ├── gateway/
│   │   ├── src/
│   │   └── package.json
│   └── translator/
│       ├── src/
│       └── requirements.txt
│
├── packages/                     # ✅ LIBRAIRIES PARTAGÉES
│   └── shared/
│
├── scripts/                      # ✅ SCRIPTS DEV LOCAL (SIMPLIFIÉS)
│   ├── dev.sh                    #    Script principal unifié
│   ├── lib/                      #    Fonctions communes
│   │   ├── colors.sh
│   │   ├── ports.sh
│   │   ├── services.sh
│   │   └── certificates.sh
│   └── legacy/                   #    Anciens scripts (temporaire)
│
├── infrastructure/               # ✅ TOUT LE DEPLOYMENT
│   ├── docker/
│   │   ├── compose/
│   │   │   ├── docker-compose.yml        # Base
│   │   │   ├── docker-compose.dev.yml    # Override dev
│   │   │   ├── docker-compose.prod.yml   # Override prod
│   │   │   └── docker-compose.local.yml  # Infra only
│   │   ├── images/
│   │   │   ├── web/
│   │   │   │   └── Dockerfile
│   │   │   ├── gateway/
│   │   │   │   └── Dockerfile
│   │   │   └── translator/
│   │   │       └── Dockerfile
│   │   ├── nginx/
│   │   └── scripts/
│   ├── k8s/                      #    Kubernetes (futur)
│   └── envs/
│       ├── .env.example
│       ├── .env.development
│       └── .env.production
│
├── .github/workflows/            # ✅ CI/CD (mis à jour)
│
├── package.json                  # Root workspace
├── pnpm-workspace.yaml
├── turbo.json
├── Makefile                      # ✅ Simplifié (dev natif + docker)
└── README.md
```

---

## 3. Actions de Migration

### Phase 1: Réorganisation Docker

| Action | Source | Destination |
|--------|--------|-------------|
| MOVE | `docker-compose.yml` | `infrastructure/docker/compose/docker-compose.yml` |
| MOVE | `docker-compose.dev.yml` | `infrastructure/docker/compose/docker-compose.dev.yml` |
| MOVE | `docker-compose.local.yml` | `infrastructure/docker/compose/docker-compose.local.yml` |
| MOVE | `docker-compose.monorepo.yml` | `infrastructure/docker/compose/docker-compose.monorepo.yml` |
| MOVE | `docker-compose.traefik.yml` | `infrastructure/docker/compose/docker-compose.prod.yml` |
| MOVE | `Caddyfile` | `infrastructure/docker/caddy/Caddyfile` |
| MOVE | `apps/web/Dockerfile*` | `infrastructure/docker/images/web/` |
| MOVE | `services/gateway/Dockerfile*` | `infrastructure/docker/images/gateway/` |
| MOVE | `services/translator/Dockerfile*` | `infrastructure/docker/images/translator/` |
| DELETE | Variantes `.monorepo`, `.optimized` | Utiliser build args |
| MOVE | `infrastructure/env.*` | `infrastructure/envs/` |
| MOVE | `config/production.env` | `infrastructure/envs/.env.production` |
| DELETE | `config/` | Fusionner dans envs/ |

### Phase 2: Scripts de Développement Local

Créer un script unifié `scripts/dev.sh` supportant:

```bash
# Modes de lancement
./scripts/dev.sh                    # Natif, HTTP, utilise DB/Redis existants
./scripts/dev.sh --with-containers  # Lance MongoDB/Redis en Docker
./scripts/dev.sh --memory           # Mode mémoire (sans MongoDB/Redis)
./scripts/dev.sh --secure           # HTTPS avec mkcert
./scripts/dev.sh --ip 192.168.1.39  # IP personnalisée
./scripts/dev.sh --domain app.local # Domaine personnalisé

# Services individuels
./scripts/dev.sh web                # Frontend seul
./scripts/dev.sh gateway            # API seul
./scripts/dev.sh translator         # ML seul
./scripts/dev.sh infra              # MongoDB + Redis seuls

# Commandes
./scripts/dev.sh stop               # Arrêter tout
./scripts/dev.sh status             # Statut des services
./scripts/dev.sh logs [service]     # Voir les logs
```

### Phase 3: Mode Mémoire (Sans DB externes)

Pour `--memory` mode:
- **Gateway**: Utiliser un store en mémoire (Map) au lieu de MongoDB
- **Redis**: Utiliser `ioredis-mock` ou un Map local
- **Translator**: Pas de changement (déjà stateless)

Créer `services/gateway/src/adapters/`:
```
adapters/
├── database/
│   ├── index.ts          # Factory
│   ├── mongodb.ts        # Prisma/MongoDB
│   └── memory.ts         # In-memory store
└── cache/
    ├── index.ts          # Factory
    ├── redis.ts          # ioredis
    └── memory.ts         # Map-based cache
```

### Phase 4: Docker Compose Unifié avec HTTPS

Créer `infrastructure/docker/compose/docker-compose.local.yml`:

```yaml
# docker-compose.local.yml - Développement local avec HTTPS (mkcert)
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--providers.file.directory=/etc/traefik/dynamic"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./certs:/etc/traefik/certs:ro
      - ./dynamic.yml:/etc/traefik/dynamic/dynamic.yml:ro

  database:
    image: mongo:8.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  mongodb_data:
  redis_data:
```

Script de génération de certificats:
```bash
#!/bin/bash
# scripts/lib/certificates.sh

generate_local_certs() {
    local domain="${1:-localhost}"
    local ip="${2:-127.0.0.1}"
    local cert_dir="infrastructure/docker/compose/certs"

    mkdir -p "$cert_dir"

    if ! command -v mkcert &> /dev/null; then
        echo "Installing mkcert..."
        # Installation selon OS
    fi

    mkcert -install
    mkcert -key-file "$cert_dir/key.pem" \
           -cert-file "$cert_dir/cert.pem" \
           "$domain" "$ip" localhost 127.0.0.1 ::1
}
```

### Phase 5: Mise à jour CI/CD

Modifier `.github/workflows/docker.yml`:

```yaml
jobs:
  build:
    steps:
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: infrastructure/docker/images/${{ matrix.service }}/Dockerfile
          # ... reste de la config
```

---

## 4. Fichiers à Créer

### 4.1 scripts/dev.sh (Script Principal)

```bash
#!/bin/bash
# Meeshy Development Script - Native First
# Supports: bun, pnpm, npm
# Modes: native, docker, memory, secure

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/ports.sh"
source "$SCRIPT_DIR/lib/services.sh"
source "$SCRIPT_DIR/lib/certificates.sh"

# Options par défaut
WITH_CONTAINERS=false
MEMORY_MODE=false
SECURE_MODE=false
LOCAL_IP=""
LOCAL_DOMAIN="localhost"
PACKAGE_MANAGER="${MEESHY_PM:-$(detect_package_manager)}"

# Parse arguments...
# Voir implémentation complète dans le code
```

### 4.2 scripts/lib/services.sh

```bash
#!/bin/bash
# Service management functions

start_web() {
    local pm="$1"
    local secure="$2"

    cd "$ROOT_DIR/apps/web"

    if [ "$secure" = true ]; then
        # HTTPS mode avec certificats mkcert
        NODE_EXTRA_CA_CERTS="$CERT_DIR/rootCA.pem" \
        HTTPS=true \
        SSL_CRT_FILE="$CERT_DIR/cert.pem" \
        SSL_KEY_FILE="$CERT_DIR/key.pem" \
        $pm run dev &
    else
        $pm run dev &
    fi
}

start_gateway() {
    local pm="$1"
    local memory="$2"

    cd "$ROOT_DIR/services/gateway"

    if [ "$memory" = true ]; then
        USE_MEMORY_STORE=true $pm run dev &
    else
        $pm run dev &
    fi
}

start_translator() {
    cd "$ROOT_DIR/services/translator"

    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi

    source .venv/bin/activate
    pip install -q -r requirements.txt

    uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload &
}
```

### 4.3 Makefile (Simplifié)

```makefile
.PHONY: dev dev-docker dev-memory dev-secure install build test clean

# Développement natif (par défaut)
dev:
	./scripts/dev.sh

# Développement avec containers (MongoDB, Redis)
dev-docker:
	./scripts/dev.sh --with-containers

# Développement en mémoire (sans DB externes)
dev-memory:
	./scripts/dev.sh --memory

# Développement HTTPS sécurisé
dev-secure:
	./scripts/dev.sh --secure

# Installation des dépendances
install:
	pnpm install
	cd services/translator && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Build
build:
	pnpm run build

# Tests
test:
	pnpm run test

# Docker local
docker-up:
	docker compose -f infrastructure/docker/compose/docker-compose.yml \
	               -f infrastructure/docker/compose/docker-compose.dev.yml up -d

docker-down:
	docker compose -f infrastructure/docker/compose/docker-compose.yml down

# Production avec Traefik
prod-up:
	docker compose -f infrastructure/docker/compose/docker-compose.yml \
	               -f infrastructure/docker/compose/docker-compose.prod.yml up -d

# Nettoyage
clean:
	pnpm run clean
	rm -rf node_modules .turbo
	docker compose -f infrastructure/docker/compose/docker-compose.yml down -v
```

---

## 5. Adaptateurs Mémoire pour Gateway

### 5.1 services/gateway/src/adapters/database/memory.ts

```typescript
// In-memory database adapter for development without MongoDB
import { PrismaClient } from '@prisma/client';

class InMemoryStore {
  private data: Map<string, Map<string, any>> = new Map();

  constructor() {
    // Initialize collections
    ['user', 'message', 'conversation', 'attachment'].forEach(collection => {
      this.data.set(collection, new Map());
    });
  }

  collection(name: string) {
    if (!this.data.has(name)) {
      this.data.set(name, new Map());
    }
    return {
      findUnique: async ({ where }: any) => this.data.get(name)?.get(where.id),
      findMany: async () => Array.from(this.data.get(name)?.values() || []),
      create: async ({ data }: any) => {
        const id = data.id || crypto.randomUUID();
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        this.data.get(name)?.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = this.data.get(name)?.get(where.id);
        if (existing) {
          const updated = { ...existing, ...data, updatedAt: new Date() };
          this.data.get(name)?.set(where.id, updated);
          return updated;
        }
        return null;
      },
      delete: async ({ where }: any) => {
        return this.data.get(name)?.delete(where.id);
      }
    };
  }
}

export const createMemoryClient = () => new InMemoryStore();
```

### 5.2 services/gateway/src/adapters/cache/memory.ts

```typescript
// In-memory cache adapter (replaces Redis)
export class MemoryCache {
  private store: Map<string, { value: any; expiry?: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }
}

export const createMemoryCache = () => new MemoryCache();
```

---

## 6. Checklist de Validation

### Build Natif
- [ ] `pnpm install` fonctionne
- [ ] `pnpm run build` compile tous les packages
- [ ] `./scripts/dev.sh` lance les services
- [ ] `./scripts/dev.sh --memory` fonctionne sans DB
- [ ] `./scripts/dev.sh --secure` génère les certs et lance en HTTPS

### Docker Local
- [ ] `make docker-up` lance l'infrastructure
- [ ] Services accessibles via HTTPS local
- [ ] Hot reload fonctionne

### CI/CD
- [ ] `ci.yml` - Tests passent
- [ ] `docker.yml` - Images se construisent avec nouveaux chemins
- [ ] Tags et versions corrects

### Fonctionnel
- [ ] Frontend se connecte au Gateway
- [ ] WebSocket fonctionne
- [ ] Traduction fonctionne
- [ ] Auth fonctionne (JWT)

---

## 7. Ordre d'Exécution

1. **Créer la structure de dossiers** cible
2. **Déplacer les fichiers Docker** vers infrastructure/
3. **Créer les scripts simplifiés** dans scripts/
4. **Créer les adaptateurs mémoire** dans gateway
5. **Mettre à jour le Makefile**
6. **Mettre à jour les workflows CI/CD**
7. **Tester chaque mode** de développement
8. **Nettoyer** les anciens fichiers
9. **Commit et push**

---

## 8. Risques et Mitigations

| Risque | Mitigation |
|--------|------------|
| Chemins cassés dans docker-compose | Utiliser chemins relatifs à context |
| CI/CD échoue | Tester en dry-run avant merge |
| Scripts legacy utilisés | Garder dans scripts/legacy/ temporairement |
| Mode mémoire incomplet | Implémenter les méthodes au fur et à mesure |

---

*Document généré le: 2024-12-10*
*Version: 1.0*
