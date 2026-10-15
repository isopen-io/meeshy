import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { FeedPostCard } from '@/components/feed-post-card';
import { TargetLink } from '@/components/notification-row';
import { ReelPage } from '@/components/reel-page';
import { StoryRail } from '@/components/story-rail';
import type { FeedPost } from '@/lib/api/feed-pages';
import { REEL_STUDIO, REEL_SUNSET_EN } from '@/lib/api/fixtures-reels';
import type { SocialEvent } from '@/lib/api/social-events';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { navigate } from '@/lib/router';
import { StoryRowItem } from '@/routes/stories';
import { countingProjection, createFakeIntersectionObservers } from '@/test-support/fake-intersection-observer';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SWIPED_REEL, entryAttribution } from './content-open';
import { IMPRESSION_DWELL_MS, readingTelemetry } from './reading-telemetry';
import type { StoryTrayGroup } from './story-tray';

/**
 * **LE TAP OUVRE, L'ÉCRAN COMPTE** (#10483, demande du porteur 2026-10-13) —
 * toucher un contenu dans un listing envoie l'engagement `open` avec le
 * listing d'origine, et l'adresse ouverte porte `?from=<origine>` ; le tap ne
 * compte JAMAIS de vue. Un contenu listé sans tap ne compte qu'une impression.
 * Le lecteur de réels compte une impression et une vue par réel qui devient
 * courant, le balayage portant `listing` / `reels`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const NOW = new Date('2026-10-13T12:00:00.000Z');

let native: unknown;

const fakeObservers = createFakeIntersectionObservers();
const FakeIntersectionObserver = fakeObservers.FakeIntersectionObserver;

const show = () => act(() => fakeObservers.emitAll(1));
const dwell = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, IMPRESSION_DWELL_MS + 50)); });

let recorded: SocialEvent[] = [];
const originalRecord = readingTelemetry.record;
let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  fakeObservers.reset();
  native = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
  recorded = [];
  readingTelemetry.record = (event: SocialEvent) => {
    recorded.push(countingProjection(event));
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container.remove();
  readingTelemetry.record = originalRecord;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = native;
  navigate('/', true);
});

const mount = (node: React.ReactNode) => {
  root = createRoot(container);
  act(() => root?.render(node));
};

const tap = (selector: string) => {
  const target = container.querySelector(selector);
  if (target === null) throw new Error(`absent : ${selector}`);
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
  return target.getAttribute('href');
};

const of = (type: SocialEvent['type']) => recorded.filter((event) => event.type === type);

const POST: FeedPost = { id: '6512bd43d9caa6e02c990b0a', type: 'POST', createdAt: '2026-10-13T11:55:00.000Z', content: 'Bonjour', originalLanguage: 'fr' };
const model = (post: FeedPost = POST) => resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW });

describe('le tap sur une publication d’un listing', () => {
  test('dans le fil : l’heure envoie `open` origine `feed`, ouvre `?from=feed`, et AUCUNE vue', () => {
    mount(<FeedPostCard model={model()} />);
    const href = tap('[data-feed-post-open="heure"]');
    expect(href).toBe(`/post/${POST.id}?from=feed`);
    expect(of('open')).toEqual([{ type: 'open', postId: POST.id, origin: 'feed' }]);
    expect(of('view')).toEqual([]);
  });

  test('le calque du texte fait de même', () => {
    mount(<FeedPostCard model={model()} />);
    expect(tap('[data-feed-post-open="corps"]')).toBe(`/post/${POST.id}?from=feed`);
    expect(of('open')).toEqual([{ type: 'open', postId: POST.id, origin: 'feed' }]);
  });

  for (const [surface, source] of [['profile', 'profile'], ['bookmarks', 'profile'], ['hashtag', 'search']] as const) {
    test(`listée dans \`${surface}\` : l’origine du tap est \`${surface}\``, () => {
      mount(<FeedPostCard model={model()} impressionSource={source} impressionSurface={surface} />);
      expect(tap('[data-feed-post-open="heure"]')).toBe(`/post/${POST.id}?from=${surface}`);
      expect(of('open')).toEqual([{ type: 'open', postId: POST.id, origin: surface }]);
    });
  }

  test('la publication CITÉE d’un repost s’ouvre depuis le même listing', () => {
    mount(<FeedPostCard model={model({ ...POST, repostOf: { id: 'orig-9', type: 'POST', content: 'Hola', originalLanguage: 'fr', author: { id: 'u9', displayName: 'Yann' } } } as FeedPost)} />);
    expect(tap('[data-feed-repost-embed-open]')).toBe('/post/orig-9?from=feed');
    expect(of('open')).toEqual([{ type: 'open', postId: 'orig-9', origin: 'feed' }]);
  });

  test('sur la fiche elle-même, rien ne s’ouvre et rien ne part', () => {
    mount(<FeedPostCard model={model()} isDetail />);
    expect(container.querySelector('[data-feed-post-open]')).toBeNull();
    expect(of('open')).toEqual([]);
  });
});

describe('un réel d’un listing', () => {
  test('tapé dans le fil : `open` origine `feed`, le lecteur s’ouvre sur `?seed=…&from=feed`, aucune vue', () => {
    mount(<FeedPostCard model={model(REEL_STUDIO)} />);
    expect(tap('[data-feed-reel-open]')).toBe(`/reels?seed=${REEL_STUDIO.id}&from=feed`);
    expect(of('open')).toEqual([{ type: 'open', postId: REEL_STUDIO.id, origin: 'feed' }]);
    expect(of('view')).toEqual([]);
  });

  test('listé dans le profil SANS tap : une impression, et rien d’autre', async () => {
    mount(<FeedPostCard model={model(REEL_STUDIO)} impressionSource="profile" impressionSurface="profile" />);
    show();
    await dwell();
    expect(recorded).toEqual([{ type: 'impression', postId: REEL_STUDIO.id, source: 'profile', surface: 'profile' }]);
  });

  test('tapé dans le profil : `open` origine `profile`', () => {
    mount(<FeedPostCard model={model(REEL_STUDIO)} impressionSource="profile" impressionSurface="profile" />);
    expect(tap('[data-feed-reel-open]')).toBe(`/reels?seed=${REEL_STUDIO.id}&from=profile`);
    expect(of('open')).toEqual([{ type: 'open', postId: REEL_STUDIO.id, origin: 'profile' }]);
  });
});

const group = (authorId: string): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName: authorId } as StoryTrayGroup['author'],
  stories: [{ id: `st-${authorId}`, isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: `st-${authorId}`,
});

describe('une story du rail', () => {
  test('la tuile envoie `open` origine `story_rail` et ouvre `?from=story_rail`', () => {
    mount(<StoryRail variant="grande" groups={[group('ines')]} loading={false} language="fr" />);
    expect(tap('a[href^="/story/"]')).toBe('/story/st-ines?from=story_rail');
    expect(of('open')).toEqual([{ type: 'open', postId: 'st-ines', origin: 'story_rail' }]);
    expect(of('view')).toEqual([]);
  });

  test('une ligne de « toutes les stories » aussi', () => {
    mount(<ul><StoryRowItem language="fr" group={group('amina')} /></ul>);
    expect(tap('a')).toBe('/story/st-amina?from=story_rail');
    expect(of('open')).toEqual([{ type: 'open', postId: 'st-amina', origin: 'story_rail' }]);
  });
});

describe('le lecteur de réels est un écran détail', () => {
  const page = (post: FeedPost, index: number, active: number, attribution: ReturnType<typeof entryAttribution>) => (
    <ReelPage
      key={post.id}
      model={model(post)}
      index={index}
      count={2}
      mode={index === active ? 'active' : 'near'}
      soundOn={false}
      language="fr"
      preferredLanguages={['fr']}
      onToggleSound={() => undefined}
      onGesture={() => undefined}
      onShare={() => undefined}
      onSoundBlocked={() => undefined}
      viewAttribution={attribution}
    />
  );

  test('le réel d’entrée compte 1 impression + 1 vue `listing`/`feed` ; balayer vers le suivant, +1 impression +1 vue `listing`/`reels`', () => {
    const attribution = entryAttribution({ provenance: 'listing', origin: 'feed' }, SWIPED_REEL);
    mount(<>{[page(REEL_STUDIO, 0, 0, attribution), page(REEL_SUNSET_EN, 1, 0, attribution)]}</>);
    expect(of('impression')).toEqual([{ type: 'impression', postId: REEL_STUDIO.id, source: 'feed', surface: 'reels' }]);
    expect(of('view')).toEqual([{ type: 'view', postId: REEL_STUDIO.id, surface: 'reels', provenance: 'listing', origin: 'feed' }]);

    act(() => root?.render(<>{[page(REEL_STUDIO, 0, 1, attribution), page(REEL_SUNSET_EN, 1, 1, attribution)]}</>));
    expect(of('impression')).toEqual([
      { type: 'impression', postId: REEL_STUDIO.id, source: 'feed', surface: 'reels' },
      { type: 'impression', postId: REEL_SUNSET_EN.id, source: 'feed', surface: 'reels' },
    ]);
    const opening = of('view').filter((event) => event.type === 'view' && event.durationMs === undefined);
    expect(opening).toEqual([
      { type: 'view', postId: REEL_STUDIO.id, surface: 'reels', provenance: 'listing', origin: 'feed' },
      { type: 'view', postId: REEL_SUNSET_EN.id, surface: 'reels', provenance: 'listing', origin: 'reels' },
    ]);
  });
});

describe('une notification n’est pas un listing', () => {
  test('la story qu’elle ouvre porte `?from=notification`, et aucun `open` ne part', () => {
    mount(<TargetLink target={{ route: 'story', params: { post: 'st-1' } } as never} className="" style={{}} onClick={() => undefined}>x</TargetLink>);
    expect(tap('a')).toBe('/story/st-1?from=notification');
    expect(of('open')).toEqual([]);
  });
});
