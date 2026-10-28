/**
 * #13608 — DELETE /attachments/:attachmentId
 *  (a) l'auteur inscrit supprime la copie qu'il a transférée (uploadedBy = Participant.id)
 *  (b) la suppression est diffusée à la room de la conversation (`attachment:deleted`)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const mockGetAttachment = jest.fn<any>();
const mockDeleteAttachment = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachment: (...args: any[]) => mockGetAttachment(...args),
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
  })),
}));

import { registerMetadataRoutes } from '../../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const MY_PARTICIPANT_ID = '507f1f77bcf86cd7994390aa';
const OTHER_PARTICIPANT_ID = '507f1f77bcf86cd7994390bb';
const ATTACHMENT_ID = '507f1f77bcf86cd7994390cc';
const MESSAGE_ID = '507f1f77bcf86cd7994390dd';
const CONVERSATION_ID = '507f1f77bcf86cd7994390ee';

const participants: Record<string, { userId: string | null }> = {
  [MY_PARTICIPANT_ID]: { userId: USER_ID },
  [OTHER_PARTICIPANT_ID]: { userId: OTHER_USER_ID },
};

const buildHarness = async (role = 'USER') => {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); },
    }),
  };
  const prisma = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>(async ({ where }: any) => participants[where.id] ?? null),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONVERSATION_ID }),
    },
  } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  const authOptional = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role },
    };
  };
  await registerMetadataRoutes(app, authOptional, prisma);
  await app.ready();
  return { app, emitted };
};

const attachmentOf = (uploadedBy: string) => ({
  id: ATTACHMENT_ID, messageId: MESSAGE_ID, uploadedBy, isAnonymous: false,
});

const remove = (app: Awaited<ReturnType<typeof buildHarness>>['app']) =>
  app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });

describe('DELETE /attachments/:id — copie transférée (uploadedBy = Participant.id)', () => {
  it('autorise l\'auteur dont le Participant.id est enregistré comme téléverseur', async () => {
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(MY_PARTICIPANT_ID));
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    await app.close();
  });

  it('refuse un tiers : le Participant.id d\'un autre utilisateur ne vaut rien', async () => {
    mockDeleteAttachment.mockClear();
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(OTHER_PARTICIPANT_ID));
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(403);
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un identifiant inconnu', async () => {
    mockDeleteAttachment.mockClear();
    mockGetAttachment.mockResolvedValueOnce(attachmentOf('507f1f77bcf86cd7994390ff'));
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(403);
    await app.close();
  });

  it('refuse un participant anonyme sans compte (userId nul)', async () => {
    participants['507f1f77bcf86cd7994390a1'] = { userId: null };
    mockGetAttachment.mockResolvedValueOnce(attachmentOf('507f1f77bcf86cd7994390a1'));
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(403);
    await app.close();
  });

  it('garde le droit de modération d\'un rôle privilégié', async () => {
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(OTHER_PARTICIPANT_ID));
    const { app } = await buildHarness('ADMIN');
    expect((await remove(app)).statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /attachments/:id — diffusion', () => {
  it('émet attachment:deleted vers la room de la conversation, sans contenu de la pièce', async () => {
    mockGetAttachment.mockResolvedValueOnce({ ...attachmentOf(USER_ID), fileUrl: 'https://x/secret.png' });
    const { app, emitted } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    expect(emitted).toEqual([{
      room: `conversation:${CONVERSATION_ID}`,
      event: 'attachment:deleted',
      payload: { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, attachmentId: ATTACHMENT_ID },
    }]);
    await app.close();
  });

  it('n\'émet rien quand la suppression est refusée', async () => {
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(OTHER_PARTICIPANT_ID));
    const { app, emitted } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(403);
    expect(emitted).toEqual([]);
    await app.close();
  });

  it('reste 200 quand aucune diffusion n\'est disponible', async () => {
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(USER_ID));
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    await app.close();
  });
});
