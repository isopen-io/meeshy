/**
 * #13802 — DELETE /attachments/:attachmentId dans une conversation chiffrée de
 * bout en bout : la pièce d'un message scellé au serveur s'efface comme le
 * message lui-même (#13142), par signal chiffré ; la route en clair répond 409
 * `E2EE_SIGNAL_CHANNEL_REQUIRED` APRÈS le contrôle du droit, sans rien effacer
 * ni diffuser. La pièce d'un message que le serveur lit (écrit avant
 * l'activation, ou d'une conversation qui n'est pas en bout en bout) se
 * supprime comme avant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';
import { E2EE_ERROR_CODES, E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE } from '@meeshy/shared/types/e2ee-directory';

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
const ATTACHMENT_ID = '507f1f77bcf86cd7994390cc';
const MESSAGE_ID = '507f1f77bcf86cd7994390dd';
const CONVERSATION_ID = '507f1f77bcf86cd7994390ee';

type MessageRow = { isEncrypted: boolean; encryptionMode: string | null };
type Scene = { message: MessageRow | null; conversationMode: string | null };

const buildHarness = async (scene: Scene) => {
  const emitted: Array<{ room: string; event: string }> = [];
  const io = { to: (room: string) => ({ emit: (event: string) => emitted.push({ room, event }) }) };
  const prisma = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    message: {
      findUnique: jest.fn<any>(async () =>
        scene.message === null ? null : { id: MESSAGE_ID, conversationId: CONVERSATION_ID, ...scene.message },
      ),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ encryptionMode: scene.conversationMode }),
    },
  } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  const authOptional = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  await registerMetadataRoutes(app, authOptional, prisma);
  await app.ready();
  return { app, emitted };
};

const ownAttachment = (uploadedBy = USER_ID) => ({ id: ATTACHMENT_ID, messageId: MESSAGE_ID, uploadedBy, isAnonymous: false });

const remove = (app: Awaited<ReturnType<typeof buildHarness>>['app']) =>
  app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });

const SEALED: MessageRow = { isEncrypted: true, encryptionMode: 'e2ee' };

describe('DELETE /attachments/:id — conversation chiffrée de bout en bout (#13802)', () => {
  beforeEach(() => {
    mockGetAttachment.mockReset();
    mockDeleteAttachment.mockClear();
  });

  it("refuse en 409 la pièce d'un message scellé, sans l'effacer ni le diffuser", async () => {
    mockGetAttachment.mockResolvedValueOnce(ownAttachment());
    const { app, emitted } = await buildHarness({ message: SEALED, conversationMode: 'e2ee' });

    const response = await remove(app);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      success: false,
      error: E2EE_SIGNAL_CHANNEL_REQUIRED_MESSAGE,
      code: E2EE_ERROR_CODES.SIGNAL_CHANNEL_REQUIRED,
    });
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    await app.close();
  });

  it("refuse un tiers comme un tiers : le 403 passe avant le régime", async () => {
    mockGetAttachment.mockResolvedValueOnce(ownAttachment(OTHER_USER_ID));
    const { app } = await buildHarness({ message: SEALED, conversationMode: 'e2ee' });

    expect((await remove(app)).statusCode).toBe(403);
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
    await app.close();
  });

  it.each<[string, Scene]>([
    ["un message d'avant l'activation, en clair", { message: { isEncrypted: false, encryptionMode: null }, conversationMode: 'e2ee' }],
    ['un message lu par le serveur', { message: { isEncrypted: true, encryptionMode: 'server' }, conversationMode: 'e2ee' }],
    ["une ligne scellée d'une conversation hybride", { message: SEALED, conversationMode: 'hybrid' }],
    ['un message introuvable', { message: null, conversationMode: 'e2ee' }],
  ])('supprime comme avant la pièce d\'%s', async (_label, scene) => {
    mockGetAttachment.mockResolvedValueOnce(ownAttachment());
    const { app } = await buildHarness(scene);

    expect((await remove(app)).statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    await app.close();
  });

  it("supprime comme avant une pièce rattachée à aucun message", async () => {
    mockGetAttachment.mockResolvedValueOnce({ ...ownAttachment(), messageId: null });
    const { app } = await buildHarness({ message: SEALED, conversationMode: 'e2ee' });

    expect((await remove(app)).statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    await app.close();
  });
});
