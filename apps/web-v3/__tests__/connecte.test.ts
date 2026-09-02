/**
 * @jest-environment node
 */

import { CHATS, TABLEAU_DE_BORD } from '@/app/connecte/contenu';
import { liensDuLecteur } from '@/lib/api/compte';
import { serviteurDe } from '@/app/connecte/porte';
import { documentDesChats, documentDuTableau, quand, teinteDeLAvatar } from '@/app/connecte/vue';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/app/authentification/remise';
import type { Conversation, LienDePartage } from '@/lib/api/compte';

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

const LIEN = (attributs: Partial<LienDePartage> = {}): LienDePartage => ({
  identifiant: 'lagos-q1',
  nom: 'Ops Lagos',
  utilisations: 12,
  conversation: '68f2a81417a557e8ce4ddfbb',
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
    const porte = serviteurDe({ chemin: '/chats', ecran: () => 'jamais rendu', recuperer: NOMINALE });
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
    const porte = serviteurDe({
      chemin: '/',
      ecran: () => 'jamais rendu',
      recuperer: passerelle({
        '/api/v1/auth/me': () => json({}, 401),
        '/api/v1/conversations': () => json({}, 401),
      }),
    });
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
    const porte = serviteurDe({
      chemin: '/',
      ecran: () => 'jamais rendu',
      recuperer: passerelle({
        '/api/v1/auth/me': () => json({ success: true, data: { firstName: 'Sonde' } }),
        '/api/v1/conversations': () => json({ success: false, code: 'UNAUTHORIZED' }, 401),
      }),
    });
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
    const porte = serviteurDe({
      chemin: '/',
      ecran: () => 'jamais rendu',
      recuperer: passerelle({
        '/api/v1/auth/me': () => json({ success: true, data: { firstName: 'Sonde' } }),
        '/api/v1/conversations': () => json({}, 403),
      }),
    });
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
    const porte = serviteurDe({
      chemin: '/',
      ecran: (charge) => `prenom=${charge.lecteur?.prenom ?? 'aucun'} n=${charge.conversations.length}`,
      recuperer: passerelle({
        '/api/v1/auth/me': () => json({}, 403),
        '/api/v1/conversations': () =>
          json({ success: true, data: [CONVERSATION({})], pagination: { total: 1 } }),
      }),
    });
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('prenom=aucun n=1');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const porte = serviteurDe({
      chemin: '/',
      ecran: () => 'jamais rendu',
      recuperer: async () => {
        throw new Error('ECONNREFUSED');
      },
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
    const porte = serviteurDe({
      chemin: '/',
      ecran: (charge) => `prenom=${charge.lecteur?.prenom ?? 'aucun'} n=${charge.conversations.length}`,
      recuperer: passerelle({
        '/api/v1/auth/me': () => json({}, 500),
        '/api/v1/conversations': () => json({ success: true, data: [CONVERSATION()], pagination: { total: 1 } }),
      }),
    });

    expect(await (await porte(requete('/', AVEC_JETON))).text()).toBe('prenom=aucun n=1');
  });

  /**
   * LES LIENS SONT DEMANDÉS PAR LE TABLEAU DE BORD, ET PAR LUI SEUL. Les trois
   * appels partent ENSEMBLE — les enchaîner tripleraient la latence du seul
   * aller-retour que cette page paie — et `/chats`, qui ne rend aucune section
   * « Mes liens », n'en paie aucun.
   */
  it('demande les liens pour le tableau de bord, jamais pour la liste', async () => {
    const vus: string[] = [];
    const journalise = passerelle({
      '/api/v1/auth/me': () => json({ success: true, data: {} }),
      '/api/v1/conversations': () => json({ success: true, data: [], pagination: { total: 0 } }),
      '/api/v1/links': () => json({ success: true, data: [] }),
    });
    const recuperer = async (url: string): Promise<Response> => {
      vus.push(new URL(url).pathname);
      return journalise(url);
    };

    await serviteurDe({ chemin: '/', ecran: () => 'ok', avecLiens: true, recuperer })(
      requete('/', AVEC_JETON),
    );
    expect(vus).toContain('/api/v1/links');

    vus.length = 0;
    await serviteurDe({ chemin: '/chats', ecran: () => 'ok', recuperer })(requete('/chats', AVEC_JETON));
    expect(vus).not.toContain('/api/v1/links');
  });

  it('ne met jamais la zone connectée en cache ni dans un index', async () => {
    const porte = serviteurDe({ chemin: '/', ecran: () => 'ok', recuperer: NOMINALE });
    const reponse = await porte(requete('/', AVEC_JETON));

    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
    expect(reponse.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});

/**
 * `GET /api/v1/links` — la route RÉELLE que le tableau de bord attaque
 * (`services/gateway/src/routes/links/user.ts:314`, `onRequest: [authRequired]`
 * avec `requireAuth: true, allowAnonymous: false` — donc `Authorization:
 * Bearer`). Elle rend `{ success, data: LinkItem[], pagination }` ; `conversation`
 * n'est servi qu'avec `?expand=conversation` (`user.ts:571-581`).
 */
describe('les liens de partage du lecteur', () => {
  const appel = async (reponse: () => Response): Promise<{ url: string; entetes: HeadersInit | undefined }> => {
    let vu = { url: '', entetes: undefined as HeadersInit | undefined };
    await liensDuLecteur({
      jeton: 'JWT.xyz',
      base: 'https://gate.test',
      recuperer: async (url, options) => {
        vu = { url, entetes: options.headers };
        return reponse();
      },
    });
    return vu;
  };

  it('demande l’extension de la conversation, sans quoi le lien ne mènerait nulle part', async () => {
    const { url, entetes } = await appel(() => json({ success: true, data: [] }));

    expect(url).toBe('https://gate.test/api/v1/links?limit=3&expand=conversation');
    expect(new Headers(entetes).get('authorization')).toBe('Bearer JWT.xyz');
  });

  it('projette l’identifiant, le nom, l’emploi mesuré et la conversation', async () => {
    const liens = await liensDuLecteur({
      jeton: 'JWT.xyz',
      base: 'https://gate.test',
      recuperer: async () =>
        json({
          success: true,
          data: [
            {
              id: 'l1',
              linkId: 'mshy_lagos',
              identifier: 'lagos-q1',
              name: 'Ops Lagos',
              isActive: true,
              currentUses: 12,
              conversation: { id: 'c1', title: 'Équipe Lagos', type: 'group' },
            },
          ],
        }),
    });

    expect(liens).toEqual({
      genre: 'liste',
      liens: [{ identifiant: 'lagos-q1', nom: 'Ops Lagos', utilisations: 12, conversation: 'c1' }],
    });
  });

  /**
   * Un lien DÉSACTIVÉ n'ouvre plus rien : l'afficher sur le tableau de bord
   * dirait au lecteur qu'il peut encore le partager. `isActive` est servi par la
   * route (`user.ts` schéma de réponse) — il est LU, pas ignoré.
   */
  it('écarte les liens que la passerelle dit inactifs', async () => {
    const liens = await liensDuLecteur({
      jeton: 'JWT.xyz',
      base: 'https://gate.test',
      recuperer: async () =>
        json({
          success: true,
          data: [{ identifier: 'a', isActive: false, currentUses: 1 }],
        }),
    });

    expect(liens).toEqual({ genre: 'liste', liens: [] });
  });

  it.each([401, 403, 500])('rend « indisponible » plutôt que de renvoyer se connecter (%s)', async (statut) => {
    const liens = await liensDuLecteur({
      jeton: 'JWT.xyz',
      base: 'https://gate.test',
      recuperer: async () => json({}, statut),
    });

    expect(liens).toEqual({ genre: 'indisponible' });
  });

  it('rend « indisponible » quand la passerelle se tait', async () => {
    const liens = await liensDuLecteur({
      jeton: 'JWT.xyz',
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    expect(liens).toEqual({ genre: 'indisponible' });
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
    liens: { genre: 'liste', liens: [LIEN()] },
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

  /**
   * UNE porte vers `/chats`, et elle change de FORME selon l'état — jamais deux
   * à la fois. Quand il y a des fils, c'est « Tout voir » à côté du titre de la
   * section (la cible `home.png`) ; quand il n'y en a pas, c'est l'action
   * primaire de l'état vide, seul endroit de l'écran où le lecteur a encore
   * quelque chose à faire. Deux portes empilées, c'était le tableau de bord
   * « accès rapides » du legacy — un bouton pleine largeur au-dessus d'une
   * liste qui mène au même endroit.
   */
  it('mène à /chats par « Tout voir », une seule fois', () => {
    expect(doc.split('href="/chats"').length - 1).toBe(1);
    expect(doc).toContain(TABLEAU_DE_BORD.voirTout);
  });

  /**
   * LA CIBLE `home.png` : « Reprendre » est une liste de CARTES à avatar, pas la
   * liste plate de `/chats` (charte règle 12). L'avatar porte les initiales sur
   * l'une des quatre teintes de la table — celles qui disent QUI (règle 11).
   */
  it('rend « Reprendre » en cartes à avatar, chacune menant à son fil', () => {
    expect(doc).toContain(TABLEAU_DE_BORD.recentes);
    expect(doc).toContain('<a class="carte" href="/chats/68f2a81417a557e8ce4ddfbb">');
    expect(doc).toMatch(/<span class="avatar t[1-4]" aria-hidden="true">MG<\/span>/);
  });

  /**
   * UNE TEINTE D'AVATAR DÉSAMBIGUÏSE, ELLE N'IDENTIFIE PAS — et le témoin doit
   * dire lequel des deux, sinon il exige l'impossible. La table n'en porte que
   * QUATRE : avec trois conversations à l'écran, deux partagent une couleur une
   * fois sur deux, et aucun choix de fonction n'y change quoi que ce soit. Ce
   * qui se garde est donc : la STABILITÉ (la couleur ne clignote pas d'un
   * chargement à l'autre), la couverture des quatre teintes, et l'ABSENCE de
   * dégénérescence — une somme de points de code donne la même teinte à toute
   * PERMUTATION d'un nom, si bien que « Marta Ruiz » et « Ruiz Marta » seraient
   * mécaniquement jumelles, et avec elles toute famille de noms permutés.
   */
  it('donne à un même nom la MÊME teinte — la couleur ne clignote pas', () => {
    expect(teinteDeLAvatar('Meeshy Global')).toBe(teinteDeLAvatar('Meeshy Global'));
  });

  it('ne donne pas la même teinte à deux permutations d’un même nom', () => {
    expect(teinteDeLAvatar('Marta Ruiz')).not.toBe(teinteDeLAvatar('Ruiz Marta'));
  });

  it('atteint les quatre teintes de la table, jamais un sous-ensemble', () => {
    const noms = Array.from({ length: 40 }, (_, index) => `Conversation ${index}`);

    expect(new Set(noms.map(teinteDeLAvatar))).toEqual(new Set(['t1', 't2', 't3', 't4']));
  });

  /**
   * Charte règle 6 — « chacun est un `<a href>` vers une route SERVIE ; tant que
   * sa destination n'existe pas, il n'est pas rendu — jamais inerte ». La v3 ne
   * sert aujourd'hui ni compte ni réglages : l'écran n'en rend AUCUN.
   */
  it('ne rend aucun rond flottant, aucune cible inerte', () => {
    expect(doc).not.toContain('flottant');
    expect(doc).not.toContain('href="#"');
    expect(doc).not.toContain('onclick');
  });

  /**
   * « Mes liens » (charte règle 12) : une carte à TUILE par lien du lecteur,
   * l'adresse qu'il a partagée en titre et son emploi RÉEL en méta —
   * `currentUses`, servi par `GET /api/v1/links`
   * (`services/gateway/src/routes/links/user.ts:314`). Aucun chiffre fabriqué :
   * « ont rejoint » n'existe pas sur cette route, il n'est donc pas affiché.
   */
  it('rend « Mes liens » avec l’adresse partagée et son emploi mesuré', () => {
    expect(doc).toContain(TABLEAU_DE_BORD.liens);
    expect(doc).toContain('meeshy.me/chat/lagos-q1');
    expect(doc).toContain('12 utilisations');
  });

  it('mène du lien à la conversation qu’il ouvre, quand la passerelle l’étend', () => {
    expect(doc).toContain('<a class="carte" href="/chats/68f2a81417a557e8ce4ddfbb">');
  });

  /**
   * Un lien dont la passerelle n'a pas étendu la conversation ne peut mener
   * nulle part : il reste une CARTE d'information (`<li class="carte">`), jamais
   * un lien mort (charte règle 7).
   */
  it('rend un lien sans conversation en carte inerte plutôt qu’en lien mort', () => {
    const orphelin = documentDuTableau({
      lecteur: null,
      conversations: [],
      total: 0,
      liens: { genre: 'liste', liens: [LIEN({ conversation: null })] },
      maintenant: MAINTENANT,
    });

    expect(orphelin).toContain('<li class="carte">');
    expect(orphelin).not.toContain('href="/chats/null"');
  });

  /**
   * La section se TAIT quand la passerelle n'a pas répondu : afficher « aucun
   * lien » à qui en a douze est une donnée FAUSSE, pas une donnée manquante —
   * c'est la doctrine déjà écrite dans `app/connecte/contenu.ts` pour les quatre
   * compteurs que la v3 ne mesure pas.
   */
  it('tait « Mes liens » quand la passerelle n’a pas répondu, et le dit vide quand il l’est', () => {
    const muette = documentDuTableau({
      lecteur: null,
      conversations: [],
      total: 0,
      liens: { genre: 'indisponible' },
      maintenant: MAINTENANT,
    });
    const aucun = documentDuTableau({
      lecteur: null,
      conversations: [],
      total: 0,
      liens: { genre: 'liste', liens: [] },
      maintenant: MAINTENANT,
    });

    expect(muette).not.toContain(TABLEAU_DE_BORD.liens);
    expect(aucun).toContain(TABLEAU_DE_BORD.liensVides);
  });

  it('n’embarque QUE le script de thème', () => {
    expect(doc.split('<script').length - 1).toBe(1);
  });

  it('dessine l’état VIDE plutôt qu’une section muette', () => {
    const nu = documentDuTableau({
      lecteur: null,
      conversations: [],
      total: 0,
      liens: { genre: 'liste', liens: [] },
      maintenant: MAINTENANT,
    });
    expect(nu).toContain(CHATS.vide);
    expect(nu).toContain(TABLEAU_DE_BORD.salutationSansNom);
    // Sans conversation, « Tout voir » ne qualifie rien : la porte vers /chats
    // prend la forme de l'action primaire de l'état vide (charte règle 18), et
    // elle reste UNIQUE.
    expect(nu).not.toContain(TABLEAU_DE_BORD.voirTout);
    expect(nu.split('href="/chats"').length - 1).toBe(1);
    expect(nu).toContain('class="carte-vide"');
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
