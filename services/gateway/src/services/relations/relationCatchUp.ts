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
 *
 * ## Aucune paire affamée
 *
 * Une passe relit au plus `MAX_PAIRS_PER_PASS` paires. Quand elle s'arrête au
 * plafond, la suivante REPREND là où elle s'est arrêtée (curseur tenu par client
 * de base, d'une passe à l'autre) ; arrivée au bout, elle repart du début. Toute
 * paire active est donc relue en au plus ⌈paires / plafond⌉ passes. Un redémarrage
 * repart du début : rien n'est perdu, la rotation recommence.
 *
 * Une paire déjà au moins Connaissance par un lien que l'évaluation ne peut pas
 * défaire (une demande acceptée, un niveau relevé à la main) est SAUTÉE : elle ne
 * coûterait que des lectures pour rendre « inchangé ».
 */
import { compareRelationLevel, parseRelationLevel } from '@meeshy/shared/types/relation';
import { addUtcDays, utcDayStart } from '@meeshy/shared/utils/iso-week';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  ACQUAINTANCE_WINDOW_LOOKBACK_DAYS,
  evaluateAutoAcquaintance,
  isOwnAcquaintance,
  type AutoAcquaintanceDeps,
} from './autoAcquaintance.js';

const logger = enhancedLogger.child({ module: 'RelationCatchUp' });

const PAGE_SIZE = 1000;
const MAX_PAIRS_PER_PASS = 20000;

export type RelationCatchUpReport = {
  readonly pairs: number;
  readonly skipped: number;
  readonly created: number;
  readonly raised: number;
  readonly cancelled: number;
  readonly failed: number;
};

type Pair = readonly [string, string];

const resumeCursors = new WeakMap<object, string>();

async function activePairs(
  deps: AutoAcquaintanceDeps,
  now: Date,
  from: string | undefined,
): Promise<{ readonly pairs: ReadonlyArray<Pair>; readonly stoppedAt: string | undefined }> {
  const since = addUtcDays(utcDayStart(now), -ACQUAINTANCE_WINDOW_LOOKBACK_DAYS);
  const seen = new Map<string, Pair>();
  let cursor = from;
  for (;;) {
    const page = await deps.prisma.pairInteractionDay.findMany({
      where: { day: { gte: since, lte: utcDayStart(now) } },
      select: { id: true, userLowId: true, userHighId: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    page.forEach((row) => seen.set(`${row.userLowId}:${row.userHighId}`, [row.userLowId, row.userHighId]));
    if (page.length < PAGE_SIZE) return { pairs: [...seen.values()], stoppedAt: undefined };
    cursor = page[page.length - 1].id;
    if (seen.size >= MAX_PAIRS_PER_PASS) return { pairs: [...seen.values()], stoppedAt: cursor };
  }
}

const isSettled = (row: { grantedByLow?: string | null; grantedByHigh?: string | null; origin?: string | null }): boolean =>
  !isOwnAcquaintance(row) &&
  compareRelationLevel(parseRelationLevel(row.grantedByLow), 'ACQUAINTANCE') >= 0 &&
  compareRelationLevel(parseRelationLevel(row.grantedByHigh), 'ACQUAINTANCE') >= 0;

async function settledPairs(deps: AutoAcquaintanceDeps, pairs: ReadonlyArray<Pair>): Promise<ReadonlySet<string>> {
  const chunks = Array.from({ length: Math.ceil(pairs.length / PAGE_SIZE) }, (_, i) => pairs.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE));
  const settled = new Set<string>();
  for (const chunk of chunks) {
    const rows = await deps.prisma.userRelation.findMany({
      where: { OR: chunk.map(([userLowId, userHighId]) => ({ userLowId, userHighId })) },
      select: { userLowId: true, userHighId: true, grantedByLow: true, grantedByHigh: true, origin: true },
      take: chunk.length,
    });
    rows.filter(isSettled).forEach((row) => settled.add(`${row.userLowId}:${row.userHighId}`));
  }
  return settled;
}

export async function runRelationCatchUp(deps: AutoAcquaintanceDeps): Promise<RelationCatchUpReport> {
  const now = (deps.now ?? (() => new Date()))();
  const scan = await activePairs(deps, now, resumeCursors.get(deps.prisma));
  if (scan.stoppedAt) resumeCursors.set(deps.prisma, scan.stoppedAt);
  else resumeCursors.delete(deps.prisma);

  const settled = await settledPairs(deps, scan.pairs);
  const tally = { skipped: 0, created: 0, raised: 0, cancelled: 0, failed: 0 };

  for (const [userA, userB] of scan.pairs) {
    if (settled.has(`${userA}:${userB}`)) {
      tally.skipped += 1;
      continue;
    }
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
  return { pairs: scan.pairs.length, ...tally };
}
