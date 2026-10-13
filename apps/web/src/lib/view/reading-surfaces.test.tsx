import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { Avatar } from '@/components/avatar';
import { FeedPostCard } from '@/components/feed-post-card';
import { MoodQuote, StoryCitationCard } from '@/components/message-body-blocks';
import { TargetLink } from '@/components/notification-row';
import { ReelPage } from '@/components/reel-page';
import { StoryRail } from '@/components/story-rail';
import type { FeedPost } from '@/lib/api/feed-pages';
import { REEL_STUDIO } from '@/lib/api/fixtures-reels';
import type { ApiResult, Credential, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createSocialEventsRecorder, type SocialEvent } from '@/lib/api/social-events';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StatusMoodPost } from '@/lib/api/stories';
import { StoryRowItem } from '@/routes/stories';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  IMPRESSION_DWELL_MS,
  bindPageExitFlush,
  detailImpressionSourceOf,
  forgetVisitorKeyOnAccount,
  readingTelemetry,
} from './reading-telemetry';
import { withMoods, type StoryTrayGroup } from './story-tray';

/**
 * CHAQUE AFFICHAGE EST COMPTÉ, AVEC OU SANS COMPTE (#10483) — les surfaces
 * qui ne disaient rien (tuiles du rail et de la liste des stories, humeur
 * d'un avatar, story ou humeur citée dans une bulle), la `surface` de chaque
 * écran, la source d'une ouverture venue d'une notification ou d'un lien
 * partagé, le réel d'un visiteur, et la sortie de page.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const NOW = new Date('2026-10-13T12:00:00.000Z');

type Entry = { readonly isIntersecting: boolean; readonly intersectionRatio: number };
let observers: Array<{ readonly callback: (entries: readonly Entry[]) => void; disconnected: boolean }> = [];
let native: unknown;

class FakeIntersectionObserver {
  private readonly slot: { readonly callback: (entries: readonly Entry[]) => void; disconnected: boolean };
  constructor(callback: (entries: readonly Entry[]) => void) {
    this.slot = { callback, disconnected: false };
    observers.push(this.slot);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.slot.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}

const live = () => observers.filter((o) => !o.disconnected);
const show = (ratio = 1) => act(() => live().forEach((o) => o.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }])));
const hide = () => show(0);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const dwell = () => act(async () => { await wait(IMPRESSION_DWELL_MS + 50); });

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
  observers = [];
  native = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
  recorded = [];
  readingTelemetry.record = (event: SocialEvent) => {
    recorded.push(event);
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
});

const mount = (node: React.ReactNode) => {
  root = createRoot(container);
  act(() => root?.render(node));
};

const impressions = () => recorded.filter((e) => e.type === 'impression');

const group = (authorId: string, extra: Partial<StoryTrayGroup> = {}): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName: authorId } as StoryTrayGroup['author'],
  stories: [{ id: `st-${authorId}`, isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: `st-${authorId}`,
  ...extra,
});

describe('les tuiles de stories comptent leur impression (W4)', () => {
  test('une tuile du rail visible une seconde ⇒ impression `story` depuis `story_rail`', async () => {
    mount(<StoryRail variant="grande" groups={[group('ines')]} loading={false} language="fr" />);
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: 'st-ines', source: 'story', surface: 'story_rail' }]);
  });

  test('ma propre tuile ne compte rien', async () => {
    mount(<StoryRail variant="pinned" groups={[group('moi', { isMine: true })]} loading={false} language="fr" />);
    show();
    await dwell();
    expect(impressions()).toEqual([]);
  });

  test('l’humeur posée sur une tuile compte À L’ÉCRAN, avec la tuile : impression `status` depuis `story_rail`', async () => {
    const moods: readonly StatusMoodPost[] = [{ id: 'm-ines', authorId: 'ines', moodEmoji: '☕' }];
    const [withMood] = withMoods([group('ines')], moods);
    mount(<StoryRail variant="grande" groups={[withMood as StoryTrayGroup]} loading={false} language="fr" />);
    expect(impressions()).toEqual([]);
    show();
    await dwell();
    expect(impressions()).toContainEqual({ type: 'impression', postId: 'm-ines', source: 'status', surface: 'story_rail' });
    expect(impressions()).toContainEqual({ type: 'impression', postId: 'st-ines', source: 'story', surface: 'story_rail' });
  });

  test('une ligne de la liste « toutes les stories » ⇒ impression `story` depuis `story_rail`', async () => {
    mount(<ul><StoryRowItem language="fr" group={group('amina')} /></ul>);
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: 'st-amina', source: 'story', surface: 'story_rail' }]);
  });
});

describe('l’humeur d’un avatar compte son impression (W4)', () => {
  test('visible une seconde ⇒ impression `status` depuis `mood_avatar`, une fois par montage', async () => {
    mount(<Avatar initials="IB" color="#000" size={40} mood="☕" moodPostId="m-ines" />);
    show();
    await dwell();
    hide();
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: 'm-ines', source: 'status', surface: 'mood_avatar' }]);
  });

  test('un avatar sans humeur, ou sans post d’humeur connu, n’observe rien', () => {
    mount(<><Avatar initials="IB" color="#000" size={40} /><Avatar initials="IB" color="#000" size={40} mood="☕" /></>);
    expect(live()).toHaveLength(0);
  });
});

describe('une story ou une humeur citée dans une bulle compte son impression (W4)', () => {
  test('la carte de story citée ⇒ impression `shared_link` depuis `citation`', async () => {
    mount(
      <StoryCitationCard
        citation={{ id: 'st-cite', previewText: 'Coucou', thumbnailUrl: null, createdAt: NOW.toISOString(), unavailable: false }}
        accent="#08f"
        language="fr"
        now={NOW}
      />,
    );
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: 'st-cite', source: 'shared_link', surface: 'citation' }]);
  });

  test('une story citée devenue indisponible ne compte rien', () => {
    mount(
      <StoryCitationCard
        citation={{ id: 'st-gone', previewText: '', thumbnailUrl: null, createdAt: '', unavailable: true }}
        accent="#08f"
        language="fr"
        now={NOW}
      />,
    );
    expect(live()).toHaveLength(0);
  });

  test('l’humeur citée ⇒ impression `shared_link` depuis `citation`', async () => {
    mount(
      <MoodQuote
        citation={{ id: 'm-cite', emoji: '🎉', text: 'Fête', authorName: 'Inès', createdAt: NOW.toISOString() }}
        isMine={false}
        language="fr"
        now={NOW}
      />,
    );
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: 'm-cite', source: 'shared_link', surface: 'citation' }]);
  });
});

const POST: FeedPost = { id: '6512bd43d9caa6e02c990b0a', type: 'POST', createdAt: '2026-10-13T11:55:00.000Z', content: 'Bonjour', originalLanguage: 'fr' };
const cardModel = (post: FeedPost = POST) => resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW });

describe('chaque écran dit sa surface (W5)', () => {
  test('le fil : `feed` par défaut', async () => {
    mount(<FeedPostCard model={cardModel()} />);
    show();
    await dwell();
    expect(impressions()).toEqual([{ type: 'impression', postId: POST.id, source: 'feed', surface: 'feed' }]);
  });

  for (const [source, surface] of [['profile', 'bookmarks'], ['search', 'hashtag'], ['profile', 'profile']] as const) {
    test(`source \`${source}\`, surface \`${surface}\``, async () => {
      mount(<FeedPostCard model={cardModel()} impressionSource={source} impressionSurface={surface} />);
      show();
      await dwell();
      expect(impressions()).toEqual([{ type: 'impression', postId: POST.id, source, surface }]);
    });
  }

  test('le détail ouvert depuis une notification compte en `notification`, depuis un lien partagé en `shared_link`, sinon en `detail`', () => {
    expect(detailImpressionSourceOf(new URLSearchParams('from=notification'))).toBe('notification');
    expect(detailImpressionSourceOf(new URLSearchParams('via=tok_1'))).toBe('shared_link');
    expect(detailImpressionSourceOf(new URLSearchParams('scene=2'))).toBe('detail');
    expect(detailImpressionSourceOf(new URLSearchParams(''))).toBe('detail');
  });

  test('une notification qui ouvre une publication le dit dans l’adresse (`?from=notification`)', () => {
    mount(<TargetLink target={{ route: 'post', params: { post: POST.id } } as never} className="" style={{}} onClick={() => undefined}>x</TargetLink>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(`/post/${POST.id}?from=notification`);
  });
});

function recordingTransport() {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return { ok: true, data: { recorded: 1, rejected: 0 } as unknown as T } as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { transport, requests };
}

describe('le réel d’un visiteur (W6)', () => {
  test('/reel/:id d’un visiteur émet l’impression ET la vue de la publication d’entrée, depuis `reels`', async () => {
    const { transport, requests } = recordingTransport();
    const recorder = createSocialEventsRecorder({
      transport,
      credential: () => null,
      visitorKey: () => 'visitor_abc',
      schedule: () => undefined,
    });
    readingTelemetry.record = recorder.record;
    mount(
      <ReelPage
        model={cardModel(REEL_STUDIO)}
        index={0}
        count={1}
        mode="active"
        soundOn={false}
        language="fr"
        preferredLanguages={['fr']}
        onToggleSound={() => undefined}
        onGesture={() => undefined}
        onShare={() => undefined}
        onSoundBlocked={() => undefined}
      />,
    );
    await recorder.flush();
    const sent = requests.flatMap((r) => (r.body as { events: SocialEvent[] }).events);
    expect(sent).toContainEqual({ type: 'impression', postId: REEL_STUDIO.id, source: 'feed', surface: 'reels' });
    expect(sent).toContainEqual({ type: 'view', postId: REEL_STUDIO.id, surface: 'reels' });
    expect(requests.every((r) => r.headers?.['X-Session-Token'] === 'visitor_abc')).toBe(true);
  });
});

describe('la sortie de page ne perd rien (W3)', () => {
  test('pagehide et le passage en arrière-plan vident la file en keepalive ; le retour en ligne, normalement', () => {
    const calls: unknown[] = [];
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    bindPageExitFlush(async (options) => { calls.push(options); }, { window: win as unknown as Window, document: doc as unknown as Document });
    win.dispatchEvent(new Event('pagehide'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('online'));
    expect(calls).toEqual([{ keepalive: true }, { keepalive: true }, undefined]);
  });
});

describe('la clé de visiteur est purgée quand un compte se connecte', () => {
  function memoryStorage(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => void data.delete(k), data };
  }

  test('un compte connecté efface la clé ; un visiteur ou un invité la garde', () => {
    const account: Credential = { kind: 'registered', token: 't' };
    const kept = memoryStorage({ 'meeshy.reading.visitor': 'visitor_x' });
    forgetVisitorKeyOnAccount(null, kept);
    forgetVisitorKeyOnAccount({ kind: 'anonymous', sessionToken: 'g' }, kept);
    expect(kept.data.has('meeshy.reading.visitor')).toBe(true);
    forgetVisitorKeyOnAccount(account, kept);
    expect(kept.data.has('meeshy.reading.visitor')).toBe(false);
  });
});
