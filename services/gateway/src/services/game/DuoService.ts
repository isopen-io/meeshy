/**
 * LA MISSION EN DUO (#9385) — producteur UNIQUE de `GameDuo` et `GameDuoSlot`.
 * La LOI (tirage commun à la paire, objectifs, avancement, récompense doublée,
 * invitation permise ou refusée, transitions d'état) vient de
 * `@meeshy/shared/utils/game/duo` ; ce service l'applique contre la base.
 *
 *  - **sur invitation ACCEPTÉE, à tout moment quittée** (conformité B-4) : le
 *    duo naît `invited`, devient `active` quand l'invité accepte, et `abandon`
 *    le termine d'un geste, pour l'un comme pour l'autre ;
 *  - **un duo par semaine et par compte** : la contrainte unique
 *    `(userId, weekKey)` de `GameDuoSlot` tranche, jamais une relecture ;
 *  - **amis ACCEPTÉS, et jamais bloqués** (conformité A-8, B-6) : un blocage rend
 *    `areFriends` faux à l'invitation, à l'acceptation, et TERMINE un duo en cours ;
 *  - **la progression se compte au signal** (`onSignal`), depuis le même point
 *    que les missions : une action qu'un plafond anti-triche a refusée n'arrive
 *    jamais ici. Un signal « distinct » (conversation, auteur) ne compte qu'une
 *    fois par clé ;
 *  - **la récompense se paie à deux** : quand les deux parts sont faites, chacun
 *    reçoit `duoReward` doublé (+ 5 étoiles de saison) ; à la fin de la semaine,
 *    celui qui a fini seul reçoit sa part simple. Chaque paiement se réclame
 *    par une écriture conditionnelle : il n'a lieu qu'une fois ;
 *  - **la présence coupée se montre au jour près** (conformité B-3) : la part du
 *    partenaire est servie à la fin de la veille, jamais à la minute ;
 *  - **aucune pression** (conformité B-5) : le service n'émet AUCUNE notification.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { DuoInviteResponse, DuoAbandonResponse, DuoAcceptResponse } from '@meeshy/shared/types/game';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';
import {
  DUO_BASE_POINTS,
  canInviteToDuo,
  drawDuoMission,
  duoReward,
  duoTransition,
  type DuoMission,
  type DuoStatus,
} from '@meeshy/shared/utils/game/duo';
import { levelForUnlocks } from '@meeshy/shared/utils/game/levels';
import { leagueWeekOfMoment } from '@meeshy/shared/utils/game/league';
import type { GameBlockExtrasFacts } from '@meeshy/shared/utils/game/game-block-extras';
import { isBlockedBetween } from '../../utils/blocking';
import { amitieAcceptee } from '../friendship';
import { FLAME_USER_SELECT, flameFactsOf } from './FlameService';
import { GameRefusal } from './GameRefusal';
import { presenceCutAmong } from './LeagueAccess';
import { GAME_BONUS_AXIS } from './MissionService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { GameNotifier, GameNotificationEvent } from './GameNotifier';
import type { SeasonService } from './SeasonService';

const log = enhancedLogger.child({ module: 'DuoService' });

/** Le délai de grâce après le dimanche 20 h du dernier fuseau (UTC−12) avant d'expirer un duo. */
const EXPIRY_GRACE_HOURS = 12;

/** Invitations qu'un compte peut ENVOYER dans une semaine, et invitations en attente qu'un compte peut RECEVOIR. */
export const DUO_INVITES_PER_WEEK = 5;
export const DUO_PENDING_PER_INVITEE = 5;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

type DuoRow = {
  readonly id: string;
  readonly weekKey: string;
  readonly inviterId: string;
  readonly inviteeId: string;
  readonly status: string;
  readonly templateKey: string | null;
  readonly signal: string | null;
  readonly prism: boolean | null;
  readonly partTarget: number | null;
  readonly commonTarget: number | null;
  readonly inviterProgress: number;
  readonly inviteeProgress: number;
  readonly inviterSeen: readonly string[];
  readonly inviteeSeen: readonly string[];
  readonly inviterPaidAt: Date | null;
  readonly inviteePaidAt: Date | null;
};

const ACCOUNT_SELECT = { ...FLAME_USER_SELECT, isActive: true, deletedAt: true, engagementScore: true, levelRecord: true, displayName: true, firstName: true, lastName: true, username: true } as const;

const recordOf = (row: { engagementScore?: number | null; levelRecord?: number | null } | null): number =>
  Math.max(levelForUnlocks(row?.engagementScore ?? 0), row?.levelRecord ?? 0);

const NOT_PAID = (field: 'inviterPaidAt' | 'inviteePaidAt') => ({ OR: [{ [field]: null }, { [field]: { isSet: false } }] });

export type DuoServiceDeps = {
  readonly creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>;
  readonly seasons?: Pick<SeasonService, 'addStars'>;
  /** Prévient l'invité d'une invitation et l'invitant d'une acceptation (#9490) — jamais bloquant. */
  readonly notifier?: Pick<GameNotifier, 'notify'>;
};

export type SignalOptions = { readonly now?: Date; readonly key?: string; readonly amount?: number };

/** La page de la fin d'un compte : on pagine jusqu'à épuisement, jamais « les 50 premiers ». */
const SETTLE_PAGE = 50;

export class DuoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: DuoServiceDeps,
  ) {}

  /** Une notification est une CONSÉQUENCE du geste : détachée, gardée — elle ne le retient ni ne le défait. */
  private announce(event: GameNotificationEvent): void {
    const pending = this.deps.notifier?.notify(event);
    if (pending !== undefined) pending.catch(() => undefined);
  }

  private async account(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: ACCOUNT_SELECT });
  }

  /** Un compte réel et vivant : un compte inconnu, désactivé ou supprimé n'est jamais un partenaire. */
  private async livingAccount(userId: string) {
    const row = await this.account(userId);
    return row !== null && row.isActive !== false && row.deletedAt == null ? row : null;
  }

  private weekOf(now: Date, timezone: string | null | undefined): string {
    return leagueWeekOfMoment({ dayKey: dayKeyOf(now, timezone), minuteOfDay: minuteOfDayInTimezone(now, timezone) });
  }

  private async areFriends(a: string, b: string): Promise<boolean> {
    return (await amitieAcceptee(this.prisma, a, b)) && !(await isBlockedBetween(this.prisma, a, b));
  }

  private async hasSlot(userId: string, weekKey: string): Promise<boolean> {
    return (await this.prisma.gameDuoSlot.findUnique({ where: { userId_weekKey: { userId, weekKey } }, select: { id: true } })) !== null;
  }

  // --- Inviter ---

  async invite(params: { readonly inviterId: string; readonly friendId: string; readonly now?: Date }): Promise<DuoInviteResponse> {
    const { inviterId, friendId } = params;
    const now = params.now ?? new Date();
    const [inviter, invitee] = await Promise.all([this.account(inviterId), this.livingAccount(friendId)]);
    const weekKey = this.weekOf(now, inviter?.timezone);

    // L'amitié se tranche AVANT tout ce qui dépend de l'invité (niveau, emplacement,
    // invitations en attente) : un inconnu reçoit la même réponse quel que soit le
    // compte visé — ni son niveau, ni son existence ne fuient (conformité D-3).
    const self = inviterId === friendId;
    const areFriends = !self && invitee !== null && (await this.areFriends(inviterId, friendId));
    if (!self && !areFriends) throw new GameRefusal('DUO_NOT_FRIENDS');

    const existing = (await this.prisma.gameDuo.findFirst({
      where: { weekKey, inviterId, inviteeId: friendId, status: { in: ['invited', 'active'] } },
      select: { id: true },
    })) as { id: string } | null;
    if (existing) return { status: 'already-invited', duoId: existing.id, weekKey };

    // Le sens inverse (B→A pendant que A→B existe) est UN duo, pas deux ; et les invitations
    // d'une semaine sont plafonnées, de part et d'autre, pour qu'on ne puisse pas harceler.
    const reverse = await this.prisma.gameDuo.findFirst({
      where: { weekKey, inviterId: friendId, inviteeId: inviterId, status: { in: ['invited', 'active'] } },
      select: { id: true },
    });
    if (reverse !== null) throw new GameRefusal('DUO_ALREADY_ACTIVE', { reason: 'reverse-invitation' });
    // Une invitation REFUSÉE par l'invité ne se renouvelle pas la même semaine : on n'insiste pas.
    const declined = await this.prisma.gameDuo.findFirst({
      where: { weekKey, inviterId, inviteeId: friendId, declinedAt: { not: null } },
      select: { id: true },
    });
    if (declined !== null) throw new GameRefusal('DUO_TRANSITION_REFUSED', { reason: 'declined-this-week' });
    const [sent, pending] = await Promise.all([
      this.prisma.gameDuo.count({ where: { weekKey, inviterId } }),
      this.prisma.gameDuo.count({ where: { weekKey, inviteeId: friendId, status: 'invited' } }),
    ]);
    if (sent >= DUO_INVITES_PER_WEEK || pending >= DUO_PENDING_PER_INVITEE) throw new GameRefusal('DUO_TRANSITION_REFUSED', { reason: 'invitation-cap' });

    const verdict = canInviteToDuo({
      inviterLevelRecord: recordOf(inviter),
      inviteeLevelRecord: invitee ? recordOf(invitee) : 0,
      areFriends: self || areFriends,
      inviterHasDuo: await this.hasSlot(inviterId, weekKey),
      inviteeHasDuo: await this.hasSlot(friendId, weekKey),
      self,
    });
    if (verdict.allowed === false) throw this.refusalOf(verdict.reason);

    const mission = drawDuoMission({
      userA: inviterId,
      userB: friendId,
      weekKey,
      levelA: levelForUnlocks(inviter?.engagementScore ?? 0),
      levelB: levelForUnlocks(invitee?.engagementScore ?? 0),
      unavailableSignals: [],
    });

    const duo = await this.prisma.gameDuo.create({
      data: {
        weekKey,
        inviterId,
        inviteeId: friendId,
        status: 'invited',
        templateKey: mission?.templateKey ?? null,
        signal: mission?.signal ?? null,
        prism: mission?.prism ?? null,
        partTarget: mission?.partTarget ?? null,
        commonTarget: mission?.commonTarget ?? null,
        inviterProgress: 0,
        inviteeProgress: 0,
        inviterSeen: [],
        inviteeSeen: [],
        inviterPaidAt: null,
        inviteePaidAt: null,
        acceptedAt: null,
        endedAt: null,
      },
      select: { id: true },
    });
    // L'invitation ne réserve QUE l'emplacement de l'INVITANT (le sien, qu'il a choisi
    // d'engager) : celui de l'invité ne se prend qu'à son acceptation. Une invitation
    // en attente ne peut donc ni bloquer l'invité ni le priver de son duo de la semaine.
    try {
      await this.prisma.gameDuoSlot.create({ data: { userId: inviterId, weekKey, duoId: duo.id }, select: { id: true } });
    } catch (err) {
      await this.prisma.gameDuo.delete({ where: { id: duo.id } });
      if (isP2002(err)) throw new GameRefusal('DUO_ALREADY_ACTIVE');
      throw err;
    }
    this.announce({ kind: 'duo-invited', recipientId: friendId, actorId: inviterId, duoId: duo.id, weekKey });
    return { status: 'invited', duoId: duo.id, weekKey };
  }

  private refusalOf(reason: string): GameRefusal {
    if (reason === 'locked' || reason === 'invitee-locked') return new GameRefusal('DUO_LOCKED', { reason });
    if (reason === 'not-friends') return new GameRefusal('DUO_NOT_FRIENDS');
    if (reason === 'already-in-duo' || reason === 'invitee-in-duo') return new GameRefusal('DUO_ALREADY_ACTIVE', { reason });
    return new GameRefusal('DUO_TRANSITION_REFUSED', { reason });
  }

  private async load(duoId: string): Promise<DuoRow | null> {
    return (await this.prisma.gameDuo.findUnique({ where: { id: duoId } })) as DuoRow | null;
  }

  private roleOf(duo: DuoRow, userId: string): 'inviter' | 'invitee' | null {
    return duo.inviterId === userId ? 'inviter' : duo.inviteeId === userId ? 'invitee' : null;
  }

  // --- Accepter ---

  async accept(params: { readonly userId: string; readonly duoId: string; readonly now?: Date }): Promise<DuoAcceptResponse> {
    const { userId, duoId } = params;
    const now = params.now ?? new Date();
    const duo = await this.load(duoId);
    const role = duo === null ? null : this.roleOf(duo, userId);
    if (duo === null || role === null) throw new GameRefusal('DUO_NOT_FOUND');
    if (role === 'invitee' && duo.status === 'active') return { status: 'already-active', duoId };

    const next = duoTransition({ status: duo.status as DuoStatus, action: 'accept', actor: role });
    if (next === null) throw new GameRefusal('DUO_TRANSITION_REFUSED', { status: duo.status });

    const me = await this.account(userId);
    if (this.weekOf(now, me?.timezone) !== duo.weekKey) {
      await this.end(duo, 'expired', now);
      throw new GameRefusal('DUO_TRANSITION_REFUSED', { reason: 'week-over' });
    }
    if (!(await this.areFriends(duo.inviterId, duo.inviteeId))) {
      await this.end(duo, 'abandoned', now);
      throw new GameRefusal('DUO_NOT_FRIENDS');
    }
    try {
      await this.prisma.gameDuoSlot.create({ data: { userId, weekKey: duo.weekKey, duoId }, select: { id: true } });
    } catch (err) {
      if (isP2002(err)) throw new GameRefusal('DUO_ALREADY_ACTIVE');
      throw err;
    }
    const activated = await this.prisma.gameDuo.updateMany({ where: { id: duoId, status: 'invited' }, data: { status: 'active', acceptedAt: now } });
    if (activated.count === 0) {
      await this.prisma.gameDuoSlot.deleteMany({ where: { userId, duoId } });
      const fresh = await this.load(duoId);
      if (fresh?.status === 'active') return { status: 'already-active', duoId };
      throw new GameRefusal('DUO_TRANSITION_REFUSED', { status: fresh?.status ?? null });
    }
    this.announce({ kind: 'duo-accepted', recipientId: duo.inviterId, actorId: userId, duoId, weekKey: duo.weekKey });
    return { status: 'active', duoId };
  }

  // --- Quitter ---

  async abandon(params: { readonly userId: string; readonly duoId: string; readonly now?: Date }): Promise<DuoAbandonResponse> {
    const { userId, duoId } = params;
    const now = params.now ?? new Date();
    const duo = await this.load(duoId);
    const role = duo === null ? null : this.roleOf(duo, userId);
    if (duo === null || role === null) throw new GameRefusal('DUO_NOT_FOUND');
    if (duo.status === 'abandoned') return { status: 'already-abandoned', duoId };
    if (duoTransition({ status: duo.status as DuoStatus, action: 'abandon', actor: role }) === null) {
      throw new GameRefusal('DUO_TRANSITION_REFUSED', { status: duo.status });
    }
    // L'invité qui refuse une invitation encore EN ATTENTE la verrouille pour la semaine.
    const declining = role === 'invitee' && duo.status === 'invited';
    await this.end(duo, 'abandoned', now, declining ? { declinedAt: now } : {});
    return { status: 'abandoned', duoId };
  }

  /** Termine un duo : l'état, la date, et les emplacements libérés. */
  private async end(duo: DuoRow, status: 'abandoned' | 'expired' | 'completed', now: Date, extra: { readonly declinedAt?: Date } = {}): Promise<void> {
    const ended = await this.prisma.gameDuo.updateMany({ where: { id: duo.id, status: { in: ['invited', 'active'] } }, data: { status, endedAt: now, ...extra } });
    // Seul un duo qui vient d'être terminé SANS être accompli libère ses emplacements.
    if (ended.count > 0 && status !== 'completed') await this.prisma.gameDuoSlot.deleteMany({ where: { duoId: duo.id } });
  }

  // --- La progression ---

  private async activeDuoOf(userId: string, weekKey: string): Promise<DuoRow | null> {
    const slot = (await this.prisma.gameDuoSlot.findUnique({ where: { userId_weekKey: { userId, weekKey } }, select: { duoId: true } })) as { duoId: string } | null;
    if (slot === null) return null;
    const duo = await this.load(slot.duoId);
    return duo !== null && duo.status === 'active' ? duo : null;
  }

  /**
   * Un fait observé pour `userId` : s'il porte le signal du duo actif de la
   * semaine, SA part avance. Jamais d'erreur vers l'appelant (voie des gestes).
   */
  async onSignal(userId: string, signal: string, options: SignalOptions = {}): Promise<void> {
    const now = options.now ?? new Date();
    const me = await this.account(userId);
    const weekKey = this.weekOf(now, me?.timezone);
    let duo = await this.activeDuoOf(userId, weekKey);
    if (duo === null || duo.signal !== signal || duo.partTarget === null || duo.weekKey !== weekKey) return;
    if (!(await this.areFriends(duo.inviterId, duo.inviteeId))) {
      await this.end(duo, 'abandoned', now);
      return;
    }
    const role = this.roleOf(duo, userId);
    if (role === null) return;
    for (let attempt = 0; attempt < 3 && duo !== null; attempt += 1) {
      const mine = role === 'inviter' ? duo.inviterProgress : duo.inviteeProgress;
      const seen = role === 'inviter' ? duo.inviterSeen : duo.inviteeSeen;
      if (mine >= duo.partTarget) return;
      if (options.key !== undefined && seen.includes(options.key)) return;
      const gained = options.key !== undefined ? 1 : Math.max(1, options.amount ?? 1);

      const data =
        role === 'inviter'
          ? { inviterProgress: mine + gained, ...(options.key !== undefined ? { inviterSeen: { push: options.key } } : {}) }
          : { inviteeProgress: mine + gained, ...(options.key !== undefined ? { inviteeSeen: { push: options.key } } : {}) };
      const written = await this.prisma.gameDuo.updateMany({
        where: { id: duo.id, status: 'active', ...(role === 'inviter' ? { inviterProgress: mine } : { inviteeProgress: mine }) },
        data,
      });
      if (written.count === 1) {
        await this.completeIfBothDone(duo.id, now);
        return;
      }
      duo = await this.load(duo.id);
      if (duo === null || duo.status !== 'active') return;
    }
  }

  /** Quand les deux parts sont faites : le duo est accompli, chacun est payé (doublé), 5 étoiles chacun. */
  private async completeIfBothDone(duoId: string, now: Date): Promise<void> {
    const duo = await this.load(duoId);
    if (duo === null || duo.status !== 'active' || duo.partTarget === null) return;
    if (!(duo.inviterProgress >= duo.partTarget && duo.inviteeProgress >= duo.partTarget)) return;
    const done = await this.prisma.gameDuo.updateMany({ where: { id: duoId, status: 'active' }, data: { status: 'completed', endedAt: now } });
    if (done.count === 0) return;
    // Les emplacements d'un duo ACCOMPLI restent pris jusqu'à la fin de la semaine :
    // ni réinvitation ni autre partenaire — un duo ne se paie qu'une fois par compte et par semaine.
    for (const role of ['inviter', 'invitee'] as const) {
      await this.pay(duo, role, true, now).catch((error: unknown) =>
        log.warn('duo reward failed, claim handed back', { duoId, role, error: error instanceof Error ? error.message : String(error) }),
      );
      await this.deps.seasons?.addStars(role === 'inviter' ? duo.inviterId : duo.inviteeId, 'duo', now).catch(() => undefined);
    }
  }

  /** Paie la part d'un côté — une fois : la réclamation est conditionnelle, rendue si le crédit échoue. */
  private async pay(duo: DuoRow, role: 'inviter' | 'invitee', partnerDone: boolean, now: Date): Promise<void> {
    const field = role === 'inviter' ? 'inviterPaidAt' : 'inviteePaidAt';
    const userId = role === 'inviter' ? duo.inviterId : duo.inviteeId;
    const claimed = await this.prisma.gameDuo.updateMany({ where: { id: duo.id, ...NOT_PAID(field) }, data: { [field]: now } });
    if (claimed.count === 0) return;
    try {
      const account = await this.account(userId);
      const flame = flameFactsOf(account ?? {}, now);
      const reward = duoReward({ level: levelForUnlocks(account?.engagementScore ?? 0), flameDays: flame.streak, mineDone: true, partnerDone });
      if (reward.points > 0) await this.deps.creditPoints(userId, reward.points, GAME_BONUS_AXIS);
    } catch (error) {
      await this.prisma.gameDuo.updateMany({ where: { id: duo.id, [field]: now }, data: { [field]: null } });
      throw error;
    }
  }

  // --- La fin de semaine ---

  /**
   * Les duos d'une semaine révolue : celui qui a fini SEUL reçoit sa part simple,
   * les duos encore ouverts expirent, les emplacements se libèrent. Idempotent.
   */
  async expireOld(now: Date = new Date()): Promise<number> {
    const cutoff = this.weekOf(new Date(now.getTime() - EXPIRY_GRACE_HOURS * 3_600_000), 'UTC');
    const stale = (await this.prisma.gameDuo.findMany({
      where: { weekKey: { lt: cutoff }, status: { in: ['invited', 'active'] } },
      take: 500,
    })) as DuoRow[];
    for (const duo of stale) {
      if (duo.status === 'active' && duo.partTarget !== null) {
        for (const role of ['inviter', 'invitee'] as const) {
          const mine = role === 'inviter' ? duo.inviterProgress : duo.inviteeProgress;
          if (mine >= duo.partTarget) {
            await this.pay(duo, role, false, now).catch((error: unknown) =>
              log.warn('duo solo reward failed', { duoId: duo.id, role, error: error instanceof Error ? error.message : String(error) }),
            );
          }
        }
      }
      await this.end(duo, 'expired', now);
    }
    // Les emplacements des semaines révolues (duos accomplis compris) se libèrent.
    await this.prisma.gameDuoSlot.deleteMany({ where: { weekKey: { lt: cutoff } } });
    return stale.length;
  }

  // --- La lecture ---

  /**
   * Le duo de la semaine tel que le bloc `game` le sert. **Aucune présence n'en
   * sort** (loi de présence, conformité B-3 et A-7) : la part du partenaire est
   * ARRONDIE (au quart de la cible, vers le bas), sans clé de jour ni horodatage
   * — ce qui permettrait de lire QUAND il a agi. Si le partenaire a coupé son
   * statut en ligne, ou masqué son jeu, on ne sert RIEN de sa part (0).
   */
  /**
   * L'invitation qui ATTEND ce compte cette semaine : l'invité n'a pas d'emplacement
   * tant qu'il n'a pas accepté, et sans elle il ne connaîtrait jamais l'identifiant
   * à accepter. La plus récente seulement — les autres restent en attente.
   */
  private async pendingInvitationFor(userId: string, weekKey: string): Promise<DuoRow | null> {
    return (await this.prisma.gameDuo.findFirst({
      where: { inviteeId: userId, weekKey, status: 'invited' },
      orderBy: { createdAt: 'desc' },
    })) as DuoRow | null;
  }

  async current(userId: string, now: Date = new Date()): Promise<NonNullable<GameBlockExtrasFacts['duo']> | null> {
    const me = await this.account(userId);
    const weekKey = this.weekOf(now, me?.timezone);
    const slot = (await this.prisma.gameDuoSlot.findUnique({ where: { userId_weekKey: { userId, weekKey } }, select: { duoId: true } })) as { duoId: string } | null;
    const duo = slot === null ? await this.pendingInvitationFor(userId, weekKey) : await this.load(slot.duoId);
    if (duo === null || (duo.status !== 'invited' && duo.status !== 'active')) return null;

    const role = this.roleOf(duo, userId);
    if (role === null) return null;
    if (!(await this.areFriends(duo.inviterId, duo.inviteeId))) {
      await this.end(duo, 'abandoned', now);
      return null;
    }
    const partnerId = role === 'inviter' ? duo.inviteeId : duo.inviterId;
    const partner = await this.account(partnerId);
    const [cut, hidden] = await Promise.all([
      presenceCutAmong(this.prisma, [partnerId]),
      this.prisma.gameProfile.findUnique({ where: { userId: partnerId }, select: { gameHiddenAt: true } }),
    ]);
    const withheld = cut.has(partnerId) || hidden?.gameHiddenAt != null;
    const partnerTotal = role === 'inviter' ? duo.inviteeProgress : duo.inviterProgress;
    const partnerProgress = withheld || duo.partTarget === null ? 0 : roundedPartnerProgress(partnerTotal, duo.partTarget);

    const mission: DuoMission | null =
      duo.templateKey === null || duo.signal === null || duo.partTarget === null || duo.commonTarget === null
        ? null
        : { weekKey: duo.weekKey, templateKey: duo.templateKey, signal: duo.signal as DuoMission['signal'], prism: duo.prism ?? false, partTarget: duo.partTarget, commonTarget: duo.commonTarget, basePoints: DUO_BASE_POINTS };
    return {
      duoId: duo.id,
      status: duo.status as DuoStatus,
      role,
      partner: { userId: partnerId, displayName: partner?.displayName || [partner?.firstName, partner?.lastName].filter(Boolean).join(' ') || partner?.username || '' },
      mission,
      mine: role === 'inviter' ? duo.inviterProgress : duo.inviteeProgress,
      partnerProgress,
    };
  }

  /**
   * La suppression d'un compte (conformité I-1) TERMINE ses duos ouverts proprement :
   * le partenaire qui avait déjà fini SA part reçoit sa part simple (une fois — la
   * réclamation est conditionnelle), le duo se ferme et libère les emplacements.
   * Rien ne reste qui pointe vers le compte effacé. Idempotent.
   */
  async settleForDeletedAccount(userId: string, now: Date = new Date()): Promise<number> {
    const seen = new Set<string>();
    for (;;) {
      const open = (await this.prisma.gameDuo.findMany({
        where: { OR: [{ inviterId: userId }, { inviteeId: userId }], status: { in: ['invited', 'active'] } },
        take: SETTLE_PAGE,
      })) as DuoRow[];
      // Chaque duo terminé sort de la requête : on pagine jusqu'à épuisement, et une page sans duo NEUF arrête la boucle.
      const fresh = open.filter((duo) => !seen.has(duo.id));
      if (fresh.length === 0) return seen.size;
      for (const duo of fresh) {
        seen.add(duo.id);
        if (duo.status === 'active' && duo.partTarget !== null) {
          const partnerRole = duo.inviterId === userId ? 'invitee' : 'inviter';
          const partnerProgress = partnerRole === 'inviter' ? duo.inviterProgress : duo.inviteeProgress;
          // L'effacement d'un compte ne dépend JAMAIS d'un bonus : un crédit qui tombe se journalise.
          if (partnerProgress >= duo.partTarget) {
            await this.pay(duo, partnerRole, false, now).catch((error: unknown) =>
              log.warn('duo partner reward failed during account erasure', { duoId: duo.id, error: error instanceof Error ? error.message : String(error) }),
            );
          }
        }
        await this.end(duo, 'abandoned', now);
      }
    }
  }
}

/** La part du partenaire, au quart de la cible vers le bas : 0, 25 %, 50 %, 75 %, 100 %. */
export function roundedPartnerProgress(progress: number, target: number): number {
  if (!(target > 0)) return 0;
  const clamped = Math.min(Math.max(0, Math.trunc(progress)), target);
  return Math.floor((Math.floor((clamped * 4) / target) * target) / 4);
}
