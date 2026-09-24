import { describe, expect, test } from 'bun:test';
import type { InfiniteData } from '@tanstack/react-query';

import type { CommunityPage, CommunitySummary } from '@/lib/api/communities';

import { cachedSearchPlaceholder, communityAccent, compactCount, conversationTitleOf, findCachedCommunity, initialsOf } from './view';

/**
 * LES RÈGLES PURES DES ÉCRANS DE COMMUNAUTÉ (#6364) — ce que les cartes, le
 * détail et la recherche affichent, testé sans DOM.
 */

const summary = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm1',
  identifier: 'mshy_polyglottes',
  name: 'Les polyglottes',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: null,
  memberCount: 0,
  conversationCount: 0,
  ...overrides,
});

describe('compactCount — miroir `CompactCountLabel`', () => {
  test('sous mille, le nombre tel quel ; au-delà, l’abrégé de la LANGUE', () => {
    expect(compactCount(999, 'fr')).toBe('999');
    expect(compactCount(1284, 'en')).toBe('1.3K');
    expect(compactCount(1284, 'fr').replace(/\s/gu, ' ')).toBe('1,3 k');
  });
});

describe('communityAccent — miroir `DynamicColorGenerator.colorForName`', () => {
  test('le même nom rend la même couleur, deux noms peuvent diverger', () => {
    expect(communityAccent('Club de lecture')).toBe(communityAccent('Club de lecture'));
    expect(communityAccent('Club de lecture')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('initialsOf', () => {
  test('deux initiales pour deux mots, une pour un mot', () => {
    expect(initialsOf('Club de lecture')).toBe('CD');
    expect(initialsOf('polyglottes')).toBe('P');
  });
});

describe('conversationTitleOf', () => {
  test('le titre, puis l’identifiant ; jamais un champ vide', () => {
    expect(conversationTitleOf({ title: 'Général', identifier: 'general' }, 'Sans titre')).toBe('Général');
    expect(conversationTitleOf({ title: null, identifier: 'general' }, 'Sans titre')).toBe('general');
    expect(conversationTitleOf({ title: null, identifier: null }, 'Sans titre')).toBe('Sans titre');
  });
});

describe('cachedSearchPlaceholder — la recherche se peint depuis le cache', () => {
  const cached: InfiniteData<CommunityPage, number> = {
    pages: [{ communities: [summary(), summary({ id: 'm2', name: 'Club de lecture', identifier: 'mshy_club' })], nextOffset: null }],
    pageParams: [0],
  };

  test('sous deux caractères, aucun filtre à peindre', () => {
    expect(cachedSearchPlaceholder(cached, 'p')).toBeUndefined();
  });

  test('par nom ou identifiant, insensible à la casse — comme la passerelle', () => {
    expect(cachedSearchPlaceholder(cached, 'CLUB')?.pages[0]?.communities.map((c) => c.id)).toEqual(['m2']);
    expect(cachedSearchPlaceholder(cached, 'polyg')?.pages[0]?.communities.map((c) => c.id)).toEqual(['m1']);
  });

  test('sans liste en cache, rien', () => {
    expect(cachedSearchPlaceholder(undefined, 'club')).toBeUndefined();
  });
});

describe('findCachedCommunity — le détail se peint depuis la liste', () => {
  const page = (communities: readonly CommunitySummary[]): InfiniteData<CommunityPage, number> => ({ pages: [{ communities, nextOffset: null }], pageParams: [0] });

  test('par id ou par identifiant, dans n’importe quelle liste en cache', () => {
    const lists = [undefined, page([summary({ id: 'm1' })]), page([summary({ id: 'm2', identifier: 'mshy_club' })])];
    expect(findCachedCommunity(lists, 'm1')?.id).toBe('m1');
    expect(findCachedCommunity(lists, 'mshy_club')?.id).toBe('m2');
  });

  test('absente de tout cache : `undefined`, ce qu’`initialData` lit comme « rien »', () => {
    expect(findCachedCommunity([page([summary()])], 'inconnue')).toBeUndefined();
  });
});
