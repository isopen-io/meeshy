import { z } from 'zod';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { messageAttachmentSchema, sharedPlaceResponseSchema } from '@meeshy/shared/types/api-schemas';

/**
 * `allowedCountries` — ACCEPTÉ VIDE, REFUSÉ NON VIDE (#4354, suite de #4167).
 *
 * #4167 a retiré ce champ de la loi d'admission : le filtrer exigerait une base
 * GeoIP que la passerelle n'embarque pas, et **un contrôle décoratif est pire
 * qu'une absence, parce qu'on compte dessus**. La décision était prise côté
 * admission et n'avait pas atteint la porte de création : l'API l'acceptait
 * encore et l'interface l'affichait comme appliqué. Quelqu'un pouvait cocher
 * « limiter aux pays suivants », le voir confirmé, et partager le lien en
 * croyant qu'il était géo-restreint.
 *
 * ## Pourquoi refuser le NON VIDE plutôt que le champ
 *
 * Mesuré sur l'intégration le 2026-08-31 : **dix liens sur dix portent le
 * champ, aucun ne porte de valeur.** Les clients publiés l'envoient donc, à
 * vide, à chaque création. Un 400 sur la simple PRÉSENCE casserait toute
 * création de lien jusqu'à leur mise à jour.
 *
 * Le refus se déclenche exactement là où l'utilisateur serait trompé — quand il
 * DEMANDE une restriction. Un tableau vide ne demande rien : il est accepté, et
 * ignoré comme il l'a toujours été.
 *
 * Le retrait muet a été écarté : il laisserait croire que l'écriture a réussi,
 * ce qui est précisément le défaut qu'on ferme.
 */
const CHAMP_PAYS_INERTE = z
  .array(z.string())
  .max(0, "allowedCountries n'est plus appliqué (#4167) : un filtre par pays exigerait une base GeoIP que la passerelle n'embarque pas. Retirez le champ, ou laissez-le vide.")
  .optional();

// ═══════════════════════════════════════════════════════════════════════════
// ZOD VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const createLinkSchema = z.object({
  conversationId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  maxUses: z.number().int().positive().optional(),
  maxConcurrentUsers: z.number().int().positive().optional(),
  maxUniqueSessions: z.number().int().positive().optional(),
  expiresAt: z.iso.datetime().optional(),
  allowAnonymousMessages: z.boolean().optional(),
  allowAnonymousFiles: z.boolean().optional(),
  allowAnonymousImages: z.boolean().optional(),
  allowViewHistory: z.boolean().optional(),
  requireAccount: z.boolean().optional(),
  requireNickname: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requireBirthday: z.boolean().optional(),
  allowedCountries: CHAMP_PAYS_INERTE,
  allowedLanguages: z.array(z.string()).optional(),
  allowedIpRanges: z.array(z.string()).optional(),
  newConversation: z.object({
    title: z.string().min(1, 'Le titre de la conversation est requis'),
    description: z.string().optional(),
    memberIds: z.array(z.string()).optional()
  }).optional()
});

export const updateLinkSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxConcurrentUsers: z.number().int().positive().nullable().optional(),
  maxUniqueSessions: z.number().int().positive().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  allowAnonymousMessages: z.boolean().optional(),
  allowAnonymousFiles: z.boolean().optional(),
  allowAnonymousImages: z.boolean().optional(),
  allowViewHistory: z.boolean().optional(),
  requireAccount: z.boolean().optional(),
  requireNickname: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requireBirthday: z.boolean().optional(),
  allowedCountries: CHAMP_PAYS_INERTE,
  allowedLanguages: z.array(z.string()).optional(),
  allowedIpRanges: z.array(z.string()).optional()
});

import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';





export const sendMessageSchema = z.object({
  content: z.string().max(1000, 'Message is too long').optional(),
  // Phase 4 §6.2 — mandatory `cid_<uuid v4 lowercase>` even for anonymous
  // share-link sends, so the gateway dedup contract holds across the REST
  // and Socket.IO surfaces without forking schemas per surface.
  clientMessageId: z
    .string()
    .regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format (expected cid_<uuid v4 lowercase>)'),
  // Canonicalize at the write boundary — clients emit the raw platform locale
  // (iOS `fr_FR`, web `fr-FR`, `en-US`), and both share-link `message.create`
  // sites persist this value verbatim. Mirrors iteration 218's MessagingService
  // fix via the same `normalizeLanguageCode` SSOT: reducible locales collapse to
  // their canonical code (`fr-FR` → `fr`), while irreducible codes (`bas`, or an
  // unknown 2-letter code) are preserved via `?? v` — zero data loss, no round
  // trip. Idempotent on already-canonical codes, so existing `'fr'` rows and
  // callers are unaffected.
  originalLanguage: z
    .string()
    .default('fr')
    .transform((v) => normalizeLanguageCode(v) ?? v),
  messageType: z.string().default('text'),
  // Accepté puis IGNORÉ, et c'est délibéré : aucune des deux routes d'envoi par
  // lien ne lit ce champ — ni `message.create`, ni la diffusion, ni la
  // notification. Il reste déclaré pour qu'un client qui l'envoie à côté d'un
  // contenu ne soit pas refusé, mais il ne peut plus DISPENSER du contenu
  // (cf. le `refine` ci-dessous).
  attachments: z.array(z.string()).optional(),
  // Lieu partagé — champ dédié, jamais un `metadata` brut (cf.
  // services/location/sharedPlace.ts). Ce chemin (message via lien de
  // partage / participant anonyme) CONTOURNE MessagingService.handleMessage :
  // la validation via `parseSharedPlace` est donc appelée directement dans
  // ce module (routes/links/messages.ts), pas dans MessageProcessor.
  location: z.unknown().optional()
}).refine((data) => {
  // Le contenu est REQUIS, sans dispense.
  //
  // Ce `refine` admettait jusqu'ici « contenu OU pièces jointes ». La disjonction
  // décrivait une fonctionnalité qui n'existe nulle part : les deux routes qui
  // emploient ce schéma (`routes/links/messages.ts`, anonyme et authentifiée)
  // n'ont jamais lu `body.attachments`. La branche ouverte ne menait donc pas à
  // l'envoi d'une pièce jointe — elle menait à
  // `trackingLinkService.processMessageLinks`, dont le paramètre est typé
  // `content: string` et qui appelle `content.match()` sans garde. Un corps
  // `{ clientMessageId, attachments: [...] }` passait la validation puis
  // produisait un **500**, déclenchable par un invité ANONYME détenant l'URL de
  // partage — le gateway compilant en `strict: false`, aucun `string | undefined`
  // n'a été signalé à la frontière.
  //
  // Refuser est la seule réponse honnête tant que les routes ne servent pas les
  // pièces jointes : accepter puis abandonner le champ ferait croire à l'envoi
  // d'un fichier qui n'a jamais existé. Le jour où ces routes les serviront, la
  // dispense reviendra ICI, avec le chemin d'écriture qui la justifie.
  return Boolean(data.content && data.content.trim().length > 0);
}, {
  message: 'Message content cannot be empty'
});

// ═══════════════════════════════════════════════════════════════════════════
// JSON SCHEMAS FOR OPENAPI DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const shareLinkSchema = {
  type: 'object',
  description: 'Share link configuration and metadata',
  properties: {
    id: { type: 'string', description: 'Share link database ID' },
    linkId: { type: 'string', description: 'Public share link identifier (mshy_*)', example: 'mshy_67890abcdef12345_a1b2c3d4' },
    identifier: { type: 'string', description: 'Human-readable identifier', example: 'mshy_my-link' },
    conversationId: { type: 'string', description: 'Associated conversation ID' },
    name: { type: 'string', nullable: true, description: 'Link display name' },
    description: { type: 'string', nullable: true, description: 'Link description' },
    createdBy: { type: 'string', description: 'Creator user ID' },
    isActive: { type: 'boolean', description: 'Link active status', default: true },
    maxUses: { type: 'number', nullable: true, description: 'Maximum uses allowed' },
    maxConcurrentUsers: { type: 'number', nullable: true, description: 'Maximum concurrent users' },
    maxUniqueSessions: { type: 'number', nullable: true, description: 'Maximum unique sessions' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' },
    allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages', default: true },
    allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files', default: false },
    allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images', default: true },
    allowViewHistory: { type: 'boolean', description: 'Allow viewing message history', default: true },
    requireAccount: { type: 'boolean', description: 'Require user account', default: false },
    requireNickname: { type: 'boolean', description: 'Require nickname', default: true },
    requireEmail: { type: 'boolean', description: 'Require email', default: false },
    requireBirthday: { type: 'boolean', description: 'Require birthday', default: false },
    allowedCountries: { type: 'array', items: { type: 'string' }, description: 'Allowed country codes (ISO 3166-1 alpha-2)' },
    allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes (ISO 639-1)' },
    allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges (CIDR notation)' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

export const conversationSummarySchema = {
  type: 'object',
  description: 'Conversation summary information',
  properties: {
    id: { type: 'string', description: 'Conversation unique identifier' },
    identifier: { type: 'string', nullable: true, description: 'Conversation identifier (e.g., "meeshy")' },
    title: { type: 'string', description: 'Conversation title' },
    description: { type: 'string', nullable: true, description: 'Conversation description' },
    type: { type: 'string', enum: ['direct', 'group', 'public', 'global'], description: 'Conversation type' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

export const messageSenderSchema = {
  type: 'object',
  description: 'Message sender information',
  properties: {
    id: { type: 'string', description: 'Sender unique identifier' },
    username: { type: 'string', description: 'Sender username' },
    firstName: { type: 'string', description: 'Sender first name' },
    lastName: { type: 'string', description: 'Sender last name' },
    displayName: { type: 'string', nullable: true, description: 'Sender display name' },
    avatar: { type: 'string', nullable: true, description: 'Sender avatar URL' },
    isMeeshyer: { type: 'boolean', description: 'Is registered user (vs anonymous)' }
  }
} as const;

/**
 * L'expéditeur d'un message de lien de partage est un `Participant`, PAS un
 * `User` : les deux routes `POST /links/:identifier/messages[/auth]` le
 * chargent via `include: { sender: { select: ... } }`, et l'événement socket
 * `link:message:new` l'émet tel quel. `messageSenderSchema` décrit une forme
 * d'utilisateur (username / firstName / isMeeshyer) qu'un participant ne porte
 * pas : l'utiliser ici ne laissait passer que l'intersection (id, displayName,
 * avatar) et effaçait `userId`, `type`, `language` et le `user` imbriqué.
 */
export const linkMessageSenderSchema = {
  type: 'object',
  nullable: true,
  description: 'Participant that authored the message (registered or anonymous)',
  properties: {
    id: { type: 'string', description: 'Participant unique identifier' },
    userId: { type: 'string', nullable: true, description: 'Linked user ID (null for anonymous participants)' },
    displayName: { type: 'string', nullable: true, description: 'Participant display name' },
    avatar: { type: 'string', nullable: true, description: 'Participant avatar URL' },
    type: { type: 'string', description: 'Participant type (anonymous | member | ...)' },
    language: { type: 'string', nullable: true, description: 'Participant language code' },
    user: {
      type: 'object',
      nullable: true,
      description: 'Registered account behind the participant, when there is one',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        systemLanguage: { type: 'string', nullable: true }
      }
    }
  }
} as const;

/**
 * Corps du message rendu par les DEUX routes d'envoi via lien de partage —
 * réponse 201 ET événement socket `link:message:new`, qui construisent
 * désormais un objet unique (`buildLinkMessagePayload`).
 *
 * Déclarer chaque champ n'est pas de la documentation : fast-json-stringify
 * SUPPRIME en silence toute propriété absente du schéma de réponse. Les deux
 * routes émettaient déjà `isEdited`, `editedAt`, `deletedAt`, `replyToId`,
 * `updatedAt` et `location` — tous tronqués sans erreur ni log parce que le
 * schéma 201 ne les nommait pas. Ajouter un champ au payload sans l'ajouter
 * ici est un no-op côté client.
 */
export const linkMessageSchema = {
  type: 'object',
  description: 'Message rendered by the share-link send routes',
  properties: {
    id: { type: 'string', description: 'Message unique identifier' },
    // Phase 4 §6.2 — le cid ne sert qu'à l'AUTEUR : c'est la seule clé qui
    // relie ce message à la ligne optimiste déjà affichée. Il n'apparaît donc
    // que dans la réponse 201 ; `stripClientMessageId` le retire du payload
    // `link:message:new` servi aux pairs (cf. messages.ts).
    clientMessageId: { type: 'string', description: "Author's optimistic-row id, echoed back for reconciliation" },
    // Même raison que sur le chemin socket (cf. messages.ts) : le destinataire
    // n'a pas d'autre routage que la charge utile. Le 201 revient à l'AUTEUR,
    // qui doit lui aussi savoir dans quelle conversation insérer son message.
    conversationId: { type: 'string', description: 'Conversation the message belongs to' },
    senderId: { type: 'string', nullable: true, description: 'Participant ID of the author' },
    content: { type: 'string', description: 'Message content' },
    originalLanguage: { type: 'string', description: 'Original message language code' },
    messageType: { type: 'string', description: 'Message type' },
    isEdited: { type: 'boolean', description: 'Whether the message has been edited' },
    editedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last edit timestamp' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Soft-deletion timestamp' },
    replyToId: { type: 'string', nullable: true, description: 'Message this one replies to' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
    sender: { ...linkMessageSenderSchema },
    // Le web surligne les mentions DEPUIS ce champ (`use-message-display`) :
    // non nommé ici, il serait tronqué de la réponse 201 et l'auteur verrait
    // son propre `@alice` en texte brut jusqu'au prochain rechargement.
    validatedMentions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Usernames whose mention passed validation'
    },
    location: { ...sharedPlaceResponseSchema }
  }
} as const;

/**
 * Réponse 201 des deux routes d'envoi via lien de partage.
 */
export const sendLinkMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Created message ID' },
        message: { ...linkMessageSchema }
      }
    }
  }
} as const;

const messageTranslationsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      targetLanguage: { type: 'string' },
      translatedContent: { type: 'string' },
      translationModel: { type: 'string', nullable: true },
      confidenceScore: { type: 'number', nullable: true },
      createdAt: { type: 'string', format: 'date-time' }
    }
  }
} as const;

/**
 * Message cité, tel que `formatReplyToMessage` le produit : son texte et son
 * auteur, rien de plus.
 */
const replyToMessageSchema = {
  type: 'object',
  nullable: true,
  description: 'Quoted message (reply target) — text and author only',
  properties: {
    id: { type: 'string', description: 'Quoted message identifier' },
    content: { type: 'string', description: 'Quoted message content' },
    originalLanguage: { type: 'string', description: 'Quoted message original language' },
    messageType: { type: 'string', description: 'Quoted message type' },
    createdAt: { type: 'string', format: 'date-time', description: 'Quoted message creation timestamp' },
    sender: { ...messageSenderSchema, nullable: true, description: 'Author of the quoted message (registered or anonymous)' }
  }
} as const;

/**
 * `fast-json-stringify` ne sérialise QUE les propriétés déclarées ici — tout le
 * reste est retiré en silence, sans journal ni avertissement.
 *
 * Ce schéma n'en déclarait que sept, alors que le formateur de
 * `GET /links/:identifier/messages` en produisait quinze et que
 * `getConversationMessagesWithDetails` charge les relations correspondantes à
 * chaque page. Une conversation ouverte par lien partagé ne pouvait donc
 * afficher ni pièce jointe, ni réaction, ni réponse citée — pendant qu'un lien
 * peut explicitement autoriser les envois anonymes de fichiers et d'images
 * (`allowAnonymousFiles`, `allowAnonymousImages`).
 *
 * Toute propriété ajoutée au formateur DOIT être déclarée ici, sinon elle est
 * chargée, recopiée, puis jetée.
 *
 * Ce schéma sert AUSSI `GET /links/:identifier` (`retrieval.ts`), dont le
 * formateur `formatMessageWithUnifiedSender` est plus maigre. L'élargir ne lui
 * fait rien émettre de neuf — `fast-json-stringify` omet une propriété absente
 * de l'objet — À CONDITION qu'aucune propriété ajoutée ne porte de `default`,
 * qui serait alors matérialisé sur une route qui ne le produit pas. Un témoin
 * de `messages-retrieval-serialization.test.ts` verrouille cette condition.
 *
 * Champs délibérément NON déclarés :
 *   - `anonymousSender` : aucun lecteur (web ni iOS) ; `sender` porte désormais
 *     l'identité des auteurs anonymes, et une seconde voie nominative vers la
 *     même donnée est exactement ce que le cycle 43 a refusé.
 *   - `deletedAt` : la requête filtre `deletedAt: null`, la valeur est constante.
 */
export const messageSchema = {
  type: 'object',
  description: 'Message object',
  properties: {
    id: { type: 'string', description: 'Message unique identifier' },
    content: { type: 'string', description: 'Message content' },
    originalLanguage: { type: 'string', description: 'Original message language code', default: 'fr' },
    messageType: { type: 'string', description: 'Message type', default: 'text' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' },
    isEdited: { type: 'boolean', description: 'Whether the message was edited' },
    editedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Edition timestamp' },
    replyToId: { type: 'string', nullable: true, description: 'Quoted message identifier' },
    // #4885 — non déclarés, ces quatre champs (+ le compteur/plafond de vue
    // unique) étaient chargés par `getConversationMessagesWithDetails` et
    // retirés ici par `fast-json-stringify` : un visiteur SANS COMPTE lisant
    // un lien de partage recevait un message à vue unique / flouté /
    // éphémère sans aucun moyen de le savoir.
    isViewOnce: { type: 'boolean', description: 'View-once message (disappears after view)' },
    maxViewOnceCount: { type: 'number', nullable: true, description: 'Maximum unique viewers allowed for view-once messages' },
    viewOnceCount: { type: 'number', description: 'Number of unique viewers' },
    isBlurred: { type: 'boolean', description: 'Content blurred until tap to reveal' },
    effectFlags: { type: 'number', description: 'Bitfield for message effects (blurred / ephemeral / view-once)' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Self-destruct timestamp' },
    // Le SENS des messages système (avis d'arrivée, résumé d'appel) vit dans
    // `metadata` + `messageSource` — sans eux, le visiteur anonyme ne peut pas
    // les rendre dans SA langue et retombe sur le repli français stocké.
    // `additionalProperties: true` est OBLIGATOIRE (même piège que
    // api-schemas.ts) et AUCUN `default` (cf. commentaire d'en-tête).
    messageSource: { type: 'string', nullable: true, description: 'Message source (user, system)' },
    senderId: { type: 'string', nullable: true, description: 'Participant id of the author' },
    metadata: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
      description: 'System-message payload (join notice, call summary) rendered client-side'
    },
    sender: { ...messageSenderSchema, nullable: true },
    replyTo: replyToMessageSchema,
    attachments: {
      type: 'array',
      description: 'Message attachments (files, images, audio) with their Prisme transcription/translations',
      items: messageAttachmentSchema
    },
    reactions: {
      type: 'array',
      description: 'Reactions on this message',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          emoji: { type: 'string' },
          participantId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    translations: messageTranslationsSchema
  }
} as const;

/**
 * Les trois formes d'identité renvoyées par `GET /links/:identifier`.
 *
 * Elles étaient déclarées `{ type: 'object' }` SANS `properties` :
 * fast-json-stringify sérialise alors `{}`, et la conversation partagée
 * arrivait au client sans savoir qui parle ni qui participe. Même famille de
 * panne que celle documentée au-dessus de `linkMessageSenderSchema`.
 */
export const linkCurrentUserSchema = {
  type: 'object',
  description: 'Identity of the caller, member or anonymous participant',
  properties: {
    id: { type: 'string', description: 'User ID (member) or Participant ID (anonymous)' },
    username: { type: 'string', nullable: true, description: 'Username' },
    firstName: { type: 'string', nullable: true, description: 'First name' },
    lastName: { type: 'string', nullable: true, description: 'Last name' },
    displayName: { type: 'string', nullable: true, description: 'Display name' },
    language: { type: 'string', nullable: true, description: 'Preferred language code' },
    isMeeshyer: { type: 'boolean', description: 'Registered account (vs anonymous participant)' },
    permissions: {
      type: 'object',
      description: 'What the caller may post in this conversation',
      properties: {
        canSendMessages: { type: 'boolean' },
        canSendFiles: { type: 'boolean' },
        canSendImages: { type: 'boolean' }
      }
    }
  }
} as const;

export const linkMemberSchema = {
  type: 'object',
  description: 'Registered member of the shared conversation',
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    role: { type: 'string', description: 'Member role in the conversation' },
    joinedAt: { type: 'string', format: 'date-time' },
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        username: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        isOnline: { type: 'boolean' },
        lastActiveAt: { type: 'string', format: 'date-time', nullable: true }
      }
    }
  }
} as const;

export const linkAnonymousParticipantSchema = {
  type: 'object',
  description: 'Anonymous participant of the shared conversation',
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    username: { type: 'string', nullable: true },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    language: { type: 'string', nullable: true },
    isOnline: { type: 'boolean' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
    joinedAt: { type: 'string', format: 'date-time' },
    canSendMessages: { type: 'boolean' },
    canSendFiles: { type: 'boolean' },
    canSendImages: { type: 'boolean' }
  }
} as const;

export const createLinkBodySchema = {
  type: 'object',
  description: 'Create share link request body',
  properties: {
    conversationId: { type: 'string', description: 'Existing conversation ID (optional if creating new conversation)' },
    name: { type: 'string', description: 'Link display name' },
    description: { type: 'string', description: 'Link description' },
    maxUses: { type: 'number', minimum: 1, description: 'Maximum uses allowed' },
    maxConcurrentUsers: { type: 'number', minimum: 1, description: 'Maximum concurrent users' },
    maxUniqueSessions: { type: 'number', minimum: 1, description: 'Maximum unique sessions' },
    expiresAt: { type: 'string', format: 'date-time', description: 'Expiration timestamp' },
    allowAnonymousMessages: { type: 'boolean', default: true },
    allowAnonymousFiles: { type: 'boolean', default: false },
    allowAnonymousImages: { type: 'boolean', default: true },
    // #4169 — PAS de default ici. Fastify active useDefaults d'AJV et server.ts
    // ne le desactive pas : un default dans un schema de REQUETE est une
    // ECRITURE, materialisee sur request.body AVANT que le gestionnaire ne
    // s'execute. Le repli input.allowViewHistory ?? false de
    // mintConversationShareLink devenait donc structurellement inatteignable,
    // et tout lien cree sans ce champ naissait avec l'historique OUVERT --
    // plus permissif que ce que recoit un membre INSCRIT invite par un admin.
    // Le repli appartient au gestionnaire, jamais au schema : l'y remettre,
    // meme a false, redefairait en silence le prochain changement du repli.
    allowViewHistory: { type: 'boolean' },
    requireAccount: { type: 'boolean', default: false },
    requireNickname: { type: 'boolean', default: true },
    requireEmail: { type: 'boolean', default: false },
    requireBirthday: { type: 'boolean', default: false },
    allowedCountries: { type: 'array', items: { type: 'string' } },
    allowedLanguages: { type: 'array', items: { type: 'string' } },
    allowedIpRanges: { type: 'array', items: { type: 'string' } },
    newConversation: {
      type: 'object',
      description: 'Create new conversation with this link',
      properties: {
        title: { type: 'string', minLength: 1, description: 'Conversation title (required)' },
        description: { type: 'string', description: 'Conversation description' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Initial member user IDs' }
      },
      required: ['title']
    }
  }
} as const;

export const updateLinkBodySchema = {
  type: 'object',
  description: 'Update share link request body (all fields optional)',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    maxUses: { type: 'number', nullable: true, minimum: 1 },
    maxConcurrentUsers: { type: 'number', nullable: true, minimum: 1 },
    maxUniqueSessions: { type: 'number', nullable: true, minimum: 1 },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    isActive: { type: 'boolean' },
    allowAnonymousMessages: { type: 'boolean' },
    allowAnonymousFiles: { type: 'boolean' },
    allowAnonymousImages: { type: 'boolean' },
    allowViewHistory: { type: 'boolean' },
    requireAccount: { type: 'boolean' },
    requireNickname: { type: 'boolean' },
    requireEmail: { type: 'boolean' },
    requireBirthday: { type: 'boolean' },
    allowedCountries: { type: 'array', items: { type: 'string' } },
    allowedLanguages: { type: 'array', items: { type: 'string' } },
    allowedIpRanges: { type: 'array', items: { type: 'string' } }
  }
} as const;

export const sendMessageBodySchema = {
  type: 'object',
  description: 'Send message via share link request body',
  properties: {
    content: { type: 'string', maxLength: 1000, description: 'Message content (required unless attachments provided)' },
    // Les deux routes LISENT ce champ (`body.clientMessageId` → `message.create`)
    // et `sendMessageSchema` (Zod) l'exige. Il n'était pas déclaré ici : sans
    // `additionalProperties: false` il passait quand même, donc aucun défaut
    // observable — mais le contrat d'entrée publié en omettait le seul champ
    // obligatoire. Déclaré SANS `required` : Zod reste le validateur unique,
    // pour que le corps d'erreur d'un cid manquant ne change pas de forme.
    clientMessageId: { type: 'string', description: 'Client-generated dedup id, format cid_<uuid v4 lowercase> (required — enforced by the Zod schema)' },
    originalLanguage: { type: 'string', default: 'fr', description: 'Message language code' },
    messageType: { type: 'string', default: 'text', description: 'Message type' },
    attachments: { type: 'array', items: { type: 'string' }, description: 'Attachment IDs' },
    location: {
      type: 'object',
      additionalProperties: true,
      description: 'Lieu partagé (latitude, longitude, name?, address?, category?) — validé serveur',
    }
  }
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
