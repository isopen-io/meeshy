/**
 * #16706 — un message DÉTRUIT ne laisse pas son clair dans la file de rejeu
 * hors ligne.
 *
 * #16685 avait fermé la REMISE (le drain interroge la vivacité du message avant
 * d'émettre) et laissé le STOCKAGE ouvert, délibérément :
 * `enqueueForOfflineParticipants` écrit `payload: body` VERBATIM dans
 * `delivery:queue:<userId>` — Redis, AOF, TTL de 48 h. Quand
 * `ExpiredMessagesCleanupService._burn` détruisait la ligne, la copie enfilée
 * restait LISIBLE, alors que `_burn` revendique dans son propre commentaire
 * « le contenu est détruit — c'est l'invariant qui compte ».
 *
 * Ces témoins sont le JUMEAU exact de ceux de #16557 (la copie en mémoire des
 * traductions) : même unité de retrait, même registre, même question — *quelle
 * autre copie du texte survit ?* — posée cette fois à un SUBSTRAT voisin plutôt
 * qu'à une table voisine.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onMessageDeleted: jest.fn<any>().mockResolvedValue(undefined) },
}));

import {
  setSharedDeliveryQueue,
  getSharedDeliveryQueue,
} from '../../../../services/delivery-queue-registry';
import { applyMessageRemovalEffects } from '../../../../services/messaging/messageRemovalEffects';
import { purgeDueViewOnceContent } from '../../../../services/messaging/purgeViewOnceContent';

const DESTROYED = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439022';

/** Le double ENREGISTRE ce qu'on lui demande de purger : c'est l'identité du message qui compte. */
const recordingQueue = () => {
  const purged: string[] = [];
  setSharedDeliveryQueue({
    purgeMessage: async (messageId: string) => {
      purged.push(messageId);
      return 1;
    },
  });
  return purged;
};

const removalPrisma = () =>
  ({
    message: { findRaw: async () => [], findFirst: async () => null },
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
  }) as never;

const removedRecord = {
  id: DESTROYED,
  conversationId: CONVERSATION,
  senderId: 'p-1',
  senderUserId: null,
  messageType: 'text',
  attachmentMimeTypes: [],
};

afterEach(() => setSharedDeliveryQueue(undefined));

describe('le retrait d’un message purge sa copie en file hors ligne (#16706)', () => {
  it('purge la file pour le message retiré, et pour lui seul', async () => {
    const purged = recordingQueue();

    await applyMessageRemovalEffects(removalPrisma(), removedRecord, undefined);

    expect(purged).toEqual([DESTROYED]);
  });

  it('purge aussi une VUE UNIQUE, dont aucune garde de remise ne peut voir la mort', async () => {
    // C'est le cas qui rend ce site distinct de tous les autres. La garde du
    // drain se prononce sur `deletedAt` et `expiresAt` — les deux seules preuves
    // que `messageLivenessOf` connaît — et une vue unique purgée n'en porte
    // AUCUNE : la bulle reste, c'est la raison d'être du module. Ici la purge du
    // stockage n'est pas la seconde moitié d'une protection, elle EST la
    // protection.
    const purged = recordingQueue();
    const prisma = {
      message: {
        findMany: async () => [{ id: DESTROYED, conversationId: CONVERSATION, viewOnceBurnedAt: null, attachments: [] }],
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
      },
      messageAttachment: { updateMany: async () => ({ count: 0 }), findMany: async () => [] },
      sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
    } as never;

    await purgeDueViewOnceContent(prisma, { now: new Date('2026-11-08T10:00:00Z') });

    expect(purged).toEqual([DESTROYED]);
  });

  it('ne lève jamais : une file qui refuse ne transforme pas un retrait réussi en échec', async () => {
    setSharedDeliveryQueue({
      purgeMessage: async () => {
        throw new Error('redis down');
      },
    });

    await expect(applyMessageRemovalEffects(removalPrisma(), removedRecord, undefined)).resolves.toBeUndefined();
  });

  it('ne fait rien dans un processus qui n’a enregistré aucune file', async () => {
    expect(getSharedDeliveryQueue()).toBeUndefined();

    await expect(applyMessageRemovalEffects(removalPrisma(), removedRecord, undefined)).resolves.toBeUndefined();
  });

  it('le processus enregistre SA file de rejeu comme file à purger', () => {
    // Même garde de source que son jumeau #16557, et pour la même raison : la
    // purge est résolue par un REGISTRE, donc rien dans le chemin d'appel ne
    // rougirait si personne n'enregistrait l'instance vivante — la purge
    // deviendrait un no-op muet dans tout le processus.
    const server = readFileSync(join(__dirname, '../../../../server.ts'), 'utf8');

    expect(server).toMatch(/setSharedDeliveryQueue\(this\.deliveryQueue\)/);
  });
});
