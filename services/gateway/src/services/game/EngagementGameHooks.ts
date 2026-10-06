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
import { tailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { levelFromScore } from '@meeshy/shared/utils/game/levels';
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

const log = enhancedLogger.child({ module: 'EngagementGameHooks' });

/** Les signaux d'axe qu'au moins un gabarit attend : les autres n'ouvrent aucune lecture. */
const MISSION_AXIS_SIGNALS: ReadonlySet<string> = new Set(
  MISSION_TEMPLATES.map((template) => template.signal).filter((signal) => signal.startsWith('axis:')),
);

export { quarterPoints };

/** Le Vent arrière : ×1,25 tant que le niveau est sous le niveau record. Entier. */
export function applyTailwind(points: number, account: { readonly engagementScore: number; readonly levelRecord: number | null }): number {
  const factor = tailwindFactor({ level: levelFromScore(account.engagementScore), levelRecord: account.levelRecord ?? 0 });
  return factor > 1 ? Math.round(points * factor) : points;
}

export class EngagementGameHooks {
  readonly glory: GloryService;

  readonly missions: MissionService;

  readonly abuse: GameAbuseGuard;

  readonly weekPoints: GameWeekPointsRecorder;

  readonly seasons: SeasonService;

  readonly duo: DuoService;

  readonly trophies: TrophyService;

  private readonly signals: MessageGameSignals;

  constructor(
    prisma: PrismaClient,
    creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>,
  ) {
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
   * monte d'autant — le total que les ligues classent. Un débit ne passe jamais
   * ici.
   */
  async onPointsGained(userId: string, points: number): Promise<void> {
    await this.isolated('week points', () => this.weekPoints.record(userId, points));
  }

  /** Un succès vient d'être obtenu : sa Gloire, figée à sa rareté du moment (#9390). */
  async onAchievement(userId: string, milestoneKey: string): Promise<void> {
    await this.isolated('achievement glory', () => this.glory.creditAchievement(userId, milestoneKey).then(() => undefined));
  }

  /** Le score vient de changer : la Gloire du premier passage de chaque niveau. */
  async onScore(userId: string, score: number, levelRecord: number | null): Promise<void> {
    if (levelFromScore(score) <= (levelRecord ?? 1)) return;
    await this.isolated('level glory', () => this.glory.creditLevelProgress({ userId, score, previousRecord: levelRecord }).then(() => undefined));
  }

  /** La série vient d'être écrite : la Gloire des records de Flamme franchis. */
  async onStreak(userId: string, plan: StreakPlan): Promise<void> {
    if (plan.longest <= plan.previousLongest) return;
    await this.isolated('flame record glory', () =>
      this.glory.creditFlameRecords({ userId, previousLongest: plan.previousLongest, longest: plan.longest }).then(() => undefined),
    );
    await this.isolated('flame trophies', () => this.trophies.awardFlameTrophies({ userId, previousLongest: plan.previousLongest, longest: plan.longest }));
  }

  /** Un message committé : les signaux de mission et les +3 points de la réponse reçue. */
  recordMessage(input: MessageSignalInput): Promise<void> {
    return this.signals.record(input);
  }

  private async isolated(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      log.warn(`game hook failed: ${label}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
