/**
 * LA TRADUCTION QU'UN MEMBRE PARTAGE AUX AUTRES — le contrat (#9899).
 *
 * Décision porteur du 2026-10-10 : c'est l'appareil de chaque membre qui
 * traduit vers SA langue, puis partage sa traduction aux autres membres. Le
 * serveur ne traduit pas : il garde et relaie une enveloppe SCELLÉE sur
 * l'appareil, sans jamais tenter de l'ouvrir.
 *
 * Ce que le scellement protège, et ce qu'il ne protège pas. L'enveloppe est
 * scellée pour ceux qui détiennent le texte du message. Elle n'apporte AUCUNE
 * confidentialité contre le serveur dans une conversation qu'il lit déjà, ni
 * contre un lecteur du message : le serveur ne l'ouvre pas, mais il le pourrait,
 * puisqu'il détient le texte d'où la clé dérive. Elle garde la traduction hors
 * de portée de qui ne lit pas le message (une copie de la table, un membre
 * arrivé après le plancher d'historique). La confidentialité contre le serveur
 * ne viendra qu'avec `message-secret`, dans une conversation chiffrée de bout en
 * bout (#9959).
 *
 * L'enveloppe (AES-256-GCM, clé HKDF-SHA256) se scelle et s'ouvre sur
 * l'appareil : `utils/shared-translation-seal.ts`, et son miroir iOS
 * `SharedTranslationSeal` (MeeshySDK), tenus ensemble par
 * `fixtures/shared-translation/seal.vectors.json`. La clé dérive de :
 *
 * - `message-content` — le texte original du message. Acceptée là seulement où
 *   le serveur lit déjà ce texte (`sharedTranslationServerReadsMessage`) : dans
 *   une conversation chiffrée de bout en bout, le serveur pourrait deviner un
 *   message court (« merci ») en essayant d'ouvrir l'enveloppe.
 * - `message-secret` — un secret de 32 octets que le message chiffré porterait
 *   dans son clair. Le format le nomme ; la passerelle le REFUSE tant que le
 *   message chiffré qui le transporte n'existe pas (#9959) : sans lui, personne
 *   ne pourrait vérifier qu'une enveloppe annoncée ainsi traduit bien le message,
 *   et le premier venu occuperait la place.
 *
 * Une traduction partagée n'est jamais MOINS protégée que son message, ni
 * lisible par quelqu'un qui ne peut pas lire le message.
 */

import { z } from 'zod';

import { sharedTranslationServerReadsMessage } from '../utils/shared-translation-eligibility.js';

export const SHARED_TRANSLATION_PROTOCOL = 'meeshy-shared-translation/v1';
export const SHARED_TRANSLATION_ALGORITHM = 'A256GCM';
export const SHARED_TRANSLATION_KDFS = ['message-content', 'message-secret'] as const;
export type SharedTranslationKdf = (typeof SHARED_TRANSLATION_KDFS)[number];

/** Les bornes que l'appareil respecte avant d'envoyer et que la passerelle fait respecter. */
export const SHARED_TRANSLATION_LIMITS = {
  /** base64 de nonce (12) ‖ chiffré ‖ tag (16) : 28 octets au moins. */
  payloadMinLength: 40,
  /**
   * La plus longue enveloppe qu'un texte admis produit : 10 000 unités UTF-16 de
   * trois octets chacune en UTF-8 (une écriture CJK), plus le JSON et ses 28
   * octets de nonce et de tag, en base64. Un message en compte 4 000 au plus.
   */
  payloadMaxLength: 40_960,
  textMaxLength: 10_000,
  engineMaxLength: 64,
  messageIdsMaxCount: 100,
  languagesMaxCount: 8,
  secretLength: 32,
  nonceLength: 12,
  tagLength: 16,
} as const;

export const SHARED_TRANSLATION_ERROR_CODES = {
  protectedMessage: 'SHARED_TRANSLATION_PROTECTED_MESSAGE',
  kdfRefused: 'SHARED_TRANSLATION_KDF_REFUSED',
  sameLanguage: 'SHARED_TRANSLATION_SAME_LANGUAGE',
  unnormalizedLanguage: 'SHARED_TRANSLATION_UNNORMALIZED_LANGUAGE',
  /**
   * Le COMPTE ne partage pas, quel que soit le message : il a coupé ses accusés de
   * lecture, et un partage en est un. L'appareil cesse de partager, et garde ses
   * traductions pour lui.
   */
  readReceiptsOff: 'SHARED_TRANSLATION_READ_RECEIPTS_OFF',
  /**
   * Le message a changé depuis que l'appareil l'a traduit : sa traduction ne
   * traduit plus ce que les autres membres lisent. L'appareil la garde pour lui.
   */
  staleSource: 'SHARED_TRANSLATION_STALE_SOURCE',
  /** Le compte a partagé plus que son budget ne le permet ; `Retry-After` dit quand recommencer. */
  budgetExceeded: 'SHARED_TRANSLATION_BUDGET_EXCEEDED',
} as const;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/;
/**
 * Le base64 CANONIQUE : remplissage présent, bits de remplissage nuls, aucun
 * blanc. Une même enveloppe n'a qu'une écriture — celle qu'un relais pourrait
 * réécrire sans l'altérer n'existe pas.
 */
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/;
/** `original`, ou l'instant de la dernière modification tel que `toISOString` l'écrit. */
const SOURCE_VERSION = /^(?:original|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/;
/** Une moitié de paire de substitution seule : un autre appareil la lirait autrement. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Le texte se lit pareil sur tous les appareils — aucune moitié de paire de substitution seule. */
export const isWellFormedSharedTranslationText = (text: string): boolean => !LONE_SURROGATE.test(text);

/** Le payload s'écrit en base64 canonique — la forme que le scellement produit et la seule qu'on ouvre. */
export const isCanonicalSharedTranslationPayload = (payload: string): boolean => CANONICAL_BASE64.test(payload);

const objectId = z.string().regex(OBJECT_ID);
const language = z.string().regex(LANGUAGE);
const wellFormedText = (max: number) => z.string().min(1).max(max).refine(isWellFormedSharedTranslationText);

/** Les identifiants et la langue qu'une enveloppe lie : jamais un séparateur, jamais d'ambiguïté. */
export const isSharedTranslationObjectId = (value: string): boolean => OBJECT_ID.test(value);
export const isSharedTranslationLanguage = (value: string): boolean => LANGUAGE.test(value);

export const sharedTranslationEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal(SHARED_TRANSLATION_ALGORITHM),
  kdf: z.enum(SHARED_TRANSLATION_KDFS),
  payload: z
    .string()
    .min(SHARED_TRANSLATION_LIMITS.payloadMinLength)
    .max(SHARED_TRANSLATION_LIMITS.payloadMaxLength)
    .regex(CANONICAL_BASE64),
});
export type SharedTranslationEnvelope = z.infer<typeof sharedTranslationEnvelopeSchema>;

/**
 * Ce que l'enveloppe contient. Le serveur ne l'ouvre pas, mais il le pourrait là
 * où il lit le message (la clé dérive de son texte). Le moteur reste chez les membres.
 */
export const sharedTranslationInnerSchema = z.object({
  v: z.literal(1),
  text: wellFormedText(SHARED_TRANSLATION_LIMITS.textMaxLength),
  sourceLanguage: language,
  engine: wellFormedText(SHARED_TRANSLATION_LIMITS.engineMaxLength),
});
export type SharedTranslationInner = z.infer<typeof sharedTranslationInnerSchema>;

/**
 * Le corps de `POST /conversations/:conversationId/shared-translations` — la
 * conversation est dans l'adresse. `sourceVersion` est la version du texte que
 * l'appareil a traduite (`sharedTranslationSourceVersion`) : la passerelle
 * refuse (409) la traduction d'un message modifié depuis.
 */
export const shareTranslationBodySchema = z.object({
  messageId: objectId,
  targetLanguage: language,
  sourceVersion: z.string().regex(SOURCE_VERSION),
  envelope: sharedTranslationEnvelopeSchema,
});
export type ShareTranslationBody = z.infer<typeof shareTranslationBodySchema>;

const commaList = (raw: string): readonly string[] =>
  [...new Set(raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== ''))];

/**
 * La requête de `GET /conversations/:conversationId/shared-translations`.
 * `languages` est le prisme du lecteur, dans son ordre : la passerelle rend au
 * plus UNE traduction par message, la première de ces langues qu'un membre a
 * partagée.
 */
export const sharedTranslationsQuerySchema = z.object({
  messageIds: z
    .string()
    .transform(commaList)
    .pipe(z.array(objectId).min(1).max(SHARED_TRANSLATION_LIMITS.messageIdsMaxCount)),
  languages: z
    .string()
    .transform(commaList)
    .pipe(z.array(language).min(1).max(SHARED_TRANSLATION_LIMITS.languagesMaxCount)),
});
export type SharedTranslationsQuery = z.infer<typeof sharedTranslationsQuerySchema>;

/**
 * Une traduction partagée telle que la passerelle la sert (lecture REST) et la
 * relaie (`message:translation-shared`). `sharedBy` est le participant qui l'a
 * partagée — le même espace d'identifiants que `Message.senderId`.
 */
export const sharedTranslationSchema = z.object({
  id: z.string().min(1),
  conversationId: objectId,
  messageId: objectId,
  targetLanguage: language,
  envelope: sharedTranslationEnvelopeSchema,
  sharedBy: z.string().min(1),
  sharedAt: z.string().min(1),
});
export type SharedTranslation = z.infer<typeof sharedTranslationSchema>;

/** La réponse du partage : `created: false` quand un autre membre l'avait déjà partagée — la sienne est rendue. */
export type ShareTranslationResult = {
  readonly sharedTranslation: SharedTranslation;
  readonly created: boolean;
};

export type SharedTranslationsResult = {
  readonly sharedTranslations: readonly SharedTranslation[];
};

/**
 * Les dérivations qu'un message accepte : `message-content` là seulement où le
 * serveur lit déjà le message, rien ailleurs. `message-secret` attend le message
 * chiffré qui le transporte (#9959).
 */
export function acceptedSharedTranslationKdfs(params: {
  readonly conversationEncryptionMode: string | null | undefined;
  readonly messageIsEncrypted: boolean | null | undefined;
  readonly messageEncryptionMode: string | null | undefined;
}): readonly SharedTranslationKdf[] {
  return sharedTranslationServerReadsMessage(params) ? ['message-content'] : [];
}

/** Le schéma JSON du corps REST (Fastify) — mêmes bornes que {@link shareTranslationBodySchema}. */
export const shareTranslationBodyJsonSchema = {
  type: 'object',
  required: ['messageId', 'targetLanguage', 'sourceVersion', 'envelope'],
  additionalProperties: false,
  properties: {
    messageId: { type: 'string', pattern: OBJECT_ID.source },
    targetLanguage: { type: 'string', pattern: LANGUAGE.source },
    sourceVersion: { type: 'string', pattern: SOURCE_VERSION.source },
    envelope: {
      type: 'object',
      required: ['v', 'alg', 'kdf', 'payload'],
      additionalProperties: false,
      properties: {
        v: { type: 'integer', enum: [1] },
        alg: { type: 'string', enum: [SHARED_TRANSLATION_ALGORITHM] },
        kdf: { type: 'string', enum: [...SHARED_TRANSLATION_KDFS] },
        payload: {
          type: 'string',
          minLength: SHARED_TRANSLATION_LIMITS.payloadMinLength,
          maxLength: SHARED_TRANSLATION_LIMITS.payloadMaxLength,
          pattern: CANONICAL_BASE64.source,
        },
      },
    },
  },
} as const;
