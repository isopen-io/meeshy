# Vérification Images Docker et Schema Prisma

**Date:** 2026-01-25
**Objectif:** Confirmer que les images Docker utilisent le nouveau schema.prisma

---

## ✅ Confirmation: Images Docker Utilisent schema.prisma

### Gateway Service

**Dockerfile:** `services/gateway/Dockerfile`

```dockerfile
# Ligne 101
npx prisma generate --generator client --schema=./packages/shared/prisma/schema.prisma
```

**Process de build:**
1. Copie `packages/shared/` (contient prisma/schema.prisma)
2. Build du package shared TypeScript
3. **Génération client Prisma JS** depuis `packages/shared/prisma/schema.prisma`
4. Build TypeScript gateway
5. Copie du client Prisma dans `dist/packages/shared/prisma/`

✅ **Le gateway utilise bien le nouveau schema.prisma**

---

### Translator Service

**Dockerfile:** `services/translator/Dockerfile`

```dockerfile
# Ligne 270-274
COPY packages/shared/prisma ./shared/prisma/
RUN prisma generate --schema=./shared/prisma/schema.prisma
```

**Process de build:**
1. Copie `packages/shared/prisma/` vers `/workspace/shared/prisma/`
2. **Génération client Prisma Python** depuis `./shared/prisma/schema.prisma`
3. Fix binaires Prisma pour ARM64

✅ **Le translator utilise bien le nouveau schema.prisma**

---

### Frontend (Web)

**Dockerfile:** `apps/web/Dockerfile`

```dockerfile
# Ligne 61-97
COPY packages/shared/ ./packages/shared/
RUN cd packages/shared && bun run build
```

**Process de build:**
1. Copie complète de `packages/shared/`
2. Build du package shared (TypeScript)
3. Le client Prisma est généré via le build script de shared

✅ **Le frontend utilise bien le package shared qui contient schema.prisma**

---

## 🔨 Commandes de Build (Makefile)

### Build Toutes les Images

```bash
make docker-build         # Build toutes les images
# OU
make build-all-docker     # Alias
```

### Build Individuelles

```bash
make build-docker-gateway    # Gateway uniquement
make build-translator-cpu    # Translator CPU (2GB)
make build-translator-gpu    # Translator GPU CUDA 12.4 (8GB)
make build-docker-web        # Frontend Next.js
```

### Images Produites

```
isopen/meeshy-gateway:v<version>
isopen/meeshy-translator:v<version>-cpu
isopen/meeshy-web:v<version>
```

---

## 📦 Volumes pour Fichiers Physiques

### Docker Compose Production Actuel

**Volumes définis:**

```yaml
volumes:
  database_data:            # MongoDB data
  database_config:          # MongoDB config
  redis_data:               # Redis persistence
  redis-ui-data:            # Redis UI settings
  traefik_certs:            # Let's Encrypt SSL
  models_data:              # ML models cache (Translator)
  gateway_uploads:          # Fichiers uploadés via Gateway API
  frontend_uploads:         # Fichiers uploadés via Frontend
```

### Points de Montage Critiques

#### Gateway - Uploads API

```yaml
gateway:
  volumes:
    - gateway_uploads:/app/uploads
    - /opt/meeshy/secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json
  environment:
    - UPLOAD_PATH=/app/uploads
    - PUBLIC_URL=https://gate.${DOMAIN}/uploads
```

**Données physiques:**
- Photos de profil
- Fichiers attachés aux messages
- Audio enregistrés
- Documents partagés

#### Frontend - Uploads Next.js

```yaml
frontend:
  volumes:
    - frontend_uploads:/app/public/u
```

**Données physiques:**
- Assets statiques uploadés côté client
- Images optimisées par Next.js

#### Static Files - Nginx

```yaml
static-files:
  volumes:
    - frontend_uploads:/usr/share/nginx/html/u:ro
    - gateway_uploads:/usr/share/nginx/html/uploads:ro
```

**Exposé via:**
- `https://static.meeshy.me/u/*` → frontend_uploads
- `https://static.meeshy.me/uploads/*` → gateway_uploads

#### Translator - Modèles ML

```yaml
translator:
  volumes:
    - models_data:/workspace/models
  environment:
    - HF_HOME=/workspace/models
    - TRANSFORMERS_CACHE=/workspace/models
    - HUGGINGFACE_HUB_CACHE=/workspace/models
```

**Données physiques:**
- Modèles Whisper
- Modèles de traduction
- Modèles TTS/Voice cloning
- Cache embeddings

---

## 🎯 Migration des Volumes pour Staging

### Stratégie

**Option 1: Volumes Séparés (Recommandé)**
- Créer des volumes staging distincts
- Copier les données prod → staging pour tests
- Isolation complète

**Option 2: Volumes Partagés**
- Partager les volumes en read-only depuis prod
- Économie d'espace disque
- Risque de conflit

### Implémentation Recommandée (Option 1)

```yaml
# docker-compose.staging.yml
volumes:
  # Volumes staging avec préfixe
  database_staging_data:
  gateway_staging_uploads:
  frontend_staging_uploads:
  models_staging_data:
  # ... etc
```

**Copie des données physiques:**

```bash
# Copier les uploads prod → staging
docker run --rm \
  -v meeshy-gateway-uploads:/from:ro \
  -v meeshy-staging-gateway-uploads:/to \
  alpine sh -c "cp -av /from/. /to/"

docker run --rm \
  -v meeshy-web-uploads:/from:ro \
  -v meeshy-staging-web-uploads:/to \
  alpine sh -c "cp -av /from/. /to/"

# Modèles ML (optionnel - volumineux)
# On peut les partager en read-only ou re-télécharger
```

---

## 📊 Taille des Volumes

### Volume Actuel (Estimation)

```bash
# Sur le serveur
ssh root@meeshy.me "docker system df -v | grep -A 20 'Local Volumes'"
```

**Estimations:**
- `gateway_uploads`: ~50-200 MB (photos, audio, fichiers)
- `frontend_uploads`: ~10-50 MB (assets)
- `models_data`: ~5-10 GB (modèles ML)
- `database_data`: ~10-15 MB (MongoDB)
- `redis_data`: ~1-5 MB (cache)
- **Total: ~5-10 GB**

---

## ✅ Validation Finale

### Checklist Pré-Staging

- [x] **Gateway** utilise `packages/shared/prisma/schema.prisma` ✅
- [x] **Translator** utilise `packages/shared/prisma/schema.prisma` ✅
- [x] **Frontend** utilise package shared ✅
- [x] Images Docker buildables via `make docker-build` ✅
- [x] Volumes identifiés et documentés ✅

### Prochaine Étape

✅ **Créer docker-compose.staging.yml** avec:
1. Volumes staging isolés (préfixe `staging_`)
2. Ports alternatifs (éviter conflits)
3. Domaines `*.staging.meeshy.me`
4. Même configuration que prod mais séparée

---

## 🚀 Commande de Build Recommandée

```bash
# 1. Build toutes les images avec schema.prisma actuel
make docker-build

# 2. Tag pour staging
docker tag isopen/meeshy-gateway:latest isopen/meeshy-gateway:staging
docker tag isopen/meeshy-translator:latest isopen/meeshy-translator:staging
docker tag isopen/meeshy-web:latest isopen/meeshy-web:staging

# 3. Vérifier
docker images | grep meeshy
```

---

**Analyse complétée le:** 2026-01-25 23:10 UTC
**Prochaine action:** Créer docker-compose.staging.yml
