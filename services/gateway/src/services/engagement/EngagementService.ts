/**
 * Producteur UNIQUE des compteurs d'engagement (#5530).
 *
 * `recordActivity` est le seul point d'écriture d'`EngagementCounter` — aucune
 * route ni handler socket ne doit incrémenter ce modèle directement (§ 3 du
 * document). Chacune des issues d'axe (sous-issues de #3695) appelle cette
 * méthode une fois son ACK métier posé (message persisté, post publié…),
 * jamais avant confirmation.
 *
 * @see docs/product/streaks-badges-modele.md § 3, § 4
 */

import type { MissionFactSignal } from '@meeshy/shared/utils/game/missions';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BADGE_THRESHOLDS,
  LEVEL_THRESHOLDS,
  CONTENT_ENGAGEMENT_AXES,
  CONVERSATION_ENGAGEMENT_AXES,
  badgeMilestoneKey,
  engagementAxisFamily,
  isEngagementAxisKey,
  levelMilestoneKey,
  type EngagementAxisFamily,
  type EngagementAxisKey,
  type EngagementAchievementKey,
} from '@meeshy/shared/types/engagement';
import {
  basePointsForOperation,
  elanUnderScale,
  linkVisitPoints,
  pointsForOperation,
  type EngagementScale,
  type EngagementScaleElan,
} from '@meeshy/shared/types/engagement-scale';
import {
  ENGAGEMENT_OPERATION_CATALOG,
  type EngagementOperationKey,
} from '@meeshy/shared/types/engagement-operations';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { engagementAchievementTitle } from '@meeshy/shared/utils/engagement-labels';
import { tierReachedNotification } from '@meeshy/shared/utils/tier-reached-notification';
import { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { ONE_DAY_MS, civilDayInTimezone, civilDayKey } from './civilDay';
import { ConversationEngagementRecorder, dayCountsFor, isDailyCapReached } from './ConversationEngagementRecorder';
import { PostPointsRecorder } from './PostPointsRecorder';
import { EngagementReceipts, receiptBucket } from './EngagementReceipts';
import { engagementScaleServiceFor, type EngagementScaleSource } from './EngagementScaleService';
import { getEngagementEmitIO } from './engagement-emit-registry';
import { memberSignature } from './memberSignature';
import { EngagementQuotas, dayBucket } from './EngagementQuotas';
import { EngagementGameHooks, applyTailwind, quarterPoints } from '../game/EngagementGameHooks';
import { SPARKS_USER_SELECT, levelSparksOf, sparksOf } from '../game/SparksFacts';
import type { MessageSignalInput } from '../game/MessageGameSignals';
import { levelForUnlocks } from '@meeshy/shared/utils/game/levels';
import { withRetry } from '../MessageMediaConsumptionService';
import { creditEngagementCounter, raiseEngagementCounterCount } from './EngagementCounterWrites';
import { engraveBadgesSilently, historyCountFor } from './engagementAxisHistory';
import { writeEngagementScore, type ScoreWritten } from './EngagementScoreWrite';
import { announceGameState } from '../game/GameStateBroadcast';
import { gameRevisionColumn, gameRevisionValue, nextGameRevision } from '../game/GameRevision';

import type { EngagementActivityOptions, EngagementLinkVisit } from './engagementActivityTypes';
import { EngagementStreaks } from './EngagementStreaks';
import { ENGAGEMENT_ROUTE } from './engagementRoute';
import type { ActStreakView, EngagementStreakPostType } from '@meeshy/shared/types/engagement-act-streaks';

const log = enhancedLogger.child({ module: 'EngagementService' });

/**
 * Durée de validité du cache d'entrées d'élan (#5749).
 *
 * L'élan demande deux lectures — les familles actives sur la fenêtre glissante,
 * et l'assise permanente. `recordActivity` s'exécute sur CHAQUE message : les
 * payer à chaque geste ajouterait deux allers-retours à la voie chaude, ce que
 * la dimension 2 interdit (« une lenteur est un BUG »).
 *
 * Une minute de péremption est sans conséquence : la fenêtre glissante est de
 * sept JOURS et l'assise ne bouge qu'au franchissement d'un palier. Le pire cas
 * est un compte qui vient de débloquer son dixième succès et crédite au facteur
 * précédent pendant moins d'une minute — l'élan est un bonus, jamais une
 * propriété de correction.
 */
const ELAN_CACHE_TTL_MS = 60 * 1000;

/** Au-delà, le cache est purgé de ses entrées périmées — borne la mémoire d'un processus long. */
const ELAN_CACHE_MAX_ENTRIES = 10_000;

/**
 * Les entrées de l'élan, BRUTES : les seuils de badge et non leur décompte, pour
 * que le seuil « badge élevé » du barème s'applique à la lecture — un barème
 * réglé entre deux gestes ne sert pas un décompte calculé sous l'ancien.
 * `engagementScore` fixe le NIVEAU, donc le plafond de facteur (`levelCaps`) ;
 * `timezone` fixe le jour civil de l'état par conversation.
 */
type ElanInputs = {
  readonly recentFamilies: readonly EngagementAxisFamily[];
  readonly achievementCount: number;
  readonly badgeThresholds: readonly number[];
  /** Les étincelles en POCHE, la base du niveau (#10892, `levelSparksOf`) — la frappe le fait baisser. */
  readonly engagementScore: number;
  /** Le plus haut niveau du cycle (#9377) ; `null` pour un compte antérieur au jeu. */
  readonly levelRecord: number | null;
  /** Le niveau max à vie (#10846), qui survit au prestige ; `null` avant son premier relevé. */
  readonly levelMaxLifetime: number | null;
  readonly timezone: string | null;
  /** Un e-mail ou un téléphone vérifié — ce qui ouvre les gros poids en entier. */
  readonly verified: boolean;
  /** Le crédité est un COMPTE — la clé de participant d'un invité de lien n'en est pas un (#9569). */
  readonly isAccount: boolean;
  readonly expiresAt: number;
};

/** Prisma signale une violation d'index unique par le code `P2002`. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export { ENGAGEMENT_ROUTE };

/** Ce qu'un crédit dit aux séries : le jour civil du compte, et ce qui range le geste sous un acte. */
type CreditDay = {
  readonly today: Date;
  readonly timezone: string | null;
  /** Un e-mail ou un téléphone vérifié, lu avec le jour — ce qui ouvre un palier de gros poids en entier (#10422). */
  readonly verified: boolean;
  readonly postType?: EngagementStreakPostType;
  readonly conversationId?: string;
};

export type { EngagementActivityOptions, EngagementLinkVisit } from './engagementActivityTypes';

/** Ce que le service reçoit en plus du client Prisma — des doubles en test, les instances partagées sinon. */
export type EngagementServiceDeps = {
  readonly scale?: EngagementScaleSource;
  readonly emitIO?: () => ServerEmitIO | undefined;
  readonly game?: EngagementGameHooks;
};

export class EngagementService {
  /** Cache par compte des ENTRÉES de l'élan — voir `ELAN_CACHE_TTL_MS`. */
  private readonly elanCache = new Map<string, ElanInputs>();

  private readonly scale: EngagementScaleSource;

  private readonly conversationRecorder: ConversationEngagementRecorder;

  private readonly postRecorder: PostPointsRecorder;

  private readonly receipts: EngagementReceipts;

  private readonly quotas: EngagementQuotas;

  /** Le jeu (#9374…#9377) : Vent arrière, frein de l'entre-soi, missions, Gloire. */
  private readonly game: EngagementGameHooks;

  /** Les séries — globale, par acte — et la fidélité (#10389, #10390). */
  private readonly streaks: EngagementStreaks;

  constructor(
    private readonly prisma: PrismaClient,
    deps: EngagementServiceDeps = {},
  ) {
    this.scale = deps.scale ?? engagementScaleServiceFor(prisma);
    this.conversationRecorder = new ConversationEngagementRecorder(prisma, deps.emitIO ?? getEngagementEmitIO);
    this.postRecorder = new PostPointsRecorder(prisma, deps.emitIO ?? getEngagementEmitIO);
    this.quotas = new EngagementQuotas(prisma);
    this.receipts = new EngagementReceipts(prisma, this.quotas, this.postRecorder, {
      onPointsTakenBack: (userId, points, creditedAt) => this.game.onPointsTakenBack(userId, points, creditedAt),
    });
    this.game = deps.game ?? new EngagementGameHooks(prisma, (userId, points, axisKey) => this.creditGamePoints(userId, points, axisKey));
    this.streaks = new EngagementStreaks(prisma, this.quotas, this.game, (userId, points) => this.updateEngagementScore(userId, points));
  }

  /** Les séries d'acte du compte (#10389) — ce que `GET /me/engagement` sert. */
  actStreaks(userId: string): Promise<readonly ActStreakView[]> {
    return this.streaks.list(userId);
  }

  /**
   * Les entrées de l'élan pour `userId` : les familles actives sur la fenêtre
   * glissante de `windowDays` (réglée par le barème), l'assise permanente, et
   * le score et le fuseau du compte. Trois lectures indexées, mises en cache
   * une minute (`ELAN_CACHE_TTL_MS`) par (compte, fenêtre) : le score servant
   * au plafond de niveau peut donc retarder d'une minute sur un palier franchi.
   *
   * `EngagementCounter.updatedAt` suffit à dire qu'une famille est active :
   * la SEULE écriture sur ce modèle est l'incrément d'activité, donc la date
   * de modification EST la date du dernier geste sur cet axe. Aucun stockage
   * neuf n'est nécessaire.
   */
  private async loadElanInputs(userId: string, windowDays: number): Promise<ElanInputs> {
    const maintenant = Date.now();
    const cleCache = `${userId}:${windowDays}`;
    const enCache = this.elanCache.get(cleCache);
    if (enCache && enCache.expiresAt > maintenant) return enCache;

    const depuis = new Date(maintenant - windowDays * ONE_DAY_MS);
    const [compteursRecents, paliers, compte] = await Promise.all([
      this.prisma.engagementCounter.findMany({
        where: { userId, updatedAt: { gte: depuis } },
        select: { axisKey: true },
      }),
      this.prisma.engagementMilestone.findMany({
        where: { userId, milestoneType: { in: ['achievement', 'badge'] } },
        select: { milestoneType: true, milestoneKey: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { ...SPARKS_USER_SELECT, timezone: true, emailVerifiedAt: true, phoneVerifiedAt: true },
      }),
    ]);

    const familles = new Set<EngagementAxisFamily>();
    for (const ligne of compteursRecents) {
      // Un axe présent en base mais absent du catalogue (rétrogradation de
      // version) est ignoré plutôt que de faire lever `engagementAxisFamily`.
      try {
        familles.add(engagementAxisFamily(ligne.axisKey as EngagementAxisKey));
      } catch {
        continue;
      }
    }

    const achievementCount = paliers.filter((palier) => palier.milestoneType === 'achievement').length;
    // Clé de badge : `<axisKey>:<seuil>` — le seuil est le dernier segment.
    const badgeThresholds = paliers
      .filter((palier) => palier.milestoneType === 'badge')
      .map((palier) => Number.parseInt(palier.milestoneKey.split(':').at(-1) ?? '', 10))
      .filter((seuil) => Number.isFinite(seuil));

    const entree: ElanInputs = {
      recentFamilies: [...familles],
      achievementCount,
      badgeThresholds,
      engagementScore: levelSparksOf(sparksOf(compte)),
      levelRecord: typeof compte?.levelRecord === 'number' ? compte.levelRecord : null,
      levelMaxLifetime: typeof compte?.levelMaxLifetime === 'number' ? compte.levelMaxLifetime : null,
      timezone: typeof compte?.timezone === 'string' ? compte.timezone : null,
      verified: Boolean(compte?.emailVerifiedAt ?? compte?.phoneVerifiedAt),
      isAccount: Boolean(compte),
      expiresAt: maintenant + ELAN_CACHE_TTL_MS,
    };

    if (this.elanCache.size >= ELAN_CACHE_MAX_ENTRIES) {
      for (const [cle, valeur] of this.elanCache) {
        if (valeur.expiresAt <= maintenant) this.elanCache.delete(cle);
      }
    }
    this.elanCache.set(cleCache, entree);
    return entree;
  }

  /**
   * L'élan qui s'applique à CE geste sur CET axe.
   *
   * La famille de l'axe courant est ajoutée aux familles récentes : un
   * utilisateur qui n'écrivait que du contenu et poste son premier commentaire
   * EST, à cet instant, actif dans deux familles. La lui refuser jusqu'au
   * geste suivant ferait mentir la règle « plusieurs sprints en même temps »
   * au moment précis où elle devient vraie.
   */
  private elanFor(scale: EngagementScale, inputs: ElanInputs, family: EngagementAxisFamily | null): EngagementScaleElan {
    const rules = scale.multiplier;
    const familles = new Set([...inputs.recentFamilies, ...(family ? [family] : [])]);
    return elanUnderScale(rules, {
      activeFamilyCount: familles.size,
      achievementCount: inputs.achievementCount,
      highBadgeCount: inputs.badgeThresholds.filter((seuil) => seuil >= rules.highBadgeThreshold).length,
      engagementScore: inputs.engagementScore,
    });
  }

  /**
   * Incrémente le compteur de `axisKey` pour `userId` et notifie chaque
   * palier `BADGE_THRESHOLDS` franchi par CET incrément précis (jamais un
   * recalcul complet) — un compteur qui passe de N à N+1 ne peut rendre
   * neuf qu'un palier dans `]N, N+1]`.
   *
   * Rend `true` quand le geste a été CRÉDITÉ, `false` quand une garde l'a refusé (son propre contenu, plafond
   * du jour, garde d'abus, reçu déjà pris, quota) : les signaux de jeu d'un message (#9635) ne partent que sur
   * un `true`, pour ne jamais faire avancer un défi que le crédit a refusé.
   */
  async recordActivity(
    userId: string,
    operationKey: EngagementOperationKey,
    options: EngagementActivityOptions = {},
  ): Promise<boolean> {
    // Interagir avec ce qu'on a soi-même produit ne rapporte rien.
    if (options.targetOwnerId && options.targetOwnerId === userId) return false;

    // UN SEUL élan pour ce geste, résolu avant toute écriture et partagé par le
    // compteur et le score : deux résolutions indépendantes pourraient tomber
    // de part et d'autre de la péremption du cache et créditer deux montants
    // différents pour un même geste au compteur et à la poche, de façon
    // indétectable.
    //
    // Les points viennent du BARÈME (#8906) : ceux de l'opération (ou de sa
    // variante), multipliés par l'élan si l'opération l'est, l'élan lui-même
    // borné par le plafond du niveau du compte.
    const scale = await this.scale.current();
    const inputs = await this.loadElanInputs(userId, scale.multiplier.windowDays);
    const operation = ENGAGEMENT_OPERATION_CATALOG[operationKey];
    const rule = scale.operations[operationKey];
    const factor = this.elanFor(scale, inputs, operation.family).factor;
    const heavy = basePointsForOperation(scale, operationKey, options.variant) >= scale.abuse.heavyPoints;
    const earned = pointsForOperation(scale, operationKey, factor, options.variant);
    // Un compte sans contact vérifié ne publie pas au prix fort (#8959).
    const capped = heavy && !inputs.verified ? Math.min(earned, scale.abuse.unverifiedMaxPoints) : earned;
    // Le Vent arrière (#10896) : +25 % tant que le niveau, lu sur la poche, est 7 niveaux ou plus sous le record du cycle —
    // le MÊME montant au compteur et à la poche, l'invariant tient.
    const boosted = applyTailwind(capped, inputs);

    // Le plafond journalier par conversation se lit AVANT toute écriture :
    // atteint, le geste ne crédite RIEN — ni compteur, ni score, ni série.
    const conversationId = options.conversationId;
    const today = civilDayInTimezone(new Date(), inputs.timezone);
    const conversationRow = conversationId ? await this.conversationRecorder.load(userId, conversationId) : null;
    if (
      conversationId &&
      operation.capScope === 'conversation-day' &&
      isDailyCapReached(conversationRow, today, operationKey, rule.cap)
    ) {
      return false;
    }
    // Les garde-fous de l'entre-soi (#9377), AVANT de consommer un seau de quota :
    // rien pour un message à soi, à un compte neuf ou bloqué ; ÷4 au-delà de 50
    // messages par jour entre deux comptes seuls.
    const dailyCounts = dayCountsFor(conversationRow, today);
    const verdict = await this.game.messageVerdict({
      userId,
      conversationId,
      operationKey,
      dailyMessages: (dailyCounts['content.text_message'] ?? 0) + (dailyCounts['content.audio_message'] ?? 0),
    });
    if (verdict === 'none') return false;
    const points = verdict === 'quarter' ? quarterPoints(boosted) : boosted;
    const receipt = options.receipt === undefined ? undefined : receiptBucket(options.receipt, options.postId);
    if (receipt !== undefined && !(await this.receipts.claim(userId, operationKey, receipt))) return false;
    const admitted = await this.quotas.admit({
      userId,
      operationKey,
      rule,
      today,
      heavy,
      ...(options.targetId !== undefined ? { targetId: options.targetId } : {}),
    });
    if (!admitted) return false;

    await this.credit(scale, userId, operationKey, points, {
      today,
      timezone: inputs.timezone,
      verified: inputs.verified,
      ...(options.postType !== undefined ? { postType: options.postType } : {}),
      ...(conversationId !== undefined ? { conversationId } : {}),
    }, options.actorId);
    const rememberedTargetId = heavy ? options.targetId : undefined;
    if (rememberedTargetId !== undefined) {
      await this.quotas.remember(userId, operationKey, rememberedTargetId, points);
    }
    if (options.postId !== undefined && inputs.isAccount) {
      await this.postRecorder.record({ userId, postId: options.postId, operationKey, points, rememberedTargetId });
    }
    if (receipt !== undefined) await this.receipts.keep(userId, operationKey, receipt, rememberedTargetId === undefined ? points : 0);

    if (conversationId) {
      await this.conversationRecorder.record({
        userId,
        conversationId,
        axisKey: operationKey,
        points,
        today,
        previous: conversationRow,
      });
    }

    await this.game.onCredited({
      userId,
      operationKey,
      dayKey: civilDayKey(today),
      timezone: inputs.timezone,
      record: Math.max(levelForUnlocks({ score: inputs.engagementScore, levelRecord: Math.max(inputs.levelRecord ?? 0, inputs.levelMaxLifetime ?? 0) || null }), inputs.levelRecord ?? 0),
    });
    return true;
  }

  /**
   * Les points du JEU (missions, coffre, réponse reçue) : ils montent le score
   * et les points d'un axe — débitables comme ceux de cet axe — sans compter une
   * action de plus ni passer par l'élan, le Vent arrière ou les plafonds : ils
   * sont DÉJÀ le résultat d'un geste admis. Même règle que `credit` : le
   * compteur et la poche reçoivent le même montant.
   *
   * **Atomique et rejouable.** Le compteur et le score s'écrivent dans UNE
   * transaction : l'appelant (une mission, un coffre) rend sa réclamation quand
   * ce crédit échoue, et le prochain geste le rejoue — deux écritures séparées
   * auraient laissé le compteur crédité une fois par essai. Un conflit
   * d'écriture (P2034) se rejoue en bloc, depuis la lecture. Le score se lit
   * puis s'écrit en valeur DANS la transaction : un champ absent se lit zéro
   * (#6428), et un écrivain concurrent fait annuler la tentative au lieu d'être
   * écrasé. Les paliers et la Gloire qui suivent ne font jamais échouer un
   * crédit déjà écrit — ce qui ferait rendre, puis repayer, la mission.
   *
   * Le compteur passe par `creditEngagementCounter` (#10541) : la commande
   * s'exécute dans la session de la transaction — annulée et rejouée avec elle,
   * mesuré — et crédite une colonne `points` absente ou `null` comme un zéro, là
   * où `{ increment }` la laissait à `null` pendant que le score montait.
   */
  async creditGamePoints(userId: string, points: number, axisKey: EngagementAxisKey): Promise<void> {
    if (!Number.isInteger(points) || points <= 0) return;
    const written = await withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const account = await tx.user.findUnique({ where: { id: userId }, select: { ...SPARKS_USER_SELECT, prestige: true, gameRevision: true } });
        if (!account) return null;
        await creditEngagementCounter(tx, { userId, axisKey, points, count: 0 });
        // Poche, cycle et total à vie montent du même montant (#10846) ; un compte d'avant le rattrapage les voit
        // posés sur sa poche (`sparksOf`). Écrits EN VALEUR : un champ absent + incrément rendrait null (leçon #6428).
        const before = sparksOf(account);
        const cycle = before.cycle + points;
        // La DETTE se déduit d'abord du gain (porteur, 2026-10-16) ; cycle et total à vie montent du gain entier.
        const repaid = Math.min(before.debt, points);
        const pocket = before.pocket + points - repaid;
        await tx.user.update({
          where: { id: userId },
          data: {
            // La révision de l'état du jeu (#10912), gravée avec la poche, lue dans la même transaction.
            gameRevision: gameRevisionColumn(nextGameRevision(gameRevisionValue(account.gameRevision), Date.now())),
            engagementScore: pocket,
            sparksSincePrestige: BigInt(cycle),
            sparksEarnedLifetime: BigInt(before.lifetime + points),
            ...(before.debt > 0 ? { sparksDebt: BigInt(before.debt - repaid) } : {}),
          },
        });
        return { pocket, levelRecord: account.levelRecord ?? null, levelMaxLifetime: account.levelMaxLifetime ?? null, prestige: account.prestige ?? 0 };
      }),
    );
    if (written === null) return;
    await this.afterScore(userId, points, written).catch((error: unknown) =>
      log.warn('game points credited, level follow-up failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  /** Un message committé (#9375, #9377) : signaux de mission et réponse reçue. */
  recordMessageSignals(input: MessageSignalInput): Promise<void> {
    return this.game.recordMessage(input);
  }

  /** Une conversation créée vide vient d'être démarrée par ce message (#9635) — sous la garde d'abus d'un message. */
  recordConversationStarted(input: { readonly senderUserId: string; readonly conversationId: string }): Promise<void> {
    return this.game.recordConversationStarted(input);
  }

  /** Un fait que la passerelle pose au point unique de son geste (#9635) : la mission et le duo qui l'attendent. */
  recordGameSignal(userId: string, signal: MissionFactSignal, options: { readonly key?: string } = {}): Promise<void> {
    return this.game.onSignal(userId, signal, options);
  }

  /**
   * Écrit un crédit DÉJÀ admis : compteur de l'opération, puis poche, cycle et
   * total à vie, puis les SUITES — badges et succès si l'opération est un axe de
   * « Progression », série, paliers de niveau, Gloire, ligue.
   *
   * Le compteur et le score reçoivent le MÊME montant par le même idiome
   * (`$ifNull`) : `creditEngagementCounter` ici, `writeEngagementScore` plus
   * bas. Tant que le compteur s'écrivait par `{ increment }`, une ligne à
   * `points: null` laissait le score monter seul (#10541).
   *
   * **Le crédit d'abord, les suites ensuite (#10895).** La poche s'écrivait en
   * DERNIER, après les badges et la série : une panne au milieu laissait le
   * compteur crédité et la poche intacte — un crédit perdu à moitié. Les deux
   * écritures sont désormais adjacentes, et les suites, idempotentes (gardées
   * par la contrainte unique des jalons), ne retiennent jamais un crédit déjà
   * écrit : leur échec se journalise, comme dans `creditGamePoints`.
   *
   * L'invariant de la poche (#10892) n'est PAS `engagementScore == Σ(points)` : la frappe débite la poche et jamais
   * un compteur (#10846). Ce qui tient est `sparksEarnedLifetime − engagementScore + sparksDebt == Σ(prix des frappes au registre) + Σ(poches vidées au Prestige)`.
   */
  private async credit(
    scale: EngagementScale,
    userId: string,
    operationKey: EngagementOperationKey,
    points: number,
    day: CreditDay,
    actorId?: string,
  ): Promise<void> {
    const counter = await creditEngagementCounter(this.prisma, { userId, axisKey: operationKey, points, count: 1 });
    const written = await writeEngagementScore(this.prisma, userId, points);

    await this.followCredit(scale, userId, operationKey, counter.count, day, actorId).catch((error: unknown) =>
      log.warn('engagement credited, badge or streak follow-up failed', {
        userId,
        operationKey,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    if (written !== null) await this.afterScoreSilently(userId, points, written);
  }

  /** Les suites d'un crédit déjà écrit : badges, succès, série. Chacune est rejouable sans double effet. */
  private async followCredit(
    scale: EngagementScale,
    userId: string,
    operationKey: EngagementOperationKey,
    newCount: number,
    day: CreditDay,
    actorId?: string,
  ): Promise<void> {
    const previousCount = newCount - 1;
    if (isEngagementAxisKey(operationKey)) {
      const crossedThresholds = BADGE_THRESHOLDS.filter(
        (threshold) => threshold > previousCount && threshold <= newCount,
      );
      // Un badge d'axe dit le TOTAL RÉEL et ne se notifie jamais deux fois (#10845). Au PREMIER crédit d'un axe, ou quand ce
      // geste franchirait un palier, l'historique est lu : s'il dépasse le compteur (né à 0 le 2026-09-07, sans
      // rattrapage), le compteur est relevé et les paliers passés sont gravés EN SILENCE — rien n'est annoncé.
      const history =
        previousCount === 0 || crossedThresholds.length > 0 ? await this.discoverHistory(userId, operationKey, newCount) : null;
      if (history === null) {
        for (const threshold of crossedThresholds) {
          await this.tryAwardBadge(userId, operationKey, threshold, actorId);
        }
      }
      await this.tryAwardAchievements(userId, operationKey, previousCount);
    }
    await this.streaks.afterCredit({
      scale,
      userId,
      operationKey,
      today: civilDayKey(day.today),
      timezone: day.timezone,
      verified: day.verified,
      ...(day.postType !== undefined ? { postType: day.postType } : {}),
      ...(day.conversationId !== undefined ? { conversationId: day.conversationId } : {}),
    });
  }

  /**
   * Le total RÉEL de l'axe dépasse-t-il le compteur ? Alors le compteur est relevé à l'historique et les paliers qu'il
   * couvre sont gravés en silence (#10845). Rend le total découvert, ou `null` : rien à rattraper, l'annonce est normale.
   *
   * Un échec de lecture ou d'écriture ne retient JAMAIS le crédit déjà écrit : il retombe sur l'annonce d'hier. Si la
   * relève est devancée par un autre écrivain (`false`), le palier n'est pas annoncé non plus — le rattrapage le grave.
   */
  private async discoverHistory(userId: string, axisKey: EngagementAxisKey, newCount: number): Promise<number | null> {
    try {
      const history = await historyCountFor(this.prisma, userId, axisKey);
      if (history === null || history <= newCount) return null;
      await raiseEngagementCounterCount(this.prisma, { userId, axisKey, from: newCount, to: history });
      await engraveBadgesSilently(this.prisma, userId, axisKey, history);
      return history;
    } catch (error) {
      log.warn('axis history unavailable, badge announced from the counter', {
        userId,
        axisKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Une visite sur un lien de `creatorId` (#8959) — la règle progressive :
   * la n-ième visite UNIQUE vaut `linkVisitPoints(n)`, jamais multipliée.
   * Une visite compte une fois par visiteur, par lien et par `dedupHours`
   * (fenêtre glissante), jamais celle du créateur, et au plus
   * `dailyCapPerCreator` visites créditées par jour.
   */
  async recordLinkVisit(visit: EngagementLinkVisit): Promise<number> {
    const { creatorId, linkKey, visitorKey } = visit;
    if (visit.visitorUserId && visit.visitorUserId === creatorId) return 0;
    const operationKey: EngagementOperationKey = 'social.link_visit';
    const scale = await this.scale.current();
    const rules = scale.linkVisits;
    const now = new Date();
    const unique = await this.quotas.claimOncePer(
      creatorId,
      operationKey,
      `visit:${linkKey}:${visitorKey}`,
      rules.dedupHours * 3_600_000,
      now,
    );
    if (!unique) return 0;
    const inputs = await this.loadElanInputs(creatorId, scale.multiplier.windowDays);
    const today = civilDayInTimezone(now, inputs.timezone);
    if (
      rules.dailyCapPerCreator !== null &&
      !(await this.quotas.claim(creatorId, operationKey, dayBucket(today), rules.dailyCapPerCreator))
    ) {
      return 0;
    }
    const visitNumber = await this.quotas.increment(creatorId, operationKey, `link:${linkKey}`);
    const points = linkVisitPoints(rules, visitNumber);
    await this.credit(scale, creatorId, operationKey, points, { today, timezone: inputs.timezone, verified: inputs.verified });
    return points;
  }

  /** Un contenu lourd SUPPRIMÉ (#8959) : ses points de publication sont repris. */
  reclaimContent(userId: string, operationKey: EngagementOperationKey, targetId: string): Promise<number> {
    return this.receipts.reclaimPublication(userId, operationKey, targetId);
  }

  /** Un CONTENU retiré (#9584) : chaque crédit qu'il a produit est repris, une fois (`EngagementReceipts`). */
  reclaimSource(userId: string, source: string): Promise<number> {
    return this.receipts.reclaim(userId, source);
  }

  /**
   * Incrémente un axe « conversation distincte » (`conversation.private`,
   * `conversation.public`, `conversation.community`) au PREMIER message
   * envoyé dans CETTE conversation par CET utilisateur — jamais aux
   * suivants (docs/product/streaks-badges-modele.md § 2).
   *
   * La déduplication est portée par la contrainte unique
   * `EngagementConversationCredit(userId, axisKey, conversationId)`, jamais
   * par une relecture avant écriture — même garde anti-course que
   * `tryAwardBadge`. Un conflit signifie « cette conversation a déjà
   * crédité cet axe » : no-op silencieux, `recordActivity` n'est pas
   * appelée une seconde fois.
   */
  async recordConversationActivity(
    userId: string,
    axisKey: EngagementAxisKey,
    conversationId: string,
    options: { readonly signature?: string } = {},
  ): Promise<void> {
    try {
      await this.prisma.engagementConversationCredit.create({
        data: { userId, axisKey, conversationId },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    if (options.signature !== undefined && !(await this.claimSignature(userId, axisKey, options.signature, conversationId))) {
      return;
    }

    await this.recordActivity(userId, axisKey, { conversationId });
  }

  /**
   * Créer un groupe (#8906) : un point, une fois par ENSEMBLE de membres —
   * un second groupe avec les mêmes personnes ne rapporte rien, un groupe
   * avec une personne de plus rapporte.
   */
  async recordGroupCreation(userId: string, conversationId: string, memberIds: readonly string[]): Promise<void> {
    const axisKey: EngagementAxisKey = 'conversation.group_created';
    const signature = memberSignature([userId, ...memberIds]);
    if (!(await this.claimSignature(userId, axisKey, signature, conversationId))) return;
    await this.recordActivity(userId, axisKey, { conversationId });
  }

  /**
   * Réserve l'ensemble de personnes pour cet axe. `false` quand il a déjà
   * crédité — la contrainte unique tranche, jamais une relecture.
   */
  private async claimSignature(
    userId: string,
    axisKey: EngagementAxisKey,
    signature: string,
    conversationId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.engagementSignatureCredit.create({
        data: { userId, axisKey, signature, conversationId },
      });
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  /**
   * Garde anti-rejeu portée par la BASE (contrainte unique
   * `EngagementMilestone`), jamais par une relecture avant écriture — ça
   * évite la course entre deux écritures concurrentes du même utilisateur
   * (§ 4). Un conflit signifie « palier déjà servi » : no-op silencieux.
   */
  private async tryAwardBadge(
    userId: string,
    axisKey: EngagementAxisKey,
    threshold: number,
    actorId?: string,
  ): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'badge',
          milestoneKey: badgeMilestoneKey(axisKey, threshold),
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const actor = await this.loadBadgeActor(actorId);
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      // Le MOT, jamais la clé : « Badge débloqué : conversation.private ·
      // palier 10 » a été servi en production (2026-09-08) parce que la clé
      // stable tenait lieu de titre. Le libellé se résout à la langue du
      // LECTEUR (`engagementAxisLabel`, même catalogue que la v3.1 web et le
      // miroir iOS) ; `route` dit au client où le tap MÈNE — l'écran
      // « Progression » (#5547 web, #5698 iOS), jamais un autre.
      // #10298 — le PALIER (rang dans l'échelle) en titre, l'EXPLOIT chiffré
      // et le palier en corps : « Commentaires écrits : 1 000 — bravo, vous
      // êtes au palier 6 ! ». Le seuil seul (« palier 1000 ») se lisait comme
      // un millième palier.
      const banner = tierReachedNotification(lang, { kind: 'badge', axisKey, threshold });
      if (banner === null) return;
      await notificationService.createNotification({
        userId,
        type: 'badge_earned',
        priority: 'normal',
        title: banner.title,
        content: banner.body,
        context: {},
        ...(actor ? { actor } : {}),
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, axisKey, threshold, tierRank: banner.rank, value: banner.value },
      });
    } catch (err) {
      log.warn('badge_earned notification failed after milestone was recorded', {
        userId,
        axisKey,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * La personne dont le geste a fait franchir le palier — pour
   * `social.invite_joined`, l'invité qui vient de s'inscrire (#8724). La ligne
   * de notification la NOMME et propose de lui écrire. Introuvable ⇒ le
   * badge part sans acteur, comme avant.
   */
  private async loadBadgeActor(actorId: string | undefined) {
    if (!actorId) return null;
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, username: true, displayName: true, avatar: true },
    });
    return actor ?? null;
  }

  /**
   * Succès composés (§ 8, #5546) — cinq conditions ponctuelles évaluées
   * après l'incrément du compteur d'axe. Toutes ne peuvent devenir vraies
   * qu'au moment où UN axe passe de 0 à 1 : un axe déjà non nul ne change
   * pas l'ensemble des axes atteints, donc ne peut compléter aucune
   * condition — `previousCount !== 0` élimine tout appel qui ne peut rien
   * déclencher, sans lecture supplémentaire.
   */
  private async tryAwardAchievements(
    userId: string,
    axisKey: EngagementAxisKey,
    previousCount: number,
  ): Promise<void> {
    if (previousCount !== 0) return;

    if (CONTENT_ENGAGEMENT_AXES.includes(axisKey)) {
      await this.tryAwardAchievement(userId, 'achievement.first_content');
      if (await this.hasAllAxes(userId, CONTENT_ENGAGEMENT_AXES)) {
        await this.tryAwardAchievement(userId, 'achievement.all_content_types');
      }
    }

    if (axisKey === 'content.audio_message' || axisKey === 'comment.audio') {
      await this.tryAwardAchievement(userId, 'achievement.first_voice');
    }

    if (axisKey === 'tool.in_app_edit') {
      await this.tryAwardAchievement(userId, 'achievement.editor');
    }

    if (CONVERSATION_ENGAGEMENT_AXES.includes(axisKey)) {
      if (await this.hasAllAxes(userId, CONVERSATION_ENGAGEMENT_AXES)) {
        await this.tryAwardAchievement(userId, 'achievement.three_conversation_kinds');
      }
    }
  }

  /** `true` si CHACUN des `axes` a déjà un `EngagementCounter.count` strictement positif pour `userId`. */
  private async hasAllAxes(userId: string, axes: readonly EngagementAxisKey[]): Promise<boolean> {
    const rows = await this.prisma.engagementCounter.findMany({
      where: { userId, axisKey: { in: [...axes] }, count: { gt: 0 } },
      select: { axisKey: true },
    });
    return rows.length >= axes.length;
  }

  /**
   * Même garde anti-rejeu que `tryAwardBadge` (§ 4), portée par la contrainte
   * unique `EngagementMilestone`. `achievementKey` porte déjà son préfixe
   * `achievement.` (§ 8) : contrairement à `badge`/`streak`/`level`, il EST
   * la `milestoneKey`, sans transformation.
   */
  private async tryAwardAchievement(
    userId: string,
    achievementKey: EngagementAchievementKey,
  ): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'achievement',
          milestoneKey: achievementKey,
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }
    await this.game.onAchievement(userId, achievementKey);

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createNotification({
        userId,
        type: 'achievement_unlocked',
        priority: 'normal',
        content: notificationString(lang, 'engagement.achievementUnlocked', {
          title: engagementAchievementTitle(lang, achievementKey),
        }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, achievementKey },
      });
    } catch (err) {
      log.warn('achievement_unlocked notification failed after milestone was recorded', {
        userId,
        achievementKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Crédite la poche (`writeEngagementScore`), puis ses paliers et sa Gloire, sans retenir le crédit. */
  private async updateEngagementScore(userId: string, points: number): Promise<void> {
    const written = await writeEngagementScore(this.prisma, userId, points);
    if (written !== null) await this.afterScoreSilently(userId, points, written);
  }

  /** Les paliers et la Gloire d'un score déjà écrit : leur échec ne retient jamais le crédit. */
  private async afterScoreSilently(userId: string, points: number, written: ScoreWritten): Promise<void> {
    await this.afterScore(userId, points, written).catch((error: unknown) =>
      log.warn('engagement credited, level follow-up failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    // Les autres appareils voient le gain sans attendre, coalescé (#10900).
    announceGameState(userId, 'credit');
  }

  /** Les paliers que `points` vient de franchir, et la Gloire du premier passage. */
  private async afterScore(userId: string, points: number, written: ScoreWritten): Promise<void> {
    const { pocket: newPocket, levelRecord, levelMaxLifetime, prestige } = written;
    // Le niveau se lit sur la POCHE (#10892). Un palier re-franchi après une frappe n'est pas renotifié : les paliers
    // `level:` gravés ne s'éteignent plus, et `tryAwardLevelUp` est gardé par la contrainte unique du jalon.
    const previousPocket = newPocket - points;
    const crossedThresholds = LEVEL_THRESHOLDS.filter(
      (threshold) => threshold > previousPocket && threshold <= newPocket,
    );

    for (const threshold of crossedThresholds) {
      await this.tryAwardLevelUp(userId, threshold);
    }
    // La Gloire du premier passage de chaque niveau (#9374) : le record rendu
    // par la MÊME commande que le score — aucune lecture de plus sur la voie chaude.
    await this.game.onScore(userId, newPocket, levelRecord, levelMaxLifetime, prestige);
    // Les points de la SEMAINE (#9384) : le total que les ligues classent.
    await this.game.onPointsGained(userId, points);
  }

  /**
   * Le palier de SCORE se grave (la liste des paliers servis le montre), sans jamais pousser : « Niveau N atteint » dit
   * le niveau du JEU et ne part que quand le record du cycle monte (`GloryService.creditLevelProgress`, #10901). Même
   * garde anti-rejeu que `tryAwardBadge`/`tryAwardStreakMilestone` (§ 4), portée par la contrainte unique.
   */
  private async tryAwardLevelUp(userId: string, threshold: number): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'level',
          milestoneKey: levelMilestoneKey(threshold),
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }
  }
}
