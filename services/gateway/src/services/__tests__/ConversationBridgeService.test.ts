/**
 * G-122 — `ConversationBridgeService.buildBridgeData`.
 *
 * Trois contraintes dures, trois tests discriminants (le reste sont des
 * gardes de forme) :
 *
 *  1. JAMAIS N+1 — le nombre d'appels Prisma est CONSTANT quand le nombre de
 *     conversations passe de 1 à 10. Le test COMPTE les appels ; une
 *     implémentation qui interroge par conversation le fait échouer par
 *     croissance linéaire (et pas seulement par une inégalité vague).
 *  2. Droits de lecture — un premier non-lu antérieur à `clearHistoryBefore`
 *     NE FUIT PAS. Le mock Prisma évalue réellement la clause `where`
 *     (bornes `createdAt`, `id.notIn`, `senderId.not`, `deletedAt`), donc un
 *     service qui oublierait le masquage verrait l'auteur masqué remonter
 *     dans `authors`.
 *  3. `unreadCount === 0` ⇒ le pont est ABSENT de la map — pas `null`, pas
 *     un pont à `0`. Une absence ne se convertit jamais en affirmation.
 */

import {
  ConversationBridgeService,
  DEFAULT_BRIDGE_WINDOW_LIMIT,
} from '../ConversationBridgeService';

// =============================================================================
// Mock Prisma — évaluateur de clause, pas un stub complaisant.
// =============================================================================

type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt: Date;
  deletedAt: Date | null;
  messageType?: string;
  sender: {
    displayName?: string | null;
    nickname?: string | null;
    user?: { displayName?: string | null } | null;
  };
  attachments?: { mimeType: string }[];
};

type ParticipantRow = {
  id: string;
  userId: string | null;
  conversationId: string;
  joinedAt: Date | null;
  isActive: boolean;
};

type CursorRow = {
  participantId: string;
  lastReadAt: Date | null;
  lastReadMessageCreatedAt: Date | null;
};

type PrefsRow = { userId: string; conversationId: string; clearHistoryBefore: Date | null };
type DeletionRow = { userId: string; messageId: string; conversationId: string };

type Fixture = {
  participants: ParticipantRow[];
  cursors: CursorRow[];
  messages: MessageRow[];
  prefs?: PrefsRow[];
  deletions?: DeletionRow[];
};

const matchesDateBound = (value: Date, bound: any): boolean => {
  if (!bound) return true;
  if (bound.gt instanceof Date && !(value.getTime() > bound.gt.getTime())) return false;
  if (bound.gte instanceof Date && !(value.getTime() >= bound.gte.getTime())) return false;
  if (bound.lt instanceof Date && !(value.getTime() < bound.lt.getTime())) return false;
  if (bound.lte instanceof Date && !(value.getTime() <= bound.lte.getTime())) return false;
  return true;
};

/** Évalue UNE branche du `OR` agrégé contre une ligne message. */
const matchesMessageClause = (row: MessageRow, clause: any): boolean => {
  if (clause.conversationId !== undefined && row.conversationId !== clause.conversationId) return false;
  if (clause.deletedAt === null && row.deletedAt !== null) return false;
  if (clause.senderId?.not !== undefined && row.senderId === clause.senderId.not) return false;
  if (clause.createdAt !== undefined && !matchesDateBound(row.createdAt, clause.createdAt)) return false;
  if (clause.id?.notIn !== undefined && clause.id.notIn.includes(row.id)) return false;
  if (clause.id?.in !== undefined && !clause.id.in.includes(row.id)) return false;
  return true;
};

const makePrismaMock = (fixture: Fixture) => {
  const counters: Record<string, number> = {};
  const count = (key: string) => {
    counters[key] = (counters[key] ?? 0) + 1;
  };

  const prisma = {
    __counters: counters,
    get __total() {
      return Object.values(counters).reduce((a, b) => a + b, 0);
    },

    participant: {
      findMany: jest.fn(async ({ where }: any) => {
        count('participant.findMany');
        const ids: string[] = where.conversationId?.in ?? [];
        const orIds = (where.OR ?? []).map((o: any) => o.id ?? o.userId);
        return fixture.participants
          .filter((p) => ids.includes(p.conversationId))
          .filter((p) => (where.isActive === true ? p.isActive : true))
          .filter((p) => orIds.includes(p.id) || orIds.includes(p.userId))
          .map((p) => ({ ...p }));
      }),
    },

    conversationReadCursor: {
      findMany: jest.fn(async ({ where }: any) => {
        count('conversationReadCursor.findMany');
        const ids: string[] = where.participantId?.in ?? [];
        return fixture.cursors.filter((c) => ids.includes(c.participantId)).map((c) => ({ ...c }));
      }),
    },

    userConversationPreferences: {
      findMany: jest.fn(async ({ where }: any) => {
        count('userConversationPreferences.findMany');
        const ids: string[] = where.conversationId?.in ?? [];
        return (fixture.prefs ?? [])
          .filter((p) => p.userId === where.userId && ids.includes(p.conversationId))
          .filter((p) => p.clearHistoryBefore !== null)
          .map((p) => ({ conversationId: p.conversationId, clearHistoryBefore: p.clearHistoryBefore }));
      }),
    },

    userMessageDeletion: {
      findMany: jest.fn(async ({ where }: any) => {
        count('userMessageDeletion.findMany');
        const ids: string[] = where.message?.conversationId?.in ?? [];
        return (fixture.deletions ?? [])
          .filter((d) => d.userId === where.userId && ids.includes(d.conversationId))
          .map((d) => ({ messageId: d.messageId, message: { conversationId: d.conversationId } }));
      }),
    },

    message: {
      findMany: jest.fn(async ({ where, orderBy, take }: any) => {
        count('message.findMany');
        const clauses: any[] = where.OR ?? [where];
        const matched = fixture.messages
          .filter((row) => clauses.some((clause) => matchesMessageClause(row, clause)))
          .sort((a, b) =>
            orderBy?.createdAt === 'desc'
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : a.createdAt.getTime() - b.createdAt.getTime()
          );
        const limited = typeof take === 'number' ? matched.slice(0, take) : matched;
        return limited.map((row) => ({
          id: row.id,
          conversationId: row.conversationId,
          senderId: row.senderId,
          createdAt: row.createdAt,
          messageType: row.messageType ?? 'text',
          sender: { ...row.sender },
          attachments: (row.attachments ?? []).map((a) => ({ ...a })),
        }));
      }),
      count: jest.fn(async () => {
        count('message.count');
        return 0;
      }),
    },
  } as any;

  return prisma;
};

const at = (iso: string) => new Date(iso);

const participant = (
  conversationId: string,
  id: string,
  userId: string | null = 'u-viewer'
): ParticipantRow => ({
  id,
  userId,
  conversationId,
  joinedAt: at('2026-01-01T00:00:00.000Z'),
  isActive: true,
});

const message = (
  overrides: Partial<MessageRow> & Pick<MessageRow, 'id' | 'conversationId' | 'senderId' | 'createdAt'>
): MessageRow => ({
  deletedAt: null,
  sender: { displayName: 'Alice' },
  ...overrides,
});

// =============================================================================
// 1. JAMAIS N+1 — le compte d'appels Prisma ne croît pas avec N
// =============================================================================

describe('ConversationBridgeService — non-N+1 (contrainte dure 1)', () => {
  const buildFixture = (n: number): Fixture => {
    const participants: ParticipantRow[] = [];
    const cursors: CursorRow[] = [];
    const messages: MessageRow[] = [];
    for (let i = 0; i < n; i++) {
      const conversationId = `c${i}`;
      const participantId = `p${i}`;
      participants.push(participant(conversationId, participantId));
      cursors.push({
        participantId,
        lastReadAt: at('2026-02-01T00:00:00.000Z'),
        lastReadMessageCreatedAt: at('2026-02-01T00:00:00.000Z'),
      });
      messages.push(
        message({
          id: `m${i}-1`,
          conversationId,
          senderId: `other-${i}`,
          createdAt: at('2026-03-01T10:00:00.000Z'),
          sender: { displayName: `Auteur ${i}` },
        }),
        message({
          id: `m${i}-2`,
          conversationId,
          senderId: `other-${i}`,
          createdAt: at('2026-03-01T11:00:00.000Z'),
          sender: { displayName: `Auteur ${i}` },
        })
      );
    }
    return { participants, cursors, messages };
  };

  const candidatesFor = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ conversationId: `c${i}`, unreadCount: 2 }));

  it('le nombre d\'appels Prisma est IDENTIQUE pour 1 et pour 10 conversations', async () => {
    const prismaOne = makePrismaMock(buildFixture(1));
    const prismaTen = makePrismaMock(buildFixture(10));

    const one = await new ConversationBridgeService(prismaOne).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(1),
    });
    const ten = await new ConversationBridgeService(prismaTen).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(10),
    });

    // Les deux passes ont bien produit un pont par conversation…
    expect(one.size).toBe(1);
    expect(ten.size).toBe(10);

    // …pour EXACTEMENT le même nombre de requêtes.
    expect(prismaTen.__total).toBe(prismaOne.__total);
    expect(prismaTen.__counters).toEqual(prismaOne.__counters);

    // Et la fenêtre de messages tient en UNE requête agrégée sur les ids.
    expect(prismaTen.message.findMany).toHaveBeenCalledTimes(1);
    const where = (prismaTen.message.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toHaveLength(10);

    // Borne absolue : la passe entière tient sous une poignée de requêtes,
    // très loin d'un 1-par-conversation (qui vaudrait ≥ 10 ici).
    expect(prismaTen.__total).toBeLessThanOrEqual(5);
  });

  it('aucune requête du tout quand la passe n\'a aucun candidat non lu', async () => {
    const prisma = makePrismaMock(buildFixture(3));
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [
        { conversationId: 'c0', unreadCount: 0 },
        { conversationId: 'c1', unreadCount: 0 },
      ],
    });
    expect(result.size).toBe(0);
    expect(prisma.__total).toBe(0);
  });

  it('le masquage personnel déjà chargé par la passe économise ses deux requêtes', async () => {
    const fixture = buildFixture(4);
    const withLookup = makePrismaMock(fixture);
    const withInjection = makePrismaMock(fixture);

    await new ConversationBridgeService(withLookup).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(4),
    });
    await new ConversationBridgeService(withInjection).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(4),
      hidingByConversation: new Map(),
    });

    expect(withLookup.__counters['userConversationPreferences.findMany']).toBe(1);
    expect(withLookup.__counters['userMessageDeletion.findMany']).toBe(1);
    expect(withInjection.__counters['userConversationPreferences.findMany']).toBeUndefined();
    expect(withInjection.__counters['userMessageDeletion.findMany']).toBeUndefined();
    expect(withInjection.__total).toBe(withLookup.__total - 2);
  });

  // R6-6 (REV-5) — AVANT ce correctif, `routes/conversations/core.ts` lisait
  // `conversationReadCursor` pour `orchestratorInputs.lastOpenedAt`, PUIS
  // cette passe la relisait, sur les MÊMES participants : deux requêtes
  // identiques par passage de liste. `cursorsByParticipant`, jumeau exact de
  // `hidingByConversation` ci-dessus, laisse l'appelant fournir ce qu'il a
  // déjà — la même discipline de mutualisation, appliquée au même défaut.
  it("les curseurs déjà chargés par la passe (`cursorsByParticipant`) économisent leur requête (R6-6)", async () => {
    const fixture = buildFixture(4);
    const withLookup = makePrismaMock(fixture);
    const withInjection = makePrismaMock(fixture);
    const cursorsByParticipant = new Map(
      fixture.cursors.map((c) => [
        c.participantId,
        { lastReadAt: c.lastReadAt, lastReadMessageCreatedAt: c.lastReadMessageCreatedAt },
      ])
    );

    const before = await new ConversationBridgeService(withLookup).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(4),
    });
    const after = await new ConversationBridgeService(withInjection).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: candidatesFor(4),
      cursorsByParticipant,
    });

    // AVANT : une requête `conversationReadCursor.findMany` par passe.
    expect(withLookup.__counters['conversationReadCursor.findMany']).toBe(1);
    // APRÈS : aucune — les curseurs fournis suffisent, sans recharger.
    expect(withInjection.__counters['conversationReadCursor.findMany']).toBeUndefined();
    expect(withInjection.__total).toBe(withLookup.__total - 1);

    // Et le résultat produit n'a PAS changé de forme : mêmes ponts, mêmes
    // `lastReadAt` — la mutualisation ne doit rien coûter en exactitude.
    expect(after.size).toBe(before.size);
    for (const [conversationId, entry] of before) {
      expect(after.get(conversationId)).toEqual(entry);
    }
  });
});

// =============================================================================
// 2. Droits de lecture — les masques personnels ne fuient pas
// =============================================================================

describe('ConversationBridgeService — droits de lecture (contrainte dure 2)', () => {
  const fixtureWithCutoff = (): Fixture => ({
    participants: [participant('c1', 'p1')],
    cursors: [
      {
        participantId: 'p1',
        lastReadAt: at('2026-02-01T00:00:00.000Z'),
        lastReadMessageCreatedAt: at('2026-02-01T00:00:00.000Z'),
      },
    ],
    prefs: [
      {
        userId: 'u-viewer',
        conversationId: 'c1',
        clearHistoryBefore: at('2026-03-10T00:00:00.000Z'),
      },
    ],
    messages: [
      // Premier non-lu chronologique, mais ANTÉRIEUR à clearHistoryBefore.
      message({
        id: 'm-efface',
        conversationId: 'c1',
        senderId: 'other-1',
        createdAt: at('2026-03-05T09:00:00.000Z'),
        sender: { displayName: 'Fantôme' },
      }),
      message({
        id: 'm-visible',
        conversationId: 'c1',
        senderId: 'other-2',
        createdAt: at('2026-03-11T09:00:00.000Z'),
        sender: { displayName: 'Bruno' },
      }),
    ],
  });

  it('un premier non-lu antérieur à clearHistoryBefore ne fuite pas dans le pont', async () => {
    const prisma = makePrismaMock(fixtureWithCutoff());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 1 }],
    });

    const entry = result.get('c1');
    expect(entry).toBeDefined();
    expect(entry!.bridge.data?.authors).toEqual(['Bruno']);
    expect(entry!.bridge.data?.authors).not.toContain('Fantôme');
    expect(entry!.bridge.data?.messageCount).toBe(1);
  });

  it('un message effacé pour ce lecteur seul ne fuite pas dans le pont', async () => {
    const fixture = fixtureWithCutoff();
    fixture.prefs = [];
    fixture.deletions = [{ userId: 'u-viewer', messageId: 'm-efface', conversationId: 'c1' }];

    const prisma = makePrismaMock(fixture);
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 1 }],
    });

    expect(result.get('c1')!.bridge.data?.authors).toEqual(['Bruno']);
  });

  it('le plancher de lecture est la position CHRONOLOGIQUE du curseur, jamais l\'horloge murale', async () => {
    const fixture: Fixture = {
      participants: [participant('c1', 'p1')],
      // Lecture exacte : `lastReadAt = now` (postérieur à tout), mais la
      // position chronologique réelle s'arrête au préfixe contigu.
      cursors: [
        {
          participantId: 'p1',
          lastReadAt: at('2026-12-31T23:59:59.000Z'),
          lastReadMessageCreatedAt: at('2026-03-01T00:00:00.000Z'),
        },
      ],
      messages: [
        message({
          id: 'm-saute',
          conversationId: 'c1',
          senderId: 'other-1',
          createdAt: at('2026-03-02T09:00:00.000Z'),
          sender: { displayName: 'Bruno' },
        }),
      ],
    };

    const prisma = makePrismaMock(fixture);
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 1 }],
    });

    // Avec l'horloge murale comme plancher, le message sauté disparaîtrait
    // et le pont serait ABSENT — le badge resterait haut sans pont.
    expect(result.get('c1')!.bridge.data?.authors).toEqual(['Bruno']);
  });

  it('un message supprimé pour tous (deletedAt) n\'entre jamais dans le pont', async () => {
    const fixture: Fixture = {
      participants: [participant('c1', 'p1')],
      cursors: [{ participantId: 'p1', lastReadAt: null, lastReadMessageCreatedAt: null }],
      messages: [
        message({
          id: 'm-tombstone',
          conversationId: 'c1',
          senderId: 'other-1',
          createdAt: at('2026-03-02T09:00:00.000Z'),
          deletedAt: at('2026-03-03T09:00:00.000Z'),
          sender: { displayName: 'Fantôme' },
        }),
        message({
          id: 'm-ok',
          conversationId: 'c1',
          senderId: 'other-2',
          createdAt: at('2026-03-04T09:00:00.000Z'),
          sender: { displayName: 'Bruno' },
        }),
      ],
    };

    const prisma = makePrismaMock(fixture);
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 1 }],
    });

    expect(result.get('c1')!.bridge.data?.authors).toEqual(['Bruno']);
  });

  it('les messages du lecteur lui-même n\'alimentent pas le pont', async () => {
    const fixture: Fixture = {
      participants: [participant('c1', 'p1')],
      cursors: [{ participantId: 'p1', lastReadAt: null, lastReadMessageCreatedAt: null }],
      messages: [
        message({
          id: 'm-moi',
          conversationId: 'c1',
          senderId: 'p1',
          createdAt: at('2026-03-02T09:00:00.000Z'),
          sender: { displayName: 'Moi' },
        }),
      ],
    };

    const prisma = makePrismaMock(fixture);
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 1 }],
    });

    // Rien à annoncer ⇒ ABSENT (jamais un pont aux champs vides).
    expect(result.has('c1')).toBe(false);
  });

  it('une conversation dont le participant ne se résout pas reste ABSENTE', async () => {
    const prisma = makePrismaMock({ participants: [], cursors: [], messages: [] });
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c-inconnue', unreadCount: 3 }],
    });
    expect(result.has('c-inconnue')).toBe(false);
  });
});

// =============================================================================
// 3. `unreadCount === 0` ⇒ champ pont ABSENT
// =============================================================================

describe('ConversationBridgeService — absence (contrainte dure 3)', () => {
  const fixture = (): Fixture => ({
    participants: [participant('c-lue', 'p-lue'), participant('c-non-lue', 'p-non-lue')],
    cursors: [
      { participantId: 'p-lue', lastReadAt: null, lastReadMessageCreatedAt: null },
      { participantId: 'p-non-lue', lastReadAt: null, lastReadMessageCreatedAt: null },
    ],
    messages: [
      message({
        id: 'm-lue',
        conversationId: 'c-lue',
        senderId: 'other-1',
        createdAt: at('2026-03-02T09:00:00.000Z'),
        sender: { displayName: 'Alice' },
      }),
      message({
        id: 'm-non-lue',
        conversationId: 'c-non-lue',
        senderId: 'other-2',
        createdAt: at('2026-03-02T09:00:00.000Z'),
        sender: { displayName: 'Bruno' },
      }),
    ],
  });

  it('unreadCount === 0 ⇒ la clé est ABSENTE — pas null, pas 0', async () => {
    const prisma = makePrismaMock(fixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [
        { conversationId: 'c-lue', unreadCount: 0 },
        { conversationId: 'c-non-lue', unreadCount: 1 },
      ],
    });

    expect(result.has('c-lue')).toBe(false);
    expect(Object.keys(Object.fromEntries(result))).toEqual(['c-non-lue']);
    // Une absence ne se convertit jamais en affirmation : ni `null`, ni `0`.
    expect(result.get('c-lue')).toBeUndefined();
    expect(result.get('c-non-lue')!.bridge.unreadCount).toBe(1);
  });

  it('la conversation lue n\'entre même pas dans la fenêtre agrégée', async () => {
    const prisma = makePrismaMock(fixture());
    await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [
        { conversationId: 'c-lue', unreadCount: 0 },
        { conversationId: 'c-non-lue', unreadCount: 1 },
      ],
    });

    const where = (prisma.message.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR.map((clause: any) => clause.conversationId)).toEqual(['c-non-lue']);
  });
});

// =============================================================================
// Forme du pont — conformité à la loi partagée
// =============================================================================

describe('ConversationBridgeService — forme du pont', () => {
  const baseFixture = (): Fixture => ({
    participants: [participant('c1', 'p1')],
    cursors: [
      {
        participantId: 'p1',
        lastReadAt: at('2026-03-01T08:00:00.000Z'),
        lastReadMessageCreatedAt: at('2026-03-01T08:00:00.000Z'),
      },
    ],
    messages: [
      message({
        id: 'm1',
        conversationId: 'c1',
        senderId: 's1',
        createdAt: at('2026-03-02T09:00:00.000Z'),
        sender: { displayName: 'Alice' },
        attachments: [{ mimeType: 'image/jpeg' }, { mimeType: 'application/pdf' }],
      }),
      message({
        id: 'm2',
        conversationId: 'c1',
        senderId: 's2',
        createdAt: at('2026-03-02T10:00:00.000Z'),
        sender: { displayName: null, nickname: 'Bruno' },
        attachments: [{ mimeType: 'audio/mpeg' }],
      }),
      message({
        id: 'm3',
        conversationId: 'c1',
        senderId: 's3',
        createdAt: at('2026-03-02T11:00:00.000Z'),
        sender: { displayName: null, user: { displayName: 'Carla' } },
      }),
    ],
  });

  it('produit exactement la forme de la loi partagée (auteurs, +N, compteurs médias)', async () => {
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
    });

    const bridge = result.get('c1')!.bridge;
    expect(bridge.kind).toBe('fallback');
    expect(bridge.unreadCount).toBe(3);
    expect(bridge.data).toEqual({
      authors: ['Alice', 'Bruno'],
      extraAuthorCount: 1,
      messageCount: 3,
      mediaCounts: { images: 1, audio: 1, files: 1 },
    });
    // Fenêtre complète ⇒ `isComplete` ABSENT (absent = complet).
    expect('isComplete' in bridge).toBe(false);
  });

  it('lastReadAt est servi quand le curseur existe, ABSENT sinon', async () => {
    const withCursor = makePrismaMock(baseFixture());
    const entry = (
      await new ConversationBridgeService(withCursor).buildBridgeData({
        viewerId: 'u-viewer',
        candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      })
    ).get('c1')!;
    expect(entry.lastReadAt).toEqual(at('2026-03-01T08:00:00.000Z'));

    const noCursorFixture = baseFixture();
    noCursorFixture.cursors = [];
    const noCursor = makePrismaMock(noCursorFixture);
    const bare = (
      await new ConversationBridgeService(noCursor).buildBridgeData({
        viewerId: 'u-viewer',
        candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      })
    ).get('c1')!;
    expect('lastReadAt' in bare).toBe(false);
  });

  it('fenêtre tronquée ⇒ isComplete: false (jamais un décompte partiel servi comme total)', async () => {
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      windowLimit: 2,
    });

    const bridge = result.get('c1')!.bridge;
    expect(bridge.isComplete).toBe(false);
    expect(bridge.unreadCount).toBe(3);
    expect(bridge.data!.messageCount).toBe(2);
    expect((prisma.message.findMany as jest.Mock).mock.calls[0][0].take).toBe(2);
  });

  it('un auteur sans nom résoluble est écarté et la fenêtre se déclare partielle', async () => {
    const fixture = baseFixture();
    fixture.messages[2].sender = { displayName: '   ', nickname: null, user: null };
    const prisma = makePrismaMock(fixture);
    const bridge = (
      await new ConversationBridgeService(prisma).buildBridgeData({
        viewerId: 'u-viewer',
        candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      })
    ).get('c1')!.bridge;

    expect(bridge.data!.authors).toEqual(['Alice', 'Bruno']);
    expect(bridge.data!.extraAuthorCount).toBe(0);
    expect(bridge.isComplete).toBe(false);
  });

  it('suggestedMode : branche par défaut de la loi, sans entrée d\'orchestrateur', async () => {
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
    });
    expect(result.get('c1')!.bridge.suggestedMode).toBe('focal');
  });

  it('suggestedMode : la vraie décision d\'orchestrateur quand la passe la fournit', async () => {
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      orchestratorInputs: new Map([
        [
          'c1',
          {
            stickyChoice: 'resume' as const,
            isFlagEnabled: true,
            lastOpenedAt: null,
            now: at('2026-03-03T00:00:00.000Z'),
            capabilities: {
              availableModes: ['focal', 'script', 'summary'] as const,
              riverEligible: false,
              riverEligibilityReason: { threshold: 5, current: null, riverReason: 'belowThreshold' as const },
            },
          },
        ],
      ]),
    });
    expect(result.get('c1')!.bridge.suggestedMode).toBe('resume');
  });

  it('un plafond de fenêtre par défaut existe et est positif', () => {
    expect(DEFAULT_BRIDGE_WINDOW_LIMIT).toBeGreaterThan(0);
  });

  it('une panne Prisma rend une map VIDE — masquer, jamais affirmer', async () => {
    const prisma = makePrismaMock(baseFixture());
    prisma.participant.findMany = jest.fn(async () => {
      throw new Error('mongo down');
    });
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
    });
    expect(result.size).toBe(0);
  });
});

// =============================================================================
// G-127 — top-up agent : intersection exacte, repli déterministe (C2), E7
// =============================================================================

describe('ConversationBridgeService — étage agent (G-127)', () => {
  const baseFixture = (): Fixture => ({
    participants: [participant('c1', 'p1')],
    cursors: [
      {
        participantId: 'p1',
        lastReadAt: at('2026-03-01T08:00:00.000Z'),
        lastReadMessageCreatedAt: at('2026-03-01T08:00:00.000Z'),
      },
    ],
    messages: [
      message({
        id: 'm1',
        conversationId: 'c1',
        senderId: 's1',
        createdAt: at('2026-03-02T09:00:00.000Z'),
        sender: { displayName: 'Alice' },
      }),
      message({
        id: 'm2',
        conversationId: 'c1',
        senderId: 's2',
        createdAt: at('2026-03-02T10:00:00.000Z'),
        sender: { displayName: 'Bruno' },
      }),
      message({
        id: 'm3',
        conversationId: 'c1',
        senderId: 's1',
        createdAt: at('2026-03-02T11:00:00.000Z'),
        sender: { displayName: 'Alice' },
      }),
    ],
  });

  it('sans `agent` fourni : ne monte AUCUN appel, le pont reste `fallback` (comportement G-122 intact)', async () => {
    const getRangeSummary = jest.fn();
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
    });
    expect(result.get('c1')!.bridge.kind).toBe('fallback');
    expect(getRangeSummary).not.toHaveBeenCalled();
  });

  it('intersection EXACTE (mêmes bornes, même compte) ⇒ kind bascule à `agent`, `text` porté', async () => {
    const getRangeSummary = jest.fn().mockResolvedValue({
      conversationId: 'c1',
      summary: "Alice et Bruno ont réglé l'horaire de vendredi.",
      fromMessageId: 'm1',
      toMessageId: 'm3',
      messageCount: 3,
    });
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    expect(getRangeSummary).toHaveBeenCalledWith({
      conversationId: 'c1',
      fromMessageId: 'm1',
      toMessageId: 'm3',
    });
    const bridge = result.get('c1')!.bridge;
    expect(bridge.kind).toBe('agent');
    expect(bridge.text).toBe("Alice et Bruno ont réglé l'horaire de vendredi.");
    expect(bridge.unreadCount).toBe(3);
    expect(bridge.suggestedMode).toBe('focal');
    // `data` (l'étage déterministe) ne voyage plus une fois basculé à agent.
    expect(bridge.data).toBeUndefined();
    // Fenêtre complète ⇒ `isComplete` ABSENT, comme le plancher qu'il remplace.
    expect('isComplete' in bridge).toBe(false);
  });

  it("E7 : `translations` et `originalLanguage` restent ABSENTS — aucune langue n'est fabriquée", async () => {
    const getRangeSummary = jest.fn().mockResolvedValue({
      conversationId: 'c1',
      summary: 'Une phrase en français, jamais retraduite ici.',
      fromMessageId: 'm1',
      toMessageId: 'm3',
      messageCount: 3,
    });
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    const bridge = result.get('c1')!.bridge;
    expect('translations' in bridge).toBe(false);
    expect('originalLanguage' in bridge).toBe(false);
  });

  it('C2 — repli : bornes différentes (résumé plus court) ⇒ le pont fallback reste INTACT', async () => {
    const getRangeSummary = jest.fn().mockResolvedValue({
      conversationId: 'c1',
      summary: 'Résumé partiel des deux premiers messages seulement.',
      fromMessageId: 'm1',
      toMessageId: 'm2', // ne couvre pas jusqu'à m3
      messageCount: 2,
    });
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    const bridge = result.get('c1')!.bridge;
    expect(bridge.kind).toBe('fallback');
    expect(bridge.text).toBeUndefined();
    expect(bridge.data!.messageCount).toBe(3);
  });

  it('C2 — repli : mêmes bornes mais `messageCount` divergent (droits que l\'agent ignore) ⇒ fallback INTACT', async () => {
    const getRangeSummary = jest.fn().mockResolvedValue({
      conversationId: 'c1',
      summary: 'Résumé qui prétend couvrir 4 messages que la gateway ne voit pas tous.',
      fromMessageId: 'm1',
      toMessageId: 'm3',
      messageCount: 4, // l'agent voit un message de plus que les droits du lecteur
    });
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    expect(result.get('c1')!.bridge.kind).toBe('fallback');
  });

  it('C2 — repli : agent muet (`data: null`, G-126) ⇒ fallback INTACT', async () => {
    const getRangeSummary = jest.fn().mockResolvedValue(null);
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    expect(result.get('c1')!.bridge.kind).toBe('fallback');
  });

  it('C2 — repli : agent en panne (timeout/service down, promesse rejetée) ⇒ fallback INTACT, rien ne casse', async () => {
    const getRangeSummary = jest.fn().mockRejectedValue(new Error('agent unreachable'));
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      agent: { getRangeSummary },
    });

    expect(result.get('c1')!.bridge.kind).toBe('fallback');
    expect(result.get('c1')!.bridge.data!.messageCount).toBe(3);
  });

  it("la partialité traverse le changement d'étage : fenêtre tronquée ⇒ `isComplete: false` reste posé sur un pont `agent`", async () => {
    // windowLimit: 2 tronque la fenêtre à [m1, m2] — la gateway n'appelle
    // l'agent QUE sur les bornes qu'elle a réellement retenues.
    const getRangeSummary = jest.fn().mockResolvedValue({
      conversationId: 'c1',
      summary: 'Résumé des deux messages retenus par la fenêtre tronquée.',
      fromMessageId: 'm1',
      toMessageId: 'm2',
      messageCount: 2,
    });
    const prisma = makePrismaMock(baseFixture());
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [{ conversationId: 'c1', unreadCount: 3 }],
      windowLimit: 2,
      agent: { getRangeSummary },
    });

    expect(getRangeSummary).toHaveBeenCalledWith({
      conversationId: 'c1',
      fromMessageId: 'm1',
      toMessageId: 'm2',
    });
    const bridge = result.get('c1')!.bridge;
    expect(bridge.kind).toBe('agent');
    expect(bridge.isComplete).toBe(false);
  });

  it('une panne agent sur UNE conversation ne prive pas les autres de leur tentative', async () => {
    const fixture: Fixture = {
      participants: [participant('c1', 'p1'), participant('c2', 'p2')],
      cursors: [
        { participantId: 'p1', lastReadAt: null, lastReadMessageCreatedAt: null },
        { participantId: 'p2', lastReadAt: null, lastReadMessageCreatedAt: null },
      ],
      messages: [
        message({
          id: 'a1',
          conversationId: 'c1',
          senderId: 'other-1',
          createdAt: at('2026-03-02T09:00:00.000Z'),
          sender: { displayName: 'Alice' },
        }),
        message({
          id: 'b1',
          conversationId: 'c2',
          senderId: 'other-2',
          createdAt: at('2026-03-02T09:00:00.000Z'),
          sender: { displayName: 'Bruno' },
        }),
      ],
    };
    const getRangeSummary = jest.fn().mockImplementation(async ({ conversationId }: any) => {
      if (conversationId === 'c1') throw new Error('down for c1');
      return { conversationId: 'c2', summary: 'Bruno a écrit.', fromMessageId: 'b1', toMessageId: 'b1', messageCount: 1 };
    });
    const prisma = makePrismaMock(fixture);
    const result = await new ConversationBridgeService(prisma).buildBridgeData({
      viewerId: 'u-viewer',
      candidates: [
        { conversationId: 'c1', unreadCount: 1 },
        { conversationId: 'c2', unreadCount: 1 },
      ],
      agent: { getRangeSummary },
    });

    expect(result.get('c1')!.bridge.kind).toBe('fallback');
    expect(result.get('c2')!.bridge.kind).toBe('agent');
  });
});
