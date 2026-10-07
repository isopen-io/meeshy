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
 *  - enregistrement et recopie d'écran : même traitement, une fois par
 *    éphémère et par enregistrement.
 *
 * Le client DÉCLARE les messages visibles au moment de la capture ; la
 * passerelle JUGE chacun, et n'écrit un avis que pour celui qui passe TOUTES
 * les bornes ci-dessous. Les autres sont ignorés sans que la réponse dise
 * pourquoi.
 *
 * | borne | loi | refus |
 * |---|---|---|
 * | l'acteur est un participant actif, non banni, de la conversation | `participant` | `not-a-participant` |
 * | budget de déclarations par acteur et conversation | `SOCKET_RATE_LIMITS.MESSAGE_CAPTURE` | `rate-limited` |
 * | le message est de CETTE conversation | `where` | ignoré |
 * | ce n'est pas le sien — capturer son propre contenu n'annonce rien | `senderId` | ignoré |
 * | la loi de sortie dit `announced` ou `blocked` | `contentExitLawOfSource` (projection complète) | ignoré |
 * | l'acteur a le droit de le lire | `readerMayReadMessage`, masquage illisible ⇒ refus | ignoré |
 * | il l'a EU à l'écran, récemment | {@link wasOnActorScreen} | ignoré |
 * | pas déjà annoncé pour cette capture, ni dans la rafale | {@link CAPTURE_DEDUP_TTL_SECONDS}, {@link CAPTURE_BURST_SECONDS} | compté, rien d'écrit |
 *
 * ─── « IL L'A EU À L'ÉCRAN » — et non « l'a-t-il ENCORE » ────────────────────
 *
 * `contentStillVisibleToReader` répond « disparu » pour une vue unique déjà
 * ouverte ou une flamme après lecture consommée. Or une capture se fait PENDANT
 * l'affichage et l'événement arrive juste après — souvent après la
 * consommation que la fermeture a déclenchée. La question juste est donc :
 * le message a-t-il été SERVI à l'acteur, et l'affichage a-t-il pris fin il y
 * a moins de {@link CAPTURE_REPORT_GRACE_MS} ? Sans cette borne, on fabriquerait
 * une annonce des jours plus tard.
 *
 *  - éphémère : servi = sa ligne `MessageStatusEntry` porte une remise, une
 *    réception ou une lecture ; fin d'affichage = son échéance par lecteur
 *    (`ephemeralExpiresAt` : réception + durée, ou l'instant de consommation
 *    d'une flamme après lecture), sinon l'échéance du message ; sans échéance,
 *    l'affichage n'est pas fini.
 *  - vue unique : ouverte PAR lui (`viewedOnceAt`) depuis moins de
 *    {@link VIEW_ONCE_CAPTURE_WINDOW_MS} — l'ouverture est la seule heure que le
 *    serveur connaisse, la fin de l'affichage ne lui est pas dite.
 *
 * ─── CE QUI PART ────────────────────────────────────────────────────────────
 *
 * Un message système par le chemin de TOUS les avis (`postSystemNotice` :
 * écriture, horloge du fil, `message:new`) — aucune notification push, comme
 * les autres avis. Sa métadonnée (`captureNoticeMetadata`) ne porte AUCUN
 * contenu du message capturé : dans une conversation chiffrée, il ne dit rien
 * de plus que ce que chaque membre sait déjà (qui, quel message, quand envoyé).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ContentCaptureBody } from '@meeshy/shared/types/content-capture';
import {
  captureNoticeFallbackText,
  captureNoticeMetadata,
  type CapturedNature,
} from '@meeshy/shared/utils/capture-notice';
import { contentExitLawOfSource, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { SOCKET_RATE_LIMITS, type RateLimitConfig } from '../../utils/socket-rate-limiter';
import { postSystemNotice, type SystemNoticeDeps } from '../conversations/conversationNotice';
import type { HistoryReader } from '../historyFloor';
import { readerMayReadMessage, type ReadableMessageRow } from './messageReadAccess';

const logger = enhancedLogger.child({ module: 'ContentCaptureNotices' });

/** Après la fin de l'affichage d'un éphémère, l'annonce est encore reçue pendant ce délai. */
export const CAPTURE_REPORT_GRACE_MS = 5 * 60_000;
/** Une vue unique ouverte s'annonce encore pendant ce délai après son ouverture. */
export const VIEW_ONCE_CAPTURE_WINDOW_MS = 15 * 60_000;
/** Une même capture (même `captureId`) n'annonce un message qu'une fois. */
export const CAPTURE_DEDUP_TTL_SECONDS = 24 * 60 * 60;
/** Une rafale de captures du même message par le même acteur n'en annonce qu'une. */
export const CAPTURE_BURST_SECONDS = 30;

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
  | { readonly kind: 'rate-limited' };

type Actor = {
  readonly participantId: string;
  readonly displayName: string;
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

type ScreenEntry = {
  readonly deliveredAt: Date | null;
  readonly receivedAt: Date | null;
  readonly readAt: Date | null;
  readonly viewedOnceAt: Date | null;
  readonly ephemeralExpiresAt: Date | null;
};

const SCREEN_ENTRY_SELECT = {
  deliveredAt: true,
  receivedAt: true,
  readAt: true,
  viewedOnceAt: true,
  ephemeralExpiresAt: true,
} as const;

export function captureDedupKey(params: {
  readonly actorParticipantId: string;
  readonly messageId: string;
  readonly kind: string;
  readonly captureId: string;
}): string {
  return `capture-notice:${params.actorParticipantId}:${params.messageId}:${params.kind}:${params.captureId}`;
}

export function captureBurstKey(params: { readonly actorParticipantId: string; readonly messageId: string }): string {
  return `capture-notice-burst:${params.actorParticipantId}:${params.messageId}`;
}

export function captureRateLimitKey(params: { readonly actorParticipantId: string; readonly conversationId: string }): string {
  return `${params.actorParticipantId}:${params.conversationId}`;
}

/**
 * L'acteur a-t-il EU ce contenu à l'écran, assez récemment pour que l'annonce
 * soit crédible ? Pur : les heures viennent de SA ligne d'accusés.
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
    if (!entry.viewedOnceAt) return false;
    return now.getTime() - entry.viewedOnceAt.getTime() <= VIEW_ONCE_CAPTURE_WINDOW_MS;
  }

  const served = entry.receivedAt ?? entry.deliveredAt ?? entry.readAt;
  if (!served) return false;
  const displayEnd = entry.ephemeralExpiresAt ?? messageExpiresAt;
  if (!displayEnd) return true;
  return now.getTime() - displayEnd.getTime() <= CAPTURE_REPORT_GRACE_MS;
}

async function loadActor(prisma: PrismaClient, input: ContentCaptureInput): Promise<Actor | null> {
  const row = await prisma.participant.findFirst({
    where: { id: input.actorParticipantId, conversationId: input.conversationId, isActive: true, ...unsetOrNull('bannedAt') },
    select: { id: true, userId: true, displayName: true, nickname: true },
  });
  if (!row) return null;
  return {
    participantId: row.id,
    displayName: row.nickname || row.displayName,
    reader: row.userId ? { kind: 'user', userId: row.userId } : { kind: 'anonymous', participantId: row.id },
  };
}

type Judged = { readonly message: CapturedMessage; readonly nature: CapturedNature };

async function judge(
  deps: ContentCaptureDeps,
  params: { readonly actor: Actor; readonly message: CapturedMessage; readonly now: Date },
): Promise<Judged | null> {
  const { actor, message, now } = params;
  if (message.senderId === actor.participantId) return null;

  const law = contentExitLawOfSource(message);
  if (law.capture === 'free' || law.nature === 'ordinary') return null;

  const mayRead = deps.mayRead ?? readerMayReadMessage;
  const readable = await mayRead(deps.prisma, {
    reader: actor.reader,
    message,
    now,
    whenHidingUnreadable: 'refuse',
  });
  if (!readable) return null;

  const entry = (await deps.prisma.messageStatusEntry.findFirst({
    where: { messageId: message.id, participantId: actor.participantId },
    select: SCREEN_ENTRY_SELECT,
  })) as ScreenEntry | null;
  const onScreen = wasOnActorScreen({
    nature: law.nature,
    entry,
    messageExpiresAt: message.expiresAt ? new Date(message.expiresAt) : null,
    now,
  });
  return onScreen ? { message, nature: law.nature } : null;
}

type Claim = 'new' | 'already-noticed';

async function claim(
  dedup: CaptureDedupStore,
  params: { readonly actorParticipantId: string; readonly messageId: string; readonly report: ContentCaptureBody },
): Promise<Claim> {
  const first = await dedup.setnx(
    captureDedupKey({ ...params, kind: params.report.kind, captureId: params.report.captureId }),
    '1',
    CAPTURE_DEDUP_TTL_SECONDS,
  );
  if (!first) return 'already-noticed';
  const outsideBurst = await dedup.setnx(captureBurstKey(params), '1', CAPTURE_BURST_SECONDS);
  return outsideBurst ? 'new' : 'already-noticed';
}

async function noticeOne(
  deps: ContentCaptureDeps,
  params: { readonly actor: Actor; readonly judged: Judged; readonly input: ContentCaptureInput },
): Promise<boolean> {
  const { actor, judged, input } = params;
  const claimed = await claim(deps.dedup, {
    actorParticipantId: actor.participantId,
    messageId: judged.message.id,
    report: input.report,
  });
  if (claimed === 'already-noticed') return true;

  const metadata = captureNoticeMetadata({
    actor: { participantId: actor.participantId, displayName: actor.displayName },
    capturedMessageId: judged.message.id,
    nature: judged.nature,
    captureKind: input.report.kind,
    sentAt: new Date(judged.message.createdAt),
  });
  const written = await postSystemNotice(
    { prisma: deps.prisma, broadcast: deps.broadcast },
    {
      conversationId: input.conversationId,
      senderParticipantId: actor.participantId,
      content: captureNoticeFallbackText(metadata),
      metadata,
    },
  );
  if (written !== null) return true;
  await Promise.all([
    deps.dedup.del(captureDedupKey({ actorParticipantId: actor.participantId, messageId: judged.message.id, kind: input.report.kind, captureId: input.report.captureId })),
    deps.dedup.del(captureBurstKey({ actorParticipantId: actor.participantId, messageId: judged.message.id })),
  ]);
  return false;
}

export async function recordContentCapture(
  deps: ContentCaptureDeps,
  input: ContentCaptureInput,
): Promise<ContentCaptureOutcome> {
  const now = (deps.now ?? (() => new Date()))();

  const actor = await loadActor(deps.prisma, input);
  if (!actor) return { kind: 'not-a-participant' };

  const allowed = await deps.limiter.checkLimit(
    captureRateLimitKey({ actorParticipantId: actor.participantId, conversationId: input.conversationId }),
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
  for (const message of declared) {
    try {
      const judged = await judge(deps, { actor, message, now });
      if (judged && (await noticeOne(deps, { actor, judged, input }))) noticed.push(message.id);
    } catch (error) {
      logger.warn('capture not judged', {
        conversationId: input.conversationId,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { kind: 'recorded', noticedMessageIds: noticed };
}
