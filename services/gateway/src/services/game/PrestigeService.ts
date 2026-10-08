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
 * ## Ce que le Prestige ferme (conformité G-5, DÉCISION PORTEUR ATTENDUE)
 *
 * La loi remet le niveau RECORD à 1. Les ligues (niveau 10) et le duo (niveau
 * 20) lisent ce record : un Prestige les FERME en silence jusqu'à ce que le
 * compte les rouvre. Son consentement à la ligue publique n'est pas retiré (la
 * colonne reste), il se retrouve en `locked` puis `open` sans nouveau geste. Soit
 * le record devient « tous cycles », soit l'écran annonce la perte d'accès avant
 * la confirmation : tant que ce n'est pas tranché, la loi est appliquée telle
 * qu'écrite et la confirmation côté client doit le dire.
 *
 * Le score remis à zéro l'est AUSSI sur les points des compteurs par axe (#9675) :
 * le score est leur somme, et la frappe les débite. Les laisser intacts laissait
 * une frappe dépenser des points que le Prestige avait déjà pris, et faisait
 * passer le score sous zéro. Les ACTIONS comptées (badges) ne bougent pas.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PrestigeResponse } from '@meeshy/shared/types/game';
import { prestigeTransition } from '@meeshy/shared/utils/game/prestige';
import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { prestigeTrophy, trophyKey } from '@meeshy/shared/utils/game/trophies';
import { EngagementQuotas } from '../engagement/EngagementQuotas';
import { GameRefusal } from './GameRefusal';
import { GloryService } from './GloryService';
import { TrophyService } from './TrophyService';

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
    return this.prisma.user.findUnique({ where: { id: userId }, select: { engagementScore: true, prestige: true } });
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
      const verdict = prestigeTransition({ score: account?.engagementScore ?? 0, prestige: stars });
      if (verdict.allowed === false) {
        throw new GameRefusal(verdict.reason === 'at-maximum' ? 'PRESTIGE_AT_MAXIMUM' : 'PRESTIGE_LEVEL_TOO_LOW');
      }

      if (!(await this.quotas.claim(userId, REQUEST_OPERATION, bucket, 1))) return this.replayed(userId, now);
      // Le score et les points DÉPENSABLES des compteurs bougent ensemble (#9675) : le score est la somme
      // des points des compteurs, et la frappe débite ces compteurs. Les remettre à 0 dans la même
      // transaction empêche qu'une frappe dépense après coup des points que le Prestige a déjà pris.
      // Les actions comptées (`count`, qui tiennent les badges) ne bougent pas.
      const written = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.updateMany({
          where: { id: userId, engagementScore: account?.engagementScore ?? 0, ...(stars === 0 ? NO_PRESTIGE : { prestige: stars }) },
          data: { prestige: verdict.prestigeAfter, engagementScore: verdict.scoreAfter, levelRecord: verdict.levelRecordAfter },
        });
        if (user.count > 0) await tx.engagementCounter.updateMany({ where: { userId }, data: { points: 0 } });
        return user;
      });
      if (written.count === 0) {
        // Un crédit ou un autre passage s'est glissé : on rend la demande et on relit.
        await this.prisma.engagementQuota.deleteMany({ where: { userId, operationKey: REQUEST_OPERATION, bucket } });
        continue;
      }
      const gloryGained = await this.followUps(userId, verdict.prestigeAfter, verdict.gloryGained, now);
      return { status: 'passed', prestige: verdict.prestigeAfter, score: 0, level: 1, gloryGained, trophyKey: verdict.trophyKey };
    }
    throw new Error('prestige contended');
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
