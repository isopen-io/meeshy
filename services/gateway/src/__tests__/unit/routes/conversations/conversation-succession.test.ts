/**
 * Gardes — la loi de succession du créateur (#4058).
 *
 * Un site UNIQUE pour les deux portes (`leave.ts`, `delete-for-me.ts`), qui la
 * posaient chacune de son côté et dans l'ordre INVERSE des rangs : un
 * modérateur y passait devant un administrateur.
 *
 * L'ordre attendu : administrateurs par ancienneté DANS LE RANG (trace
 * `member_promoted`, repli `joinedAt`), puis membre le plus ancien, puis
 * clôture.
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  SUCCESSION_ADMIN_LIMIT,
  resolveConversationSuccession,
} from '../../../../routes/conversations/utils/conversation-succession';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const CREATOR_ID = '507f1f77bcf86cd799439000';

const at = (iso: string) => new Date(iso);

type Row = {
  id: string;
  userId: string | null;
  role: string | null;
  joinedAt: Date;
};

const member = (over: Partial<Row> & { id: string }): Row => ({
  userId: `user-${over.id}`,
  role: 'member',
  joinedAt: at('2026-01-01T00:00:00.000Z'),
  ...over,
});

const promotion = (userId: string, createdAt: string, newRole: unknown = 'ADMIN') => ({
  userId,
  createdAt: at(createdAt),
  metadata: { action: 'view_conversation', newRole, previousRole: 'MEMBER' },
});

/**
 * Deux lectures BORNÉES, pas une collection entière (#4165) : les
 * administrateurs (`where.role`, plafonnées) puis, à défaut, le membre le plus
 * ancien (`take: 1`). Le double les sert depuis UNE liste de participants, en
 * appliquant lui-même le filtre — sans quoi il mesurerait le double et non la
 * requête.
 */
const makePrisma = (opts: {
  participants?: Row[];
  promotions?: Array<ReturnType<typeof promotion>>;
  unusedDirect?: boolean;
}) => {
  const rows = (opts.participants ?? []).filter(p => p.userId !== null);
  const byJoinedAt = [...rows].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  return {
    conversation: { count: jest.fn<any>().mockResolvedValue(opts.unusedDirect ? 1 : 0) },
    participant: {
      findMany: jest.fn<any>((args: any) =>
        Promise.resolve(
          args?.where?.role
            ? byJoinedAt.filter(p => args.where.role.in.includes(p.role))
            : byJoinedAt.slice(0, args?.take ?? byJoinedAt.length)
        )
      ),
    },
    notification: { findMany: jest.fn<any>().mockResolvedValue(opts.promotions ?? []) },
  };
};

const resolve = (prisma: ReturnType<typeof makePrisma>) =>
  resolveConversationSuccession({
    prisma: prisma as any,
    conversationId: CONVERSATION_ID,
    departingUserId: CREATOR_ID,
  });

describe('resolveConversationSuccession — les administrateurs, par ancienneté de rang', () => {
  it('élit l’unique administrateur, même arrivé APRÈS les autres membres', async () => {
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-old', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-admin', role: 'admin', joinedAt: at('2026-06-01T00:00:00.000Z') }),
      ],
      promotions: [promotion('user-p-admin', '2026-06-02T00:00:00.000Z')],
    });

    await expect(resolve(prisma)).resolves.toEqual({
      kind: 'transfer',
      participantId: 'p-admin',
      userId: 'user-p-admin',
    });
  });

  it('classe deux administrateurs par instant de PROMOTION, pas par joinedAt', async () => {
    // Le plus ANCIEN dans la conversation a été promu en DERNIER : c'est le
    // témoin qui distingue la règle de rang du simple tri d'ancienneté.
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-joined-first', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-joined-later', role: 'admin', joinedAt: at('2026-05-01T00:00:00.000Z') }),
      ],
      promotions: [
        promotion('user-p-joined-later', '2026-05-02T00:00:00.000Z'),
        promotion('user-p-joined-first', '2026-07-01T00:00:00.000Z'),
      ],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-joined-later' });
  });

  it('retient la PREMIÈRE promotion d’un administrateur rétrogradé puis re-promu', async () => {
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-repromoted', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-steady', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
      ],
      promotions: [
        promotion('user-p-repromoted', '2026-02-01T00:00:00.000Z'),
        promotion('user-p-steady', '2026-03-01T00:00:00.000Z'),
        promotion('user-p-repromoted', '2026-09-01T00:00:00.000Z'),
      ],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-repromoted' });
  });

  it('replie sur joinedAt l’administrateur SANS trace de promotion — et il l’emporte s’il est plus ancien', async () => {
    // Une participation créée DÉJÀ administrateur (seed, ajout direct) n'écrit
    // aucune notification : elle l'EST depuis son arrivée.
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-seeded', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-promoted', role: 'admin', joinedAt: at('2026-02-01T00:00:00.000Z') }),
      ],
      promotions: [promotion('user-p-promoted', '2026-03-01T00:00:00.000Z')],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-seeded' });
  });

  it('ne fait pas gagner un admin sans trace quand un autre était admin AVANT lui', async () => {
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-seeded-late', role: 'admin', joinedAt: at('2026-08-01T00:00:00.000Z') }),
        member({ id: 'p-promoted-early', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
      ],
      promotions: [promotion('user-p-promoted-early', '2026-02-01T00:00:00.000Z')],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-promoted-early' });
  });

  it('reconnaît un rang écrit en MAJUSCULES, des deux côtés de la trace (#4008)', async () => {
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-plain', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-upper', role: 'ADMIN', joinedAt: at('2026-06-01T00:00:00.000Z') }),
      ],
      promotions: [promotion('user-p-upper', '2026-06-02T00:00:00.000Z', 'admin')],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-upper' });
  });

  it('ignore une promotion vers un AUTRE rang que administrateur', async () => {
    // `member_promoted` couvre aussi MEMBER → MODERATOR : elle ne fait de
    // personne un administrateur, et ne doit donc pas dater son ancienneté.
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-a', role: 'admin', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-b', role: 'admin', joinedAt: at('2026-02-01T00:00:00.000Z') }),
      ],
      promotions: [promotion('user-p-b', '2020-01-01T00:00:00.000Z', 'MODERATOR')],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-a' });
  });
});

describe('resolveConversationSuccession — sans administrateur', () => {
  it('élit le membre actif le plus ancien, un modérateur ne passant plus devant', async () => {
    const prisma = makePrisma({
      participants: [
        member({ id: 'p-oldest', joinedAt: at('2026-01-01T00:00:00.000Z') }),
        member({ id: 'p-moderator', role: 'moderator', joinedAt: at('2026-04-01T00:00:00.000Z') }),
      ],
    });

    await expect(resolve(prisma)).resolves.toMatchObject({ participantId: 'p-oldest' });
    // Aucun administrateur ⇒ aucune trace de promotion à lire.
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});

describe('resolveConversationSuccession — la clôture', () => {
  it('ferme quand aucun membre actif ne reste', async () => {
    await expect(resolve(makePrisma({ participants: [] }))).resolves.toEqual({ kind: 'close' });
  });

  it('ferme quand il ne reste que des invités sans compte', async () => {
    const prisma = makePrisma({
      participants: [member({ id: 'p-guest', userId: null })],
    });

    await expect(resolve(prisma)).resolves.toEqual({ kind: 'close' });
  });

  it('ferme un DM jamais utilisé plutôt que de le transmettre', async () => {
    const prisma = makePrisma({
      unusedDirect: true,
      participants: [member({ id: 'p-other', role: 'admin' })],
    });

    await expect(resolve(prisma)).resolves.toEqual({ kind: 'close' });
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});

describe('resolveConversationSuccession — la requête', () => {
  it('n’interroge que les administrateurs actifs de CETTE conversation', async () => {
    const prisma = makePrisma({
      participants: [member({ id: 'p-admin', role: 'admin' })],
      promotions: [promotion('user-p-admin', '2026-02-01T00:00:00.000Z')],
    });

    await resolve(prisma);

    // Le partant ET l'invité sans compte s'excluent par la MÊME colonne : deux
    // contraintes `not` sur `userId` ne tiennent pas dans un seul filtre.
    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: CONVERSATION_ID,
          isActive: true,
          AND: [{ userId: { not: CREATOR_ID } }, { userId: { not: null } }],
        }),
        take: SUCCESSION_ADMIN_LIMIT,
      })
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'member_promoted',
          userId: { in: ['user-p-admin'] },
          context: { path: ['conversationId'], equals: CONVERSATION_ID },
        }),
      })
    );
  });
});
