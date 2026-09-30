import { useState } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { BRAND, EDGE, INK, SURFACE } from '@/components/admin/tone';
import { communityGestureOptions, communityGestureWords, withCommunityChange, type CommunityGesture } from '@/lib/admin/community-state';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import { adminCommunityQueryKey, updateAdminCommunity, type AdminCommunityFiche, type AdminCommunityUpdate } from '@/lib/api/admin-communities-detail';
import { useOnline } from '@/lib/net/online';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES GESTES D'UNE COMMUNAUTÉ** (#8876) — désactiver / réactiver, rendre
 * privée / publique. Deux gestes au plus à la fois : l'état courant n'offre que
 * ce qui changerait quelque chose (`communityGestureOptions`).
 *
 * Chaque geste passe par une feuille de confirmation qui DIT ce qui va se passer
 * — ce qui disparaît et ce qui reste — et DEMANDE le motif (10 caractères au
 * moins : la passerelle le consigne dans le journal d'audit et refuse un motif
 * plus court). Tant que le motif est trop court, le bouton reste éteint.
 *
 * L'effet est immédiat (la fiche en cache change avant la réponse) et se défait
 * si la passerelle refuse ; la fiche, la liste et les membres sont relus après un
 * succès. Hors ligne, les boutons sont éteints : un geste qui ne peut pas partir
 * ne se propose pas.
 */
const MOTIVE_MIN = 10;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

function GestureButton({ gesture, label, disabled, onClick }: { readonly gesture: CommunityGesture; readonly label: string; readonly disabled: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      data-admin-action={gesture.id}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
      style={{
        minHeight: 44,
        backgroundColor: SURFACE,
        border: `1px solid ${EDGE}`,
        color: gesture.tone === 'danger' ? 'var(--color-danger)' : INK,
        outlineColor: BRAND,
      }}
    >
      {label}
    </button>
  );
}

export function AdminCommunityActions({
  language,
  fiche,
  deps,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminCommunityFiche;
  readonly deps: AdminDeps;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const online = useOnline();
  const [pending, setPending] = useState<CommunityGesture | null>(null);
  const action = useAdminAction<AdminCommunityUpdate>({ language, onAnnounce });

  const close = () => {
    setPending(null);
    action.reset();
  };

  const confirm = async (gesture: CommunityGesture, motive: string | null) => {
    const words = communityGestureWords(gesture.id, language);
    const done = await action.run({
      call: () => updateAdminCommunity({ ...deps, communityId: fiche.id, change: gesture.change, reason: motive ?? '' }),
      success: words.done,
      optimistic: { key: adminCommunityQueryKey(fiche.id), apply: (before) => withCommunityChange(before, gesture.change, new Date().toISOString()) },
      invalidate: [['admin', 'community']],
    });
    if (done !== null) close();
  };

  const words = pending === null ? null : communityGestureWords(pending.id, language);

  return (
    <>
      {communityGestureOptions(fiche).map((gesture) => (
        <GestureButton key={gesture.id} gesture={gesture} label={communityGestureWords(gesture.id, language).action} disabled={!online} onClick={() => setPending(gesture)} />
      ))}
      {pending === null || words === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={words.title}
          body={words.body}
          confirmLabel={words.confirm}
          tone={pending.tone}
          motive={{ label: translateAdmin(language, 'admin.community.motive'), minLength: MOTIVE_MIN, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void confirm(pending, motive)}
          onCancel={close}
        />
      )}
    </>
  );
}
