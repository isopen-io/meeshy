import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { performSetCommunityJoinLinkPaused } from './community-join-link';
import { COMMUNITY_LINKS_QUERY_KEY, decodeCommunityLink, type CommunityLink } from './community-links';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE LIEN D'ENTRÉE EN PAUSE, CÔTÉ WEB (#20255) — l'état se lit dans « mes
 * communautés » (absent = la passerelle ne le sert pas encore, aucune bascule
 * n'est offerte) ; la bascule est optimiste et revient en arrière sur un refus.
 */

type Recorded = { readonly method: string; readonly path: string; readonly body?: unknown };

function transportReturning(...results: readonly ApiResult<unknown>[]) {
  const requests: Recorded[] = [];
  const queue = [...results];
  const transport = {
    request: async (req: Recorded) => {
      requests.push({ method: req.method, path: req.path, ...(req.body === undefined ? {} : { body: req.body }) });
      return queue.shift() ?? { ok: false, status: 500, error: 'vide' };
    },
  } as unknown as HttpTransport;
  return { transport, requests };
}

const wire = (extra: Record<string, unknown> = {}) => ({ id: 'cm1', name: 'Meeshy Paris', identifier: 'mshy_paris', role: 'admin', isPrivate: false, ...extra });

const seeded = (joinLinkPaused: boolean) => {
  const queryClient = new QueryClient();
  const link = decodeCommunityLink(wire({ joinLinkPaused })) as CommunityLink;
  queryClient.setQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY, [link]);
  return { queryClient, link };
};

const cachedPaused = (queryClient: QueryClient) => queryClient.getQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY)?.[0]?.joinLinkPaused;

describe('l’état du lien d’entrée se décode', () => {
  test('servi, il est lu tel quel', () => {
    expect(decodeCommunityLink(wire({ joinLinkPaused: true }))?.joinLinkPaused).toBe(true);
    expect(decodeCommunityLink(wire({ joinLinkPaused: false }))?.joinLinkPaused).toBe(false);
  });

  test('absent (passerelle plus ancienne), il reste inconnu — jamais « actif » inventé', () => {
    expect(decodeCommunityLink(wire())?.joinLinkPaused).toBeNull();
  });
});

describe('mettre le lien en pause, puis le relancer', () => {
  test('le geste est optimiste et part sur la route de l’intendant', async () => {
    const { queryClient, link } = seeded(false);
    const { transport, requests } = transportReturning({ ok: true, data: { joinLinkPausedAt: '2026-11-21T10:00:00.000Z' } });
    const pending = performSetCommunityJoinLinkPaused({ link, paused: true, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } });
    expect(cachedPaused(queryClient)).toBe(true);
    expect(await pending).toBe('done');
    expect(requests).toEqual([{ method: 'PUT', path: '/api/v1/communities/cm1/join-link', body: { paused: true } }]);
  });

  test('la réponse fait foi : la passerelle dit l’état qu’elle a écrit', async () => {
    const { queryClient, link } = seeded(true);
    const { transport } = transportReturning({ ok: true, data: { joinLinkPausedAt: '2026-11-20T08:00:00.000Z' } });
    expect(await performSetCommunityJoinLinkPaused({ link, paused: false, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } })).toBe('done');
    expect(cachedPaused(queryClient)).toBe(true);
  });

  test('un refus rend l’état d’avant', async () => {
    const { queryClient, link } = seeded(false);
    const { transport } = transportReturning({ ok: false, status: 404, error: 'Community not found' });
    expect(await performSetCommunityJoinLinkPaused({ link, paused: true, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } })).toBe('failed');
    expect(cachedPaused(queryClient)).toBe(false);
  });

  test('un refus ne défait que sa propre ligne, jamais la bascule réussie d’une autre communauté', async () => {
    const queryClient = new QueryClient();
    const a = decodeCommunityLink(wire({ joinLinkPaused: false })) as CommunityLink;
    const b = decodeCommunityLink(wire({ id: 'cm2', identifier: 'mshy_b', joinLinkPaused: false })) as CommunityLink;
    queryClient.setQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY, [a, b]);
    const refused = transportReturning({ ok: false, status: 500, error: 'boom' });
    const accepted = transportReturning({ ok: true, data: { joinLinkPausedAt: '2026-11-21T10:00:00.000Z' } });
    const pendingA = performSetCommunityJoinLinkPaused({ link: a, paused: true, deps: { source: 'gateway', transport: refused.transport, queryClient, isOnline: () => true } });
    expect(await performSetCommunityJoinLinkPaused({ link: b, paused: true, deps: { source: 'gateway', transport: accepted.transport, queryClient, isOnline: () => true } })).toBe('done');
    expect(await pendingA).toBe('failed');
    const links = queryClient.getQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY);
    expect(links?.map((link) => [link.id, link.joinLinkPaused])).toEqual([
      ['cm1', false],
      ['cm2', true],
    ]);
  });

  test('hors ligne, rien ne part et rien ne change', async () => {
    const { queryClient, link } = seeded(false);
    const { transport, requests } = transportReturning();
    expect(await performSetCommunityJoinLinkPaused({ link, paused: true, deps: { source: 'gateway', transport, queryClient, isOnline: () => false } })).toBe('offline');
    expect(requests).toHaveLength(0);
    expect(cachedPaused(queryClient)).toBe(false);
  });

  test('une bascule contraire à celle en vol est refusée', async () => {
    const { queryClient, link } = seeded(false);
    const { transport, requests } = transportReturning({ ok: true, data: { joinLinkPausedAt: '2026-11-21T10:00:00.000Z' } });
    const deps = { source: 'gateway' as const, transport, queryClient, isOnline: () => true };
    const first = performSetCommunityJoinLinkPaused({ link, paused: true, deps });
    expect(await performSetCommunityJoinLinkPaused({ link, paused: false, deps })).toBe('busy');
    expect(await first).toBe('done');
    expect(requests).toHaveLength(1);
  });
});
