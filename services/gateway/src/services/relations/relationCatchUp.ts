/**
 * LE RATTRAPAGE DES CERCLES (#13932) : idempotent et rejouable.
 *
 * Relit les jours de la semaine glissante, retient chaque paire UNE fois, et
 * rejoue l'évaluation de la Connaissance automatique. Comme l'évaluation ne fait
 * que monter (jamais baisser) et ne prévient que sur création ou relève, deux
 * passes donnent le même état — c'est le témoin qui garde ce module.
 *
 * La série hebdomadaire (Proche, Sang) n'a pas de pas hebdomadaire à rattraper :
 * elle se LIT sur l'agrégat à la demande (`relationSeries`), la semaine ISO qui
 * change ne bascule rien. Cette passe ne sert qu'à ce qu'un enregistrement dont
 * l'évaluation immédiate aurait échoué, ou qu'un blocage survenu après coup, ne
 * restent pas sans effet.
 */
import { addUtcDays, utcDayStart } from '@meeshy/shared/utils/iso-week';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  ACQUAINTANCE_WINDOW_LOOKBACK_DAYS,
  evaluateAutoAcquaintance,
  type AutoAcquaintanceDeps,
} from './autoAcquaintance.js';

const logger = enhancedLogger.child({ module: 'RelationCatchUp' });

const PAGE_SIZE = 1000;
const MAX_PAIRS_PER_PASS = 20000;

export type RelationCatchUpReport = {
  readonly pairs: number;
  readonly created: number;
  readonly raised: number;
  readonly cancelled: number;
  readonly failed: number;
};

async function activePairs(deps: AutoAcquaintanceDeps, now: Date): Promise<ReadonlyArray<readonly [string, string]>> {
  const since = addUtcDays(utcDayStart(now), -ACQUAINTANCE_WINDOW_LOOKBACK_DAYS);
  const seen = new Map<string, readonly [string, string]>();
  let cursor: string | undefined;
  for (;;) {
    const page = await deps.prisma.pairInteractionDay.findMany({
      where: { day: { gte: since, lte: utcDayStart(now) } },
      select: { id: true, userLowId: true, userHighId: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    page.forEach((row) => seen.set(`${row.userLowId}:${row.userHighId}`, [row.userLowId, row.userHighId]));
    if (page.length < PAGE_SIZE || seen.size >= MAX_PAIRS_PER_PASS) break;
    cursor = page[page.length - 1].id;
  }
  return [...seen.values()];
}

export async function runRelationCatchUp(deps: AutoAcquaintanceDeps): Promise<RelationCatchUpReport> {
  const now = (deps.now ?? (() => new Date()))();
  const pairs = await activePairs(deps, now);
  const tally = { created: 0, raised: 0, cancelled: 0, failed: 0 };

  for (const [userA, userB] of pairs) {
    try {
      const outcome = await evaluateAutoAcquaintance({ ...deps, now: () => now }, { userA, userB });
      if (outcome === 'created') tally.created += 1;
      if (outcome === 'raised') tally.raised += 1;
      if (outcome === 'cancelled') tally.cancelled += 1;
    } catch (error) {
      tally.failed += 1;
      logger.warn('relation catch-up failed for one pair', { userA, userB, error });
    }
  }
  return { pairs: pairs.length, ...tally };
}
