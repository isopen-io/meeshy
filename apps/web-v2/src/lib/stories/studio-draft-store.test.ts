import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore, type StudioDraftSnapshot } from './studio-draft-store';

/** Un objet texte tel que le brouillon le porte — le plateau en pose au moins
 * un dès l'ouverture (#6943), donc le cas nominal en a un. */
const layer = (text: string, partial: Record<string, unknown> = {}) => ({ id: 'text-1', text, ...partial });

/** UN brouillon à UNE page (schéma 2, #7684) — le cas nominal du studio. */
const onePage = (partial: Record<string, unknown> = {}): StudioDraftSnapshot => ({
  schema: 2,
  pages: [{ id: 'page-1', texts: [layer('x')], ...partial }],
  currentPage: 'page-1',
});

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
    const snapshot: StudioDraftSnapshot = {
      schema: 2,
      pages: [
        {
          id: 'page-1',
          texts: [layer('Bonjour', { language: 'fr', pose: { x: 0.25, y: 0.75, scale: 2, rotation: 30 } })],
          background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image', caption: 'Au marché' },
          overlay: { postMediaId: 'pm-3', fileUrl: '2026/09/y.png', mediaType: 'image', pose: { x: 0.1, y: 0.9, scale: 1, rotation: 0 } },
          sound: { postMediaId: 'pm-2', fileUrl: '2026/09/x.m4a', plane: 'foreground' },
        },
      ],
      currentPage: 'page-1',
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('DEUX PAGES (#7684) font l’aller-retour, chacune avec SES propres objets', () => {
    const backend = fakeStorage();
    const snapshot: StudioDraftSnapshot = {
      schema: 2,
      pages: [
        { id: 'page-1', texts: [layer('Une')], background: { postMediaId: 'pm-1', fileUrl: 'a.jpg', mediaType: 'image' } },
        { id: 'page-2', texts: [{ id: 'text-2', text: 'Deux' }], background: { postMediaId: 'pm-2', fileUrl: 'b.jpg', mediaType: 'image' } },
      ],
      currentPage: 'page-2',
    };
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('aspectRatio et thumbHash (§0, défaut 7) SURVIVENT au round-trip, sans les deux ⇒ toujours accepté', () => {
    const backend = fakeStorage();
    const snapshot = onePage({ background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image', aspectRatio: 0.5625, thumbHash: 'abc123' } });
    createStudioDraftStore(backend).set(VIEWER, snapshot);
    expect(createStudioDraftStore(backend).get(VIEWER)).toEqual(snapshot);
  });

  test('UN brouillon par LECTEUR — un autre compte sur le même appareil ne relit NI le texte NI les médias montés du premier', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, onePage({ texts: [layer('Brouillon privé')], background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' } }));
    expect(store.get(OTHER_VIEWER)).toBeNull();
    expect(createStudioDraftStore(backend).get(OTHER_VIEWER)).toBeNull();
    expect([...backend.map.keys()]).toEqual([`meeshy.draft.story.${VIEWER}`]);
  });

  test('clear retire le brouillon (succès de publication)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, onePage());
    store.clear(VIEWER);
    expect(store.get(VIEWER)).toBeNull();
  });

  test('un brouillon dont TOUTES les pages sont VIDES est PURGÉ, jamais écrit', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, onePage({ texts: [layer('x')] }));
    store.set(VIEWER, onePage({ texts: [layer('   ')] }));
    expect(store.get(VIEWER)).toBeNull();
    expect(backend.map.size).toBe(0);
  });

  test('une valeur CORROMPUE en backend ⇒ null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, '{ pas du json');
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
  });

  test('un `pages` non tableau, ou une page SANS `id` ⇒ null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ schema: 2, pages: 'pas-un-tableau' }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();

    const other = fakeStorage();
    other.setItem(`meeshy.draft.story.${OTHER_VIEWER}`, JSON.stringify({ schema: 2, pages: [{ texts: [layer('x')] }] }));
    expect(createStudioDraftStore(other).get(OTHER_VIEWER)).toBeNull();
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
    const snapshot = onePage();
    expect(() => store.set(VIEWER, snapshot)).not.toThrow();
    expect(store.get(VIEWER)).toEqual(snapshot);
  });
});

describe('LE BROUILLON À PAGES SURVIT, ET L’ANCIENNE FORME EST RELEVÉE (#7684, D-44)', () => {
  test('un snapshot de la forme PRÉCÉDENTE (sans `schema`) est relu comme UNE page `page-1` — jamais `null`', () => {
    const backend = fakeStorage();
    backend.setItem(
      `meeshy.draft.story.${VIEWER}`,
      JSON.stringify({
        texts: [layer('Bonjour', { language: 'fr' })],
        language: 'fr',
        background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' },
      }),
    );
    const restored = createStudioDraftStore(backend).get(VIEWER);
    expect(restored).toEqual({
      schema: 2,
      pages: [{ id: 'page-1', texts: [layer('Bonjour', { language: 'fr' })], background: { postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg', mediaType: 'image' } }],
      currentPage: 'page-1',
      language: 'fr',
    });
  });

  test('une forme PRÉCÉDENTE encore plus ancienne (`{ text: string }`, avant #6943) est relue null, jamais à moitié', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ text: 'Ancien', language: 'fr' }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
  });

  test('un `schema` FUTUR (3) ⇒ null — un client ancien ne relit pas ce qu’il ne comprend pas', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ schema: 3, pages: [{ id: 'page-1', texts: [layer('x')] }] }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
  });

  test('un snapshot dont TOUTES les pages sont vides est PURGÉ, jamais écrit', () => {
    const backend = fakeStorage();
    const store = createStudioDraftStore(backend);
    store.set(VIEWER, { schema: 2, pages: [{ id: 'page-1', texts: [layer('  ')] }, { id: 'page-2', texts: [{ id: 'text-2', text: '' }] }] });
    expect(store.get(VIEWER)).toBeNull();
    expect(backend.map.size).toBe(0);
  });
});

describe('createStudioDraftStore — l’audience voyage dans le brouillon ET se RETIENT séparément (#7683)', () => {
  test('un snapshot avec `visibility` fait l’aller-retour set/get', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.set(VIEWER, onePage({}));
    store.set(VIEWER, { ...onePage(), visibility: 'FRIENDS' });
    expect(store.get(VIEWER)?.visibility).toBe('FRIENDS');
  });

  test('une `visibility` inconnue en backend ⇒ get() rend null, jamais une exception', () => {
    const backend = fakeStorage();
    backend.setItem(`meeshy.draft.story.${VIEWER}`, JSON.stringify({ ...onePage(), visibility: 'BOGUS' }));
    expect(createStudioDraftStore(backend).get(VIEWER)).toBeNull();
  });

  test('la mémoire SURVIT à `clear` (une publication réussie purge le brouillon, jamais le souvenir)', () => {
    const store = createStudioDraftStore(fakeStorage());
    store.rememberAudience(VIEWER, 'FRIENDS');
    store.set(VIEWER, onePage());
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
    store.set(VIEWER, { ...onePage({ texts: [layer('')] }), visibility: 'FRIENDS' });
    expect(store.get(VIEWER)).toBeNull();
  });
});
