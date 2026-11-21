/**
 * L'onglet « Liens » des médias partagés de la fiche d'un autre (#19200, vue
 * `Autre-Commun` : Photos · Vidéos · Audio · Liens · Fichiers).
 *
 * Un lien n'est pas une pièce jointe : il se lit dans le TEXTE des messages des
 * conversations partagées. Le périmètre est celui des pièces (`sharedScope` :
 * les deux participations actives, hors bout en bout, plancher d'historique du
 * lecteur fail-closed), et les mêmes exclusions s'appliquent au message —
 * éphémère, vue unique, flouté, chiffré, supprimé, effet posé par son seul bit
 * (`protectedAttachmentFilter.ts`), masquage personnel du lecteur. Seuls les
 * messages d'un PARTICIPANT comptent (`messageSource: 'user'`).
 *
 * Les adresses sortent par `segmentText` (shared), le découpeur que les clients
 * rendent : un lien listé ici est un lien que la bulle souligne, et rien d'autre
 * (une adresse e-mail n'est pas un lien partagé).
 *
 * Les nombres se comptent sur les liens déjà passés par tous les filtres, dans
 * la fenêtre des {@link SHARED_LINKS_COUNT_SCAN} messages les plus récents qui
 * en portent (`countsCapped` le dit).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { segmentText, type TextSegment } from '@meeshy/shared/utils/text-segments';
import { buildCursorPaginationMeta } from '../../utils/pagination';
import { loadPersonalHistoryHidingByConversation, type PersonalHistoryHiding } from '../personalHistoryFilter';
import { PROTECTION_MESSAGE_SELECT, messageIsProtected, messageProtectionWhereExclusion } from '../attachments/protectedAttachmentFilter';
import { hiddenFromReader, sharedMedia, sharedScope, type SharedAttachmentKind, type SharedMediaPage, type SharedScope } from './sharedMedia';

export const SHARED_LINKS_COUNT_SCAN = 1000;

export type SharedLinkItem = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly url: string;
  readonly domain: string;
  readonly createdAt: Date;
};

export type SharedMediaPart = SharedMediaPage & {
  readonly links?: readonly SharedLinkItem[];
};

type LinkMessageRow = {
  id: string;
  conversationId: string;
  content: string;
  createdAt: Date;
  isEncrypted: boolean;
  isViewOnce: boolean;
  isBlurred: boolean;
  effectFlags: number;
  expiresAt: Date | null;
};

const LINK_MESSAGE_SELECT = { id: true, conversationId: true, content: true, createdAt: true, ...PROTECTION_MESSAGE_SELECT } as const;

const HTTP_HREF = /^https?:\/\//i;

const hrefsOf = (segments: readonly TextSegment[]): readonly string[] =>
  segments.flatMap((segment) => {
    if (segment.kind === 'emphasis') return hrefsOf(segment.children);
    if (segment.kind === 'url') return HTTP_HREF.test(segment.href) ? [segment.href] : [];
    if (segment.kind === 'tracked-link') return segment.url && HTTP_HREF.test(segment.url) ? [segment.url] : [];
    return [];
  });

const domainOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
};

const linksOf = (row: LinkMessageRow): readonly SharedLinkItem[] =>
  [...new Set(hrefsOf(segmentText(row.content)))].flatMap((url) => {
    const domain = domainOf(url);
    return domain ? [{ messageId: row.id, conversationId: row.conversationId, url, domain, createdAt: row.createdAt }] : [];
  });

const servable = (row: LinkMessageRow, hiding: ReadonlyMap<string, PersonalHistoryHiding>): boolean =>
  !messageIsProtected(row) && !hiddenFromReader(hiding, row);

const linkWhere = (scope: SharedScope): Record<string, unknown> => ({
  conversationId: { in: [...scope.conversationIds] },
  deletedAt: null,
  messageSource: 'user',
  ...scope.historyFloor,
  ...messageProtectionWhereExclusion(),
  content: { contains: 'http' },
});

async function readLinks(
  prisma: PrismaClient,
  params: { readonly viewerId: string; readonly scope: SharedScope; readonly page: boolean; readonly cursor?: string; readonly limit: number },
) {
  const where = linkWhere(params.scope);
  const cursorRow =
    params.page && params.cursor
      ? await prisma.message.findFirst({ where: { id: params.cursor }, select: { createdAt: true } })
      : null;
  const [window, page, hiding] = await Promise.all([
    prisma.message.findMany({ where, select: LINK_MESSAGE_SELECT, orderBy: { createdAt: 'desc' }, take: SHARED_LINKS_COUNT_SCAN }) as unknown as Promise<LinkMessageRow[]>,
    params.page
      ? (prisma.message.findMany({
          where: { ...where, ...(cursorRow ? { createdAt: { lt: cursorRow.createdAt } } : {}) },
          select: LINK_MESSAGE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: params.limit,
        }) as unknown as Promise<LinkMessageRow[]>)
      : Promise.resolve([] as LinkMessageRow[]),
    loadPersonalHistoryHidingByConversation(prisma, { userId: params.viewerId, conversationIds: [...params.scope.conversationIds] }),
  ]);
  return {
    count: window.filter((row) => servable(row, hiding)).flatMap(linksOf).length,
    capped: window.length >= SHARED_LINKS_COUNT_SCAN,
    items: page.filter((row) => servable(row, hiding)).flatMap(linksOf),
    pagination: buildCursorPaginationMeta(params.limit, page.length, page.length > 0 ? page[page.length - 1].id : null),
  };
}

/**
 * La partie « médias » entière : pièces jointes ET liens, sur UN périmètre lu
 * une fois. `kind: 'link'` rend la page des liens (`links`, `items` vide) ;
 * tout autre type rend la page des pièces. Les nombres portent les cinq onglets.
 */
export async function sharedMediaPart(
  prisma: PrismaClient,
  params: {
    readonly viewerId: string;
    readonly targetId: string;
    readonly kind?: SharedAttachmentKind | 'link';
    readonly cursor?: string;
    readonly limit: number;
  },
): Promise<SharedMediaPart> {
  const scope = await sharedScope(prisma, params.viewerId, params.targetId);
  const wantsLinks = params.kind === 'link';
  const attachmentKind = params.kind === 'link' ? undefined : params.kind;
  const attachments = await sharedMedia(prisma, {
    ...params,
    scope,
    kind: attachmentKind,
    cursor: wantsLinks ? undefined : params.cursor,
  });
  if (!scope) return wantsLinks ? { ...attachments, items: [], links: [] } : attachments;

  const links = await readLinks(prisma, { viewerId: params.viewerId, scope, page: wantsLinks, cursor: params.cursor, limit: params.limit });
  const counts = { ...attachments.counts, link: links.count };
  const countsCapped = attachments.countsCapped || links.capped;
  return wantsLinks
    ? { counts, countsCapped, items: [], links: links.items, pagination: links.pagination }
    : { ...attachments, counts, countsCapped };
}
