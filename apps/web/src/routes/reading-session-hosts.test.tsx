import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SocialEvent } from '@/lib/api/social-events';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createRouter, navigate } from '@/lib/router';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
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
let recorded: SocialEvent[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterEach(() => {
  mounter.unmountAll();
  readingTelemetry.record = originalRecord;
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
    expect(views(recorded, POST)).toEqual([{ type: 'view', postId: POST, surface: 'detail' }]);
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
