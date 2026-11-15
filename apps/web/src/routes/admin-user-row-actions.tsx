import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminButton } from '@/components/admin/button';
import { INK3 } from '@/components/admin/tone';
import { personLabel } from '@/lib/admin/interpret/labels';
import { useAdminMotive } from '@/lib/admin/use-admin-motive';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { updateAdminUser } from '@/lib/api/admin-user-actions';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { unlockAdminUser } from '@/lib/api/admin-user-security';
import { setAdminUserVerification } from '@/lib/api/admin-user-verifications';
import type { AdminUserRow, AdminUsersPage } from '@/lib/api/admin-users';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { refusalOf } from './admin-member-parts';

/**
 * **LES GESTES D'UN COMPTE, SUR SA LIGNE** (#11410, suite de la demande porteur de #10562 :
 * « unifier les actions par des actions dans les cartes et les éléments »).
 *
 * La liste des comptes offre, sur la ligne même (ou la carte, sous 48 rem), les trois gestes
 * qu'on fait le plus souvent sur un compte qui bloque — et SEULEMENT ceux qui ont un effet :
 * - « Déverrouiller » tant que le verrou est futur (`unlock`, qui vide aussi le compteur d'échecs) ;
 * - « Activer » un compte désactivé et non supprimé ;
 * - « Valider l'e-mail » quand il y en a un, non vérifié.
 *
 * Chacun est IMMÉDIAT et OPTIMISTE : la ligne bascule au geste dans chaque page de la liste en
 * cache, l'instantané revient si la passerelle refuse, et la liste se relit ensuite. Aucun ne
 * retire un droit, donc aucun ne demande de confirmation ; l'ADMIN envoie le motif proposé
 * (`useAdminMotive`), le rang souverain n'en envoie pas. Sans `canManageUsers`, rien n'est
 * dessiné ; hors ligne, les gestes sont désactivés.
 */
type RowGesture = {
  readonly id: 'unlock' | 'activate' | 'verify-email';
  readonly label: AdminPlainCatalogKey;
  readonly success: AdminPlainCatalogKey;
  readonly patch: (row: AdminUserRow) => AdminUserRow;
};

const GESTURES: readonly RowGesture[] = [
  { id: 'unlock', label: 'admin.people.row.unlock', success: 'admin.people.unlock.done', patch: (row) => ({ ...row, lockedUntil: null }) },
  { id: 'activate', label: 'admin.people.row.activate', success: 'admin.quick.activated', patch: (row) => ({ ...row, isActive: true, deactivatedAt: null }) },
  { id: 'verify-email', label: 'admin.people.row.verifyEmail', success: 'admin.people.proof.done', patch: (row) => ({ ...row, emailVerified: true }) },
];

export function rowGesturesOf(row: AdminUserRow, now: Date): readonly RowGesture['id'][] {
  const locked = row.lockedUntil !== null && new Date(row.lockedUntil).getTime() > now.getTime();
  return [
    ...(locked ? (['unlock'] as const) : []),
    ...(!row.isActive && row.deletedAt === null ? (['activate'] as const) : []),
    ...(row.email !== '' && !row.emailVerified && row.deletedAt === null ? (['verify-email'] as const) : []),
  ];
}

const isPage = (data: unknown): data is AdminUsersPage =>
  typeof data === 'object' && data !== null && Array.isArray((data as { readonly users?: unknown }).users);

export function AdminUserRowActions({
  row,
  language,
  onAnnounce,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly row: AdminUserRow;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const reach = useAdminReach();
  const motive = useAdminMotive(language);
  const client = useQueryClient();
  const online = useOnline();
  const [running, setRunning] = useState<RowGesture['id'] | null>(null);

  if (!reach.can('canManageUsers')) return null;
  const offered = rowGesturesOf(row, now());
  const visible = GESTURES.filter((gesture) => offered.includes(gesture.id));
  if (visible.length === 0) {
    return (
      <span className="text-caption" style={{ color: INK3 }}>
        {translateAdmin(language, 'admin.people.row.none')}
      </span>
    );
  }

  const reason = motive.fallback === undefined ? {} : { reason: motive.fallback };
  const call = (id: RowGesture['id']): Promise<ApiResult<AdminUserDetail>> => {
    if (id === 'unlock') return unlockAdminUser({ ...deps, userId: row.id, ...reason });
    if (id === 'activate') return updateAdminUser({ ...deps, userId: row.id, edit: { isActive: true }, ...reason });
    return setAdminUserVerification({ ...deps, userId: row.id, channel: 'email', verified: true, ...reason });
  };

  async function run(gesture: RowGesture) {
    if (running !== null) return;
    setRunning(gesture.id);
    const snapshots = client.getQueriesData<unknown>({ queryKey: ['admin', 'users'] });
    client.setQueriesData<unknown>({ queryKey: ['admin', 'users'] }, (page: unknown) =>
      isPage(page) ? { ...page, users: page.users.map((candidate) => (candidate.id === row.id ? gesture.patch(candidate) : candidate)) } : page,
    );
    const result = await call(gesture.id);
    setRunning(null);
    if (!result.ok) {
      for (const [key, data] of snapshots) client.setQueryData(key, data);
      onAnnounce(refusalOf(result, language));
      return;
    }
    client.setQueryData(adminUserDetailQueryKey(row.id), result.data);
    void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    onAnnounce(translateAdmin(language, gesture.success));
  }

  const name = personLabel(row, language);
  return (
    <span className="flex flex-wrap justify-end gap-2 md:justify-start" data-admin-row-actions={row.id}>
      {visible.map((gesture) => (
        <AdminButton
          key={gesture.id}
          tone={gesture.id === 'activate' ? 'primary' : 'secondary'}
          busy={running === gesture.id}
          disabled={!online || (running !== null && running !== gesture.id)}
          label={translateAdmin(language, 'admin.people.row.named', { action: translateAdmin(language, gesture.label), name })}
          data={{ 'data-admin-row-action': gesture.id }}
          onClick={() => void run(gesture)}
        >
          {translateAdmin(language, gesture.label)}
        </AdminButton>
      ))}
    </span>
  );
}
