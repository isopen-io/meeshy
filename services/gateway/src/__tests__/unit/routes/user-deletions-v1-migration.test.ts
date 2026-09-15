/**
 * #4317 — les six gestes qui n'avaient ni doublon ni successeur rejoignent
 * `/api/v1` : chacun répond désormais à la MÊME poignée sous deux adresses,
 * l'ancienne devenant un alias en sursis (`depreciee`).
 *
 * Ce témoin garde la promesse du commentaire de clôture : « un témoin par
 * geste migré : même effet, nouvelle adresse ». Il n'attesterait rien s'il
 * réimplémentait le calcul attendu — il compare donc les DEUX réponses entre
 * elles (statut + corps), sur le même double Prisma, plutôt que de figer une
 * valeur en dur qui dériverait du handler sans le suivre.
 *
 * `delete-for-me` (conversation) n'y figure pas : #4317 a tranché qu'il reste
 * un alias en sursis PERMANENT vers `routes/conversations/delete-for-me.ts` —
 * garde dédiée : `user-deletions-alias-deprecation.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../services/conversationPreferencesSync', () => ({
  ...(jest.requireActual('../../../services/conversationPreferencesSync') as object),
  writeConversationPreferences: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/messaging/retractHiddenMessageNotifications', () => ({
  retractNotificationsForClearedHistory: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/personalMessageVisibilitySync', () => ({
  hideMessagesForUser: jest.fn<any>().mockResolvedValue(undefined),
  restoreMessageForUser: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/messaging/personalPreviewRefresh', () => ({
  refreshPersonalConversationPreview: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: any): Promise<void> => {
        request.authContext = { userId: 'user-1' };
      }
  ),
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function buildPrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: 'p1',
        isActive: true,
        deletedForMe: new Date('2024-01-01'),
        conversation: { isActive: true },
      }),
      update: jest.fn<any>().mockResolvedValue({ id: 'p1', isActive: false }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        conversation: { participants: [{ userId: 'user-1', isActive: true }] },
      }),
      findMany: jest.fn<any>().mockResolvedValue([{ id: MSG_ID, conversationId: CONV_ID }]),
    },
    userMessageDeletion: {
      findUnique: jest.fn<any>().mockResolvedValue({
        userId: 'user-1',
        messageId: MSG_ID,
        message: { conversationId: CONV_ID },
      }),
    },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma() as any);
  // Configuration de PRODUCTION (route-registration.ts) : basePath: '/api'.
  await app.register(userDeletionsRoutes, { basePath: '/api' });
  await app.ready();
  return app;
}

type Gesture = {
  readonly nom: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly legacy: string;
  readonly v1: string;
  readonly payload?: unknown;
};

const GESTES: readonly Gesture[] = [
  {
    nom: 'restore-for-me (conversation)',
    method: 'POST',
    legacy: `/api/conversations/${CONV_ID}/restore-for-me`,
    v1: `/api/v1/conversations/${CONV_ID}/restore-for-me`,
  },
  {
    nom: 'clear-history',
    method: 'POST',
    legacy: `/api/conversations/${CONV_ID}/clear-history`,
    v1: `/api/v1/conversations/${CONV_ID}/clear-history`,
    payload: { beforeDate: '2024-06-01T00:00:00.000Z' },
  },
  {
    nom: 'delete-for-me (message)',
    method: 'DELETE',
    legacy: `/api/messages/${MSG_ID}/delete-for-me`,
    v1: `/api/v1/messages/${MSG_ID}/delete-for-me`,
  },
  {
    nom: 'restore-for-me (message)',
    method: 'POST',
    legacy: `/api/messages/${MSG_ID}/restore-for-me`,
    v1: `/api/v1/messages/${MSG_ID}/restore-for-me`,
  },
  {
    nom: 'bulk delete-for-me (messages)',
    method: 'DELETE',
    legacy: '/api/messages/bulk/delete-for-me',
    v1: '/api/v1/messages/bulk/delete-for-me',
    payload: { messageIds: [MSG_ID] },
  },
  {
    nom: 'GET deleted-conversations',
    method: 'GET',
    legacy: '/api/user/deleted-conversations',
    v1: '/api/v1/user/deleted-conversations',
  },
];

describe('Les six gestes migrés (#4317) répondent identiquement aux deux adresses', () => {
  it.each(GESTES)('$nom : même statut et même corps sous /api et /api/v1', async ({ method, legacy, v1, payload }) => {
    const app = await monter();

    const resLegacy = await app.inject({ method, url: legacy, payload });
    const resV1 = await app.inject({ method, url: v1, payload });

    expect(resV1.statusCode).toBe(resLegacy.statusCode);
    expect(resV1.json()).toEqual(resLegacy.json());
    // La preuve n'a de valeur que si le chemin nominal est bien exercé — un
    // 500 des deux côtés serait « identique » sans rien prouver.
    expect(resLegacy.statusCode).toBeLessThan(300);

    await app.close();
  });

  it.each(GESTES)('$nom : seule l\'adresse /api (legacy) annonce sa dépréciation, jamais /api/v1', async ({ method, legacy, v1, payload }) => {
    const app = await monter();

    const resLegacy = await app.inject({ method, url: legacy, payload });
    const resV1 = await app.inject({ method, url: v1, payload });

    expect(resLegacy.headers.deprecation).toMatch(/^@\d+$/);
    expect(resLegacy.headers.link).toBe(`<${v1}>; rel="successor-version"`);

    expect(Object.keys(resV1.headers)).not.toContain('deprecation');
    expect(Object.keys(resV1.headers)).not.toContain('link');

    await app.close();
  });
});
