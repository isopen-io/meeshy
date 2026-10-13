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
import { countingProjection, createFakeIntersectionObservers } from '@/test-support/fake-intersection-observer';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  IMPRESSION_DWELL_MS,
  READING_PENDING_PREFIX,
  dwellContentTypeOf,
  pendingReadingKey,
  savePendingReading,
  takePendingReading,
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

type Entry = { readonly target: Element; readonly isIntersecting: boolean; readonly intersectionRatio: number };
let native: unknown;

const fakeObservers = createFakeIntersectionObservers();
const FakeIntersectionObserver = fakeObservers.FakeIntersectionObserver;

const live = () => fakeObservers.live();
const show = (ratio = 1) => act(() => fakeObservers.emitAll(ratio));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let recorded: SocialEvent[] = [];
let persisted: number[] = [];
let forgotten = 0;
let flushed: number[] = [];
const originalRecord = readingTelemetry.record;
const originalPersistOnExit = readingTelemetry.persistOnExit;
const originalForgetPersisted = readingTelemetry.forgetPersisted;
const originalFlushNow = readingTelemetry.flushNow;
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
  fakeObservers.reset();
  native = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
  recorded = [];
  readingTelemetry.record = (event: SocialEvent) => {
    recorded.push(countingProjection(event));
  };
  persisted = [];
  forgotten = 0;
  readingTelemetry.persistOnExit = () => {
    persisted.push(recorded.length);
  };
  readingTelemetry.forgetPersisted = () => {
    forgotten += 1;
  };
  flushed = [];
  readingTelemetry.flushNow = () => {
    flushed.push(recorded.length);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container.remove();
  readingTelemetry.record = originalRecord;
  readingTelemetry.persistOnExit = originalPersistOnExit;
  readingTelemetry.forgetPersisted = originalForgetPersisted;
  readingTelemetry.flushNow = originalFlushNow;
  setVisibility('visible');
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = native;
});

const mount = (node: React.ReactNode) => {
  root = createRoot(container);
  act(() => root?.render(node));
};

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const hideTab = () => act(() => {
  setVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
});
const showTab = () => act(() => {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
});
const leavePage = () => act(() => {
  window.dispatchEvent(new Event('pagehide'));
});
const restoreFromCache = () => act(() => {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
});

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
      unobserve() {}
      disconnect() {}
    };
    let count = 0;
    const node = document.createElement('div');
    const stop = observeImpression(node, () => { count += 1; }, {
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
    return { emit: (ratio: number) => callback([{ target: node, isIntersecting: ratio > 0, intersectionRatio: ratio }]), elapse, count: () => count, stop };
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
    expect(() => observeImpression(document.createElement('div'), () => undefined, { Observer: undefined })()).not.toThrow();
  });
});

describe('FeedPostCard — la carte compte son impression, quel que soit l’écran qui la monte', () => {
  test('une carte du fil, visible une seconde, émet une impression `feed`', async () => {
    mount(<FeedPostCard model={cardModel()} />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'feed', surface: 'feed' }]);
  });

  test('la source suit l’écran : un hashtag compte en `search`', async () => {
    mount(<FeedPostCard model={cardModel()} impressionSource="search" impressionSurface="hashtag" />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'search', surface: 'hashtag' }]);
  });

  test('un réel dans le fil compte aussi son impression', async () => {
    mount(<FeedPostCard model={cardModel(REEL_STUDIO)} impressionSource="profile" impressionSurface="profile" />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls()).toEqual([{ type: 'impression', postId: REEL_STUDIO.id, source: 'profile', surface: 'profile' }]);
  });

  test('le même post qui réapparaît trois fois au défilement ⇒ trois impressions (règle du porteur, #10483)', async () => {
    mount(<FeedPostCard model={cardModel()} />);
    for (let pass = 0; pass < 3; pass += 1) {
      show();
      await wait(IMPRESSION_DWELL_MS + 50);
      show(0);
    }
    expect(calls().filter((e) => e.type === 'impression')).toHaveLength(3);
  });

  test('un re-rendu de la carte restée à l’écran ne compte rien de plus', async () => {
    mount(<FeedPostCard model={cardModel()} />);
    show();
    await wait(IMPRESSION_DWELL_MS + 50);
    act(() => root?.render(<FeedPostCard model={cardModel()} />));
    act(() => root?.render(<FeedPostCard model={cardModel()} />));
    await wait(IMPRESSION_DWELL_MS + 50);
    expect(calls().filter((e) => e.type === 'impression')).toHaveLength(1);
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
      { type: 'impression', postId: POST.id, source: 'detail', surface: 'detail' },
      { type: 'view', postId: POST.id, surface: 'detail' },
    ]);
    t = 8_500;
    act(() => root?.unmount());
    root = null;
    const closing = calls().slice(2);
    expect(closing[0]).toEqual({ type: 'view', postId: POST.id, durationMs: 7_500, surface: 'detail' });
    expect(closing[1]).toMatchObject({ type: 'dwell', postId: POST.id, contentType: 'POST', surface: 'detail', dwellMs: 7_500, completed: false });
    expect((closing[1] as { sessionId: string }).sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('le même post ouvert deux fois ⇒ deux vues d’ouverture ; un re-rendu pendant la lecture n’en ajoute aucune', () => {
    mount(<SessionProbe postId={POST.id} active clock={() => 0} openView />);
    act(() => root?.render(<SessionProbe postId={POST.id} active clock={() => 1} openView />));
    act(() => root?.unmount());
    root = null;
    mount(<SessionProbe postId={POST.id} active clock={() => 0} openView />);
    const opens = calls().filter((e) => e.type === 'view' && e.durationMs === undefined);
    expect(opens).toHaveLength(2);
  });

  test('openView faux (la story d’un compte, déjà vue par son propre chemin) : pas de seconde vue d’ouverture', () => {
    mount(<SessionProbe postId={POST.id} active clock={() => 0} openView={false} />);
    expect(calls()).toEqual([{ type: 'impression', postId: POST.id, source: 'detail', surface: 'detail' }]);
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
      { type: 'impression', postId: REEL_STUDIO.id, source: 'feed', surface: 'reels' },
      { type: 'view', postId: REEL_STUDIO.id, surface: 'reels' },
    ]);
    act(() => root?.render(page('near')));
    const types = calls().slice(2).map((e) => e.type);
    expect(types).toEqual(['view', 'dwell']);
    expect(calls()[3]).toMatchObject({ type: 'dwell', contentType: 'REEL', surface: 'reels' });
  });

  test('fermer l’onglet ou recharger (`pagehide`) ferme la séance PUIS garde la file — le démontage ne la rejoue pas (#10519)', () => {
    let t = 1_000;
    mount(<SessionProbe postId={POST.id} active clock={() => t} openView />);
    t = 21_000;
    leavePage();
    const closing = calls().slice(2);
    expect(closing[0]).toEqual({ type: 'view', postId: POST.id, durationMs: 20_000, surface: 'detail' });
    expect(closing[1]).toMatchObject({ type: 'dwell', postId: POST.id, dwellMs: 20_000 });
    expect(closing).toHaveLength(2);
    expect(persisted).toEqual([4]);
    act(() => root?.unmount());
    root = null;
    expect(calls()).toHaveLength(4);
  });

  test('passer en arrière-plan ferme la séance ; revenir en ouvre une NOUVELLE, sans recompter l’impression ni l’ouverture (#10519)', () => {
    let t = 0;
    mount(<SessionProbe postId={POST.id} active clock={() => t} openView />);
    t = 5_000;
    hideTab();
    expect(flushed).toEqual([4]);
    expect(persisted).toEqual([]);
    t = 65_000;
    showTab();
    t = 68_000;
    act(() => root?.unmount());
    root = null;
    const after = calls().slice(2);
    expect(after.map((e) => e.type)).toEqual(['view', 'dwell', 'view', 'dwell']);
    expect(after[0]).toEqual({ type: 'view', postId: POST.id, durationMs: 5_000, surface: 'detail' });
    expect(after[1]).toMatchObject({ dwellMs: 5_000, startedAt: new Date(0).toISOString() });
    expect(after[3]).toMatchObject({ dwellMs: 3_000, startedAt: new Date(65_000).toISOString() });
    expect((after[1] as { sessionId: string }).sessionId).not.toBe((after[3] as { sessionId: string }).sessionId);
  });

  test('une page rendue par le cache (`pageshow` persisted) oublie la file gardée et rouvre la séance', () => {
    let t = 0;
    mount(<SessionProbe postId={POST.id} active clock={() => t} openView />);
    t = 1_000;
    leavePage();
    t = 9_000;
    restoreFromCache();
    expect(forgotten).toBe(1);
    t = 10_000;
    act(() => root?.unmount());
    root = null;
    expect(calls()[5]).toMatchObject({ type: 'dwell', dwellMs: 1_000, startedAt: new Date(9_000).toISOString() });
  });

  test('masqué deux fois de suite (onglet masqué puis fermé) : une seule fermeture', () => {
    let t = 0;
    mount(<SessionProbe postId={POST.id} active clock={() => t} openView />);
    t = 2_000;
    hideTab();
    leavePage();
    expect(calls().slice(2).map((e) => e.type)).toEqual(['view', 'dwell']);
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

  test('le plateau ne compte plus les humeurs à la réception du corpus — la tuile les compte à l’écran (#10483)', async () => {
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
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await wait(10);
      });
    }
    expect(calls().filter((e) => e.type === 'impression')).toEqual([]);
    client.clear();
  });
});

describe('la file d’une page qui s’en va attend le prochain chargement du MÊME compte (#10519)', () => {
  const memory = () => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    };
  };
  const KEY = `${READING_PENDING_PREFIX}u:42`;
  const events: readonly SocialEvent[] = [
    { type: 'impression', postId: POST.id, source: 'feed' },
    { type: 'view', postId: POST.id, durationMs: 4000 },
  ];
  const later: readonly SocialEvent[] = [{ type: 'view', postId: REEL_STUDIO.id, durationMs: 9000 }];

  test('seul un compte a une file gardée — ni invité, ni visiteur', () => {
    expect(pendingReadingKey('u:42')).toBe(KEY);
    expect(pendingReadingKey('g:tok')).toBeNull();
    expect(pendingReadingKey(null)).toBeNull();
  });

  test('garder puis reprendre rend la file une fois, puis plus rien', () => {
    const storage = memory();
    savePendingReading(storage, KEY, 'page-a', events);
    expect(takePendingReading(storage, KEY)).toEqual(events);
    expect(takePendingReading(storage, KEY)).toEqual([]);
  });

  test('deux onglets du même compte fermés l’un après l’autre : aucune file n’écrase l’autre', () => {
    const storage = memory();
    savePendingReading(storage, KEY, 'page-a', events);
    savePendingReading(storage, KEY, 'page-b', later);
    expect(takePendingReading(storage, KEY)).toEqual([...events, ...later]);
  });

  test('une page qui regarde de nouveau remplace SA part ; vide, elle la retire', () => {
    const storage = memory();
    savePendingReading(storage, KEY, 'page-a', events);
    savePendingReading(storage, KEY, 'page-b', later);
    savePendingReading(storage, KEY, 'page-a', []);
    expect(takePendingReading(storage, KEY)).toEqual(later);
    savePendingReading(storage, KEY, 'page-b', []);
    expect(storage.map.has(KEY)).toBe(false);
  });

  test('la file d’un autre compte n’est pas touchée', () => {
    const storage = memory();
    const other = `${READING_PENDING_PREFIX}u:7`;
    savePendingReading(storage, other, 'page-a', events);
    expect(takePendingReading(storage, KEY)).toEqual([]);
    expect(takePendingReading(storage, other)).toEqual(events);
  });

  test('une valeur illisible ou d’une autre forme est jetée, jamais rejouée', () => {
    const storage = memory();
    storage.setItem(KEY, '{oops');
    expect(takePendingReading(storage, KEY)).toEqual([]);
    storage.setItem(KEY, JSON.stringify([{ page: 'p', events: [{ type: 'view' }, { type: 'impression', postId: POST.id, source: 'feed' }, 3] }, 'x']));
    expect(takePendingReading(storage, KEY)).toEqual([{ type: 'impression', postId: POST.id, source: 'feed' }]);
    expect(storage.map.has(KEY)).toBe(false);
  });
  test('l’engagement d’ouverture `open` gardé repart avec la file (#10483)', () => {
    const storage = memory();
    const kept: readonly SocialEvent[] = [{ type: 'open', postId: POST.id, origin: 'feed' }, { type: 'view', postId: POST.id, surface: 'detail' }];
    savePendingReading(storage, KEY, 'page-a', kept);
    expect(takePendingReading(storage, KEY)).toEqual(kept);
  });
});
