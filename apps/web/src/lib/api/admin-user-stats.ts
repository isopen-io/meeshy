import { type AdminDeps, asCount, asRecord } from './admin';
import type { ApiResult } from './http';

/**
 * **LES STATISTIQUES D'UN MEMBRE** (#7845 C) —
 * `GET /api/v1/admin/users/:userId/stats`, sous `canViewUserDetails`.
 *
 * La passerelle réutilise `computeUserStats` (messages, conversations,
 * traductions, publications…) et y ajoute les compteurs que seule
 * l'administration lit : modération (signalements reçus et émis,
 * bannissements), sécurité (sessions actives), social (amis, contacts,
 * communautés), liens.
 *
 * ## La liste des compteurs est NOMMÉE ici, en miroir de la passerelle
 *
 * {@link ADMIN_STAT_KEYS} recopie `ADMIN_STAT_KEYS`
 * (`services/admin/admin-user-stats.ts`). Le module de la passerelle n'est pas
 * importable depuis le web ; la recopie est le prix, et elle est gardée par le
 * décodeur : un compteur servi que ce tableau ne nomme pas n'entre pas dans le
 * cache, un compteur nommé que la charge ne porte pas vaut zéro — jamais
 * `undefined` au milieu d'une grille de tuiles.
 *
 * ## Un signalement RETENU n'est pas un zéro
 *
 * Les trois compteurs de {@link ADMIN_REPORT_STAT_KEYS} lisent la table
 * `Report`, dont le seuil (`canModerateContent`) est plus haut que celui de la
 * fiche : AUDIT ouvre la fiche et reçoit `null` pour eux. Le décodeur garde ce
 * `null` — le rendre en 0 dirait « personne n'a signalé ce membre » à celui qui
 * n'a pas le droit de le savoir, un fait faux plutôt qu'un silence. Ailleurs,
 * `null` n'est pas un état prévu et vaut zéro, comme toute valeur illisible.
 *
 * ## Une clé PERSISTÉE
 *
 * Des agrégats, sans identifiant ni contenu : rien qui ne puisse survivre sur le
 * disque. La fiche se rouvre donc avec ses tuiles, sans attendre le réseau.
 */
export const ADMIN_STAT_KEYS = [
  'messagesSent',
  'conversations',
  'translations',
  'memberDays',
  'posts',
  'reels',
  'stories',
  'comments',
  'messageReactions',
  'postReactions',
  'commentReactions',
  'attachments',
  'postMedia',
  'friends',
  'friendRequestsPending',
  'friendRequestsReceived',
  'friendRequestsSent',
  'contacts',
  'communities',
  'reportsReceived',
  'reportsMade',
  'reportsOnMessages',
  'sessionsActive',
  'bansTotal',
  'bansActive',
  'shareLinks',
  'trackingLinks',
  'affiliations',
] as const;

export type AdminStatKey = (typeof ADMIN_STAT_KEYS)[number];

/** Miroir d'`ADMIN_REPORT_STAT_KEYS` de la passerelle — `null` sans `canModerateContent`. */
export const ADMIN_REPORT_STAT_KEYS = ['reportsReceived', 'reportsMade', 'reportsOnMessages'] as const satisfies readonly AdminStatKey[];

export type AdminReportStatKey = (typeof ADMIN_REPORT_STAT_KEYS)[number];

export type AdminUserStatCounts = Readonly<
  Record<Exclude<AdminStatKey, AdminReportStatKey>, number> & Record<AdminReportStatKey, number | null>
>;

const isReportStatKey = (cle: AdminStatKey): cle is AdminReportStatKey =>
  ADMIN_REPORT_STAT_KEYS.some((cleSignalement) => cleSignalement === cle);

const decodeCount = (cle: AdminStatKey, valeur: unknown): number | null =>
  valeur === null && isReportStatKey(cle) ? null : asCount(valeur);

export type AdminUserStats = {
  readonly counts: AdminUserStatCounts;
  readonly languages: readonly string[];
  readonly computedAt: string | null;
};

export const adminUserStatsQueryKey = (userId: string) => ['admin', 'user', userId, 'stats'] as const;

export function decodeAdminUserStats(raw: unknown): AdminUserStats | null {
  const charge = asRecord(raw);
  if (charge === null || Array.isArray(raw)) return null;
  const compteurs = asRecord(charge.counts);
  if (compteurs === null) return null;

  return {
    counts: Object.fromEntries(ADMIN_STAT_KEYS.map((cle) => [cle, decodeCount(cle, compteurs[cle])])) as AdminUserStatCounts,
    languages: Array.isArray(charge.languages)
      ? charge.languages.filter((langue): langue is string => typeof langue === 'string' && langue !== '')
      : [],
    computedAt: typeof charge.computedAt === 'string' && charge.computedAt !== '' ? charge.computedAt : null,
  };
}

export async function loadAdminUserStats(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserStats>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/stats`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const stats = decodeAdminUserStats(result.data);
  return stats === null ? { ok: false, status: 0, error: 'Statistiques illisibles' } : { ok: true, data: stats };
}

/**
 * Une minute : ces compteurs coûtent une quinzaine de `count` à la passerelle,
 * et aucun geste de la fiche ne les rend faux à la seconde près.
 */
export function adminUserStatsQueryOptions(deps: AdminDeps, userId: string) {
  return {
    queryKey: adminUserStatsQueryKey(userId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminUserStats> => {
      const resultat = await loadAdminUserStats({ ...deps, userId, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 60 * 1000,
    retry: false,
  };
}
