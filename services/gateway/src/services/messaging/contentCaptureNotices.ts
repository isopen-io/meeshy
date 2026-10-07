/**
 * LA CAPTURE D'UN CONTENU QUI DISPARAÎT, ANNONCÉE À LA CONVERSATION (#9617).
 *
 * Décision porteur du 2026-10-07 :
 *  - vue unique : capture et enregistrement rendent du NOIR ; toute tentative
 *    s'annonce à toute la conversation (« X a tenté de capturer un message à
 *    vue unique — impossible ») ;
 *  - éphémère (flamme à durée, flamme après lecture, copie transférée) : la
 *    capture n'est pas noircie, elle s'annonce (« X a capturé l'éphémère du
 *    dd/mm/YYYY à HH:MM », heure d'ENVOI, rendue chez chaque lecteur) ;
 *  - enregistrement et recopie d'écran : même traitement.
 *
 * Le client DÉCLARE les messages visibles au moment de la capture ; la
 * passerelle JUGE chacun, et n'écrit un avis que pour celui qui passe TOUTES
 * les bornes ci-dessous. Les autres sont absents de l'accusé, sans motif.
 *
 * | borne | loi | refus |
 * |---|---|---|
 * | l'acteur est un participant actif, non banni, de la conversation | `participant` | `not-a-participant` |
 * | la conversation n'est pas close | `isConversationClosed` | `conversation-closed` |
 * | budget de déclarations par acteur et conversation | `SOCKET_RATE_LIMITS.MESSAGE_CAPTURE` | `rate-limited` |
 * | le message est de CETTE conversation | `where` | ignoré |
 * | ce n'est pas le sien — capturer son propre contenu n'annonce rien | `senderId` | ignoré |
 * | la loi de sortie dit `announced` (flamme) ou `blocked` (vue unique), source prouvée | `contentExitLawOfSource` + `captureNoticeOutcomeOf` | ignoré |
 * | l'acteur a le droit de le lire | `readerMayReadMessage`, masquage illisible ⇒ refus | ignoré |
 * | il l'a VU, récemment | {@link wasOnActorScreen} | ignoré |
 * | jamais annoncé pour (acteur, message, sorte de capture) | {@link captureOnceKey} | compté, rien d'écrit |
 * | au plus {@link MAX_NOTICES_PER_REPORT} avis par déclaration | boucle | le reste ignoré |
 * | au plus `MESSAGE_CAPTURE_NOTICES_HOURLY` avis par heure, acteur et conversation | limiteur | le reste ignoré |
 *
 * ─── « IL L'A VU », PAS « IL L'A ENCORE » ────────────────────────────────────
 *
 * `contentStillVisibleToReader` répond « disparu » pour une vue unique déjà
 * ouverte ou une flamme après lecture consommée — exactement les captures à
 * annoncer, puisque l'événement arrive juste après l'affichage. La question
 * juste se lit sur SA ligne `MessageStatusEntry`, et seul un affichage ATTESTÉ
 * compte (une remise n'est pas un affichage, audit A5) :
 *
 *  - éphémère : LU (`readAt`, gelé à la première lecture) depuis au plus
 *    {@link CAPTURE_AFTER_DISPLAY_MAX_MS}, et, s'il a une fin d'affichage
 *    (`ephemeralExpiresAt`, sinon `Message.expiresAt`), celle-ci passée depuis
 *    au plus {@link CAPTURE_REPORT_GRACE_MS} ;
 *  - vue unique : ouverte PAR lui (`viewedOnceAt`) depuis au plus
 *    {@link VIEW_ONCE_CAPTURE_WINDOW_MS}.
 *
 * Les deux heures sont écrites UNE fois : la fenêtre annonçable d'un message
 * pour un acteur est donc bornée, et la clé « déjà annoncé » n'a pas à lui
 * survivre ({@link CAPTURE_ONCE_TTL_SECONDS}).
 *
 * ─── CE QUI PART ────────────────────────────────────────────────────────────
 *
 * Un message système par le chemin de TOUS les avis (`postSystemNotice` :
 * écriture, horloge du fil, `message:new`) — aucune notification push, comme
 * les autres avis. Sa métadonnée (`captureNoticeMetadata`) ne porte AUCUN
 * contenu du message capturé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ContentCaptureBody, ContentCaptureKind } from '@meeshy/shared/types/content-capture';
import {
  captureNoticeFallbackText,
  captureNoticeMetadata,
  captureNoticeOutcomeOf,
  type CaptureNoticeActor,
  type CapturedNature,
} from '@meeshy/shared/utils/capture-notice';
import { contentExitLawOfSource, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { SOCKET_RATE_LIMITS, type RateLimitConfig } from '../../utils/socket-rate-limiter';
import { postSystemNotice, type SystemNoticeDeps } from '../conversations/conversationNotice';
import type { HistoryReader } from '../historyFloor';
import { isConversationClosed } from './conversationWriteAdmission';
import { readerMayReadMessage, type ReadableMessageRow } from './messageReadAccess';

const logger = enhancedLogger.child({ module: 'ContentCaptureNotices' });

/** Après la fin de l'affichage d'un éphémère, l'annonce est encore reçue pendant ce délai. */
export const CAPTURE_REPORT_GRACE_MS = 5 * 60_000;
/** Borne absolue depuis la lecture d'un éphémère, qu'il ait une échéance ou non. */
export const CAPTURE_AFTER_DISPLAY_MAX_MS = 24 * 60 * 60_000;
/** Une vue unique ouverte s'annonce encore pendant ce délai après son ouverture. */
export const VIEW_ONCE_CAPTURE_WINDOW_MS = 15 * 60_000;
/** Au-delà de la fenêtre annonçable la plus longue, avec une journée de marge. */
export const CAPTURE_ONCE_TTL_SECONDS = (CAPTURE_AFTER_DISPLAY_MAX_MS + CAPTURE_REPORT_GRACE_MS) / 1000 + 24 * 60 * 60;
/** Avis écrits au plus par déclaration. */
export const MAX_NOTICES_PER_REPORT = 10;

export type CaptureDedupStore = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<void>;
};

export type CaptureRateLimiter = {
  checkLimit(key: string, config: RateLimitConfig): Promise<boolean>;
};

export type ContentCaptureDeps = {
  readonly prisma: PrismaClient;
  readonly dedup: CaptureDedupStore;
  readonly limiter: CaptureRateLimiter;
  readonly broadcast?: SystemNoticeDeps['broadcast'];
  readonly mayRead?: typeof readerMayReadMessage;
  readonly now?: () => Date;
};

export type ContentCaptureInput = {
  readonly conversationId: string;
  /** `Participant.id` de l'appelant, résolu par le transport. */
  readonly actorParticipantId: string;
  readonly report: ContentCaptureBody;
};

export type ContentCaptureOutcome =
  | { readonly kind: 'recorded'; readonly noticedMessageIds: readonly string[] }
  | { readonly kind: 'not-a-participant' }
  | { readonly kind: 'conversation-closed' }
  | { readonly kind: 'rate-limited' };

type Actor = {
  readonly notice: CaptureNoticeActor;
  readonly reader: HistoryReader;
};

const CAPTURED_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  createdAt: true,
  deletedAt: true,
  senderId: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  ephemeralDuration: true,
  expiresAt: true,
  attachments: { select: { isViewOnce: true, isBlurred: true, effectFlags: true } },
} as const;

type CapturedMessage = ReadableMessageRow & ContentExitProjection & { readonly senderId: string };

export type ScreenEntry = {
  readonly readAt: Date | null;
  readonly viewedOnceAt: Date | null;
  readonly ephemeralExpiresAt: Date | null;
};

const SCREEN_ENTRY_SELECT = {
  readAt: true,
  viewedOnceAt: true,
  ephemeralExpiresAt: true,
} as const;

export function captureOnceKey(params: {
  readonly actorParticipantId: string;
  readonly messageId: string;
  readonly kind: ContentCaptureKind;
}): string {
  return `capture-notice:${params.actorParticipantId}:${params.messageId}:${params.kind}`;
}

export function captureRateLimitKey(params: { readonly actorParticipantId: string; readonly conversationId: string }): string {
  return `${params.actorParticipantId}:${params.conversationId}`;
}

const within = (from: Date, now: Date, maxMs: number): boolean => {
  const elapsed = now.getTime() - from.getTime();
  return elapsed >= 0 && elapsed <= maxMs;
};

/**
 * L'acteur a-t-il VU ce contenu, assez récemment pour que l'annonce soit
 * crédible ? Pur : les heures viennent de SA ligne d'accusés.
 */
export function wasOnActorScreen(params: {
  readonly nature: CapturedNature;
  readonly entry: ScreenEntry | null;
  readonly messageExpiresAt: Date | null;
  readonly now: Date;
}): boolean {
  const { nature, entry, messageExpiresAt, now } = params;
  if (!entry) return false;

  if (nature === 'view-once') {
    return entry.viewedOnceAt !== null && within(entry.viewedOnceAt, now, VIEW_ONCE_CAPTURE_WINDOW_MS);
  }

  if (entry.readAt === null || !within(entry.readAt, now, CAPTURE_AFTER_DISPLAY_MAX_MS)) return false;
  const displayEnd = entry.ephemeralExpiresAt ?? messageExpiresAt;
  return displayEnd === null || now.getTime() - displayEnd.getTime() <= CAPTURE_REPORT_GRACE_MS;
}

async function loadActor(prisma: PrismaClient, input: ContentCaptureInput): Promise<Actor | null> {
  const row = await prisma.participant.findFirst({
    where: { id: input.actorParticipantId, conversationId: input.conversationId, isActive: true, ...unsetOrNull('bannedAt') },
    select: { id: true, userId: true, displayName: true, nickname: true, user: { select: { username: true } } },
  });
  if (!row) return null;
  const isAnonymous = !row.userId;
  return {
    notice: {
      participantId: row.id,
      displayName: row.nickname || row.displayName,
      isAnonymous,
      ...(!isAnonymous && row.user?.username ? { username: row.user.username } : {}),
    },
    reader: row.userId ? { kind: 'user', userId: row.userId } : { kind: 'anonymous', participantId: row.id },
  };
}

async function conversationIsClosed(prisma: PrismaClient, conversationId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isActive: true, closedAt: true },
  });
  return isConversationClosed(conversation);
}

/** Ce qu'une nature prouvée permet d'annoncer — `null` pour l'ordinaire et la source non prouvée. */
function announceableNature(message: CapturedMessage): CapturedNature | null {
  const law = contentExitLawOfSource(message);
  if (law.nature === 'ordinary') return null;
  return law.capture === captureNoticeOutcomeOf(law.nature) ? law.nature : null;
}

type ReaderEvidence = { readonly readable: boolean; readonly entry: ScreenEntry | null };

/**
 * Les deux LECTURES du jugement. Une lecture qui échoue n'autorise rien : elle
 * est journalisée et le message refusé. Rien d'autre n'est rattrapé ici — une
 * erreur de programmation remonte (audit A6).
 */
async function readEvidence(
  deps: ContentCaptureDeps,
  params: { readonly actor: Actor; readonly message: CapturedMessage; readonly now: Date },
): Promise<ReaderEvidence | null> {
  const { actor, message, now } = params;
  const mayRead = deps.mayRead ?? readerMayReadMessage;
  try {
    const readable = await mayRead(deps.prisma, { reader: actor.reader, message, now, whenHidingUnreadable: 'refuse' });
    if (!readable) return { readable: false, entry: null };
    const entry = (await deps.prisma.messageStatusEntry.findFirst({
      where: { messageId: message.id, participantId: actor.notice.participantId },
      select: SCREEN_ENTRY_SELECT,
    })) as ScreenEntry | null;
    return { readable: true, entry };
  } catch (error) {
    logger.warn('capture evidence unreadable — message refused', {
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function judge(
  deps: ContentCaptureDeps,
  params: { readonly actor: Actor; readonly message: CapturedMessage; readonly now: Date },
): Promise<CapturedNature | null> {
  const { actor, message, now } = params;
  if (message.senderId === actor.notice.participantId) return null;
  const nature = announceableNature(message);
  if (!nature) return null;

  const evidence = await readEvidence(deps, params);
  if (!evidence?.readable) return null;
  const seen = wasOnActorScreen({
    nature,
    entry: evidence.entry,
    messageExpiresAt: message.expiresAt ? new Date(message.expiresAt) : null,
    now,
  });
  return seen ? nature : null;
}

type NoticeAttempt = 'written' | 'already-noticed' | 'budget-spent' | 'not-written';

async function noticeOne(
  deps: ContentCaptureDeps,
  params: { readonly actor: Actor; readonly message: CapturedMessage; readonly nature: CapturedNature; readonly input: ContentCaptureInput },
): Promise<NoticeAttempt> {
  const { actor, message, nature, input } = params;
  const onceKey = captureOnceKey({ actorParticipantId: actor.notice.participantId, messageId: message.id, kind: input.report.kind });
  if (!(await deps.dedup.setnx(onceKey, '1', CAPTURE_ONCE_TTL_SECONDS))) return 'already-noticed';

  const withinHourlyBudget = await deps.limiter.checkLimit(
    captureRateLimitKey({ actorParticipantId: actor.notice.participantId, conversationId: input.conversationId }),
    SOCKET_RATE_LIMITS.MESSAGE_CAPTURE_NOTICES_HOURLY,
  );
  if (!withinHourlyBudget) {
    await deps.dedup.del(onceKey);
    return 'budget-spent';
  }

  const metadata = captureNoticeMetadata({
    actor: actor.notice,
    capturedMessageId: message.id,
    nature,
    captureKind: input.report.kind,
    sentAt: new Date(message.createdAt),
  });
  const written = await postSystemNotice(
    { prisma: deps.prisma, broadcast: deps.broadcast },
    {
      conversationId: input.conversationId,
      senderParticipantId: actor.notice.participantId,
      content: captureNoticeFallbackText(metadata),
      metadata,
    },
  );
  if (written !== null) return 'written';
  await deps.dedup.del(onceKey);
  return 'not-written';
}

export async function recordContentCapture(
  deps: ContentCaptureDeps,
  input: ContentCaptureInput,
): Promise<ContentCaptureOutcome> {
  const now = (deps.now ?? (() => new Date()))();

  const actor = await loadActor(deps.prisma, input);
  if (!actor) return { kind: 'not-a-participant' };
  if (await conversationIsClosed(deps.prisma, input.conversationId)) return { kind: 'conversation-closed' };

  const allowed = await deps.limiter.checkLimit(
    captureRateLimitKey({ actorParticipantId: actor.notice.participantId, conversationId: input.conversationId }),
    SOCKET_RATE_LIMITS.MESSAGE_CAPTURE,
  );
  if (!allowed) return { kind: 'rate-limited' };

  const rows = (await deps.prisma.message.findMany({
    where: { id: { in: [...input.report.messageIds] }, conversationId: input.conversationId },
    select: CAPTURED_MESSAGE_SELECT,
  })) as unknown as CapturedMessage[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const declared = input.report.messageIds
    .map((id) => byId.get(id))
    .filter((row): row is CapturedMessage => row !== undefined);

  const noticed: string[] = [];
  let written = 0;
  for (const message of declared) {
    if (written >= MAX_NOTICES_PER_REPORT) break;
    const nature = await judge(deps, { actor, message, now });
    if (!nature) continue;
    const attempt = await noticeOne(deps, { actor, message, nature, input });
    if (attempt === 'budget-spent') break;
    if (attempt === 'written') written += 1;
    if (attempt === 'written' || attempt === 'already-noticed') noticed.push(message.id);
  }
  return { kind: 'recorded', noticedMessageIds: noticed };
}
