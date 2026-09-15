import { describe, expect, test } from 'bun:test';

import { createDraftStore, type ComposerDraft, type StorageLike } from './draft-store';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const draftOf = (overrides: Partial<ComposerDraft> = {}): ComposerDraft => ({
  text: 'Hallo',
  language: 'de',
  protection: {},
  ...overrides,
});

describe('draftStore — une clé par (lecteur, conversation)', () => {
  test('un brouillon écrit pour (u_a, c1) ne fuit ni vers un autre lecteur ni vers une autre conversation', () => {
    const backend = fakeStorage();
    const store = createDraftStore(backend);
    const d = draftOf({ replyToId: 'm1' });

    store.setDraft('u_a', 'c1', d);

    expect(store.getDraft('u_b', 'c1')).toBeNull();
    expect(store.getDraft('u_a', 'c2')).toBeNull();
    expect(store.getDraft('u_a', 'c1')).toEqual(d);
  });

  test('la clé mesurée porte le lecteur et la conversation', () => {
    const backend = fakeStorage();
    createDraftStore(backend).setDraft('u_a', 'c1', draftOf());
    expect(Object.keys(backend.data)).toEqual(['meeshy.draft.u_a.c1']);
  });
});

describe('un brouillon VIDE est retiré, jamais écrit', () => {
  test('texte vide, sans réponse, sans protection ⇒ rien en storage', () => {
    const backend = fakeStorage();
    const store = createDraftStore(backend);
    store.setDraft('u_a', 'c1', { text: '  ', language: 'fr', protection: {} });
    expect(backend.getItem('meeshy.draft.u_a.c1')).toBeNull();
    expect(store.getDraft('u_a', 'c1')).toBeNull();
  });

  test('un brouillon SANS texte mais flou ARMÉ est conservé', () => {
    const backend = fakeStorage();
    const store = createDraftStore(backend);
    const d: ComposerDraft = { text: '', language: 'fr', protection: { blurred: true } };
    store.setDraft('u_a', 'c1', d);
    expect(store.getDraft('u_a', 'c1')).toEqual(d);
  });

  test('un brouillon SANS texte mais avec une réponse est conservé', () => {
    const backend = fakeStorage();
    const store = createDraftStore(backend);
    const d: ComposerDraft = { text: '', language: 'fr', protection: {}, replyToId: 'm1' };
    store.setDraft('u_a', 'c1', d);
    expect(store.getDraft('u_a', 'c1')).toEqual(d);
  });

  test('un brouillon qui redevient vide efface l’ancienne valeur', () => {
    const backend = fakeStorage();
    const store = createDraftStore(backend);
    store.setDraft('u_a', 'c1', draftOf());
    store.setDraft('u_a', 'c1', { text: '', language: 'fr', protection: {} });
    expect(store.getDraft('u_a', 'c1')).toBeNull();
  });
});

describe('robustesse', () => {
  test('valeur corrompue en storage ⇒ null, jamais un crash', () => {
    const backend = fakeStorage({ 'meeshy.draft.u_a.c1': '{ not json' });
    expect(createDraftStore(backend).getDraft('u_a', 'c1')).toBeNull();
  });

  test('forme inconnue (JSON valide, pas un brouillon) ⇒ null', () => {
    const backend = fakeStorage({ 'meeshy.draft.u_a.c1': JSON.stringify({ foo: 'bar' }) });
    expect(createDraftStore(backend).getDraft('u_a', 'c1')).toBeNull();
  });

  test('un backend qui LANCE à l’écriture ne fait perdre aucune valeur pour la session', () => {
    const backend: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    };
    const store = createDraftStore(backend);
    store.setDraft('u_a', 'c1', draftOf());
    expect(store.getDraft('u_a', 'c1')).toEqual(draftOf());
  });

  test('un backend qui LANCE à la lecture rend null plutôt que de lancer', () => {
    const backend: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(createDraftStore(backend).getDraft('u_a', 'c1')).toBeNull();
  });

  test('backend absent (`undefined` explicite) ⇒ magasin en mémoire seule, fonctionnel', () => {
    const store = createDraftStore(null);
    store.setDraft('u_a', 'c1', draftOf());
    expect(store.getDraft('u_a', 'c1')).toEqual(draftOf());
  });
});
