import type { AdminReportAction } from '@meeshy/shared/types/admin-publication-states';

/**
 * **UN SIGNALEMENT SE TRAITE EN UN GESTE** (#10394) — les actes qu'un dossier OUVERT
 * offre, selon ce qu'il vise (`POST /admin/reports/:reportId/act`) : l'action sur le
 * contenu et la clôture partent ensemble. Un dossier clos n'offre rien.
 */
const CLOSED: ReadonlySet<string> = new Set(['resolved', 'rejected', 'dismissed']);
const ON_POST: ReadonlySet<string> = new Set(['post', 'story']);

export function reportActsFor(report: { readonly reportedType: string | null; readonly status: string | null }): readonly AdminReportAction[] {
  if (report.status !== null && CLOSED.has(report.status)) return [];
  if (report.reportedType !== null && ON_POST.has(report.reportedType)) return ['take-offline', 'make-private', 'dismiss'];
  if (report.reportedType === 'comment') return ['remove-comment', 'dismiss'];
  return ['dismiss'];
}

export const closedStatusOf = (action: AdminReportAction): 'resolved' | 'dismissed' => (action === 'dismiss' ? 'dismissed' : 'resolved');

type Page<Row> = { readonly rows: readonly Row[]; readonly total: number; readonly hasMore: boolean };

/** L'effet immédiat sur une page de la file. */
export function withReportClosed<Row extends { readonly id: string; readonly status: string | null }>(page: Page<Row>, id: string, action: AdminReportAction): Page<Row> {
  return { ...page, rows: page.rows.map((row) => (row.id === id ? { ...row, status: closedStatusOf(action) } : row)) };
}
