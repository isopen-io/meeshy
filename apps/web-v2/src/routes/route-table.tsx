import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog, suspendForInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { createRouter } from '@/lib/router';

/**
 * LA TABLE DES ROUTES — le seul endroit du depot qui connait les adresses.
 *
 * Elle est ecrite a la main plutot que generee par fichiers : le decoupage par
 * route est ce qui borne la premiere peinture, et ecrit ici chaque `import()`
 * est un arbitrage VISIBLE. Genere, il se subit.
 */
/* LE DÉTAIL D'UNE PUBLICATION (#6278) — UN seul `import()` pour ses DEUX
   adresses, pour qu'elles ne puissent jamais diverger d'écran. */
const publicationScreen = () => import('@/routes/post');

/* L'ADMINISTRATION DE LA v2 — UN seul `import()` pour ses DEUX adresses
   (`/adm` et, le temps du pont, `/admin`), pour qu'elles ne puissent jamais
   diverger d'écran. Voir le commentaire de `adm` plus bas (#6795).

   CHACUN charge AUSSI le catalogue d'interface d'ADMINISTRATION (#6871,
   #6834), en PARALLÈLE de son chunk d'écran — même discipline que
   `screenPrerequisite` plus bas pour le catalogue commun, mais scopée aux
   seules routes d'administration : c'est ce qui sort ces clés de la somme
   que TOUT lecteur téléchargerait sinon (`i18n-admin-catalog.ts`). */
const adminScreen = () =>
  Promise.all([import('@/routes/admin'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);
const adminUsersScreen = () =>
  Promise.all([import('@/routes/admin-users'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);
const adminUserScreen = () =>
  Promise.all([import('@/routes/admin-user'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);
/* LA LECTURE SOUVERAINE DES CONVERSATIONS (#6862) — mêmes DEUX adresses, même
   `import()` unique, pour la même raison que les comptes.

   Et le MÊME chargement du catalogue d'administration que ses voisins : ces
   deux écrans appellent `translateAdmin`, et un catalogue lu avant d'être
   chargé LÈVE (`i18n-admin-catalog.ts`). Les laisser en `import()` nu — ce
   qu'ils étaient avant que #6871 ne sorte les clés `admin.*` — produirait un
   écran qui plante à l'ouverture, un défaut qu'aucun gate ne voit : ni `tsc`
   (les deux formes typent pareil), ni les témoins (aucun ne monte la route). */
const adminConversationsScreen = () =>
  Promise.all([import('@/routes/admin-conversations'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);
const adminConversationScreen = () =>
  Promise.all([import('@/routes/admin-conversation'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);
/* LE PILOTAGE DE L'AGENT (#6733) — mêmes DEUX adresses, même `import()`
   unique, et le MÊME chargement du catalogue d'administration que ses voisins.
   `admin-catalog-loading.test.ts` garde désormais cette discipline pour toute
   route `/adm…` : un `import()` nu s'y voit nommé, là où il ne cassait
   jusqu'ici qu'à l'exécution, chez le seul lecteur qui ouvre l'écran. */
const adminAgentScreen = () =>
  Promise.all([import('@/routes/admin-agent'), loadAdminInterfaceCatalog(currentInterfaceLanguage())]).then(([screen]) => screen);

export const ROUTES = {
  list: { pattern: '/', screen: () => import('@/routes/conversations') },
  thread: { pattern: '/c/$conversation', screen: () => import('@/routes/thread') },
  /* NOUVELLE CONVERSATION (#5652) — nomenclature legacy reprise (D-5) :
     `apps/web/app/conversations/new` porte déjà ce chemin. */
  conversationsNew: { pattern: '/conversations/new', screen: () => import('@/routes/conversation-new') },
  login: { pattern: '/login', screen: () => import('@/routes/login') },
  signup: { pattern: '/signup', screen: () => import('@/routes/signup') },
  /* LE LIEN DE PARRAINAGE (#6584) — l'adresse que le legacy sert
     (`apps/web/app/signup/affiliate/[token]`, D-5) et que les invitations déjà
     partagées visent. Elle REDIRIGE vers `/signup?ref=<token>` : le lien
     n'apporte qu'une donnée, et une donnée se transporte dans l'adresse plutôt
     que dans un second écran d'inscription à faire diverger. */
  signupAffiliate: { pattern: '/signup/affiliate/$token', screen: () => import('@/routes/signup-affiliate') },
  /* LA JONCTION PAR LIEN (#5561, bascule #6702) — l'adresse que TOUS les liens
     de partage émis visent : la passerelle (`sharing.ts:243`), iOS
     (`ShareLinkModels.swift`), Android et la v2 (`links.ts § shareLinkUrl`).
     Le legacy la servait (`apps/web/app/chat/[id]`, D-5) et ne la sert plus.
     PUBLIQUE : `session-guard.ts` ne la range dans aucun ensemble. */
  chatJoin: { pattern: '/chat/$link', screen: () => import('@/routes/chat-join') },
  /* Le tableau de bord des streaks & badges (#5547) — sous `/me/`, l'espace
     du profil (inventaire de parité : `/me` est V4.0.0), privé (garde de
     session), découpé comme les autres : aucun octet avant le premier pixel. */
  progression: { pattern: '/me/progression', screen: () => import('@/routes/progression') },
  /* Les trois PAGES DÉDIÉES du hub (#5843). Chacune a sa route parce qu'elle a
     son propre retour, son propre titre et son propre compte — un panneau qui
     se déplie dans le hub n'aurait ni l'un ni les autres, et le bouton système
     « retour » refermerait l'écran entier au lieu du panneau. */
  progressionBadges: { pattern: '/me/progression/badges', screen: () => import('@/routes/progression-badges') },
  progressionDefis: { pattern: '/me/progression/defis', screen: () => import('@/routes/progression-defis') },
  progressionSucces: { pattern: '/me/progression/succes', screen: () => import('@/routes/progression-succes') },
  /* LES STORIES (#6080) — le rail de la liste ouvre ces DEUX adresses, et
     c'est ce qui en fait des contrôles plutôt que des promesses. Jusqu'ici
     chaque tuile du rail pointait vers un FIL sous un anneau de story, faute
     de route ; le doc-comment de l'écran l'avouait en toutes lettres.

     `?author=` filtre le plateau sur un auteur — la même adresse sert « tout
     voir » et « voir les siennes », parce que c'est le même écran avec un
     filtre, jamais deux écrans à faire diverger. */
  stories: { pattern: '/stories', screen: () => import('@/routes/stories') },
  storyCompose: { pattern: '/stories/new', screen: () => import('@/routes/story-compose') },
  /* MON HUMEUR (#6150) — la SECONDE porte de ma cellule du rail. Adresse
     PROPRE, pas un mode de `/stories/new` : une humeur n'est pas une story
     (`Post.type = 'STATUS'`, corpus distinct côté passerelle,
     `?scope=statuses`), elle n'a ni scène ni durée, et le bouton système
     « retour » doit refermer la composition d'humeur seule. */
  statusCompose: { pattern: '/status/new', screen: () => import('@/routes/status-compose') },
  /* LE LECTEUR PLEIN ÉCRAN (#5817) — nomenclature legacy `/story/:postId`
     (D-5, `parity.md:310`). Une story NOMMÉE ouvre directement CETTE
     adresse (intention `targetingStory`, `StoryViewerRequestOrigin.swift`) ;
     le rail et la liste des stories nomment une PERSONNE et calculent
     eux-mêmes l'id d'entrée (`entryStoryId`, `lib/view/story-tray.ts`) avant
     de le poser ici — une seule adresse, deux intentions. */
  story: { pattern: '/story/$post', screen: () => import('@/routes/story') },
  /* L'ACCUEIL À DEUX PORTES (#5816) — soldé une fois par appareil
     (`welcomeStore`), miroir `WelcomeView.swift`. */
  welcome: { pattern: '/welcome', screen: () => import('@/routes/welcome') },
  /* LE LIEN MAGIQUE (#5816) — même adresse pour la SAISIE (`?token=` absent)
     et la VALIDATION du lien reçu par e-mail (`MagicLinkService.ts:548-549`
     vise exactement `/auth/magic-link?token=`) : `magic-link.tsx` distingue
     les deux au montage. `magicLinkValidate` est l'adresse du DIGEST
     (`jobs/notification-digest.ts:50`, `?token=&returnUrl=`) — même écran de
     validation, adresse SÉPARÉE. */
  magicLink: { pattern: '/auth/magic-link', screen: () => import('@/routes/magic-link') },
  magicLinkValidate: { pattern: '/auth/magic-link/validate', screen: () => import('@/routes/magic-link-validate') },
  /* MOT DE PASSE OUBLIÉ, flux E-MAIL (#5816) — le flux TÉLÉPHONE reste hors
     tranche (issue compagnon). */
  forgotPassword: { pattern: '/forgot-password', screen: () => import('@/routes/forgot-password') },
  /* ON FINIT D'ENTRER DANS MEESHY (T-verify/T-reset, #5672) — nomenclature
     legacy reprise (D-5) : `apps/web/app/auth/verify-email`,
     `apps/web/app/reset-password`. L'e-mail et le jeton voyagent en QUERY
     STRING (`?email=`, `?token=`) — un lien reçu par courriel reste valide
     après un rafraîchissement, jamais une navigation en mémoire seule. */
  verifyEmail: { pattern: '/auth/verify-email', screen: () => import('@/routes/verify-email') },
  resetPassword: { pattern: '/reset-password', screen: () => import('@/routes/reset-password') },
  /* LES LIENS REÇUS (#6714, #6715) — des adresses que la PASSERELLE compose
     et qui circulent déjà : e-mails, messages, publications, Android. Chacune
     garde l'adresse exacte que le legacy servait (D-5) : sinon chaque lien
     déjà envoyé mènerait à la page introuvable.
     - `/l/:token` (`TrackingLinkService.buildTrackingUrl`) compte le clic et
       ouvre la cible ; `/l/:token/expired` est l'état clos d'un lien mort, à
       sa propre adresse pour qu'un rafraîchissement ne recompte pas le clic ;
     - `/account/deletion` (`buildDeletionPageUrl`, `routes/me/delete-account.ts`),
       obligation réglementaire, que la rangée « Supprimer le compte » des
       réglages ouvre aussi ;
     - `/settings/verify-email-change` (`contact-change.ts`, `contact-changes.ts`) ;
     - `/settings/notifications`, le désabonnement des diffusions
       (`jobs/broadcast-sender.ts`).
     Aucune n'entre dans un ensemble de la garde (`lib/session-guard.ts`). */
  trackingLink: { pattern: '/l/$token', screen: () => import('@/routes/tracking-link') },
  trackingLinkExpired: { pattern: '/l/$token/expired', screen: () => import('@/routes/tracking-link-expired') },
  accountDeletion: { pattern: '/account/deletion', screen: () => import('@/routes/account-deletion') },
  verifyEmailChange: { pattern: '/settings/verify-email-change', screen: () => import('@/routes/verify-email-change') },
  settingsNotifications: { pattern: '/settings/notifications', screen: () => import('@/routes/settings-notifications') },
  /* L'EXPORT DE DONNÉES (#6725) — la rangée « Exporter mes données » des
     réglages, masquée depuis la décommission du legacy (#6335, #6702) et qui
     revient à une adresse propre à la v2. */
  dataExport: { pattern: '/settings/data-export', screen: () => import('@/routes/data-export') },
  /* LES HUIT DESTINATIONS DES MENUS FLOTTANTS (#6214) — le Flux pour le bouton
     de gauche, les six barreaux de l'échelle de droite, et le profil qu'ouvre
     l'avatar. Leurs libellés, teintes et glyphes vivent dans UNE table
     (`lib/view/floating-menu.ts`, miroir `RootMenuLadderEntry.swift`) ; ces
     lignes-ci n'en portent que l'adresse.

     Elles arrivent AVANT leur contenu, et c'est délibéré : un barreau qui
     viserait une adresse absente serait un contrôle qui ment (loi 4), défaut
     déjà payé par le rail des stories. Chaque écran est aujourd'hui un écran
     d'attente NOMMÉ, remplacé par son vrai contenu dans son issue à lui.

     Le nommage suit iOS (`Router.swift` § routes de hub), jamais le legacy :
     ces sept destinations n'existent pas dans `apps/web`. `/me` complète
     l'espace ouvert par `/me/progression` (#5547). */
  feed: { pattern: '/feed', screen: () => import('@/routes/feed') },
  /* LES RÉELS (#6457) — miroir `ReelsPresenter` : `present(posts:startId:)`
     (un réel touché dans le Flux, `?seed=<id>`) et `presentFresh()` (le bouton
     de l'en-tête du Flux, sans graine). Une seule adresse pour les deux
     intentions, comme `/stories`. Adresse NEUVE : le legacy n'a pas de Réels. */
  reels: { pattern: '/reels', screen: () => import('@/routes/reels') },
  /* LE DÉTAIL D'UNE PUBLICATION (#6278, D-48, D-49) — `/post/$post` est
     l'adresse que la passerelle range dans ses liens suivis
     (`PostService.ts:1742`) et que le legacy sert (`apps/web/app/post/[postId]`,
     D-5) ; `/feeds/post/$post` est celle des liens profonds d'iOS
     (`DeepLinkRouter.swift:106`) et l'adresse que le partage émet
     (`lib/feed/share-url.ts`). UN seul `import()` pour les deux portes.
     `?scene=N` (#6898, HONORÉ depuis #6902) : le lien profond vers une scène
     précise — le détail l'ouvre en plein écran À L'ENTRÉE (`routes/post.tsx`,
     `useSceneGallery` + `SceneFullscreenGallery`), l'index étant BORNÉ au
     nombre de scènes du post (`boundedSceneIndex`, `lib/feed/gallery-lot.ts`)
     plutôt que de planter sur un lien périmé. */
  post: { pattern: '/post/$post', screen: publicationScreen },
  postDeepLink: { pattern: '/feeds/post/$post', screen: publicationScreen },
  /* UNE HUMEUR PARTAGÉE (#7313) — la TROISIÈME porte du même écran, et la
     DERNIÈRE des quatre adresses que `PostService.shareWithTrackingLink`
     compose (`{ POST: 'post', REEL: 'reel', STORY: 'story', STATUS: 'mood' }`).
     `/post` et `/story` étaient servies, `/reel` l'est par #7298 ; `/mood` ne
     l'était pas, et `/l/:token` y envoyait le destinataire par un
     `location.replace` — chaque partage d'humeur fabriquait un lien mort.

     UN ALIAS, pas un écran, et le legacy le déclare en toutes lettres :
     `apps/web/app/mood/[postId]/page.tsx` est un `export { default } from
     '@/app/feeds/post/[postId]/page'`. Le client de la v2 le confirme de son
     côté — il « ne distingue que REEL du reste » (`lib/api/feed-pages.ts`), et
     le détail d'une publication n'a aucune branche sur `type`. Une humeur EST
     une publication ; lui écrire un second lecteur en ferait une jumelle à
     faire diverger. D'où le MÊME `import()` que ses deux sœurs. */
  mood: { pattern: '/mood/$post', screen: publicationScreen },
  /* LE PROFIL PUBLIC DE QUELQU'UN et LES PUBLICATIONS D'UN MOT-CLÉ (#7032) —
     les DEUX adresses que le texte enrichi vise, et elles arrivent AVANT les
     liens qui les visent : une mention qui tomberait sur « adresse inconnue »
     serait un contrôle qui ment (loi 4), le défaut que le rail des stories a
     déjà payé plus haut. Nomenclature LEGACY reprise (D-5) : `apps/web/app/u/`
     et `apps/web/app/hashtag/[tag]` servent déjà ces chemins, et un lien déjà
     partagé doit continuer de s'ouvrir après la bascule.

     Le PSEUDO, jamais l'identifiant : c'est ce qu'un `@handle` porte dans le
     texte, et la passerelle résout les deux à la même adresse
     (`servirProfilPublic`, insensible à la casse sur le pseudo). */
  userProfile: { pattern: '/u/$username', screen: () => import('@/routes/user-profile') },
  hashtag: { pattern: '/hashtag/$tag', screen: () => import('@/routes/hashtag') },
  links: { pattern: '/links', screen: () => import('@/routes/links') },
  /* LES LIENS DE PARTAGE (#6361, D-63) — miroir `Route.shareLinks`, puis
     `CreateShareLinkView` et `ShareLinkDetailView` (`Router.swift`,
     `ShareLinksView.swift`). Adresses NEUVES : le legacy sert `/links` d'un
     seul tenant. L'ORDRE compte : le routeur rend la PREMIÈRE adresse qui
     correspond, et `new` serait sinon lu comme le linkId d'un lien. */
  shareLinks: { pattern: '/links/share', screen: () => import('@/routes/share-links') },
  shareLinkNew: { pattern: '/links/share/new', screen: () => import('@/routes/share-link-new') },
  shareLink: { pattern: '/links/share/$link', screen: () => import('@/routes/share-link') },
  notifications: { pattern: '/notifications', screen: () => import('@/routes/notifications') },
  calls: { pattern: '/calls', screen: () => import('@/routes/calls') },
  discover: { pattern: '/discover', screen: () => import('@/routes/discover') },
  communities: { pattern: '/communities', screen: () => import('@/routes/communities') },
  /* CRÉER, PUIS UNE COMMUNAUTÉ (#6364, D-60) — miroir `Route.communityCreate` et
     `Route.communityDetail` (`Router.swift`). `/communities/:id` est l'adresse
     que le legacy sert (`apps/web/app/(connected)/communities/[id]`, D-5).
     L'ORDRE compte : le routeur rend la PREMIÈRE adresse qui correspond, et
     `new` serait sinon lu comme l'identifiant d'une communauté. */
  communityNew: { pattern: '/communities/new', screen: () => import('@/routes/community-new') },
  community: { pattern: '/communities/$community', screen: () => import('@/routes/community') },
  settings: { pattern: '/settings', screen: () => import('@/routes/settings') },
  profile: { pattern: '/me', screen: () => import('@/routes/profile') },
  /* L'ESPACE D'ADMINISTRATION (#6432) — nomenclature LEGACY reprise (D-5) :
     `apps/web/app/admin` et `apps/web/app/admin/users` servent déjà ces deux
     adresses, et un administrateur qui bascule d'une application à l'autre
     doit retrouver ses signets.

     L'ORDRE compte : le routeur rend la PREMIÈRE adresse qui correspond. Ici
     les deux motifs sont littéraux et disjoints, mais toute section future en
     `/admin/$quelquechose` devra se poser AVANT un éventuel motif paramétré,
     comme `communityNew` avant `community`.

     La garde n'est PAS dans cette table : `resolveRouteAccess` n'exige qu'une
     session, et le DROIT se lit au serveur (`GET /me/permissions`) dans
     l'écran lui-même. Une garde de route qui déciderait ici devrait connaître
     le rôle, que `SessionUser` ne projette pas. */
  admin: { pattern: '/admin', screen: adminScreen },
  adminUsers: { pattern: '/admin/users', screen: adminUsersScreen },
  /* LE DÉTAIL D'UN MEMBRE (#6819) — trois segments, là où la liste en a deux :
     aucune ambiguïté de résolution entre les deux, et l'ordre naturel les
     garde lisibles. Déclarée AUSSI dans `session-guard.ts` — sans quoi elle
     serait publique par défaut, et cet écran-ci porte l'édition, la
     réinitialisation de mot de passe et le bannissement. */
  adminUser: { pattern: '/admin/users/$user', screen: adminUserScreen },
  /* LES DEUX CHEMINS DE L'ADMINISTRATION (#6795, directive porteur 2026-09-16 :
     « tu peux même avoir les deux chemins dans la v2, `/adm/` pour la route
     d'administration nouvelle qui implémentera petit à petit les vues de
     l'ancienne, et brancher toute l'ancienne dans `/admin` »).

     `/adm` est l'adresse de la NOUVELLE administration — celle que la v2 sert
     aujourd'hui, et qui absorbera les vues du legacy une à une. `/admin` est
     réservée à l'ANCIENNE, portée dans ce même bundle (un seul conteneur
     derrière Traefik, cf. #6795).

     Tant que ce portage n'est pas livré, `/admin` sert les MÊMES écrans que
     `/adm` — un seul `import()` pour les deux, comme `post`/`postDeepLink`.
     C'est un PONT, pas la cible : déplacer `/admin` avant que l'ancienne
     n'arrive laisserait une adresse morte, et un signet d'administrateur mène
     aujourd'hui à `/admin`. Le jour où l'ancienne est portée, `/admin` bascule
     vers elle et ce commentaire disparaît. */
  adm: { pattern: '/adm', screen: adminScreen },
  admUsers: { pattern: '/adm/users', screen: adminUsersScreen },
  admUser: { pattern: '/adm/users/$user', screen: adminUserScreen },
  /* LES CONVERSATIONS, EN RÉGIME SOUVERAIN (#6862) — deux segments, comme la
     liste des comptes, et les deux espaces comme tout le reste de
     l'administration. Déclarées AUSSI dans `session-guard.ts` : sans quoi
     elles seraient publiques par défaut, et cet écran ouvre l'inventaire des
     conversations de l'instance. */
  adminConversations: { pattern: '/admin/conversations', screen: adminConversationsScreen },
  admConversations: { pattern: '/adm/conversations', screen: adminConversationsScreen },
  /* LA LECTURE D'UNE CONVERSATION (#6862) — trois segments là où la liste en a
     deux, comme `adminUser` face à `adminUsers` : aucune ambiguïté de
     résolution, et l'ordre naturel les garde lisibles. C'est l'écran qui
     OUVRE le contenu, sous motif écrit et geste tracé. */
  adminConversation: { pattern: '/admin/conversations/$conversation', screen: adminConversationScreen },
  admConversation: { pattern: '/adm/conversations/$conversation', screen: adminConversationScreen },
  /* LE PILOTAGE DE L'AGENT (#6733) — deux segments, comme les deux autres
     listes, et les deux espaces comme tout le reste de l'administration.
     Déclarées AUSSI dans `session-guard.ts`.

     L'ORDRE compte, et ici il est SANS DANGER : `/admin/agent` est littéral et
     `/admin/users/$user` a trois segments — aucune adresse paramétrée à deux
     segments n'existe sous `/admin`. Le jour où il en naîtrait une, celle-ci
     devrait rester AVANT elle, comme `communityNew` avant `community`. */
  adminAgent: { pattern: '/admin/agent', screen: adminAgentScreen },
  admAgent: { pattern: '/adm/agent', screen: adminAgentScreen },
} as const;

/**
 * L'ÉCRAN D'ADRESSE INCONNUE (#6341) — ses deux textes viennent du catalogue
 * d'interface, comme le reste de l'application. Contrairement à un écran
 * routé, aucune route n'a fait passer une adresse inconnue par
 * `screenPrerequisite` : `suspendForInterfaceCatalog` rejoue la même attente
 * pour ce seul cas, sous la même limite Suspense (`router.tsx`). Le libellé
 * de retour REND `pending.back`, déjà porté par le catalogue — un second
 * texte identique aurait divergé au premier lot qui n'aurait modifié que l'un
 * des deux.
 */
export function NotFound() {
  const langue = currentInterfaceLanguage();
  suspendForInterfaceCatalog(langue);
  return (
    <div className="grid min-h-dvh place-items-center p-6 pt-safe text-center">
      <div className="grid gap-3">
        <p className="text-screen font-bold">{translate(langue, 'notFound.title')}</p>
        <a
          href="/"
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {translate(langue, 'pending.back')}
        </a>
      </div>
    </div>
  );
}

/* LE CATALOGUE D'INTERFACE (#6206) — chaque écran l'attend, en parallèle de
   son chunk : ce qui s'y rend lit ses libellés de façon synchrone. */
export const { Router, Link, href, navigate } = createRouter(ROUTES, NotFound, {
  screenPrerequisite: () => loadInterfaceCatalog(currentInterfaceLanguage()),
});
