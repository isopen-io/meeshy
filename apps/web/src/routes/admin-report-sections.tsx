import type { UseQueryResult } from '@tanstack/react-query';

import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { AdminBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminLink } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminDeniedInline, AdminInlineNotice } from '@/components/admin/states';
import { TONE_COLOR, toneBackground } from '@/components/admin/tone';
import { sectionOfEntity } from '@/lib/admin/admin-routes';
import { interpretReportAction, interpretReportStatus, interpretReportedEntity } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import {
  REPORT_ACTIONS,
  reportActionLinks,
  reportModeratorOf,
  reportPersonName,
  reportReporterOf,
  reportTimeline,
  reportedConversationOf,
  reportedOwnerOf,
  type ReportActionLink,
  type ReportTimelineStep,
} from '@/lib/admin/report-model';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { ApiError } from '@/lib/api/client';
import type { AdminPage } from '@/lib/api/admin-page';
import type { AdminReport } from '@/lib/api/admin-reports';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { ReportPerson, ReportReasonBadge, ReportStatusBadge, ReportedElement } from './admin-report-parts';

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const EDGE = 'var(--color-edge)';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * **LES BLOCS DE LA FICHE D'UN SIGNALEMENT** (#8876, #6726) — le contenu signalé
 * (extrait conscient de la protection), le motif, le traitement, la chronologie,
 * les signalements voisins, les fiches où agir, les métadonnées interprétées.
 *
 * Chaque bloc dit ce qu'il sait ET ce qu'il ne sait pas : un extrait `null` AVEC
 * protection se dit « Contenu protégé » (jamais un vide), une date de prise en
 * charge qui n'a pas été conservée se dit, un compte disparu se dit.
 */
const moment = (iso: string | null, now: Date, language: InterfaceLanguage) => adminMomentOf(iso, now, language);

const CONTENT_KINDS: readonly string[] = ['message', 'post', 'story', 'comment'];

function ReportedBody({ language, report }: { readonly language: InterfaceLanguage; readonly report: AdminReport }) {
  const entity = report.reportedEntity;
  if (entity === null) return <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.moderation.reported.unavailable')} />;
  if (entity.deleted) return <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.moderation.reported.deleted')} />;
  if (entity.isProtected) {
    return (
      <div data-admin-protected className="grid gap-2">
        <span>
          <AdminBadge tone="neutral" glyph="lock">
            {translateAdmin(language, 'admin.moderation.reported.protected')}
          </AdminBadge>
        </span>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.moderation.reported.protectedHint')}
        </p>
      </div>
    );
  }
  if (entity.excerpt !== null) {
    return (
      <figure className="grid gap-1">
        <figcaption className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.moderation.reported.excerpt')}
        </figcaption>
        <blockquote
          data-admin-excerpt
          dir="auto"
          className="whitespace-pre-wrap break-words rounded-card px-4 py-3 text-body"
          style={{ color: INK, borderInlineStart: `3px solid ${EDGE}`, backgroundColor: toneBackground('neutral') }}
        >
          {entity.excerpt}
        </blockquote>
      </figure>
    );
  }
  return CONTENT_KINDS.includes(report.reportedType) ? (
    <p className="text-caption" style={{ color: INK2 }}>
      {translateAdmin(language, 'admin.moderation.reported.noText')}
    </p>
  ) : null;
}

export function ReportedSection({ language, report }: { readonly language: InterfaceLanguage; readonly report: AdminReport }) {
  const owner = reportedOwnerOf(report, language);
  const conversation = reportedConversationOf(report, language);
  const creator = report.reportedType === 'community';

  return (
    <AdminFicheSection id="reported" title={translateAdmin(language, 'admin.moderation.section.reported')}>
      <ReportedElement language={language} report={report} />
      <ReportedBody language={language} report={report} />
      <dl className="grid gap-3">
        <AdminMetaRow anchor="reportedKind" label={translateAdmin(language, 'admin.moderation.reported.kind')} value={interpretReportedEntity(report.reportedType, language).label} />
        {owner === null ? null : (
          <AdminMetaRow
            anchor="reportedOwner"
            label={translateAdmin(language, creator ? 'admin.moderation.reported.creator' : 'admin.moderation.reported.author')}
            value={<ReportPerson language={language} view={owner} />}
          />
        )}
        {conversation === null ? null : (
          <AdminMetaRow
            anchor="reportedConversation"
            label={translateAdmin(language, 'admin.moderation.reported.conversation')}
            value={<AdminEntityChip language={language} entity={conversation} size="sm" />}
          />
        )}
      </dl>
    </AdminFicheSection>
  );
}

export function ReasonSection({ language, report }: { readonly language: InterfaceLanguage; readonly report: AdminReport }) {
  return (
    <AdminFicheSection id="reason" title={translateAdmin(language, 'admin.moderation.section.reason')}>
      <dl className="grid gap-3">
        <AdminMetaRow anchor="reason" label={translateAdmin(language, 'admin.moderation.reason.type')} value={<ReportReasonBadge language={language} reportType={report.reportType} />} />
        <AdminMetaRow
          anchor="reporter"
          label={translateAdmin(language, 'admin.moderation.reason.reporter')}
          value={<ReportPerson language={language} view={reportReporterOf(report, language)} size="md" />}
        />
        <AdminMetaRow
          anchor="freeReason"
          label={translateAdmin(language, 'admin.moderation.reason.free')}
          value={
            report.reason === null ? (
              <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.reason.none')}</span>
            ) : (
              <span dir="auto" className="whitespace-pre-wrap">
                {report.reason}
              </span>
            )
          }
        />
      </dl>
    </AdminFicheSection>
  );
}

export function HandlingSection({
  language,
  report,
  editable,
  actionChoice,
  onActionChoice,
}: {
  readonly language: InterfaceLanguage;
  readonly report: AdminReport;
  readonly editable: boolean;
  readonly actionChoice: string;
  readonly onActionChoice: (action: string) => void;
}) {
  const status = interpretReportStatus(report.status, language);
  const recorded = report.actionTaken === null ? null : interpretReportAction(report.actionTaken, language);

  return (
    <AdminFicheSection id="handling" title={translateAdmin(language, 'admin.moderation.section.handling')}>
      <dl className="grid gap-3">
        <AdminMetaRow
          anchor="status"
          label={translateAdmin(language, 'admin.moderation.handling.status')}
          value={<ReportStatusBadge language={language} status={report.status} />}
          explain={status.explain}
        />
        <AdminMetaRow
          anchor="moderator"
          label={translateAdmin(language, 'admin.moderation.handling.moderator')}
          value={<ReportPerson language={language} view={reportModeratorOf(report, language)} size="md" />}
        />
        <AdminMetaRow
          anchor="notes"
          label={translateAdmin(language, 'admin.moderation.handling.notes')}
          value={
            report.moderatorNotes === null ? (
              <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.handling.notesNone')}</span>
            ) : (
              <span dir="auto" className="whitespace-pre-wrap">
                {report.moderatorNotes}
              </span>
            )
          }
        />
        <AdminMetaRow
          anchor="actionTaken"
          label={translateAdmin(language, 'admin.moderation.handling.action')}
          value={
            recorded === null ? (
              <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.moderation.handling.actionNone')}</span>
            ) : (
              <AdminBadge tone={recorded.tone}>{recorded.label}</AdminBadge>
            )
          }
          explain={recorded?.explain ?? null}
        />
      </dl>
      {editable ? (
        <label className="grid gap-1">
          <span className="text-caption font-medium" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.moderation.handling.actionChoice')}
          </span>
          <select
            data-admin-action-choice
            value={actionChoice}
            onChange={(event) => onActionChoice(event.target.value)}
            className={`rounded-chip px-3 text-body ${FOCUS}`}
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: `1px solid ${EDGE}`, color: INK, outlineColor: 'var(--color-ios-brand)' }}
          >
            {REPORT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {interpretReportAction(action, language).label}
              </option>
            ))}
          </select>
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.moderation.handling.actionHint')}
          </span>
        </label>
      ) : null}
    </AdminFicheSection>
  );
}

const STEP_GLYPH = { resolved: 'checkCircle', rejected: 'x', dismissed: 'prohibit' } as const satisfies Readonly<Record<string, AdminGlyphName>>;

function StepView({ language, report, step, now }: { readonly language: InterfaceLanguage; readonly report: AdminReport; readonly step: ReportTimelineStep; readonly now: Date }) {
  const when = moment(step.at, now, language);
  const tone = step.id === 'closed' ? interpretReportStatus(step.status, language).tone : 'neutral';
  const glyph: AdminGlyphName = step.id === 'received' ? 'flag' : step.id === 'taken' ? 'eye' : STEP_GLYPH[step.status];
  const label =
    step.id === 'received'
      ? translateAdmin(language, 'admin.moderation.timeline.received')
      : step.id === 'taken'
        ? translateAdmin(language, 'admin.moderation.timeline.taken', { moderator: reportPersonName(reportModeratorOf(report, language), language) })
        : translateAdmin(language, 'admin.moderation.timeline.closed', { status: interpretReportStatus(step.status, language).label });

  return (
    <li data-admin-timeline-step={step.id} className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full" style={{ backgroundColor: toneBackground(tone), color: TONE_COLOR[tone] }}>
        <AdminGlyph name={glyph} size={16} />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="break-words text-body font-medium" style={{ color: INK }}>
          {label}
        </p>
        <p className="text-caption" style={{ color: INK2 }}>
          {step.at === null ? translateAdmin(language, 'admin.moderation.timeline.takenUndated') : <AdminMomentText moment={when} variant="both" />}
        </p>
      </div>
    </li>
  );
}

export function TimelineSection({ language, report, now }: { readonly language: InterfaceLanguage; readonly report: AdminReport; readonly now: Date }) {
  return (
    <AdminFicheSection id="timeline" title={translateAdmin(language, 'admin.moderation.section.timeline')}>
      <ol data-admin-timeline className="grid gap-4">
        {reportTimeline(report).map((step) => (
          <StepView key={step.id} language={language} report={report} step={step} now={now} />
        ))}
      </ol>
    </AdminFicheSection>
  );
}

export function SiblingsSection({
  language,
  report,
  siblings,
  now,
}: {
  readonly language: InterfaceLanguage;
  readonly report: AdminReport;
  readonly siblings: UseQueryResult<AdminPage<AdminReport>>;
  readonly now: Date;
}) {
  const page = siblings.data;
  const others = page === undefined ? [] : page.rows.filter((row) => row.id !== report.id);

  const body = () => {
    if (page === undefined) {
      if (siblings.isPending) return <div data-admin-siblings-loading aria-hidden="true" className="h-16 rounded-card" style={{ backgroundColor: toneBackground('neutral') }} />;
      return siblings.error instanceof ApiError && siblings.error.status === 403 ? (
        <AdminDeniedInline language={language} />
      ) : (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.moderation.siblings.error')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void siblings.refetch()}
              className={`rounded-chip px-3 text-caption font-medium ${FOCUS}`}
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      );
    }
    if (others.length === 0) {
      return (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.moderation.siblings.none')}
        </p>
      );
    }
    return (
      <ul className="grid gap-2">
        {others.map((row) => (
          <li key={row.id} data-admin-sibling={row.id}>
            <AdminLink
              target={{ kind: 'entity', entity: 'report', id: row.id }}
              className={`flex flex-wrap items-center gap-2 rounded-card px-3 py-2 ${FOCUS}`}
              style={{ minHeight: 44, border: `1px solid ${EDGE}`, color: INK }}
            >
              <ReportReasonBadge language={language} reportType={row.reportType} />
              <ReportStatusBadge language={language} status={row.status} />
              <span className="min-w-0 flex-1 truncate text-caption" style={{ color: INK2 }}>
                {reportPersonName(reportReporterOf(row, language), language)}
              </span>
              <span className="text-caption" style={{ color: INK2 }}>
                <AdminMomentText moment={moment(row.createdAt, now, language)} />
              </span>
            </AdminLink>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <AdminFicheSection id="siblings" title={translateAdmin(language, 'admin.moderation.section.siblings')}>
      {body()}
      {page !== undefined && page.total > 1 ? (
        <AdminLink
          target={{ kind: 'section', section: 'reports', search: { reportedEntityId: report.reportedEntityId } }}
          anchor="see-all"
          className={`inline-flex w-fit items-center gap-2 rounded-chip px-3 text-body font-medium ${FOCUS}`}
          style={{ minHeight: 44, color: 'var(--color-ios-brand)' }}
        >
          {translateAdmin(language, 'admin.moderation.siblings.seeAll', { count: formatCount(page.total, language) })}
        </AdminLink>
      ) : null}
    </AdminFicheSection>
  );
}

function actionLabel(language: InterfaceLanguage, link: ReportActionLink): string {
  switch (link.id) {
    case 'authorSecurity':
      return translateAdmin(language, 'admin.moderation.actions.authorSecurity', { name: link.name });
    case 'memberSecurity':
      return translateAdmin(language, 'admin.moderation.actions.memberSecurity');
    case 'post':
      return translateAdmin(language, 'admin.moderation.actions.post');
    case 'conversationReading':
      return translateAdmin(language, 'admin.moderation.actions.conversationReading');
    case 'conversation':
      return translateAdmin(language, 'admin.moderation.actions.conversation');
    case 'community':
      return translateAdmin(language, 'admin.moderation.actions.community');
  }
}

/**
 * **AGIR, C'EST OUVRIR LA BONNE FICHE** — le signalement ne bannit, ne retire et
 * ne lit rien lui-même. Chaque lien mène à la fiche qui porte le geste, sa
 * confirmation, son motif et sa trace d'audit ; un lien que le lecteur ne pourrait
 * pas ouvrir (section non servie à son rôle) n'est pas dessiné.
 */
export function ActionsSection({ language, report, reach }: { readonly language: InterfaceLanguage; readonly report: AdminReport; readonly reach: AdminReach }) {
  const links = reportActionLinks(report, language).filter((link) => link.target.kind === 'entity' && reach.opens(sectionOfEntity(link.target.entity)));

  return (
    <AdminFicheSection id="actions" title={translateAdmin(language, 'admin.moderation.section.actions')}>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.moderation.actions.hint')}
      </p>
      {links.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.moderation.actions.none')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {links.map((link) => (
            <li key={link.id}>
              <AdminLink
                target={link.target}
                anchor={link.id}
                className={`flex items-center justify-between gap-3 rounded-card px-4 py-2 ${FOCUS}`}
                style={{ minHeight: 44, border: `1px solid ${EDGE}`, color: INK }}
              >
                <span className="min-w-0 break-words text-body font-medium">{actionLabel(language, link)}</span>
                <AdminGlyph name="arrowSquareOut" size={16} className="shrink-0 rtl:-scale-x-100" />
              </AdminLink>
            </li>
          ))}
        </ul>
      )}
    </AdminFicheSection>
  );
}

export function ReportMeta({
  language,
  report,
  now,
  onAnnounce,
}: {
  readonly language: InterfaceLanguage;
  readonly report: AdminReport;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const status = interpretReportStatus(report.status, language);
  const resolved = report.status === 'resolved' || report.status === 'rejected' ? report.resolvedAt : null;
  const resolvedNote =
    report.status === 'dismissed'
      ? translateAdmin(language, 'admin.moderation.meta.resolvedDismissed')
      : report.status === 'pending' || report.status === 'under_review'
        ? translateAdmin(language, 'admin.moderation.meta.resolvedOpen')
        : null;

  return (
    <AdminMetaPanel title={translateAdmin(language, 'admin.moderation.meta.title')}>
      <AdminMetaRow anchor="status" label={translateAdmin(language, 'admin.moderation.meta.status')} value={<ReportStatusBadge language={language} status={report.status} />} explain={status.explain} />
      <AdminMetaRow anchor="reason" label={translateAdmin(language, 'admin.moderation.meta.reason')} value={<ReportReasonBadge language={language} reportType={report.reportType} />} />
      <AdminMetaRow anchor="kind" label={translateAdmin(language, 'admin.moderation.meta.kind')} value={interpretReportedEntity(report.reportedType, language).label} />
      <AdminMetaRow anchor="received" label={translateAdmin(language, 'admin.moderation.meta.received')} value={<AdminMomentText moment={moment(report.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow anchor="updated" label={translateAdmin(language, 'admin.moderation.meta.updated')} value={<AdminMomentText moment={moment(report.updatedAt, now, language)} variant="both" />} />
      <AdminMetaRow
        anchor="resolved"
        label={translateAdmin(language, 'admin.moderation.meta.resolved')}
        value={<AdminMomentText moment={moment(resolved, now, language)} variant="both" />}
        explain={resolvedNote}
      />
      <AdminTechnicalId language={language} id={report.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}
