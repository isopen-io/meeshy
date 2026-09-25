import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { adminEnumLabel } from '@/lib/admin/enum-labels';
import { adminCount, adminMoment } from '@/lib/admin/format';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_ACTIVITY_PAGE_SIZE,
  adminUserActivityQueryKey,
  adminUserReportedMessagesQueryKey,
  adminUserReportsQueryKey,
  loadAdminUserActivity,
  loadAdminUserReportedMessages,
  loadAdminUserReports,
  type AdminFriendRequest,
} from '@/lib/api/admin-user-activity';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminAbsence, AdminPagination, AdminSkeleton } from './admin-parts';
import { Link } from './route-table';

/**
 * **LES ONGLETS CONTACTS ET SIGNALEMENTS D'UN MEMBRE** (#7845, #7873) — ce
 * qu'il a signalé et ce qu'on lui a signalé d'un côté ; les liens qu'il a
 * créés et ses demandes d'amis de l'autre.
 *
 * Deux onglets et non un : l'ancien onglet « Activité » mêlait la modération
 * (qui lit des motifs et des extraits) et le réseau (qui lit des noms). Un
 * administrateur venu voir qui ce membre connaît n'a pas à ouvrir, au passage,
 * les signalements — ni à les faire lire à la passerelle.
 *
 * ## Un contenu MASQUÉ se dit masqué
 *
 * Pour qui n'a pas `canModerateContent`, la passerelle garde la ligne d'un
 * message signalé et met son `content` à `null`. L'écran écrit « contenu
 * masqué » — jamais une ligne vide, qui laisserait croire un message sans
 * texte.
 *
 * ## Trois lectures, trois refus possibles
 *
 * Les signalements émis demandent `canModerateContent` ; un AUDIT les voit
 * refusés en 403 pendant que le reste de l'onglet répond. Chaque section porte
 * donc son propre état — un refus d'une section n'éteint pas les deux autres.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const CARTE = { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' } as const;

const joindre = (...parties: readonly string[]) => parties.filter((p) => p.trim() !== '').join(' · ');

function Ligne({ data, titre, children }: { readonly data: string; readonly titre: ReactNode; readonly children: ReactNode }) {
  return (
    <li data-admin-activity={data} className="grid gap-1 rounded-card px-4 py-3" style={CARTE}>
      <p className="break-words text-body font-semibold [overflow-wrap:anywhere]" style={{ color: INK }}>
        {titre}
      </p>
      <p className="break-words text-caption [overflow-wrap:anywhere]" style={{ color: INK2 }}>
        {children}
      </p>
    </li>
  );
}

function Vide({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p className="text-caption" style={{ color: INK2 }}>
      {translateAdmin(language, 'admin.activity.empty')}
    </p>
  );
}

/** La fiche d'un autre membre, dans l'ESPACE d'où l'on vient (D-76). */
export type AdminMemberRoute = 'adminUser' | 'admUser';

export function AdminUserReportsPanel({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  return (
    <div className="grid gap-5" data-admin-reports-panel>
      <MessagesSignales userId={userId} language={language} deps={deps} />
      <SignalementsEmis userId={userId} language={language} deps={deps} />
    </div>
  );
}

export function AdminUserContactsPanel({
  userId,
  language,
  cible,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly cible: AdminMemberRoute;
  readonly deps?: AdminDeps;
}) {
  return (
    <div className="grid gap-5" data-admin-contacts-panel>
      <LiensEtAmis userId={userId} language={language} deps={deps} cible={cible} />
    </div>
  );
}

type Props = { readonly userId: string; readonly language: InterfaceLanguage; readonly deps: AdminDeps };

function MessagesSignales({ userId, language, deps }: Props) {
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: adminUserReportedMessagesQueryKey(userId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserReportedMessages({ ...deps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  return (
    <CollapsibleSection id="admin-reported-messages" title={translateAdmin(language, 'admin.activity.reportedMessages')} card={false}>
      {page.isPending ? (
        <AdminSkeleton rows={2} />
      ) : page.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.activity.unavailable" />
      ) : page.data.reports.length === 0 ? (
        <Vide language={language} />
      ) : (
        <>
          <ul className="grid gap-2">
            {page.data.reports.map((r) => (
              <Ligne key={r.id} data={r.id} titre={r.message?.content ?? translateAdmin(language, 'admin.activity.hiddenContent')}>
                {joindre(
                  adminEnumLabel(language, 'reportType', r.reportType),
                  r.reason,
                  adminEnumLabel(language, 'status', r.status),
                  r.reporterName,
                  adminMoment(r.createdAt, language),
                )}
              </Ligne>
            ))}
          </ul>
          <AdminPagination language={language} offset={offset} hasMore={page.data.hasMore} size={ADMIN_ACTIVITY_PAGE_SIZE} onOffset={setOffset} />
        </>
      )}
    </CollapsibleSection>
  );
}

function SignalementsEmis({ userId, language, deps }: Props) {
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: adminUserReportsQueryKey(userId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserReports({ ...deps, userId, offset, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  return (
    <CollapsibleSection id="admin-reports-made" title={translateAdmin(language, 'admin.activity.reportsMade')} card={false}>
      {page.isPending ? (
        <AdminSkeleton rows={2} />
      ) : page.data === undefined ? (
        <AdminAbsence language={language} unavailable="admin.activity.unavailable" />
      ) : page.data.reports.length === 0 ? (
        <Vide language={language} />
      ) : (
        <>
          <ul className="grid gap-2">
            {page.data.reports.map((r) => (
              <Ligne key={r.id} data={r.id} titre={r.reason === '' ? adminEnumLabel(language, 'reportType', r.reportType) : r.reason}>
                {joindre(
                  adminEnumLabel(language, 'reportedType', r.reportedType),
                  adminEnumLabel(language, 'reportType', r.reportType),
                  adminEnumLabel(language, 'status', r.status),
                  r.actionTaken ?? '',
                  adminMoment(r.createdAt, language),
                )}
              </Ligne>
            ))}
          </ul>
          <AdminPagination language={language} offset={offset} hasMore={page.data.hasMore} size={ADMIN_ACTIVITY_PAGE_SIZE} onOffset={setOffset} />
        </>
      )}
    </CollapsibleSection>
  );
}

function LiensEtAmis({ userId, language, deps, cible }: Props & { readonly cible: AdminMemberRoute }) {
  const activite = useQuery({
    queryKey: adminUserActivityQueryKey(userId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserActivity({ ...deps, userId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  if (activite.data === undefined) {
    return (
      <CollapsibleSection id="admin-links" title={translateAdmin(language, 'admin.activity.links')} card={false}>
        {activite.isPending ? <AdminSkeleton rows={2} /> : <AdminAbsence language={language} unavailable="admin.activity.unavailable" />}
      </CollapsibleSection>
    );
  }

  const { shareLinks, trackingLinks, affiliateTokens, friendRequests } = activite.data;
  const utilisations = (courantes: number, max: number | null) =>
    max === null ? adminCount(courantes, language) : `${adminCount(courantes, language)} / ${adminCount(max, language)}`;

  return (
    <>
      <CollapsibleSection id="admin-links" title={translateAdmin(language, 'admin.activity.links')} card={false}>
        {shareLinks.length + trackingLinks.length + affiliateTokens.length === 0 ? (
          <Vide language={language} />
        ) : (
          <ul className="grid gap-2">
            {shareLinks.map((l) => (
              <Ligne key={l.id} data={l.id} titre={l.name === '' ? (l.conversationIdentifier ?? l.id) : l.name}>
                {joindre(translateAdmin(language, 'admin.stats.shareLinks'), utilisations(l.currentUses, l.maxUses), l.isActive ? '' : translateAdmin(language, 'admin.users.inactive'), adminMoment(l.createdAt, language))}
              </Ligne>
            ))}
            {trackingLinks.map((l) => (
              <Ligne key={l.id} data={l.id} titre={l.name === '' ? l.shortUrl : l.name}>
                {joindre(translateAdmin(language, 'admin.stats.trackingLinks'), `${adminCount(l.totalClicks, language)} ↗`, l.campaign, l.isActive ? '' : translateAdmin(language, 'admin.users.inactive'), adminMoment(l.createdAt, language))}
              </Ligne>
            ))}
            {affiliateTokens.map((l) => (
              <Ligne key={l.id} data={l.id} titre={l.name === '' ? l.id : l.name}>
                {joindre(translateAdmin(language, 'admin.stats.affiliations'), adminCount(l.affiliations, language), utilisations(l.currentUses, l.maxUses), adminMoment(l.createdAt, language))}
              </Ligne>
            ))}
          </ul>
        )}
      </CollapsibleSection>
      <CollapsibleSection id="admin-friend-requests" title={translateAdmin(language, 'admin.activity.friendRequests')} card={false}>
        {friendRequests.length === 0 ? (
          <Vide language={language} />
        ) : (
          <ul className="grid gap-2">
            {friendRequests.map((r) => (
              <Ligne key={r.id} data={r.id} titre={<Personne demande={r} language={language} cible={cible} />}>
                {joindre(adminEnumLabel(language, 'status', r.status), adminMoment(r.createdAt, language))}
              </Ligne>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </>
  );
}

/**
 * L'AUTRE PERSONNE d'une demande d'ami MÈNE À SA FICHE (#7873) : un
 * administrateur qui instruit un harcèlement suit le fil d'un membre à
 * l'autre, et recopier un pseudonyme dans la recherche de la liste lui ferait
 * perdre l'onglet où il était. Une demande dont l'autre compte n'est plus
 * servi reste un texte — un lien vers une fiche absente ne mène nulle part.
 */
function Personne({
  demande,
  language,
  cible,
}: {
  readonly demande: AdminFriendRequest;
  readonly language: InterfaceLanguage;
  readonly cible: AdminMemberRoute;
}) {
  const cle = demande.direction === 'sent' ? 'admin.activity.sentTo' : 'admin.activity.receivedFrom';
  const autre = demande.other;
  if (autre === null) return <>{translateAdmin(language, cle, { name: '—' })}</>;
  return (
    <Link
      to={cible}
      params={{ user: autre.id }}
      data-admin-contact-open={autre.id}
      className="inline-flex items-center underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
    >
      {translateAdmin(language, cle, { name: `${autre.displayName} (@${autre.username})` })}
    </Link>
  );
}
