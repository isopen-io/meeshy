/**
 * Témoins — règles pures du delta-sync de la liste de conversations.
 *
 * Jumeau de `ConversationSyncEngineTests` / `SyncWatermarkTests` (SDK iOS).
 * Une divergence de comportement avec le Swift est un défaut, pas une variante.
 */

import {
  conversationDeltaWatermark,
  mergeDeltaConversations,
  reconcileDeltaUnread,
  sortConversationsByRecency,
} from '@/lib/conversations/delta-merge';
import type { Conversation } from '@meeshy/shared/types';

const conv = (
  id: string,
  overrides: Partial<Conversation> = {}
): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as Conversation;

describe('mergeDeltaConversations', () => {
  it('replaces an existing conversation with the delta row', () => {
    const existing = [conv('a', { title: 'stale' }), conv('b')];
    const { merged } = mergeDeltaConversations(existing, [conv('a', { title: 'fresh' })]);

    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
    expect(merged[0].title).toBe('fresh');
  });

  it('inserts a conversation the cache had never seen', () => {
    const { merged } = mergeDeltaConversations([conv('a')], [conv('new')]);

    expect(merged.map((c) => c.id)).toEqual(['a', 'new']);
  });

  it('leaves a conversation untouched by the delta strictly identical', () => {
    const untouched = conv('b');
    const { merged } = mergeDeltaConversations([conv('a'), untouched], [conv('a')]);

    expect(merged[1]).toBe(untouched);
  });

  it('removes an inactive delta row and reports its id', () => {
    const { merged, removedIds } = mergeDeltaConversations(
      [conv('a'), conv('gone')],
      [conv('gone', { isActive: false })]
    );

    expect(merged.map((c) => c.id)).toEqual(['a']);
    expect(removedIds).toEqual(['gone']);
  });

  it('reports nothing removed when every delta row is active', () => {
    const { removedIds } = mergeDeltaConversations([conv('a')], [conv('a')]);

    expect(removedIds).toEqual([]);
  });

  it('returns the cache untouched for an empty delta', () => {
    const existing = [conv('a'), conv('b')];
    const { merged } = mergeDeltaConversations(existing, []);

    expect(merged).toEqual(existing);
  });

  it('forces the open conversation to zero unread, whatever the server says', () => {
    const { merged } = mergeDeltaConversations(
      [conv('open', { unreadCount: 0 })],
      [
        conv('open', {
          unreadCount: 4,
          lastMessageAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      ],
      { openConversationId: 'open' }
    );

    expect(merged[0].unreadCount).toBe(0);
  });
});

describe('reconcileDeltaUnread', () => {
  it('takes the server count when it lowers the badge (read on another device)', () => {
    const local = conv('a', { unreadCount: 3 });
    const incoming = conv('a', { unreadCount: 0 });

    expect(reconcileDeltaUnread(incoming, local).unreadCount).toBe(0);
  });

  it('takes the server count when a newer message came with it', () => {
    const local = conv('a', {
      unreadCount: 0,
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const incoming = conv('a', {
      unreadCount: 2,
      lastMessageAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(reconcileDeltaUnread(incoming, local).unreadCount).toBe(2);
  });

  it('keeps the locally-cleared badge when the server raises it without a newer message', () => {
    const local = conv('a', {
      unreadCount: 0,
      lastMessageAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const incoming = conv('a', {
      unreadCount: 5,
      lastMessageAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(reconcileDeltaUnread(incoming, local).unreadCount).toBe(0);
  });

  it('takes the server count when the cache holds no local row', () => {
    const incoming = conv('a', { unreadCount: 7 });

    expect(reconcileDeltaUnread(incoming, undefined).unreadCount).toBe(7);
  });

  it('keeps every other field of the server row', () => {
    const local = conv('a', { unreadCount: 0, title: 'stale' });
    const incoming = conv('a', { unreadCount: 5, title: 'fresh' });

    expect(reconcileDeltaUnread(incoming, local).title).toBe('fresh');
  });
});

describe('sortConversationsByRecency', () => {
  it('orders by lastMessageAt, newest first', () => {
    const sorted = sortConversationsByRecency([
      conv('old', { lastMessageAt: new Date('2026-01-01T00:00:00.000Z') }),
      conv('new', { lastMessageAt: new Date('2026-03-01T00:00:00.000Z') }),
      conv('mid', { lastMessageAt: new Date('2026-02-01T00:00:00.000Z') }),
    ]);

    expect(sorted.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('falls back to updatedAt when a conversation carries no message', () => {
    const sorted = sortConversationsByRecency([
      conv('withMessage', { lastMessageAt: new Date('2026-01-01T00:00:00.000Z') }),
      conv('empty', {
        lastMessageAt: undefined,
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ]);

    expect(sorted.map((c) => c.id)).toEqual(['empty', 'withMessage']);
  });

  it('is stable for equal timestamps', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const sorted = sortConversationsByRecency([
      conv('first', { lastMessageAt: at }),
      conv('second', { lastMessageAt: at }),
    ]);

    expect(sorted.map((c) => c.id)).toEqual(['first', 'second']);
  });
});

describe('conversationDeltaWatermark', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('is the newest server updatedAt held in cache', () => {
    const watermark = conversationDeltaWatermark(
      [
        conv('a', { updatedAt: new Date('2026-05-01T00:00:00.000Z') }),
        conv('b', { updatedAt: new Date('2026-05-20T10:30:00.000Z') }),
      ],
      now
    );

    expect(watermark).toBe('2026-05-20T10:30:00.000Z');
  });

  it('is null on an empty cache — nothing to read forward from', () => {
    expect(conversationDeltaWatermark([], now)).toBeNull();
  });

  it('never points into the future (a poisoned row only ever widens the window)', () => {
    const watermark = conversationDeltaWatermark(
      [conv('skewed', { updatedAt: new Date('2027-01-01T00:00:00.000Z') })],
      now
    );

    expect(watermark).toBe(now.toISOString());
  });

  it('ignores an unparseable timestamp rather than poisoning the cursor', () => {
    const watermark = conversationDeltaWatermark(
      [
        conv('broken', { updatedAt: new Date('not-a-date') }),
        conv('good', { updatedAt: new Date('2026-05-01T00:00:00.000Z') }),
      ],
      now
    );

    expect(watermark).toBe('2026-05-01T00:00:00.000Z');
  });

  it('accepts ISO strings, which is what a persisted cache rehydrates as', () => {
    const rehydrated = [
      conv('a', { updatedAt: '2026-05-02T08:00:00.000Z' as unknown as Date }),
    ];

    expect(conversationDeltaWatermark(rehydrated, now)).toBe('2026-05-02T08:00:00.000Z');
  });
});
