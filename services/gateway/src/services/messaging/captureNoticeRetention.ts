/**
 * LA DURÉE D'UN AVIS DE CAPTURE (#9629 a).
 *
 * Un avis vit `max(échéance globale du message capturé, date de l'avis) + 24 h`
 * (`captureNoticeExpiresAt`) et meurt par le balayage des éphémères
 * (`ExpiredMessagesCleanupService`) : contenu et métadonnée écrasés, retrait
 * annoncé (`message:expired`). Ce module tient les deux cas où cette échéance
 * se pose autrement qu'à l'écriture :
 *
 * | cas | geste |
 * |---|---|
 * | le message capturé est SUPPRIMÉ POUR TOUS (auteur, modérateur, compte supprimé) | l'échéance de ses avis est ramenée à maintenant — sauf ceux de celui qui supprime, bornés à 24 h — et le balayage suivant les détruit et l'annonce |
 * | le message capturé est DÉTRUIT par son échéance (y compris rapprochée par la consommation après lecture) | l'échéance de ses avis est bornée à maintenant + 24 h |
 * | un avis écrit avant ce lot (staging, depuis le 2026-10-07) n'a pas d'échéance | il reçoit la sienne au démarrage du balayage |
 *
 * L'avis survit donc AU PLUS vingt-quatre heures à ce qu'il nomme, le temps
 * que l'auteur apprenne la capture — même quand l'échéance posée à l'écriture
 * lisait le plafond de rétention de sept jours. La purge d'une vue unique ne le
 * touche pas : la bulle reste (« déjà ouvert »), seul son contenu part.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import {
  CAPTURE_NOTICE_CANDIDATE_WHERE,
  CAPTURE_NOTICE_RETENTION_MS,
  captureNoticeExpiresAt,
  captureNoticeOf,
} from './captureNoticeVisibility';

const logger = enhancedLogger.child({ module: 'CaptureNoticeRetention' });

/** Le jour où le premier avis de capture a pu s'écrire (#9617) : rien d'antérieur n'en est un. */
export const CAPTURE_NOTICE_FIRST_DAY = new Date('2026-10-07T00:00:00.000Z');

/** Taille d'une fournée du rattrapage — la lecture continue jusqu'à épuisement. */
export const CAPTURE_NOTICE_BACKFILL_BATCH = 1000;

const NOTICE_SELECT = { id: true, conversationId: true, senderId: true, createdAt: true, messageType: true, metadata: true } as const;

type NoticeRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly createdAt: Date;
  readonly messageType: string | null;
  readonly metadata: unknown;
};

/**
 * Le message capturé est DÉTRUIT : ses avis vivants ne lui survivent pas plus de
 * vingt-quatre heures — l'échéance de chacun devient `min(actuelle, borne)`,
 * jamais repoussée. La borne est `maintenant + 24 h` pour une destruction
 * NATURELLE (échéance, consommation après lecture) et pour les avis écrits par
 * celui qui supprime (celui qui capture ne raccourcit pas son propre avis en
 * supprimant, modérateur, le message qu'il a capturé) ; `maintenant` pour tout
 * autre avis d'un retrait VOULU — le balayage suivant le détruit et l'annonce.
 * PROPAGE — l'appelant le range parmi ses effets best-effort.
 */
export async function boundCaptureNoticesNaming(
  prisma: PrismaClient,
  params: {
    readonly conversationId: string;
    readonly capturedMessageId: string;
    readonly now: Date;
    readonly cause: 'deleted' | 'expired';
    readonly removedByParticipantId?: string | null;
  },
): Promise<number> {
  const rows = (await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      ...CAPTURE_NOTICE_CANDIDATE_WHERE,
      AND: [...CAPTURE_NOTICE_CANDIDATE_WHERE.AND, unsetOrNull('deletedAt')],
    },
    select: NOTICE_SELECT,
  })) as NoticeRow[];
  const named = rows
    .map(captureNoticeOf)
    .filter((notice): notice is NonNullable<typeof notice> => notice?.capturedMessageId === params.capturedMessageId);
  if (named.length === 0) return 0;

  const grace = new Date(params.now.getTime() + CAPTURE_NOTICE_RETENTION_MS);
  const boundOf = (senderId: string): Date =>
    params.cause === 'expired' || senderId === params.removedByParticipantId ? grace : params.now;
  const byBound = new Map<number, string[]>();
  for (const notice of named) {
    const bound = boundOf(notice.senderId).getTime();
    byBound.set(bound, [...(byBound.get(bound) ?? []), notice.id]);
  }
  let count = 0;
  for (const [bound, ids] of byBound) {
    const until = new Date(bound);
    // eslint-disable-next-line no-await-in-loop
    const result = await prisma.message.updateMany({
      where: { id: { in: ids }, expiresAt: { gt: until } },
      data: { expiresAt: until },
    });
    count += result.count;
  }
  return count;
}

/** Les avis d'une fournée qui n'ont pas d'échéance la reçoivent. PROPAGE. */
async function backfillBatch(prisma: PrismaClient, rows: readonly NoticeRow[]): Promise<number> {
  const notices = rows.filter((row) => captureNoticeOf(row) !== null);
  if (notices.length === 0) return 0;
  const capturedIds = [...new Set(notices.map((row) => captureNoticeOf(row)?.capturedMessageId).filter((id): id is string => Boolean(id)))];
  const captured = capturedIds.length === 0
    ? []
    : await prisma.message.findMany({ where: { id: { in: capturedIds } }, select: { id: true, expiresAt: true } });
  const expiryOf = new Map(captured.map((row) => [row.id, row.expiresAt] as const));
  for (const row of notices) {
    const capturedId = captureNoticeOf(row)?.capturedMessageId;
    const expiresAt = captureNoticeExpiresAt({
      capturedExpiresAt: (capturedId ? expiryOf.get(capturedId) : null) ?? null,
      noticeAt: row.createdAt,
    });
    // eslint-disable-next-line no-await-in-loop
    await prisma.message.update({ where: { id: row.id }, data: { expiresAt } });
  }
  return notices.length;
}

/**
 * Les avis écrits avant que l'échéance n'existe reçoivent la leur — la même
 * loi, calculée sur la date de l'avis. Les autres messages système de la
 * période (arrivées, renommages) répondent au même filtre en base : la lecture
 * avance donc par CURSEUR d'identifiant, fournée après fournée, jusqu'à
 * épuisement — sans quoi un millier d'arrivées pourrait cacher pour toujours
 * l'avis qui les suit. Ne rejette jamais : un démarrage ne dépend pas d'un
 * rattrapage.
 */
export async function backfillCaptureNoticeDeadlines(prisma: PrismaClient): Promise<number> {
  let written = 0;
  let after: string | null = null;
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const rows = (await prisma.message.findMany({
        where: {
          messageSource: 'system',
          messageType: 'system',
          createdAt: { gte: CAPTURE_NOTICE_FIRST_DAY },
          ...(after ? { id: { gt: after } } : {}),
          AND: [unsetOrNull('expiresAt'), unsetOrNull('deletedAt')],
        },
        select: NOTICE_SELECT,
        orderBy: { id: 'asc' },
        take: CAPTURE_NOTICE_BACKFILL_BATCH,
      })) as NoticeRow[];
      // eslint-disable-next-line no-await-in-loop
      written += await backfillBatch(prisma, rows);
      if (rows.length < CAPTURE_NOTICE_BACKFILL_BATCH) break;
      after = rows[rows.length - 1].id;
    }
    if (written > 0) logger.info('capture notices without deadline backfilled', { written });
    return written;
  } catch (error) {
    logger.warn('capture notice deadline backfill failed — retried at next start', {
      written,
      error: error instanceof Error ? error.message : String(error),
    });
    return written;
  }
}
