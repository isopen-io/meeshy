import { AttachmentReactionService } from '../AttachmentReactionService';

const makePrismaMock = () => {
  const rows: { attachmentId: string; participantId: string; emoji: string }[] = [];
  return {
    rows,
    attachmentReaction: {
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId
          && (where.participantId ? r.participantId === where.participantId : true))),
      // Mirrors the real Mongo upsert on the (attachmentId, participantId)
      // compound key (no emoji) — updates the existing row's emoji in place
      // instead of ever inserting a second row for the same participant.
      upsert: jest.fn(async ({ create, update }: any) => {
        const existing = rows.find(r => r.attachmentId === create.attachmentId
          && r.participantId === create.participantId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        rows.push(create);
        return create;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].attachmentId === where.attachmentId
            && rows[i].participantId === where.participantId
            && (where.emoji ? rows[i].emoji === where.emoji : true)) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
    message: { findUnique: jest.fn(async () => ({ conversationId: 'conv1' })) },
  } as any;
};

describe('AttachmentReactionService', () => {
  it('adds a reaction → summary + currentUserReactions', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '❤️': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['❤️']);
  });

  it('caps at 1 emoji per user per attachment (replaces)', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '👍': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['👍']);
  });

  it('never ends up with two rows for the same participant, even racing two different emojis concurrently', async () => {
    // Regression for the duplicate-reaction race: the old find/deleteMany/upsert
    // sequence let two concurrent calls with different emojis both pass the
    // "no existing reaction" check before either committed, each inserting its
    // own row. The upsert now targets the (attachmentId, participantId) key
    // with no emoji, so both calls race on the SAME document.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await Promise.all([
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🎉' }),
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
    ]);
    expect(prisma.rows.filter((r: any) => r.attachmentId === 'att1' && r.participantId === 'p1')).toHaveLength(1);
  });

  it('removes a reaction', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.getReactionSummary('att1')).toEqual({});
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual([]);
  });

  it('currentUserReactions is empty for another participant', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '👍': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p2')).toEqual([]);
  });

  it('resolves conversationId from messageId', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    expect(await svc.resolveConversationId('m1')).toBe('conv1');
  });
});
