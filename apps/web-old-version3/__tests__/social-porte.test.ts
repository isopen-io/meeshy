/**
 * @jest-environment node
 */

import { FIL_SOCIAL_SERVI, GESTE_SUR_UN_POST } from '@/app/connecte/social-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la porte de `/feed` (#5031).
 *
 * `/feed` N'EST PAS L'ENTRÉE D'UN LIEN PARTAGÉ : sans jeton, elle renvoie
 * `/login?returnUrl=/feed`, la MÊME loi que `/contacts` — jamais l'invitation
 * inline de `/post/:id`, qui n'a de sens que sur une adresse reçue en dehors
 * d'un compte.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, options: { readonly avecJeton?: boolean; readonly origine?: string | null } = {}): Request =>
  new Request(`${ORIGINE}${chemin}`, {
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
    },
  });

const posteRequete = (
  chemin: string,
  corps: Readonly<Record<string, string>>,
  options: { readonly avecJeton?: boolean; readonly origine?: string | null } = {},
): Request => {
  const formulaire = new URLSearchParams(corps).toString();
  return new Request(`${ORIGINE}${chemin}`, {
    method: 'POST',
    headers: {
      ...(options.avecJeton === false ? {} : { cookie: COOKIE }),
      ...(options.origine === null ? {} : { origin: options.origine ?? ORIGINE }),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: formulaire,
  });
};

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

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné (${options.method ?? 'GET'}) : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

const NOMINALE = (posts: readonly unknown[] = [postServi()], stories: readonly unknown[] = []) =>
  passerelle({
    '/auth/me': () => json({ success: true, data: { id: 'u-moi', displayName: 'Moi', systemLanguage: 'fr' } }),
    'scope=stories': () => json({ success: true, data: stories }),
    'scope=home': () => json({ success: true, data: posts, pagination: { hasMore: false } }),
  });

describe('la porte de /feed — GET', () => {
  it('renvoie /login SANS rien demander à la passerelle quand il n’y a pas de jeton', async () => {
    const bouchon = NOMINALE();

    const reponse = await FIL_SOCIAL_SERVI(requete('/feed', { avecJeton: false }), bouchon.recuperer);

    expect(bouchon.vus).toEqual([]);
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Ffeed');
  });

  it('rend le rail de stories et les posts, chacun dans la langue servie', async () => {
    const bouchon = NOMINALE(
      [postServi()],
      [{ id: 's1', authorId: 'u-marta', author: { displayName: 'Marta Ruiz' } }],
    );

    const html = await (await FIL_SOCIAL_SERVI(requete('/feed'), bouchon.recuperer)).text();

    expect(html).toContain('Marta Ruiz');
    expect(html).toContain('La revue de mars est prête.');
    expect(html).toContain('128');
    expect(html).toContain('12');
    expect(html).toContain('4');
  });

  it('rend l’état vide plutôt qu’une liste nue', async () => {
    const bouchon = NOMINALE([]);

    const html = await (await FIL_SOCIAL_SERVI(requete('/feed'), bouchon.recuperer)).text();

    expect(html).toContain('Aucune publication');
  });

  it('renvoie /login sur une session expirée (401)', async () => {
    const bouchon = passerelle({ '/auth/me': () => json({ success: false }, 401) });

    const reponse = await FIL_SOCIAL_SERVI(requete('/feed'), bouchon.recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Ffeed');
  });

  it('dessine la panne quand la passerelle se tait', async () => {
    const reponse = await FIL_SOCIAL_SERVI(requete('/feed'), async () => {
      throw new Error('réseau coupé');
    });

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  it('reflète `?fait=` et `?refus=` dans la région aria-live', async () => {
    const bouchon = NOMINALE();

    const html = await (await FIL_SOCIAL_SERVI(requete('/feed?fait=repost'), bouchon.recuperer)).text();
    expect(html).toContain('Publication repartagée.');

    const bouchon2 = NOMINALE();
    const html2 = await (await FIL_SOCIAL_SERVI(requete('/feed?refus=1'), bouchon2.recuperer)).text();
    expect(html2).toContain('Ce geste n’a pas pu être envoyé');
  });
});

describe('la porte de /feed — POST (aimer, reposter)', () => {
  it('refuse une origine étrangère', async () => {
    const bouchon = NOMINALE();

    const reponse = await GESTE_SUR_UN_POST(
      posteRequete('/feed', { post: 'post-1', geste: 'aime' }, { origine: 'https://mechant.test' }),
      bouchon.recuperer,
    );

    expect(reponse.status).toBeGreaterThanOrEqual(400);
    expect(bouchon.vus.some((url) => url.includes('/like'))).toBe(false);
  });

  it('appelle POST …/like sur `geste=aime`, puis redirige avec `?fait=aime` VERS L’ANCRE du post (défaut #11 : la place se perdait au rechargement)', async () => {
    const bouchon = passerelle({ '/post-1/like': () => json({ success: true }) });

    const reponse = await GESTE_SUR_UN_POST(posteRequete('/feed', { post: 'post-1', geste: 'aime' }), bouchon.recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/feed?fait=aime#post-post-1');
  });

  it('appelle DELETE …/like sur `geste=retirer-aime`, puis redirige avec `?fait=aime-retire` vers l’ancre', async () => {
    const bouchon = passerelle({ '/post-1/like': () => json({ success: true }) });

    const reponse = await GESTE_SUR_UN_POST(
      posteRequete('/feed', { post: 'post-1', geste: 'retirer-aime' }),
      bouchon.recuperer,
    );

    expect(reponse.headers.get('location')).toBe('/feed?fait=aime-retire#post-post-1');
  });

  it('appelle POST …/repost sur `geste=repost`, puis redirige avec `?fait=repost` vers l’ancre', async () => {
    const bouchon = passerelle({ '/post-1/repost': () => json({ success: true }) });

    const reponse = await GESTE_SUR_UN_POST(posteRequete('/feed', { post: 'post-1', geste: 'repost' }), bouchon.recuperer);

    expect(reponse.headers.get('location')).toBe('/feed?fait=repost#post-post-1');
  });

  it('redirige avec `?refus=1` vers l’ancre quand la passerelle refuse le geste', async () => {
    const bouchon = passerelle({ '/post-1/repost': () => json({ success: false, error: 'ALREADY_REPOSTED' }, 409) });

    const reponse = await GESTE_SUR_UN_POST(posteRequete('/feed', { post: 'post-1', geste: 'repost' }), bouchon.recuperer);

    expect(reponse.headers.get('location')).toBe('/feed?refus=1#post-post-1');
  });

  it('renvoie /login sur un jeton expiré (401)', async () => {
    const bouchon = passerelle({ '/post-1/like': () => json({ success: false }, 401) });

    const reponse = await GESTE_SUR_UN_POST(posteRequete('/feed', { post: 'post-1', geste: 'aime' }), bouchon.recuperer);

    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Ffeed');
  });

  it('ne fait AUCUN appel sur un `post` absent ou un geste hors vocabulaire', async () => {
    const bouchon = NOMINALE();

    const reponse = await GESTE_SUR_UN_POST(posteRequete('/feed', { geste: 'aime' }), bouchon.recuperer);
    expect(bouchon.vus).toEqual([]);
    expect(reponse.headers.get('location')).toBe('/feed');

    const reponse2 = await GESTE_SUR_UN_POST(
      posteRequete('/feed', { post: 'post-1', geste: 'supprimer' }),
      bouchon.recuperer,
    );
    expect(bouchon.vus).toEqual([]);
    expect(reponse2.headers.get('location')).toBe('/feed');
  });
});
