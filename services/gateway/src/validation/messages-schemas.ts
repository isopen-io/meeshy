import { z } from 'zod';
import { isMsRangeStrictlyOrdered } from '@meeshy/shared/utils/time-range';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { MAX_CONTENT_BYTES } from './content-limits.js';

const mongoId = z
  .string()
  .regex(OBJECT_ID_REGEX, 'Invalid MongoDB ObjectId format');

/**
 * Code de langue tel qu'il arrive du fil, AVANT normalisation serveur.
 *
 * Plus permissif que `languageCodeSchema` de `@meeshy/shared` sur un point : le
 * séparateur `_`. iOS envoie `Locale.current.identifier`, qui rend `fr_FR` et
 * non `fr-FR` ; refuser la forme à underscore ferait échouer tout le rapport
 * pour un séparateur, alors que `normalizeLanguageCode` traite déjà les deux.
 *
 * La validation reste FORMELLE : le sens (langue réellement supportée) est
 * tranché par `normalizeLanguageCode` côté service, seule autorité du repo.
 */
const wireLanguageCode = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]+)*$/, 'Invalid language code');

/**
 * Une écoute réellement CONTINUE, avec ce qui y a mis fin.
 *
 * Objet non `.strict()` à dessein : un client d'une version ultérieure peut
 * enrichir son rapport (vitesse de lecture, par exemple). Zod écarte alors le
 * champ inconnu au lieu de rejeter l'écoute entière — même tolérance que
 * `parsePlaybackTrace` côté relecture.
 */
const playbackStretch = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  endedBy: z.enum(['pause', 'seek', 'muted', 'completed', 'dismissed', 'superseded'])
}).refine(isMsRangeStrictlyOrdered, {
  /**
   * `endMs > startMs` STRICT (pas `>=`), via la brique partagée
   * {@link isMsRangeStrictlyOrdered} (`@meeshy/shared/utils/time-range`) : le
   * MÊME prédicat que les filtres `isUsable` de `utils/playback-trace.ts` et
   * `utils/playback-segments.ts`, qui jettent silencieusement une entrée de
   * durée nulle ou inversée à la persistance et à la fusion. Rejeter au wire
   * transforme une perte silencieuse en `400 Validation Error` — le client peut
   * loguer et retenter au lieu de croire son rapport persisté.
   *
   * Régime STRICT distinct des refines 234/236 (`>=`, segment ponctuel admis,
   * `isMsRangeOrdered`) : ici la sémantique documentée est « une écoute
   * réellement CONTINUE » (`playback-trace.ts:7`) — une durée nulle n'est pas
   * une écoute.
   */
  path: ['endMs'],
  message: 'STRETCH_END_MUST_EXCEED_START'
});

// ============================================
// PARAMS SCHEMAS
// ============================================

export const MessageParamsSchema = z.object({
  messageId: mongoId
}).strict();

export const AttachmentParamsSchema = z.object({
  attachmentId: mongoId
}).strict();

// ============================================
// QUERY SCHEMAS
// ============================================

export const MessageStatusDetailsQuerySchema = z.object({
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a non-negative integer')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be >= 0')
    .prefault('0'),

  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .prefault('20'),

  filter: z
    .enum(['all', 'delivered', 'read', 'unread'])
    .default('all')
}).strict();

export const AttachmentStatusDetailsQuerySchema = z.object({
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a non-negative integer')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be >= 0')
    .prefault('0'),

  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .prefault('20'),

  filter: z
    .enum(['all', 'viewed', 'downloaded', 'listened', 'watched'])
    .default('all')
}).strict();

// ============================================
// BODY SCHEMAS
// ============================================

export const UpdateMessageBodySchema = z.object({
  // `.max(MAX_CONTENT_BYTES)` — même plafond de sécurité que les transports
  // SOCKET d'écriture (`content-limits.ts`). Ce transport REST d'édition
  // (`PUT /messages/:messageId`) était le SEUL chemin d'écriture de contenu de
  // message sans borne haute : un corps démesuré traversait le gate, était
  // PERSISTÉ puis diffusé en `message:edited` à toute la conversation. Le garde
  // aval (`messageEditContent.ts`) ne rejette que le contenu VIDE, jamais le
  // démesuré.
  content: z
    .string()
    .trim()
    .max(MAX_CONTENT_BYTES)
    .optional(),

  isEdited: z
    .boolean()
    .optional()
}).strict();

export const MessageStatusBodySchema = z.object({
  status: z.enum(['read', 'delivered']),

  timestamp: z.iso
    .datetime()
    .optional(),

  /**
   * Version linguistique sous laquelle CE message a été lu. Sert la bascule
   * ponctuelle : le lecteur ouvre la traduction d'une bulle sans changer la
   * langue de toute la conversation.
   */
  language: wireLanguageCode.optional()
}).strict();

/**
 * Suivi de lecture exact — le client rapporte les messages RÉELLEMENT affichés.
 *
 * Partagé par les DEUX points d'entrée de marquage : `/mark-read`
 * (`routes/conversations/messages.ts`, utilisé par iOS) et `/mark-as-read`
 * (`routes/message-read-status.ts`, utilisé par la webapp). N'en doter qu'un
 * laisserait l'autre client sur le chemin par fenêtre, qui sur-déclare.
 *
 * Le corps reste OPTIONNEL : les binaires déjà distribués n'en envoient pas, et
 * les priver du repli perdrait toute lecture jusqu'à leur mise à jour.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */
export const MarkReadBodySchema = z.object({
  messageIds: z
    .array(mongoId)
    .max(200)
    .optional(),

  /**
   * Version linguistique affichée au lecteur pendant que ces messages défilaient
   * sous ses yeux. Une seule valeur pour tout le lot : c'est la résolution de la
   * conversation, celle qui vaut par défaut pour chaque bulle.
   */
  language: wireLanguageCode.optional(),

  /**
   * EXCEPTIONS à la langue du lot, par message.
   *
   * La langue rendue n'est pas toujours celle que le lecteur préfère : quand
   * aucune traduction n'existe encore, c'est l'ORIGINAL qui s'affiche. Déclarer
   * tout le lot dans la langue préférée mentirait précisément là où l'auteur a
   * besoin de savoir — « m'a-t-on lu dans ma langue ou traduit ? ».
   *
   * Le client n'envoie que ce qui diffère : sur une conversation lue d'un bloc,
   * cette table est vide ou presque.
   */
  messageLanguages: z
    .record(mongoId, wireLanguageCode)
    .refine((table) => Object.keys(table).length <= 200, {
      message: 'Too many per-message languages'
    })
    .optional(),

  /**
   * Le lecteur a ATTEINT ce message, le plus récent de la conversation : il n'a
   * plus de retard. Fait avancer le curseur de non-lus jusque-là — donc vide le
   * badge — sans élargir d'un seul message l'ensemble déclaré LU.
   *
   * Les deux notions sont délibérément séparées. « Quels messages ai-je
   * affichés » nourrit les accusés de lecture, que l'expéditeur voit : il doit
   * rester exact. « Ai-je rattrapé mon retard » nourrit le badge, que seul le
   * lecteur voit : descendre au dernier message d'une conversation à deux cents
   * non-lus ne rend pas les cent quatre-vingt-dix intermédiaires lus, mais rend
   * bien la conversation rattrapée. Les confondre gonflerait les coches bleues.
   */
  caughtUpToMessageId: mongoId.optional()
}).strict();

export const AttachmentStatusBodySchema = z.object({
  action: z.enum(['listened', 'watched', 'viewed', 'downloaded']),

  playPositionMs: z
    .number()
    .int()
    .nonnegative()
    .optional(),

  durationMs: z
    .number()
    .int()
    .nonnegative()
    .optional(),

  complete: z
    .boolean()
    .optional(),

  wasZoomed: z
    .boolean()
    .optional(),

  /**
   * Trace de l'interaction depuis le dernier rapport : une entrée par écoute
   * réellement continue, dans l'ordre où elles ont eu lieu.
   *
   * Le plafond vaut celui de la trace persistée — au-delà, le serveur écarterait
   * de toute façon le surplus.
   */
  stretches: z
    .array(playbackStretch)
    .max(50)
    .optional(),

  /**
   * Version linguistique consommée : piste traduite écoutée, transcription
   * affichée. Sans objet pour une image ou un téléchargement.
   */
  language: wireLanguageCode.optional()
}).strict();

// ============================================
// TYPE EXPORTS
// ============================================

export type MessageParams = z.infer<typeof MessageParamsSchema>;
export type AttachmentParams = z.infer<typeof AttachmentParamsSchema>;
export type MessageStatusDetailsQuery = z.infer<typeof MessageStatusDetailsQuerySchema>;
export type AttachmentStatusDetailsQuery = z.infer<typeof AttachmentStatusDetailsQuerySchema>;
export type UpdateMessageBody = z.infer<typeof UpdateMessageBodySchema>;
export type MessageStatusBody = z.infer<typeof MessageStatusBodySchema>;
export type AttachmentStatusBody = z.infer<typeof AttachmentStatusBodySchema>;
