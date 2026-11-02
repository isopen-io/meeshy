/**
 * LES CONSTANTES DU FIL E2EE, recopiées de `@meeshy/shared/types/e2ee-directory`
 * et `e2ee-signals` (#14592) pour ne pas tirer Zod (déclaré au niveau module de
 * ces fichiers) dans les chunks du navigateur ; `wire.test.ts` les tient égales
 * à la source, valeur par valeur.
 */
export const LIBSIGNAL_PROTOCOL = 'libsignal-v1' as const;

export const E2EE_CODES = {
  DEVICES_MISMATCH: 'E2EE_DEVICES_MISMATCH',
  DEVICE_NOT_BOUND: 'E2EE_DEVICE_NOT_BOUND',
  DEVICE_LIMIT_REACHED: 'E2EE_DEVICE_LIMIT_REACHED',
  IDENTITY_REVOKED: 'E2EE_IDENTITY_REVOKED',
} as const;

export const deviceBindingMessage = (binding: {
  readonly userId: string;
  readonly registrationId: number;
  readonly identityKey: string;
  readonly timestamp: number;
}): string => `meeshy-e2ee-device-binding:v1:${binding.userId}:${binding.registrationId}:${binding.identityKey}:${binding.timestamp}`;

export const E2EE_PADDING_TIERS = [256, 1024, 4096, 16384] as const;
export const E2EE_PADDING_STEP = 16384;
export const E2EE_PADDING_CIPHER_OVERHEAD = 2048;
const PADDING_ENVELOPE_BYTES = 64 * 1024;
const PADDING_TOTAL_BYTES = 512 * 1024;

const ceiling = (recipients: number): number =>
  Math.min(PADDING_ENVELOPE_BYTES, Math.floor(PADDING_TOTAL_BYTES / Math.max(recipients, 1))) - E2EE_PADDING_CIPHER_OVERHEAD;

export function e2eePaddedLength(length: number, recipients: number): number {
  const limit = ceiling(recipients);
  if (length > limit) return length;
  const bucket = E2EE_PADDING_TIERS.find((tier) => tier >= length) ?? Math.ceil(length / E2EE_PADDING_STEP) * E2EE_PADDING_STEP;
  return Math.min(bucket, limit);
}
