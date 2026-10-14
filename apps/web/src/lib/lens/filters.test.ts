import { describe, expect, test } from 'bun:test';

import { applyFilter, emptinessOf, filterLabel, LIST_FILTERS, NEUTRAL_SELECTION, orderConversations, selectionLabel, toggleFilter, type ListSelection } from './filters';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
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
      selection: ['pinned'],
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
      selection: ['pinned'],
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

    const all = applyFilter({ conversations: [archived, active], selection: ['all'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(all.map((c) => c.id)).not.toContain('c-kwame');
    expect(all.map((c) => c.id)).toContain('c-amina');

    const unread = applyFilter({ conversations: [archived, active], selection: ['unread'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(unread.map((c) => c.id)).not.toContain('c-kwame');

    const archivedTab = applyFilter({ conversations: [archived, active], selection: ['archived'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(archivedTab.map((c) => c.id)).toEqual(['c-kwame']);
  });

  /* #9928 — Meeshy Global fermée en écriture à un mineur : la passerelle la
     sert archivée, et le client suit la restriction même si une préférence ou
     un override disait le contraire — elle revient d'elle-même à ses 18 ans. */
  test('Global fermée à un mineur vit dans les archives, quoi que disent la préférence ou un override', () => {
    const global = conversation({ id: 'c-global', type: 'global', identifier: 'meeshy', viewerWriteRestriction: 'minor-global' });
    const run = (filter: 'all' | 'archived', overrides = NO_OVERRIDES) =>
      applyFilter({ conversations: [global], selection: [filter], search: '', viewerId: VIEWER, overrides }).map((c) => c.id);

    expect(run('all')).toEqual([]);
    expect(run('archived')).toEqual(['c-global']);
    expect(run('all', { 'c-global': { flags: { isArchived: false } } })).toEqual([]);
  });

  test('Global sans restriction servie reste dans la liste', () => {
    const global = conversation({ id: 'c-global', type: 'global', identifier: 'meeshy', viewerWriteRestriction: null });
    expect(applyFilter({ conversations: [global], selection: ['all'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES }).map((c) => c.id)).toEqual(['c-global']);
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
      selection: ['all'],
      search: 'sany',
      viewerId: VIEWER,
      overrides: NO_OVERRIDES,
    });
    expect(result).toEqual([renamed]);

    const byOriginalName = applyFilter({
      conversations: [renamed],
      selection: ['all'],
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

describe('applyFilter — favoris (#10593, `.favoris` d’iOS : un emoji posé)', () => {
  test('« favorites » ne rend que les conversations qui portent un favori, hors archives', () => {
    const conversations = [
      conversation({ id: 'fav', userPreferences: [{ reaction: '🔥' }] }),
      conversation({ id: 'plain', userPreferences: [{ reaction: null }] }),
      conversation({ id: 'fav-archived', userPreferences: [{ reaction: '⭐️', isArchived: true }] }),
    ];
    const kept = applyFilter({ conversations, selection: ['favorites'], search: '', viewerId: 'me', overrides: {} });
    expect(kept.map((c) => c.id)).toEqual(['fav']);
  });

  test('les puces suivent l’ordre d’iOS (`MeeshyConversationFilter.allCases`), « Épinglés » du web avant les archives', () => {
    expect(LIST_FILTERS).toEqual(['all', 'unread', 'personal', 'private', 'open', 'global', 'channels', 'favorites', 'pinned', 'archived']);
  });

  test('les puces parlent la langue d’interface', async () => {
    await loadRowMenuCatalog('en');
    expect(LIST_FILTERS.map((f) => filterLabel(f, 'fr'))).toEqual([
      'Tous',
      'Non lus',
      'Personnel',
      'Privée',
      'Ouvertes',
      'Globales',
      'Channels',
      'Favoris',
      'Épinglés',
      'Archivées',
    ]);
    expect(filterLabel('favorites', 'en')).toBe('Favorites');
    expect(filterLabel('open', 'en')).toBe('Open');
  });
});

/**
 * LES FILTRES SE COMPOSENT (#10598) — la loi d'iOS
 * (`ConversationFilterComposition.swift`, `ConversationListViewModel.swift:576-626`) :
 * deux filtres du même axe s'ADDITIONNENT, deux filtres d'axes différents se
 * CROISENT, « Tous » est l'absence de filtre, les archives changent de corpus.
 */
describe('toggleFilter — un appui pose, un second retire (#10598)', () => {
  test('poser un filtre efface « Tous »', () => {
    expect(toggleFilter('unread', NEUTRAL_SELECTION)).toEqual(['unread']);
  });

  test('un second filtre s’AJOUTE, rangé dans l’ordre des puces', () => {
    expect(toggleFilter('unread', ['personal'])).toEqual(['unread', 'personal']);
  });

  test('un second appui retire le filtre', () => {
    expect(toggleFilter('personal', ['unread', 'personal'])).toEqual(['unread']);
  });

  test('retirer le dernier filtre rend « Tous », jamais une sélection vide', () => {
    expect(toggleFilter('unread', ['unread'])).toEqual(NEUTRAL_SELECTION);
  });

  test('« Tous » efface tout le reste', () => {
    expect(toggleFilter('all', ['unread', 'private', 'archived'])).toEqual(NEUTRAL_SELECTION);
  });
});

describe('applyFilter — les types s’ADDITIONNENT, les états se CROISENT (#10598)', () => {
  const direct = conversation({ id: 'direct', type: 'direct', unreadCount: 2 });
  const group = conversation({ id: 'group', type: 'group' });
  const open = conversation({ id: 'open', type: 'public', unreadCount: 1 });
  const world = conversation({ id: 'world', type: 'global', unreadCount: 4, userPreferences: [{ reaction: '⭐️' }] });
  const channel = conversation({ id: 'channel', type: 'group', isAnnouncementChannel: true });
  const corpus = [direct, group, open, world, channel];
  const run = (selection: ListSelection) =>
    applyFilter({ conversations: corpus, selection, search: '', viewerId: VIEWER, overrides: NO_OVERRIDES }).map((c) => c.id);

  test('chaque type retient sa nature, comme iOS', () => {
    expect(run(['personal'])).toEqual(['direct']);
    expect(run(['private'])).toEqual(['group', 'channel']);
    expect(run(['open'])).toEqual(['open']);
    expect(run(['global'])).toEqual(['world']);
    expect(run(['channels'])).toEqual(['channel']);
  });

  test('deux types ⇒ un OU : « Personnel + Ouvertes » rend les deux, jamais rien', () => {
    expect(run(['personal', 'open'])).toEqual(['direct', 'open']);
  });

  test('un type et un état ⇒ un ET : « Non lus » parmi les directs', () => {
    expect(run(['unread', 'personal'])).toEqual(['direct']);
  });

  test('deux états ⇒ un ET : « Non lus + Favoris »', () => {
    expect(run(['unread', 'favorites'])).toEqual(['world']);
  });

  test('« Épinglés » est un état : il se croise avec les types', () => {
    const pinnedGroup = conversation({ id: 'pinned-group', type: 'group', userPreferences: [{ isPinned: true }] });
    const pinnedDirect = conversation({ id: 'pinned-direct', type: 'direct', userPreferences: [{ isPinned: true }] });
    const kept = applyFilter({ conversations: [pinnedGroup, pinnedDirect, group], selection: ['private', 'pinned'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(kept.map((c) => c.id)).toEqual(['pinned-group']);
  });

  test('« Archivées » change de corpus et se compose avec un type : les groupes archivés', () => {
    const archivedGroup = conversation({ id: 'archived-group', type: 'group', userPreferences: [{ isArchived: true }] });
    const archivedDirect = conversation({ id: 'archived-direct', type: 'direct', userPreferences: [{ isArchived: true }] });
    const kept = applyFilter({ conversations: [archivedGroup, archivedDirect, group], selection: ['private', 'archived'], search: '', viewerId: VIEWER, overrides: NO_OVERRIDES });
    expect(kept.map((c) => c.id)).toEqual(['archived-group']);
  });

  test('une sélection vide vaut « Tous »', () => {
    expect(run([])).toEqual(corpus.map((c) => c.id));
  });
});

describe('selectionLabel — l’état vide nomme la sélection composée (#10598)', () => {
  test('les libellés se suivent dans l’ordre des puces', async () => {
    await loadRowMenuCatalog('fr');
    expect(selectionLabel(['unread', 'personal'], 'fr')).toBe('Non lus · Personnel');
    expect(selectionLabel(NEUTRAL_SELECTION, 'fr')).toBe('Tous');
  });
});
