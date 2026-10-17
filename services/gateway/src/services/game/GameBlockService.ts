/**
 * LE BLOC `game` (#9378) — servi à CÔTÉ des champs actuels de
 * `GET /me/engagement`, jamais à leur place : un ancien client l'ignore.
 *
 * La passerelle sait ce qu'elle PERSISTE (score, record, Gloire, solde, série,
 * gels, missions, coffre, clés de guide) ; tout le reste se déduit par
 * `buildGameBlock` (`@meeshy/shared/utils/game/game-block`), écrit une fois :
 * c'est la recomposition par site qui fait diverger les clients.
 *
 * Ce que le service sert est VALIDÉ contre le schéma partagé avant de partir :
 * un bloc qui ne tient pas le contrat est refusé (`null`) plutôt que servi à
 * moitié — et le reste de la charge part sans lui.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { parseGameBlock, type GameBlock } from '@meeshy/shared/types/game';
import { buildGameBlock } from '@meeshy/shared/utils/game/game-block';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { meeshTotalsFromLedger } from '../meesh/MeeshService';
import { FLAME_USER_SELECT, brokenFlame, flameFactsOf } from './FlameService';
import { GameBlockExtrasService } from './GameBlockExtrasService';
import type { PersonalMissionService } from './PersonalMissionService';
import { gloryTotalFromLedger } from './GloryService';
import { MythicSeatService } from './MythicSeatService';
import { chestRewardOf, toGameMission, type MissionService } from './MissionService';
import { countMissionsDone } from './LevelStepFacts';
import { starFragmentsOf } from './StarFragments';
import { SPARKS_USER_SELECT, levelSparksOf, sparksOf } from './SparksFacts';

const log = enhancedLogger.child({ module: 'GameBlockService' });

export const GUIDE_SEEN_MAX = 200;

const GAME_USER_SELECT = { ...FLAME_USER_SELECT, ...SPARKS_USER_SELECT, prestige: true, guideSeen: true } as const;

export type AxisRow = { readonly axisKey: string; readonly count: number; readonly points: number };

export class GameBlockService {
  private readonly extras: Pick<GameBlockExtrasService, 'build'>;

  private readonly seats: Pick<MythicSeatService, 'claimIfEligible'>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: {
      readonly missions: Pick<MissionService, 'ensureToday' | 'gameDay'> & Partial<Pick<MissionService, 'chestPriceBase'>>;
      /** Les sept extensions de la vague 2 ; remplaçable en test. */
      readonly extras?: Pick<GameBlockExtrasService, 'build'>;
      /** Les places du Mythe (#9636) ; remplaçable en test. */
      readonly seats?: Pick<MythicSeatService, 'claimIfEligible'>;
      /** La mission personnelle du jour (#9539) : absente, le bloc garde la forme d'avant. */
      readonly personal?: Pick<PersonalMissionService, 'ensure'>;
    },
  ) {
    this.extras = deps.extras ?? new GameBlockExtrasService(prisma);
    this.seats = deps.seats ?? new MythicSeatService(prisma);
  }

  /**
   * Le bloc, ou `null` s'il ne tient pas le contrat. `counters` (ignoré depuis les étincelles, #10846 : tout est convertible, aucun plan par axe) : les lignes que
   * la route a déjà lues — une relecture ne servirait qu'à payer deux fois.
   */
  async build(params: { readonly userId: string; readonly now?: Date; readonly counters?: readonly AxisRow[] }): Promise<GameBlock | null> {
    const { userId } = params;
    const now = params.now ?? new Date();

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: GAME_USER_SELECT });
    const [totals, glory, missionsDone, starFragments] = await Promise.all([
      meeshTotalsFromLedger(this.prisma, userId),
      gloryTotalFromLedger(this.prisma, userId),
      // Les missions du jour accomplies à vie, que jugent les étapes des niveaux (#9706).
      countMissionsDone(this.prisma, userId),
      // Les fragments d'étoile collectés (#10011) : un appoint — une lecture qui tombe ne retient pas le bloc.
      starFragmentsOf(this.prisma, userId).catch(() => undefined),
    ]);
    const day = await this.deps.missions.ensureToday(userId, now);
    // Le cours de la prime du coffre, figé au début du jour de jeu et gravé à cette lecture (#10219). Un appoint :
    // une lecture qui tombe rend le cours d'avant (`mintedLifetime`), jamais le bloc entier.
    // Gravé seulement quand le jour a ses missions (un compte verrouillé n'a pas de coffre à annoncer).
    const chestMintBase =
      day.rows.length === 0
        ? null
        : await this.deps.missions.chestPriceBase?.({ userId, now, dayKey: day.dayKey }).catch((error: unknown) => {
            log.warn('chest price base unavailable, bonus served at the current price', { userId, error: error instanceof Error ? error.message : String(error) });
            return null;
          });
    const gameDay = await this.deps.missions.gameDay(userId, day.dayKey);
    // Un tirage personnel qui échoue ne retient pas le bloc : la mission personnelle est un APPOINT.
    const personal = await this.deps.personal?.ensure(userId, now, day).catch((error: unknown) => {
      log.warn('personal mission unavailable, block served without it', { userId, error: error instanceof Error ? error.message : String(error) });
      return null;
    });

    const facts = flameFactsOf(user ?? {}, now);
    // La place du Mythe (#9636) : celle du compte, ou celle qu'une Gloire gravée hors d'un crédit (la frappe)
    // vient d'ouvrir. Une lecture qui tombe rend le rang sur la Gloire, jamais le bloc entier.
    const mythicSeat = await this.seats.claimIfEligible(userId, glory, now).catch((error: unknown) => {
      log.warn('mythic seat unavailable, rank served from glory', { userId, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
    // Les étincelles (#10846) : la poche que la frappe dépense et que lit le niveau (#10892), le cycle et le total à vie. Tout est
    // convertible — plus de plancher inaliénable ni de débit par axe : `debitablePoints` est la poche entière.
    const sparks = sparksOf(user);

    const block = buildGameBlock({
      userId,
      today: day.dayKey,
      flameToday: facts.today,
      score: sparks.pocket,
      sparks,
      levelMaxLifetime: user?.levelMaxLifetime ?? null,
      levelRecord: user?.levelRecord ?? null,
      prestige: user?.prestige ?? 0,
      glory,
      // La place du Mythe, définitive : celle de CE compte, jamais une liste globale (conformité A-13).
      mythic: mythicSeat !== null,
      mythicSeat,
      mintedLifetime: totals.mintedLifetime,
      chestMintBase: chestMintBase ?? null,
      missionsDone,
      flameRecord: facts.longest,
      debitablePoints: sparks.pocket,
      balance: totals.balance,
      streak: facts.streak,
      lastActiveDay: facts.lastActiveDay,
      broken: brokenFlame(facts),
      freezes: facts.freezes,
      lastRelightDay: facts.lastRelightDay,
      missions: day.rows.map(toGameMission),
      ...(personal && personal.startsAt && personal.endsAt
        ? {
            personalMission: {
              record: toGameMission(personal),
              startsAt: personal.startsAt.toISOString(),
              endsAt: personal.endsAt.toISOString(),
              now: now.toISOString(),
            },
          }
        : {}),
      rerollsUsedToday: gameDay?.rerollCount ?? 0,
      chestClaimed: gameDay?.chestClaimedAt != null,
      chestReward: gameDay?.chestClaimedAt ? chestRewardOf(gameDay) : null,
      ...(starFragments === undefined ? {} : { starFragments }),
      guideSeen: user?.guideSeen ?? [],
    });

    const extensions = await this.extras.build({
      userId,
      score: levelSparksOf(sparks),
      levelRecord: user?.levelRecord ?? null,
      levelMaxLifetime: user?.levelMaxLifetime ?? null,
      prestige: user?.prestige ?? 0,
      flameDays: facts.streak,
      balance: totals.balance,
      timezone: user?.timezone ?? null,
      now,
    });

    const valid = parseGameBlock(extensions === null ? block : { ...block, ...extensions });
    if (valid === null) log.error('game block refused by the shared schema', { userId });
    return valid;
  }

  /**
   * Mémorise les clés de guide vues — ajout seul, sans doublon, borné aux
   * `GUIDE_SEEN_MAX` plus récentes. Idempotent : rejouer ne change rien.
   */
  async markGuideSeen(userId: string, keys: readonly string[]): Promise<string[]> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { guideSeen: true } });
    const known = row?.guideSeen ?? [];
    const merged = [...new Set([...known, ...keys])];
    if (merged.length === known.length) return [...known];
    const kept = merged.slice(-GUIDE_SEEN_MAX);
    await this.prisma.user.update({ where: { id: userId }, data: { guideSeen: kept } });
    return kept;
  }
}
