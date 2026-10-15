import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SocialEvent } from '@/lib/api/social-events';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createRouter, navigate } from '@/lib/router';
import { arrival, readingTelemetry } from '@/lib/view/reading-telemetry';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * **CHAQUE ÉCRAN DE LECTURE DIT CE QU'IL A MONTRÉ** (#10401, #10483) — les
 * écrans plein cadre, montés par le routeur sur les fixtures : ce qui part
 * par `readingTelemetry.record` à l'ouverture et à la sortie. Un écran qui
 * perd son câblage (`useReadingSession` retiré, source changée, vue
 * d'ouverture doublée) rougit ici.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();
const originalRecord = readingTelemetry.record;
const originalReferrer = arrival.referrer;
let recorded: SocialEvent[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterEach(() => {
  mounter.unmountAll();
  readingTelemetry.record = originalRecord;
  arrival.referrer = originalReferrer;
  appQueryClient.clear();
  navigate('/', true);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await releaseHappyDomIfRegistered();
});

const { Router } = createRouter(
  {
    post: { pattern: '/post/$post', screen: () => import('./post') },
    story: { pattern: '/story/$post', screen: () => import('./story') },
    reels: { pattern: '/reels', screen: () => import('./reels') },
  },
  () => <p>absent</p>,
);

async function open(url: string, served: (events: readonly SocialEvent[]) => boolean): Promise<void> {
  recorded = [];
  readingTelemetry.record = (event: SocialEvent) => {
    recorded.push(event);
  };
  navigate(url, true);
  await mounter.mount(
    <Router wrap={(children) => <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>} skeleton={null} />,
  );
  for (let attempt = 0; attempt < 60 && !served(recorded); attempt += 1) await mounter.settle();
}

const views = (events: readonly SocialEvent[], postId: string) =>
  events.filter((event): event is Extract<SocialEvent, { type: 'view' }> => event.type === 'view' && event.postId === postId);

describe('le détail d’une publication ouvre une séance de lecture', () => {
  const POST = 'post-image-fr';

  test('à l’ouverture : une impression `detail` et UNE vue sans durée', async () => {
    await open(`/post/${POST}`, (events) => events.some((event) => event.type === 'impression'));

    expect(recorded).toContainEqual({ type: 'impression', postId: POST, source: 'detail', surface: 'detail' });
    expect(views(recorded, POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'direct' }]);
  });

  test('ouverte depuis une notification : l’impression porte `notification`', async () => {
    await open(`/post/${POST}?from=notification`, (events) => events.some((event) => event.type === 'impression'));

    expect(recorded).toContainEqual({ type: 'impression', postId: POST, source: 'notification', surface: 'detail' });
  });

  test('à la sortie : la vue reprise avec sa durée', async () => {
    await open(`/post/${POST}`, (events) => events.some((event) => event.type === 'impression'));
    mounter.unmountAll();

    const sortie = views(recorded, POST).filter((event) => event.durationMs !== undefined);
    expect(sortie).toHaveLength(1);
    expect(recorded.some((event) => event.type === 'dwell' && event.postId === POST)).toBe(true);
  });
});

describe('la story ouvre une séance de lecture', () => {
  const STORY = 'st-amie-1';

  /* Le lecteur des fixtures est un COMPTE : sa vue d'ouverture part par
     `markStoryViewed` (l'anneau s'éteint tout de suite), jamais une seconde
     fois par la séance — sans quoi une ouverture en compterait deux. */
  test('un compte : impression `story` à l’ouverture, aucune vue doublée, la vue avec sa durée à la sortie', async () => {
    await open(`/story/${STORY}`, (events) => events.some((event) => event.type === 'impression'));

    expect(recorded).toContainEqual({ type: 'impression', postId: STORY, source: 'story', surface: 'story' });
    expect(views(recorded, STORY)).toEqual([]);
    mounter.unmountAll();
    expect(views(recorded, STORY).filter((event) => event.durationMs !== undefined)).toHaveLength(1);
  });
});

describe('la vue d’un écran détail dit PAR OÙ il est arrivé (#10483)', () => {
  const POST = 'post-image-fr';
  const opened = (events: readonly SocialEvent[]) => events.some((event) => event.type === 'impression');
  const openingView = (postId: string) => views(recorded, postId).filter((event) => event.durationMs === undefined);
  const impressionsOf = (postId: string) => recorded.filter((event) => event.type === 'impression' && event.postId === postId);

  test('ouvert depuis le fil (`?from=feed`) : une impression `detail` et une vue `listing` / `feed`, à l’ouverture comme à la sortie', async () => {
    await open(`/post/${POST}?from=feed`, opened);

    expect(impressionsOf(POST)).toEqual([{ type: 'impression', postId: POST, source: 'detail', surface: 'detail' }]);
    expect(openingView(POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'listing', origin: 'feed' }]);
    mounter.unmountAll();
    const exit = views(recorded, POST).filter((event) => event.durationMs !== undefined);
    expect(exit.map(({ provenance, origin }) => ({ provenance, origin }))).toEqual([{ provenance: 'listing', origin: 'feed' }]);
  });

  test('rouvert : une impression et une vue DE PLUS, sans dédoublonnage', async () => {
    await open(`/post/${POST}?from=profile`, opened);
    mounter.unmountAll();
    navigate('/', true);
    const first = [...recorded];
    await open(`/post/${POST}?from=profile`, opened);

    expect(first.filter((e) => e.type === 'impression')).toHaveLength(1);
    expect(impressionsOf(POST)).toHaveLength(1);
    expect(openingView(POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'listing', origin: 'profile' }]);
  });

  test('arrivé par un lien de suivi (`/l/<jeton>` ⇒ `?via=…&from=tracking_link`) : vue `tracking_link`', async () => {
    await open(`/post/${POST}?via=abc123&from=tracking_link`, opened);
    expect(openingView(POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'tracking_link' }]);
  });

  test('un lien de partage `?via=` sans passer par `/l/` : vue `shared_link`', async () => {
    await open(`/post/${POST}?via=abc123`, opened);
    expect(openingView(POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'shared_link' }]);
  });

  test('un référent d’une autre origine, sans marque : vue `external` ; sans référent : `direct`', async () => {
    arrival.referrer = () => 'https://www.google.com/';
    await open(`/post/${POST}`, opened);
    expect(openingView(POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail', provenance: 'external' }]);
  });

  test('une story ouverte depuis le rail (`?from=story_rail`) : impression `story`, et la vue de sortie porte `listing` / `story_rail`', async () => {
    const STORY = 'st-amie-1';
    await open(`/story/${STORY}?from=story_rail`, opened);
    expect(recorded).toContainEqual({ type: 'impression', postId: STORY, source: 'story', surface: 'story' });
    mounter.unmountAll();
    const exit = views(recorded, STORY).filter((event) => event.durationMs !== undefined);
    expect(exit.map(({ provenance, origin }) => ({ provenance, origin }))).toEqual([{ provenance: 'listing', origin: 'story_rail' }]);
  });

  test('un réel tapé dans le fil (`/reels?seed=…&from=feed`) : le lecteur compte UNE impression et UNE vue `listing` / `feed`', async () => {
    const REEL = 'reel-studio';
    await open(`/reels?seed=${REEL}&from=feed`, (events) => events.some((event) => event.type === 'view'));
    expect(impressionsOf(REEL)).toEqual([{ type: 'impression', postId: REEL, source: 'feed', surface: 'reels' }]);
    expect(openingView(REEL)).toEqual([{ type: 'view', postId: REEL, surface: 'reels', provenance: 'listing', origin: 'feed' }]);
  });
});
