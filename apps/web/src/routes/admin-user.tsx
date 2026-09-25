import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { adminIdentityQueryOptions, type AdminDeps } from '@/lib/api/admin';
import {
  adminUserDetailQueryKey,
  adminUserDetailQueryOptions,
  adminUserPrivateQueryKey,
  adminUserPrivateQueryOptions,
  withKnownCounts,
  type AdminUserDetail,
} from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { visibleAdminSections } from '@/lib/admin/sections';
import { adminUserTabOf, withAdminUserTab, type AdminUserTab } from '@/lib/admin/user-tabs';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useParams, useRoute, useSearch } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { ActionButton } from '@/routes/link-page-parts';

import { AdminAbsence, AdminAnnouncement, AdminDenied, AdminScreenFrame, AdminSkeleton } from './admin-parts';
import { AdminUserAccountSheet } from './admin-user-account-sheet';
import { AdminUserContactsPanel, AdminUserReportsPanel, type AdminMemberRoute } from './admin-user-activity';
import { AdminUserBanSheet } from './admin-user-ban-sheet';
import { AdminUserImageCarousel } from './admin-user-carousel';
import { AdminUserCommunitiesTab, AdminUserVoiceTab } from './admin-user-dossier';
import { AdminUserEditSheet } from './admin-user-edit-sheet';
import { AdminUserHero } from './admin-user-hero';
import { AdminUserConversationsSection, AdminUserMediaSection, type AdminConversationRoute } from './admin-user-lists';
import { AdminUserProfile } from './admin-user-meta';
import { AdminUserPasswordSheet } from './admin-user-password-sheet';
import { AdminUserPreferencesPanel } from './admin-user-preferences';
import { AdminUserSecurityPanel } from './admin-user-security';
import { AdminUserStatsPanel } from './admin-user-stats';
import { AdminUserTabs, adminUserPanelId, adminUserTabId } from './admin-user-tabs';

/**
 * **LA FICHE D'UN MEMBRE** (#6819, refondue par #7845) — `/admin/users/$user`
 * et `/adm/users/$user`. Tout ce qui concerne un membre s'administre d'ici :
 * son identité, ses images, ses chiffres, ses conversations, ses médias, ses
 * contacts, ses communautés, sa voix, ses préférences, ses appareils, ses
 * signalements — neuf onglets (`lib/admin/user-tabs.ts`).
 *
 * ## Deux colonnes sur un grand écran, une seule sur un téléphone
 *
 * À partir de `xl` (1280 px), la colonne de GAUCHE porte ce qui dit QUI est ce
 * membre — carte d'identité, carrousel, statistiques, gestes — et reste en vue
 * pendant que la colonne de DROITE fait défiler l'onglet ouvert : on garde le
 * visage de la personne sous les yeux en lisant ses conversations. Collante,
 * elle est bornée à la hauteur de l'écran et défile d'elle-même : une colonne
 * collante plus haute que l'écran cacherait son propre bas jusqu'à la fin de
 * la page. Le seuil est `xl` et non `lg` : l'administration porte déjà son
 * menu latéral (248 px, `admin-shell.tsx`), et à 1024 px la colonne des
 * onglets, coincée entre le menu et l'identité, tombait sous 400 px — ses
 * tableaux défilaient à l'horizontale. Sous `xl`, une colonne, gouttières de 16 px et aucun défilement
 * horizontal — mais PAS dans le même ordre : l'identité, puis les gestes,
 * puis les onglets, et seulement ensuite le carrousel et les chiffres. Dans
 * l'ordre du grand écran, les onglets tombaient à un millier de pixels sur un
 * téléphone, et les conversations d'un membre — la moitié de la raison d'ouvrir
 * sa fiche — étaient à plusieurs écrans de défilement. La colonne de gauche
 * s'y DISSOUT (`display: contents`) : ses enfants deviennent ceux de la
 * grille, rangés par `order`, sans rien monter deux fois.
 *
 * ## L'onglet se lit dans l'ADRESSE
 *
 * `?tab=conversations` : un lien envoyé à un collègue ouvre la fiche sur le
 * bon onglet, et le retour arrière ne sort pas de la fiche à chaque onglet
 * visité (`replace`). Un onglet inconnu retombe sur le profil.
 *
 * ## Le retour reste dans l'ESPACE d'où l'on vient
 *
 * `useRoute().key` distingue `admUser` de `adminUser` : renvoyer les deux vers
 * la même liste ferait sauter l'administrateur d'une administration à l'autre
 * au premier retour, alors que D-76 les tient séparées à dessein. Les liens
 * qui sortent de la fiche — vers la fiche d'un contact, vers une conversation
 * à gérer — restent dans le même espace, pour la même raison.
 *
 * ## La garde est celle de la liste
 *
 * Lue au SERVEUR (`GET /me/permissions`), jamais déduite d'un rôle côté
 * client : `canManageUsers` (ADMIN+), le seuil de la section. Les gestes sur
 * une CONVERSATION du membre (« Configurer », « Gérer ») exigent en plus la
 * section Conversations (`canManageConversations`, rang ADMIN) — celle-là
 * même que les routes souveraines d'écriture gardent côté passerelle. Qui ne
 * l'a pas lit la liste sans voir un bouton qui lui rendrait un 403.
 */
export default function AdminUserScreen() {
  const language = currentInterfaceLanguage();
  const { user: userId } = useParams<'/admin/users/$user'>();
  const { key } = useRoute();
  const [search, setSearch] = useSearch();
  const enAdm = key === 'admUser';
  const retour = enAdm ? 'admUsers' : 'adminUsers';

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const sections = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role);
  const autorise = sections.some((section) => section.id === 'users');
  const gerer: AdminConversationRoute | null = sections.some((section) => section.id === 'conversations')
    ? enAdm
      ? 'admConversation'
      : 'adminConversation'
    : null;
  const fiche = useQuery({ ...adminUserDetailQueryOptions(apiDeps, userId), enabled: autorise });

  const onglet = adminUserTabOf(search);
  const choisir = (tab: AdminUserTab) => setSearch(withAdminUserTab(search, tab), true);

  const titre = translateAdmin(language, 'admin.user.title');
  const cadre = (contenu: ReactNode) => (
    <AdminScreenFrame language={language} title={titre} back={retour}>
      {contenu}
    </AdminScreenFrame>
  );

  if (identite.isPending) return cadre(<AdminSkeleton rows={5} />);
  if (!autorise) return cadre(<AdminDenied language={language} />);
  if (fiche.data === undefined) {
    return cadre(fiche.isPending ? <AdminSkeleton rows={6} /> : <AdminAbsence language={language} unavailable="admin.user.unavailable" />);
  }

  return cadre(
    <AdminUserWorkspace
      membre={fiche.data}
      language={language}
      tab={onglet}
      onTab={choisir}
      gerer={gerer}
      cible={enAdm ? 'admUser' : 'adminUser'}
    />,
  );
}

/**
 * L'ESPACE DE TRAVAIL d'une fiche chargée — séparé de l'écran pour être monté
 * par un témoin sans routeur, avec son port injecté.
 */
export function AdminUserWorkspace({
  membre,
  language,
  tab,
  onTab,
  gerer = null,
  cible = 'adminUser',
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly tab: AdminUserTab;
  readonly onTab: (tab: AdminUserTab) => void;
  /** La fiche d'une conversation dans l'espace courant, `null` sans la section Conversations. */
  readonly gerer?: AdminConversationRoute | null;
  /** La fiche d'un autre membre dans l'espace courant. */
  readonly cible?: AdminMemberRoute;
  readonly deps?: AdminDeps;
}) {
  const [feuille, setFeuille] = useState<'edit' | 'account' | 'password' | 'ban' | null>(null);
  const annonceur = useLiveAnnouncer();
  const client = useQueryClient();
  const fermer = () => setFeuille(null);
  /**
   * Les routes d'écriture rendent le membre À JOUR, sanitisé : on l'écrit dans
   * le cache plutôt que d'invalider. Invalider coûterait un aller-retour pour
   * obtenir ce qu'on tient déjà, et laisserait l'écran afficher l'état d'AVANT
   * pendant qu'il revient. Les compteurs `_count`, que ces routes ne servent
   * pas, se GARDENT (`withKnownCounts`) — sans quoi chaque geste les
   * remettrait à zéro. Les champs privés (coordonnées en attente) vivent sous
   * une autre clé : un changement d'adresse peut les avoir créés.
   */
  const ecrit = (aJour: AdminUserDetail) => {
    client.setQueryData<AdminUserDetail>(adminUserDetailQueryKey(membre.id), (avant) => withKnownCounts(avant, aJour));
    void client.invalidateQueries({ queryKey: adminUserPrivateQueryKey(membre.id) });
  };

  return (
    <>
      <div
        data-admin-user={membre.id}
        data-admin-user-layout="split"
        className="grid gap-5 pt-1 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:items-start xl:gap-6"
      >
        <aside
          data-admin-user-aside
          className="contents xl:sticky xl:top-4 xl:grid xl:max-h-[calc(100dvh-6rem)] xl:min-w-0 xl:gap-5 xl:overflow-y-auto xl:pe-1 xl:[scrollbar-width:thin]"
        >
          <div className="order-1 min-w-0 xl:order-none" data-admin-user-order="hero">
            <AdminUserHero membre={membre} language={language} />
          </div>
          <div className="order-4 min-w-0 xl:order-none" data-admin-user-order="carousel">
            <AdminUserImageCarousel membre={membre} language={language} deps={deps} />
          </div>
          <div className="order-5 min-w-0 xl:order-none" data-admin-user-order="stats">
            <AdminUserStatsPanel userId={membre.id} language={language} deps={deps} />
          </div>
          <div className="order-2 grid min-w-0 grid-cols-2 gap-2 xl:order-none xl:grid-cols-1" data-admin-user-actions data-admin-user-order="actions">
            <ActionButton onClick={() => setFeuille('edit')}>{translateAdmin(language, 'admin.edit.open')}</ActionButton>
            <ActionButton tone="secondary" onClick={() => setFeuille('account')}>
              {translateAdmin(language, 'admin.account.open')}
            </ActionButton>
            {/* Ton `danger` : le geste révoque les sessions ouvertes de la
                cible, qui se retrouve déconnectée partout. La couleur le dit
                avant que la feuille ne l'écrive. */}
            <ActionButton tone="danger" onClick={() => setFeuille('password')}>
              {translateAdmin(language, 'admin.password.title')}
            </ActionButton>
            <ActionButton tone="danger" onClick={() => setFeuille('ban')}>
              {translateAdmin(language, 'admin.ban.open')}
            </ActionButton>
          </div>
        </aside>

        <div className="order-3 grid min-w-0 content-start gap-4 xl:order-none" data-admin-user-order="tabs">
          <AdminUserTabs active={tab} language={language} onSelect={onTab} />
          <div role="tabpanel" id={adminUserPanelId(tab)} aria-labelledby={adminUserTabId(tab)} data-admin-user-panel={tab} className="min-w-0">
            <Panneau membre={membre} language={language} tab={tab} deps={deps} gerer={gerer} cible={cible} onAnnounce={annonceur.announce} />
          </div>
        </div>
      </div>

      {feuille === 'edit' ? (
        <AdminUserEditSheet membre={membre} language={language} onClose={fermer} onAnnounce={annonceur.announce} onSaved={ecrit} />
      ) : null}
      {feuille === 'account' ? (
        <AdminUserAccountSheet membre={membre} language={language} deps={deps} onClose={fermer} onAnnounce={annonceur.announce} onSaved={ecrit} />
      ) : null}
      {feuille === 'password' ? (
        <AdminUserPasswordSheet userId={membre.id} language={language} onClose={fermer} onAnnounce={annonceur.announce} />
      ) : null}
      {feuille === 'ban' ? (
        <AdminUserBanSheet userId={membre.id} language={language} onClose={fermer} onAnnounce={annonceur.announce} />
      ) : null}

      <AdminAnnouncement text={annonceur.text} />
    </>
  );
}

/** UN panneau monté à la fois — voir `admin-user-tabs.tsx`. */
function Panneau({
  membre,
  language,
  tab,
  deps,
  gerer,
  cible,
  onAnnounce,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly tab: AdminUserTab;
  readonly deps: AdminDeps;
  readonly gerer: AdminConversationRoute | null;
  readonly cible: AdminMemberRoute;
  readonly onAnnounce: (texte: string) => void;
}) {
  if (tab === 'preferences') return <AdminUserPreferencesPanel userId={membre.id} language={language} deps={deps} onAnnounce={onAnnounce} />;
  /* La fiche ENTIÈRE, et pas seulement son identifiant (#6862) : la modale de
     lecture rend le fil dans le Prisme DU MEMBRE, qui se compose de ses trois
     rangs de langue, et le montre de SON point de vue. */
  if (tab === 'conversations') {
    return <AdminUserConversationsSection membre={membre} language={language} deps={deps} gerer={gerer} onAnnounce={onAnnounce} />;
  }
  if (tab === 'media') return <AdminUserMediaSection userId={membre.id} language={language} deps={deps} />;
  if (tab === 'security') return <AdminUserSecurityPanel userId={membre.id} language={language} deps={deps} onAnnounce={onAnnounce} />;
  if (tab === 'contacts') return <AdminUserContactsPanel userId={membre.id} language={language} cible={cible} deps={deps} />;
  if (tab === 'communities') return <AdminUserCommunitiesTab userId={membre.id} language={language} deps={deps} />;
  if (tab === 'voice') return <AdminUserVoiceTab userId={membre.id} language={language} deps={deps} />;
  if (tab === 'reports') return <AdminUserReportsPanel userId={membre.id} language={language} deps={deps} />;
  return <PanneauProfil membre={membre} language={language} deps={deps} />;
}

/** Le profil lit À PART ce qui ne se persiste pas (`adminUserPrivateQueryOptions`). */
function PanneauProfil({ membre, language, deps }: { readonly membre: AdminUserDetail; readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
  const prive = useQuery(adminUserPrivateQueryOptions(deps, membre.id));
  return <AdminUserProfile membre={membre} prive={prive.isError ? null : prive.data} language={language} />;
}
