import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommunitySummary } from '@/lib/api/communities';

import { SearchCommunitiesStrip, drawsSearchCommunities } from './search-communities-band';

/**
 * #10924 — au focus de « Rechercher… », la liste montre SES communautés, ou
 * rien : jamais un titre « Communautés · Voir tout » au-dessus d'une bande
 * vide, et jamais les filtres que la tête de liste porte déjà. Miroir
 * `ConversationSearchCommunitiesBand` (iOS).
 */

const community = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-polyglottes',
  identifier: 'mshy_polyglottes',
  name: 'Les polyglottes',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u1',
  memberCount: 3,
  conversationCount: 1,
  ...overrides,
});

describe('la bande des communautés de la recherche', () => {
  test('sans communauté, elle ne se dessine pas — aucun titre vide', () => {
    expect(drawsSearchCommunities([])).toBe(false);
    expect(drawsSearchCommunities(null)).toBe(false);
    expect(renderToStaticMarkup(<SearchCommunitiesStrip language="fr" communities={[]} />)).toBe('');
  });

  test('avec une communauté, elle la liste, chaque carte menant à son détail, et « Voir tout » à la liste', () => {
    expect(drawsSearchCommunities([community()])).toBe(true);
    const html = renderToStaticMarkup(<SearchCommunitiesStrip language="fr" communities={[community()]} />);
    expect(html).toContain('Communautés');
    expect(html).toContain('href="/communities/m-polyglottes"');
    expect(html).toContain('Les polyglottes');
    expect(html).toContain('href="/communities"');
    expect(html).toContain('Voir tout');
  });

  test('elle ne porte aucun filtre de liste : ils vivent en tête de liste', () => {
    const html = renderToStaticMarkup(<SearchCommunitiesStrip language="fr" communities={[community()]} />);
    expect(html).not.toContain('data-list-filter');
  });
});
