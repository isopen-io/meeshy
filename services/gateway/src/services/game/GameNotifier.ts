/**
 * LES NOTIFICATIONS DU JEU (#9490) — invitation de duo reçue, duo accepté, résultat de
 * la semaine de ligue, étape de saison atteinte. La LOI (les quatre types, le plafond, la
 * phrase d'un résultat de ligue) vient de `@meeshy/shared/utils/game/notifications` ; les
 * textes, du catalogue de notifications (huit langues) ; ce service décide SI et À QUI.
 *
 * Règles, toutes gardées par `__tests__/GameNotifier.test.ts` :
 *  - **au plus UNE notification de jeu par jour et par destinataire**, le jour de SON fuseau
 *    (`SET NX EX`, `CacheStore.setnx` — Redis, ou sa `Map` en mémoire). Un verrou qui ne
 *    répond pas FERME : on ne notifie pas quand on ne sait pas compter ;
 *  - **un événement ne s'annonce qu'une fois** (une clé par duo, par semaine de ligue, par
 *    étape) : rejouer un règlement interrompu ne notifie pas deux fois ;
 *  - **« Jeu masqué » ne notifie rien** : tout est compté, rien n'est montré. Une préférence
 *    `notification.gameEnabled` à `false` non plus — et elle se lit AVANT le plafond du jour,
 *    pour qu'un compte qui a coupé « Jeu » ne consomme pas un créneau qu'il ne verra jamais ;
 *  - **le cadrage est dans la langue du destinataire** (`recipientLanguage` : la descente du
 *    Prisme, jamais `systemLanguage` seul) ;
 *  - **la charge ne dit que ce que le destinataire sait déjà de LUI** : un duo nomme l'AMI
 *    (ils se connaissent), la ligue et la saison ne nomment personne — jamais un pseudonyme,
 *    un compte, un rang, une heure d'activité, ni « X t'a dépassé » (conformité A-6, B-5).
 *
 * Jamais d'erreur vers l'appelant : une notification est une CONSÉQUENCE d'un geste de jeu,
 * elle ne le retient ni ne le défait. Le résultat dit ce qui s'est passé, pour les tests et
 * le journal.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationType } from '@meeshy/shared/types/notification';
import { gameLeagueResultKey } from '@meeshy/shared/utils/game/notifications';
import type { LeagueKey } from '@meeshy/shared/utils/game/league';
import { notificationString, type NotificationStringKey } from '@meeshy/shared/utils/notification-strings';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { getCacheStore } from '../CacheStore';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import type { NotificationService } from '../notifications/NotificationService';
import { GameProfileService } from './GameProfileService';
import { dayKeyOf } from './gameClock';

const log = enhancedLogger.child({ module: 'GameNotifier' });

/** Combien de temps un événement annoncé se retient : le rejeu d'un règlement se fait en heures, jamais en semaines. */
const ONCE_TTL_SECONDS = 14 * 24 * 3600;
/** Le jour de plafond expire seul, deux jours plus tard — jamais de ligne à nettoyer. */
const DAY_TTL_SECONDS = 2 * 24 * 3600;

export type GameNotificationEvent =
  | { readonly kind: 'duo-invited'; readonly recipientId: string; readonly actorId: string; readonly duoId: string; readonly weekKey: string }
  | { readonly kind: 'duo-accepted'; readonly recipientId: string; readonly actorId: string; readonly duoId: string; readonly weekKey: string }
  | {
      readonly kind: 'league-result';
      readonly recipientId: string;
      readonly weekKey: string;
      readonly league: LeagueKey;
      readonly nextLeague: LeagueKey;
      readonly zone: 'promotion' | 'safe' | 'relegation';
      readonly cup: 'gold' | 'silver' | 'bronze' | null;
    }
  | { readonly kind: 'season-step'; readonly recipientId: string; readonly season: number; readonly step: number; readonly completed: boolean };

export type GameNotifyResult =
  | 'sent'
  | 'skipped:no-notifier'
  | 'skipped:unknown-recipient'
  | 'skipped:unknown-actor'
  | 'skipped:game-hidden'
  | 'skipped:opted-out'
  | 'skipped:duplicate'
  | 'skipped:daily-cap'
  | 'skipped:declined'
  | 'failed';

export type GameNotificationThrottle = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  /** Rend le créneau du jour quand la notification n'a pas été créée (refus, panne). */
  del?(key: string): Promise<void>;
};

type Notifier = Pick<NotificationService, 'createNotification'>;

export type GameNotifierDeps = {
  /** Résolu à CHAQUE envoi : le service vivant s'enregistre après la construction des routes. */
  readonly notifications?: () => Notifier | undefined;
  readonly throttle?: GameNotificationThrottle;
  readonly profile?: Pick<GameProfileService, 'settings'>;
};

type Plan = {
  readonly type: NotificationType;
  readonly priority: 'low' | 'normal';
  readonly onceKey: string;
  readonly collapseId: string;
  readonly content: (lang: string) => string;
  readonly metadata: Record<string, unknown>;
  readonly actorId?: string;
};

const ROUTE = 'progression' as const;

const outcomeOf = (zone: 'promotion' | 'safe' | 'relegation') => (zone === 'promotion' ? 'promoted' : zone === 'relegation' ? 'relegated' : 'stayed');

const text = (lang: string, key: NotificationStringKey, count?: number): string =>
  notificationString(lang, key, count === undefined ? {} : { count });

function planOf(event: GameNotificationEvent): Plan {
  switch (event.kind) {
    case 'duo-invited':
      return {
        type: 'game_duo_invited',
        priority: 'normal',
        onceKey: `duo-invited:${event.duoId}`,
        collapseId: `game-duo-${event.duoId}`,
        content: (lang) => text(lang, 'game.duoInvitedBody'),
        metadata: { action: 'view_details', route: ROUTE, gameSection: 'duo', duoId: event.duoId, weekKey: event.weekKey },
        actorId: event.actorId,
      };
    case 'duo-accepted':
      return {
        type: 'game_duo_accepted',
        priority: 'normal',
        onceKey: `duo-accepted:${event.duoId}`,
        collapseId: `game-duo-${event.duoId}`,
        content: (lang) => text(lang, 'game.duoAcceptedBody'),
        metadata: { action: 'view_details', route: ROUTE, gameSection: 'duo', duoId: event.duoId, weekKey: event.weekKey },
        actorId: event.actorId,
      };
    case 'league-result':
      return {
        type: 'game_league_result',
        priority: 'low',
        onceKey: `league:${event.weekKey}`,
        collapseId: 'game-league-result',
        content: (lang) => text(lang, gameLeagueResultKey({ zone: event.zone, cup: event.cup })),
        metadata: {
          action: 'view_details',
          route: ROUTE,
          gameSection: 'league',
          weekKey: event.weekKey,
          league: event.league,
          outcome: outcomeOf(event.zone),
          cup: event.cup,
        },
      };
    case 'season-step':
      return {
        type: 'game_season_step',
        priority: 'low',
        onceKey: `season:${event.season}:${event.step}`,
        collapseId: 'game-season-step',
        content: (lang) => (event.completed ? text(lang, 'game.seasonDone') : text(lang, 'game.seasonStep', event.step)),
        metadata: { action: 'view_details', route: ROUTE, gameSection: 'season', season: event.season, step: event.step, completed: event.completed },
      };
  }
}

const nonEmpty = (value: string | null | undefined): string | null => (value && value.trim() !== '' ? value.trim() : null);

export class GameNotifier {
  private readonly profile: Pick<GameProfileService, 'settings'>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: GameNotifierDeps = {},
  ) {
    this.profile = deps.profile ?? new GameProfileService(prisma);
  }

  async notify(event: GameNotificationEvent, now: Date = new Date()): Promise<GameNotifyResult> {
    try {
      return await this.run(event, now);
    } catch (error) {
      log.warn('game notification failed — the game action is unaffected', {
        kind: event.kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'failed';
    }
  }

  private async run(event: GameNotificationEvent, now: Date): Promise<GameNotifyResult> {
    const notifications = (this.deps.notifications ?? getSharedNotificationService)();
    if (!notifications) return 'skipped:no-notifier';

    const recipient = await this.prisma.user.findUnique({
      where: { id: event.recipientId },
      select: { isActive: true, deletedAt: true, timezone: true, ...RECIPIENT_LANG_SELECT },
    });
    if (!recipient || recipient.isActive === false || recipient.deletedAt != null) return 'skipped:unknown-recipient';

    const plan = planOf(event);
    const actor = plan.actorId === undefined ? undefined : await this.actorOf(plan.actorId);
    if (plan.actorId !== undefined && actor === null) return 'skipped:unknown-actor';

    if ((await this.profile.settings(event.recipientId)).gameHidden) return 'skipped:game-hidden';
    if (await this.optedOut(event.recipientId)) return 'skipped:opted-out';

    const throttle = this.deps.throttle ?? getCacheStore();
    if (!(await throttle.setnx(`notif:game:once:${event.recipientId}:${plan.onceKey}`, now.toISOString(), ONCE_TTL_SECONDS))) return 'skipped:duplicate';
    // `GAME_NOTIFICATION_DAILY_CAP` vaut 1 : le créneau du jour se PREND, il ne se compte pas.
    const dayKey = `notif:game:day:${event.recipientId}:${dayKeyOf(now, recipient.timezone)}`;
    if (!(await throttle.setnx(dayKey, plan.type, DAY_TTL_SECONDS))) {
      return 'skipped:daily-cap';
    }

    // Le créneau ne se prend que pour une notification CRÉÉE : un refus (Ne pas déranger) ou une
    // panne le rend, sinon un résultat de ligue tombé la nuit taisait l'invitation du matin.
    const release = () => throttle.del?.(dayKey).catch(() => undefined);
    const lang = recipientLanguage(recipient, 'fr');
    const created = await notifications
      .createNotification({
        userId: event.recipientId,
        type: plan.type,
        priority: plan.priority,
        lang,
        content: plan.content(lang),
        ...(actor ? { actor } : {}),
        context: {},
        metadata: plan.metadata as never,
        collapseId: plan.collapseId,
      })
      .catch(async (error: unknown) => {
        await release();
        throw error;
      });
    if (created === null) {
      await release();
      return 'skipped:declined';
    }
    return 'sent';
  }

  /** L'ami qui invite ou accepte : un compte vivant, nommé comme son profil public le nomme. */
  private async actorOf(actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true, isActive: true, deletedAt: true },
    });
    if (!user || user.isActive === false || user.deletedAt != null) return null;
    const full = [user.firstName, user.lastName].filter((part) => nonEmpty(part) !== null).join(' ');
    return { id: user.id, username: user.username, displayName: nonEmpty(user.displayName) ?? (full || user.username), avatar: user.avatar ?? null };
  }

  /** `notification.gameEnabled === false` — l'absence vaut « reçu » (un document antérieur au réglage). */
  private async optedOut(userId: string): Promise<boolean> {
    const row = await this.prisma.userPreferences.findFirst({ where: { userId }, select: { notification: true } });
    return (row?.notification as Record<string, unknown> | null | undefined)?.gameEnabled === false;
  }
}
