/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONNEXION, INSCRIPTION } from '@/app/authentification/contenu';
import { porteDe, PORTE_DE_CONNEXION } from '@/app/authentification/porte';
import {
  CLES,
  CLES_DEUXIEME_FACTEUR,
  COOKIE_DE_SESSION,
  ROLES_ADMIN,
  destination,
} from '@/app/authentification/remise';
import { GET as RACINE } from '@/app/route';
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
    const porte = porteQuiRend({ genre: 'refus', message: 'Identifiant ou mot de passe incorrect.' });
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
        await porteQuiRend({ genre: 'refus', message }).POST(
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
    ).toEqual({ genre: 'refus', message: 'Identifiant ou mot de passe incorrect.' });

    expect(
      await refusDuServeur({ success: false, error: { message: 'Mot de passe invalide' } }),
    ).toEqual({ genre: 'refus', message: 'Identifiant ou mot de passe incorrect.' });
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
    // La vitrine servie ICI depend d'un cookie : elle ne se met plus en cache.
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
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

  it('poste l’inscription sur /auth/register, avec les noms de champs de la passerelle', async () => {
    const vus: { url: string; corps: unknown }[] = [];
    await inscription({
      prenom: 'Marie',
      nom: 'Dupont',
      identifiant: 'marie_d',
      courriel: 'marie@example.com',
      motDePasse: 'motdepasse',
      base: 'https://gate.test',
      recuperer: async (url, options) => {
        vus.push({ url, corps: JSON.parse(String(options.body)) });
        return reponseJson({ success: true, data: { user: UTILISATEUR, token: 'T' } });
      },
    });

    expect(vus[0]?.url).toBe('https://gate.test/api/v1/auth/register');
    expect(vus[0]?.corps).toEqual({
      firstName: 'Marie',
      lastName: 'Dupont',
      username: 'marie_d',
      email: 'marie@example.com',
      password: 'motdepasse',
    });
  });

  /**
   * Un refus d'INSCRIPTION est rendu au lecteur, contrairement à un refus de
   * connexion : « ce pseudo est pris » décrit la saisie qu'on vient de faire,
   * il ne renseigne personne sur un compte existant.
   */
  it('rend le message du serveur sur un refus d’inscription', async () => {
    const issue = await inscription({
      prenom: 'M',
      nom: 'D',
      identifiant: 'pris',
      courriel: 'm@example.com',
      motDePasse: 'x',
      base: 'https://gate.test',
      recuperer: async () =>
        reponseJson({ success: false, error: { message: 'Ce nom d’utilisateur est déjà pris' } }, 409),
    });

    expect(issue).toEqual({ genre: 'refus', message: 'Ce nom d’utilisateur est déjà pris' });
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
