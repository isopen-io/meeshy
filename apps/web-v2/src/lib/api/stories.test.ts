import { describe, expect, test } from 'bun:test';

import {
  STATUS_MOODS_QUERY_KEY,
  STORIES_QUERY_PREFIX,
  STORY_FEED_QUERY_KEY,
  STORY_TRAY_QUERY_KEY,
  loadStoryFeed,
  loadStoryPost,
  loadStoryTray,
  markStoryViewed,
} from './stories';
import { createHttpTransport } from './http';

/** Motif `conversations.test.ts` — un `fetchImpl` qui recopie la forme d'une
 * route réelle et enregistre les appels reçus. */
function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

/**
 * `STORIES_QUERY_PREFIX` (#6195) — le tirer-pour-rafraîchir de la Lentille
 * invalide CE préfixe d'un seul appel : les deux clés doivent en être des
 * PROJECTIONS, jamais deux littéraux qui pourraient diverger.
 */
describe('STORIES_QUERY_PREFIX', () => {
  test('STORY_TRAY_QUERY_KEY et STATUS_MOODS_QUERY_KEY commencent par le préfixe', () => {
    expect(STORY_TRAY_QUERY_KEY.slice(0, STORIES_QUERY_PREFIX.length)).toEqual(STORIES_QUERY_PREFIX);
    expect(STATUS_MOODS_QUERY_KEY.slice(0, STORIES_QUERY_PREFIX.length)).toEqual(STORIES_QUERY_PREFIX);
  });

  test('les deux clés restent DISTINCTES malgré le préfixe commun', () => {
    expect(STORY_TRAY_QUERY_KEY).not.toEqual(STATUS_MOODS_QUERY_KEY);
  });

  test('STORY_FEED_QUERY_KEY commence aussi par le préfixe, et reste distinct des deux autres', () => {
    expect(STORY_FEED_QUERY_KEY.slice(0, STORIES_QUERY_PREFIX.length)).toEqual(STORIES_QUERY_PREFIX);
    expect(STORY_FEED_QUERY_KEY).not.toEqual(STORY_TRAY_QUERY_KEY);
    expect(STORY_FEED_QUERY_KEY).not.toEqual(STATUS_MOODS_QUERY_KEY);
  });
});

/**
 * `loadStoryTray` (#6080, migré #6249) — `GET /social/posts?scope=stories`,
 * successeur de l'alias déprécié `GET /posts/feed/stories`.
 */
describe('loadStoryTray', () => {
  test('appelle GET /social/posts?scope=stories&projection=tray&limit=50', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: [] } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadStoryTray({ source: 'gateway', transport });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/social/posts?scope=stories&projection=tray&limit=50');
    expect(calls[0]?.init.method).toBe('GET');
  });
});

/**
 * `loadStoryFeed` (#5817, migré #6249) — LE MÊME endpoint que
 * `loadStoryTray` (`GET /social/posts?scope=stories`), SANS
 * `?projection=tray` : le corpus COMPLET (`storyPostInclude`) dont le
 * lecteur a besoin pour JOUER une story — contenu, traductions, effets —
 * pas seulement l'anneau et la miniature.
 */
describe('loadStoryFeed', () => {
  test('appelle GET /social/posts?scope=stories&limit=50, SANS projection', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: [] } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadStoryFeed({ source: 'gateway', transport });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/social/posts?scope=stories&limit=50');
    expect(calls[0]?.init.method).toBe('GET');
  });

  test('en fixtures, rend un corpus local sans appeler le transport', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: [] } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadStoryFeed({ source: 'fixtures', transport });
    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.length > 0).toBe(true);
  });
});

/**
 * `loadStoryPost` (#5817, revue-correction, défaut 4) — la TROISIÈME marche
 * de la cascade iOS (`StoryViewerContainer.swift:297-352`) : une story
 * partagée par LIEN mais absente des 50 premières du corpus
 * (`loadStoryFeed`, DESC `createdAt`, limite serveur) reste atteignable par
 * `GET /posts/:postId` (`services/gateway/src/routes/posts/core.ts:476`,
 * requiredAuth — le MÊME endroit dont `getPostById` applique déjà l'ACL :
 * un 404 couvre indifféremment « n'existe pas » et « hors d'audience »,
 * D-6, aucun oracle d'existence).
 */
describe('loadStoryPost', () => {
  test('appelle GET /posts/:postId', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'p1', type: 'STORY', createdAt: '2026-09-01T00:00:00Z' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadStoryPost({ source: 'gateway', transport, postId: 'p1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/posts/p1');
    expect(calls[0]?.init.method).toBe('GET');
  });

  test('un 404 (hors audience ou inexistante) rend un échec — jamais un oracle d’existence', async () => {
    const { impl } = fakeFetch({ status: 404, body: { success: false, error: 'Post not found', code: 'POST_NOT_FOUND' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadStoryPost({ source: 'gateway', transport, postId: 'introuvable' });
    expect(result.ok).toBe(false);
  });

  test('en fixtures, retrouve une story du corpus complet SANS appeler le transport', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: null } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadStoryPost({ source: 'fixtures', transport, postId: 'st-mienne' });
    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.id).toBe('st-mienne');
  });

  test('en fixtures, un id absent du corpus rend un échec — le même contrat que la passerelle', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: null } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadStoryPost({ source: 'fixtures', transport, postId: 'jamais-semée' });
    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
  });
});

/**
 * `markStoryViewed` (#5817, migré #6249) — `POST /social/events`
 * (`services/gateway/src/routes/social/events.ts:670-696`, successeur de
 * l'alias déprécié `POST /posts/:postId/view`) : `{ viewed: true }` quel que
 * soit le verdict, jamais un oracle d'existence.
 */
describe('markStoryViewed', () => {
  test('appelle POST /social/events avec un événement view', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { recorded: 1, rejected: 0 } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await markStoryViewed({ source: 'gateway', transport, postId: 'p1', durationMs: 4200 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/social/events');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      events: [{ type: 'view', postId: 'p1', durationMs: 4200 }],
    });
    expect(result).toEqual({ ok: true, data: { viewed: true } });
  });

  test('sans durationMs, omet le champ plutôt que d’envoyer undefined', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { recorded: 1, rejected: 0 } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await markStoryViewed({ source: 'gateway', transport, postId: 'p1' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ events: [{ type: 'view', postId: 'p1' }] });
  });

  test('rend true même si le serveur rejette l’événement (aucun oracle d’existence)', async () => {
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { recorded: 0, rejected: 1 } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await markStoryViewed({ source: 'gateway', transport, postId: 'introuvable' });
    expect(result).toEqual({ ok: true, data: { viewed: true } });
  });

  test('en fixtures, réussit sans appeler le transport', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { recorded: 1, rejected: 0 } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await markStoryViewed({ source: 'fixtures', transport, postId: 'st-mienne' });
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ ok: true, data: { viewed: true } });
  });
});
