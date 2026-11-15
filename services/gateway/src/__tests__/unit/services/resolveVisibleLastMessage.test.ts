/**
 * `resolveVisibleLastMessages` — the conversation-list preview under the
 * reader's own hiding.
 *
 * The behaviour that matters is the DIFFERENCE between the two hiding features
 * on the same code path: after a `delete-for-me` on the last message the row
 * must fall back to the previous one, while after a `clear-history` it must go
 * blank — and neither may cost anything to a reader who hid nothing.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { resolveVisibleLastMessages } from '../../../services/resolveVisibleLastMessage';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CONV_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const SELECT = { query: { select: { id: true, content: true } } } as const;

const makePrisma = (over: {
  deletions?: Array<{ messageId: string }>;
  cutoffs?: Array<{ conversationId: string; clearHistoryBefore: Date | null }>;
  nextVisible?: unknown;
}) => ({
  userMessageDeletion: {
    findMany: jest.fn(async (_args: unknown) => over.deletions ?? []),
  },
  userConversationPreferences: {
    findMany: jest.fn(async (_args: unknown) => over.cutoffs ?? []),
  },
  message: {
    findFirst: jest.fn(async (_args: unknown) => over.nextVisible ?? null),
  },
});

describe('resolveVisibleLastMessages', () => {
  it('returns no replacement — and issues no query — for an anonymous reader', async () => {
    const prisma = makePrisma({});

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: null,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(out.size).toBe(0);
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('returns no replacement when the reader has hidden nothing', async () => {
    const prisma = makePrisma({ deletions: [] });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(out.size).toBe(0);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('scopes the deletion lookup to the previews on the page, not the whole account', async () => {
    const prisma = makePrisma({ deletions: [] });

    await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
        { conversationId: CONV_B, message: { id: 'm2', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(prisma.userMessageDeletion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, messageId: { in: ['m1', 'm2'] } } })
    );
  });

  it('falls back to the previous message when the preview was deleted for this reader', async () => {
    const previous = { id: 'm0', content: 'the one before' };
    const prisma = makePrisma({ deletions: [{ messageId: 'm1' }], nextVisible: previous });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(out.get(CONV_A)).toBe(previous);
  });

  it('blanks the preview when nothing older survives the hiding', async () => {
    const prisma = makePrisma({ deletions: [{ messageId: 'm1' }], nextVisible: null });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(out.has(CONV_A)).toBe(true);
    expect(out.get(CONV_A)).toBeNull();
  });

  it('hides a preview older than the caller-supplied clear-history cut-off', async () => {
    const prisma = makePrisma({ deletions: [], nextVisible: null });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        {
          conversationId: CONV_A,
          message: { id: 'm1', createdAt: new Date('2025-01-01T00:00:00.000Z') },
          clearHistoryBefore: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      ...SELECT,
    });

    expect(out.get(CONV_A)).toBeNull();
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });

  it('keeps a preview at the cut-off instant — the cut-off hides what is STRICTLY older', async () => {
    const cutoff = new Date('2026-01-01T00:00:00.000Z');
    const prisma = makePrisma({ deletions: [] });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: cutoff }, clearHistoryBefore: cutoff },
      ],
      ...SELECT,
    });

    expect(out.size).toBe(0);
  });

  it('loads the cut-offs itself when the caller did not select the preferences row', async () => {
    const prisma = makePrisma({
      deletions: [],
      cutoffs: [{ conversationId: CONV_A, clearHistoryBefore: new Date('2026-01-01T00:00:00.000Z') }],
      nextVisible: null,
    });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date('2025-01-01T00:00:00.000Z') } },
      ],
      ...SELECT,
    });

    expect(prisma.userConversationPreferences.findMany).toHaveBeenCalled();
    expect(out.get(CONV_A)).toBeNull();
  });

  it('ignores conversations that have no message at all', async () => {
    const prisma = makePrisma({});

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [{ conversationId: CONV_A, message: null, clearHistoryBefore: null }],
      ...SELECT,
    });

    expect(out.size).toBe(0);
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('serves the unfiltered preview rather than failing the list when the lookup throws', async () => {
    const prisma = {
      userMessageDeletion: {
        findMany: jest.fn(async (_args: unknown) => {
          throw new Error('mongo down');
        }),
      },
      userConversationPreferences: { findMany: jest.fn(async (_args: unknown) => []) },
      message: { findFirst: jest.fn(async (_args: unknown) => null) },
    };

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      ...SELECT,
    });

    expect(out.size).toBe(0);
  });

  it('passes the caller projection through verbatim, in either form', async () => {
    const prisma = makePrisma({ deletions: [{ messageId: 'm1' }], nextVisible: { id: 'm0' } });

    await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm1', createdAt: new Date() }, clearHistoryBefore: null },
      ],
      query: { include: { sender: true } },
    });

    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { sender: true } })
    );
  });
});

// ─── Le plancher d'historique ────────────────────────────────────────────────
//
// Le dernier message GLOBAL d'un salon peut précéder l'arrivée du lecteur : un
// membre ajouté après coup, un anonyme entré par un lien sans historique, un
// inscrit dans le salon global. `historyFloors` porte le plancher par
// conversation (`services/historyFloor`) ; la reprise cherche le dernier
// message DEPUIS ce plancher, sous le masquage personnel s'il y en a un.

describe('resolveVisibleLastMessages — plancher d’historique', () => {
  const JOINED = new Date('2026-06-15T00:00:00.000Z');
  const BEFORE_JOIN = new Date('2026-06-01T00:00:00.000Z');
  const AFTER_JOIN = new Date('2026-07-01T00:00:00.000Z');

  it('reprend depuis le plancher quand l’aperçu global le précède', async () => {
    const since = { id: 'm-since', content: 'depuis mon arrivée' };
    const prisma = makePrisma({ deletions: [], nextVisible: since });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [{ conversationId: CONV_A, message: { id: 'm-old', createdAt: BEFORE_JOIN }, clearHistoryBefore: null }],
      historyFloors: new Map([[CONV_A, JOINED]]),
      ...SELECT,
    });

    expect(out.get(CONV_A)).toBe(since);
    expect(prisma.message.findFirst.mock.calls[0][0]).toMatchObject({
      where: { conversationId: CONV_A, deletedAt: null, createdAt: { gte: JOINED } },
    });
  });

  it('borne aussi un lecteur SANS compte — sans sonder les tables de masquage', async () => {
    const prisma = makePrisma({ nextVisible: null });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: null,
      candidates: [{ conversationId: CONV_A, message: { id: 'm-old', createdAt: BEFORE_JOIN }, clearHistoryBefore: null }],
      historyFloors: new Map([[CONV_A, JOINED]]),
      ...SELECT,
    });

    expect(out.has(CONV_A)).toBe(true);
    expect(out.get(CONV_A)).toBeNull();
    expect(prisma.userMessageDeletion.findMany).not.toHaveBeenCalled();
    expect(prisma.message.findFirst.mock.calls[0][0].where.createdAt).toEqual({ gte: JOINED });
  });

  it('laisse intact un aperçu écrit APRÈS le plancher', async () => {
    const prisma = makePrisma({ deletions: [] });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [{ conversationId: CONV_A, message: { id: 'm-new', createdAt: AFTER_JOIN }, clearHistoryBefore: null }],
      historyFloors: new Map([[CONV_A, JOINED]]),
      ...SELECT,
    });

    expect(out.size).toBe(0);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('ne borne que les conversations qui ont un plancher', async () => {
    const prisma = makePrisma({ deletions: [], nextVisible: null });

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm-a', createdAt: BEFORE_JOIN }, clearHistoryBefore: null },
        { conversationId: CONV_B, message: { id: 'm-b', createdAt: BEFORE_JOIN }, clearHistoryBefore: null },
      ],
      historyFloors: new Map([[CONV_A, JOINED]]),
      ...SELECT,
    });

    expect([...out.keys()]).toEqual([CONV_A]);
  });

  it('dégrade FERMÉ sous un plancher quand la sonde échoue — « rien » plutôt que l’avant-arrivée', async () => {
    const prisma = {
      userMessageDeletion: { findMany: jest.fn(async () => { throw new Error('mongo down'); }) },
      userConversationPreferences: { findMany: jest.fn(async () => []) },
      message: { findFirst: jest.fn(async () => null) },
    };

    const out = await resolveVisibleLastMessages(prisma as never, {
      userId: USER_ID,
      candidates: [
        { conversationId: CONV_A, message: { id: 'm-a', createdAt: BEFORE_JOIN }, clearHistoryBefore: null },
        { conversationId: CONV_B, message: { id: 'm-b', createdAt: BEFORE_JOIN }, clearHistoryBefore: null },
      ],
      historyFloors: new Map([[CONV_A, JOINED]]),
      ...SELECT,
    });

    // Sous plancher : aperçu retiré. Sans plancher : l'aperçu global, comme avant.
    expect(out.has(CONV_A)).toBe(true);
    expect(out.get(CONV_A)).toBeNull();
    expect(out.has(CONV_B)).toBe(false);
  });
});
