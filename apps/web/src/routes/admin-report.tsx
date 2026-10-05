import { useQuery } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminFiche, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { AdminSummaryCard, AdminSummaryGrid } from '@/components/admin/summary-card';
import { sectionOfEntity } from '@/lib/admin/admin-routes';
import { AdminLink } from '@/components/admin/entity-chip';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import { REPORT_ACTIONS, reportActionLinks, reportPersonName, reportReporterOf, reportTurnaround, reportedTargetOf } from '@/lib/admin/report-model';
import {
  ADMIN_REPORT_SECTION_GLYPHS,
  ADMIN_REPORT_SECTION_TITLES,
  ADMIN_REPORT_SECTIONS,
  reportSummaryOf,
  type AdminReportSection,
} from '@/lib/admin/report-summaries';
import { reportLabel } from '@/lib/admin/interpret/labels';
import { useAdminOpen } from '@/lib/admin/use-admin-open';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { ApiError, unwrap } from '@/lib/api/client';
import {
  adminReportKey,
  adminReportSiblingsKey,
  loadAdminReport,
  loadAdminReportSiblings,
} from '@/lib/api/admin-reports';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';
import { href, navigate } from '@/routes/route-table';

import { ReportGestures } from './admin-report-gestures';
import { ReportReasonBadge, ReportStatusBadge } from './admin-report-parts';
import {
  ActionsSection,
  HandlingSection,
  ReasonSection,
  ReportActionChoice,
  ReportMeta,
  ReportedSection,
  SiblingsSection,
  TimelineSection,
} from './admin-report-sections';

/**
 * **LA FICHE D'UN SIGNALEMENT** (#8876, #6726) — `/admin/reports/$report`.
 *
 * Ce qu'un modérateur doit savoir pour DÉCIDER sans quitter la page : ce qui est
 * signalé (nommé, avec son extrait — « Contenu protégé » quand l'auteur l'a
 * rendu privé), pourquoi et par qui, où en est le dossier, quelle est sa
 * chronologie, ce que les autres signalements du même élément disent. Puis les
 * six gestes que la passerelle sert, et des LIENS vers les fiches où l'on agit
 * (bannir, retirer, lire) — le signalement ne duplique aucun de ces gestes.
 *
 * **Lue par sections** (spec 2026-10-04 § 3) : l'en-tête, les gestes, le bandeau
 * de chiffres et les métadonnées restent visibles ; les six blocs sont des
 * cartes résumées qui ouvrent chacun sa modale (`?open=<id>`). L'action à
 * consigner se choisit sur la carte « Traitement » : la décision ne se cache pas.
 *
 * Fail-closed comme la liste : `canModerateContent` (décision #6843) ; un 403
 * malgré tout se rend comme un refus, un 404 comme « ce signalement n'existe
 * plus » — jamais comme une panne.
 */
const defaultNow = (): Date => new Date();

const isAction = (value: string | null): value is (typeof REPORT_ACTIONS)[number] => REPORT_ACTIONS.some((action) => action === value);

type ReportPanelProps = {
  readonly language: AdminLanguage;
  readonly reportId: string;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminReportPanel({ language, reportId, deps = apiDeps, now = defaultNow }: ReportPanelProps) {
  const reach = useAdminReach();
  const online = useOnline();
  const announcer = useLiveAnnouncer();
  const session = useStore(sessionStore, (state) => state.session);
  const viewerId = resolveViewer({ source: deps.source, session }).id;
  const [choice, setChoice] = useState<string | null>(null);
  const sections = useAdminOpen(ADMIN_REPORT_SECTIONS);
  const cardsTitle = useId();

  const query = useQuery({
    queryKey: adminReportKey(reportId),
    queryFn: async ({ signal }) => unwrap(await loadAdminReport({ ...deps, reportId, signal })),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const report = query.data;

  const siblings = useQuery({
    queryKey: adminReportSiblingsKey(report?.reportedType ?? '', report?.reportedEntityId ?? ''),
    queryFn: async ({ signal }) => {
      if (report === undefined) throw new Error('signalement non chargé');
      return unwrap(await loadAdminReportSiblings({ ...deps, type: report.reportedType, entityId: report.reportedEntityId, signal }));
    },
    enabled: report !== undefined,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const listTarget = { kind: 'section', section: 'reports' } as const;

  if (report === undefined) {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={translateAdmin(language, 'admin.moderation.fiche.loading')} data-admin-report-loading>
          <AdminSkeleton rows={4} />
        </div>
      );
    }
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 403) return <AdminDeniedInline language={language} />;
    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="flag"
          title={translateAdmin(language, 'admin.moderation.fiche.notFound')}
          hint={translateAdmin(language, 'admin.moderation.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.moderation.fiche.back')}
            </AdminLink>
          }
        />
      );
    }
    return <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
  }

  const clock = now();
  const title = reportLabel({ type: report.reportType }, language);
  const target = reportedTargetOf(report, language);
  const reporterName = reportPersonName(reportReporterOf(report, language), language);
  const received = adminMomentOf(report.createdAt, clock, language);
  const turnaround = reportTurnaround(report, clock);
  const open = report.status === 'pending' || report.status === 'under_review';
  const actionChoice = choice ?? (isAction(report.actionTaken) ? report.actionTaken : 'none');
  const onEntity = siblings.data?.total;
  const actionLinks = reportActionLinks(report, language).filter((link) => link.target.kind === 'entity' && reach.opens(sectionOfEntity(link.target.entity))).length;
  const siblingsStatus = siblings.error instanceof ApiError ? siblings.error.status : 0;
  const cardState = (section: AdminReportSection): 'ready' | 'loading' | 'error' | 'denied' => {
    if (section !== 'siblings' || siblings.data !== undefined) return 'ready';
    if (siblings.isPending) return 'loading';
    return siblingsStatus === 403 ? 'denied' : 'error';
  };

  /** Le contenu de chaque modale : le bloc d'hier, tel quel — monté seulement à l'ouverture. */
  const detail = (section: AdminReportSection): ReactNode => {
    switch (section) {
      case 'reported':
        return <ReportedSection language={language} report={report} />;
      case 'reason':
        return <ReasonSection language={language} report={report} />;
      case 'handling':
        return <HandlingSection language={language} report={report} />;
      case 'timeline':
        return <TimelineSection language={language} report={report} now={clock} />;
      case 'siblings':
        return <SiblingsSection language={language} report={report} siblings={siblings} now={clock} />;
      case 'actions':
        return <ActionsSection language={language} report={report} reach={reach} />;
    }
  };

  const stats = [
    { id: 'received', label: translateAdmin(language, 'admin.moderation.stat.received'), value: received?.relative ?? '—' },
    ...(turnaround === null
      ? []
      : [
          {
            id: 'turnaround',
            label: translateAdmin(language, turnaround.kind === 'closed' ? 'admin.moderation.stat.handledIn' : 'admin.moderation.stat.openFor'),
            value: formatDuration(turnaround.milliseconds, 'ms', language),
          },
        ]),
    {
      id: 'onEntity',
      label: translateAdmin(language, 'admin.moderation.stat.onEntity'),
      value: onEntity === undefined ? '—' : formatCount(onEntity, language),
      target: { kind: 'section', section: 'reports', search: { reportedEntityId: report.reportedEntityId } } as const,
    },
  ];

  return (
    <div className="grid gap-6" data-admin-report-fiche>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.moderation') },
          { label: translateAdmin(language, 'admin.nav.reports'), target: listTarget },
          { label: title },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="report"
        header={
          <AdminIdentityHeader
            language={language}
            title={target.ref.label}
            secondary={translateAdmin(language, 'admin.moderation.fiche.received', { reporter: reporterName, when: received?.relative ?? '—' })}
            glyph="flag"
            badges={
              <>
                <ReportStatusBadge language={language} status={report.status} />
                <ReportReasonBadge language={language} reportType={report.reportType} />
              </>
            }
            actions={
              <ReportGestures
                language={language}
                report={report}
                deps={deps}
                viewerId={viewerId}
                actionChoice={actionChoice}
                online={online}
                announce={announcer.announce}
                onDeleted={() => navigate(href(reach.space === 'adm' ? 'admReports' : 'adminReports'))}
              />
            }
          />
        }
        stats={<AdminStatStrip items={stats} />}
        aside={<ReportMeta language={language} report={report} now={clock} onAnnounce={announcer.announce} />}
      >
        <section aria-labelledby={cardsTitle} className="@container grid gap-3" data-admin-report-cards>
          <h2 id={cardsTitle} className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateAdmin(language, 'admin.moderation.cards.title')}
          </h2>
          <AdminSummaryGrid>
            {ADMIN_REPORT_SECTIONS.map((section) => {
              const summary = reportSummaryOf(section, report, { siblingsTotal: onEntity, actionLinks }, language);
              return (
                <AdminSummaryCard
                  key={section}
                  language={language}
                  id={section}
                  title={translateAdmin(language, ADMIN_REPORT_SECTION_TITLES[section])}
                  glyph={ADMIN_REPORT_SECTION_GLYPHS[section]}
                  values={summary.values}
                  sentence={summary.sentence}
                  state={cardState(section)}
                  {...(section === 'siblings' ? { onRetry: () => void siblings.refetch() } : {})}
                  onOpen={() => sections.open(section)}
                >
                  {section === 'handling' && open ? <ReportActionChoice language={language} actionChoice={actionChoice} onActionChoice={setChoice} /> : null}
                </AdminSummaryCard>
              );
            })}
          </AdminSummaryGrid>
        </section>
      </AdminFiche>
      {ADMIN_REPORT_SECTIONS.map((section) => (
        <AdminDetailSheet
          key={section}
          language={language}
          id={`report-${section}`}
          title={translateAdmin(language, ADMIN_REPORT_SECTION_TITLES[section])}
          open={sections.active === section}
          onClose={sections.close}
          inAddress={sections.inAddress}
        >
          <div className="grid gap-6" data-admin-report-panel={section}>
            {detail(section)}
          </div>
        </AdminDetailSheet>
      ))}
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminReportScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { report: reportId } = useParams<'/admin/reports/$report'>();

  return (
    <AdminSectionScreen section="reports" language={language} title={translateAdmin(language, 'admin.nav.reports')}>
      {() => <AdminReportPanel language={language} reportId={reportId} />}
    </AdminSectionScreen>
  );
}
