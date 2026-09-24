import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { adminEnumLabel } from '@/lib/admin/enum-labels';
import { adminMoment } from '@/lib/admin/format';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserBansQueryKey, loadAdminUserBans } from '@/lib/api/admin-user-bans';
import {
  ADMIN_SECURITY_PAGE_SIZE,
  adminUserSecurityEventsQueryKey,
  adminUserSessionsQueryKey,
  loadAdminUserSecurityEvents,
  loadAdminUserSessions,
  revokeAdminUserSession,
  type AdminSession,
  type AdminSessionPage,
} from '@/lib/api/admin-user-security';
import { adminUserStatsQueryKey } from '@/lib/api/admin-user-stats';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminAbsence, AdminPagination, AdminSkeleton } from './admin-parts';
import { banStateOf } from './admin-user-ban-sheet';

/**
 * **L'ONGLET SÉCURITÉ D'UN MEMBRE** (#7845) — ses appareils, ce qui lui est
 * arrivé, et ses bannissements passés.
 *
 * ## Le seul endroit où l'empreinte de connexion se montre
 *
 * Appareil, IP, ville : la fiche les REFUSE (sa clé est persistée). Ils se
 * lisent ici, sous des clés `admin-souverain` que `persistableQuery` n'écrit
 * jamais sur le disque (`admin-user-security.ts`).
 *
 * ## Révoquer coupe un appareil — ça se CONFIRME
 *
 * Premier appui : le bouton devient « Confirmer ». Second : `DELETE`, puis la
 * ligne passe « révoquée » dans le cache, sans relire la page — la passerelle
 * garde la session dans l'historique, l'écran fait de même.
 *
 * ## L'historique des bannissements, sans ouvrir la feuille
 *
 * Même clé que la feuille de bannissement (`adminUserBansQueryKey`) : la
 * lire ici ne coûte rien de plus, et un ban posé depuis la feuille apparaît
 * dans l'onglet sans recharger. Expiré n'est pas levé (`banStateOf`).
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const DANGER = 'var(--color-danger)';
const CARTE = { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' } as const;
const SEVERITES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const joindre = (...parties: readonly string[]) => parties.filter((p) => p.trim() !== '').join(' · ');

function Puce({ texte, ton }: { readonly texte: string; readonly ton: 'ok' | 'danger' | 'neutre' }) {
  const couleur = ton === 'danger' ? DANGER : ton === 'ok' ? 'var(--color-success)' : 'var(--color-ios-ink-2)';
  return (
    <span
      className="shrink-0 rounded-chip px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: couleur, backgroundColor: `color-mix(in srgb, ${couleur} 12%, transparent)` }}
    >
      {texte}
    </span>
  );
}

export function AdminUserSecurityPanel({
  userId,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  return (
    <div className="grid gap-5" data-admin-security>
      <Sessions userId={userId} language={language} onAnnounce={onAnnounce} deps={deps} />
      <Evenements userId={userId} language={language} deps={deps} />
      <Bannissements userId={userId} language={language} deps={deps} />
    </div>
  );
}

function Sessions({
  userId,
  language,
  onAnnounce,
  deps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps: AdminDeps;
}) {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const cle = adminUserSessionsQueryKey(userId, offset);
  const page = useQuery({
    queryKey: cle,
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserSessions({ ...deps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  async function revoquer(session: AdminSession) {
    if (aConfirmer !== session.id) {
      setAConfirmer(session.id);
      return;
    }
    setAConfirmer(null);
    const resultat = await revokeAdminUserSession({ ...deps, userId, sessionId: session.id });
    if (!resultat.ok) {
      onAnnounce(translateAdmin(language, 'admin.account.failed'));
      return;
    }
    // Le compteur de sessions actives de la fiche vient d'une AUTRE lecture.
    void client.invalidateQueries({ queryKey: adminUserStatsQueryKey(userId) });
    client.setQueryData<AdminSessionPage>(cle, (courante) =>
      courante === undefined
        ? courante
        : {
            ...courante,
            sessions: courante.sessions.map((s) => (s.id === session.id ? { ...s, isValid: false, invalidatedAt: new Date().toISOString() } : s)),
          },
    );
    onAnnounce(translateAdmin(language, 'admin.security.revoked.done'));
  }

  return (
    <CollapsibleSection id="admin-sessions" title={translateAdmin(language, 'admin.security.sessions')} card={false}>
      {page.isPending ? (
        <AdminSkeleton rows={2} />
      ) : page.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.security.unavailable" />
      ) : page.data.sessions.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.activity.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {page.data.sessions.map((session) => (
              <li key={session.id} data-admin-session={session.id} className="grid gap-1.5 rounded-card px-4 py-3" style={CARTE}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-body font-semibold [overflow-wrap:anywhere]" style={{ color: INK }}>
                    {joindre(`${session.browserName} ${session.browserVersion}`, `${session.osName} ${session.osVersion}`, session.deviceModel) || session.deviceType || '—'}
                  </p>
                  <span data-admin-session-state className="contents">
                    <Puce
                      texte={translateAdmin(language, session.isValid ? 'admin.security.current' : 'admin.security.revoked')}
                      ton={session.isValid ? 'ok' : 'neutre'}
                    />
                  </span>
                </div>
                <p className="text-caption" style={{ color: INK2 }}>
                  {joindre(session.ipAddress, session.city === '' ? session.location : session.city, session.country) || '—'}
                </p>
                <p className="text-caption" style={{ color: INK2 }}>
                  {translateAdmin(language, 'admin.security.lastActiveOn', { date: adminMoment(session.lastActivityAt ?? session.createdAt, language) })}
                </p>
                {session.isValid ? (
                  <button
                    type="button"
                    data-admin-session-revoke={session.id}
                    onClick={() => void revoquer(session)}
                    className="justify-self-start rounded-chip px-4 text-caption font-semibold"
                    style={{
                      minHeight: 44,
                      color: aConfirmer === session.id ? 'white' : DANGER,
                      backgroundColor: aConfirmer === session.id ? DANGER : `color-mix(in srgb, ${DANGER} 10%, transparent)`,
                    }}
                  >
                    {translateAdmin(language, aConfirmer === session.id ? 'admin.edit.confirm' : 'admin.security.revoke')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <AdminPagination language={language} offset={offset} hasMore={page.data.hasMore} size={ADMIN_SECURITY_PAGE_SIZE} onOffset={setOffset} />
        </>
      )}
    </CollapsibleSection>
  );
}

function Evenements({ userId, language, deps }: { readonly userId: string; readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
  const [offset, setOffset] = useState(0);
  const [severite, setSeverite] = useState('');
  const page = useQuery({
    queryKey: adminUserSecurityEventsQueryKey(userId, offset, severite, ''),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserSecurityEvents({ ...deps, userId, offset, severity: severite, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  return (
    <CollapsibleSection id="admin-security-events" title={translateAdmin(language, 'admin.security.events')} card={false}>
      <select
        data-admin-security-severity
        aria-label={translateAdmin(language, 'admin.security.severity')}
        value={severite}
        onChange={(event) => {
          setSeverite(event.currentTarget.value);
          setOffset(0);
        }}
        className="justify-self-start rounded-chip px-3 text-body"
        style={{ minHeight: 44, ...CARTE, color: INK }}
      >
        <option value="">{`${translateAdmin(language, 'admin.security.severity')} · ${translateAdmin(language, 'admin.conv.all')}`}</option>
        {SEVERITES.map((s) => (
          <option key={s} value={s}>
            {adminEnumLabel(language, 'severity', s)}
          </option>
        ))}
      </select>
      {page.isPending ? (
        <AdminSkeleton rows={2} />
      ) : page.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.security.unavailable" />
      ) : page.data.events.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.security.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {page.data.events.map((evenement) => (
              <li key={evenement.id} data-admin-security-event={evenement.id} className="grid gap-1 rounded-card px-4 py-3" style={CARTE}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words font-mono text-caption font-semibold [overflow-wrap:anywhere]" style={{ color: INK }}>
                    {evenement.eventType}
                  </p>
                  <Puce texte={adminEnumLabel(language, 'severity', evenement.severity)} ton={evenement.severity === 'HIGH' || evenement.severity === 'CRITICAL' ? 'danger' : 'neutre'} />
                </div>
                {evenement.description === '' ? null : (
                  <p className="break-words text-body [overflow-wrap:anywhere]" style={{ color: INK }}>
                    {evenement.description}
                  </p>
                )}
                <p className="break-words text-caption [overflow-wrap:anywhere]" style={{ color: INK2 }}>
                  {joindre(adminMoment(evenement.createdAt, language), evenement.ipAddress, evenement.geoLocation, adminEnumLabel(language, 'eventStatus', evenement.status))}
                </p>
              </li>
            ))}
          </ul>
          <AdminPagination language={language} offset={offset} hasMore={page.data.hasMore} size={ADMIN_SECURITY_PAGE_SIZE} onOffset={setOffset} />
        </>
      )}
    </CollapsibleSection>
  );
}

function Bannissements({ userId, language, deps }: { readonly userId: string; readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
  const historique = useQuery({
    queryKey: adminUserBansQueryKey(userId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserBans({ ...deps, userId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  return (
    <CollapsibleSection id="admin-ban-history" title={translateAdmin(language, 'admin.security.bans')} card={false}>
      {historique.isPending ? (
        <AdminSkeleton rows={1} />
      ) : historique.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.security.unavailable" />
      ) : historique.data.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.ban.none')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {historique.data.map((ban) => {
            const etat = banStateOf(ban);
            return (
              <li key={ban.id} data-admin-ban-history={ban.id} data-admin-ban-state={etat} className="grid gap-1 rounded-card px-4 py-3" style={CARTE}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-body [overflow-wrap:anywhere]" style={{ color: INK }}>
                    {ban.reason}
                  </p>
                  <Puce
                    texte={translateAdmin(language, etat === 'active' ? 'admin.ban.active' : etat === 'lifted' ? 'admin.ban.lifted' : 'admin.ban.expired')}
                    ton={etat === 'active' ? 'danger' : 'neutre'}
                  />
                </div>
                <p className="text-caption" style={{ color: INK2 }}>
                  {joindre(adminMoment(ban.createdAt, language), ban.expiresAt === null ? translateAdmin(language, 'admin.ban.permanent') : translateAdmin(language, 'admin.ban.untilDate', { date: adminMoment(ban.expiresAt, language) }))}
                </p>
                {ban.liftReason === null ? null : (
                  <p className="break-words text-caption [overflow-wrap:anywhere]" style={{ color: INK2 }}>
                    {ban.liftReason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
