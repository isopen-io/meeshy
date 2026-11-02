/**
 * Sépare la charge de chiffrement d'un envoi en ce qui se PERSISTE sur la ligne
 * `Message` (le marqueur et les métadonnées) et ce qui ne s'y écrit JAMAIS :
 * le relais libsignal (#3706), dont les enveloppes vont dans `MessageEnvelope`,
 * une par appareil. `encryptionMetadata` a une borne de 8 Ko et chaque appareil
 * lirait celles des autres : c'est l'alternative rejetée par la décision
 * passerelle du 2026-10-23.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import type { MessageRequest } from '@meeshy/shared/types/messaging';

export type PersistableEncryption = {
  readonly encryptedContent?: string;
  readonly encryptionMetadata?: Prisma.InputJsonValue;
  readonly e2eeRelay?: E2EERelayRequest;
};

export function persistableEncryption(payload: MessageRequest['encryptedPayload']): PersistableEncryption {
  if (!payload) return {};
  const { relay, ...persisted } = payload;
  return {
    encryptedContent: payload.ciphertext,
    encryptionMetadata: { mode: 'e2ee', ...persisted } as unknown as Prisma.InputJsonValue,
    ...(relay ? { e2eeRelay: relay } : {}),
  };
}
