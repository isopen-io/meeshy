/**
 * #11269 — une vue unique PURGÉE ne rend plus son détail.
 *
 * L'ancienne purge remettait `viewOnceBurnAt` à `null` même quand une pièce
 * résistait : la loi du porteur, qui ne lisait que les échéances, rendait le
 * détail de la pièce survivante — y compris à un destinataire qui ne l'avait
 * jamais ouverte. Le double PROJETTE par `select` : une colonne oubliée dans la
 * requête se lirait `undefined`, et ce témoin tomberait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: any[]) => mockGetAttachmentWithMetadata(...a),
  })),
}));

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-111aaa';
const PARTICIPANT_ID = 'part-333ccc';
const CARRIER_ID = '507f1f77bcf86cd7994390c2';

const purged = {
  id: CARRIER_ID,
  conversationId: 'conv-vue-unique',
  deletedAt: null,
  viewOnceBurnAt: null,
  viewOnceBurnedAt: new Date(Date.now() - 3_600_000),
  expiresAt: null,
  senderId: 'participant-auteur',
  createdAt: new Date(Date.now() - 8 * 24 * 3_600_000),
  isViewOnce: true,
  effectFlags: 0,
  ephemeralDuration: null,
};

const project = (args: { select?: Record<string, boolean> }) =>
  args.select ? Object.fromEntries(Object.entries(purged).filter(([key]) => args.select?.[key])) : purged;

describe('GET /attachments/:id/metadata — vue unique déjà purgée (#11269)', () => {
  it("rend 404 au destinataire qui ne l'a jamais ouverte, quand une pièce a survécu à une purge ancienne", async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue({
      id: ATTACHMENT_ID,
      type: 'image',
      url: '/files/img.jpg',
      uploadedBy: USER_ID,
      isAnonymous: false,
      messageId: CARRIER_ID,
      isViewOnce: true,
    });
    const prisma = {
      message: {
        findUnique: jest.fn<any>().mockImplementation(async (args: { select?: Record<string, boolean> }) => project(args)),
        findFirst: jest.fn<any>().mockResolvedValue({ id: CARRIER_ID }),
      },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID, conversationId: purged.conversationId }),
        findUnique: jest.fn<any>().mockResolvedValue(null),
      },
      messageStatusEntry: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: true }) },
      userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const authOptional = async (req: any) => {
      req.authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        type: 'registered',
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    };
    await registerMetadataRoutes(app, authOptional, prisma as any);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    await app.close();

    expect(res.statusCode).toBe(404);
  });
});
