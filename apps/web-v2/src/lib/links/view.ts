import { shareLinkUrl, type MyShareLink, type ShareLinksData, type ShareLinksPage, type ShareLinksSummary } from '@/lib/api/links';

/**
 * **LES RÈGLES PURES DE « MES LIENS »** (#6361) — ce que la liste, le détail
 * et les gestes partagent, sans DOM ni réseau.
 */

/** Miroir `MyShareLink.joinUrl` — l'identifiant lisible d'abord, le linkId sinon. */
export const joinUrlOf = (link: MyShareLink, origin: string): string =>
  shareLinkUrl(origin, encodeURIComponent(link.identifier ?? link.linkId));

/** Miroir `MyShareLink.displayName`. */
export const displayNameOf = (link: MyShareLink): string =>
  [link.name, link.identifier].map((value) => value?.trim() ?? '').find((value) => value !== '') ?? link.linkId;

/**
 * « Activer » n'a d'effet que sur un lien désactivé À LA MAIN. Une conversation
 * fermée ou une date passée refusent l'entrée quoi que dise `isActive`
 * (`admitLinkEntry`, passerelle) : le bouton mentirait (loi 4), la cause se lit
 * à sa place.
 */
export const canReactivate = (link: MyShareLink): boolean =>
  !link.isActive && (link.inactiveReason === null || link.inactiveReason === 'REVOKED');

export type ShareLinkDetailState = 'ready' | 'loading' | 'searching' | 'refused' | 'error';

/**
 * Ce que le détail peint quand son lien n'est pas (encore) en cache. Le REFUS
 * ne se dit qu'après la dernière page lue : tant qu'il en reste, le lien peut
 * être plus loin, et « introuvable » serait un mensonge le temps d'une page.
 */
export function shareLinkDetailState(flags: {
  readonly found: boolean;
  readonly loaded: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isError: boolean;
}): ShareLinkDetailState {
  if (flags.found) return 'ready';
  if (flags.isError) return 'error';
  if (!flags.loaded || flags.isFetchingNextPage) return 'loading';
  return flags.hasNextPage ? 'searching' : 'refused';
}

export const findShareLink = (data: { readonly pages: readonly ShareLinksPage[] } | undefined, linkId: string): MyShareLink | undefined =>
  data?.pages.flatMap((page) => page.links).find((link) => link.linkId === linkId);

const adjust = (summary: ShareLinksSummary | null, delta: Partial<ShareLinksSummary>): ShareLinksSummary | null =>
  summary === null
    ? null
    : {
        totalLinks: Math.max(0, summary.totalLinks + (delta.totalLinks ?? 0)),
        activeLinks: Math.max(0, summary.activeLinks + (delta.activeLinks ?? 0)),
        totalUses: Math.max(0, summary.totalUses + (delta.totalUses ?? 0)),
      };

export function withLinkActive(data: ShareLinksData | undefined, linkId: string, isActive: boolean): ShareLinksData | undefined {
  const current = findShareLink(data, linkId);
  if (data === undefined || current === undefined || current.isActive === isActive) return data;
  const toggled: MyShareLink = { ...current, isActive, inactiveReason: isActive ? null : 'REVOKED' };
  return {
    ...data,
    pages: data.pages.map((page, index) => ({
      ...page,
      links: page.links.map((link) => (link.linkId === linkId ? toggled : link)),
      summary: index === 0 ? adjust(page.summary, { activeLinks: isActive ? 1 : -1 }) : page.summary,
    })),
  };
}

export function withLinkFirst(data: ShareLinksData | undefined, created: MyShareLink): ShareLinksData | undefined {
  if (data === undefined) return undefined;
  const known = findShareLink(data, created.linkId) !== undefined;
  const delta = known ? {} : { totalLinks: 1, activeLinks: created.isActive ? 1 : 0, totalUses: created.currentUses };
  return {
    ...data,
    pages: data.pages.map((page, index) => {
      const kept = page.links.filter((link) => link.linkId !== created.linkId);
      return index === 0 ? { ...page, links: [created, ...kept], summary: adjust(page.summary, delta) } : { ...page, links: kept };
    }),
  };
}
