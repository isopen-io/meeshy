import type { QueryKey } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import { removeAdminComment } from '@/lib/api/admin-post-gestures';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **RETIRER UN COMMENTAIRE DEPUIS LA FICHE DE SA PUBLICATION** (#10394) — « Retirer », la
 * confirmation qui dit l'effet (réponses comprises, points repris) et demande le motif hors
 * du rang souverain ; le commentaire quitte la fiche tout de suite, et revient si la
 * passerelle refuse.
 */
export function AdminCommentRemoval({
  language,
  commentId,
  onAnnounce,
  optimistic,
  deps = apiDeps,
}: {
  readonly language: AdminLanguage;
  readonly commentId: string;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly optimistic?: { readonly key: QueryKey; readonly apply: (before: unknown) => unknown };
  readonly deps?: AdminDeps;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const action = useAdminAction<{ readonly commentId: string }>({ language, onAnnounce });
  const close = () => {
    setOpen(false);
    action.reset();
  };
  return (
    <>
      <AdminButton tone="danger" disabled={!online} onClick={() => setOpen(true)} data={{ 'data-admin-comment-remove': commentId }}>
        {translateAdmin(language, 'admin.gesture.comment.remove')}
      </AdminButton>
      {open ? (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.gesture.comment.title')}
          body={translateAdmin(language, 'admin.gesture.comment.body')}
          confirmLabel={translateAdmin(language, 'admin.gesture.comment.remove')}
          tone="danger"
          motive={{ label: translateAdmin(language, 'admin.gesture.motive'), minLength: 3, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) =>
            void action
              .run({
                call: () => removeAdminComment({ ...deps, commentId, reason: motive }),
                success: 'admin.gesture.comment.done',
                ...(optimistic === undefined ? {} : { optimistic }),
                invalidate: [['admin', 'posts']],
              })
              .then((done) => (done === null ? undefined : close()))
          }
          onCancel={close}
        />
      ) : null}
    </>
  );
}
