import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import type { ApiResult } from './http';

/**
 * **LES SIGNALEMENTS** (#8876, #6726) — `GET /admin/reports*`, gardées par
 * `canModerateContent` côté passerelle.
 *
 * ## Ce que la passerelle sert, et ce que ce décodeur en garde
 *
 * Depuis le lot passerelle (§ 6.4), chaque signalement arrive NOMMÉ : le
 * signalant et le modérateur (`reporter`, `moderator`) et l'entité signalée
 * résolue (`reportedEntity` : genre, nom, propriétaire, extrait, protection,
 * suppression, conversation). Le schéma de réponse est FERMÉ ; ce décodeur
 * l'est aussi, champ par champ — **aucun spread** : une colonne future de la
 * ligne `Report`, ou un champ voisin d'une personne, ne doit pas entrer dans un
 * cache qui porte, par construction, l'extrait d'un contenu privé.
 *
 * `excerpt` n'existe que pour `canModerateContent`, jamais pour un contenu
 * protégé ni retiré : un extrait `null` AVEC `isProtected` se dit « Contenu
 * protégé », jamais « pas de texte ».
 *
 * ## Ce qu'un geste rend
 *
 * `PATCH` et `POST …/assign` rendent la ligne BRUTE (sans noms, avec les notes
 * du modérateur). Les gestes n'en gardent RIEN : un simple accusé. La vérité se
 * relit par invalidation, et la ligne brute ne passe jamais dans un cache.
 */
export type AdminReportPerson = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type AdminReportedEntity = {
  readonly type: string;
  readonly id: string;
  readonly label: string | null;
  readonly owner: AdminReportPerson | null;
  readonly excerpt: string | null;
  readonly isProtected: boolean;
  readonly deleted: boolean;
  readonly conversation: { readonly id: string; readonly title: string | null } | null;
};

export type AdminReport = {
  readonly id: string;
  readonly reportedType: string;
  readonly reportedEntityId: string;
  readonly reporterId: string | null;
  readonly reporterName: string | null;
  readonly reportType: string;
  readonly reason: string | null;
  readonly status: string;
  readonly moderatorId: string | null;
  readonly moderatorNotes: string | null;
  readonly actionTaken: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
  readonly resolvedAt: string | null;
  readonly reporter: AdminReportPerson | null;
  readonly moderator: AdminReportPerson | null;
  readonly reportedEntity: AdminReportedEntity | null;
};

export type AdminReportCount = { readonly key: string; readonly count: number };

export type AdminReportStats = {
  readonly total: number;
  readonly pending: number;
  readonly underReview: number;
  readonly resolved: number;
  readonly rejected: number;
  readonly dismissed: number;
  /** En HEURES, `resolved` et `rejected` seulement : les dossiers classés sans suite n'ont pas de date de résolution. */
  readonly averageResolutionHours: number;
  readonly byType: readonly AdminReportCount[];
  readonly byReportedType: readonly AdminReportCount[];
};

export type ReportDecision =
  | { readonly kind: 'resolve'; readonly actionTaken: string; readonly notes: string | null }
  | { readonly kind: 'reject'; readonly notes: string | null }
  | { readonly kind: 'dismiss'; readonly notes: string | null }
  | { readonly kind: 'reopen' };

/** Combien d'autres signalements de la même entité la fiche nomme — le reste est derrière le lien « voir tous ». */
export const ADMIN_REPORT_SIBLINGS_PAGE = 6;

const textOrNull = (value: unknown): string | null => {
  const text = asText(value).trim();
  return text === '' ? null : text;
};

const instantOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function decodePerson(raw: unknown): AdminReportPerson | null {
  const person = asRecord(raw);
  if (person === null || typeof person.id !== 'string' || person.id === '') return null;
  return {
    id: person.id,
    username: asText(person.username),
    displayName: textOrNull(person.displayName),
    avatar: textOrNull(person.avatar),
  };
}

function decodeEntity(raw: unknown): AdminReportedEntity | null {
  const entity = asRecord(raw);
  if (entity === null || typeof entity.type !== 'string' || typeof entity.id !== 'string') return null;
  const conversation = asRecord(entity.conversation);
  return {
    type: entity.type,
    id: entity.id,
    label: textOrNull(entity.label),
    owner: decodePerson(entity.owner),
    excerpt: textOrNull(entity.excerpt),
    isProtected: entity.isProtected === true,
    deleted: entity.deleted === true,
    conversation:
      conversation === null || typeof conversation.id !== 'string' ? null : { id: conversation.id, title: textOrNull(conversation.title) },
  };
}

export function decodeAdminReport(raw: unknown): AdminReport | null {
  const report = asRecord(raw);
  if (report === null) return null;
  const { id, reportedType, reportedEntityId, reportType, status, createdAt } = report;
  if (
    typeof id !== 'string' ||
    id === '' ||
    typeof reportedType !== 'string' ||
    typeof reportedEntityId !== 'string' ||
    typeof reportType !== 'string' ||
    typeof status !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }
  return {
    id,
    reportedType,
    reportedEntityId,
    reporterId: textOrNull(report.reporterId),
    reporterName: textOrNull(report.reporterName),
    reportType,
    reason: textOrNull(report.reason),
    status,
    moderatorId: textOrNull(report.moderatorId),
    moderatorNotes: textOrNull(report.moderatorNotes),
    actionTaken: textOrNull(report.actionTaken),
    createdAt,
    updatedAt: instantOrNull(report.updatedAt),
    resolvedAt: instantOrNull(report.resolvedAt),
    reporter: decodePerson(report.reporter),
    moderator: decodePerson(report.moderator),
    reportedEntity: decodeEntity(report.reportedEntity),
  };
}

const countsOf = (raw: unknown): readonly AdminReportCount[] =>
  Object.entries(asRecord(raw) ?? {})
    .flatMap(([key, count]) => (typeof count === 'number' && Number.isFinite(count) && count > 0 ? [{ key, count }] : []))
    .sort((a, b) => b.count - a.count);

export function decodeAdminReportStats(raw: unknown): AdminReportStats {
  const stats = asRecord(raw) ?? {};
  return {
    total: asCount(stats.totalReports),
    pending: asCount(stats.pendingReports),
    underReview: asCount(stats.underReviewReports),
    resolved: asCount(stats.resolvedReports),
    rejected: asCount(stats.rejectedReports),
    dismissed: asCount(stats.dismissedReports),
    averageResolutionHours: asCount(stats.averageResolutionTimeHours),
    byType: countsOf(stats.reportsByType),
    byReportedType: countsOf(stats.reportsByReportedType),
  };
}

const UNREADABLE = { ok: false, status: 502, error: 'Charge illisible' } as const;

export async function loadAdminReports(
  params: AdminDeps & { readonly query: URLSearchParams; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminReport>>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.reports}?${params.query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminReport, { kind: 'nested', key: 'reports' });
}

export async function loadAdminReportStats(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AdminReportStats>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.reportsStats,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminReportStats(result.data), ...(result.status === undefined ? {} : { status: result.status }) };
}

export async function loadAdminReport(
  params: AdminDeps & { readonly reportId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminReport>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.reportsById(params.reportId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const report = decodeAdminReport(result.data);
  if (report === null) return UNREADABLE;
  return { ok: true, data: report, ...(result.status === undefined ? {} : { status: result.status }) };
}

/** Les autres signalements visant la même entité : une PAGE V1 (la pagination voyage à côté de `data`), bornée. */
export async function loadAdminReportSiblings(
  params: AdminDeps & { readonly type: string; readonly entityId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AdminReport>>> {
  const query = new URLSearchParams({ offset: '0', limit: String(ADMIN_REPORT_SIBLINGS_PAGE) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.reportsEntityByTypeById(params.type, params.entityId)}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  return adminPageOf(result, decodeAdminReport, { kind: 'top' });
}

/** Le corps d'une décision : le statut, la note quand il y en a une, et — pour « résoudre » seulement — l'action consignée. */
function decisionBody(decision: ReportDecision): Readonly<Record<string, string>> {
  switch (decision.kind) {
    case 'resolve':
      return { status: 'resolved', actionTaken: decision.actionTaken, ...(decision.notes === null ? {} : { moderatorNotes: decision.notes }) };
    case 'reject':
      return { status: 'rejected', ...(decision.notes === null ? {} : { moderatorNotes: decision.notes }) };
    case 'dismiss':
      return { status: 'dismissed', ...(decision.notes === null ? {} : { moderatorNotes: decision.notes }) };
    case 'reopen':
      return { status: 'pending' };
  }
}

/** L'accusé d'un geste : « c'est fait », rien de la ligne brute. Non nul — `useAdminAction` rend `null` pour un refus. */
export type AdminReportAck = { readonly acknowledged: true };

const acknowledged = (result: ApiResult<unknown>): ApiResult<AdminReportAck> =>
  result.ok ? { ok: true, data: { acknowledged: true }, ...(result.status === undefined ? {} : { status: result.status }) } : result;

export async function decideAdminReport(
  params: AdminDeps & { readonly reportId: string; readonly decision: ReportDecision },
): Promise<ApiResult<AdminReportAck>> {
  return acknowledged(
    await params.transport.request<unknown>({
      method: 'PATCH',
      path: adminEndpoints.reportsById(params.reportId),
      body: decisionBody(params.decision),
    }),
  );
}

export async function assignAdminReport(params: AdminDeps & { readonly reportId: string }): Promise<ApiResult<AdminReportAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.reportsByIdAssign(params.reportId) }));
}

export async function deleteAdminReport(params: AdminDeps & { readonly reportId: string }): Promise<ApiResult<AdminReportAck>> {
  return acknowledged(await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.reportsById(params.reportId) }));
}

/**
 * LES CLÉS DE REQUÊTE — sous `['admin', 'moderation']` : jamais écrites sur le
 * disque (`estClefNonPersistable`), ce qui compte ici, l'extrait d'un message
 * signalé n'ayant pas à survivre à la session de l'administrateur.
 */
export const ADMIN_REPORTS_KEY = ['admin', 'moderation'] as const;
export const ADMIN_REPORTS_LISTS_KEY = ['admin', 'moderation', 'list'] as const;
export const ADMIN_REPORTS_STATS_KEY = ['admin', 'moderation', 'stats'] as const;
export const ADMIN_REPORTS_SIBLINGS_KEY = ['admin', 'moderation', 'entity'] as const;
export const adminReportsListKey = (address: string) => ['admin', 'moderation', 'list', address] as const;
export const adminReportKey = (reportId: string) => ['admin', 'moderation', 'report', reportId] as const;
export const adminReportSiblingsKey = (type: string, entityId: string) => ['admin', 'moderation', 'entity', type, entityId] as const;
