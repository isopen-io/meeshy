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
 * | le message capturé est SUPPRIMÉ POUR TOUS (auteur, modérateur, compte supprimé) | l'échéance de ses avis est ramenée à maintenant — le passage suivant du balayage les détruit et l'annonce |
 * | un avis écrit avant ce lot (staging, depuis le 2026-10-07) n'a pas d'échéance | il reçoit la sienne au démarrage du balayage |
 *
 * La destruction NATURELLE du message capturé (son échéance, par ce même
 * balayage) n'emporte pas l'avis : il lui survit vingt-quatre heures, le temps
 * que l'auteur apprenne la capture. La purge d'une vue unique non plus : la
 * bulle reste (« déjà ouvert »), seul son contenu part.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { CAPTURE_NOTICE_CANDIDATE_WHERE, captureNoticeExpiresAt, captureNoticeOf } from './captureNoticeVisibility';

const logger = enhancedLogger.child({ module: 'CaptureNoticeRetention' });

/** Le jour où le premier avis de capture a pu s'écrire (#9617) : rien d'antérieur n'en est un. */
export const CAPTURE_NOTICE_FIRST_DAY = new Date('2026-10-07T00:00:00.000Z');

/** Avis sans échéance relus au plus par démarrage — un staging en porte quelques-uns. */
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
 * Le message capturé est supprimé pour tous : ses avis vivants meurent au
 * prochain passage du balayage. PROPAGE — l'appelant le range parmi ses effets
 * best-effort.
 */
export async function expireCaptureNoticesNaming(
  prisma: PrismaClient,
  params: { readonly conversationId: string; readonly capturedMessageId: string; readonly now: Date },
): Promise<number> {
  const rows = (await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      ...CAPTURE_NOTICE_CANDIDATE_WHERE,
      AND: [...CAPTURE_NOTICE_CANDIDATE_WHERE.AND, unsetOrNull('deletedAt')],
    },
    select: NOTICE_SELECT,
  })) as NoticeRow[];
  const ids = rows
    .map(captureNoticeOf)
    .filter((notice) => notice?.capturedMessageId === params.capturedMessageId)
    .map((notice) => notice!.id);
  if (ids.length === 0) return 0;
  const { count } = await prisma.message.updateMany({ where: { id: { in: ids } }, data: { expiresAt: params.now } });
  return count;
}

/**
 * Les avis écrits avant que l'échéance n'existe reçoivent la leur — la même
 * loi, calculée sur la date de l'avis. Ne rejette jamais : un démarrage ne
 * dépend pas d'un rattrapage.
 */
export async function backfillCaptureNoticeDeadlines(prisma: PrismaClient): Promise<number> {
  try {
    const rows = (await prisma.message.findMany({
      where: {
        messageSource: 'system',
        messageType: 'system',
        createdAt: { gte: CAPTURE_NOTICE_FIRST_DAY },
        AND: [unsetOrNull('expiresAt'), unsetOrNull('deletedAt')],
      },
      select: NOTICE_SELECT,
      orderBy: { createdAt: 'asc' },
      take: CAPTURE_NOTICE_BACKFILL_BATCH,
    })) as NoticeRow[];
    const notices = rows.filter((row) => captureNoticeOf(row) !== null);
    if (notices.length === 0) return 0;

    const capturedIds = [...new Set(notices.map((row) => captureNoticeOf(row)?.capturedMessageId).filter((id): id is string => Boolean(id)))];
    const captured = capturedIds.length === 0
      ? []
      : await prisma.message.findMany({ where: { id: { in: capturedIds } }, select: { id: true, expiresAt: true } });
    const expiryOf = new Map(captured.map((row) => [row.id, row.expiresAt] as const));

    let written = 0;
    for (const row of notices) {
      const capturedId = captureNoticeOf(row)?.capturedMessageId;
      const expiresAt = captureNoticeExpiresAt({
        capturedExpiresAt: (capturedId ? expiryOf.get(capturedId) : null) ?? null,
        noticeAt: row.createdAt,
      });
      // eslint-disable-next-line no-await-in-loop
      await prisma.message.update({ where: { id: row.id }, data: { expiresAt } });
      written += 1;
    }
    logger.info('capture notices without deadline backfilled', { written });
    return written;
  } catch (error) {
    logger.warn('capture notice deadline backfill failed — retried at next start', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
