/**
 * #4177 — le `total` de `GET /conversations/:id/pinned-messages` fuit la
 * cardinalité d'avant le plancher d'historique du lecteur.
 *
 * La PAGE d'épingles applique déjà les DEUX gardes qui bornent ce qu'un
 * lecteur peut voir : `applyPersonalHistoryHiding` (ce qu'IL a masqué de sa
 * propre vue) ET `applyHistoryFloor` (ce qui précède SON arrivée — plancher
 * de lien de partage, `historyVisibleFrom`, etc.). Le `total`, lui,
 * n'appliquait que la première : un arrivant tardif voyait un total qui
 * COMPTE les épingles d'avant son plancher, et la pagination lui promettait
 * des pages qui ne rendent jamais rien (`hasMore` resterait vrai sans
 * qu'aucune page suivante ne puisse les servir).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
/** Le plancher d'historique de CE lecteur — un arrivant tardif. */
const FLOOR_DATE = new Date('2026-08-15T00:00:00.000Z');
/** Total RÉEL vu par un lecteur dont la page respecte le plancher. */
const FLOORED_TOTAL = 2;
/** Total (FAUX) qu'un COUNT non-planché rendrait — inclut les épingles d'avant l'arrivée. */
const UNFLOORED_TOTAL = 5;

function buildApp(): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      // `loadReaderHistoryFloor` : `historyVisibleFrom` règle le plancher
      // SANS lien de partage à charger (verdict `settled` immédiat).
      findFirst: jest.fn().mockResolvedValue({
        id: 'reader-part-id',
        userId: USER_ID,
        isActive: true,
        role: 'member',
        joinedAt: FLOOR_DATE,
        shareLinkId: null,
        historyVisibleFrom: FLOOR_DATE,
        permissions: null,
        anonymousSession: null,
        user: null,
      }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      // Base « consciente du plancher » : ne rend le compte PLANCHÉ que si la
      // requête porte bien `createdAt.gte = FLOOR_DATE` — exactement ce que
      // `applyHistoryFloor` doit poser sur le COUNT comme sur la PAGE.
      count: jest.fn(async ({ where }: { where: Record<string, any> }) => {
        const gte = where?.createdAt?.gte;
        const floored = gte instanceof Date && gte.getTime() === FLOOR_DATE.getTime();
        return floored ? FLOORED_TOTAL : UNFLOORED_TOTAL;
      }),
    },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return { app, prisma };
}

describe('GET /conversations/:id/pinned-messages — le total respecte le plancher du lecteur (#4177)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("`pagination.total` est le compte PLANCHÉ, pas la cardinalité brute d'avant l'arrivée", async () => {
    const { app } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pagination.total).toBe(FLOORED_TOTAL);
      expect(body.pagination.total).not.toBe(UNFLOORED_TOTAL);
    } finally {
      await app.close();
    }
  });
});
