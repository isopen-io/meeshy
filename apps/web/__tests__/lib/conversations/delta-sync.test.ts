/**
 * Témoins — valeurs pures du catch-up delta de la liste de conversations
 * (`conversationDeltaWatermark`, `mergeConversationDelta`).
 *
 * La règle testée ici est le miroir web de `ConversationSyncEngine.deltaSyncCore`
 * / `mergeDeltaConversations` (SDK iOS). Un comportement qui diverge du Swift
 * est un défaut, pas une variante.
 */

import {
  conversationDeltaWatermark,
  mergeConversationDelta,
} from '@/lib/conversations/delta-sync';
import type { Conversation } from '@/types';

const conv = (
  id: string,
  overrides: Partial<Conversation> = {}
): Conversation =>
  ({
    id,
    type: 'group',
    title: id,
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }) as unknown as Conversation;

describe('conversationDeltaWatermark', () => {
  it('returns null on an empty cache — the mount refetch is what covers a cold start', () => {
    expect(conversationDeltaWatermark([])).toBeNull();
  });

  it('returns the NEWEST updatedAt across the cache', () => {
    const watermark = conversationDeltaWatermark([
      conv('a', { updatedAt: new Date('2026-08-01T10:00:00.000Z') }),
      conv('b', { updatedAt: new Date('2026-08-01T12:00:00.000Z') }),
      conv('c', { updatedAt: new Date('2026-08-01T11:00:00.000Z') }),
    ]);
    expect(watermark?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
  });

  it('accepts ISO strings — the persisted IndexedDB cache rehydrates dates as strings', () => {
    const watermark = conversationDeltaWatermark([
      { ...conv('a'), updatedAt: '2026-08-01T09:00:00.000Z' } as unknown as Conversation,
      { ...conv('b'), updatedAt: '2026-08-01T15:30:00.000Z' } as unknown as Conversation,
    ]);
    expect(watermark?.toISOString()).toBe('2026-08-01T15:30:00.000Z');
  });

  it('ignores unparseable updatedAt values instead of poisoning the watermark', () => {
    const watermark = conversationDeltaWatermark([
      { ...conv('a'), updatedAt: 'not-a-date' } as unknown as Conversation,
      conv('b', { updatedAt: new Date('2026-08-01T08:00:00.000Z') }),
    ]);
    expect(watermark?.toISOString()).toBe('2026-08-01T08:00:00.000Z');
  });

  it('returns null when NO entry carries a usable updatedAt — never falls back to the device clock', () => {
    const watermark = conversationDeltaWatermark([
      { ...conv('a'), updatedAt: undefined } as unknown as Conversation,
      { ...conv('b'), updatedAt: 'garbage' } as unknown as Conversation,
    ]);
    expect(watermark).toBeNull();
  });
});

describe('mergeConversationDelta', () => {
  it('replaces an existing conversation by id — the delta is server truth', () => {
    const existing = [conv('a', { title: 'stale', unreadCount: 0 })];
    const deltas = [conv('a', { title: 'fresh', unreadCount: 4 })];

    const { merged } = mergeConversationDelta(existing, deltas);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('fresh');
    expect(merged[0].unreadCount).toBe(4);
  });

  it('inserts a conversation created during the blind window', () => {
    const existing = [conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') })];
    const deltas = [conv('new', { lastMessageAt: new Date('2026-08-01T12:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas);

    expect(merged.map((c) => c.id)).toEqual(['new', 'a']);
  });

  it('removes a conversation the delta reports as inactive, and names it', () => {
    const existing = [conv('a'), conv('b')];
    const deltas = [conv('b', { isActive: false })];

    const { merged, removedIds } = mergeConversationDelta(existing, deltas);

    expect(merged.map((c) => c.id)).toEqual(['a']);
    expect(removedIds).toEqual(['b']);
  });

  it('does not resurrect an inactive conversation that was never cached', () => {
    const { merged, removedIds } = mergeConversationDelta(
      [conv('a')],
      [conv('ghost', { isActive: false })]
    );

    expect(merged.map((c) => c.id)).toEqual(['a']);
    expect(removedIds).toEqual([]);
  });

  it('re-sorts by lastMessageAt descending — server ordering, so page slices stay meaningful', () => {
    const existing = [
      conv('a', { lastMessageAt: new Date('2026-08-01T12:00:00.000Z') }),
      conv('b', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
    ];
    const deltas = [conv('b', { lastMessageAt: new Date('2026-08-01T14:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas);

    expect(merged.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('falls back to updatedAt for ordering when lastMessageAt is absent', () => {
    const existing = [
      { ...conv('a'), lastMessageAt: undefined, updatedAt: new Date('2026-08-01T09:00:00.000Z') } as unknown as Conversation,
    ];
    const deltas = [
      { ...conv('b'), lastMessageAt: undefined, updatedAt: new Date('2026-08-01T18:00:00.000Z') } as unknown as Conversation,
    ];

    const { merged } = mergeConversationDelta(existing, deltas);

    expect(merged.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('returns the existing list untouched on an empty delta', () => {
    const existing = [conv('a'), conv('b')];

    const { merged, removedIds } = mergeConversationDelta(existing, []);

    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
    expect(removedIds).toEqual([]);
  });

  it('never mutates the arrays it is given', () => {
    const existing = [conv('a')];
    const deltas = [conv('b')];

    mergeConversationDelta(existing, deltas);

    expect(existing.map((c) => c.id)).toEqual(['a']);
    expect(deltas.map((c) => c.id)).toEqual(['b']);
  });

  it('keeps the LAST delta when the same id appears twice in one batch', () => {
    const { merged } = mergeConversationDelta(
      [],
      [conv('a', { title: 'first' }), conv('a', { title: 'second' })]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('second');
  });
});

/**
 * Règle ajoutée par la session parallèle du même cycle (voir `tasks/todo.md`,
 * cycle 76b) : la borne de fenêtre chargée. Sans elle, une conversation inconnue
 * du cache et plus ancienne que la dernière ligne chargée entre dans la liste,
 * puis y ENTRE UNE SECONDE FOIS au `fetchNextPage` suivant, qui la rapporte à sa
 * place réelle.
 */
describe('mergeConversationDelta — borne de la fenêtre chargée', () => {
  it('ÉCARTE une inconnue plus ancienne que la fenêtre chargée tant qu\u2019il reste des pages', () => {
    const existing = [
      conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      conv('b', { lastMessageAt: new Date('2026-08-01T09:00:00.000Z') }),
    ];
    const deltas = [conv('vieille', { lastMessageAt: new Date('2026-07-01T00:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas, { hasMore: true });

    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('accepte cette même inconnue quand la liste est entièrement chargée', () => {
    const existing = [conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') })];
    const deltas = [conv('vieille', { lastMessageAt: new Date('2026-07-01T00:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas, { hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['a', 'vieille']);
  });

  it('insère sans borne quand l\u2019appelant n\u2019en fournit pas — perdre une ligne serait pire', () => {
    const existing = [conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') })];
    const deltas = [conv('vieille', { lastMessageAt: new Date('2026-07-01T00:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas);

    expect(merged.map((c) => c.id)).toEqual(['a', 'vieille']);
  });

  it('laisse entrer une inconnue RÉCENTE même s\u2019il reste des pages — elle appartient à la fenêtre', () => {
    const existing = [
      conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      conv('b', { lastMessageAt: new Date('2026-08-01T09:00:00.000Z') }),
    ];
    const deltas = [conv('neuve', { lastMessageAt: new Date('2026-08-01T14:00:00.000Z') })];

    const { merged } = mergeConversationDelta(existing, deltas, { hasMore: true });

    expect(merged.map((c) => c.id)).toEqual(['neuve', 'a', 'b']);
  });

  it('retire une inactive même hors fenêtre — un retrait n\u2019est jamais écarté', () => {
    const existing = [
      conv('a', { lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      conv('vieille', { lastMessageAt: new Date('2026-07-01T00:00:00.000Z') }),
    ];
    const deltas = [
      conv('vieille', { isActive: false, lastMessageAt: new Date('2026-07-01T00:00:00.000Z') }),
    ];

    const { merged, removedIds } = mergeConversationDelta(existing, deltas, { hasMore: true });

    expect(merged.map((c) => c.id)).toEqual(['a']);
    expect(removedIds).toEqual(['vieille']);
  });
});
