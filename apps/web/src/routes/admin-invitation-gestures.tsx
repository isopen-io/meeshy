import { useState } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminGlyph } from '@/components/admin/admin-glyph';
import { isPendingInvitation } from '@/lib/admin/invitation-model';
import { personLabel } from '@/lib/admin/interpret/labels';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import { type AdminDeps, asRecord } from '@/lib/api/admin';
import { ADMIN_INVITATIONS_KEY, adminInvitationKey, cancelAdminInvitation, type AdminInvitation } from '@/lib/api/admin-invitations';
import type { AdminLinkAck } from '@/lib/api/admin-share-links-person';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LE SEUL GESTE D'UNE DEMANDE DE CONTACT : L'ANNULER** (#8876, #6729) — et
 * seulement tant qu'elle est en attente. Passer une demande à « acceptée » n'est
 * PAS offert : la route écrit un statut brut sans créer l'amitié, le geste aurait
 * affiché « acceptée » sur deux membres qui ne sont pas amis (décision § 9.7).
 *
 * Le geste passe par `useAdminAction` (effet optimiste sur la fiche, retour arrière
 * si la passerelle refuse, refus traduit, annonce à voix haute, relecture de la
 * liste, du bandeau et de la courbe) et par `AdminConfirmSheet`, qui dit ce qui va
 * se passer — y compris qu'aucune amitié n'est créée et que le geste est consigné.
 * Hors ligne, le bouton est désactivé : le cache reste lisible, rien ne part.
 */
const patchedToRejected = (before: unknown): unknown => {
  const current = asRecord(before);
  return current === null ? before : { ...current, status: 'rejected' };
};

export function InvitationGestures({
  language,
  invitation,
  deps,
  online,
  announce,
}: {
  readonly language: InterfaceLanguage;
  readonly invitation: AdminInvitation;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const action = useAdminAction<AdminLinkAck>({ language, onAnnounce: announce });
  const [open, setOpen] = useState(false);
  /* `run` ne rend la main qu'APRÈS la relecture : tant qu'elle dure, le geste est « en cours »
     pour l'écran, sans quoi un second appui partirait sur une demande que le premier vient de changer. */
  const [settling, setSettling] = useState(false);
  const running = action.state.phase === 'running' || settling;

  if (!isPendingInvitation(invitation.status)) return null;

  const cancel = async () => {
    setSettling(true);
    try {
      const done = await action.run({
        call: () => cancelAdminInvitation({ ...deps, invitationId: invitation.id }),
        success: 'admin.invitation.done.cancelled',
        optimistic: { key: adminInvitationKey(invitation.id), apply: patchedToRejected },
        invalidate: [ADMIN_INVITATIONS_KEY],
      });
      if (done !== null) setOpen(false);
    } finally {
      setSettling(false);
    }
  };

  const close = () => {
    action.reset();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-admin-action="cancel-invitation"
        disabled={!online || running}
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        style={{
          minHeight: 44,
          backgroundColor: 'var(--color-ios-surface)',
          color: 'var(--color-danger)',
          border: '1px solid var(--color-edge)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <AdminGlyph name="prohibit" size={16} />
        {translateAdmin(language, 'admin.invitation.gesture.cancel')}
      </button>
      {open ? (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.invitation.confirm.cancel.title')}
          body={translateAdmin(language, 'admin.invitation.confirm.cancel.body', { receiver: personLabel(invitation.receiver, language) })}
          confirmLabel={translateAdmin(language, 'admin.invitation.gesture.cancel')}
          tone="danger"
          busy={running}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={() => void cancel()}
          onCancel={close}
        />
      ) : null}
    </>
  );
}
