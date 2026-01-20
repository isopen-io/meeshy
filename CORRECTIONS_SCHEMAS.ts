/**
 * CORRECTIONS SCHÉMAS FASTIFY - Prêt à copier-coller
 *
 * Fichier: /Users/smpceo/Documents/v2_meeshy/packages/shared/types/api-schemas.ts
 * Date: 2026-01-18
 *
 * Instructions:
 * 1. Ouvrir api-schemas.ts
 * 2. Localiser le schéma à corriger (numéros de ligne indiqués)
 * 3. Copier-coller les propriétés manquantes dans le bloc `properties: { ... }`
 * 4. Vérifier que la syntaxe est correcte (virgules, accolades)
 * 5. Exécuter `npm run build` pour valider
 */

// =============================================================================
// 🔥 PHASE 1: CRITIQUE (À corriger immédiatement)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. messageSchema (ligne 388)
// Ajouter dans messageSchema.properties après la ligne 441 (timestamp)
// -----------------------------------------------------------------------------

// CRITIQUE: Champs E2EE manquants (bloque déchiffrement)
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

// CRITIQUE: Champs de livraison manquants
receivedByAllAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Received by all recipients timestamp'
},

// CRITIQUE: Limite viewers pour view-once
maxViewOnceCount: {
  type: 'number',
  nullable: true,
  description: 'Maximum unique viewers allowed for view-once messages'
},

// -----------------------------------------------------------------------------
// 2. conversationSchema (ligne 622)
// Ajouter dans conversationSchema.properties après la ligne 677 (encryptionEnabledAt)
// -----------------------------------------------------------------------------

// CRITIQUE: Rotation de clés serveur
serverEncryptionKeyId: {
  type: 'string',
  nullable: true,
  description: 'Server-side encryption key ID for key rotation'
},

// CRITIQUE: Mode annonce (restriction écriture)
isAnnouncementChannel: {
  type: 'boolean',
  nullable: true,
  description: 'Announcement-only mode (only creator/admins can write)',
  default: false
},

// =============================================================================
// ⚠️ PHASE 2: HAUTE PRIORITÉ (Corriger sous 7 jours)
// =============================================================================

// -----------------------------------------------------------------------------
// 3. messageSchema - Suite des champs haute priorité
// Ajouter dans messageSchema.properties (suite de Phase 1)
// -----------------------------------------------------------------------------

// HAUTE: Messages épinglés
pinnedAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Date when message was pinned (null = not pinned)'
},
pinnedBy: {
  type: 'string',
  nullable: true,
  description: 'User ID who pinned the message'
},

// HAUTE: Réactions
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

// HAUTE: Mentions validées
validatedMentions: {
  type: 'array',
  items: { type: 'string' },
  nullable: true,
  description: 'Array of validated user IDs mentioned in message'
},

// -----------------------------------------------------------------------------
// 4. conversationSchema - Suite des champs haute priorité
// Ajouter dans conversationSchema.properties (suite de Phase 1)
// -----------------------------------------------------------------------------

// HAUTE: Statut archivé (rétrocompatibilité)
isArchived: {
  type: 'boolean',
  nullable: true,
  description: 'Conversation is archived (use status=archived instead)',
  deprecated: true
},

// HAUTE: Configuration E2EE
encryptionProtocol: {
  type: 'string',
  nullable: true,
  description: 'Encryption protocol used (aes-256-gcm, signal_v3)'
},

// HAUTE: Auto-traduction
autoTranslateEnabled: {
  type: 'boolean',
  nullable: true,
  description: 'Auto-translation enabled (disabled for E2EE conversations)'
},

// HAUTE: Permissions d'écriture
defaultWriteRole: {
  type: 'string',
  enum: ['everyone', 'member', 'moderator', 'admin', 'creator'],
  nullable: true,
  description: 'Minimum role required to send messages'
},

// HAUTE: Mode ralenti (anti-spam)
slowModeSeconds: {
  type: 'number',
  nullable: true,
  description: 'Minimum seconds between messages per user (0 = disabled)',
  default: 0
},

// -----------------------------------------------------------------------------
// 5. messageTranslationSchema (ligne 182)
// Ajouter dans messageTranslationSchema.properties après la ligne 198 (createdAt)
// -----------------------------------------------------------------------------

// HAUTE: Timestamp de mise à jour
updatedAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Translation last update timestamp'
},

// HAUTE: Encryption fields pour conversations sécurisées
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

// =============================================================================
// 📝 PHASE 3: MOYENNE PRIORITÉ (Nice to have)
// =============================================================================

// -----------------------------------------------------------------------------
// 6. conversationSchema - Champs audit
// Ajouter dans conversationSchema.properties (suite de Phase 2)
// -----------------------------------------------------------------------------

// MOYENNE: Audit E2EE
encryptionEnabledBy: {
  type: 'string',
  nullable: true,
  description: 'User ID who enabled encryption (for audit purposes)'
},

// =============================================================================
// EXEMPLE D'INTÉGRATION COMPLÈTE
// =============================================================================

/*
Voici comment le messageSchema devrait ressembler APRÈS toutes les corrections:

export const messageSchema = {
  type: 'object',
  description: 'Chat message with translations and metadata',
  properties: {
    // ===== IDENTIFIANTS =====
    id: { type: 'string', description: 'Message unique identifier (MongoDB ObjectId)' },
    conversationId: { type: 'string', description: 'Parent conversation ID' },
    senderId: { type: 'string', nullable: true, description: 'Authenticated user sender ID' },
    anonymousSenderId: { type: 'string', nullable: true, description: 'Anonymous participant sender ID' },

    // ===== CONTENU =====
    content: { type: 'string', description: 'Message content (original language)' },
    originalLanguage: { type: 'string', description: 'Original message language (ISO 639-1)' },
    messageType: {
      type: 'string',
      enum: ['text', 'image', 'file', 'audio', 'video', 'location', 'system'],
      description: 'Type of message'
    },
    messageSource: {
      type: 'string',
      enum: ['user', 'system', 'ads', 'app', 'agent', 'authority'],
      description: 'Source/origin of the message'
    },

    // ===== ÉTAT =====
    isEdited: { type: 'boolean', description: 'Message has been edited' },
    editedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Edit timestamp' },
    isDeleted: { type: 'boolean', description: 'Message has been deleted' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Deletion timestamp' },

    // ===== RÉPONSE & FORWARDING =====
    replyToId: { type: 'string', nullable: true, description: 'ID of message being replied to' },
    forwardedFromId: { type: 'string', nullable: true, description: 'Original message ID if forwarded' },
    forwardedFromConversationId: { type: 'string', nullable: true, description: 'Original conversation ID if forwarded' },

    // ===== EXPIRATION & VIEW-ONCE =====
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Self-destruct timestamp' },
    isViewOnce: { type: 'boolean', description: 'View-once message (disappears after view)' },
    viewOnceCount: { type: 'number', description: 'Number of unique viewers' },
    maxViewOnceCount: { type: 'number', nullable: true, description: 'Maximum unique viewers allowed' }, // ✅ AJOUTÉ
    isBlurred: { type: 'boolean', description: 'Content blurred until tap to reveal' },

    // ===== PINNING =====
    pinnedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date when message was pinned' }, // ✅ AJOUTÉ
    pinnedBy: { type: 'string', nullable: true, description: 'User ID who pinned the message' }, // ✅ AJOUTÉ

    // ===== DELIVERY STATUS =====
    deliveredCount: { type: 'number', description: 'Number of recipients who received the message' },
    readCount: { type: 'number', description: 'Number of recipients who read the message' },
    deliveredToAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Delivered to all timestamp' },
    receivedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Received by all timestamp' }, // ✅ AJOUTÉ
    readByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Read by all timestamp' },

    // ===== RÉACTIONS =====
    reactionSummary: { // ✅ AJOUTÉ
      type: 'object',
      nullable: true,
      description: 'Reaction counts by emoji (e.g., {"❤️": 5, "👍": 3})',
      additionalProperties: { type: 'number' }
    },
    reactionCount: { type: 'number', description: 'Total number of reactions', default: 0 }, // ✅ AJOUTÉ

    // ===== E2EE / ENCRYPTION =====
    isEncrypted: { type: 'boolean', description: 'Message is encrypted' },
    encryptedContent: { type: 'string', nullable: true, description: 'Base64 encoded ciphertext' }, // ✅ AJOUTÉ
    encryptionMetadata: { // ✅ AJOUTÉ
      type: 'object',
      nullable: true,
      description: 'Encryption metadata (IV, auth tag, key version)',
      additionalProperties: true
    },

    // ===== MENTIONS =====
    validatedMentions: { // ✅ AJOUTÉ
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Array of validated user IDs mentioned in message'
    },

    // ===== TIMESTAMPS =====
    createdAt: { type: 'string', format: 'date-time', description: 'Message creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' },
    timestamp: { type: 'string', format: 'date-time', description: 'Alias for createdAt' },

    // ===== SENDER INFO =====
    sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
    anonymousSender: { ...anonymousSenderSchema, nullable: true, description: 'Anonymous sender info' },

    // ===== TRADUCTIONS =====
    translations: {
      type: 'array',
      items: messageTranslationSchema,
      description: 'Available translations'
    },

    // ===== ATTACHMENTS =====
    attachments: {
      type: 'array',
      items: messageAttachmentSchema,
      nullable: true,
      description: 'Message attachments (files, images, etc.)'
    }
  }
} as const;
*/

// =============================================================================
// CHECKLIST DE VALIDATION POST-CORRECTION
// =============================================================================

/*
Après avoir appliqué les corrections, vérifier:

✅ 1. Compilation TypeScript
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/packages/shared
   npm run build
   ```

✅ 2. Validation des schémas
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/services/gateway
   npm run test:schemas
   ```

✅ 3. Documentation Swagger
   ```bash
   # Démarrer le gateway
   npm run dev
   # Ouvrir http://localhost:3000/documentation
   # Vérifier que les nouveaux champs apparaissent dans les modèles
   ```

✅ 4. Tests de sérialisation
   ```bash
   npm run test:serialization
   ```

✅ 5. Tests E2E frontend
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/apps/web
   npm run test:e2e -- --grep "E2EE|pinned|reactions"
   ```

✅ 6. Vérification runtime
   - Créer un message chiffré → Vérifier encryptedContent dans la réponse
   - Épingler un message → Vérifier pinnedAt/pinnedBy dans la réponse
   - Ajouter une réaction → Vérifier reactionSummary dans la réponse
   - Activer mode annonce → Vérifier isAnnouncementChannel dans la réponse
*/

// =============================================================================
// NOTES IMPORTANTES
// =============================================================================

/*
🔒 SÉCURITÉ:
- Tous les champs E2EE (encryptedContent, encryptionMetadata) sont nullable
- Ne JAMAIS exposer les clés privées dans les schémas API
- Les IVs et auth tags sont publics et nécessaires pour le déchiffrement

📦 COMPATIBILITÉ:
- Tous les nouveaux champs sont nullable ou ont une valeur par défaut
- Pas de migration MongoDB requise
- Les anciens documents restent valides

⚡ PERFORMANCE:
- Les champs additionalProperties: true permettent la flexibilité
- Fastify sérialisera uniquement les champs présents dans les documents
- Pas d'impact sur la taille des réponses pour les anciens documents

📝 DOCUMENTATION:
- Chaque champ a une description claire pour Swagger
- Les enums sont exhaustifs pour validation stricte
- Les formats date-time sont validés automatiquement

🧪 TESTS:
- Ajouter des tests unitaires pour chaque nouveau champ
- Vérifier la sérialisation avec/sans les nouveaux champs
- Tester la compatibilité ascendante avec anciens documents
*/

export {};
