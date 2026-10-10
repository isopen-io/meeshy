import { defineListSpec, type ListState } from './list-state';
import { ADMIN_PERIODS, isAdminPeriod, periodStart } from './period';

/**
 * **LA LISTE DES SIGNALEMENTS** (#8876, #6726) — ce que l'écran sait trier et
 * filtrer, donc ce que l'adresse peut porter.
 *
 * Les trois clés de tri sont celles de `REPORT_SORT_KEYS` côté passerelle ; les
 * filtres, ceux que `GET /admin/reports` lit (`status`, `reportType`,
 * `reportedType`, `assigned`, `createdAfter` par la période) ; et
 * `reportedEntityId` — « tous les signalements qui visent CETTE entité » — est
 * un filtre par IDENTIFIANT, qui n'entre que s'il a la forme d'un ObjectId.
 *
 * **Pas de recherche** : la route n'en sert pas, et un champ qui ne filtre rien
 * serait un contrôle sans effet.
 */
export const REPORT_STATUSES = ['pending', 'under_review', 'resolved', 'rejected', 'dismissed'] as const;
export const REPORT_TYPES = ['spam', 'inappropriate', 'harassment', 'violence', 'hate_speech', 'fake_profile', 'impersonation', 'other'] as const;
export const REPORTED_KINDS = ['message', 'user', 'conversation', 'community', 'post', 'story', 'comment', 'sound'] as const;
export const REPORT_ASSIGNMENTS = ['me', 'none'] as const;

export const REPORT_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt', 'updatedAt', 'resolvedAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: {
    status: REPORT_STATUSES,
    reportType: REPORT_TYPES,
    reportedType: REPORTED_KINDS,
    assigned: REPORT_ASSIGNMENTS,
    period: ADMIN_PERIODS,
  },
  idFilters: ['reportedEntityId'],
  pageSizes: [20, 50, 100],
});

export type ReportSortKey = (typeof REPORT_LIST_SPEC.sortKeys)[number];
export type ReportFilterKey = keyof typeof REPORT_LIST_SPEC.filters;
export type ReportIdFilterKey = 'reportedEntityId';
export type ReportListState = ListState<ReportSortKey, ReportFilterKey, ReportIdFilterKey>;

const FORWARDED_FILTERS = ['status', 'reportType', 'reportedType', 'assigned'] as const satisfies readonly ReportFilterKey[];

/**
 * La requête envoyée à la passerelle. `now` est INJECTÉ : la période
 * (`createdAfter`) se calcule sur l'horloge qu'on lui donne, jamais sur celle du
 * module, sans quoi un témoin ne pourrait pas la fixer.
 */
export function reportListQuery(state: ReportListState, now: Date): URLSearchParams {
  const query = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
    sortBy: state.sort,
    sortOrder: state.order,
  });
  FORWARDED_FILTERS.forEach((key) => {
    const value = state.filters[key];
    if (value !== undefined) query.set(key, value);
  });
  const period = state.filters.period;
  if (period !== undefined && isAdminPeriod(period)) query.set('createdAfter', periodStart(period, now));
  const entity = state.ids.reportedEntityId;
  if (entity !== undefined) query.set('reportedEntityId', entity);
  return query;
}
