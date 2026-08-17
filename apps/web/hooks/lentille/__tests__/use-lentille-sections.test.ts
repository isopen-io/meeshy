/**
 * WL-105 (LWS-10) — adaptateur de sectionnement Lentille.
 *
 * Vérifie l'ADAPTATION web → loi partagée (`resolveConversationSections`,
 * LWS-1) : la loi elle-même est déjà vectorisée côté `packages/shared`,
 * cette suite ne la re-teste pas — elle prouve seulement que
 * `preferencesMap`/`categories` alimentent les bons champs et que l'ordre
 * de sortie reprojette les VRAIES `Conversation`.
 */
import { renderHook } from '@testing-library/react';
import { useLentilleSections } from '../use-lentille-sections';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationCategory, UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

const conv = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    type: 'group',
    title: id,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    lastMessageAt: new Date('2026-08-16T10:00:00.000Z'),
    ...overrides,
  }) as unknown as Conversation;

const prefs = (overrides: Partial<UserConversationPreferences>): UserConversationPreferences =>
  ({
    id: 'p', userId: 'u', conversationId: 'c',
    isPinned: false, isMuted: false, isArchived: false, tags: [],
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }) as UserConversationPreferences;

describe('useLentilleSections', () => {
  it('classe une conversation épinglée dans `pinned`, via preferencesMap (jamais un champ de Conversation)', () => {
    const conversations = [conv('a'), conv('b')];
    const preferencesMap = new Map([['a', prefs({ isPinned: true })]]);

    const { result } = renderHook(() =>
      useLentilleSections({
        conversations,
        preferencesMap,
        categories: [],
        now: new Date('2026-08-16T12:00:00.000Z'),
        locale: 'fr-FR',
        timeZone: 'UTC',
      })
    );

    const pinnedSection = result.current.find((s) => s.kind === 'pinned');
    expect(pinnedSection?.conversations.map((c) => c.id)).toEqual(['a']);
  });

  it('respecte l’ordre des catégories déclaré (par `order`, pas l’ordre du Map)', () => {
    const conversations = [conv('a'), conv('b')];
    const preferencesMap = new Map([
      ['a', prefs({ categoryId: 'cat-2' })],
      ['b', prefs({ categoryId: 'cat-1' })],
    ]);
    const categories: UserConversationCategory[] = [
      { id: 'cat-2', userId: 'u', name: 'Deux', order: 1, isExpanded: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 'cat-1', userId: 'u', name: 'Un', order: 0, isExpanded: true, createdAt: new Date(), updatedAt: new Date() },
    ];

    const { result } = renderHook(() =>
      useLentilleSections({
        conversations,
        preferencesMap,
        categories,
        now: new Date('2026-08-16T12:00:00.000Z'),
        locale: 'fr-FR',
        timeZone: 'UTC',
      })
    );

    const categorySections = result.current.filter((s) => s.kind === 'category');
    expect(categorySections.map((s) => s.categoryId)).toEqual(['cat-1', 'cat-2']);
  });

  it('reprojette les VRAIES Conversation (référence identique, pas une copie)', () => {
    const a = conv('a');
    const { result } = renderHook(() =>
      useLentilleSections({
        conversations: [a],
        preferencesMap: new Map(),
        categories: [],
        now: new Date('2026-08-16T12:00:00.000Z'),
        locale: 'fr-FR',
        timeZone: 'UTC',
      })
    );

    const allConversations = result.current.flatMap((s) => s.conversations);
    expect(allConversations[0]).toBe(a);
  });

  it('aucune section vide : sans conversation live/pinned, ces sections sont absentes', () => {
    const { result } = renderHook(() =>
      useLentilleSections({
        conversations: [conv('a')],
        preferencesMap: new Map(),
        categories: [],
        now: new Date('2026-08-16T12:00:00.000Z'),
        locale: 'fr-FR',
        timeZone: 'UTC',
      })
    );

    expect(result.current.some((s) => s.kind === 'pinned')).toBe(false);
    expect(result.current.some((s) => s.kind === 'live')).toBe(false);
  });
});
