/**
 * Le pipeline média prend la file du PROCESSUS (#18616).
 *
 * Le cliquet d'instances (`delivery-queue-single-instance.test.ts`) prouve
 * qu'aucune SECONDE `RedisDeliveryQueue` n'est construite. Il ne prouve pas que
 * le pipeline en reçoive une : `deliveryQueue: null` le satisferait
 * intégralement, en coupant en silence tout rejeu hors ligne de
 * `message:attachment-updated` — le correctif trop large, dans sa forme la
 * plus discrète.
 *
 * C'est pourquoi la composition a été extraite : tant qu'elle vivait dans une
 * méthode privée, le seul témoin possible était un `grep`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';

import { mediaPipelineDeps } from '../mediaPipelineDeps';
import { setSharedDeliveryQueue } from '../../services/delivery-queue-registry';

const manager = {
  getIO: () => ({}) as never,
  getReachability: () => ({ has: () => false, get: () => undefined }) as never,
  getSocialEventsHandler: () => null,
};

afterEach(() => setSharedDeliveryQueue(undefined));

describe('mediaPipelineDeps (#18616)', () => {
  it('remet la file ENREGISTRÉE du processus, pas une instance à lui', () => {
    const enqueue = jest.fn(async () => {});
    const file = { purgeMessage: async () => 0, enqueue };
    setSharedDeliveryQueue(file as never);

    const deps = mediaPipelineDeps({} as never, manager);

    // L'IDENTITÉ, pas la forme : deux objets qui savent tous deux enfiler ne
    // partagent pas leur tranche MÉMOIRE, et c'est elle qui n'était ni drainée
    // ni purgée.
    expect(deps.deliveryQueue).toBe(file);
  });

  /**
   * `null` veut dire « pas de rejeu hors ligne dans ce processus » — un test,
   * un script, un outil. `enqueueForOfflineParticipants` le lit et sort.
   */
  it('rend `null` quand le processus n’a aucune file', () => {
    const deps = mediaPipelineDeps({} as never, manager);

    expect(deps.deliveryQueue).toBeNull();
  });

  /**
   * Un objet enregistré qui ne sait que PURGER est un enregistrement valide —
   * c'est la forme de tous les doubles du dépôt. Lui demander d'enfiler
   * lèverait `is not a function` sur un chemin best-effort.
   */
  it('rend `null` quand l’objet enregistré ne sait que purger', () => {
    setSharedDeliveryQueue({ purgeMessage: async () => 0 } as never);

    expect(mediaPipelineDeps({} as never, manager).deliveryQueue).toBeNull();
  });
});
