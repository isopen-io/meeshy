import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedPost } from '@/lib/api/feed-pages';
import { loadGlobalSearchCatalog } from '@/lib/i18n-global-search-catalog';
import type { MessageSearchRowModel } from '@/lib/view/message-search-row';

import { PersonSearchRow, PostSearchRow } from './global-search-results';
import { MessageSearchSection } from './list-message-search';

/**
 * #14619 / #14620 — CE QUE LA RECHERCHE PEINT. La section « Messages » de la
 * liste n'existe pas sous le seuil, montre ses lignes qui ouvrent le fil SUR
 * le message, dit son vide, son échec et sa suite ; un post, un réel et une
 * story ouvrent chacun leur écran ; une personne ouvre son profil.
 */
beforeAll(async () => {
  await loadGlobalSearchCatalog('fr');
});

const row: MessageSearchRowModel = {
  messageId: 'm1',
  conversationId: 'c1',
  author: 'Ada',
  sentAt: '2026-11-01T10:00:00.000Z',
  dateLabel: '1 nov., 10:00',
  excerpt: 'on se voit à la plage',
  translated: true,
  conversationName: 'Plage',
  accent: '#6366f1',
};

const section = (over: Partial<Parameters<typeof MessageSearchSection>[0]> = {}) =>
  renderToStaticMarkup(
    <MessageSearchSection language="fr" query="plage" state="ready" rows={[row]} hasMore={false} busy={false} onMore={() => {}} onRetry={() => {}} {...over} />,
  );

describe('la section « Messages » de la recherche de la liste', () => {
  test('au repos (moins de deux caractères), elle ne se dessine pas', () => {
    expect(section({ state: 'idle' })).toBe('');
  });

  test('chaque ligne ouvre le fil sur le message, avec le texte servi et la marque « Traduit »', () => {
    const html = section();
    expect(html).toContain('Messages');
    expect(html).toContain('href="/c/c1?message=m1"');
    expect(html).toContain('on se voit à la plage');
    expect(html).toContain('Traduit');
    expect(html).toContain('href="/chats?search=plage"');
  });

  test('vide, en échec, hors ligne et avec une suite : chaque état est dit', () => {
    expect(section({ rows: [] })).toContain('Aucun message ne correspond');
    expect(section({ rows: [], state: 'error' })).toContain('Réessayer');
    expect(section({ rows: [], state: 'offline' })).toContain('Hors ligne');
    expect(section({ rows: [], state: 'loading' })).toContain('Recherche en cours');
    expect(section({ hasMore: true })).toContain('Afficher plus');
  });
});

const post = (type: string): FeedPost => ({
  id: `p-${type}`,
  type,
  createdAt: '2026-11-01T10:00:00.000Z',
  content: 'sunset',
  originalLanguage: 'en',
  translations: { fr: { text: 'coucher de soleil' } },
  author: { id: 'u1', username: 'ada', displayName: 'Ada', avatar: null },
});

describe('un résultat de post ouvre son écran, dans la langue du lecteur', () => {
  test('post, réel et story', () => {
    const html = (type: string) => renderToStaticMarkup(<PostSearchRow post={post(type)} language="fr" preferredLanguages={['fr']} />);
    expect(html('POST')).toContain('href="/post/p-POST"');
    expect(html('REEL')).toContain('href="/reel/p-REEL"');
    expect(html('STORY')).toContain('href="/story/p-STORY"');
    expect(html('REEL')).toContain('Réel');
    expect(html('POST')).toContain('coucher de soleil');
  });

  test('une personne ouvre son profil', () => {
    const html = renderToStaticMarkup(<PersonSearchRow person={{ id: 'u1', username: 'ada', displayName: 'Ada', avatar: null }} />);
    expect(html).toContain('href="/u/ada"');
    expect(html).toContain('@ada');
  });
});
