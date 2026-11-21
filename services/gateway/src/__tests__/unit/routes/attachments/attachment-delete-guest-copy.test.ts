/**
 * #20142 — un INVITÉ supprime la pièce qu'il a lui-même transférée.
 *
 * La branche anonyme de `DELETE /attachments/:id` exige les DEUX champs :
 *
 *     hasPermission = attachment.uploadedBy === userId && attachment.isAnonymous;
 *
 * `copiedAttachmentFields` posait `isAnonymous: false` sans condition, parce
 * qu'il ne connaît pas le copieur. Pour un invité, `uploadedBy` appariait donc
 * (son `Participant.id` EST son identité d'authentification) et `isAnonymous`
 * refusait : **403 sur une pièce qu'il venait de créer**, avec un bouton que le
 * web offrait malgré tout, puisqu'il ne regarde que `uploadedBy`.
 *
 * Ces témoins décrivent la PORTE, pas l'écrivain : ils montrent ce que la porte
 * fait d'une ligne bien estampillée, d'une ligne mal estampillée (la forme
 * héritée) et d'une ligne d'autrui.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

/** L'identité d'un invité EST son `Participant.id` : la porte anonyme lit `userId`. */
const GUEST_PARTICIPANT = '507f1f77bcf86cd7994390aa';
const OTHER_GUEST = '507f1f77bcf86cd7994390bb';
const ATTACHMENT_ID = '507f1f77bcf86cd7994390cc';
const MESSAGE_ID = '507f1f77bcf86cd7994390dd';
const CONVERSATION_ID = '507f1f77bcf86cd7994390ee';

const buildGuestHarness = async () => {
  const io = { to: () => ({ emit: () => undefined }) };
  const prisma = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    message: {
      findUnique: jest.fn<any>(async () => ({
        id: MESSAGE_ID, conversationId: CONVERSATION_ID, isEncrypted: false, encryptionMode: null,
      })),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ encryptionMode: null }) },
  } as any;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  const authOptional = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: true,
      // La porte anonyme compare `attachment.uploadedBy` à CE champ, et pour un
      // invité il porte son `Participant.id` (`middleware/auth.ts`).
      userId: GUEST_PARTICIPANT,
      participantId: GUEST_PARTICIPANT,
    };
  };
  await registerMetadataRoutes(app, authOptional, prisma);
  await app.ready();
  return { app, prisma };
};

const remove = (app: Awaited<ReturnType<typeof buildGuestHarness>>['app']) =>
  app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });

const copie = (uploadedBy: string, isAnonymous: boolean) => ({
  id: ATTACHMENT_ID, messageId: MESSAGE_ID, uploadedBy, isAnonymous,
});

describe('DELETE /attachments/:id — la copie d’un INVITÉ (#20142)', () => {
  beforeEach(() => {
    mockGetAttachment.mockReset();
    mockDeleteAttachment.mockClear();
  });

  it('EFFACE la copie correctement estampillée par son invité', async () => {
    mockGetAttachment.mockResolvedValueOnce(copie(GUEST_PARTICIPANT, true));
    const { app } = await buildGuestHarness();

    const response = await remove(app);

    expect(response.statusCode).not.toBe(403);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    await app.close();
  });

  /**
   * La forme HÉRITÉE, et pourquoi la porte reste stricte.
   *
   * Une copie écrite avant #20142 porte `isAnonymous: false` : la porte refuse,
   * et on ne l'élargit PAS. `isAnonymous` est le second facteur qui dit que la
   * ligne appartient bien à une identité anonyme, et une session d'invité de
   * lien partagé est éphémère — les copies « héritées » appartiennent à des
   * sessions qui n'existent plus. Élargir une porte d'accès pour rattraper des
   * lignes dont le propriétaire a disparu serait payer cher une faveur à
   * personne.
   */
  it("REFUSE la forme héritée, mal estampillée — et la porte ne s'élargit pas pour elle", async () => {
    mockGetAttachment.mockResolvedValueOnce(copie(GUEST_PARTICIPANT, false));
    const { app } = await buildGuestHarness();

    expect((await remove(app)).statusCode).toBe(403);
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
    await app.close();
  });

  it("REFUSE la pièce d'un AUTRE invité, même bien estampillée", async () => {
    mockGetAttachment.mockResolvedValueOnce(copie(OTHER_GUEST, true));
    const { app } = await buildGuestHarness();

    expect((await remove(app)).statusCode).toBe(403);
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
    await app.close();
  });
});
