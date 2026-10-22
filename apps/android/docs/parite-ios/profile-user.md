# Parité iOS → Android : `profile-user`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**33 features iOS** : 16 absentes, 16 partielles, 1 divergentes, 0 complètes sur Android. **26 lots** planifiés (≈23000 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**profile-user** (couverture Android estimée ≈ 20 %)

Ce lot couvre tout ce qui touche à la personne : la fiche profil d'un tiers (feuille UserProfileSheet du SDK : en-tête repliable bannière/avatar, onglets Postes / Conversations / Détails, actions connexion, blocage, signalement, message, appel), ma propre page de profil (ProfileView : édition optimiste hors ligne, avatar/bannière recadrés, langues, contact vérifié, décor équipable), l'écran Statistiques, « Mes stories » (4 onglets, grille, sélection, file, brouillons, archive), le changement de compte à sessions gardées, les rappels de série locaux, et les services SDK (UserService, StatsService, AccountService, BirthDateService, UserActivation, UserPreferencesManager). Sur iOS tout est cache-first (SWR) avec un seul aller-retour `GET /directory/people/:handle?expand=stats,presence`, des mutations optimistes avec rollback par OfflineQueue, un squelette uniquement à cache vide, et des états explicites (échec + Réessayer, bloqué par moi, bloqué par la cible = fermeture). Android a une page de profil plein écran unique (ProfileScreen) qui sert à la fois soi et les tiers : avatar avec anneau de complétion et pastille de présence, bio, langues, statistiques et succès, sparkline d'activité, édition avec upload avatar/bannière, partage QR, signalement par écran dédié, liste des publications d'un auteur. Il manque : la feuille avec en-tête repliable et onglets, la bannière affichée, le plein écran photo, les actions de connexion / blocage / message / appel sur la fiche (les briques SDK FriendshipCache, FriendRepository, BlockRepository.setBlockedDurably, UserRelationshipResolver existent mais ne sont pas câblées), le cache des profils et le chargement en un aller-retour, le décor (contour, bannière, cadre), « Mes stories » (aucun écran de gestion), le changement de compte à session gardée, les rappels de série, la synchronisation des 5 catégories de préférences restantes et les consentements. Le chiffre de couverture est une estimation pondérée : beaucoup de briques de données existent côté Android, très peu de surfaces iso.

## Notes transverses

CONSTATS VÉRIFIÉS DANS L'ARBRE ANDROID (à lire avant de planifier). (1) BUG P0 : la page 'ma fiche' est inatteignable. L'avatar flottant (appui long), les réglages et les notifications naviguent vers Routes.profile(ownId) = 'profile/{userId}' ; ProfileViewModel reçoit donc toujours un userId, passe en isOwnProfile=false et affiche MA fiche comme celle d'un tiers (drapeau Signaler au lieu du crayon d'édition) ; la branche 'userId == null' du VM n'est atteinte que par les tests. Le lot profile-own-page-split le corrige en premier (route profile/me). (2) BUG : ProfileEditRequestBuilder convertit tout champ vide en null (donc omis) : on ne peut plus effacer sa bio ni ses langues régionale / personnalisée ; et OutboxFlushWorker adopte la réponse PATCH entière (sessionRepository.adopt), ce qui effacera voicePublic / profileDecor / activation dès que MeeshyUser les portera (lot profile-own-edit-save : changedOrNil + fusion). (3) Aucun appel de fiche depuis le chat, le feed, les stories, les reels : seuls points d'entrée actuels = recherche globale, notifications, réglages, avatar flottant. ParticipantProfileSheet (feature:chat) est la fiche de MODÉRATION d'un membre (droits, historique d'accès), pas l'équivalent d'UserProfileSheet. (4) Aucun écouteur socket user:updated ni profile:decor-updated côté Android (MessageSocketManager n'écoute que user:status et presence:snapshot) et aucun store de présence central (ext:live-presence-store). (5) MeeshyAvatar ne peint que des initiales (pas de photo) ; ProfileScreen contourne avec AsyncImage : un composant ProfileAvatar (photo + anneau de story + humeur + présence) doit exister (lot profile-identity-visuals). (6) Aucun lecteur audio réutilisable (AudioTrackSurface est un rendu sans contrôles, utilisé par le visionneur de stories) : la carte voix embarque un lecteur minimal en attendant ext:audio-player-widget. (7) ImageCompressionPlanner (core:model) existe mais aucun exécuteur Bitmap ni budget d'octets (500 Ko avatar / 800 Ko bannière) : ImageUploadValidator rejette en TOO_LARGE au lieu de compresser. (8) Deux jumelles UserRelationshipState : model.UserRelationshipState (héritée, zéro importeur) et model.friend.UserRelationshipState (canonique, utilisée par UserRelationshipResolver) : le lot profile-relationship-actions supprime l'héritée. ARCHITECTURE DES LOTS. (a) Couches : feature:* ne dépend jamais d'un autre feature. La fiche (feature:profile) reçoit ses contenus externes par un ProfileSheetEnvironment construit par :app (contenu de l'onglet Postes issu de feature:feed, anneau de story issu de feature:stories, appel issu de feature:calls, présence, humeur) : équivalent des closures postsContent / onCall / presenceProvider / storyRingState d'iOS. Les écrans de TOUTES les features ouvrent une fiche via LocalProfileSheetOpener (CompositionLocal dans :sdk-ui, fourni par :app) sans dépendre de :feature:profile. L'écran Mes stories vit dans feature:stories (il réutilise StoryViewersSheet, StoryCommentsSheet, StorySendToSheet, StoryPublishFailures) et la feuille Changer de compte dans feature:auth (SavedAccounts, AuthViewModel). (b) Cache : tous les caches de ce domaine réutilisent la table générique profile_stats_cache (ProfileStatsCacheEntity : clé + charge JSON ; préfixes profile_card:, profile_posts:, my_stories:) : AUCUN lot de ce domaine n'incrémente la version Room (MeeshyDatabase v16 est en fallbackToDestructiveMigration, une montée de version viderait aussi l'outbox et perdrait des écritures en attente) ; seul profile-per-account-local-data y touche, derrière un drapeau distant. (c) Goulots de fusion à serrer : MeeshyApp.kt (1202 lignes, objet Routes) : chaque lot ajoute sa route dans un NavGraphBuilder.xxxGraph() de son propre fichier et ne touche MeeshyApp.kt que d'une ligne ; UserApi.kt est pré-chargé par profile-user-service-socle (expand, me/stats, achievements, me/account/deletion, me/birth-date, me/profile-decor) pour qu'aucun autre lot ne l'édite ; MessageSocketManager.kt (profile-cache-first-loader puis profile-decor-model-service, séquencés) ; Outbox* (OutboxModel, OutboxFlushWorker, OutboxCoalescer) : une ligne par profile-own-edit-save, puis profile-preferences-manager-sync ; FeedScreen.kt : profile-posts-tab y extrait PostCard (privé aujourd'hui) vers FeedPostCard.kt, à coordonner avec le domaine feed ; strings.xml : un fichier de ressources PAR LOT (strings_<slug>.xml dans values, values-fr, values-es, values-pt) pour ne pas se disputer strings.xml ; ProfileScreen.kt et ProfileViewModel.kt sont possédés par profile-own-page-split puis seulement par les lots profile-own-*. (d) Preuve locale : profile-sheet-laws, profile-mystories-data-laws, profile-own-edit-save (ProfileEditDiff), profile-image-crop-editor (géométrie + échelle de qualité), profile-streak-reminders (plan), profile-kept-sessions (handoff, rétention) et profile-decor-model-service (ProfileDecorState) posent leurs lois dans :core:model et se prouvent en TDD local par ./apps/android/meeshy.sh jvm-check ; tout Compose / Hilt / Room n'est prouvé que par la CI android.yml (aucun lot ne se déclare vert sans run vert sur sa PR). (e) est_kotlin_lines inclut environ un tiers de tests. DÉPENDANCES EXTERNES (domaines voisins) : ext:live-presence-store, ext:mood-bubble-opener, ext:appearance-design-renderers et ext:pack-shop-installed-packs (le décor ne peut pas atteindre l'iso sans le moteur d'apparence / packs : 8 790 lignes de catalogue côté iOS, absent d'Android ; le lot decor-equip-ui livre la composition, la feuille et le repli 'Aucun'), ext:story-composer-edit-published et ext:story-composer-open-draft (le compositeur doit accepter l'id d'une story publiée ou d'un brouillon), ext:progression-engagement-api (GET /me/engagement n'existe pas côté Android : bloque la source de la série) et ext:progression-screen (lien profond de la notification), ext:audio-player-widget. LOIS DU PRODUIT À TENIR. Présence : jamais fabriquée ; absente => aucune pastille ; offline => aucun point ; typing:start force le vert ; la pastille passe par meeshyPresenceDotColor (jamais redéclarée) ; la visibilité est une décision gateway (amis acceptés, soi, ADMIN/BIGBOSS), le client n'ajoute rien. Accent : couleur du profil = profileAccentHex(userId, nom), jamais l'accent de la conversation appelante ; bloqué par la cible = gris neutre 888888 sans décor ni présence. Prisme : la bio n'est pas traduite (iOS non plus) ; les posts de l'onglet Postes passent par FeedPostBuilder (descente stricte des langues, aucune traduction => original, jamais translations.first) ; la langue de l'interface (strings.xml, date 'Membre depuis') suit la locale de l'appareil : ne pas reproduire le fr_FR figé d'iOS. Rétrocompatibilité : l'ancien getProfile(idOrUsername) reste jusqu'à migration de tous ses appelants ; la route profile/{userId} et les liens meeshy://u/{username} et https://meeshy.me/u/{username} doivent continuer à ouvrir une fiche. Risques : le changement de compte avec données conservées (profile-per-account-local-data) est le lot le plus invasif du domaine (DAO injectés à la construction dans de nombreux dépôts ; l'outbox d'un compte quitté ne doit jamais partir sous le jeton du compte suivant) : il est P2, derrière un drapeau distant désactivé par défaut ; le changement de compte visible (sessions gardées + feuille) livre d'abord avec nettoyage complet des caches et re-synchronisation ; aucune purge de données n'est lancée avant validation des règles de rétention par le porteur. ORDRE DE VAGUES SUGGÉRÉ. Vague A (sans dépendance, parallèle) : profile-user-service-socle, profile-sheet-laws, profile-own-page-split, profile-identity-visuals, profile-image-crop-editor, profile-mystories-data-laws, profile-kept-sessions, profile-preferences-categories-api. Vague B : profile-cache-first-loader, profile-own-edit-save, profile-account-switcher-sheet, profile-preferences-manager-sync, profile-account-lifecycle, profile-mystories-screen. Vague C : profile-sheet-shell, profile-own-page-sections, profile-mystories-actions, profile-mystories-queue-drafts, profile-decor-model-service. Vague D : profile-collapsible-header-tabs, profile-own-avatar-banner-upload, profile-stats-screen, profile-entry-points-messaging. Vague E : profile-details-tab, profile-posts-tab, profile-relationship-actions, profile-entry-points-social. Vague F : profile-conversations-and-contact-actions, profile-posts-interactions, profile-decor-equip-ui, profile-per-account-local-data, profile-streak-reminders (selon les ext).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `profile-cache-first-loader` | D | P0 | M | 900 | profile-user-service-socle, profile-sheet-laws, socket-routage-evenements-ordre-arrivee | Un profil s'affiche tout de suite depuis le cache, se met à jour seul et propose Réessayer en cas de panne |
| `profile-collapsible-header-tabs` | D | P0 | M | 650 | profile-sheet-shell, profile-identity-visuals | L'en-tête du profil se replie au défilement et les trois onglets restent épinglés |
| `profile-conversations-and-contact-actions` | D | P0 | M | 850 | profile-sheet-shell, profile-collapsible-header-tabs, profile-relationship-actions | Depuis un profil, je vois nos conversations en commun, j'écris ou j'appelle en un geste |
| `profile-details-tab` | D | P0 | M | 750 | profile-collapsible-header-tabs, profile-cache-first-loader, profile-user-service-socle | L'onglet Détails présente la bio, les langues, le pays, le chiffrement, la voix et l'ancienneté |
| `profile-entry-points-messaging` | D | P0 | M | 500 | profile-sheet-shell, socle-points-d-extension-de-l-app, composer-glass-shell, chat-bulle-decoupage-composants | Toucher un nom, un avatar ou un contact dans les conversations, les appels et les contacts ouvre sa fiche |
| `profile-identity-visuals` | D | P0 | M | 650 |  | La bannière et la photo d'un profil se montrent avec leurs signes et s'ouvrent en plein écran |
| `profile-mystories-data-laws` | D | P0 | M | 800 |  | Mes stories publiées, expirées et brouillons se classent d'eux-mêmes en onglets |
| `profile-mystories-screen` | D | P0 | L | 1200 | profile-mystories-data-laws, story-service-rest-surface, story-item-group-model, socle-points-d-extension-de-l-app | « Mes stories » regroupe mes stories publiées, ma file d'envoi, mes brouillons et mon archive |
| `profile-own-page-split` | D | P0 | M | 600 | socle-points-d-extension-de-l-app | Ma page de profil redevient atteignable : modifier, partager et consulter mes informations |
| `profile-relationship-actions` | D | P0 | L | 1250 | profile-sheet-laws, profile-cache-first-loader, profile-details-tab | Depuis un profil, je me connecte, je bloque ou je signale en un geste, même hors ligne |
| `profile-sheet-laws` | D | P0 | M | 750 |  | La fiche d'une personne sait qui elle montre, ce qu'on peut en faire et quand elle se replie |
| `profile-sheet-shell` | D | P0 | L | 1000 | profile-sheet-laws, profile-cache-first-loader, profile-own-page-split, socle-points-d-extension-de-l-app | Toucher une personne ouvre sa fiche en feuille, d'où que l'on vienne |
| `profile-user-service-socle` | D | P0 | M | 650 |  | Un profil public se lit en un seul aller-retour, avec ses statistiques, sa voix et son décor |
| `profile-entry-points-social` | D | P1 | M | 400 | profile-sheet-shell, profile-posts-tab, story-viewer-decomposition-and-nav-graph | Toucher l'auteur d'un post, d'une story, d'un réel ou d'un commentaire ouvre son profil |
| `profile-mystories-actions` | D | P1 | L | 1100 | profile-mystories-screen, modifier-un-contenu-publie | Depuis « Mes stories », j'ouvre, modifie, change la visibilité, partage, republie ou supprime avec confirmation |
| `profile-mystories-queue-drafts` | D | P1 | L | 1100 | profile-mystories-screen, brouillon-complet-modele-disque-et-reprise, composer-socle-decoupage-et-dependances | Mes envois en cours, mes échecs de publication et mes brouillons ne se perdent jamais et se reprennent en un geste |
| `profile-own-avatar-banner-upload` | D | P1 | M | 650 | profile-own-page-sections, photo-d-entite-recadrage-et-compression, profile-own-edit-save | Je change ma photo et ma bannière : je choisis, je recadre, l'image est compressée et envoyée |
| `profile-own-edit-save` | D | P1 | M | 500 | profile-own-page-split, profile-user-service-socle, persist-outbox-registre-senders | Je modifie mon profil, l'écran se met à jour tout de suite et je peux effacer ma bio |
| `profile-own-page-sections` | D | P1 | M | 900 | profile-own-page-split, profile-identity-visuals, profile-user-service-socle | Ma page de profil montre ma bannière, mon identité, mon contact vérifié, mes langues et mes demandes d'amis |
| `profile-posts-interactions` | D | P1 | L | 1100 | profile-posts-tab | Depuis le profil, j'aime, enregistre, repartage, épingle, modifie ou supprime un post, avec mises à jour en direct |
| `profile-posts-tab` | D | P1 | L | 1300 | profile-collapsible-header-tabs, profile-cache-first-loader, feed-screen-split | L'onglet Postes montre les publications de la personne instantanément, filtrées par Postes, Réels et Stories |
| `profile-preferences-categories-api` | D | P1 | L | 1100 | refus-types-limite-du-jour-mode-lent | Mes préférences audio, messages, vidéo, documents et application, et mes consentements, sont lus et écrits sur le serveur |
| `profile-preferences-manager-sync` | D | P1 | L | 1400 | profile-preferences-categories-api, socle-points-d-extension-de-l-app, persist-outbox-registre-senders | Mes réglages suivent mes appareils, même modifiés hors ligne, sans jamais être écrasés |
| `profile-stats-screen` | D | P1 | M | 900 | profile-user-service-socle, profile-own-page-split, profile-own-page-sections, socle-points-d-extension-de-l-app | L'écran Statistiques montre mes chiffres, mon activité sur 30 jours et mes badges |
| `profile-account-lifecycle` | D | P2 | M | 800 | profile-user-service-socle | Je vois où en est ma suppression de compte, l'app m'invite à prouver mon adresse et je déclare ma date de naissance |
| `profile-decor-equip-ui` | D | P2 | L | 1200 | decor-de-profil-equipe-et-synchronise, profile-own-page-sections, profile-identity-visuals, profile-collapsible-header-tabs, profile-own-avatar-banner-upload, rendu-des-fonds-et-bannieres-de-design, packs-content-store-and-presence | J'équipe un contour d'avatar, une bannière de design ou un cadre visibles de tous |

### Lots fusionnés ou retirés par l'architecture

- `profile-per-account-local-data` → `persist-compte-cache-par-compte` (merge-into) : Même séparation par compte (conversations et caches retrouvés au retour). Hérite : bascule-de-compte-et-isolation.
- `profile-kept-sessions` → `bascule-de-compte-et-isolation` (merge-into) : Les sessions gardées par compte sont la moitié de la bascule de compte.
- `profile-account-switcher-sheet` → `selecteur-de-comptes-et-reglages` (drop-duplicate) : Même feuille « Changer de compte ».
- `profile-image-crop-editor` → `photo-d-entite-recadrage-et-compression` (drop-duplicate) : Même recadrage + compression d'avatar et de bannière.
- `profile-decor-model-service` → `decor-de-profil-equipe-et-synchronise` (drop-duplicate) : Même décor de profil synchronisé.
- `profile-streak-reminders` → `game-streak-reminders` (drop-duplicate) : Mêmes rappels de série.

## Features

### Bloquer ou débloquer quelqu'un depuis son profil est instantané, même hors ligne, et se rétablit si le serveur refuse

`profile-block-unblock` · Android : **absente** · P0 · effort M

iOS : « Bloquer cet utilisateur » / « Débloquer l'utilisateur » dans la section Actions. Le blocage passe par l'outbox hors ligne (`OfflineQueue.enqueue(.blockUser/.unblockUser)` avec `ClientMutationId`) : l'interface bascule immédiatement, la liste canonique `BlockService` est mise à jour (`setBlockedOptimistic`) pour que les gestes de liste restent cohérents, et si l'outbox épuise ses tentatives (`.exhausted`) l'état est restauré, un toast d'erreur s'affiche et l'haptique erreur joue. L'état initial lit d'abord `BlockService` puis le snapshot de connexion `blockedUserIds`. Fiche bloquée : disposition grisée sans onglets, carte « Vous avez bloqué cet utilisateur » + bouton Débloquer vert. Interactions (message, conversations partagées) désactivées tant que bloqué.

Écarts :
- Aucune action Bloquer/Débloquer sur `ProfileScreen` ; `BlockRepository.setBlockedDurably(userId, blocked)` (outbox BLOCK_USER/UNBLOCK_USER) et `BlockCache` existent : les câbler avec bascule optimiste de l'état local ET du cache canonique.
- Observer l'issue de la mutation outbox (applied / exhausted) pour restaurer l'état précédent, afficher le toast « Impossible de bloquer / débloquer cet utilisateur » et déclencher l'haptique erreur.
- État initial = `BlockCache.isBlocked(id)` d'abord, repli sur `blockedUserIds` du snapshot de session pendant la fenêtre qui suit la connexion.
- Disposition « bloqué par moi » : bannière grisée, identité, carte verre « Vous avez bloqué cet utilisateur » + bouton capsule vert « Débloquer », pas d'onglets, pas de bandeau d'amitié.
- Désactiver (opacité 0,35, sans toucher) message, appels et liste des conversations partagées quand `isBlocked || isBlockedByTarget` ; texte « Interactions désactivées ».
- Débloquer relit l'état de connexion (`resolveConnectionStatus`) pour ré-afficher la bonne action.

Rendu : Bouton Bloquer en couleur error, Débloquer en warning dans la liste d'actions ; carte « bloqué par moi » : verre teinté `blockedNeutralHex`, bouton capsule dégradé success → successDeep, texte blanc semibold labelSize.

Transposition Android : `OfflineQueue` + `outcomeStream(for:)` → outbox Room + WorkManager `OutboxFlushWorker` existants (observer l'état de la ligne par cmid) ; `FeedbackToastManager` → snackbar app.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/BlockCache.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/BlockedTab.kt`

### Depuis un profil, on envoie, annule, renvoie, accepte ou refuse une demande de connexion en un geste

`profile-connection-request-actions` · Android : **absente** · P0 · effort M

iOS : la section Actions suit l'état de relation (`ConnectionStatus` : none / pendingSent / pendingReceived / connected), dérivé en continu de `FriendshipCache`. none → « Demande de connexion » ; pendingSent → « Annuler la demande » + « Renvoyer la demande » ; pendingReceived → « Accepter la connexion » (vert) + « Refuser la connexion » ; connected → bandeau vert « Connectés ». Une bannière de contexte explique l'état (« X souhaite entrer en contact avec vous. Acceptez pour échanger des messages. » / « Vous avez envoyé une demande de connexion à X. En attente de sa réponse. »). Toutes les mutations sont optimistes avec rollback du cache d'amitié et toast d'échec ; haptiques success / medium / error.

Écarts :
- Aucune action de relation sur `ProfileScreen` (seul « Signaler » existe pour un tiers) alors que les briques SDK sont là : câbler `FriendshipCache.status`, `FriendRepository.sendFriendRequest/respond/deleteRequest` et `UserRelationshipResolver` dans le VM du profil.
- Section « Actions » (cartes-boutons icône + libellé, couleur par intention, fond teinté opacité subtle, bordure medium) avec les cinq états ci-dessus.
- Bannière de contexte pour pendingReceived / pendingSent avec le nom de la personne.
- Mutations optimistes : `didSendRequest` / `didCancelRequest` / `didAcceptRequest` / `didRejectRequest` puis rollback (`rollbackAccept`, `rollbackReject`, ré-émission de la demande) sur échec ; « Renvoyer » = suppression silencieuse puis nouvel envoi.
- Toasts localisés : Demande envoyée, Demande annulée, Connexion acceptée, Demande refusée, et les quatre échecs (« Impossible d'envoyer la demande / d'annuler / d'accepter / de refuser »).
- Réagir en direct aux changements du cache d'amitié (`objectWillChange` → flux observable) pour que la fiche reflète une demande reçue par socket pendant qu'elle est ouverte.
- Haptique : success à l'envoi/acceptation, medium à l'annulation/refus, error à l'échec.

Rendu : Boutons pleine largeur, icône xs semibold + libellé label semibold, couleur : accent (envoyer/renvoyer), textMuted (annuler/refuser), success (accepter), warning (débloquer), error (bloquer). État connecté : bandeau success opacité subtle rayon smPlus, coche + « Connectés ».

Transposition Android : `FriendshipCache.shared` → `FriendshipCache` Android existant exposé en `StateFlow` ; toasts `meeshy.showToast` → `SnackbarHost`/toast app ; `pressable()` → `Modifier.pressable` sdk-ui.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendshipCache.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/UserRelationshipResolver.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRequestSend.kt`

### Depuis un profil, on écrit à la personne ou on l'appelle en audio ou en vidéo

`profile-message-call-actions` · Android : **absente** · P0 · effort M

iOS : le bouton principal « Envoyer un message » (dégradé indigo500 → indigo400, ombre, haptique medium) ferme la fiche puis ouvre la conversation directe (callback `onSendMessage` ou notification `sendMessageToUser`), pleine largeur dans l'onglet Conversations et en version compacte quand aucune conversation commune n'existe. Si l'app fournit `onCall`, deux boutons « Appel vocal » / « Appel vidéo » (cible 44 pt) construisent un `ProfileCallRequest` (userId, nom, isVideo, conversationId de la conversation directe partagée si elle existe). Masqué pour soi, désactivé si bloqué.

Écarts :
- Aucun bouton Message ni Appel sur le profil : ajouter le bouton « Envoyer un message » (dégradé indigo, rayon 14, ombre) qui ferme la feuille et ouvre/crée la conversation directe via le routeur racine.
- Porter `ProfileCallRequest` (userId, displayName, isVideo, conversationId?) et son constructeur qui choisit la conversation directe partagée dont `participantUserId` est nul ou égal à l'id ; refuser un userId vide.
- Boutons « Appel vocal » / « Appel vidéo » (cible 48 dp) visibles seulement si l'app câble les appels, pour un autre utilisateur non bloqué ; démarrer l'appel via le module calls (permissions micro/caméra gérées par `CallPermissions`).
- Variante compacte du bouton Message (pilule 13 sp) pour l'état vide de l'onglet Conversations ; variante pleine largeur au-dessus de la liste.
- Désactiver (opacité 0,35, non cliquable) quand `isBlocked || isBlockedByTarget`.

Rendu : Bouton principal : dégradé horizontal indigo500→indigo400, hauteur 14+14 pad, texte 15 sp semibold blanc, icône paperplane.fill 14 sp ; compact : padding 20×10, 13 sp, ombre radius 4.

Transposition Android : CallKit → `ConnectionService`/Telecom déjà présent (`TelecomCallReporter`) ; notification `sendMessageToUser` → événement de navigation vers `Routes.conversation`/création de DM.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileCallRequest.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+ConversationsTab.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallUiState.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### L'en-tête du profil se replie au défilement et les onglets restent épinglés

`profile-collapsible-header-tabs` · Android : **absente** · P1 · effort M

iOS : mise en page à un seul défilement. Le grand en-tête (bannière 130 pt) se réduit jusqu'à 52 pt sur 120 pt de défilement (`ProfileHeaderMetrics.progress`), la bannière perd 60 % d'opacité, l'identité (avatar + nom + @pseudo) rétrécit de 12 % et s'efface. Une barre compacte (avatar 32 + nom + @pseudo, séparateur) apparaît en surimpression avec la progression, n'est cliquable qu'au-delà de 50 % et masquée à VoiceOver avant. Les trois onglets Postes / Conversations / Détails (icône + titre, soulignement 2 pt couleur d'accent, ressort 0,3/0,8, haptique légère) s'épinglent sous la barre compacte (décalage 52 pt × progress). Un bouton Fermer en verre flotte en haut à gauche.

Écarts :
- Aucun en-tête repliable ni onglet : `ProfileScreen` est une `TopAppBar` + `Column` verticalScroll. Construire un `LazyColumn` avec `stickyHeader` pour la barre d'onglets et un en-tête dont la hauteur suit le défilement.
- Porter `ProfileHeaderMetrics` (expandedBanner 130, collapsedBar 52, collapseDistance 120, `progress(offset) = min(1, max(0,-offset)/120)`) en fonction pure testée.
- Barre compacte en overlay : avatar 32 dp + nom (bold arrondi, 1 ligne) + @pseudo accent ; opacité = progress ; clics acceptés seulement si progress > 0,5 ; `clearAndSetSemantics` quand progress ≤ 0,5 ; inset gauche 56 dp pour le bouton Fermer.
- Trois onglets `ProfileTab` {posts, conversations, details} avec état hissé, icône + libellé, soulignement 2 dp, animation spring(0.3, 0.8), haptique légère, sémantique « sélectionné ».
- Bouton Fermer en verre (xmark, 36 dp visuel / cible 44 dp) toujours disponible en haut à gauche, libellé « Fermer » + indice « Ferme le profil ».
- Le fond de la barre d'onglets ne doit pas intercepter les touches de la liste dessous (bande de 52 dp non hit-testable).
- Masquer l'identité étendue aux lecteurs d'écran dès que la barre compacte prend le relais (progress > 0,5).

Rendu : Bannière 130 dp → 52 dp, opacité 1 → 0,4 ; identité scale 1 → 0,88 depuis l'ancre haute. Barre compacte : hauteur 52 dp, padding start 56 dp, fond backgroundPrimary opaque, séparateur bas opacité medium. Onglets : titre subhead semibold, couleur accent si actif sinon textMuted, soulignement 2 dp ; padding horizontal xl.

Transposition Android : `pinnedViews: [.sectionHeaders]` → `LazyColumn` + `stickyHeader` ; PreferenceKey de décalage → `LazyListState.firstVisibleItemScrollOffset` / `nestedScroll` ; verre adaptatif (iOS 26 glassEffect) → surface translucide `MeeshyGlassSurface` ; haptique → `HapticFeedbackType.TextHandleMove`/`LongPress` via `LocalHapticFeedback`.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileHeaderMetrics.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### Depuis « Mes stories », j'ouvre, modifie, change la visibilité, partage, republie ou supprime avec confirmation

`profile-mystories-actions-delete` · Android : **absente** · P1 · effort M

iOS : le menu « … » d'une story publiée propose Ouvrir, Listing des vues, Modifier (remet vues/réactions à zéro), Visibilité (sous-menu des modes ; EXCEPT/ONLY ouvrent le sélecteur d'audience pré-coché, les autres partent directement ; liste d'utilisateurs toujours envoyée, même vide), Partager (export), Enregistrer (photothèque), Transférer, Republier, Supprimer. Toute suppression demande confirmation avec un texte qui décrit la conséquence RÉELLE de la cible : story publiée (définitive, plus visible par personne), brouillon (brouillon et médias supprimés), échec de publication (dernière copie du travail perdue ; « Reprendre » proposé). Suppression en masse en mode sélection (alerte « Supprimer les stories sélectionnées ? »). Menu contextuel et actions VoiceOver nommées pour la suppression (la grille n'offre pas de swipeActions). Toasts : Visibilité mise à jour, Story supprimée, Stories supprimées, Story republiée et leurs échecs, Commentaires indisponibles.

Écarts :
- Les feuilles unitaires existent (vues, commentaires, envoi) mais pas leur point d'entrée : créer le menu « … » (Ouvrir, Vues, Modifier, Visibilité, Partager, Enregistrer, Transférer, Republier, Supprimer) et le brancher aux feuilles existantes.
- Édition d'une story publiée (réouvre le compositeur sur la story ; vues/réactions remises à zéro, date de publication inchangée) et republication (`repost`) avec verrou anti double-appui.
- Visibilité : sous-menu des modes sélectionnables ; EXCEPT/ONLY → sélecteur d'audience pré-coché sur la sélection actuelle ; envoyer toujours la liste (même vide) pour nettoyer une audience orpheline ; toasts de succès/échec.
- Confirmations de suppression par cible (`MyStoriesDeleteConfirmation.Target` : story publiée, brouillon, échec) avec les trois titres + messages exacts ; suppression en masse avec alerte dédiée et barre d'action basse.
- Accessibilité : actions nommées « Supprimer » sur chaque carte/ligne (équivalent des swipe actions absents d'une grille) ; menu contextuel appui long.
- Résolution cache-first du post derrière une story pour la feuille de commentaires (`StoryService.cachedPost`).
- Export/Partager/Enregistrer : réutiliser `GallerySaveTarget` et le partage système (ACTION_SEND).

Rendu : Menu avec icônes SF-équivalentes (play, eye, pencil, lock.rotation, square.and.arrow.up, arrow.down, arrow.turn.up.right, arrow.2.squarepath, trash rouge après séparateur). Barre de suppression en masse ancrée en bas (safeAreaInset), visible seulement avec une sélection.

Transposition Android : `Menu` → `DropdownMenu` ; `alert` → `AlertDialog` ; `contextMenu` → appui long ; partage → `Intent.ACTION_SEND` ; enregistrer → `MediaStore.Images/Video`.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MyStoryActionMenu.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesDeleteAlerts.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesDeleteConfirmation.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`

### Chaque story de « Mes stories » est une carte 9:16 avec ses vues, réactions et commentaires sous la vignette

`profile-mystories-card` · Android : **absente** · P1 · effort M

iOS : `MyStoryCard` = vignette au ratio 9:16 (couverture rendue ou locale, repli sur l'URL distante ou le fond de la story, ThumbHash en attendant), bande de glyphes `MyStoryActionBar` sous la vignette (publiée : vues+réactions, réactions, commentaires, « … » ; brouillon : Publier, « … »), date relative « il y a 2 jours » sous un mois calendaire sinon date moyenne, voile gris sur une story expirée (la bande reste nette pour consulter l'engagement), anneau de progression d'export vers la photothèque avec annulation, pastille de sélection (cercle vide / coché) et bordure d'accent 2,5 pt quand sélectionnée. Jamais de « 0 » décoratif ; glyphes qui se partagent la largeur de la carte avec cible 44 pt. Modèles purs `MyStoryCardModelRules.published/draft`.

Écarts :
- Aucune carte de story gérée côté auteur ; créer `MyStoryCardModel` {id, kind published|draft, thumbnailUrl, thumbHash, localCoverPath, backgroundHex, date, expiresAt, counts[glyph], title, saveProgress, saveIsCancellable} et ses fabriques pures.
- Vignette 9:16 (cadre neutre qui impose la taille de la cellule, image en overlay rognée) avec ordre de repli couverture locale rendue → URL distante → couleur de fond ; ThumbHash/placeholder.
- Bande de glyphes : publiée [vues+réactions, réactions, commentaires, plus] ; brouillon [publier, plus] ; compteurs omis quand ≤ 0 ; glyphes interactifs vs indicateurs purs ; menu « … » injecté.
- Libellé de date : relatif complet jusqu'à un mois calendaire, date moyenne au-delà (sans préfixe « il y a » doublé) ; voile gris + libellé « expirée » (`story.mine.card.expired`).
- Anneau de progression + bouton annuler pour l'export vers la galerie ; pastille de sélection et bordure d'accent en mode sélection.
- Accessibilité : la carte compose son libellé (vignette bouton + compteurs), états `selected`, actions nommées « Supprimer ».
- Carte `Equatable`/stable pour éviter les recompositions dans la grille (entrées primitives, actions en données).

Rendu : Carte rayon md continu, fond blanc 4 %/noir 6 % selon le thème, bordure accent 2,5 dp si sélectionnée ; glyphes sm semibold secondaires, compteurs smallSize medium ; hauteur de bande 44 dp ; date en pied.

Transposition Android : `RelativeDateTimeFormatter` → `DateUtils.getRelativeTimeSpanString` / `RelativeTimeLongText` existant ; Equatable → classes `@Immutable` + `key` stables ; export photothèque → `MediaStore` (voir GallerySaveTarget).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MyStoryCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoryCardModelRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoryCardPresentation.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoryActionBar.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersPresentation.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCountDots.kt`

### « Mes stories » regroupe mes stories publiées, ma file d'envoi, mes brouillons et mon archive

`profile-mystories-shell-tabs` · Android : **absente** · P1 · effort M

iOS : feuille « Mes stories » avec sélecteur segmenté à quatre onglets — Publiées (stories actives), File (uploads en cours + échecs, visible seulement s'il y a du travail réseau), Brouillons (toujours visible), Archive (stories expirées, visible seulement s'il y en a). `MyStoriesTabResolver` choisit l'onglet d'ouverture (Publiées si rien d'actif → File si du travail attend → Brouillons), seulement UNE fois à l'apparition, et ramène sur Publiées quand un onglet perd sa matière. États vides dédiés par onglet. Barre d'outils : « + » (créer une story, en verre indigo), « Sélectionner » (mode sélection pour supprimer en masse), « OK ». Cibles de feuilles : audience (EXCEPT/ONLY), commentaires, vues, export, transfert. Ouverte depuis la tuile Stories du profil ou le plateau de stories.

Écarts :
- Aucun écran de gestion de ses propres stories : ni liste de mes stories publiées, ni archive, ni brouillons listés (le compositeur garde un brouillon unique), ni accès depuis la tuile Stories du profil. Créer l'écran « Mes stories » (feuille/page) avec les quatre onglets.
- Porter `MyStoriesTab` {published, queue, drafts, archive} et `MyStoriesTabResolver` (initialTab, visibleTabs, shouldShowEmptyState) en fonctions pures testées : File et Archive n'apparaissent qu'avec matière, onglet d'ouverture semé une seule fois, repli sur Publiées quand l'onglet courant disparaît.
- Archive complète des stories (actives et expirées, au-delà de la fenêtre de 7 jours du plateau) : nécessite l'endpoint/agrégat d'archive et un chargement `loadMyStoriesArchive`.
- États vides illustrés par onglet : « Aucune story envoyée », « Rien en file », « Aucun brouillon », « Aucune archive » + sous-titres.
- Barre d'outils : bouton « + » (créer, ferme la feuille avant d'ouvrir le compositeur), « Sélectionner / Annuler la sélection » (mode sélection), « OK » ; barre d'action de suppression en bas quand une sélection existe.
- Sélecteur segmenté (pas de pager horizontal : le geste entre en conflit avec le balayage de fermeture de la feuille) ; sélection filtrée contre les stories réellement affichées (une story supprimée ailleurs sort de la sélection).
- Cibles de feuilles `AudienceTarget` (story + mode) et `MyStoriesCommentTarget` (post résolu cache d'abord via `MyStoriesCommentsResolver`).
- Ouvrir « Mes stories » depuis la tuile « Stories » du profil et depuis l'événement racine `openMyStories`.

Rendu : Grille adaptative de cartes 9:16 (cellule ≈ 150–180 dp), titre inline « Mes stories », bouton « + » rond 32 dp en verre prominent indigo, boutons texte en capsule verre. Pas de pager horizontal.

Transposition Android : `Picker(.segmented)` → `SingleChoiceSegmentedButtonRow` ; `LazyVGrid(adaptive 150pt)` → `LazyVerticalGrid(GridCells.Adaptive(150.dp))` ; sheet → `ModalBottomSheet` plein écran ; `NotificationCenter(.openMyStories)` → route Compose.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesTab.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesSheetTargets.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoriesViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`

### On aime, enregistre, repartage, partage, signale, épingle, modifie ou supprime un post depuis le profil, avec mises à jour en direct

`profile-posts-engagement-live` · Android : **absente** · P1 · effort M

iOS : `ProfileUserPostsViewModel` applique des surcharges optimistes (like, bookmark, repost, partage) avec compteur ajusté ±1 et rollback + toast sur échec ; les reposts sont append-only (le basculement ne persiste que si le serveur confirme). Menu de carte selon la propriété : mon post → Modifier (feuille d'édition avec média, lieu, visibilité, langue), Épingler, Supprimer / Retirer / Passer en privé (`PublicationWithdrawal`) ; post d'autrui → Signaler. Mises à jour temps réel par socket : `post:liked`/`unliked` (total absolu, levée de la surcharge à l'écho de sa propre action), `post:reposted` (delta dédupliqué), compte de commentaires, traductions demandées par drapeau puis reçues par socket. Impressions de cartes regroupées par lot (`ImpressionBatcher`) et vidées à la sortie.

Écarts :
- `UserPostsViewModel` est explicitement en lecture seule (« no optimistic mutation lives here ») : ajouter like / bookmark / repost / partage optimistes avec compteur ajusté, rollback et toasts (« Erreur », « Repartagé », « Erreur lors du repost »).
- Menu de carte par propriétaire : Modifier (feuille d'édition), Épingler, Supprimer / Retirer / Passer en privé avec confirmation, Signaler pour autrui ; toasts « Publication supprimée / signalée / épinglée / modifiée » et leurs erreurs.
- Abonnements socket `post:liked`, `post:unliked`, `post:reposted`, `post:comment-count`, traductions de post : total absolu = nouvelle base, levée de la surcharge à l'écho de soi, déduplication des reposts, le repost rejoint la tête de liste quand c'est le profil consulté.
- Demande de traduction par drapeau de langue non chargé, résultat patché dans la carte à l'arrivée du socket.
- Impressions : regrouper les cartes vues par lot (minuteur de groupement) et vider à la sortie de la liste ; ne pas poster un lot par carte.
- Réutiliser au maximum la logique d'engagement du feed (FeedViewModel) au lieu de la dupliquer.

Rendu : Aucun écart visuel propre : mêmes cartes et mêmes barres d'action que le feed ; retour instantané sur chaque action (compteur et icône pleins immédiatement).

Transposition Android : `SocialSocketManager` → manager socket social Android ; `ImpressionBatcher` → file WorkManager/Flow avec flush `onStop` ; `EditPostSheet` → feuille d'édition de post (feature feed).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsScreen.kt`

### L'onglet Conversations liste les conversations que l'on partage avec la personne

`profile-shared-conversations-tab` · Android : **absente** · P1 · effort M

iOS : `ConversationService.listSharedWith(userId)` alimente une liste de rangées (avatar de conversation, nom, chevron) avec apparition échelonnée et séparateurs inset 64 pt ; toucher ouvre la conversation (callback ou notification `navigateToConversation` après fermeture). État vide : icône bulles (ou « nosign » si bloqué), bouton Message compact, texte « Aucune conversation en commun » ou « Interactions désactivées ». Chargement une fois la fiche ouverte, sans bloquer le reste. Opacité 0,35 si interactions désactivées.

Écarts :
- Aucun appel « conversations partagées » côté Android (ni endpoint Retrofit ni repository) : ajouter l'endpoint, le mapper vers `Conversation` et le `touch` du cache conversations.
- Onglet Conversations avec rangées (avatar `MeeshyAvatar` accent de la conversation, nom 1 ligne, chevron), séparateurs inset 64 dp, apparition échelonnée (0,04–0,05 s par rang).
- État vide avec icône, bouton Message compact et texte localisé ; variante « Interactions désactivées » (icône interdit, opacité réduite) si bloqué.
- Ouverture de la conversation : fermer la feuille puis naviguer (délai 0,3 s) ; haptique légère.
- Chargement indépendant du profil, échec silencieux (garder la liste précédente).

Rendu : Rangée : avatar liste de conversations, nom labelSize medium, chevron xs semibold textMuted ; padding horizontal xl / vertical smPlus ; séparateur opacité medium, inset 64.

Transposition Android : `LazyColumn` + `animateItem` pour l'apparition échelonnée ; `MeeshyPointerPlainButtonStyle` → ripple sans fond.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+ConversationsTab.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations`

### L'app m'invite à prouver mon adresse et à ajouter un numéro selon la phase d'activation de mon compte

`profile-activation-invite` · Android : **absente** · P2 · effort S

SDK iOS : `UserActivation` {phase, deadline, missing[]} servi dans la charge de soi (connexion et `/auth/me`). Phases : `quiet` (J0–J7, rien n'est demandé), `invite` (J7–J28, l'app invite), `blocked` (après J28, la connexion mène à l'écran du code), `done` (adresse prouvée, le numéro peut manquer). Décodage TOLÉRANT : phase inconnue → `nil` (jamais d'invitation fabriquée), canal inconnu écarté seul. `invites` n'est vrai qu'en phase `invite` avec quelque chose à demander ; `daysLeft(now)` arrondit au jour supérieur sans jamais être négatif.

Écarts :
- Ni `activation` dans le modèle d'utilisateur de session ni type `UserActivation` : ajouter {phase: quiet|invite|blocked|done?, deadline?, missing: [email|phone]} avec décodage tolérant (phase/canal inconnus ignorés individuellement) et `invites`, `daysLeft`.
- Brancher la phase `invite` sur une invitation discrète (bandeau/bulle) vers la preuve d'adresse e-mail et l'ajout d'un numéro, avec compte à rebours en jours ; phase `blocked` → écran de saisie du code à la connexion (l'écran lui-même relève du domaine auth).
- Rafraîchir l'activation à chaque `/auth/me` et après preuve d'un canal.

Rendu : Bandeau discret (pas de popup bloquant) en phase invite ; wording donnant le nombre de jours restants.

Transposition Android : kotlinx.serialization avec `JsonTransformingSerializer`/valeurs par défaut tolérantes ; bandeau Compose dans la coque de navigation.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/UserActivation.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Auth.kt`

### Je déclare ma date de naissance une seule fois et l'app applique les restrictions d'âge

`profile-birthdate-declaration` · Android : **absente** · P2 · effort S

SDK iOS : `BirthDateService.setBirthDate(date)` envoie un jour civil `YYYY-MM-DD` (fuseau de l'appareil, formatage sans locale) à `PUT /me/birth-date` et rend `APIBirthDateDeclaration {ageClass: adult\|minor\|unknown(x), viewerWriteRestrictionGlobal}` (décodage tolérant). Les erreurs sont classées : `alreadySet` (code BIRTH_DATE_ALREADY_SET ou 409), `belowMinimumAge` (AGE_BELOW_MINIMUM ou 422), `invalidDate` (400), `unsupported` (404), `unavailable` (autre).

Écarts :
- Aucun service de déclaration de date de naissance (le seul `birthDate` Android est un champ du profil vocal) : ajouter l'API `PUT me/birth-date`, le corps `{birthDate: "YYYY-MM-DD"}` calculé dans le fuseau local, et `BirthDateDeclaration {ageClass, viewerWriteRestrictionGlobal}` tolérant.
- Classifier les erreurs (alreadySet, belowMinimumAge, invalidDate, unsupported, unavailable) à partir du code et du statut HTTP.
- Interface de déclaration (sélecteur de date, message de refus sous l'âge minimum) et application de `viewerWriteRestrictionGlobal` (écriture restreinte pour mineur) — l'écran relève de l'onboarding/réglages.

Rendu : Sélecteur de date natif ; messages d'erreur localisés par cas, pas de saisie libre.

Transposition Android : `java.time.LocalDate` + `ZoneId.systemDefault()` pour le jour civil ; `DatePickerDialog` Material3.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/BirthDateService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

### J'équipe un contour d'avatar, une bannière de design ou un cadre de bannière visibles de tous

`profile-decor-equip` · Android : **absente** · P2 · effort L

iOS : l'entrée « Contour et bannière » du profil (« Visibles de tous sur ton profil ») ouvre une feuille avec trois groupes de tuiles : Contour d'avatar, Bannière (avec tuile « Image » qui lance le sélecteur de photo et note « Ton image de bannière passe devant les fonds »), Cadre de bannière — chacun avec une tuile « Aucun » et le lien « Plus dans la boutique » vers la vitrine du domaine. Seuls les packs INSTALLÉS et POSSÉDÉS sont listés. Équiper est optimiste : le choix s'écrit au toucher, le serveur confirme, un refus rétablit uniquement le côté touché ; un numéro de choix par côté empêche une réponse ancienne d'écraser une plus récente ; l'événement socket `profileDecorUpdated` synchronise les autres appareils. Message « Impossible d'enregistrer ce choix. Réessayez. » en cas d'échec ; bouton Terminé.

Écarts :
- Aucun concept de décor de profil, de packs de boutique (`ShopPack`, `PackDomain`) ni de `ServedProfileDecor` côté Android : modèles + tolérance par côté (un décor illisible n'empêche jamais le reste), service `ProfileDecorProviding` (lecture/écriture par côté), liste des packs installés par domaine (avatarRing, banner, bannerFrame).
- Rendus : contour d'avatar (`AvatarRing`), bannière de design (`BannerDesignView`, fond animé/dégradé), cadre de bannière (`BannerFrameView`, centre transparent, ne capte pas le doigt) — à porter dans sdk-ui car ils servent aussi les autres profils, posts et mentions.
- Feuille d'équipement : trois sections de tuiles sélectionnables (contour du choix actuel, « Aucun », tuile « Image » ouvrant le Photo Picker et passant la bannière-photo devant les designs), lien « Plus dans la boutique ».
- Logique optimiste par côté avec numérotation des choix, `accepted` pour le rollback et fusion des événements socket `profile-decor-updated`.
- Entrée « Contour et bannière » dans ma page de profil (titre + sous-titre « Visibles de tous sur ton profil »).
- Règle de rendu partagée : la photo de bannière gagne toujours sur le design ; le décor est masqué si la cible m'a bloqué.
- Dépend d'une boutique de packs (hors de ce lot) : prévoir un repli (packs installés d'office uniquement) tant qu'elle n'existe pas sur Android.

Rendu : Tuiles carrées avec contour de sélection (`DecorTileOutline`), titres de section accent, lien boutique avec icône sac ; bannière et contour animés si le design l'est (respecter reduce motion).

Transposition Android : `PhotosPicker` → Photo Picker ; `AvatarRingDesign`/`AppearanceDesign` → composables Canvas/Brush ; `PackService` → client REST boutique ; `NotificationCenter(.profileDecorUpdated)` → flux socket Android.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileDecorSheet.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`

### Mon humeur apparaît sur ma propre photo de profil, avec mon contour équipé

`profile-own-avatar-mood` · Android : **absente** · P2 · effort S

iOS : `ProfileOwnAvatar` peint mon avatar avec l'emoji d'humeur que tous les autres écrans affichent (résolveurs de chrome social `meeshyMoodEmojiResolver`, alimentés par le cache des statuts, aucune requête), tap sur l'humeur = bulle d'humeur ; l'humeur est retirée pendant l'édition (le crayon occupe le coin) ; l'avatar reçoit le contour équipé (`avatarRing`) ; accent de profil (`profileAccentHex`) et couleur secondaire indigo300.

Écarts :
- Mon avatar de profil n'affiche pas mon humeur (`MeeshyAvatar(moodEmoji)` supporte déjà le paramètre) : résoudre l'humeur depuis le cache des statuts (`StatusBarCache`) sans requête réseau, masquer pendant l'édition, tap = ouvrir la bulle d'humeur.
- Appliquer le contour d'avatar équipé (voir profile-decor-equip) avec taille d'avatar de contexte profil.
- Accent déterministe du profil (`profileAccentHex`) et couleur secondaire indigo300.
- Dégradation silencieuse si les résolveurs sont absents (pas de pastille).

Rendu : Avatar contexte `profileBanner` (90 pt), anneau de fond 4 dp de la couleur de fond, pastille d'humeur au coin comme sur les autres écrans.

Transposition Android : `@Environment(\.meeshyMoodEmojiResolver)` → `CompositionLocal` de résolveur d'humeur fourni à la racine.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileOwnAvatar.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationMoodStatus.kt`

### Trois tuiles Postes / Réels / Stories comptent le contenu exact de la personne et filtrent la liste

`profile-posts-filter-band` · Android : **absente** · P2 · effort S

iOS : en tête de la liste, une bande de trois tuiles (icône, valeur arrondie, libellé) : Postes et Réels filtrent la liste (re-toucher la tuile active remet « tout »), Stories ouvre « Mes stories » sur son propre profil (tuile informative pour un tiers). Les compteurs viennent des stats serveur exactes quand elles sont là, sinon sont dérivés des posts chargés (valeur approximative marquée « + » tant qu'il reste des pages). Tuile sélectionnée = bordure indigo500 0,9 ; animation spring 0,3/0,8 ; accessibilité « valeur libellé » + état sélectionné.

Écarts :
- Aucune bande de compteurs ni filtre : créer `ProfilePostsCounts` (compute depuis la liste, merging avec `UserStats`, `displayValue(isApproximate)`) et `ProfilePostsFilter {all, posts, reels}` avec `toggled(with:)`.
- Filtre appliqué AVANT la fenêtre de rendu (un profil à 90 % de réels ne doit pas paraître vide en mode Postes) ; posts = ni réel ni story.
- Trois tuiles verre (rayon md, bordure indigo500 opacité 0,9 si sélectionnée) avec haptique légère ; Stories → ouvre « Mes stories » seulement pour soi.
- Compteurs exacts via `expand=stats` (compteur de stories structurellement 0 côté dérivé) ; marquer l'approximation.
- Accessibilité : `mergeDescendants`, libellé « 12 Postes », état `selected`.

Rendu : Tuile : icône 15 sp semibold indigo500, valeur subtitle bold arrondie monospacedDigit (1 ligne, min scale 0,6), libellé caption2 textMuted ; padding vertical md ; espacement sm ; padding horizontal md.

Transposition Android : Tuiles → `Row` de trois `MeeshyGlassSurface` cliquables ; animation de filtre → `animateContentSize`/`AnimatedContent`.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsViewModel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsViewModel.kt`

### Un rappel local me prévient avant que ma série ne tombe, jamais plus qu'il ne faut

`profile-streak-reminders` · Android : **absente** · P2 · effort M

iOS : la série est le seul compteur qui se PERD en n'agissant pas. `StreakReminderPlan.rappels(...)` (pur : ni horloge ni centre de notifications) rend jusqu'à six rappels — deux par moment (matin 8 h/9 h, midi 12 h/13 h, soir 19 h/20 h) — ou une liste VIDE si : notifications non déjà autorisées (jamais de demande de permission pour ça), série à 0, ou geste déjà posé aujourd'hui ; une heure passée ou pile n'est pas planifiée. Texte qui dit ce qui est en jeu (« Votre série vous attend » / « N jours tenus. Un message, une story ou un post aujourd'hui, et la série continue. »). `StreakReminderScheduler` retire INCONDITIONNELLEMENT son jeu (identifiants stables `streak-reminder.<moment>.<heure>`) puis repose les rappels en déclencheurs CALENDAIRES (suivent le fuseau), route `/progression` au tap ; replanifié à chaque relecture de la progression ; `annulerTout` à la déconnexion. `StreakActivityMark` mémorise localement le jour du dernier geste (clé stable `année-mois-jour`) : on préfère un rappel de trop à une série perdue.

Écarts :
- Aucun rappel local de série ni marque d'activité du jour : porter `StreakReminderPlan` (fonction pure + `Moment` matin/midi/soir, écart 1 h, six cas vides) avec tests, `StreakReminderCopy` localisé (singulier/pluriel) et `StreakActivityMark` (clé de jour, idempotente).
- Planificateur Android : `AlarmManager.setExactAndAllowWhileIdle`/`WorkManager` + `NotificationManagerCompat` (canal dédié « Rappels de série »), retrait inconditionnel du jeu précédent par identifiants stables avant chaque repose, déclencheurs calendaires suivant le fuseau (recalcul au changement de fuseau).
- Ne jamais demander `POST_NOTIFICATIONS` pour ce rappel : lire l'autorisation existante ; rien n'est planifié si refusée.
- Replanifier à chaque relecture de la progression (ouverture de l'écran, retour au premier plan) et marquer le geste du jour à l'envoi d'un message / story / post ; `annulerTout` à la déconnexion.
- Tap sur la notification → route Progression (`/progression`) par deep link.
- Source de vérité de la série : endpoint d'engagement (`/me/engagement`) ; l'écran Progression lui-même est hors de ce lot.

Rendu : Notification standard : titre « Votre série vous attend », corps avec le nombre de jours tenus, son par défaut, icône de l'app ; aucune action supplémentaire.

Transposition Android : `UNUserNotificationCenter` + `UNCalendarNotificationTrigger` → `AlarmManager` + `NotificationCompat` (ou WorkManager périodique) ; `UserDefaults` → `DataStore` ; autorisation → `areNotificationsEnabled()` + permission `POST_NOTIFICATIONS` (Android 13+).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StreakReminderPlan.swift`
- `apps/ios/Meeshy/Features/Main/Services/StreakReminderScheduler.swift`
- `apps/ios/Meeshy/Features/Main/Services/StreakActivityMark.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`

### On peut écouter l'échantillon de voix public d'une personne depuis son profil

`profile-voice-sample-card` · Android : **absente** · P2 · effort S

iOS : si la personne a rendu sa voix publique (`voicePublic == true`) et qu'un échantillon existe (`voiceSampleUrl`), l'onglet Détails affiche une section « Voix » avec une carte (icône waveform + titre) contenant le lecteur audio standard (`AudioPlayerView`, contexte feedPost, accent du profil, durée `voiceSampleDurationMs`). Rien n'est affiché sinon.

Écarts :
- `MeeshyUser` ignore `voicePublic`, `voiceSampleUrl`, `voiceSampleDurationMs`, `voiceQuality` (le commentaire de `UserApi.getPerson` le confirme) : ajouter ces champs (tolérants) au modèle ou à un `PublicProfile`.
- Section « Voix » conditionnée par `voicePublic == true` et URL non vide, avec carte verre rayon xxl, icône waveform accent, titre semibold.
- Lecteur audio réutilisant le composant audio de sdk-ui (même rendu que les posts du feed), pièce jointe synthétique `audio/mp4` + durée en ms.
- Libellé d'accessibilité « Voix » sur le conteneur.

Rendu : Carte verre rayon xxl, padding lg, icône waveform xs semibold accent à gauche du titre subhead semibold.

Transposition Android : `AudioPlayerView` → lecteur audio Media3 déjà utilisé par les bulles/posts (sdk-ui).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`

### Je modifie mon profil, l'écran se met à jour tout de suite et l'enregistrement survit à la perte de réseau

`profile-own-edit-save` · Android : **divergente** · P1 · effort M

iOS : le mode édition rend prénom, nom, nom affiché, bio multiligne et les trois langues modifiables. `saveProfile` applique la modification en optimiste (`applyingProfileEdits`) AVANT le réseau, ferme l'édition, joue l'haptique succès ; `changedOrNil(current, original)` distingue « champ non touché » (omis) de « champ volontairement vidé » (chaîne vide envoyée : bio, langue régionale, langue personnalisée) ; hors ligne la requête est mise en file `SettingsActionQueue` (`PATCH /users/me`) avec toast « Modifications enregistrées — seront synchronisées au retour en ligne » ; en ligne, la réponse serveur est fusionnée sur l'utilisateur local (`mergingServerUser` conserve `voicePublic` et le décor que la route ne renvoie pas) ; sur échec, retour au cliché d'avant et réouverture de l'éditeur avec message.

Écarts :
- Divergence fonctionnelle : `ProfileEditRequestBuilder` convertit tout champ vide en `null` (omis), donc on ne peut PLUS effacer sa bio, sa langue régionale ni sa langue personnalisée ; porter `changedOrNil` (comparaison au cliché d'origine, chaîne vide envoyée pour un effacement volontaire, jamais un « effacement de rien »).
- Les champs prénom / nom / nom affiché ne doivent rester omis que lorsqu'ils sont vides, comme iOS ; la bio, la langue régionale et la langue personnalisée doivent pouvoir être vidées (le schéma gateway les accepte).
- Fusion de la réponse serveur sur l'utilisateur local en conservant les champs que la route self ne sert pas (`voicePublic`, `profileDecor`) — l'équivalent de `mergingServerUser` ; sans lui, l'état local perd ces champs à la première réponse.
- Toast hors ligne « Modifications enregistrées — seront synchronisées au retour en ligne » (aujourd'hui la mise en file est silencieuse) ; toast d'échec avec rollback au cliché et réouverture de l'éditeur sur erreur serveur définitive (Android ne rouvre l'éditeur que sur échec d'enqueue local).
- Haptique succès à l'enregistrement, erreur à l'échec.
- Validation côté client (bio ≤ 500) alignée sur le schéma gateway.

Rendu : Champs avec icône de champ + titre footnote + valeur label ; multiligne pour la bio ; mode édition : le nom/@pseudo du bloc identité disparaît ; bouton « Enregistrer » en accent semibold dans l'en-tête.

Transposition Android : `SettingsActionQueue` → outbox `UPDATE_PROFILE` Room + WorkManager (déjà là) ; `UserDefaults` → n/a.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileViewModel.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileEditRequestBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ProfileEditApply.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`

### Un profil s'affiche tout de suite depuis le cache puis se met à jour, avec Réessayer en cas de panne

`profile-cache-first-load` · Android : **partielle** · P0 · effort M

iOS : `ProfileSheetLoader` peint d'abord le cache (profil et statistiques, clés id ET handle), puis synchronise même si le cache est frais (ouvrir une fiche, c'est la vouloir à jour) ; profil et statistiques partent en parallèle quand l'id est connu. UN seul aller-retour `GET /directory/people/:handle?expand=stats,presence` (`UserService.getProfile`). Le squelette ne s'affiche qu'à cache vide ; un échec ne retire jamais ce qui est peint ; « Ce profil n'a pas pu se charger. » + bouton Réessayer seulement si rien du cache ne le remplace ; 403 = refus (pas une panne) ; 404 sur une fiche déjà peinte = bloqué par la cible (profil et stats effacés). Écritures best-effort dans les stores `profiles`/`stats`, indexation de recherche, cache des noms d'affichage, touch LRU. `ProfileLoading` est la couture injectable (Live côté app, Uncached par défaut dans le SDK) ; `UserProfileViewModel` porte la même logique SWR (fresh/stale/expired/empty) pour les hôtes sans feuille.

Écarts :
- Pas de cache des profils tiers : `loadProfile` fait un appel réseau puis affiche un `CircularProgressIndicator` plein écran. Ajouter une entité/DAO Room `ProfileCache` (clé id et handle), un `CacheResult` fresh/stale/expired/empty, peindre le cache puis synchroniser même si frais.
- Remplacer le spinner plein écran par un squelette (en-tête + onglets shimmer) uniquement à cache vide ; ne jamais recouvrir un cache peint par une erreur.
- UN seul aller-retour : `getPerson` envoie `expand=presence` et le VM refait `GET users/{id}/stats` (route héritée dont `totalTranslations` valait 0) → demander `expand=stats,presence` et décoder `PublicProfile {user, stats?, relation?, isSelf}` (voir profile-user-service-sdk).
- État d'échec dédié « Ce profil n'a pas pu se charger. » avec bouton Réessayer (capsule accent, cible 44 dp) rejouant cache puis synchro ; aujourd'hui l'erreur part dans un snackbar et la page reste vide.
- Interpréter 403 (refus, pas de réessai) et 404 sur fiche peinte (bloqué par la cible → effacer profil/stats/décor, fermer la fiche).
- Charger profil et stats en parallèle quand l'identifiant est connu ; sinon profil d'abord puis stats avec l'id résolu ; stats en cache lues séparément (store `profileStats`).
- Effets de bord : enregistrer le nom dans le cache des noms d'affichage, indexer l'utilisateur dans la recherche locale, `touch` du profil et des conversations partagées pour l'éviction LRU.
- Hydrater un `ProfileSheetUser` incomplet (ouvert par pseudo seul) depuis le profil chargé sans perdre l'accent.

Rendu : Squelette = barres arrondies teintées accent (opacité 0,1) avec shimmer, jamais de ProgressView. Message d'échec : icône wifi.exclamationmark 28 pt light, texte labelSize medium centré, bouton capsule plein accent, texte blanc semibold.

Transposition Android : `CacheCoordinator.profiles/stats` → Room (`ProfileCacheEntity` + DAO) + `ProfileStatsCacheRepository` existant ; `ProfileLoading` → interface Kotlin injectée par Hilt ; `@Published` → `StateFlow<ProfileLoadState>`.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetLoader.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileLoading.swift`
- `apps/ios/Meeshy/Features/Profile/LiveProfileLoading.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/ProfileStatsCacheRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`

### Toucher un nom ou un avatar ouvre la fiche profil de la personne, d'où que l'on vienne

`profile-sheet-shell` · Android : **partielle** · P0 · effort M

iOS : `UserProfileSheet` est une feuille (détentes medium/large, `adaptiveWideSheet` sur iPad) alimentée par un `ProfileSheetUser` fabriqué depuis un message, un groupe de stories, un post, une référence de post, un commentaire, une conversation directe ou un `MeeshyUser` (`ProfileSheetUser.from(...)`). L'identité est `userId ?? participantId ?? username` ; un visiteur anonyme n'a pas de compte (`isAnonymous`, `participantId`). La couleur d'accent du profil est dérivée (`DynamicColorGenerator.profileAccentHex`). La fiche se ferme seule quand la cible m'a bloqué, passe en disposition grisée sans onglets quand c'est moi qui ai bloqué, se repeint en direct sur le socket `user:updated` (renommage, nouvelle photo) et reconnaît « c'est moi » par id OU pseudo (les actions disparaissent alors).

Écarts :
- Android ouvre le profil d'un tiers comme PAGE plein écran (`Routes.PROFILE_USER`, `ProfileScreen`) : présenter la fiche en `ModalBottomSheet` (demi-hauteur → plein écran, largeur limitée sur tablette/pliable) et garder la route uniquement pour les deep links et le partage.
- Créer le modèle `ProfileSheetUser` (userId?, participantId?, isAnonymous, username, displayName, avatarUrl, bannerUrl, accentColor, bio, langues, présence, createdAt, timezone, registrationCountry, profileCompletionRate, hasE2EE, voice*, profileDecor) et ses fabriques depuis message, StoryGroup, FeedPost, PostReference, FeedComment, conversation directe, MeeshyUser ; id = userId ?? participantId ?? username ; reconnaître un ObjectId (24 hex) d'un pseudo.
- Visiteur anonyme : ne jamais traiter `senderId` comme un compte ; ouvrir la fiche de participation (`ParticipantProfileSheet` existe côté membres mais n'est pas branchée sur l'auteur d'un message).
- Fermer la feuille automatiquement quand la cible m'a bloqué (403, ou 404 sur une fiche déjà peinte) ; afficher la disposition « bloqué par moi » (bannière grisée + carte « Vous avez bloqué cet utilisateur » + bouton Débloquer, sans onglets).
- Repeindre la fiche ouverte sur l'événement socket `user:updated` (renommage / photo du pair) sans relecture réseau, et laisser la synchro mettre à jour le cache `profiles`.
- Détecter « c'est moi » par id OU username et masquer toutes les actions (connexion, blocage, signalement, message, appel).
- Couleur d'accent du profil dérivée de (userId, nom) — pas celle de l'écran appelant — pour avatar sans photo, bannière par défaut, onglet actif, pastilles.
- Callbacks de sortie `onNavigateToConversation` / `onSendMessage` / `onCall` / `onViewStory` / `postsContent` injectés par l'app ; navigation retardée de 0,3 s après fermeture de la feuille pour éviter la course sheet/navigation.

Rendu : Fond backgroundPrimary, le contenu monte jusqu'au bord haut (bannière sous la barre d'état). Détente medium puis large. Accent du profil = couleur déterministe du nom, jamais l'accent de conversation. Cible tactile ≥ 44 pt partout.

Transposition Android : Feuille SwiftUI → `ModalBottomSheet` Material3 (skipPartiallyExpanded=false) ; `adaptiveWideSheet` → largeur max 640 dp centrée sur tablette/pliable ; fermeture par geste retour système ; `NotificationCenter` « navigateToConversation » → callbacks de navigation Compose.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt`

### Le socle SDK lit un profil public, modifie le mien et téléverse mes images avec une seule adresse canonique

`profile-user-service-sdk` · Android : **partielle** · P0 · effort M

SDK iOS : `UserServiceProviding` regroupe recherche (offset + page scellée avec identifiant de recherche), `updateProfile`, `updateAvatar`/`updateBanner` (URL après `uploadImage` multipart), changement d'e-mail et de téléphone (change, verify, resend), lectures par e-mail / téléphone et SURTOUT `getProfile(handle:expand:)` à l'adresse canonique `GET /directory/people/:handle?expand=stats,presence,relation` qui rend un `PublicProfile {user, stats?, relation?(chaîne, jamais enum), isSelf}` — fondre deux allers-retours en un. `ProfileExpansion {stats, presence, relation}` : les compteurs sont publics pour tous, intimes pour soi/admin ; la présence n'est servie qu'à un ami accepté et sous les réglages de la personne.

Écarts :
- `UserApi.getPerson` appelle bien `directory/people/{handle}` mais avec `expand=presence` figé, décode seulement `MeeshyUser` et ignore `stats`/`relation`/`isSelf` : introduire `PublicProfile {user, stats?, relation?: String, isSelf=false}` et `ProfileExpansion` (stats, presence, relation) avec valeur par défaut `stats,presence`.
- Décodage tolérant : `relation` en chaîne + lecture typée avec repli, ne jamais faire échouer le document entier sur une valeur inconnue.
- Supprimer l'appel séparé `users/{id}/stats` pour les profils (la route héritée a divergé : `totalTranslations` valait 0) ; garder `users/me/stats` pour soi.
- Recherche de personnes avec page scellée (identifiant de recherche renvoyé par la passerelle) et pagination par offset.
- Téléversement d'image multipart (`uploadImage(data, filename)` → URL) suivi de `updateAvatar` / `updateBanner`, avec décodage de la réponse d'upload imbriquée.
- Ajouter les champs manquants de `MeeshyUser` servis par la route (voicePublic, voiceSample*, profileDecor, activation, banner/thumbhash déjà présents).

Rendu : Aucun (infrastructure) ; la présence servie conditionne l'affichage du point vert/orange/gris.

Transposition Android : Retrofit + kotlinx.serialization (`ignoreUnknownKeys`, `explicitNulls=false`) ; `APIClient.request` → `MeeshyApi` ; `Set<ProfileExpansion>` → `EnumSet` joint par virgule.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRequests.kt`

### L'onglet Détails présente la bio, les langues, le fuseau, le pays, le chiffrement et la complétude du profil

`profile-about-section` · Android : **partielle** · P1 · effort S

iOS : section « À propos » (en-tête de section teinté + icône) visible seulement s'il y a une bio, des puces d'info, le badge E2EE ou un taux de complétude. Contenu : carte bio (callout, 5 lignes max, verre teinté accent), pastilles de langue (drapeau + nom, langue système puis régionale dédupliquées), puces fuseau horaire (icône horloge) et pays (drapeau + nom via `CountryFlag`), badge « Chiffrement de bout en bout activé » (capsule verte, cadenas), anneau de complétude centré (`ProfileCompletionRing`).

Écarts :
- Les données existent mais en texte brut : bio en `Text`, langues/pays/fuseau en lignes clé-valeur, E2EE en ligne simple. Recomposer en onglet « Détails » avec en-tête de section (icône + titre accent) et cartes verre.
- Carte bio : fond dégradé teinté accent, coins `MeeshyRadius.lg`, 5 lignes max.
- Pastilles de langue (drapeau + nom localisé), dédupliquées entre langue système et régionale ; puces fuseau/pays en capsules à bordure teintée.
- Badge E2EE en capsule verte (cadenas bouclier) avec libellé « Chiffrement de bout en bout activé » ; la copie actuelle « Chiffré de bout en bout » diffère.
- Anneau de complétude affiché dans l'onglet, centré sous les puces, et non autour de l'avatar.
- N'afficher la section que si au moins un de ses éléments existe (bio, fuseau, pays, E2EE, complétude).

Rendu : Espacement entre sections xxl+xs, padding horizontal xl, rayon cartes lg, puces capsule padding md × xsPlus, bordure accent opacité 0,2, fond accent opacité 0,12.

Transposition Android : `SettingsSectionHeader`/`glassCard` → `MeeshyGlassSurface` + composant d'en-tête de section partagé du module settings ; `CountryFlag` → `LanguageData`/drapeaux emoji existants.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileDetailRows.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileHeaderPresentation.kt`

### Je passe d'un compte à l'autre sans retaper mon mot de passe, et chaque compte garde ses données

`profile-account-switcher` · Android : **partielle** · P1 · effort L

iOS : « Changer de compte » (feuille medium/large) liste les comptes mémorisés (`SavedAccountRow` : avatar 44, nom, @pseudo, état « Compte actuel » avec coche / « Connecté » / chevron pour un compte déconnecté) ; un compte dont la session est GARDÉE s'ouvre sans mot de passe (`switchAccount`), un compte déconnecté ou à ajouter mène à l'écran de connexion avec une intention en mémoire (`LoginAccountHandoff` : addAccount / account(id)) et le compte actuel reste gardé (`suspendActiveSession`). `AccountDataRetention` borne ce que l'appareil garde en local : la base de messages et le cache d'un compte quitté restent pour y revenir sans tout recharger, limités aux comptes du sélecteur + le compte actif ; les orphelins sont effacés au démarrage ; un compte quitté n'est conservé que si sa session l'est (la déconnexion, la session révoquée et le retrait effacent ses jetons avant).

Écarts :
- Android ne mémorise que des métadonnées d'affichage (jamais de jeton) : toucher un compte du sélecteur de connexion ne fait que préremplir le pseudo et exiger le mot de passe. Il faut des sessions GARDÉES par compte (jetons dans Keystore/EncryptedSharedPreferences, par userId) et `switchAccount(id)` sans mot de passe.
- Feuille « Changer de compte » accessible depuis les réglages/profil : rangées avec états `current` / `signedIn` / `signedOut`, bouton « Ajouter un compte », haptique légère, sélection désactivée sur le compte actuel.
- `suspendActiveSession` : quitter le compte courant sans effacer ses jetons ni ses données pour aller vers la connexion ; intention de passage (addAccount / account(id)) conservée en mémoire vive et consommée une seule fois.
- Isolation des données locales par compte (Room/DataStore par userId + origine serveur) et règle de rétention `AccountDataRetention.retainedKeys` (comptes du sélecteur + actif) avec purge des orphelins au démarrage ; `keepsData(leaving, arriving, isPreserved)` : rien n'est quitté au démarrage à froid, pas de lecture bloquante du stockage sécurisé sur le fil principal.
- Déconnexion / session révoquée / retrait d'un compte : effacer les jetons AVANT de le quitter, donc ses données avec eux.
- Aucune action de purge/migration de données de production sans feu vert du porteur : prévoir un drapeau d'activation et une migration rétrocompatible.

Rendu : Rangée hauteur min 60 dp, rayon md, fond inputBackground, bordure inputBorder 30 %, libellé d'état caption semibold indigo500 avec coche pour le compte actuel, chevron textMuted 50 % pour un compte déconnecté ; bouton « Ajouter un compte » (+) indigo500 hauteur 52 dp.

Transposition Android : Keychain → Android Keystore + `EncryptedSharedPreferences` ; base GRDB par compte → base Room par compte (nom de fichier = userId + origine) ; `AuthManager.switchAccount` → `SessionRepository` multi-session ; feuille → `ModalBottomSheet`.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AccountSwitcherSheet.swift`
- `apps/ios/Meeshy/Core/AccountDataRetention.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SavedAccounts.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`

### La bannière et la photo du profil s'affichent avec leurs signes (anneau de story, humeur, présence, niveau) et s'ouvrent en plein écran

`profile-banner-avatar-fullscreen` · Android : **partielle** · P1 · effort M

iOS : la bannière peint la photo (CachedAsyncImage, échec silencieux) ou, à défaut, la bannière de design équipée, ou un dégradé d'accent avec deux orbes décoratifs ; un cadre de bannière équipé se superpose sans capter le doigt. Toucher la bannière ou l'avatar ouvre `FullscreenImageView` (présentée par-dessus la feuille) — seulement s'il y a une image à montrer. L'avatar porte l'anneau de story réel (tap = ouvrir la story), l'humeur (tap = bulle d'humeur), la pastille de présence temps réel (`presenceProvider`, repli sur le snapshot REST) et le contour équipé. L'app branche sur la bannière le niveau et le rang du joueur (`ProfileGameSection`, coin bas début / bas fin, traversé par le doigt). Un profil qui m'a bloqué est neutralisé (gris, sans décor ni présence). Libellés VoiceOver partagés `ProfileImageCopy`.

Écarts :
- La bannière n'est JAMAIS affichée sur Android (seul le bouton « Changer la photo de couverture » existe en édition) : peindre la bannière (Coil, 130 dp) avec repli dégradé d'accent + deux orbes décoratifs (200 dp / 150 dp, opacités light/subtle) et masquer l'orbe aux lecteurs d'écran.
- Plein écran au toucher de la bannière et de l'avatar via `MeeshyImageViewer` (déjà dans sdk-ui) — uniquement quand une URL existe ; libellés « Bannière de profil » et « Ouvre la photo en plein écran », action d'accessibilité équivalente au tap.
- Anneau de story réel sur l'avatar du profil (`MeeshyAvatar(storyRing=…)` existe) : lire l'état des stories de la personne, tap = ouvrir le viewer de story ; jamais d'anneau si bloqué ou bloqué par la cible.
- Humeur sur l'avatar du profil (et de la barre compacte) avec tap vers la bulle d'humeur ; chaîne vide = pas d'humeur ; masquée si la cible m'a bloqué.
- Présence : source temps réel injectée (même source que la liste de conversations), repli sur le snapshot `isOnline`/`lastActiveAt` ; ligne « @pseudo · il y a X » dont la couleur suit l'état (vert actif, orange absent, gris au-delà) ; aucune pastille hors ligne.
- Emplacement `ProfileGameSection` (niveau + rang du joueur sur la bannière, lecture seule du doigt) à brancher quand le module jeu existera ; prévoir le slot opaque dès maintenant.
- Contour d'avatar, bannière de design et cadre de bannière équipés (voir profile-decor-equip) : prévoir le point d'insertion et la règle « la photo gagne toujours sur le design ».
- Cas bloqué par la cible : bannière/avatar grisés (`blockedNeutralHex`), décor et présence retirés.

Rendu : Bannière 130 dp, coins droits en en-tête, avatar chevauchant le bas de la bannière (remontée de 40 dp), nom en titre3 arrondi bold, @pseudo 14 sp medium couleur d'accent. Orbes décoratifs : cercles accent opacité light/subtle décalés (-80,-30) et (100,20). Niveau/rang aux angles bas avec rayon suivant l'arrondi.

Transposition Android : `FullscreenImageView` → `MeeshyImageViewer` en `Dialog` plein écran ; `CachedAsyncImage` → Coil avec cache disque ; `bounceOnAppear` → animation d'entrée spring sur l'avatar.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileGameSection.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileImageCopy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileHeaderPresentation.kt`

### Mes uploads en cours, mes échecs de publication et mes brouillons ne se perdent jamais et se reprennent en un geste

`profile-mystories-queue-drafts` · Android : **partielle** · P1 · effort M

iOS : onglet File = uploads actifs (`ActiveUploadRow` : progression, Réessayer, Annuler) + échecs de publication (`FailedStoryRow` « Story non publiée », temps relatif, Réessayer, menu contextuel Reprendre / Supprimer, action VoiceOver). « Reprendre » convertit l'échec en brouillon éditable (médias copiés, persistance VÉRIFIÉE avant retrait de l'item) puis route vers le compositeur par le chemin différé des brouillons ; « Réessayer » relance ; « Abandonner » retire aussi le placeholder optimiste du plateau. Onglet Brouillons : cartes de brouillons (titre, couverture), Publier directement, Modifier, Supprimer avec confirmation, Programmer si la capacité existe. Le badge du plateau n'est qu'informatif : ce panneau est la SEULE surface d'action sur les échecs.

Écarts :
- Android projette déjà les publications épuisées de l'outbox (`StoryPublishFailures`, bande d'échecs du plateau avec retry/discard) ; il manque l'onglet « File » de « Mes stories » avec uploads actifs (progression, annuler) et échecs.
- « Reprendre » : convertir un échec en brouillon éditable (copie des médias, persistance vérifiée avant retrait de la ligne d'outbox) puis rouvrir le compositeur ; aujourd'hui Android n'offre que retry/discard.
- Plusieurs brouillons : Android n'a qu'un brouillon de compositeur (`StoryComposerDraft` + autosave) ; créer un magasin multi-brouillons (liste, résumé titre/couverture/date) et l'onglet Brouillons avec Publier / Modifier / Supprimer (confirmation).
- Abandon d'un échec = retirer aussi le placeholder optimiste (`pending_<uuid>`) du plateau pour ne pas laisser de ligne morte.
- Libellés : « Story non publiée », « Réessayer », « Reprendre », temps relatif ; textes d'état vide « Rien en file » / « Aucun brouillon » avec sous-titres.
- Verrou « une seule reprise à la fois » pendant la copie des médias.
- Programmation (`schedule`) conditionnée par une capacité, absente par défaut.

Rendu : Rangées avec progression linéaire accent, icône d'avertissement rouge sur l'échec, boutons texte compacts ; en-tête de section « Échecs de publication » ; cartes de brouillon identiques aux cartes publiées avec glyphe Publier.

Transposition Android : `StoryPublishQueue` → outbox Room + WorkManager existants ; brouillons → Room (`StoryDraftEntity`) + fichiers privés de l'app ; Réessayer → relance de la ligne d'outbox.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MyStoriesQueueRows.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
- `apps/ios/Meeshy/Features/Main/Views/MyStoryCardPresentation.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`

### Je change ma photo et ma bannière : je choisis, je recadre, l'image est compressée et envoyée

`profile-own-avatar-banner-upload` · Android : **partielle** · P1 · effort M

iOS : en édition, un crayon sur l'avatar et un bouton « Modifier » sur la bannière ouvrent `PhotosPicker` ; l'image choisie passe par `MeeshyImageEditorView` en contexte `.avatar` (cadre circulaire) ou `.banner` (cadre large) en plein écran ; à l'acceptation, compression hors thread principal (≤ 500 Ko avatar, ≤ 800 Ko bannière, `ImageCompressor`), upload (`UserService.uploadImage`) puis `updateAvatar` / `updateBanner` ; voile sombre + `ProgressView` sur l'image pendant l'envoi ; toasts « Photo mise à jour / Bannière mise à jour » ou erreur, haptiques succès/erreur ; fusion du résultat sans perdre voicePublic/décor. Hors édition, toucher l'avatar ou la bannière les ouvre en plein écran (haptique légère).

Écarts :
- Aucun éditeur de recadrage : Android envoie l'image choisie telle quelle. Créer un éditeur plein écran (recadrage circulaire pour l'avatar, ratio large pour la bannière, pincer/déplacer) avec Annuler / Valider.
- Compression côté client à 500 Ko (avatar) et 800 Ko (bannière) hors thread principal ; Android REJETTE aujourd'hui les images trop volumineuses (`TOO_LARGE`) au lieu de les compresser.
- Pas de plein écran au toucher de l'avatar/bannière hors édition (voir profile-banner-avatar-fullscreen) ; en édition, le toucher choisit une photo.
- Voile sombre 40 % + indicateur sur l'image pendant l'envoi (Android a un voile sur l'avatar mais pas sur la bannière, qui n'est pas affichée).
- Toasts de succès « Photo de profil mise à jour » / « Bannière mise à jour » (Android n'affiche que les erreurs) et haptique succès/erreur.
- Fusionner la réponse sans perdre `voicePublic` / `profileDecor`.

Rendu : Crayon `pencil.circle.fill` xxxl accent sur fond textPrimary 10 %, décalé de (4,4) ; bouton bannière capsule noire 50 % texte blanc footnote semibold en bas à droite ; voile noir 40 % + spinner blanc.

Transposition Android : `PhotosPicker` → Photo Picker `PickVisualMedia` (déjà utilisé) ; `MeeshyImageEditorView` → éditeur Compose de recadrage (nouveau composant sdk-ui réutilisable par stories/posts) ; `ImageCompressor` → `Bitmap.compress` JPEG itératif sur `Dispatchers.Default`.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/AvatarBannerUploadViewModel.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ImageUpload.kt`

### Ma page de profil montre ma bannière, mon identité, mon contact vérifié, mes langues, mes statistiques et mes demandes d'amis

`profile-own-page` · Android : **partielle** · P1 · effort M

iOS : `ProfileView` (poussée dans la pile) sous un `CollapsibleHeader` titré « Profil » (retour, bouton Modifier/Enregistrer à droite, spinner pendant enregistrement/upload). Cache d'abord (stats en cache, nombre de demandes en attente), squelette `SkeletonProfileHeader` seulement si aucun utilisateur n'est encore en mémoire, puis relecture du profil et des stats dès l'ouverture sans jamais retirer l'affiché. Sections : bannière 120 pt (coins lg) avec niveau/rang du joueur aux angles, avatar 90 pt chevauchant, nom + @pseudo ; Identité (prénom, nom, @pseudo, nom affiché, bio) ; Contact (e-mail et téléphone avec drapeau du pays et badge Vérifié / Non vérifié) ; Langues (principale, régionale, personnalisée) ; Statistiques (3 cartes messages / conversations / demandes → ouvre l'écran Statistiques ; entrée Progression ; entrée Décor) ; Demandes d'amis (ligne avec badge de compte → liste des demandes) ; Membre depuis.

Écarts :
- La même page `ProfileScreen` sert soi et les tiers ; iOS sépare nettement : créer la mise en page « ma page » en sections (en-têtes icône + titre colorés, fond verre) au lieu d'une colonne centrée de textes.
- Ajouter la bannière 120 dp (coins lg) avec le slot niveau/rang, l'avatar 90 dp chevauchant (anneau de fond 4 dp), nom + @pseudo.
- Section Contact : e-mail et téléphone (drapeau du pays), badge « Vérifié » / « Non vérifié » selon `emailVerifiedAt` / `phoneVerifiedAt` ; aujourd'hui seul AccountContactScreen (réglages) le montre.
- Section Langues avec lignes sélecteur (titre, sous-titre, valeur ou « Choisir » / « Aucune ») ouvrant un sélecteur de langue en feuille.
- Section Statistiques : trois cartes (messages, conversations, demandes) touchables ouvrant l'écran Statistiques ; entrées « Progression » et « Contour et bannière ».
- Section Demandes d'amis avec pastille du nombre de demandes en attente (cercle indigo500) → liste des demandes ; section « Membre depuis ».
- Squelette d'en-tête de profil au démarrage à froid (aucun utilisateur en mémoire) et rafraîchissement silencieux du profil + stats à l'ouverture (cache frais compris).
- En-tête repliable titré (retour ; Modifier ↔ Enregistrer ; spinner pendant sauvegarde/upload) ; retour en mode édition = annuler l'édition et recharger les champs.
- Toast d'erreur en capsule rouge en bas, disparaissant après 3 s.

Rendu : Sections espacées xxl, padding horizontal lg ; icône + titre de section xsPlus ; couleurs de section : purple500 (accent page), error (langues), indigo300 (contact/stats), brandPrimary (demandes), indigo600 (membre depuis). Cartes de stats : valeur arrondie bold, libellé footnote textMuted.

Transposition Android : `CollapsibleHeader` → `LargeTopAppBar` avec `scrollBehavior` ; `PhotosPicker` → `PickVisualMedia` ; `router.push(.peopleDiscovery(.requests))` → route Contacts onglet demandes.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileViewModel.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileDetailRows.kt`

### L'onglet Postes montre les publications de la personne instantanément, avec pagination fluide et fin de contenu

`profile-posts-tab-list` · Android : **partielle** · P1 · effort M

iOS : `ProfileUserPostsList` se glisse dans le défilement unique de la fiche (jamais de ScrollView imbriqué, pas de pull-to-refresh). Cache d'abord (fresh/stale/expired/empty, squelette `SkeletonFeedList` seulement à cache vide), puis réseau ; fenêtre de rendu bornée qui grandit par préchargement anticipé (déclenché à ≤ 3 cartes de la fin, coalescé) avant de demander la page réseau suivante ; pied de liste « Vous avez tout vu » + « Premier contenu publié le … » ; états vides (aucune publication / aucun réel / aucun poste) avec sous-titres ; échec de page → toast. Cartes de post (`FeedPostCard`) et de réel (`ReelFeedCard`), feuille de commentaires hissée au niveau de la liste, feuille de partage, visite de profil émise en télémétrie, liens sortants suivis.

Écarts :
- `UserPostsScreen` est une page séparée « Publications » (ligne cliquable du profil) en lecture seule : l'intégrer comme onglet Postes de la fiche, dans le même défilement.
- Pas de cache : le VM est « cache-less for now » (squelette à chaque ouverture) → store Room des posts par auteur avec SWR (servir le périmé, rafraîchir en silence) ; pull-to-refresh retiré dans l'onglet comme iOS.
- Fenêtre de rendu bornée + préchargement anticipé coalescé (≤ 3 cartes de la fin) distinct de la pagination réseau ; remise à zéro de la fenêtre au changement de filtre.
- Pied de liste « Vous avez tout vu » avec date du premier contenu publié, états vides spécifiques (Aucune publication / Aucun réel / Aucun poste + sous-titre) et toast d'erreur de chargement.
- Rendu des cartes : Android affiche une carte simplifiée (avatar, texte, première image, repost) alors qu'iOS réutilise les cartes du feed (médias, audio, traductions, drapeaux de langue) et des cartes de réel dédiées ; réutiliser les composants du feed.
- Feuille de commentaires hissée au niveau liste et feuille de partage (lien partageable) ; ouverture d'un réel vers le lecteur immersif.
- Télémétrie : émettre la visite de profil (`DiscoveryTelemetry.profileVisit`) et suivre les liens sortants (surface profil).

Rendu : Cartes espacées md, padding horizontal md pour les réels ; padding haut sm, bas xxl ; pied de liste centré textMuted. Pas de spinner si le cache a des données.

Transposition Android : `LazyVStack` imbriqué → éléments `LazyColumn` du même défilement ; `SkeletonFeedList` → squelette feed existant (`UserPostsSkeleton`) ; `ShareSheet` → `Intent.ACTION_SEND` chooser.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+PostsTab.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsViewModel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostPageListState.kt`

### Mes préférences (sept catégories) et mes consentements suivent mes appareils, même modifiées hors ligne

`profile-preferences-sync` · Android : **partielle** · P1 · effort L

SDK iOS : `UserPreferencesManager` tient sept catégories (privacy, audio, message, notification, video, document, application) en local d'abord (persistance immédiate, valeurs `@Published`), avec synchronisation différée (débounce 1 s) via l'outbox (`PATCH /me/preferences/:cat`, `X-Client-Mutation-Id`, repli sur PATCH direct). Garde « une catégorie avec modification locale en attente n'est jamais écrasée par le serveur » (`pendingCategories`, persistée), rejouée à la reconnexion/au retour au premier plan et à la reconnexion socket ; diffusion `user:preferences-updated` regroupée par catégorie ; `fetchFromBackend` à la connexion ; l'offset UTC de l'appareil est ré-estampillé à chaque écriture de notifications (fenêtre Ne pas déranger) ; extras inconnus conservés (`mergeExtras`) ; `resetSession` purge le disque à la déconnexion. Consentements confirmés par la passerelle (`PUT/GET /me/consents/{purpose}`, lignée voice-profile → voice-cloning) et `grantVoiceAutoTranslationConsent` en un geste : consentement PUIS fonctions audio.

Écarts :
- Seules 2 catégories sur 7 (notification, privacy) ont un store local + synchro outbox + hydratation sur `user:preferences-updated` ; ajouter audio, message, video, document, application (modèles présents dans `Preferences.kt`, mais ni stores, ni endpoints PATCH/GET ni outbox).
- Un seul gestionnaire agrégé (équivalent `UserPreferencesManager`) avec mises à jour typées « local d'abord » et débounce 1 s par catégorie ; persistance des catégories en attente pour les rejouer au prochain démarrage (cas du processus tué avant le débounce).
- Consentements : `PUT /me/consents/{purpose}` et `GET /me/consents` (ConsentPurpose, lignée), `voiceConsentGranted`/`voiceCloningConsentGranted`, `grantVoiceAutoTranslationConsent` (consentement d'abord, fonctions audio ensuite ; un octroi refusé ne modifie rien localement).
- Ré-estampiller `dndUtcOffsetMinutes` (offset UTC de l'appareil) à chaque écriture de la catégorie notifications (voyage, changement d'heure).
- Conserver les clés inconnues du serveur à la fusion (`collectLocalExtras` / `mergeExtras`) pour ne pas perdre les champs d'une version plus récente.
- `resetSession` à la déconnexion : purger valeurs, drapeaux d'attente et clés disque sans casser les observateurs process-lifetime.
- Rejeu des catégories en attente à la bascule « authentifié », au retour au premier plan et à la reconnexion socket.

Rendu : Aucun visuel propre ; les écrans de réglages lisent les StateFlow et reflètent immédiatement les bascules (retour instantané).

Transposition Android : `UserDefaults` → `DataStore Preferences`/Room ; `@Published` → `StateFlow` ; foreground → `ProcessLifecycleOwner` ; outbox → Room + `OutboxFlushWorker` (existants) ; socket → `PreferencesSocketManager` (existant).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/preferences/PreferencesSyncCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesSyncRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesSyncRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesStore.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PreferencesApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### On signale un profil en deux touches avec un motif parmi huit

`profile-report-user` · Android : **partielle** · P1 · effort S

iOS : « Signaler » (couleur warning) ouvre une boîte de confirmation titrée « Signaler » listant huit motifs destructifs — Spam, Contenu inapproprié, Harcèlement, Violence, Discours haineux, Faux profil, Usurpation d'identité, Autre — plus Annuler ; le choix envoie immédiatement `ReportService.reportUser(userId, reportType, reason: nil)` avec haptique medium et toast « Signalement envoyé » / « Impossible d'envoyer le signalement ».

Écarts :
- Le signalement existe mais via un écran dédié (icône drapeau de la barre d'application) avec 5 motifs + détails facultatifs ; iOS propose 8 motifs en un seul geste. Ajouter `FAKE_PROFILE` (`fake_profile`) à `ReportReason` et inclure violence + discours haineux dans la liste « utilisateur ».
- Proposer le même raccourci iso : bouton « Signaler » dans la section Actions du profil ouvrant une boîte/feuille de choix des 8 motifs et envoyant au premier toucher (garder l'écran avec détails comme voie « Plus de détails »).
- Toasts « Signalement envoyé » / « Impossible d'envoyer le signalement » et haptique medium.
- Masquer l'action sur son propre profil.

Rendu : Liste verticale de 8 motifs en rouge destructif + bouton Annuler ; titre « Signaler » en mode visible.

Transposition Android : `confirmationDialog` → `AlertDialog` / `ModalBottomSheet` de choix avec rôle destructif (couleur error).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ReportUserScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ReportUserViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/report/ReportReason.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/report/ReportRepository.kt`

### L'écran Statistiques montre mes chiffres, mon activité sur 30 jours et mes badges

`profile-stats-screen` · Android : **partielle** · P1 · effort M

iOS : `UserStatsView` (pile iPhone, panneau iPad ou feuille) sous `CollapsibleHeaderPage` « Statistiques ». Grille de six cartes 2×3 (Messages, Conversations, Traductions, Langues, Membre en jours, Demandes) avec puce d'icône 36 pt teintée ; section « ACTIVITÉ » : graphique `StatsTimelineChart` (ligne Catmull-Rom + aire dégradée, 30 jours, axes automatiques ~6 repères X / 4 repères Y, grille discrète, résumé VoiceOver des données) ; section « BADGES » : grille de 3 colonnes d'`AchievementBadgeView`. Cache d'abord (stats puis timeline), rafraîchissement silencieux, bandeau d'erreur rouge sans retirer l'affiché. `StatsService` : `fetchStats` (`/users/me/stats`), `fetchTimeline(days:30)`, `fetchAchievements`.

Écarts :
- Pas d'écran dédié : les statistiques sont une section de `ProfileScreen`. Créer l'écran Statistiques ouvert depuis les cartes de ma page de profil, avec en-tête repliable « Statistiques ».
- Cartes : grille 2×3 de cartes verre (puce d'icône 36 dp, valeur arrondie bold colorée, libellé footnote) ; la liste de tuiles actuelle diffère de disposition et de couleurs (brandPrimary, indigo300, indigo600, tileBlue, tileSaffron, rose E91E63).
- Graphique d'activité : Android dessine des barres/sparkline `ActivitySparkline` ; iOS trace une ligne lissée (Catmull-Rom) avec aire dégradée, axes et grille ; porter un vrai graphique ligne + aire avec résumé d'accessibilité « Graphique d'activité sur 30 jours » + valeur par point (« N messages »).
- Badges : grille 3 colonnes de pastilles (`AchievementBadgeView` : icône, couleur, progression) au lieu d'une liste « nom — pourcentage » ; titre de section « BADGES » avec icône trophée warning.
- Sections « ACTIVITÉ » (icône courbe, couleur info, interlettrage 1,2) et « BADGES » avec en-têtes d'accessibilité.
- Cache d'abord de la timeline et des stats puis rafraîchissement ; bandeau d'erreur rouge (icône + texte) sans effacer ce qui est affiché.
- Endpoints : `/users/me/stats` pour soi (Android appelle `users/{id}/stats` même pour soi, route dont le calcul a divergé), `/users/me/stats/achievements` à ajouter au client REST.

Rendu : Cartes rayon md, bordure teintée 1 dp, dégradé de surface teinté ; graphique hauteur 180 dp dans une carte padding mdPlus ; axes en 9 sp textMuted, grille opacité light ; badges en grille 3 colonnes espacement 12.

Transposition Android : Swift Charts (`LineMark`/`AreaMark`) → Canvas Compose (chemin de Bézier lissé + remplissage dégradé) ou bibliothèque de graphiques ; VoiceOver → `semantics { contentDescription; stateDescription }`.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/StatsService.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/StatsTimeline.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/UserStatsPresentation.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/ProfileStatsCacheRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Stats.kt`

### Je vois où en est ma demande de suppression de compte et jusqu'à quand je peux l'annuler

`profile-account-deletion-status` · Android : **partielle** · P2 · effort S

SDK iOS : `AccountService` ouvre la demande avec la phrase de confirmation ET le mot de passe courant (`POST /me/account/deletion`, rend un message et `tokenExpiresAt`, le lien de confirmation expire) et lit l'état (`GET /me/account/deletion` → `AccountDeletionStatus` : `status` nul = aucune demande, `confirmedAt`, `gracePeriodEndsAt`, `canCancelUntil`). La réponse est un état, jamais une absence de ressource (200). Corrige l'ancienne route sans preuve de présence et le 409 « déjà en cours » qui rendait le compte insupprimable.

Écarts :
- L'ouverture de la demande existe (`POST me/account/deletion` avec mot de passe courant) mais la LECTURE de l'état (`GET me/account/deletion`) n'est pas modélisée : ajouter `AccountDeletionStatus` {status?, confirmedAt?, gracePeriodEndsAt?, canCancelUntil?} et l'appel.
- Afficher dans l'écran de suppression l'état courant (aucune demande / en attente de confirmation / délai de grâce avec date limite d'annulation) et le message « le lien expire le … » via `tokenExpiresAt`.
- Distinguer le 409 « demande déjà en cours » du 409 « autre cause » (déjà traité côté ViewModel, à garder) sans bloquer l'utilisateur.

Rendu : Bloc d'état en tête de l'écran de suppression (carte verre) avec dates localisées ; bouton d'annulation visible tant que `canCancelUntil` n'est pas dépassé.

Transposition Android : Retrofit + kotlinx.serialization ; dates ISO8601 → `Instant`.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/AccountService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AccountDeletionApi.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountDeletionViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountDeletionScreen.kt`

### Le profil d'un tiers résume son ancienneté et son activité en une bande compacte

`profile-compact-stats-band` · Android : **partielle** · P2 · effort S

iOS : section « STATISTIQUES » de l'onglet Détails = une ligne de réglage « Membre depuis » (date longue) puis quatre mini-puces (Messages, Traductions, Langues, Jours) alimentées par les stats lues avec le profil (cache d'abord) ; squelette de 4 blocs shimmer pendant le chargement ; la grille de succès est volontairement absente de la fiche tierce. Chaque puce se lit « valeur libellé » à VoiceOver.

Écarts :
- Android affiche six tuiles + liste de succès (`ProfileStatsSection`) pour tout profil : sur la fiche d'un tiers, passer à la bande compacte (4 puces : messages, traductions, langues, jours) et retirer les succès ; garder le tableau complet pour mon profil / l'écran Statistiques.
- Ligne « Membre depuis » sous forme de ligne de réglage (icône calendrier, valeur à droite) avec date longue localisée (iOS la fige en `fr_FR` : à corriger en suivant la locale).
- Squelette 4 blocs (hauteur 56 dp, rayon smPlus, shimmer) tant que les stats chargent et que le cache est vide.
- Libellé d'accessibilité « valeur libellé » par puce (`mergeDescendants`).

Rendu : Quatre puces égales (poids 1) en ligne, espacement sm, icône sm medium accent, valeur body bold arrondie, libellé caption2 textMuted (min scale 0,7), carte verre rayon lg.

Transposition Android : `SettingsCard`/`SettingsRow` → composants de ligne de réglage partagés ; `.shimmer()` → modificateur shimmer sdk-ui.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+DetailsTab.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/UserStatsPresentation.kt`

### Toucher un post ou un réel du profil l'ouvre dans son détail ou dans le lecteur immersif

`profile-post-opening` · Android : **partielle** · P2 · effort S

iOS : `ProfilePostOpening` envoie l'engagement d'ouverture (`ContentOpenReporter`, origine `profile`) à chaque tap — aucune fenêtre ne tait une réouverture, la vue est comptée par la destination — puis amène le contenu à sa destination. `ProfilePostsOpener.openPost` ferme la feuille de profil puis pousse `postDetail:<id>` à la racine ; `openReel` ferme la feuille puis, après 0,35 s, présente le lecteur de réels avec la liste des réels de la personne comme graine (haptique medium). Sans hôte de réels, le réel retombe sur le détail.

Écarts :
- Android ouvre bien le détail (`Routes.postDetail`) ou les réels (`Routes.reels(seed)`) mais sans graine contenant tous les réels de la personne et sans fermer la feuille de profil avant (comportement à reprendre quand le profil devient une feuille).
- Envoyer l'engagement d'ouverture (origine `profile`) à chaque tap avec `ContentOpenReporter` équivalent (déjà présent dans PostDetail/Reels VMs mais pas dans cette liste).
- Repli : un réel sans hôte de réels s'ouvre dans le détail du post.
- Haptique medium à l'ouverture d'un réel ; délai 0,35 s entre fermeture de la feuille et présentation.

Rendu : Pas de visuel propre ; la transition feuille → destination ne doit pas montrer deux couches superposées.

Transposition Android : `ReelsPresenter.shared` → navigation `Routes.reels(seed=…)` avec liste de graines ; `pushNavigateToRoute` → `NavController.navigate`.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfilePostOpening.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/UserPostsScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

