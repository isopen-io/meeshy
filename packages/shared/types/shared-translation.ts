/**
 * LA TRADUCTION QU'UN MEMBRE PARTAGE AUX AUTRES — le contrat (#9899).
 *
 * Décision porteur du 2026-10-10 : c'est l'appareil de chaque membre qui
 * traduit vers SA langue, puis partage sa traduction aux autres membres. Le
 * serveur ne traduit pas et ne lit pas ce qu'on lui confie : il garde et relaie
 * une enveloppe SCELLÉE, comme si la conversation était chiffrée de bout en
 * bout — même quand elle ne l'est pas encore.
 *
 * L'enveloppe (AES-256-GCM, clé HKDF-SHA256) se scelle et s'ouvre sur
 * l'appareil : `utils/shared-translation-seal.ts`, et son miroir iOS
 * `SharedTranslationSeal` (MeeshySDK), tenus ensemble par
 * `fixtures/shared-translation/seal.vectors.json`. La clé dérive de ce que
 * SEULS les lecteurs du message détiennent :
 *
 * - `message-content` — le texte original du message. Dans une conversation en
 *   clair, le serveur le détient aussi : l'enveloppe ne protège alors que
 *   contre qui ne lit pas le message (une copie de la table, un membre arrivé
 *   après le plancher d'historique). Refusée dans une conversation chiffrée de
 *   bout en bout : le serveur pourrait deviner un message court (« merci ») en
 *   essayant d'ouvrir l'enveloppe.
 * - `message-secret` — un secret de 32 octets que le message chiffré porte dans
 *   son clair. Seule dérivation acceptée en E2EE ; le message chiffré qui le
 *   transporte est le lot cryptographique suivant.
 *
 * Une traduction partagée n'est jamais MOINS protégée que son message, ni
 * lisible par quelqu'un qui ne peut pas lire le message.
 */

import { z } from 'zod';

export const SHARED_TRANSLATION_PROTOCOL = 'meeshy-shared-translation/v1';
export const SHARED_TRANSLATION_ALGORITHM = 'A256GCM';
export const SHARED_TRANSLATION_KDFS = ['message-content', 'message-secret'] as const;
export type SharedTranslationKdf = (typeof SHARED_TRANSLATION_KDFS)[number];

/** Les bornes que l'appareil respecte avant d'envoyer et que la passerelle fait respecter. */
export const SHARED_TRANSLATION_LIMITS = {
  /** base64 de nonce (12) ‖ chiffré ‖ tag (16) : 28 octets au moins. */
  payloadMinLength: 40,
  payloadMaxLength: 131_072,
  textMaxLength: 20_000,
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
} as const;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const objectId = z.string().regex(OBJECT_ID);
const language = z.string().regex(LANGUAGE);

export const sharedTranslationEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal(SHARED_TRANSLATION_ALGORITHM),
  kdf: z.enum(SHARED_TRANSLATION_KDFS),
  payload: z
    .string()
    .min(SHARED_TRANSLATION_LIMITS.payloadMinLength)
    .max(SHARED_TRANSLATION_LIMITS.payloadMaxLength)
    .regex(BASE64),
});
export type SharedTranslationEnvelope = z.infer<typeof sharedTranslationEnvelopeSchema>;

/** Ce que l'enveloppe contient — jamais vu par le serveur. Le moteur reste chez les membres. */
export const sharedTranslationInnerSchema = z.object({
  v: z.literal(1),
  text: z.string().min(1).max(SHARED_TRANSLATION_LIMITS.textMaxLength),
  sourceLanguage: language,
  engine: z.string().min(1).max(SHARED_TRANSLATION_LIMITS.engineMaxLength),
});
export type SharedTranslationInner = z.infer<typeof sharedTranslationInnerSchema>;

/** Le corps de `POST /conversations/:conversationId/shared-translations` — la conversation est dans l'adresse. */
export const shareTranslationBodySchema = z.object({
  messageId: objectId,
  targetLanguage: language,
  envelope: sharedTranslationEnvelopeSchema,
});
export type ShareTranslationBody = z.infer<typeof shareTranslationBodySchema>;

const commaList = (raw: string): readonly string[] =>
  [...new Set(raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== ''))];

/** La requête de `GET /conversations/:conversationId/shared-translations`. */
export const sharedTranslationsQuerySchema = z.object({
  messageIds: z
    .string()
    .transform(commaList)
    .pipe(z.array(objectId).min(1).max(SHARED_TRANSLATION_LIMITS.messageIdsMaxCount)),
  languages: z
    .string()
    .transform(commaList)
    .pipe(z.array(language).max(SHARED_TRANSLATION_LIMITS.languagesMaxCount))
    .optional(),
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
 * Les dérivations qu'un message accepte. Un message chiffré de bout en bout —
 * par sa conversation ou par lui-même — n'accepte que `message-secret` ; tout
 * autre accepte les deux (le serveur y lit déjà le message).
 */
export function acceptedSharedTranslationKdfs(params: {
  readonly conversationEncryptionMode: string | null | undefined;
  readonly messageEncryptionMode: string | null | undefined;
}): readonly SharedTranslationKdf[] {
  const endToEnd = params.conversationEncryptionMode === 'e2ee' || params.messageEncryptionMode === 'e2ee';
  return endToEnd ? ['message-secret'] : SHARED_TRANSLATION_KDFS;
}

/** Le schéma JSON du corps REST (Fastify) — mêmes bornes que {@link shareTranslationBodySchema}. */
export const shareTranslationBodyJsonSchema = {
  type: 'object',
  required: ['messageId', 'targetLanguage', 'envelope'],
  additionalProperties: false,
  properties: {
    messageId: { type: 'string', pattern: OBJECT_ID.source },
    targetLanguage: { type: 'string', pattern: LANGUAGE.source },
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
          pattern: BASE64.source,
        },
      },
    },
  },
} as const;
