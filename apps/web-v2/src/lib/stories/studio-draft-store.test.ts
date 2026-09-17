import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from './studio-draft-store';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('createStudioDraftStore — le brouillon SURVIT à un échec de publication (§0)', () => {
  test('rien de posé ⇒ get() rend null', () => {
    expect(createStudioDraftStore(fakeStorage()).get()).toBeNull();
  });

  test('set puis get rend EXACTEMENT ce qui a été posé', () => {
    const store = createStudioDraftStore(fakeStorage());
    const snapshot = {
      text: 'Bonjour',
      background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' as const },
      sound: { postMediaId: 'pm-2', fileUrl: '2026/09/x.m4a' },
    };
    store.set(snapshot);
    expect(store.get()).toEqual(snapshot);
  });

  test('clear retire le brouillon (succès de publication)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set({ text: 'x' });
    store.clear();
    expect(store.get()).toBeNull();
  });

  test('une valeur CORROMPUE en backend ⇒ null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem('meeshy.draft.story-studio', '{ pas du json');
    expect(createStudioDraftStore(backend).get()).toBeNull();
  });

  test('un backend qui LANCE (quota, navigation privée) ne fait perdre aucune valeur pour la session (cache mémoire)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('QuotaExceededError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createStudioDraftStore(throwing);
    expect(() => store.set({ text: 'x' })).not.toThrow();
    expect(store.get()).toEqual({ text: 'x' });
  });
});
