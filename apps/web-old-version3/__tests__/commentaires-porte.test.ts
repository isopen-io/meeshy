/**
 * @jest-environment node
 */

import { COMMENTAIRE_POSTE, COMMENTAIRES_SERVIS } from '@/app/connecte/commentaires-porte';

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


  /**
   * LE CHOIX DE LA LANGUE — `sheet:lang`, et ce qu'il est devenu.
   *
   * La matrice le dessine en `<dialog>` natif, « ouvrable au clavier et
   * fermable par Échap ». Un `<dialog>` ne s'OUVRE que par `showModal()` :
   * c'est du JavaScript, sur des écrans que le budget gate à 0 Ko. La forme
   * retenue est celle que la story sert déjà — un `<details>` natif, un lien
   * par langue —, qui tient le critère qui COMPTE : « choisir une langue MUTE
   * le texte rendu ». Elle est de plus opérable au clavier sans une ligne de
   * script, et le retour arrière du navigateur y annule le choix.
   *
   * Le critère « la langue élue passe par `resolvePrismTranslation()`, jamais
   * par un lookup rang-1 » est tenu par la porte, éprouvée plus haut : `?lang=`
   * y est un GESTE sur la publication, pas un réglage, et il ne descend pas au
   * fil.
   */
  it('offre une langue par traduction PORTÉE, et dit laquelle est lue', async () => {
    const html = await (
      await sert(
        'https://meeshy.test/post/p1',
        NOMINALE(
          publicationServie({
            translations: carte({
              fr: 'La revue de mars est prête.',
              es: 'La revisión de marzo está lista.',
            }),
          }),
        ),
      )
    ).text();

    // Les trois langues que la publication porte RÉELLEMENT : son original et
    // ses deux traductions. Pas une de plus — offrir une langue qu'aucun texte
    // ne porte serait un contrôle sans effet (charte règle 7).
    expect(html).toContain('href="/post/p1?lang=en"');
    expect(html).toContain('href="/post/p1?lang=fr"');
    expect(html).toContain('href="/post/p1?lang=es"');
    // Celle qui est LUE se dit — sinon le choix se fait à l'aveugle.
    expect(html).toContain('aria-current="true"');
  });

  it('n’offre AUCUN choix quand la publication ne porte qu’une langue', async () => {
    const html = await (
      await sert(
        'https://meeshy.test/post/p1',
        NOMINALE(publicationServie({ translations: {}, originalLanguage: 'fr' })),
      )
    ).text();

    // Un sélecteur à une entrée est un contrôle qui ne change rien : il n'est
    // pas rendu, pas grisé.
    expect(html).not.toContain('class="langues"');
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

describe('le POST de /post/:id — écrire, en Post/Redirect/Get (#5091)', () => {
  const posteur = (contenu: string, avecJeton = true): Request =>
    new Request('https://meeshy.test/post/p1', {
      method: 'POST',
      headers: {
        ...(avecJeton ? { cookie: COOKIE } : {}),
        origin: 'https://meeshy.test',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ contenu }),
    });

  it('poste le contenu à la passerelle et redirige — ?commente porte le compte rendu', async () => {
    const { recuperer, vus } = passerelle({
      '/posts/p1/comments': () => json({ success: true, data: { id: 'k-neuf' } }),
    });

    const reponse = await COMMENTAIRE_POSTE({ requete: posteur('Très bel endroit'), id: 'p1', recuperer });

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/post/p1?commente');
    const envoi = vus.find((appel) => appel.includes('/posts/p1/comments'));
    expect(envoi).toBeDefined();
  });

  it('refuse un contenu VIDE sans appeler la passerelle — un geste sans dire', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await COMMENTAIRE_POSTE({ requete: posteur('   '), id: 'p1', recuperer });
    const html = await reponse.text();

    expect(vus.filter((appel) => appel.includes('/comments') && !appel.includes('?'))).toEqual([]);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Écrivez quelque chose');
  });

  it('un refus de la passerelle re-sert l’écran, saisie TENUE et motif dit', async () => {
    // Le harnais ne voit pas la MÉTHODE : le GET de la re-serve se distingue
    // par sa chaîne de requête (`?limit`), servi AVANT la clé du POST.
    const { recuperer } = passerelle({
      '/auth/me': () =>
        json({ success: true, data: { id: MOI, displayName: 'Moi', systemLanguage: 'fr', regionalLanguage: 'es' } }),
      '/comments?': () => json({ success: true, data: [commentaireServi()], pagination: { limit: 30, hasMore: false } }),
      '/posts/p1/comments': () => json({ success: false, error: { message: 'fermé' } }, 403),
      '/api/v1/posts/': () => json({ success: true, data: publicationServie() }),
    });

    const reponse = await COMMENTAIRE_POSTE({ requete: posteur('Un texte précieux'), id: 'p1', recuperer });
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(html).toContain('Un texte précieux');
    expect(html).toContain('role="alert"');
  });

  it('un POST sans jeton reçoit l’invitation — rien ne part vers la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await COMMENTAIRE_POSTE({ requete: posteur('Coucou', false), id: 'p1', recuperer });

    expect(vus).toEqual([]);
    expect(await reponse.text()).toContain('returnUrl');
  });

  it('un POST d’origine ÉTRANGÈRE est refusé avant tout', async () => {
    const { recuperer, vus } = NOMINALE();
    const etranger = new Request('https://meeshy.test/post/p1', {
      method: 'POST',
      headers: { cookie: COOKIE, origin: 'https://voleur.test', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ contenu: 'x' }),
    });

    const reponse = await COMMENTAIRE_POSTE({ requete: etranger, id: 'p1', recuperer });

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('au retour de la redirection, le GET dit « publié » et sert le formulaire', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await COMMENTAIRES_SERVIS({
      requete: requete('https://meeshy.test/post/p1?commente'),
      id: 'p1',
      recuperer,
    });
    const html = await reponse.text();

    expect(html).toContain('role="status"');
    expect(html).toContain('Commentaire publié');
    expect(html).toContain('name="contenu"');
  });
});

