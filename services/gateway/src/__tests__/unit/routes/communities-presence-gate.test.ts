/**
 * `routes/communities.ts` — la présence des membres passe-t-elle par un gate ?
 *
 * Ce fichier monte le VRAI module de routes servi en production et les VRAIS
 * schémas de réponse (`api-schemas` n'est PAS mocké) : ce qu'il observe est ce
 * que fast-json-stringify laisse réellement sortir. C'est la leçon du cycle 84 —
 * « entre la requête et le fil il y a un sérialiseur, et il faut l'avoir
 * traversé pour parler » — appliquée d'emblée plutôt qu'après coup.
 *
 * Pourquoi CE module et pas `routes/communities/members.ts`, où le gate existe
 * depuis des cycles : `route-registration.ts` importe `'./routes/communities'`,
 * et Node résout LOAD_AS_FILE avant LOAD_AS_DIRECTORY. C'est donc
 * `routes/communities.ts` qui sert, et le répertoire voisin est injoignable.
 * `module-shadowing.test.ts` garde ce fait.
 *
 * UN SEUL régime désormais (directive produit 2026-08-25, verbatim : « ce
 * n'est pas parce qu'on partage une conversation/communauté qu'on doit voir
 * la présence de l'autre »). La co-appartenance à une communauté ne vaut plus
 * d'accès : membre ou pas, chaque profil rendu passe par le critère STRICT
 * (`resolveForTarget`/`resolveForTargets`), avec le viewer RÉEL de la
 * requête — self/admin global toujours servi, un tiers seulement s'il est
 * ami accepté (et alors selon SES préférences), tout le reste masqué. Le
 * régime préférences-seules que la co-appartenance accordait a disparu avec
 * la loi qui le fondait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockResolveForTargets = jest.fn<any>();
const mockResolveForTarget = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
    resolveForTarget: (...args: any[]) => mockResolveForTarget(...args),
  }),
}));

import { communityRoutes } from '../../../routes/communities';
import { gateConversationParticipantsPresence } from '../../../routes/communities/member-presence';

const VIEWER_ID = 'usr-viewer';
const SHY_ID = 'usr-shy';
const OPEN_ID = 'usr-open';
const COMM_ID = '507f1f77bcf86cd799439011';

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

// La forme RÉELLE que pose `middleware/auth.ts` (`type: 'user'`), et non le
// `type: 'registered'` qu'emploient les suites voisines : le viewer du critère
// strict se lit sur ce champ, un libellé approximatif le rendrait `null` et
// masquerait tout — ce qui ferait passer un test pour la mauvaise raison.
const authContextFor = (userId: string, role: string = 'USER') => ({
  type: 'user' as const,
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'viewer', displayName: 'Viewer', role },
});

const memberRow = (userId: string, isOnline: boolean) => ({
  id: `mem-${userId}`,
  communityId: COMM_ID,
  userId,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isActive: true,
  user: {
    id: userId,
    username: userId,
    displayName: userId,
    avatar: null,
    isOnline,
    lastActiveAt: new Date('2026-08-22T10:00:00.000Z'),
  },
});

type AppOpts = {
  readonly viewerId?: string;
  readonly viewerRole?: string;
  // Permet de poser un authContext qui ne respecte PAS la forme réelle
  // (`type: 'user'` absent) — le seul moyen de faire échouer `viewerFromRequest`
  // à la source plutôt qu'en mockant le résolveur pour le simuler.
  readonly authContextOverride?: Record<string, unknown>;
  readonly community?: Record<string, unknown>;
  readonly members?: ReadonlyArray<ReturnType<typeof memberRow>>;
  readonly createdMember?: Record<string, unknown>;
};

async function buildApp(opts: AppOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const viewerId = opts.viewerId ?? VIEWER_ID;

  app.decorate('authenticate', async (req: any) => {
    req.authContext = opts.authContextOverride ?? authContextFor(viewerId, opts.viewerRole);
  });

  app.decorate('prisma', {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue(
        opts.community ?? {
          id: COMM_ID,
          createdBy: VIEWER_ID,
          isPrivate: false,
          members: [{ userId: VIEWER_ID, role: 'admin' }],
        },
      ),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue(opts.members ?? [memberRow(SHY_ID, true)]),
      count: jest.fn<any>().mockResolvedValue((opts.members ?? [1]).length),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(opts.createdMember ?? memberRow(SHY_ID, true)),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: SHY_ID }),
    },
  } as any);

  await communityRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockResolveForTargets.mockReset().mockResolvedValue(new Map());
  mockResolveForTarget.mockReset().mockResolvedValue(HIDDEN);
});

describe('GET /communities/:id/members — critère STRICT, membre ou non de la communauté', () => {
  it('masque la présence d’un co-membre USER que le critère strict n’autorise pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({ members: [memberRow(SHY_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data[0].user.isOnline).toBe(false);
  });

  it('conserve la présence du membre que le résolveur strict autorise', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(OPEN_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(true);
  });

  it('résout sur les `User.id` des membres, une seule fois, avec le viewer réel', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE], [OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(SHY_ID, false), memberRow(OPEN_ID, true)] });

    await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'USER' }, [SHY_ID, OPEN_ID]);
  });

  // Le défaut d'entrée absente est désormais 'hide' — le SEUL régime qui
  // reste. Un id que le résolveur strict n'a pas rendu n'est pas autorisé.
  it('masque un membre que le résolveur strict n’a pas rendu', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const app = await buildApp({ members: [memberRow(SHY_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(false);
  });

  // `lastActiveAt` n'est pas déclaré par `userMinimalSchema`. Il ne sort donc
  // d'aucune de ces portes — et ce témoin garde CETTE porte-là : le jour où
  // quelqu'un déclare le champ pour le faire vivre, il tombe, et l'oblige à
  // constater que le gate le couvre déjà.
  it('ne laisse sortir aucun `lastActiveAt`, même autorisé', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(OPEN_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.lastActiveAt).toBeUndefined();
  });

  // Preuve directe que la co-appartenance ne bifurque plus rien : un
  // non-membre d'une communauté PUBLIQUE reçoit exactement le même
  // traitement qu'un co-membre — un seul appel, le viewer réel, aucune
  // branche qui les distingue.
  it('traite un outsider d’une communauté publique exactement comme un co-membre', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({
      viewerId: 'usr-outsider',
      community: { id: COMM_ID, createdBy: 'usr-someone-else', isPrivate: false, members: [] },
      members: [memberRow(SHY_ID, true)],
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: 'usr-outsider', role: 'USER' }, [SHY_ID]);
    expect(body.data[0].user.isOnline).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les quatre témoins que la directive produit 2026-08-25 réclame explicitement.
// La POLITIQUE elle-même (self/admin/ami/préférences) est gravée et testée
// dans `resolvePresenceVisibility` (packages/shared) et
// `PresenceVisibilityService` — ces témoins-ci gardent le CÂBLAGE : que la
// route consulte bien le critère strict avec le bon viewer, dans TOUS les cas,
// et qu'elle honore fidèlement ce que le résolveur répond.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /communities/:id/members — témoins de la directive produit 2026-08-25', () => {
  it('co-membre USER non ami ⇒ masqué', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({ members: [memberRow(SHY_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(false);
  });

  it('ADMIN non membre de la communauté ⇒ visible', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));
    const app = await buildApp({
      viewerId: 'usr-admin',
      viewerRole: 'ADMIN',
      community: { id: COMM_ID, createdBy: 'usr-someone-else', isPrivate: false, members: [] },
      members: [memberRow(SHY_ID, true)],
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: 'usr-admin', role: 'ADMIN' }, [SHY_ID]);
    expect(body.data[0].user.isOnline).toBe(true);
  });

  // MODERATOR (comme AUDIT et ANALYST) est un utilisateur ORDINAIRE pour la
  // directive — « Admin et supérieur » seulement. La route ne PROMEUT pas le
  // rôle : il part tel quel au résolveur, qui seul le juge, et elle honore le
  // masquage qu'il rend. Une route qui « élèverait » un modérateur en admin
  // tomberait ici sur l'argument transmis.
  it('MODERATOR ⇒ masqué — le rôle part tel quel au résolveur, sans promotion', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({
      viewerId: 'usr-modo',
      viewerRole: 'MODERATOR',
      community: { id: COMM_ID, createdBy: 'usr-someone-else', isPrivate: false, members: [] },
      members: [memberRow(SHY_ID, true)],
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: 'usr-modo', role: 'MODERATOR' }, [SHY_ID]);
    expect(body.data[0].user.isOnline).toBe(false);
  });

  it('ami ⇒ visible sous ses propres préférences', async () => {
    mockResolveForTargets.mockResolvedValue(
      new Map([[OPEN_ID, { showOnline: true, showLastSeenTimestamp: false }]]),
    );
    const app = await buildApp({ members: [memberRow(OPEN_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(true);
  });

  // Un authContext sans `type: 'user'` (session non reconnue par le
  // middleware) fait rendre `null` par `viewerFromRequest` — exactement la
  // forme d'une route publique sans utilisateur identifié.
  it('viewer null (route publique) ⇒ masqué', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const app = await buildApp({
      members: [memberRow(SHY_ID, true)],
      authContextOverride: { isAuthenticated: true, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID } },
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledWith(null, [SHY_ID]);
    expect(body.data[0].user.isOnline).toBe(false);
  });

  // Une session ANONYME (`type: 'anonymous'`, sans `registeredUser`) est
  // refoulée par la garde de la route elle-même — et, en production, par
  // `fastify.authenticate` (`allowAnonymous: false`) avant même d'y entrer.
  // Aucune liste servie, donc aucune présence : « anonyme ⇒ caché » se
  // satisfait ici sans qu'une seule résolution ne s'ouvre.
  it('session anonyme ⇒ 401, aucune résolution ouverte', async () => {
    const app = await buildApp({
      members: [memberRow(SHY_ID, true)],
      authContextOverride: { type: 'anonymous', isAuthenticated: true, userId: 'anon-1', registeredUser: null },
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

describe('POST /communities/:id/members — l’adhérent ajouté (critère STRICT, viewer = l’admin qui ajoute)', () => {
  it('sert HORS LIGNE l’adhérent que le critère strict n’autorise pas', async () => {
    mockResolveForTarget.mockResolvedValue(HIDDEN);
    const app = await buildApp({ createdMember: memberRow(SHY_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/members`,
      payload: { userId: SHY_ID, role: 'member' },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(false);
    expect(mockResolveForTarget).toHaveBeenCalledWith(
      { userId: VIEWER_ID, role: 'USER' },
      { id: SHY_ID, deactivatedAt: null },
    );
  });

  it('conserve la présence de l’adhérent que le critère strict autorise', async () => {
    mockResolveForTarget.mockResolvedValue(VISIBLE);
    const app = await buildApp({ createdMember: memberRow(OPEN_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/members`,
      payload: { userId: OPEN_ID, role: 'member' },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data.user.isOnline).toBe(true);
  });
});

describe('POST /communities/:id/invite — l’invité (critère STRICT, viewer = l’inviteur)', () => {
  it('sert HORS LIGNE l’invité que le critère strict n’autorise pas', async () => {
    mockResolveForTarget.mockResolvedValue(HIDDEN);
    const app = await buildApp({ createdMember: memberRow(SHY_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/invite`,
      payload: { userId: SHY_ID },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(false);
    expect(mockResolveForTarget).toHaveBeenCalledWith(
      { userId: VIEWER_ID, role: 'USER' },
      { id: SHY_ID, deactivatedAt: null },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Un compte DÉSACTIVÉ est masqué pour TOUS — la loi (`resolvePresenceVisibility`)
// tranche `targetIsDeactivated` AVANT tout privilège, et `resolveForTarget` la
// suit… à condition qu'on lui REMETTE `deactivatedAt` : ce chemin unitaire ne
// relit pas la base (la porte batchée, elle, lit le champ d'elle-même), et
// `PresenceTarget.deactivatedAt` est optionnel — omis, la cible passe pour
// active. C'est ce que ces deux routes faisaient (constat F1-2, 2026-08-26).
// Le mock est FIDÈLE à la loi sur ce point : HIDDEN dès que `deactivatedAt`
// est posé, FULL sinon — pour un ADMIN, seule la désactivation peut masquer.
// ─────────────────────────────────────────────────────────────────────────────

const DEACTIVATED_AT = new Date('2026-07-01T00:00:00.000Z');

const lawfulResolveForTarget = async (_viewer: unknown, target: { readonly deactivatedAt?: Date | null }) =>
  target.deactivatedAt ? HIDDEN : VISIBLE;

const deactivatedMemberRow = () => {
  const row = memberRow(SHY_ID, true);
  return { ...row, user: { ...row.user, deactivatedAt: DEACTIVATED_AT } };
};

const singleMemberWriteRoutes: ReadonlyArray<[route: string, url: string, payload: Record<string, string>]> = [
  ['POST /communities/:id/members', `/communities/${COMM_ID}/members`, { userId: SHY_ID, role: 'member' }],
  ['POST /communities/:id/invite', `/communities/${COMM_ID}/invite`, { userId: SHY_ID }],
];

describe.each(singleMemberWriteRoutes)('%s — cible DÉSACTIVÉE ⇒ masquée même pour un ADMIN', (_route, url, payload) => {
  it('remet `deactivatedAt` à la loi, qui masque — et le champ lui-même ne sort pas', async () => {
    mockResolveForTarget.mockImplementation(lawfulResolveForTarget);
    const app = await buildApp({ viewerId: 'usr-admin', viewerRole: 'ADMIN', createdMember: deactivatedMemberRow() });

    const res = await app.inject({ method: 'POST', url, payload });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockResolveForTarget).toHaveBeenCalledWith(
      { userId: 'usr-admin', role: 'ADMIN' },
      { id: SHY_ID, deactivatedAt: DEACTIVATED_AT },
    );
    expect(body.data.user.isOnline).toBe(false);
    expect(body.data.user.deactivatedAt).toBeUndefined();
  });

  // Le mock rend la fixture quel que soit le `select` : seule la forme de la
  // requête atteste que la production LIT bien le champ qu'elle remet.
  it('demande `deactivatedAt` au `select` du profil créé', async () => {
    const app = await buildApp({ viewerId: 'usr-admin', viewerRole: 'ADMIN', createdMember: deactivatedMemberRow() });

    await app.inject({ method: 'POST', url, payload });
    const create = app.prisma.communityMember.create;
    await app.close();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      include: { user: { select: expect.objectContaining({ deactivatedAt: true }) } },
    }));
  });

  it('cible ACTIVE ⇒ `deactivatedAt: null` remis, présence servie à l’ADMIN', async () => {
    mockResolveForTarget.mockImplementation(lawfulResolveForTarget);
    const app = await buildApp({ viewerId: 'usr-admin', viewerRole: 'ADMIN', createdMember: memberRow(SHY_ID, true) });

    const res = await app.inject({ method: 'POST', url, payload });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolveForTarget).toHaveBeenCalledWith(
      { userId: 'usr-admin', role: 'ADMIN' },
      { id: SHY_ID, deactivatedAt: null },
    );
    expect(body.data.user.isOnline).toBe(true);
  });
});

// La borne du lot : `POST /join` sert le MÊME schéma et le même `include`, mais
// la cible y est le lecteur lui-même. Sa présence n'a pas à être filtrée, et ce
// témoin fige qu'on ne l'a pas filtrée « par symétrie ».
describe('POST /communities/:id/join — la cible est le lecteur', () => {
  it('ne consulte aucun gate et sert la présence telle quelle', async () => {
    const app = await buildApp({ createdMember: memberRow(VIEWER_ID, true) });

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(true);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
    expect(mockResolveForTarget).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /communities/search — critère STRICT, quelle que soit l'appartenance
//
// `communities-search-live.test.ts` (cycle 86, PR #3302) garde déjà ce que la
// route SERT : `creator` et `members[]` porteurs de leurs champs, masquage sous
// le critère strict, aperçu limité aux appartenances actives. Ces témoins-ci ne
// les redoublent pas — ils gardent ce que cette suite-là n'observe pas : que
// TOUS les membres de la page partent au MÊME résolveur strict, avec le viewer
// réel, sans plus aucune bifurcation par appartenance.
// ─────────────────────────────────────────────────────────────────────────────

const searchCommunity = (id: string, members: ReadonlyArray<ReturnType<typeof memberRow>>) => ({
  id,
  name: 'Tech',
  identifier: 'mshy_tech',
  description: null,
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  creator: { id: VIEWER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members,
  _count: { members: members.length, Conversation: 0 },
});

async function search(opts: {
  communities: ReadonlyArray<ReturnType<typeof searchCommunity>>;
  viewerRole?: string;
  authContextOverride?: Record<string, unknown>;
}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = opts.authContextOverride ?? authContextFor(VIEWER_ID, opts.viewerRole);
  });
  app.decorate('prisma', {
    community: {
      findMany: jest.fn<any>().mockResolvedValue(opts.communities),
      count: jest.fn<any>().mockResolvedValue(opts.communities.length),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  } as any);
  await communityRoutes(app);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
  await app.close();
  return res.json();
}

describe('GET /communities/search — critère STRICT, quelle que soit l’appartenance du viewer', () => {
  it('envoie les membres de la page au critère strict, avec le viewer réel', async () => {
    await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: VIEWER_ID, role: 'USER' },
      [SHY_ID],
    );
  });

  // Directive produit 2026-08-25 : un membre rencontré dans une communauté
  // dont le lecteur EST lui-même membre ne bascule plus vers un régime
  // préférences-seules — le régime PAR LIGNE a disparu avec la loi qui le
  // fondait. Tous les membres de la page, dédupliqués, partent au même
  // résolveur strict.
  it('reste au critère strict, dédupliqué sur toute la page, membre ou pas', async () => {
    await search({
      communities: [
        searchCommunity(COMM_ID, [memberRow(SHY_ID, true)]),
        searchCommunity('comm-2', [memberRow(SHY_ID, true), memberRow(OPEN_ID, true)]),
      ],
    });

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'USER' }, [SHY_ID, OPEN_ID]);
  });

  it('n’ouvre aucune résolution sur une page sans membre', async () => {
    await search({ communities: [searchCommunity(COMM_ID, [])] });

    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  // Les témoins de rôle de la directive, sur la surface la plus exposée — une
  // recherche PUBLIQUE, sans condition d'appartenance. Le résolveur est mocké :
  // ce que ces témoins gardent est que la route lui remet le viewer TEL QUEL
  // (ni promu, ni oublié) et honore fidèlement ce qu'il répond.
  it('ADMIN ⇒ le rôle part tel quel au résolveur, et la présence servie est rendue', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));
    const body = await search({
      communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])],
      viewerRole: 'ADMIN',
    });

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'ADMIN' }, [SHY_ID]);
    expect(body.data[0].members[0].user.isOnline).toBe(true);
  });

  it('MODERATOR ⇒ masqué — le rôle part tel quel au résolveur, sans promotion', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const body = await search({
      communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])],
      viewerRole: 'MODERATOR',
    });

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'MODERATOR' }, [SHY_ID]);
    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });

  // La route ne pose aucune garde `registeredUser` de son cru : une session
  // sans `type: 'user'` (non reconnue par le middleware) traverse jusqu'au
  // résolveur, qui reçoit `null` — la forme « viewer sans compte » du critère
  // strict — et la page sort entièrement masquée.
  it('viewer null (session sans compte reconnu) ⇒ résolu avec `null`, masqué', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const body = await search({
      communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])],
      authContextOverride: { isAuthenticated: true, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID } },
    });

    expect(mockResolveForTargets).toHaveBeenCalledWith(null, [SHY_ID]);
    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /communities/:id/conversations — critère STRICT, viewer réel
//
// Être co-participant de la même conversation ne vaut plus d'accès à la
// présence de l'autre (directive produit 2026-08-25) : le régime
// préférences-seules qu'accordait la co-participation — « contexte d'accès
// garanti des deux côtés » — a disparu avec la loi qui le fondait. Chaque
// participant part désormais au résolveur strict (`resolveForTargets`), avec
// le viewer réel de la requête, exactement comme la liste des membres.
//
// Le schéma, lui, déclarait `members[]` (que le handler ne produit pas) et
// supprimait `participants` (qu'il produit), avec un `user: { type: 'object' }`
// nu par-dessus. La réponse sortait sans titre, sans type et sans participants
// — pendant que le web la type `Conversation[]`.
// ─────────────────────────────────────────────────────────────────────────────

const CONVO_ID = '507f1f77bcf86cd799439077';

async function fetchCommunityConversations(
  participants: ReadonlyArray<Record<string, unknown>>,
  viewerRole?: string,
) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authContextFor(VIEWER_ID, viewerRole); });
  app.decorate('prisma', {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        createdBy: VIEWER_ID,
        isPrivate: false,
        members: [{ userId: VIEWER_ID }],
      }),
    },
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([{
        id: CONVO_ID,
        identifier: 'mshy_general',
        title: 'Général',
        type: 'group',
        description: null,
        avatar: null,
        banner: null,
        isActive: true,
        communityId: COMM_ID,
        memberCount: 2,
        lastMessageAt: new Date('2026-08-22T10:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-22T10:00:00.000Z'),
        participants,
        _count: { messages: 12, participants: 2 },
      }]),
    },
  } as any);
  await communityRoutes(app);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/conversations` });
  await app.close();
  return res.json().data[0];
}

// La présence de la LIGNE `Participant` — distincte de `user.isOnline` — et
// les secrets d'un participant anonyme. Des valeurs UNIQUES, pour qu'un
// `not.toContain` sur le corps sérialisé les attrape où qu'elles ressortent.
const ROW_LAST_ACTIVE = '2026-08-23T11:22:33.000Z';
const ANON_IP = '203.0.113.7';
const ANON_FINGERPRINT = 'fp-anonyme-0001';

const convoParticipant = (userId: string | null, isOnline: boolean) => ({
  id: `part-${userId ?? 'anon'}`,
  userId,
  displayName: userId ?? 'Invité',
  role: 'member',
  isActive: true,
  // Le handler fait `include`, pas `select` : TOUTES les colonnes scalaires de
  // `Participant` arrivent — sa PROPRE présence (celle de la ligne), le
  // SHA-256 du jeton de session anonyme dénormalisé pour la recherche indexée
  // et, pour un anonyme, le composite `anonymousSession` (adresse IP,
  // empreinte d'appareil). Portés par la fixture de TOUS les témoins des deux
  // routes ; les témoins de liste fermée attestent qu'aucun n'en sort.
  isOnline,
  lastActiveAt: new Date(ROW_LAST_ACTIVE),
  sessionTokenHash: 'sha256-jeton-de-session-anonyme',
  ...(userId ? {} : {
    anonymousSession: {
      shareLinkId: 'link-0001',
      session: {
        sessionTokenHash: 'sha256-jeton-de-session-anonyme',
        ipAddress: ANON_IP,
        country: 'FR',
        deviceFingerprint: ANON_FINGERPRINT,
        connectedAt: new Date(ROW_LAST_ACTIVE),
      },
      profile: { firstName: 'Anne', lastName: 'Onyme', username: 'anonyme' },
    },
  }),
  user: userId ? { id: userId, username: userId, displayName: userId, avatar: null, isOnline } : null,
});

describe('GET /communities/:id/conversations — la conversation atteint le fil', () => {
  it('sert titre, type et identifiant — le web la type `Conversation[]`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)]);

    expect(convo).toMatchObject({
      id: CONVO_ID, identifier: 'mshy_general', title: 'Général', type: 'group', isActive: true,
    });
  });

  // Ce que la réparation de la dérive de noms aurait pu coûter. Le réflexe
  // devant une clé déclarée qui ne correspond à aucune clé posée est d'ouvrir
  // le sérialiseur — `additionalProperties: true` répare les trois dérives de
  // cette route en une ligne. Il aurait aussi publié le `sessionTokenHash` de
  // chaque participant anonyme à tout membre de la communauté, puisque le
  // handler fait `include`. La liste du schéma est FERMÉE ; ce témoin garde ce
  // choix, et tombe sur la ligne qui l'ouvrirait.
  it('ne laisse JAMAIS sortir le `sessionTokenHash` de la ligne Participant', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)]);
    const serialised = JSON.stringify(convo);

    expect(convo.participants[0].sessionTokenHash).toBeUndefined();
    expect(serialised).not.toContain('sessionTokenHash');
    expect(serialised).not.toContain('sha256-jeton-de-session-anonyme');
  });

  it('ne laisse sortir ni la présence de la LIGNE Participant, ni `anonymousSession`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true), convoParticipant(null, true)]);
    const serialised = JSON.stringify(convo);

    expect(convo.participants[0].isOnline).not.toBe(true);
    expect(convo.participants[1].anonymousSession).toBeUndefined();
    expect(serialised).not.toContain(ROW_LAST_ACTIVE);
    expect(serialised).not.toContain(ANON_IP);
    expect(serialised).not.toContain(ANON_FINGERPRINT);
  });

  it('sert `participants` — le schéma déclarait `members`, que rien ne produit', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)]);

    expect(convo.participants).toHaveLength(1);
    expect(convo.participants[0]).toMatchObject({ userId: SHY_ID, role: 'member' });
    expect(convo.participants[0].user).toMatchObject({ id: SHY_ID });
    expect(convo._count).toMatchObject({ messages: 12, participants: 2 });
  });
});

describe('GET /communities/:id/conversations — gate de présence', () => {
  it('masque la présence d’un co-participant que le critère strict n’autorise pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)]);

    expect(convo.participants[0].user.isOnline).toBe(false);
  });

  it('conserve la présence que le critère strict autorise', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));

    const convo = await fetchCommunityConversations([convoParticipant(OPEN_ID, true)]);

    expect(convo.participants[0].user.isOnline).toBe(true);
  });

  it('résout au critère STRICT, avec le viewer réel — jamais le régime préférences-seules', async () => {
    await fetchCommunityConversations([convoParticipant(SHY_ID, true)]);

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'USER' }, [SHY_ID]);
  });

  it('ADMIN ⇒ le rôle part tel quel au résolveur, et la présence servie est rendue', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)], 'ADMIN');

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'ADMIN' }, [SHY_ID]);
    expect(convo.participants[0].user.isOnline).toBe(true);
  });

  it('MODERATOR ⇒ masqué — le rôle part tel quel au résolveur, sans promotion', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const convo = await fetchCommunityConversations([convoParticipant(SHY_ID, true)], 'MODERATOR');

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'MODERATOR' }, [SHY_ID]);
    expect(convo.participants[0].user.isOnline).toBe(false);
  });

  it('laisse un participant anonyme visible', async () => {
    const convo = await fetchCommunityConversations([convoParticipant(null, true)]);

    // `user` est déclaré `nullable: true` : un participant anonyme n'en a pas,
    // et le sérialiseur rend `null` — il ne supprime pas la clé. La ligne reste
    // servie, et aucune résolution n'est ouverte faute de `userId`.
    expect(convo.participants[0].user).toBeNull();
    expect(convo.participants[0]).toMatchObject({ userId: null, displayName: 'Invité' });
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /communities/:id/conversations/:conversationId — la réponse portait
// `user.isOnline` BRUT, sans aucun gate (contrairement au GET voisin, dont le
// `include` sur `participants.user` est IDENTIQUE). Le schéma de cette route
// était `additionalProperties: true`, ce qui ne l'exemptait pas du gate — il
// n'y avait simplement jamais été posé.
//
// Puis (constat F1-1, 2026-08-26) : le gate posé ne réécrivait que `user`, et
// le schéma ouvert publiait le reste de la ligne `Participant` que l'`include`
// rend entière — sa PROPRE présence, `sessionTokenHash`, `anonymousSession`.
// La route sert désormais la MÊME liste fermée que le GET.
// ─────────────────────────────────────────────────────────────────────────────

async function postConversationToCommunity(
  participants: ReadonlyArray<Record<string, unknown>>,
  viewerRole?: string,
) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authContextFor(VIEWER_ID, viewerRole); });
  app.decorate('prisma', {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM_ID,
        createdBy: VIEWER_ID,
        members: [{ userId: VIEWER_ID, role: 'admin' }],
      }),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: CONVO_ID,
        communityId: null,
        // L'appelant administre la conversation : la route l'exige depuis
        // #4191 (« admin/creator of BOTH »), ce que son Swagger promettait déjà.
        participants: [{ userId: VIEWER_ID, role: 'admin', isActive: true }],
      }),
      update: jest.fn<any>().mockResolvedValue({
        id: CONVO_ID,
        identifier: 'mshy_general',
        title: 'Général',
        type: 'group',
        communityId: COMM_ID,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-22T10:00:00.000Z'),
        participants,
        _count: { messages: 0, participants: participants.length },
      }),
    },
  } as any);
  await communityRoutes(app);
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: `/communities/${COMM_ID}/conversations/${CONVO_ID}`,
  });
  await app.close();
  return res.json().data;
}

describe('POST /communities/:id/conversations/:conversationId — gate de présence', () => {
  it('masque la présence d’un participant que le critère strict n’autorise pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const data = await postConversationToCommunity([convoParticipant(SHY_ID, true)]);

    expect(data.participants[0].user.isOnline).toBe(false);
  });

  it('conserve la présence que le critère strict autorise', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));

    const data = await postConversationToCommunity([convoParticipant(OPEN_ID, true)]);

    expect(data.participants[0].user.isOnline).toBe(true);
  });

  it('résout au critère STRICT, avec le viewer réel', async () => {
    await postConversationToCommunity([convoParticipant(SHY_ID, true)]);

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'USER' }, [SHY_ID]);
  });

  it('ADMIN ⇒ le rôle part tel quel au résolveur, et la présence servie est rendue', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const data = await postConversationToCommunity([convoParticipant(SHY_ID, true)], 'ADMIN');

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'ADMIN' }, [SHY_ID]);
    expect(data.participants[0].user.isOnline).toBe(true);
  });

  it('MODERATOR ⇒ masqué — le rôle part tel quel au résolveur, sans promotion', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const data = await postConversationToCommunity([convoParticipant(SHY_ID, true)], 'MODERATOR');

    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'MODERATOR' }, [SHY_ID]);
    expect(data.participants[0].user.isOnline).toBe(false);
  });

  it('laisse un participant anonyme visible', async () => {
    const data = await postConversationToCommunity([convoParticipant(null, true)]);

    expect(data.participants[0].user).toBeNull();
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

describe('POST /communities/:id/conversations/:conversationId — liste FERMÉE, la même que le GET', () => {
  // Un `include` rend la ligne `Participant` ENTIÈRE, et `additionalProperties:
  // true` la publiait telle quelle à l'admin qui rattache la conversation :
  // la présence de la LIGNE (que `gateRow` ne réécrivait pas — il ne masquait
  // que `user`), le jeton de session hashé, la session anonyme. Rouvrir le
  // schéma fait tomber ces témoins.
  it('USER non-ami : la présence de la LIGNE Participant est masquée et `sessionTokenHash` ne sort pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const data = await postConversationToCommunity([convoParticipant(SHY_ID, true)]);
    const serialised = JSON.stringify(data);

    expect(data.participants[0].isOnline).not.toBe(true);
    expect(data.participants[0].lastActiveAt ?? null).toBeNull();
    expect(serialised).not.toContain(ROW_LAST_ACTIVE);
    expect(serialised).not.toContain('sessionTokenHash');
    expect(serialised).not.toContain('sha256-jeton-de-session-anonyme');
    expect(data.participants[0].user.isOnline).toBe(false);
  });

  it('participant anonyme : ni `anonymousSession`, ni adresse IP, ni empreinte d’appareil, ni présence de ligne', async () => {
    const data = await postConversationToCommunity([convoParticipant(null, true)]);
    const serialised = JSON.stringify(data);

    expect(data.participants[0].anonymousSession).toBeUndefined();
    expect(data.participants[0].isOnline).not.toBe(true);
    expect(serialised).not.toContain(ANON_IP);
    expect(serialised).not.toContain(ANON_FINGERPRINT);
    expect(serialised).not.toContain('sessionTokenHash');
  });

  // iOS (`CommunityService.addConversation`) et Android (`CommunityApi`)
  // décodent la même `APIConversation` des deux routes : fermer la liste ne
  // doit rien leur retirer de ce que le GET leur sert déjà.
  it('sert ce que le GET sert — identité, titre, type, participants gatés, `_count`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));

    const data = await postConversationToCommunity([convoParticipant(SHY_ID, true)]);

    expect(data).toMatchObject({
      id: CONVO_ID,
      communityId: COMM_ID,
      identifier: 'mshy_general',
      title: 'Général',
      type: 'group',
      createdAt: '2026-08-01T00:00:00.000Z',
      _count: { messages: 0, participants: 1 },
    });
    expect(data.participants[0]).toMatchObject({
      userId: SHY_ID,
      role: 'member',
      user: { id: SHY_ID, username: SHY_ID, isOnline: true },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `gateConversationParticipantsPresence` — la présence de la LIGNE Participant
// est masquée avec la MÊME visibilité que `user`. Le schéma fermé la retient
// déjà à la sérialisation ; ces témoins gardent la PORTE elle-même, pour le
// jour où un schéma déclarerait `isOnline` sur la ligne : il la trouverait
// masquée, et non brute.
// ─────────────────────────────────────────────────────────────────────────────

describe('gateConversationParticipantsPresence — présence de la LIGNE Participant', () => {
  const viewer = { userId: VIEWER_ID, role: 'USER' as const };
  // Le service est mocké (voir l'en-tête) : le client Prisma n'est jamais lu.
  const prismaNeverRead = {} as never;
  const gate = (participants: ReadonlyArray<ReturnType<typeof convoParticipant>>) =>
    gateConversationParticipantsPresence(prismaNeverRead, viewer, [{ id: CONVO_ID, participants }]);

  it('HIDDEN ⇒ `isOnline` de la ligne à false et `lastActiveAt` à null — comme `user`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const [convo] = await gate([convoParticipant(SHY_ID, true)]);

    expect(convo.participants[0]).toMatchObject({ isOnline: false, lastActiveAt: null, user: { isOnline: false } });
  });

  it('VISIBLE ⇒ la présence de la ligne est conservée, comme celle de `user`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));

    const [convo] = await gate([convoParticipant(OPEN_ID, true)]);

    expect(convo.participants[0]).toMatchObject({
      isOnline: true,
      lastActiveAt: new Date(ROW_LAST_ACTIVE),
      user: { isOnline: true },
    });
  });

  it('ami sous préférences (en ligne oui, dernière connexion non) ⇒ la ligne suit les mêmes drapeaux', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, { showOnline: true, showLastSeenTimestamp: false }]]));

    const [convo] = await gate([convoParticipant(OPEN_ID, true)]);

    expect(convo.participants[0]).toMatchObject({ isOnline: true, lastActiveAt: null });
  });

  // Sans profil, aucune résolution ne s'ouvre et aucune visibilité n'existe :
  // une porte de confidentialité refuse ce qu'elle ne sait pas (défaut `hide`).
  it('participant anonyme (sans profil) ⇒ ligne masquée, aucune résolution ouverte', async () => {
    const [convo] = await gate([convoParticipant(null, true)]);

    expect(convo.participants[0]).toMatchObject({ isOnline: false, lastActiveAt: null, user: null });
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  it('ne fabrique aucune clé de présence sur une ligne qui n’en porte pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));

    const [convo] = await gateConversationParticipantsPresence(prismaNeverRead, viewer, [
      { id: CONVO_ID, participants: [{ user: { id: SHY_ID, isOnline: true } }] },
    ]);

    expect(convo.participants[0]).not.toHaveProperty('isOnline');
    expect(convo.participants[0]).not.toHaveProperty('lastActiveAt');
    expect(convo.participants[0].user).toMatchObject({ isOnline: false });
  });
});
