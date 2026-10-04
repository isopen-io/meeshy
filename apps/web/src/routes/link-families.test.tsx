import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AffiliateToken, Referral } from '@/lib/api/affiliate-tokens';
import type { CommunityLink } from '@/lib/api/community-links';
import type { MyTrackingLink, TrackingClick } from '@/lib/api/my-tracking-links';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadLinkFamiliesCatalog } from '@/lib/i18n-link-families-catalog';
import { compile, match } from '@/lib/router';

import { AffiliateTokenRow, ReferralList } from './affiliate-links';
import { communityInfoRows } from './community-link';
import { CommunityLinkRow } from './community-links';
import { BreakdownCard, FamilyStats, HUB_FAMILIES, LinkFamilyCard } from './link-families-parts';
import { RecentClicks, utmRows } from './my-tracking-link';
import { TrackingLinkRow } from './my-tracking-links';
import { ROUTES } from './route-table';

/**
 * LES TROIS AUTRES FAMILLES DE « MES LIENS » DESSINÉES (#6408, #6409, #6410) —
 * chaque pièce rendue sans DOM ni TanStack Query : où elle MÈNE, ce qu'elle DIT
 * à un lecteur d'écran, et ce qu'elle ne dessine PAS.
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadLinkFamiliesCatalog('fr')]);
});

const noop = () => undefined;
const routeFor = (path: string) => Object.entries(ROUTES).find(([, route]) => match(compile(route.pattern), path) !== null)?.[0];

const trackingLink = (overrides: Partial<MyTrackingLink> = {}): MyTrackingLink => ({
  token: 'rentree',
  name: 'Rentrée',
  campaign: 'rentree',
  source: 'instagram',
  medium: null,
  originalUrl: 'https://meeshy.me/decouvrir',
  totalClicks: 1,
  uniqueClicks: 1,
  isActive: true,
  expiresAt: null,
  createdAt: '2026-09-01T08:00:00.000Z',
  lastClickedAt: null,
  ...overrides,
});

const affiliateToken = (overrides: Partial<AffiliateToken> = {}): AffiliateToken => ({
  id: 'a1',
  token: 'AmisDeJC',
  name: 'Invitation amis',
  maxUses: null,
  currentUses: 2,
  referrals: 2,
  isActive: true,
  expiresAt: null,
  createdAt: '2026-08-14T09:00:00.000Z',
  ...overrides,
});

const community = (overrides: Partial<CommunityLink> = {}): CommunityLink => ({
  id: 'cm1',
  name: 'Meeshy Paris',
  identifier: 'mshy_meeshy-paris',
  avatar: null,
  isPrivate: false,
  role: 'admin',
  memberCount: 248,
  createdAt: null,
  ...overrides,
});

describe('les adresses', () => {
  test('chaque famille a sa liste, et « new » n’est jamais lu comme un jeton', () => {
    expect(routeFor('/links/tracking')).toBe('myTrackingLinks');
    expect(routeFor('/links/tracking/new')).toBe('myTrackingLinkNew');
    expect(routeFor('/links/tracking/rentree')).toBe('myTrackingLink');
    expect(routeFor('/links/affiliate')).toBe('affiliateLinks');
    expect(routeFor('/links/affiliate/new')).toBe('affiliateLinkNew');
    expect(routeFor('/links/communities')).toBe('communityLinks');
    expect(routeFor('/links/communities/cm1')).toBe('communityLink');
  });

  test('le lien PUBLIC d’un lien suivi garde son adresse `/l/:token`', () => {
    expect(routeFor('/l/rentree')).toBe('trackingLink');
  });
});

describe('le hub', () => {
  test('les quatre familles d’iOS, dans son ordre', () => {
    expect(HUB_FAMILIES).toEqual(['share', 'tracking', 'community', 'affiliate']);
  });

  test('chaque carte ouvre sa famille', () => {
    const opens = HUB_FAMILIES.map((family) => /data-links-family-open[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-links-family-open/.exec(renderToStaticMarkup(<LinkFamilyCard language="fr" family={family} />)));
    expect(opens.map((found) => found?.[1] ?? found?.[2])).toEqual(['/links/share', '/links/tracking', '/links/communities', '/links/affiliate']);
  });

  test('« + » ouvre la création — sauf la communauté, où l’on ne crée pas de lien', () => {
    expect(renderToStaticMarkup(<LinkFamilyCard language="fr" family="tracking" />)).toContain('href="/links/tracking/new"');
    expect(renderToStaticMarkup(<LinkFamilyCard language="fr" family="affiliate" />)).toContain('href="/links/affiliate/new"');
    expect(renderToStaticMarkup(<LinkFamilyCard language="fr" family="community" />)).not.toContain('data-links-family-create');
  });
});

describe('les agrégats', () => {
  test('une valeur non servie se dit « — », jamais « 0 »', () => {
    const html = renderToStaticMarkup(<FamilyStats language="fr" tint="red" items={[{ stat: 'members', glyph: null, value: null, label: 'Membres' }]} />);
    expect(html).toContain('—');
    expect(html).not.toContain('>0<');
  });
});

describe('les liens de suivi', () => {
  test('la ligne ouvre le détail, dit son état et ses clics au lecteur d’écran', () => {
    const html = renderToStaticMarkup(<TrackingLinkRow language="fr" link={trackingLink({ isActive: false })} copied={false} onCopy={noop} />);
    expect(html).toContain('href="/links/tracking/rentree"');
    expect(html).toMatch(/aria-label="Rentrée, Inactif, 1 clic et 1 unique"/);
    expect(html).toContain('aria-label="Copier le lien de suivi"');
  });

  test('sans nom, la ligne prend le jeton', () => {
    expect(renderToStaticMarkup(<TrackingLinkRow language="fr" link={trackingLink({ name: null })} copied={false} onCopy={noop} />)).toContain('>rentree<');
  });

  test('la configuration UTM ne montre que les paramètres posés', () => {
    const keys = utmRows('fr', trackingLink()).map((row) => row.key);
    expect(keys).toEqual(['campaign', 'source', 'destination', 'createdAt']);
  });

  test('une ventilation vide le dit, une pleine montre ses parts', () => {
    expect(renderToStaticMarkup(<BreakdownCard language="fr" name="countries" title="Pays" glyph={null} tint="red" items={[]} />)).toContain('Aucune donnée');
    const full = renderToStaticMarkup(<BreakdownCard language="fr" name="countries" title="Pays" glyph={null} tint="red" items={[{ label: 'France', count: 3 }, { label: 'Cameroun', count: 1 }]} />);
    expect(full).toContain('width:75%');
    expect(full).toContain('width:25%');
  });

  test('un clic se lit par son lieu et dit l’issue de sa redirection en toutes lettres', () => {
    const clicks: readonly TrackingClick[] = [
      { id: 'c1', country: 'France', city: 'Lyon', device: 'desktop', browser: 'Firefox', socialSource: null, redirectStatus: 'failed', clickedAt: '2026-10-03T19:12:00.000Z' },
      { id: 'c2', country: null, city: null, device: null, browser: null, socialSource: null, redirectStatus: 'confirmed', clickedAt: '2026-10-03T19:12:00.000Z' },
    ];
    const html = renderToStaticMarkup(<RecentClicks language="fr" clicks={clicks} />);
    expect(html).toContain('Lyon, France');
    expect(html).toContain('Ordinateur · Firefox');
    expect(html).toContain('Redirection échouée');
    expect(html).toContain('Lieu inconnu');
  });
});

describe('les liens de parrainage', () => {
  test('un jeton n’a pas de détail : la ligne n’est pas un lien, ses trois gestes sont nommés', () => {
    const html = renderToStaticMarkup(<AffiliateTokenRow language="fr" token={affiliateToken()} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />);
    expect(html).not.toContain('<a');
    expect(html).toContain('aria-label="Copier le lien de parrainage"');
    expect(html).toContain('aria-label="Partager le lien de parrainage"');
    expect(html).toContain('aria-label="Supprimer le lien de parrainage"');
  });

  test('un plafond se lit « utilisés sur maximum », et un lien complet se dit inactif', () => {
    const html = renderToStaticMarkup(<AffiliateTokenRow language="fr" token={affiliateToken({ maxUses: 50, currentUses: 50, isActive: false })} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />);
    expect(html).toContain('50 sur 50');
    expect(html).toContain('Inactif');
  });

  test('aucun clic n’est peint : la passerelle n’en compte pas', () => {
    expect(renderToStaticMarkup(<AffiliateTokenRow language="fr" token={affiliateToken()} copied={false} onCopy={noop} onShare={noop} onDelete={noop} />)).not.toMatch(/clic/i);
  });

  test('les filleuls disent leur état ; sans filleul, la liste le dit', () => {
    const referrals: readonly Referral[] = [{ id: 'r1', name: 'Awa Ndiaye', username: 'awa', status: 'pending', createdAt: null }];
    expect(renderToStaticMarkup(<ReferralList language="fr" referrals={referrals} />)).toContain('En attente');
    expect(renderToStaticMarkup(<ReferralList language="fr" referrals={[]} />)).toContain('Personne ne s’est encore inscrit');
  });
});

describe('les liens communauté', () => {
  test('la ligne ouvre le détail et dit membres, rôle et visibilité', () => {
    const html = renderToStaticMarkup(<CommunityLinkRow language="fr" link={community()} copied={false} onCopy={noop} />);
    expect(html).toContain('href="/links/communities/cm1"');
    expect(html).toContain('248 membres\u00a0· Administrateur\u00a0· Publique');
  });

  test('un nombre de membres non servi ne s’invente pas', () => {
    const html = renderToStaticMarkup(<CommunityLinkRow language="fr" link={community({ memberCount: null, role: 'moderator', isPrivate: true })} copied={false} onCopy={noop} />);
    expect(html).not.toContain('membre');
    expect(html).toContain('Modérateur\u00a0· Privée');
  });

  test('le détail montre l’adresse complète, et pas de date qu’on n’a pas', () => {
    const rows = communityInfoRows('fr', community(), 'https://meeshy.me/communities/mshy_meeshy-paris');
    expect(rows.map((row) => row.key)).toEqual(['identifier', 'fullLink', 'members', 'role', 'visibility']);
  });
});
