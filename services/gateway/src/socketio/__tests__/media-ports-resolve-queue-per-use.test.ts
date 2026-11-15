/**
 * #18616 — le CONSOMMATEUR réel relit la file à chaque usage.
 *
 * ## Ce que ce fichier garde, et que son voisin ne pouvait pas garder
 *
 * `media-pipeline-delivery-queue-instance.test.ts` prouve que `mediaDeps` porte
 * un ACCESSEUR : il capture le littéral depuis un `mediaReadyPorts` MOQUÉ. Il
 * ne dit donc rien du consommateur — et l'audit adversarial du lot l'a mesuré :
 * ajouter `const { deliveryQueue } = deps;` en tête du VRAI `mediaReadyPorts`
 * laisse `tsc --noEmit` à `EXIT=0` et les 197 suites socket au vert. **Le
 * getter de production serait lu une fois, et l'invariant que le lot revendique
 * serait faux un étage plus bas que là où il est écrit.**
 *
 * > Un accesseur ne garantit une relecture que si quelqu'un relit. La question
 * > à poser à toute dépendance résolue par registre n'est pas « le site
 * > la résout-il à l'usage ? » mais **« le CONSOMMATEUR la redemande-t-il ? »**
 * > — et elle se répond en faisant tourner le consommateur, pas son double.
 *
 * `mediaReadyPorts` est donc RÉEL ici. Seule la feuille (`emitAttachmentUpdated`)
 * est doublée, pour capturer ce qu'on lui remet : c'est le site exact où la
 * file quitte le pipeline média.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const remitted: Array<{ deliveryQueue: unknown }> = [];
jest.mock('../emitAttachmentUpdated', () => ({
  emitAttachmentUpdated: jest.fn<any>(async (params: { deliveryQueue: unknown }) => {
    remitted.push({ deliveryQueue: params.deliveryQueue });
  }),
}));

import { mediaReadyPorts } from '../../services/attachments/media-processing/ready-listener';
import { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';
import { getSharedOfflineEnqueuer, setSharedDeliveryQueue } from '../../services/delivery-queue-registry';

/** La forme EXACTE que `MeeshySocketIOHandler.startMediaPipelines` compose. */
function productionMediaDeps() {
  return {
    prisma: {} as never,
    io: {} as never,
    get deliveryQueue() {
      return getSharedOfflineEnqueuer() ?? null;
    },
    connectedUsers: () => new Map() as never,
    socialEvents: () => null,
    leaseStore: {} as never,
  };
}

const memoryOnlyCacheStore = { getNativeClient: () => null } as never;

async function fireEnrichment(ports: ReturnType<typeof mediaReadyPorts>): Promise<void> {
  await ports.emitAttachmentUpdated({
    conversationId: '507f1f77bcf86cd799439012',
    messageId: '507f1f77bcf86cd799439011',
    attachment: { id: 'att-1' } as never,
  });
}

describe('#18616 — les ports média redemandent la file à chaque enrichissement', () => {
  beforeEach(() => {
    remitted.length = 0;
    setSharedDeliveryQueue(undefined);
  });

  /**
   * La scène que la production ne produit PAS (l'enregistrement y précède le
   * câblage) — et c'est exactement ce qui la rend nécessaire : sous l'ordre
   * nominal, capturer une fois et relire à chaque usage rendent le même
   * verdict, donc aucun témoin posé là ne peut tomber.
   */
  it('les ports construits AVANT l’enregistrement servent quand même la file du processus', async () => {
    const ports = mediaReadyPorts(productionMediaDeps() as never);

    const processQueue = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(processQueue);
    await fireEnrichment(ports);

    expect(remitted).toHaveLength(1);
    expect(remitted[0].deliveryQueue).toBe(processQueue);
  });

  /** Et une file REMPLACÉE entre deux enrichissements est suivie, pas gardée. */
  it('un remplacement de la file du processus est suivi d’un enrichissement à l’autre', async () => {
    const ports = mediaReadyPorts(productionMediaDeps() as never);

    const first = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(first);
    await fireEnrichment(ports);

    const second = new RedisDeliveryQueue(memoryOnlyCacheStore);
    setSharedDeliveryQueue(second);
    await fireEnrichment(ports);

    expect(remitted.map((r) => r.deliveryQueue)).toEqual([first, second]);
  });
});
