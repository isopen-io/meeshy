import { describe, expect, test } from 'bun:test';

import { applyFilter, emptinessOf, orderConversations } from './filters';
import type { Conversation } from '@/lib/api/types';

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

const VIEWER = 'u-viewer';
const NO_OVERRIDES = {};

describe('applyFilter — épinglés (#5559 T6, le témoin ROUGE d’abord)', () => {
  test('filtre "pinned" ⇒ SEULE la conversation épinglée', () => {
    const amina = conversation({ id: 'c-amina', title: 'Amina', userPreferences: [{ isPinned: true }] });
    const kwame = conversation({ id: 'c-kwame', title: 'Kwame' });
    const result = applyFilter({
      conversations: [amina, kwame],
      filter: 'pinned',
      search: '',
      viewerId: VIEWER,
      overrides: NO_OVERRIDES,
    });
    expect(result).toEqual([amina]);
  });

  test("l'override d'épinglage compte aussi pour le filtre", () => {
    const kwame = conversation({ id: 'c-kwame', title: 'Kwame' });
    const result = applyFilter({
      conversations: [kwame],
      filter: 'pinned',
      search: '',
      viewerId: VIEWER,
      overrides: { 'c-kwame': { flags: { isPinned: true } } },
    });
    expect(result).toEqual([kwame]);
  });
});

describe('applyFilter — corpus archivé (#5559 T7)', () => {
  test('archivée + non lue : ABSENTE de "all" et "unread", PRÉSENTE dans "archived" seul', () => {
    const archived = conversation({
      id: 'c-kwame',
      title: 'Kwame',
      unreadCount: 3,
      userPreferences: [{ isArchived: true }],
    });
    const active = conversation({ id: 'c-amina', title: 'Amina', unreadCount: 1 });

    const all = applyFilter({ conversations: [archived, active], filter: 'all', search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(all.map((c) => c.id)).not.toContain('c-kwame');
    expect(all.map((c) => c.id)).toContain('c-amina');

    const unread = applyFilter({ conversations: [archived, active], filter: 'unread', search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(unread.map((c) => c.id)).not.toContain('c-kwame');

    const archivedTab = applyFilter({ conversations: [archived, active], filter: 'archived', search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(archivedTab.map((c) => c.id)).toEqual(['c-kwame']);
  });
});

describe('applyFilter — recherche sur le nom AFFICHÉ (#5559 T8)', () => {
  test('une directe renommée par customName est trouvée par le nom personnalisé', () => {
    const renamed = conversation({
      id: 'c-amina',
      userPreferences: [{ customName: 'Sany' }],
      participants: [
        { userId: VIEWER, displayName: 'Vous' } as Conversation['participants'][number],
        { userId: 'u-amina', displayName: 'Amina Diallo' } as Conversation['participants'][number],
      ],
    });
    const result = applyFilter({
      conversations: [renamed],
      filter: 'all',
      search: 'sany',
      viewerId: VIEWER,
      overrides: NO_OVERRIDES,
    });
    expect(result).toEqual([renamed]);

    const byOriginalName = applyFilter({
      conversations: [renamed],
      filter: 'all',
      search: 'amina',
      viewerId: VIEWER,
      overrides: NO_OVERRIDES,
    });
    expect(byOriginalName).toEqual([]);
  });
});

describe('orderConversations — épinglées d’abord (#5559 T9)', () => {
  test('épinglée en TÊTE même avec le lastMessageAt le plus ancien', () => {
    const old = conversation({ id: 'c-old', title: 'Ancienne', lastMessageAt: new Date('2020-01-01'), userPreferences: [{ isPinned: true }] });
    const recent = conversation({ id: 'c-recent', title: 'Récente', lastMessageAt: new Date('2026-01-01') });
    const ordered = orderConversations([recent, old], NO_OVERRIDES);
    expect(ordered.map((c) => c.id)).toEqual(['c-old', 'c-recent']);
  });

  test('à épinglage égal, lastMessageAt desc', () => {
    const older = conversation({ id: 'c-a', lastMessageAt: new Date('2026-01-01') });
    const newer = conversation({ id: 'c-b', lastMessageAt: new Date('2026-02-01') });
    const ordered = orderConversations([older, newer], NO_OVERRIDES);
    expect(ordered.map((c) => c.id)).toEqual(['c-b', 'c-a']);
  });

  test("une conversation épinglée par OVERRIDE monte, pas seulement par le wire", () => {
    const old = conversation({ id: 'c-old', lastMessageAt: new Date('2020-01-01') });
    const recent = conversation({ id: 'c-recent', lastMessageAt: new Date('2026-01-01') });
    const ordered = orderConversations([recent, old], { 'c-old': { flags: { isPinned: true } } });
    expect(ordered.map((c) => c.id)).toEqual(['c-old', 'c-recent']);
  });
});

describe('emptinessOf — deux états DISTINCTS (#5559 T15)', () => {
  test('corpus vide ⇒ empty-corpus', () => {
    expect(emptinessOf([], [])).toBe('empty-corpus');
  });

  test('corpus non vide + filtre sans résultat ⇒ empty-filter', () => {
    expect(emptinessOf([conversation({ id: 'c1' })], [])).toBe('empty-filter');
  });

  test('corpus non vide + résultats visibles ⇒ none', () => {
    const c = conversation({ id: 'c1' });
    expect(emptinessOf([c], [c])).toBe('none');
  });
});
