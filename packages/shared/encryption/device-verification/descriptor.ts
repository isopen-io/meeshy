/**
 * LE DESCRIPTEUR D'UN APPAREIL et ses formes refusées — confirmation d'un appareil par
 * code court (#18906, #19154).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`,
 * § 4.1 (encodage) et § 4.8 (validation à la réception). Vecteurs :
 * `fixtures/e2ee-device-verification/sas-v1.vectors.json`.
 *
 * `enc(X) = LP(ascii(userId)) ‖ u32(deviceId) ‖ u32(registrationId) ‖ LP(identityKey)
 *          ‖ LP(utf8(platform)) ‖ LP(utf8(label ?? ""))`
 *
 * Rien n'est normalisé ici : le `userId` voyage en minuscules et un libellé tel que son
 * auteur l'a sérialisé. Une forme qui n'est pas exactement la bonne est REFUSÉE, jamais
 * corrigée — c'est ce qui donne les mêmes octets à l'initiateur, au répondeur et au
 * relais (§ 4.4, « personne ne réécrit le message »). Ce module ne dépend que de
 * `atob`/`btoa` et `TextEncoder`, présents dans Node 22 et dans tous les navigateurs.
 */

export const DEVICE_VERIFICATION_PROTOCOL = 'meeshy-device-verification:v1' as const;

export const DEVICE_VERIFICATION_PLATFORMS = ['ios', 'macos', 'android', 'web'] as const;
export type DeviceVerificationPlatform = (typeof DEVICE_VERIFICATION_PLATFORMS)[number];

export const DEVICE_VERIFICATION_SIZES = {
  tx: 16,
  nonce: 32,
  commitment: 32,
  identityKey: 33,
  code: 6,
  ack: 2,
  okm: 8,
} as const;

/** Bornes d'une génération (`E2EEDevice`) : la place de `ProtocolAddress`, la `registrationId` de libsignal. */
export const DEVICE_ID_RANGE = { min: 1, max: 127 } as const;
export const REGISTRATION_ID_RANGE = { min: 1, max: 16383 } as const;

/** Le libellé : au plus 64 unités UTF-16 (§ 4.1), comme l'annuaire. */
export const DEVICE_LABEL_MAX_UTF16 = 64;

const IDENTITY_KEY_TYPE = 0x05;

/** Un appareil tel que la comparaison l'authentifie : un libellé vide s'écrit en OMETTANT le champ. */
export type DeviceDescriptor = {
  readonly userId: string;
  readonly deviceId: number;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly platform: DeviceVerificationPlatform;
  readonly label?: string;
};

export type DescriptorProblem = 'userId' | 'deviceId' | 'registrationId' | 'identityKey' | 'platform' | 'label';
export type LabelProblem = 'type' | 'vide' | 'demi-paire' | 'non-nfc' | 'controle' | 'trop-long';

const OBJECT_ID = /^[0-9a-f]{24}$/;
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;
/** En mode `u`, une paire de substitution est UN point de code : cette classe ne voit que les demi-paires. */
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const PLATFORMS: ReadonlySet<string> = new Set(DEVICE_VERIFICATION_PLATFORMS);

export const utf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Encode en base64 standard avec remplissage (RFC 4648 § 4). */
export function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

/**
 * Le base64 CANONIQUE : alphabet standard, remplissage complet, et décodé puis réencodé
 * identique (aucun blanc, aucun bit de remplissage non nul). `atob` est laxiste : on ne
 * s'y fie pas, on réencode et on compare (§ 3.3). Rend les octets, ou `null`.
 */
export function canonicalBase64(text: unknown, length?: number): Uint8Array | null {
  if (typeof text !== 'string' || text.length % 4 !== 0 || !BASE64_ALPHABET.test(text)) return null;
  const binary = (() => {
    try {
      return atob(text);
    } catch {
      return null;
    }
  })();
  if (binary === null) return null;
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (toBase64(bytes) !== text) return null;
  if (length !== undefined && bytes.length !== length) return null;
  return bytes;
}

/** Une clé d'identité libsignal sérialisée : 33 octets, `0x05` en tête, base64 canonique. */
export function identityKeyBytes(text: unknown): Uint8Array | null {
  const bytes = canonicalBase64(text, DEVICE_VERIFICATION_SIZES.identityKey);
  return bytes !== null && bytes[0] === IDENTITY_KEY_TYPE ? bytes : null;
}

/**
 * Le libellé d'un descripteur : scalaires Unicode bien formés, NFC, aucun caractère de
 * contrôle, 1 à 64 unités UTF-16. Absent = champ omis (`null`, aucun problème) ; `""`
 * est refusé. Ces contrôles valent pour la COMPARAISON et son relais, jamais pour le
 * schéma d'enrôlement de l'annuaire (#9223 : un client publié qui enrôle un libellé NFD
 * continue de s'enrôler).
 */
export function deviceLabelProblem(label: unknown): LabelProblem | null {
  if (label === undefined) return null;
  if (typeof label !== 'string') return 'type';
  if (label.length === 0) return 'vide';
  if (LONE_SURROGATE.test(label)) return 'demi-paire';
  if (label.normalize('NFC') !== label) return 'non-nfc';
  if (CONTROL.test(label)) return 'controle';
  if (label.length > DEVICE_LABEL_MAX_UTF16) return 'trop-long';
  return null;
}

const isInRange = (value: unknown, range: { readonly min: number; readonly max: number }): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;

/** La validation d'un descripteur reçu (§ 4.1, § 4.8) : la raison du refus, ou `null`. */
export function descriptorProblem(device: Partial<Record<keyof DeviceDescriptor, unknown>>): DescriptorProblem | null {
  if (typeof device.userId !== 'string' || !OBJECT_ID.test(device.userId)) return 'userId';
  if (!isInRange(device.deviceId, DEVICE_ID_RANGE)) return 'deviceId';
  if (!isInRange(device.registrationId, REGISTRATION_ID_RANGE)) return 'registrationId';
  if (identityKeyBytes(device.identityKey) === null) return 'identityKey';
  if (typeof device.platform !== 'string' || !PLATFORMS.has(device.platform)) return 'platform';
  return deviceLabelProblem(device.label) === null ? null : 'label';
}

/** Une erreur de forme : le message ne se calcule pas, il se refuse (`cancel(unexpected-message)`). */
export class DeviceVerificationFormError extends Error {
  constructor(readonly field: string) {
    super(`device verification: invalid ${field}`);
    this.name = 'DeviceVerificationFormError';
  }
}

export const u32 = (value: number): Uint8Array => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new DeviceVerificationFormError('u32');
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
};

export const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.length;
  }, 0);
  return out;
};

/** `LP(b) = u32(longueur de b) ‖ b`. */
export const lengthPrefixed = (bytes: Uint8Array): Uint8Array => concatBytes(u32(bytes.length), bytes);

/**
 * `enc(X)` (§ 4.1). Refuse (lève `DeviceVerificationFormError`) un descripteur hors forme :
 * l'initiateur l'encode sur ce qu'il SÉRIALISE, le répondeur sur ce qu'il DÉSÉRIALISE, et
 * ce sont les mêmes octets si personne ne réécrit le message.
 */
export function encodeDescriptor(device: DeviceDescriptor): Uint8Array {
  const problem = descriptorProblem(device);
  if (problem !== null) throw new DeviceVerificationFormError(problem);
  const identityKey = identityKeyBytes(device.identityKey) as Uint8Array;
  return concatBytes(
    lengthPrefixed(Uint8Array.from(device.userId, (char) => char.charCodeAt(0))),
    u32(device.deviceId),
    u32(device.registrationId),
    lengthPrefixed(identityKey),
    lengthPrefixed(utf8Bytes(device.platform)),
    lengthPrefixed(utf8Bytes(device.label ?? '')),
  );
}

/** La génération d'un appareil : la place et la `registrationId` qui l'occupe. */
export type DeviceGenerationRef = { readonly deviceId: number; readonly registrationId: number };

/**
 * Le pair n'est jamais moi (§ 4.4) : ni ma place, ni ma clé. Une collision de
 * `registrationId` entre deux places différentes reste possible et n'est pas un refus.
 */
export const isSelfDescriptor = (
  peer: Pick<DeviceDescriptor, 'deviceId' | 'identityKey'>,
  self: Pick<DeviceDescriptor, 'deviceId' | 'identityKey'>,
): boolean => peer.deviceId === self.deviceId || peer.identityKey === self.identityKey;
