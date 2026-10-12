import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { FeedPostCard } from '@/components/feed-post-card';
import { ReelPage } from '@/components/reel-page';
import type { FeedPost } from '@/lib/api/feed-pages';
import { REEL_STUDIO } from '@/lib/api/fixtures-reels';
import type { SocialEvent } from '@/lib/api/social-events';
import type { StatusMoodPost } from '@/lib/api/stories';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  IMPRESSION_DWELL_MS,
  dwellContentTypeOf,
  observeImpression,
  readingTelemetry,
  useReadingSession,
} from './reading-telemetry';
import { currentMoodPosts, moodsByAuthor } from './story-tray';
import { useStoryRailProps } from './use-story-rail';

/**
 * CHAQUE SURFACE WEB DIT CE QU'ELLE A MONTRÉ (#10401) — le fil, les profils,
 * le hashtag et les favoris comptent une impression par apparition de carte ;
 * le détail, le réel actif et la story ouvrent une séance de lecture ; le
 * plateau compte les humeurs qu'il montre. happy-dom ne calcule aucune
 * intersection : un faux `IntersectionObserver` pose la géométrie à la main.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const NOW = new Date('2026-09-13T12:00:00.000Z');

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
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let recorded: SocialEvent[] = [];
const originalRecord = readingTelemetry.record;
let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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

const POST: FeedPost = { id: '6512bd43d9caa6e02c990b0a', type: 'POST', createdAt: '2026-09-13T11:55:00.000Z', content: 'Bonjour', originalLanguage: 'fr' };
const cardModel = (post: FeedPost = POST) => resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW });
const calls = (): readonly SocialEvent[] => recorded;

describe('observeImpression — une impression par APPARITION', () => {
  function harness() {
    let callback: (entries: readonly Entry[]) => void = () => undefined;
    const timers: Array<{ run: () => void; cleared: boolean }> = [];
    const Observer = class {
      constructor(cb: (entries: readonly Entry[]) => void) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
    };
    let count = 0;
    const stop = observeImpression(document.createElement('div'), () => { count += 1; }, {
      Observer,
      setTimer: (run, ms) => {
        expect(ms).toBe(IMPRESSION_DWELL_MS);
        const t = { run, cleared: false };
        timers.push(t);
        return t;
      },
      clearTimer: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
    });
    const elapse = () => timers.filter((t) => !t.cleared).forEach((t) => { t.cleared = true; t.run(); });
    return { emit: (ratio: number) => callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]), elapse, count: () => count, stop };
  }

  test('moins de la moitié visible ne compte pas', () => {
    const h = harness();
    h.emit(0.3);
    h.elapse();
    expect(h.count()).toBe(0);
  });

  test('visible à 50 % pendant une seconde compte UNE fois, même si l’observateur repasse', () => {
    const h = harness();
    h.emit(0.6);
    h.emit(1);
    h.elapse();
    h.emit(1);
    h.elapse();
    expect(h.count()).toBe(1);
  });

  test('sortie avant la seconde : rien ; sortie puis retour : une NOUVELLE impression', () => {
    const h = harness();
    h.emit(1);
    h.emit(0);
    h.elapse();
    expect(h.count()).toBe(0);
    h.emit(1);
    h.elapse();
    h.emit(0);
    h.emit(1);
    h.elapse();
    expect(h.count()).toBe(2);
  });

  test('sans IntersectionObserver (vieux navigateur), rien n’est observé ni ne lève', () => {
    expect(() => observeImpression(document.createElement('div'), () => undefined, { Observer: undefined })).not.toThrow();
  });
});

describe('FeedPostCard — la carte compte son impression, quel que soit l’écran qui la monte', () => {
  test('une carte du fil, visible une seconde, émet une impression `feed`', async () => {
    mount(<FeedPostCard model={cardModel()} />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'feed' }]);
  });

  test('la source suit l’écran : un hashtag compte en `search`', async () => {
    mount(<FeedPostCard model={cardModel()} impressionSource="search" />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'search' }]);
  });

  test('un réel dans le fil compte aussi son impression', async () => {
    mount(<FeedPostCard model={cardModel(REEL_STUDIO)} impressionSource="profile" />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: REEL_STUDIO.id, source: 'profile' }]);
  });

  test('la carte du DÉTAIL n’observe rien : le détail compte la sienne à l’ouverture', () => {
    mount(<FeedPostCard model={cardModel()} isDetail />);
    expect(live()).toHaveLength(0);
  });
});

function SessionProbe(props: { readonly postId?: string; readonly active: boolean; readonly clock: () => number; readonly openView: boolean }) {
  useReadingSession({
    postId: props.postId,
    active: props.active,
    contentType: 'POST',
    surface: 'detail',
    impressionSource: 'detail',
    openView: props.openView,
    now: props.clock,
  });
  return null;
}

describe('useReadingSession — le détail, le réel actif et la story', () => {
  test('ouvrir compte l’impression et la vue TOUT DE SUITE ; sortir envoie la durée et la séance', () => {
    let t = 1_000;
    const clock = () => t;
    mount(<SessionProbe postId={POST.id} active clock={clock} openView />);
    expect(calls()).toEqual([
      { type: 'impression', postId: POST.id, source: 'detail' },
      { type: 'view', postId: POST.id },
    ]);
    t = 8_500;
    act(() => root?.unmount());
    root = null;
    const closing = calls().slice(2);
    expect(closing[0]).toEqual({ type: 'view', postId: POST.id, durationMs: 7_500 });
    expect(closing[1]).toMatchObject({ type: 'dwell', postId: POST.id, contentType: 'POST', surface: 'detail', dwellMs: 7_500, completed: false });
    expect((closing[1] as { sessionId: string }).sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('openView faux (la story d’un compte, déjà vue par son propre chemin) : pas de seconde vue d’ouverture', () => {
    mount(<SessionProbe postId={POST.id} active clock={() => 0} openView={false} />);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'detail' }]);
  });

  test('rien ne s’ouvre tant que le contenu n’est pas servi', () => {
    mount(<SessionProbe active={false} clock={() => 0} openView />);
    expect(calls()).toEqual([]);
  });

  test('le réel ACTIF ouvre une séance REEL ; le quitter la ferme', () => {
    const page = (mode: 'active' | 'near') => (
      <ReelPage
        model={cardModel(REEL_STUDIO)}
        index={0}
        count={2}
        mode={mode}
        soundOn={false}
        language="fr"
        preferredLanguages={['fr']}
        onToggleSound={() => undefined}
        onGesture={() => undefined}
        onShare={() => undefined}
        onSoundBlocked={() => undefined}
      />
    );
    mount(page('active'));
    expect(calls().slice(0, 2)).toEqual([
      { type: 'impression', postId: REEL_STUDIO.id, source: 'feed' },
      { type: 'view', postId: REEL_STUDIO.id },
    ]);
    act(() => root?.render(page('near')));
    const types = calls().slice(2).map((e) => e.type);
    expect(types).toEqual(['view', 'dwell']);
    expect(calls()[3]).toMatchObject({ type: 'dwell', contentType: 'REEL', surface: 'reels' });
  });

  test('le type de séance suit le `Post.type` servi', () => {
    expect(dwellContentTypeOf('REEL')).toBe('REEL');
    expect(dwellContentTypeOf('STATUS')).toBe('STATUS');
    expect(dwellContentTypeOf('STORY')).toBe('STORY');
    expect(dwellContentTypeOf(undefined)).toBe('POST');
    expect(dwellContentTypeOf('POST')).toBe('POST');
  });
});

describe('le plateau compte les humeurs qu’il montre', () => {
  const moods: readonly StatusMoodPost[] = [
    { id: 'm-new', authorId: 'u-a', moodEmoji: '🎉' },
    { id: 'm-old', authorId: 'u-a', moodEmoji: '😴' },
    { id: 'm-empty', authorId: 'u-b', moodEmoji: '' },
    { id: 'm-c', authorId: 'u-c', moodEmoji: '☕' },
  ];

  test('le post de l’humeur COURANTE de chaque auteur — la même élection que le badge', () => {
    expect([...currentMoodPosts(moods).values()].map((p) => p.id)).toEqual(['m-new', 'm-c']);
    expect([...moodsByAuthor(moods)]).toEqual([['u-a', '🎉'], ['u-c', '☕']]);
  });

  test('le plateau monté émet une impression `status` par humeur d’autrui affichée', async () => {
    function RailProbe() {
      useStoryRailProps('u-moi');
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(
      <QueryClientProvider client={client}>
        <RailProbe />
      </QueryClientProvider>,
    );
    for (let i = 0; i < 20 && !calls().some((e) => e.type === 'impression'); i += 1) {
      await act(async () => {
        await wait(10);
      });
    }
    const statuses = calls().filter((e) => e.type === 'impression' && e.source === 'status');
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses).toContainEqual({ type: 'impression', postId: 'st-humeur-ines', source: 'status' });
    client.clear();
  });
});
