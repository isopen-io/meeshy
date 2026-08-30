/**
 * Témoin de POLITIQUE — la forme PLATE des réactions (`POST /reactions`) est la
 * porte survivante, et c'est la MEILLEURE des deux (#4188).
 *
 * Le dépôt portait deux formes du même geste : la plate (`routes/reactions.ts`,
 * appelée par iOS `ReactionService.swift` et Android `ReactionApi.kt`) et une
 * imbriquée sous la conversation (`POST /conversations/:id/messages/:messageId/
 * reactions`), qu'aucun client n'appelait. Elles ne différaient pas seulement
 * par leur URL — elles portaient DEUX politiques, et l'imbriquée portait la
 * pauvre :
 *
 *   - son middleware était monté `allowAnonymous: false`, donc un INVITÉ
 *     ANONYME — la population même que sert un lien de partage, seul transport
 *     dont il dispose — ne pouvait pas réagir ;
 *   - un fil CLOS y retombait sur le `sendInternalError` du bas, c'est-à-dire
 *     un 500 pour une règle produit : un client qui réessaie sans fin, là où le
 *     410 dit « le conteneur est terminé, rien de ce que tu changeras n'y
 *     remédiera ».
 *
 * Retirer l'imbriquée fait donc GAGNER la meilleure des deux politiques. Ce
 * fichier existe pour qu'une future « refusion » des deux formes ne réintroduise
 * pas la pauvre : les deux propriétés ci-dessous ne sont écrites nulle part
 * ailleurs comme des EXIGENCES de la porte plate — la suite historique
 * (`reactions-routes.test.ts`) verrouille l'inverse (le 403 d'un anonyme SANS
 * participant) et ne peut pas atteindre la branche 410, son doublure de
 * `utils/response` n'exportant pas `sendError`.
 *
 * Ici la vraie `utils/response` est utilisée et les assertions portent sur le
 * VRAI code HTTP rendu par `app.inject` — un témoin qui doublerait le
 * répondeur prouverait seulement que le double a été appelé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAddReaction = jest.fn<any>();
const mockCreateUpdateEvent = jest.fn<any>().mockResolvedValue({});

// Les options RÉELLES passées à la fabrique de middleware sont capturées : c'est
// `allowAnonymous` qui décide si un invité franchit la porte, et c'est
// exactement le champ qui différait entre les deux formes.
const authFactoryOptions: Array<Record<string, unknown>> = [];
let authContext: Record<string, unknown> = {};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, options: Record<string, unknown>) => {
    authFactoryOptions.push(options);
    return async (req: any) => {
      req.authContext = authContext;
    };
  },
  UnifiedAuthRequest: {},
}));

jest.mock('../../../services/ReactionService', () => ({
  ...(jest.requireActual('../../../services/ReactionService') as object),
  ReactionService: jest.fn<any>().mockImplementation(() => ({
    addReaction: (...args: any[]) => mockAddReaction(...args),
    createUpdateEvent: (...args: any[]) => mockCreateUpdateEvent(...args),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn<any>().mockResolvedValue(undefined),
  notifyReactionRemoved: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../socketio/broadcastReactionMutation', () => ({
  broadcastReactionMutation: jest.fn<any>().mockResolvedValue(undefined),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import reactionRoutes from '../../../routes/reactions';
import { CLOSED_CONVERSATION_REACTION_ERROR } from '../../../services/ReactionService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const EMOJI = '🔥';

/**
 * Le contexte d'un INVITÉ : aucune ligne `User`, donc aucun `userId` — sa seule
 * identité est son `Participant.id`. C'est précisément la forme que la porte
 * imbriquée rejetait au middleware, avant même d'atteindre un handler.
 */
const ANONYMOUS_GUEST_CONTEXT = {
  type: 'anonymous',
  isAnonymous: true,
  userId: undefined,
  sessionToken: 'anon-session-token',
  participantId: GUEST_PARTICIPANT_ID,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONVERSATION_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  } as never);
  app.decorate('socketIOHandler', { getManager: () => ({}) } as never);
  app.decorate('notificationService', {} as never);

  await app.register(reactionRoutes);
  await app.ready();
  return app;
}

// ─── Témoins ──────────────────────────────────────────────────────────────────

describe('#4188 — POST /reactions garde les deux propriétés que la forme imbriquée n\'avait pas', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    authFactoryOptions.length = 0;
    mockAddReaction.mockReset();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('monte sa garde en `allowAnonymous: true` — la forme imbriquée la montait à false', () => {
    expect(authFactoryOptions).toHaveLength(1);
    expect(authFactoryOptions[0]).toMatchObject({ requireAuth: true, allowAnonymous: true });
  });

  it('ADMET un invité anonyme : il réagit avec son seul `Participant.id`, sans ligne `User`', async () => {
    authContext = ANONYMOUS_GUEST_CONTEXT;
    mockAddReaction.mockResolvedValue({
      reaction: { id: 'r1', emoji: EMOJI },
      unchanged: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: EMOJI },
    });

    expect(res.statusCode).toBe(201);
    // L'identité servie au service est bien celle de l'invité — pas un repli
    // sur un `User.id` qu'il n'a pas.
    expect(mockAddReaction).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: GUEST_PARTICIPANT_ID })
    );
  });

  it('traduit un fil CLOS en 410, jamais en 500 — un 500 fait réessayer le client sans fin', async () => {
    authContext = ANONYMOUS_GUEST_CONTEXT;
    mockAddReaction.mockRejectedValue(new Error(CLOSED_CONVERSATION_REACTION_ERROR));

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: EMOJI },
    });

    expect(res.statusCode).toBe(410);
    expect(res.statusCode).not.toBe(500);
  });
});
