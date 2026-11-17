/**
 * L'ENTONNOIR DU PARRAINAGE (#19207, chantier #18857) — « Visites → Inscriptions → Actifs » et
 * « N inscrits ce mois » de la vue Parrainage, ajoutés à `GET /affiliate/stats`.
 *
 * - `visits` : les clics comptés sur TOUS les jetons d'affiliation de l'appelant (liens
 *   partagés et jetons dédiés des invitations par e-mail).
 * - `registrations` / `registrationsThisMonth` : ses filleuls, depuis toujours et depuis le
 *   premier du mois UTC.
 * - `active` et l'`activity` de chaque filleul : vus sur Meeshy dans les trente derniers jours
 *   (`isReferralActive`).
 *
 * ## Pourquoi l'activité est derrière un drapeau
 *
 * Elle dérive de `User.lastActiveAt`, une donnée de PRÉSENCE, que la loi de présence ne sert
 * qu'aux amis acceptés. Un parrain n'est pas forcément l'ami de ses filleuls : servir « actif ce
 * mois » nommément est une exception à cette loi, qui revient au porteur. Tant que
 * `REFERRAL_ACTIVITY_ENABLED` n'est pas `true` (lu ici seul), `active` vaut `null` et aucune
 * activité n'est lue. Allumée, elle reste grossière (trente jours, jamais une date), ne compte
 * ni un compte fermé ni un filleul qui a masqué son statut en ligne (`privacy.showOnlineStatus`)
 * — celui-là n'a ni `active` ni `inactive`, il a `null`, comme quand le drapeau est éteint.
 *
 * ## Jamais au détriment de l'ancienne réponse
 *
 * Les champs sont ADDITIFS ; une panne de l'entonnoir laisse partir la réponse d'avant, sans eux.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isReferralActive, utcMonthStart } from '@meeshy/shared/utils/referral-funnel';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ReferralFunnel' });

export type ReferralActivity = 'active' | 'inactive';

export type ReferralFunnel = {
  readonly visits: number;
  readonly registrations: number;
  readonly registrationsThisMonth: number;
  readonly active: number | null;
  readonly activityByReferredUser: ReadonlyMap<string, ReferralActivity> | null;
};

type Env = Readonly<Record<string, string | undefined>>;

/** Le SEUL site qui lit le drapeau de l'activité des filleuls. Éteint par défaut. */
export const referralActivityEnabled = (env: Env = process.env): boolean => env.REFERRAL_ACTIVITY_ENABLED === 'true';

/** Un plafond de lecture : l'entonnoir d'un compte ne lit jamais plus de filleuls que ça. */
const MAX_REFERRALS_READ = 5000;

type ReferredUserRow = {
  readonly id: string;
  readonly lastActiveAt: Date | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
};

async function referralActivity(
  prisma: PrismaClient,
  affiliateUserId: string,
  now: Date,
): Promise<ReadonlyMap<string, ReferralActivity>> {
  const relations = await prisma.affiliateRelation.findMany({
    where: { affiliateUserId },
    select: { referredUserId: true },
    take: MAX_REFERRALS_READ,
  });
  const ids = [...new Set(relations.map((relation) => relation.referredUserId))];
  if (ids.length === 0) return new Map();
  const [users, privacy] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, lastActiveAt: true, isActive: true, deletedAt: true },
      take: MAX_REFERRALS_READ,
    }) as Promise<readonly ReferredUserRow[]>,
    loadPrivacyPreferencesCached(prisma, ids),
  ]);
  return new Map(
    users
      .filter((user) => user.isActive && user.deletedAt === null)
      .filter((user) => privacy.get(user.id)?.showOnlineStatus !== false)
      .map((user) => [user.id, isReferralActive({ lastActiveAt: user.lastActiveAt, now }) ? 'active' : 'inactive'] as const),
  );
}

export async function loadReferralFunnel(
  prisma: PrismaClient,
  params: { readonly userId: string; readonly now: Date; readonly withActivity: boolean },
): Promise<ReferralFunnel> {
  const { userId, now, withActivity } = params;
  const [clicks, registrations, registrationsThisMonth, activity] = await Promise.all([
    prisma.affiliateToken.aggregate({ where: { createdBy: userId }, _sum: { clickCount: true } }),
    prisma.affiliateRelation.count({ where: { affiliateUserId: userId } }),
    prisma.affiliateRelation.count({ where: { affiliateUserId: userId, createdAt: { gte: utcMonthStart(now) } } }),
    withActivity ? referralActivity(prisma, userId, now) : Promise.resolve(null),
  ]);
  return {
    visits: clicks._sum.clickCount ?? 0,
    registrations,
    registrationsThisMonth,
    active: activity ? [...activity.values()].filter((state) => state === 'active').length : null,
    activityByReferredUser: activity,
  };
}

type ReferralLike = { readonly referredUser?: { readonly id?: string } | null };

/** La réponse d'avant, enrichie de l'entonnoir et, drapeau allumé, de l'activité de chaque filleul. */
export function withReferralFunnel<T extends { readonly referrals?: readonly ReferralLike[] }>(stats: T, funnel: ReferralFunnel) {
  const activityOf = funnel.activityByReferredUser;
  return {
    ...stats,
    visits: funnel.visits,
    registrations: funnel.registrations,
    registrationsThisMonth: funnel.registrationsThisMonth,
    active: funnel.active,
    ...(activityOf && stats.referrals
      ? {
          referrals: stats.referrals.map((referral) => ({
            ...referral,
            activity: (referral.referredUser?.id && activityOf.get(referral.referredUser.id)) || null,
          })),
        }
      : {}),
  };
}

/** Ce que `GET /affiliate/stats` sert : l'entonnoir s'il se calcule, la réponse d'avant sinon. */
export async function withReferralFunnelIfAvailable<T extends { readonly referrals?: readonly ReferralLike[] }>(
  prisma: PrismaClient,
  userId: string,
  stats: T,
  now: Date = new Date(),
) {
  try {
    const funnel = await loadReferralFunnel(prisma, { userId, now, withActivity: referralActivityEnabled() });
    return withReferralFunnel(stats, funnel);
  } catch (error) {
    logger.warn('referral funnel unavailable, legacy stats served', { error });
    return stats;
  }
}
