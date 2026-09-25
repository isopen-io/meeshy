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
import { useParams, useRoute } from '@/lib/router';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { ActionButton } from '@/routes/link-page-parts';

import { AdminAnnouncement, AdminDenied, AdminLine as Ligne, AdminScreenFrame, AdminSection as Section, AdminSkeleton } from './admin-parts';
import { AdminUserEditSheet } from './admin-user-edit-sheet';
import { AdminUserBanSheet } from './admin-user-ban-sheet';
import { AdminUserConversationsSection, AdminUserMediaSection } from './admin-user-lists';
import { AdminUserPasswordSheet } from './admin-user-password-sheet';

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

        {/* Ce que ce membre a créé, et où il parle — en LECTURE. Les deux
            routes sont servies jusqu'à AUDIT, plus largement que les gestes
            d'écriture ci-dessus qui exigent ADMIN+. */}
        <AdminUserMediaSection userId={membre.id} language={language} />
        {/* La fiche ENTIÈRE, et pas seulement son identifiant (#6862) : la
            modale de lecture rend le fil dans le Prisme DU MEMBRE, qui se
            compose de ses trois rangs de langue, et le montre de SON point de
            vue, qui demande son identité. */}
        <AdminUserConversationsSection membre={membre} language={language} />
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
