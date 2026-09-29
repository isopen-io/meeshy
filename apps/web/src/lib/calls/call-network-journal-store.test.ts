import { describe, expect, test } from 'bun:test';

import { callJournalKeys, createCallJournalStore, forgetCallJournal, MAX_JOURNALED_CALLS, JOURNAL_MAX_AGE_MS } from './call-network-journal-store';
import type { JournalEvent } from './call-network-journal';

const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
};

const phase = (at: number): JournalEvent => ({ at, kind: 'phase', phase: 'connected' });

describe('le journal réseau persisté, rangé par compte (#8698)', () => {
  test('ce qui s’écrit pendant l’appel se relit après un rechargement (nouveau magasin, même stockage)', () => {
    const storage = memoryStorage();
    createCallJournalStore({ storage, now: () => 1_000 }).append('u-a', 'call-1', [phase(10)]);
    createCallJournalStore({ storage, now: () => 2_000 }).append('u-a', 'call-1', [phase(20)]);
    expect(createCallJournalStore({ storage, now: () => 3_000 }).read('u-a', 'call-1')).toEqual([phase(10), phase(20)]);
  });

  test('un compte ne lit jamais le journal d’un autre', () => {
    const storage = memoryStorage();
    const store = createCallJournalStore({ storage, now: () => 0 });
    store.append('u-a', 'call-1', [phase(10)]);
    expect(store.read('u-b', 'call-1')).toEqual([]);
    expect([...storage.items.keys()].every((key) => key.startsWith(callJournalKeys('u-a').index))).toBe(true);
  });

  test('au-delà de la borne, les appels les moins récents partent', () => {
    const storage = memoryStorage();
    let now = 0;
    const store = createCallJournalStore({ storage, now: () => now });
    for (let index = 0; index <= MAX_JOURNALED_CALLS; index += 1) {
      now = index;
      store.append('u-a', `call-${index}`, [phase(index)]);
    }
    expect(store.read('u-a', 'call-0')).toEqual([]);
    expect(store.read('u-a', `call-${MAX_JOURNALED_CALLS}`)).toEqual([phase(MAX_JOURNALED_CALLS)]);
    expect(storage.items.has(callJournalKeys('u-a').call('call-0'))).toBe(false);
  });

  test('un journal plus vieux que la durée de garde est purgé à l’écriture suivante', () => {
    const storage = memoryStorage();
    let now = 0;
    const store = createCallJournalStore({ storage, now: () => now });
    store.append('u-a', 'old', [phase(0)]);
    now = JOURNAL_MAX_AGE_MS + 1;
    store.append('u-a', 'new', [phase(now)]);
    expect(store.read('u-a', 'old')).toEqual([]);
    expect(storage.items.has(callJournalKeys('u-a').call('old'))).toBe(false);
  });

  test('le journal d’un appel reste borné', () => {
    const storage = memoryStorage();
    const store = createCallJournalStore({ storage, now: () => 0 });
    store.append('u-a', 'call-1', Array.from({ length: 400 }, (_, index) => phase(index)));
    expect(store.read('u-a', 'call-1').length).toBe(150);
  });

  test('une entrée illisible ne casse rien : le journal est tenu pour vide', () => {
    const storage = memoryStorage();
    storage.setItem(callJournalKeys('u-a').call('call-1'), '{oops');
    storage.setItem(callJournalKeys('u-a').index, '[1,');
    const store = createCallJournalStore({ storage, now: () => 0 });
    expect(store.read('u-a', 'call-1')).toEqual([]);
    store.append('u-a', 'call-2', [phase(1)]);
    expect(store.read('u-a', 'call-2')).toEqual([phase(1)]);
  });

  test('la fin du compte sur l’appareil efface tout son journal, et seulement le sien', () => {
    const storage = memoryStorage();
    const store = createCallJournalStore({ storage, now: () => 0 });
    store.append('u-a', 'call-1', [phase(1)]);
    store.append('u-a', 'call-2', [phase(2)]);
    store.append('u-b', 'call-3', [phase(3)]);
    forgetCallJournal(storage, 'u-a');
    expect([...storage.items.keys()].some((key) => key.startsWith(callJournalKeys('u-a').index))).toBe(false);
    expect(store.read('u-b', 'call-3')).toEqual([phase(3)]);
  });
});
