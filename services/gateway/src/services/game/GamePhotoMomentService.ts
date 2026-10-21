/**
 * LES ÉTAPES DU JEU FRANCHIES APP FERMÉE (#10175, L19 — chantier « Cadres de gloire »,
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.16.4).
 *
 * Deux temps, que le job `jobs/game-photo-moments.ts` enchaîne :
 *
 *  - **la détection** (`detect`) lit la situation du carnet depuis les MÊMES faits que le bloc `game` servi au
 *    client (`GameBlockService.build` puis `catchUpStandingOf`, la dérivation partagée — jamais
 *    `GameStandingService`, qui sert le jeu d'un AUTRE membre). À la première évaluation d'un compte, elle pose la
 *    ligne de base (`GameProfile.photoAlertsBaseline*`) sans rien annoncer ; ensuite, elle écrit au registre
 *    partagé (`GamePhotoMoment.detectedAt`) les étapes neuves que la loi d'alerte retient (`photoAlertFor`) : ni le
 *    départ, ni l'arriéré d'avant la ligne de base, ni une étape déjà au registre. Une identité inconnue ou un
 *    compte au plafond n'écrivent rien (`isKnownPhotoStepId`, `PHOTO_MOMENTS_ACCOUNT_MAX`) ;
 *  - **l'envoi** (`deliver`) regroupe, par compte, les étapes détectées depuis au moins le délai de la politique
 *    et ni présentées ni notifiées (`photoAlertDigest`), et pousse UNE notification par `GameNotifier` (plafond
 *    d'une notification de jeu par jour, « Jeu masqué », langue de cadrage). Il DIFFÈRE — sans rien écrire — pour un
 *    compte en ligne (l'hôte de l'app est la surface), pendant son « Ne pas déranger » quand il l'a posé
 *    (`isWithinDnd`, la règle même de `NotificationService`, testée AVANT `GameNotifier` pour qu'une suppression ne
 *    consomme pas sa clé), sinon la nuit dans SON fuseau (`effectiveZone`), ou quand le créneau du jour est pris. Il n'envoie rien à un compte
 *    qui a coupé le push photo ou le jeu. Une étape notifiée ne repart jamais (`notifiedAt` fait foi) ; une Flamme
 *    déjà annoncée par `streak_milestone` ne part pas en push photo (l'invitation dans l'app reste).
 *
 * Une étape non présentée ni notifiée au-delà de `PENDING_WINDOW_DAYS` sort de l'envoi : le carnet la garde, sans
 * relance (§ 5.16.6).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { z } from 'zod';
import { STREAK_THRESHOLDS } from '@meeshy/shared/types/engagement';
import { photoCatchUpStandingSchema } from '@meeshy/shared/types/game-photo';
import { isNotificationTypeEnabled, type NotificationPreference } from '@meeshy/shared/types/notification-preferences';
import { NotificationPreferenceSchema } from '@meeshy/shared/types/preferences/notification';
import { isWithinDnd } from '@meeshy/shared/utils/notification-dnd';
import { PHOTO_ALERT_POLICY, photoAlertDigest, photoAlertFor, type PhotoAlertPolicy, type PhotoMomentRecord } from '@meeshy/shared/utils/game/photo-alerts';
import { GLORY_RANKS, type GloryDivision5, type GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import { catchUpStandingOf, photoStepsReached, type PhotoCatchUpStanding } from '@meeshy/shared/utils/game/photo-catch-up';
import { PHOTO_MOMENTS_ACCOUNT_MAX, isKnownPhotoStepId } from '@meeshy/shared/utils/game/photo-step-ids';
import { TREASURY_TIERS, type TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { GameBlockService } from './GameBlockService';
import { GameNotifier, type GameNotifyResult } from './GameNotifier';
import { photoMomentId } from './GamePhotoService';
import { MissionService, READ_ONLY_CREDIT } from './MissionService';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';

const log = enhancedLogger.child({ module: 'GamePhotoMomentService' });

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Une étape détectée et jamais montrée sort de l'envoi après une semaine : le carnet la garde, sans relance. */
export const PENDING_WINDOW_DAYS = 7;
/** Combien de lignes en attente un passage relit au plus. */
export const PENDING_SCAN_MAX = 500;

/** Une ligne pas encore présentée / notifiée : à null, ou ABSENTE (écrite par la détection, MongoDB). */
const unset = (field: 'presentedAt' | 'notifiedAt') => ({ OR: [{ [field]: null }, { [field]: { isSet: false } }] });
const PENDING = { AND: [unset('presentedAt'), unset('notifiedAt')] };

const STREAK_FLAMES = new Set(STREAK_THRESHOLDS.map((days) => `flame:${days}`));

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

const KNOWN_RANKS: ReadonlySet<string> = new Set([...GLORY_RANKS.map((rank) => rank.key), 'mythe']);

/** La ligne de base gardée ; illisible ou d'un rang inconnu ⇒ `null`, et elle se repose sur la situation courante. */
function baselineOf(value: unknown): PhotoCatchUpStanding | null {
  const parsed = photoCatchUpStandingSchema.safeParse(value);
  if (!parsed.success || !KNOWN_RANKS.has(parsed.data.rank)) return null;
  const stored = parsed.data;
  return {
    rank: stored.rank as GloryRankOrMythic,
    division: (stored.division ?? null) as GloryDivision5 | null,
    levelRecord: stored.levelRecord,
    prestige: stored.prestige,
    minted: stored.minted,
    treasuryTier: stored.treasuryTier ?? null,
    flameRecord: stored.flameRecord,
    ...(stored.pastCycleRecords === undefined ? {} : { pastCycleRecords: stored.pastCycleRecords }),
  };
}

const tierRank = (tier: string | null | undefined): number => TREASURY_TIERS.findIndex((candidate) => candidate.key === tier);

const isTreasuryTier = (value: unknown): value is TreasuryTierKey => typeof value === 'string' && tierRank(value) >= 0;

/** La situation au plus haut palier du trésor jamais atteint (D14) : la ligne de base aussi, pour ne rien redécouvrir. */
const atPeak = (standing: PhotoCatchUpStanding, peak: TreasuryTierKey | null): PhotoCatchUpStanding =>
  tierRank(peak) > tierRank(standing.treasuryTier) ? { ...standing, treasuryTier: peak } : standing;

export type PhotoDetection =
  | { readonly kind: 'baseline' }
  | { readonly kind: 'detected'; readonly stepIds: readonly string[] }
  | { readonly kind: 'skipped'; readonly reason: 'no-block' };

export type PhotoDelivery = { readonly sent: number; readonly deferred: number };

type DeliveryOutcome = 'sent' | 'deferred' | 'skipped';

export type GamePhotoMomentDeps = {
  /** Le bloc `game` du compte — la lecture même de `GET /me/engagement`. */
  readonly blocks?: Pick<GameBlockService, 'build'>;
  readonly notifier?: Pick<GameNotifier, 'notify'>;
  readonly policy?: PhotoAlertPolicy;
};

/** La forme stockée, défauts du schéma appliqués (un document antérieur à un réglage le lit « reçu »). */
type StoredNotificationPreferences = z.infer<typeof NotificationPreferenceSchema>;

type PendingRow = { readonly userId: string; readonly stepId: string; readonly detectedAt: Date | null };

export class GamePhotoMomentService {
  private readonly blocks: Pick<GameBlockService, 'build'>;

  private readonly notifier: Pick<GameNotifier, 'notify'>;

  private readonly policy: PhotoAlertPolicy;

  constructor(
    private readonly prisma: PrismaClient,
    deps: GamePhotoMomentDeps = {},
  ) {
    // Une lecture qui ne crédite rien : poser les missions du jour est la seule écriture qu'elle puisse faire (ni record ni Gloire, #10905).
    this.blocks = deps.blocks ?? new GameBlockService(prisma, { missions: new MissionService(prisma, { creditPoints: READ_ONLY_CREDIT }), levelRecords: null });
    this.notifier = deps.notifier ?? new GameNotifier(prisma);
    this.policy = deps.policy ?? PHOTO_ALERT_POLICY;
  }

  /** Évalue un compte : pose sa ligne de base, ou écrit les étapes neuves au registre. */
  async detect(userId: string, now: Date = new Date()): Promise<PhotoDetection> {
    const block = await this.blocks.build({ userId, now });
    if (block === null) return { kind: 'skipped', reason: 'no-block' };
    const profile = await this.prisma.gameProfile.findUnique({ where: { userId }, select: { photoAlertsBaseline: true, treasuryPeakTier: true } });
    const treasuryPeak = isTreasuryTier(profile?.treasuryPeakTier) ? profile.treasuryPeakTier : null;
    const standing = atPeak(catchUpStandingOf(block), treasuryPeak);
    const baseline = baselineOf(profile?.photoAlertsBaseline);
    if (baseline === null) {
      await this.writeBaseline(userId, standing, now);
      return { kind: 'baseline' };
    }

    // La détection retient TOUTE étape neuve, quel que soit le réglage d'invitation (il gouverne les surfaces
    // de l'app, pas le registre) ; la loi écarte le départ, l'arriéré et ce qui n'est pas photographiable.
    const alert = photoAlertFor({
      reached: photoStepsReached(standing, this.policy).map((step) => step.id),
      standing,
      kept: [],
      presented: [],
      baseline,
      policy: { ...this.policy, invitations: 'every-step' },
      treasuryPeak,
    });
    const candidates = (alert?.reached ?? []).filter((stepId) => isKnownPhotoStepId(stepId, now));
    if (candidates.length === 0) return { kind: 'detected', stepIds: [] };

    const known = new Set(
      (await this.prisma.gamePhotoMoment.findMany({ where: { userId, stepId: { in: candidates } }, select: { stepId: true }, take: candidates.length })).map(
        (row) => row.stepId,
      ),
    );
    const fresh = candidates.filter((stepId) => !known.has(stepId));
    const room = fresh.length === 0 ? 0 : Math.max(0, PHOTO_MOMENTS_ACCOUNT_MAX - (await this.prisma.gamePhotoMoment.count({ where: { userId } })));
    const written: string[] = [];
    for (const stepId of fresh.slice(0, room)) {
      if (await this.createDetected(userId, stepId, now)) written.push(stepId);
    }
    return { kind: 'detected', stepIds: written };
  }

  /** Pousse, compte par compte, le résumé des étapes en attente depuis au moins le délai de la politique. */
  async deliver(now: Date = new Date()): Promise<PhotoDelivery> {
    const rows = (await this.prisma.gamePhotoMoment.findMany({
      where: {
        detectedAt: { lte: new Date(now.getTime() - this.policy.push.delayMinutes * MINUTE), gte: new Date(now.getTime() - PENDING_WINDOW_DAYS * DAY) },
        ...PENDING,
      },
      select: { userId: true, stepId: true, detectedAt: true },
      orderBy: { detectedAt: 'asc' },
      take: PENDING_SCAN_MAX,
    })) as PendingRow[];
    const byUser = rows.reduce((groups, row) => groups.set(row.userId, [...(groups.get(row.userId) ?? []), row]), new Map<string, PendingRow[]>());

    let sent = 0;
    let deferred = 0;
    for (const [userId, pending] of byUser) {
      const outcome = await this.deliverTo(userId, pending, now).catch((error: unknown) => {
        log.warn('photo moment delivery failed for one account', { userId, error: error instanceof Error ? error.message : String(error) });
        return 'deferred' as const;
      });
      if (outcome === 'sent') sent += 1;
      if (outcome === 'deferred') deferred += 1;
    }
    return { sent, deferred };
  }

  private async deliverTo(userId: string, pending: readonly PendingRow[], now: Date): Promise<DeliveryOutcome> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, deletedAt: true, isOnline: true, timezone: true } });
    if (!user || user.isActive === false || user.deletedAt != null) return 'skipped';
    const prefs = await this.preferencesOf(userId);
    if (prefs === null || !isNotificationTypeEnabled(prefs as unknown as NotificationPreference, 'game_photo_moment')) return 'skipped';
    if (user.isOnline === true) return 'deferred';
    // UNE règle d'heures calmes : le « Ne pas déranger » de l'utilisateur quand il l'a posé, sinon la nuit de la politique.
    if (prefs.dndEnabled ? isWithinDnd(prefs, now) : this.isNight(now, user.timezone)) return 'deferred';

    const announced = await this.flamesAnnounced(userId, pending);
    const records: PhotoMomentRecord[] = pending.filter((row) => !announced.has(row.stepId)).map((row) => ({ stepId: row.stepId, presentedAt: null, notifiedAt: null }));
    const digest = photoAlertDigest(records);
    if (digest === null) return 'skipped';

    const result: GameNotifyResult = await this.notifier.notify(
      { kind: 'photo-moment', recipientId: userId, stepIds: digest.stepIds, dayKey: dayKeyOf(now, user.timezone) },
      now,
    );
    log.info('photo moment push', { userId, count: digest.count, result });
    // `skipped:duplicate` : ce résumé est déjà parti aujourd'hui (une écriture du registre a manqué au passage d'avant).
    if (result !== 'sent' && result !== 'skipped:duplicate') return result === 'skipped:daily-cap' || result === 'skipped:declined' || result === 'failed' ? 'deferred' : 'skipped';
    await this.prisma.gamePhotoMoment.updateMany({ where: { userId, stepId: { in: [...digest.stepIds] }, ...PENDING }, data: { notifiedAt: now, updatedAt: now } });
    return 'sent';
  }

  /** La fenêtre de nuit de la politique, dans le fuseau du compte — jamais dans `dndUtcOffsetMinutes`. */
  private isNight(now: Date, timezone: string | null): boolean {
    const hour = Math.floor(minuteOfDayInTimezone(now, timezone) / 60);
    const { nightFromHour, nightToHour } = this.policy.push;
    return nightFromHour > nightToHour ? hour >= nightFromHour || hour < nightToHour : hour >= nightFromHour && hour < nightToHour;
  }

  /** Les Flammes de la liste déjà annoncées par `streak_milestone` (seuils communs : 7, 30, 100) depuis leur détection. */
  private async flamesAnnounced(userId: string, pending: readonly PendingRow[]): Promise<ReadonlySet<string>> {
    const flames = pending.filter((row) => STREAK_FLAMES.has(row.stepId));
    if (flames.length === 0) return new Set();
    const since = new Date(Math.min(...flames.map((row) => (row.detectedAt ?? new Date()).getTime())) - DAY);
    const milestone = await this.prisma.notification.findFirst({ where: { userId, type: 'streak_milestone', createdAt: { gte: since } }, select: { id: true } });
    return milestone === null ? new Set() : new Set(flames.map((row) => row.stepId));
  }

  /** Les préférences de notification du compte ; illisibles ⇒ `null` (on ne pousse pas ce qu'on ne sait pas lire). */
  private async preferencesOf(userId: string): Promise<StoredNotificationPreferences | null> {
    const row = await this.prisma.userPreferences.findFirst({ where: { userId }, select: { notification: true } });
    const parsed = NotificationPreferenceSchema.safeParse(row?.notification ?? {});
    return parsed.success ? parsed.data : null;
  }

  private async writeBaseline(userId: string, standing: PhotoCatchUpStanding, now: Date): Promise<void> {
    const data = { photoAlertsBaselineAt: now, photoAlertsBaseline: standing };
    await this.prisma.gameProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { id: true } });
  }

  private async createDetected(userId: string, stepId: string, now: Date): Promise<boolean> {
    try {
      await this.prisma.gamePhotoMoment.create({ data: { id: photoMomentId(userId, stepId), userId, stepId, detectedAt: now, updatedAt: now } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}
