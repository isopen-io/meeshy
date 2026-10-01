import { useState } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminGlyph } from '@/components/admin/admin-glyph';
import { trackingLinkGesture } from '@/lib/admin/tracking-link-model';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { type AdminDeps, asRecord } from '@/lib/api/admin';
import type { AdminLinkAck } from '@/lib/api/admin-share-links-person';
import { ADMIN_TRACKING_LINKS_KEY, adminTrackingLinkKey, setAdminTrackingLinkActive, type AdminTrackingLink } from '@/lib/api/admin-tracking-links';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LE GESTE D'UN LIEN DE SUIVI : LE DÉSACTIVER, OU LE RÉACTIVER** (#8876, #6729) —
 * et seulement au RANG D'ADMINISTRATION : la route exige, en plus de la lecture, le
 * rang BIGBOSS ou ADMIN (un auditeur voit les campagnes, il n'en ferme pas) ; sans ce
 * rang, aucun bouton n'est dessiné plutôt qu'un bouton qui répondrait 403.
 *
 * Le geste passe par `AdminConfirmSheet`, qui dit ce qui va se passer (les visiteurs ne
 * sont plus redirigés, les statistiques restent) et propose un motif FACULTATIF de 3
 * caractères au moins, consigné au journal. `useAdminAction` : effet optimiste sur la
 * fiche, retour arrière si la passerelle refuse, refus traduit, annonce, relecture de
 * la liste et de la fiche. Hors ligne, le bouton est désactivé.
 */
const patchedActive =
  (isActive: boolean) =>
  (before: unknown): unknown => {
    const current = asRecord(before);
    return current === null ? before : { ...current, isActive };
  };

export function TrackingLinkGestures({
  language,
  link,
  reach,
  deps,
  online,
  announce,
}: {
  readonly language: AdminLanguage;
  readonly link: AdminTrackingLink;
  readonly reach: AdminReach;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const action = useAdminAction<AdminLinkAck>({ language, onAnnounce: announce });
  const [open, setOpen] = useState(false);
  /* `run` ne rend la main qu'APRÈS la relecture : tant qu'elle dure, le geste est « en cours »
     pour l'écran, sans quoi un second appui partirait sur un lien que le premier vient de changer. */
  const [settling, setSettling] = useState(false);
  const running = action.state.phase === 'running' || settling;
  const gesture = trackingLinkGesture(link, reach);

  if (gesture === null) return null;
  const activating = gesture === 'reactivate';

  const confirm = async (motive: string | null) => {
    setSettling(true);
    try {
      const done = await action.run({
        call: () => setAdminTrackingLinkActive({ ...deps, linkId: link.id, isActive: activating, reason: motive }),
        success: activating ? 'admin.tracking.done.reactivated' : 'admin.tracking.done.deactivated',
        optimistic: { key: adminTrackingLinkKey(link.id), apply: patchedActive(activating) },
        invalidate: [ADMIN_TRACKING_LINKS_KEY],
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
        data-admin-action={gesture === 'deactivate' ? 'deactivate-tracking' : 'reactivate-tracking'}
        disabled={!online || running}
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        style={{
          minHeight: 44,
          backgroundColor: 'var(--color-ios-surface)',
          color: activating ? 'var(--color-ios-ink)' : 'var(--color-danger)',
          border: '1px solid var(--color-edge)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <AdminGlyph name={activating ? 'arrowClockwise' : 'prohibit'} size={16} />
        {translateAdmin(language, activating ? 'admin.tracking.gesture.reactivate' : 'admin.tracking.gesture.deactivate')}
      </button>
      {open ? (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, activating ? 'admin.tracking.confirm.reactivate.title' : 'admin.tracking.confirm.deactivate.title')}
          body={translateAdmin(language, activating ? 'admin.tracking.confirm.reactivate.body' : 'admin.tracking.confirm.deactivate.body')}
          confirmLabel={translateAdmin(language, activating ? 'admin.tracking.gesture.reactivate' : 'admin.tracking.gesture.deactivate')}
          tone={activating ? 'primary' : 'danger'}
          motive={{ label: translateAdmin(language, 'admin.tracking.confirm.motive'), minLength: 3, required: false }}
          busy={running}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void confirm(motive === '' ? null : motive)}
          onCancel={close}
        />
      ) : null}
    </>
  );
}
