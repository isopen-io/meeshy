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

// Régime `resolvePrefsOnly` : la co-participation est un contexte d'accès
// garanti des DEUX côtés, seules les préférences s'appliquent — et un id ABSENT
// de la carte vaut MONTRABLE (un participant sans compte n'a pas de
// préférences et reste visible). Ces gardes vivaient sur la route jumelle
// supprimée ; elles sont portées ici, sur les deux verbes.
const mockResolvePrefsOnly = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolvePrefsOnly: (...args: unknown[]) => mockResolvePrefsOnly(...args),
  }),
}));

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

  const findFirst = jest.fn(async () =>
    callerRole === null
      ? null
      : { id: 'p-admin', userId: ADMIN_ID, role: callerRole, isActive: true, conversation: { type: 'group' } },
  );

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
  } as unknown as PrismaClient;

  return { prisma, conversationUpdate, findUnique };
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID },
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
      mockResolvePrefsOnly.mockReset();
      mockResolvePrefsOnly.mockResolvedValue(new Map());
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
  '%s /conversations/:id — gate de présence des participants',
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

    const updateWithParticipants = async (participants: unknown[]) => {
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

      const app = await buildApp(prisma);
      const res = await update(app, method, { title: 'New Title' });
      await app.close();
      return JSON.parse(res.body).data;
    };

    beforeEach(() => {
      mockResolveConversationId.mockReset();
      mockResolveConversationId.mockResolvedValue(CONV_ID);
      mockResolvePrefsOnly.mockReset();
      mockResolvePrefsOnly.mockResolvedValue(new Map());
    });

    it("masque la présence d'un participant qui l'a coupée", async () => {
      mockResolvePrefsOnly.mockResolvedValue(
        new Map([[USER_ID, { showOnline: false, showLastSeenTimestamp: false }]]),
      );

      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(false);
      expect(served.participants[0].lastActiveAt).toBeNull();
    });

    it("conserve la présence quand les préférences l'autorisent", async () => {
      const served = await updateWithParticipants([participantRow()]);

      expect(served.participants[0].isOnline).toBe(true);
      expect(served.participants[0].lastActiveAt).not.toBeNull();
    });

    it('interroge la visibilité sur les userId des participants enregistrés', async () => {
      await updateWithParticipants([participantRow()]);

      expect(mockResolvePrefsOnly).toHaveBeenCalledWith([USER_ID]);
    });

    it('laisse un participant sans compte visible malgré son absence de préférences', async () => {
      const served = await updateWithParticipants([
        participantRow({ id: 'p-anon', userId: null, type: 'anonymous', user: null }),
      ]);

      expect(served.participants[0].isOnline).toBe(true);
      expect(mockResolvePrefsOnly).toHaveBeenCalledWith([]);
    });

    // Les deux préférences sont INDÉPENDANTES : couper le seul horodatage laisse
    // la pastille. Un collapse qui les traiterait comme un drapeau unique
    // passerait les témoins ci-dessus sans que celui-ci tienne.
    // La branche « rien à écrire » rend les MÊMES lignes que la branche
    // nominale, donc la même donnée à garder. Une porte posée sur une seule des
    // deux sorties n'est pas une porte.
    it('garde aussi la présence quand le corps ne porte aucun champ connu', async () => {
      mockResolvePrefsOnly.mockResolvedValue(
        new Map([[USER_ID, { showOnline: false, showLastSeenTimestamp: false }]]),
      );
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

    it("retire l'horodatage seul quand showLastSeen est coupé", async () => {
      mockResolvePrefsOnly.mockResolvedValue(
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
    mockResolvePrefsOnly.mockReset();
    mockResolvePrefsOnly.mockResolvedValue(new Map());
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
