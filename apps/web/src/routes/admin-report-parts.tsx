import { AdminEntityChip, AdminEntityIdentity } from '@/components/admin/entity-chip';
import type { AdminReport } from '@/lib/api/admin-reports';
import { interpretReportStatus, interpretReportType } from '@/lib/admin/interpret/enums';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { reportedTargetOf, type ReportPersonView } from '@/lib/admin/report-model';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

/**
 * **LES PIÈCES PARTAGÉES DE LA LISTE ET DE LA FICHE DES SIGNALEMENTS** (#8876,
 * #6726) — un signalant, un modérateur, l'élément signalé, le statut et le
 * motif se PEIGNENT de la même façon partout : le même nom, la même puce, le
 * même badge. Aucun identifiant n'y est jamais écrit.
 */

/** Une personne d'un signalement : la puce nommée (lien vers sa fiche), ou le mot qui dit pourquoi il n'y en a pas. */
export function ReportPerson({ language, view, size = 'sm' }: { readonly language: InterfaceLanguage; readonly view: ReportPersonView; readonly size?: 'sm' | 'md' }) {
  switch (view.kind) {
    case 'person':
      return <AdminEntityChip language={language} entity={view.ref} size={size} />;
    case 'named':
      return <span style={{ color: INK }}>{view.name}</span>;
    case 'anonymous':
      return <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.reporter.anonymous')}</span>;
    case 'gone':
      return <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.person.gone')}</span>;
    case 'none':
      return <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.moderator.none')}</span>;
  }
}

/**
 * L'élément signalé. Dans la colonne PRIMAIRE d'une liste, la liste enveloppe
 * elle-même la cellule dans le lien vers la fiche du signalement : un lien dans
 * un lien n'est pas du HTML valide, donc l'identité est rendue SANS lien
 * (`primary`). Partout ailleurs la puce ouvre la fiche de l'élément, quand il en
 * a une.
 */
export function ReportedElement({
  language,
  report,
  primary = false,
}: {
  readonly language: InterfaceLanguage;
  readonly report: AdminReport;
  readonly primary?: boolean;
}) {
  const target = reportedTargetOf(report, language);
  if (primary || !target.linkable) return <AdminEntityIdentity language={language} entity={target.ref} />;
  return <AdminEntityChip language={language} entity={target.ref} />;
}

export const ReportStatusBadge = ({ language, status }: { readonly language: InterfaceLanguage; readonly status: string }) => (
  <AdminInterpretedBadge value={interpretReportStatus(status, language)} />
);

export const ReportReasonBadge = ({ language, reportType }: { readonly language: InterfaceLanguage; readonly reportType: string }) => (
  <AdminInterpretedBadge value={interpretReportType(reportType, language)} />
);
