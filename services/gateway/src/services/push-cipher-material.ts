import type { PushNotificationPayload } from './PushNotificationService';

/**
 * #13114 — le SECOND verrou du fil push. L'éventail décide quel chiffré voyage
 * (`deviceEnvelopeForPush` : la seule enveloppe d'un appareil, en `e2ee`) ;
 * ici, aucune matière de clé ne part vers Apple ou Google, quel que soit
 * l'appelant qui l'aurait glissée dans `data`.
 */
export const PUSH_FORBIDDEN_CIPHER_KEYS: ReadonlySet<string> = new Set([
  'encryptionMetadata',
  'serverEncryptionKeyId',
  'encryptionKey',
  'encryptionKeyId',
  'sessionKey',
  'privateKey',
]);

export function withoutCipherKeyMaterial<T extends Pick<PushNotificationPayload, 'data'>>(payload: T): T {
  if (!payload.data) return payload;
  const data = Object.fromEntries(
    Object.entries(payload.data).filter(([key]) => !PUSH_FORBIDDEN_CIPHER_KEYS.has(key)),
  );
  return { ...payload, data };
}
