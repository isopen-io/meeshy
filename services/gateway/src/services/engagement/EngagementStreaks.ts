/**
 * LES SÉRIES ET LA FIDÉLITÉ — ce qu'un crédit admis fait aux jours actifs du
 * compte, et les bonus qu'ils paient. Extrait d'`EngagementService` (budget de
 * taille, #10389).
 *
 * Trois horloges, une seule loi de paiement :
 * - la série GLOBALE (`User.currentStreakDays`, la Flamme) avance à chaque
 *   premier crédit d'un jour civil ; ses paliers sont `scale.streaks.global`,
 *   seau `streak:<jours>` ;
 * - la série d'un ACTE (`EngagementActStreak`, #10389) avance au premier crédit
 *   du jour de CET acte ; ses paliers sont `scale.streaks.acts[acte]`, seau
 *   `streak:<acte>:<jours>` ;
 * - la FIDÉLITÉ (#10390) se regarde au premier crédit du jour : chaque palier
 *   que l'ancienneté atteint se paie, seau `loyalty:<jours>`.
 *
 * Un bonus se paie UNE fois par seau, jamais multiplié, au compteur
 * `streak.bonus` et au score. Les séries d'acte et la fidélité sont un bonus :
 * une panne n'y fait jamais échouer le crédit qui les a déclenchées.
 *
 * Un palier qui atteint `abuse.heavyPoints` vaut au plus `abuse.unverifiedMaxPoints`
 * pour un compte sans e-mail ni téléphone vérifié (#10422) — la borne des gros
 * actes, portée aux trois horloges par `bonusPointsForAccount`. Le seau se
 * consomme au montant payé : vérifier son contact plus tard ne rattrape rien.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { STREAK_THRESHOLDS, streakMilestoneKey } from '@meeshy/shared/types/engagement';
import { bonusPointsForAccount, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import {
  crossedStreakTiers,
  streakActOf,
  type ActStreakView,
  type EngagementStreakPostType,
} from '@meeshy/shared/types/engagement-act-streaks';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { EngagementGameHooks } from '../game/EngagementGameHooks';
import { writeStreak } from '../game/FlameService';
import { stampGameRevisionAfterWrite } from '../game/GameRevision';
import { ActStreakRecorder } from './ActStreakRecorder';
import { dueLoyaltyTiers, loyaltyBucket } from './LoyaltyBonus';
import { creditEngagementCounter } from './EngagementCounterWrites';
import type { EngagementQuotas } from './EngagementQuotas';
import { ENGAGEMENT_ROUTE } from './engagementRoute';

const log = enhancedLogger.child({ module: 'EngagementStreaks' });

const STREAK_BONUS: EngagementOperationKey = 'streak.bonus';

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Ce qu'un crédit admis dit aux séries. */
export type StreakCredit = {
  readonly scale: EngagementScale;
  readonly userId: string;
  readonly operationKey: EngagementOperationKey;
  /** Le jour civil du compte (`YYYY-MM-DD`). */
  readonly today: string;
  readonly timezone: string | null;
  /** Un e-mail ou un téléphone vérifié — ce qui ouvre un palier de gros poids en entier (#10422). */
  readonly verified: boolean;
  readonly postType?: EngagementStreakPostType;
  readonly conversationId?: string;
};

/** Ce que le paiement d'un palier doit savoir du compte qu'il paie. */
type BonusAccount = Pick<StreakCredit, 'scale' | 'userId' | 'verified'>;

export class EngagementStreaks {
  private readonly acts: ActStreakRecorder;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly quotas: Pick<EngagementQuotas, 'claim'>,
    private readonly game: Pick<EngagementGameHooks, 'onStreak'>,
    /** Ajoute des points au score — `EngagementService.updateEngagementScore`. */
    private readonly addScore: (userId: string, points: number) => Promise<void>,
  ) {
    this.acts = new ActStreakRecorder(prisma);
  }

  /** Les séries que ce crédit fait avancer, et les bonus qu'elles paient. */
  async afterCredit(credit: StreakCredit): Promise<void> {
    const firstOfDay = await this.updateGlobal(credit);
    await this.bestEffort('act streak', credit.userId, () => this.advanceAct(credit));
    if (firstOfDay) await this.bestEffort('loyalty', credit.userId, () => this.payLoyalty(credit));
  }

  /** Les séries d'acte du compte, pour `GET /me/engagement`. */
  list(userId: string): Promise<readonly ActStreakView[]> {
    return this.acts.list(userId);
  }

  /**
   * Une activité qualifiante — n'importe quel crédit, sur n'importe quel axe
   * (§ 5) — fait avancer la série de jours actifs. Comparaison par JOUR CIVIL
   * DANS LE FUSEAU DE L'UTILISATEUR (`User.timezone`, repli UTC si absent —
   * #5734) : plusieurs activités le même jour civil ne l'incrémentent qu'une
   * fois ; un jour sauté la remet à 1.
   *
   * Lecture puis écriture CONDITIONNELLE (`writeStreak`, #9376) : la série
   * s'écrit seulement si la Flamme vaut encore ce qu'on a lu. Un gel acheté,
   * offert par le coffre ou une Flamme rallumée entre les deux fait reprendre
   * le calcul au lieu d'être écrasé — une Meesh dépensée n'est jamais perdue.
   *
   * `currentStreakDays`/`longestStreakDays` portent un `@default(0)` dans le
   * schéma, qui ne s'applique qu'à la CRÉATION — un `User` créé avant cette
   * migration a ces champs ABSENTS, pas à zéro (même piège que
   * `Conversation.firstMessageSentAt`, cf. `packages/shared/CLAUDE.md`).
   *
   * Rend `true` quand la série vient d'être écrite — le premier crédit du jour.
   */
  private async updateGlobal(credit: BonusAccount): Promise<boolean> {
    const { scale, userId } = credit;
    // La transition est la LOI de la Flamme (`advanceFlame`, #9376) : un jour
    // manqué consomme un gel quand les gels les couvrent TOUS, sinon la Flamme
    // s'éteint — la série perdue est gardée pour le rallumage de 48 h.
    const written = await writeStreak(this.prisma, userId, new Date());
    if (written === null) return false;
    // La Flamme est servie dans le bloc : son écriture conditionnelle fait monter la révision de l'état du jeu (#10912).
    await stampGameRevisionAfterWrite(this.prisma, userId);
    const { plan, previousStreak } = written;

    const crossedThresholds = STREAK_THRESHOLDS.filter(
      (threshold) => threshold > previousStreak && threshold <= plan.streak,
    );
    for (const threshold of crossedThresholds) {
      await this.tryAwardStreakMilestone(userId, threshold);
    }
    const global = scale.streaks?.global ?? scale.streakBonuses;
    for (const tier of crossedStreakTiers(global, previousStreak, plan.streak)) {
      await this.payBonus(credit, `streak:${tier.days}`, tier.points);
    }
    await this.game.onStreak(userId, plan);
    return true;
  }

  /** La série de l'acte de ce crédit, s'il en a un, et les paliers qu'elle franchit. */
  private async advanceAct(credit: StreakCredit): Promise<void> {
    const act = streakActOf({
      operationKey: credit.operationKey,
      ...(credit.postType !== undefined ? { postType: credit.postType } : {}),
      ...(credit.conversationId !== undefined ? { conversationId: credit.conversationId } : {}),
    });
    if (act === null) return;
    const advance = await this.acts.advance(credit.userId, act, credit.today);
    if (advance === null) return;
    const tiers = credit.scale.streaks?.acts[act] ?? [];
    for (const tier of crossedStreakTiers(tiers, advance.previousDays, advance.currentDays)) {
      await this.payBonus(credit, `streak:${act}:${tier.days}`, tier.points);
    }
  }

  /** Chaque palier de fidélité que l'ancienneté atteint, payé une fois. */
  private async payLoyalty(credit: StreakCredit): Promise<void> {
    const tiers = await dueLoyaltyTiers({
      prisma: this.prisma,
      userId: credit.userId,
      tiers: credit.scale.loyalty ?? [],
      today: credit.today,
      timezone: credit.timezone,
    });
    for (const tier of tiers) {
      await this.payBonus(credit, loyaltyBucket(tier.days), tier.points);
    }
  }

  /**
   * La CONSTANCE paie (#8959) : un bonus de palier, une fois par seau, jamais
   * multiplié, au compteur `streak.bonus` et au score — au montant que le
   * compte peut toucher (#10422), le seau consommé sur ce montant.
   */
  private async payBonus(account: BonusAccount, bucket: string, tierPoints: number): Promise<void> {
    const { userId } = account;
    const points = bonusPointsForAccount({ points: tierPoints, verified: account.verified, abuse: account.scale.abuse });
    if (points <= 0) return;
    if (!(await this.quotas.claim(userId, STREAK_BONUS, bucket, 1))) return;
    await creditEngagementCounter(this.prisma, { userId, axisKey: STREAK_BONUS, points, count: 1 });
    await this.addScore(userId, points);
  }

  private async bestEffort(what: string, userId: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      log.warn(`${what} failed after the credit was written`, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Même garde anti-rejeu que `tryAwardBadge` (§ 4), portée par la contrainte
   * unique `EngagementMilestone(userId, milestoneType, milestoneKey)`.
   */
  private async tryAwardStreakMilestone(userId: string, threshold: number): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: { userId, milestoneType: 'streak', milestoneKey: streakMilestoneKey(threshold) },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createNotification({
        userId,
        type: 'streak_milestone',
        priority: 'normal',
        content: notificationString(lang, 'engagement.streakMilestone', { count: threshold }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, threshold },
      });
    } catch (err) {
      log.warn('streak_milestone notification failed after milestone was recorded', {
        userId,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
