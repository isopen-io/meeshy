# Parité iOS → Android : `extensions-widgets-share`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**50 features iOS** : 28 absentes, 21 partielles, 1 divergentes, 0 complètes sur Android. **44 lots** planifiés (≈39830 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**extensions-widgets-share** (couverture Android estimée ≈ 15 %)

Cette partie regroupe tout ce qui vit hors de l'écran principal iOS : widgets WidgetKit (récentes, non lus, réponse rapide, favoris, action « marquer comme lu »), quatre Live Activities (appel, lecture et enregistrement de vocal, progression d'envoi), l'extension de partage « Envoyer avec Meeshy » et l'écran de partage unique de l'app (plan de partage et loi de sortie du contenu protégé, 10 destinataires, légende, Ensemble/Séparément, publication Story/Post/Réel, relais, envoi durable TUS), l'atelier d'export « Imagine » (784 templates, GIF/vidéo animés), l'extension de service de notification (pièces jointes, style communication, actions, E2EE, pré-enregistrement GRDB), l'extension de contenu de notification déployée, l'extension de diffusion d'écran, les App Intents/Focus, le routage du collage, le presse-papiers expirant et la gestion des liens de partage de conversation (liste, fiche/édition, arrivées, page d'invitation).
Android couvre aujourd'hui l'essentiel du premier niveau seulement : quatre widgets Glance statiques (une seule face, fond blanc codé en dur, aucun updateAll donc jamais rafraîchis hors des 30 min système, compteur divergent), des raccourcis dynamiques de conversations, un récepteur ACTION_SEND minimal (texte + UNE image/vidéo vers UNE conversation), un forward à un toucher, un FCM qui ne rend que titre+corps (aucune action, aucun MessagingStyle, aucune image, rien en arrière-plan car le gateway envoie notification+data), l'appel entrant CallStyle, et l'écosystème liens de partage (liste, détail lecture seule, création, entrée) sans édition ni arrivées.
Absents : toutes les notifications en cours (appel actif, lecture/enregistrement vocal, progression outbox) et donc aucun service de premier plan micro/caméra/mediaPlayback, l'écran de partage unique et la loi de sortie (risque de sécurité : forward de contenu vue unique/éphémère sans garde), l'atelier Imagine entier, la diffusion d'écran (MediaProjection), la notification déployée, l'E2EE, le routage de collage riche, le presse-papiers expirant.
Les chantiers structurants sont : (1) service de premier plan d'appel + notification en cours + ConnectionService (P0), (2) contrat push data-only rétrocompatible + MessagingStyle + actions Répondre/Marquer comme lu (P0), (3) port Kotlin de SharePlanner/ContentExitLaw puis écran de partage unique et réception multi-fichiers durable (P0/P1), (4) rafraîchissement des widgets et mark-read (P1), (5) Imagine et notification déployée (P2, XL cumulé, dépend du moteur MessageCard d'une autre partie).

## Notes transverses

Domaine : 59 lots, ~52 600 lignes estimées, 9 vagues de dépendances, 13 P0. Vague 1 (9 lots sans dépendance, parallèles) : share-exit-law-forward-guard (ferme la faille : un message à vue unique/éphémère se transfère aujourd'hui sans garde), push-payload-and-gate-laws, push-trusted-media-fetch, app-lifecycle-task-registry, assistant-deeplink-routes, widget-design-kit, clipboard-paste-and-secret-expiry, sharelinks-list-and-detail-edit, dashboard-link-stats-sources. Chemins critiques : (1) partage unique : exit-law > share-plan-planner > dispatcher-core > attachment-fanout > share-sheet-shell > intake-activity > durable-send > relay > studio ; (2) push : payload-gate-laws > pipeline-service > communication-style > quick-actions ; (3) appel : ongoing-activity-host > ongoing-call-law > ongoing-call-foreground-service > telecom / screen-share. Preuve locale : toute la logique placée dans :core:model (loi de sortie, planificateur, lois d'entrée, porte push, lois des activités en cours, lois Imagine, PastedContentRouter, ShareLinks*) se prouve par ./apps/android/meeshy.sh jvm-check ; le reste par la CI android.yml.

Composants partagés à construire d'abord (les autres lots s'y branchent sans toucher les mêmes fichiers) : app-lifecycle-task-registry (Set<AppLifecycleTask> Hilt : MeeshyApplication/MainActivity ne sont plus édités par les widgets, raccourcis, envoi durable, notifications en cours) ; pipeline push (NotificationEnricher @IntoSet par phase : MeeshyFcmService n'est édité que par push-pipeline-service) ; ongoing-activity-host (UN service de premier plan typé + contrôleurs multibindés : le manifeste n'est édité qu'une fois) ; widget-design-kit ; ConversationShortcutId (défini par push-communication-style, réutilisé par system-shortcuts) ; ContentExitLaw/ShareLimits (réutilisés par shell, actions, Imagine) ; ShareRequest/ShareRequestHolder.

Points chauds. (a) Additifs, à résoudre textuellement : AndroidManifest.xml, MeeshyApp.kt (routes), libs.versions.toml et app/build.gradle.kts (glance-material3, media3-session, sharetarget), NetworkModule/SdkModule ; une classe qui vit dans une bibliothèque déclare son composant dans le manifeste de CE module (feature:calls pour Telecom, sdk-core pour le service dataSync de WorkManager). (b) Fichiers hors budget, sérialisés par depends_on (non fonctionnel) : ChatScreen/ChatViewModel (2 953 / 2 248 lignes) : share-exit-law-forward-guard > voice-playback-coordinator > share-chat-integration (qui RETIRE du code) > imagine-entry-points ; ChatComposer : clipboard-paste-and-secret-expiry > ongoing-voice-recording ; OutboxFlushWorker : attachment-fanout > outbox-progress ; ShareSheetViewModel : shell > durable-send > relay > studio ; ShareTargetActivity : shell > intake > shortcuts ; WidgetEntryPoint : refresh-pipeline > widgets-unread-reply-favorites. (c) Chaque lot ajoute ses chaînes dans res/values/strings_<lot>.xml (+ fr/es/pt, non listés) ; l'app ne porte que en/fr/es/pt alors qu'iOS sert 7 langues (prérequis ext : localisation). Les listes android_files_touched donnent tous les fichiers EXISTANTS modifiés et seulement les principaux fichiers nouveaux.

Écarts assumés vs inventaire : fiche de partage durable = fichier AtomicFile (la base Room fait fallbackToDestructiveMigration) ; mark-read du widget = outbox READ_RECEIPT existante, pas de nouvelle file ; compteur de non lus calculé sans migration de schéma (flux sur unreadCount > 0, hors muettes) ; Telecom par ConnectionService auto-géré ; aucun appel Android n'a d'E2EE connu, donc zéro sous-titre sur l'écran verrouillé.

Constat gateway (hors domaine, conditionne la valeur complète des lots push) : le gateway n'envoie du data-only Android qu'aux pushs silencieux et aux appels ; tout autre push porte un bloc notification rendu par le SYSTÈME app fermée, donc onMessageReceived ne tourne pas et style, actions, médias, préchargement et filtre n'agissent qu'au premier plan tant que ext:gateway-android-data-only-opt-in n'est pas livré (capacité sur le jeton, data enrichie de threadId/badge/muted/subtitle, éventuel endpoint de carte statique). Il cible aussi le canal meeshy_notifications_silent, absent du client natif (créé par push-pipeline-service). Autres prérequis externes : ext:core-crypto-e2ee-session-keys (module E2EE vide), ext:messagecard-engine (moteur et 784 templates d'Imagine), UI du lecteur de vocal de bulle (le coordinateur seul est livré ici), carnet d'adresses apparié (destinataires contact), menu des commentaires du feed (Imager), invite runtime POST_NOTIFICATIONS à vérifier.

Risques : déclarations Play Console des types de service (phoneCall, microphone, camera, mediaPlayback, mediaProjection, dataSync plafonné à 6 h/jour sur Android 15) ; démarrage de service refusé en arrière-plan (retentative au premier plan) ; OEM refusant le PhoneAccount (repli CallStyle) ; limites Glance/RemoteViews (bitmaps petits, cache LRU) ; FCM peut dégrader la priorité d'un data-only qui ne poste rien. Lois transverses respectées partout : Prisme (aperçus de widget, bannières, Imagine : descente complète des langues, jamais l'original par défaut), présence 1/3/5 réservée aux amis acceptés, accentHex des conversations, fail-closed sur tout contenu protégé (ni image, ni transcription, ni détail). Non portés, dette consignée : intent Traduire, widgets d'écran verrouillé, Dynamic Island, IPC App Group/Darwin/socket Unix/trames MSSF, relais E2EE.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `push-trusted-media-fetch` | C | P0 | M | 560 |  | Les images et vocaux d'une notification viennent d'une origine de confiance et sous un plafond |
| `assistant-deeplink-routes` | C | P1 | M | 500 | socle-points-d-extension-de-l-app | Je peux dire à l'assistant d'écrire, d'appeler ou d'ouvrir mes non lus |
| `clipboard-paste-and-secret-expiry` | C | P1 | M | 1040 | composer-glass-shell | Ce que je colle part toujours, et un secret copié disparaît du presse-papiers après 30 secondes |
| `ongoing-activity-host` | C | P1 | M | 1050 | persist-app-lifecycle-hooks | Une notification en cours s'ouvre, se met à jour et se ferme de façon fiable, avec ses boutons |
| `ongoing-voice-recording` | C | P1 | M | 620 | ongoing-activity-host, clipboard-paste-and-secret-expiry, composer-glass-shell | Mon enregistrement vocal continue et reste contrôlable quand je quitte l'app |
| `push-e2ee-body-decrypt` | C | P1 | S | 420 | textes-push-proteges-et-repli, session-e2ee-par-contact | Un message chiffré de bout en bout s'affiche déchiffré dans la notification, ou en emoji neutre |
| `push-local-first-prefetch` | C | P1 | M | 760 | socle-pipeline-push-et-cycle-de-vie | Ouvrir une notification affiche tout de suite le message, sans attendre le réseau |
| `push-rich-media` | C | P1 | M | 620 | socle-pipeline-push-et-cycle-de-vie, push-trusted-media-fetch | Une notification montre la photo de l'expéditeur, l'image ou le vocal du message |
| `share-chat-integration` | C | P1 | M | 750 | share-sheet-shell, lecture-file-vocaux-et-enchainement, socle-points-d-extension-de-l-app, composer-glass-shell, chat-viewmodel-state-split | Transférer un message ou une pièce ouvre l'écran de partage unique, depuis le chat et ailleurs |
| `share-dispatcher-attachment-fanout` | C | P1 | M | 950 | share-dispatcher-core, persist-outbox-registre-senders, persist-messages-repository-decoupage, message-fil-decodage-complet-et-tolerant | Une photo envoyée à dix personnes n'est téléversée qu'une fois |
| `share-dispatcher-core` | C | P1 | L | 1250 | share-plan-planner, share-recipients-directory, persist-messages-repository-decoupage | Mon envoi part vers chaque destinataire avec une issue par ligne, même hors ligne |
| `share-durable-send` | C | P1 | L | 1250 | share-dispatcher-attachment-fanout, share-sheet-shell, share-intake-activity, share-pending-store, persist-app-lifecycle-hooks | Un partage lancé depuis une autre app arrive à coup sûr, même app tuée ou réseau coupé |
| `share-intake-activity` | C | P1 | L | 1250 | share-sheet-shell, share-intake-law | Partager plusieurs photos, vidéos ou documents depuis n'importe quelle app vers Meeshy |
| `share-intake-law` | C | P1 | M | 650 | sortie-contenu-loi-et-offre | Ce qu'une autre app me remet est trié, borné et nommé sans risque |
| `share-pending-store` | C | P1 | M | 720 | share-intake-law, socle-points-d-extension-de-l-app | Un partage en cours est consigné avant le premier octet envoyé et survit à la mort du processus |
| `share-plan-planner` | C | P1 | M | 950 | sortie-contenu-loi-et-offre | Le plan de partage dit ce qui part, ce qui est retiré et ce qu'on peut en faire |
| `share-recipients-directory` | C | P1 | M | 950 | sortie-contenu-loi-et-offre | Choisir à qui envoyer parmi mes conversations, mes amis et mes communautés, cache d'abord |
| `share-sheet-actions-zone` | C | P1 | M | 850 | share-plan-planner | Publier, composer, enregistrer, copier ou partager hors de Meeshy depuis la feuille de partage |
| `share-sheet-content-zone` | C | P1 | M | 1050 | share-plan-planner, share-intake-law | Je vois exactement ce qui va partir et je peux le réordonner ou en retirer une partie |
| `share-sheet-recipients-zone` | C | P1 | M | 1000 | share-recipients-directory | Je touche un récent, je coche des conversations, amis et communautés dans la zone « À qui » |
| `share-sheet-send-bar` | C | P1 | M | 750 | share-plan-planner | J'envoie avec une légende, je choisis Ensemble ou Séparément et je suis chaque envoi |
| `share-sheet-shell` | C | P1 | L | 1500 | share-dispatcher-attachment-fanout, share-sheet-recipients-zone, share-sheet-content-zone, share-sheet-actions-zone, share-sheet-send-bar | Un seul écran de partage pour envoyer ou transférer quoi que ce soit |
| `sharelinks-list-and-detail-edit` | C | P1 | L | 1600 |  | Gérer mes liens de partage : liste fiable, fiche complète et édition de tous les réglages |
| `system-shortcuts-and-direct-share` | C | P1 | M | 900 | share-intake-activity, assistant-deeplink-routes, persist-app-lifecycle-hooks, rendu-notification-systeme, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias | Mes conversations récentes apparaissent en tête de la feuille de partage du système |
| `widget-design-kit` | C | P1 | M | 600 | dependances-gradle-scene-medias | Mes widgets partagent les mêmes avatars, couleurs claires/sombres et états vides |
| `widget-recent-conversations-faces` | C | P1 | M | 1080 | widget-design-kit, widget-refresh-pipeline, assistant-deeplink-routes | Voir mes conversations récentes d'un coup d'oeil et les marquer comme lues depuis le widget |
| `widget-refresh-pipeline` | C | P1 | M | 650 | persist-app-lifecycle-hooks | Mes widgets se mettent à jour dès qu'un message arrive, sans ouvrir l'app |
| `dashboard-link-stats-sources` | C | P2 | M | 520 | reseau-pipeline-reessai-erreurs | Les chiffres de mes liens (parrainage, partage, suivi, communauté) se chargent en parallèle |
| `dashboard-links-and-widget-invite` | C | P2 | M | 600 | dashboard-link-stats-sources, socle-points-d-extension-de-l-app | Mon tableau de bord résume mes non lus, mes liens et m'invite à ajouter les widgets |
| `imagine-entry-points` | C | P2 | S | 380 | imagine-pure-laws, imagine-export-stage, share-chat-integration, composer-glass-shell | Imager un message ou un commentaire depuis n'importe quel menu d'action |
| `imagine-excerpt-and-media-loader` | C | P2 | M | 850 | imagine-pure-laws, chat-carte-message-loi-mise-en-page, chat-carte-message-rendu-et-export | Choisir le passage d'un vocal ou d'une vidéo à exporter en le faisant glisser sur l'onde |
| `imagine-export-stage` | C | P2 | L | 1500 | imagine-pure-laws, imagine-tray, imagine-excerpt-and-media-loader, chat-carte-message-loi-mise-en-page, chat-carte-message-rendu-et-export | Transformer un message en carte image en touchant et pinçant l'aperçu |
| `imagine-gallery` | C | P2 | M | 760 | imagine-export-stage, chat-carte-message-loi-mise-en-page, chat-carte-message-rendu-et-export | Parcourir et chercher parmi 784 styles de carte, peints sur mon propre message |
| `imagine-motion-export-save-share` | C | P2 | L | 1300 | imagine-export-stage, imagine-gallery, imagine-excerpt-and-media-loader, chat-carte-message-loi-mise-en-page, chat-carte-message-rendu-et-export | Enregistrer ou partager ma carte en image, en GIF animé ou en vidéo avec la voix |
| `imagine-pure-laws` | C | P2 | L | 1750 | sortie-contenu-loi-et-offre | Les lois de l'atelier Imagine (demande, discussion, réglages, gestes, recherche) sont pures et testées |
| `imagine-tray` | C | P2 | L | 1300 | imagine-pure-laws, chat-carte-message-loi-mise-en-page, chat-carte-message-rendu-et-export | Régler la carte d'export par onglets : styles, format, disposition, fond, police, médias, langue |
| `notification-expanded-content` | C | P2 | L | 1250 | push-rich-media, push-message-detail, lecture-vocal-arriere-plan-et-ecran-verrouille | Déployer une notification pour écouter un vocal, voir une position ou une carte de contact |
| `ongoing-outbox-progress` | C | P2 | M | 640 | ongoing-activity-host, share-dispatcher-attachment-fanout, persist-outbox-registre-senders | Je vois l'avancement d'un envoi long quand je quitte l'app |
| `push-message-detail` | C | P2 | M | 650 | push-rich-media, actions-repondre-et-marquer-lu, socle-pipeline-push-et-cycle-de-vie | Une notification de position, de contact ou d'invitation montre déjà le détail |
| `share-compose-studio-handoff` | C | P2 | M | 750 | share-relay-signin-e2ee, share-sheet-actions-zone, socle-points-d-extension-de-l-app, composer-socle-decoupage-et-dependances | Publier une photo ou une vidéo reçue d'une autre app en story, post ou réel via le studio |
| `share-relay-signin-e2ee` | C | P2 | M | 520 | share-durable-send, socle-points-d-extension-de-l-app | Si je ne suis pas connecté ou que la conversation est chiffrée, mon partage m'attend dans l'app |
| `share-surfaces-and-external-link` | C | P2 | M | 800 | share-chat-integration, system-shortcuts-and-direct-share, dashboard-link-stats-sources, feed-screen-split | Partager un post, une story, un réel ou un profil avec le même écran, ou vers une autre app avec un lien suivi |
| `sharelinks-arrivals` | C | P2 | M | 950 | sharelinks-list-and-detail-edit, socle-points-d-extension-de-l-app | Voir qui a rejoint par mon lien : visites, arrivées, langues et derniers arrivés |
| `widgets-unread-reply-favorites` | C | P2 | M | 1040 | widget-design-kit, widget-refresh-pipeline, assistant-deeplink-routes | Les widgets Non lus, Réponse rapide et Favoris ont le visuel, la sémantique et la présence d'iOS |

### Lots fusionnés ou retirés par l'architecture

- `app-lifecycle-task-registry` → `persist-app-lifecycle-hooks` (drop-duplicate) : Même registre multibinding de tâches de démarrage / premier plan ; un seul point d'extension (AppLifecycleHook) au lieu de trois (AppLifecycleTask, AppStartupTask, AppForegroundHook).
- `push-pipeline-service` → `socle-pipeline-push-et-cycle-de-vie` (drop-duplicate) : Même pipeline push extensible ; MeeshyFcmService n'a qu'un propriétaire.
- `push-payload-and-gate-laws` → `socle-pipeline-push-et-cycle-de-vie` (merge-into) : Le décodeur PushPayload est le même ; la porte (préférences, heures calmes, regroupement, badge) devient une loi pure du socle.
- `push-communication-style` → `rendu-notification-systeme` (merge-into) : Même rendu MessagingStyle + Person + raccourci de conversation ; ConversationShortcutId est défini ici. Hérite : push-trusted-media-fetch.
- `push-quick-actions` → `actions-repondre-et-marquer-lu` (drop-duplicate) : Mêmes actions Répondre / Marquer lu depuis la notification.
- `push-protected-and-ephemeral` → `textes-push-proteges-et-repli` (merge-into) : Même corps de repli pour contenu protégé ; l'expiration des éphémères est portée par nettoyage-bannieres-et-expiration. Hérite : socle-pipeline-push-et-cycle-de-vie.
- `share-exit-law-forward-guard` → `sortie-contenu-loi-et-offre` (merge-into) : Même ContentExitLaw ; la garde de transfert du chat rejoint ce lot.
- `sharelinks-invite-landing` → `rejoindre-page-invitation-ecran` (drop-duplicate) : Même page d'invitation.
- `ongoing-call-law` → `calls-foreground-service-and-ongoing-notification` (merge-into) : Même notification d'appel en cours.
- `ongoing-call-foreground-service` → `calls-foreground-service-and-ongoing-notification` (drop-duplicate) : Même service de premier plan d'appel.
- `call-telecom-connection-service` → `calls-core-telecom-integration` (drop-duplicate) : Même intégration Telecom.
- `call-screen-share` → `calls-screen-share` (drop-duplicate) : Même partage d'écran en appel.
- `voice-playback-coordinator` → `lecture-file-vocaux-et-enchainement` (merge-into) : Même file de vocaux enchaînés. Hérite : sortie-contenu-loi-et-offre.
- `ongoing-voice-playback` → `lecture-vocal-arriere-plan-et-ecran-verrouille` (drop-duplicate) : Même contrôle du vocal depuis l'écran verrouillé.
- `focus-filter-notifications` → retiré (drop-not-applicable) : Les filtres de concentration iOS (SetFocusFilterIntent) n'ont pas d'API Android : le mode Ne pas déranger et les conversations prioritaires sont gérés par le système, et les notifications de conversation (rendu-notification-systeme) les rendent déjà éligibles. La porte locale heures calmes / DND reste dans le socle push.

## Features

### Une notification en cours se pilote de façon fiable : ouvrir, mettre à jour, fermer, boutons d'action

`ext-ongoing-activity-host` · Android : **absente** · P0 · effort M

Les quatre Live Activities partagent une même mécanique : une loi pure décide (démarrer, mettre à jour, terminer), un hôte exécute dans l'ordre demandé (chaîne sérialisée), garde le handle de l'activité ouverte, retente une ouverture refusée au retour au premier plan et ferme les orphelines. Les boutons de l'îlot ou de l'écran verrouillé (couper le micro, raccrocher, lecture/pause, +-15 s, arrêter, jeter) passent par une commande unique routée vers le service qui porte l'état ; sans gestionnaire, la commande est sans effet. Styles communs (marque, succès, avertissement, erreur, enregistrement) et avatar à initiales ou symbole.

Écarts :
- Abstraction OngoingActivityHost (isRunning, start, update, end avec délai, endOrphans) au-dessus de NotificationManager avec un identifiant stable par type d'activité et un canal à faible importance silencieux « Activités en cours ».
- Chaîne d'exécution sérialisée (un seul dispatcher) pour que ouverture, mises à jour et fermeture partent dans l'ordre demandé ; état local, jamais de requête système pour savoir si elle tourne.
- Ouverture refusée (démarrage d'un service de premier plan depuis l'arrière-plan interdit sur Android 12+) : réessai au retour au premier plan.
- Commandes d'action : PendingIntent vers un BroadcastReceiver unique qui route (coupure micro, raccrocher, lecture, -15 s, +15 s, arrêter, jeter) vers le service porteur d'état ; commande sans objet = no-op.
- Magasin d'avatars (bitmaps 96 px par identifiant d'activité, balayage des orphelins) et palette 6366F1 / 34D399 / FBBF24 / F87171 / enregistrement F87171.
- Test des lois pures (start/update/end) en JVM, sans NotificationManager.

Rendu : Avatar 44 dp rond (dégradé d'accent + initiales arrondies semi-grasses ou symbole de repli), boutons ronds 40 dp, couleurs sémantiques de la palette ; texte blanc sur fond sombre 55-60 % en iOS, thème système sur Android.

Transposition Android : ActivityKit (Live Activity + Dynamic Island) -> notifications en cours (ongoing) portées par un service de premier plan typé ; LiveActivityIntent -> PendingIntent broadcast ; pas d'équivalent d'îlot.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/LiveActivity/LiveActivityBackend.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/LiveActivityHost.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/LiveActivityCommandBinding.swift`
- `apps/ios/MeeshyWidgets/LiveActivityCommandIntent.swift`
- `apps/ios/MeeshyWidgets/LiveActivityStyle.swift`

</details>

### Mes notifications de message se présentent comme une conversation, avec avatar et groupe

`ext-push-communication-style` · Android : **absente** · P0 · effort M

Les pushs de messages, réponses, mentions et réactions deviennent des Communication Notifications : un INSendMessageIntent donné au système (expéditeur avec avatar, groupe avec nom et image) fait afficher l'avatar à gauche de la bannière avec le badge de l'app en bas à droite. Comme le système efface le sous-titre APN lors de la mise à jour du contenu, le code le restaure (nom de groupe ou contexte social : Votre story, En réponse à…), préfixe les noms de groupe d'un repère de type (groupe privé, public, global/broadcast, direct rien) et corrige le corps d'un vocal chiffré arrivé vide.

Écarts :
- NotificationCompat.MessagingStyle avec Person (nom, icône avatar) et IDs de raccourcis de conversation (section Conversations d'Android 11+, priorité haute), groupe avec nom et icône.
- Sous-titre contextuel restauré (groupe, Votre story, En réponse à, Nouvelle humeur) et repère de type de groupe (privé, public, global/broadcast) dans le titre.
- Repli audio : un vocal (surtout E2EE) arrive au corps vide, afficher « Message vocal · durée » ; ne jamais écraser une légende déchiffrée.
- Don de raccourci long-lived par conversation (aussi nécessaire à Direct Share) lors de l'affichage de la notification.
- Types éligibles (message, réponse, mention, réaction) et exclusion des appels VoIP ; cadrage selon la conversation (framing).

Rendu : Avatar rond d'expéditeur, nom en gras, aperçu sur 1 à 2 lignes, nom de groupe en sous-titre avec repère d'icône (groupe privé, globe, haut-parleur).

Transposition Android : INSendMessageIntent + Communication Notifications -> MessagingStyle + Person + ShortcutInfoCompat (conversation shortcuts) ; groupement par canal et setGroup.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/MeeshyNotificationExtension/NotificationPayloadHelpers.swift`
- `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationBannerPresentation.kt`

### Répondre, marquer comme lu, accepter ou rappeler directement depuis la notification

`ext-push-quick-actions` · Android : **absente** · P0 · effort M

Le type du push choisit la catégorie d'actions : message et mention (Répondre en saisie de texte, Marquer comme lu, Voir), demande d'ami (Accepter, Refuser), social (Voir, Marquer comme lu, Commenter en saisie de texte si commentable avec un postId), appel entrant (Répondre, Refuser), appel manqué (Rappeler, Voir), et les catégories spécialisées de détail (position : Ouvrir dans Plans ; contact : Ajouter aux contacts ; invitation : Rejoindre ; audio ; éphémère). La catégorie est dérivée par l'extension elle-même, jamais lue de aps.category (un gateway plus ancien ne la pose pas). Une réaction ne se spécialise pas.

Écarts :
- Action Répondre avec RemoteInput sur les notifications de message/mention : envoi via l'outbox sans ouvrir l'app, bannière mise à jour en « Envoyé » (aucune action de message n'existe aujourd'hui, seule l'action Refuser d'appel).
- Action Marquer comme lu (BroadcastReceiver + markRead REST/outbox, annulation de la bannière) sur message, mention et social.
- Demande d'ami : Accepter / Refuser ; social commentable : Commenter (RemoteInput) ; appel manqué : Rappeler / Voir.
- Mapping type -> catégorie aligné sur NotificationTypeEnum (packages/shared/types/notification.ts) ; catégories dérivées côté client, pas de dépendance à une catégorie serveur.
- Actions de détail : Ouvrir dans les cartes (position), Ajouter aux contacts (carte de visite), Rejoindre (invitation) ; réaction = pas de spécialisation.
- Libellés localisés en sept langues (Marquer comme lu, Commenter, Voir, Accepter, Refuser, Rappeler, Répondre, Ouvrir dans Plans, Ajouter aux contacts, Rejoindre).

Rendu : Boutons d'action sous la bannière, saisie en ligne pour Répondre/Commenter, bouton Refuser en style destructif (rouge), libellés courts.

Transposition Android : UNNotificationCategory + UNTextInputNotificationAction -> NotificationCompat.Action avec RemoteInput et PendingIntent BroadcastReceiver.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/MeeshyNotificationExtension/NotificationDetailPolicy.swift`
- `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`

### Un contenu protégé (vue unique, éphémère, flouté, chiffré) ne sort jamais par un transfert ou un partage

`ext-share-plan-exit-law` · Android : **absente** · P0 · effort M

Le plan de partage (SharePlanner, miroir de packages/shared/utils/share-plan.ts) est pur : à partir de l'entrée (texte, lien, médias, pièce, messages, carte) et des destinations, il rend le titre, ce qui part (kept), ce qui est retiré (withdrawn avec motif vue unique / après lecture / indisponible), l'état bloqué, les actions offertes (envoyer, légende, ordre, grouper, publier post/story/réel, studio, enregistrer, copier, imager, partager dehors) et celles retenues avec leur motif, le groupement, la légende, les plafonds communs (20 fichiers, 500 Mio, 10 destinataires, 10 médias de publication, légende 5 000) et la copie sur l'appareil des sources chiffrées. La loi de sortie ContentExitLaw décide de la nature du message. Rangée de durée : la copie d'une flamme dure AU PLUS autant que la source, paliers inférieurs ou égaux, durée de la source présélectionnée.

Écarts :
- Sécurité : aucun garde de sortie côté Android. ForwardTargets filtre seulement les destinations ; un message à vue unique, à effacement après lecture, éphémère ou flouté peut être transféré. Porter ContentExitLaw (forward : allowed | refused viewOnce | refused afterRead, durée max de la flamme, flou hérité).
- Port Kotlin de SharePlanner et de ShareLimits (miroir de share-plan.ts et share-limits.ts, table de tests reprise cas par cas de SharePlanTests et du témoin TypeScript).
- Projection Message -> ShareMessage / ShareMedia (drapeaux vue unique, flou, effets, éphémère, chiffré par message, pièce ou conversation, cite un contenu protégé, pièces hors localisation).
- Actions retenues avec motif (flamme, floutée, chiffrée, cite un contenu protégé, trop de médias, photo seule pas un réel, pas un réel) et règle qualifiesAsReel.
- Rangée de durée de la flamme : puces des paliers <= durée source, source présélectionnée, libellé a11y dans la langue du système (« 30 secondes »).
- Plafonds : trimCount depuis la fin pour tenir 20 fichiers/500 Mio, overRecipients, canSend ; copie sur l'appareil + avertissement pour les destinations non chiffrées d'une source chiffrée.

Rendu : Rangée de durée : puces capsule alignées horizontalement sous la zone « Ce qui part », titre « Disparaît après », sélection à l'accent, cibles 44 dp ; message d'information gris avec icône pour une action retenue.

Transposition Android : Code pur multiplateforme : réimplémenter en Kotlin pur dans :core:model (sans dépendance Android), mêmes tables de vérité que TypeScript et Swift.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Share/SharePlan.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Share/SharePlan+Message.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareDurationRow.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ForwardTargets.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`

### Je contrôle un vocal en lecture depuis l'écran verrouillé (pause, +-15 s)

`ext-ongoing-voice-playback` · Android : **absente** · P1 · effort M

Live Activity de lecture : titre = expéditeur (sinon « Message vocal »), sous-titre = nom de la conversation (libellé neutre pour un message protégé : éphémère, vue unique, flouté, chiffré), avatar initiales, barre de progression temps réel sans mise à jour par tic (position datée + vitesse), boutons -15 s, lecture/pause, +15 s, puce de langue de la piste jouée (traduite ou originale, Prisme), compteur « à suivre ». La loi n'actualise qu'aux ruptures : pause, reprise, piste suivante, langue, débit, saut de plus de 1,5 s. Source unique : le coordinateur audio de conversation.

Écarts :
- Coordinateur audio global (un seul vocal actif, file « à suivre ») : le lecteur Android est local à l'écran de chat, sans MediaSession ni service ; le créer en premier.
- MediaSession + notification MediaStyle (service de premier plan mediaPlayback) : titre, sous-titre, avatar, boutons -15 s / lecture-pause / +15 s, barre de progression pilotée par la position datée et le débit.
- Port de VoicePlaybackActivityLaw : mises à jour uniquement aux ruptures (pause, reprise, piste, langue, débit, saut > 1,5 s), position bornée à la durée, durée de repli déclarée.
- Message protégé (éphémère, vue unique, flouté, chiffré) : libellé neutre à la place du nom de la conversation, aucun texte du message sur l'écran verrouillé.
- Puce de langue de la piste jouée (majuscules + icône traduction si piste traduite) élue par la langue du texte servi (Prisme), jamais par une descente indépendante.
- Fin de lecture : état figé puis retrait ; commandes -15 s/+15 s/lecture routées vers le même chemin que l'app.

Rendu : Fond sombre 60 %, avatar 44 dp, texte blanc, barre de progression fine à l'accent, trois boutons ronds 40 dp (retour 15, lecture/pause, avance 15), puce langue avec icône translate en caption.

Transposition Android : Live Activity de lecture + Now Playing -> MediaSession + notification MediaStyle avec service de premier plan mediaPlayback (cela couvre aussi l'écran verrouillé et Bluetooth).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/LiveActivity/VoicePlaybackActivityLaw.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/VoicePlaybackLiveActivityCoordinator.swift`
- `apps/ios/MeeshyWidgets/VoicePlaybackActivityAttributes.swift`
- `apps/ios/MeeshyWidgets/VoicePlaybackLiveActivity.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Mon enregistrement vocal continue et reste contrôlable quand je quitte l'app

`ext-ongoing-voice-recording` · Android : **absente** · P1 · effort M

Live Activity d'enregistrement : icône micro rouge, statut « Enregistrement », titre de la conversation, chronomètre déroulé depuis l'heure de début, niveau sonore quantifié (0 à 4) mis à jour au plus une fois par seconde, boutons Arrêter (garde et envoie) et Abandonner (jette). Jamais d'enregistrement fantôme : l'activité n'existe que tant que l'enregistreur enregistre et se ferme immédiatement à l'arrêt, l'envoi, l'abandon ou la vue démontée. Aucune limite de durée affichée.

Écarts :
- Service de premier plan de type microphone pendant l'enregistrement : sans lui, Android 14+ coupe la capture quand l'app passe en arrière-plan.
- Notification en cours : icône micro rouge F87171, libellé « Enregistrement », nom de la conversation, chronomètre natif depuis startedAt, niveau quantifié 0..4 (moyenne des dernières mesures) mis à jour max 1 fois par seconde.
- Actions Arrêter et Abandonner routées vers l'enregistreur du composeur via la commande commune.
- Fermeture immédiate et garantie à l'arrêt, l'envoi, l'abandon, la destruction de l'écran ou la mort du service ; état final avec coche.
- Port de VoiceRecordingActivityLaw (levelUpdateInterval 1 s, conversation changée = nouvelle activité) et tests JVM.

Rendu : Fond sombre 60 %, pastille micro rouge, chrono monospacé à droite, niveau en barres ou jauge à 5 crans, boutons Arrêter (plein) et Jeter (contour) de 40 dp.

Transposition Android : Live Activity d'enregistrement -> service de premier plan microphone + notification en cours avec chronomètre et deux actions.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/LiveActivity/VoiceRecordingActivityLaw.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/VoiceRecordingLiveActivityCoordinator.swift`
- `apps/ios/MeeshyWidgets/VoiceRecordingActivityAttributes.swift`
- `apps/ios/MeeshyWidgets/VoiceRecordingLiveActivity.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Un message chiffré de bout en bout s'affiche déchiffré dans la notification, ou en emoji neutre

`ext-push-e2ee-decrypt` · Android : **absente** · P1 · effort M

L'extension déchiffre le corps du push avec la clé de session de l'expéditeur lue dans le trousseau partagé (AES-GCM via CryptoKit), en essayant d'abord le compte namespacé {activeUserId}.me.meeshy.e2ee.session.{senderId} puis l'ancien nom sans espace de noms, avec le groupe d'accès partagé épinglé. En cas d'échec, le corps devient le libellé localisé de la clé notificationLocKey (jamais le clair). Les corps protégés du serveur sont des emoji déjà localisés.

Écarts :
- Le module :core:crypto n'est qu'un placeholder : pas d'E2EE sur Android (E2EE optionnel, activé par conversation ; sans clés, rien en clair).
- En attendant : afficher le libellé localisé de notificationLocKey pour un push chiffré non déchiffrable (jamais d'aperçu en clair) et le corps emoji protégé du serveur.
- Quand le module crypto existera : déchiffrement du corps depuis le Keystore (clé de session par expéditeur, ordre d'essai namespacé puis hérité) avec test de la politique de recherche de clé.
- Aucune clé ni texte déchiffré ne doit toucher les journaux.

Rendu : Corps clair pour un message déchiffré ; sinon libellé neutre localisé avec emoji de chiffrement.

Transposition Android : Trousseau partagé + CryptoKit -> Android Keystore + AES-GCM (JCA), clés par expéditeur et par compte actif.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift`

</details>

Android existant : `apps/android/core/crypto/src/main/kotlin/me/meeshy/core/crypto/Module.kt`

### Ouvrir une notification affiche tout de suite le message, sans attendre le réseau

`ext-push-local-first-prefetch` · Android : **absente** · P1 · effort M

Hors du chemin d'affichage, l'extension précharge ce que l'app peindra au tap : elle récupère le message référencé par le push via l'API REST et écrit un blob compact dans l'App Group (fusionné dans le cache GRDB avant la première peinture), et pré-enregistre la bulle dans la base du compte DESTINATAIRE en INSERT (jamais UPSERT) pour un message qui ARRIVE uniquement (une réaction ne doit pas vider le texte du message réagi). Elle lit aussi les détails de conversation depuis l'instantané local (titre, renommage local, épingle, muet, verrou, catégorie utilisateur, couleur d'accent) sans requête serveur. La bulle porte le contenu original et sa langue d'origine, jamais la traduction.

Écarts :
- Sur réception d'un push de message (data-only), précharger le message via l'API et l'insérer dans Room (INSERT sans remplacement) pour qu'il soit déjà là quand l'utilisateur ouvre la notification.
- Garde de type : seul un push dont le messageId désigne un message qui arrive est pré-enregistré (jamais une réaction, qui porte l'id du message réagi) ; une ligne canonique déjà présente n'est jamais remplacée.
- Base du compte destinataire (compte actif), aucune écriture sans utilisateur connecté.
- Contenu ORIGINAL et langue d'origine dans la bulle, jamais la traduction ; horloge du serveur (messageCreatedAt) plutôt que celle de l'appareil.
- Détails de conversation locaux first (titre, renommage local, épingle, muet, verrou, catégorie) lus dans Room, pas de requête.
- Prefetch des données sociales (post, commentaire) et accusé de réception de livraison.
- Résilience : tout échec est avalé (l'app récupérera au réveil), jamais de crash par chemin de base absent.

Rendu : Aucun visuel direct : le gain est la bulle déjà peinte à l'ouverture (cache-first).

Transposition Android : NSE + GRDB App Group -> même processus : écriture Room dans le service FCM, sans fichier de transit.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/MeeshyNotificationExtension/NSEDataSync.swift`
- `apps/ios/MeeshyNotificationExtension/NSEMessagePrePersister.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`

### Une notification montre la photo de l'expéditeur, l'image ou le vocal du message

`ext-push-rich-media-attachments` · Android : **absente** · P1 · effort M

L'extension télécharge sur disque l'avatar de l'expéditeur et le média du message pour les attacher à la bannière. Une politique en deux étages décide du droit d'attacher : pré-vol (type et taille DÉCLARÉS) puis après-vol (taille MESURÉE), seulement images et audio sous un plafond (jetsam à ~24 Mo), jamais une vidéo (vignette seulement) ni un document. L'origine API vient d'une allowlist (production, staging, localhost), jamais de la charge push (sinon le JWT serait exfiltrable). Les requêtes portent les mêmes en-têtes d'identité client que l'app (sans eux, le serveur sert la sentinelle « Mets à jour Meeshy »). Un message protégé ne joint rien : second verrou sur la clé de localisation du placeholder.

Écarts :
- Grande icône ronde de l'expéditeur (setLargeIcon) et image du message en BigPictureStyle ; aujourd'hui aucune image, seulement l'icône système.
- Politique de pièce jointe pure : pré-vol sur mime + taille déclarés, après-vol sur la taille mesurée du fichier téléchargé sur disque, images et audio uniquement, plafond de ~8 Mio ; vidéo = vignette uniquement.
- Message protégé (éphémère, vue unique, flouté, chiffré) : rien en pièce jointe, second verrou sur la clé de localisation du placeholder.
- Origine API de confiance par allowlist (prod, staging, localhost), jamais l'URL de la charge push ; requêtes OkHttp avec en-têtes d'identité client (X-Canvas-Caps…) et jeton lu du stockage sécurisé.
- Budget de temps restant, téléchargement annulable, nettoyage des fichiers temporaires si la livraison a déjà eu lieu.
- Variante audio : la piste qui voyage est élue par la langue du texte servi (Prisme), jamais par une descente indépendante.

Rendu : Avatar rond à gauche de la bannière, image large sous le texte (BigPicture), pas de vignette pour la vidéo ; l'aperçu audio affiche le libellé « Message vocal · 0:12 ».

Transposition Android : UNNotificationAttachment -> setLargeIcon + BigPictureStyle ; téléchargement OkHttp vers le cache de l'app.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/MeeshyNotificationExtension/NSEEnrichmentPlan.swift`
- `apps/ios/MeeshyNotificationExtension/NSEAttachmentPolicy.swift`
- `apps/ios/MeeshyNotificationExtension/NSETrustedOrigin.swift`
- `apps/ios/MeeshyNotificationExtension/NSEAPIRequest.swift`
- `apps/ios/MeeshyNotificationExtension/NotificationService+Enrichment.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Partager l'écran de mon téléphone dans un appel, même depuis une autre app

`ext-screen-share-broadcast` · Android : **absente** · P1 · effort M

L'extension de diffusion ReplayKit capture l'écran système et envoie chaque trame retenue (cadence plafonnée à ~15 images/s, JPEG réduit à 1280 px, orientation déclarée pour que le récepteur la rende) à l'app par un socket Unix dans le conteneur partagé, avec un format de trame (magie MSSF, en-tête, charge utile limitée à 8 Mo, décodeur à flux resynchronisation = coupure) et des notifications Darwin (commencé, fini, arrête) pour piloter les deux processus. La contre-pression vient de processSampleBuffer. Quand l'app ne lit plus (appel fini, app tuée), la diffusion s'arrête.

Écarts :
- Capture d'écran via MediaProjection : demande de consentement système, service de premier plan de type mediaProjection, piste vidéo WebRTC (ScreenCapturerAndroid) ajoutée à l'appel ; aucune API de partage d'écran n'existe côté Android.
- Contrôles d'appel « Partager l'écran » / « Arrêter le partage » (parité avec CallScreenShareControls iOS) et indicateur de partage actif dans la notification d'appel.
- Débit : cadence plafonnée (~15 fps) et réduction à 1280 px de large, orientation propre à l'appareil (Android tourne les pixels : pas de métadonnée d'orientation à transmettre).
- Arrêt propre à la fin de l'appel ou quand l'utilisateur révoque la projection (callback onStop) ; Android 14 exige un consentement à chaque session.
- Le protocole Unix socket / trames MSSF / notifications Darwin n'a pas d'objet sur Android (même processus) : ne pas le porter.

Rendu : Bouton de partage d'écran dans la barre de contrôle d'appel, indicateur rouge de partage actif, boîte de consentement système.

Transposition Android : Broadcast Upload Extension (ReplayKit) + socket Unix + notifications Darwin -> MediaProjection + service de premier plan mediaProjection + WebRTC ScreenCapturerAndroid (pas d'IPC).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/MeeshyBroadcastExtension/SampleHandler.swift`
- `apps/ios/MeeshyBroadcastExtension/ScreenShareUnixSocket.swift`
- `apps/ios/MeeshyBroadcastExtension/ScreenShareWire.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### Publier, composer, enregistrer, copier ou partager hors de Meeshy depuis l'écran de partage

`ext-share-actions-zone` · Android : **absente** · P1 · effort M

Zone 2 « ce qu'on peut en faire » : rangée de publications (Story, Post, Réel) cochables comme des destinataires, puce « Modifier dans le studio », puis outils Enregistrer, Copier le lien, Copier le texte, Imager, Partager hors de Meeshy. Une action interdite n'apparaît pas ; une ligne grise avec icône d'information dit pourquoi (priorité : flamme, flouté, chiffré, cite un contenu protégé, trop de médias, photo seule pas un réel). Publier une capture d'écran faite dans l'app demande confirmation.

Écarts :
- Rangée de puces de publication (Story, Post, Réel) toggle, coche pleine à l'accent quand active, désactivées après envoi, avec confirmation des captures d'écran.
- Puce « Modifier dans le studio » (contour accent, icône baguette) qui ferme l'écran et ouvre le composer avec la pièce.
- Outils offerts selon le plan ET l'hôte : Enregistrer (galerie/Fichiers), Copier le lien, Copier le texte (toast « Copié »), Imager, Partager hors de Meeshy (chooser ACTION_SEND).
- Ligne explicative grise (une seule, la plus parlante) pour ce qui est retenu.
- Règle de réel (qualifiesAsReel) et message « photo seule n'est pas un réel ».

Rendu : Puces capsule hauteur 44 dp, police subhead semi-gras, remplies à l'accent (active) ou teinte 12 % (inactive) ; puces défilantes horizontalement ; ligne info footnote muted sous les puces.

Transposition Android : ShareLink SwiftUI -> Intent.createChooser(ACTION_SEND) ; UIPasteboard -> ClipboardManager ; Enregistrer -> MediaStore / SAF.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareSheetView+Actions.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileShareSheet.kt`

### Voir exactement ce qui va partir, le réordonner ou en retirer une partie

`ext-share-content-zone` · Android : **absente** · P1 · effort M

Zone 1 « Ce qui part », dans l'ordre d'envoi. Un message, plusieurs messages (« N conservés sur M »), UNE pièce (« Pièce i sur n », bouton « Tout le message » qui élargit sans fermer), un texte, un lien, une carte (story, post, réel, profil, invitation) ou ce qu'une autre app remet (fichiers copiés et texte joint). Les messages protégés retirés restent visibles, atténués, avec leur motif. Pour les fichiers venus d'ailleurs : vignettes réduites numérotées, croix pour retirer, Avancer/Reculer (actions d'accessibilité), « Retirer les N derniers » quand les plafonds sont dépassés, marqueur « dépasse la limite », et explication de ce qui n'a pas pu être copié.

Écarts :
- Sum type ShareSubject (messages, piece, text, link, card, incoming) et projection vers le plan : l'écran Android ne connaît que du texte et une pièce.
- Aperçu de message : texte, sinon Sticker, sinon type de pièce (Photo, Vidéo, Audio, Fichier) et nombre « Photo · 3 ».
- En-tête dynamique « N conservés sur M », croix par message, messages retirés atténués avec motif (vue unique, après lecture, indisponible) et note « Les autres partent ».
- Pièce unique : « Pièce i sur n » et bouton « Tout le message ».
- Bande des fichiers entrants : vignettes décodées réduites (160 px) numérotées, retirer, Avancer/Reculer en actions d'accessibilité (TalkBack customActions), « Retirer les N derniers » (> 20 fichiers ou 500 Mo), marqueur « dépasse la limite ».
- Shortfalls expliqués : pièces non préparées, au-delà de 500 Mo, chemin de fichier seul remis par l'app source.
- Texte joint = corps du message ; un texte qui n'est qu'une adresse web part comme un lien avec aperçu et « Copier le lien ».

Rendu : En-tête footnote semi-gras muted, bouton texte accent ou erreur 44 dp ; vignettes carrées arrondies avec pastille d'index ; élément retiré à 40 % d'opacité avec motif en footnote ; animation spring (réponse 0,3, amortissement 0,8).

Transposition Android : LazyVStack + animations spring SwiftUI -> LazyColumn avec animateItem ; actions d'accessibilité -> semantics customActions.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareContentZone.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareIncomingStrip.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSubject.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`

### Mes conversations récentes apparaissent en tête de la feuille de partage du système

`ext-share-direct-targets` · Android : **absente** · P1 · effort M

Sur iOS, l'app dépose dans l'App Group un cliché versionné et propriétaire (conversations <= 100, personnes <= 300, userId du compte, date) que l'extension de partage lit AVANT toute requête (cache d'abord) ; à défaut elle retombe sur les conversations récentes du widget (ShareConversationStore), puis sur le serveur en silence. Un cliché d'un autre compte ou d'une autre version n'est jamais servi.

Écarts :
- Publier des raccourcis de partage long-lived (ShortcutInfoCompat + androidx.sharetarget, balise share-target dans shortcuts.xml, catégorie de partage Meeshy) pour les conversations récentes et les amis : ils apparaissent en tête de la feuille de partage système avec avatar rond.
- Mettre à jour la liste à chaque changement de la liste de conversations (anti-rebond) et la vider à la déconnexion et au changement de compte (le propriétaire du cliché).
- Bornes : respecter getMaxShortcutCountPerActivity et un plafond de personnes ; icône avatar adaptative.
- L'activité de partage résout l'identifiant de raccourci Intent.EXTRA_SHORTCUT_ID en conversation présélectionnée (équivalent de preselectedConversationIds).

Rendu : Avatars ronds de conversation avec nom court dans la rangée de partage système ; icône de marque en repli.

Transposition Android : Cliché App Group + INSendMessageIntent -> Sharing Shortcuts (Direct Share) via ShortcutManagerCompat ; pas d'App Group (même processus).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareDirectorySnapshot.swift`
- `apps/ios/MeeshyShareExtension/ShareConversationStore.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/shortcuts/DynamicShortcutsPublisher.kt`

### Un secret copié (clé 2FA, codes de récupération) disparaît du presse-papiers au bout de 30 secondes

`ext-expiring-clipboard` · Android : **absente** · P2 · effort S

ExpiringClipboard écrit le secret en texte brut UTF-8 avec une date d'expiration de 30 secondes et la mention localOnly (pas de presse-papiers universel vers les autres appareils). Utilisé par la mise en place de l'authentification à deux facteurs : copie de la clé secrète et des codes de récupération.

Écarts :
- Marquer le clip comme sensible (ClipDescription.EXTRA_IS_SENSITIVE sur Android 13+) pour masquer l'aperçu.
- Effacer le presse-papiers 30 s après la copie (clearPrimaryClip sur API 28+, sinon remplacer par un clip vide) via un job planifié qui ne supprime que si le contenu est toujours le secret.
- Brancher la copie de la clé secrète et des codes de récupération de TwoFactorScreen sur ce service ; toast court « Copié, effacé dans 30 s ».
- Test : le clip est effacé après le délai, pas si l'utilisateur a copié autre chose entretemps.

Rendu : Toast discret ou bandeau « Copié, sera effacé dans 30 s ».

Transposition Android : UIPasteboard expirationDate/localOnly -> ClipDescription.EXTRA_IS_SENSITIVE + effacement planifié (pas d'expiration native).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ExpiringClipboard.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/TwoFactorScreen.kt`

### Imager toute la discussion qui mène à un message en une seule carte

`ext-imagine-discussion` · Android : **absente** · P2 · effort M

Depuis « Transférer », la discussion qui MÈNE au message choisi devient une carte Imagine : une ligne par message (« Auteur : texte »), titrée du nom de la conversation, avec les médias peignables. Périmètre borné pour la mémoire : les derniers messages jusqu'au message choisi compris et un nombre maximal de médias les plus récents. Mêmes gardes que pour un message : un message protégé (vue unique, flouté, supprimé, avis système) ou qui disparaît (flamme, même vivante) n'entre pas ; une réponse qui cite un contenu protégé ferme la discussion entière. Textes servis par le Prisme. Le bouton n'est pas rendu s'il n'y a rien à peindre.

Écarts :
- Fenêtre de discussion : les maxMessages derniers messages jusqu'au message choisi (jamais ce qui le suit), au plus maxMedia médias récents.
- Gardes de sortie : message protégé, supprimé, avis système, flamme à durée ou après lecture exclus (texte et médias) ; réponse qui cite un contenu protégé => aucune carte.
- Sujet de la carte : une ligne par message « Auteur : texte » (texte servi par le Prisme, sinon l'original ; message sans mots = ce que ses médias sont), titre = nom de la conversation, auteurs de médias.
- Offre conditionnelle : le bouton « Imager la discussion » n'est rendu que si la fenêtre a quelque chose à peindre.
- Porte d'entrée depuis l'écran de transfert (zone d'actions).

Rendu : Carte avec titre de conversation, lignes « Auteur : texte », médias au bord ; mêmes templates qu'un message seul.

Transposition Android : Pur Swift -> Kotlin pur dans :core:model ou feature:chat, sans dépendance Android.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardDiscussion.swift`

</details>

### Imager un message ou un commentaire depuis n'importe quel menu d'action

`ext-imagine-entry-points` · Android : **absente** · P2 · effort S

L'action « Imager » (nom unique depuis la directive 2026-09-29, l'atelier s'appelle Imagine) est présente partout où un message se commente : liste verticale, overlay, menu natif, menu du double tap (le chevron déplie Composer et Imager), feuille « Plus… » et menu d'un commentaire. « Export rapide » n'existe que si un format par défaut est enregistré. La demande porte le texte que le Prisme sert au lecteur (ou l'original), ses médias, ceux du message cité, la carte de chaque langue où il existe, et pour un son sa piste SERVIE ; un commentaire de post emporte sa racine, un commentaire composé emporte le post en tête. Présentation par le contrôleur le plus haut après fermeture du menu (attente jusqu'à ~2 s).

Écarts :
- Ajouter l'action « Imager » (et « Export rapide » conditionnel) au menu d'action des messages, au menu de commentaire et à la feuille « Plus… ».
- Construire la requête d'export : texte servi par le Prisme ou original, médias, message cité, cartes par langue, piste audio SERVIE (bascule du drapeau, Prisme du lecteur), pseudo du lecteur pour le filigrane.
- Commentaires de post : racine citée, composition (mode, post en tête, réponses cochées).
- Présenter l'atelier une fois le menu refermé (une seule présentation à la fois).
- Refuser l'action pour un message protégé ou supprimé (loi de sortie).

Rendu : Entrée « Imager » avec icône d'image/sparkle, libellé identique partout, même place dans chaque menu.

Transposition Android : Menus contextuels iOS -> entrée de MessageActionMenu / bottom sheet ; présentation du contrôleur le plus haut -> navigation vers l'écran Compose plein écran.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportMenu.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportPresenter.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`

### Transformer un message en carte image, GIF ou vidéo, en touchant et pinçant l'aperçu

`ext-imagine-export-sheet` · Android : **absente** · P2 · effort L

L'atelier « Imagine » (miroir natif de la route web thread-export-sheet) choisit comment MONTRER un contenu existant : template, format d'image, disposition (Frame), médias, noms ou anonymat. L'aperçu EST le contrôle : chaque partie de la carte (en-tête, citation, liaison, réponse, médias, fond) se touche et ouvre l'onglet qui la règle ; pincer une zone règle son échelle (borne par la carte, aimantation, aperçu découpé pendant le geste, repeint à la vraie échelle au lever). Géométrie gauche-droite dans toutes les langues. La peinture tourne hors fil principal : l'aperçu précédent reste affiché pendant que le suivant se peint ; les médias se chargent derrière (couleurs d'attente puis repeinte).

Écarts :
- Ecran plein écran Imagine : carte peinte avec zones tactiles par partie (en-tête, citation, liaison, réponse, médias, fond) ; toucher une zone ouvre l'onglet correspondant du plateau.
- Geste de pincement par zone avec facteur relatif, borne de la partie (les médias s'arrêtent où le texte garde sa place minimale), aimantation aux échelles, aperçu découpé et mis à l'échelle pendant le geste, repeint au lever des doigts ; pas d'accessibilité au geste : ajuster par pas de cinq pour TalkBack.
- Peinture asynchrone hors du fil principal avec clé de peinture (choix de composition, langue, anonymat), double tampon : jamais de saut ni d'écran vide ; médias repeints quand les pixels arrivent.
- Réglages portés par la demande : visuel mis en avant (une seule / en fond), composition d'un commentaire de post, passage de l'audio/vidéo, pincement ; « Export rapide » enregistre le format par défaut dès la carte peinte.
- Moteur de rendu : dépend du moteur MessageCard (layout, templates 784, polices, liaisons, rendu Canvas) à porter en Kotlin pur + android.graphics ; géométrie toujours gauche-à-droite même en RTL.

Rendu : Carte centrée dans l'espace disponible (aspect du format), plateau en bas qui prend sa hauteur idéale, fonds de palette en dégradé, bouton Fermer/Enregistrer/Partager en verre adaptatif, zones de touche avec tolérance de doigt.

Transposition Android : SwiftUI + Liquid Glass -> Compose Canvas / Bitmap rendu hors thread ; matière de verre -> surfaces Material 3 translucides.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet+Stage.swift`

</details>

### Parcourir et chercher parmi 784 styles de carte, peints sur mon propre message

`ext-imagine-gallery` · Android : **absente** · P2 · effort M

Galerie de tous les templates, chacun peint sur le message de l'utilisateur (vraie vignette), les plus utilisés d'abord. La recherche utilise la recherche système, accepte les mots de l'interface (« plume sombre »), ignore les accents, propose en suggestions d'un toucher les noms de polices et de liaisons et filtre le ton (sombre, clair) sans le taper. Une vignette coûte une peinture : demandée à l'entrée à l'écran, deux à la fois (la plus récente demande d'abord), jamais sur le fil principal, avec cache borné dont la clé nomme le template et l'état de la carte (langue, titre, anonymat). En attendant, le fond de la palette et un « Aa » dans sa police.

Écarts :
- Grille paresseuse (LazyVerticalGrid) de vignettes réelles peintes sur le message, tri par usage décroissant, enregistrement du compte d'usage à chaque carte sauvegardée.
- Recherche : insensible aux accents et à la casse, sur les mots de l'interface, suggestions de polices/liaisons, filtre de ton clair/sombre.
- Pipeline de vignettes borné : 2 peintures concurrentes, la plus récente demande d'abord, annulation à la sortie d'écran, cache LruCache borné avec clé template + état de carte.
- Vignette d'attente : dégradé de la palette + « Aa » dans la police du template ; jamais de carré vide ni de saut.
- Carte entière contenue dans la tuile (un recadrage par le haut perdrait la liaison au milieu).

Rendu : Tuiles de ratio de la carte, coins arrondis, vignette peinte, sélection à contour accent ; barre de recherche en haut avec chips de suggestions.

Transposition Android : LazyVGrid + NSCache -> LazyVerticalGrid + LruCache/Coil memory cache ; barre de recherche iOS 26 -> SearchBar Material 3.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportGallery.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardThumbnails.swift`

</details>

### Choisir le passage d'un vocal ou d'une vidéo à exporter en le faisant glisser sur l'onde

`ext-imagine-media-excerpt` · Android : **absente** · P2 · effort M

L'atelier charge les pixels des médias visuels (photo, première image d'une vidéo) et les sons par adresse de piste (une langue d'export qui sert une autre piste en lit une autre) avec leur onde réelle et leur durée lue dans le fichier. Les médias en échec sont dits et un Réessayer relit seulement ce qui manque ; une vidéo n'est jamais muette. La bande du passage montre l'onde du son entier (une règle pour une vidéo) et la fenêtre de durée choisie : elle suit le doigt image par image (annulable), un simple toucher la centre, la valeur ne se repeint qu'au lever du doigt ; TalkBack la déplace par pas de cinq secondes. Temps de gauche à droite dans toutes les langues.

Écarts :
- Chargeur de médias : pixels des visuels, onde réelle et durée des sons par adresse de piste, rapport d'aspect lu sur les pixels (jamais un carré par défaut pour les stickers), fichier local du son peint.
- Gestion des échecs : liste des médias non arrivés, message dédié, Réessayer relit les manquants ; en vidéo, un son dont le fichier ne se lit pas est en échec (jamais une vidéo muette).
- Bande de passage : onde du son entier, fenêtre glissable image par image, toucher = centrer, repeinture au lever du doigt, sémantique TalkBack par pas de 5 s ; géométrie LTR même en arabe.
- Bornes : fenêtre contenue dans la durée, durées proposées par le format.
- Mémoire : décodage à taille d'affichage, pas de bitmap pleine taille.

Rendu : Onde fine à l'accent, fenêtre sélectionnée en surbrillance avec poignées, libellé de durée, déroulé de gauche à droite.

Transposition Android : AVAsset/AVAudioFile -> MediaMetadataRetriever + décodage audio MediaCodec ; geste de glissement -> pointerInput horizontalDrag.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardMediaLoader.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardExcerptStrip.swift`

</details>

### Enregistrer ou partager ma carte en image, en GIF animé ou en vidéo avec la voix

`ext-imagine-output-save-share` · Android : **absente** · P2 · effort L

Les sorties offertes dépendent du contenu : une vidéo s'anime en GIF comme en vidéo, un son en vidéo seulement, le reste en image fixe ; le choix se fait avant d'enregistrer ou de partager. Une carte animée est peinte image par image par le même moteur : la vidéo jointe se joue dans son cadre au même instant de l'extrait, un son fait avancer sa représentation au temps réel (barres jouées, minuteur, spectre, phrase surlignée) et sa piste, coupée à l'extrait, est posée sous la vidéo. GIF par ImageIO, vidéo H.264 par AVAssetWriter puis assemblage avec la piste ; annulation à l'image suivante, progression 0 à 1. L'image part comme image (jamais comme chemin de fichier), l'animation comme fichier. Issues : galerie, partagé, annulé, refusé, échec ; chaque carte enregistrée compte pour son template.

Écarts :
- Choix de sortie selon le contenu (image fixe, GIF, vidéo) avant l'enregistrement ou le partage.
- Encodeur vidéo H.264 image par image (MediaCodec + MediaMuxer) avec piste audio coupée à l'extrait, GIF par un encodeur LZW ou Glide-gifencoder, annulation coopérative et progression.
- Rendu image par image avec l'image vidéo de l'instant de l'extrait (MediaMetadataRetriever / décodeur) et la progression du son (barres, minuteur, spectre, phrase surlignée).
- Partage : image fixe comme contenu image (ClipData image/png via FileProvider), GIF/vidéo comme fichier pour rester animé ; enregistrement dans MediaStore (galerie) avec gestion du refus de permission.
- Une vidéo ne part jamais muette : si le son peint n'est pas lu, avis et Réessayer ; un son encore en chemin retient la sortie.
- Compteur d'usage par template à chaque enregistrement réussi.
- Exécution hors fil principal, annulable ; mémoire bornée (une image à la fois).

Rendu : Boutons Enregistrer et Partager en verre adaptatif, barre de progression pendant l'encodage, toasts « Animation enregistrée », « Carte enregistrée », message d'échec explicite.

Transposition Android : AVAssetWriter / ImageIO -> MediaCodec + MediaMuxer / encodeur GIF ; UIActivityViewController -> Intent.createChooser avec FileProvider.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet+Output.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardSharePayload.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardMotionExporter.swift`

</details>

### Régler la carte d'export par onglets : styles, format, disposition, fond, police, médias, langue

`ext-imagine-tray` · Android : **absente** · P2 · effort L

Plateau sous l'aperçu qui n'affiche qu'UN panneau à la fois : styles tout faits, format de l'image, disposition (Frame), fond, police, liaison, médias, détails, langue. Les onglets offerts dépendent du contenu : Médias seulement s'il y a un média, Langue seulement avec une seconde langue ; un réglage n'existe que s'il change la carte (orientation d'en-tête, place des noms, emplacement/agencement des médias, visuel mis en avant, auteur du média, représentation du son). Libellés issus du catalogue partagé avec le web (clés catalog-export-card-langue). Les tuiles ne sont pas en verre (pas de verre sur du verre) : teintées d'encre, l'élue contourne.

Écarts :
- Plateau à onglets (un panneau à la fois) avec rangées défilantes horizontales ; hauteur idéale (l'aperçu cède la place, pas les boutons).
- Lois pures d'offre (MessageCardTrayOffer) : orientations d'en-tête, places des noms, emplacements et agencements des médias (au-dessus, dessous, gauche, droite, fond ; agencement dès deux visuels et jamais en fond), choix du visuel mis en avant, auteur du média, représentations du son.
- Onglets offerts selon le contenu (hasMedia, nombre de langues) et onglet ouvert par la partie touchée.
- Passage et durée pour un son ou une vidéo (panneau dédié), anonymat de la partie touchée, pseudo au lieu du nom quand les pseudos sont connus.
- Libellés : catalogue d'export partagé avec le web (clés catalog-export-card-*) en sept langues, étiquettes de parties, templates et polices ; message « Un média n'a pas pu se charger » avec Réessayer.
- Moteur de rendu et templates : voir moteur MessageCard (autre partie).

Rendu : Tuiles carrées teintées d'encre, contour de sélection à l'accent, pastilles 'pill' pour les choix courts, une seule rangée défilante par panneau ; texte en police relative.

Transposition Android : Plateau Liquid Glass -> BottomSheet Compose non modal avec tuiles teintées et onglets Material 3.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportTray.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportTray+Imagine.swift`
- `apps/ios/Meeshy/Features/Main/Export/MessageCardExportText.swift`

</details>

### Déployer une notification pour écouter un vocal, voir une position ou une carte de contact

`ext-notification-expanded-content` · Android : **absente** · P2 · effort L

L'extension de contenu rend la notification déployée (appui long, écran verrouillé, centre de notifications) : un lecteur pour un vocal (pastille de lecture, ligne de progression qu'on glisse, pastille de vitesse 1x puis 1,5x puis 2x, lecture du fichier déjà attaché ou de la piste élue par le Prisme, durée déclarée affichée avant la mesure), une carte INTERACTIVE épinglée pour une position (on se déplace, on zoome), une fiche de contact, et pour un message éphémère un décompte vivant jusqu'à l'échéance. Rien pour un message protégé (hauteur nulle, seul le placeholder s'affiche). Le texte du corps (transcription servie) reste sous la vue.

Écarts :
- Notification développée pour un vocal : lecture/pause et vitesse (1x, 1,5x, 2x) directement dans la notification via actions + MediaSession ou RemoteViews personnalisées (setCustomBigContentView), fichier attaché prioritaire sinon piste distante.
- Barre de progression qui se glisse (RemoteViews limitées : proposer saut -15/+15 si le glissement n'est pas possible) et durée déclarée affichée avant la mesure.
- Position : image de carte statique + action « Ouvrir dans les cartes » (Android ne permet pas de carte interactive dans une notification).
- Fiche de contact : nom, téléphone, action « Ajouter aux contacts » (Intent ACTION_INSERT).
- Décompte vivant d'éphémère (Chronometer countdown) jusqu'à l'échéance, plafond de sommeil de 7 jours, sans contenu.
- Aucun rendu pour un message protégé (seul le placeholder) ; garde d'URL de piste de confiance.

Rendu : Rangée audio : pastille de lecture, ligne de progression centrée, pastille de vitesse, temps sous la ligne ; carte de position 16:9 ; fiche contact avec avatar ; décompte avec flamme.

Transposition Android : UNNotificationContentExtension -> notification développée (BigPicture/BigText, custom content view, actions MediaStyle) ; pas de vues arbitraires ni de carte interactive.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/MeeshyNotificationContentExtension/NotificationAudioPlayer.swift`
- `apps/ios/MeeshyNotificationContentExtension/NotificationExpandedContent.swift`
- `apps/ios/MeeshyNotificationContentExtension/NotificationExpandedViews.swift`
- `apps/ios/MeeshyNotificationContentExtension/NotificationViewController.swift`

</details>

### Je vois l'avancement d'un envoi long (média, story, publication) quand je quitte l'app

`ext-ongoing-outbox-progress` · Android : **absente** · P2 · effort M

Live Activity d'envoi : seuls les envois LONGS (story, message avec pièce jointe ou média, createPost/createReel/createStatus avec pièces) en méritent une ; texte, réaction et lecture restent à la pastille. Phases : envoi, en attente du réseau, envoyé, échec ; nombre restant, libellé de la tête de file et symbole. Elle se ferme sur l'issue : vert avec coche, ou rouge si un envoi suivi a échoué (une ligne échouée la veille ne colore pas l'envoi réussi). Ne double pas la pastille : elle ne s'affiche qu'une fois l'app quittée.

Écarts :
- Notification de progression alimentée par le flux de la file d'envoi : phases sending / waitingForNetwork / sent / failed, nombre restant, libellé de la tête de file + icône.
- Port de OutboxActivityLaw : envoi long = story ou message avec pièces ou createPost/createReel/createStatus avec pièces ; ensemble d'identifiants suivis et échoués pour décider de l'issue.
- Exécution du flush en travail promu (setForeground avec ForegroundInfo de type dataSync, ou job de transfert de données initié par l'utilisateur sur Android 14+) pour que l'envoi survive à la mise en arrière-plan.
- Ne s'affiche qu'en arrière-plan (la pastille in-app parle au premier plan) ; hors ligne = « En attente du réseau » ; issue verte ou rouge puis retrait.
- Déclencheur de recette en build debug (équivalent de la notification Darwin) pour injecter un envoi factice.

Rendu : Fond sombre 55 %, symbole de l'envoi (image, vidéo, story), libellé de la tête de file, compteur restant en trailing, coche verte à l'issue, croix rouge en échec ; compact = symbole + compteur.

Transposition Android : Live Activity d'envoi -> ForegroundInfo du OutboxFlushWorker (notification de progression) ; sinon notification ordinaire mise à jour.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/LiveActivity/OutboxActivityLaw.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/OutboxLiveActivityCoordinator.swift`
- `apps/ios/MeeshyWidgets/OutboxActivityAttributes.swift`
- `apps/ios/MeeshyWidgets/OutboxLiveActivity.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`

### La notification d'un message éphémère disparaît à l'heure où le message s'efface

`ext-push-ephemeral-expiry` · Android : **absente** · P2 · effort S

Pour un message éphémère, l'extension calcule l'ÉCHÉANCE (une heure ne se périme pas, une durée figée si) et la grave dans le userInfo ; à chaque push, un balayage retire les bannières livrées dont l'échéance est passée (l'extension s'exécute à chaque push, c'est l'occasion la plus fréquente). Dans la notification déployée, un décompte vivant bat à la seconde jusqu'à l'échéance, sans jamais montrer le contenu du message.

Écarts :
- Poser setTimeoutAfter(échéance) sur la bannière d'un message éphémère pour qu'Android la retire à l'heure où le message disparaît.
- Graver l'échéance dans les extras et balayer les bannières périmées à chaque push et au démarrage de l'app.
- Corps toujours en placeholder protégé, jamais le contenu.

Rendu : Bannière avec flamme et corps placeholder protégé.

Transposition Android : Balayage UNUserNotificationCenter -> NotificationCompat.Builder.setTimeoutAfter + balayage des notifications actives.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationRevocation.kt`

### Une notification de position, de contact ou d'invitation montre déjà le détail

`ext-push-message-detail` · Android : **absente** · P2 · effort M

Le détail d'un message s'affiche sur l'écran verrouillé (#8858) : carte épinglée pour une position (instantané MapKit 320x180 pt en PNG, délai borné par le budget restant et jamais au-delà de 8 s, échec silencieux), vignette d'une vidéo (jamais le fichier), corps détaillé d'une carte de visite, d'une invitation ou d'un lien quand la passerelle ne l'a pas déjà composé (corps vide ou URL brute). Jamais pour un message qui déclare une protection. Libellés résolus dans la langue publiée par l'app.

Écarts :
- Instantané de carte d'une position partagée (image statique avec épingle) en BigPicture : délai borné par le budget restant (max 8 s), échec silencieux, mémoire < 1 Mo de pixels.
- Vignette d'une vidéo (jamais le fichier) via l'URL de vignette du serveur et son mime.
- Corps détaillé pour carte de visite, invitation et lien lorsque le corps serveur est vide ou réduit à une URL brute ; libellés localisés dans la langue de l'app.
- Second verrou de protection : aucun détail pour un message qui déclare une protection (éphémère, vue unique, flouté, chiffré).
- Tests purs de NotificationDetailPolicy (détail, catégories, délai) en JVM.

Rendu : Image 16:9 de la carte avec épingle (disque blanc + symbole rouge), corps détaillé en BigText, vignette de vidéo sans bouton de lecture.

Transposition Android : MKMapSnapshotter -> image statique de carte (tuile) rendue hors ligne ou URL de carte statique du serveur ; BigPictureStyle.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/MeeshyNotificationExtension/NotificationService+Detail.swift`
- `apps/ios/MeeshyNotificationExtension/NSELocationSnapshot.swift`
- `apps/ios/MeeshyNotificationExtension/NotificationDetailPolicy.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Publier une photo ou une vidéo reçue d'une autre app en story, post ou réel via le studio

`ext-share-compose-studio` · Android : **absente** · P2 · effort M

Entrée externe (vue 2a de la planche) : l'extension copie la pièce et dépose une fiche ; l'app la reprend et monte le composer sur l'origine .share. Le format se choisit là où la pièce arrive : un profil que la pièce ne peut pas tenir est montré désactivé avec sa raison, jamais masqué. La graine média est celle du composer (une vidéo reste un fichier, une image est décodée hors du fil principal à 1080 px max). Le publieur est durable (hors ligne, la ligne part en file). Le lien meeshy://compose-share?id= exige un identifiant, le balayage de réveil prend la plus ancienne fiche ; la fiche est supprimée à la fermeture du composer, publication ou abandon.

Écarts :
- Porte d'entrée « Modifier dans le studio » / publication d'une pièce externe qui monte le composer de story/post/réel avec une graine média (image décodée <= 1080 px hors du fil principal ; vidéo conservée comme fichier).
- Fiche de relais studio (liste de pièces, propriétaire) et consommateur avec double déclencheur (lien meeshy://compose-share?id= obligatoire + balayage de réveil) ; un lien sans identifiant n'est pas reconnu.
- Profils d'éventail [story, post] plus réel si la composition qualifie ; un profil inapte reste affiché désactivé avec sa raison.
- Publieur durable (hors ligne = file d'attente), pas un repost : aucune source à citer.
- Suppression de la fiche à la fermeture du composer (publication ou abandon), conservée sur erreur transitoire de lecture.

Rendu : Meuble du composer standard (planche 2a) avec choix du format au-dessus de la pièce, profils désactivés grisés avec raison en footnote.

Transposition Android : Fiche App Group + lien meeshy://compose-share -> Intent interne vers l'écran de composition avec URI d'entrée ; stockage Room pour la reprise.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/MeeshyShareExtension/ShareComposeHandoff.swift`
- `apps/ios/Meeshy/Features/Main/Services/ShareComposeHandoffConsumer.swift`
- `apps/ios/Meeshy/Features/Main/Services/ShareComposeLink.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ShareComposeDoor.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaUploader.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Voir qui a rejoint par mon lien : visites, arrivées, langues, derniers arrivés

`ext-sharelinks-arrivals` · Android : **absente** · P2 · effort M

Section « Arrivées » de la fiche (#7797) : tuiles visites, arrivées, arrivées sans compte, langues des arrivants et derniers arrivés ; trois états (chargement = tirets à la taille finale, indisponible = tirets et une ligne qui le dit, chargé). Un lien « Voir les N arrivées » ouvre la liste COMPLÈTE paginée (#7813), cache-first (peinte des arrivées récentes déjà connues, première page serveur ensuite, squelette seulement s'il n'y a rien), chargement de la suite près de la fin (une demande à la fois, sans doublon, génération pour ignorer les pages périmées), échec de page dit en pied de liste avec Réessayer. Ligne d'arrivée : initiales, nom, drapeau du pays, badge « sans compte », langue, ancienneté relative ; ni présence ni visage.

Écarts :
- Endpoints GET links/{linkId}/stats et GET links/{linkId}/arrivals?cursor&limit absents de LinkApi ; décodage défensif (compteur manquant = 0, liste manquante = vide, ligne illisible sautée, curseur vide = fin).
- Section de la fiche : tuiles visites / arrivées / arrivées sans compte, langues des arrivants (pays), derniers arrivés ; états chargement (tirets), indisponible (route absente 404 ou hors ligne) et chargé.
- Lien « Voir les N arrivées » seulement si la liste complète montre plus que la carte ; liste paginée cache-first avec pagination par curseur opaque, génération anti-périmé, une page à la fois, dédoublonnage par contenu affiché.
- Ligne d'arrivée : initiales, nom, drapeau du pays (ISO 3166-1 alpha-2), badge « sans compte », langue, ancienneté relative ; libellé a11y en une phrase.
- Pied de liste : échec de page dit sans retirer les lignes, bouton Réessayer qui reprend à l'endroit cassé ; squelette à la taille de la vraie ligne.

Rendu : Tuiles chiffrées en carte, répartition par langue en puces, lignes avec avatar d'initiales et drapeau emoji pays, badge « sans compte » discret, squelette gris de même hauteur.

Transposition Android : onAppear près de la fin -> LazyColumn avec détection d'avant-dernier élément (derivedStateOf) ; Paging 3 optionnel.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ShareLinkArrivalsListView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkArrivalsSection.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ShareLinkArrivalsListViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkArrivalStats.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkArrivalsPage.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/LinkApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkDetailPresentation.kt`

### Marquer une conversation comme lue directement depuis le widget

`ext-widget-mark-read-action` · Android : **absente** · P2 · effort M

Dans le widget moyen, chaque conversation non lue porte un bouton coche. L'intent s'exécute sans ouvrir l'app : il bascule en optimiste la ligne en lue, décrémente le compteur, empile l'identifiant dans pending_mark_read et recharge les timelines. Au prochain retour au premier plan, WidgetActionFlusher vide la file : appel REST markRead par conversation, signal de lecture local, mise à jour des notifications de la cloche ; un échec garde l'identifiant pour réessayer (idempotent côté serveur).

Écarts :
- Bouton coche (accessibilité « Marquer comme lu ») sur chaque ligne non lue du widget, via un ActionCallback Glance qui n'ouvre pas l'activité.
- Mise à jour optimiste du widget : ligne lue, compteur - 1, puis updateAll.
- File d'attente persistante des identifiants (DataStore ou Room) et vidage par un worker WorkManager expedited déclenché à l'action et au retour premier plan : markRead REST, signal de lecture local, mise à jour des notifications, retrait de la bannière correspondante.
- Échec réseau : garder les identifiants non servis pour la tentative suivante ; vider la file au logout.
- Test : double tap n'empile qu'une fois, ligne déjà lue inerte, échec partiel.

Rendu : Icône coche encerclée caption en couleur de marque, zone tactile 44 dp malgré la petite icône, alignée à droite de la ligne, retirée dès que la ligne est lue.

Transposition Android : AppIntent bouton interactif (iOS 17) -> Glance ActionCallback + WorkManager (la file App Group devient une table Room ou DataStore).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`
- `apps/ios/Meeshy/Features/Main/Services/WidgetActionFlusher.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/RecentConversationsWidget.kt`

### Voir combien de conversations m'attendent sans ouvrir l'app

`ext-widget-unread-count` · Android : **divergente** · P2 · effort S

Widget compact (systemSmall) sur fond dégradé de marque 6366F1 vers 4338CA : grand chiffre arrondi gras 36 pt, libellé « Non lus », ou « Tout est lu » quand il n'y a rien ; tap = ouvre la liste des non lus (meeshy://conversations/unread). iOS propose aussi les variantes écran verrouillé (cercle, rectangle, ligne). Le chiffre est le nombre de CONVERSATIONS non lues hors muettes, le même que le badge de l'icône et que l'aps.badge serveur (D-L1, #7236).

Écarts :
- Sémantique divergente : Android additionne le nombre de messages non lus de toutes les conversations (SUM(unreadCount), muettes comprises) alors qu'iOS compte les conversations non lues hors muettes ; aligner le DAO sur la règle du badge.
- Fond dégradé de marque diagonal (6366F1 vers 4338CA) à la place d'un aplat, chiffre arrondi gras 36 sp, libellés « Non lus » et « Tout est lu » localisés.
- Tap ouvre meeshy://conversations/unread (filtre non lus) : route absente du NavHost.
- Rafraîchissement dès que le compteur change (voir ext-widget-data-pipeline) : aujourd'hui figé jusqu'à la période système.
- Variantes écran verrouillé iOS (accessoryCircular/Rectangular/Inline) : sans équivalent Android 14 ; non portées, à consigner.

Rendu : Fond dégradé topLeading vers bottomTrailing, texte blanc ; chiffre centré 36 pt arrondi gras, libellé caption sous le chiffre ; état « Tout est lu » en headline. Coins arrondis système, padding 12.

Transposition Android : WidgetKit small + accessory -> GlanceAppWidget compact (les widgets d'écran verrouillé Android ne sont pas disponibles pour les tiers sur Android 14).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/UnreadCountWidget.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/UnreadWidgetPresentation.kt`, `apps/android/app/src/main/res/xml/unread_count_widget_info.xml`

### Mon appel en cours reste visible et pilotable (micro, raccrocher) hors de l'app

`ext-ongoing-call-notification` · Android : **partielle** · P0 · effort L

Live Activity d'appel : ouverte au décroché (un appel entrant qui sonne n'ouvre rien, l'écran CallKit le porte), elle montre l'interlocuteur (avatar publié, initiales sinon), le statut (Sonnerie, Connexion, Appel vocal/vidéo, En attente, Reconnexion, Appel terminé), le chronomètre de connexion (omis du compact si le système affiche déjà l'appel), l'état du micro, des boutons Couper/Réactiver le micro et Raccrocher, et la ligne de sous-titre en direct (locuteur, langue, texte traduit, 140 caractères). Fail-closed : un appel chiffré de bout en bout, ou de chiffrement inconnu, n'envoie aucun sous-titre vers l'écran verrouillé.

Écarts :
- Notification d'appel EN COURS (NotificationCompat.CallStyle.forOngoingCall) posée au décroché ou à l'émission : titre = interlocuteur, statut localisé par phase, chronomètre natif (setUsesChronometer + setWhen), actions Couper le micro/Réactiver et Raccrocher, avatar de l'interlocuteur, couleur d'accent ; seul l'appel entrant (sonnerie plein écran) est couvert aujourd'hui.
- Service de premier plan (types phoneCall, microphone, camera) pour que l'audio et la vidéo survivent à l'arrière-plan : le manifeste déclare les permissions FOREGROUND_SERVICE_MICROPHONE/CAMERA mais aucun service n'existe, donc Android 14+ coupe le micro et la caméra.
- Port Kotlin de CallActivityLaw (phase -> start/update/end), en JVM pur : appel entrant qui sonne n'ouvre rien, pas de répétition de la durée quand le système affiche déjà l'appel, libellés localisés, terminé = état final puis retrait différé.
- Sous-titres sur écran verrouillé seulement s'ils sont sûrs (E2EE ou chiffrement inconnu => aucun sous-titre), 140 caractères, locuteur + tag de langue.
- ConnectionService auto-géré + PhoneAccount : TelecomCallReporter ne fait que journaliser ; l'intégration système (Bluetooth, voiture, écran verrouillé) n'existe pas.
- Réessai d'ouverture au retour au premier plan, mise à jour anti-rebond 250 ms, publication de l'avatar à l'ouverture et retrait à la fermeture.

Rendu : Avatar 44 dp, titre = nom, sous-titre = statut, chrono à droite (title3 semi-gras), boutons ronds 40 dp (micro barré, raccrocher rouge), bande de sous-titre sur deux lignes (locuteur + tag de langue + texte), teinte de succès 34D399 pour la connexion.

Transposition Android : Live Activity d'appel + CallKit/PushKit -> notification CallStyle en cours + service de premier plan typé phoneCall + Telecom ConnectionService auto-géré + FCM data haute priorité pour l'entrant.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/LiveActivity/CallActivityLaw.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/CallLiveActivityCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/LiveActivity/CallActivityAvatarPublisher.swift`
- `apps/ios/MeeshyWidgets/CallActivityAttributes.swift`
- `apps/ios/MeeshyWidgets/CallLiveActivity.swift`
- `apps/ios/MeeshyWidgets/LiveActivityAvatarStore.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/TelecomCallReporter.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/TelecomCallPolicy.kt`

### Une notification arrive enrichie et respecte mes préférences même app fermée

`ext-push-background-delivery-and-gate` · Android : **partielle** · P0 · effort M

La Notification Service Extension s'exécute pour chaque push avant l'affichage : elle applique la catégorie d'actions selon le type, le badge du serveur, le regroupement par fil (conversation: / post:), les préférences de notification (miroir App Group : push, heures calmes, bascule par type, sons) en livraison passive quand elle ne peut pas supprimer, met à jour le compteur partagé de non lus, précharge le message ou les données sociales, accuse la réception, réécrit le corps (E2EE, vocal, détail) et retire les bannières périmées. Elle tient sous un budget de temps et de mémoire (livraison unique garantie, course contre l'échéance).

Écarts :
- Contrat serveur : le gateway envoie notification + data ; app en arrière-plan ou tuée, le système affiche lui-même la bannière et onMessageReceived ne s'exécute pas, donc rien de ce qui suit ne tourne. Livrer une variante data-only rétrocompatible (opt-in par version client ou en-tête), l'ancien client gardant le bloc notification (aucune bascule sèche).
- Préférences appliquées aussi en arrière-plan (push maître, heures calmes, bascule par type, sons) : PushPresentationPolicy ne gouverne aujourd'hui que le premier plan.
- Regroupement : setGroup par conversation/post (équivalent de threadIdentifier) avec notification récapitulative ; les bannières d'un fil s'empilent comme dans Messages.
- Compteur : badge d'icône = nombre de conversations non lues hors muettes (setNumber / badge du lanceur) et mise à jour du compteur lu par les widgets.
- Accusé de réception de livraison (delivery receipt) et préchargement du message/social lorsque l'app est lancée par la notification.
- Livraison unique et budget de temps : course contre l'échéance (FCM ~10 s en data-only), jamais deux notifications pour un push, retrait des bannières remplacées.
- Canaux de notification par catégorie alignés sur la catégorie des types (messages, mentions, demandes d'ami, social, appels) et son/vibration par canal.

Rendu : Titre = nom de conversation (préfixé d'un indicateur de type pour les groupes), corps = aperçu servi par le Prisme, sous-titre contextuel (Votre story, En réponse à, Nouvelle humeur) ; son selon la préférence.

Transposition Android : UNNotificationServiceExtension -> FirebaseMessagingService.onMessageReceived avec message data-only (+ notification built par l'app) ; WorkManager/expedited pour la suite longue.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/MeeshyNotificationExtension/NotificationService.swift`
- `apps/ios/MeeshyNotificationExtension/NSEPreferencesGate.swift`
- `apps/ios/MeeshyNotificationExtension/NSEDelivery.swift`
- `apps/ios/MeeshyNotificationExtension/NSEDeadline.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PushPresentationPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesStore.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationRevocation.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelInstaller.kt`

### Partager depuis n'importe quelle app vers Meeshy : plusieurs photos, vidéos, documents, liens

`ext-share-intake-from-other-apps` · Android : **partielle** · P0 · effort M

L'extension « Envoyer avec Meeshy » reçoit ce qu'une autre app remet et le prépare pour l'écran unique. Elle choisit la bonne représentation de chaque fournisseur (lien web > média > fichier > lien > texte), copie les fichiers en flux par tranches de 64 Kio vers le conteneur partagé sous un budget cumulé de 500 Mio et 20 fichiers (ce qui dépasse n'est pas copié et l'écran le dit), assainit le nom d'origine, compose le texte avec le lien et refuse de transformer en pièce un chemin de fichier. Verrous de cycle de vie : Annuler n'efface les fichiers copiés que si aucun envoi n'a été tenté et qu'aucune fiche ne les décrit ; la fermeture ne se déclenche qu'une fois.

Écarts :
- Manifeste : ajouter ACTION_SEND_MULTIPLE et tous les types (audio/*, application/pdf, text/vcard, */*) ; seuls text/plain, image/* et video/* en ACTION_SEND unique sont déclarés (une seule pièce, une seule conversation).
- Choix de la représentation : lien web prioritaire sur la vignette (Chrome, YouTube), média plutôt que chemin (Google Photos), fichier si document ; texte composé avec le lien, texte qui n'est qu'une URL = lien avec aperçu.
- Copie en flux (tranches de 64 Kio) vers un dossier privé de l'app avec budget cumulé atomique 500 Mio et plafond de 20 fichiers, marge d'espace libre de 128 Mio, nom d'origine assaini en métadonnée (jamais dans un chemin) ; readPickedAttachment charge actuellement tous les octets en mémoire (risque d'OutOfMemory sur une vidéo).
- Manque d'information dit à l'utilisateur : non préparé (cloud/disque), au-delà de 500 Mio, chemin seul ; rien de silencieux.
- Verrous de cycle de vie : effacement des copies seulement si aucun envoi tenté et aucune fiche ne les décrit ; fireOnce atomique pour la fin.
- Récepteur cache-first de destinataires (cliché récents -> conversations locales -> serveur silencieux) ; Android lit déjà Room, à brancher sur l'écran unique.
- excludeFromRecents conservé ; ne jamais exposer de chemin hors du stockage de l'app ; lecture sous un sous-processus tuable n'existe pas ici (même processus) donc protéger par un worker.

Rendu : Feuille modale plein écran affichant l'écran unique (titre « Envoyer avec Meeshy »), vignettes de pièces, toast de confirmation, fermeture automatique après envoi.

Transposition Android : Share Extension -> activité cible ACTION_SEND / ACTION_SEND_MULTIPLE (même processus, pas d'App Group) ; NSItemProvider -> ContentResolver + ClipData.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/MeeshyShareExtension/ShareViewController.swift`
- `apps/ios/MeeshyShareExtension/ShareItemLoader.swift`
- `apps/ios/MeeshyShareExtension/ShareItemRepresentation.swift`
- `apps/ios/MeeshyShareExtension/ShareExtractionReduction.swift`
- `apps/ios/MeeshyShareExtension/ShareExtensionIncoming.swift`
- `apps/ios/MeeshyShareExtension/ShareMediaStaging.swift`
- `apps/ios/MeeshyShareExtension/ShareLifecycleGates.swift`
- `apps/ios/MeeshyShareExtension/ShareExtensionHostBridge.swift`
- `apps/ios/MeeshyShareExtension/ExtensionShareDirectory.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### Ce que je colle part toujours : texte, image, vidéo, audio, document ou long texte en fichier

`ext-paste-routing` · Android : **partielle** · P1 · effort M

Règle pure PastedContentRouter (#9037) : un élément collé est classé sur ses seuls types (texte brut = texte ; image, vidéo, audio, fichier = média ; une image copiée depuis Safari qui porte aussi son adresse se colle comme image ; un fichier copié depuis Fichiers part en pièce jointe, jamais en chemin). Décision : texte qui tient dans la limite d'un message -> insérer ; texte qui ferait dépasser la limite -> document .txt nommé texte-colle-AAAAMMJJ-HHMMSS.txt et champ intact ; média -> pièce jointe. La longueur est mesurée en UTF-16 comme JavaScript. Un filet de changement de texte récupère l'insertion d'un coup si l'intercepteur est contourné.

Écarts :
- Android ne gère que le long texte (seuil 2 000 caractères et +250 en une édition) en chip de contenu presse-papiers ; porter la règle de la limite de message (MessageLimits.maxMessageLength, longueur UTF-16) et créer un document texte-colle-AAAAMMJJ-HHMMSS.txt en pièce jointe, le champ restant intact.
- Collage de médias : intercepter image/vidéo/audio/fichier collés (OnReceiveContentListener / Modifier.contentReceiver, claviers à GIF et autocollants) et les transformer en pièces jointes ; aucun récepteur de contenu riche n'existe.
- Classement par types MIME : texte brut prioritaire sur le média (passage illustré collé comme texte), image seule comme image, file:// et documents comme pièces, jamais comme chemin.
- Filet de changement de texte (insertion d'un seul coup, texte d'avant restauré) pour les claviers qui contournent l'intercepteur.
- Tests de la table de décision (insertText / attachText / attachMedia).

Rendu : La pièce collée apparaît comme une puce de pièce jointe dans le plateau du composeur (nom du fichier texte ou miniature).

Transposition Android : UTType -> types MIME du ClipDescription ; ComposerPasteInterceptor -> contentReceiver / OnReceiveContentListener du champ.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/PastedContentRouter.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LargePasteDetector.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ClipboardContent.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Mon envoi part vers chaque destinataire, sans marque de transfert, même hors ligne

`ext-share-dispatcher-fanout` · Android : **partielle** · P1 · effort M

Le dispatcher livre destinataire par destinataire avec une issue par ligne (envoyé, en file, échec avec raison) : le transfert passe par MessageForwardService (chemin unique, hors ligne compris), texte, lien ou carte par la file durable. Les messages partent dans l'ordre, le premier échec arrête la série pour ce destinataire ; la légende suit le placement du plan ; une source chiffrée se recopie sur l'appareil ; le chiffrement se décide sur la conversation RENDUE (une personne n'a pas de mode) et, tant que le chiffré n'est pas écrit, rien ne part vers une conversation chiffrée (fail-closed). Création de groupe, publication de pièces et résolution du lien suivi d'une carte. Pour un fan-out de pièces, les cibles 2..N réclament la copie des pièces de la cible d'origine, résolue au moment de partir.

Écarts :
- Contrat ShareDispatching (deliver -> sent | queued | failed(reason), createGroup, publish, resolvedLink) avec issue distincte par ligne ; Android n'envoie qu'à une conversation.
- Transfert de plusieurs messages dans l'ordre, arrêt au premier échec pour un destinataire, copie des pièces du transfert sans marque de transfert pour un partage externe.
- Fan-out de pièces : cibles 2..N par copyAttachmentsFromMessageId avec le clientMessageId local de l'origine, résolu au départ par un enregistrement d'identifiant en attente ; origine pas encore acquittée => l'outbox lève et réessaie (équivalent de ShareFanoutOriginResolver), en réutilisant OutboxDependencyKey/OutboxPayloadGrafts.
- Chiffrement : décision sur la conversation rendue (directe créée ou retrouvée de façon idempotente), source chiffrée copiée sur l'appareil, rien en clair vers une conversation chiffrée (refus dit sur la ligne, ni posté ni mis en file).
- Création de groupe avec les personnes cochées, publication d'une pièce en story/post/réel via le publieur durable, lien suivi de carte (l'envoi n'attend jamais la résolution).
- Légende : en texte du message (du premier en Séparément) ou en message séparé juste après la copie.

Rendu : Pas de visuel propre ; ses issues alimentent les états de ligne (envoi, envoyé, en file, échec).

Transposition Android : OfflineQueue GRDB -> OutboxRepository Room + OutboxFlushWorker (WorkManager), déjà présents.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareDispatcher.swift`
- `apps/ios/Meeshy/Features/Main/Services/ShareFanoutOriginResolver.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDependencyKey.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxPayloadGrafts.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`

### Un partage lancé depuis une autre app arrive à coup sûr, même app tuée ou réseau coupé

`ext-share-durable-send` · Android : **partielle** · P1 · effort L

L'extension tient UNE fiche de reprise versionnée (SharePendingShare) pour tout le partage, écrite AVANT le premier octet envoyé et réécrite atomiquement à chaque transition (fichiers copiés, upload fini, cible servie) ; elle n'est supprimée que quand TOUTES les cibles sont servies. Chaque cible a son clientMessageId propre. L'extension tente elle-même un upload TUS minimal (création + PATCH par tranches de 10 Mio) sous un budget opportuniste ; deux moments d'échec distincts (refus à la création 401/413, refus à la fin 403 ou contenu non conforme). Ce qu'elle n'a pas fini, l'app le verse dans la file durable à la prochaine ouverture (SharePendingSendConsumer), avec expiration à 7 jours et balayage des dossiers orphelins. Aucun champ de transfert : aucun destinataire ne voit de marque.

Écarts :
- Fiche de reprise persistante (Room) écrite avant tout envoi, mise à jour atomique à chaque transition, supprimée seulement quand toutes les cibles sont servies ; ShareTargetViewModel met en file après coup, donc une mort du processus avant l'enfilage perd le partage.
- Fan-out vers N conversations avec clientMessageId propre à chaque cible (jamais dérivé de l'index : motif serveur) et pièces uploadées UNE fois puis copiées côté serveur pour les cibles 2..N (copyAttachmentsFromMessageId).
- Upload par tranches vers l'API : vérifier si les pièces de message passent par TUS (le ViewModel Android indique que non) et aligner sur le contrat gateway ; gérer les deux moments de refus (création 401/413, fin 403/contenu non conforme) sans identifiant fantôme.
- Budget d'envoi opportuniste (taux gateway 300 requêtes/min/IP, 20 messages/min/utilisateur => 10 destinataires) et reprise différée par WorkManager (équivalent de SharePendingSendConsumer) avec expiration à 7 jours et balayage des dossiers orphelins ; nettoyage au logout.
- Invariant : aucun champ de transfert (forwardedFromId) dans le corps d'un partage externe.
- Un clic sur Annuler après une fiche écrite ne doit jamais effacer les fichiers (ShareCancelPolicy).

Rendu : Etats de ligne : En file (icône horloge) tant que la fiche n'est pas servie, puis Envoyé ; aucune surface propre.

Transposition Android : Extension tuable + App Group + OfflineQueue GRDB -> même processus + table Room de fiches + WorkManager (contrainte réseau) ; session lue directement dans le stockage sécurisé de l'app.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/MeeshyShareExtension/ExtensionShareDispatcher.swift`
- `apps/ios/MeeshyShareExtension/ShareSender.swift`
- `apps/ios/MeeshyShareExtension/ShareTusClient.swift`
- `apps/ios/MeeshyShareExtension/ShareSession.swift`
- `apps/ios/MeeshyShareExtension/SharePendingShare.swift`
- `apps/ios/MeeshyShareExtension/ShareUploadBudget.swift`
- `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### Choisir à qui envoyer parmi mes conversations, mes amis, mes contacts et mes communautés

`ext-share-recipients-picker` · Android : **partielle** · P1 · effort M

Zone « À qui » : rangée horizontale de récents (avatar + prénom, cochables d'un toucher), bascule « Créer un groupe avec A, B » dès deux personnes cochées, sections Conversations, Personnes (amis acceptés + contacts du carnet apparié) et Communautés dépliables en canaux où l'on peut écrire. Cache d'abord (aucun spinner si le cache est non vide, squelette de 3 lignes sinon), revalidation silencieuse de la première page de 50, recherche locale à chaque frappe puis serveur dès deux caractères (anti-rebond 300 ms, réponse périmée rejetée), multi-sélection jusqu'à 10 destinataires. Chaque ligne : avatar, titre, détail (direct, groupe N membres, ami sans conversation, contact, @pseudo, canal de communauté), présence (amis uniquement), coche, état d'envoi.

Écarts :
- Modèle ShareRecipient (conversation | personne | canal, détail typé, chiffré, suit le nom de profil) et fusion/déduplication personnes + conversations ; seules les conversations inscriptibles sont proposées aujourd'hui.
- Personnes sans conversation : amis acceptés et contacts du carnet apparié (la directe est créée de façon idempotente à l'envoi) ; aucune de ces sources n'est lue par le sélecteur Android.
- Communautés : liste en cache et dépliage en canaux inscriptibles (« Les canaux où vous pouvez écrire », « Aucun canal où vous pouvez écrire »).
- Rangée de récents cochables, bascule « Créer un groupe avec… » (D12) à partir de deux personnes.
- Multi-sélection jusqu'à 10 destinataires (plafond commun) ; Android envoie à une seule conversation et se ferme.
- Recherche : filtre local à chaque frappe + recherche serveur fusionnée (personnes, conversations, communautés) dès 2 caractères, anti-rebond 300 ms, jeton de requête courant.
- Cache-first strict : liste du cache immédiate, squelette seulement si vide, revalidation silencieuse ; état vide « Personne ici pour l'instant » avec indication de recherche.
- Ligne : présence rendue seulement là où le serveur la sert (amis acceptés), états d'envoi par ligne (envoi, envoyé, en file, échec avec Réessayer), libellé a11y unique « Equipe Lyon, groupe, 12 membres, sélectionné ». Les sous-vues doivent rester stables pour ne pas recomposer les voisines.

Rendu : Récents : avatar rond + prénom sous l'avatar, coche en surimpression à l'accent ; lignes de hauteur >= 44 dp, avatar 40 dp, titre body, détail footnote secondaire, section headers footnote semi-gras muted ; bascule de groupe avec icône personnes et tint accent.

Transposition Android : Sous-vues Equatable SwiftUI -> composables stables (remember/key, états immuables) ; caches nommés -> flux Room des conversations, amis et contacts.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareRecipient.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareRecipientDirectory.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareRecipientRow.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSourcing.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSheetViewModel.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ForwardTargets.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`

### Envoyer avec une légende, choisir Ensemble ou Séparément et suivre chaque envoi

`ext-share-send-bar-delivery-states` · Android : **partielle** · P1 · effort M

Zone 4, barre fixe en matière translucide : bannières (hors ligne : partira au retour du réseau ; avertissement de sortie du chiffrement avec les destinations non chiffrées nommées ; trop lourd N fichiers/X Mo ; plus de 10 destinataires), légende de 1 à 4 lignes (5 000 caractères, une par envoi), sélecteur Ensemble/Séparément dès deux pièces, bouton capsule « Envoyer à N » / « Transférer à N » / « Retirer les N derniers » désactivé si le plan l'interdit. Chaque ligne destinataire montre son issue : envoi, envoyé, en file, échec avec Réessayer.

Écarts :
- Barre d'envoi ancrée (translucide) avec bouton unique « Envoyer à N destinataires » ; Android a un bouton Envoyer par ligne et un libellé Envoyé.
- Légende multi-ligne (max 4 lignes visibles, 5 000 caractères), placement selon le plan (texte du message ou message séparé juste après la copie).
- Sélecteur segmenté Ensemble / Séparément à partir de deux pièces, Ensemble par défaut.
- Bannières : hors ligne (couleur avertissement), source chiffrée vers destinations non chiffrées (noms listés), trop lourd, trop de destinataires (erreur).
- Etats par ligne : envoi (spinner), envoyé (coche), en file (hors ligne, durable), échec avec Réessayer ; l'envoi continue si l'écran se ferme.
- Libellé d'accessibilité du bouton qui annonce l'effet et le nombre ; identifiant de test share.sheet.send.

Rendu : Bouton capsule pleine largeur, hauteur de contrôle standard, accent de marque (gris muted désactivé), texte blanc body semi-gras ; bannières arrondies (rayon sm) teintées de leur couleur sémantique à faible opacité, icône à gauche, footnote.

Transposition Android : safeAreaInset(.bottom) + ultraThinMaterial -> Scaffold bottomBar avec surface translucide ; Picker segmenté -> SingleChoiceSegmentedButtonRow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareSendBar.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`

### Un seul écran de partage pour envoyer ou transférer quoi que ce soit

`ext-share-sheet-shell` · Android : **partielle** · P1 · effort M

L'écran unique (planche partage-unique) est monté par l'app (transfert, partager un message, une pièce, une story, un post, un profil) et par l'extension de partage. Quatre zones dans cet ordre : ce qui part, ce qu'on peut en faire, à qui, puis Envoyer ; deux gestes pour l'usage nominal (toucher un récent, puis Envoyer). Titre selon la source (Envoyer, Transférer, Envoyer avec Meeshy), Annuler devient Fermer après envoi, « Tout réessayer » en cas d'échecs, recherche dans la barre, carte « Ce message ne sort pas de Meeshy » quand tout est protégé, auto-fermeture après 0,6 s avec haptique de succès, toast « Envoyé à X · Ouvrir ». Textes et catalogue de langues partagés avec l'app.

Écarts :
- Deux sélecteurs séparés et plus pauvres (ShareTargetScreen et ForwardPickerSheet) à la place d'un écran unique : le remplacer, avec les quatre zones et leur ordre.
- Titre dynamique (Envoyer / Transférer / Envoyer avec Meeshy), bouton Annuler -> Fermer après envoi, « Tout réessayer » si des lignes ont échoué.
- Carte d'état bloqué « Ce message ne sort pas de Meeshy » avec raison (vue unique, après lecture, indisponible) et bouton « Compris ».
- Fermeture automatique 0,6 s après un envoi sans échec avec haptique de succès ; toast à la fermeture « Envoyé à X » avec action « Ouvrir » vers la conversation servie.
- Boîte de confirmation d'avertissement avant de publier une capture d'écran faite dans l'app.
- Recherche dans la barre d'app (tiroir toujours visible) avec invite « Rechercher une personne, un groupe » ; défilement qui ferme le clavier.
- Catalogue de textes en sept langues (une soixantaine de clés ShareSheetCopy) : strings.xml fr/es/pt existent, ajouter les clés et les autres langues.

Rendu : Fond principal du thème, titre inline, sections LazyColumn avec espacement lg, barre Envoyer ancrée en bas en matière translucide, accent de la conversation ou marque 6366F1, cibles 44 dp, a11y : un seul élément parlé par ligne.

Transposition Android : NavigationStack plein écran iOS -> écran Compose Material 3 (feuille modale plein écran dans l'app, activité dédiée pour la cible de partage système).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareSheetView.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSheetViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSheetCopy.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareStringsBundle.swift`
- `apps/ios/Meeshy/Features/Main/Share/ShareSheetHost+App.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Ouvrir un lien de conversation, voir sa configuration et la modifier

`ext-sharelinks-detail-edit` · Android : **partielle** · P1 · effort M

La fiche d'un lien (détails ET édition, #7797) : carte du lien en dégradé de marque avec adresse meeshy.me/chat/<linkId> (jamais /l/<token> ni le slug), boutons copier, partager (feuille système), activer/désactiver, supprimer ; carte « Configuration » en lecture (droits des invités sans compte, conditions d'entrée, utilisations, personnes en même temps, langues autorisées, échéance) et formulaire d'édition couvrant tous les champs de PATCH /links/:linkId (nom interne, message d'invitation, expiration, utilisations max, personnes simultanées, conditions d'entrée, langues autorisées, droits des invités). Vide = illimité (null explicite). Optimiste : l'écran change d'abord, un échec rend l'état d'avant et garde le brouillon. Dates toujours en calendrier grégorien.

Écarts :
- Formulaire d'édition absent : ajouter PATCH links/{linkId} (LinkApi n'expose que toggle, extend, delete) et un brouillon couvrant nom interne, message d'invitation, expiration, utilisations max, personnes simultanées, conditions d'entrée (compte, pseudo, e-mail, date de naissance), langues autorisées, droits des invités (messages, images, fichiers, historique).
- Champs numériques où VIDE = illimité envoyé en null explicite ; langues autorisées : décocher tout présélectionne la langue de l'interface et la dernière langue ne se retire pas (liste vide = toutes).
- Carte « Configuration » en lecture (droits invités, conditions, limites, langues) avec bouton Modifier ; textes partagés entre carte et formulaire (ShareLinkDetailCopy : askedFields en une phrase liée selon la locale).
- Carte héros en dégradé de marque avec adresse meeshy.me/chat/<linkId> et boutons copier/partager/activer/supprimer ; adresse jamais /l/<token> ni le slug.
- Optimisme : application à l'écran puis au serveur, échec = état restauré et brouillon conservé ; Enregistrer / Abandonner les modifications.
- Dates en calendrier grégorien quelle que soit la locale (ar_SA) via un formateur dédié (ShareLinkDateFormat).
- Cache-first : la fiche se peint immédiatement depuis la ligne de liste (expand=conversation,policy), les statistiques arrivent ensuite sans jamais bloquer.

Rendu : Carte héros dégradé 6366F1 vers 4338CA, adresse affichée sans schéma, boutons capsule (copier/partager), sections groupées en cartes arrondies, interrupteurs pour les droits, champs avec libellé au-dessus.

Transposition Android : Formulaire SwiftUI -> écran Compose avec états de brouillon immuables et ModalBottomSheet de confirmation.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkEditForm.swift`
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkConfigurationCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailCopy.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ShareLinkDetailViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkSettings.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkDateFormat.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkDetailScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkDetailViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkDetailPresentation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkDetailState.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/LinkApi.kt`

### Mes widgets restent à jour sans que j'aie à ouvrir l'app

`ext-widget-data-pipeline` · Android : **partielle** · P1 · effort M

WidgetDataManager publie dans l'App Group, depuis le coordinateur de notifications (source unique du compteur) : conversations (épinglées d'abord puis récentes, 50 max, aperçu servi par le Prisme du lecteur), favoris (conversations directes épinglées, 8, jeton de présence), compteur de non lus, instantanés de conversation pour la NSE et l'écran de partage, et origine API. Les écritures sont enveloppées d'une tâche de fond (0xDEAD10CC), le wipe de déconnexion efface tout et les dossiers de staging. WidgetRefreshSchedule règle 30 min (conversations) et 60 min (favoris) ; WidgetDeepLink encode les segments d'URL.

Écarts :
- Aucun appel GlanceAppWidget.updateAll dans le code : les widgets ne changent qu'à la période système (30 min). Observer le flux Room des conversations (anti-rebond ~200 ms) et appeler updateAll pour les quatre widgets, aussi au retour premier plan, après mark-read et après un push.
- Cadences iso iOS : 30 min conversations, 60 min favoris (updatePeriodMillis plancher 30 min, compléter par un worker périodique).
- Wipe à la déconnexion et au changement de compte : ne jamais afficher le contenu du compte sortant ; rafraîchir les widgets en état déconnecté.
- Aperçu servi dans la langue du lecteur (descente Prisme complète) et rafraîchi quand les langues changent.
- Jeton de présence stable pour les favoris, uniquement pour les amis acceptés.
- Liens profonds sûrs : encoder le segment d'identifiant (jeu de caractères alphanumérique -._~) et refuser un identifiant vide ; pas de lien pour un id invalide.
- Aperçu de galerie : données d'exemple uniquement quand le widget est en prévisualisation, jamais de repli fabriqué en production (une lecture morte doit se voir).

Rendu : Pas de visuel propre : conditionne la fraîcheur perçue de tous les widgets ; un widget périmé est un bug de fluidité, pas une dette.

Transposition Android : App Group UserDefaults + WidgetCenter.reloadAllTimelines -> lecture directe de Room (même processus) + GlanceAppWidget.updateAll déclenché par un collecteur de flux et un worker ; pas de publication JSON nécessaire.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift`
- `apps/ios/MeeshyWidgets/WidgetRefreshSchedule.swift`
- `apps/ios/MeeshyWidgets/WidgetDeepLink.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/WidgetEntryPoint.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/RecentConversationsWidgetPresentation.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/FavoriteContactsWidgetPresentation.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`

### Voir mes conversations récentes d'un coup d'oeil sur l'écran d'accueil

`ext-widget-recent-conversations` · Android : **partielle** · P1 · effort M

Le widget « Conversations récentes » existe en trois tailles : petite (compteur de non lus + première conversation, un tap ouvre la plus récente), moyenne (en-tête + 2 conversations avec pastille non lu et bouton marquer comme lu), grande (5 conversations avec avatar 40 pt, épingle, heure relative et aperçu). Avatars ronds à initiales sur la couleur d'accent de la conversation, épingle orange pour les épinglées, pilule « N non lus » teintée de la marque, état vide « Ouvrez Meeshy pour commencer », fond système clair/sombre, tap sur une ligne = lien profond vers la conversation.

Écarts :
- Trois mises en page selon la taille (SizeMode.Responsive) : petite = compteur + première conversation (tap -> meeshy://conversations/recent), moyenne = 2 lignes, grande = 5 lignes avec heure relative ; aujourd'hui une seule face liste.
- Avatar rond à initiales (2 premiers mots, majuscules, police arrondie semi-grasse) sur la couleur d'accent, 28/30/40 dp, rendu en bitmap circulaire : Glance dessine actuellement un carré de 6 dp.
- Icône épingle orange sur les conversations épinglées, pastille de marque 8 dp pour non lu, pilule d'en-tête « N non lus » (fond marque 20 %, rayon 8).
- Thème clair/sombre : le fond blanc, le noir et le gris sont codés en dur ; utiliser GlanceTheme et des ColorProviders jour/nuit.
- Heure relative du dernier message en grande taille.
- Aperçu servi dans la langue du lecteur (Prisme) avec préfixe expéditeur hors conversations directes : vérifier que lastMessagePreview applique la descente complète des langues.
- Etat vide localisé « Ouvrez Meeshy pour commencer » tappable (déjà présent) à conserver ; ajouter l'aperçu de galerie de widgets (données d'exemple uniquement en isPreview).

Rendu : Marque 6366F1 / profonde 4338CA, succès 34D399, avertissement FBBF24 (épingle orange). Typo : titre headline, nom caption semi-gras, aperçu caption2 secondaire 1-2 lignes. Marges 12-16 dp, espacement lignes 8 (moyen) / 12 (grand). Pas d'animation (widget statique). Etat vide centré avec icône bulle.

Transposition Android : WidgetKit systemSmall/Medium/Large -> GlanceAppWidget avec SizeMode.Responsive (trois tailles déclarées) ; containerBackground -> GlanceTheme.colors.widgetBackground ; Link -> actionStartActivity(Intent ACTION_VIEW meeshy://).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/RecentConversationsWidget.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/RecentConversationsWidgetPresentation.kt`, `apps/android/app/src/main/res/xml/recent_conversations_widget_info.xml`

### Dire à l'assistant d'écrire, d'appeler ou d'ouvrir la dernière conversation Meeshy

`ext-app-shortcuts-assistant` · Android : **partielle** · P2 · effort M

iOS expose cinq App Shortcuts (Siri, Spotlight, Raccourcis) : Envoyer un message (contact + texte dicté), Appeler un contact (audio ou vidéo), Traduire du texte (délibérément non routé, l'app s'ouvre sans effet), Ouvrir la conversation récente, Voir les notifications (nombre de conversations non lues hors muettes + 3 derniers aperçus en vue Siri). Chaque intent émet un lien meeshy:// ; ContactEntity/ContactQuery puisent dans les contacts favoris (conversations directes épinglées) et se ré-hydratent par identifiant de conversation. Le texte dicté est encodé en excluant & = + ? # pour ne pas être tronqué.

Écarts :
- Déclarer res/xml/shortcuts.xml avec des raccourcis statiques (Envoyer un message, Appeler, Conversation récente, Non lus) et les capabilities Google Assistant (actions.intent.CREATE_MESSAGE avec message.recipient et message.text, actions.intent.CREATE_CALL) ; seuls des raccourcis dynamiques par conversation existent.
- Ajouter au NavHost les routes meeshy://send?contactId=&message= (ouvre la conversation directe avec brouillon prérempli, jamais d'envoi automatique), meeshy://call?contactId=&type=audio|video (rappel par le démarreur d'appel), meeshy://conversations/recent et meeshy://conversations/unread : aucune n'existe aujourd'hui.
- Encodeur de valeur de requête partagé qui exclut & = + ? # (une dictée « Tom & Jerry ce soir » ne doit pas être tronquée), avec test.
- Source des contacts proposés = favoris (conversations directes épinglées, 8 max) avec ré-hydratation d'un contact par identifiant de conversation, pas par identifiant utilisateur.
- Raccourci « Voir les non-lus » : nombre de conversations non lues hors muettes (le même nombre que le badge) et 3 derniers aperçus ; sans snippet Siri sur Android, le rendre par la notification locale ou un écran dédié.
- Ne pas porter Traduire (intent non routé sur iOS) : consigner la dette plutôt que d'ajouter un raccourci sans effet.

Rendu : Libellés courts : Envoyer un message (icône bulle), Appeler (téléphone), Conversation récente (horloge), Notifications (cloche). Icônes monochromes adaptatives, libellé long = phrase d'invocation. La vue Siri de non-lus iOS (cloche info + titre « N non lus » + 3 lignes de bulle caption à une ligne) n'a pas d'équivalent visuel obligatoire.

Transposition Android : App Intents / AppShortcutsProvider devient res/xml/shortcuts.xml (statiques) + ShortcutManagerCompat (dynamiques) + capabilities Google Assistant (Built-in Intents). OpenURLIntent devient une Intent ACTION_VIEW meeshy:// traitée par le NavHost.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Intents/MeeshyAppIntents.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/shortcuts/DynamicShortcutsPublisher.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/shortcuts/DynamicShortcutsPresentation.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### Ouvrir un tableau de bord qui résume mes non lus, mes liens et mes raccourcis

`ext-dashboard-widget-preview` · Android : **partielle** · P2 · effort S

Ecran « Tableau de bord » : carte du total de non lus (compteur animé, « Tout est lu » sinon), trois conversations récentes (nom, heure relative, aperçu, badge non lu), actions rapides (Nouveau, Partager, Post, Réglages), section MES LIENS avec quatre cartes à deux statistiques (Parrainage : liens et inscrits ; Partage : liens et rejoints ; Suivi : liens et clics ; Communauté : groupes et membres) chargées en parallèle, et bandeau d'invitation à ajouter les widgets Meeshy. Apparition échelonnée (0,08 s), fond dégradé principal.

Écarts :
- Section MES LIENS : quatre cartes cliquables (parrainage, partage, suivi, communauté) avec leurs deux statistiques chargées en parallèle et navigation vers chaque écran de liens.
- Compteur de non lus animé (transition numérique) et variante « Tout est lu » avec coche.
- Actions rapides iOS : Nouveau, Partager, Post, Réglages en tuiles à dégradé ; Android propose Nouvelle conversation, Recherche, Liens de partage, Contacts : aligner l'ensemble et l'apparence en tuiles.
- Bandeau « Widgets Meeshy » avec le texte d'invitation et un bouton qui appelle AppWidgetManager.requestPinAppWidget.
- Apparition échelonnée des cartes (0,08 s) et fond dégradé principal ; 3 conversations avec heure relative.
- Etats vide (« Aucune conversation ») et chargement des cartes de liens (tirets à la taille finale).

Rendu : Sections espacées xl, cartes arrondies, tuiles de lien à deux stats en caption, icônes par type de lien, en-tête centré avec croix de fermeture ; staggeredAppear baseDelay 0,08.

Transposition Android : Vue SwiftUI plein écran -> écran Compose ; l'invitation à épingler un widget utilise requestPinAppWidget.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DashboardScreen.kt`

### Choisir quelles notifications Meeshy passent pendant un mode Concentration ou Ne pas déranger

`ext-focus-filter` · Android : **partielle** · P2 · effort M

Le SetFocusFilterIntent d'iOS permet de configurer, dans Réglages > Concentration, six autorisations : messages directs (oui par défaut), messages de groupe (non), mentions (oui), réactions (non), fil social (non), appels (oui). Le choix est sérialisé dans l'App Group (MeeshyFocusSnapshot, isActive) et consulté par le gestionnaire de toasts, les widgets et la NSE avant d'afficher quoi que ce soit.

Écarts :
- Le modèle FocusFilterSnapshot existe mais n'est lu par aucun code : le brancher dans PushPresentationPolicy, NotificationToastPolicy et la décision de bannière en arrière-plan.
- Persister le snapshot (DataStore) et écrire un écran de réglages « Autorisé pendant Ne pas déranger » avec les six bascules et les mêmes défauts qu'iOS.
- Détecter le mode actif via NotificationManager.getCurrentInterruptionFilter, le broadcast ACTION_INTERRUPTION_FILTER_CHANGED et, sur Android 15+, les Modes (AutomaticZenRule) pour renseigner isActive.
- Créer des canaux de notification par catégorie (messages directs, groupes, mentions, réactions, social, appels) afin que le DND système applique la même coupe et que l'utilisateur puisse la régler dans Réglages Android.
- Test de la table décision : catégorie x snapshot actif/inactif, y compris le comportement permissif quand le snapshot est absent.

Rendu : Section de réglages avec six lignes à interrupteur (accent de marque), sous-titre expliquant que le choix ne s'applique que pendant un mode actif. Typographie et densité identiques aux autres écrans de réglages de notifications.

Transposition Android : Focus filter iOS -> NotificationManager.Policy / Modes (Android 15) + canaux de notification par catégorie avec bypassDnd configurable ; pas d'API d'extension de mode tiers.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MeeshyFocusFilter.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/FocusFilterSnapshot.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PushPresentationPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationToastPolicy.kt`

### Partager un post, une story ou un réel vers une autre app avec un lien suivi ou le fichier

`ext-share-external-post-link` · Android : **partielle** · P2 · effort M

ShareableLink emballe l'adresse fraîchement fabriquée d'un post ou d'une story pour la feuille système. Le lien est suivi (TrackingLink) ; hors ligne ou limité, repli sur l'URL brute du post (le destinataire arrive quand même, seule l'attribution est perdue). L'origine web est celle de production, car un partage externe doit se résoudre hors du réseau Meeshy. Quand un fichier peut s'emporter, UN seul élément paresseux : le fichier va aux activités qui prennent un fichier (Enregistrer la vidéo, Enregistrer dans Fichiers, AirDrop), le lien à toutes les autres, sans rendu inutile. Le placeholder est un vrai fichier minuscule (vidéo H.264 16x16 ou PNG 1x1) sous le nom final.

Écarts :
- Fabrication d'un lien suivi (TrackingLink) pour posts, stories et réels avec repli sur l'URL brute du post en cas d'échec ; le modèle TrackingLink existe mais le partage actuel émet l'URL directement.
- Origine web de production figée pour les liens externes (jamais l'URL de staging).
- Partage de fichier à la demande : ClipData avec un URI de ContentProvider/FileProvider dont le contenu est produit à l'ouverture (rendu de la scène ou média résolu) plus le lien en EXTRA_TEXT ; ne payer le rendu que pour les cibles qui lisent le fichier.
- Règle de sauvegarde par type de publication (PostSaveRoute) et fichier de remplacement minuscule si l'API de partage l'exige.
- Analytique : l'identifiant de partage reste celui du lien suivi.

Rendu : Pas d'écran propre : feuille de partage système ; toast « Copié » à la copie du lien.

Transposition Android : UIActivityItemProvider paresseux -> Intent ACTION_SEND avec ClipData + ContentProvider qui rend le fichier à l'ouverture ; pas de placeholder nécessaire sur Android.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ShareableLink.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ShareFilePlaceholder.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileShareSheet.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TrackingLink.kt`

### Si je ne suis pas connecté ou que la conversation est chiffrée, mon partage m'attend dans l'app

`ext-share-relay-signin-e2ee` · Android : **partielle** · P2 · effort M

Deux cas où le point d'entrée de partage ne peut pas envoyer lui-même : sans session (carte « Connectez-vous pour envoyer » + bouton « Ouvrir Meeshy », la fiche attend le premier compte qui se connecte) et vers une conversation chiffrée (l'extension n'a pas les clés : jamais de clair, la fiche relaie vers l'écran complet de l'app qui présélectionne les conversations déjà choisies). La fiche reste lisible une semaine, n'est servie qu'au compte qui l'a déposée et reste sur disque jusqu'à la fermeture de l'écran (settle), pas seulement sa présentation. Deux déclencheurs : lien meeshy://share-relay et balayage au réveil ; l'ouverture n'est qu'un raccourci.

Écarts :
- Sans session : l'écran affiche seulement « Connectez-vous à Meeshy pour partager » sans bouton ni mémoire du partage ; persister la fiche, ouvrir l'app sur la connexion et rouvrir l'écran de partage après authentification.
- Fiche de relais (texte, pièces copiées, conversations présélectionnées, compte propriétaire nullable, expiration à 7 jours) servie uniquement au compte déposant, oubliée à la déconnexion.
- Fiche conservée jusqu'à la FERMETURE de l'écran (settle), pas seulement jusqu'à sa présentation ; app tuée avant Envoyer = partage retrouvé.
- Deep link meeshy://share-relay et balayage au réveil comme double déclencheur.
- Conversation chiffrée : tant que le chiffrement de bout en bout n'existe pas côté Android, refuser clairement (fail-closed) avec message ; plus tard, relayer vers l'écran complet qui chiffre sur l'appareil.

Rendu : Carte centrée « Connectez-vous pour envoyer » avec corps explicatif et bouton plein accent « Ouvrir Meeshy » à la place de la zone « À qui » et de la barre Envoyer.

Transposition Android : extensionContext.open + App Group -> même activité/processus : persister la fiche en Room et lancer MainActivity avec un intent explicite.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Share/ShareRelayHandoff.swift`
- `apps/ios/Meeshy/Features/Main/Services/ShareRelayConsumer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`

### Quand j'ouvre un lien d'invitation, je vois qui m'invite et je choisis mon compte ou l'anonymat

`ext-sharelinks-invite-landing` · Android : **partielle** · P2 · effort M

Page d'invitation quand un compte est présent (#7795) : elle montre la MÊME page que sans compte (qui invite, le groupe, ce qu'on y parle via une barre de proportions de langues, ce qu'un invité anonyme peut y faire) et propose : rejoindre avec son compte, rejoindre anonymement (ou reprendre la session invitée déjà ouverte), se connecter, s'inscrire. L'annulation est un geste. La règle d'entrée est pure : conversation visée, compte présent, déjà membre, lien exigeant un compte, session invitée existante => ouvrir, rejoindre avec le compte, anonyme, reprendre la session, demander, ou compte requis. Les langues se montrent en parts mesurées (décomptes) ou égales (simple liste).

Écarts :
- La règle d'entrée (ShareLinkEntryPolicy) et le résolveur sont portés ; l'écran ChooseIdentityBody n'est qu'un titre et deux boutons, sans la page d'invitation.
- Page d'invitation complète : qui invite (créateur, avatar), le groupe (titre, description, nombre de membres), barre de proportions de langues (LanguageShare.weighted pour des décomptes, even pour une simple liste spokenLanguages), droits d'un invité anonyme (messages, images, fichiers, historique).
- Quatre choix : compte (Rejoindre avec mon compte), anonyme (ou reprise de session), se connecter, s'inscrire ; annulation par glissement de la feuille sans rien engager.
- Dates d'invitation (création, expiration) en calendrier grégorien quelle que soit la locale.
- Cas « session invitée déjà ouverte sur ce lien » : reprendre au lieu d'en ouvrir une seconde ; plusieurs sessions par lien (Android n'en garde qu'une par appareil).

Rendu : En-tête avec avatar de l'inviteur et nom du groupe, barre de proportions de langues multicolore avec légende (pourcentage si mesuré), liste des droits invités avec icônes, boutons plein accent (compte) et contour (anonyme).

Transposition Android : Sheet SwiftUI -> ModalBottomSheet ou écran Compose plein écran ; deep link https://meeshy.me/chat/{linkId} et /join/ déjà déclarés dans le manifeste.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ShareLinkIdentitySheet.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkInvitationTerms.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkEntryPolicy.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkEntryPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationStatsProjection.kt`

### Retrouver et gérer mes liens de partage de conversation, avec leurs totaux

`ext-sharelinks-list` · Android : **partielle** · P2 · effort S

Écran « Liens de partage » : trois cartes de totaux (Liens, Actifs, Rejoints), liste des liens avec statut (actif, inactif, expiré), compteur de rejoints, échéance choisie à la création (#10381), accessibilité en une phrase, tirer pour rafraîchir, bouton plus pour créer. Cache-first : une visite à l'écran se contente d'un cache frais, un geste (tirer, créer un lien) exige la vérité du serveur ; une liste qui n'a pas pu être relue reste celle qu'on montrait (#9195). Modèles du SDK : MyShareLink, statistiques personnelles, liens créés.

Écarts :
- Tirer pour rafraîchir (PullToRefresh) exigeant la vérité du serveur, distinct de la visite à l'écran qui se contente d'un cache frais (ShareLinksReloadLaw).
- Une liste qui n'a pas pu être relue reste affichée (linksAfterFetch) : vérifier que l'échec de rechargement ne vide pas la liste.
- Ligne : phrase d'échéance « Expire le… » choisie à la création (rowExpiry, #10381), libellé a11y en une phrase, compteur « N rejoints ».
- Bouton plus dans l'en-tête pour créer un lien, ouvre la création puis recharge avec le déclencheur linkCreated.
- Cartes de totaux avec icône (lien, coche, personne) et mêmes libellés que iOS.

Rendu : Trois cartes de stat sur une ligne (icône, valeur, libellé), liste en cartes arrondies avec pastille de statut, en-tête avec retour, titre centré, plus à droite à l'accent de marque.

Transposition Android : refreshable SwiftUI -> pullToRefresh Material 3.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkModels.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MyShareLinksScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MyShareLinksViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MyShareLinksState.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MyShareLinkPresentation.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/LinkApi.kt`

### Joindre mes contacts favoris depuis l'écran d'accueil, avec leur présence

`ext-widget-favorite-contacts` · Android : **partielle** · P2 · effort S

Widget moyen/grand en grille adaptative (colonnes de 65 pt minimum) : avatar rond à initiales de 50 pt, prénom sur une ligne et pastille de présence 12 pt bordée de 2 pt (en ligne vert 34D399, absent orange FBBF24, inactif gris 9CA3AF, hors ligne aucune pastille, règle 1/3/5). 4 contacts en moyen, 8 en grand ; en-tête étoile orange « Favoris ». Le widget reçoit un jeton de présence stable, jamais un libellé. VoiceOver lit « Nom, En ligne ».

Écarts :
- Présentation en grille adaptative avec avatars ronds 50 dp (bitmap circulaire) et prénom, au lieu d'une liste de lignes avec carré d'accent.
- Pastille de présence 12 dp bordée 2 dp selon la règle 1/3/5 à partir d'un jeton publié (online/away/idle/offline), aucune pastille pour offline ; la présence ne doit être servie qu'aux amis acceptés (loi de visibilité), absente sinon.
- Nombre de contacts selon la taille : 4 en moyen, 8 en grand ; actualisation toutes les heures et à chaque changement.
- Libellé d'accessibilité « Nom, En ligne » (présence dite) et en-tête étoile orange localisé « Favoris ».
- Thème clair/sombre et état vide localisé.
- Tap -> conversation directe (Android réutilise meeshy://conversation/{id}, acceptable : iOS pointe meeshy://contact/{id}).

Rendu : Avatar 50 dp + pastille bas-droite 12 dp bordure 2 dp couleur de fond ; nom caption 1 ligne ; grille espacement 12 ; en-tête étoile orange headline.

Transposition Android : LazyVGrid adaptatif -> Glance LazyVerticalGrid (colonnes fixes selon la largeur) ; badge de présence -> bitmap composite généré hors UI.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/FavoriteContactsWidget.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/FavoriteContactsWidgetPresentation.kt`, `apps/android/app/src/main/res/xml/favorite_contacts_widget_info.xml`

### Répondre en un tap depuis l'écran d'accueil avec une réponse toute faite

`ext-widget-quick-reply` · Android : **partielle** · P2 · effort S

Le widget Réponse rapide met en avant la première conversation non lue (sinon la première) : avatar initiales 24 pt, nom, aperçu sur 2 lignes et quatre puces (pouce levé, OK, Merci !, Rappelle-moi). Un tap sur une puce ouvre la conversation avec le texte prérempli dans le composeur. Le libellé de la puce suit la locale appareil (chrome) alors que le brouillon relève de la langue du compte (Prisme, contenu).

Écarts :
- Séparer libellé (locale appareil) et brouillon (langue configurée du compte, Prisme) : aujourd'hui le texte déposé dans le composeur est le libellé affiché.
- Mise en forme iOS : en-tête avec icône bulle et titre « Réponse rapide » en couleur de marque, avatar initiales 24 dp, nom en semi-gras, aperçu 2 lignes, puces en capsule (rayon 12, teinte marque 15 %).
- Thème clair/sombre (fond blanc codé en dur) et état vide localisé.
- Conserver le comportement de prérempli sans envoi automatique (iso iOS) ; noter que le lien meeshy://quickreply d'iOS n'est pas routé côté iOS alors qu'Android le sert via meeshy://conversation/{id}?draft=.

Rendu : Puces : texte caption, padding 8x4, fond marque 15 %, rayon 12 ; deux lignes d'aperçu maximum ; espacement vertical 12 ; marque 6366F1 pour l'en-tête.

Transposition Android : Link SwiftUI avec URL meeshy://quickreply -> actionStartActivity(Intent ACTION_VIEW meeshy://conversation/{id}?draft=).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/widget/QuickReplyWidget.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/QuickReplyWidgetPresentation.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/QuickReplyDeepLink.kt`, `apps/android/app/src/main/res/xml/quick_reply_widget_info.xml`

