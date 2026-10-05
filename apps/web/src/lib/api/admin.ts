import * as meEndpoints from '@meeshy/shared/api/endpoints/me';

import type { AdminPermissions } from '@/lib/admin/sections';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE L'ADMINISTRATION** (#6432) — `services/gateway/src/routes/admin/*`.
 *
 * Ce module ne garde plus que l'IDENTITÉ du lecteur — la matrice de
 * permissions — et les lectures prudentes que tous les ports d'administration
 * partagent (`asRecord`, `asCount`, `asText`, `pageServie`). Les compteurs du
 * tableau de bord vivent dans `admin-dashboard.ts` et la liste des comptes dans
 * `admin-users.ts` (#8876) : un port par ressource, chacun avec ses décodeurs
 * et sa clé de requête.
 *
 * - `GET /me/permissions` — l'adresse CANONIQUE (`routes/me/permissions.ts`).
 *   Pas `/admin/me/permissions`, qui en est l'alias DÉPRÉCIÉ (#4350) : viser
 *   l'alias ferait porter à chaque ouverture de l'espace un en-tête `Deprecation`
 *   que rien ne justifie.
 *
 * **Aucune branche `fixtures`.** Les autres ports en portent une parce que le
 * POC se capture sans passerelle ; l'administration, elle, n'a de sens que
 * SERVIE — un tableau de bord de démonstration afficherait des chiffres faux
 * dans un écran dont le métier est de dire le vrai. Sous `source: 'fixtures'`
 * les lectures échouent proprement, et l'écran rend son refus.
 */

export type AdminDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const ADMIN_PERMISSIONS_QUERY_KEY = ['admin', 'permissions'] as const;

export type AdminIdentity = {
  readonly role: string;
  readonly permissions: AdminPermissions;
};

/**
 * LES TROIS LECTURES PRUDENTES DU PORT D'ADMINISTRATION, exportées pour le
 * détail d'un membre (#6819) — et pour lui seul tant qu'aucun autre port n'en
 * a besoin.
 *
 * Elles sortent d'ici plutôt que d'être recopiées ailleurs : une seconde
 * définition serait une jumelle divergente (CLAUDE.md § Single Source of
 * Truth), et c'est précisément sur des helpers de trois lignes que la
 * divergence passe inaperçue — l'un tolérerait un jour `NaN` ou une chaîne
 * numérique que l'autre refuse, sans qu'aucun témoin ne rougisse.
 *
 * Elles ne rejoignent PAS `./decode` : ce module-là décode les DATES DU FIL
 * pour le cache TanStack (`toDate`, `decodeMessage`, `decodeConversation`) et
 * n'a aucun helper de ce genre. Les deux outils sont distincts, pas
 * redondants — vérifié avant d'extraire.
 */
export const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

export const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Une page SERVIE : ses lignes, et la pagination telle que le transport la remet. */
export type PageServie = {
  readonly lignes: readonly unknown[];
  readonly meta: Readonly<Record<string, unknown>>;
};

/**
 * **OÙ LA PAGINATION SE LIT VRAIMENT** (#6862, revue-correction) — le SITE
 * UNIQUE, parce que quatre décodeurs d'administration s'étaient trompés de la
 * même façon, doc-comment à l'appui.
 *
 * Les routes d'administration paginées passent par `sendPaginatedSuccess` :
 * l'enveloppe vaut `{ success, data, pagination }`, la pagination À CÔTÉ de
 * `data`. Chaque décodeur le DISAIT — et recevait ensuite `result.data`,
 * c'est-à-dire le TABLEAU seul, où il cherchait `charge.pagination`. Le
 * transport a déjà dépaqueté (`http.ts:355-366`) : `pagination` est un SIBLING
 * de `ok`, sur l'`ApiResult`.
 *
 * Conséquence mesurée, et invisible : `total` retombait sur la longueur de la
 * page, `hasMore` valait `false` pour toujours, et le bouton « Suivants »
 * était ÉTEINT en production sur les quatre listes — un contrôle qui existe et
 * n'a aucun effet (loi 4). Les témoins, eux, verdissaient : leur double rendait
 * `{ ok: true, data: enveloppeEntière }`, où `data.pagination` existe.
 *
 * Le repli sur `data.pagination` reste, pour les charges qu'un appelant remet
 * telles quelles (une fixture, une réponse non paginée) : il ne peut pas
 * masquer le défaut ci-dessus, puisque le niveau SERVI gagne.
 */
export function pageServie(resultat: { readonly data: unknown; readonly pagination?: unknown }): PageServie {
  const charge = asRecord(resultat.data);
  const lignes = Array.isArray(resultat.data) ? resultat.data : Array.isArray(charge?.data) ? charge.data : [];
  const meta = asRecord(resultat.pagination) ?? asRecord(charge?.pagination) ?? {};
  return { lignes, meta };
}

/**
 * `false` par DÉFAUT sur chaque clé — une permission absente de la charge est
 * une permission qu'on n'a pas. Le `?? false` n'est pas de la prudence
 * décorative : la matrice servie peut gagner des clés (elle en a déjà gagné),
 * et un client qui lirait `undefined` comme « vrai » ouvrirait une porte que
 * personne n'a ouverte.
 */
export function decodeAdminPermissions(raw: unknown): AdminPermissions {
  const source = asRecord(raw) ?? {};
  const lire = (clef: keyof AdminPermissions): boolean => source[clef] === true;

  return {
    canAccessAdmin: lire('canAccessAdmin'),
    canManageUsers: lire('canManageUsers'),
    canManageGroups: lire('canManageGroups'),
    canManageConversations: lire('canManageConversations'),
    canViewAnalytics: lire('canViewAnalytics'),
    canModerateContent: lire('canModerateContent'),
    canViewAuditLogs: lire('canViewAuditLogs'),
    canManageNotifications: lire('canManageNotifications'),
    canManageTranslations: lire('canManageTranslations'),
    // La garde RÉELLE des routes `/admin/agent/*` (#6733). La passerelle la
    // sert depuis le lot B ; ce décodeur ne la lisait pas, et la clé se
    // perdait au décodage — silencieusement, puisqu'une clé absente d'un type
    // rend `undefined` que personne ne lit.
    canManageAgent: lire('canManageAgent'),
  };
}

export async function loadAdminIdentity(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AdminIdentity>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: meEndpoints.permissions,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const charge = asRecord(result.data) ?? {};
  return {
    ok: true,
    data: {
      role: asText(charge.role) || 'USER',
      permissions: decodeAdminPermissions(charge.permissions),
    },
  };
}

/**
 * **LA LECTURE DES PERMISSIONS, écrite UNE fois** (#6458) — l'écran `/admin`,
 * la liste des comptes, la rangée des Réglages et le barreau du menu flottant
 * la partagent. Quatre `queryFn` recopiés sous la même clé auraient pu
 * diverger sur la façon de lire un refus ; ici un refus LÈVE, et chaque site
 * le lit comme l'absence du droit.
 *
 * Une matrice de permissions ne bouge pas pendant qu'on regarde un écran :
 * cinq minutes de fraîcheur, et aucun nouvel essai — un 403 relancé trois fois
 * remplirait les journaux d'audit de refus.
 */
export function adminIdentityQueryOptions(deps: AdminDeps) {
  return {
    queryKey: ADMIN_PERMISSIONS_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminIdentity> => {
      const resultat = await loadAdminIdentity({ ...deps, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  };
}
