/**
 * LA SAISON (#9386) — producteur UNIQUE de `GameSeason`. La LOI (calendrier de
 * 8 semaines, 40 étapes de 4 étoiles, récompenses, Sceau, règlement) vient de
 * `@meeshy/shared/utils/game/season` ; ce service l'applique contre la base.
 *
 *  - **les étoiles** viennent des missions achevées (1 · 1 · 2 · 3 selon la
 *    difficulté) et du duo mené à bout (5) — jamais d'un achat ;
 *  - **une étape se réclame une fois** : l'écriture est conditionnelle à
 *    « cette étape n'est pas déjà réclamée », donc deux requêtes concurrentes
 *    ne paient qu'une récompense ; rejouer rend `already-claimed` ;
 *  - **le parcours terminé** (étape 40) règle la saison : coupe, +500 de Gloire,
 *    trophée daté — une fois, par la clé de Gloire `season:<n>` ;
 *  - **le Sceau** (10 Meeshes) est la SEULE dépense de la saison, par le registre
 *    des dépenses (`MeeshSpend`) : idempotent, atomique avec son effet. La saison
 *    reste HORS ARGENT (conformité C-1) : aucune offre payante, aucun passe. Toute
 *    monétisation est précédée du remplacement de NLLB-200 et MMS-TTS (#9227) ;
 *  - **une saison fermée ne se réclame plus** (`SEASON_NOT_OPEN`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SeasonClaimResponse, SeasonSealResponse } from '@meeshy/shared/types/game';
import {
  SEASON_SEAL_PRICE,
  SEASON_STEPS,
  claimSeasonStep,
  seasonOfMoment,
  seasonProgress,
  seasonSettlement,
  seasonStarsForMission,
  type SeasonStarSource,
} from '@meeshy/shared/utils/game/season';
import { seasonCupTrophy } from '@meeshy/shared/utils/game/trophies';
import { GameRefusal } from './GameRefusal';
import type { GameNotifier } from './GameNotifier';
import { GloryService } from './GloryService';
import { MeeshSpend } from './MeeshSpend';
import { GAME_BONUS_AXIS } from './MissionService';
import { TrophyService } from './TrophyService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';

export type SeasonServiceDeps = {
  readonly creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>;
  readonly grantFreeze: (userId: string) => Promise<void>;
  readonly glory?: GloryService;
  readonly trophies?: TrophyService;
  /** Prévient le joueur d'une étape atteinte (#9490) — jamais bloquant. */
  readonly notifier?: Pick<GameNotifier, 'notify'>;
};

export type SeasonState = {
  readonly number: number | null;
  readonly stars: number;
  readonly claimedSteps: readonly number[];
  readonly sealOwned: boolean;
};

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const NO_SEASON: SeasonState = { number: null, stars: 0, claimedSteps: [], sealOwned: false };

export class SeasonService {
  private readonly glory: GloryService;

  private readonly trophies: TrophyService;

  private readonly spend: MeeshSpend;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: SeasonServiceDeps,
  ) {
    this.glory = deps.glory ?? new GloryService(prisma);
    this.trophies = deps.trophies ?? new TrophyService(prisma);
    this.spend = new MeeshSpend(prisma);
  }

  /** La saison en cours pour ce compte (son fuseau), `null` avant la première. */
  private async currentNumber(userId: string, now: Date): Promise<number | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return seasonOfMoment({ dayKey: dayKeyOf(now, row?.timezone), minuteOfDay: minuteOfDayInTimezone(now, row?.timezone) });
  }

  /** Des étoiles gagnées : une mission achevée (par difficulté) ou un duo mené à bout. */
  async addStars(userId: string, source: SeasonStarSource, now: Date = new Date()): Promise<void> {
    const number = await this.currentNumber(userId, now);
    if (number === null) return;
    const stars = seasonStarsForMission(source);
    const write = () =>
      this.prisma.gameSeason.upsert({
        where: { userId_number: { userId, number } },
        create: { userId, number, stars, claimedSteps: [], sealOwnedAt: null, settledAt: null },
        update: { stars: { increment: stars } },
        select: { stars: true },
      });
    let after: { readonly stars: number };
    try {
      after = await write();
    } catch (err) {
      // L'upsert qui perd la création concurrente lève P2002 sur MongoDB : le rejouer incrémente.
      if (!isP2002(err)) throw err;
      after = await write();
    }
    this.announceStep({ userId, number, before: after.stars - stars, after: after.stars });
  }

  /** Une étape franchie (la plus haute, si plusieurs d'un coup) prévient le joueur — détaché et gardé. */
  private announceStep(params: { readonly userId: string; readonly number: number; readonly before: number; readonly after: number }): void {
    const reached = seasonProgress({ stars: params.after }).steps;
    if (reached <= seasonProgress({ stars: params.before }).steps) return;
    const pending = this.deps.notifier?.notify({
      kind: 'season-step',
      recipientId: params.userId,
      season: params.number,
      step: reached,
      completed: reached >= SEASON_STEPS,
    });
    if (pending !== undefined) pending.catch(() => undefined);
  }

  async state(userId: string, now: Date = new Date()): Promise<SeasonState> {
    const number = await this.currentNumber(userId, now);
    if (number === null) return NO_SEASON;
    const row = await this.prisma.gameSeason.findUnique({
      where: { userId_number: { userId, number } },
      select: { stars: true, claimedSteps: true, sealOwnedAt: true },
    });
    return { number, stars: row?.stars ?? 0, claimedSteps: row?.claimedSteps ?? [], sealOwned: row?.sealOwnedAt != null };
  }

  private async score(userId: string): Promise<number> {
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { engagementScore: true } }))?.engagementScore ?? 0;
  }

  /** Réclame la récompense d'une étape atteinte. */
  async claim(params: { readonly userId: string; readonly step: number; readonly now?: Date }): Promise<SeasonClaimResponse> {
    const { userId, step } = params;
    const now = params.now ?? new Date();
    const state = await this.state(userId, now);
    if (state.number === null) throw new GameRefusal('SEASON_NOT_OPEN');
    const season = state.number;

    const verdict = claimSeasonStep({
      season,
      step,
      stepsReached: seasonProgress({ stars: state.stars }).steps,
      claimed: state.claimedSteps,
      sealOwned: state.sealOwned,
    });

    if (verdict.allowed === false) {
      if (verdict.reason === 'out-of-range') throw new GameRefusal('SEASON_STEP_NOT_FOUND');
      if (verdict.reason === 'locked') throw new GameRefusal('SEASON_STEP_LOCKED');
      return this.alreadyClaimed(userId, season, step, state.sealOwned);
    }

    const claimed = await this.prisma.gameSeason.updateMany({
      where: { userId, number: season, NOT: { claimedSteps: { has: step } } },
      data: { claimedSteps: { push: step } },
    });
    if (claimed.count === 0) return this.alreadyClaimed(userId, season, step, state.sealOwned);

    try {
      await this.pay(userId, verdict.reward);
    } catch (error) {
      await this.releaseStep(userId, season, step);
      throw error;
    }

    let gloryGained = 0;
    let completed = false;
    if (verdict.reward.kind === 'season-cup') {
      const settlement = seasonSettlement({ season, stepsReached: step });
      completed = settlement.completed;
      if (settlement.glory > 0 && (await this.glory.credit({ userId, delta: settlement.glory, reason: 'season', requestId: `season:${season}`, meta: { season } }))) {
        gloryGained = settlement.glory;
      }
      if (settlement.cup) await this.trophies.award(userId, seasonCupTrophy(season), now);
      await this.prisma.gameSeason.updateMany({ where: { userId, number: season }, data: { settledAt: now } });
    }
    return {
      status: 'claimed',
      step,
      reward: verdict.reward,
      seal: verdict.seal,
      completed,
      gloryGained,
      score: await this.score(userId),
    };
  }

  /**
   * Rend UNE étape réclamée dont le paiement a échoué. Compare-and-write sur la
   * liste RELUE : réécrire l'instantané lu avant la réclamation effacerait une
   * étape qu'une requête concurrente vient de réclamer — et de payer —, qui se
   * paierait alors une seconde fois.
   */
  private async releaseStep(userId: string, season: number, step: number): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await this.prisma.gameSeason.findUnique({ where: { userId_number: { userId, number: season } }, select: { claimedSteps: true } });
      const current = row?.claimedSteps ?? [];
      if (!current.includes(step)) return;
      const released = await this.prisma.gameSeason.updateMany({
        where: { userId, number: season, claimedSteps: { equals: current } },
        data: { claimedSteps: current.filter((s) => s !== step) },
      });
      if (released.count === 1) return;
    }
  }

  private async pay(userId: string, reward: { readonly kind: string; readonly amount: number }): Promise<void> {
    if (reward.kind === 'points') await this.deps.creditPoints(userId, reward.amount, GAME_BONUS_AXIS);
    else if (reward.kind === 'freeze') await this.deps.grantFreeze(userId);
    // `fragment` et `season-cup` ne portent aucun paiement ici : le fragment se grave avec l'étape
    // réclamée, la coupe avec le trophée du règlement.
  }

  private async alreadyClaimed(userId: string, season: number, step: number, sealOwned: boolean): Promise<SeasonClaimResponse> {
    const verdict = claimSeasonStep({ season, step, stepsReached: 40, claimed: [], sealOwned });
    if (verdict.allowed === false) throw new GameRefusal('SEASON_STEP_NOT_FOUND');
    return { status: 'already-claimed', step, reward: verdict.reward, seal: verdict.seal, completed: false, gloryGained: 0, score: await this.score(userId) };
  }

  /** Achète le Sceau de la saison : 10 Meeshes, une fois. */
  async buySeal(params: { readonly userId: string; readonly requestId: string; readonly now?: Date }): Promise<SeasonSealResponse> {
    const { userId, requestId } = params;
    const now = params.now ?? new Date();
    const season = await this.currentNumber(userId, now);
    if (season === null) throw new GameRefusal('SEASON_NOT_OPEN');

    const owned = async (db: Pick<PrismaClient, 'gameSeason'>): Promise<boolean> =>
      (await db.gameSeason.findUnique({ where: { userId_number: { userId, number: season } }, select: { sealOwnedAt: true } }))?.sealOwnedAt != null;

    const assertAvailable = async (db: Pick<PrismaClient, 'gameSeason'>) => {
      if (await owned(db)) throw new GameRefusal('SEAL_ALREADY_OWNED');
    };

    const outcome = await this.spend.spend<true>({
      userId,
      requestId,
      price: SEASON_SEAL_PRICE,
      kind: 'season-seal',
      meta: { season },
      guard: () => assertAvailable(this.prisma),
      apply: async (tx) => {
        await assertAvailable(tx);
        await tx.gameSeason.upsert({
          where: { userId_number: { userId, number: season } },
          create: { userId, number: season, stars: 0, claimedSteps: [], sealOwnedAt: now, settledAt: null },
          update: { sealOwnedAt: now },
          select: { id: true },
        });
        return true;
      },
    });

    if (outcome.status === 'spent') return { status: 'bought', balance: outcome.balance };
    if (outcome.status === 'already-spent') return { status: 'already-bought', balance: outcome.balance };
    throw new GameRefusal('INSUFFICIENT_MEESHES', { balance: outcome.balance });
  }
}
