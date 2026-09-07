/**
 * @jest-environment node
 */

import { filSocial, railDeStories, textesDuPost } from '@/lib/api/social';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — le fil social (#5031) et le rail de stories.
 *
 * LE TÉMOIN QUI COMPTE est celui de `textesDuPost` : il prouve que les textes
 * distincts d'un post QUE LE PRISME DU LECTEUR RECONNAÎT sont énumérés, pas
 * seulement l'élu — c'est le défaut du cycle 123 (« la variante block rend
 * une zone traductions disponibles cliquable, et cliquer n'y changeait rien »)
 * que ce module ferme en donnant à la vue de quoi rendre un contrôle qui a un
 * EFFET. « Distincts » est BORNÉ à `langues` depuis la correction du gate de
 * poids (`budgets.json › documents.document_o`) : la carte `translations`
 * d'un post populaire porte 3 à 12 langues à mesure que d'autres lecteurs la
 * font grossir (§ schéma, « une traduction naît au premier accès d'un viewer
 * dans cette langue ») — les inliner TOUTES fait franchir le plafond de
 * document dès la troisième, pour des langues qu'AUCUN Prisme de CE lecteur
 * ne demande. Le Prisme sert la langue du LECTEUR, jamais celle d'un voisin.
 */

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const carte = (paires: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(paires).map(([code, text]) => [code, { text, translationModel: 'nllb-200' }]));

const postServi = (extra: Record<string, unknown> = {}) => ({
  id: 'post-1',
  type: 'POST',
  content: 'The March review is ready.',
  originalLanguage: 'en',
  translations: carte({ fr: 'La revue de mars est prête.' }),
  createdAt: '2026-09-02T18:00:00.000Z',
  author: { id: 'u-ibrahim', displayName: 'Ibrahim' },
  likeCount: 128,
  commentCount: 12,
  repostCount: 4,
  isLikedByMe: false,
  isRepostedByMe: false,
  ...extra,
});

const filServi = (posts: readonly unknown[], hasMore = false) => ({
  success: true,
  data: posts,
  pagination: { limit: 20, hasMore, nextCursor: null },
});

const passerelle = (reponse: () => Response) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    return reponse();
  };
  return { recuperer, vus };
};

describe('textesDuPost — l’énumération des textes distincts', () => {
  it('place l’élu du Prisme en premier, puis l’original', () => {
    const textes = textesDuPost({
      carte: { fr: 'La revue de mars est prête.' },
      langueOriginale: 'en',
      texteOriginal: 'The March review is ready.',
      langues: ['fr'],
    });

    expect(textes).toEqual([
      { langue: 'fr', texte: 'La revue de mars est prête.', origine: false },
      { langue: 'en', texte: 'The March review is ready.', origine: true },
    ]);
  });

  it('sert l’original seul quand aucune langue préférée n’est traduite — jamais translations.first', () => {
    const textes = textesDuPost({
      carte: { es: 'La revisión de marzo está lista.' },
      langueOriginale: 'en',
      texteOriginal: 'The March review is ready.',
      langues: ['fr'],
    });

    // L'espagnol N'EST NI l'élu (le lecteur préfère fr) NI dans son Prisme
    // (`langues: ['fr']`) — il n'est donc PAS offert : § budget de document,
    // une traduction que ce lecteur ne peut pas configurer ne lui coûte plus
    // un octet. Seul l'original reste.
    expect(textes).toEqual([{ langue: 'en', texte: 'The March review is ready.', origine: true }]);
  });

  it('énumère les traductions DISTINCTES QUE LE PRISME DU LECTEUR RECONNAÎT, pas seulement l’élue — le défaut du cycle 123, BORNÉ au Prisme (§ budget)', () => {
    const textes = textesDuPost({
      carte: { fr: 'Bonjour', es: 'Hola', de: 'Hallo' },
      langueOriginale: 'en',
      texteOriginal: 'Hello',
      langues: ['fr', 'de'],
    });

    // 'es' n'est dans AUCUN rang du Prisme de ce lecteur (`langues`) : il
    // reste dans la carte du post, mais ce module ne l'inline plus.
    expect(textes.map((t) => t.langue)).toEqual(['fr', 'en', 'de']);
  });

  it('ne compte pas deux fois la même langue', () => {
    const textes = textesDuPost({
      carte: { en: 'Hello (relu)' },
      langueOriginale: 'en',
      texteOriginal: 'Hello',
      langues: ['en'],
    });

    // L'élu et l'original sont la MÊME langue : une seule entrée, pas deux.
    expect(textes).toHaveLength(1);
    expect(textes[0]?.langue).toBe('en');
  });

  it('ne descend PAS sous la langue d’origine quand elle est mieux classée (§ Prisme règle 3)', () => {
    const textes = textesDuPost({
      carte: { fr: 'Les chiffres du Q1 sont à jour ?' },
      langueOriginale: 'en',
      texteOriginal: 'Are the Q1 numbers up to date?',
      langues: ['en', 'fr'],
    });

    expect(textes[0]).toEqual({ langue: 'en', texte: 'Are the Q1 numbers up to date?', origine: true });
  });
});

describe('filSocial', () => {
  it('lit scope=home et rend les posts dans l’ordre servi', async () => {
    const { recuperer, vus } = passerelle(() => json(filServi([postServi(), postServi({ id: 'post-2', type: 'REEL' })])));

    const fil = await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer });
    if (fil.genre !== 'fil') throw new Error(fil.genre);

    expect(vus[0]).toContain('scope=home');
    expect(fil.posts.map((p) => p.id)).toEqual(['post-1', 'post-2']);
    expect(fil.posts[0]?.textes[0]).toEqual({ langue: 'fr', texte: 'La revue de mars est prête.', origine: false });
    expect(fil.posts[0]?.aimes).toBe(128);
    expect(fil.posts[0]?.commentaires).toBe(12);
    expect(fil.posts[0]?.reposts).toBe(4);
  });

  it('ne rend ni STATUS ni STORY — le where de PostFeedService.getFeed ne les sert pas', async () => {
    const { recuperer } = passerelle(() => json(filServi([postServi(), postServi({ id: 's1', type: 'STORY' })])));

    const fil = await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer });
    if (fil.genre !== 'fil') throw new Error(fil.genre);

    expect(fil.posts.map((p) => p.id)).toEqual(['post-1']);
  });

  it('porte le curseur de la page suivante quand la passerelle en sert un — `null` sinon', () => {
    return (async () => {
      const suite = passerelle(() =>
        json({ ...filServi([postServi()], true), pagination: { limit: 20, hasMore: true, nextCursor: 'c2' } }),
      );
      const filAvecSuite = await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer: suite.recuperer });
      if (filAvecSuite.genre !== 'fil') throw new Error(filAvecSuite.genre);
      expect(filAvecSuite.curseurSuivant).toBe('c2');

      const fin = passerelle(() => json(filServi([postServi()])));
      const filSansSuite = await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer: fin.recuperer });
      if (filSansSuite.genre !== 'fil') throw new Error(filSansSuite.genre);
      expect(filSansSuite.curseurSuivant).toBeNull();
    })();
  });

  it('transmet le curseur reçu à la passerelle (`?cursor=`)', async () => {
    const { recuperer, vus } = passerelle(() => json(filServi([postServi()])));

    await filSocial({ jeton: 'j', langues: ['fr'], curseur: 'c1', base: 'https://gate.test', recuperer });

    expect(vus[0]).toContain('cursor=c1');
  });

  it('distingue session expirée et panne', async () => {
    const issue = async (statut: number) => {
      const { recuperer } = passerelle(() => json({ success: false }, statut));
      return (await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer })).genre;
    };

    expect(await issue(401)).toBe('session-expiree');
    expect(await issue(500)).toBe('panne');
  });

  it('relaie `aimeParMoi` et `reposteParMoi` tels que servis', async () => {
    const { recuperer } = passerelle(() =>
      json(filServi([postServi({ isLikedByMe: true, isRepostedByMe: true })])),
    );

    const fil = await filSocial({ jeton: 'j', langues: ['fr'], base: 'https://gate.test', recuperer });
    if (fil.genre !== 'fil') throw new Error(fil.genre);

    expect(fil.posts[0]?.aimeParMoi).toBe(true);
    expect(fil.posts[0]?.reposteParMoi).toBe(true);
  });
});

describe('railDeStories', () => {
  it('lit scope=stories&projection=tray et projette id + auteur + l’état vu', async () => {
    const { recuperer, vus } = passerelle(() =>
      json({
        success: true,
        data: [{ id: 's1', authorId: 'u1', author: { displayName: 'Ibrahim' }, isViewedByMe: false }],
      }),
    );

    const rail = await railDeStories({ jeton: 'j', base: 'https://gate.test', recuperer });

    // `projection=tray` — la whitelist déjà branchée sur `scope=stories`
    // (`routes/posts/feed.ts:213`, `postIncludes.ts` › `trayStorySelect`) :
    // rings + auteur + vignette + état vu, jamais le corps plein d'une story.
    expect(vus[0]).toContain('scope=stories');
    expect(vus[0]).toContain('projection=tray');
    expect(rail).toEqual([{ id: 's1', auteur: 'Ibrahim', auteurId: 'u1', vu: false }]);
  });

  it('rend `vu: true` quand la passerelle sert isViewedByMe — l’anneau accentué ne reste QUE sur les non-vues', async () => {
    const { recuperer } = passerelle(() =>
      json({
        success: true,
        data: [{ id: 's1', authorId: 'u1', author: { displayName: 'Ibrahim' }, isViewedByMe: true }],
      }),
    );

    const rail = await railDeStories({ jeton: 'j', base: 'https://gate.test', recuperer });
    expect(rail[0]?.vu).toBe(true);
  });

  it('rend une liste vide plutôt qu’une panne visible — le rail cède la place (charte règle 7)', async () => {
    const { recuperer } = passerelle(() => json({ success: false }, 500));

    expect(await railDeStories({ jeton: 'j', base: 'https://gate.test', recuperer })).toEqual([]);
  });
});
