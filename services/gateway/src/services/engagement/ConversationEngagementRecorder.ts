/**
 * « N (M) 🔥 » — ce qu'une conversation a rapporté à UN utilisateur (#8906).
 *
 * Seul écrivain de `ConversationEngagement`, appelé par `EngagementService`
 * quand un geste crédité porte une conversation. Deux rôles :
 *
 * - le PLAFOND journalier par conversation (la règle `cap` d'une opération de portée `conversation-day`) — lu sur
 *   `dayCounts` AVANT tout crédit : plafond atteint ⇒ le geste ne crédite rien ;
 * - l'ÉTAT après crédit — total, points du jour, série de jours — puis son
 *   émission `engagement:conversation-updated` vers la seule room personnelle
 *   du crédité.
 *
 * Lecture puis écriture, pas une transaction — même fenêtre de course acceptée
 * que `EngagementService.updateStreak` : deux gestes du même utilisateur dans la
 * même conversation au même instant peuvent perdre un incrément d'état ou
 * dépasser le plafond d'une unité. Le compteur d'axe et le score, eux, restent
 * atomiques ; cet état est un affichage de réengagement.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import {
  conversationEngagementForDay,
  type ConversationEngagementSnapshot,
} from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ONE_DAY_MS, civilDayKey, startOfUtcDay } from './civilDay';

const log = enhancedLogger.child({ module: 'ConversationEngagementRecorder' });

/** Ce que la ligne porte, tel que Prisma le relit. */
export type ConversationEngagementRow = {
  readonly totalPoints: number | null;
  readonly dayPoints: number | null;
  readonly day: Date | null;
  readonly dayCounts: unknown;
  readonly streakDays: number | null;
  readonly longestStreakDays: number | null;
};

export type ConversationEngagementState = {
  readonly totalPoints: number;
  readonly dayPoints: number;
  readonly day: Date;
  readonly dayCounts: Readonly<Record<string, number>>;
  readonly streakDays: number;
  readonly longestStreakDays: number;
};

export const CONVERSATION_ENGAGEMENT_SELECT = {
  totalPoints: true,
  dayPoints: true,
  day: true,
  dayCounts: true,
  streakDays: true,
  longestStreakDays: true,
} as const;

function sameDay(a: Date | null, b: Date): boolean {
  return a !== null && startOfUtcDay(a).getTime() === b.getTime();
}

/** Les actions créditées LE JOUR `today` — vide dès que la ligne date d'un autre jour. */
export function dayCountsFor(row: ConversationEngagementRow | null, today: Date): Record<string, number> {
  if (!row || !sameDay(row.day, today)) return {};
  const raw = row.dayCounts;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  );
}

/** `true` si CET axe a déjà crédité `cap` actions dans cette conversation aujourd'hui. */
export function isDailyCapReached(
  row: ConversationEngagementRow | null,
  today: Date,
  axisKey: EngagementOperationKey,
  cap: number | null,
): boolean {
  if (cap === null) return false;
  return (dayCountsFor(row, today)[axisKey] ?? 0) >= cap;
}

/**
 * L'état après UN geste crédité de `points` sur `axisKey`, le jour `today` :
 * même jour ⇒ cumul ; jour suivant ⇒ série + 1 ; après un trou ⇒ série à 1.
 */
export function nextConversationEngagement(
  row: ConversationEngagementRow | null,
  gesture: { readonly today: Date; readonly axisKey: EngagementOperationKey; readonly points: number },
): ConversationEngagementState {
  const { today, axisKey, points } = gesture;
  const lastDay = row?.day ? startOfUtcDay(row.day) : null;
  const isSameDay = lastDay !== null && lastDay.getTime() === today.getTime();
  const isNextDay = lastDay !== null && today.getTime() - lastDay.getTime() === ONE_DAY_MS;
  const previousStreak = row?.streakDays ?? 0;
  const streakDays = isSameDay ? Math.max(1, previousStreak) : isNextDay ? previousStreak + 1 : 1;
  const counts = dayCountsFor(row, today);
  return {
    totalPoints: (row?.totalPoints ?? 0) + points,
    dayPoints: (isSameDay ? row?.dayPoints ?? 0 : 0) + points,
    day: today,
    dayCounts: { ...counts, [axisKey]: (counts[axisKey] ?? 0) + 1 },
    streakDays,
    longestStreakDays: Math.max(row?.longestStreakDays ?? 0, streakDays),
  };
}

/** L'instantané BRUT d'une ligne — `day` à son jour, sans résolution au jour du lecteur. */
export function snapshotOfRow(conversationId: string, row: ConversationEngagementRow | null): ConversationEngagementSnapshot {
  return {
    conversationId,
    totalPoints: Math.max(0, row?.totalPoints ?? 0),
    todayPoints: Math.max(0, row?.dayPoints ?? 0),
    streakDays: Math.max(0, row?.streakDays ?? 0),
    day: row?.day ? civilDayKey(row.day) : null,
  };
}

/** L'instantané que le LECTEUR voit aujourd'hui (`today`, son jour civil). */
export function viewerSnapshot(
  conversationId: string,
  row: ConversationEngagementRow | null,
  today: Date,
): ConversationEngagementSnapshot {
  return conversationEngagementForDay(snapshotOfRow(conversationId, row), civilDayKey(today));
}

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class ConversationEngagementRecorder {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'conversationEngagement'>,
    private readonly emitIO: () => ServerEmitIO | undefined,
  ) {}

  async load(userId: string, conversationId: string): Promise<ConversationEngagementRow | null> {
    return this.prisma.conversationEngagement.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: CONVERSATION_ENGAGEMENT_SELECT,
    });
  }

  /**
   * Écrit l'état qui suit CE geste et l'annonce au crédité. `previous` est la
   * ligne lue pour la garde du plafond — la relire ici élargirait la fenêtre
   * de course sans la fermer.
   */
  async record(params: {
    readonly userId: string;
    readonly conversationId: string;
    readonly axisKey: EngagementOperationKey;
    readonly points: number;
    readonly today: Date;
    readonly previous: ConversationEngagementRow | null;
  }): Promise<ConversationEngagementSnapshot> {
    const { userId, conversationId, previous } = params;
    const next = nextConversationEngagement(previous, params);
    const data = {
      totalPoints: next.totalPoints,
      dayPoints: next.dayPoints,
      day: next.day,
      dayCounts: next.dayCounts as Prisma.InputJsonObject,
      streakDays: next.streakDays,
      longestStreakDays: next.longestStreakDays,
    };
    const where = { userId_conversationId: { userId, conversationId } };
    try {
      await this.prisma.conversationEngagement.upsert({
        where,
        create: { userId, conversationId, ...data },
        update: data,
      });
    } catch (err) {
      // Deux premiers gestes concurrents : le perdant de la création retombe
      // sur une mise à jour de la ligne que le gagnant vient de poser.
      if (!isP2002(err)) throw err;
      await this.prisma.conversationEngagement.update({ where, data });
    }

    const snapshot = snapshotOfRow(conversationId, next);
    this.announce(userId, snapshot);
    return snapshot;
  }

  /** Best-effort : le crédit est écrit, une émission ratée ne le défait pas. */
  private announce(userId: string, snapshot: ConversationEngagementSnapshot): void {
    try {
      this.emitIO()
        ?.to(ROOMS.user(userId))
        .emit(SERVER_EVENTS.ENGAGEMENT_CONVERSATION_UPDATED, snapshot);
    } catch (error) {
      log.warn('engagement:conversation-updated emit failed', {
        userId,
        conversationId: snapshot.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
