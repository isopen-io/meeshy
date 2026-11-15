import type { AffiliateStats, AffiliateToken, AffiliateTokensPage, CreateAffiliateTokenBody } from './affiliate-tokens';
import type { CommunityLink } from './community-links';
import type { CreateTrackingLinkBody, MyTrackingLink, TrackingClick, TrackingLinkStats, TrackingLinksPage, TrackingLinksSummary } from './my-tracking-links';

/**
 * LE CORPUS DE RECETTE DES TROIS FAMILLES DE LIENS (#6408, #6409, #6410) —
 * chargé en `import()` par les ports, élagué des builds
 * `VITE_DATA_SOURCE=gateway` (`__FIXTURES__`).
 */

const TRACKING_LINKS: readonly MyTrackingLink[] = [
  {
    token: 'rentree',
    name: 'Rentrée 2026',
    campaign: 'rentree',
    source: 'instagram',
    medium: 'social',
    originalUrl: 'https://meeshy.me/decouvrir',
    totalClicks: 1284,
    uniqueClicks: 903,
    isActive: true,
    expiresAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    lastClickedAt: '2026-10-03T19:12:00.000Z',
  },
  {
    token: 'news42',
    name: 'Lettre d’information',
    campaign: null,
    source: 'newsletter',
    medium: 'email',
    originalUrl: 'https://meeshy.me/nouveautes',
    totalClicks: 212,
    uniqueClicks: 180,
    isActive: true,
    expiresAt: null,
    createdAt: '2026-09-12T10:30:00.000Z',
    lastClickedAt: '2026-10-02T07:45:00.000Z',
  },
  {
    token: 'ete25',
    name: null,
    campaign: 'ete',
    source: null,
    medium: null,
    originalUrl: 'https://meeshy.me/ete',
    totalClicks: 37,
    uniqueClicks: 30,
    isActive: false,
    expiresAt: '2026-08-31T23:59:00.000Z',
    createdAt: '2026-06-20T09:00:00.000Z',
    lastClickedAt: '2026-08-28T16:00:00.000Z',
  },
];

export const fixtureTrackingLinksPage = (offset: number): TrackingLinksPage => ({ links: offset === 0 ? TRACKING_LINKS : [], nextOffset: null });

export const fixtureTrackingLinksSummary = (): TrackingLinksSummary => ({
  totalLinks: TRACKING_LINKS.length,
  activeLinks: TRACKING_LINKS.filter((link) => link.isActive).length,
  totalClicks: TRACKING_LINKS.reduce((sum, link) => sum + link.totalClicks, 0),
  uniqueClicks: TRACKING_LINKS.reduce((sum, link) => sum + link.uniqueClicks, 0),
});

export const fixtureTrackingLinkStats = (token: string): TrackingLinkStats => {
  const link = TRACKING_LINKS.find((candidate) => candidate.token === token);
  return {
    totalClicks: link?.totalClicks ?? 0,
    uniqueClicks: link?.uniqueClicks ?? 0,
    countries: link === undefined ? [] : [
      { label: 'France', count: Math.round(link.totalClicks * 0.52) },
      { label: 'Cameroun', count: Math.round(link.totalClicks * 0.28) },
      { label: 'Belgique', count: Math.round(link.totalClicks * 0.12) },
    ],
    devices: link === undefined ? [] : [
      { label: 'mobile', count: Math.round(link.totalClicks * 0.71) },
      { label: 'desktop', count: Math.round(link.totalClicks * 0.25) },
      { label: 'tablet', count: Math.round(link.totalClicks * 0.04) },
    ],
    browsers: link === undefined ? [] : [
      { label: 'Safari', count: Math.round(link.totalClicks * 0.46) },
      { label: 'Chrome', count: Math.round(link.totalClicks * 0.41) },
    ],
    socialSources: link === undefined ? [] : [{ label: 'WhatsApp', count: Math.round(link.totalClicks * 0.33) }],
  };
};

export const fixtureTrackingClicks = (token: string): readonly TrackingClick[] =>
  TRACKING_LINKS.some((link) => link.token === token && link.totalClicks > 0)
    ? [
        { id: `${token}-c1`, country: 'France', city: 'Lyon', device: 'mobile', browser: 'Safari', socialSource: 'WhatsApp', redirectStatus: 'confirmed', clickedAt: '2026-10-03T19:12:00.000Z' },
        { id: `${token}-c2`, country: 'Cameroun', city: 'Douala', device: 'mobile', browser: 'Chrome', socialSource: null, redirectStatus: 'confirmed', clickedAt: '2026-10-03T08:40:00.000Z' },
        { id: `${token}-c3`, country: 'Belgique', city: null, device: 'desktop', browser: 'Firefox', socialSource: null, redirectStatus: 'failed', clickedAt: '2026-10-02T21:05:00.000Z' },
      ]
    : [];

export const fixtureCreateTrackingLink = (body: CreateTrackingLinkBody, now: Date): MyTrackingLink => ({
  token: body.customToken ?? `fx${now.getTime().toString(36).slice(-4)}`,
  name: body.name ?? null,
  campaign: body.campaign ?? null,
  source: body.source ?? null,
  medium: body.medium ?? null,
  originalUrl: body.originalUrl,
  totalClicks: 0,
  uniqueClicks: 0,
  isActive: true,
  expiresAt: null,
  createdAt: now.toISOString(),
  lastClickedAt: null,
});

const AFFILIATE_TOKENS: readonly AffiliateToken[] = [
  { id: 'aff1', token: 'AmisDeJC', name: 'Invitation amis', maxUses: null, currentUses: 14, referrals: 14, isActive: true, expiresAt: null, createdAt: '2026-08-14T09:00:00.000Z' },
  { id: 'aff2', token: 'Conf2026', name: 'Conférence Douala', maxUses: 50, currentUses: 50, referrals: 50, isActive: false, expiresAt: null, createdAt: '2026-07-02T09:00:00.000Z' },
];

export const fixtureAffiliateTokensPage = (offset: number): AffiliateTokensPage => ({ tokens: offset === 0 ? AFFILIATE_TOKENS : [], nextOffset: null });

export const fixtureAffiliateStats = (): AffiliateStats => ({
  totalTokens: AFFILIATE_TOKENS.length,
  totalReferrals: 64,
  completedReferrals: 58,
  pendingReferrals: 6,
  referrals: [
    { id: 'r1', name: 'Awa Ndiaye', username: 'awa', status: 'completed', createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'r2', name: '@tchoupi', username: 'tchoupi', status: 'pending', createdAt: '2026-09-29T18:00:00.000Z' },
  ],
});

export const fixtureCreateAffiliateToken = (body: CreateAffiliateTokenBody, now: Date): AffiliateToken => ({
  id: `aff-${now.getTime()}`,
  token: `fx${now.getTime().toString(36).slice(-6)}`,
  name: body.name,
  maxUses: body.maxUses ?? null,
  currentUses: 0,
  referrals: 0,
  isActive: true,
  expiresAt: null,
  createdAt: now.toISOString(),
});

export const fixtureCommunityLinks = (): readonly CommunityLink[] => [
  { id: 'cm1', name: 'Meeshy Paris', identifier: 'mshy_meeshy-paris', avatar: null, isPrivate: false, role: 'admin', memberCount: 248, createdAt: '2026-05-10T12:00:00.000Z' },
  { id: 'cm2', name: 'Support lycée Njanda', identifier: 'mshy_support-lycee-njanda', avatar: null, isPrivate: true, role: 'moderator', memberCount: 37, createdAt: '2026-06-02T12:00:00.000Z' },
];
