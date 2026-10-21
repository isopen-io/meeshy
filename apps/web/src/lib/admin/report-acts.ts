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

/** Ce qu'il faut d'un signalement servi pour savoir s'il vise le lecteur. */
export type ReportTarget = {
  readonly reportedType: string | null;
  readonly reportedEntityId: string;
  readonly reportedEntity?: { readonly owner: { readonly id: string } | null } | null;
};

/**
 * **UN MODÉRATEUR NE TRAITE PAS UN SIGNALEMENT QUI VISE SON PROPRE CONTENU** (#10458) —
 * la passerelle refuse (`SELF_MODERATION`) ; l'écran le dit AVANT le geste. Un
 * signalement de compte vise le compte ; tout autre contenu vise son propriétaire
 * servi. Sans propriétaire servi (tableau de bord, entité disparue) ou sans lecteur
 * connu, l'écran ne devine rien : le bouton reste, la passerelle tranche.
 */
export function reportTargetsViewer(report: ReportTarget, viewerId: string | null): boolean {
  if (viewerId === null) return false;
  if (report.reportedType === 'user') return report.reportedEntityId === viewerId;
  return report.reportedEntity?.owner?.id === viewerId;
}

export const closedStatusOf = (action: AdminReportAction): 'resolved' | 'dismissed' => (action === 'dismiss' ? 'dismissed' : 'resolved');

type Page<Row> = { readonly rows: readonly Row[]; readonly total: number; readonly hasMore: boolean };

/** L'effet immédiat sur une page de la file. */
export function withReportClosed<Row extends { readonly id: string; readonly status: string | null }>(page: Page<Row>, id: string, action: AdminReportAction): Page<Row> {
  return { ...page, rows: page.rows.map((row) => (row.id === id ? { ...row, status: closedStatusOf(action) } : row)) };
}
