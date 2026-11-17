/**
 * « Médias partagés » de la fiche d'un autre (#19200) : les pièces jointes des
 * conversations où le lecteur ET la cible sont participants actifs, par type
 * (Photos · Vidéos · Audio · Fichiers), comptées et paginées.
 *
 * Mêmes garanties de périmètre que `GET /attachments/search` (#5170), composées
 * et jamais réécrites :
 *   1. appartenance — les DEUX participations actives ;
 *   2. plancher d'historique DU LECTEUR, fail-CLOSED (`loadHistoryFloorsOrFail`) ;
 *   3. masquage personnel du lecteur (effacer l'historique, supprimer pour moi) ;
 *   4. contenu protégé exclu — éphémère, vue unique, flouté, chiffré, au niveau
 *      du message ET de la pièce (`protectedAttachmentFilter.ts`).
 * Et une cinquième : une conversation chiffrée de bout en bout ne rend RIEN —
 * le serveur n'y détient que du chiffré, et rien de ce qu'il en sait (nom,
 * type, taille d'une pièce) ne sort par la fiche d'un autre.
 *
 * Les NOMBRES se comptent sur les lignes déjà passées par les quatre filtres,
 * dans une fenêtre des {@link SHARED_MEDIA_COUNT_SCAN} pièces les plus récentes
 * (`countsCapped` le dit) : un nombre compté avant le second passage compterait
 * ce que la liste refuse de montrer.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { buildCursorPaginationMeta } from '../../utils/pagination';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, historyFloorClause, loadHistoryFloorsOrFail } from '../historyFloor';
import { loadPersonalHistoryHidingByConversation, type PersonalHistoryHiding } from '../personalHistoryFilter';
import {
  PROTECTION_ATTACHMENT_SELECT,
  PROTECTION_MESSAGE_SELECT,
  isProtectedAttachmentRow,
  messageProtectionWhereExclusion,
} from '../attachments/protectedAttachmentFilter';

export const SHARED_MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const;
export type SharedMediaKind = (typeof SHARED_MEDIA_KINDS)[number];

export const isSharedMediaKind = (value: unknown): value is SharedMediaKind =>
  typeof value === 'string' && (SHARED_MEDIA_KINDS as readonly string[]).includes(value);

export const SHARED_MEDIA_COUNT_SCAN = 1000;
const MEMBERSHIP_LIMIT = 5000;
const E2EE_MODE = 'e2ee';

const MIME_PREFIX: Readonly<Record<Exclude<SharedMediaKind, 'file'>, string>> = {
  image: 'image/',
  video: 'video/',
  audio: 'audio/',
};

export const sharedMediaKindOf = (mimeType: string): SharedMediaKind => {
  const found = (Object.keys(MIME_PREFIX) as Array<keyof typeof MIME_PREFIX>).find((kind) => mimeType.startsWith(MIME_PREFIX[kind]));
  return found ?? 'file';
};

const KIND_WHERE: Readonly<Record<SharedMediaKind, Record<string, unknown>>> = {
  image: { mimeType: { startsWith: 'image/' } },
  video: { mimeType: { startsWith: 'video/' } },
  audio: { mimeType: { startsWith: 'audio/' } },
  file: {
    NOT: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }, { mimeType: { startsWith: 'audio/' } }],
  },
};

const kindWhere = (kind: SharedMediaKind | undefined): Record<string, unknown> => (kind ? KIND_WHERE[kind] : {});

const SHARED_MEDIA_SELECT = {
  id: true,
  messageId: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  thumbHash: true,
  duration: true,
  width: true,
  height: true,
  uploadedBy: true,
  createdAt: true,
  isEncrypted: true,
  ...PROTECTION_ATTACHMENT_SELECT,
  message: { select: { conversationId: true, createdAt: true, ...PROTECTION_MESSAGE_SELECT } },
} as const;

const SHARED_MEDIA_COUNT_SELECT = {
  messageId: true,
  mimeType: true,
  isEncrypted: true,
  ...PROTECTION_ATTACHMENT_SELECT,
  message: { select: { conversationId: true, createdAt: true, ...PROTECTION_MESSAGE_SELECT } },
} as const;

type SharedMediaRow = {
  id: string;
  messageId: string | null;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl: string | null;
  thumbHash: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  uploadedBy: string;
  createdAt: Date;
  isEncrypted: boolean;
  isViewOnce: boolean;
  isBlurred: boolean;
  effectFlags: number;
  message: {
    conversationId: string;
    createdAt: Date;
    isEncrypted: boolean;
    isViewOnce: boolean;
    isBlurred: boolean;
    effectFlags: number;
    expiresAt: Date | null;
  } | null;
};

type SharedMediaCountRow = Pick<SharedMediaRow, 'messageId' | 'mimeType' | 'isEncrypted' | 'isViewOnce' | 'isBlurred' | 'effectFlags' | 'message'>;

export type SharedMediaItem = {
  readonly id: string;
  readonly kind: SharedMediaKind;
  readonly messageId: string | null;
  readonly conversationId: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly thumbnailUrl: string | null;
  readonly thumbHash: string | null;
  readonly duration: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly uploadedBy: string;
  readonly createdAt: Date;
};

export type SharedMediaPage = {
  readonly counts: Readonly<Record<SharedMediaKind, number>>;
  readonly countsCapped: boolean;
  readonly items: readonly SharedMediaItem[];
  readonly pagination: { readonly limit: number; readonly hasMore: boolean; readonly nextCursor: string | null };
};

const emptyCounts = (): Record<SharedMediaKind, number> => ({ image: 0, video: 0, audio: 0, file: 0 });

const emptyPage = (limit: number): SharedMediaPage => ({
  counts: emptyCounts(),
  countsCapped: false,
  items: [],
  pagination: { limit, hasMore: false, nextCursor: null },
});

/** Les conversations lisibles par le lecteur ET où la cible est active, hors bout en bout. */
async function sharedScope(prisma: PrismaClient, viewerId: string, targetId: string) {
  const mine = await prisma.participant.findMany({
    where: { userId: viewerId, isActive: true },
    select: { conversationId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
    take: MEMBERSHIP_LIMIT,
  });
  if (mine.length === 0) return null;
  const theirs = await prisma.participant.findMany({
    where: { userId: targetId, isActive: true, conversationId: { in: mine.map((m) => m.conversationId) } },
    select: { conversationId: true },
    take: MEMBERSHIP_LIMIT,
  });
  if (theirs.length === 0) return null;
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: [...new Set(theirs.map((p) => p.conversationId))] } },
    select: { id: true, encryptionMode: true },
    take: MEMBERSHIP_LIMIT,
  });
  const readable = new Set(conversations.filter((c) => c.encryptionMode !== E2EE_MODE).map((c) => c.id));
  const participations = mine.filter((m) => readable.has(m.conversationId));
  if (participations.length === 0) return null;

  const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, participations);
  const unreadable = new Set(unreadableConversationIds);
  const conversationIds = participations.map((p) => p.conversationId).filter((id) => !unreadable.has(id));
  if (conversationIds.length === 0) return null;
  return { conversationIds, historyFloor: historyFloorClause(conversationIds, floors) };
}

const hiddenByReader = (row: SharedMediaCountRow, hiding: ReadonlyMap<string, PersonalHistoryHiding>): boolean => {
  const own = row.message ? hiding.get(row.message.conversationId) : undefined;
  if (!own || !row.message) return false;
  if (row.messageId && own.hiddenMessageIds.includes(row.messageId)) return true;
  return own.clearHistoryBefore !== null && row.message.createdAt < own.clearHistoryBefore;
};

const servable = (row: SharedMediaCountRow, hiding: ReadonlyMap<string, PersonalHistoryHiding>): boolean =>
  row.message !== null && !row.isEncrypted && !isProtectedAttachmentRow(row) && !hiddenByReader(row, hiding);

const itemOf = (row: SharedMediaRow): SharedMediaItem => ({
  id: row.id,
  kind: sharedMediaKindOf(row.mimeType),
  messageId: row.messageId,
  conversationId: row.message!.conversationId,
  originalName: row.originalName,
  mimeType: row.mimeType,
  fileSize: row.fileSize,
  fileUrl: row.fileUrl,
  thumbnailUrl: row.thumbnailUrl ?? null,
  thumbHash: row.thumbHash ?? null,
  duration: row.duration ?? null,
  width: row.width ?? null,
  height: row.height ?? null,
  uploadedBy: row.uploadedBy,
  createdAt: row.createdAt,
});

export async function sharedMedia(
  prisma: PrismaClient,
  params: {
    readonly viewerId: string;
    readonly targetId: string;
    readonly kind?: SharedMediaKind;
    readonly cursor?: string;
    readonly limit: number;
  },
): Promise<SharedMediaPage> {
  const scope = await sharedScope(prisma, params.viewerId, params.targetId);
  if (!scope) return emptyPage(params.limit);

  const baseWhere = {
    isViewOnce: false,
    isBlurred: false,
    message: {
      conversationId: { in: scope.conversationIds },
      deletedAt: null,
      ...scope.historyFloor,
      ...messageProtectionWhereExclusion(),
    },
  };

  const cursorRow = params.cursor
    ? await prisma.messageAttachment.findFirst({ where: { id: params.cursor }, select: { createdAt: true } })
    : null;

  const [page, window, hiding] = await Promise.all([
    prisma.messageAttachment.findMany({
      where: { ...baseWhere, ...kindWhere(params.kind), ...(cursorRow ? { createdAt: { lt: cursorRow.createdAt } } : {}) },
      select: SHARED_MEDIA_SELECT,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    }) as unknown as Promise<SharedMediaRow[]>,
    prisma.messageAttachment.findMany({
      where: baseWhere,
      select: SHARED_MEDIA_COUNT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: SHARED_MEDIA_COUNT_SCAN,
    }) as unknown as Promise<SharedMediaCountRow[]>,
    loadPersonalHistoryHidingByConversation(prisma, { userId: params.viewerId, conversationIds: scope.conversationIds }),
  ]);

  const counts = window
    .filter((row) => servable(row, hiding))
    .reduce((acc, row) => ({ ...acc, [sharedMediaKindOf(row.mimeType)]: acc[sharedMediaKindOf(row.mimeType)] + 1 }), emptyCounts());

  return {
    counts,
    countsCapped: window.length >= SHARED_MEDIA_COUNT_SCAN,
    items: page.filter((row) => servable(row, hiding)).map(itemOf),
    pagination: buildCursorPaginationMeta(params.limit, page.length, page.length > 0 ? page[page.length - 1].id : null),
  };
}
