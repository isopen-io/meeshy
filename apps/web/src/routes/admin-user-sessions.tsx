import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminBadge } from '@/components/admin/badges';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminMomentText, AdminNotProvided } from '@/components/admin/meta';
import type { AdminColumn } from '@/components/admin/responsive-rows';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminUserSessionsQueryKey,
  loadAdminUserSessions,
  revokeAdminUserSession,
  withoutSession,
  type AdminSession,
} from '@/lib/api/admin-user-dossier';
import { adminUserStatsQueryKey } from '@/lib/api/admin-user-member';
import { ADMIN_SOUVERAIN_PREFIXE } from '@/lib/api/souverain';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { DossierList, servi } from './admin-user-dossier-list';

/**
 * **LES SESSIONS D'UN MEMBRE, ET LE GESTE DE LES FERMER** (#7845, #8876) — la liste est celle des
 * onglets de dossier (cartes sous le seuil, états dessinés) ; chaque session OUVERTE porte
 * « Révoquer cette session », que la passerelle sert déjà (`DELETE /admin/users/:userId/sessions/
 * :sessionId`).
 *
 * Le geste n'est offert qu'au rang d'administration (BIGBOSS, ADMIN — les deux seuls rôles qui portent
 * `canViewSensitiveData`, la permission que la route exige, que la matrice servie ne publie pas) : un
 * bouton que la passerelle refuserait serait un contrôle sans effet. La hiérarchie (on ne révoque pas
 * les sessions d'un rang égal ou supérieur) reste refusée par la passerelle, et le refus se DIT. Il passe par `AdminConfirmSheet`
 * (qui dit ce qui va se passer : l'appareil est déconnecté, les autres sessions ne bougent pas, le geste
 * est consigné) et par `useAdminAction` : la ligne s'en va tout de suite, revient si la passerelle refuse
 * (refus dit en mots, annoncé), puis la liste et les chiffres de la fiche sont relus. Hors ligne, le
 * bouton est désactivé : rien ne part.
 */
const sessionsKeyPrefix = (userId: string) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'sessions'] as const;

export function AdminUserSessionsList({
  userId,
  language,
  deps,
  now,
  onAnnounce,
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now: Date;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const reach = useAdminReach();
  const online = useOnline();
  const action = useAdminAction<{ readonly acknowledged: true }>({ language, onAnnounce });
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<AdminSession | null>(null);
  /* `run` ne rend la main qu'APRÈS la relecture : tant qu'elle dure, le geste est « en cours » pour l'écran. */
  const [settling, setSettling] = useState(false);
  const running = action.state.phase === 'running' || settling;
  const canRevoke = reach.hasAdminRank;

  const sessions = useQuery({
    queryKey: adminUserSessionsQueryKey(userId, offset),
    queryFn: ({ signal }) => servi(loadAdminUserSessions({ ...deps, userId, offset, signal })),
    gcTime: 0,
    retry: false,
  });

  const revoke = async (session: AdminSession) => {
    setSettling(true);
    try {
      const done = await action.run({
        call: () => revokeAdminUserSession({ ...deps, userId, sessionId: session.id }),
        success: 'admin.security.revoke.done',
        optimistic: { key: adminUserSessionsQueryKey(userId, offset), apply: (before) => withoutSession(before, session.id) },
        invalidate: [sessionsKeyPrefix(userId), adminUserStatsQueryKey(userId)],
      });
      if (done !== null) setTarget(null);
    } finally {
      setSettling(false);
    }
  };

  const close = () => {
    action.reset();
    setTarget(null);
  };

  const columns: readonly AdminColumn<AdminSession>[] = [
    {
      id: 'device',
      header: translateAdmin(language, 'admin.security.device'),
      primary: true,
      cell: (session) => <span className="min-w-0 break-words text-start text-caption font-medium">{session.device}</span>,
    },
    { id: 'place', header: translateAdmin(language, 'admin.security.place'), cell: (session) => (session.place === '' ? <AdminNotProvided language={language} /> : session.place) },
    { id: 'ip', header: translateAdmin(language, 'admin.security.ip'), cell: (session) => (session.ipAddress === '' ? <AdminNotProvided language={language} /> : session.ipAddress) },
    {
      id: 'status',
      header: translateAdmin(language, 'admin.col.status'),
      cell: (session) =>
        session.isValid ? (
          <AdminBadge tone="success">{translateAdmin(language, 'admin.security.valid')}</AdminBadge>
        ) : (
          <AdminBadge tone="neutral">{translateAdmin(language, 'admin.security.closed')}</AdminBadge>
        ),
    },
    {
      id: 'lastActive',
      header: translateAdmin(language, 'admin.col.lastActive'),
      cell: (session) => <AdminMomentText moment={adminMomentOf(session.lastActivityAt ?? session.createdAt, now, language)} />,
    },
    ...(canRevoke
      ? [
          {
            id: 'actions',
            header: translateAdmin(language, 'admin.col.actions'),
            cell: (session: AdminSession) =>
              session.isValid ? (
                <button
                  type="button"
                  data-admin-action="revoke-session"
                  disabled={!online || running}
                  onClick={() => {
                    action.reset();
                    setTarget(session);
                  }}
                  className="inline-flex items-center gap-2 rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                  style={{
                    minHeight: 44,
                    backgroundColor: 'var(--color-ios-surface)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-edge)',
                    outlineColor: 'var(--color-ios-brand)',
                  }}
                >
                  <AdminGlyph name="prohibit" size={16} />
                  {translateAdmin(language, 'admin.security.revoke')}
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <>
      <DossierList
        language={language}
        query={sessions}
        offset={offset}
        onOffset={setOffset}
        columns={columns}
        rowKey={(session) => session.id}
        rowAttributes={(session) => ({ 'data-admin-session': session.id })}
        caption={translateAdmin(language, 'admin.security.sessions')}
      />
      {target === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.security.revoke.title')}
          body={translateAdmin(language, 'admin.security.revoke.body', { device: target.device })}
          confirmLabel={translateAdmin(language, 'admin.security.revoke')}
          tone="danger"
          busy={running}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={() => void revoke(target)}
          onCancel={close}
        />
      )}
    </>
  );
}
