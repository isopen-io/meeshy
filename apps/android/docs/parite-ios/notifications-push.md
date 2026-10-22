# Parité iOS → Android : `notifications-push`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**32 features iOS** : 12 absentes, 15 partielles, 4 divergentes, 1 complètes sur Android. **25 lots** planifiés (≈14370 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**notifications-push** (couverture Android estimée ≈ 30 %)

Cette partie couvre tout ce qui fait vivre une notification Meeshy sur iOS : le centre de notifications (liste cache-first, 12 filtres à requête serveur, ligne riche avec gestes rapides), la bannière in-app (carte verre avec glissements), le moteur de consommation lu/non-lu avec échos socket, le compteur et la pastille d'icône, le push système (jeton, permission différée, push silencieux avec synchro durable, accusés de réception, préchargement NSE, actions Répondre / Marquer lu / Commenter / Accepter, nettoyage et révocation des bannières livrées), les réglages (7 sections, Ne pas déranger) et quelques satellites (enregistrement auto des médias reçus, stickers reçus, MetricKit, entonnoir social).
Android a le squelette de la liste et de la bannière in-app (cache mémoire, balayage, cadrage de bannière, politique d'affichage, prefs par type, DND complet, révocation FCM, appel entrant en CallStyle), mais le chemin push est largement cassé ou absent : le jeton FCM n'est jamais demandé (seul onNewToken enregistre), il est posté sur une route inexistante côté passerelle (notifications/device-token au lieu de /users/register-device-token), la permission POST_NOTIFICATIONS n'est jamais demandée, il n'y a aucune action de notification, aucun regroupement, aucun accusé de réception, aucun préchargement.
Côté in-app : cache notifications uniquement en mémoire (pas de Room, donc spinner à chaque démarrage à froid), pas d'état erreur ni squelette, 11 filtres purement clients (catégorie Engagements absente, pas de requête types/hideReadTypes), ligne sans avatar distant ni vignette ni pied, aucune consommation par fil (conversation/post/types), pas de registre d'auto-lecture, bannière sans geste, sans badge de type et avec une règle de silence divergente (pushEnabled/DND bloquent la bannière in-app alors qu'iOS ne les applique pas).
Le DND et l'éditeur de types par préférence sont au niveau iOS (voire au-dessus avec la recherche), mais les réglages sont une section noyée dans SettingsScreen et il manque les préférences contactActivityEnabled et gameEnabled.
Plusieurs points exigent une évolution de la passerelle, à rendre rétrocompatible (push FCM data-only haute priorité pour Android, champs ephemeralDeadline / replacesNotificationId déjà portés par le fil). Estimation globale de l'effort restant : environ 11 000 lignes Kotlin, dont l'essentiel en M ; priorité absolue au trio jeton + permission + routage du tap, sans lequel aucune autre fonctionnalité push n'est atteignable.

## Notes transverses

LECTURE RAPIDE. 28 lots, ~15 500 lignes Kotlin de production (le chiffre de l'inventaire, ~11 000, ne comptait ni le socle, ni la config Firebase, ni le contrat réseau, ni les refactors d'extraction). est_kotlin_lines = production seule ; les tests ajoutent ~0,8x. Les chemins absents de l'arbre actuel sont des fichiers à créer.

VAGUES (déduites de depends_on, les lots d'une même vague ne touchent jamais le même fichier).
- V1 (parallèles) : configuration-firebase-native, socle-pipeline-push-et-cycle-de-vie, contrat-reseau-notifications-et-jeton, mesures-performance-et-sorties-app (dépend du socle, donc V2 en pratique).
- V2 : types-et-preferences-notification-complets, cache-notifications-room, jeton-push-enregistre-des-la-connexion, routage-du-tap-notification, permission-notifications-au-bon-moment, pastille-et-compteur-non-lus-unifies.
- V3 : consommation-par-portee, liste-instantanee-et-etats-dessines, rendu-notification-systeme, synchro-push-silencieux-et-accuses-de-reception, reglages-notifications-page-dediee.
- V4 : arrivee-temps-reel-et-resynchronisation, ligne-notification-riche, banniere-regles-et-contenu, nettoyage-bannieres-et-expiration, actions-repondre-et-marquer-lu, precharge-post-et-story-au-push, enregistrement-auto-medias-recus.
- V5 : filtres-serveur-douze-categories, gestes-de-ligne-notification, banniere-carte-verre-et-gestes, actions-notification-contextuelles, entonnoir-notifications-mesure, ajout-sticker-recu.
Chaîne P0 « le push fonctionne » : configuration-firebase-native + contrat-reseau + socle -> jeton-push-enregistre + routage-du-tap + permission + synchro-push-silencieux. Sans configuration-firebase-native RIEN ne peut être livré par FCM.

DÉCOUVERTES NON PRÉSENTES DANS L'INVENTAIRE (mesurées sur l'arbre, à ne pas redécouvrir).
1. Firebase n'est pas configuré dans apps/android : ni plugin com.google.gms.google-services, ni google-services.json (ignoré par .gitignore racine). FirebaseMessaging.getInstance() lèverait une IllegalStateException et FCM ne peut rien livrer à l'appli native (applicationId me.meeshy.android, suffixe .debug). Prérequis opérationnel humain : enregistrer ces deux identifiants dans le projet Firebase meeshy-me (celui de la clé Admin SDK de la passerelle, cf. apps/web/android/RELEASE.md), puis fournir le JSON en secret CI. Le plugin doit rester CONDITIONNEL pour que la CI android.yml reste verte sans le fichier.
2. NotificationApi.unregisterDeviceToken combine @DELETE et @Body : Retrofit refuse cette combinaison au premier appel. Il faut @HTTP(method = DELETE, hasBody = true). Les deux routes sont de surcroît fausses (notifications/device-token au lieu de users/register-device-token). RegisterDeviceTokenRequest porte type=apns par défaut.
3. Le gateway cible deux canaux Android : meeshy_notifications (sonore) et meeshy_notifications_silent (muet, quand soundEnabled est faux). L'appli native ne crée que le premier : un push muet part sur un canal inexistant. Les deux ids sont un contrat avec le gateway (android-push-config.ts) et doivent rester installés. Le tag de bannière côté gateway = threadId (le conversationId BRUT, sans préfixe) sinon notificationId ; le tag client doit s'y aligner pour que remplacement et révocation fonctionnent entre rendu système (legacy) et rendu applicatif.
4. Le contrat de fil porte ephemeralDuration (secondes, en chaîne) + effectFlags, PAS ephemeralDeadline : la NSE iOS compose l'échéance = réception + durée. Android doit faire de même (setTimeoutAfter). Flamme-œil (après lecture) : pas de durée, donc aucun timeout.
5. Les compteurs du push silencieux voyagent sous les clés unreadCount (total) et conversationUnread, en CHAÎNES (leçon iOS : le cast Int échouait toujours).
6. DSA : report_resolved et content_removed (art. 16/17) sont absents du vocabulaire Android ; un type inconnu s'effondre sur systemEnabled, donc l'utilisateur pourrait masquer ces avis légaux. Ils doivent être connus et TOUJOURS livrés.
7. Les préférences Android n'ont pas dndUtcOffsetMinutes : le gateway évalue la fenêtre DND en UTC pour un utilisateur Android hors UTC. iOS estampille l'offset à chaque écriture.
8. DatabaseModule utilise fallbackToDestructiveMigration() (version 16) : tout bump de version VIDE aussi l'outbox (mutations en attente). Le lot cache-notifications-room doit fournir une Migration(16,17) explicite.
9. PushPresentationPolicy supprime le banner dès que la socket est connectée : correct au premier plan, FAUX pour un push data-only reçu en arrière-plan alors que la socket n'est pas encore tombée. Il faut une entrée appInForeground.
10. Le gateway applique déjà au chokepoint les préférences de livraison (muted, badge 0, threadId retiré), et refuse l'inscription d'un jeton hors compte enregistré (authContext.registeredUser) : une session anonyme n'enregistre rien.
11. AuthInterceptor lit TokenStore à CHAQUE requête : pas d'« amorçage du jeton » à porter pour un lancement à froid en arrière-plan (contrairement à APIClient iOS) ; un test de non-régression suffit.
12. AuthRepository.logout() efface le jeton d'accès AVANT sessionTeardown.wipe() : le DELETE du jeton push doit passer avant tokenStore.clear().
13. Hors périmètre trouvé : feature:notifications/NotificationToastHost + NotificationToastViewModel sont du code mort (non montés) avec une politique divergente ; supprimés par banniere-regles-et-contenu.

COMPOSANTS PARTAGÉS (créés par le socle, consommés par plusieurs lots).
- PushPayload (core:model) : décodeur unique des ~25 clés (nombres et booléens en chaînes).
- Multibindings Hilt dans :app (aucun précédent dans le dépôt ; chaque lot ajoute SON module, jamais une édition du dispatcher) : PushObserver (tous les push), AppStartupTask, AppForegroundHook (un seul observer ON_START dans MeeshyApplication), SessionResettable (exécuté par DefaultSessionTeardown). Kotlin : injecter Set<@JvmSuppressWildcards ...>. Étendus par rendu-notification-systeme : PushBannerDecorator, PushDisplayGate, PushActionProvider. PushInteractionBus (Displayed/Opened/Dismissed) créé par routage-du-tap.
- Primitives de cache de cache-notifications-room (patch, replaceAll, setUnreadCount, NotificationScope) : consommées par consommation, arrivée temps réel, nettoyage, révocation ; nul autre lot n'édite NotificationRepository.kt après lui.
- NotificationNavigation.kt (extrait de MeeshyApp.kt par le socle) : MeeshyApp.kt fait 1202 lignes, déjà AU-DELÀ du plafond dur de 1200 ; ajouter à ce fichier est interdit (budget de taille). Tout montage/route de notifications passe par NotificationNavigation.kt. Le lot reglages n'édite MeeshyApp.kt que pour un paramètre.
- Ressources : un fichier strings_<lot>.xml NEUF par lot et par langue (values, values-fr, values-es, values-pt) plutôt que d'éditer strings.xml, pour éviter les conflits de fusion. Idem pour les modules Hilt (jamais SdkModule.kt, déjà 295 lignes, sauf le socle).
- Composants externes au domaine : MeeshyAvatar sans imageUrl (sdk-ui/MeeshyAvatar.kt ne prend que le nom) -> ext:MeeshyAvatar-imageUrl-et-presence ; si aucun autre domaine ne le livre, le lot ligne-notification-riche l'absorbe (~60 lignes, ajout additif d'un paramètre optionnel). feature:notifications n'a pas Coil en dépendance (ajouté par ligne-notification-riche). Shimmer : sdk-ui n'a qu'un MeeshySkeletonBox plat (ajouté par liste-instantanee).

DÉPENDANCES EXTERNES (ext:...).
- Passerelle, rétrocompatible : push FCM message data-only haute priorité pour les jetons Android qui s'annoncent capables (appVersion >= version minimale ou capacité déclarée), les anciens clients gardant notification+data. Sans lui le rendu système en arrière-plan continue de contourner préférences, DND et conversation ouverte ; le client sait déjà lire title/body dans data (chemin des appels).
- Ops : enregistrement Firebase des deux applicationId + secret CI.
- Feed : outbox de commentaires (CommentPublisher), cache de commentaires par post ; Chat : ouverture ancrée sur un messageId (le routage retombe sur l'ouverture de la conversation tant qu'elle n'existe pas) ; Appels : action Rappeler ; Stickers : bibliothèque Mes stickers et messages sticker ; Social events v2 : reporter côté Android.
- Conversations : ConversationListViewModel écoute déjà conversation:unread-updated ; pastille-et-compteur-non-lus-unifies fait la même écoute dans un coordinateur applicatif, à réconcilier côté domaine conversations (le Room reste la source).

DÉCISIONS TRANCHÉES PAR DÉFAUT (iOS = référence ; à confirmer par le porteur si désaccord).
- Réglages : les interrupteurs ne sont plus grisés quand pushEnabled est faux (la bannière in-app obéit aux interrupteurs par type, push coupé ou non ; les appels ne sont gouvernés que par callsEnabled).
- Bannière in-app : seuls les interrupteurs par type et la conversation ouverte la suppriment ; pushEnabled, DND et un post/story à l'écran ne la suppriment plus. Le push système garde pushEnabled + DND.
- Swipe de ligne : on s'aligne sur iOS (révélation côté fin : Supprimer destructif, geste complet = suppression, Lu seulement si non lue) au lieu du bidirectionnel actuel.
- Pastille d'icône : Android n'a pas de setBadgeCount ; le nombre porte la notification de synthèse (setNumber) + point de lanceur ; la préférence Badges coupée met ce nombre à 0 mais le widget garde le vrai total (comme iOS).
- Filtre de catégories : iOS = filtre serveur ; seule la liste « Toutes » est persistée dans Room, les autres portées vivent en mémoire par session.

LOIS TRANSVERSES À VÉRIFIER DANS LES REVUES.
- Prisme : le corps du push et le texte de bannière sont DÉJÀ résolus par le serveur (rang 1->4) ; le client ne retraduit ni ne retombe sur translations.first. Le préchargement stocke les traductions du lecteur ; la citation gravée suit ReaderPrism (descente stricte).
- Garde de confidentialité : un message protégé (notificationLocKey présent : éphémère, vue unique, flouté, chiffré) ne laisse partir AUCUN texte, image, transcription, nom de fichier ni vignette ; la protection se mesure sur tout ce que la charge transporte.
- Présence : un avatar de ligne ou de bannière n'affiche un point que si la présence est servie (loi de visibilité 2026-08-25) ; règle 1/3/5, hors ligne = aucun point.
- Accent : pastille et ligne suivent notificationTypeAccentHex ; couleur d'avatar dérivée de senderId (DynamicColorGenerator) ; jamais de couleur de conversation codée en dur.
- Cache-first : jamais de spinner sur un cache non vide ; squelette seulement à cache vide ; une panne ne ressemble jamais à une boîte vide (ordre chargement, erreur, vide).
- Async : tout collecteur ou listener asynchrone est enveloppé de try/catch (un push qui lève ne doit pas tuer le service ni les autres observateurs).

VÉRIFICATION. Seul gate : CI android.yml (assembleDebug + testDebugUnitTest). Les lots dont l'essentiel est une loi pure dans :core:model (types-et-preferences, et les lois PushPayload, SilentPushBudget, PushReplacement, EphemeralBannerDeadline, NotificationReadScope, UnreadRegistry, NotificationRowPresentation, NotificationQuickAction, NotificationBannerSwipe, ReceivedMediaAutoSavePolicy, ReceivedSticker) se prouvent localement en deux minutes avec ./apps/android/meeshy.sh jvm-check ; le reste (Compose, Hilt, Room, Robolectric) n'est prouvé que par la CI : pousser la logique dans :core:model et garder les écrans minces.

RISQUES. (1) Bump de version Room concurrent avec les autres domaines : un seul lot (cache-notifications-room) touche MeeshyDatabase.kt dans ce domaine, à coordonner avec les autres domaines. (2) Fichiers brûlants hors domaine : ChatViewModel (2248 lignes, ne pas toucher), ConversationRepository.kt, MessageRepository.kt, OutboxFlushWorker.kt (une seule ligne chacun, listée explicitement). (3) Restrictions Android : travail expédié sur API < 31 exige getForegroundInfo ; quotas FCM haute priorité ; Android 12+ interdit les trampolines de notification (PendingIntent.getActivity direct) ; POST_NOTIFICATIONS non rejouable après deux refus (bandeau Réglages) ; OEM qui tuent le process. (4) Ordonnancement : un lot qui édite NotificationRepository.kt, NotificationsViewModel.kt, NotificationBannerViewModel.kt, NotificationNavigation.kt ou AndroidManifest.xml doit respecter la chaîne depends_on indiquée, sinon conflit de fusion.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `actions-repondre-et-marquer-lu` | A | P0 | M | 700 | consommation-par-portee, rendu-notification-systeme, synchro-push-silencieux-et-accuses-de-reception, socle-pipeline-push-et-cycle-de-vie | Répondre ou Marquer comme lu depuis la notification, sans ouvrir l'app et sans jamais perdre le texte |
| `cache-notifications-room` | A | P0 | M | 700 | contrat-reseau-notifications-et-jeton, persist-room-migrations | La liste des notifications s'affiche instantanément après un redémarrage à froid ou hors ligne, grâce à un cache persistant |
| `configuration-firebase-native` | A | P0 | S | 120 | dependances-gradle-scene-medias | Les push FCM arrivent réellement sur l'appli native configurée, et un build sans configuration Firebase reste sain |
| `consommation-par-portee` | A | P0 | M | 650 | contrat-reseau-notifications-et-jeton, cache-notifications-room | Ouvrir une conversation, un post ou une catégorie marque ses notifications lues partout, sans compteur faux |
| `contrat-reseau-notifications-et-jeton` | A | P0 | S | 300 |  | Les requêtes de notifications et de jeton push visent les routes qui existent réellement sur la passerelle |
| `jeton-push-enregistre-des-la-connexion` | A | P0 | M | 550 | configuration-firebase-native, socle-pipeline-push-et-cycle-de-vie, contrat-reseau-notifications-et-jeton, coffre-securise-par-compte, socle-points-d-extension-de-l-app | L'appareil reçoit les notifications dès la connexion, sur le bon jeton, sans doublon, et cesse de les recevoir à la déconnexion |
| `pastille-et-compteur-non-lus-unifies` | A | P0 | M | 500 | socle-pipeline-push-et-cycle-de-vie | La pastille, le widget et la cloche affichent le même nombre de non lus, juste même app fermée |
| `permission-notifications-au-bon-moment-notifications-push` | A | P0 | M | 350 | socle-pipeline-push-et-cycle-de-vie, persist-outbox-registre-senders | La permission de notification est demandée au bon moment, et reportée après le premier message pour un compte tout juste créé |
| `rendu-notification-systeme` | A | P0 | L | 1050 | socle-pipeline-push-et-cycle-de-vie, routage-du-tap-notification, pastille-et-compteur-non-lus-unifies, push-trusted-media-fetch | Une notification système Meeshy s'affiche regroupée par fil, avec avatar, aperçu servi et réglages respectés |
| `routage-du-tap-notification` | A | P0 | M | 450 | socle-pipeline-push-et-cycle-de-vie, racine-ouverture-conversation-par-id, loi-liens-profonds, socle-points-d-extension-de-l-app | Taper une notification ouvre le bon écran (conversation, post, story, réel, profil) et la marque lue, à froid comme à chaud |
| `socle-pipeline-push-et-cycle-de-vie` | A | P0 | M | 750 | preferences-agregat-champs-canoniques, notifications-types-et-metadonnees-completes, socle-points-d-extension-de-l-app | Chaque push entrant est décodé une seule fois et traité par un pipeline extensible, sans changement visible pour l'utilisateur |
| `synchro-push-silencieux-et-accuses-de-reception` | A | P0 | M | 800 | socle-pipeline-push-et-cycle-de-vie, contrat-reseau-notifications-et-jeton, pastille-et-compteur-non-lus-unifies, socle-points-d-extension-de-l-app | Un message reçu app fermée est déjà là, compté, et l'expéditeur voit « reçu » même si le destinataire est hors ligne |
| `arrivee-temps-reel-et-resynchronisation` | A | P1 | M | 500 | socle-pipeline-push-et-cycle-de-vie, cache-notifications-room, pastille-et-compteur-non-lus-unifies, consommation-par-portee, liste-instantanee-et-etats-dessines | Une notification reçue en direct entre une seule fois dans la liste et le compteur, naît lue si on regarde déjà le contenu, et tout se recale seul après une coupure |
| `banniere-carte-verre-et-gestes` | A | P1 | M | 600 | banniere-regles-et-contenu, ligne-notification-riche, reglages-notifications-page-dediee | La bannière in-app est une carte verre soignée qui se ferme d'un glissement vers le haut, s'ouvre en aperçu vers la droite, dure 7 secondes et vibre à l'arrivée |
| `banniere-regles-et-contenu` | A | P1 | M | 600 | notifications-types-et-metadonnees-completes, consommation-par-portee | La bannière in-app dit exactement ce qui s'est passé et s'affiche même push coupé, sauf si on regarde déjà le contenu |
| `filtres-serveur-douze-categories` | A | P1 | M | 450 | contrat-reseau-notifications-et-jeton, notifications-types-et-metadonnees-completes, cache-notifications-room, liste-instantanee-et-etats-dessines, arrivee-temps-reel-et-resynchronisation | Douze filtres colorés qui répondent tout de suite puis se complètent depuis le serveur, sans jamais disparaître ni tronquer la liste |
| `gestes-de-ligne-notification` | A | P1 | M | 450 | consommation-par-portee, filtres-serveur-douze-categories, ligne-notification-riche | Glisser une notification la supprime ou la marque lue, et « Se connecter » / « Écrire » se font en un geste ; tout échec se dit |
| `ligne-notification-riche` | A | P1 | M | 600 | notifications-types-et-metadonnees-completes, liste-instantanee-et-etats-dessines, avatar-unique-et-branchement-social, atomes-d-avatar-loi-humeur-et-non-lus | Chaque ligne de notification dit qui, quoi, quand : avatar, médaillon, extrait, citation, pied et vignette |
| `liste-instantanee-et-etats-dessines` | A | P1 | M | 800 | cache-notifications-room | La liste Notifications s'affiche aussitôt depuis le cache, avec squelette, page d'erreur « Réessayer » et vide dessiné par catégorie |
| `nettoyage-bannieres-et-expiration` | A | P1 | M | 600 | cache-notifications-room, consommation-par-portee, rendu-notification-systeme | Une notification obsolète disparaît d'elle-même : révoquée, remplacée, déjà lue ailleurs ou arrivée à l'heure d'expiration du message éphémère |
| `precharge-post-et-story-au-push` | A | P1 | M | 450 | synchro-push-silencieux-et-accuses-de-reception, comments-engine-core | Taper une notification de commentaire ou de story ouvre le contenu instantanément, sans écran vide, même à froid |
| `reglages-notifications-page-dediee` | A | P1 | M | 600 | notifications-types-et-metadonnees-completes, permission-notifications-au-bon-moment, socle-pipeline-push-et-cycle-de-vie, socle-points-d-extension-de-l-app, settings-hub-iso-layout | Réglages > Notifications : une page dédiée en sept sections, chaque réglage avec son icône colorée, et Ne pas déranger |
| `actions-notification-contextuelles` | A | P2 | L | 950 | routage-du-tap-notification, actions-repondre-et-marquer-lu, comment-send-outbox, calls-external-call-triggers | Commenter, Accepter/Refuser, Ouvrir dans Cartes, Ajouter aux contacts, Rejoindre, Rappeler : le bon geste depuis la notification selon son contenu |
| `enregistrement-auto-medias-recus` | A | P2 | M | 500 | synchro-push-silencieux-et-accuses-de-reception, socle-pipeline-push-et-cycle-de-vie | Les photos et vidéos reçues, même app fermée, rejoignent seules l'album Meeshy (une seule fois, jamais les protégées) |
| `mesures-performance-et-sorties-app` | A | P2 | M | 350 | socle-pipeline-push-et-cycle-de-vie, dependances-gradle-scene-medias | La fluidité, la mémoire et les sorties d'arrière-plan de l'appli sont mesurées pour piloter la performance |

### Lots fusionnés ou retirés par l'architecture

- `types-et-preferences-notification-complets` → `notifications-types-et-metadonnees-completes` (merge-into) : Même vocabulaire complet des types de notification et de leurs interrupteurs. Hérite : contrat-reseau-notifications-et-jeton.
- `entonnoir-notifications-mesure` → `analytics-notification-events` (merge-into) : Même entonnoir reçu / affiché / ouvert / écarté.
- `ajout-sticker-recu` → `received-sticker-sheet` (merge-into) : Même « Ajouter à mes stickers » sur un sticker reçu.

## Features

### La permission de notification est demandée au bon moment, et reportée après le premier message pour un compte tout juste créé

`ntf-push-permission-timing` · Android : **absente** · P0 · effort S

Une session de connexion ou restaurée demande la permission dès l'ouverture, sinon redéclare l'appareil. Une session issue d'une inscription REPORTE la demande (marqueur persisté) jusqu'au premier message envoyé accepté par le serveur, pour que l'alerte système ne tombe pas sur un écran vide. L'onboarding peut garder la fenêtre pour sa carte Langues : on reporte alors aussi. Le report est honoré une seule fois, le marqueur est effacé avant l'attente puis reposé si la fenêtre est gardée. Au démarrage à froid avec session restaurée, le report en attente est respecté.

Écarts :
- La permission POST_NOTIFICATIONS est seulement déclarée au manifeste : aucune demande à l'exécution n'existe dans le code. Sur Android 13+ aucune notification (hors appel plein écran) ne s'affiche jamais. Ajouter la demande via ActivityResultContracts.RequestPermission.
- Politique de moment : connexion ou session restaurée, demande à l'ouverture ; inscription, report jusqu'au premier message envoyé (point d'accroche : succès d'envoi dans ChatViewModel, comme finalizeSuccessfulSend).
- Marqueur persistant (DataStore) auth.signup.deferPushPermissionUntilFirstMessage : isPending, postpone, resolve ; resolve appelé AVANT l'attente de la demande, reposé si l'onboarding garde la fenêtre.
- Porte d'onboarding (équivalent OnboardingPushPermissionGate) : ne jamais demander par-dessus la carte Langues ; relire le marqueur au démarrage à froid.
- État isAuthorized observable (POST_NOTIFICATIONS accordée ET NotificationManagerCompat.areNotificationsEnabled) : exposé aux Réglages pour afficher un bandeau « Notifications désactivées » avec bouton vers ACTION_APP_NOTIFICATION_SETTINGS (Android ne repropose pas après deux refus).
- Avant Android 13 : pas de demande, mais enregistrer quand même le jeton.

Rendu : Dialogue système uniquement. Le bandeau de refus dans les Réglages suit les cartes de la page Réglages (icône cloche, texte secondaire, bouton capsule brand).

Transposition Android : UNUserNotificationCenter.requestAuthorization devient POST_NOTIFICATIONS (API 33+). UserDefaults devient DataStore. L'alerte système unique et non rejouable est la même contrainte sur Android après deux refus.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Auth/Signup/PushPermissionDeferral.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`

### La bannière se ferme d'un glissement vers le haut, s'ouvre en aperçu vers la droite, dure 7 secondes et vibre à l'arrivée

`ntf-banner-swipe-timing-haptics` · Android : **absente** · P1 · effort S

Glisser la bannière vers le haut (déplacement < -30 pt ou projection < -80) la ferme ; la glisser vers la droite (> 36 pt) ouvre un aperçu de la notification ; taper la bannière ouvre la destination et la consomme. La bannière reste 7 secondes, une nouvelle notification remplace la précédente, une haptique légère accompagne l'apparition SI la préférence Vibrations est active. L'arrivée est annulée si la conversation concernée vient d'être ouverte.

Écarts :
- Aucun geste sur la bannière (tap seulement). Ajouter un détecteur de glissement vertical/horizontal avec la fonction pure outcome(translation, predictedEnd) : dismiss si translation < -30 ou prédiction < -80, preview si translation > 36, none sinon ; suivi du doigt avec retour élastique.
- Durée : NotificationBannerViewModel affiche 4 s (iOS 7 s) ; passer à 7 s et annuler le délai précédent à l'arrivée d'une nouvelle bannière.
- Haptique à l'apparition conditionnée par la préférence Vibrations (hapticPlayer injecté).
- Aperçu (glissement vers la droite) : présenter la notification en aperçu (presentPreviewToast / détail) sans la consommer.
- Tap : navigation puis consommation de la notification (markRead) ; aujourd'hui le tap ferme et route seulement vers conversation ou post.
- Retirer la bannière affichée quand l'utilisateur ouvre la conversation ou le post concerné (existe déjà via setActiveContext, à conserver).

Rendu : Entrée par le haut (slide + fade), sortie vers le haut ; la poignée suggère le glissement ; retour élastique si le geste est insuffisant.

Transposition Android : DragGesture devient Modifier.draggable / pointerInput avec velocity tracker ; UIImpactFeedbackGenerator devient HapticFeedbackType.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationToastView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerHost.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerViewModel.kt`

### Répondre ou Marquer comme lu depuis la notification, sans ouvrir l'app, sans jamais perdre le texte

`ntf-push-actions-message` · Android : **absente** · P1 · effort M

Sur une notification de message, de réponse ou de mention, le bouton Répondre ouvre un champ de saisie ; le texte part de façon durable : bulle optimiste insérée localement, ligne d'outbox FIFO puis envoi REST avec clientMessageId (la passerelle déduplique, l'outbox peut rejouer). Après la réponse la conversation est marquée lue partout et les bannières du fil sont retirées. Marquer comme lu fait de même sans envoi. Les actions sont ignorées si la notification vise un autre compte que le compte actif, si le texte est vide, ou s'il n'y a pas d'utilisateur actif. Un vocal ou un message éphémère garde exactement ces deux gestes.

Écarts :
- Aucune action sur les notifications de message : ajouter NotificationCompat.Action avec RemoteInput (Répondre) et Marquer comme lu, via un BroadcastReceiver qui délègue à un travail WorkManager expédié (goAsync ne suffit pas pour un envoi réseau).
- Chemin durable de la réponse : insertion optimiste d'une bulle (équivalent MessageRecord.optimisticText), enqueue d'une ligne outbox sendMessage (conversationId, contenu, langue d'origine = première langue de contenu préférée, replyToId = messageId de la notification), puis envoi REST avec clientMessageId ; en cas d'échec sans ligne outbox, marquer la bulle en échec.
- Amorcer le jeton d'accès depuis le stockage chiffré avant tout appel (lancement à froid en arrière-plan).
- Après la réponse : mark-as-read de la conversation (registre local + serveur + notifications de la cloche), retirer les notifications du fil conversation:<id>, et mettre à jour la notification Android (re-notify) pour arrêter l'indicateur d'envoi.
- Garde destinataire : refuser si recipientId / recipientUserId ne désigne pas le compte actif (plusieurs comptes sur l'appareil).
- Catégories : message, audio, éphémère = Répondre + Marquer lu ; position / contact / invitation = bouton spécifique + Répondre (voir ntf-push-actions-detail-callback).
- Libellés des actions en 4 langues (strings.xml).

Rendu : Libellés « Répondre » (champ de saisie) et « Marquer comme lu » ; pas de .foreground pour ces deux actions (elles ne rouvrent pas l'app). Après envoi, la notification se met à jour au lieu de disparaître sèchement.

Transposition Android : UNTextInputNotificationAction devient RemoteInput ; UNNotificationCategory devient la liste d'actions posée à la construction ; didReceive avec beginBackgroundTask devient BroadcastReceiver + WorkManager expédié.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationDetailCategories.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### L'expéditeur voit son message « reçu » dès que le push arrive chez le destinataire, même hors ligne

`ntf-push-delivery-receipts` · Android : **absente** · P1 · effort S

À chaque push de message (arrière-plan ou premier plan) l'app accuse réception de la conversation auprès du serveur. Si la session n'est pas authentifiée ou si le réseau échoue, l'accusé est mis en file persistante (une seule entrée par conversation, plafond 200, les plus anciennes sautent) puis rejoué à la reprise. Seules les erreurs transitoires (réseau, 5xx, 401, 408, 429) sont rejouées ; un 4xx permanent ou un identifiant de conversation vide ne rentre jamais dans la file.

Écarts :
- Aucune route mark-as-received côté Android (pas de POST /conversations/:id/mark-as-received dans ConversationApi) ni de service d'accusé.
- File persistante (Room ou DataStore) de PendingReceipt {conversationId, messageId, enqueuedAt}, dédupliquée par conversation, plafonnée à 200, ordre FIFO préservé (les échecs repassent en tête).
- ack(conversationId, messageId) : garde conversationId non vide ; non authentifié ou échec réseau, mise en file ; flushPending() purge les lignes corrompues avant de rejouer.
- Classification isRetryable : forbidden = non, 4xx = non sauf 401/408/429, le reste = oui.
- Déclencheurs : réception FCM, push affiché au premier plan, reprise de l'app, connexion (WorkManager OneTimeWork avec contrainte réseau pour le rejeu).

Rendu : Aucun rendu propre ; produit les coches « reçu » côté expéditeur.

Transposition Android : UserDefaults devient Room/DataStore ; reprise de l'app devient ProcessLifecycleOwner ON_START + WorkManager.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushDeliveryReceiptService.swift`

</details>

### Taper une notification ouvre le message ou le post instantanément, sans écran vide, même à froid

`ntf-push-prefetch` · Android : **absente** · P1 · effort M

Quand un push arrive, le message (ou le post, ou la story) est préchargé et rangé en local AVANT le tap : la conversation s'ouvre sur ses données locales, la ligne de liste est repeinte dès le réveil sans réseau, et le post s'ouvre avec le commentaire qui a déclenché la notification déjà présent. Les messages préchargés sont insérés sans doublon, triés et plafonnés (600), les charges illisibles sont écartées, un échec de persistance garde la charge pour un nouvel essai, et le post entre dans le cache comme périmé (peint tout de suite puis revalidé).

Écarts :
- Aucun préchargement au push : dans le handler FCM (ou un travail expédié) récupérer le message par id (et le post par id) et l'écrire dans Room avant d'afficher la notification.
- Messages : upsert idempotent par id dans le cache et dans la table Room des messages, tri par date, plafond 600 ; repeindre la ligne de la liste des conversations (aperçu, date) sans réseau (équivalent peintLesMessagesPrecharges) ; traduire selon le Prisme du lecteur (langues préférées + descente stricte pour la citation gravée).
- Posts : sauver comme périmé (saveAsStale) dans le cache du fil sous l'id du post, ensemencer les commentaires embarqués (dont celui qui a déclenché post_comment / comment_reply) dans les deux chemins de lecture, et mettre la story/statut dans le plateau en mémoire quand expiresAt est présent.
- Échec réseau : afficher la notification quand même (repli sans préchargement) ; ne jamais perdre la charge.
- Sans objet sur Android : dossier App Group, lecture disque hors MainActor, nettoyage App Group au logout, décodage de fichiers corrompus (le handler FCM tourne dans le même processus que l'app).

Rendu : Invisible ; la preuve visuelle est l'absence d'écran vide ou de spinner à l'ouverture depuis une notification.

Transposition Android : Notification Service Extension (mutable-content + staging App Group) devient handler de message FCM data (ou WorkManager expédié) qui écrit directement dans Room, même processus, pas de dossier de staging.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NSEPendingMessageConsumer.swift`
- `apps/ios/Meeshy/Features/Main/Services/NSEPendingPostConsumer.swift`

</details>

### Se connecter ou Écrire en un geste depuis la ligne « contact arrivé » ou « filleul inscrit »

`ntf-center-row-quick-actions` · Android : **absente** · P2 · effort S

Les lignes contact_joined (un contact vient de rejoindre Meeshy) et les badges d'invitation acceptée (axe invite_joined) portent deux boutons capsule sous la ligne : « Se connecter » (primaire, envoie la demande d'ami, devient « Demande envoyée » avec coche et inactif) et « Écrire » (ouvre ou crée la conversation directe). Pour un filleul déjà ami, seul « Écrire » est proposé. Toucher un bouton marque la notification lue ; un échec d'envoi annule l'état « envoyée », joue l'haptique d'erreur et affiche « La demande n'a pas pu partir. Réessaie dans un instant. ».

Écarts :
- Aucun geste de rangée : porter NotificationQuickAction {connect(userId), write(userId)} et la règle quickActions(isFriend) : contact_joined donne [connect, write] ; badge_earned avec metadata.axisKey == invite_joined donne [write] si déjà ami, sinon [write, connect].
- Exécuteur : connect = envoi de demande d'ami (receiverId, sans message) + mise à jour du cache d'amitié local + haptique succès ; write = ouvrir/créer la conversation directe avec l'utilisateur puis naviguer ; erreur = haptique erreur + toast.
- État « Demande envoyée » local à la liste (ensemble des ids demandés), annulé si l'envoi échoue ; bouton inerte une fois envoyé.
- Marquer la notification lue au toucher d'un bouton.
- Boutons capsule hauteur min 44 dp, primaire fond indigo600 texte blanc, secondaire fond indigo500 à opacité light texte indigo300 (sombre) / indigo600 (clair) ; retrait gauche 16+44+12, retrait droit lg, marge basse md ; identifiants de test notification.quick.connect.<id> / notification.quick.write.<id>.
- Chaînes : Se connecter, Demande envoyée, Écrire, message d'échec (4 langues).

Rendu : Capsules en ligne sous le corps, alignées après l'avatar, icône person.badge.plus / checkmark / bubble.left.fill, texte subhead semibold, espacement sm.

Transposition Android : Label + systemImage devient Button capsule avec icône Material ; HapticFeedback devient HapticFeedbackType.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationQuickActionPerformer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`

</details>

### Les photos et vidéos reçues, même app fermée, rejoignent seules l'album « Meeshy » (une seule fois, jamais les protégées)

`ntf-media-autosave-received` · Android : **absente** · P2 · effort M

Avec Réglages ▸ Médias ▸ « Enregistrer dans Photos » actif (défaut oui), toute image ou vidéo reçue (socket, ouverture de conversation, ou push noté puis vidé au premier plan) est enregistrée dans l'album « Meeshy » : une seule fois par pièce (registre persistant de 4000 identifiants), jamais pour mes propres messages, un message chiffré, supprimé, éphémère / vue unique / flouté / flamme-œil (loi de sortie), ni pour les messages antérieurs à l'installation en cours ; la politique réseau des téléchargements s'applique (une vidéo en cellulaire attend le Wi-Fi si demandé). La permission photothèque n'est demandée qu'une fois ; un refus est définitif, un échec libère la pièce pour un nouvel essai ; un média déjà dans l'album n'est pas dupliqué.

Écarts :
- Aucun enregistrement automatique : GalleryImageSaver ne sert qu'à l'enregistrement manuel depuis le visualiseur. Créer ReceivedMediaAutoSaver (politique pure eligibleMedia, registre, écrivain, orchestrateur à l'écoute des messages reçus).
- Politique pure : !isMe, createdAt >= début d'installation, non supprimé, non chiffré, loi de sortie offre .save, pièce image/vidéo non protégée, fileUrl non vide.
- Registre persistant (DataStore) de 4000 ids, claim/release, rognage FIFO.
- Réglage « Enregistrer dans Photos » (clé meeshy.media.autoSaveReceivedToAlbum, défaut true) dans Réglages ▸ Médias.
- Écrivain MediaStore dans Pictures/Meeshy (API 29+ sans permission ; avant, ne pas proposer), déduplication par empreinte du contenu (alias = attachmentId), résultat saved / denied / failed.
- Politique réseau MediaDownloadPolicyEngine (images vs vidéos, Wi-Fi vs cellulaire) réutilisée.
- Instant d'installation : fixé avant la première réception (FirstInstallTime / DataStore) pour que la synchro d'une réinstallation ne rapatrie pas tout l'historique.
- File des pushes (PushedMediaAutoSaveQueue) : notePush(conversationId, messageId?) persisté dans DataStore, jeton « * » pour toute la fenêtre ; drain() au retour au premier plan et à la réception en premier plan, relit les messages du cache et les passe à consider(). Rien ne se télécharge dans la tâche silencieuse (le budget appartient à la synchro).
- Câbler dans ntf-push-silent-sync et dans l'ouverture de conversation.

Rendu : Silencieux ; le réglage est un interrupteur dans Médias, libellé « Enregistrer dans Photos ».

Transposition Android : PhotoLibraryManager / album « Meeshy » devient MediaStore (RELATIVE_PATH Pictures/Meeshy) ; permission Photos devient aucune (scoped storage Q+) ; empreinte de contenu = hash du fichier téléchargé.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ReceivedMediaAutoSaver.swift`
- `apps/ios/Meeshy/Features/Main/Services/PushedMediaAutoSaveQueue.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`

### Les mesures de fluidité, de CPU, de mémoire et de sorties d'arrière-plan sont collectées pour piloter la performance

`ntf-metrics-subscriber` · Android : **absente** · P2 · effort M

L'app s'abonne aux rapports système (MetricKit) : agrégats de signposts suivis (catégories TimelineEngine, ReelSwitch) avec comptes, temps CPU cumulé et taux de hitch ; résumé de charge utile quotidienne (taux de hitch au défilement, CPU, GPU, pic mémoire, démarrage, comptes de sorties d'arrière-plan : normales, anormales, limite mémoire/CPU, pression mémoire, watchdog, fichier verrouillé, expiration de tâche, accès invalide, instruction illégale) ; rétention bornée à 30 résumés ; inscription idempotente.

Écarts :
- Aucun équivalent MetricKit : JankStats (taux de frames lentes par écran), ApplicationExitInfo (raisons de sortie : ANR, mémoire, signal, crash, taux), Debug.MemoryInfo / PSS pour le pic mémoire, temps de démarrage via reportFullyDrawn / ProfileInstaller, AndroidX Tracing pour les sections suivies (timeline, changement de reel).
- Structures PayloadSummary et BackgroundExitCounts à porter, rétention 30, verrouillage de l'état, inscription/désinscription idempotentes.
- Agrégats bornés par catégorie suivie (liste blanche) avec horloge injectée pour tester.
- Exposition pour diagnostic (écran Diagnostics des Réglages déjà présent côté Crash) et envoi optionnel selon la préférence telemetryEnabled.

Rendu : Aucun rendu propre.

Transposition Android : MXMetricManager + MXSignpostMetric devient JankStats + ApplicationExitInfo + androidx.tracing + Android Vitals ; abonnement par app (pas de payload différé quotidien équivalent).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/MeeshyMetricsSubscriber.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/MeeshyMetricsSubscriber+Payload.swift`

</details>

### Commenter un post ou accepter/refuser une demande d'ami directement depuis la notification

`ntf-push-actions-social-friend` · Android : **absente** · P2 · effort M

Sur une notification sociale (commentaire, réponse à un commentaire, commentaire de story, fil de réponse) le bouton Commenter envoie le texte comme commentaire (en réponse au commentaire notifié pour les cinq types de fil), via l'outbox ET une tentative REST avec le même identifiant de mutation. Si ni l'une ni l'autre n'a pu garder le texte, une notification locale prévient « Erreur lors de l'envoi du commentaire ». Sur une demande d'ami, Accepter/Refuser tranche la demande en arrière-plan (identifiant fourni ou résolu via les demandes reçues en attente de l'expéditeur), consomme la notification et retire les bannières du même expéditeur ; en cas d'échec le geste dégrade en navigation vers l'écran des demandes.

Écarts :
- Actions Commenter (RemoteInput) sur post_comment, comment_reply, story_new_comment, story_thread_reply, friend_story_comment, post_like etc. selon la table de catégories ; Accepter/Refuser sur friend_request et contact_request.
- Parent du commentaire : threadedParentCommentId = commentId notifié seulement pour les 5 types de fil (post_comment, comment_reply, story_new_comment, story_thread_reply, friend_story_comment).
- Réservé aux comptes enregistrés (pas anonymes) ; l'auteur est le compte désigné par le JETON et la notification doit s'adresser à lui (clés recipientId / recipientUserId), sinon refus + notification d'échec (équivalent CommentOwnership).
- Envoi durable : enqueueComment dans l'outbox (clientMutationId) ET publication REST immédiate avec le même identifiant ; langue d'origine nulle pour laisser le repli serveur.
- Si ni outbox ni REST n'ont gardé le texte, poster une notification locale d'erreur (feed.comments.send_error) avec son et identifiant unique.
- Demande d'ami : résoudre friendRequestId (charge) sinon liste des demandes reçues pending (limite 50) filtrée par senderId ; appeler respond(accepted) ; consommer la notification ; retirer les bannières (type, senderId) ; sur exception, ouvrir l'écran des demandes.
- Après un commentaire réussi : notification consommée (lue) et fil post:<id> retiré du centre.

Rendu : Boutons texte « Commenter », « Accepter », « Refuser » ; la notification disparaît après succès. Notification d'échec avec le texte système standard.

Transposition Android : Mêmes mécanismes que ntf-push-actions-message : RemoteInput + BroadcastReceiver + WorkManager ; Accepter/Refuser = actions simples sans saisie.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationReplyFailure.swift`

</details>

### La notification d'un message éphémère disparaît à l'heure où le message expire

`ntf-push-ephemeral-expiry` · Android : **absente** · P2 · effort S

Un push dont la charge porte une échéance (ephemeralDeadline, secondes depuis 1970 en nombre ou en chaîne) est retiré du centre de notifications à cette heure : un balayage rejoué à chaque retour au premier plan retire les bannières échues, et une bannière déjà échue n'est pas affichée.

Écarts :
- Lire ephemeralDeadline (Double, Int ou chaîne) dans la charge de données FCM.
- À la construction de la notification : setTimeoutAfter(échéance - maintenant) et ne rien afficher si l'échéance est passée.
- Balayage au retour au premier plan (ProcessLifecycleOwner ON_START) : annuler toutes les notifications actives dont l'échéance est échue (expiredIdentifiers).
- Fonction pure isExpired(userInfo, now) testable, comme l'original.

Rendu : Aucun rendu propre.

Transposition Android : Balayage des bannières livrées devient NotificationCompat.setTimeoutAfter + balayage activeNotifications au retour au premier plan.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/EphemeralBannerDeadline.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`

</details>

### L'entonnoir des notifications est mesuré : reçue, affichée, ouverte, écartée, avec le délai de livraison

`ntf-social-funnel-events` · Android : **absente** · P2 · effort M

Chaque notification (type, identifiant, post parent éventuel) génère des événements sociaux de l'entonnoir : reçue (avec la latence de livraison en ms entre l'envoi serveur et la réception, bornée par l'âge maximal du contrat), affichée au premier plan, ouverte, écartée. L'extension de service les dépose dans une boîte JSON-lines partagée (plafond 256 Ko, écriture atomique) que l'app vide au démarrage et envoie par le reporter ; sans notificationId rien n'est émis.

Écarts :
- Aucun reporter d'événements sociaux v2 ni constructeur d'événement de notification côté Android.
- Porter SocialNotificationEvents.event(action, userInfo, channel=fcm, at) : cible notification(id) + parent post, surface notifications, payload {action, notificationType, channel, deliveryLatencyMs}.
- Latence uniquement pour received, bornée dans [0, maxAge], issue du champ createdAt de la charge.
- Boîte persistante : sur Android le handler FCM et l'app partagent le processus, donc un simple stockage (Room/fichier) suffit ; garder le plafond 256 Ko et le vidage atomique.
- Câbler received (handler FCM), displayed (affichage), opened (tap), dismissed (setDeleteIntent) ; purge au logout.

Rendu : Aucun rendu propre.

Transposition Android : App Group JSONL partagé NSE ↔ app devient un store local unique (même processus) ; channel apns devient fcm.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/SocialNotificationEvents.swift`

</details>

### « Ajouter à mes stickers » sur un sticker reçu, et « Dans mes stickers » quand il y est déjà

`ntf-sticker-add-received` · Android : **absente** · P2 · effort M

Un sticker reçu voyage avec une image PNG jointe : le menu du message et la fiche proposent « Ajouter à mes stickers » seulement s'il y a une image à déposer ET qu'elle n'est pas déjà en bibliothèque (identifiant dérivé received-<id de la pièce>, stable, un second ajout s'arrête avant téléchargement). Un sticker qu'on possède déjà (emoji, gabarit, Mee, ou mon sticker renvoyé) ne se dépose pas mais se met en favori. Le sticker n'entre dans aucune galerie de médias (pas une photo à feuilleter ni une pièce à enregistrer). Un second toucher dans les 0,28 s fait un double toucher (menu) plutôt qu'une ouverture de fiche. Un registre en mémoire des ids déjà rangés (rafraîchi toutes les 30 s et après chaque ajout) permet de répondre sans attendre le disque.

Écarts :
- Pas de bibliothèque « Mes stickers » côté chat Android (StickerCatalog n'existe que pour le composeur de stories).
- Porter la loi pure ReceivedSticker : savable(message) (sticker + première pièce image), isInLibrary(savable, isMine, libraryStickerId, known), offersAdd, isGalleryExcluded.
- Registre ReceivedStickerLedger (ids en mémoire, staleAfter 30 s, refresh forcé après ajout) et geste d'ajout avec haptique légère puis toast d'annonce.
- Exclure les stickers des galeries médias et de l'enregistrement automatique.
- Fenêtre de double toucher 0,28 s entre ouverture de fiche et menu du message.
- Libellés « Ajouter à mes stickers », « Dans mes stickers » en 4 langues.

Rendu : Entrée de menu avec icône d'ajout ; état « Dans mes stickers » grisé avec coche.

Transposition Android : Menu contextuel du message : appui long ; fiche sticker : bottom sheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ReceivedSticker.swift`

</details>

### L'appareil reçoit des notifications push dès la connexion, sur le bon jeton, sans doublon et jusqu'à la déconnexion

`ntf-push-token-registration` · Android : **divergente** · P0 · effort M

Après login (ou restauration de session), l'appareil obtient son jeton push, l'enregistre auprès de la passerelle avec son identité d'installation (identifiant stable, modèle, version, bundle), sans repost du même jeton dans les 5 minutes ni deux requêtes concurrentes, le ré-enregistre à chaque connexion, le désenregistre à la déconnexion et efface tout état local à la fermeture de session. Le jeton est conservé hors UserDefaults (Keychain) avec migration des anciennes clés.

Écarts :
- Aucun appel à FirebaseMessaging.getInstance().token : le jeton n'est enregistré que dans onNewToken (rotation), jamais à la première connexion ni au relancement. Ajouter la récupération explicite après login/restauration (équivalent de reRegisterTokenIfNeeded).
- Route fausse : Android POSTe notifications/device-token, or la passerelle n'expose que POST et DELETE /api/v1/users/register-device-token (services/gateway/src/routes/push-tokens.ts). Corriger NotificationApi (POST + DELETE avec body {token}).
- RegisterDeviceTokenRequest porte type=apns par défaut : envoyer type=fcm et platform=android.
- Identité d'installation absente : ajouter deviceId (UUID généré une fois, stocké chiffré, équivalent de installationIdKey), deviceName (Build.MODEL, 100 car. max), appVersion au format « 1.2.3 (build) » (50 car. max), bundleId (applicationId).
- Idempotence : ne pas reposter le même jeton dans les 300 s (persister lastRegisteredToken et lastRegisteredAt) et garde in-flight contre les appels concurrents (login + onNewToken).
- Ne rien envoyer si la session n'est pas authentifiée ; ré-enregistrer à l'ouverture de session.
- Désenregistrement à la déconnexion : unregisterDeviceToken existe mais n'a aucun appelant. Câbler SessionTeardown : DELETE du jeton, puis effacement du jeton, de lastRegistered* et du payload de tap en attente (resetSession).
- Stockage du jeton dans Android Keystore / EncryptedSharedPreferences, pas dans des préférences en clair.

Rendu : Aucun rendu propre ; tout est silencieux. Journaliser le préfixe du jeton (8 caractères) uniquement.

Transposition Android : Jeton APNs (registerForRemoteNotifications) devient jeton d'enregistrement FCM (FirebaseMessaging.token + onNewToken). Keychain devient Android Keystore / EncryptedSharedPreferences. identifierForVendor devient un UUID d'installation généré une fois. apnsEnvironment sans objet.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushDeviceIdentity.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/PushTokenHandler.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`

### La bannière in-app s'affiche même push coupé ou en Ne pas déranger, sauf si on regarde déjà le contenu

`ntf-banner-display-policy` · Android : **divergente** · P1 · effort S

La bannière in-app a SA règle, plus permissive que celle du push : elle n'obéit qu'aux interrupteurs par type de notification. Le réglage Notifications push, la fenêtre Ne pas déranger et le Focus iOS protègent l'utilisateur ABSENT, pas celui qui est devant l'écran. Une seule exception sans préférence : la conversation ouverte (dans n'importe quelle fenêtre) ne se signale jamais, sa notification naît lue. Un contenu social à l'écran (story, post) ne supprime plus la bannière.

Écarts :
- NotificationToastPolicy.decide bloque la bannière quand pushEnabled est faux ou quand la fenêtre DND est active : c'est la règle du PUSH, pas celle de la bannière in-app. Retirer ces deux tests de la décision de bannière (garder uniquement NotificationTypeToggle.isEnabled) ; le push système, lui, garde pushEnabled + DND (PushPresentationPolicy).
- Exception contenu à l'écran : iOS ne supprime que la conversation ouverte ; Android supprime aussi quand activePostId correspond (ActiveContextMatch avec post) : aligner (une story ouverte reste signalée).
- Fenêtres multiples / tablette : isConversationOpen sur un ensemble de conversations ouvertes (pile avec compteurs), pas une seule activeConversationId.
- Supprimer NotificationToastHost / NotificationToastViewModel (doublon non monté avec sa propre politique).
- Dédoublonnage : fenêtre 2 s déjà portée par ToastDedupWindow, la conserver.

Rendu : Aucun rendu propre.

Transposition Android : Focus filter iOS sans objet pour la bannière in-app ; allowsNotification (push) reste borné par DND et le filtre d'interruption Android.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationToastPolicy.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerViewModel.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationToastViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ActiveContextMatch.kt`

### Douze filtres colorés (Toutes, Non lues, Messages, Réactions, Mentions, Social, Engagements, Contacts, Groupes, Appels, Traductions, Système) qui répondent tout de suite

`ntf-center-category-filters` · Android : **divergente** · P1 · effort M

Une barre horizontale de puces filtre le centre de notifications. Toucher une puce l'allume et redessine la liste immédiatement depuis ce qui est déjà chargé, puis la page serveur de la catégorie arrive sans spinner (requête avec unreadOnly, types et hideReadTypes ; pagination propre à la catégorie). Chaque catégorie a son icône, sa couleur et sa liste de types ; les messages, réactions, mentions et contenus sociaux déjà lus sont considérés comme consommés et disparaissent de la liste.

Écarts :
- Catégorie Engagements absente (11 puces au lieu de 12) : icône trophée, couleur ambre (warning), types achievement_unlocked, streak_milestone, level_up, badge_earned, game_duo_invited, game_duo_accepted, game_league_result, game_season_step, game_mission_window ; Android range achievement / streak / badge dans Système.
- Table des types divergente : story_new_comment, friend_story_comment, story_thread_reply, friend_new_story, friend_new_post, friend_new_mood sont dans UNCATEGORIZED (aucune puce) alors qu'iOS les range dans Social ; commentReaction va dans Réactions ; contact_joined et contact_recently_active dans Contacts ; new_conversation_direct / group dans Groupes ; transcription/voice_clone dans Traductions. Reprendre la table iOS matchingTypes mot pour mot (types legacy compris).
- Filtrage serveur absent : NotificationApi.list n'a ni types ni hideReadTypes ; la sélection est un filtre client sur la page 1 et loadMore est désactivé hors « Toutes » (la liste d'une catégorie reste tronquée). Ajouter les paramètres (types et hideReadTypes en CSV, unreadOnly), le curseur par catégorie et le re-rendu immédiat depuis les lignes déjà chargées puis page serveur sans spinner.
- Règle « consommée à la lecture » (messages, réactions, mentions, social : lue = masquée) absente côté filtre.
- Les puces disparaissent pendant le chargement et sur liste vide (isLoading ou liste vide) : elles doivent rester visibles pour changer de catégorie.
- Puce Non lues : requête unreadOnly=true côté serveur.
- Couleurs de puce : palette tile (blue, coral, amethyst, saffron, teal, cyan), E91E63 pour Appels, indigo500 pour Toutes/Système ; sélection = capsule pleine texte blanc, non sélectionnée = teinte claire de la couleur.
- Libellé et message de liste vide propres à chaque catégorie (voir ntf-center-loading-error-states).

Rendu : Rangée défilante, padding horizontal lg, vertical sm, espacement sm ; puce : icône xxs bold + libellé small semibold, padding horizontal md, vertical xsPlus, forme capsule ; sélectionnée = fond couleur de catégorie + texte blanc ; sinon fond couleur à opacité « light » + texte couleur ; haptique légère au tap.

Transposition Android : ScrollView horizontal + Capsule devient LazyRow de FilterChip (shape capsule, couleurs personnalisées).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationCategory.swift`
- `apps/ios/Meeshy/Features/Notifications/NotificationListViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationFilterCategory.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`

### Squelette pendant le premier chargement, vraie page d'erreur avec Réessayer, et vide dessiné pour chaque catégorie

`ntf-center-loading-error-states` · Android : **divergente** · P1 · effort S

Cache vide : sept lignes-squelette qui brillent (cercle 44 pt + trois barres) à la forme exacte des lignes à venir, jamais un spinner. Panne réseau sans ligne en cache : page « Notifications indisponibles » avec « Vérifiez votre connexion, puis réessayez. » et un bouton capsule « Réessayer » — une panne ne ressemble jamais à une boîte vide (l'ordre est : chargement, puis erreur, puis vide). Vide : grande icône de la catégorie à 40 %, titre propre à chaque catégorie et sous-titre « Vos notifications apparaîtront ici ».

Écarts :
- Chargement : CircularProgressIndicator plein écran à remplacer par 7 lignes-squelette avec shimmer (cercle 44 dp, barre titre largeur variable 112 à 168 dp + barre 30×9 à droite, deux barres de 11 dp dont la seconde plus courte), a11y « Chargement… » sur le tout, défilement désactivé.
- Erreur : aucun écran dédié (Snackbar seulement, puis « Aucune notification »). Ajouter l'état erreur quand le chargement échoue ET qu'il n'y a aucune ligne : icône wifi coupé 40 % en couleur erreur, titre « Notifications indisponibles », sous-titre, bouton capsule « Réessayer » qui relance le chargement initial.
- Vide : deux libellés génériques seulement ; ajouter les 12 messages par catégorie (Aucune notification, Aucune notification non lue, Aucune notification de message, Aucune réaction, Aucune mention, Aucune notification sociale, Aucun engagement, Aucune notification de contact, Aucune notification de groupe, Aucun appel manqué, Aucune traduction, Aucune notification système) + sous-titre « Vos notifications apparaîtront ici », icône de la catégorie à 40 % (taille hero).
- Chaînes à ajouter en 4 langues (values, fr, es, pt) : notifications.loading, error.title, error.subtitle, error.retry, empty.* , unreadCount (« N non lues »), markRead.failed, markAllRead.failed, delete.failed.

Rendu : Squelette : lignes padding lg/md, cercle 44, titre 13 dp de haut (radius sm), heure 30×9, corps 11 dp ; shimmer sur textMuted à opacité light. Erreur : colonne centrée, espacement lg, icône taille hero, titre 16 semibold textPrimary, sous-titre 13 textMuted, bouton capsule brand padding xl/smPlus texte blanc 14 semibold, cible tactile 44. Vide : icône hero couleur de catégorie 40 %, titre callout semibold, sous-titre subheadline textMuted.

Transposition Android : skeletonShimmer devient un modificateur shimmer Compose (déjà présent dans sdk-ui si MeeshySkeleton existe, sinon à créer).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListStates.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListCopy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/notifications/src/main/res/values/strings.xml`

### Un message reçu app fermée est déjà là et compté à l'ouverture, grâce à la synchro du push silencieux

`ntf-push-silent-sync` · Android : **partielle** · P0 · effort M

À la réception d'un push (silencieux ou bannière au premier plan), l'app marque l'activité de message (la ligne de liste avance, sauf pour une réaction), applique les compteurs non lus portés par la charge (total des notifications, non lus de la conversation), synchronise le compteur/badge, accuse réception, force le téléchargement des messages de la conversation en passant le TTL du cache, note la pièce jointe pour l'enregistrement automatique, puis garantit que ce qui vient d'être écrit est durablement sur disque AVANT de rendre le budget d'arrière-plan (flush borné par le budget restant, plafonné à 5 s, marge de 1 s).

Écarts :
- handleMessagePush se contente d'enqueue OutboxFlushWorker : les champs unreadTotal / convUnread / conversationId / messageId de la charge ne sont pas lus ni appliqués au compteur de notifications et au registre non-lu des conversations.
- Pas de synchro des messages au push : lancer un travail WorkManager expédité (setExpedited) qui force ensureMessages(conversationId, force=true) en contournant le TTL, car le budget d'un message FCM est d'environ 10 s.
- Pas de signal messageNotificationReceived(conversationId, messageId) vers la liste des conversations (aperçu et date avancent), avec l'exception des réactions (une réaction porte le messageId du message réagi).
- Durabilité : s'assurer que les écritures Room sont COMMITÉES (withTransaction terminé) avant de terminer le handler/Result du worker ; le débounce de 2 s de GRDBCacheStore n'a pas d'équivalent à reproduire. Borner le tout au budget restant (plafond 5 s, marge 1 s) via une fonction pure flushDeadline(now, remaining).
- Câbler l'accusé de réception de livraison (voir ntf-push-delivery-receipts) et la note d'enregistrement album (voir ntf-media-autosave-received).
- Amorcer le jeton d'accès depuis le stockage chiffré avant tout appel réseau d'un lancement à froid en arrière-plan (sinon 401 silencieux).
- Trace de performance équivalente à perf:ios.notif.silent-push.handled (durée de traitement du push).

Rendu : Aucun rendu. Résultat visible : liste des conversations à jour, pastille juste et conversation ouverte instantanément au tap.

Transposition Android : Push content-available + beginBackgroundTask devient message FCM data haute priorité + WorkManager expédié (ou service de premier plan exempté). SilentPushDurability.flushDeadline devient une borne de temps pure sur la transaction Room ; le débounce de 2 s GRDB n'existe pas sur Room (écriture transactionnelle immédiate), donc seule la garantie « commit avant fin de tâche » est à tenir.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/SilentPushDurability.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### Taper une notification ouvre le bon écran (conversation, post, story, profil, demande d'ami) et la marque lue

`ntf-push-tap-routing` · Android : **partielle** · P0 · effort M

Le tap sur une notification (bannière système, écran verrouillé, démarrage à froid ou à chaud) décode la charge et ouvre la destination qui correspond à son type, d'abord la navigation, ensuite la consommation de la notification (marquée lue partout, compteur recalé). Les fenêtres détachées (iPad) ramènent la fenêtre principale. Le geste Ignorer est observé.

Écarts :
- Le PendingIntent de la notification ne porte que conversationId et LaunchRouter.route ne sait router que call ou chat : un push de commentaire, réaction sur post, story, demande d'ami, mention en post ouvre l'app sans destination.
- Faire porter à l'intent toute la charge (notificationId, type, conversationId, messageId, postId, postType, commentId, parentCommentId, senderId, callId) et la décoder dans un type unique réutilisé par le rendu et les actions.
- Brancher NotificationDestinationResolver (déjà écrit pour la liste in-app : conversation, post, reel, story, profil) comme routeur unique push vers destination, y compris le deep link vers un message (messageId) ou un commentaire (commentId, parentCommentId).
- Consommation du push tapé : navigation d'abord, puis markRead(notificationId) (clé qui couvre aussi security_alert, login_new_device, friend_request sans conversationId ni postId) ; la consommation par fil reste suivie par l'ouverture réelle de l'écran.
- Session anonyme ou non connectée : conserver le payload en attente jusqu'à l'authentification puis router ; l'effacer au logout.
- Tablette / dépliable : si l'activité n'est pas au premier plan, la ramener (équivalent bringPrimaryForwardIfHidden).
- Action Ignorer (setDeleteIntent) pour l'entonnoir social et pour retirer le fil si besoin.

Rendu : Aucun écran propre ; transition de navigation standard, aucune étape intermédiaire.

Transposition Android : UNNotificationDefaultActionIdentifier + pendingNotificationPayload + DeepLinkRouter devient PendingIntent(Activity) avec extras + LaunchRouter / navigation Compose. UNNotificationDismissActionIdentifier devient setDeleteIntent.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### La bannière in-app est une carte verre soignée : avatar avec pastille de type, titre, heure, corps, vignette, poignée

`ntf-banner-card-visual` · Android : **partielle** · P1 · effort M

Une carte de 22 pt de rayon continu, fond du thème légèrement transparent et verre teinté de la couleur d'accent du type, bord dégradé blanc vers accent, double ombre. À gauche l'avatar (ou avatar du groupe quand l'expéditeur n'en a pas) avec une pastille de type 20 pt en bas à droite (dégradé accent + icône blanche). Au centre : titre (une ligne, « Nom dans Groupe » pour les messages) + heure de réception, et une ligne de corps sur 2 lignes précédée d'une case de 30 pt (vignette média/post ou icône de contenu). Une poignée de 4×36 en bas invite au glissement. La bannière est UN seul élément VoiceOver avec action Échap pour fermer.

Écarts :
- MeeshyNotificationToast ne montre qu'avatar (initiales) + 2 lignes de texte : ajouter l'heure de réception, la pastille de type 20 dp (icône du type + dégradé accent, bord de la couleur du fond, décalée 3/3), la case 30 dp (vignette via Coil ou tuile symbole) et la poignée 36×4.
- Avatar : passer l'URL (expéditeur, sinon avatar du groupe si conversation de groupe sans avatar d'expéditeur, nom du groupe comme initiales) et la présence ; couleur d'avatar dérivée de senderId (DynamicColorGenerator).
- Style : rayon 22 dp continu, fond backgroundPrimary opacité 0,82 clair / 0,78 sombre + verre teinté accent 10 % / 16 %, bord 1 dp dégradé (blanc 0,85 → accent 0,30 clair ; blanc 0,28 → accent 0,45 sombre), ombre noire 0,18/0,50 rayon 24 décalée de 14 et ombre accent 0,20/0,30 rayon 6.
- Padding : horizontal mdPlus, haut md, bas lg ; marge extérieure sm ; corps subhead 2 lignes, titre labelSize semibold 1 ligne, heure footnote medium textMuted.
- Accessibilité : un seul nœud (titre, corps) avec rôle bouton, indice « Balayez vers le haut pour fermer » et action de fermeture (semantics dismiss).
- Duplication : NotificationToastHost + NotificationToastViewModel ne sont montés nulle part (seul NotificationBannerHost l'est) — supprimer le doublon mort après migration.

Rendu : Tokens : cornerRadius 22 continu, thumbnailSide 30, pastille type 20, poignée 36×4 couleur textMuted opacité strong, padding externe horizontal sm. Couleur d'accent = accentHex du type de notification. L'heure affichée est celle de réception (style .time).

Transposition Android : adaptiveGlass (Liquid Glass iOS 26) devient MeeshyGlassSurface (flou + teinte) ; ombres SwiftUI deviennent Modifier.shadow (elevation) ; SF Symbols des pastilles deviennent Material Symbols.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationToastView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/SocketNotificationEvent+Toast.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyToast.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerHost.kt`

### Le texte de la bannière dit exactement ce qui s'est passé : « Marie dans Famille », « Position partagée », « 📷 Photo »

`ntf-banner-presentation-content` · Android : **partielle** · P1 · effort M

Un seul constructeur compose l'en-tête, le corps, la vignette et le symbole de contenu. Cadrage conversation (message, réponse, mention, réaction) : « Acteur » ou « Acteur dans Groupe » (nom local du groupe avec renommage et émoji favori) ; cadrage relation (demande/acceptation d'ami, contact arrivé) : titre serveur + phrase d'action sans corps ; cadrage action (social, jeu, système) : titre + sous-titre sans répétition, corps = contenu ou résumé média. Pour les messages : l'aperçu servi par la passerelle (déjà détaillé pour les médias) ; le détail position / carte de visite / invitation / lien dit ce que le texte ne dit pas. Une notification de jeu sans acteur est nommée par sa surface (Ligue, Saison…). Aucune vignette ni détail quand le message est protégé.

Écarts :
- NotificationBannerFraming existe (cadrage conversation / relation / action, nom de groupe local via ConversationBannerName, résumé média, vignette image) mais ne connaît pas le détail de message : positionner location, contact, invitation, lien (NotificationMessageDetail avec libellés « Position partagée », « Invitation »), la vignette vidéo (thumbnailUrl) et l'image d'aperçu de lien.
- Garde de protection : un notificationLocKey présent annule détail et vignette (pas de fuite d'un contenu masqué).
- Titre des notifications de jeu sans acteur (gameSurfaceTitle) à la place de « Quelqu'un » ; fallback « Quelqu'un » localisé.
- Cadrage conversation : classer story_reply legacy, user_mentioned, mention, message_reaction, reaction ; relation : friend_request, contact_request, friend_accepted, contact_accepted, contact_joined ; le reste = action (contact_joined absent côté Android).
- Règle anti-répétition : un titre qui se termine déjà par la phrase d'action (« Marie était sur Meeshy récemment ») ne la reçoit pas deux fois.
- Icône de contenu (STORY, REEL, MOOD/STATUS, POST) ↔ symboles ; résumés média « 📷 Photo / 🎥 Vidéo / 🎵 Audio » seulement si le serveur n'a rien servi.
- Nom de groupe local : ConversationBannerName.composed existe ; vérifier favori d'abord (« ⭐ Nom ») comme les push.
- Préférence Aperçu coupée : ne pas dire le contenu (« Nouvelle notification », déjà géré).

Rendu : Titre en une ligne, corps en deux lignes max ; la case de contenu (30 pt) affiche la vignette sinon le symbole de contenu teinté de l'accent.

Transposition Android : String(localized:) bundle .main devient strings.xml ; les chaînes composées vivent dans la couche feature (core/model n'a pas de ressources), comme aujourd'hui.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationBannerPresentation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/SocketNotificationEvent+Toast.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationBannerPresentation.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationPresentationText.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationAccent.kt`

### La liste Notifications s'affiche instantanément depuis le cache, se rafraîchit en douceur et pagine sans à-coup

`ntf-center-list-cache-first` · Android : **partielle** · P1 · effort M

L'écran Notifications peint tout de suite le cache (frais : aucun réseau ; périmé : aperçu puis rafraîchissement silencieux ; vide : squelette), se rafraîchit au tirer-pour-actualiser, ~0,5 s après l'arrivée d'une nouvelle notification, et pagine par curseur (30 par page, dédoublonné par id) en bas de liste. Le titre se réduit au scroll, « Tout lire » n'apparaît que s'il reste des non lues, et un libellé « N non lues » est affiché sous l'en-tête. Toucher une ligne la marque lue et ouvre sa destination. Le cache survit au redémarrage et au hors-ligne.

Écarts :
- Le cache est uniquement en mémoire (MutableStateFlow dans NotificationRepository) : à chaque démarrage à froid ou hors-ligne la liste est vide puis spinner. Persister dans Room (table notifications, clé « all ») pour un vrai cache-first fresh / stale / expired.
- Page de 20 (PAGE_SIZE) au lieu de 30 ; aucun tri/déduplication contractuel documenté.
- « Tout lire » dépend de la liste chargée (any non lue) et non du compteur serveur ; ajouter le libellé « N non lues » (footnote, couleur brand, sous l'en-tête).
- En-tête : MeeshyTopBar fixe à remplacer par un titre repliable au scroll avec flèche retour brand (indigo500).
- Rafraîchissement débouncé 0,5 s à l'arrivée d'une notification et rechargement du compteur après chaque refresh réussi (l'état de la liste n'est resynchronisé que sur trou de séquence).
- Échec de rafraîchissement : avec lignes en cache, les garder silencieusement ; sans lignes, état d'erreur (voir ntf-center-loading-error-states). Aujourd'hui l'erreur part en Snackbar sans écran dédié.
- Routes absentes de NotificationApi : GET avec types et hideReadTypes, POST conversation/:id/read, POST post/:id/read, POST read-by-types (voir ntf-consumption-scopes).
- Chaque ligne tapée : markRead PUIS navigation (ordre déjà bon), mais sans écho de lecture scopé aux autres surfaces montées.
- Animation de liste easeInOut 0,25 s sur changement d'ids (animateItem), liste sans séparateurs ni insets, fond dégradé du thème.
- Accessibilité : chaque ligne un seul élément VoiceOver/TalkBack.

Rendu : Fond = backgroundGradient du thème (pas de surface unie) ; en-tête titre grand qui se replie, flèche retour couleur indigo500, « Tout lire » à droite (subheadline semibold, couleur brand, haptique légère) ; sous l'en-tête « N non lues » footnote centré ou aligné, couleur brand, padding bas xs ; liste plain sans séparateurs ; pied de liste : spinner centré avec padding quand hasMore.

Transposition Android : List SwiftUI + refreshable devient LazyColumn + PullToRefreshBox ; CollapsibleHeader devient une TopAppBar repliable (LargeTopAppBar / scrollBehavior) ; GRDB devient Room.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Notifications/NotificationListView.swift`
- `apps/ios/Meeshy/Features/Notifications/NotificationListViewModel.swift`
- `apps/ios/Meeshy/Features/Notifications/NotificationFeedProviding.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListModeling.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListCopy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`

### Chaque ligne de notification montre qui, quoi, quand : avatar, pastille, extrait, citation, pied et vignette

`ntf-center-row-rich-layout` · Android : **partielle** · P1 · effort M

Une ligne de notification a une zone de tête (avatar de l'acteur avec présence, ou médaillon d'étape en dégradé pour badges / niveaux / séries, ou médaillon à la signature Meeshy pour les notifications système), un point d'accent non lu de 9 pt en haut à droite et un fond teinté non lu (5 % clair, 7 % sombre), un titre (2 lignes, semibold si non lu), un corps (2 lignes), une citation en italique (1 ligne), un pied (conversation avec icône bulle, contenu post/story/reel avec icône et état expiré en rouge, ou texte simple), la vignette 44 pt du post concerné et l'heure relative courte. La ligne est un seul élément d'accessibilité préfixé « Non lu. ».

Écarts :
- Avatar : MeeshyAvatar ne reçoit que le nom (initiales sur fond d'accent) ; passer l'URL de l'avatar de l'acteur et la présence (point vert/orange/gris selon la règle 1/3/5 min, aucun point pour hors ligne).
- Médaillons : milestone (dégradé accent 0,30 → 0,12 clair, 0,55 → 0,22 sombre, bord 1 pt, icône 24 pt, ombre accent) pour achievement / level_up / streak / badge ; signature (marque Meeshy en trait) pour les notifications sans acteur (sécurité, système, jeu sans acteur) ; l'ensemble est calculé par un NotificationRowPresentation (leading, title, body, quote, footer) à porter.
- Point non lu 9 dp accent en haut à droite de la tête (Android : 8 dp à côté du titre) ; fond non lu = accent 5 % clair / 7 % sombre (Android : 12 % fixe).
- Quote en italique (1 ligne, small, textMuted) et pied (conversation / contenu avec état expiré / texte simple, footnote 11 pt icône) absents.
- Vignette du post 44×44 radius sm avec contour hairline, échec silencieux vers un fond teinté accent (postThumbnailURLString).
- Heure : footnote medium textMuted placée à droite (Android : sous le texte) ; titre labelSize semibold non lu / medium lu (2 lignes) ; corps subhead 2 lignes.
- Accessibilité : fusionner la ligne en un seul élément avec libellé « Non lu. » + titre, corps, citation, pied, heure ; supprimer le point/médaillon du parcours a11y.
- Types récents du catalogue (gameDuoInvited, gameLeagueResult, gameSeasonStep, gameMissionWindow, contactJoined, contactRecentlyActive, levelUp, commentReaction…) : titres et accent à aligner sur MeeshyNotificationType.accentHex.
- Ligne Equatable / clés stables pour éviter les recompositions inutiles.

Rendu : Padding ligne : horizontal lg, vertical md ; tête 44 pt (tapTarget) à gauche avec espacement md ; contenu : titre labelSize, corps subheadSize, citation smallSize italique, pied footnoteSize avec espacement xxs ; vignette 44 pt à droite ; heure footnote medium ; dégradés des médaillons accent 0.30→0.12 (clair) / 0.55→0.22 (sombre) ; ombre accent 6 de rayon décalée de 3 en y.

Transposition Android : SF Symbols des médaillons deviennent des icônes Material Symbols ; SignatureMark devient un vecteur de la marque Meeshy ; CachedAsyncImage devient Coil.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationPresentationText.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationBannerPresentation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationAccent.kt`

### Glisser une notification la supprime ou la marque lue, et tout échec se dit

`ntf-center-swipe-feedback` · Android : **partielle** · P1 · effort S

Le glissement de la ligne vers la gauche révèle deux actions : « Supprimer » (corbeille, destructive ; un glissement complet supprime) et, seulement si la ligne est non lue, « Lu » (enveloppe ouverte, teinte indigo). Les mises à jour sont optimistes (la ligne disparaît ou passe lue immédiatement), annulées en cas d'échec avec un toast : « Impossible de marquer cette notification lue », « Impossible de tout marquer comme lu », « Impossible de supprimer cette notification ». Les puces et « Tout lire » jouent une haptique légère.

Écarts :
- Geste différent : Android glisse dans les deux sens avec fond coloré (droite = lu, gauche = supprimer) ; iOS n'a qu'un balayage côté fin révélant Supprimer (plein balayage = supprimer) puis Lu. Aligner le geste (révéler deux actions côté fin) ou garder le bidirectionnel comme choix explicite de plateforme documenté.
- Échecs silencieux : le dépôt annule déjà en optimiste, mais aucun toast n'informe l'utilisateur (markRead, markAllRead, delete). Ajouter les trois messages (4 langues) et un canal de toast global.
- Haptique légère sur chaque puce, « Tout lire » et les actions de glissement.
- Après suppression optimiste puis échec, réinsérer la ligne à son index d'origine (Android la remet en tête de liste).
- Les actions de balayage portent des libellés a11y : Supprimer, Lu.

Rendu : Bouton Supprimer rouge destructif (trash.fill), bouton Lu teinte indigo500 (envelope.open.fill) ; animation de liste easeInOut 0,25 s à l'ajout/retrait.

Transposition Android : swipeActions(edge: .trailing) devient SwipeToDismissBox avec actions révélées (ou SwipeToReveal d'une bibliothèque) ; UIImpactFeedbackGenerator devient HapticFeedbackType.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift`
- `apps/ios/Meeshy/Features/Notifications/NotificationListViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListCopy.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`

### Ouvrir une conversation, un post ou une catégorie marque lues ses notifications partout, sans compteur faux

`ntf-consumption-scopes` · Android : **partielle** · P1 · effort M

Une notification se consomme par six portées : une notification, une conversation, un post, une liste de types, tout. Chaque consommation applique d'abord l'état lu au cache et à toutes les vues montées (optimiste), décrémente le compteur, appelle le serveur, et annule proprement en cas d'échec. Les échos socket (notification:read, read-bulk, deleted, deleted-bulk, counts) de ce même appareil sont reconnus par un registre d'auto-lecture de 30 s pour ne jamais décrémenter deux fois. Ouvrir une conversation ou un post marque lues ses notifications (au plus une requête par conversation toutes les 5 s, jamais deux en vol) ; la portée « tout » et « types » patchent aussi le cache et republient.

Écarts :
- Portées conversation, post, types : routes absentes (POST /notifications/conversation/:id/read, /notifications/post/:id/read, /notifications/read-by-types avec body {types}) et aucune fonction consume(ref).
- Aucun branchement à l'ouverture d'un écran : onConversationOpened / onConversationMarkedRead / onPostOpened / onPostConsumed / onPostClosed ; la conversation ouverte reste donc avec ses notifications non lues dans la liste et dans le compteur.
- Registre d'auto-lecture (NotificationSelfReadLedger, fenêtre 30 s) absent : l'écho notification:read de notre propre markAsRead est aujourd'hui neutralisé par un test 'déjà lu', mais pas le cas d'une lecture auto à l'arrivée ni la consommation par portée.
- Portées socket read-bulk : mapper all, context(conversationId | postId), types ; ignorer une portée inconnue (log) ; deleted-bulk de kind read purge les lignes lues et republie ligne à ligne.
- Rollback ciblé : notificationReadRolledBack republié aux vues pour repeindre la ligne non lue (+ toast) ; patch cache durable.
- Cadence : au plus 1 POST conversation/:id/read par conversation et par fenêtre de 5 s, jamais deux en vol ; au plus 1 stamp par post et par fenêtre ; garde 'plus aucune notification connue non lue' pour éviter les requêtes inutiles.
- Publishers à exposer aux vues montées : notificationMarkedRead, conversationNotificationsRead, postNotificationsRead, typeNotificationsRead, allNotificationsRead, notificationReadRolledBack, notificationWasDeleted (SharedFlow dans le dépôt).
- Retrait des bannières système du fil consommé (voir ntf-push-hygiene-revocation).

Rendu : Aucun rendu propre ; effet visible : pastille et liste toujours d'accord, aucune ligne non lue pour un contenu déjà vu.

Transposition Android : Subjects Combine deviennent MutableSharedFlow dans NotificationRepository ; NotificationRef (typealias NotificationReadScope) devient une sealed interface.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationConsumption.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationCachePatch.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationBulkScopeMapping.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationSyncBinding.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationSyncEvents.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`

### Après une coupure, un trou de séquence ou un retour d'arrière-plan, la liste et la pastille se recalent seules

`ntf-gap-resync` · Android : **partielle** · P1 · effort S

Un coordinateur app-level observe les trous de séquence (SyncSeqTracker.gapDetected), les vraies reconnexions socket (pas le démarrage à froid) et le retour au premier plan avec session ouverte ; il relit les 30 dernières notifications (REST), remplace le cache « all » et recale le compteur non lu (que le gateway n'émet qu'à la mutation). Les rafales sont coalescées par un débounce de 0,3 s ; l'échec est journalisé et laisse le cache tel quel ; sans session rien n'est fait.

Écarts :
- observeSyncGaps vit dans NotificationsViewModel (écran Notifications) : lié au cycle de vie de cet écran, donc inactif quand la liste n'est pas ouverte. Déplacer dans un coordinateur applicatif (singleton démarré après login).
- Ajouter les déclencheurs reconnexion socket (didReconnect hors démarrage à froid) et retour au premier plan (ProcessLifecycleOwner ON_START) avec session authentifiée.
- Débounce 300 ms pour coalescer gap + reconnexion + premier plan.
- Recaler aussi le compteur non lu après le refetch, même si l'écriture du cache échoue (deux lectures indépendantes).
- Idempotence : le refetch remplace le cache « all » par la vérité serveur (dédup par id inhérente) ; limite 30.
- Journaliser l'échec (log) sans vider le cache.

Rendu : Aucun rendu propre.

Transposition Android : willEnterForeground devient ProcessLifecycleOwner ON_START ; Combine debounce devient Flow.debounce(300).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationGapResyncCoordinator.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`

### Une notification obsolète disparaît d'elle-même : révoquée, remplacée, ou déjà lue ailleurs

`ntf-push-hygiene-revocation` · Android : **partielle** · P1 · effort M

Les bannières déjà livrées sont nettoyées quand elles n'ont plus de raison d'être : un push de contrôle notification_revoked retire les bannières ciblées ET patche durablement le cache de la cloche puis recale le compteur ; un push de REMPLACEMENT (message édité, réaction changée) annule la bannière précédente avant d'afficher la nouvelle (par notificationId, ou messageId+type, ou acteur+sujet) ; ouvrir une conversation, la marquer lue, y répondre, ou consommer un post retire les bannières du fil correspondant ; une suppression de notification par socket est regroupée sur 200 ms. Une action de nettoyage est confirmée avant de rendre la main à iOS (sondage 50 ms, 3 s max).

Écarts :
- Révocation : le parseur et l'annulation système existent (ids, tags, conversationIds, types), mais rien ne patche le cache de la cloche ni ne recale le compteur (équivalent applyServerRevocation : ids vides écartés, patch du cache écrit durablement AVANT le réseau, republication aux vues, puis refreshUnreadCount).
- Remplacement : lire replacesNotificationId et replacesActorSubject (type + senderId + sujet commentId/messageId/postId) ; annuler les notifications actives qui correspondent (par notificationId, sinon messageId+type, sinon acteur+sujet) en excluant la notification entrante, AVANT de poster la nouvelle (NotificationManager.activeNotifications).
- Nettoyage par fil : poser un tag stable conversation:<id> / post:<id> à la construction ; annuler par fil quand la conversation est ouverte, marquée lue (action Marquer lu), répondue, ou le post consommé ; ne JAMAIS tout effacer au retour au premier plan (la liste in-app et la pastille restent la mémoire de ce qui a été manqué).
- Après action Accepter/Refuser : retirer les notifications de même (type, senderId) ; après un commentaire : retirer le fil post:<id>.
- Regroupement 200 ms des suppressions socket notification:deleted avant de retirer les bannières système.
- Sans objet : sondage de confirmation de retrait (cancel() est synchrone sur Android).

Rendu : Aucun rendu ; effet visible : le panneau de notifications ne garde jamais une bannière qu'on a déjà traitée.

Transposition Android : getDeliveredNotifications / removeDeliveredNotifications devient NotificationManager.activeNotifications / cancel(tag, id) ; threadIdentifier devient tag + groupe ; push de contrôle silencieux devient message FCM data.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DeliveredBannerCenter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationRevocationPayload.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationReplacement.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationRevocation.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Une notification système Meeshy s'affiche regroupée par conversation, avec avatar, aperçu et réglages respectés

`ntf-push-system-rendering` · Android : **partielle** · P1 · effort M

Le push reçu devient une notification système cohérente : regroupée par fil (conversation ou post), avec le nom et l'avatar de l'expéditeur, l'aperçu servi par la passerelle (déjà traduit selon le Prisme), un placeholder localisé pour les messages protégés, la vignette ou le fichier joint quand c'est permis, et le respect des préférences Aperçu, Nom de l'expéditeur, Notifications de groupe, Sons, Vibrations. Le contrat de charge (notificationId, type, conversationId, messageId, senderId, postId, commentId, callId, titre/corps) est décodé en un seul type.

Écarts :
- handleMessagePush fait message.notification ?: return : un push data-only est ignoré, et un push avec bloc notification est affiché par le système en arrière-plan SANS passer par PushPresentationPolicy (préférences, DND, conversation ouverte). Exige un envoi FCM Android en data-only haute priorité côté gateway, rétrocompatible (les anciens clients gardent notification+data jusqu'à la version minimale).
- Un seul canal « Messages » en dur : créer des canaux par catégorie (messages, mentions/réponses, social, contacts/groupes, système) dans un groupe de canaux, libellés dans strings.xml 4 langues ; Sons/Vibrations pilotés via setSilent et le canal.
- Pas de MessagingStyle ni de Person (nom + avatar de l'expéditeur, avatar de groupe) ; pas de regroupement par fil : tag/groupe conversation:<id> et post:<id> (équivalent du threadIdentifier) avec notification de synthèse, désactivable par la préférence Notifications de groupe.
- Préférences Aperçu et Nom de l'expéditeur non appliquées au rendu : masquer l'aperçu (libellé « Nouveau message ») et le nom quand elles sont coupées.
- Messages protégés (notificationLocKey présent : éphémère, vue unique, flouté, chiffré) : afficher un placeholder localisé via une table de clés dans strings.xml et NE JAMAIS attacher d'image ni de transcription.
- Média : BigPictureStyle avec firstAttachmentUrl quand le type est image/* et que le message n'est pas protégé ; vignette vidéo via thumbnailUrl.
- Icône système : android.R.drawable.ic_dialog_email à remplacer par une icône monochrome Meeshy ; couleur d'accent par type (setColor, accentHex du type).
- Décodeur de charge unique (équivalent NotificationPayload, ~25 clés dont isVideo en chaîne « true »/« false ») pour que rendu, actions et tap lisent la même structure.
- Signal d'activité de message (noteMessageActivity) : n'émettre que pour type message ou messageId présent hors réactions (type reaction ou suffixe _reaction).

Rendu : Titre = expéditeur (ou « Nom dans Groupe »), corps = aperçu 1 à 2 lignes, avatar rond de l'expéditeur, couleur d'accent du type, heure serveur. Canal appels déjà en IMPORTANCE_HIGH ; les autres canaux en HIGH pour messages/mentions, DEFAULT pour social, LOW pour système.

Transposition Android : Communication Notification iOS devient NotificationCompat.MessagingStyle + Person ; threadIdentifier devient tag + setGroup + summary ; catégories UNNotificationCategory deviennent canaux + actions ; pièce jointe NSE devient BigPictureStyle ; badge iOS devient setNumber / point de lanceur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelIds.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelInstaller.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PushPresentationPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/ActiveConversationStore.kt`

### Une notification reçue en direct entre dans la liste, le compteur et le cache une seule fois, et naît lue si on regarde déjà le contenu

`ntf-realtime-ingest` · Android : **partielle** · P1 · effort M

À l'arrivée d'une notification par socket (ou par push premier plan), le pipeline : coupe les doublons APN+socket (fenêtre 2 s) ; met à jour le cache d'amitié pour les demandes et acceptations d'ami (et invalide les caches d'amis persistés) ; si la conversation visée est ouverte, la persiste déjà LUE, la marque lue côté serveur, déclare l'écho comme sien et ne touche pas au compteur ; sinon la persiste non lue dans le cache (sans fabriquer un cache d'un seul élément quand la liste n'a jamais été chargée), incrémente le compteur quelles que soient les préférences, publie l'arrivée aux vues montées et décide séparément si une bannière in-app s'affiche.

Écarts :
- Notification d'une conversation ouverte : Android supprime seulement la bannière, la ligne reste non lue et le compteur est incrémenté (prependLive). Implémenter markConsumedOnArrival : persister lue, POST read, registre d'auto-lecture, ne pas incrémenter.
- friend_request / friend_accepted : mettre à jour le cache d'amitié local (didReceiveRequest avec friendRequestId, didAcceptRequest) puis invalider les caches amis/demandes persistés.
- Dédoublonnage 2 s APN premier plan + socket (aujourd'hui limité au ViewModel de la bannière).
- Mapping complet ApiNotification : title, subtitle, content, acteur, contexte avec postId / commentId / parentCommentId pris dans metadata en repli, état lu venant du fil.
- Le compteur s'incrémente toujours ; seules les préférences par type gatent la bannière (voir ntf-banner-display-policy).
- Persister aussi dans Room (voir ntf-center-list-cache-first) en conservant la règle « ne rien fabriquer si la liste n'a jamais été chargée ».

Rendu : Aucun rendu propre.

Transposition Android : Combine sink sur MessageSocketManager.notificationReceived devient collect sur SharedFlow dans un singleton applicatif (ChromeViewModel lie déjà observeNotificationSync).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/SocketNotificationEvent+Persistence.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationSyncBinding.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`

### Réglages ▸ Notifications : une page dédiée en sept sections, chaque réglage avec son icône colorée

`ntf-settings-page-sections` · Android : **partielle** · P1 · effort M

La page Notifications des Réglages regroupe les interrupteurs en sept sections (Général, Messages, Conversations, Contacts et groupes, Fil social, Affichage, Ne pas déranger), chacune avec un en-tête icône + titre en majuscules espacées et une carte arrondie teintée ; chaque ligne a une pastille d'icône 28 pt teintée et un interrupteur à la couleur de marque. Environ 30 réglages, synchronisés avec le serveur au fil de l'eau : Notifications push, Email, Sons, Vibrations, Badges ; Nouveaux messages, Appels entrants, Appels manqués, Système ; Conversations, Réponses, Mentions, Réactions ; Demandes de contact, Quand un contact revient sur Meeshy, Invitations de groupe, Membre a rejoint, Membre a quitté ; J'aime / Commentaires / Repartages / Réactions stories / Réponses commentaires / J'aime commentaires / Contenus des amis / Jeu : duo, ligue, saison ; Aperçu, Nom de l'expéditeur, Notifications de groupe.

Écarts :
- Les réglages sont une section noyée dans SettingsScreen (929 lignes) : créer un écran dédié avec en-tête repliable et flèche retour, ouvert depuis la ligne « Notifications » des Réglages.
- Organiser en sept sections iOS (Général, Messages, Conversations, Contacts et groupes, Fil social, Affichage, Ne pas déranger) au lieu de la liste plate + éditeur de types par catégorie (Messages, Appels, Social, Groupes, Système).
- Préférences manquantes dans UserNotificationPreferences : contactActivityEnabled (« Quand un contact revient sur Meeshy », notification contact_recently_active) et gameEnabled (« Jeu : duo, ligue, saison », types game_duo_invited / game_duo_accepted / game_league_result / game_season_step / game_mission_window). Les ajouter au modèle, au corps de synchro, au codec et à NotificationTypeToggle ; défaut true.
- voicemailEnabled est une préférence orpheline retirée côté iOS : ne plus l'afficher (la conserver en compatibilité de modèle).
- NotificationTypeToggle ne couvre pas les types récents d'iOS : contact_joined, contact_recently_active, level_up, jeu, ni les alias locaux ; aligner sur UserNotificationPreferences.isTypeEnabled.
- Les lignes sont grisées quand pushEnabled est faux ; iOS laisse tous les interrupteurs actifs (la bannière in-app obéit aux interrupteurs par type même push coupé) : aligner ou trancher explicitement.
- Rendu : pastille d'icône 28×28 radius xs teintée à 12 %, couleur propre à chaque ligne, titres de section en majuscules (tracking 1,2) avec icône et couleur de section, libellés a11y sur chaque interrupteur ; la recherche de types d'Android peut être conservée (extra).

Rendu : Fond dégradé du thème ; chaque section = en-tête (icône 12 pt semibold + titre footnote bold arrondi MAJUSCULES, couleur de section, tracking 1.2, aligné à gauche +4) puis carte radius lg, remplissage surfaceGradient teinté + bordure 1 pt teintée ; ligne : padding horizontal mdPlus, vertical smPlus, pastille d'icône 28×28 radius xs (couleur 12 %), libellé labelSize medium, interrupteur tint brand. Espacement entre sections : xl. Marge basse 40.

Transposition Android : Toggle SwiftUI + DatePicker deviennent Switch Material 3 ; CollapsibleHeaderPage devient la barre repliable MeeshyTopBar.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationTypeCatalog.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationTypeToggle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesSyncRepository.kt`

### La pastille de l'icône, le widget et la cloche affichent le même nombre de non lus, à jour même app fermée

`ntf-unread-badge-coordinator` · Android : **partielle** · P1 · effort M

Un coordinateur unique tient le total de messages non lus (registre par conversation : le serveur est autorisé à écraser, un instantané du cache ne fait que semer, une lecture réelle est optimiste ; la conversation ouverte est exclue du total) et le compteur de notifications de la cloche (notification:counts). Un débounce de 150 ms écrit la pastille d'icône (coupée à 0 si la préférence Badges est désactivée), le miroir partagé avec le widget (vrai total), puis publie vers les widgets (liste de conversations, favoris, compteur). À la déconnexion tout est remis à zéro, y compris l'espace partagé. Un réveil à froid sans instantané ne remet rien à zéro.

Écarts :
- Compteur de cloche présent (unreadCountStream), mais pas de registre de non-lus par conversation avec les trois sources de vérité (serveur conversation:unread-updated autoritaire, instantané cache non autoritaire, réconciliation post-reconnexion) ni exclusion de la conversation ouverte.
- Pas de pastille d'icône : Android n'a pas d'API setBadgeCount ; utiliser NotificationCompat.setNumber sur la notification de synthèse + point de lanceur, piloté par le total ; la préférence « Badges » n'a aujourd'hui aucun effet.
- Débounce 150 ms et idempotence (un compteur identique n'écrit rien) à porter ; ne rien écraser tant qu'aucun instantané autoritaire n'a été reçu (réveil à froid).
- Publication vers les widgets Glance (liste récente, contacts favoris, compteur) via un sink dédié, avec wipeAll() à la déconnexion (le contenu du compte sortant ne reste pas affiché).
- Reset à la déconnexion : registre, compteurs, pastille à 0, miroir widget.
- Application des compteurs reçus par push silencieux (voir ntf-push-silent-sync).

Rendu : Aucun rendu propre ; la pastille ne se met jamais à zéro à cause d'un cache obsolète juste après un événement socket.

Transposition Android : UNUserNotificationCenter.setBadgeCount devient setNumber de la notification de synthèse + canal showBadge ; App Group UserDefaults devient DataStore lu par les widgets Glance.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/UnreadCountWidget.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DashboardScreen.kt`

### Ouvrir dans Plans, Ajouter aux contacts, Rejoindre, Rappeler : le bon geste selon ce que contient le message

`ntf-push-actions-detail-callback` · Android : **partielle** · P2 · effort M

La catégorie de la notification propose le geste utile au contenu : une position propose « Ouvrir dans Plans » (ouvre le lieu dans l'app de cartes), une carte de visite « Ajouter aux contacts » (ouvre l'app et présente la fiche de nouveau contact), une invitation « Rejoindre » (uniquement un lien d'invitation valide, un autre lien est refusé et ouvre simplement la notification), plus « Répondre » partout. Les notifications d'appel manqué proposent « Rappeler » (compose le rappel), les appels entrants Décrocher/Refuser (le refus est silencieux, sans navigation). Faute de détail lisible, un bouton ouvre la notification : il n'est jamais inerte.

Écarts :
- Seuls Décrocher et Refuser (appel entrant, CallStyle) existent. Manquent « Ouvrir dans Plans » (intent geo: ou Google Maps avec lat/lon/nom), « Ajouter aux contacts » (ContactsContract insert avec contactName / contactPhone / contactEmail), « Rejoindre » (deep link de jointure ou de lien de chat, rejet des autres URLs), « Rappeler » (CallBackRequest vers le gestionnaire d'appels).
- Décodage du détail de message depuis la charge : clés locationLat, locationLon, locationName, locationAddress, contactName, contactPhone, contactEmail, inviteUrl, inviteConversationTitle, inviteMemberCount, linkUrl, linkDomain, linkTitle, linkImageUrl, thumbnailUrl, storyReply (priorité position, contact, invitation, lien) ; les nombres arrivent en chaînes.
- Relire le détail par la MÊME politique que pour choisir la catégorie, protection comprise (notificationLocKey présent = aucun détail).
- Chaque action qui mène quelque part ouvre l'app (PendingIntent activité) ; les autres restent en arrière-plan ; consommer la notification après le geste.
- Libellés « Ouvrir dans Plans » (Android : « Ouvrir dans Cartes »), « Ajouter aux contacts », « Rejoindre » en 4 langues.

Rendu : Une action propre au contenu en premier, Répondre en second ; icônes d'action optionnelles. Libellés courts (une ligne).

Transposition Android : Ouvrir dans Plans devient intent geo: ; Ajouter aux contacts devient Intent ContactsContract.Intents.Insert ; Rejoindre devient le routeur de deep links ; catégories UNNotificationCategory deviennent des jeux d'actions construits selon le détail.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationDetailCategories.swift`
- `apps/ios/Meeshy/Features/Main/Services/NotificationActionHandler.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`

### Ne pas déranger : plage horaire et jours de la semaine, appliqués aux notifications de fond

`ntf-settings-dnd` · Android : **complète** · P2 · effort S

Un interrupteur active la fenêtre Ne pas déranger ; heure de début et heure de fin se choisissent avec un sélecteur d'heure ; sept pastilles (L M M J V S D) choisissent les jours ; la fenêtre traverse minuit. Les valeurs sont persistées au format HH:mm et synchronisées. La fenêtre protège l'attention de l'utilisateur absent : elle bloque les alertes de fond mais PAS la bannière in-app.

Rendu : Ligne interrupteur + deux lignes horaires + rangée de 7 pastilles rondes (initiale du jour, haptique légère au tap, libellé a11y = nom complet du jour). Android affiche en plus l'état actif/inactif de la fenêtre, à conserver.

Transposition Android : DatePicker hourAndMinute devient TimePicker Material 3 en dialogue ; la règle de fenêtre est déjà portée par DndWindow. Le filtre Focus iOS correspond au filtre d'interruption Android (FocusFilterSnapshot déjà présent en modèle).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/DndWindow.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`

