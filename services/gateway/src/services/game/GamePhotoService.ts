/**
 * LES RÉGLAGES ET LE REGISTRE DES MOMENTS PHOTO (#10162, L10a — chantier « Cadres de gloire »,
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.12, § 5.16.2).
 *
 * Producteur UNIQUE des colonnes photo de `GameProfile` (`frameAtmosphere`, `photoInvitations`,
 * `treasuryPeakTier` ; la ligne de base, elle, est posée par le job des alertes) et du registre
 * `GamePhotoMoment`. `GameProfileService` garde les réglages de visibilité ; aucune route n'écrit ces
 * colonnes à côté.
 *
 * - **Choisir son atmosphère INSTALLE son pack**, dans cet ordre : l'installation d'abord (le moteur des
 *   packs, `PackCatalog.setInstalled`), la préférence ensuite. L'installation est TOLÉRANTE à un registre
 *   qui ne connaît pas encore le pack (rien n'est écrit pour lui, aucune erreur pour l'atmosphère) : c'est
 *   l'état « atmosphère choisie, pack non installé » que la loi de proposition sert, et que le client
 *   résorbe en réinstallant dès que le registre le connaît. Les deux écritures sont idempotentes.
 * - **Le pack de l'atmosphère choisie ne se retire pas** tant qu'elle l'est (`atmosphereRemovalGuard`,
 *   branché sur `gloryFramePackSpec.removalGuard`, PP7) — un autre appareil ou un ancien client ne le
 *   contourne pas.
 * - **L'accusé de présentation est idempotent** : une ligne par (compte, étape), d'`_id` DÉRIVÉ
 *   (`photoMomentId`) ; la date de la PREMIÈRE présentation ne bouge plus. Le registre est BORNÉ : la route
 *   n'accepte que des étapes connues (`isKnownPhotoStepId`), et un compte ne dépasse jamais
 *   `PHOTO_MOMENTS_ACCOUNT_MAX` lignes — au-delà, les étapes neuves sont ignorées, les gardées restent accusables.
 * - **Le signal « immortalisée » (D22 b, #10182) suit les mêmes règles** sur la même ligne (`keptAt`, première
 *   immortalisation) : seul l'identifiant d'étape voyage, la photo reste sur l'appareil. Une étape immortalisée
 *   VAUT présentée (`presentedAt` posé s'il manque) : le job des alertes ne pousse jamais une étape déjà au
 *   carnet, même immortalisée depuis une ligne que seule la détection avait écrite.
 * - **Le plus haut palier du trésor** (D14) ne redescend pas : tenu à la frappe (`notePeakTreasury`), et
 *   servi comme le plus haut du gardé et du courant — un compte déjà riche avant ce lot n'attend pas sa
 *   prochaine frappe.
 *
 * Aucune lecture n'échoue « ouvert » : une atmosphère, un réglage ou une ligne de base illisibles se lisent
 * « pas encore choisi ».
 */

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isGloryAtmosphere, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';
import {
  DEFAULT_PHOTO_INVITATIONS,
  PHOTO_MOMENTS_SERVED_MAX,
  isPhotoInvitations,
  photoCatchUpStandingSchema,
  type GamePhotoBlock,
  type PhotoInvitations,
} from '@meeshy/shared/types/game-photo';
import { PHOTO_MOMENTS_ACCOUNT_MAX } from '@meeshy/shared/utils/game/photo-step-ids';
import { TREASURY_TIERS, treasuryTier, type TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

type PhotoDb = Pick<PrismaClient, 'gameProfile' | 'gamePhotoMoment'>;

/** Ce que l'écriture de l'atmosphère demande au moteur des packs — `PackCatalog.setInstalled`, rien de plus. */
export type FramePackInstaller = {
  setInstalled(userId: string, slug: string, installed: true): Promise<{ readonly kind: 'done' | 'not-found' | 'not-removable' | 'not-owned' }>;
};

/** L'`_id` d'une ligne du registre : une empreinte de 24 hex de (compte, étape), stable et sans index. */
export const photoMomentId = (userId: string, stepId: string): string =>
  createHash('sha256').update(`game-photo-moment:${userId}:${stepId}`).digest('hex').slice(0, 24);

const tierRank = (tier: string | null | undefined): number => TREASURY_TIERS.findIndex((candidate) => candidate.key === tier);

const isTreasuryTier = (value: unknown): value is TreasuryTierKey => typeof value === 'string' && tierRank(value) >= 0;

/** Le plus haut des deux paliers, `null` si aucun. */
export const higherTreasuryTier = (a: TreasuryTierKey | null, b: TreasuryTierKey | null): TreasuryTierKey | null =>
  tierRank(a) >= tierRank(b) ? a : b;

const asIso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

/** Une ligne pas encore présentée : `presentedAt` à null, ou ABSENT (une ligne écrite par la détection). */
const notPresented = { OR: [{ presentedAt: null }, { presentedAt: { isSet: false } }] };
/** Une ligne pas encore immortalisée : `keptAt` à null, ou ABSENT (toute ligne d'avant le signal). */
const notKept = { OR: [{ keptAt: null }, { keptAt: { isSet: false } }] };

/** Les deux horloges du registre que les clients écrivent ; chacune ne se pose que là où elle manque. */
type StampKind = 'presented' | 'kept';
const stampWhere = (kind: StampKind) => (kind === 'kept' ? notKept : notPresented);
const stampData = (kind: StampKind, now: Date) => (kind === 'kept' ? { keptAt: now, updatedAt: now } : { presentedAt: now, updatedAt: now });

export class GamePhotoService {
  constructor(private readonly prisma: PhotoDb) {}

  /** L'extension `game.photo` : les réglages du compte et ses 64 lignes de registre les plus récentes. */
  async block(userId: string, options: { readonly balance: number }): Promise<GamePhotoBlock> {
    const [profile, rows] = await Promise.all([
      this.prisma.gameProfile.findUnique({
        where: { userId },
        select: { frameAtmosphere: true, photoInvitations: true, photoAlertsBaselineAt: true, photoAlertsBaseline: true, treasuryPeakTier: true },
      }),
      this.prisma.gamePhotoMoment.findMany({
        where: { userId },
        select: { stepId: true, detectedAt: true, presentedAt: true, notifiedAt: true, keptAt: true },
        orderBy: { updatedAt: 'desc' },
        take: PHOTO_MOMENTS_SERVED_MAX,
      }),
    ]);
    const baseline = photoCatchUpStandingSchema.safeParse(profile?.photoAlertsBaseline);
    const storedPeak = isTreasuryTier(profile?.treasuryPeakTier) ? profile.treasuryPeakTier : null;
    return {
      atmosphere: isGloryAtmosphere(profile?.frameAtmosphere) ? profile.frameAtmosphere : null,
      invitations: isPhotoInvitations(profile?.photoInvitations) ? profile.photoInvitations : DEFAULT_PHOTO_INVITATIONS,
      baselineAt: asIso(profile?.photoAlertsBaselineAt),
      baseline: baseline.success ? baseline.data : null,
      treasuryPeakTier: higherTreasuryTier(storedPeak, treasuryTier(options.balance).tier),
      moments: rows.map((row) => ({
        stepId: row.stepId,
        detectedAt: asIso(row.detectedAt),
        presentedAt: asIso(row.presentedAt),
        notifiedAt: asIso(row.notifiedAt),
        keptAt: asIso(row.keptAt),
      })),
    };
  }

  /** Choisit l'atmosphère : son pack s'installe d'abord (toléré absent du registre), la préférence ensuite. */
  async setAtmosphere(userId: string, atmosphere: GloryAtmosphere, frames: FramePackInstaller): Promise<{ atmosphere: GloryAtmosphere; packInstalled: boolean }> {
    const outcome = await frames.setInstalled(userId, atmosphere, true);
    await this.writeProfile(userId, { frameAtmosphere: atmosphere });
    return { atmosphere, packInstalled: outcome.kind === 'done' };
  }

  async setInvitations(userId: string, invitations: PhotoInvitations): Promise<{ invitations: PhotoInvitations }> {
    await this.writeProfile(userId, { photoInvitations: invitations });
    return { invitations };
  }

  /**
   * Accuse la présentation d'étapes. Une ligne par étape, jamais deux ; une étape déjà présentée garde sa
   * date. Une étape NEUVE n'entre que sous le plafond du compte (`PHOTO_MOMENTS_ACCOUNT_MAX`) ; au-delà elle
   * est ignorée. Rend chaque étape gardée avec la date de sa première présentation.
   */
  async markPresented(userId: string, stepIds: readonly string[], now: Date = new Date()): Promise<{ presented: { stepId: string; presentedAt: string }[] }> {
    const stamped = await this.stamp('presented', userId, stepIds, now);
    return { presented: stamped.map(({ stepId, at }) => ({ stepId, presentedAt: at })) };
  }

  /**
   * Le signal « immortalisée » (D22 b) : l'identifiant d'étape seul. Même ligne, mêmes règles que l'accusé — une
   * ligne par étape, la PREMIÈRE immortalisation fait foi, une étape neuve n'entre que sous le plafond — et
   * l'étape vaut présentée. Supprimer la photo sur l'appareil ne retire pas le signal.
   */
  async markKept(userId: string, stepIds: readonly string[], now: Date = new Date()): Promise<{ kept: { stepId: string; keptAt: string }[] }> {
    const stamped = await this.stamp('kept', userId, stepIds, now);
    return { kept: stamped.map(({ stepId, at }) => ({ stepId, keptAt: at })) };
  }

  /** Pose une horloge sur chaque étape du lot et rend, par étape gardée, la date qui fait foi (la première). */
  private async stamp(kind: StampKind, userId: string, stepIds: readonly string[], now: Date): Promise<readonly { stepId: string; at: string }[]> {
    const unique = [...new Set(stepIds)];
    await this.stampExisting(kind, { userId, stepId: { in: unique } }, now);
    const known = new Set(
      (await this.prisma.gamePhotoMoment.findMany({ where: { userId, stepId: { in: unique } }, select: { stepId: true }, take: unique.length })).map((row) => row.stepId),
    );
    for (const stepId of await this.withinAccountCap(userId, unique.filter((id) => !known.has(id)))) {
      await this.createStamped(kind, userId, stepId, now);
    }
    const rows = await this.prisma.gamePhotoMoment.findMany({
      where: { userId, stepId: { in: unique } },
      select: { stepId: true, presentedAt: true, keptAt: true },
      take: unique.length,
    });
    const at = new Map(rows.map((row) => [row.stepId, (kind === 'kept' ? row.keptAt : row.presentedAt) ?? now]));
    return unique.flatMap((stepId) => {
      const when = at.get(stepId);
      return when === undefined ? [] : [{ stepId, at: when.toISOString() }];
    });
  }

  /** Les étapes neuves qui tiennent sous `PHOTO_MOMENTS_ACCOUNT_MAX`, dans l'ordre du lot ; aucune au-delà. */
  private async withinAccountCap(userId: string, fresh: readonly string[]): Promise<readonly string[]> {
    if (fresh.length === 0) return [];
    const held = await this.prisma.gamePhotoMoment.count({ where: { userId } });
    return fresh.slice(0, Math.max(0, PHOTO_MOMENTS_ACCOUNT_MAX - held));
  }

  /** Garde le plus haut palier du trésor atteint ; n'écrit que s'il monte. */
  async notePeakTreasury(userId: string, balance: number): Promise<void> {
    const current = treasuryTier(balance).tier;
    if (current === null) return;
    const stored = await this.prisma.gameProfile.findUnique({ where: { userId }, select: { treasuryPeakTier: true } });
    const peak = isTreasuryTier(stored?.treasuryPeakTier) ? stored.treasuryPeakTier : null;
    if (tierRank(current) <= tierRank(peak)) return;
    await this.writeProfile(userId, { treasuryPeakTier: current });
  }

  /** La garde de retrait du domaine `glory-frame` : `false` pour le pack de l'atmosphère choisie (PP7). */
  async isFramePackRemovable(userId: string, slug: string): Promise<boolean> {
    const profile = await this.prisma.gameProfile.findUnique({ where: { userId }, select: { frameAtmosphere: true } });
    return profile?.frameAtmosphere !== slug;
  }

  /** Pose l'horloge là où elle manque ; une immortalisation pose aussi la présentation si elle manque (jamais l'inverse). */
  private async stampExisting(kind: StampKind, lines: { userId: string; stepId: string | { in: string[] } }, now: Date): Promise<void> {
    await this.prisma.gamePhotoMoment.updateMany({ where: { ...lines, ...stampWhere(kind) }, data: stampData(kind, now) });
    if (kind === 'kept') {
      await this.prisma.gamePhotoMoment.updateMany({ where: { ...lines, ...notPresented }, data: stampData('presented', now) });
    }
  }

  private async createStamped(kind: StampKind, userId: string, stepId: string, now: Date): Promise<void> {
    try {
      await this.prisma.gamePhotoMoment.create({ data: { id: photoMomentId(userId, stepId), userId, stepId, presentedAt: now, ...stampData(kind, now) } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Une écriture concurrente (détection, autre appareil) l'a créée entre-temps : l'estampiller si elle ne l'est pas.
      await this.stampExisting(kind, { userId, stepId }, now);
    }
  }

  private async writeProfile(userId: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.gameProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { id: true } });
  }
}

/** `gloryFramePackSpec.removalGuard`, branché sur la préférence d'atmosphère. */
export const atmosphereRemovalGuard =
  (prisma: PhotoDb) =>
  (userId: string, slug: string): Promise<boolean> =>
    new GamePhotoService(prisma).isFramePackRemovable(userId, slug);
