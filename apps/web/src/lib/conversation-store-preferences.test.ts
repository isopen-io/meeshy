import { describe, expect, test } from 'bun:test';

import { categoryIdOf, customNameOf, reactionOf } from './api/preferences';
import type { Conversation } from './api/types';
import { createConversationStore, withPreferenceOverrides } from './conversation-store';

/**
 * LES PRÉFÉRENCES D'UN LECTEUR SUR UNE CONVERSATION (#10593) — favori,
 * catégorie, nom personnel. Le store en garde la correction OPTIMISTE, et la
 * liste lit la conversation EFFECTIVE : wire fusionné à l'override.
 */
const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }) as Conversation;

describe('setPreference — la conversation effective porte la correction', () => {
  test('un favori posé se lit aussitôt, le wire n’en avait pas', () => {
    const store = createConversationStore();
    const c = conversation({ userPreferences: [{ isPinned: true }] });
    store.getState().setPreference(c.id, { reaction: '🔥' });
    const [effective] = withPreferenceOverrides([c], store.getState().overrides);
    expect(effective === undefined ? undefined : reactionOf(effective)).toBe('🔥');
    expect(effective?.userPreferences).toEqual([{ isPinned: true, reaction: '🔥' }]);
  });

  test('null RETIRE la valeur du wire : favori retiré, catégorie vidée, nom d’origine rendu', () => {
    const store = createConversationStore();
    const c = conversation({ userPreferences: [{ reaction: '⭐️', categoryId: 'cat-1', customName: 'Les copains' }] });
    store.getState().setPreference(c.id, { reaction: null });
    store.getState().setPreference(c.id, { categoryId: null });
    store.getState().setPreference(c.id, { customName: null });
    const [effective] = withPreferenceOverrides([c], store.getState().overrides);
    expect(effective === undefined ? [] : [reactionOf(effective), categoryIdOf(effective), customNameOf(effective)]).toEqual([undefined, undefined, undefined]);
  });

  test('sans correction de préférence, la MÊME liste et les MÊMES objets reviennent — aucune rangée ne se repeint', () => {
    const store = createConversationStore();
    const list = [conversation({ id: 'a' }), conversation({ id: 'b' })];
    store.getState().togglePin('a', false);
    expect(withPreferenceOverrides(list, store.getState().overrides)).toBe(list);
    store.getState().setPreference('b', { categoryId: 'cat-1' });
    const next = withPreferenceOverrides(list, store.getState().overrides);
    expect(next[0]).toBe(list[0]);
    expect(next[1]).not.toBe(list[1]);
  });

  test('clearOverride retire la clé nommée et garde les autres', () => {
    const store = createConversationStore();
    store.getState().setPreference('c1', { reaction: '💎' });
    store.getState().setPreference('c1', { categoryId: 'cat-2' });
    store.getState().togglePin('c1', false);
    store.getState().clearOverride('c1', ['reaction']);
    expect(store.getState().overrides['c1']).toEqual({ flags: { isPinned: true }, preferences: { categoryId: 'cat-2' } });
    store.getState().clearOverride('c1', ['categoryId', 'isPinned']);
    expect(store.getState().overrides['c1']).toBeUndefined();
  });
});
