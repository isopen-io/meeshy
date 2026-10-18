/**
 * LE PRESTIGE (#9389) — au niveau 100, le compte repart du niveau 1 avec une
 * étoile de plus (cinq au plus). La LOI (condition, ce qui repart, Gloire, clé
 * du trophée) vient de `@meeshy/shared/utils/game/prestige` : `prestigeTransition`.
 *
 *  - **atomique** : la mise à jour est CONDITIONNELLE au score et aux étoiles
 *    lus — un crédit qui arrive entre la lecture et l'écriture fait relire,
 *    jamais écraser ;
 *  - **idempotent par `requestId`** : la demande se réclame d'abord (seau
 *    `game.prestige`), puis le passage s'écrit ; rejouer rend `already-passed`
 *    et RÉAPPLIQUE les suites idempotentes (Gloire, trophée), de sorte qu'une
 *    suite tombée entre-temps se rattrape sans jamais payer deux fois ;
 *  - **la Gloire et le trophée portent leur clé** (`prestige:<n>`,
 *    `trophy.prestige.<n>`) : la Gloire ne baisse jamais et un Prestige ne se
 *    paie qu'une fois.
 *
 * ## Étincelles (#10846, décision du porteur 2026-10-16) — la « DÉCISION PORTEUR ATTENDUE » est tranchée
 *
 * Le Prestige vide la poche et le cycle d'étincelles et ramène le niveau actuel à 1 ; le TOTAL À VIE et le NIVEAU MAX À
 * VIE ne bougent pas. Les ligues (niveau 10) et le duo (niveau 20) lisent ce max à vie (`unlockLevelOf`) : un Prestige
 * ne les ferme plus. Seul le record du CYCLE (`levelRecord`) repart à 1. Les compteurs par axe ne sont plus remis à zéro.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PrestigeResponse } from '@meeshy/shared/types/game';
import { closedCycleRecord, prestigeTransition } from '@meeshy/shared/utils/game/prestige';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { prestigeTrophy, trophyKey } from '@meeshy/shared/utils/game/trophies';
import { EngagementQuotas } from '../engagement/EngagementQuotas';
import { SPARKS_USER_SELECT, currentLevelOf, levelSparksOf, sparksOf } from './SparksFacts';
import { GAME_LEVEL_MIN } from '@meeshy/shared/utils/game/levels';
import { GameRefusal } from './GameRefusal';
import { GloryService } from './GloryService';
import { TrophyService } from './TrophyService';
import { announceGameState } from './GameStateBroadcast';
import { stampGameRevisionAfterWrite } from './GameRevision';

const REQUEST_OPERATION = 'game.prestige';
const WRITE_ATTEMPTS = 3;

const NO_PRESTIGE = { OR: [{ prestige: null }, { prestige: { isSet: false } }] };

export class PrestigeService {
  private readonly glory: GloryService;

  private readonly trophies: TrophyService;

  private readonly quotas: EngagementQuotas;

  constructor(
    private readonly prisma: PrismaClient,
    deps: { readonly glory?: GloryService; readonly trophies?: TrophyService } = {},
  ) {
    this.glory = deps.glory ?? new GloryService(prisma);
    this.trophies = deps.trophies ?? new TrophyService(prisma);
    this.quotas = new EngagementQuotas(prisma);
  }

  private async account(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { ...SPARKS_USER_SELECT, prestige: true } });
  }

  async pass(params: { readonly userId: string; readonly requestId: string; readonly now?: Date }): Promise<PrestigeResponse> {
    const { userId, requestId } = params;
    const now = params.now ?? new Date();
    const bucket = `request:${requestId}`;

    const replay = await this.prisma.engagementQuota.findUnique({
      where: { userId_operationKey_bucket: { userId, operationKey: REQUEST_OPERATION, bucket } },
      select: { id: true },
    });
    if (replay !== null) return this.replayed(userId, now);

    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const account = await this.account(userId);
      const stars = account?.prestige ?? 0;
      const sparks = sparksOf(account);
      // Le niveau 100 se lit sur la POCHE (#10892) ; les étapes faites (le plus haut des deux records) ne se défont pas.
      const proof = Math.max(account?.levelRecord ?? 0, account?.levelMaxLifetime ?? 0);
      const verdict = prestigeTransition({ score: levelSparksOf(sparks), prestige: stars, levelRecord: proof === 0 ? null : proof });
      if (verdict.allowed === false) {
        throw new GameRefusal(verdict.reason === 'at-maximum' ? 'PRESTIGE_AT_MAXIMUM' : 'PRESTIGE_LEVEL_TOO_LOW');
      }

      if (!(await this.quotas.claim(userId, REQUEST_OPERATION, bucket, 1))) return this.replayed(userId, now);
      // La poche et le cycle repartent de zéro (#10846). Le total à vie et le niveau max à vie sont POSÉS en valeur avant
      // que le cycle ne soit vidé — un compte d'avant le rattrapage n'a pas encore ces champs, et les perdrait. Les
      // compteurs par axe ne bougent plus : la frappe ne les débite plus.
      const maxLifetime = Math.max(account?.levelMaxLifetime ?? 0, account?.levelRecord ?? 0, currentLevelOf(account), GAME_LEVEL_MIN);
      const written = await this.writePassage(userId, bucket, {
        where: { id: userId, engagementScore: account?.engagementScore ?? 0, ...(stars === 0 ? NO_PRESTIGE : { prestige: stars }) },
        data: {
          prestige: verdict.prestigeAfter,
          engagementScore: verdict.scoreAfter,
          sparksSincePrestige: BigInt(0),
          sparksEarnedLifetime: BigInt(sparks.lifetime),
          levelMaxLifetime: maxLifetime,
          levelRecord: verdict.levelRecordAfter,
          // Le record du cycle que ce passage clôt (#10911) — dans la même écriture conditionnelle : une fois par Prestige.
          prestigeLevelRecords: { push: closedCycleRecord({ levelRecord: account?.levelRecord ?? null, level: currentLevelOf(account) }) },
        },
      });
      if (written.count === 0) {
        // Un crédit ou un autre passage s'est glissé : on rend la demande et on relit.
        await this.prisma.engagementQuota.deleteMany({ where: { userId, operationKey: REQUEST_OPERATION, bucket } });
        continue;
      }
      // L'écriture du passage est conditionnelle (`updateMany`) : la révision (#10912) se grave juste après, atomiquement.
      await stampGameRevisionAfterWrite(this.prisma, userId);
      const gloryGained = await this.followUps(userId, verdict.prestigeAfter, verdict.gloryGained, now);
      announceGameState(userId, 'prestige');
      return { status: 'passed', prestige: verdict.prestigeAfter, score: 0, level: 1, gloryGained, trophyKey: verdict.trophyKey };
    }
    throw new Error('prestige contended');
  }

  /**
   * L'écriture conditionnelle du passage. Une écriture qui TOMBE (réseau, base) rend la réservation de la demande avant de
   * relancer (#10895) : sans cela, la demande restait « en cours » à jamais et son rejeu échouait sans fin.
   */
  private async writePassage(userId: string, bucket: string, args: Parameters<PrismaClient['user']['updateMany']>[0]): Promise<{ count: number }> {
    try {
      return await this.prisma.user.updateMany(args);
    } catch (error) {
      await this.prisma.engagementQuota.deleteMany({ where: { userId, operationKey: REQUEST_OPERATION, bucket } });
      throw error;
    }
  }

  /** La Gloire et le trophée, par clé : rejouables, jamais payés deux fois. */
  private async followUps(userId: string, number: number, glory: number, now: Date): Promise<number> {
    const written = await this.glory.credit({ userId, delta: glory, reason: 'prestige', requestId: `prestige:${number}`, meta: { number } });
    await this.trophies.award(userId, prestigeTrophy(number), now);
    return written ? glory : 0;
  }

  /**
   * La demande est déjà réclamée. Sans étoile écrite, le passage est EN COURS (ou
   * tombé avant son écriture) : on ne paie rien d'un Prestige qui n'a pas eu
   * lieu — l'erreur est transitoire, le client rejoue.
   */
  private async replayed(userId: string, now: Date): Promise<PrestigeResponse> {
    const written = (await this.account(userId))?.prestige ?? 0;
    if (!(written >= 1)) throw new Error('prestige request in flight');
    const stars = written;
    await this.followUps(userId, stars, GLORY_POINTS.prestige, now);
    return { status: 'already-passed', prestige: stars, score: 0, level: 1, gloryGained: 0, trophyKey: trophyKey(prestigeTrophy(stars)) };
  }
}
