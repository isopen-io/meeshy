import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { generateDefaultConversationTitle, resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { resolveParticipantAvatar, resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';
import type { GlobalSearchPagination, MessageSearchHit } from '@meeshy/shared/types/global-search';
import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { buildLastMessagePreviewTranslations } from '../../routes/conversations/utils/last-message-preview';
import { applyHistoryFloor, HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsOrFail } from '../historyFloor';
import { applyPersonalHistoryHiding, loadPersonalHistoryHidingByConversation, NO_PERSONAL_HIDING } from '../personalHistoryFilter';
import { withoutCaptureNotices } from '../messaging/captureNoticeVisibility';
import { withOrphanedSenderRepair } from '../messaging/withOrphanedSenderRepair';
import { keepAliveForReader } from '../messaging/quoteCascade';
import { appearsInSearch, SEARCH_EXIT_LAW_SELECT } from '../messaging/searchExitLaw';
import { decodeCursor, encodeCursor, keysetBeforeClause, type CursorData } from '../../utils/keyset-cursor';
import {
  answeringPiece,
  pieceIsBlurred,
  SEARCH_HIT_ATTACHMENT_SELECT,
  servedTranscript,
  type SearchHitAttachment,
} from './searchHitTranscript';

/**
 * #14619 — LA RECHERCHE DE MESSAGES DE LA LISTE DES CONVERSATIONS.
 *
 * Elle cherche dans TOUTES les conversations du lecteur à la fois, et chaque
 * loi que la recherche d'UNE conversation (`messages-search.ts`) applique y
 * vaut, conversation par conversation :
 * - l'appartenance VIVANTE (`PARTICIPATION_VIVANTE`) : jamais un salon dont on
 *   n'est pas membre actif, ni une conversation désactivée ;
 * - le serveur ne cherche que ce qu'il LIT : une conversation `e2ee` sort de la
 *   portée, un message chiffré aussi (#12994) — la recherche e2ee est locale ;
 * - le plancher d'historique et le masquage personnel, posés dans la REQUÊTE
 *   par les mêmes constructeurs, une clause par conversation qui en porte ;
 * - la loi de sortie (#10429) : vue unique, éphémère, pièce jointe protégée,
 *   réponse à ce qui est mort pour le lecteur ;
 * - les avis de capture, qui ne se trouvent jamais par leur texte ici.
 *
 * Le texte SERVI est celui du Prisme du lecteur (`resolvePrismTranslation`).
 *
 * #16957 — LE FLOU VOYAGE AVEC LE RÉSULTAT. Un flouté paraît (ce n'est pas une
 * disparition), mais porte `isBlurred` pour que le client le VOILE. Un client
 * qui ne déclare pas `protectionCaps` ne sait pas voiler : il ne reçoit aucun
 * flouté, et aucune transcription n'est cherchée pour lui (#16958).
 */

export type GlobalMessageSearchParams = {
  readonly userId: string;
  readonly languages: readonly string[];
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly protectionCaps?: boolean;
};

export type GlobalMessageSearchPage = {
  readonly data: MessageSearchHit[];
  readonly pagination: GlobalSearchPagination;
};

const TRANSLATION_SCAN_SIZE = 200;
const MAX_SCAN_ROUNDS = 5;
const TITLE_MEMBER_SAMPLE = 5;

type Scope = {
  readonly participantByConversation: ReadonlyMap<string, string>;
  readonly modeByConversation: ReadonlyMap<string, string | null>;
  readonly clauses: Record<string, unknown>[];
};

const EMPTY_PAGE = (limit: number): GlobalMessageSearchPage => ({ data: [], pagination: { limit, hasMore: false, nextCursor: null } });

async function readerScope(prisma: PrismaClient, userId: string): Promise<Scope | null> {
  const memberships = await prisma.participant.findMany({
    where: { userId, ...PARTICIPATION_VIVANTE },
    select: {
      id: true,
      conversationId: true,
      ...HISTORY_FLOOR_PARTICIPANT_SELECT,
      conversation: { select: { isActive: true, encryptionMode: true } },
    },
  });
  const readable = memberships.filter((m) => {
    if (m.conversation?.isActive !== true) return false;
    return sharedTranslationServerReadsMessage({ conversationEncryptionMode: m.conversation.encryptionMode, messageIsEncrypted: false, messageEncryptionMode: null });
  });
  if (readable.length === 0) return null;

  const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, readable);
  const unreadable = new Set(unreadableConversationIds);
  const served = readable.filter((m) => !unreadable.has(m.conversationId));
  if (served.length === 0) return null;

  const ids = served.map((m) => m.conversationId);
  const hidings = await loadPersonalHistoryHidingByConversation(prisma, { userId, conversationIds: ids });
  const bounded = ids.filter((id) => floors.has(id) || hidings.has(id));
  const plain = ids.filter((id) => !floors.has(id) && !hidings.has(id));
  const clauses = [
    ...(plain.length > 0 ? [{ conversationId: { in: plain } }] : []),
    ...bounded.map((id) => applyPersonalHistoryHiding(applyHistoryFloor({ conversationId: id }, floors.get(id) ?? null), hidings.get(id) ?? NO_PERSONAL_HIDING)),
  ];
  return {
    participantByConversation: new Map(served.map((m) => [m.conversationId, m.id])),
    modeByConversation: new Map(served.map((m) => [m.conversationId, m.conversation?.encryptionMode ?? null])),
    clauses,
  };
}

const HIT_SELECT = {
  id: true,
  conversationId: true,
  content: true,
  originalLanguage: true,
  messageType: true,
  messageSource: true,
  translations: true,
  createdAt: true,
  replyToId: true,
  isEncrypted: true,
  encryptionMode: true,
  ...SEARCH_EXIT_LAW_SELECT,
  attachments: SEARCH_HIT_ATTACHMENT_SELECT,
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      user: { select: { username: true, displayName: true, avatar: true } },
    },
  },
} as const;

type HitRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly messageType: string | null;
  readonly translations: unknown;
  readonly createdAt: Date;
  readonly isEncrypted: boolean | null;
  readonly encryptionMode: string | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly attachments: readonly SearchHitAttachment[];
  readonly sender: {
    readonly id: string;
    readonly userId: string | null;
    readonly displayName: string | null;
    readonly avatar: string | null;
    readonly user: { readonly username: string | null; readonly displayName: string | null; readonly avatar: string | null } | null;
  } | null;
};

const translationMatches = (translations: unknown, needle: string): boolean => {
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return false;
  return Object.values(translations as Record<string, unknown>).some((entry) => {
    if (typeof entry === 'string') return entry.toLowerCase().includes(needle);
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as { isEncrypted?: unknown; text?: unknown };
    if (record.isEncrypted === true) return false;
    return typeof record.text === 'string' && record.text.toLowerCase().includes(needle);
  });
};

const isNewerOrEqual = (row: { createdAt: Date; id: string }, bound: CursorData): boolean => {
  const at = row.createdAt.getTime();
  const boundAt = new Date(bound.createdAt).getTime();
  return at > boundAt || (at === boundAt && row.id >= bound.id);
};

const byRecency = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const boundOf = (rows: readonly HitRow[], take: number): CursorData | null => {
  if (rows.length < take) return null;
  const oldest = rows[rows.length - 1];
  return { createdAt: oldest.createdAt.toISOString(), id: oldest.id };
};

const newestBound = (bounds: ReadonlyArray<CursorData | null>): CursorData | null =>
  bounds
    .filter((bound): bound is CursorData => bound !== null)
    .reduce<CursorData | null>((best, bound) => (best === null || !isNewerOrEqual({ createdAt: new Date(best.createdAt), id: best.id }, bound) ? bound : best), null);

type ScanOptions = { readonly needle: string; readonly limit: number; readonly cursor: CursorData | null; readonly transcripts: boolean };

const textAnswers = (row: HitRow, needle: string): boolean =>
  (row.content ?? '').toLowerCase().includes(needle) || translationMatches(row.translations, needle);

async function scanCandidates(prisma: PrismaClient, scope: Scope, { needle, limit, cursor, transcripts }: ScanOptions) {
  const base = withoutCaptureNotices({
    deletedAt: null,
    AND: [{ OR: scope.clauses }, ...(cursor ? [keysetBeforeClause(cursor)] : [])],
  });
  const contentTake = limit * 3 + 1;
  const [contentRows, translationRows, transcriptRows] = (await withOrphanedSenderRepair(
    { prisma, conversationIds: [...scope.participantByConversation.keys()] },
    () =>
      Promise.all([
        prisma.message.findMany({
          where: { ...base, content: { contains: needle, mode: 'insensitive' } },
          select: HIT_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: contentTake,
        }),
        prisma.message.findMany({
          where: { ...base, translations: { not: { equals: null } } },
          select: HIT_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: TRANSLATION_SCAN_SIZE,
        }),
        transcripts
          ? prisma.message.findMany({
              where: { ...base, attachments: { some: { transcription: { not: { equals: null } } } } },
              select: HIT_SELECT,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: TRANSLATION_SCAN_SIZE,
            })
          : Promise.resolve([]),
      ])
  )) as unknown as [HitRow[], HitRow[], HitRow[]];
  const bound = newestBound([
    boundOf(contentRows, contentTake),
    boundOf(translationRows, TRANSLATION_SCAN_SIZE),
    boundOf(transcriptRows, TRANSLATION_SCAN_SIZE),
  ]);
  const seen = new Set<string>();
  const merged = [
    ...contentRows,
    ...translationRows.filter((row) => translationMatches(row.translations, needle)),
    ...transcriptRows.filter((row) => answeringPiece(row.attachments, needle) !== null),
  ]
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .filter((row) => bound === null || isNewerOrEqual(row, bound))
    .sort(byRecency);
  return { merged, bound };
}

const messageIsBlurred = (row: HitRow): boolean => !contentExitLaw(row).exportable;

const answersFor = (row: HitRow, options: ScanOptions): boolean =>
  (typeof row.content === 'string' && row.content.trim() !== '' && textAnswers(row, options.needle))
  || (options.transcripts && answeringPiece(row.attachments, options.needle) !== null);

async function servableForReader(prisma: PrismaClient, scope: Scope, rows: readonly HitRow[], options: ScanOptions): Promise<HitRow[]> {
  const readable = rows
    .filter((row) => sharedTranslationServerReadsMessage({
      conversationEncryptionMode: scope.modeByConversation.get(row.conversationId) ?? null,
      messageIsEncrypted: row.isEncrypted,
      messageEncryptionMode: row.encryptionMode,
    }))
    .filter((row) => answersFor(row, options))
    .filter((row) => appearsInSearch(row as never))
    .filter((row) => options.transcripts || !messageIsBlurred(row));
  const groups = [...new Set(readable.map((row) => row.conversationId))];
  const alive = await Promise.all(
    groups.map(async (conversationId) => {
      const page = await keepAliveForReader(prisma, readable.filter((row) => row.conversationId === conversationId) as never[], scope.participantByConversation.get(conversationId));
      return (page.alive as unknown as HitRow[]).filter((row) => !page.inherited.has(row.id));
    })
  );
  const kept = new Set(alive.flat().map((row) => row.id));
  return readable.filter((row) => kept.has(row.id));
}

async function collectServable(
  prisma: PrismaClient,
  scope: Scope,
  options: ScanOptions,
  round = 1,
  gathered: readonly HitRow[] = []
): Promise<{ servable: HitRow[]; bound: CursorData | null }> {
  const { merged, bound } = await scanCandidates(prisma, scope, options);
  const servable = [...gathered, ...(await servableForReader(prisma, scope, merged, options))];
  const settled = servable.length > options.limit || bound === null || round >= MAX_SCAN_ROUNDS;
  return settled ? { servable, bound } : collectServable(prisma, scope, { ...options, cursor: bound }, round + 1, servable);
}

type ConversationCard = MessageSearchHit['conversation'];

async function conversationCards(prisma: PrismaClient, userId: string, ids: readonly string[]): Promise<Map<string, ConversationCard>> {
  if (ids.length === 0) return new Map();
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      identifier: true,
      type: true,
      title: true,
      avatar: true,
      participants: {
        where: { isActive: true, userId: { not: userId } },
        select: {
          userId: true,
          displayName: true,
          avatar: true,
          user: { select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true } },
        },
        take: TITLE_MEMBER_SAMPLE,
      },
    },
  });
  return new Map(conversations.map((conversation) => {
    const others = conversation.participants ?? [];
    const title = conversation.title && conversation.title.trim() !== ''
      ? conversation.title
      : generateDefaultConversationTitle(
          others.map((m) => ({ id: m.userId ?? '', displayName: m.user?.displayName ?? m.displayName, username: m.user?.username, firstName: m.user?.firstName, lastName: m.user?.lastName })),
          userId
        );
    const directAvatar = conversation.type === 'direct' ? (others[0]?.user?.avatar ?? others[0]?.avatar ?? null) : null;
    return [conversation.id, { id: conversation.id, identifier: conversation.identifier ?? null, type: conversation.type, title, avatar: conversation.avatar ?? directAvatar }];
  }));
}

function toHit(row: HitRow, card: ConversationCard, languages: readonly string[], options: ScanOptions): MessageSearchHit {
  const piece = options.transcripts && !textAnswers(row, options.needle) ? answeringPiece(row.attachments, options.needle) : null;
  const transcript = piece ? servedTranscript(piece, options.needle, languages) : null;
  const original = row.content ?? '';
  const served = resolvePrismTranslation({
    translations: buildLastMessagePreviewTranslations({ translations: row.translations, originalLanguage: row.originalLanguage, viewerLanguages: languages }),
    originalLanguage: row.originalLanguage,
    preferredLanguages: languages,
  });
  const sender = row.sender;
  return {
    id: row.id,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    messageType: row.messageType ?? 'text',
    content: served?.text ?? original,
    servedLanguage: served?.language ?? null,
    originalContent: original,
    originalLanguage: row.originalLanguage ?? null,
    sender: sender
      ? {
          id: sender.id,
          userId: sender.userId ?? null,
          displayName: resolveParticipantDisplayName(sender) ?? sender.user?.username ?? '',
          username: sender.user?.username ?? null,
          avatar: resolveParticipantAvatar(sender) ?? null,
        }
      : null,
    conversation: card,
    isBlurred: messageIsBlurred(row) || (piece !== null && pieceIsBlurred(piece)),
    match: transcript ? 'transcript' : 'content',
    transcript,
  };
}

export async function searchMessagesForReader(prisma: PrismaClient, params: GlobalMessageSearchParams): Promise<GlobalMessageSearchPage> {
  const { userId, languages, query, limit, protectionCaps = false } = params;
  const needle = query.trim().toLowerCase();
  const scope = await readerScope(prisma, userId);
  if (!scope) return EMPTY_PAGE(limit);

  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const options: ScanOptions = { needle, limit, cursor, transcripts: protectionCaps };
  const { servable, bound } = await collectServable(prisma, scope, options);
  const pageFull = servable.length > limit;
  const rows = servable.slice(0, limit);
  const last = rows[rows.length - 1];
  const nextCursor = pageFull && last
    ? encodeCursor(last.createdAt, last.id)
    : bound
      ? encodeCursor(bound.createdAt, bound.id)
      : null;

  const cards = await conversationCards(prisma, userId, [...new Set(rows.map((row) => row.conversationId))]);
  const data = rows.flatMap((row) => {
    const card = cards.get(row.conversationId);
    return card ? [toHit(row, card, languages, options)] : [];
  });
  return { data, pagination: { limit, hasMore: nextCursor !== null, nextCursor } };
}
