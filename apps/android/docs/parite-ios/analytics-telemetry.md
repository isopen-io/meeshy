# Parité iOS → Android : `analytics-telemetry`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**25 features iOS** : 20 absentes, 4 partielles, 1 divergentes, 0 complètes sur Android. **29 lots** planifiés (≈15550 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**analytics-telemetry** (couverture Android estimée ≈ 8 %)

Cette partie regroupe tout ce qui MESURE l'usage sur iOS, plus l'écran utilisateur « Liens de suivi ». (1) Un pipeline de comptage (`POST /social/events` : vues, impressions, ouvertures, sessions dwell) avec enveloppe eventId/occurredAt, files persistées par compte, rejeu idempotent et consentement relu à chaque lot. (2) Un catalogue v2 typé (interaction, négatif, lien, découverte, story, notification, capture, défilement, visibilité MRC, QoE vidéo) envoyé par lots de 50 événements ou 10 s, échantillonné par la passerelle, avec sommeil d'une heure sur 400. (3) La déclaration des captures d'écran/enregistrements sur contenus éphémères (annoncés à l'auteur ou rendus noirs) et la capture sociale. (4) Les écrans Liste/Création/Détail des liens de suivi (UTM, QR, ventilations pays/appareil/navigateur) et la résolution des liens `/l/<jeton>`. (5) Firebase screen_view, l'horloge d'installation et l'ordre de préparation des pièces jointes. Android en est à environ 8 % : un ImpressionBatcher en mémoire (3 s, sans persistance, routes historiques `posts/impressions/batch`), la machine `EngagementSessions` qui n'envoie que `posts/{id}/view`, les modèles TrackingLink (sans API, sans écran), un paramètre `trackedLinks` jamais alimenté, le réglage `allowAnalytics` et un détecteur d'enregistrement d'écran limité aux appels. Absent : `/social/events`, tout le catalogue v2, la file Room de rejeu, la visibilité MRC, le défilement, la QoE Media3, la déclaration de capture, les trois écrans de liens de suivi, Firebase Analytics (seul firebase-messaging est présent). Point de contrat à trancher avant de coder : l'enum `platform` du contexte v2 ne connaît que ios/web/android_shell/pwa, il faut une valeur additive `android` côté `packages/shared` et passerelle.

## Notes transverses

SYNTHESE. 31 lots (16,3 k lignes Kotlin de production estimees, hors tests) pour un domaine mesure a ~8 % de parite. Ordre de vagues propose (deduit de depends_on) : V0 = contract-platform-android, network-surface, telemetry-storage, counting-wire-model, v2-catalog-model, measurement-engines, capture-declaration, trackinglink-data(apres 2+3), composer-preparation-order ; V1 = consent-standing ; V2 = v2-context-sampling, counting-delivery, app-level-telemetry ; V3 = reach-context, v2-reporter, notification-events ; V4 = detail-provenance, trackedlink-resolve, capture-detection ; V5 = impression-queue, capture-announce-or-black, trackinglink-create ; V6 = surfaces-impressions-other, social-capture, trackinglink-list ; V7 = listing-visibility-scroll, playback-qoe, story-negative-events, trackinglink-detail ; V8 = interaction-events, link-discovery-events.

ECARTS AVEC L'INVENTAIRE (verifies dans le depot, a lire avant de coder). (1) Le contrat TS fait foi, pas le Swift : packages/shared/types/content-surfaces.ts liste 19 surfaces et content-reach.ts 16 origines (feed, reels, profile, bookmarks, hashtag, community, nearby, sound, story_rail, mood_avatar, citation, search, notifications, comments, link_preview, status) ; l'enum Swift OpenOrigin n'en a que 12 et ReachSurface 14 : l'inventaire a repris les chiffres iOS, en retard. Le miroir Kotlin suit le TS, avec un test de garde JVM qui lit les fichiers TS (meme principe que ApiPathLiteralGuardTest : echouer FORT si le fichier est introuvable). (2) L'enum platform : la passerelle fait enumOrDrop(CLIENT_PLATFORMS) (eventsV2Schemas.ts:162) : une valeur inconnue est RETIREE sans 400, donc l'absence de la valeur android ne casse rien mais fait perdre l'attribution. Il existe deux enums jumelles non unifiees : types/social-events-v2.ts (android_shell, underscore) et utils/client-session.ts (android-shell, tiret, en-tetes X-Meeshy-Platform, que l'Android natif n'envoie pas encore) ; seul le lot contract-platform-android touche la premiere. (3) Le dwell a besoin de la session d'engagement complete d'iOS (EngagementModels.swift + apps/ios/.../Services/EngagementTracker.swift : sessionId, contentType, startedAt, watchMs, mediaDurationMs, completed, truncated, actions, watchSamples, begin/checkpoint/finalize) absente des ios_refs de l'inventaire : le modele fil est dans counting-wire-model, l'extension de la machine EngagementSessions dans detail-provenance. (4) Json de MeeshyApi : explicitNulls=false mais encodeDefaults par defaut (faux) : un champ egal a sa valeur par defaut est OMIS. schemaVersion=2 du contexte v2 et les discriminants type/action doivent etre @EncodeDefault ou des parametres sans defaut, avec un test de JSON dore. (5) customToken : le motif de la passerelle est ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}[a-zA-Z0-9]$ (2 a 50 caracteres) alors que l'aide iOS dit 6 caracteres minimum : valider selon la passerelle (autorite), garder le libelle d'aide iOS pour decision produit. (6) Le service FCM tourne dans le meme processus que l'application : pas de SocialNotificationInbox (qui n'existe sur iOS que parce que la NSE est un processus separe) ; les evenements de notification vont directement dans l'outbox v2. (7) Sous-types reseau 2g a 5g : TelephonyManager exige READ_PHONE_STATE depuis l'API 30, permission non ajoutee : subtype laisse absent. (8) Android natif n'a pas de navigation hors connexion : la cle visiteur visitor_uuid n'est pas portee, seuls les comptes et le jeton invite anon_ existent ; l'ecran visiteur d'un lien de suivi est ext:visitor-public-viewer. Les surfaces hashtag, communaute, son n'ont pas d'ecran Android : leurs valeurs d'enum sont definies, rien n'est branche.

FICHIERS CHAUDS ET DISCIPLINE DE PROPRIETE. MeeshyApi.kt et NetworkModule.kt : uniquement network-surface (les quatre APIs du domaine). MeeshyDatabase.kt et DatabaseModule.kt : uniquement telemetry-storage (une seule montee de version 16 vers 17). MeeshyApplication.kt : uniquement counting-delivery et v2-reporter ; les lots suivants ajoutent leurs installeurs/vidangeurs par multibinding Hilt (TelemetryInstaller, TelemetryFlushable) dans leur propre module, sans toucher a l'Application ni a SdkModule (nouveaux singletons en @Inject constructor). AndroidManifest.xml : notification-events (receiver), capture-detection (permission DETECT_SCREEN_CAPTURE), trackedlink-resolve (intent-filter /l/), app-level-telemetry (meta-data Firebase) : hunks disjoints, rebase mecanique. MainActivity.kt : notification-events et trackedlink-resolve (hunks disjoints). PostRepository.kt : counting-delivery, reach-context, interaction-events en serie (depends_on). OutboxFlushWorker.kt et OutboxModel.kt : capture-declaration puis interaction-events (depends_on explicite). Chaine de contention sur feature/feed : detail-provenance, impression-queue, surfaces-impressions-other, listing-visibility-scroll, interaction-events, link-discovery-events.

BUDGET DE TAILLE (CLAUDE.md : plafond dur 1200, ajout interdit a un fichier hors budget). Fichiers deja hors budget que ces lots croisent : MeeshyApp.kt 1202, MessageBubble.kt 1202, ChatScreen.kt 2953, ChatViewModel.kt 2248, FeedComposerSheet.kt 1127, StoryViewerScreen.kt 1113, StoryComposerScreen 2022. Regle appliquee : toute logique neuve vit dans un fichier neuf ; sur ces fichiers on ne pose que des crochets d'une ligne ; trackinglink-list et trackedlink-resolve dependent de ext:meeshyapp-budget-extraction (extraire l'objet Routes et les graphes de navigation de MeeshyApp.kt avant d'y ajouter quoi que ce soit) ; composer-preparation-order extrait d'abord la section pieces jointes de FeedComposerSheet.

DETTE ET RISQUES. (a) MeeshyDatabase est en fallbackToDestructiveMigration : le passage 16 vers 17 efface caches ET outbox. Acceptable tant qu'aucune version publiee n'existe (versionCode 1, 0.1.0) ; sinon ecrire Migration(16,17) avant de livrer. clearAllTables() a la deconnexion purge deja les nouvelles tables, mais chaque ligne porte quand meme un owner (changement de compte sans deconnexion). (b) AuthInterceptor pose X-Session-Token d'office quand aucun JWT n'existe : un en-tete explicite de SocialEventsApi peut etre ecrase par le jeton invite en magasin ; le sender ne passe un en-tete explicite que pour une identite invite et le test le verrouille. (c) Le gate unique est la CI android.yml : la logique est donc poussee dans :core:model (verifiable en local par ./apps/android/meeshy.sh jvm-check) : lots 4, 5, 6, 7 (regle), 8 (contexte), 21 (modele), 23 (politique), 25, 30. (d) Firebase : aucun plugin google-services ni google-services.json dans le depot (firebase-messaging seul) ; app-level-telemetry doit tester FirebaseApp.getApps(context).isEmpty() et ne rien faire sans configuration ; la CI ne peut pas valider la collecte reelle. (e) FLAG_SECURE est global a la fenetre : annoncer ou noircir est un compromis assume (voir capture-announce-or-black), et blockScreenshots n'est lu nulle part aujourd'hui. (f) Avant l'API 34 aucune capture d'ecran n'est detectable, avant 35 aucun enregistrement : silence et capacite non annoncee, jamais une fausse affirmation. (g) Production retrocompatible (CLAUDE.md racine) : tout est additif ; le repli sur posts/impressions/batch et posts/{id}/view n'est tente qu'apres un 404 observe de /social/events ; une ancienne passerelle retire platform sans refuser le lot ; staging d'abord. (h) Locales : les modules Android livrent values (en), fr, es, pt (4) et non les 7 d'iOS ; toute chaine neuve va dans ces quatre fichiers (FeedStringLocalizationParityTest echoue sinon dans feature/feed) ; les trois langues restantes relevent du domaine i18n. (i) Fluidite et memoire : aucun etat Compose observable ne doit etre lu par la mesure (registres tenus dans remember non observable ou singletons), decimation du defilement a 10 Hz hors composition, paliers de 5 % pour la visibilite, files plafonnees (500 comptage, 5 000 v2, 2 000 contexte de listing, 200 ouvertures), ecritures Room asynchrones. (j) L'enregistrement de capture sociale et la declaration de capture de conversation partagent un seul observateur d'ecran (ScreenCaptureObserver dans sdk-core, extrait de feature:calls : jamais feature vers feature). (k) Dependances externes a trancher hors domaine : ext:content-exit-law (ContentExitLaw.swift, 423 lignes, verdict de capture ; premier lot qui en a besoin cree le fichier, un seul proprietaire), ext:chat-read-receipts-flush, ext:media-preparation-pipeline, ext:meeshyapp-budget-extraction, ext:links-hub (le hub Liens a 4 cartes n'existe pas : l'entree provisoire est une carte sur Mes liens de partage, a deplacer), ext:visitor-public-viewer, ext:media-auto-save (consommateur de l'horloge d'installation).

PRISME, PRESENCE, ACCENT. Le Prisme n'est jamais modifie par la mesure : translation_toggle et original_view enregistrent la langue SERVIE et l'originale (SocialPrism) sans changer l'affichage ni le rang de resolution. Aucun evenement n'envoie d'URL, de texte saisi, de requete (longueur seulement) ni d'image. Les ecrans de liens de suivi utilisent l'accent de suivi iOS trackingAccent = indigo600 (4F46E5, MeeshyPalette.Indigo600), pas l'accent de conversation ; aucun point de presence n'intervient.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `analytics-capture-declaration` | A | P1 | M | 850 | sortie-contenu-loi-et-offre, persist-outbox-registre-senders, socket-routage-evenements-ordre-arrivee | Une capture d'écran faite pendant qu'un message éphémère est visible est déclarée de façon fiable, même hors ligne |
| `analytics-capture-detection` | A | P1 | L | 900 | analytics-counting-delivery, analytics-capture-declaration, chat-room-sync-and-read-receipts, composer-glass-shell | Faire une capture d'écran ou enregistrer l'écran pendant qu'un message éphémère est visible prévient son auteur |
| `analytics-consent-standing` | A | P1 | S | 280 | analytics-network-surface | Couper « Analytique » dans les réglages coupe réellement toute la mesure dès le lot suivant |
| `analytics-detail-provenance` | A | P1 | M | 560 | analytics-counting-delivery, analytics-reach-context, post-detail-screen-parity, reels-thread-pager, reels-video-page-and-chrome, persist-outbox-registre-senders, story-viewer-decomposition-and-nav-graph | Ouvrir un post, un réel ou une story compte une vue qui sait d'où l'on vient, et une session de lecture rejouable |
| `analytics-impression-queue` | A | P1 | M | 560 | analytics-counting-delivery, analytics-reach-context, analytics-detail-provenance, feed-screen-split, feed-room-cache-and-realtime | Chaque carte apparue dans le fil ou les statuts est comptée sans jamais se perdre : sortie d'écran, arrière-plan, app tuée, hors ligne |
| `analytics-reach-context` | A | P1 | M | 620 | analytics-v2-catalog-model, analytics-counting-delivery | Une impression sait de quelle page et de quel rang elle vient, et taper un contenu compte une ouverture avec son origine |
| `analytics-surfaces-impressions-other` | A | P1 | M | 420 | analytics-reach-context, analytics-detail-provenance, analytics-impression-queue | Les posts d'un profil, les favoris, À proximité, le rail de stories et les réels sont comptés comme ceux du fil |
| `analytics-trackedlink-resolve` | A | P1 | M | 520 | analytics-network-surface, analytics-counting-wire-model, analytics-reach-context, socle-points-d-extension-de-l-app, message-fil-decodage-complet-et-tolerant, composer-glass-shell | Un lien de suivi collé dans un message ou un post s'ouvre par sa redirection mesurée, sans changer le texte affiché |
| `analytics-trackinglink-create` | A | P1 | M | 360 | analytics-trackinglink-data | Créer un lien de suivi en saisissant une URL, avec nom, paramètres UTM et jeton personnalisé facultatifs |
| `analytics-trackinglink-data` | A | P1 | M | 480 | analytics-network-surface, analytics-telemetry-storage | Mes liens de suivi, leurs statistiques et leurs clics s'affichent instantanément depuis le cache puis se rafraîchissent en silence |
| `analytics-trackinglink-detail` | A | P1 | M | 700 | analytics-trackinglink-data, analytics-trackinglink-list | Le détail d'un lien de suivi montre ses clics par pays, appareil et navigateur, et permet de le copier, partager, afficher en QR code ou supprimer |
| `analytics-trackinglink-list` | A | P1 | M | 520 | analytics-trackinglink-data, analytics-trackinglink-create, socle-points-d-extension-de-l-app | Un écran « Liens de suivi » liste mes liens avec leurs statistiques globales et permet de les copier en un geste |
| `analytics-v2-catalog-model` | A | P1 | M | 760 |  | Chaque interaction avec un contenu est décrite par un catalogue typé d'événements, sans jamais envoyer d'URL, de texte saisi ni d'image |
| `analytics-v2-context-sampling` | A | P1 | M | 400 | analytics-contract-platform-android, analytics-v2-catalog-model, analytics-consent-standing | Chaque lot d'événements décrit l'appareil et la session sans jamais révéler plus que ce que le consentement permet |
| `analytics-v2-reporter` | A | P1 | M | 800 | analytics-telemetry-storage, analytics-v2-catalog-model, analytics-v2-context-sampling, analytics-counting-delivery, socle-points-d-extension-de-l-app | Les événements v2 partent par lots rejouables (50 événements ou 10 s, et à la mise en arrière-plan) sans jamais gêner l'utilisateur |
| `analytics-app-level-telemetry` | A | P2 | S | 260 | analytics-consent-standing, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias | Chaque écran ouvert est compté dans l'analytique d'usage, seulement si l'analyse est autorisée, et l'installation en cours est datée |
| `analytics-contract-platform-android` | A | P2 | S | 0 |  | Les mesures de l'application Android native sont attribuées à la plateforme « android » par la passerelle |
| `analytics-counting-delivery` | A | P2 | M | 780 | analytics-network-surface, analytics-telemetry-storage, analytics-counting-wire-model, analytics-consent-standing, persist-outbox-flusher-classifie, socle-points-d-extension-de-l-app, persist-room-migrations, socle-pipeline-push-et-cycle-de-vie | Les compteurs partent par lots rejouables, sous la bonne identité, et survivent à l'arrière-plan et à la mort du processus |
| `analytics-counting-wire-model` | A | P2 | M | 640 |  | Chaque vue, impression, ouverture et session de lecture porte une identité stable qui permet de la rejouer sans la compter deux fois |
| `analytics-interaction-events` | A | P2 | M | 650 | analytics-v2-reporter, analytics-detail-provenance, analytics-listing-visibility-scroll, analytics-capture-declaration, persist-outbox-registre-senders, feed-room-cache-and-realtime | Réagir, reposter, commenter, sauvegarder, bloquer ou partager envoie l'événement d'interaction là où la geste réussit |
| `analytics-link-discovery-events` | A | P2 | M | 420 | analytics-network-surface, analytics-v2-reporter, analytics-listing-visibility-scroll, recherche-globale-local-d-abord, feed-screen-split | Toucher un lien, chercher des personnes ou visiter un profil est mesuré sans jamais envoyer l'URL ni le texte tapé |
| `analytics-listing-visibility-scroll` | A | P2 | L | 1000 | analytics-measurement-engines, analytics-v2-reporter, analytics-impression-queue, analytics-surfaces-impressions-other, feed-screen-split, feed-room-cache-and-realtime | Une carte n'est « vue » qu'à 50 % pendant 1 seconde, et le défilement du fil est résumé par passage, sans jamais ralentir le scroll |
| `analytics-measurement-engines` | A | P2 | M | 680 |  | La visibilité d'une carte, le défilement et la qualité de lecture vidéo se mesurent par des machines pures, testées sans écran |
| `analytics-network-surface` | A | P2 | M | 380 | reseau-pipeline-reessai-erreurs | L'application sait parler aux portes de mesure, de consentement et de liens de suivi de la passerelle |
| `analytics-notification-events` | A | P2 | M | 420 | analytics-v2-reporter, socle-points-d-extension-de-l-app, socle-pipeline-push-et-cycle-de-vie | Recevoir, afficher, ouvrir ou balayer une notification est mesuré sans jamais envoyer son contenu |
| `analytics-playback-qoe` | A | P2 | M | 470 | analytics-measurement-engines, analytics-v2-reporter, analytics-surfaces-impressions-other | La qualité de chaque lecture d'un réel est résumée en un seul événement à la fin de la session |
| `analytics-social-capture` | A | P2 | M | 340 | analytics-v2-reporter, analytics-impression-queue, analytics-capture-detection | La capture d'écran ou l'enregistrement d'un contenu social (fil, réel, story, profil) est enregistré avec ce qui était à l'écran |
| `analytics-story-negative-events` | A | P2 | M | 450 | analytics-v2-reporter, analytics-detail-provenance, story-viewer-decomposition-and-nav-graph | Le rythme de visionnage d'une story (taps, pause, sortie anticipée, réponse) est mesuré sans jamais envoyer ce qui a été écrit |
| `analytics-telemetry-storage` | A | P2 | M | 330 | persist-room-migrations | Les compteurs et mesures en attente survivent à la fermeture de l'application, séparés par compte |

### Lots fusionnés ou retirés par l'architecture

- `analytics-capture-announce-or-black` → `bouclier-capture-ecran-android` (merge-into) : Même arbitrage « annoncer ou rendre noir ».
- `analytics-composer-preparation-order` → `pieces-jointes-preparation-tuiles` (merge-into) : Même ordre de sélection conservé pendant la préparation.

## Features

### Un contenu qui disparaît est soit annoncé à son auteur, soit rendu noir : jamais capturé en silence

`analytics-capture-announce-or-black` · Android : **absente** · P1 · effort M

iOS : seules les surfaces ENREGISTRÉES auprès du rapporteur (le fil, la Rivière, le plein écran de la conversation) posent `announcesCaptures()` (`EnvironmentValues.announcesCapture`, défaut `false`) ; sous elles, une flamme (message éphémère) quitte la couche sécurisée parce que sa capture sera annoncée. Partout ailleurs (feuille « Plus », épinglés, fil de discussion, aperçu de transfert, réponse en cours, aperçu d'appui long, liste des conversations) la flamme reste NOIRE (`CaptureVerdict.shieldsCapture`). `renderedVerdict(for:)` : une flamme d'autrui dont l'identifiant n'est pas encore celui du serveur (ObjectId) ne peut pas s'annoncer et reste noire jusqu'à ce qu'il le soit ; ses propres messages gardent leur verdict. Garde de couverture `CaptureShieldCoverageGuardTests`.

Écarts :
- CompositionLocal `LocalAnnouncesCapture` (défaut false) et modificateur `announcesCaptures()` à poser UNIQUEMENT par les surfaces enregistrées (liste de chat, plein écran de conversation).
- Rendu noir des messages éphémères sur les surfaces qui n'annoncent pas (transfert, épinglés, fil de discussion, aperçu d'appui long, liste de conversations) ; verdict `blocked` tant que l'id serveur n'est pas un ObjectId.
- Aucun FLAG_SECURE par vue sous Android : `FLAG_SECURE` est global à la fenêtre. Stratégie : afficher un masque opaque (couche noire) sur les surfaces non annonçantes, et poser FLAG_SECURE dynamiquement (DisposableEffect) uniquement tant qu'un contenu noir est composé dans une fenêtre qui n'annonce pas ; ne pas le poser sur les surfaces annonçantes sinon la capture ne se déclenche plus et rien ne s'annonce.
- Respecter le réglage existant « bloquer les captures » (`blockScreenshots` de PrivacyPreferences) qui n'est lu nulle part dans l'UI à ce jour (aucun FLAG_SECURE dans le code).
- Masquer l'aperçu du sélecteur de tâches (`setRecentsScreenshotEnabled(false)`) quand un éphémère est visible.
- Test de couverture équivalent à `CaptureShieldCoverageGuardTests` : toute surface qui rend un message éphémère déclare explicitement si elle annonce.

Rendu : Flamme éphémère : bulle remplacée par un aplat noir (même gabarit que la bulle, coins identiques) avec la flamme de l'accent de conversation, tant que la surface n'annonce pas ; aucune transition ni flash au passage noir -> clair.

Transposition Android : CompositionLocal + `Window.setFlags(FLAG_SECURE)` / `clearFlags` géré par DisposableEffect ; `Activity.setRecentsScreenshotEnabled(false)` (API 33+).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ContentCaptureReporter.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsScreen.kt`

### Faire une capture d'écran ou enregistrer l'écran pendant qu'un message éphémère est visible prévient son auteur

`analytics-capture-detect-declare` · Android : **absente** · P1 · effort M

iOS (#9617) : `ContentCaptureReporter` DÉTECTE une capture (`userDidTakeScreenshotNotification`) ou un enregistrement/recopie d'écran (`UIScreen.capturedDidChangeNotification` + `isCaptured`, iOS 16-26) et DÉCLARE à la passerelle les messages RÉELLEMENT visibles ; elle juge et écrit l'avis. Chaque surface qui montre des messages s'enregistre (`ContentCaptureSource` : le fil Bulles/Focal/Script lit ses cellules visibles `indexPathsForVisibleItems`, la Rivière ses cadres mesurés, le plein écran/galerie sa page courante ; `isCaptureCover` fait que sous un plein écran seules ses surfaces comptent). `ContentCaptureVisibility.candidates(message)` : ni avis ni supprimé, une vue unique n'est candidate que RÉVÉLÉE, la citation portée par une réponse est une seconde candidate. `ContentCaptureCandidate.isDeclared` : verdict non libre, pas à soi, ObjectId 24 hex (un message encore en vol `cid_…` ne se déclare pas). `ContentCaptureReport` : ≤ 10 messages par déclaration, un lot par conversation, dédoublonné dans l'ordre de l'écran, `captureId` `cap_<uuid>` (8-64 car.). `ContentCaptureTracker` : une capture d'écran = un identifiant à elle ; un enregistrement garde UN identifiant du début à la fin, battement d'1 s qui déclare chaque éphémère qui PARAÎT, au plus une déclaration par conversation toutes les 10 s (budget passerelle 6/min/conversation), `reportFailed` remet à déclarer. Avant la déclaration, la surface pose l'accusé de lecture de ce qu'elle montre (`flushSeenNow`). Transport (`ContentCaptureService`) : socket `message:capture-detected` d'abord, repli REST `POST /conversations/:id/messages/capture` avec le MÊME `captureId`, un refus FINAL du socket ne se rejoue pas.

Écarts :
- Aucune détection de capture sur contenu de conversation (seul le relais d'enregistrement dans un appel existe) : créer `ContentCaptureReporter` (@Singleton) avec détection capture d'écran + enregistrement, et ignorer silencieusement ce qui n'est pas détectable (OS < 34 / < 35).
- Modèles purs : `ContentCaptureKind`, `ContentCaptureCandidate` (`isDeclared`, `isObjectId`), `ContentCaptureReport` (`reports(for:kind:captureId)`, chunks de 10, `newCaptureId`, `isValidCaptureId`, `isDeclarableMessageId`), `ContentCaptureTracker` (recordingStarted/note/recordingEnded/reportFailed, intervalle 10 s).
- Interface `ContentCaptureSource` (`isCaptureCover`, `visibleCaptureCandidates()`, `acknowledgeVisibleReads()`) : implémenter pour la liste de messages du chat (`LazyListState.layoutInfo.visibleItemsInfo`), la galerie plein écran, et tout autre plein écran de média.
- `ContentCaptureVisibility.candidates(message, serverId)` : exclure message système et supprimé, vue unique seulement révélée, ajouter la citation du message répondu (verdict `announced` si nature non déclarée) ; dépend de la loi de sortie du contenu (`ContentExitLaw`, vue unique, flammes) à porter.
- Battement d'enregistrement : minuteur 1 s (tolérance 0,3 s) tant qu'un enregistrement dure, annulé à l'arrêt.
- Accusé de lecture immédiat des messages visibles avant la déclaration (équivalent `flushSeenNow`), puis délai de décantation 1,5 s avant le vidage de la file.
- `ContentCaptureService` : émission socket `message:capture-detected` avec ack (liste des `noticedMessageIds`), délai d'échéance puis repli REST `POST conversations/{id}/messages/capture` ; mapping 429 => RATE_LIMITED (rejouable), 404/410/422/403 => refus final.
- Verdict d'envoi `ContentCaptureDispatchOutcome` (done/retry/drop, 2 essais pour un message jugé non annoncé) : voir analytics-capture-durable-declaration.

Rendu : Aucun rendu côté capturant (aucun toast) ; côté auteur, l'avis apparaît comme message système dans la conversation (écran de chat, autre partie). Le battement d'enregistrement ne doit jamais bloquer le fil principal.

Transposition Android : Capture d'écran : `Activity.registerScreenCaptureCallback` (API 34+, `DETECT_SCREEN_CAPTURE`, ne se déclenche que si l'activité est visible). Enregistrement/recopie : `WindowManager.addScreenRecordingCallback` (API 35+, `DETECT_SCREEN_RECORDING`, un seul état visible/non visible) - code déjà présent dans `RealScreenRecordingDetector` à factoriser. Surfaces visibles : `LazyListState.layoutInfo`. Transport : `MessageSocketManager` Android + Retrofit.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ContentCaptureReporter.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ContentCapture.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContentCapture.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContentCaptureService.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/ScreenRecordingDetector.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### La déclaration d'une capture survit à l'arrière-plan, au hors-ligne et au relancement de l'application

`analytics-capture-durable-declaration` · Android : **absente** · P1 · effort S

iOS : chaque déclaration entre dans la file hors ligne (`OutboxKind.reportContentCapture`, charge `ReportContentCapturePayload` avec `clientMutationId`, conversation, messageIds, kind, captureId). Persistée, elle survit à l'arrière-plan, à la perte du réseau et au relancement, et se rejoue avec le recul exponentiel de la file tant que la passerelle l'accepte (24 h après la lecture) ; seul un refus FINAL (non-participant, conversation close, forme refusée) la fait partir. `OutboxContentCaptureDeclarer` enfile chaque rapport puis attend `readSettleDelay` (1,5 s) avant `OutboxFlushTrigger.flushNow()`, le temps que l'accusé de lecture précède la déclaration. `ContentCaptureDispatchOutcome.of(result, declared, attempts)` : succès complet => `done` ; message jugé mais non annoncé au-delà de 2 essais => `done` ; RATE_LIMITED ou panne => `retry` ; refus final => `drop`.

Écarts :
- Ajouter `REPORT_CONTENT_CAPTURE` à `OutboxKind` (absent) avec sa charge sérialisée et la migration Room correspondante.
- Répartiteur de la file pour ce type : appeler `ContentCaptureService.sendContentCapture`, classer le résultat avec `ContentCaptureDispatchOutcome.of`, appliquer le recul exponentiel de la file existante et l'expiration à 24 h.
- `OutboxContentCaptureDeclarer.declare(reports)` : enfiler chaque rapport (clé = conversationId), délai 1,5 s, déclencher le vidage immédiat de la file.
- Tests : rejeu hors ligne, refus final, message non annoncé après 2 essais, idempotence par `captureId`.

Rendu : Aucun rendu.

Transposition Android : File Room `OutboxRepository` existante + WorkManager pour le vidage différé ; le recul exponentiel est celui de la file Android déjà en place.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ContentCaptureReporter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContentCapture.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`

### Les pièces jointes choisies apparaissent dans l'ordre de sélection même si une préparation finit avant une autre, et une prise de la caméra de l'app est marquée comme telle

`analytics-composer-preparation-order` · Android : **absente** · P1 · effort M

iOS : `PreparationTracking.track` suit une préparation de pièce jointe (compression, vignette) jusqu'à `.ready` et la promeut dans les trois dictionnaires du pipeline de publication (pièces, fichiers, vignettes). La place se réserve À LA SÉLECTION (#9776) : la pièce prête s'insère juste après la dernière pièce choisie AVANT elle (sélection 3,1,5,2,4 => zone 3,1,5,2,4 même si 4 finit le premier). `capturedInApp` (#9775) marque la pièce issue de la caméra de l'application (provenance connue seulement ici, voyage jusqu'au téléversement). Succès : haptique `success`. Échec : haptique `error` + toast d'erreur (`FeedbackToastManager`) ; dans les deux cas la tuile « en préparation » disparaît. Utilisé par le compositeur de conversation et par celui du fil.

Écarts :
- Pas d'état « pièce en préparation » : `MediaUploadItem` est un tableau d'octets déjà prêt ; introduire un `PreparingAttachment` (id, vignette, état) avec tuile de progression dans le plateau du compositeur.
- Fonction pure `placed(ready, zone, selectedBefore)` (insertion après le dernier id présent dans `selectedBefore`) avec test de l'exemple 3,1,5,2,4 ; la place est réservée à la sélection, pas à la fin de préparation.
- Champ `capturedInApp` sur la pièce jointe et dans le téléversement/publication (absent dans les DTO Android) ; le poser pour la caméra intégrée (`ChatCameraCapture`) et pas pour la galerie.
- Retour haptique succès/erreur et toast d'erreur sur échec de préparation ; retirer la tuile dans tous les cas.
- Brancher le chat et le compositeur de fil (FeedComposerSheet) sur le même site unique de suivi.

Rendu : Tuile en préparation à la place finale de la pièce (dimensions de la tuile prête, vignette floutée + indicateur de progression) ; le passage à « prête » ne déplace aucune autre tuile (pas de saut).

Transposition Android : `HapticFeedbackType` Compose ou `View.performHapticFeedback(CONFIRM/REJECT)` ; snackbar/toast Meeshy pour l'erreur ; coroutines (`async`/`await`) pour la préparation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/PreparationTracking.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaRepository.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Une impression sait de quelle page du listing elle vient, à quel rang et par quelle source de classement

`analytics-listing-context` · Android : **absente** · P1 · effort S

SDK iOS : la passerelle sert avec chaque page un identifiant opaque `meta.feedRequestId` et, par élément, `rankingSource`. `ListingContextLedger` (singleton verrouillé) retient, par surface, de quelle page vient chaque élément (capacité 2 000, plus anciens oubliés, identifiant de page ≤ 128 caractères, source inconnue repliée sur `other`), sans rien persister ni rattacher à un compte. `PostService.listed(page, on:)` note chaque page servie ; l'impression d'une carte recopie page + source avec le rang auquel la carte est RENDUE (`listing(on:postId:position:)`). Rien n'entre dans `FeedPost` : une carte ne se redessine pas pour être située. Remis à zéro à la déconnexion.

Écarts :
- Ni `rankingSource` sur `ApiPost`, ni `feedRequestId` dans les métadonnées de pagination (aucune occurrence dans le code Android) : les ajouter aux DTO, avec décodage tolérant.
- Créer `ListingPageIndex` (pure : capacité 2 000, clé surface+postId, ignorer une page sans identifiant ni source) et `ListingContextLedger` (@Singleton protégé par Mutex/ReentrantLock) avec `note(...)`, `listing(...)`, `reset()`.
- Enregistrer chaque page servie dans PostRepository pour fil, réels, profil, favoris, hashtag, communauté, son, proches (`surface` explicite), et à la déconnexion appeler `reset()`.
- `SocialRankingSource` (following, for_you, trending, nearby, search, hashtag, sound, profile, bookmarks, other) avec repli sur `other`.

Rendu : Aucun rendu. Le registre est lu au moment de l'impression et ne doit jamais devenir un champ observable des cartes (pas de recomposition).

Transposition Android : Kotlin pur (:core:model pour l'index, :sdk-core pour le registre Hilt). Aucun équivalent plateforme.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ListingContext.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService+SocialEvents.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Taper un contenu d'un listing compte une ouverture avec son origine, reprise par l'écran détail comme provenance

`analytics-open-engagement` · Android : **absente** · P1 · effort M

iOS : le tap d'un contenu dans un listing (fil, profil, favoris, hashtag, communauté, proches, son, rail de stories, avatar d'humeur, citation, recherche) fait deux choses : il MARQUE l'entrée du contenu (`ContentEntry.listing(origin)`, consommée par le détail à sa première apparition pour compter l'impression et la vue avec provenance `listing`) et envoie `open` avec l'origine. `ContentOpenReporter` : file bornée à 200, vidée après 1 s ou sur `willResignActive`/`didEnterBackground`, propre au compte qui a tapé (jamais envoyée sous le jeton d'un autre), enveloppe posée au tap (rejeu = même eventId daté du tap), repli visiteur pour un lecteur sans compte. Portes : `Router.openPostDetail(post/id, from:)`, `ReelsPresenter.present(posts:startId:from:)` et `openStory(of: group)` (le tap d'un anneau porte la story que l'anneau MONTRE : première non vue sinon première active).

Écarts :
- Créer `ContentOpenReporter` (file 200, flush 1 s, scope par compte, flush sur ON_PAUSE/ON_STOP, rejeu des non-envoyés en tête) sur le fil `/social/events`.
- Registre `DetailOpenSources` : le tap marque `ContentEntry.listing(origin)`, le détail (PostDetail, lecteur de réels, lecteur de story) le consomme à la première apparition pour émettre impression + vue avec `provenance` et `origin`.
- Passer l'origine à la navigation : helpers `openPostDetail(postId, origin)`, ouverture du lecteur de réels avec origine, `openStory(group)` basé sur la story affichée par l'anneau.
- Brancher les autres provenances de l'écran détail : `notification` (ouverture depuis une notification), `shared_link` (`?via=`), `tracking_link` (`/l/<jeton>`), `external`, `direct`.
- Lecteur sans compte : file visiteur (clé `visitor_<uuid>` ou jeton `anon_…` d'invité de lien) ; l'invité de lien existe côté Android (GuestJoin) mais aucune clé visiteur n'est tenue.
- Les `open` ne comptent AUCUNE vue : les envoyer dans leur requête dédiée (voir analytics-events-counting-wire).

Rendu : Aucun rendu. L'ouverture du détail reste instantanée : le tap n'attend jamais le réseau et l'envoi est différé d'1 s.

Transposition Android : Hilt @Singleton + file Room ou mémoire bornée ; flush par `ProcessLifecycleOwner` ; la marque d'entrée passe par un registre injectable (équivalent `DetailOpenSourceProviding`) ou un argument de navigation Navigation Compose.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ContentOpenReporter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContentReach.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Créer un lien de suivi en saisissant une URL, avec nom, paramètres UTM et jeton personnalisé facultatifs

`analytics-trackinglink-create` · Android : **absente** · P1 · effort M

iOS : `CreateTrackingLinkView`, feuille avec `NavigationStack`, titre inline « Nouveau lien de tracking », « Annuler » à gauche. Champs : « URL de destination * » (clavier URL, sans majuscule automatique, placeholder https://meeshy.me, indice a11y « Champ obligatoire »), « Nom interne » (placeholder « ex. : Campagne Instagram »). Section repliable « Paramètres UTM » (chevron haut/bas, ressort 0,3/0,8, transition déplacement haut + fondu) : Campagne, Source, Moyen avec exemples. « Token personnalisé (optionnel) » (« ex. : summer24 (6 caractères min.) », aide « Laissez vide pour un token aléatoire », sans majuscule ni correction). Bouton « Créer le lien » capsule pleine largeur, dégradé trackingAccent -> brandPrimary, désactivé et à 50 % d'opacité tant que l'URL est vide ou non analysable, spinner pendant la création. Succès : haptique succès, le lien est inséré en tête de liste, les stats rechargées, la feuille se ferme. Échec : message d'erreur (footnote, couleur erreur) + annonce VoiceOver, bouton réactivé. Champs vides envoyés comme absents.

Écarts :
- Créer `CreateTrackingLinkSheet` + ViewModel (champs, validité, isCreating, erreur) ; feuille modale ou plein écran selon la taille de fenêtre.
- Validité iOS = URL non vide et analysable par `URL(string:)` (très permissive) ; sur Android valider un schéma http/https explicite plutôt que de reproduire cette faiblesse.
- Section UTM repliable avec animation ressort et transition, état conservé pendant la saisie ; envoyer `null` pour tout champ vide.
- Jeton personnalisé : poser la clé `customToken` (voir analytics-trackinglink-sdk) ; 6 caractères minimum à valider côté client avant l'envoi.
- États du bouton (désactivé/opacité 0,5, spinner), erreur inline annoncée par TalkBack (`LiveRegion`), haptique succès, insertion en tête de liste et rechargement des stats via le callback.
- Gérer `existed == true` (lien déjà créé pour la même URL) : iOS l'ignore, afficher au minimum le lien existant plutôt qu'un doublon.
- Chaînes ×7 langues et libellés/indices d'accessibilité (champ obligatoire, création en cours, bouton désactivé).

Rendu : Champs en rayon `MeeshyRadius.sm` avec fond blanc 8 % en sombre / noir 4 % en clair, libellés caption medium en `textSecondary` au-dessus du champ, marges xl, espacement md entre champs ; bouton capsule avec dégradé trackingAccent -> brandPrimary, texte callout bold blanc ; erreur en footnote couleur `MeeshyColors.error`.

Transposition Android : Compose `ModalBottomSheet`/dialogue plein écran, `KeyboardOptions(keyboardType = Uri, capitalization = None)`, `AnimatedVisibility` (spring) pour le repli UTM.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkScreen.kt`

### Le détail d'un lien de suivi montre ses clics par pays, appareil et navigateur, et permet de le copier, partager, afficher en QR code ou supprimer

`analytics-trackinglink-detail` · Android : **absente** · P1 · effort M

iOS : `TrackingLinkDetailView`, titre = nom du lien. Carte d'en-tête (pastille 60 pt, nom, URL courte monospace, puces UTM campagne/source/moyen colorées, valeur d'accessibilité Actif/Inactif). Barre de 4 actions (tuile 46 pt + libellé) : Copier (bascule en coche verte 2 s, haptique succès, annonce « Lien copié »), Partager (feuille système sur l'URL courte), QR code (génère un QR niveau H x10 et le partage en image), Supprimer (confirmation « Supprimer ce lien ? », retire puis ferme). Statistiques : 2 grandes cartes (Total des clics, Clics uniques) et « Dernier clic : date abrégée + heure ». Si des clics existent : cartes PAYS, APPAREILS, NAVIGATEURS (top 5, barre de 8 pt dont la part est calculée sur le total des clics du lien, « Aucune donnée » si vide), puis « DERNIERS CLICS » (20 lignes max sur 50 chargés : icône d'appareil colorée, drapeau emoji du pays, ville ou pays ou « Inconnu », « · source sociale », navigateur · OS, temps relatif, point vert/rouge de redirection confirmée/échouée avec libellé a11y, spinner pendant le chargement). Enfin « CONFIGURATION UTM » (Campaign, Source, Medium, URL de destination, Créé le).

Écarts :
- Créer `TrackingLinkDetailScreen` + ViewModel (chargement des clics via `fetchClicks(token)`, agrégats pays/appareils/navigateurs triés décroissant).
- Carte d'en-tête, barre d'actions, grandes cartes de stats, ligne « Dernier clic », cartes de ventilation (top 5, barre proportionnelle au `totalClicks`), timeline de 20 clics, section UTM ; sections de ventilation et timeline masquées si aucun clic.
- Copier : coche verte 2 s + haptique + annonce accessibilité ; Partager : `Intent.ACTION_SEND` de l'URL courte ; QR : générer avec ZXing (déjà dépendance de :feature:profile) puis partager l'image via FileProvider ; Supprimer : dialogue de confirmation, suppression puis retour.
- Échec de suppression silencieux sur iOS (catch vide) : afficher au moins un message d'erreur sur Android.
- Drapeau emoji depuis le code pays (indicateurs régionaux U+1F1E6…), icône + couleur d'appareil (mobile/phone, tablet, desktop, défaut globe), point de redirection (vert = `confirmed`, rouge sinon) avec description TalkBack, temps relatif localisé.
- Spinner de chargement du détail, état sans clic, libellés ×7 langues (les titres UTM « Campaign/Source/Medium » sont en dur en anglais sur iOS : les localiser).

Rendu : Marges lg, espacement xl entre blocs, bas 60 ; cartes avec dégradé de surface teinté trackingAccent et contour accent, rayons xl (en-tête), md (stats), lg (ventilations) ; barres de 8 pt : piste accent à faible opacité, remplissage accent opaque ; libellé de ventilation sur 80 pt, compteur sur 30 pt aligné à droite ; lignes de clic avec séparateur décalé de 52 ; puces UTM en capsule caption2 medium ; couleurs d'appareil : mobile = trackingAccent, tablette = brandPrimary, desktop = indigo300, autre = neutral500 ; texte d'action caption2 medium sous la tuile 46 pt de rayon smPlus.

Transposition Android : ShareLink/UIActivityViewController => `Intent.ACTION_SEND`/`createChooser` (+ FileProvider pour l'image QR) ; CIQRCodeGenerator niveau H => ZXing `QRCodeWriter` (EncodeHintType.ERROR_CORRECTION = H) ; `confirmationDialog` => `AlertDialog` M3 ; `Date.formatted(.relative)` => `DateUtils.getRelativeTimeSpanString`.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkDetailScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileShareSheet.kt`

### Un écran « Liens de suivi » liste mes liens avec leurs statistiques globales et permet de les copier en un geste

`analytics-trackinglink-list` · Android : **absente** · P1 · effort M

iOS : `TrackingLinksView`, entrée du hub « Liens » (carte « Liens de suivi », aussi atteinte depuis le widget). En-tête personnalisé : chevron retour (haptique légère, retour opérant en pile iPhone, panneau droit iPad et feuille), titre centré « Liens de suivi » (headline bold), bouton « + » plein (accent) qui ouvre la création en feuille. Corps scrollable avec rafraîchissement par tirage : bandeau de 4 cartes statistiques (Liens, Clics, Uniques, Actifs ; icônes link, cursorarrow.click, person.fill, checkmark.circle), puis section « MES LIENS ». États : chargement (spinner seulement si cache vide), vide (`EmptyStateView` icône chart.bar.fill, « Aucun lien de tracking » / « Créez un lien pour suivre vos clics et campagnes », compact, accent de suivi), liste. Ligne : pastille 40x40 (accent clair, grisée si inactif) avec chart.bar.fill, nom 1 ligne (subheadline semibold), « N clics » (accent) · « N uniques » · campagne (muted), bouton copier l'URL courte (haptique succès), chevron vers le détail. Données cache-first : cache `fresh` => affiché sans rafraîchir, `stale` => affiché puis rafraîchi, sinon réseau.

Écarts :
- Aucun écran ni route : créer `TrackingLinksScreen` + `TrackingLinksViewModel` (état links/stats/isLoading) et la route de navigation ; point d'entrée dans le hub Liens (Android n'a que « Mes liens de partage » via le menu radial, pas de hub à 4 catégories).
- Bandeau de 4 cartes de statistiques (Liens, Clics, Uniques, Actifs) alimenté par `fetchStats()`, masqué tant que les stats sont nulles.
- Section « MES LIENS » : état de chargement (cache vide seulement), état vide dessiné, liste de lignes avec copie de l'URL courte (presse-papiers + haptique succès) et navigation vers le détail.
- Tirage pour rafraîchir (`PullToRefreshBox`) ; cache-first fresh/stale/empty (voir analytics-trackinglink-sdk).
- Retour opérant en pile téléphone et en panneau secondaire tablette/pliable (équivalent `PanelBackAction`).
- Chaînes ×7 langues (tracking.links.title, .create.a11y, .stats.*, .section.myLinks, .empty.*, .row.clicks/uniques, common.copyLink) et libellés d'accessibilité (titre en en-tête, cartes combinées, bouton copier).

Rendu : Accent de suivi `MeeshyColors.trackingAccent` (hex `trackingAccentHex`) pour icônes, compteurs et traits ; fond `backgroundGradient` du thème ; cartes à rayon `MeeshyRadius.md` avec dégradé de surface teinté par l'accent + contour 1 dp accent à faible opacité ; espacements `MeeshySpacing` (lg 16 en marges, xl 24 entre sections, bas 40) ; titres de section caption semibold, espacement de lettres 0,8 ; icônes à taille relative (Dynamic Type => sp) ; haptique légère sur retour/plus, succès sur copie.

Transposition Android : Compose Material 3 `PullToRefreshBox`, `LazyColumn`, `ClipboardManager`, `HapticFeedback` ; Navigation Compose ; pane secondaire via `ListDetailPaneScaffold` sur tablette/pliable (équivalent du panneau droit iPad).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MyShareLinksScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Chaque interaction avec un contenu est décrite par un catalogue typé d'événements, sans jamais envoyer d'URL, de texte saisi ni d'image

`analytics-v2-catalog` · Android : **absente** · P1 · effort M

SDK iOS : le catalogue v2 de `POST /social/events` (#10499-#10509). Enveloppe `SocialEventV2` (`eventId` UUID v4, `occurredAt`, `target` {kind, id, parent}, `surface`, `listing`, `prism`) + charge d'une des familles : interaction (react, comment_open/submit, share + destination, save, follow, profile/hashtag/sound/mention_tap, caption_expand, translation_toggle, original_view, repost, quote, download_open), négatif (quick_skip < 1 s, not_interested, see_less, hide, mute/hide_author, report_open/submit, block, unfollow_from_content), lien (outbound_click, tracking_link_followed, preview_open), découverte (search_submitted, search_result_click, search_abandoned, *_visit), story (reply_sent, quick_reaction, poll_vote, sticker/link/mention taps, exit_before_end, tap_forward/back, swipe_next_author, hold_pause), notification (received/displayed/opened/dismissed × apns/fcm/webpush/in_app), screen_capture, scroll (listing/content), visibility, playback. `SocialPrism` mesure le Prisme Linguistique (langue affichée/originale, traduit ou non, source serveur/appareil). Encodage PLAT, aucune clé null, ≤ 2 Kio par événement, fractions à 2 décimales. Contexte par requête : schemaVersion 2, plateforme, version/build (≤ 20 car.), OS majeur.mineur, classe d'appareil, réseau, langue d'interface, locale appareil, consentement, capacités, taux d'échantillonnage ; `AppSessionClock` (nouvelle session au démarrage à froid et après 30 min d'inactivité) ; tirage d'échantillonnage stable par session et type (FNV-1a).

Écarts :
- Créer tous les types sérialisables (`SocialTargetKind` 11 valeurs, `SocialTarget` + parent + fabriques `hashtag()`/`link()`, `SocialListing`, `SocialRankingSource`, `SocialPrism.served`, `SocialSurface` chaîne ouverte, 11 familles avec leurs énumérations d'actions) ; une charge par famille, encodage plat.
- `isSampleable` (défilement, playback, visibilité) et `isAllowedForVisitor` (visibilité, playback, défilement, capture d'écran, lien, découverte ; ni interaction, ni négatif, ni story, ni notification).
- Contraintes d'envoi : ≤ 2 048 octets par événement sérialisé, ≤ 200 événements par requête, âge max 72 h, `fraction()` à 2 décimales, troncatures (reasonCode 64, notificationType 64, appVersion/build 20).
- Contexte : ATTENTION, l'enum `platform` du contrat ne contient que `ios`, `web`, `android_shell` (Capacitor) et `pwa` ; l'app Kotlin native exige une valeur additive `android` dans `packages/shared` et la validation de la passerelle (ouvrir l'issue contrat avant d'écrire).
- Contexte Android : `Build.VERSION.RELEASE` (majeur.mineur), classe d'appareil (smallestScreenWidthDp ≥ 600 => tablet ; ChromeOS => desktop), réseau via `ConnectivityManager` (wifi/cellular/ethernet/offline, sous-type 2g-5g possible, absent côté iOS), `uiLanguage` = langue système de l'utilisateur, `deviceLocale`, capacités (`screenshot`, `screen_recording` selon l'API, `scroll`, `playback_qoe`).
- `AppSessionClock` (30 min, jamais persistée) et `SocialEventsSampling.keeps` (hachage FNV-1a 64 bits de `appSessionId|type`, taux servis par la passerelle).
- Tests JVM : golden JSON de chaque famille (clés exactes, aucune clé null), plafond 2 Kio, restriction visiteur.

Rendu : Aucun rendu. Vocabulaire strictement identique à iOS (valeurs d'énumération en snake_case) pour que la passerelle et les tableaux de bord comparent les plateformes.

Transposition Android : kotlinx.serialization avec sérialiseurs polymorphes plats (`JsonContentPolymorphicSerializer` ou encodeur manuel) ; `ConnectivityManager.NetworkCapabilities` pour le réseau ; `Configuration.smallestScreenWidthDp` pour la classe d'appareil.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventsV2.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventsV2Families.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventsV2Context.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallAnalytics.kt`

### Les événements v2 partent par lots rejouables (50 événements ou 10 s, et à la mise en arrière-plan) sans jamais gêner l'utilisateur

`analytics-v2-reporter` · Android : **absente** · P1 · effort M

iOS : `SocialEventsV2Reporter.emit` est le point d'entrée UNIQUE des événements v2 de l'app (mutations, lecteurs, captures, défilement, notifications). Il filtre par identité (compte, ou visiteur dont la file porte une empreinte du jeton, jamais le jeton ; la télémétrie ne fabrique jamais de clé visiteur), ne laisse passer au visiteur que les types autorisés, applique l'échantillonnage servi par la passerelle, puis enfile dans `SocialEventsV2Outbox` (SQLite, 5 000 lignes max, par propriétaire). Cadence : tous les 50 événements ou 10 s, plus un envoi au passage en arrière-plan sous une tâche de fond (`beginBackgroundTask`). Envoi : contexte écrit une fois, événements conservés à l'octet près (même `eventId` au rejeu), jusqu'à 4 passes par vidage. Issues : `delivered` (retire, retient le taux d'échantillonnage servi), `unsupported` (400 : la file v2 est jetée SANS rejeu et dort une heure, sommeil non persisté), `refused` (4xx définitif : retire), `transient` (réseau, 5xx, 408, 429 : rejoue, même eventId). Vide aussi la boîte `SocialNotificationInbox` (événements de notification reçus/affichés/ouverts produits par l'extension de service) avant l'envoi. Les services du SDK émettent via `SocialEventsV2Hub`, installé au lancement. Les files de COMPTAGE (impressions, vues, séances) ne sont jamais touchées.

Écarts :
- Table Room `social_events_v2_outbox` (propriétaire, eventId, charge JSON encodée, createdAt) plafonnée à 5 000 lignes, purge > 72 h, `enqueue`, `flush(owner){…}`, `dropAll`, `purgeAll` (déconnexion).
- `SocialEventsV2Reporter` (@Singleton) : `emit` sérialisé (chaîne de coroutines pour préserver l'ordre), identité compte/visiteur, filtre `isAllowedForVisitor`, échantillonnage par type, compteur 50 événements, minuteur 10 s, `flushNow`.
- `SocialEventsV2Gate` (sommeil 1 h après 400, non persisté) et `SocialEventsV2Outcome` (delivered/unsupported/refused/transient) avec la règle de classement des erreurs (`outcome(of:)`).
- Construction du corps `{context, events:[octets bruts]}` : contexte restreint à l'identité puis `sentAt` ; 200 événements max par requête, 4 passes par vidage ; reçu `{recorded, rejected, ignored, accepts, sampling}` (le taux d'échantillonnage servi remplace l'ancien).
- Envoi garanti à la mise en arrière-plan : déclencher un `OneTimeWorkRequest` expédié (contrainte réseau) depuis ON_STOP plutôt qu'une coroutine qui mourrait avec le processus.
- Boîte de notifications (`SocialNotificationInbox`) : le service FCM (`onMessageReceived`) y dépose received/displayed/opened/dismissed (canal `fcm`) ; le reporter la vide avant chaque flush.
- `SocialEventsV2Hub` : puits installé au démarrage de l'application pour que les repositories du SDK émettent sans dépendre de l'UI ; sans puits (extension, test) rien ne part.
- Test d'acceptation : 400 jette la file v2 et endort l'envoi, les files de comptage restent intactes.

Rendu : Aucun rendu. Règles de comportement : zéro spinner, zéro erreur visible, jamais bloquant ; un échec n'est que journalisé.

Transposition Android : Room (:core:database) pour l'outbox ; WorkManager (expedited, NetworkType.CONNECTED) pour l'envoi garanti ; `ProcessLifecycleOwner` ON_STOP pour le déclencheur arrière-plan ; FCM `MeeshyFirebaseMessagingService` pour la boîte de notifications ; coroutines (Mutex) pour la sérialisation.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/SocialEventsV2Reporter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventsV2Dispatch.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`

### La recherche de personnes et les visites de profil, hashtag, son ou communauté sont mesurées sans jamais envoyer le texte tapé

`analytics-discovery-events` · Android : **absente** · P2 · effort S

iOS : `DiscoveryTelemetry` construit les événements v2 de découverte. `searchSubmitted(searchId, query, peopleCount)` envoie la LONGUEUR de la requête rognée, le nombre de résultats et `resultKind: profile` (rien si la requête est vide ; seule la recherche de PERSONNES est une découverte, chercher dans ses messages n'en est pas une) ; `searchId` est celui que la passerelle a SERVI (`meta.searchId`), jamais fabriqué. `profileResultTapped(searchId, userId, position)` porte le rang et la source de classement `search`. `profileVisit(userId, viewerId)` ignore sa propre page ; `visit(.hashtagVisit / .soundVisit / .communityVisit, target, surface)`. Appelé par GlobalSearchViewModel, HashtagResultsView et ProfileUserPostsList.

Écarts :
- Fabriques `searchSubmitted`, `profileResultTapped`, `profileVisit`, `visit` sur le catalogue v2 (famille `discovery`).
- Conserver `meta.searchId` renvoyé par la recherche de personnes dans le ViewModel de recherche globale Android et le restituer avec chaque tap de résultat (position 0-based).
- Émettre `profile_visit` à l'ouverture d'un profil tiers, `hashtag_visit` à l'ouverture des résultats d'un hashtag, `community_visit`, `sound_visit` avec la surface correspondante.
- Ne jamais journaliser la requête : longueur seulement, langue de requête optionnelle.

Rendu : Aucun rendu. L'événement part après l'affichage des résultats, jamais avant.

Transposition Android : Appels depuis les ViewModels de recherche et de profil vers le reporter injecté (Hilt).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DiscoveryTelemetry.swift`

</details>

### Chaque écran ouvert est compté dans l'analytique d'usage, seulement si l'analyse est autorisée

`analytics-firebase-screen-views` · Android : **absente** · P2 · effort S

iOS : `AnalyticsManager` (@MainActor singleton) active ou coupe la collecte Firebase Analytics selon `UserPreferencesManager.privacy.allowAnalytics` (`syncCollectionState()` à l'init et à chaque changement du réglage). `trackScreen(name, class)` journalise `screen_view`. `trackRoute(route)` traduit chaque `Route` en nom d'écran stable (≈ 35 noms : Conversation, Settings, Profile, Contacts, PeopleDiscovery, NearbyDiscovery, Community*, Notifications, UserStats, Progression, Progression.<section>, Progression.Rules/Notebook/Concept.<c>/Dashboard, Links, Affiliate, TrackingLinks, ShareLinks, CommunityLinks, DataExport, PostDetail, HashtagResults, Bookmarks, StarredMessages, FriendRequests, StoryNotificationTarget, MoodSpotlight) ; repli « ConversationList » quand aucune route n'est poussée.

Écarts :
- Le projet n'embarque que `firebase-messaging` : ajouter `firebase-analytics` (BoM) et la configuration google-services ; collecte désactivée par défaut dans le manifeste (`firebase_analytics_collection_enabled=false`) jusqu'à lecture du réglage.
- `AnalyticsManager` (@Singleton Hilt) : `syncCollectionState()` à l'initialisation ET à chaque émission de `PrivacyPreferencesStore.preferences` (`setAnalyticsCollectionEnabled`).
- Désactiver le suivi d'écran automatique (`google_analytics_automatic_screen_reporting_enabled=false`) pour ne pas doubler les `screen_view`.
- Écouteur de destination Navigation Compose (`addOnDestinationChangedListener`) qui mappe chaque route Android vers le MÊME nom d'écran qu'iOS (table `analyticsScreenName`), repli « ConversationList ».
- Journaliser l'état (collecte activée/désactivée) au niveau info.

Rendu : Aucun rendu. Noms d'écran strictement identiques à iOS pour que les tunnels soient comparables entre plateformes.

Transposition Android : Firebase Analytics Android (`logEvent(Event.SCREEN_VIEW)` avec `Param.SCREEN_NAME`/`SCREEN_CLASS`, `setAnalyticsCollectionEnabled`) ; Navigation Compose `NavController.addOnDestinationChangedListener`.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/AnalyticsManager.swift`

</details>

Android existant : `apps/android/gradle/libs.versions.toml`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesStore.kt`

### L'application sait quand l'installation en cours a commencé, pour ne réenregistrer dans l'album que les médias reçus depuis

`analytics-install-clock` · Android : **absente** · P2 · effort S

iOS : `AppInstallationClock` (#10370) renvoie l'instant où l'installation en cours a commencé : posé à la première lecture et gardé dans UserDefaults (effacé par la désinstallation, donc une réinstallation repart d'un nouvel instant). Protocole `AppInstallationDateProviding`. Il sépare les médias REÇUS pendant cette installation (enregistrés seuls dans l'album par `ReceivedMediaAutoSaver`) de ceux que la synchronisation de l'historique ramène (jamais réenregistrés seuls).

Écarts :
- Interface `AppInstallationDateProvider` (injectable, horloge de test) et implémentation Hilt.
- Source de l'instant : `PackageInfo.firstInstallTime` (repart à zéro après réinstallation) ou DataStore EXCLU de la sauvegarde automatique Android (`dataExtractionRules`/`fullBackupContent`), sans quoi une restauration Auto Backup réinjecterait l'ancienne date et réenregistrerait l'historique.
- Consommateur : l'enregistrement automatique des médias reçus dans la galerie (absent côté Android à ce jour, voir la partie médias) ne doit enregistrer que les médias reçus après cet instant.

Rendu : Aucun rendu.

Transposition Android : `PackageManager.getPackageInfo().firstInstallTime` ou DataStore hors sauvegarde ; équivalent du réglage « Enregistrer les médias reçus dans la galerie » via MediaStore.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/AppInstallationClock.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`

### Réagir, reposter, commenter, bloquer ou partager envoie l'événement d'interaction là où la mutation réussit

`analytics-interaction-events` · Android : **absente** · P2 · effort M

SDK iOS : une interaction v2 ne recompte rien (compteur, état et notification restent à la route de mutation) ; l'événement dit seulement QU'elle a eu lieu, quand et avec quel `mutationId` (= `clientMutationId`). `SocialInteractionEvents` fournit les fabriques `interaction`/`negative`, la traduction d'une `platform` de partage en destination (`share_destination` : copy_link, conversation, native_sheet, story, repost, external_app, other), `targetKind(postType:)` (REEL, STORY, STATUS, sinon post) et `event(forDelivered: OutboxRecord)` qui lit une mutation de la file durable à son envoi RÉUSSI, datée de son enfilement : like/unlike => react/unreact, repost => repost ou quote, commentaire => comment_submit, blocage => négatif block. `SocialEventsV2Hub` relaie les événements du SDK vers la file de l'app.

Écarts :
- Créer `SocialEventsV2Hub` (puits installable, thread-safe) et les fabriques `interaction`/`negative`/`shareDestination`/`targetKind`.
- Émission à la livraison de la file durable : l'`OutboxKind` Android couvre LIKE_POST, UNLIKE_POST, BOOKMARK_POST, BLOCK_USER mais pas REPOST ni CREATE_COMMENT ; soit ajouter ces mutations à la file (rejeu hors ligne iso iOS), soit émettre depuis le repository au succès de l'appel direct.
- `occurredAt` = date d'enfilement de la mutation (le geste), `mutationId` = `clientMutationId` ; save/unsave et follow/unfollow à mapper de la même façon.
- Émissions de gestes sans mutation : comment_open, share (avec destination), profile_tap, hashtag_tap, sound_tap, mention_tap, caption_expand, translation_toggle (Prisme), original_view, download_open.
- Événements négatifs : quick_skip (réel/story quitté avant 1 000 ms de visibilité), not_interested, see_less, hide, mute/hide_author, report_open/submit, unfollow_from_content.
- Événements de story : tap_forward/back, hold_pause, swipe_next_author, exit_before_end, reply_sent, quick_reaction, poll_vote, sticker/link/mention taps (slideIndex, slideCount, elapsedMs).
- Mesure du Prisme (`SocialPrism.served`) jointe aux événements de contenu.

Rendu : Aucun rendu. Les interactions ne ralentissent jamais le geste (émission asynchrone, optimistic update inchangé).

Transposition Android : Hub Hilt @Singleton ; `OutboxRepository` (sdk-core) pour l'émission à la livraison ; appels directs au succès des repositories pour les actions hors file.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialInteractionEvents.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Toucher un lien dans un contenu social enregistre seulement son domaine (ou l'identifiant du lien de suivi), jamais l'URL

`analytics-outbound-link-events` · Android : **absente** · P2 · effort S

iOS : `OutboundLinkEvents.event(for:surface:)` transforme un lien touché en événement v2 `link` : pour un lien http(s) externe, `outbound_click` avec le DOMAINE enregistrable (eTLD+1) ; pour un lien `meeshy.me/l/<jeton>`, `tracking_link_followed` avec le jeton (≤ 64 car.) ; un lien interne à Meeshy (profil, post, conversation), un schéma non http(s) ou une adresse IP ne produit rien. `RegistrableDomain` (SDK) ignore chemin, requête, sous-domaine et IP, connaît ~70 suffixes publics à deux niveaux (co.uk, com.br, github.io, vercel.app…) et se rabat sur les deux derniers libellés. Le modificateur `tracksOutboundLinks(surface:)` intercepte `openURL` sous la surface (fil, profil, hashtag…), émet puis remet le lien au gestionnaire PARENT : le comportement d'ouverture ne change pas.

Écarts :
- Porter `RegistrableDomain.of(url|host)` (liste de suffixes multi-libellés, exclusion des IP v4/v6, minuscules, points de bord) avec tests.
- `OutboundLinkEvents.event(url, surface)` : domaines propres dérivés de l'origine web de l'environnement actif (`ServerEnvironmentResolver.webOrigin`) au lieu du `meeshy.me` codé en dur d'iOS, pour que staging ne soit pas traité en lien externe.
- Enrober l'ouverture de lien des contenus sociaux (`LocalUriHandler` fourni via `CompositionLocalProvider`, cartes de post, profil, hashtag, commentaires) : émettre puis déléguer au gestionnaire d'origine ; la bulle de conversation n'est PAS une surface sociale (aucun événement).
- Surface par écran (`feed`, `profile`, `hashtag`, `comments`, `link_preview`).
- Famille `link` du catalogue v2 et cible `link` (id = domaine ou jeton).

Rendu : Aucun rendu : l'ouverture du lien (onglet Chrome Custom Tab ou ACTION_VIEW) reste identique et instantanée, l'événement part après.

Transposition Android : `LocalUriHandler` (Compose) / hook dans `openChatLink` pour l'interception ; `ServerEnvironmentResolver.webOrigin` pour le domaine propre.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/OutboundLinkTelemetry.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/RegistrableDomain.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkOpenPolicy.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/RichMessageText.kt`

### La qualité de chaque lecture vidéo d'un contenu social est résumée en un seul événement à la fin de la session

`analytics-playback-qoe` · Android : **absente** · P2 · effort M

iOS : méthode Mux/Conviva. `PlaybackQoEAccumulator` (pur, horloges ms relatives) additionne pendant la lecture et rend à la fin UN `PlaybackSummary` : démarrage (première image), `exitBeforeStart`, temps joué, rebufferings (compte + durée, un buffer vide avant la première image est du démarrage), code et domaine d'erreur (jamais un message), débit moyen observé, changements de rendition, boucles, pauses, recherches, muet au départ, bascules du son, sous-titres, quartiers atteints (bitmask 1/2/4/8 = 25/50/75/100 %), raison de sortie (completed, swiped, closed, backgrounded, error, other). `PlaybackQoEObserver` s'abonne à `AVPlayer` (timeControlStatus, buffer vide / prêt, journal d'accès, échec de lecture, fin d'élément pour la boucle d'un réel) sans minuterie ni travail par image ; `finish(reason)` rend l'unique événement `playback`. Seul un `PlaybackQoESubject` déclaré (post/réel + surface + mediaId + durée) déclenche la mesure : une vidéo de conversation n'en produit pas.

Écarts :
- Porter `PlaybackQoEAccumulator` + `PlaybackQuartiles.mask` + `PlaybackSummary` (Kotlin pur, tests des règles de rebuffer et de quartiles).
- Observateur Media3 : `Player.Listener`/`AnalyticsListener` (`onRenderedFirstFrame` => démarrage ; `onPlaybackStateChanged` BUFFERING/READY => rebuffer ; `onIsPlayingChanged` => joué/pauses ; `onPlayerError` => code + nom de domaine ; `onBandwidthEstimate`/`onDownstreamFormatChanged` => débit et rendition ; `onPositionDiscontinuity(SEEK)` ; `onMediaItemTransition(REPEAT)` => boucle ; `onVolumeChanged` => bascules du son).
- `PlaybackQoESubject` posé par la surface (réels, détail de post, statut) ; aucune mesure sans sujet (vidéos de conversation exclues).
- Raisons de sortie : completed / swiped (glisse vers le réel suivant) / closed / backgrounded (ON_STOP) / error.
- Émettre un événement `playback` unique (famille v2, échantillonnable, autorisée au visiteur) ; capacité `playback_qoe` annoncée dans le contexte.

Rendu : Aucun rendu. L'observateur ne doit ajouter ni latence au premier cadre ni travail par image ; il se détache (removeListener) dès `finish`.

Transposition Android : AVPlayer KVO/notifications => Media3 ExoPlayer `Player.Listener` + `AnalyticsListener` (androidx.media3 1.4.1 est déjà dépendance). Pas de Handler/minuterie pour échantillonner.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/PlaybackQoE.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackQoEObserver.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`

### Le défilement du fil, d'un carrousel, d'un texte long ou des commentaires est résumé par passage, sans jamais ralentir le scroll

`analytics-scroll-depth` · Android : **absente** · P2 · effort M

iOS : `ListingScrollTracker` (un par surface, `feed` pour iPhone et iPad) est nourri par l'offset vertical que la surface relaie déjà ; `ScrollDepthAccumulator` décime à 10 Hz (100 ms), classe la vitesse (<500, 500-1 500, 1 500-4 000, ≥ 4 000 pt/s), borne les écarts à 1 s. Un « passage » se termine à la sortie d'écran, au passage en arrière-plan (`didEnterBackground`), après 30 s sans défilement suivies d'une reprise, ou par un segment toutes les 60 s. Le tracker reçoit aussi le rang rendu, les pages paginées, rafraîchissements, « atteint la fin » et le nombre de cartes visibles. Il n'a aucune propriété publiée (rien ne se redessine). `ContentScrollTracker` émet un `scroll.content` par contenu et par ouverture (carrousel : index max ; texte long / commentaires : fraction parcourue et lue jusqu'au bout), rien si le lecteur n'a pas bougé.

Écarts :
- Porter `ScrollDepthAccumulator`, `ScrollListingSession` (segment 60 s) et `ScrollContentAccumulator` (dans ScrollDepth.swift, hors de cette partie mais requis) en Kotlin pur testable.
- Source d'offset Android : accumuler le delta Y d'un `NestedScrollConnection` (onPostScroll) converti en dp (équivalent des « points »), plutôt que d'inférer depuis `firstVisibleItemScrollOffset` qui saute à chaque cellule.
- `ListingScrollTracker(surface)` avec `noteOffset`, `noteRendered(position)`, `noteViewable`, `noteRefresh`, `notePagination`, `noteReachedEnd`, `finish()` ; fin de passage après 30 s d'inactivité suivies d'une reprise et sur ON_STOP.
- `ContentScrollTracker(target, contentKind, itemsTotal, surface)` : carrousel via `PagerState.currentPage`, texte long/commentaires via fraction de scroll ; émission à la fermeture, rien si pas bougé.
- Émettre `scroll.listing` / `scroll.content` (famille du catalogue v2, échantillonnable par la passerelle, autorisée au visiteur).
- Câbler le fil, les réels, le profil, hashtag, communauté ; le fil Android n'expose aujourd'hui aucun relais d'offset.

Rendu : Aucun rendu. Exigence : aucun état Compose lu pendant le scroll, décimation à 10 Hz hors fil de composition, aucune allocation par image.

Transposition Android : `NestedScrollConnection` / `LazyListState` + `snapshotFlow` ; `PagerState` pour les carrousels ; `ProcessLifecycleOwner` ON_STOP pour la fin de passage ; `SystemClock.elapsedRealtime()` pour l'horloge ms.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ListingScrollTracker.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

### La capture d'écran ou l'enregistrement d'un contenu social (fil, réel, story, profil) est enregistré avec ce qui était à l'écran

`analytics-social-capture` · Android : **absente** · P2 · effort M

iOS : `SocialCaptureReporter` (#10508) est le SECOND abonné des observateurs de capture : il enregistre QU'une capture a eu lieu, sur quelle surface et quels contenus (≤ 10 cibles) étaient à l'écran, jamais l'image. Événement v2 `screen_capture` : `screenshot`, `recording_started`, `recording_stopped` (+ durée en ms, la capture écran étant `recording_or_mirroring`). Les surfaces qui mesurent leurs cadres s'enregistrent (`SocialCaptureSource`, dernière enregistrée prioritaire) ; à défaut, `RecentDisplayCaptureSource` approxime par les ≤ 10 dernières apparitions des 120 dernières secondes de la surface de la dernière apparition (une citation de bulle est exclue ; type de cible déduit : status, reel, story, post). Une capture sous une CONVERSATION n'est pas son affaire (annoncée à l'auteur par la déclaration de contenu éphémère) : rien ne part.

Écarts :
- `SocialCaptureReporter` : registre de sources (références faibles), `screenshotTaken()`, `screenCaptureChanged(isCaptured)` avec état `recording` (début + instantané) et émission de `recording_stopped` avec la durée écoulée.
- `RecentDisplayCaptureSource` (horizon 120 s, capacité 10, déduplication par cible) alimenté par la file d'impressions (voir analytics-impression-queue) ; mapping source/surface => genre de cible.
- Cibles visibles (`SocialVisibleTarget` kind+id+fraction optionnelle) ; les écrans qui mesurent leurs cadres (réels, détail de post, story, profil) peuvent s'enregistrer via `LazyListState`/`onGloballyPositioned`.
- Détection d'une capture : Android n'a pas de notification unique ; voir analytics-capture-detect-declare (callback d'activité API 34, enregistrement API 35).
- Ne rien émettre quand le contenu d'une conversation est à l'écran (partage de la décision avec la déclaration de capture de conversation).

Rendu : Aucun rendu. Aucun message ni toast pour l'utilisateur qui capture.

Transposition Android : `Activity.ScreenCaptureCallback` (API 34+, permission `DETECT_SCREEN_CAPTURE`) pour la capture d'écran ; `WindowManager.addScreenRecordingCallback` (API 35+, permission `DETECT_SCREEN_RECORDING`) pour l'enregistrement, déjà utilisé par `ScreenRecordingDetector` des appels ; avant ces API : indétectable => silence, jamais une fausse affirmation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/SocialCaptureReporter.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/ScreenRecordingDetector.kt`

### Une carte n'est « vue » que si au moins 50 % restent visibles 1 seconde (2 secondes pour une vidéo)

`analytics-viewability-mrc` · Android : **absente** · P2 · effort M

iOS : chaque carte de listing porte un `ViewabilityMeter` (norme IAB/MRC) : `viewable` quand ≥ 50 % de la surface est visible pendant ≥ 1 s continue (≥ 2 s pour une vidéo en lecture). La mesure ne conditionne PAS l'impression (chaque listing compte) : elle la qualifie (`maxVisibleFraction`, `visibleMs`, `viewable`). Aucune minuterie par cellule : le compteur est nourri par les changements de cadre, relayés par paliers de 5 % (`steppedFraction`), et conclut à l'instant où on le lit. Le cadre est lu dans l'espace global, rapporté à la FENÊTRE de la scène (Stage Manager, Split View), pas à l'écran. À la sortie d'écran part `visibility/measured` reliée à l'impression par `impressionEventId`. `ListingViewabilityTracker` suspend (fraction 0) sur `willResignActive` et reprend sur `didBecomeActive`. Le modificateur `countsListedImpression` pose apparition, géométrie et disparition sans aucune propriété publiée (la carte ne se redessine pas).

Écarts :
- Porter `ViewabilityMeter` en Kotlin pur (seuils 0,5 / 1 000 ms / 2 000 ms, fraction à 2 décimales, `visibleMs` cumulé, `measure(atMs, impressionEventId)`), avec les tests des cas limites (fraction qui retombe, vidéo, relecture).
- Calcul `steppedFraction(frame, viewport)` par paliers de 5 % (les seuils 0 et 50 % tombent sur un palier).
- Modificateur Compose `countsListedImpression(postId, isVideo, position)` : `onGloballyPositioned` (ou `snapshotFlow` sur `LazyListState.layoutInfo`) -> fraction par palier uniquement ; la sonde (eventId, fraction) tenue dans un `remember` non observable pour éviter toute recomposition.
- Viewport = fenêtre de l'app (multi-fenêtre, écran pliable, mode fenêtré ChromeOS) via `LocalWindowInfo.containerSize`, pas la taille d'écran.
- `ListingViewabilityTracker` : `begin/note/visibility/end`, `suspend()`/`resume()` sur ON_PAUSE/ON_RESUME de l'activité, émission de `visibility/measured` (famille visibilité du catalogue v2, échantillonnable) à la sortie.
- Reporter la mesure encore en file sur l'impression (`noteGone`) quand la carte part avant l'envoi du lot.

Rendu : Aucun rendu. Contrainte de fluidité forte : aucun callback par image pendant le scroll (paliers de 5 %), aucune minuterie par carte, aucune recomposition liée à la mesure.

Transposition Android : Compose `Modifier.onGloballyPositioned` + `boundsInWindow()` ; `LocalWindowInfo` pour la fenêtre ; Lifecycle ON_PAUSE/ON_RESUME pour suspend/resume ; horloge monotone `SystemClock.elapsedRealtime()` (équivalent `CACurrentMediaTime`).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ViewabilityMeter.swift`
- `apps/ios/Meeshy/Features/Main/Services/ListingViewability.swift`

</details>

### Les vues, impressions, ouvertures et sessions de lecture sont comptées une seule fois, même rejouées après une panne

`analytics-events-counting-wire` · Android : **divergente** · P1 · effort M

SDK iOS : `POST /social/events` est la seule porte de comptage (#10483). Quatre événements : `view` (durée, surface, entrée/provenance), `impression` (source, surface, contexte de listing, visibilité), `open` (origine du tap) et `dwell`/`dwell-start` (session de consommation). Chacun porte une enveloppe `eventId` (UUID, stable d'une tentative à l'autre ; dérivé par hachage SHA-256 pour les sessions) + `occurredAt` ISO 8601 posée à la CRÉATION. Identité : compte (JWT) ou visiteur (`X-Session-Token` `anon_…` / `visitor_<uuid>`). Les `open` partent dans une requête à part (un ancien serveur qui les refuse n'emporte ni vues ni impressions) ; un refus définitif (4xx hors 408/429) retire sa requête, une panne se rejoue avec les MÊMES identifiants. Énumérations fermées miroir de `packages/shared/types/content-reach.ts` : 14 surfaces (`ReachSurface`), 12 origines (`OpenOrigin`), 6 provenances (`ViewProvenance`). Décodage tolérant (valeur inconnue = absente, ancien format sans enveloppe relu sans perte).

Écarts :
- Android appelle encore les routes historiques `posts/impressions/batch` ({postIds, source}) et `posts/{id}/view` ({duration}) que iOS n'appelle plus ; elles restent montées pour les versions publiées, mais perdent surface, provenance, rang, visibilité, consentement et identifiants de rejeu.
- Créer les modèles Kotlin `SocialEvent` (view/impression/open/dwell/dwellStart), `ReachSurface` (14 valeurs, `story_rail`, `mood_avatar`…), `OpenOrigin` (12), `ViewProvenance` (6) et `ContentEntry` (une origine n'accompagne qu'un `listing`) ; `detailImpressionSource` (notification / shared_link / detail).
- Enveloppe `SocialEventStamp` : `eventId` UUID v4 minuscule posé à la création, `occurredAt` ISO 8601 UTC, `stableEventId(key)` pour les sessions dwell (clé durable => même UUID), enveloppe APLATIE dans le JSON, décodage tolérant.
- Endpoint Retrofit `POST social/events` avec en-têtes variables (`X-Session-Token` pour un visiteur) et corps `{events:[…], context:{sentAt, consent}}` ; reçu `{recorded, rejected}`.
- Partition `SocialEventsDispatch.requests` (open dans sa requête) et règle `isPermanentRefusal` (401/403/4xx hors 408/429 => retire ; réseau/5xx/429 => rejoue) ; livraison qui rend seulement le non-envoyé, enveloppes conservées.
- Brancher `EngagementSessions` (dwell) et le `viewPost` dédoublonné sur `view`/`dwell`/`dwell-start` avec `surface` et `entry` au lieu de `posts/{id}/view`.
- Remplacer `PostRepository.recordImpressions` par l'envoi d'événements `impression` ; conserver les anciennes routes en repli uniquement si la passerelle répond 404 (rétrocompatibilité de la production).

Rendu : Aucun rendu. Exigences de comportement : jamais de spinner ni d'erreur visible sur un échec de comptage (silencieux, journal debug), aucun appel sur le fil principal, aucune clé JSON `null` (le schéma de la porte la refuse).

Transposition Android : kotlinx.serialization (`explicitNulls = false`, discriminant `type`), Retrofit/OkHttp existants (`PostApi`), `java.time.Instant` + `DateTimeFormatter.ISO_INSTANT` pour `occurredAt`, `MessageDigest` SHA-256 pour les identifiants stables.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEvents.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventStamp.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ContentReach.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService+SocialEvents.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`

### Couper « Analytique » dans les réglages coupe réellement toute la mesure dès le lot suivant

`analytics-consent-standing` · Android : **partielle** · P1 · effort S

iOS : `AnalyticsConsentStanding` (SocialEventsV2Reporter.swift) est la règle UNIQUE du consentement d'analyse côté client : bascule « Analytique » coupée (valeur par défaut comprise) => `denied`, toujours, même si la passerelle garde un accord plus ancien ; bascule active => `granted` seulement si la passerelle l'a confirmé (`grantedConsents` contient `analytics`), sinon `unknown`. La même règle sert le lot v2 (par son contexte) et le lot de COMPTAGE (source installée au lancement, relue à chaque lot) ; sous `denied`, le contexte est restreint (`restricted(for:)` : ni identifiant de session, ni version fine, ni locale d'appareil, ni réseau) et la passerelle retire rang/page/visibilité des impressions.

Écarts :
- Le réglage `allowAnalytics` existe et ne gate que `EngagementSessions.begin(consentGranted)` (dwell reels/story/détail) ; ni les impressions, ni aucun lot ne le lisent.
- Ajouter l'enum `Consent { granted, denied, unknown }` et la fonction pure `consent(allowAnalytics, serverGranted)`.
- Lire `grantedConsents` (consentements confirmés par la passerelle, liste serveur du profil) : absent du modèle Android.
- Installer une source de consentement relue à CHAQUE lot de comptage (équivalent `SocialEventsConsentSource.install`) et l'écrire dans `context.consent` du corps.
- Appliquer `restricted(for:)` au contexte v2 (visiteur ou `denied` => seulement plateforme et langue d'interface).
- Tests JVM purs de la table de décision (4 cas) et de la restriction du contexte.

Rendu : Aucun rendu propre. Le libellé et l'interrupteur « Analytique » vivent déjà dans PrivacySettingsScreen ; vérifier seulement que le texte d'aide dit que l'interrupteur coupe aussi la mesure des impressions et des défilements.

Transposition Android : Kotlin pur dans :core:model (règle) + :sdk-core (source injectée via Hilt, lisant PrivacyPreferencesStore.preferences). Aucun équivalent plateforme requis.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/SocialEventsV2Reporter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEvents.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SocialEventsV2Context.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Privacy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsScreen.kt`

### Chaque carte apparue dans le fil est comptée sans jamais se perdre : sortie d'écran, arrière-plan, app tuée, hors ligne

`analytics-impression-queue` · Android : **partielle** · P1 · effort M

iOS : `ImpressionBatcher` groupe les impressions d'une surface (source + `ReachSurface`) avec trois filets : `flushNow()` à la sortie d'écran, flush automatique sur `willResignActive`/`didEnterBackground`, et persistance de la file à chaque `record` (rejouée au lancement suivant, même sans nouvelle apparition). Délai de groupement 3 s, plafond 500 (les plus anciennes tombent), lots de 200. Chaque occurrence porte son enveloppe (eventId + heure) dès le `record`. La file appartient à un COMPTE (clé `meeshy.impressions.pending.<source>[.<surface>][@<userId>]`) : le changement de compte ne mélange rien, la déconnexion purge tout. Un refus définitif (4xx hors 408/429, ou 2xx illisible) abandonne le paquet ; réseau, 5xx, 429 et session expirée restent rejouables et reviennent en tête de file. `recordListed` ajoute rang rendu, page servie et source de classement, et ouvre la mesure de visibilité MRC de la carte ; `noteGone` la clôt et l'attache à l'impression encore en file. `RecentDisplayCaptureSource.noteDisplayed` est alimenté à chaque enregistrement.

Écarts :
- Le batcher Android est en mémoire : l'app tuée dans la fenêtre de 3 s perd le lot, un compte qui change garde la file de l'autre ; ajouter la persistance Room (ou DataStore) par clé source+surface+compte, plafonnée à 500.
- Pas de flush au passage en arrière-plan : brancher `ProcessLifecycleOwner` (ON_PAUSE/ON_STOP) vers `flushNow`, avec envoi garanti par un `OneTimeWorkRequest` expédié si le processus est menacé.
- Rejeu au démarrage d'une surface dont la file persistée n'est pas vide (équivalent du `scheduleFlush` à l'init), même si rien ne s'affiche.
- Purge de toutes les files d'impressions à la déconnexion (`purgeAllPendingImpressions`) et adoption du compte courant à chaque `record`/`flush`.
- Enveloppe (eventId + occurredAt) par occurrence et envoi en `impression` de `/social/events` par paquets de 200 ; règle de rejet permanent vs rejouable, reste non envoyé remis en tête.
- `recordListed(postId, position, isVideo)` + `noteVisible(fraction, eventId)` + `noteGone(eventId)` pour porter rang, page, source et visibilité (voir analytics-listing-context et analytics-viewability-mrc).
- Seules deux surfaces (fil, statuts) instancient un batcher ; iOS compte aussi réels, profil, favoris, hashtag, communauté, proches, son, rail de stories, avatar d'humeur et citation : une instance par surface avec sa `ReachSurface`.
- Hook `noteDisplayed` vers la source des dernières apparitions (voir analytics-social-capture).

Rendu : Aucun rendu. Contraintes de fluidité : l'enregistrement d'une apparition ne doit provoquer aucune recomposition (pas d'état observable) et l'écriture disque est asynchrone (iOS réencode tout le tableau à chaque record : sur Android, insérer une ligne).

Transposition Android : Room dans :core:database (table `pending_impressions`, DAO par clé) ; `ProcessLifecycleOwner` pour willResignActive/didEnterBackground ; WorkManager pour le rejeu garanti après kill. Pas de singleton global : une instance par surface tenue par son ViewModel, comme le `@StateObject` iOS.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ImpressionBatcher.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusesViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Un lien de suivi collé dans un message ou un post s'ouvre via sa redirection mesurée sans changer le texte affiché

`analytics-trackedlink-resolve` · Android : **partielle** · P1 · effort M

SDK iOS : la passerelle attache à un message ou un post une liste `trackedLinks` de couples `{url, token}` (Optional partout : un ancien contenu se décode sans). Le client ne réécrit jamais le texte : il résout `<origine web de l'environnement actif>/l/<token>` (jamais `meeshy.me` en dur : un jeton de staging n'existe pas en production) comme cible tapable de l'URL brute, ce qui capture le clic et redirige (302) vers la page d'origine ; l'aperçu vidéo et le texte affiché restent intacts. `trackedLinkMap` replie la liste en `[url: token]` (dernier jeton gagnant). `TrackedLinkService.resolve(token)` (`GET /tracking-links/:token/resolve`) rend `ResolvedTrackedLink` (kind, targetType POST/REEL/STORY/STATUS/CONVERSATION/PROFILE/EXTERNAL, targetId, originalUrl, sharerId, isActive, expiresAt, `sharer` {displayName?, username, avatar?} dont l'échec de décodage n'invalide pas la résolution) ; `recordClick(token)` (`POST …/click` avec `socialSource: ios-app`, meilleur effort, jamais d'exception vers la navigation) compte les ouvertures depuis l'app comme celles du web. La décision de routage (quel écran ouvrir) reste côté app.

Écarts :
- L'interface sait remplacer une URL brute par `…/l/<token>` (`MessageTextParser.resolvedLinkUrl`, paramètre `trackedLinks` de `MessageBubble`/`RichMessageText`), mais AUCUN producteur n'alimente ce paramètre : ajouter le modèle `TrackedLink {url, token}` et le champ `trackedLinks` aux DTO message ET post, avec `trackedLinkMap`.
- Origine codée en dur (`https://meeshy.me/l/` dans `MessageTextParser.meeshyUrl`) : utiliser l'origine web de l'environnement actif (`ServerEnvironmentResolver.webOrigin`), sinon les jetons de staging ne résolvent pas.
- Étendre les posts/commentaires/statuts (iOS : « posts » aussi) : la redirection doit s'appliquer aux contenus sociaux, pas seulement aux bulles.
- `TrackedLinkService.resolve(token)` + `ResolvedTrackedLink` (+ `TrackedLinkSharer` : pseudo vide rejeté, échec de décodage du partageur toléré) et `recordClick(token)` avec `socialSource` Android (`android-app`, à valider avec la liste blanche de la passerelle).
- Intent-filter App Links pour `https://meeshy.me/l/` (et l'hôte staging) avec `autoVerify` : le manifeste ne déclare que /auth/magic-link, /u/, /chat/, /join/ ; routeur vers la cible typée (post, réel, story, statut, conversation, profil, externe) et provenance `tracking_link` des vues.
- Écran d'un visiteur sans compte : « {nom} vous a partagé ce réel » à partir de `sharer`.

Rendu : Le texte affiché reste l'URL brute (soulignée comme un lien) ; seule la cible change. Aucun indicateur visuel de suivi (principe de transparence du Prisme et de discrétion).

Transposition Android : Android App Links (`<intent-filter android:autoVerify>` + `assetlinks.json` côté web) ; Retrofit pour resolve/click ; `ServerEnvironmentResolver.webOrigin` pour l'origine.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/TrackedLink.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/TrackedLinkService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageTextParser.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/RichMessageText.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/ServerEnvironment.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### Les liens de suivi se créent, se listent, se suppriment et leurs clics se lisent depuis l'application

`analytics-trackinglink-sdk` · Android : **partielle** · P1 · effort M

SDK iOS : modèles `TrackingLink` (id, token, name, campaign/source/medium UTM, originalUrl, shortUrl, totalClicks, uniqueClicks, isActive, expiresAt, createdAt, lastClickedAt ; `displayName` = nom ou jeton), `TrackingLinkClick` (pays, ville, appareil, navigateur, OS, referrer, socialSource, redirectStatus, clickedAt), `TrackingLinkDetail`, `TrackingLinkStats` (totalLinks, totalClicks, uniqueClicks, activeLinks), `CreateTrackingLinkRequest` (le jeton personnalisé part sous la clé `customToken`, sous `token` il était ignoré en silence) et `CreatedTrackingLink` (la passerelle enveloppe `{trackingLink, existed}` ; forme antérieure sans enveloppe encore lue). `TrackingLinkService` : `GET /tracking-links/user/me?offset&limit` (liste, `trackingLinks`), `GET /tracking-links/stats`, `POST /tracking-links`, `GET /tracking-links/:token/clicks?offset&limit`, `PATCH /tracking-links/:token` ({isActive}), `DELETE /tracking-links/:token`. Cache SWR `trackingLinks` (clé « list »).

Écarts :
- Seuls les modèles existent (TrackingLink.kt) : aucun endpoint Retrofit, aucun repository, aucun cache.
- Bug de contrat : `CreateTrackingLinkRequest.token` est sérialisé sous `token` ; la passerelle lit `customToken` (annotation `@SerialName("customToken")` à poser).
- Ajouter `CreatedTrackingLink` (décodage de `{trackingLink, existed}` avec repli sur le lien nu), réponses `{trackingLinks:[…]}` et détail `{link, clicks, total}`.
- Dates : Android garde `createdAt`/`lastClickedAt`/`clickedAt`/`expiresAt` en String ; parser en `Instant` pour l'affichage (« Dernier clic » abrégé, « Créé le », temps relatif des clics).
- `TrackingLinksApi` (Retrofit) : userMe, stats, root (POST), byTokenClicks, byToken (PATCH/DELETE) ; `TrackingLinkRepository` Hilt avec `listLinks(offset, limit)`, `fetchStats()`, `createLink`, `fetchClicks`, `setActive`, `deleteLink`.
- Cache Room cache-first/SWR : `fresh` => affiche sans rafraîchir, `stale` => affiche puis rafraîchit en silence, `empty` => spinner ; stockage de la liste (clé « list ») et des stats.

Rendu : Aucun rendu propre ; fournit les états fresh/stale/empty que les écrans de liens de suivi consomment.

Transposition Android : Retrofit + kotlinx.serialization (:core:network, :core:model), Room (:core:database) pour le cache SWR.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/TrackingLinkModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TrackingLink.kt`

