import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AuthAmbient } from '@/components/auth-chrome';
import { AdminBadge, AdminInterpretedBadge, AdminRoleBadge } from '@/components/admin/badges';
import { AdminFiche, AdminIdentityHeader } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminLink } from '@/components/admin/entity-chip';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { accountStateOf } from '@/lib/admin/interpret/enums';
import { personInitials } from '@/lib/admin/interpret/labels';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { userEntityOf } from '@/lib/admin/user-entity';
import { adminUserTabOf, withAdminUserTab } from '@/lib/admin/user-tabs';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserBansQueryOptions } from '@/lib/api/admin-user-bans';
import { adminUserDetailQueryOptions, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import { adminUserStatsQueryOptions } from '@/lib/api/admin-user-member';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useParams, useSearch } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { AdminMemberContactSection } from './admin-member-contact';
import { AdminMemberIdentitySection } from './admin-member-identity';
import { AdminMemberImagesSection } from './admin-member-images';
import { AdminMemberMeta } from './admin-member-meta';
import { AdminMemberQuickActions } from './admin-member-quick-actions';
import { AdminMemberRoleSection } from './admin-member-role';
import { AdminMemberSecuritySection } from './admin-member-security';
import { AdminMemberStats } from './admin-member-stats';
import { AdminAnnouncement, AdminSkeleton } from './admin-parts';
import { AdminUserBanSheet } from './admin-user-ban-sheet';
import {
  AdminUserCommunitiesTab,
  AdminUserContactsTab,
  AdminUserReportsTab,
  AdminUserSecurityTab,
  AdminUserVoiceTab,
} from './admin-user-dossier';
import { AdminUserGallery } from './admin-user-gallery';
import { AdminUserConversationsSection, AdminUserMediaSection } from './admin-user-lists';
import { AdminUserPasswordSheet } from './admin-user-password-sheet';
import { AdminUserPreferencesTab } from './admin-user-preferences';
import { AdminUserTabs } from './admin-user-tabs';

/**
 * **LA FICHE D'UN MEMBRE** (#6819, #8005) — `/admin/users/$user` et `/adm/users/$user`,
 * la « vue de dieu » sur UNE personne, sur le kit d'administration : en-tête
 * d'identité (vrai nom, `@pseudo`, avatar et présence calculée, rôle, état, preuves
 * et double authentification dits en mots), quinze chiffres, colonne de métadonnées
 * INTERPRÉTÉES, puis les onglets du dossier.
 *
 * **Éditée EN PLACE, section par section** (#8289) — plus de bouton « Modifier » :
 * l'onglet Profil montre les images, l'identité (pseudo compris), le contact et ses
 * preuves, la sécurité, le rôle et le statut, et chaque section porte son
 * « Enregistrer ». Les gestes lourds — changer le rôle, suspendre, réinitialiser un
 * mot de passe, bannir, déverrouiller, retirer la double authentification, poser un
 * consentement — gardent chacun leur confirmation : « une écriture d'administration
 * sans sa confirmation serait pire que son absence » (#6432).
 *
 * **Le retour reste dans l'ESPACE d'où l'on vient** (`AdminSectionScreen` le lit dans
 * la route : `/adm` ne renvoie jamais vers `/admin`, D-76) et **la garde est celle de la
 * liste**, lue au SERVEUR (`GET /me/permissions`) et jamais déduite d'un rôle côté client.
 *
 * Les ancres `data-admin-user`, `data-admin-user-panel` et `data-admin-user-tab` sont un
 * CONTRAT de la recette `check-admin-souverain` : elles ne se renomment pas.
 */

/** Un refus se dit comme un refus (403), un membre introuvable comme tel (404) : jamais les deux comme « une panne ». */
function FicheState({ language, onRetry, denied, notFound }: { readonly language: AdminLanguage; readonly onRetry: () => void; readonly denied: boolean; readonly notFound: boolean }) {
  if (denied) return <AdminDeniedInline language={language} />;
  return <AdminErrorState language={language} message={translateAdmin(language, notFound ? 'admin.people.notFound' : 'admin.user.unavailable')} onRetry={onRetry} />;
}

export function AdminUserFiche({
  userId,
  language,
  reach,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly reach: AdminReach;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const [search, setSearch] = useSearch();
  const onglet = adminUserTabOf(search);
  const annonceur = useLiveAnnouncer();
  const [motDePasse, setMotDePasse] = useState(false);
  const [bannissement, setBannissement] = useState(false);

  const fiche = useQuery(adminUserDetailQueryOptions(deps, userId));
  const chiffres = useQuery(adminUserStatsQueryOptions(deps, userId));
  const bans = useQuery(adminUserBansQueryOptions(deps, userId));

  if (fiche.isPending) return <AdminSkeleton rows={6} />;

  const membre = fiche.data;
  if (membre === undefined) {
    const status = fiche.error instanceof ApiError ? fiche.error.status : 0;
    return <FicheState language={language} denied={status === 403} notFound={status === 404} onRetry={() => void fiche.refetch()} />;
  }

  const moment = now();
  const entity = userEntityOf(membre, language, moment);
  const state = accountStateOf({ ...membre, activeBan: (bans.data ?? []).some((ban) => ban.active) }, moment, language);
  const adm = reach.space === 'adm';
  const gererConversation = reach.opens('conversations') ? (adm ? ('admConversation' as const) : ('adminConversation' as const)) : null;

  return (
    /* LE HALO DE L'INSCRIPTION (#8288), réutilisé : les cartes de verre de la fiche ne se
       lisent comme du verre que posées sur une lumière. */
    <div className="relative grid gap-6" data-admin-user={membre.id}>
      <AuthAmbient />
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.user.title')}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.people') },
          { label: translateAdmin(language, 'admin.nav.users'), target: { kind: 'section', section: 'users' } },
          { label: entity.label },
        ]}
        actions={
          reach.opens('audit') ? (
            <AdminLink
              target={{ kind: 'section', section: 'audit', search: { subject: membre.id } }}
              anchor="member-journal"
              className="inline-flex items-center rounded-chip px-4 text-body font-medium"
              style={{ minHeight: 44, border: '1px solid var(--color-edge)', color: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.people.journal')}
            </AdminLink>
          ) : undefined
        }
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="user"
        header={
          <AdminIdentityHeader
            language={language}
            title={entity.label}
            {...(entity.secondary === undefined || entity.secondary === null ? {} : { secondary: entity.secondary })}
            avatar={{
              initials: personInitials(entity.label),
              color: 'var(--color-ios-brand)',
              src: entity.avatarUrl ?? null,
              ...(entity.presence === undefined ? {} : { presence: entity.presence }),
            }}
            badges={<Badges membre={membre} language={language} state={state} />}
          />
        }
        stats={<AdminMemberStats userId={membre.id} language={language} deps={deps} />}
        aside={<AdminMemberMeta membre={membre} language={language} now={now} onAnnounce={annonceur.announce} />}
      >
        <AdminMemberQuickActions membre={membre} language={language} onAnnounce={annonceur.announce} deps={deps} />
        <AdminUserTabs language={language} actif={onglet} onChange={(suivant) => setSearch(withAdminUserTab(search, suivant), true)} />
        <div role="tabpanel" id={`admin-user-panel-${onglet}`} aria-labelledby={`admin-user-tab-${onglet}`} data-admin-user-panel={onglet}>
          {onglet === 'profile' ? (
            <div className="grid gap-6">
              <AdminMemberImagesSection key={`images-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} deps={deps} />
              <AdminMemberIdentitySection key={`identity-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} deps={deps} />
              <AdminMemberContactSection key={`contact-${membre.id}`} membre={membre} language={language} onAnnounce={annonceur.announce} deps={deps} />
              <AdminMemberSecuritySection
                membre={membre}
                language={language}
                sessions={chiffres.data?.activeSessions ?? null}
                onAnnounce={annonceur.announce}
                onOpenPassword={() => setMotDePasse(true)}
                onOpenSessions={() => setSearch(withAdminUserTab(search, 'security'), true)}
                deps={deps}
                now={now}
              />
              <AdminMemberRoleSection
                key={`role-${membre.id}`}
                membre={membre}
                language={language}
                onAnnounce={annonceur.announce}
                onOpenBan={() => setBannissement(true)}
                deps={deps}
              />
              <AdminUserGallery membre={membre} language={language} deps={deps} />
            </div>
          ) : null}
          {/* Ce que ce membre a créé, et où il parle — en LECTURE. Les routes sont servies jusqu'à AUDIT,
              plus largement que les gestes d'écriture du profil qui exigent ADMIN+. La modale de lecture
              rend le fil dans le Prisme DU MEMBRE (#6862). */}
          {onglet === 'conversations' ? (
            <AdminUserConversationsSection membre={membre} language={language} gerer={gererConversation} onAnnounce={annonceur.announce} deps={deps} />
          ) : null}
          {onglet === 'media' ? <AdminUserMediaSection userId={membre.id} language={language} deps={deps} /> : null}
          {onglet === 'contacts' ? <AdminUserContactsTab userId={membre.id} language={language} deps={deps} now={now} /> : null}
          {onglet === 'communities' ? <AdminUserCommunitiesTab userId={membre.id} language={language} deps={deps} /> : null}
          {onglet === 'voice' ? <AdminUserVoiceTab userId={membre.id} language={language} deps={deps} /> : null}
          {onglet === 'preferences' ? <AdminUserPreferencesTab userId={membre.id} language={language} onAnnounce={annonceur.announce} deps={deps} /> : null}
          {onglet === 'security' ? <AdminUserSecurityTab userId={membre.id} language={language} deps={deps} now={now} /> : null}
          {onglet === 'reports' ? <AdminUserReportsTab userId={membre.id} language={language} deps={deps} now={now} /> : null}
        </div>
      </AdminFiche>

      {motDePasse ? (
        <AdminUserPasswordSheet userId={membre.id} language={language} onClose={() => setMotDePasse(false)} onAnnounce={annonceur.announce} />
      ) : null}

      {bannissement ? (
        <AdminUserBanSheet userId={membre.id} language={language} onClose={() => setBannissement(false)} onAnnounce={annonceur.announce} deps={deps} />
      ) : null}

      <AdminAnnouncement text={annonceur.text} />
    </div>
  );
}

/**
 * LES BADGES DE L'EN-TÊTE — rôle, ÉTAT (le plus grave d'abord : supprimé > banni > verrouillé >
 * désactivé > actif), e-mail vérifié ou non, téléphone vérifié, double authentification.
 * Chacun porte son MOT : la couleur ne dit jamais seule.
 */
function Badges({ membre, language, state }: { readonly membre: AdminUserDetail; readonly language: AdminLanguage; readonly state: ReturnType<typeof accountStateOf> }) {
  return (
    <>
      <AdminRoleBadge language={language} role={membre.role} />
      <AdminInterpretedBadge value={state} />
      {membre.email === '' ? null : membre.emailVerifiedAt === null ? (
        <AdminBadge tone="neutral">{translateAdmin(language, 'admin.people.security.emailUnverified')}</AdminBadge>
      ) : (
        <AdminBadge tone="success" glyph="checkCircle">
          {translateAdmin(language, 'admin.people.security.emailVerified')}
        </AdminBadge>
      )}
      {membre.phoneVerifiedAt === null ? null : (
        <AdminBadge tone="success" glyph="checkCircle">
          {translateAdmin(language, 'admin.people.security.phoneVerified')}
        </AdminBadge>
      )}
      {membre.twoFactorEnabled ? (
        <AdminBadge tone="info" glyph="shieldCheck">
          {translateAdmin(language, 'admin.people.security.twoFactor')}
        </AdminBadge>
      ) : null}
    </>
  );
}

export default function AdminUserScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { user: userId } = useParams<'/admin/users/$user'>();

  return (
    <AdminSectionScreen section="users" language={language} title={translateAdmin(language, 'admin.user.title')}>
      {(reach) => <AdminUserFiche userId={userId} language={language} reach={reach} />}
    </AdminSectionScreen>
  );
}
