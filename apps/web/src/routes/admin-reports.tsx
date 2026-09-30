import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { interpretReportStatus, interpretReportType, interpretReportedEntity } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { ADMIN_PERIODS } from '@/lib/admin/period';
import {
  REPORTED_KINDS,
  REPORT_ASSIGNMENTS,
  REPORT_LIST_SPEC,
  REPORT_STATUSES,
  REPORT_TYPES,
  reportListQuery,
  type ReportFilterKey,
  type ReportIdFilterKey,
  type ReportSortKey,
} from '@/lib/admin/report-list';
import { reportModeratorOf, reportReporterOf } from '@/lib/admin/report-model';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminDeps } from '@/lib/api/admin';
import { adminReportsListKey, loadAdminReports, type AdminReport } from '@/lib/api/admin-reports';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import type { AdminOption } from '@/routes/admin-table';

import { ReportPerson, ReportReasonBadge, ReportStatusBadge, ReportedElement } from './admin-report-parts';
import { AdminReportsStats } from './admin-reports-stats';

/**
 * **LES SIGNALEMENTS** (#8876, #6726) — la file de modération : ce que la
 * communauté a signalé, qui l'a signalé, qui le traite, où en est le dossier.
 *
 * Le seuil de la section est celui de ses dix routes, `canModerateContent`
 * (décision #6843, option C) : un lecteur qui ne le porte ni ne voit la tuile,
 * ni n'ouvre l'écran (`AdminSectionScreen` rend alors le refus unique). Ce que
 * le bandeau et la liste servent — noms, extraits, statistiques — n'exige rien de
 * plus que cette capacité.
 *
 * La liste pose ses filtres dans l'ADRESSE (statut, motif, genre, prise en
 * charge, période, et « tous les signalements qui visent CET élément »), trie
 * sur les trois dates que la passerelle sait trier, pagine par offset ; aucune
 * recherche — la route n'en sert pas. Chaque rangée ouvre la fiche.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type ReportsPanelProps = {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminReportsPanel({ language, deps = apiDeps, now = defaultNow }: ReportsPanelProps) {
  const list = useAdminList<AdminReport, ReportSortKey, ReportFilterKey, ReportIdFilterKey>({
    spec: REPORT_LIST_SPEC,
    queryKey: adminReportsListKey,
    enabled: true,
    staleTime: 30_000,
    load: async (state, signal) => loadAdminReports({ ...deps, query: reportListQuery(state, now()), signal }),
  });

  const all = translateAdmin(language, 'admin.list.all');
  const filter = (id: ReportFilterKey, label: string, options: readonly AdminOption[]): AdminToolbarFilter => ({
    id,
    label,
    value: list.state.filters[id] ?? '',
    options,
    onChange: (value) => list.filter(id, value === '' ? null : value),
  });

  const filters: readonly AdminToolbarFilter[] = [
    filter('status', translateAdmin(language, 'admin.moderation.filter.status'), [
      option('', all),
      ...REPORT_STATUSES.map((status) => option(status, interpretReportStatus(status, language).label)),
    ]),
    filter('reportType', translateAdmin(language, 'admin.moderation.filter.reportType'), [
      option('', all),
      ...REPORT_TYPES.map((type) => option(type, interpretReportType(type, language).label)),
    ]),
    filter('reportedType', translateAdmin(language, 'admin.moderation.filter.reportedType'), [
      option('', all),
      ...REPORTED_KINDS.map((kind) => option(kind, interpretReportedEntity(kind, language).label)),
    ]),
    filter('assigned', translateAdmin(language, 'admin.moderation.filter.assigned'), [
      option('', all),
      ...REPORT_ASSIGNMENTS.map((assigned) => option(assigned, translateAdmin(language, assigned === 'me' ? 'admin.moderation.filter.assigned.me' : 'admin.moderation.filter.assigned.none'))),
    ]),
    filter('period', translateAdmin(language, 'admin.moderation.filter.period'), [
      option('', translateAdmin(language, 'admin.moderation.filter.period.all')),
      ...ADMIN_PERIODS.map((period) => option(period, translateAdmin(language, `admin.kit.period.${period}`))),
    ]),
  ];

  const moment = (iso: string | null) => <AdminMomentText moment={adminMomentOf(iso, now(), language)} />;
  const closedAt = (report: AdminReport) => (report.status === 'resolved' || report.status === 'rejected' ? report.resolvedAt : null);

  const columns: readonly AdminColumn<AdminReport>[] = [
    { id: 'reported', header: translateAdmin(language, 'admin.moderation.col.reported'), primary: true, cell: (row) => <ReportedElement language={language} report={row} primary /> },
    { id: 'reason', header: translateAdmin(language, 'admin.moderation.col.reason'), cell: (row) => <ReportReasonBadge language={language} reportType={row.reportType} /> },
    { id: 'status', header: translateAdmin(language, 'admin.moderation.col.status'), cell: (row) => <ReportStatusBadge language={language} status={row.status} /> },
    { id: 'reporter', header: translateAdmin(language, 'admin.moderation.col.reporter'), cell: (row) => <ReportPerson language={language} view={reportReporterOf(row, language)} /> },
    { id: 'moderator', header: translateAdmin(language, 'admin.moderation.col.moderator'), priority: 3, cell: (row) => <ReportPerson language={language} view={reportModeratorOf(row, language)} /> },
    { id: 'received', header: translateAdmin(language, 'admin.moderation.col.received'), sortKey: 'createdAt', cell: (row) => moment(row.createdAt) },
    { id: 'resolved', header: translateAdmin(language, 'admin.moderation.col.resolved'), sortKey: 'resolvedAt', priority: 3, cell: (row) => moment(closedAt(row)) },
    { id: 'updated', header: translateAdmin(language, 'admin.moderation.col.updated'), sortKey: 'updatedAt', priority: 3, cell: (row) => moment(row.updatedAt) },
  ];

  const total = list.query.data?.total;
  const scopedToEntity = list.state.ids.reportedEntityId !== undefined;

  return (
    <div className="grid gap-6" data-admin-reports>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.reports')}
        subtitle={translateAdmin(language, 'admin.moderation.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.moderation') }, { label: translateAdmin(language, 'admin.nav.reports') }]}
      />
      <AdminOfflineNotice language={language} />
      <AdminReportsStats language={language} deps={deps} />
      {scopedToEntity ? (
        <AdminInlineNotice
          tone="info"
          text={translateAdmin(language, 'admin.moderation.list.onEntity')}
          action={
            <button
              type="button"
              data-admin-list-reset
              onClick={list.reset}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.moderation.list.onEntityReset')}
            </button>
          }
        />
      ) : null}
      <AdminEntityList
        language={language}
        section="reports"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'report', id: row.id })}
        caption={translateAdmin(language, 'admin.moderation.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.moderation.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.moderation.list.empty'), hint: translateAdmin(language, 'admin.moderation.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.moderation.list.filteredEmpty') }}
      />
    </div>
  );
}

export default function AdminReportsScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="reports" language={language} title={translateAdmin(language, 'admin.nav.reports')}>
      {() => <AdminReportsPanel language={language} />}
    </AdminSectionScreen>
  );
}
