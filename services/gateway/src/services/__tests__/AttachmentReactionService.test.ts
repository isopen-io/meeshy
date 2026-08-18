import { AttachmentReactionService } from '../AttachmentReactionService';

const makePrismaMock = () => {
  const rows: { attachmentId: string; participantId: string; emoji: string }[] = [];
  return {
    rows,
    attachmentReaction: {
      // Les deux accès par clé portent le TRIPLET depuis les multi-réactions
      // (2026-08-18) : `attachment_participant_reaction` nomme
      // (attachmentId, participantId, emoji). Un double qui ignore l'emoji
      // modélise l'ANCIENNE contrainte — il rendait la ligne d'un autre emoji
      // sur `findUnique`, donc faisait sortir `addAttachmentReaction` en no-op,
      // et écrasait l'emoji en place sur `upsert` au lieu d'empiler.
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.attachment_participant_reaction;
        return rows.find(r => r.attachmentId === key.attachmentId
          && r.participantId === key.participantId
          && r.emoji === key.emoji) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId
          && (where.participantId ? r.participantId === where.participantId : true))),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = where.attachment_participant_reaction;
        const existing = rows.find(r => r.attachmentId === key.attachmentId
          && r.participantId === key.participantId
          && r.emoji === key.emoji);
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

  it('empile plusieurs emojis pour le même participant — le second ne remplace plus le premier', async () => {
    // L'inverse exact de ce que ce témoin affirmait jusqu'au 2026-08-18
    // (« caps at 1 emoji per user per attachment (replaces) ») : le modèle
    // 1-emoji-par-personne a été RETIRÉ, pour les pièces jointes comme pour les
    // messages. Le témoin suit son comportement plutôt que d'être supprimé —
    // c'est la même question posée à l'envers, et elle a toujours une réponse.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '❤️': 1, '👍': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['❤️', '👍']);
  });

  it('deux ajouts concurrents du MÊME emoji convergent sur une seule ligne', async () => {
    // Ce que la course garantit encore, et ce qu'elle ne garantit plus.
    //
    // Le témoin d'origine affirmait « jamais deux lignes pour le même
    // participant, même en course sur deux emojis DIFFÉRENTS » — vrai de la clé
    // à deux champs, faux et non souhaitable depuis le triplet : deux emojis
    // distincts DOIVENT créer chacun leur ligne, c'est la fonctionnalité.
    //
    // La propriété d'atomicité survit intacte sur ce qu'elle protégeait
    // vraiment — le double envoi du même emoji (double-tap optimiste, retry
    // socket, second appareil) — et c'est elle qui est épinglée ici.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await Promise.all([
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
    ]);
    expect(prisma.rows.filter((r: any) => r.attachmentId === 'att1' && r.participantId === 'p1')).toHaveLength(1);
  });

  it('deux emojis distincts en course créent chacun leur ligne', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await Promise.all([
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🎉' }),
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
    ]);
    expect(prisma.rows.filter((r: any) => r.attachmentId === 'att1' && r.participantId === 'p1')).toHaveLength(2);
  });

  it('removes a reaction', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.getReactionSummary('att1')).toEqual({});
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual([]);
  });

  it('reports changed=true on a fresh add and changed=false on re-adding the same emoji (idempotent no-op)', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    expect(await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' }))
      .toEqual({ changed: true });
    expect(await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' }))
      .toEqual({ changed: false });
  });

  it('reports changed=true when adding a SECOND, distinct emoji', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' }))
      .toEqual({ changed: true });
  });

  it('returns true when a reaction was removed and false when already absent (idempotent)', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: '❤️' })).toBe(true);
    expect(await svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: '❤️' })).toBe(false);
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
