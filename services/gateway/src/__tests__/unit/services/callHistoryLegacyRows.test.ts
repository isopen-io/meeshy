/**
 * Le journal des appels liste les appels, y compris les anciens (#8294).
 *
 * `CallSession.hiddenForUserIds` est né avec #8066 SANS défaut : toute session
 * créée avant (et jusqu'à ce correctif) n'en porte PAS la clé. Or, sur MongoDB,
 * Prisma double chaque filtre de liste NIÉ d'une exigence de présence du champ
 * (mesuré contre `mongo:8` : `NOT: { has }`, `NOT: { hasSome }`,
 * `NOT: { equals }`, `NOT: { OR/AND … }` excluent tous le document sans clé ;
 * `isSet` n'existe pas sur une liste scalaire, et `equals: null` ne rend rien).
 * Le journal filtrait `NOT: { hiddenForUserIds: { has } }` : il était VIDE.
 *
 * Le faux ci-dessous reproduit ces sémantiques mesurées — et refuse toute clé
 * de `where` qu'il ne sait pas évaluer, pour qu'un témoin vert ne soit jamais
 * un filtre ignoré.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { clearCallHistory, listCallHistory } from '../../../services/calls/callHistoryList';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const READER = '507f1f77bcf86cd799439022';
const OTHER = '507f1f77bcf86cd799439033';
const CONVERSATION = '507f1f77bcf86cd799439044';

type Row = {
  id: string;
  conversationId: string;
  status: string;
  initiatorId: string;
  startedAt: Date;
  hiddenForUserIds?: string[];
  isVideo?: boolean | null;
};

type Where = Record<string, unknown>;

const listFilterNegatedMatches = (value: string[] | undefined, filter: Record<string, unknown>): boolean =>
  value !== undefined && !listFilterMatches(value, filter);

const listFilterMatches = (value: string[] | undefined, filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([op, arg]) => {
    if (op === 'has') return value !== undefined && value.includes(arg as string);
    throw new Error(`filtre de liste non évalué par le faux : ${op}`);
  });

const matches = (row: Row, where: Where, members: ReadonlySet<string>): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const c = cond as Record<string, unknown>;
    switch (key) {
      case 'id':
        return Object.entries(c).every(([op, arg]) => {
          if (op === 'notIn') return !(arg as string[]).includes(row.id);
          if (op === 'in') return (arg as string[]).includes(row.id);
          throw new Error(`filtre d'id non évalué : ${op}`);
        });
      case 'startedAt':
        return row.startedAt >= (c.gte as Date);
      case 'status':
        return (c.in as string[]).includes(row.status);
      case 'conversation':
        return members.has(row.conversationId);
      case 'hiddenForUserIds':
        return listFilterMatches(row.hiddenForUserIds, c);
      case 'isVideo':
        if (cond === null) return row.isVideo === null;
        if (typeof cond === 'boolean') return row.isVideo === cond;
        if (c.isSet === false) return row.isVideo === undefined;
        throw new Error(`filtre isVideo non évalué : ${JSON.stringify(cond)}`);
      case 'AND':
        return (cond as Where[]).every((w) => matches(row, w, members));
      case 'OR':
        return (cond as Where[]).some((w) => matches(row, w, members));
      case 'NOT': {
        const clauses = (Array.isArray(cond) ? cond : [cond]) as Where[];
        return clauses.every((clause) =>
          Object.entries(clause).every(([k, v]) => {
            if (k === 'isVideo') return row.isVideo !== undefined && row.isVideo !== null && !matches(row, { [k]: v }, members);
            if (k === 'hiddenForUserIds') return listFilterNegatedMatches(row.hiddenForUserIds, v as Record<string, unknown>);
            return !matches(row, { [k]: v }, members);
          })
        );
      }
      default:
        throw new Error(`clé de where non évaluée par le faux : ${key}`);
    }
  });

const mongoLikePrisma = (rows: Row[]) => {
  const members = new Set([CONVERSATION]);
  const store = rows.map((r) => ({ ...r }));
  const callSession = {
    findMany: jest.fn(async (args: { where: Where; select?: Record<string, unknown> }) =>
      store
        .filter((r) => matches(r, args.where, members))
        .map((r) => ({
          ...r,
          mode: 'p2p',
          endReason: null,
          answeredAt: null,
          endedAt: null,
          duration: null,
          bytesSent: null,
          bytesReceived: null,
          metadata: null,
          conversation: { type: 'direct', title: null, avatar: null, participants: [{ id: 'p-reader' }] },
        }))
    ),
    updateMany: jest.fn(async (args: { where: Where; data: { hiddenForUserIds: { push: string } } }) => {
      const hit = store.filter((r) => matches(r, args.where, members));
      hit.forEach((r) => {
        r.hiddenForUserIds = [...(r.hiddenForUserIds ?? []), args.data.hiddenForUserIds.push];
      });
      return { count: hit.length };
    }),
  };
  const prisma = {
    callSession,
    participant: { findMany: jest.fn(async () => []) },
    callParticipant: { findMany: jest.fn(async () => []) },
  } as unknown as PrismaClient;
  return { prisma, store };
};

const recent = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

const call = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  conversationId: CONVERSATION,
  status: 'ended',
  initiatorId: READER,
  startedAt: recent(Number.parseInt(id.slice(-2), 10)),
  ...extra,
});

const journalOf = async (prisma: PrismaClient, type?: 'audio' | 'video') =>
  (
    await listCallHistory(prisma, READER, { limit: 30, filter: 'all', type, viewer: { userId: READER, role: 'USER' } as any })
  ).items.map((i) => i.callId);

describe('le journal des appels et les sessions sans hiddenForUserIds (#8294)', () => {
  it('liste un appel dont la session ne porte pas la clé hiddenForUserIds', async () => {
    const { prisma } = mongoLikePrisma([call('c01')]);
    expect(await journalOf(prisma)).toEqual(['c01']);
  });

  it('liste les appels anciens et récents, et tait seulement ceux que le lecteur a effacés', async () => {
    const { prisma } = mongoLikePrisma([
      call('c01'),
      call('c02', { hiddenForUserIds: [] }),
      call('c03', { hiddenForUserIds: [READER] }),
      call('c04', { hiddenForUserIds: [OTHER] }),
    ]);
    expect(await journalOf(prisma)).toEqual(['c01', 'c02', 'c04']);
  });

  it('« tout effacer » efface aussi les appels sans la clé, une seule fois chacun', async () => {
    const { prisma, store } = mongoLikePrisma([
      call('c01'),
      call('c02', { hiddenForUserIds: [READER] }),
      call('c03', { hiddenForUserIds: [OTHER] }),
    ]);
    expect(await clearCallHistory(prisma, READER)).toBe(2);
    expect(store.map((r) => r.hiddenForUserIds)).toEqual([[READER], [READER], [OTHER, READER]]);
    expect(await journalOf(prisma)).toEqual([]);
  });

  it('le filtre « audio » garde les appels antérieurs à isVideo, jamais les vidéos', async () => {
    const { prisma } = mongoLikePrisma([
      call('c01'),
      call('c02', { isVideo: null }),
      call('c03', { isVideo: false, hiddenForUserIds: [] }),
      call('c04', { isVideo: true, hiddenForUserIds: [] }),
    ]);
    expect(await journalOf(prisma, 'audio')).toEqual(['c01', 'c02', 'c03']);
    expect(await journalOf(prisma, 'video')).toEqual(['c04']);
  });
});
