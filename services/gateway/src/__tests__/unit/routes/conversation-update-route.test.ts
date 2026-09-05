/**
 * conversation-update-route.test.ts
 *
 * Le gateway exposait DEUX routes pour modifier une conversation, écrites
 * séparément et jamais rapprochées :
 *
 *   PUT   /conversations/:id  (core.ts)     8 champs, garde creator/admin/moderator,
 *                                           émet `conversation:updated`
 *   PATCH /conversations/:id  (sharing.ts)  title/description/type SEULEMENT,
 *                                           ouverte à tout membre actif, muette
 *
 * iOS parlait à la première, le web à la seconde. Le web postait donc
 * `{ avatar, banner }` à une route qui n'en déclare aucun des deux : Fastify
 * validait (aucun `additionalProperties: false`), le handler les ignorait, et
 * la réponse était **200**. Mesuré en production le 2026-08-24 — bannière et
 * avatar toujours `null` après un 200 — soit le pire des retours : l'interface
 * affichait « Bannière mise à jour » et rien n'avait été écrit.
 *
 * Un seul handler sert désormais les deux verbes. Ces tests le vérifient PAR LE
 * VERBE : une régression qui ferait diverger `PATCH` du `PUT` rougirait ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolvePresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceViewer } from '../../../services/PresenceVisibilityService';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd7994390bb';
const IDENTIFIER = 'mshy_for-ios-testing-20260225222126';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
  invalidateConversationIdCache: jest.fn(),
}));

// Gate de présence — régime STRICT (2026-08-25) : la co-participation n'ouvre
// rien, seul le viewer (soi / ADMIN+ / ami accepté) voit `isOnline` et
// `lastActiveAt` d'un co-participant. Ces gardes vivaient sur la route jumelle
// supprimée ; elles sont portées ici, sur les deux verbes.
//
// Le service n'est doublé que sur son I/O : `lawFaithfulResolver` applique la
// VRAIE loi partagée (`resolvePresenceVisibility`) à un ensemble d'amis piloté
// par le test. Chaque témoin dit donc la directive en clair — et rougit si la
// route cesse de transmettre le viewer, ou revient à un régime aveugle à lui.
const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
  }),
}));

const HIDDEN = { showOnline: false, showLastSeenTimestamp: false } as const;

const lawFaithfulResolver =
  (friendsOfViewer: ReadonlySet<string> = new Set()) =>
  async (viewer: PresenceViewer, ids: readonly string[]) =>
    new Map(
      ids.map((id) => [
        id,
        viewer
          ? resolvePresenceVisibility({
              isSelf: viewer.userId === id,
              viewerRole: viewer.role,
              areConnected: friendsOfViewer.has(id),
              targetShowOnlineStatus: true,
              targetShowLastSeen: true,
              targetIsDeactivated: false,
              isBlockedEitherWay: false,
            })
          : HIDDEN,
      ]),
    );

const makeIo = () => {
  const chain = (): any => ({ to: () => chain(), emit: () => undefined });
  return { to: () => chain() };
};

function createMockPrisma(callerRole: string | null = 'creator') {
  const conversationUpdate = jest.fn(async (args: any) => ({
    id: CONV_ID,
    identifier: IDENTIFIER,
    type: 'group',
    title: args?.data?.title ?? 'For iOS Testing',
    avatar: args?.data?.avatar ?? null,
    banner: args?.data?.banner ?? null,
    participants: [
      { id: 'p-admin', userId: ADMIN_ID, isActive: true, user: { id: ADMIN_ID, username: 'admin' } },
    ],
  }));

  // **Un `findFirst` qui HONORE le filtre de rang.**
  //
  // Les deux gardes de `core.ts` filtraient le rang DANS la requête. Un mock
  // qui rend sa ligne quel que soit le `where` ne les exerce donc pas du tout :
  // c'est ce qui obligeait « refuse un simple membre » à simuler l'absence
  // (`callerRole = null`) plutôt que le rang, et ce qui rendait le point de
  // contrôle invisible aux tests (#3941, même vert par omission que #4007).
  const findFirst = jest.fn(async (args: any) => {
    if (callerRole === null) return null;
    const allowed = args?.where?.role?.in as string[] | undefined;
    if (allowed && !allowed.includes(callerRole)) return null;
    return { id: 'p-admin', userId: ADMIN_ID, role: callerRole, isActive: true, conversation: { type: 'group' } };
  });

  const findUnique = jest.fn(async () => ({
    id: CONV_ID,
    identifier: IDENTIFIER,
    type: 'group',
    title: 'For iOS Testing',
    avatar: null,
    banner: null,
    participants: [],
  }));

  const prisma = {
    participant: { findFirst },
    conversation: { update: conversationUpdate, findUnique },
    // #3740 — `DELETE /conversations/:id` désactive aussi les liens de
    // partage encore actifs du fil, dans la MÊME transaction que la clôture.
    conversationShareLink: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((ops: any) => Promise.all(ops)),
  } as unknown as PrismaClient;

  return { prisma, conversationUpdate, findUnique };
}

// `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit (`isRegisteredUser` la lit) : c'est sur elle que
// `viewerFromRequest` construit le viewer de présence. `viewerRole` est le
// rôle PLATEFORME du demandeur ; son rang dans la conversation (`admin`) vient
// du double Prisma.
async function buildApp(prisma: PrismaClient, viewerRole: string = 'USER'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role: viewerRole },
      hasFullAccess: true,
    };
  };
  (app as unknown as Record<string, unknown>).socketIOHandler = {
    getManager: () => ({ getIO: () => makeIo() }),
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, auth, auth);
  await app.ready();
  return app;
}

const update = (app: FastifyInstance, method: 'PUT' | 'PATCH', payload: unknown, id = CONV_ID) =>
  app.inject({
    method,
    url: `/conversations/${id}`,
    headers: { authorization: 'Bearer x' },
    payload: payload as never,
  });

describe.each(['PUT', 'PATCH'] as const)(
  '%s /conversations/:id — un seul et même handler',
  (method) => {
    beforeEach(() => {
      mockResolveConversationId.mockReset();
      mockResolveConversationId.mockResolvedValue(CONV_ID);
      mockResolveForTargets.mockReset();
      mockResolveForTargets.mockImplementation(lawFaithfulResolver());
    });

    it("écrit l'avatar et la bannière", async () => {
      // Le défaut mesuré en production : ces deux champs partaient dans le vide
      // et la route répondait 200.
      const { prisma, conversationUpdate } = createMockPrisma();
      const app = await buildApp(prisma);

      const res = await update(app, method, {
        avatar: 'https://static.meeshy.me/a.jpg',
        banner: 'https://static.meeshy.me/b.jpg',
      });

      expect(res.statusCode).toBe(200);
      expect(conversationUpdate).toHaveBeenCalledTimes(1);
      expect((conversationUpdate.mock.calls[0] as any[])[0].data).toMatchObject({
        avatar: 'https://static.meeshy.me/a.jpg',
        banner: 'https://static.meeshy.me/b.jpg',
      });
      await app.close();
    });

    it('écrit le titre, la description et les réglages du conteneur', async () => {
      const { prisma, conversationUpdate } = createMockPrisma();
      const app = await buildApp(prisma);

      const res = await update(app, method, {
        title: 'Nouveau nom',
        description: 'Une description',
        slowModeSeconds: 30,
        isAnnouncementChannel: true,
        defaultWriteRole: 'moderator',
        autoTranslateEnabled: false,
      });

      expect(res.statusCode).toBe(200);
      expect((conversationUpdate.mock.calls[0] as any[])[0].data).toMatchObject({
        title: 'Nouveau nom',
        description: 'Une description',
        slowModeSeconds: 30,
        isAnnouncementChannel: true,
        defaultWriteRole: 'moderator',
        autoTranslateEnabled: false,
      });
      await app.close();
    });

    it('refuse un simple membre', async () => {
      // La route PATCH d'origine laissait n'importe quel membre actif renommer
      // le groupe — et sans prévenir personne, faute d'événement.
      const { prisma, conversationUpdate } = createMockPrisma(null);
      const app = await buildApp(prisma);

      const res = await update(app, method, { title: 'Renommé par un membre' });

      expect(res.statusCode).toBe(403);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });

    it("accepte un identifiant lisible et écrit sur l'ObjectId résolu", async () => {
      // Le schéma promet « ID or identifier » sur les deux verbes ; seul le
      // PATCH le tenait.
      const { prisma, conversationUpdate } = createMockPrisma();
      const app = await buildApp(prisma);

      const res = await update(app, method, { title: 'Via identifiant' }, IDENTIFIER);

      expect(res.statusCode).toBe(200);
      expect(mockResolveConversationId).toHaveBeenCalledWith(expect.anything(), IDENTIFIER);
      expect((conversationUpdate.mock.calls[0] as any[])[0].where).toEqual({ id: CONV_ID });
      await app.close();
    });

    it("répond 404 quand l'identifiant ne résout rien", async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const { prisma, conversationUpdate } = createMockPrisma();
      const app = await buildApp(prisma);

      const res = await update(app, method, { title: 'x' }, 'mshy_inconnu');

      expect(res.statusCode).toBe(404);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });

    it("n'écrit pas quand le corps ne porte aucun champ connu", async () => {
      // Prisma refuse un `data` vide : la route répondait 500 sur un corps `{}`.
      const { prisma, conversationUpdate, findUnique } = createMockPrisma();
      const app = await buildApp(prisma);

      const res = await update(app, method, {});

      expect(res.statusCode).toBe(200);
      expect(conversationUpdate).not.toHaveBeenCalled();
      expect(findUnique).toHaveBeenCalled();
      await app.close();
    });
  },
);

describe.each(['PUT', 'PATCH'] as const)(
  '%s /conversations/:id — gate de présence des participants (régime strict)',
  (method) => {
    const USER_ID = '507f1f77bcf86cd799439077';

    const participantRow = (over: Record<string, unknown> = {}) => ({
      id: 'p-alice',
      userId: USER_ID,
      type: 'user',
      displayName: 'Alice',
      avatar: null,
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: true,
      lastActiveAt: new Date('2026-08-22T10:00:00.000Z'),
      user: { id: USER_ID, username: 'alice' },
      ...over,
    });

    const anonymousRow = () =>
      participantRow({ id: 'p-anon', userId: null, type: 'anonymous', user: null });

    const updateWithParticipants = async (participants: unknown[], viewerRole: string = 'USER') => {
      const conversationUpdate = jest.fn(async () => ({
        id: CONV_ID,
        identifier: IDENTIFIER,
        type: 'group',
        title: 'T',
        participants,
      }));
      const prisma = {
        participant: {
          findFirst: jest.fn(async () => ({
            id: 'p-admin', userId: ADMIN_ID, role: 'admin', isActive: true,
            conversation: { type: 'group' },
          })),
        },
        conversation: { update: conversationUpdate, findUnique: jest.fn() },
      } as unknown as PrismaClient;

      const app = await buildApp(prisma, viewerRole);
      const res = await update(app, method, { title: 'New Title' });
      await app.close();
      return JSON.parse(res.body).data;
    };

    beforeEach(() => {
      mockResolveConversationId.mockReset();
      mockResolveConversationId.mockResolvedValue(CONV_ID);
      mockResolveForTargets.mockReset();
      mockResolveForTargets.mockImplementation(lawFaithfulResolver());
    });

    // La porte : le viewer DEMANDEUR — identité ET rôle — atteint le service,
    // avec les `User.id` des participants inscrits. Sans le rôle, ADMIN et
    // USER seraient indiscernables ; sans l'identité, l'amitié le serait.
    it('transmet le viewer demandeur (identité + rôle) et les userId des participants inscrits', async () => {
      await updateWithParticipants([participantRow()]);

      expect(mockResolveForTargets).toHaveBeenCalledWith(
        { userId: ADMIN_ID, role: 'USER' },
        [USER_ID],
      );
    });

    it('ami accepté ⇒ présence servie', async () => {
      mockResolveForTargets.mockImplementation(lawFaithfulResolver(new Set([USER_ID])));

      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).toBe('2026-08-22T10:00:00.000Z');
    });

    it('co-participant NON ami ⇒ isOnline false et lastActiveAt null', async () => {
      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });

    it('ADMIN non ami ⇒ présence servie', async () => {
      const served = await updateWithParticipants([participantRow()], 'ADMIN');

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).not.toBeNull();
    });

    it('MODERATOR non ami ⇒ cachée, comme un utilisateur ordinaire', async () => {
      const served = await updateWithParticipants([participantRow()], 'MODERATOR');

      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });

    // Un participant sans compte n'a pas de `User.id` : le service ne peut
    // pas le résoudre. Régime strict : entrée absente ⇒ masqué, sauf ADMIN+.
    it('participant sans compte ⇒ caché pour un USER, et rien n\'est résolu pour lui', async () => {
      const served = await updateWithParticipants([anonymousRow()]);

      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
      expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: ADMIN_ID, role: 'USER' }, []);
    });

    it('participant sans compte ⇒ servi à un ADMIN', async () => {
      const served = await updateWithParticipants([anonymousRow()], 'ADMIN');

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).not.toBeNull();
    });

    // Cas (b) : un id INSCRIT que la carte ne porte pas (anomalie — le
    // résolveur rend une entrée par id passé). Même réponse que pour une cible
    // sans compte : masqué, sauf ADMIN+. Avant le site unique (`presenceFor`),
    // `vis.get()` rendait `undefined` et `?.showOnline === false` laissait
    // PASSER — la présence partait à tout le monde.
    it('inscrit ABSENT de la carte ⇒ caché pour un USER', async () => {
      mockResolveForTargets.mockResolvedValue(new Map());

      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });

    it('inscrit ABSENT de la carte ⇒ servi à un ADMIN', async () => {
      mockResolveForTargets.mockResolvedValue(new Map());

      const served = await updateWithParticipants([participantRow()], 'ADMIN');

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).not.toBeNull();
    });

    // La branche « rien à écrire » rend les MÊMES lignes que la branche
    // nominale, donc la même donnée à garder. Une porte posée sur une seule des
    // deux sorties n'est pas une porte.
    it('garde aussi la présence quand le corps ne porte aucun champ connu', async () => {
      const prisma = {
        participant: {
          findFirst: jest.fn(async () => ({
            id: 'p-admin', userId: ADMIN_ID, role: 'admin', isActive: true,
            conversation: { type: 'group' },
          })),
        },
        conversation: {
          update: jest.fn(),
          findUnique: jest.fn(async () => ({
            id: CONV_ID, identifier: IDENTIFIER, type: 'group', title: 'T',
            participants: [participantRow()],
          })),
        },
      } as unknown as PrismaClient;

      const app = await buildApp(prisma);
      const res = await update(app, method, {});
      await app.close();

      const served = JSON.parse(res.body).data;
      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });

    // Les deux drapeaux sont INDÉPENDANTS : un ami qui ne coupe que
    // l'horodatage garde sa pastille. Un collapse qui les traiterait comme un
    // drapeau unique passerait les témoins ci-dessus sans que celui-ci tienne.
    it("retire l'horodatage seul quand l'ami a coupé showLastSeen", async () => {
      mockResolveForTargets.mockResolvedValue(
        new Map([[USER_ID, { showOnline: true, showLastSeenTimestamp: false }]]),
      );

      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });
  },
);

describe('La conversation globale reste intouchable', () => {
  beforeEach(() => {
    mockResolveConversationId.mockReset();
    mockResolveConversationId.mockResolvedValue('meeshy');
    mockResolveForTargets.mockReset();
    mockResolveForTargets.mockImplementation(lawFaithfulResolver());
  });

  it.each(['PUT', 'PATCH'] as const)('%s la refuse', async (method) => {
    const { prisma, conversationUpdate } = createMockPrisma();
    const app = await buildApp(prisma);

    const res = await update(app, method, { title: 'Renommer le global' }, 'meeshy');

    expect(res.statusCode).toBe(403);
    expect(conversationUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});

/**
 * **Un administrateur de la PLATEFORME agit avec les droits du créateur**
 * (issue #3941, décision porteur du 2026-08-27 en tranchant #3892).
 *
 * Ces deux gardes ne se contentaient pas d'ignorer le rôle de plateforme :
 * elles filtraient le rang DANS LA REQUÊTE (`role: { in: [...] }`). Un
 * administrateur simple membre n'était donc pas « refusé » — sa ligne de
 * participation n'était jamais chargée, et le code n'avait plus rien à
 * décider. C'est la forme la plus silencieuse de l'incohérence relevée par
 * #3941 : le point de contrôle n'existe pas là où on le cherche.
 *
 * La requête charge désormais l'appartenance, et la décision se prend en
 * JavaScript, où le rôle de plateforme est lisible — même déplacement que
 * pour #4007 sur les routes de lien.
 */
describe('Autorité de plateforme sur une conversation (#3941)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockReset();
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockResolveForTargets.mockReset();
    mockResolveForTargets.mockImplementation(lawFaithfulResolver());
  });

  describe('PUT /conversations/:id — éditer', () => {
    it('refuse un simple membre sans rôle de plateforme', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('member');
      const app = await buildApp(prisma, 'USER');

      const res = await update(app, 'PUT', { title: 'Renommé par un membre' });

      expect(res.statusCode).toBe(403);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });

    it.each(['ADMIN', 'BIGBOSS'])('laisse éditer un %s de la plateforme simple membre', async (platformRole) => {
      const { prisma, conversationUpdate } = createMockPrisma('member');
      const app = await buildApp(prisma, platformRole);

      const res = await update(app, 'PUT', { title: 'Renommé par la plateforme' });

      expect(res.statusCode).toBe(200);
      expect(conversationUpdate).toHaveBeenCalled();
      await app.close();
    });

    it('un MODERATOR de la plateforme reste un participant ordinaire', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('member');
      const app = await buildApp(prisma, 'MODERATOR');

      const res = await update(app, 'PUT', { title: 'Renommé par un modérateur global' });

      expect(res.statusCode).toBe(403);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });

    it('un ADMIN de la plateforme touche aux permissions, qu’un modérateur de conversation ne peut pas changer', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('moderator');
      const app = await buildApp(prisma, 'ADMIN');

      const res = await update(app, 'PUT', { slowModeSeconds: 30 });

      expect(res.statusCode).toBe(200);
      expect(conversationUpdate).toHaveBeenCalled();
      await app.close();
    });

    it('un modérateur de conversation reste tenu à l’écart des permissions', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('moderator');
      const app = await buildApp(prisma, 'USER');

      const res = await update(app, 'PUT', { slowModeSeconds: 30 });

      expect(res.statusCode).toBe(403);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('DELETE /conversations/:id — supprimer', () => {
    const remove = (app: FastifyInstance) =>
      app.inject({
        method: 'DELETE',
        url: `/conversations/${CONV_ID}`,
        headers: { authorization: 'Bearer x' },
      });

    it('refuse un simple membre sans rôle de plateforme', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('member');
      const app = await buildApp(prisma, 'USER');

      const res = await remove(app);

      expect(res.statusCode).toBe(403);
      expect(conversationUpdate).not.toHaveBeenCalled();
      await app.close();
    });

    it('refuse un modérateur de conversation — supprimer reste au rang admin', async () => {
      const { prisma } = createMockPrisma('moderator');
      const app = await buildApp(prisma, 'USER');

      const res = await remove(app);

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it('laisse supprimer un ADMIN de la plateforme simple membre', async () => {
      const { prisma, conversationUpdate } = createMockPrisma('member');
      const app = await buildApp(prisma, 'ADMIN');

      const res = await remove(app);

      expect(res.statusCode).toBe(200);
      expect(conversationUpdate).toHaveBeenCalled();
      await app.close();
    });
  });
});
