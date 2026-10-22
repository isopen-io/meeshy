# Parité iOS → Android : `media-audio-video`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**92 features iOS** : 55 absentes, 36 partielles, 1 divergentes, 0 complètes sur Android. **63 lots** planifiés (≈52550 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**media-audio-video#1** (couverture Android estimée ≈ 10 %)

Cette partie couvre la couche média iOS : lecteur de vocal en bulle (waveform scrubbable, vitesse, transcription karaoké, pistes traduites en voix clonée, reprise multi-appareil), enregistreur et éditeur audio (rognage, fondu, vitesse, volume), lecteur vidéo unifié (inline, plein écran, PiP, AirPlay, pool de lecteurs et politique thermique), visionneuses d'image, de document et de code, éditeur d'image non destructif (filtres, réglages, recadrage, historique), images animées (GIF/APNG/WebP) et couches Lottie, filigranes de marque, profil vocal (consentement, vérification d'âge, échantillons, RGPD), rapports de consommation en outbox, préchargement des messages des 20 premières conversations et réponse depuis le plein écran d'une pièce. Côté Android, l'état est très partiel : on trouve la logique pure portée (plan de chrome audio, résolveur karaoké, fusions de transcription et de pistes traduites, politique de téléchargement auto, VideoDismissWatchReport, session d'enregistrement vocal), une visionneuse d'image à pager/pinch/double-tap/enregistrement, la pilule d'enregistrement vocal du composer, un aperçu audio dans l'overlay d'appui long et les surfaces ExoPlayer des réels et des stories. Il n'existe AUCUN lecteur de vocal dans la bulle (le tap ouvre l'URL avec UriHandler), AUCUN lecteur vidéo en bulle ni plein écran (une vidéo de conversation est classée dans les fichiers), aucun moteur audio partagé ni gestion du focus audio, aucune reprise ni rapport de consommation (/attachments/:id/status absent de l'API), aucun éditeur audio ou image, aucune image animée (Coil sans décodeur GIF), aucun Lottie, aucun profil vocal (modèles seuls), aucun visualiseur de document ou de code intégré (ACTION_VIEW), aucun filigrane de marque. Le dégel du Kotlin natif (directive 2026-10-22) impose donc d'abord le socle (moteur audio, moteur vidéo, consommation) avant les surfaces riches ; environ 10 % de cette partie est à iso.

**media-audio-video#2** (couverture Android estimée ≈ 10 %)

Cette partie couvre la couche « média » côté app et SDK iOS : lecture vocale (bulle, pile multi-pistes, mini-lecteur, carte Now Playing, plein écran à cadran circulaire avec paroles karaoké), enregistrement vocal (moteur, sessions audio, ducking, forme d’onde), transcription et traduction audio, profil vocal (wizard + gestion), pipeline d’envoi des pièces jointes (préparation, compression image/vidéo, upload groupé TUS, outbox hors ligne, barre de progression), lecteurs vidéo (poster net, disponibilité, PiP, filtres d’appel), galerie plein écran (lois de cadrage, chrome adaptatif, réactions par pièce, réponse en place), écran « Médias, liens et documents », enregistrement local avec marque, réglages de téléchargement et le kit de chrome plein écran partagé.
Côté Android la couverture est très faible (≈10 %). Existent : un enregistreur MediaRecorder AAC avec pilule à onde vivante (ChatComposer + VoiceRecordingPill), le transport d’aperçu audio de l’overlay (OverlayMediaTransport/Preview), le visualiseur d’images paginé avec pinch-zoom et sauvegarde MediaStore, l’écran de politiques de téléchargement auto, une chaîne durable upload→graft→envoi (MediaUploadQueue + OutboxFlushWorker), les écoutes socket audio:transcription-ready / audio:translation-ready et de nombreux modèles purs (karaoké, fusions de transcription, politiques de filtre vidéo, planificateur de compression image, modèles de profil vocal).
Il n’existe aucun lecteur vocal ni vidéo dans le fil : toucher un vocal ouvre l’URL dans une app externe (uriHandler.openUri) et une vidéo est rendue comme une ligne de fichier téléchargé via DownloadManager. Manquent aussi : moteur de lecture partagé + file + mini-lecteur + MediaSession/notification, gestion du focus audio et des interruptions, forme d’onde extraite et cachée, plein écran audio, transcription à la demande (REST), traduction audio à la demande, profil vocal (écrans + API), tray de préparation des pièces, compression réelle, upload groupé avec progression, hub de médias, réactions par pièce, flux d’enregistrement local multi-destinations avec marque, kit de chrome plein écran, lieu plein écran in-app.
Le fait marquant est que le chemin vocal complet (enregistrer → préparer → envoyer → lire → transcrire/traduire) n’est iso que sur la première marche (enregistrer/envoyer un fichier) ; tout le reste de la chaîne de lecture est à construire, avec ExoPlayer/Media3 comme brique commune (déjà dépendance du module sdk-ui).

## Notes transverses

SYNTHESE (73 lots, ~58 000 lignes Kotlin de production hors tests). Le domaine part de ~10 % de couverture : seules existent la logique pure (plan de chrome audio, karaoké, fusions transcription/pistes, politique de téléchargement, VideoDismissWatchReport, session d'enregistrement), la visionneuse d'image, la pilule d'enregistrement et les surfaces ExoPlayer des réels/stories. Aucun lecteur de vocal ni de vidéo dans le fil (le tap appelle uriHandler.openUri, une vidéo est classée en fichier). Chemin critique P0 : socle/lois (1,4,5) -> moteur audio+focus+file (12,13,14) + waveform (7) + disponibilité/téléchargement (15,16) -> lecteur de bulle (17,18) ; moteur vidéo (35) + affiche (36) + modèle de bulle (37) -> lecteur inline (38) -> plein écran (39,40) ; compression (20) -> tuiles (21) -> envoi groupé hors ligne (22) ; visionneuse d'image (42).

CONVENTIONS RELEVEES DANS L'ARBRE REEL (differentes de l'exemple de la consigne) : packages Kotlin = me.meeshy.sdk.model (core/model, sous-paquets media/, waveform/, call/ ; les nouvelles lois vont dans playback/, fullscreen/, voice/, imageedit/, audioedit/), me.meeshy.sdk.net.api (core/network), me.meeshy.sdk.<zone> (sdk-core), me.meeshy.ui.component.<zone> (sdk-ui), me.meeshy.app.<feature> (features), me.meeshy.app.navigation (app), me.meeshy.core.database (Room). PAS de me.meeshy.feature.*. Les chemins listés sans marqueur : un fichier existant est modifié, un fichier absent de l'arbre est créé. Les fichiers de test ne sont pas dans android_files_touched ; ils vont sous src/test/kotlin du même module, même paquet.

FICHIERS CHAUDS (hors budget 1000-1200 lignes et/ou touchés par plusieurs lots) : ChatScreen.kt (2953), ChatViewModel.kt (2248), MessageBubble.kt (1202), MeeshyApp.kt (1202), ChatComposer.kt (670), MeeshyApi.kt + NetworkModule.kt (une ligne par API), OutboxModel.kt + OutboxFlushWorker.kt (une valeur d'enum par sender), MessageSocketManager.kt, SocketEvents.kt, gradle/libs.versions.toml, MeeshyDatabase.kt (version 16 : AUCUN lot de ce domaine n'y touche, volontairement). Le lot 2 (chat-preparer-extractions-media) est un refactor SANS changement de comportement qui doit passer en premier : il extrait AudioBubble/BubbleFileRow/LocationPreview/BubbleImageGrid de MessageBubble.kt, crée ChatMediaHost.kt (UNE présentation plein écran à la fois) et MediaRoutes.kt/MediaOverlayHost.kt dans :app, et déclare d'un coup toutes les entrées du catalogue de versions (media3-session/transformer/common/test-utils, mediarouter, coil-gif, lottie-compose, exifinterface) pour que les lots suivants n'éditent plus libs.versions.toml. Ensuite chaque lot ajoute ses écrans dans ses propres fichiers neufs et ne fait que de petits câblages additifs dans les fichiers chauds, ordonnés par depends_on (la chaîne MeeshyApi.kt impose 6 -> 10 ; la chaîne OutboxModel.kt impose 22 -> 43 ; la chaîne ChatComposer.kt impose 19 -> 21 -> 27). Règle de budget : tout lot qui ajouterait à un fichier hors budget extrait d'abord.

RESSOURCES : une feuille strings_<lot>.xml neuve par lot et par module (values, values-fr, values-es, values-pt : Android n'a que 4 langues, iOS 7 — l'écart de langues est une dette hors domaine, ne pas ouvrir de lot ici) pour éviter tout conflit sur strings.xml. Hilt : chaque lot livre son propre @Module (PlaybackModule, RecordingModule, VoiceModule...) plutôt que d'éditer SdkModule.kt. Les magasins locaux (position de reprise, registre « déjà enregistré », cache de waveform, registre des préchargements) sont des DataStore/fichiers de cacheDir bornés, purgés par SessionTeardown à la déconnexion : aucune table Room neuve.

PLACEMENT DES MOTEURS (décision d'architecture à valider) : moteur audio, coordinateur de focus, registre PlaybackCoordinator, ConversationAudioCoordinator et gestionnaire vidéo partagé vivent dans :sdk-core (paquet me.meeshy.sdk.playback, pas de Compose, singletons Hilt, interfaces testables, API sans type Media3 exposé) ; les surfaces Compose (PlayerView, bulle, plein écran, mini-lecteur) dans :sdk-ui ; l'orchestration produit (quelle posture, quand auto-télécharger, quel hôte) dans les features et :app, conformément à la SDK Purity. Le service MediaSessionService est déclaré dans le manifeste de :app (permissions FOREGROUND_SERVICE_MEDIA_PLAYBACK).

LOIS PURES D'ABORD (testables par ./apps/android/meeshy.sh jvm-check) : lois de session/focus/interruption (4), classe d'appareil rejouant packages/shared/fixtures/device-tier-vectors.json (5), waveform/échelle/clé de contenu (7), état du chrome plein écran (8), file de vocaux (14), mini-lecteur (30), cadran (32), plan de poster et transcodage (36, 20), lois de transport vidéo (39), PiP (41), cadrage de galerie (48), géométrie de rognage (60, 62, 67), historique d'édition (65), CaptureSaveLaw rejouant capture-save.vectors.json (70). Les écrans ne sont prouvés que par la CI android.yml : on y pousse le moins de logique possible.

MIROIRS « TOUCHE LES TROIS » concernés : (a) Prisme : la piste audio jouée, la transcription affichée, la légende de média et l'aperçu servi suivent resolveUserLanguage / descente stricte rangs 1->4 (lots 24, 25, 34, 50) — jamais translations.first, la piste est élue par la langue du texte servi ; (b) accent de conversation : tout lecteur/ chrome de conversation reçoit accentColor en paramètre, jamais codé en dur (17, 18, 27, 30) ; (c) présence : le portrait d'auteur du plein écran audio et le monogramme du mini-lecteur n'affichent AUCUN point hors ligne (32, 33, 30) ; (d) AudioPlayerChromePlan/TranscriptionKaraokeResolver existent déjà et ne se réécrivent pas.

CONTRAT DE BRANCHEMENT : les moteurs exposent des interfaces à implémentation par défaut inerte (PlaybackReportSink, PlaybackPositionStore, MediaSaveRequester, LocalTranscriptionProvider) ; les lots 43 (rapports), 44 (reprise), 45 (enregistrement) et 28 (transcription locale) les implémentent ensuite. Ainsi les lecteurs P0 ne dépendent pas des lots P1 et chaque lot reste livrable seul.

DEPENDANCES EXTERNES (préfixe ext:) à planifier dans d'autres domaines : ext:stories-timers-gel-interruption (feature/stories consomme PlaybackCoordinator.interruption pour figer le canvas et son compte à rebours), ext:composer-story-post-audio (câbler enregistreur/éditeur dans StoryComposer et FeedComposerSheet), ext:feed-commentaires-surfaces-audio (posts/commentaires/réels ouvrent le plein écran audio avec AudioFullscreenSource), ext:stories-scene-player (page scène de galerie), ext:stories-export (filigrane des exports), ext:decision-sdk-carte (SDK de carte du lot 53).

DECISIONS PRODUIT/TECHNIQUES A OUVRIR EN ISSUE labellisée décision-produit : (1) SDK de carte (MapLibre vs Maps Compose vs osmdroid) pour le lieu plein écran ; (2) Google Cast en plus de la sortie audio système ; (3) activer l'encodage Opus (dormant sur iOS) ; (4) Android Auto / MediaBrowserService (non porté) ; (5) formats de rognage vidéo à bord de scène hors périmètre audio.

NON PORTES VOLONTAIREMENT : AirPlay (-> sélecteur de sortie système), Live Activity audio (-> notification MediaStyle), CarPlay, CoreImage/Metal (-> AGSL API 33 avec repli ColorMatrix, RenderScript déprécié exclu), UserDefaults (-> DataStore). Frontières hors domaine : la liaison Telecom/WebRTC des appels reste dans feature/calls (seul le contrat de focus est partagé) ; les rapports de lecture des réels/stories et leurs pools restent chez leurs features, seuls les gouverneurs thermiques (71) sont partagés.

RISQUES : (1) Media3 Transformer et la reconnaissance vocale on-device exigent API 31/33 selon la fonction : chaque lot prévoit un repli explicite (pas de transcription locale, ré-encodage H.264) ; (2) AGSL exige API 33 : repli ColorMatrix + Bitmap pour minSdk 26 ; (3) aucun gate local hors :core:model (dl.google.com inaccessible) : aucun lot ne se déclare vert sans run android.yml vert ; (4) ChatViewModel/ChatScreen sont hors budget : ne PAS leur ajouter plus qu'un câblage de quelques lignes, tout le reste va dans des délégués neufs (ChatAudioBinder, ChatMediaHost, ChatAttachmentDraft...) ; (5) le lecteur ExoPlayer par page de ReelsScreen coûte : mesurer sur appareils bas/moyen/haut avant d'affirmer un gain (lot 71) ; (6) l'endpoint de listing d'un hub de médias (GET conversations/:id/attachments) doit être confirmé contre la passerelle avant le lot 54.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `chat-preparer-extractions-media` | D | P0 | M | 650 | socle-points-d-extension-de-l-app, dependances-gradle-scene-medias, composer-glass-shell, chat-bulle-decoupage-composants | Le fil de discussion est prêt à accueillir des médias riches sans fichier géant à éditer |
| `enregistrement-vocal-moteur-unique` | D | P0 | M | 900 | media-permissions-au-bon-moment, lecture-focus-audio-et-coordination-des-lecteurs, media-vocabulaire-partage, composer-glass-shell | Un vocal s'enregistre proprement, interrompu sans perte par un appel ou un refus de micro |
| `image-visionneuse-plein-ecran-alignee` | D | P0 | M | 1050 | plein-ecran-kit-chrome, chat-preparer-extractions-media, profile-own-page-split | Ouvrir une image ou une photo de profil en plein écran : chrome au toucher, glissement pour fermer, zoom, légende |
| `lecture-file-vocaux-et-enchainement` | D | P0 | M | 900 | lecture-moteur-audio-media3, media-vocabulaire-partage, sortie-contenu-loi-et-offre, dependances-gradle-scene-medias, composer-glass-shell, chat-viewmodel-state-split | Les vocaux non écoutés s'enchaînent tout seuls et la lecture survit au défilement |
| `lecture-focus-audio-et-coordination-des-lecteurs` | D | P0 | M | 900 | lecture-moteur-audio-media3, lecture-lois-session-focus-interruptions | Un appel, une autre appli ou un enregistrement met le son en pause ou le baisse, puis le rend sans perte |
| `lecture-lois-session-focus-interruptions` | D | P0 | M | 700 |  | Les règles de focus audio, d'interruption et de reprise sont écrites et prouvées une fois |
| `lecture-moteur-audio-media3` | D | P0 | M | 1200 | media-vocabulaire-partage, lecture-lois-session-focus-interruptions, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias | Un seul vocal joue à la fois, avec état observable, vitesses et position de reprise |
| `media-classe-appareil` | D | P0 | M | 450 |  | L'app adapte préchargement et qualité à la puissance de l'appareil (bas, moyen, haut, pro) |
| `media-disponibilite-et-telechargement-auto` | D | P0 | M | 450 | telechargement-media-registre-unique, media-vocabulaire-partage | Un vocal, une vidéo ou une image se télécharge tout seul quand le réseau et les préférences le permettent |
| `media-permissions-au-bon-moment` | D | P0 | S | 350 |  | Caméra, micro et photos sont demandés au bon moment, avec un message qui dit quoi activer |
| `media-vocabulaire-partage` | F0 | P0 | M | 800 |  | Les médias partagent les mêmes vitesses, contextes, libellés et états de disponibilité |
| `pieces-jointes-api-transcription-traduction-statut` | D | P0 | M | 650 | refus-types-limite-du-jour-mode-lent, reseau-pipeline-reessai-erreurs, persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee | L'app sait demander transcription, traduction audio et statut d'une pièce jointe, et reçoit les échecs en direct |
| `pieces-jointes-compression-image-et-video` | D | P0 | M | 900 | media-classe-appareil, media-vocabulaire-partage | Les photos et vidéos sont allégées avant l'envoi, ou simplement remuxées si elles le sont déjà |
| `pieces-jointes-envoi-groupe-hors-ligne` | D | P0 | L | 1400 | pieces-jointes-preparation-tuiles, media-vocabulaire-partage, persist-outbox-registre-senders, persist-messages-repository-decoupage, composer-glass-shell, chat-viewmodel-state-split | Envoyer des pièces jointes monte les fichiers en parallèle, survit au hors ligne et garde la bulle optimiste |
| `pieces-jointes-preparation-tuiles` | D | P0 | M | 1200 | pieces-jointes-compression-image-et-video, media-permissions-au-bon-moment, chat-preparer-extractions-media, media-vocabulaire-partage, enregistrement-vocal-moteur-unique, composer-glass-shell, chat-viewmodel-state-split | Les pièces choisies apparaissent en tuiles qui se préparent avant l'envoi |
| `plein-ecran-kit-chrome` | D | P0 | M | 900 |  | Tous les plein écrans partagent le même chrome : croix, disques de verre, rail d'actions, voile et sélecteur de sortie audio |
| `profil-vocal-api-et-consentement` | D | P0 | M | 700 | pieces-jointes-api-transcription-traduction-statut, reseau-pipeline-reessai-erreurs | Le consentement au clonage vocal se lit, s'accorde et s'affiche en une note discrète |
| `telechargement-media-registre-unique` | D | P0 | M | 1000 | media-vocabulaire-partage, persist-media-cache-modele-lois, persist-messages-repository-decoupage, persist-media-file-queue, reseau-pipeline-reessai-erreurs | Un média n'est téléchargé qu'une fois, partout, avec une progression commune |
| `transcription-vocal-arrive-seule` | D | P0 | M | 800 | pieces-jointes-api-transcription-traduction-statut, vocal-bulle-branchement-fil, persist-messages-repository-decoupage, chat-viewmodel-state-split | La transcription d'un vocal arrive toute seule, même après coup, sans saut de hauteur |
| `video-affiche-poster-et-facade-de-lien` | D | P0 | M | 950 | telechargement-media-registre-unique | Une vidéo montre tout de suite une affiche nette avec bouton lecture et durée, et un lien vidéo une façade cliquable |
| `video-bulle-modele-et-regles` | D | P0 | M | 600 | media-vocabulaire-partage, media-disponibilite-et-telechargement-auto, chat-preparer-extractions-media | Une vidéo de conversation est reconnue comme telle, avec son ratio, sa disponibilité et sa barre de reprise |
| `video-lecteur-en-ligne-dans-le-fil` | D | P0 | L | 1300 | video-moteur-partage-et-montage, video-affiche-poster-et-facade-de-lien, video-bulle-modele-et-regles, plein-ecran-kit-chrome, chat-bulle-grille-medias, composer-glass-shell, chat-bulle-decoupage-composants | Lire une vidéo dans la bulle ou le fil avec ses contrôles superposés |
| `video-moteur-partage-et-montage` | D | P0 | M | 1100 | lecture-focus-audio-et-coordination-des-lecteurs, media-vocabulaire-partage, reel-playback-laws, socle-points-d-extension-de-l-app | Une seule vidéo joue à la fois, avec mute global, boucle sans trou et lecture qui suit la surface |
| `video-plein-ecran-ecran` | D | P0 | L | 1300 | video-lecteur-en-ligne-dans-le-fil, video-plein-ecran-regles-transport, video-moteur-partage-et-montage | Regarder une vidéo en plein écran avec transport, disponibilité, rapport de visionnage et accessibilité |
| `video-plein-ecran-regles-transport` | D | P0 | M | 450 | media-vocabulaire-partage, plein-ecran-kit-chrome | Le transport vidéo plein écran suit des lois claires : disposition, ligne d'infos, gestes |
| `vocal-bulle-branchement-fil` | D | P0 | M | 800 | vocal-bulle-lecteur-composable, lecture-file-vocaux-et-enchainement, lecture-focus-audio-et-coordination-des-lecteurs, media-disponibilite-et-telechargement-auto, chat-preparer-extractions-media, chat-bulle-decoupage-composants, chat-bulle-pied-heure-et-coches, chat-translation-requests-and-admission, composer-glass-shell, chat-viewmodel-state-split | Toucher un vocal le joue sur place dans le fil, plusieurs vocaux d'un message s'empilent |
| `vocal-bulle-lecteur-composable` | D | P0 | M | 1100 | media-vocabulaire-partage, waveform-extraction-et-cache, chat-preparer-extractions-media | Un vocal a un vrai lecteur : bouton rond, onde scrubbable, vitesse et progression |
| `vocal-langue-de-piste-et-traduction-a-la-demande` | D | P0 | M | 750 | pieces-jointes-api-transcription-traduction-statut, vocal-bulle-branchement-fil, profil-vocal-api-et-consentement, chat-bulle-prisme-drapeaux-et-panneau-secondaire, chat-viewmodel-state-split | Entendre un vocal dans sa langue avec la voix clonée, et basculer d'une langue à l'autre |
| `waveform-extraction-et-cache` | D | P0 | M | 750 |  | Chaque vocal affiche sa vraie forme d'onde, calculée une seule fois |
| `audio-plein-ecran-cadran-et-regles` | D | P1 | M | 700 | plein-ecran-kit-chrome, waveform-extraction-et-cache | Le cadran circulaire du vocal plein écran se règle du doigt, avec ses lois de page et de fermeture |
| `audio-plein-ecran-pager-et-transport` | D | P1 | M | 1000 | audio-plein-ecran-cadran-et-regles, lecture-file-vocaux-et-enchainement, vocal-bulle-branchement-fil, chat-preparer-extractions-media, socle-points-d-extension-de-l-app | Un vocal s'ouvre en plein écran : portrait, pages balayables, vitesse et saut de 10 secondes |
| `audio-plein-ecran-paroles-langues-telechargement` | D | P1 | M | 800 | audio-plein-ecran-pager-et-transport, transcription-karaoke-dans-la-bulle, vocal-langue-de-piste-et-traduction-a-la-demande, enregistrement-media-galerie-sans-doublon | En plein écran, les paroles du vocal défilent, se traduisent et se téléchargent |
| `consommation-rapport-fiable-hors-ligne` | D | P1 | M | 600 | pieces-jointes-api-transcription-traduction-statut, pieces-jointes-envoi-groupe-hors-ligne, lecture-moteur-audio-media3, video-plein-ecran-ecran, image-visionneuse-plein-ecran-alignee, document-fiche-et-apercu-integre, persist-outbox-registre-senders, persist-outbox-flusher-classifie, persist-outbox-file-attente-cycle-de-vie, chat-viewmodel-state-split | L'expéditeur voit qui a écouté, regardé ou ouvert sa pièce, même hors ligne |
| `document-fiche-et-apercu-integre` | D | P1 | M | 700 | media-vocabulaire-partage, chat-preparer-extractions-media, plein-ecran-kit-chrome, chat-bulle-decoupage-composants | Voir un document joint en carte, puis l'ouvrir, l'enregistrer ou le supprimer |
| `enregistrement-media-galerie-sans-doublon` | D | P1 | M | 1200 | video-plein-ecran-ecran, image-visionneuse-plein-ecran-alignee, document-fiche-et-apercu-integre, telechargement-media-registre-unique, media-vocabulaire-partage | Enregistrer un média dans la galerie sans doublon, et le dire (« Déjà dans la photothèque ») |
| `enregistreur-vocal-ecran-et-feuille` | D | P1 | M | 900 | enregistrement-vocal-moteur-unique, waveform-extraction-et-cache, vocal-bulle-lecteur-composable | Enregistrer un vocal en plein écran ou en feuille, avec langue parlée et aperçu |
| `image-editeur-ecran-et-outils` | D | P1 | L | 1600 | image-edition-rendu-gpu, image-recadrage-poignees, profile-own-page-split | Éditer une image dans un éditeur plein écran unique avec outils flottants et mode Simple/Pro |
| `image-edition-etat-et-historique` | D | P1 | M | 600 |  | Retoucher une image est non destructif : état minuscule rejouable et historique annuler/rétablir |
| `image-edition-rendu-gpu` | D | P1 | M | 1100 | image-edition-etat-et-historique | Les filtres, effets et réglages d'une image se voient en temps réel et s'exportent en pleine résolution |
| `image-recadrage-poignees` | D | P1 | M | 700 | image-edition-etat-et-historique, rognage-regles-et-bande-de-scene | Recadrer une image avec des poignées d'angle et de bord, des ratios et un réglage au clavier ou à TalkBack |
| `images-chargeur-borne-et-animees` | D | P1 | M | 800 | chat-preparer-extractions-media, socle-points-d-extension-de-l-app | Les GIF, APNG et WebP animés s'animent, et la mémoire des images reste bornée |
| `lecture-vocal-arriere-plan-et-ecran-verrouille` | D | P1 | M | 750 | lecture-file-vocaux-et-enchainement, lecture-focus-audio-et-coordination-des-lecteurs | Un vocal en lecture se pilote depuis l'écran verrouillé, la notification et les écouteurs |
| `mini-lecteur-audio-global` | D | P1 | M | 500 | lecture-file-vocaux-et-enchainement, chat-preparer-extractions-media, racine-couches-globales, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias | Un mini-lecteur indigo reste en haut de l'app pendant qu'un vocal joue |
| `prechargement-messages-premieres-conversations` | D | P1 | M | 450 | persist-messages-repository-decoupage, liste-decoupage-viewmodel | Ouvrir l'une des premières conversations sans jamais attendre le réseau |
| `profil-vocal-assistant-creation` | D | P1 | M | 950 | profil-vocal-echantillons-a-lire | Créer son profil vocal en cinq étapes : consentement, âge, échantillons, traitement, terminé |
| `profil-vocal-echantillons-a-lire` | D | P1 | M | 750 | profil-vocal-api-et-consentement, enregistrement-vocal-moteur-unique | Lire des phrases à voix haute pour enregistrer ses échantillons de voix |
| `profil-vocal-gestion-et-rgpd` | D | P1 | M | 750 | profil-vocal-assistant-creation, settings-hub-iso-layout | Gérer son profil vocal : statut, clonage, voix publique, échantillons et suppression RGPD |
| `reco-vocale-sur-appareil` | D | P1 | M | 500 | media-permissions-au-bon-moment | La parole se reconnaît sur l'appareil, avec des erreurs et des permissions claires |
| `reprise-position-multi-appareil-et-vu-par` | D | P1 | M | 950 | consommation-rapport-fiable-hors-ligne, lecture-file-vocaux-et-enchainement, video-lecteur-en-ligne-dans-le-fil, chat-viewmodel-state-split | Reprendre un vocal ou une vidéo là où on s'était arrêté, sur n'importe quel appareil |
| `rognage-regles-et-bande-de-scene` | D | P1 | M | 550 | waveform-extraction-et-cache | Rogner un média posé sur une scène en voyant ce qu'on retire, sans jamais ré-encoder |
| `transcription-karaoke-dans-la-bulle` | D | P1 | M | 950 | vocal-bulle-lecteur-composable, transcription-vocal-arrive-seule | Lire la transcription d'un vocal mot à mot, au rythme de la voix |
| `video-picture-in-picture` | D | P1 | M | 700 | video-plein-ecran-ecran, socle-points-d-extension-de-l-app | Continuer à regarder une vidéo en incrustation (PiP) en quittant l'appli |
| `audio-editeur-plein-ecran` | D | P2 | L | 1500 | audio-rogneur-bande-defilante, enregistreur-vocal-ecran-et-feuille, reco-vocale-sur-appareil, composer-glass-shell | Éditer un son en plein écran : rogner, couper, fondu, vitesse, volume, transcrire, avec annuler/rétablir |
| `audio-edition-modele-moteur-export` | D | P2 | L | 1300 | media-vocabulaire-partage | Un son s'édite sans rien détruire : rognage, coupe, fondus, vitesse, volume, avec historique de versions |
| `audio-rogneur-bande-defilante` | D | P2 | M | 850 | audio-edition-modele-moteur-export, waveform-extraction-et-cache, lecture-moteur-audio-media3 | Rogner un son précisément : bande qui défile sous un curseur fixe, poignées larges |
| `capture-photo-traitement-et-reglages` | D | P2 | M | 600 | enregistrement-media-galerie-sans-doublon, media-permissions-au-bon-moment | Une photo prise dans Meeshy est redressée, bornée, améliorée et enregistrée selon vos réglages |
| `code-visionneuse-coloration` | D | P2 | M | 1000 | document-fiche-et-apercu-integre | Lire un fichier de code joint avec numéros de ligne et coloration syntaxique |
| `galerie-chrome-adaptatif-luminance` | D | P2 | M | 450 | plein-ecran-kit-chrome | Les boutons posés sur un média changent de teinte selon la luminance de ce qu'ils recouvrent |
| `lottie-films-couches-et-stickers-rasterises` | D | P2 | M | 1000 |  | Les fonds, bannières et contours d'avatar s'animent en Lottie sans coût inutile, et un sticker Lottie s'envoie en image |
| `onglet-transcription-detail-message` | D | P2 | M | 400 | transcription-vocal-arrive-seule, vocal-langue-de-piste-et-traduction-a-la-demande | L'onglet Transcription du détail d'un message liste le texte, la confiance et les audios traduits |
| `son-de-contenu-transcription-defilante` | D | P2 | M | 600 | transcription-karaoke-dans-la-bulle, waveform-extraction-et-cache | Un son de contenu défile ligne à ligne sous le texte, au rythme de la voix |
| `video-gouverneurs-thermiques-et-pool-de-reels` | D | P2 | M | 750 | video-moteur-partage-et-montage, media-classe-appareil | Les vidéos muettes et les réels s'enchaînent sans surchauffe ni décodage inutile |
| `vocal-transcription-locale-a-l-envoi` | D | P2 | M | 600 | reco-vocale-sur-appareil, enregistrement-vocal-moteur-unique, pieces-jointes-envoi-groupe-hors-ligne, composer-glass-shell | Un vocal enregistré est transcrit sur l'appareil dès l'arrêt, sans attendre le serveur |

### Lots fusionnés ou retirés par l'architecture

- `apercu-appui-long-sur-moteur-partage` → `chat-pieces-reaction-et-apercu` (merge-into) : Même aperçu d'appui long branché sur le moteur partagé.
- `galerie-lois-de-cadrage-et-gestes` → `chat-gallery-stage-and-filmstrip` (merge-into) : Mêmes lois de cadrage de la galerie. Hérite : plein-ecran-kit-chrome.
- `galerie-reactions-et-traduction-de-legende` → `chat-gallery-captions-and-actions` (merge-into) : Mêmes réactions à une pièce et légende traduite. Hérite : pieces-jointes-api-transcription-traduction-statut.
- `galerie-reponse-a-une-piece` → `chat-gallery-host-bridge` (merge-into) : Même réponse à une pièce sans quitter le plein écran. Hérite : image-visionneuse-plein-ecran-alignee.
- `galerie-pages-scene-composee` → `chat-gallery-scene-page` (drop-duplicate) : Même page de scène dans la galerie.
- `media-hub-conversation` → `chat-media-hub-screen` (drop-duplicate) : Même hub Médias, liens et documents.
- `lieu-partage-carte-plein-ecran` → `chat-position-carte-et-plein-ecran` (merge-into) : Même lieu partagé en carte plein écran. Hérite : plein-ecran-kit-chrome.
- `video-filtres-appel` → `calls-video-effects-pipeline-and-blur` (drop-duplicate) : Mêmes filtres vidéo d'appel.
- `sous-titres-appel-en-direct` → `calls-live-transcription-and-merge-laws` (drop-duplicate) : Mêmes sous-titres d'appel sur l'appareil. Hérite : reco-vocale-sur-appareil.
- `marque-meeshy-sur-les-oeuvres-composees` → `export-marque-logo-et-filigrane` (merge-into) : Même filigrane Meeshy sur les œuvres composées.

## Features

### Les pièces choisies apparaissent en tuiles qui se préparent (chargement, compression, aperçu) avant l’envoi

`mav-attachment-preparation-tray` · Android : **absente** · P0 · effort M

AttachmentPreparationService prépare image (UIImage, octets d’origine ou sélecteur Photos), vidéo (URL disque) et audio enregistré, et publie un PreparingAttachment observable (stages loading → compressing → thumbnailing → hashing → ready \| failed(message), awaitCompletion, PreparedAttachment avec fichier, ThumbHash, miniature, durée). Commun aux messages, posts et stories. AttachmentLoadingTile (56 pt, rayon 10) en est la vue : fond = miniature (assombrie 12 % tant que ça prépare) ou couleur d’accent avec shimmer, petit spinner coin bas-gauche une fois la miniature là, ou grand spinner + libellé d’étape (« Chargement en cours », « Compression en cours », « Aperçu », « Empreinte »), état échec rouge « Erreur » avec réessai/retrait, bouton annuler 18 pt rouge (haptique légère). Un seul élément VoiceOver (type = libellé, étape = valeur, updatesFrequently) et action d’annulation en rotor. AttachmentQuickLookPreview : appui long sur une pièce en attente = aperçu 280×280 (image 840 px décodée à la demande ou vidéo muette bouclée sans chrome). AttachmentTypeGlyph : glyphes par type (photo, vidéo, onde, doc, lieu) et pictogramme central « pencil » si la pièce est éditable.

Écarts :
- Pas de tray de pièces en attente : ComposerAttachmentTray est l’échelle « + » (photo/fichier/vocal/caméra/émoji) et chaque choix part immédiatement via sendFileAttachment ; ajouter un plateau multi-pièces avec brouillon (plusieurs pièces + texte, envoi groupé)
- Service de préparation avec stages loading/compressing/thumbnailing/hashing/ready/failed(message) et annulation, partagé messages/posts/stories
- Tuile de chargement 56 dp rayon 10 : miniature + spinner coin, shimmer sur couleur d’accent, étiquette d’étape, état échec (Erreur) avec réessayer/retirer, bouton annuler 18 dp rouge
- Calcul du ThumbHash et de la miniature à la préparation (ThumbHash.kt présent côté lecture) ; durée d’une vidéo ; pièce audio avec durée minimale 500 ms
- Aperçu appui long d’une pièce en attente (image 840 px ou vidéo muette en boucle) ; glyphes par type et crayon central si éditable
- Sélecteur de médias (Photo Picker) avec détection vidéo/image et couleur d’accent par type
- Accessibilité TalkBack : un seul nœud avec libellé de type, valeur d’étape (liveRegion polite) et action personnalisée Annuler

Rendu : Tuile carrée 56 dp, coins 10, libellé 11 sp medium sous la tuile (largeur max(size,60)), pastille d’annulation rouge (error) décalée de (5, −5), transition easeInOut 0,2 s entre étapes ; pictogramme crayon centré si éditable.

Transposition Android : PhotosPicker → ActivityResultContracts.PickVisualMedia ; AVPlayerLooper → ExoPlayer repeatMode ONE ; shimmer → modifier shimmer existant (MeeshySkeleton).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/AttachmentPreparationService.swift`
- `apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift`
- `apps/ios/Meeshy/Features/Main/Components/AttachmentQuickLookPreview.swift`
- `apps/ios/Meeshy/Features/Main/Components/AttachmentTypeGlyph.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### La lecture respecte les autres apps, les appels et le débranchement des écouteurs

`mav-audio-session-focus-interruptions` · Android : **absente** · P0 · effort M

ContentPlaybackSessionLaw : tout lecteur de contenu Meeshy qui s’entend (story, vidéo de conversation, post, réel, commentaire, humeur, vocal) active une session .playback NON mélangeable qui met en pause la musique des autres apps (décision 2026-10-19) ; une lecture coupée/volume nul/absente (fil, bulle inline muette, story muette) pose seulement .ambient sans activer. ContentSessionReleaseLaw : Meeshy rend la main (notifyOthersOnDeactivation) à la fin de sa lecture, 3 s après une pause utilisateur (une relance annule), ou après une interruption sans reprise, avec grâces de reprise 1 s et de transition de balayage 0,4 s. InterruptionResumeLedger : machine d’état unique (interruptionBegan(isPlaying), interruptionEnded(shouldResume), outputLost, userPaused, userStartedPlayback, contentReleased, returnedToForeground) qui ne reprend QUE ce qui jouait au début de l’interruption et jamais ce que l’utilisateur a mis en pause. MediaSessionCoordinator (actor) gère l’activation avec compteur de références, diffuse interruptions et changements de route (débranchement casque = pause), fin d’appel VoIP, désactivation en arrière-plan. AudioSessionProfile (content/transient) choisit les options.

Écarts :
- Aucune gestion du focus audio hors appels : demander AUDIOFOCUS_GAIN pour tout son audible (pause de la musique des autres apps), rien pour un média coupé
- Coordinateur unique avec compteur de références, événements (perte/gain de focus, ACTION_AUDIO_BECOMING_NOISY, changement de route, début/fin d’appel) rediffusés aux lecteurs
- InterruptionResumeLedger pur et testable : ne reprendre que ce qui jouait, jamais une pause utilisateur, gérer retour au premier plan
- Règles de libération : fin de lecture, 3 s après pause utilisateur (annulable), interruption sans reprise, grâces 1 s / 0,4 s
- Profils content/transient ; arrêt des enregistreurs et lecteurs au début d’un appel ; désactivation propre en arrière-plan quand plus rien ne vit
- Intégration avec la couche d’appel existante (CallAudioRoute/WebRtcCallCoordinator) pour ne pas se disputer le focus

Rendu : Aucun élément visuel ; comportements perceptibles : la musique d’une autre app se met en pause à l’écoute d’un vocal, elle reprend 3 s après une pause, un appel suspend puis reprend la lecture.

Transposition Android : AVAudioSession + notifications d’interruption/route → AudioManager + AudioFocusRequest (USAGE_MEDIA, CONTENT_TYPE_SPEECH/MUSIC) + OnAudioFocusChangeListener + BroadcastReceiver ACTION_AUDIO_BECOMING_NOISY ; Media3 gère une partie via setAudioAttributes(handleAudioFocus=true).

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioSessionProfile.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/ContentPlaybackSessionLaw.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/ContentSessionReleaseLaw.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/InterruptionResumeLedger.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaSessionCoordinator.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallAudioRoute.kt`

### Les vocaux s’enchaînent automatiquement et la lecture survit au défilement

`mav-audio-shared-engine-queue` · Android : **absente** · P0 · effort M

AudioPlaybackEngineDriving est le protocole du moteur partagé (play(urlString), playLocal, togglePlayPause, stop, pause, resumeFromInterruption, seek(fraction), skip(seconds), setSpeed, cycleSpeed) ; QueuedAudio décrit une entrée de file (piste, langue de la piste, protégé ou non pour l’écran verrouillé) et ActiveAudioContext le contexte en lecture. AudioQueueBuilder transforme les messages en file ordonnée de vocaux non écoutés : seuls les attachments audio, hors vocaux de soi sauf le curseur et ses pistes sœurs, hors déjà écoutés, strictement après le curseur par date de réception puis par index de pièce dans le message. Le coordinateur (hors de cette partie) enchaîne, mémorise la position par piste et expose progression/vitesse.

Écarts :
- Créer un moteur singleton (ExoPlayer + MediaSession) exposant play(url)/playLocal/togglePlayPause/stop/pause/resume/seek(fraction)/skip(±s)/setSpeed/cycleSpeed derrière une interface testable
- Types QueuedAudio (id, url, langue de piste, isTranslated, flag protégé) et ActiveAudioContext (conversationId, attachmentId, senderName, conversationName, avatars)
- AudioQueueBuilder pur : filtre type audio, exclut vocaux de soi (sauf message curseur), exclut écoutés, ne garde que ce qui suit le curseur (receivedAt puis index de pièce), garde l’ordre des pistes d’un message
- Mémoire d’écoute (position par pièce) et enchaînement auto à la fin d’une piste ; vitesses 1, 1,25, 1,5, 1,75, 2
- Marquer écouté / reporter la consommation « listened » côté serveur à la fin ou au seuil d’écoute
- Équivalent Android de AudioTrackSurface : aujourd’hui sans file, sans seek exposé, sans état observable (loop/volume/clipping seulement)

Rendu : Pas d’UI propre ; la progression publiée à ~20 Hz alimente bulles, mini-lecteur et plein écran ; vitesses affichées « 1× 1,25× 1,5× 1,75× 2× ».

Transposition Android : AVPlayer + ConversationAudioCoordinator → ExoPlayer dans un MediaSessionService + un coordinateur Kotlin (StateFlow) ; PlaybackSpeed → setPlaybackParameters.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/AudioPlaybackEngineDriving.swift`
- `apps/ios/Meeshy/Features/Main/Services/AudioQueueBuilder.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Une vidéo se lit dans la bulle : poster net, taille à télécharger, trois contrôles, barre de reprise

`mav-video-bubble-player` · Android : **absente** · P0 · effort M

Dans le fil, une vidéo n’a que trois contrôles (son, lecture/pause, plein écran) ; son bouton central porte aussi le téléchargement (« ↓ taille », anneau de progression, auto-DL selon la politique réseau) via VideoAvailabilityResolver (prêt / à télécharger / téléchargement avec progression, fichier local ou cache vidéo, démarrage automatique par clé). MediaConsumptionProgressBar trace une barre fine (3 pt) en bas du poster indiquant la part DÉJÀ vue, issue du magasin local ou, à défaut, de la consommation servie par la passerelle (une vidéo vue à 80 % sur iPhone teinte 80 % sur iPad), invisible sous 1 %. Le poster net (première image) vient de VideoPosterResolver. Le plein écran lit la vidéo sans relancer de téléchargement.

Écarts :
- BubbleContent n’a pas de type vidéo : BubbleContentBuilder range les vidéos avec les fichiers (filterNot image/location/audio) et MessageBubble les affiche comme une ligne de fichier à télécharger puis ouvrir ; créer BubbleVideo (url, poster, durée, taille, miniatures, thumbHash)
- Composable vidéo en bulle (ExoPlayer/PlayerView ou surface propre) avec poster net, bouton central lecture/téléchargement, son, plein écran ; lecture inline silencieuse selon la politique
- États de disponibilité (prêt / à télécharger avec taille / téléchargement anneau) et auto-DL selon MediaAutoDownloadDecider
- Barre de reprise 3 dp accent (≥ 1 %), alimentée par le store local puis la consommation servie
- Plein écran vidéo sans second téléchargement ; PiP en sortie d’app
- Bulle d’une vidéo envoyée : poster local immédiat (file://), aucun badge de téléchargement pour un média optimiste

Rendu : Poster arrondi aux coins de la bulle, bouton central 44–56 dp en verre, durée en badge bas-droit, barre de reprise capsule 3 dp accent sous le poster (fond noir 28 %), contrôles qui s’effacent.

Transposition Android : AVPlayer/AVPlayerLayer → Media3 ExoPlayer + PlayerView/SurfaceView (ReelVideoSurface est la brique SDK existante).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VideoAvailabilityResolver.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MediaConsumptionProgressBar.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### Les vidéos sont transcodées légères avant l’envoi, ou simplement remuxées si elles le sont déjà

`mav-video-transcode` · Android : **absente** · P0 · effort M

MediaCompressor.compressVideo (AVAssetReader/Writer) cible par contexte un débit vidéo (message 2,5 Mb/s, story et feed 4 Mb/s, avatar 1 Mb/s, plein écran 8 Mb/s), une résolution max (message 720×1280, story/feed 1080×1920, avatar 480², plein écran 1920×1080) et un débit audio (96 kb/s, 128 kb/s story/plein écran). Chemin rapide passthroughIfPossible : si le codec est HEVC/H.264, la résolution tient dans le budget et le débit ≤ 2× le budget, on REMUXE sans ré-encoder (sub-seconde, évite 10–60 s de ré-encodage), avec shouldOptimizeForNetworkUse. Sinon ré-encodage HEVC (si décodage matériel supporté) ou H.264, 30 fps max, orientation conservée via preferredTransform, dimensions du writer cohérentes avec la rotation portrait, audio ré-encodé, étiquette couleur de la source reportée pour ne pas délaver une prise Display P3. Écrase un fichier existant en le supprimant d’abord.

Écarts :
- Aucun transcodage vidéo : les vidéos partent à leur taille d’origine (ou sont traitées comme des fichiers)
- Transcodeur Media3 Transformer/MediaCodec : H.264/HEVC selon décodeur matériel, 30 fps max, plafond de résolution et débit par contexte (message 720×1280 / 2,5 Mb/s, etc.), audio AAC 96/128 kb/s, faststart
- Chemin passthrough/remux quand codec moderne + résolution ≤ budget + débit ≤ 2× budget
- Orientation (rotation) et espace colorimétrique conservés ; progression publiée pour l’étape « Compression en cours »
- Annulation propre et nettoyage des fichiers temporaires

Rendu : Étape visible dans la tuile de préparation : spinner + « Compression en cours ».

Transposition Android : AVAssetWriter + VideoToolbox → androidx.media3.transformer.Transformer (VideoEncoderSettings/Composition) ou MediaCodec+MediaMuxer.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift`

</details>

### Chaque vocal affiche sa vraie forme d’onde, calculée une fois et gardée

`mav-waveform-extraction-cache` · Android : **absente** · P0 · effort M

WaveformExtractor est le seul point qui ouvre l’audio pour mesurer : AVAudioFile par blocs de 65 536 trames, moyenne des canaux en mono, RMS par compartiment (vDSP) ; sinon AVAssetReader en mono 44,1 kHz flottant. WaveformMath fournit rmsBuckets, monoMix et WaveformAccumulator. WaveformCache (actor) renvoie samples(from:count:) (80 par défaut) et waveformImageData, clé par WaveformContentKey (empreinte FNV-1a 64 bits sur taille + premiers/derniers 64 Kio, URL distante clé par son adresse), mémoire bornée FIFO et disque durable ; deux recording.m4a ne se confondent pas, un même son sous deux noms ne se calcule qu’une fois. WaveformScale sépare MESURE (RMS absolu, hauteur d’affichage en dB avec plancher −60 dB) et CHAMP PUBLIÉ (normalisé au pic, lu linéairement), et choisit le nombre de barres selon la largeur (paliers 128 à 2 048).

Écarts :
- Aucune extraction de forme d’onde pour la lecture (seul le métering micro en direct existe) : décoder via MediaExtractor/MediaCodec (PCM) en blocs, mono, RMS par compartiment
- Clé de contenu FNV-1a (taille + 64 Kio début/fin) pour dédupliquer le cache ; URL distante clée par adresse
- Cache mémoire FIFO borné + disque (Room ou fichiers) ; purge des anciens caches
- WaveformScale : hauteur d’affichage en dB avec plancher −60 dB, normalisation au pic des champs publiés, paliers de barres selon la largeur et la densité
- Réutiliser les niveaux enregistrés (Waveform du message) quand ils existent pour éviter de décoder

Rendu : Barres arrondies verticales centrées, hauteur dB-échelle (plancher −60), teinte accent pour la partie lue ; 80 barres par défaut, plus sur écran large.

Transposition Android : AVAudioFile/AVAssetReader/Accelerate → MediaExtractor + MediaCodec + calcul RMS en boucle (ou FloatArray SIMD via Kotlin) ; actor → Mutex + Dispatchers.Default.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformCache.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformContentKey.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformExtractor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformMath.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformScale.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/AudioLevelMetering.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`

### Un seul vocal joue à la fois, continue en arrière-plan et enchaîne sur le suivant

`media-audio-playback-engine` · Android : **absente** · P0 · effort M

AudioPlaybackManager est le moteur de lecture audio : un seul AVAudioPlayer chargé hors du fil principal (octets lus et décodés dans une tâche détachée, enableRate posé avant prepareToPlay), état publié (isPlaying, progress, currentTime, duration, speed de 0,8 à 2,25, isLoading, attachmentId), play(urlString) pour le réseau/cache et playLocal pour file://, bascule lecture/pause, seek par fraction ou par temps, saut en secondes, boucle (réels audio), position de reprise sauvegardée à chaque changement de piste, zone morte de reprise, rapport d'écoute continue (segments, position, complétion), prédicat de permission de lecture (un appel Meeshy actif bloque démarrage et reprise sans gêner pause/stop), profil de session transient ou content, registre d'autoplay qui enchaîne le vocal suivant.

Écarts :
- Créer un moteur audio singleton (service Media3 + MediaSession) injectable : play(url), playLocal(file://), togglePlayPause, pause, stop, seek(fraction), seekToTime, skip(±s), setSpeed / cycleSpeed (PlaybackParameters avec hauteur préservée), shouldLoop, isLoading ; aujourd'hui seuls un MediaPlayer jetable dans l'overlay d'appui long et AudioTrackSurface (sans UI) existent
- État publié en StateFlow : isPlaying, progress 0..1, currentTime, duration, speed, isLoading, attachmentId observable (swap atomique pour éviter qu'un double-tap résolve un id périmé)
- Grille de vitesses iOS 0,8 / 0,9 / 1,0 / 1,25 / 1,5 / 1,75 / 2,0 / 2,25 (l'overlay Android utilise 0,5 à 2,0 : divergence à corriger)
- Lecture locale des fichiers file:// (vocal optimiste non encore envoyé) et distante via le cache disque, décodage et préparation hors du fil principal
- Position de reprise : sauvegarde à chaque changement de piste (pas seulement pause/stop), règle de zone morte isResumable alignée sur la vidéo, application au démarrage
- Rapport d'écoute (segments réellement continus, position finale, complétion, raison de fin) via media-consumption-reporting
- Prédicat playbackPermissionGuard : bloque démarrage et reprise tant qu'un appel est actif (même par commande de l'écran verrouillé), jamais pause ni stop
- Enchaînement automatique vers le vocal suivant de la conversation (registre d'autoplay et file du coordinateur) avec garde anti double-avance
- Lecture en arrière-plan et commandes de notification/écran verrouillé (MediaStyle), service de premier plan de type mediaPlayback
- Profil de session : transient (duck par défaut, ne vole jamais la carte Now Playing) vs content (moteur du coordinateur de conversation)

Rendu : Pas de rendu propre : le moteur nourrit la bulle (bouton, waveform, timecodes), le mini-lecteur et la notification média. La notification média reprend le nom de l'expéditeur, l'avatar et la durée ; le tint suit l'accent de la conversation.

Transposition Android : AVAudioPlayer/AVAudioSession devient Media3 ExoPlayer dans un MediaSessionService + AudioFocusRequest ; Timer 5 Hz devient un flux de position échantillonné ; commandes distantes (MPRemoteCommandCenter) deviennent les boutons MediaStyle de la notification.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlaybackManager.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioBytesLoader.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Regarder une vidéo en plein écran avec transport, enregistrement et partage

`media-video-fullscreen-player` · Android : **absente** · P0 · effort L

Le rendu plein écran passe par le gestionnaire partagé (PiP et coordination globale) : nom de fichier en barre haute, gros bouton play/pause central (⏪10 / ▶︎⏸ / ⏩10 en verre) qui s'efface une seconde après le début de la lecture (reste atteignable par VoiceOver), chrome qui s'efface après 3 s, tap pour le réafficher, balayage vers le bas pour fermer (avec passage en PiP), pincement pour basculer remplissage/ajustement du cadre, barre capsule ou bande de progression en bas (temps · scrub · durée) et colonne de disques à droite (son, AirPlay, menu ⋯ avec vitesse 1,0 à 2,0, boucle, PiP), boutons enregistrer dans Photos (dédoublonné) et partager, ligne d'informations « largeur × hauteur · poids · durée » (temps restant pendant la lecture). Garde de disponibilité (télécharge si pas prêt, textes « Téléchargez pour lire la vidéo », « La lecture démarrera après le téléchargement »), garde-fou si le chargement retombe sur un état nul, poster net puis thumbHash flou. TransportLayout répartit les contrôles entre barre, menu et rail selon le placement (stacked, centre seul, couloir de progression seule, colonne d'actions).

Écarts :
- Aucun lecteur vidéo plein écran : la visionneuse Android ne gère que des images (poster flou avant) ; créer un écran plein écran vidéo avec Media3
- Chrome : titre/nom de fichier, centre ±10 s + play/pause en verre (52/64 pt), bouton central qui s'efface 1 s après le début (FullscreenPlayPauseFade) mais garde un relais d'accessibilité ; reste du chrome masqué après 3 s, tap pour l'afficher (animation 0,2 s)
- Gestes : tap = basculer le chrome, balayage vers le bas (distance min 30) = fermer (avec PiP si actif), pincement = remplissage vs ajustement (haptique légère)
- Barre de transport : capsule unique (temps · scrubber · durée) ou, sur le plateau, play seul au centre + bande de progression seule au couloir ; colonne de disques empilés (son, sortie audio, menu ⋯) ; menu ⋯ avec Vitesse (1,0 / 1,25 / 1,5 / 1,75 / 2,0), Boucle, PiP ; barre 48 dp de haut
- Ligne d'infos « L × H · poids · durée » (segment absent sans séparateur orphelin, durée = temps restant pendant la lecture, déclarée tant que le moteur n'a pas la sienne)
- Enregistrer dans la galerie : copie depuis le cache disque (pas de re-téléchargement), flux en streaming sans charger 200 Mo en mémoire, dédoublonnage (« Déjà dans la photothèque »), états idle / saving / saved / failed qui retombent à idle après 2 s ; partager
- Disponibilité : télécharger pour lire, en téléchargement avec progression, indisponible avec réessai ; échec de chargement distingué d'une fin de flux (poster figé sans spinner)
- Poster net opaque puis fond thumbHash flou assumé, spinner discret jusqu'à la première frame composée avec failsafe de 2,5 s
- Rapport de visionnage unique (observateur de fin de flux dans le moteur) + rapport partiel à la fermeture ; barre de bouclier de capture (protection) et portillon de sortie (view-once/protégé : ni enregistrer ni partager)
- Libellés : Lire la vidéo, Pause, Reculer de 10 secondes, Avancer de 10 secondes, Couper le son, Réactiver le son, Plein écran, Fermer, Télécharger la vidéo, Vitesse, Boucle

Rendu : Fond noir, barre d'état masquée (immersif), chrome en verre/translucide, hiérarchie : play central dominant et transparent (opacité réglable), progression au couloir bas, colonne de disques à droite ; boutons à cible 44 dp ; animation du chrome easeInOut 0,2 s ; ressort 0,28 / 0,55 sur les boutons de transport.

Transposition Android : AVPlayerLayer.videoGravity devient PlayerView resizeMode FIT/ZOOM ; swipe-down + MagnificationGesture deviennent pointerInput ; menu ⋯ devient DropdownMenu ; sortie audio : voir media-airplay-route-picker.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+FullscreenSave.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/TransportLayout.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaInfoLine.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Lire une vidéo dans la bulle ou le fil avec ses contrôles superposés

`media-video-inline-player` · Android : **absente** · P0 · effort M

MeeshyVideoPlayer est le composant vidéo polymorphe unique (bulle, carrousel, post, story, plein écran, chip de réponse, pièce du composer) piloté par Style (inline/fullscreen), ControlSet (OptionSet : playPause, scrubber, duration, expand, download, save, share, mute, speed, close, author, airplay, pip, loop, skip), Frame (bulle/carte/plate avec rayon) et PerformanceOptions (buffer avant 2 s, sans attente de stalling). Le rendu inline joue via le gestionnaire partagé (une seule vidéo active), affiche la vignette tant que la première image n'est pas composée, résout le ratio d'affichage (transform de l'asset, puis ratio de vignette, puis métadonnée, puis 16:9), et superpose haut/centre/bas : expand à gauche, PiP/AirPlay/vitesse puis son à droite en haut, ±10 s autour d'un play dominant au centre, barre de seek avec temps courant/total en bas. Jeux de contrôles inlineDefault et inlineMinimal (son, play/pause, plein écran).

Écarts :
- Une vidéo de conversation n'est pas reconnue : BubbleContentBuilder ne distingue que images, audio, localisation et « fichiers » ; une vidéo tombe dans BubbleFile et s'ouvre via ACTION_VIEW après téléchargement. Ajouter BubbleVideo (miniature, durée, ratio, état de téléchargement) et un rendu dédié
- Composable MeeshyVideoPlayer unique à ControlSet (drapeaux), Frame et PerformanceOptions ; ReelVideoSurface (ExoPlayer par URL, sans contrôles) ne couvre que réels et stories
- Rendu inline : vignette tant qu'aucune frame n'est composée (isReadyForDisplay), spinner discret seulement tant que ça charge, ratio d'affichage résolu en 4 niveaux (transform, vignette, métadonnée, 16:9) et mis en cache par URL (borné, plus anciens évincés)
- Overlay de contrôles : scrim haut et bas, barre haute (agrandir au bord GAUCHE ; PiP masqué hors support puis AirPlay équivalent, vitesse, puis son au bord DROIT ; boutons 28 dp), centre ±10 s (36) autour de play/pause (54), bas = barre de seek + temps courant/total ; glass sur les boutons
- Jeux de contrôles inlineDefault [playPause, skip, scrubber, duration, expand, airplay, speed] et inlineMinimal [mute, playPause, expand] (feed et bulle ; sans PiP inline)
- Seek bar scrubbable à haute priorité qui signale le scrub à l'hôte (désengager SwipeToReply), cible de 44 dp
- Lecture via le moteur partagé (une seule vidéo active, démarrage automatique muet dans le fil selon la politique réseau), état de disponibilité à télécharger / en téléchargement / indisponible « Vidéo indisponible. Réessayer. »
- Références nues (pas d'abonnement à currentTime 5 Hz) : n'observer que les 4 champs lus pour ne pas recomposer toutes les bulles vidéo pendant une lecture

Rendu : Vidéo plein cadre sans lettre-box noir (le ratio de la bulle suit la source jusqu'à 9:16), coins selon Frame (card = smPlus) ; scrims dégradés haut et bas, boutons verre 28 dp en barre haute, play central dominant (54) et skips (36) ratio 0,67, hiérarchie visuelle claire ; barre de seek fine avec thumb et temps en mono.

Transposition Android : AVPlayer + AVPlayerLayer (couche UIView) devient Media3 ExoPlayer + PlayerSurface (SurfaceView, ou TextureView dans les listes qui défilent) ; AVAsset.preferredTransform devient la rotation dans Format.rotationDegrees ; adaptiveGlass devient surface translucide Compose.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+InlineRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoSurface.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlaybackController.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoPosterSource.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### On réagit avec un émoji à une photo ou une vidéo précise d’un message

`mav-attachment-reactions` · Android : **absente** · P1 · effort M

Les réactions sont par PIÈCE jointe (reactionSummary émoji→compte, currentUserReactions) et voyagent par attachment:reaction-add/-added/-remove/-removed. AttachmentReactionToggle est la règle des multi-réactions : les émojis s’empilent, le même émoji re-touché se retire (Outcome : nouveau résumé, mes émojis, ajouté ou retiré), partagée entre pièce chargée et pièce hors fenêtre (index des médias). AttachmentReactionBadge affiche une pastille en coin de tuile : au plus TROIS émojis triés de façon stable plus le total de TOUTES les réactions, absente s’il n’y en a pas (libellés a11y distincts si j’ai réagi). AttachmentReactionOffer répond à deux questions : la pièce offre-t-elle de réagir ici (en grille de bulle, sauf tuile solo : double tap et appui long ouvrent le sélecteur ; en plein écran, bouton « Réagir » de la rangée d’actions), sachant que SA protection (vue unique, floutée, chiffrée) décide, et un post/story/commentaire n’a aucune réaction par média ; puis la rangée d’émojis est-elle montée (fail-closed, ne contourne jamais la protection). AttachmentReactionPickerOverlay pose le sélecteur centré dans la tuile avec fond assombri qu’un toucher referme (rangée défilante).

Écarts :
- Aucune réaction par pièce : seuls les messages ont des réactions (ReactionApi/Repository) ; ajouter reactionSummary et currentUserReactions au modèle d’attachment
- Socket attachment:reaction-add/-remove (émission) et attachment:reaction-added/-removed (réception) avec fusion dans l’état
- Règle pure AttachmentReactionToggle (empile, re-toucher retire, compteurs, null quand vide) partagée entre pièces chargées et index des médias
- Pastille en coin de tuile : ≤ 3 émojis triés + total, masquée sans réaction, libellés a11y (moi inclus)
- AttachmentReactionOffer : double tap/appui long en grille (non solo), bouton Réagir en plein écran, respect de la protection de la pièce (vue unique/floutée/chiffrée), jamais sur post/story/commentaire
- Superposition du sélecteur centré dans la tuile avec fond assombri qui se ferme au tap

Rendu : Pastille capsule semi-opaque en coin haut-droit de la tuile : jusqu’à trois émojis puis le total en police 11–12 sp ; sélecteur de réaction flottant au centre de la tuile avec voile noir.

Transposition Android : EmojiReactionPicker → EmojiPicker/réactions rapides existants (sdk-ui EmojiPicker).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Components/AttachmentReactionToggle.swift`
- `apps/ios/Meeshy/Features/Main/Views/AttachmentReactionBadge.swift`
- `apps/ios/Meeshy/Features/Main/Views/AttachmentReactionOffer.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/AttachmentReactionPickerOverlay.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReactionApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/ReactionRepository.kt`

### Un vocal s’ouvre en plein écran : cadran circulaire, transport, pages balayables

`mav-audio-fullscreen-player` · Android : **absente** · P1 · effort L

AudioFullscreenView/Page présentent chaque vocal d’une conversation, d’un post, d’un commentaire ou d’un réel (AudioFullscreenSource agnostique de Message). Fond qui suit le thème, chrome partagé (barre haute avec compteur i / n et bouton télécharger gardé par ContentExitGate, rail d’actions). Au centre le portrait de l’auteur (72–168 pt, ouvre le profil) entouré du cadran AudioFullscreenDial : 72 barres de spectre en anneau (bande 40, écart 6, barres de 24 max, pulsation animée), curseur circulaire saisissable (fraction par angle depuis midi, ne saute pas par-dessus midi), durée totale à gauche de midi et temps écoulé à droite. Transport : pastille de vitesse (1, 1,25, 1,5, 1,75, 2, ajustable au balayage vertical VoiceOver), −10 s, play 56 pt avec progression, +10 s, sélecteur de sortie AirPlay. Pager horizontal sur les vocaux triés par date de réception, fenêtre de 3 pages rendues, démarrage de la piste 0,16 s après la page posée (les pages traversées sont annulées). La fin d’un vocal enchaîne sur la page voisine. Le chrome s’efface après 3 s de lecture et revient au toucher. Fermeture par glissement vertical franc vers le bas (suivi 0,6, seuil flick 1 500 pt/s, 40 pt), qui cède au balayage horizontal et à la transcription défilante. Mise en page empilée en portrait ou deux colonnes en paysage/iPad, contenu max 600. Ouvrable depuis un vocal cité dans le fil (QuotedAudioFullscreen). La lecture continue après fermeture (mini-lecteur + carte système).

Écarts :
- Écran/overlay plein écran audio avec HorizontalPager (fenêtre de 3 pages rendues, settle 160 ms, annulation des pages traversées) sur les vocaux triés par date de réception ; page qui suit la piste active en fin de lecture
- Cadran circulaire : 72 barres rééchantillonnées au pic depuis l’onde, pulsation animée, curseur circulaire (fraction par angle depuis midi, bande tactile 40, butée aux extrémités) via Canvas + pointerInput, retour haptique
- Portrait de l’auteur au centre (ouvre la feuille de profil), nom + date, durées total/écoulé de part et d’autre de midi
- Transport : vitesse cyclique 1→2 (ajustable TalkBack), ±10 s, play 56 dp avec spinner de chargement, sélecteur de sortie audio (MediaRouter/Output Switcher à la place d’AirPlay)
- Chrome qui s’efface à 3 s de lecture et revient au toucher/pause/fin ; état Immersion vs Ouverture (réagir/répondre) piloté par FullscreenChromeState
- Fermeture par glissement vertical franc (suivi ×0,6, flick 1 500 px/s ou 40 px) qui n’arme que pour un geste vertical et cède au pager et à la transcription défilante
- Disposition adaptative : empilée en portrait, deux colonnes en paysage/tablette/pliable, largeur lisible 600 dp, portrait = ce qui reste (min 72, max 168), paroles ×2,4
- Ouverture depuis un vocal cité dans le fil (une seule présentation plein écran à la fois, même état que la galerie)
- La lecture continue à la fermeture (mini-lecteur) ; position mémorisée par page quand le moteur ne joue pas la piste
- Fond dégradé teinté par la couleur du contact + bascule clair/sombre

Rendu : Verre adaptatif (disques de 40 dp, cibles 48), portrait central cerclé du cadran de barres accent, paroles en grand corps qui défilent sous un voile dégradé flouté en haut (en-tête) et en bas (langues), rail d’actions à droite posé au-dessus du pied. Compteur de page en capsule monospace. Animations : ressort 0,3 s sur le compteur, easeInOut 0,25 s sur le chrome.

Transposition Android : fullScreenCover → destination de navigation plein écran ou Dialog fullscreen avec prédictif back ; UIPanGestureRecognizer → pointerInput detectVerticalDragGestures avec arbitrage de pente ; AirPlay → MediaRouter2/Output Switcher.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenPage.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenDial.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenDismissDrag.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenPlayback.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+AudioFullscreen.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`

### En plein écran, les paroles du vocal défilent, se traduisent et se téléchargent

`mav-audio-fullscreen-transcript-languages` · Android : **absente** · P1 · effort M

AudioFullscreenPage+Transcription sert le texte du vocal : transcription serveur sinon transcription locale on-device ; versions traduites du snapshot plus celles arrivées en direct (dédupliquées par langue cible). Mode paroles (grand corps, mot courant ancré au premier tiers de la bande libre, défilement sous un voile flou) et mode lecture. États : vide « Aucune transcription » avec action « Transcrire » (menu : « Transcrire sur l’appareil » / « Transcrire via le serveur »), en cours, résultat. La transcription serveur revient par la socket (transcriptionReady) ; les audios traduits par audioTranslationReady/audioTranslationCompleted. Bandeau de drapeaux de langues (« Original » + traductions), feuille « Langues » / « Traduire l’audio », sélection de langue qui change la piste jouée (servedTrackURL), feuille de profil et bouton Télécharger. Retours haptiques succès/erreur.

Écarts :
- Bloc paroles défilant avec segment courant (TranscriptionKaraokeResolver existe), ancre au premier tiers, voile flou haut/bas, tap-to-seek
- États vide / transcription en cours / résultat ; menu Transcrire sur l’appareil / via le serveur
- Abonnement aux événements audio:transcription-ready, audio:translation-ready, audio:translations-completed et fusion dans l’état de la page (snapshot prioritaire, dédup par langue cible)
- Bandeau de drapeaux « Original » + langues, feuille « Langues », choix qui change la piste jouée sans perdre contexte ni file
- Bouton télécharger/enregistrer gardé par le portillon de sortie ; feuille de profil de l’auteur
- Haptique succès/erreur à la fin d’une demande de transcription

Rendu : Paroles en corps ×2,4 du corps de base (14), couleur secondaire, mot courant en pleine opacité accent ; chips de langue = drapeau + code, actif cerclé accent ; verre fondu sur la zone d’en-tête.

Transposition Android : LazyColumn de segments avec animateScrollToItem pour suivre le mot courant ; ModalBottomSheet pour la feuille de langues.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioFullscreenPage+Transcription.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentTranscriptionMerge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`

### Un mini-lecteur indigo reste en haut de l’app pendant qu’un vocal joue

`mav-audio-mini-player-bar` · Android : **absente** · P1 · effort M

MiniAudioPlayerBar est un bandeau plein largeur à aplat indigo, angles droits, qui occupe une bande de la pile de compression de RootView (au même titre que la bannière d’appel). Il montre l’avatar-monogramme de l’expéditeur sur voile blanc 22 %, le nom, la conversation, une barre de progression de 2 pt, et trois contrôles de 44×44 (play/pause, suivant, fermer). Le corps est un seul bouton VoiceOver qui ouvre la conversation source. Il se masque dans la conversation qui joue (la bulle est l’unique source d’UI), reste 5 s après l’épuisement de la file (graceContext, seulement si derniereFin == épuisée ; la croix ferme immédiatement) et entre/sort avec le ressort des barres du haut (par le haut s’il est la dernière barre, sinon rangé sous la barre d’appel). Il remonte ce qu’il affiche à l’hôte pour que la bande du haut se peigne avec lui.

Écarts :
- Composable de bandeau global monté dans MeeshyApp au-dessus de la navigation (hors écran d’appel), animé en slide-in/out avec réduction de mouvement respectée
- Contenu : monogramme expéditeur, nom, nom de conversation, LinearProgressIndicator 2 dp, boutons play/pause, suivant, fermer (cibles 48 dp)
- Règles de visibilité : masqué dans la conversation qui joue, grâce de 5 s après fin de file épuisée, fermeture immédiate sur croix, empilement avec la barre d’appel (isLastBar)
- Tap sur le corps = navigation vers la conversation source ; libellés TalkBack « En lecture », valeur % et indice d’ouverture
- Remonter la valeur AFFICHÉE (pas la valeur jouée) à l’hôte pour teinter l’inset du haut

Rendu : Fond indigo soutenu identique en clair et sombre, texte/icônes blancs (primaryForeground opaque, secondaryForeground atténué), angles droits, pleine largeur, hauteur ~56 dp, aucun flottement ni capsule. Monogramme dans un cercle 36 dp blanc 22 %.

Transposition Android : Bandeau Compose dans MeeshyApp (Scaffold topBar) ; la barre d’appel existe déjà (CallPill) et sert de modèle d’empilement.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`

</details>

### Un vocal en lecture se pilote depuis l’écran verrouillé, la notification et les écouteurs

`mav-audio-now-playing-system` · Android : **absente** · P1 · effort M

ConversationAudioCoordinator+NowPlaying relie le coordinateur à MPNowPlayingInfoCenter et MPRemoteCommandCenter : titre, artiste, durée, position (throttlée à 0,25 s), vitesse, et commandes play/pause/suivant/précédent/seek acheminées vers le coordinateur (écran verrouillé, Centre de contrôle, AirPods, CarPlay) avec suspension pendant un appel système. NowPlayingArtwork compose le visuel carré 600 px : avatar de l’AUTEUR, sinon avatar de la CONVERSATION, sinon icône de l’app, avec l’icône de l’app apposée en badge (26 % du côté, marge 4 %) en bas à gauche quand un avatar existe. MediaBackgroundPolicy : l’audio (vocaux, posts audio) survit à l’arrière-plan, en lecture ou en pause (carte Now Playing), la vidéo jamais hors PiP ; la session audio n’est désactivée que s’il ne reste rien à faire vivre.

Écarts :
- Aucun MediaSessionService ni MediaStyle notification ; manifeste sans FOREGROUND_SERVICE_MEDIA_PLAYBACK : la lecture s’arrêterait en arrière-plan
- Publier metadata (titre = expéditeur, album = conversation, durée, position, vitesse) via Media3 MediaSession ; commandes play/pause/next/previous/seek depuis notification, écran verrouillé, écouteurs Bluetooth, Android Auto
- Générateur d’artwork : avatar auteur > avatar conversation > icône app, avec icône app en badge bas-gauche (26 %, marge 4 %), canvas carré 600
- Politique de fond : audio survit en lecture ou en pause (service au premier plan), vidéo part en PiP ou se met en pause ; libérer le focus audio et le service seulement quand rien ne vit
- Throttle de la position publiée à 250 ms ; suspension des commandes distantes pendant un appel système/VoIP
- Notification canal dédié « Lecture audio » (silencieux, sans badge) et action fermer

Rendu : Artwork carré avatar plein cadre avec petite icône Meeshy en bas à gauche ; titre = nom de l’expéditeur, sous-titre = nom de conversation ; barre de progression système.

Transposition Android : MPNowPlayingInfoCenter/MPRemoteCommandCenter/CarPlay → Media3 MediaSession + MediaSessionService + notification MediaStyle (foreground service type mediaPlayback) ; Live Activity audio → la notification média.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator+NowPlaying.swift`
- `apps/ios/Meeshy/Features/Main/Services/NowPlayingArtwork.swift`
- `apps/ios/Meeshy/Features/Main/Services/MediaBackgroundPolicy.swift`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`

### Tous les visualiseurs plein écran partagent le même chrome (croix, disques, rail, voile, réactions)

`mav-fullscreen-chrome-kit` · Android : **absente** · P1 · effort M

Le kit MeeshyUI/Fullscreen fixe une seule table de cotes (FullscreenChromeMetrics : disque de verre = MeeshyControlSize.regular, cible tactile 44+, glyphe de disque, glyphe flottant, cellule flottante 56, gouttière, seuil de fermeture 150, effacement auto 3 s, fondu du bouton pause 1 s) et des composants : FullscreenChromeDisc/Button/CloseButton (croix ou chevron retour, teintes onMedia/adaptive), FullscreenActionRail + FullscreenActionButton (habillage disc pour la colonne courte de galerie, floating pour le rail social story/réel avec libellé ou compteur), FullscreenReactionStrip (rangée d’émojis défilante à l’échelle par défaut) avec fabriques react/reply (« Réagir » = émoji + plus, teinté indigo quand ouvert), FullscreenScrims (deux dégradés pleine largeur qui suivent le chrome), fullscreenChromeVisibility (le chrome qui s’efface ne se touche plus). FullscreenChromeState est la loi immuable : immersion (tap média) vs ouverture (réactions, réponse, panneau), un tap referme d’abord ce qui est ouvert, ouvrir une surface congédie l’autre, changer de page retire l’ouverture mais garde l’immersion, effacement auto seulement pendant une lecture. FullscreenPlayPauseFade : bouton pause centré qui s’efface 1 s après le début de lecture, revient au toucher, reste visible en pause.

Écarts :
- Créer le paquet sdk-ui fullscreen : FullscreenChromeMetrics (tokens), FullscreenChromeDisc/Button/CloseButton, FullscreenActionRail/ActionButton (styles disc et floating), FullscreenScrims, modificateur de visibilité qui neutralise les touches pendant le fondu
- FullscreenChromeState en data class immuable avec tappingMedia/opening/toggling/closingOverlay/revealing/turningPage/autoHiding et autoHideDelay(isPlaying) (null hors lecture ou chrome masqué ou ouverture active)
- FullscreenPlayPauseFade (1 s, tap média réarme, bouton visible = pause, reste en pause)
- FullscreenReactionStrip + boutons réagir/répondre ; ouvert = teinte indigo400
- Remplacer le chrome ad hoc de MeeshyImageViewer (compteur, bouton save, légende) par ce kit pour la parité visuelle
- Contraste lisible sur n’importe quelle image : voile haut/bas et teinte onMedia ou adaptive selon la luminance

Rendu : Disques de verre de 40 dp avec cible 48 dp, glyphes figés (non mis à l’échelle par la police), gouttière MeeshySpacing.lg, intervalle de rail MeeshySpacing.sm, halo sous glyphe nu (échelle 1,22, rayon 7, opacité 0,55). Voiles du haut et du bas suivant le chrome au même ressort.

Transposition Android : adaptiveGlass → Surface translucide + RenderEffect blur (API 31+) avec repli scrim ; FullscreenChromeSymbol SF Symbols → ImageVector Material équivalents (close, arrow_back, emoji_emotions, reply, auto_awesome).

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenActionRail.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenChromeButton.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenChromeMetrics.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenChromeState.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenPlayPauseFade.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenReactionStrip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenScrims.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyDimens.kt`

### La galerie plein écran suit des lois de cadrage : cadre arrondi, immersion, double tap ±10 s

`mav-gallery-stage-laws` · Android : **absente** · P1 · effort M

StagePresentation est l’état d’immersion unique (carded, full(pausedOnEntry)) et dit par quelle PORTE on entre en plein cadre : tap (bascule), appui long (entre en plein cadre en pause ; déjà en plein cadre, bascule pause/lecture sans quitter), glissement vers le haut (entre en lecture) ; transportIntent distingue ce que la porte commande à la lecture de ce qu’elle commande au cadrage. MediaStageFraming (SDK) est la loi de cadrage : les couloirs haut/bas (porte de sortie, menu, rail des autres médias, bande de progression au-dessus du rail réservée pour le LOT) sont réservés EN PREMIER, puis le cadre prend le reste (deux cotes : cadre et média, planchers de hauteur et de largeur dérivés de l’overlay et de la colonne d’actions) ; l’équilibre ne dépend pas du ratio. MediaStageSeek : double tap latéral −10 s à gauche, +10 s à droite (tiers latéraux, rien au centre pour ne pas retarder le tap simple, nil sur un média sans durée pour ne pas entrer en collision avec le double tap de zoom d’une image). MediaStageVeil : le chrome se peint si carded ET aucune ouverture (réactions, barre de réponse) ; une ouverture VOILE sans libérer la place (la géométrie ne bouge jamais) ; entrée en plein écran sans chrome sauf sous VoiceOver ; la pastille « En pause » se tait sous le voile.

Écarts :
- MeeshyImageViewer est un visualiseur d’images noir immersif (pager, pinch-zoom, double tap) sans cadre arrondi, sans couloirs, sans vidéo ni audio
- StagePresentation (carded/full) + after(door) et transportIntent (aucun/pause/bascule) à porter en logique pure
- MediaStageFraming : couloirs réservés d’abord, deux cotes (cadre vs média), planchers dérivés de l’overlay et de la colonne d’actions, bande de transport réservée pour le lot
- MediaStageSeek : zones backward/center/forward (tiers), pas de 10 s, nil sans durée, bornage à la durée
- MediaStageVeil : showsChrome(presentation, overlays), entrée en plein écran sans chrome (sauf TalkBack actif), géométrie indépendante des ouvertures, pastille « En pause » masquée sous voile
- Gestes : tap bascule, appui long pause/entre, glissement haut entre en lecture, double tap latéral ±10 s ; compatibilité avec le zoom des images

Rendu : Cadre arrondi centré avec plateau autour (couloir haut : sortie + menu ; couloir bas : rail des médias + bande de progression) ; en plein cadre coins droits et plus de plateau ; pastille « En pause » centrée.

Transposition Android : Lois pures en Kotlin (rejouent les vecteurs iOS) ; gestes via pointerInput/combinedClickable ; VoiceOver → AccessibilityManager.isTouchExplorationEnabled.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Media/StagePresentation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageFraming.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaStageSeek.swift`
- `apps/ios/Meeshy/Features/Main/Views/MediaStageVeil.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerTransform.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### « Médias, liens et documents » : tout ce qui a été partagé dans une conversation, par genre, avec recherche

`mav-media-hub` · Android : **absente** · P1 · effort M

ConversationMediaHubView est l’onglet Médias de la fiche de conversation, monté dans son ScrollView. Champ de recherche (loupe, « Rechercher », bouton d’effacement), barre de segments défilante (Médias, Audio, Documents, Liens, Contacts, Conversations, Lieux — ConversationMediaKind, icônes dédiées, puce sélectionnée), avis hors ligne persistant (« Hors ligne — les éléments déjà vus restent affichés ») tant que des éléments existent. Contenu : grille 3 colonnes (espacement 2 pt) de tuiles MediaHubVisualTile pour les médias (miniature serveur ou plus petite variante, durée en badge), liste paresseuse pour les autres genres (lignes document/audio/lien avec « Ouvrir le lien <hôte> », lieu avec nom/adresse et « Ouvrir dans Plans »). Pagination infinie (loadMore au dernier élément), pied « Tout est chargé » ou « La suite n’a pas pu être chargée ». États dessinés : squelette par segment, vide par segment (« Aucun … », « Aucun résultat pour … »), hors ligne sans données (« Hors ligne — cette liste n’a pas encore été chargée. » + Réessayer), erreur (« Impossible de charger cette liste. » + Réessayer). Action contextuelle « Aller au message » (chemin around du fil s’il n’est pas chargé). Ouverture d’un média = galerie de la conversation sur la pièce (ou présentation propre depuis la liste des conversations). Cache-first par (conversation, genre) avec marqueur de complétude. Mêmes clés et mêmes mots que le web.

Écarts :
- Aucun écran/onglet média : seule la galerie d’images du fil existe (ConversationGallery, images seulement, pas d’index par genre)
- ViewModel cache-first par (conversation, genre) avec listing paginé (curseur), recherche, phases loading/offline/failed/loaded et marqueur de complétude
- Segments (visual, audio, document, link, contact, conversation, location) avec icônes et libellés, puce sélectionnée, annonce TalkBack d’appartenance
- Grille 3 colonnes (LazyVerticalGrid) avec tuiles miniature + durée, lignes de liste par genre, ligne de lieu (nom/adresse/Ouvrir dans Cartes via intent geo)
- États : squelette, vide, vide sur recherche, hors ligne (avec/sans données), erreur avec Réessayer, pied « Tout est chargé » / échec de page
- Action « Aller au message » (chemin around) et ouverture de la galerie sur la pièce touchée ; retour haptique léger
- Reprendre les clés de chaînes du web (media_hub.*) dans les 4 langues d’Android

Rendu : Champ de recherche arrondi MeeshyRadius.sm sur surfaceFill avec filet 1 dp ; puces de segment accent (sélectionnée = fond accent), padding horizontal lg ; grille de tuiles carrées sans coins arrondis marqués avec 2 dp d’écart ; avis hors ligne en warning avec icône wifi.slash.

Transposition Android : LazyVGrid/LazyVStack → LazyVerticalGrid/LazyColumn ; Plans → intent geo: ; fullScreenCover → destination plein écran.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MediaHub/ConversationMediaHubView.swift`
- `apps/ios/Meeshy/Features/Main/Components/MediaHub/ConversationMediaHubCells.swift`
- `apps/ios/Meeshy/Features/Main/Components/MediaHub/ConversationMediaHubCopy.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsSheet.kt`

### On répond à un média sans quitter le plein écran, avec un brouillon qui survit

`mav-media-reply-bar` · Android : **absente** · P1 · effort M

MediaReplyComposerBar est la barre universelle montée par la galerie AU-DESSUS du média (jamais à sa place) pour citer la pièce regardée : la citation est composée par la fabrique unique optimisticReplyReference(quoting:citing:) et porte l’attachmentId (ancre gravée à l’envoi) ; bannière de citation « Vous » / expéditeur avec bouton d’annulation et libellé a11y ; placeholder dédié. Le brouillon est tenu par l’hôte, clé = id de la pièce citée, et survit à la fermeture de la barre (« en sortir rend le média intact, brouillon compris »). MediaReplyKeyboardInset corrige l’occlusion par le clavier (la couche de réponse ne porte pas ignoresSafeArea(.keyboard) et suit la transition du clavier) ; à l’envoi : fermer le clavier puis masquer la barre ; à l’annulation : masquer la barre.

Écarts :
- Barre de réponse superposée au visualiseur plein écran avec citation de la pièce regardée (id de pièce comme ancre) et bannière annulable
- Brouillon par id de pièce persistant à la fermeture de la barre (DraftAutosave existe pour le composer principal)
- Gestion du clavier (WindowInsets.ime) : la barre se pose au-dessus du clavier, envoi = fermer le clavier puis masquer la barre
- Envoi d’une réponse avec attachmentId cité (corps REST) ; libellés a11y

Rendu : Bannière de citation au-dessus du champ de saisie, la scène reste intacte derrière, animation easeOut qui suit la durée du clavier.

Transposition Android : UniversalComposerBar → composer Compose existant en mode réponse ; KeyboardTransition → imePadding/WindowInsets.ime animé.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MediaReplyComposerBar.swift`
- `apps/ios/Meeshy/Features/Main/Views/MediaReplyKeyboardInset.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/DraftAutosave.kt`

### Pendant un enregistrement, les sons extérieurs se coupent et le son Meeshy baisse puis revient

`mav-recording-audio-focus-ducking` · Android : **absente** · P1 · effort S

RecordingSessionLaw fixe la session partagée pendant un vocal ou une vidéo filmée (non mélangeable : les sons EXTÉRIEURS s’arrêtent) et ce que devient la session à la fin (retour à la lecture de contenu si un son Meeshy joue encore, sinon désactivation avec notifyOthersOnDeactivation). MeeshyRecordingSession (begin/finish/prepare/handBack) orchestre via RecordingSessionControlling implémenté par MediaSessionCoordinator+Recording. RecordingPlaybackDucker baisse le volume des lecteurs Meeshy qui s’entendent (registre faible de AudiblePlaybackSource) à 0,3 via PlaybackDuckLedger, puis rend EXACTEMENT le volume mémorisé ; baisser deux fois ne baisse qu’une fois, rendre sans avoir baissé ne fait rien, un volume changé par l’utilisateur pendant l’enregistrement n’est pas écrasé, un lecteur muet n’est jamais rendu audible.

Écarts :
- Loi pure RecordingSessionLaw (source vocal/vidéo → configuration de session, handBack selon qu’un son Meeshy joue encore)
- Orchestrateur MeeshyRecordingSession : begin demande AudioFocus (GAIN_TRANSIENT_EXCLUSIVE), baisse les lecteurs Meeshy, finish les remonte et abandonne le focus ou le rend à la lecture
- PlaybackDuckLedger pur : facteur 0,3, mémorise le volume d’avant, restauration exacte, idempotence, respect d’un volume changé par l’utilisateur, ne touche jamais l’état muet
- Registre de lecteurs audibles (ExoPlayer/MediaPlayer) auquel le moteur partagé s’inscrit
- Refus propre si un appel VoIP tient la session (begin retourne false)

Rendu : Aucun élément visuel ; effet perceptible : le son de l’app baisse nettement sans s’arrêter pendant la prise.

Transposition Android : AVAudioSession.record/playAndRecord → AudioManager.requestAudioFocus(AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE) ; duck → Player.volume ×0,3.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Media/MediaSessionCoordinator+Recording.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/MeeshyRecordingSession.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/PlaybackDuckLedger.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/RecordingPlaybackDucker.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/RecordingSessionLaw.swift`

</details>

### Une barre indique la progression de l’envoi (pourcentage, fichiers envoyés, fichier courant)

`mav-upload-progress-bar` · Android : **absente** · P1 · effort S

UploadProgressBar affiche la progression globale d’une file d’upload (UploadQueueProgress) : icône arrow.up.circle.fill teintée accentColor qui fait un tour complet à 100 %, nom du fichier en cours (caption2 medium), libellé « x/y fichiers », pourcentage et barre de progression. Accessibilité : libellé « Envoi des fichiers » et valeur « n %, x fichiers sur y envoyés, <nom> ».

Écarts :
- Aucune progression d’upload dans le chat (grep : aucun état d’upload côté ChatViewModel/UI)
- Modèle de progression globale (pourcentage, fichiers terminés/total, fichier en cours) alimenté par le worker/TUS
- Composable de barre : icône qui tourne à 100 %, nom du fichier, « x/y fichiers », %, barre linéaire accent
- Libellés TalkBack et valeur annoncée

Rendu : Bandeau fin au-dessus du composer : icône 16 dp accent à gauche, nom tronqué, « x/y fichiers » et % à droite, barre arrondie accent sur fond muet.

Transposition Android : WorkManager setProgress / Flow de progression TUS.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift`

</details>

### Une vidéo en plein écran passe en incrustation (PiP) quand on quitte l’app

`mav-video-fullscreen-pip` · Android : **absente** · P1 · effort M

FullscreenAVPlayerLayerView (VideoLegacySupport) héberge l’AVPlayerLayer plein écran avec gravité réglable, détection de première image composée (isReadyForDisplay, KVO) sur laquelle la galerie retire son poster net, et ouvre un PiP en sortie d’app (PipPresentationLaw, #11041) sauf si l’hôte le refuse. OrientationManager déverrouille l’orientation pendant la lecture plein écran. MediaBackgroundPolicy (partagée avec la carte Now Playing) tranche : la vidéo (réels, vidéos de commentaire, message plein écran) ne survit JAMAIS hors PiP — elle part dans la fenêtre PiP que le système ouvre (auto-PiP) sinon elle est mise en pause.

Écarts :
- Surface vidéo plein écran avec signal de première image prête (Player.Listener onRenderedFirstFrame) pour retirer le poster
- PiP à la sortie d’app pour la vidéo plein écran (enterPictureInPictureMode / setAutoEnterEnabled API 31+, PictureInPictureParams avec ratio), pause sinon
- Politique MediaBackgroundPolicy : audio vit en arrière-plan, vidéo jamais hors PiP, désactivation du focus quand rien ne vit
- Déverrouillage d’orientation pendant la lecture plein écran (OrientationManager) et rétablissement à la sortie
- Attribut android:supportsPictureInPicture, configChanges et gestion de l’état PiP dans MainActivity

Rendu : Vidéo plein cadre aux coins droits, chrome effaçable ; en PiP la fenêtre système affiche la vidéo avec lecture/pause.

Transposition Android : AVPictureInPictureController → Activity.enterPictureInPictureMode + PictureInPictureParams ; UIInterfaceOrientation → requestedOrientation SCREEN_ORIENTATION_FULL_USER.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VideoLegacySupport.swift`
- `apps/ios/Meeshy/Features/Main/Services/MediaBackgroundPolicy.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### On consulte, active et supprime son profil vocal (statut, qualité, clonage, voix publique)

`mav-voice-profile-manage` · Android : **absente** · P1 · effort M

VoiceProfileManageView (feuille avec en-tête fixe « Profil vocal » et retour en verre) : état de chargement, état vide (« Aucun profil vocal », « Créez un profil vocal pour que vos messages traduits conservent votre voix naturelle. », bouton « Créer un profil vocal » qui ouvre le wizard), et contenu du profil : carte de statut (pending « En attente » horloge/warning, processing « Analyse en cours » engrenages/info, ready « Actif » sceau/success, failed « Échec » triangle/error, expired « Expiré » horloge-badge/muet, avec description), carte d’infos (Qualité en %, Échantillons, Durée totale « n secondes », Créé le, Dernière utilisation), bascule du clonage vocal, bascule « voix publique », et suppression avec alerte « Supprimer le profil vocal » (« Cette action est irréversible. Toutes vos données vocales seront supprimées conformément au RGPD. »). Haptique légère/moyenne/succès.

Écarts :
- Aucun écran de gestion : à créer dans :feature:settings ou :feature:profile avec états chargement / vide / profil
- Carte de statut avec icône, couleur et texte par statut (pending, processing, ready, failed, expired)
- Carte d’infos (qualité %, échantillons, durée totale, créé le, dernière utilisation) avec formatage localisé
- Bascules clonage vocal et voix publique (PATCH/POST correspondants), suppression avec alerte RGPD irréversible
- Entrée depuis les réglages (compte/confidentialité) et depuis la notice de consentement manquant d’une bulle vocale

Rendu : Cartes arrondies teintées accent, pastille de statut colorée (warning / info / success / error / muet), toggles avec sous-titres, bouton de suppression en error ; en-tête fixe sans défilement pendant les états chargement et vide.

Transposition Android : alert SwiftUI → AlertDialog Material 3 ; sheet → écran de navigation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

### Voir les GIF, APNG et WebP animés s'animer partout (stickers, messages, commentaires)

`media-animated-image-playback` · Android : **absente** · P1 · effort M

Avant ce lot aucune image animée n'animait nulle part : tous les chemins d'image décodent l'index 0. AnimatedImageDecoder décode une image animée (ou dit qu'elle ne l'est pas) ; AnimatedImageEligibility décide en lisant au plus 40 octets si des octets PEUVENT porter une animation (peut dire « peut-être », jamais « non » pour un fichier animé) pour ne pas payer un CGImageSource par avatar/vignette ; AnimatedImageTiming rééchantillonne les délais par image sur le PGCD pour une cadence fidèle ; AnimatedImageMemo décode une seule fois (pas à chaque tick d'un déplacement de sticker) avec une mémoire bornée ; AnimatedImageResolution dit quand tenter le chemin animé et ce qu'il rend ; AnimatedImageView est la vue qui JOUE (UIImageView, car SwiftUI n'affiche que la première image) et gèle sur la première image en mouvement réduit au lieu de masquer ; AnimatedCachedImage enveloppe l'image du cache, animée si elle l'est et strictement inchangée sinon (repli fourni par l'appelant).

Écarts :
- Coil 2.7 n'embarque aucun décodeur animé (aucune dépendance coil-gif, aucun ImageDecoderDecoder dans l'ImageLoader) : un GIF/WebP animé s'affiche figé ; ajouter ImageDecoderDecoder (API 28+) et GifDecoder en repli pour API plus basses dans l'ImageLoader global
- Porte d'éligibilité par lecture de moins de 40 octets (signatures GIF, PNG/APNG acTL, WebP/RIFF ANIM) avant tout décodage, pour ne rien changer au chemin des JPEG/PNG fixes
- Enveloppe AnimatedCachedImage : image animée si elle l'est, sinon le chemin habituel inchangé (thumbHash, chargement progressif, placeholder, politique de téléchargement conservés)
- Mémoïsation du décodage (bornée) pour les stickers déplacés dans une scène de story
- Mouvement réduit (ANIMATOR_DURATION_SCALE = 0 ou réglage Meeshy) : figer sur la première image, jamais masquer
- Câbler les surfaces : stickers de message, stickers de commentaire, images de commentaire, stickers de scène, avatars exclus par construction
- Cadence : laisser AnimatedImageDrawable gérer les délais par image (l'équivalent du rééchantillonnage PGCD est natif sur Android)

Rendu : Rendu identique à une image fixe (même cadre, coins, placeholder) mais animé en boucle ; jamais d'indicateur ni de badge sauf demande produit.

Transposition Android : CGImageSource + UIImage.animatedImage + UIImageView devient android.graphics.ImageDecoder + AnimatedImageDrawable (via Coil ImageDecoderDecoder) dans un AndroidView ou un Painter animé ; PGCD des délais inutile (AnimatedImageDrawable respecte les délais).

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageDecoder.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageEligibility.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageMemo.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageResolution.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageTiming.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedCachedImage.swift`

</details>

### Répondre à une pièce jointe sans quitter son plein écran

`media-fullscreen-reply-to-attachment` · Android : **absente** · P1 · effort M

Depuis le plein écran d'une pièce (image, vidéo, etc.), une barre universelle de réponse (MediaReplyComposerBar) hébergée au-dessus du média envoie un message qui CITE la pièce regardée : sendReplyToAttachment résout le porteur (message de la fenêtre d'abord, sinon celui de l'index des médias) pour que le replyToId gravé et l'ancre désignent le même message (la garde serveur admitAttachmentReply refuse sinon), REJOUE la garde de protection (pas de citation d'une pièce protégée, view-once, floutée ou chiffrée : l'affichage du bouton et l'accès à l'envoi sont deux règles) et rend false sans rien envoyer si la pièce est introuvable, protégée ou le texte vide (le brouillon est gardé). fullscreenReplyCitation compose la citation (vignette de la pièce regardée, nature, auteur) via la fabrique unique de référence de réponse optimiste.

Écarts :
- Barre de réponse dans le plein écran média (image/vidéo/document) au-dessus du média, avec citation visible (vignette, nature, auteur)
- ViewModel : résolution du porteur d'une pièce (fenêtre puis index de médias) et envoi d'un message de type réponse avec ancre de pièce citée (QuotedAttachmentSend) ; aucun support de citation de pièce détecté dans ChatViewModel
- Garde de protection rejouée à l'envoi (isProtected, view-once, flouté, chiffré) ; false sans effet si pièce introuvable/texte vide et brouillon conservé
- Fabrique unique optimisticReplyReference(quoting:citing:) partagée avec la bulle optimiste et la bannière du composeur
- Langue d'origine du message envoyé renseignée

Rendu : Barre de saisie compacte au-dessus du média avec bandeau de citation (miniature de la pièce, nature, auteur) ; reste visible avec le clavier.

Transposition Android : MediaReplyComposerBar devient un composable ancré en bas du plein écran avec IME padding ; logique du ViewModel portée en Kotlin avec le même contrat de retour booléen.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+FullscreenReply.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`

### Recadrer une image avec des poignées d'angle et de bord, ratios et réglage au clavier

`media-image-crop` · Android : **absente** · P1 · effort M

CropOverlayView est le cadre de recadrage interactif : poignées de coin et de bord (poignée 24 pt, zone de touche 44 pt), mode ratio (poignées de bord masquées, les coins redimensionnent en gardant le ratio), déplacement du cadre entier au centre. CropGeometry porte l'arithmétique pure (resized par poignée et translation, constrained à des bornes avec taille minimale, step en pas de pourcentage, outward, scaledUniformly en gardant le ratio) et CropFrameMove (gauche, droite, haut, bas). L'extension d'accessibilité permet d'ajuster le cadre sans glisser (actions d'accessibilité par pas, valeurs en pourcentages x, y, largeur, hauteur). L'éditeur applique le ratio choisi (libre, carré, 4:3, 16:9, 9:16 en Pro) et ne cuit le recadrage que si l'utilisateur a réellement saisi le cadre.

Écarts :
- Composable de cadre de recadrage : coins + bords, zone de touche 44 dp, déplacement du cadre, voile assombri hors cadre, grille de tiers
- Géométrie pure testable : resized(handle, translation, aspectRatio), constrained(bounds, minSize), pas en %, redimensionnement uniforme en gardant le ratio (StoryMediaCrop ne couvre que le recadrage de média de story)
- Mode ratio : poignées de bord masquées, coins qui gardent le ratio, recentrage à 92 % du canvas lors d'un changement de ratio
- Callback onInteraction à la première prise : un recadrage n'est cuit que s'il est saisi (ouvrir/fermer l'outil est un vrai no-op)
- Accessibilité : ajustement par pas via actions TalkBack (gauche/droite/haut/bas, agrandir/réduire), valeurs en pourcentage vocalisées
- Rotation 90° gauche/droite et miroir horizontal/vertical qui transportent le cadre existant

Rendu : Cadre fin avec 4 coins en L et 4 poignées de bord (cachées en mode ratio), voile sombre hors cadre, chips de ratio en capsules sous le canvas (sélection en accent).

Transposition Android : DragGesture(minimumDistance:0) devient pointerInput(detectDragGestures) avec détection de poignée au point de départ ; accessibilityAdjustableAction devient semantics customActions.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/CropOverlayView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/CropOverlayView+Accessibility.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/CropGeometry.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`

### Éditer une image dans un éditeur plein écran unique avec FAB d'outils et mode Simple/Pro

`media-image-editor-ui` · Android : **absente** · P1 · effort L

MeeshyImageEditorView est l'éditeur immersif unique (profil, posts, stories, messages, communautés) : canvas plein cadre avec barre supérieure en verre, grappe de FAB en coin (outils en bas à gauche : Recadrer, Filtres, Ajuster, Effets ; historique en bas à droite), panneau « contrôleur » qui glisse seulement pour l'outil actif, bascule Simple/Pro (Simple masque Effets, ne montre que les filtres et réglages essentiels, ratios libre/carré/4:3/16:9 ; Pro ajoute 9:16, tous les filtres, 9 réglages), zoom par pincement/double-tap et déplacement, appui long de 0,25 s pour comparer à l'« Original » (badge capsule), rangées de réglages avec curseur + valeur formatée et « Ajustements réinitialisés », marges sûres réelles de la fenêtre, rendu final produit une fois sur « Terminé ». ImageEditorViewModel tient l'état, l'historique, le mode et la boucle de rendu ; ImageEditorModeSwitcher est la capsule segmentée Simple/Pro (indigo, segment actif en dégradé de marque) identique à celle de la timeline des stories.

Écarts :
- Écran éditeur d'image plein écran (aucun) appelable depuis profil, post, story, message, communauté, avec un contexte (ratio de recadrage préféré)
- FAB d'outils (Recadrer, Filtres, Ajuster, Effets) masqués quand un contrôleur est ouvert ; rail différent selon le mode (Effets réservé à Pro)
- Panneaux : Filtres (vignettes de prévisualisation par filtre), Ajuster (rangées de curseurs avec valeur formatée, bouton de réinitialisation), Effets, Recadrer (chips de ratio)
- Bascule Simple/Pro (ImageEditorMode) en capsule segmentée ; repasser en Simple depuis Effets ferme l'outil
- Comparaison avant/après en appui long de 250 ms (distance max 30), badge « Original » en capsule noire 55 % et retour au relâchement
- Zoom pincement, double-tap, déplacement du canvas ; image jamais mutée, rendu final unique sur « Terminé »
- Libellés : Recadrer, Filtres, Ajuster, Effets, Annuler, Terminé, Rotation, Pivoter à gauche/droite, Miroir (horizontal/vertical), Réinitialiser, Historique, Original
- Marges sûres réelles de la fenêtre (barre d'état masquée) pour que le chrome ne passe pas sous l'îlot/geste système

Rendu : Canvas plein cadre, aucun panneau fixe : options apparaissent à la demande ; barre supérieure verre ; FAB flottants ; capsule Simple/Pro en indigo avec segment actif en dégradé de marque ; animation spring 0,36 / 0,86 à l'ouverture d'un outil ; badge « Original » discret pendant la comparaison.

Transposition Android : SwiftUI ZStack immersif devient Box Compose avec WindowInsets ; adaptiveGlass devient surface translucide ; longPress minimumDuration devient pointerInput(detectTapGestures onLongPress/onPress).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyImageEditorView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/EditorTool.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorModeSwitcher.swift`

</details>

### Ouvrir l'une des premières conversations sans jamais attendre le réseau

`media-list-message-prefetch` · Android : **absente** · P1 · effort M

ConversationListMessagePrefetcher précharge les messages des 20 premières conversations de la liste pour qu'ouvrir l'une d'elles montre ses derniers messages sans attendre le réseau : la page (30 messages) est gravée dans la base locale que le fil PEINT (GRDB), pas seulement dans un cache hérité ; une conversation n'est sautée que si la base détient DÉJÀ son dernier message ET de quoi remplir un écran (20 messages), ou si une passe RÉUSSIE de ce processus l'a déjà rapportée sur ce dernier message ; la passe se rejoue au chargement, au retour au premier plan et à la reconnexion, UNE à la fois (une demande arrivée pendant une passe la suit, la plus récente remplace celle qui attendait) ; au plus 4 requêtes simultanées ; la passe est détachée, chaque requête part sous le jeton COURANT et ne demande ni n'écrit rien dès que le compte qui l'a lancée n'est plus actif (incident du 2026-09-29 : ~30 GET → 404 après changement de compte) ; le Prisme gravé est celui du fil (ReaderPrism).

Écarts :
- Planificateur de préchargement : cibles = 20 premières lignes à identifiant non vide ; needsPrefetch si la fenêtre locale (Room) ne contient pas le dernier message annoncé ou moins de 20 messages, sauf si une passe réussie l'a déjà rapporté (registre compte + conversation → dernier message)
- Gravure de la page servie (limit 30) dans la table de messages que le fil lit (Room), avec le Prisme du lecteur (ReaderPrism, rangs 1 à 4 sans repli « fr ») pour les citations de réponses
- Rejouer la passe au chargement de la liste, au retour au premier plan (ProcessLifecycleOwner) et à la reconnexion socket, une à la fois, la plus récente remplaçant la file
- Concurrence bornée à 4 requêtes ; échec n'entre pas au registre (retenté à la passe suivante)
- Garde de propriété : ne rien demander ni écrire dès que le compte lanceur n'est plus actif (stillOwner) ou si l'identifiant est vide ; jeton d'API courant à chaque requête
- Reste dans la logique cache-first : l'ouverture d'une conversation préchargée n'affiche ni squelette ni spinner

Rendu : Aucun rendu propre ; effet visible : la conversation s'ouvre instantanément avec ses derniers messages, sans squelette.

Transposition Android : Task détachée + actor devient coroutine sur Dispatchers.IO avec Semaphore(4) et Mutex ; scenePhase devient ProcessLifecycleOwner ; GRDB devient Room.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListMessagePrefetcher.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Un appel, une autre appli ou une autre vidéo met le son en pause et le rend ensuite sans perte

`media-playback-coordination` · Android : **absente** · P1 · effort M

PlaybackCoordinator tient le registre de tous les lecteurs (moteurs audio du SDK, lecteurs externes StoppablePlayer, gestionnaire vidéo partagé) : stopAll, arrêt audio seul (changement de page de réel), isAnyPlaying et isAnyAudioPlaying (l'audio survit à l'arrière-plan, la vidéo non : elle passe en PiP ou se met en pause), prise en main par un appel Meeshy décroché (les lecteurs capables de reprendre se mettent en pause marquée interrompue et reprennent au raccrochage), extinction en fondu. Les interruptions (appel système, autre appli) mettent en pause puis reprennent là où le son s'était arrêté, ou au retour dans Meeshy quand plus rien d'autre ne joue ; les pauses du PiP ou de l'écran verrouillé sont lues comme des pauses utilisateur après un court délai ; l'enregistrement d'un vocal baisse la vidéo qui joue ; les lecteurs à timeline (canvas de story, compte à rebours) se gèlent pendant l'interruption car celle-ci est un état, pas un événement.

Écarts :
- Registre central des lecteurs (audio, vidéo, réels) avec stopAll, stopAudioOnly, isAnyPlaying, isAnyAudioPlaying ; un lecteur qui démarre éteint les autres
- Gestion du focus audio (AudioFocusRequest) : perte transitoire = pause + reprise au gain, perte définitive = pause sans reprise auto, perte avec ducking = baisse de volume
- Reprise sans signal de fin : au retour dans Meeshy, si plus aucun autre son ne joue (AudioManager.isMusicActive), reprendre le média interrompu s'il est toujours là
- Appel Meeshy décroché : pause marquée interrompue sur chaque lecteur capable de reprendre, reprise au raccrochage (callEndedShouldResume), les autres s'arrêtent
- Règle d'arrière-plan : l'audio continue (service de premier plan), la vidéo passe en PiP ou se met en pause ; ne jamais mettre en pause une fenêtre PiP qui est en train de s'ouvrir
- Distinguer pause utilisateur (commande PiP/notification, conclue après un court délai sans interruption) et pause subie
- Baisser (ou couper) la vidéo qui joue pendant l'enregistrement d'un vocal
- Publier l'interruption comme ÉTAT observable (StateFlow) pour que le canvas de story et son compte à rebours se gèlent puis reprennent en place, y compris pour un lecteur monté pendant l'interruption
- Extinction en fondu d'un lecteur (volume rampé) plutôt qu'une coupure nette

Rendu : Aucun rendu direct ; effets visibles : le vocal ou la vidéo se met en pause quand un appel sonne, le timer d'une story s'arrête puis reprend à la même image, le mini-lecteur affiche l'état interrompu.

Transposition Android : AVAudioSession interruption notifications + MPRemoteCommandCenter deviennent AudioManager.OnAudioFocusChangeListener / AudioFocusRequest, MediaSession.Callback et PlaybackStateCompat ; CallKit/appel Meeshy devient l'état Telecom ConnectionService déjà présent dans feature/calls.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackInterruption.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlaybackManager+Interruptions.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+SessionSignals.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallAudioRoute.kt`

### Ouvrir la photo ou la bannière d'un profil en plein écran et la refermer d'un glissement

`media-profile-image-fullscreen` · Android : **absente** · P1 · effort S

FullscreenImageView ouvre l'avatar ou la bannière d'un profil en plein écran (cache disque, autoLoad vrai car l'ouverture est un geste explicite, décodage à la taille de la fenêtre). Agrandie, l'image se déplace sous le doigt ; à sa taille, le doigt la tire vers la sortie : glissement vers le bas PROGRESSIF et ANNULABLE (l'image suit le doigt, le fond s'éclaircit sans jamais laisser voir la fiche dessous en plein geste, rien n'est décidé avant la levée du doigt ; course au-delà de laquelle le doigt levé referme, lancée qui referme même sur course courte). Présentée en plein écran couvrant, elle laisse voir l'écran sous-jacent quand le fond s'éclaircit ; l'hôte qui l'a posée sur sa propre feuille la retire lui-même. Un toucher ouvre uniquement s'il y a une image.

Écarts :
- Un tap sur l'avatar ou la bannière n'ouvre aucune visionneuse dans ProfileScreen : brancher l'ouverture en plein écran (réutiliser MeeshyImageViewer)
- Glissement vertical de fermeture progressif et annulable avec fond qui s'éclaircit et seuils (course, lancée, éclaircissement maximal) ; zoom/déplacement quand agrandie
- Rien ne s'ouvre sans image ; chargement explicite à la taille de la fenêtre
- Gestion « qui ferme » : fermeture par l'hôte quand la vue est posée sur sa propre feuille

Rendu : Fond noir qui s'éclaircit pendant le glissement (jamais jusqu'à découvrir l'écran dessous complètement), image qui suit le doigt avec léger rétrécissement, retour au ressort.

Transposition Android : fullScreenCover devient Dialog plein écran ou destination de navigation avec transition partagée ; DragGesture devient pointerInput verticalDrag avec animation de retour.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### Reprendre un vocal ou une vidéo là où on s'était arrêté, sur n'importe quel appareil

`media-resume-position-multidevice` · Android : **absente** · P1 · effort M

La passerelle sert currentUserConsumption sur chaque pièce (lastPlayPositionMs, listenedComplete, lastWatchPositionMs, watchedComplete) mise à jour depuis tous les appareils du compte. MediaResumeResolver choisit la position de reprise et la fraction consommée au repos par PRÉCÉDENCE : le magasin local garde la main quand il porte une valeur, le serveur ne comble que son absence ; une consommation n'est détenue par un moteur que sous la clé de SA pièce (jamais la position d'une autre). MediaConsumptionSeeder, à l'ouverture d'une conversation, SÈME les magasins de position (audio/vidéo) avec le MAXIMUM entre local et serveur, jamais un recul, et la teinte de la waveform / barre de progression vidéo, pour refléter l'avancée faite ailleurs.

Écarts :
- Ajouter currentUserConsumption (lastPlayPositionMs, listenedComplete, lastWatchPositionMs, watchedComplete) au modèle ApiMessageAttachment : aucun de ces champs n'existe côté Android
- Magasins locaux de position par pièce (audio et vidéo) et de fraction consommée (DataStore/Room) avec la zone morte de reprise (position trop proche d'un bord ignorée)
- Résolution par précédence au repos : fraction locale sinon servie ; position de reprise éligible filtrée pour que le timecode n'annonce jamais une position que la lecture ignorerait
- Semis à l'ouverture de la conversation : position = max(locale, serveur), jamais de recul, rien si complet sans position ni durée ; fraction = position / durée plafonnée à 1
- Clé par attachmentId sur les moteurs partagés pour ne jamais reprendre un média à la position d'un autre
- Couplage avec le rapport d'écoute (media-consumption-reporting) pour que l'appareil suivant lise la bonne valeur

Rendu : Effet visible : la waveform est teintée en accent atténué (40 %) à hauteur de la fraction déjà écoutée avant même la lecture, le timecode affiche la position de reprise, le pourcentage de la chip reflète la consommation cumulée.

Transposition Android : UserDefaults/stores locaux deviennent DataStore Preferences ou table Room ; logique pure portée en core:model.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaResumeResolver.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/MediaConsumptionSeeder.swift`

</details>

### Continuer à regarder une vidéo en Picture in Picture en quittant l'appli

`media-video-pip` · Android : **absente** · P1 · effort M

Le PiP du lecteur partagé est porté par SharedPipEngine (contrôleur AVKit, délégué, drapeaux de transition, création différée) avec une façade publique sur le gestionnaire : état LIVE du contrôleur, surface qui a opté pour le PiP, fenêtre en cours d'ouverture (levée dès willStart de l'auto-PiP en sortie d'app pour que le garde d'arrière-plan n'avorte pas la fenêtre), échec d'ouverture (arrêt de la vidéo restée sans lieu), attente bornée de la déclaration de l'auto-PiP, fermeture par la croix = arrêt de la lecture (sinon audio fantôme) tandis que le teardown programmatique ou la restauration in-app garde la lecture, création de contrôleur différée après le dernier frame du défilement. PipPresentationLaw : PiP = plein écran uniquement (jamais depuis une bulle, un post du fil, une page de post, un commentaire inline) ; la protection d'une vidéo reste une condition à part. PipStartLedger tient l'état requested / failed / surface fermée derrière sa demande avec compteur d'échecs.

Écarts :
- Activer le Picture-in-Picture Android pour le lecteur plein écran : supportsPictureInPicture dans le manifeste, enterPictureInPictureMode(PictureInPictureParams) au geste et à la sortie d'appli (setAutoEnterEnabled API 31+), ratio d'aspect de la vidéo, RemoteActions play/pause
- Loi de présentation : PiP uniquement depuis le plein écran (réel, galerie, plein écran message/post/commentaire), jamais inline ; protection de la vidéo (view-once, protégé) interdit le PiP
- État d'ouverture (demandée / annoncée / démarrée / échouée) et garde d'arrière-plan : ne pas mettre en pause une fenêtre PiP en cours d'ouverture ; en cas d'échec d'ouverture en arrière-plan, arrêter la lecture
- Fermeture de la fenêtre PiP par l'utilisateur ⇒ arrêt de la lecture ; fermeture programmatique ou retour in-app ⇒ lecture conservée
- La bulle d'origine ne remonte pas le lecteur tant que le PiP joue (loi de montage)
- Création différée du PiP après la dernière frame du défilement pour ne pas coûter de la fluidité
- Masquer (et non désactiver) le contrôle PiP hors support appareil ; libellés « Picture in Picture » / « Quitter le Picture in Picture »

Rendu : Fenêtre PiP système avec contrôles lecture/pause ; en retour dans l'appli, le plein écran reprend la vidéo (flèche de restauration) ; aucun spinner.

Transposition Android : AVPictureInPictureController devient Activity.enterPictureInPictureMode + PictureInPictureParams (auto-enter API 31+, RemoteAction) et onPictureInPictureModeChanged ; canStartPictureInPictureAutomaticallyFromInline devient setAutoEnterEnabled(true) posé seulement en plein écran.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedPipEngine.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+Pip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+PipRules.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PipPresentationLaw.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PipStartLedger.swift`

</details>

### Être invité à activer le consentement vocal, et le donner en un geste

`media-voice-consent-gate` · Android : **absente** · P1 · effort S

AudioConsentNotice est une note inline discrète (message + action, accessibilité regroupée) qui invite à activer le consentement vocal ; VoiceConsentGate lit le consentement connu (préférences utilisateur confirmées par la passerelle via PUT /me/consents et GET /me/consents à chaque relecture des préférences) avec repli sur le statut REST du profil vocal, retourne « manquant » en échec silencieux (fail-safe false) et accorde le consentement de traduction automatique vocale.

Écarts :
- Appels API GET/PUT /me/consents et statut de consentement du profil vocal (VoiceConsentStatus existe en modèle, aucune API réseau)
- Porte VoiceConsentGate : isKnownGranted, fetchMissing() (fail-safe false en cas d'erreur), grant()
- Composant AudioConsentNotice : texte caption multi-ligne + action caption2 semi-gras, a11y « message. action »
- Affichage conditionnel dans la bulle de vocal / composer quand le clonage vocal serait utile et que le consentement manque, sans bannière intrusive

Rendu : Note inline très discrète (caption), pas de modale ni de popup, couleur secondaire, action en accent semi-gras.

Transposition Android : Même logique avec Retrofit/Repository et Preferences ; la note est un Compose Row cliquable.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/VoiceConsentGate.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioConsentNotice.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Gérer son profil vocal : clonage, visibilité, échantillons, suppression RGPD

`media-voice-profile-manage` · Android : **absente** · P1 · effort M

VoiceProfileManageView affiche l'état du profil (statuts Profil actif / En traitement... / En attente / Erreur / Expiré / Aucun profil avec sous-titres explicatifs), un interrupteur « Clonage vocal actif » (« Utiliser votre voix pour les traductions »), la visibilité publique de la voix, des statistiques (qualité, durée totale, nombre d'échantillons), la liste des échantillons vocaux (durée, suppression par échantillon) ou « Aucun échantillon enregistré », l'ajout d'échantillons, et la zone RGPD « Supprimer toutes les données vocales » avec alerte de confirmation. Le ViewModel charge profil + échantillons + consentement en parallèle, applique des bascules optimistes avec rollback (dernier appel gagnant pour clonage et visibilité), supprime un échantillon avec rollback, supprime le profil, ajoute des échantillons.

Écarts :
- Écran de gestion (aucun) accessible depuis les réglages, avec chargement parallèle profil + échantillons + consentement
- Statuts et sous-titres : Profil actif (« Votre voix est utilisée pour les traductions audio »), En traitement..., En attente de traitement, Erreur (« Le traitement a échoué, réessayez »), Expiré (« Enregistrez de nouveaux échantillons »), Aucun profil (« Créez un profil vocal pour activer le clonage »)
- Interrupteur de clonage et de visibilité publique avec mise à jour optimiste, rollback sur erreur et protection contre les réponses hors d'ordre (numéro de requête)
- Liste des échantillons (icône waveform, « Échantillon », durée en secondes, bouton corbeille) avec suppression optimiste + rollback ; entête « ECHANTILLONS VOCAUX »
- Zone RGPD : bouton « Supprimer toutes les données vocales », alerte « Supprimer le profil vocal ? » (Annuler / Supprimer tout), message d'irréversibilité, note « Conforme au RGPD »
- Ajout d'échantillons depuis l'écran (durée minimale 1 s estimée), messages d'erreur dédiés (chargement, clonage, visibilité, échantillon, profil, envoi)

Rendu : Sections en cartes, icône waveform en accent, corbeille en couleur d'erreur, bouton de suppression totale destructeur, notice RGPD en caption secondaire ; statut avec pastille de couleur (actif vert, erreur rouge, attente gris).

Transposition Android : List SwiftUI devient LazyColumn ; alert devient AlertDialog Material3 ; Toggle devient Switch avec état optimiste dans le ViewModel.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileManageView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileManageViewModel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Créer son profil vocal en cinq étapes : consentement, âge, échantillons, traitement, terminé

`media-voice-profile-wizard` · Android : **absente** · P1 · effort M

VoiceProfileWizardView guide la création du profil vocal : barre de progression par segments (accent pour les étapes atteintes), étape consentement (description, 5 points : échantillons, modèle unique, traductions en voix clonée, suppression RGPD à tout moment, chiffrement, toggle d'acceptation, bouton Continuer), vérification d'âge (date de naissance, 18 ans et plus, erreur si trop jeune), enregistrement (VoiceRecordingView, 3 échantillons minimum de 10 s), traitement (spinner, titre « Création du profil vocal... » et description, tâche qui téléverse et suit le profil), terminé (coche verte, « Profil vocal créé ! », bouton Terminer). Alerte d'erreur modale. Le ViewModel gère checkConsent, grantConsent, uploadSamples et formatBirthDate.

Écarts :
- Écran assistant en 5 étapes (consent, ageVerification, recording, processing, complete) avec barre de segments et fermeture « Fermer »
- API vocale : GET/POST consentement (VoiceEndpoint.profileConsent), GET/PUT/POST profil (VoiceEndpoint.profile), upload d'échantillons (durée estimée à 16 000 octets/s), suppression ; seuls les modèles VoiceProfile/VoiceConsentStatus/VoiceSample existent
- Étape consentement : 5 points de texte, toggle « J'accepte que mes échantillons vocaux soient utilisés pour créer un profil vocal », bouton Continuer désactivé tant que non coché
- Étape âge : sélecteur de date de naissance, vérification ≥ 18 ans, message « Vous devez avoir 18 ans ou plus pour utiliser le clonage vocal. », envoi de la date au format serveur
- Étape enregistrement : intégrer media-voice-sample-recording (3 échantillons, 10 s)
- Étape traitement : téléversement des échantillons avec progression (uploadedCount / totalToUpload), puis relecture du profil, spinner et libellés
- Étape terminé et alertes d'erreur (« Erreur lors de l'enregistrement du consentement. », « Erreur lors de l'envoi des échantillons vocaux. »)
- Point d'entrée depuis les réglages (profil vocal) et depuis la note de consentement

Rendu : Titres en police titre bold, descriptions 13 sp secondaires centrées, accent du compte pour la progression et le bouton principal (rayon md), coche verte 60 pt (couleur success), spinner agrandi 1,5x en traitement ; espaces généreux (Spacer haut et bas).

Transposition Android : NavigationStack d'étapes devient une feuille/écran Compose avec état d'étape ; DatePicker devient Material3 DatePicker ; téléversement via OkHttp multipart + WorkManager si besoin.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileWizardView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileWizardViewModel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

### Lire des phrases à voix haute pour enregistrer ses échantillons de voix

`media-voice-sample-recording` · Android : **absente** · P1 · effort M

VoiceRecordingView guide la capture des échantillons du clonage : texte à lire tiré de VoiceProfilePrompts (cinq séries de deux à trois phrases par langue, chacune visant un contour prosodique : déclaratif, interrogatif, exclamatif, énumératif, chiffré), décalage tiré une fois par présentation pour éviter la récitation de mémoire, langue de lecture choisissable (la langue PARLÉE, pas celle de l'interface), durée minimale de 10 s par échantillon (« min 10 s »), minimum 3 échantillons, liste des échantillons enregistrés, refus micro expliqué, bouton « Créer le profil vocal » quand le minimum est atteint, haptique légère.

Écarts :
- Vue de capture avec enregistreur injectable (AudioRecordingProviding équivalent), minimumSamples=3 et minimumDurationSeconds=10 paramétrables
- Portage de VoiceProfilePrompts (cinq séries par langue × 7 langues) en ressources localisées
- Choix de la langue de lecture modifiable en cours de route, initialisée sur systemLanguage de l'utilisateur
- Titre « Lisez ce texte à voix haute », « Échantillon N », indicateur « min 10 s », liste des échantillons enregistrés avec durée et suppression
- Message de refus micro avec renvoi aux Réglages ; bouton « Créer le profil vocal » actif seulement avec assez d'échantillons
- Rendre les échantillons (Data + durée) à l'assistant via onSamplesReady

Rendu : Carte de texte à lire en grande police lisible (prompt), gros bouton d'enregistrement rond avec haptique, chips de langue, liste d'échantillons compacte, bouton principal pleine largeur en accent.

Transposition Android : AVAudioRecorder devient MediaRecorder/AudioRecord 16 kHz mono (16 000 octets/s attendus par l'estimation de durée) ; permission RECORD_AUDIO via Activity Result API.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceRecordingView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`

### On peut rogner, couper, fondre, accélérer et amplifier un son avec annuler/rétablir

`mav-audio-editing-trim` · Android : **absente** · P2 · effort M

AudioEditOperation décrit des étapes réversibles et non destructives (original, trim(start,end), removeRange, fade(in/out), speed(rate), gain(multiplier)) ; AudioEditDocument garde l’historique de versions avec curseur (undo/redo, branche abandonnée supprimée, déplacement direct, durée mise à jour après chargement, nettoyage des fichiers de la session, décodeur validant pour la reprise après crash). AudioEditEngine rend une opération en fichier via AVFoundation hors main, annulable, avec plan clampé (jamais de crash sur une opération malformée) et erreurs typées (source illisible, pas de piste audio, composition échouée, résultat trop court, export indisponible/échoué, annulé). AudioTrackAcquisition/AudioTrimSection tranche ce que la zone « Rogner » montre : masquée, chargement, échec avec nouvel essai, ou poignées (un son de bibliothèque doit d’abord être rapatrié).

Écarts :
- Modèle AudioEditOperation + AudioEditDocument (versions, curseur, undo/redo, commit qui renvoie les versions orphelines, persistance JSON du manifeste)
- Moteur de rendu des opérations (Media3 Transformer/MediaCodec : trim, suppression de plage, fondus, vitesse avec ou sans pitch, gain) hors main et annulable, avec plan clampé
- Erreurs typées localisées et état resultTooShort
- AudioTrackAcquisition/AudioTrimSection : masquée / chargement / échec + réessayer / poignées, l’attente et l’échec primant sur un fichier local périmé
- Éditeur UI (poignées, lecture en boucle de la sélection, historique) ; clipping en lecture déjà possible via AudioTrackSurface (sourceStartMs/EndMs)

Rendu : Zone de rognage avec deux poignées sur l’onde, durée minimale 0,4 s, spinner et message d’échec avec bouton Réessayer, historique de versions sous forme de pastilles.

Transposition Android : AVMutableComposition/AVAssetExportSession → Media3 Transformer (EditedMediaItem, Effects) ou MediaCodec/MediaMuxer.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioTrackAcquisition.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioEditEngine.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioEditing.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Une photo prise dans Meeshy est redressée, bornée, améliorée et enregistrée selon vos réglages

`mav-camera-capture-processing` · Android : **absente** · P2 · effort M

PhotoCaptureProcessor applique UN traitement à toute photo prise dans Meeshy (conversation, post, réel, story, capture d’appel) : redresse les pixels (plus d’orientation EXIF à interpréter), borne la plus grande dimension (capture 2 560 px, qualité 0,85 ; capture d’appel 1 920 px JPEG), applique une amélioration (aucune, fidèle, ou légère : ombres relevées, bruit doux, netteté fine ; la trame d’appel y ajoute vibrance) puis ré-encode en JPEG ou HEIC en gardant les métadonnées (EXIF, TIFF, GPS si autorisé). CaptureSaveLaw décide où part une prise : zone cadre (toucher = photo, appui long = vidéo) → galerie puis édition, original conservé ; hors cadre ou déclencheur rond → gardé dans l’app (keptInApp) ou original vers la galerie selon le réglage ; chaque VERSION (cadre, format) à enregistrer est suivie (SavedVersion) pour ne pas dupliquer.

Écarts :
- La capture passe par les intents système (TakePicture/CaptureVideo) : aucun traitement de la photo (redressement, plafond de dimension, amélioration, métadonnées)
- Processeur de photo : plafond 2 560 px (1 920 pour un appel), qualité 0,85, JPEG/HEIC, amélioration none/faithful/light, métadonnées EXIF conservées, GPS selon permission
- CaptureSaveLaw : zones frame/outside, destinations (galerie, gardé dans l’app), versions (cadre, format) enregistrées sans doublon
- Réglages « Enregistrer l’original » et « Enregistrer la version avec effets et cadre » (voir réglages de téléchargement)
- Appareil photo intégré (CameraX) si l’on veut le déclencheur cadre/rond et la zone appui long vidéo

Rendu : Déclencheur rond et zone cadre, retour haptique à la prise.

Transposition Android : AVCapturePhotoOutput → CameraX ImageCapture ; CoreImage → RenderScript remplacé par GPU/Bitmap filters ; HEIC → ImageDecoder/HEIF writer (API 28+).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Media/PhotoCaptureProcessor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/CaptureSaveLaw.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerCameraChooser.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`

### L’app adapte les préchargements et la qualité à la classe de l’appareil (bas, moyen, haut, pro)

`mav-device-media-tier` · Android : **absente** · P2 · effort M

DeviceMediaTier range chaque appareil en low/mid/high/pro depuis des entrées NEUTRES (DeviceMediaInputs : mémoire rapportée en Gio, cœurs, cadence d’écran, décodeurs, économie d’énergie, état thermique nominal/fair/serious/critical) — seuils 2,5 / 3,5 / 5,5 Gio, 4 / 6 cœurs, classe de puce 7, 120 Hz — afin que toutes les lois de lecture lisent ce rang plutôt que de réinventer chacune leur seuil. Jumelle de capability-tier.ts du web : les deux rejouent packages/shared/fixtures/device-tier-vectors.json. DeviceMediaProbe produit les entrées sur l’appareil vivant (utsname, ProcessInfo, UIScreen, VideoToolbox/AV1) ; matériel lu une fois, énergie et thermique relus à chaque lecture (un iPhone qui chauffe descend en low et remonte).

Écarts :
- Loi pure classify(DeviceMediaInputs) avec les mêmes seuils et rejeu du fichier de vecteurs packages/shared/fixtures/device-tier-vectors.json
- Sonde Android : ActivityManager.memoryClass/isLowRamDevice/MemoryInfo.totalMem, Runtime.availableProcessors, Display.refreshRate, MediaCodecList (décodeurs matériels HEVC/AV1), PowerManager.isPowerSaveMode et getCurrentThermalStatus
- Relecture dynamique de l’énergie et du thermique (listener thermique API 29+)
- Brancher le tier sur les politiques de préchargement, de transcodage et de filtres vidéo

Rendu : Aucun élément visuel.

Transposition Android : utsname/ProcessInfo/VideoToolbox → Build/ActivityManager/PowerManager/MediaCodecList.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Media/DeviceMediaTier.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/DeviceMediaInputs.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/DeviceMediaTier+Live.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSurvivalPolicy.kt`

### Les boutons posés sur un média changent de teinte selon la luminance de ce qu’ils recouvrent

`mav-gallery-adaptive-chrome` · Android : **absente** · P2 · effort M

MediaChromeRegion/Placement mesure où un contrôle se pose sur le média (rectangle normalisé arrondi à une grille de 64, ratio du cadre, cadrage fit/fill, voile noir MediaChromeVeil dont le lecteur de Réels : rien en haut, 60 % noir au bas) et en déduit la part du média sous le contrôle (frange du bord le plus proche hors média). MediaChromeScheme élit le ColorScheme (clair/sombre) du chrome d’après la luminance mesurée du média : MediaChromeBackdrop identifie le média (page de galerie, carte Réel du fil, lecteur de Réels, slide de story avec cascade empreinte puis fond) et MediaLuminanceSampler mesure UNE fois par média, hors main, sans télécharger ni décoder ce que la surface n’a pas déjà (empreinte du modèle d’abord, bitmap seulement s’il est en mémoire), avec mémoire bornée (countLimit). Une mesure pour un autre média n’entre pas pendant un feuilletage ; sans mesure, schéma par défaut ; schéma d’un glyphe NU (#6704) mesuré sous le glyphe.

Écarts :
- Calcul de la luminance moyenne d’une région du média (ThumbHash donne l’empreinte, FrameLuminance existe pour les appels) et élection du schéma clair/sombre du chrome
- MediaChromePlacement : rectangle du contrôle normalisé sur grille de 64, ratio du cadre, cadrage fit/fill, voile (stops d’opacité) et part du média sous le contrôle
- Sampler mémoïsé borné, une mesure par média, ignorée si la clé ne correspond plus au média courant
- Backdrops par surface : page de galerie, carte Réel du fil, lecteur de Réels, slide de story
- Application aux boutons du kit de chrome plein écran (teinte adaptive vs onMedia)

Rendu : Les glyphes du chrome (fermer, menu, rail) passent du blanc au sombre selon l’image sous eux, sans clignotement entre deux pages.

Transposition Android : UIImage luminance → Bitmap.getPixel sur échantillon réduit / ThumbHash décodé ; NSCache → LruCache.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MediaChromeRegion.swift`
- `apps/ios/Meeshy/Features/Main/Views/MediaChromeScheme.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ThumbHash.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/FrameLuminance.kt`

### Dans la galerie, une scène composée (post/story/réel) se joue avec son curseur de lecture

`mav-gallery-scene-pages` · Android : **absente** · P2 · effort M

GallerySceneStage cadre une PAGE SCÈNE comme projection de SceneShape.layout (jamais du solveur de pièces jointes, décision 2026-09-17) : une scène composée remplit réellement le plein écran (le cadrage d’une pièce jointe laissait deux bandes de ~80 pt), avec région, cadre et échelle de référence. GallerySceneTimeline : une scène a un curseur seulement si elle BOUGE (vidéo, son, animation, transition, son de fond) ; durée de la pièce synthétique en millisecondes, calculée seulement pour les scènes mobiles. GallerySceneClock et GallerySceneScrubBar pilotent le scrubber de lecture (libellé « Avancer ou reculer ») qui rapporte le temps écoulé et valide une position.

Écarts :
- Page de galerie pour une scène composée (canvas v3) avec cadre dérivé du layout de la scène et échelle de référence
- Règle « une scène a un curseur si elle bouge » et durée de la pièce synthétique en ms
- Horloge de scène (activate/report/commit) et barre de scrub (libellé a11y « Avancer ou reculer ») branchées sur le lecteur de scène
- Dépend du lecteur de scène/canvas v3 existant côté stories ; à relier à la galerie de conversation

Rendu : Scène plein cadre sans bandes, curseur fin sous la scène réservant le couloir de transport du lot.

Transposition Android : Compose Canvas du lecteur de scène existant ; Slider pour le scrub.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/GallerySceneScrubber.swift`
- `apps/ios/Meeshy/Features/Main/Views/GallerySceneStage.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`

### L’onglet « Transcription » du détail d’un message liste le texte, la confiance et les audios traduits

`mav-transcription-detail-tab` · Android : **absente** · P2 · effort M

MessageTranscriptionDetailView est l’onglet Transcription de la feuille de détail d’un message audio/vidéo : transcription Whisper (texte, langue annoncée « Transcription en fr », confiance « confiance 92 % », « n locuteurs détectés »), bouton « Transcrire » avec état en cours (« Transcription en cours »), état vide « Aucune transcription », et section « Traductions audio » listant chaque audio TTS avec pastille « Clone » quand la voix est clonée. Actions réseau avec haptique légère puis succès/erreur. Accessibilité : durée parlée localisée (« 12 secondes ») au lieu de « 0:12 », voix clonée annoncée.

Écarts :
- Onglet Transcription dans la feuille de détail (MessageDetailExplorer ne propose que l’explorateur de langues du texte)
- Rendre texte + langue + confiance (%) + nombre de locuteurs, bouton Transcrire avec états idle/en cours/échec et haptique
- Liste « Traductions audio » avec langue, durée, badge « Clone » et lecture au tap
- Libellés TalkBack : durée parlée en toutes lettres, « Transcription en <langue> », « confiance n % », « voix clonée »

Rendu : Carte de texte sur surfaceFill, métadonnées en caption muette, badge Clone en pastille indigo ; sections espacées MeeshySpacing.lg.

Transposition Android : Onglet de ModalBottomSheet / pager Material.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageDetailExplorer.kt`

### Un lien YouTube s’affiche en aperçu 16:9 et s’ouvre dans l’app ou le navigateur

`mav-video-embed-preview` · Android : **absente** · P2 · effort S

VideoEmbedContainer garde l’aperçu riche (VideoEmbedThumbnail : vignette 16:9, bouton play, badge fournisseur « YouTube ») et change seulement le geste : au tap, haptique légère puis ouverture de la vidéo par lien (YouTube bloque l’IFrame embarqué, erreurs 15x). VideoEmbedDestination choisit l’URL : le lien de suivi /l/token (capture + redirection) quand il existe, sinon la watchURL canonique.

Écarts :
- Composable d’aperçu (vignette 16:9, bouton play central, badge fournisseur) pour les vidéos embarquées détectées dans un message ou un post
- Choix de destination : trackedURL (/l/token) prioritaire sinon watch URL ; ouverture via Intent ACTION_VIEW (app YouTube ou navigateur)
- Haptique légère au tap et libellé TalkBack

Rendu : Vignette 16:9 aux coins arrondis, bouton play blanc sur disque sombre, pastille « YouTube » en coin.

Transposition Android : openURL → Intent.ACTION_VIEW / CustomTabsIntent.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VideoEmbedContainer.swift`

</details>

### Un vocal enregistré est transcrit sur l’appareil dès l’arrêt, sans attendre le serveur

`mav-voice-note-local-transcription` · Android : **absente** · P2 · effort M

VoiceNoteLocalTranscriber lance, dès l’arrêt de l’enregistrement, une reconnaissance sur l’appareil (EdgeTranscriptionService, SFSpeechRecognizer avec requiresOnDeviceRecognition) : meilleur effort, autorisation demandée UNE fois au premier vocal (boîte système mémorisée), délai 8 s, résultats retenus plafonnés à 8. À l’envoi, l’attente est bornée à 700 ms (sendWaitBudget) ; au-delà le fichier part sans texte et Whisper reprend côté serveur. Les segments horodatés (texte, timestamp, durée, confiance, débit de parole) sont posés sur la bulle optimiste, rekeyés avec l’id serveur après l’upload. La langue de reconnaissance se choisit via AudioLanguagePickerView (feuille détentes medium/large : bascule « Afficher toutes les langues », par défaut seules les langues disponibles sur l’appareil, recherche, coche sur la langue choisie).

Écarts :
- Moteur de reconnaissance sur l’appareil derrière une interface testable (OnDeviceTranscription : texte, langue, confiance, segments, débit)
- Démarrer la transcription à l’arrêt de l’enregistrement, avec timeout 8 s, plafond de 8 résultats retenus, discard à l’annulation
- Attente bornée 700 ms à l’envoi puis envoi sans texte (le serveur Whisper reprend)
- Poser les transcriptions locales sur la bulle optimiste par pièce et par message, rekey sur l’id serveur après upload
- Sélecteur de langue de reconnaissance (langues installées par défaut, bascule « toutes », recherche, coche)
- Gérer l’autorisation RECORD_AUDIO déjà accordée et l’indisponibilité de la langue (repli : pas de transcription locale)

Rendu : Feuille de sélection de langues (ModalBottomSheet moyenne/haute), ligne = nom de langue + code, coche accent sur la sélection, champ de recherche en haut.

Transposition Android : SFSpeechRecognizer → SpeechRecognizer.createOnDeviceSpeechRecognizer (API 31+) ; transcription d’un fichier via RecognizerIntent.EXTRA_AUDIO_SOURCE (API 33+) ou à défaut pas de transcription locale ; langues installées via checkRecognitionSupport/getSupportedOnDeviceLanguages (API 33).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/VoiceNoteLocalTranscriber.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/EdgeTranscriptionService.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioLanguagePickerView.swift`

</details>

### Choisir la sortie audio ou vidéo (AirPlay, Bluetooth) depuis le lecteur

`media-airplay-route-picker` · Android : **absente** · P2 · effort S

AirPlayRoutePicker encapsule AVRoutePickerView : au tap, ouvre le sélecteur système de route (AirPlay, enceinte Bluetooth, etc.). Utilisé par les contrôles plein écran vidéo quand le jeu de contrôles contient airplay et par les plein écrans audio des applis consommatrices ; atome pur à paramètres opaques. Masqué sous un bouclier de capture.

Écarts :
- Bouton de sélection de sortie dans le lecteur vidéo plein écran et audio : MediaRouteButton (androidx.mediarouter) ou, sur API 34+, l'intent ACTION_MEDIA_OUTPUT_SWITCHER
- Libellé a11y « AirPlay » localisé en équivalent Android (« Sortie audio »)
- Masquer le bouton sous bouclier de capture/protection

Rendu : Icône de sortie audio dans la colonne de disques empilés (son, route, menu ⋯), taille de cible 44 dp.

Transposition Android : AVRoutePickerView devient MediaRouteButton / sélecteur de sortie système ; Cast optionnel via Google Cast si le produit le retient.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallAudioRoute.kt`

### Éditer un son : rogner, couper, fondu, vitesse, volume, transcrire, avec historique

`media-audio-editor` · Android : **absente** · P2 · effort L

MeeshyAudioEditorView est l'éditeur audio plein écran unique : waveform interactive, bascule Simple/Pro (Simple = rogner + transcrire), bande d'outils en FAB dont les panneaux n'apparaissent que quand nécessaire (Rogner, Couper, Fondu, Vitesse, Volume, Transcrire), historique de versions non destructif avec annuler/rétablir, et transcription tolérante aux crashs (états idle, running, done avec langue, failed, permissionDenied). L'AudioEditorController possède le document d'édition, le mode, l'outil actif et ses paramètres staged, copie la source dans un dossier de session hors fil principal, exporte via tâches annulables et rend un résultat dont les éditions sont cuites dans l'URL finale. La waveform est scrubbable et à deux poignées de sélection, avec accessibilité dédiée.

Écarts :
- Écran d'édition audio plein écran (aucun équivalent) avec chrome glass, en-tête, transport, dock d'outils et marges sûres réelles sous barre d'état et barre de navigation
- Contrôleur d'édition : document non destructif, mode Simple/Pro, outil actif, paramètres staged, versions avec annuler/rétablir, prepare() qui copie la source dans un dossier de session hors thread principal et lit la vraie durée, annulation des tâches en vol
- Outils : Rogner (poignées début/fin), Couper (split), Fondu (entrée/sortie), Vitesse (aperçu relayé au lecteur), Volume, Transcrire (hors produit de version)
- Export cuit en un nouveau fichier m4a avec trimStart=0 et trimEnd=durée finale (compatibilité des sites d'appel), transcriptions renvoyées
- Transcription intégrée : états idle / running / done(texte, langue) / failed(raison) / permissionDenied, tolérante au crash
- Waveform interactive : scrub partout, deux poignées d'arête de sélection, accessibilité (valeurs vocalisées, ajustement par pas)
- Libellés : Lire, Pause, Rogner, Couper, Fondu, Vitesse, Volume, Transcrire
- Brancher l'éditeur depuis l'enregistreur, la pièce du composer (bouton éditer) et les compositeurs de story/post

Rendu : Surface immersive thème-aware : waveform grande au centre, mode Simple/Pro en capsule segmentée, outils en FAB flottants, panneau contextuel qui glisse du bas pour l'outil actif uniquement ; versions listées sous forme de pas ; états de transcription en bandeau discret.

Transposition Android : AVAssetExportSession/AVMutableComposition deviennent Media3 Transformer (EditedMediaItem, effets audio : SonicAudioProcessor pour la vitesse, ChannelMixing/Gain pour le volume, rampes de fondu) ; reconnaissance vocale on-device via SpeechRecognizer.createOnDeviceSpeechRecognizer (API 31+) avec repli serveur ; session copiée dans cacheDir.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorController.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorToolPanel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorWaveform.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorWaveform+Accessibility.swift`

</details>

### Lire la transcription d'un son de contenu qui défile ligne à ligne sous le texte

`media-audio-transcript-cues` · Android : **absente** · P2 · effort M

MeeshyAudioTranscriptPlayer joue un son placé en contenu de publication (il EST le propos) juste sous la zone de texte, avec sa transcription qui défile au-dessus de la bande d'onde, ligne par ligne, au rythme de la voix. Aucune transcription ⇒ aucune zone ; la lecture et l'édition sont deux cibles (le bouton joue, le reste de la carte ouvre l'éditeur) ; la ligne active est élue par AudioTranscriptCue.activeIndex depuis la tête de lecture (une seule horloge) ; fond déclaré par l'hôte (sombre par construction sur le plateau du composer) ; environ trois lignes de corps. MessageCardTranscript fournit à une carte « Imagine » les phrases minutées de la piste servie (traduite si possible), avec minutage proportionnel quand il n'y en a aucun.

Écarts :
- Composant lecteur de son de contenu : bouton de lecture (cible séparée), bande d'onde 512 buckets, zone de transcription à ~3 lignes qui défile vers la phrase active, tap sur la carte = ouvrir l'éditeur
- Modèle AudioTranscriptCue (id, texte, start, end) et regroupement des mots en phrases (AudioTranscriptCue.phrases), élection de la phrase active depuis la tête de lecture
- MessageCardTranscript : phrases à partir des segments (ou du texte entier découpé par mots), isUntimed, timed(over:) avec minutage proportionnel à la longueur des phrases sur la durée du son
- Aucune zone si aucune transcription (pas de cadre vide) ; teinte et fond dictés par l'hôte (BackgroundTone) pour rester lisible sur le plateau sombre du composer en thème clair
- Intégration aux compositeurs de post/story et à la génération de carte « Imagine »

Rendu : Phrase active en couleur pleine et gras, voisines atténuées, défilement vertical centré sur la phrase active, bande d'onde dessous partageant l'échelle d'affichage du rogneur.

Transposition Android : Composants purs en Kotlin ; LazyColumn avec scroll animé pour le défilement des phrases ; rendu de carte via Canvas/bitmap pour l'export.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioTranscriptPlayer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardTranscript.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`

### Rogner un son précisément : bande qui défile sous un curseur fixe, poignées larges

`media-audio-trimmer` · Android : **absente** · P2 · effort M

MeeshyAudioTrimmer rogne un son avec une bande qui DÉFILE sous un curseur central FIXE (le pincement change le temps visible, donc la précision) et deux poignées de 26 pt, ramenées au bord si elles sortent du champ (flèche de position), bouton de lecture + bande dans un HStack pour que rien ne déborde. AudioTrimGeometry porte toute l'arithmétique pure (x ↔ temps, offset borné, zoom 1 à 40, segment minimal 0,25 s, déplacement des bornes). AudioTrimPreviewPlayer lit un SEGMENT (s'arrête à la borne haute, reprend toujours au début du segment au relâchement d'une poignée, ne tient aucune session audio). AudioSegmentExporter matérialise le segment en m4a seulement si nécessaire (tolérance sous laquelle on sert l'URL d'origine, échec ⇒ ne jamais publier la piste entière).

Écarts :
- Composant de rognage audio (aucun) : bande défilante, curseur fixe au centre, pincement pour zoomer (1 à 40), glissement un doigt pour défiler, deux poignées de 26 dp attrapables, flèche indiquant une poignée hors champ
- Géométrie pure testable JVM : x(temps), temps(x), offset borné à [0, largeur contenu - largeur visible], zoomed(to:) qui garde l'instant centré, movedStart/movedEnd (segment minimum 0,25 s, une poignée ne traverse jamais l'autre), clampedRange
- Lecture d'aperçu du SEGMENT : arrêt à la borne haute tenu par l'horloge d'affichage, reprise toujours au début du segment après relâchement d'une poignée ou fin naturelle, aucune session audio tenue
- Export du segment en m4a seulement si une borne s'écarte réellement (tolérance), sinon servir l'URL d'origine ; échec d'une découpe nécessaire ⇒ renoncer plutôt que publier la piste entière
- Accessibilité : poignées « Début de la sélection » / « Fin de la sélection » avec valeur de durée vocalisée, bouton « Écouter la sélection » / « Arrêter »
- Layout structurellement non débordant : bouton de lecture à taille fixe, bande = le reste mesuré, tout clippé à la bande
- Réutiliser AudioTrackSurface (ClippingConfiguration) et StorySourceWindow pour la lecture bornée

Rendu : Poignées larges 26 dp avec flèche d'indication hors champ, zones écartées assombries, curseur central fin, bande clippée ; waveform à 512 buckets et même échelle d'affichage que le transcript player ; texte de durée parlé pour l'a11y.

Transposition Android : AVAudioPlayer + displayLink devient ExoPlayer avec ClippingConfiguration et position échantillonnée par Choreographer ; AVAssetExportSession devient Media3 Transformer (clipping) ou MediaMuxer ; MagnificationGesture devient detectTransformGestures.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioTrimmer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrimGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrimPreviewPlayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioSegmentExporter.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`

### Marquer aux couleurs de Meeshy une image, une vidéo ou un son composé lors de l'enregistrement

`media-branding-watermark` · Android : **absente** · P2 · effort M

Trois atomes appliquent la marque quand une œuvre composée (story enregistrée ou exportée, scène de post, scène de réel) quitte Meeshy : MeeshyImageWatermark pose le filigrane fixe (logo dashes + « meeshy » + « @pseudo », figé à l'instant de repos 3,75 s, coin bas-droite) en PNG/JPEG selon l'extension et refuse d'aplatir un GIF/APNG animé (enregistré nu) ; MeeshyVideoWatermarkBaker grave le filigrane ANIMÉ dans une vidéo existante en la ré-encodant et composant par frame la tuile du filigrane (cadence d'animation 15 Hz indépendante de la vidéo, tuile réutilisée, plafond de durée au-delà duquel la vidéo est livrée nue) ; MeeshyAudioSignature concatène la signature sonore Meeshy (carillon synthétisé identique au sample près) avant (défaut) ou après le contenu, avec silence de séparation. La décision « quelles familles reçoivent une marque » reste app-side (MediaSaveBranding) : jamais sur les originaux d'une conversation (directive 2026-09-12).

Écarts :
- Filigrane d'image : dessin du logo dashes + wordmark + pseudo au coin bas-droite sur Bitmap (Canvas), image à l'instant de repos de l'animation, encodage selon format source, pas de marque sur GIF/APNG animés
- Filigrane de vidéo animé : ré-encodage via Media3 Transformer avec un OverlayEffect/BitmapOverlay animé à 15 Hz, tuile réutilisée, plafond de durée avec repli sur vidéo nue
- Signature sonore : synthèse du carillon déterministe (mêmes échantillons que iOS), concaténation avant (défaut) ou après le contenu avec silence, via Transformer/MediaMuxer
- Politique app-side MediaSaveBranding (quelles familles sont marquées) : story enregistrée/exportée, scène de post, scène de réel ; jamais les originaux de conversation
- Aucun export de story n'embarque aujourd'hui de filigrane côté Android (aucun code de marque détecté)

Rendu : Filigrane discret : logo à trois dashes, « meeshy » et « @pseudo » en coin bas-droite, respiration du logo (cycle 3 s) en vidéo, opacité pleine après fondu d'entrée de 0,4 s.

Transposition Android : CoreImage/AVMutableVideoComposition + CALayer animé devient Media3 Transformer avec OverlayEffect (BitmapOverlay) ou OpenGL ; AVAudioEngine jingle devient AudioTrack/AudioTrack PCM synthétisé puis concat.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/Branding/MeeshyAudioSignature.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/Branding/MeeshyImageWatermark.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/Branding/MeeshyVideoWatermarkBaker.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Lire un fichier de code joint avec numéros de ligne et coloration syntaxique

`media-code-viewer` · Android : **absente** · P2 · effort M

CodeViewerView affiche la carte d'un fichier de code joint (nom ou langage, taille, aperçu des 10 premières lignes numérotées colorées, « N lignes de plus ») et CodeFullSheet l'ouvre en entier (en-tête nom + langage, chargement « Chargement du fichier... » / erreur « Impossible de charger le fichier », numéros de ligne, texte coloré sélectionnable/copiable avec haptique de succès, portillon de sortie et bouclier de capture). SyntaxHighlighter est un tokenizer par langage (Python, JavaScript/TypeScript, Swift, Go, Rust, Java/Kotlin/Scala, C/C++/Objective-C, Ruby, PHP, shell, SQL, CSS/HTML/XML, JSON, YAML) produisant des tokens (keyword, string, comment, number, type, function, preprocessor, operator, property, attribute, tag, punctuation) avec un SyntaxTheme clair/sombre.

Écarts :
- Détection du langage depuis l'extension/le MIME (un fichier de code Android est traité comme un simple fichier à ouvrir par une appli externe)
- Tokenizer de coloration pour les ~14 familles de langages avec les 13 types de tokens et un thème clair/sombre (AnnotatedString)
- Carte d'aperçu : 10 premières lignes avec numéros, texte coloré, « N lignes de plus », nom ou langage, taille
- Fiche plein écran : en-tête, chargement/erreur, numéros de ligne gutter, défilement horizontal, copie du contenu avec retour haptique, portillon de sortie/FLAG_SECURE
- Libellés : « Chargement... », « Chargement du fichier... », « Impossible de charger le fichier », « N lignes de plus »

Rendu : Fond de carte sombre type éditeur, numéros de ligne en gris, police monospace 12 à 13 sp, couleurs de token cohérentes entre clair et sombre.

Transposition Android : NSAttributedString devient AnnotatedString avec SpanStyle ; police monospace Compose ; selection via SelectionContainer.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/CodeViewerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SyntaxHighlighter.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`

### Annuler, rétablir et naviguer dans l'historique des retouches d'une image

`media-image-editor-history` · Android : **absente** · P2 · effort S

ImageEditHistory est un annuler/rétablir par instantanés (valeur de ~100 octets, source jamais copiée, undo/redo/jump en O(1)) : curseur + tableau, toute branche en avant est rejetée à l'enregistrement d'un nouvel état, un état identique à l'actuel n'est pas enregistré (un glissé qui finit où il a commencé reste hors historique), saut direct à un pas par identifiant (balayage de l'historique), historique de session jetable. ImageEditorHistoryOverlay est la surface de l'historique avec libellés lisibles des pas.

Écarts :
- Type pur ImageEditHistory (steps avec id + label, cursor, canUndo, canRedo, record qui ignore les états identiques et tronque la branche future, undo, redo, jump(to:id))
- Surface d'historique : liste/balayeur des pas avec libellés (« Recadrage », « Ajustements réinitialisés », etc.), FAB annuler/rétablir en bas à droite (animation 0,2 s selon hasEdits)
- Libellés : « Annuler la modification », « Rétablir », « Historique »
- Historique limité à la session de l'éditeur (jeté à la fermeture)

Rendu : FAB annuler/rétablir en bas à droite masqués pendant un contrôleur ouvert ; l'overlay liste des pas horizontaux/verticaux avec pas courant mis en évidence en accent.

Transposition Android : Type pur Kotlin (data class + liste immuable) ; overlay en BottomSheet ou panneau Compose.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditHistory.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorHistoryOverlay.swift`

</details>

### Rasteriser un sticker Lottie en image fixe ou en APNG pour l'envoyer ou le publier

`media-lottie-film-raster` · Android : **absente** · P2 · effort M

LottieFilm est le moteur Lottie partagé côté pixels : charge un fichier .lottie (lecture hors du fil principal avec cache de la bibliothèque), rend dans un contexte graphique (moteur « main thread » qui rend en asynchrone en rendant la main toutes les quelques images pour ne jamais figer un geste) pour le PNG joint à l'envoi d'un sticker, une vignette, les images d'un canevas de story ou une image animée à publier. AnimatedImageEncoder encode les images d'une boucle en PNG animé (APNG), seul conteneur animé AVEC canal alpha qu'ImageIO écrit et que les trois clients savent lire (publié en image/png) : c'est la forme sous laquelle un sticker Lottie part dans une story.

Écarts :
- Chargeur de films Lottie (LottieComposition.fromRawRes/Url) hors thread principal avec cache, durée d'une boucle exposée
- Rendu d'images d'un film dans un Canvas/Bitmap (LottieDrawable.draw) cédant la main toutes les quelques frames
- Envoi d'un sticker : joindre le PNG rasterisé du film au message ; vignettes ; images de canevas de story
- Encodeur APNG (aucun encodeur système Android) : implémenter l'écriture des chunks acTL/fcTL/fdAT avec alpha, publié en image/png, relu par les trois clients
- Réutiliser StickerCatalog/StoryStickerElement pour les stickers Lottie de story

Rendu : Sticker rasterisé sur fond transparent, taille de sortie dictée par l'appelant ; la boucle encodée en APNG garde son alpha et sa cadence.

Transposition Android : CGContext + CALayer.render devient LottieDrawable.draw(Canvas) sur Bitmap ; ImageIO APNG devient encodeur APNG écrit à la main (PNG chunks + java.util.zip Deflater).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Lottie/LottieFilm.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AnimatedImageEncoder.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Voir des fonds, bannières et contours d'avatar animés en Lottie sans coût de rendu inutile

`media-lottie-layers` · Android : **absente** · P2 · effort M

LottieLayerView pose une couche animée sur un design (fond de conversation, bannière de profil, contour d'avatar) : boucle, moteur Core Animation, jamais indispensable. LottieLayerPlayback est la loi pure de lecture : réduire les animations ⇒ première image fixe (le « Réduire les animations » du système et celui de Meeshy, qui ne peut que renforcer le premier), appli en arrière-plan ou couche hors écran ⇒ pause là où elle en est, reprise au retour, animates:false ⇒ première image, pas de place dans le budget ⇒ première image, loops:false ⇒ une lecture puis dernière image. LottieLiveBudget plafonne à 8 films vivants (miroir du budget web) : une couche qui entre demande une place, qui sort garde la sienne tant que personne n'en a besoin, sous pression la plus anciennement sortie est reprise. LottieLayerSource lit un film d'un fichier de pack adressé par contenu (téléchargé une fois, empreinte vérifiée, un seul décodage partagé par des demandes simultanées, cache mémoire par empreinte, fail-soft ⇒ la couche s'efface). Transparente aux touchers et muette pour VoiceOver.

Écarts :
- Ajouter la dépendance lottie-compose (aucune actuellement) et un composable LottieLayer(film, animates, contentMode fill/fit, loops)
- Loi de lecture pure (réduction de mouvement, ProcessLifecycleOwner/LifecycleEventObserver, visibilité à l'écran, budget, loops) testable JVM
- Budget des films vivants à 8 places avec éviction de la plus anciennement sortie et reprise à la libération ; singleton partagé par toutes les surfaces
- Source de couche : magasin adressé par contenu (sha16.json), vérification d'empreinte, lecture partagée dédupliquée, cache mémoire par empreinte, repli silencieux
- Transparence aux touchers (pointerInput désactivé) et exclusion de l'arbre d'accessibilité (clearAndSetSemantics)
- Câbler fonds de conversation, bannières de profil, contours d'avatar dans les listes (30 rangées au même contour partagent un seul modèle)

Rendu : Couche décorative : fond ou bannière en fill (le parent rogne), contour d'avatar en fit ; première image statique quand le mouvement est réduit ou hors budget ; jamais d'interception de geste.

Transposition Android : lottie-ios (Core Animation) devient lottie-android / lottie-compose (RenderMode hardware) ; scenePhase devient Lifecycle ; reduceMotion devient Settings.Global.ANIMATOR_DURATION_SCALE + réglage Meeshy.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Lottie/LottieLayerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Lottie/LottieLayerPlayback.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Lottie/LottieLayerSource.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Lottie/LottieLiveBudget.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`

### Rogner un média posé sur une scène en voyant ce qu'on retire

`media-trim-strip-scene` · Android : **absente** · P2 · effort S

MediaTrimStrip montre la source ENTIÈRE avec deux poignées qui désignent ce qu'on garde ; les zones écartées restent visibles, assombries (on rogne en regardant ce qu'on retire). Elle n'encode rien (la doctrine de publication des stories envoie la source d'origine et les objets qui la décrivent) : elle produit seulement une paire de bornes remises à chaque image du geste, sans bouton « Appliquer ». Le clamp, le plancher de durée et la conversion points vers secondes vivent dans MediaTrimRule, hors vue.

Écarts :
- Bande de rognage de scène : vignettes/waveform de toute la source, poignées de début/fin, zones hors fenêtre assombries, bornes publiées à chaque image du geste (immédiateté sans « Appliquer »)
- Règle pure MediaTrimRule : clamp des bornes, plancher de durée, conversion px vers secondes (testable JVM)
- Brancher sur StorySourceWindow (fenêtre de lecture déjà portée) pour audio ET vidéo d'une scène de story
- Libellés d'accessibilité des poignées et valeurs vocalisées

Rendu : Bande pleine largeur avec cadre de sélection coloré accent, parties exclues assombries mais lisibles, poignées larges à cible 44 dp.

Transposition Android : SwiftUI DragGesture devient pointerInput(detectDragGestures) ; vignettes via MediaMetadataRetriever (vidéo) ou waveform décodée (audio).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTrimStrip.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`

### Voir un lien vidéo intégré comme une vignette avec bouton lecture et fournisseur

`media-video-embed-facade` · Android : **absente** · P2 · effort S

VideoEmbedThumbnail est une vignette façade pour un embed vidéo (image + overlay play + badge du fournisseur), atome agnostique qui ne résout aucune URL produit. Libellé a11y « Lire la vidéo \(fournisseur) ».

Écarts :
- Composable de façade d'embed : image de vignette, overlay play, badge du fournisseur (YouTube et autres), libellé « Lire la vidéo {fournisseur} »
- Brancher dans les aperçus de lien (LinkPreviewCard) quand le lien est un embed vidéo, tap = ouvrir dans l'appli du fournisseur ou un lecteur intégré selon la décision produit

Rendu : Vignette arrondie, bouton play centré translucide, petit badge du fournisseur en coin.

Transposition Android : Coil AsyncImage + overlay Compose ; ouverture via Intent ACTION_VIEW ou Custom Tab.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEmbedThumbnail.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`

### Les vidéos muettes et les réels s'enchaînent sans surchauffe ni décodage inutile

`media-video-performance-governors` · Android : **absente** · P2 · effort M

Plusieurs règles pures économisent le décodeur et la batterie : MediaThermalPolicy mappe l'état thermique de l'appareil vers la cadence des ticks de lecture, la profondeur de décodage anticipé (≈ 1 s, plus petite à chaud), le plafond de débit (toujours borné, 1,5 Mb/s pour la vidéo regardée, moins en préchauffage) et la suspension du préchauffage du réel suivant à chaud critique ; PlayerPoolCapacity règle le nombre de lecteurs préparés du pool (3 en high/pro, 2 en mid, 1 en low) ; AudioTrackActivationLaw éteint les PISTES audio d'un lecteur muet (couper la sortie ne stoppe pas le décodage) en coupant la sortie avant la piste et en rallumant la piste sous la sortie muette avant d'ouvrir la sortie ; SharedAVPlayerManager+Preroll adopte un lecteur préparé s'il lit le fichier local et rend le lecteur sortant au pool prêt, tête conservée à la reprise ; PlaybackResumeLaw place la tête (lecteur déjà sur la reprise ⇒ play seul, sinon un seul seek tolérant avant play) et le pool évince le plus LOIN du réel affiché.

Écarts :
- Règles thermiques pures dérivées de PowerManager.getCurrentThermalStatus (API 29) : cadence des ticks, forward buffer (DefaultLoadControl), plafond de débit (TrackSelectionParameters.setMaxVideoBitrate), suspension du préchargement du réel suivant à chaud critique
- Taille du pool de lecteurs préparés par palier d'appareil (low 1, mid 2, high/pro 3) ; éviction par distance au réel affiché puis ancienneté
- Éteindre les pistes audio d'un lecteur muet (TrackSelectionParameters.setTrackTypeDisabled(C.TRACK_TYPE_AUDIO)) : sortie coupée AVANT la piste, piste rallumée sous sortie encore muette ; idempotent ; réconcilié à chaque élément prêt (successeur de boucle compris)
- Adoption d'un lecteur préparé seulement s'il lit le fichier local ; retour au pool d'un lecteur sortant prêt qui lit le fichier ; tête conservée si la position est reprenable
- Loi de position à la reprise : déjà sur/ au-delà de la reprise ⇒ play seul ; sinon un seek tolérant (une image-clé de jeu) avant play ; jamais de recul
- ReelsScreen crée aujourd'hui un lecteur par page sans pool ni préchauffage de voisins : introduire un pool N±1 et mesurer sur appareils de chaque palier (argumenté, non mesuré)

Rendu : Aucun rendu ; effet ressenti : balayage de réels instantané, pas de saccade ni de chauffe, retour arrière immédiat à la même position.

Transposition Android : ProcessInfo.thermalState devient PowerManager.OnThermalStatusChangedListener ; palier d'appareil via ActivityManager.isLowRamDevice / MemoryClass ; AVPlayerItemTrack.isEnabled devient TrackSelectionParameters ; pool de StoryMediaLoader devient pool d'ExoPlayer.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaThermalPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlayerPoolCapacity.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrackActivationLaw.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrackActivator.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+AudioTracks.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+Preroll.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackResumeLaw.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPrefetchPlanner.kt`

### Un lieu partagé s’ouvre sur une carte plein écran avec style de carte, ouverture dans Plans et itinéraire

`mav-location-fullscreen` · Android : **divergente** · P1 · effort M

LocationFullscreenView affiche la position partagée sur une carte plein écran (MapKit iOS 17+ avec repli iOS 16) : épingle et étiquette « Position partagée » (ou nom/adresse du lieu), sélecteur de style de carte, bouton « Ouvrir dans Plans » et bouton « Itinéraire ». Utilisée depuis la bulle de lieu, la citation et la ligne de lieu du hub de médias.

Écarts :
- Toucher un lieu appelle uriHandler.openUri(geoUri) et sort vers une app tierce : aucune carte plein écran in-app
- Écran carte plein écran (Google Maps Compose, MapLibre ou osmdroid) avec épingle, titre « Position partagée », nom/adresse
- Sélecteur de style de carte (standard / satellite / hybride)
- Boutons « Ouvrir dans Plans » (intent geo:) et « Itinéraire » (google.navigation: ou geo avec destination)
- Chrome du kit plein écran (croix, voile) et libellés a11y

Rendu : Carte bord à bord, croix en disque de verre en haut à gauche, sélecteur de style en haut à droite, panneau inférieur avec nom du lieu et deux boutons (Plans, Itinéraire).

Transposition Android : MapKit → Maps SDK for Android / MapLibre ; Ouvrir dans Plans → Intent ACTION_VIEW geo: ; Itinéraire → google.navigation: ou intent générique.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationFullscreenView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/location/LiveLocationBadge.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Un média n’est téléchargé qu’une fois, partout, avec une progression commune

`mav-attachment-download-center` · Android : **partielle** · P0 · effort M

AttachmentDownloadCenter est le registre UNIQUE des téléchargements de médias : une clé de cache (URL résolue) = un téléchargement en cours et sa progression ; une seconde demande sur la même clé le REJOINT ; la fin, l’échec ou l’annulation valent pour toutes les surfaces (bulle, rangée plate, carrousel, galerie, widget audio, feed). Une clé déjà sur disque se termine SANS réseau. Événements progress/finished(totalBytes)/failed/cancelled diffusés par clé ; start(origin) distingue manual (retour haptique léger au départ, succès/erreur) d’automatic (muet : politique réseau, feed, galerie, préchargement) ; prefetch silencieux d’un média lointain avec profil réseau discrétionnaire et escalade du profil si une lecture rejoint ; cancelPrefetch ne touche jamais un téléchargement lancé par un tap ; flux en streaming vers un fichier par le funnel du cache typé (audio/image/video). DownloadBadgeView est le badge image à trois états (idle ↓ → téléchargement avec anneau % et « x/y » → en cache), jamais pour un média optimiste local, jamais si le média est déjà sur l’appareil (règle synchrone isOnDevice), et les vidéos n’ont pas de badge (leur bouton central suffit). MediaDownloadPreferencesStore persiste les politiques par type.

Écarts :
- Registre unique par clé de cache avec jointure des demandes, annulation globale et diffusion d’événements : aujourd’hui FileAttachmentDownloader ne sert que les fichiers/documents via DownloadManager et chaque surface aurait son état
- Téléchargement en flux vers un cache disque typé (audio/image/vidéo) avec progression octets, réutilisable hors réseau si présent
- Origine manual vs automatic : haptique uniquement pour manual
- Préchargement silencieux et annulable avec profil réseau (discrétionnaire / hors réseau facturé selon le réglage vidéo)
- Badge image 3 états (idle ↓, anneau + % + x/y, en cache) avec masquage pour média local/optimiste et règle synchrone isOnDevice
- Persistance des politiques (store présent) à relier au centre ; libellés a11y « Télécharger » / « Annuler le téléchargement »

Rendu : Badge rond 28–32 dp en verre sombre en coin de tuile image : flèche ↓, puis anneau de progression avec pourcentage en police 9–10 sp et « x/y » sous la tuile, puis disparition ; croix pour annuler.

Transposition Android : DiskCacheStore → cache OkHttp/Coil + dossier cache ; Task/Combine → coroutines + SharedFlow ; session discrétionnaire → WorkManager/DownloadManager avec contraintes réseau.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AttachmentDownloadCenter.swift`
- `apps/ios/Meeshy/Features/Main/Views/DownloadBadgeView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloadOverlay.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaBlobStore.kt`

### Envoyer des pièces jointes monte les fichiers en parallèle, survit au hors ligne et garde la bulle optimiste

`mav-attachment-send-pipeline` · Android : **partielle** · P0 · effort M

AttachmentSendBatch (intent d’envoi : groupes média, groupe texte, lieu, relation de réponse, protection éphémère/vue unique, langue, fichiers, miniatures, nettoyage) est exécuté par AttachmentSendRunner : pour chaque groupe, hors ligne → écriture durable dans l’outbox (AttachmentGroupOutbox, pas de TUS) ; en ligne → upload via TusMediaGroupUploader (MediaGroupUploader : parallèle borné par acteur, ordre du composeur conservé, un groupe audio part toujours en audio/mp4, amorçage des caches séquentiel, fichier déjà copié dans le cache typé sans relecture) puis envoi du message réutilisant le tempId de la bulle optimiste. Pour un groupe audio, attend au plus 700 ms les transcriptions locales, les pose sur la bulle et les rekeye sur les ids serveur. Un échec en ligne rejoint l’outbox (retries avec backoff comme le texte) ; le refus d’une pièce d’INVITÉ est définitif et la bulle dit pourquoi ; sinon bulle marquée échec avec raison. Le texte part en dernier sur la bulle posée au tap, un lieu part seul sans texte. Haptique succès/erreur et toast « Échec de l’envoi de la pièce jointe » ; les vocaux gardent leur fichier 10 s (la ligne optimiste porte l’URL file://). Sans jeton, l’envoi est abandonné et la place restaurée.

Écarts :
- La chaîne durable upload → graft de l’id réel → envoi existe (un fichier par message, upload multipart POST /attachments/upload) mais sans groupes : un lot de plusieurs pièces doit partir comme un groupe (images/vidéos ensemble, audio à part) avec ordre conservé
- Upload TUS reprenable pour les pièces de chat (TusUploadRepository sert seulement posts/stories) avec parallélisme borné
- Bulle optimiste immédiate avec miniature/URL locale (file://), texte envoyé en dernier, tempId réutilisé ; état échec avec raison (OutgoingAttachmentRules.uploadFailureReason)
- Refus définitif d’une pièce d’invité (GuestAttachmentRefusal) avec message expliquant les types autorisés ; protection (éphémère/vue unique/floutée) portée par le lot
- Transcriptions locales attendues 700 ms puis posées/rekeyées ; vocaux conservés 10 s après envoi pour la lecture locale
- Retour utilisateur : haptique succès/erreur, toast d’échec, progression globale (voir barre de progression d’upload)
- Fusion des deux chemins (REST primaire / socket de repli) de l’audio pipeline et gestion hors ligne explicite (enqueueOffline) sans TUS

Rendu : La bulle optimiste montre l’aperçu local, un voile de progression puis la coche d’envoi ; en échec, icône d’erreur rouge avec la raison et action Réessayer.

Transposition Android : URLSession background + GRDB outbox → WorkManager (OutboxFlushWorker) + Room outbox ; TusUploadManager → TusUploadRepository.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AttachmentSendBatch.swift`
- `apps/ios/Meeshy/Features/Main/Views/AttachmentSendHosting.swift`
- `apps/ios/Meeshy/Features/Main/Views/AttachmentSendRunner.swift`
- `apps/ios/Meeshy/Features/Main/Views/AttachmentGroupOutbox.swift`
- `apps/ios/Meeshy/Features/Main/Views/MediaGroupUploader.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadSender.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaBlobStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageMediaWriteBack.kt`

### Un vocal se lit directement dans sa bulle (onde, vitesse, progression, téléchargement)

`mav-audio-bubble-player` · Android : **partielle** · P0 · effort M

AudioBubbleRouter enveloppe AudioPlayerView. Tant que le coordinateur audio partagé ne joue pas cette pièce, la bulle pilote un moteur local ; dès que activeContext.attachmentId correspond, elle reçoit le moteur du coordinateur (même tête de lecture que le mini-lecteur, lecture qui survit au défilement). Le tap sur play est intercepté (onPlayRequest) pour construire la file via playAudio. La bulle gère trois habillages (card, flatMinimal, flatFocused), la disponibilité (prêt / à télécharger / téléchargement avec anneau et libellé « 410 KB / 850 KB »), la transcription résolue par le Prisme (auto-révélée pour soi ou si autoTranscribeIncoming), les audios traduits, la langue externe liée, le plein écran, la retranscription et la hauteur de transcription réservée pour éviter le saut de bulle à l’arrivée du texte. Isolation de rendu : un publisher dérivé évite O(N × 20 Hz) réévaluations des bulles inactives.

Écarts :
- Aucune lecture in-app : onAudioClick appelle uriHandler.openUri(audio.url) et ouvre l’audio dans une app externe ; il faut un lecteur ExoPlayer (Media3) dans la bulle avec play/pause, seek par tap/drag sur l’onde, état lecture/pause/chargement/erreur
- Rangée AudioBubble réduite à une icône play/Download + durée m:ss + 3 lignes de transcription : manquent l’onde (barres), la progression colorée, la pastille de vitesse (1×→2×), le pourcentage, les drapeaux de langue, le bouton retranscrire et le CTA Transcrire
- Rendre les trois habillages AudioPlayerChrome (Card, FlatMinimal, FlatFocused) : le plan pur AudioPlayerChromePlan existe mais aucun composable ne le peint
- Routage vers le moteur partagé : bulle active = moteur du coordinateur (même progression que le mini-lecteur), bulle inactive = moteur local ; ne recomposer que quand activeContext.attachmentId bascule
- Disponibilité et téléchargement : états prêt / à télécharger / téléchargement avec anneau et « x KB / y KB », déclenchés par la politique de téléchargement auto
- Transcription auto-révélée si message envoyé par soi ou préférence autoTranscribeIncoming, et réserve de hauteur du bloc de transcription tant que le serveur n’a pas répondu
- Accessibilité : libellé « Vocal », valeur de progression annoncée, action de plein écran, ajustement de la vitesse au balayage vertical TalkBack

Rendu : Bulle compacte : cercle play (accentColor de la conversation) à gauche, onde à barres au centre (barres lues teintées accent, non lues atténuées), durée en police monospace à droite ; chips (vitesse, %, drapeaux) sous l’onde en habillage Card/FlatFocused ; transcription en italique sous le lecteur. Anneau de progression autour du bouton pendant le téléchargement. Retour haptique léger au play/pause. Hauteur de bulle stable (réserve de transcription).

Transposition Android : AVPlayer/AVAudioPlayer → Media3 ExoPlayer ; moteur du coordinateur partagé → un ExoPlayer singleton hébergé par un MediaSessionService ; Combine → StateFlow/derivedStateOf.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AudioPlayerChromePlan.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Les photos sont redimensionnées et compressées avant l’envoi selon la surface

`mav-image-compression` · Android : **partielle** · P0 · effort S

MediaCompressor.compressImage réduit par échantillonnage matériel ImageIO (format préservé depuis les octets bruts, JPEG forcé depuis une UIImage dont le format est perdu) avec un plafond par MediaContext : message 1 200 px, story 1 080, post de feed 1 600, avatar 512, plein écran 2 048. Les formats jpeg/png/gif/webp gardent leur extension et leur type MIME ; le résultat expose données, dimensions et type.

Écarts :
- Le planificateur pur (ImageUploadContext + ImageCompressionPlanner) existe mais personne n’applique la compression : les octets du sélecteur partent bruts dans ChatViewModel.sendFileAttachment
- Exécuteur Bitmap : décodage avec inSampleSize/ImageDecoder.setTargetSize, redimensionnement au plafond du contexte, ré-encodage JPEG qualité du plan, conservation du format (png/gif/webp) quand c’est plus pertinent, rotation EXIF appliquée
- Contextes message / story / feed / avatar / plein écran branchés sur chaque point d’envoi (chat, composer feed, story, profil)
- GIF animés et formats non réencodables passent tels quels

Rendu : Aucun élément visuel propre ; l’état « Compression en cours » est affiché par la tuile de préparation.

Transposition Android : ImageIO CGImageSource thumbnail → BitmapFactory.Options.inSampleSize + Bitmap.compress / ImageDecoder ; ExifInterface pour l’orientation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ImageCompression.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ImageUpload.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/AvatarBannerUploadViewModel.kt`

### Un média se télécharge tout seul quand le réseau et les préférences le permettent

`mav-media-availability-auto-download` · Android : **partielle** · P0 · effort S

AudioAvailabilityResolver et VideoAvailabilityResolver (vues génériques) résolvent la disponibilité d’une pièce : fichier file:// existant, présent dans le cache typé (CacheCoordinator.audio/video), sinon propriétaire d’un AttachmentDownloader et application de MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition réseau) pour démarrer automatiquement. AudioAvailability/VideoAvailability sont les états purs (ready / needsDownload / downloading(progress, downloadedBytes, totalBytes)) avec resolve(…) « au repos » ; atFirstRender évite le flash « télécharger » au premier rendu. Clé d’auto-démarrage pour ne lancer qu’une fois par pièce.

Écarts :
- Les briques pures (MediaAutoDownloadDecider, politique par type, condition réseau) existent mais aucun résolveur ne les branche sur une vue audio/vidéo/image
- États AudioAvailability/VideoAvailability avec progress/downloadedBytes/totalBytes pour le libellé « 410 KB / 850 KB »
- Vérification du cache disque typé (audio, image, vidéo) et des fichiers locaux avant d’afficher « télécharger » (atFirstRender synchrone)
- Auto-démarrage une seule fois par pièce selon (kind, condition réseau, préférence), sans double lancement si un téléchargement est déjà en vol
- Cas des audios traduits (kind audioTranslation) et du mode audio multi-langue

Rendu : Bouton de tête d’AudioPlayerView : play (prêt), icône télécharger + taille (à télécharger), anneau de progression + « x / y » (téléchargement).

Transposition Android : CacheCoordinator → cache disque OkHttp/Coil ou MediaBlobStore ; NetworkConditionMonitor déjà présent côté sdk-core.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioAvailabilityResolver.swift`
- `apps/ios/Meeshy/Features/Main/Views/VideoAvailabilityResolver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaDownload.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`

### Enregistrer un vocal propre, interrompu proprement par un appel ou un refus de micro

`mav-voice-recorder-engine` · Android : **partielle** · P0 · effort M

AudioRecorderManager (app) et DefaultSDKAudioRecorder (SDK) implémentent AudioRecordingProviding avec AudioRecordingSettings : standard et story 44,1 kHz mono 64 kbit/s AAC (m4a, audio/mp4), voiceSample 96 kbit/s avec plancher de 10 s, preset Opus mono 48 kHz 24 kbit/s (CAF, dormant, versionné). Plancher de 0,5 s pour écarter l’appui accidentel et aucun plafond de durée (directive produit 2026-07-26). Métering en continu (display link), permission micro tranchée AVANT toute activation de session (accordée = synchrone, refusée = message dédié), libération hors main des ressources (deinit) pour qu’un enregistreur lâché mid-recording ne garde ni micro ni session. RecorderCallGuard.stopAllForCall() arrête tout enregistrement en cours au début d’un appel en gardant ce qui a été enregistré, sans rendre la session que l’appel possède. result() rend URL, durée et niveaux.

Écarts :
- Le MediaRecorder est configuré inline dans ChatComposer (MPEG_4 + AAC) sans fréquence ni débit : fixer 44 100 Hz, mono, 64 kbit/s (96 kbit/s et plancher 10 s pour les échantillons de profil vocal) via un objet AudioRecordingSettings partagé
- Extraire un enregistreur injectable (AudioRecordingProviding) unique pour chat, feed, story et profil vocal au lieu de dupliquer le MediaRecorder dans ChatComposer et FeedComposerSheet
- Arrêt de l’enregistrement au début d’un appel (RecorderCallGuard) en conservant la prise ; reprise du focus audio après
- Refus de permission micro : message dédié « accès au micro refusé » avec ouverture des Réglages (aujourd’hui le lanceur ne fait rien si refusé)
- Libération sûre (stop dans try/catch, release, suppression du fichier d’une prise trop courte < 0,5 s) et pas de plafond de durée
- Renvoyer URL + durée + niveaux de l’onde (result()) pour alimenter l’onde persistée du message et la transcription locale
- Codec Opus (OGG/WebM) en option dormante, activable quand le chemin de lecture inter-clients est validé

Rendu : Pilule d’enregistrement existante : annuler · onde vivante · point clignotant + chrono · stop/envoyer (désactivés sous 0,5 s) ; haptique léger au démarrage et à l’envoi.

Transposition Android : AVAudioRecorder → MediaRecorder (API 31+ constructeur contexte) ou AudioRecord+MediaCodec si onde fine nécessaire ; display link → coroutine 100 ms sur maxAmplitude ; CallInterruptibleRecorder → listener de focus audio/téléphonie.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/AudioRecorderManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioRecordingProviding.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Audio/RecorderCallGuard.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/AudioLevelMetering.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/MicAmplitudeDecibels.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingFile.kt`

### Écouter un vocal directement dans sa bulle, avec waveform, vitesse et progression

`media-audio-bubble-player` · Android : **partielle** · P0 · effort M

AudioPlayerView est le widget unique du vocal, rendu en bulle (rayon 14), pièce du composer (12), post du fil (18), overlay de story (0) ou plein écran. Il montre un bouton rond de lecture (40 pt, 34 en compact) en dégradé accent, une waveform de capsules scrubbable (72 barres, 48 en compact), les timecodes écoulé/durée, une colonne de chips à droite (vitesse cyclique, pourcentage consommé qui ouvre le plein écran audio), les états de disponibilité (prêt, à télécharger avec taille, téléchargement avec anneau de progression et octets) et trois postures de chrome (card, flatMinimal, flatFocused). En contexte composer il offre éditer et supprimer. Le moteur peut être possédé par la vue ou injecté par un coordinateur parent (file de lecture, mini-lecteur). Un geste sur la waveform signale le scrub à l'hôte pour désengager le balayage répondre/transférer.

Écarts :
- Remplacer la ligne compacte AudioBubble (icône, durée, transcription 3 lignes) : aujourd'hui onAudioClick appelle uriHandler.openUri(audio.url), donc le vocal s'ouvre dans une autre appli au lieu de jouer sur place
- Lecture/pause dans la bulle via le moteur partagé (media-audio-playback-engine) : bouton rond 40 dp (34 compact) en dégradé accent vers accent 70 %, ombre 6 dp, icône pause/play (décalage de 1 dp du triangle), spinner pendant isLoading, haptique légère au tap
- États de disponibilité ready / needsDownload (flèche + taille formatée sous le bouton, police mono micro) / downloading (anneau trim de progression 50 % de la taille du bouton, label octets téléchargés / total) en réutilisant MediaAutoDownloadDecider et le téléchargeur de pièces
- Waveform de 72 barres (48 en compact), capsules de hauteur 2 à 22 dp dans une bande de 24 dp, courbe perceptive pow(0.65), repli procédural tant que les échantillons ne sont pas décodés ; barres jouées en accent plein si lecture live, accent 40 % au repos ; barres non jouées blanc 20 % (sombre) ou noir 12 % (clair)
- Scrub par glissement sur la waveform (pointerInput detectDragGestures à distance zéro : un simple tap cherche la position), prioritaire sur le scroll de la liste et le long-press de la bulle, haptique légère à la levée ; publier un signal « scrubbing en cours » pour désactiver SwipeToReply.kt tant que le doigt manipule la waveform
- Timecodes écoulé à gauche / durée estimée à droite (monospace 10 sp, 9 en compact) ; progression au repos = fraction consommée persistée, durée résolue depuis le moteur sinon l'attachement
- Colonne de chips à droite : chip vitesse (cycle 0,8 / 0,9 / 1,0 / 1,25 / 1,5 / 1,75 / 2,0 / 2,25, capsule accent 85 % si différent de 1,0) et chip pourcentage consommé (tap = ouvre le lecteur audio plein écran, libellé a11y « Ouvrir en plein écran, lecture N % »)
- Rendre les trois postures déjà planifiées par AudioPlayerChromePlan (Card avec fond et bordure hairline, FlatMinimal sans chrome, FlatFocused enrichi) et les contextes de rendu (messageBubble, composerAttachment, feedPost, storyOverlay, fullscreen)
- Actions de contexte composerAttachment : bouton éditer (waveform.and.magnifyingglass, 26 dp) et supprimer (xmark.circle.fill en couleur d'erreur)
- Callbacks onPlayingChange, onFullscreen, onRequestTranscription, onRetranscribe, onDelete, onEdit et routage du tap de lecture vers le coordinateur parent tant que le moteur n'est pas chargé avec CETTE pièce (file de lecture), sinon bascule directe
- Accessibilité : libellé « Lire l'audio » sur le bouton, valeur de progression annoncée, cibles 44 dp, texte mono non réduit par la taille de police

Rendu : Fond de carte : blanc 5 % (sombre) / noir 3 % (clair) avec trait hairline 8 % / 5 %, coin selon le contexte (14 bulle, 12 composer, 18 feed). Accent = accentColor de la conversation (jamais codé en dur). Le bouton rond porte un dégradé accent et une ombre douce ; barres en capsules arrondies ; chips en capsules mono 9 à 10 sp, gras ; transitions spring 0,3 / 0,8 à l'ouverture de la transcription ; chiffres du pourcentage en transition numérique 150 ms.

Transposition Android : AVAudioPlayer + SwiftUI Canvas devient Media3 ExoPlayer (via MediaController du moteur partagé) + Compose Canvas ; DragGesture(minimumDistance:0) devient pointerInput(detectDragGestures + tap) ; HapticFeedback.light devient LocalHapticFeedback (TextHandleMove) ; la PreferenceKey de scrub devient un CompositionLocal ou un état hissé vers la bulle.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView+Labels.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerChips.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerChrome.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaScrubbingPreferenceKey.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AudioPlayerChromePlan.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Ouvrir une image en plein écran : zoom, déplacement, fermeture au glissement, légende, enregistrement

`media-image-viewer-fullscreen` · Android : **partielle** · P0 · effort M

ImageViewerView montre l'image dans la bulle (thumbHash au premier rendu, taille de fichier, actions éditer/supprimer en composer, ouverture au tap avec action d'accessibilité dédiée, haptique légère) puis ImageFullscreen : fond noir, entrée SANS chrome (tout toucher le pose), pincement 1 à 5x avec retour au ressort, double-tap 1x ↔ 2,5x, déplacement qui suit le doigt (à échelle ≤ 1,05 un glissement vertical de plus de 200 pt ferme, sinon retour au ressort), légende rendue avec mentions et hashtags (variantes sombres figées) dans un bandeau matériau translucide, barre supérieure avec fermer et enregistrer (états idle, saving, saved, failed avec glyphes et retour à idle après 2 s, haptique succès/erreur, coche « Déjà dans la photothèque »), barre d'état masquée, rapport d'image vue à la disparition (durée de visionnage), hook onSaveRequested pour déléguer au composant d'enregistrement de l'appli (filigrane), portillon de sortie (contenu protégé : rien ne sort) et bouclier de capture, chargement explicite qui outrepasse la politique réseau ambiante.

Écarts :
- Le tap simple ferme la visionneuse Android alors que sur iOS il bascule le chrome (entrée sans chrome, fermer et enregistrer apparaissent au toucher, animation 0,2 s) : aligner le comportement et masquer barre d'état + chrome par défaut
- Fermeture par glissement vertical progressif et annulable (iOS : image suit le doigt, fond qui s'éclaircit, fermeture si translation > 200 ou lancée), retour au ressort si relâché plus haut ; absent côté Android
- Plafond de zoom à 5x comme iOS (ImageViewerTransform.MAX_SCALE vaut 4) avec rebond au ressort entre 1x et 5x ; double-tap 2,5x déjà aligné
- Légende avec mentions/hashtags colorés (rendu MessageTextRenderer, variantes sombres) sur matériau translucide en bas ; Android affiche un texte brut sur 4 lignes maxi
- Bouton enregistrer avec états saving / saved / failed (glyphe, coche « Déjà dans la photothèque », retour à idle après 2 s, haptique succès/erreur) ; Android ne retourne qu'un Result sans état visuel
- Hook onSaveRequested pour déléguer l'enregistrement à l'appli (filigrane sur œuvres composées, jamais sur les originaux de conversation)
- Rapport d'image vue avec durée à la disparition (POST /attachments/:id/status) ; portillon de sortie pour contenu protégé / view-once et bouclier de capture (FLAG_SECURE)
- Cellule d'image dans la bulle : thumbHash immédiat, taille de fichier formatée, boutons éditer/supprimer en composer, action d'accessibilité « ouvrir »
- Chargement explicite plein format qui outrepasse la politique réseau (jamais de spinner infini sous Low Data)

Rendu : Fond noir plein, image centrée en fit, légende en bandeau translucide centré 14 sp blanc avec marges lg/md, barre supérieure verre (fermer à gauche, enregistrer à droite, cibles 44 dp), transitions d'opacité 0,2 s ; compteur de pages pour une galerie.

Transposition Android : MagnificationGesture + DragGesture deviennent detectTransformGestures + draggable verticalement dans le Dialog existant ; statusBarHidden devient WindowInsetsControllerCompat.hide(systemBars) ; matériau ultraThin devient surface translucide Compose.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerTransform.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerSource.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerPrefetch.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`

### Un message avec plusieurs vocaux les empile, chacun avec son lecteur complet

`mav-audio-multi-track-stack` · Android : **partielle** · P1 · effort S

AudioStackView affiche, pour un message portant plus d’une piste audio, une liste verticale (pas de pager, pas d’indicateur i/N) où chaque rangée est un lecteur complet (onde, chips vitesse/progression, karaoké). Un seul BubbleFooter partagé ferme la pile : ses drapeaux sont l’union des langues de toutes les pistes (langue de transcription d’origine puis cibles d’audios traduits, dédoublonnées). Chaque rangée est un conteneur d’accessibilité « Vocal 2 sur 3 ». Le tap play d’une rangée passe par la file du coordinateur qui enchaîne les pistes de haut en bas ; le plein écran s’ouvre sur la piste touchée. Affiche la notice de consentement de clonage vocal quand elle s’applique.

Écarts :
- MessageBubble boucle bien sur content.audios mais chaque rangée est la mini-ligne icône+durée, pas un lecteur complet
- Pied de bulle partagé unique avec drapeaux = union des langues de toutes les pistes (transcription d’origine + cibles audio traduites), drapeau actif = activeAudioLanguage
- Libellé TalkBack « Vocal i sur n » par rangée, en conteneur qui garde les contrôles du lecteur atteignables
- Ouverture du plein écran sur la piste touchée (pas la première) et file du coordinateur enchaînant les pistes
- Notice de consentement du clonage vocal (audio.consent.notice) sous la pile quand voiceConsentMissing et message d’un tiers

Rendu : Rangées espacées de MeeshySpacing.xsPlus, footer overlay unique en bas, aucun séparateur ; même habillage Card (ou plat sous la rangée Focal).

Transposition Android : Column de lecteurs réutilisant le composable de bulle vocal ; semantics { collectionItemInfo } pour la position.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioStackView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### La transcription d’un vocal s’affiche, se synchronise et se demande à la demande

`mav-audio-transcription-display` · Android : **partielle** · P1 · effort M

Modèles MessageTranscription (texte, langue, confiance, durée, locuteurs, segments horodatés MessageTranscriptionSegment) et MessageTranslatedAudio ; AudioTranscriptCue (atome pur start/end optionnels, activeIndex(in:currentTime), phrases(from:) qui regroupe les segments en phrases) partagé avec la carte « Imagine » d’un vocal. APIAttachmentTranscription décode la forme REST. La transcription est demandée via AttachmentService.requestTranscription(attachmentId, force) et revient par audio:transcription-ready ; ServerTranscriptionWait fixe le plafond de silence à 90 s (« Transcription… » reste affiché tant que la tâche tourne, passé 90 s sans rien « Transcrire » revient et la demande peut se refaire, miroir de ON_DEMAND_STALL_MS du web).

Écarts :
- Pas de requête REST de transcription à la demande (POST /attachments/:id/transcribe, option force) ni d’état « en cours » avec plafond de silence 90 s puis retour à « Transcrire »
- Écoute de audio:transcription-failed absente (seul transcription-ready est branché) : afficher l’échec et permettre de réessayer
- Atome AudioTranscriptCue (start/end optionnels, activeIndex, regroupement phrases(from:)) à porter pour le karaoké et la carte vocale
- Segments avec locuteurs (diarisation) et confiance : le modèle Android n’en expose que le texte/langue/confiance globale
- UI : le bloc de transcription de la bulle est limité à 3 lignes statiques ; il faut karaoké synchronisé, dépliage 255 caractères en habillage Card, coupe à ~30 mots en habillage plat, tap-to-seek

Rendu : Texte de transcription en italique 12–13 sp sous l’onde, segment courant surligné accent, spinner discret + libellé « Transcription… » pendant l’attente ; « Aucune transcription » en gris pour l’état vide.

Transposition Android : Combine PassthroughSubject → SharedFlow (déjà fait pour transcription-ready).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ServerTranscriptionWait.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/AudioTranscriptCue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIAttachmentTranscription.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/TranscriptionModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Transcription.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentTranscriptionMerge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### On peut demander la traduction audio (voix clonée) d’un vocal et la voir arriver en direct

`mav-audio-translation-on-demand` · Android : **partielle** · P1 · effort M

AttachmentService.translate appelle POST /attachments/:id/translate (réponse synchrone dans le corps HTTP) pour des langues cibles ; sur un 403 portant un payload de consentement il lève AttachmentConsentError au lieu du forbidden générique (consentement au clonage vocal). Les audios traduits (MessageTranslatedAudio : langue cible, URL, durée, voix clonée ou non) arrivent par audio:translation-ready, audio:translations-completed, audio:translations-progressive et audio:translation-failed. AttachmentService expose aussi requestTranscription, getStatusDetails (qui a vu/écouté/téléchargé) et delete (DELETE /attachments/:id, seul success compte). Le Prisme choisit la piste jouée par la langue du texte servi.

Écarts :
- Endpoint REST POST /attachments/:id/translate (targetLanguages) absent de MessageApi/Retrofit ; erreur typée de consentement sur 403 avec payload
- Écoutes socket manquantes : audio:translations-completed, audio:translations-progressive, audio:translation-failed (seul audio:translation-ready est branché)
- Endpoints DELETE /attachments/:id et statut de consommation (qui a vu/écouté/téléchargé) absents
- UI de demande (feuille « Traduire l’audio » depuis le plein écran, l’explorateur de langues et le menu), état en cours/échec par langue, mise à jour live de la piste jouée
- Résolution Prisme de la piste audio déjà présente (resolveTranslatedAudio) : à brancher sur la sélection manuelle de langue

Rendu : Chips de langue avec spinner pendant la traduction, drapeau + code ; badge « Clone » quand la voix est clonée ; message de consentement en notice discrète.

Transposition Android : Retrofit + kotlinx.serialization pour l’appel ; flux SharedFlow pour les événements socket.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Réglages : téléchargement auto par type de média, enregistrement dans la galerie et à la prise de vue

`mav-media-download-settings` · Android : **partielle** · P1 · effort S

MediaDownloadSettingsView (Téléchargement auto) : quatre sections de politique par type (Images, Audio, Traductions audio, Vidéo), chacune à choix unique parmi Toujours (infini), Wi-Fi et bon réseau cellulaire (antenne), Wi-Fi seulement (wifi), Jamais (croix), avec haptique légère et en-tête d’information « Téléchargement automatique : choisissez quand télécharger… ». Section « Galerie » : bascule « Enregistrer dans Photos » (actif par défaut) — les images et vidéos reçues rejoignent l’album Meeshy une seule fois, jamais un média éphémère, flouté ou à vue unique. Section « À la prise de vue » : « Enregistrer l’original » (défaut non) et « Enregistrer la version avec effets et cadre » (automatique en validant la retouche, sinon à la demande). Les préférences sont persistées par MediaDownloadPreferencesStore (UserDefaults, migration depuis l’ancien format 6 booléens).

Écarts :
- Les quatre sélecteurs de politique et le texte d’information existent ; ajouter l’icône par politique (infini, antenne, wifi, interdit) et l’haptique légère au choix
- Section « Galerie » : bascule « Enregistrer dans Photos » (défaut actif) qui déclenche l’enregistrement automatique des images/vidéos reçues (hors éphémère/flouté/vue unique) une seule fois
- Section « À la prise de vue » : « Enregistrer l’original » (défaut non) et « Enregistrer la version avec effets et cadre » (mode automatique/manuel)
- Persistance et synchronisation de ces trois nouveaux réglages ; migration du format de préférences si nécessaire

Rendu : Cartes de section teintées accent (fond translucide, bordure), en-têtes avec icône, lignes de bascule avec titre medium + sous-titre muet à interligne 2.

Transposition Android : UserDefaults → DataStore ; Toggle → Switch Material.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaDownloadScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaDownloadViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaDownloadPreferencesCodec.kt`

### Une photo, une vidéo, un vocal, un fichier, un lieu portent partout le même nom et le même résumé

`mav-media-kind-labels` · Android : **partielle** · P1 · effort S

MediaKindLabel est la SOURCE UNIQUE de l’étiquette humaine d’un média (remplace huit copies sur deux familles de clés) : deux registres — name(kind) « Photo / Vidéo / Audio / Fichier / Position » quand une icône double déjà le texte (tuile, puce, bouton de défilement), et summary(kind) avec émoji « 📷 Photo / 🎥 Vidéo / 🎙️ Message vocal / 📎 Fichier / 📍 Position » pour les aperçus ; voiceMessageTitle, voiceMessage (« Message vocal ») et voiceRecording(durée) (« Message vocal · 0:12 »), attachmentLabel(for:), placeLabel/placeTitle (nom du lieu ou « Position »). AttachmentKind (SDK) classe un MIME (insensible à la casse, RFC 2045) en image, video, audio, pdf, spreadsheet, document, presentation, archive, code, text, other pour l’icône, le menu d’overlay, les filtres de transcription et les aperçus push.

Écarts :
- Les libellés sont dispersés dans les strings des modules (conversations_preview_photo, bubble_reply_photo, chat_unread_photo…) sans source unique : créer un MediaKindLabel avec registres name/summary et voiceRecording(durée)
- Enum AttachmentKind fine (pdf, spreadsheet, document, presentation, archive, code, text) dérivée du MIME de façon insensible à la casse pour icônes et filtres (AttachmentMessageType ne distingue que image/video/audio/file)
- Libellés de lieu (nom du lieu sinon « Position ») et de vocal localisés dans les 4 langues
- Réutiliser ce SSOT dans aperçus de liste, citations, notifications et boutons de défilement

Rendu : Aperçu de liste : émoji + libellé (« 📷 Photo », « 🎙️ Message vocal ») ; puces compactes : libellé court sans émoji.

Transposition Android : String(localized:) → stringResource ; SF Symbols → icônes Material.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MediaKindLabel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/AttachmentKind.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MimeTypeResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentMessageType.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MessageSummaryKind.kt`, `apps/android/feature/conversations/src/main/res/values/strings.xml`

### Les accès caméra, micro et photos sont demandés au bon moment, avec un message qui dit quoi activer

`mav-media-permissions` · Android : **partielle** · P1 · effort S

MediaPermissionCoordinator est la porte unique de toute demande d’accès caméra/micro/photothèque (lecture/ajout) : demande préalable au lieu d’un prompt système en plein milieu, retour booléen, et message de refus propre à chaque accès (« permission.microphone.denied », camera, photoLibrary.read/add, location) qui dit quelle ligne activer dans les Réglages, avec ouverture des Réglages. DevicePermissions unifie les états (notDetermined, granted, limited — un accès choisi compte comme accord —, denied, restricted — jamais invitable) et dérive trois décisions en un seul lieu : utilisable, à demander, renvoyer vers les Réglages.

Écarts :
- Pas de coordinateur : ChatComposer lance RequestPermission(RECORD_AUDIO) et ne dit rien en cas de refus
- État unifié MediaPermissionState (notDetermined/granted/limited/denied/restricted) et décisions can-use / should-prompt / send-to-settings
- Messages de refus par accès (micro, caméra, photos lecture/ajout, lieu) avec action « Ouvrir les Réglages » (Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
- Accès photos : Photo Picker sans permission, READ_MEDIA_IMAGES/VIDEO (API 33+), READ_MEDIA_VISUAL_USER_SELECTED (API 34, équivalent de limited)
- Gérer shouldShowRequestPermissionRationale pour distinguer refus définitif de simple refus

Rendu : Snackbar ou dialogue explicite « Accès au micro refusé » avec bouton « Réglages ».

Transposition Android : AVAudioSession.recordPermission / AVCaptureDevice / PHPhotoLibrary → ActivityResultContracts.RequestPermission + Accompanist/propre abstraction ; limited → READ_MEDIA_VISUAL_USER_SELECTED.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MediaPermissionCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/DevicePermissions.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPermissions.kt`

### « Enregistrer » un média l’envoie dans l’album Meeshy (ou Fichiers/Partager), marqué seulement s’il est composé

`mav-media-save-flow` · Android : **partielle** · P1 · effort M

MediaSaveCoordinator est l’orchestrateur UNIQUE : requestSave/save → feuille de destinations (Photos quand applicable, Fichiers avec choix du dossier, Partager) puis pick ; image et vidéo vont DIRECTEMENT dans l’album Meeshy sans demander où (directive 2026-09-27), audio et documents gardent le choix. Portillon de sortie exitGate (ContentExitGate, fermé tant qu’il n’est pas posé : pas de feuille, ni Photos, ni Fichiers, ni partage pour un contenu protégé). Dédoublonnage : empreinte de la source avant marque, « déjà dans l’album » ne réécrit rien. MeeshyMediaSaveBranding appose la marque Meeshy (pseudo de l’AUTEUR) seulement sur une œuvre COMPOSÉE (origin = composed : scène de post, de réel, story), jamais sur un média transmis (image/vidéo/vocal/document d’un fil sort nu) ; un marquage impossible (GIF animé, vidéo couchée ou trop longue) retombe sur l’original sans jamais empêcher l’enregistrement et sans supprimer le fichier du cache. Rapport « downloaded » best-effort au serveur. MediaSaveFlowModifier présente la feuille/le picker d’export (UIDocumentPicker en mode copie) ou la share sheet, indique la préparation par une pastille passive non annulable, et surface l’issue par FeedbackToastManager (saved / alreadyInPhotoLibrary / failed) avec haptique succès/légère/erreur. SavableMediaFullscreen enveloppe un plein écran avec ce flux.

Écarts :
- GalleryImageSaver n’écrit que images/vidéos dans MediaStore (Pictures/Meeshy, Movies/Meeshy, API 29+) depuis le visualiseur d’images : étendre à tous les points d’entrée (vidéo, audio, document, galerie, menu contextuel) via un coordinateur unique
- Destinations selon le type : galerie pour image/vidéo (direct, sans question), Fichiers (ACTION_CREATE_DOCUMENT) et Partager (ACTION_SEND) pour audio/documents
- Portillon de sortie (ContentExitGate) fail-closed : aucun enregistrement/partage d’un contenu éphémère, à vue unique, flouté ou chiffré
- Dédoublonnage dans l’album (empreinte de la source) et issue « déjà dans l’album »
- Marque Meeshy (pseudo de l’auteur) sur les œuvres composées uniquement (image, vidéo, signature audio), repli sur l’original en cas d’échec ou de GIF/vidéo longue
- Rapport « downloaded » au serveur, toasts d’issue et haptique, pastille de préparation passive
- Compatibilité API < 29 (WRITE_EXTERNAL_STORAGE) ou masquage de l’affordance

Rendu : Feuille de destinations (Photos / Fichiers / Partager) en bottom sheet, pastille « préparation » ronde sans bouton, toast d’issue avec icône.

Transposition Android : PHPhotoLibrary album Meeshy → MediaStore RELATIVE_PATH Pictures/Meeshy et Movies/Meeshy ; UIDocumentPicker export → Storage Access Framework ; share sheet → Intent.createChooser(ACTION_SEND) ; filigrane vidéo → Media3 Transformer overlay.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MediaSaveCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Services/MediaSaveBranding.swift`
- `apps/ios/Meeshy/Features/Main/Components/MediaSaveFlowHost.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GallerySaveTarget.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`

### Une vidéo montre une image nette avant même d’être lue

`mav-video-poster-first-frame` · Android : **partielle** · P1 · effort S

VideoPosterPlan décide, depuis des faits déjà collectés, l’ordre d’essai : le fichier local gagne toujours (première image décodée en matériel, < 100 ms) ; sinon, si la politique média autorise le téléchargement, on ATTEND le fichier (le store coalesce) puis on décode ; en dernier recours extraction distante par requête Range (le premier Mo, où vit la première keyframe — un geste sur ce média autorise ce Mo même en économie de données, jamais un simple préchauffage). Sans réseau : rien, le repli vignette/thumbHash s’affiche. VideoPosterGrade fixe les résolutions (bulle 400, plein écran net ≥ 1 080, extraction max 1 920) et isFullscreenSharp. VideoPosterResolver calcule la clé de poster, relit un poster persisté et exécute le plan selon l’Intent (userOpened vs ambientPrewarm).

Écarts :
- VideoPosterSource ne couvre que le montage plein écran (poster net vs fond flou) ; manque le plan à trois étapes (decodeLocalFile / downloadThenDecode / rangeExtract du premier Mo) piloté par l’Intent userOpened vs ambientPrewarm
- Grades de résolution : bulle 400 px, plein écran net ≥ 1 080, extraction max 1 920 ; isFullscreenSharp(posterMax, sourceMax)
- Clé et persistance du poster extrait (réutilisé d’une session à l’autre)
- Politique : un geste autorise le Mo d’extraction même en économie de données, un préchauffage non ; hors ligne rien d’extrait
- Repli ThumbHash/vignette sans attente quand aucun poster n’est disponible (ThumbHashPainter existe)

Rendu : Poster net aux coins de la bulle ; avant extraction, fond flou de la vignette (rayon de flou assumé) puis fondu vers l’image nette.

Transposition Android : AVAssetImageGenerator → MediaMetadataRetriever.getFrameAtTime (déjà utilisé) ; requête Range via OkHttp.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VideoPosterResolver.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoPosterSource.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`

### On crée son profil vocal en quelques étapes pour que les traductions gardent sa voix

`mav-voice-profile-wizard` · Android : **partielle** · P1 · effort M

VoiceProfileWizardView enchaîne cinq étapes avec indicateur de progression (capsules 3 pt) et annonce VoiceOver de chaque étape : Consentement (icône waveform.circle.fill, introduction « Enregistrez votre voix… », quatre garanties : 3 échantillons de 10 s minimum, données chiffrées, suppression à tout moment RGPD, utilisation pour traduire avec votre voix, bouton « J’accepte et je continue »), Vérification de l’âge (sélecteur de date de naissance en roue, bouton Confirmer avec spinner), Enregistrement (« Enregistrez votre voix » — lire à voix haute les phrases affichées, minimum 3 échantillons de 10 s, haptique de succès), Analyse (« Envoi n/N échantillons » + barre de progression, « Votre profil vocal est en cours de création »), Terminé (« Profil vocal créé ! », récapitulatif échantillons/durée/qualité/statut, « Vos messages audio traduits utiliseront désormais votre voix clonée », bouton Terminer). VoiceProfilePrompts fournit cinq textes lus par langue (présentation posée, question puis réponse, enthousiasme, énumération, rendez-vous chiffré) pour capter la prosodie, une série par langue d’interface, repli anglais, sens de lecture RTL (ar, he, fa, ur) indépendant de l’interface. VoiceProfileService : consentement (GET/POST /voice-profile/consent, révocation), profil (GET /voice/profile avec toDomain), échantillons (upload audio + durée), bascule du clonage, suppression. VoiceProfileModels : statut de consentement, profil (pending/processing/ready/failed/expired), détails passerelle (qualityScore, audioDurationMs, needsCalibration, expiresAt).

Écarts :
- Seuls les modèles existent (et avec une forme qui n’est pas celle du fil passerelle : VoiceProfileDetails/VoiceProfileRegisterResponse, champ voiceRecordingConsent manquent) ; aucun écran, ViewModel ni service REST
- Service VoiceProfileService : GET/POST /voice-profile/consent (+ révocation), GET /voice/profile, upload d’échantillon (audio + durée), bascule du clonage, suppression
- Wizard à cinq étapes (consentement, âge, enregistrement, analyse, terminé) avec indicateur de progression, annonces TalkBack, haptique
- Étape d’enregistrement : lecture des phrases (VoiceProfilePrompts, 5 textes par langue, repli en, RTL pour ar/he/fa/ur), enregistreur AudioRecordingSettings.voiceSample (96 kb/s, plancher 10 s, rejet < 10 s), minimum 3 échantillons
- Progression d’envoi n/N et attente d’analyse, écran final avec récapitulatif
- Portage du catalogue de textes de prononciation écrits à la main pour chaque langue d’interface d’Android

Rendu : En-tête réduit avec retour, indicateur de 5 capsules (≤ 200 dp) accent, icône héros 64 dp en dégradé accent, listes de garanties avec coches, boutons pleins accent ; RTL pour les textes arabe/hébreu même si l’interface est en français.

Transposition Android : DatePicker roue → DatePickerDialog Material 3 ; GRDB/URLSession → Retrofit.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/VoiceProfileWizardView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfileModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfilePrompts.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/VoiceProfileService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Enregistrer un vocal en plein écran ou en feuille, avec langue parlée, aperçu et édition

`media-audio-recorder-screen` · Android : **partielle** · P1 · effort M

UniversalAudioRecorderView est l'enregistreur plein écran unifié (messages, stories, posts) : gros bouton d'enregistrement en bas, waveform temps réel, durée avec plafond optionnel, puis aperçu avec waveform et contrôles éditer/accepter qui lancent l'éditeur audio (rognage, transcription) ; refus du micro expliqué sous les contrôles (avec renvoi vers les Réglages si définitif) au lieu d'un écran inerte. AudioRecorderSheet est la feuille partagée par stories, posts et réels : tap pour démarrer/arrêter, aucune limite de durée (directive 2026-07-26), bandeau de langue parlée (drapeau + nom natif, langues courantes d'abord), puces d'autres sources (Fichiers, Bibliothèque) et fente opaque sous le bouton pour les réglages de mixage ; rend le fichier et la langue.

Écarts :
- Écran/feuille d'enregistrement dédié : l'existant se limite à la pilule du composer (annuler, waveform, point clignotant + minuteur, stop/envoyer) sans écran plein, sans aperçu ni retour d'édition
- Gros bouton d'enregistrement en bas (libellés « Appuyez pour enregistrer », « Enregistrement », « Enregistrer »), waveform temps réel, durée en police numérique à transition, haptique moyenne au démarrage et de succès à la fin
- Aperçu après capture : waveform + lecture + éditer (ouvre media-audio-editor) + accepter
- Bandeau de langue parlée (drapeau + nom natif, courantes d'abord) qui étiquette l'enregistrement pour la transcription et le Prisme ; option de masquer le bandeau quand l'appelant a son propre sélecteur
- Message de refus micro : « Permission micro refusée » ou « Micro refusé, autorisez-le dans Réglages » avec bouton vers les paramètres de l'appli, rendu sous les contrôles
- Puces de sources alternatives « Fichiers » et « Bibliothèque » (closures opaques) et fente de contenu sous le bouton, masquées pendant l'enregistrement
- Plafond de durée optionnel (aucun par défaut) et temps écoulé sans « / plafond »
- Câbler le même composant dans les compositeurs de story, de post et de réel (AudioRecorderSheet partagé)

Rendu : Fond sombre ou thème selon le contexte, bouton d'enregistrement circulaire large centré en bas, point rouge pulsant pendant la prise, durée en grand chiffre numérique, strip de langue horizontale défilante (capsules, actif en accent), message d'erreur discret sous les contrôles.

Transposition Android : AVAudioRecorder + DevicePermissions.requestMicrophone devient MediaRecorder/AudioRecord + ActivityResultContracts.RequestPermission (RECORD_AUDIO) avec redirection ACTION_APPLICATION_DETAILS_SETTINGS ; sélecteur Fichiers devient ACTION_OPEN_DOCUMENT audio/*, Bibliothèque devient MediaStore picker.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/UniversalAudioRecorderView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioRecorderSheet.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Lire la transcription d'un vocal, mot à mot au rythme de la voix

`media-audio-transcription-karaoke` · Android : **partielle** · P1 · effort M

Sous la waveform, la bulle audio affiche un bloc de transcription à états : CTA « Transcrire » quand il n'y a rien, shimmer qui réserve la hauteur pendant la fenêtre passive entre réception du vocal et arrivée de la transcription serveur, citation plate à 2 lignes en posture minimale, flux karaoké en posture focalisée (segments tappables qui cherchent la position, segment actif / passé / futur colorés, coupe à environ 30 mots puis plein écran), « voir plus » inline à 255 caractères, bouton « Retranscrire », opt-out d'affichage automatique (le CTA révèle le texte déjà là sans réseau). MediaTranscriptionView est la carte plein écran partagée (détail audio et réels) : segments centrés, défilement automatique vers le segment actif, taille de police paramétrable, mouvement réduit désactive l'effet de vague.

Écarts :
- Rendre le flux karaoké : segments tappables (haptique légère + seek vers startTime), segment actif résolu par TranscriptionKaraokeResolver (déjà porté : fenêtre [start,end), repli proportionnel, rien d'allumé à l'arrêt), couleurs actif / passé / futur
- Aujourd'hui seul le texte résolu s'affiche sur 3 lignes maxi sans segments : brancher les segments (MessageTranscriptionSegment) jusqu'à BubbleAudio
- États du bloc : CTA « Transcrire » (icône + libellé, haptique), shimmer avec réservation de hauteur (reserveTranscriptionHeight calculé par l'appelant depuis la date de la pièce et la présence de la transcription), fondu shimmer vers texte (spring 0,4 / 0,85), état « retranscription en cours »
- Coupe à 30 mots avec ellipsis dans la posture focalisée (transcriptionWordLimit) et « voir plus » inline à 255 caractères en posture card, avec libellé a11y dédié
- Bouton « Retranscrire » et callback onRequestTranscription / onRetranscribe ; endpoint de demande de transcription absent de MessageApi à ajouter
- Opt-out autoRevealTranscription : le CTA révèle le texte déjà présent sans appel réseau (préférence autoTranscribeIncoming, toujours vrai pour mes propres messages)
- Citation plate à 2 lignes en italique (FlatMinimal) via flatTranscriptionQuote
- MediaTranscriptionView plein écran : carte qui épouse son texte, défile au-delà, segment actif centré (ancre configurable), taille de police 14 par défaut et plus grande pour le hero d'un réel audio, marges de contenu sous un en-tête, fond de carte optionnel, active-segment résolu par l'hôte pour limiter les recompositions
- Mouvement réduit : supprimer l'échelle + élévation + halo du karaoké, garder seulement changement de couleur et de graisse

Rendu : Segment actif en accent gras avec léger zoom, passé atténué, futur secondaire ; texte 14 sp en bulle, plus grand en hero réel ; shimmer à 2 à 3 lignes aux largeurs variables ; transition d'opacité entre shimmer et texte ; haptique légère à chaque tap de segment.

Transposition Android : FlowLayout SwiftUI devient FlowRow Compose ; ScrollViewReader.scrollTo(anchor:.center) devient LazyListState.animateScrollToItem avec offset centré ; adaptiveOnChange devient LaunchedEffect.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView+Transcription.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AudioPlayerChromePlan.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Transcription.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### La transcription et les pistes traduites d'un vocal arrivent seules, même après coup

`media-audio-transcription-sync` · Android : **partielle** · P1 · effort M

Quand Whisper n'a pas fini à la réponse REST, attachment.transcription est vide : TranscriptionRetryScheduler relit UNE fois après 5 s les messages audio concernés (listAround, limit 5, includeTranslations) et réinjecte la transcription. AttachmentAudioMetadata unifie les trois sources (API REST, payload socket, enregistrements GRDB attachmentsJson) en entrées {messageId, attachmentId, transcription, translatedAudios}, les fusionne dans un état clé par message ET par pièce (forceOverwrite ou premier arrivé gagne) et re-clé l'état posé sous l'id local d'une bulle vers l'id serveur à l'accusé sans écraser une transcription serveur déjà arrivée. AttachmentMetadataMapping est le site unique des défauts d'une piste traduite (mp3, xtts, 0, false) et du mapping des segments.

Écarts :
- Planificateur de relecture unique à 5 s pour les messages dont une pièce audio n'a pas de transcription (idsMissingTranscription), borné, annulable, jamais rejoué en boucle ; aucun équivalent de listAround(around, limit 5, includeTranslations) dans MessageApi
- Fusion unifiée REST + socket + cache Room dans un même état clé par messageId ET attachmentId (transcriptionsByAttachment, translatedAudiosByAttachment) avec la règle forceOverwrite / premier arrivé gagne
- Re-clé local vers serveur à l'accusé d'envoi, par copie sans écrasement d'une transcription serveur déjà arrivée, idempotent
- Site unique des défauts d'une piste traduite (format mp3, modèle TTS xtts, durée 0, cloned false, qualité 0) et du mapping segments (text, startTime, endTime, speakerId) pour que REST, socket, Room et événements média ne divergent pas
- Relais des événements finalisés transcription:ready et audio traduit prêt jusqu'à l'état de la bulle sans passer par un rechargement

Rendu : Effet visible : le shimmer de transcription se transforme en texte sans action de l'utilisateur, sans saut de hauteur ; aucune bannière ni popup (Prisme : discrétion).

Transposition Android : Task + cancellableSleep devient coroutine delay dans le viewModelScope ; GRDB attachmentsJson devient l'entité Room de message ; observation socket Socket.IO déjà en place dans MessageSocketManager.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/TranscriptionRetryScheduler.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/AttachmentAudioMetadata.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/AttachmentMetadataMapping.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentTranscriptionMerge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt`

### Entendre un vocal dans sa langue (voix clonée) et basculer d'une langue à l'autre

`media-audio-translated-track-prisme` · Android : **partielle** · P1 · effort M

AudioTrackLanguageResolver est la loi unique de la langue de PISTE audio : bascule manuelle du drapeau (la langue d'origine vaut piste originale, une langue sans piste retombe sur l'original), sinon descente du Prisme dans l'ordre des langues du lecteur (la langue d'origine gagne à son rang, la première langue servie par une piste traduite gagne sinon). La langue d'origine est celle de la transcription de CETTE pièce quand elle est connue (un message à plusieurs vocaux). La vue et le moteur partagent la loi, évitant audio en langue A et karaoké en langue B. Le bandeau AudioLanguageStrip (pastilles « Original » + une par piste traduite, avec drapeau) permet de changer, et la lecture suit la langue choisie.

Écarts :
- Extraire la descente en une fonction pure unique AudioTrackLanguageResolver.resolve(manualOverride, originalLanguage, preferredLanguages, availableLanguages) : aujourd'hui resolveTranslatedAudio est privé au builder de bulle et ignore la bascule manuelle
- Ajouter l'override manuel (activeDisplayLangCode / bubbleLanguageSelections) pour que le drapeau change texte, karaoké ET piste jouée de façon cohérente
- Langue d'origine par pièce (originLanguage : celle de sa transcription, repli sur la langue du message) pour les messages à plusieurs vocaux
- Bandeau AudioLanguageStrip dans la bulle (posture card et focalisée, masqué en compact) : pastille « Original » avec haut-parleur + une pastille par piste traduite, état sélectionné en gras, haptique légère, relais externalLanguage
- Filtrer les codes de langue vides (jamais égaux à une origine inconnue) et normaliser en minuscules
- Réutiliser la même loi pour les réels audio (ReelAudioLanguageResolver) via la variante sur codes

Rendu : Pastilles capsule : drapeau emoji (haut-parleur pour Original) + libellé, police caption, graisse bold quand sélectionnée, accent plein sélectionnée, fond discret sinon ; bandeau sous le lecteur avec transition d'opacité ; jamais de popup ni de bannière.

Transposition Android : Même logique pure en Kotlin dans core:model (testable JVM) ; les pastilles sont des Compose FilterChip/capsules ; pas d'équivalent plateforme particulier.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/AudioTrackLanguageResolver.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/LanguageFlagTapResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt`

### La forme d'onde d'un vocal reflète vraiment sa voix dès l'affichage

`media-audio-waveform-analysis` · Android : **partielle** · P1 · effort S

AudioWaveformAnalyzer décode les octets audio du cache en échantillons d'amplitude (RMS absolu ramené à un contrat linéaire, crête à 1) publiés pour la bulle audio, l'éditeur, la cellule du composer et le cadran plein écran. Il demande au moins 96 buckets (assez pour 72 barres), 512 pour la bande de transcription, 2 048 pour le rogneur, met en cache par URL et nombre de barres, et peut générer une image de waveform servant de thumbhash audio.

Écarts :
- Décoder un fichier audio (cache disque ou file://) en N buckets d'amplitude RMS hors du fil principal (MediaExtractor + MediaCodec vers PCM puis RMS) ; l'existant ne gère que le niveau micro EN DIRECT pendant l'enregistrement
- Contrat de sortie linéaire à crête 1, mêmes tailles de requête que iOS (96+, 512, 2 048) pour que les clés de cache tombent juste
- Cache mémoire + disque des échantillons par URL et par nombre de barres, annulable quand la bulle quitte l'écran
- Repli procédural stable (même courbe que iOS) tant que le décodage n'est pas fini, sans saut visuel à l'arrivée des vraies valeurs
- Génération d'une image de waveform pour la vignette audio

Rendu : Hauteurs mappées par pow(x, 0,65) entre 2 et 22 dp pour que les passages calmes restent visibles ; le repli procédural est une somme sin/cos déterministe (seed = index*7+3) pour qu'une bulle ne change pas de forme au chargement.

Transposition Android : AVAudioFile/Accelerate (vDSP RMS) devient MediaExtractor + MediaCodec + calcul RMS en coroutine Dispatchers.Default ; NSCache/disque devient LruCache + fichier dans cacheDir.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioWaveformAnalyzer.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/AudioLevelMetering.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`

### Sous-titrer un appel en direct avec reconnaissance vocale sur l'appareil, en trois états

`media-call-live-captions-capture` · Android : **partielle** · P1 · effort M

CaptionsMode cycle le bouton de sous-titres : off → translated → original → off (translated est toujours le point d'entrée) dérivé de deux drapeaux existants (panneau local ouvert, afficher l'original) sans troisième source de vérité. TranscriptionCapturePolicy décide quoi faire de la capture locale (start / stop / none) : ce device capture dès que quelqu'un écoute (son propre panneau OU un pair signalé par call:transcription-active), jamais si le micro est coupé ; chaque device ne transcrit que son propre micro. TranscriptionError couvre permission refusée, reconnaisseur indisponible pour la langue, reconnaissance on-device non supportée, échec de reconnaissance, échec du moteur audio, format du tap micro indisponible (route disparue). TranscriptionPermission : notDetermined / authorized / denied / restricted.

Écarts :
- CaptionsMode existe mais est dérivé de isTranscribing alors que iOS le dérive du PANNEAU (isShowingCaptions), pas de isTranscribing : corriger pour qu'un appareil qui capte pour servir un pair ne ‘allume’ pas tout seul le bouton
- Porter TranscriptionCapturePolicy.action(localPanelOpen, peerCaptionsActive, isCapturing, isMicrophoneMuted) → start/stop/none (micro coupé ⇒ rien ne part)
- Capture vocale on-device : aucun SpeechRecognizer n'est utilisé dans le dépôt Android ; implémenter SpeechRecognizer.createOnDeviceSpeechRecognizer (API 31+) avec langue dérivée du Prisme, résultats partiels, et partage du micro avec WebRTC
- Modèle TranscriptionError (permissionDenied, recognizerUnavailable(language), onDeviceNotSupported(language), recognitionFailed, audioEngineFailed, tapFormatUnavailable) et TranscriptionPermission (notDetermined, authorized, denied, restricted → RECORD_AUDIO)
- Signal pair call:transcription-active et icône sous-titres portant l'indicateur du pair actif (jamais silencieux)
- Panneau de sous-titres : ligne traduite dans la langue du lecteur (Prisme) / texte original, cycle 3 états au tap

Rendu : Bouton sous-titres à 3 états avec icône et indicateur du pair actif ; panneau de sous-titres discret sur la vidéo d'appel.

Transposition Android : SFSpeechRecognizer on-device devient SpeechRecognizer.createOnDeviceSpeechRecognizer (API 31+) avec repli ; AVAudioEngine tap devient AudioRecord ; permission Speech devient RECORD_AUDIO.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift`
- `apps/ios/Meeshy/Features/Main/Models/TranscriptionError.swift`
- `apps/ios/Meeshy/Features/Main/Models/TranscriptionPermission.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallCaptions.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LiveTranscript.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DataChannelProtocol.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`

### L'expéditeur voit qui a écouté, regardé ou ouvert sa pièce jointe, même hors-ligne

`media-consumption-reporting` · Android : **partielle** · P1 · effort M

AttachmentStatusReporter est l'entonnoir unique par lequel passe TOUT rapport de consommation d'un média (POST /attachments/:id/status) : lecteur audio, lecteur vidéo partagé, renderer vidéo, visionneuse d'images, visionneuse de documents, enregistrement. Tout passe par l'outbox FIFO, même en ligne, pour que l'ordre des rapports (segments cumulés, position finale) soit celui de la lecture réelle ; seul repli : poster en direct quand l'outbox n'a pas de base. Variante attendable pour la fermeture d'écran ou le passage en arrière-plan. DocumentOpenReport décide ce qui remonte à l'ouverture d'un document (viewed, pas downloaded ; rien pour son propre document). VideoDismissWatchReport empêche la fermeture d'une vidéo en pause d'effacer la position de reprise écrite une fraction de seconde plus tôt.

Écarts :
- Ajouter l'endpoint POST /attachments/{id}/status (AttachmentStatusBody : écoutes continues avec raison de fin, position, complétion, viewed, downloaded, watched) à l'API réseau : MediaApi ne contient que attachments/upload
- Entonnoir unique FIFO via l'outbox durable (Room + WorkManager) pour audio, vidéo, image, document ; rapport jamais bloquant ni jetant ; mode direct de repli sans base
- Variante suspendue (await) pour fermeture d'écran et passage en arrière-plan
- Rapport d'ouverture de document (viewed) sans auto-déclaration pour son propre envoi (isMe), distinct de l'enregistrement explicite (downloaded)
- Rapport d'image vue à la disparition de la visionneuse avec la durée de visionnage
- Brancher VideoDismissWatchReport (déjà porté en modèle) au lecteur vidéo plein écran : ne pas relire un player déjà nettoyé
- Écoute de bout en bout : un seul observateur de fin de flux (moteur) pour éviter un double rapport complete:true

Rendu : Pas de rendu direct ; alimente l'onglet « Vu par » / « Écouté » / « Ouvert » et la teinte de consommation côté expéditeur.

Transposition Android : OfflineQueue/outbox GRDB devient file Room + WorkManager (réseau requis, backoff) ; l'ordre FIFO est garanti par une seule file ordonnée par horodatage.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/AttachmentStatusReporter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentOpenReport.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDismissWatchReport.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VideoDismissWatchReport.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MediaApi.kt`

### Voir un document joint en carte, puis l'ouvrir, l'enregistrer ou le supprimer

`media-document-viewer` · Android : **partielle** · P1 · effort M

DocumentViewerView est la carte d'un document joint (icône par type, nom ou libellé du type, type, taille, nombre de pages « N pages », bouton supprimer en composer avec libellé « Supprimer la pièce jointe ») dont le tap ouvre DocumentFullSheet : aperçu intégré (web view durcie qui coupe toutes les sorties : sélection de texte et son menu, aperçu et menu d'un lien ou d'une image, glisser-déposer sur iPad), bouton fermer, bouton « Télécharger le document » qui enregistre dans Fichiers (états idle, saving, saved, failed, haptique de succès/erreur), « Aperçu non disponible » avec nom et taille quand l'aperçu est impossible, portillon de sortie (view-once/protégé : ni enregistrer, ni partager, ni copier) et bouclier de capture. L'ouverture de la fiche remonte un rapport « ouvert » (DocumentOpenReport) distinct de l'enregistrement, sauf pour son propre document.

Écarts :
- Carte de document dans la bulle : icône par type MIME, nom (ou libellé du type), taille formatée et nombre de pages (BubbleFile ne porte que nom, taille et url ; ajouter type, pages)
- Fiche plein écran d'aperçu intégré (PdfRenderer pour PDF, WebView durcie pour les autres) à la place de l'envoi systématique vers une appli externe via ACTION_VIEW après téléchargement ; garder ACTION_VIEW/ACTION_SEND en repli
- Bouton « Télécharger le document » vers Documents/Téléchargements (MediaStore.Downloads ou SAF) avec états idle / saving / saved / failed et retour d'état
- Texte « Aperçu non disponible » avec nom et taille
- Portillon de sortie et bouclier de capture pour contenu protégé (FLAG_SECURE, désactiver copier/partager)
- Rapport d'ouverture (viewed) à la présentation de la fiche, pas pour son propre document
- Bouton supprimer en composer avec libellé a11y
- Haptique légère à l'ouverture, succès/erreur à l'enregistrement

Rendu : Carte arrondie avec icône de type colorée, nom sur une ligne, type et taille en caption, pages ; fiche plein écran avec barre supérieure (fermer, télécharger) et zone d'aperçu ; état 'saved' = coche.

Transposition Android : WKWebView/QuickLook devient PdfRenderer + WebView durci (désactiver sélection, long-press, drag) ; Fichiers devient SAF/MediaStore.Downloads.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloadOverlay.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`

### Retoucher une image de façon non destructive : filtres, effets et réglages rendus en temps réel

`media-image-editor-engine` · Android : **partielle** · P1 · effort M

Le cœur du moteur d'édition d'image : ImageEditState (rotation par quarts de tour 0 à 3, miroir H/V, rectangle de recadrage normalisé, filtre, réglages, effet) est une petite valeur (~100 octets) rejouable à n'importe quelle résolution depuis l'original intact. 12 filtres (original, vivid, dramatic, mono, noir, sepia, warm, cool, fade, chrome, process, instant ; Simple = original, vivid, dramatic, mono, warm, cool) et 6 effets (aucun, flou, vignette, netteté, bloom, grain) ; réglages ImageAdjustments (exposition, luminosité, contraste, saturation, vibrance, température, netteté, flou, vignette, bloom, grain) ; ImageAdjustmentStage est la chaîne CoreImage unique partagée avec le lecteur de scène (bloom rayon 10, grain alpha max 0,1) ; ImageFilterEngine rend orientation → recadrage → filtre → réglages → effet sur le contexte Metal partagé, hors thread principal ; LatestWinsRenderLoop garde UN rendu en vol et replie les demandes en attente sur la dernière (le glissé de curseur montre toujours le look le plus récent).

Écarts :
- Modèle ImageEditState (turns, flipH, flipV, cropNormalized, filter, adjustments, effect, identity, hasEdits, hasGeometryEdits) et rotations/miroirs qui transportent le recadrage existant
- Énumérations de 12 filtres et 6 effets avec isEssential (Simple) ; ImageAdjustments à 11 curseurs (Android a StoryFilterMatrix pour les filtres de story, pas les curseurs ni les effets)
- Pipeline de rendu GPU non destructif (AGSL RuntimeShader / RenderEffect API 33+, repli ColorMatrix + ScriptIntrinsic ou GPU lib pour API plus basses) : même chaîne pour l'éditeur ET pour le rendu de scène (loi 6 : le player est l'aperçu)
- Aperçu sur copie réduite et export en pleine résolution, orientation puis recadrage cuits d'abord, couleur ensuite
- Boucle de rendu « le dernier gagne » (un seul rendu en vol, demande en attente remplacée, livraison ordonnée sur le thread principal)
- Cache d'image réglée par instance + valeurs (un curseur qui revient sur une valeur ne refait aucun rendu)

Rendu : Rendu fidèle en aperçu et à l'export ; filtres nommés en anglais côté iOS (Original, Vivid, Dramatic, Mono, Noir, Sepia, Warm, Cool, Fade, Chrome, Process, Instant) ; effets Aucun, Flou, Vignette, Netteté, Bloom, Grain avec icônes dédiées.

Transposition Android : CIFilter/CIContext (Metal) devient RenderEffect + AGSL (API 33) avec repli ColorMatrixColorFilter et bitmap pipeline (RenderScript est déprécié : préférer AGSL/OpenGL ES ou une bibliothèque GPU) ; ImageIO orientation devient ExifInterface + Matrix.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageAdjustmentStage.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/LatestWinsRenderLoop.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`

### Des contextes média et des constantes partagés par tous les composants de lecture et d'écriture

`media-shared-types-contexts` · Android : **partielle** · P1 · effort M

MediaTypes porte les types de base du domaine média : MediaPlayerContext (messageBubble rayon 14, composerAttachment 12, feedPost 18, storyOverlay 0, fullscreen 0), PlaybackSpeed (0,8 ; 0,9 ; 1,0 ; 1,25 ; 1,5 ; 1,75 ; 2,0 ; 2,25 avec libellé « 1.25× »), ComposerMode (message, post, status, story, comment, caption) avec placeholders (« Message... », « Quoi de neuf ? », « Votre statut... », « Répondre... », « Commenter... », « Ajouter une légende... »), longueurs maximales (post 5 000, status 500, story 1 000, comment 2 000, caption 500, message sans limite), capacités par mode (brouillon, pièces, vue unique réservée au message adressé, etc.) et icône d'envoi, AttachmentStatusBody (corps de POST /attachments/:id/status avec segments d'écoute continue et raison de fin) nonisolated pour être rejoué par l'outbox, AudioAvailability et formatMediaDuration.

Écarts :
- Enum PlaybackSpeed à 8 valeurs avec libellé (l'overlay Android a sa propre grille 0,5 à 2,0 : unifier sur celle d'iOS)
- MediaPlayerContext (rayon de coin par contexte, isCompact) partagé par les lecteurs audio/vidéo
- ComposerMode : placeholders localisés (les chaînes iOS sont en français littéral, à déplacer dans les ressources 7 langues), longueurs max (post 5 000, status 500, story 1 000, comment 2 000, caption 500) et table de capacités par mode
- AttachmentStatusBody sérialisable (segments d'écoute continue avec raison de fin) pour l'outbox
- AudioAvailability (ready / needsDownload / downloading(progress, downloaded, total)) et formatMediaDuration unifiés avec MediaAvailability existant

Rendu : Rayons de coin 14 / 12 / 18 / 0 par contexte ; libellés de vitesse en « 1.25× » (croix de multiplication) ; durées formatées m:ss.

Transposition Android : Enums et data classes Kotlin dans core:model ; chaînes de placeholders en ressources strings.xml (fr, en, es, pt).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Media.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`

### Voir tout de suite l'affiche d'une vidéo, avec bouton lecture et durée

`media-video-poster-thumbnail` · Android : **partielle** · P1 · effort S

MeeshyVideoThumbnail est l'affiche statique et mise en cache d'une vidéo avec badge de lecture et badge de durée optionnels, pour listes, grilles et chips où la lecture est déléguée ; le thumbHash (décodé en moins d'une milliseconde) patiente tant que la première image est en extraction, le dégradé n'étant que le repli d'une pièce sans thumbHash. Pour une vidéo distante, la première image s'obtient sans télécharger le fichier (GET partiel Range sur le premier Mo, où vit la première keyframe, décodé en matériel). Un poster persisté est décodé à une taille bornée pour limiter la mémoire. Libellé a11y « Lire la vidéo » quand elle est tappable.

Écarts :
- Composable d'affiche vidéo avec badge play rond centré et badge de durée formatée (m:ss) en bas, tous deux optionnels, libellé a11y « Lire la vidéo » quand un handler existe
- Placeholder thumbHash (ThumbHashPainter existe) pendant l'extraction de la première image, dégradé en repli
- Première image distante par lecture partielle (en-tête Range sur le premier Mo) plutôt que MediaMetadataRetriever.setDataSource(url) qui peut tout charger ; décodage matériel
- Cache persisté du poster avec décodage borné au plus grand côté en pixels pour les surfaces de liste (pas de frame plein grade en mémoire)
- Utilisation dans chips de réponse, grilles de médias, galeries et miniatures de composer

Rendu : Badge play circulaire verre sur l'affiche, badge durée capsule noire translucide en bas à droite en mono, coins selon le conteneur ; aucun spinner tant que le thumbHash peut patienter.

Transposition Android : AVAssetImageGenerator devient MediaMetadataRetriever.getFrameAtTime (déjà utilisé) ou MediaMetadataRetriever.getScaledFrameAtTime ; cache via Coil + clé thumb:<url>.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoThumbnail.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoPosterSource.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ThumbHash.kt`

### Une seule vidéo joue à la fois, avec mute global, boucle et lecture qui suit la surface

`media-video-shared-engine` · Android : **partielle** · P1 · effort M

SharedAVPlayerManager est le moteur vidéo unique (un AVPlayer) : mute global préservé entre vidéos (isMuted) et intention de mute PAR SURFACE (isForceMuted, transitoire, ne traverse pas une changement de pièce) pour l'autoplay silencieux du fil, mute effectif = OU des deux ; couper le son clôt le visionnage en cours ; démarrer un son relance une consommation. La loi de montage décide quelle surface (fil, plein écran, fenêtre PiP) a le droit de monter le lecteur pour quel média (une vidéo ne joue qu'à UN endroit, jamais la bulle d'origine pendant le PiP ; fermer le plein écran n'abandonne la lecture qu'au PiP). La file de boucle tient un successeur du MÊME média derrière l'élément en cours, avec lois d'affichage (fraction = temps de l'élément / durée, durée conservée au tour de boucle, tête publiée à la cible d'un seek) et réarmement de l'horloge d'une scène arrêtée en fin de tour.

Écarts :
- Moteur vidéo partagé injectable (singleton Media3) : load(url/pièce), play, pause, stop, seek, speed, loop, nettoyage ; aujourd'hui ReelVideoSurface crée un ExoPlayer par URL et le relâche à la disposition
- Mute global (isMuted) + intention de mute par surface (isForceMuted, remise à zéro au changement de pièce) ; mute effectif = OU ; muet ⇒ le visionnage en cours est clôturé et la reprise du son démarre une nouvelle consommation
- Loi de montage pure : rôle de surface (fil / plein écran / PiP) × média actif ⇒ droit de monter le lecteur ; deux identités vides ne sont pas « le même média » ; fermeture du plein écran ⇒ lecture abandonnée seulement au PiP
- File de boucle (successeur du même média) pour des réels et cartes qui bouclent sans trou ; lois d'affichage de la progression de boucle et du réarmement de scène
- Observateur de fin de flux UNIQUE dans le moteur (rapport complete:true puis stop/boucle) pour éviter les doubles rapports
- Réutilisation d'un lecteur préparé seulement s'il lit le fichier local ; sinon jeté
- Pas d'abonnement des vues à currentTime (battement 200 ms) : champs lus miroités

Rendu : Aucun rendu propre ; effets visibles : une seule vidéo joue, le muet du fil ne fuit pas vers la surface suivante, le plein écran reprend la vidéo là où la bulle l'a laissée.

Transposition Android : AVPlayer/AVPlayerItem + KVO devient ExoPlayer + Player.Listener ; file de boucle devient playlist ExoPlayer (MediaItem répété) ou repeatMode ONE selon le cas ; loi de montage pure en Kotlin.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager+Mounting.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackLoopLaw.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackLoopQueue.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### La légende d’un média se traduit : drapeaux des traductions ou icône pour traduire

`mav-caption-translation` · Android : **partielle** · P2 · effort S

CaptionTranslationOffer (loi pure) décide ce qu’on offre entre une légende et son invite : rien, des langues (au moins deux : origine en tête puis traductions par ordre alphabétique, langue active), ou l’icône traduire (feuille habituelle de traduction des messages/audios). Cible : le post (carrierText) ou la légende d’un média (mediaCaption). CaptionTranslationSource.displayedLanguage résout la langue affichée selon les préférences. CaptionTranslationArrival fusionne les arrivées socket (post translation updated, media caption translation updated). MediaCaptionTranslationRow rend la décision : drapeaux (actif marqué, toucher = légende dans cette langue, pastille ouvre la feuille), ou icône traduire (« Demander une traduction »), avec indicateur d’activité pendant la demande et haptique légère, rien si rien à offrir.

Écarts :
- La fusion des traductions de légende de média est portée (MediaCaptionTranslationMerge dans PostRepository) mais aucune rangée d’offre sous la légende dans la galerie/plein écran
- Loi CaptionTranslationOffer (none / languages(codes, active) / translate) et CaptionTranslationSource (post vs mediaCaption)
- Endpoint POST /posts/media/:mediaId/caption/translate et écoute de l’événement de mise à jour
- Rangée MediaCaptionTranslationRow : drapeaux, pastille, icône traduire, spinner, haptique, libellés a11y

Rendu : Rangée discrète entre légende et invite : drapeaux ronds 22 dp avec liseré accent sur l’actif, ou petite icône traduire ; spinner 14 dp à côté pendant la demande.

Transposition Android : Rangée Compose réutilisant LanguageQuickStrip / PostLanguageStrip.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CaptionTranslationOffer.swift`
- `apps/ios/Meeshy/Features/Main/Views/MediaCaptionTranslationRow.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaCaptionTranslationMerge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`

### Le serveur sait qui a vu, écouté, regardé ou téléchargé une pièce, et la reprise se synchronise

`mav-media-consumption-tracking` · Android : **partielle** · P2 · effort M

AttachmentConsumptionResolver choisit l’action principale par type de média (image → viewed, audio → listened, vidéo → watched, tout le reste → downloaded) et résout statut, compte et marqueur « par tous » avec la sémantique tout-ou-rien de groupe (comme DeliveryStatusResolver) pour la feuille d’infos du message (agrégats viewedByAllAt, viewedCount, consumedCount). MediaConsumptionProgressBar et MediaResumeResolver relisent la fraction déjà consommée (local d’abord, servie par la passerelle en repli, par medium) pour teinter la vidéo et reprendre à la bonne position d’un appareil à l’autre. Le téléchargement manuel rapporte « downloaded » (MediaSaveDownloadReporting).

Écarts :
- AttachmentConsumptionResolver (action par MIME, statut tout-ou-rien de groupe) absent ; section « Qui a vu / écouté / regardé / téléchargé » de la feuille d’infos du message
- Store local de consommation (fraction par pièce) + resolver de reprise combinant local et consommation servie (currentUserConsumption)
- Envoi des rapports de consommation (viewed/listened/watched/downloaded) et gestion de VideoDismissWatchReport (déjà modélisée) à la fermeture du lecteur
- Barre de reprise sur la vidéo (≥ 1 %) lue depuis ce store

Rendu : Barre de reprise capsule 3 dp accent sous le poster ; dans la feuille d’infos, icône + compte par action (œil, oreille, lecture, flèche) et marqueur « par tous ».

Transposition Android : MediaConsumptionStore (UserDefaults) → DataStore/Room.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/AttachmentConsumptionResolver.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MediaConsumptionProgressBar.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VideoDismissWatchReport.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`

### Rogner un média ne ré-encode jamais : seules des bornes sont posées

`mav-media-crop-trim-rules` · Android : **partielle** · P2 · effort S

MediaCropRect est un rectangle normalisé 0–1 posé sur la source (jamais des pixels), avec les pastilles MediaCropRatio (libre, 1:1, 4:5, 3:4, 9:16, 4:3, 16:9) ; MediaCropReadiness interdit de poser une pastille de proportion tant que le ratio réel de la source n’est pas mesuré (sinon 9:16 sur une 16:9 non mesurée donne un carré). MediaTrimBounds/MediaTrimRule portent la fenêtre de source (sourceStart/sourceEnd) d’un média ou d’un son posé sur une scène : durée minimale 0,4 s, déplacement des poignées en points → secondes, bornes persistées seulement si différentes de l’intégrale (epsilon 0,01), accesseurs trimBounds sur StoryMediaObject et StoryAudioPlayerObject.

Écarts :
- MediaCropRatio et rect centré par ratio (MediaCropRule.centered) absents ; seule la lecture des bornes d’un crop existant est portée
- MediaCropReadiness (ratio mesuré avant toute pastille) à porter
- MediaTrimRule : movingStart/movingEnd avec plancher 0,4 s, conversion poignée→secondes, persisted(sourceDuration) avec epsilon, full(sourceDuration)
- Accesseurs trimBounds sur les objets média/son de story et écriture des champs sourceStart/sourceEnd

Rendu : Pastilles de ratio en rangée (libre, 1:1, 4:5, 3:4, 9:16, 4:3, 16:9) ; poignées de rognage avec valeur minimale visible.

Transposition Android : Pur Kotlin dans :core:model, rejoue les vecteurs de test iOS.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MediaCrop.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MediaCropReadiness.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MediaTrimRule.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`

### Dans l’aperçu d’appui long, un vocal ou une vidéo se joue avec lecture, saut, curseur et vitesse

`mav-overlay-audio-preview-player` · Android : **partielle** · P2 · effort S

OverlayAudioPlayer est le lecteur de l’aperçu d’appui long (MessageOverlayMenu/MessageOverlayAudioPreview), cache d’abord : toggle(url) (changer d’URL arrête l’ancienne et recharge, même URL en pause reprend), stop, seek(fraction), skip(secondes), setRate (0,5 → 2,0), timeLabel « courant / total » (durée mesurée sinon durée de la pièce en MILLISECONDES, évite « 0:00 / 565:55 »), spokenTotalDuration (durée totale en toutes lettres pour VoiceOver, sans la position), observation de fin (reset), interruption par appel (interruptForCall) et participation au registre des lecteurs audibles (AudiblyPlayingPlayer, InterruptiblePlayer).

Écarts :
- Le transport pur (toggle, seek, skip, setRate, cycleRate, timeLabel, tick, onEnded) est porté sur MediaPlayer ; manquent l’interruption par appel/focus audio et l’inscription au registre des lecteurs audibles (ducking pendant un enregistrement)
- spokenTotalDuration localisée (« 12 secondes ») pour l’indication TalkBack au lieu de « 0:12 / 1:30 »
- Aperçu vidéo interactif : l’overlay ne joue pas les vidéos faute de type vidéo dans BubbleContent (documenté comme suivi)
- Migrer de MediaPlayer vers le moteur Media3 partagé pour la cohérence de focus et de vitesse

Rendu : Lecteur compact dans l’aperçu : play, −10/+10, curseur, « courant / total », chip de vitesse (0,5×–2×).

Transposition Android : AVPlayer → MediaPlayer/ExoPlayer ; InterruptiblePlayer → AudioFocus listener.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/OverlayAudioPlayer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`

### En appel vidéo, on règle des filtres (préréglages, couleurs, flou d’arrière-plan, teint naturel)

`mav-video-filters-call` · Android : **partielle** · P2 · effort M

VideoFilterConfig (température 6500 K neutre, teinte, luminosité, contraste, saturation, exposition, flou d’arrière-plan avec rayon, lissage de peau avec intensité, effet de visage, teint naturel actif par défaut qui ne compte pas dans hasAdvancedFilters) alimente VideoFilterPipeline (Core Image : colorimétrie graded, passes lourdes seulement si demandées, dégradation automatique quand l’appareil se protège, éclaircissement automatique de scène sombre CallVideoLowLight sous 30 % de luminance moyenne, jamais sur appareil contraint). Préréglages natural / warm (7 500 K) / cool (5 500 K) / vivid / muted avec recherche inverse du préréglage actif. VideoFiltersPanel (dans CallEffectsOverlay) : en-tête « Filtres vidéo » + « Réinitialiser », sélecteur de préréglages (puces avec état sélectionné), bascules avancées (« Flou d’arrière-plan » + « Rayon », « Teint naturel » avec indice), indicateur de performance ; VideoFilterControlView : curseurs Température / Luminosité / Contraste / Saturation / Exposition et bouton « Réinitialiser ».

Écarts :
- Les modèles et politiques de dégradation existent mais aucun actuateur ne traite les frames capturées (WebRTC VideoProcessor/VideoSink + GL ou RenderEffect) : implémenter colorimétrie, flou d’arrière-plan (segmentation), lissage de peau, teint naturel
- Préréglages natural/warm/cool/vivid/muted avec valeurs (7 500 K +5, 5 500 K −5, vivid contraste 1,15 saturation 1,3 exposition 0,1, muted 0,9 / 0,7 / −0,1) et recherche inverse du préréglage actif
- Panneau de filtres dans l’overlay d’appel : en-tête + Réinitialiser, puces de préréglages, curseurs avec valeur, bascules flou/rayon/teint naturel, indicateur de performance (isAutoDegraded)
- Effets de visage stylisés (faceEffect) et dégradation automatique selon la charge thermique/énergie
- Éclaircissement automatique des scènes sombres (seuil 30 %) déjà modélisé : à brancher sur la luminance mesurée

Rendu : Panneau en verre sombre au-dessus des contrôles d’appel, puces de préréglage en capsule (sélectionnée = accent), curseurs fins avec libellé et valeur, bouton Réinitialiser discret.

Transposition Android : Core Image/Vision → shaders GLSL / RenderEffect / ML Kit Selfie Segmentation, branchés sur un org.webrtc.VideoProcessor ; CallPressButtonStyle → press indication Compose.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/VideoFilterPipeline.swift`
- `apps/ios/Meeshy/Features/Main/Views/VideoFilterControlView.swift`
- `apps/ios/Meeshy/Features/Main/Views/VideoFiltersPanel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterConfig.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LowLightBoostPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DarkFramePolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`

### Garder la mémoire des images sous contrôle et décoder à la taille réellement affichée

`media-image-memory-budget` · Android : **partielle** · P2 · effort S

ImageDownsamplingConfig centralise la gestion mémoire des images : au lancement, plafonne le cache mémoire à 60 Mo (50 Mo pour les UIImage, 10 Mo pour les CGImage, par CacheCoordinator.configureImageMemory) et convertit une taille en points en taille en pixels pour le décodage (côté le plus grand × échelle d'écran, via DecodeBudget), pour qu'un avatar 40×40 sur un écran 3x se décode à 120 px et non en 4K.

Écarts :
- Aucun ImageLoader Coil configuré : le cache mémoire reste au défaut (25 % de la RAM) ; fixer un budget borné (≈ 60 Mo) via ImageLoader.Builder.memoryCache et le partager dans toute l'appli
- Décoder à la taille affichée (size resolver Coil, allowHardware, bitmap config adaptée) et exposer maxPixelSize(forDp) équivalent à DecodeBudget
- Appliquer le plafond au lancement (Application.onCreate / SingletonImageLoader) et le documenter comme budget unique
- Réagir aux onTrimMemory pour vider les caches

Rendu : Aucun rendu ; effet : scroll fluide et mémoire stable sur les listes riches en images.

Transposition Android : NSCache + CGImageSourceCreateThumbnailAtIndex devient Coil MemoryCache.Builder.maxSizeBytes + size resolver ; onTrimMemory.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift`

</details>

Android existant : `apps/android/gradle/libs.versions.toml`, `apps/android/app/build.gradle.kts`

### Enregistrer un média dans la galerie sans doublon et le dire (« Déjà dans la photothèque »)

`media-save-to-gallery-dedup` · Android : **partielle** · P2 · effort S

Les visionneuses du SDK n'ont pas le gestionnaire de toasts de l'appli : elles passent par le pont meeshy.showToast. PhotoAlbumSaveFeedback porte le message « Déjà dans la photothèque » quand le média est déjà dans l'album Meeshy (dédoublonné par l'empreinte du contenu, #10370) ; le bouton se lit au registre dès le premier rendu et affiche une coche plutôt qu'une flèche de téléchargement sur un média déjà enregistré. L'enregistrement part du fichier du cache par référence, sans relecture ni décodage, y compris hors ligne.

Écarts :
- Registre des médias déjà enregistrés par empreinte de contenu (DataStore/Room) lu dès le premier rendu du bouton
- Message « Déjà dans la photothèque » et coche à la place de la flèche sur un média déjà enregistré ; rien n'est écrit en doublon
- Enregistrement depuis le fichier du cache par référence (pas de re-téléchargement, fonctionne hors ligne) pour image ET vidéo
- Pont de toast unique utilisable depuis le SDK (MeeshyToast existe côté UI) pour les visionneuses
- Album dédié Meeshy dans MediaStore (RELATIVE_PATH) cohérent avec iOS

Rendu : Bouton d'enregistrement : flèche de téléchargement → spinner → coche, retour à l'état neutre après 2 s ; coche permanente si déjà enregistré.

Transposition Android : PHPhotoLibrary add-only devient MediaStore.Images/Video insert avec RELATIVE_PATH (aucune permission en API 29+) ; dédoublonnage par SHA-256 du contenu dans un registre local.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/PhotoAlbumSaveFeedback.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GallerySaveTarget.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyToast.kt`

