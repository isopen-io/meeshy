import { describe, expect, test } from 'bun:test';

import { createOfflineQueue } from './offline-queue';
import type { SafeStorage } from './storage';

describe('createOfflineQueue — FIFO générique (#7367, W3)', () => {
  test('enqueue puis flush : le job part, réussi ⇒ retiré de la file', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];

    queue.enqueue('c1', 'payload-1');
    expect(queue.size()).toBe(1);

    await queue.flush(async (payload) => {
      ran.push(payload);
      return true;
    });

    expect(ran).toEqual(['payload-1']);
    expect(queue.size()).toBe(0);
  });

  test('deux clés distinctes se rejouent dans l’ordre d’ENQUEUE (FIFO)', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];

    queue.enqueue('a', 'premier');
    queue.enqueue('b', 'second');

    await queue.flush(async (payload) => {
      ran.push(payload);
      return true;
    });

    expect(ran).toEqual(['premier', 'second']);
  });

  test('un `run` qui échoue arrête le flush : le job réussi avant reste retiré, celui qui échoue et les suivants restent en file', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];

    queue.enqueue('a', 'ok');
    queue.enqueue('b', 'echoue');
    queue.enqueue('c', 'jamais-tente');

    await queue.flush(async (payload) => {
      ran.push(payload);
      return payload !== 'echoue';
    });

    expect(ran).toEqual(['ok', 'echoue']);
    expect(queue.size()).toBe(2);
  });

  test('une seconde panne sur la MÊME clé REMPLACE le job en attente, sans changer sa position FIFO', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];

    queue.enqueue('conv', 'ancienne-frontiere');
    queue.enqueue('autre', 'entre-deux');
    queue.enqueue('conv', 'nouvelle-frontiere');

    expect(queue.size()).toBe(2);

    await queue.flush(async (payload) => {
      ran.push(payload);
      return true;
    });

    // `conv` a été enqueue en PREMIER : sa position FIFO ne bouge pas quand
    // son payload est remplacé — seul le contenu du job change.
    expect(ran).toEqual(['nouvelle-frontiere', 'entre-deux']);
  });

  test('flush sans job en attente ⇒ `run` jamais appelé', async () => {
    const queue = createOfflineQueue<string>();
    let called = false;

    await queue.flush(async () => {
      called = true;
      return true;
    });

    expect(called).toBe(false);
  });
});

describe('createOfflineQueue.remove — le job périmé se retire (revue #7367)', () => {
  test('remove sur une clé en attente la retire ; les autres gardent leur ordre', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];

    queue.enqueue('a', 'premier');
    queue.enqueue('b', 'second');
    queue.remove('a');

    expect(queue.size()).toBe(1);

    await queue.flush(async (payload) => {
      ran.push(payload);
      return true;
    });

    expect(ran).toEqual(['second']);
  });

  test('remove sur une clé absente ne fait rien', () => {
    const queue = createOfflineQueue<string>();
    queue.enqueue('a', 'premier');

    queue.remove('inconnue');

    expect(queue.size()).toBe(1);
  });
});

const memoryStorage = (): SafeStorage => {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
};

const asWord = (raw: unknown): string | null => (typeof raw === 'string' && raw.startsWith('mot-') ? raw : null);

describe('createOfflineQueue — persistée (#10174)', () => {
  test('un job mis en file survit au rechargement de la page et part au flush suivant ; réussi, il ne revient plus', async () => {
    const storage = memoryStorage();
    const persistence = { storage, key: 'file', parse: asWord };
    createOfflineQueue<string>(persistence).enqueue('a', 'mot-1');

    const reloaded = createOfflineQueue<string>(persistence);
    expect(reloaded.pending()).toEqual(['mot-1']);
    const ran: string[] = [];
    await reloaded.flush(async (payload) => {
      ran.push(payload);
      return true;
    });

    expect(ran).toEqual(['mot-1']);
    expect(createOfflineQueue<string>(persistence).size()).toBe(0);
  });

  test('une entrée stockée illisible est écartée, les autres se rejouent', () => {
    const storage = memoryStorage();
    storage.setItem('file', JSON.stringify([['a', 42], ['b', 'mot-2'], 'bruit']));

    expect(createOfflineQueue<string>({ storage, key: 'file', parse: asWord }).pending()).toEqual(['mot-2']);
    storage.setItem('file', '{pas du json');
    expect(createOfflineQueue<string>({ storage, key: 'file', parse: asWord }).size()).toBe(0);
  });

  test('un job REMPLACÉ pendant son envoi n’est pas perdu : la valeur la plus récente part à son tour', async () => {
    const queue = createOfflineQueue<string>();
    const ran: string[] = [];
    queue.enqueue('reglage', 'ancien');

    await queue.flush(async (payload) => {
      ran.push(payload);
      if (payload === 'ancien') queue.enqueue('reglage', 'nouveau');
      return true;
    });

    expect(ran).toEqual(['ancien', 'nouveau']);
    expect(queue.size()).toBe(0);
  });
});
