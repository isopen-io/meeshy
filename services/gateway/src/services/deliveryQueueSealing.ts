/**
 * #12822 — le sceau de la file de livraison hors ligne (`RedisDeliveryQueue`).
 *
 * Une conversation `server`/`hybrid` est chiffrée au repos dans MongoDB ; sa
 * file hors ligne vit dans Redis (48 h, `appendonly`) et y rangeait le clair de
 * `message:new` et de `message:translation`. L'entrée d'une telle conversation
 * part donc SCELLÉE : `payload` vide, la charge entière (texte, traductions,
 * noms de fichiers, tout ce qui voyage à côté) dans `sealedPayload`, sous la clé
 * de la conversation et liée à son message, son destinataire, son événement et
 * sa clé de dédup (`delivery-queue:v2`). Le drain la rouvre : le client,
 * ancien ou nouveau, reçoit l'événement d'avant, octet pour octet.
 *
 * Forme choisie plutôt qu'une simple référence (messageId + langue, relue par
 * REST) : aucun client ne relit spontanément au reconnect — c'est la raison
 * d'être de la file —, une référence aurait donc perdu la traduction des
 * clients existants. Le sceau garde le fil inchangé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload, SealedQueuedPayload } from '@meeshy/shared/types/delivery-queue';
import { getEncryptionService, type EncryptionService } from './EncryptionService';
import { ServerAtRestUnreadableError } from './messaging/serverAtRest';

/** `recipient` : la clé de file (le `User.id`, ou le `Participant.id` d'un anonyme), liée au sceau (L1). */
export type DeliveryQueueSealer = {
  seal(entry: QueuedMessagePayload, recipient: string): Promise<QueuedMessagePayload>;
  open(entry: QueuedMessagePayload & { readonly sealedPayload: SealedQueuedPayload }, recipient: string): Promise<QueuedMessagePayload>;
};

const bindingOf = (entry: QueuedMessagePayload, recipient: string) => ({
  conversationId: entry.conversationId,
  messageId: entry.messageId,
  recipient,
  eventType: entry.eventType ?? 'new',
  ...(entry.dedupKey ? { dedupKey: entry.dedupKey } : {}),
});

type QueueCipher = Pick<EncryptionService, 'sealQueuedPayload' | 'openQueuedPayload'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function deliveryQueueSealer(cipher: () => Promise<QueueCipher>): DeliveryQueueSealer {
  return {
    seal: async (entry, recipient) => {
      const { sealedPayload: _previous, ...plain } = entry;
      const sealedPayload = await (await cipher()).sealQueuedPayload({
        plaintext: JSON.stringify(plain.payload),
        ...bindingOf(plain, recipient),
      });
      return { ...plain, payload: {}, sealedPayload };
    },
    open: async (entry, recipient) => {
      const { sealedPayload, ...rest } = entry;
      const text = await (await cipher()).openQueuedPayload(sealedPayload, bindingOf(rest, recipient));
      const payload: unknown = JSON.parse(text);
      if (!isRecord(payload)) throw new ServerAtRestUnreadableError('malformed');
      return { ...rest, payload };
    },
  };
}

/** Le sceau de la passerelle : le service de chiffrement n'est chargé qu'au premier usage. */
export function gatewayDeliveryQueueSealer(prisma: PrismaClient): DeliveryQueueSealer {
  const state: { pending: Promise<QueueCipher> | null } = { pending: null };
  return deliveryQueueSealer(() => {
    state.pending = state.pending ?? getEncryptionService(prisma);
    return state.pending;
  });
}
