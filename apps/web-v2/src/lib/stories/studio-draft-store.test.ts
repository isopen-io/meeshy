import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from './studio-draft-store';

const VIEWER = 'a'.repeat(24);
const OTHER_VIEWER = 'b'.repeat(24);

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('createStudioDraftStore — le brouillon SURVIT à un échec de publication (§0)', () => {
  test('rien de posé ⇒ get() rend null', () => {
    expect(createStudioDraftStore(fakeStorage()).get(VIEWER)).toBeNull();
  });

  test('set puis get sur un NOUVEAU store branché au même backend rend EXACTEMENT ce qui a été posé', () => {
    const backend = fakeStorage();
    const snapshot = {
      text: 'Bonjour',
      background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' as const },
      sound: { postMediaId: 'pm-2', fileUrl: '2026/09/x.m4a' },
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('aspectRatio et thumbHash (§0, défaut 7) SURVIVENT au round-trip, sans les deux ⇒ toujours accepté', () => {
    const backend = fakeStorage();
    const snapshot = {
      text: 'Bonjour',
      background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' as const, aspectRatio: 0.5625, thumbHash: 'abc123' },
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('UN brouillon par LECTEUR — un autre compte sur le même appareil ne relit NI le texte NI les médias montés du premier', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, { text: 'Brouillon privé', background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' } });
    expect(store.get(OTHER_VIEWER)).toBeNull();
    expect(createStudioDraftStore(backend).get(OTHER_VIEWER)).toBeNull();
    expect([...backend.map.keys()]).toEqual([`meeshy.draft.story.${VIEWER}`]);
  });

  test('clear retire le brouillon (succès de publication)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, { text: 'x' });
    store.clear(VIEWER);
    expect(store.get(VIEWER)).toBeNull();
  });

  test('un brouillon VIDE est PURGÉ, jamais écrit', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, { text: 'x' });
    store.set(VIEWER, { text: '   ' });
    expect(store.get(VIEWER)).toBeNull();
    expect(backend.map.size).toBe(0);
  });

  test('une valeur CORROMPUE en backend ⇒ null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, '{ pas du json');
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
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
    expect(() => store.set(VIEWER, { text: 'x' })).not.toThrow();
    expect(store.get(VIEWER)).toEqual({ text: 'x' });
  });
});
