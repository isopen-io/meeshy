import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { communityQueryKey, decodeCommunity, type CommunitySummary } from './communities';
import { performJoinCommunity, type CommunityActionDeps } from './community-actions';
import { communityLinkUrl } from './community-links';
import { createHttpTransport } from './http';
import { arrivesThroughLink, membershipNoticeOf } from '@/lib/communities/view';

/**
 * ENTRER PAR LE LIEN D'UNE COMMUNAUTÉ (#20330) — l'adresse partagée est la
 * page de la communauté marquée `?via=link` ; rejoindre depuis elle envoie
 * `via: "link"` (compté, et refusé quand un intendant a mis le lien en pause,
 * #19661) ; le refus `COMMUNITY_LINK_PAUSED` se dit, jamais en erreur générique.
 */

const club = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-club',
  identifier: 'mshy_club',
  name: 'Club',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u-owner',
  memberCount: 10,
  conversationCount: 1,
  viewerRole: null,
  ...overrides,
});

const depsReplying = (status: number, body: unknown) => {
  const bodies: unknown[] = [];
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    bodies.push(init?.body === undefined ? undefined : JSON.parse(String(init.body)));
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  const queryClient = new QueryClient();
  const deps: CommunityActionDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    queryClient,
    isOnline: () => true,
  };
  return { bodies, deps, queryClient };
};

describe('l’adresse partagée d’une communauté', () => {
  test('est sa page, marquée comme une arrivée par le lien', () => {
    expect(communityLinkUrl('https://meeshy.me', 'mshy_club')).toBe('https://meeshy.me/communities/mshy_club?via=link');
  });

  test('seule une adresse marquée `via=link` est une arrivée par le lien', () => {
    expect(arrivesThroughLink(new URLSearchParams('via=link'))).toBe(true);
    expect(arrivesThroughLink(new URLSearchParams(''))).toBe(false);
    expect(arrivesThroughLink(new URLSearchParams('via=share'))).toBe(false);
  });
});

describe('le détail dit si le lien est en pause', () => {
  test('servi vrai ou faux, il se lit ; absent (passerelle plus ancienne), il reste inconnu', () => {
    expect(decodeCommunity({ id: 'm-club', name: 'Club', joinLinkPaused: true })?.joinLinkPaused).toBe(true);
    expect(decodeCommunity({ id: 'm-club', name: 'Club', joinLinkPaused: false })?.joinLinkPaused).toBe(false);
    expect('joinLinkPaused' in (decodeCommunity({ id: 'm-club', name: 'Club' }) ?? {})).toBe(false);
  });
});

describe('rejoindre par le lien', () => {
  test('envoie `via: "link"` avec la lecture des demandes en attente', async () => {
    const { bodies, deps } = depsReplying(200, { success: true, data: {} });
    expect(await performJoinCommunity({ community: club(), deps, via: 'link' })).toEqual({ status: 'joined' });
    expect(bodies).toEqual([{ acceptsPending: true, via: 'link' }]);
  });

  test('sans le lien, la jonction reste directe : aucun `via`', async () => {
    const { bodies, deps } = depsReplying(200, { success: true, data: {} });
    await performJoinCommunity({ community: club(), deps });
    expect(bodies).toEqual([{ acceptsPending: true }]);
  });

  test('un lien en pause : le cache d’avant, et le refus se nomme', async () => {
    const { deps, queryClient } = depsReplying(403, { success: false, error: 'This community link is paused', code: 'COMMUNITY_LINK_PAUSED' });
    const before = club();
    queryClient.setQueryData(communityQueryKey('mshy_club'), before);
    expect(await performJoinCommunity({ community: before, deps, via: 'link' })).toEqual({ status: 'linkPaused' });
    expect(queryClient.getQueryData(communityQueryKey('mshy_club'))).toEqual(before);
  });

  test('un autre 403 reste le refus d’une communauté privée', async () => {
    const { deps } = depsReplying(403, { success: false, error: 'private' });
    expect(await performJoinCommunity({ community: club(), deps, via: 'link' })).toEqual({ status: 'refused' });
  });
});

describe('ce que l’écran dit sous le geste', () => {
  test('arrivé par un lien en pause, la pause se dit AVANT le geste', () => {
    expect(membershipNoticeOf({ action: 'join', throughLink: true, community: club({ joinLinkPaused: true }), failure: null })).toBe('linkPaused');
    expect(membershipNoticeOf({ action: 'request', throughLink: true, community: club({ joinLinkPaused: true }), failure: null })).toBe('linkPaused');
  });

  test('sans lien, lien actif ou état inconnu, rien ne se dit d’avance', () => {
    expect(membershipNoticeOf({ action: 'join', throughLink: false, community: club({ joinLinkPaused: true }), failure: null })).toBeNull();
    expect(membershipNoticeOf({ action: 'join', throughLink: true, community: club({ joinLinkPaused: false }), failure: null })).toBeNull();
    expect(membershipNoticeOf({ action: 'join', throughLink: true, community: club(), failure: null })).toBeNull();
  });

  test('déjà membre, rien ne se dit de la pause', () => {
    expect(membershipNoticeOf({ action: 'leave', throughLink: true, community: club({ joinLinkPaused: true }), failure: null })).toBeNull();
  });

  test('un échec du geste l’emporte sur l’annonce', () => {
    expect(membershipNoticeOf({ action: 'join', throughLink: true, community: club({ joinLinkPaused: true }), failure: 'offline' })).toBe('offline');
  });
});
