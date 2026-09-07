# Docker Build pour Gateway - Configuration Auto-Suffisante

## Problème Résolu

Le build Docker du gateway échouait car il dépend de fichiers du monorepo (`shared/`, `pnpm-workspace.yaml`) qui n'étaient pas disponibles dans le contexte Docker du gateway.

## Solution Implémentée

### 1. Script de Préparation (`gateway/scripts/prepare-docker-build.sh`)

Ce script réutilise le script `shared/scripts/distribute.sh` existant pour distribuer automatiquement tous les fichiers nécessaires:

```bash
#!/bin/bash
# Prépare le gateway pour le build Docker en distribuant shared/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$GATEWAY_ROOT/.." && pwd)"
SHARED_DIR="$MONOREPO_ROOT/shared"

echo "🔧 Preparing gateway for Docker build..."

# Build shared types si nécessaire
if [ ! -d "$SHARED_DIR/dist" ]; then
    cd "$SHARED_DIR"
    pnpm run build:types
fi

# Exécute distribute.sh pour copier shared/ vers gateway/shared/
cd "$SHARED_DIR"
./scripts/distribute.sh

# Copie package.json de shared (nécessaire pour pnpm workspace)
cd "$GATEWAY_ROOT"
cp "$SHARED_DIR/package.json" "$GATEWAY_ROOT/shared/package.json"

# Crée pnpm-workspace.yaml pour contexte gateway
cat > "$GATEWAY_ROOT/pnpm-workspace.yaml" << 'EOF'
packages:
  - '.'
  - 'shared'

ignoredBuiltDependencies:
  - '@tensorflow/tfjs-node'
  - core-js
  - onnxruntime-node
  - protobufjs
  - sharp
  - unrs-resolver

onlyBuiltDependencies:
  - '@prisma/client'
  - '@prisma/engines'
  - esbuild
  - prisma
EOF

echo "✅ Gateway is now self-sufficient for Docker build!"
```

### 2. Scripts package.json

Ajouté au `gateway/package.json`:

```json
{
  "scripts": {
    "docker:prepare": "./scripts/prepare-docker-build.sh",
    "docker:build": "pnpm run docker:prepare && docker buildx build --platform linux/arm64,linux/amd64 -t isopen/meeshy-gateway:latest -f ./Dockerfile .",
    "docker:build:local": "pnpm run docker:prepare && docker buildx build --platform linux/arm64 --load -t isopen/meeshy-gateway:latest -f ./Dockerfile .",
    "docker:push": "pnpm run docker:build && docker push isopen/meeshy-gateway:latest"
  }
}
```

### 3. Dockerfile Mis à Jour

Le Dockerfile a été modifié pour:

1. **Copier pnpm-workspace.yaml AVANT l'installation**:
```dockerfile
# Copie de la configuration workspace et des packages nécessaires
COPY --chown=gateway:nodejs pnpm-workspace.yaml ./
COPY --chown=gateway:nodejs package.json pnpm-lock.yaml* ./
COPY --chown=gateway:nodejs shared/package.json ./shared/
COPY --chown=gateway:nodejs .env.docker ./.env

# Installation des dépendances
RUN pnpm install --no-frozen-lockfile --prod=false \
    && pnpm store prune \
    && rm -rf /tmp/.npm /tmp/.yarn ~/.cache
```

2. **Générer Prisma et build sans dépendre des scripts package.json**:
```dockerfile
# Build de l'application avec nettoyage
RUN echo "🔧 Génération du client Prisma Node.js..." \
    && npx prisma generate --schema=./shared/prisma/schema.prisma \
    && echo "✅ Client Prisma Node.js généré avec succès" \
    && echo "🏗️  Building TypeScript application..." \
    && CI=true DATABASE_URL=mongodb://dummy:dummy@localhost:27017/dummy tsc \
    && cp -r shared/prisma dist/shared/ \
    && echo "✅ Build completed successfully" \
    && echo "🧹 Cleaning up development dependencies..." \
    && rm -rf src/ tsconfig.json \
    && CI=true pnpm install --prod --ignore-scripts \
    && pnpm store prune \
    && rm -rf /tmp/.npm /tmp/.yarn ~/.cache \
    && chmod +x /app/docker-entrypoint.sh
```

### 4. .gitignore Gateway

Ajouté pour éviter de commiter les fichiers copiés:

```gitignore
# Docker build artifacts (copied by prepare-docker-build.sh)
shared/
pnpm-workspace.yaml
package.json.workspace

# Uploads (runtime)
uploads/
```

### 5. .dockerignore Gateway

Optimisé pour exclure les fichiers inutiles:

```dockerignore
# Exclude parent shared directory (we copy it locally)
../shared
../frontend
../translator
../scripts

# Workspace files (copied by prepare script)
package.json.workspace

# Docker build scripts
build-*.sh
docker-compose*.yml

# Database files
*.db
*.db-journal
*.sqlite
*.sqlite3
dev.db
```

## Utilisation

### Build Local (pour test)

```bash
cd gateway
pnpm run docker:build:local
```

### Build Multi-Platform (pour production)

```bash
cd gateway
pnpm run docker:build
```

### Push vers Registry

```bash
cd gateway
pnpm run docker:push
```

### Build Manuel

```bash
cd gateway
./scripts/prepare-docker-build.sh
docker buildx build --platform linux/arm64,linux/amd64 -t isopen/meeshy-gateway:latest -f ./Dockerfile .
```

## Points Importants

### ⚠️ Utiliser `./Dockerfile` pas `Dockerfile`

Il y a un `Dockerfile` à la racine du monorepo. Pour éviter la confusion, toujours spécifier `-f ./Dockerfile` depuis le répertoire gateway.

### 🔄 Réutilisation du Script distribute.sh

On réutilise `shared/scripts/distribute.sh` qui:
- Copie `shared/dist/` (types compilés)
- Crée `shared/prisma/` avec schema.prisma
- Copie `shared/proto/` (fichiers protobuf)
- Copie `shared/types/` (types source)
- Génère la version et le version.txt

### 📦 Structure Créée

Après `prepare-docker-build.sh`:

```
gateway/
├── shared/                    # Copié par distribute.sh
│   ├── package.json          # Copié manuellement (nécessaire pour workspace)
│   ├── prisma/
│   │   └── schema.prisma     # Organisé par distribute.sh
│   ├── proto/                # Protobuf files
│   ├── types/                # Types source
│   ├── *.js, *.d.ts          # Types compilés depuis dist/
│   └── version.txt
├── pnpm-workspace.yaml        # Généré pour contexte gateway seul
├── Dockerfile                 # Utilise shared/ local
└── src/                       # Code source gateway
```

### 🚀 Avantages

1. **Auto-suffisant**: Le gateway peut être buildé indépendamment
2. **Réutilisation**: Utilise distribute.sh existant (DRY principle)
3. **Cache Docker**: pnpm-workspace.yaml copié avant permet bon caching
4. **Simplicité**: Un seul script `docker:build:local` fait tout
5. **Production-ready**: Support multi-platform (arm64 + amd64)

## Troubleshooting

### Erreur: `@meeshy/shared not found in workspace`

```bash
# Vérifier que shared/package.json existe
ls -la gateway/shared/package.json

# Si absent, relancer prepare
cd gateway && ./scripts/prepare-docker-build.sh
```

### Erreur: `schema.prisma not found`

```bash
# Vérifier la structure
ls -la gateway/shared/prisma/schema.prisma

# Si absent, vérifier que shared/dist existe
ls -la shared/dist

# Rebuild shared si nécessaire
cd shared && pnpm run build:types
```

### Docker utilise le mauvais Dockerfile

```bash
# Toujours utiliser ./Dockerfile depuis gateway/
docker buildx build -f ./Dockerfile .

# PAS:
docker buildx build -f Dockerfile .  # Peut utiliser ../Dockerfile
```

## Prochaines Étapes

1. ✅ Tester le build complet
2. ✅ Vérifier que l'image fonctionne
3. ⏭️ Appliquer la même approche pour frontend et translator
4. ⏭️ Mettre à jour les CI/CD workflows

---

**Date**: 2025-10-16  
**Status**: ✅ Implémenté et testé  
**Script**: `gateway/scripts/prepare-docker-build.sh`
