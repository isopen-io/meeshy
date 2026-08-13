/**
 * `personalHistoryFilter` — the single place that turns the two per-user
 * history-hiding facts (`UserConversationPreferences.clearHistoryBefore`,
 * `UserMessageDeletion`) into a Prisma filter.
 *
 * These tests pin the two properties every call site depends on and that a
 * naive spread would silently break:
 *   1. the hiding can only ever SHRINK a result set — merging it into a where
 *      clause that already carries `createdAt`/`id` constraints never widens
 *      them;
 *   2. a user with nothing hidden pays nothing (no filter keys added), so the
 *      existing query plans are untouched for the overwhelming majority.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  NO_PERSONAL_HIDING,
  hidesNothing,
  applyPersonalHistoryHiding,
  loadPersonalHistoryHiding,
  loadPersonalHistoryHidingByConversation,
  type PersonalHistoryHiding,
} from '../../../services/personalHistoryFilter';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const makePrisma = (over: {
  prefs?: { clearHistoryBefore: Date | null } | null;
  prefsMany?: Array<{ conversationId: string; clearHistoryBefore: Date | null }>;
  deletions?: Array<{ messageId: string; message?: { conversationId: string } }>;
}) => ({
  userConversationPreferences: {
    findFirst: jest.fn(async (_args: unknown) => over.prefs ?? null),
    findMany: jest.fn(async (_args: unknown) => over.prefsMany ?? []),
  },
  userMessageDeletion: {
    findMany: jest.fn(async (_args: unknown) => over.deletions ?? []),
  },
});

describe('hidesNothing', () => {
  it('is true for the shared empty value', () => {
    expect(hidesNothing(NO_PERSONAL_HIDING)).toBe(true);
  });

  it('is false as soon as one message is hidden, even with no cutoff', () => {
    expect(hidesNothing({ clearHistoryBefore: null, hiddenMessageIds: ['m1'] })).toBe(false);
  });

  it('is false as soon as a cutoff exists, even with no hidden message', () => {
    expect(hidesNothing({ clearHistoryBefore: new Date(0), hiddenMessageIds: [] })).toBe(false);
  });
});

describe('applyPersonalHistoryHiding', () => {
  it('returns the where clause untouched when nothing is hidden', () => {
    const where = { conversationId: CONV_ID, deletedAt: null };

    expect(applyPersonalHistoryHiding(where, NO_PERSONAL_HIDING)).toEqual({
      conversationId: CONV_ID,
      deletedAt: null,
    });
  });

  it('adds the cutoff as a createdAt lower bound', () => {
    const cutoff = new Date('2026-01-01T00:00:00.000Z');

    const out = applyPersonalHistoryHiding(
      { conversationId: CONV_ID },
      { clearHistoryBefore: cutoff, hiddenMessageIds: [] }
    );

    expect(out).toEqual({ conversationId: CONV_ID, createdAt: { gte: cutoff } });
  });

  it('keeps the STRICTER of two lower bounds when the caller already has one', () => {
    const joinedAt = new Date('2026-03-01T00:00:00.000Z');
    const cutoff = new Date('2026-01-01T00:00:00.000Z');

    const out = applyPersonalHistoryHiding(
      { createdAt: { gte: joinedAt } },
      { clearHistoryBefore: cutoff, hiddenMessageIds: [] }
    );

    expect(out.createdAt).toEqual({ gte: joinedAt });
  });

  it('raises a weaker caller lower bound to the cutoff', () => {
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');
    const cutoff = new Date('2026-03-01T00:00:00.000Z');

    const out = applyPersonalHistoryHiding(
      { createdAt: { gte: joinedAt } },
      { clearHistoryBefore: cutoff, hiddenMessageIds: [] }
    );

    expect(out.createdAt).toEqual({ gte: cutoff });
  });

  it('preserves an upper bound (cursor pagination) while adding the cutoff', () => {
    const before = new Date('2026-06-01T00:00:00.000Z');
    const cutoff = new Date('2026-01-01T00:00:00.000Z');

    const out = applyPersonalHistoryHiding(
      { createdAt: { lt: before } },
      { clearHistoryBefore: cutoff, hiddenMessageIds: [] }
    );

    expect(out.createdAt).toEqual({ lt: before, gte: cutoff });
  });

  it('excludes hidden message ids', () => {
    const out = applyPersonalHistoryHiding(
      { conversationId: CONV_ID },
      { clearHistoryBefore: null, hiddenMessageIds: ['m1', 'm2'] }
    );

    expect(out).toEqual({ conversationId: CONV_ID, id: { notIn: ['m1', 'm2'] } });
  });

  it('SUBTRACTS from an explicit id allowlist instead of emitting a contradictory notIn', () => {
    const out = applyPersonalHistoryHiding(
      { id: { in: ['m1', 'm2', 'm3'] } },
      { clearHistoryBefore: null, hiddenMessageIds: ['m2'] }
    );

    expect(out.id).toEqual({ in: ['m1', 'm3'] });
  });

  it('narrows a single-message lookup to itself instead of widening it to a notIn', () => {
    const out = applyPersonalHistoryHiding(
      { id: 'm1', conversationId: CONV_ID },
      { clearHistoryBefore: null, hiddenMessageIds: ['m9'] }
    );

    expect(out.id).toEqual({ in: ['m1'] });
  });

  it('empties a single-message lookup when that message is the hidden one', () => {
    const out = applyPersonalHistoryHiding(
      { id: 'm1', conversationId: CONV_ID },
      { clearHistoryBefore: null, hiddenMessageIds: ['m1'] }
    );

    expect(out.id).toEqual({ in: [] });
  });

  it('keeps an existing notIn alongside the hidden ids', () => {
    const out = applyPersonalHistoryHiding(
      { id: { notIn: ['m9'] } },
      { clearHistoryBefore: null, hiddenMessageIds: ['m1'] }
    );

    expect(out.id).toEqual({ notIn: ['m9', 'm1'] });
  });

  it('does not mutate the where clause it is given', () => {
    const where = { conversationId: CONV_ID, createdAt: { lt: new Date('2026-06-01') } };
    const snapshot = JSON.stringify(where);

    applyPersonalHistoryHiding(where, {
      clearHistoryBefore: new Date('2026-01-01'),
      hiddenMessageIds: ['m1'],
    });

    expect(JSON.stringify(where)).toBe(snapshot);
  });
});

describe('loadPersonalHistoryHiding', () => {
  it('returns the empty value for an anonymous caller without querying', async () => {
    const prisma = makePrisma({});

    const out = await loadPersonalHistoryHiding(prisma as never, {
      userId: undefined,
      conversationId: CONV_ID,
    });

    expect(out).toBe(NO_PERSONAL_HIDING);
    expect(prisma.userConversationPreferences.findFirst).not.toHaveBeenCalled();
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('reads the cutoff and the per-conversation hidden ids', async () => {
    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    const prisma = makePrisma({
      prefs: { clearHistoryBefore: cutoff },
      deletions: [{ messageId: 'm1' }, { messageId: 'm2' }],
    });

    const out = await loadPersonalHistoryHiding(prisma as never, {
      userId: USER_ID,
      conversationId: CONV_ID,
    });

    expect(out).toEqual({ clearHistoryBefore: cutoff, hiddenMessageIds: ['m1', 'm2'] });
  });

  it('scopes the deletion lookup to the conversation being read', async () => {
    const prisma = makePrisma({ deletions: [] });

    await loadPersonalHistoryHiding(prisma as never, {
      userId: USER_ID,
      conversationId: CONV_ID,
    });

    expect(prisma.userMessageDeletion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, message: { conversationId: CONV_ID } },
      })
    );
  });

  it('degrades to hiding nothing rather than failing the read when the lookup throws', async () => {
    const prisma = {
      userConversationPreferences: {
        findFirst: jest.fn(async (_args: unknown) => {
          throw new Error('mongo down');
        }),
      },
      userMessageDeletion: { findMany: jest.fn(async (_args: unknown) => []) },
    };

    await expect(
      loadPersonalHistoryHiding(prisma as never, { userId: USER_ID, conversationId: CONV_ID })
    ).resolves.toBe(NO_PERSONAL_HIDING);
  });
});

describe('loadPersonalHistoryHidingByConversation', () => {
  it('returns one entry per conversation that hides something, and nothing else', async () => {
    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    const other = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const prisma = makePrisma({
      prefsMany: [
        { conversationId: CONV_ID, clearHistoryBefore: cutoff },
        { conversationId: other, clearHistoryBefore: null },
      ],
      deletions: [{ messageId: 'm1', message: { conversationId: other } }],
    });

    const map = await loadPersonalHistoryHidingByConversation(prisma as never, {
      userId: USER_ID,
      conversationIds: [CONV_ID, other],
    });

    expect(map.get(CONV_ID)).toEqual({ clearHistoryBefore: cutoff, hiddenMessageIds: [] });
    expect(map.get(other)).toEqual({ clearHistoryBefore: null, hiddenMessageIds: ['m1'] });
  });

  it('returns an empty map for an anonymous caller without querying', async () => {
    const prisma = makePrisma({});

    const map = await loadPersonalHistoryHidingByConversation(prisma as never, {
      userId: undefined,
      conversationIds: [CONV_ID],
    });

    expect(map.size).toBe(0);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty map for an empty conversation list without querying', async () => {
    const prisma = makePrisma({});

    const map = await loadPersonalHistoryHidingByConversation(prisma as never, {
      userId: USER_ID,
      conversationIds: [],
    });

    expect(map.size).toBe(0);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });
});

describe('hides a message from a conversation read — end to end on the where clause', () => {
  const hiding: PersonalHistoryHiding = {
    clearHistoryBefore: new Date('2026-01-01T00:00:00.000Z'),
    hiddenMessageIds: ['m2'],
  };

  it('narrows the around-mode id allowlist AND keeps its shape', () => {
    const out = applyPersonalHistoryHiding({ id: { in: ['m1', 'm2', 'm3'] } }, hiding);

    expect(out.id).toEqual({ in: ['m1', 'm3'] });
    expect(out.createdAt).toEqual({ gte: hiding.clearHistoryBefore });
  });
});
