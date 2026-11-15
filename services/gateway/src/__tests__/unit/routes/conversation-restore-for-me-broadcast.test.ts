/**
 * Témoin de CÂBLAGE — issue #4344 : `POST
 * /conversations/:conversationId/restore-for-me` persistait la restauration
 * puis s'arrêtait à `sendSuccess`, sans jamais rien diffuser. Sa jumelle,
 * `performConversationDeleteForMe` (`conversations/delete-for-me.ts`), diffuse
 * `CONVERSATION_DELETED` sur `ROOMS.user(userId)` juste après SA persistance —
 * restaurer une conversation sur un appareil ne l'annonçait donc à AUCUN
 * autre appareil du même utilisateur.
 *
 * Le harnais décore l'app d'un `socketIOHandler` espion en forme PLATE
 * (`socketIOHandler.io`) — celle que `broadcastToUser` résout
 * (`utils/socket-broadcast.ts`, shape 3 de `resolveSocketIO`) et que
 * `user-deletions-broadcast.test.ts` établit déjà pour les routes voisines de
 * ce même fichier (`message:hidden-for-me` / `message:restored-for-me`) — et
 * lit ce qui sort RÉELLEMENT de `io.to(room).emit(...)`, jamais ce que la
 * route croit avoir fait.
 *
 * Le module de contrat `@meeshy/shared/types/socketio-events` n'est PAS
 * doublé : un double partiel de ce module a déjà laissé un événement partir
 * sous le nom `undefined` avec un témoin vert (cycle 104, § Tests du CLAUDE.md
 * gateway). Chaque assertion ci-dessous porte donc le VRAI `SERVER_EVENTS` /
 * `ROOMS`, jamais une chaîne recomposée à la main — sauf UNE, volontaire : la
 * première assertion fixe aussi la valeur LITTÉRALE `'conversation:restored'`
 * qui part sur le fil, pour que la convention `entity:action-word` du dépôt
 * reste visible même si la constante venait à changer de valeur sans le
 * vouloir.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.headers['authorization']) {
          await reply.code(401).send({ success: false, error: 'Unauthorized' });
          return;
        }
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

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

type Emission = { room: string; event: string; payload: unknown };
type CallOrderEvent = 'persist' | 'emit';

type ParticipantRow = {
  id: string;
  deletedForMe: Date | null;
  conversation: { isActive: boolean };
} | null;

/**
 * `updateShouldFail` fait rejeter l'écriture de restauration — c'est ce qui
 * permet de prouver que rien n'est diffusé quand la persistance échoue,
 * sans toucher à la production pour le simuler.
 */
async function buildApp(params: {
  emissions: Emission[];
  callOrder: CallOrderEvent[];
  participant: ParticipantRow;
  updateShouldFail?: boolean;
}): Promise<FastifyInstance> {
  const { emissions, callOrder, participant, updateShouldFail } = params;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    participant: {
      findFirst: jest.fn(async () => participant),
      update: jest.fn(async () => {
        if (updateShouldFail) {
          throw new Error('db write failed');
        }
        callOrder.push('persist');
        return {};
      }),
    },
  } as unknown);

  app.decorate('socketIOHandler', {
    io: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          callOrder.push('emit');
          emissions.push({ room, event, payload });
        },
      }),
    },
  } as unknown);

  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

const restoredEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_RESTORED);

const restorableParticipant: ParticipantRow = {
  id: 'part-1',
  deletedForMe: new Date('2026-08-20T10:00:00Z'),
  conversation: { isActive: true },
};

describe('POST /conversations/:conversationId/restore-for-me diffuse CONVERSATION_RESTORED', () => {
  let emissions: Emission[];
  let callOrder: CallOrderEvent[];

  beforeEach(() => {
    emissions = [];
    callOrder = [];
  });

  it('émet le COUPLE (conversation:restored, {userId, conversationId}) sur la room personnelle de l’utilisateur — pas seulement la bonne room', async () => {
    const app = await buildApp({ emissions, callOrder, participant: restorableParticipant });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);

    const restored = restoredEmissions(emissions);
    expect(restored).toHaveLength(1);
    // Le NOM d'abord : une room juste ne dit rien de ce qui y arrive tant que
    // l'événement peut partir sous `undefined` (cycle 104).
    expect(restored[0]?.event).toBe('conversation:restored');
    expect(restored[0]?.room).toBe(ROOMS.user(USER_ID));
    expect(restored[0]?.payload).toEqual({ userId: USER_ID, conversationId: CONV_ID });

    await app.close();
  });

  it('émet APRÈS la persistance, jamais avant', async () => {
    const app = await buildApp({ emissions, callOrder, participant: restorableParticipant });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(callOrder).toEqual(['persist', 'emit']);

    await app.close();
  });

  it('n’émet RIEN quand la persistance échoue', async () => {
    const app = await buildApp({
      emissions,
      callOrder,
      participant: restorableParticipant,
      updateShouldFail: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(500);
    expect(restoredEmissions(emissions)).toHaveLength(0);
    expect(callOrder).toEqual([]);

    await app.close();
  });

  it('n’émet rien quand la conversation n’était pas supprimée pour cet utilisateur', async () => {
    const app = await buildApp({
      emissions,
      callOrder,
      participant: { id: 'part-1', deletedForMe: null, conversation: { isActive: true } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(restoredEmissions(emissions)).toHaveLength(0);

    await app.close();
  });

  it('n’émet rien quand la conversation a été close pour tout le monde entre-temps', async () => {
    const app = await buildApp({
      emissions,
      callOrder,
      participant: {
        id: 'part-1',
        deletedForMe: new Date('2026-08-20T10:00:00Z'),
        conversation: { isActive: false },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(restoredEmissions(emissions)).toHaveLength(0);

    await app.close();
  });

  it('n’émet rien quand l’appelant n’est pas/plus participant de la conversation', async () => {
    const app = await buildApp({ emissions, callOrder, participant: null });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(restoredEmissions(emissions)).toHaveLength(0);

    await app.close();
  });
});
