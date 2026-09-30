/**
 * `PUT /conversations/:id/messages/:messageId/pin` crédite `tool.pin` (#8959) —
 * seulement quand le message DEVIENT épinglé, jamais sur un ré-épinglage, un
 * refus ou un appelant anonyme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

const mockRecordActivity = jest.fn<any>();
jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: mockRecordActivity })),
}));

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

async function buildApp(options: { pinnedAt?: Date | null; exists?: boolean; anonymous?: boolean } = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(
        options.exists === false ? null : { id: MESSAGE_ID, pinnedAt: options.pinnedAt ?? null },
      ),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
  const auth = async (req: any) => {
    req.authContext = {
      type: options.anonymous ? 'anonymous' : 'user',
      isAuthenticated: true,
      isAnonymous: Boolean(options.anonymous),
      userId: USER_ID,
    };
  };
  registerMessagePinRoutes(app, prisma as any, auth, null);
  await app.ready();
  return { app, prisma };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const pin = (app: Awaited<ReturnType<typeof buildApp>>['app']) =>
  app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });

describe('tool.pin', () => {
  beforeEach(() => {
    mockRecordActivity.mockReset();
    mockRecordActivity.mockResolvedValue(undefined);
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('crédite l\'épingleur dans la conversation quand le message devient épinglé', async () => {
    const { app } = await buildApp();
    try {
      const res = await pin(app);
      await flush();
      expect(res.statusCode).toBe(200);
      expect(mockRecordActivity).toHaveBeenCalledWith(USER_ID, 'tool.pin', { conversationId: CONV_ID });
    } finally {
      await app.close();
    }
  });

  it('ne crédite rien pour un message DÉJÀ épinglé', async () => {
    const { app } = await buildApp({ pinnedAt: new Date('2026-09-29T10:00:00Z') });
    try {
      const res = await pin(app);
      await flush();
      expect(res.statusCode).toBe(200);
      expect(mockRecordActivity).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('ne crédite rien quand le message est introuvable', async () => {
    const { app } = await buildApp({ exists: false });
    try {
      const res = await pin(app);
      await flush();
      expect(res.statusCode).toBe(404);
      expect(mockRecordActivity).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('ne crédite rien pour un appelant anonyme', async () => {
    const { app } = await buildApp({ anonymous: true });
    try {
      await pin(app);
      await flush();
      expect(mockRecordActivity).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('une panne du crédit ne fait pas échouer l\'épingle', async () => {
    mockRecordActivity.mockRejectedValue(new Error('down'));
    const { app } = await buildApp();
    try {
      const res = await pin(app);
      await flush();
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
