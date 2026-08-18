import { AttachmentReactionService } from '../AttachmentReactionService';

const makePrismaMock = () => {
  const rows: { attachmentId: string; participantId: string; emoji: string }[] = [];
  return {
    rows,
    attachmentReaction: {
      // La clé unique porte le TRIPLET depuis les multi-réactions
      // (2026-08-18) : ce double DOIT matcher l'emoji, sinon il rend « déjà
      // réagi » pour un emoji que le participant n'a jamais posé — et le
      // service, qui s'y fie pour sa détection de no-op, n'ajoute plus rien.
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.attachment_participant_reaction;
        return rows.find(r => r.attachmentId === key.attachmentId
          && r.participantId === key.participantId
          && r.emoji === key.emoji) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId
          && (where.participantId ? r.participantId === where.participantId : true))),
      // Miroir de l'upsert Mongo sur la clé TRIPLE (attachmentId,
      // participantId, emoji) : deux adds du MÊME emoji convergent sur le même
      // document, deux emojis DIFFÉRENTS créent chacun le leur. `update: {}` —
      // la ligne visée porte déjà cet emoji par construction de la clé.
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

  it('empile les emojis d\'un même participant — plus AUCUN cap ni remplacement', async () => {
    // Multi-réactions (2026-08-18) : ce témoin affirmait l'inverse — « caps at
    // 1 emoji per user per attachment (replaces) ». Le cap a disparu avec la
    // clé unique élargie au triplet ; poser un second emoji AJOUTE.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '❤️': 1, '👍': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['❤️', '👍']);
  });

  it('ne crée jamais deux lignes pour le MÊME emoji, même en course concurrente', async () => {
    // Régression de la course aux doublons : l'ancienne séquence
    // find/deleteMany/upsert laissait deux appels concurrents passer tous deux
    // le contrôle « pas de réaction existante » avant qu'aucun ne commite,
    // chacun insérant sa ligne. L'upsert reste la réponse.
    //
    // Ce que la garde affirme a changé de BORNE avec les multi-réactions
    // (2026-08-18) : la clé porte l'emoji, donc deux emojis DIFFÉRENTS créent
    // légitimement deux lignes — c'est le modèle, plus la course. Ce qui doit
    // rester impossible, et que ce témoin mesure, c'est le doublon du MÊME
    // emoji.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await Promise.all([
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🎉' }),
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🎉' }),
    ]);
    expect(prisma.rows.filter((r: any) => r.attachmentId === 'att1' && r.participantId === 'p1')).toHaveLength(1);
  });

  it('deux emojis DIFFÉRENTS posés concurremment donnent deux lignes — le modèle, pas une course', async () => {
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

  it('reports changed=true when STACKING a different emoji (plus aucun swap)', async () => {
    // Le titre disait « swapping » : l'ancien modèle évinçait ❤️. Le résultat
    // attendu est le même (`changed: true`) mais pour une raison OPPOSÉE — ce
    // n'est plus un remplacement, c'est un ajout, et ❤️ reste en place.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    expect(await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' }))
      .toEqual({ changed: true });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['❤️', '👍']);
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
