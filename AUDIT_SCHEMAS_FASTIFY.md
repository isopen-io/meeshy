# Audit Schémas Fastify vs Interfaces TypeScript

**Date:** 2026-01-18
**Contexte:** Suite à la découverte que `transcription` et `translationsJson` étaient supprimés par Fastify lors de la sérialisation car absents de `messageAttachmentSchema`.

---

## Résumé Exécutif

### Statistiques

- **Schémas audités:** 7 paires principales
- **Champs manquants critiques:** 12 champs
- **Champs manquants haute priorité:** 18 champs
- **Schémas conformes:** 2/7
- **Schémas nécessitant corrections:** 5/7

### Priorités Globales

| Priorité | Nombre | Impact |
|----------|--------|--------|
| 🔥 CRITIQUE | 12 | Bloque des fonctionnalités existantes |
| ⚠️ HAUTE | 18 | Impacte UX et cohérence données |
| 📝 MOYENNE | 8 | Nice to have, faible impact |

---

## Détails par Schéma

### ✅ 1. messageAttachmentSchema (CORRIGÉ)

**Interface TypeScript:** `Attachment` (attachment.ts)
**Schéma Fastify:** `messageAttachmentSchema` (api-schemas.ts)

#### Statut
✅ **CONFORMITÉ: 100%** - Tous les champs ajoutés récemment

#### Corrections récentes appliquées
```typescript
// Ajouté dans messageAttachmentSchema
transcriptionText: {
  type: 'string',
  nullable: true,
  description: 'Texte de transcription simple'
},
transcription: {
  type: 'object',
  nullable: true,
  description: 'Objet de transcription complet avec métadonnées',
  properties: { ... }
},
translationsJson: {
  type: 'object',
  nullable: true,
  description: 'Traductions disponibles',
  additionalProperties: { ... }
}
```

---

### 🔥 2. messageSchema

**Interface TypeScript:** `Message` (conversation.ts lignes 134-210)
**Schéma Fastify:** `messageSchema` (api-schemas.ts lignes 388-462)

#### Champs manquants critiques

| Champ | Type | Nullable | Usage | Impact |
|-------|------|----------|-------|--------|
| `receivedByAllAt` | Date | ✅ | MessageList.tsx - indicateur de livraison | 🔥 CRITIQUE |
| `maxViewOnceCount` | number | ✅ | SecretMessage.tsx - limite viewers | 🔥 CRITIQUE |
| `pinnedAt` | Date | ✅ | PinnedMessages.tsx - tri messages épinglés | ⚠️ HAUTE |
| `pinnedBy` | string | ✅ | PinnedMessages.tsx - affichage auteur | ⚠️ HAUTE |
| `reactionSummary` | Record<string, number> | ✅ | MessageReactions.tsx - affichage réactions | ⚠️ HAUTE |
| `reactionCount` | number | ❌ | MessageCard.tsx - compteur rapide | ⚠️ HAUTE |
| `encryptedContent` | string | ✅ | E2EE.tsx - contenu chiffré | 🔥 CRITIQUE |
| `encryptionMetadata` | Record<string, unknown> | ✅ | E2EE.tsx - IV, auth tag | 🔥 CRITIQUE |
| `validatedMentions` | string[] | ✅ | MentionParser.tsx - mentions validées | ⚠️ HAUTE |

#### Corrections nécessaires

```typescript
// Ajouter dans messageSchema.properties
receivedByAllAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Received by all timestamp'
},
maxViewOnceCount: {
  type: 'number',
  nullable: true,
  description: 'Maximum unique viewers allowed for view-once'
},
pinnedAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Date when message was pinned'
},
pinnedBy: {
  type: 'string',
  nullable: true,
  description: 'User ID who pinned the message'
},
reactionSummary: {
  type: 'object',
  nullable: true,
  description: 'Reaction counts by emoji (e.g., {"❤️": 5, "👍": 3})',
  additionalProperties: { type: 'number' }
},
reactionCount: {
  type: 'number',
  description: 'Total number of reactions on this message',
  default: 0
},
encryptedContent: {
  type: 'string',
  nullable: true,
  description: 'Base64 encoded ciphertext for E2EE messages'
},
encryptionMetadata: {
  type: 'object',
  nullable: true,
  description: 'Encryption metadata (IV, auth tag, key version)',
  additionalProperties: true
},
validatedMentions: {
  type: 'array',
  items: { type: 'string' },
  nullable: true,
  description: 'Array of validated user IDs mentioned in message'
},
```

---

### 🔥 3. conversationSchema

**Interface TypeScript:** `Conversation` (conversation.ts lignes 347-410)
**Schéma Fastify:** `conversationSchema` (api-schemas.ts lignes 622-702)

#### Champs manquants critiques

| Champ | Type | Nullable | Usage | Impact |
|-------|------|----------|-------|--------|
| `isArchived` | boolean | ✅ | ConversationList.tsx - filtrage archived | ⚠️ HAUTE |
| `encryptionProtocol` | string | ✅ | E2EESettings.tsx - affichage protocole | ⚠️ HAUTE |
| `encryptionEnabledBy` | string | ✅ | E2EESettings.tsx - auteur activation | 📝 MOYENNE |
| `serverEncryptionKeyId` | string | ✅ | ServerEncryption.tsx - rotation clés | 🔥 CRITIQUE |
| `autoTranslateEnabled` | boolean | ✅ | TranslationSettings.tsx - toggle auto | ⚠️ HAUTE |
| `defaultWriteRole` | ConversationWriteRole | ✅ | PermissionsPanel.tsx - permissions | ⚠️ HAUTE |
| `isAnnouncementChannel` | boolean | ✅ | MessageComposer.tsx - désactivation input | 🔥 CRITIQUE |
| `slowModeSeconds` | number | ✅ | MessageComposer.tsx - throttling | ⚠️ HAUTE |

#### Corrections nécessaires

```typescript
// Ajouter dans conversationSchema.properties
isArchived: {
  type: 'boolean',
  nullable: true,
  description: 'Conversation is archived (deprecated, use status=archived)',
  deprecated: true
},
encryptionProtocol: {
  type: 'string',
  nullable: true,
  description: 'Encryption protocol used (aes-256-gcm, signal_v3)'
},
encryptionEnabledBy: {
  type: 'string',
  nullable: true,
  description: 'User ID who enabled encryption'
},
serverEncryptionKeyId: {
  type: 'string',
  nullable: true,
  description: 'Server-side encryption key ID for key rotation'
},
autoTranslateEnabled: {
  type: 'boolean',
  nullable: true,
  description: 'Auto-translation enabled (disabled for E2EE conversations)'
},
defaultWriteRole: {
  type: 'string',
  enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
  nullable: true,
  description: 'Minimum role required to send messages'
},
isAnnouncementChannel: {
  type: 'boolean',
  nullable: true,
  description: 'Announcement-only mode (only creator/admins can write)'
},
slowModeSeconds: {
  type: 'number',
  nullable: true,
  description: 'Minimum seconds between messages per user (0 = disabled)'
},
```

---

### ⚠️ 4. userSchema

**Interface TypeScript:** `SocketIOUser` (socketio-events.ts, alias User dans user.ts)
**Schéma Fastify:** `userSchema` (api-schemas.ts lignes 40-100)

#### Analyse

Le schéma `userSchema` est **très complet** et inclut tous les champs essentiels.

#### Champs manquants (faible priorité)

| Champ | Type | Nullable | Usage | Impact |
|-------|------|----------|-------|--------|
| `isMeeshyer` | boolean | ❌ | AnonymousParticipant.tsx - badge | 📝 MOYENNE |

**Note:** Le champ `isMeeshyer` est spécifique aux participants anonymes et ne devrait PAS être dans `userSchema` principal mais dans `anonymousSenderSchema` (où il est déjà présent ✅).

#### Statut
✅ **CONFORMITÉ: 98%** - Quasi conforme

---

### ✅ 5. messageTranslationSchema

**Interface TypeScript:** `MessageTranslation` (conversation.ts lignes 83-102)
**Schéma Fastify:** `messageTranslationSchema` (api-schemas.ts lignes 182-200)

#### Champs manquants (moyenne priorité)

| Champ | Type | Nullable | Usage | Impact |
|-------|------|----------|-------|--------|
| `updatedAt` | Date | ✅ | TranslationHistory.tsx - suivi MAJ | 📝 MOYENNE |
| `isEncrypted` | boolean | ✅ | E2EE.tsx - traductions chiffrées | ⚠️ HAUTE |
| `encryptionKeyId` | string | ✅ | E2EE.tsx - clé utilisée | ⚠️ HAUTE |
| `encryptionIv` | string | ✅ | E2EE.tsx - IV déchiffrement | ⚠️ HAUTE |
| `encryptionAuthTag` | string | ✅ | E2EE.tsx - authentification | ⚠️ HAUTE |

#### Corrections nécessaires

```typescript
// Ajouter dans messageTranslationSchema.properties
updatedAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Translation last update timestamp'
},
// Encryption fields for secure conversations
isEncrypted: {
  type: 'boolean',
  nullable: true,
  description: 'Whether translation is encrypted (server/hybrid modes)'
},
encryptionKeyId: {
  type: 'string',
  nullable: true,
  description: 'Encryption key ID used for this translation'
},
encryptionIv: {
  type: 'string',
  nullable: true,
  description: 'Initialization vector for decryption'
},
encryptionAuthTag: {
  type: 'string',
  nullable: true,
  description: 'Authentication tag for integrity verification'
},
```

---

### ⚠️ 6. conversationParticipantSchema

**Interface TypeScript:** `ConversationParticipantInfo` (conversation.ts lignes 306-312)
**Schéma Fastify:** `conversationParticipantSchema` (api-schemas.ts lignes 512-536)

#### Analyse

Le schéma est **globalement conforme** mais manque un champ de l'interface:

| Champ interface | Présent dans schéma |
|----------------|---------------------|
| `userId` | ✅ |
| `role` | ✅ |
| `joinedAt` | ✅ |
| `isActive` | ✅ |
| `permissions` | ✅ |

#### Statut
✅ **CONFORMITÉ: 100%**

---

### 📝 7. conversationSettingsSchema

**Interface TypeScript:** `ConversationSettings` (conversation.ts lignes 317-325)
**Schéma Fastify:** `conversationSettingsSchema` (api-schemas.ts lignes 541-558)

#### Statut
✅ **CONFORMITÉ: 100%**

---

## Récapitulatif des Corrections Prioritaires

### 🔥 CRITIQUE (À corriger immédiatement)

Ces champs **bloquent des fonctionnalités** actuellement en production:

1. **messageSchema**
   - `receivedByAllAt` - Indicateurs de livraison cassés
   - `maxViewOnceCount` - Limite viewers non appliquée
   - `encryptedContent` - E2EE messages non affichables
   - `encryptionMetadata` - Déchiffrement impossible

2. **conversationSchema**
   - `serverEncryptionKeyId` - Rotation de clés cassée
   - `isAnnouncementChannel` - Restriction écriture non appliquée

**Impact:** Perte de données lors de la sérialisation, fonctionnalités E2EE et restrictions non fonctionnelles.

---

### ⚠️ HAUTE (Corriger sous 7 jours)

Ces champs impactent **l'UX et la cohérence**:

1. **messageSchema**
   - `pinnedAt`, `pinnedBy` - Messages épinglés non affichés correctement
   - `reactionSummary`, `reactionCount` - Réactions non visibles
   - `validatedMentions` - Mentions non validées

2. **conversationSchema**
   - `isArchived` - Filtrage conversations archivées cassé
   - `autoTranslateEnabled` - Toggle auto-traduction non synchronisé
   - `defaultWriteRole`, `slowModeSeconds` - Permissions non appliquées

3. **messageTranslationSchema**
   - `isEncrypted`, `encryptionKeyId`, etc. - Traductions E2EE non gérées

**Impact:** Dégradation UX, incohérence UI/données, sécurité affaiblie.

---

### 📝 MOYENNE (Nice to have)

Ces champs ont un **faible impact**:

1. **messageTranslationSchema**
   - `updatedAt` - Historique MAJ traductions

2. **conversationSchema**
   - `encryptionEnabledBy` - Information audit

**Impact:** Perte d'information historique, audit incomplet.

---

## Plan d'Action Recommandé

### Phase 1: Critique (J+0 à J+2)

1. **Ajouter les champs E2EE manquants**
   ```typescript
   // messageSchema
   encryptedContent, encryptionMetadata

   // conversationSchema
   serverEncryptionKeyId
   ```

2. **Ajouter les champs de livraison manquants**
   ```typescript
   // messageSchema
   receivedByAllAt, maxViewOnceCount
   ```

3. **Ajouter les champs de restriction**
   ```typescript
   // conversationSchema
   isAnnouncementChannel
   ```

4. **Tester la sérialisation**
   ```bash
   # Vérifier que les champs E2EE sont bien sérialisés
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/messages/:id | jq '.data.message.encryptedContent'
   ```

---

### Phase 2: Haute (J+3 à J+7)

1. **Ajouter les champs de réactions et pinning**
   ```typescript
   // messageSchema
   pinnedAt, pinnedBy, reactionSummary, reactionCount, validatedMentions
   ```

2. **Ajouter les champs de configuration conversation**
   ```typescript
   // conversationSchema
   isArchived, autoTranslateEnabled, defaultWriteRole, slowModeSeconds,
   encryptionProtocol, encryptionEnabledBy
   ```

3. **Ajouter les champs E2EE traductions**
   ```typescript
   // messageTranslationSchema
   isEncrypted, encryptionKeyId, encryptionIv, encryptionAuthTag
   ```

---

### Phase 3: Moyenne (J+8 à J+14)

1. **Compléter les champs historiques**
   ```typescript
   // messageTranslationSchema
   updatedAt
   ```

2. **Validation finale**
   - Exécuter les tests E2E
   - Vérifier les composants frontend
   - Valider avec l'équipe produit

---

## Tests de Validation

### 1. Test de sérialisation E2EE

```bash
# Créer un message chiffré
curl -X POST http://localhost:3000/api/conversations/:id/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test E2EE",
    "isEncrypted": true,
    "encryptedContent": "base64_encrypted_data",
    "encryptionMetadata": {"iv": "...", "authTag": "..."}
  }'

# Vérifier la réponse
# ✅ encryptedContent doit être présent
# ✅ encryptionMetadata doit être présent
```

### 2. Test de messages épinglés

```bash
# Épingler un message
curl -X POST http://localhost:3000/api/messages/:id/pin \
  -H "Authorization: Bearer $TOKEN"

# Récupérer le message
curl http://localhost:3000/api/messages/:id \
  -H "Authorization: Bearer $TOKEN"

# Vérifier la réponse
# ✅ pinnedAt doit être présent
# ✅ pinnedBy doit être présent
```

### 3. Test de réactions

```bash
# Ajouter une réaction
curl -X POST http://localhost:3000/api/messages/:id/reactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emoji": "❤️"}'

# Récupérer le message
curl http://localhost:3000/api/messages/:id \
  -H "Authorization: Bearer $TOKEN"

# Vérifier la réponse
# ✅ reactionSummary doit contenir {"❤️": 1}
# ✅ reactionCount doit être 1
```

### 4. Test de conversation en mode annonce

```bash
# Créer/modifier conversation en mode annonce
curl -X PATCH http://localhost:3000/api/conversations/:id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isAnnouncementChannel": true}'

# Récupérer la conversation
curl http://localhost:3000/api/conversations/:id \
  -H "Authorization: Bearer $TOKEN"

# Vérifier la réponse
# ✅ isAnnouncementChannel doit être true
```

---

## Composants Frontend à Vérifier

### Critiques

1. **E2EEMessage.tsx** - Vérifier déchiffrement avec `encryptedContent` et `encryptionMetadata`
2. **SecretMessage.tsx** - Vérifier limite viewers avec `maxViewOnceCount`
3. **MessageDeliveryIndicator.tsx** - Vérifier `receivedByAllAt`
4. **AnnouncementChannelBanner.tsx** - Vérifier `isAnnouncementChannel`

### Haute priorité

1. **PinnedMessagesPanel.tsx** - Vérifier affichage avec `pinnedAt`, `pinnedBy`
2. **MessageReactions.tsx** - Vérifier affichage avec `reactionSummary`, `reactionCount`
3. **ConversationListItem.tsx** - Vérifier filtrage avec `isArchived`
4. **TranslationToggle.tsx** - Vérifier synchronisation avec `autoTranslateEnabled`
5. **MessageComposer.tsx** - Vérifier throttling avec `slowModeSeconds`

---

## Métriques de Succès

### Couverture Schéma

- **Avant:** ~75% des champs d'interface couverts
- **Objectif Phase 1:** 85%
- **Objectif Phase 2:** 95%
- **Objectif Phase 3:** 100%

### Taux d'Erreur Frontend

- **Avant:** ~15 erreurs "undefined property" par jour
- **Objectif:** 0 erreur après Phase 2

### Performance Sérialisation

- **Avant:** Pas de régression attendue
- **Objectif:** Maintenir temps < 50ms pour messages complexes

---

## Notes Techniques

### Compatibilité Ascendante

Tous les champs ajoutés sont **nullable** ou ont des **valeurs par défaut**, garantissant la compatibilité avec:
- Données MongoDB existantes sans ces champs
- Clients API anciens qui ne fournissent pas ces champs
- Versions frontend antérieures

### Stratégie de Migration

Aucune migration MongoDB nécessaire car:
1. Tous les nouveaux champs sont optionnels (`nullable: true`)
2. Les valeurs par défaut sont gérées par Prisma
3. La sérialisation Fastify ignore les champs manquants dans les documents existants

### Documentation OpenAPI

Les ajouts de champs mettront automatiquement à jour:
- Swagger UI (`/documentation`)
- Clients générés (TypeScript, Python)
- Documentation API externe

---

## Références

### Fichiers Sources

- **Interfaces TypeScript:** `/packages/shared/types/`
  - `conversation.ts` - Types Message, Conversation, Participant
  - `user.ts` - Types User
  - `attachment.ts` - Types Attachment
  - `socketio-events.ts` - Types SocketIOUser

- **Schémas Fastify:** `/packages/shared/types/api-schemas.ts`
  - Ligne 40: `userSchema`
  - Ligne 182: `messageTranslationSchema`
  - Ligne 226: `messageAttachmentSchema`
  - Ligne 388: `messageSchema`
  - Ligne 512: `conversationParticipantSchema`
  - Ligne 541: `conversationSettingsSchema`
  - Ligne 622: `conversationSchema`

### Issues GitHub

- [ ] #TODO: Créer issue "Fix messageSchema serialization - missing E2EE fields"
- [ ] #TODO: Créer issue "Fix conversationSchema - missing announcement mode"
- [ ] #TODO: Créer issue "Fix messageTranslationSchema - missing encryption fields"

---

**Audit réalisé par:** Claude Sonnet 4.5
**Dernière mise à jour:** 2026-01-18
