import { describe, expect, test } from 'bun:test';

import {
  MAX_RAIL_ENTRIES,
  railStoryGroups,
  ringIsAccented,
  shouldRenderEntries,
  shouldRenderRail,
  visibleEntries,
  type RailEntry,
} from './rail-policy';
import type { StoryGroup } from '@/lib/api/stories';

/**
 * MIROIR VECTEUR À VECTEUR de `LentilleRailPolicyTests`
 * (`StoriesVivantsRail.swift:121-152`) — les QUATRE vecteurs que l'issue
 * #5652 nomme comme critère de fin.
 */

const entry = (partial: Partial<RailEntry> & { readonly id: string }): RailEntry => ({
  displayName: partial.id,
  hasUnviewed: false,
  isLive: false,
  accentColor: '#000000',
  ...partial,
});

describe('rail-policy — visibleEntries (troncature à 6)', () => {
  test('rend les 6 premières entrées, jamais plus', () => {
    const entries = Array.from({ length: 9 }, (_, i) => entry({ id: `u-${i}` }));
    const visible = visibleEntries(entries);
    expect(visible.length).toBe(MAX_RAIL_ENTRIES);
    expect(visible.map((e) => e.id)).toEqual(['u-0', 'u-1', 'u-2', 'u-3', 'u-4', 'u-5']);
  });

  test('rend tel quel un corpus sous la borne', () => {
    const entries = [entry({ id: 'u-0' }), entry({ id: 'u-1' })];
    expect(visibleEntries(entries)).toEqual(entries);
  });
});

describe('rail-policy — masquage si vide', () => {
  test('shouldRenderEntries est faux sur un corpus vide', () => {
    expect(shouldRenderEntries([])).toBe(false);
  });

  test('shouldRenderEntries est vrai dès une entrée', () => {
    expect(shouldRenderEntries([entry({ id: 'u-0' })])).toBe(true);
  });

  test('shouldRenderRail reste vrai avec « moi » seul, aucune autre entrée', () => {
    expect(
      shouldRenderRail(
        { displayName: 'Vous', accentColor: '#111111', hasActiveStory: false },
        [],
      ),
    ).toBe(true);
  });

  test('shouldRenderRail est faux sans « moi » et sans personne', () => {
    expect(shouldRenderRail(undefined, [])).toBe(false);
  });
});

describe('rail-policy — anneau accentué ssi isLive || hasUnviewed', () => {
  test('accentué quand une story n’est pas vue', () => {
    expect(ringIsAccented(entry({ id: 'u-0', hasUnviewed: true }))).toBe(true);
  });

  test('accentué quand un direct est en cours', () => {
    expect(ringIsAccented(entry({ id: 'u-0', isLive: true }))).toBe(true);
  });

  test('sourd quand tout est vu et rien n’est en direct', () => {
    expect(ringIsAccented(entry({ id: 'u-0', hasUnviewed: false, isLive: false }))).toBe(false);
  });
});

const group = (partial: Partial<StoryGroup> & { readonly id: string }): StoryGroup => ({
  displayName: partial.id,
  stories: [],
  ...partial,
});

describe('rail-policy — railStoryGroups (ni moi, ni entièrement expiré)', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  const past = new Date('2026-09-11T12:00:00Z');
  const future = new Date('2026-09-13T12:00:00Z');

  test('exclut le groupe de l’utilisateur courant', () => {
    const groups = [
      group({ id: 'me', stories: [{ id: 's1', createdAt: past, expiresAt: future, isViewed: false }] }),
      group({ id: 'other', stories: [{ id: 's2', createdAt: past, expiresAt: future, isViewed: false }] }),
    ];
    expect(railStoryGroups(groups, 'me', now).map((g) => g.id)).toEqual(['other']);
  });

  test('exclut un groupe entièrement expiré', () => {
    const groups = [
      group({ id: 'expired', stories: [{ id: 's1', createdAt: past, expiresAt: past, isViewed: false }] }),
      group({ id: 'active', stories: [{ id: 's2', createdAt: past, expiresAt: future, isViewed: false }] }),
    ];
    expect(railStoryGroups(groups, 'me', now).map((g) => g.id)).toEqual(['active']);
  });

  test('garde un groupe avec au moins une story encore active', () => {
    const groups = [
      group({
        id: 'mixed',
        stories: [
          { id: 's1', createdAt: past, expiresAt: past, isViewed: true },
          { id: 's2', createdAt: past, expiresAt: future, isViewed: false },
        ],
      }),
    ];
    expect(railStoryGroups(groups, 'me', now).map((g) => g.id)).toEqual(['mixed']);
  });
});
