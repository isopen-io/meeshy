/**
 * #4332 — le CRITÈRE DE FIN de l'issue, à la lettre : « un témoin qui prouve
 * qu'une conversation supprimée par la route VIVANTE apparaît dans la
 * corbeille — ou que la corbeille n'existe plus. Un témoin qui ne passe pas
 * par la route vivante ne prouve rien : c'est exactement ce qui a laissé le
 * défaut vivre. »
 *
 * Toute la suite `user-deletions-routes.test.ts` mocke `participant.findFirst`
 * en dur — elle prouve que CHAQUE route, prise seule, lit/écrit la bonne
 * colonne, jamais que les DEUX routes s'accordent sur la MÊME ligne. C'est
 * précisément l'angle mort qui a laissé le défaut vivre pendant que chaque
 * moitié avait ses propres témoins verts (`DELETE .../delete-for-me` de
 * `user-deletions.ts` écrivait `UserConversationPreferences.deletedForUserAt`,
 * `restore-for-me`/`GET .../deleted-conversations` lisaient la même table —
 * cohérents entre EUX, déconnectés de la route que les clients appellent
 * réellement).
 *
 * Ce fichier enregistre donc les DEUX routeurs sur le MÊME Fastify app, avec
 * un Prisma VIVANT (une vraie ligne `Participant`, mutée par les écritures,
 * jamais un mock figé par test) — exactement comme
 * `user-deletions-preferences-broadcast.test.ts` le fait déjà pour la
 * diffusion de préférences — et fait transiter TOUT par HTTP :
 *   1. `DELETE /conversations/:id/delete-for-me` — la route CANONIQUE
 *      (`routes/conversations/delete-for-me.ts`), celle qu'iOS et Android
 *      appellent réellement (`ConversationService.swift`,
 *      `ConversationApi.kt`) ;
 *   2. `GET /api/user/deleted-conversations` — la corbeille ;
 *   3. `POST /api/conversations/:id/restore-for-me` — sa sortie.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const OTHER_CONV_ID = '507f1f77bcf86cd799439099';
const PART_ID = '507f1f77bcf86cd799439033';
const AUTH = { authorization: 'Bearer token' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest & { authContext?: unknown }): Promise<void> => {
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';
import { registerDeleteForMeRoutes } from '../../../routes/conversations/delete-for-me';

type LiveParticipant = {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  isActive: boolean;
  deletedForMe: Date | null;
};

/**
 * Une seule ligne `Participant`, réellement MUTÉE par les écritures — c'est
 * ce qui distingue ce témoin des mocks figés par test du reste de la suite :
 * si `delete-for-me` (canonique) et `restore-for-me`/`GET deleted-conversations`
 * (`user-deletions.ts`) lisaient/écrivaient encore deux colonnes différentes,
 * la seconde moitié ne verrait JAMAIS ce que la première vient d'écrire, et
 * ce témoin tomberait — c'est tout le point.
 */
function buildLiveTrashPrisma() {
  let row: LiveParticipant = {
    id: PART_ID,
    conversationId: CONV_ID,
    userId: USER_ID,
    role: 'member',
    isActive: true,
    deletedForMe: null,
  };
  const conversation = {
    id: CONV_ID,
    identifier: 'conv-live',
    title: 'Live conversation',
    type: 'group',
    avatar: null,
    lastMessageAt: new Date('2026-08-20'),
    isActive: true,
  };

  return {
    participant: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.conversationId !== CONV_ID || where.userId !== USER_ID) return null;
        if (where.isActive === true && !row.isActive) return null;
        // `restore-for-me` sélectionne `conversation: { select: { isActive } }`
        // — jamais exercé côté FERMETURE ici (le scénario reste un membre
        // ordinaire, rôle qui ne clôt jamais la conversation), donc une
        // valeur statique suffit à ce double.
        return { ...row, conversation: { isActive: conversation.isActive } };
      }),
      update: jest.fn(async ({ data }: any) => {
        row = { ...row, ...data };
        return { ...row };
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where.userId !== USER_ID || row.deletedForMe === null) return [];
        return [
          {
            conversationId: row.conversationId,
            deletedForMe: row.deletedForMe,
            conversation: {
              id: conversation.id,
              identifier: conversation.identifier,
              title: conversation.title,
              type: conversation.type,
              avatar: conversation.avatar,
              lastMessageAt: conversation.lastMessageAt,
            },
          },
        ];
      }),
    },
    conversation: {
      // `resolveConversationId` court-circuite déjà sur un ObjectId valide
      // (CONV_ID en est un) — cet appel ne sert que si un test relit la
      // conversation autrement ; conservé pour la robustesse du double.
      findFirst: jest.fn(async () => null),
    },
    // Collaborateurs des routes NON concernées par ce témoin
    // (`clear-history`, `messages/*`) — présents pour que l'enregistrement
    // Fastify des sept routes de `userDeletionsRoutes` ne lève pas au
    // démarrage, jamais exercés par les scénarios ci-dessous.
    userConversationPreferences: {
      upsert: jest.fn(async () => ({ version: 1 })),
      findMany: jest.fn(async () => []),
    },
    message: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    userMessageDeletion: { findUnique: jest.fn(async () => null) },
    notification: { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) },
    row: () => row,
  };
}

async function buildCombinedApp(prisma: ReturnType<typeof buildLiveTrashPrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as unknown);
  // Aucun `socketIOHandler` décoré : `performConversationDeleteForMe` lit
  // `fastify.socketIOHandler?.getManager()` en optionnel — sans handler, la
  // branche socket est sautée proprement (comportement identique à une
  // passerelle démarrée sans Socket.IO, déjà couvert par
  // `user-deletions-prefix.test.ts`). Ce témoin porte l'écriture/lecture
  // HTTP, pas la diffusion temps réel — déjà couverte ailleurs
  // (`user-deletions-preferences-broadcast.test.ts`,
  // `conversation-deleted-broadcast.test.ts`).
  const requiredAuth = async (request: FastifyRequest) => {
    (request as unknown as { authContext: unknown }).authContext = { userId: USER_ID };
  };

  // La route CANONIQUE — celle qu'iOS/Android appellent réellement.
  registerDeleteForMeRoutes(app, prisma as any, jest.fn(), requiredAuth);
  // La corbeille — `user-deletions.ts`, montée sur son préfixe par défaut
  // (`/api`), identique à la production (`route-registration.ts`,
  // `prefix: ''`, sans `basePath`).
  await app.register(userDeletionsRoutes);

  await app.ready();
  return app;
}

describe('#4332 — la corbeille reflète ce que la route VIVANTE supprime', () => {
  it('une conversation supprimée par DELETE /conversations/:id/delete-for-me (canonique) apparaît dans GET /api/user/deleted-conversations', async () => {
    const prisma = buildLiveTrashPrisma();
    const app = await buildCombinedApp(prisma);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/conversations/${CONV_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(deleteRes.statusCode).toBe(200);
    // Preuve directe de la colonne écrite — avant #4332, cette route posait
    // `Participant.deletedForMe`, mais RIEN ne la relisait pour la corbeille.
    expect(prisma.row().deletedForMe).not.toBeNull();
    expect(prisma.row().isActive).toBe(false);

    const trashRes = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(trashRes.statusCode).toBe(200);
    const body = trashRes.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].conversationId).toBe(CONV_ID);
    expect(body.data[0].deletedAt).toEqual(expect.any(String));
    expect(body.data[0].conversation.id).toBe(CONV_ID);

    await app.close();
  });

  it('restore-for-me réactive une conversation supprimée par la route vivante, et la corbeille se vide', async () => {
    const prisma = buildLiveTrashPrisma();
    const app = await buildCombinedApp(prisma);

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/delete-for-me`, headers: AUTH });

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(prisma.row().deletedForMe).toBeNull();
    expect(prisma.row().isActive).toBe(true);

    const trashRes = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(trashRes.json().data).toHaveLength(0);

    await app.close();
  });

  it('sans passage par la route vivante, la corbeille reste vide — un témoin qui écrirait directement en base ne prouverait rien', async () => {
    const prisma = buildLiveTrashPrisma();
    const app = await buildCombinedApp(prisma);

    const trashRes = await app.inject({
      method: 'GET',
      url: '/api/user/deleted-conversations',
      headers: AUTH,
    });
    expect(trashRes.json().data).toHaveLength(0);

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/conversations/${OTHER_CONV_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(restoreRes.statusCode).toBe(400);

    await app.close();
  });
});
