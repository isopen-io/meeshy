# 🚀 Guide Complet de Migration MongoDB → Prisma

**Date:** 2026-01-25
**Version:** 1.0
**Durée estimée:** 3-4 heures (incluant tests staging)
**Downtime production:** ≤10 minutes

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Phase 1: Déploiement Staging](#phase-1-déploiement-staging)
4. [Phase 2: Migration des Données](#phase-2-migration-des-données)
5. [Phase 3: Tests Staging](#phase-3-tests-staging)
6. [Phase 4: Switch Production](#phase-4-switch-production)
7. [Rollback](#rollback)
8. [FAQ](#faq)

---

## Vue d'ensemble

Cette migration transforme l'infrastructure Meeshy de MongoDB legacy vers Prisma ORM avec le nouveau `schema.prisma`.

### Changements Majeurs

- ✅ **Schema Prisma** comme référence (ne change pas)
- ✅ **Migration de ~29,000 documents** (User, Message, Community, etc.)
- ❌ **Drop de 94,790 notifications** (70% de la base - seront régénérées)
- ✅ **Environnement staging parallèle** pour tester avant production
- ✅ **Switch production ≤10 minutes**
- ✅ **Rollback complet** si problème

### Architecture

```
/opt/meeshy/
├── production/         # Nouvelle prod (après switch)
├── staging/            # Environnement de test
├── production-old-*/   # Ancienne prod (rollback)
└── backups/            # Backups MongoDB
```

---

## Prérequis

### 1. Variables d'Environnement

Créer `.env.staging` depuis le template:

```bash
cp infrastructure/docker/compose/.env.staging.template \
   infrastructure/docker/compose/.env.staging
```

**Remplir les valeurs:**
- `MONGODB_PASSWORD` - Mot de passe MongoDB staging
- `JWT_SECRET` - Secret JWT (générer: `openssl rand -base64 32`)
- `TRAEFIK_USERS` - Basic Auth Traefik
- `MONGO_USERS` - Basic Auth MongoDB UI
- `REDIS_USERS` - Basic Auth Redis UI
- `ADMIN_PASSWORD` - Mot de passe admin
- `MEESHY_PASSWORD` - Mot de passe meeshy
- `ATABETH_PASSWORD` - Mot de passe atabeth

### 2. Accès Serveur

Vérifier connexion SSH:

```bash
ssh root@meeshy.me exit
```

### 3. Images Docker

Les images doivent être buildées avec `schema.prisma`:

```bash
make docker-build-all
```

Ou utiliser les images CI déjà buildées.

---

## Phase 1: Déploiement Staging

**Durée:** 15-20 minutes

### Étape 1: Déployer Staging

```bash
./infrastructure/scripts/deploy-staging.sh
```

**Ce que fait le script:**
1. ✅ Vérifications pré-déploiement
2. ✅ Création structure `/opt/meeshy/staging/`
3. ✅ Copie configurations (docker-compose, .env, secrets)
4. ✅ Pull images Docker
5. ✅ Création volumes staging
6. ✅ Copie optionnelle modèles ML (~5GB)
7. ✅ Démarrage services
8. ✅ Tests health checks

### Étape 2: Vérifier Staging

**URLs disponibles:**
- Frontend: https://staging.meeshy.me
- Gateway: https://gate.staging.meeshy.me
- ML Service: https://ml.staging.meeshy.me
- MongoDB UI: https://mongo.staging.meeshy.me
- Redis UI: https://redis.staging.meeshy.me
- Traefik: https://traefik.staging.meeshy.me

**Vérifier les logs:**

```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose logs -f"
```

**Vérifier les services:**

```bash
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose ps"
```

---

## Phase 2: Migration des Données

**Durée:** 10-15 minutes

### Étape 1: Migrer vers Staging

```bash
./infrastructure/scripts/migrate-to-staging.sh
```

**Ce que fait le script:**
1. 📦 Backup production MongoDB
2. 📥 Restauration dans staging
3. 🔍 Vérification des données
4. 📋 Copie du script de migration
5. 🧪 Dry-run de la migration (validation)
6. 🔄 Migration réelle (après confirmation)
7. ✅ Validation post-migration
8. 🔄 Redémarrage services

### Collections Migrées

| Collection | Documents | Notes |
|-----------|-----------|-------|
| User | 207 | Transformations de champs |
| Message | 4,508 | Migration complète |
| Community | 8 | Migration complète |
| Conversation | 152 | Migration complète |
| ConversationMember | 616 | Migration complète |
| MessageAttachment | 703 | Migration complète |
| MessageTranslation | 2,787 | Si dans Prisma |
| Reaction | 1,365 | Migration complète |
| Mention | 104 | Migration complète |
| FriendRequest | 96 | Migration complète |

### Collections Droppées

| Collection | Documents | Raison |
|-----------|-----------|--------|
| Notification | 94,790 | Seront régénérées |
| MessageAttachment_backup_urls | 514 | Legacy |
| old_message_status | 7 | Legacy |
| TypingIndicator | 0 | Vide |

### Transformations User

**Champs copiés directement:**
- username, firstName, lastName, email, password
- role, isActive, systemLanguage, regionalLanguage
- customDestinationLanguage, avatar, bio, phoneNumber
- isOnline, lastActiveAt, createdAt, updatedAt

**Champs transformés:**
```typescript
{
  displayName: doc.displayName || `${doc.firstName} ${doc.lastName}`,
  bio: doc.bio || '',
  blockedUserIds: [],
}
```

**Nouveaux champs (valeurs par défaut):**
```typescript
{
  phoneCountryCode: null,
  timezone: null,
  banner: null,

  // Sécurité
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  twoFactorSecret: null,
  twoFactorBackupCodes: [],
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastPasswordChange: doc.createdAt,

  // Device tracking
  lastLoginIp: null,
  lastLoginLocation: null,
  registrationIp: null,
}
```

---

## Phase 3: Tests Staging

**Durée:** 30-60 minutes

### Étape 1: Validation Automatique

```bash
./infrastructure/scripts/validate-staging.sh
```

**Tests effectués:**
- ✅ Services Docker running
- ✅ Health endpoints (Gateway, ML, Frontend)
- ✅ Données MongoDB (counts via Prisma)
- ✅ Volumes Docker
- ✅ Logs sans erreurs critiques
- ✅ API ping

### Étape 2: Tests Manuels

**Checklist:**

1. **Authentification**
   - [ ] Se connecter avec un compte utilisateur
   - [ ] Vérifier le profil utilisateur
   - [ ] Tester logout/login

2. **Messagerie**
   - [ ] Envoyer un message texte
   - [ ] Envoyer un message avec emoji
   - [ ] Répondre à un message
   - [ ] Réagir à un message

3. **Traduction**
   - [ ] Envoyer message en français
   - [ ] Vérifier traduction automatique
   - [ ] Tester plusieurs langues

4. **Uploads**
   - [ ] Upload image
   - [ ] Upload audio
   - [ ] Upload document
   - [ ] Vérifier les URLs

5. **Communautés**
   - [ ] Accéder à une communauté
   - [ ] Envoyer message dans communauté
   - [ ] Vérifier membres

6. **WebSocket**
   - [ ] Ouvrir deux navigateurs
   - [ ] Envoyer message depuis l'un
   - [ ] Vérifier réception temps réel

### Étape 3: Tests de Charge (Optionnel)

```bash
# Test de charge avec Apache Bench
ab -n 1000 -c 10 https://gate.staging.meeshy.me/health
```

---

## Phase 4: Switch Production

**Durée:** 5-10 minutes de downtime

### ⚠️ ATTENTION

- Ce script arrête la production actuelle
- Downtime de 5-10 minutes
- Rollback possible si problème
- **Faire en heures creuses**

### Étape 1: Capture État Pré-Switch

```bash
./infrastructure/scripts/capture-pre-switch-state.sh
```

**Capture:**
- État Docker complet
- Backup MongoDB
- Statistiques et indexes
- Logs récents
- Configurations

### Étape 2: Switch Production

```bash
./infrastructure/scripts/switch-to-production.sh
```

**Confirmations requises:**
1. Taper `oui` pour confirmer
2. Taper `SWITCH-PRODUCTION` pour double confirmation

**Ce que fait le script:**
1. 🔍 Vérifications pré-switch
2. 📸 Capture état (appel script précédent)
3. 🔄 Migration delta (nouvelles données)
4. 🛑 Arrêt production actuelle (début downtime)
5. 📦 Déplacement ancienne prod
6. 🚚 Copie staging → production
7. 💾 Copie volumes staging → production
8. ▶️ Démarrage nouvelle production (fin downtime)
9. ⏳ Attente démarrage (60s)
10. 🔍 Vérifications post-switch

### Étape 3: Monitoring Post-Switch

**Vérifier les logs:**

```bash
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose logs -f"
```

**Vérifier les services:**

```bash
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose ps"
```

**Vérifier les métriques:**
- CPU/RAM via `htop`
- Connexions MongoDB
- Latence API
- Taux d'erreur

### Étape 4: Tests Post-Switch

Refaire les tests manuels sur production:
- ✅ Login/logout
- ✅ Envoi messages
- ✅ Traduction
- ✅ Uploads
- ✅ Communautés
- ✅ WebSocket temps réel

---

## Rollback

### Si Problème Détecté

Le script `capture-pre-switch-state.sh` crée un snapshot complet dans:
```
/opt/meeshy/pre-switch-snapshots/pre-switch-YYYYMMDD-HHMMSS/
```

### Procédure de Rollback

```bash
# 1. Arrêter la nouvelle production
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose down"

# 2. Restaurer l'ancienne configuration
SNAPSHOT_NAME="pre-switch-YYYYMMDD-HHMMSS"  # Remplacer par le vrai nom

ssh root@meeshy.me "cp /opt/meeshy/pre-switch-snapshots/$SNAPSHOT_NAME/docker/docker-compose.yml.backup \
   /opt/meeshy/production/docker-compose.yml"

# 3. Restaurer MongoDB
ssh root@meeshy.me "cd /opt/meeshy/pre-switch-snapshots/$SNAPSHOT_NAME/mongodb && \
  tar -xzf mongodb-backup.tar.gz && \
  docker cp pre-switch-* meeshy-database:/dump/ && \
  docker exec meeshy-database mongorestore --db=meeshy --drop /dump/pre-switch-*/meeshy"

# 4. Redémarrer avec anciennes images
ssh root@meeshy.me "cd /opt/meeshy/production && docker compose up -d"

# 5. Vérifier
curl https://gate.meeshy.me/health
curl https://meeshy.me
```

### Validation Post-Rollback

```bash
./infrastructure/scripts/validate-staging.sh  # Adapter pour prod
```

---

## FAQ

### Q: Combien de temps prend la migration complète?

**R:**
- Déploiement staging: 15-20 min
- Migration données: 10-15 min
- Tests staging: 30-60 min
- Switch production: 5-10 min downtime
- **Total: 3-4 heures**

### Q: Peut-on annuler la migration après le switch?

**R:** Oui, via le rollback complet. Toutes les données sont sauvegardées.

### Q: Que faire si le dry-run échoue?

**R:**
1. Vérifier les logs: `docker compose logs gateway`
2. Vérifier la connexion MongoDB
3. Vérifier que Prisma Client est généré
4. Corriger les erreurs
5. Re-lancer le dry-run

### Q: Les uploads (images, audio) sont-ils migrés?

**R:** Oui, les volumes `gateway-uploads` et `web-uploads` sont copiés de staging vers production.

### Q: Peut-on tester la migration localement?

**R:** Oui, mais nécessite:
1. Dump MongoDB production
2. Restaurer localement
3. Lancer le script de migration avec `DATABASE_URL` local

### Q: Les notifications sont-elles perdues définitivement?

**R:** Oui, les 94,790 notifications sont droppées car:
- Représentent 70% de la base
- Seront régénérées automatiquement
- Pas critiques pour le fonctionnement

### Q: Peut-on garder staging après le switch?

**R:** Oui, staging peut rester actif pour:
- Tests de nouvelles features
- Validation de hotfixes
- Formation utilisateurs

### Q: Comment surveiller la migration en cours?

**R:**
```bash
# Logs migration
docker compose logs -f gateway

# MongoDB operations
docker exec meeshy-database-staging mongostat

# Progress migration
# (Le script affiche une progress bar)
```

---

## 📞 Support

**En cas de problème:**
1. Vérifier les logs
2. Consulter `MANIFEST.md` du snapshot
3. Contacter l'équipe technique
4. En dernier recours: Rollback

**Fichiers de référence:**
- `docs/infrastructure/migration-strategy.md` - Stratégie détaillée
- `docs/infrastructure/STAGING-READY.md` - État staging
- `docs/infrastructure/current-state-analysis.md` - État actuel

---

**Dernière mise à jour:** 2026-01-25 23:45 UTC
**Version:** 1.0
**Auteur:** Migration automatisée Claude Code
