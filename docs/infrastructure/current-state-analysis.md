# Analyse de l'Infrastructure Actuelle - Meeshy

**Date:** 2026-01-25
**Snapshot:** docs/infrastructure/snapshots/20260125-223411

---

## 📊 Vue d'Ensemble

### Architecture Actuelle

```
/opt/meeshy/
├── docker-compose.yml          # Configuration principale (13.5 KB)
├── .env                        # Variables d'environnement (13.4 KB)
├── secrets/
│   └── firebase-admin-sdk.json # Credentials Firebase
├── docker/nginx/
│   └── static-files.conf       # Config Nginx
├── backups/                    # Backups MongoDB (10 MB)
├── scripts/                    # Scripts maintenance
└── i/                          # Images uploadées (ancienne structure)
```

### Services Déployés (9 conteneurs)

| Service | Image | Status | Santé |
|---------|-------|--------|-------|
| **meeshy-traefik** | traefik:v3.3 | Up 3 months | healthy |
| **meeshy-database** | mongo:8.0 | Up 3 months | healthy |
| **meeshy-nosqlclient** | mongoclient/mongoclient:latest | Up 3 months | healthy |
| **meeshy-redis** | redis:8-alpine | Up 3 months | healthy |
| **meeshy-p3x-redis-ui** | patrikx3/p3x-redis-ui:latest | Up 3 months | **unhealthy** ⚠️ |
| **meeshy-translator** | isopen/meeshy-translator:latest | Up 2 weeks | healthy |
| **meeshy-gateway** | isopen/meeshy-gateway:latest | Up 7 weeks | healthy |
| **meeshy-static-files** | nginx:alpine | Up 6 weeks | healthy |
| **meeshy-frontend** | isopen/meeshy-frontend:dev | Up 6 weeks | healthy |

**Note:** Le service p3x-redis-ui est unhealthy mais non critique.

---

## 🗄️ Base de Données MongoDB

### Configuration

- **Version:** MongoDB 8.0
- **Mode:** Replica Set (rs0)
- **Auth:** noauth (à sécuriser)
- **Volume:** database_data (persistent)

### Collections et Volumes

| Collection | Documents | Taille estimée |
|-----------|-----------|----------------|
| **Notification** | 94,790 | ~70% de la base |
| **MessageStatus** | 18,143 | ~15% |
| **Message** | 4,508 | ~5% |
| **MessageTranslation** | 2,787 | ~3% |
| **Reaction** | 1,365 | ~1% |
| **TrackingLinkClick** | 904 | <1% |
| **MessageAttachment** | 703 | <1% |
| **ConversationMember** | 616 | <1% |
| **MessageAttachment_backup_urls** | 514 | <1% |
| **User** | **207** | ✅ **Cible principale** |
| **MessageReadStatus** | 172 | <1% |
| **Conversation** | 152 | <1% |
| **Mention** | 104 | <1% |
| **UserStats** | 96 | <1% |
| **FriendRequest** | 96 | <1% |
| **Notification** | 94 | <1% (doublon?) |
| **AdminAuditLog** | 89 | <1% |
| **AffiliateRelation** | 86 | <1% |
| **TrackingLink** | 75 | <1% |
| **AffiliateToken** | 59 | <1% |
| **call_participants** | 48 | <1% |
| **call_sessions** | 44 | <1% |
| **user_conversation_preferences** | 34 | <1% |
| **CommunityMember** | 14 | <1% |
| **ConversationShareLink** | 8 | <1% |
| **Community** | **8** | ✅ **Cible principale** |
| **old_message_status** | 7 | <1% (legacy) |
| **user_conversation_categories** | 6 | <1% |
| **TypingIndicator** | 0 | (vide) |
| **AnonymousParticipant** | 0 | (vide) |
| **ConversationPreference** | 0 | (vide) |
| **UserPreference** | 0 | (vide) |

**Total estimé:** ~125,000 documents (~10-15 MB)

### Structure des Données Principales

#### User (207 utilisateurs)

```javascript
{
  _id: ObjectId('...'),
  username: 'meeshy',
  firstName: 'Meeshy',
  lastName: 'Sama',
  bio: '',
  email: 'meeshy@meeshy.me',
  phoneNumber: null,
  password: '$2b$10$...',  // bcrypt hash
  displayName: 'meeshy sama',
  isOnline: false,
  lastSeen: ISODate('2025-12-08T11:58:26.882Z'),
  lastActiveAt: ISODate('2025-12-08T11:28:14.513Z'),
  systemLanguage: 'en',
  regionalLanguage: 'fr',
  autoTranslateEnabled: true,
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
  customDestinationLanguage: null,
  role: 'BIGBOSS',  // enum: USER, ADMIN, MODERATOR, BIGBOSS, AUDIT, ANALYST
  isActive: true,
  createdAt: ISODate('2025-10-17T20:33:24.336Z'),
  updatedAt: ISODate('2025-12-08T11:58:26.883Z'),
  avatar: 'https://static.meeshy.me/u/i/2025/10/avatar_xxx.jpg'
}
```

**Champs présents mais absents du schema.prisma:**
- `lastSeen` → ajouter à Prisma
- `autoTranslateEnabled`, `translateToSystemLanguage`, `translateToRegionalLanguage`, `useCustomDestination` → préférences de traduction

**Champs dans schema.prisma mais absents de la DB:**
- `phoneCountryCode`, `timezone`, `blockedUserIds`, `banner`, `emailVerifiedAt`, `phoneVerifiedAt`, `twoFactorSecret`, `deactivatedAt`, etc.

#### Message (4,508 messages)

```javascript
{
  _id: ObjectId('...'),
  conversationId: ObjectId('...'),
  senderId: ObjectId('...'),
  content: 'Some useful images.',
  originalLanguage: 'en',
  messageType: 'text',  // text, audio, image, video, file
  isEdited: false,
  isDeleted: true,
  deletedAt: ISODate('2025-10-19T19:21:49.192Z'),
  createdAt: ISODate('2025-10-17T20:35:38.202Z'),
  updatedAt: ISODate('2025-10-19T19:21:49.193Z')
}
```

#### Community (8 communautés)

```javascript
{
  _id: ObjectId('...'),
  identifier: 'mshy_services-ceo-development',  // slug unique
  name: 'Services CEO Development ',
  description: 'Développement de la plateforme Services CEO',
  isPrivate: true,
  createdBy: ObjectId('...'),
  createdAt: ISODate('2025-09-09T19:11:34.360Z'),
  updatedAt: ISODate('2025-09-09T19:11:34.360Z')
}
```

---

## 🔧 Configuration Docker Compose

### Domaines Actuels

| Service | Domaine | Port Interne |
|---------|---------|--------------|
| Frontend | `meeshy.me`, `www.meeshy.me` | 3100 |
| Gateway API | `gate.meeshy.me` | 3000 |
| ML Service | `ml.meeshy.me` | 8000 |
| Static Files | `static.meeshy.me` | 80 |
| MongoDB UI | `mongo.meeshy.me` | 3000 |
| Redis UI | `redis.meeshy.me` | 7843 |
| Traefik | `traefik.meeshy.me` | 8080 |

### Volumes Docker

```
database_data           # MongoDB data
database_config         # MongoDB config
redis_data              # Redis persistence
redis-ui-data           # Redis UI settings
traefik_certs           # Let's Encrypt certificates
models_data             # ML models cache
gateway_uploads         # Fichiers uploadés via API
frontend_uploads        # Fichiers uploadés via frontend
```

### Variables d'Environnement (.env)

**Secrets critiques identifiés:**
- `DATABASE_URL` - Connection MongoDB
- `JWT_SECRET` - Signature tokens
- `ADMIN_PASSWORD`, `MEESHY_PASSWORD`, `ATABETH_PASSWORD`
- `TRAEFIK_USERS`, `MONGO_USERS`, `REDIS_USERS` (Basic Auth)
- Firebase credentials (fichier séparé)

---

## 🔍 Analyse des Écarts avec schema.prisma

### Collections Manquantes dans Prisma

Collections présentes dans MongoDB mais **absentes** du schema.prisma:
- `MessageAttachment_backup_urls` (514 docs) - backup URLs des attachements
- `MessageReadStatus` (172 docs) - statut de lecture par utilisateur
- `AffiliateToken` (59 docs) - tokens d'affiliation
- `ConversationShareLink` (8 docs) - liens de partage
- `TypingIndicator` (0 docs) - indicateurs de frappe (vide)
- `TrackingLink` (75 docs) - liens trackés
- `AdminAuditLog` (89 docs) - logs d'audit admin
- `AffiliateRelation` (86 docs) - relations d'affiliation
- `TrackingLinkClick` (904 docs) - clics sur liens trackés
- `AnonymousParticipant` (0 docs) - participants anonymes (vide)
- `user_conversation_categories` (6 docs) - catégories perso
- `old_message_status` (7 docs) - legacy
- `call_sessions` (44 docs) - sessions d'appel
- `call_participants` (48 docs) - participants aux appels
- `user_conversation_preferences` (34 docs) - préférences

### Champs Utilisateur Manquants

Champs présents dans la DB actuelle mais **absents** de schema.prisma:
- `lastSeen: DateTime` - dernière connexion visible
- `autoTranslateEnabled: Boolean` - activation auto-traduction
- `translateToSystemLanguage: Boolean`
- `translateToRegionalLanguage: Boolean`
- `useCustomDestination: Boolean`

Champs dans schema.prisma mais **absents** de la DB:
- Tous les champs de sécurité (2FA, email verification, phone verification)
- `phoneCountryCode`, `timezone`, `blockedUserIds`
- `banner`, `deactivatedAt`, `emailVerifiedAt`, etc.

### Collections à Créer/Migrer

**Priorité HAUTE:**
1. ✅ `User` - 207 utilisateurs (mapping direct)
2. ✅ `Message` - 4,508 messages (mapping direct)
3. ✅ `Community` - 8 communautés (mapping direct)
4. ✅ `Conversation` - 152 conversations (mapping direct)
5. ✅ `ConversationMember` - 616 membres (mapping direct)
6. ✅ `CommunityMember` - 14 membres (mapping direct)
7. ✅ `MessageAttachment` - 703 attachements (mapping direct)
8. ✅ `Reaction` - 1,365 réactions (mapping direct)
9. ✅ `Mention` - 104 mentions (mapping direct)
10. ✅ `FriendRequest` - 96 demandes d'ami (mapping direct)

**Priorité MOYENNE:**
- `MessageTranslation` - 2,787 traductions
- `MessageStatus` - 18,143 statuts
- `Notification` - 94,790 notifications
- `UserStats` - 96 stats utilisateur

**À Ignorer (legacy/vide):**
- `TypingIndicator` (0 docs)
- `AnonymousParticipant` (0 docs)
- `ConversationPreference` (0 docs)
- `UserPreference` (0 docs)
- `old_message_status` (7 docs - legacy)

---

## 📦 Images et Fichiers Uploadés

### Ancienne Structure (`/opt/meeshy/i/`)

```
/opt/meeshy/i/2025/
├── 09/  # Septembre 2025
│   └── avatar_1757848385364_qsr3u7.PNG (2.2 MB)
└── 10/  # Octobre 2025
    └── avatar_*.jpg (8 fichiers, ~1.8 MB total)
```

**Note:** Structure obsolète, maintenant géré par volumes Docker.

### Nouvelle Structure (volumes Docker)

```
gateway_uploads/        # Via gateway API
frontend_uploads/       # Via frontend Next.js
```

Accessible via `https://static.meeshy.me/u/...`

---

## 🚨 Points d'Attention pour Migration

### 1. Sécurité MongoDB

⚠️ **Actuellement MongoDB tourne en `--noauth`**

**Actions recommandées:**
- Activer l'authentification MongoDB
- Créer des users avec rôles appropriés
- Mettre à jour les connection strings

### 2. Différences Schéma

**Champs à ajouter dans schema.prisma:**
```prisma
model User {
  // ... champs existants
  lastSeen              DateTime?  // Date dernière connexion visible
  autoTranslateEnabled  Boolean    @default(true)
  translateToSystemLanguage Boolean @default(true)
  translateToRegionalLanguage Boolean @default(false)
  useCustomDestination  Boolean    @default(false)
}
```

### 3. Collections Non-Mappées

**Décisions à prendre:**
- `MessageReadStatus` (172 docs) → Ajouter dans Prisma ou ignorer ?
- `AffiliateToken/AffiliateRelation` (145 docs) → Migrer ou archiver ?
- `TrackingLink/TrackingLinkClick` (979 docs) → Système de tracking actif ?
- `call_sessions/call_participants` (92 docs) → Système d'appels actif ?
- `AdminAuditLog` (89 docs) → Ajouter logging dans Prisma ?

### 4. Notifications Volumineuses

⚠️ **94,790 notifications** représentent 70% de la base

**Recommandations:**
- Archiver les notifications >30 jours
- Implémenter une politique de rétention
- Réduire à ~5,000 notifications actives

### 5. Indexes MongoDB

**À vérifier et recréer après migration:**
```bash
# Lister les indexes actuels
db.User.getIndexes()
db.Message.getIndexes()
db.Community.getIndexes()
```

### 6. Versions d'Images Docker

**Images actuellement déployées:**
```
isopen/meeshy-frontend:dev           # ⚠️ Tag 'dev' en production
isopen/meeshy-gateway:latest
isopen/meeshy-translator:latest
```

**Recommandation:** Passer sur des tags versionnés (ex: `v1.2.3`)

---

## ✅ Points Positifs

✅ **Stabilité:** Services up depuis 2-3 mois
✅ **Health checks:** Tous les services (sauf redis-ui) sont healthy
✅ **Backups:** Système de backup en place (10 MB)
✅ **SSL:** Certificats Let's Encrypt automatiques via Traefik
✅ **Volumes persistents:** Données bien isolées dans volumes Docker
✅ **Monitoring:** Interfaces web pour MongoDB et Redis

---

## 📝 Recommandations Pré-Migration

### Immédiat (avant staging)

1. ✅ **Créer un backup complet**
   ```bash
   ./infrastructure/scripts/backup-mongodb.sh pre-migration-full
   ```

2. ✅ **Documenter tous les indexes MongoDB**
   ```bash
   ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --eval 'db.getCollectionNames().forEach(c => print(c + \": \" + JSON.stringify(db[c].getIndexes())))'"
   ```

3. ✅ **Fixer schema.prisma**
   - Ajouter champs manquants (lastSeen, autoTranslateEnabled, etc.)
   - Décider du sort des collections non-mappées

### Moyen terme (staging)

4. **Nettoyer les notifications**
   - Archiver les notifications >30 jours
   - Réduire à ~5,000 notifications actives
   - Économie: ~70% de la taille de la base

5. **Activer l'authentification MongoDB**
   - Créer users avec rôles
   - Mettre à jour .env
   - Tester connexions

6. **Versionner les images Docker**
   - Builder avec tags versionnés
   - Documenter les versions déployées

---

## 🎯 Estimation Taille Migration

**Données à migrer:**
- Collections principales: ~15,000 documents
- Notifications (après archivage): ~5,000 documents
- **Total estimé: ~20,000 documents (~5-8 MB)**

**Durée estimée migration:**
- Batch de 100 docs: ~1-2 sec
- 20,000 docs: **~5-10 minutes**

**Durée switch production:**
- Arrêt services: 1 min
- Migration delta: 2-3 min
- Démarrage: 2-3 min
- Vérification: 1-2 min
- **Total: ≤10 minutes** ✅

---

## 📄 Fichiers Générés

- ✅ `docs/infrastructure/snapshots/20260125-223411/` - État complet capturé
- ✅ `docs/infrastructure/current-state-analysis.md` - Ce document
- 🔄 Prochaine étape: Adapter schema.prisma selon analyse

---

**Analyse complétée le:** 2026-01-25 22:34 UTC
**Analysé par:** Claude Code
**Snapshot source:** 20260125-223411
