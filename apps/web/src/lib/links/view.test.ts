import { describe, expect, test } from 'bun:test';

import type { MyShareLink, ShareLinksData, ShareLinksSummary } from '@/lib/api/links';

import { canReactivate, displayNameOf, findShareLink, joinUrlOf, shareLinkDetailState, withLinkActive, withLinkFirst } from './view';
import { webOriginOf } from './web-origin';

/**
 * LES RÈGLES PURES DE « MES LIENS » (#6361) — ce qu'aucune capture ne dit :
 * quelle adresse un lien PARTAGE, quand « Activer » a un effet, et ce qu'un
 * geste optimiste écrit dans le cache que la liste, le détail et le résumé
 * lisent ensemble.
 */

const link = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Invitation',
  isActive: true,
  currentUses: 3,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Équipe',
  inactiveReason: null,
  description: null,
  policy: null,
  ...overrides,
});

const summaryOf = (links: readonly MyShareLink[]): ShareLinksSummary => ({
  totalLinks: links.length,
  activeLinks: links.filter((row) => row.isActive).length,
  totalUses: links.reduce((sum, row) => sum + row.currentUses, 0),
});

const data = (first: readonly MyShareLink[], second: readonly MyShareLink[] = []): ShareLinksData => {
  const all = [...first, ...second];
  return second.length === 0
    ? { pages: [{ links: first, summary: summaryOf(all), nextOffset: null }], pageParams: [0] }
    : {
        pages: [
          { links: first, summary: summaryOf(all), nextOffset: first.length },
          { links: second, summary: null, nextOffset: null },
        ],
        pageParams: [0, first.length],
      };
};

describe('webOriginOf — l’adresse PUBLIQUE d’un lien, jamais l’origine de la coque', () => {
  test('la passerelle de production partage des liens meeshy.me', () => {
    expect(webOriginOf('https://gate.meeshy.me', 'https://localhost')).toBe('https://meeshy.me');
  });

  test('la passerelle de staging partage des liens staging.meeshy.me', () => {
    expect(webOriginOf('https://gate.staging.meeshy.me', 'https://localhost')).toBe('https://staging.meeshy.me');
  });

  test('une passerelle relative ou locale garde l’origine de la page', () => {
    expect(webOriginOf('', 'http://localhost:5173')).toBe('http://localhost:5173');
    expect(webOriginOf('http://localhost:3000', 'http://localhost:5173')).toBe('http://localhost:5173');
  });
});

describe('joinUrlOf et displayNameOf — miroir `MyShareLink.joinUrl` / `displayName`', () => {
  test('l’identifiant lisible gagne sur le linkId, comme iOS', () => {
    expect(joinUrlOf(link({ identifier: 'equipe-2026' }), 'https://meeshy.me')).toBe('https://meeshy.me/chat/equipe-2026');
    expect(joinUrlOf(link(), 'https://meeshy.me')).toBe('https://meeshy.me/chat/mshy_l1');
  });

  test('un lien sans nom se nomme par son identifiant, puis par son linkId', () => {
    expect(displayNameOf(link())).toBe('Invitation');
    expect(displayNameOf(link({ name: '  ', identifier: 'annonces' }))).toBe('annonces');
    expect(displayNameOf(link({ name: null }))).toBe('mshy_l1');
  });
});

describe('canReactivate — « Activer » n’existe que s’il rend le lien utilisable', () => {
  test('un lien actif ne se réactive pas', () => {
    expect(canReactivate(link())).toBe(false);
  });

  test('un lien désactivé à la main se réactive', () => {
    expect(canReactivate(link({ isActive: false, inactiveReason: 'REVOKED' }))).toBe(true);
  });

  test('une conversation fermée ou une date passée refuseraient l’entrée même réactivé', () => {
    expect(canReactivate(link({ isActive: false, inactiveReason: 'CONVERSATION_CLOSED' }))).toBe(false);
    expect(canReactivate(link({ isActive: false, inactiveReason: 'LINK_EXPIRED' }))).toBe(false);
  });
});

describe('findShareLink — le détail se lit dans la liste de SES liens', () => {
  test('trouve un lien sur une page suivante', () => {
    const found = findShareLink(data([link()], [link({ id: 'l2', linkId: 'mshy_l2' })]), 'mshy_l2');
    expect(found?.id).toBe('l2');
  });

  test('un cache vide ou un linkId absent ne rendent rien', () => {
    expect(findShareLink(undefined, 'mshy_l1')).toBeUndefined();
    expect(findShareLink(data([link()]), 'mshy_autre')).toBeUndefined();
  });
});

describe('withLinkActive — le geste optimiste de (dés)activation', () => {
  test('désactiver pose la cause « retiré » et baisse le compte des actifs', () => {
    const next = withLinkActive(data([link(), link({ id: 'l2', linkId: 'mshy_l2' })]), 'mshy_l2', false);
    const toggled = findShareLink(next, 'mshy_l2');
    expect([toggled?.isActive, toggled?.inactiveReason]).toEqual([false, 'REVOKED']);
    expect(next?.pages[0]?.summary?.activeLinks).toBe(1);
  });

  test('réactiver efface la cause et remonte le compte', () => {
    const next = withLinkActive(data([link({ isActive: false, inactiveReason: 'REVOKED' })]), 'mshy_l1', true);
    const toggled = findShareLink(next, 'mshy_l1');
    expect([toggled?.isActive, toggled?.inactiveReason]).toEqual([true, null]);
    expect(next?.pages[0]?.summary?.activeLinks).toBe(1);
  });

  test('un lien absent ou déjà dans l’état visé ne touche PAS au résumé', () => {
    const before = data([link()]);
    expect(withLinkActive(before, 'mshy_absent', false)?.pages[0]?.summary).toEqual(before.pages[0]?.summary ?? null);
    expect(withLinkActive(before, 'mshy_l1', true)?.pages[0]?.summary?.activeLinks).toBe(1);
  });

  test('un lien sur la seconde page met à jour le résumé porté par la PREMIÈRE', () => {
    const next = withLinkActive(data([link()], [link({ id: 'l2', linkId: 'mshy_l2' })]), 'mshy_l2', false);
    expect(next?.pages[0]?.summary?.activeLinks).toBe(1);
    expect(next?.pages[1]?.summary).toBeNull();
  });
});

describe('shareLinkDetailState — le refus ne se dit qu’après la DERNIÈRE page', () => {
  const flags = (overrides: Partial<Parameters<typeof shareLinkDetailState>[0]> = {}) => ({
    found: false,
    loaded: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    ...overrides,
  });

  test('un lien trouvé se lit, même pendant qu’une page suivante charge', () => {
    expect(shareLinkDetailState(flags({ found: true, hasNextPage: true, isFetchingNextPage: true }))).toBe('ready');
  });

  test('rien de chargé : le squelette ; rien de chargé et une erreur : l’erreur', () => {
    expect(shareLinkDetailState(flags({ loaded: false }))).toBe('loading');
    expect(shareLinkDetailState(flags({ loaded: false, isError: true }))).toBe('error');
  });

  test('des pages restent : on les charge, on ne refuse PAS', () => {
    expect(shareLinkDetailState(flags({ hasNextPage: true }))).toBe('searching');
    expect(shareLinkDetailState(flags({ hasNextPage: true, isFetchingNextPage: true }))).toBe('loading');
  });

  test('la dernière page lue sans le lien : le refus', () => {
    expect(shareLinkDetailState(flags())).toBe('refused');
  });

  test('une page suivante en échec : l’erreur, jamais un refus', () => {
    expect(shareLinkDetailState(flags({ hasNextPage: true, isError: true }))).toBe('error');
  });
});

describe('withLinkFirst — un lien créé se lit en tête, et compte', () => {
  test('pose le lien en tête et incrémente le résumé', () => {
    const next = withLinkFirst(data([link()]), link({ id: 'l9', linkId: 'mshy_l9', currentUses: 0 }));
    expect(next?.pages[0]?.links.map((row) => row.linkId)).toEqual(['mshy_l9', 'mshy_l1']);
    expect(next?.pages[0]?.summary).toEqual({ totalLinks: 2, activeLinks: 2, totalUses: 3 });
  });

  test('aucune liste en cache : rien n’est fabriqué', () => {
    expect(withLinkFirst(undefined, link())).toBeUndefined();
  });
});
