# Stratégie de Migration MongoDB → Prisma

**Date:** 2026-01-25 23:30 UTC
**Décision:** Dropper les notifications (94,790 docs = 70% de la base)

---

## 📊 Collections à Migrer

### ✅ Priorité HAUTE - À Migrer

| Collection | Documents | Action |
|-----------|-----------|--------|
| **User** | 207 | ✅ Migrer + transformer |
| **Message** | 4,508 | ✅ Migrer |
| **Community** | 8 | ✅ Migrer |
| **Conversation** | 152 | ✅ Migrer |
| **ConversationMember** | 616 | ✅ Migrer |
| **CommunityMember** | 14 | ✅ Migrer |
| **MessageAttachment** | 703 | ✅ Migrer |
| **Reaction** | 1,365 | ✅ Migrer |
| **Mention** | 104 | ✅ Migrer |
| **FriendRequest** | 96 | ✅ Migrer |
| **MessageTranslation** | 2,787 | ✅ Migrer (si dans Prisma) |
| **MessageStatus** | 18,143 | ✅ Migrer (si dans Prisma) |
| **MessageReadStatus** | 172 | ✅ Migrer (si dans Prisma) |
| **UserStats** | 96 | ✅ Migrer (si dans Prisma) |

**Total à migrer: ~29,000 documents**

### ❌ À DROPPER

| Collection | Documents | Raison |
|-----------|-----------|--------|
| **Notification** | 94,790 | ⛔ DROPPER - Seront régénérées |
| **MessageAttachment_backup_urls** | 514 | ⛔ Legacy backup |
| **old_message_status** | 7 | ⛔ Legacy |
| **TypingIndicator** | 0 | ⛔ Vide |
| **AnonymousParticipant** | 0 | ⛔ Vide |
| **ConversationPreference** | 0 | ⛔ Vide |
| **UserPreference** | 0 | ⛔ Vide |

**Total droppé: ~95,300 documents**

### ⚠️ À Décider

| Collection | Documents | Question |
|-----------|-----------|----------|
| **AffiliateToken** | 59 | Système actif ? |
| **AffiliateRelation** | 86 | Système actif ? |
| **TrackingLink** | 75 | Analytics actif ? |
| **TrackingLinkClick** | 904 | Analytics actif ? |
| **call_sessions** | 44 | Appels actifs ? |
| **call_participants** | 48 | Appels actifs ? |
| **AdminAuditLog** | 89 | Garder historique ? |
| **user_conversation_categories** | 6 | Feature active ? |
| **user_conversation_preferences** | 34 | Feature active ? |
| **ConversationShareLink** | 8 | Feature active ? |

**Total incertain: ~1,353 documents**

---

## 🔄 Transformations User

### Champs Existants → Copie Directe

```typescript
// Pas de transformation nécessaire
username, firstName, lastName, email, password,
role, isActive, systemLanguage, regionalLanguage,
customDestinationLanguage, createdAt, updatedAt
```

### Champs à Transformer

```typescript
// Mapping depuis champs existants
{
  // lastSeen existe dans DB mais pas dans Prisma actuel
  // → À ajouter dans Prisma OU mapper depuis lastActiveAt
  lastSeen: doc.lastSeen || doc.lastActiveAt,

  // lastActiveAt existe dans les deux
  lastActiveAt: doc.lastActiveAt,

  // displayName → Construire depuis firstName + lastName si absent
  displayName: doc.displayName || `${doc.firstName} ${doc.lastName}`,

  // avatar → garder URL actuelle
  avatar: doc.avatar,
}
```

### Nouveaux Champs (Valeurs par Défaut)

```typescript
// Champs dans Prisma mais absents de la DB actuelle
{
  // Profil
  bio: doc.bio || '',
  banner: null,
  phoneNumber: doc.phoneNumber || null,
  phoneCountryCode: null,  // Nouveau
  timezone: null,           // Nouveau
  blockedUserIds: [],       // Nouveau

  // Sécurité (tous null par défaut)
  emailVerifiedAt: null,
  emailVerificationToken: null,
  emailVerificationExpiry: null,
  phoneVerifiedAt: null,
  phoneVerificationCode: null,
  phoneVerificationExpiry: null,
  phoneTransferredFromUserId: null,
  phoneTransferredAt: null,
  twoFactorSecret: null,
  twoFactorBackupCodes: [],
  twoFactorPendingSecret: null,
  twoFactorEnabledAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  lockedReason: null,
  lastPasswordChange: doc.createdAt,  // Défaut création
  passwordResetAttempts: 0,
  lastPasswordResetAttempt: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  registrationIp: null,
  registrationLocation: null,
  registrationDevice: null,
  registrationUserAgent: null,

  // Online status
  isOnline: doc.isOnline || false,

  // Déactivation
  deactivatedAt: doc.isActive ? null : new Date(),
}
```

### Champs Absents de Prisma (À Ignorer)

```typescript
// Ces champs existent dans la DB mais pas dans Prisma
// → Seront perdus (acceptable si non critiques)
{
  autoTranslateEnabled: true,          // Feature ancienne
  translateToSystemLanguage: true,     // Feature ancienne
  translateToRegionalLanguage: false,  // Feature ancienne
  useCustomDestination: false,         // Feature ancienne
}
```

---

## 📦 Ordre de Migration

**Important:** Migrer dans l'ordre des dépendances !

```
1. User                    (207 docs)
   └─ Pas de dépendances

2. Community               (8 docs)
   └─ Dépend de: User (createdBy)

3. CommunityMember         (14 docs)
   └─ Dépend de: User, Community

4. Conversation            (152 docs)
   └─ Dépend de: User (createdBy), Community (optionnel)

5. ConversationMember      (616 docs)
   └─ Dépend de: User, Conversation

6. Message                 (4,508 docs)
   └─ Dépend de: User (senderId), Conversation, Community

7. MessageAttachment       (703 docs)
   └─ Dépend de: Message

8. MessageTranslation      (2,787 docs)
   └─ Dépend de: Message

9. Reaction                (1,365 docs)
   └─ Dépend de: Message, User

10. Mention                (104 docs)
    └─ Dépend de: Message, User

11. FriendRequest          (96 docs)
    └─ Dépend de: User (senderId, receiverId)

12. MessageStatus          (18,143 docs) - Si dans Prisma
    └─ Dépend de: Message, User

13. MessageReadStatus      (172 docs) - Si dans Prisma
    └─ Dépend de: Message, User

14. UserStats              (96 docs) - Si dans Prisma
    └─ Dépend de: User
```

---

## ⚡ Performance

### Batch Size

```typescript
const BATCH_SIZE = 100  // Documents par batch
```

**Estimation:**
- 29,000 docs ÷ 100 = 290 batches
- 1 batch ≈ 1 seconde
- **Total: ~5 minutes**

### Optimisations

1. **Pas de validation Zod sur chaque doc** (trop lent)
   - Validation par batch
   - Continue on error individuel

2. **Transaction Prisma par batch**
   - Rollback automatique si erreur
   - Performance optimale

3. **Progress bar**
   - Feedback visuel
   - ETA dynamique

---

## 🧪 Mode Dry-Run

**Obligatoire avant migration réelle !**

```bash
npm run migrate:dry-run
# OU
tsx src/migrations/migrate-from-legacy.ts --dry-run
```

**Ce que fait le dry-run:**
- ✅ Connexion aux bases
- ✅ Lecture des collections
- ✅ Validation des schémas
- ✅ Compte des documents
- ✅ Détection des problèmes
- ❌ AUCUNE écriture

**Output attendu:**
```
📊 MIGRATION DRY-RUN
===================
User: 207 documents → OK
Message: 4508 documents → OK
Community: 8 documents → OK
...
✅ Dry-run réussi - Prêt pour migration réelle
```

---

## ✅ Validation Post-Migration

### Checks Automatiques

```typescript
// Comparer les counts
const checks = [
  { collection: 'User', expected: 207 },
  { collection: 'Message', expected: 4508 },
  { collection: 'Community', expected: 8 },
  // ...
]

for (const check of checks) {
  const count = await prisma[check.collection].count()
  assert(count === check.expected, `${check.collection} count mismatch`)
}
```

### Checks Manuels

1. **Interface MongoDB UI**
   - Vérifier les documents
   - Checker les relations
   - Tester les requêtes

2. **Interface Frontend**
   - Login utilisateur
   - Affichage messages
   - Communautés accessibles
   - Profils corrects

3. **API Gateway**
   - Endpoints fonctionnels
   - WebSockets OK
   - Uploads testés

---

## 🔄 Rollback

### Si Migration Échoue

```bash
# 1. Arrêter staging
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose down"

# 2. Supprimer le volume staging corrompu
ssh root@meeshy.me "docker volume rm meeshy-staging-database-data"

# 3. Recréer le volume vide
ssh root@meeshy.me "docker volume create meeshy-staging-database-data"

# 4. Redémarrer staging
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose up -d"

# 5. Re-lancer la migration
./infrastructure/scripts/migrate-to-staging.sh
```

---

## 📝 Checklist Finale

Avant de lancer la migration en production:

- [ ] Dry-run réussi en staging
- [ ] Migration réelle réussie en staging
- [ ] Tous les counts correspondent
- [ ] Tests manuels passés
- [ ] Tests automatisés passés
- [ ] Backup production créé
- [ ] État pre-switch capturé
- [ ] Équipe de monitoring prête
- [ ] Communication utilisateurs envoyée

---

**Prochaine étape:** Créer le script de migration
**Fichier:** `services/backend/src/migrations/migrate-from-legacy.ts`
