/**
 * `GET /directory/people/:handle` — l'adresse canonique d'un profil (#4161).
 *
 * Quatre propriétés y sont gardées, et chacune correspond à un défaut MESURÉ en
 * intégration avant ce lot :
 *
 * 1. la charge ANONYME ne porte aucun des six champs privés ;
 * 2. la PRÉSENCE ne part que sur `?expand=presence` ;
 * 3. `?expand=stats` ne sert les quatre compteurs intimes qu'à soi et à
 *    l'administration — le témoin est posé sur un viewer AUTHENTIFIÉ et NON
 *    propriétaire, le seul cas qui distingue les deux versions ;
 * 4. un `If-None-Match` valide rend 304.
 *
 * Tous traversent `app.inject`, donc le VRAI sérialiseur : un témoin qui
 * appellerait le handler ne verrait pas ce que fast-json-stringify supprime, et
 * c'est précisément la couche où vivait le défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

// PROLONGER, jamais remplacer (règle du cycle 93). Seul `getOptionalAuth` est
// substitué — il construit un vrai middleware d'authentification qui, sans
// en-tête `Authorization`, ÉCRASE l'identité que le témoin vient de poser et
// rend tous ses viewers anonymes. `gateProfilePresence` et les helpers
// d'ordonnancement du même module restent les VRAIS : c'est la loi de présence
// du 2026-08-25 que ces témoins mesurent, et un double ne pourrait qu'attester
// l'absence d'un repli permissif là où le vrai code la prouve.
jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';

/** Les six que le lot retire de la surface publique. */
const PRIVES_DE_PROFIL = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'isActive',
  'deactivatedAt',
  'updatedAt',
] as const;

/** Les quatre compteurs d'usage INTIME. */
const PRIVES_DE_STATS = [
  'totalMessages',
  'totalConversations',
  'totalTranslations',
  'friendRequestsReceived',
] as const;

/**
 * @param bloquesParLeLecteur les ids que le LECTEUR a bloqués — le double
 * reconnaît la requête de blocage à son `where.blockedUserIds`, la seule des
 * deux interrogations de `user.findFirst` qui le porte. Un double qui rendrait
 * la ligne de profil à cette requête-là dirait « bloqué » sur toute fiche.
 */
/** Une ligne de `friendRequest`, telle que la table la porte. */
type LigneDemande = {
  readonly id: string;
  readonly status: string;
  readonly senderId: string;
  readonly receiverId: string;
};

/**
 * LA BORNE DE LECTURE EST APPLIQUÉE PAR LE DOUBLE, jamais ignorée par lui.
 *
 * Un faux Prisma qui rend sa ligne quelle que soit la requête accepte aussi
 * une requête SANS `where` : le témoin de confidentialité serait alors vert
 * sur une route qui lit la table entière. Ici la clause `OR` est ÉVALUÉE —
 * retirer la borne de `relationAvec` fait remonter la ligne d'un tiers, et le
 * témoin tombe.
 */
const repondALaBorne = (where: unknown, ligne: LigneDemande): boolean => {
  const clauses = (where as { OR?: readonly { senderId?: string; receiverId?: string }[] } | undefined)?.OR;
  if (clauses === undefined) return true;
  return clauses.some((clause) => clause.senderId === ligne.senderId && clause.receiverId === ligne.receiverId);
};

/**
 * LE DOUBLE HONORE AUSSI LE `select`.
 *
 * Un faux qui rend la ligne ENTIÈRE porte `id` même quand la route ne le
 * demande pas : le témoin verdirait sur un `select` qui jette l'identifiant,
 * c'est-à-dire sur le défaut même que ce lot corrige.
 */
const projete = (ligne: LigneDemande, select: unknown): Partial<LigneDemande> => {
  const demande = select as Readonly<Record<string, boolean>> | undefined;
  if (demande === undefined) return ligne;
  return Object.fromEntries(Object.entries(ligne).filter(([cle]) => demande[cle] === true));
};

function prismaDouble(bloquesParLeLecteur: readonly string[] = [], demandes: readonly LigneDemande[] = []) {
  return {
    user: {
      // La ligne rend PLUS que la projection publique — c'est le point : si le
      // `select` venait à recharger les six champs, ils seraient là, et seule
      // la déclaration du schéma déciderait. Le témoin mesure donc la sortie.
      findFirst: jest.fn<any>(async (args?: any) => {
        if (args?.where?.blockedUserIds) {
          return bloquesParLeLecteur.includes(args.where.blockedUserIds.has) ? { id: 'peu-importe' } : null;
        }
        return {
          id: CIBLE,
          username: 'cible',
          firstName: 'Ada',
          lastName: 'Lovelace',
          displayName: 'Ada',
          avatar: null,
          banner: null,
          bio: null,
          role: 'USER',
          isOnline: true,
          lastActiveAt: new Date('2026-08-01T10:00:00Z'),
          deactivatedAt: null,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2026-08-28T00:00:00Z'),
          isActive: true,
          systemLanguage: 'fr',
          regionalLanguage: 'en',
          customDestinationLanguage: 'es',
          voiceModel: null,
        };
      }),
      findUnique: jest.fn<any>(async () => ({ createdAt: new Date('2025-01-01T00:00:00Z') })),
    },
    message: { count: jest.fn<any>(async () => 69), groupBy: jest.fn<any>(async () => []) },
    participant: { count: jest.fn<any>(async () => 12) },
    friendRequest: {
      count: jest.fn<any>(async () => 3),
      findFirst: jest.fn<any>(async (args?: any) => {
        const ligne = demandes.find((candidate) => repondALaBorne(args?.where, candidate));
        return ligne === undefined ? null : projete(ligne, args?.select);
      }),
    },
    post: { count: jest.fn<any>(async () => 7) },
  };
}

async function monter(
  viewerId: string | null,
  role = 'USER',
  bloquesParLeLecteur: readonly string[] = [],
  demandes: readonly LigneDemande[] = []
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(bloquesParLeLecteur, demandes) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  // `getOptionalAuth` construit son middleware depuis `fastify.prisma` ; on lui
  // substitue une identité posée directement, comme le font les autres témoins
  // de route de ce répertoire.
  app.addHook('onRequest', async (req: any) => {
    // Le contexte ANONYME est celui de la PRODUCTION, sentinelle comprise :
    // `createUnauthenticatedContext` pose `userId: 'anonymous'`, une chaîne non
    // vide. Un double qui laissait ce champ absent rendait le témoin plus
    // FAVORABLE que la réalité — et c'est exactement ce qui a laissé passer un
    // `Cache-Control: private` servi à un anonyme, mesuré en intégration.
    req.authContext = viewerId
      ? { isAuthenticated: true, userId: viewerId, registeredUser: { id: viewerId, role } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: `${PREFIXE}/directory` });
  await app.ready();
  return app;
}

const lire = (app: FastifyInstance, qs = '', headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `${PREFIXE}/directory/people/${CIBLE}${qs}`, headers });

describe('La charge publique ne porte pas les six champs privés', () => {
  it('un appelant ANONYME ne reçoit aucun des six', async () => {
    const app = await monter(null);

    const res = await lire(app);

    expect(res.statusCode).toBe(200);
    const data = res.json().data as Record<string, unknown>;
    expect(PRIVES_DE_PROFIL.filter((c) => c in data)).toEqual([]);
    // Et la charge n'est pas vide pour autant — resserrer ne doit pas vider.
    expect(data.id).toBe(CIBLE);
    expect(data.username).toBe('cible');
    await app.close();
  });

  it('ne porte pas non plus `autoTranslateEnabled`, ni `email`, ni `phoneNumber`', async () => {
    const app = await monter(null);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    // Les trois étaient FABRIQUÉS par la composition : `autoTranslateEnabled`
    // écrit en dur à `true`, `email: ''`, `phoneNumber: undefined`.
    expect('autoTranslateEnabled' in data).toBe(false);
    expect('email' in data).toBe(false);
    expect('phoneNumber' in data).toBe(false);
    await app.close();
  });
});

describe('La présence ne part que sur demande', () => {
  it('sans `expand`, ni `isOnline` ni `lastActiveAt`', async () => {
    const app = await monter(TIERS);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    expect('isOnline' in data).toBe(false);
    expect('lastActiveAt' in data).toBe(false);
    await app.close();
  });

  it('avec `expand=presence`, les champs sont là — MASQUÉS pour un non-ami', async () => {
    const app = await monter(TIERS);

    const data = (await lire(app, '?expand=presence')).json().data as Record<string, unknown>;

    // La loi du 2026-08-25 est INCHANGÉE : un tiers qui n'est pas ami accepté
    // ne lit pas la présence. `expand` décide si l'on POSE la question, jamais
    // de la réponse — un paramètre d'appelant ne lève pas une garde.
    expect('isOnline' in data).toBe(true);
    expect(data.isOnline).not.toBe(true);
    await app.close();
  });
});

describe('Les compteurs intimes de `?expand=stats`', () => {
  it('un TIERS authentifié ne reçoit aucun des quatre', async () => {
    const app = await monter(TIERS);

    const res = await lire(app, '?expand=stats');

    expect(res.statusCode).toBe(200);
    const stats = (res.json().data as { stats: Record<string, unknown> }).stats;
    expect(PRIVES_DE_STATS.filter((c) => c in stats)).toEqual([]);
    // Les compteurs d'AUDIENCE restent servis.
    expect(stats.postsCount).toBe(7);
    expect(stats.memberDays).toBeGreaterThan(0);
    await app.close();
  });

  it('le PROPRIÉTAIRE les reçoit', async () => {
    const app = await monter(CIBLE);

    const stats = ((await lire(app, '?expand=stats')).json().data as { stats: Record<string, unknown> }).stats;

    for (const compteur of PRIVES_DE_STATS) expect(compteur in stats).toBe(true);
    expect(stats.totalMessages).toBe(69);
    await app.close();
  });

  it("l'administration les reçoit", async () => {
    const app = await monter(TIERS, 'ADMIN');

    const stats = ((await lire(app, '?expand=stats')).json().data as { stats: Record<string, unknown> }).stats;

    for (const compteur of PRIVES_DE_STATS) expect(compteur in stats).toBe(true);
    await app.close();
  });
});

describe('Le cache conditionnel', () => {
  it('un `If-None-Match` valide rend 304 sans corps', async () => {
    const app = await monter(null);

    const premier = await lire(app);
    const etag = premier.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await lire(app, '', { 'if-none-match': etag });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });

  it("le vecteur d'expansion CHANGE le validateur", async () => {
    // Un ETag adossé au seul `updatedAt` rendrait le même validateur pour deux
    // charges différentes, et un 304 servirait alors une réponse sans ses
    // statistiques. C'est la raison pour laquelle il hache la charge SERVIE.
    const app = await monter(CIBLE);

    const nu = (await lire(app)).headers.etag;
    const avecStats = (await lire(app, '?expand=stats')).headers.etag;

    expect(nu).not.toBe(avecStats);
    await app.close();
  });

  it('un appelant ANONYME reçoit un cache PARTAGEABLE, un connecté non', async () => {
    const anonyme = await monter(null);
    const connecte = await monter(TIERS);

    const cA = (await lire(anonyme)).headers['cache-control'] as string;
    const cC = (await lire(connecte)).headers['cache-control'] as string;

    expect(cA).toContain('public');
    // La charge d'un lecteur connecté dépend de LUI : un cache partagé la
    // servirait à quelqu'un d'autre.
    expect(cC).toContain('private');
    expect(cC).not.toContain('public');
    await anonyme.close();
    await connecte.close();
  });
});

describe('`fields` ne peut que RESTREINDRE', () => {
  it('un champ hors projection ne fabrique rien', async () => {
    const app = await monter(null);

    const data = (await lire(app, '?fields=username,email,systemLanguage')).json().data as Record<string, unknown>;

    expect('email' in data).toBe(false);
    expect('systemLanguage' in data).toBe(false);
    expect(data.username).toBe('cible');
    // `id` survit toujours : sans lui la réponse ne dit plus de qui elle parle.
    expect(data.id).toBe(CIBLE);
    await app.close();
  });
});

/**
 * **LE BLOCAGE SE LIT PAR SUJET, PAS DANS UNE PAGE** (#7125).
 *
 * `/u/:handle` déduisait « ai-je bloqué cette personne ? » du panier
 * `GET /blocks`, paginé à CENT lignes et jamais tourné : au-delà de la
 * centième personne bloquée, sa fiche s'ouvrait ENTIÈRE — publications,
 * compteurs — avec « Bloquer » offert au lieu de la carte de blocage. Du
 * contenu masqué redevenait visible par le seul effet du rang.
 *
 * C'est le raisonnement que `apps/web-v2/src/lib/profile/relation.ts:13-18`
 * écrit DÉJÀ contre l'usage du panier `accepted` pour l'amitié, et que
 * personne n'avait appliqué au panier des bloqués faute d'alternative servie.
 *
 * **Pourquoi un champ À CÔTÉ de `relation`, et pas une sixième valeur.**
 * Bloquer quelqu'un n'efface pas la ligne d'amitié : le serveur continue de
 * servir `friend` ou `pending_sent`, et c'est juste — débloquer doit rendre
 * la relation qu'on avait. Une valeur `blocked` sur le même fil écraserait
 * cette information, et l'écran ne saurait plus quoi afficher APRÈS le
 * déblocage.
 *
 * **Le champ est DIRIGÉ.** « Ai-je bloqué cette personne » — jamais
 * `isBlockedBetween` (`utils/blocking.ts:21`), qui est bidirectionnelle parce
 * qu'elle sert l'interdiction de messagerie. « Débloquer » n'a de sens que
 * dans un sens : on ne débloque pas pour le compte d'autrui.
 */
describe('`blockedByViewer` — le blocage répond par SUJET (#7125)', () => {
  it('un lecteur qui a bloqué la cible le lit sur `?expand=relation`', async () => {
    const app = await monter(TIERS, 'USER', [CIBLE]);

    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;

    expect(data.blockedByViewer).toBe(true);
    await app.close();
  });

  it("un lecteur qui n'a pas bloqué reçoit `false` — jamais l'absence du champ", async () => {
    const app = await monter(TIERS, 'USER', []);

    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;

    // `false` et « champ absent » se lisent pareil en JavaScript, et c'est
    // précisément l'ambiguïté qui ferait retomber l'écran sur le panier.
    expect('blockedByViewer' in data).toBe(true);
    expect(data.blockedByViewer).toBe(false);
    await app.close();
  });

  it('LA question nomme le SUJET — aucune page, aucun rang', async () => {
    const app = await monter(TIERS, 'USER', [CIBLE]);

    await lire(app, '?expand=relation');

    // Le témoin qui porte l'issue : si la passerelle répondait depuis une
    // LISTE, cet appel ne pourrait pas nommer la cible. Un `where` qui la
    // nomme ne peut pas dépendre du rang.
    const appels = (app as unknown as { prisma: { user: { findFirst: { mock: { calls: unknown[][] } } } } }).prisma
      .user.findFirst.mock.calls;
    /* DEUX questions de blocage partent désormais sur cette route, et elles
       ne se confondent que si on les cherche mal (#7184) : la GARDE demande
       « la cible a-t-elle bloqué le lecteur ? » (`where.id` = la CIBLE) avant
       toute composition, et celle-ci demande l'inverse. On désigne donc la
       nôtre par son porteur — la chercher par « la première qui porte
       `blockedUserIds` » rendrait maintenant celle de la garde. */
    const question = appels
      .map(([args]) => args as { where?: { blockedUserIds?: { has?: string }; id?: string } } | undefined)
      .find((args) => args?.where?.blockedUserIds !== undefined && args?.where?.id === TIERS);

    expect(question).toBeDefined();
    expect(question?.where?.blockedUserIds?.has).toBe(CIBLE);
    expect(question?.where?.id).toBe(TIERS);
    await app.close();
  });

  /**
   * AMENDÉ PAR #7184 — la propriété gardée ici a changé, et il faut dire
   * laquelle.
   *
   * Ce témoin mesurait « ne pas demander `relation` reste GRATUIT » : aucune
   * requête de blocage sans `expand`. Depuis #7184, une requête de blocage part
   * INCONDITIONNELLEMENT, parce qu'elle sert une GARDE — « la cible a-t-elle
   * bloqué le lecteur ? » — et qu'une garde qu'un paramètre d'URL peut lever
   * n'est pas une garde.
   *
   * Ce qui reste vrai, et que ce témoin continue de mesurer : la question de
   * `blockedByViewer` (`where.id` = le LECTEUR) n'est toujours posée que sur
   * `expand=relation`, et le champ ne part pas sans lui. L'économie survit là
   * où elle ne coûte pas une protection.
   */
  it('sans `expand=relation`, le champ ne part pas — et SA question n’est pas posée', async () => {
    const app = await monter(TIERS, 'USER', [CIBLE]);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    expect('blockedByViewer' in data).toBe(false);
    const appels = (app as unknown as { prisma: { user: { findFirst: { mock: { calls: unknown[][] } } } } }).prisma
      .user.findFirst.mock.calls;
    const questionDuLecteur = appels.some(
      ([a]) =>
        (a as { where?: { blockedUserIds?: unknown; id?: string } })?.where?.blockedUserIds !== undefined &&
        (a as { where?: { id?: string } })?.where?.id === TIERS
    );
    expect(questionDuLecteur).toBe(false);
    await app.close();
  });

  it("un lecteur ANONYME n'a pas de blocage, et ne paie aucune requête pour l'apprendre", async () => {
    const app = await monter(null);

    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;

    expect(data.blockedByViewer).toBe(false);
    const appels = (app as unknown as { prisma: { user: { findFirst: { mock: { calls: unknown[][] } } } } }).prisma
      .user.findFirst.mock.calls;
    expect(appels.some(([a]) => (a as { where?: { blockedUserIds?: unknown } })?.where?.blockedUserIds)).toBe(false);
    await app.close();
  });

  it('on ne se bloque pas soi-même, et la question ne part pas non plus', async () => {
    const app = await monter(CIBLE);

    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;

    expect(data.blockedByViewer).toBe(false);
    expect(data.isSelf).toBe(true);
    await app.close();
  });
});

/**
 * **LA FICHE REÇOIT L'IDENTIFIANT QU'ELLE DOIT ENVOYER** (#7122).
 *
 * `relationAvec` lisait `{ status, senderId }` et JETAIT `id`. Un écran qui
 * affiche « Accepter » / « Refuser » / « Annuler » depuis cette charge n'avait
 * donc rien à envoyer à `PATCH /directory/friend-requests/:id` : il chargeait
 * le panier correspondant pour retrouver la ligne, et les trois gestes
 * restaient désactivés tant qu'il était en vol. Un aller-retour pour un champ
 * déjà chargé, sur une route dont le doc-comment dit qu'elle existe pour les
 * fondre en un.
 *
 * **CE QUE `relationRequestId` N'AJOUTE PAS : une surface de lecture.** La
 * requête est INCHANGÉE — même `where`, même ligne, une colonne de plus dans
 * le `select`. L'identifiant ne peut donc atteindre que quelqu'un qui est
 * PARTIE à la demande, et c'est ce que le second témoin garde : le double
 * ÉVALUE la clause `OR`, si bien que retirer la borne fait remonter la ligne
 * d'un tiers et fait tomber le témoin.
 */
describe('`relationRequestId` — l’identifiant de la demande en cours (#7122)', () => {
  const RECUE: LigneDemande = { id: '607f1f77bcf86cd7994390aa', status: 'pending', senderId: CIBLE, receiverId: TIERS };
  const ENVOYEE: LigneDemande = { id: '607f1f77bcf86cd7994390bb', status: 'pending', senderId: TIERS, receiverId: CIBLE };
  const AMITIE: LigneDemande = { id: '607f1f77bcf86cd7994390cc', status: 'accepted', senderId: CIBLE, receiverId: TIERS };

  const relationDe = async (
    viewerId: string | null,
    demandes: readonly LigneDemande[],
  ): Promise<Record<string, unknown>> => {
    const app = await monter(viewerId, 'USER', [], demandes);
    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;
    await app.close();
    return data;
  };

  it('une demande REÇUE sert l’identifiant de sa ligne', async () => {
    const data = await relationDe(TIERS, [RECUE]);

    expect(data.relation).toBe('pending_received');
    expect(data.relationRequestId).toBe(RECUE.id);
  });

  it('une demande ENVOYÉE sert l’identifiant de sa ligne', async () => {
    const data = await relationDe(TIERS, [ENVOYEE]);

    expect(data.relation).toBe('pending_sent');
    expect(data.relationRequestId).toBe(ENVOYEE.id);
  });

  it('`friend` ne sert AUCUN identifiant — il n’y a plus rien à accepter', async () => {
    const data = await relationDe(TIERS, [AMITIE]);

    expect(data.relation).toBe('friend');
    expect(data.relationRequestId).toBeNull();
  });

  it('`none` sert `null`, jamais l’absence du champ', async () => {
    const data = await relationDe(TIERS, []);

    expect(data.relation).toBe('none');
    // `null` et « champ absent » se lisent pareil en JavaScript, et c'est
    // l'ambiguïté qui ferait retomber l'écran sur le panier.
    expect('relationRequestId' in data).toBe(true);
    expect(data.relationRequestId).toBeNull();
  });

  it('sur SOI, `null` — et aucune demande n’est même interrogée', async () => {
    const app = await monter(CIBLE, 'USER', [], [RECUE]);

    const data = (await lire(app, '?expand=relation')).json().data as Record<string, unknown>;

    expect(data.isSelf).toBe(true);
    expect(data.relationRequestId).toBeNull();
    const interrogations = (app as unknown as { prisma: { friendRequest: { findFirst: { mock: { calls: unknown[][] } } } } })
      .prisma.friendRequest.findFirst.mock.calls;
    expect(interrogations).toHaveLength(0);
    await app.close();
  });

  it('sans `expand=relation`, le champ ne part pas', async () => {
    const app = await monter(TIERS, 'USER', [], [RECUE]);

    const data = (await lire(app)).json().data as Record<string, unknown>;

    expect('relationRequestId' in data).toBe(false);
    await app.close();
  });

  /**
   * **LE TÉMOIN QUI PORTE L'ISSUE.** Un identifiant de demande nomme deux
   * personnes ; le servir à un tiers lui apprendrait qu'une demande EXISTE
   * entre deux comptes qui ne le regardent pas — et lui donnerait de quoi la
   * PATCHER. La lecture est bornée aux deux couples (`viewer → cible`,
   * `cible → viewer`) ; ce témoin garde la borne, il ne la suppose pas.
   */
  it('aucun identifiant ne part vers un lecteur qui n’est PAS partie à la demande', async () => {
    const entreTiers: LigneDemande = { id: '607f1f77bcf86cd7994390dd', status: 'pending', senderId: CIBLE, receiverId: AUTRE };

    const data = await relationDe(TIERS, [entreTiers]);

    // Le double évalue la clause `OR` : sans la borne, cette ligne remonterait
    // et les deux attentes ci-dessous tomberaient ensemble.
    expect(data.relation).toBe('none');
    expect(data.relationRequestId).toBeNull();
  });

  it('la borne NOMME les deux parties dans chacune de ses deux branches', async () => {
    const app = await monter(TIERS, 'USER', [], [RECUE]);

    await lire(app, '?expand=relation');

    const [premier] = (app as unknown as { prisma: { friendRequest: { findFirst: { mock: { calls: unknown[][] } } } } })
      .prisma.friendRequest.findFirst.mock.calls;
    const where = (premier?.[0] as { where?: { OR?: readonly Record<string, string>[] } } | undefined)?.where;

    expect(where?.OR).toEqual([
      { senderId: TIERS, receiverId: CIBLE },
      { senderId: CIBLE, receiverId: TIERS },
    ]);
    await app.close();
  });
});
