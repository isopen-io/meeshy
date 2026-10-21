import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { useAdminReach, type AdminReach } from './use-admin-reach';

/**
 * **CE QU'UN RANG D'ADMINISTRATION ÉCRIT EN MOTIF** (demande porteur 2026-10-13, #10562) —
 * « pour un ADMIN ou un BIGBOSS, on ne demande pas de justifier quoi que ce soit, ou alors
 * on propose par défaut “Contrôle aléatoire, test de fonctionnalité et suivi client” ».
 *
 * - BIGBOSS (`sovereign`) n'écrit rien : la passerelle l'exempte (spec 2026-10-04 § 4).
 * - ADMIN reçoit le motif PROPOSÉ (`fallback`) : la passerelle n'exempte que le rang
 *   souverain, donc le motif part ÉCRIT — assez long (55 caractères) pour toutes les lois
 *   de champ, qui demandent au plus dix caractères.
 * - Les autres rangs (MODERATOR, AUDIT…) justifient comme avant : aucun motif proposé.
 *
 * La règle vit ICI une fois ; `motiveState`, `AdminReasonField` et `AdminConfirmSheet` la
 * reçoivent, et chaque feuille qui passe par eux en profite sans la recopier.
 */
export type AdminMotive = { readonly sovereign: boolean; readonly fallback: string | undefined };

export function adminMotiveOf(reach: Pick<AdminReach, 'isSovereign' | 'hasAdminRank'>, language: AdminLanguage): AdminMotive {
  if (reach.isSovereign) return { sovereign: true, fallback: undefined };
  return { sovereign: false, fallback: reach.hasAdminRank ? translateAdmin(language, 'admin.kit.motiveDefault') : undefined };
}

export function useAdminMotive(language: AdminLanguage): AdminMotive {
  return adminMotiveOf(useAdminReach(), language);
}
