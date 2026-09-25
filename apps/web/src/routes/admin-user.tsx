import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { adminUserDetailQueryKey, adminUserDetailQueryOptions, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { adminMoment } from '@/lib/admin/format';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useParams, useRoute, useSearch } from '@/lib/router';
import { ADMIN_USER_TABS, adminUserTabOf, withAdminUserTab, type AdminUserTab } from '@/lib/admin/user-tabs';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { ActionButton } from '@/routes/link-page-parts';

import { AdminAnnouncement, AdminDenied, AdminLine as Ligne, AdminScreenFrame, AdminSection as Section, AdminSkeleton } from './admin-parts';
import { AdminUserEditSheet } from './admin-user-edit-sheet';
import { AdminUserBanSheet } from './admin-user-ban-sheet';
import { AdminUserGallery } from './admin-user-gallery';
import { AdminUserConversationsSection, AdminUserMediaSection } from './admin-user-lists';
import { AdminUserPasswordSheet } from './admin-user-password-sheet';
import {
  AdminUserCommunitiesTab,
  AdminUserContactsTab,
  AdminUserReportsTab,
  AdminUserSecurityTab,
  AdminUserVoiceTab,
} from './admin-user-dossier';

/**
 * **LE DÉTAIL D'UN MEMBRE** (#6819) — `/admin/users/$user` et `/adm/users/$user`,
 * premier écran de l'administration RÉÉCRITE sur le design system v2 (D-77).
 *
 * **En LECTURE seule pour l'instant.** Les six gestes que la passerelle sert
 * réellement — éditer, réinitialiser le mot de passe, désactiver, bannir,
 * lever un bannissement — arrivent par incréments séparés, chacun AVEC sa
 * confirmation : le port le dit depuis #6432, « une écriture d'administration
 * sans sa confirmation serait pire que son absence ».
 *
 * **Le retour reste dans l'ESPACE d'où l'on vient.** `useRoute().key` distingue
 * `admUser` de `adminUser` : renvoyer les deux vers la même liste ferait sauter
 * l'administrateur d'une administration à l'autre au premier retour, alors que
 * D-76 les tient séparées à dessein.
 *
 * **La garde est celle de la liste**, lue au SERVEUR (`GET /me/permissions`) et
 * jamais déduite d'un rôle côté client. Tant que #6825 n'est pas tranchée, la
 * v2 exige `canManageUsers` (ADMIN+) là où la passerelle sert la lecture à
 * `canViewUsers` (jusqu'à AUDIT) : cet écran hérite donc du seuil de sa
 * section, sciemment, plutôt que d'en inventer un troisième.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

export default function AdminUserScreen() {
  const language = currentInterfaceLanguage();
  const { user: userId } = useParams<'/admin/users/$user'>();
  const { key } = useRoute();
  const retour = key === 'admUser' ? 'admUsers' : 'adminUsers';
  const cibleMembre = key === 'admUser' ? ('admUser' as const) : ('adminUser' as const);
  const [search, setSearch] = useSearch();
  const onglet = adminUserTabOf(search);

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const autorise = visibleAdminSections(identite.data?.permissions ?? null).some((section) => section.id === 'users');

  const fiche = useQuery({ ...adminUserDetailQueryOptions(apiDeps, userId), enabled: autorise });

  const [edition, setEdition] = useState(false);
  const [motDePasse, setMotDePasse] = useState(false);
  const [bannissement, setBannissement] = useState(false);
  const annonceur = useLiveAnnouncer();
  const client = useQueryClient();

  const titre = translateAdmin(language, 'admin.user.title');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  if (fiche.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <AdminSkeleton rows={6} />
      </AdminScreenFrame>
    );
  }

  const membre = fiche.data;
  if (membre === undefined) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.user.unavailable')}
        </p>
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame language={language} title={titre} back={retour}>
      <div className="grid gap-5" data-admin-user={membre.id}>
        <Entete membre={membre} language={language} />
        <Onglets language={language} actif={onglet} onChange={(suivant) => setSearch(withAdminUserTab(search, suivant), true)} />
        <div role="tabpanel" id={`admin-user-panel-${onglet}`} aria-labelledby={`admin-user-tab-${onglet}`} data-admin-user-panel={onglet}>
          {onglet === 'profile' ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <AdminUserGallery membre={membre} language={language} />
              </div>
              <Section titre={translateAdmin(language, 'admin.user.identity')}>
                <Ligne label="@" valeur={membre.username} />
                <Ligne label="✉" valeur={membre.email} />
                {membre.phoneNumber === '' ? null : <Ligne label="☎" valeur={membre.phoneNumber} />}
              </Section>
              <Section titre={translateAdmin(language, 'admin.user.account')}>
                <Ligne label={translateAdmin(language, 'admin.user.role')} valeur={membre.role} />
                {/* UNE DATE SE LIT, ELLE NE SE RECOPIE PAS (#6819, recette au
                    navigateur) : ces deux lignes peignaient
                    « 2026-01-12T08:30:00.000Z ». Le champ, son décodage et le
                    libellé étaient justes — seul le RENDU ne l'était pas, et aucun
                    témoin ne pouvait tomber puisque la valeur affichée était
                    exactement la valeur servie. `adminMoment` est le site que cet
                    écran partage avec le pilotage de l'agent. */}
                <Ligne label={translateAdmin(language, 'admin.user.created')} valeur={adminMoment(membre.createdAt, language)} />
                <Ligne label={translateAdmin(language, 'admin.user.lastActive')} valeur={adminMoment(membre.lastActiveAt, language)} />
                <Ligne
                  label={translateAdmin(language, 'admin.user.twoFactor')}
                  valeur={translateAdmin(language, membre.twoFactorEnabled ? 'admin.user.enabled' : 'admin.users.inactive')}
                />
              </Section>
              <Metadonnees membre={membre} language={language} />

              <div className="grid gap-2">
                <ActionButton onClick={() => setEdition(true)}>{translateAdmin(language, 'admin.edit.open')}</ActionButton>
                {/* Ton `danger` : le geste révoque les sessions ouvertes de la cible,
                    qui se retrouve déconnectée partout. La couleur le dit avant que
                    la feuille ne l'écrive. */}
                <ActionButton tone="danger" onClick={() => setMotDePasse(true)}>
                  {translateAdmin(language, 'admin.password.title')}
                </ActionButton>
                <ActionButton tone="danger" onClick={() => setBannissement(true)}>
                  {translateAdmin(language, 'admin.ban.open')}
                </ActionButton>
              </div>
            </div>
          ) : null}
          {/* Ce que ce membre a créé, et où il parle — en LECTURE. Les routes
              sont servies jusqu'à AUDIT, plus largement que les gestes
              d'écriture du profil qui exigent ADMIN+. La modale de lecture
              rend le fil dans le Prisme DU MEMBRE (#6862). */}
          {onglet === 'conversations' ? <AdminUserConversationsSection membre={membre} language={language} /> : null}
          {onglet === 'media' ? <AdminUserMediaSection userId={membre.id} language={language} /> : null}
          {onglet === 'contacts' ? <AdminUserContactsTab userId={membre.id} language={language} cible={cibleMembre} /> : null}
          {onglet === 'communities' ? <AdminUserCommunitiesTab userId={membre.id} language={language} /> : null}
          {onglet === 'voice' ? <AdminUserVoiceTab userId={membre.id} language={language} /> : null}
          {onglet === 'security' ? <AdminUserSecurityTab userId={membre.id} language={language} /> : null}
          {onglet === 'reports' ? <AdminUserReportsTab userId={membre.id} language={language} /> : null}
        </div>
      </div>

      {edition ? (
        <AdminUserEditSheet
          membre={membre}
          language={language}
          onClose={() => setEdition(false)}
          onAnnounce={annonceur.announce}
          /**
           * La route de PATCH rend le membre À JOUR, sanitisé : on l'écrit
           * dans le cache plutôt que d'invalider. Invalider coûterait un
           * aller-retour pour obtenir ce qu'on tient déjà, et laisserait
           * l'écran afficher l'état d'AVANT pendant qu'il revient.
           */
          onSaved={(aJour) => client.setQueryData(adminUserDetailQueryKey(userId), aJour)}
        />
      ) : null}

      {motDePasse ? (
        <AdminUserPasswordSheet
          userId={membre.id}
          language={language}
          onClose={() => setMotDePasse(false)}
          onAnnounce={annonceur.announce}
        />
      ) : null}

      {bannissement ? (
        <AdminUserBanSheet
          userId={membre.id}
          language={language}
          onClose={() => setBannissement(false)}
          onAnnounce={annonceur.announce}
        />
      ) : null}

      <AdminAnnouncement text={annonceur.text} />
    </AdminScreenFrame>
  );
}

const LIBELLES_ONGLETS = {
  profile: 'admin.tab.profile',
  conversations: 'admin.tab.conversations',
  media: 'admin.tab.media',
  contacts: 'admin.tab.contacts',
  communities: 'admin.tab.communities',
  voice: 'admin.tab.voice',
  security: 'admin.tab.security',
  reports: 'admin.tab.reports',
} as const satisfies Readonly<Record<AdminUserTab, string>>;

/**
 * LES ONGLETS DE LA FICHE (#7845, #7873) — un `tablist` ARIA : flèches
 * gauche/droite pour passer d'un onglet à l'autre, un seul arrêt de
 * tabulation (l'onglet actif), et l'onglet dans l'adresse.
 */
function Onglets({
  language,
  actif,
  onChange,
}: {
  readonly language: InterfaceLanguage;
  readonly actif: AdminUserTab;
  readonly onChange: (onglet: AdminUserTab) => void;
}) {
  const aller = (pas: number) => {
    const index = ADMIN_USER_TABS.indexOf(actif);
    const suivant = ADMIN_USER_TABS[(index + pas + ADMIN_USER_TABS.length) % ADMIN_USER_TABS.length] ?? 'profile';
    onChange(suivant);
    requestAnimationFrame(() => document.getElementById(`admin-user-tab-${suivant}`)?.focus());
  };
  return (
    <div
      role="tablist"
      aria-label={translateAdmin(language, 'admin.tab.label')}
      className="flex gap-1 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--color-edge)' }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') aller(document.dir === 'rtl' ? -1 : 1);
        if (event.key === 'ArrowLeft') aller(document.dir === 'rtl' ? 1 : -1);
      }}
    >
      {ADMIN_USER_TABS.map((onglet) => {
        const selectionne = onglet === actif;
        return (
          <button
            key={onglet}
            type="button"
            role="tab"
            id={`admin-user-tab-${onglet}`}
            aria-selected={selectionne}
            aria-controls={`admin-user-panel-${onglet}`}
            tabIndex={selectionne ? 0 : -1}
            data-admin-user-tab={onglet}
            onClick={() => onChange(onglet)}
            className="shrink-0 px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              color: selectionne ? 'var(--color-ios-brand)' : INK2,
              fontWeight: selectionne ? 600 : 500,
              borderBottom: `2px solid ${selectionne ? 'var(--color-ios-brand)' : 'transparent'}`,
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translateAdmin(language, LIBELLES_ONGLETS[onglet])}
          </button>
        );
      })}
    </div>
  );
}

/**
 * L'ÉTAT se lit en TROIS champs, jamais en un statut calculé (#6822) :
 * `DELETE /admin/users/:userId` n'écrit que `isActive:false` — ni `deletedAt`,
 * ni `deletedBy`. Un compte supprimé arrive donc avec `deletedAt: null`, et
 * afficher « supprimé » sur la seule foi de `isActive` mentirait. On dit donc
 * « supprimé » QUAND la passerelle l'affirme, « désactivé » sinon.
 */
function Entete({ membre, language }: { readonly membre: AdminUserDetail; readonly language: InterfaceLanguage }) {
  const etat = membre.deletedAt !== null ? 'admin.user.deleted' : membre.isActive ? null : 'admin.users.inactive';
  /**
   * LA PHOTO DU MEMBRE (#6975) — `AdminUserDetail.avatar` est SERVI
   * (`api/admin-user-detail.ts:56`) et cette fiche ne montait aucun avatar du
   * tout : un nom, une bio, une pastille d'activité. C'est le seul écran de
   * l'application où identifier une personne A une conséquence (désactiver,
   * bannir, réinitialiser un mot de passe), et c'était le seul à ne pas
   * montrer son visage.
   */
  const photo = participantAvatarOf(membre);

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-2 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: membre.isOnline ? 'var(--color-success, #34D399)' : 'transparent' }}
      />
      <Avatar
        initials={initialsOf(membre.displayName)}
        color="var(--color-ios-brand)"
        size={44}
        name={membre.displayName}
        {...(photo === undefined ? {} : { src: photo })}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-title font-semibold" style={{ color: INK }}>
          {membre.displayName}
        </p>
        {membre.bio === '' ? null : (
          <p className="truncate text-caption" style={{ color: INK2 }}>
            {membre.bio}
          </p>
        )}
      </div>
      {etat === null ? null : (
        <span className="shrink-0 text-caption" style={{ color: 'var(--color-danger)' }}>
          {translateAdmin(language, etat)}
        </span>
      )}
    </div>
  );
}

/**
 * TOUTES LES MÉTADONNÉES SERVIES (#7845) — langues du Prisme, fuseau,
 * vérifications, verrouillage, complétion. Une ligne sans valeur ne
 * s'affiche pas : « — » répété dix fois ne dit rien de plus qu'une absence.
 */
function Metadonnees({ membre, language }: { readonly membre: AdminUserDetail; readonly language: InterfaceLanguage }) {
  const date = (valeur: string | null) => (valeur === null ? '' : adminMoment(valeur, language));
  const lignes: readonly (readonly [string, string])[] = [
    [translateAdmin(language, 'admin.meta.name'), [membre.firstName, membre.lastName].filter((part) => part !== '').join(' ')],
    [translateAdmin(language, 'admin.meta.systemLanguage'), membre.systemLanguage],
    [translateAdmin(language, 'admin.meta.regionalLanguage'), membre.regionalLanguage],
    [translateAdmin(language, 'admin.meta.customLanguage'), membre.customDestinationLanguage],
    [translateAdmin(language, 'admin.meta.timezone'), membre.timezone],
    [translateAdmin(language, 'admin.meta.emailVerified'), date(membre.emailVerifiedAt)],
    [translateAdmin(language, 'admin.meta.phoneVerified'), date(membre.phoneVerifiedAt)],
    [translateAdmin(language, 'admin.meta.completion'), membre.profileCompletionRate === null ? '' : `${Math.round(membre.profileCompletionRate)} %`],
    [translateAdmin(language, 'admin.meta.passwordChanged'), date(membre.lastPasswordChange)],
    [translateAdmin(language, 'admin.meta.failedLogins'), membre.failedLoginAttempts === 0 ? '' : String(membre.failedLoginAttempts)],
    [translateAdmin(language, 'admin.meta.lockedUntil'), date(membre.lockedUntil)],
    [translateAdmin(language, 'admin.meta.lockedReason'), membre.lockedReason ?? ''],
    [translateAdmin(language, 'admin.meta.deactivated'), date(membre.deactivatedAt)],
    [translateAdmin(language, 'admin.meta.updated'), date(membre.updatedAt)],
  ];
  return (
    <Section titre={translateAdmin(language, 'admin.meta.title')}>
      {lignes
        .filter(([, valeur]) => valeur !== '')
        .map(([label, valeur]) => (
          <Ligne key={label} label={label} valeur={valeur} />
        ))}
    </Section>
  );
}
