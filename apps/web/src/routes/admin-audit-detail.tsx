import type { ReactNode } from 'react';

import { AdminLink } from '@/components/admin/entity-chip';
import { AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { BRAND, EDGE, INK, INK2 } from '@/components/admin/tone';
import { Sheet } from '@/components/sheet';
import { auditFieldLabel, auditValue, summarizeUserAgent } from '@/lib/admin/audit-fields';
import { interpretAuditAction } from '@/lib/admin/audit-vocabulary';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminAuditChange, AdminAuditEntry, AdminAuditPerson } from '@/lib/api/admin-audit';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

import { ActionGlyph, AuditPerson, AuditTarget, SovereignBadge } from './admin-audit-parts';

/**
 * **LE DÉTAIL D'UNE ENTRÉE DU JOURNAL** (#8876, #6727) — une FEUILLE, sans route : le
 * journal n'a pas de fiche par entrée, la ligne s'ouvre là où elle se lit.
 *
 * Elle dit tout ce qu'il faut pour comprendre un geste : QUI (l'administrateur, nommé),
 * QUOI (l'action, expliquée, et son badge quand c'est une lecture souveraine), À QUI
 * (le membre concerné, l'élément visé), POURQUOI (le motif en entier), et CE QUI A
 * CHANGÉ (champ traduit, avant → après — les secrets restent masqués tels que servis).
 * L'adresse IP et le navigateur n'apparaissent QUE s'ils sont servis : la passerelle les
 * réserve à qui peut lire les données sensibles, et cet écran ne fabrique pas ce qu'elle
 * retient. Les identifiants techniques sont en bas, copiables — seul endroit où un
 * identifiant s'écrit.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

function Sub({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-caption font-semibold uppercase" style={{ color: INK2 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function AllOfLink({ label, search }: { readonly label: string; readonly search: Readonly<Record<string, string>> }) {
  return (
    <AdminLink
      target={{ kind: 'section', section: 'audit', search }}
      anchor="audit-filter-link"
      className={`inline-flex items-center rounded-chip text-caption font-medium ${FOCUS}`}
      style={{ minHeight: 44, color: BRAND }}
      ariaLabel={label}
    >
      {label}
    </AdminLink>
  );
}

function Person({
  language,
  person,
  allLabel,
  searchKey,
}: {
  readonly language: AdminLanguage;
  readonly person: AdminAuditPerson | null;
  readonly allLabel: string;
  readonly searchKey: 'admin' | 'subject';
}) {
  return (
    <span className="grid gap-1">
      <AuditPerson language={language} person={person} />
      {person === null ? null : <AllOfLink label={allLabel} search={{ [searchKey]: person.id }} />}
    </span>
  );
}

function ChangesTable({ language, entry, now }: { readonly language: AdminLanguage; readonly entry: AdminAuditEntry; readonly now: Date }) {
  const changes: readonly AdminAuditChange[] = entry.changes ?? [];
  if (changes.length === 0) {
    return (
      <p data-admin-audit-changes="none" className="text-body" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.audit.detail.changesNone')}
      </p>
    );
  }

  const cell = (field: string, served: string | null) => {
    const value = auditValue({ field, value: served, entity: entry.target.type }, language, now);
    return (
      <span
        data-admin-audit-value={value.kind}
        {...(value.kind === 'masked' ? { title: translateAdmin(language, 'admin.audit.change.masked'), 'aria-label': translateAdmin(language, 'admin.audit.change.masked') } : {})}
        style={{ color: value.kind === 'text' ? INK : INK2 }}
      >
        {value.text}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto rounded-card" style={{ border: `1px solid ${EDGE}` }}>
      <table data-admin-audit-changes="table" className="w-full border-collapse text-start text-body">
        <caption className="sr-only">{translateAdmin(language, 'admin.audit.detail.changesCaption')}</caption>
        <thead>
          <tr>
            {(['colField', 'colBefore', 'colAfter'] as const).map((column) => (
              <th key={column} scope="col" className="px-3 py-2 text-start text-caption font-semibold" style={{ color: INK2, borderBottom: `1px solid ${EDGE}` }}>
                {translateAdmin(language, `admin.audit.detail.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {changes.map((change, index) => (
            <tr key={`${index}-${change.field}`} data-admin-audit-change={change.field}>
              <th scope="row" className="min-w-0 break-words px-3 py-2 text-start font-medium" style={{ color: INK, borderBottom: `1px solid ${EDGE}` }}>
                {auditFieldLabel(change.field, language)}
              </th>
              <td className="min-w-0 break-words px-3 py-2" style={{ borderBottom: `1px solid ${EDGE}` }}>
                {cell(change.field, change.before)}
              </td>
              <td className="min-w-0 break-words px-3 py-2" style={{ borderBottom: `1px solid ${EDGE}` }}>
                {cell(change.field, change.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Network({ language, entry }: { readonly language: AdminLanguage; readonly entry: AdminAuditEntry }) {
  if (entry.ipAddress === null && entry.userAgent === null) return null;
  const agent = summarizeUserAgent(entry.userAgent);
  return (
    <Sub title={translateAdmin(language, 'admin.audit.detail.network')}>
      <dl className="grid gap-3">
        {entry.ipAddress === null ? null : (
          <AdminMetaRow
            anchor="ip"
            label={translateAdmin(language, 'admin.audit.detail.ip')}
            value={<code className="font-mono text-caption">{entry.ipAddress}</code>}
          />
        )}
        {entry.userAgent === null ? null : (
          <AdminMetaRow
            anchor="agent"
            label={translateAdmin(language, 'admin.audit.detail.agent')}
            value={agent === null ? translateAdmin(language, 'admin.audit.ua.unrecognized') : translateAdmin(language, 'admin.audit.ua.on', agent)}
            explain={entry.userAgent}
          />
        )}
      </dl>
    </Sub>
  );
}

export function AuditDetailSheet({
  language,
  entry,
  now,
  onClose,
}: {
  readonly language: AdminLanguage;
  readonly entry: AdminAuditEntry;
  readonly now: Date;
  readonly onClose: () => void;
}) {
  const announcer = useLiveAnnouncer();
  const action = interpretAuditAction(entry.action, language);
  const moment = adminMomentOf(entry.createdAt, now, language);
  /* Le membre concerné et l'élément visé sont UNE seule ligne quand l'élément EST ce membre. */
  const subjectIsTarget = entry.subject !== null && entry.target.type === 'User' && entry.target.id === entry.subject.id;

  return (
    <Sheet title={action.label} presentation="centered" bodyAs="div" onClose={onClose}>
      {/* Un lien de la feuille (« toutes ses actions », une puce vers une fiche) mène AILLEURS : la feuille se ferme avec lui. */}
      <div
        data-admin-audit-detail={entry.id}
        className="grid gap-5 px-4 pb-4 pt-2"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a') !== null) onClose();
        }}
      >
        <div className="flex items-start gap-3">
          <ActionGlyph glyph={action.glyph ?? 'scroll'} tone={action.tone} />
          <div className="grid min-w-0 gap-2">
            <p data-admin-audit-explain className="text-body" style={{ color: INK }}>
              {action.explain}
            </p>
            {action.sovereign ? <SovereignBadge language={language} /> : null}
          </div>
        </div>

        <dl className="grid gap-3">
          <AdminMetaRow anchor="when" label={translateAdmin(language, 'admin.audit.detail.when')} value={<AdminMomentText moment={moment} variant="both" />} />
          <AdminMetaRow
            anchor="admin"
            label={translateAdmin(language, 'admin.audit.detail.admin')}
            value={<Person language={language} person={entry.admin} allLabel={translateAdmin(language, 'admin.audit.detail.adminAll')} searchKey="admin" />}
          />
          {entry.subject === null || subjectIsTarget ? null : (
            <AdminMetaRow
              anchor="subject"
              label={translateAdmin(language, 'admin.audit.detail.subject')}
              value={<Person language={language} person={entry.subject} allLabel={translateAdmin(language, 'admin.audit.detail.subjectAll')} searchKey="subject" />}
            />
          )}
          <AdminMetaRow
            anchor="target"
            label={translateAdmin(language, 'admin.audit.detail.target')}
            value={
              subjectIsTarget ? (
                <Person language={language} person={entry.subject} allLabel={translateAdmin(language, 'admin.audit.detail.subjectAll')} searchKey="subject" />
              ) : (
                <AuditTarget language={language} target={entry.target} />
              )
            }
          />
          <AdminMetaRow
            anchor="reason"
            label={translateAdmin(language, 'admin.audit.detail.reason')}
            value={entry.reason === null ? <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.audit.detail.reasonNone')}</span> : <span data-admin-audit-reason className="whitespace-pre-wrap">{entry.reason}</span>}
          />
        </dl>

        <Sub title={translateAdmin(language, 'admin.audit.detail.changes')}>
          <ChangesTable language={language} entry={entry} now={now} />
        </Sub>

        <Network language={language} entry={entry} />

        <dl className="grid gap-3">
          <AdminTechnicalId language={language} id={entry.id} label={translateAdmin(language, 'admin.audit.detail.entryId')} onAnnounce={announcer.announce} />
          <AdminTechnicalId language={language} id={entry.target.id} label={translateAdmin(language, 'admin.audit.detail.targetId')} onAnnounce={announcer.announce} />
        </dl>
      </div>
      <AdminAnnouncement text={announcer.text} />
    </Sheet>
  );
}
