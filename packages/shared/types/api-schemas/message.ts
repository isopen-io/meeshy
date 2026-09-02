/**
 * Schémas d’API pour les messages : traductions, expéditeur anonyme, formes complète et minimale.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/message
 */

import { messageAttachmentSchema, sharedPlaceResponseSchema } from './message-attachment.js';
import { MESSAGE_STICKER_ANIMATIONS } from '../message-sticker.js';
import { userMinimalSchema } from './user.js';

// =============================================================================
// MESSAGE SCHEMAS
// =============================================================================

/**
 * Message translation schema
 */
export const messageTranslationSchema = {
  type: 'object',
  description: 'Translation of a message to a specific language',
  properties: {
    id: { type: 'string', description: 'Translation unique identifier' },
    messageId: { type: 'string', description: 'Parent message ID' },
    targetLanguage: { type: 'string', description: 'Target language code (ISO 639-1)' },
    translatedContent: { type: 'string', description: 'Translated message content' },
    translationModel: {
      type: 'string',
      enum: ['basic', 'medium', 'premium'],
      description: 'Translation model used'
    },
    confidenceScore: { type: 'number', nullable: true, description: 'Translation confidence (0-1)' },
    sourceLanguage: { type: 'string', nullable: true, description: 'Source language code' },
    cached: { type: 'boolean', nullable: true, description: 'Whether translation was from cache' },
    createdAt: { type: 'string', format: 'date-time', description: 'Translation creation timestamp' },
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
    }
  }
} as const;

/**
 * Anonymous sender info schema
 */
export const anonymousSenderSchema = {
  type: 'object',
  description: 'Anonymous participant sender information',
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    username: { type: 'string', description: 'Generated anonymous username' },
    firstName: { type: 'string', description: 'Anonymous first name' },
    lastName: { type: 'string', description: 'Anonymous last name' },
    language: { type: 'string', description: 'Preferred language' },
    isMeeshyer: { type: 'boolean', description: 'Is a registered Meeshy user' }
  }
} as const;

/**
 * Forme de RÉPONSE du sticker hissé depuis `metadata.sticker` (#4823).
 *
 * Source unique pour la même raison que `sharedPlaceResponseSchema` :
 * fast-json-stringify TRONQUE en silence tout champ qu'un schéma de réponse ne
 * déclare pas. Un `slots` déclaré sans `additionalProperties` sortirait `{}`
 * — le gabarit s'afficherait sans ses textes, sans qu'aucun témoin rougisse.
 * Toute réponse hissant `sticker` doit épandre CE schéma, en ne surchargeant
 * que `description`.
 */
export const messageStickerResponseSchema = {
  type: 'object',
  nullable: true,
  description: 'Sticker (gabarit + slots + animation, ou emoji) — hissé depuis metadata.sticker, validé serveur ; null si absent',
  properties: {
    templateId: { type: 'string' },
    slots: { type: 'object', additionalProperties: { type: 'string' } },
    animation: { type: 'string', enum: [...MESSAGE_STICKER_ANIMATIONS] },
    emoji: { type: 'string' }
  }
} as const;

/**
 * Message schema for API responses
 * Aligned with schema.prisma Message model
 */
export const messageSchema = {
  type: 'object',
  description: 'Chat message with translations and metadata',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Message unique identifier (MongoDB ObjectId)' },
    clientMessageId: {
      type: 'string',
      nullable: true,
      description: 'Client-generated idempotency key (cid_<uuid v4>) — optimistic-send reconciliation key. MUST be exposed so clients can match an optimistic row to its server record and avoid duplicate bubbles.'
    },
    conversationId: { type: 'string', description: 'Parent conversation ID' },
    senderId: { type: 'string', description: 'Sender participant ID' },

    // Content
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
    metadata: {
      type: 'object',
      nullable: true,
      // `additionalProperties: true` — sans lui, fast-json-stringify strippe
      // SILENCIEUSEMENT le contenu de metadata à la sérialisation de la
      // réponse (même piège que le schéma inline de `GET /messages/:messageId`
      // et que `messageMinimalSchema`). Les routes construisent bien
      // `metadata: message.metadata`, mais le client ne recevait rien : la
      // bulle système d'appel restait bloquée sur `kind: 'call-live'`
      // ("Appel en cours / Toucher pour rejoindre") pour toujours, la
      // transition vers `kind: 'call'` (édition du MÊME message côté gateway)
      // n'atteignant jamais l'app.
      additionalProperties: true,
      description: 'Structured per-type payload (call-summary facts, postReplyTo, location…) — forme libre'
    },

    // State
    isEdited: { type: 'boolean', description: 'Message has been edited' },
    editedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Edit timestamp' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Deletion timestamp (null = not deleted)' },

    // Reply & Forward
    replyToId: { type: 'string', nullable: true, description: 'ID of message being replied to' },
    postReplyTo: {
      type: 'object',
      nullable: true,
      description: 'Snapshot figé du post cité (status/story/reel/post) — mood emoji, contenu, date, vignette, compteurs like/commentaire/partage — capturé au moment de la réponse et stocké dans metadata.postReplyTo. Survit à l\'expiration du post. null seulement pour un message legacy dont le post a été supprimé avant le snapshot.',
      properties: {
        id: { type: 'string' },
        // STATUS | STORY | POST | REEL — pilote le rendu (mood vs story) côté client.
        type: { type: 'string', nullable: true },
        reactionCount: { type: 'integer' },
        commentCount: { type: 'integer' },
        shareCount: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
        thumbnailUrl: { type: 'string', nullable: true },
        previewText: { type: 'string' },
        // Non-null ⇒ mood/statut : citation dédiée emoji + contenu + date.
        moodEmoji: { type: 'string', nullable: true }
      }
    },
    location: {
      ...sharedPlaceResponseSchema,
      description: 'Lieu partagé (position figée + POI enrichi) — hissé depuis metadata.location. Validé serveur (parseSharedPlace) ; null si le message ne porte aucun lieu.'
    },
    sticker: {
      ...messageStickerResponseSchema,
      description: 'Sticker du message — hissé depuis metadata.sticker. Validé serveur (parseMessageSticker) ; null si le message n’en porte aucun.'
    },
    replyTo: {
      type: 'object',
      nullable: true,
      description: 'Nested reply-to message details (when include_replies=true)',
      properties: {
        id: { type: 'string' },
        content: { type: 'string' },
        originalLanguage: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        senderId: { type: 'string', nullable: true },
        validatedMentions: { type: 'array', items: { type: 'string' } },
        sender: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', nullable: true },
            username: { type: 'string' },
            displayName: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            // Même discriminant que sur `messageSchema.sender` : une citation
            // d'un auteur sans compte doit le dire aussi, sinon le marqueur
            // disparaît dès qu'on cite quelqu'un.
            type: { type: 'string', enum: ['user', 'anonymous', 'bot'] }
          }
        },
        anonymousSender: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' }
          }
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              fileName: { type: 'string' },
              originalName: { type: 'string' },
              mimeType: { type: 'string' },
              fileSize: { type: 'number' },
              fileUrl: { type: 'string' },
              thumbnailUrl: { type: 'string', nullable: true },
              width: { type: 'number', nullable: true },
              height: { type: 'number', nullable: true },
              duration: { type: 'number', nullable: true },
              // La protection du média cité, DÉCLARÉE ici sous peine d'être
              // retirée. `attachmentFullSelect` la rend depuis toujours, mais
              // cette copie inline est plus pauvre que `messageAttachmentSchema`
              // (qui, lui, les déclare) : fast-json-stringify les strippait du
              // seul chemin REST. Côté client l'absence n'est pas un champ
              // manquant mais une INVERSION — `declaredProtection` rend `nil`
              // quand les deux sont absents, un silence que la citation lit
              // comme « rien à protéger », et la vignette d'un média à vue
              // unique s'affichait entière après un rechargement pendant que
              // le même message reçu par socket restait masqué.
              isViewOnce: { type: 'boolean' },
              isBlurred: { type: 'boolean' }
            }
          }
        },
        _count: {
          type: 'object',
          nullable: true,
          properties: {
            reactions: { type: 'number' }
          }
        }
      }
    },
    forwardedFromId: { type: 'string', nullable: true, description: 'Original message ID if forwarded' },
    forwardedFromConversationId: { type: 'string', nullable: true, description: 'Original conversation ID if forwarded' },
    // Les deux objets IMBRIQUÉS de l'aperçu de transfert. `GET
    // /conversations/:id/messages` les construit (deux requêtes Prisma par
    // page) ; sans déclaration ici, fast-json-stringify les strippait en
    // silence — la bulle transférée arrivait sans auteur d'origine, sans
    // vignette et sans nom de conversation source, exactement comme
    // `metadata` plus haut. Toute évolution de la forme construite par la
    // route doit se refléter ici, sinon le champ neuf disparaît sans signal.
    forwardedFrom: {
      type: 'object',
      nullable: true,
      description: 'Message d’ORIGINE d’un transfert — expéditeur résolu, première pièce jointe (chip), lieu partagé. null quand la source a été purgée.',
      properties: {
        id: { type: 'string' },
        content: { type: 'string', nullable: true },
        messageType: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        sender: {
          type: 'object',
          nullable: true,
          description: 'Expéditeur d’origine, résolu (displayName / avatar / username hissés du User quand le participant n’en porte pas)',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', nullable: true },
            username: { type: 'string', nullable: true },
            displayName: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true }
          }
        },
        attachments: {
          type: 'array',
          nullable: true,
          description: 'Première pièce jointe de l’origine (attachmentForwardPreviewSelect, take: 1) — la vignette du transfert de média',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mimeType: { type: 'string' },
              thumbnailUrl: { type: 'string', nullable: true },
              fileUrl: { type: 'string', nullable: true }
            }
          }
        },
        location: {
          ...sharedPlaceResponseSchema,
          description: 'Lieu du message TRANSFÉRÉ (Lot 2) — hissé de son propre metadata.location, jamais celui du porteur'
        },
        sticker: {
          ...messageStickerResponseSchema,
          description: 'Sticker du message TRANSFÉRÉ — hissé de son propre metadata.sticker, jamais celui du porteur'
        }
      }
    },
    forwardedFromConversation: {
      type: 'object',
      nullable: true,
      description: 'Conversation SOURCE du transfert (« Transféré de … ») — absente quand la provenance n’a pas été transmise ou n’existe plus',
      properties: {
        id: { type: 'string' },
        title: { type: 'string', nullable: true },
        identifier: { type: 'string', nullable: true },
        type: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true }
      }
    },

    // Expiration & View-once
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Self-destruct timestamp' },
    isViewOnce: { type: 'boolean', description: 'View-once message (disappears after view)' },
    viewOnceCount: { type: 'number', description: 'Number of unique viewers' },
    isBlurred: { type: 'boolean', description: 'Content blurred until tap to reveal' },
    // Bitfield des effets, recomposé serveur (`MessageProcessor.saveMessage`)
    // depuis isBlurred / expiresAt / isViewOnce. La route l'émet déjà au
    // niveau message ; non déclaré, il ne franchissait pas le sérialiseur —
    // les clients qui lisent le bitfield plutôt que les trois colonnes
    // rendaient donc une copie transférée comme un message ordinaire.
    effectFlags: { type: 'number', description: 'Bitfield for message effects (blurred / ephemeral / view-once)' },

    // Pinning
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

    // Delivery Status
    deliveredCount: { type: 'number', description: 'Number of recipients who received the message' },
    readCount: { type: 'number', description: 'Number of recipients who read the message' },
    recipientCount: { type: 'number', description: 'Number of active recipients (participants excluding the sender) — all-or-nothing denominator' },
    deliveredToAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Delivered to all timestamp' },
    readByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Read by all timestamp' },

    // Reactions
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

    // Mentions
    validatedMentions: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Array of validated user IDs mentioned in message'
    },

    // Encryption
    //
    // `encryptionMode` était annoté ici « only on Conversation ». C'est FAUX :
    // `schema.prisma` le porte sur `Message` aussi (« Encryption mode: e2ee,
    // server, hybrid »), deux routes le CHARGENT (`conversations/messages.ts`
    // pour la liste, `messages.ts` pour le détail) et le SDK iOS le DÉCLARE sur
    // son message (`APIMessage.encryptionMode`, décodé). Il manquait ici, et
    // seulement ici — mesuré au sérialiseur sur la charge utile de la liste :
    //
    //   in  : { …, isEncrypted: true, encryptionMode: 'e2ee', encryptedContent }
    //   out : { …, isEncrypted: true,                         encryptedContent }
    //
    // Un client E2EE recevait donc `isEncrypted: true` et le chiffré, sans
    // jamais savoir SOUS QUEL RÉGIME déchiffrer. C'est le même défaut que le
    // R5 des pièces jointes, une couche plus haut : `messageAttachmentSchema`
    // a gagné son enveloppe E2EE et un cliquet
    // (`attachmentIncludes.test.ts`), le MESSAGE porteur ne l'avait pas.
    isEncrypted: { type: 'boolean', description: 'Message is encrypted' },
    encryptionMode: {
      type: 'string',
      nullable: true,
      description: 'Encryption mode of this message: e2ee, server, hybrid (null = not encrypted)'
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

    // View-once limit
    maxViewOnceCount: {
      type: 'number',
      nullable: true,
      description: 'Maximum unique viewers allowed for view-once messages'
    },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Message creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' },
    timestamp: { type: 'string', format: 'date-time', description: 'Alias for createdAt' },

    // Sender info (populated)
    sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
    anonymousSender: { ...anonymousSenderSchema, nullable: true, description: 'Anonymous sender info' },

    // Translations
    translations: {
      type: 'array',
      items: messageTranslationSchema,
      description: 'Available translations'
    },

    // Attachments
    attachments: {
      type: 'array',
      items: messageAttachmentSchema,
      nullable: true,
      description: 'Message attachments (files, images, etc.)'
    }
  }
} as const;

/**
 * Minimal message schema for lists (includes sender & attachments for ConversationList display)
 */
export const messageMinimalSchema = {
  type: 'object',
  description: 'Minimal message data for conversation lists',
  properties: {
    id: { type: 'string', description: 'Message ID' },
    content: { type: 'string', description: 'Message content (truncated)' },
    senderId: { type: 'string', nullable: true, description: 'Sender ID' },
    messageType: { type: 'string', description: 'Message type' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    // Lot 3 (partage de position) — hissé depuis metadata.location. Un
    // message géolocalisé sans légende a un `content` vide ; ce champ est
    // ce qui permet au client de rendre malgré tout un aperçu pertinent.
    // Absent du schéma = tronqué en silence par fast-json-stringify, cf.
    // le commentaire de `cursorPagination` plus bas dans ce fichier.
    location: {
      ...sharedPlaceResponseSchema,
      description: 'Lieu partagé (aperçu de conversation) — validé serveur, null si absent'
    },
    sticker: {
      ...messageStickerResponseSchema,
      description: 'Sticker (aperçu de conversation) — validé serveur, null si absent'
    },
    // Sender info (required for ConversationList.tsx getSenderName())
    sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
    anonymousSender: { ...anonymousSenderSchema, nullable: true, description: 'Anonymous sender info' },
    // Attachments (required for ConversationList.tsx attachment preview)
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Attachment ID' },
          mimeType: { type: 'string', description: 'MIME type' },
          originalName: { type: 'string', nullable: true, description: 'Original filename' },
          width: { type: 'number', nullable: true, description: 'Width (images/videos)' },
          height: { type: 'number', nullable: true, description: 'Height (images/videos)' },
          duration: { type: 'number', nullable: true, description: 'Duration in ms (audio/video)' },
          fps: { type: 'number', nullable: true, description: 'FPS (videos)' },
          bitrate: { type: 'number', nullable: true, description: 'Bitrate (audio/video)' },
          sampleRate: { type: 'number', nullable: true, description: 'Sample rate (audio)' },
          pageCount: { type: 'number', nullable: true, description: 'Page count (PDFs)' },
          lineCount: { type: 'number', nullable: true, description: 'Line count (code/text)' },
          // La JUMELLE de `messageAttachmentSchema.metadata` — celle de
          // l'APERÇU de conversation, pas celle du fil — et elle portait le
          // même objet NU, avec une description qui NOMMAIT
          // `audioEffectsTimeline` pendant qu'elle le supprimait.
          metadata: { type: 'object', nullable: true, additionalProperties: true, description: 'Additional metadata (audioEffectsTimeline, etc.)' }
        }
      },
      nullable: true,
      description: 'Message attachments for preview (typically truncated to first item; total count lives in `_count.attachments`)'
    },
    // Prisma exposes a `_count` relation for nested counts. The gateway
    // returns `_count: { attachments: N }` so the client can render the
    // "+N" badge in conversation rows even when `attachments` above is
    // truncated to a single preview item. Without this field declared,
    // Fastify's response serializer silently strips it from the payload.
    _count: {
      type: 'object',
      nullable: true,
      description: 'Nested Prisma counts',
      properties: {
        attachments: { type: 'number', description: 'Total attachments on the message' }
      }
    }
  }
} as const;
