/**
 * Ce que le JEU demande aux gestes d'engagement (#9374…#9377) — le seul point
 * de contact entre `EngagementService` et le jeu, pour que le service (déjà
 * long) ne porte que des appels d'une ligne.
 *
 * **Chaque crochet est isolé.** Le jeu est un bonus : une mission, une Gloire ou
 * une garde qui échoue est journalisée et ne retient JAMAIS le crédit du geste
 * qui l'a déclenché (le compteur et le score restent la vérité). Les gardes
 * d'abus échouent « ouvert » : une panne ne coûte pas de points.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { NO_LEVEL_CAP, levelForUnlocks, levelFromScore } from '@meeshy/shared/utils/game/levels';
import { sparksTailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { DUO_TEMPLATES } from '@meeshy/shared/utils/game/duo';
import { LEVEL_STEPS } from '@meeshy/shared/utils/game/level-steps';
import { MISSION_TEMPLATES } from '@meeshy/shared/utils/game/missions';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { GameAbuseGuard, quarterPoints, type MessageVerdict } from './GameAbuseGuard';
import { DuoService } from './DuoService';
import { GloryService } from './GloryService';
import { GameNotifier } from './GameNotifier';
import { SeasonService } from './SeasonService';
import { TrophyService } from './TrophyService';
import { MessageGameSignals, type MessageSignalInput } from './MessageGameSignals';
import { MissionService, type SignalOptions } from './MissionService';
import { GameWeekPointsRecorder } from './GameWeekPoints';
import type { StreakPlan } from './FlameService';
import { getPhotoMomentMarks, type PhotoMomentMarks } from './PhotoMomentMarks';
import { isGamePhotoPushOn } from './photoPushFlag';

const log = enhancedLogger.child({ module: 'EngagementGameHooks' });

/**
 * Les signaux d'axe qu'au moins un gabarit attend — mission du jour OU duo de la semaine : les autres n'ouvrent
 * aucune lecture. Le duo est compté à part entière : retirer une mission du jour (#9634) ne doit jamais couper
 * l'axe d'un duo en cours.
 */
const MISSION_AXIS_SIGNALS: ReadonlySet<string> = new Set(
  [...MISSION_TEMPLATES, ...DUO_TEMPLATES].map((template) => template.signal).filter((signal) => signal.startsWith('axis:')),
);

export { quarterPoints };

/**
 * Le Vent arrière (#10896) : ×1,25 tant que le niveau — lu sur la POCHE, étapes faites comprises — est 7 niveaux ou plus
 * sous le record du cycle. Entier. Le record du cycle repart à 1 au Prestige : un Prestige ne l'allume pas.
 */
export function applyTailwind(
  points: number,
  account: { readonly engagementScore: number; readonly levelRecord: number | null; readonly levelMaxLifetime: number | null },
): number {
  const proof = Math.max(account.levelRecord ?? 0, account.levelMaxLifetime ?? 0);
  const level = levelForUnlocks({ score: account.engagementScore, levelRecord: proof === 0 ? null : proof });
  const factor = sparksTailwindFactor({ level, levelRecord: account.levelRecord ?? 0 });
  return factor > 1 ? Math.round(points * factor) : points;
}

/** Les records de Flamme que jugent les étapes des niveaux (#9706) : 7 et 30 jours. */
const FLAME_STEP_DAYS: readonly number[] = LEVEL_STEPS.flatMap((rule) => (rule.kind === 'flame' ? [rule.target] : []));

export class EngagementGameHooks {
  readonly glory: GloryService;

  readonly missions: MissionService;

  readonly abuse: GameAbuseGuard;

  readonly weekPoints: GameWeekPointsRecorder;

  readonly seasons: SeasonService;

  readonly duo: DuoService;

  readonly trophies: TrophyService;

  private readonly signals: MessageGameSignals;

  private readonly photo: { readonly marks: () => PhotoMomentMarks; readonly on: () => boolean };

  constructor(
    prisma: PrismaClient,
    creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>,
    /** Les comptes « à évaluer » des étapes franchies app fermée (#10175) ; remplaçables en test. */
    deps: { readonly photoMarks?: PhotoMomentMarks; readonly photoPushOn?: () => boolean } = {},
  ) {
    this.photo = { marks: () => deps.photoMarks ?? getPhotoMomentMarks(), on: deps.photoPushOn ?? (() => isGamePhotoPushOn()) };
    this.glory = new GloryService(prisma);
    this.trophies = new TrophyService(prisma);
    this.missions = new MissionService(prisma, {
      creditPoints,
      glory: this.glory,
      onMissionCompleted: (event) => this.seasons.addStars(event.userId, event.difficulty, event.now),
    });
    // Une notification de jeu par jour au plus (#9490) : UN notifieur pour la saison et le duo.
    const notifier = new GameNotifier(prisma);
    this.seasons = new SeasonService(prisma, { creditPoints, grantFreeze: (userId) => this.missions.grantFreeze(userId), glory: this.glory, trophies: this.trophies, notifier });
    this.duo = new DuoService(prisma, { creditPoints, seasons: this.seasons, notifier });
    this.abuse = new GameAbuseGuard(prisma);
    this.weekPoints = new GameWeekPointsRecorder(prisma);
    // Un fait de jeu avance la mission du jour ET le duo de la semaine, chacun isolé.
    this.signals = new MessageGameSignals(prisma, { missions: { onSignal: (userId, signal, options) => this.onSignal(userId, signal, options) }, creditPoints });
  }

  /** Un signal observé : la mission qui l'attend, puis le duo — l'échec de l'un ne retient pas l'autre. */
  async onSignal(userId: string, signal: string, options: SignalOptions = {}): Promise<void> {
    await this.isolated('mission progress', () => this.missions.onSignal(userId, signal, options));
    await this.isolated('duo progress', () => this.duo.onSignal(userId, signal, { now: options.now, key: options.key, amount: options.amount }));
  }

  /** Ce que vaut un message : entier, divisé par 4, ou rien. */
  messageVerdict(params: {
    readonly userId: string;
    readonly conversationId: string | undefined;
    readonly operationKey: string;
    readonly dailyMessages: number;
  }): Promise<MessageVerdict> {
    if (params.conversationId === undefined) return Promise.resolve('full');
    return this.abuse.assessMessage({ ...params, conversationId: params.conversationId });
  }

  /** Un geste vient d'être CRÉDITÉ sur un axe : les missions qui l'attendent avancent. */
  async onCredited(params: {
    readonly userId: string;
    readonly operationKey: string;
    readonly dayKey: string;
    readonly timezone: string | null;
    readonly record: number;
  }): Promise<void> {
    const signal = `axis:${params.operationKey}`;
    if (!MISSION_AXIS_SIGNALS.has(signal)) return;
    await this.onSignal(params.userId, signal, { dayKey: params.dayKey, timezone: params.timezone, record: params.record });
  }

  /**
   * Des points viennent d'être GAGNÉS (#9384, #9385) : la semaine du compte
   * monte d'autant — le total que les ligues classent. Un débit (la frappe) ne
   * passe jamais ici ; une reprise passe par `onPointsTakenBack`.
   */
  async onPointsGained(userId: string, points: number): Promise<void> {
    await this.isolated('week points', () => this.weekPoints.record(userId, points));
    await this.markPhotoMoment(userId);
  }

  /**
   * Un gain vient d'être REPRIS (un contenu retiré, #9584) : la ligue rend ce qu'il y avait mis, sur la semaine de son
   * crédit (#10895). Sans cela, publier puis supprimer gardait les points classés — la poche revenait, pas la ligue.
   */
  async onPointsTakenBack(userId: string, points: number, creditedAt?: Date): Promise<void> {
    await this.isolated('week points take-back', () => this.weekPoints.takeBack(userId, points, creditedAt).then(() => undefined));
  }

  /** Un succès vient d'être obtenu : sa Gloire, figée à sa rareté du moment (#9390). */
  async onAchievement(userId: string, milestoneKey: string): Promise<void> {
    await this.isolated('achievement glory', () => this.glory.creditAchievement(userId, milestoneKey).then(() => undefined));
    await this.markPhotoMoment(userId);
  }

  /**
   * Le CYCLE d'étincelles vient de changer (#10846) : la Gloire du premier passage de chaque niveau. Le tri se fait sans
   * plafond de rang ni étapes (#9688, #9706) : la lecture brute majore la lecture servie, donc un score
   * qui ne la porte pas au-dessus du record n'a rien ouvert — `creditLevelProgress` applique ensuite le
   * plafond du rang et le palier des étapes.
   */
  async onScore(userId: string, score: number, levelRecord: number | null, levelMaxLifetime: number | null = null, prestige?: number | null): Promise<void> {
    await this.markPhotoMoment(userId);
    // `score` est la POCHE (#10892). Rien à graver tant que le niveau lu ne dépasse ni le record du cycle ni le niveau max
    // à vie : remonter après une frappe ne rapporte pas une seconde fois la Gloire d'un niveau déjà passé.
    const level = levelFromScore(score, NO_LEVEL_CAP);
    if (level <= (levelRecord ?? 1) && level <= (levelMaxLifetime ?? 0)) return;
    await this.isolated('level glory', () =>
      this.glory.creditLevelProgress({ userId, score, previousRecord: levelRecord, previousMax: levelMaxLifetime, ...(prestige === undefined ? {} : { prestige }) }).then(() => undefined),
    );
  }

  /**
   * La série vient d'être écrite : la Gloire des records de Flamme franchis — et, quand le record passe
   * 7 ou 30 jours, l'étape des niveaux 40 ou 90 (#9706) : le niveau qui l'attendait monte d'un coup.
   */
  async onStreak(userId: string, plan: StreakPlan): Promise<void> {
    await this.markPhotoMoment(userId);
    if (plan.longest <= plan.previousLongest) return;
    await this.isolated('flame record glory', () =>
      this.glory.creditFlameRecords({ userId, previousLongest: plan.previousLongest, longest: plan.longest }).then(() => undefined),
    );
    await this.isolated('flame trophies', () => this.trophies.awardFlameTrophies({ userId, previousLongest: plan.previousLongest, longest: plan.longest }));
    if (FLAME_STEP_DAYS.some((days) => plan.previousLongest < days && plan.longest >= days)) {
      await this.isolated('level step (flame record)', () => this.glory.openLevels(userId).then(() => undefined));
    }
  }

  /** Un message committé : les signaux de mission et les +3 points de la réponse reçue. */
  recordMessage(input: MessageSignalInput): Promise<void> {
    return this.signals.record(input);
  }

  /** Une conversation créée vide vient d'être démarrée (#9635) : sous la garde d'un message. */
  recordConversationStarted(input: { readonly senderUserId: string; readonly conversationId: string }): Promise<void> {
    return this.signals.recordConversationStarted(input);
  }

  /**
   * Une écriture du jeu a pu faire franchir une étape app fermée : le compte est « à évaluer » par le job des
   * étapes (#10175). Seulement l'interrupteur allumé ; une marque qui tombe ne retient jamais le geste.
   */
  private async markPhotoMoment(userId: string): Promise<void> {
    if (!this.photo.on()) return;
    await this.isolated('photo moment mark', () => this.photo.marks().mark(userId));
  }

  private async isolated(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      log.warn(`game hook failed: ${label}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
