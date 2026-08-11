/**
 * Delta de la LISTE de conversations — miroir web de `deltaSyncCore` /
 * `mergeDeltaConversations` / `reconcileUnread` (SDK iOS).
 *
 * Les tests portent sur la RÈGLE, pas sur l'implémentation : un delta
 * `?updatedSince=` est upsert-only, ne remplace jamais les pages en cache,
 * et ne peut pas rallumer un non-lu déjà éteint localement.
 */

import type { Conversation } from '@meeshy/shared/types';
import {
  conversationDeltaWatermark,
  mergeConversationDeltas,
} from '@/lib/sync/conversation-list-delta';

function makeConversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    unreadCount: 0,
    ...overrides,
  };
}

describe('conversationDeltaWatermark', () => {
  it('rend le `updatedAt` le plus récent — horloge SERVEUR, jamais celle du device', () => {
    const watermark = conversationDeltaWatermark([
      makeConversation({ id: 'a', updatedAt: new Date('2026-08-01T10:00:00.000Z') }),
      makeConversation({ id: 'b', updatedAt: new Date('2026-08-01T12:00:00.000Z') }),
      makeConversation({ id: 'c', updatedAt: new Date('2026-08-01T11:00:00.000Z') }),
    ]);

    expect(watermark).toBe('2026-08-01T12:00:00.000Z');
  });

  it('rend null sur une liste vide — rien à lire en avant, le montage relit tout', () => {
    expect(conversationDeltaWatermark([])).toBeNull();
  });

  it('ignore un `updatedAt` illisible plutôt que de renvoyer une borne invalide', () => {
    const watermark = conversationDeltaWatermark([
      makeConversation({ id: 'a', updatedAt: new Date('nope') }),
      makeConversation({ id: 'b', updatedAt: new Date('2026-08-01T09:00:00.000Z') }),
    ]);

    expect(watermark).toBe('2026-08-01T09:00:00.000Z');
  });

  it('rend null quand AUCUN `updatedAt` n’est lisible', () => {
    expect(
      conversationDeltaWatermark([makeConversation({ id: 'a', updatedAt: new Date('nope') })])
    ).toBeNull();
  });
});

describe('mergeConversationDeltas', () => {
  it('rend la liste À L’IDENTIQUE quand le delta est vide — aucune écriture de cache', () => {
    const existing = [makeConversation({ id: 'a' })];

    const merged = mergeConversationDeltas({ existing, deltas: [], hasMore: false });

    expect(merged).toBe(existing);
  });

  it('remplace en place une conversation déjà en cache', () => {
    const existing = [
      makeConversation({ id: 'a', title: 'Ancien' }),
      makeConversation({ id: 'b' }),
    ];
    const deltas = [
      makeConversation({
        id: 'a',
        title: 'Nouveau',
        unreadCount: 4,
        lastMessageAt: new Date('2026-08-01T12:00:00.000Z'),
        updatedAt: new Date('2026-08-01T12:00:00.000Z'),
      }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('a');
    expect(merged[0].title).toBe('Nouveau');
    expect(merged[0].unreadCount).toBe(4);
  });

  it('RETIRE une conversation dont le delta annonce `isActive: false`', () => {
    const existing = [makeConversation({ id: 'a' }), makeConversation({ id: 'b' })];
    const deltas = [makeConversation({ id: 'a', isActive: false })];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['b']);
  });

  it('insère une conversation JAMAIS vue — créée pendant la coupure', () => {
    const existing = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T08:00:00.000Z') }),
    ];
    const deltas = [
      makeConversation({ id: 'neuve', lastMessageAt: new Date('2026-08-01T12:00:00.000Z') }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['neuve', 'a']);
  });

  it('rétablit l’ordre serveur (`lastMessageAt` décroissant) après un rattrapage', () => {
    const existing = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      makeConversation({ id: 'b', lastMessageAt: new Date('2026-08-01T09:00:00.000Z') }),
      makeConversation({ id: 'c', lastMessageAt: new Date('2026-08-01T08:00:00.000Z') }),
    ];
    const deltas = [
      makeConversation({ id: 'c', lastMessageAt: new Date('2026-08-01T13:00:00.000Z') }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('ÉCARTE une inconnue plus ancienne que la fenêtre chargée tant qu’il reste des pages', () => {
    const existing = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      makeConversation({ id: 'b', lastMessageAt: new Date('2026-08-01T09:00:00.000Z') }),
    ];
    const deltas = [
      makeConversation({ id: 'vieille', lastMessageAt: new Date('2026-07-01T00:00:00.000Z') }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: true });

    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('accepte cette même inconnue quand la liste est entièrement chargée', () => {
    const existing = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
    ];
    const deltas = [
      makeConversation({ id: 'vieille', lastMessageAt: new Date('2026-07-01T00:00:00.000Z') }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['a', 'vieille']);
  });

  it('ne rallume PAS un non-lu éteint localement quand aucun message n’est arrivé depuis', () => {
    const existing = [
      makeConversation({
        id: 'a',
        unreadCount: 0,
        lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ];
    const deltas = [
      makeConversation({
        id: 'a',
        unreadCount: 3,
        lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged[0].unreadCount).toBe(0);
  });

  it('accepte le non-lu serveur dès qu’un message PLUS RÉCENT est arrivé', () => {
    const existing = [
      makeConversation({
        id: 'a',
        unreadCount: 0,
        lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ];
    const deltas = [
      makeConversation({
        id: 'a',
        unreadCount: 3,
        lastMessageAt: new Date('2026-08-01T11:00:00.000Z'),
      }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged[0].unreadCount).toBe(3);
  });

  it('laisse passer le non-lu serveur quand le cache local en portait déjà un', () => {
    const existing = [
      makeConversation({
        id: 'a',
        unreadCount: 2,
        lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ];
    const deltas = [
      makeConversation({
        id: 'a',
        unreadCount: 5,
        lastMessageAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged[0].unreadCount).toBe(5);
  });

  it('ne perd pas une conversation en cache que le delta ne mentionne pas', () => {
    const existing = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T10:00:00.000Z') }),
      makeConversation({ id: 'b', lastMessageAt: new Date('2026-08-01T09:00:00.000Z') }),
    ];
    const deltas = [
      makeConversation({ id: 'a', lastMessageAt: new Date('2026-08-01T12:00:00.000Z') }),
    ];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: true });

    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('retire une inactive même quand elle est inconnue du cache — sans l’insérer', () => {
    const existing = [makeConversation({ id: 'a' })];
    const deltas = [makeConversation({ id: 'fantome', isActive: false })];

    const merged = mergeConversationDeltas({ existing, deltas, hasMore: false });

    expect(merged.map((c) => c.id)).toEqual(['a']);
  });
});
