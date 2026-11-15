import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb } from '@/lib/share-incoming/idb-double';

import {
  TUS_CHECKPOINT_DB_NAME,
  TUS_CHECKPOINT_MAX_AGE_MS,
  TUS_CHECKPOINT_STORE_NAME,
  claimTusLease,
  idbTusCheckpointStore,
  tusFingerprint,
  type TusCheckpoint,
} from './tus-checkpoint';

const file = (name: string, lastModified = 1_700_000_000_000): File => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png', lastModified });
const identity = { base: 'https://gate.meeshy.me', uploadContext: 'story' as const };

const checkpointOf = (overrides: Partial<TusCheckpoint> = {}): TusCheckpoint => ({
  location: '/api/v1/uploads/up-1',
  offset: 2_097_152,
  fileSize: 5_000_000,
  fingerprint: 'fp-1',
  savedAt: 1_000,
  ...overrides,
});

describe('tusFingerprint — ce qui fait que deux envois sont LE MÊME fichier', () => {
  test('le même fichier, repassé par IndexedDB ou re-choisi, redonne la même empreinte', () => {
    expect(tusFingerprint({ ...identity, file: file('scene.png') })).toBe(tusFingerprint({ ...identity, file: file('scene.png') }));
  });

  test('un nom, une date, un contexte, une base ou un thumbhash différents donnent une autre empreinte', () => {
    const reference = tusFingerprint({ ...identity, file: file('scene.png') });
    const others = [
      tusFingerprint({ ...identity, file: file('autre.png') }),
      tusFingerprint({ ...identity, file: file('scene.png', 1_700_000_000_001) }),
      tusFingerprint({ ...identity, uploadContext: 'post', file: file('scene.png') }),
      tusFingerprint({ ...identity, base: 'https://gate.staging.meeshy.me', file: file('scene.png') }),
      tusFingerprint({ ...identity, thumbHash: 'abc', file: file('scene.png') }),
    ];
    expect(new Set([reference, ...others]).size).toBe(6);
  });

  test('un nom arabe ou accentué ne casse pas l’empreinte', () => {
    expect(tusFingerprint({ ...identity, file: file('صورة-été.png') })).not.toBe('');
  });
});

describe('idbTusCheckpointStore — le checkpoint survit à la page', () => {
  test('ce qu’une page écrit, la suivante (même base IndexedDB) le relit', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(checkpointOf());

    expect(await idbTusCheckpointStore(idb.factory).find('fp-1')).toEqual(checkpointOf());
    expect([...idb.rowsOf(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME).keys()]).toEqual(['fp-1']);
  });

  test('remove efface la ligne ; find d’une empreinte inconnue rend null', async () => {
    const idb = fakeIndexedDb();
    const store = idbTusCheckpointStore(idb.factory);
    await store.save(checkpointOf());
    await store.remove('fp-1');

    expect(await store.find('fp-1')).toBeNull();
    expect(await store.find('jamais-vu')).toBeNull();
  });

  test('une ligne malformée est ignorée, jamais rendue', async () => {
    const idb = fakeIndexedDb();
    const store = idbTusCheckpointStore(idb.factory);
    await store.save(checkpointOf());
    (idb.rowsOf(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME) as Map<string, unknown>).set('fp-1', { location: 12 });

    expect(await store.find('fp-1')).toBeNull();
  });

  test('IndexedDB en échec ou absente : aucune exception, aucun checkpoint', async () => {
    const idb = fakeIndexedDb();
    idb.failOpen();
    const failing = idbTusCheckpointStore(idb.factory);
    await failing.save(checkpointOf());
    await failing.remove('fp-1');
    expect(await failing.find('fp-1')).toBeNull();

    const absent = idbTusCheckpointStore(undefined);
    await absent.save(checkpointOf());
    expect(await absent.find('fp-1')).toBeNull();
  });

  test('la durée de vie est inférieure à celle des sessions de la passerelle (24 h)', () => {
    expect(TUS_CHECKPOINT_MAX_AGE_MS).toBeLessThan(24 * 60 * 60 * 1000);
  });
});

describe('claimTusLease — une session TUS n’a qu’un envoi à la fois', () => {
  test('le premier la tient, le second est refusé jusqu’à la libération', () => {
    const first = claimTusLease('lease-fp');
    const second = claimTusLease('lease-fp');
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    first?.();
    const third = claimTusLease('lease-fp');
    expect(third).not.toBeNull();
    third?.();
  });
});
