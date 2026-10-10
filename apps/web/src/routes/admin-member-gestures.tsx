import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult } from '@/lib/api/http';
import type { AdminPlainCatalogKey, AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import type { SectionState } from './admin-member-parts';

/**
 * **UN GESTE SENSIBLE SUR UN MEMBRE, CONFIRMÉ** (#8004) — déverrouiller, retirer la
 * double authentification, poser ou retirer une preuve ou un consentement. Chacun
 * passe par `AdminConfirmSheet` (la feuille DIT ce qui va se passer et, quand la
 * passerelle l'exige, demande le motif) puis par `useAdminAction` (refus traduits,
 * annonce vocale du résultat).
 *
 * La passerelle rend le membre À JOUR : il remplace le détail en cache (jamais une
 * invalidation — chaque lecture de la fiche écrit une trace d'audit, et
 * l'invalidation afficherait l'état d'avant le temps de revenir). La liste des
 * comptes, elle, est invalidée : un membre déverrouillé ne doit plus s'y lire
 * « Verrouillé ».
 *
 * Hors ligne, `offline` désactive les gestes : un bouton qui partirait dans le
 * vide est pire que son absence.
 */
export type MemberGesture = {
  /** L'ancre `data-admin-action` — et le nom que la recette donne au geste. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly tone: 'danger' | 'primary';
  readonly motive?: { readonly label: string; readonly minLength: number; readonly required: boolean };
  readonly success: AdminPlainCatalogKey;
  readonly call: (reason: string | null) => Promise<ApiResult<AdminUserDetail>>;
};

export function useMemberGestures({
  membre,
  language,
  onAnnounce,
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string, tone?: AnnouncementTone) => void;
}): {
  readonly ask: (gesture: MemberGesture) => void;
  readonly sheet: ReactNode;
  readonly offline: boolean;
  readonly state: SectionState;
} {
  const client = useQueryClient();
  const online = useOnline();
  const [pending, setPending] = useState<MemberGesture | null>(null);
  const action = useAdminAction<AdminUserDetail>({ language, onAnnounce });

  const close = () => {
    action.reset();
    setPending(null);
  };

  const confirm = async (motive: string | null) => {
    if (pending === null) return;
    const updated = await action.run({
      call: () => pending.call(motive),
      success: pending.success,
      invalidate: [['admin', 'users']],
    });
    if (updated === null) return;
    client.setQueryData(adminUserDetailQueryKey(membre.id), updated);
    setPending(null);
  };

  const phase = action.state;
  const state: SectionState =
    phase.phase === 'running'
      ? { phase: 'saving' }
      : phase.phase === 'done'
        ? { phase: 'saved', message: phase.message }
        : phase.phase === 'error'
          ? { phase: 'error', message: phase.message }
          : { phase: 'idle' };

  return {
    ask: (gesture) => {
      action.reset();
      setPending(gesture);
    },
    offline: !online,
    state,
    sheet:
      pending === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.confirmLabel}
          tone={pending.tone}
          {...(pending.motive === undefined ? {} : { motive: pending.motive })}
          busy={phase.phase === 'running'}
          error={phase.phase === 'error' ? phase.message : null}
          onConfirm={(motive) => void confirm(motive)}
          onCancel={close}
        />
      ),
  };
}
