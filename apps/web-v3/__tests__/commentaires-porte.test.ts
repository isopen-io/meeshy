/**
 * @jest-environment node
 */

import { COMMENTAIRES_SERVIS } from '@/app/connecte/commentaires-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE de `/post/:id` et l'écran qu'elle
 * rend.
 *
 * Six gardent des choses qu'aucune lecture distraite du HTML n'attraperait :
 *
 *   - sans jeton, la porte n'appelle RIEN. Les trois routes sont en
 *     `requiredAuth` : rien du contenu ne doit partir avant la connexion, et
 *     un appel qui serait refusé n'a pas à être fait ;
 *   - l'invitation n'est pas une redirection sèche : le lecteur qui ouvre un
 *     lien reçu doit savoir CE QU'IL OUVRE, et `?returnUrl=` le ramène ;
 *   - un `404` est INTROUVABLE, jamais une panne — c'est le refus que la
 *     passerelle sert pour une publication hors audience, délibérément
 *     indiscernable d'une publication absente ;
 *   - le `lang=` est posé sur ce qui est TRADUIT, et pas ailleurs ;
 *   - « Modifier · Supprimer » n'est pas dans le document du commentaire d'un
 *     autre — pas caché : ABSENT ;
 *   - un STATUS ne s'ouvre pas ici.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const MOI = 'u-moi';

const requete = (url: string, avecJeton = true): Request =>
  new Request(url, avecJeton ? { headers: { cookie: COOKIE } } : {});

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const carte = (paires: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(paires).map(([code, text]) => [code, { text, translationModel: 'nllb-200' }]),
  );

const publicationServie = (extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  type: 'POST',
  title: 'Revue de mars',
  content: 'The March review is ready.',
  originalLanguage: 'en',
  translations: carte({ fr: 'La revue de mars est prête.' }),
  createdAt: '2026-09-02T18:00:00.000Z',
  author: { id: 'u-ibrahim', displayName: 'Ibrahim' },
  ...extra,
});

const commentaireServi = (extra: Record<string, unknown> = {}) => ({
  id: 'k1',
  content: 'Are the Q1 numbers up to date?',
  originalLanguage: 'en',
  translations: carte({ es: '¿Están actualizadas las cifras del Q1?' }),
  likeCount: 4,
  replyCount: 0,
  createdAt: '2026-09-02T20:00:00.000Z',
  author: { id: 'u-marta', displayName: 'Marta Ruiz' },
  ...extra,
});

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    // L'ORDRE compte : `/posts/p1/comments` avant `/posts/p1`, comme Fastify
    // fait gagner le chemin le plus précis.
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

const NOMINALE = (
  publication: unknown = publicationServie(),
  commentaires: readonly unknown[] = [commentaireServi()],
) =>
  passerelle({
    '/auth/me': () =>
      json({ success: true, data: { id: MOI, displayName: 'Moi', systemLanguage: 'fr', regionalLanguage: 'es' } }),
    '/comments': () =>
      json({ success: true, data: commentaires, pagination: { limit: 30, hasMore: false } }),
    '/api/v1/posts/': () => json({ success: true, data: publication }),
  });

const sert = async (url: string, bouchon = NOMINALE(), avecJeton = true): Promise<Response> =>
  COMMENTAIRES_SERVIS({
    requete: requete(url, avecJeton),
    id: new URL(url).pathname.split('/').pop() ?? 'p1',
    recuperer: bouchon.recuperer,
  });

describe('la porte de /post/:id', () => {
  it('invite SANS rien demander à la passerelle quand il n’y a pas de jeton', async () => {
    const bouchon = NOMINALE();

    const reponse = await sert('https://meeshy.test/post/p1', bouchon, false);
    const html = await reponse.text();

    // Les trois routes sont en `requiredAuth` : un appel qui serait refusé n'a
    // pas à être fait, et rien du contenu ne part avant la connexion.
    expect(bouchon.vus).toEqual([]);
    expect(reponse.status).toBe(200);
    expect(html).toContain('Connectez-vous pour lire cette publication');
    // Le lien reçu ramène là où il menait.
    expect(html).toContain('/login?returnUrl=%2Fpost%2Fp1');
    // Rien du contenu ne doit avoir fuité dans l'invitation.
    expect(html).not.toContain('Revue de mars');
  });

  it('rend la publication et son fil, chacun dans la langue servie', async () => {
    const html = await (await sert('https://meeshy.test/post/p1')).text();

    // Le post : rang 1 du prisme du lecteur (fr).
    expect(html).toContain('La revue de mars est prête.');
    // Le commentaire : rang 1 (fr) ABSENT, rang 2 (es) servi — le cas du
    // cycle 120, et le seul rang sur lequel un témoin peut tomber.
    expect(html).toContain('¿Están actualizadas las cifras del Q1?');
    expect(html).toContain('Marta Ruiz');
  });

  it('pose `lang=` sur ce qui est TRADUIT, et sur l’original déplié', async () => {
    const html = await (await sert('https://meeshy.test/post/p1')).text();

    // Le texte servi porte SA langue…
    expect(html).toContain('lang="fr"');
    expect(html).toContain('lang="es"');
    // …et l'original déplié porte la sienne, qui n'est pas la même.
    expect(html).toContain('lang="en"');
    // La ligne du Prisme le DIT en toutes lettres, pas en code ISO.
    expect(html).toContain('traduit de l’anglais');
  });

  it('ne pose AUCUN `lang=` sur un texte non traduit', async () => {
    const html = await (
      await sert(
        'https://meeshy.test/post/p1',
        NOMINALE(publicationServie({ translations: {}, originalLanguage: 'fr' }), [
          commentaireServi({ translations: {}, originalLanguage: 'fr' }),
        ]),
      )
    ).text();

    // Poser un `lang=` sur un texte dans sa langue serait une affirmation que
    // rien n'appuie — et la ligne du Prisme annoncerait une traduction qui n'a
    // pas eu lieu.
    //
    // On vise le NŒUD, pas la chaîne : le document porte `<html lang="fr">`,
    // et une assertion large serait rouge pour la mauvaise raison — celle-là
    // même qui l'a fait tomber ici la première fois.
    expect(html).not.toContain('class="texte" lang=');
    expect(html).not.toContain('traduit de');
  });

  it('n’offre « Modifier · Supprimer » que sur MES commentaires — absents, pas cachés', async () => {
    const html = await (
      await sert(
        'https://meeshy.test/post/p1',
        NOMINALE(publicationServie(), [
          commentaireServi({ id: 'k-autre' }),
          commentaireServi({ id: 'k-moi', author: { id: MOI, displayName: 'Moi' } }),
        ]),
      )
    ).text();

    // UNE seule fois chacun, sur le mien — et c'est TOUT ce qu'il faut
    // prouver : un `display:none` laisserait deux occurrences dans le
    // document, atteignables au clavier et lues par un lecteur d'écran. Le
    // compte les attrape ; chercher `display:none` dans le document ENTIER
    // n'attraperait que la feuille de style, qui en porte légitimement (le
    // marqueur natif d'un `<details>`, entre autres).
    expect(html.match(/Supprimer/g)).toHaveLength(1);
    expect(html.match(/Modifier/g)).toHaveLength(1);
  });

  it.each(['POST', 'REEL', 'STORY'])('ouvre un %s, et dit lequel', async (type) => {
    const html = await (
      await sert('https://meeshy.test/post/p1', NOMINALE(publicationServie({ type })))
    ).text();

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('La revue de mars est prête.');
  });

  it('refuse un STATUS — INTROUVABLE, jamais une panne', async () => {
    const reponse = await sert(
      'https://meeshy.test/post/p1',
      NOMINALE(publicationServie({ type: 'STATUS' })),
    );

    expect(reponse.status).toBe(404);
    expect(await reponse.text()).toContain('n’est plus là');
  });

  it('rend INTROUVABLE sur 404, et le dit sans lever l’ambiguïté', async () => {
    const bouchon = passerelle({
      '/auth/me': () => json({ success: true, data: { id: MOI, systemLanguage: 'fr' } }),
      '/comments': () => json({ success: false }, 404),
      '/api/v1/posts/': () => json({ success: false }, 404),
    });

    const reponse = await sert('https://meeshy.test/post/p1', bouchon);
    const html = await reponse.text();

    expect(reponse.status).toBe(404);
    // « supprimée, ou pas partagée avec vous ; les deux se ressemblent, et
    // c'est voulu » — l'écran ne défait pas côté client ce que la passerelle
    // a délibérément rendu indiscernable.
    expect(html).toContain('n’est plus là');
    expect(html).toContain('Les deux se ressemblent');
  });

  it('invite à nouveau quand la passerelle refuse le jeton (401)', async () => {
    const bouchon = passerelle({
      '/auth/me': () => json({ success: false }, 401),
    });

    const html = await (await sert('https://meeshy.test/post/p1', bouchon)).text();

    // Un 401 renvoie à l'invitation, jamais à une page d'erreur : c'est le cas
    // NOMINAL d'un retour après quelques jours.
    expect(html).toContain('Connectez-vous pour lire cette publication');
  });

  it('dessine la panne quand la passerelle se tait', async () => {
    const reponse = await COMMENTAIRES_SERVIS({
      requete: requete('https://meeshy.test/post/p1'),
      id: 'p1',
      recuperer: async () => {
        throw new Error('réseau coupé');
      },
    });

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  it('honore `?lang=` sur la publication sans l’imposer au fil', async () => {
    const html = await (
      await sert(
        'https://meeshy.test/post/p1?lang=es',
        NOMINALE(
          publicationServie({
            translations: carte({
              fr: 'La revue de mars est prête.',
              es: 'La revisión de marzo está lista.',
            }),
          }),
          [commentaireServi({ translations: carte({ fr: 'À jour ?' }) })],
        ),
      )
    ).text();

    // La publication suit le geste…
    expect(html).toContain('La revisión de marzo está lista.');
    // …le fil suit le Prisme du lecteur. Imposer la langue d'un geste à trente
    // commentaires masquerait ceux qu'elle ne traduit pas.
    expect(html).toContain('À jour ?');
  });

  it('dessine l’état vide plutôt qu’une liste nue', async () => {
    const html = await (
      await sert('https://meeshy.test/post/p1', NOMINALE(publicationServie(), []))
    ).text();

    expect(html).toContain('Aucun commentaire');
    // La publication reste lisible : c'est elle qu'on est venu lire.
    expect(html).toContain('La revue de mars est prête.');
  });
});
