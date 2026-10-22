# Parité iOS → Android : `story-reader-player`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**82 features iOS** : 31 absentes, 44 partielles, 4 divergentes, 3 complètes sur Android. **44 lots** planifiés (≈35400 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**story-reader-player#1** (couverture Android estimée ≈ 22 %)

Cette partie couvre tout ce que l'utilisateur voit et fait quand il regarde les stories sur iOS : le plateau d'anneaux (StoryTrayView : anneaux, points de comptage, avatar « Moi » avec menu contextuel, anneau d'upload, bande épinglée compacte), puis le lecteur plein écran (StoryViewerView et ses 30 extensions) : carte de scène 9:16 sur sol flou, barres de progression scrubbables, geste de tap par bandes, appui long = pause, glissé bas = fermeture / plein écran, cube 3D entre auteurs avec interlude d'identité, transitions d'entrée zoom/slide/reveal, rail d'actions figé par slide (son, réagir, répondre, envoyer, republier, vues, composer, exporter, commentaires, traductions), barre de réactions scrubbable avec vol d'emoji, barre et explorateur de langues du Prisme, overlay de commentaires threadés sur la story, composeur de commentaire repliable, légende / transcription, menu « … », sentinelle de format récent, saut des stories expirées ou vides, pause-ou-boucle selon l'engagement, préchargement N±2 et accessibilité VoiceOver. Côté SDK : StoryService (REST stories), ReaderPrism (descente stricte des langues du lecteur) et les helpers de publication (stickers image, texte alternatif, bibliothèque de stickers). Android a un lecteur « minimal mais réel » (feature/stories : StoryViewerScreen + StoryViewerViewModel + StoryPlayback) : progression segmentée, tap moitié gauche/droite, auto-avance conditionnée au chargement de l'image, rail à deux boutons (cœur + langues) avec scrub et vol d'emoji, feuilles Vues / Commentaires plats / Envoyer à, signalement, suppression, rendu de texte/médias/tracés avec keyframes, et un plateau d'anneaux avec bandeau d'échecs de publication. La parité est faible : aucune pause / appui long, aucun interlude, cube, transition d'entrée, plein écran, sentinelle, saut des stories expirées, légende dépliable, transcription, couple son/muet, export vidéo, republication d'un tap, commentaires threadés / likes / édition / pièces jointes, ni menu contextuel « Moi » ou anneau d'upload. Le lecteur Android recharge le réseau à chaque ouverture (pas de cache-first) et remet la barre à zéro à la fermeture d'une feuille. Estimation globale de parité : environ 22 %.

**story-reader-player#2** (couverture Android estimée ≈ 25 %)

Cette part couvre le dessous du lecteur de stories iOS, sans ses vues (celles-ci sont dans la part 1). Elle comprend la page plein écran d'une humeur (Mood Spotlight), l'export MP4 (enregistrer dans Photos, partager, habillage de marque), le pipeline de publication (file locale, upload TUS, file hors ligne durable, brouillons, édition, visibilité), le cerveau du tray (StoryViewModel : cache d'abord, delta-sync, tombstones, temps réel, registre des vues, préchargement et épinglage hors ligne, couvertures) et les écrans cibles de notification de story. Elle comprend aussi environ 85 fichiers du modèle SDK : StoryEffects, objets texte, média, son, sticker, lieu, 200 gabarits de stickers décorés, commandes d'édition de timeline, SceneShape et fond letterbox, mosaïque.
Android a déjà un lecteur et un composer solides : tray Room en cache d'abord et paginé, file de publication via outbox avec anneau optimiste et bandeau d'échec retry/discard, TUS, canvas v3, 25 effets de texte, MosaicLayout et durée de slide à l'identique. Il reste des écarts structurels.
- Absent : page Humeur, export/partage/enregistrement MP4 (aucun compositeur Media3), habillage de marque, écran cible de notification (expirée, hors ligne, serveur), gabarits de stickers et animations, pastille de lieu, forme de scène 9:16 avec bande letterbox, commandes undo/redo de timeline, ajustements d'image, édition d'une story publiée, liste de brouillons, interstitiel d'identité, couvertures de tray.
- Partiel : modèle plus étroit (3 styles de police sur 18 manquants, aucun cadre de texte, aucun champ référence/mention, StoryItem sans referenceAccess ni compteurs), publication limitée au type STORY sans mentions ni textes alt, markViewed sans écriture locale ni outbox, aucun consommateur de story:created/story:viewed, préchargement limité aux images, durée d'expiration par défaut 21 h contre 20 h sur iOS, traduction de story côté client sur la légende seule.
Estimation : environ 25 % de parité sur le périmètre de la part. Le plus gros travail est le moteur d'export vidéo (XL, hors part), le rendu des gabarits de stickers et le tray avancé.

## Notes transverses

1) Budget et collisions : StoryViewerScreen.kt (1113 l.), StoryViewerViewModel.kt (999 l.), MeeshyApp.kt (1202 l.) et core/model Story.kt (480 l., ~35 types) sont au plafond ou le frôlent. Trois lots mécaniques les précèdent (story-model-split, story-viewer-decomposition, story-scene-player-sdk-ui). Le premier découpe Story.kt, le deuxième crée un hôte mince plus des fichiers « emplacement » à propriétaire unique (Shell, GestureLayer, DragLayer, PlaybackDriver, Canvas, Header, ProgressBars, RailOverlays, SheetsHost, CommentsOverlayHost) et sort les routes story de MeeshyApp.kt vers StoryNavGraph.kt, le troisième sort la scène en lecture seule vers :sdk-ui. Règle à poser dans chaque lot : ne plus ajouter de champ à StoryViewerUiState, chaque lot expose son propre contrôleur ou StateFlow. StoryViewerViewModel est construit positionnellement dans StoryViewerViewModelTest : tout changement de constructeur met ce test à jour.
2) Chaînes : feature/stories a 4 locales (values, values-es, values-fr, values-pt). Chaque lot UI crée son propre strings_<lot>.xml dans les 4 dossiers (le chemin listé représente la famille) pour éviter les conflits sur strings.xml.
3) Règle feature→feature interdite : le fil (:feature:feed) ne peut pas importer :feature:stories, d'où story-scene-player-sdk-ui (embed de repost, couvertures du plateau, export). Les écrans Mood vivent dans :feature:feed (statuts déjà là). Le composeur de commentaire ne peut pas réutiliser ChatComposer (:feature:chat) : il est reconstruit dans :feature:stories sur les primitives sdk-ui ; une extraction vers sdk-ui reste à décider côté chat.
4) Collision de nom : Android a déjà StoryBackgroundFraming (cadrage x/y/scale du composeur) ; l'équivalent iOS fit/fill est donc nommé StoryVideoFitMode / StoryBackgroundFit. Ne pas écraser l'existant.
5) Dépendances externes déclarées : ext:scene-export-compositor (moteur de composition vidéo XL, hors périmètre : sans propriétaire, l'export est bloqué), ext:conversation-send-outbox et ext:e2ee-session-send (réponse privée à une humeur ; sdk-core n'a aucune pile Signal), ext:contacts-user-picker (visibilité EXCEPT/ONLY), ext:chat-pending-reply-context (bouton Répondre du rail), ext:push-data-message-post-seed. Le catalogue SocialEventsV2 n'existe pas côté Android (lot story-navigation-telemetry).
6) Écarts de loi à corriger : TTL d'expiration 21 h côté Android contre 20 h côté iOS (StoryGrouping.kt, lot story-item-group-model) ; StoryApi.list n'expose ni meta.deletedStoryIds ni updatedSince (ApiResponse sans champ meta) ; LanguageResolver.preferredContentLanguages ajoute le repli fr alors que la lecture des stories exige la descente stricte ReaderPrism ; la locale appareil n'entre pas pour un participant anonyme.
7) Risques : cube 3D (graphicsLayer rotationY, cameraDistance, pas de matrice singulière) ; arbitrage des gestes Compose (tap, appui long, glissé, barres de réactions, listes défilantes) à centraliser dans StoryReaderDragOwnership ; polices des 18 styles de texte (Zapfino, Papyrus, Didot absentes d'Android : embarquer des équivalents OFL et vérifier les licences) ; floutage RenderEffect API 31+ avec repli scrim (minSdk 26), shaders AGSL API 33+ ; migration Room pour les brouillons multiples (version de schéma et schémas JSON) ; export vidéo : ajouter media3-transformer et media3-effects (catalogue 1.4.1 actuel : exoplayer et ui seulement) ; jingle et carte de fin de marque à fournir en res/raw.
8) Lois Meeshy : toute lecture de story passe par ReaderPrism (descente stricte, original si aucune traduction) ; présence : détail En ligne/Absent/Inactif/Hors ligne de l'interlude réservé aux amis acceptés (FriendshipCache), couleurs via meeshyPresenceDotColor central, jamais redéclarées ; accent : composeur et rail utilisent l'accent de l'auteur ou du commentaire visé (second arrêt +30 degrés) ; cache-first : jamais de spinner sur un cache non vide ; optimiste : snapshot, application locale, réseau, rollback ciblé sur la story d'origine.
9) Lois pures et TDD : toute loi pure va dans :core:model (aucun import android.*) et se prouve localement par ./apps/android/meeshy.sh jvm-check ; Compose, Hilt et Room ne sont prouvés que par la CI android.yml. Un lot ne se déclare vert qu'avec un run CI vert.
10) Écarts de périmètre : features « complete » ignorées (srp-model-transitions, srp-model-slide-duration, srp-model-mosaic-layout). L'action « Imager » du menu d'un commentaire dépend du moteur de cartes image : hors lots, à ouvrir en issue de suivi. Le sélecteur de visibilité EXCEPT/ONLY du composeur et le panneau de texte alternatif appartiennent au domaine composeur ; seule la loi serverKeyed est livrée ici. Fichiers hôtes d'autres domaines touchés en une ligne : ConversationListScreen (feature/conversations) et FeedScreen (feature/feed) pour la bande épinglée.
11) Ordonnancement : le graphe de dépendances est acyclique ; les cycles de l'inventaire (cube↔glissé, commentaires↔composeur) sont cassés ainsi : le glissé fournit le décalage horizontal que consomme le cube ; la liste de commentaires expose replyTarget, que le composeur consomme. 61 lots, environ 40 000 lignes ; le chemin critique du lecteur est decomposition → hold → gestes → shell → glissé → cube.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `story-action-rail-plan-and-layout` | E | P0 | M | 1100 | story-viewer-decomposition-and-nav-graph, story-item-group-model | Le rail d'actions propose réagir, répondre, envoyer, republier, vues, exporter et traduire selon la story |
| `story-canvas-card-floor-and-sentinel` | E | P0 | L | 1300 | canvas-scene-unique-en-lecture, modele-scene-stickers-lieux-reglages-texte | La scène s'affiche en carte 9:16 sur un sol flou, avec un message clair si le format est plus récent |
| `story-drag-dismiss-and-fullscreen` | E | P0 | M | 1000 | story-gesture-tap-zones-and-pause, story-viewer-shell-open-close | Glisser vers le bas ferme, vers le haut passe en plein écran, sans voler les gestes des panneaux |
| `story-gesture-tap-zones-and-pause` | E | P0 | M | 650 | story-playback-hold-and-stall, story-viewer-decomposition-and-nav-graph | Taper les bords change de story, double-taper le centre ou maintenir met en pause |
| `story-header-identity-and-options-menu` | E | P0 | M | 800 | story-playback-hold-and-stall, story-item-group-model, story-viewer-decomposition-and-nav-graph | L'en-tête montre l'auteur et son menu regroupe lecture, partage et modération |
| `story-item-group-model` | E | P0 | M | 520 | story-model-split-un-type-par-fichier | Une story et un groupe d'auteur portent les mêmes données qu'sur iOS |
| `story-model-split-un-type-par-fichier` | E | P0 | S | 520 |  | Le modèle de story est rangé un type par fichier sans changer le fil |
| `story-playback-hold-and-stall` | E | P0 | M | 1000 | story-viewer-decomposition-and-nav-graph | La story se fige ou boucle selon ce que fait l'utilisateur et reprend là où elle était |
| `story-prism-reader-laws` | E | P0 | S | 520 | story-viewer-decomposition-and-nav-graph | Le lecteur de stories lit dans la langue du prisme strict, sinon l'original |
| `story-service-rest-surface` | E | P0 | M | 900 | socle-points-d-extension-de-l-app | Le service de stories sait synchroniser par delta, lister mes stories, republier et réagir avec refus explicites |
| `story-tray-my-story-actions` | E | P0 | M | 600 | story-tray-rings-metrics-and-cells, profile-mystories-screen | Mon avatar Moi crée, ouvre ou gère mes stories et change mon mood |
| `story-tray-rings-metrics-and-cells` | E | P0 | M | 900 | story-item-group-model | Le plateau d'anneaux montre qui a posté, ce qui est nouveau et se lit sans attendre |
| `story-viewed-ledger-and-impressions` | E | P0 | M | 520 | story-item-group-model, story-service-rest-surface, persist-outbox-kinds-social-stories, persist-compte-lois-stockage, persist-outbox-registre-senders, story-viewer-decomposition-and-nav-graph | L'anneau passe en vu immédiatement, même hors ligne, et ne se rallume que si la story est éditée |
| `story-viewer-decomposition-and-nav-graph` | E | P0 | M | 700 | socle-points-d-extension-de-l-app | Le lecteur de stories est découpé en couches où chaque fonction s'ajoute sans collision |
| `story-viewer-entry-position-and-skip` | E | P0 | L | 1400 | story-viewer-decomposition-and-nav-graph, story-service-rest-surface, story-item-group-model, modele-scene-stickers-lieux-reglages-texte | Le lecteur s'ouvre sur la bonne story, la garde sous les doigts et saute ce qui est vide ou expiré |
| `story-viewer-shell-open-close` | E | P0 | M | 500 | story-viewer-decomposition-and-nav-graph, story-playback-hold-and-stall | Le lecteur s'ouvre en grandissant, se ferme en glissant et libère tout en quittant |
| `mood-spotlight-page-and-emoji-rain` | E | P1 | M | 850 | story-reply-sender-and-admission, story-viewer-entry-position-and-skip | Ouvrir une humeur reçue sur une page plein écran avec pluie d'emoji et champ de réponse |
| `story-a11y-reader` | E | P1 | S | 300 | story-gesture-tap-zones-and-pause, lecture-barre-attente-et-scrub, story-canvas-card-floor-and-sentinel, pastille-de-lieu-sur-la-scene | La story se lit et se navigue au lecteur d'écran sans voir ni toucher |
| `story-audio-mute-and-chips` | E | P1 | M | 700 | story-action-rail-plan-and-layout, story-header-identity-and-options-menu, story-media-and-audio-object-model, story-reader-prefetch-window | Couper le son de la story, voir le crédit du son de fond et muter une piste au toucher |
| `story-caption-and-voice-transcript` | E | P1 | M | 700 | story-canvas-card-floor-and-sentinel, story-prism-reader-laws, story-playback-hold-and-stall, story-gesture-tap-zones-and-pause, story-header-identity-and-options-menu | La légende se déplie en bas de scène et la transcription vocale se lit à la demande |
| `story-comment-composer-attachments` | E | P1 | M | 1000 | story-comment-composer-core | Joindre une photo, un fichier, un lieu ou une voix à un commentaire de story |
| `story-comment-composer-core` | E | P1 | M | 1000 | story-comments-data-and-threads, story-comments-overlay-and-row-menu, persist-outbox-registre-senders | Commenter ou répondre depuis une seule barre de saisie, brouillon par story, sans rien perdre |
| `story-comments-data-and-threads` | E | P1 | L | 1300 | story-service-rest-surface, story-prism-reader-laws | Les commentaires de story ont des réponses imbriquées, des j'aime, des traductions et une pagination |
| `story-comments-overlay-and-row-menu` | E | P1 | L | 1500 | story-comments-data-and-threads, story-canvas-card-floor-and-sentinel, story-playback-hold-and-stall, story-viewer-entry-position-and-skip | Lire les commentaires par-dessus la scène, avec réponses, j'aime, traductions et menu par ligne |
| `story-composer-fold-and-silence` | E | P1 | M | 450 | story-comment-composer-core, story-caption-and-voice-transcript | Écrire un commentaire fait le silence autour de la story, et le composeur se replie en bulle |
| `story-direct-repost-and-share-link` | E | P1 | M | 650 | story-header-identity-and-options-menu, story-action-rail-plan-and-layout, story-service-rest-surface, persist-outbox-registre-senders | Republier une story d'un tap, en story, en post ou en réel, et la partager par lien traçable |
| `story-group-cube-transition` | E | P1 | M | 750 | story-drag-dismiss-and-fullscreen, story-group-intro-interlude, story-reader-prefetch-window | Passer d'un auteur à l'autre fait tourner un cube 3D qui suit le doigt |
| `story-group-intro-interlude` | E | P1 | M | 1050 | story-item-group-model, transitions-douverture-et-fermeture-de-slide, story-gesture-tap-zones-and-pause | Un bref interlude d'identité annonce le changement d'auteur |
| `story-language-bar-and-explorer` | E | P1 | M | 800 | story-action-rail-plan-and-layout, story-prism-reader-laws, story-service-rest-surface, story-viewer-decomposition-and-nav-graph | Lire la story dans une autre langue : barre rapide, option Original et explorateur avec retraduction |
| `story-media-and-audio-object-model` | E | P1 | L | 1400 | story-model-split-un-type-par-fichier | Les médias et les sons d'une story gardent volume, muet mémorisé, réglages et bonnes pistes |
| `story-notification-target-screen` | E | P1 | M | 800 | story-viewer-entry-position-and-skip, story-item-group-model, story-service-rest-surface, socle-pipeline-push-et-cycle-de-vie | Toucher une notification de story mène à la story, ou à un écran clair si elle a expiré ou si le réseau manque |
| `story-publish-format-extras` | E | P1 | M | 700 | story-publish-media-upload-and-alt, modele-scene-stickers-lieux-reglages-texte | Publier avec ses mentions, ses textes alternatifs et le choix story, post, réel ou aussi en réel |
| `story-publish-media-upload-and-alt` | E | P1 | M | 1100 | modele-scene-stickers-lieux-reglages-texte, story-media-and-audio-object-model, story-sticker-animation-and-scene-motion | Les médias d'une story partent compressés, stickers animés intacts, texte alternatif sous le bon média |
| `story-publish-queue-progress-and-offline-feedback` | E | P1 | M | 1100 | story-publish-media-upload-and-alt, persist-stories-brouillons-liste, persist-outbox-registre-senders | Voir ses publications monter l'une après l'autre, avec une mise en file hors ligne annoncée sans perte |
| `story-reaction-strip-recovery` | E | P1 | S | 450 | story-action-rail-plan-and-layout, story-service-rest-surface, story-drag-dismiss-and-fullscreen, persist-outbox-registre-senders | Une réaction posée hors ligne part au retour du réseau, un refus serveur annule exactement |
| `story-reader-prefetch-window` | E | P1 | M | 650 | story-viewer-decomposition-and-nav-graph, story-playback-hold-and-stall, lecture-prechargement-et-surface-reutilisable | Les stories voisines sont prêtes avant qu'on y arrive, entre auteurs aussi |
| `story-reply-sender-and-admission` | E | P1 | M | 450 | routeur-de-navigation-hubs-et-cibles-differees, persist-messages-repository-decoupage, chat-viewmodel-state-split, story-viewer-decomposition-and-nav-graph | Répondre en privé à une story ou à une humeur depuis la conversation directe avec son auteur |
| `story-repost-embed-scene-and-zoom` | E | P1 | M | 1000 | canvas-scene-unique-en-lecture, modele-scene-stickers-lieux-reglages-texte | Un post qui republie une story montre la scène lue en sourdine dans le fil, et elle grandit jusqu'au plein écran |
| `story-sticker-animation-and-scene-motion` | E | P1 | S | 520 | story-model-split-un-type-par-fichier, story-media-and-audio-object-model | Les stickers s'animent en boucle et une scène qui bouge se traite comme une vidéo |
| `story-tray-cache-first-delta-and-realtime` | E | P1 | M | 1200 | story-service-rest-surface, story-item-group-model, story-viewed-ledger-and-impressions | Le plateau se met à jour par delta et en direct, sans story fantôme |
| `story-tray-preload-and-offline-pin` | E | P1 | M | 700 | story-tray-cache-first-delta-and-realtime | Ouvrir une story sans attente et la relire hors ligne jusqu'à son expiration |
| `story-tray-upload-ring` | E | P1 | M | 450 | story-tray-my-story-actions, story-publish-queue-progress-and-offline-feedback | Une publication en cours s'affiche sur mon avatar avec sa progression, son attente ou son échec |
| `story-sticker-library-save` | E | P2 | M | 450 | story-publish-media-upload-and-alt, pastille-de-lieu-sur-la-scene | Enregistrer un sticker reçu dans Mes stickers depuis une story |
| `story-tray-pinned-band` | E | P2 | M | 450 | story-tray-my-story-actions, socle-points-d-extension-de-l-app | En faisant défiler, le plateau devient une bande compacte qui prend la place du titre |

### Lots fusionnés ou retirés par l'architecture

- `story-scene-player-sdk-ui` → `canvas-scene-unique-en-lecture` (merge-into) : Même rendu de scène en lecture seule dans :sdk-ui. Hérite : story-model-split-un-type-par-fichier, story-viewer-decomposition-and-nav-graph.
- `story-effects-wire-and-scene-shape` → `modele-scene-stickers-lieux-reglages-texte` (merge-into) : Même modèle de fil de scène (lieu, kinds inconnus réémis tels quels, forme 9:16). Hérite : story-model-split-un-type-par-fichier.
- `story-text-typography-and-frames` → `texte-de-scene-18-styles-et-effets` (drop-duplicate) : Mêmes 18 styles de texte et cadres.
- `story-sticker-template-catalog` → `gabarits-socle-registre-et-contour` (drop-duplicate) : Même catalogue de gabarits de stickers. Hérite : story-sticker-animation-and-scene-motion.
- `story-sticker-template-renderer` → `gabarits-socle-registre-et-contour` (drop-duplicate) : Même rendu des gabarits.
- `story-progress-bars-scrub` → `lecture-barre-attente-et-scrub` (drop-duplicate) : Même barre de progression parcourue au doigt. Hérite : story-playback-hold-and-stall.
- `story-slide-transitions` → `transitions-douverture-et-fermeture-de-slide` (drop-duplicate) : Mêmes transitions de slide. Hérite : story-canvas-card-floor-and-sentinel.
- `story-tray-covers` → `couverture-et-rendu-hors-ecran` (merge-into) : Même vignette réelle dans le plateau. Hérite : story-tray-rings-metrics-and-cells.
- `story-reader-sticker-and-place-layers` → `pastille-de-lieu-sur-la-scene` (merge-into) : Même couche lieu ; les stickers = stickers-et-mouvements-sur-la-scene. Hérite : story-canvas-card-floor-and-sentinel, story-gesture-tap-zones-and-pause.
- `story-timeline-commands-and-placement` → `montage-lois-fenetre-aimant-plan-commandes` (merge-into) : Même pile de commandes et placement non recouvrant.
- `story-export-video-service-and-brand-dressing` → `export-mp4-service-galerie-et-partage` (drop-duplicate) : Même export MP4 habillé.
- `story-export-save-to-gallery` → `export-mp4-service-galerie-et-partage` (drop-duplicate) : Même enregistrement en galerie. Hérite : story-action-rail-plan-and-layout.
- `story-export-share-sheet` → `export-mp4-service-galerie-et-partage` (merge-into) : Même partage de la vidéo exportée (choix de la langue gravée). Hérite : story-header-identity-and-options-menu.
- `story-my-stories-screen-and-visibility` → `profile-mystories-screen` (merge-into) : Même écran « Mes stories » ; le changement de visibilité = profile-mystories-actions. Hérite : story-service-rest-surface, story-item-group-model.
- `story-drafts-multi-and-resume` → `persist-stories-brouillons-liste` (drop-duplicate) : Même liste de brouillons reprise.
- `story-publish-edit-published` → `modifier-un-contenu-publie` (drop-duplicate) : Même modification d'une story publiée.
- `story-navigation-telemetry` → `analytics-story-negative-events` (merge-into) : Même télémétrie des gestes du lecteur.

## Features

### Couper le son de la story, voir le crédit du son de fond et muter une piste au toucher

`srp-audio-mute-chips` · Android : **absente** · P1 · effort M

Le rail propose Son / Muet seulement si la story a un son audible : StoryVideoAudioProbe compte les pistes audio des vidéos de premier plan (nil quand la sonde échoue, pour ne pas masquer le bouton toute la session) en priorité sur le préchargement, en plus des audioPlayerObjects et du son de fond annoncé. Le mute est un état local au lecteur (isGlobalMuted), basculé par le rail ou par la note du crédit du son de fond dans l'en-tête (BackgroundSoundBadge : titre · uploader, tap = mute). Les chips audio de premier plan (AudioForegroundReaderOverlay) sont posées au-dessus de la couche de gestes, visibles seulement dans la fenêtre startTime..startTime+duration de chaque audio ; leur tap mute la piste (registre partagé StoryReaderAudioMuteRegistry appliqué au mixer). StoryPostMediaResolver fait correspondre chaque postMediaId à l'URL streamable sur toute la fenêtre de préchargement, sans quoi l'audio saute en silence.

Écarts :
- Aucun contrôle de son : les pistes jouent via AudioTrackSurface et les vidéos avec muted = false codé en dur ; ajouter l'état isGlobalMuted et le bouton Son / Muet du rail, visible uniquement si la story a un son audible.
- Sonde de pistes audio des vidéos de premier plan (MediaExtractor / Media3 TrackGroups) lancée au préchargement ; résultat nul = inconnu (ne pas masquer le bouton).
- Badge de crédit du son de fond dans l'en-tête (note, titre, uploader) cliquable pour muter ; annonce accessible « Son / Muet ».
- Chips audio de premier plan par audioPlayerObjects avec fenêtre d'affichage et mute par piste, posées au-dessus de la couche de gestes (le tap n'avance pas la story).
- Résolveur postMediaId -> URL sur toute la fenêtre de préchargement ; un audio sans URL ne doit pas sauter en silence (journaliser).
- Coordination audio : démarrer le focus audio à l'ouverture, ne pas forcer le mute sur la prise de focus interne du lecteur.

Rendu : Bouton rail 'speaker.wave.2.fill' / 'speaker.slash.fill' avec libellé Son / Muet et contour indigo400 quand le son est ouvert ; badge de crédit en tertiaire dans l'en-tête ; chips audio petites, translucides, atténuées quand mutées.

Transposition Android : AVAudioSession / PlaybackCoordinator -> AudioManager focus + Media3 ; sonde AVAsset tracks -> MediaExtractor.getTrackCount.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas+Layers.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryVideoAudioProbe.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryPostMediaResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Modifier, supprimer ou faire retirer un commentaire de story depuis son menu

`srp-comment-edit-remove` · Android : **absente** · P1 · effort M

Le menu « … » d'une ligne de commentaire (CommentMoreMenu) offre à l'auteur Modifier (édition en place : le texte de la ligne devient un champ, enregistrer / annuler, aucune écriture si le texte est inchangé ou vide via StoryCommentEditing.draftToSend) et Supprimer, à la modération Retirer avec motif (ContentRemovalPolicy), et « Imager » (carte image du commentaire dont le hero est le visuel de la story). StoryCommentThreadWriter remplace ou retire le commentaire en place dans la racine comme dans la réponse (replacing / removing), met à jour le compteur, et remonte les erreurs (« Impossible de supprimer le commentaire », « Erreur lors de la modification du commentaire »). Les sockets comment:updated / deleted tiennent les autres clients à jour.

Écarts :
- Menu contextuel par ligne (appui long ou icône) avec Modifier / Supprimer pour l'auteur, Retirer avec motif pour la modération, Signaler ; éligibilité par politique (CommentMenuPolicy).
- Édition en place : champ qui remplace la ligne, états editing / envoi / erreur, no-op si texte inchangé ou vide ; endpoints PATCH / DELETE des commentaires (non déclarés dans StoryApi aujourd'hui).
- Remplacement / retrait local dans racines et réponses avec ajustement du compteur et du nombre de réponses ; gestion des sockets comment:updated et comment:deleted.
- Chaînes : feed.comments.editing, edit_error, delete_error, deleted ; confirmation de suppression ; action « Imager » (carte image du commentaire) dépendante du moteur de cartes.

Rendu : L'édition garde la ligne à sa place avec un champ accentué par la couleur de l'auteur ; actions Enregistrer / Annuler compactes ; pas de feuille séparée.

Transposition Android : CommentMoreMenu -> DropdownMenu / bottom sheet d'actions ; édition en place -> BasicTextField dans la ligne.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CommentMenu.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsReducer.kt`

### Écrire un commentaire fait le silence autour de la story, et le composeur se replie en bulle

`srp-composer-fold-silence` · Android : **absente** · P1 · effort M

Directive 2026-09-28 : le texte qui accompagne la story commence exactement au-dessus du composeur (StoryCaptionPlacement) ; un glissement vers le bas SUR le composeur lui appartient (StoryComposerGesture : vertical dominant dès 8 pt, repli à partir de 40 pt) et le replie en un bouton centré à l'icône de commentaire (bubble.left.fill) qui le rouvre sans rouvrir le clavier ; un chevron ⌄ dans l'angle haut-droit le replie aussi. Le repli garde bannière de réponse et brouillon et la bulle signale ce qu'il garde (enregistrement vocal, réponse). Une nouvelle demande de réponse rouvre le composeur replié. StoryComposingFocus : pendant la saisie, le chrome (voiles, barres, en-tête, rail, légende, chips audio, cibles de lieux, réactions en vol) s'efface en fondu de 0,2 s et cesse d'intercepter le doigt (storyFocusFade), sauf le média / la scène, le composeur et la couche des commentaires ouverte.

Écarts :
- Composeur replié : état expanded / folded avec bouton chevron ⌄ (visible par défaut), bulle de réouverture centrée (icône commentaire) sans rouvrir le clavier, badges de bulle (enregistrement en cours, réponse en attente), libellés d'accessibilité story.composer.fold / unfold / unfold.recording / unfold.replying.
- Geste de repli : glissé vertical sur le composeur (dominance verticale dès 8dp, repli >= 40dp) qui prime sur le glissé du lecteur ; une nouvelle réponse à un commentaire rouvre le composeur.
- Silence de saisie : conjonction chromeVisible && !isComposing pour le chrome, !isComposing pour les décorations de contenu ; fondu 0,2 s + désactivation du hit-testing + masquage accessibilité (storyFocusFade).
- Placement de la légende au ras du bloc composeur mesuré (hauteur de plaque + retrait bas : zone sûre, clavier, panneau d'emojis) ; ressort 0,32 / 0,82 pour le repli.
- Quand le chrome est masqué (immersion), le composeur glisse hors de l'écran et ne réserve plus de place.

Rendu : Bulle de réouverture centrée en bas, icône 'bubble.left.fill' en couleur d'accent, chevron ⌄ dans la plaque ; fondu 0,2 s sans ressort pour le silence de saisie.

Transposition Android : focus du champ -> WindowInsets.isImeVisible + état de composition ; animations avec AnimatedVisibility/Modifier.alpha et pointerInput(enabled).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryComposerFold.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerLayer.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryComposingFocus.swift`

</details>

### Habiller chaque export vidéo d'un interlude d'identité, d'une signature sonore, d'une carte de fin et d'un filigrane

`srp-export-brand-dressing` · Android : **absente** · P1 · effort M

Deux habillages coexistent. STORY : interlude d'identité, signature sonore Meeshy, la story, puis carte de fin. ŒUVRE SEULE (réel, post, scène de post) : ni interlude, ni carte. L'interlude présente l'AUTEUR : le lecteur connecté si c'est lui, sinon l'auteur de la story, jamais le lecteur qui exporte celle d'un autre. L'identité se tranche par id (repli sur le pseudo). Le profil vient du cache profils puis du réseau, avec une résolution BORNÉE à 4 s, et se replie sur nom, pseudo et teinte. Le filigrane porte le pseudo de l'auteur de l'œuvre.

Écarts :
- Types StoryExportAuthor(userId, name, avatarUrl), StoryExportViewer, StoryExportIdentity(viewer | author) et StoryExportDressing(story | bareWork). StoryExportDressing.forStory(of:viewer:) : l'id tranche si les deux côtés en ont un, le pseudo ne sert qu'en repli.
- StoryExportDressingResolver.plan(for:) avec timeout borné (BoundedAsyncResolution, 4 s) : bareWork ne résout rien ; story résout viewerIntro ou authorIntro, avec repli unresolved(author) quand la borne est dépassée.
- Source d'identité depuis le cache profils (MeeshyUser) : avatar, displayName, vrai pseudo, couleur. Fabrique du contenu d'interlude (équivalent StoryExportIntroFactory) à poser côté SDK.
- Assets de marque : jingle Meeshy et carte de fin (outro) à embarquer en res/raw ; filigrane MeeshyExportWatermark.make(username).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryExportDressing.swift`

</details>

### Enregistrer une story en vidéo dans la galerie avec un anneau de progression annulable

`srp-export-save-to-gallery` · Android : **absente** · P1 · effort M

Depuis « Mes stories », une story, une scène de post ou un réel est cuit en MP4 en arrière-plan, sans feuille de partage. La langue est résolue par le Prisme (première langue préférée parmi les traductions), l'habillage de marque est appliqué et la vidéo est écrite dans Photos. L'anneau de progression remplace le glyphe ⋯ : le bake occupe 0 à 90 % et l'écriture photothèque les 10 % restants. Un tap annule tant que l'écriture n'a pas commencé, puis l'anneau devient non tappable. Un post à plusieurs scènes est mis bout à bout. Le service est un singleton qui survit à la fermeture de la feuille. Un jeton de génération invalide les tentatives annulées ou relancées. Toasts : « Vidéo enregistrée dans Photos », « Export annulé », « L'export de la story a échoué. Réessayez. », et un message d'autorisation Photos refusée.

Écarts :
- Service singleton StorySaveService (StateFlow storyId vers progression 0..1, et ensemble des jobs non annulables), indépendant du cycle de vie de l'écran. Un travail long passe en WorkManager / foreground service pour survivre à la fermeture de la feuille.
- Mapping de progression : bake × 0,9, écriture galerie jusqu'à 1,0. Jeton de génération par story : chaque save() et chaque cancel() l'incrémente, et tout effet post-suspension vérifie isCurrent(generation).
- Écriture via MediaStore.Video (Movies/Meeshy, IS_PENDING) : sans permission sur API 29+. Réutiliser GallerySaveTarget / GalleryImageSaver pour la partie chemin, et nettoyer le MP4 temporaire dans tous les cas. L'écriture galerie n'est pas annulable : l'anneau devient désactivé.
- Annulation avant écriture : nettoyer le MP4 déjà cuit quand il arrive après coup, sans second toast. Concaténation de scènes pour un post multi-scènes (Transformer EditedMediaItemSequence).
- Toasts / Snackbars et haptique équivalents. Message d'échec de stockage : MediaStore refusé ou espace insuffisant.
- Entrées par source : save(story, author), save(scene), save(post/réel) avec habillage bareWork. Filigrane = pseudo de l'AUTEUR, jamais celui de qui enregistre.

Rendu : Anneau circulaire fin qui remplace l'icône ⋯ sur la ligne « Mes stories » et sur le rail du lecteur. Il se remplit en continu, passe à 90 % à la fin du bake, puis ne réagit plus au tap. Succès : haptique medium plus toast vert.

Transposition Android : PHPhotoLibrary.performChanges devient MediaStore.Video.Media (IS_PENDING). Le singleton @MainActor devient un @Singleton Hilt avec CoroutineScope applicatif, doublé d'un ForegroundInfo WorkManager pour les bakes longs.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GallerySaveTarget.kt`

### Partager une story en vidéo hors de Meeshy avec le choix de la langue gravée

`srp-export-share-video` · Android : **absente** · P1 · effort M

Le lecteur (auteur ou non, depuis #9953) ouvre une feuille d'export : choix de langue (langues présentes dans translations, défaut = première langue préférée disponible, sinon texte original), barre de progression, annulation, puis feuille de partage système avec le MP4. La story est reconstruite en slide rendable (texte, légende, audios hydratés, images des stickers appariées depuis story.media). Le MP4 n'est jamais envoyé au backend et son fichier temporaire est supprimé à la fin ou à l'annulation. Phases : idle, exporting, ready, sharing, failed. Fermer la feuille pendant l'export annule le bake. StoryExportLanguageResolver garantit que Partager et Enregistrer gravent la même langue.

Écarts :
- StoryExportShareViewModel avec phases (Idle, Exporting, Ready, Sharing, Failed) et progress. Un seul export à la fois, annulation et nettoyage du MP4 si le résultat arrive après coup.
- StoryExportLanguageResolver : availableLanguages(story) dans l'ordre du payload sans doublon, defaultLanguage(available, preferred) ; sélecteur de langue dans la feuille. Réutiliser cette même fonction pour « Enregistrer dans la galerie ».
- Reconstruire la slide via StoryItem.toRenderableSlide(preferredLanguages) et l'index postMediaId vers URL des stickers image. Appeler l'habillage selon StoryExportDressing.forStory(author, viewer).
- Feuille de partage : Intent.ACTION_SEND type video/mp4 via FileProvider avec chooser, puis nettoyage du fichier au retour (success ou cancel). Message d'échec « L'export de la story a échoué. Réessayez. »
- Entrée de menu « Partager en vidéo » dans les options du lecteur, pour toute story (hors repost sans contenu propre).

Rendu : Feuille basse : sélecteur de langue en pastilles drapeau, barre de progression, bouton Annuler. L'état échec affiche le message avec un bouton Réessayer.

Transposition Android : UIActivityViewController devient Intent.createChooser(ACTION_SEND, video/mp4) avec un content URI FileProvider. Le temp dans tmp/ devient cacheDir/exports/.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToSheet.kt`

### Cuire une slide en MP4 avec progression et nettoyage, sans jamais exposer d'erreur brute

`srp-export-video-engine` · Android : **absente** · P1 · effort M

StoryVideoExportService orchestre l'export auteur-seul d'une slide : prepareExport(slide, langues, filigrane, interlude, entrées, carte de fin) rend l'URL d'un MP4 temporaire unique, ou nil si le moteur a échoué (l'appelant affiche un toast convivial). La progression arrive à environ 10 Hz sur le main actor et la phase est « exporting ». cleanupExport(at:) est idempotent. L'export est universel : même une slide statique est cuite, via un substrat vidéo transparent. StorySlide.needsVideoExport indique si la slide a des éléments évoluant dans le temps. Le MP4 n'est JAMAIS publié : les stories partent brutes (assets plus JSON d'effets) pour que le Prisme retraduise par lecteur.

Écarts :
- Interface StoryVideoExporting (prepareExport / cleanupExport) injectable pour les tests, avec résultat nullable plutôt que des exceptions, fichier temporaire unique par appel dans cacheDir, nettoyage sur échec interne.
- Progression (Flow<Float> ou callback) et phase Exporting. needsVideoExport : vrai si la slide porte un vidéo/audio/keyframe/transition ou une fenêtre temporelle d'objet.
- Dépendance media3-transformer (et media3-effects) à ajouter : le catalogue ne déclare que exoplayer et ui. Le moteur de composition (calques texte, stickers, dessin, filtres, keyframes, transitions, mix audio, substrat transparent) est le gros morceau.
- Entrées hors slide (StoryExportInputs) : images de stickers rapatriées, bitmaps et sons de composer.

Transposition Android : AVAssetWriter / AVAssetExportSession devient Media3 Transformer avec CompositionPlayer (effets GL pour le texte, les stickers et les filtres). Seule l'orchestration (wrapper, cycle de vie du fichier, progression) est comptée ici.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+ExportTrigger.swift`

</details>

Android existant : `apps/android/gradle/libs.versions.toml`

### Passer d'un auteur à l'autre fait tourner un cube 3D qui suit le doigt

`srp-group-cube-transition` · Android : **absente** · P1 · effort M

StoryGroupCube + NeighborGroupCubeFace : pendant un glissé horizontal les deux faces (la carte courante et le backdrop léger du groupe voisin) tournent autour de l'axe vertical d'un vrai cube de côté largeur, centré derrière l'écran (angle = offset / largeur x 90 degrés, borné à 89,5 pour éviter la matrice singulière). La direction est réversible mi-geste, la résistance au bord vient de StoryGroupSwipeDecision.displayedTranslation, la face de dos est masquée, la face qui se détourne s'assombrit jusqu'à 0,45. Au commit (tap en bord, auto-avance ou relâchement) l'animation termine à l'identité en 0,34 s (courbe 0,25 / 0,8 / 0,35 / 1) puis le contenu est échangé à 0,38 s, de façon invisible. L'annulation revient en ressort amorti critique (0,3 s) sans montrer la face opposée. Le groupe voisin n'est monté que s'il a une story affichable (première non vue non expirée).

Écarts :
- Aucune transition entre auteurs : onSwipe saute directement le groupe. Implémenter deux faces avec graphicsLayer { rotationY, cameraDistance = 2,2 x largeur, transformOrigin sur l'arête commune, translationX } calculées dans le même repère.
- Géométrie d'un vrai cube : angle plafonné à 89,5 degrés, recul du cube de la valeur dont l'arête proche avancerait, face de dos non dessinée, ombrage jusqu'à 0,45 sur la face qui se détourne.
- Face voisine : backdrop statique léger du groupe cible avec sa carte d'identité (voir srp-group-intro-interlude), uniquement si le groupe a une story affichable.
- Commit : durée 0,34 s en courbe CubicBezier(0.25, 0.8, 0.35, 1), échange du contenu à 0,38 s ; annulation par ressort amorti critique (response 0,3) ; direction réversible tant que le doigt est posé.
- Résistance élastique aux bords (premier / dernier groupe) et suivi 1:1 du doigt sans amorti ; les taps en bord et l'auto-avance déclenchent le même commit sans drag.

Rendu : Arête commune dans le plan de l'écran, jamais plus haute que lui ; voile d'ombre croissant sur la face sortante ; rebond interdit à l'annulation pour ne pas montrer la face du côté opposé.

Transposition Android : CATransform3D / rotation3DEffect -> graphicsLayer(rotationY, cameraDistance) avec TransformOrigin ; matrice inversible pour la face de dos (pas de matrice singulière).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CubeFace.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerCardTransform.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySwipeResolver.kt`

### Un bref interlude d'identité (bannière, avatar, nom, présence, mood) annonce le changement d'auteur

`srp-group-intro-interlude` · Android : **absente** · P1 · effort M

Quand on enchaîne les groupes (avant comme arrière, ses propres stories comprises, jamais à la première ouverture ni en aperçu du composeur), StoryGroupIntroOverlay couvre la scène pendant 500 ms avec StoryAuthorIdentityCard : bannière équipée de l'auteur en fond (thumbhash puis dégradé couleur d'avatar vers noir), voile de lisibilité, au centre avatar, nom, @username, présence (détail En ligne / Absent·e / Inactif·ve / Hors ligne réservé aux amis) et mood. La même carte sert de face au cube. Double-tap = passer directement à la première slide ; tap à gauche = annuler le switch et revenir au groupe précédent. Les identités voisines sont pré-résolues pendant la lecture pour que l'interlude soit complet dès la première image. L'apparition de la story recouvre l'interlude de 200 ms et le retrait du voile suit la grammaire d'ouverture de la slide (ressort 0,38 pour zoom et slide, easeOut 0,4 reveal, 0,3 fade). La story n'est marquée vue qu'après l'interlude.

Écarts :
- Écran d'interlude de 500 ms avec carte d'identité : bannière (thumbhash + repli dégradé avatarColor vers noir), voile 0,62 / 0,28 / 0,72, avatar, nom, @username, pastille de présence et mood ; base opaque obligatoire sous la bannière.
- Règles : uniquement sur changement de groupe (avant / arrière), jamais à l'ouverture, jamais en aperçu, jamais pour un groupe sans story affichable ; markViewed seulement après l'interlude.
- Présence : état temps réel d'abord, sinon snapshot serveur du payload ; détail (En ligne, Absent·e, Inactif·ve, Hors ligne) affiché uniquement pour un ami (FriendshipCache) ; chaînes story.groupIntro.online / away / idle / offline.
- Gestes : double-tap ou tap à droite = ignorer, tap à gauche = revenir au groupe précédent avec le même cube ; un glissé ne doit pas être requalifié en tap (drapeau collant didMoveDuringTouch, jeton de purge).
- Pré-résolution des identités des groupes voisins pendant la lecture (groupIntroCache) ; accessibilité : résumé vocal de l'interlude et astuce « touchez deux fois pour passer » (story.groupIntro.skipHint).
- Sortie synchronisée avec la transition d'ouverture de la slide révélée (recouvrement de 200 ms).

Rendu : Plein écran sombre (schéma dark forcé), contenu centré ; avatar 'storyViewer', nom en titre, @username en secondaire, point de présence aux couleurs centrales (vert / orange / gris), mood en emoji ; durée nominale 500 ms avec traînée de ressort assumée.

Transposition Android : PresenceManager / FriendshipCache -> repositories de présence et d'amitié Android ; AnimatedVisibility + animateFloatAsState pour le voile ; pas d'équivalent iOS 18 requis.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryGroupIntroOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryGroupIntroPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryAuthorIdentityCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+GroupIntro.swift`

</details>

### Poser une pastille de lieu sur une slide et la voir apparaître et disparaître comme les autres éléments

`srp-model-location-pastille` · Android : **absente** · P1 · effort M

StoryLocationObject est la pastille de lieu d'une slide (SharedPlace) avec les mêmes transformations et la même fenêtre de temps qu'un texte : position, échelle, rotation, z-order, ancre, startTime, duration et fondus. Elle apparaît et disparaît quand l'auteur le veut (directive 2026-08-31), à ne pas confondre avec la localisation du POST. Elle fait partie de StoryEffects.locationObjects (stockage unique, car seul effects_json est persisté) et compte comme matière publiable.

Écarts :
- La famille place est absente du modèle Android (le commentaire de CanvasV3Projection l'indique) : une pastille de lieu d'une story iOS est ignorée au rendu et perdue au réencodage.
- Ajouter StoryLocationObject (id, place SharedPlace, x, y, scale, rotation, zIndex, anchor, startTime, duration, fadeIn, fadeOut) dans StoryEffects.locationObjects, avec décodeur tolérant (champs de temps optionnels).
- Projection CanvasV3 : kind place vers locationObjects et retour. Rendu de la pastille (réutiliser FeedPostLocationSticker, gabarit location.pill par défaut) avec fenêtre de temps et fondus.
- Compter la pastille dans la règle de matière publiable (voir srp-publish-format-extras) ; édition dans le composer (hors part).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryLocationObject.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Location.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### Poser des stickers décorés (lieu, heure, météo, humeur, météo…) dont le contenu est figé à la pose

`srp-model-sticker-templates` · Android : **absente** · P1 · effort L

Un gabarit est un cadre plus des emplacements, du modèle pur sans UI ni chaîne localisée. StickerTemplateCatalog livre environ 200 gabarits répartis en 21 familles (lieu, heure, amour, météo, texte, joie, surprise, humeur, salutation, réaction, fête, disponibilité, nature, encouragement, réponse, nourriture, sport, voyage, travail, musique…). Chaque gabarit porte un repli emoji pour un lecteur qui ne sait pas le dessiner, une échelle de pose propre (distincte de l'échelle 2,2 d'un emoji nu) et un mouvement par défaut. Un id inconnu rend nil, jamais un plantage. StickerSlotFiller remplit les emplacements avec une donnée FIGÉE à la pose : l'instant est un PARAMÈTRE jamais lu depuis l'horloge (heure, date, lieu), donc tout lecteur voit ce que l'auteur a composé. Les légendes des gabarits météo, disponibilité et réponse sont dessinées dans la langue du LECTEUR.

Écarts :
- Aucun gabarit : StickerCatalog Android ne contient que des emojis par 8 catégories. Une story iOS avec un sticker décoré s'affiche en repli emoji nu (StorySticker n'a ni templateId ni slots).
- Porter StickerTemplate (id, family, slots, fallbackEmoji, posedScale, animation), StickerTemplateFamily (21), StickerTemplateSlot (nature valeur / etc.) et les ~200 définitions du catalogue (ids stables du fil, par exemple location.pill, time.digital, love.heartFrame), en tant que constantes de binaire. Un id inconnu rend null.
- StickerSlotFiller.timeSlots / dateSlots / placeSlots(SharedPlace) : l'instant est un paramètre, jamais lu de l'horloge ; deux chiffres, chaînes non vides ; test de gel (deux instants donnent deux résultats).
- Rendu des gabarits (StickerTemplateRenderer côté MeeshyUI iOS : cadre, emplacements, cache) : hors de cette part mais requis pour que le catalogue serve ; légendes localisées dans la langue du LECTEUR (météo, disponibilité, réponse) ; palette de sélection par famille dans le composer.
- Chaînes de libellés par gabarit en fr/en/es/pt dans les ressources UI (le modèle reste sans texte).

Rendu : Un gabarit se pose à son posedScale propre (pas 2,2) et mesure son contenu ; il porte déjà du texte et une mise en page. Familles rangées en palette ; mouvement par défaut selon le sens (un oui JAILLIT (pop), un non SECOUE (shake), un peut-être HÉSITE (wobble), une question REBONDIT (bounce)). Une décoration tranchée (OK, Jamais, l'urne) reste immobile.

<details><summary>Sources iOS (23)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplate.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerSlotFiller.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Answer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Availability.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Cheer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Food.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Greeting.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Joy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+LocationMore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+LoveExtra.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Mood.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Music.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Nature.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Party.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Reaction.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Sport.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Surprise.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Text.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+TimeExtra.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Travel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Weather.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerTemplateCatalog+Work.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`

### Ouvrir une humeur reçue sur une page plein écran avec l'auteur, son texte et un champ de réponse

`srp-mood-spotlight-page` · Android : **absente** · P1 · effort M

Depuis la notification « nouvelle humeur », la page affiche la bannière de l'auteur en fond total voilé (ou un dégradé de sa couleur), son avatar 112 pt avec contour équipé et médaillon emoji, son nom, l'ancienneté, le texte de l'humeur sur une carte de verre, la pluie d'emoji et une barre de réponse privée. Elle lit d'abord les caches statuts (statuses_friends puis statuses_discover) et profils, puis revalide en silence par le réseau. Une humeur expirée ou introuvable devient « Cette humeur n'est plus disponible ». La vue est enregistrée une seule fois (surface detail), sauf pour l'auteur.

Écarts :
- Créer MoodSpotlightScreen et sa route (id de status), puis brancher NotificationDestinationResolver : une notification de nouvelle humeur ouvre aujourd'hui un profil (status_update) ou le détail d'un post, jamais cette page.
- MoodSpotlightViewModel avec Content (loading, mood, unavailable) et ReplyState (idle, sending, sent, failed). Lecture cache-first des statuts friends/discover, puis GET /posts/:id. Une humeur dont expiresAt est passé est refusée même si elle est en cache.
- Charger le profil de l'auteur (cache profils, puis GET /users/:id avec écriture au cache) pour la bannière, l'avatar et les décors profileDecor.avatarRing / banner (ServedProfileDecorItem). Une bannière de design n'est peinte que si l'auteur n'a pas de photo.
- Enregistrer la vue une seule fois (événement social view, surface detail), jamais pour sa propre humeur. canReply est faux pour sa propre humeur : la barre de réponse disparaît.
- États : squelette de chargement (cercle blanc 18 % avec shimmer) et état indisponible (🌙 plus libellé centré). Barre de réponse au-dessus du clavier (imePadding), tap hors champ pour fermer le clavier, bouton fermer 44 dp en verre.
- Toasts « Réponse envoyée » / « La réponse n'est pas partie » avec haptique succès/erreur. La réponse est optimiste : le champ se vide à l'envoi et retrouve son texte en cas d'échec.
- Chaînes mood.spotlight.* (placeholder « Répondre à X… », fermer, envoyer la réponse, chargement, indisponible) en fr/en/es/pt. Carte regroupée en un seul élément TalkBack.

Rendu : Thème sombre forcé. Fond : bannière en plein cadre, dégradé noir 50 %, 35 %, 70 % de haut en bas, repli dégradé couleur d'avatar vers indigo950. Avatar 112 dp, bordure blanche 3 dp, ombre colorée (avatarColor 60 %, rayon 24). Médaillon emoji 34 sp sur verre ultraThin, décalé de (8, 8) en bas à droite. Nom en titre3 gras blanc, temps en footnote blanc 75 %. Texte en titre2 arrondi semibold dans une carte de verre rayon 26, contour dégradé (avatarColor vers blanc 50 %) de 1,5 dp, ombre noire 25 %. Barre de réponse : champ de verre 1 à 4 lignes, bouton rond 44 dp en dégradé de marque, opacité 0,4 si désactivé.

Transposition Android : fullScreenCover iOS devient un écran Compose en route de navigation plein écran, ouvert par la notification (LaunchRouter / NotificationDestination.Mood). PanelBackAction iPad devient le retour de la pile de navigation, ou le panneau détail sur tablette.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MoodSpotlight/MoodSpotlightView.swift`
- `apps/ios/Meeshy/Features/Main/Views/MoodSpotlight/MoodSpotlightCard.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/MoodSpotlightViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Services/MoodSpotlight/MoodSpotlightSource.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarPresentation.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationMoodStatus.kt`

### Toucher une notification de story et tomber sur la story, ou sur un écran clair si elle a expiré ou que le réseau manque

`srp-notif-target-screen` · Android : **absente** · P1 · effort M

L'écran cible d'une notification de story applique le motif cache-first : lecture du cache mémoire (plus le post préchargé par la NSE), publication immédiate d'un état, puis revalidation réseau (le résultat frais l'emporte). Cinq issues : loading ; active (la story est lisible, ou expirée avec un droit de référence ACCORDÉ, que le serveur déclare via APIPost.referenceAccess, jamais recalculé) ; expired (404 / 403, ou expiresAt passé sans droit) ; expiredConsumed (droit consommé, fenêtre de 24 h close) ; offline (requête jamais partie, retryable) ; serverFailed (5xx, jamais formulé comme un problème de connexion). Une réponse déjà détenue n'est pas écrasée par un échec de revalidation. L'écran expiré se peint sur un fond aléatoire de la palette avec avatar de l'acteur, emoji ou bulle de commentaire, extrait « … », titre, sous-titre, bouton « Créer une story » (ouvre le composer) et lien retour.

Écarts :
- Aucun écran cible : NotificationDestinationResolver envoie vers Story(userId) (seulement friend_new_story, ouvre le tray de l'auteur) ou Post(postId). Une story expirée ou supprimée ouvre un écran vide ou une erreur générique.
- StoryNotificationTargetViewModel avec LoadState (Loading, Active(post), Expired, ExpiredConsumed, Offline, ServerFailed) et classification des échecs (notFound / forbidden = expiré, réseau = hors ligne, 5xx = serveur) ; garder une réponse déjà obtenue lors d'un échec de revalidation.
- Droit de référence : lire ApiPost.referenceAccess (accordé / consommé / aucun), ne jamais le déduire de expiresAt.
- Contexte de notification (acteur, avatar, déclencheur réaction(emoji) ou commentaire(aperçu), date) construit depuis ApiNotification (storyReaction, statusReaction, commentPreview).
- Écrans : chargement (voile noir 60 %, spinner, « Chargement… »), hors ligne / serveur (symbole, titre, message, bouton « Réessayer », lien retour), expiré (fond aléatoire de StoryBackgroundPalette, encre lisible calculée, CTA « Créer une story » qui ouvre le composer, lien retour). i18n notifications.story.expired.*.
- Consommer le post préchargé par le gestionnaire FCM data-message (équivalent NSEPendingPostConsumer) avant la lecture cache.

Rendu : Écran expiré plein cadre sur couleur aléatoire de la palette de fond de story, texte en encre lisible (readableInk) ; entête acteur avatar 32 + nom en headline + temps relatif ; emoji héros 64 ou bulle 56 ; extrait de commentaire en italique centré (3 lignes max) ; CTA arrondi plein de la couleur d'encre ; lien retour souligné.

Transposition Android : NSEPendingPostConsumer (Notification Service Extension) devient le handler FCM data-message qui dépose le post dans le cache Room avant l'ouverture.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetScreen.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationTargetViewModel.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationLoadingView.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationOfflineContent.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`

### Modifier une story déjà publiée, avec un message clair quand on est hors ligne

`srp-publish-edit-published` · Android : **absente** · P1 · effort M

Depuis « Mes stories », le composer se rouvre sur une story publiée : contenu, storyEffects et médias sont mis à jour (nouveaux médias envoyés, médias existants réutilisés par leur postMediaId, images de stickers rapatriées). L'édition exige la connexion : hors ligne, le toast dit « Connexion requise pour modifier la story ». Au succès, « Story mise à jour ». À l'échec, « Échec de la mise à jour de la story » et le brouillon retient le message. L'édition d'un contenu fait effacer au serveur vues et réactions (contentEditedAt), et le tray rallume l'anneau pour les lecteurs.

Écarts :
- Aucune édition d'une story publiée : UpdatePostRequest ne porte que content, visibility et moodEmoji, sans storyEffects ni médias. Ajouter PATCH /posts/:id avec storyEffects et mediaIds.
- Rouvrir le composer depuis un StoryItem (reconstruction du deck depuis storyEffects, y compris les objets texte traduits et les médias déjà téléversés) et un StoryEditContext pour diffuser les différences.
- Upload différentiel : seuls les médias sans postMediaId sont envoyés ; réutiliser les ids existants ; rapatrier les images de stickers.
- Garde hors ligne avec toast « Connexion requise pour modifier la story » ; toasts succès et échec ; brouillon marqué en erreur sur échec.
- Gérer le reset d'engagement (contentEditedAt) dans la fusion du tray (voir srp-tray-viewed-ledger).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Un post qui republie une story montre la scène lue en sourdine dans le fil

`srp-repost-embed-scene` · Android : **absente** · P1 · effort M

StoryRepostEmbedCell : quand FeedPost.type == POST et repost.type == STORY, la carte de fil ne rend que la scène de la story d'origine (StoryReaderRepresentable en lecture seule, muette), en 9:16 (SceneShape.aspect) à coins arrondis, largeur plafonnée à 420 pt et centrée sur iPad. Le texte du post (traduit par le Prisme) et l'attribution de republication (« a republié de @handle ») sont déjà rendus par la carte parente : l'embed ne les duplique pas. La lecture obéit au viewport (isActive élu par ReelFeedAutoplayCoordinator ; faux par défaut = scène en pause) comme les vidéos ; le cadre est rapporté à l'élection (reportReelFrame) ; VoiceOver lit « Story de <auteur> » avec l'astuce « Appuyez deux fois pour ouvrir en plein écran ».

Écarts :
- RepostEmbedCell Android rend une cellule de citation (libellé feed_repost_story) ; son en-tête dit explicitement que l'embed du canvas de story est hors périmètre faute de renderer : monter la scène de story en lecture seule et muette.
- Lecture liée au viewport : élection par le coordinateur d'autoplay du fil (une seule scène/vidéo active), pause par défaut, cadre rapporté ; jamais toutes les scènes republiées décodant en même temps.
- Forme : 9:16, coins MeeshyRadius.lg, largeur max 420dp centrée sur tablette ; pas de duplication du texte ni de l'attribution du post parent.
- Accessibilité : « Story de <auteur> » + astuce d'ouverture plein écran ; tap ouvre le lecteur sur la story d'origine.

Rendu : Scène 9:16 seule dans la carte, coins arrondis lg, centrée, plafond 420dp, aucune barre ni chrome.

Transposition Android : StoryReaderRepresentable -> même composable de scène que le lecteur, configuré mute=true, isPaused=!isActive ; ReelFeedAutoplayCoordinator -> coordinateur d'autoplay du feed.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedCell.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedPresentation.kt`

### Les stories expirées ou vides sont sautées au lieu d'afficher un écran noir

`srp-skip-unplayable-stories` · Android : **absente** · P1 · effort S

StoryPlaybackSkipResolver décide où atterrit la lecture quand la position pointe une story illisible : expirée (le TTL du cache dépasse la fenêtre de 24 h) ou vide (media vide, textObjects vide, content nul : huit écrans noirs d'affilée constatés). Il avance dans le groupe, sinon saute au prochain groupe qui a vraiment du contenu, et ne ferme qu'une fois la liste épuisée (on n'éjecte plus de toute la session parce qu'un auteur vient d'expirer). StoryContentPresence est volontairement conservateur : le moindre champ porteur (texte non blanc, média, audio, audio de fond, repost, objets média / audio / sticker, tracés, variantes audio) rend la story affichable ; une story purement sonore reste un message.

Écarts :
- Le lecteur Android n'ignore jamais une slide expirée ni vide (seul StoryTrayBuilder retire les groupes entièrement expirés) : porter StoryPlaybackSkipResolver (stay / advanceStory / advanceGroup / close) avec now injectable et userId courant.
- Porter StoryContentPresence.hasRenderableContent (texte non blanc, médias, audioUrl, backgroundAudio, repostOfId, background significatif, textObjects non vides, mediaObjects, audioPlayerObjects, stickerObjects, stickers, drawingStrokes, drawingData, backgroundAudioId, variantes) : conservateur, un faux positif coûte moins qu'une story perdue.
- Appliquer le saut à l'ouverture, à chaque changement de story / groupe et après une réconciliation temps réel ; ne fermer le lecteur qu'à épuisement.
- Les stories expirées de l'auteur lui-même (archive) restent hors lecteur sauf cible explicite.

Rendu : Aucun visuel : le saut est invisible ; jamais d'écran noir de six secondes.

Transposition Android : Fonctions pures Kotlin (testables JVM), injection de l'horloge via CacheClock existant.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryPlaybackSkipResolver.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryContentPresence.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`

### Chaque story apparaît avec la transition choisie par son auteur (fondu, zoom, glissement, révélation)

`srp-slide-open-close-transitions` · Android : **absente** · P1 · effort M

crossFadeStory réalise un vrai fondu enchaîné au sein d'un groupe : la story sortante reste visible (calque outgoing) pendant que l'entrante apparaît, sans rechargement d'image. StoryOpeningEntrance dérive l'état de départ des quatre pilotes d'apparition depuis la transition d'ouverture (zoom : 1,08 vers 1 en ressort 0,75 ; slide : 8 % de la largeur en ressort 0,82 ; reveal : masque circulaire RevealCircleShape en easeOut ; fade : 0,35 s avec micro-décalage vertical 14 pt) et une transition de fermeture zoom sur la story sortante ; la même table sert à l'apparition après l'interlude d'identité. Un verrou isTransitioning évite les animations qui se chevauchent et l'horloge repart à la fin.

Écarts :
- Le changement de story est un échange sec : implémenter le calque sortant et le fondu enchaîné (0,35 s) avec verrou de transition.
- Table d'entrée par effet (StoryOpeningEntrance.armed) : zoom (échelle de départ StoryRenderer.zoomTransitionScale 1,08), slide (translation horizontale = slideTransitionTravelFraction de la largeur), reveal (clip circulaire croissant), fade (+14 pt vertical) ; durées partagées avec le SDK (slideTransitionDuration).
- Transition de fermeture zoom de la story sortante (closingScale) ; le décodage tolérant des transitions existe déjà (StoryTransitionTolerantSerializer) mais n'est pas appliqué au changement de story.
- Réutiliser la même table pour la révélation après l'interlude d'identité et après un commit de cube ; markCurrentViewed au changement de story.
- Le texte parallaxe (textSlideOffset) et l'horloge qui repart à la fin de la transition.

Rendu : Zoom qui dézoome (1,08 vers 1), slide horizontal de 8 % de la largeur, reveal en cercle qui s'ouvre depuis le centre, fade avec léger glissement vertical de 14 pt ; le contenu sortant reste figé et s'efface.

Transposition Android : withAnimation -> Animatable + spring/tween ; clipShape(RevealCircleShape) -> drawWithContent + clipPath circulaire ; deux calques superposés dans un Box.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryOpeningEntrance.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`

### Les stickers image d'une story sont téléversés et rattachés à la publication

`srp-sticker-image-upload` · Android : **absente** · P1 · effort S

StoryStickerUpload : l'image d'un sticker importé est INTÉGRÉE à l'entité publiée (StorySticker.postMediaId) et part par le chemin commun TUS -> PostMedia -> postMediaId ; pendingUploadIds liste, dans l'ordre des stickers, ceux dont le postMediaId est vide et dont le bitmap est disponible (un sticker emoji n'a rien à envoyer, un postMediaId déjà rempli vient d'un upload précédent d'une édition : le renvoyer créerait un PostMedia orphelin) ; applying reporte les postMediaId attribués sur les stickers sans jamais retirer un sticker dont l'envoi a échoué (il reste affichable par son emoji de repli, wireEmoji) ; attachedPostMediaIds liste les médias encore référencés, pour que le PUT d'édition ne supprime pas l'image de chaque sticker conservé.

Écarts :
- Le modèle Android déclare StorySticker.postMediaId / hasImage mais le composeur ne gère que des stickers emoji : implémenter l'import d'un sticker image, son upload par le pipeline de médias (TUS) et la pose du postMediaId.
- Fonctions pures pendingUploadIds / applying / attachedPostMediaIds ; un sticker dont l'envoi a échoué reste affiché par son emoji de repli.
- Édition d'une story publiée : inclure attachedPostMediaIds dans l'ensemble conservé du PUT pour ne pas supprimer côté serveur l'image des stickers.
- Rendu des stickers image dans le lecteur (voir srp-canvas-scene-card).

Rendu : Le sticker image remplace l'emoji dès que son média est rattaché ; repli emoji en cas d'échec.

Transposition Android : Fonctions pures ; transfert TUS via StoryMediaUploader / UPLOAD_MEDIA dans l'Outbox existant.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryStickerUpload.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Voir une carte d'identité de l'auteur (nom, @pseudo, bannière, humeur) en changeant de groupe de stories

`srp-group-intro-interstitial` · Android : **absente** · P2 · effort M

Au passage vers le groupe d'une autre personne, un interstitiel présente l'auteur. Les données sont résolues cache-first : profil depuis le cache profils (fresh et stale servis tels quels), fetch réseau seulement si le cache n'a ni nom ni bannière (puis mis en cache), humeur de l'auteur en best-effort depuis le feed statuts de session, présence depuis le snapshot servi avec la story. La résolution ne lève jamais d'erreur : au pire la carte montre le nom et l'avatar du groupe. Le placeholder initial porte StoryGroup.username (qui est en fait le nom d'affichage) puis applyIntroProfile écrase avec le vrai @handle ; displayName explicite sinon « Prénom Nom ».

Écarts :
- Aucune carte d'introduction de groupe dans le lecteur Android : le passage d'un auteur à l'autre est direct.
- StoryGroupIntro (id, nom, @handle, bannière, contour, humeur, présence) et StoryGroupIntroPolicy côté lecteur (quand l'afficher). resolveGroupIntro(group) cache-first sans lever d'exception, avec écriture du profil au cache après fetch.
- Mapping pur profil vers intro (applyIntroProfile) : displayName, sinon « Prénom Nom », sinon vide (la vue retombe sur le username).
- Récupérer l'humeur de l'auteur depuis le cache statuts de session (StatusRepository / StatusBarCache) et le contour équipé (authorRing) ajouté à StoryGroup.

Rendu : Carte plein cadre brève entre deux groupes : avatar, nom, @handle, bannière en fond voilé, pastille d'humeur. Elle se ferme d'elle-même en environ 1 s.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModelRules.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Viewing.swift`

</details>

### Toucher une pastille de lieu d'une story ouvre la carte en plein écran

`srp-location-pin-tap` · Android : **absente** · P2 · effort S

Le canvas du lecteur est du pur calque sans callback d'item, et la couche de gestes transforme tout tap en navigation : une pastille touchée faisait avancer la story. StoryLocationReaderTapOverlay pose des cibles invisibles (au moins 44 pt de côté) au-dessus de la couche de gestes, calées sur le cadre exact du badge dessiné (StoryLocationLayer.badgeFrame) avec le même cadrage que le canvas. Le tap déclenche une haptique légère, met la lecture en pause et ouvre le lieu en plein écran (fullScreenCover avec StoryReaderPlaceWrapper), identité = paire de coordonnées. Masqué pendant la saisie (storyFocusFade).

Écarts :
- Rendre les locationObjects de la scène (pastille) puis poser des cibles tactiles de 48dp calées sur le badge, au-dessus de la couche de gestes de navigation.
- Au tap : haptique, pause de l'horloge, ouverture du lieu en plein écran (carte in-app ou intent geo:), reprise à la fermeture.
- Libellé d'accessibilité et astuce story.location.open.hint ; s'efface pendant la saisie d'un commentaire.

Rendu : Cible invisible, taille minimale 44 pt, alignée au pixel sur le badge ; aucune décoration ajoutée.

Transposition Android : MapKit plein écran -> Intent ACTION_VIEW geo: ou carte Compose existante (feature location) ; cibles invisibles -> Box clickable avec minimumInteractiveComponentSize.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryLocationReaderTapOverlay.swift`

</details>

### Poser un nouvel objet sans qu'il en recouvre un autre, et le faire entrer dans la timeline là où l'on regarde

`srp-model-object-placement-entry` · Android : **absente** · P2 · effort S

StoryObjectPlacement décide du POINT DE DÉPART d'un objet neuf (texte, média, son, sticker) : le centre, sauf s'il est déjà pris, auquel cas une cascade en diagonale de pas 0,06 (borne de 12 rangs, retour sur l'autre diagonale au bord, marge) évite la superposition au pixel près. L'auteur pose ensuite où il veut. SceneEntryWindow règle l'ENTRÉE d'un objet posé sur une scène animée : à la tête de lecture et jusqu'à la fin, sans dépasser 80 % de la durée (un objet qui n'apparaît qu'à la dernière image serait posé sans être vu). Elle s'applique à toute famille sauf le fond.

Écarts :
- Le composer Android ajoute un texte ou un sticker à la position par défaut (centre) sans regarder ce qui s'y trouve : deux objets se superposent exactement.
- StoryObjectPlacement.next(avoiding occupied) : centre 0,5 ; 0,5, pas 0,06, tolérance step/2, 12 rangs maximum, marge, retour sur la diagonale opposée au bord ; premier objet sur scène vide reste au centre.
- SceneEntryWindow.forNewObject(playhead, ...) : fenêtre d'entrée à la tête de lecture, entrée ≤ 80 % de la durée ; poser la fenêtre d'un objet quelle que soit sa famille (rend false pour un id inconnu ou un fond).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryObjectPlacement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryEffects+EntryWindow.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Traiter une scène qui bouge comme une vidéo, avec un seul bouton lecture / pause pour tout

`srp-model-scene-motion` · Android : **absente** · P2 · effort S

SceneMotion répond une fois, hors de toute vue, à « cette scène bouge-t-elle ? » (directive 2026-09-06 : une scène cinématique doit être considérée comme une vidéo). Cinq témoins indépendants : une vidéo, un son, une décoration animée, un objet qui apparaît ou disparaît dans le temps, une transition (ouverture, fermeture, transitions de clips). C'est le mouvement qui compte, jamais la durée (timelineDuration mesure un temps de séjour que le composer stampe sur des slides fixes). isAudible dit s'il y a quelque chose à FAIRE ENTENDRE (distinct : une vidéo muette bouge sans rien dire, un son de fond s'entend sans rien montrer). Elle décide de l'élection d'autoplay du fil (un canvas de texte ne confisque plus l'unique place jouante à la vidéo voisine), du bouton lecture (jamais posé sur une image fixe) et de l'indicateur haut-parleur barré.

Écarts :
- Aucune règle isCinematic / isAudible côté Android : un canvas fixe peut aujourd'hui concourir à l'autoplay d'un fil ou recevoir un contrôle de lecture inerte.
- Porter isCinematic(scene), isCinematic(document) (document.sound compte), isAudible(document), objectSounds, objectMoves, isVideo et hasTimeWindow, sur le modèle CanvasV3 Android (kinds media, sticker animé, fenêtres).
- Brancher l'élection d'autoplay du fil, le bouton lecture / pause global et l'indicateur « son coupé par le fil » sur cette seule règle.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SceneMotion.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`

### Annuler et rétablir chaque geste de montage de la timeline (couper, déplacer, rogner, fondus, keyframes, transitions)

`srp-model-timeline-commands` · Android : **absente** · P2 · effort M

Le montage suit le patron Command : TimelineProject est un instantané Codable de la slide (aller-retour garanti, apply est un no-op sur une slide inchangée), et chaque EditCommand sait apply et revert sur ce projet. Les commandes couvrent AddClip, DeleteClip, MoveClip, SplitClip, TrimClip pour cinq familles de clips (vidéo / image, audio, texte, sticker, lieu), SetClipProperty (volume, fondu entrant et sortant, boucle, fond, verrou, ducking désactivé, nom, transformation), Add/Move/DeleteKeyframe (position, échelle, opacité, volume) avec temps et valeurs anciennes mémorisés, Add/Change/RemoveTransition (crossfade, dissolve entre deux clips contigus) et SetSlideDuration (durée d'auteur, mémorisée en plus de l'ancienne). Erreurs typées : clip, transition ou keyframe introuvable, état invalide.

Écarts :
- Aucun éditeur de timeline ni pile annuler / rétablir sur le montage : seul le dessin a un undo (StoryDrawingBoard). Les gestes du composer (StorySlideDeck) sont des transformations immuables directes.
- Porter TimelineProject (instantané de slide : clips vidéo, image, audio, texte, sticker, lieu, keyframes, transitions, durée) et le protocole EditCommand (apply / revert / Codable) avec ses erreurs typées (clipNotFound, transitionNotFound, keyframeNotFound, invalidState).
- Porter les 12 commandes avec leur symétrie apply / revert : cinq familles de clips pour Add, Delete, Move, Split, Trim ; SetClipProperty (volume, fadeIn, fadeOut, loop, isBackground, isLocked, isDuckingDisabled, name, transform) ; Add, Move, Delete Keyframe ; Add, Change, Remove Transition ; SetSlideDuration avec la durée d'auteur d'avant.
- Pile d'historique (undo / redo) dans le ViewModel du composer, bornée, et sérialisation Codable pour les tests de relecture.

<details><summary>Sources iOS (12)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryTimelineProject.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/AddClipCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/DeleteClipCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/MoveClipCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/SplitClipCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/TrimClipCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/SetClipPropertyCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/KeyframeEditCommands.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/SetSlideDurationCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/AddTransitionCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/ChangeTransitionCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/RemoveTransitionCommand.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`

### Voir l'emoji de l'humeur peupler la page en pluie douce qui grossit puis s'efface

`srp-mood-emoji-rain` · Android : **absente** · P2 · effort S

L'emoji de l'humeur naît petit à une position aléatoire, grossit en oscillant, monte légèrement et devient transparent jusqu'à la moitié de la largeur d'écran, où la particule est détruite. Maximum 12 particules, une naissance toutes les 0,4 s, durée de vie 3 à 4,6 s. Toute la pluie est dessinée dans un seul Canvas cadencé (jamais une vue par particule), et le moteur est pur (position dérivée de l'horloge). L'horloge s'arrête et le moteur se vide quand la page disparaît. Avec « Réduire les animations », il n'y a pas de pluie : l'emoji reste posé.

Écarts :
- Porter le moteur pur (MoodEmojiRainState.advanced, progress, size, opacity, frame, makeParticle) avec un générateur aléatoire injectable pour les tests. Constantes : maxParticles 12, spawnInterval 0,4 s, lifetime 3,0 à 4,6 s, birthSize 22, vanishing 50 % de la largeur, sway sin(phase + t·2π·0,55)·amplitude·largeur, rise 8 % de la hauteur.
- Composable MoodEmojiRain : un Canvas Compose cadencé par withFrameNanos / rememberInfiniteTransition, glyphe résolu une fois (TextMeasurer ou bitmap emoji) et dessiné à l'échelle de chaque particule avec alpha. Arrêt et reset au onDispose.
- Respecter la préférence « supprimer les animations » (Settings.Global.ANIMATOR_DURATION_SCALE == 0) : aucune pluie, emoji statique. Marquer le calque non interactif et masqué à TalkBack.

Rendu : Glyphe de référence 96 pt réduit à 22 pt à la naissance. Opacité 1 à la naissance, 0 à la moitié de la largeur. Calque sous le contenu, au-dessus de la bannière. Particules réparties dans 8 à 92 % de la surface.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MoodSpotlight/MoodEmojiRain.swift`
- `apps/ios/Meeshy/Features/Main/Views/MoodSpotlight/MoodEmojiRainView.swift`

</details>

### La scène du fil grandit jusqu'au plein écran sans accroc et y revient à la fermeture

`srp-scene-zoom-transition` · Android : **absente** · P2 · effort S

SceneZoomTransition : la carte de scène d'un post du fil est la source d'une transition zoom partagée (id préfixé post-scene:<postId>, namespace partagé avec le plateau de stories dont les sources sont des identifiants de groupe) et la galerie plein écran en est la destination, uniquement quand elle s'ouvre SUR la scène (un média ouvert depuis le carrousel n'a pas de source, la présentation habituelle s'applique). La position se lègue par ScenePlaybackPositions et le player porteur est partagé (SharedCarrierPlayerProvider) : la scène reprend là où la carte en était. iOS 18+ seulement ; iOS 16-17 retombe sur la montée système sans transition maison.

Écarts :
- Transition d'élément partagé carte du fil -> galerie plein écran (et retour) pour la scène d'un post, avec l'identité post-scene:<postId> ; même mécanisme pour l'anneau du plateau -> lecteur.
- Ne zoomer que si la galerie s'ouvre sur la scène (pas pour un média du carrousel) ; repli sur la présentation standard sinon ; geste de fermeture interactif (retour prédictif).
- Léguer la position de lecture et partager le player porteur pour une lecture ininterrompue entre la carte et le plein écran.

Rendu : L'écran grandit depuis le cadre touché, la même scène reste identifiable de bout en bout.

Transposition Android : zoomTransitionSource/Destination (iOS 18) -> SharedTransitionLayout + sharedBounds (Compose 1.7+) avec repli AnimatedContent ; fermeture interactive -> predictive back.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SceneZoomTransition.swift`

</details>

### Une story composée avec un format plus récent le dit au lieu de s'afficher amputée

`srp-sentinel-newer-format` · Android : **absente** · P2 · effort S

Quand une story contient un kind d'objet inconnu (ObjectKind.reserved), le lecteur remplace la scène par StorySentinelView plutôt que de peindre ce qui reste sans un mot : d'abord ce qui manque (cette story utilise un format plus récent), puis ce qui est intact (elle s'affichera comme son auteur l'a composée après la mise à jour), puis le seul geste utile avec deux boutons METTRE À JOUR et PASSER À LA SUIVANTE. Les kinds inconnus ne sont jamais nommés. Les barres de progression, l'avatar et la fermeture restent montés par l'hôte ; la sentinelle est branchée dans la carte sous la condition currentStoryIsUnpaintable.

Écarts :
- Détecter une slide non peignable (kinds réservés / inconnus conservés par le décodeur) et exposer currentStoryIsUnpaintable dans StorySlideView.
- Écran sentinelle : titre, corps rassurant, bouton principal METTRE À JOUR (ouvre la fiche Play Store de l'app, intent market://) et bouton secondaire PASSER À LA SUIVANTE (avance dans le lecteur) ; chaînes story.sentinel.title / body / update / skip dans les 4 locales.
- Ne jamais afficher une scène amputée comme si elle était la composition de l'auteur ; les barres de progression et la fermeture restent actives.
- Mettre l'horloge en pause tant que la sentinelle est affichée ou la laisser avancer selon la même règle que les autres écrans couverts.

Rendu : Ordre porteur de sens : perte, réassurance, geste. Majuscules sur les deux boutons (METTRE À JOUR en accent, PASSER À LA SUIVANTE en secondaire) ; fond sombre jamais noir pur ni fond par défaut.

Transposition Android : Ouverture de la mise à jour -> Intent ACTION_VIEW market://details?id=... avec repli https Play Store ; (App Store iOS).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StorySentinelView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sentinel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Enregistrer un sticker reçu dans « Mes stickers » depuis une story

`srp-sticker-library-save` · Android : **absente** · P2 · effort M

StoryStickerLibrary.savable(in:) liste les stickers IMAGE d'une story reçue qu'on peut copier dans la bibliothèque personnelle, dans leur ordre de composition, dédoublonnés par postMediaId (la bibliothèque garde des images, pas des occurrences). L'octet se lit sur le PostMedia du post lui-même (aucune URL tierce n'entre) ; l'identifiant de bibliothèque est dérivé (préfixe received- + postMediaId), stable d'un enregistrement à l'autre pour reconnaître un sticker déjà gardé, et refusé s'il contient un caractère qui ne peut pas servir de nom de fichier (l'id vient du serveur et est concaténé au dossier racine). Vide = le geste est absent. L'app garde le téléchargement, l'écriture disque et le retour utilisateur.

Écarts :
- Bibliothèque de stickers personnels (StickerLibraryStore) à porter : stockage fichier, listage, suppression ; entrée « Enregistrer dans mes stickers » sur un sticker image d'une story reçue (appui long sur le sticker ou menu).
- Règle pure savable(in:) : stickers image uniquement, ordre de composition, un par postMediaId, URL prise sur le PostMedia du post ; geste absent si la liste est vide.
- Identifiant de bibliothèque received-<postMediaId> restreint aux caractères alphanumériques, tiret et underscore (sinon null) pour éviter l'écriture hors du dossier.
- Retour utilisateur (déjà enregistré / enregistré) et reconnaissance d'un sticker déjà gardé.

Rendu : Action discrète dans un menu contextuel, toast de confirmation.

Transposition Android : Stockage dans filesDir/stickers/ ; sélection d'un sticker dans le canvas -> pointerInput + menu contextuel.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryStickerLibrary.swift`

</details>

### Le texte alternatif des médias d'une story est enregistré sous le bon média serveur

`srp-story-media-alt-text` · Android : **absente** · P2 · effort S

StoryMediaTextMapping.serverKeyed re-clé un texte (alt du média, légende) de l'espace d'ids du composeur (StoryMediaObject.id) vers celui du serveur (PostMedia.id, renseigné à l'upload dans postMediaId), car CreatePostSchema.mediaAlt n'accepte que des ids de mediaIds et PostService.applyMediaAlt filtre silencieusement les autres : envoyer les ids du composeur produisait une requête acceptée et un texte alternatif jamais enregistré. Un objet dont l'upload a échoué (postMediaId vide) est omis, un texte vide aussi. Le nom historique StoryMediaAltMapping reste en alias.

Écarts :
- Le composeur Android n'a pas de panneau de texte alternatif par média ni de champ mediaAlt à la publication : ajouter la collecte sous l'id du StoryMediaObject et la fonction serverKeyed(composerKeyed, mediaObjects) appliquée après upload.
- Omettre les objets sans postMediaId (upload échoué) et les textes vides ; même site pour la légende de média.
- Exposer le texte alternatif à TalkBack dans le lecteur (contentDescription des médias).

Rendu : Champ « texte alternatif » dans le panneau d'accessibilité du composeur ; rien dans le lecteur hors lecteur d'écran.

Transposition Android : Fonction pure Kotlin ; contentDescription des composables média.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryMediaAltMapping.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Voir dans le rail la vraie vignette de la story, avec son texte, ses dessins et ses stickers

`srp-tray-covers` · Android : **absente** · P2 · effort M

La vignette de tray serveur est construite depuis le média brut et ne peut jamais contenir le texte ni le dessin (ils vivent en JSON d'effets). À l'envoi, la slide COMPLÈTE est donc rendue (fond y compris image vidéo, texte, dessin, médias, stickers, filtre) et mise en cache localement sous l'id de la story publiée : le tray préfère cette couverture locale pour les stories de l'auteur. Côté récepteur, le tray rend à la volée la dernière story de chaque groupe depuis ses effets (un fond image est chargé, un fond vidéo n'a pas de plan et garde la chaîne de repli), sans upload, le texte restant retraductible par lecteur. Ordre de préférence : composite local, vignette serveur, média image brut (jamais une vidéo), avatar de l'auteur. Un signal de génération rafraîchit les cellules quand une couverture est rendue.

Écarts :
- Le tray Android affiche l'avatar de l'auteur (56 dp) avec son anneau, jamais une vignette de la story. Définir la cellule de tray cible selon l'iOS (StoryTrayView+RingCell, part 1) et ajouter la résolution de couverture.
- Composite de slide rendu hors écran (équivalent StorySlideRenderer.renderComposite) : fond, texte, dessin, médias, stickers, filtre ; cache disque sous la clé StoryCoverCacheKey de l'id de story publiée.
- Plan de rendu récepteur (receiverCoverPlan) : quelles images charger et dans quel slot ; une image de fond indispensable absente donne « pas de cover » plutôt qu'une cover sans sa couche dominante ; candidats = dernière story de chaque groupe hors celles déjà couvertes.
- Chaîne de repli preferredCoverURLString : composite local, vignette serveur, média image brut, avatar. Signal StoryCoverRenderSignal (Flow de génération) pour rafraîchir les cellules.
- Ne rien uploader : la couverture reste locale pour préserver la retraduction par lecteur.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryCoverRenderSignal.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+MediaPreload.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`

### En faisant défiler, le plateau devient une bande compacte qui prend la place du titre

`srp-tray-pinned-band` · Android : **absente** · P2 · effort M

PinnedStoryTrailBand : le plateau de grande taille glisse sous l'en-tête et une bande compacte (anneaux de 36 pt, sans libellé) prend en fondu la place du titre (« Meeshy Feed » / « Meeshy Chats »), juste à gauche des boutons d'action, selon la même courbe de révélation que l'en-tête (CollapsibleHeaderMetrics). Sa première cellule est toujours l'avatar de l'utilisateur (pas de bouton + ; c'est par lui que passe la composition) ; le tap sur son propre anneau ouvre le lecteur, la gestion de Mes stories et l'édition passent par l'appui long (contextMenuExtras « Gérer mes stories »). Le seuil de révélation est une garde de performance : au repos aucun anneau n'est matérialisé. Les anneaux comptent leurs impressions dans la même file que la grande trail.

Écarts :
- Bande compacte d'anneaux (36dp) qui remplace le titre de la barre supérieure au défilement, avec fondu synchronisé sur la même courbe que l'en-tête repliable ; non matérialisée tant que la révélation est ~0.
- Première cellule = avatar de l'utilisateur : tap = lecteur, appui long = menu avec « Gérer mes stories » ; pas de bouton +.
- Même pipeline de données que le grand plateau (groupes visibles, groupe self même expiré pour l'accès à l'historique) ; décompte d'impressions dans la même file.
- Montée dans les deux hôtes (liste de conversations et fil de posts) avec l'offset de défilement.

Rendu : Anneaux 36dp sans libellé, même défilement horizontal ; fondu croisé titre -> bande sur la même courbe.

Transposition Android : CollapsibleHeader -> TopAppBar avec scrollBehavior + slot titre remplacé par LazyRow compacte ; offset -> nestedScroll.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

</details>

### Changer la visibilité d'une story publiée depuis un sous-menu qui coche le mode actif

`srp-visibility-edit-menu` · Android : **absente** · P2 · effort S

StoryVisibilityMenuResolver gouverne le sous-menu « Modifier la visibilité » : le mode actif porte une coche à la place de son icône (un Picker inline aurait coché nativement mais sous iOS 26 un tint clair masque les icônes d'un menu), un tap sur le mode déjà actif ne fait rien (ni réseau ni sélecteur), un tap sur Public / Amis / Privé écrit directement avec visibilityUserIds = [] (jamais nil : un nil est omis du JSON et le gateway ne touche pas le champ, donc passer de EXCEPT[a,b,c] à Public vidait la liste localement alors que la base gardait [a,b,c]) et un tap sur EXCEPT / ONLY ouvre la sélection d'utilisateurs (le gateway rejette un envoi sans visibilityUserIds). Le payload est porté par le cas de la route plutôt que décidé au site d'appel.

Écarts :
- Écran Mes stories absent, donc aucun sous-menu « Modifier la visibilité » pour une story publiée ; le composeur Android a le sélecteur de visibilité de création seulement (Public, Amis, Communauté, Moi uniquement).
- Résolveur pur : isCurrent / symbol (coche sur le mode actif) / route (noop, écriture directe avec userIds = [], ou sélection d'utilisateurs pour EXCEPT / ONLY).
- Écrire visibilityUserIds = [] (jamais omis) via UpdatePostRequest avec encodage explicite des listes vides (kotlinx.serialization encodeDefaults) pour nettoyer réellement le champ côté serveur.
- Sélecteur d'utilisateurs pour « Sauf… » et « Seulement… » avec préselection de la liste existante.

Rendu : Coche à la place de l'icône pour le mode actif, libellés Public / Amis / Privé / Sauf… / Seulement…

Transposition Android : Menu SwiftUI avec checkmark -> DropdownMenuItem avec leadingIcon Check ; sélection d'utilisateurs -> bottom sheet de contacts existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryVisibilityMenuResolver.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### La story se fige ou boucle selon ce que fait l'utilisateur, jamais sans raison

`srp-playback-hold-loop-interruptions` · Android : **divergente** · P0 · effort M

StoryPlaybackHold range les raisons de retenir une story : pause (appui long, réaction en cours, glissé / parcours / transition / interlude, écran plein par-dessus, appel ou événement de jeu, interruption système) ou boucle (composeur, commentaires, menu « … », langues, légende dépliée, transcription, feuilles, profil). En boucle elle continue de jouer puis repart à zéro à sa fin au lieu d'avancer. Le minuteur est gardé : il attend que le fond soit utilisable et se fige quand une vidéo bufferise ou qu'un audio / image est en cache (stall gate) ; StoryPlaybackStallIndicator affiche alors un disque verre de 52 pt avec spinner blanc après 350 ms (« Chargement de la story en cours »). La durée dynamique est max(6 s, vidéo de fond / premier plan, audio, mots / 6) arrondie au multiple de la période de boucle. StorySessionInterruption fige l'horloge sur interruption système de la session audio (appel, Siri, autre app) et la reprend si shouldResume, sinon la story reste en pause utilisateur ; un appel Meeshy sonnant ou tenu fige aussi.

Écarts :
- Android arrête la barre quand une feuille / un panneau est ouvert puis la remet à zéro à la fermeture (LaunchedEffect avec snapTo(0f)) : reprendre depuis la position exacte (seek) et distinguer pause (figée) de boucle (continue et repart à 0 à la fin).
- Modéliser StoryPlaybackCauses (explicitPause, reacting, gestureInFlight, coveredByScreen, interrupted, engaged) et la décision pause > boucle > avance ; une réaction posée pendant la composition fige l'image le temps du vol.
- Porte de readiness étendue : StoryAutoAdvanceGate ne regarde que l'image de fond ; ajouter vidéo de fond qui bufferise (Media3 isLoading / STATE_BUFFERING), audio de fond et média de premier plan non prêts, avec indicateur de stall (disque 52dp, spinner blanc, apparition après 350 ms, disparition 150 ms) et libellé d'accessibilité.
- Durée dynamique : max(6 s, durée vidéo BG / FG, durée audio, nombre de mots / 6) arrondie au multiple de la période de boucle de chaque fond, au lieu du seul StorySlideDuration épinglé ou dérivé du contenu.
- Interruptions : AudioFocus perdu (appel, assistant, autre app) fige l'horloge et reprend sur AUDIOFOCUS_GAIN, sinon la story reste en pause utilisateur ; appel Meeshy sonnant / tenu et événements du jeu figent aussi.
- Pause à ON_PAUSE / ON_STOP, reprise propre au retour ; une pause utilisateur l'emporte sur la reprise automatique ; menu « … » ouvert compté seulement s'il couvre encore la scène.

Rendu : Indicateur de stall : disque 52dp translucide sombre au centre de la carte, spinner blanc, schéma dark épinglé (jamais de texte blanc illisible en mode clair) ; aucun voile ni plein écran, le média figé reste visible.

Transposition Android : AVAudioSession interruption -> AudioManager.OnAudioFocusChangeListener / Media3 AudioFocus ; CADisplayLink -> Choreographer / Animatable ; scenePhase -> Lifecycle.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+PlaybackHold.swift`
- `apps/ios/Meeshy/Features/Main/Views/StorySessionInterruption.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryPlaybackStallIndicator.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryAutoAdvanceGate.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySlideDuration.kt`

### Mon avatar « Moi » crée, ouvre ou gère mes stories et change mon mood

`srp-tray-my-story-actions` · Android : **divergente** · P0 · effort M

MyStoryButton : avatar du connecté avec dernière miniature de story, état d'anneau (non lu / lu / aucun), pastille mood (bulle pensée si aucun mood, tap = changer mon mood), bouton « + » en haut à gauche (zone tactile 44 pt étendue) pour ajouter une story, libellé « Moi » et points de comptage. Le tap sur l'avatar suit StoryTrayActionResolver : story active ou historique -> liste « Mes stories » (onglets Publiées / Brouillons, gestion et édition), sinon composeur de création ; le libellé VoiceOver décrit la destination réelle. Menu contextuel : Voir ma story (lecteur mono-auteur), Gérer mes stories (si historique, uploads ou échecs), Ajouter une story, Changer mon mood, Voir le profil (repli sur MeeshyUser sans story). Mêmes entrées sur la mini-trail épinglée (tap = lecteur, gestion par appui long). Un utilisateur sans story active mais avec archive expirée est routé vers la gestion, jamais forcé à créer.

Écarts :
- Android : tap sur « Votre story » = lecteur (ou composeur s'il n'y a rien) sans gestion ; ajouter StoryTrayActionResolver (manageStories vs createStory) et l'écran « Mes stories » (Publiées / Brouillons) comme destination du tap.
- Menu contextuel de l'avatar « Moi » : Voir ma story, Gérer mes stories, Ajouter une story, Changer mon mood, Voir le profil (repli sans story) ; libellé d'accessibilité décrivant la destination réelle.
- Pastille mood (bulle pensée quand vide, emoji sinon, tap = composeur de mood) et bouton « + » dédié en haut à gauche avec zone tactile étendue ; libellé « Moi ».
- Intégration du mood/statut (feature feed StatusBar) à l'anneau de l'utilisateur ; points de comptage sur l'avatar.
- Chaînes story.tray.* (me, addStory, menu.manage, menu.viewMyStory, menu.viewStories, menu.profile, a11y.createStory, a11y.changeMood) dans les 4 locales.

Rendu : Pastille '+' en dégradé de marque (cercle compact avec bordure de la couleur de fond) en haut à gauche, pastille mood en bas à droite ; points de comptage sous l'avatar (offset 0,318 x taille).

Transposition Android : AvatarContextMenuItem -> DropdownMenu ancré à l'avatar sur appui long ; MyStoriesView -> écran Compose « Mes stories » (liste + onglets).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryTrayActions.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`

### La légende de la story se déplie en bas de scène et la transcription vocale se lit à la demande

`srp-caption-voice-transcript` · Android : **divergente** · P1 · effort M

captionLayer affiche la description de la slide (Prisme) comme la légende d'un réel : MediaCaptionOverlay limite à dix mots, ombre plutôt que boîte, dépliable au toucher (ressort 0,38 / 0,82, haptique légère) en plein écran ancré en bas à gauche, scrollable, avec une cible « remonter en haut » accessible (story.caption.scroll_to_top) ; déplier suspend la lecture et estompe la scène (CaptionExpansionSpace) et se replie à chaque changement de story. Elle se pose exactement au-dessus du composeur (StoryCaptionPlacement.bottomInset sur le bloc mesuré), évite la bande du rail à droite, honore liens suivis, mentions et usernames valides. La transcription du vocal s'affiche à la demande (menu « … » > Afficher la transcription, éteinte par défaut) et prend la place de la légende ; l'attribution d'une piste de bibliothèque (titre · uploader) est un badge. SceneCaption.resolve choisit la légende de la scène REGARDÉE (jamais la scène 0 par défaut) avec repli sur le texte du porteur ou le premier visuel selon les règles du document.

Écarts :
- Android rend slide.text au CENTRE en headlineSmall SemiBold, intégralement et sans interaction : le déplacer en bas de scène sous forme de légende limitée à dix mots, avec ombre (sans boîte), dépliable au tap en plein écran scrollable.
- Déplier : suspend la lecture, scène estompée, repli automatique au changement de story, cible « remonter en haut » (+ libellé et astuce d'accessibilité), ressort 0,38 / 0,82 et haptique légère.
- Positionnement : bord bas = hauteur mesurée du composeur + retrait bas (StoryCaptionPlacement) ; sans composeur (sa propre story) au ras du bas ; évite la bande du rail ; chrome caché = ne réserve plus rien.
- Transcription vocale à la demande (menu « … » > Afficher / Masquer la transcription, éteinte par défaut, réinitialisée au changement de slide) qui remplace la légende ; attribution de la piste de bibliothèque (titre · uploader).
- Liens suivis (/l/token) et mentions dans la légende, montés au-dessus de la couche de gestes pour que le toucher n'avance pas la story ; résolution Prisme (rang) de la légende et de la transcription.

Rendu : Texte blanc avec ombre portée, pas de cartouche ; ancré bas-gauche avec 20pt de retrait ; au repos ne touche pas la bande du rail ; déplié il occupe la hauteur utile avec défilement.

Transposition Android : MediaCaptionOverlay (SDK) -> composable sdk-ui partagé avec le fil et les réels ; LinkText avec annotations pour mentions et liens suivis.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SceneCaption.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CanvasCaption.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`

### Réagir, demander une traduction et voir qui a vu sa story, avec retour arrière et refus explicités

`srp-story-interactions-service` · Android : **divergente** · P1 · effort M

StoryInteractionService centralise les appels du lecteur. requestTranslation(storyId, targetLanguage, force) appelle POST /posts/:id/translate : traduction SERVEUR du titre et des textes de slide, qui arrive par le socket social. Avec force, il rejoue une langue déjà traduite (bouton « Retraduire »). react(storyId, emoji) POST /posts/:id/like et LÈVE en cas d'échec, pour que l'UI optimiste annule (par exemple conflit 409 REACTION_LIMIT_REACHED). loadViewerList(postId) rend loaded(viewers, counts) avec par spectateur emoji de réaction, commentaires, réponses, reposts, partages et favori (engagement), forbidden (403 : l'auteur d'un post ou d'un réel n'en voit que les nombres) ou failed, pour que la feuille distingue refus et panne. noteComment(storyId) note la participation du lecteur (anneau du cœur sur « Commentaires »).

Écarts :
- Traduction divergente : translateStory appelle l'API de traduction de texte sur la seule légende (content) et fusionne localement. iOS demande POST /posts/:id/translate (légende ET textes du canevas) et attend le socket. Passer à la route de post avec le drapeau force pour « Retraduire » ; garder la fusion socket déjà présente.
- Liste des spectateurs : ajouter l'engagement par spectateur (réaction, commentaires, réponses, reposts, partages, favori) et les compteurs retournés, plus un résultat à trois issues loaded / forbidden / failed (403 = « liste réservée », pas un état vide).
- react() doit lever pour permettre le rollback ; déjà optimiste côté VM, vérifier le cas 409 REACTION_LIMIT_REACHED.
- noteComment : enregistrer la participation du lecteur (réaction, commentaire) dans un registre local qui allume l'anneau du cœur sur « Commentaires » ; la passerelle ne le sert pas.
- Journaliser chaque échec silencieux (équivalent MeeshyLog) plutôt que l'avaler.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryInteractionService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryViewer.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/StoryApi.kt`

### Le rail d'actions de droite propose, selon la story, réagir, répondre, envoyer, republier, voir les vues, exporter et traduire

`srp-action-rail` · Android : **partielle** · P0 · effort M

StoryActionSidebarView : le jeu de boutons est calculé d'un bloc à l'entrée de la slide puis figé (StoryActionRailPlan) pour qu'aucun bouton ne surgisse en cours de lecture ; seules les valeurs des compteurs restent vivantes. Boutons : Son / Muet (si son audible), Réagir (cœur + compteur, hors sa propre story), Répondre (si l'hôte fournit onReplyToStory), Envoyer (compteur de partages), Republier (hors sa propre story, compteur ; republication d'un tap en story), Vues (sa propre story, compteur), Composer (story d'un autre), Enregistrer (sa propre story ; anneau de progression annulable pendant le job), Commentaires (si commentCount > 0), Traductions (si contenu traduisible, long-press = scrub). Chaque bouton porte un contour : indigo400 quand son état est ouvert (son, barre, fil, langues) ou la couleur de l'auteur quand le geste est déjà fait (StoryViewerParticipationStore : commenté, envoyé, republié, réagi). ViewThatFits réduit l'espacement puis défile ; libellés / astuces / valeurs d'accessibilité complets.

Écarts :
- StoryRailPlan ne connaît que showsReact et showsLanguage : étendre aux dix boutons (showsSound, showsReact, showsReply, showsForward, showsRepost, showsViews, showsExport, showsComments, showsTranslations, showsCompose) avec les mêmes règles (réagir / republier hors sa propre story, vues / exporter seulement la sienne, commentaires si count > 0, etc.).
- Gel du plan à l'entrée de la slide (rail figé) avec relâchement sur changement de story, son devenu audible, ou impulsion de réconciliation du compteur de commentaires à l'ouverture (jamais sur activité temps réel).
- Boutons manquants dans le rail : Répondre (contexte de réponse vers la conversation), Envoyer (aujourd'hui seulement dans le menu, avec compteur de partages), Republier (compteur, un tap), Vues (aujourd'hui pastille « Vues » dans l'en-tête), Commentaires (aujourd'hui icône d'en-tête), Composer, Enregistrer / Exporter (anneau de progression annulable), Son / Muet.
- Compteurs vivants sur chaque bouton (réactions, partages, republications, vues, commentaires) et accessibilityValue ; pastille de langue active sur Traductions.
- Contour d'emphase : indigo400 pour l'état ouvert, couleur d'accent de l'auteur pour un geste déjà fait (mémoire de session StoryViewerParticipationStore, notée au POST du commentaire, à l'envoi, à la republication, à la réaction).
- Mise en page adaptative (ViewThatFits : espacement normal, resserré, puis scroll vertical) et fond glass 'mediaChromeRail' ; cibles 44dp+ ; actions nommées pour TalkBack.

Rendu : Colonne verticale à droite (bande x ~ 318-386 sur 402), disques verre translucides ; glyphe + libellé ou compteur sous le glyphe ; contour 2dp indigo400 (ouvert) ou couleur d'accent de l'auteur (fait) ; spacing railSpacing, repli xsPlus.

Transposition Android : FullscreenActionButton + ViewThatFits -> Column avec SubcomposeLayout / BoxWithConstraints et verticalScroll de repli ; SF Symbols -> Material Icons ; sensoryFeedback -> HapticFeedback.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+ActionButton.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerParticipation.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryActionRail.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRailPlan.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### La scène s'affiche en carte 9:16 sur un sol flou, lisible et fidèle à la composition de l'auteur

`srp-canvas-scene-card` · Android : **partielle** · P0 · effort L

StoryCardView empile : fond couleur / dégradé de l'auteur (StoryReaderBackground, noir quand un vrai média couvre la scène), sol flou SceneFloorView dérivé du thumbhash avec voile (cardedVeil / fullVeil), calque sortant, contenu courant (canvas pixel-perfect StoryReaderRepresentable), overlay de chargement (cover + thumbhash, spinner après 200 ms si la progression est sous 0,20, retiré à 0,95), légende, scrims de lisibilité (StoryReaderScrims), couche de gestes, chips audio, cibles de lieux, chrome haut, commentaires, rail, vol de réaction, composeur et pickers. StoryReaderCanvasLayout fixe la forme : scène toujours 9:16 (SceneShape.aspect), carte avec ombre (rayon 20, y 8, 0,4) ou plein bord, recadrage animé (ressort 0,42 / 0,84) quand le chrome est masqué ou en session plein écran. Le schéma clair / sombre du chrome suit la luminance du fond (CanvasChromeScheme), un halo à deux ombres (storyOverlayLegible) détache texte et icônes flottants, et la scène se floute quand les commentaires sont ouverts.

Écarts :
- Android remplit tout l'écran (aspect-fill) sans carte : introduire la forme 9:16 (carte à coins arrondis + ombre r20 y8 α0,4) avec recadrage animé carte -> plein bord (ressort 0,42 / 0,84) selon chrome masqué / session plein écran.
- Sol flou sous la carte (thumbhash du média) avec voile cardedVeil / fullVeil ; fond couleur / dégradé de l'auteur seulement s'il n'y a pas de fond média (sinon noir) ; le repli actuel est un dégradé accent -> noir.
- Overlay de chargement : cover thumbnail + thumbhash plein cadre, spinner apparaissant après 200 ms si la progression < 0,20, retiré à 0,95 ; aujourd'hui seul le placeholder thumbhash de l'image existe.
- Objets de scène absents du lecteur : stickers (emoji et image intégrée postMediaId), pastilles de lieu, chips audio de premier plan, filtres, 18 familles de polices / textStyle (le texte n'a qu'une police SemiBold), effets de scène ; seuls texte, médias de premier plan, tracés et keyframes sont rendus.
- Scrims de lisibilité haut et bas (opacité liée à chromeVisible), halo storyOverlayLegible (deux ombres 0,55 / 0,3, version forte pour les longs paragraphes ; halo blanc pour un texte sombre), schéma du chrome déduit de la luminance du fond.
- Flou de lecture de la scène quand l'overlay de commentaires est ouvert (storyCommentsReadingBlur) ; accessibilité : le canvas est un seul élément décrit (voir srp-a11y-voiceover).
- Tailles de texte dérivées de la largeur de la CARTE (fontSize x scale x largeur / 1080) et non de l'écran.

Rendu : Carte 9:16 centrée, rayon généreux au repos et 0 en plein bord, ombre douce ; fond noir immersif sous un sol flou dérivé du média ; texte et icônes flottants avec halo, jamais de boîte opaque ni de scrim global.

Transposition Android : SceneShape.layout + UIViewRepresentable CALayer -> Canvas Compose (ou composables par objet) dans un Box à aspectRatio 9/16 ; BlurEffect (API 31+) avec repli scrim ; SceneFloorView -> thumbhash flouté (déjà rememberThumbHashPainter).

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReaderBackground.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReaderCanvasLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+ReaderCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CanvasScrims.swift`
- `apps/ios/Meeshy/Features/Main/Views/View+StoryOverlayLegible.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundMedia.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextObjectView.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingLayer.kt`

### Lire les commentaires d'une story par-dessus la scène, avec réponses, j'aime et traductions

`srp-comments-overlay-threads` · Android : **partielle** · P0 · effort L

StoryCommentsOverlayView occupe la moitié basse sans fond opaque : la story reste visible (floutée en lecture) et interactive derrière ; la liste est à lignes plates séparées par des filets (liseré vertical 3 pt couleur d'auteur + avatar + en-tête + corps + actions), fondu supérieur (les plus anciens se dissolvent), pagination infinie des commentaires racine (curseur de 50), threads dépliables (StoryCommentThread : aperçu, bascule « Voir N réponses / Masquer », pagination ASC de 20 réponses avec « Voir plus de réponses »), cœur par commentaire (optimiste + delta local + anti double-tap) alimenté par les sockets comment:reaction-added / removed, bouton Répondre qui fait apparaître la bannière « Réponse à X » dans le composeur, bascule original / traduit avec badge Prisme, média unique par commentaire (galerie plein écran partagée), lieu et effets (flou). Chasse paginée du commentaire ciblé par une notification (et dépliage du fil parent pour une réponse) avec scroll dessus. Bannière « Story expirée — les commentaires restent visibles », états vide (« Pas encore de commentaires », « Soyez le premier à commenter ! »), chargement et erreur, compteur vivant (comment:added / updated / translation-updated) et cache-first. StoryCommentsZone place la liste sur le composeur, suivant le clavier dans la même transaction ; StoryCommentsOverlayHost ne recalcule que sur ses entrées (comparaison d'identité de stockage).

Écarts :
- Android affiche une ModalBottomSheet opaque avec une liste plate : refaire en overlay sur la moitié basse sans fond (scène derrière visible et interactive + flou de lecture), lignes plates séparées par des filets avec liseré 3dp couleur d'auteur, fondu supérieur (masque 0 / 0,4 / 1 à 12 % / 30 %), avatar et temps relatif.
- Threads : racines + réponses imbriquées, bascule « Voir N réponses / Masquer », chargement paresseux et pagination des réponses (20 / page, « Voir plus de réponses »), endpoint replies ; le modèle StoryComment n'a ni parentId, ni compteur de réponses, ni likes, ni langue d'origine, ni médias, ni lieu, ni effectFlags.
- J'aime par commentaire : cœur + compteur, état optimiste, delta local, anti double-tap (heartInFlightIds), sockets comment:reaction-added / removed ; bouton Répondre qui active la bannière « Réponse à X » (voir srp-comment-composer-bar).
- Traduction du commentaire : badge, bascule original / traduit, mise à jour temps réel (comment:translation-updated) ; aujourd'hui seule la résolution Prisme du texte existe (isTranslated).
- Média unique par commentaire (image / vidéo / audio avec transcription) et galerie plein écran partagée de la story ; lieu (sticker cliquable) ; effets (flou, éphémère).
- Pagination infinie des commentaires racine (curseur 50), chasse du commentaire ciblé par notification page par page avec repli sur le parent, scroll sur la cible.
- Bannière « Story expirée — les commentaires restent visibles » ; états vide / chargement / erreur dessinés (story.viewer.comments.empty / beFirst) ; compteur vivant du bouton Commentaires (comment:added / updated) ; cache-first (liste locale puis réseau).
- Placement : la zone suit le clavier et la plaque du composeur dans la même transaction (hauteur max mesurée) ; l'ouverture fige la story en boucle (voir srp-playback-hold-loop-interruptions) ; ouverture automatique depuis une notification (initialAction).

Rendu : Pas de boîte ni de scrim global : chaque ligne porte sa propre légèreté, filets Divider, liseré vertical de l'auteur ; texte lisible via luminance du fond (legibleOverlayColor) ; fondu supérieur ; hauteur max liée à la zone libre au-dessus du composeur.

Transposition Android : Overlay SwiftUI -> Box superposé à la scène avec LazyColumn + Modifier.imePadding ; maskedByGradient -> graphicsLayer(CompositingStrategy.Offscreen) + BlendMode.DstIn ; CommentMediaView -> composables média partagés du chat / fil.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryCommentRowView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryCommentThread.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryCommentsOverlayHost.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryCommentsOverlayView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryCommentsZone.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content+Comments.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsReducer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryComment.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/StoryApi.kt`

### Glisser vers le bas ferme, glisser vers le haut passe en plein écran, sans voler les gestes des panneaux

`srp-drag-dismiss-fullscreen` · Android : **partielle** · P0 · effort M

Un glissé unifié (distance minimale 15 pt) décide son axe au premier déplacement dominant de 8 pt : horizontal = pagination de groupes (cube), vertical bas = la carte suit le doigt (seuil 120 pt ou prédiction x 2,5) puis ferme le lecteur ; vertical haut = session plein écran (chrome masqué au repos, révélé par le toucher) ; vertical bas en plein écran = retour au mode fenêtré sans quitter. Une surface ouverte (strip de langues, barre d'emojis, commentaires, transcription, légende dépliée) consomme tout glissé vertical franchissant le seuil et se referme seule, sans fermer la story. Des règles de cession arbitrent les propriétaires du glissé : StoryReaderDragStartZone (zone scrollable ouverte), StoryReactionStripGesture (barre de réactions), StoryComposerGesture (composeur), parcours du rail ou de la barre de progression, cadres du chrome posés sur la scène. Les états de geste sont purgés quand SwiftUI saute onEnded (snap-back, transition, sortie).

Écarts :
- StorySwipeResolver ne résout qu'au relâchement (seuils 64dp horizontal, 120dp vertical) : ajouter le suivi en direct (dragOffset, horizontalDrag) pour la carte et le cube, la décision d'axe à 8 pt, la prédiction d'inertie (velocity) et l'annulation à mi-geste.
- Session plein écran : swipe haut = chrome masqué par défaut pendant toute la session, touché = révélé temporairement, swipe bas = retour fenêtré ; entrée / sortie aussi par le menu « … » (Plein écran / Quitter le plein écran).
- hasActiveReaderFeature : toute surface ouverte (langues, barre / picker d'emojis, commentaires, transcription, légende) consomme le glissé et se referme ; photographier l'état au début du geste (hadActiveFeatureAtDragStart + readerFeatureConsumedByTouch) pour ne pas fermer la story en plus.
- Règles de cession : zone défilante (liste de commentaires), barre de réactions ouverte (propriétaire selon la direction), composeur (glissé vertical = repli), parcours du rail et de la barre de progression, cadres du chrome (seule la scène pagine).
- Reset du suivi gestuel (jeton) sur les chemins non nominaux pour qu'un axe collé ne gèle jamais la lecture ; la pause du glissé est dirigée par l'état, jamais par un pause()/resume() événementiel.
- Résolution de nested scroll Compose : le glissé du lecteur est posé sur un ancêtre des LazyColumn (commentaires, picker) ; utiliser NestedScrollConnection / PointerEventPass.Initial pour céder à la bonne surface.

Rendu : Seuils : 120dp ou prédiction x 2,5 en vertical ; 15dp de distance minimale ; carte qui s'éloigne dans le sens du doigt. En plein écran la scène occupe tout l'écran sans carte ni chrome ; transition animée (ressort 0,42 / 0,84).

Transposition Android : DragGesture simultané -> Modifier.pointerInput avec awaitEachGesture + VelocityTracker ; conflits de scroll -> nestedScroll + consume sélectif ; predictedEndTranslation -> VelocityTracker.calculateVelocity.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryVerticalGestureDecisions.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReaderDragOwnership.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content+Gestures.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReaderSurfaceRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+ReaderState.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySwipeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### L'en-tête montre l'auteur et son menu « … » regroupe lecture, partage et modération

`srp-header-identity-options-menu` · Android : **partielle** · P0 · effort M

StoryHeaderView : avatar de l'auteur (MeeshyAvatar contexte storyViewer, présence vivante, anneau de profil équipé), nom tronqué et ancienneté (timeAgo) ; tap = fiche profil en feuille ; appui long de 0,4 s = halo + ouverture du profil + menu contextuel « Voir le profil » ; attribution de republication (icône + @handle) ; badge du son de fond (tap = mute). Plus de bouton (X) : le glissé bas ferme et « Fermer » est la dernière entrée du menu « … » (accessibilité). StoryOptionsMenuPlan compose un menu identique pour toute story en sections : lecture (Plein écran / Quitter le plein écran, Afficher / Masquer la transcription), Composer, sous-menu Partager (Exporter en vidéo, Partager à un ami si la story est publique, Republier en post, Republier en réel), action (Signaler, ou Retirer pour la modération, ou Supprimer sa propre story), Fermer. Signaler ouvre ReportMessageSheet ; Partager à un ami fabrique un lien traçable meeshy.me/l/<token> (repli sur l'URL brute) pour la feuille système.

Écarts :
- L'en-tête Android n'a que le nom (texte) + attribution de republication + badge « Traduit » + pastille Vues + icône commentaires + menu + bouton Fermer : ajouter avatar (présence live, anneau équipé), ancienneté, tap = profil en feuille, appui long 0,4 s = halo + profil.
- Retirer le bouton (X) permanent au profit de « Fermer » dernière entrée du menu (glissé bas ferme) ; menu en sections identiques pour toute story : lecture, Composer, Partager (Exporter en vidéo, Partager à un ami, Republier en post, Republier en réel), action, Fermer.
- Entrées manquantes : Plein écran / Quitter, Afficher / Masquer la transcription, Composer (graine de composition depuis la story d'un autre), Exporter en vidéo, Partager à un ami (lien traçable), Republier en post / en réel, Retirer (modération avec motif, ContentRemovalPolicy).
- Signalement : l'écran Android propose sept motifs en dialogue ; iOS ouvre ReportMessageSheet (motif + détail) avec haptique succès / erreur ; aligner l'écran de signalement sur la feuille partagée.
- Suppression : confirmation, optimiste, tombstone du plateau ; makeCurrentStoryPrivate (rendre privée) proposée par le flux de retrait.
- Observation de présence de menu ouvert (optionsMenuWatch) pour que le menu ouvert fasse boucler la story sans la figer ; l'en-tête ne doit pas être reconstruit à chaque tick.

Rendu : Rangée en haut sous les barres de progression : avatar 48dp+, nom en semibold, ancienneté en secondaire, @handle de republication en tertiaire (mediaChromeTertiary) ; le menu « … » est le seul contrôle en haut à droite, hauteur de cible 44dp.

Transposition Android : Menu SwiftUI -> DropdownMenu / ModalBottomSheet à sections ; UserProfileSheet -> feuille de profil Android existante (feature profile) ; ShareSheet -> Intent.ACTION_SEND via chooser.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Header.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersSheet.kt`

### Ne rien perdre d'une story composée ailleurs : effets, éléments non peignables et aucun chemin local publié

`srp-model-story-effects-wire` · Android : **partielle** · P0 · effort M

StoryEffects est la seule unité que le dépôt persiste et envoie au serveur. Elle porte fond, filtre, textes, médias, audios, stickers, lieux, dessin, transitions, durée, musique, canvasV3 et aspect. Le décodeur garde la forme-objet de l'ouverture et de la fermeture et les mémos wire par objet (ancre de bande, borne de fin, pivot nommé, zIndex absent) ainsi que les kinds d'un document plus récent (unpaintableKinds, objets réservés réémis tels quels), pour dire au lecteur qu'il reçoit une scène amputée plutôt que de la peindre comme complète. L'égalité se fait par encodage (impossible à périmer). La sanitisation retire toute référence file:// d'un média avant l'envoi : le postMediaId est le seul vecteur autorisé. Les mémos de réémission vivent sur le tas pour tenir le budget de taille. StorySlide porte contenu, effets, durée et ordre ; toPreviewStoryItem construit l'aperçu avant publication.

Écarts :
- La famille place (pastille de lieu) n'existe pas dans StoryEffects ni dans CanvasV3Projection (le commentaire du fichier l'avoue) : une story iOS avec lieu est amputée sans le dire. Voir srp-model-location-pastille.
- Pas de unpaintableKinds / carriesUnpaintableContent : le lecteur ne signale pas qu'un kind réservé ou une mention d'un document plus récent a été sauté. Pas de réémission verbatim (wireUnpaintableObjects) au réencodage.
- Mémos wire absents : ancre de bande (wireBandEdge), borne de fin (wireTimingEnd), pivot nommé (wireAnchorPoint), zIndex absent (wireMissingZIndex) : un aller-retour Android détruit la mise en page d'un réel à bandes.
- Sanitisation : retirer toute URL file:// d'un StoryMediaObject avant l'envoi (postMediaId seul vecteur), avec journal d'avertissement ; contrôle à poser dans le chemin de publication.
- Champs manquants : drawingData legacy (decode-only, migration vers drawingStrokes), canvasAspectRatio, backgroundTransform.videoFitMode et backdrop, lieux, media texts. Égalité de StoryEffects par encodage canonique (utile aux tests et à l'autosave).
- StorySlide.toPreviewStoryItem : reconstruire les médias depuis mediaObjects / audioPlayerObjects pour l'aperçu avant publication.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+Equatable.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+Sanitization.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+WireRepaintMemo.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+Preview.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryEffectsWireSerializer.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`

### Partager le même modèle de story publiée et de groupe d'auteur que iOS, avec droit de référence et compteurs

`srp-model-story-item-group` · Android : **partielle** · P0 · effort M

StoryItem porte, en plus du contenu, des médias et des effets, l'état d'engagement (compteurs de vues, impressions, partages, reposts, réactions du viewer, mentions, liens suivis), l'attribution de repost (id original, nom, @handle), la visibilité et sa liste d'ids, viewedAt local, updatedAt (curseur delta), contentEditedAt, referenceAccess (droit de référence d'une story expirée) et la règle d'expiration (isExpired avec défaut 20 h). StoryGroup porte l'auteur, la présence servie, le contour équipé, hasUnviewed, latestStory et isFullyExpired. Deux ponts reconstruisent un lecteur : StoryItem+FeedPostBridge (post de story vers StoryItem, avec repli sur la SOURCE d'une republication, médias et effets couplés en une seule décision) et StoryItem+ReaderSlide (StoryItem vers slide rendable avec Prisme, fond legacy, forme dégradée de média seul pour un client sans capacités canvas). StoryModels porte ReactionRequest, PublishAttachmentRequest (POST /posts/from-attachment) et RepostRequest.

Écarts :
- StoryItem Android ne porte pas : viewedAt, updatedAt, contentEditedAt, visibilityUserIds, shareCount, viewCount, impressionCount, anonymousViewCount, repostCount, currentUserReactions, referenceAccess, mentions, trackingLinks. Ajouter ces champs (migration douce du cache Room : défauts nuls).
- StoryGroup n'a ni authorPresence ni authorRing (contour équipé), ni isFullyExpired(at) côté modèle : aujourd'hui des fonctions d'extension dans sdk-core.
- Défaut d'expiration à 21 h côté Android (STORY_DEFAULT_TTL_HOURS) contre 20 h côté iOS : aligner. Pas d'exception d'auteur pour les stories expirées dans la règle d'expiration.
- Pont FeedPost vers StoryItem avec repli sur la source d'une republication (hasOwnContent : médias et effets couplés) et forme dégradée « média seul » : à porter pour le détail de post et l'aperçu.
- Requêtes manquantes : PublishAttachmentRequest (POST /posts/from-attachment avec target nullable, content, capturedInApp). StoryTranslation et ReactionRequest existent déjà.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryItem.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryItem+FeedPostBridge.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryItem+ReaderSlide.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryGroup.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTranslation.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryGrouping.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTranslationMerge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryUpdateMerge.kt`

### Le lecteur de stories lit dans la langue du prisme strict, jamais dans un repli arbitraire

`srp-reader-prism-chain` · Android : **partielle** · P0 · effort S

ReaderPrism.resolve(for:) donne la descente stricte du Prisme Linguistique pour tout ce qui grave ou affiche une traduction : rangs 1 à 4 (systemLanguage, regionalLanguage, customDestinationLanguage, locale appareil normalisée en ISO 639-1), dédoublonnés sans casse, SANS repli « fr » : une liste vide veut dire « aucune préférence » et la règle 1 du Prisme sert alors l'original. La locale appareil est celle persistée par la passerelle (User.deviceLocale / en-tête X-Device-Locale) sinon celle de l'appareil lui-même (démarrage à froid) ; un participant anonyme lit avec la seule locale appareil. Elle se distingue de MeeshyUser.preferredContentLanguages (repli « fr » réservé aux défauts de composition). Le lecteur de story l'utilise pour la chaîne de langues (viewerLanguageChain avec la langue d'exploration prépendue).

Écarts :
- LanguageResolver.preferredContentLanguages ajoute le repli « fr » quand rien n'est configuré : la lecture des stories doit utiliser une descente stricte sans repli (liste vide = original) et réserver le repli « fr » aux défauts de composition.
- Locale appareil : repli sur Locale.getDefault().language quand MeeshyUser.deviceLocale n'est pas encore connu du serveur (démarrage à froid) ; header X-Device-Locale envoyé et persistance opportuniste.
- Participant anonyme / sans session : EmptyContentPreferences ignore la locale appareil ; utiliser la locale appareil seule pour lire dans sa langue quand une traduction existe.
- Une seule fonction pour toutes les surfaces de lecture (stories, commentaires, aperçus) afin qu'elles ne divergent pas.

Rendu : Aucun visuel : un utilisateur francophone sur un téléphone anglais voit toujours le français quand il existe, et l'original sinon.

Transposition Android : Locale.current -> Locale.getDefault()/LocaleListCompat ; LanguageCodeNormalizer existant côté Android.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/ReaderPrism.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`

### Le service de stories charge, réagit, supprime, republie et garde un cache par id

`srp-story-service-rest` · Android : **partielle** · P0 · effort M

StoryService (StoryServiceProviding) : list(cursor, limit, updatedSince) sur GET posts/feed/stories avec synchronisation différentielle (?updatedSince=ISO8601, seules les stories créées ou modifiées depuis), delete(storyId, reason) (retrait par la modération avec motif via deleteRemovingContent), react(storyId, emoji) sur POST posts/:id/like avec l'emoji explicite (sans lui le serveur enregistrait toujours un cœur), repost, listMine (archive complète en keyset : les stories ne sont plus détruites côté serveur), republish (la même story repart avec dates fraîches et engagement remis à zéro), fetchPost, et un cache mémoire par id borné (500, éviction FIFO) alimenté par les listes et par les deep links (cache(post:), cachedPost(id:), invalidate(postIds:) pour qu'une story supprimée ne ressuscite pas), purgé à la déconnexion.

Écarts :
- list() sans updatedSince : ajouter le paramètre de delta-sync (?updatedSince=ISO8601) à StoryApi.list et l'utiliser pour la revalidation du plateau (tombstones inclus).
- Absents : listMine (GET stories/mine paginé keyset), republish (POST posts/:id/republish), delete avec motif (retrait de la story d'un AUTRE par la modération), fetchPost déjà présent mais sans cache par id.
- Cache par id borné (FIFO 500) + seed depuis une notification préchargée + invalidate sur suppression / péremption ; purge au logout (isolation entre comptes).
- Réaction : exposer le détail d'erreur (409 REACTION_LIMIT_REACHED) à l'appelant et une voie « enfile dans l'Outbox » pour la panne de transport.

Rendu : Aucun visuel ; contrat réseau et cache.

Transposition Android : APIClientProviding -> Retrofit StoryApi + apiCall/NetworkResult ; Locked(BoundedFIFOMap) -> LruCache / ConcurrentHashMap borné ; WireDate -> kotlinx-datetime/Instant.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/StoryApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryCacheSource.kt`

### Taper les bords change de story, double-taper le centre ou maintenir met en pause

`srp-tap-zones-pause-gestures` · Android : **partielle** · P0 · effort M

StoryGestureOverlayView + StoryGestureDecisions : la surface est découpée en bandes, 30 % à gauche = story précédente, 30 % à droite = suivante (immédiates, sans attendre un double-tap), bande centrale = double-tap pause / lecture. Un appui long de 200 ms met en pause et masque le chrome ; le toucher suivant sur un bord reprend sans naviguer (le relâchement de ce toucher est consommé). Tolérance de tap 14 pt (un glissé qui dépasse n'est pas un tap), surface ouverte (langues, emojis, commentaires, transcription) : le premier toucher la referme sans naviguer, composeur engagé : le toucher le ferme. Haptique légère à chaque navigation. goToNext / goToPrevious sont gardés (fermeture, transition, composeur) : fin du dernier groupe = fermeture, début du premier groupe = rien. Les navigations alimentent la télémétrie.

Écarts :
- Android sépare l'écran en deux moitiés (detectTapGestures) : porter les bandes 30 / 40 / 30 (StoryTapZone) avec la bande centrale réservée au double-tap pause / lecture.
- Appui long (>= 200 ms) = pause avec masquage du chrome et latch ; le tap de reprise sur un bord est consommé sans navigation (resumeFromPause / isResumingTap) ; aucune pause utilisateur n'existe aujourd'hui.
- Tolérance de glissé (slop 14 pt) : un geste qui dépasse la tolérance ne déclenche pas de navigation.
- Un toucher sur une surface ouverte (barres rapides, commentaires, transcription) doit la refermer sans naviguer ; Android ne gère que les barres du rail (railOverlayActive).
- Gardes de navigation (en cours de fermeture / transition / composeur engagé) et reset du suivi gestuel après chaque chemin non nominal.
- Retour haptique léger à chaque changement de story ; VoiceOver / TalkBack : actions nommées « Story suivante » et « Story précédente » sur le canvas.

Rendu : Aucune zone visible ; le chrome (barres, en-tête, rail, composeur) glisse hors écran pendant le maintien (ressort 0,32 / 0,78) et revient au relâchement.

Transposition Android : SpatialTapGesture / DragGesture(minimumDistance 0) -> pointerInput + awaitEachGesture avec suivi du slop ; HapticFeedback.light -> LocalHapticFeedback ; accessibilityAction(named:) -> semantics customActions.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryGestureDecisions.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryGestureOverlayView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Navigation.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySwipeResolver.kt`

### Le plateau d'anneaux de stories montre qui a posté, ce qui est nouveau et se lit sans attendre

`srp-tray-rings` · Android : **partielle** · P0 · effort M

StoryTrayView : rangée horizontale de hauteur 120 (StoryEntryMetrics : avatar 88, anneau 94, libellé 96 pt, police 10, mêmes mesures dans le fil de posts et la tête de la liste de conversations) ; cache-first (squelette seulement si le cache est vide et un chargement en vol, jamais de saut), LazyHStack, apparition en cascade plafonnée à 10 anneaux. StoryRingCell : MeeshyAvatar avec état d'anneau lu / non lu, mood, présence, anneau équipé de l'auteur, cover = miniature de la dernière story (cascade mémoïsée sans lecture disque dans le body, StoryCoverURLMemo, invalidée sur écriture de cover et changement de compte), libellé en semibold si non lu, points de comptage des stories vivantes (max 5 + « + »), menu contextuel (Voir les stories, Voir le profil), tap = ouverture du lecteur avec haptique moyenne. L'expiration est balayée au fil de l'eau tant que le plateau est visible ; chaque anneau apparu compte une impression ; comparaison d'entrées de rendu (Equatable) pour éviter 7 000 recalculs.

Écarts :
- Mesures : avatar 88 / anneau 94 / libellé 96 / hauteur 120 (StoryEntryMetrics, identiques dans le fil et la liste de conversations) ; Android utilise 56 / 64 / 72dp et ne monte le plateau que dans l'en-tête de la liste de conversations.
- Anneau : état non lu (accentué, 2x l'épaisseur) vs lu (discret), couleur d'accent, anneau équipé de l'auteur (profileDecor.avatarRing), pastille de présence et mood sur l'avatar.
- Cover = miniature de la dernière story (cascade de couverture mémoïsée, sans E/S dans la composition) ; Android affiche l'avatar de l'auteur ; invalider sur écriture de cover et changement de compte.
- Menu contextuel de l'anneau (appui long) : Voir les stories, Voir le profil ; tap = ouverture + haptique ; libellé en semibold si non lu, atténué sinon.
- Cache-first et squelette : skeleton uniquement si cache vide et chargement en vol (existe) ; ajouter l'apparition en cascade (plafond 10 anneaux), le balayage d'expiration à cadence fixe et le décompte d'impressions par anneau apparu.
- Points de comptage : stories vivantes uniquement (les expirées de l'archive de l'auteur ne comptent pas), max 5 puis « + » (existe en partie via StoryCountDots).
- Performance : cellules à entrées de rendu comparables (pas de recomposition globale sur chaque présence / statut) et LazyRow avec clés stables.

Rendu : Rangée de 120pt, rayon d'anneau accentué (2x) si non lu, libellés 10pt sous l'avatar, espacements MeeshySpacing.md entre cellules et lg en marge ; apparition en cascade 0,05 s x index (10 premiers).

Transposition Android : MeeshyAvatar(storyState: .unread/.read) -> MeeshyAvatar sdk-ui avec ring ; contextMenu -> combinedClickable + DropdownMenu ; SkeletonStoryTrayRow -> StoryTraySkeleton existant.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryTrayView+RingCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryEntryMetrics.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryCoverURLMemo.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCountDots.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoriesViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Voir l'anneau passer en « vu » immédiatement, même hors ligne, et ne le rallumer que si la story est éditée

`srp-tray-viewed-ledger` · Android : **partielle** · P0 · effort M

Marquer une story vue écrit d'abord en local (anneau et compteurs immédiats), puis l'envoi passe par l'outbox durable (coalescé : une vue unique par story, rejouée hors ligne). Une impression distincte par slide affichée (source story) passe par l'ImpressionBatcher persistant avec rejeu. Garde « vu » monotone raffinée : une fois vue localement, une story reste vue même si le serveur, en retard, dit l'inverse, SAUF quand son contenu a été édité après la vue (contentEditedAt), cas où le serveur a effacé les vues et où l'anneau se rallume légitimement. Un registre durable des vues est reporté sur tout tray venu d'ailleurs que la mémoire (cache relu, page delta, événement temps réel). L'auteur ne voit jamais ses propres vues enregistrées. L'entrée de vue (rail, notification, lien) est tracée.

Écarts :
- markCurrentViewed appelle POST /posts/:id/view en fire-and-forget (runCatching) sans écriture locale : l'anneau ne passe en « lu » qu'au prochain aller-retour serveur, et la vue est perdue hors ligne. Ajouter une écriture locale optimiste dans Room et un enqueue durable (OutboxKind dédié, coalescé par story).
- Ajouter à StoryItem les champs viewedAt (date de la vue locale) et contentEditedAt, plus un registre durable des vues (DataStore ou Room) appliqué à tout tray reconstruit (applyViewedLedger).
- Règle shouldKeepLocalViewed(localViewedAt, contentEditedAt) : monotone sauf édition postérieure à la vue ; jamais de reset pour l'auteur ; une vue sans horodatage cède devant une édition.
- Impression par slide via ImpressionBatcher persistant (déjà présent côté SDK, à brancher sur l'affichage de chaque slide plutôt que sur le dwell qualifié) ; entrée de vue (ContentEntry : rail, notification, lien) transmise.
- Re-tri du groupe quand hasUnviewed bascule (le groupe tout vu descend sous les frais).

Rendu : L'anneau d'avatar passe d'un dégradé coloré à gris dès l'ouverture de la dernière story non vue, sans attendre le réseau.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Viewing.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModelRules.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`

### Ouvrir le lecteur sur la bonne story depuis un anneau, un profil, une notification ou un lien

`srp-viewer-entry-routing` · Android : **partielle** · P0 · effort M

StoryViewerContainer attend que les groupes existent (refetch si l'auteur demandé est absent, fetch unitaire par postId quand le plateau ignore le groupe, verrou de fraîcheur isGroupReadyToPresent), affiche « Chargement… » puis, après un délai, « Story introuvable » avec Réessayer / Fermer, et se referme seul si le groupe disparaît après montage. StoryViewerScope choisit la portée (un seul auteur depuis une conversation, une notification ou un lien ; navigation inter-auteurs depuis le plateau) et ne garde que les stories en cours (archives de l'auteur masquées sauf cible). L'index de départ vient du postId (StoryIndexResolver, recherche dans l'ordre ascendant de createdAt), de la première story non vue (points d'entrée profil / avatar / plateau) ou d'un index explicite. StoryViewerRequestOrigin nomme les deux intentions (targetingStory vs openingGroup). Une initialAction ouvre d'office les commentaires ou la feuille des vues (avec commentaire ciblé et parent de repli) pour une notification, et onReplyToStory est transmis quand on vient d'une conversation.

Écarts :
- La route est story/{userId} uniquement : ajouter postId, startAtFirstUnviewed, singleGroup, initialAction (comments|viewers), targetCommentId et targetParentCommentId, plus le deep link meeshy.me/story/{id} et la destination de notification par id de story (aujourd'hui NotificationDestination ne route que friend_new_story vers le plateau de l'auteur).
- StoryPlayback.startingAt ouvre toujours à la slide 0 : porter StoryIndexResolver (index du postId dans group.stories ordonné par createdAt ascendant) et la règle entryIndex (première non vue non expirée, sinon première non expirée, sinon 0).
- Portée : filtre liveOnly (le groupe de l'auteur ne montre que ses stories en cours, l'archive reste hors lecteur sauf la story ciblée) et mode singleGroup qui interdit le passage à l'auteur suivant ; aujourd'hui tous les groupes sont navigables.
- Chargement : StoryViewerViewModel.load() fait un GET réseau (storyRepository.list) à chaque ouverture, sans cache-first ; lire storiesStream (Room) d'abord puis revalider, refetch si l'auteur est absent, fetchPost(postId) unitaire quand le plateau ignore le groupe.
- États manquants : écran noir + « Chargement… » avec spinner, puis après timeout « Story introuvable / Impossible de charger cette story. Réessayez ou fermez. » avec boutons Réessayer et Fermer ; Android ne montre que « Aucune story à afficher » sans action.
- Se refermer automatiquement si le groupe affiché disparaît après l'ouverture (suppression / expiration pendant la lecture).
- Bandeau de connexion / hors-ligne au-dessus du lecteur (ConnectionBanner, masqué de la pill interne).
- Transmettre le contexte de réponse (onReplyToStory) quand le lecteur est ouvert depuis une conversation.

Rendu : Fond noir plein écran pendant l'attente ; spinner blanc centré + libellé « Chargement… » ; état d'échec centré avec titre, description et deux boutons (Réessayer en principal, Fermer en secondaire). Aucun écran blanc ni flash : le lecteur ne se monte qu'une fois le groupe prêt.

Transposition Android : fullScreenCover + StoryViewerCoordinator -> destination Navigation Compose plein écran avec arguments typés ; deep links -> intent-filter App Links meeshy.me/story/{id}.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerRequestOrigin.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryIndexResolver.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerScope.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`

### Le lecteur s'ouvre en grandissant, se ferme en glissant et libère tout en quittant

`srp-viewer-shell-appearance` · Android : **partielle** · P0 · effort M

StoryViewerView porte l'état du lecteur ; StoryViewerContentView pose la base noire, l'hôte du préchargeur et la carte dans une GeometryReader. viewerDidAppear applique l'index initial, saute les stories illisibles, active le coordinateur média, installe le pipeline de préchargement, démarre l'horloge, marque la première vue, pré-résout les identités voisines et anime l'apparition (ressort 0,4 / 0,82 : échelle 0,92 vers 1, rayon 24 vers 0). viewerWillDisappear invalide l'horloge, purge l'état gestuel, annule les tâches, libère les lecteurs, quitte la salle de publication et clôt la session d'engagement. Passer en arrière-plan coupe l'audio, désactive la session audio et ferme le lecteur. StoryViewerCardTransform dérive échelle, rayon, opacité et décalage de la carte (suit le doigt 1:1 en glissé bas, sortie vers le bas à 0,12 d'échelle). La barre d'état est masquée et le schéma sombre est imposé.

Écarts :
- Aucune animation d'ouverture ni de fermeture : ajouter l'apparition (échelle 0,92 vers 1, coin 24dp vers 0, ressort ~0,4 s) et la sortie (échelle 0,12, translation 35 % de la hauteur, fondu) au lieu d'un dismiss sec (isDismissed -> onClose).
- Pendant le glissé bas la carte doit suivre le doigt 1:1 (échelle 1 - 0,35 x p, rayon jusqu'à 36dp, opacité 1 - 0,3 x p, p = dy/350) ; Android n'évalue le geste qu'au relâchement.
- Fermer le lecteur quand l'application passe en arrière-plan (ON_STOP), couper players et audio, relâcher le focus audio ; fondu de sortie de l'audio externe sur 0,4 s à la fermeture.
- Mode immersif : barre d'état / navigation masquées (edge-to-edge sombre forcé) pendant tout le lecteur.
- Libération complète à la fermeture : horloge, tâches de préchargement, salle de publication, session d'engagement (partiellement fait via onCleared pour salle et dwell).

Rendu : Fond noir, ressort ~0,4 s d'amortissement 0,82 ; carte à coins arrondis qui se redresse à plein bord ; sortie dans le sens du geste (vers le bas).

Transposition Android : scenePhase .background -> LifecycleEventObserver ON_STOP ; statusBarHidden -> WindowInsetsController hide ; transition zoom iOS 18 -> SharedTransitionLayout / predictive back.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerContentView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Lifecycle.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerCardTransform.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### La story se lit et se navigue au lecteur d'écran, sans voir ni toucher

`srp-a11y-voiceover` · Android : **partielle** · P1 · effort S

Le canvas étant dessiné en calques, StoryCanvasAccessibility compose l'annonce vocale du contenu : position (« Story X sur Y »), auteur, textes des objets résolus par le Prisme (donc ce que l'écran montre exactement), transcription du vocal, description de chaque sticker. Le canvas expose des actions nommées « Story suivante » et « Story précédente » (haptique légère). Un changement de slide est annoncé (« Story X sur Y ») quand VoiceOver tourne ; le lecteur porte le libellé « Lecteur de stories » et l'astuce de navigation « Toucher à gauche pour la précédente, à droite pour la suivante, maintenir pour mettre en pause ». Les barres de progression sont ajustables, le bouton de profil porte un libellé combiné (profil de X, republication de @Y) avec action nommée Muet, le rail annonce libellé / astuce / valeur, la sentinelle et la bulle du composeur ont leurs libellés.

Écarts :
- Annonce du contenu de la slide : label composé (position, auteur, textes Prisme, transcription, descriptions de stickers) sur le canvas en élément fusionné ; Android ne décrit que le rail, le badge de langue et l'attribution de republication.
- Actions personnalisées « Story suivante » / « Story précédente » sur le canvas (semantics customActions) et annonce liveRegion/announceForAccessibility du changement de slide (« Story X sur Y »).
- Libellé du lecteur et astuce de navigation (story.viewer.label, story.viewer.navigation.hint) ; barre de progression exposée comme valeur ajustable.
- Équivalents TalkBack pour tout geste (pause, plein écran, fermer par le menu) : aucune action ne doit dépendre d'un glissé ; sticker descriptions réutilisant StoryStickerAccessibility.

Rendu : Aucun visuel ; cibles tactiles >= 44 pt/48dp, contraste du chrome garanti par scrims et halos.

Transposition Android : UIAccessibility.post(.announcement) -> View.announceForAccessibility / semantics liveRegion ; accessibilityAction(named:) -> semantics customActions.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryCanvasAccessibility.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryActionRail.kt`

### Commenter ou répondre depuis une seule barre de saisie : texte, pièces jointes, voix, mentions, brouillon par story

`srp-comment-composer-bar` · Android : **partielle** · P1 · effort L

StoryComposerBarView est l'unique zone de saisie du lecteur (réponse à la story ET réponse à un commentaire) : UniversalComposerBar avec accent résolu (celui du commentaire visé, sinon celui de la story, second arrêt du dégradé décalé de +30 degrés), bannière « Réponse à X » avec bouton Annuler la réponse, plateau de pièces jointes (photo, fichier, caméra, lieu) et prise vocale réelle, mentions @ (contacts du cache puis /mentions/suggestions sur le post), sélecteur de langue du composeur (DefaultComposerLanguage), emoji, effets (flou, éphémère). Envoi optimiste (FeedComment temporaire avec ClientMutationId, compteurs +1, haptique succès, fermeture du composeur), publié par CommentPublisher avec pièces ; en cas d'échec le commentaire est confié à la file durable (CommentMediaDelivery.entrust) et son issue observée ; si la file REFUSE, le commentaire est retiré et rendu au composeur avec ses pièces (StoryRefusedComment : rien n'est perdu). Un brouillon par story (texte + pièces) est conservé (StoryDraft) et restauré à la réouverture.

Écarts :
- Android propose un champ texte unique dans la feuille (« Ajouter un commentaire… », Envoyer, Échec — appuyez pour réessayer) : porter la barre complète (UniversalComposerBar équivalent) avec accent dérivé de la story ou du commentaire visé.
- Réponse à un commentaire : parentId, bannière « Réponse à X » colorée + Annuler la réponse, thread racine (parent du parent), compteurs de réponses +1.
- Pièces jointes : photo / vidéo / fichier / caméra / lieu, plateau avec retrait, limite de médias, prise vocale (AudioRecorder + transcription mobile), upload via CommentMediaUploader ; endpoint de création avec médias, location et effectFlags.
- Mentions @ (contacts locaux puis suggestions serveur sur le post dès la 2e lettre), sélecteur de langue du composeur, emoji dans le champ, effets (flou, éphémère).
- Brouillon par story (texte + pièces) enregistré et restauré, supprimé après envoi ; commentaire refusé par la file restitué au composeur avec ses pièces (refusedAt).
- Livraison : publication via la file durable (Outbox) avec observation de l'issue ; optimisme (id temporaire) réconcilié par l'écho temps réel ; haptique succès et fermeture du composeur après envoi.
- Engagement : enregistrer l'action « commenté » et noter le geste pour le contour du rail.

Rendu : Plaque verre arrondie en bas, bouton d'envoi dégradé accent -> accent+30 degrés, bannière de réponse teintée à 0,18 avec liseré à 0,35 ; pièces en vignettes amovibles ; clavier géré par imePadding.

Transposition Android : UniversalComposerBar -> composeur de chat Android existant (feature chat) ou composable partagé sdk-ui ; PhotosPicker -> ActivityResultContracts.PickMultipleVisualMedia ; caméra -> CameraX / TakePicture ; voix -> MediaRecorder + waveform.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerBar.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryDraft.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+RefusedComment.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsReducer.kt`

### Créer, éditer ou reprendre un brouillon de story ouvre le composeur en plein écran, et Mes stories enchaîne proprement

`srp-composer-cover-my-stories` · Android : **partielle** · P1 · effort M

StoryComposerCover présente le composeur de CRÉATION au niveau racine (comme un cover unique, l'id d'un brouillon à reprendre étant posé avant la présentation via openComposer(resumingDraftId:)), avec ses assets d'aperçu (StoryPreviewAssets, « Aperçu » du header) ; storyEditComposerCover ouvre une session d'édition d'une story publiée (StoryEditSession). La feuille « Mes stories envoyées » (ouvrir, vues, partager, republier, supprimer, éditer, reprendre un brouillon) se ferme avant qu'on enchaîne : DeferredSheetFollowUp pose l'intention PENDANT la fermeture et l'exécute à la fin réelle du dismiss (aucun délai de 350 ms), pour ouvrir le lecteur ciblé sur un postId, créer, éditer ou reprendre.

Écarts :
- Android a un composeur (route story_composer, brouillon et autosave) mais pas de mode ÉDITION d'une story publiée (StoryComposerViewModel(editing:)) ni de reprise d'un brouillon par id depuis une liste.
- Écran « Mes stories » (liste paginée via listMine, onglets Publiées / Brouillons, actions ouvrir / vues / partager / republier / supprimer / éditer / changer la visibilité) absent : il est la cible du tap sur « Moi ».
- Enchaînement déterministe fermeture de feuille -> action (intention en attente consommée au vrai dismiss), jamais par délai fixe.
- Ouvrir le lecteur sur une story précise de ses publications (postId + singleGroup) depuis cette liste (voir srp-viewer-entry-routing).
- Aperçu du composeur dans le lecteur (isPreviewMode, assets préchargés) sans interlude ni télémétrie.

Rendu : Composeur en plein écran au niveau racine ; feuille Mes stories en grille ; enchaînement sans clignotement.

Transposition Android : fullScreenCover/sheet -> destinations Navigation Compose + ModalBottomSheet avec callback onDismissed/animationFinished pour enchaîner.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryTrayActions.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryComposerDraftStore.kt`

### Republier une story d'un tap, en story, en post ou en réel, avec retour immédiat

`srp-direct-repost` · Android : **partielle** · P1 · effort M

StoryDirectRepost.publish republie sèchement (RepostIntent.simple, isQuote false, serveur hérite de l'audience de l'original) via RepostPublisher (jeton d'idempotence, file hors ligne, verrou par cible) : le bouton Republier du rail cible la story, le sous-menu Partager du menu « … » offre Republier en post et Republier en réel. Haptique succès, toast de réussite par destination (« Story republiée », « Republié dans ton feed », « Republié dans tes réels »), et refus nommés : 404 = « La story n'est plus disponible », 403 = « Cette story ne peut pas être repartagée » (l'audience élargirait celle de l'original), sinon « Échec de la republication ». La loi d'audience (StoryRepostAudience, miroir du serveur) borne les cibles : une story FRIENDS se republie en FRIENDS ou PRIVATE, une PRIVATE en PRIVATE, sans conditionner l'existence du bouton à story publique. Le geste est noté pour le contour du rail.

Écarts :
- Le menu Android « Republier » navigue vers le composeur de story (Routes.storyComposerRepost) au lieu d'un geste d'un tap ; ajouter la republication directe vers story / post / réel (repost simple, non citation) avec jeton d'idempotence, file hors ligne et verrou par cible.
- Bouton Republier dans le rail (compteur de republications) hors sa propre story ; entrées « Republier en post » et « Republier en réel » dans le sous-menu Partager.
- Retours : haptique succès + toast par destination (story.mine.repost.success, story.repost.success, story.repost.success.reel) ; refus nommés 404 / 403 / générique (story.repost.error.unavailable / forbidden / generic).
- Loi d'audience (StoryRepostAudience) : bornage des cibles selon la visibilité de l'original ; ne plus masquer le bouton pour les stories non publiques.
- Endpoint republish (republier la MÊME story avec dates fraîches) et mémoire de session du geste pour le contour du rail.

Rendu : Aucun écran : un tap, un toast discret et le contour du bouton passe à la couleur d'accent de l'auteur.

Transposition Android : RepostPublisher + OfflineQueue -> Outbox lane repost ; FeedbackToastManager -> Snackbar / toast centralisé ; HapticFeedback.success -> HapticFeedbackType.Confirm.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`

### Retrouver ses brouillons de story, les reprendre ou les supprimer, même après un échec de publication

`srp-drafts-list-and-resume` · Android : **partielle** · P1 · effort M

L'onglet « Brouillons » liste les brouillons enregistrés (lecture SQLite faite une seule fois puis au retour au premier plan, jamais dans le body). Les brouillons GELÉS (publication en cours) sont cachés : les rouvrir corromprait ce que le succès ou l'échec va consommer. La suppression est optimiste. Reprendre un brouillon rouvre le composer sur son id pour que l'autosave écrive sous le même brouillon. Reprendre une publication échouée (resumeFailedItem) reconstruit la composition depuis la file, avec le toast « Impossible de reprendre cette story » en cas d'échec. Un échec permanent dégèle le brouillon et affiche son erreur ; il n'est supprimé qu'au succès serveur confirmé.

Écarts :
- Un seul brouillon (slot unique DataStore) : passer à un magasin multi-brouillons (Room) avec id, résumé (titre, miniature, date, nombre de slides) et pendingPublishAt.
- StoryDraftsViewModel : liste filtrée des brouillons non gelés, rechargement au retour au premier plan (ProcessLifecycleOwner), suppression optimiste puis relecture, suppression du sous-dossier de médias.
- Reprise par id : ouvrir le composer sur un brouillon donné et autosauvegarder sous cet id. Gel au hand-off de publication, dégel sur annulation, suppression seulement sur succès confirmé, recordPublishFailure(message) sur échec permanent.
- resumeFailedItem : recomposer depuis l'intention en file (médias sur disque), avec toast d'erreur dédié.
- Écran « Brouillons » : grille de cartes avec date et nombre de slides, suppression, état vide.

Rendu : Grille de cartes miniature 9:16 avec date relative et pastille du nombre de slides ; geste de suppression avec disparition immédiate de la carte.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryDraftsViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Publication.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryComposerDraftStore.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryComposerDraftSnapshot.kt`

### Exporter une story en vidéo, la partager à un ami et enregistrer avec un anneau de progression

`srp-export-video-share-sheets` · Android : **partielle** · P1 · effort L

StoryExportShareSheet : feuille « Exporter en vidéo » avec titre, sous-titre, sélecteur de langue (Original ou une des langues disponibles, noms localisés), bouton Exporter en vidéo, progression linéaire « Export en cours N % » pendant l'export, état d'erreur avec OK, puis feuille de partage système avec le fichier (Enregistrer la vidéo, AirDrop, Fichiers). Les palettes de surface suivent le colorScheme réel de rendu (contraste AA en sombre). StorySaveProgressRing dessine l'anneau de progression d'un enregistrement de scène (balayage indéterminé pendant les passes d'intro / outro qui ne publient pas de progression, arc d'accent tant qu'annulable puis inerte) ; SceneSaveProgressButton le rend annulable d'un tap. StoryViewerSheets (ViewModifier) héberge les feuilles posées par-dessus le lecteur : spectateurs (Vues), export vidéo, partage unique (SharedContentWrapper / ShareSubject), lieu plein écran, fiche profil ; elles lisent elles-mêmes les environnements requis. « Partager à un ami » fabrique le lien traçable meeshy.me/l/<token>.

Écarts :
- Export vidéo absent : rendre la story en MP4 (Media3 Transformer ou MediaCodec) dans la langue choisie (Original ou langue disponible), avec intro / outro, progression publiée (part de cuisson ~90 % puis passes sans progression) et annulation.
- Feuille d'export : titre, sous-titre, sélecteur de langue, bouton « Exporter en vidéo », barre de progression « Export en cours N % », erreur avec OK ; puis partage du fichier via le chooser système (Enregistrer dans la galerie via MediaStore, Partager).
- Anneau de progression annulable sur le rail (propriétaire seulement) : arc d'accent tant qu'annulable, balayage indéterminé pendant l'intro / outro, devient inerte quand l'écriture galerie a commencé.
- « Partager à un ami » : minter un lien traçable (TrackingLink, route partagée avec les posts), repli sur l'URL brute (https://meeshy.me/story/<id>) et feuille de partage Android ; entrée disponible pour les stories publiques seulement.
- Hôte de feuilles unique par-dessus le lecteur : Vues (existe), export, partage, lieu plein écran (voir srp-location-pin-tap), profil ; reprise de la lecture à la fermeture de chaque feuille.
- Palette de surface dérivée du colorScheme réel (contraste >= 4,5:1 même quand le lecteur force le sombre).

Rendu : Feuille en verre avec sélecteur de langue en menu déroulant (libellé « Langue », chevron), bouton principal pleine largeur, progression linéaire accentuée ; anneau de 28dp avec balayage.

Transposition Android : AVAssetExportSession / StoryExportIntro/Outro -> Media3 Transformer + compositing OpenGL ; ShareSheet -> Intent.ACTION_SEND ; enregistrement photothèque -> MediaStore.Video ; ProgressView linéaire -> LinearProgressIndicator.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/StorySaveProgressRing.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerSheets.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerSheetItems.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Lire la story dans une autre langue : barre rapide des langues prêtes et explorateur détaillé avec retraduction

`srp-language-quick-bar-detail` · Android : **partielle** · P1 · effort M

Le bouton Traductions du rail ouvre StoryLanguageQuickBar (langues déjà prêtes pour la story : texte du canvas et légende confondus via StoryTextLanguageAvailability) : chips drapeau de 22 pt de même style que la barre de réactions, pilule qui épouse son contenu, la langue lue en pleine opacité soulignée en indigo ; au-delà de inlineCap la rangée défile sous un masque et le « + » reste épinglé ; un appui long suivi d'un glissé parcourt les chips. Le « + » ouvre StoryLanguageDetailView : feuille verre (clair / sombre), contenu de la langue courante en tête, ligne « Original » (sentinelle __meeshy.original__ qui vide la chaîne pour que chaque overlay garde sa propre langue d'écriture), liste des langues avec aperçu de 50 caractères, « Retraduire » (baseline + timeout 20 s) et « Traduire » pour les langues absentes (requestTranslation). La langue d'exploration est éphémère (réinitialisée au changement de slide), prépend la chaîne du Prisme sans doublon (StoryReaderContentRules.viewerLanguageChain) et la transcription suit la même chaîne.

Écarts :
- Option « Original » (sentinelle qui vide la chaîne de préférence) pour revenir au texte source de chaque overlay sans l'aligner sur une seule langue ; aujourd'hui toggleLanguageOverride ne sait choisir qu'une langue.
- Tuile « + » à la fin de la barre qui ouvre l'explorateur détaillé (feuille) : langue courante + liste des langues avec aperçu 50 caractères, Traduire pour les absentes, Retraduire (baseline + timeout 20 s, spinner), ligne Original, glissement/drag de la feuille, rendu clair / sombre.
- Langues disponibles : union du texte de canvas (sourceLanguage + clés translations de chaque StoryTextObject) et de la légende ; indiquer langues prêtes vs traduisibles à la demande (existe partiellement via StoryLanguageOption.isTranslatable).
- Barre longue : défilement avec masque en fondu et « + » épinglé ; barre courte qui épouse son contenu ; langue active mise en avant (pleine opacité + souligné indigo) ; mêmes dimensions que la barre de réactions.
- Les traductions des textObjects (StoryTextObjectTranslationMerge) doivent suivre l'override par objet ; l'override est réinitialisé au changement de slide ; la transcription audio suit la même chaîne.
- Retraduction et traduction à la demande : suivi d'état par langue (traduction en cours, échec, expiration) et mise à jour temps réel (story:translation-updated).

Rendu : Pilule identique à la barre de réactions (glyphe drapeau 22pt, « + » 32pt), langue active soulignée en indigo ; feuille détail en verre sombre/clair avec contraste AA, lignes de langue avec drapeau, nom, aperçu et action trailing.

Transposition Android : LanguagePickerSheet iOS (liste complète) -> ModalBottomSheet Compose ; masque en fondu -> Modifier.fadingEdge/graphicsLayer + drawWithContent.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryLanguageQuickBar.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryLanguageDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReaderContentRules.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt`

### Ouvrir une story sans attente et pouvoir la relire hors ligne jusqu'à son expiration

`srp-media-prefetch-offline-pin` · Android : **partielle** · P1 · effort M

Après le chargement du tray, les médias des 8 premiers groupes sont préchargés : la première story non vue de chaque groupe en priorité haute (images sur disque, préchauffage du lecteur vidéo de la première slide), puis jusqu'aux 4 slides suivantes en priorité utilitaire (sans préchauffer les lecteurs, pour économiser la mémoire). La politique d'auto-téléchargement est respectée (par exemple vidéo interdite en cellulaire) et une URL sautée n'est pas marquée préchargée, pour être rattrapée au retour du Wi-Fi. Une story VUE voit ses médias épinglés dans leur store disque (vidéo, audio, images) jusqu'à son expiration, pour relecture hors ligne. Les pins sont relâchés quand la story est purgée, sans supprimer les octets, car un repost peut les partager. Le type effectif d'un média vient de l'extension d'URL quand elle est reconnue, pour corriger un mp4 déclaré image.

Écarts :
- Le préchargement Android ne couvre que les 2 images suivantes de la lecture en cours (Coil enqueue) : pas de préchargement des 8 premiers groupes depuis le tray, pas de vidéo ni d'audio, pas de préchauffage du lecteur de la première slide.
- Politique d'auto-téléchargement : appliquer MediaDownloadPreferencesStore (vidéo interdite en cellulaire, etc.) et ne pas marquer comme préchargée une URL sautée, pour la rattraper au retour du Wi-Fi.
- Épinglage disque des médias d'une story vue jusqu'à expiresAt (ou création + 20 h) dans les stores vidéo, audio et images, avec auto-purge des pins échus ; dépinglage sans suppression à la purge de la story.
- Routage du type effectif d'un média : extension d'URL reconnue d'abord, sinon type déclaré, sinon image (StoryMediaStoreRouter.effectiveKind).
- Dédoublonnage par session des URLs déjà préchargées (claimUnprefetchedURLs) et ciblage pin = même résolution de type que le préchargement.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+MediaPreload.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryMediaStoreRouter.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModelRules.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPrefetchPlanner.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheStore.kt`

### Savoir si une story fait du bruit, entendre la bonne langue parlée et voir ses sons posés comme des pastilles

`srp-model-audio-rules` · Android : **partielle** · P1 · effort M

StoryAudioAvailability est la source unique de « cette story est-elle audible », qui décide si le bouton de son du lecteur apparaît : vrai pour une note vocale, un fond sonore à volume non nul, un lecteur audio à volume non nul, ou une vidéo à volume non nul qui porte une vraie piste audio (sondée) ; une vidéo muette ou sans piste ne compte pas. needsSoundButton ne garde le baffle que pour ce que la note de crédit du fond ne dit pas. StoryAudioTranscript résout, pour la chaîne de langues du Prisme, quelle transcription afficher (repli sur la première entrée, langue réellement parlée) et quelle variante audio jouer (nil si aucune, la piste d'origine continue) via la descente commune PrismTranslationResolver. StoryEffects+AudioResolution choisit le fond audio : premier audioPlayerObject isBackground, sinon synthèse du legacy backgroundAudioId / Volume / Start / End (qui ROGNENT la source, ce ne sont pas des bornes sur le plan). SceneAudioStageRule affiche sur la scène les sons de premier plan (jamais le fond) sous forme de pastille capsule. Les objets sons portent waveform, variantes TTS (StoryAudioVariant), volume et mémento de mute.

Écarts :
- Pas de bouton de son dans le lecteur : muted = false est codé en dur, aucune règle d'audibilité (hasAudibleSound, needsSoundButton) ni sonde de piste audio des vidéos.
- La résolution audio du lecteur (resolveAudioTrack) cherche isBackground ou non mais pas : la synthèse legacy avec rognage de source (backgroundAudioStart/End), le fond multi-variantes, le ducking du fond quand un son de premier plan joue.
- Note vocale (voiceAttachmentId) et transcriptions (voiceTranscriptions) : modèles présents mais aucun affichage ; ajouter StoryAudioTranscript (langues disponibles triées, transcription selon le Prisme avec repli sur la première, variante audio selon le Prisme sinon la piste d'origine).
- Champs manquants sur les objets sons : mediaURL hydraté (nécessaire à l'export), mutedVolumeMemento. Volume 0 = muet persistant (voir srp-model-media-objects).
- SceneAudioStageRule : pastille capsule à l'écran pour les sons de premier plan (jamais le fond) ; AudioTrackSurface du SDK UI Android est réutilisable pour la lecture.

Rendu : Bouton haut-parleur (barré quand coupé) dans le rail du lecteur, visible seulement si la story est audible. Pastille capsule à la position posée par l'auteur pour chaque son de premier plan.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioAvailability.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioPlayerObject.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioTranscript.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioVariant.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryBackgroundAudioEntry.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryVoiceTranscription.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+AudioResolution.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/SceneAudioStageRule.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Placer, rogner, découper et animer photos et vidéos d'une story comme sur iOS (volume, mute mémorisé, keyframes)

`srp-model-media-objects` · Android : **partielle** · P1 · effort M

StoryMediaObject décrit un média posé sur la scène : référence PostMedia, URL, type (image / vidéo), position normalisée, échelle, rotation, volume 0..1 avec mutedVolumeMemento (volume == 0 EST l'état muet persistant, le mémento restaure le niveau à la réactivation), ratio mesuré, ancre, durée native, fond, boucle, z-order, fenêtre de temps avec fondus, bornes de lecture dans la source (sourceStart / sourceEnd), rognage (MediaCropRect), langue source, nom, keyframes, ducking désactivé, filtre, ajustements d'image et thumbHash (max 100 caractères). StoryKeyframe (temps, x, y, scale, opacity, volume jusqu'à StoryVolume.maxGain, easing) s'interpole entre points avec StoryEasing (linear, easeIn, easeOut, easeInOut). StoryVolumeCarrying fixe la convention un seul bouton de mute commune au composer, à la timeline, au lecteur et à l'export.

Écarts :
- Champs absents de StoryMediaObject : mutedVolumeMemento, measuredAspectRatio (aspect mesuré vs aspectRatio résolu avec défaut 1,0), name, isDuckingDisabled, filter (par média), adjustments (ImageAdjustments), thumbHash.
- Convention de volume : volume == 0 est l'état muet persistant, sans booléen séparé ; toggle un-bouton avec mémento (restaure le mémento, 1,0 en dernier recours) ; invariant mutedVolumeMemento != null implique volume == 0. À partager entre média et audio (StoryVolumeCarrying).
- StoryKeyframe : ajouter le canal volume (0..StoryVolume.maxGain) aux points x, y, scale, opacity, easing ; l'interpolation ignore les canaux nuls.
- Rognage et fenêtre de source existent (StoryMediaCrop, StorySourceWindow) : garder la parité de rendu. StoryEasing existe déjà.
- Décodeur tolérant : un média d'un type inconnu (version plus récente) ne doit pas faire échouer le document.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryMediaObject.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryKeyframe.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEasing.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryVolumeCarrying.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryMediaKind.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeInterpolator.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`

### Explorer les langues du texte d'une story, sans doublon de légende et sans confondre « fr » et « fr-FR »

`srp-model-prisme-text-availability` · Android : **partielle** · P1 · effort S

StoryTextLanguageAvailability est la source unique des langues dans lesquelles le TEXTE d'une story est lisible, donc des drapeaux proposés à l'exploration : textes du canvas (chacun avec sourceLanguage et traductions) ET légende du post. Avant 2026-07-25 seule la légende comptait, et une story faite uniquement de texte sur le canvas n'offrait aucune langue. Les codes sont normalisés en base ISO 639-1 (fr-FR, FR et fr donnent une seule entrée). StoryPrismeMatch fait la comparaison tolérante (casse et région), alignée sur la même normalisation que l'aperçu de liste. StoryDerivedContent dit si le content d'une story est une LÉGENDE ou un simple INDEX de recherche dérivé de ses objets texte (la passerelle l'écrit par concaténation et expose isContentDerivedFromTextObjects) : le lecteur ne doit pas afficher en légende un texte déjà rendu sur le canvas.

Écarts :
- Les langues disponibles (légende plus textes du canvas) sont déjà calculées dans StoryViewerViewModel.availableLanguagesFor, mais dédoublonnées par distinctBy lowercase seulement : fr-FR et fr donnent deux entrées. Normaliser en code de base ISO 639-1 (alias de MeeshyUser.normalizeLanguageForDedup).
- Comparaison tolérante StoryPrismeMatch pour la résolution de traduction (« en-US » préféré contre clé « en », « FR » contre « fr ») : sans elle, un texte d'une autre personne reste dans la langue de l'auteur.
- StoryDerivedContent : lire isContentDerivedFromTextObjects (serveur) et ne pas rendre content en légende quand il n'est que l'index des objets texte (aujourd'hui le texte du canvas s'affiche deux fois). Extraire la règle dans un objet pur testé, hors du ViewModel.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTextLanguageAvailability.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryPrismeMatch.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryDerivedContent.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`

### Voir toute scène en 9:16, média ajusté sans rognage avec des bandes floutées, et un fond coloré ou dégradé

`srp-model-scene-shape-framing` · Android : **partielle** · P1 · effort M

SceneShape fixe la loi de forme : UNE scène a UNE forme 9:16 et UNE carte. Le média se pose dans le 9:16 sans être rogné (mediaBand : un panorama occupe une bande au milieu, un portrait remplit la hauteur). Ce qu'on MONTRE est binaire (frame) : si rien ne sort de la zone du média, on resserre sur elle (mediaBand) ; si quelque chose en sort, les bandes sont une surface composée et on garde le 9:16 entier (wholeScene). Le fond des bandes est un backdrop (noir, couleur dominante du ThumbHash, ou ThumbHash étiré) ; carte à coins 22 en fil, 0 en immersif. StoryLetterboxFill dérive des bandes laissées par un média AJUSTÉ et les peint avec le ThumbHash du média (quelques dizaines d'octets, décodage < 1 ms). StoryBackgroundFraming dit que nil n'est qu'un ALIAS de « remplir » : une composition neuve écrit « fit », une story déjà publiée garde son cadrage, le double-tap cycle ajusté ↔ rempli. StoryBackgroundTransform porte scale, offsetX, offsetY, rotation, videoFitMode et backdrop. StoryBackgroundValue : couleur unie « RRGGBB » ou « gradient:RRGGBB:RRGGBB » (parse tolérant). StoryCanvasAspect : portrait 9:16 par défaut, paysage 16:9 quand l'image de fond est plus large que haute.

Écarts :
- StoryBackgroundValue (hex et gradient) est déjà porté. Le lecteur Android remplit toujours (ContentScale.Crop) : aucun mode ajusté (fit), donc un média 16:9 est rogné au lieu d'occuper une bande centrale.
- Porter SceneShape : aspect 9/16, mediaBand(backgroundAspect), frame (mediaBand ou wholeScene selon que des objets sortent de la zone du média), Backdrop (black, thumbHashDominantColor, thumbHash), cardedCornerRadius 22 / immersiveCornerRadius 0, layout(in viewport, immersive), objectPadding 0,16, bandes top 0,12 / bottom 0,88.
- Porter StoryLetterboxFill (épaisseur d'une bande, seuil sous lequel c'est un artefact d'arrondi) et peindre les bandes avec le ThumbHash (ThumbHashPainter existe côté SDK UI).
- StoryBackgroundTransform : ajouter videoFitMode (« fit » / « fill », nil = remplir) et backdrop (valeur brute de StoryBackdrop, nil = flou du média). Cycle du double-tap fit ↔ fill ; ingestion qui écrit « fit » pour une composition neuve sans recadrer l'existant.
- StoryCanvasAspect : portrait / paysage selon l'image de fond importée, ratio persisté dans effects.canvasAspectRatio ; décision pure from(width, height) et from(ratio).

Rendu : Scène 9:16 figée. Un média 16:9 ajusté laisse deux bandes symétriques en haut et en bas, peintes avec le ThumbHash du média étiré (flou naturel, sans filtre). Coins 22 dp en carte dans le fil, 0 en plein écran immersif.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Story/SceneShape.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/StoryLetterboxFill.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/StoryBackgroundFraming.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryBackgroundTransform.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryBackgroundValue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryCanvasAspect.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryBackgroundValue.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundFraming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Animer un sticker en boucle (battement, rebond, spin…) de façon identique au lecteur et à l'export

`srp-model-sticker-animation-object` · Android : **partielle** · P1 · effort S

StickerAnimation (pulse, heartbeat, wobble, bounce, float, spin, blink, shake, swing, pop, tada) est une fonction PURE du temps qui rend une pose (échelle, rotation, décalage, opacité) : même résultat dans la story, le post embarqué, le réel et l'export, car l'export rasterise image par image en ignorant le moteur d'animation. Chaque animation a sa période (de 0,6 s pour pop à 4,0 s pour spin) ; pop et tada sont à rendez-vous unique. StorySticker porte, au-delà de l'emoji et de l'image : templateId, slots figés, animation (nom inconnu décodé en nil, jamais un plantage), langue source, posedScale 2,2 (échelle d'un glyphe nu), provider de provenance, kind résolu par rang (gabarit, puis image, puis emoji), wireEmoji (repli pour un lecteur ancien) et imageFallbackEmoji 🖼️.

Écarts :
- StorySticker Android a emoji, postMediaId, provider, transform, timing : il manque templateId, slots, animation et sourceLanguage. Un sticker publié avec ces champs perdrait l'information au réencodage.
- StickerAnimation : 11 cas avec périodes (pulse 1,4 ; heartbeat 1,1 ; wobble 1,6 ; bounce 1,2 ; float 3,0 ; spin 4,0 ; blink 1,2 ; shake 0,8 ; swing 2,2 ; pop 0,6 ; tada 0,9), fonction pose(at t) pure (échelle, rotation, décalage, opacité), décodage tolérant, boucle sauf pop et tada.
- Appliquer la pose dans le lecteur Compose (graphicsLayer) et dans l'export, depuis la même fonction.
- Rang de rendu : gabarit puis image puis emoji ; wireEmoji et repli 🖼️ pour un sticker image dont le média manque ; posedScale 2,2 à la pose d'un emoji nu.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StickerAnimation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StorySticker.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### Retrouver sur Android les 18 polices de texte, les cadres (bulle, nuage, losange…), les effets et les poids d'une story iOS

`srp-model-text-objects` · Android : **partielle** · P1 · effort M

StoryTextObject porte texte, position normalisée, échelle, rotation, ancre, taille en design-pixels (référentiel 1080, 96 par défaut), police, style, couleur, alignement, fond (aucun, plein, verre), cadre (none, rounded, pill, rectangle, diamond, cloud, speech) avec marge, liseré et couleur de liseré, contour du texte, effet par-dessus la police (25 effets), traductions par langue, langue source, fenêtre de temps avec fondus, verrou, keyframes, nom et référence utilisateur (badge de mention). Les 18 styles (bold, neon, typewriter, handwriting, classic, calligraphy, cartoon, futuristic, fantasy, curve, tag, italic, retro, elegant, poster, bubble, note, brush) associent une police et un poids (fontWeight). Les 25 effets (lueur, néon, or, feu, halo, contours, ombres, relief, écho, fantôme) sont des ombres paramétrées. StoryTextPosition fournit centre, haut, bas.

Écarts :
- StoryTextStyle Android n'a que 5 valeurs (bold, neon, typewriter, handwriting, classic) sur 18 : ajouter calligraphy, cartoon, futuristic, fantasy, curve, tag, italic, retro, elegant, poster, bubble, note, brush avec des polices équivalentes embarquées (iOS utilise des polices système : Zapfino, Papyrus, Didot, etc., absentes d'Android) et fontWeight (bold 800, neon 600…).
- Cadres de texte absents : StoryTextFrameShape (none, rounded, pill, rectangle, diamond, cloud, speech avec queue) et frameShape, framePaddingScale, frameBorderWidth, frameBorderColor sur StoryTextObject ; rendu des chemins losange, nuage, bulle BD.
- Champs manquants sur StoryTextObject : fontWeight, name, referenceUserId (badge de mention), frameShape et dérivés. StoryTextEffect Android est déjà complet (25 effets, mêmes ombres) ; vérifier la parité de rendu de aura, longShadow et echo.
- Fond de texte glass(radius) et solid : déjà modélisé (StoryTextBackgroundStyle), à confirmer au rendu.
- StoryTextPosition : constantes center (0,5 ; 0,5), top (0,5 ; 0,2), bottom (0,5 ; 0,8) à exposer.

Rendu : Le texte est dessiné dans le référentiel 1080 de design-pixels, mis à l'échelle par la largeur de la scène (taille rendue = fontSize × scale × facteur). Cadre : marge automatique égale à au moins la chasse d'un « o » (donc dépendante de la police), multipliée par framePaddingScale ; liseré blanc par défaut dès que la largeur est > 0. Contour de texte 3 dp par défaut.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryTextObject.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryTextStyle.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StoryTextEffect.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTextPosition.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTextEffect.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextObjectView.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextBackground.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextEffectShadow.kt`

### Répondre en privé à une humeur depuis la conversation directe avec son auteur

`srp-mood-private-reply` · Android : **partielle** · P1 · effort M

L'envoi résout la conversation directe avec l'auteur (la dernière existante, sinon une neuve) et choisit la langue de composition selon le Prisme. Il chiffre en E2EE si une session existe avec le pair, sinon envoie en clair par la file de sortie : bulle optimiste, clientMessageId pour déduplication, rejeu au retour du réseau. Il porte storyReplyToId = id de l'humeur. StoryReplyAdmission garantit en fail-closed qu'une citation de story ou d'humeur n'est admise que dans la conversation DIRECTE dont le participant est l'auteur, jamais dans un groupe ou le DM d'un tiers.

Écarts :
- Résolveur de conversation directe (trouver la dernière DM avec userId, sinon ConversationRepository.create) : absent. StorySendTo n'envoie que vers une conversation déjà choisie.
- MoodReplySender avec la même séquence que iOS : résoudre la DM, choisir la langue de composition (Prisme), chiffrer si une session E2EE existe (branche isEncrypted = true, sans file), sinon enqueue + sendOptimistic + envoi direct avec clientMessageId. Rollback markOptimisticFailed si ni file ni envoi ne passent.
- StoryReplyAdmission.admits(storyAuthorId, conversationIsDirect, participantUserId) : fail-closed si un identifiant est absent ou vide. Appliquer cette règle à tout contexte de réponse en attente (ReplyContext / ReplyReference) avant envoi. Une citation non admissible ne transmet rien.
- Un lecteur de story ne propose pas de réponse directe (seul « Envoyer à… » existe). Prévoir le contexte de réponse en attente (équivalent de Router.pendingReplyContext) consommé à l'ouverture de la conversation.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MoodSpotlight/MoodReplySender.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryReplyAdmission.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Atterrir dans le lecteur directement sur les commentaires ou sur les vues selon la notification

`srp-notif-open-viewer-intent` · Android : **partielle** · P1 · effort S

L'intention d'une notification de story est comments, reactions ou view (nouvelle story d'un ami : simplement regarder). Pour une story active, un pont transitoire construit un StoryViewerRequest (id de l'auteur, postId exact, commentaire ciblé et parent) avec une action initiale (showCommentsOverlay pour un commentaire, showViewersSheet pour une réaction, aucune pour view). Le coordinateur racine (un seul propriétaire de l'état de présentation) présente le lecteur plein écran, la dernière navigation l'emportant, puis le pont se ferme pour que le lecteur s'anime proprement. Le container peut charger unitairement le post si le tray ne le connaît pas.

Écarts :
- Le lecteur s'ouvre par id d'AUTEUR (Routes.story(userId)) et seulement pour friend_new_story ; une réaction ou un commentaire sur la story de quelqu'un d'autre retombe sur Post(postId), sans lecteur. Il faut un lecteur adressable par id de story/post (équivalent StoryViewerRequest.postId, avec chargement unitaire si le tray l'ignore).
- Action initiale du lecteur : ouvrir automatiquement la feuille des commentaires (avec targetCommentId et targetParentCommentId pour scroller au commentaire) ou la feuille des vues, selon StoryIntent (comments, reactions, view).
- StoryNotificationContext et StoryIntent dérivés du type de notification (story_reaction, status_reaction, commentaire, nouveau contenu d'un ami) et transportés par la navigation.
- Coordinateur de présentation unique (équivalent StoryViewerCoordinator) : la dernière demande remplace la précédente ; fermeture du pont après présentation.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Stories/Notifications/StoryNotificationIntent.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryActiveBridge.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerCoordinator.swift`
- `apps/ios/Meeshy/Features/Stories/Notifications/StoryViewerInitialAction.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Le lecteur reste sur la même story quand la liste bouge, et suit la salle temps réel

`srp-position-realtime-room` · Android : **partielle** · P1 · effort S

StoryViewerPosition tient la position par identité (auteur + stories) et non par rang : insertion, tri, suppression ou expiration pendant la lecture réancrent sur la même story, ou sur la suivante / le groupe qui occupe le rang, ou ferment si plus rien. « Auteur précédent » atterrit sur sa dernière story, avec index borné. StoryPostRoomLedger n'autorise qu'une salle de publication tenue à la fois et quitte exactement celle réellement rejointe (le changement de groupe changeant les deux index dans la même transaction, l'ancienne dérivation quittait deux salles jamais tenues). StoryViewerEngagement lie salle et session d'engagement (EngagementTracker.begin / transition) au même événement « la story affichée change ».

Écarts :
- Le lecteur Android travaille sur un instantané figé de list() : il ne reçoit ni insertion (story:created), ni tri, ni marquage « vue » local qui fait avancer l'entrée de groupe ; brancher le lecteur sur le flux Room du plateau et réancrer par identité (reanchor) quand la forme change.
- Balayage périodique des stories expirées pendant que le lecteur / le plateau sont visibles (purge ~60 s) avec réancrage.
- Retours d'atterrissage : « groupe précédent » = dernière story (OK dans StoryPlayback.back) mais jumpToPreviousGroup retombe sur la première ; aligner sur previousGroupLanding et sur l'entrée « première non vue » pour le groupe suivant.

Rendu : Aucun visuel propre : la lecture ne saute jamais de story sous les doigts.

Transposition Android : Même logique pure en Kotlin (StoryPlayback.removingSlide / replacingSlide existent déjà) ; SocialSocketManager.joinPostRoom / leavePostRoom déjà utilisés par le ViewModel.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerPosition.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryPostRoomLedger.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerEngagement.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Les stories voisines sont prêtes avant qu'on y arrive, y compris entre auteurs

`srp-prefetch-window` · Android : **partielle** · P1 · effort M

Dès que la slide N est à l'écran, la fenêtre N±1 puis N±2 se prépare dans l'ordre, la voisine dans le sens du geste en tête, à travers les frontières de groupe (StoryNeighborWindow, StoryNeighborPrefetchQueue) : image décodée hors fil principal dans le cache que le canvas relit en synchrone, lecteur vidéo préparé pour N±1 seulement (pool de décodeurs borné), le reste en octets en parallèle. Idempotent par slide ; la slide qui change annule ce qui n'a pas démarré (un téléchargement parti s'achève). prefetchAllMedia couvre media, mediaObjects, audioPlayerObjects, backgroundAudio, démarre les players et sonde la piste audio des vidéos pour que le bouton son existe avant le rendu. Le pipeline (StoryReaderPrefetcher) maintient 3 canvases amorcés et pilote le minuteur gaté (onContentReady) ; le prefetch N+1 a un filet au premier tic. Les identités voisines sont pré-résolues pour l'interlude.

Écarts :
- StoryPrefetchPlanner ne réchauffe que 2 URLs d'image à l'avant (Coil enqueue) : ajouter le sens du geste (voisine arrière), l'anneau N±1/N±2 ordonné, le décodage de l'image dans le cache mémoire, et la fenêtre à travers les groupes dans les deux sens.
- Vidéo : préparer les players de N±1 seulement (pool Media3 borné) ; audio de fond / premier plan : préchargement des octets ; sonde des pistes audio des vidéos (voir srp-audio-mute-chips).
- Annulation : un changement de slide annule les préparations non démarrées (interruptNeighborWindow) sans perdre les téléchargements en cours ; idempotence par slide.
- Signal de readiness du préchargé : le minuteur ne doit compter qu'une fois le fond de la slide visible utilisable (bitmap réel / vidéo prête / couleur) et un filet au premier tic réchauffe N±1, N±2.
- Libération complète à la fermeture du lecteur (tâches annulées, players relâchés) ; pré-résolution des identités voisines pour l'interlude.

Rendu : Invisible mais mesurable : jamais de spinner sur la slide suivante ; première frame instantanée même au changement d'auteur.

Transposition Android : Task + CachedAsyncImage -> coroutines + Coil ImageLoader.execute ; AVPlayer préchargé -> ExoPlayer.prepare dans un pool de 2 ; entonnoir réseau du cache -> Dispatcher/limit Coil partagé.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Prefetch.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+PrefetchPipeline.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPrefetchPlanner.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryAutoAdvanceGate.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Les barres de progression se parcourent au doigt et la scène se redessine sous le pouce

`srp-progress-bars-scrub` · Android : **partielle** · P1 · effort M

StoryProgressBarsView dessine une capsule de 3 pt par story du groupe (fond blanc translucide, rempli blanc pour les vues, courant avec dégradé actif et halo indigo). Poser le doigt sur la rangée (zone tactile 44 pt qui remonte dans la bande de statut) fait s'effacer les segments au profit d'une piste épaisse pleine largeur de la story courante, la scène se redessine à l'instant pointé (ScenePlaybackScrubber), l'avance automatique attend et, au relâcher, le compte à rebours reprend à la fraction choisie (onSeek). VoiceOver ajuste par pas de 10 % et annonce « Story X sur Y » et le pourcentage. StoryPlaybackProgressClock isole la progression : seule la barre observe l'horloge (granularité 1/300 de largeur), le lecteur n'est jamais réévalué à 60 Hz.

Écarts :
- Android affiche SegmentedProgress (3dp, espacement 4dp, blanc 30 % / blanc) sans interaction : ajouter le parcours au doigt (piste épaisse, poignée qui suit le doigt, scène redessinée en direct, pause de l'horloge pendant le glissé, seek au relâcher).
- Zone tactile 44dp (3dp visibles + marges haute et basse) et cession des gestes de navigation / fermeture / cube pendant le parcours.
- Segment courant avec dégradé actif et halo (indigo500 à 0,6, rayon 4) ; segments précédents pleins.
- Accessibilité : élément ajustable (pas de 0,1), libellés « Story X sur Y » et « N pourcent » ; annonce du changement de slide.
- Performance : isoler la fraction dans un état lu uniquement par la barre (State dédié / lambda de lecture dans drawWithContent) pour ne pas recomposer l'écran à chaque frame ; publier au plus tous les 1/300 de largeur.

Rendu : Rangée de 3dp, espacement MeeshySpacing.xxs, capsules ; au toucher les segments disparaissent au profit d'une piste plus épaisse sur toute la largeur ; halo indigo sous le segment actif.

Transposition Android : ScenePlaybackScrubber -> contrat du moteur de rendu de scène Android (seek de l'horloge de scène) ; GeometryReader + DragGesture(0) -> pointerInput detectDragGestures avec onDragStart immédiat.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryProgressBarsView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryLiveProgressBars.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryPlaybackProgressClock.swift`
- `apps/ios/Meeshy/Features/Main/Views/SceneScrubTrack.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Publier avec ses mentions, ses textes alternatifs et le choix story, post, réel ou « aussi en réel »

`srp-publish-format-extras` · Android : **partielle** · P1 · effort M

La publication déclare au serveur ce que l'auteur a choisi : le format ciblé (story, post ou réel, qui détermine le type de POST /posts), les mentions déclarées par slide (modes hors texte, plus les badges posés sur le canevas que le serveur n'infère pas), le texte alternatif et la légende par média, l'opt-in d'extraction de bande-son (nil = défaut serveur) et « Publier AUSSI en réel » (la story part avec son réel, uniquement pour une story hors repost multi-slide, via StoryAlsoAsReelWire). Une republication transporte repostOfId. La règle unique StorySlidePublishMatter décide quelle slide mérite un post : texte réel non vide, média, sticker, lieu, dessin, son, fond choisi ou image de fond ; une coquille de texte vide ne compte pas.

Écarts :
- CreateStoryRequest ne porte que type STORY, content, storyEffects, visibility, originalLanguage, mediaIds et repostOfId : ajouter le type ciblé (POST, REEL), mentions déclarées, texte alt et légende par média, allowSoundExtraction, alsoAsReel, visibilityUserIds.
- declaredMentions : union des modes choisis (INLINE exclus, relus par le serveur) et des badges du canevas ; version par slide (mentionsBySlide) avec repli sur la liste plate.
- Règle unique carriesMatter / deservesAPost / anySlideCarriesObject à partager entre la flèche de publication et le filtre d'envoi. Aujourd'hui canPublish ignore lieu, son, fond choisi, et publishableSlides utilise un autre critère : les deux divergent.
- StoryAlsoAsReelWire.flag(requested, type, slideCount, isRepost) : n'envoyer le drapeau qu'avec une story non republiée.
- Libellés de format (story, post, réel) et copie de mise en file par format.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModelRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/StorySlidePublishMatter.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Publier hors ligne : la story est gardée, annoncée « publication au retour en ligne » et rejouée sans perte

`srp-publish-offline-queue` · Android : **partielle** · P1 · effort M

Hors connexion, le brouillon médias est copié sur disque (images en JPEG 0,85, PNG pour les stickers détourés, octets animés intacts, vidéos et audios copiés) et un intention de publication est écrite en file durable (write-ahead). Des lignes optimistes apparaissent dans le tray, avec haptique et toast « Story enregistrée — publication au retour en ligne » (variantes réel et post). Si un média n'a pu être écrit, la publication n'est pas promise : l'auteur est prévenu en nommant le média (photo, vidéo, son) et le brouillon est gardé. À la reconnexion, un exécuteur rejoue l'upload. Un exécuteur absent diffère sans consommer le budget de retry. Les échecs permanents (maxRetries, média manquant, rejet serveur) sont dits à l'utilisateur et le brouillon redevient éditable avec son erreur. Un balayage nettoie les dossiers orphelins de plus d'une heure.

Écarts :
- L'architecture outbox durable existe (PUBLISH_STORY, lane STORY, dependsOn, MediaBlobStore, ligne optimiste, échec retry/discard). Manquent le feedback de mise en file : toast « Story enregistrée — publication au retour en ligne » avec les variantes réel et post, et l'haptique de succès.
- Écriture de média raté nommée : si un média ne peut être persisté (disque plein, source disparue), ne pas promettre la publication, nommer photo / vidéo / son (strings story.publish.queue.mediaError.*) et conserver la composition en brouillon.
- Messages d'échec permanent distincts (maxRetriesReached, missingLocalMedia, unrecoverable avec raison serveur) et retour du brouillon en édition avec l'erreur, au lieu du seul bandeau générique.
- Badge « N en attente » (pendingCount) alimenté par la file, et rafraîchi à la reprise au premier plan.
- Exécuteur différable : un worker sans dépendance prête relance sans consommer le budget de retry. Balayage des dossiers de staging orphelins (> 1 h sans ligne vivante).
- Encodage des médias : JPEG 0,85 pour les fonds, PNG ou octets animés pour les stickers détourés, nom de fichier sûr (hash SHA-256 si la clé n'est pas un nom sûr).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryOfflineMediaWriter.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublishCopy.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Publication.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaBlobStore.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PublishMediaWriteBack.kt`

### Envoyer les médias d'une slide au moment de publier, compressés et sans perdre les stickers animés

`srp-publish-upload-media` · Android : **partielle** · P1 · effort M

Pour chaque slide, la publication envoie par TUS (contexte story) l'image de fond compressée avec son thumbHash, puis les médias d'avant-plan : images (thumbHash et compression), vidéos (compression avec repli sur la source et MIME video/*), audios, et images de stickers importés (PostMedia). Les octets animés d'un sticker (GIF, APNG) traversent tels quels pour ne pas aplatir un sticker animé. La progression est pondérée par slide (30 % pour le fond). L'image de fond est pré-adoptée dans le cache sous l'URL serveur pour un hit à l'ouverture. Les textes alt et légende sont rekeyés sur les ids PostMedia juste avant l'envoi.

Écarts :
- Android téléverse à la sélection (outbox UPLOAD_MEDIA plus dependsOn), non à la publication : la progression de bout en bout, pondérée par slide, n'est pas exposée.
- Compression vidéo avant upload avec repli sur la source si elle échoue (StoryVideoUploadFile.prepared : MIME video/* sinon video/mp4, isDerived pour nettoyage du fichier dérivé).
- Upload des images de stickers importés en PostMedia, avec repli de sticker conservé si l'upload échoue ; conservation des octets animés (GIF / APNG / WebP animé) pour les stickers collés.
- Calcul et envoi du thumbHash du fond et des médias d'avant-plan ; pré-adoption du fichier dans le cache image sous l'URL serveur (évite un re-téléchargement du contenu que l'auteur vient d'envoyer).
- Rekey des textes alt et légende par id d'élément du composer vers les ids PostMedia après upload.
- Contrat de sanitisation : ne jamais publier une URL file:// locale dans storyEffects (voir srp-model-story-effects-wire).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublicationUpload.swift`
- `apps/ios/Meeshy/Features/Main/Services/StoryVideoUploadFile.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaUploader.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/MediaUploadRetryPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ImageCompression.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`

### Voir ses publications de story monter l'une après l'autre avec progression, nouvel essai et annulation propres

`srp-publish-upload-queue` · Android : **partielle** · P1 · effort M

Chaque tap sur « Publier » empile une publication dans activeUploads : une seule monte à la fois, sans exclusion à la création, et l'échec de l'une ne bloque pas les suivantes. Phases : preparing (pas encore durable, jamais drainable), queued, uploading, failed. La progression par upload est coalescée (publiée si l'écart est ≥ 1 % ou après 100 ms) et purgée quand la ligne disparaît. Le succès et le rejet définitif sont annoncés avant le retrait de la ligne (crédit d'onboarding), et les toasts disent « Story publiée » ou « Échec de la publication de la story ». Un retry saute les slides déjà créées côté serveur. Une annulation supprime les slides déjà créées pour ne laisser aucun orphelin. La file se vide à la reconnexion.

Écarts :
- Aucune progression de publication : l'anneau optimiste du tray ne montre ni fraction ni phase. Ajouter une progression par publication (coalescée à 1 % ou 100 ms) et un store de progression purgé quand la ligne disparaît (retainOnly).
- Phases explicites preparing / queued / uploading / failed dans l'état de l'anneau (aujourd'hui seulement pending ou failed déduit de l'outbox).
- Annulation qui supprime côté serveur les slides déjà créées (publishedPostIds) : discardPublish retire la ligne mais ne nettoie pas les posts déjà commis. Retry qui saute les slides déjà publiées pour éviter les doublons.
- Signaux storyUploadSucceeded / storyUploadRejected (id) annoncés avant le retrait : pour créditer l'onboarding et afficher les toasts « Story publiée » / « Échec de la publication de la story ».
- Drain à la reconnexion et libération de la revendication de queue quand rien n'est commis. Message d'échec propre quand le serveur rejette définitivement (code de rejet).

Rendu : L'avatar du propriétaire dans le tray porte un anneau de progression qui monte pendant l'envoi. Un échec le remplace par un anneau rouge tappable (réessayer). La ligne « Mes stories » reprend la même progression.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+UploadState.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryUploadProgressStore.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Publication.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PendingStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/FailedStoryPublish.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoriesViewModel.kt`

### Réagir à une story par un tap ou en glissant sur une barre d'emojis, avec vol de l'emoji vers le cœur

`srp-reactions-strip-flight` · Android : **partielle** · P1 · effort S

Le tap sur le cœur ouvre la barre rapide (MeeshyQuickReactions.standard + tuile « + » vers le picker complet) à gauche du rail ; un appui long puis glissé fait survoler les tuiles (hit-test avec bande de tolérance verticale et résolution à la tuile la plus proche dans les interstices, haptique à chaque changement de survol) : relâcher sur une tuile réagit, sur « + » ouvre le picker, hors tuile la barre reste ouverte. L'emoji vole de la tuile agrandie au cœur en ~0,45 s (échelle 1,35 vers 0,5), le cœur rebondit à l'arrivée et l'overlay s'efface ~0,3 s plus tard. Optimisme : snapshot, emoji et compteur appliqués, appel POST /posts/:id/like avec l'emoji. StoryReactionRecovery trie l'échec : panne de transport (MeeshyError.network) = la réaction part dans la file durable et l'optimisme reste vrai ; refus du serveur (409 REACTION_LIMIT_REACHED, 403, 404) ou erreur locale = rollback exact. Le cœur ne s'allume que pour les réactions de CE lecteur (currentUserReactions).

Écarts :
- Échec de transport : Android rollback sur tout NetworkResult.Failure ; distinguer panne réseau (mettre la réaction dans l'Outbox durable, optimisme conservé, rejeu FIFO) du refus serveur (409 REACTION_LIMIT_REACHED, 403, 404 : rollback + retour).
- Message de refus lisible (limite de réactions atteinte, story indisponible) ; aujourd'hui aucun retour utilisateur sur le rollback.
- Propriété du glissé : le glissé horizontal né sur la barre ouverte appartient à la barre et ne doit pas changer de groupe (StoryReactionStripGesture) ; la barre ne doit pas non plus déclencher le plein écran.
- Seed de l'état courant : rail contour 'réaction déjà faite' avec la couleur d'accent de l'auteur ; compteur de réactions et emoji propres affichés après réconciliation.
- Garde « swipe-away » : une réaction envoyée juste avant un changement de story ne doit pas rembobiner l'état d'une autre slide (rollback ciblé sur la story d'origine).

Rendu : Barre pilule flottante (chrome partagé avec la barre de langues), glyphes 22pt, tuile « + » cercle 32pt ; vol < 1 s, rebond du cœur à l'impact (scale 1,35) ; haptique à chaque survol.

Transposition Android : OfflineQueue iOS -> OutboxRepository / OutboxFlushWorker (lane dédiée) ; FullscreenReactionStrip -> EmojiQuickStrip (sdk-ui, déjà utilisé) ; vol -> ReactionFlightOverlay existant.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content+Reactions.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReactionFlightView.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryReactionRecovery.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryScrubSelectionResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryActionRail.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryReactionState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ScrubHitResolver.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`

### Voir le rail de stories instantanément, puis le voir se mettre à jour par delta sans stories fantômes

`srp-tray-cache-first-delta` · Android : **partielle** · P1 · effort M

Le tray lit d'abord le cache (fresh : servi tel quel ; stale : servi puis rafraîchi par un fetch delta depuis le curseur max(updatedAt) ; expired ou vide : fetch complet avec indicateur). Un pager suit pagination.nextCursor tant que hasMore, plafonné à 6 pages de 50 (300 stories). Le delta est fusionné en REMPLACEMENT (isViewed monotone) puis les tombstones du serveur (meta.deletedStoryIds) retirent les disparitions. Si les tombstones sont tronqués, on escalade vers un fetch complet plutôt que de fusionner une couverture trouée. Les stories optimistes en attente sont ré-injectées après un overwrite. Les stories mortes (supprimées, ou expirées sauf pour l'auteur qui garde ses expirées) sont purgées du tray, du cache disque et des médias épinglés. Un balayage d'expiration tourne chaque minute tant que le tray est visible. Un échec de chargement est publié (loadFailure) pour distinguer un rail vide par panne d'un rail vide faute de contenu. La projection du tray (StoryTrayProjection) donne l'état d'anneau (aucun, non lu, lu) et filtre les groupes entièrement expirés.

Écarts :
- Le cache Room est servi d'abord et le drain paginé (6 × 50) existe, mais la revalidation est toujours complète : ajouter le delta ?updatedSince (curseur max(updatedAt) du cache), la fusion monotone, l'escalade vers fetch complet quand les tombstones sont tronqués, et la lecture de meta.deletedStoryIds.
- Purge des stories mortes : expiration locale (le serveur ne balaye qu'une fois par heure), exception de l'auteur qui garde ses stories expirées, retrait d'un groupe vidé. Balayage d'expiration périodique (1 min) tant que le tray est visible.
- Ré-injection des stories optimistes en attente après un overwrite serveur, pour ne pas faire disparaître l'anneau de l'auteur pendant un refetch.
- Expiration par défaut divergente : Android applique 21 h (STORY_DEFAULT_TTL_HOURS) alors qu'iOS applique 20 h (StoryItem.defaultExpiryInterval, SSOT serveur ephemeralPosts.ts). Aligner à 20 h.
- État d'échec de chargement publié (loadFailure) pour distinguer panne et rail vide ; reprise sur retry.
- Clé de cache versionnée (recent_tray_v2) pour invalider un cache sans les champs visibilité et compteurs ; tri : auteur d'abord, non vus avant vus, puis plus récent.

Rendu : Aucun spinner si le cache contient des stories ; squelette seulement au démarrage à froid. Un rail vide par panne affiche un état d'erreur retry, distinct de l'état « aucune story ».

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryTrayProjection.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+TrayRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTrayPurge.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryGrouping.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoriesViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTrayReducer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`

### Voir le rail et les compteurs de stories se mettre à jour en direct, et se rattraper après une coupure

`srp-tray-realtime-sync` · Android : **partielle** · P1 · effort M

Le tray s'abonne au socket social une seule fois (une seconde souscription compterait les deltas ±1 en double). Il traite : story:created (nouvelle story), story:viewed (viewCount autoritatif, re-tri quand le dernier non-vu est consommé), story:updated (fusion, reset d'engagement qui rallume l'anneau sauf pour l'auteur), story:translation-updated (par objet texte) et post:translation-updated (légende) pour le Prisme temps réel, story:deleted (même chemin de purge que les tombstones), comment:added / comment:deleted (compteur autoritatif), post:reaction-sync (deltas ±1 avec présence de l'emoji du viewer). À la reconnexion sociale, le tray se rattrape par un delta, car des stories ont pu être créées ou supprimées pendant la coupure.

Écarts :
- SocialSocketManager expose storyCreated et storyViewed mais aucun consommateur dans feature/stories ni app : la nouvelle story d'un ami n'apparaît qu'au prochain refresh, et le compteur de vues de l'auteur ne bouge pas.
- Pas de rattrapage à la reconnexion sociale (delta du tray au didReconnect).
- Compteurs temps réel : comment:added / comment:deleted (valeur autoritative) et post:reaction-sync (deltas ±1 + currentUserReactions) mutent la story en place dans le tray ; aujourd'hui le compteur de commentaires revient à la valeur de cache à chaque changement de slide.
- story:viewed : viewCount autoritatif, re-tri du groupe quand hasUnviewed change. story:updated avec reset d'engagement : rallumer l'anneau sauf pour l'auteur (son état « vu » est client-only).
- Abonnement unique et idempotent (garde contre un second appel du .task racine) ; handlers enveloppés en try/catch.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+TrayRules.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoriesViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryUpdateMerge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTranslationMerge.kt`

### Une publication en cours s'affiche sur mon avatar avec sa progression, son attente ou son échec

`srp-tray-upload-ring` · Android : **partielle** · P1 · effort M

StoryUploadOverlay recouvre l'avatar « Moi » pendant un envoi : miniature de la story (cercle, atténuée), anneau de 3 pt dont l'arc dégradé de marque progresse avec le pourcentage au centre (animation linéaire 0,3 s), icône d'avertissement et anneau d'erreur en cas d'échec, et pastille « +N » pour les autres envois empilés. StoryUploadPresentation.surfaced met en avant un échec en priorité (il porte la seule action utile) sinon la tête de file ; statusTitle fournit « Publication en cours… », « En attente » ou « Échec de la publication » (partagé avec la ligne de Mes stories) et le libellé VoiceOver n'ajoute le pourcentage qu'à un transfert réellement en vol, avec « %lld autre(s) en attente ».

Écarts :
- Android montre les échecs dans une bande au-dessus du plateau (Réessayer / Supprimer) et une story optimiste durable ; il manque l'anneau de progression sur l'avatar « Moi » (miniature, arc dégradé, pourcentage).
- Phases : préparation / en attente (« En attente »), en cours (« Publication en cours… » + pourcentage), échec (« Échec de la publication », anneau d'erreur + icône) ; progression réelle par upload (TUS) exposée par l'Outbox.
- Pastille « +N » pour les envois empilés ; règle de mise en avant : un échec prime sur la tête de file.
- Libellé d'accessibilité : statut + pourcentage seulement pour un transfert en vol + « N autre(s) en attente » ; action de relance depuis l'anneau d'échec.
- Partager statusTitle et le libellé a11y avec la ligne de l'écran Mes stories.

Rendu : Disque 50 pt autour de la miniature à 0,5 d'opacité, anneau 3 pt (fond blanc 0,2, arc dégradé de marque, caps ronds), pourcentage 12pt bold blanc, pastille « +N » 18 pt en indigo600 en bas à droite.

Transposition Android : StoryUploadProgressStore -> flux de progression de l'Outbox / WorkManager (setProgress) ; anneau -> Canvas drawArc avec sweepGradient.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryUploadPresentation.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PendingStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/FailedStoryPublish.kt`

### Retrouver le dernier mode d'audience choisi et pouvoir changer la visibilité d'une story publiée

`srp-visibility-memory-and-edit` · Android : **partielle** · P1 · effort M

Le composer s'ouvre sur le dernier mode d'audience retenu (défaut PUBLIC, la publication naît publique). Les modes qui exigent une sélection d'utilisateurs (EXCEPT, ONLY) ne sont jamais mémorisés : les restaurer publierait vers personne. Une valeur corrompue retombe sur le défaut. Le menu « Modifier la visibilité » de « Mes stories » écrit la valeur en local d'abord (la coche bouge tout de suite), appelle le serveur, puis restaure l'état exact d'avant si l'appel échoue. L'écriture mémoire n'a lieu qu'à la création, jamais à l'édition d'une story existante.

Écarts :
- Le composer connaît quatre modes (PUBLIC, FRIENDS, COMMUNITY, PRIVATE) mais pas EXCEPT ni ONLY avec sélecteur d'utilisateurs (visibilityUserIds absent de CreateStoryRequest).
- Mémoire du dernier mode : StoryVisibilityPreferenceStore (DataStore, suite injectable pour les tests), isRememberable(mode) faux pour les modes à sélection, fallback PUBLIC ; l'écriture se fait au hand-off de création uniquement.
- Mutation de visibilité d'une story publiée avec update optimiste en place (visibility et visibilityUserIds), appel PATCH, rollback exact sur échec ; menu « Modifier la visibilité » dans « Mes stories » avec coche sur le mode courant.
- Libellés des modes à sélection et picker d'utilisateurs, aligné sur le composer de posts.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StoryVisibilityPreferenceStore.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+Viewing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/feature/stories/src/main/res/values/strings.xml`

### Régler exposition, contraste, flou, vignette, grain… sur une photo posée sur la scène, en plus des 8 filtres

`srp-model-image-adjustments-filters` · Android : **partielle** · P2 · effort M

Les 8 filtres de slide (vintage, bw, warm, cool, dramatic, vivid, fade, chrome) sont des préréglages. ImageAdjustments décrit en plus des réglages tonaux et colorimétriques non destructifs, énumérés par AdjustmentKind (exposition, luminosité, contraste, saturation, vibrance, température, netteté, flou, vignette, bloom, grain), qui pilotent les panneaux de réglage (éditeur d'avatar plein écran et éditeur de scène en place) sans toucher à une vue. L'objet média porte ses ajustements. Le rendu est fait ailleurs (ImageFilterEngine, MeeshyUI).

Écarts :
- StoryFilter (8 préréglages) et StoryFilterMatrix existent déjà. Absent : ImageAdjustments, AdjustmentKind (11 réglages) et leur sérialisation dans StoryMediaObject.adjustments.
- Rendu des réglages : ColorMatrix pour exposition, luminosité, contraste, saturation, température ; RenderEffect / shader AGSL pour netteté, flou, vignette, bloom, grain ; défauts et bornes identiques à iOS (catégorie tonale ou effet, réglages à milieu centré).
- Panneaux de réglage (icônes, curseurs) réutilisables pour un avatar et pour un média de scène.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/ImageAdjustments.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryFilter.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Les gestes de navigation et d'engagement alimentent la télémétrie sociale

`srp-navigation-telemetry` · Android : **partielle** · P2 · effort S

StoryNavigationTelemetry transforme chaque geste en événements du catalogue social v2 : tap suivant (tap_forward) accompagné d'un signal négatif quick_skip quand la vue a été très courte, tap précédent (tap_back), sortie avant la fin (exit_before_end, absente si on est à 97 % de la dernière slide), avec position (storyId, slideIndex, slideCount, fraction, durée). Rien n'est émis en mode aperçu. EngagementTracker ouvre une session par story affichée (surface storyViewer), pousse le temps de visionnage vidéo, enregistre l'action « commenté », et les impressions de plateau sont comptées par lot (flushRail à la disparition du plateau).

Écarts :
- Android enregistre le dwell (viewPost avec dwellMs) mais aucun événement SocialEventV2 : porter le catalogue (SocialStoryEvent.Action tap_forward / tap_back / exit_before_end, SocialNegative.quickSkip) et un reporter.
- Position de télémétrie : storyId, slideIndex, slideCount, fraction de progression, durée en secondes ; fraction >= 0,97 = fin ; ne rien émettre en aperçu.
- Impressions du plateau : compter chaque anneau apparu une fois par montage et envoyer par lot à la disparition du plateau.
- Respecter le consentement analytics existant (allowAnalytics) ; action « commenté » enregistrée à l'envoi d'un commentaire.

Rendu : Aucun visuel.

Transposition Android : SocialEventsV2Reporter -> reporter Android (WorkManager / file locale) ; EngagementTracker déjà proche de EngagementSessions côté Android.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Navigation.swift`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerEngagement.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Voir plusieurs scènes d'un post en mosaïque (vague, héros, défilement, sinusoïde) ou en carrousel, avec « +n »

`srp-model-mosaic-layout` · Android : **complète** · P2 · effort S

MosaicLayout est la loi pure qui dispose les visuels d'une publication (médias joints ou scènes du canvas, c'est la même chose) : plafond de 4 tuiles visibles avec « +n » sur la dernière, cadres normalisés pour cinq modes (wave, hero, reel, sine, carousel : le seul mode paginé et le défaut), gouttière 0,014, ratio d'aspect par mode, garde du plus petit appareil (375), nombre de mots de légende selon le mode (légende complète en carrousel et reel, 8 mots sinon) et quelle tuile porte la légende. Le mode est une décision d'AUTEUR (storyEffects.layout) pour que deux lecteurs voient la même mise en page.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Story/MosaicLayout.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MosaicLayoutMode.kt`

### Garder une slide à l'écran le temps juste : 6 s, plus si le texte est long, ou la durée du média

`srp-model-slide-duration` · Android : **complète** · P2 · effort S

Source unique de la durée d'une slide (spec 2026-05-28) : la durée d'auteur épinglée dans la timeline l'emporte ; sinon un fond vidéo ou audio impose sa durée (en boucle jusqu'à au moins 6 s : ceil(6/durée) × durée) ; sinon un texte long (cumul de plus de 30 mots) donne 6 s plus (mots − 30) / 6 secondes ; sinon 6 s. La valeur persistée effects.slideDuration est IGNORÉE (les anciennes stories portent des valeurs arbitraires comme 12 s). La règle cœur est partagée avec TimelineProject pour le recalcul en direct.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+ContentDuration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+ContentDuration.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySlideDuration.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryDurationPin.kt`

### Ouvrir et fermer une slide par fondu, zoom, glissement ou révélation, et enchaîner deux clips par crossfade ou dissolve

`srp-model-transitions` · Android : **complète** · P2 · effort S

StoryTransitionEffect (fade, zoom, slide, reveal) décrit l'entrée et la sortie inter-slides ; les constantes de rendu (durée, échelle de zoom 1,08 qui dézoome à l'entrée, fraction de glissement horizontal) vivent sur le renderer, lues à l'identique par l'aperçu, le lecteur et l'export. StoryClipTransition lie deux clips contigus d'une même slide avec un type (StoryTransitionKind : crossfade, dissolve), une durée et une courbe StoryEasing optionnelle, distincte de la transition inter-slides.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTransitionEffect.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryTransitionKind.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryClipTransition.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`

