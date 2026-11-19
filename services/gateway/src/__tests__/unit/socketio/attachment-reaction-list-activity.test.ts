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
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const CONVERSATION = '507f1f77bcf86cd799440011';
const MESSAGE = '507f1f77bcf86cd799440021';
const ATTACHMENT = '507f1f77bcf86cd799440031';
const PARTICIPANT = '507f1f77bcf86cd799440041';
const CREATED_AT = new Date('2026-11-08T12:00:00.000Z');

type Capture = { readonly where: MongoDocument; readonly data: MongoDocument };

/**
 * Le document de la conversation hôte, à la forme NOMINALE : `lastActivityAt`
 * ABSENT, ce que produisent les treize chemins de création (#19800). Le double
 * ÉVALUE le `where` contre lui au lieu de rendre `count: 1` quelle que soit la
 * clause — « un double ment aussi par ce qu'il ACCEPTE ».
 */
const hote = (): MongoDocument => ({ id: CONVERSATION, lastMessageAt: new Date('2026-11-08T09:00:00.000Z') });

/**
 * Le double rend un hôte VIVANT, ÉVALUE les `updateMany` sur `conversation`
 * contre son document et les APPLIQUE — c'est là que le rang durable s'écrit.
 */
const servicePrisma = (opts: { readonly alreadyReacted?: boolean; readonly conversation?: MongoDocument } = {}) => {
  const conversationUpdates: Capture[] = [];
  const row = opts.conversation ?? hote();
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
        if (!matchesMongoWhere(row, args.where)) return { count: 0 };
        Object.assign(row, args.data);
        return { count: 1 };
      }),
    },
  };
  return { prisma: prisma as never, conversationUpdates, row };
};

describe('réagir à une pièce jointe fait remonter la conversation (#9026)', () => {
  it('avance `lastActivityAt` à la date de la réaction sur la conversation NOMINALE (colonne absente)', async () => {
    const { prisma, conversationUpdates, row } = servicePrisma();
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
    // L'EFFET, pas la clause : avant #19800 le `where` n'appariait pas ce
    // document, `updateMany` rendait `count: 0`, et cette ligne-ci tombe.
    expect(row.lastActivityAt).toEqual(CREATED_AT);
  });

  it('ne recule pas une activité plus RÉCENTE — la monotonie, lue sur le document', async () => {
    const plusTard = new Date('2026-11-08T13:00:00.000Z');
    const { prisma, row } = servicePrisma({ conversation: { id: CONVERSATION, lastActivityAt: plusTard } });
    const service = new AttachmentReactionService(prisma);

    await service.addAttachmentReaction({
      attachmentId: ATTACHMENT,
      messageId: MESSAGE,
      participantId: PARTICIPANT,
      emoji: '❤️',
    });

    expect(row.lastActivityAt).toEqual(plusTard);
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
