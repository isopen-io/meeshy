# Migration MongoDB + Environnement Staging - Plan d'Implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrer la base de données MongoDB vers une nouvelle architecture Prisma avec environnement staging complet, permettant un switch production en ≤10 minutes avec rollback possible.

**Architecture:** Migration en 3 phases parallélisables: (1) Préparation infrastructure staging isolée, (2) Développement backend Prisma + script migration, (3) Tests en staging avec données prod puis switch atomique. L'environnement staging tourne en parallèle de prod sur le même serveur avec isolation complète (ports, volumes, domaines).

**Tech Stack:** Prisma (MongoDB connector), Node.js/TypeScript, Docker Compose, Traefik, Bash scripts, MongoDB native tools (mongodump/restore)

**Contraintes:**
- Données: ~quelques MB, centaines d'utilisateurs, milliers de messages, 2-3 communautés
- Switch production: ≤10 minutes de downtime
- Staging doit utiliser une copie exacte des données prod
- Rollback automatisé en cas d'échec
- Environnements prod/staging isolés mais partageant le serveur temporairement

---

## Phase 0: Analyse & Préparation (Parallélisable)

### Task 0.1: Audit de l'Infrastructure Actuelle

**Objectif:** Capturer l'état exact du système actuel pour référence et rollback.

**Files:**
- Create: `docs/infrastructure/current-state-snapshot.md`
- Create: `infrastructure/scripts/capture-current-state.sh`

**Step 1: Créer le script de capture d'état**

```bash
#!/bin/bash
# infrastructure/scripts/capture-current-state.sh
set -euo pipefail

OUTPUT_DIR="docs/infrastructure/snapshots/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "📸 Capture de l'état actuel du système..."

# Capture Docker
ssh root@meeshy.me "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'" > "$OUTPUT_DIR/docker-containers.txt"
ssh root@meeshy.me "docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}'" > "$OUTPUT_DIR/docker-images.txt"
ssh root@meeshy.me "docker volume ls" > "$OUTPUT_DIR/docker-volumes.txt"

# Capture structure /opt/meeshy
ssh root@meeshy.me "tree -L 3 /opt/meeshy || ls -laR /opt/meeshy" > "$OUTPUT_DIR/meeshy-directory.txt"

# Capture config Docker Compose
ssh root@meeshy.me "cat /opt/meeshy/docker-compose.yml" > "$OUTPUT_DIR/docker-compose.yml" 2>/dev/null || echo "Pas de docker-compose.yml"
ssh root@meeshy.me "cat /opt/meeshy/.env" > "$OUTPUT_DIR/env-variables.txt" 2>/dev/null || echo "Pas de .env"

# Capture état MongoDB
ssh root@meeshy.me "docker exec meeshy-database mongosh --quiet --eval 'db.adminCommand({listDatabases: 1})'" > "$OUTPUT_DIR/mongodb-databases.txt"
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --quiet --eval 'db.getCollectionNames()'" > "$OUTPUT_DIR/mongodb-collections.txt"

# Stats collections
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --quiet --eval '
  db.getCollectionNames().forEach(function(col) {
    var count = db[col].countDocuments();
    print(col + \": \" + count + \" documents\");
  })
'" > "$OUTPUT_DIR/mongodb-stats.txt"

# Capture SHA des images
ssh root@meeshy.me "docker inspect meeshy-gateway --format '{{.Image}}'" > "$OUTPUT_DIR/gateway-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-translator --format '{{.Image}}'" > "$OUTPUT_DIR/translator-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-web --format '{{.Image}}'" > "$OUTPUT_DIR/frontend-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-database --format '{{.Image}}'" > "$OUTPUT_DIR/database-sha.txt"

echo "✅ État capturé dans $OUTPUT_DIR"
echo "$OUTPUT_DIR" > .last-snapshot-dir
```

**Step 2: Rendre le script exécutable et lancer**

```bash
chmod +x infrastructure/scripts/capture-current-state.sh
./infrastructure/scripts/capture-current-state.sh
```

**Step 3: Analyser manuellement la structure MongoDB**

Se connecter au serveur et explorer:

```bash
ssh root@meeshy.me

# Lister les collections
docker exec -it meeshy-database mongosh meeshy --eval "db.getCollectionNames()"

# Examiner la structure User (sample)
docker exec -it meeshy-database mongosh meeshy --eval "db.User.findOne()"

# Examiner Message
docker exec -it meeshy-database mongosh meeshy --eval "db.Message.findOne()"

# Examiner Community
docker exec -it meeshy-database mongosh meeshy --eval "db.Community.findOne()"

# Lister tous les indexes
docker exec -it meeshy-database mongosh meeshy --eval "
  db.getCollectionNames().forEach(function(col) {
    print('=== ' + col + ' ===');
    printjson(db[col].getIndexes());
  })
"
```

**Step 4: Documenter les découvertes**

Créer `docs/infrastructure/current-state-snapshot.md` avec:
- Liste des collections et leur schéma
- Relations entre collections
- Indexes existants
- Volumes de données par collection
- Différences avec schema.prisma

**Step 5: Commit**

```bash
git add docs/infrastructure/ infrastructure/scripts/capture-current-state.sh
git commit -m "docs: capture état infrastructure actuelle MongoDB"
```

---

### Task 0.2: Créer le Script de Backup MongoDB

**Objectif:** Script de backup automatisé avant toute opération critique.

**Files:**
- Create: `infrastructure/scripts/backup-mongodb.sh`

**Step 1: Créer le script de backup**

```bash
#!/bin/bash
# infrastructure/scripts/backup-mongodb.sh
set -euo pipefail

BACKUP_NAME="${1:-backup-$(date +%Y%m%d-%H%M%S)}"
BACKUP_DIR="/opt/meeshy/backups/$BACKUP_NAME"
REMOTE_HOST="root@meeshy.me"

echo "💾 Backup MongoDB vers $BACKUP_DIR..."

# Créer le répertoire de backup sur le serveur
ssh $REMOTE_HOST "mkdir -p $BACKUP_DIR"

# Effectuer le dump MongoDB
ssh $REMOTE_HOST "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=$BACKUP_DIR \
  --quiet"

# Compresser le backup
ssh $REMOTE_HOST "cd /opt/meeshy/backups && tar -czf $BACKUP_NAME.tar.gz $BACKUP_NAME && rm -rf $BACKUP_NAME"

# Vérifier la taille
BACKUP_SIZE=$(ssh $REMOTE_HOST "du -h /opt/meeshy/backups/$BACKUP_NAME.tar.gz | cut -f1")
echo "✅ Backup créé: $BACKUP_NAME.tar.gz ($BACKUP_SIZE)"
echo "/opt/meeshy/backups/$BACKUP_NAME.tar.gz" > .last-backup-path
```

**Step 2: Créer le script de restauration**

```bash
#!/bin/bash
# infrastructure/scripts/restore-mongodb.sh
set -euo pipefail

BACKUP_PATH="${1:?Usage: $0 <backup-path>}"
REMOTE_HOST="root@meeshy.me"
TARGET_DB="${2:-meeshy}"

echo "🔄 Restauration MongoDB depuis $BACKUP_PATH..."

# Décompresser
BACKUP_NAME=$(basename "$BACKUP_PATH" .tar.gz)
ssh $REMOTE_HOST "cd /opt/meeshy/backups && tar -xzf $BACKUP_PATH"

# Restaurer
ssh $REMOTE_HOST "docker exec -i meeshy-database mongorestore \
  --db=$TARGET_DB \
  --drop \
  /opt/meeshy/backups/$BACKUP_NAME/meeshy"

echo "✅ Base de données restaurée dans $TARGET_DB"
```

**Step 3: Rendre exécutables**

```bash
chmod +x infrastructure/scripts/backup-mongodb.sh
chmod +x infrastructure/scripts/restore-mongodb.sh
```

**Step 4: Tester le backup**

```bash
./infrastructure/scripts/backup-mongodb.sh test-backup
# Vérifier que le fichier existe sur le serveur
ssh root@meeshy.me "ls -lh /opt/meeshy/backups/test-backup.tar.gz"
```

**Step 5: Commit**

```bash
git add infrastructure/scripts/backup-mongodb.sh infrastructure/scripts/restore-mongodb.sh
git commit -m "feat(infra): scripts backup/restore MongoDB"
```

---

## Phase 1: Infrastructure Staging (Parallélisable avec Phase 2)

### Task 1.1: Créer la Configuration Docker Compose Staging

**Objectif:** Dupliquer et adapter docker-compose.prod.yml pour l'environnement staging isolé.

**Files:**
- Create: `infrastructure/docker/compose/docker-compose.staging.yml`
- Create: `infrastructure/docker/compose/.env.staging.template`

**Step 1: Créer docker-compose.staging.yml**

```yaml
# infrastructure/docker/compose/docker-compose.staging.yml
# =============================================================================
# MEESHY - Docker Compose STAGING (*.staging.meeshy.me)
# =============================================================================
# Deployment: /opt/meeshy/staging/
# Isolation: Ports, volumes, et domaines séparés de production
# =============================================================================

services:
  # ===========================================================================
  # TRAEFIK STAGING - Ports alternatifs pour éviter conflits
  # ===========================================================================
  traefik-staging:
    image: traefik:v3.6
    container_name: meeshy-traefik-staging
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    command:
      - "--api.dashboard=true"
      - "--api.insecure=false"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=meeshy-staging-network"
      - "--providers.file.filename=/config/dynamic.yaml"
      - "--providers.file.watch=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=${CERTBOT_EMAIL:-admin@meeshy.me}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      - "--entrypoints.web.http.redirections.entrypoint.permanent=true"
      - "--log.level=INFO"
      - "--accesslog=true"
    ports:
      - "8080:80"    # HTTP alternatif
      - "8443:443"   # HTTPS alternatif
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_staging_certs:/letsencrypt
      - ./config/dynamic.yaml:/config/dynamic.yaml:ro
    networks:
      - meeshy-staging-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik-staging.rule=Host(`traefik.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.traefik-staging.entrypoints=websecure"
      - "traefik.http.routers.traefik-staging.tls.certresolver=letsencrypt"
      - "traefik.http.routers.traefik-staging.service=api@internal"
      - "traefik.http.routers.traefik-staging.middlewares=traefik-auth"
      - "traefik.http.middlewares.traefik-auth.basicauth.users=${TRAEFIK_USERS}"

  # ===========================================================================
  # DATABASE STAGING - MongoDB Replica Set
  # ===========================================================================
  database-staging:
    image: ${DATABASE_IMAGE:-mongo:8.0}
    container_name: meeshy-database-staging
    restart: unless-stopped
    command: mongod --replSet rs0 --bind_ip_all --noauth --port 27017
    environment:
      MONGO_INITDB_DATABASE: ${MONGODB_DATABASE:-meeshy}
    ports:
      - "27018:27017"  # Exposition externe pour migration
    volumes:
      - database_staging_data:/data/db
      - database_staging_config:/data/configdb
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD-SHELL", "mongosh --eval 'db.runCommand(\"ping\").ok' || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # MongoDB Replica Set Init (one-shot)
  mongo-init-staging:
    image: ${DATABASE_IMAGE:-mongo:8.0}
    container_name: meeshy-mongo-init-staging
    depends_on:
      database-staging:
        condition: service_healthy
    networks:
      - meeshy-staging-network
    entrypoint: >
      mongosh --host database-staging:27017 --eval '
        try {
          const status = rs.status();
          print("Replica set already initialized, state: " + status.myState);
        } catch (e) {
          print("Initializing replica set...");
          rs.initiate({
            _id: "rs0",
            members: [{ _id: 0, host: "database-staging:27017" }]
          });
          print("Replica set initialized!");
        }
      '
    restart: "no"

  # ===========================================================================
  # NOSQLCLIENT STAGING - MongoDB Web UI
  # ===========================================================================
  nosqlclient-staging:
    image: mongoclient/mongoclient:latest
    container_name: meeshy-nosqlclient-staging
    restart: unless-stopped
    environment:
      MONGOCLIENT_DEFAULT_CONNECTION_URL: "mongodb://database-staging:27017/${MONGODB_DATABASE:-meeshy}?replicaSet=rs0&directConnection=true"
      ROOT_URL: "https://mongo.staging.${DOMAIN:-meeshy.me}"
      PORT: 3000
    depends_on:
      mongo-init-staging:
        condition: service_completed_successfully
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nosqlclient-staging.rule=Host(`mongo.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.nosqlclient-staging.entrypoints=websecure"
      - "traefik.http.routers.nosqlclient-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.nosqlclient-staging.loadbalancer.server.port=3000"
      - "traefik.http.routers.nosqlclient-staging.middlewares=mongo-auth"
      - "traefik.http.middlewares.mongo-auth.basicauth.users=${MONGO_USERS}"

  # ===========================================================================
  # REDIS STAGING
  # ===========================================================================
  redis-staging:
    image: redis:8-alpine
    container_name: meeshy-redis-staging
    restart: unless-stopped
    command: redis-server --appendonly yes --port 6379
    ports:
      - "6380:6379"
    volumes:
      - redis_staging_data:/data
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ===========================================================================
  # P3X REDIS UI STAGING
  # ===========================================================================
  p3x-redis-ui-staging:
    image: patrikx3/p3x-redis-ui:latest
    container_name: meeshy-p3x-redis-ui-staging
    restart: unless-stopped
    environment:
      - P3X_REDIS_UI_SETTINGS={"hostname":"redis-staging","port":6379,"password":"","database":0}
      - P3X_REDIS_UI_HTTP_PORT=7843
      - P3XRS_SETTINGS_PATH=/settings
    volumes:
      - redis_staging_ui_data:/settings
    depends_on:
      redis-staging:
        condition: service_healthy
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD-SHELL", "netstat -an | grep :7843 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.p3x-redis-staging.rule=Host(`redis.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.p3x-redis-staging.entrypoints=websecure"
      - "traefik.http.routers.p3x-redis-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.p3x-redis-staging.loadbalancer.server.port=7843"
      - "traefik.http.routers.p3x-redis-staging.middlewares=redis-auth"
      - "traefik.http.middlewares.redis-auth.basicauth.users=${REDIS_USERS}"

  # ===========================================================================
  # TRANSLATOR STAGING - ML Service
  # ===========================================================================
  translator-staging:
    image: ${TRANSLATOR_IMAGE:-isopen/meeshy-translator:latest}
    container_name: meeshy-translator-staging
    restart: unless-stopped
    environment:
      - DATABASE_TYPE=${DATABASE_TYPE:-MONGODB}
      - DATABASE_URL=mongodb://database-staging:27017/${MONGODB_DATABASE:-meeshy}?replicaSet=rs0&directConnection=true
      - REDIS_URL=redis://redis-staging:6379
      - PRISMA_SCHEMA_PATH=/workspace/schema.prisma
      - PYTHONPATH=/workspace:/workspace/generated
      - PYTHONUNBUFFERED=1
      - NODE_ENV=staging
      - HF_HOME=/workspace/models
      - TRANSFORMERS_CACHE=/workspace/models
      - HUGGINGFACE_HUB_CACHE=/workspace/models
      - ENABLE_DIARIZATION=${ENABLE_DIARIZATION:-true}
      - TTS_MAX_NEW_TOKENS=${TTS_MAX_NEW_TOKENS:-2048}
      - TTS_MAX_SEGMENT_CHARS=${TTS_MAX_SEGMENT_CHARS:-1000}
      - TTS_MIN_SEGMENT_CHARS=${TTS_MIN_SEGMENT_CHARS:-50}
    volumes:
      - models_staging_data:/workspace/models
    depends_on:
      mongo-init-staging:
        condition: service_completed_successfully
      redis-staging:
        condition: service_healthy
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.translator-staging.rule=Host(`ml.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.translator-staging.entrypoints=websecure"
      - "traefik.http.routers.translator-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.translator-staging.loadbalancer.server.port=8000"

  # ===========================================================================
  # GATEWAY STAGING - API Service
  # ===========================================================================
  gateway-staging:
    image: ${GATEWAY_IMAGE:-isopen/meeshy-gateway:latest}
    container_name: meeshy-gateway-staging
    restart: unless-stopped
    environment:
      - DATABASE_TYPE=${DATABASE_TYPE:-MONGODB}
      - DATABASE_URL=mongodb://database-staging:27017/${MONGODB_DATABASE:-meeshy}?replicaSet=rs0&directConnection=true
      - REDIS_URL=redis://redis-staging:6379
      - TRANSLATOR_URL=http://translator-staging:8000
      - ZMQ_PUSH_URL=tcp://translator-staging:5555
      - ZMQ_SUB_URL=tcp://translator-staging:5558
      - ZMQ_TRANSLATOR_HOST=translator-staging
      - ZMQ_TRANSLATOR_PUSH_PORT=5555
      - ZMQ_TRANSLATOR_SUB_PORT=5558
      - NODE_ENV=staging
      - DOMAIN=staging.${DOMAIN:-meeshy.me}
      - CORS_ORIGINS=https://staging.${DOMAIN:-meeshy.me},https://gate.staging.${DOMAIN:-meeshy.me}
      - ALLOWED_ORIGINS=https://staging.${DOMAIN:-meeshy.me},https://gate.staging.${DOMAIN:-meeshy.me}
      - FRONTEND_URL=https://staging.${DOMAIN:-meeshy.me}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-7d}
      - UPLOAD_PATH=/app/uploads
      - PUBLIC_URL=https://gate.staging.${DOMAIN:-meeshy.me}
      - FORCE_DB_RESET=${FORCE_DB_RESET:-false}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_SYSTEM_LANGUAGE=${ADMIN_SYSTEM_LANGUAGE}
      - ADMIN_REGIONAL_LANGUAGE=${ADMIN_REGIONAL_LANGUAGE}
      - ADMIN_CUSTOM_DESTINATION_LANGUAGE=${ADMIN_CUSTOM_DESTINATION_LANGUAGE}
      - MEESHY_PASSWORD=${MEESHY_PASSWORD}
      - MEESHY_EMAIL=${MEESHY_EMAIL}
      - MEESHY_SYSTEM_LANGUAGE=${MEESHY_SYSTEM_LANGUAGE}
      - MEESHY_REGIONAL_LANGUAGE=${MEESHY_REGIONAL_LANGUAGE}
      - MEESHY_CUSTOM_DESTINATION_LANGUAGE=${MEESHY_CUSTOM_DESTINATION_LANGUAGE}
      - ATABETH_PASSWORD=${ATABETH_PASSWORD}
      - ATABETH_EMAIL=${ATABETH_EMAIL}
      - ATABETH_USERNAME=${ATABETH_USERNAME:-atabeth}
      - ATABETH_FIRST_NAME=${ATABETH_FIRST_NAME:-Atabeth}
      - ATABETH_LAST_NAME=${ATABETH_LAST_NAME:-User}
      - ATABETH_ROLE=${ATABETH_ROLE:-user}
      - ATABETH_SYSTEM_LANGUAGE=${ATABETH_SYSTEM_LANGUAGE}
      - ATABETH_REGIONAL_LANGUAGE=${ATABETH_REGIONAL_LANGUAGE}
      - ATABETH_CUSTOM_DESTINATION_LANGUAGE=${ATABETH_CUSTOM_DESTINATION_LANGUAGE}
      - SESSION_EXPIRY_MOBILE_DAYS=${SESSION_EXPIRY_MOBILE_DAYS:-365}
      - SESSION_EXPIRY_DESKTOP_DAYS=${SESSION_EXPIRY_DESKTOP_DAYS:-30}
      - SESSION_EXPIRY_TRUSTED_DAYS=${SESSION_EXPIRY_TRUSTED_DAYS:-365}
      - MAX_SESSIONS_PER_USER=${MAX_SESSIONS_PER_USER:-10}
      - BRAND_LOGO_URL=${BRAND_LOGO_URL:-}
      - FIREBASE_ADMIN_CREDENTIALS_PATH=/app/secrets/firebase-admin-sdk.json
    volumes:
      - gateway_staging_uploads:/app/uploads
      - ./secrets/firebase-admin-sdk.json:/app/secrets/firebase-admin-sdk.json:ro
    depends_on:
      mongo-init-staging:
        condition: service_completed_successfully
      redis-staging:
        condition: service_healthy
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.gateway-staging.rule=Host(`gate.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.gateway-staging.entrypoints=websecure"
      - "traefik.http.routers.gateway-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.gateway-staging.loadbalancer.server.port=3000"

  # ===========================================================================
  # STATIC FILES STAGING - Nginx
  # ===========================================================================
  static-files-staging:
    image: nginx:alpine
    container_name: meeshy-static-files-staging
    restart: unless-stopped
    volumes:
      - frontend_staging_uploads:/usr/share/nginx/html/u:ro
      - ./config/nginx/static-files.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.static-staging.rule=Host(`static.staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.static-staging.entrypoints=websecure"
      - "traefik.http.routers.static-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.static-staging.loadbalancer.server.port=80"

  # ===========================================================================
  # FRONTEND STAGING - Next.js
  # ===========================================================================
  frontend-staging:
    image: ${FRONTEND_IMAGE:-isopen/meeshy-web:latest}
    container_name: meeshy-web-staging
    restart: unless-stopped
    environment:
      - NEXT_PUBLIC_API_URL=https://gate.staging.${DOMAIN:-meeshy.me}
      - NEXT_PUBLIC_WS_URL=wss://gate.staging.${DOMAIN:-meeshy.me}
      - NEXT_PUBLIC_TRANSLATION_URL=https://ml.staging.${DOMAIN:-meeshy.me}/translate
      - NEXT_PUBLIC_BACKEND_URL=https://gate.staging.${DOMAIN:-meeshy.me}
      - INTERNAL_BACKEND_URL=http://gateway-staging:3000
      - NEXT_PUBLIC_FRONTEND_URL=https://staging.${DOMAIN:-meeshy.me}
      - NEXT_PUBLIC_STATIC_URL=https://static.staging.${DOMAIN:-meeshy.me}
      - NEXT_PUBLIC_DISABLE_CLIENT_TRANSLATION=true
      - NEXT_PUBLIC_USE_API_TRANSLATION_ONLY=true
      - NEXT_PUBLIC_DEBUG_LOGS=false
      - NEXT_PUBLIC_ENABLE_PASSWORD_RESET=true
      - NODE_ENV=staging
    volumes:
      - frontend_staging_uploads:/app/public/u
    depends_on:
      gateway-staging:
        condition: service_healthy
    networks:
      - meeshy-staging-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://0.0.0.0:3100"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend-staging.rule=Host(`staging.${DOMAIN:-meeshy.me}`)"
      - "traefik.http.routers.frontend-staging.entrypoints=websecure"
      - "traefik.http.routers.frontend-staging.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend-staging.loadbalancer.server.port=3100"
      - "traefik.http.routers.frontend-staging.priority=1"

# =============================================================================
# VOLUMES - Tous préfixés "staging_" pour isolation
# =============================================================================
volumes:
  database_staging_data:
    name: meeshy-staging-database-data
  database_staging_config:
    name: meeshy-staging-database-config
  redis_staging_data:
    name: meeshy-staging-redis-data
  redis_staging_ui_data:
    name: meeshy-staging-redis-ui-data
  traefik_staging_certs:
    name: meeshy-staging-traefik-certs
  models_staging_data:
    name: meeshy-staging-models-data
  gateway_staging_uploads:
    name: meeshy-staging-gateway-uploads
  frontend_staging_uploads:
    name: meeshy-staging-web-uploads

# =============================================================================
# NETWORKS - Réseau isolé
# =============================================================================
networks:
  meeshy-staging-network:
    driver: bridge
    name: meeshy-staging-network
```

**Step 2: Créer le template .env.staging**

```bash
# infrastructure/docker/compose/.env.staging.template
# =============================================================================
# MEESHY STAGING - Variables d'environnement
# =============================================================================

# Domaine
DOMAIN=meeshy.me

# Database
DATABASE_TYPE=MONGODB
DATABASE_IMAGE=mongo:8.0
MONGODB_DATABASE=meeshy
MONGODB_USER=meeshy
MONGODB_PASSWORD=CHANGE_ME_STAGING

# Images Docker
GATEWAY_IMAGE=isopen/meeshy-gateway:latest
TRANSLATOR_IMAGE=isopen/meeshy-translator:latest
FRONTEND_IMAGE=isopen/meeshy-web:latest

# SSL/TLS
CERTBOT_EMAIL=admin@meeshy.me

# Auth pour interfaces Web
TRAEFIK_USERS=admin:$$apr1$$...
MONGO_USERS=admin:$$apr1$$...
REDIS_USERS=admin:$$apr1$$...

# JWT
JWT_SECRET=CHANGE_ME_STAGING_JWT_SECRET
JWT_EXPIRES_IN=7d

# Utilisateurs initiaux
FORCE_DB_RESET=false
ADMIN_PASSWORD=CHANGE_ME
ADMIN_EMAIL=admin@staging.meeshy.me
ADMIN_SYSTEM_LANGUAGE=en
MEESHY_PASSWORD=CHANGE_ME
MEESHY_EMAIL=meeshy@staging.meeshy.me
MEESHY_SYSTEM_LANGUAGE=en
ATABETH_PASSWORD=CHANGE_ME
ATABETH_EMAIL=atabeth@staging.meeshy.me
ATABETH_USERNAME=atabeth

# Sessions
SESSION_EXPIRY_MOBILE_DAYS=365
SESSION_EXPIRY_DESKTOP_DAYS=30
SESSION_EXPIRY_TRUSTED_DAYS=365
MAX_SESSIONS_PER_USER=10

# TTS
ENABLE_DIARIZATION=true
TTS_MAX_NEW_TOKENS=2048
TTS_MAX_SEGMENT_CHARS=1000
TTS_MIN_SEGMENT_CHARS=50
```

**Step 3: Commit**

```bash
git add infrastructure/docker/compose/docker-compose.staging.yml
git add infrastructure/docker/compose/.env.staging.template
git commit -m "feat(infra): configuration Docker Compose staging isolée"
```

---

### Task 1.2: Scripts de Déploiement Staging

**Objectif:** Automatiser le déploiement de l'environnement staging sur le serveur.

**Files:**
- Create: `infrastructure/scripts/deploy-staging.sh`
- Create: `infrastructure/scripts/teardown-staging.sh`

**Step 1: Créer le script de déploiement staging**

```bash
#!/bin/bash
# infrastructure/scripts/deploy-staging.sh
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

echo "🚀 Déploiement de l'environnement STAGING..."

# 1. Créer la structure sur le serveur
echo "📁 Création de la structure staging..."
ssh $REMOTE_HOST "mkdir -p $STAGING_DIR/{config/nginx,secrets}"

# 2. Copier docker-compose.staging.yml
echo "📋 Copie docker-compose.staging.yml..."
scp infrastructure/docker/compose/docker-compose.staging.yml \
    $REMOTE_HOST:$STAGING_DIR/docker-compose.yml

# 3. Copier .env (si .env.staging existe localement, sinon template)
if [ -f "infrastructure/docker/compose/.env.staging" ]; then
    echo "📋 Copie .env.staging..."
    scp infrastructure/docker/compose/.env.staging \
        $REMOTE_HOST:$STAGING_DIR/.env
else
    echo "⚠️  Pas de .env.staging trouvé, copie du template..."
    scp infrastructure/docker/compose/.env.staging.template \
        $REMOTE_HOST:$STAGING_DIR/.env
    echo "⚠️  ATTENTION: Éditer $STAGING_DIR/.env sur le serveur avant de lancer!"
    read -p "Appuyez sur Entrée après avoir édité .env sur le serveur..."
fi

# 4. Copier les configs
echo "📋 Copie des configurations..."
ssh $REMOTE_HOST "test -f /opt/meeshy/config/dynamic.yaml && cp /opt/meeshy/config/dynamic.yaml $STAGING_DIR/config/ || echo 'Pas de dynamic.yaml à copier'"
ssh $REMOTE_HOST "test -f /opt/meeshy/config/nginx/static-files.conf && cp /opt/meeshy/config/nginx/static-files.conf $STAGING_DIR/config/nginx/ || echo 'Pas de static-files.conf à copier'"

# 5. Copier les secrets
echo "🔐 Copie des secrets..."
ssh $REMOTE_HOST "test -f /opt/meeshy/secrets/firebase-admin-sdk.json && cp /opt/meeshy/secrets/firebase-admin-sdk.json $STAGING_DIR/secrets/ || echo 'Pas de firebase credentials à copier'"

# 6. Pull des images Docker
echo "🐋 Pull des images Docker staging..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose pull"

# 7. Lancer les services
echo "▶️  Démarrage des services staging..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose up -d"

# 8. Attendre que les services soient healthy
echo "⏳ Attente du démarrage des services (60s)..."
sleep 60

# 9. Vérifier l'état
echo "✅ Vérification de l'état des services..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose ps"

echo ""
echo "✅ Staging déployé avec succès!"
echo ""
echo "🌐 URLs disponibles:"
echo "   - Frontend:  https://staging.meeshy.me"
echo "   - Gateway:   https://gate.staging.meeshy.me"
echo "   - ML:        https://ml.staging.meeshy.me"
echo "   - MongoDB:   https://mongo.staging.meeshy.me"
echo "   - Redis:     https://redis.staging.meeshy.me"
echo "   - Traefik:   https://traefik.staging.meeshy.me"
echo ""
echo "⚠️  Note: Les certificats SSL peuvent prendre quelques minutes"
```

**Step 2: Créer le script de destruction staging**

```bash
#!/bin/bash
# infrastructure/scripts/teardown-staging.sh
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

echo "🗑️  Suppression de l'environnement STAGING..."

read -p "⚠️  Êtes-vous sûr de vouloir supprimer staging? (oui/non): " confirm
if [ "$confirm" != "oui" ]; then
    echo "Annulé."
    exit 1
fi

# 1. Arrêter les services
echo "🛑 Arrêt des services staging..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose down -v" || echo "Services déjà arrêtés"

# 2. Supprimer les volumes
echo "🗑️  Suppression des volumes staging..."
ssh $REMOTE_HOST "docker volume rm \
    meeshy-staging-database-data \
    meeshy-staging-database-config \
    meeshy-staging-redis-data \
    meeshy-staging-redis-ui-data \
    meeshy-staging-traefik-certs \
    meeshy-staging-models-data \
    meeshy-staging-gateway-uploads \
    meeshy-staging-web-uploads \
    2>/dev/null || echo 'Certains volumes n'\''existent pas'"

# 3. Supprimer le réseau
echo "🗑️  Suppression du réseau staging..."
ssh $REMOTE_HOST "docker network rm meeshy-staging-network 2>/dev/null || echo 'Réseau déjà supprimé'"

# 4. Supprimer les fichiers (optionnel)
read -p "Supprimer aussi les fichiers de configuration? (oui/non): " delete_files
if [ "$delete_files" = "oui" ]; then
    echo "🗑️  Suppression des fichiers..."
    ssh $REMOTE_HOST "rm -rf $STAGING_DIR"
fi

echo "✅ Staging supprimé avec succès!"
```

**Step 3: Rendre les scripts exécutables**

```bash
chmod +x infrastructure/scripts/deploy-staging.sh
chmod +x infrastructure/scripts/teardown-staging.sh
```

**Step 4: Commit**

```bash
git add infrastructure/scripts/deploy-staging.sh infrastructure/scripts/teardown-staging.sh
git commit -m "feat(infra): scripts de déploiement/destruction staging"
```

---

## Phase 2: Backend Prisma + Migration (Parallélisable avec Phase 1)

### Task 2.1: Créer le Service Backend Prisma

**Objectif:** Créer un nouveau service backend Node.js/TypeScript avec Prisma client.

**Files:**
- Create: `services/backend/package.json`
- Create: `services/backend/tsconfig.json`
- Create: `services/backend/src/index.ts`
- Create: `services/backend/prisma/schema.prisma` (symlink vers shared)
- Create: `services/backend/.env.example`
- Create: `services/backend/Dockerfile`

**Step 1: Créer la structure du service**

```bash
mkdir -p services/backend/src/{models,services,routes,migrations}
mkdir -p services/backend/prisma
```

**Step 2: Créer package.json**

```json
{
  "name": "@meeshy/backend",
  "version": "1.0.0",
  "description": "Meeshy Backend API with Prisma",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push",
    "prisma:studio": "prisma studio",
    "migrate:from-legacy": "tsx src/migrations/migrate-from-legacy.ts",
    "migrate:dry-run": "tsx src/migrations/migrate-from-legacy.ts --dry-run",
    "test": "vitest"
  },
  "dependencies": {
    "@prisma/client": "^6.2.0",
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.1",
    "@fastify/env": "^5.0.2",
    "mongodb": "^6.12.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "prisma": "^6.2.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

**Step 3: Créer tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Créer le symlink vers schema.prisma**

```bash
cd services/backend/prisma
ln -s ../../../packages/shared/prisma/schema.prisma schema.prisma
cd ../../..
```

**Step 5: Créer .env.example**

```bash
# services/backend/.env.example
DATABASE_URL="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"
LEGACY_DATABASE_URL="mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true"
NODE_ENV=development
PORT=4000
```

**Step 6: Créer index.ts de base**

```typescript
// services/backend/src/index.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const fastify = Fastify({ logger: true })

// CORS
fastify.register(cors, {
  origin: true,
  credentials: true,
})

// Health check
fastify.get('/health', async () => {
  try {
    await prisma.$connect()
    return { status: 'ok', database: 'connected' }
  } catch (error) {
    return { status: 'error', database: 'disconnected', error }
  }
})

// Users endpoint (example)
fastify.get('/api/users', async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
    },
    take: 50,
  })
  return { users, count: users.length }
})

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10)
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`✅ Backend Prisma démarré sur http://0.0.0.0:${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
```

**Step 7: Créer Dockerfile**

```dockerfile
# services/backend/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copier shared schema
COPY packages/shared/prisma/schema.prisma /app/schema.prisma

# Copier package files
COPY services/backend/package*.json ./
RUN npm ci

# Copier le code
COPY services/backend/tsconfig.json ./
COPY services/backend/src ./src

# Générer Prisma Client
RUN npx prisma generate --schema=/app/schema.prisma

# Build
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/schema.prisma ./schema.prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
```

**Step 8: Installer les dépendances et générer Prisma**

```bash
cd services/backend
npm install
npx prisma generate --schema=../../packages/shared/prisma/schema.prisma
cd ../..
```

**Step 9: Commit**

```bash
git add services/backend/
git commit -m "feat(backend): nouveau service Prisma avec API basique"
```

---

### Task 2.2: Script de Migration des Données

**Objectif:** Créer un script robuste pour migrer les données de l'ancienne structure vers Prisma.

**Files:**
- Create: `services/backend/src/migrations/migrate-from-legacy.ts`
- Create: `services/backend/src/migrations/utils.ts`
- Create: `services/backend/src/migrations/validators.ts`

**Step 1: Créer les utilitaires de migration**

```typescript
// services/backend/src/migrations/utils.ts
import { MongoClient } from 'mongodb'

export interface MigrationStats {
  collection: string
  total: number
  migrated: number
  failed: number
  skipped: number
  errors: Array<{ id: string; error: string }>
}

export class MigrationLogger {
  private stats = new Map<string, MigrationStats>()

  initCollection(collection: string, total: number) {
    this.stats.set(collection, {
      collection,
      total,
      migrated: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    })
  }

  recordSuccess(collection: string) {
    const stat = this.stats.get(collection)
    if (stat) stat.migrated++
  }

  recordFailure(collection: string, id: string, error: string) {
    const stat = this.stats.get(collection)
    if (stat) {
      stat.failed++
      stat.errors.push({ id, error })
    }
  }

  recordSkip(collection: string) {
    const stat = this.stats.get(collection)
    if (stat) stat.skipped++
  }

  printSummary() {
    console.log('\n' + '='.repeat(80))
    console.log('MIGRATION SUMMARY')
    console.log('='.repeat(80))

    let totalMigrated = 0
    let totalFailed = 0
    let totalSkipped = 0

    for (const [collection, stat] of this.stats.entries()) {
      console.log(`\n📦 ${collection}:`)
      console.log(`   Total:    ${stat.total}`)
      console.log(`   ✅ Migré:  ${stat.migrated}`)
      console.log(`   ⏭️  Ignoré: ${stat.skipped}`)
      console.log(`   ❌ Échec:  ${stat.failed}`)

      if (stat.errors.length > 0) {
        console.log(`   Erreurs:`)
        stat.errors.slice(0, 5).forEach(({ id, error }) => {
          console.log(`     - ${id}: ${error}`)
        })
        if (stat.errors.length > 5) {
          console.log(`     ... et ${stat.errors.length - 5} autres`)
        }
      }

      totalMigrated += stat.migrated
      totalFailed += stat.failed
      totalSkipped += stat.skipped
    }

    console.log('\n' + '='.repeat(80))
    console.log(`TOTAL: ${totalMigrated} migrés, ${totalSkipped} ignorés, ${totalFailed} échecs`)
    console.log('='.repeat(80) + '\n')

    return totalFailed === 0
  }

  getStats() {
    return Array.from(this.stats.values())
  }
}

export async function connectToLegacyDB(url: string): Promise<MongoClient> {
  const client = new MongoClient(url)
  await client.connect()
  console.log('✅ Connecté à la base legacy')
  return client
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
```

**Step 2: Créer les validateurs**

```typescript
// services/backend/src/migrations/validators.ts
import { z } from 'zod'

export const LegacyUserSchema = z.object({
  _id: z.any(),
  username: z.string(),
  firstName: z.string().optional().default(''),
  lastName: z.string().optional().default(''),
  email: z.string().email(),
  password: z.string(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST']).optional().default('USER'),
  isActive: z.boolean().optional().default(true),
  systemLanguage: z.string().optional().default('en'),
  // ... autres champs selon votre structure actuelle
})

export const LegacyMessageSchema = z.object({
  _id: z.any(),
  content: z.string(),
  senderId: z.string(),
  conversationId: z.string().optional(),
  communityId: z.string().optional(),
  createdAt: z.date().or(z.string()),
  // ... autres champs
})

export const LegacyCommunitySchema = z.object({
  _id: z.any(),
  name: z.string(),
  description: z.string().optional(),
  createdById: z.string(),
  createdAt: z.date().or(z.string()),
  // ... autres champs
})

export type LegacyUser = z.infer<typeof LegacyUserSchema>
export type LegacyMessage = z.infer<typeof LegacyMessageSchema>
export type LegacyCommunity = z.infer<typeof LegacyCommunitySchema>
```

**Step 3: Créer le script principal de migration**

```typescript
// services/backend/src/migrations/migrate-from-legacy.ts
import { PrismaClient } from '@prisma/client'
import { MongoClient } from 'mongodb'
import {
  MigrationLogger,
  connectToLegacyDB,
  chunkArray,
  type MigrationStats,
} from './utils'
import {
  LegacyUserSchema,
  LegacyMessageSchema,
  LegacyCommunitySchema,
  type LegacyUser,
  type LegacyMessage,
  type LegacyCommunity,
} from './validators'

const BATCH_SIZE = 100
const DRY_RUN = process.argv.includes('--dry-run')

const prisma = new PrismaClient()
const logger = new MigrationLogger()

async function migrateUsers(legacyDB: MongoClient) {
  console.log('\n🔄 Migration des Users...')

  const legacyUsers = await legacyDB
    .db('meeshy')
    .collection('User')
    .find({})
    .toArray()

  logger.initCollection('User', legacyUsers.length)
  console.log(`   Trouvé ${legacyUsers.length} utilisateurs`)

  if (DRY_RUN) {
    console.log('   [DRY-RUN] Aucune donnée écrite')
    logger.recordSkip('User')
    return
  }

  const chunks = chunkArray(legacyUsers, BATCH_SIZE)

  for (const [index, chunk] of chunks.entries()) {
    console.log(`   Batch ${index + 1}/${chunks.length}...`)

    for (const legacyUser of chunk) {
      try {
        // Valider le schéma
        const validated = LegacyUserSchema.parse(legacyUser)

        // Créer l'utilisateur avec Prisma
        await prisma.user.create({
          data: {
            id: validated._id.toString(),
            username: validated.username,
            firstName: validated.firstName || '',
            lastName: validated.lastName || '',
            email: validated.email,
            password: validated.password,
            role: validated.role,
            isActive: validated.isActive,
            systemLanguage: validated.systemLanguage,
            // Mapper tous les autres champs selon schema.prisma
          },
        })

        logger.recordSuccess('User')
      } catch (error: any) {
        logger.recordFailure('User', legacyUser._id.toString(), error.message)
      }
    }
  }

  console.log(`   ✅ Migration Users terminée`)
}

async function migrateCommunities(legacyDB: MongoClient) {
  console.log('\n🔄 Migration des Communities...')

  const legacyCommunities = await legacyDB
    .db('meeshy')
    .collection('Community')
    .find({})
    .toArray()

  logger.initCollection('Community', legacyCommunities.length)
  console.log(`   Trouvé ${legacyCommunities.length} communautés`)

  if (DRY_RUN) {
    console.log('   [DRY-RUN] Aucune donnée écrite')
    logger.recordSkip('Community')
    return
  }

  for (const legacyCommunity of legacyCommunities) {
    try {
      const validated = LegacyCommunitySchema.parse(legacyCommunity)

      await prisma.community.create({
        data: {
          id: validated._id.toString(),
          name: validated.name,
          description: validated.description,
          createdById: validated.createdById,
          createdAt: new Date(validated.createdAt),
          // ... autres champs
        },
      })

      logger.recordSuccess('Community')
    } catch (error: any) {
      logger.recordFailure('Community', legacyCommunity._id.toString(), error.message)
    }
  }

  console.log(`   ✅ Migration Communities terminée`)
}

async function migrateMessages(legacyDB: MongoClient) {
  console.log('\n🔄 Migration des Messages...')

  const legacyMessages = await legacyDB
    .db('meeshy')
    .collection('Message')
    .find({})
    .toArray()

  logger.initCollection('Message', legacyMessages.length)
  console.log(`   Trouvé ${legacyMessages.length} messages`)

  if (DRY_RUN) {
    console.log('   [DRY-RUN] Aucune donnée écrite')
    logger.recordSkip('Message')
    return
  }

  const chunks = chunkArray(legacyMessages, BATCH_SIZE)

  for (const [index, chunk] of chunks.entries()) {
    console.log(`   Batch ${index + 1}/${chunks.length}...`)

    for (const legacyMessage of chunk) {
      try {
        const validated = LegacyMessageSchema.parse(legacyMessage)

        await prisma.message.create({
          data: {
            id: validated._id.toString(),
            content: validated.content,
            senderId: validated.senderId,
            conversationId: validated.conversationId,
            communityId: validated.communityId,
            createdAt: new Date(validated.createdAt),
            // ... autres champs
          },
        })

        logger.recordSuccess('Message')
      } catch (error: any) {
        logger.recordFailure('Message', legacyMessage._id.toString(), error.message)
      }
    }
  }

  console.log(`   ✅ Migration Messages terminée`)
}

// Fonction principale
async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('MIGRATION LEGACY → PRISMA')
  console.log('='.repeat(80))

  if (DRY_RUN) {
    console.log('\n⚠️  MODE DRY-RUN: Aucune donnée ne sera modifiée\n')
  }

  const legacyURL = process.env.LEGACY_DATABASE_URL || process.env.DATABASE_URL
  if (!legacyURL) {
    throw new Error('LEGACY_DATABASE_URL ou DATABASE_URL doit être défini')
  }

  // Connexion aux bases
  const legacyDB = await connectToLegacyDB(legacyURL!)
  await prisma.$connect()
  console.log('✅ Connecté à Prisma')

  try {
    // Ordre de migration important (dépendances)
    await migrateUsers(legacyDB)
    await migrateCommunities(legacyDB)
    await migrateMessages(legacyDB)
    // Ajouter les autres collections...

    // Afficher le résumé
    const success = logger.printSummary()

    if (!success) {
      console.error('❌ Migration terminée avec des erreurs')
      process.exit(1)
    }

    console.log('✅ Migration terminée avec succès!')
  } catch (error) {
    console.error('❌ Erreur fatale lors de la migration:', error)
    throw error
  } finally {
    await legacyDB.close()
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

**Step 4: Commit**

```bash
git add services/backend/src/migrations/
git commit -m "feat(backend): script de migration MongoDB legacy vers Prisma"
```

---

## Phase 3: Tests & Validation Staging

### Task 3.1: Migrer les Données vers Staging

**Objectif:** Exécuter la migration complète sur l'environnement staging.

**Files:**
- Create: `infrastructure/scripts/migrate-to-staging.sh`

**Step 1: Créer le script de migration vers staging**

```bash
#!/bin/bash
# infrastructure/scripts/migrate-to-staging.sh
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
PROD_DIR="/opt/meeshy/production"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Migration des données PRODUCTION → STAGING"
echo ""

# 1. Backup de production
echo "💾 Backup de la base production..."
./infrastructure/scripts/backup-mongodb.sh "pre-migration-$(date +%Y%m%d-%H%M%S)"

BACKUP_PATH=$(cat .last-backup-path)
echo "✅ Backup créé: $BACKUP_PATH"

# 2. Restaurer dans staging
echo ""
echo "📥 Restauration dans MongoDB staging..."
ssh $REMOTE_HOST "docker exec meeshy-database-staging mongorestore \
  --host=localhost:27017 \
  --db=meeshy \
  --drop \
  --archive=/opt/meeshy/backups/$(basename $BACKUP_PATH) \
  --gzip"

echo "✅ Données restaurées dans staging"

# 3. Vérifier les données
echo ""
echo "🔍 Vérification des données staging..."
ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy --quiet --eval '
  print(\"Users: \" + db.User.countDocuments());
  print(\"Communities: \" + db.Community.countDocuments());
  print(\"Messages: \" + db.Message.countDocuments());
'"

# 4. Exécuter la migration Prisma (dry-run d'abord)
echo ""
echo "🧪 Test de migration (dry-run)..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway-staging npm run migrate:dry-run"

read -p "Dry-run OK? Continuer avec la vraie migration? (oui/non): " confirm
if [ "$confirm" != "oui" ]; then
    echo "Migration annulée."
    exit 1
fi

# 5. Migration réelle
echo ""
echo "🔄 Migration Prisma (mode réel)..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway-staging npm run migrate:from-legacy"

echo ""
echo "✅ Migration staging terminée!"
echo ""
echo "🌐 Testez l'application sur: https://staging.meeshy.me"
```

**Step 2: Rendre le script exécutable**

```bash
chmod +x infrastructure/scripts/migrate-to-staging.sh
```

**Step 3: Commit**

```bash
git add infrastructure/scripts/migrate-to-staging.sh
git commit -m "feat(infra): script de migration données vers staging"
```

---

### Task 3.2: Script de Tests de Validation

**Objectif:** Automatiser les tests de validation sur l'environnement staging.

**Files:**
- Create: `infrastructure/scripts/validate-staging.sh`

**Step 1: Créer le script de validation**

```bash
#!/bin/bash
# infrastructure/scripts/validate-staging.sh
set -euo pipefail

STAGING_URL="https://staging.meeshy.me"
STAGING_API="https://gate.staging.meeshy.me"
STAGING_ML="https://ml.staging.meeshy.me"

echo "🧪 Validation de l'environnement STAGING"
echo ""

FAILED=0

# Helper function
check_endpoint() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"

  echo -n "   Checking $name... "

  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")

  if [ "$response" -eq "$expected_code" ]; then
    echo "✅ ($response)"
  else
    echo "❌ ($response, attendu $expected_code)"
    FAILED=$((FAILED + 1))
  fi
}

# 1. Tests de santé des services
echo "📡 Tests de santé des services:"
check_endpoint "Frontend" "$STAGING_URL"
check_endpoint "Gateway API" "$STAGING_API/health"
check_endpoint "ML Service" "$STAGING_ML/health"

# 2. Tests de la base de données
echo ""
echo "🗄️  Tests de la base de données:"

USER_COUNT=$(ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --quiet --eval 'db.User.countDocuments()'" 2>/dev/null || echo "0")
MESSAGE_COUNT=$(ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --quiet --eval 'db.Message.countDocuments()'" 2>/dev/null || echo "0")
COMMUNITY_COUNT=$(ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --quiet --eval 'db.Community.countDocuments()'" 2>/dev/null || echo "0")

echo "   Users: $USER_COUNT"
echo "   Messages: $MESSAGE_COUNT"
echo "   Communities: $COMMUNITY_COUNT"

if [ "$USER_COUNT" -gt 0 ] && [ "$MESSAGE_COUNT" -gt 0 ]; then
  echo "   ✅ Données migrées"
else
  echo "   ❌ Données manquantes ou migration incomplète"
  FAILED=$((FAILED + 1))
fi

# 3. Tests API
echo ""
echo "🌐 Tests API:"

# Test auth
echo -n "   POST /api/auth/login... "
AUTH_RESPONSE=$(curl -s -X POST "$STAGING_API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}' \
  -w "%{http_code}" -o /dev/null || echo "000")

if [ "$AUTH_RESPONSE" -eq 401 ] || [ "$AUTH_RESPONSE" -eq 400 ]; then
  echo "✅ (endpoint fonctionnel)"
else
  echo "⚠️  ($AUTH_RESPONSE)"
fi

# Test users listing
check_endpoint "GET /api/users" "$STAGING_API/api/users" 200

# 4. Tests WebSocket
echo ""
echo "🔌 Tests WebSocket:"
echo "   [Manuel] Se connecter à staging.meeshy.me et tester:"
echo "   - Connexion temps réel"
echo "   - Envoi de messages"
echo "   - Notifications"

# 5. Résumé
echo ""
echo "=" * 80
if [ $FAILED -eq 0 ]; then
  echo "✅ Tous les tests automatisés sont passés!"
  echo ""
  echo "⚠️  Tests manuels restants:"
  echo "   - Se connecter à https://staging.meeshy.me"
  echo "   - Tester l'envoi de messages"
  echo "   - Tester l'upload de fichiers"
  echo "   - Tester la traduction"
  echo "   - Vérifier les communautés"
  exit 0
else
  echo "❌ $FAILED test(s) échoué(s)"
  exit 1
fi
```

**Step 2: Rendre le script exécutable**

```bash
chmod +x infrastructure/scripts/validate-staging.sh
```

**Step 3: Commit**

```bash
git add infrastructure/scripts/validate-staging.sh
git commit -m "feat(infra): script de validation automatisée staging"
```

---

## Phase 4: Switch Production (≤10 minutes)

### Task 4.1: Script de Capture d'État Pré-Switch

**Objectif:** Capturer l'état complet avant le switch pour rollback possible.

**Files:**
- Create: `infrastructure/scripts/capture-pre-switch-state.sh`

**Step 1: Créer le script de capture**

```bash
#!/bin/bash
# infrastructure/scripts/capture-pre-switch-state.sh
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
STATE_DIR="infrastructure/rollback-states/$TIMESTAMP"

mkdir -p "$STATE_DIR"

echo "📸 Capture de l'état pré-switch ($TIMESTAMP)..."

# 1. Backup MongoDB production
echo "💾 Backup MongoDB production..."
./infrastructure/scripts/backup-mongodb.sh "pre-switch-$TIMESTAMP"
BACKUP_PATH=$(cat .last-backup-path)
echo "$BACKUP_PATH" > "$STATE_DIR/backup-path.txt"

# 2. Capturer les SHA des images Docker
echo "🐋 Capture des images Docker..."
ssh $REMOTE_HOST "docker inspect meeshy-gateway --format '{{.Image}}'" > "$STATE_DIR/gateway-sha.txt"
ssh $REMOTE_HOST "docker inspect meeshy-translator --format '{{.Image}}'" > "$STATE_DIR/translator-sha.txt"
ssh $REMOTE_HOST "docker inspect meeshy-web --format '{{.Image}}'" > "$STATE_DIR/frontend-sha.txt"
ssh $REMOTE_HOST "docker inspect meeshy-database --format '{{.Image}}'" > "$STATE_DIR/database-sha.txt"

# 3. Capturer docker-compose.yml
echo "📋 Capture docker-compose.yml..."
ssh $REMOTE_HOST "cat /opt/meeshy/production/docker-compose.yml" > "$STATE_DIR/docker-compose.yml"

# 4. Capturer .env (sans secrets)
echo "📋 Capture .env (masqué)..."
ssh $REMOTE_HOST "cat /opt/meeshy/production/.env | sed 's/=.*/=***MASKED***/'" > "$STATE_DIR/env-structure.txt"

# 5. Capturer l'état des services
echo "📊 Capture état des services..."
ssh $REMOTE_HOST "cd /opt/meeshy/production && docker compose ps" > "$STATE_DIR/services-status.txt"

# 6. Sauvegarder les SHA
GATEWAY_SHA=$(cat "$STATE_DIR/gateway-sha.txt")
TRANSLATOR_SHA=$(cat "$STATE_DIR/translator-sha.txt")
FRONTEND_SHA=$(cat "$STATE_DIR/frontend-sha.txt")
DATABASE_SHA=$(cat "$STATE_DIR/database-sha.txt")

# 7. Créer le script de rollback automatique
cat > "$STATE_DIR/rollback.sh" << EOF
#!/bin/bash
# Script de rollback automatique généré le $TIMESTAMP
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
BACKUP_PATH="$BACKUP_PATH"

echo "🔄 ROLLBACK vers l'état du $TIMESTAMP"
echo ""

# 1. Arrêter les services actuels
echo "🛑 Arrêt des services actuels..."
ssh \$REMOTE_HOST "cd /opt/meeshy/production && docker compose down"

# 2. Restaurer les images Docker
echo "🐋 Restauration des images Docker..."
ssh \$REMOTE_HOST "docker pull $GATEWAY_SHA && docker tag $GATEWAY_SHA isopen/meeshy-gateway:latest"
ssh \$REMOTE_HOST "docker pull $TRANSLATOR_SHA && docker tag $TRANSLATOR_SHA isopen/meeshy-translator:latest"
ssh \$REMOTE_HOST "docker pull $FRONTEND_SHA && docker tag $FRONTEND_SHA isopen/meeshy-web:latest"

# 3. Restaurer docker-compose.yml
echo "📋 Restauration docker-compose.yml..."
scp "$STATE_DIR/docker-compose.yml" \$REMOTE_HOST:/opt/meeshy/production/docker-compose.yml

# 4. Restaurer la base de données
echo "💾 Restauration de la base de données..."
ssh \$REMOTE_HOST "docker compose -f /opt/meeshy/production/docker-compose.yml up -d database"
sleep 10
ssh \$REMOTE_HOST "docker exec meeshy-database mongorestore --db=meeshy --drop --archive=\$BACKUP_PATH --gzip"

# 5. Redémarrer tous les services
echo "▶️  Redémarrage des services..."
ssh \$REMOTE_HOST "cd /opt/meeshy/production && docker compose up -d"

echo ""
echo "✅ Rollback terminé!"
echo "🌐 Vérifier: https://meeshy.me"
EOF

chmod +x "$STATE_DIR/rollback.sh"

echo ""
echo "✅ État pré-switch capturé dans: $STATE_DIR"
echo "📝 Script de rollback disponible: $STATE_DIR/rollback.sh"
echo ""
echo "$STATE_DIR" > .last-state-dir
```

**Step 2: Rendre le script exécutable**

```bash
chmod +x infrastructure/scripts/capture-pre-switch-state.sh
```

**Step 3: Commit**

```bash
git add infrastructure/scripts/capture-pre-switch-state.sh
git commit -m "feat(infra): capture état pré-switch avec rollback automatique"
```

---

### Task 4.2: Script de Switch Production

**Objectif:** Basculer la production vers le nouveau backend en ≤10 minutes.

**Files:**
- Create: `infrastructure/scripts/switch-to-production.sh`

**Step 1: Créer le script de switch**

```bash
#!/bin/bash
# infrastructure/scripts/switch-to-production.sh
set -euo pipefail

REMOTE_HOST="root@meeshy.me"
PROD_DIR="/opt/meeshy/production"
STAGING_DIR="/opt/meeshy/staging"

echo "🚀 SWITCH VERS PRODUCTION"
echo ""
echo "⚠️  ATTENTION: Cette opération va:"
echo "   1. Arrêter la production actuelle"
echo "   2. Remplacer par la configuration staging testée"
echo "   3. Migrer les données en production"
echo ""

read -p "Continuer? (oui/non): " confirm
if [ "$confirm" != "oui" ]; then
    echo "Annulé."
    exit 1
fi

# Timer de début
START_TIME=$(date +%s)

# 1. Capture de l'état actuel pour rollback
echo ""
echo "📸 Capture de l'état actuel..."
./infrastructure/scripts/capture-pre-switch-state.sh
STATE_DIR=$(cat .last-state-dir)
echo "✅ État capturé: $STATE_DIR"

# 2. Backup final de production
echo ""
echo "💾 Backup final de production..."
./infrastructure/scripts/backup-mongodb.sh "final-before-switch-$(date +%Y%m%d-%H%M%S)"

# 3. Activer le mode maintenance (optionnel)
echo ""
echo "🚧 Activation du mode maintenance..."
# TODO: Afficher une page de maintenance si disponible

# 4. Arrêter la production
echo ""
echo "🛑 Arrêt de la production..."
ssh $REMOTE_HOST "cd $PROD_DIR && docker compose down"

# 5. Copier la config staging vers production
echo ""
echo "📋 Copie de la configuration staging validée..."
ssh $REMOTE_HOST "cp $STAGING_DIR/docker-compose.yml $PROD_DIR/docker-compose.yml"

# 6. Migrer les données delta (nouvelles depuis dernier test staging)
echo ""
echo "🔄 Migration des données delta..."
# Copier les données de prod vers le nouveau schéma
ssh $REMOTE_HOST "docker exec meeshy-database mongodump --db=meeshy --archive=/tmp/prod-delta.archive --gzip"
ssh $REMOTE_HOST "docker exec meeshy-database-staging mongorestore --db=meeshy --archive=/tmp/prod-delta.archive --gzip"

# 7. Remplacer le volume de base de données staging par prod
echo ""
echo "💾 Remplacement du volume MongoDB..."
ssh $REMOTE_HOST "docker volume rm meeshy-database-data || true"
ssh $REMOTE_HOST "docker volume create meeshy-database-data"
ssh $REMOTE_HOST "docker run --rm -v meeshy-staging-database-data:/from -v meeshy-database-data:/to alpine sh -c 'cp -av /from/. /to/'"

# 8. Mettre à jour les domaines (retirer .staging)
echo ""
echo "🌐 Mise à jour des domaines..."
ssh $REMOTE_HOST "cd $PROD_DIR && sed -i 's/staging\.//g' docker-compose.yml"
ssh $REMOTE_HOST "cd $PROD_DIR && sed -i 's/staging-//g' docker-compose.yml"
ssh $REMOTE_HOST "cd $PROD_DIR && sed -i 's/meeshy-staging/meeshy/g' docker-compose.yml"

# 9. Démarrer la nouvelle production
echo ""
echo "▶️  Démarrage de la nouvelle production..."
ssh $REMOTE_HOST "cd $PROD_DIR && docker compose up -d"

# 10. Attendre que les services soient healthy
echo ""
echo "⏳ Attente du démarrage des services..."
sleep 30

# Vérifier la santé
GATEWAY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://gate.meeshy.me/health || echo "000")
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://meeshy.me || echo "000")

if [ "$GATEWAY_HEALTH" -eq 200 ] && [ "$FRONTEND_HEALTH" -eq 200 ]; then
    echo "✅ Services healthy!"
else
    echo "❌ Services non healthy (Gateway: $GATEWAY_HEALTH, Frontend: $FRONTEND_HEALTH)"
    echo ""
    echo "🔄 ROLLBACK AUTOMATIQUE..."
    bash "$STATE_DIR/rollback.sh"
    exit 1
fi

# 11. Désactiver le mode maintenance
echo ""
echo "✅ Désactivation du mode maintenance..."

# 12. Arrêter staging (libérer les ressources)
echo ""
echo "🛑 Arrêt de staging..."
ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose down"

# Timer de fin
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=" * 80
echo "✅ SWITCH PRODUCTION TERMINÉ EN ${DURATION}s!"
echo "=" * 80
echo ""
echo "🌐 URLs:"
echo "   - Frontend:  https://meeshy.me"
echo "   - Gateway:   https://gate.meeshy.me"
echo "   - ML:        https://ml.meeshy.me"
echo ""
echo "🔍 Monitoring:"
echo "   - Logs gateway: ssh root@meeshy.me 'docker logs -f meeshy-gateway'"
echo "   - Logs database: ssh root@meeshy.me 'docker logs -f meeshy-database'"
echo ""
echo "🔄 Rollback si nécessaire:"
echo "   bash $STATE_DIR/rollback.sh"
echo ""

if [ $DURATION -gt 600 ]; then
    echo "⚠️  WARNING: Switch a pris ${DURATION}s (>10min)"
fi
```

**Step 2: Rendre le script exécutable**

```bash
chmod +x infrastructure/scripts/switch-to-production.sh
```

**Step 3: Commit**

```bash
git add infrastructure/scripts/switch-to-production.sh
git commit -m "feat(infra): script de switch production avec rollback automatique"
```

---

## Phase 5: Documentation & Checklist

### Task 5.1: Documentation du Processus

**Objectif:** Documenter le processus complet pour référence future.

**Files:**
- Create: `docs/operations/mongodb-migration-procedure.md`

**Step 1: Créer la documentation**

```markdown
# Procédure de Migration MongoDB + Staging

## Vue d'ensemble

Cette procédure décrit le processus complet de migration de la base MongoDB vers une architecture Prisma avec environnement staging de validation.

## Pré-requis

- Accès SSH root à meeshy.me
- Docker et Docker Compose installés sur le serveur
- Prisma CLI installé localement
- Backups récents de la base de données

## Architecture

### Avant Migration
```
/opt/meeshy/
├── docker-compose.yml
├── .env
├── config/
└── secrets/
```

### Après Migration
```
/opt/meeshy/
├── production/
│   ├── docker-compose.yml  (nouveau backend Prisma)
│   ├── .env
│   ├── config/
│   └── secrets/
├── staging/
│   ├── docker-compose.yml  (pour tests)
│   ├── .env
│   ├── config/
│   └── secrets/
└── backups/
```

## Étape 1: Préparation (1h)

### 1.1 Capture de l'état actuel

```bash
./infrastructure/scripts/capture-current-state.sh
```

Cela créera un snapshot complet dans `docs/infrastructure/snapshots/`.

### 1.2 Analyse de la structure MongoDB

Se connecter au serveur et analyser:

```bash
ssh root@meeshy.me
docker exec -it meeshy-database mongosh meeshy

> db.getCollectionNames()
> db.User.findOne()
> db.Message.findOne()
> db.Community.findOne()
```

Documenter toutes les collections et leur structure.

### 1.3 Backup de sécurité

```bash
./infrastructure/scripts/backup-mongodb.sh pre-migration-backup
```

## Étape 2: Déploiement Staging (30min)

### 2.1 Copier et éditer .env.staging

```bash
cp infrastructure/docker/compose/.env.staging.template infrastructure/docker/compose/.env.staging
# Éditer avec les bonnes valeurs
```

### 2.2 Déployer staging

```bash
./infrastructure/scripts/deploy-staging.sh
```

Attendre que tous les services soient healthy (~2-3 minutes).

### 2.3 Vérifier l'accès

```bash
curl https://gate.staging.meeshy.me/health
curl https://staging.meeshy.me
```

## Étape 3: Migration des Données vers Staging (30min)

### 3.1 Lancer la migration

```bash
./infrastructure/scripts/migrate-to-staging.sh
```

Ce script va:
1. Backup de prod
2. Restauration dans staging
3. Dry-run de migration Prisma
4. Migration réelle si validation OK

### 3.2 Vérifier les données

```bash
ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --eval '
  print(\"Users: \" + db.User.countDocuments());
  print(\"Messages: \" + db.Message.countDocuments());
  print(\"Communities: \" + db.Community.countDocuments());
'"
```

## Étape 4: Tests de Validation Staging (1-2h)

### 4.1 Tests automatisés

```bash
./infrastructure/scripts/validate-staging.sh
```

### 4.2 Tests manuels

Checklist:
- [ ] Se connecter à https://staging.meeshy.me
- [ ] Créer un compte test
- [ ] Envoyer des messages
- [ ] Rejoindre une communauté
- [ ] Upload un fichier
- [ ] Tester la traduction
- [ ] Vérifier les notifications temps réel
- [ ] Tester sur mobile

### 4.3 Tests de charge (optionnel)

```bash
# Utiliser Apache Bench ou k6
ab -n 1000 -c 10 https://gate.staging.meeshy.me/api/users
```

## Étape 5: Switch Production (≤10 minutes)

### 5.1 Pré-switch checklist

- [ ] Tous les tests staging sont passés
- [ ] Équipe prête pour monitoring
- [ ] Plan de communication aux utilisateurs
- [ ] Script de rollback vérifié

### 5.2 Exécution du switch

```bash
./infrastructure/scripts/switch-to-production.sh
```

**Timeline attendue:**
- 0-1min: Capture état + backup
- 1-2min: Arrêt production
- 2-4min: Migration delta
- 4-6min: Configuration
- 6-8min: Démarrage services
- 8-10min: Vérification santé

### 5.3 Post-switch monitoring

```bash
# Logs en temps réel
ssh root@meeshy.me "docker logs -f meeshy-gateway"
ssh root@meeshy.me "docker logs -f meeshy-database"

# Métriques
curl https://gate.meeshy.me/health
```

## Étape 6: Rollback (si nécessaire)

Si quelque chose ne va pas:

```bash
# Récupérer le dernier état capturé
STATE_DIR=$(cat .last-state-dir)

# Exécuter le rollback
bash $STATE_DIR/rollback.sh
```

Le rollback automatique prend ~5 minutes.

## Étape 7: Nettoyage Post-Migration

Une fois la production stable (24-48h):

### 7.1 Supprimer staging

```bash
./infrastructure/scripts/teardown-staging.sh
```

### 7.2 Archiver les backups

```bash
ssh root@meeshy.me "
  cd /opt/meeshy/backups
  tar -czf archive-$(date +%Y%m%d).tar.gz *.tar.gz
  # Copier hors serveur
"
```

### 7.3 Documentation des changements

Mettre à jour:
- `docs/architecture/database.md`
- `docs/operations/backup-procedures.md`
- `docs/api/endpoints.md` (si changements)

## Troubleshooting

### Problème: Services staging ne démarrent pas

```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs"
```

Vérifier:
- Ports déjà utilisés
- Volumes corrompus
- Erreurs de configuration

### Problème: Migration échoue

```bash
# Logs détaillés
ssh root@meeshy.me "docker logs meeshy-gateway-staging"

# Vérifier Prisma schema
cd services/backend
npx prisma validate --schema=../../packages/shared/prisma/schema.prisma
```

### Problème: Switch production dépasse 10 minutes

Si le switch est trop long:
1. Ne pas paniquer
2. Laisser terminer
3. Analyser les logs
4. Identifier le bottleneck
5. Optimiser pour la prochaine fois

### Problème: Données incohérentes après migration

```bash
# Comparer les counts
ssh root@meeshy.me "
  docker exec meeshy-database mongosh meeshy --eval 'db.User.countDocuments()'
  docker exec meeshy-database-staging mongosh meeshy --eval 'db.User.countDocuments()'
"

# Vérifier les logs de migration
ssh root@meeshy.me "docker logs meeshy-gateway-staging | grep 'migration'"
```

## Contacts d'urgence

- Développeur backend: [email]
- Admin système: [email]
- Hotline production: [numéro]

## Changelog

- 2026-01-25: Procédure initiale créée
```

**Step 2: Commit**

```bash
git add docs/operations/mongodb-migration-procedure.md
git commit -m "docs: procédure complète migration MongoDB + staging"
```

---

## Phase 6: Checklist Finale

### Task 6.1: Checklist Pré-Production

**Files:**
- Create: `docs/operations/pre-production-checklist.md`

**Step 1: Créer la checklist**

```markdown
# Checklist Pré-Production - Migration MongoDB

## Phase Préparation

### Infrastructure
- [ ] Accès SSH root@meeshy.me fonctionnel
- [ ] Docker et Docker Compose à jour sur le serveur
- [ ] Espace disque suffisant (vérifier avec `df -h`)
- [ ] Backup automatisé configuré
- [ ] Plan de rollback documenté

### Code
- [ ] Branche de migration fusionnée dans `main`
- [ ] Tests unitaires passent localement
- [ ] Backend Prisma build sans erreur
- [ ] Schema Prisma validé (`npx prisma validate`)
- [ ] Migration script testé en local

### Configuration
- [ ] `.env.staging` créé avec bonnes valeurs
- [ ] Certificats SSL configurés pour *.staging.meeshy.me
- [ ] Secrets Firebase copiés
- [ ] Variables d'environnement validées

## Phase Staging

### Déploiement
- [ ] Staging déployé avec succès
- [ ] Tous les services healthy
- [ ] Certificats SSL générés
- [ ] Domaines *.staging.meeshy.me résolvent correctement

### Migration Données
- [ ] Backup production créé
- [ ] Données restaurées dans staging
- [ ] Migration Prisma dry-run OK
- [ ] Migration réelle terminée sans erreurs
- [ ] Counts de données correspondent (User, Message, Community)

### Tests Automatisés
- [ ] Health checks passent
- [ ] Endpoints API répondent
- [ ] WebSockets connectent
- [ ] Tests de validation staging OK

### Tests Manuels
- [ ] Login/Registration fonctionnel
- [ ] Envoi de messages OK
- [ ] Communautés accessibles
- [ ] Upload fichiers OK
- [ ] Traduction ML fonctionnelle
- [ ] Notifications temps réel OK
- [ ] Test sur desktop
- [ ] Test sur mobile

### Performance
- [ ] Temps de réponse API < 500ms
- [ ] Pas de memory leaks
- [ ] Logs sans erreurs critiques
- [ ] Base de données performante

## Phase Switch Production

### Pré-Switch
- [ ] Tous les tests staging validés
- [ ] Équipe de monitoring prête
- [ ] Communication utilisateurs envoyée
- [ ] Backup final créé
- [ ] État pré-switch capturé
- [ ] Script de rollback vérifié

### Switch
- [ ] Mode maintenance activé
- [ ] Production arrêtée
- [ ] Configuration copiée
- [ ] Migration delta effectuée
- [ ] Services démarrés
- [ ] Health checks OK
- [ ] Mode maintenance désactivé

### Post-Switch
- [ ] Frontend accessible (https://meeshy.me)
- [ ] API fonctionnelle (https://gate.meeshy.me)
- [ ] Logs sans erreurs
- [ ] Métriques normales
- [ ] Tests de fumée OK
- [ ] Utilisateurs peuvent se connecter

## Phase Monitoring (24h)

### Surveillance
- [ ] Logs gateway monitored (pas d'erreurs)
- [ ] Logs database monitored (pas de crash)
- [ ] Métriques CPU/RAM normales
- [ ] Temps de réponse corrects
- [ ] Pas de plaintes utilisateurs

### Rollback (si nécessaire)
- [ ] Décision prise dans les 2h
- [ ] Script de rollback exécuté
- [ ] Services restaurés
- [ ] Données restaurées
- [ ] Post-mortem planifié

## Phase Nettoyage

### Après 48h
- [ ] Production stable
- [ ] Aucun incident majeur
- [ ] Staging peut être arrêté
- [ ] Backups archivés
- [ ] Documentation mise à jour
- [ ] Post-mortem (si problèmes)

## Signatures

**Préparation validée par:**
- [ ] Développeur backend: _____________ Date: _______
- [ ] Admin système: _____________ Date: _______

**Staging validé par:**
- [ ] QA/Tests: _____________ Date: _______
- [ ] Product Owner: _____________ Date: _______

**Production switch approuvé par:**
- [ ] CTO/Lead Dev: _____________ Date: _______
- [ ] Ops Manager: _____________ Date: _______

**Post-migration validé par:**
- [ ] Support: _____________ Date: _______
- [ ] Monitoring: _____________ Date: _______
```

**Step 2: Commit**

```bash
git add docs/operations/pre-production-checklist.md
git commit -m "docs: checklist complète pré-production migration"
```

---

## Résumé du Plan

### Ordre d'Exécution Recommandé

**Phase Préparation (parallélisable):**
1. Task 0.1 + 0.2: Audit infrastructure + Backups (1h)
2. Task 1.1 + 1.2: Docker Compose Staging + Scripts deploy (1h)
3. Task 2.1 + 2.2: Backend Prisma + Migration script (3h)

**Total Phase Préparation: ~3h (en parallèle)**

**Phase Staging:**
4. Déployer staging (30min)
5. Task 3.1: Migrer données vers staging (30min)
6. Task 3.2: Valider staging (2h)

**Total Phase Staging: ~3h**

**Phase Production:**
7. Task 4.1: Capturer état pré-switch (5min)
8. Task 4.2: Switch production (10min)
9. Monitoring post-switch (1h)

**Total Phase Production: ~1h15**

**Phase Documentation:**
10. Task 5.1 + 6.1: Documentation complète (déjà fait dans le plan)

### Durée Totale Estimée

- **Développement:** 3-4h (parallélisable)
- **Staging & Tests:** 3h
- **Switch Production:** 10min
- **Monitoring:** 1h
- **TOTAL:** ~7-8h de travail actif

### Points Critiques

1. **Backup obligatoire** avant toute opération
2. **Dry-run systématique** avant migration réelle
3. **Rollback automatique** si health checks échouent
4. **Timer strict** sur le switch production (≤10min)
5. **Isolation complète** staging/production

---

## Plan Complet Sauvegardé

Ce plan a été sauvegardé dans:
**`docs/plans/2026-01-25-mongodb-migration-staging-environment.md`**

---

## Prochaines Étapes

**Option 1: Exécution Subagent-Driven (cette session)**
Je peux lancer des agents spécialisés pour chaque task, avec revue entre chaque étape.

**Option 2: Exécution Parallèle (session séparée)**
Ouvrir une nouvelle session Claude Code dans le même répertoire et utiliser `superpowers:executing-plans`.

**Quelle approche préférez-vous?**
