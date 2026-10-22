/**
 * `PUT` / `DELETE /conversations/:id/messages/:messageId/pin` (#11219) — une
 * épingle se voit de TOUS : la poser ou la retirer exige le droit d'écrire.
 * Un simple abonné d'un canal d'annonces n'épingle pas, une conversation close
 * n'accepte plus d'épingle, et les deux sens du geste partagent la même porte.
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

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn(async () => undefined) })),
}));

jest.mock('../../../services/conversations/conversationActivity', () => ({
  announceConversationActivity: jest.fn(async () => undefined),
}));

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

type Conversation = { type: string; isActive?: boolean; closedAt?: Date | null; isAnnouncementChannel?: boolean; defaultWriteRole?: string | null };
type Pinner = { role: string; user: { role: string; birthDate?: Date | null } | null; permissions?: unknown; anonymousSession?: unknown } | null;

async function buildApp(options: { conversation: Conversation; pinner: Pinner }) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID, pinnedAt: null, conversation: options.conversation }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(options.pinner) },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: null }) },
  };
  const auth = async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  };
  registerMessagePinRoutes(app, prisma as any, auth, null);
  await app.ready();
  return { app, prisma };
}

const url = `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin`;
const announcements: Conversation = { type: 'broadcast', isActive: true, closedAt: null, isAnnouncementChannel: true, defaultWriteRole: 'admin' };
const subscriber: Pinner = { role: 'member', user: { role: 'USER' } };

describe('épingler exige le droit d’écrire (#11219)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it.each(['PUT', 'DELETE'] as const)('%s : un simple abonné d’un canal d’annonces est refusé (403), rien n’est écrit', async (method) => {
    const { app, prisma } = await buildApp({ conversation: announcements, pinner: subscriber });
    try {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(403);
      expect(prisma.message.update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each(['PUT', 'DELETE'] as const)('%s : l’administrateur du canal épingle', async (method) => {
    const { app, prisma } = await buildApp({ conversation: announcements, pinner: { role: 'admin', user: { role: 'USER' } } });
    try {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each(['PUT', 'DELETE'] as const)('%s : une conversation close refuse en 410, même au créateur', async (method) => {
    const closed: Conversation = { type: 'group', isActive: true, closedAt: new Date('2026-10-19T00:00:00.000Z'), isAnnouncementChannel: false, defaultWriteRole: 'everyone' };
    const { app, prisma } = await buildApp({ conversation: closed, pinner: { role: 'creator', user: { role: 'BIGBOSS' } } });
    try {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(410);
      expect(prisma.message.update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('la conversation est lue AVEC le message, sans lecture de plus', async () => {
    const { app, prisma } = await buildApp({ conversation: announcements, pinner: subscriber });
    try {
      await app.inject({ method: 'PUT', url });
      const [args] = prisma.message.findFirst.mock.calls[0] as [{ select: { conversation: { select: Record<string, boolean> } } }];
      expect(args.select.conversation.select).toEqual(expect.objectContaining({ isActive: true, closedAt: true, isAnnouncementChannel: true, defaultWriteRole: true, type: true }));
    } finally {
      await app.close();
    }
  });
});
