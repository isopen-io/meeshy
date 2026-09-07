# Guide de Build Docker - Gateway Meeshy

## 📋 Problème Initial

Le build Docker du gateway échouait avec l'erreur:
```
ERROR: failed to calculate checksum: "/shared/config": not found
ERROR: failed to calculate checksum: "/shared/prisma": not found
```

**Cause**: Le contexte de build Docker depuis `gateway/` ne pouvait pas accéder au dossier `shared/` qui se trouve à la racine du monorepo.

## ✅ Solution Implémentée

### 1. Nouveau Dockerfile Monorepo

Créé `/gateway/Dockerfile.monorepo` qui:
- ✅ Build depuis la **racine du monorepo** (pas depuis `gateway/`)
- ✅ Structure de dossiers identique au développement: `/app/meeshy/gateway/` et `/app/meeshy/shared/`
- ✅ Résout les imports relatifs `../../shared/` correctement
- ✅ Supporte multi-plateforme (arm64 + amd64)

### 2. Fichiers Créés

#### `gateway/Dockerfile.monorepo`
Dockerfile optimisé pour build monorepo avec:
- Copie du workspace pnpm (`pnpm-workspace.yaml`)
- Structure `/app/meeshy/gateway/` et `/app/meeshy/shared/`
- Génération du client Prisma depuis `shared/schema.prisma`
- Build TypeScript avec chemins relatifs fonctionnels

#### `.dockerignore.gateway`
Fichier d'exclusion pour optimiser le build:
- Exclut `frontend/` et `translator/` (pas nécessaires)
- Garde seulement `gateway/` et `shared/`
- Exclut les tests, logs, et fichiers temporaires

#### `gateway/build-docker-monorepo.sh`
Script intelligent de build avec:
- Détection automatique de l'architecture
- Support push/load/build
- Configuration du .dockerignore automatique
- Logs colorés et explicites

#### `gateway/build-push.sh`
Script rapide pour build + push multi-plateforme

## 🚀 Utilisation

### Build Local (Test)

```bash
cd /path/to/meeshy
./gateway/build-docker-monorepo.sh isopen/meeshy-gateway:test "linux/arm64" load
```

### Build Multi-Plateforme + Push

```bash
cd /path/to/meeshy
./gateway/build-push.sh
# OU
./gateway/build-docker-monorepo.sh isopen/meeshy-gateway:latest "linux/arm64,linux/amd64" push
```

### Build Sans Push (Juste tester)

```bash
cd /path/to/meeshy
./gateway/build-docker-monorepo.sh isopen/meeshy-gateway:latest "linux/arm64,linux/amd64" build
```

## 📂 Structure dans le Container

```
/app/meeshy/
├── pnpm-workspace.yaml
├── package.json
├── gateway/
│   ├── package.json
│   ├── dist/
│   ├── .env
│   └── docker-entrypoint.sh
└── shared/
    ├── schema.prisma
    ├── client/          # Prisma Client généré
    ├── types/
    ├── proto/
    └── utils/
```

Cette structure permet aux imports du gateway comme `../../shared/types` de fonctionner correctement.

## 🔧 Points Clés

### Contexte de Build
**IMPORTANT**: Le contexte de build doit être la **racine du monorepo**, pas `gateway/`:

```bash
# ❌ INCORRECT
cd gateway && docker build -f Dockerfile .

# ✅ CORRECT  
cd meeshy && docker build -f gateway/Dockerfile.monorepo .
```

### Chemins Relatifs
Le code du gateway utilise des imports relatifs vers shared:
```typescript
import { PrismaClient } from '../../shared/prisma/client';
import type { User } from '../../shared/types';
```

Ces chemins fonctionnent car la structure Docker `/app/meeshy/gateway/` et `/app/meeshy/shared/` correspond au développement.

### Génération Prisma Client
Le client Prisma est généré **dans le container** depuis `shared/schema.prisma`:
```bash
cd /app/meeshy/shared
npx prisma generate --schema=./schema.prisma
```

Cela crée `/app/meeshy/shared/client/` accessible depuis le gateway.

## 🐛 Problèmes Courants

### 1. Erreur "Cannot find module ../../shared/"
**Cause**: WORKDIR incorrect dans le Dockerfile  
**Solution**: Vérifier que WORKDIR est `/app/meeshy/gateway`

### 2. Erreur "shared/prisma: not found"
**Cause**: Le schéma Prisma est à `shared/schema.prisma`, pas `shared/prisma/schema.prisma`  
**Solution**: Utiliser `--schema=./schema.prisma` dans la génération Prisma

### 3. Build échoue avec "distribute.sh not found"
**Cause**: Le script prebuild du gateway cherche des scripts qui n'existent pas dans Docker  
**Solution**: Générer Prisma manuellement avant le `pnpm run build`

### 4. Imports TypeScript échouent lors du build
**Cause**: shared/client/ pas généré avant compilation TypeScript  
**Solution**: RUN génération Prisma **AVANT** le `pnpm run build`

## 📝 Variables d'Environnement

Le Dockerfile supporte toutes les variables du gateway:
```bash
DATABASE_URL=mongodb://...
REDIS_URL=redis://...
JWT_SECRET=...
FASTIFY_PORT=3000
GRPC_TRANSLATION_HOST=...
ZMQ_TRANSLATOR_HOST=...
# ... etc
```

## 🎯 Prochaines Étapes

1. ✅ Tester le build local avec `load`
2. ✅ Vérifier que l'image démarre correctement
3. ✅ Tester multi-plateforme avec `build`
4. ✅ Push vers Docker Hub avec `push`

## 📚 Références

- [Docker Build Context](https://docs.docker.com/build/building/context/)
- [Docker Multi-Platform Builds](https://docs.docker.com/build/building/multi-platform/)
- [Prisma in Docker](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker)
- [PNPM Workspaces](https://pnpm.io/workspaces)

---

**Auteur**: Session de fix - 2025-10-16  
**Fichiers Modifiés**:
- `/gateway/Dockerfile.monorepo` (créé)
- `/.dockerignore.gateway` (créé)
- `/gateway/build-docker-monorepo.sh` (créé)
- `/gateway/build-push.sh` (créé)
