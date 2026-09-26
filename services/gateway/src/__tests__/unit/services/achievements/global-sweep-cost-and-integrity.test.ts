/**
 * **Le balayage des succès ne compte que ce que l'utilisateur a FAIT, et le
 * compte sans balayer la base** (#7916, #7909).
 *
 * #7916 — un compte NEUF recevait `achievement.parole.message.send.count:1`
 * dès l'inscription. Producteur : l'avis d'arrivée de Meeshy Global
 * (`globalArrivalsNotice.ts`) est un message `messageSource: 'system'` dont
 * `senderId` est le Participant du nouvel arrivant ; le compte de
 * `message.send` ne regardait que l'expéditeur, donc l'avis comptait pour un
 * premier message.
 *
 * #7909 — `GET /me/engagement` prenait 2,7 à 3,3 s sur staging (mesuré le
 * 2026-09-25). Le balayage filtrait `Message`, `MessageAttachment`,
 * `Reaction`… par RELATION (`sender: { userId }`) : sur MongoDB, Prisma en
 * fait un `$lookup` par document de la collection entière — 1 265 ms pour le
 * seul `message.send` sur staging, contre 9 ms par `senderId: { in }` (index
 * `senderId`). Et chaque palier déjà gravé repartait en `create` pour se
 * faire refuser par `P2002`, un aller-retour par palier et par ouverture.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ACHIEVEMENT_FAMILIES, familyId } from '@meeshy/shared/types/achievement-families';
import { achievementKey } from '@meeshy/shared/types/achievement-catalog';
import { GlobalAchievements } from '../../../../services/achievements/GlobalAchievements';

jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: async () => ({}) }),
}));
jest.mock('../../../../services/notifications/NotificationService');

const USER = 'u-new';

type MessageRow = {
  readonly id: string;
  readonly senderId: string;
  readonly messageSource: 'user' | 'system';
  readonly deletedAt: Date | null;
  readonly isEdited: boolean;
};

type Where = Record<string, unknown>;

const RELATION_KEYS = ['sender', 'message', 'participant', 'trackingLink', 'conversation'] as const;

function family(id: string) {
  const found = ACHIEVEMENT_FAMILIES.find((candidate) => familyId(candidate) === id);
  if (!found) throw new Error(`famille absente du catalogue : ${id}`);
  return found;
}

const inList = (value: unknown, filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (typeof filter === 'object' && filter !== null && 'in' in filter) {
    return (filter as { in: readonly unknown[] }).in.includes(value);
  }
  return value === filter;
};

const nullable = (value: unknown, filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (filter === null) return value === null;
  if (typeof filter === 'object' && filter !== null && 'not' in filter) return value !== null;
  return value === filter;
};

/**
 * Une base en mémoire qui ÉVALUE les `where` qu'on lui passe — y compris le
 * filtre par relation `sender: { userId }`, pour que le défaut d'origine se
 * voie tel que la vraie base le rendait. Chaque `where` est aussi relevé : la
 * forme de la requête est ce que le témoin de coût interroge.
 */
function makeDatabase(params: {
  readonly messages: readonly MessageRow[];
  readonly alreadyGraved?: readonly string[];
}) {
  const participants = [
    { id: 'p-global', userId: USER },
    { id: 'p-direct', userId: USER },
    { id: 'p-other', userId: 'u-other' },
  ];
  const userOfParticipant = new Map(participants.map((row) => [row.id, row.userId]));
  const wheres: { model: string; where: Where }[] = [];
  const graved = new Set(params.alreadyGraved ?? []);
  const created: string[] = [];

  const recordWhere = (model: string) => (args: unknown) => {
    const where = ((args as { where?: Where } | undefined)?.where ?? {}) as Where;
    wheres.push({ model, where });
    return where;
  };

  const messageMatches = (row: MessageRow, where: Where): boolean => {
    const sender = where.sender as { userId?: string } | undefined;
    if (sender?.userId !== undefined && userOfParticipant.get(row.senderId) !== sender.userId) return false;
    return (
      inList(row.senderId, where.senderId) &&
      inList(row.messageSource, where.messageSource) &&
      nullable(row.deletedAt, where.deletedAt) &&
      (where.isEdited === undefined || row.isEdited === where.isEdited)
    );
  };

  const zero = (model: string) =>
    jest.fn(async (args: unknown) => {
      recordWhere(model)(args);
      return 0;
    });

  const prisma = {
    participant: {
      findMany: jest.fn(async (args: unknown) => {
        const where = recordWhere('participant')(args);
        return participants.filter((row) => row.userId === where.userId).map((row) => ({ id: row.id }));
      }),
    },
    message: {
      count: jest.fn(async (args: unknown) => {
        const where = recordWhere('message')(args);
        return params.messages.filter((row) => messageMatches(row, where)).length;
      }),
    },
    messageAttachment: { count: zero('messageAttachment') },
    reaction: { count: zero('reaction') },
    callParticipant: { count: zero('callParticipant'), groupBy: jest.fn(async () => []) },
    callSession: { findMany: jest.fn(async () => []), count: zero('callSession') },
    affiliateRelation: { count: zero('affiliateRelation') },
    trackingLink: {
      findMany: jest.fn(async (args: unknown) => {
        recordWhere('trackingLink')(args);
        return [];
      }),
    },
    trackingLinkClick: { count: zero('trackingLinkClick') },
    user: { findUnique: jest.fn(async () => ({ longestStreakDays: 0, meeshMintedLifetime: 0, systemLanguage: 'fr' })) },
    engagementMilestone: {
      findMany: jest.fn(async () => [...graved].map((milestoneKey) => ({ milestoneKey }))),
      create: jest.fn(async (args: unknown) => {
        const key = (args as { data: { milestoneKey: string } }).data.milestoneKey;
        if (graved.has(key)) {
          const error: Error & { code?: string } = new Error('unique');
          error.code = 'P2002';
          throw error;
        }
        graved.add(key);
        created.push(key);
        return {};
      }),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, raw: prisma, wheres, created, graved };
}

const arrivalNotice: MessageRow = {
  id: 'm-arrival',
  senderId: 'p-global',
  messageSource: 'system',
  deletedAt: null,
  isEdited: false,
};

const firstMessageKey = achievementKey(family('message.send.count'), 1);

describe('#7916 — le succès « premier message » attend un premier message', () => {
  it("l'avis d'arrivée dans Meeshy Global ne grave AUCUN succès de messagerie", async () => {
    const db = makeDatabase({ messages: [arrivalNotice] });

    await new GlobalAchievements(db.prisma).sweep(USER);

    expect(db.created.filter((key) => key.includes('message.'))).toEqual([]);
  });

  it('un vrai premier message, lui, grave `message.send.count:1`', async () => {
    const db = makeDatabase({
      messages: [
        arrivalNotice,
        { id: 'm-hello', senderId: 'p-global', messageSource: 'user', deletedAt: null, isEdited: false },
      ],
    });

    await new GlobalAchievements(db.prisma).sweep(USER);

    expect(db.created).toContain(firstMessageKey);
  });

  it("le message d'un AUTRE compte ne compte pas pour celui-ci", async () => {
    const db = makeDatabase({
      messages: [{ id: 'm-other', senderId: 'p-other', messageSource: 'user', deletedAt: null, isEdited: false }],
    });

    await new GlobalAchievements(db.prisma).sweep(USER);

    expect(db.created).not.toContain(firstMessageKey);
  });
});

describe('#7909 — le balayage ne parcourt pas la base', () => {
  it('aucun compte ne filtre par RELATION (un `$lookup` par document sur MongoDB)', async () => {
    const db = makeDatabase({
      messages: [{ id: 'm-hello', senderId: 'p-global', messageSource: 'user', deletedAt: null, isEdited: false }],
    });

    await new GlobalAchievements(db.prisma).sweep(USER);

    const relational = db.wheres
      .filter(({ where }) => RELATION_KEYS.some((key) => key in where))
      .map(({ model, where }) => `${model} ${JSON.stringify(where)}`);
    expect(relational).toEqual([]);
  });

  it("les Participants de l'utilisateur ne se lisent qu'UNE fois par balayage", async () => {
    const db = makeDatabase({ messages: [] });

    await new GlobalAchievements(db.prisma).sweep(USER);

    expect(db.raw.participant.findMany).toHaveBeenCalledTimes(1);
  });

  it('un palier déjà gravé ne repart pas en écriture (aucun aller-retour refusé par P2002)', async () => {
    const db = makeDatabase({
      messages: [{ id: 'm-hello', senderId: 'p-global', messageSource: 'user', deletedAt: null, isEdited: false }],
      alreadyGraved: [firstMessageKey],
    });

    await new GlobalAchievements(db.prisma).sweep(USER);

    const attempted = db.raw.engagementMilestone.create.mock.calls.map(
      (call) => (call[0] as { data: { milestoneKey: string } }).data.milestoneKey,
    );
    expect(attempted).not.toContain(firstMessageKey);
  });
});
