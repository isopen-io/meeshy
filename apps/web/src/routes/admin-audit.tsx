import { useState } from 'react';

import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { BRAND } from '@/components/admin/tone';
import { AUDIT_ENTITIES, AUDIT_LIST_SPEC, auditFamilyFilter, type AuditFilterKey, type AuditIdFilterKey, type AuditSortKey } from '@/lib/admin/audit-list';
import { auditEntityLabel, auditPersonRef } from '@/lib/admin/audit-target';
import { useAuditList } from '@/lib/admin/audit-use-list';
import { AUDIT_FILTER_FAMILIES, interpretAuditAction, isAuditFilterFamily } from '@/lib/admin/audit-vocabulary';
import { excerptOf } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { ADMIN_PERIODS } from '@/lib/admin/period';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminAuditEntry } from '@/lib/api/admin-audit';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import type { AdminOption } from '@/routes/admin-table';

import { AuditDetailSheet } from './admin-audit-detail';
import { AuditActionCell, AuditPerson, AuditTarget } from './admin-audit-parts';

/**
 * **LE JOURNAL D'AUDIT** (#8876, #6727) — `/admin/audit` : qui a fait quoi, à qui et
 * pourquoi. Chaque geste d'administration et chaque lecture du privé y laissent une
 * trace ; l'écran les DIT en mots : l'administrateur et la cible en puces nommées, l'action
 * par son libellé (une lecture souveraine porte son badge), le motif en extrait.
 *
 * Filtré par famille d'actions, genre d'élément et période ; trié sur la date ; paginé ;
 * « tout ce que cet administrateur a fait » et « tout ce qui concerne ce membre » depuis
 * la feuille de détail (ou la fiche d'un membre). Chaque rangée ouvre une FEUILLE : le
 * détail d'une entrée n'a pas de route.
 *
 * Seuil de la section : `canViewAuditLogs` — BIGBOSS et AUDIT ; ADMIN ne l'a pas, et
 * l'écran se refuse à lui comme une section inconnue. Le journal ne se garde nulle
 * part : clé souveraine (jamais sur le disque) et `gcTime: 0` (jamais en mémoire au-delà
 * de l'écran).
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type AuditPanelProps = {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminAuditPanel({ language, deps = apiDeps, now = defaultNow }: AuditPanelProps) {
  const list = useAuditList({ deps, enabled: true, now });
  const [selected, setSelected] = useState<AdminAuditEntry | null>(null);

  const family = list.state.filters.family;
  const gaps = family !== undefined && isAuditFilterFamily(family) ? auditFamilyFilter(family).gaps : [];

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'family',
      label: translateAdmin(language, 'admin.audit.filter.family'),
      value: family ?? '',
      options: [
        option('', translateAdmin(language, 'admin.list.all')),
        ...AUDIT_FILTER_FAMILIES.map((candidate) => option(candidate, translateAdmin(language, `admin.audit.family.${candidate}`))),
      ],
      onChange: (value) => list.filter('family', value === '' ? null : value),
    },
    {
      id: 'entity',
      label: translateAdmin(language, 'admin.audit.filter.entity'),
      value: list.state.filters.entity ?? '',
      options: [option('', translateAdmin(language, 'admin.list.all')), ...AUDIT_ENTITIES.map((type) => option(type, auditEntityLabel(type, language)))],
      onChange: (value) => list.filter('entity', value === '' ? null : value),
    },
    {
      id: 'period',
      label: translateAdmin(language, 'admin.audit.filter.period'),
      value: list.state.filters.period ?? '',
      options: [
        option('', translateAdmin(language, 'admin.audit.filter.anyPeriod')),
        ...ADMIN_PERIODS.map((period) => option(period, translateAdmin(language, `admin.kit.period.${period}`))),
      ],
      onChange: (value) => list.filter('period', value === '' ? null : value),
    },
  ];

  const clock = now();

  const columns: readonly AdminColumn<AdminAuditEntry>[] = [
    {
      id: 'when',
      header: translateAdmin(language, 'admin.audit.col.when'),
      sortKey: 'createdAt',
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.createdAt, clock, language)} variant="both" />,
    },
    { id: 'admin', header: translateAdmin(language, 'admin.audit.col.admin'), cell: (row) => <AuditPerson language={language} person={row.admin} /> },
    {
      id: 'action',
      header: translateAdmin(language, 'admin.audit.col.action'),
      primary: true,
      cell: (row) => <AuditActionCell language={language} entry={row} onOpen={setSelected} />,
    },
    { id: 'target', header: translateAdmin(language, 'admin.audit.col.target'), cell: (row) => <AuditTarget language={language} target={row.target} /> },
    {
      id: 'reason',
      header: translateAdmin(language, 'admin.audit.col.reason'),
      priority: 3,
      cell: (row) => <span className="break-words">{excerptOf(row.reason) ?? '—'}</span>,
    },
  ];

  const total = list.query.data?.total;
  const rows = list.query.data?.rows ?? [];
  const adminId = list.state.ids.admin;
  const subjectId = list.state.ids.subject;
  const namedAdmin = adminId === undefined ? null : (rows.find((row) => row.admin?.id === adminId)?.admin ?? null);
  const namedSubject = subjectId === undefined ? null : (rows.find((row) => row.subject?.id === subjectId)?.subject ?? null);

  const resetAction = (
    <button
      type="button"
      data-admin-list-reset
      onClick={list.reset}
      className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
    >
      {translateAdmin(language, 'admin.audit.list.onReset')}
    </button>
  );

  const notice = (tone: 'info', text: string, anchor: string) => (
    <div data-admin-audit-scope={anchor}>
      <AdminInlineNotice tone={tone} text={text} action={resetAction} />
    </div>
  );

  return (
    <div className="grid gap-6" data-admin-audit>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.audit')}
        subtitle={translateAdmin(language, 'admin.audit.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.moderation') }, { label: translateAdmin(language, 'admin.nav.audit') }]}
      />
      <AdminOfflineNotice language={language} />
      {adminId === undefined
        ? null
        : notice(
            'info',
            namedAdmin === null
              ? translateAdmin(language, 'admin.audit.list.onAdminGeneric')
              : translateAdmin(language, 'admin.audit.list.onAdmin', { name: auditPersonRef(namedAdmin, language).label }),
            'admin',
          )}
      {subjectId === undefined
        ? null
        : notice(
            'info',
            namedSubject === null
              ? translateAdmin(language, 'admin.audit.list.onSubjectGeneric')
              : translateAdmin(language, 'admin.audit.list.onSubject', { name: auditPersonRef(namedSubject, language).label }),
            'subject',
          )}
      {gaps.length === 0 ? null : (
        <AdminInlineNotice
          tone="info"
          text={translateAdmin(language, 'admin.audit.filter.gap', {
            actions: new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(gaps.map((code) => interpretAuditAction(code, language).label)),
          })}
        />
      )}
      <AdminEntityList<AdminAuditEntry, AuditSortKey, AuditFilterKey, AuditIdFilterKey>
        language={language}
        section="audit"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={() => null}
        caption={translateAdmin(language, 'admin.audit.list.caption')}
        pageSizes={AUDIT_LIST_SPEC.pageSizes}
        toolbar={
          <AdminListToolbar
            language={language}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.audit.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.audit.list.empty'), hint: translateAdmin(language, 'admin.audit.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.audit.list.filteredEmpty') }}
      />
      {selected === null ? null : <AuditDetailSheet language={language} entry={selected} now={clock} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default function AdminAuditScreen() {
  const language = currentInterfaceLanguage();

  return (
    <AdminSectionScreen section="audit" language={language} title={translateAdmin(language, 'admin.nav.audit')}>
      {() => <AdminAuditPanel language={language} />}
    </AdminSectionScreen>
  );
}
