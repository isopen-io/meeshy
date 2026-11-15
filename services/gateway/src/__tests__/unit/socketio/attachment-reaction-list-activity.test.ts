/**
 * Réagir à une PIÈCE JOINTE est une ACTIVITÉ — la conversation remonte en tête
 * de liste, pour tous (#9026, directive porteur du 2026-10-01).
 *
 * `AttachmentReactionService` se présente comme « Miroir de `ReactionService` »
 * et son modèle « suit exactement les réactions message-level ». La jumelle
 * fait DEUX choses après son `upsert` que celle-ci ne faisait pas :
 * `recordConversationActivity` (le rang durable) et, chez son gestionnaire,
 * `emitConversationActivityUpdate` (le rang servi à chaque participant).
 *
 * Résultat mesuré avant ce lot : réagir ❤️ au message « Regarde ça » remonte la
 * conversation en tête chez tout le monde ; réagir ❤️ à LA PHOTO du même
 * message ne bougeait AUCUNE liste — ni en direct, ni au rechargement, le tri
 * de `GET /conversations` étant max(`lastMessageAt`, `lastActivityAt`), dont
 * aucun des deux n'avait avancé.
 *
 * Le drapeau est `rank`, JAMAIS `reaction` : `emitConversationActivityUpdate`
 * résout `reaction` en lisant `Conversation.lastReactionId` puis
 * `prisma.reaction.findUnique` — la table des réactions de MESSAGE, où une
 * réaction de pièce jointe n'a pas de ligne. C'est la même raison qui tient
 * `lastReactionId` hors de ce lot (voir le commentaire de clôture).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { AttachmentReactionService } from '../../../services/AttachmentReactionService';

const CONVERSATION = '507f1f77bcf86cd799440011';
const MESSAGE = '507f1f77bcf86cd799440021';
const ATTACHMENT = '507f1f77bcf86cd799440031';
const PARTICIPANT = '507f1f77bcf86cd799440041';
const CREATED_AT = new Date('2026-11-08T12:00:00.000Z');

type Capture = { readonly where: unknown; readonly data: unknown };

/**
 * Le double rend un hôte VIVANT et enregistre les `updateMany` sur
 * `conversation` — c'est là que le rang durable s'écrit.
 */
const servicePrisma = (opts: { readonly alreadyReacted?: boolean } = {}) => {
  const conversationUpdates: Capture[] = [];
  const prisma = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        conversationId: CONVERSATION,
        conversation: { isActive: true, closedAt: null, encryptionMode: null },
      }),
    },
    attachmentReaction: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.alreadyReacted ? { emoji: '❤️' } : null),
      count: jest.fn<any>().mockResolvedValue(0),
      upsert: jest.fn<any>().mockResolvedValue({ id: 'ar-1', createdAt: CREATED_AT }),
    },
    conversation: {
      updateMany: jest.fn<any>().mockImplementation(async (args: Capture) => {
        conversationUpdates.push(args);
        return { count: 1 };
      }),
    },
  };
  return { prisma: prisma as never, conversationUpdates };
};

describe('réagir à une pièce jointe fait remonter la conversation (#9026)', () => {
  it('avance `lastActivityAt` à la date de la réaction, MONOTONE', async () => {
    const { prisma, conversationUpdates } = servicePrisma();
    const service = new AttachmentReactionService(prisma);

    const result = await service.addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });

    expect(result.changed).toBe(true);
    expect(conversationUpdates).toHaveLength(1);
    expect(conversationUpdates[0].data).toEqual({ lastActivityAt: CREATED_AT });
    // Le `where` monotone est la propriété qui fait converger deux activités
    // concurrentes sur la plus récente, quel que soit l'ordre d'arrivée.
    expect(conversationUpdates[0].where).toEqual({
      id: CONVERSATION,
      OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: CREATED_AT } }],
    });
  });

  it('rend la date de la réaction, pour que le gestionnaire serve le MÊME rang', async () => {
    const { prisma } = servicePrisma();
    const service = new AttachmentReactionService(prisma);
    const result = await service.addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });
    expect(result.at).toEqual(CREATED_AT);
  });

  it("un no-op idempotent n'avance RIEN : la jumelle ne crédite jamais un `unchanged`", async () => {
    const { prisma, conversationUpdates } = servicePrisma({ alreadyReacted: true });
    const service = new AttachmentReactionService(prisma);
    const result = await service.addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });
    expect(result.changed).toBe(false);
    expect(conversationUpdates).toHaveLength(0);
  });

  it('une base qui refuse le rang ne fait pas échouer la réaction, déjà écrite', async () => {
    const { prisma } = servicePrisma();
    (prisma as unknown as { conversation: { updateMany: jest.Mock } }).conversation.updateMany =
      jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const service = new AttachmentReactionService(prisma as never);
    await expect(
      service.addAttachmentReaction({
        attachmentId: ATTACHMENT,
        messageId: MESSAGE,
        participantId: PARTICIPANT,
        emoji: '❤️',
      })
    ).resolves.toMatchObject({ changed: true });
  });

  it('le RETRAIT ne touche pas au rang — #9026 dit « une réaction POSÉE », et la jumelle ne le fait pas non plus', async () => {
    const { prisma, conversationUpdates } = servicePrisma();
    (prisma as unknown as { attachmentReaction: Record<string, unknown> }).attachmentReaction = {
      ...(prisma as unknown as { attachmentReaction: Record<string, unknown> }).attachmentReaction,
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    };
    const service = new AttachmentReactionService(prisma as never);
    await service.removeAttachmentReaction({
      attachmentId: ATTACHMENT,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });
    expect(conversationUpdates).toHaveLength(0);
  });
});
