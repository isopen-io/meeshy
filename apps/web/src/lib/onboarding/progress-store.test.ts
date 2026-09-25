import { describe, expect, test } from 'bun:test';

import { EMPTY_PROGRESS, withDone, withFriendRequest, withScore } from './journey';
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

  test('le repère de score survit à la reprise — la story crédite au retour du studio (#7908)', () => {
    const storage = fakeStorage();
    const progress = withScore(withScore(EMPTY_PROGRESS, 30), 44);
    createJourneyProgressStore({ storage }).write('me', progress);
    expect(createJourneyProgressStore({ storage }).read('me').score).toEqual({ baseline: 30, last: 44 });
  });

  test('un repère de score altéré se lit absent, sans perdre le reste', () => {
    const storage = fakeStorage({ 'meeshy.onboarding.me': '{"done":["global"],"friendRequests":[],"score":{"baseline":"x","last":3}}' });
    expect(createJourneyProgressStore({ storage }).read('me')).toEqual({ done: ['global'], friendRequests: [] });
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
