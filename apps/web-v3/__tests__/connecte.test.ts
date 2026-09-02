/**
 * @jest-environment node
 */

import { CHATS, TABLEAU_DE_BORD } from '@/app/connecte/contenu';
import { serviteurDe } from '@/app/connecte/porte';
import { documentDesChats, documentDuTableau, quand } from '@/app/connecte/vue';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/app/authentification/remise';
import type { Conversation } from '@/lib/api/compte';

/**
 * **Le tableau de bord et la liste des conversations sont RENDUS PAR LE
 * SERVEUR — chiffres et fils compris.**
 *
 * Ce n'est pas une coquille qu'un script remplit : le document qui part porte
 * déjà les données. Les témoins gardent les deux moitiés — ce que le lecteur
 * reçoit, et ce que la porte fait des trois réponses possibles de la passerelle
 * (elle sert, elle renvoie se connecter, elle dessine une panne).
 */

const CONVERSATION = (attributs: Partial<Conversation> = {}): Conversation => ({
  id: '68f2a81417a557e8ce4ddfbb',
  identifiant: 'meeshy',
  titre: 'Meeshy Global',
  genre: 'global',
  membres: 199,
  nonLus: 0,
  dernierMessageA: '2026-09-01T12:00:00.000Z',
  ...attributs,
});

const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

const requete = (chemin: string, cookie?: string): Request =>
  new Request(`https://meeshy.me${chemin}`, cookie === undefined ? {} : { headers: { cookie } });

const AVEC_JETON = `${COOKIE_DE_SESSION}=abc; ${COOKIE_DE_JETON}=JWT.xyz`;

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const passerelle =
  (parChemin: Readonly<Record<string, () => Response>>) =>
  async (url: string): Promise<Response> => {
    const chemin = new URL(url).pathname;
    const reponse = parChemin[chemin];
    if (reponse === undefined) throw new Error(`chemin non simulé : ${chemin}`);
    return reponse();
  };

const NOMINALE = passerelle({
  '/api/v1/auth/me': () => json({ success: true, data: { firstName: 'Sonde', username: 's1' } }),
  '/api/v1/conversations': () =>
    json({
      success: true,
      data: [CONVERSATION({ nonLus: 3 }), CONVERSATION({ id: 'b', titre: 'Marta Ruiz', membres: 2 })],
      pagination: { total: 7 },
    }),
});

describe('la porte de la zone connectée', () => {
  it('renvoie se connecter quand aucun jeton n’accompagne la demande, en gardant le chemin', async () => {
    const porte = serviteurDe('/chats', () => 'jamais rendu', NOMINALE);
    const reponse = await porte(requete('/chats', `${COOKIE_DE_SESSION}=abc`));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fchats');
  });

  /**
   * Une session expirée est le cas NOMINAL d'un retour après quelques jours.
   * La traiter en panne ferait lire « le service ne répond pas » à qui doit
   * simplement se reconnecter — et le ferait RESTER là, sans issue.
   */
  it('renvoie se connecter quand la passerelle refuse le jeton (401)', async () => {
    const porte = serviteurDe(
      '/',
      () => 'jamais rendu',
      passerelle({
        '/api/v1/auth/me': () => json({}, 401),
        '/api/v1/conversations': () => json({}, 401),
      }),
    );
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2F');
  });

  /**
   * LE FIL PORTE SA PROPRE LIGNE DE REFUS, et ce témoin est le seul qui puisse
   * le prouver. Le témoin précédent met les DEUX routes en 401 : sa redirection
   * peut venir de l'identité seule, donc il resterait vert si `conversations()`
   * cessait de lire le statut. `/auth/me` est ici NOMINALE — c'est la forme
   * qu'avait prise ce même témoin sous #4760, où une mutation l'avait d'abord
   * trouvé VERT pour la mauvaise raison.
   *
   * Depuis #4789, `GET /conversations` rend `401 UNAUTHORIZED` pour une session
   * absente ou morte (`sendUnauthorized`, `routes/conversations/core-list.ts`)
   * là où il servait un 403. La ligne `status === 403` de `compte.ts`, écrite
   * POUR ce défaut, est partie avec lui.
   */
  it('renvoie se connecter sur le 401 de /conversations, /auth/me étant nominale', async () => {
    const porte = serviteurDe(
      '/',
      () => 'jamais rendu',
      passerelle({
        '/api/v1/auth/me': () => json({ success: true, data: { firstName: 'Sonde' } }),
        '/api/v1/conversations': () => json({ success: false, code: 'UNAUTHORIZED' }, 401),
      }),
    );
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2F');
  });

  /**
   * ET LE 403 N'EST PLUS UNE SESSION EXPIRÉE — sur AUCUNE des deux routes.
   * `GET /conversations` ne le sert plus et ne le DÉCLARE plus à son schéma de
   * réponse (#4789) ; le remettre ici ferait lire « reconnecte-toi » à un refus
   * de DROIT qu'une route voisine pourrait servir un jour. Un 403 y retombe
   * donc dans l'illisible, comme n'importe quelle réponse que cet appelant ne
   * sait pas lire — et l'écran de panne est DESSINÉ, jamais blanc.
   */
  it('ne prend plus le 403 de /conversations pour une session expirée', async () => {
    const porte = serviteurDe(
      '/',
      () => 'jamais rendu',
      passerelle({
        '/api/v1/auth/me': () => json({ success: true, data: { firstName: 'Sonde' } }),
        '/api/v1/conversations': () => json({}, 403),
      }),
    );
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toContain('Le service ne répond pas');
  });

  /**
   * `/auth/me`, elle, ne rend JAMAIS 403 : sa garde est montée en
   * `allowAnonymous: true` (branche 403 inatteignable) et `handleGetMe`
   * (`routes/me/get-me.ts:313`) refuse par `sendUnauthorized`. Son 403 était
   * une branche morte ; retirée, un 403 y retombe dans l'illisible — et
   * l'écran se sert quand même, comme pour n'importe quelle autre réponse que
   * cet appelant ne sait pas lire.
   */
  it('ne prend PAS le 403 de /auth/me pour une session expirée', async () => {
    const porte = serviteurDe(
      '/',
      (charge) => `prenom=${charge.lecteur?.prenom ?? 'aucun'} n=${charge.conversations.length}`,
      passerelle({
        '/api/v1/auth/me': () => json({}, 403),
        '/api/v1/conversations': () =>
          json({ success: true, data: [CONVERSATION({})], pagination: { total: 1 } }),
      }),
    );
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('prenom=aucun n=1');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const porte = serviteurDe('/', () => 'jamais rendu', async () => {
      throw new Error('ECONNREFUSED');
    });
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toContain('Le service ne répond pas');
  });

  /**
   * Un profil ABSENT n'empêche pas de servir : le tableau retombe sur la
   * salutation sans nom du legacy. Les conversations, elles, sont la raison
   * d'être de l'écran — leur absence est une panne.
   */
  it('sert l’écran même sans profil, mais jamais sans conversations', async () => {
    const porte = serviteurDe(
      '/',
      (charge) => `prenom=${charge.lecteur?.prenom ?? 'aucun'} n=${charge.conversations.length}`,
      passerelle({
        '/api/v1/auth/me': () => json({}, 500),
        '/api/v1/conversations': () => json({ success: true, data: [CONVERSATION()], pagination: { total: 1 } }),
      }),
    );

    expect(await (await porte(requete('/', AVEC_JETON))).text()).toBe('prenom=aucun n=1');
  });

  it('ne met jamais la zone connectée en cache ni dans un index', async () => {
    const porte = serviteurDe('/', () => 'ok', NOMINALE);
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
    expect(reponse.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});

describe('le tableau de bord', () => {
  const doc = documentDuTableau({
    lecteur: {
      id: 'u1',
      prenom: 'Sonde',
      nomAffiche: 'Sonde Neuf',
      pseudonyme: 's1',
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
    },
    conversations: [CONVERSATION({ nonLus: 3 }), CONVERSATION({ id: 'b', titre: 'Marta Ruiz', nonLus: 2 })],
    total: 7,
    maintenant: MAINTENANT,
  });

  it('salue par le prénom et porte le mot du legacy', () => {
    expect(doc).toContain('Bonjour, Sonde ! 👋');
    expect(doc).toContain(TABLEAU_DE_BORD.apercu);
  });

  /**
   * LES DEUX CHIFFRES SONT MESURÉS, PAS DÉCORATIFS. Le total vient de la
   * pagination — 7 conversations alors que deux seulement sont rendues — et les
   * non-lus sont la SOMME des fils. Un témoin qui n'exigerait que leur présence
   * laisserait passer un compteur figé.
   */
  it('affiche le total paginé et la somme des non-lus, pas le nombre de lignes', () => {
    expect(doc).toContain('<span class="valeur">7</span>');
    expect(doc).toContain('<span class="valeur">5</span>');
  });

  it('mène à /chats, par l’accès rapide comme par « voir tout »', () => {
    expect(doc.split('href="/chats"').length - 1).toBe(2);
  });

  it('n’embarque QUE le script de thème', () => {
    expect(doc.split('<script').length - 1).toBe(1);
  });

  it('dessine l’état VIDE plutôt qu’une section muette', () => {
    const nu = documentDuTableau({ lecteur: null, conversations: [], total: 0, maintenant: MAINTENANT });
    expect(nu).toContain(CHATS.vide);
    expect(nu).toContain(TABLEAU_DE_BORD.salutationSansNom);
    // Sans conversation, « voir tout » ne mène nulle part : il n'est pas rendu.
    expect(nu.split('href="/chats"').length - 1).toBe(1);
  });
});

describe('la liste des conversations', () => {
  const doc = documentDesChats({
    conversations: [CONVERSATION({ nonLus: 3 })],
    maintenant: MAINTENANT,
  });

  it('rend le nom, les participants et l’écart de temps', () => {
    expect(doc).toContain('Meeshy Global');
    expect(doc).toContain(`199 ${CHATS.participants}`);
    expect(doc).toContain('il y a 30 min');
  });

  /**
   * La pastille de non-lus est un nombre NU : à l'œil le contexte le dit, à la
   * voix « 3 » ne dit rien. Le mot voyage donc avec, hors écran.
   */
  it('annonce le compteur de non-lus, en plus de l’afficher', () => {
    expect(doc).toContain('class="compte">3<span class="hors-ecran"> non lus</span>');
  });

  it('mène au fil servi par la v3, par l’identifiant de BASE', () => {
    expect(doc).toContain('href="/chats/68f2a81417a557e8ce4ddfbb"');
    // `identifier` est facultatif et peut changer ; une adresse partagée doit
    // survivre au renommage.
    expect(doc).not.toContain('href="/chats/meeshy"');
  });

  it('échappe le titre d’une conversation, qui vient du réseau', () => {
    const injectee = documentDesChats({
      conversations: [CONVERSATION({ titre: '</a><img src=x onerror=alert(1)>' })],
      maintenant: MAINTENANT,
    });
    const corps = injectee.slice(injectee.indexOf('<body>'));

    expect(corps).not.toContain('<img src=x');
    expect(corps).toContain('&lt;img src=x');
  });
});

/**
 * L'ÉCART EST RELATIF, ET CE N'EST PAS UN CHOIX DE STYLE. Une heure absolue
 * rendue par le serveur l'est dans le fuseau du SERVEUR : « 18:06 » serait faux
 * à Paris comme à Lagos, et personne ne le verrait — une heure a l'air d'une
 * heure. Un écart ne dépend que de l'horloge, la même partout.
 */
describe('l’écart de temps', () => {
  const depuis = (ms: number): string => quand(new Date(MAINTENANT - ms).toISOString(), MAINTENANT);

  it.each([
    [30 * 1000, 'à l’instant'],
    [5 * 60_000, 'il y a 5 min'],
    [3 * 3_600_000, 'il y a 3 h'],
    [2 * 86_400_000, 'il y a 2 j'],
    [30 * 86_400_000, 'il y a 4 sem.'],
  ])('%s ms → %s', (ms, attendu) => {
    expect(depuis(ms)).toBe(attendu);
  });

  it('ne dit rien d’une date absente ou illisible', () => {
    expect(quand(null, MAINTENANT)).toBe('');
    expect(quand('pas-une-date', MAINTENANT)).toBe('');
  });
});
