import { AttachmentReactionService } from '../AttachmentReactionService';

const makePrismaMock = () => {
  const rows: { attachmentId: string; participantId: string; emoji: string }[] = [];
  return {
    rows,
    attachmentReaction: {
      // Clé unique TRIPLE (attachmentId, participantId, emoji) — cf. la
      // migration `2026-08-18-attachment-reaction-multi-per-user-unique-index`.
      // Ignorer `emoji` ici ferait répondre « tu as déjà cet emoji » à un
      // participant qui en a posé un AUTRE, et le service sortirait en no-op.
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.attachment_participant_reaction;
        return rows.find(r => r.attachmentId === key.attachmentId
          && r.participantId === key.participantId
          && r.emoji === key.emoji) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId
          && (where.participantId ? r.participantId === where.participantId : true))),
      // Plafond des cinq réactions (2026-08-20) : décompte des réactions déjà
      // posées par CE participant sur CETTE pièce jointe, tous emojis
      // confondus — c'est ce que `addAttachmentReaction` interroge avant une
      // création réelle.
      count: jest.fn(async ({ where }: any) =>
        rows.filter(r => r.attachmentId === where.attachmentId
          && r.participantId === where.participantId).length),
      // Miroir de l'upsert Mongo réel sur la clé TRIPLE
      // (attachmentId, participantId, emoji) : un second emoji du même
      // participant EMPILE une ligne de plus, il n'écrase jamais la première.
      // Ce mock modélisait encore la clé à deux champs, donc il REMPLAÇAIT —
      // il rendait vert un service à réaction unique qui n'existe plus.
      upsert: jest.fn(async ({ create, update }: any) => {
        const existing = rows.find(r => r.attachmentId === create.attachmentId
          && r.participantId === create.participantId
          && r.emoji === create.emoji);
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

  it('stacks several emojis for the same user on one attachment (no replacement)', async () => {
    // Multi-réactions « sur tout contenu à réaction » (2026-08-18) : le plafond
    // d'un emoji par personne est LEVÉ. Poser 👍 après ❤️ ajoute une ligne, il
    // n'en réécrit aucune — les deux comptent dans le résumé, et le retrait se
    // fait emoji par emoji (témoin suivant).
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '👍' });
    expect(await svc.getReactionSummary('att1')).toEqual({ '❤️': 1, '👍': 1 });
    expect(await svc.getCurrentUserReactions('att1', 'p1')).toEqual(['❤️', '👍']);
  });

  it('never ends up with two rows for the SAME emoji, even racing two concurrent adds of it', async () => {
    // Régression du doublon (héritée du modèle à réaction unique) : l'ancienne
    // séquence find/deleteMany/upsert laissait deux appels concurrents passer
    // tous deux le test « aucune réaction existante » avant que l'un commite,
    // et chacun insérait sa ligne.
    //
    // L'unicité n'a pas disparu avec les multi-réactions, elle a changé de
    // PORTÉE : l'upsert est atomique par TRIPLET, donc deux adds concurrents du
    // MÊME emoji convergent toujours sur un seul document. Ce qui n'est plus un
    // défaut, c'est le cas « deux emojis DIFFÉRENTS » — il produit deux lignes,
    // et c'est l'empilement voulu (témoin plus haut). Formuler la régression
    // sur le participant au lieu du triplet reviendrait à réclamer le plafond
    // que ce chantier vient de lever.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await Promise.all([
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '🔥' }),
    ]);
    expect(prisma.rows.filter((r: any) => r.attachmentId === 'att1'
      && r.participantId === 'p1' && r.emoji === '🔥')).toHaveLength(1);
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

  it('reports changed=true when ADDING a second, different emoji', async () => {
    // Le no-op se décide sur le TRIPLET : un emoji différent est une ligne
    // neuve, donc un vrai changement à diffuser. Avant, ce témoin parlait de
    // « swap » — le mot d'un modèle à réaction unique qui n'existe plus.
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

  // ── Validation d'emoji : parité EXACTE avec ReactionService (la jumelle) ──
  //
  // `sanitizeEmoji` rend `null` pour un non-emoji, et `isValidEmoji(emoji: string)`
  // fait `emoji.trim()` — donc `isValidEmoji(null)` LÈVE un `TypeError`. L'ancien
  // `if (!isValidEmoji(sanitizeEmoji(o.emoji)))` faisait donc remonter au client
  // un `TypeError` interne au lieu du refus propre « Invalid emoji format », et
  // la branche `throw` était du code MORT. Ces témoins exercent les VRAIES
  // fonctions partagées (ce fichier ne les mocke pas), seule façon de voir le
  // défaut : le témoin jumeau du fichier `__tests__/unit/…` mocke `isValidEmoji`
  // pour rendre `false` sur `null`, ce qui désarme exactement ce bug (cf.
  // CLAUDE.md § « mocker les schémas partagés DÉSARME »).
  it('rejects an add with a clean "Invalid emoji format", never a raw TypeError', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await expect(
      svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: 'hi' })
    ).rejects.toThrow('Invalid emoji format');
    // Rien n'a été écrit, et aucun upsert n'a été tenté.
    expect(await svc.getReactionSummary('att1')).toEqual({});
    expect(prisma.attachmentReaction.upsert).not.toHaveBeenCalled();
  });

  it('rejects a remove with an invalid emoji instead of silently "succeeding"', async () => {
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await expect(
      svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: 'hi' })
    ).rejects.toThrow('Invalid emoji format');
  });

  it('an invalid-emoji remove never wipes the participant\'s other reactions', async () => {
    // Garde le pire cas : `sanitizeEmoji('hi')` → null ; passé tel quel dans le
    // `where`, un `emoji: null` ne cible plus un emoji précis. La jumelle
    // `ReactionService.removeReaction` refuse AVANT le `deleteMany` — celle-ci
    // doit faire pareil, sinon un remove malformé peut emporter des lignes
    // voisines.
    const prisma = makePrismaMock();
    const svc = new AttachmentReactionService(prisma);
    await svc.addAttachmentReaction({ attachmentId: 'att1', messageId: 'm1', participantId: 'p1', emoji: '❤️' });
    await expect(
      svc.removeAttachmentReaction({ attachmentId: 'att1', participantId: 'p1', emoji: 'hi' })
    ).rejects.toThrow('Invalid emoji format');
    expect(await svc.getReactionSummary('att1')).toEqual({ '❤️': 1 });
  });
});
