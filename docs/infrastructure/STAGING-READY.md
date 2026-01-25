# 🎯 Environnement Staging - PRÊT

**Date:** 2026-01-25 23:15 UTC
**Status:** ✅ Configuration staging complète

---

## ✅ Ce Qui Est Fait

### 1. Analyse Infrastructure Actuelle

✅ **Snapshot complet capturé** (`docs/infrastructure/snapshots/20260125-223411/`)
- 9 services Docker (8/9 healthy)
- 207 utilisateurs, 4508 messages, 8 communautés
- ~125,000 documents MongoDB (~10-15 MB)
- Volumes et points de montage documentés

✅ **Analyse des écarts schema.prisma ↔ MongoDB**
- Champs manquants identifiés
- Collections non-mappées listées
- Recommandations documentées

### 2. Vérification Images Docker

✅ **Confirmé que toutes les images utilisent schema.prisma**
- Gateway: `packages/shared/prisma/schema.prisma` ✅
- Translator: `packages/shared/prisma/schema.prisma` ✅
- Frontend: Package shared ✅

✅ **Build via Makefile**
- `make docker-build` fonctionnel
- Images buildables localement
- Prisma client généré automatiquement

### 3. Configuration Staging Complète

✅ **docker-compose.staging.yml**
- Ports alternatifs (8080/8443, 27018, 6380)
- Domaines `*.staging.meeshy.me`
- Volumes isolés avec préfixe `staging_`
- Réseau dédié `meeshy-staging-network`
- Configuration identique à prod mais séparée

✅ **.env.staging.template**
- Toutes variables documentées
- Instructions de remplissage
- Valeurs à changer clairement marquées

✅ **Scripts de gestion**
- `deploy-staging.sh`: Déploiement automatisé
- `teardown-staging.sh`: Destruction sécurisée
- Vérifications et confirmations intégrées

### 4. Documentation

✅ **Guides complets créés**
- `current-state-analysis.md`: Analyse infra actuelle
- `docker-images-verification.md`: Vérification Prisma
- `mongodb-migration-procedure.md`: Procédure complète
- `STAGING-READY.md`: Ce document

---

## 🚀 Déploiement Staging (PRÊT)

### Étape 1: Préparer .env.staging

```bash
# Copier le template
cp infrastructure/docker/compose/.env.staging.template \
   infrastructure/docker/compose/.env.staging

# Éditer et remplir les valeurs
nano infrastructure/docker/compose/.env.staging
```

**Variables critiques à remplir:**
- `MONGODB_PASSWORD`: Mot de passe MongoDB staging
- `JWT_SECRET`: Secret JWT (générer avec `openssl rand -base64 32`)
- `TRAEFIK_USERS`, `MONGO_USERS`, `REDIS_USERS`: Basic Auth
- `ADMIN_PASSWORD`, `MEESHY_PASSWORD`, `ATABETH_PASSWORD`: Users initiaux

### Étape 2: Déployer Staging

```bash
./infrastructure/scripts/deploy-staging.sh
```

**Ce que le script fait:**
1. ✅ Vérifications pré-déploiement
2. ✅ Création structure `/opt/meeshy/staging/`
3. ✅ Copie configurations (docker-compose, .env, secrets)
4. ✅ Pull images Docker
5. ✅ Création volumes staging
6. ✅ Copie optionnelle modèles ML (~5GB)
7. ✅ Démarrage services
8. ✅ Tests health checks

**Durée estimée:** 10-15 minutes (incluant copie ML)

### Étape 3: Vérifier Staging

**URLs disponibles:**
- Frontend: `https://staging.meeshy.me`
- Gateway: `https://gate.staging.meeshy.me`
- ML Service: `https://ml.staging.meeshy.me`
- MongoDB UI: `https://mongo.staging.meeshy.me`
- Redis UI: `https://redis.staging.meeshy.me`
- Traefik: `https://traefik.staging.meeshy.me`

**Logs en temps réel:**
```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs -f"
```

---

## 📋 Ce Qui Reste À Faire

### 1. Script de Migration de Données ⏳

**À créer:** `services/backend/src/migrations/migrate-from-legacy.ts`

**Objectif:**
- Lire anciennes collections MongoDB
- Mapper vers nouveau schema.prisma
- Transformer les données (champs, types, relations)
- Valider l'intégrité
- Logs détaillés + rapport

**Collections prioritaires:**
- User (207 docs)
- Message (4508 docs)
- Community (8 docs)
- Conversation (152 docs)
- ConversationMember (616 docs)
- MessageAttachment (703 docs)
- Reaction (1365 docs)

**Champs à mapper/transformer:**
```typescript
// Ancienne structure → Nouvelle structure
{
  // Existants à copier directement
  username, firstName, lastName, email, password, role, isActive,
  systemLanguage, regionalLanguage, customDestinationLanguage,

  // À ajouter (valeurs par défaut)
  lastSeen: lastActiveAt,  // Mapper
  autoTranslateEnabled: true,  // Défaut
  phoneCountryCode: null,  // Défaut
  timezone: null,  // Défaut
  blockedUserIds: [],  // Défaut

  // Sécurité (nouveaux champs absents)
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  twoFactorSecret: null,
  // etc.
}
```

### 2. Script Migration vers Staging ⏳

**À créer:** `infrastructure/scripts/migrate-to-staging.sh`

**Process:**
1. Backup production
2. Restaurer backup dans staging
3. Exécuter migration Prisma (dry-run)
4. Migration réelle si OK
5. Validation intégrité

**Durée estimée:** 5-10 minutes

### 3. Script de Validation ⏳

**À créer:** `infrastructure/scripts/validate-staging.sh`

**Tests automatisés:**
- Health checks endpoints
- Counts de données (User, Message, Community)
- Tests API basiques
- WebSockets
- Uploads

### 4. Scripts de Backup/Rollback ✅ (Partiellement fait)

**Existants:**
- `backup-mongodb.sh` ✅
- `restore-mongodb.sh` ✅

**À créer:**
- `capture-pre-switch-state.sh` ⏳
- `switch-to-production.sh` ⏳

---

## 🎯 Plan d'Exécution Recommandé

### Phase 1: Migration Staging (2-3h)

1. **Déployer staging** (`deploy-staging.sh`) - 15 min
2. **Créer script de migration** - 2h
3. **Migrer données vers staging** - 10 min
4. **Valider staging** - 30 min

### Phase 2: Tests Staging (1-2h)

1. Tests automatisés
2. Tests manuels (UI, WebSocket, uploads, traduction)
3. Tests de charge (optionnel)
4. Corrections si nécessaire

### Phase 3: Switch Production (≤10 min)

1. Capture état pre-switch
2. Backup final production
3. Migration delta (nouvelles données depuis tests staging)
4. Switch atomique
5. Vérification
6. Monitoring

---

## 📦 Artefacts Créés

### Configuration
- `infrastructure/docker/compose/docker-compose.staging.yml`
- `infrastructure/docker/compose/.env.staging.template`

### Scripts
- `infrastructure/scripts/capture-current-state.sh` ✅
- `infrastructure/scripts/backup-mongodb.sh` ✅
- `infrastructure/scripts/restore-mongodb.sh` ✅
- `infrastructure/scripts/deploy-staging.sh` ✅
- `infrastructure/scripts/teardown-staging.sh` ✅

### Documentation
- `docs/infrastructure/current-state-analysis.md`
- `docs/infrastructure/docker-images-verification.md`
- `docs/operations/mongodb-migration-procedure.md`
- `docs/plans/2026-01-25-mongodb-migration-staging-environment.md`

### Snapshots
- `docs/infrastructure/snapshots/20260125-223411/` (état actuel)

---

## ⚡ Commandes Rapides

```bash
# Déployer staging
./infrastructure/scripts/deploy-staging.sh

# Logs staging
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs -f"

# Status staging
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose ps"

# Détruire staging
./infrastructure/scripts/teardown-staging.sh

# Backup MongoDB prod
./infrastructure/scripts/backup-mongodb.sh pre-migration

# Restaurer backup
./infrastructure/scripts/restore-mongodb.sh <backup-path>
```

---

## 🎉 Résumé

✅ **Infrastructure analysée** - État actuel documenté
✅ **Images Docker vérifiées** - Schema Prisma confirmé
✅ **Staging configuré** - Prêt à déployer
✅ **Scripts créés** - Automatisation complète
✅ **Documentation complète** - Guides et procédures

⏳ **Reste à faire:**
- Script de migration des données
- Migration prod → staging
- Tests et validation
- Scripts de switch production

**Prochaine étape suggérée:**
1. Déployer staging: `./infrastructure/scripts/deploy-staging.sh`
2. Créer le script de migration de données
3. Tester la migration sur staging

---

**Dernière mise à jour:** 2026-01-25 23:15 UTC
