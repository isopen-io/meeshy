/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { CONNEXION, INSCRIPTION } from '@/app/authentification/contenu';
import { porteDe, PORTE_DE_CONNEXION, PORTE_D_INSCRIPTION } from '@/app/authentification/porte';
import {
  CLES,
  CLES_DEUXIEME_FACTEUR,
  COOKIE_DE_SESSION,
  ROLES_ADMIN,
  destination,
} from '@/app/authentification/remise';
import { GET as RACINE } from '@/app/route';
import { catalogueDesPays } from '@/lib/contenu/pays';
import { connexion, inscription, type Issue } from '@/lib/api/authentification';

/**
 * **La connexion et l'inscription se font SANS JavaScript, et la session est
 * remise au navigateur dans la langue que l'application legacy parle.**
 *
 * Les deux moitiés sont gardées ici : ce que le lecteur reçoit (un formulaire
 * réel, un message d'erreur qui ne renseigne pas un attaquant, une saisie qui
 * survit à un refus) et ce que le navigateur exécute (les clés exactes, le
 * cookie exact, une destination qui ne peut pas sortir de l'origine).
 */

const requete = (url: string, corps?: Record<string, string>): Request =>
  corps === undefined
    ? new Request(url)
    : new Request(url, {
        method: 'POST',
        body: new URLSearchParams(corps),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });

const UTILISATEUR = { id: 'u1', username: 'atabeth', role: 'USER', displayName: 'A' };

const porteQuiRend = (issue: Issue) => porteDe(CONNEXION, async () => issue);

describe('la provenance d’un formulaire d’accès (app/provenance.ts)', () => {
  it.each([
    ['/login', CONNEXION],
    ['/signup', INSCRIPTION],
  ])('%s refuse 403 un formulaire venu d’un autre site, sans le soumettre', async (chemin, ecran) => {
    let soumis = 0;
    const porte = porteDe(ecran, async () => {
      soumis += 1;
      return { genre: 'session', session: { jeton: 'JWT.abc', jetonDeSession: 'sess-1', utilisateur: UTILISATEUR } };
    });
    const reponse = await porte.POST(
      new Request(`https://meeshy.me${chemin}`, {
        method: 'POST',
        body: new URLSearchParams({ identifiant: 'a', motDePasse: 'b', prenom: 'p', nom: 'n', courriel: 'c@d.e' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      }),
    );
    expect(reponse.status).toBe(403);
    expect(soumis).toBe(0);
    expect(reponse.headers.get('set-cookie')).toBeNull();
  });

  it('laisse passer le formulaire de Meeshy', async () => {
    const porte = porteDe(CONNEXION, async () => ({ genre: 'session', session: { jeton: 'JWT.abc', jetonDeSession: 'sess-1', utilisateur: UTILISATEUR } }));
    const reponse = await porte.POST(
      new Request('https://meeshy.me/login', {
        method: 'POST',
        body: new URLSearchParams({ identifiant: 'a', motDePasse: 'b' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://meeshy.me', 'sec-fetch-site': 'same-origin' },
      }),
    );
    expect(reponse.status).not.toBe(403);
  });
});

const SESSION: Issue = {
  genre: 'session',
  session: { jeton: 'JWT.abc', jetonDeSession: 'sess-1', utilisateur: UTILISATEUR },
};

describe('les deux écrans d’accès', () => {
  // MARK: — le formulaire est un vrai formulaire

  it.each([
    ['/login', CONNEXION],
    ['/signup', INSCRIPTION],
  ])('%s sert un <form method="post"> et pas une ligne de JavaScript applicatif', async (chemin, ecran) => {
    const porte = porteDe(ecran, async () => SESSION);
    const doc = await porte.GET(requete(`https://meeshy.me${chemin}`)).text();

    expect(doc).toContain(`<form method="post" action="${chemin}"`);
    // Le seul <script> est le moteur de thème, comme sur toute page de la v3.
    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc).toContain('meeshy-theme');

    for (const { nom, libelle, autocomplete } of ecran.champs) {
      expect(doc).toContain(`name="${nom}"`);
      expect(doc).toContain(`autocomplete="${autocomplete}"`);
      expect(doc).toContain(`for="champ-${nom}"`);
      expect(doc).toContain(libelle.replace(/'/g, '&#39;').replace(/’/g, '’'));
    }
  });

  it('ne met jamais un écran d’accès en cache ni dans un index', async () => {
    const reponse = PORTE_DE_CONNEXION.GET(requete('https://meeshy.me/login'));
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
    expect(reponse.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  // MARK: — un refus garde la saisie, et ne renseigne personne

  it('rend le formulaire À NOUVEAU après un refus, avec la saisie — jamais le mot de passe', async () => {
    const porte = porteQuiRend({
      genre: 'refus',
      message: 'Identifiant ou mot de passe incorrect.',
      champ: null,
      recours: null,
    });
    const reponse = await porte.POST(
      requete('https://meeshy.me/login', { identifiant: 'atabeth', motDePasse: 'secret-42' }),
    );
    const doc = await reponse.text();

    expect(reponse.status).toBe(400);
    expect(doc).toContain('role="alert"');
    expect(doc).toContain('Identifiant ou mot de passe incorrect.');
    expect(doc).toContain('value="atabeth"');
    expect(doc).not.toContain('secret-42');
  });

  /**
   * La passerelle DISTINGUE « utilisateur inconnu » de « mot de passe faux ».
   * Les reporter distinguerait pour qui balaie des identifiants — le témoin
   * pousse les deux refus et exige la MÊME phrase.
   */
  it('dit la même chose d’un compte inconnu et d’un mot de passe faux', async () => {
    const refus = async (message: string) =>
      (
        await porteQuiRend({ genre: 'refus', message, champ: null, recours: null }).POST(
          requete('https://meeshy.me/login', { identifiant: 'a', motDePasse: 'b' }),
        )
      ).text();

    // LA SONDE PORTE UN MESSAGE, et c'est tout le témoin. Sans lui, « taire le
    // serveur » et « relayer le serveur » rendent le MÊME verdict — ce qui a
    // laissé passer un relais réel : la passerelle de staging répond
    // « Identifiants invalides », et la v3 l'affichait.
    const refusDuServeur = async (corps: unknown) =>
      connexion({
        identifiant: 'a',
        motDePasse: 'b',
        base: 'https://gate.test',
        recuperer: async () => new Response(JSON.stringify(corps), { status: 401 }),
      });

    expect(
      await refusDuServeur({ success: false, error: { message: 'Utilisateur introuvable' } }),
    ).toEqual({
      genre: 'refus',
      message: 'Identifiant ou mot de passe incorrect.',
      champ: null,
      recours: null,
    });

    expect(
      await refusDuServeur({ success: false, error: { message: 'Mot de passe invalide' } }),
    ).toEqual({
      genre: 'refus',
      message: 'Identifiant ou mot de passe incorrect.',
      champ: null,
      recours: null,
    });
    expect(await refus('Identifiant ou mot de passe incorrect.')).toContain(
      'Identifiant ou mot de passe incorrect.',
    );
  });

  it('refuse une soumission incomplète sans appeler la passerelle', async () => {
    const appels: string[] = [];
    const porte = porteDe(CONNEXION, async () => {
      appels.push('appelée');
      return SESSION;
    });
    const reponse = await porte.POST(
      requete('https://meeshy.me/login', { identifiant: '  ', motDePasse: 'x' }),
    );

    expect(reponse.status).toBe(400);
    expect(appels).toEqual([]);
    expect(await reponse.text()).toContain('Tous les champs sont requis');
  });

  // MARK: — la remise parle la langue du legacy

  it('remet la session dans les clés EXACTES que le legacy relit', async () => {
    const reponse = await porteQuiRend(SESSION).POST(
      requete('https://meeshy.me/login', { identifiant: 'atabeth', motDePasse: 'x' }),
    );
    const doc = await reponse.text();

    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
    expect(doc).toContain(`localStorage.setItem("${CLES.jeton}","JWT.abc")`);
    expect(doc).toContain(`localStorage.setItem("${CLES.jetonDeSession}","sess-1")`);
    expect(doc).toContain(`localStorage.setItem("${CLES.utilisateur}"`);
    expect(doc).toContain(COOKIE_DE_SESSION);
    expect(doc).toContain('location.replace("/")');
  });

  it('remet l’étape de vérification en sessionStorage, et n’ouvre AUCUNE session', async () => {
    const reponse = await porteQuiRend({
      genre: 'deuxieme-facteur',
      etape: { jetonTemporaire: 'tmp', identifiantUtilisateur: 'u1', pseudonyme: 'atabeth' },
    }).POST(requete('https://meeshy.me/login', { identifiant: 'a', motDePasse: 'b' }));
    const doc = await reponse.text();

    expect(doc).toContain(`sessionStorage.setItem("${CLES_DEUXIEME_FACTEUR.jetonTemporaire}","tmp")`);
    expect(doc).toContain(`sessionStorage.setItem("${CLES_DEUXIEME_FACTEUR.pseudonyme}","atabeth")`);
    expect(doc).toContain('location.replace("/auth/verify-2fa")');
    // Le cookie accorderait au middleware du legacy un compte qui n'a pas fini
    // de prouver qui il est.
    expect(doc).not.toContain(COOKIE_DE_SESSION);
  });

  /**
   * `returnUrl` vient de la barre d'adresse. Un `//hôte` ou un `https://…` y
   * enverrait le lecteur AILLEURS juste après qu'il a saisi son mot de passe,
   * sur une page qui a toute l'apparence de la nôtre.
   */
  it.each([
    ['//attaquant.example', '/'],
    ['https://attaquant.example/x', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/'],
    ['/conversations/42', '/conversations/42'],
  ])('ne sort jamais de l’origine : %s → %s', (retour, attendu) => {
    expect(destination(retour)).toBe(attendu);
  });

  it('honore un returnUrl interne, du champ caché comme de l’URL', async () => {
    const parLeChamp = await porteQuiRend(SESSION).POST(
      requete('https://meeshy.me/login', {
        identifiant: 'a',
        motDePasse: 'b',
        returnUrl: '/conversations/42',
      }),
    );
    expect(await parLeChamp.text()).toContain('location.replace("/conversations/42")');

    const doc = await PORTE_DE_CONNEXION.GET(
      requete('https://meeshy.me/login?returnUrl=%2Fconversations%2F42'),
    ).text();
    expect(doc).toContain('name="returnUrl" value="/conversations/42"');
  });

  /**
   * Le profil est recopié TEL QUEL dans `meeshy_user_data`. Un `</script>` dans
   * un nom d'affichage refermerait la balise et rendrait exécutable tout ce qui
   * suit — sur la page qui vient de recevoir un jeton porteur.
   */
  it('ne laisse pas un profil refermer la balise <script>', async () => {
    const reponse = await porteQuiRend({
      genre: 'session',
      session: {
        jeton: 'j',
        jetonDeSession: null,
        utilisateur: { id: 'u', role: 'USER', displayName: '</script><img src=x onerror=alert(1)>' },
      },
    }).POST(requete('https://meeshy.me/login', { identifiant: 'a', motDePasse: 'b' }));
    const doc = await reponse.text();

    expect(doc).not.toContain('</script><img');
    expect(doc).toContain('\\u003c');
    // Une seule balise ouvrante, une seule fermante : la sonde n'en a pas créé.
    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc.split('</script>').length - 1).toBe(1);
  });

  // MARK: — la racine sert le bon écran à chacun

  /**
   * LE COOKIE DE SESSION N'AUTORISE RIEN. Il DIT qu'il y a une session — donc
   * la racine sert la zone connectée — mais c'est le JETON qui ouvre les
   * données. Un descripteur sans jeton renvoie se connecter, avec le chemin
   * demandé pour y revenir : c'est ce qui arrive quand la session a expiré et
   * que seule sa trace subsiste.
   */
  it('renvoie vers la connexion quand le descripteur survit au jeton', async () => {
    const reponse = await RACINE(
      new Request('https://meeshy.me/', { headers: { cookie: `${COOKIE_DE_SESSION}=abc; autre=1` } }),
    );

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2F');
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
  });

  it.each([
    ['aucun cookie', undefined],
    ['un cookie VIDE — un reste de déconnexion', `${COOKIE_DE_SESSION}=`],
    ['un cookie voisin au nom proche', `${COOKIE_DE_SESSION}_autre=abc`],
  ])('sert la vitrine à un visiteur : %s', async (_cas, cookie) => {
    const reponse = await RACINE(
      new Request('https://meeshy.me/', cookie === undefined ? {} : { headers: { cookie } }),
    );

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('barrières linguistiques');
    // La vitrine servie ICI dépend d'un cookie : elle se REVALIDE, elle ne se
    // resert jamais sans demander. `no-store` faisait repayer 21 Ko à chaque
    // retour — sur l'écran même qui vante la légèreté en zone rurale.
    expect(reponse.headers.get('cache-control')).toBe('private, no-cache');
    expect(reponse.headers.get('etag')).toMatch(/^"[0-9a-f]{16,}"$/);
  });

  /**
   * LA SECONDE VISITE NE REPAIE PAS LE DOCUMENT.
   *
   * `no-store` interdisait au navigateur de GARDER la vitrine : retour arrière
   * depuis `/login`, seconde visite, reprise après coupure — 21 Ko à chaque
   * fois, sans validateur, donc sans 304 possible. Le document est STATIQUE par
   * processus : son étiquette se calcule une fois et se compare pour rien.
   *
   * `no-cache` n'est pas `no-store` : le navigateur garde l'entité et
   * REVALIDE — c'est ce qui rend l'économie compatible avec la correction, la
   * requête de revalidation repassant par le cookie.
   */
  it('rend 304 sans corps quand le visiteur revient avec l’étiquette qu’on lui a donnée', async () => {
    const premiere = await RACINE(new Request('https://meeshy.me/'));
    const etiquette = premiere.headers.get('etag');
    if (etiquette === null) throw new Error('la vitrine ne porte pas d’étiquette');

    const seconde = await RACINE(
      new Request('https://meeshy.me/', { headers: { 'if-none-match': etiquette } }),
    );

    expect(seconde.status).toBe(304);
    expect(await seconde.text()).toBe('');
    expect(seconde.headers.get('etag')).toBe(etiquette);
    expect(seconde.headers.get('cache-control')).toBe('private, no-cache');
  });

  /**
   * L'ÉTIQUETTE EST STABLE — sans quoi aucune revalidation n'aboutirait jamais,
   * et le 304 ci-dessus serait un accident du même appel.
   */
  it('sert la MÊME étiquette d’un appel à l’autre', async () => {
    const [a, b] = await Promise.all([
      RACINE(new Request('https://meeshy.me/')),
      RACINE(new Request('https://meeshy.me/')),
    ]);

    expect(a.headers.get('etag')).toBe(b.headers.get('etag'));
  });

  /**
   * LA CORRECTION PRIME SUR L'ÉCONOMIE. C'est l'objection d'origine à la mise en
   * cache de `/` — un lecteur qui vient de se connecter retombant sur « Créer un
   * compte » — et elle se tient : un descripteur de session fait BRANCHER avant
   * toute comparaison d'étiquette. Un 304 servi ici aurait resservi la vitrine à
   * un lecteur connecté.
   */
  it('ne rend jamais 304 à un lecteur qui porte un descripteur de session', async () => {
    const etiquette = (await RACINE(new Request('https://meeshy.me/'))).headers.get('etag');
    const reponse = await RACINE(
      new Request('https://meeshy.me/', {
        headers: { cookie: `${COOKIE_DE_SESSION}=abc`, 'if-none-match': etiquette ?? '' },
      }),
    );

    expect(reponse.status).toBe(302);
  });

  /**
   * `If-None-Match` est une LISTE, et un intermédiaire peut affaiblir
   * l'étiquette (`W/"…"`). Une comparaison par égalité stricte de l'en-tête
   * entier rendrait 200 sur les deux formes — c'est-à-dire une revalidation qui
   * n'économise jamais rien, indiscernable d'un cache qui marche.
   */
  it.each([
    ['une liste', (e: string) => `"autre-chose", ${e}`],
    ['une étiquette affaiblie', (e: string) => `W/${e}`],
  ])('reconnaît son étiquette dans %s', async (_cas, forme) => {
    const etiquette = (await RACINE(new Request('https://meeshy.me/'))).headers.get('etag');
    if (etiquette === null) throw new Error('la vitrine ne porte pas d’étiquette');

    const reponse = await RACINE(
      new Request('https://meeshy.me/', { headers: { 'if-none-match': forme(etiquette) } }),
    );

    expect(reponse.status).toBe(304);
  });

  // MARK: — les miroirs sont des miroirs

  /**
   * Ces sept valeurs sont RECOPIÉES du legacy : les trois clés de session, les
   * trois de vérification, et la liste des rôles qui ouvre `/admin` à son
   * middleware. Une v3 plus GÉNÉREUSE que le legacy sur cette liste ouvrirait
   * une porte à un rôle qui ne l'a pas — et une clé qui dérive rendrait la
   * connexion SILENCIEUSEMENT inopérante : la remise réussirait, l'application
   * ne trouverait rien.
   *
   * Le témoin lit les fichiers du legacy par CHEMIN, comme celui du catalogue
   * des pages institutionnelles, et pour la même raison : un test ne voyage pas
   * dans l'image.
   */
  it('recopie sans dériver les clés et les rôles du legacy', () => {
    const lis = (chemin: string): string =>
      readFileSync(join(__dirname, '..', '..', 'web', chemin), 'utf8');

    const constantes = lis('constants/auth.ts');
    for (const cle of [...Object.values(CLES), ...Object.values(CLES_DEUXIEME_FACTEUR)]) {
      expect(constantes).toContain(`'${cle}'`);
    }

    const gestionnaire = lis('services/auth-manager.service.ts');
    expect(gestionnaire).toContain(`meeshy_session=`);
    expect(gestionnaire).toContain(`[${ROLES_ADMIN.map((role) => `'${role}'`).join(', ')}]`);
  });
});

describe('les appels à la passerelle', () => {
  const reponseJson = (corps: unknown, statut = 200): Response =>
    new Response(JSON.stringify(corps), { status: statut });

  it('lit le contrat de succès : { success, data: { user, token } }', async () => {
    const issue = await connexion({
      identifiant: 'atabeth',
      motDePasse: 'x',
      base: 'https://gate.test',
      recuperer: async () =>
        reponseJson({ success: true, data: { user: UTILISATEUR, token: 'T', sessionToken: 'S' } }),
    });

    expect(issue).toEqual({
      genre: 'session',
      session: { jeton: 'T', jetonDeSession: 'S', utilisateur: UTILISATEUR },
    });
  });

  it('poste l’inscription sur /auth/register', async () => {
    const vus: string[] = [];
    await inscription({
      nomAffiche: 'Tolu Adeyemi',
      courriel: 'tolu@exemple.com',
      motDePasse: 'motdepasse',
      telephone: '',
      pays: 'FR',
      langue: 'fr',
      base: 'https://gate.test',
      recuperer: async (url) => {
        vus.push(url);
        return reponseJson({ success: true, data: { user: UTILISATEUR, token: 'T' } });
      },
    });

    expect(vus).toEqual(['https://gate.test/api/v1/auth/register']);
  });

  /**
   * Un refus d'INSCRIPTION est rendu au lecteur, contrairement à un refus de
   * connexion : « ce pseudo est pris » décrit la saisie qu'on vient de faire,
   * il ne renseigne personne sur un compte existant.
   */
  it('rend le message du serveur sur un refus d’inscription', async () => {
    const issue = await inscription({
      nomAffiche: 'Tolu',
      courriel: 'tolu@exemple.com',
      motDePasse: 'motdepasse',
      telephone: '',
      pays: 'FR',
      langue: 'fr',
      base: 'https://gate.test',
      recuperer: async () =>
        reponseJson(
          { success: false, code: 'EMAIL_TAKEN', field: 'email', message: 'Cette adresse est déjà utilisée' },
          409,
        ),
    });

    expect(issue).toEqual({
      genre: 'refus',
      message: 'Cette adresse est déjà utilisée',
      champ: 'courriel',
      recours: { libelle: 'Connectez-vous', href: '/login' },
    });
  });

  it('ne laisse pas une passerelle muette ressembler à un mauvais mot de passe', async () => {
    const issue = await connexion({
      identifiant: 'a',
      motDePasse: 'b',
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    expect(issue.genre).toBe('refus');
    expect(issue).toMatchObject({
      message: expect.stringContaining('n’a pas répondu'),
    });
  });
});

/**
 * **L'INSCRIPTION TIENT EN UN ÉCRAN** (issue #5217).
 *
 * Cinq champs — prénom, nom, pseudo, e-mail, mot de passe — demandaient au
 * lecteur de composer une identité avant d'avoir vu le produit. Il en reste UN
 * seul écran : comment vous appeler, où vous écrire, éventuellement où vous
 * joindre, un mot de passe, et la langue dans laquelle vous lirez. Le pseudo
 * n'est plus demandé : la passerelle le DÉRIVE, et son refus revient sur le
 * champ qui l'a produit.
 *
 * Ce que ces témoins gardent, et que rien d'autre ne garde : les attributs que
 * le navigateur LIT (`autocomplete`, `type`, `minlength`, `required`), la
 * pré-sélection depuis le seul en-tête qu'un visiteur ait envoyé, la charge
 * EXACTE remise à la passerelle, et le fait qu'un refus se pose SUR son champ
 * plutôt qu'au-dessus du formulaire.
 */

const signup = (acceptLanguage?: string): Promise<string> =>
  PORTE_D_INSCRIPTION.GET(
    new Request(
      'https://meeshy.me/signup',
      acceptLanguage === undefined ? {} : { headers: { 'accept-language': acceptLanguage } },
    ),
  ).text();

const optionSelectionnee = (doc: string, nomDuSelecteur: string): string => {
  const bloc = new RegExp(`<select[^>]*name="${nomDuSelecteur}"[^>]*>([\\s\\S]*?)</select>`).exec(doc);
  const choisie = /<option value="([^"]+)" selected>/.exec(bloc?.[1] ?? '');
  return choisie?.[1] ?? '';
};

describe('l’écran d’inscription — un seul écran, cinq réponses', () => {
  // MARK: — la forme du formulaire

  it('rend les cinq réponses avec les attributs que le navigateur LIT', async () => {
    const doc = await signup('fr-FR,fr;q=0.9');

    expect(doc).toContain(
      '<label for="champ-nomAffiche">Comment vous appeler ?</label><input id="champ-nomAffiche" name="nomAffiche" type="text" autocomplete="name" required value=""/>',
    );
    expect(doc).toContain('name="courriel" type="email" autocomplete="email" required');
    expect(doc).toContain('name="telephone" type="tel" autocomplete="tel-national"');
    expect(doc).toContain('name="motDePasse" type="password" autocomplete="new-password" required minlength="6"');
    expect(doc).toContain('<select id="champ-pays" name="pays">');
    expect(doc).toContain('<select id="champ-langue" name="langue">');
  });

  /**
   * LE TÉLÉPHONE NE SE DIT PAS FACULTATIF. Le mot « (facultatif) » invite à
   * sauter le champ ; l'absence de `required` suffit à ce que le navigateur
   * laisse passer un champ vide, et c'est la seule chose qui doive être vraie.
   */
  it('n’annonce pas le téléphone comme facultatif, et ne le rend pas obligatoire', async () => {
    const doc = await signup();
    const telephone = /<input id="champ-telephone"[^>]*>/.exec(doc)?.[0] ?? '';

    expect(telephone).not.toBe('');
    expect(telephone).not.toContain('required');
    expect(doc.toLowerCase()).not.toContain('facultatif');
    expect(doc.toLowerCase()).not.toContain('optionnel');
  });

  it('ne demande plus ni prénom, ni nom, ni pseudonyme', async () => {
    const doc = await signup();

    for (const disparu of ['name="prenom"', 'name="nom"', 'name="identifiant"']) {
      expect(doc).not.toContain(disparu);
    }
  });

  it('pose la phrase des conditions SOUS le bouton, avec ses deux liens et sans case à cocher', async () => {
    const doc = await signup();
    const apresLeBouton = doc.slice(doc.indexOf('Créer mon compte'));

    expect(apresLeBouton).toContain('En continuant, vous acceptez ');
    expect(apresLeBouton).toContain('<a href="/terms">les conditions d’utilisation</a>');
    expect(apresLeBouton).toContain('<a href="/privacy">la politique de confidentialité</a>');
    expect(doc).not.toContain('type="checkbox"');
  });

  it('sert la pastille de langue comme une phrase, pas comme un champ de plus', async () => {
    expect(await signup()).toContain(
      '<label for="champ-langue">Vous lirez Meeshy en <select id="champ-langue" name="langue">',
    );
  });

  it('n’embarque aucun JavaScript de page — le moteur de thème et rien d’autre', async () => {
    const doc = await signup();

    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc).toContain('meeshy-theme');
  });

  // MARK: — ce que le serveur PROPOSE d'un visiteur dont il ne sait qu'un en-tête

  it.each([
    ['fr-FR,fr;q=0.9,en;q=0.8', 'FR'],
    ['en-US,en;q=0.9', 'US'],
    // `pt` sans région : la table langue → pays vient des drapeaux de
    // SUPPORTED_LANGUAGES, qui donne 🇵🇹 au portugais. PT, donc, pas BR.
    ['pt', 'PT'],
    ['yo,fr;q=0.4', 'NG'],
    // Une région que personne ne numérote (`es-419`, code M.49) redescend sur
    // la langue ; une étiquette illisible retombe sur le pays du document.
    ['es-419', 'ES'],
    ['*', 'FR'],
    [undefined, 'FR'],
  ])('pré-sélectionne le pays du visiteur : %s → %s', async (entete, attendu) => {
    expect(optionSelectionnee(await signup(entete), 'pays')).toBe(attendu);
  });

  it.each([
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    // Le POIDS ordonne, l'ordre d'écriture ne départage que les ex æquo.
    ['fr;q=0.5, es', 'es'],
    ['en-US,en;q=0.9', 'en'],
    // Une langue que Meeshy ne sert pas retombe sur celle du document.
    ['kl-GL', 'fr'],
    [undefined, 'fr'],
  ])('pré-sélectionne la langue de lecture : %s → %s', async (entete, attendu) => {
    expect(optionSelectionnee(await signup(entete), 'langue')).toBe(attendu);
  });

  it('offre un pays nommé en français, avec son drapeau et son indicatif', async () => {
    const doc = await signup();

    expect(doc).toContain('<option value="FR" selected>🇫🇷 +33 France</option>');
    expect(doc).toContain('<option value="NG">🇳🇬 +234 Nigeria</option>');
  });

  // MARK: — ce qui part vers la passerelle

  const chargeRemise = async (corps: Record<string, string>): Promise<unknown> => {
    let charge: unknown = null;
    await inscription({
      nomAffiche: corps.nomAffiche ?? '',
      courriel: corps.courriel ?? '',
      motDePasse: corps.motDePasse ?? '',
      telephone: corps.telephone ?? '',
      pays: corps.pays ?? '',
      langue: corps.langue ?? '',
      base: 'https://gate.test',
      recuperer: async (_url, options) => {
        charge = JSON.parse(String(options.body));
        return new Response(JSON.stringify({ success: true, data: { user: UTILISATEUR, token: 'T' } }));
      },
    });
    return charge;
  };

  it('n’envoie AUCUN numéro quand le champ est vide', async () => {
    expect(
      await chargeRemise({
        nomAffiche: 'Tolu Adeyemi',
        courriel: 'tolu@exemple.com',
        motDePasse: 'motdepasse',
        telephone: '',
        pays: 'NG',
        langue: 'yo',
      }),
    ).toEqual({
      displayName: 'Tolu Adeyemi',
      email: 'tolu@exemple.com',
      password: 'motdepasse',
      systemLanguage: 'yo',
    });
  });

  it('envoie le numéro TEL QUE SAISI, avec le pays choisi — la passerelle normalise', async () => {
    expect(
      await chargeRemise({
        nomAffiche: 'Tolu Adeyemi',
        courriel: 'tolu@exemple.com',
        motDePasse: 'motdepasse',
        telephone: '0801 234 5678',
        pays: 'NG',
        langue: 'fr',
      }),
    ).toEqual({
      displayName: 'Tolu Adeyemi',
      email: 'tolu@exemple.com',
      password: 'motdepasse',
      phoneNumber: '0801 234 5678',
      phoneCountryCode: 'NG',
      systemLanguage: 'fr',
    });
  });

  /**
   * La passerelle DÉRIVE le pseudo, le prénom et le nom du nom affiché. Les lui
   * envoyer ferait de la v3 le second site de cette dérivation, et le premier à
   * diverger. `regionalLanguage` reste au défaut du schéma : l'écran ne demande
   * qu'UNE langue, et en poser une seconde en douce serait la lui inventer.
   */
  it('n’invente ni pseudo, ni prénom, ni nom, ni seconde langue', async () => {
    const charge = await chargeRemise({
      nomAffiche: 'Tolu Adeyemi',
      courriel: 'tolu@exemple.com',
      motDePasse: 'motdepasse',
      telephone: '',
      pays: 'FR',
      langue: 'fr',
    });

    expect(Object.keys(charge as Record<string, unknown>).sort()).toEqual([
      'displayName',
      'email',
      'password',
      'systemLanguage',
    ]);
  });

  it('retombe sur le pays proposé quand le formulaire n’en porte aucun, ou un inconnu', async () => {
    const vus: unknown[] = [];
    const porte = porteDe(INSCRIPTION, async (valeurs) => {
      vus.push(valeurs.pays);
      return { genre: 'refus', message: 'x', champ: null, recours: null };
    });
    const envoie = (corps: Record<string, string>) =>
      porte.POST(
        new Request('https://meeshy.me/signup', {
          method: 'POST',
          body: new URLSearchParams(corps),
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            origin: 'https://meeshy.me',
            'accept-language': 'en-US,en;q=0.9',
          },
        }),
      );

    const complet = { nomAffiche: 'T', courriel: 't@e.com', motDePasse: 'motdepasse' };
    await envoie(complet);
    await envoie({ ...complet, pays: 'ZZ' });
    await envoie({ ...complet, pays: 'NG' });

    expect(vus).toEqual(['US', 'US', 'NG']);
  });

  // MARK: — un refus se pose SUR son champ

  const refuseAvec = async (corps: unknown, statut: number): Promise<string> => {
    const porte = porteDe(INSCRIPTION, (valeurs) =>
      inscription({
        nomAffiche: valeurs.nomAffiche ?? '',
        courriel: valeurs.courriel ?? '',
        motDePasse: valeurs.motDePasse ?? '',
        telephone: valeurs.telephone ?? '',
        pays: valeurs.pays ?? '',
        langue: valeurs.langue ?? '',
        base: 'https://gate.test',
        recuperer: async () => new Response(JSON.stringify(corps), { status: statut }),
      }),
    );
    const reponse = await porte.POST(
      new Request('https://meeshy.me/signup', {
        method: 'POST',
        body: new URLSearchParams({
          nomAffiche: 'Tolu Adeyemi',
          courriel: 'tolu@exemple.com',
          motDePasse: 'secret-42',
          telephone: '0801 234 5678',
          pays: 'NG',
          langue: 'fr',
        }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://meeshy.me' },
      }),
    );
    return reponse.text();
  };

  it('pose un e-mail déjà pris SUR le champ e-mail, garde la saisie et propose de se connecter', async () => {
    const doc = await refuseAvec(
      {
        success: false,
        code: 'EMAIL_TAKEN',
        field: 'email',
        message: 'Cette adresse e-mail est déjà utilisée.',
      },
      409,
    );

    expect(doc).toContain('aria-invalid="true"');
    expect(doc).toContain('aria-describedby="refus-courriel aide-courriel"');
    expect(doc).toContain('<p class="refus" id="refus-courriel">Cette adresse e-mail est déjà utilisée.');
    expect(doc).toContain('<a href="/login">Connectez-vous</a>');
    // La saisie survit au refus — sauf le mot de passe, qui ne repart jamais.
    expect(doc).toContain('value="tolu@exemple.com"');
    expect(doc).toContain('value="Tolu Adeyemi"');
    expect(doc).not.toContain('secret-42');
    // Aucune alerte globale : le message est DÉJÀ sous son champ.
    expect(doc).not.toContain('role="alert"');
  });

  /**
   * UN NUMÉRO DÉJÀ RATTACHÉ N'EST PAS UNE ERREUR DE SAISIE — la passerelle rend
   * 200 et ne crée AUCUN compte. Le lecteur doit apprendre deux choses : que le
   * numéro est pris, et qu'il peut continuer sans lui.
   */
  it('ramène un numéro déjà rattaché sur le champ téléphone, avec la sortie', async () => {
    const doc = await refuseAvec(
      { success: true, data: { phoneOwnershipConflict: true, phoneNumber: '+2348012345678' } },
      200,
    );

    expect(doc).toContain('<p class="refus" id="refus-telephone">');
    expect(doc).toContain(
      'Ce numéro est déjà rattaché à un compte. Laissez-le vide pour continuer, ou connectez-vous.',
    );
    expect(doc).toContain('value="0801 234 5678"');
    // AUCUN compte n'a été créé : rien de la remise de session ne part.
    expect(doc).not.toContain(CLES.jeton);
  });

  it.each([
    [{ success: false, code: 'PHONE_INVALID', field: 'phoneNumber', message: 'Numéro invalide' }, 400, 'telephone'],
    [{ success: false, code: 'USERNAME_TAKEN', field: 'username', suggestions: ['tolu2'], message: 'Pseudo pris' }, 409, 'nomAffiche'],
    [
      {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Les données envoyées sont invalides.',
        violations: [{ path: 'body/password', message: 'must NOT have fewer than 6 characters' }],
      },
      400,
      'motDePasse',
    ],
    // LE REFUS DE SCHÉMA — celui que Fastify rend AVANT le gestionnaire, donc
    // le plus fréquent : ses violations vivent en `details[].field`, pas en
    // `violations[].path` (`services/gateway/src/utils/schema-validation-error.ts`).
    [
      {
        success: false,
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        message: 'body/displayName must match pattern "^(?=.*\\p{L})"',
        details: [{ field: 'displayName', message: 'must match pattern' }],
      },
      400,
      'nomAffiche',
    ],
  ])('range le refus %#  sur le champ %s', async (corps, statut, champ) => {
    const doc = await refuseAvec(corps, statut);

    expect(doc).toContain(`<p class="refus" id="refus-${champ}">`);
    expect(doc).toContain(`aria-describedby="refus-${champ}`);
  });

  /**
   * UN REFUS SANS CHAMP GARDE SON ALERTE. Désigner un champ au hasard serait
   * pire que n'en désigner aucun — c'est la règle que `vue.ts` porte depuis le
   * premier jour, et elle ne change pas : elle se RESTREINT aux refus que la
   * passerelle ne sait pas rattacher.
   */
  it('garde l’alerte globale quand la passerelle ne nomme aucun champ', async () => {
    const doc = await refuseAvec({ success: false, message: 'La création du compte a échoué.' }, 500);

    expect(doc).toContain('<p class="alerte" role="alert">La création du compte a échoué.</p>');
    // Aucun champ n'est désigné — la règle du `<input>` porte bien `aria-invalid`
    // dans la feuille, ce que la sonde ne doit pas confondre avec un champ marqué.
    expect(/<input[^>]*aria-invalid/.test(doc)).toBe(false);
    expect(doc).not.toContain('class="refus"');
  });
});

describe('le catalogue des pays (lib/contenu/pays.ts)', () => {
  it('porte la France avec son drapeau et son indicatif', () => {
    const france = catalogueDesPays().find(({ code }) => code === 'FR');

    expect(france).toEqual({
      code: 'FR',
      indicatif: '33',
      nom: 'France',
      drapeau: '🇫🇷',
      libelle: '🇫🇷 +33 France',
    });
  });

  it('trie par nom français, et se calcule UNE fois par processus', () => {
    const premier = catalogueDesPays();
    const noms = premier.map(({ nom }) => nom);

    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(catalogueDesPays()).toBe(premier);
    expect(premier.length).toBeGreaterThan(200);
  });
});

/**
 * LE POIDS DU DOCUMENT D'INSCRIPTION, mesuré et RATCHETÉ
 * (`budgets-mesures.json` › `documents_de_l_inscription`).
 *
 * L'écran a gagné 328 `<option>` — 245 pays et 83 langues — pour rendre le
 * choix par le NAVIGATEUR plutôt que par un menu écrit à la main : 0 Ko de
 * JavaScript de page, la recherche au clavier et l'affichage plein écran de
 * l'OS compris. Le prix est en OCTETS DE DOCUMENT, et il FRANCHIT le plafond
 * de la charte (§ 12.5 règle 4, 9 216 o) de 3,4 %. Le franchissement est
 * DÉCLARÉ dans `budgets-mesures.json`, pas effacé ; ce témoin interdit ce que
 * la déclaration ne couvre pas — la croissance SILENCIEUSE.
 *
 * La CONNEXION est mesurée à côté, et pour une raison : c'est le même chrome,
 * le même socle et la même feuille SANS aucun sélecteur. Sans elle, un octet
 * gagné par le catalogue et perdu par le chrome partagé se compenseraient sans
 * qu'on sache lequel a bougé.
 */
describe('le poids du document d’inscription', () => {
  const octets = (source: string): number => gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).length;
  const mesures = JSON.parse(readFileSync(join(__dirname, '..', 'budgets-mesures.json'), 'utf8')) as {
    readonly documents_de_l_inscription: { readonly signup_o: number; readonly login_o: number };
  };

  it('ne laisse pas l’écran d’inscription grossir en silence', async () => {
    const poids = octets(await signup('fr-FR'));

    console.log(`[mesure] document /signup ${poids} o gzip`);
    expect(poids).toBeLessThanOrEqual(mesures.documents_de_l_inscription.signup_o);
  });

  it('ne fait payer les sélecteurs qu’à l’écran qui les sert', async () => {
    const connexion_ = octets(
      await PORTE_DE_CONNEXION.GET(new Request('https://meeshy.me/login')).text(),
    );

    expect(connexion_).toBeLessThanOrEqual(mesures.documents_de_l_inscription.login_o);
  });
});
