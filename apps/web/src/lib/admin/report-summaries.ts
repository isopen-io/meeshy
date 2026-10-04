import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminReport } from '@/lib/api/admin-reports';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { interpretReportAction, interpretReportStatus, interpretReportType, interpretReportedEntity } from './interpret/enums';
import { excerptOf } from './interpret/labels';
import { formatCount } from './interpret/numbers';
import { reportModeratorOf, reportPersonName, reportReporterOf, reportTimeline, reportedOwnerOf, type ReportTimelineStep } from './report-model';

/**
 * **LA FICHE D'UN SIGNALEMENT, EN CARTES** (spec 2026-10-04 § 3, lot
 * « Modération, croissance, plateforme ») — l'en-tête, les gestes, le bandeau
 * de chiffres et les métadonnées restent visibles ; les six blocs d'hier
 * (contenu signalé, motif, traitement, chronologie, signalements voisins,
 * fiches où agir) deviennent des cartes résumées qui ouvrent leur bloc dans une
 * modale (`?open=<id>`).
 *
 * Les cartes ne lisent que ce qui est déjà là : la fiche, la page des voisins
 * (déjà lue pour le bandeau) et le nombre de fiches liées que le lecteur peut
 * ouvrir.
 */
export const ADMIN_REPORT_SECTIONS = ['reported', 'reason', 'handling', 'timeline', 'siblings', 'actions'] as const;

export type AdminReportSection = (typeof ADMIN_REPORT_SECTIONS)[number];

export const ADMIN_REPORT_SECTION_TITLES = {
  reported: 'admin.moderation.section.reported',
  reason: 'admin.moderation.section.reason',
  handling: 'admin.moderation.section.handling',
  timeline: 'admin.moderation.section.timeline',
  siblings: 'admin.moderation.section.siblings',
  actions: 'admin.moderation.section.actions',
} as const satisfies Readonly<Record<AdminReportSection, AdminPlainCatalogKey>>;

export const ADMIN_REPORT_SECTION_GLYPHS = {
  reported: 'flag',
  reason: 'chats',
  handling: 'shieldCheck',
  timeline: 'clock',
  siblings: 'list',
  actions: 'arrowSquareOut',
} as const satisfies Readonly<Record<AdminReportSection, AdminGlyphName>>;

/** Une étape de la chronologie, dite en mots — la même phrase dans la carte et dans la modale. */
export function reportStepLabel(report: AdminReport, step: ReportTimelineStep, language: AdminLanguage): string {
  switch (step.id) {
    case 'received':
      return translateAdmin(language, 'admin.moderation.timeline.received');
    case 'taken':
      return translateAdmin(language, 'admin.moderation.timeline.taken', { moderator: reportPersonName(reportModeratorOf(report, language), language) });
    case 'closed':
      return translateAdmin(language, 'admin.moderation.timeline.closed', { status: interpretReportStatus(step.status, language).label });
  }
}

export type ReportSummaryContext = {
  /** Le total servi des signalements sur le même élément ; `undefined` tant qu'il n'est pas lu. */
  readonly siblingsTotal: number | undefined;
  /** Les fiches liées que le lecteur peut ouvrir. */
  readonly actionLinks: number;
};

export function reportSummaryOf(
  section: AdminReportSection,
  report: AdminReport,
  context: ReportSummaryContext,
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });

  switch (section) {
    case 'reported': {
      const owner = reportedOwnerOf(report, language);
      const entity = report.reportedEntity;
      const sentence =
        entity === null
          ? t('admin.moderation.reported.unavailable')
          : entity.deleted
            ? t('admin.moderation.reported.deleted')
            : entity.isProtected
              ? t('admin.moderation.reported.protected')
              : excerptOf(entity.excerpt);
      return {
        values: [
          v('admin.moderation.reported.kind', interpretReportedEntity(report.reportedType, language).label),
          ...(owner === null
            ? []
            : [v(report.reportedType === 'community' ? 'admin.moderation.reported.creator' : 'admin.moderation.reported.author', reportPersonName(owner, language))]),
        ],
        sentence,
      };
    }
    case 'reason':
      return {
        values: [
          v('admin.moderation.reason.type', interpretReportType(report.reportType, language).label),
          v('admin.moderation.reason.reporter', reportPersonName(reportReporterOf(report, language), language)),
        ],
        sentence: excerptOf(report.reason) ?? t('admin.moderation.reason.none'),
      };
    case 'handling':
      return {
        values: [
          v('admin.moderation.handling.status', interpretReportStatus(report.status, language).label),
          v('admin.moderation.handling.moderator', reportPersonName(reportModeratorOf(report, language), language)),
          v(
            'admin.moderation.handling.action',
            report.actionTaken === null ? t('admin.moderation.handling.actionNone') : interpretReportAction(report.actionTaken, language).label,
          ),
        ],
        sentence: excerptOf(report.moderatorNotes),
      };
    case 'timeline': {
      const steps = reportTimeline(report);
      const last = steps.at(-1);
      return {
        values: [v('admin.moderation.card.steps', formatCount(steps.length, language))],
        sentence: last === undefined ? null : reportStepLabel(report, last, language),
      };
    }
    case 'siblings':
      return {
        values: [v('admin.moderation.stat.onEntity', context.siblingsTotal === undefined ? '—' : formatCount(context.siblingsTotal, language))],
        sentence: context.siblingsTotal !== undefined && context.siblingsTotal <= 1 ? t('admin.moderation.siblings.none') : null,
      };
    case 'actions':
      return {
        values: [v('admin.moderation.card.links', formatCount(context.actionLinks, language))],
        sentence: context.actionLinks === 0 ? t('admin.moderation.actions.none') : null,
      };
  }
}
