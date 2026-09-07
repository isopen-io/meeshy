/**
 * @jest-environment node
 */

import { LIS_LE_FIL_DES_REELS, versLeReelSuivant } from '@/app/connecte/reels-porte';
import { REELS_DU_FIL } from '@/lib/contenu/reels';

/**
 * LA PORTE DE `/feed/reels` (#5032) — ce qu'elle SERT, opposé à un serveur
 * cousu plutôt qu'à un serveur lancé.
 *
 * `/feed/reels` EST UN ÉCRAN DE MEMBRE, pas l'entrée d'un lien partagé : sans
 * jeton elle renvoie `/login?returnUrl=/feed/reels`, la même loi que `/feed` et
 * `/contacts` — jamais l'invitation inline de `/reels/:id`, qui n'a de sens que
 * sur une adresse reçue EN DEHORS d'un compte.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const ORIGINE = 'https://meeshy.test';

const requete = (chemin: string, avecJeton = true): Request =>
  new Request(`${ORIGINE}${chemin}`, { headers: avecJeton ? { cookie: COOKIE } : {} });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const carte = (paires: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(paires).map(([code, text]) => [code, { text, translationModel: 'nllb-200' }]));

const LECTRICE = {
  id: 'u-amina',
  username: 'amina',
  displayName: 'Amina Diallo',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
};

const reelServi = (extra: Record<string, unknown> = {}) => ({
  id: 'reel-1',
  type: 'REEL',
  content: 'Nuevo glosario compartido.',
  originalLanguage: 'es',
  translations: carte({ fr: 'Le nouveau glossaire partagé.' }),
  createdAt: '2026-09-02T18:00:00.000Z',
  authorId: 'u-marta',
  author: { id: 'u-marta', username: 'marta', displayName: 'Marta Ruiz' },
  media: [],
  isLikedByMe: false,
  ...extra,
});

/**
 * LE SERVEUR COUSU. Il rend `/auth/me` puis `/social/posts` — et il RETIENT les
 * adresses demandées : ce que la porte n'appelle PAS est aussi un fait
 * (le curseur transmis, l'absence de second aller-retour pour charger le réel).
 */
const serveur = (
  reels: { readonly data: readonly unknown[]; readonly hasMore: boolean; readonly nextCursor: string | null },
  options: { readonly statutDesReels?: number } = {},
) => {
  const appels: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    appels.push(url);
    if (url.includes('/auth/me')) return json({ success: true, data: LECTRICE });
    if (url.includes('/social/posts')) {
      if (options.statutDesReels !== undefined && options.statutDesReels !== 200) {
        return json({ success: false }, options.statutDesReels);
      }
      return json({
        success: true,
        data: reels.data,
        pagination: { limit: 1, hasMore: reels.hasMore, nextCursor: reels.nextCursor },
      });
    }
    throw new Error(`appel non prévu : ${url}`);
  };
  return { appels, recuperer };
};

describe('la porte de /feed/reels', () => {
  it('renvoie vers la connexion sans jeton, et n’appelle RIEN', async () => {
    const { appels, recuperer } = serveur({ data: [], hasMore: false, nextCursor: null });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels', false), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Ffeed%2Freels');
    expect(appels).toEqual([]);
  });

  /**
   * LE PRISME, DESCENDU PAR LE LECTEUR UNIQUE. La lectrice est francophone, le
   * réel est espagnol et porte sa traduction française : le document sert le
   * FRANÇAIS et ANNONCE d'où il vient. Les deux moitiés sont exigées — un
   * document qui servirait le texte sans le dire serait la surface qui
   * « AFFIRME une langue qu'elle ne sert pas », à l'envers (cycle 123).
   */
  it('sert le texte au Prisme du lecteur, et annonce la langue d’origine', async () => {
    const { recuperer } = serveur({ data: [reelServi()], hasMore: false, nextCursor: null });
    const html = await (await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer)).text();

    expect(html).toContain('Le nouveau glossaire partagé.');
    expect(html).not.toContain('Nuevo glosario compartido.');
    expect(html).toContain('Traduit de l’espagnol');
  });

  /**
   * UN SEUL ALLER-RETOUR POUR LE RÉEL. `feedPostInclude = postInclude` : la
   * ligne du fil est déjà la ligne entière, donc la porte ne recharge PAS le
   * réel par `GET /posts/:id`. Ce témoin garde le coût, pas seulement le
   * rendu — c'est la latence que paie une 3G rurale.
   */
  it('ne recharge pas le réel : deux appels, jamais trois', async () => {
    const { appels, recuperer } = serveur({ data: [reelServi()], hasMore: false, nextCursor: null });
    await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);

    expect(appels.filter((url) => url.includes('/posts/reel-1'))).toEqual([]);
    expect(appels).toHaveLength(2);
  });

  it('demande UN réel, et transmet le curseur de l’adresse', async () => {
    const { appels, recuperer } = serveur({ data: [reelServi()], hasMore: false, nextCursor: null });
    await LIS_LE_FIL_DES_REELS(requete('/feed/reels?cursor=apres-le-premier'), recuperer);

    const demande = appels.find((url) => url.includes('/social/posts')) ?? '';
    expect(demande).toContain('scope=reels');
    expect(demande).toContain('limit=1');
    expect(demande).toContain('cursor=apres-le-premier');
  });

  /**
   * LE PAS DU FIL. « Réel suivant » n'est rendu que si la passerelle dit qu'il
   * y en a un — et il pointe sur un CURSEUR, pas sur `/reels/<id>` : rester
   * dans le fil est ce qui distingue cette adresse de la lecture partagée.
   */
  it('rend le tap « suivant » vers le curseur servi', async () => {
    const { recuperer } = serveur({ data: [reelServi()], hasMore: true, nextCursor: 'apres-reel-1' });
    const html = await (await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer)).text();

    expect(html).toContain(`href="${versLeReelSuivant('apres-reel-1')}"`);
    expect(html).toContain('Réel suivant');
  });

  /**
   * ET IL NE LE REND PAS QUAND IL N'Y A NULLE PART OÙ ALLER (charte règle 7).
   * Sans ce second témoin, un tap rendu TOUJOURS resterait vert sur le premier.
   */
  it('ne rend aucun tap au bout de la file', async () => {
    const { recuperer } = serveur({ data: [reelServi()], hasMore: false, nextCursor: null });
    const html = await (await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer)).text();

    expect(html).not.toContain('class="tap');
  });

  /**
   * AUCUNE PRÉCÉDENTE, JAMAIS. Le curseur de la passerelle est forward-only :
   * il n'existe pas d'adresse « le réel d'avant », et un tap qui ne mènerait
   * nulle part serait le contrôle sans effet de la règle 7.
   */
  it('ne rend jamais de tap « précédent »', async () => {
    const { recuperer } = serveur({ data: [reelServi()], hasMore: true, nextCursor: 'apres-reel-1' });
    const html = await (await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer)).text();

    expect(html).not.toContain('tap precedente');
  });

  /** UNE SEULE VIDÉO PAR DOCUMENT — le critère de la matrice, tenu par construction. */
  it('ne rend qu’un seul média, quoi que le fil porte', async () => {
    const { recuperer } = serveur({
      data: [reelServi({ media: [{ fileUrl: 'https://cdn.test/a.mp4', mimeType: 'video/mp4' }] })],
      hasMore: true,
      nextCursor: 'apres-reel-1',
    });
    const html = await (await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer)).text();

    expect(html.match(/<video/g) ?? []).toHaveLength(1);
  });

  /** L'ÉTAT VIDE EST DESSINÉ (règle 18) — 200, pas 404 : rien à découvrir n'est pas une erreur. */
  it('dessine l’état vide quand le fil ne rend aucun réel', async () => {
    const { recuperer } = serveur({ data: [], hasMore: false, nextCursor: null });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(html).toContain(REELS_DU_FIL.videTitre);
    expect(html).toContain('href="/feed"');
  });

  /** UNE LIGNE QUI N'EST PAS UN RÉEL ne se rend pas à moitié. */
  it('rend l’indisponible quand la ligne servie n’est pas un réel', async () => {
    const { recuperer } = serveur({ data: [reelServi({ type: 'POST' })], hasMore: false, nextCursor: null });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);

    expect(reponse.status).toBe(404);
  });

  it('dessine la panne quand la passerelle ne répond pas', async () => {
    const { recuperer } = serveur({ data: [], hasMore: false, nextCursor: null }, { statutDesReels: 500 });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);

    expect(reponse.status).toBe(503);
  });

  it('renvoie à la connexion quand la session a expiré', async () => {
    const { recuperer } = serveur({ data: [], hasMore: false, nextCursor: null }, { statutDesReels: 401 });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Ffeed%2Freels');
  });

  /** LE DOCUMENT EST PRIVÉ — il porte les réels servis à UNE personne. */
  it('sert un document privé et non indexé', async () => {
    const { recuperer } = serveur({ data: [reelServi()], hasMore: false, nextCursor: null });
    const reponse = await LIS_LE_FIL_DES_REELS(requete('/feed/reels'), recuperer);

    expect(reponse.headers.get('cache-control')).toContain('private');
    expect(reponse.headers.get('x-robots-tag')).toContain('noindex');
  });
});
