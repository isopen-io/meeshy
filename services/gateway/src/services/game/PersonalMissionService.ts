/**
 * LA MISSION PERSONNELLE DU JOUR (#9539) — producteur UNIQUE de la ligne `DailyMission` d'emplacement 3 et de
 * son annonce. La LOI (le tirage, la plage, l'état) vit dans `@meeshy/shared/utils/game/personal-mission` ; ce
 * service l'applique contre la base, à côté de `MissionService` qu'il ne modifie pas.
 *
 *  - **un tirage par compte et par jour** — au premier accès du jour (la lecture de `GET /me/engagement`) ou à
 *    l'avance par le job ; `(userId, dayKey, slot)` est unique, deux accès concurrents n'en font qu'une ;
 *  - **la plage se lit dans le fuseau du compte** (`instantOfLocal`) et se stocke en INSTANTS (`startsAt`,
 *    `endsAt`) : le serveur juge sur des instants, jamais sur une heure murale ;
 *  - **fail-closed** — tirée trop tard pour qu'une plage tienne, la mission n'existe pas ce jour-là ; et tant
 *    que la journée de jeu n'est pas le jour civil du compte, rien ne se tire (la plage sortirait de sa journée) ;
 *  - **l'annonce part UNE fois** — la réclamation (`notifiedAt`) est posée AVANT l'envoi, par une écriture
 *    conditionnelle ; un envoi qui ÉCHOUE rend la réclamation (le passage suivant réessaie), un envoi
 *    ÉCARTÉ (réglage « Jeu » coupé, jeu masqué, plafond) ne se rejoue pas.
 */

import type { DailyMission, PrismaClient } from '@meeshy/shared/prisma/client';
import { flameStatus } from '@meeshy/shared/utils/game/flame';
import { levelForUnlocks } from '@meeshy/shared/utils/game/levels';
import { isMissionStillPossible, type MissionDifficulty, type MissionSignal } from '@meeshy/shared/utils/game/missions';
import { PERSONAL_MISSION_SLOT, drawPersonalMission, personalWindowStillFits } from '@meeshy/shared/utils/game/personal-mission';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { FLAME_USER_SELECT, flameFactsOf } from './FlameService';
import type { GameNotificationEvent, GameNotifyResult } from './GameNotifier';
import { MISSION_PROFILE_USER_SELECT, activeHoursOf, isMultilingual, missionProfileOf, usageOf } from './MissionHabits';
import { replaceImpossibleMissionRows, type MissionDay, type MissionService } from './MissionService';
import { dayKeyOf, instantOfLocal, minuteOfDayInTimezone } from './gameClock';

const log = enhancedLogger.child({ module: 'PersonalMissionService' });

const USER_SELECT = {
  ...FLAME_USER_SELECT,
  ...MISSION_PROFILE_USER_SELECT,
  engagementScore: true,
  levelRecord: true,
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
} as const;

/** Une plage annoncée au plus 90 minutes après son ouverture : au-delà, l'annonce n'a plus de sens. */
const ANNOUNCE_GRACE_MS = 90 * 60 * 1000;
export const MISSION_NOTIFY_BATCH = 100;

const NOT_NOTIFIED = { OR: [{ notifiedAt: null }, { notifiedAt: { isSet: false } }] };

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export type PersonalMissionDeps = {
  readonly missions: Pick<MissionService, 'ensureToday'>;
  readonly notifier?: { notify(event: GameNotificationEvent, now?: Date): Promise<GameNotifyResult> };
};

export type NotifyDueResult = { readonly sent: number; readonly examined: number };

export class PersonalMissionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: PersonalMissionDeps,
  ) {}

  private personalRow(userId: string, dayKey: string): Promise<DailyMission | null> {
    return this.prisma.dailyMission.findFirst({ where: { userId, dayKey, slot: PERSONAL_MISSION_SLOT } });
  }

  /**
   * La mission personnelle de la journée de jeu — tirée si elle manque, remplacée si elle a été tirée sur un
   * gabarit RETIRÉ et n'est pas achevée (#9634 : même difficulté, plage et annonce intactes). `null` : missions
   * pas encore ouvertes (niveau 5), compte inconnu, ou plus de plage qui tienne aujourd'hui. `day` : la journée
   * que l'appelant vient de lire (évite de la relire).
   */
  async ensure(userId: string, now: Date = new Date(), day?: MissionDay): Promise<DailyMission | null> {
    const today = day ?? (await this.deps.missions.ensureToday(userId, now));
    if (!today.unlocked) return null;
    const existing = await this.personalRow(userId, today.dayKey);
    if (existing && (existing.completedAt !== null || isMissionStillPossible({ ...existing, difficulty: existing.difficulty as MissionDifficulty }))) return existing;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) return existing;
    const level = levelForUnlocks({ score: user.engagementScore ?? 0, levelRecord: user.levelRecord ?? null });
    const facts = flameFactsOf(user, now);
    const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: today.dayKey, streak: facts.streak, freezes: facts.freezes });
    const flameDays = status === 'out' ? 0 : facts.streak;
    if (existing) {
      const rows = await replaceImpossibleMissionRows(this.prisma, { userId, dayKey: today.dayKey, level, flameDays, rows: [...today.rows, existing] });
      return rows[rows.length - 1] ?? existing;
    }
    // La plage se pose sur le jour CIVIL et la mission n'avance que dans SA journée de jeu : quand les deux
    // diffèrent (une journée ouverte tard continue après minuit), la plage tomberait hors de sa journée —
    // annoncée, jamais réalisable. Et sans plage qui tienne encore, aucune habitude n'est lue.
    const civilDay = dayKeyOf(now, user.timezone);
    const nowMinute = minuteOfDayInTimezone(now, user.timezone);
    if (civilDay !== today.dayKey || !personalWindowStillFits(nowMinute)) return null;

    const [activeHours, usage, profile] = await Promise.all([
      activeHoursOf({ prisma: this.prisma, userId, timezone: user.timezone, now }),
      usageOf(this.prisma, userId),
      missionProfileOf({ prisma: this.prisma, userId, user, now }),
    ]);
    const draw = drawPersonalMission({
      userId,
      dayKey: today.dayKey,
      level,
      flameDays,
      nowMinute,
      activeHours,
      usage,
      multilingual: isMultilingual(user),
      excludedSignals: today.rows.map((row) => row.signal as MissionSignal),
      profile,
    });
    if (draw === null) return null;

    try {
      return await this.prisma.dailyMission.create({
        data: {
          userId,
          dayKey: today.dayKey,
          slot: PERSONAL_MISSION_SLOT,
          templateKey: draw.mission.templateKey,
          difficulty: draw.mission.difficulty,
          signal: draw.mission.signal,
          prism: draw.mission.prism,
          target: draw.mission.target,
          progress: 0,
          reward: draw.mission.reward,
          glory: 0,
          seen: [],
          startsAt: instantOfLocal({ dayKey: civilDay, minuteOfDay: draw.startMinute, timezone: user.timezone }),
          endsAt: instantOfLocal({ dayKey: civilDay, minuteOfDay: draw.endMinute, timezone: user.timezone }),
          // Posés À NULL, jamais omis : un champ omis est ABSENT en base.
          completedAt: null,
          paidPoints: null,
          rerolledAt: null,
          notifiedAt: null,
        },
      });
    } catch (err) {
      // Un accès concurrent a tiré le même emplacement : sa ligne fait foi.
      if (!isP2002(err)) throw err;
      return this.personalRow(userId, today.dayKey);
    }
  }

  /**
   * Annonce les plages qui viennent de s'ouvrir (au plus 90 minutes plus tôt, pas encore terminées, pas encore
   * annoncées). La réclamation précède l'envoi : deux passages — deux processus — n'envoient qu'une fois.
   */
  async notifyDue(params: { readonly now?: Date; readonly limit?: number } = {}): Promise<NotifyDueResult> {
    const now = params.now ?? new Date();
    const notifier = this.deps.notifier;
    if (!notifier) return { sent: 0, examined: 0 };
    const due = await this.prisma.dailyMission.findMany({
      where: {
        slot: PERSONAL_MISSION_SLOT,
        startsAt: { lte: now, gte: new Date(now.getTime() - ANNOUNCE_GRACE_MS) },
        endsAt: { gt: now },
        ...NOT_NOTIFIED,
      },
      orderBy: { startsAt: 'asc' },
      take: Math.min(params.limit ?? MISSION_NOTIFY_BATCH, MISSION_NOTIFY_BATCH),
    });

    let sent = 0;
    for (const row of due) {
      if (row.startsAt === null || row.endsAt === null) continue;
      const claimed = await this.prisma.dailyMission.updateMany({ where: { id: row.id, ...NOT_NOTIFIED }, data: { notifiedAt: now } });
      if (claimed.count === 0) continue;
      if (row.completedAt !== null) continue;

      const result = await notifier
        .notify(
          { kind: 'mission-window', recipientId: row.userId, missionId: row.id, dayKey: row.dayKey, templateKey: row.templateKey, startsAt: row.startsAt, endsAt: row.endsAt },
          now,
        )
        .catch((): GameNotifyResult => 'failed');
      if (result === 'sent') sent += 1;
      if (result === 'failed') {
        log.warn('mission window announcement failed, claim handed back', { missionId: row.id });
        await this.prisma.dailyMission.updateMany({ where: { id: row.id, notifiedAt: now }, data: { notifiedAt: null } });
      }
    }
    return { sent, examined: due.length };
  }
}
