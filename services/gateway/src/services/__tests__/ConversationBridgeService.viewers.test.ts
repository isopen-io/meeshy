/**
 * `ConversationBridgeService.buildBridgeDataForViewers` — 1 conversation × N
 * lecteurs (REV-5/B2), l'image miroir de la passe `buildBridgeData`.
 *
 * Les trois contraintes dures du service valent ici mot pour mot, et ce sont
 * les trois axes de cette suite :
 *
 *  1. JAMAIS N+1 — le nombre d'appels Prisma est CONSTANT quand le nombre de
 *     LECTEURS passe de 1 à 10. C'est la raison d'être de cette passe : son
 *     appelant (`emitUnreadCountsToRecipients`) payait 5 requêtes par
 *     destinataire en appelant la passe sœur une fois par lecteur.
 *  2. Droits de lecture PAR LECTEUR — c'est ce qui rend le batch non trivial.
 *     La requête est COMMUNE, mais le plancher de curseur, la coupure
 *     d'historique, les messages effacés pour soi seul et l'exclusion de ses
 *     PROPRES messages appartiennent chacun à UN lecteur. Une fenêtre
 *     partagée qui ne se resserrerait pas ferait fuiter, chez le lecteur A,
 *     ce que seul B a le droit de voir. Le double Prisma évalue réellement
 *     les bornes, donc une clause oubliée se voit.
 *  3. Absence — un lecteur sans rien à annoncer est ABSENT de la map, jamais
 *     présent avec un pont vide.
 *
 * @jest-environment node
 */

import { ConversationBridgeService } from '../ConversationBridgeService';

const CONV_ID = 'c-1';

const at = (iso: string) => new Date(iso);

type ParticipantRow = {
  id: string;
  userId: string | null;
  joinedAt: Date | null;
  isActive: boolean;
};
type CursorRow = { participantId: string; lastReadAt: Date | null; lastReadMessageCreatedAt: Date | null };
type MessageRow = {
  id: string;
  senderId: string;
  createdAt: Date;
  deletedAt: Date | null;
  messageType?: string;
  sender: { displayName?: string | null; nickname?: string | null; user?: { displayName?: string | null } | null };
  attachments?: { mimeType: string }[];
};
type PrefsRow = { userId: string; clearHistoryBefore: Date | null };
type DeletionRow = { userId: string; messageId: string };

type Fixture = {
  participants: ParticipantRow[];
  cursors?: CursorRow[];
  messages: MessageRow[];
  prefs?: PrefsRow[];
  deletions?: DeletionRow[];
};

const matchesDateBound = (value: Date, bound: any): boolean => {
  if (!bound) return true;
  if (bound.gt instanceof Date && !(value.getTime() > bound.gt.getTime())) return false;
  if (bound.gte instanceof Date && !(value.getTime() >= bound.gte.getTime())) return false;
  return true;
};

/** Double Prisma COMPTEUR — il évalue ce qu'on lui demande, il ne l'ignore pas. */
const makePrismaMock = (fixture: Fixture) => {
  const counters: Record<string, number> = {};
  const count = (key: string) => {
    counters[key] = (counters[key] ?? 0) + 1;
  };

  return {
    __counters: counters,
    get __total() {
      return Object.values(counters).reduce((a, b) => a + b, 0);
    },

    participant: {
      findMany: jest.fn(async ({ where }: any) => {
        count('participant.findMany');
        const wanted: string[] = (where.OR ?? []).flatMap((clause: any) => [
          ...(clause.id?.in ?? []),
          ...(clause.userId?.in ?? []),
        ]);
        return fixture.participants
          .filter(() => where.conversationId === CONV_ID)
          .filter((p) => (where.isActive === true ? p.isActive : true))
          .filter((p) => wanted.includes(p.id) || (p.userId !== null && wanted.includes(p.userId)))
          .map((p) => ({ ...p, conversationId: CONV_ID }));
      }),
    },

    conversationReadCursor: {
      findMany: jest.fn(async ({ where }: any) => {
        count('conversationReadCursor.findMany');
        const ids: string[] = where.participantId?.in ?? [];
        return (fixture.cursors ?? []).filter((c) => ids.includes(c.participantId)).map((c) => ({ ...c }));
      }),
    },

    userConversationPreferences: {
      findMany: jest.fn(async ({ where }: any) => {
        count('userConversationPreferences.findMany');
        const ids: string[] = where.userId?.in ?? [];
        return (fixture.prefs ?? [])
          .filter((p) => ids.includes(p.userId) && p.clearHistoryBefore !== null)
          .map((p) => ({ userId: p.userId, clearHistoryBefore: p.clearHistoryBefore }));
      }),
    },

    userMessageDeletion: {
      findMany: jest.fn(async ({ where }: any) => {
        count('userMessageDeletion.findMany');
        const ids: string[] = where.userId?.in ?? [];
        return (fixture.deletions ?? [])
          .filter((d) => ids.includes(d.userId))
          .map((d) => ({ userId: d.userId, messageId: d.messageId }));
      }),
    },

    message: {
      findMany: jest.fn(async ({ where, take }: any) => {
        count('message.findMany');
        const matched = fixture.messages
          .filter(() => where.conversationId === CONV_ID)
          .filter((m) => (where.deletedAt === null ? m.deletedAt === null : true))
          .filter((m) => matchesDateBound(m.createdAt, where.createdAt))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const limited = typeof take === 'number' ? matched.slice(0, take) : matched;
        return limited.map((m) => ({
          id: m.id,
          conversationId: CONV_ID,
          senderId: m.senderId,
          createdAt: m.createdAt,
          messageType: m.messageType ?? 'text',
          sender: { ...m.sender },
          attachments: (m.attachments ?? []).map((a) => ({ ...a })),
        }));
      }),
    },
  } as any;
};

const participant = (id: string, userId: string | null = null): ParticipantRow => ({
  id,
  userId,
  joinedAt: at('2026-01-01T00:00:00.000Z'),
  isActive: true,
});

const message = (
  overrides: Partial<MessageRow> & Pick<MessageRow, 'id' | 'senderId' | 'createdAt'>
): MessageRow => ({
  deletedAt: null,
  sender: { displayName: 'Alice' },
  ...overrides,
});

// =============================================================================
// 1. JAMAIS N+1 — le compte d'appels Prisma ne croît pas avec le nombre de LECTEURS
// =============================================================================

describe('buildBridgeDataForViewers — non-N+1 sur l\'axe des lecteurs', () => {
  const buildFixture = (viewerCount: number): Fixture => {
    const participants: ParticipantRow[] = [participant('p-author', 'u-author')];
    const cursors: CursorRow[] = [];
    for (let i = 0; i < viewerCount; i++) {
      participants.push(participant(`p-${i}`, `u-${i}`));
      cursors.push({
        participantId: `p-${i}`,
        lastReadAt: at('2026-02-01T00:00:00.000Z'),
        lastReadMessageCreatedAt: at('2026-02-01T00:00:00.000Z'),
      });
    }
    return {
      participants,
      cursors,
      messages: [
        message({ id: 'm1', senderId: 'p-author', createdAt: at('2026-03-01T10:00:00.000Z') }),
        message({ id: 'm2', senderId: 'p-author', createdAt: at('2026-03-01T11:00:00.000Z') }),
      ],
    };
  };

  const viewersFor = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ viewerId: `u-${i}`, unreadCount: 2 }));

  it('le nombre d\'appels Prisma est IDENTIQUE pour 1 et pour 10 lecteurs', async () => {
    const prismaOne = makePrismaMock(buildFixture(1));
    const prismaTen = makePrismaMock(buildFixture(10));

    const one = await new ConversationBridgeService(prismaOne).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: viewersFor(1),
    });
    const ten = await new ConversationBridgeService(prismaTen).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: viewersFor(10),
    });

    // Les deux passes ont bien produit un pont par lecteur…
    expect(one.size).toBe(1);
    expect(ten.size).toBe(10);
    expect(ten.get('u-7')?.bridge).toMatchObject({
      kind: 'fallback',
      unreadCount: 2,
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 2 },
    });

    // …pour EXACTEMENT le même nombre de requêtes.
    expect(prismaTen.__total).toBe(prismaOne.__total);
    expect(prismaTen.__counters).toEqual(prismaOne.__counters);

    // Et la fenêtre tient en UNE requête, pas une par lecteur.
    expect(prismaTen.message.findMany).toHaveBeenCalledTimes(1);
    expect(prismaTen.__total).toBeLessThanOrEqual(5);
  });

  it('aucune requête du tout quand aucun lecteur n\'a de non-lu', async () => {
    const prisma = makePrismaMock(buildFixture(3));
    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-0', unreadCount: 0 },
        { viewerId: 'u-1', unreadCount: 0 },
      ],
    });
    expect(result.size).toBe(0);
    expect(prisma.__total).toBe(0);
  });

  // Derrière un lien de partage, personne n'a de compte — et ni les
  // préférences ni les suppressions personnelles n'existent pour eux.
  it('ne paie aucune requête de masquage quand tous les lecteurs sont anonymes', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-author'), participant('p-anon')],
      messages: [message({ id: 'm1', senderId: 'p-author', createdAt: at('2026-03-01T10:00:00.000Z') })],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [{ viewerId: 'p-anon', unreadCount: 1 }],
    });

    // Un anonyme est adressé — et indexé — par son `Participant.id`.
    expect(result.has('p-anon')).toBe(true);
    expect(prisma.__counters['userConversationPreferences.findMany']).toBeUndefined();
    expect(prisma.__counters['userMessageDeletion.findMany']).toBeUndefined();
  });
});

// =============================================================================
// 2. Droits de lecture PAR LECTEUR — la pièce non triviale du batch
// =============================================================================

describe('buildBridgeDataForViewers — les droits de lecture restent PAR lecteur', () => {
  // Deux lecteurs, deux curseurs. Le plus en retard voit les deux auteurs, le
  // plus à jour ne voit que le dernier : la fenêtre est COMMUNE en base, elle
  // ne l'est jamais dans le pont.
  it('resserre la fenêtre commune sur le curseur de CHAQUE lecteur', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), participant('p-b', 'u-b'), participant('p-x', 'u-x')],
      cursors: [
        {
          participantId: 'p-a',
          lastReadAt: at('2026-02-01T00:00:00.000Z'),
          lastReadMessageCreatedAt: at('2026-02-01T00:00:00.000Z'),
        },
        {
          participantId: 'p-b',
          lastReadAt: at('2026-03-01T10:30:00.000Z'),
          lastReadMessageCreatedAt: at('2026-03-01T10:30:00.000Z'),
        },
      ],
      // Deux AUTEURS distincts : sans cela, retenir le mauvais message
      // rendrait le même compte et la même liste d'auteurs — le témoin ne
      // discriminerait rien.
      messages: [
        message({
          id: 'm1',
          senderId: 'p-x',
          createdAt: at('2026-03-01T10:00:00.000Z'),
          sender: { displayName: 'Ancien' },
        }),
        message({
          id: 'm2',
          senderId: 'p-y',
          createdAt: at('2026-03-01T11:00:00.000Z'),
          sender: { displayName: 'Récent' },
        }),
      ],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-a', unreadCount: 2 },
        { viewerId: 'u-b', unreadCount: 1 },
      ],
    });

    expect(result.get('u-a')?.bridge.data?.authors).toEqual(['Ancien', 'Récent']);
    // B a déjà lu le premier : son pont ne nomme QUE le second.
    expect(result.get('u-b')?.bridge.data?.messageCount).toBe(1);
    expect(result.get('u-b')?.bridge.data?.authors).toEqual(['Récent']);
    // La borne basse de la requête commune est le PLUS BAS des planchers —
    // sans quoi le retardataire perdrait ses messages les plus anciens.
    const where = (prisma.message.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt.gt).toEqual(at('2026-02-01T00:00:00.000Z'));
  });

  // La coupure d'historique de A ne doit rien retirer à B, et surtout pas
  // l'inverse : ce que A a effacé de sa vue ne doit pas lui revenir par la
  // fenêtre de B.
  it('n\'annonce pas à un lecteur ce que SA coupure d\'historique masque', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), participant('p-b', 'u-b'), participant('p-x', 'u-x')],
      cursors: [
        { participantId: 'p-a', lastReadAt: null, lastReadMessageCreatedAt: null },
        { participantId: 'p-b', lastReadAt: null, lastReadMessageCreatedAt: null },
      ],
      prefs: [{ userId: 'u-a', clearHistoryBefore: at('2026-03-01T10:30:00.000Z') }],
      messages: [
        message({
          id: 'm1',
          senderId: 'p-x',
          createdAt: at('2026-03-01T10:00:00.000Z'),
          sender: { displayName: 'Masqué' },
        }),
        message({
          id: 'm2',
          senderId: 'p-y',
          createdAt: at('2026-03-01T11:00:00.000Z'),
          sender: { displayName: 'Visible' },
        }),
      ],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-a', unreadCount: 1 },
        { viewerId: 'u-b', unreadCount: 2 },
      ],
    });

    // A ne doit PAS voir l'auteur d'avant sa coupure — c'est la fuite que ce
    // témoin cherche, pas seulement un compte qui tombe juste.
    expect(result.get('u-a')?.bridge.data?.authors).toEqual(['Visible']);
    expect(result.get('u-b')?.bridge.data?.authors).toEqual(['Masqué', 'Visible']);
    // Le message d'avant la coupure ne remonte QUE chez B — et la fenêtre
    // reste UNE requête pour les deux.
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
  });

  it('n\'annonce pas à un lecteur un message qu\'il a effacé pour lui seul', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), participant('p-b', 'u-b'), participant('p-x', 'u-x')],
      cursors: [
        { participantId: 'p-a', lastReadAt: null, lastReadMessageCreatedAt: null },
        { participantId: 'p-b', lastReadAt: null, lastReadMessageCreatedAt: null },
      ],
      deletions: [{ userId: 'u-a', messageId: 'm1' }],
      messages: [
        message({
          id: 'm1',
          senderId: 'p-x',
          createdAt: at('2026-03-01T10:00:00.000Z'),
          sender: { displayName: 'Effacé-pour-A' },
        }),
        message({
          id: 'm2',
          senderId: 'p-y',
          createdAt: at('2026-03-01T11:00:00.000Z'),
          sender: { displayName: 'Gardé' },
        }),
      ],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-a', unreadCount: 1 },
        { viewerId: 'u-b', unreadCount: 2 },
      ],
    });

    expect(result.get('u-a')?.bridge.data?.authors).toEqual(['Gardé']);
    expect(result.get('u-b')?.bridge.data?.authors).toEqual(['Effacé-pour-A', 'Gardé']);
  });

  // Un pont annonce ce qu'on a MANQUÉ, jamais ses propres messages — et
  // « propres » se dit d'un lecteur, pas de la fenêtre.
  it('exclut, pour chaque lecteur, ses PROPRES messages', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), participant('p-b', 'u-b')],
      cursors: [
        { participantId: 'p-a', lastReadAt: null, lastReadMessageCreatedAt: null },
        { participantId: 'p-b', lastReadAt: null, lastReadMessageCreatedAt: null },
      ],
      messages: [
        message({
          id: 'm1',
          senderId: 'p-a',
          createdAt: at('2026-03-01T10:00:00.000Z'),
          sender: { displayName: 'Moi-A' },
        }),
        message({
          id: 'm2',
          senderId: 'p-b',
          createdAt: at('2026-03-01T11:00:00.000Z'),
          sender: { displayName: 'Moi-B' },
        }),
      ],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-a', unreadCount: 1 },
        { viewerId: 'u-b', unreadCount: 1 },
      ],
    });

    expect(result.get('u-a')?.bridge.data?.authors).toEqual(['Moi-B']);
    expect(result.get('u-b')?.bridge.data?.authors).toEqual(['Moi-A']);
  });

  it('ignore un lecteur qui n\'est pas participant actif de la conversation', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), { ...participant('p-out', 'u-out'), isActive: false }],
      messages: [message({ id: 'm1', senderId: 'p-a', createdAt: at('2026-03-01T10:00:00.000Z') })],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [{ viewerId: 'u-out', unreadCount: 3 }],
    });

    expect(result.size).toBe(0);
  });
});

// =============================================================================
// 3. Absence, partialité, posture d'échec
// =============================================================================

describe('buildBridgeDataForViewers — absence et partialité', () => {
  const twoMessages: Fixture = {
    participants: [participant('p-a', 'u-a'), participant('p-x', 'u-x')],
    cursors: [{ participantId: 'p-a', lastReadAt: at('2026-02-02T00:00:00.000Z'), lastReadMessageCreatedAt: null }],
    messages: [
      message({ id: 'm1', senderId: 'p-x', createdAt: at('2026-03-01T10:00:00.000Z') }),
      message({ id: 'm2', senderId: 'p-x', createdAt: at('2026-03-01T11:00:00.000Z') }),
    ],
  };

  it('déclare la fenêtre partielle quand le plafond la tronque', async () => {
    const prisma = makePrismaMock(twoMessages);

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [{ viewerId: 'u-a', unreadCount: 2 }],
      windowLimit: 1,
    });

    expect(result.get('u-a')?.bridge.isComplete).toBe(false);
    expect(result.get('u-a')?.bridge.unreadCount).toBe(2);
  });

  it('ABSENT — pas un pont vide — quand la fenêtre du lecteur ne retient rien', async () => {
    const prisma = makePrismaMock({
      ...twoMessages,
      // Les deux messages sont du lecteur lui-même : rien à annoncer.
      messages: twoMessages.messages.map((m) => ({ ...m, senderId: 'p-a' })),
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [{ viewerId: 'u-a', unreadCount: 2 }],
    });

    expect(result.has('u-a')).toBe(false);
  });

  // `lastReadAt` voyage À CÔTÉ du pont (le contrat gelé §3.2 ne le porte pas)
  // et reste ABSENT quand aucun curseur n'existe — jamais fabriqué.
  it('porte le lastReadAt du lecteur, et rien quand il n\'a pas de curseur', async () => {
    const prisma = makePrismaMock({
      participants: [participant('p-a', 'u-a'), participant('p-b', 'u-b'), participant('p-x', 'u-x')],
      cursors: [
        { participantId: 'p-a', lastReadAt: at('2026-02-02T00:00:00.000Z'), lastReadMessageCreatedAt: null },
      ],
      messages: [message({ id: 'm1', senderId: 'p-x', createdAt: at('2026-03-01T10:00:00.000Z') })],
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: 'u-a', unreadCount: 1 },
        { viewerId: 'u-b', unreadCount: 1 },
      ],
    });

    expect(result.get('u-a')?.lastReadAt).toEqual(at('2026-02-02T00:00:00.000Z'));
    expect(result.get('u-b')).toBeDefined();
    expect(result.get('u-b')?.lastReadAt).toBeUndefined();
  });

  // Le pont est un confort, la pastille est le produit : une passe qui échoue
  // rend une map VIDE, elle ne lève pas et n'invente rien.
  it('rend une map vide — sans lever — quand la lecture échoue', async () => {
    const prisma = makePrismaMock(twoMessages);
    prisma.message.findMany = jest.fn(async () => {
      throw new Error('db down');
    });

    const result = await new ConversationBridgeService(prisma).buildBridgeDataForViewers({
      conversationId: CONV_ID,
      viewers: [{ viewerId: 'u-a', unreadCount: 2 }],
    });

    expect(result.size).toBe(0);
  });
});
