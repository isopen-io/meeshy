/**
 * #13608 — DELETE /attachments/:attachmentId
 *  (a) l'auteur inscrit supprime la copie qu'il a transférée (uploadedBy = Participant.id)
 *  (b) la suppression est diffusée à l'audience VIVANTE de la conversation
 *      (`attachment:deleted`) : la room de la conversation ET les rooms
 *      personnelles, plus la file hors ligne (#20019)
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

const cutTogetherWhere = jest.fn(async (_scope: unknown) => undefined);
jest.mock('../../../../services/together/togetherDeps', () => ({
  cutTogetherWhere: (scope: unknown) => cutTogetherWhere(scope),
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
import { liveParticipantTable } from '../../../helpers/live-audience-double';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const MY_PARTICIPANT_ID = '507f1f77bcf86cd7994390aa';
const OTHER_PARTICIPANT_ID = '507f1f77bcf86cd7994390bb';
const ATTACHMENT_ID = '507f1f77bcf86cd7994390cc';
const MESSAGE_ID = '507f1f77bcf86cd7994390dd';
const CONVERSATION_ID = '507f1f77bcf86cd7994390ee';
const GUEST_PARTICIPANT_ID = '507f1f77bcf86cd7994390e1';

const participants: Record<string, { userId: string | null }> = {
  [MY_PARTICIPANT_ID]: { userId: USER_ID },
  [OTHER_PARTICIPANT_ID]: { userId: OTHER_USER_ID },
};

type IoMode = 'present' | 'absent' | 'throwing';

const buildHarness = async (role = 'USER', ioMode: IoMode = 'present', as?: { anonymous: string }) => {
  const emitted: Array<{ room: string | string[]; event: string; payload: unknown }> = [];
  // `to` prend `Room | Room[]` chez Socket.IO, et l'audience vivante en rend un
  // TABLEAU dès qu'il y a un participant à nommer (#20007). Un double déclaré
  // `to(room: string)` ACCEPTE l'appel et range l'émission sous le tableau
  // lui-même — donc sous une clé qu'aucune assertion ne peut nommer (cycle 188).
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => {
        if (ioMode === 'throwing') throw new Error('adapter down');
        emitted.push({ room, event, payload });
      },
    }),
  };
  const enqueued: unknown[] = [];
  // Sans `findMany`, la lecture d'audience LÈVE et le site replie sur la room de
  // conversation : le témoin de surface passerait en n'exerçant que le repli.
  const liveParticipants = liveParticipantTable([
    { id: MY_PARTICIPANT_ID, userId: USER_ID, conversationId: CONVERSATION_ID, isActive: true },
    { id: OTHER_PARTICIPANT_ID, userId: OTHER_USER_ID, conversationId: CONVERSATION_ID, isActive: true },
    { id: GUEST_PARTICIPANT_ID, userId: null, conversationId: CONVERSATION_ID, isActive: true },
  ]);
  const prisma = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>(async ({ where }: any) => participants[where.id] ?? null),
      findMany: liveParticipants.findMany,
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONVERSATION_ID }),
    },
  } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('socketIOHandler', {
    getManager: () => ({
      getIO: () => (ioMode === 'absent' ? undefined : io),
      enqueueOfflineMessageMutation: async (params: unknown) => {
        enqueued.push(params);
      },
    }),
  });
  const authOptional = async (req: FastifyRequest) => {
    (req as any).authContext = as
      // Un invité de lien : `userId` porte son `Participant.id`, et il n'a
      // AUCUN `User.id` — c'est tout le piège que la dérivation des deux rôles
      // ferme (CLAUDE.md, § Authentication).
      ? { isAuthenticated: true, isAnonymous: true, userId: as.anonymous, participantId: as.anonymous }
      : { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role } };
  };
  await registerMetadataRoutes(app, authOptional, prisma);
  await app.ready();
  return { app, emitted, enqueued };
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
  it('émet attachment:deleted à l\'audience VIVANTE, sans contenu de la pièce (#20019)', async () => {
    mockGetAttachment.mockResolvedValueOnce({ ...attachmentOf(USER_ID), fileUrl: 'https://x/secret.png' });
    const { app, emitted } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    expect(emitted).toEqual([{
      // La room de conversation SUIVIE des rooms personnelles : un lecteur
      // revenu à la LISTE a quitté `conversation:<id>` et garde la sienne.
      room: [
        `conversation:${CONVERSATION_ID}`,
        `user:${USER_ID}`,
        `user:${OTHER_USER_ID}`,
        `user:${GUEST_PARTICIPANT_ID}`,
      ],
      event: 'attachment:deleted',
      payload: { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, attachmentId: ATTACHMENT_ID },
    }]);
    await app.close();
  });

  it('un INVITÉ qui retire SA pièce est exclu par sa LIGNE, pas par un `userId` (#20019)', async () => {
    // La route est `authOptional` et l'invité retire la pièce qu'il a
    // téléversée : `authContext.userId` porte un `Participant.id`.
    participants[GUEST_PARTICIPANT_ID] = { userId: null };
    mockGetAttachment.mockResolvedValueOnce({
      id: ATTACHMENT_ID, messageId: MESSAGE_ID, uploadedBy: GUEST_PARTICIPANT_ID, isAnonymous: true,
    });
    const { app, enqueued } = await buildHarness('USER', 'present', { anonymous: GUEST_PARTICIPANT_ID });
    expect((await remove(app)).statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(enqueued[0]).toMatchObject({ actorUserId: null, actorParticipantId: GUEST_PARTICIPANT_ID });
    await app.close();
  });

  it('enfile le retrait pour les absents, sous la clé de la PIÈCE (#20019)', async () => {
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(USER_ID));
    const { app, enqueued } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(enqueued).toEqual([{
      conversationId: CONVERSATION_ID,
      actorUserId: USER_ID,
      messageId: MESSAGE_ID,
      eventType: 'attachment-deleted',
      payload: { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID, attachmentId: ATTACHMENT_ID },
      dedupKey: ATTACHMENT_ID,
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

  it.each<IoMode>(['absent', 'throwing'])('reste 200 et supprime quand la diffusion est %s', async (ioMode) => {
    mockDeleteAttachment.mockClear();
    mockGetAttachment.mockResolvedValueOnce(attachmentOf(USER_ID));
    const { app, emitted } = await buildHarness('USER', ioMode);
    expect((await remove(app)).statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(emitted).toEqual([]);
    await app.close();
  });
});

describe('DELETE /attachments/:id — séance « ensemble » (#17022)', () => {
  it.each([['une vidéo', 'video/mp4'], ['un audio', 'audio/aac']])('supprimer %s coupe les séances de sa conversation', async (_cas, mimeType) => {
    cutTogetherWhere.mockClear();
    mockGetAttachment.mockResolvedValueOnce({ ...attachmentOf(USER_ID), mimeType });
    const { app } = await buildHarness();
    expect((await remove(app)).statusCode).toBe(200);
    expect(cutTogetherWhere).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
    await app.close();
  });

  it('supprimer une image, ou être refusé, ne rejuge rien', async () => {
    cutTogetherWhere.mockClear();
    mockGetAttachment.mockResolvedValueOnce({ ...attachmentOf(USER_ID), mimeType: 'image/png' });
    mockGetAttachment.mockResolvedValueOnce({ ...attachmentOf(OTHER_PARTICIPANT_ID), mimeType: 'video/mp4' });
    const { app } = await buildHarness();
    await remove(app);
    expect((await remove(app)).statusCode).toBe(403);
    expect(cutTogetherWhere).not.toHaveBeenCalled();
    await app.close();
  });
});
