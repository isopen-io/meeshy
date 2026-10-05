import { useState, type ReactNode } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { interpretReportAction } from '@/lib/admin/interpret/enums';
import { reportGestures, type ReportGesture } from '@/lib/admin/report-model';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_REPORTS_LISTS_KEY,
  ADMIN_REPORTS_SIBLINGS_KEY,
  ADMIN_REPORTS_STATS_KEY,
  adminReportKey,
  assignAdminReport,
  decideAdminReport,
  decodeAdminReport,
  deleteAdminReport,
  type AdminReport,
  type AdminReportAck,
  type ReportDecision,
} from '@/lib/api/admin-reports';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES SIX GESTES D'UN SIGNALEMENT** (#8876, #6726) — prendre en charge,
 * résoudre, rejeter, classer sans suite, rouvrir, supprimer. Chacun passe par
 * `useAdminAction` (effet optimiste sur la fiche, retour arrière si la
 * passerelle refuse, refus traduit, annonce à voix haute, relecture de la liste,
 * du bandeau et des signalements voisins) ; ceux qui décident ou détruisent
 * passent par `AdminConfirmSheet`, qui dit ce qui va se passer — y compris que
 * le signalant recevra une réponse (art. 16 DSA).
 *
 * **Seuls les gestes qui ont un effet dans l'état du dossier sont dessinés**
 * (`reportGestures`). Hors ligne, ils sont désactivés : le cache reste lisible,
 * rien ne part.
 *
 * L'action à consigner avec « Résoudre » est choisie par la fiche (`actionChoice`)
 * et passée ici : elle est CONSIGNÉE, elle ne déclenche rien — bannir, retirer,
 * suspendre se font depuis les fiches liées.
 */
type Sheet = 'resolve' | 'reject' | 'dismiss' | 'reopen' | 'delete';

/**
 * Ce que chaque geste invalide : le dossier lui-même, la file (liste et
 * bandeau), les signalements voisins, et le tableau de bord du hub, qui montre
 * la file de modération (`['admin', 'dash']`, préfixe du lot « tableau de bord »).
 */
const QUEUE_KEYS = [ADMIN_REPORTS_LISTS_KEY, ADMIN_REPORTS_STATS_KEY, ADMIN_REPORTS_SIBLINGS_KEY, ['admin', 'dash']] as const;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

function GestureButton({
  anchor,
  label,
  glyph,
  variant,
  disabled,
  onClick,
}: {
  readonly anchor: ReportGesture;
  readonly label: string;
  readonly glyph: AdminGlyphName;
  readonly variant: 'primary' | 'secondary' | 'danger';
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const primary = variant === 'primary';
  const style = primary
    ? { backgroundColor: 'var(--color-ios-brand)', border: '1px solid transparent' }
    : { backgroundColor: 'var(--color-ios-surface)', color: variant === 'danger' ? 'var(--color-danger)' : 'var(--color-ios-ink)', border: '1px solid var(--color-edge)' };
  return (
    <button
      type="button"
      data-admin-action={anchor}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${primary ? 'text-ios-on-brand' : ''} ${FOCUS}`}
      style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)', ...style }}
    >
      <AdminGlyph name={glyph} size={16} />
      {label}
    </button>
  );
}

const GLYPH: Readonly<Record<ReportGesture, AdminGlyphName>> = {
  assign: 'userMinus',
  resolve: 'checkCircle',
  reject: 'x',
  dismiss: 'prohibit',
  reopen: 'arrowClockwise',
  delete: 'trash',
};

const VARIANT: Readonly<Record<ReportGesture, 'primary' | 'secondary' | 'danger'>> = {
  assign: 'primary',
  resolve: 'primary',
  reject: 'secondary',
  dismiss: 'secondary',
  reopen: 'primary',
  delete: 'danger',
};

/** Le changement immédiat que le geste annonce sur la fiche en cache — relu depuis le serveur juste après. */
const patched =
  (patch: Partial<AdminReport>) =>
  (before: unknown): unknown => {
    const current = decodeAdminReport(before);
    return current === null ? before : { ...current, ...patch };
  };

const withNotes = (notes: string | null): Partial<AdminReport> => (notes === null ? {} : { moderatorNotes: notes });

export function ReportGestures({
  language,
  report,
  deps,
  viewerId,
  actionChoice,
  online,
  announce,
  onDeleted,
}: {
  readonly language: AdminLanguage;
  readonly report: AdminReport;
  readonly deps: AdminDeps;
  readonly viewerId: string | null;
  readonly actionChoice: string;
  readonly online: boolean;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
  readonly onDeleted: () => void;
}) {
  const action = useAdminAction<AdminReportAck>({ language, onAnnounce: announce });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /* `run` ne rend la main qu'APRÈS la relecture des listes : tant qu'elle dure, le
     geste est « en cours » pour l'écran, sans quoi un second appui partirait sur
     un dossier que le premier vient de changer. */
  const [settling, setSettling] = useState(false);
  const running = action.state.phase === 'running' || settling;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const reportKey = adminReportKey(report.id);

  const perform = async (gesture: Parameters<typeof action.run>[0]) => {
    setSettling(true);
    try {
      return await action.run(gesture);
    } finally {
      setSettling(false);
    }
  };

  const decide = async (decision: ReportDecision, success: AdminPlainCatalogKey, patch: Partial<AdminReport>) => {
    const done = await perform({
      call: () => decideAdminReport({ ...deps, reportId: report.id, decision }),
      success,
      optimistic: { key: reportKey, apply: patched(patch) },
      invalidate: [reportKey, ...QUEUE_KEYS],
    });
    if (done !== null) setSheet(null);
  };

  const assign = () =>
    void perform({
      call: () => assignAdminReport({ ...deps, reportId: report.id }),
      success: 'admin.moderation.done.assigned',
      optimistic: { key: reportKey, apply: patched({ status: 'under_review' }) },
      invalidate: [reportKey, ...QUEUE_KEYS],
    });

  const remove = async () => {
    const done = await perform({
      call: () => deleteAdminReport({ ...deps, reportId: report.id }),
      success: 'admin.moderation.done.deleted',
      invalidate: [...QUEUE_KEYS],
    });
    if (done === null) return;
    setSheet(null);
    onDeleted();
  };

  const close = () => {
    action.reset();
    setSheet(null);
  };

  const open = (next: Sheet) => {
    action.reset();
    setSheet(next);
  };

  const informs = report.reporterId === null ? '' : ` ${t('admin.moderation.confirm.informs')}`;
  const notesField = { label: t('admin.moderation.confirm.notes'), minLength: 3, required: false } as const;
  const noteOf = (motive: string | null): string | null => (motive === null || motive === '' ? null : motive);
  const error = action.state.phase === 'error' ? action.state.message : null;

  const sheetFor = (kind: Sheet): ReactNode => {
    const common = { language, busy: running, error, onCancel: close } as const;
    switch (kind) {
      case 'resolve':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.moderation.confirm.resolve.title')}
            body={`${translateAdmin(language, 'admin.moderation.confirm.resolve.body', { action: interpretReportAction(actionChoice, language).label })}${informs}`}
            confirmLabel={t('admin.moderation.gesture.resolve')}
            tone="primary"
            motive={notesField}
            onConfirm={(motive) => {
              const notes = noteOf(motive);
              void decide({ kind: 'resolve', actionTaken: actionChoice, notes }, 'admin.moderation.done.resolved', {
                status: 'resolved',
                actionTaken: actionChoice,
                ...withNotes(notes),
              });
            }}
          />
        );
      case 'reject':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.moderation.confirm.reject.title')}
            body={`${t('admin.moderation.confirm.reject.body')}${informs}`}
            confirmLabel={t('admin.moderation.gesture.reject')}
            tone="danger"
            motive={notesField}
            onConfirm={(motive) => {
              const notes = noteOf(motive);
              void decide({ kind: 'reject', notes }, 'admin.moderation.done.rejected', { status: 'rejected', ...withNotes(notes) });
            }}
          />
        );
      case 'dismiss':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.moderation.confirm.dismiss.title')}
            body={`${t('admin.moderation.confirm.dismiss.body')}${informs}`}
            confirmLabel={t('admin.moderation.gesture.dismiss')}
            tone="danger"
            motive={notesField}
            onConfirm={(motive) => {
              const notes = noteOf(motive);
              void decide({ kind: 'dismiss', notes }, 'admin.moderation.done.dismissed', { status: 'dismissed', ...withNotes(notes) });
            }}
          />
        );
      case 'reopen':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.moderation.confirm.reopen.title')}
            body={t('admin.moderation.confirm.reopen.body')}
            confirmLabel={t('admin.moderation.gesture.reopen')}
            tone="primary"
            onConfirm={() => void decide({ kind: 'reopen' }, 'admin.moderation.done.reopened', { status: 'pending' })}
          />
        );
      case 'delete':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.moderation.confirm.delete.title')}
            body={t('admin.moderation.confirm.delete.body')}
            confirmLabel={t('admin.moderation.gesture.delete')}
            tone="danger"
            onConfirm={() => void remove()}
          />
        );
    }
  };

  const offered = reportGestures(report, viewerId);
  const press = (gesture: ReportGesture) => (gesture === 'assign' ? assign() : open(gesture));

  return (
    <>
      {offered.map((gesture) => (
        <GestureButton
          key={gesture}
          anchor={gesture}
          label={translateAdmin(language, `admin.moderation.gesture.${gesture}`)}
          glyph={GLYPH[gesture]}
          variant={VARIANT[gesture]}
          disabled={!online || running}
          onClick={() => press(gesture)}
        />
      ))}
      {sheet === null ? null : sheetFor(sheet)}
    </>
  );
}
