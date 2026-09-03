/**
 * @jest-environment node
 */

import { RECHERCHE_SERVIE } from '@/app/connecte/recherche-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE de `/search` et l'écran qu'elle rend.
 *
 * Cinq gardent des choses qu'aucune lecture distraite du HTML n'attraperait :
 *
 *   - sans requête, la porte n'appelle RIEN. La page la plus rapide de la v3
 *     est celle qui ne demande rien, et `q` est de toute façon requis
 *     (`minLength: 1`) : l'appeler à vide rendrait un 400 ;
 *   - elle ne demande ni `/auth/me` ni `/conversations` ;
 *   - le compte dit « affichées », jamais « résultats » — aucune des deux
 *     routes ne sert de total ;
 *   - une personne trouvée n'est PAS un lien : ni fiche de profil ni création
 *     de conversation n'existent dans la v3 (règle 7) ;
 *   - le champ RE-SERT le terme, sans quoi l'écran oublierait la question qu'il
 *     répond.
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

const NOMINALE = (
  fils: readonly unknown[] = [filServi()],
  gens: readonly unknown[] = [personneServie()],
  pagination: unknown = { hasMore: false, nextCursor: null, limit: 20 },
) =>
  passerelle({
    '/conversations/search': () => json({ success: true, data: fils }),
    '/directory/people': () => json({ success: true, data: gens, pagination }),
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

    // Zéro aller-retour : la page la plus rapide de la v3 est celle qui ne
    // demande rien. Et `q` est requis côté passerelle — l'appeler à vide
    // rendrait un 400.
    expect(vus).toEqual([]);
    expect(html).toContain('Cherchez dans vos conversations');
    // Pas « aucun résultat » : le lecteur n'a rien demandé, on ne lui reproche
    // pas de n'avoir rien trouvé.
    expect(html).not.toContain('Aucun résultat');
  });

  it('ne demande NI /auth/me NI /conversations', async () => {
    const { recuperer, vus } = NOMINALE();

    await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer);

    expect(vus).toHaveLength(2);
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(false);
    // `/conversations/search` est demandée ; `/conversations` NUE ne l'est pas.
    expect(vus.some((url) => /\/api\/v1\/conversations\?/.test(url))).toBe(false);
  });

  it('rend les deux groupes, et RE-SERT le terme dans le champ', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    expect(html).toContain('Conversations');
    expect(html).toContain('Équipe Lagos');
    expect(html).toContain('Personnes');
    expect(html).toContain('Sara Kim');
    expect(html).toContain('@sarakim');
    // Sans cette valeur, l'écran aurait oublié la question qu'il répond.
    expect(html).toContain('value="lagos"');
  });

  it('dit « affichées », jamais « résultats »', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=lagos'), recuperer)
    ).text();

    // Aucune des deux routes ne sert de total : « 1 résultat » promettrait un
    // décompte que le nombre de lignes rapatriées ne peut pas tenir.
    expect(html).toContain('1 affichée');
    expect(html).toContain('1 affiché');
    expect(html).not.toContain('résultats');
  });

  it('dit « il en reste » quand la passerelle l’annonce, sans jamais dire combien', async () => {
    const { recuperer } = NOMINALE([], [personneServie()], {
      hasMore: true,
      nextCursor: 'u-sara',
      limit: 20,
    });

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=sara'), recuperer)
    ).text();

    expect(html).toContain('Affinez votre recherche');
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

    // Cent vingt caractères tiennent tout nom et tout titre ; laisser passer un
    // `?q=` de plusieurs kilo-octets, c'est faire travailler les gardes de la
    // passerelle après avoir déjà envoyé la requête.
    expect(vus[0]).toContain(`q=${'a'.repeat(120)}&`.replace('&', ''));
    expect(vus[0]).not.toContain('a'.repeat(121));
  });

  it('dessine « aucun résultat » quand la recherche ne rend rien', async () => {
    const { recuperer } = NOMINALE([], []);

    const html = await (
      await RECHERCHE_SERVIE(requete('https://meeshy.test/search?q=zzz'), recuperer)
    ).text();

    expect(html).toContain('Aucun résultat');
  });

  it('renvoie se connecter sur 401, dessine la panne sur un silence', async () => {
    const refus = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: false }, 401),
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
});
