import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import {
  AFFILIATE_TOKENS_QUERY_KEY,
  affiliateLinkUrl,
  decodeAffiliateStats,
  decodeAffiliateToken,
  loadAffiliateTokens,
  validateAffiliateTokenDraft,
  type AffiliateTokensData,
} from './affiliate-tokens';
import { communityLinkUrl, decodeCommunityLink, loadCommunityLinks, summarizeCommunityLinks } from './community-links';
import type { ApiResult, HttpTransport } from './http';
import { performCreateTrackingLink, performDeleteAffiliateToken, performSetTrackingLinkActive } from './link-family-actions';
import {
  decodeTrackingLink,
  decodeTrackingLinkStats,
  loadMyTrackingLinks,
  loadTrackingLinkClicks,
  normalizedUrl,
  TRACKING_LINKS_QUERY_KEY,
  TRACKING_LINKS_SUMMARY_QUERY_KEY,
  trackingLinkUrl,
  validateTrackingLinkDraft,
  emptyTrackingLinkDraft,
  type MyTrackingLink,
  type TrackingLinksData,
  type TrackingLinksSummary,
} from './my-tracking-links';

/**
 * LES PORTS DES TROIS AUTRES FAMILLES (#6408, #6409, #6410) — ce qui part sur
 * le réseau, ce qui entre dans le cache persisté (et ce qui n'y entre PAS),
 * et les gestes optimistes avec leur retour arrière.
 */

type Recorded = { readonly method: string; readonly path: string; readonly body?: unknown };

function transportReturning(...results: readonly ApiResult<unknown>[]) {
  const requests: Recorded[] = [];
  let index = 0;
  const transport = {
    request: async (req: Recorded) => {
      requests.push(req);
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
      return result;
    },
  } as unknown as HttpTransport;
  return { transport, requests };
}

const NOW = new Date('2026-10-04T08:00:00.000Z');

const wireTracking = (overrides: Record<string, unknown> = {}) => ({
  id: '65f0',
  token: 'rentree',
  name: 'Rentrée',
  campaign: 'rentree',
  source: '',
  medium: null,
  originalUrl: 'https://meeshy.me/decouvrir',
  shortUrl: 'https://meeshy.me/l/rentree',
  createdBy: 'user-1',
  conversationId: 'conv-1',
  messageId: 'msg-1',
  totalClicks: 12,
  uniqueClicks: 9,
  isActive: true,
  expiresAt: null,
  lastClickedAt: '2026-10-03T19:12:00.000Z',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  ...overrides,
});

describe('les liens de suivi — le port', () => {
  test('la liste lit `/tracking-links/user/me`, cinquante par page, et suit `hasMore`', async () => {
    const { transport, requests } = transportReturning({ ok: true, data: { trackingLinks: [wireTracking()] }, pagination: { total: 51, limit: 50, offset: 0, hasMore: true } });
    const result = await loadMyTrackingLinks({ source: 'gateway', transport, offset: 0 });
    expect(requests[0]?.path).toBe('/api/v1/tracking-links/user/me?offset=0&limit=50');
    expect(result.ok && result.data.nextOffset).toBe(1);
  });

  test('un lien décodé est une PROJECTION : ni créateur, ni conversation, ni message, ni identifiant interne', () => {
    const link = decodeTrackingLink(wireTracking());
    expect(link).not.toBeNull();
    expect(Object.keys(link ?? {})).not.toContain('id');
    expect(JSON.stringify(link)).not.toMatch(/user-1|conv-1|msg-1|65f0/);
    expect(link?.source).toBeNull();
  });

  test('une ligne illisible est écartée, jamais réparée', () => {
    expect(decodeTrackingLink(wireTracking({ token: '' }))).toBeNull();
    expect(decodeTrackingLink(wireTracking({ createdAt: 'hier' }))).toBeNull();
  });

  test('la ventilation est triée, et « unknown » n’est pas une catégorie', () => {
    const stats = decodeTrackingLinkStats({ totalClicks: 6, uniqueClicks: 4, clicksByCountry: { Cameroun: 1, France: 4, unknown: 1, '': 2 }, clicksByDevice: {}, clicksByBrowser: null });
    expect(stats?.countries).toEqual([
      { label: 'France', count: 4 },
      { label: 'Cameroun', count: 1 },
    ]);
    expect(stats?.browsers).toEqual([]);
  });

  test('les derniers clics se lisent par vingt, avec une issue de redirection connue', async () => {
    const { transport, requests } = transportReturning({
      ok: true,
      data: { link: wireTracking(), total: 1, clicks: [{ id: 'c1', country: 'France', redirectStatus: 'bizarre', clickedAt: '2026-10-03T19:12:00.000Z' }] },
    });
    const result = await loadTrackingLinkClicks({ source: 'gateway', transport, token: 'rentree' });
    expect(requests[0]?.path).toBe('/api/v1/tracking-links/rentree/clicks?offset=0&limit=20');
    expect(result.ok && result.data[0]?.redirectStatus).toBe('pending');
  });

  test('l’adresse est celle de la passerelle : `/l/<jeton>`', () => {
    expect(trackingLinkUrl('https://meeshy.me', 'rentree')).toBe('https://meeshy.me/l/rentree');
  });
});

describe('les liens de suivi — la création', () => {
  test('une adresse tapée sans protocole se lit en https ; une chaîne qui n’est pas une adresse web est refusée', () => {
    expect(normalizedUrl('meeshy.me/tarifs')).toBe('https://meeshy.me/tarifs');
    expect(normalizedUrl('abc')).toBeNull();
    expect(normalizedUrl('javascript:alert(1)')).toBeNull();
    expect(normalizedUrl('https://a b.com')).toBeNull();
  });

  test('le jeton part en `customToken`, la clé que la passerelle déclare — jamais en `token`', () => {
    const verdict = validateTrackingLinkDraft({ ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me', customToken: 'rentree26', campaign: '  ' });
    expect(verdict).toEqual({ ok: true, body: { originalUrl: 'https://meeshy.me/', customToken: 'rentree26' } });
  });

  test('un jeton trop court ou mal formé, un nom trop long : le champ fautif est nommé', () => {
    expect(validateTrackingLinkDraft({ ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me', customToken: 'abc' })).toEqual({ ok: false, field: 'customToken' });
    expect(validateTrackingLinkDraft({ ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me', customToken: '-abcde' })).toEqual({ ok: false, field: 'customToken' });
    expect(validateTrackingLinkDraft({ ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me', name: 'x'.repeat(33) })).toEqual({ ok: false, field: 'name' });
  });

  test('créé, le lien se pose EN TÊTE de la liste ; un 409 se dit « jeton pris »', async () => {
    const queryClient = new QueryClient();
    const created = transportReturning({ ok: true, status: 201, data: { trackingLink: wireTracking({ token: 'neuf' }) } });
    const outcome = await performCreateTrackingLink({
      draft: { ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me' },
      deps: { source: 'gateway', transport: created.transport, queryClient, isOnline: () => true },
      now: NOW,
    });
    expect(outcome.status).toBe('created');
    expect(queryClient.getQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY)?.pages[0]?.links[0]?.token).toBe('neuf');

    const taken = transportReturning({ ok: false, status: 409, error: 'Ce token existe déjà' });
    const conflict = await performCreateTrackingLink({
      draft: { ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me', customToken: 'rentree' },
      deps: { source: 'gateway', transport: taken.transport, queryClient, isOnline: () => true },
      now: NOW,
    });
    expect(conflict.status).toBe('conflict');
  });

  test('hors ligne, rien ne part', async () => {
    const { transport, requests } = transportReturning({ ok: true, data: {} });
    const outcome = await performCreateTrackingLink({
      draft: { ...emptyTrackingLinkDraft(), originalUrl: 'meeshy.me' },
      deps: { source: 'gateway', transport, queryClient: new QueryClient(), isOnline: () => false },
      now: NOW,
    });
    expect(outcome.status).toBe('offline');
    expect(requests).toHaveLength(0);
  });
});

describe('les liens de suivi — désactiver', () => {
  const seeded = () => {
    const queryClient = new QueryClient();
    const link = decodeTrackingLink(wireTracking()) as MyTrackingLink;
    queryClient.setQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY, { pages: [{ links: [link], nextOffset: null }], pageParams: [0] });
    queryClient.setQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY, { totalLinks: 1, activeLinks: 1, totalClicks: 12, uniqueClicks: 9 });
    return { queryClient, link };
  };

  test('le geste est optimiste : la ligne ET le compte des actifs changent avant la réponse', async () => {
    const { queryClient, link } = seeded();
    const { transport, requests } = transportReturning({ ok: true, data: { trackingLink: {} } });
    const pending = performSetTrackingLinkActive({ link, isActive: false, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } });
    expect(queryClient.getQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY)?.pages[0]?.links[0]?.isActive).toBe(false);
    expect(queryClient.getQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY)?.activeLinks).toBe(0);
    expect(await pending).toBe('done');
    expect(requests[0]).toEqual({ method: 'PATCH', path: '/api/v1/tracking-links/rentree', body: { isActive: false } });
  });

  test('un refus remet la ligne et le compte', async () => {
    const { queryClient, link } = seeded();
    const { transport } = transportReturning({ ok: false, status: 500, error: 'boom' });
    expect(await performSetTrackingLinkActive({ link, isActive: false, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } })).toBe('failed');
    expect(queryClient.getQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY)?.pages[0]?.links[0]?.isActive).toBe(true);
    expect(queryClient.getQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY)?.activeLinks).toBe(1);
  });
});

describe('le parrainage', () => {
  const wireToken = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    token: 'AmisDeJC',
    name: 'Invitation amis',
    affiliateLink: 'http://localhost:3100/signup/affiliate/AmisDeJC',
    maxUses: null,
    currentUses: 2,
    isActive: true,
    expiresAt: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    _count: { affiliations: 2 },
    ...overrides,
  });

  test('l’adresse se compose sur l’origine publique, jamais sur le `FRONTEND_URL` de la passerelle', () => {
    expect(affiliateLinkUrl('https://meeshy.me', 'AmisDeJC')).toBe('https://meeshy.me/signup/affiliate/AmisDeJC');
    expect(JSON.stringify(decodeAffiliateToken(wireToken(), NOW))).not.toContain('localhost');
  });

  test('« actif » ne se dit jamais d’un lien qui refuserait : échu ou complet, il est inactif', () => {
    expect(decodeAffiliateToken(wireToken({ expiresAt: '2026-10-01T00:00:00.000Z' }), NOW)?.isActive).toBe(false);
    expect(decodeAffiliateToken(wireToken({ maxUses: 2, currentUses: 2 }), NOW)?.isActive).toBe(false);
    expect(decodeAffiliateToken(wireToken({ maxUses: 5 }), NOW)?.isActive).toBe(true);
  });

  test('la liste lit `/affiliate/tokens` et compte les inscrits de chaque jeton', async () => {
    const { transport, requests } = transportReturning({ ok: true, data: [wireToken()], pagination: { total: 1, limit: 50, offset: 0, hasMore: false } });
    const result = await loadAffiliateTokens({ source: 'gateway', transport, offset: 0, now: NOW });
    expect(requests[0]?.path).toBe('/api/v1/affiliate/tokens?offset=0&limit=50');
    expect(result.ok && result.data.tokens[0]?.referrals).toBe(2);
  });

  test('un filleul se nomme par son nom, puis son pseudo ; ni e-mail ni avatar n’entrent', () => {
    const stats = decodeAffiliateStats({
      totalReferrals: 2,
      completedReferrals: 1,
      pendingReferrals: 1,
      referrals: [
        { id: 'r1', status: 'completed', createdAt: '2026-10-01T10:00:00.000Z', referredUser: { id: 'u1', username: 'awa', firstName: 'Awa', lastName: 'Ndiaye', email: 'awa@x.io', avatar: 'a.png' } },
        { id: 'r2', status: 'pending', referredUser: { id: 'u2', username: 'tchoupi' } },
      ],
      tokens: [{}, {}, {}],
    });
    expect(stats?.referrals.map((referral) => referral.name)).toEqual(['Awa Ndiaye', '@tchoupi']);
    expect(stats?.totalTokens).toBe(3);
    expect(JSON.stringify(stats)).not.toMatch(/awa@x\.io|a\.png|u1/);
  });

  test('un nom vide ou un plafond hors bornes est refusé avant le réseau', () => {
    expect(validateAffiliateTokenDraft({ name: '  ', limitUses: false, maxUses: '' })).toEqual({ ok: false, field: 'name' });
    expect(validateAffiliateTokenDraft({ name: 'Amis', limitUses: true, maxUses: '0' })).toEqual({ ok: false, field: 'maxUses' });
    expect(validateAffiliateTokenDraft({ name: 'Amis', limitUses: true, maxUses: '25' })).toEqual({ ok: true, body: { name: 'Amis', maxUses: 25 } });
    expect(validateAffiliateTokenDraft({ name: 'Amis', limitUses: false, maxUses: '25' })).toEqual({ ok: true, body: { name: 'Amis' } });
  });

  test('supprimer est optimiste, et un refus remet le jeton', async () => {
    const queryClient = new QueryClient();
    const token = decodeAffiliateToken(wireToken(), NOW);
    if (token === null) throw new Error('jeton illisible');
    queryClient.setQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY, { pages: [{ tokens: [token], nextOffset: null }], pageParams: [0] });
    const { transport, requests } = transportReturning({ ok: false, status: 404, error: 'absent' });
    const pending = performDeleteAffiliateToken({ token, deps: { source: 'gateway', transport, queryClient, isOnline: () => true } });
    expect(queryClient.getQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY)?.pages[0]?.tokens).toHaveLength(0);
    expect(await pending).toBe('failed');
    expect(requests[0]).toEqual({ method: 'DELETE', path: '/api/v1/affiliate/tokens/a1' });
    expect(queryClient.getQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY)?.pages[0]?.tokens).toHaveLength(1);
  });
});

describe('les liens communauté', () => {
  test('seules les communautés qu’il administre ou modère sont demandées', async () => {
    const { transport, requests } = transportReturning({ ok: true, data: [{ id: 'cm1', name: 'Zèbres', identifier: 'mshy_z', isPrivate: true, role: 'admin' }, { id: 'cm2', name: 'Abeilles', identifier: 'mshy_a', role: 'moderator' }] });
    const result = await loadCommunityLinks({ source: 'gateway', transport });
    expect(requests[0]?.path).toBe('/api/v1/communities/mine?role=admin%2Cmoderator');
    expect(result.ok && result.data.map((link) => link.name)).toEqual(['Abeilles', 'Zèbres']);
  });

  test('un simple membre n’est jamais servi, même si la passerelle le rendait', () => {
    expect(decodeCommunityLink({ id: 'cm1', name: 'X', identifier: 'mshy_x', role: 'member' })).toBeNull();
  });

  test('l’adresse est celle que les deux clients ouvrent : `/communities/<identifiant>`', () => {
    expect(communityLinkUrl('https://meeshy.me', 'mshy_meeshy-paris')).toBe('https://meeshy.me/communities/mshy_meeshy-paris');
  });

  test('le total des membres ne se dit que si chaque ligne le porte', () => {
    const served = decodeCommunityLink({ id: 'a', name: 'A', identifier: 'mshy_a', role: 'admin', isPrivate: false, memberCount: 3 });
    const unknown = decodeCommunityLink({ id: 'b', name: 'B', identifier: 'mshy_b', role: 'admin' });
    if (served === null || unknown === null) throw new Error('illisible');
    expect(summarizeCommunityLinks([served])).toEqual({ communities: 1, publicCommunities: 1, members: 3 });
    expect(summarizeCommunityLinks([served, unknown]).members).toBeNull();
  });
});
