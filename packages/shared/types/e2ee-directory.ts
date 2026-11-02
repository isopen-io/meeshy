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
import {
  LIBSIGNAL_PROTOCOL,
  E2EE_DEVICE_ID_MIN,
  E2EE_DEVICE_ID_MAX,
  E2EE_ENVELOPE_BOUNDS,
  E2EE_ONE_TIME_PREKEY_BATCH_MAX,
} from './e2ee-protocol.js';

export {
  LIBSIGNAL_PROTOCOL,
  E2EE_DEVICE_ID_MIN,
  E2EE_DEVICE_ID_MAX,
  E2EE_ENVELOPE_BOUNDS,
  E2EE_MAX_ACTIVE_DEVICES,
  E2EE_ONE_TIME_PREKEY_BATCH_MAX,
  E2EE_ONE_TIME_PREKEY_STOCK_MAX,
  E2EE_DEVICE_BINDING_MAX_SKEW_MS,
  deviceBindingMessage,
  E2EE_ENVELOPE_RETENTION_DAYS,
  E2EE_ERROR_CODES,
  type E2EEErrorCode,
} from './e2ee-protocol.js';

/** Le texte lisible servi à un client qui ne parle pas libsignal (#9223 : rien ne se perd en silence). */
export const E2EE_CLIENT_OUTDATED_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : mettez à jour Meeshy pour y écrire';

/**
 * Le texte servi avec `E2EE_SIGNAL_CHANNEL_REQUIRED` (#13142) : un client qui
 * appelle encore la route en clair d'une réaction, de la frappe, d'une
 * suppression pour tous, d'une vue unique ou d'un épinglage dans une
 * conversation chiffrée de bout en bout l'affiche tel quel — rien ne se perd en
 * silence (#9223).
 */
export const E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : mettez à jour Meeshy pour réagir, épingler, supprimer ou ouvrir une vue unique';

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

/** Le texte servi avec `E2EE_DIRECT_NOT_A_PAIR` (#12966). */
export const E2EE_DIRECT_NOT_A_PAIR_MESSAGE =
  'A direct conversation can only be end-to-end encrypted between exactly two active members.';

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

/**
 * Un de MES appareils chiffrés, tel que `GET /e2ee/devices` le sert à son seul
 * propriétaire (#13014). Aucune clé, aucune session : de quoi le reconnaître
 * (plateforme, libellé, dates) et savoir lequel est celui de la session appelante.
 * Un contact ne lit jamais ces champs (`/e2ee/keys/:userId/devices` n'en sert aucun).
 */
export type E2EEOwnDevice = {
  readonly deviceId: number;
  readonly registrationId: number;
  /** `unknown` pour une ligne écrite hors du schéma d'enrôlement : jamais une plateforme devinée. */
  readonly platform: z.infer<typeof e2eePlatformSchema> | 'unknown';
  readonly label: string | null;
  readonly enrolledAt: string;
  /** Dernier enrôlement ou dernière publication de pré-clés : PAS une activité (la lecture d'enveloppes ne l'avance pas). */
  readonly lastSeenAt: string;
  readonly current: boolean;
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

/**
 * La COUCHE APPAREIL d'un envoi hybride (#14369) : le même relais libsignal
 * qu'un envoi `e2ee` (une enveloppe opaque par appareil, admise par Sesame),
 * mais posé À CÔTÉ d'un texte en clair que la passerelle scelle au repos. Elle
 * ne naît que d'un envoi SANS `encryptedContent` : un chiffré n'a pas de clair
 * à côté, et un clair n'a de couche appareil que dans une conversation `hybrid`.
 *
 * Ce qu'elle apporte au destinataire : l'intégrité et le transit (le texte
 * scellé par l'appareil émetteur se compare au texte servi), jamais la
 * confidentialité vis-à-vis du serveur, qui lit la couche serveur.
 */
export type E2EEDeviceLayerRequest = {
  readonly relay: E2EERelayRequest;
  /** L'époque du régime sous laquelle l'appareil a scellé (#12522), quand il la déclare. */
  readonly regimeEpoch?: number;
};

/** La clé de `Message.metadata` qui dit qu'un message hybride porte sa couche appareil (#14369). */
export const HYBRID_DEVICE_LAYER_METADATA_KEY = 'deviceLayer' as const;
