/**
 * #9927 — une pièce jointe texte rattachée à un message EXISTANT paraît dans sa
 * conversation : dans Meeshy Global, un mineur déclaré ne l'y ajoute pas.
 * (Fichier séparé : `attachments-upload.test.ts` est à son budget de taille.)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockCreateTextAttachment = jest.fn<any>();
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: jest.fn(),
    createTextAttachment: (...a: any[]) => mockCreateTextAttachment(...a),
    validateFile: jest.fn().mockReturnValue({ valid: true }),
  })),
}));

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

/** Horloge FIGÉE : une date de naissance comparée à l'horloge murale rougirait le jour où l'âge change. */
const FROZEN_NOW = new Date('2026-10-10T12:00:00.000Z');
const yearsBeforeFrozenNow = (years: number): Date =>
  new Date(Date.UTC(FROZEN_NOW.getUTCFullYear() - years, FROZEN_NOW.getUTCMonth(), FROZEN_NOW.getUTCDate()));

function makePrisma(target: { readonly conversationType: string; readonly birthDate: Date | null }) {
  return {
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: true }) },
    message: { findFirst: jest.fn<any>().mockResolvedValue({ conversation: { type: target.conversationType } }) },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: target.birthDate }) },
  };
}

async function buildApp(prisma: ReturnType<typeof makePrisma>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (req: any) => {
    req.authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' }, participantId: null };
  };
  await app.register(multipart);
  registerUploadRoutes(app, auth, prisma as any);
  await app.ready();
  return app;
}

describe('POST /attachments/upload-text — ajout à un message de Global par un mineur (#9927)', () => {
  beforeEach(() => {
    mockCreateTextAttachment.mockReset().mockResolvedValue({ id: 'att-1', fileUrl: 'https://example.com/file.txt' });
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'],
      now: FROZEN_NOW,
    });
  });
  afterEach(() => { jest.useRealTimers(); });

  it('mineur de 15 ans, message de Global : 403 GLOBAL_ADULTS_ONLY, rien n’est créé', async () => {
    const app = await buildApp(makePrisma({ conversationType: 'global', birthDate: yearsBeforeFrozenNow(15) }));
    try {
      const res = await app.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'coucou', messageId: MESSAGE_ID } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: 'GLOBAL_ADULTS_ONLY' });
      expect(mockCreateTextAttachment).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('mineur, message d’un groupe : le fichier est créé, la date de naissance n’est pas lue', async () => {
    const prisma = makePrisma({ conversationType: 'group', birthDate: yearsBeforeFrozenNow(15) });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'coucou', messageId: MESSAGE_ID } });
      expect(res.statusCode).toBe(200);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('sans messageId, le fichier n’entre dans aucune conversation : rien n’est lu', async () => {
    const prisma = makePrisma({ conversationType: 'global', birthDate: yearsBeforeFrozenNow(15) });
    const app = await buildApp(prisma);
    try {
      const res = await app.inject({ method: 'POST', url: '/attachments/upload-text', payload: { content: 'coucou' } });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
