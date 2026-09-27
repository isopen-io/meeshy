import { describe, expect, test } from 'bun:test';

import { consumeAfterRead, createAfterReadQueue, type AfterReadStorage } from './after-read';

/**
 * LA CONSOMMATION D'UNE FLAMME-ŒIL (#8304, route #8302) — `POST
 * …/messages/after-read/consume` `{ messageIds }`, et la FILE qui la porte
 * tant que le réseau ne l'a pas acceptée : un lecteur qui quitte la
 * conversation hors ligne a VU le message ; la consommation doit partir au
 * retour du réseau, même après un rechargement.
 */
function memoryStorage(): AfterReadStorage & { readonly dump: () => Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

describe('consumeAfterRead — la requête EXACTE du contrat #8302', () => {
  test('POST …/conversations/:id/messages/after-read/consume, corps { messageIds }', async () => {
    const calls: Call[] = [];
    await consumeAfterRead(async (request) => {
      calls.push(request);
      return { ok: true, status: 200, data: { consumed: ['m-1'] } };
    }, { conversationId: 'c a', messageIds: ['m-1', 'm-2'] });
    expect(calls).toEqual([
      { method: 'POST', path: '/api/v1/conversations/c%20a/messages/after-read/consume', body: { messageIds: ['m-1', 'm-2'] } },
    ]);
  });
});

describe('createAfterReadQueue — la file qui survit au hors-ligne', () => {
  test('un envoi RÉUSSI vide la file', async () => {
    const storage = memoryStorage();
    const sent: string[][] = [];
    const queue = createAfterReadQueue({
      storage,
      key: 'k',
      send: async (_c, ids) => {
        sent.push([...ids]);
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', ['m-1', 'm-2']);
    await queue.flush();
    expect(sent).toEqual([['m-1', 'm-2']]);
    expect([...queue.pendingFor('c-a')]).toEqual([]);
  });

  test('une panne (réseau, 5xx) GARDE la file, persistée, et la relance suivante la vide', async () => {
    const storage = memoryStorage();
    let online = false;
    const make = () =>
      createAfterReadQueue({
        storage,
        key: 'k',
        send: async () => {
          if (!online) throw new Error('offline');
          return { ok: true, status: 200 };
        },
      });
    const first = make();
    first.enqueue('c-a', ['m-1']);
    await first.flush();
    expect([...first.pendingFor('c-a')]).toEqual(['m-1']);

    const afterReload = make();
    expect([...afterReload.pendingFor('c-a')]).toEqual(['m-1']);
    online = true;
    await afterReload.flush();
    expect([...afterReload.pendingFor('c-a')]).toEqual([]);
  });

  test('un refus PERMANENT (4xx) retire l’entrée : la relancer ne servirait à rien', async () => {
    const queue = createAfterReadQueue({ storage: memoryStorage(), key: 'k', send: async () => ({ ok: false, status: 403 }) });
    queue.enqueue('c-a', ['m-1']);
    await queue.flush();
    expect([...queue.pendingFor('c-a')]).toEqual([]);
  });

  test('un 429 ou un 503 reste en file', async () => {
    const queue = createAfterReadQueue({ storage: memoryStorage(), key: 'k', send: async () => ({ ok: false, status: 429 }) });
    queue.enqueue('c-a', ['m-1']);
    await queue.flush();
    expect([...queue.pendingFor('c-a')]).toEqual(['m-1']);
  });

  test('enfiler deux fois le même message ne l’envoie qu’une fois', async () => {
    const sent: string[][] = [];
    const queue = createAfterReadQueue({
      storage: memoryStorage(),
      key: 'k',
      send: async (_c, ids) => {
        sent.push([...ids]);
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', ['m-1']);
    queue.enqueue('c-a', ['m-1', 'm-2']);
    await queue.flush();
    expect(sent).toEqual([['m-1', 'm-2']]);
  });

  test('un stockage qui LÈVE (navigation privée) ne casse rien : la file vit en mémoire', async () => {
    const throwing: AfterReadStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const sent: string[][] = [];
    const queue = createAfterReadQueue({
      storage: throwing,
      key: 'k',
      send: async (_c, ids) => {
        sent.push([...ids]);
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', ['m-1']);
    await queue.flush();
    expect(sent).toEqual([['m-1']]);
  });

  test('deux vidages CONCURRENTS n’envoient pas deux fois la même entrée', async () => {
    let calls = 0;
    const queue = createAfterReadQueue({
      storage: memoryStorage(),
      key: 'k',
      send: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', ['m-1']);
    await Promise.all([queue.flush(), queue.flush()]);
    expect(calls).toBe(1);
  });
});
