import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { userEntityOf } from '@/lib/admin/user-entity';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { ADMIN_DELETE_MOTIVE_MIN_LENGTH, deleteAdminUser, restoreAdminUser, type AdminUserDeleted } from '@/lib/api/admin-user-lifecycle';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { GLASS_CARD_CLASS, GLASS_CARD_EDGE } from './admin-member-parts';

/**
 * **SUPPRIMER OU RESTAURER UN COMPTE** (audit 2026-10-04) — la passerelle servait
 * les deux gestes (`DELETE /admin/users/:userId`, `POST …/restore`) ; aucun écran ne
 * les offrait.
 *
 * - **Qui** : `requireUserDeleteAccess` exige `canDeleteUsers`, que la matrice
 *   servie au web ne publie pas ; la matrice centrale la donne aux deux seuls rangs
 *   d'administration (BIGBOSS, ADMIN) — `useAdminReach().hasAdminRank`. La
 *   hiérarchie (on ne supprime pas un rang égal ou supérieur) reste jugée par la
 *   passerelle, et son refus se DIT dans la feuille.
 * - **Quoi** : « Supprimer » sur un compte vivant, « Restaurer » sur un compte
 *   supprimé (`deletedAt` posé) — jamais les deux, jamais l'un sur l'autre état.
 * - **Comment** : `AdminConfirmSheet` dit ce qui va se passer ; supprimer demande un
 *   motif (trois caractères) que le rang souverain n'écrit pas (spec § 4). Après le
 *   geste, la fiche et la liste des comptes se relisent, et le verdict est annoncé.
 *   Hors ligne, les boutons sont désactivés.
 */
type Pending = 'delete' | 'restore';

export function AdminMemberLifecycle({
  membre,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly deps?: AdminDeps;
}) {
  const reach = useAdminReach();
  const online = useOnline();
  const client = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const deletion = useAdminAction<AdminUserDeleted>({ language, onAnnounce });
  const restoration = useAdminAction<AdminUserDetail>({ language, onAnnounce });

  if (!reach.hasAdminRank) return null;

  const deleted = membre.deletedAt !== null;
  const name = userEntityOf(membre, language, new Date()).label;
  const running = deletion.state.phase === 'running' || restoration.state.phase === 'running';
  const relire = [adminUserDetailQueryKey(membre.id), ['admin', 'users']] as const;

  const close = () => {
    deletion.reset();
    restoration.reset();
    setPending(null);
  };

  const supprimer = async (motive: string | null) => {
    const done = await deletion.run({
      call: () => deleteAdminUser({ ...deps, userId: membre.id, reason: motive }),
      success: 'admin.people.delete.done',
      invalidate: relire,
    });
    if (done !== null) setPending(null);
  };

  const restaurer = async () => {
    const relu = await restoration.run({
      call: () => restoreAdminUser({ ...deps, userId: membre.id }),
      success: 'admin.people.restore.done',
      invalidate: [['admin', 'users']],
    });
    if (relu === null) return;
    /* La passerelle sert la fiche RELUE : elle remplace le cache sans attendre une relecture. */
    client.setQueryData(adminUserDetailQueryKey(membre.id), relu);
    setPending(null);
  };

  const error = (pending === 'delete' ? deletion : restoration).state;

  return (
    <section
      aria-label={translateAdmin(language, 'admin.people.lifecycle.title')}
      data-admin-lifecycle={deleted ? 'deleted' : 'alive'}
      className={`${GLASS_CARD_CLASS} flex flex-wrap items-center gap-2 p-4`}
      style={GLASS_CARD_EDGE}
    >
      {deleted ? (
        <AdminButton tone="primary" disabled={!online || running} data={{ 'data-admin-action': 'restore-user' }} onClick={() => setPending('restore')}>
          {translateAdmin(language, 'admin.people.restore.action')}
        </AdminButton>
      ) : (
        <AdminButton tone="danger" disabled={!online || running} data={{ 'data-admin-action': 'delete-user' }} onClick={() => setPending('delete')}>
          {translateAdmin(language, 'admin.people.delete.action')}
        </AdminButton>
      )}

      {pending === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, pending === 'delete' ? 'admin.people.delete.title' : 'admin.people.restore.title')}
          body={translateAdmin(language, pending === 'delete' ? 'admin.people.delete.body' : 'admin.people.restore.body', { name })}
          confirmLabel={translateAdmin(language, pending === 'delete' ? 'admin.people.delete.confirm' : 'admin.people.restore.confirm')}
          tone={pending === 'delete' ? 'danger' : 'primary'}
          {...(pending === 'delete'
            ? { motive: { label: translateAdmin(language, 'admin.people.delete.motive'), minLength: ADMIN_DELETE_MOTIVE_MIN_LENGTH, required: true } }
            : {})}
          busy={running}
          error={error.phase === 'error' ? error.message : null}
          onConfirm={(motive) => void (pending === 'delete' ? supprimer(motive) : restaurer())}
          onCancel={close}
        />
      )}
    </section>
  );
}
