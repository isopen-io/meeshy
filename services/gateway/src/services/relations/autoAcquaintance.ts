/**
 * LA CONNAISSANCE NAÎT TOUTE SEULE (#13932, REL-02, RG-02, D-1).
 *
 * Quand, dans CHAQUE sens, les seuils de la config sont tenus sur la semaine
 * glissante (`acquaintanceProgress`), le lien ACQUAINTANCE apparaît chez les deux,
 * avec une notification discrète. L'écriture passe par l'écrivain unique du lien
 * (`recordAcquaintance`) : ce module ne décide que de SI.
 *
 * ## Ce qui l'empêche (la loi d'accès `acquaintance.auto`, pas une règle de plus)
 *
 * - un blocage, dans un sens ou dans l'autre : rien ne naît, et une Connaissance
 *   née toute seule, restée telle quelle, est défaite EN SILENCE (RG-07) ;
 * - un mineur déclaré face à un non-mineur ou à un âge inconnu (fail-closed) ;
 * - une baisse gravée dans l'historique : la sortie volontaire n'est pas défaite
 *   par la poursuite des échanges (porté par l'écrivain).
 *
 * Idempotent : rejouée, l'évaluation ne change rien et ne prévient personne deux fois.
 * Une notification perdue ne défait pas le lien.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey } from '@meeshy/shared/types/relation';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { addUtcDays, utcDayStart } from '@meeshy/shared/utils/iso-week';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { relationThresholdsFor, type RelationThresholds } from '@meeshy/shared/utils/relation-levels';
import { acquaintanceProgress, pairDayFromRow } from '@meeshy/shared/utils/relation-interactions';
import { isBlockedBetween } from '../../utils/blocking.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { recordAcquaintance, resetFriendship, type UserRelationDb } from './userRelationWriter.js';

const logger = enhancedLogger.child({ module: 'AutoAcquaintance' });

export type AcquaintanceNotice = {
  readonly recipientId: string;
  readonly otherId: string;
};

export type AcquaintanceNotifier = (notice: AcquaintanceNotice) => Promise<unknown>;

export type AutoAcquaintanceOutcome =
  | 'created'
  | 'raised'
  | 'unchanged'
  | 'insufficient'
  | 'blocked'
  | 'minor'
  | 'cancelled'
  | 'ignored';

export type AutoAcquaintanceDeps = {
  readonly prisma: Pick<PrismaClient, 'pairInteractionDay' | 'user' | 'userRelation'>;
  readonly notify?: AcquaintanceNotifier;
  readonly now?: () => Date;
  readonly thresholds?: RelationThresholds;
};

/** Le dernier jour de la fenêtre glissante, aujourd'hui compris : six jours en arrière. */
export const ACQUAINTANCE_WINDOW_LOOKBACK_DAYS = 6;

const environmentThresholds = (): RelationThresholds => relationThresholdsFor(process.env.DEPLOY_ENV ?? process.env.NODE_ENV);

async function loadWindow(deps: AutoAcquaintanceDeps, pair: { userLowId: string; userHighId: string }, now: Date) {
  const rows = await deps.prisma.pairInteractionDay.findMany({
    where: {
      userLowId: pair.userLowId,
      userHighId: pair.userHighId,
      day: { gte: addUtcDays(utcDayStart(now), -ACQUAINTANCE_WINDOW_LOOKBACK_DAYS), lte: utcDayStart(now) },
    },
  });
  return rows.map((row) => pairDayFromRow(row as Record<string, unknown>));
}

const isOwnAcquaintance = (row: { origin?: string | null; grantedByLow?: string | null; grantedByHigh?: string | null } | null): boolean =>
  row?.origin === 'auto-acquaintance' && row.grantedByLow === 'ACQUAINTANCE' && row.grantedByHigh === 'ACQUAINTANCE';

async function cancelIfAutomatic(deps: AutoAcquaintanceDeps, pair: ReturnType<typeof relationPairKey>, now: Date) {
  const row = await deps.prisma.userRelation.findUnique({ where: { userLowId_userHighId: pair } });
  if (!isOwnAcquaintance(row)) return 'blocked' as const;
  await resetFriendship(deps.prisma as unknown as UserRelationDb, { userA: pair.userLowId, userB: pair.userHighId, at: now });
  return 'cancelled' as const;
}

async function announce(notify: AcquaintanceNotifier | undefined, userA: string, userB: string): Promise<void> {
  if (!notify) return;
  await Promise.all(
    [
      { recipientId: userA, otherId: userB },
      { recipientId: userB, otherId: userA },
    ].map((notice) =>
      notify(notice).catch((error: unknown) => logger.warn('acquaintance notice lost', { recipientId: notice.recipientId, error })),
    ),
  );
}

export async function evaluateAutoAcquaintance(
  deps: AutoAcquaintanceDeps,
  params: { userA: string; userB: string },
): Promise<AutoAcquaintanceOutcome> {
  if (!params.userA || !params.userB || params.userA === params.userB) return 'ignored';
  const now = (deps.now ?? (() => new Date()))();
  const pair = relationPairKey(params.userA, params.userB);

  const users = await deps.prisma.user.findMany({
    where: { id: { in: [pair.userLowId, pair.userHighId] } },
    select: { id: true, birthDate: true },
  });
  const low = users.find((u) => u.id === pair.userLowId);
  const high = users.find((u) => u.id === pair.userHighId);
  if (!low || !high) return 'ignored';

  const blocked = await isBlockedBetween(deps.prisma as unknown as PrismaClient, pair.userLowId, pair.userHighId);
  const verdict = resolveRelationAccess({
    viewerId: pair.userLowId,
    targetId: pair.userHighId,
    grantedByViewer: 'PUBLIC',
    grantedByTarget: 'PUBLIC',
    sharesCommunity: false,
    blockedEitherWay: blocked,
    viewerMinor: declaredAgeClass(low.birthDate, now),
    targetMinor: declaredAgeClass(high.birthDate, now),
    feature: 'acquaintance.auto',
  });
  if (verdict.reason === 'blocked') return cancelIfAutomatic(deps, pair, now);
  if (!verdict.allowed) return 'minor';

  const days = await loadWindow(deps, pair, now);
  if (!acquaintanceProgress({ days, now, thresholds: deps.thresholds ?? environmentThresholds() }).met) return 'insufficient';

  const outcome = await recordAcquaintance(deps.prisma as unknown as UserRelationDb, { userA: pair.userLowId, userB: pair.userHighId, at: now });
  if (outcome === 'created' || outcome === 'raised') {
    await announce(deps.notify, pair.userLowId, pair.userHighId);
    return outcome;
  }
  return outcome === 'ignored' ? 'ignored' : 'unchanged';
}

/**
 * Le blocage vient d'être posé (#13932) : la Connaissance née toute seule est
 * défaite TOUT DE SUITE, en silence — le rattrapage ne relit que les paires de la
 * semaine glissante, et une paire sans échange récent garderait sinon son lien
 * jusqu'au déblocage. Rien à attendre, rien qui jette ; un lien monté par une
 * demande n'est pas touché (`cancelIfAutomatic`).
 */
export function cancelAutoAcquaintanceOnBlock(
  prisma: AutoAcquaintanceDeps['prisma'],
  params: { blockerId: string; blockedId: string },
): void {
  evaluateAutoAcquaintance({ prisma }, { userA: params.blockerId, userB: params.blockedId }).catch((error: unknown) =>
    logger.warn('acquaintance not cancelled after block', { error }),
  );
}
