import type { QueryKey } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminReportAction } from '@meeshy/shared/types/admin-publication-states';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { reportActsFor } from '@/lib/admin/report-acts';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import { actOnAdminReport, type AdminReportActResult } from '@/lib/api/admin-post-gestures';
import { ADMIN_REPORTS_LISTS_KEY, ADMIN_REPORTS_SIBLINGS_KEY, ADMIN_REPORTS_STATS_KEY } from '@/lib/api/admin-reports';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **UN SIGNALEMENT SE TRAITE EN UN GESTE** (#10394) — sur la ligne de la file, sur le
 * tableau de bord et dans la fiche d'un signalement : « Mettre hors ligne », « Mettre en
 * privé » (une publication ou une story), « Retirer le commentaire », « Classer ». Un
 * appui, puis la confirmation (motif sauf au rang souverain) : l'action sur le contenu et
 * la clôture du dossier partent ensemble. La ligne se dit traitée tout de suite ; un refus
 * la rend.
 */
const MOTIVE_MIN = 3;

const QUEUE_KEYS: readonly QueryKey[] = [ADMIN_REPORTS_LISTS_KEY, ADMIN_REPORTS_STATS_KEY, ADMIN_REPORTS_SIBLINGS_KEY, ['admin', 'dash'], ['admin', 'posts']];

export function AdminReportActBar({
  language,
  report,
  onAnnounce,
  optimistic,
  extraInvalidate = [],
  deps = apiDeps,
}: {
  readonly language: AdminLanguage;
  readonly report: { readonly id: string; readonly reportedType: string | null; readonly status: string | null };
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly optimistic?: { readonly key: QueryKey; readonly apply: (before: unknown, action: AdminReportAction) => unknown };
  readonly extraInvalidate?: readonly QueryKey[];
  readonly deps?: AdminDeps;
}) {
  const online = useOnline();
  const [pending, setPending] = useState<AdminReportAction | null>(null);
  const action = useAdminAction<AdminReportActResult>({ language, onAnnounce });
  const acts = reportActsFor(report);
  if (acts.length === 0) return null;

  const close = () => {
    setPending(null);
    action.reset();
  };

  const run = async (act: AdminReportAction, motive: string | null) => {
    const done = await action.run({
      call: () => actOnAdminReport({ ...deps, reportId: report.id, action: act, reason: motive }),
      success: 'admin.gesture.report.done',
      ...(optimistic === undefined ? {} : { optimistic: { key: optimistic.key, apply: (before: unknown) => optimistic.apply(before, act) } }),
      invalidate: [...QUEUE_KEYS, ...extraInvalidate],
    });
    if (done !== null) close();
  };

  return (
    <div role="group" aria-label={translateAdmin(language, 'admin.gesture.report.group')} data-admin-report-acts={report.id} className="flex flex-wrap items-center gap-1.5">
      {acts.map((act) => (
        <AdminButton
          key={act}
          tone={act === 'dismiss' ? 'secondary' : act === 'make-private' ? 'secondary' : 'danger'}
          disabled={!online}
          onClick={() => setPending(act)}
          data={{ 'data-admin-report-act': act }}
        >
          {translateAdmin(language, `admin.gesture.report.${act}`)}
        </AdminButton>
      ))}
      {pending === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, `admin.gesture.report.${pending}.title`)}
          body={translateAdmin(language, pending === 'dismiss' ? 'admin.gesture.report.dismiss.body' : 'admin.gesture.report.body')}
          confirmLabel={translateAdmin(language, `admin.gesture.report.${pending}`)}
          tone={pending === 'dismiss' ? 'primary' : 'danger'}
          motive={{ label: translateAdmin(language, 'admin.gesture.motive'), minLength: MOTIVE_MIN, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void run(pending, motive)}
          onCancel={close}
        />
      )}
    </div>
  );
}
