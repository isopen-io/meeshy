/**
 * Épingler ou désépingler dans un fil TERMINÉ rend 410 et NOMME sa raison
 * (`code: 'CONVERSATION_CLOSED'`, audit #19352 A6) : sans code, Android lit
 * `HTTP_410`, classe le refus en panne passagère et rejoue PIN_MESSAGE /
 * UNPIN_MESSAGE cinq fois.
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

/**
 * `pinnedAt` est la PRÉ-CONDITION du geste, et elle est l'état OPPOSÉ de
 * celui qu'il produit (#17031) : un `PUT` ne transite que depuis « non
 * épinglé », un `DELETE` que depuis « épinglé ». La fixture portait `null`
 * pour les deux, donc le `DELETE` y décrivait un REJEU — un état où la route
 * n'écrit, n'annonce et ne diffuse désormais plus rien, par décision. Un
 * témoin de DROIT D'ÉCRIRE posé sur un rejeu ne peut plus voir le droit qu'il
 * garde : c'est l'absence d'effet qui le satisferait, pas le refus.
 */
async function buildApp(options: { conversation: Conversation; pinner: Pinner; pinnedAt?: Date | null }) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID, pinnedAt: options.pinnedAt ?? null, pinnedBy: null, conversation: options.conversation }),
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

describe('une épingle refusée par un fil terminé nomme sa raison', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it.each(['PUT', 'DELETE'] as const)('%s : le 410 porte code CONVERSATION_CLOSED (Android PIN_MESSAGE / UNPIN_MESSAGE)', async (method) => {
    const closed: Conversation = { type: 'group', isActive: true, closedAt: new Date('2026-10-19T00:00:00.000Z'), isAnnouncementChannel: false, defaultWriteRole: 'everyone' };
    const { app } = await buildApp({ conversation: closed, pinner: { role: 'creator', user: { role: 'BIGBOSS' } }, pinnedAt: method === 'DELETE' ? new Date('2026-11-01T08:30:00.000Z') : null });
    try {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(410);
      expect(res.json().code).toBe('CONVERSATION_CLOSED');
    } finally {
      await app.close();
    }
  });
});
