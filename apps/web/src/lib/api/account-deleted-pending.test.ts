import { describe, expect, test } from 'bun:test';

import { PENDING_RETIREMENTS_KEY, pendingRetirements, retireDeletedAccountLater } from './account-deleted';
import { replayPendingRetirements } from './account-deleted-retire';

/**
 * **UN RETRAIT QUI N'A PAS PU SE CHARGER SE REJOUE** (audit #10237) — le geste
 * de retrait est un module chargé au signal. Si son chargement échoue (réseau
 * coupé, version déployée entre-temps), le signal « compte supprimé » ne
 * repasserait pas : l'appareil garderait le compte et ses photos. Le compte à
 * retirer est donc NOTÉ avant le chargement, effacé après succès, et rejoué au
 * prochain chargement de l'application.
 */

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('le compte à retirer est noté avant le geste, effacé après', () => {
  test('un chargement qui échoue laisse la note', async () => {
    const storage = memoryStorage();
    await retireDeletedAccountLater('u-ada', { storage, load: () => Promise.reject(new Error('chunk')) });
    expect(pendingRetirements(storage)).toEqual(['u-ada']);
  });

  test('un geste abouti efface la note de CE compte seulement', async () => {
    const storage = memoryStorage({ [PENDING_RETIREMENTS_KEY]: 'u-bob' });
    const retired: string[] = [];
    await retireDeletedAccountLater('u-ada', { storage, load: async () => ({ retireDeletedAccount: async (id) => void retired.push(id) }) });
    expect(retired).toEqual(['u-ada']);
    expect(pendingRetirements(storage)).toEqual(['u-bob']);
  });

  test('le prochain chargement rejoue les retraits notés, et les efface', async () => {
    const storage = memoryStorage();
    await retireDeletedAccountLater('u-ada', { storage, load: () => Promise.reject(new Error('chunk')) });
    const retired: string[] = [];
    await replayPendingRetirements({ storage, load: async () => ({ retireDeletedAccount: async (id) => void retired.push(id) }) });
    expect(retired).toEqual(['u-ada']);
    expect(storage.items.has(PENDING_RETIREMENTS_KEY)).toBe(false);
  });

  test('une note illisible ne rejoue rien et ne lève pas ; sans stockage non plus', async () => {
    const storage = memoryStorage({ [PENDING_RETIREMENTS_KEY]: '{"oops": 1}' });
    expect(pendingRetirements(storage)).toEqual([]);
    const retired: string[] = [];
    await replayPendingRetirements({ storage, load: async () => ({ retireDeletedAccount: async (id) => void retired.push(id) }) });
    await retireDeletedAccountLater('u-ada', { storage: null, load: async () => ({ retireDeletedAccount: async (id) => void retired.push(id) }) });
    expect(retired).toEqual(['u-ada']);
  });
});
