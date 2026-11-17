/**
 * LE CONTRAT DE LA CONFIRMATION D'UN APPAREIL PAR CODE (#18906, #19154, #19156).
 *
 * Spécification : `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4.1,
 * § 4.3, § 4.8 (les messages de comparaison et leur validation), § 5.1 à 5.3 (capacité,
 * relais, annonce). Décision : `services/gateway/decisions/2026-11-17-un-appareil-s-ajoute-par-un-code-a-confirmer.md`.
 *
 * Les messages de comparaison sont PUBLICS par construction (clés publiques, engagement, aléas
 * révélés) : la passerelle les relaie en clair, sous TLS, entre deux appareils du MÊME compte.
 * Ses schémas refusent ce que les clients refusent (négatifs « refus » des vecteurs communs) :
 * un relais valide et refuse, il ne corrige jamais — une forme réécrite changerait les octets
 * que les deux appareils comparent. Ces contrôles sont de l'HYGIÈNE : la sécurité vient de la
 * comparaison des codes, jamais d'un champ que le serveur pose (§ 5).
 *
 * Le registre de confiance (§ 6) n'est PAS ici : son texte attend sa contre-relecture.
 */
import { z } from 'zod';
import {
  canonicalBase64,
  deviceLabelProblem,
  DEVICE_VERIFICATION_PLATFORMS,
  DEVICE_VERIFICATION_SIZES,
  identityKeyBytes,
  utf8Bytes,
} from '../encryption/device-verification/descriptor.js';
import { e2eeDeviceIdSchema, e2eePlatformSchema, e2eeRegistrationIdSchema, type E2EEOwnDevice } from './e2ee-directory.js';

/** La capacité qu'un client déclare quand il sait comparer et synchroniser (§ 5.1). */
export const DEVICE_TRUST_CAPABILITY = 'device-trust-v1' as const;

/** La seule version des messages de comparaison ; une autre fait annuler par `unsupported`. */
export const DEVICE_VERIFICATION_VERSION = 1 as const;

/** Un message de comparaison vit dix minutes au relais (§ 5.2). */
export const DEVICE_VERIFICATION_TTL_MS = 10 * 60 * 1000;

/** Le corps d'un message, sérialisé en JSON et encodé en UTF-8 : au plus 2 Kio (§ 5.2). */
export const DEVICE_VERIFICATION_MAX_MESSAGE_BYTES = 2048;

export const DEVICE_VERIFICATION_METHODS = ['emoji', 'decimal'] as const;
export type DeviceVerificationMethod = (typeof DEVICE_VERIFICATION_METHODS)[number];

export const DEVICE_VERIFICATION_CANCEL_REASONS = [
  'user-denied',
  'user-mismatch',
  'commitment-mismatch',
  'key-mismatch',
  'timeout',
  'accepted-elsewhere',
  'superseded',
  'unexpected-message',
  'unsupported',
  'limit',
] as const;
export type DeviceVerificationCancelReason = (typeof DEVICE_VERIFICATION_CANCEL_REASONS)[number];

export const DEVICE_VERIFICATION_TYPES = ['request', 'accept', 'reveal', 'method', 'cancel'] as const;
export type DeviceVerificationType = (typeof DEVICE_VERIFICATION_TYPES)[number];

const canonicalBytes = (length: number, field: string) =>
  z.string().refine((text) => canonicalBase64(text, length) !== null, { message: `${field}: base64 canonique de ${length} octets attendu` });

const lowercaseObjectId = z.string().regex(/^[0-9a-f]{24}$/, 'identifiant en minuscules attendu');

/** Le libellé de la COMPARAISON (§ 4.1) — jamais celui du schéma d'enrôlement, qui reste permissif (#9223). */
export const deviceVerificationLabelSchema = z.string().refine((label) => deviceLabelProblem(label) === null, {
  message: 'libellé : scalaires bien formés, NFC, sans contrôle, 1 à 64 unités UTF-16',
});

/** Le descripteur qu'authentifie le code (§ 4.1). Aucun champ en trop. */
export const deviceDescriptorSchema = z.strictObject({
  userId: lowercaseObjectId,
  deviceId: e2eeDeviceIdSchema,
  registrationId: e2eeRegistrationIdSchema,
  identityKey: z.string().refine((text) => identityKeyBytes(text) !== null, { message: 'clé d’identité : 33 octets, 0x05 en tête, base64 canonique' }),
  platform: z.enum(DEVICE_VERIFICATION_PLATFORMS),
  label: deviceVerificationLabelSchema.optional(),
});

const header = {
  v: z.literal(DEVICE_VERIFICATION_VERSION),
  tx: canonicalBytes(DEVICE_VERIFICATION_SIZES.tx, 'tx'),
};

const method = z.enum(DEVICE_VERIFICATION_METHODS);

export const deviceVerificationRequestSchema = z.strictObject({
  ...header,
  type: z.literal('request'),
  from: deviceDescriptorSchema,
  commitment: canonicalBytes(DEVICE_VERIFICATION_SIZES.commitment, 'commitment'),
  methods: z
    .array(method)
    .min(1)
    .max(DEVICE_VERIFICATION_METHODS.length)
    .refine((methods) => new Set(methods).size === methods.length, { message: 'méthodes en double' }),
});

export const deviceVerificationAcceptSchema = z.strictObject({
  ...header,
  type: z.literal('accept'),
  from: deviceDescriptorSchema,
  nonce: canonicalBytes(DEVICE_VERIFICATION_SIZES.nonce, 'nonce'),
  method,
});

export const deviceVerificationRevealSchema = z.strictObject({
  ...header,
  type: z.literal('reveal'),
  nonce: canonicalBytes(DEVICE_VERIFICATION_SIZES.nonce, 'nonce'),
});

export const deviceVerificationMethodSchema = z.strictObject({ ...header, type: z.literal('method'), method });

export const deviceVerificationCancelSchema = z.strictObject({
  ...header,
  type: z.literal('cancel'),
  reason: z.enum(DEVICE_VERIFICATION_CANCEL_REASONS),
});

/** Un octet UTF-8 de plus que 2 Kio, et le message est refusé : il ne porte que des données publiques de taille fixe. */
export const withinDeviceVerificationBodyLimit = (message: unknown): boolean =>
  utf8Bytes(JSON.stringify(message) ?? '').length <= DEVICE_VERIFICATION_MAX_MESSAGE_BYTES;

export const deviceVerificationMessageSchema = z
  .discriminatedUnion('type', [
    deviceVerificationRequestSchema,
    deviceVerificationAcceptSchema,
    deviceVerificationRevealSchema,
    deviceVerificationMethodSchema,
    deviceVerificationCancelSchema,
  ])
  .refine(withinDeviceVerificationBodyLimit, { message: 'message de comparaison au-delà de 2 Kio' });

export type DeviceDescriptorWire = z.infer<typeof deviceDescriptorSchema>;
export type DeviceVerificationRequest = z.infer<typeof deviceVerificationRequestSchema>;
export type DeviceVerificationAccept = z.infer<typeof deviceVerificationAcceptSchema>;
export type DeviceVerificationReveal = z.infer<typeof deviceVerificationRevealSchema>;
export type DeviceVerificationMethodSwitch = z.infer<typeof deviceVerificationMethodSchema>;
export type DeviceVerificationCancel = z.infer<typeof deviceVerificationCancelSchema>;
export type DeviceVerificationMessage = z.infer<typeof deviceVerificationMessageSchema>;

/** Une génération d'appareil, telle que le relais l'adresse et la pose (`relayedFrom`, `answeredBy`). */
export const deviceGenerationRefSchema = z.strictObject({ deviceId: e2eeDeviceIdSchema, registrationId: e2eeRegistrationIdSchema });
export type DeviceGenerationRefWire = z.infer<typeof deviceGenerationRefSchema>;

/**
 * `to` : `"others"` = tous mes autres appareils ACTIFS qui déclarent `device-trust-v1` ;
 * une génération nommée = l'appareil que l'utilisateur a désigné après une course (§ 4.6).
 */
export const deviceVerificationTargetSchema = z.union([z.literal('others'), deviceGenerationRefSchema]);

/** `POST /e2ee/devices/self/verifications` et `e2ee:send-verification` : la même charge. */
export const deviceVerificationSendSchema = z.strictObject({
  to: deviceVerificationTargetSchema,
  message: deviceVerificationMessageSchema,
});
export type DeviceVerificationSend = z.infer<typeof deviceVerificationSendSchema>;

/** Ce que le relais rend à l'émetteur : un id par copie déposée, et les générations atteintes. */
export type DeviceVerificationSent = {
  readonly ids: readonly string[];
  readonly recipients: readonly DeviceGenerationRefWire[];
};

/**
 * Un message servi à SA génération destinataire (`GET`, `e2ee:verification`). `relayedFrom`
 * est la génération que le relais a vérifiée (celle de la session émettrice), hors du message.
 * `answeredBy` n'existe que sur un `cancel(accepted-elsewhere)` que le relais a SUBSTITUÉ à une
 * copie en attente : il nomme la génération qui a répondu (§ 5.2).
 */
export type ServedDeviceVerification = {
  readonly id: string;
  readonly relayedFrom: DeviceGenerationRefWire;
  readonly message: DeviceVerificationMessage;
  readonly answeredBy?: DeviceGenerationRefWire;
  readonly createdAt: string;
};

export const deviceVerificationListQuerySchema = z.object({ after: lowercaseObjectId.optional() });

export const deviceVerificationAckSchema = z.strictObject({ ids: z.array(lowercaseObjectId).min(1).max(200) });

/** L'accusé de `e2ee:send-verification`. */
export type DeviceVerificationSendAck =
  | { readonly success: true; readonly data: DeviceVerificationSent }
  | { readonly success: false; readonly error: string; readonly code: string };

/** Les codes que le relais pose en `code` à côté d'`error`. */
export const DEVICE_VERIFICATION_ERROR_CODES = {
  /** La charge ne passe pas les schémas (forme, taille, champ en trop, clé privée nommée). */
  INVALID: 'E2EE_DEVICE_VERIFICATION_INVALID',
  /** `from` ne décrit pas la génération de la session émettrice telle que l'annuaire la tient. */
  FROM_MISMATCH: 'E2EE_DEVICE_VERIFICATION_FROM_MISMATCH',
  /** L'appareil émetteur ne déclare pas `device-trust-v1`, ou sa plateforme est inconnue : il se réenrôle d'abord. */
  NOT_CAPABLE: 'E2EE_DEVICE_VERIFICATION_NOT_CAPABLE',
  /** Débit de la génération émettrice dépassé (`Retry-After`). */
  RATE_LIMITED: 'E2EE_DEVICE_VERIFICATION_RATE_LIMITED',
} as const;

/**
 * `e2ee:own-device-enrolled` — un appareil a rejoint mon compte, ou une génération retirée y
 * revient (`returning`). Données du SERVEUR : elles déclenchent un affichage (« Ce n'est pas
 * moi / C'est moi »), jamais une approbation (§ 5.3).
 */
export type E2EEOwnDeviceEnrolledEventData = {
  readonly deviceId: number;
  readonly registrationId: number;
  readonly platform: E2EEOwnDevice['platform'];
  readonly label: string | null;
  readonly enrolledAt: string;
  readonly capabilities: readonly string[];
  readonly returning: boolean;
  /** Annonces d'enrôlement de ce compte dans l'heure glissante, celle-ci comprise : au-delà de 3, elles se regroupent. */
  readonly announcedInLastHour: number;
};

/** `e2ee:own-device-retired` — une génération de mon compte a été retirée. */
export type E2EEOwnDeviceRetiredEventData = { readonly deviceId: number; readonly registrationId: number };

/** Le push visible de l'annonce : ni libellé, ni clé, ni `tx` (§ 5.3, § 7.6). */
export const E2EE_DEVICE_VERIFICATION_PUSH_TYPE = 'e2ee_device_verification' as const;

/** Au plus 3 annonces individuelles par heure et par compte ; les suivantes se regroupent (§ 5.3). */
export const E2EE_DEVICE_ANNOUNCEMENTS_PER_HOUR = 3;

/** La plateforme d'un descripteur est celle de l'annuaire ; `unknown` ne compare pas (§ 4.8). */
export const isComparablePlatform = (platform: string): boolean => e2eePlatformSchema.safeParse(platform).success;
