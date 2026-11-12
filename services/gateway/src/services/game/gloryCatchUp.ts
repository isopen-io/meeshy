/**
 * LE RATTRAPAGE DE GLOIRE (#17779) — les exploits DÉJÀ PROUVÉS, payés au barème actuel, en ajout seul.
 *
 * Les barèmes ont été multipliés par dix le 2026-10-08 (#9636) et la Gloire déjà gravée n'a jamais suivi. Pour chaque
 * compte et chaque source, le rattrapage calcule « ce que les exploits prouvés valent au barème actuel » moins « ce que
 * le registre a déjà payé pour cette source », et grave la différence si elle est positive — UNE ligne par (compte,
 * source) au plus, sous une clé propre au rattrapage et versionnée (`rattrapage-bareme-2026-11:<source>`). Aucune
 * ligne n'est réécrite ni supprimée ; la ligne gravée entre dans le déjà-payé, et l'unicité `(userId, requestId)`
 * empêche un second paiement : rejouer ne paie rien.
 *
 *  - `mint` : chaque frappe du `MeeshLedger` (`reason: 'mint'`, `delta > 0`) vaut `GLORY_POINTS.mint` — la frappe
 *    vivante grave ce montant sans modulation d'édition ; déjà payé = Σ des lignes `mint`.
 *  - `level` : chaque niveau DÉJÀ gravé (`level:<n>`) vaut `gloryForLevel(n)` ; aucun niveau n'est inventé.
 *  - `flame-record` : les records de `FLAME_RECORD_GLORY` atteints par `User.longestStreakDays` (le plus long record à
 *    vie, que `FlameService` ne fait que monter) ; déjà payé = Σ des lignes `flame-record`.
 *  - `mission` / `mission-gold` : chaque mission accomplie SANS ligne `mission:<id>` (tirée à 0 de Gloire, donc jamais
 *    payée par `MissionService.complete`) vaut `gloryForMission(difficulté)`, sous la reason que `complete` aurait
 *    posée ; déjà payé = la ligne de rattrapage de cette source.
 *
 * Hors périmètre (non prouvables, ou gravés à la Gloire de leur moment) : coffres, succès, ligues, saisons, prestige —
 * et les missions payées sous l'ancien barème. Le rapport compte les lignes sous le barème actuel, sans rien payer.
 *
 * Les écritures passent par `GloryService.credit` (révision de jeu, place du Mythe, ouverture des niveaux quand le
 * rang monte), `announce: false` : aucune annonce ne part.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  GLORY_POINTS,
  MISSION_GLORY,
  gloryForAchievement,
  gloryForFlameRecords,
  gloryForLevel,
  gloryForMission,
  gloryStanding,
  type GloryStanding,
  type MissionGloryDifficulty,
} from '@meeshy/shared/utils/game/glory';
import { gloryTotalFromLedger, type GloryService } from './GloryService';

export const GLORY_CATCH_UP_ISSUE = 17779;
export const GLORY_CATCH_UP_VERSION = 'rattrapage-bareme-2026-11';

export type GloryCatchUpSource = 'mint' | 'level' | 'flame-record' | 'mission' | 'mission-gold';

export type GloryLedgerFact = { readonly reason: string; readonly requestId: string; readonly delta: number };
export type CompletedMissionFact = { readonly id: string; readonly difficulty: string | null };

export type GloryCatchUpFacts = {
  readonly mintsProven: number;
  readonly longestStreakDays: number | null;
  readonly ledger: readonly GloryLedgerFact[];
  readonly completedMissions: readonly CompletedMissionFact[];
};

export type GloryCatchUpLine = {
  readonly source: GloryCatchUpSource;
  readonly reason: GloryCatchUpSource;
  readonly requestId: string;
  readonly delta: number;
  readonly paid: number;
  readonly target: number;
};

/** Lignes du registre SOUS le barème actuel, par source hors périmètre — comptées, jamais payées. */
export type ApparentGaps = {
  readonly achievement: number;
  readonly league: number;
  readonly season: number;
  readonly prestige: number;
  readonly missionsBelowScale: number;
};

export type GloryCatchUpResult = { readonly lines: readonly GloryCatchUpLine[]; readonly apparentGaps: ApparentGaps };

export const gloryCatchUpRequestId = (source: GloryCatchUpSource): string => `${GLORY_CATCH_UP_VERSION}:${source}`;

const LEVEL_KEY = /^level:(\d+)$/;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const paidFor = (ledger: readonly GloryLedgerFact[], keep: (line: GloryLedgerFact) => boolean): number =>
  sum(ledger.filter(keep).map((line) => line.delta));

const isMissionDifficulty = (value: string | null): value is MissionGloryDifficulty =>
  value !== null && Object.prototype.hasOwnProperty.call(MISSION_GLORY, value);

const lineOf = (source: GloryCatchUpSource, target: number, paid: number): GloryCatchUpLine => ({
  source,
  reason: source,
  requestId: gloryCatchUpRequestId(source),
  delta: target - paid,
  paid,
  target,
});

const levelTarget = (ledger: readonly GloryLedgerFact[]): number => {
  const levels = new Set(ledger.flatMap((line) => LEVEL_KEY.exec(line.requestId)?.[1] ?? []).map(Number));
  return sum([...levels].map(gloryForLevel));
};

const missionTarget = (missions: readonly CompletedMissionFact[], ledger: readonly GloryLedgerFact[], gold: boolean): number => {
  const paidKeys = new Set(ledger.map((line) => line.requestId));
  return sum(
    missions
      .filter((mission) => !paidKeys.has(`mission:${mission.id}`))
      .map((mission) => mission.difficulty)
      .filter(isMissionDifficulty)
      .filter((difficulty) => (difficulty === 'gold') === gold)
      .map(gloryForMission),
  );
};

const countBelow = (ledger: readonly GloryLedgerFact[], reason: string, floor: number): number =>
  ledger.filter((line) => line.reason === reason && line.delta > 0 && line.delta < floor).length;

const missionsBelowScale = (missions: readonly CompletedMissionFact[], ledger: readonly GloryLedgerFact[]): number => {
  const paidByKey = new Map(ledger.map((line) => [line.requestId, line.delta] as const));
  return missions.filter((mission) => {
    const paid = paidByKey.get(`mission:${mission.id}`);
    return paid !== undefined && isMissionDifficulty(mission.difficulty) && paid < gloryForMission(mission.difficulty);
  }).length;
};

/** Le calcul PUR : les faits d'un compte, les lignes à graver. */
export function gloryCatchUpLines(facts: GloryCatchUpFacts): GloryCatchUpResult {
  const { ledger } = facts;
  const byReason = (reason: string) => (line: GloryLedgerFact) => line.reason === reason;
  const byCatchUpKey = (source: GloryCatchUpSource) => (line: GloryLedgerFact) => line.requestId === gloryCatchUpRequestId(source);

  const candidates: readonly GloryCatchUpLine[] = [
    lineOf('mint', Math.max(0, facts.mintsProven) * GLORY_POINTS.mint, paidFor(ledger, byReason('mint'))),
    lineOf('level', levelTarget(ledger), paidFor(ledger, byReason('level'))),
    lineOf('flame-record', gloryForFlameRecords({ previousLongest: 0, longest: facts.longestStreakDays ?? 0 }), paidFor(ledger, byReason('flame-record'))),
    lineOf('mission', missionTarget(facts.completedMissions, ledger, false), paidFor(ledger, byCatchUpKey('mission'))),
    lineOf('mission-gold', missionTarget(facts.completedMissions, ledger, true), paidFor(ledger, byCatchUpKey('mission-gold'))),
  ];

  return {
    lines: candidates.filter((line) => line.delta > 0),
    apparentGaps: {
      achievement: countBelow(ledger, 'achievement', gloryForAchievement('common')),
      league: countBelow(ledger, 'league', GLORY_POINTS.leagueUp),
      season: countBelow(ledger, 'season', GLORY_POINTS.season),
      prestige: countBelow(ledger, 'prestige', GLORY_POINTS.prestige),
      missionsBelowScale: missionsBelowScale(facts.completedMissions, ledger),
    },
  };
}

// ——— L'exécution, par lots ———

export const GLORY_CATCH_UP_DEFAULT_BATCH = 200;
export const GLORY_CATCH_UP_MAX_BATCH = 1000;

type CatchUpDb = Pick<PrismaClient, 'user' | 'gloryLedger' | 'meeshLedger' | 'dailyMission' | 'mythicSeat'>;

export type GloryCatchUpReport = {
  readonly scanned: number;
  readonly accounts: number;
  readonly gloryAdded: number;
  readonly bySource: Readonly<Record<GloryCatchUpSource, number>>;
  /** Comptes portant au moins une ligne sous le barème actuel, par source hors périmètre. */
  readonly apparentGapAccounts: Readonly<Record<keyof ApparentGaps, number>>;
};

type BatchAccount = { readonly id: string; readonly username: string | null; readonly longestStreakDays: number | null };

const ROMAN: Readonly<Record<number, string>> = { 5: 'V', 4: 'IV', 3: 'III', 2: 'II', 1: 'I' };

const standingLabel = (standing: GloryStanding): string =>
  standing.division5 === null ? standing.rank : `${standing.rank} ${ROMAN[standing.division5]}`;

const groupBy = <T extends { readonly userId: string }>(rows: readonly T[]): ReadonlyMap<string, readonly T[]> =>
  rows.reduce((map, row) => map.set(row.userId, [...(map.get(row.userId) ?? []), row]), new Map<string, T[]>());

async function readBatch(db: CatchUpDb, cursor: string | null, take: number): Promise<readonly BatchAccount[]> {
  return db.user.findMany({
    where: cursor === null ? {} : { id: { gt: cursor } },
    orderBy: { id: 'asc' },
    take,
    select: { id: true, username: true, longestStreakDays: true },
  });
}

async function readFacts(db: CatchUpDb, ids: readonly string[]) {
  const userId = { in: [...ids] };
  const [ledger, mints, missions, seats] = await Promise.all([
    db.gloryLedger.findMany({ where: { userId }, select: { userId: true, reason: true, requestId: true, delta: true } }),
    db.meeshLedger.findMany({ where: { userId, reason: 'mint', delta: { gt: 0 } }, select: { userId: true } }),
    db.dailyMission.findMany({ where: { userId, completedAt: { not: null } }, select: { userId: true, id: true, difficulty: true } }),
    db.mythicSeat.findMany({ where: { userId }, select: { userId: true, number: true, edition: true } }),
  ]);
  return { ledger: groupBy(ledger), mints: groupBy(mints), missions: groupBy(missions), seats: groupBy(seats) };
}

const emptyBySource = (): Record<GloryCatchUpSource, number> => ({ mint: 0, level: 0, 'flame-record': 0, mission: 0, 'mission-gold': 0 });
const emptyGaps = (): Record<keyof ApparentGaps, number> => ({ achievement: 0, league: 0, season: 0, prestige: 0, missionsBelowScale: 0 });

/**
 * Lit les comptes par lots (`_id` croissant), calcule, et — sans `dryRun` — grave par `GloryService.credit`. Imprime,
 * par compte touché : username, Gloire et rang avant/après, détail par source ; puis le total.
 */
export async function runGloryCatchUp(params: {
  readonly prisma: CatchUpDb;
  readonly glory: Pick<GloryService, 'credit' | 'openLevels'>;
  readonly dryRun: boolean;
  readonly batchSize: number;
  readonly out: (line: string) => void;
}): Promise<GloryCatchUpReport> {
  const { prisma, glory, dryRun, out } = params;
  const take = Math.min(Math.max(1, Math.trunc(params.batchSize) || GLORY_CATCH_UP_DEFAULT_BATCH), GLORY_CATCH_UP_MAX_BATCH);
  const bySource = emptyBySource();
  const gapAccounts = emptyGaps();
  let scanned = 0;
  let accounts = 0;
  let gloryAdded = 0;
  let cursor: string | null = null;

  out(`Rattrapage de Gloire (#${GLORY_CATCH_UP_ISSUE}, ${GLORY_CATCH_UP_VERSION}) — ${dryRun ? 'À BLANC (DRY_RUN=1), rien n\'est écrit' : 'ÉCRITURE'}`);

  for (;;) {
    const batch = await readBatch(prisma, cursor, take);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    scanned += batch.length;
    const facts = await readFacts(prisma, batch.map((account) => account.id));

    for (const account of batch) {
      const ledger = facts.ledger.get(account.id) ?? [];
      const result = gloryCatchUpLines({
        mintsProven: (facts.mints.get(account.id) ?? []).length,
        longestStreakDays: account.longestStreakDays,
        ledger,
        completedMissions: facts.missions.get(account.id) ?? [],
      });
      (Object.keys(gapAccounts) as (keyof ApparentGaps)[]).forEach((key) => {
        if (result.apparentGaps[key] > 0) gapAccounts[key] += 1;
      });
      if (result.lines.length === 0) continue;

      const seat = (facts.seats.get(account.id) ?? [])[0] ?? null;
      const mythicSeat = seat === null ? null : { number: seat.number, edition: seat.edition };
      const before = sum(ledger.map((line) => line.delta));
      const written: GloryCatchUpLine[] = [];
      for (const line of result.lines) {
        const ok =
          dryRun ||
          (await glory.credit(
            {
              userId: account.id,
              delta: line.delta,
              reason: line.reason,
              requestId: line.requestId,
              meta: { rattrapage: GLORY_CATCH_UP_ISSUE, avant: line.paid, cible: line.target },
            },
            { announce: false },
          ));
        if (ok) written.push(line);
      }
      if (written.length === 0) continue;
      if (!dryRun) await glory.openLevels(account.id, { announce: false });

      const added = sum(written.map((line) => line.delta));
      const after = dryRun ? before + added : await gloryTotalFromLedger(prisma, account.id);
      accounts += 1;
      gloryAdded += added;
      written.forEach((line) => {
        bySource[line.source] += line.delta;
      });

      const rankBefore = standingLabel(gloryStanding({ glory: before, mythicSeat }));
      const rankAfter = standingLabel(gloryStanding({ glory: after, mythicSeat }));
      out(`${account.username ?? '(sans nom)'} (${account.id}) : Gloire ${before} → ${after} · ${rankBefore} → ${rankAfter}`);
      written.forEach((line) => out(`    ${line.source} : payé ${line.paid}, cible ${line.target}, +${line.delta}`));
    }
  }

  out(`Total : ${scanned} comptes lus, ${accounts} rattrapés, +${gloryAdded} de Gloire${dryRun ? ' (à blanc)' : ''}`);
  out(`  par source : ${(Object.keys(bySource) as GloryCatchUpSource[]).map((source) => `${source} +${bySource[source]}`).join(', ')}`);
  out(
    `  hors périmètre, comptes avec des lignes sous le barème actuel (rien n'est payé) : ${(Object.keys(gapAccounts) as (keyof ApparentGaps)[])
      .map((key) => `${key} ${gapAccounts[key]}`)
      .join(', ')} ; coffres non mesurables (Gloire de l'heure d'ouverture)`,
  );

  return { scanned, accounts, gloryAdded, bySource, apparentGapAccounts: gapAccounts };
}
