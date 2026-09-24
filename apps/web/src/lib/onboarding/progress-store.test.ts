import { describe, expect, test } from 'bun:test';

import { EMPTY_PROGRESS, withDone, withFriendRequest } from './journey';
import { createJourneyProgressStore } from './progress-store';

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    values,
  };
}

describe('createJourneyProgressStore — ce qui s’est confirmé survit à la reprise', () => {
  test('rien d’écrit : la progression vide', () => {
    expect(createJourneyProgressStore({ storage: fakeStorage() }).read('me')).toEqual(EMPTY_PROGRESS);
  });

  test('écrit puis relit, par compte', () => {
    const storage = fakeStorage();
    const store = createJourneyProgressStore({ storage });
    const progress = withFriendRequest(withDone(EMPTY_PROGRESS, 'global'), 'u1');
    store.write('me', progress);
    expect(createJourneyProgressStore({ storage }).read('me')).toEqual(progress);
    expect(createJourneyProgressStore({ storage }).read('other')).toEqual(EMPTY_PROGRESS);
  });

  test('une valeur altérée ne fabrique aucun point', () => {
    const storage = fakeStorage({ 'meeshy.onboarding.me': '{"done":["global","bonus"],"friendRequests":[42]}' });
    expect(createJourneyProgressStore({ storage }).read('me')).toEqual(EMPTY_PROGRESS);
  });

  test('un stockage qui lève ne casse rien', () => {
    const throwing = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
      removeItem: () => undefined,
    };
    const store = createJourneyProgressStore({ storage: throwing });
    expect(() => store.write('me', withDone(EMPTY_PROGRESS, 'story'))).not.toThrow();
    expect(store.read('me')).toEqual(EMPTY_PROGRESS);
  });
});
