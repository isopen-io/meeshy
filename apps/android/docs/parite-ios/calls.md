# Parité iOS → Android : `calls`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**84 features iOS** : 42 absentes, 41 partielles, 1 divergentes, 0 complètes sur Android. **64 lots** planifiés (≈75400 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**calls#1** (couverture Android estimée ≈ 25 %)

Cette partie couvre toute la pile d'appel iOS hors vues (121 fichiers Swift, environ 24 000 lignes) : le cœur CallManager et ses quarante extensions (états, signalisation Socket.IO/WebRTC, négociation parfaite, reconnexion ICE à recul, reprise après plantage, CallKit/PushKit, session audio et routes, double appel, mise en attente, PiP système, sous-titres en direct, enregistrement avec consentement, partage d'écran, groupe en maillage, aperçu avant décroché, réponse rapide au refus), les effets vidéo (flou d'arrière-plan, teintes LUT, retouche de peau, effets de visage), la capture/montage avec 13 classiques et un catalogue de 146 cadres, le journal réseau et la fiche de détail d'appel.
Android possède déjà un appel 1:1 audio/vidéo réel : FSM pure, signalisation call:*, WebRtcEngine + coordinateur, budget de reconnexion, heartbeat, double appel, pastille réduite, historique, push FCM CallStyle avec dédup/annulation/décroché ailleurs. De nombreuses politiques pures de l'iOS sont portées dans core-model (CallReliabilityPolicy, VideoSurvival, VideoSenderCap, DataChannelCodec, CallCaptions, TelecomCallPolicy, VideoFilterConfig) mais NON câblées, et deux actionneurs sont des stubs (TelecomCallReporter ne fait que journaliser, CallQualitySampler est no-op donc l'indicateur de signal ne s'affiche jamais).
Écarts bloquants à traiter d'abord (P0) : aucun service de premier plan ni ConnectionService (Android 14+ coupe micro/caméra en arrière-plan), aucune statistique WebRTC, pas de sélecteur de sortie audio/Bluetooth ni de gestion du focus audio, pas de bascule caméra ni de passage audio vers vidéo en cours d'appel, refus du micro silencieux, aucune surveillance réseau pour la reconnexion.
Entièrement absents : mise en attente et DTMF, PiP système, sous-titres locaux, enregistrement avec consentement, partage d'écran, appels de groupe, réactions et modération, aperçu avant décroché, réponse rapide au refus, note post-appel, effets de visage, montage et cadres de capture, fiche de détail d'appel, journal réseau, lien d'appel avec confirmation.
Couverture estimée de la partie : environ 25 % des comportements iOS ; effort total estimé à environ 37 000 lignes Kotlin (dont environ 12 000 pour les fonctions P2 de capture, cadres, effets vidéo et aperçu).

**calls#2** (couverture Android estimée ≈ 9 %)

Cette partie couvre l'écran d'appel iOS (CallView et ses extensions), son modèle d'interaction (pilule de commandes à familles, couches panneau/mode, chrome qui se masque au toucher), le moteur WebRTC P2P (P2PWebRTCClient, maillage de groupe, PiP système), les politiques de qualité/fiabilité, ainsi que l'ensemble créatif (effets caméra, montage, cadres peints, cadre en direct) et les modèles/services SDK d'appel (historique, journal réseau, transcription, permission, règles).
Sur iOS, un appel est une surface sombre épinglée, très riche : (…) à deux rangées par famille, vignette perso déplaçable/pinçable, zoom caméra, sous-titres traduits par locuteur avec journal, enregistrement avec consentement, partage d'écran, réactions, modération, bulle repliable à 4 paliers, PiP système, note d'après-appel, feuille de qualité et journal réseau.
Android (feature/calls + core/model/call + sdk-core/call) offre un appel 1:1 minimal et fiable côté signalisation : écran avec rangée plate (micro, haut-parleur, caméra, raccrocher), vidéo distante plein cadre et vignette fixe, bannière d'appel en attente (15 s), pilule de retour, relance sur échec, historique, FSM et watchdogs.
Beaucoup de politiques pures iOS sont déjà portées dans :core:model (seuils de qualité, CallStats.reduce, survie vidéo, plafond thermique, filtres, DataChannelCodec, captions) mais restent SANS consommateur : l'échantillonneur de qualité est un Noop, aucun data channel n'est créé, aucune statistique WebRTC n'est lue.
Absents côté Android : groupe/maillage, PiP système, bulle, retourner la caméra, zoom, partage d'écran, enregistrement, réactions/invitations/modération, refus par message, aperçu avant décrochage, sous-titres locaux et journal, historique de transcription, journal réseau, feuille qualité, note d'après-appel, effets/montage/cadres, permission de lancement (canStartCall), profil de données et tuning SDP/codec.
Ordre conseillé : socle WebRTC (stats, data channel, flip, codecs, ICE refresh) puis coque d'écran (fond sombre, pilule, chrome, vignette), puis groupe, puis fonctions sociales (sous-titres, enregistrement, partage, réactions), puis la couche créative (effets, montage, cadres) en dernier. Gel levé par la directive #11570 (2026-10-22).

## Notes transverses

VOLUME ET ORDRE. 65 lots, environ 75 000 lignes Kotlin (dont environ 22 000 de P2 créatif : effets, cadres, montage). Ordre conseillé par vague. V0 (sans dépendance, en parallèle) : calls-foundation-app-seams, calls-foundation-engine-seams, calls-social-socket-events, calls-database-schema-v17, calls-small-laws-duration-rules-permission, calls-frame-catalogue-and-layout. V1 : les lois et le socle P0 (controls-layers-laws, engine-peer-core, live-stats, audio-routing, foreground-service, screen-shell-and-states, call-waiting-banner, history-filters, teardown). V2 : negotiation-hardening puis camera-switch-and-video-upgrade, reliability-monitor, incoming-ring-and-tones, controls-pill-ui, duo-video-stage. Le reste suit le graphe depends_on. Un lot P0 n'est jamais bloqué par un lot P1/P2 (les couches de contrôle passent par des coutures : CallVideoHealth, CallActionHandler).

DEUX LOTS DE COUTURE RENDENT LE PARALLÉLISME POSSIBLE. CallViewModel (872 l.), CallScreen (564 l.), WebRtcCallCoordinator (393 l.), WebRtcEngine (263 l.) et CallSignalManager (514 l.) seraient autrement touchés par 40 lots. calls-foundation-app-seams installe CallFeatureController (logique, Hilt @IntoSet), CallOverlay (UI par slot et priorité, @IntoSet), CallActionHandler (@IntoMap par CallAction), CallToastBus, CallHaptics, CallVideoHealth et découpe le coordinateur en CallNegotiator / CallAudioSession / CallIceStateMonitor. calls-foundation-engine-seams découpe le moteur en CallMediaSources / CallPeerHandle / flux d'événements / LocalSdpTransformer et rend EglBase paresseux. calls-social-socket-events concentre TOUS les nouveaux call:* dans un CallSocialSignalManager : plus aucun lot ne touche CallSignalManager. Règle : un lot ajoute des fichiers et se branche par ces registres ; il ne retouche CallViewModel/CallScreen que s'il est le propriétaire déclaré de la chaîne (voir ci-dessous).

FICHIERS CHAUDS ET CHAÎNES SÉRIE (garantie : deux lots sans lien de dépendance ne touchent pas le même fichier). CallViewModel.kt : app-seams puis negotiation-hardening (accept) puis outgoing-preflight (start/retry). CallNegotiator.kt : negotiation-hardening puis camera-switch-and-video-upgrade puis screen-share. CallAudioSession.kt : audio-routing puis telecom / incoming-ring. CallScreen.kt : propriétaire unique screen-shell-and-states (tous les autres s'inscrivent par CallOverlay). MeeshyApp.kt / MainActivity.kt / AndroidManifest.xml de l'app : propriétaire presentation-host (attributs d'Activity showWhenLocked, turnScreenOn, supportsPictureInPicture, configChanges posés une fois) ; le filtre meeshy:// existant sans host capte déjà meeshy://call. MeeshyFcmService.kt : incoming-ring-and-tones puis decline-with-quick-reply (fabrique de notification) puis external-call-triggers. ChatScreen.kt/ChatViewModel.kt : join-and-return-entry-points puis group-stage-and-start. Room : un seul lot (database-schema-v17) bumpe la version 16 vers 17 ; history/journal/transcript n'y touchent plus. Strings : chaque lot crée son strings_calls_<zone>.xml (values, values-fr, -es, -pt) ; jamais le strings.xml partagé. Réseau : chaque lot crée son module Hilt d'API (nouveau fichier) au lieu d'éditer NetworkModule.kt. Manifeste calls : feature/calls/src/main/AndroidManifest.xml (nouveau, fusionné par AGP) porte services, récepteurs et permissions d'appel. libs.versions.toml et feature/calls/build.gradle.kts : ajouts de lignes seulement (core-telecom, ML Kit) par les lots telecom, video-effects et face-effects, sérialisés par dépendance.

CALL LAUNCHER. Les écrans chat, contacts, profil, conversations ne dépendent pas de feature:calls (règle : jamais feature vers feature) et :core:navigation est un squelette vide. calls-presentation-host crée l'interface CallLauncher dans :sdk-core (start, answer, reopen, join) et son implémentation dans feature:calls, liée par Hilt ; les ViewModels des autres features l'injectent, sans lambda supplémentaire dans MeeshyApp.

LOIS À MIROIRS. core:model/call est du Kotlin pur vérifiable en local par ./apps/android/meeshy.sh jvm-check : toute loi (durée, règles, négociation, qualité, profil de données, couches, légendes, mesh de groupe, cadres, montage, enregistrement, préférences d'aperçu) y est écrite en TDD avant l'écran. Contrats TS/Swift/Kotlin : CallRules, CallPermission, seuils de qualité, catalogue de 146 cadres (tâche Gradle générant le Kotlin depuis packages/shared/design/call-capture-frames/*.json, test de fraîcheur) et frame-layout-fixture. Le reste (Compose, Hilt, Room, WebRTC) n'est prouvé que par la CI android.yml : aucun lot n'est vert sans run vert de sa PR.

RISQUES. (1) Android 14+ coupe micro et caméra en arrière-plan sans service de premier plan : calls-foreground-service est un P0 bloquant. (2) PiP : MainActivity est mono-activité, le PiP emmène toute l'Activity ; l'hôte de présentation doit n'y rendre que la vidéo distante. (3) SpeechRecognizer et micro WebRTC : exclusivité du micro ; privilégier EXTRA_AUDIO_SOURCE (API 33+), sinon dégrader en réception seule et le dire à l'utilisateur. (4) Sous-titres traduits et enregistrement passent par le serveur : dans une conversation chiffrée de bout en bout (directive 2026-10-03, #9224) ils doivent être refusés fail-closed avec message, à confirmer avec le porteur. (5) ML Kit / MediaPipe et MediaProjection alourdissent l'APK et la revue Play : modèles téléchargés à la demande. (6) Zoom : le Camera2Capturer de la lib WebRTC n'expose pas CONTROL_ZOOM_RATIO, capturer maison nécessaire. (7) core-telecom : tablettes sans téléphonie et ChromeOS doivent garder le flux in-app. (8) Sons de marque : les .caf iOS doivent être convertis en .ogg avant intégration. (9) Rétrocompatibilité prod (#9223) : tout nouveau call:* émis par Android doit être ignoré sans dommage par un ancien gateway, et tout payload inconnu reçu ignoré sans crash.

LOIS TRANSVERSES. Prisme : les sous-titres de l'appel affichent la traduction du lecteur avec l'étiquette « EN vers FR », original en un geste, jamais de traduction côté client ; les push d'appel arrivent localisés par le serveur ; la langue locale de reconnaissance vient de resolveUserLanguage. Accent : tout élément teinté de l'appel utilise DynamicColorGenerator.colorForName(pair), jamais une couleur de marque en dur (sémantique error/success/warning statique). Présence : la fiche de détail et les tuiles n'affichent un point que si le serveur l'a servi (amis acceptés) ; jamais de présence fabriquée ; offline = aucun point. Les 7 langues : les modules calls n'ont aujourd'hui que en, fr, es, pt ; compléter est un travail de localisation transverse, pas de ce domaine.

HORS PÉRIMÈTRE / NOTES. calls-core-state-machine et calls-call-waiting sont déjà largement couverts (FSM pure, banneau 15 s) : seuls leurs écarts sont repris. CallDebugIncomingTrigger.swift (recette debug) a pour équivalent un récepteur de broadcast debug-only, inclus dans calls-incoming-ring-and-tones. Dépendances externes déclarées : ext:playback-coordinator (API commune duck/pause des lecteurs chat, reels, stories), ext:chat-outbox-send (OutboxRepository, existe), ext:story-text-styles (polices et 18 styles de texte du composer, nécessaires aux noms des cadres), ext:chat-bubble-system-message-slot (famille de bulles sdk-ui pour la bulle d'appel).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `calls-audio-routing-and-picker` | A | P0 | L | 1550 | calls-foundation-app-seams | Je choisis où sort le son (écouteur, haut-parleur, Bluetooth, casque, voiture) et le son ne se perd jamais après une interruption |
| `calls-camera-switch-and-video-upgrade` | A | P0 | L | 1800 | calls-foundation-app-seams, calls-foundation-engine-seams, calls-negotiation-hardening | Je retourne ma caméra, je passe de l'audio à la vidéo en plein appel, et une caméra refusée bascule en audio |
| `calls-controls-layers-laws` | A | P0 | M | 700 | calls-foundation-app-seams | Les commandes de l'appel et leurs couches obéissent à des règles pures : une seule chose ouverte à la fois |
| `calls-controls-pill-ui` | A | P0 | L | 1300 | calls-controls-layers-laws, calls-screen-shell-and-states, calls-audio-routing-and-picker | Une pilule de commandes (… · Micro · Sortie · Fin) déploie « Mon image » et « L'appel » ; toucher la scène masque le chrome |
| `calls-duo-video-stage-and-self-tile` | A | P0 | L | 1500 | calls-screen-shell-and-states, calls-controls-layers-laws | En duo, la vidéo du correspondant occupe tout l'écran et ma vignette se déplace, se pince et permute |
| `calls-engine-peer-core-and-datachannel` | A | P0 | L | 1150 | calls-foundation-engine-seams, calls-foundation-app-seams | Le lien WebRTC s'établit à coup sûr : médias dans les deux sens, descriptions rejouées sans erreur, raccrochage instantané par canal direct |
| `calls-foreground-service-and-ongoing-notification` | A | P0 | L | 1000 | calls-foundation-app-seams, calls-small-laws-duration-rules-permission | L'appel reste vivant en arrière-plan avec une notification « appel en cours » (chrono, Raccrocher, retour à l'app) |
| `calls-foundation-app-seams` | A | P0 | L | 800 |  | L'appel s'étend par des points d'extension : chaque capacité ajoute ses contrôleurs, couches et actions sans toucher au cœur |
| `calls-foundation-engine-seams` | A | P0 | M | 600 | socket-connexion-jeton-identite-idempotente | Le moteur d'appel ne naît qu'au premier appel et offre des prises propres à toute la pile |
| `calls-incoming-ring-and-tones` | A | P0 | L | 1100 | calls-foundation-app-seams, calls-audio-routing-and-picker, socle-pipeline-push-et-cycle-de-vie | Un appel entrant sonne même app fermée, jamais deux fois, jamais en fantôme, avec les sons de la marque |
| `calls-live-stats-and-quality-laws` | A | P0 | L | 1500 | calls-foundation-app-seams, calls-foundation-engine-seams | La qualité de l'appel se mesure toutes les 5 s et alimente le signal, les rapports serveur et les alertes |
| `calls-negotiation-hardening` | A | P0 | L | 1300 | calls-foundation-app-seams, calls-engine-peer-core-and-datachannel | Décrocher marche même après un démarrage à froid, et la négociation survit aux collisions, retards et rejeux |
| `calls-outgoing-preflight-and-ring-guard` | A | P0 | M | 700 | calls-negotiation-hardening, calls-small-laws-duration-rules-permission, calls-camera-switch-and-video-upgrade, calls-foundation-app-seams | Je lance un appel : le micro est demandé d'abord, un refus est dit clairement, et un appel sans réponse se range en manqué |
| `calls-reliability-monitor-and-network-watch` | A | P0 | L | 1100 | calls-foundation-app-seams, calls-foundation-engine-seams, calls-small-laws-duration-rules-permission, calls-engine-peer-core-and-datachannel, calls-live-stats-and-quality-laws | Une coupure réseau ne tue pas l'appel : reconnexion automatique avec recul et auto-guérison d'un lien à moitié ouvert |
| `calls-screen-shell-and-states` | A | P0 | L | 1700 | calls-foundation-app-seams, calls-small-laws-duration-rules-permission | L'écran d'appel est un plein écran sombre aux états dessinés : sonnerie, connexion, fin et appel entrant |
| `calls-small-laws-duration-rules-permission` | A | P0 | S | 400 |  | Durée lisible « 02:05 » et prononçable, délais d'appel identiques à iOS et au web, droit de lancer un appel |
| `calls-social-socket-events` | A | P0 | M | 900 |  | Tous les événements sociaux d'un appel arrivent et partent : enregistrement, réactions, invitations, modération, aperçu, cadre, sous-titres, partage d'écran |
| `calls-adaptive-encoding-and-data-profile` | A | P1 | L | 1400 | calls-engine-peer-core-and-datachannel, calls-live-stats-and-quality-laws | L'appel s'encode au mieux selon le réseau : Opus voix, H264 d'abord, débit piloté par le profil de données |
| `calls-bubble-and-minimized-pill` | A | P1 | L | 1500 | calls-presentation-host, calls-signal-glyph-header-and-quality-sheet, socle-points-d-extension-de-l-app, calls-foundation-app-seams | Je réduis l'appel en bannière ou en bulle flottante que je déplace, agrandis et rouvre d'un tap |
| `calls-call-waiting-banner` | A | P1 | M | 500 | calls-foundation-app-seams | Un second appel pendant un appel s'annonce par une bannière : refuser, ou raccrocher l'actuel et répondre |
| `calls-camera-rail-controls` | A | P1 | M | 650 | calls-duo-video-stage-and-self-tile, calls-controls-pill-ui, calls-camera-switch-and-video-upgrade | Les commandes de ma caméra (Effets, Écran, Retourner, Caméra) se placent autour de ma vignette |
| `calls-core-telecom-integration` | A | P1 | L | 1300 | calls-foreground-service-and-ongoing-notification, calls-audio-routing-and-picker, dependances-gradle-scene-medias | L'appel s'intègre à l'interface téléphonique du système : écran verrouillé, Bluetooth, montre, voiture |
| `calls-database-schema-v17` | A | P1 | M | 600 | persist-room-migrations | Le journal d'appels garde en local participants, réactions, journal réseau et transcriptions |
| `calls-detail-sheet` | A | P1 | M | 900 | journal-appels-ui, calls-dial-from-anywhere, calls-small-laws-duration-rules-permission | Ouvrir le détail d'un appel du journal : qui, quand, durée, données, participants, réactions, et rappeler en un tap |
| `calls-dial-from-anywhere` | A | P1 | L | 1250 | calls-presentation-host, calls-small-laws-duration-rules-permission, profile-own-page-split | Appeler un contact depuis un profil, un contact ou le journal, même juste après le lancement de l'app |
| `calls-group-mesh-engine` | A | P1 | L | 1900 | calls-foundation-engine-seams, calls-engine-peer-core-and-datachannel, calls-negotiation-hardening, calls-small-laws-duration-rules-permission, calls-foundation-app-seams | Participer à un appel de groupe en maillage où chacun voit et entend tous les autres (jusqu'à 6) |
| `calls-group-stage-and-start` | A | P1 | L | 1600 | calls-group-mesh-engine, calls-controls-layers-laws, calls-duo-video-stage-and-self-tile, calls-join-and-return-entry-points, calls-presentation-host, composer-glass-shell, chat-viewmodel-state-split, calls-foundation-app-seams | La grille d'un appel de groupe montre tous les participants, l'orateur actif, et on lance ou rejoint un groupe d'un tap |
| `calls-hold-and-dtmf` | A | P1 | M | 450 | calls-core-telecom-integration, calls-camera-switch-and-video-upgrade, calls-thermal-and-video-survival, calls-audio-routing-and-picker | Un appel GSM ou une alarme met mon appel en attente, la vidéo se coupe proprement et le clavier DTMF fonctionne |
| `calls-incoming-decline-with-quick-reply` | A | P1 | M | 800 | calls-incoming-ring-and-tones, calls-screen-shell-and-states, persist-messages-envoi-optimiste | Refuser un appel en envoyant un message rapide (« Je te rappelle », « Je suis en réunion »…) |
| `calls-join-and-return-entry-points` | A | P1 | L | 1400 | calls-small-laws-duration-rules-permission, calls-resume-policy-and-launch-resume, calls-presentation-host, composer-glass-shell, chat-viewmodel-state-split, liste-decoupage-viewmodel | Le bouton d'appel de l'en-tête devient « retour à l'appel » ou « Rejoindre », et la liste et la bulle proposent de rejoindre |
| `calls-live-captions-panel-ui` | A | P1 | L | 1000 | calls-live-transcription-and-merge-laws, calls-controls-pill-ui | Des sous-titres traduits s'affichent pendant l'appel, par locuteur, avec un journal de toutes les phrases |
| `calls-live-transcription-and-merge-laws` | A | P1 | L | 1500 | calls-social-socket-events, calls-engine-peer-core-and-datachannel, calls-audio-routing-and-picker, reco-vocale-sur-appareil, calls-foundation-app-seams | Je transcris ma voix sur l'appareil pour que chacun lise mes phrases traduites, sans jamais traduire côté client |
| `calls-media-projection-service` | A | P1 | M | 450 | calls-foreground-service-and-ongoing-notification | Partager l'écran ou l'enregistrer demande l'accord du système et affiche un voyant visible |
| `calls-participant-controls-and-reactions` | A | P1 | L | 1800 | calls-social-socket-events, calls-group-mesh-engine, calls-controls-pill-ui, calls-group-stage-and-start, reseau-pipeline-reessai-erreurs, calls-foundation-app-seams | Je réagis par emoji flottants, j'invite des amis dans l'appel et je modère les participants |
| `calls-presentation-host` | A | P1 | L | 1000 | calls-foundation-app-seams, calls-screen-shell-and-states, socle-points-d-extension-de-l-app | L'écran d'appel s'affiche au-dessus de tout, même d'une story, d'une feuille ou de l'écran verrouillé |
| `calls-recording-capture-and-upload` | A | P1 | L | 1800 | calls-recording-consent-flow, calls-media-projection-service, calls-foundation-engine-seams, calls-audio-routing-and-picker | L'enregistrement capte l'audio de l'appel (et l'écran en vidéo) et le dépose dans la conversation |
| `calls-recording-consent-flow` | A | P1 | L | 1600 | calls-social-socket-events, calls-controls-pill-ui | Enregistrer l'appel demande l'accord de tous, avec un voyant visible pour tous |
| `calls-resume-policy-and-launch-resume` | A | P1 | M | 750 | calls-foundation-app-seams, calls-teardown-and-offline-reconcile, socle-points-d-extension-de-l-app | Reprendre un appel en cours après un plantage de l'app, et dire à la passerelle ce qui s'est passé quand on renonce |
| `calls-screen-share` | A | P1 | L | 1700 | calls-media-projection-service, calls-camera-switch-and-video-upgrade, calls-adaptive-encoding-and-data-profile, calls-social-socket-events, calls-duo-video-stage-and-self-tile, calls-controls-pill-ui, calls-foundation-app-seams | Je partage mon écran pendant l'appel et je vois celui de l'autre, avec bannière « Vous partagez votre écran » |
| `calls-signal-glyph-header-and-quality-sheet` | A | P1 | L | 1300 | calls-live-stats-and-quality-laws, calls-screen-shell-and-states, calls-controls-layers-laws, calls-small-laws-duration-rules-permission | Un glyphe de signal et une puce de durée ouvrent le détail chiffré de la qualité de l'appel |
| `calls-summary-metadata-bubble` | A | P1 | M | 650 | calls-small-laws-duration-rules-permission, calls-join-and-return-entry-points, chat-bulle-avis-systeme-supprime-arrivee, composer-glass-shell, chat-bulle-decoupage-composants | La bulle d'appel dans la conversation montre sens, média, issue, durée, données et qualité |
| `calls-system-pip` | A | P1 | M | 700 | calls-presentation-host, calls-duo-video-stage-and-self-tile, calls-controls-pill-ui, calls-thermal-and-video-survival, socle-points-d-extension-de-l-app | Quitter l'app pendant un appel vidéo garde l'image de l'autre dans une petite fenêtre flottante du système |
| `calls-teardown-and-offline-reconcile` | A | P1 | M | 750 | calls-foundation-app-seams, calls-live-stats-and-quality-laws | Raccrocher laisse toujours l'autre côté dans un état propre, même hors ligne, et la qualité est journalisée |
| `calls-thermal-and-video-survival` | A | P1 | M | 800 | calls-adaptive-encoding-and-data-profile, calls-live-stats-and-quality-laws, calls-foundation-app-seams | Quand le réseau ou l'appareil chauffe, la vidéo se fige sans couper l'appel puis reprend d'elle-même |
| `calls-camera-zoom` | A | P2 | M | 800 | calls-camera-switch-and-video-upgrade, calls-camera-rail-controls | Pincer ma caméra zoome, avec puces d'objectifs (0,5x, 1x, 2x) et pastille « 2x » |
| `calls-capture-controller-and-identities` | A | P2 | L | 1150 | calls-foundation-engine-seams, calls-frame-catalogue-and-layout, calls-face-effects | Je fige un instant de l'appel : photo de tous les participants ou portrait de chaque visage, enregistrés dans la galerie |
| `calls-color-looks-and-skin` | A | P2 | L | 1100 | calls-video-effects-pipeline-and-blur, calls-face-effects | Retoucher ma vidéo en direct : teintes (naturel, chaud, froid, vif, atténué), teint naturel, peau lissée, cernes relevés |
| `calls-effects-mode-ui` | A | P2 | L | 1800 | calls-controls-pill-ui, calls-video-effects-pipeline-and-blur, calls-face-effects, calls-color-looks-and-skin, calls-duo-video-stage-and-self-tile | Le mode « Effets de ma caméra » libère l'écran : carrousel Visage / Couleur, photo, film et validation |
| `calls-external-call-triggers` | A | P2 | M | 950 | calls-dial-from-anywhere, calls-incoming-ring-and-tones, socle-pipeline-push-et-cycle-de-vie | Rappeler d'un geste depuis la notification d'appel manqué, l'assistant système ou un lien d'appel confirmé |
| `calls-face-effects` | A | P2 | XL | 2100 | calls-video-effects-pipeline-and-blur, dependances-gradle-scene-medias | Des effets de visage ludiques en direct (crapaud, ange, démon, volcan) qui suivent mon visage sans retard |
| `calls-feedback-rating` | A | P2 | M | 800 | calls-reliability-monitor-and-network-watch, calls-teardown-and-offline-reconcile, calls-presentation-host | Après un appel difficile (ou un sur cinq), une note rapide de qualité est proposée au plus une fois par jour |
| `calls-frame-catalogue-and-layout` | A | P2 | L | 2000 |  | Choisir parmi 146 cadres décoratifs (12 ambiances) pour habiller la capture d'un appel de 2 à 12 personnes |
| `calls-frame-renderer-core` | A | P2 | L | 1300 | calls-frame-catalogue-and-layout | Les cadres décoratifs sont peints à l'identique partout : fonds, motifs, bordures, formes de cases |
| `calls-frame-renderer-names-text` | A | P2 | M | 900 | calls-frame-renderer-core, texte-de-scene-18-styles-et-effets | Les noms et textes des cadres s'écrivent avec les bonnes polices, et les vignettes de cadres restent légères |
| `calls-frame-renderer-ornaments` | A | P2 | L | 1300 | calls-frame-renderer-core | Les 34 ornements animés des cadres (ballons, pétales, couronne, ruban, bougies, chauves-souris…) sont dessinés comme sur iOS |
| `calls-live-frame-duo` | A | P2 | L | 2000 | calls-social-socket-events, calls-frame-catalogue-and-layout, calls-frame-renderer-core, calls-duo-video-stage-and-self-tile, calls-thermal-and-video-survival | En appel vidéo à deux, un cadre décoratif en direct entoure les deux vidéos et se propose à l'autre |
| `calls-montage-film-recorder` | A | P2 | M | 800 | calls-capture-controller-and-identities, calls-montage-layout-and-renderer, calls-audio-routing-and-picker | Un appui long filme le montage de l'appel en un court film avec le son |
| `calls-montage-layout-and-renderer` | A | P2 | XL | 2100 | calls-capture-controller-and-identities, calls-frame-renderer-core, calls-frame-catalogue-and-layout | Capturer l'appel compose une image montée dans l'un des 13 styles classiques ou dans un cadre |
| `calls-montage-mode-ui` | A | P2 | L | 1100 | calls-montage-layout-and-renderer, calls-montage-film-recorder, calls-frame-renderer-names-text, calls-effects-mode-ui, calls-controls-pill-ui | Le mode Montage propose styles, ambiances et cadres autour d'une scène 9:16 sans rien poser sur la scène |
| `calls-network-journal` | A | P2 | L | 1000 | calls-database-schema-v17, calls-live-stats-and-quality-laws, calls-detail-sheet, calls-reliability-monitor-and-network-watch | Le détail d'un appel montre le résumé et la chronologie de la qualité du lien |
| `calls-playback-ducking` | A | P2 | M | 450 | calls-foundation-app-seams, lecture-focus-audio-et-coordination-des-lecteurs | Un appel entrant baisse la vidéo ou le vocal en cours, les arrête au décroché et les rend à la fin |
| `calls-preview-before-answer` | A | P2 | L | 1900 | calls-social-socket-events, calls-foundation-engine-seams, calls-engine-peer-core-and-datachannel, calls-negotiation-hardening, calls-screen-shell-and-states | Avant de décrocher, je vois et entends l'appelant, et lui choisit ce qu'il laisse voir |
| `calls-transcript-history` | A | P2 | M | 700 | calls-database-schema-v17, calls-live-transcription-and-merge-laws, calls-teardown-and-offline-reconcile, calls-detail-sheet | Après l'appel, je relis la transcription dans le détail de l'appel |
| `calls-video-effects-pipeline-and-blur` | A | P2 | L | 2000 | calls-foundation-engine-seams, calls-camera-switch-and-video-upgrade, calls-thermal-and-video-survival, dependances-gradle-scene-medias, calls-foundation-app-seams | Je floute l'arrière-plan de ma caméra pendant l'appel sans faire ramer la vidéo |

### Lots fusionnés ou retirés par l'architecture

- `calls-history-filters-search-hide` → `journal-appels-ui` (merge-into) : Même journal d'appels filtré / cherché / nettoyé. Hérite : calls-database-schema-v17.

## Features

### Les commandes de ma caméra (Effets, Écran, Retourner, Caméra) se placent autour de ma vignette

`call-camera-rail-controls` · Android : **absente** · P1 · effort M

Placement des commandes de MA caméra : autour de la vignette (Effets · Écran au-dessus, Retourner/choix de caméra · Caméra en dessous, cibles de 44 pt, jamais DANS la vignette) ; en haut au centre quand mon image est en plein écran (avec les puces de zoom) ; dans le (…) quand aucune vignette ne porte mon image (audio, caméra coupée, grille de groupe). Sur petite vignette, un seul bouton déplie la grille ; un toucher ailleurs la referme et est consommé. Les rangées suivent le glissé et le pincement de la vignette.

Écarts :
- Règle CallCameraRail.placement (selfTile, topCenter, menu) selon isMyImageFullScreen et showsMyImageTile, et ordre flip, picker, caméra, effets, écran.
- Deux rangées autour de la vignette qui suivent drag/pinch, bornées à la safe area (selfTileControlsBounds).
- Menu replié pour vignettes trop petites (foldedMenu) : bouton déployant, tap ailleurs consommé.
- Emplacement du zoom (puces d'objectifs en haut-centre, bouton cycle dans la vignette) quand le profil de zoom l'autorise.
- Actions Effets/Écran/Retourner/Caméra câblées sur les services (voir call-camera-capture-pipeline, call-effects-mode, call-screen-share) ; visibilité suivant le chrome.

Rendu : Boutons 44 dp en verre sombre, espacement serré, inset 4 dp de la vignette ; les rangées glissent avec la vignette sans jamais la couvrir.

Transposition Android : Compose: Layout custom ancré au rect de la vignette ; Box/Popup pour le menu replié.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallCameraControls.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+CameraRail.swift`

</details>

### Toucher la scène vidéo masque ou rend en fondu l'en-tête, la pilule et les panneaux

`call-chrome-auto-hide` · Android : **absente** · P1 · effort S

Sur une scène vidéo seulement (duo vidéo, ou groupe avec au moins une caméra), un toucher sur la scène masque en fondu de 0,25 s l'en-tête, la pilule, le panneau ouvert, le statut d'enregistrement et la bannière de partage ; un autre toucher les rend. Plus aucun masquage minuté (#8978). Les sous-titres et la carte de consentement d'enregistrement restent ; ma vignette se masque en mode plein écran. Un toucher reçu pendant le fondu de disparition rallume le chrome (revive) : un bouton encore visible répond encore. Le plein écran d'une vignette de groupe masque aussi les commandes ; une vignette touchée chrome masqué rallume les commandes. Désactivé en audio et sous VoiceOver (les contrôles restent).

Écarts :
- Type CallChromeVisibility (isRevealed, isStageFullScreen, isModeActive) + éléments (header, controls, openPanel, recordingStatus, recordingConsent, screenShareBanner, captions, selfView) et leurs règles de visibilité.
- Bascule au toucher limitée à isVideoStage (duo vidéo actif, ou groupe avec caméra) ; ignorée si TalkBack actif.
- Fondu 250 ms et fenêtre de grâce acceptsTouches pendant le fondu ; interaction revive qui rallume le chrome.
- GroupStageTapRule : chrome masqué => une vignette touchée rallume ; sinon elle passe à la une.
- Couplage avec la couche courante (un panneau ou un mode ouvert interdit le masquage).

Rendu : Fondu 0,25 s easeInOut, aucun mouvement ; les éléments masqués n'interceptent plus les touchers après le fondu.

Transposition Android : Modifier.alpha animé + pointerInput qui laisse passer pendant le fondu ; TalkBack via AccessibilityManager.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallChromeVisibility.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallChromeInteraction.swift`

</details>

### Je peux refuser un appel avec un message rapide ou écrit

`call-decline-with-message` · Android : **absente** · P1 · effort M

Depuis l'appel entrant, « Refuser avec un message » ouvre une feuille (détents moyen/grand) : réponses rapides localisées (CallDeclineQuickReply), champ libre (longueur bornée par CallDeclineReplyRule), bouton « Envoyer et refuser » désactivé (opacité .4) tant que le texte est vide, « Annuler ». L'action refuse l'appel ET envoie le message dans la conversation, étiqueté de la langue d'origine (première langue de contenu préférée, sinon langue d'interface).

Écarts :
- Bottom sheet Compose avec réponses rapides, champ de saisie borné, bouton d'envoi, Annuler (cibles 44 dp, hint a11y « Refuse l'appel et envoie ce message »).
- rejectCall(withReply, originalLanguage) : émettre le refus d'appel puis envoyer le message texte dans la conversation (file d'envoi/offline), avec originalLanguage.
- Action de notification « Répondre par message » (RemoteInput) en complément de « Refuser » dans DeclineCallReceiver ; Android refuse sans message aujourd'hui.
- Règle de longueur maximale et liste de réponses rapides partagées/localisées (calls#1 : CallDeclineQuickReply).

Rendu : Boutons rectangulaires 44 dp coins smPlus fond primary .06, champ de même style, CTA capsule error.

Transposition Android : presentationDetents -> ModalBottomSheet ; RemoteInput de la notification CallStyle.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallDeclineSheet.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`

### Les appels de groupe relient chaque membre en maillage P2P (jusqu'à 6 participants)

`call-group-mesh-peer-link` · Android : **absente** · P1 · effort L

WebRTCGroupPeerLink : une RTCPeerConnection vers UN membre, jumelle du peer-link web. Négociation parfaite (le plus petit identifiant est poli et cède en cas de collision d'offres), époque negotiationId (un signal plus ancien que la plus haute époque vue est écarté), file sérialisée, partage de la piste vidéo locale capturée par CallManager, activation audio/vidéo par lien, niveau audio (pour la mise à la une de l'orateur), canal de contrôle, mise à jour des serveurs ICE, fermeture propre. La fabrique crée tous les liens depuis la fabrique WebRTC du processus. Maillage sans SFU plafonné à 6 participants (CallRules.maxParticipants).

Écarts :
- Aucun appel de groupe sur Android (pas de GroupCall*, pas de grille de scène, pas de mesh coordinator).
- Peer link Kotlin : offer/receive(signal) avec perfect negotiation (id le plus petit = poli), negotiationId epoch, file séquentielle, ICE candidates par lien.
- Fabrique de liens partageant le PeerConnectionFactory et la piste locale ; setAudioEnabled/setVideoEnabled par lien ; audioLevel() via getStats ; sendControl sur data channel ; updateIceServers ; close.
- Coordinateur de maillage + roster + événements call:participant-joined/left et grille de scène (GroupCallStageView, hors périmètre ici), plafond 6 participants.
- Bannière/état de groupe dans l'écran d'appel (disposition par scène de groupe au lieu du duo).

Rendu : Grille de vignettes avec liseré de la couleur stable de chaque locuteur ; l'orateur actif à la une.

Transposition Android : RTCPeerConnection par lien -> PeerConnection par lien (stream-webrtc), PeerConnectionFactory partagée.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCGroupPeerLink.swift`

</details>

### Le son et la vidéo sont encodés au mieux (Opus voix, H264 d'abord, bitrate piloté)

`call-sdp-codec-sender-tuning` · Android : **absente** · P1 · effort M

Préférences de codec des transceivers : audio Opus puis RED, vidéo H264 > VP8 > VP9 ; règles SDP : transport-cc ajouté, indices de débit vidéo ; fmtp Opus voix (mono, DTX, FEC in-band, débit moyen borné) ; paramètres d'encodage appliqués à l'émetteur audio (maxBitrate) et vidéo (bitrate max, fps max, mise à l'échelle, préférence de dégradation maintain-framerate / maintain-resolution selon le profil).

Écarts :
- setCodecPreferences sur les RtpTransceiver : Opus puis RED en audio, H264 > VP8 > VP9 en vidéo.
- Mungeur SDP pur : transport-cc, hints de débit vidéo, fmtp Opus (maxaveragebitrate, stereo=0, useinbandfec=1, usedtx=1, maxplaybackrate) ; tests de contrat sur des SDP de référence.
- Application d'encodage à l'émetteur via RtpParameters (maxBitrateBps, maxFramerate, scaleResolutionDownBy, degradationPreference) pour audio et vidéo.
- Brancher VideoSenderCap (plafond thermique, déjà pur côté modèle) et le profil de données sur ces paramètres.
- Le DefaultVideoEncoderFactory est utilisé tel quel sans préférence de codec.

Transposition Android : RTCRtpTransceiver.setCodecPreferences / RTCRtpSender.parameters -> RtpTransceiver.setCodecPreferences / RtpSender.setParameters.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+CodecPreferences.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+SdpRules.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+SenderEncoding.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoDegradationPreference.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSenderCap.kt`

### Seuls ceux qui en ont le droit voient et peuvent lancer un appel dans une conversation

`call-start-permission` · Android : **absente** · P1 · effort S

Miroir de canStartCall (packages/shared/utils/call-permission.ts, #10207) : un invité sans compte ne lance jamais d'appel ; une conversation « global » n'a pas d'appel ; en « public », seulement le créateur, le rang creator/admin de la conversation ou un admin plateforme (ADMIN, BIGBOSS), pas un modérateur ; « direct » et « group » : tout membre ; tout autre type (broadcast, inconnu) : personne (échec fermé). Rejoindre un appel en cours n'est pas gouverné ici. Rôles comparés sans tenir compte de la casse.

Écarts :
- Porter CallPermission.canStartCall (Context : conversationType, viewerIsCreator, viewerConversationRole, viewerPlatformRole, viewerIsGuest) avec tests de contrat sur la même table que le TypeScript.
- Masquer/désactiver les boutons d'appel de l'en-tête de conversation (ChatScreen, onStartCall) quand le droit manque ; aujourd'hui toujours affichés.
- Messages d'erreur localisés si la passerelle refuse (call:error).
- Note : CallPermissions.kt actuel ne concerne que les permissions Android micro/caméra, pas ce droit.

Rendu : Bouton d'appel absent ou grisé selon le droit (jamais d'écran d'erreur au toucher).

Transposition Android : Fonction pure Kotlin dans :core:model (miroir).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallPermission.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPermissions.kt`

### La bulle d'appel dans la conversation montre sens, média, issue, durée, données et qualité

`call-summary-metadata` · Android : **absente** · P1 · effort S

Fait structuré porté par le message système de résumé d'appel (metadata.kind « call » terminal ou « call-live » en cours) : appel id, initiateur, type audio/vidéo, issue (terminé, manqué, refusé, échec), durée, octets (estimés ou mesurés, « ~ » si estimé), qualité réseau (poor, fair, good, excellent), « annulé par l'initiateur ». Le sens est résolu par spectateur, « Appel annulé » seulement chez l'initiateur, durée « 04:32 » (H:MM:SS au-delà d'une heure), données en unités décimales (KB/MB/GB) comme les opérateurs. Le décodeur ignore les autres metadata.

Écarts :
- Modèle Kotlin CallSummaryMetadata (kind call/call-live, MediaType, Outcome, NetworkQuality ordonnée, endedByInitiator) tolérant aux autres metadata de message.
- Helpers purs : isOutgoing(currentUserId), isCancelled(viewerIsInitiator), formatDuration (mm:ss / h:mm:ss, comme formatCallDuration de la passerelle), formatDataSize (décimal, ~ si estimé) + tests de contrat.
- Bulle d'appel riche dans le fil de chat (glyphe de média, teinte/rouge selon issue, ligne « durée · données · qualité », action rappeler/rejoindre) : rendu dans le domaine des bulles de chat (aujourd'hui aucun rendu dédié, le message tombe en texte).

Rendu : Teinte rouge pour manqué/refusé/échec, glyphe audio/vidéo, ligne secondaire durée · données · qualité.

Transposition Android : Struct Codable -> data class @Serializable avec déserialiseur sélectif sur kind.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallSummaryMetadata.swift`

</details>

### Sortir de l'app garde la vidéo de l'appel dans une fenêtre flottante système

`call-system-pip` · Android : **absente** · P1 · effort M

Le PiP système (AVPictureInPicture sur flux d'échantillons) montre la vidéo du correspondant au-dessus des autres apps : rendu SampleBuffer avec conversion NV12, rotation, cadence maximale réglable, placeholder quand la vidéo distante est coupée, ancre invisible plein écran pour la source. CallPiPPolicy décide : reconfigurer si source ou piste change ; démarrage manuel/automatique ; mode d'affichage après démarrage/arrêt ; glissé vers le bas = PiP système si possible sinon pilule ; repli sur la pilule si AVKit refuse au bout de 600 ms ; restauration du plein écran avant démontage quand l'appel finit pendant le PiP.

Écarts :
- Manifest : android:supportsPictureInPicture, configChanges (screenSize|smallestScreenSize|screenLayout|orientation) sur l'Activity d'appel.
- enterPictureInPictureMode(PictureInPictureParams) avec ratio 9:16 (setAspectRatio), setSourceRectHint, setAutoEnterEnabled(true) sur API 31+ pour l'entrée par geste Accueil, et RemoteActions micro/raccrocher.
- onPictureInPictureModeChanged : masquer tout le chrome, ne garder que la vidéo distante (ou avatar si coupée), rétablir au retour.
- Politique pure portée : displayModeOnStart/AfterStop, shouldFallBackToPill (si pas de fenêtre au bout de 600 ms -> pilule), swipeDownOutcome (course 300, 75 %, lancer) et shouldRestoreFullScreenBeforeTeardown à la fin d'appel.
- Audio->vidéo : n'activer le PiP automatique que pour un appel vidéo actif (canActivateSystemPiP) ; cadence max réglable et placeholder quand la caméra du pair est coupée.
- Action « PiP » dans la famille « L'appel » de la pilule (CallAction.pictureInPicture).

Rendu : Fenêtre 9:16 sans chrome, vidéo du pair uniquement ; actions système micro et raccrocher.

Transposition Android : AVPictureInPictureController -> Activity.enterPictureInPictureMode + PictureInPictureParams ; sample-buffer renderer -> SurfaceViewRenderer simple (pas de conversion) ; PiPSourceAnchor -> sourceRectHint.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/PiPCallController.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/PiPVideoRenderer.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/AVSampleBufferDisplayLayer+Meeshy.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoFrameConverter.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallPiPPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Views/PiPSourceAnchor.swift`
- `apps/ios/Meeshy/Features/Main/Views/PiPVideoSampleBufferView.swift`

</details>

### Ouvrir le détail d'un appel du journal : qui, quand, durée, données, participants, réactions, réseau, transcript, et rappeler en un tap

`calls-call-detail-sheet` · Android : **absente** · P1 · effort M

CallDetailSheet (feuille moyenne/grande, poignée visible) : en-tête avec avatar (contexte profileSheet, couleur d'accent déterministe par nom DynamicColorGenerator.colorForName — jamais une couleur de marque en dur —, humeur, présence connue), nom (title3 bold), ligne d'état « Entrant · il y a 2 h » avec glyphe appel/vidéo (rouge si manqué) ; deux boutons capsules « Appel vocal » / « Appel vidéo » (couleur d'accent, retour haptique moyen, composent via CallStarter puis ferment) ; carte de détails (Type, Date, Durée si non vide, Données si connues, Numéro si présent, Réactions « 👍 × 3 » #8439) avec icônes 24 pt d'accent ; section Participants d'un appel de groupe (nom + avatar, sans présence, lecteur exclu, #8066) ; section Réseau (journal, si non vide) ; section Transcript (CallTranscriptLoader) que l'on peut fermer. Plafond de largeur 560 pt (iPad/Mac).

Écarts :
- Aucune feuille de détail : un tap sur une ligne du journal rappelle directement (CallRoute.redial) sans passer par une fiche ; ajouter une ModalBottomSheet (medium/large) avec poignée.
- Modèle incomplet : CallRecord ne porte ni participants (groupe) ni réactions cumulées (reactionTally), ni nom d'utilisateur de l'appelant pour la ligne d'état relative ; compléter DTO + parsing.
- En-tête: avatar profileSheet avec humeur et présence (PresenceManager.knownPresenceState, avatar mood tap), accent déterministe, ligne d'état « <direction> · <date relative> » avec icône téléphone/vidéo, rouge pour un appel manqué.
- Deux boutons de rappel (audio/vidéo) en capsule d'accent, retour haptique, fermeture de la feuille ; désactivés si le pair est inconnu.
- Carte de détails: Type, Date (abrégée+heure), Durée (si non vide), Données (↑↓ si connues), Numéro (si présent), Réactions (« emoji × n »).
- Sections Participants (groupe), Réseau (journal) et Transcript (chargement asynchrone, fermeture) ; largeur max 560 dp sur tablettes.
- Accessibilité : lignes combinées, en-têtes de section, contrastes ; libellés localisés (Type, Date, Durée, Données, Numéro, Participants).

Rendu : Feuille aérée : avatar grand centré, nom en titre, ligne d'état muette (rouge si manqué), deux capsules d'accent côte à côte, carte arrondie (radius md, fond secondaire) à lignes icône d'accent 24 dp / libellé muet / valeur medium alignée à droite, sections empilées avec en-tête footnote semi-bold.

Transposition Android : presentationDetents([.medium,.large]) → ModalBottomSheet Material 3 avec skipPartiallyExpanded=false ; Locale/Date.formatted → DateFormat / java.time DateTimeFormatter localisé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Contacts/CallDetailSheet.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallRecord.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`

### Refuser un appel en envoyant un message rapide (« Je te rappelle », « Je suis en réunion »…)

`calls-decline-with-quick-reply` · Android : **absente** · P1 · effort M

CallDeclineQuickReply propose quatre réponses : « Je te rappelle. », « Je suis en réunion. », « Je ne peux pas parler pour l'instant. », « Écris-moi, je te réponds vite. » (+ rédiger soi-même). CallDeclineReplyRule construit un plan seulement si l'appel est refusable et que la conversation est connue, texte tronqué à 500 caractères et non vide. rejectCall(reply:) refuse l'appel puis CallDeclineMessenger envoie le message dans la conversation de l'appel : insertion optimiste dans la persistance + file hors ligne (OfflineQueue) avec langue d'origine, sans utilisateur actif le message est ignoré.

Écarts :
- Refuser ne propose aucun message : DeclineCallReceiver et le bouton Refuser coupent seulement l'appel.
- Feuille/puces de réponses rapides sur l'écran entrant (4 textes localisés + « Écrire un message ») ; équivalent notification : RemoteInput de réponse directe ou action « Message ».
- CallDeclineReplyRule (plan seulement si refusable + conversationId, 500 caractères max) et CallDeclineMessenger : insertion optimiste du message + file hors ligne, avec la langue d'origine de l'utilisateur.
- Garde : message ignoré sans utilisateur actif ; refus d'abord, message ensuite (le refus n'attend pas l'envoi).
- Localisation des quatre phrases (sept langues de l'app).

Rendu : Au-dessus du bouton Refuser, une rangée de puces « Message » s'ouvrant en feuille (4 phrases + champ libre) ; envoi optimiste sans écran supplémentaire.

Transposition Android : Réponse rapide iOS → chips Compose sur l'écran entrant + RemoteInput dans la notification CallStyle ; OfflineQueue → outbox (WorkManager) du module chat.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallDeclineReply.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallDeclineMessenger.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+DeclineReply.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### Participer à un appel de groupe en maillage où chacun voit et entend tous les autres

`calls-group-mesh-calls` · Android : **absente** · P1 · effort L

CallManager+GroupMesh : l'appelant d'un groupe garde remoteUserId = identifiant de la CONVERSATION (poignée CallKit) tant que personne n'a rejoint ; remoteUsername porte le TITRE du groupe. Un signal d'un membre AUTRE que le pair principal appartient au maillage (routesToGroupMesh) — le traiter dans la connexion principale la corromprait ; media-toggle d'un membre du maillage ne touche pas isRemoteVideoEnabled/AudioEnabled du principal. Quand le principal part, le groupe continue sans lui (#9085 : designateGroupPrimary, groupPrimaryDidVacate, bye in-band du principal seulement). startGroupCall(conversationId, title, isVideo) lance l'appel de groupe. GroupCallMeshBinding branche le maillage sur le gestionnaire et le socket.

Écarts :
- Aucun appel de groupe : WebRtcEngine gère UN PeerConnection ; il faut un maillage de PeerConnections (un lien par membre) avec routage des signaux call:signal par expéditeur.
- Désignation du pair principal et reprise quand il quitte (#9085) ; niveau audio du principal (primaryAudioLevel) pour le locuteur actif.
- Titre de groupe diffusé par socket (groupCallTitleDidChange), poignée de conversation avant le premier arrivant.
- Grille des participants (voir CallView, partie vue d'appel) : tuiles, locuteur actif, états micro/caméra par membre ; media-toggled de membres du maillage séparé du principal.
- startGroupCall(conversationId, title, isVideo) depuis l'en-tête d'un groupe ; rejoindre un groupe en cours (LiveCallJoiner groupe).
- Plafond de reconnexion en groupe : quitter (call:leave) plutôt que raccrocher pour tous.
- Limites de participants et dégradation (qualité par pair) pour un maillage à N liens.

Rendu : Grille adaptative 2–12 tuiles (1×2, 2×2, 2×3, 3×4) avec bordure accent sur le locuteur actif, nom + états micro/caméra par tuile, titre du groupe dans l'en-tête.

Transposition Android : GroupPeerLinkFactory/GroupCallMeshBinding → classe GroupCallMesh (map userId → PeerLink) dans sdk-core, branchée sur CallSignalManager ; CallKit handle conversation → identifiant de conversation dans core-telecom.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+GroupMesh.swift`

</details>

### Un autre appel (GSM) met mon appel en attente et le reprend ensuite, la vidéo se coupe proprement pendant l'attente

`calls-hold-and-dtmf` · Android : **absente** · P1 · effort S

handleHold(isOnHold) (CXSetHeldCallAction) suspend l'envoi vidéo sortant pendant la mise en attente pour que le pair voie « caméra coupée » plutôt qu'une image figée, conserve l'intention vidéo de l'utilisateur et reprend automatiquement à la reprise sauf si la survie vidéo ou l'arrière-plan la suspend aussi ; le toast « Vidéo indisponible pendant la mise en attente de l'appel » protège la bascule vidéo. sendDTMF relaie le clavier CallKit (CXPlayDTMFCallAction) vers WebRTC.

Écarts :
- Aucun état « en attente » (isOnHold) : à l'arrivée d'un appel GSM ou d'une alarme, l'app Android ne suspend ni l'audio ni la vidéo et le pair ne sait rien ; ajouter l'état et l'indicateur « En attente ».
- Suspension vidéo pendant l'attente avec call:toggle-video(false) au pair, indicateur isVideoSuspendedByHold, reprise automatique conditionnée (survie vidéo, arrière-plan).
- Toast « Vidéo indisponible pendant la mise en attente de l'appel » quand l'utilisateur tente d'activer la caméra en attente.
- Relais DTMF vers la couche WebRTC (RtpSender.dtmf().insertDtmf) pour les claviers de voiture/montre.
- Mettre en attente depuis l'UI système (Telecom onSetInactive) et depuis l'écran de verrouillage.

Rendu : Libellé « En attente » en surimpression au centre, vidéo locale/distante en repli avatar, bouton micro/caméra désactivés visuellement (opacité réduite).

Transposition Android : CXSetHeldCallAction → core-telecom onSetInactive/onSetActive (hold/unhold) + AudioFocus perdu (AUDIOFOCUS_LOSS_TRANSIENT) ; CXPlayDTMFCallAction → RtpSender.dtmf().insertDtmf(tones, duration, gap).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Hold.swift`

</details>

### Inviter, couper ou retirer un participant, et lancer des réactions emoji flottantes pendant l'appel

`calls-participant-controls-reactions` · Android : **absente** · P1 · effort M

CallControlsController (singleton, hôte CallControlsHosting) : invitations en cours (CallPendingInvite : la tuile « sonne » jusqu'à ce que l'invité décroche ou que l'invitation expire/soit déclinée), mute d'un participant par un modérateur (call:mute-participant → call:muted-by-moderator côté cible, applyModeratorMute coupe son micro par le chemin ordinaire), retrait d'un participant (REST), réactions émoji flottantes (call:reaction / call:reaction-received) limitées à 5 envois sur une seconde glissante, vol de 2,5 s, couloir horizontal aléatoire 0,15–0,85, capsule d'auteur (moi / pair nommé / quelqu'un). CallModerationRule : seul l'initiateur actif ou un modérateur et plus de la conversation modère, jamais soi-même (miroir client de mayModerateCallParticipant ; la passerelle tranche). Avis localisés : mutedBy, inviteFailed, actionFailed, removed, inviteDeclined, inviteUnanswered. Le total des réactions est affiché dans le détail d'appel (« 👍 × 3 »).

Écarts :
- Aucun des événements call:invite-participant, call:participant-invited, call:invite-declined, call:invite-expired, call:mute-participant, call:muted-by-moderator, call:reaction, call:reaction-received côté Android (CallSocketEvents ne les porte pas).
- Contrôleur d'invitations (liste, expiration, déclin), UI d'invitation (choix de contacts), tuile « sonne ».
- Modération : règle CallModerationRule (initiateur actif ou rôle modérateur+) et actions mute/retirer, avec avis « X vous a coupé le micro » / « X a été retiré ».
- Réactions : palette d'emoji, envoi limité à 5/s (fenêtre glissante), animation flottante 2,5 s à couloir aléatoire, capsule d'auteur ; compteur cumulé enregistré pour le détail d'appel.
- Avis d'erreur localisés par code (inviteFailed / actionFailed).
- Dépend du maillage de groupe pour les cas multi-participants.

Rendu : Barre de réactions sous la pilule de commandes (emoji en ligne), emoji qui montent et s'estompent sur 2,5 s avec capsule du nom dessous ; carte de modération dans le menu d'un participant (Couper le micro, Retirer).

Transposition Android : Combine publishers → Flow/StateFlow ; animations flottantes → Compose Animatable + graphicsLayer ; modération → REST du SDK + événements socket.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallControlsController.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Controls.swift`

</details>

### Enregistrer un appel audio ou vidéo seulement avec l'accord de tous, avec un indicateur visible pour tous

`calls-recording-with-consent` · Android : **absente** · P1 · effort L

CallRecordingController (#8064) : demander (call:recording-request, audio ou vidéo), consentir (call:recording-consent), montrer à TOUS qu'on enregistre, capter chez le demandeur, déposer le fichier et le rattacher à la bulle de l'appel. La passerelle est l'autorité : le contrôleur ne démarre jamais la capture de sa propre décision, seule la diffusion call:recording-started qui nomme ce lecteur comme enregistreur l'allume ; toute diffusion d'arrêt (refus, délai, arrivée d'un participant, fin d'appel) l'éteint ; une diffusion d'un autre appel est ignorée. Phases idle / asking / pending / recording ; avis stopped / unavailable / saved / saveFailed ; fichier .m4a (audio/mp4) ou .mp4 (vidéo/mp4) téléversé en tus puis lié à la bulle (3 tentatives à 2 s sur 409 CALL_BUBBLE_MISSING). CallRecordingService capte le micro + audio de l'app (tap AVAudioEngine) ; CallScreenRecordingService enregistre l'écran via ReplayKit (pistes vidéo, audio app, micro) et mixe les pistes audio en une.

Écarts :
- Aucun événement call:recording-* (request, consent, requested, started, stopped) ni contrôleur de phases ; implémenter le miroir du contrôleur web call-recording.ts.
- Carte d'accord pour les participants (« X demande à enregistrer cet appel »), avec accepter/refuser et obligation de répondre (mustAnswer), indicateur d'enregistrement visible pour tous, avis de fin localisés.
- Capture audio : mixer micro local + audio distant (JavaAudioDeviceModule setSamplesReadyCallback / playback samples) en M4A AAC ; vérifier le format du tap avant démarrage (AudioTapFormatReadiness, #7002).
- Capture vidéo : MediaProjection + service de premier plan type mediaProjection + MediaRecorder/MediaCodec, taille déduite des images capturées (pas de l'écran physique : tablette en paysage, multi-fenêtre), pistes audio app+micro mixées.
- Téléversement tus (TusUploadManager) et rattachement à la bulle avec réessai sur 409 CALL_BUBBLE_MISSING (3 × 2 s) ; fichier temporaire supprimé.
- Bouton d'enregistrement proposé seulement une fois l'appel établi ; demande refusée si groupe ou serveur indisponible (code unavailable).
- Rien ne démarre sans l'événement serveur qui nomme l'enregistreur ; arrêt sur départ/arrivée d'un participant.

Rendu : Pastille rouge « REC » pulsante visible de tous dans l'en-tête, carte de consentement modale (titre, deux boutons Accepter/Refuser), toasts « Enregistrement enregistré » / « Échec de l'enregistrement ».

Transposition Android : ReplayKit RPScreenRecorder → MediaProjection (+ foregroundServiceType=mediaProjection) ; AVAudioEngine tap → AudioRecord / JavaAudioDeviceModule samples callbacks ; export AVAssetExportSession → MediaCodec + MediaMuxer ; TusUploadManager → client tus du SDK Android (à créer s'il manque).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallRecordingController.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallRecordingService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallScreenRecordingService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Recording.swift`

</details>

### Partager mon écran pendant l'appel et voir un écran partagé par l'autre

`calls-screen-share` · Android : **absente** · P1 · effort L

CallScreenShareController orchestre le partage d'écran via une extension de diffusion système : ouvre le socket local AVANT que le sélecteur système ne lance l'extension, reçoit début/fin par notifications Darwin, remplace la piste caméra par la piste d'écran (beginScreenShareTrack) en renégociant le SDP quand l'émetteur ne sortait rien (appel audio, caméra coupée), restaure la caméra seulement si l'utilisateur la voulait ET qu'elle émettait, s'annonce aux pairs (call:toggle-screen), gère le partage distant (applyRemoteScreenShare / applyRemoteCamera) et échoue avec « Impossible de partager l'écran ». ScreenShareService héberge le serveur de socket UNIX : une connexion (l'extension), trames JPEG décodées en CVPixelBuffer BGRA, seule la DERNIÈRE trame d'une lecture part.

Écarts :
- Aucun partage d'écran : ni demande MediaProjection, ni ScreenCapturerAndroid, ni service de premier plan mediaProjection, ni émission call:toggle-screen.
- Remplacement de la piste caméra par la piste d'écran sur l'émetteur vidéo + renégociation SDP quand la direction change (réutiliser la bascule audio → vidéo).
- Restauration de la caméra à la fin du partage seulement si l'utilisateur la voulait et qu'elle émettait ; arrêt à la fin de l'appel (callEnded).
- État partagé distant : le pair qui partage vient en grand (mise en page), la caméra distante masquée (applyRemoteCamera/applyRemoteScreenShare).
- Erreur « Impossible de partager l'écran » et refus de la permission de capture (dialogue système).
- Bannière « Vous partagez votre écran » avec bouton Arrêter + notification persistante (obligation Android).

Rendu : Bandeau rouge « Vous partagez votre écran » avec bouton « Arrêter », vignette de l'écran partagé en mosaïque côté pair ; tuile de partage en pleine largeur.

Transposition Android : ReplayKit Broadcast Upload Extension + Darwin notifications + socket UNIX → MediaProjection (intent de consentement) + ScreenCapturerAndroid(WebRTC) + foregroundServiceType=mediaProjection ; plus de socket intermédiaire (même processus).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ScreenShare/CallScreenShareController.swift`
- `apps/ios/Meeshy/Features/Main/Services/ScreenShare/ScreenShareService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+ScreenShare.swift`

</details>

### Quitter l'app pendant un appel vidéo garde l'image de l'autre dans une petite fenêtre flottante du système

`calls-system-pip` · Android : **absente** · P1 · effort M

attachSystemPiP(sourceView:) configure le PiP système de l'appel avec la vue vidéo inline (no-op si l'appel n'est pas éligible) ; startSystemPiP/stopSystemPiP le pilotent à la main (bouton, glissé, second tap) et detachSystemPiP le libère en fin d'appel ou perte d'éligibilité. À l'ouverture de la fenêtre le mode d'affichage courant est mémorisé pour le retour dans l'app, puis le plein écran se ferme (la source AVKit survit dans CallPresentationLayer). La cadence du PiP s'adapte à l'état thermique ; origine de démarrage manuelle ou automatique.

Écarts :
- Aucun support PiP : le manifeste ne déclare ni supportsPictureInPicture ni configChanges adaptés, et aucun code n'appelle enterPictureInPictureMode.
- Entrer automatiquement en PiP quand l'utilisateur quitte l'app pendant un appel vidéo actif (setAutoEnterEnabled API 31+, onUserLeaveHint en dessous), avec setAspectRatio, setSourceRectHint et actions distantes (micro, raccrocher).
- Bouton in-app d'entrée/sortie PiP, et masquage de l'UI de commandes dans la fenêtre PiP (onPictureInPictureModeChanged).
- Mémoriser le mode d'affichage avant PiP et le restaurer au retour ; masquer la pastille in-app tant que le PiP est actif (isSystemPiPActive).
- Appels audio : pas de PiP (notification en cours + pastille in-app suffisent).

Rendu : Fenêtre PiP 16:9 ou 9:16 selon la vidéo distante, sans commandes superposées, deux RemoteActions (micro, raccrocher).

Transposition Android : AVPictureInPictureController (sample buffer layer) → Activity.enterPictureInPictureMode(PictureInPictureParams) avec RemoteAction ; le rendu vidéo reste le SurfaceViewRenderer de l'activité.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+SystemPiP.swift`

</details>

### Pincer ma caméra zoome, avec puces d'objectifs (0,5x, 1x, 2x) et pastille « 2x »

`call-camera-zoom` · Android : **absente** · P2 · effort M

Pincer sur MON image zoome la caméra (rampe douce, retour à la base) ; selon les objectifs de l'appareil (triple, ultra-grand-angle + large, large + télé, simple) le profil donne les paliers rapides : puces de facteurs en haut au centre quand mon image est en plein écran, un bouton cyclique de 44 pt dans la vignette. Une pastille de verre « 2x » apparaît au pied de l'image pendant le pincement et 1 s après. Élément ajustable pour VoiceOver (incrémenter/décrémenter).

Écarts :
- Politique pure : plage affichée vs facteur appareil, clamp, settle sur paliers rapides, pas (increment/decrement), pincement relatif au départ.
- Contrôleur de zoom avec rampe (rampRate) appliqué hors du fil principal sur le capturer ; attach/detach selon la caméra, reset à la base à chaque flip.
- Capturer Camera2 personnalisé exposant CONTROL_ZOOM_RATIO (le Camera2Capturer de la lib WebRTC n'expose pas le zoom) ; lecture de CONTROL_ZOOM_RATIO_RANGE et des caméras physiques d'un logical multi-camera pour les puces 0.5x/1x/2x.
- Puces d'objectifs et bouton cycle (44 dp), pastille d'indicateur 1 s après le pincement, geste callCameraZoom sur ma vue plein écran.
- Accessibilité : élément ajustable avec valeur du facteur.

Rendu : Pastille de verre arrondie « 2x » au pied de l'image, puces actives en blanc plein, rampe de zoom sans à-coup.

Transposition Android : AVCaptureDevice.videoZoomFactor/ramp -> Camera2 CaptureRequest.CONTROL_ZOOM_RATIO ; virtualDeviceType -> logical multi-camera physical IDs.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CameraZoomController.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CameraZoomPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CaptureDeviceZoomTarget.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallCameraZoomGesture.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallZoomIndicator.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallZoomLensControls.swift`

</details>

### L'appel s'adapte au réseau (Wi-Fi, données mobiles, économie de données, réseau dégradé)

`call-data-profile-network-path` · Android : **absente** · P2 · effort M

Le profil de données résout wifi / cellular / dataSaver / degraded à partir du chemin OS (réseau coûteux ou contraint) et de la qualité mesurée (hystérésis : on ne quitte « dégradé » qu'à bonne qualité). Chaque profil a un budget : vidéo (1,5 Mb/s 30 fps ; 600 kb/s 24 fps échelle 1,5 ; 250 kb/s 15 fps échelle 2 ; 150 kb/s 15 fps maintain-resolution) et audio Opus (plafond de débit moyen). Le moniteur de chemin réseau (source unique du SDK, état initial fourni au démarrage pour que la 1re offre porte le bon fmtp) applique le profil au client et alimente la feuille de qualité et le journal réseau.

Écarts :
- Types purs CallNetworkPath, CallVideoBudget/CallAudioBudget/CallDataBudget, CallDataProfile.resolve + budgets + libellés localisés (Wi-Fi, Données mobiles, Économie de données, Réseau dégradé).
- Moniteur de chemin : ConnectivityManager (NET_CAPABILITY_NOT_METERED, restrictBackgroundStatus RESTRICT_BACKGROUND_STATUS_ENABLED pour Data Saver), valeur initiale fournie avant la 1re offre.
- applyDataProfile sur le client : bitrates/fps/échelle de l'émetteur et fmtp Opus mungé (voir call-sdp-codec-sender-tuning).
- Journalisation du profil dans le journal réseau et affichage dans la feuille de qualité.

Transposition Android : NWPath.isExpensive/isConstrained -> ConnectivityManager NetworkCapabilities + Data Saver.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallDataProfile.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallNetworkPathMonitor.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+DataProfile.swift`

</details>

### En mode Effets, les autres participants restent visibles dans un bloc déplaçable en haut

`call-effects-companions` · Android : **absente** · P2 · effort S

En mode Effets, la scène montre mon image filtrée ; les autres personnes restent visibles dans un bloc de vignettes posé en haut, sous la Dynamic Island, que le doigt emmène d'un coin du haut à l'autre (jamais un coin du bas où vivent carrousel et barre d'actions). Le duo est le cas du groupe à un seul accompagnant ; la capacité dépend de la largeur libre et un chip « +N » compte le reste ; si l'orateur est caché il est promu. Le bloc ne couvre jamais les commandes du mode ; les photos/films restent « mon image ».

Écarts :
- Règle pure CallEffectsCompanionRule.layout (tuiles, mis en avant, capacité), promotingHiddenSpeaker, capacity(availableWidth…), tileSize(companionCount, freeHeight), corner(dropX, RTL), restingCenterX, duoTiles.
- Bloc Compose draggable entre topLeading/topTrailing avec ressort, chip « +N », mesure de la bande libre au-dessus des commandes du mode.
- Tuiles de grille de groupe réutilisées (GroupCallStageTile).

Rendu : Vignettes de la grille de groupe en haut, chip +N, bloc sous la barre de statut.

Transposition Android : DragGesture -> detectDragGestures ; RTL -> LayoutDirection.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallEffectsCompanions.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallEffectsCompanionStrip.swift`

</details>

### Le mode « Effets de ma caméra » libère l'écran : carrousel Visage/Couleur, photo, film et validation

`call-effects-mode` · Android : **absente** · P2 · effort L

Mode plein écran dédié (une seule couche à la fois) : le chrome se retire, mon image filtrée occupe la scène et un carrousel vertical (balayer haut/bas) propose deux catégories — Visage (aucun, lissage de peau, crapaud, ange, démon, éruption…) et Couleur (préréglages de filtre) — avec élément central agrandi et estompage des voisins. Réglages (luminosité, flou du fond) remplacent le carrousel. Geste du style choisi : un toucher choisit un autre style ; sur le style choisi deux tapes prennent une photo, un appui long (0,45 s) filme (horloge d'enregistrement, seul le bouton stop arrête) ; l'astuce « Deux tapes : photo · Appui long : vidéo » n'apparaît qu'une fois. Valider (haptique succès) garde l'effet ; Quitter rend l'image d'origine.

Écarts :
- Carrousel générique CallModeCarousel (centrage, échelle/opacité, règles CallModeCarouselRule : sideInset, stepping, nearestIndex, settle anti-sélection pendant trajet programmé, commits seulement hors interaction, accessibilité ajustable).
- Catégories Visage/Couleur, copie localisée des 6 effets (Aucun, Lissage de peau, Crapaud, Ange, Démon, Éruption) et arts de pastille (symbole, emoji, image).
- Règle CallModeGestureRule (tap/doubleTap/longPress -> select / capturePhoto / startRecording), astuce vue une fois, horloge d'enregistrement, bouton stop, rangée Réglages (luminosité + flou du fond), barre d'actions Quitter/Valider.
- Pipeline d'effets réel : actuateur de trames (VideoProcessor sur le capturer) pour filtres de couleur ; face effects via détection de visage (ML Kit / MediaPipe) — moteur dans calls#1 (CallFaceEffect*, CallFaceTracker).
- Capture photo/film de MON image à partir des pistes (jamais de l'écran) enregistrée dans la galerie (MediaStore) ; mode lié à CallScreenLayer.mode(.effects).
- Restauration de la config d'origine à la sortie non validée (CallEffectsModeRule.exiting).

Rendu : Écran libéré (aucun contrôle sur la scène), carrousel vertical centré avec élément sélectionné à l'échelle 1 et voisins réduits/estompés, catégories « Visage · Couleur » en texte footnote semibold, barre d'actions en bas.

Transposition Android : Core Image/Vision -> RenderScript-free GPU (GLES/Skia RenderEffect, VideoProcessor) + ML Kit face mesh ; Photos -> MediaStore.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallModeCarousel.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallModeControls.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallModeRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallEffectsCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Mode.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterConfig.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LowLightBoostPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`

### Après un appel, une carte me demande d'évaluer la qualité (4-5 étoiles d'un toucher)

`call-feedback-rating` · Android : **absente** · P2 · effort M

À la fin de l'appel, selon CallFeedbackPolicy (durée, motif de fin, appel troublé, tirage aléatoire, délai entre deux demandes), une carte se pose en bas sans bloquer : « Comment était l'appel avec X ? », 5 étoiles ; 4 ou 5 partent d'un toucher, en dessous une grille de motifs (son de mauvaise qualité, vidéo figée ou floue, écho, coupures, son et image décalés, autre) puis « Envoyer ». « Plus tard » ou 20 s d'inactivité ferment sans rien envoyer. Elle n'apparaît qu'au repos, jamais sur l'écran de fin ni pendant un nouvel appel. Événement call:quality-feedback.

Écarts :
- ViewModel de note (prompt, pendingRating, selectedIssues, noteTrouble, callEnded, rate, toggle, send, dismiss, expire) et CallFeedbackPolicy/Service (cooldown persisté, tirage, motifs selon audio/vidéo).
- Carte Compose : étoiles 44 dp (haptique légère), grille adaptive 132 dp de motifs, bouton Envoyer capsule brandPrimary, croix « Plus tard », expiration 20 s ; matériau régulier coins xl, ombre 16.
- Couche racine qui suit la FSM (reprise, lien dégradé -> trouble) et n'affiche la carte qu'une fois l'appel au repos.
- Émission socket call:quality-feedback (note + motifs) ; textes localisés (6 motifs, titre avec ou sans nom).

Rendu : Carte max 420 dp, matériau régulier, étoiles warning, puces sélectionnées brandPrimary.

Transposition Android : Carte en overlay non bloquant au bas de l'écran (Surface + AnimatedVisibility).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/CallFeedbackViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallFeedbackCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootLayers/CallFeedbackLayer.swift`

</details>

### Les cadres décoratifs (fonds, motifs, bordures, 34 ornements, noms) sont peints identiquement partout

`call-frame-renderer` · Android : **absente** · P2 · effort L

Moteur de peinture des cadres, port exact de frame-paint-*.ts : fond (uni, dégradé linéaire/radial, accent), 14 motifs et 14 bordures, 34 ornements déterministes (graine = rang, aperçu qui ne scintille pas ; ballons, pétales, rayons, couronne, ruban, adhésifs, REC, toiles, coulures, bougies, notes, chauve-souris, crâne…), formes de cases (rect, round, cercle, ovale, arche, hexagone, losange, cœur, étoile, ticket, timbre, blob, déchiré), traitement des visages et cartes/ombres/halos, noms (légende, ruban, étiquette, plaque, badge, bulle, liste en pied), 18 styles de texte. Tout se mesure en unité : une vignette 108x192 et une capture 1080x1920 montrent le même dessin. Couches (fond opaque, dessus transparent) mises en cache. Les textes (nom du groupe, type, accent) sont résolus cache-first depuis la conversation, sans requête réseau.

Écarts :
- Port Kotlin Canvas/Path des peintres (Decor, Kit, Names, Ornaments, OrnamentPieces, Shapes, Text) ~3 000 lignes iOS : mêmes graines, mêmes unités, mêmes pixels (tests de rendu par comparaison de PNG de référence).
- Résolution des 18 polices StoryTextStyle (Imager) et de la police arrondie (SF Rounded) -> polices embarquées Android équivalentes.
- Cache de couches (fond/dessus) avec clé de scène et purge ; CallFramePortrait (image null => dégradé + initiale, jamais de case retirée).
- CallFrameTextsResolver cache-first : nom du groupe, type, accent depuis le cache de conversations puis le maillage, jamais d'attente réseau (immediateTexts / texts).
- Catalogue des cadres (calls#1 : CallFrameCatalogue + 12 fichiers générés) comme données partagées Kotlin.

Rendu : Rendu pixel-fidèle à iOS : mêmes ornements, motifs, polices, couleurs (hex du catalogue) ; mêmes ratios entre vignette et capture.

Transposition Android : CGContext/CoreText -> android.graphics.Canvas/Path/Paint + StaticLayout ; CIImage -> Bitmap/RenderEffect.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Decor.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Kit.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Names.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+OrnamentPieces.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Ornaments.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Shapes.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameRenderer+Text.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameTextsResolver.swift`

</details>

### En appel à deux, un cadre en direct entoure les deux vidéos et se propose à l'autre

`call-live-frame-duo` · Android : **absente** · P2 · effort L

Dans un duo, le choix d'un cadre l'applique tout de suite CHEZ MOI (surface GPU 30 images/s au-dessus de la vidéo principale, sans prendre les touchers, transparente tant que la première scène n'est pas peinte) et part à l'autre comme proposition (« X vous propose le cadre « Y » », Appliquer / Non merci) ; une proposition reçue ne touche jamais mon cadre. Réponses visibles dans l'écran d'appel (« X a appliqué votre cadre », « X garde son affichage »), cas « appliqué chez vous mais non proposé ». Budget par image (0,5 ms léger, 1 ms standard, 2,5 ms riche, p95 journalisé), suspension automatique quand l'appareil se protège (chaleur, économie) ou si le cadre est animé avec Réduire les animations. Rien n'est persisté.

Écarts :
- Événements socket call:frame-select / call:frame-selected et session (choix synchronisé, proposition/réponse, accept/decline/settle/dismissAnswer, leaveDuo).
- Compositeur GPU (GLSurfaceView/TextureView + shaders) qui place chaque vidéo dans sa case (transformations rotation/flip entre repères), tonalité des visages, couches fond/dessus du renderer de cadres.
- Prise sur chaque piste affichée (VideoSink) gardant la DERNIÈRE image reçue par personne (jamais celle envoyée), détachée à la sortie du cadre.
- Budget de trame (CallLiveFrameBudget) et suspension thermique/économie d'énergie ; carte d'état (« Cadre en pause : l'appareil se protège… », « Ce cadre est animé… »).
- Surface Compose (AndroidView) transparente sans prise de touchers + statut sous l'en-tête ; sélecteur de cadre dans l'action « Capture » du menu (le cadre en direct d'un duo et la capture sont une seule fonction).

Rendu : Cadre peint autour des deux vidéos 30 fps, pastille de statut/proposition sous l'en-tête (padding top 160), boutons Appliquer/Non merci.

Transposition Android : MTKView + CIContext Metal -> GLSurfaceView/TextureView + GLES (ou Skia/RenderEffect) ; thermalState -> PowerManager.getCurrentThermalStatus.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallLiveFrameBudget.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallLiveFrameCompositor.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallLiveFrameSession.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallLiveFrameVideoFeed.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallLiveFrameProposal.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallLiveFrameSurface.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+LiveFrame.swift`

</details>

### « Capturer l'appel » compose une image montée de l'appel ou un portrait de chaque visage

`call-montage-capture` · Android : **absente** · P2 · effort L

Mode Montage : choisir un style parmi 13 (Écran, Couverture, Or, Tapis rouge, Pellicule, Néon, Noir et blanc, Mosaïque, Photomaton, Polaroïd, Magazine, BD, Cœur), avec géométrie des cases par nombre de personnes (formes rectangle, rectangle arrondi, cercle, cœur) et bandeau de légende pour les styles glamour ; un cadre décoratif se choisit par ambiance (puces d'ambiance traduites, vignettes rendues sur la seule fenêtre visible, cache borné par cadre x nombre x taille). L'aperçu du montage, « Chaque visage » (portrait carré par participant), enregistrement dans Photos, photo par deux tapes, film par appui long. Les identités sont celles de l'appel (nom, @pseudo, MOI marqué, caméra coupée garde sa case avec initiale).

Écarts :
- Géométrie pure des 13 styles (frames(style:count:canvas:), slots avec forme, bandeaux de légende glamour, médaillons, pellicule) portée telle quelle.
- Identités de capture (CallCaptureIdentity.me/duo/group) : nom, @pseudo, drapeau MOI, miroir, showsVideo.
- Mode Montage dans CallScreenLayer : carrousel de styles + puces d'ambiances (Signature, Distingué, Élégant, Jovial, Déconnecté, Corporate, Fantastique, Futuriste… 12 ambiances) + sélecteur de cadre ; textes localisés (CallCaptureCopy / CallFrameCopy).
- Cache de vignettes borné (clé frameId x people x size, purge sous pression mémoire) rendu pour la seule fenêtre visible.
- Compositeur/enregistreur de montage (CallMontageRenderer / Recorder, calls#1) et capture « Chaque visage » -> galerie (MediaStore) ; flash de capture et annonce d'issue.

Rendu : Carrousel de styles vertical + puces d'ambiance, aperçu 9:16 du montage, cases aux formes variées, noms de personnes selon le style (légende, ruban, étiquette, plaque).

Transposition Android : CoreGraphics/CIImage -> Canvas/Bitmap + OpenGL/MediaCodec pour le film ; Photos -> MediaStore ; NSCache -> LruCache.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallMontageLayout.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallMontageLayout+Glamour.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallCaptureIdentity.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallCaptureCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallFrameMoodChips.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallFrameThumbnailCache.swift`

</details>

### Le détail d'un appel montre le résumé et la chronologie de la qualité du lien

`call-network-journal` · Android : **absente** · P2 · effort M

Journal local (jamais réseau) de chaque appel : états du lien, tentatives de reconnexion, reconnexion réussie, route relayée ou directe, échantillons de qualité, paliers, profils de données, fautes média, motif de fin. Borné deux fois : par appel (plafond d'événements) et entre appels (30 jours, 200 appels), il suit le compte actif (conservé, purgé à la déconnexion). La section du détail présente un résumé (moyennes, pics, reconnexions, route, profils) puis la chronologie des jalons ; les échantillons nourrissent le résumé sans encombrer la chronologie.

Écarts :
- Modèles CallNetworkSample / CallNetworkEventKind / CallNetworkEvent / CallNetworkJournal (appending, merging, bounded) et CallNetworkSummary.
- Store par compte (Room) avec append/journal/remove et politique de rétention 30 jours / 200 appels.
- Enregistreur d'événements branché sur la FSM, les stats et la route ICE (relayed ou direct) — recorder + binding côté calls#1.
- Présentation : lignes de résumé localisées, jalons horodatés relatifs, alertes signalées ; section dans le détail d'appel.

Rendu : Liste de résumé clé/valeur puis timeline verticale avec points colorés (alerte en warning/error).

Transposition Android : CacheCoordinator -> Room avec TTL ; formatage via Locale.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallNetworkJournal.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallNetworkJournalStore.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallNetworkJournalSection.swift`

</details>

### L'appelé voit et entend l'appelant avant de décrocher, et l'appelant sait ce que l'appelé reçoit

`call-preview-before-answer` · Android : **absente** · P2 · effort L

Chez l'appelé : la vidéo de l'appelant joue derrière la sonnerie, avec un bouton plein « Activer/Couper le son » pour l'entendre avant de décrocher (appel 1:1). Chez l'appelant : une étiquette « X vous voit / vous entend / vous entend et vous voit avant de décrocher » dit ce qui est vraiment reçu, et ses micro/caméra d'aperçu se règlent sur l'écran de sonnerie. Choix appliqué dès que l'appelant arrive ; transitions de fondu 0,25-0,3 s.

Écarts :
- Événements socket call:preview-request / call:preview-requested / call:preview-signal et connexion d'aperçu séparée de l'appel principal.
- Backdrop vidéo de l'appelant derrière la sonnerie (voile .4) et bouton « Activer le son » (blanc plein quand coupé, verre quand actif).
- Étiquette d'exposition côté appelant (nothing, seen, heard, seenAndHeard) avec icônes eye/ear et texte localisé.
- Consentement/mémorisation du choix (CallPreviewConsentStore, calls#1) et réglages micro/caméra d'aperçu côté appelant.

Rendu : Étiquette de verre capsule caption medium, bouton son hauteur 50 dp, fondu 0,25 s.

Transposition Android : Second PeerConnection d'aperçu côté Android (stream-webrtc), audio routé sans activer le micro de l'appelé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallPreviewViews.swift`

</details>

### Toucher la puce de durée ouvre le détail en direct de la qualité de l'appel

`call-quality-sheet` · Android : **absente** · P2 · effort M

Feuille « Qualité de l'appel » (moyen/grand, poignée visible) : badge de note globale, lignes en direct (latence, perte, débits…) avec point coloré vert/ambre/rouge selon la note, lignes « Profil réseau » et « Route » quand connues, état « Mesure en cours… » avant la première lecture, bouton de fermeture 44 pt, valeurs mises à jour en direct et annoncées par VoiceOver.

Écarts :
- Feuille de détail et ViewModel abonné au flux de lectures (CallQualityStatsFeed) ; lignes CallQualityRows (métrique, valeur, note good/medium/poor, valeur parlée) et note globale.
- Lignes réseau (profil de données, route relayée/directe) issues de CallQualityNetworkContext.
- État « Mesure en cours… » tant que le flux n'a rien émis ; start/stop de l'abonnement à l'ouverture/fermeture.
- Source de lectures réelle : l'échantillonneur Android est un Noop (voir call-adaptive-quality-stats) donc la feuille et les barres restent vides.

Rendu : Titre headline + badge capsule teinté ; lignes 44 dp titre secondaire / valeur semibold monospacedDigit / point 8 dp.

Transposition Android : presentationDetents -> ModalBottomSheet partiellement dépliée.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallQualitySheet.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/CallQualityDetailViewModel.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallQualitySampler.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### Je réagis par emoji, j'invite des amis dans l'appel et je modère les participants

`call-reactions-invite-moderation` · Android : **absente** · P2 · effort L

Réactions : palette dans la pilule ; chaque réaction envoyée (call:reaction) s'envole avec l'emoji et le nom de son auteur (voie par réaction, échelle 1,6->2,4), annoncée par VoiceOver (« Vous avez réagi ... » / « X a réagi ... »), compte conservé dans l'historique. Ajouter : feuille « Ajouter à l'appel » listant les amis (« Aucun ami à ajouter »), invitation (call:invite-participant), état « Sonne… », notices « X a refusé » / « X n'a pas répondu » / invitation impossible ; l'invité reçoit « X vous invite à un appel de groupe ». Modération en groupe : menu « Options pour X » (Couper le micro via call:mute-participant, Retirer de l'appel avec confirmation via DELETE /calls/:id/participants/:pid), notices « X a coupé votre micro », « X a été retiré ».

Écarts :
- Événements socket absents côté Android : call:reaction / reaction-received, call:invite-participant / participant-invited / invite-declined / invite-expired, call:mute-participant / muted-by-moderator.
- Couche d'envol des réactions (CallFloatingReactionsLayer : lane, auteur, reduceMotion = apparition/fondu sur place) et palette de réactions dans la pilule.
- Feuille « Ajouter à l'appel » (amis, état Sonne…), notices CallControlsNotice (mutedBy, inviteFailed, actionFailed, removed, inviteDeclined, inviteUnanswered) posées AU-DESSUS du bloc de commandes.
- Menu de modération sur une vignette de groupe (couper le micro, retirer + confirmation) et service REST CallModerationRemoteService.removeParticipant.
- Boutons « Ajouter » et « Réagir » (légendes, hints) dans la famille « L'appel » ; annonces a11y des réactions.

Rendu : Emoji grand corps qui monte avec nom caption2 semibold sous l'emoji (largeur max 128), hors zone d'interaction (non cliquable).

Transposition Android : Menus contextuels -> DropdownMenu / ModalBottomSheet ; animations d'envol -> Animatable.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallControlsViews.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+CallControls.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallModerationRemoteService.swift`

</details>

### Enregistrer l'appel demande l'accord de tous, affiche un voyant persistant et ajoute le fichier à la conversation

`call-recording-consent` · Android : **absente** · P2 · effort L

Le bouton Enregistrer propose « Audio seulement » ou « Audio et vidéo » ; la demande part à tous les participants. Chaque autre participant reçoit une carte de consentement (« X veut enregistrer l'appel », détail, Refuser/Accepter) ; l'enregistreur voit « En attente de l'accord de tous… » (Annuler). L'enregistrement ne démarre que si tout le monde accepte ; un voyant PERSISTANT « Enregistrement en cours » est visible chez TOUS. Notices de fin : refusé, délai dépassé, quelqu'un a rejoint, indisponible, ajouté à la conversation, échec d'ajout. Le fichier téléversé est rattaché à la bulle de l'appel (POST /calls/:id/recordings/:id/attachment).

Écarts :
- Événements socket call:recording-request / requested / consent / started / stop / stopped et machine de phases (idle, asking, pending, recording).
- Overlay Compose : carte de consentement (modale a11y), pastille d'attente et de statut avec arrêt, pastille de notice ; visibilité liée au chrome (consentement toujours visible).
- Panneau « Enregistrer » dans la pilule (choix audio / audio+vidéo, hints) et bouton de la famille « L'appel » (mayRecord).
- Capture audio (et vidéo de l'écran d'appel) locale, téléversement, puis liaison via CallRecordingRemoteService.link (gateway vérifie l'enregistreur).

Rendu : Carte verre ultraThin coins xl, point rouge, boutons Refuser (blanc translucide) / Accepter (indigo500) ; voyant en capsule en haut (padding top 110).

Transposition Android : AVAudioEngine/ReplayKit -> MediaRecorder/AudioRecord + MediaProjection pour la vidéo ; VoIP indicator -> notification persistante de service au premier plan.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallRecordingControls.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Recording.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallRecordingRemoteService.swift`

</details>

### Je partage mon écran pendant l'appel, avec bannière « Vous partagez votre écran »

`call-screen-share` · Android : **absente** · P2 · effort L

Le bouton « Écran » (famille « Mon image », seulement connecté et hors Mac) lance le partage système (iOS : sélecteur de diffusion préréglé sur l'extension Meeshy) ; une piste d'écran remplace/complète la caméra avec encodage dédié et directions SDP adaptées, la caméra est restaurée à l'arrêt. Bannière « Vous partagez votre écran » (Arrêter) ou « X partage son écran » ; l'écran partagé d'un pair passe en ajustement fit et peut être mis à la une (« Écran de X »). Événement call:toggle-screen.

Écarts :
- Capture d'écran via MediaProjection (ScreenCapturerAndroid) avec consentement système, service au premier plan de type mediaProjection (permission FOREGROUND_SERVICE_MEDIA_PROJECTION, manifest).
- Piste vidéo d'écran (beginScreenShareTrack / endScreenShareTrack(restoreCamera)), encodage dédié (applyScreenShareEncoding), règles de directions SDP, restauration de la caméra.
- Émission/réception call:toggle-screen ; état screenShare.isSharing / isRemoteSharing ; bannière locale et distante avec bouton Arrêter ; scaling fit pour l'écran du pair.
- Libellés « Partager l'écran / Arrêter le partage d'écran », hint, légende « Écran » / « Arrêter », « Écran de X » à la une.
- Le détecteur existant (ScreenRecordingDetector) ne traite que l'alerte de capture d'écran du pair (call:screen-capture-alert), pas le partage.

Rendu : Bannière capsule en haut (padding 60), masquée avec le chrome ; fit pour l'écran partagé.

Transposition Android : Broadcast Upload Extension + RPSystemBroadcastPickerView -> MediaProjectionManager.createScreenCaptureIntent + ScreenCapturerAndroid.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallScreenShareControls.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+ScreenShare.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/ScreenRecordingDetector.kt`

### Après l'appel, je relis la transcription dans le détail de l'appel

`call-transcript-history` · Android : **absente** · P2 · effort M

Transcription multi-locuteurs persistée localement (jamais envoyée au serveur) : à la fin d'appel les noms et le drapeau isLocal sont gravés ; saveMerging fusionne avec l'existant pour ne pas perdre les segments d'avant une reprise après crash. La section du détail d'appel charge d'abord le cache local chiffré, puis rejoue le journal serveur (GET /calls/:id/transcript : segments finaux + traductions) et re-sème le cache ; les lignes montrent locuteur, décalage depuis le début d'appel et texte selon le Prisme.

Écarts :
- Modèles CallTranscript / CallTranscriptSegment (speakerName, isLocal, texte, traduction) et APICallTranscript (+ segments, traductions).
- Store local chiffré par callId avec saveMerging / transcript(for:) / invalidate, aligné sur le cache SWR (Room + chiffrement) ; local uniquement.
- Endpoint GET /api/v1/calls/{callId}/transcript et mapping vers le domaine (isLocal, repli de noms, fusion avec le cache).
- CallTranscriptLoader : cascade cache chiffré -> serveur -> re-semis ; section de transcription dans la feuille de détail d'appel (états chargement, vide, erreur).
- Écran de détail d'appel Android (absent : l'historique n'ouvre pas de feuille) à créer avec les sections transcription, journal réseau et réactions.

Rendu : Lignes de journal avec nom coloré, horodatage relatif au début de l'appel, traduction par défaut avec toucher pour l'original.

Transposition Android : Cache chiffré iOS -> Room + EncryptedFile/Keystore ; feuille de détail -> ModalBottomSheet.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallTranscript.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallTranscriptStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallTranscriptRemoteService.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallTranscriptSection.swift`

</details>

### Avant même la connexion, je règle les filtres vidéo de ma caméra depuis un panneau d'effets

`call-video-filters-panel` · Android : **absente** · P2 · effort M

Le panneau d'effets est accessible dans tous les états actifs vidéo (sonnerie, connexion) : un bouton « Effets » ouvre un panneau « Filtres vidéo » au bas de l'écran (hauteur plafonnée à 360 pt ou 45 % de l'écran, défilement), sur un voile noir .4 dont le toucher le ferme ; barre secondaire de boutons à bascule ; le panneau vocal a été retiré en 2026-07 (aucun pipeline audio).

Écarts :
- Panneau de réglages de filtres (température, teinte, luminosité, contraste, saturation, exposition, flou du fond, lissage) liés à VideoFilterConfig (modèle pur déjà porté, aucun UI ni actuateur).
- Actuateur de trames sur le capturer WebRTC appliquant la config et la dégradation automatique (VideoFilterDegradePolicy) et le renfort basse lumière (LowLightBoostPolicy).
- Bouton « Effets » sur les écrans sonnerie/connexion et dans la pilule ; voile d'arrière-plan fermant le panneau, libellés a11y « Fermer le panneau ».
- Hauteur de panneau adaptative (min(360 dp, 45 % de la hauteur)).

Rendu : Panneau ancré en bas, coins arrondis, contenu scrollable, voile .4 ; discret, aucune animation lourde.

Transposition Android : Core Image -> GPU shader / RenderEffect via VideoProcessor ; sheet -> bottom panel Compose.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterConfig.kt`

### Choisir parmi 146 cadres décoratifs (12 ambiances) pour habiller la capture d'un appel de 2 à 12 personnes

`calls-capture-frames-catalogue` · Android : **absente** · P2 · effort L

Le catalogue de cadres est une DONNÉE (CallFrameDesign) : 12 ambiances (signature, distingué, élégant, jovial, déconnecté, corporate, fantastique, futuriste, glauque, hors-norme, morbide, féerique) × 4 tranches de personnes (duo 2, comité 3–4, groupe 5–6, tablée 7–12), 146 cadres générés depuis le JSON partagé packages/shared/design/call-capture-frames (CallFrameCatalogue+Generated, miroir de frame-catalogue.ts du web ; fraîcheur gardée par un test de parité). CallFrameSpec définit le vocabulaire (13 arrangements split/diagonal/hero/grid/row/column/arch/orbit/scatter/tiers/mosaic/honeycomb/cascade ; 15 formes de case ; tons color/mono/sepia/noir/warm/cool/faded/duotone/luminosity ; inclinaisons ; 14 motifs ; 14 bordures ; 34 ornements animés ; fonds solide/linéaire/radial/accent ; marque ; textes titre/sous-titre/noms avec 7 styles de noms). CallFrameLayoutGeometry est le portage LITTÉRAL de frame-layout.ts (mêmes formules, même graine pour scatter) avec réserves de texte et bandes de contrôles. CallFrameText compose les mots (« Awa », « Awa & Karim », « Awa, Karim, Lina + 2 », pseudo préfixé d'un seul @, marque en minuscules, texte long réduit jusqu'à 60 % puis tronqué). CallFrameCallTexts résout nom de groupe (nom personnalisé > titre > titre du maillage), type, date du jour, accent de la conversation. CallFrameFormatExtension porte les extensions facultatives (looks de case, mouvement, scène, déclencheurs, éléments libres jusqu'à 6, filigrane Imager, signature de l'auteur).

Écarts :
- Aucun modèle de cadre ni catalogue : générer côté build (script Gradle/Kotlin) un CallFrameCatalogue à partir de packages/shared/design/call-capture-frames/*.json (même source que web et iOS) avec un test de fraîcheur/parité équivalent.
- Types du vocabulaire (CallFrameMood, Bucket, Arrangement, SlotShape, Tone, Tilt, PatternKind, BorderKind, OrnamentKind, Background, Layout…) en sealed classes/enums kotlinx.serialization ; valeurs brutes identiques au JSON.
- Filtre par nombre de personnes (frames(forPeople:mood:), moods(forPeople:)) et réconciliation quand n change (même motif dans la nouvelle tranche, sinon premier cadre de l'ambiance, sinon classique).
- Géométrie de mise en page : portage littéral de frame-layout.ts (13 arrangements, graine scatter, tiers/honeycomb), zones (intérieur, réserves de texte haut/bas, zone des visages) et CallFrameChromeReserve (bandes couvertes par les commandes, en part de la hauteur, jamais plus de la moitié, arrondies au millième supérieur) ; test de fixture partagée frame-layout-fixture.
- Texte du cadre : composition des noms, pseudo, marque unique en minuscules, ajustement (rétrécir à 60 % puis ellipse) avec mesure injectée (Paint.measureText) ; texte du nom de groupe/date/accent depuis la conversation.
- Extensions facultatives du format (looks de case instant-film, film-grain, oil-paint, scratch-film, halftone, vignette, bloom ; éléments libres ; filigrane ; auteur et dates AAAA-MM-JJ) : parser les clés présentes, ignorer en silence ce que le peintre ne dessine pas encore.
- Dépend d'un peintre de cadres (CallFrameRenderer, hors de cette partie) et des polices de cadres (frame-fonts).

Rendu : Cadre = fond (uni, dégradé, accent) + motif + bordure + ornements animés + cases (formes variées, ombre, contour, carte polaroïd, inclinaison douce 4° ou sauvage 9°) + titre/sous-titre/noms ; la marque s'écrit toujours en minuscules ; aucun texte sous les commandes de l'appel.

Transposition Android : CallFrameCatalogue+Generated.swift (généré) → CallFrameCatalogueGenerated.kt généré par une tâche Gradle depuis le même JSON ; CGPath/CoreText → android.graphics.Path/StaticLayout.

<details><summary>Sources iOS (19)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameSpec.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameCatalogue.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameFormatExtension.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameLayoutGeometry.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameText.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameCallTexts.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Generated.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Corporate.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Deconnecte.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Distingue.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Elegant.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Fantastique.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Feerique.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Futuriste.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Glauque.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+HorsNorme.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Jovial.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Morbide.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/Generated/CallFrameCatalogue+Signature.swift`

</details>

### Pendant un appel vidéo, je fais une photo-souvenir stylée de tout le monde (13 montages) ou un court film d'un appui long

`calls-capture-montage` · Android : **absente** · P2 · effort L

CallCaptureController (propriétaire de la capture pour l'écran d'appel, publie à part l'aperçu du montage pour que l'écran d'appel ne se redessine jamais au rythme de la capture, #8625) : CallFrameGrabber attache les pistes vidéo (locale + distantes, miroir de la locale), prend un instantané (CallFrameSnapshot) et libère ; CallMontageRenderer peint 13 montages classiques (écran, grille, bande, polaroïd, magazine, bande dessinée, cœur, couverture, or, tapis rouge, pellicule, néon, noir) avec cases rectangle/arrondi/cercle/cœur, ton de la case (noir = luminance seule), glamour (+Glamour), et rendu en couches (+Layers : le décor et le dessus peints UNE fois avec un trou, la carte graphique pose la vidéo dans le trou à chaque image). Un touch = photo (visages enregistrés), un appui long = film (CallMontageRecorder : H.264 + AAC, micro par un AVAudioEngine indépendant de WebRTC, horloge hôte). Aperçu du carrousel à 5 i/s (15 pendant le film), vignettes bornées autour du style choisi (le coût ne grandit pas avec le catalogue), navigation à puces d'ambiance (CallMontageFrameRule : « Classiques » puis les ambiances du catalogue qui servent n personnes ; réconciliation quand n change). Statuts : idle, working, saved, facesSaved(n), videoSaved, denied, noVideo, failed ; enregistrement dans la photothèque après demande d'accès.

Écarts :
- Aucune capture d'appel : ni instantané des pistes vidéo (VideoSink sur la piste locale + distantes avec orientation/miroir), ni contrôleur d'état (idle, working, saved, facesSaved(n), videoSaved, denied, noVideo, failed).
- Peintre de montages : 13 styles classiques (screen, grid, strip, polaroid, magazine, comic, heart, cover, gold, redcarpet, film, neon, noir) — Canvas/Path Android, cases rectangle/arrondi/cercle/cœur, rotation de la polaroïd, ton noir = luminance seule, espace colorimétrique sRGB (Display P3 pour les photos composer).
- Rendu en couches pour l'aperçu en direct (décor + dessus peints une fois, vidéo posée dans le « trou » par le GPU à chaque image) afin de tenir 5–15 i/s sans surcoût de CPU.
- Film du montage : MediaCodec H.264 + AAC via MediaMuxer, micro par un AudioRecord indépendant du pipeline WebRTC, horodatage sur horloge hôte commune aux images et au son, fichier prêt à déposer dans MediaStore.
- Carrousel : puces d'ambiance, vignettes bornées autour du style choisi (rayon de vignettes), dernier choix mémorisé par ambiance, réconciliation du choix quand le nombre de personnes change.
- Détection du visage (VisionFaceLocator) pour enregistrer les visages individuellement (facesSaved(n)) : ML Kit Face Detection.
- Appui long = film (instant de départ publié), geste de bascule photo/film, états denied / noVideo / failed localisés ; sauvegarde via MediaStore (pas de permission en API 29+).
- Dépend du catalogue de cadres pour les montages « cadre » (voir calls-capture-frames-catalogue) et du rendu CallFrameRenderer (partie vue/UI).

Rendu : Mode Montage plein écran : scène 9:16 au centre, carrousel de vignettes sous la scène (style choisi centré, halo accent), puces d'ambiance au-dessus (« Classiques » en tête), déclencheur rond (tap photo, appui long film avec anneau de progression) ; aucun contrôle posé sur la scène ; toasts « Enregistré » / « Accès refusé ».

Transposition Android : RTCVideoRenderer tap (CallFrameTap) → org.webrtc.VideoSink ; CoreGraphics/Core Image → android.graphics.Canvas/Path + RenderEffect/GL ; AVAssetWriter → MediaCodec + MediaMuxer ; PHPhotoLibrary → MediaStore.Images/Video (scoped storage) ; Vision face → ML Kit Face Detection.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallCaptureController.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallCaptureController+Frames.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFrameGrabber.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallMontageRecorder.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer+Glamour.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer+Layers.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallMontageFrameRule.swift`

</details>

### Des effets de visage ludiques en direct (crapaud, ange, démon, volcan) qui suivent mon visage sans lag

`calls-face-effects-stylized` · Android : **absente** · P2 · effort L

CallFaceEffect : none, smoothing (Peau lissée), toad, angel, demon, volcano ; les quatre derniers sont « stylisés » (volcan n'a pas besoin de visage). CallFaceTracker (#9102) ne cherche JAMAIS les repères sur l'image courante : la détection part sur sa propre file, chaque image dessine avec le dernier visage connu, gardé en coordonnées unitaires (suit une rotation sans attendre la détection suivante) ; lissage des repères (smoothed(toward:factor)), centre des lèvres (#9196), « Réduire les animations » lu sur le fil principal et exposé sans verrou. CallFaceEffectGeometry place les éléments (boîte normalisée, yeux, lèvres, braises du volcan, orientation d'image) et CallFaceEffectBudget borne le coût. CallFaceEffectsRenderer rend chaque effet (crapaud, halo d'ange par flou au quart + écran, démon animé par le temps, volcan avec braises), dégrade quand l'appareil est contraint, et sait aussi retoucher une photo debout dont le visage vient d'être trouvé (composer, #10311).

Écarts :
- Aucun effet de visage : ni suivi de visage temps réel (ML Kit Face Detection/Mesh ou MediaPipe Face Landmarker) sur sa propre file, ni sprites d'effets, ni sélection persistée (VideoFilterConfig.selectingFaceEffect).
- Modèle CallFaceEffect (none, smoothing, toad, angel, demon, volcano) avec drapeaux isStylized/needsFace, nom analytique « face:<effet> », sélection exclusive avec Peau lissée.
- Suivi: repères en coordonnées unitaires, dernière détection réutilisée par chaque image, lissage temporel, orientation d'image (redressement) et taille de toile ; abandon de toute analyse en vol (voir CallVisionWorker).
- Rendus: crapaud (peau, yeux), ange (halo = flou au quart ajouté en écran), démon (cornes/flamme animés par le temps), volcan (braises animées sans visage) ; budget de coût (CallFaceEffectBudget) et dégradation sous contrainte.
- Respect de « Réduire les animations » : effets animés suspendus (démon/ange/volcan), statiques conservés.
- Réutilisation pour la photo du composer (retouche d'une image déjà debout) : API 'retouch' partagée.

Rendu : Effets ludiques ancrés sur les yeux/lèvres, animations 60 fps, halo doux de l'ange, braises du volcan en fond; sélecteur horizontal de pastilles d'effets dans le panneau d'effets avec aperçu.

Transposition Android : Vision VNDetectFaceLandmarksRequest → ML Kit Face Mesh/MediaPipe Face Landmarker ; Core Image sprites → bitmaps vectorielles (VectorDrawable/Lottie) composées en GLES ou Canvas dans un VideoProcessor ; CIBloom quart-résolution → blur GLES.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallFaceEffect.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFaceEffectGeometry.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFaceEffectsRenderer.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFaceTracker.swift`

</details>

### Un lien d'appel demande confirmation (« Appeler @x en vidéo ? ») au lieu de composer tout seul

`calls-link-confirmation-sheet` · Android : **absente** · P2 · effort S

meeshy://call?contactId=…&type=… ne compose plus directement (sécurité : un QR code ou une page web ne doit jamais ouvrir caméra et micro sans geste). CallLinkConfirmationController résout la conversation (cache puis réseau), refuse proprement un contact inconnu, un groupe ou un contact bloqué (toasts « Ce contact est introuvable » / « Vous avez bloqué ce contact »), fige une valeur immuable CallLinkTarget (jeton unique, compte connecté) et la montre dans une feuille moyenne : avatar, titre, bouton « Appeler » (icône audio/vidéo) et « Annuler ». Seul « Appeler » compose, après relecture du compte, du blocage et des barrières (mise à jour forcée, âge).

Écarts :
- Aucun filtre d'intent meeshy://call dans AndroidManifest ni dans LaunchRouter : ajouter le schéma + parsing contactId/type avec validation stricte.
- Feuille de confirmation (ModalBottomSheet moyenne) : avatar profileSheet, titre « Appeler %s en vidéo/en audio ? », boutons « Appeler » (rempli, icône phone/video) et « Annuler », largeur max 480 dp, glisser vers le bas pour fermer.
- Contrôleur de confirmation : un lien = un jeton, un second lien REMPLACE la feuille ouverte, une feuille remplacée ne referme pas sa remplaçante ; au tap relire compte courant, blocage et barrières, sinon rien ne part.
- Refus localisés par toast : contact introuvable / pas un échange à deux / contact bloqué.
- Les barrières (mise à jour forcée, âge) passent AVANT l'affichage de la feuille ; un lien ne montre RIEN si une barrière est levée.

Rendu : Feuille centrée, 16–24 dp de marges, avatar grand (profileSheet), titre en titleSize bold centré sur plusieurs lignes, deux boutons pleine largeur (primaire accent « Appeler », secondaire « Annuler » contouré), poignée de glissement visible.

Transposition Android : Universal/deep link meeshy://call → intent-filter VIEW/BROWSABLE dans MainActivity ; sheet SwiftUI presentationDetents(.medium) → ModalBottomSheet Material 3 ; UUID de jeton → java.util.UUID dans un StateFlow<CallLinkTarget?>.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Contacts/CallLinkConfirmation.swift`

</details>

### En appel vidéo à deux, je mets un cadre décoratif en direct autour des deux vidéos

`calls-live-frame-duo` · Android : **absente** · P2 · effort M

CallLiveFrameRule (#9214) : un cadre se propose en direct s'il sert un duo et que la loi d'usage (FrameUsageLaw.canUseFrame(.call)) lui ouvre l'appel, c'est-à-dire s'il déclare « live » ; un cadre de capture seule ne sert jamais l'appel quel que soit son coût (directive porteur 2026-10-11). Il n'existe qu'en vidéo à deux. Affichage : aucun / cadre / suspendu (appareil sous contrainte : deviceConstrained ; « Réduire les animations » si le cadre bouge, un cadre statique reste permis). Repeindre seulement quand le cadre, les personnes (arrivée, départ, nom partagé), les textes (vérifiés une fois par minute) ou la taille changent — jamais une image vidéo. Taille de peinture = écran en pixels borné à 2048 px sur le plus long côté ; le nom que l'autre choisit de partager remplace celui qu'on connaissait de lui. Aucun texte du cadre sous un contrôle : bandes réservées de 52 pt en haut (rangée d'en-tête sous l'îlot) et 84 pt en bas (pilule de commandes). L'interrupteur « Cadre » de la capture (#9287) garde ou retire le cadre tapé.

Écarts :
- Aucune règle d'éligibilité ni d'affichage (none / frame / suspended(deviceConstrained | reduceMotion)) ; ajouter FrameUsageLaw (partagée) et CallLiveFrameRule en Kotlin pur.
- Peinture des couches du cadre autour des deux vidéos (hors cette partie : CallFrameRenderer) avec repeinture conditionnelle (CallLiveFrameLayerInputs : frameId, personnes, textes, taille, réserve) et taille bornée 2048 px.
- Synchronisation du cadre choisi entre les deux appareils (événements call:frame-select / call:frame-selected du SDK) ; nom partagé de l'autre (remoteSharedName).
- Suspension sous contrainte d'appareil (thermique/mémoire) et sous « Réduire les animations » (Settings.Global.ANIMATOR_DURATION_SCALE = 0) quand le cadre bouge.
- Réserves de contrôles : 52 dp en haut + inset, 84 dp en bas + inset, jamais plus de la moitié de la hauteur.
- Interrupteur « Cadre » de la capture (toggledHold) et mayHold/mayOffer.

Rendu : Cadre plein écran autour de la vidéo distante et de l'aperçu local; textes protégés des contrôles (en-tête 52 dp, pilule de commandes 84 dp) ; ornements animés suspendus si l'appareil chauffe.

Transposition Android : isDeviceConstrained → ThermalStatus ≥ MODERATE + low-RAM ; Réduire les animations → ValueAnimator.areAnimatorsEnabled() / Settings.Global ; repeinture → Compose Canvas keyed sur CallLiveFrameLayerInputs.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallLiveFrameRule.swift`

</details>

### Le journal réseau d'un appel garde ce qui s'est passé (coupures, dégradations, reconnexions) pour le consulter après

`calls-network-journal` · Android : **absente** · P2 · effort M

CallNetworkJournalRecorder (#8698) est PUR : reducing(input, at:) rend le recorder suivant et les événements bornés à persister. Entrées : appel (id), état (CallState), lien (PeerConnectionState), lecture de qualité (CallQualityReading), palier (VideoQualityLevel), défaut média (capture refusée, caméra indisponible). Une lecture est gardée toutes les sampleInterval (≈ quatre échantillons par minute sur lien stable) ou immédiatement quand perte, latence ou gigue changent de note ; vocabulaire d'événements reconnecting(attempt), connected après reconnexion, ended(reason local/remote/rejected/missed/failed/connectionLost). CallNetworkJournalBinding relie les signaux vivants de la pile d'appel au journal de l'appel en cours, une liaison par pile, via le relais partagé CallMediaFaultFeed (comme CallQualityStatsFeed, sans construire WebRTC avant un appel). Le journal vit dans le cache du compte ACTIF (CallNetworkJournalStore) : purgé avec le compte.

Écarts :
- Aucun journal : ajouter un enregistreur pur (entrées call / state / link / reading / tier / mediaFault) avec événements bornés et échantillonnage 4/min ou immédiat au changement de note.
- Stockage par compte (table Room liée à l'utilisateur actif, purgée à la déconnexion/changement de compte) : CallNetworkJournalStore.
- Liaison avec la pile d'appel (état, lien ICE, lectures, paliers) et un relais de défauts média (capture refusée, caméra indisponible) sans instancier WebRTC avant un appel.
- Présentation dans le détail d'appel (CallNetworkJournalSection) : section masquée si le journal est vide.
- Dépend de la collecte de stats (calls-webrtc-engine) pour les lectures de qualité.

Rendu : Dans le détail d'appel, section « Réseau » : frise chronologique d'événements (connecté, instable, reconnexion n, terminé) avec pastilles colorées vert/ambre/rouge et horodatage relatif.

Transposition Android : Combine/actor → Flow + reducer pur ; GRDB cache du compte → Room (CallHistoryDao existant comme modèle) ; UserDefaults inutile.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallNetworkJournalBinding.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallNetworkJournalRecorder.swift`

</details>

### Un appel entrant baisse la vidéo/le vocal en cours puis les arrête au décroché, et les rend à la fin

`calls-playback-ducking` · Android : **absente** · P2 · effort S

CallRingPlaybackLaw (#11063, décision porteur h du 2026-10-20) : l'appel entrant qui sonne BAISSE le son Meeshy (vidéo, vocal, PiP en cours) — ils restent audibles sous la sonnerie ; on décroche ⇒ la lecture s'arrête, marquée interrompue, et reprend au raccrochage (callEndedShouldResume, #11040), volume restauré pendant la pause ; refus/manqué/annulé ⇒ volume remonte ; un appel SORTANT arrête la lecture tout de suite. CallPlaybackInterruptionBinding (#8725) gèle aussi les lecteurs à timeline (une story, dont le compte à rebours continuait sous la vue d'appel) en place, et les relance là où ils étaient sauf pause volontaire de l'utilisateur ; le panneau de fin garde l'interruption, seul le retour à .idle la lève.

Écarts :
- Aucun ducking/arrêt coordonné de la lecture Meeshy (vidéo, vocal, PiP) quand un appel sonne, est décroché, refusé ou terminé ; ajouter la loi pure (none / duck / interrupt / interruptAndRestore / restore).
- Gel des lecteurs à timeline (stories, reels) pendant l'appel et reprise à l'endroit exact au retour à idle, sauf pause volontaire.
- Reprise automatique des vocaux/vidéos interrompus au raccrochage ; garder l'interruption pendant le panneau de fin.
- Appel téléphonique/FaceTime natif : géré par le système (AudioFocus) — ne pas dupliquer.

Rendu : Aucun écran ; le volume baisse en fondu quand l'appel sonne.

Transposition Android : RecordingPlaybackDucker / PlaybackCoordinator → coordinateur de lecture commun (ExoPlayer/Media3) avec setVolume + AudioFocus ; PlaybackInterruption → interface partagée des lecteurs à timeline.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallRingPlayback.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallPlaybackInterruptionBinding.swift`

</details>

### Après un appel difficile (ou 1 sur 5), une note rapide de qualité est proposée au plus une fois par jour

`calls-post-call-feedback` · Android : **absente** · P2 · effort S

CallFeedbackPolicy (#8072, jumelle de feedbackPromptFor du web, D-139) : un appel qui a vraiment eu lieu (≥ 10 s, raccroché ou perdu) ; un sur cinq au hasard ; toujours celui qui a souffert (reprise, lien dégradé, connexion perdue) ; au plus une demande par jour glissant. CallFeedbackService mémorise la date de la dernière demande dans UserDefaults (confort par appareil) et émet call:quality-feedback.

Écarts :
- Aucune règle de sollicitation (≥ 10 s, 1 sur 5, toujours après reprise/dégradation/perte, 1 par jour glissant) ni émission de call:quality-feedback.
- Mémoriser la date de dernière demande dans DataStore (par appareil) ; injecter l'horloge et l'aléa pour tester la règle.
- UI de note (étoiles + motifs) côté vue de fin d'appel (voir partie vue d'appel).
- Marquer l'appel « souffrant » : reconnexion déclenchée, lien dégradé, connectionLost.

Rendu : Carte de note sobre dans le panneau de fin d'appel (5 étoiles/emoji, boutons Envoyer / Plus tard), jamais bloquante.

Transposition Android : UserDefaults → Preferences DataStore ; Bool.random() 1/5 → Random injectable.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallFeedbackPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallFeedbackService.swift`

</details>

### Avant de décrocher, je vois (et peux entendre) l'appelant, et lui choisit ce qu'il laisse voir

`calls-preview-before-answer` · Android : **absente** · P2 · effort L

L'aperçu avant décroché (#8480) : dès qu'un appel 1:1 sonne dans l'app, l'appelé demande l'aperçu (call:preview-request) ; l'offre de l'appelant, et de lui seul, ouvre un lien en RÉCEPTION SEULE (ni micro ni caméra de l'appelé) qui s'affiche derrière la sonnerie, muet tant que l'appelé n'active pas le son (setPreviewAudible, canal de contrôle). Côté appelant, une demande pour SON appel qui sonne ouvre un lien qui offre ce qu'il a choisi pour CE correspondant (CallPreviewConsentStore : micro coupé + caméra activée pour un contact jamais appelé, un choix par couple compte/correspondant, rejoué aux appels suivants), dans la limite de l'état des médias ; il voit ce que l'appelé reçoit vraiment (nothing/seen/heard/seenAndHeard). Tout passe par call:preview-signal, jamais par call:signal (où une réponse décrocherait l'appel). Pas d'aperçu sur l'écran verrouillé (CallKit ne montre pas de vidéo).

Écarts :
- Aucun événement call:preview-request / call:preview-requested / call:preview-signal ni lien d'aperçu réception seule (second PeerConnection léger) ; miroir de engine-preview.ts côté web.
- Écran entrant : vidéo de l'appelant derrière la sonnerie, bouton son (activer/couper) proposé dès que l'appel 1:1 sonne, aperçu muet par défaut.
- Écran sortant : boutons micro et caméra de l'aperçu pendant la sonnerie, libellé « ce que l'appelé reçoit » (rien / vu / entendu / vu et entendu), micro coupé pendant la sonnerie rétabli à la connexion (restoreMicAfterRinging).
- Mémoire du consentement par (compte, correspondant) dans DataStore ; défaut : micro coupé, caméra activée (directive porteur 2026-09-30) ; un autre compte du même téléphone ne rejoue jamais les choix du premier.
- Canal de contrôle de l'aperçu (message {audible}) entre appelé et appelant.
- Écran verrouillé / notification : aucun aperçu (la vidéo ne peut être montrée) ; l'aperçu vit dans l'écran entrant plein écran.

Rendu : Vidéo plein écran de l'appelant floutée/atténuée derrière nom+boutons, icône haut-parleur pour entendre ; côté appelant, deux pastilles micro/caméra avec libellé d'exposition.

Transposition Android : GroupPeerLinkFactory (lien réception seule) → PeerLink dédié ; CallKit sans vidéo → notification sans aperçu, aperçu dans l'activité plein écran ; UserDefaults par compte → Preferences DataStore.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallPreviewCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallPreviewConsentStore.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+CallPreview.swift`

</details>

### Une pastille « audio / vidéo » indigo identifie le type d'appel sur l'écran entrant et l'écran d'appel

`calls-type-badge` · Android : **absente** · P2 · effort S

CallTypeBadgeView : glyphe (phone.fill / video.fill) + libellé localisé dans une capsule indigo400 à faible opacité avec contour fin, partagée par CallView et IncomingCallView (seul le libellé et sa longueur varient).

Écarts :
- Aucune pastille de type d'appel dans CallScreen ; créer CallTypeBadge(isVideo, label) réutilisable (écran entrant + écran d'appel).
- Libellés localisés distincts par écran appelant (long sur l'entrant, court sur l'appel), contentDescription explicite.
- Tokens : texte/icône indigo400, fond indigo400 à MeeshyOpacity.light, contour indigo400 à MeeshyOpacity.medium épaisseur hairline.

Rendu : Capsule horizontale, icône 12 sp semi-bold + libellé caption2 semi-bold, padding 12×6 dp, indigo400 sur fond indigo400 ~12 %, contour ~25 %.

Transposition Android : Capsule SwiftUI → Surface(shape = CircleShape/RoundedCornerShape(50)) Compose avec border(0.5.dp).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CallTypeBadgeView.swift`

</details>

### L'écran d'appel s'affiche au-dessus de tout, même d'un viewer ou d'une feuille ouverte

`call-presentation-host-layers` · Android : **divergente** · P1 · effort M

iOS montait l'appel en fullScreenCover : impossible dès que la racine présentait déjà quelque chose (story, composer, feuille de flux). Il vit désormais dans SA UIWindow au-dessus de toute présentation (sous les alertes), retirée quand l'appel est réduit ; remontée à l'activation de scène si l'appel sonne en arrière-plan ; quitter la conversation en grand (reporter de visualisation). CallPresentationLayer isole l'unique observation du gestionnaire (évite la tempête de recompositions à 1 Hz) et monte pilule flottante, fenêtre du point de retour (bulle), bannière d'appel en attente et couche de note.

Écarts :
- L'appel est une route NavHost dans MeeshyApp : une Dialog, un ModalBottomSheet ou un viewer plein écran affichés au-dessus le recouvrent ; héberger la surface d'appel dans une couche racine au-dessus de tout (overlay en tête de MainActivity ou CallActivity dédiée).
- Appel entrant sur écran verrouillé : setShowWhenLocked/setTurnScreenOn + full-screen intent (canal d'appel), jamais caché derrière le keyguard.
- Règle pure de visibilité (état d'appel x displayMode) ; démontage seulement à la réduction ; remontée si l'Activity est recréée.
- Observer le gestionnaire d'appel via un flux dédié (pas de recomposition globale à chaque tick de durée/qualité).
- Ne construire la pile d'appel (WebRTC, Telecom) qu'à la demande, jamais au démarrage à froid hors appel.
- Montage coordonné de la pilule, de la bulle, de la bannière d'appel en attente et de la couche de note d'après-appel ; l'écran d'appel en grand fait quitter la conversation visionnée.

Rendu : Aucune bande claire ni fond d'écran dessous visible ; l'écran d'en dessous n'est ni démonté ni recouvert d'un modal.

Transposition Android : UIWindow dédiée -> CallActivity (showWhenLocked, turnScreenOn) ou overlay Compose racine ; CallKit présentation -> Telecom ConnectionService + full-screen intent (calls#1).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`

### Une pilule de commandes en bas (… · Micro · Sortie · Fin) déploie les actions « Mon image » et « L'appel »

`call-controls-pill-actions` · Android : **partielle** · P0 · effort L

La pilule du bas porte toujours (…) · Micro · Sortie · Fin. Le (…) empile AU-DESSUS une rangée par famille (« Mon image » : caméra, retourner ou choisir la caméra, effets, écran ; « L'appel » : sous-titres, journal, ajouter, réagir, capturer, enregistrer, PiP), chacune défilant à l'horizontale, en duo comme en groupe. CallActionSet.resolve décide des actions selon Mac, vidéo, connecté, droit d'enregistrer, PiP possible. CallScreenLayer garantit UNE seule chose à la fois (idle, menu, panneau réagir/enregistrer/personnes/journal, mode effets/montage), se réconcilie quand une action disparaît, interdit le masquage auto avec un panneau ou un mode ouvert. En hauteur compacte, les rangées légendées se replient en une ligne sans titres. Glyphes 48 pt (44 pt en rangée), légende dessous, actif = disque blanc + glyphe indigo950, Fin = rouge, pause auto = ambre, pression 0,88.

Écarts :
- Remplacer la rangée plate de 4-5 boutons (micro, haut-parleur, caméra, raccrocher) par la pilule 32 dp : base (…) · Micro · Sortie · Fin, glyphes 48 dp avec légendes, états actif/destructif/avertissement.
- Modèle pur CallActionSet/CallActionContext/CallActionFamily (règles identiques iOS ; Mac -> Chromebook/desktop, pas d'écran partagé hors connecté) avec tests de contrat.
- Machine CallScreenLayer (idle, menu, panel, mode) : togglingMenu, opening, backToMenu, closed, entering/exitingMode, reconciled ; mayAutoHide et freesTheScreen.
- Rangées de famille défilantes (cellule 68 dp, glyphe 44 dp, légende), panneaux dessinés dans la pilule (réagir, enregistrer) vs feuilles (personnes, journal), en-tête de panneau avec retour et fermeture 44 dp.
- Repli en hauteur compacte (paysage, fenêtre basse) : une seule ligne sans titres qui défile, grille de groupe à hauteur minimale (CallGroupStageSizing).
- Bouton « Sortie » ouvrant le sélecteur de route audio (voir call-audio-route-picker) à la place du simple bascule haut-parleur.
- Haptique légère à chaque ouverture/bascule, animation de déploiement (disclosureAnimation), échelle 0,88 à la pression, libellés/hints a11y, légende seule soumise à la taille de police.
- Boutons Fin et Effets présents dès la sonnerie/connexion (vidéo) comme sur l'écran sortant.

Rendu : Pilule RoundedRectangle(32) continu, padding horizontal lg, hairline supérieure, glyphes ronds sur disque plat (taille figée, la légende porte l'accessibilité de texte), actif = disque blanc + glyphe indigo950, Fin = MeeshyColors.error, pause automatique = warning ambre. Animations discrètes, haptique light.

Transposition Android : Liquid Glass (adaptiveGlass/AdaptiveGlassContainer) -> Surface translucide floutée (blur) avec repli opaque sombre 0.55 ; AsyncRenderRow -> LazyRow ; ViewModifier -> Modifier.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallControlsLayout.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallScreenLayer.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallGroupStageSizing.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallControlGlass.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallDeviceControls.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallPillRow.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Pill.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Controls.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Panels.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### En duo, la vidéo du correspondant occupe tout l'écran, avec avatar de repli et micro coupé affiché sur l'image

`call-duo-video-stage` · Android : **partielle** · P0 · effort M

La disposition connectée 1:1 : en vidéo, le flux distant plein cadre (remplissage, ajusté sur Mac ou quand l'autre partage son écran) est l'unique surface vidéo ; l'aperçu perso n'y vit que dans la vignette. Un pair qui n'envoie aucune image n'est jamais « en chargement » : CallRemoteVideoSurface passe de connecting à cameraOff (avatar + « Caméra désactivée ») dès que sa caméra est annoncée coupée ou après 12 s. Le micro coupé du pair est une pastille posée sur l'image (haut-centre de la grande image, coin de la vignette après permutation), hors du chrome qui s'efface. En audio : paire d'avatars 120 pt, statut sous l'avatar, pastilles d'état (réseau faible du contact, serveur déconnecté) ; avec les sous-titres, en-tête compact + panneau. Un pair peut escalader audio->vidéo : son flux s'affiche même caméra locale coupée.

Écarts :
- Surface vidéo résolue (live / cameraOff / connecting) avec watchdog 12 s : avatar + « Caméra désactivée » au lieu d'un fond vide ; Android n'affiche qu'une ligne de texte « caméra désactivée » sur fond plein.
- Pastille « micro coupé » du pair posée sur l'image (haut-centre, coin de la vignette après permutation), muette pour TalkBack (la puce de durée porte la phrase) ; Android affiche une ligne de texte.
- Mise en page audio : paire d'avatars 120 dp, nom + statut, pastilles « Réseau faible (contact) » / « Serveur déconnecté » ; panneau de sous-titres avec en-tête compact quand les sous-titres sont actifs.
- Mode d'ajustement : fill par défaut, fit si fenêtre redimensionnable (Chromebook/desktop) ou si le pair partage son écran.
- Toucher la vidéo bascule le chrome (voir call-chrome-auto-hide) ; libellé a11y « Masquer/Afficher les contrôles » ; geste glisser-bas simultané.
- Support de l'escalade audio->vidéo du pair (isVideoUIActive) et dispatch vers la scène de groupe (GroupCallStageView, hors périmètre ici).
- Bandeau de sous-titres au-dessus de la pilule en vidéo (voir call-live-captions-journal).

Rendu : Vidéo bord à bord sans bandes, avatar centré + « Caméra désactivée » en repli, pastille micro barré haut-centre sur fond sombre translucide.

Transposition Android : RTCMTLVideoView/WebRTCVideoView -> SurfaceViewRenderer (VideoRenderer existant) en scaling FILL/FIT.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallView+Connected.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallRemoteVideoSurface.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallPeerMutedBadge.swift`
- `apps/ios/Meeshy/Features/Main/Views/WebRTCVideoView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/RemoteTrackRegistry.kt`

### Sonnerie, connexion et fin d'appel ont chacune un écran dessiné (avatar pulsant, attente, raison de fin, Réessayer)

`call-ringing-connecting-ended-states` · Android : **partielle** · P0 · effort M

Sonnerie sortante : avatar à trois anneaux pulsants, nom en titre arrondi ombré, « Appel en cours… » qui devient après 6 s « En attente du correspondant… » + sous-texte « Le correspondant n'a pas encore répondu. » (fondu 0,3 s, annonce VoiceOver), badge de type (audio/vidéo), étiquette « X vous voit/entend avant de décrocher », commandes d'aperçu, filtres et raccrocher. Connexion : spinner indigo + « Connexion… » avec l'aperçu de l'appelant derrière. Fin : avatar 100 pt à 60 %, nom, motif localisé (raccroché local/distant, refusé, manqué, échec, connexion perdue), durée finale en chiffres tabulaires avec libellé a11y, et « Réessayer » (capsule verte) pour les seuls échecs transitoires (CallRetryPolicy : failed, connectionLost).

Écarts :
- Avatar pulsant à 3 anneaux (dégradé indigo500→indigo400, trait 2 dp), coupé sous Réduire les animations ; Android affiche un disque initiale statique de 96 dp.
- Libellé d'attente progressif : « Appel en cours… » puis « En attente du correspondant… » + hint après 6 s (transition 0,3 s + annonce a11y).
- Badge de type d'appel (audio/vidéo) et paire d'avatars (pair + pastille locale) en audio établi.
- Écran de connexion : spinner indigo400 + « Connexion… », aperçu vidéo de l'appelant derrière quand il existe (voir call-preview-before-answer).
- Écran de fin : avatar 100 dp à 0,6, nom, motif, durée finale monospace avec libellé a11y « Durée de l'appel » (valeur parlée) ; vérifier les 6 motifs (local, remote, rejected, missed, failed, connectionLost) et leurs textes.
- « Réessayer » en capsule verte avec glyphe refresh et libellé visible ; Android propose un bouton rond sans libellé.
- Titre de nom en police arrondie semibold avec ombre portée sur fond sombre.

Rendu : Texte blanc, mediaChromeTertiary pour les sous-titres de statut, spacing xxl entre avatar et nom, boutons Fin/Effets alignés à 80 dp du bas. Anneaux pulsants indigo, spinner indigo400.

Transposition Android : SwiftUI states -> Composables par CallStatus ; HapticFeedback/announcements -> HapticFeedback + liveRegion.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallView+States.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Copy.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallEndReason.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallRetryPolicy.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallUiState.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallRetryPolicy.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallTimeLabel.kt`

### L'appel s'ouvre sur un plein écran sombre, avec le fond flouté du contact et une sortie par glissé vers le bas

`call-screen-shell-fullscreen` · Android : **partielle** · P0 · effort M

CallView dispatche l'écran selon l'état (sonnerie, connexion, connecté/reconnexion, fin). Le fond est un dégradé sombre épinglé (surfaceDarkBase, Deep, Raised) quel que soit le thème ; sans vidéo distante, la bannière (à défaut l'avatar) du contact couvre la page, floutée et voilée, résolue cache-first. Avant la connexion, l'aperçu caméra locale occupe le fond. Barre d'état masquée, colorScheme épinglé en sombre, safe area gérée par insets de chrome. Pendant une reconnexion avec média déjà établi, la disposition connectée est conservée (jamais d'écran de connexion ni de bannière plein écran). Le chevron réduit l'appel en pilule par un morph (échelle, opacité, coins 32) ; un glissé vers le bas fait de même. VoiceOver annonce connexion, connecté, reconnexion, fin, qualité faible/restaurée, réseau faible du contact et signalisation perdue.

Écarts :
- Fond sombre épinglé (dégradé 3 stops) indépendant du thème : Android utilise backgroundPrimary, donc texte et contrôles blancs illisibles en thème clair.
- Fond du contact : bannière de profil (fallback avatar) en plein cadre, flou ~20 dp, échelle 1.08, voile dégradé, tant qu'aucune vidéo distante ; profil résolu cache-first puis rafraîchi en silence.
- Aperçu caméra locale en plein écran (miroir avant, voile noir 0.5) pendant sonnerie/offre/connexion, retiré une fois connecté pour ne pas doubler la vignette.
- Conserver la disposition connectée en RECONNECTING si le média a déjà été établi (hasEstablishedMedia) ; l'état de reconnexion ne vit que dans une pastille discrète et le glyphe de la puce de durée.
- Glissé vers le bas : l'écran suit le doigt (course 300 dp, validation à 75 % ou lancer prédit), retombe si relâché avant ; désactivé en groupe et quand un mode/panneau est ouvert ; issue = pilule ou PiP système.
- Morph de réduction/agrandissement (échelle 1→0.1 ancrée en haut, opacité -0.55, coins jusqu'à 32 dp, ressort ~0.4 s) ; Reduce Motion = bascule directe.
- Annonces d'accessibilité (announceForAccessibility / liveRegion) à chaque transition d'état et aux bascules de qualité (locale, contact, signalisation).
- Mode immersif (barres système masquées) et insets haut/bas explicites pour le chrome, car la racine ignore la safe area.

Rendu : Écran blanc-sur-sombre fixe (surfaceDarkBase/Deep/Raised, MeeshyColors), pas de bande claire sous la Dynamic Island/barre de statut : le fond couvre les quatre bords. Chrome haut à insetTop+8, pilule à insetBottom+12. Pulse et animations coupées si Réduire les animations.

Transposition Android : fullScreenCover/UIWindow -> couche Compose racine ou CallActivity dédiée ; Liquid Glass -> surfaces translucides (RenderEffect blur API 31+, repli scrim) ; statusBarHidden -> WindowInsetsController immersif ; UIAccessibility.post -> announceForAccessibility.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallUiState.kt`

### La connexion WebRTC d'un appel est établie de façon fiable (ICE, SDP, rôle poli, médias)

`call-webrtc-peer-core` · Android : **partielle** · P0 · effort M

Noyau du client P2P : configuration RTCConfiguration (unified plan, max-bundle, rtcp-mux, DTLS-SRTP, pool de candidats ICE pré-chauffé à 4), alerte sans TURN, mise à jour des serveurs ICE sans reconnexion, rôle de négociation poli/impoli (le plus petit id est poli), médias locaux avec annulation d'écho / réduction de bruit / gain auto, transceivers attachés au moment du SDP (l'offreur à createOffer, le répondeur APRÈS setRemoteDescription — cause racine du média à sens unique), offre/réponse/ICE restart/candidats en async, état de connexion typé, pistes distantes audio/vidéo, canal de données, erreurs typées (pas de caméra, simulateur, offre ignorée, permission caméra), fabrique WebRTC partagée, repli en simulateur.

Écarts :
- iceCandidatePoolSize = 4 et contrainte DtlsSrtpKeyAgreement absents de createConnection.
- Contraintes audio (echoCancellation, noiseSuppression, autoGainControl) et configuration JavaAudioDeviceModule ; l'audio source est créée avec des contraintes vides.
- updateIceServers (setConfiguration sans reconnexion) : l'Android ne l'utilise que pour l'entrant (awaitingIncomingIce) ; un rafraîchissement TURN en cours d'appel n'est jamais appliqué (voir call-reliability-self-heal).
- Rôle poli/impoli déterministe (id le plus petit) et gestion offerIgnored : le coordinateur Android n'a qu'un drapeau isCaller ; ajouter la règle de collision d'offres.
- Transceivers : attacher les pistes au moment du SDP (offreur à createOffer, répondeur après setRemoteDescription) ; aujourd'hui addTrack au createConnection.
- Validation du SDP distant et filtre d'admission des candidats ICE (WebRTCSdpRules.validateRemoteSDP / admits) ; alerte « aucun TURN ».
- Étendre les observateurs : onDataChannel, état de connexion complet (new, connecting, connected, disconnected, failed, closed), didChangeCameraInterruption.
- Erreurs typées WebRTCError et repli audio-only (caméra absente/refusée).

Transposition Android : RTCPeerConnection/RTCPeerConnectionFactory (GoogleWebRTC) -> org.webrtc (stream-webrtc-android) ; PeerConnectionDelegate -> PeerConnection.Observer.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+PeerConnectionAsync.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+PeerDelegates.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+Fallback.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCClientProviding.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCClientDelegate.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCError.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCSharedFactory.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSignalMapper.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`

### Choisir la sortie audio (écouteur, haut-parleur, Bluetooth, casque, voiture) et ne jamais perdre le son après une interruption

`calls-audio-routing-interruptions` · Android : **partielle** · P0 · effort M

configureAudioSession règle la session .playAndRecord/.voiceChat (ou .videoChat), la route haut-parleur (applySpeakerRoute, hors fil principal, échec rendu), le capteur de proximité (écran éteint à l'oreille) et le repli « micro coincé coupé ». CallAudioRouteService expose les entrées disponibles (micro intégré, récepteur, haut-parleur, Bluetooth HFP/A2DP/LE, AirPlay, casque filaire, voiture, USB), l'entrée sélectionnée, la sortie courante, les changements de route, et permet de choisir une entrée (jamais sur le fil principal, #8989). AudioInterruptions reprend l'audio après un appel GSM / alarme / Siri (sans reprise explicite, l'audio VoIP restait muet), suit les changements de route (nouvel appareil, appareil retiré, override) et la réinitialisation des services média.

Écarts :
- Bouton « Sortie » et sélecteur de route absents : seul le basculement écouteur ↔ haut-parleur existe (CallAudioRoute.actionFor) ; ajouter la liste AudioManager.availableCommunicationDevices (TYPE_BLUETOOTH_SCO, BLE_HEADSET, WIRED_HEADSET, USB_HEADSET, HEARING_AID, BUILTIN_EARPIECE/SPEAKER) avec libellés et icônes par type, et la sélection.
- Aucune surveillance des changements de route (casque branché/débranché, Bluetooth connecté/perdu) : désactiver le haut-parleur quand une sortie externe apparaît, réconcilier le drapeau isSpeaker avec la route réelle (reconcileSpeakerWithCurrentOutput).
- Gestion du focus audio absente : demander AUDIOFOCUS_GAIN_TRANSIENT à l'appel, réagir à AUDIOFOCUS_LOSS (appel GSM, alarme, assistant) et reprendre l'audio WebRTC à la fin de l'interruption.
- Capteur de proximité : écran éteint quand le téléphone est à l'oreille en appel audio (PROXIMITY_SCREEN_OFF_WAKE_LOCK), désactivé pendant le haut-parleur et la vidéo.
- Repli « micro coincé coupé » (scheduleStuckMutedFallback) : si l'activation audio n'arrive jamais, forcer le rétablissement du micro.
- Mode audio adapté à la vidéo : MODE_IN_COMMUNICATION est posé une fois ; réappliquer la route/le mode (voice vs video) lors d'une bascule audio ↔ vidéo en cours d'appel.
- Option d'entrée : choix du micro (entrées multiples) comme CallAudioRouteState.offersInputChoice.

Rendu : Bouton « Sortie » dont l'icône reflète la sortie réelle (téléphone, haut-parleur, casque/Bluetooth, voiture, hifi) ; feuille de choix en liste avec coche sur la route active, cibles ≥ 48 dp.

Transposition Android : AVAudioSession routeChangeNotification / availableInputs / setPreferredInput → AudioManager.addOnCommunicationDeviceChangedListener + setCommunicationDevice (API 31+) / BluetoothSco legacy ; interruptionNotification → AudioFocusRequest + OnAudioFocusChangeListener ; proximity → PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+AudioSession.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Speaker.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallAudioRouteService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+AudioInterruptions.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallAudioRoute.kt`

### Un appel traverse toujours les mêmes états, de la sonnerie à la fin, avec une durée lisible et prononçable

`calls-core-state-machine` · Android : **partielle** · P0 · effort S

CallState (idle, ringing sortant/entrant, offering, connecting, connected, reconnecting(tentative), ended(raison)) est piloté par CallStateMachine (événements ring, offerSent, answered, rejoined, mediaConnected, linkLost, ended, settled). CallEndReasonMapper traduit la raison brute de call:ended (missed/no_answer, rejected/declined, answered_elsewhere, failed/connectionlost, sinon raccroché distant). La durée s'affiche « 02:05 » (« 1:02:05 » dès 1 h) et se prononce « 2 minutes 5 secondes ». CallManagerHost porte la pile d'appel sans la construire : elle ne naît qu'au premier appel (démarrage à froid).

Écarts :
- Format de durée divergent : iOS rend « 02:05 » (minutes sur deux chiffres, heures dès 3600 s) via LocalizedNumber.duration, Android CallDuration.clock rend « 2:05 » — aligner sur MM:SS et localiser les chiffres.
- Durée PARLÉE absente : ajouter un contentDescription TalkBack « 2 minutes 5 secondes » (plurals localisés) sur chaque site de la minuterie (écran d'appel, pastille flottante, notification en cours) ; un lecteur d'écran lit « 02:05 » comme une heure.
- Aucun drapeau « appel actif » lisible hors thread principal : le socket du SDK ne doit jamais se reconnecter de force (rotation de jeton, ré-authentification) pendant un appel — iOS expose CallManager.isCallActiveFlag à ses managers via une closure injectée, rien d'équivalent dans sdk-core/core-network.
- Pile d'appel non paresseuse : WebRtcEngine crée EglBase à l'instanciation du singleton et le CallViewModel est Activity-scoped ; mesurer le coût au démarrage à froid et différer EglBase/PeerConnectionFactory jusqu'au premier appel (iOS CallManagerHost, #7955 : 983 des 1 318 échantillons du fil principal à t = 10 s).

Rendu : Minuterie en police chiffres tabulaires, format MM:SS ; aucun autre rendu propre à cette couche (la vue d'appel plein écran relève de la partie « vue d'appel »).

Transposition Android : CallManagerHost → Provider Hilt paresseux (dagger.Lazy<WebRtcEngine>) ; isCallActiveFlag → AtomicBoolean exposé par un CallActivityGate (sdk-core) lu par le socket manager ; durée parlée → DateUtils.formatElapsedTime + plurals Android.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallStateMachine.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallEndReasonMapper.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManagerHost.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Duration.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallUiState.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallState.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallStateMachine.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallEvent.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallDuration.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSignalMapper.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`

### Je décroche un appel entrant : l'offre de l'appelant est attendue et ma réponse part même après un démarrage à froid

`calls-incoming-answer-flow` · Android : **partielle** · P0 · effort M

answerCall passe en .connecting avant l'arrivée de l'offre SDP et arme un chien de garde « l'offre n'est jamais venue » (échec propre + notification de la passerelle plutôt qu'un zombie). joinCallRoomReliably force la connexion du socket, attend isConnected puis émet un call:join fiable (sinon le serveur rejette tous les call:signal « Sender not a participant » et l'appelant tombe en manqué). L'offre distante reçue pendant la sonnerie est mise en attente et rejouée au décroché ; un rejeu exact d'une offre reçoit la MÊME réponse sans renégocier. Dans un appel de groupe, le pair principal est l'invitant (call:participant-invited) et un duo devenu groupe est signalé par isGroup.

Écarts :
- Chien de garde « offre jamais reçue » après le décroché (CallManager+Answer) : le watchdog Android couvre Connecting (CallConnectingWatchdog) mais pas l'attente spécifique de l'offre ; échouer proprement et notifier la passerelle (call:end/leave) au lieu d'attendre le reaper serveur.
- Offre distante reçue AVANT le décroché : la mettre en file (pendingRemoteOffer) et la rejouer à l'acceptation ; vérifier que les candidats ICE arrivés avant la description distante sont mis en file puis vidés (flushPendingIceCandidates) — WebRTC Android refuse addIceCandidate sans remote description.
- Rejeu d'offre : mémoriser (AnsweredRemoteOffer) la dernière offre répondue et resservir la même réponse sans renégocier quand la passerelle rejoue l'offre à chaque (re)jonction.
- Appel de groupe : désigner le pair principal (l'invitant d'un call:participant-invited, sinon l'initiateur) et traiter isGroup — absent tant que le maillage de groupe n'existe pas.
- Bouton Répondre de la notification : vérifier la reprise à froid complète (ConnectionState du socket attendu avant call:join) — emitJoinAwaitingAck attend déjà le socket, tester le cas écran verrouillé.

Rendu : Écran entrant : nom + badge type d'appel, boutons Refuser (rouge) / Répondre (vert/accent) ; après décroché, libellé « Connexion… » jusqu'à l'offre ; haptique légère au décroché.

Transposition Android : CXAnswerCallAction tenue en attente jusqu'à la connexion (hold-and-settle) → Connection.onAnswer() / CallControlScope.answer() de core-telecom, validée à la connexion média ; sinon simple accept() VM tant que le Telecom n'est pas livré.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Answer.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+IncomingSignal.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+IncomingOffer.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallJoinAck.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSignalMapper.kt`

### Un appel entrant fait sonner le téléphone même app fermée ou écran verrouillé, sans doublon ni appel fantôme

`calls-incoming-ring-wake` · Android : **partielle** · P0 · effort M

VoIPPushManager enregistre le jeton PushKit auprès de la passerelle (retry, réenregistrement, désinscription au logout) et reçoit les pushes d'appel. VoIPDedupRing déduplique les callId par fenêtre de temps (capacité + TTL) pour qu'un retry APNs ne fasse pas deux cartes d'appel. CallManager+IncomingCall rapporte l'appel à CallKit, vérifie la fraîcheur via GET /api/v1/calls/:callId (l'appel est-il toujours actif ? sinon termine la carte), traite la push call_cancel (appel non décroché : missed/rejected) et l'événement « décroché ailleurs » (multi-appareils), gère les appels fantômes et met à jour le nom de l'appelant. L'app au premier plan sonne aussi in-app.

Écarts :
- Contrôle de fraîcheur REST absent : à la réception d'une push d'appel, vérifier GET /calls/:callId (actif ?) et couper sonnerie + notification si l'appel est déjà fini (push livrée tard, appareil hors ligne).
- Écran verrouillé Android 14+ : USE_FULL_SCREEN_INTENT est déclaré mais le droit est révocable — vérifier NotificationManager.canUseFullScreenIntent() et rediriger vers ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT ; sinon la bannière heads-up reste la seule alerte.
- Aucun service de premier plan (foregroundServiceType phoneCall) ni ConnectionService : le processus peut être tué entre la push et le décroché ; voir calls-telecom-foreground-service.
- Annulation multi-appareils : l'anneau de dédup, call_cancel et call_answered_elsewhere existent (IncomingCallPushRouter) mais vérifier l'arrêt de la sonnerie du CallToneController en plus de la notification, et l'effacement du ring store au teardown (forget).
- Enregistrement du jeton FCM d'appel (priorité haute, canal calls v2) : vérifier retry/réenregistrement et désinscription au logout (iOS unregisterAndClearToken, forceReregister, retryPendingTokenRegistration).
- Appel entrant au premier plan sur un autre écran : navigation automatique déjà faite (LaunchRouter.routeIncomingSocketOffer) mais pas de superposition par-dessus un plein écran (story, reels, visionneuse) — iOS pose la vue d'appel par-dessus (#8725).

Rendu : Notification d'appel: CallStyle.forIncomingCall avec avatar de l'appelant, texte « Appel audio/vidéo entrant » localisé par le serveur (Prisme), boutons Refuser/Répondre, sonnerie en usage ring + vibration (0,1 s on, 0,8 s off).

Transposition Android : PushKit VoIP + CallKit reportNewIncomingCall → message FCM data priorité HIGH + notification CallStyle + full-screen intent (déjà là) puis, en cible, core-telecom CallsManager.addCall(incoming) qui garantit la sonnerie même en Doze ; VoIPDedupRing → SeenCallRing (déjà porté).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/VoIPDedupRing.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+IncomingCall.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/IncomingCallRingStore.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclinedCallStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/IncomingCallPush.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/IncomingCallPushRouter.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`

### Couper le micro, activer/éteindre la caméra, basculer audio ↔ vidéo en plein appel et choisir la caméra

`calls-media-controls` · Android : **partielle** · P0 · effort M

toggleMute informe CallKit (Watch, écran de verrouillage, CarPlay restent synchronisés ; reportToCallKit=false quand l'action vient de CallKit), les pairs (call:toggle-audio) et l'interface. toggleVideo gère la bascule audio → vidéo en cours d'appel façon FaceTime : acquisition de la caméra, rattachement à l'émetteur vidéo réservé, renégociation SDP quand la direction change (createOffer → émission, le pair répond), avec toast « Impossible d'activer la vidéo » et accès refusé → Réglages. switchCamera bascule avant/arrière (miroir uniquement pour l'avant), availableCameras/selectCamera servent le sélecteur d'appareil (iPad, Mac, Continuity, USB). CallMuteSync réapplique l'état du micro à la piste qui vient de naître, y compris quand le démarrage échoue après la création de la piste audio, et réannonce l'état aux pairs. publishListeningIntent signale qui lit les sous-titres. CallManager+Controls applique le mute d'un modérateur.

Écarts :
- Bascule audio → vidéo en cours d'appel absente : toggleCamera n'existe que pour un appel vidéo (isCameraOn = isVideo && …) ; WebRtcEngine.createConnection n'ajoute la piste vidéo qu'au démarrage — ajouter upgradeToVideo()/downgradeFromVideo() avec transceiver vidéo réservé et renégociation.
- Bascule caméra avant/arrière absente (WebRtcEngine ne garde que le premier capturer face avant) : CameraVideoCapturer.switchCamera, miroir uniquement de l'avant (isUsingFrontCamera), suivi optimiste.
- Sélecteur d'appareil caméra (tablettes, ChromeOS, USB) : availableCameras / selectCamera par deviceId.
- Resynchronisation du micro à la naissance de la piste (startLocalMediaKeepingMute) : un micro coupé avant l'existence de la piste ne doit pas être perdu, et le pair doit le redécouvrir (réannonce).
- Annonce du micro/caméra aux pairs : call:toggle-audio/toggle-video émis (vérifier la réannonce au changement de piste et après reconnexion).
- Erreurs localisées : toast « Impossible d'activer la vidéo » et « Caméra : accès refusé — toucher pour ouvrir les Paramètres ».
- Intention d'écoute des sous-titres (publishListeningIntentIfChanged) — voir calls-live-captions-transcription.
- Haptiques sur mute/caméra/haut-parleur (légère) comme CallManager.playHaptic.

Rendu : Rangée de commandes en pilule : micro, caméra, haut-parleur/sortie, bascule caméra, raccrocher (rouge, plus grand) ; états actif/inactif par icône pleine/barrée et opacité, cibles ≥ 48 dp, retour haptique léger.

Transposition Android : AVCaptureDevice front/back → Camera2Enumerator + CameraVideoCapturer.switchCamera ; renégociation → PeerConnection.createOffer + setLocalDescription avec transceiver réservé (RtpTransceiverDirection) ; Watch/CarPlay → via core-telecom (onMuteStateChanged).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+MediaControls.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+MuteSync.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### Je lance un appel : le micro est demandé d'abord, une caméra refusée bascule en audio, et un appel sans réponse se range en manqué

`calls-outgoing-call-flow` · Android : **partielle** · P0 · effort M

requestPermissionsThenStartCall tranche le micro AVANT de composer (un refus annule l'appel et renvoie vers les Réglages ; sinon l'appel se « connectait » muet), la caméra n'est jamais bloquante (refus ⇒ appel audio). startCall refuse un second appel avec le toast « Un appel est déjà en cours », réinitialise un état .ended résiduel, émet call:initiate (ack = id réel), sonne, puis une garde locale de sonnerie (≈45 s sortant, marge côté appelé) termine en manqué si call:ended est perdu. continueAudioOnly (CallVideoFallback : simulateur, permission caméra refusée, aucune caméra) poursuit en audio et prévient le pair par call:media-toggled(video,false) (toast « Caméra : accès refusé — toucher pour ouvrir les Paramètres »). retryCall rejoue le dernier contexte sortant après un échec transitoire.

Écarts :
- Refus du micro silencieux : CallScreen.withMediaPermissions n'exécute rien si RECORD_AUDIO est refusé — l'écran reste figé sans message ; annuler l'appel, afficher « accès refusé » avec action vers les Réglages de l'app (Settings.ACTION_APPLICATION_DETAILS_SETTINGS).
- Pas de repli audio signalé : WebRtcEngine.createCameraCapturer retourne null en silence (caméra absente/refusée) sans émettre call:toggle-video(false) ni informer l'utilisateur ; implémenter CallVideoFallback (permissionDenied / noCamera) avec le toast cliquable vers les Réglages et l'avatar côté pair.
- Pas de toast « Un appel est déjà en cours » quand on compose pendant un appel actif (CallViewModel.start ignore silencieusement via canStart).
- Garde locale de sonnerie : aucun minuteur sortant (≈45 s) ni entrant (marge sur le budget serveur) qui termine en manqué si call:ended/call:missed est perdu (réseau coupé) ; seule la fin serveur existe.
- Remise à zéro forcée d'un état Ended résiduel quand un nouvel appel (entrant ou sortant) arrive pendant la fenêtre de règlement de 1,5 s (resetEndedStateForNewCall).
- Réessayer : vérifier que retry() rejoue le contexte sortant complet (conversation, type) comme CallManager.retryCall.
- Pas de permission caméra demandée au moment de passer en vidéo : Android demande RECORD_AUDIO + CAMERA ensemble (RequestMultiplePermissions) ; iOS tranche micro bloquant puis caméra facultative.

Rendu : Écran d'appel sortant : avatar/nom + « Appel en cours… » pendant la sonnerie ; toasts d'erreur locaux (pas des bannières de notification) ; état terminé « Appel manqué » avec bouton Réessayer si échec transitoire.

Transposition Android : AVAudioApplication.requestRecordPermission / AVCaptureDevice → ActivityResultContracts.RequestMultiplePermissions + shouldShowRequestPermissionRationale ; Réglages → Settings.ACTION_APPLICATION_DETAILS_SETTINGS ; FeedbackToastManager → Toast/Snackbar local.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Outgoing.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+VideoFallback.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+RemoteEvents.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPermissions.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallInitiateAck.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallRetryPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`

### Une coupure réseau ne tue pas l'appel : reconnexion automatique avec recul, auto-guérison d'un lien à moitié ouvert

`calls-reconnect-reliability` · Android : **partielle** · P0 · effort M

Moniteur de fiabilité périodique : en .connecting, chien de garde ICE/DTLS (un restart ICE puis échec), en .connected auto-guérison du « half-open » (lien déclaré connecté sans média réciproque), en .reconnecting budget de tentatives avec recul exponentiel. attemptReconnection coalesce les déclencheurs externes (NWPathMonitor, état PC, watchdog) dans un cycle en vol pour qu'un battement réseau ne consume pas le budget ; seul l'escalade avance le budget jusqu'à connectionLost. Les identifiants TURN sont rafraîchis avant expiration (TTL) et relancent ICE discrètement ; les candidats ICE sont gardés jusqu'à la description distante. NetworkMonitoring déclenche la reconnexion sur Wi-Fi ↔ cellulaire, perte et retour ; isSignalingDegraded affiche une bannière quand la signalisation est coupée sur un appel établi. Heartbeat régulier.

Écarts :
- CallReliabilityPolicy (evaluateHalfOpen, evaluateConnecting, evaluateReconnecting, signalingDegraded, shouldRearmRestartOnCredentialRefresh…) est porté dans core-model mais AUCUN appelant dans feature/calls : câbler le moniteur périodique (tick) qui l'exécute.
- Auto-guérison du lien « half-open » en .connected (aucun octet reçu après la période de grâce) : absente, un média mort reste « connecté ».
- Surveillance du réseau : aucun ConnectivityManager.NetworkCallback dans le flux d'appel — un changement Wi-Fi ↔ LTE n'est détecté que par l'état ICE ; ajouter les arêtes perdu/retour qui déclenchent attemptReconnection(escalate:false) avec coalescence.
- Rafraîchissement des identifiants TURN avant expiration (TTL) : Android traite call:ice-servers-refreshed mais ne planifie pas la demande (scheduleTURNCredentialRefresh) ni le watchdog/retry de rafraîchissement.
- Bannière « signalisation dégradée » (isSignalingDegraded : socket coupé sur appel établi) et « lien dégradé » (DegradedLinkTracker → isLinkQualityDegraded) absentes de l'état d'UI.
- Coalescence des déclencheurs de reconnexion pour ne pas brûler le budget maxReconnectAttempts sur un seul battement réseau.

Rendu : Libellé « Reconnexion (n)… » et glyphe de signal passant en rouge/ambre ; bannière discrète sous l'en-tête « Connexion instable » ; aucune interruption du plein écran.

Transposition Android : NWPathMonitor → ConnectivityManager.registerDefaultNetworkCallback (onLost/onAvailable/onCapabilitiesChanged) ; Task.sleep cancellable → delay() dans un CoroutineScope d'appel ; UserDefaults → inutile ici.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Reconnection.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Connection.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+NetworkMonitoring.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallReconnectBudget.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallConnectingWatchdog.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHeartbeatTicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallReliabilityPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`

### L'appel reste vivant en arrière-plan et s'intègre à l'interface d'appel du système (écran verrouillé, Bluetooth, montre, voiture)

`calls-telecom-foreground-service` · Android : **partielle** · P0 · effort L

CallKit (CXProvider + CXCallController + CallKitDelegateProxy) tient l'interface système de l'appel : répondre, raccrocher, couper le micro, mettre en attente, DTMF, activation/désactivation de la session audio ; l'action de réponse est tenue jusqu'à la connexion (hold-and-settle, filet de sécurité de 10 s) pour que le chrono d'appel ne démarre pas avant la connexion ; un appel in-app qui sonnait est promu vers CallKit au passage en arrière-plan ; providerDidReset abandonne proprement. Sur Android l'équivalent est un ConnectionService auto-géré (core-telecom) adossé à un service de premier plan.

Écarts :
- TelecomCallReporter n'est qu'un LogTelecomCallReporter : aucune implémentation ConnectionService / PhoneAccount / core-telecom CallsManager ; la politique pure TelecomCallPolicy (états Dialing/Ringing/Active/Disconnected + causes) est prête mais reste sans actionneur.
- Aucun service de premier plan pour l'appel (AndroidManifest ne déclare que MeeshyFcmService) : sans foregroundServiceType phoneCall|microphone|camera, Android 14+ coupe la capture micro/caméra dès que l'app passe en arrière-plan — régression bloquante d'un appel en cours.
- Permission MANAGE_OWN_CALLS + enregistrement du PhoneAccount auto-géré (CAPABILITY_SELF_MANAGED) absents ; fonctionnalités système gratuites perdues : sonnerie fiable en Doze, bascule Bluetooth/voiture, raccrocher depuis la montre, actions de l'écran de verrouillage.
- Notification d'appel en cours (CallStyle.forOngoingCall avec chronomètre, bouton Raccrocher, retour à l'app) absente — c'est aussi l'équivalent de la Live Activity.
- Action de réponse tenue jusqu'à la connexion média (hold-and-settle) pour que le chrono système ne démarre pas trop tôt ; délai de sécurité de 10 s.
- Gérer providerDidReset : l'équivalent est la destruction du ConnectionService par le système — abandonner l'appel sans call:end (la grâce serveur décide).
- Plateforme sans téléphonie (tablette Wi-Fi, ChromeOS) : repli in-app sans Telecom, comme iOS sur Mac/simulateur/Chine (platformUsesCallKit).

Rendu : Interface système: carte d'appel du système (nom + avatar), notification en cours avec chronomètre « mm:ss », bouton Raccrocher rouge, tap = retour à l'écran d'appel.

Transposition Android : CallKit CXProvider/CXCallController → androidx.core:core-telecom CallsManager (registerAppWithTelecom, addCall, CallControlScope) + ForegroundService(type=phoneCall\|microphone\|camera) + notification CallStyle ; CXAnswer/EndCall/SetMuted/SetHeld → callbacks onAnswer/onDisconnect/onSetActive/onSetInactive ; MIIT Chine → repli in-app.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+CallKitProxy.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/TelecomCallReporter.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/TelecomCallPolicy.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/AndroidManifest.xml`

### Le moteur d'appel établit un lien audio/vidéo stable et mesuré avec le pair

`calls-webrtc-engine` · Android : **partielle** · P0 · effort L

WebRTCService enveloppe la pile WebRTC : configure (ICE servers par utilisateur, échec remonté), createOffer/createAnswer/setRemoteDescription avec doublons ignorés, addICECandidate, startLocalMedia, muteAudio, enableVideo, upgrade/downgrade vidéo, switchCamera, performICERestart, getStats et moniteur de qualité (tick périodique : débit cumulé, niveau de qualité, perte de paquets), plafonds d'encodage audio/vidéo et degradationPreference selon thermique/profil de données/survie, canal de données « transcription » (bye in-band, entrées de transcript, ping), DTMF, sendHangupBye (coupure instantanée façon WhatsApp), updateNetworkPath. CallManager+WebRTCDelegate rebranche chaque rappel sur la machine d'états : candidats ICE locaux, état de connexion, pistes distantes, interruption caméra (C3), niveau de qualité, statistiques.

Écarts :
- Aucune collecte de stats : pas de PeerConnection.getStats ni de moniteur de qualité périodique — CallQualitySampler est un NoopCallQualitySampler, donc call:quality-report et l'indicateur de signal restent muets (le modèle CallStats/CallQuality est porté mais inutilisé).
- Aucun canal de données : DataChannelCodec (bye/ping/caption) est porté dans core-model mais WebRtcEngine laisse onDataChannel en Unit ; créer le canal « transcription », router bye (coupure instantanée) et transcriptEntry vers la machine d'états, envoyer sendHangupBye à la fin.
- Plafonds d'encodage dynamiques absents : pas d'RtpParameters (maxBitrateBps, maxFramerate, degradationPreference) ni d'échelle de qualité ; capture figée en CAPTURE_WIDTH/HEIGHT/FPS.
- Doublons de description distante : ne pas réappliquer une réponse déjà appliquée (l'appelé la renvoie quand l'accusé tarde, la passerelle la rejoue après reconnexion) et resservir la MÊME réponse à un rejeu d'offre — l'échec qui en résultait faisait raccrocher un appel sain (2026-09-30, #11468).
- Échec de configuration remonté (configure → false) pour abandonner l'installation de l'appel au lieu d'un message trompeur plus loin.
- Interruption de la session caméra (C3) : aucun signal quand la caméra cesse de livrer des images (appel entrant, multitâche) ; émettre call:toggle-video(false) puis reprendre.
- Profil de données (CallDataProfile : Wi-Fi, cellulaire, économiseur de données) qui plafonne audio+vidéo et façonne le fmtp Opus de la prochaine description locale.
- DTMF et updateNetworkPath absents.

Rendu : Aucun rendu direct ; alimente l'indicateur de signal, les bannières de qualité et le rendu vidéo (SurfaceViewRenderer/TextureView) : image distante plein écran, aperçu local en vignette miroir.

Transposition Android : RTCPeerConnection (GoogleWebRTC) → org.webrtc.PeerConnection (libwebrtc Android, déjà embarquée) ; getStats → RTCStatsCollectorCallback ; canal de données → PeerConnection.createDataChannel ; degradationPreference/maxBitrate → RtpSender.parameters ; AVCaptureSession interruption → CameraVideoCapturer.CameraEventsHandler.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTCService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+WebRTCDelegate.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+DataChannel.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/RemoteTrackRegistry.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DataChannelProtocol.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallStats.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`

### La qualité de l'appel se mesure toutes les 5 s et ajuste le débit pour garder un appel fluide

`call-adaptive-quality-stats` · Android : **partielle** · P1 · effort M

Seuils de qualité (RTT, perte, gigue calibrés sur des liaisons longue distance réelles), niveaux excellent/bon/moyen/faible/critique, réduction des statistiques WebRTC en CallStats (compteurs cumulés, route relayée, débit sortant disponible) puis échantillon d'intervalle (ratio de perte par delta), suiveurs d'hystérésis : « Connexion instable » seulement après 2 ticks dégradés consécutifs (~10 s), plafond de débit audio piloté par la gigue après 2 ticks élevés, plafond thermique de l'encodeur (nominal/fair/serious/critical). Alimente le glyphe de signal, le rapport serveur, la survie vidéo, la feuille de qualité et le journal réseau.

Écarts :
- Collecteur de stats réel : PeerConnection.getStats toutes les 5 s -> RawEntry -> CallStats.reduce -> intervalQualitySample ; aujourd'hui NoopCallQualitySampler n'émet rien donc barres de qualité, survie vidéo et rapports restent inertes.
- DegradedLinkTracker (2 ticks dégradés consécutifs, reprise immédiate, fair ne alerte jamais) et JitterBitrateCapTracker : absents.
- Boucle adjustBitrate (échelle RTT/perte -> cible d'encodeur) combinée au plafond thermique (PowerManager.getCurrentThermalStatus -> ThermalState, déjà pur) et appliquée à l'émetteur.
- Publication du niveau en direct (liveVideoQualityLevel, CallSignalStrength pour le glyphe de signal) et du call:quality-report périodique.
- Vérifier la parité des valeurs de CallQualityThresholds avec QualityThresholds iOS (iceCandidatePoolSize, opus fmtp, audioCodecFloorBitrateBps, survie 8/…s).

Rendu : Glyphe de signal transitoire (barres) près de la durée ; pastille « Réseau faible (contact) » sans bannière pop-up.

Transposition Android : RTCStatisticsReport (iOS) -> RTCStatsReport via PeerConnection.getStats ; ProcessInfo.thermalState -> PowerManager thermal status.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/QualityThresholds.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoQualityLevel.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallStats.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/DegradedLinkTracker.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/JitterBitrateCapTracker.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoThermalProfile.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallStats.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSenderCap.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallQualitySampler.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallQualityResetTimer.kt`

### Je choisis où sort et d'où vient le son de l'appel (écouteur, haut-parleur, Bluetooth, casque)

`call-audio-route-picker` · Android : **partielle** · P1 · effort M

Le bouton « Sortie » de la pilule ouvre le sélecteur de route audio système ; le ViewModel lit la route courante hors du fil principal, s'abonne aux changements de route, sélectionne l'entrée préférée de façon optimiste avec annulation et rollback à l'échec, journalise l'erreur. Les changements de route (branchement d'un casque, Bluetooth) se reflètent immédiatement dans l'interface.

Écarts :
- Android n'a qu'un bascule haut-parleur (CallAudioRoute.actionFor : setCommunicationDevice API 31+ / speakerphone) ; ajouter l'énumération des appareils de communication (écouteur, haut-parleur, Bluetooth SCO/LE, casque filaire, USB).
- État de route (CallAudioRouteState : sorties, entrées, sélection courante) rafraîchi sur AudioDeviceCallback ; abonnement start/stop.
- Sélecteur (bottom sheet / menu) ouvert par « Sortie » ; sélection optimiste + rollback + log à l'échec.
- Permission BLUETOOTH_CONNECT (API 31+) et gestion de la déconnexion du périphérique en cours d'appel (retour à l'écouteur ou haut-parleur selon vidéo).

Rendu : Glyphe de sortie 50 dp dans la pilule, bascule visuelle haut-parleur actif en disque blanc.

Transposition Android : AVRoutePickerView/AVAudioSession -> AudioManager.getAvailableCommunicationDevices + setCommunicationDevice + AudioDeviceCallback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/CallAudioRouteViewModel.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallAudioRoute.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`

### L'appel réduit devient une bulle déplaçable qui se pince en 4 tailles et propose un mini-menu

`call-bubble-floating-return` · Android : **partielle** · P1 · effort M

Réduit, l'appel vit en pilule flottante puis, par glissé horizontal (plus de 80 pt ou 500 pt/s), en bulle d'avatar circulaire de 56 pt : déplaçable avec accroche au bord gauche/droit le plus proche (marge 20, Y borné hors zone du bouton flottant), pinçable en 4 paliers cercle · petit 90x160 · moyen 120x213 · grand 160x284 (9:16, morphing continu, coins 28->20), biais de vélocité au relâchement. Au palier cercle, appui long 0,5 s = mini-menu (micro, haut-parleur, raccrocher) ; aux paliers rectangle une barre persistante apparaît en haut. Un toucher rend le plein écran (haptique medium). Visuel : flux distant sinon avatar cache-first ; glyphe de signal en coin. Accessibilité : taille ajustable, actions nommées.

Écarts :
- Android n'a que la pilule pleine largeur (initiale, statut coloré, glyphe) : ni vidéo distante dans la pilule, ni geste de repli, ni bulle.
- Résolveur pur CallBubbleGestureResolver (seuils 80/500, snappedEdge, clampedVerticalPosition, tailles par palier, interpolation, opacité de la barre, nextTier avec biais de vélocité) + CallBubbleSizeTier + BubbleHorizontalEdge.
- Bulle Compose : drag libre avec snap de bord, pinch 4 paliers morphant, long-press 0,5 s -> mini-menu (mute, haut-parleur, raccrocher, fermeture auto 3 s), tap -> plein écran avec haptique.
- Visuel participant partagé (flux distant si actif, sinon avatar cache-first, 44 dp en pilule / 56 dp ou palier rectangle en bulle) avec glyphe de signal.
- Mode d'affichage fullScreen / pip / bubble persistant dans le gestionnaire d'appel ; accessibilité (actions « Revenir au plein écran », « Ouvrir le mini-menu », ajustable pour la taille).
- Hors app (écran d'accueil) : voir call-system-pip.

Rendu : Bulle 56 dp, ombre 8, coins interpolés, glyphe de signal décalé (16,-16) sur disque noir .5, boutons du mini-menu 8 dp d'écart, rectangles 9:16 avec barre d'actions en haut.

Transposition Android : Fenêtre passe-plat UIKit -> overlay Compose draggable au sommet du NavHost ; SurfaceViewRenderer arrondi pour la vidéo ; hors app -> PiP Activity (pas de SYSTEM_ALERT_WINDOW).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallBubbleSizeTier.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallDisplayMode.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`

### Je peux retourner la caméra ou en choisir une autre, avec miroir juste et reprise après interruption

`call-camera-capture-pipeline` · Android : **partielle** · P1 · effort M

Pipeline de capture caméra d'un appel : retourner avant/arrière sans renégocier, sélecteur de caméra quand il y en a plusieurs (externes, Continuity, USB) à partir d'un catalogue trié et libellé, choix du format de capture selon VideoConfig (720p/30), observateur d'interruption de capture (la session interrompue ne livre plus de trames, quelle qu'en soit la raison), caméra créée paresseusement lors d'un passage audio->vidéo (voyant éteint pendant l'audio). Règles de miroir : l'aperçu local de la caméra avant est en miroir, le flux envoyé jamais, la capture photo/film jamais ; l'aperçu suit la caméra réellement confirmée par les trames, pas l'intention. Erreurs typées (permission refusée, aucune caméra, simulateur) avec repli audio.

Écarts :
- Retourner la caméra (switchCamera du CameraVideoCapturer) : absent, l'engine ne prend que la caméra avant puis la première disponible.
- Catalogue de caméras (avant, arrière, externes nommées) et sélecteur quand plusieurs choix (tablettes, Chromebook, USB) ; sur téléphone un simple « Retourner ».
- Table de miroir par rôle (aperçu local, flux envoyé, capture) et facing affiché suivant la caméra confirmée ; LocalCameraVideoView observe seulement ce facing.
- Sélection de format (résolution/fps) à partir de VideoConfig partagé avec l'encodage ; actuellement 1280x720@30 en dur.
- Observateur d'interruption (caméra prise par une autre app, permission révoquée) -> état d'UI/auto-pause, reprise automatique.
- Création paresseuse de la piste vidéo lors d'une montée audio->vidéo et libération propre (releaseLiveCamera) ; erreurs typées noCameraAvailable/cameraPermissionDenied avec repli audio-only.
- Messages d'erreur localisés (permission, indisponible) via toast.

Rendu : L'aperçu local avant est en miroir, jamais le flux envoyé ni les captures ; l'icône flip suit le facing confirmé.

Transposition Android : RTCCameraVideoCapturer/AVCaptureSession -> CameraVideoCapturer (Camera2Enumerator, switchCamera) ; interruptions -> CameraEventsHandler + CameraManager.AvailabilityCallback.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallCameraMirror.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CameraCatalog.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CameraDeviceOption.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+Camera.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+CaptureFormat.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient+CaptureInterruption.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoConfig.swift`
- `apps/ios/Meeshy/Features/Main/Views/LocalCameraVideoView.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`

### Raccrocher et sous-titres voyagent aussi en direct entre les deux appareils (data channel)

`call-datachannel-transport` · Android : **partielle** · P1 · effort S

Canal de données P2P « transcription » : message de contrôle {type, reason?} dont « bye » signale le raccroché du pair sans aller-retour serveur (le fanout socket call:ended reste autoritatif, dédupliqué par le garde .ended), ping de keep-alive ignoré, entrées de journal de transcription poussées en P2P (miroir de CallTranscriptEntryPayload) fusionnées par id avec le relais socket qui porte la traduction. Routage entrant typé en une passe (bye, transcriptEntry, ignored) pur et testable, tolérant aux payloads inconnus d'une version future.

Écarts :
- DataChannelCodec (bye, ping, caption, decode) est porté mais le moteur ne crée aucun data channel et onDataChannel est un no-op : créer le canal « transcription » côté offreur et recevoir côté répondeur.
- Brancher DataChannelInbound.Bye sur la FSM (RemoteHangUp déduplicable avec call:ended) et Caption sur la fusion des segments.
- Émission du bye au raccroché local et du ping de keep-alive.
- Vérifier la compatibilité du format wire (CallTranscriptEntryPayload de packages/shared/types/video-call.ts) avec iOS et web ; le segment Android s'appelle CallCaptionSegment.

Transposition Android : RTCDataChannel -> DataChannel (org.webrtc) ; delegate -> DataChannel.Observer.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/DataChannelControlMessage.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/DataChannelInbound.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/DataChannelTranscriptEntry.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/DataChannelTranscriptMessage.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DataChannelProtocol.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/WebRtcEngine.kt`

### Le haut de l'écran offre Réduire, Conversation et une puce durée/qualité qui ouvre le détail

`call-header-duration-chip` · Android : **partielle** · P1 · effort S

Chrome haut : chevron Réduire (verre 40 pt, cible 44) qui garde l'appel dans la pilule ; bouton Conversation (si l'id de conversation est connu) qui réduit l'appel puis ouvre le DM en cache-first (liste en cache, sinon getById) ; à droite en vidéo et en groupe, une puce de verre avec glyphe de signal, durée en chiffres tabulaires (horloge isolée qui ne redessine que la durée à 1 Hz), icône wifi d'alerte quand le contact est dégradé, flèche de reconnexion. Toucher la puce ouvre la feuille de qualité. Le libellé VoiceOver compose signal, micro coupé du pair, réseau du contact et reconnexion.

Écarts :
- Bouton Conversation à droite du chevron : minimise puis navigue vers le DM de l'interlocuteur (cache-first, repli réseau), masqué sans conversationId (appel entrant par push sans id).
- Puce durée/qualité en capsule de verre : glyphe de signal transitoire, durée, wifi d'alerte (contact dégradé), icône de reconnexion ; visible en duo vidéo et en groupe uniquement (l'audio a sa ligne de statut).
- Horloge de durée isolée (seule la feuille de texte recompose) pour éviter la tempête de recomposition d'écran d'appel.
- Libellé d'accessibilité composé (CallVideoBadgeAccessibility) : signal dégradé, micro du pair coupé, réseau du contact faible, reconnexion ; valeur parlée de la durée ; touche pour ouvrir le détail qualité.
- Chevron et bouton en verre 40 dp avec cible tactile 44 dp ; l'en-tête se masque avec le chrome.

Rendu : Capsule de verre sombre (hauteur 44), texte caption2 medium monospacedDigit blanc, icônes warning ambre ; en-tête à chromeTopInset.

Transposition Android : Navigation: NavController vers la route conversation tout en gardant le CallViewModel à portée d'activité.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallView+Header.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallDurationClock.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallVideoBadgeAccessibility.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallClock.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallSecondsTicker.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallTimeLabel.kt`

### Le journal d'appels sait filtrer par média, chercher, masquer un appel et vider mon historique

`call-history-sdk-models-service` · Android : **partielle** · P1 · effort M

Modèles et service du journal : CallDirection / CallStatus / CallMode / CallKind tolérants (valeurs inconnues dégradées), APICallRecord complet (participants d'un groupe hors lecteur dans l'ordre de jonction, réactions comptées par emoji, pair, octets), ActiveCallSession (participant distant, encore dans l'appel), pages à curseur ; service : historique filtré côté passerelle par statut (tous/manqués), type (tous/audio/vidéo) et recherche (sans accents ni casse sur 90 jours), masquer un appel de MON journal seulement, vider mon journal (retourne le nombre).

Écarts :
- CallRecord Android n'a ni participants (CallHistoryParticipant, name+face) ni reactionCounts ; ajouter les champs et les accesseurs participantSummary(limit) / displayName / matches(query).
- CallHistoryApi ne passe que cursor/limit/filter : ajouter ?type=audio|video et ?search= (recherche serveur sur 90 jours).
- Hide d'un appel (DELETE/POST côté passerelle) et clearAll avec retour du compte ; actions UI (glisser pour masquer, vider l'historique avec confirmation).
- Filtre média (Tous / Audio / Vidéo) dans CallHistoryScreen en plus de Tous/Manqués ; recherche.
- Enums CallStatus (initiated, ringing, connecting, active, reconnecting, ended, missed, rejected, failed) et CallMode (p2p, sfu) tolérants ; ActiveCallSession.remoteParticipant/isStillIn/hasOtherActiveParticipant.
- Service de modération DELETE /calls/:id/participants/:pid vit avec call-reactions-invite-moderation.

Transposition Android : APICallRecord Codable -> kotlinx.serialization @Serializable ; CacheCoordinator.callHistory -> Room (CallHistoryDao).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallKinds.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/CallHistoryService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallRecord.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/CallHistoryApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/CallHistoryRepository.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryViewModel.kt`

### Les sous-titres de l'appel s'affichent traduits par locuteur, avec un journal de toutes les phrases

`call-live-captions-journal` · Android : **partielle** · P1 · effort L

Les sous-titres suivent le Prisme : la parole d'un pair se lit dans sa traduction avec une étiquette discrète « EN -> FR » ; toucher la phrase montre l'original (et inversement selon le réglage Original du journal) ; ma propre parole n'est jamais traduite pour moi. Chaque phrase affiche le nom du locuteur dans SA couleur stable (hachage de l'identifiant, éclaircie en sombre), la même que le liseré de sa vignette de groupe. Le bouton Sous-titres cycle Off -> Traduit -> Original. Un bandeau de verre se pose juste au-dessus de la pilule (il reste quand le chrome se masque) ; le journal (feuille) liste toutes les phrases avec suivi du direct, « Nouvelles phrases » et « Revenir au direct ». Les segments sont fusionnés par identifiant d'énoncé entre data channel et relais socket (partiel remplacé, final clôt, révision périmée ignorée), triés par heure de capture et bornés. VoiceOver n'annonce que les phrases finales.

Écarts :
- Aujourd'hui une seule ligne de texte reçue de call:translated-segment ; brancher CaptionsMode / CallCaptionResolver / LiveTranscript (modèles existants, sans consommateur) sur l'UI.
- Bandeau de sous-titres en verre au-dessus de la pilule, ligne par locuteur : nom dans sa couleur stable (DynamicColorGenerator adapté sombre sur userId), étiquette « EN -> FR », toucher = original/traduction ; bouton cyclique Off -> Traduit -> Original.
- Reconnaissance vocale locale on-device uniquement (SpeechRecognizer avec reconnaissance hors ligne, jamais serveur) et émission des segments (call:transcription-segment + data channel « transcription ») ; abonnement call:transcription-active ; erreurs (permission refusée, langue non supportée) en toast avec panneau resté ouvert en réception seule.
- Règles de fusion portées (CallTranscriptMergeRules) : même wireId entre data channel et relais, partiel remplacé, final clôt, entrant partiel périmé ignoré, capturedAt le plus ancien ; insertion triée bornée (CallTranscriptJournal.inserting/bounded).
- Journal en feuille : liste complète, état vide « Les sous-titres s'afficheront ici dès que quelqu'un parlera. », suivi du direct (CallJournalFollow), pastille « Nouvelles phrases », bouton « Revenir au direct ».
- Annonces TalkBack des seules phrases finales ; panneau de sous-titres dédié en appel audio (en-tête compact + transcript).

Rendu : Nom du locuteur en couleur stable, étiquette langue discrète, texte blanc sur verre sombre ; journal en liste avec défilement qui suit le direct sauf si l'utilisateur remonte.

Transposition Android : SFSpeechRecognizer on-device -> SpeechRecognizer (EXTRA_PREFER_OFFLINE) / modèle hors ligne ; feuille -> ModalBottomSheet ; Prisme -> resolveUserLanguage côté client.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallCaptionLine.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallTranscriptJournal.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallTranscriptMergeRules.swift`
- `apps/ios/Meeshy/Features/Main/Models/CallTranscriptionSegment.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallCaptionsViews.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+Transcript.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallCaptions.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LiveTranscript.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### Un appel qui se fige se répare tout seul (média à sens unique, ICE bloqué, identifiants TURN expirés)

`call-reliability-self-heal` · Android : **partielle** · P1 · effort M

Politiques pures de fiabilité : signalisation dégradée (socket perdu mais appel établi), détection half-open (sortant OK, entrant bloqué -> UN seul ICE restart ; état par époque de connexion pour ne pas se déclarer sain sur le trafic d'avant redémarrage), watchdog .connecting (attendre, relancer ICE, échouer), budget de reconnexion, déclencheur de reconnexion, rattrapage « connecté » quand le pair est connecté mais la FSM reste connecting/reconnecting, et TurnCredentialRefreshPolicy : de nouveaux identifiants TURN relancent ICE (restart si connecté, ré-armement du budget si en reconnexion) car les allocations déjà faites gardent leurs anciens identifiants.

Écarts :
- Boucle de surveillance half-open (poll des compteurs RTP) : nécessite les stats réelles ; HalfOpenMonitorState (époques, healSpent, needsEvaluation) à porter.
- TurnCredentialRefreshPolicy.iceAction : appliquer les nouveaux serveurs (setConfiguration) puis restartIce si connecté / ré-armer le budget si reconnecting ; aujourd'hui la mise à jour mid-call n'a aucun effet.
- CallConnectedCatchUpPolicy.shouldCatchUpConnected : forcer MediaConnected quand le PeerConnection est connecté mais la FSM est en connecting/reconnecting.
- Aligner les délais sur CallRules (connectingGrace 90 s côté iOS vs budget de 45 s du watchdog Android) et vérifier l'égalité de décision avec les tests de contrat.
- Reprise de la durée d'appel : shouldResetCallClock déjà présent côté modèle, à brancher.

Transposition Android : Politique pure partagée ; timers et ICE restart côté coordinateur.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallReliabilityPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/HalfOpenMonitorState.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/TurnCredentialRefreshPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallConnectedCatchUpPolicy.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallReliabilityPolicy.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallConnectingWatchdog.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallReconnectBudget.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`

### Les délais d'un appel (sonnerie, offre, battements, reprise) sont les mêmes que sur iOS et le web

`call-rules-timeouts` · Android : **partielle** · P1 · effort S

Miroir des règles d'appel de packages/shared/types/call-rules.ts : sonnerie 45 s ; nettoyage serveur d'un appel resté en sonnerie 75 s ; attente de l'offre SDP par l'appelé 30 s ; grâce serveur d'un appel décroché sans battement 90 s ; cadence des battements 10 s ; silence déclarant un pair perdu 120 s (300 s en arrière-plan) ; grâce de reprise 60 s (le client ne raccroche jamais avant) ; durée de vie d'une poussée d'appel 45 s ; participants simultanés max 6 (maillage sans SFU). Deux témoins (un par côté) comparent les littéraux.

Écarts :
- Objet CallRules Kotlin unique avec les 10 constantes littérales + test de contrat qui lit call-rules.ts et le fichier Swift ; aujourd'hui les constantes sont dispersées (heartbeat 10 s dans CallHeartbeatTicker, 45 s dans CallConnectingWatchdog).
- Aligner le watchdog de connexion (45 s Android vs connectingGrace 90 s) et le timeout de sonnerie (RingTimeout dans la FSM) sur ces valeurs.
- Appliquer rejoinGrace (ne pas raccrocher avant 60 s) et maxParticipants (6) dans la logique d'appel/groupe.

Transposition Android : Objet Kotlin de constantes + test de contrat TS/Swift/Kotlin.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CallRules.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHeartbeatTicker.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallConnectingWatchdog.kt`

### Ma vignette se déplace de coin en coin, se pince en 3 tailles et permute avec la grande vidéo

`call-self-tile-drag-pinch` · Android : **partielle** · P1 · effort M

La vignette perso (ratio 1,4) se glisse librement et s'accroche au coin le plus proche (4 coins, ressort, haptique légère). Un toucher permute la petite et la grande vidéo (FaceTime). Un pincement la fait changer de palier x1 (72 pt) · x2 (100, défaut) · x3 (150) avec taille live pendant le geste puis accroche ; le palier est mémorisé par appel (CallSelfTileMemory). Réglable au clavier/lecteur d'écran (ajustable, valeur « Petite/moyenne/grande vignette »). Quand la survie réseau a coupé ma vidéo sortante, la vignette devient « Vidéo en pause · Reprise auto » (avatar + glyphe ambre, liseré warning).

Écarts :
- Tuile libre : drag + accroche au coin le plus proche avec marges de safe area (pipCenter/nearestCorner), ressort 0.35/0.75, haptique légère ; Android a une tuile fixe 108x148 en haut à droite.
- Permutation au toucher des flux local/distant avec ressort 0.4 (swapStreams), badge micro coupé qui suit le flux distant.
- Trois paliers 72/100/150 dp (ratio 1,4, défaut x2), seuils de pincement 1.12/0.89, taille live bornée, mémorisation par callId.
- Accessibilité : action ajustable increment/decrement, valeur parlée, hint « Touchez pour échanger… ; faites glisser pour déplacer ».
- Tuile de survie « Vidéo en pause / Reprise auto » (fond noir 0.8 opaque, avatar 56 dp, glyphe video.slash ambre, bordure warning) quand l'encodeur est suspendu.
- Cadre blanc 1 dp (opacité .3), coins smPlus, ombre 8 dp ; miroir de l'aperçu local seulement en caméra avant.
- Taille ajustée (fitted) pour ne pas dépasser l'espace disponible (paysage/fenêtre basse).

Rendu : Vignette 72/100/150 de large x1,4, coins arrondis, liseré blanc translucide, ombre douce ; les rangées Effets·Écran / Retourner·Caméra se posent AUTOUR de la vignette et la suivent.

Transposition Android : DragGesture/MagnificationGesture -> detectDragGestures + detectTransformGestures ; ressort -> spring(Spring.DampingRatioMediumBouncy).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/CallSelfTile.swift`
- `apps/ios/Meeshy/Features/Main/Views/CallView+SelfView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/VideoRenderer.kt`

### Sur un lien faible, la vidéo se met en pause automatiquement et reprend toute seule

`call-video-survival` · Android : **partielle** · P1 · effort S

VideoSurvivalController : quand le niveau reste poor/critical assez longtemps, l'émission vidéo est suspendue (audio seul) puis reprise quand le lien redevient bon assez longtemps ; ne s'active jamais contre l'intention de l'utilisateur (caméra coupée par choix). La piste locale reste attachée (encodeur au plancher), la vignette affiche « Vidéo en pause · Reprise auto ». Actuateur suspendOutboundVideo/resumeOutboundVideo asynchrone.

Écarts :
- VideoSurvivalPolicy est porté (state machine pure) mais sans contrôleur ni consommateur ; créer le contrôleur qui lit les niveaux de qualité (call-adaptive-quality-stats) et pilote l'actuateur.
- Actuateur Android : suspendOutboundVideo/resumeOutboundVideo (désactiver la piste et/ou plancher d'encodeur, ré-acquisition caméra à la reprise).
- Exposer isVideoSuspended au ViewModel pour la tuile « Vidéo en pause » et l'annonce a11y.
- Horloge monotone (déjà prévue dans le modèle) injectée par le contrôleur.

Rendu : Tuile de survie : avatar 56 dp, glyphe video.slash ambre, libellés « Vidéo en pause » / « Reprise auto ».

Transposition Android : Même politique pure ; actuateur = RtpSender / VideoTrack.setEnabled + capturer stop/start.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/WebRTC/VideoSurvivalController.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSurvivalPolicy.kt`

### L'appel réagit au passage en arrière-plan, à l'enregistrement d'écran et donne un retour haptique

`calls-app-lifecycle-and-capture-alert` · Android : **partielle** · P1 · effort M

CallManager+SystemMonitoring : helpers haptiques (légère, moyenne, forte, rigide, succès/avertissement/erreur) ; surveillance de la capture d'écran (UIScreen.capturedDidChange → call:screen-capture-detected, le pair reçoit call:screen-capture-alert), observateurs arrière-plan/premier plan qui émettent call:backgrounded / call:foregrounded et suspendent/reprennent la caméra (applyCameraSuspension C3 : call:toggle-video lié à la vie de la capture, signal de fin pouvant ne jamais arriver) ; promotion d'un appel entrant sonnant in-app vers CallKit quand l'app passe en arrière-plan (sauf Mac/Chine).

Écarts :
- Aucune haptique d'appel (HapticFeedback iOS) : légère/moyenne/forte/succès/avertissement/erreur sur décroché, raccroché, mute, caméra, échec ; ajouter VibrationEffect/HapticFeedbackConstants.
- Suspension de la caméra en arrière-plan: call:backgrounded / call:foregrounded sont émis (onAppStateChanged) mais la caméra n'est pas coupée avec call:toggle-video(false) au pair (il voyait une image figée) ni reprise au retour au premier plan, sauf si la vidéo est maintenue par le PiP système.
- Détection d'enregistrement d'écran limitée à Android 15 (addScreenRecordingCallback + DETECT_SCREEN_RECORDING) ; silence en dessous : acceptable, mais documenter l'écart côté utilisateur.
- Promotion d'un appel entrant in-app vers l'interface système au passage en arrière-plan (voir Telecom) ; pas de promotion sur plateformes sans téléphonie.
- Pause/reprise propre de la capture quand la session caméra est interrompue (C3).

Rendu : Bannière rouge « X capture l'écran » côté pair, retour haptique léger sur les commandes (déjà décrit), aucune UI propre à l'arrière-plan.

Transposition Android : NotificationCenter didEnterBackground/willEnterForeground → ProcessLifecycleOwner ; UIScreen.captured → WindowManager.addScreenRecordingCallback (API 35) ; UIImpactFeedbackGenerator → HapticFeedbackConstants / VibrationEffect.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+SystemMonitoring.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/ScreenRecordingDetector.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### Un second appel pendant un appel s'annonce par une bannière : refuser, ou raccrocher l'actuel et répondre

`calls-call-waiting` · Android : **partielle** · P1 · effort S

Le double appel (§11.15) : un second appel entrant pendant un appel en cours se refuse (rejectPendingCall) ou remplace l'appel actuel (endCurrentAndAnswerPending). pendingIncomingCall ne tient qu'UN appel en attente : un troisième appelant qui arrive pendant qu'un second attend ne l'écrase plus en silence — rejectSupersededPendingCall émet le refus (emitCallReject, résolu en missed côté serveur) pour que l'appelant déplacé voie une fin propre ; clearPendingIncomingCall(ifMatching:) retire la bannière si l'appelant raccroche.

Écarts :
- Appel déplacé non refusé : quand une offre plus récente remplace l'offre en attente (CallWaitingReducer Offered), Android ne renvoie pas call:end(reason=rejected) pour l'appelant déplacé qui sonne alors dans le vide jusqu'au délai serveur (iOS rejectSupersededPendingCall, audit 2026-07-07).
- Aucune haptique à l'arrivée de la bannière ni au refus/acceptation (HapticFeedback iOS) ; ajouter VibrationEffect léger.
- Ni son d'alerte discret du second appel (bip de double appel) ni intégration Telecom (le système propose lui-même l'appel en attente en ConnectionService) — voir calls-telecom-foreground-service.
- Vérifier que le délai d'auto-rejet (15 s) libère bien l'appelant et que la bannière supporte plusieurs appelants successifs sans fuite d'identifiant.

Rendu : Bannière haute pleine largeur par-dessus l'appel : avatar+nom du second appelant, sous-titre « Appel entrant… », deux boutons ronds Refuser (rouge sémantique) / Répondre (accent du pair), accessible TalkBack (étiquettes « Refuser l'appel de X » / « Terminer l'appel en cours et répondre à X »).

Transposition Android : pendingIncomingCall / showCallWaitingBanner → StateFlow<WaitingCall?> (déjà) ; CallKit double appel → core-telecom (plusieurs appels simultanés gérés par le système).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+CallWaiting.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallWaiting.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallWaitingReducer.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallWaitingTimer.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`

### Appeler un contact depuis un profil, un contact, le journal ou un rappel, même juste après le lancement de l'app

`calls-dial-from-anywhere` · Android : **partielle** · P1 · effort M

CallStarter compose depuis un simple userId : conversation connue → appel immédiat ; sinon résolution du DM via findDirectWith, repli onUnavailable (ouvrir le profil ou toast « Impossible de démarrer l'appel »). CallBackDialer garde UNE seule demande en attente (la dernière remplace), attend session + socket (CallDialReadiness : relecture toutes les 200 ms, délai 15 s, demande connect() une fois) avant de composer, résout le pair de la conversation depuis le cache puis le réseau, et affiche « Pas de connexion : l'appel n'est pas parti » à l'expiration. CallRefusalMessage localise le refus typé CALLEE_REFUSES_NON_CONTACTS (« Cette personne n'accepte que les appels de ses contacts »).

Écarts :
- Aucun CallStarter : l'appel n'est composable que depuis une conversation connue (CallRoute.path) ou le rappel d'une ligne du journal (CallRoute.redial) ; ajouter la résolution userId → conversation directe (GET conversations/direct ou findDirectWith) pour les fiches contact, résultats de recherche et profils.
- Aucune attente de disponibilité : un rappel lancé app fermée (notification, raccourci) doit attendre session résolue + socket connecté (poll 200 ms, délai 15 s, une seule demande de connect()), sinon call:initiate part dans le vide et l'autre ne sonne jamais ; la dernière demande remplace la précédente.
- Toasts de repli absents : « Impossible de démarrer l'appel » (aucune conversation directe), « Pas de connexion : l'appel n'est pas parti » (délai 15 s), libellé de repli « Appel » quand le nom est vide.
- Le code CALLEE_REFUSES_NON_CONTACTS (call:error / ack d'initiate) n'est pas traduit en message localisé « Cette personne n'accepte que les appels de ses contacts » ; CallInitiateResult.ServerError ne porte qu'un message brut.
- Pair résolu côté cache/réseau : si la conversation n'est pas un DM (groupe) ou le pair est introuvable, ouvrir le profil comme fallback (DeepLinkRouter.userProfile) au lieu d'échouer en silence.

Rendu : Aucun écran dédié : retours uniquement par toast d'erreur local (même ton que les autres erreurs d'action locale) ; l'appel démarre sans détour quand tout est prêt.

Transposition Android : CallDialReadiness → suspend fun awaitReady() combinant AuthState + ConnectionState du socket (Flow) avec withTimeout(15 s) ; FeedbackToastManager → snackbar/toast local de l'app (jamais une notification) ; DeepLinkRouter → LaunchRouter/NavController.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Contacts/CallStarter.swift`
- `apps/ios/Meeshy/Features/Contacts/CallBackDialer.swift`
- `apps/ios/Meeshy/Features/Contacts/CallBackRequest.swift`
- `apps/ios/Meeshy/Features/Contacts/CallDialReadiness.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallRefusalMessage.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallInitiateAck.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`

### Des sous-titres traduits en direct s'affichent pendant l'appel, dans ma langue, avec l'historique complet de l'appel

`calls-live-captions-transcription` · Android : **partielle** · P1 · effort L

CallTranscriptionService transcrit UNIQUEMENT le micro local (jamais l'audio distant) via la reconnaissance vocale ; chaque segment final part sur le socket d'appel (call:transcription-segment), la passerelle le relaie traduit par auditeur (call:translated-segment) — le client ne traduit jamais. Les segments non finaux sont ignorés tant que le panneau est masqué (PERF-005). Le texte porte TOUJOURS l'original pour proposer un basculement original/traduit ; l'historique complet de l'appel (plafond mémoire, trié par heure de capture) alimente le transcript post-appel. La capture locale est liée à l'écoute RÉELLE de l'appel (TranscriptionCapturePolicy) : un ensemble de pairs qui écoutent (call:transcription-active), pas un booléen local. Gestion des permissions (autorisé/refusé/restreint), des interruptions audio (redémarrage du moteur) et des erreurs de reconnaissance ; entrées P2P par le canal de données comme second transport.

Écarts :
- Seule la réception existe : le VM affiche la dernière légende traduite (call:translated-segment) en une seule ligne ; aucune capture locale — implémenter la transcription du micro local (SpeechRecognizer on-device, EXTRA_PREFER_OFFLINE, createOnDeviceSpeechRecognizer API 31+) et l'émission call:transcription-segment pour les segments finaux.
- Événement call:transcription-active et ensemble des pairs écoutant (listeningPeers) absents : sans eux celui qui active les sous-titres devient un pur émetteur (symptôme « il reçoit mes transcriptions, je ne reçois pas les siennes »).
- Panneau de sous-titres à plusieurs locuteurs (nom estampillé, couleurs par locuteur), bascule original/traduit, cycle de modes (advanceCaptionsMode) et indicateur sur l'icône légendes quand un pair écoute.
- Journal complet de l'appel (CallTranscriptJournal, plafond mémoire, tri par capturedAt = horloge de réception, pas les bornes ASR) et persistance en fin d'appel (resetForCallEnd) pour le transcript affiché dans le détail d'appel.
- Transport P2P par le canal de données (transcriptEntry) – DataChannelCodec Caption est porté mais le canal n'est pas créé.
- Permissions : demande RECORD_AUDIO déjà acquise, mais état refusé/restreint et reprise après interruption audio (focus perdu) à gérer ; reconnaissance indisponible hors ligne selon la langue.
- Langue locale de reconnaissance = langue du Prisme de l'utilisateur ; ne rien traduire côté client.

Rendu : Bandeau de légendes en bas de la vidéo/avatar : texte blanc sur fond noir 55 % arrondi md, 2–3 lignes max, nom du locuteur coloré, transition de fondu ; panneau historique défilant avec horodatages « depuis le début de l'appel ».

Transposition Android : SFSpeechRecognizer + AVAudioEngine tap → android.speech.SpeechRecognizer (on-device) ou Vosk/Whisper-tiny en repli ; le micro est partagé avec WebRTC : utiliser RecognitionService sur flux AudioRecord fourni par JavaAudioDeviceModule.setSamplesReadyCallback si le micro est exclusif.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Transcription.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+TranscriptionSegments.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallCaptions.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LiveTranscript.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DataChannelProtocol.kt`

### Je réduis l'appel en bannière ou en bulle flottante que je déplace, agrandis et rouvre d'un tap

`calls-minimized-pill-bubble` · Android : **partielle** · P1 · effort M

CallDisplayMode (fullScreen / pip / bubble) vit sur CallManager : la bannière réduite (FloatingCallPillView) est un aplat plein indigo (dégradé indigo600 → indigo800, blanc 6,3:1 / 9,9:1, plus de voile noir ni de fondu), teintes d'état recalibrées (erreur #FCA5A5 sur cette surface, haut-parleur indigo200) et contrôlées par tests de contraste WCAG 1.4.3/1.4.11 (CallBannerContrast). La bulle repliée se range sur un bord (bubbleEdge), à une fraction verticale de la zone sûre (0,08 par défaut, survit à la rotation), tient en cercle et s'agrandit par pincement jusqu'à .large (bubbleSizeTier) ; un indice one-shot déclenche l'animation d'agrandissement depuis la bannière. Plafond de largeur 560 pt sur iPad.

Écarts :
- CallPill est une pastille dans l'app (CallPillPresenter.isMinimizable) : pas de mode bulle (cercle déplaçable, ancrage sur un bord, fraction verticale persistée, pincement jusqu'à la grande taille) ni de bascule fullScreen/pip/bubble persistée sur le gestionnaire d'appel.
- Surface de la bannière : dégradé plein indigo600→indigo800 (MeeshyColors), teinte d'erreur errorSoft sur cette surface et icône haut-parleur actif indigo200 — vérifier les ratios WCAG (≥ 4,5:1 texte, ≥ 3:1 composants) par des tests de contraste unitaires comme CallBannerContrastTests.
- Animation d'agrandissement depuis la bannière vers le plein écran (morph) via un indice one-shot consommé à l'apparition de l'écran d'appel.
- Pastille masquée quand une fenêtre PiP système est active (isSystemPiPActive) pour éviter le doublon visuel au retour au premier plan.
- Largeur maximale 560 dp pour tablettes/pliables.
- Réinitialiser explicitement position/bord de la bulle en fin d'appel.

Rendu : Bannière plein-largeur dégradé indigo 600→800 (jamais de scrim noir), texte blanc, chrono, glyphe de signal et micro coupé en errorSoft ; bulle circulaire 56→176 dp avec ombre, magnétisme au bord le plus proche, haptique au verrouillage.

Transposition Android : Bulle/PiP in-app → overlay Compose (Box draggable avec detectTransformGestures) dans le NavHost racine, pas SYSTEM_ALERT_WINDOW ; iPad → classes de taille WindowSizeClass.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CallBannerContrast.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`

### Quand le réseau ou l'appareil chauffe, la vidéo se fige sans couper l'appel puis reprend d'elle-même

`calls-quality-adaptation` · Android : **partielle** · P1 · effort M

VideoSurvivalController gèle l'envoi vidéo sortant quand la liaison reste mauvaise (plancher d'encodeur : 100 kbps, 2 fps, 360p, maintainResolution) sans toucher à l'intention vidéo de l'utilisateur, à la piste ni à la capture, sans rien signaler au pair, puis rend l'encodeur à l'échelle de qualité au retour d'un lien sain. CallManager+Thermal replie la cadence et les effets vidéo à chaque palier thermique (le plus critique force un retour audio). CallManager+AudioQuality projette l'échelle client à 5 niveaux sur les 4 niveaux de la passerelle (critical → poor) et réconcilie le haut-parleur avec la sortie réelle.

Écarts :
- Les politiques pures existent (VideoSurvivalPolicy, VideoSenderCap, VideoFilterDegradePolicy, ThermalState dérivé du statut) mais AUCUN actionneur : rien dans feature/calls ni sdk-core ne les appelle ; câbler le gel/dégel de l'émetteur vidéo (RtpParameters : 100 kbps · 2 fps · 360p) piloté par la qualité mesurée.
- Réponse thermique absente : PowerManager.addThermalStatusListener (API 29) → abaisser fps/résolution, couper les effets avancés, forcer l'audio au palier critique ; pipFrameRate(for: thermalState).
- Projection de qualité vers la passerelle (excellent/good/fair/poor) pour call:quality-report absente tant que les stats ne sont pas collectées.
- Indicateur UI « vidéo auto-suspendue » (videoAutoPaused) quand l'encodeur est au plancher, distinct d'une caméra coupée par l'utilisateur.
- Reprise : rendre l'encodeur à l'échelle de qualité, sans réacquérir la caméra (le gel ne l'a jamais relâchée).
- Réconciliation haut-parleur ↔ route de sortie réelle (voir calls-audio-routing-interruptions).

Rendu : Bandeau discret « Vidéo en pause (connexion faible) » + glyphe de signal ; aucune coupure d'image noire côté pair (image figée à 2 fps).

Transposition Android : ProcessInfo.thermalState → PowerManager.getCurrentThermalStatus + addThermalStatusListener ; RTCRtpSender encodings → RtpSender.parameters.encodings[0] (maxBitrateBps, maxFramerate, scaleResolutionDownBy) ; NWPath → NetworkCapabilities.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+VideoSurvival.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Thermal.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+AudioQuality.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSurvivalPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSenderCap.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallStats.kt`

### Rejoindre un appel en cours (bulle vivante, liste) ou le reprendre après un plantage de l'app

`calls-resume-and-rejoin` · Android : **partielle** · P1 · effort M

CallLaunchResume relit GET /calls/active à la première connexion du socket : si la ligne du partant est encore vivante et que quelqu'un l'attend, l'appel reprend (la pile n'est réveillée que dans ce cas). LiveCallJoiner arbitre « Rejoindre » pour la bulle du fil et la ligne de la liste : déjà dans cet appel → ramener l'UI au premier plan ; ce device sonne dessus → laisser la bannière gérer ; appel actif côté serveur → rejoinActiveCall (réhydratation à froid) ; appel disparu → toast « L'appel est terminé » (« Impossible de rejoindre l'appel » sur erreur). CallResumePolicy dit à la passerelle ce qui s'est passé quand l'appareil renonce : call:end seulement pour un appel jamais décroché, sinon call:leave ou silence (la grâce de reprise du serveur décide). CallHeaderSnapshot réduit l'état d'appel à deux faits pour l'en-tête de conversation : bouton démarrer / retour à l'appel / rejoindre.

Écarts :
- Reprise au lancement absente : à la première connexion du socket relire GET /calls/active et proposer/lancer la reprise (rejoinActiveCall) ; ne construire la pile d'appel que si un appel est à reprendre.
- Politique de fin à l'abandon (CallResumePolicy) : Android n'a pas la distinction call:end (jamais décroché) vs call:leave (décroché, la grâce serveur tient la place) vs silence (reset système / reprise échouée / plafond de reconnexion en 1:1) ; en groupe le plafond de reconnexion quitte.
- Surface de la liste de conversations : ligne « Rejoindre » sur la LISTE (pas seulement la bulle du fil), avec arbitrage en quatre branches de LiveCallJoiner et toasts « L'appel est terminé » / « Impossible de rejoindre l'appel ».
- Snapshot d'en-tête (CallHeaderSnapshot) : bouton d'appel de l'en-tête qui change d'allure deux fois par appel (démarrer / retour à l'appel / rejoindre) et n'apparaît que dans la conversation qui héberge l'appel actif ; identifiant inconnu ⇒ afficher la pastille (jamais priver d'un chemin de retour).
- Ledger de reprise (CallResumeLedger) : une panne avant le premier média rétabli n'est pas une fin ; un lien NEUF compte depuis 1 pour que la première offre d'un pair revenu converge au lieu d'être jetée comme périmée.
- Rejoindre un appel de groupe passe par le maillage, jamais par un pair désigné (voir calls-group-mesh-calls).

Rendu : Pastille/bouton d'appel de l'en-tête de conversation : icône téléphone → « retour à l'appel » (accent de la conversation, pastille verte pulsante) → « Rejoindre » ; toasts d'erreur locaux.

Transposition Android : CallLaunchResume (première connexion du socket) → collecte unique du Flow de connexion dans MeeshyApplication ; header snapshot → StateFlow dérivé exposé au ChatViewModel (déjà RejoinPillPolicy).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Resume.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallResumePolicy.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallLaunchResume.swift`
- `apps/ios/Meeshy/Features/Main/Services/LiveCallJoiner.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/CallHeaderSnapshot.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/RejoinPillPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/ActiveCallRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/ActiveCallSession.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`

### La sonnerie, le retour d'appel et les sons de connexion/fin donnent l'état de l'appel sans regarder l'écran

`calls-ringtones-and-cues` · Android : **partielle** · P1 · effort S

RingbackTonePlayer centralise quatre sons : ringback (boucle « rrr-rrr » entendue par l'appelant, RingbackTone.caf, volume 0,6), sonnerie (boucle de l'appelé, Ringtone.caf, volume 0,9 — jouée par l'app seulement quand CallKit ne le fait pas, ex. iOS-sur-Mac), signal « connecté » court et signal « terminé » court. CallKit possède la session audio ; sur Mac sans CallKit la session est activée pour que les boucles soient audibles. Le ringback démarre à l'activation de la session audio, jamais avant (le lecteur ne doit pas précéder la catégorie playAndRecord).

Écarts :
- Sons génériques ToneGenerator (TONE_SUP_RINGTONE, TONE_PROP_ACK/PROMPT) et sonnerie système par défaut : iOS livre des assets de marque (RingbackTone, Ringtone, connected, ended) — ajouter res/raw et lecture MediaPlayer/SoundPool avec les mêmes volumes (0,6 / 0,9) et boucles.
- Sonnerie sur le flux USAGE_NOTIFICATION_RINGTONE avec respect du mode silencieux/vibreur ; ringback sur USAGE_VOICE_COMMUNICATION ; démarrer le ringback seulement quand la route audio est prête.
- Sonnerie personnalisable par l'utilisateur (hérite de la sonnerie appareil aujourd'hui).
- Arrêt propre de la boucle à chaque transition (réponse, refus, annulation, décroché ailleurs) et libération à la fin (release) – déjà posé, à tester sur OEM.
- Vibration d'appel entrant cohérente avec le motif iOS (1 s on / 0,8 s off) via le canal d'appel.

Rendu : Sans rendu visuel ; accompagne le libellé « Appel en cours… » (sortant) et la sonnerie de l'appel entrant.

Transposition Android : AVAudioPlayer(caf) → MediaPlayer/SoundPool avec AudioAttributes (USAGE_NOTIFICATION_RINGTONE / USAGE_VOICE_COMMUNICATION) ; CallKit joue la sonnerie → notification channel sound + core-telecom.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/RingbackTonePlayer.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallToneController.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSoundPolicy.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Un glyphe de signal à barres colorées dit la qualité du lien, et un détail chiffré l'explique

`calls-signal-quality-indicator` · Android : **partielle** · P1 · effort M

CallSignalStrength (excellent / good / fair / poor / lost / connecting) est dérivé PUREMENT des niveaux de qualité déjà mesurés (VideoQualityLevel) avec repli sur l'état ICE avant le premier échantillon ; barres = 1,0 / 0,75 / 0,5 / 0,25 / 0 (cellularbars à valeur variable), couleur sémantique : vert (sain), ambre (dégradé), rouge (critique), indigo neutre pendant la négociation. Les libellés VoiceOver décrivent la force du signal uniquement (« Connexion bonne », « Signal moyen »…), jamais un événement de reconnexion (annoncé par les bannières dédiées). CallQualityRows liste perte de paquets, latence, gigue, débit audio, débit vidéo avec seuils (perte 3/5 %, latence 300/450 ms, gigue 30/50 ms → Bon/Moyen/Faible) et la note globale (pire des notes), plus le contexte réseau (profil de données ; chemin « Relais » ou « Direct »). CallQualityStatsFeed relaie les échantillons au moniteur sans construire la pile WebRTC.

Écarts :
- Aucune donnée : CallQualitySampler est no-op, la liste de barres de CallScreen (ConnectionQualityBars, 4 barres 6/10/14/18 dp) n'apparaît donc jamais ; brancher les stats WebRTC (voir calls-webrtc-engine).
- Glyphe iOS : 6 états dont « connecting » (indigo) et « lost » (0 barre, rouge) ; Android n'a que ConnectionQuality (4 tiers) sans repli sur l'état ICE ni état de négociation.
- Panneau de détail (tap sur le glyphe) absent : cinq lignes métriques (Perte de paquets, Latence, Gigue, Débit audio, Débit vidéo) formatées localement (pourcentage, ms, kb/s), note globale, « Profil de données », « Chemin réseau » (Relais/Direct).
- Libellés TalkBack « Connexion bonne / Signal moyen » mais jamais d'événement de reconnexion; valeur d'accessibilité = valeur + note.
- Échelle de couleurs sémantique success/warning/error/indigo400 (MeeshyTheme tokens) au lieu de accent/error actuels.
- Exposer relayed (ICE candidate-pair relay) et le profil de données dans CallQualityReading.

Rendu : Glyphe 4 barres dans l'en-tête d'appel, taille cible ≥ 24 dp ; vert (excellent/bon), ambre (moyen), rouge (faible/perdu), indigo (connexion) ; feuille de détail en liste clé/valeur avec pastille Bon/Moyen/Faible colorée, mise en page aérée.

Transposition Android : SF Symbol cellularbars(variableValue:) → Canvas Compose à 4 barres de hauteurs croissantes, remplissage proportionnel ; Measurement/formatted(.percent) → NumberFormat/MeasureFormat Android.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CallSignalGlyph.swift`
- `apps/ios/Meeshy/Features/Main/Components/CallQualityRows.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallQualityStatsFeed.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallQuality.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallQualitySampler.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallQualityResetTimer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallStats.kt`

### La négociation d'un appel survit aux collisions, aux retards et aux rejeux de messages

`calls-signaling-negotiation` · Android : **partielle** · P1 · effort M

CallManager+Signaling branche chaque événement call:* sur la machine d'états (initiated, participant-joined/left, signal offer/answer/ice, ended, media-toggled, quality-alert, ice-servers-refreshed, error…). CallManager+Negotiation attribue un rôle poli/impoli symétrique calculé des deux userIds (négociation parfaite §3.4), une époque de négociation (generation) qui écarte les signaux périmés (§3.5) et pilote les émissions d'offre, de réponse et de refus avec relances (offerRetry, answerRetry, délai SDP). CallErrorDisposition ne termine l'appel que sur une erreur qui le rend impossible : un refus d'une requête accessoire (rafraîchissement TURN, bascule de média) est ignoré (#11463/#11468).

Écarts :
- Rôle poli/impoli déterministe (calculé des deux userIds, indépendant de qui appelle) absent : Android n'a que l'anti-glare « l'appelant initial renégocie seul » ; sans rollback d'offre, deux renégociations simultanées (changement de média des deux côtés) peuvent entrer en collision.
- Relances d'offre/réponse et délai SDP : pas de offerRetryTask/answerRetryTask ni de timeout « offre sans réponse » avec échec propre.
- Disposition des call:error (CallErrorDisposition) : trois issues ignore / reconcileEnd / surface(endsCall) — Android a un handler call:error mais ne distingue pas les erreurs d'accessoires (NOT_A_PARTICIPANT sur un rafraîchissement TURN) qui ne doivent PAS raccrocher.
- Époque de négociation: Android a negotiationId et acceptIncomingNegotiation mais sans la règle « génération 0/1 toujours acceptée » ni le renumérotage d'un lien neuf compté depuis 1 (reprise #9111).
- Événements non gérés : call:muted-by-moderator, call:participant-invited/declined/expired, call:recording-*, call:reaction-received, call:transcription-active, call:frame-selected, call:preview-* (voir fonctions dédiées).

Rendu : Aucun rendu : l'utilisateur ne voit que « Connexion… » puis connecté ; les erreurs accessoires ne produisent aucun écran.

Transposition Android : Socket.IO via CallSignalManager (déjà) ; ordonnancement → coroutines + Mutex pour sérialiser createOffer/setRemoteDescription ; rollback d'offre → setLocalDescription(SessionDescription.Type.ROLLBACK).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Signaling.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Negotiation.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallErrorDisposition.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSignalMapper.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSocketEvents.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`

### Raccrocher, refuser et terminer un appel laisse toujours l'autre côté dans un état propre, et la qualité est journalisée

`calls-teardown-hangup-analytics` · Android : **partielle** · P1 · effort M

endCallInternal démonte tout (médias, session audio, minuteurs, CallKit) et fige la durée sur le panneau de fin pendant 1,5 s avant le retour à .idle. rejectCall/endCall émettent call:end/call:reject et, si le socket est coupé, différent la réconciliation (pendingEndReconciliations, rejouée à la reconnexion — chaos-test prod 2026-07-02 : sans cela le pair reste dans un appel zombie ≈48 s). CallAnalyticsRecorder construit un instantané non destructif envoyé périodiquement (call:analytics, updateMany côté serveur) et au teardown ; CallQualitySummaryStore persiste le dernier résumé (stats, durée, pair, raison) pour le diagnostic post-appel.

Écarts :
- Réconciliation différée d'un raccroché hors ligne absente : si call:end/call:reject est émis pendant une coupure de signalisation, le mémoriser par callId (map bornée FIFO) et le rejouer à la reconnexion (call:end idempotent côté serveur).
- Instantanés analytiques périodiques « in_progress » pendant l'appel (un kill en arrière-plan perdait la ligne) : Android n'émet que la synthèse finale.
- Résumé de qualité persistant (CallPersistedQualitySummary : stats, callId, durée, pair, raison) absent ; à stocker dans DataStore pour le diagnostic.
- Distribution de qualité (CallReliabilityPolicy.qualityDistribution) repliée virtuellement sans muter les accumulateurs.
- Teardown atomique : annuler toutes les tâches (ring timeouts, reliability monitor, heartbeat, TURN refresh, survie vidéo, caméra, PiP, reconnaissance vocale) et libérer l'audio ; vérifier que WebRtcCallCoordinator.end() n'oublie rien.
- failCall(reason) : message d'échec localisé et passage à ended(failed).

Rendu : Panneau de fin 1,5 s : raison (« Appel terminé », « Appel manqué », « Appel refusé », « Connexion perdue », « Échec de l'appel ») + durée figée ; bouton Réessayer sur échec transitoire.

Transposition Android : UserDefaults du résumé → Preferences DataStore ; pendingEndReconciliations → LinkedHashMap borné + collecte du ConnectionState du socket.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallManager+Teardown.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+Hangup.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+AnalyticsRecorder.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallManager+QualitySummaryStore.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallAnalytics.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallEndedSignal.kt`

### Un second appel entrant pendant un appel s'annonce par une bannière Refuser / Répondre

`call-waiting-banner` · Android : **partielle** · P2 · effort S

Bannière en haut (verre sombre, icône téléphone, nom sur une ligne, « Appel entrant... ») avec deux capsules libellées : « Refuser » (rouge, ne coupe pas l'appel en cours) et « Répondre » (vert, raccroche l'appel courant et répond). Cibles 44 pt, entrée par glissé depuis le haut (fondu si Réduire les animations), annonce VoiceOver à l'apparition, hints explicites. Si l'on ignore la bannière 15 s, elle se ferme ET refuse le second appel (sinon l'appelant sonnerait indéfiniment).

Écarts :
- Boutons capsule libellés « Refuser » (error) et « Répondre » (success) de 44 dp min ; Android affiche deux ronds-icônes (Répondre à la couleur d'accent du pair).
- Fond verre sombre épinglé (ultraThin + noir .6) coins lg, marge top sm ; Android utilise backgroundSecondary du thème.
- Icône téléphone à gauche et nom limité à une ligne (largeur 140 dp fixe aujourd'hui).
- Transition d'entrée glissée du haut + fondu (Réduire les animations : fondu seul).
- Annonce d'accessibilité à l'apparition + hints « Refuse le nouvel appel… » / « Termine l'appel en cours et répond… ».

Rendu : Capsules 44 dp, Refuser rouge MeeshyColors.error, Répondre vert success, texte subheadline medium blanc ; bannière coins lg, marge horizontale md.

Transposition Android : Compose AnimatedVisibility(slideInVertically + fadeIn) ; announce via semantics liveRegion.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CallWaitingBannerView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallWaitingTimer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallWaitingReducer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallWaiting.kt`

### Flouter l'arrière-plan de ma caméra pendant l'appel sans faire ramer la vidéo

`calls-background-blur` · Android : **partielle** · P2 · effort M

CallBackgroundBlur : un seul VNSequenceRequestHandler et une seule requête de segmentation de personne pour tout l'appel (appelés depuis la file série du CallVisionWorker) ; le masque est calculé HORS de la file de capture, à la cadence du palier (balanced 15 i/s, fast 15 i/s, slow 10 i/s, off), adouci, lissé dans le temps puis réutilisé par chaque image jusqu'au suivant ; le flou lui-même tourne sur l'image réduite au quart ; le masque lissé est figé dans un tampon de SA réserve. Une surcharge descend d'UN palier à la fois, seul le dernier coupe le flou (sans flou actif, les paliers intermédiaires n'économisent rien : droit au dernier, et retour au budget droit au premier — CallVideoDegradation mesure le temps par image). CallVisionWorker garantit qu'une analyse Vision ne tourne JAMAIS sur la file de capture : une à la fois, une image soumise pendant qu'une analyse est en vol est abandonnée (rien ne s'empile).

Écarts :
- Seul le modèle existe (VideoFilterConfig.backgroundBlurEnabled/Radius + VideoFilterDegradePolicy) : aucun actionneur dans le flux de capture WebRTC (aucun VideoProcessor/frame processor).
- Segmentation de personne : ML Kit Selfie Segmentation / MediaPipe Image Segmenter exécutée hors du fil de capture, à la cadence du palier, masque adouci et lissé temporellement ; un travailleur à file série unique qui abandonne les images surnuméraires.
- Flou gaussien sur image réduite au quart (RenderScript n'existe plus : shader GLES ou RenderEffect/Gaussian via GPU) composé avec le masque ; palier de dégradation (balanced → fast → slow → off) piloté par la mesure du temps par image.
- Interrupteur et rayon réglables dans le panneau d'effets (partie vue d'appel) ; désactivé sous contrainte thermique (voir calls-quality-adaptation).
- Signposts de performance (CallVideoSignposts) → Trace.beginSection pour mesurer sur appareil réel.

Rendu : Arrière-plan flouté avec contour net de la silhouette (masque adouci), sans scintillement d'une image à l'autre ; commutateur « Flou d'arrière-plan » + curseur de rayon dans le panneau d'effets.

Transposition Android : Vision VNGeneratePersonSegmentationRequest → ML Kit Selfie Segmentation (ou MediaPipe) ; Core Image CIGaussianBlur → fragment shader GLES 3 dans un org.webrtc.VideoProcessor ; DispatchQueue série → HandlerThread dédié.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallBackgroundBlur.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallVisionWorker.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterConfig.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`

### Rappeler d'un geste depuis la notification d'appel manqué ou depuis l'assistant système

`calls-callback-system-intents` · Android : **partielle** · P2 · effort S

CallBackRequest se construit depuis une notification (types missed_call, CALL_MISSED, call_declined : appelant = senderId ou callerUserId, nom = senderDisplayName/senderUsername/callerName, vidéo = isVideoCall, conversation) ou depuis un INStartCallIntent / NSUserActivity (Siri, Récents, CarPlay) avec handle, nom et capacité audio/vidéo. Le tap sur la notification ou la demande système compose via CallBackDialer.

Écarts :
- Un tap sur missed_call / call_declined ouvre seulement la conversation (NotificationDestination.CONVERSATION_TYPES) : ajouter l'action de notification « Rappeler » (audio/vidéo selon isVideoCall) qui construit un CallBackRequest et compose via le dialer.
- Modèle CallBackRequest(userId, displayName, isVideo, conversationId?) avec les normalisations iOS (trim, repli senderId → callerUserId, repli de nom senderDisplayName → senderUsername → callerName).
- Équivalent INStartCallIntent : App Actions (capability actions.intent.CREATE_CALL dans shortcuts.xml) + raccourcis dynamiques des contacts favoris pour « OK Google, appelle X sur Meeshy » ; rangée de données ContactsContract (vnd.android.cursor.item/vnd.me.meeshy.call) si la synchro des contacts existe.
- Gérer la demande reçue app tuée (cold start) via l'attente de disponibilité du dialer.

Rendu : Action de notification libellée « Rappeler » (icône téléphone/caméra) sous la bannière d'appel manqué ; aucun écran propre.

Transposition Android : INStartCallIntent / NSUserActivity → Google Assistant App Actions (BII CREATE_CALL) + ShortcutManager ; UNNotificationAction « Rappeler » → NotificationCompat.Action avec PendingIntent vers MainActivity (extras callback*).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Contacts/CallBackRequest.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`

### Retoucher ma vidéo en direct : teintes d'étalonnage (naturel, chaud, froid, vif, atténué), teint naturel, peau lissée, cernes relevés

`calls-color-looks-and-skin` · Android : **partielle** · P2 · effort M

CallColorLook (#9289) : une teinte n'est plus une chaîne de filtres globaux mais UN étalonnage cuit dans un cube 3D appliqué en une passe (courbe filmique, virage des ombres et des hautes lumières, vibrance qui sature d'abord ce qui est terne) et qui ÉPARGNE les tons chair — un visage reste un visage sous « Froid » comme sous « Vif ». La fonction d'étalonnage (grade) est pure ; le cube se calcule une fois par teinte à la première demande. CallSkinRetouch décide une fois par image depuis le réglage et l'état de l'appareil (rien à faire ⇒ aucun surcoût) : Teint naturel 0…1, Peau lissée 0…1 avec part de texture fine réinjectée, relevé des cernes 0…1 ; passe fine dégradée sur surcharge (la texture vient de la basse fréquence). Le masque de peau est un ensemble d'ellipses dans le repère de l'image redressée (visage incliné selon la ligne des yeux) qui exclut ce qui n'est pas de la peau (yeux, lèvres).

Écarts :
- VideoFilterPreset (natural, warm, cool, vivid, muted) et VideoFilterConfig sont portés (température, teinte, luminosité, contraste, saturation, exposition) mais ne pilotent aucun traitement image : implémenter l'étalonnage par LUT 3D (sampler3D GLES 3) dans un VideoProcessor, avec cube calculé une fois par teinte.
- Fonction d'étalonnage pure (grade) : courbe filmique, virage ombres/hautes lumières, vibrance, protection des tons chair — recette par préréglage (CallColorLook.Recipe) avec tests de non-régression de couleur.
- Retouche de peau : plan par image (CallSkinRetouchPlan : teint naturel, lissage, texture fine, cernes), masque d'ellipses orienté selon la ligne des yeux excluant yeux/lèvres, noyau de séparation de fréquences ; passe fine désactivée sous charge.
- Réglages persistés (intensité Peau lissée jamais nulle quand le lissage est choisi) ; panneau d'effets (partie vue d'appel).
- Boost basse lumière (LowLightBoostPolicy, DarkFramePolicy, FrameLuminance portés mais inutilisés) à brancher à la caméra.

Rendu : Pastilles de teintes (Naturel, Chaud, Froid, Vif, Atténué) avec aperçu, curseurs Teint naturel / Peau lissée / Cernes ; rendu naturel : visages préservés, pas de peau « plastique » à faible intensité.

Transposition Android : Core Image CIColorCube + CIKernel → fragment shaders GLES 3 (sampler3D pour la LUT) dans un org.webrtc.VideoProcessor ; Vision face landmarks → ML Kit Face Detection/Mesh pour le masque de peau.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CallColorLook.swift`
- `apps/ios/Meeshy/Features/Main/Services/CallSkinRetouch.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterConfig.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LowLightBoostPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DarkFramePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/FrameLuminance.kt`

