import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { communityPostsQueryKey } from '@/lib/api/community-posts';
import { POST_IMAGE_FR, POST_TEXT_RANK2 } from '@/lib/api/fixtures-feed';
import type { FeedPage } from '@/lib/api/feed-pages';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';

import CommunityPostsPanel, { CommunityPostsEmpty, CommunityPostsFailure } from './community-posts';
import { CommunityDetailTabs } from './community-tabs';

/**
 * LES PUBLICATIONS D'UNE COMMUNAUTÉ DESSINÉES (#6379) — deux onglets nommés et
 * reliés à leur panneau, la même carte que le Flux depuis le cache, et les
 * états vide et d'échec dits dans la langue du lecteur.
 */

const noop = () => undefined;
const scroller = { current: null };

const seed = (communityId: string, page: FeedPage) =>
  appQueryClient.setQueryData(communityPostsQueryKey(communityId), { pages: [page], pageParams: [undefined] });

describe('les onglets du détail d’une communauté', () => {
  beforeAll(async () => {
    await Promise.all([loadInterfaceCatalog('fr'), loadCommunityMembershipCatalog('fr'), loadCommunityMembershipCatalog('ar')]);
  });

  test('deux onglets nommés, un seul choisi et un seul arrêt de tabulation', () => {
    const html = renderToStaticMarkup(<CommunityDetailTabs language="fr" selected="channels" onSelect={noop} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Contenu de la communauté"');
    expect(html).toContain('>Conversations<');
    expect(html).toContain('>Publications<');
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html).toContain('aria-controls="community-panel-posts"');
  });

  test('l’onglet choisi est celui que l’écran dit', () => {
    const html = renderToStaticMarkup(<CommunityDetailTabs language="ar" selected="posts" onSelect={noop} />);
    expect(html).toMatch(/data-community-tab="posts"[^>]*>المنشورات</);
    expect(html).toMatch(/aria-selected="true"[^>]*data-community-tab="posts"/);
  });

  test('chaque onglet est une cible de 44 px au moins', () => {
    const html = renderToStaticMarkup(<CommunityDetailTabs language="fr" selected="channels" onSelect={noop} />);
    expect(html.match(/min-height:44px/g)?.length).toBe(2);
  });
});

describe('l’onglet Publications', () => {
  beforeAll(async () => {
    await Promise.all([loadInterfaceCatalog('fr'), loadCommunityMembershipCatalog('fr'), loadCommunityMembershipCatalog('en')]);
  });

  test('le cache se peint aussitôt, avec la carte du Flux, dans un panneau relié à son onglet', () => {
    seed('c-cache', { posts: [POST_IMAGE_FR, POST_TEXT_RANK2], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    const html = renderToStaticMarkup(<CommunityPostsPanel language="fr" communityId="c-cache" online scroller={scroller} />);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="community-tab-posts"');
    expect(html).toContain(`data-feed-card-id="${POST_IMAGE_FR.id}"`);
    expect(html).toContain(`data-feed-card-id="${POST_TEXT_RANK2.id}"`);
    expect(html).not.toContain('data-community-posts-loading');
  });

  test('un cache vide dessine le chargement, jamais l’état vide', () => {
    const html = renderToStaticMarkup(<CommunityPostsPanel language="fr" communityId="c-cold" online scroller={scroller} />);
    expect(html).toContain('data-community-posts-loading');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-community-posts-empty');
  });

  test('hors ligne sur un cache vide, le panneau le dit au lieu de tourner sans fin', () => {
    const html = renderToStaticMarkup(<CommunityPostsPanel language="fr" communityId="c-offline" online={false} scroller={scroller} />);
    expect(html).toContain('data-community-posts-error');
    expect(html).toContain('Hors ligne');
    expect(html).not.toContain('aria-busy="true"');
  });

  test('hors ligne, un cache plein se peint toujours', () => {
    seed('c-offline-cache', { posts: [POST_IMAGE_FR], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    const html = renderToStaticMarkup(<CommunityPostsPanel language="fr" communityId="c-offline-cache" online={false} scroller={scroller} />);
    expect(html).toContain(`data-feed-card-id="${POST_IMAGE_FR.id}"`);
    expect(html).not.toContain('data-community-posts-error');
  });

  test('une communauté sans publication le dit', () => {
    seed('c-empty', { posts: [], pagination: { limit: 20, hasMore: false, nextCursor: null } });
    const html = renderToStaticMarkup(<CommunityPostsPanel language="fr" communityId="c-empty" online scroller={scroller} />);
    expect(html).toContain('data-community-posts-empty');
    expect(html).toContain('Aucune publication pour l’instant');
  });

  test('un échec se dit, offre « Réessayer », et distingue le hors-ligne', () => {
    const online = renderToStaticMarkup(<CommunityPostsFailure language="en" online onRetry={noop} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain('Couldn’t load the posts');
    expect(online).toContain('Try again');
    const offline = renderToStaticMarkup(<CommunityPostsFailure language="fr" online={false} onRetry={noop} />);
    expect(offline).toContain('Hors ligne');
  });

  test('l’état vide est lisible sans icône', () => {
    const html = renderToStaticMarkup(<CommunityPostsEmpty language="en" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('No posts yet');
  });
});
