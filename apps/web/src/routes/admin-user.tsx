import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { adminUserDetailQueryOptions, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { adminUserStatsQueryOptions } from '@/lib/api/admin-user-member';
import { apiDeps } from '@/lib/api/deps';
import { adminMoment } from '@/lib/admin/format';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useParams, useRoute, useSearch } from '@/lib/router';
import { ADMIN_USER_TABS, adminUserTabOf, withAdminUserTab, type AdminUserTab } from '@/lib/admin/user-tabs';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { AdminAnnouncement, AdminDenied, AdminLine as Ligne, AdminScreenFrame, AdminSection as Section, AdminSkeleton } from './admin-parts';
import { AdminMemberContactSection } from './admin-member-contact';
import { AdminMemberIdentitySection } from './admin-member-identity';
import { AdminMemberImagesSection } from './admin-member-images';
import { AdminMemberRoleSection } from './admin-member-role';
import { AdminMemberSecuritySection } from './admin-member-security';
import { AdminUserBanSheet } from './admin-user-ban-sheet';
import { AdminUserGallery } from './admin-user-gallery';
import { AdminUserPreferencesTab, AdminUserStatsSection } from './admin-user-member';
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
 * **Éditée EN PLACE, section par section** (#8289) — plus de bouton
 * « Modifier » : l'onglet Profil montre les images, l'identité (pseudo
 * compris), le contact et ses preuves, la sécurité, le rôle et le statut, et
 * chaque section porte son « Enregistrer ». Les gestes lourds — changer le
 * rôle, suspendre, réinitialiser un mot de passe, bannir — gardent chacun leur
 * confirmation : « une écriture d'administration sans sa confirmation serait
 * pire que son absence » (#6432).
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
  const sections = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role);
  const autorise = sections.some((section) => section.id === 'users');
  const gererConversation = sections.some((section) => section.id === 'conversations') ? (key === 'admUser' ? 'admConversation' : 'adminConversation') : null;

  const fiche = useQuery({ ...adminUserDetailQueryOptions(apiDeps, userId), enabled: autorise });

  const chiffres = useQuery({ ...adminUserStatsQueryOptions(apiDeps, userId), enabled: autorise });
  const [motDePasse, setMotDePasse] = useState(false);
  const [bannissement, setBannissement] = useState(false);
  const annonceur = useLiveAnnouncer();

  const titre = translateAdmin(language, 'admin.user.title');
  /* « ‹ Comptes » à gauche, le nom du membre en titre DANS le contenu (#8289). */
  const cadre = { language, title: titre, back: retour, heading: 'content', backLabel: translateAdmin(language, 'admin.nav.users') } as const;

  if (identite.isPending) {
    return (
      <AdminScreenFrame {...cadre}>
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame {...cadre}>
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  if (fiche.isPending) {
    return (
      <AdminScreenFrame {...cadre}>
        <AdminSkeleton rows={6} />
      </AdminScreenFrame>
    );
  }

  const membre = fiche.data;
  if (membre === undefined) {
    return (
      <AdminScreenFrame {...cadre}>
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.user.unavailable')}
        </p>
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame {...cadre}>
      <div className="grid gap-5" data-admin-user={membre.id}>
        <Entete membre={membre} language={language} />
        <Onglets language={language} actif={onglet} onChange={(suivant) => setSearch(withAdminUserTab(search, suivant), true)} />
        <div role="tabpanel" id={`admin-user-panel-${onglet}`} aria-labelledby={`admin-user-tab-${onglet}`} data-admin-user-panel={onglet}>
          {onglet === 'profile' ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <AdminMemberImagesSection key={`images-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} />
              </div>
              <div className="lg:col-span-2">
                <AdminMemberIdentitySection key={`identity-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} />
              </div>
              <AdminMemberContactSection key={`contact-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} />
              <AdminMemberSecuritySection
                membre={membre}
                language={language}
                sessions={chiffres.data?.activeSessions ?? null}
                onAnnounce={annonceur.announce}
                onOpenPassword={() => setMotDePasse(true)}
                onOpenSessions={() => setSearch(withAdminUserTab(search, 'security'), true)}
              />
              <AdminMemberRoleSection
                key={`role-${membre.id}`}
                membre={membre}
                language={language}
                onAnnounce={annonceur.announce}
                onOpenBan={() => setBannissement(true)}
              />
              <div className="grid content-start gap-5">
                <Section titre={translateAdmin(language, 'admin.user.account')}>
                  {/* UNE DATE SE LIT, ELLE NE SE RECOPIE PAS (#6819) — `adminMoment`
                      est le site que cet écran partage avec le pilotage de l'agent. */}
                  <Ligne label={translateAdmin(language, 'admin.user.created')} valeur={adminMoment(membre.createdAt, language)} />
                  <Ligne label={translateAdmin(language, 'admin.user.lastActive')} valeur={adminMoment(membre.lastActiveAt, language)} />
                </Section>
                <Metadonnees membre={membre} language={language} />
              </div>
              <div className="lg:col-span-2">
                <AdminUserStatsSection userId={membre.id} language={language} />
              </div>
              <div className="lg:col-span-2">
                <AdminUserGallery membre={membre} language={language} />
              </div>
            </div>
          ) : null}
          {/* Ce que ce membre a créé, et où il parle — en LECTURE. Les routes
              sont servies jusqu'à AUDIT, plus largement que les gestes
              d'écriture du profil qui exigent ADMIN+. La modale de lecture
              rend le fil dans le Prisme DU MEMBRE (#6862). */}
          {onglet === 'conversations' ? <AdminUserConversationsSection membre={membre} language={language} gerer={gererConversation} onAnnounce={annonceur.announce} /> : null}
          {onglet === 'media' ? <AdminUserMediaSection userId={membre.id} language={language} /> : null}
          {onglet === 'contacts' ? <AdminUserContactsTab userId={membre.id} language={language} cible={cibleMembre} /> : null}
          {onglet === 'communities' ? <AdminUserCommunitiesTab userId={membre.id} language={language} /> : null}
          {onglet === 'voice' ? <AdminUserVoiceTab userId={membre.id} language={language} /> : null}
          {onglet === 'preferences' ? <AdminUserPreferencesTab userId={membre.id} language={language} onAnnounce={annonceur.announce} /> : null}
          {onglet === 'security' ? <AdminUserSecurityTab userId={membre.id} language={language} /> : null}
          {onglet === 'reports' ? <AdminUserReportsTab userId={membre.id} language={language} /> : null}
        </div>
      </div>

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
  preferences: 'admin.tab.preferences',
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
   * LA PHOTO DU MEMBRE (#6975) — c'est le seul écran de l'application où
   * identifier une personne A une conséquence (désactiver, bannir,
   * réinitialiser un mot de passe). Sa bannière et sa photo en grand vivent
   * dans la section Images (#8289) ; l'en-tête garde le visage et le NOM, qui
   * est le titre de la page — son seul `<h1>`.
   */
  const photo = participantAvatarOf(membre);

  return (
    <div className="flex items-center gap-3">
      <Avatar
        initials={initialsOf(membre.displayName)}
        color="var(--color-ios-brand)"
        size={48}
        name={membre.displayName}
        {...(membre.isOnline ? { presence: 'online' as const } : {})}
        {...(photo === undefined ? {} : { src: photo })}
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-title font-bold" style={{ color: INK }} data-admin-page-title="">
          {membre.displayName}
        </h1>
        <p className="truncate text-caption" style={{ color: INK2 }}>
          @{membre.username}
        </p>
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
    [translateAdmin(language, 'admin.meta.timezone'), membre.timezone],
    [translateAdmin(language, 'admin.meta.emailVerified'), date(membre.emailVerifiedAt)],
    [translateAdmin(language, 'admin.meta.phoneVerified'), date(membre.phoneVerifiedAt)],
    [translateAdmin(language, 'admin.meta.completion'), membre.profileCompletionRate === null ? '' : `${Math.round(membre.profileCompletionRate)} %`],
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
