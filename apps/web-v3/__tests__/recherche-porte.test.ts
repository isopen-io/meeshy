/**
 * @jest-environment node
 */

import { adresseDuFil, adresseDuPlein } from '@/lib/api/adresses-du-fil';
import { RECHERCHE_SERVIE } from '@/app/connecte/recherche-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE de `/search` et l'écran qu'elle rend,
 * ses QUATRE groupes (#5174, #5171).
 *
 * Gardes qu'aucune lecture distraite du HTML n'attraperait :
 *
 *   - sans requête, la porte n'appelle RIEN ;
 *   - elle ne demande ni `/auth/me` ni `/conversations` ;
 *   - le compte dit « affichées »/« affichés », jamais « résultats » —
 *     aucune des quatre routes ne sert de total ;
 *   - une personne trouvée n'est PAS un lien (règle 7) ;
 *   - chaque rangée Médias porte l'adresse du plein — `?autour=&media=`,
 *     composée par `adresses-du-fil.ts`, jamais recomposée à la main ;
 *   - chaque rangée Liens ouvre une adresse RÉELLE ;
 *   - AUCUNE pastille ni champ de présence dans le document ;
 *   - le champ RE-SERT le terme.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string): Request => new Request(url, { headers: { cookie: COOKIE } });

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const filServi = (extra: Record<string, unknown> = {}) => ({
  id: '68f2a81417a557e8ce4ddfbb',
  identifier: 'lagos',
  title: 'Équipe Lagos',
  type: 'group',
  isActive: true,
  memberCount: 12,
  lastMessageAt: '2026-09-02T20:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  participants: [],
  ...extra,
});

const personneServie = (extra: Record<string, unknown> = {}) => ({
  id: 'u-sara',
  username: 'sarakim',
  displayName: 'Sara Kim',
  avatar: null,
  isOnline: null,
  lastActiveAt: null,
  ...extra,
});

const mediaServi = (extra: Record<string, unknown> = {}) => ({
  id: 'am1',
  fileName: 'tableau.jpg',
  mimeType: 'image/jpeg',
  fileSize: 430_080,
  fileUrl: '/api/v1/attachments/file/2026/tableau.jpg',
  thumbnailUrl: null,
  duration: null,
  messageId: 'r1',
  originalName: 'tableau.jpg',
  uploadedBy: 'p-ibrahim',
  createdAt: '2026-09-01T10:00:00.000Z',
  width: 1200,
  height: 900,
  conversationId: 'fil-riche',
  ...extra,
});

const lienServi = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  linkId: 'mshy_demo',
  identifier: 'demo',
  name: 'Démo septembre',
  isActive: true,
  currentUses: 4,
  maxUses: null,
  expiresAt: null,
  conversation: { id: 'c9', title: 'Équipe Lagos', type: 'group' },
  ...extra,
});

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

const NOMINALE = ({
  fils = [filServi()],
  gens = [personneServie()],
  paginationGens = { hasMore: false, nextCursor: null, limit: 20 },
  medias = [mediaServi()],
  paginationMedias = { limit: 50, hasMore: false, nextCursor: null },
  liens = [lienServi()],
  paginationLiens = { total: liens.length, offset: 0, limit: 20, hasMore: false },
}: {
  readonly fils?: readonly unknown[];
  readonly gens?: readonly unknown[];
  readonly paginationGens?: unknown;
  readonly medias?: readonly unknown[];
  readonly paginationMedias?: unknown;
  readonly liens?: readonly unknown[];
  readonly paginationLiens?: unknown;
} = {}) =>
  passerelle({
    '/conversations/search': () => json({ success: true, data: fils }),
    '/directory/people': () => json({ success: true, data: gens, pagination: paginationGens }),
    '/attachments/search': () => json({ success: true, data: { attachments: medias }, pagination: paginationMedias }),
    '/links': () => json({ success: true, data: liens, pagination: paginationLiens }),
  });

describe('la porte de /search', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await RECHERCHE_SERVIE(new Request('https://meeshy.test/search'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fsearch');
  });

  it('n’appelle RIEN sans requête, et invite à chercher', async () => {
    const { recuperer, vus } = NOMINALE();

    const html = await (await RECHERCHE_SERVIE(requete('https://meeshy.test/search'), recuperer)).text();

    expect(vus).toEqual([]);
    expect(html).toContain('Cherchez dans vos conversations');
    expect(html).not.toContain('Aucun résultat');
  });

  it('ne demande NI /auth/me NI /conversations', async () => {
    const { recuperer, vus } = NOMINALE();

    await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer);

    expect(vus).toHaveLength(4);
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(false);
    // `/conversations/search` est demandée ; `/conversations` NUE ne l'est pas.
    expect(vus.some((url) => /\/api\/v1\/conversations\?/.test(url))).toBe(false);
  });

  it('rend les QUATRE groupes quand les quatre répondent', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    expect(html).toContain('Conversations');
    expect(html).toContain('Équipe Lagos');
    expect(html).toContain('Personnes');
    expect(html).toContain('Sara Kim');
    expect(html).toContain('@sarakim');
    expect(html).toContain('Médias');
    expect(html).toContain('tableau.jpg');
    expect(html).toContain('Liens');
    expect(html).toContain('Démo septembre');
    // Sans cette valeur, l'écran aurait oublié la question qu'il répond.
    expect(html).toContain('value="lagos"');
  });

  it('chaque rangée Médias porte l’adresse du plein — autour= ET media=, composée par adresses-du-fil', async () => {
    const { recuperer } = NOMINALE({
      medias: [mediaServi({ id: 'am9', messageId: 'm9', conversationId: 'fil-riche' })],
    });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=tableau'), recuperer)
    ).text();

    // `&` s'échappe en `&amp;` dans un attribut HTML — l'assertion compare au
    // document RENDU, pas à la chaîne brute que compose `adresseDuPlein`.
    const attendu = adresseDuPlein(adresseDuFil('fil-riche'), 'm9', 'am9').replace(/&/g, '&amp;');
    expect(html).toContain(`href="${attendu}"`);
  });

  it('chaque rangée Liens ouvre une adresse réelle', async () => {
    const { recuperer } = NOMINALE({
      liens: [
        lienServi({ id: 'l1', linkId: 'mshy_a', identifier: 'a', conversation: { id: 'cx', title: 'X', type: 'group' } }),
        lienServi({ id: 'l2', linkId: 'mshy_b', identifier: 'b', conversation: undefined }),
      ],
    });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=a'), recuperer)
    ).text();

    expect(html).toContain(`href="${adresseDuFil('cx')}"`);
    expect(html).toContain('href="/links"');
  });

  it('un lien fermé le DIT', async () => {
    const { recuperer } = NOMINALE({ liens: [lienServi({ isActive: false })] });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=demo'), recuperer)
    ).text();

    expect(html).toContain('Fermé');
  });

  it('dit « affichées »/« affichés », jamais « résultats », sur les quatre groupes', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    // L'ACCORD SUIT LE NOM DU GROUPE : Conversations et Personnes au féminin,
    // Médias et Liens au masculin. Compter les deux formes plutôt qu'une seule
    // est ce qui fait rougir le témoin si un groupe reprend la mauvaise.
    expect((html.match(/1 affichée/g) ?? []).length).toBe(2);
    expect((html.match(/1 affiché(?!e)/g) ?? []).length).toBe(2);
    expect(html).not.toContain('résultats');
  });

  it('dit « il en reste » quand la passerelle l’annonce, sans jamais dire combien', async () => {
    const { recuperer } = NOMINALE({
      fils: [],
      paginationGens: { hasMore: true, nextCursor: 'u-sara', limit: 20 },
    });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=sara'), recuperer)
    ).text();

    expect(html).toContain('Affinez votre recherche');
  });

  /**
   * L'ORDRE SE LIT SUR LES RANGÉES RENDUES, JAMAIS PAR `indexOf` SUR LE
   * DOCUMENT ENTIER. La forme précédente comparait `html.indexOf('Un')` à
   * `html.indexOf('Deux')` : « Un » apparaît dès le `placeholder` du champ
   * (« Un nom, un titre, un fichier »), à quelque 37 700 caractères DEVANT
   * toute rangée — le témoin rendait donc vrai quel que soit l'ordre servi, et
   * inverser les personnes dans la vue ne le faisait pas rougir (mesuré).
   * C'est la moitié « ni par un ORDRE » du critère de la matrice qui n'était
   * gardée par rien.
   */
  const nomsRendus = (html: string, groupe: string): readonly string[] => {
    const section = html.split(`<h2>${groupe}</h2>`)[1]?.split('</section>')[0] ?? '';
    return Array.from(section.matchAll(/<span class="primaire">([^<]*)<\/span>/g)).map((m) => m[1] ?? '');
  };

  it('AUCUNE pastille de présence, AUCUN champ de présence dans le document — l’ordre est celui du stub', async () => {
    const { recuperer } = NOMINALE({
      gens: [
        personneServie({ id: 'u-1', username: 'un', displayName: 'Alpha Hors-ligne' }),
        personneServie({ id: 'u-2', username: 'deux', displayName: 'Beta En-ligne', isOnline: true }),
      ],
    });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=a'), recuperer)
    ).text();

    expect(html).not.toContain('pastille');
    expect(html).not.toContain('isOnline');
    // Servi dans l'ordre de la passerelle : la personne EN LIGNE ne remonte
    // pas, sans quoi l'ordre dirait ce que le champ ne dit pas.
    expect(nomsRendus(html, 'Personnes')).toEqual(['Alpha Hors-ligne', 'Beta En-ligne']);
  });

  it('mène à la conversation, mais une personne n’est PAS un lien', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    expect(html).toContain('href="/chats/68f2a81417a557e8ce4ddfbb"');
    // Ouvrir une personne demanderait une fiche de profil, lui écrire une
    // création de conversation : la v3 ne sert ni l'une ni l'autre (règle 7).
    expect(html).not.toContain('href="/u/');
    expect(html).toContain('<li class="trouvaille">');
  });

  it('borne le terme avant de l’envoyer', async () => {
    const { recuperer, vus } = NOMINALE();
    const tres_long = 'a'.repeat(500);

    await RECHERCHE_SERVIE(requete(`https://meeshy.test/search?q=${tres_long}`), recuperer);

    expect(vus[0]).toContain(`q=${'a'.repeat(120)}&`.replace('&', ''));
    expect(vus[0]).not.toContain('a'.repeat(121));
  });

  it('un état sans médias ni liens ne rend pas leurs groupes', async () => {
    const { recuperer } = NOMINALE({ medias: [], liens: [] });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    expect(html).not.toContain('Médias');
    expect(html).not.toContain('Liens');
  });

  it('dessine « aucun résultat » quand la recherche ne rend rien', async () => {
    const { recuperer } = NOMINALE({ fils: [], gens: [], medias: [], liens: [] });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=zzz'), recuperer)
    ).text();

    expect(html).toContain('Aucun résultat');
  });

  it('renvoie se connecter sur 401, dessine la panne sur un silence', async () => {
    const refus = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: false }, 401),
      '/attachments/search': () => json({ success: true, data: { attachments: [] } }),
      '/links': () => json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }),
    });
    const reponse = await RECHERCHE_SERVIE(
      requete('https://meeshy.test/search?q=a'),
      refus.recuperer,
    );
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fsearch');

    const muette = await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=a'), async () => {
      throw new Error('réseau coupé');
    });
    expect(muette.status).toBe(503);
    expect(await muette.text()).not.toBe('');
  });

  it('une SEULE route en panne dessine « Indisponible » sur son groupe — 200, pas 503 (correctif 2026-09-05)', async () => {
    const { recuperer } = passerelle({
      '/conversations/search': () => json({ success: true, data: [filServi()] }),
      '/directory/people': () => json({ success: true, data: [personneServie()], pagination: { hasMore: false, nextCursor: null, limit: 20 } }),
      '/attachments/search': () => {
        throw new Error('réseau coupé');
      },
      '/links': () => json({ success: true, data: [lienServi()], pagination: { total: 1, offset: 0, limit: 20, hasMore: false } }),
    });

    const reponse = await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer);
    expect(reponse.status).toBe(200);

    const html = await reponse.text();
    // Le groupe touché DIT « Indisponible », il ne se tait pas et ne prétend
    // pas « 0 affiché » — ce que la carte « aucun résultat » dirait à tort.
    expect(html).toContain('Indisponible');
    expect(html).not.toContain('Aucun résultat');
    // Les trois autres groupes, eux, servent normalement.
    expect(html).toContain('Équipe Lagos');
    expect(html).toContain('Sara Kim');
    expect(html).toContain('Démo septembre');
  });
});
