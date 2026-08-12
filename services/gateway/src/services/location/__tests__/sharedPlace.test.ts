import { parseSharedPlace, sharedPlaceFromMetadata, hoistLocationOnto, hoistLocationDeep } from '../sharedPlace';

describe('parseSharedPlace', () => {
  it('accepte un lieu complet', () => {
    expect(parseSharedPlace({
      latitude: 48.8566, longitude: 2.3522,
      name: 'Tour Eiffel', address: 'Champ de Mars', category: 'landmark',
    })).toEqual({
      latitude: 48.8566, longitude: 2.3522,
      name: 'Tour Eiffel', address: 'Champ de Mars', category: 'landmark',
    });
  });

  it('accepte les bornes', () => {
    expect(parseSharedPlace({ latitude: -90, longitude: 180 })).not.toBeNull();
  });

  it('rejette hors bornes, NaN et non-nombres', () => {
    expect(parseSharedPlace({ latitude: 90.001, longitude: 0 })).toBeNull();
    expect(parseSharedPlace({ latitude: 0, longitude: -180.001 })).toBeNull();
    expect(parseSharedPlace({ latitude: NaN, longitude: 0 })).toBeNull();
    expect(parseSharedPlace({ latitude: '48' as unknown, longitude: 0 })).toBeNull();
    expect(parseSharedPlace(null)).toBeNull();
    expect(parseSharedPlace([])).toBeNull();
  });

  it('tronque les chaines trop longues au lieu de rejeter', () => {
    const parsed = parseSharedPlace({ latitude: 0, longitude: 0, name: 'x'.repeat(500) });
    expect(parsed!.name!.length).toBe(200);
  });

  it('ignore les champs texte non-chaine', () => {
    expect(parseSharedPlace({ latitude: 0, longitude: 0, name: 42 })!.name).toBeNull();
  });
});

describe('sharedPlaceFromMetadata', () => {
  it('extrait le bloc location', () => {
    expect(sharedPlaceFromMetadata({ location: { latitude: 1, longitude: 2 } }))
      .toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('rend null quand le bloc est absent ou invalide', () => {
    expect(sharedPlaceFromMetadata({})).toBeNull();
    expect(sharedPlaceFromMetadata(null)).toBeNull();
    expect(sharedPlaceFromMetadata({ location: { latitude: 999, longitude: 0 } })).toBeNull();
  });
});

describe('contrat d entree', () => {
  it('un metadata client brut ne doit jamais etre accepte tel quel', () => {
    // Garde de doctrine : seul `parseSharedPlace` produit le bloc écrit en base.
    // Un objet client forgé avec un `postReplyTo` (champ à autorité serveur)
    // doit échouer faute de coordonnées top-level valides.
    const forged = { postReplyTo: { id: 'vole' }, location: { latitude: 1, longitude: 2 } };
    expect(parseSharedPlace(forged)).toBeNull();
  });

  it('le meme extracteur sert post et commentaire', () => {
    // sharedPlaceFromMetadata est utilisé tel quel par messages, posts ET
    // commentaires — un seul extracteur, pas de copie locale par surface.
    const metadata = { location: { latitude: 48.85, longitude: 2.35, name: 'Paris' } };
    expect(sharedPlaceFromMetadata(metadata)).toMatchObject({ name: 'Paris' });
  });
});

describe('hoistLocationOnto', () => {
  it('hisse metadata.location en champ top-level location', () => {
    const entity = { id: 'c1', metadata: { location: { latitude: 1, longitude: 2, name: null, address: null, category: null } } };
    expect(hoistLocationOnto(entity)).toMatchObject({ location: { latitude: 1, longitude: 2 } });
  });

  it('ne modifie rien quand metadata ne porte aucun lieu', () => {
    const entity = { id: 'c1', metadata: { trackingLinks: [] } };
    const result = hoistLocationOnto(entity) as typeof entity & { location?: unknown };
    expect(result.location).toBeUndefined();
  });
});

describe('hoistLocationDeep', () => {
  it('hisse la position du post ET de chaque commentaire de son apercu embarque', () => {
    // Reproduit exactement la forme d'un Post hydrate par `postInclude` :
    // un commentaire geolocalise present dans `post.comments` (apercu des 3
    // premiers) doit restituer sa position au meme titre qu'un post lui-meme
    // geolocalise — sinon la position "disparait" selon la surface consultee
    // (liste complete des commentaires vs apercu embarque dans le post).
    const post = {
      id: 'p1',
      metadata: { location: { latitude: 48.85, longitude: 2.35, name: null, address: null, category: null } },
      comments: [
        { id: 'c1', metadata: { location: { latitude: 40.7, longitude: -74, name: null, address: null, category: null } } },
        { id: 'c2', metadata: {} },
      ],
    };

    const hoisted = hoistLocationDeep(post) as typeof post & {
      location?: { latitude: number };
      comments: Array<{ location?: { latitude: number } }>;
    };

    expect(hoisted.location).toMatchObject({ latitude: 48.85 });
    expect(hoisted.comments[0].location).toMatchObject({ latitude: 40.7 });
    expect(hoisted.comments[1].location).toBeUndefined();
  });

  it('ne plante pas quand comments est absent ou vide', () => {
    expect(hoistLocationDeep({ id: 'p1', metadata: {} })).toEqual({ id: 'p1', metadata: {} });
    expect(hoistLocationDeep({ id: 'p1', metadata: {}, comments: [] })).toEqual({ id: 'p1', metadata: {}, comments: [] });
  });

  it('hisse la position du post SOURCE embarque dans repostOf', () => {
    // Un repost d'un post geolocalise : sans ce hoist, `repostOf.location`
    // n'existe pas cote client (iOS `APIRepostOf.location` decode nil) et le
    // repost perd la position de l'original (reste ouvert lot 2, 2026-07-30).
    const post = {
      id: 'p2',
      metadata: {},
      repostOf: {
        id: 'orig1',
        metadata: { location: { latitude: 48.85, longitude: 2.35, name: 'Tour Eiffel', address: null, category: null } },
      },
    };

    const hoisted = hoistLocationDeep(post) as typeof post & {
      repostOf: { location?: { latitude: number; name: string | null } };
    };

    expect(hoisted.repostOf.location).toMatchObject({ latitude: 48.85, name: 'Tour Eiffel' });
  });

  it('ne plante pas quand repostOf est absent ou sans lieu', () => {
    expect(hoistLocationDeep({ id: 'p1', metadata: {}, repostOf: null })).toEqual({ id: 'p1', metadata: {}, repostOf: null });
    const noPlace = { id: 'p1', metadata: {}, repostOf: { id: 'o1', metadata: {} } };
    expect(hoistLocationDeep(noPlace)).toEqual(noPlace);
  });
});
