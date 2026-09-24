import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from './studio-draft-store';

/** Un objet texte tel que le brouillon le porte — le plateau en pose au moins
 * un dès l'ouverture (#6943), donc le cas nominal en a un. */
const layer = (text: string, partial: Record<string, unknown> = {}) => ({ id: 'text-1', text, ...partial });

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
      texts: [layer('Bonjour', { language: 'fr', pose: { x: 0.25, y: 0.75, scale: 2, rotation: 30 } })],
      background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' as const, caption: 'Au marché' },
      overlay: { postMediaId: 'pm-3', fileUrl: '2026/09/y.png', mediaType: 'image' as const, pose: { x: 0.1, y: 0.9, scale: 1, rotation: 0 } },
      sound: { postMediaId: 'pm-2', fileUrl: '2026/09/x.m4a', plane: 'foreground' },
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('aspectRatio et thumbHash (§0, défaut 7) SURVIVENT au round-trip, sans les deux ⇒ toujours accepté', () => {
    const backend = fakeStorage();
    const snapshot = {
      texts: [layer('Bonjour')],
      background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' as const, aspectRatio: 0.5625, thumbHash: 'abc123' },
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('UN brouillon par LECTEUR — un autre compte sur le même appareil ne relit NI le texte NI les médias montés du premier', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, { texts: [layer('Brouillon privé')], background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' } });
    expect(store.get(OTHER_VIEWER)).toBeNull();
    expect(createStudioDraftStore(backend).get(OTHER_VIEWER)).toBeNull();
    expect([...backend.map.keys()]).toEqual([`meeshy.draft.story.${VIEWER}`]);
  });

  test('clear retire le brouillon (succès de publication)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, { texts: [layer('x')] });
    store.clear(VIEWER);
    expect(store.get(VIEWER)).toBeNull();
  });

  test('un brouillon VIDE est PURGÉ, jamais écrit', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, { texts: [layer('x')] });
    store.set(VIEWER, { texts: [layer('   ')] });
    expect(store.get(VIEWER)).toBeNull();
    expect(backend.map.size).toBe(0);
  });

  /** LA FORME A CHANGÉ (#6943) — un brouillon écrit par le studio à UN texte
   * (`{ text: string }`) n'est plus compris : il est relu `null`, et l'auteur
   * repart d'un plateau vide plutôt que d'un état à moitié interprété. */
  test('un brouillon de la forme PRÉCÉDENTE est relu null, jamais à moitié', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ text: 'Ancien', language: 'fr' }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
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
    expect(() => store.set(VIEWER, { texts: [layer('x')] })).not.toThrow();
    expect(store.get(VIEWER)).toEqual({ texts: [layer('x')] });
  });
});

describe('createStudioDraftStore — l’audience voyage dans le brouillon ET se RETIENT séparément (#7683)', () => {
  test('un snapshot avec `visibility` fait l’aller-retour set/get', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, { texts: [layer('Bonjour')], visibility: 'FRIENDS' });
    expect(store.get(VIEWER)?.visibility).toBe('FRIENDS');
  });

  test('une `visibility` inconnue en backend ⇒ get() rend null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ texts: [layer('x')], visibility: 'BOGUS' }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
  });

  test('la mémoire SURVIT à `clear` (une publication réussie purge le brouillon, jamais le souvenir)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.rememberAudience(VIEWER, 'FRIENDS');
    store.set(VIEWER, { texts: [layer('Bonjour')] });
    store.clear(VIEWER);
    expect(store.get(VIEWER)).toBeNull();
    expect(store.lastAudience(VIEWER)).toBe('FRIENDS');
  });

  test('ONLY/EXCEPT ne se mémorisent jamais, à l’écriture ET à la lecture', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.rememberAudience(VIEWER, 'FRIENDS');
    // @ts-expect-error — le TYPE refuse déjà un mode nominatif (`ChoosableAudience`) ; le témoin prouve que le magasin le refuse AUSSI à l'exécution, pour un appelant non typé.
    store.rememberAudience(VIEWER, 'ONLY');
    expect(store.lastAudience(VIEWER)).toBe('FRIENDS');

    const backend = fakeStorage();
    backend.setItem(`meeshy.studio.audience.${VIEWER}`, 'ONLY');
    expect(createStudioDraftStore(backend).lastAudience(VIEWER)).toBeNull();
    backend.setItem(`meeshy.studio.audience.${VIEWER}`, 'BOGUS');
    expect(createStudioDraftStore(backend).lastAudience(VIEWER)).toBeNull();
  });

  test('la mémoire est PAR LECTEUR — celle de l’un n’est pas celle de l’autre', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.rememberAudience(VIEWER, 'PUBLIC');
    store.rememberAudience(OTHER_VIEWER, 'PRIVATE');
    expect(store.lastAudience(VIEWER)).toBe('PUBLIC');
    expect(store.lastAudience(OTHER_VIEWER)).toBe('PRIVATE');
  });

  test('un backend qui LÈVE ⇒ lastAudience rend quand même la valeur de la session (cache mémoire)', () => {
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
    expect(() => store.rememberAudience(VIEWER, 'COMMUNITY')).not.toThrow();
    expect(store.lastAudience(VIEWER)).toBe('COMMUNITY');
  });

  test('une audience seule ne tient pas un snapshot en vie', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, { texts: [layer('')], visibility: 'FRIENDS' });
    expect(store.get(VIEWER)).toBeNull();
  });
});
