import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ContentLinkTarget } from '@meeshy/shared/utils/content-link';

import { contentLinkTargetQueryKey } from '@/lib/api/content-card';
import { FEED_QUERY_KEY } from '@/lib/api/feed';
import type { FeedInfiniteData, FeedMedia, FeedPost } from '@/lib/api/feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';
import { postQueryKey } from '@/lib/api/publication-detail';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContentLinkSlot } from './content-link-card';

/**
 * **LA CARTE VIVANTE D'UN LIEN MEESHY VERS UN CONTENU (#19334, parapluie #19331).**
 *
 * Un lien vers une publication, un réel, une story ou une humeur se déplie en
 * carte : le média, l'auteur, le texte servi par le Prisme du lecteur, les
 * vues et les favoris — lus en direct, cache d'abord. Les témoins lisent les
 * textes du catalogue anglais et jouent la requête jusqu'à la passerelle.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const POST_ID = '66f0c0ffee0000000000c0de';
const NEXT_ID = '66f0c0ffee0000000000beef';
const POST_PATH = `/api/v1/posts/${POST_ID}`;
const RESOLVE_PATH = '/api/v1/tracking-links/Ab3xYz/resolve';

const reel = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: POST_ID,
  type: 'REEL',
  createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  content: 'Bonjour à tous',
  originalLanguage: 'fr',
  translations: { en: { text: 'Good morning everyone' } },
  author: { id: 'u-amani', username: 'amani', displayName: 'Amani Diallo', avatar: null },
  viewCount: 1234,
  likeCount: 12,
  commentCount: 0,
  bookmarkCount: 4,
  isBookmarkedByMe: true,
  ...overrides,
});

const video = (overrides: Partial<FeedMedia> = {}): FeedMedia => ({
  id: 'v1',
  mimeType: 'video/mp4',
  fileUrl: 'posts/v1.mp4',
  thumbnailUrl: 'posts/v1.jpg',
  width: 1080,
  height: 1920,
  duration: 42_000,
  ...overrides,
});

type Reply = ApiResult<unknown> | 'pending';

const transportOf = (replies: Readonly<Record<string, Reply>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'never' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: false, status: 404, error: 'not found' };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, calls: () => calls };
};

type Mounted = { readonly root: Root; readonly host: HTMLElement };
const mounted: Mounted[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, host }) => {
    act(() => root.unmount());
    host.remove();
  });
});

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const direct = (type: 'POST' | 'REEL' | 'STORY' | 'STATUS' | null = 'REEL', postId = POST_ID): ContentLinkTarget => ({ kind: 'content', postId, type });

const mount = async (params: {
  readonly candidates: readonly ContentLinkTarget[];
  readonly replies?: Readonly<Record<string, Reply>>;
  readonly seed?: (client: QueryClient) => void;
  readonly readerLanguages?: readonly string[];
  readonly excludePostId?: string;
}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  params.seed?.(client);
  const { deps, calls } = transportOf(params.replies ?? {});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ContentLinkSlot
          candidates={params.candidates}
          deps={deps}
          language="en"
          readerLanguages={params.readerLanguages ?? ['de', 'en']}
          {...(params.excludePostId === undefined ? {} : { excludePostId: params.excludePostId })}
        />
      </QueryClientProvider>,
    );
  });
  await settle();
  return { host, calls, client };
};

const seedPost = (post: FeedPost) => (client: QueryClient) => client.setQueryData(postQueryKey(post.id), post);

const cardOf = (host: HTMLElement) => host.querySelector<HTMLAnchorElement>('a[data-content-card-open]');

describe('la carte d’un contenu — cache d’abord', () => {
  test('une publication déjà connue se peint tout de suite, sans squelette, pendant la relecture', async () => {
    const { host } = await mount({ candidates: [direct()], seed: seedPost(reel()), replies: { [`GET ${POST_PATH}`]: 'pending' } });
    expect(host.querySelector('[data-content-card="loading"]')).toBeNull();
    expect(host.querySelector('[data-content-card="card"]')).not.toBeNull();
    expect(host.textContent).toContain('Amani Diallo');
  });

  test('une carte peinte par le FIL amorce la carte du lien : aucune attente, aucun squelette', async () => {
    const feed: FeedInfiniteData = { pages: [{ posts: [reel()], pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] };
    const { host } = await mount({
      candidates: [direct()],
      seed: (client) => client.setQueryData(FEED_QUERY_KEY, feed),
      replies: { [`GET ${POST_PATH}`]: 'pending' },
    });
    expect(host.querySelector('[data-content-card="card"]')).not.toBeNull();
  });

  test('rien de connu : le squelette de la carte, annoncé, sans roue', async () => {
    const { host, calls } = await mount({ candidates: [direct()], replies: { [`GET ${POST_PATH}`]: 'pending' } });
    const skeleton = host.querySelector('[data-content-card="loading"]');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(skeleton?.getAttribute('aria-label')).toBe('Loading the content');
    expect(calls().map((call) => call.path)).toEqual([POST_PATH]);
    expect(calls()[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('la passerelle répond : la carte remplace le squelette', async () => {
    const { host } = await mount({ candidates: [direct()], replies: { [`GET ${POST_PATH}`]: { ok: true, data: reel() } } });
    expect(host.querySelector('[data-content-card="card"]')).not.toBeNull();
  });
});

describe('la carte d’un contenu — les états sans carte', () => {
  test('404 (supprimé, expiré, hors audience) : une ligne atténuée, l’icône du type, jamais le lien', async () => {
    const { host } = await mount({ candidates: [direct('STORY')] });
    const line = host.querySelector('[data-content-card="unavailable"]');
    expect(line?.textContent).toBe('This content is no longer available');
    expect(line?.getAttribute('data-content-type')).toBe('STORY');
    expect(host.querySelectorAll('a, button')).toHaveLength(0);
  });

  test('une panne sans rien de connu : rien ne s’ajoute, le lien du texte reste le seul geste', async () => {
    const { host } = await mount({ candidates: [direct()], replies: { [`GET ${POST_PATH}`]: { ok: false, status: 0, error: 'offline' } } });
    expect(host.innerHTML).toBe('');
  });

  test('une panne pendant la relecture d’une carte connue : la carte reste', async () => {
    const { host, calls } = await mount({
      candidates: [direct()],
      seed: (client) => client.setQueryData(postQueryKey(POST_ID), reel(), { updatedAt: Date.now() - 10 * 60_000 }),
      replies: { [`GET ${POST_PATH}`]: { ok: false, status: 503, error: 'down' } },
    });
    expect(calls().map((call) => call.path)).toEqual([POST_PATH]);
    expect(host.querySelector('[data-content-card="card"]')).not.toBeNull();
  });
});

describe('la carte d’un contenu — ce qu’elle montre', () => {
  test('un réel : portrait, pastille du type, ▶ et sa durée, « +N », texte servi au rang 2 du Prisme', async () => {
    const post = reel({ media: [video(), video({ id: 'v2' })] });
    const { host } = await mount({ candidates: [direct()], seed: seedPost(post) });
    const media = host.querySelector<HTMLElement>('[data-content-card-media]');
    expect(media?.getAttribute('data-content-card-media')).toBe('video');
    expect(Number.parseFloat(media?.style.aspectRatio ?? '')).toBe(9 / 16);
    expect(media?.querySelector('img')?.getAttribute('src')).toBe(attachmentSrc('posts/v1.jpg'));
    expect(host.querySelector('[data-content-card-type]')?.textContent).toBe('Reel');
    expect(host.querySelector('[data-content-card-play]')).not.toBeNull();
    expect(host.querySelector('[data-content-card-duration]')?.textContent).toBe('0:42');
    expect(host.querySelector('[data-content-card-more]')?.textContent).toBe('+1');
    const text = host.querySelector('[data-content-card-text]');
    expect(text?.textContent).toBe('Good morning everyone');
    expect(text?.getAttribute('lang')).toBe('en');
  });

  test('vues et favoris toujours, j’aime et commentaires seulement s’il y en a ; le favori du lecteur est plein', async () => {
    const { host } = await mount({ candidates: [direct()], seed: seedPost(reel()) });
    expect(host.querySelector('[data-content-card-stat="views"]')?.textContent).toBe('1.2K');
    expect(host.querySelector('[data-content-card-stat="likes"]')?.textContent).toBe('12');
    expect(host.querySelector('[data-content-card-stat="comments"]')).toBeNull();
    expect(host.querySelector('[data-content-card-stat="favorites"]')?.textContent).toBe('4');
    expect(host.querySelector('[data-content-card-stat="favorites"]')?.getAttribute('data-saved')).toBe('true');
  });

  test('sans média, la pastille du type se pose avant le nom ; une humeur porte son émoji en grand', async () => {
    const mood = reel({ type: 'STATUS', moodEmoji: '🌞', content: 'Grand soleil', translations: null, media: [], isBookmarkedByMe: false });
    const { host } = await mount({ candidates: [direct('STATUS')], seed: seedPost(mood) });
    expect(host.querySelector('[data-content-card-media]')).toBeNull();
    const authorRow = host.querySelector('[data-content-card-author]');
    expect(authorRow?.querySelector('[data-content-card-type]')?.textContent).toBe('Mood');
    expect(host.querySelector('[data-content-card-mood]')?.textContent).toBe('🌞');
    expect(host.querySelector('[data-content-card-stat="favorites"]')?.getAttribute('data-saved')).toBe('false');
  });
});

describe('la carte d’un contenu — le geste et l’accessibilité', () => {
  test('UN lien, dans l’app, à la place du contenu : un réel ouvre le lecteur de réels', async () => {
    const { host } = await mount({ candidates: [direct()], seed: seedPost(reel()) });
    expect(host.querySelectorAll('a')).toHaveLength(1);
    expect(cardOf(host)?.getAttribute('href')).toBe(`/reel/${POST_ID}?from=link_preview`);
  });

  test('le type SERVI choisit la porte ; une humeur ouvre sa page, un type inconnu le détail', async () => {
    const mood = await mount({ candidates: [direct(null)], seed: seedPost(reel({ type: 'STATUS' })) });
    expect(cardOf(mood.host)?.getAttribute('href')).toBe(`/mood/${POST_ID}?from=link_preview`);
    const unknown = await mount({ candidates: [direct(null)], seed: seedPost(reel({ type: 'ARTICLE' })) });
    expect(cardOf(unknown.host)?.getAttribute('href')).toBe(`/feeds/post/${POST_ID}?from=link_preview`);
  });

  test('UN élément prononcé : type, auteur, texte, vues, favoris, et « enregistré » ; l’indice dit ce que fait le geste', async () => {
    const { host } = await mount({ candidates: [direct()], seed: seedPost(reel()) });
    const card = cardOf(host);
    expect(card?.getAttribute('aria-label')).toBe('Reel by Amani Diallo. Good morning everyone. 1234 views, 4 favorites, saved');
    expect(card?.getAttribute('aria-description')).toBe('Opens the content');
    expect(card?.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('la carte d’un contenu — un lien suivi `/l/<jeton>`', () => {
  const tracked: ContentLinkTarget = { kind: 'tracked', token: 'Ab3xYz' };

  test('résolu en contenu, il devient la carte de ce contenu ; le geste passe par le lien suivi, qui compte le clic', async () => {
    const { host } = await mount({
      candidates: [tracked],
      seed: seedPost(reel()),
      replies: { [`GET ${RESOLVE_PATH}`]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'REEL', targetId: POST_ID } } },
    });
    expect(host.textContent).toContain('Amani Diallo');
    expect(cardOf(host)?.getAttribute('href')).toBe('/l/Ab3xYz');
  });

  test('une résolution déjà connue ne repart pas sur le réseau', async () => {
    const { host, calls } = await mount({
      candidates: [tracked],
      seed: (client) => {
        client.setQueryData(contentLinkTargetQueryKey('Ab3xYz'), { postId: POST_ID, type: 'REEL' });
        client.setQueryData(postQueryKey(POST_ID), reel());
      },
    });
    expect(host.querySelector('[data-content-card="card"]')).not.toBeNull();
    expect(calls().filter((call) => call.path === RESOLVE_PATH)).toEqual([]);
  });

  test('résolu en autre chose (un site, une invitation), il cède la place au lien de contenu suivant', async () => {
    const { host } = await mount({
      candidates: [tracked, direct('POST', NEXT_ID)],
      seed: seedPost(reel({ id: NEXT_ID, type: 'POST' })),
      replies: { [`GET ${RESOLVE_PATH}`]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'EXTERNAL', originalUrl: 'https://example.com' } } },
    });
    expect(cardOf(host)?.getAttribute('href')).toBe(`/post/${NEXT_ID}?from=link_preview`);
  });

  test('pendant la résolution, le squelette ; une passerelle injoignable n’ajoute rien', async () => {
    const pending = await mount({ candidates: [tracked], replies: { [`GET ${RESOLVE_PATH}`]: 'pending' } });
    expect(pending.host.querySelector('[data-content-card="loading"]')).not.toBeNull();
    const offline = await mount({ candidates: [tracked], replies: { [`GET ${RESOLVE_PATH}`]: { ok: false, status: 0, error: 'offline' } } });
    expect(offline.host.innerHTML).toBe('');
  });

  test('une publication ne se cite pas elle-même, même par un lien suivi', async () => {
    const { host } = await mount({
      candidates: [tracked],
      excludePostId: POST_ID,
      replies: { [`GET ${RESOLVE_PATH}`]: { ok: true, data: { kind: 'tracking', isActive: true, targetType: 'POST', targetId: POST_ID } } },
    });
    expect(host.innerHTML).toBe('');
  });
});
