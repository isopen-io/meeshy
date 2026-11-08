/**
 * #16706 — `RedisDeliveryQueue.purgeMessage` : le clair d'un message détruit
 * quitte la file, et rien d'autre ne la quitte.
 *
 * Le fichier historique de la file (`RedisDeliveryQueue.test.ts`) est HORS
 * BUDGET (1 400+ lignes pour un plafond dur de 1 200), et la règle du dépôt est
 * « ajouter à un fichier déjà hors budget est interdit : on extrait d'abord, on
 * ajoute ensuite ». Cette suite est donc chez elle. Le lot a par ailleurs RETIRÉ
 * 246 lignes de ce fichier avec la méthode `peek`.
 *
 * ## Ce que ces témoins peuvent et ne peuvent pas voir
 *
 * La CI n'a pas de service Redis, donc le double est un émulateur de listes et
 * d'ensembles : il atteste la DÉCISION (quelles clés sont lues, quelles valeurs
 * brutes sont retirées, quelle clé d'index est effacée) et la sélection, qui
 * vivent en TypeScript. La SÉMANTIQUE du script Lua d'enfilage — l'écriture de
 * l'index dans le même eval, sur ses trois issues — a été prouvée contre un
 * VRAI redis-server, et le détail de cette mesure est dans
 * `tasks/realtime-sync-audit-2026-11-08-cycle143.md`.
 */

import { describe, it, expect } from '@jest/globals';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import { RedisCacheStore } from '../../../services/CacheStore';
import type { CacheStore } from '../../../services/CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

const DOOMED = 'msg-doomed';
const SURVIVOR = 'msg-survivor';
const SECRET = 'le code du coffre est 4471';

const entry = (overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload => ({
  messageId: DOOMED,
  conversationId: 'conv-1',
  payload: { content: SECRET },
  enqueuedAt: new Date().toISOString(),
  eventType: 'new',
  ...overrides,
});

/**
 * Émulateur de listes + ensembles qui RESPECTE `numkeys`, et qui n'implémente
 * du script d'enfilage que ce dont la purge dépend : pousser l'entrée, et
 * indexer le porteur quand le drapeau de texte est levé.
 */
const fakeRedis = () => {
  const lists = new Map<string, string[]>();
  const sets = new Map<string, Set<string>>();
  const calls: string[] = [];
  const hooks: { onLrange?: () => void } = {};
  const client = {
    eval: async (script: string, numkeys: number, ...rest: string[]) => {
      const keys = rest.slice(0, numkeys);
      const args = rest.slice(numkeys);
      if (script.includes('LREM') && !script.includes('RPUSH')) {
        calls.push(`prune:${keys[0]}:${args.length}`);
        const kept = (lists.get(keys[0]) ?? []).filter((raw) => !args.includes(raw));
        const removed = (lists.get(keys[0]) ?? []).length - kept.length;
        lists.set(keys[0], kept);
        return removed;
      }
      lists.set(keys[0], [...(lists.get(keys[0]) ?? []), args[0]]);
      if (keys[1] !== undefined && args[5] === '1') {
        sets.set(keys[1], new Set([...(sets.get(keys[1]) ?? []), args[6]]));
      }
      return 1;
    },
    smembers: async (key: string) => {
      calls.push(`smembers:${key}`);
      return [...(sets.get(key) ?? [])];
    },
    lrange: async (key: string) => {
      const out = lists.get(key) ?? [];
      hooks.onLrange?.();
      return out;
    },
    llen: async (key: string) => (lists.get(key) ?? []).length,
    srem: async (key: string, ...members: string[]) => {
      calls.push(`srem:${key}:${members.length}`);
      const set = sets.get(key);
      members.forEach((m) => set?.delete(m));
      return members.length;
    },
    del: async (key: string) => {
      calls.push(`del:${key}`);
      return sets.delete(key) ? 1 : 0;
    },
  };
  return {
    calls,
    hooks,
    lists,
    sets,
    bytes: () => [...lists.values()].flat().join('\n'),
    cacheStore: { getNativeClient: () => client } as unknown as CacheStore,
  };
};

/** Sans `REDIS_URL`, le vrai `RedisCacheStore` ne rend aucun client : tranche MÉMOIRE. */
const memoryQueue = () => {
  const cacheStore = new RedisCacheStore();
  return { cacheStore, queue: new RedisDeliveryQueue(cacheStore) };
};

describe('purgeMessage — tranche Redis', () => {
  it('retire la copie porteuse de texte et GARDE l’annonce de mort du même message', async () => {
    // La condition double est le cœur du cadrage. `messageId` seul emporterait
    // aussi l'entrée `expired` qu'on vient d'enfiler pour ce message — le SEUL
    // événement qui dit au client de retirer la bulle — et l'absent garderait un
    // message détruit affiché pour toujours.
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    await queue.enqueue('u-1', entry());
    await queue.enqueue('u-1', entry({ eventType: 'expired', payload: { messageId: DOOMED } }));

    const removed = await queue.purgeMessage(DOOMED);

    expect(removed).toBe(1);
    expect(redis.bytes()).not.toContain(SECRET);
    expect((redis.lists.get('delivery:queue:u-1') ?? []).map((raw) => JSON.parse(raw).eventType)).toEqual(['expired']);
  });

  it('retire toutes les traductions enfilées du message, pas seulement la première', async () => {
    // Une entrée `translation` porte un `dedupKey` PAR LANGUE : un message
    // traduit en trois langues a trois entrées porteuses de texte dans la MÊME
    // file. Une purge qui s'arrêterait à la première laisserait deux clairs.
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    for (const lang of ['en', 'es', 'de']) {
      await queue.enqueue('u-1', entry({ eventType: 'translation', dedupKey: `${DOOMED}:${lang}`, payload: { content: `${SECRET} (${lang})` } }));
    }

    expect(await queue.purgeMessage(DOOMED)).toBe(3);
    expect(redis.lists.get('delivery:queue:u-1')).toEqual([]);
  });

  it('purge CHAQUE file que l’index désigne, et n’en invente aucune', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    await queue.enqueue('u-1', entry());
    await queue.enqueue('u-2', entry());
    await queue.enqueue('u-3', entry({ messageId: SURVIVOR }));

    expect(await queue.purgeMessage(DOOMED)).toBe(2);
    expect(redis.lists.get('delivery:queue:u-1')).toEqual([]);
    expect(redis.lists.get('delivery:queue:u-2')).toEqual([]);
    expect(redis.lists.get('delivery:queue:u-3')).toHaveLength(1);
    expect(redis.calls).not.toContain('prune:delivery:queue:u-3:1');
  });

  it('retire les porteurs TRAITÉS de l’index, et n’efface pas la clé en bloc', async () => {
    // L'enfilage et la purge ne sont pas ordonnés. Un `DEL` inconditionnel
    // effacerait le membre d'une entrée atterrie ENTRE le `smembers` et lui :
    // plus aucune purge ne pourrait la retrouver, et le clair y resterait ses
    // 48 h. C'est la course INVERSE de celle que `PRUNE_STALE_LUA` ferme — fermer
    // une course ne dit rien de sa symétrique.
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);
    await queue.enqueue('u-1', entry());

    // Un porteur arrive dans l'index pendant la purge, après la lecture.
    redis.hooks.onLrange = () => {
      redis.sets.get(`delivery:msg-queues:${DOOMED}`)?.add('u-late');
      redis.lists.set('delivery:queue:u-late', [JSON.stringify(entry())]);
    };

    await queue.purgeMessage(DOOMED);

    expect(redis.calls).not.toContain(`del:delivery:msg-queues:${DOOMED}`);
    expect([...(redis.sets.get(`delivery:msg-queues:${DOOMED}`) ?? [])]).toEqual(['u-late']);
  });

  it('efface de l’index le porteur traité', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);
    await queue.enqueue('u-1', entry());

    await queue.purgeMessage(DOOMED);

    expect(redis.calls).toContain(`srem:delivery:msg-queues:${DOOMED}:1`);
    expect([...(redis.sets.get(`delivery:msg-queues:${DOOMED}`) ?? [])]).toEqual([]);
  });

  it('n’indexe PAS une famille sans texte — donc ne la cherche jamais à la purge', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    await queue.enqueue('u-1', entry({ eventType: 'reaction-added', dedupKey: `${DOOMED}:p-a:👍`, payload: { emoji: '👍' } }));

    expect(redis.sets.get(`delivery:msg-queues:${DOOMED}`)).toBeUndefined();
    expect(await queue.purgeMessage(DOOMED)).toBe(0);
    expect(redis.lists.get('delivery:queue:u-1')).toHaveLength(1);
  });

  it('LAISSE une ligne illisible plutôt que de la détruire sur une homonymie supposée', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);
    await queue.enqueue('u-1', entry());
    redis.lists.set('delivery:queue:u-1', [...(redis.lists.get('delivery:queue:u-1') ?? []), '{ pas du json']);

    await queue.purgeMessage(DOOMED);

    expect(redis.lists.get('delivery:queue:u-1')).toEqual(['{ pas du json']);
  });

  it('ne lève pas quand Redis refuse, et purge quand même la tranche mémoire', async () => {
    const dying = {
      getNativeClient: () => ({
        eval: async () => {
          throw new Error('conn reset');
        },
        smembers: async () => {
          throw new Error('conn reset');
        },
        lrange: async () => {
          throw new Error('conn reset');
        },
        llen: async () => {
          throw new Error('conn reset');
        },
        del: async () => {
          throw new Error('conn reset');
        },
      }),
    } as unknown as CacheStore;
    const queue = new RedisDeliveryQueue(dying);

    // L'`enqueue` retombe en mémoire parce que l'eval lève : l'entrée est donc
    // dans la tranche que l'index ne désigne pas, et c'est exactement la raison
    // pour laquelle la purge mémoire passe AVANT le `return` sur `!redis`.
    await queue.enqueue('u-1', entry());

    await expect(queue.purgeMessage(DOOMED)).resolves.toBe(1);
    expect(await queue.drain('u-1')).toEqual([]);
  });
});

describe('purgeMessage — tranche mémoire', () => {
  it('retire le texte du message détruit et garde celui des autres', async () => {
    const { cacheStore, queue } = memoryQueue();
    try {
      await queue.enqueue('u-1', entry());
      await queue.enqueue('u-1', entry({ messageId: SURVIVOR, payload: { content: 'intact' } }));

      expect(await queue.purgeMessage(DOOMED)).toBe(1);
      const left = await queue.drain('u-1');
      expect(left.map((e) => e.messageId)).toEqual([SURVIVOR]);
    } finally {
      await cacheStore.close();
    }
  });

  it('retire le seau de l’utilisateur quand il se vide', async () => {
    const { cacheStore, queue } = memoryQueue();
    try {
      await queue.enqueue('u-1', entry());

      expect(await queue.purgeMessage(DOOMED)).toBe(1);
      expect(await queue.size('u-1')).toBe(0);
    } finally {
      await cacheStore.close();
    }
  });

  it('rend 0 sans rien toucher quand le message n’est enfilé nulle part', async () => {
    const { cacheStore, queue } = memoryQueue();
    try {
      await queue.enqueue('u-1', entry({ messageId: SURVIVOR }));

      expect(await queue.purgeMessage(DOOMED)).toBe(0);
      expect(await queue.size('u-1')).toBe(1);
    } finally {
      await cacheStore.close();
    }
  });
});
