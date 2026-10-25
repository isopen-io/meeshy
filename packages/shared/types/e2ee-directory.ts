/**
 * LE CONTRAT DE L'ANNUAIRE E2EE PAR APPAREIL ET DU RELAIS D'ENVELOPPES (#3706).
 *
 * Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`
 * § 3.2 à 3.4 et § 4.3. Décision :
 * `services/gateway/decisions/2026-10-23-la-passerelle-est-un-annuaire-de-cles-par-appareil-et-un-relais-d-enveloppes.md`.
 *
 * Tout ce qui voyage ici est PUBLIC (clés publiques, signatures XEdDSA) ou
 * OPAQUE (enveloppes libsignal). Aucun schéma de ce fichier n'accepte une clé
 * privée : un champ dont le NOM évoque une clé privée (`containsPrivateKeyField`)
 * fait refuser la requête entière ; tout autre champ inconnu est retiré par Zod,
 * pour qu'un client plus récent reste compris d'une passerelle plus ancienne.
 */
import { z } from 'zod';

/** Le protocole déclaré par un envoi libsignal (§ 4.3). */
export const LIBSIGNAL_PROTOCOL = 'libsignal-v1' as const;

/** Plage des `deviceId` acceptée par `ProtocolAddress` de libsignal. */
export const E2EE_DEVICE_ID_MIN = 1;
export const E2EE_DEVICE_ID_MAX = 127;

/** Bornes d'un envoi (§ 4.3). */
export const E2EE_ENVELOPE_BOUNDS = {
  maxEnvelopes: 32,
  maxBodyBase64Chars: Math.ceil((64 * 1024) / 3) * 4,
  maxTotalBase64Chars: Math.ceil((512 * 1024) / 3) * 4,
} as const;

/**
 * Le nombre d'appareils chiffrés ACTIFS d'un compte (#12543). Sesame exige une
 * enveloppe par appareil actif : un envoi en tête-à-tête vise les appareils du
 * destinataire ET les autres appareils de l'émetteur, soit au plus
 * 2 × borne − 1 enveloppes, qui doivent tenir dans `maxEnvelopes`. Au-delà, le
 * compte deviendrait injoignable. Les numéros 1…borne sont les seules places :
 * un appareil retiré rend la sienne.
 */
export const E2EE_MAX_ACTIVE_DEVICES = Math.floor((E2EE_ENVELOPE_BOUNDS.maxEnvelopes + 1) / 2);

/** Un lot de pré-clés uniques (§ 3.2) : 100 au plus par publication. */
export const E2EE_ONE_TIME_PREKEY_BATCH_MAX = 100;

/** Le stock de pré-clés uniques NON consommées d'un appareil, par nature (EC, Kyber). */
export const E2EE_ONE_TIME_PREKEY_STOCK_MAX = 200;

/** L'écart toléré entre l'horloge de l'appareil et celle de la passerelle pour la preuve de liaison. */
export const E2EE_DEVICE_BINDING_MAX_SKEW_MS = 10 * 60 * 1000;

/**
 * Le message que l'appareil signe (XEdDSA, sa clé d'identité) pour PROUVER
 * qu'il détient la clé privée de l'identité qu'il enrôle, au nom de CE compte.
 * Sans cette preuve, quiconque tient un jeton du compte pourrait réenrôler une
 * identité PUBLIQUE (servie dans chaque bundle, avec ses signatures) et lier
 * l'appareil à sa propre session : il lirait puis effacerait ses enveloppes.
 * Les clients construisent ce message par cette fonction, à l'octet près.
 */
export const deviceBindingMessage = (binding: {
  readonly userId: string;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly timestamp: number;
}): string =>
  `meeshy-e2ee-device-binding:v1:${binding.userId}:${binding.registrationId}:${binding.identityKey}:${binding.timestamp}`;

/** Une enveloppe vit au plus 30 jours sans accusé de réception (§ 4.3). */
export const E2EE_ENVELOPE_RETENTION_DAYS = 30;

/** Les codes stables que la passerelle pose en `code` à côté d'`error`. */
export const E2EE_ERROR_CODES = {
  DEVICES_MISMATCH: 'E2EE_DEVICES_MISMATCH',
  CLIENT_OUTDATED: 'E2EE_CLIENT_OUTDATED',
  SIGNATURE_INVALID: 'E2EE_SIGNATURE_INVALID',
  SIGNATURE_UNVERIFIABLE: 'E2EE_SIGNATURE_UNVERIFIABLE',
  DEVICE_NOT_BOUND: 'E2EE_DEVICE_NOT_BOUND',
  DEVICE_LIMIT_REACHED: 'E2EE_DEVICE_LIMIT_REACHED',
  ENVELOPES_INVALID: 'E2EE_ENVELOPES_INVALID',
  KEYS_FORBIDDEN: 'E2EE_KEYS_FORBIDDEN',
  REGIME_CHANGED: 'E2EE_REGIME_CHANGED',
  /** Une conversation chiffrée de bout en bout ne repasse jamais en clair (#12949). */
  IRREVERSIBLE: 'E2EE_IRREVERSIBLE',
  /** Une paire de personnes a au plus UN tête-à-tête chiffré de bout en bout (#12966). */
  DIRECT_ALREADY_END_TO_END: 'E2EE_DIRECT_ALREADY_END_TO_END',
  BINDING_INVALID: 'E2EE_DEVICE_BINDING_INVALID',
  PREKEY_STOCK_FULL: 'E2EE_PREKEY_STOCK_FULL',
  IDENTITY_REVOKED: 'E2EE_IDENTITY_REVOKED',
  IDENTITY_KEY_INVALID: 'E2EE_IDENTITY_KEY_INVALID',
} as const;

export type E2EEErrorCode = (typeof E2EE_ERROR_CODES)[keyof typeof E2EE_ERROR_CODES];

/** Le texte lisible servi à un client qui ne parle pas libsignal (#9223 : rien ne se perd en silence). */
export const E2EE_CLIENT_OUTDATED_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : mettez à jour Meeshy pour y écrire';

/**
 * Le texte servi avec `E2EE_IRREVERSIBLE` (#12949) : un ancien client qui
 * appelle la désactivation l'affiche tel quel.
 */
export const E2EE_IRREVERSIBLE_MESSAGE =
  'End-to-end encryption cannot be turned off for this conversation. To chat without it, start a new conversation.';

/**
 * Le texte servi avec `E2EE_DIRECT_ALREADY_END_TO_END` (#12966) : chiffrer un
 * tête-à-tête alors que la paire en a déjà un chiffré de bout en bout. La
 * réponse nomme ce tête-à-tête (`existingConversationId`), dont l'appelant est
 * membre.
 */
export const E2EE_DIRECT_ALREADY_END_TO_END_MESSAGE =
  'You already have an end-to-end encrypted conversation with this person. Open it to chat encrypted; this one stays readable by the server.';

const PRIVATE_KEY_FIELD = /private|secret|privkey|seed/i;

/** Vrai si un champ, à n'importe quelle profondeur, porte un nom de clé privée. */
export function containsPrivateKeyField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKeyField);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, inner]) => PRIVATE_KEY_FIELD.test(key) || containsPrivateKeyField(inner));
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const base64 = (maxChars: number) => z.string().min(4).max(maxChars).regex(BASE64, 'base64 attendu');

const PUBLIC_KEY_MAX_CHARS = 4096;
const SIGNATURE_MAX_CHARS = 128;

const keyId = z.number().int().min(0).max(0x7fffffff);

export const e2eeDeviceIdSchema = z.number().int().min(E2EE_DEVICE_ID_MIN).max(E2EE_DEVICE_ID_MAX);

export const e2eeRegistrationIdSchema = z.number().int().min(1).max(0x3fff);

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'identifiant attendu');

export const e2eeSignedPreKeySchema = z.object({
  keyId,
  publicKey: base64(PUBLIC_KEY_MAX_CHARS),
  signature: base64(SIGNATURE_MAX_CHARS),
});

export const e2eeOneTimePreKeySchema = z.object({
  keyId,
  publicKey: base64(PUBLIC_KEY_MAX_CHARS),
});

export const e2eeKyberOneTimePreKeySchema = e2eeSignedPreKeySchema;

export const e2eePlatformSchema = z.enum(['ios', 'macos', 'android', 'web']);

const oneTimeBatches = {
  oneTimePreKeys: z.array(e2eeOneTimePreKeySchema).max(E2EE_ONE_TIME_PREKEY_BATCH_MAX).optional(),
  kyberPreKeys: z.array(e2eeKyberOneTimePreKeySchema).max(E2EE_ONE_TIME_PREKEY_BATCH_MAX).optional(),
};

export const e2eeEnrollDeviceRequestSchema = z.object({
  registrationId: e2eeRegistrationIdSchema,
  identityKey: base64(PUBLIC_KEY_MAX_CHARS),
  signedPreKey: e2eeSignedPreKeySchema,
  kyberLastResort: e2eeSignedPreKeySchema,
  platform: e2eePlatformSchema,
  label: z.string().max(64).optional(),
  /** Preuve de possession de la clé d'identité : signature de `deviceBindingMessage`. */
  binding: z.object({
    timestamp: z.number().int().positive(),
    signature: base64(SIGNATURE_MAX_CHARS),
  }),
  ...oneTimeBatches,
});

export type E2EEEnrollDeviceRequest = z.infer<typeof e2eeEnrollDeviceRequestSchema>;

export const e2eePublishKeysRequestSchema = z.object({
  signedPreKey: e2eeSignedPreKeySchema.optional(),
  kyberLastResort: e2eeSignedPreKeySchema.optional(),
  ...oneTimeBatches,
});

export type E2EEPublishKeysRequest = z.infer<typeof e2eePublishKeysRequestSchema>;

export const e2eeEnvelopeSchema = z.object({
  userId: objectId,
  deviceId: e2eeDeviceIdSchema,
  registrationId: e2eeRegistrationIdSchema,
  type: z.union([z.literal(2), z.literal(3)]),
  body: base64(E2EE_ENVELOPE_BOUNDS.maxBodyBase64Chars),
});

export type E2EEEnvelope = z.infer<typeof e2eeEnvelopeSchema>;

/**
 * Les champs qu'un envoi libsignal ajoute à l'enveloppe de chiffrement du
 * message, déclarés UNE fois pour REST et socket
 * (`services/gateway/src/validation/encryption-envelope.ts` les répand).
 */
export const E2EE_SEND_SHAPE = {
  encryptionProtocol: z.literal(LIBSIGNAL_PROTOCOL).optional(),
  envelopes: z
    .array(e2eeEnvelopeSchema)
    .min(1)
    .max(E2EE_ENVELOPE_BOUNDS.maxEnvelopes)
    .refine(
      (list) => list.reduce((total, envelope) => total + envelope.body.length, 0) <= E2EE_ENVELOPE_BOUNDS.maxTotalBase64Chars,
      { message: 'envelopes exceed 512 KiB in total' },
    )
    .optional(),
  unapprovedOwnDevices: z.array(e2eeDeviceIdSchema).max(E2EE_ENVELOPE_BOUNDS.maxEnvelopes).optional(),
} as const;

/** Un appareil désigné par la passerelle dans un 409 Sesame. */
export type E2EEDeviceRef = { readonly userId: string; readonly deviceId: number };

/** Le corps du 409 `E2EE_DEVICES_MISMATCH` (Sesame § 3). */
export type E2EEDevicesMismatch = {
  readonly missing: readonly E2EEDeviceRef[];
  readonly extra: readonly E2EEDeviceRef[];
  readonly stale: readonly E2EEDeviceRef[];
};

/** Un bundle servi pour UN appareil : PQXDH § 2.4, une pré-clé unique EC au plus, une Kyber toujours. */
export type E2EEDeviceBundle = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly signedPreKey: z.infer<typeof e2eeSignedPreKeySchema>;
  readonly kyberPreKey: z.infer<typeof e2eeSignedPreKeySchema> & { readonly lastResort: boolean };
  readonly preKey: z.infer<typeof e2eeOneTimePreKeySchema> | null;
};

/** Une enveloppe servie à SON appareil destinataire. */
export type E2EEServedEnvelope = {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  /** La génération destinataire : un appareil écarte une enveloppe qui n'est pas pour SA registrationId (#12592). */
  readonly recipientRegistrationId: number;
  readonly senderUserId: string;
  readonly senderDeviceId: number;
  readonly type: 2 | 3;
  readonly body: string;
  readonly createdAt: string;
};

/**
 * Ce que le transport (REST ou socket) remet à la passerelle pour un envoi
 * libsignal, à côté du message. Il voyage dans `encryptedPayload.relay` et
 * n'est JAMAIS persisté dans `Message.encryptionMetadata` : les enveloppes
 * vivent dans `MessageEnvelope`, une par appareil destinataire.
 */
export type E2EERelayRequest = {
  readonly protocol: typeof LIBSIGNAL_PROTOCOL;
  readonly senderDeviceId: number;
  readonly envelopes: readonly E2EEEnvelope[];
  readonly unapprovedOwnDevices: readonly number[];
  /** La session (`sid`) de l'appel, qui doit être celle de l'appareil émetteur. */
  readonly sessionId: string | null;
};
