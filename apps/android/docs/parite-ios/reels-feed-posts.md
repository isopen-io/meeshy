# Parité iOS → Android : `reels-feed-posts`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**100 features iOS** : 38 absentes, 58 partielles, 3 divergentes, 1 complètes sur Android. **51 lots** planifiés (≈50520 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**reels-feed-posts#1** (couverture Android estimée ≈ 27 %)

Cette partie couvre la couche sociale d'iOS : le lecteur de réels plein écran (pager vertical, élection de lecture dès le geste, préchargement N±2..N±10, vidéo / image / audio / scène composée, rail d'actions avec palette de réactions, mode immersif), le fil (carte réel plein cadre avec autoplay élu par le viewport, cartes de post avec Prisme, médias inline, scènes composées en mosaïque, carte de position, proximité), le détail d'un post, les commentaires (feuille cache-first, temps réel, réponses en fil, médias joints, citation de média, édition, modération, glisser pour répondre, commentaires non envoyés relançables), le composer de post et le composer audio (transcription sur appareil, rognage, son emprunté), les favoris, les messages étoilés, les résultats par hashtag, la liste des vues et la célébration de succès. Côté Android, la base est réelle mais étroite : FeedScreen (cartes à images seules, placeholder pour les réels), PostDetailScreen, PostCommentsSection (fils, like, mentions, traduction par commentaire), BookmarksScreen, NearbyScreen (liste seule), FeedComposerSheet, ReelsScreen (pager de réels vidéo uniquement, muet par défaut, commentaires en feuille) et un like/favori passant par l'outbox durable. Tout le reste est absent ou à reprendre : aucun lecteur de scène pour les posts composés, aucun réel image/audio/scène, aucune vidéo/audio/document inline dans le fil, aucun texte riche (mentions, hashtags, liens suivis), aucune palette de réactions, aucun média ni édition ni menu de modération sur les commentaires, aucun ciblage de commentaire par notification, aucune carte, aucun composer audio. Chantiers structurants : un moteur vidéo mutualisé (pool ExoPlayer + préchargement) et un lecteur de scène de post (réutilisant le rendu des stories), dont dépendent réels, fil et détail.

**reels-feed-posts#2** (couverture Android estimée ≈ 35 %)

Cette partie couvre le coeur « social » d'iOS autour du fil, des posts, des commentaires, des reels et des humeurs. Côté iOS, tout est cache-first : le fil se lit depuis `CacheCoordinator.feed` (SWR), se complète en temps réel par FeedSocketHandler (GRDB) et se publie via une outbox durable (TUS, annulation, reprise de brouillon, bouton « Réessayer »). Les commentaires partent en optimiste, avec médias, citation de média, brouillon persistant, caméra, repli du composeur et réaction cœur par socket avec repli REST. Les posts ont une feuille d'édition complète (audience, langue, type POST/RÉEL, média retiré, lieu, mosaïque) et une modération « Retirer / Rendre privé » avec motif. S'y ajoutent les reels (pager, fenêtre de préchargement adaptative, ordre stable), les moods (barre + bulle de pensée audio + réponse), la découverte (À proximité en 4 modes, hashtags, hub de découverte), la télémétrie d'engagement v2 (`/social/events`) et toute la couche de points, séries, succès et Meesh. Android couvre environ 35 % : fil en images seules, cache mémoire, likes/bookmarks par outbox, statuts, détail de post, commentaires texte avec mentions, reels vidéo basiques, liste « À proximité », favoris locaux. Manquent le cache disque du fil, la publication hors-ligne, les posts vidéo/audio/document/scène, l'édition de post, la modération, les hashtags, les médias dans les commentaires, la télémétrie `/social/events`, le préchargement des reels, la bulle d'humeur audio et toute la gamification. Le bloc le plus lourd à porter est l'outbox de publication (CREATE_POST, COMMENT, REPOST) avec le rendu des médias riches.

## Notes transverses

LECTURE DU PLAN. 69 lots, environ 69 000 lignes Kotlin de production (hors tests), fusion des deux parties d'inventaire (les cles rfp-post-detail-screen, rfp-hashtag-results, rfp-nearby-discovery, rfp-comment-edit, rfp-comment-quote-media/rfp-comment-target-deeplink, rfp-bookmarks, rfp-starred-messages ont ete dedoublonnees). Sautes : rfp-post-detail-heart-live (complete) et les deux fichiers iOS sans comportement (FeedModels.swift, PostModels.swift). Les lois pures vont dans :core:model et se prouvent en local par ./apps/android/meeshy.sh jvm-check ; l'ecran reste mince.

1. CONTRAINTE DE MODULES. Feature -> feature est interdit (ARCHITECTURE.md). Tout ce que feed ET reels (ou stories) doivent partager descend donc en :sdk-ui / :sdk-core : lecteur de scene et rendu canvas (scene-renderer-extraction, scene-player-playback, deplaces depuis feature/stories), feuille et lignes de commentaires (comments-ui-unified, aujourd'hui dupliquees entre PostCommentsSection du feed et ReelCommentsSheet), feuille des vues (publication-viewers, deplacee depuis StoryViewersSheet), moteur video a pool (reel-player-pool), carte (place-map-and-fullscreen). Les lots qui deplacent du code de feature/stories (scene-renderer-extraction, publication-viewers) editent des fichiers du domaine stories : a sequencer avec les lots stories (StoryViewerScreen.kt fait deja 1113 lignes, au-dessus du plafond 1200 en croissance).

2. FICHIERS CHAUDS ET ORDRE. FeedScreen.kt (933 l.), FeedComposerSheet.kt (1127 l.) et MeeshyApp.kt (1202 l., plafond depasse) sont hors budget : on extrait AVANT d'ajouter. feed-screen-split decoupe FeedScreen en FeedPostCard + cinq fichiers-emplacements (Header, Body, MediaSlot, Actions, Footer) pour que chaque lot aval possede SON fichier ; composer-sheet-v2 fait le meme travail sur le composer. FeedViewModel.kt (747 l.) : chaque lot y ajoute un collaborateur injecte + une ligne de cablage, jamais de logique en ligne ; ordre impose par depends_on : feed-room-cache-and-realtime, feed-engagement-bar, feed-card-header-and-menu, post-translation-sheet-and-panel. ReelsScreen.kt/ReelsViewModel.kt : reels-thread-pager possede le ViewModel, reels-video-page-and-chrome eclate l'ecran en ReelsScreen (hote) + ReelPage + ReelPageOverlay (emplacements) ; les lots rail/overlay/pages possedent ensuite chacun un fichier. MeeshyApp.kt recoit des routes de : hashtag-results, place-map-and-fullscreen, edit-post-sheet-ui, comment-notification-target (arguments commentId/parentCommentId sur POST_DETAIL et REELS), people-discovery-hub, engagement-progress-ui, nearby-discovery : hunks courts, a integrer dans l'ordre des vagues. OutboxModel.kt/OutboxFlushWorker.kt : post-publish-outbox extrait d'abord le registre des senders en multibinding Hilt (un fichier par kind) ; repost-quote-outbox, comment-send-outbox, engagement-session-telemetry n'ajoutent ensuite que une ligne d'enum + une ligne de OutboxLaneMap + leur fichier sender. strings.xml : chaque lot ajoute un bloc commente par cle de lot a la FIN des quatre fichiers (values, -fr, -es, -pt) ; FeedStringLocalizationParityTest est module-entier, donc un lot qui oublie une locale est rouge.

3. UNE SEULE MIGRATION ROOM. feed-room-cache-and-realtime ajoute SocialCacheEntity (cle texte, payload JSON, syncedAt, curseur, hasMore) : fil, favoris, detail, commentaires (cle comments:postId), cellules A proximite s'y rangent sans autre migration (MeeshyDatabase passe de 16 a 17). La file de sessions d'engagement reutilise OutboxEntity (OutboxKind.ENGAGEMENT_SESSION, lane engagement).

4. DECISIONS A TRANCHER (issues decision-produit, a ouvrir avant la vague concernee). (a) Son des reels : iOS joue avec son, Android demarre muet ; le plan aligne sur iOS (son active, bouton de session) dans reel-player-pool/reels-video-page-and-chrome. (b) Mosaique vs carrousel : la carte du fil iOS n'a que le carrousel des 2 medias, mais EditPostSheet iOS propose encore le choix de layout ; Android a MosaicLayoutMode et FeedMediaMosaic. Le plan suit iOS pour la carte (feed-card-media-cells) et garde le sélecteur de layout dans edit-post-sheet-ui tant que la decision n'est pas prise. (c) Fournisseur de carte : aucune dependance carte dans le projet ; place-map-and-fullscreen propose MapLibre Native (Maven Central, resolvable par les conteneurs, sans cle) et une vignette statique sans reseau de tuiles dans les listes. (d) Enregistrer un reel compose = rendu video de la scene (PostSaveRoute.renderScene) : demande un exporteur (Media3 Transformer + composition hors ecran), hors lots ; reels-scene-page definit l'interface SceneVideoExporter et retombe sur le fichier brut ; ouvrir une issue de suivi.

5. RISQUES TECHNIQUES. Media3 est en 1.4.1 : DefaultPreloadManager n'existe qu'a partir de 1.5.0 ; reel-player-pool amorce par SimpleCache + CacheWriter (paliers prime/idle) ou monte la version dans le catalogue gradle/libs.versions.toml, au choix du lot, avec media3-datasource/database explicites. Aucun etat d'appel global dans sdk-core (CallViewModel vit dans :app) : la pause pendant un appel passe par le focus audio (couvre les appels systeme) + un flux CallActivity expose par :app (ext:call-activity-flow est optionnel, le focus audio suffit pour la recette). Le seuil 'un seul moteur par page' (audio, scene, video) doit passer par le pool unique, sinon la memoire derive (un ExoPlayer ne se cree plus jamais dans un composable hors pool). La gamification (engagement-progress-*) doit etre verifiee contre packages/shared/utils/engagement-progress.ts et les routes gateway avant d'ecrire l'UI. L'envoi hors ligne d'un post copie ses medias dans un dossier durable : prevoir la purge (succes, annulation, deconnexion) et le plafond disque.

6. LOIS A MIROIRS A TENIR (touche les TROIS). Prisme : legende, texte de post, transcription, piste audio TTS, commentaires, apercu de repost suivent la descente de rang (la langue d'origine concourt a SON rang, jamais de repli translations.first) ; la bande de drapeaux est projetee par PostLanguageStrip. Presence : seul le point vert/orange/gris de PresenceState ; offline = aucun point ; aucun etat local ne prolonge la presence servie. Accent : avatar sans photo = couleur deterministe d'auteur ; contexte conversation = accentColor, jamais de couleur en dur. Ordre stable des reels (ReelThreadOrder) et election de lecture (ReelPlaybackElection) sont des miroirs de lois Swift : toute evolution touche iOS et Android.

7. GATE. Les conteneurs n'atteignent pas dl.google.com : aucun lot UI n'est declare vert sans run android.yml vert (assembleDebug + testDebugUnitTest) ; les lots de lois pures se prouvent d'abord par jvm-check. Les lots 'ext:' attendus d'autres domaines : stories-tray-shared (plateau de stories monte dans le fil), sound-library (APISound, recherche, telechargement des sons), call-activity-flow (optionnel).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `comment-send-outbox` | D | P0 | L | 1700 | comments-engine-core, comments-ui-unified, post-publish-outbox, post-service-endpoints, tus-envoi-depuis-fichier-reprenable, persist-outbox-registre-senders | Un commentaire envoye apparait tout de suite et ne se perd jamais |
| `comments-engine-core` | D | P0 | L | 1800 | post-domain-models, feed-room-cache-and-realtime, post-service-endpoints, persist-room-migrations | Les commentaires se chargent instantanement et restent justes en temps reel |
| `comments-ui-unified` | D | P0 | L | 1500 | comments-engine-core, feed-screen-shell, feed-screen-split | Une seule feuille de commentaires pour le fil, les reels et le detail |
| `feed-card-body-prism` | D | P0 | M | 650 | feed-screen-split, texte-riche-rendu-et-legendes-de-media, post-domain-models, post-media-presentation | Le texte d'une carte se lit dans ma langue, avec Voir plus et liens cliquables |
| `feed-card-header-and-menu` | D | P0 | L | 1100 | feed-screen-split, post-service-endpoints, feed-engagement-bar, feed-room-cache-and-realtime | Lire qui publie et agir depuis le menu de la carte, avec retour immediat |
| `feed-card-media-cells` | D | P0 | L | 1300 | post-media-presentation, video-moteur-partage-et-montage, social-gallery, feed-screen-split, texte-riche-rendu-et-legendes-de-media | Les videos, audios, documents et carrousels d'un post s'affichent dans le fil |
| `feed-engagement-bar` | D | P0 | M | 800 | feed-screen-split, feed-room-cache-and-realtime, post-reaction-palette | Aimer, enregistrer, republier et partager avec retour instantane et chiffres lus naturellement |
| `feed-room-cache-and-realtime` | D | P0 | L | 2000 | post-domain-models, persist-room-migrations, persist-cache-policy-loadstate, persist-cache-entries-store | Le fil s'affiche instantanement hors ligne et suit le temps reel sans trou |
| `feed-screen-shell` | D | P0 | M | 800 | feed-screen-split, feed-room-cache-and-realtime, story-tray-rings-metrics-and-cells | Le fil a son en-tete repliable, ses etats clairs et ses nouveaux posts |
| `feed-screen-split` | D | P0 | S | 250 |  | Le fil est decoupe en fichiers a responsabilite unique |
| `post-detail-screen-parity` | D | P0 | L | 1500 | etats-vides-et-echecs-de-contenu, post-domain-models, post-service-endpoints, post-reaction-palette, feed-room-cache-and-realtime, feed-engagement-bar, texte-riche-rendu-et-legendes-de-media | Ouvrir un post en detail est instantane, se met a jour en direct et compte ma visite une fois |
| `post-domain-models` | D | P0 | M | 1000 |  | Les posts et commentaires gardent tout ce que le serveur envoie |
| `post-media-presentation` | D | P0 | M | 900 | post-domain-models | Le fil connait les types de medias d'un post et prechauffe les suivants |
| `post-publish-outbox` | D | P0 | L | 1500 | post-service-endpoints, post-domain-models, feed-room-cache-and-realtime, publication-contrat-post-etendu, tus-envoi-depuis-fichier-reprenable, persist-outbox-registre-senders, feed-screen-split | Un post ecrit hors ligne apparait tout de suite et part tout seul |
| `post-reaction-palette` | D | P0 | M | 450 | post-service-endpoints | Reagir a un post ou un reel avec n'importe quel emoji, d'un appui long sur le coeur |
| `post-service-endpoints` | D | P0 | M | 800 | post-domain-models | Tous les gestes sociaux ont leur appel reseau typé |
| `reel-playback-laws` | D | P0 | M | 1000 |  | Les regles de lecture d'un reel sont des lois pures testees |
| `reels-thread-pager` | D | P0 | L | 1300 | post-domain-models, post-service-endpoints, reel-playback-laws, etats-vides-et-echecs-de-contenu | Le fil de reels garde son ordre sous le doigt et accepte tous les formats |
| `reels-video-page-and-chrome` | D | P0 | L | 1300 | video-moteur-partage-et-montage, reels-thread-pager, etats-vides-et-echecs-de-contenu, feed-screen-shell | Un reel video s'ouvre avec son poster, se met en pause d'un tap et se parcourt d'un glisse |
| `social-gallery` | D | P0 | L | 1500 | video-moteur-partage-et-montage, post-domain-models | Feuilleter les medias d'un post, d'un commentaire ou d'un reel dans une galerie unique |
| `comment-attachments-and-quote` | D | P1 | L | 1900 | comment-media-publisher, comment-composer-ux, social-gallery, comment-row-rich | Joindre une photo, une video, un vocal, un fichier ou un lieu, et citer un media du post |
| `comment-composer-ux` | D | P1 | M | 800 | comments-ui-unified, comment-send-outbox | Repondre garde le commentaire en vue et la barre se replie quand je lis |
| `comment-edit-and-menu` | D | P1 | M | 850 | comments-ui-unified, comment-composer-ux, post-service-endpoints | Copier, modifier, signaler ou supprimer un commentaire depuis son menu |
| `comment-media-publisher` | D | P1 | M | 850 | comment-send-outbox, post-service-endpoints | Un commentaire avec media part en entier, ou reprend ou il s'est arrete |
| `comment-notification-target` | D | P1 | M | 600 | comments-ui-unified, comments-engine-core, comment-row-rich, post-detail-screen-parity, reels-video-page-and-chrome, socle-points-d-extension-de-l-app | Toucher une notification de commentaire ouvre le post directement sur ce commentaire |
| `comment-row-rich` | D | P1 | M | 800 | comments-ui-unified, texte-riche-rendu-et-legendes-de-media, post-domain-models, social-gallery | Lire un commentaire : auteur, humeur, effets, medias joints, reponses depliables |
| `engagement-points-live` | D | P1 | M | 900 | feed-room-cache-and-realtime, post-domain-models, feed-engagement-bar, composer-glass-shell, liste-decoupage-ecran-jetons-lentille | Je vois mes points par conversation, ma serie de jours et mes marques sur un post |
| `feed-autoplay-coordinator` | D | P1 | M | 700 | video-moteur-partage-et-montage, reel-playback-laws, feed-screen-shell, feed-screen-split | Un seul reel ou une seule scene joue dans le fil : le plus centre, en muet |
| `feed-reel-card` | D | P1 | L | 1100 | feed-autoplay-coordinator, feed-card-header-and-menu, feed-engagement-bar, reels-audio-page, lecture-prechargement-et-surface-reutilisable, place-map-and-fullscreen | Un reel dans le fil est une carte plein cadre qui s'anime |
| `hashtag-results` | D | P1 | M | 700 | post-service-endpoints, texte-riche-rendu-et-legendes-de-media, feed-card-body-prism, feed-engagement-bar, socle-points-d-extension-de-l-app | Toucher un #hashtag affiche les posts et reels qui l'emploient |
| `moderator-content-removal` | D | P1 | M | 700 | feed-card-header-and-menu, comment-edit-and-menu, post-service-endpoints | Un moderateur retire ou rend prive un contenu avec un motif que l'auteur recevra |
| `post-detail-media` | D | P1 | M | 700 | feed-card-media-cells, social-gallery, post-detail-screen-parity | Voir les medias d'un post en detail : image, video, audio, document et grille +N |
| `post-detail-scene` | D | P1 | M | 950 | post-scene-feed, post-detail-screen-parity, social-gallery | Voir la scene d'un post en entier avec ses actions visibles et son de fond controlable |
| `post-publish-states-draft` | D | P1 | M | 800 | post-publish-outbox, document-regles-et-surface-post, feed-screen-split | Le statut d'un envoi est visible : en attente, annulable, relancable, brouillon repris |
| `post-scene-feed` | D | P1 | L | 1800 | lecture-prechargement-et-surface-reutilisable, feed-autoplay-coordinator, feed-card-media-cells, post-media-presentation | Un post compose se voit dans le fil comme ses scenes, seule la plus centree joue |
| `post-translation-sheet-and-panel` | D | P1 | M | 900 | feed-screen-split, post-detail-screen-parity, feed-card-header-and-menu, feed-room-cache-and-realtime | Voir l'original, les traductions et en demander d'autres pour un post |
| `reels-action-rail-menu` | D | P1 | M | 900 | reels-video-page-and-chrome, post-reaction-palette, reels-thread-pager, post-service-endpoints | Aimer, commenter, enregistrer et republier depuis le rail du reel |
| `reels-audio-page` | D | P1 | M | 1000 | reels-video-page-and-chrome, reels-info-overlay, reel-playback-laws | Ecouter un reel audio : transcription qui suit la voix et langue de piste |
| `reels-image-page` | D | P1 | M | 600 | reels-video-page-and-chrome, social-gallery, reels-audio-page | Voir un reel de photos : image seule ou carrousel avec pastille n / N |
| `reels-info-overlay` | D | P1 | M | 850 | reels-video-page-and-chrome, texte-riche-rendu-et-legendes-de-media, reels-thread-pager, place-map-and-fullscreen, post-translation-sheet-and-panel | Lire l'auteur, la legende, le lieu et les langues d'un reel |
| `reels-instant-switch` | D | P1 | M | 700 | reels-video-page-and-chrome, video-moteur-partage-et-montage, reel-playback-laws | Passer d'un reel au suivant est fluide, sans image noire ni gel |
| `reels-scene-page` | D | P1 | M | 1000 | reels-video-page-and-chrome, lecture-prechargement-et-surface-reutilisable, reels-info-overlay | Revoir un reel compose comme sa scene, en boucle, avec son |
| `status-bubble-reply` | D | P1 | M | 650 | mood-composer-complet, analytics-detail-provenance | Toucher l'humeur d'un ami fait apparaitre une bulle de pensee, joue son vocal et propose d'y repondre |
| `audio-post-transcription` | D | P2 | M | 950 | sons-ajout-roles-et-disposition | Transcrire mon vocal sur l'appareil ou ecrire la transcription moi-meme |
| `bookmarks-screen-filter` | D | P2 | S | 300 | feed-room-cache-and-realtime, feed-reel-card, feed-engagement-bar | Mes favoris se filtrent par posts et reels et s'ouvrent depuis le cache |
| `comment-preview-swipe-effects` | D | P2 | M | 750 | comments-ui-unified, comment-row-rich, feed-screen-split | Glisser un commentaire pour y repondre et lire les trois premiers sous la carte |
| `comment-share-card` | D | P2 | L | 1700 | comment-edit-and-menu, comments-ui-unified, texte-riche-rendu-et-legendes-de-media | Transformer un commentaire ou un fil de reponses en image a partager |
| `place-map-and-fullscreen` | D | P2 | M | 1000 | feed-screen-split, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias | Voir ou un post a ete publie : pastille, carte plein ecran et carte du post |
| `publication-viewers` | D | P2 | M | 750 | feed-card-header-and-menu, reels-info-overlay, post-detail-screen-parity, post-domain-models | Savoir qui a vu mon contenu et ce que chacun en a fait |
| `repost-embed-rich` | D | P2 | M | 750 | post-domain-models, feed-autoplay-coordinator, lecture-prechargement-et-surface-reutilisable, post-translation-sheet-and-panel | Le contenu republie s'affiche en carte citee complete, reel et story compris |
| `starred-messages-parity` | D | P2 | S | 420 |  | Mes messages etoiles se retrouvent sur tous mes appareils et se retirent en un geste |

### Lots fusionnés ou retirés par l'architecture

- `content-absence-states` → `etats-vides-et-echecs-de-contenu` (merge-into) : Même loi « un contenu absent dit pourquoi ».
- `rich-post-text` → `texte-riche-rendu-et-legendes-de-media` (merge-into) : Même rendu du texte riche (mentions, hashtags, liens suivis, Voir plus).
- `reel-player-pool` → `video-moteur-partage-et-montage` (merge-into) : Un seul moteur vidéo mutualisé (ARCHITECTURE §15) ; le pool borné de 3 ExoPlayer et le cache disque rejoignent ce lot. Hérite : reel-playback-laws.
- `scene-renderer-extraction` → `canvas-scene-unique-en-lecture` (drop-duplicate) : Même extraction du rendu canvas vers :sdk-ui.
- `scene-player-playback` → `lecture-prechargement-et-surface-reutilisable` (merge-into) : Même ScenePlayer réutilisable (fil muet, détail, réel en boucle). Hérite : video-moteur-partage-et-montage.
- `composer-sheet-v2` → `document-regles-et-surface-post` (drop-duplicate) : L'ancien composer du fil est retiré au profit du composer unifié (composer-retrait-des-anciens-composers).
- `edit-post-sheet-ui` → `modifier-un-contenu-publie` (drop-duplicate) : Même modification d'un post publié, dans le composer unifié.
- `audio-post-composer` → `sons-ajout-roles-et-disposition` (drop-duplicate) : Même ajout d'un son (enregistrer / importer) dans le composer unifié.
- `audio-post-trim-and-borrowed-sound` → `sons-ajout-roles-et-disposition` (drop-duplicate) : Même son emprunté et rogné.
- `status-mood-publish-offline` → `mood-composer-complet` (merge-into) : Même humeur publiée hors ligne. Hérite : persist-outbox-kinds-social-stories.
- `composer-publication-laws` → `publication-contrat-post-etendu` (merge-into) : Mêmes lois de publication (contrat de post étendu). Hérite : post-domain-models.
- `repost-quote-outbox` → `persist-outbox-kinds-social-stories` (merge-into) : Même republication / citation hors ligne. Hérite : post-service-endpoints.
- `nearby-discovery` → `proximite-carte-et-modes` (drop-duplicate) : Même découverte À proximité (densité, épingles). Hérite : place-map-and-fullscreen.
- `engagement-progress-models` → `game-engagement-progress-model` (drop-duplicate) : Même catalogue de progression.
- `engagement-progress-ui` → `game-achievement-reveal` (drop-duplicate) : Même célébration d'un succès.
- `engagement-session-telemetry` → `analytics-detail-provenance` (merge-into) : Même session de lecture rejouable et dwell. Hérite : post-detail-screen-parity, reels-thread-pager.
- `reels-watch-telemetry` → `analytics-detail-provenance` (merge-into) : Même attribution du temps regardé d'un réel. Hérite : reels-video-page-and-chrome.
- `people-discovery-hub` → `decouverte-personnes` (drop-duplicate) : Même hub Découvrir / Demandes / Bloqués.

## Features

### Publier un post, un réel ou un mood hors-ligne : il apparaît tout de suite, part tout seul et peut être annulé ou repris

`rfp-feed-offline-publish-outbox` · Android : **absente** · P0 · effort L

La publication est durable : un post texte crée une ligne outbox `.createPost`, un post avec médias copie les fichiers puis le dispatcher téléverse chaque média en TUS avec un registre `uploadedMedia` (reprise sans renvoyer ce qui est monté, détection des fichiers disparus), puis POST /posts avec l'en-tête `X-Client-Mutation-Id` et tout le payload (visibilité, personnes, mentions, lieu, effets canvas, légendes/alt, extraction de son, transcription mobile, précision de découvrabilité, repostOfId). Un post optimiste (id = cmid) s'insère en tête du fil. L'utilisateur peut annuler l'envoi en cours (« Envoi annulé » ou « Cette publication vient de partir »), récupérer un envoi bloqué depuis plus de 60 s comme brouillon (sauf vocal) et relancer une ligne échouée depuis la pastille de synchro. À l'épuisement des essais, le post optimiste est retiré avec un toast, ou le message de limite quotidienne.

Écarts :
- Ajouter `OutboxKind.CREATE_POST` (et une lane dédiée) avec payload complet (texte, mediaPaths locaux, visibilité, visibilityUserIds, type POST/REEL/STATUS, lieu, mentions, storyEffects, captions/alts, allowSoundExtraction, discoverabilityPrecision, repostOfId, mobileTranscription, clientMutationId) : aujourd'hui `FeedViewModel.publishPost` envoie en direct et un post tapé hors-ligne est perdu (commentaire du code)
- Téléversement TUS par média avec registre des médias déjà montés (reprise sans doublon), copie des fichiers locaux dans un dossier durable, détection « fichier disparu » avec message dédié
- Insertion optimiste d'un post (id = clientMutationId, médias locaux affichés depuis l'URI) puis réconciliation quand `post:created` revient avec le même cmid
- En-tête `X-Client-Mutation-Id` sur POST /posts pour l'idempotence du rejeu
- Annulation d'une publication en attente (`cancelPendingPublication` : retirée / annulation demandée / déjà partie / échec) avec toasts « Envoi annulé » et « Cette publication vient de partir. Supprimez-la une fois publiée »
- Récupération d'une publication bloquée > 60 s comme brouillon dans le composeur (hors vocal) et suppression de la ligne remplacée
- Flux d'issue (outcome stream) : sur EXHAUSTED retirer le post optimiste et afficher le toast d'erreur ou la limite quotidienne de gestes
- Relance manuelle d'une ligne échouée/épuisée depuis la pastille de synchro (toast « Nouvelle tentative… » puis « Impossible de réessayer cette opération. »)
- Publication d'un post à scène canvas et d'un son emprunté (`createBorrowedSoundPost`, createCanvasPost)

Rendu : Le post optimiste apparaît en tête avec un état « envoi en cours » discret (opacité réduite ou micro-indicateur), un geste d'annulation (swipe ou menu « Annuler l'envoi ») et, sur échec, un bandeau de retry ; toasts courts en bas (succès vert, erreur rouge). Haptique légère au retry.

Transposition Android : OfflineQueue/OutboxDispatcher → OutboxRepository + OutboxFlushWorker (WorkManager) existants ; TusUploadManager → TusUploadRepository ; pastille de synchro → indicateur de l'écran liste de conversations/notification de synchronisation

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+Posting.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+PendingPublication.swift`
- `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher+Publications.swift`
- `apps/ios/Meeshy/Features/Main/Components/StuckPublicationRetry.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaUploader.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`

### Joindre photo, vidéo, vocal, fichier ou lieu à un commentaire et le voir dans la conversation

`rfp-comment-attachments` · Android : **absente** · P1 · effort L

Une seule entrée (CommentAttachmentIntake, #9736/#9697) pour les trois hôtes (feuille du fil et des réels, détail, story) : ce qui n'est pas un média de commentaire est refusé à la pose (haptique d'avertissement), le plafond est celui du serveur (CommentAttachmentLimit : ajoute ou remplace pour une zone à une pièce, pièces refusées faute de place), une pièce apparaît AVANT que son fichier soit lu (préparation, miniature image/première image vidéo/onde de son). La zone des pièces (CommentAttachmentsTray) monte les MÊMES tuiles que le message (vignette, retrait en coin, "Éditer" au centre, tuile de lieu) ; "Éditer" ouvre la retouche de la caméra (scène unique, CommentSceneRetouch : Terminé remplace à sa place, Abandonner retire, un son n'a pas de retouche, écriture sûre). Sélection depuis la photothèque avec pièces déjà jointes marquées et décochage qui retire de la zone, bande des récents, import de fichiers, enregistrement vocal. L'upload TUS et la création vivent dans CommentPublisher (liée au compte de l'auteur, #9743) ; le fichier local survit jusqu'à la création du commentaire ; refus -> restauration du texte et des pièces. Affichage inline (CommentMediaView : image, vidéo, audio, document ; tap = galerie).

Écarts :
- Aucun média de commentaire (ni envoi, ni affichage) : la zone de saisie du détail ne propose que le texte ; ajouter le bouton pièces, l'accueil unique CommentAttachmentIntake (types acceptés, plafond serveur, refus avec haptique) et la zone de tuiles identique à celle du message
- Upload TUS lié au compte + création du commentaire avec ids de pièces ; le fichier local survit jusqu'à la création, restauration du texte et des pièces en cas de refus
- Photothèque avec présélection/décochage, bande des récents, import de fichiers, enregistrement vocal, lieu
- Retouche d'une pièce dans l'éditeur de scène unique (Terminé/Abandonner)
- Affichage inline des médias de commentaire (image, vidéo, audio, document) et ouverture de la galerie (CommentMediaGallery)
- Garde d'envoi pendant la préparation (CommentSendGate) et traces d'envoi

Rendu : Zone de pièces au-dessus du champ (vignettes 56-72 dp, croix en coin, Éditer au centre), média inline sous le texte du commentaire arrondi, tap = plein écran.

Transposition Android : PhotosPicker -> Photo Picker ; CommentPublisher -> UploadWorker/MediaUploadQueue existants ; retouche -> éditeur de stories partagé.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentAttachmentIntake.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentComposerMedia.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet+Attachments.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentSceneRetouch.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentMediaView.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerAttachmentPolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaUploader.kt`

### Modifier mon commentaire en place, texte, effets et langue compris

`rfp-comment-edit` · Android : **absente** · P1 · effort S

beginEditComment charge le commentaire dans le composer avec TOUT ce que l'édition permet — texte, effets visuels (lueur/pulse…), flou, la langue du commentaire (la pastille s'ouvre dessus car c'est elle que l'envoi déclare, #6600) — le média existant est conservé tel quel ; le bandeau "Modification" a une croix qui revient au mode création en effaçant le texte ; l'envoi (submitCommentEdit) fait un PATCH avec remplacement optimiste EN PLACE (jamais d'insertion : même id) et retour arrière complet si le serveur refuse, l'écho comment:updated reconfirme (idempotent). Même comportement et mêmes noms dans la feuille et le détail.

Écarts :
- Aucune édition de commentaire : ajouter l'endpoint PATCH du commentaire dans PostApi, l'action du menu, le mode édition du composer (texte, effets, flou, langue déclarée) et le bandeau d'édition
- Remplacement optimiste en place + rollback complet ; l'écho socket comment:updated (déjà traité) reconfirme
- Édition depuis la feuille ET le détail avec les mêmes noms/logique (un seul ViewModel)

Rendu : Bandeau "Modification" avec croix au-dessus du champ, texte de la ligne rechargé dans le champ.

Transposition Android : Aucun.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet+CommentEdit.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+CommentEdit.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Je peux modifier mon commentaire et le voir changer tout de suite

`rfp-comment-edit` · Android : **absente** · P1 · effort S

updateComment applique l'édition en local (nouveau texte, effectFlags, réinitialisation des traductions si le texte change), envoie `PUT comments/{id}`, persiste le cache du fil et des réponses, et restaure les snapshots avec un toast « Erreur lors de la modification du commentaire » en cas d'échec. applyCommentUpdated remplace le commentaire dans la liste ou dans les réponses de son parent.

Écarts :
- Ajouter `PUT posts/{id}/comments/{commentId}` à PostApi/PostRepository (`updateComment(content, effectFlags, originalLanguage)`)
- Action « Modifier » dans le menu d'un de ses commentaires qui recharge le texte dans le composeur en mode édition
- Édition optimiste (texte, effets, vidage des traductions si le contenu change) avec snapshot/rollback et toast d'erreur
- Appliquer l'édition aussi aux réponses imbriquées et au cache
- Le handler `comment:updated` existe déjà côté Android pour l'écho temps réel : le brancher sur l'état d'édition local

Rendu : Le composeur passe en mode édition avec une bannière « Modifier le commentaire » et un bouton annuler ; le commentaire modifié affiche la mention « modifié ».

Transposition Android : menu contextuel long-press → DropdownMenu du commentaire

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel+CommentEdit.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Ajouter une photo, une vidéo ou un vocal à un commentaire et l'envoyer sans le perdre

`rfp-comment-media-upload-publisher` · Android : **absente** · P1 · effort M

CommentPublisher téléverse chaque pièce en TUS (contexte « comment », thumbHash) avec le jeton lié à l'auteur (refresh de session si expiré, refus si le compte a changé), mémorise les pièces déjà montées pour pouvoir reprendre, puis POST /posts/{id}/comments avec la liste d'attachmentIds et `X-Client-Mutation-Id`. Un échec en cours de route lève `Interrupted` avec ce qui est déjà acquis, repris par l'outbox.

Écarts :
- Composeur de commentaire avec pièces jointes (photo, vidéo, vocal) jusqu'à `MAX_POST_MEDIA`, aperçus supprimables
- Éditeur de publication `CommentPublisher` : upload TUS par pièce avec `uploadContext=comment` et thumbHash, registre des pièces acquises (`UploadedCommentMedia`) pour reprise
- Jeton lié au compte auteur : rafraîchir la session si expirée et refuser l'envoi si l'utilisateur a changé (`CommentOwnership`)
- `CreateCommentRequest` avec `attachmentIds` et `mobileTranscription`, en-tête `X-Client-Mutation-Id`, désérialisation tolérante de la réponse
- Confier à l'outbox (`entrust`) les pièces déjà montées si l'envoi direct échoue, et nettoyer les fichiers locaux après succès
- Afficher le média du commentaire (image, vidéo, audio) dans la liste et traiter `comment:media-updated`

Rendu : Zone d'aperçu au-dessus du champ avec vignettes et croix de suppression, barre d'outils (photos, caméra, vocal) à gauche du champ, bouton d'envoi à droite.

Transposition Android : TusUploadManager → TusUploadRepository ; AuthManager.refreshSession → SessionRepository.refresh

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CommentPublisher.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaUploader.kt`

### Arriver sur le commentaire d'une notification : défilement, surlignage, fil déplié

`rfp-comment-notification-target` · Android : **absente** · P1 · effort M

Une notification de like, de réponse ou de commentaire ouvre le post (ou le réel) sur le commentaire visé : PostDetailView+CommentTarget fait défiler jusqu'à l'ancre (section racine pour une réponse, dont le fil est déplié), la surligne brièvement, ne le fait qu'une fois (garde didScrollToTargetComment), relance le défilement à chaque page de commentaires qui arrive (chasse paginée bornée, 20 par page ; désarmement à l'échec ou à la fin de liste), et retombe sur le comportement "révéler les commentaires + focaliser le composer" sans cible. Dans un réel, la feuille s'ouvre seule 450 ms après l'arrivée, le temps que le disque de révélation se pose.

Écarts :
- Aucune cible de commentaire dans la navigation (arguments commentId / parentCommentId) pour détail et réels ; prévoir le deep link depuis la notification FCM
- Défilement jusqu'à l'ancre, surlignage temporaire, exécution unique, chasse paginée bornée avec désarmement
- Réponse ciblée : développer le fil du parent avant de défiler
- Réel : ouvrir la feuille de commentaires avec la cible (délai d'arrivée)

Rendu : Surlignage fugitif (fond teinté d'accent qui s'estompe) sur la ligne ciblée.

Transposition Android : ScrollViewProxy -> LazyListState ; deep link -> NavDeepLink + intent de notification.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+CommentTarget.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`

### Toucher une notification de commentaire ouvre le post directement sur ce commentaire

`rfp-comment-target-deeplink` · Android : **absente** · P1 · effort S

CommentTargetHunter charge page après page (au plus 15) les commentaires d'un post jusqu'à ce que le commentaire visé soit présent, puis le détail défile jusqu'à lui ; le même mécanisme existe pour les réponses d'un fil (`loadRepliesUntilPresent`). Il rend vrai/faux selon qu'il a trouvé la cible.

Écarts :
- Argument de navigation `commentId` (et `parentCommentId`) vers le détail de post depuis notifications et liens profonds
- Boucle de recherche paginée (max 15 pages) qui s'arrête dès que le commentaire est présent ou qu'il n'y a plus de page
- Défilement vers le commentaire ciblé avec surbrillance brève, dépliage du fil parent si la cible est une réponse
- Message discret quand le commentaire n'est plus disponible (supprimé)

Rendu : Le commentaire ciblé se met en évidence (fond accent) une seconde puis revient à la normale.

Transposition Android : push d'un lien profond → NavDeepLink avec postId/commentId

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CommentTargetHunter.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`

### Ne jamais perdre un post écrit hors ligne : brouillon repris, file d'envoi, toasts

`rfp-composer-offline-draft` · Android : **absente** · P1 · effort M

FeedView+Attachments : un post/réel resté bloqué hors ligne au-delà du seuil est RÉCUPÉRÉ comme brouillon au prochain composer vierge (jamais par-dessus ce que l'utilisateur écrit), ses médias restaurés par le même pipeline de préparation (sans re-sélection, fichier source conservé jusqu'au renvoi), la classification d'origine préservée (un POST avec média reste POST ; un réel périmé est recalculé par ReelComposition.defaultType), le renvoi remplace la ligne bloquée (clientMutationId, sans doublon à la reconnexion). Publication d'un post audio et d'un post à son emprunté avec toasts "publié", "en attente (hors ligne)", "erreur", haptiques succès/erreur.

Écarts :
- La publication d'un post n'est pas dans l'outbox (seuls LIKE/UNLIKE/BOOKMARK le sont) : ajouter un OutboxKind de création de post/réel avec pièces locales durables et clientMutationId
- Récupération au composer : brouillon repris si vierge, médias restaurés, classification préservée/recalculée, remplacement de la ligne bloquée sans doublon
- Statut "en attente" visible dans le fil pour les posts non partis (puce) avec relance, comme pour les messages
- Toasts de publication (publié / en attente hors ligne / erreur) avec haptiques

Rendu : Toast pill; puce "en attente" sur la carte non envoyée avec relance.

Transposition Android : OfflineQueue -> OutboxRepository + OutboxFlushWorker (WorkManager).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

### Chaque conversation affiche mes points et ma série de jours, qui se mettent à jour en direct

`rfp-conversation-points-streak-pill` · Android : **absente** · P1 · effort M

ConversationEngagementSnapshot (total, aujourd'hui, série de jours, jour) est tenu à jour par ConversationEngagementStore, alimenté par le socket `engagement:conversation-updated` et par l'ensemble reçu avec la conversation, en gardant le plus frais (jour puis total), ramené au jour courant (`forDay` remet à zéro les points du jour et la série si un jour a été manqué), vidé à la déconnexion et revalidable par REST. La pastille d'en-tête ConversationEngagementPill montre la flamme + « série · total » (compteur compact localisé), ou le total seul sans série ; la marque de ligne ConversationStreakMark est rendue en rouge quand une série court. Libellé VoiceOver complet (« 3 jours · Étincelles : 120 · Aujourd'hui : 10 »). EngagementGlyph superpose contour et symbole plein pour l'état « j'ai participé ».

Écarts :
- Modèle `ConversationEngagementSnapshot` (conversationId, totalPoints, todayPoints, streakDays, day) avec `forDay`, `isFresher`, `dayString` et la forme `ConversationPointsForm` (streak/total)
- Écouter `engagement:conversation-updated` et appeler `GET conversations/{id}/engagement` pour revalider
- Store `ConversationEngagementStore` : fusion du plus frais, ramené au jour courant, reset à la déconnexion
- Pastille d'en-tête (flamme + « série · total » ou total seul, compteur compact localisé, police arrondie monospace) et marque de ligne de liste (flamme rouge si série)
- Libellés d'accessibilité singulier/pluriel (« n point(s) gagné(s) dans cette conversation », « n jour(s) · Étincelles · Aujourd'hui »)
- Glyphe d'engagement à deux couches (contour accentué + symbole plein) pour l'état « j'ai participé »
- Clé de ressources localisées fr/en/es/pt

Rendu : Pastille compacte dans l'en-tête de conversation : flamme + chiffre en police arrondie semibold monospace (micro), sans fond ; total seul en textMuted quand la série est nulle ; dans la liste, flamme et série en couleur erreur (rouge) devant le total.

Transposition Android : HeaderFlameGlyph → ImageVector Material ou drawable flamme ; CompactCountLabel → NumberFormat compact

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationEngagementPill.swift`
- `apps/ios/Meeshy/Features/Main/Services/ConversationEngagementStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationEngagementSnapshot.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/EngagementGlyph.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Modifier un post publié : texte, langue, audience, lieu, format Post/Réel, médias retirés et mosaïque

`rfp-edit-post-sheet` · Android : **absente** · P1 · effort L

EditPostSheet (plein écran NavigationStack) pré-remplit le texte (5000 caractères, compteur d'avertissement sous 100), la langue du contenu (sélecteur de langues, « Auto »), l'audience (Public/Amis/… avec sélecteur de personnes pour ONLY/EXCEPT, bouton Publier bloqué tant que la liste est vide), le lieu (ajouter/retirer), les médias existants (retrait réversible par vignette) et le format POST/RÉEL (le Réel n'est choisissable que si les médias restants le qualifient, sinon verdict motivé). Une mosaïque (layout) se change pour un post sans média retiré. PostEditDraft/PostEditPayload n'envoient que les champs `known` réellement montrés à l'écran. Le bouton Publier n'est actif que s'il y a un changement valide ; l'écran ne se ferme pas pendant l'enregistrement.

Écarts :
- Créer l'écran d'édition (feuille plein écran) accessible depuis le menu « Modifier » d'un de ses posts (fil, détail, reels, profil) : aujourd'hui seul le badge « Modifié » est affiché
- Étendre `UpdatePostRequest` : `visibilityUserIds`, `originalLanguage`, `type`, `removeMediaIds`, `storyEffects`, `mediaIds`, `location` (set/remove), `mentions`, `allowSoundExtraction`, `mediaAlt`, `mediaCaption` ; n'envoyer que les champs `known` (PostEditField)
- Édition optimiste dans le fil : appliquer le texte/lieu/audience, vider les traductions, rollback sur échec, toast « Publication modifiée » / « Erreur lors de la modification »
- Audience : menu des modes + sélecteur de personnes pour ONLY/EXCEPT, validation « liste non vide »
- Sélecteur de langue du contenu (liste de langues, option Auto) et sélecteur de format POST/RÉEL avec règle `reelIsChoosable` (ReelComposition.qualifiesAsReel sur les médias restants) et message de refus
- Retrait/restauration de médias avec vignettes, légendes d'accessibilité (« Retiré », « Restaurer le média »)
- Choix de la mosaïque (MosaicLayoutMode existe côté Android) pour un post POST sans média retiré
- Compteur de caractères (5000) en avertissement sous 100 restants, bouton Publier désactivé si invalide ou inchangé, fermeture bloquée pendant l'enregistrement

Rendu : Titre « Modifier le post », champ de texte arrondi dans un conteneur inputBackground/inputBorder, lignes de réglage (Audience, Langue, Format) en capsules arrondies avec chevron, vignettes média en bande horizontale avec voile « Retiré », compteur à droite en warning sous 100. Bouton Publier à droite de la barre (spinner indigo pendant l'envoi), Annuler à gauche.

Transposition Android : sheet SwiftUI → ModalBottomSheet plein écran ou écran Compose dédié ; Menu iOS → DropdownMenu ; ProfileLanguagePickerSheet → LanguagePickerDialog existant

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostEditPayload.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PostUpdateMerge.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`

### Un seul réel ou scène joue dans le fil : le plus centré, muet, avec un bouton son

`rfp-feed-reel-autoplay` · Android : **absente** · P1 · effort M

ReelFeedAutoplayCoordinator élit LE réel (ou la scène composée) le plus centré dans le viewport du fil à partir des frames publiées par chaque carte (ReelVisibilityPreferenceKey, pas de 8 pt pour ne pas réveiller le fil), expose son id, se suspend pendant un appel (abonné à l'état d'appel même sans défilement) et préchauffe le voisin suivant (le conteneur tient le FeedPost, donc l'URL). Les cartes de repost de réel et les scènes de post/story partagent la même élection (une seule surface joue, un appel les tait toutes). La vidéo de la carte active joue en boucle muette via le moteur partagé ; le bouton son (coin haut-gauche, seul coin libre) n'apparaît que si la carte est active, possède le moteur et que la piste porte de l'audio (sonde du nombre de pistes, cache par média, mise à jour à sens unique non résolu -> résolu), bascule le son global de la session de fil avec haptique légère, et force le muet quand il faut. L'offset du fil relayé à l'en-tête n'est écrit que s'il a changé.

Écarts :
- Aucune élection par viewport : implémenter une loi pure mostCenteredReel(frames, viewportMinY, viewportMaxY) alimentée par LazyListState.layoutInfo.visibleItemsInfo, exposée en StateFlow léger lu seulement par les cartes visibles
- Suspension pendant un appel (état d'appel du Telecom) et reprise
- Autoplay muet de la vidéo de la carte active via le pool de lecteurs ; libération du moteur quand la carte perd l'élection ou sort de l'écran (garde pure shouldRelinquish unique pour onDispose et branche inactive)
- Bouton son haut-gauche : visibilité conditionnée (active + moteur possédé + piste audio présente), sonde de pistes audio mise en cache par média, état de session global, haptique
- Préchauffage du réel voisin suivant (le précédent n'est pas préchauffé)
- Réduire la fréquence de publication des frames (pas de 8 dp) et ne relayer l'offset d'en-tête que s'il change

Rendu : Bouton son en pilule de verre ronde 36 dp, glyphe haut-parleur plein/barré, marge smPlus, haptique légère au tap.

Transposition Android : PreferenceKey de frames -> onGloballyPositioned + snapshotFlow sur LazyListState ; CallManager.$callState -> flux d'état Telecom.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelFeedAutoplayCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelFeedSoundIntent.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### Toucher un #hashtag affiche tous les posts qui le portent, avec statistiques de portée

`rfp-hashtag-results` · Android : **absente** · P1 · effort M

HashtagResultsViewModel charge `GET posts/hashtag/{tag}` (20 par page, curseur), protégé par une génération contre les réponses tardives, avec like optimiste et rollback, pagination sans doublon, et un ImpressionBatcher (`source: search`, surface hashtag) qui compte les posts vus ; il retourne l'index d'un post pour le défilement. Les hashtags tendance (APIHashtag : tag + usageCount) alimentent les suggestions.

Écarts :
- Rendre les `#tags` du texte des posts/commentaires cliquables et ouvrir un écran « Hashtag » (route avec le tag)
- `GET posts/hashtag/{tag}` et `GET hashtags/trending` dans PostApi + `APIHashtag`
- ViewModel avec génération, pagination dédoublonnée, like optimiste (rollback + toast), échec silencieux sur loadMore
- Réutiliser `ImpressionBatcher` avec `source = "search"` et surface hashtag, flush à la sortie d'écran
- Écran : en-tête avec le tag, liste de cartes de posts/réels, états vide/chargement/erreur
- Suggestions de hashtags tendance (recherche ou composeur)

Rendu : En-tête « #tag » avec compte d'utilisation, liste verticale de cartes du fil, skeleton à froid, message « Aucun post pour ce hashtag ».

Transposition Android : Route.hashtag(tag) → destination Compose Navigation avec argument tag

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/HashtagResultsViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIHashtag.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`

### Un modérateur peut retirer ou rendre privé le contenu d'autrui avec un motif que l'auteur recevra

`rfp-moderator-content-removal` · Android : **absente** · P1 · effort M

ContentRemovalPolicy décide qui peut retirer : un message dans un groupe/public/global/diffusion par un admin/modérateur/créateur de la conversation ou la modération plateforme (MODERATOR, ADMIN, BIGBOSS) ; une publication (post, réel, story) ou un commentaire par la modération plateforme seulement ; jamais le sien (on le supprime). Le geste ouvre une feuille « Retirer ce post/réel/story/commentaire/message(s) » (titre pluralisé) avec un champ de motif de 3 à 500 caractères, compteur, mention « L'auteur sera prévenu du motif », bouton destructif désactivé tant que le motif est invalide. Pour une publication s'ajoute « Rendre privé ». Toast « Contenu retiré — l'auteur est prévenu ». ContentRemovalPresenter présente la feuille (medium/large, poignée) avec reprises tant qu'un autre écran est en cours de présentation.

Écarts :
- Porter `ContentRemovalPolicy` (rôles plateforme, rôles de conversation, types de conversation, longueur 3–500, `normalizedReason`) dans core/model
- Actions « Retirer » (destructive) et « Rendre privé » dans le menu des posts, réels, stories, commentaires et messages, visibles selon la politique
- Feuille de motif (ModalBottomSheet) : titre selon le type et le nombre de messages, champ multi-ligne 3 à 8 lignes, compteur en rouge au-delà de 500, mention auteur prévenu, Annuler/Retirer
- Appels réseau : `DELETE` avec motif (post, commentaire, message) et `makePrivate(postId, authorId, reason)` ; routage par `PublicationWithdrawal`
- Toast de succès adapté (« Contenu retiré — l'auteur est prévenu ») et rollback optimiste en cas d'échec
- Sélection multiple de messages : proposer « Retirer » seulement si tous les messages d'autrui sont retirables et ceux du lecteur supprimables pour tous

Rendu : Feuille avec titre en barre de navigation, question de motif en callout semibold, champ arrondi (inputBackground) 3–8 lignes, pied avec icône cloche « L'auteur sera prévenu du motif » et compteur à droite (rouge si > 500) ; bouton Retirer en rouge dans la barre, haptique moyenne.

Transposition Android : UIHostingController pageSheet + retries → ModalBottomSheet Compose directement lié à l'écran appelant

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ContentRemovalPresenter.swift`
- `apps/ios/Meeshy/Features/Main/Components/ContentRemovalReasonSheet.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContentRemovalPolicy.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostActionMenu.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`

### Réagir à un post ou un réel avec n'importe quel émoji, d'un appui long sur le cœur

`rfp-post-reaction-palette` · Android : **absente** · P1 · effort M

Décision porteur du 2026-09-02 : la palette d'émojis partout, comme sur les stories. PostReactionPalette porte l'état et le geste (pas la mise en page, l'hôte la pose : rail de réel ou barre d'actions de post) : un appui long sur le cœur (reactionPaletteTrigger) ouvre une bande d'émojis, le choix envoie addPostReaction(postId, emoji) (le serveur accepte tout émoji) avec haptique légère ; le cœur garde son propre état/compteur et un émoji autre que le cœur n'a pas d'état à réconcilier ; une action VoiceOver équivalente est offerte dans le détail (sendDetailReaction).

Écarts :
- Appui long sur le cœur (fil, détail, réel) -> bande d'émojis ancrée ; choix -> POST de réaction avec l'émoji (Android n'envoie que le cœur pour un post ; l'API de réaction à émoji n'existe que pour les humeurs de statut)
- État du composant : ouvert/fermé, fermeture sur choix ou tap extérieur, mêmes émojis dans le même ordre que messages et stories (EmojiUsageStore pour les récents)
- Action d'accessibilité équivalente (TalkBack custom action) et libellé
- Un émoji autre que le cœur ne modifie pas l'état "aimé" ni le compteur de cœurs

Rendu : Bande horizontale en verre qui s'étire depuis le cœur avec ressort 0,3/0,7, 6-8 émojis récents, fermeture au tap extérieur.

Transposition Android : reactionPaletteTrigger -> combinedClickable(onLongClick) + Popup ; EmojiPicker existant.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostReactionPalette.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Reactions.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Écouter un réel audio : transcription géante qui suit la voix, contrôle de lecture, langue de piste

`rfp-reels-audio-page` · Android : **absente** · P1 · effort L

Un réel audio affiche la TRANSCRIPTION comme héros (grand texte centré façon paroles, surligné au fil de la lecture) sur un canevas teinté de la couleur d'accent, sans image. Le contrôle lecture/scrub (AudioPlayerView à moteur externe partagé avec la transcription pour que le surlignage suive la même position) et la bande de drapeaux de langue sont du chrome au-dessus ; un tap sur un drapeau change à la fois le texte affiché et la piste TTS jouée. Le Prisme choisit automatiquement la langue audio selon le rang des langues préférées (AudioTrackLanguageResolver, l'original concourt à son rang). Un plein écran audio dédié existe. Le moteur est unique par page, démarre quand la page est posée, s'arrête quand elle perd l'élection, et reprend à la fin d'un appel. Le fond audio du fil est une waveform animée (ReelAudioBackdrop) figée sous Reduce Motion.

Écarts :
- Aucun réel audio côté Android (filtré par ReelBuilder) : créer la page ReelAudioPage avec transcription héroïque karaoké (segments horodatés) sur fond d'accent
- Contrôle lecture/scrub partagé avec la transcription (un seul MediaPlayer/ExoPlayer par page) et pilotable en plein écran audio
- Bande de drapeaux de langue (original en tête, TTS disponibles, max 4) qui change texte ET piste ; langue auto via resolveTranslatedAudio / règle de rang du Prisme (l'original ne court-circuite pas)
- Autostart conditionné (actif + posé + pas d'appel) et idempotence sur l'URL chargée ; reprise à la fin d'un appel ; arrêt de ce seul moteur quand la page perd l'élection
- Attribution du temps d'écoute au réel (watch time) absente : iOS note ce manque aussi pour l'audio
- Fond waveform animé de la carte du fil (barres |sin|), gelé quand le réel n'est pas le plus centré et sous animations réduites

Rendu : Texte de transcription grand, centré, interligne généreux, mot courant en blanc plein et le reste atténué ; dégradé d'accent de l'auteur en fond ; contrôle audio posé juste au-dessus de la ligne auteur.

Transposition Android : AudioPlaybackManager -> ExoPlayer audio ou MediaPlayer + MediaSession ; waveform -> Canvas animé ; Reduce Motion -> Settings.Global.ANIMATOR_DURATION_SCALE == 0.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelAudioLayer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Voir un réel de photos : image seule ou carrousel horizontal avec pastille N / total

`rfp-reels-image-page` · Android : **absente** · P1 · effort M

Un réel image est soit une image seule, soit un carrousel horizontal à pagination par page (ReelImageView, ReelImageCell) sur un fond d'image floutée/teintée dérivé de l'image courante (ReelImageBackdrop, luminance mesurée pour teinter le chrome). Le carrousel publie le média visible, et ReelMediaCountBadge (coin haut-droit, "2 / 3", visible seulement s'il y a plus d'un média visuel et masquée en mode immersif) ouvre la galerie plein écran partagée sur le média affiché. ReelMediaLayout classe le contenu : vide, vidéo, images, audio seul, images + audio (l'audio joue sous les images). Libellés VoiceOver par image et par pastille.

Écarts :
- ReelBuilder.build filtre les réels sans vidéo : un réel de photos (type REEL, >= 2 images) n'apparaît jamais dans le lecteur ; modéliser ReelMediaLayout (empty/video/images/audioOnly/imagesWithAudio) et ne plus écarter
- Carrousel horizontal paginé (HorizontalPager) avec image fittée centrée, sur fond flou/teinté de l'image courante (RenderEffect blur API 31+, repli dégradé d'accent)
- Pastille de position "n / N" tappable, ouvrant la galerie plein écran sur le média visible ; cachée sous 2 médias et en immersif ; libellé TalkBack "position" + "ouvrir"
- Publication du média visible (visibleCarouselMediaId) pour que la pastille et le chrome suivent la page et non le média primaire
- Lecture d'un son sous les images (réel images + audio) via le moteur audio de page
- Cas image seule : zoom/ouverture galerie ; contenu décrit par alt-text (PostMediaAccessibility)

Rendu : Pastille en verre (coin haut-droit, marge sm), compteur "1 / 3" en chiffres tabulaires, fond coloré par l'image, pas de bandes noires.

Transposition Android : ScrollView paginé -> HorizontalPager ; fond flou -> Modifier.blur / RenderEffect ou couleur d'accent dégradée sur API < 31.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Carousel.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelPresentation.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaCarousel.kt`

### Le réel suivant joue dès qu'on y arrive : élection pendant le geste, préchauffage, fenêtre de préchargement

`rfp-reels-instant-switch` · Android : **absente** · P1 · effort L

Pour que le swipe ne montre jamais un trou noir, iOS sépare quatre questions en lois pures. QUAND : le réel actif est celui qui passe la moitié de l'écran PENDANT le geste (élu), et ne s'engage (moteur, scène, son) qu'une fois le défilement arrêté (posé) ; revenir sous la moitié rend la main à l'ancien. QUELLE IMAGE : poster/premier frame avant et après. QUEL SON : préchargement audio pour le voisin. COMBIEN : fenêtre de préchargement N±2 à N±10 selon l'usage, avec paliers (play, decode, mount, prime, idle) ; le lecteur est préparé à N±1 et le fichier au-delà. Un réel hors fenêtre ne télécharge pas de lui-même. Le profil réseau suit le palier : play/decode/mount passent sur tout réseau, prime/idle sont différables et ne partent en cellulaire que si le réglage vidéo l'autorise. Les pages se comparent par primitives (élue, posée, chrome masqué) pour ne réévaluer que deux pages par élection, et des signposts mesurent le temps de bascule.

Écarts :
- Aucune élection : isActive = (page == pagerState.currentPage), donc la lecture ne bascule qu'à la fin du geste ; porter une loi pure ReelPlaybackElection (majorité > 50 % pendant le scroll, posé à l'arrêt, repli si on revient en arrière) avec Pager.settledPage/currentPageOffsetFraction
- ReelVideoSurface crée un ExoPlayer par composition : sans pool, chaque page repart de zéro (écran noir au swipe). Prévoir un pool borné à 3 lecteurs (éviction FIFO, le sortant retourne au pool) et le préchauffage de l'item suivant (le précédent n'est pas préchauffé)
- Pas de fenêtre de préchargement ni de paliers : porter ReelPreloadWindow (rayons min/max adaptatifs, étapes play/decode/mount/prime/idle) et ReelPagerPreloader (enter/retire/prepare/releaseAll), avec cache disque Media3 (SimpleCache + DefaultPreloadManager) pour les fichiers au-delà de N±1
- Pas de préchargement des posters ni de l'audio du voisin ; pas de décodage anticipé de la première image
- Politique réseau : classer prime/idle comme différables et ne les lancer sur réseau facturé que si MediaDownloadPreferencesStore autorise le cellulaire ; play/decode/mount toujours immédiats
- Comparaison de page par primitives (stable key + @Stable) pour que l'élection ne recompose que deux pages ; mesure de bascule (Trace/Macrobenchmark) pour valider l'absence de trou noir
- Garde d'idempotence audio (ReelMediaAutostart.shouldLoadAudio) et porte d'autostart commune vidéo/audio (actif + révélation terminée + pas d'appel) à reprendre en logique pure testable

Rendu : Aucun élément visuel propre : l'effet attendu est zéro image noire ni gel au passage d'un réel à l'autre, poster affiché dès le début du geste.

Transposition Android : AVPlayerItem prewarm + SharedAVPlayerManager (pool de 3) -> Media3 ExoPlayer pool + DefaultPreloadManager/CacheDataSource ; MediaTransferProfile -> priorité de requête + vérif NetworkConditionMonitor (réseau facturé) ; signposts -> androidx.tracing.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelInstantSwitch.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelPlaybackRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelPrewarm.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelTransferPolicy.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`

### Passer d'un reel à l'autre est fluide : le prochain démarre sans accroc, quel que soit le réseau et l'appareil

`rfp-reels-preload-window` · Android : **absente** · P1 · effort M

ReelPreloadWindow calcule une fenêtre adaptative de préchargement (2 à 10 reels) à partir du rythme de visionnage (médiane des temps passés), du sens de navigation, du réseau (Save-Data, 2G/3G), de la mémoire, du mode économie d'énergie, de l'état thermique et du palier d'appareil ; chaque offset reçoit un palier (play, decode, mount, prime, idle) et un budget d'octets d'amorçage. ReelSwitchWork sépare ce qu'un changement de reel peut faire PENDANT le geste (pause du sortant, play d'un lecteur déjà attaché) de ce qu'il fait une fois posé (chargement du moteur, session audio, rapports de visionnage, PiP, scène, audio) pour ne pas figer le défilement.

Écarts :
- `ReelVideoSurface` crée un ExoPlayer par page sans pool ni préchargement : introduire un pool de lecteurs (N±1 attachés) et une fenêtre `ReelPreloadWindow` (ahead/behind, paliers play/decode/mount/prime/idle)
- Horloge de visites (`VisitClock`) qui enregistre temps passé et direction (12 dernières visites, ignorer < 150 ms) et calcule le rayon par cadence (≤ 1 s → 10, ≥ 10 s → 2)
- Contraintes : Data Saver / réseau mesuré (ConnectivityManager), économiseur de batterie, état thermique, RAM faible (≤ 2 Go), classe d'appareil bas/milieu/haut de gamme
- Budgets d'amorçage en octets par palier (mount 1,5 Mo, proche 768 Ko, lointain 256 Ko, divisés par 4 sous contrainte) via un préchauffage du cache ExoPlayer (CacheDataSource/Downloader)
- Séparation geste/posé (`ReelSwitchWork`) : pendant le glissement pause + play d'un lecteur attaché seulement ; chargement moteur, focus audio, coordination de lecture, rapports et PiP après l'arrêt du pager (`settledPage`)
- Périmètre de préchargement `ReelThreadOrder.preloadScope`

Rendu : Invisible mais perceptible : aucune image figée à mi-course pendant un balayage rapide, le reel entrant démarre dès qu'il est posé.

Transposition Android : AVPlayer pool → ExoPlayer pool + SimpleCache ; NWPath/thermalState → ConnectivityManager + PowerManager

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Media/ReelPreloadWindow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ReelSwitchWork.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### Revoir un réel composé comme sa scène : textes, stickers, fond et son de fond rejoués en boucle

`rfp-reels-scene-page` · Android : **absente** · P1 · effort L

Un réel composé (storyEffects / canvas v3) ne se joue pas comme une vidéo brute : MeeshyScenePlayer en mode .reel rejoue la scène (vidéo de fond éventuellement coupée, textes, stickers, son de fond porté par la timeline) en boucle, avec le son, et publie sa position à une horloge dédiée qui alimente ReelSceneProgressBar (barre glissable, libellé "reels.scrub"). Le tap met la scène en pause, le bouton son pilote la piste de fond emprunté, l'horloge est possédée par la page sans l'observer pour ne pas la réévaluer à 60-120 Hz. ReelSceneRouting décide quel chemin joue (scène, piste empruntée seule, média) et exclut les doubles lectures ; la sauvegarde d'un réel composé rend la scène (PostSaveRoute.renderScene) au lieu de copier son fichier.

Écarts :
- Aucun lecteur de scène pour un post : factoriser le rendu de StorySlideDeck/StoryPlayback en un composable ScenePlayer réutilisable (mode reel : boucle, son, horloge publiée) pour les posts/réels composés
- Le pager écarte ces réels (filtre vidéo) : router vers la scène quand le post porte un canvas/scènes (ReelSceneRouting) et ne pas lancer le moteur vidéo en plus
- Son de fond de la timeline joué par la scène seule (pas de second moteur), bouton muet pilotant uniquement la piste de fond emprunté
- Barre de progression de scène (horloge hors recomposition de la page) avec seek, tap = pause
- Chemin d'enregistrement qui rend la scène (rendu vidéo) au lieu du fichier source, avec bouton de progression
- Réel "son emprunté seul" sans média : piste jouée par la page, créditée dans l'overlay

Rendu : Cadre 9:16 plein écran, scène centrée, barre de progression fine en bas, lecture silencieuse avant la fin de la révélation.

Transposition Android : MeeshyScenePlayer (SwiftUI/AVFoundation) -> composable ScenePlayer Compose (Canvas/graphicsLayer + ExoPlayer pour les médias) partagé avec le viewer de stories ; rendu d'export -> MediaCodec/Transformer (Media3).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`

### Voir la scène d'un post en entier avec ses actions au-dessus du composer, son de fond contrôlable

`rfp-scene-post-detail` · Android : **absente** · P1 · effort L

Dans le détail d'un post composé, le canvas (vue 2h) garde toujours le rapport 9:16 mais sa hauteur est bornée par ce que la page peut MONTRER (PostDetailSceneFraming : plus de littéral sans borne, la scène ne passe plus sous le composer et la rangée J'aime/Commentaires/Republier reste visible, mesures de recette). Le bouton muet n'existe que si un canvas est réellement rendu et porte du son (même prédicat que le rendu) ; l'audio est ACTIVÉ par défaut en détail et la lecture se met en pause hors écran. PostSceneSoundHeader montre en tête de la scène la trace du son de fond (forme d'onde, titre, crédit) et AGIT : toucher joue/met en pause. Un tap sur la scène l'ouvre en plein écran partagé ; une scène indisponible montre un placeholder.

Écarts :
- PostDetailScreen ne rend aucune scène : brancher le ScenePlayer partagé dans la section média du détail
- Cadrage : hauteur de scène = min(9:16 sur la largeur, viewport - barre d'actions - composer), pour que les actions restent visibles au-dessus du composer
- Bouton muet conditionné au même prédicat que le rendu (scène rendue + son) ; son par défaut activé en détail ; pause hors écran (visibilité de la rangée)
- En-tête de son de fond (forme d'onde, titre, crédit, play/pause au toucher) ; libellés TalkBack
- Plein écran de scène au tap ; placeholder "story indisponible" si la scène manque

Rendu : Scène 9:16 centrée sous l'en-tête, bandeau de son en tête avec onde et crédit, bouton muet dans la barre d'actions, aucune coupure derrière le composer.

Transposition Android : StoryReaderRepresentable -> ScenePlayer Compose ; plein écran -> destination de navigation dédiée.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Canvas.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailSceneFraming.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostSceneSoundHeader.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`

### Voir un post composé (scène) dans le fil : lecture élue, mosaïque de scènes à 5 modes

`rfp-scene-post-feed` · Android : **absente** · P1 · effort L

Un post composé porte une ou plusieurs scènes (canvas v3, 9:16). PostSceneCard les rend avec MeeshyScenePlayer ; les scènes concourent à l'autoplay du fil exactement comme les vidéos (FeedSceneAutoplay : directive 2026-09-05, une seule surface joue, la plus proche du centre, un appel les tait toutes, muet en fil, uniquement si la scène bouge). Une story repartagée suit la même loi (StoryRepostSurface). Plusieurs scènes forment une mosaïque PostSceneMosaic : jusqu'à 4 tuiles avec +N sur la dernière, cinq modes (défilement image par image, par défaut ; vague ; héros ; sinusoïde ; carrousel), flèches et compteur "n / N", tuiles = scènes arrêtées, seule la page courante joue si la carte est élue, indicateur de son coupé. Le contexte (fil muet par construction, détail avec son) est décidé par l'hôte (PostSceneMosaicHost).

Écarts :
- Aucun rendu de scène dans le fil : un post composé n'est affiché que par ses images ; factoriser un ScenePlayer (rendu des textes/stickers/fond du viewer de stories) utilisable en tuile arrêtée et en lecture
- Étendre l'élection d'autoplay aux scènes (même loi que les vidéos, muet en fil, uniquement si SceneMotion), et aux stories repartagées
- Mosaïque de scènes : 4 tuiles + "+N", modes carrousel (défaut), vague, héros, sinusoïde, réel ; géométrie pure MosaicLayout/SceneCarouselLayout à porter (sdk-ui MosaicLayout couvre les images seulement)
- Flèches précédent/suivant, compteur "n / N", indicateur de son coupé, libellés TalkBack de tuile ("description, plus N")
- Contexte sonore par hôte : fil = muet, détail = son par défaut avec bouton muet
- Décoder CanvasV3 (scenes, sound, layout, thumbHash, carrierAspect) avec migration des anciennes formes

Rendu : Tuiles 9:16 arrondies, badge +N en overlay semi-opaque sur la 4e, flèches en verre sur les côtés, compteur en pilule, mosaïque 'vague' avec décalages vertical alternés.

Transposition Android : MeeshyScenePlayer -> composable ScenePlayer Compose partagé avec le viewer de stories (rendu Canvas/graphicsLayer + ExoPlayer pour les médias de fond).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedSceneAutoplay.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostSceneMosaic.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Célébrer un succès ou un palier en plein écran, un à la fois, sans jamais bloquer

`rfp-achievement-reveal` · Android : **absente** · P2 · effort M

EngagementRevealHost (posé en une ligne sur les deux racines, téléphone et tablette) présente la révélation d'un succès/palier par une couverture plein écran, par DEUX portes : le tap sur une notification de palier (router.pendingEngagementReveal, la révélation recouvre le tableau de bord qui vient d'être poussé, ramassée même au démarrage à froid) et le GESTE — un succès annoncé par la passerelle arrive en direct sur le socket (notification:new déjà dédupliquée) et se célèbre au moment où l'utilisateur agit ; seuls les SUCCÈS passent par cette seconde porte (badges, séries et niveaux restent des notifications). EngagementRevealQueue est pure et bornée : un seul à l'écran, les suivants attendent, déduplication des paliers déjà montrés, au-delà d'une borne les paliers restent acquis dans le tableau de bord. Après la révélation, la carte photo du succès s'ouvre par-dessus ; le liseré de rareté vient du cache.

Écarts :
- Aucune célébration de succès : créer l'hôte de révélation (modifier racine) abonné aux notifications de type succès/palier reçues par socket/FCM, avec file pure bornée dédupliquée (EngagementRevealQueue)
- Deep link de la notification de palier -> écran progression + révélation par-dessus (ramassage à froid)
- Écran de révélation (médaille, rareté, bouton continuer) et déroulé photo du succès — vues AchievementRevealView/Medal/BadgeView hors de cette partie mais requises
- Respect de Reduce Motion ; ne pas interrompre pour badges/séries/niveaux (notification seulement)

Rendu : Couverture plein écran, médaille centrale animée, liseré de rareté, un seul à l'écran avec file.

Transposition Android : fullScreenCover -> Dialog plein écran / destination modale ; NotificationToastManager.newNotificationReceived -> flux NotificationSyncEvents.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/EngagementRevealHost.swift`
- `apps/ios/Meeshy/Features/Main/Views/EngagementRevealQueue.swift`

</details>

### Transcrire mon vocal sur l'appareil, choisir sa langue, ou écrire la transcription moi-même

`rfp-audio-post-transcription` · Android : **absente** · P2 · effort L

AudioPostComposerView+Transcription : sélecteur de langue du son (puces de locales + "plus", UNIQUEMENT avant l'enregistrement, directive 2026-09-01), reconnaissance sur l'appareil (SFSpeechRecognizer via EdgeTranscriptionService) avec aperçu de la transcription, annulation, réessai, panneau d'erreur avec les deux sorties (écrire ou coller la transcription) via ManualTranscriptionEditor, titre/aucune transcription/modifier, et construction du MobileTranscriptionPayload (segments) envoyé à la publication pour éviter la re-transcription serveur.

Écarts :
- Absent et documenté comme coupure assumée ("no on-device transcription preview") : implémenter la reconnaissance sur appareil (SpeechRecognizer.createOnDeviceSpeechRecognizer API 31+, repli : transcription serveur) avec puces de locale
- Aperçu de transcription, annulation, réessai, panneau d'erreur à deux sorties (écrire / coller) et éditeur manuel
- Payload de transcription mobile (langue, texte, segments, confiance) envoyé avec la publication pour sauter la re-transcription serveur
- Règle : langue modifiable seulement avant l'enregistrement

Rendu : Rangée de puces de langue en tête, panneau de transcription arrondi avec boutons Modifier/Écrire/Coller, erreur en carte avec actions.

Transposition Android : SFSpeechRecognizer on-device -> android.speech.SpeechRecognizer (on-device, API 31+) ; Whisper tflite en option.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView+Transcription.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Rogner mon son et choisir sa place : fond de publication ou contenu

`rfp-audio-post-trim-placement` · Android : **absente** · P2 · effort M

AudioPostTrimZone (#4657/#4667) : zone de rognage montée dès qu'une piste existe (enregistrement, fichier ou son de bibliothèque) avec quatre cas exclusifs — masquée, chargement, échec avec Réessayer, poignées — qui occupent la MÊME place pour que le placement ne saute pas ; affiche l'intervalle "0:03 -> 0:41" en chiffres localisés (LocalizedNumber.duration) pendant que VoiceOver lit la valeur parlée des poignées ; l'intervalle rogné d'un son emprunté voyage en sourceStart/sourceEnd sur l'objet audio (le crédit survit). AudioPostPlacementSection : interrupteur à deux moitiés "fond de publication" / "contenu de publication", sans titre, définition d'une ligne sous la moitié choisie, haptique.

Écarts :
- Composant de rognage audio à poignées (forme d'onde + deux poignées + lecture) avec états masqué/chargement/échec/poignées de hauteur constante
- Intervalle affiché en chiffres localisés et valeur parlée pour TalkBack
- Interrupteur de placement fond/contenu (ComposerAudioRole) avec explication d'une ligne
- Transport du rognage en sourceStart/sourceEnd pour un son de bibliothèque (sans ré-upload)

Rendu : Forme d'onde large, poignées 44 dp, légende d'intervalle centrée, interrupteur segmenté sans titre.

Transposition Android : Trimmer SDK -> composable de rognage dans sdk-ui (réutilisable pour stories).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioPostTrimZone.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioPostPlacementSection.swift`

</details>

### Un bouton caméra à droite du composeur de commentaire prend une photo ou une vidéo et l'ajoute à l'aperçu

`rfp-comment-composer-camera-door` · Android : **absente** · P2 · effort M

Une « porte caméra » confiée à la barre du composeur par l'environnement ouvre le viseur plein écran (même viseur que la barre de message, qui respecte la politique d'enregistrement des captures). La prise rejoint la zone d'aperçu par la même entrée que toute pièce, donc sous le même plafond de pièces. L'hôte (la story) se met en pause quand le viseur le recouvre.

Écarts :
- Bouton caméra dans le composeur de commentaire (à droite de « Photos »), même verre et même glyphe que la barre de message
- Ouvrir un viseur CameraX plein écran ou l'intent de capture existant (`CameraCaptureFile`) et ajouter la prise à la zone d'aperçu des pièces avec la même limite (`MAX_POST_MEDIA`)
- Callback `onOpen` pour que l'hôte (lecteur de story, reels) se mette en pause sous le viseur
- Politique de sauvegarde des captures (`CaptureSavePolicy`) : enregistrer ou non dans la galerie selon le réglage

Rendu : Bouton rond en verre (adaptiveLiquidGlass) de 44 dp, glyphe caméra, aligné à droite du bouton Photos dans la rangée d'outils.

Transposition Android : fullScreenCover ComposerViewfinder → CameraX / ActivityResultContracts.TakePicture ou écran Compose dédié

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CommentCameraDoor.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaPicker.kt`

### Je peux replier la barre de commentaire en une icône pour lire tranquillement, sans perdre mon brouillon

`rfp-comment-composer-fold` · Android : **absente** · P2 · effort S

Dans tout espace commentaire (fil, détail de post, story), la barre affiche un ⌄ par défaut ; le toucher la replie en une icône de commentaire (le brouillon, les pièces et l'enregistrement vocal restent montés, hauteur zéro et invisibles) ; toucher l'icône la rouvre. Une réponse en cours rouvre la barre (sa bannière « Réponse à X » vit dedans). La barre de conversation reçoit le même repli (« Réduire la barre de message »), le ⌄ s'efface pendant qu'on écrit ou enregistre, et une saisie qui commence rouvre la barre.

Écarts :
- Modificateur Compose `foldableComment(isReplying)` appliqué au composeur du détail de post, des commentaires de reels et de stories
- Bouton ⌄ (libellé « Masquer la zone de commentaire ») et bouton de dépli (« Afficher la zone de commentaire ») avec haptique légère et ressort (réponse 0,32 / amortissement 0,82)
- Garder le composeur monté, replié à hauteur 0 et alpha 0 sans le démonter (le brouillon vit dans l'état) ; masquer à l'accessibilité
- Fermer le clavier au repli ; rouvrir automatiquement quand une réponse commence
- Variante conversation : « Réduire la barre de message » / « Afficher la barre de message », ⌄ masqué pendant la saisie ou l'enregistrement, réouverture à la reprise de la saisie

Rendu : Replié : un seul bouton rond en verre de 44 dp au centre bas avec glyphe commentaire (transition scale 0,6 + fondu) ; déplié : le ⌄ apparaît à l'extrémité de la barre.

Transposition Android : ViewModifier + EnvironmentKey → Modifier/CompositionLocal et AnimatedVisibility sans démontage

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CommentComposerFold.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`

### Mon commentaire à moitié écrit est retrouvé quand je reviens sur le post

`rfp-comment-draft-persistence` · Android : **absente** · P2 · effort S

CommentDraftStore enregistre le brouillon de chaque post (anti-rebond 400 ms, écriture forcée quand l'app passe en arrière-plan), garde au plus 50 brouillons (les plus anciens sont évincés), efface le brouillon vide ou envoyé, et supprime tout à la déconnexion.

Écarts :
- Store persistant (DataStore ou Room) de brouillons clés par postId avec anti-rebond 400 ms
- Écriture immédiate dans `onStop` / ProcessLifecycle pour ne rien perdre
- Plafond de 50 brouillons avec éviction FIFO et ordre de mise à jour
- Recharger le brouillon à l'ouverture du composeur et l'effacer à l'envoi ou quand le texte devient vide
- Purge complète à la déconnexion

Rendu : Aucun chrome : le champ réapparaît pré-rempli, curseur en fin de texte.

Transposition Android : UserDefaults → Preferences DataStore ; willResignActive → ProcessLifecycleOwner ON_STOP

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CommentDraftStore.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`

### Je peux citer un média précis du post dans mon commentaire

`rfp-comment-quote-media` · Android : **absente** · P2 · effort M

CommentQuotationStore retient, par post, le média désigné par l'utilisateur (`designate/clear`). Le commentaire envoyé porte `quotedPostMediaId`, et le serveur renvoie une citation (`CommentQuotedMedia` : id du média, type image/vidéo/audio/lieu/fichier, vignette, légende) affichée en tête du commentaire.

Écarts :
- Geste pour désigner un média du post (appui long ou bouton « Citer ce média ») qui renseigne un store par post
- Modèle `CommentQuotedMedia` (postMediaId, kind, media, vignette) et `quotedPostMediaId` dans la création de commentaire
- Rendre la citation en tête du commentaire (vignette + icône du type + légende), tappable pour revenir au média
- Effacer la citation à l'envoi, au changement de post et à la déconnexion (`clearAll`)
- Décoder `quotedCitation` dans `ApiPostComment`

Rendu : Bandeau de citation compact (vignette 40 dp à gauche, icône de type, légende en une ligne) au-dessus du texte du commentaire, avec croix de retrait dans le composeur.

Transposition Android : ObservableObject singleton → StateFlow dans un @Singleton

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CommentQuotationStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CommentQuotedMedia.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`

### Citer un média du post dans mon commentaire, et le voir cité sous la ligne publiée

`rfp-comment-quoted-media` · Android : **absente** · P2 · effort S

CommentQuotedMediaViews (#6578) rend la citation d'un média de post à DEUX moments : le bandeau (CommentQuotedMediaBanner) sur une ligne publiée dit ce dont ce commentaire parle, la puce (CommentQuotationChip) au-dessus du champ de saisie dit ce dont je suis en train de parler, avec croix pour se raviser. Les deux rendent la même chose : une vignette quand la citation est rattrapable, la NATURE seule (image, vidéo, audio, lieu, fichier) quand le média a disparu ou été détaché — dégradation, jamais effacement (CommentQuotedMedia.media == nil est un état nominal). Barre de citation identique aux autres, libellé d'accessibilité.

Écarts :
- Modèle CommentQuotedMedia (media nullable) et champ de citation sur le commentaire envoyé/reçu
- Bandeau sur la ligne publiée (vignette ou nature seule) et puce au-dessus du composer avec croix
- Dégradation propre vers la nature (image/vidéo/audio/lieu/fichier) avec libellés localisés quand la cible a disparu
- Entrée "commenter ce média" depuis la galerie

Rendu : Barre verticale de citation à gauche, vignette 40 dp ou icône de nature, légende "à propos de…" en secondaire.

Transposition Android : Aucun.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentQuotedMediaViews.swift`

</details>

### Je peux transformer un commentaire (ou un fil de réponses) en image à partager

`rfp-comment-share-card` · Android : **absente** · P2 · effort L

PostCommentCardComposition compose la carte « Imager » d'un commentaire de post : cinq modes (post + commentaire, commentaire seul, fil jusqu'ici, post + racine + réponse, réponses choisies), le post en tête retirable, bornes (post 4 lignes/280 caractères, 6 blocs au plus avec « +N réponses » replié, médias limités). Gardes : jamais pour un commentaire protégé (éphémère, flouté, vue unique) ni une réponse dont un ancêtre l'est ; un post disparu (story/statut échu), vide ou non public ne s'affiche pas en tête. Une story peut être le support (PostCommentCardStory, média héros). `reading` convertit le Markdown/liens en texte lisible.

Écarts :
- Aucun moteur de carte partagée côté Android (pas de `MessageCard`) : porter la composition pure `PostCommentCardComposition` (modes, blocs, repli « +N réponses », gardes de protection, audience publique, expiration)
- `PostCommentCardStory` (id, auteur, texte, médias, expiration, canvas, visibilité) et sélection du média héros (image/vidéo, vignette si canvas)
- Source de lecture `reading` : texte lisible des liens `[libellé](url)`, `[[url]]`, gras
- Écran de choix du mode (feuille) avec aperçu et bascule « afficher le post », puis rendu en bitmap (Canvas/GraphicsLayer) et partage via `ACTION_SEND` (image/png)
- Respecter les gardes de confidentialité du fil : ancêtre protégé = pas de carte

Rendu : Carte verticale façon capture : post en tête (texte tronqué lisiblement, vignette), blocs de commentaires indentés avec avatar, pastille de langue du texte original si montré, pied de carte Meeshy ; palette liée à la couleur de l'auteur.

Transposition Android : ImageRenderer SwiftUI → Compose Picture/GraphicsLayer vers Bitmap ; partage → Intent.ACTION_SEND avec FileProvider

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/PostCommentCardComposition.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/PostCommentCardStory.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/MessageCard/PostCommentCardSource+Reading.swift`

</details>

### Le composeur de commentaire ne passe jamais sous l'en-tête de la feuille : elle s'agrandit toute seule

`rfp-comment-sheet-fit` · Android : **absente** · P2 · effort S

La feuille de commentaires s'ouvre à mi-hauteur. Dès que le haut du composeur (clavier, panneau de pièces, zone d'aperçu, bannière de réponse) dépasse le haut de la zone de contenu, la feuille passe automatiquement à la grande détente et ne se réduit jamais d'elle-même. Le panneau des pièces cède de la hauteur à l'hôte (plancher 96) avant que le composeur ne déborde.

Écarts :
- Sonde de position du composeur dans le repère de la feuille (`onGloballyPositioned`) ; si le haut dépasse de plus de 0,5 dp, passer la ModalBottomSheet à l'état étendu (`sheetState.expand()`)
- Ne jamais réduire la détente automatiquement ; seul le geste utilisateur la ramène
- Mesures non finies ou cadre nul = pas de débordement
- Hauteur du panneau de pièces avec plancher 96 dp qui cède à l'hôte dans une feuille
- Appliquer à la feuille de commentaires de reels et de stories dès que le composeur gagne pièces jointes et bannière de réponse

Rendu : Transition d'agrandissement par ressort (0,32 / 0,86) ; en-tête de feuille avec titre et croix toujours visibles, jamais recouverts par le composeur.

Transposition Android : presentationDetents medium/large → ModalBottomSheet partiallyExpanded/expanded

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CommentSheetFit.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCommentsSheet.kt`

### Glisser un commentaire vers la droite pour y répondre, et voir ses effets (flou, lueur, zoom…)

`rfp-comment-swipe-reply-effects` · Android : **absente** · P2 · effort M

Directive 2026-09-28 (#8582) : deux modificateurs pour deux portées — commentSwipeToReply sur la LIGNE entière (glissé progressif et annulable avec résistance BubbleSwipeResistance, indicateur de réponse qui apparaît, haptique légère au seuil et succès au déclenchement, ouvre le composer en réponse) et commentBody(effects:) sur le CORPS seul (voile du flou + effets lueur/pulse/zoom…, l'auteur, l'heure et les actions restent lisibles comme dans une bulle protégée). Chaque surface de commentaire (feuille, détail, aperçu du fil, story) monte les DEUX modificateurs.

Écarts :
- Réutiliser SwipeToReply du chat (glissé progressif annulable jusqu'à 75-90 %, suit le doigt) pour les lignes de commentaire, avec indicateur et haptiques
- Appliquer les effets de message (MessageEffectModifiers, voile de flou BubbleBlurReveal) au corps des commentaires sur les 4 surfaces ; règles CommentVeilRules
- Garde de câblage : une surface qui oublie l'un des deux modificateurs redevient une jumelle divergente (test de source)

Rendu : Ligne translatée avec résistance, icône de réponse qui grossit près du seuil, haptique légère au seuil et de succès au déclenchement.

Transposition Android : DragGesture -> Modifier.draggable/anchoredDraggable ; effets -> modifiers de sdk-ui partagés avec les bulles.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentSwipeToReply.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/SwipeToReply.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageEffectModifiers.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`

### Je vois ma progression : points par axe, badges, séries, niveaux, succès, élan et Meesh, avec célébration des paliers

`rfp-engagement-progress-gamification` · Android : **absente** · P2 · effort L

Le catalogue d'engagement définit 20 axes en 5 familles (contenu, commentaire, conversation, outil, social), pondérés, avec échelles de badges (1, 10, 50, 100, 500, 1000, 5000), séries (3 à 100 jours), niveaux (10 à 2500) et succès (premier contenu, tous types, première voix, éditeur, trois types de conversations). EngagementProgressResolver transforme la réponse serveur (compteurs, jalons, série courante/record, niveau, étincelles, élan ×N sur fenêtre, Meesh avec solde, prix de frappe, points débitables, plancher) en échelles avec fraction entre deux paliers, succès débloqués, groupes par famille, héros (dernier succès obtenu ou prochain). EngagementReveal dérive de la notification le palier à célébrer (badge, série, niveau, succès, succès composé) ou rend nil plutôt qu'un repli faux. EngagementProgressService lit `GET /me/engagement` et frappe un Meesh (`POST /me/meesh/mint` avec requestId et prix maximal), résultat avec édition, gloire, niveaux avant/après.

Écarts :
- Aucune trace de la gamification sur Android (pas de modèle, d'endpoint ni d'écran) : porter `EngagementCatalog` (axes, familles, poids, seuils) comme source unique, en cohérence avec `packages/shared/utils/engagement-progress.ts`
- Modèles `APIEngagementProgress` (compteurs, jalons, série, niveau avec étincelles/cycle/vie/dette, élan, Meesh) avec décodage tolérant (axe inconnu = chaîne, jamais d'échec)
- `EngagementProgressResolver` : échelles par axe/niveau/série (progression entre le dernier palier franchi et le suivant), succès, groupes par famille, élan accéléré (visible seulement dès ×2), Meesh (`canMint` dérivé, progression sur points débitables, bornes du registre de frappe)
- `EngagementReveal.from(type, metadata)` pour célébrer un palier depuis une notification (badge/série/niveau/succès/succès composé) avec `nil` plutôt qu'un repli, pour chemins notification et socket
- Héros du tableau de bord (`heroAchievement` : dernier obtenu sinon premier à obtenir) et symboles d'axe (équivalents Material des SF Symbols)
- Service `GET me/engagement` et `POST me/meesh/mint` (requestId, maxPrice), résultat de frappe (statut, solde, numéro, édition, gloire, niveaux)
- Écrans : tableau de bord d'engagement par famille, célébration plein écran d'un palier, bouton « Frapper un Meesh » seulement si possible

Rendu : Tableau de bord par familles avec barres de progression entre paliers, badges colorés, flamme de série, jauge de niveau, carte « héros » du dernier succès ; célébration plein écran avec animation et haptique.

Transposition Android : fullScreenCover de célébration → écran/Dialog Compose plein écran avec animation Lottie ou Canvas ; SF Symbols des axes → icônes Material équivalentes

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementCatalog.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementProgressModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementProgressResolver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementReveal.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementHero.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementAxisKey+Symbol.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/EngagementProgressService.swift`

</details>

### Lire les trois premiers commentaires sous une carte et ouvrir tous les commentaires

`rfp-feed-card-comments-preview` · Android : **absente** · P2 · effort S

Sous une carte standard, l'aperçu montre les 3 premiers commentaires (ligne avatar + nom + texte, profil au tap, menu contextuel d'actions, cœur avec compteur) et le lien "Voir les N commentaires" ; glisser un commentaire vers la droite ouvre la feuille de commentaires déjà en réponse à celui-ci (#8582), et les effets du commentaire (flou, lueur…) s'appliquent. Les médias de TOUS les commentaires que la carte connaît alimentent le plein écran.

Écarts :
- Aucun aperçu de commentaires dans la carte : la présentation du post ne porte pas les 3 premiers commentaires (gateway postIncludes take: 3) ; les mapper et les afficher
- Lien "Voir les N commentaires" qui ouvre la feuille de commentaires (et non le détail)
- Glissé vers la droite pour répondre et effets de commentaire (voir rfp-comment-swipe-reply-effects)
- Menu contextuel d'actions sur la ligne et navigation profil au tap

Rendu : Lignes compactes sous les actions, séparateur léger, texte secondaire, lien en accent.

Transposition Android : contextMenu -> long-press DropdownMenu.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+CommentsPreview.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`

### Les images et vignettes du fil sont déjà chargées quand on scrolle

`rfp-feed-media-prefetch` · Android : **absente** · P2 · effort S

FeedMediaPrefetcher observe l'index visible (anti-rebond 150 ms, au moins 2 rangées d'écart) et précharge la fenêtre [index-2, index+7[. Il respecte la politique de téléchargement (condition réseau + préférences utilisateur) pour image, vidéo et audio, précharge les vignettes (ou une image extraite pour une vidéo sans vignette), les pistes audio, et le premier lecteur vidéo si l'état thermique le permet.

Écarts :
- Créer un FeedMediaPrefetcher (viewmodel feed) qui enfile des requêtes Coil `ImageRequest` en mémoire/disque pour la fenêtre autour de l'item visible, avec anti-rebond 150 ms et seuil de 2 rangées
- Brancher la décision sur `MediaAutoDownload`/`NetworkConditionMonitor`/`MediaDownloadPreferencesStore` (image, vidéo, audio autorisés ou non selon Wi-Fi, cellulaire, économiseur de données)
- Vidéo : précharger la vignette ou extraire une frame (MediaMetadataRetriever) quand `thumbnailUrl` manque ; ne précharger le premier lecteur ExoPlayer que si PowerManager.getCurrentThermalStatus() est correct
- Audio : préchauffer le cache de la piste (OkHttp cache) pour les posts audio proches
- Annuler le préchargement en cours quand la fenêtre change, priorité basse (Dispatchers.IO limité)

Rendu : Invisible à l'utilisateur ; l'effet attendu est l'absence de placeholder visible en scroll normal sur réseau correct.

Transposition Android : MediaDownloadPolicyEngine/CacheCoordinator.images → MediaAutoDownload + Coil ImageLoader (disk/memory cache) ; thermalState → PowerManager thermal status

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedMediaPrefetcher.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`

### Toucher un #hashtag et voir les posts et réels qui l'emploient

`rfp-hashtag-results` · Android : **absente** · P2 · effort S

HashtagResultsView affiche les résultats de recherche par hashtag, posts et réels mélangés par récence (spec 2026-08-03 post-hashtags-and-rich-content §4), avec état vide "hashtag.results.empty". Le point d'entrée est le #hashtag cliquable rendu par MessageTextRenderer dans les corps de post, légendes de réel, commentaires.

Écarts :
- Aucun écran de résultats par hashtag : créer HashtagResultsScreen (liste unifiée posts + réels triés par date, squelette, vide, erreur) branché sur l'endpoint de recherche par hashtag
- Détection et rendu cliquable des #hashtags dans le texte (et @mentions) via le rendu de texte riche partagé
- Route de navigation + deep link ; état hors ligne

Rendu : En-tête avec le hashtag, liste de cartes du fil (standard ou réel), état vide centré.

Transposition Android : NavigationStack route -> destination NavHost.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/HashtagResultsView.swift`

</details>

### Je vois les points que j'ai gagnés sur un post et les marques de mes interactions passées

`rfp-post-viewer-points-marks` · Android : **absente** · P2 · effort S

PostViewerEngagement résume ce que le lecteur a déjà fait sur un post (réactions, partages, reposts, commentaires, réponses) en marques ordonnées. PostViewerPoints garde, par post, les points du lecteur en ne retenant jamais une valeur plus ancienne que la plus récente connue ; l'événement `engagement:post-updated` les met à jour en direct, le store est vidé à la déconnexion et plafonné à 2 000 posts. `shown` ne montre rien à zéro.

Écarts :
- Décoder `viewerEngagement` (reactions[], shareCount, repostCount, commentCount, replyCount) et `viewerPoints` dans `ApiPost`
- Écouter `engagement:post-updated` (postId, viewerPoints, at) dans SocialSocketManager et un store `PostViewerPointsStore` (garde « jamais plus ancien », plafond 2 000, reset à la déconnexion)
- Afficher les marques (emojis de mes réactions, icônes commentaire/réponse/repost/partage) et les points sur la carte du post, avec masquage à zéro
- Libellés d'accessibilité des marques

Rendu : Petite ligne de marques discrète sous la carte (émojis de réaction empilés + icônes) et pastille de points gagnés à droite ; rien d'affiché si aucune interaction.

Transposition Android : Combine PostEngagementChannel → SharedFlow ; store singleton → @Singleton avec StateFlow

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostViewerEngagement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostViewerPoints.swift`

</details>

### Masquer tout le chrome d'un réel d'un appui long, le rétablir d'un tap

`rfp-reels-immersive-gestures` · Android : **absente** · P2 · effort S

Dans le lecteur, un appui long (0,3 s, haptique moyenne) sur le contenu entre en mode immersif : bouton retour, overlay d'infos, rail d'actions, barre de lecture et pastille de médias disparaissent en fondu (0,25 s) et ne captent plus les touches ; le premier tap restaure le chrome sans basculer la lecture (règle du lecteur de stories) ; changer de réel réinitialise le mode. Les gestes tap, appui long, glissé de bord et pan de carrousel/pager coexistent car ils sont posés sur le média lui-même et non sur une couche transparente qui volerait le carrousel.

Écarts :
- Aucun mode immersif : ajouter chromeHidden (appui long détecté par combinedClickable/pointerInput sur le média, haptique, fondu 250 ms) appliqué à toute la pile de chrome
- Le tap suivant ne fait que restaurer le chrome, sans basculer lecture/pause
- Réinitialisation du mode immersif au changement de page
- Les gestes ne doivent pas intercepter le HorizontalPager du carrousel ni le VerticalPager : poser les détecteurs sur le média, pas sur une surcouche

Rendu : Fondu 0,25 s ease-in-out ; état restauré identique à l'ouverture ; aucune bascule de lecture au premier tap en immersif.

Transposition Android : onLongPressGesture -> combinedClickable(onLongClick) ; fullscreenChromeVisibility -> AnimatedVisibility + pointerInteropFilter désactivé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### Voir un réel dans le fil comme une carte plein cadre qui s'anime

`rfp-feed-reel-card` · Android : **divergente** · P1 · effort L

Dans le fil iPhone, un réel s'affiche en ReelFeedCard : carte arrondie (lgPlus) de hauteur proportionnelle au ratio du média, bornée entre 4:3 et 4:5 (reelCardHeight), fond selon le type (vidéo muette en autoplay, waveform animée pour l'audio, image, scène composée), voile dégradé bas, ligne "Republié par" pour un repartage, rangée auteur (avatar avec présence et anneau de story), annonce du son de fond, légende 2 lignes en mentions teintées, sticker de position, rangée d'actions (J'aime, Commenter, Republier, Enregistrer, Partager avec compteurs, états participés, hints VoiceOver), glyphe ... en verre en haut à droite ouvrant le menu complet (Ouvrir, Copier, Partager, Enregistrer le média, Épingler, Modifier, Supprimer, Retirer, Signaler) et, pour l'auteur, ses compteurs de portée (liste des vues pour ADMIN/BIGBOSS). Un tap ouvre le lecteur immersif (jamais le détail). En largeur régulière (iPad), le réel retombe sur la carte standard (FeedPostRow). Les cartes sont Equatable sur primitives, avec conteneur d'observation qui isole l'élection.

Écarts :
- Le réel du fil est un simple encart de 180 dp avec une icône PlayCircle et le mot "Reel" dans la carte de post standard : le remplacer par la carte plein cadre (ratio 4:3 à 4:5 selon width/height du média, coins lgPlus, voile dégradé bas, clip)
- Fond par type : vidéo (autoplay muet), audio (dégradé d'accent + waveform animée gelée sous animations réduites), image, scène composée
- Surcouche basse : "Republié par X", rangée auteur (photo, présence, anneau de story), badge du son de fond, légende 2 lignes avec mentions teintées, sticker de lieu ouvrant la carte
- Rangée d'actions dédiée avec compteurs et états participés (cœur, commentaire, republier, signet, partager)
- Menu ... en verre en haut à droite avec la liste complète d'actions (parité avec le menu de la carte standard) et compteurs de portée pour l'auteur
- Tap = ouvrir le lecteur de réels initialisé avec les réels du fil (jamais le détail) ; en largeur large (tablette) retomber sur la carte standard
- Carte stable : égalité sur primitives pour ne pas recomposer toute la liste à chaque élection d'autoplay

Rendu : Carte pleine largeur de colonne, scrim noir 0 -> strong en bas, texte blanc avec ombre, avatar 34 dp, glyphes d'action en ligne avec compteur à droite, bouton ... verre rond en haut à droite, bouton son en haut à gauche.

Transposition Android : GeometryReader+PreferenceKey -> onGloballyPositioned / LazyListState.layoutInfo ; glass material -> MeeshyGlassSurface.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelFeedLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostRow.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`

### Copier ou partager le lien suivi d'un post, jamais une impasse

`rfp-post-share-link` · Android : **divergente** · P1 · effort S

Le menu ... du détail (Copier le lien, Partager) comme celui du fil et du lecteur frappent le même lien suivi : POST /posts/:id/share?generateLink=true enregistre le partage dédupliqué, crée le TrackingLink de l'appelant et renvoie une URL courte meeshy.me/l/<token> (utm medium=share ajouté par la passerelle) ; selon l'action, le lien va au presse-papiers (toast "lien copié") ou à la feuille de partage système ; si la création échoue (hors ligne, limite, passerelle), l'URL brute du post est quand même offerte (seule l'attribution analytique est perdue). Verrou anti double-tap par post, haptique légère.

Écarts :
- Android enregistre le partage (POST posts/{id}/share sans generateLink) puis partage une URL brute https://meeshy.me/post/{id} : aucun lien suivi, aucune attribution : ajouter le paramètre generateLink=true et lire l'URL courte
- Copier le lien vers le presse-papiers avec toast de confirmation ; repli sur l'URL brute si la création échoue
- Verrou anti double-tap par post (ensemble d'ids en vol) et partage identique depuis fil, détail et lecteur de réels
- Source de fichier de partage (miniature/aperçu du post) dans la feuille système

Rendu : Toast pill de confirmation de copie, feuille de partage système.

Transposition Android : UIActivityViewController -> Intent.createChooser avec EXTRA_TEXT/EXTRA_STREAM ; presse-papiers -> ClipboardManager.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+ShareLink.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### Toucher l'humeur d'un ami fait apparaître une bulle de pensée, joue son vocal et propose d'y répondre

`rfp-status-bubble-reply` · Android : **divergente** · P1 · effort M

StatusBubbleOverlay dessine une bulle de verre ancrée sur l'avatar avec trois petites bulles de pensée (4, 7, 10 pt), largeur min(250, écran−48), retournée au-dessus si l'ancre est dans la partie basse (> 45 % de la hauteur). Contenu : texte (3 lignes), ou lecteur audio (play/stop + progression, démarre à l'apparition), « via @user », heure relative et bouton « Republier ». Toucher la bulle répond à l'humeur ; la fermeture se fait par toucher dehors ou glissement. StatusBubbleController enregistre la vue (surface moodAvatar) hors auteur, démarre la session d'engagement `statusBubble` et, à la réponse, passe par une confirmation « Répondre à cette humeur ? » (Quitter / Répondre) sauf en conversation directe de l'auteur où la réponse est immédiate. Accessibilité : un seul élément avec libellé, valeur de progression et actions.

Écarts :
- Android affiche un popover (emoji, nom, texte, via, expiration, résumé et sélecteur de réactions, Republier) au lieu de la bulle de pensée ancrée : reproduire la bulle (3 cercles décroissants, retournement au-dessus selon l'ancre, largeur max 250 dp)
- Lecture du vocal dans la bulle (play/stop + progression linéaire, lecture automatique à l'apparition, arrêt à la disparition) et libellé « Humeur audio »
- Répondre à l'humeur : toucher la bulle ouvre la confirmation « Répondre à cette humeur ? » (Quitter/Répondre) puis le composeur de réponse ; réponse immédiate si on est dans la conversation directe de l'auteur
- Enregistrer la vue de l'humeur (surface moodAvatar) pour les humeurs d'autrui et démarrer/clore la session d'engagement `statusBubble` ; Android n'appelle que `markStatusViewed`
- Fermeture au toucher extérieur ou au glissement, animation par ressort (réponse 0,28 / 0,72) avec décalage progressif des trois cercles
- Accessibilité : élément unique avec libellé (contenu ou « Humeur audio », ancienneté, via), hint « Toucher pour répondre à cette humeur », actions personnalisées
- Déclencher la bulle depuis l'avatar d'une conversation ou d'un profil (`moodTapHandler`), pas seulement depuis la barre

Rendu : Bulle de verre (adaptiveGlass) arrondie md, bordure en dégradé de la couleur d'avatar (30 %) vers blanc 10 %, ombre douce (rayon 10, y 4), texte subhead en couleur primaire, heure et « via » en textMuted, bouton Republier indigo400 avec icône arrow.2.squarepath ; le scale part de l'angle d'ancrage (0,2 → 1).

Transposition Android : overlay positionné sur ancre → Popup Compose avec offset calculé depuis les bounds de l'avatar (onGloballyPositioned) ; AudioPlaybackManager → lecteur audio ExoPlayer/MediaPlayer

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarPresentation.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationMoodStatus.kt`

### J'envoie un commentaire ou une réponse : il apparaît tout de suite et se rattrape s'il échoue

`rfp-comment-send-reply-optimistic` · Android : **partielle** · P0 · effort M

sendComment/sendReply insèrent un commentaire optimiste (id = clientMutationId) avec langue d'origine, lieu, effets, citation de média, incrémentent commentCount et le compteur de réponses du parent, mettent la ligne en outbox `.createComment` et annulent le tout (compteurs compris) à l'épuisement avec un toast. Une réponse à une réponse se rattache au commentaire racine (threading plat) et déplie le fil. submitCommentWithMedia téléverse d'abord les médias puis crée le commentaire avec reprise ; si l'envoi direct échoue il est confié à l'outbox avec les médias déjà acquis. discardUnsentComment retire un commentaire jamais parti.

Écarts :
- Passer l'envoi par l'outbox (`CREATE_COMMENT` + clientMutationId) : Android appelle `addComment` en direct, donc un commentaire tapé hors-ligne est perdu et il n'y a pas d'idempotence
- Commentaire avec médias (voir rfp-comment-media-upload-publisher), lieu partagé, effets de message (`effectFlags`) et citation de média (`quotedPostMediaId`)
- Réconciliation avec l'écho `comment:added` via `clientMutationId` (remplacer l'optimiste, pas le doubler)
- Rollback complet à l'épuisement : retirer l'optimiste, décrémenter commentCount et replies du parent, refermer le fil s'il n'était pas ouvert, toast « Impossible d'envoyer le commentaire/la réponse » (ou limite quotidienne)
- Persister le fil de commentaires dans le cache (`savePreservingFreshness`) après chaque envoi optimiste
- Action « Supprimer ce commentaire non envoyé » (`discardUnsentComment`) pour une ligne en échec
- Détection de langue d'origine du commentaire (`originalLanguage`) envoyée avec le payload

Rendu : Ligne optimiste atténuée avec petit indicateur d'envoi, passe à l'état normal à la confirmation ; réponses indentées sous le parent avec « Voir N réponses » ; haptique légère à l'envoi.

Transposition Android : OfflineQueue.enqueueComment → OutboxRepository (nouvelle OutboxKind) ; FeedbackToastManager → Snackbar

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel+CommentSend.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentRepliesState.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/ReplyMentionPrefill.kt`

### Ouvrir les commentaires en feuille depuis le fil, un réel ou un détail, sans quitter l'écran

`rfp-comments-sheet` · Android : **partielle** · P0 · effort M

CommentsSheetView : feuille translucide avec titre et compte ("N commentaires"), fermeture, liste de fils racine paginée par curseur, fils de réponses paginés à la demande (toggleThread/loadMoreReplies, chasse paginée bornée jusqu'à une cible), aperçu des réponses préchargé depuis le cache à la ré-présentation, hydratation cache-first : le fil n'embarque que 3 commentaires, la feuille charge la première page complète si le total serveur dépasse ce qui est embarqué (cache frais servi sans refetch, périmé servi + refresh silencieux), fusion de la page fetchée sans écraser les lignes locales optimistes tmp_ ni l'écho socket arrivé pendant le GET (CommentSheetRules), jamais de persistance d'une ligne optimiste non confirmée dans le cache, amorçage des cœurs depuis currentUserReactions. La même feuille sert fil, réels et détail (callback onCommentSent pour que l'hôte incrémente son compteur) ; l'envoi est optimiste avec retour arrière, les suppressions confirment par toast.

Écarts :
- Deux implémentations distinctes (PostCommentsSection dans le détail, ReelCommentsSheet pour les réels) alors qu'iOS n'a qu'une feuille : unifier sur un seul composable/ViewModel de commentaires réutilisable (fil, réel, détail, story)
- Aucune feuille de commentaires depuis la carte du fil : le bouton commentaire ouvre le détail ; ajouter la feuille (ModalBottomSheet grande détente) avec callback onCommentSent
- Chargement complet quand le total serveur dépasse les 3 embarqués, cache frais sans refetch / périmé + refresh silencieux, fusion qui préserve lignes optimistes et échos socket
- Cache : ne jamais persister les lignes optimistes tmp_/cmid_ ; préchargement des aperçus de réponses depuis le cache
- Chasse paginée bornée pour atteindre un commentaire cible au-delà de la page 20
- Toasts de suppression/erreur et compteur de l'hôte mis à jour

Rendu : Feuille translucide, grabber, titre avec compteur, liste à fils, composer collant en bas, grandit en détente haute à l'ouverture du panneau de pièces.

Transposition Android : sheet(item:) + presentationDetents -> ModalBottomSheet avec skipPartiallyExpanded = false.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet+Loading.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentSheetRules.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentThreadState.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentRepliesState.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsSheet.kt`

### Le fil s'affiche instantanément depuis le cache et se complète page après page sans saut

`rfp-feed-cache-first-pagination` · Android : **partielle** · P0 · effort M

FeedViewModel lit d'abord le cache « main-feed » : fresh affiche, stale affiche et revalide en silence, expired/empty va au réseau (spinner seulement si la liste est vide). Pagination par curseur (20 par page, déclenchée à 5 éléments de la fin) protégée par une génération de fil qui ignore les pages tardives. Un rafraîchissement conserve la tête temps réel et les pages déjà scrollées, réapplique les likes en attente, puis sauvegarde le cache avec 2 s de délai (100 posts max). Un échec de page retombe sur le store GRDB, et les langues préférées recalculent les posts résolus.

Écarts :
- Persister le fil sur disque (entité Room FeedEntity) : `PostRepository._feedCache` n'est qu'un cache mémoire (« Phase 1 »), donc un démarrage à froid hors-ligne affiche un écran vide
- Un refresh/revalidation (`revalidateFeed`) remplace toute la liste par la première page : porter `mergePreservingLoadedPages` pour garder les pages déjà chargées et `mergePreservingRealtimeHead` pour la tête arrivée en socket
- Ajouter un compteur de génération (`feedGeneration`) pour ignorer une page `loadMore` revenue après un refresh
- Sauvegarde du cache différée de 2 s plafonnée à 100 posts, et `patchEverywhere(itemId)` pour muter un post dans toutes les clés de cache (feed, favoris, détail)
- Réappliquer les likes/bookmarks encore en outbox après revalidation (`reapplyPendingLikes`), y compris après un kill de l'app
- Recalculer les posts résolus quand les langues préférées (système, régionale, personnalisée) changent en cours de session
- Replier sur le cache disque quand une page échoue, et n'afficher l'erreur que si la liste est vide
- Prefetch des commentaires (`prefetchComments`, page de 20) pour les posts proches de l'écran

Rendu : Skeleton uniquement sur cache vide à froid, jamais de spinner sur un cache non vide. Pastille « N nouveaux posts » en tête de liste (newPostsCount) qui remet à 0 au toucher ou au pull-to-refresh. Pied de liste discret pendant le chargement de page, état d'erreur plein écran seulement si aucune donnée.

Transposition Android : GRDB/CacheCoordinator → Room (FeedEntity + DAO) derrière PostRepository.feedStream, CacheResult Fresh/Stale/Syncing/Empty déjà présent

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+Pagination.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedCache.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedCacheSaver.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedRealtimeHead.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Lire le texte d'un post avec mentions, hashtags, liens suivis, Voir plus et traduction discrète

`rfp-feed-card-body-prism` · Android : **partielle** · P0 · effort M

Le corps d'une carte passe par MessageTextRenderer (URL suivies via trackedLinkMap, @mentions validées, #hashtags cliquables, couleurs lisibles claires/sombres), s'abrège en mots avec Voir plus / Voir moins, applique le Prisme (texte servi = traduction du rang le plus prioritaire, original sinon), affiche une bande de drapeaux (original + traductions, max 4) dont un tap ouvre le panneau de traduction secondaire inline et une icône translate ouvrant la feuille de traduction, détecte une vidéo YouTube dans le contenu et la rend en façade (FeedPostEmbedRow, Equatable pour ne scanner qu'une fois), et rend le contenu repartagé (auteur d'origine, likes, médias). La hauteur de média dérive du ratio (fittedMediaHeight, bornée).

Écarts :
- Le contenu est un Text brut dans SelectionContainer : aucun rendu des @mentions, #hashtags, URL cliquables ni réécriture vers les liens suivis (/l/token)
- Pas de Voir plus / Voir moins (troncature en mots), ni de mise en page de hauteur pour les longs textes
- Bande de drapeaux présente (PostLanguageStripRow) : manque l'icône translate et le panneau de traduction secondaire inline (séparateur coloré par langue) ; vérifier que le rang du Prisme est respecté (l'original concourt à son rang)
- Pas de façade vidéo YouTube détectée dans le texte
- Contenu repartagé : RepostEmbedCell présent mais sans drapeaux de langue du post cité ni compteur de likes
- Hauteur de média bornée par le ratio (plancher 0,75, plafond 1,25 vs largeur) à appliquer aux médias seuls
- Cartes stables : clé et @Immutable sur FeedPostPresentation pour éviter la recomposition de toute la liste

Rendu : Corps en body du thème, mentions/hashtags aux couleurs mentionColor/hashtagColor claires/sombres, Voir plus en accent, bande de drapeaux discrète sous le texte, panneau secondaire à fond pastel de la langue.

Transposition Android : MessageTextRenderer -> AnnotatedString + LinkAnnotation (Compose 1.7) avec détection URL/@/# partagée dans sdk-ui ; NSDataDetector -> Linkify/regex précompilée.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostCardLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostEmbedRow.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PostTranslationMerge.kt`

### Voir les médias d'un post dans le fil : image, vidéo, audio, document, carrousel avec légende

`rfp-feed-card-media` · Android : **partielle** · P0 · effort L

Un média seul garde son rendu : image bornée en ratio, vidéo inline (FeedVideoMediaCell avec lecture, durée, politique de téléchargement), audio (lecteur à forme d'onde et transcription), document (carte avec nom et pages). À partir de deux médias la carte monte un carrousel (FeedPostCardCarousel, vue 3f) : un média à la fois à la taille de la carte avec SA légende, compteur "n / N", pastilles et flèches précédent/suivant ; les mosaïques ont disparu. La légende se superpose à l'image (FeedCaptionOverlay) abrégée aux 20 premiers mots avec Développer/Réduire (troncature en mots, indépendante de Dynamic Type). Le texte alternatif de l'auteur (sinon la légende servie dans la langue du lecteur) est lu par VoiceOver. L'aperçu de repost affiche "+N". Un tap ouvre la galerie plein écran partagée.

Écarts :
- Seules les images sont rendues (FeedPostImage) ; vidéo, audio et document d'un post sont perdus dans le fil : ajouter la vidéo inline (poster, durée, lecture, règle d'auto-téléchargement MediaDownloadPolicy), le lecteur audio avec forme d'onde et transcription, et la carte document
- Le fil Android garde le choix mosaïque/carrousel selon le layout du post alors que iOS impose le carrousel dès 2 médias ; aligner (ou documenter) le choix de mise en page
- Légende superposée à l'image (20 premiers mots + Développer/Réduire) absente : FeedMediaCaption existe mais sans la règle en mots ni la surcouche
- Texte alternatif : confirmer qu'il est lu par TalkBack (alt sinon légende servie) sur la tuile seule, le carrousel et la mosaïque
- Badge "+N" pour les médias au-delà de l'aperçu d'un repost
- Ouvrir la galerie plein écran partagée aussi pour vidéo/audio/scène (voir rfp-social-gallery)
- Pastilles et flèches du carrousel avec libellés d'accessibilité localisés (déjà partiellement)

Rendu : Média plein largeur de carte, coins arrondis, pilule de durée en bas à gauche, légende sur voile sombre en bas de l'image, compteur "1 / 3" en pilule, pastilles centrées sous le média.

Transposition Android : FeedVideoMediaCell -> PlayerView Media3 inline avec pool partagé ; AudioPlayerView -> composable audio de sdk-ui (AudioTrackSurface) ; document -> carte avec icône + taille/pages.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostCardCarousel.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedCaptionOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostMediaAccessibility.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostMedia.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaCarousel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaMosaic.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaGallery.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`

### Les likes, commentaires, reposts, réactions et traductions des posts apparaissent en direct

`rfp-feed-realtime-sync` · Android : **partielle** · P0 · effort M

FeedSocketHandler sérialise tous les événements sociaux dans une file ordonnée et les écrit dans la persistance GRDB : post created/updated/deleted/liked/unliked/reposted/bookmarked/translation-updated, comment added/deleted/liked/media-updated, réactions de post et de commentaire (added, removed, sync). FeedViewModel+Socket abonne la room feed, se resynchronise à chaque reconnexion (`didReconnect`), remplace le post ou commentaire optimiste par le contenu serveur via `clientMutationId`, ignore les reposts de la tray de stories et préserve une traduction choisie manuellement.

Écarts :
- Pas de signal de reconnexion dans SocialSocketManager : exposer `didReconnect` et déclencher un refresh de tête + ré-abonnement `subscribeFeed` (aujourd'hui une coupure laisse le fil périmé)
- Écouter et modéliser `post:reaction-added`, `post:reaction-removed`, `post:reaction-request-sync`, `comment:reaction-sync` et `comment:media-updated` (absents de la liste des `listen(...)`)
- Réconcilier le post/commentaire optimiste par `clientMutationId` dans `post:created` et `comment:added` plutôt que par simple dédoublonnage d'id
- Ignorer `post:reposted` dont le repost appartient à la tray de stories (`belongsToStoryTray`)
- File d'événements ordonnée (équivalent OrderedEventLane) pour qu'un like/unlike rapide ne s'inverse pas
- Écrire chaque événement dans le cache disque (compteurs de likes/commentaires, réactions agrégées, médias de commentaire) pour qu'ils survivent au redémarrage
- Traductions : préserver un choix manuel de langue (`manualTranslationOverrides`) et patcher le cache disque quand `post:translation-updated` ou `comment:translation-updated` arrive

Rendu : Aucun chrome propre : les compteurs de likes/commentaires/réactions changent en place sans animation de liste ; un nouveau post temps réel s'insère en tête et incrémente la pastille « nouveaux posts » sans faire sauter la position de scroll.

Transposition Android : Combine PassthroughSubject → SharedFlow du SocialSocketManager; OrderedEventLane → Channel/actor Kotlin sérialisé; reconnexion Socket.IO → callback `Socket.EVENT_CONNECT` après première connexion

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+Socket.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedRealtimeHead.kt`

### Ouvrir le fil : en-tête qui se replie, stories, composer, rafraîchir, squelette, erreur, nouveaux posts

`rfp-feed-screen` · Android : **partielle** · P0 · effort M

Le fil iOS est un ScrollView paginé dans un fond ambiant rasterisé (FeedAmbientBackdrop : dégradé du thème + orbes floutés en une texture). En haut, un CollapsibleHeader "Meeshy Feed" dont le titre cède la place à la bande de stories compacte au défilement, avec deux actions (lancer les Réels, avec menu contextuel "ouvrir dans une nouvelle fenêtre" sur iPad ; À proximité) qui se masquent pendant le défilement. Le contenu : plateau de stories complet (hors tablette), placeholder de composer (avatar + "Partager quelque chose avec le monde…" + menu plus : Photo ou vidéo, Appareil photo, Enregistrement audio, Fichier, Position), carte d'erreur avec Réessayer, vide "Aucune publication", squelette de fil sur cache vide (jamais de spinner si le cache a des données) puis 2 squelettes en pagination, rangée par post (FeedPostRow) avec préchargement des médias et des commentaires à l'apparition et comptage d'impressions à chaque apparition, tirer pour rafraîchir (fil + stories), capsule dégradée "N nouveaux posts" qui remonte en haut avec haptique, abonnements sockets (post:liked/unliked, réactions ajoutées/retirées, favori), offset de scroll relayé sans réévaluer le corps. Une porte (FeedPostComposerDoor) ramasse le signal "Publier un post" des accès rapides, aussi à l'apparition du fil iPad.

Écarts :
- Erreur : seulement un snackbar ; ajouter la carte d'erreur (icône, "Impossible de charger le fil", détail, Réessayer) en tête de liste
- Vide : simple texte ; utiliser l'état vide illustré "Aucune publication / Les publications de vos contacts apparaîtront ici"
- Plateau de stories absent du FeedScreen (seule la StatusBar y est) : monter la bande de stories complète en tête de liste et la version compacte dans l'en-tête au défilement
- En-tête repliable avec titre qui cède la place à la bande de stories ; actions Réels / À proximité masquées pendant le défilement
- Menu plus du placeholder de composer (Photo/vidéo, Appareil photo, Enregistrement audio, Fichier, Position) ouvrant le composer sur le bon sélecteur initial
- Fond ambiant (dégradé du thème + orbes floutés rasterisés) au lieu du seul MeeshyBackground
- Squelette de pagination (2 cartes) au lieu du CircularProgressIndicator ; préchargement des médias et des 3 premiers commentaires à l'apparition de chaque rangée
- Impressions : iOS compte UNE par apparition à l'écran (isVideo selon le type) avec flush à la sortie/arrière-plan ; Android appelle trackImpression par id (vérifier la règle "par apparition" et le flush)
- Ouvrir le composer à la demande d'un accès rapide "Publier un post" (deep link / App Shortcut)
- Relais d'offset de scroll sans recomposer toute la liste (derivedStateOf), rafraîchissement conjoint des stories

Rendu : Espacement lg entre cartes, marge basse 100 dp pour la barre flottante, placeholder dans une carte surfaceGradient à bordure indigo (25 %) avec bouton plus rond 40 dp en dégradé indigo300 -> info, capsule de nouveaux posts en dégradé horizontal avec ombre indigo, transition move(top)+opacity ressort 0,4/0,75.

Transposition Android : CollapsibleHeader -> TopAppBar à défilement (enterAlways/exitUntilCollapsed) ; MeeshyRefreshableScroll -> PullToRefreshBox (déjà là) ; App quick action -> App Shortcut / intent ACTION composer.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedAmbientBackdrop.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedScrollPublication.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedView+Composer.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedHeader.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`

### Ouvrir un post affiche son détail instantanément, se met à jour en direct et compte ma visite une seule fois

`rfp-post-detail-screen` · Android : **partielle** · P0 · effort M

PostDetailViewModel charge le post cache-first (fresh/stale/expired), classe l'absence (hors-ligne, serveur, indisponible, supprimé) en `ContentFetchFailure`, rejoint la room du post, se resynchronise à la reconnexion (post + commentaires), applique en direct likes, commentaires, éditions, traductions, médias de commentaire et réactions. registerDetailOpen compte l'ouverture une fois par instance avec la source d'entrée (listing, notification, lien). Actions du détail : like optimiste avec réconciliation serveur, signaler, supprimer/retirer, épingler, modifier.

Écarts :
- Cache-first du détail : servir le post du cache du fil/disque instantanément (fresh/stale) avant le réseau ; Android montre skeleton puis fetch
- Classification de l'absence (`ContentFetchFailure` : connexion, serveur, supprimé/indisponible) avec message et bouton « Réessayer » dédiés
- Resynchronisation à la reconnexion (rafraîchir post + première page de commentaires)
- Comptage d'ouverture avec source d'entrée (`recordSocialEvents` impression + view avec `entry`) au lieu de `posts/{id}/view`
- Actions du détail : signaler avec motif, supprimer avec confirmation, retirer/rendre privé (modération), épingler, modifier
- Traductions du post et de ses commentaires en direct, y compris `comment:media-updated`
- Persistance du post consulté dans le cache disque (équivalent insertPost GRDB)

Rendu : Carte du post complète en tête (média plein largeur, statistiques cliquables : likes, commentaires, reposts, vues), puis fil de commentaires et composeur épinglé ; états vide/chargement/erreur/hors-ligne dessinés.

Transposition Android : NavigationStack push → destination Compose Navigation avec argument postId (+ commentId)

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel+PostActions.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`

### Chaque post et commentaire porte tous ses compteurs, médias, langues, mentions et décor d'auteur

`rfp-post-domain-models` · Android : **partielle** · P0 · effort M

FeedPost/FeedComment/APIPost/APIPostComment/RepostContent modélisent le contenu complet : compteurs (likes, commentaires, reposts, favoris, partages, vues, ouvertures, impressions, vues uniques et anonymes, vues qualifiées, lectures), états du lecteur (isLiked, isBookmarkedByMe, isRepostedByMe, viewerPoints), traductions, mentions (PostReference avec affichage INLINE/PINNED/NOTE/SILENT), liens suivis, anneau d'avatar (authorRing), effets de scène, audio, lieu, expiration. Les commentaires portent médias, lieu, citation de média, effets de message, réactions du lecteur. FeedPost+ReelPage fournit l'égalité de rendu d'une page de réel, et PostType ordonne POST/REEL/STORY/STATUS.

Écarts :
- `ApiPostComment` ne déclare pas `media`, `location`, `quotedCitation`, `trackedLinks`/`trackedLinkMap`, `author.avatarRing` : les décoder (sinon les médias de commentaires sont jetés)
- `ApiPost` : ajouter `postOpenCount`, `qualifiedViewCount`, `playCount`, `uniqueViewCount`, `anonymousViewCount`, `anonymousUniqueViewCount`, `viewerPoints`, `trackingLinks`, `authorRing`, `mentions` typées en `PostReference` (INLINE/PINNED/NOTE/SILENT, `isPubliclyVisible`) au lieu de `mentionedUsers`
- `RepostContent` complet (audioUrl, moodEmoji, storyEffects, media, translations, originalRepostOfId, visibility, expiresAt, location, mentions) ; `ApiRepostOf` actuel est plus étroit
- `PostType` avec STORY/STATUS et icône/libellé localisés (« Post », « Réel », « Story », « Statut »)
- `PostMediaPresentation` (carousel vs horizontalSlides pour les réels) et `mediaPresentation` du post
- Égalité de rendu `rendersSameReelPage` pour éviter de recomposer une page de reel inchangée
- Couleur d'auteur déterministe (`DynamicColorGenerator.colorForPost`) par auteur/type/langue pour les avatars sans photo
- `topComments` (3 commentaires les plus aimés) pour l'aperçu sous la carte
- Mapping `FeedComment(api:preferredLanguages:parentId:)` qui résout le Prisme du commentaire et copie les traductions

Rendu : Aucun rendu direct ; les modèles alimentent la carte de post (compteurs formatés compacts, pastilles de langue, anneau d'avatar, badge d'épinglage/édition).

Transposition Android : Codable Swift → kotlinx.serialization ; CacheIdentifiable → clé d'entité Room ; ServedProfileDecorItem → modèle de décor de profil existant s'il y en a un

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedPost.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedPost+ReelPage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostType.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostReference.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedComment.swift`
- `apps/ios/Meeshy/Features/Main/Models/FeedComment+API.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Post.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Feed.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PostUpdateMerge.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentPresentation.kt`

### Les posts affichent vidéos, audios et documents en plus des images, avec légendes et dimensions fidèles

`rfp-post-media-types-presentation` · Android : **partielle** · P0 · effort L

FeedMedia décrit chaque média (image, vidéo, audio, document) : url, vignette, thumbHash, couleur de vignette, dimensions (aspect ratio), durée, nom/taille/pages de document, légende/alt par langue, transcription et pistes audio traduites, variantes d'image. MAX_POST_MEDIA = 10 par post. PostMediaPresentation choisit carrousel (posts) ou diaporama horizontal (réels). La carte de post rend chaque type avec son propre lecteur.

Écarts :
- Le fil ne rend que les images (`FeedPostBuilder` filtre `isImage`) : ajouter les cartes vidéo (lecteur inline avec vignette, durée, play, lecture muette auto), audio (lecteur avec forme d'onde, durée, transcription et piste traduite du Prisme) et document (nom, taille, nombre de pages, ouverture)
- Modèle `FeedMedia` côté présentation : type, thumbHash, thumbnailColor, aspectRatio, durationFormatted, fileName/fileSize/pageCount, captionTranslations, transcription, translatedAudios, imageVariants
- Plafond `MAX_POST_MEDIA = 10` appliqué au composeur et à l'édition
- `PostMediaPresentation` : diaporama horizontal pour les réels à images multiples, carrousel pour les posts
- Posts à scène canvas (`storyEffects.canvasV3`) rendus via le lecteur de scène plutôt que par les médias bruts
- Description d'accessibilité du média (alt, sinon légende résolue)

Rendu : Carte vidéo avec vignette thumbHash puis frame, badge durée en bas à droite, bouton play centré, son coupé par défaut ; carte audio avec waveform et vitesse ; carte document avec icône colorée (thumbnailColor), nom tronqué, taille et pages. Respect de l'aspect ratio réel, coins arrondis xl.

Transposition Android : AVPlayer/StoryMediaLoader → ExoPlayer (ReelVideoSurface) + lecteur audio existant du chat ; thumbHash déjà géré par rememberThumbHashPainter

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedMedia.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedMediaType.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostMediaPresentation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostMediaLimits.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostMedia.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaCarousel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaGallery.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaMosaic.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`

### Supprimer, signaler, épingler, partager ou commenter un post depuis le fil avec retour immédiat

`rfp-post-owner-actions-menu` · Android : **partielle** · P0 · effort M

FeedViewModel+PostActions : suppression optimiste (retrait local, rollback à la bonne position si échec, toast), signalement (toast succès/erreur), épinglage, partage qui génère un lien court (`POST /posts/{id}/share` avec plateforme et generateLink → shortUrl), commentaire optimiste depuis la carte (cmid, outbox, rollback par flux d'issue), repost simple ou citation, et mise à jour d'un post (édition) avec rollback. Le retrait d'un post est routé par `PublicationWithdrawal` (supprimer, rendre privé avec motif).

Écarts :
- Suppression optimiste : retirer le post tout de suite et le remettre à son index si l'appel échoue (`OptimisticRollback.restoring`), au lieu du `refresh()` après coup
- Toasts de résultat pour suppression (« Publication supprimée »), signalement (« Publication signalée »), épinglage (« Publication épinglée »), partage et favori
- Partage avec lien court : appeler `POST /posts/{id}/share` avec `platform` et `generateLink=true`, partager le `shortUrl` renvoyé (aujourd'hui l'URL `https://meeshy.me/post/{id}` est codée en dur)
- Commentaire rapide depuis la carte du fil (`sendComment` optimiste avec cmid, langue d'origine, lieu, effets)
- Épingler/désépingler avec retour d'état (unpin existe dans PostRepository sans appelant)
- Signalement avec motif choisi (écran de raisons) plutôt qu'un type fixe « inappropriate »
- Brancher les actions de modération « Retirer » et « Rendre privé » dans le même menu (voir rfp-moderator-content-removal) et « Modifier » pour ses propres posts

Rendu : Menu d'options en haut à droite de la carte, éléments destructeurs en rouge séparés par un séparateur ; confirmation avant suppression ; haptique moyenne sur suppression.

Transposition Android : menu contextuel SwiftUI → DropdownMenu/ModalBottomSheet existant (PostActionMenu) ; share sheet iOS → Intent.ACTION_SEND avec le lien court

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+PostActions.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostActionMenu.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`

### Tous les gestes sociaux (hashtags, retrait modéré, édition complète, traduction de légende, télémétrie) ont leur appel réseau

`rfp-post-service-endpoints` · Android : **partielle** · P0 · effort M

PostService expose tout le contrat posts : feed, reels (avec seedReelId), hashtag et hashtags tendance, création (nombreuses surcharges : visibilité nominative, lieu, mentions, précision de découvrabilité, canvas, transcription mobile, son emprunté), update avec PostEditDraft, delete avec motif, makePrivate, like/unlike, bookmarks, commentaires (list, replies, create, update, delete avec motif, like), repost avec clientMutationId, share avec lien court, createStory/createCanvasPost, requestTranslation et requestMediaCaptionTranslation, pin/unpin, getPostViews, posts d'un utilisateur ou d'une communauté, `recordSocialEvents` (POST /social/events), publishAttachment.

Écarts :
- Ajouter à PostApi : `GET posts/hashtag/{tag}` et `GET hashtags/trending`
- `DELETE posts/{id}` et `DELETE posts/{id}/comments/{commentId}` avec motif (retrait modéré), et `makePrivate(postId, authorId, reason)`
- `PUT posts/{id}/comments/{commentId}` (édition de commentaire : content, effectFlags, originalLanguage)
- `UpdatePostRequest` complet (visibilityUserIds, originalLanguage, type, removeMediaIds, storyEffects, mediaIds, location, mentions, allowSoundExtraction, mediaAlt, mediaCaption) et `CreatePostRequest` complet (visibilityUserIds, mentions, discoverabilityPrecision, mobileTranscription, repostOfId, storyEffects, mediaCaption/mediaAlt, audioDuration)
- `POST posts/{id}/share` avec corps {platform, generateLink} et lecture du `shortUrl`/token
- `POST social/events` (lots de vues, impressions, dwell, watch samples) avec credential compte/anonyme ; `requestMediaCaptionTranslation(mediaId, lang)`
- `createCanvasPost`, `publishAttachment(attachmentId, target, content, capturedInApp)`, `GET posts/nearby/density`, en-têtes `X-Client-Mutation-Id` sur création, commentaire et repost
- Contexte de liste (`ListingContextLedger`) pour attribuer l'impression à la surface d'origine

Rendu : Pas de rendu ; contrat réseau uniquement.

Transposition Android : APIClient.paginatedRequest → Retrofit PostApi + apiCall/NetworkResult existants ; protocole PostServiceProviding → interface injectable du PostRepository

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Le pager de reels s'ouvre aussitôt depuis le fil, garde un ordre stable et gère likes, favoris, reposts, retrait et erreurs

`rfp-reels-thread-pager` · Android : **partielle** · P0 · effort L

ReelsViewModel se pré-remplit du fil déjà chargé (le reel touché est la graine du fil d'affinité), ou démarre à froid depuis le cache puis le réseau ; pagination curseur (seuil 3 avant la fin) avec la graine renvoyée à chaque page et un ordre STABLE sous le doigt (ReelThreadOrder.refreshed/appended : le reel regardé et ce qui le précède ne bougent pas). Échec réseau : le curseur est conservé pour réessayer, l'écran vide dit « panne » et offre « Réessayer ». Like par socket (réaction ❤️) avec repli REST et rollback seulement si les deux échouent, réaction emoji additive, favori optimiste, repost, partage (lien court), suppression/retrait, signalement, épinglage, modification, abandon de la room du reel actif à la fermeture, retrait d'un reel supprimé en direct, compteurs de commentaires locaux. Enregistre la vue et l'impression par reel.

Écarts :
- Ne retenir que les reels vidéo (`ReelBuilder` filtre `video/`) : ajouter les reels audio, à diaporama d'images (au moins 2 images) et à scène canvas, avec `primaryReelDisplayMedia`
- Ordre stable `ReelThreadOrder.refreshed(current, anchorId, served)` / `appended` : conserver le reel regardé et ses prédécesseurs, dédoublonner
- État d'erreur d'écran vide avec message et bouton « Réessayer » (`retryLoad`) ; en cas d'échec conserver curseur et hasMore
- Like par socket (`post:reaction-add/remove` ❤️ avec délai) puis repli REST, verrou anti double-tap, rollback uniquement si le REST échoue aussi, message de limite quotidienne
- Réaction emoji additive (long-press sur le cœur → palette), haptique légère au like
- Menu propriétaire/modération du reel : supprimer, retirer, rendre privé, signaler, épingler, modifier ; partage par lien court
- Retirer en direct un reel supprimé (`post:deleted`), quitter la room du post actif à la fermeture, mise à jour du compteur de commentaires local (`didSendComment`)
- Enregistrer vue/impression par reel (social events) avec la source d'entrée, pas seulement la dwell
- Compteurs affichés avec formatage compact et état `isReposted`

Rendu : Pager vertical plein écran noir, vidéo en cover, auteur + légende (3 lignes) en bas à gauche, rail d'actions vertical à droite (cœur, commentaires, repost, favori, partage avec compteurs), état vide « panne » centré avec Réessayer, indicateur de chargement de page discret.

Transposition Android : AdaptiveVerticalPager → VerticalPager Compose ; DailyGestureLimitNotice → Snackbar

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ReelsViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Media/ReelThreadOrder.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelPresentation.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsSheet.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Regarder un réel vidéo : poster immédiat, boucle, tap pour pause, barre de lecture glissable

`rfp-reels-video-page` · Android : **partielle** · P0 · effort M

Une page de réel vidéo montre d'abord le poster (vignette, shimmer à froid) puis la vidéo jouée par le moteur partagé (ReelVideoView / ReelVideoSurface, calque AVPlayerLayer), en boucle, plein cadre aspect-fill avec cadrage adapté. La lecture ne démarre qu'une fois la révélation terminée et sans appel actif (porte d'autostart partagée avec l'audio). Un tap alterne lecture/pause (premier tap en mode immersif = restaurer le chrome seulement), une barre de progression ReelScrubBar se fait glisser pour chercher (haptique légère, cible de glissé verticale étroite) et n'apparaît que pour la vidéo active. La langue de la piste consommée est publiée, le premier frame lu est mesuré, et la vidéo sortante rend son lecteur au pool.

Écarts :
- Pas de poster : ReelPresentation.posterUrl est lu mais jamais affiché ; afficher la vignette (Coil) avec shimmer jusqu'au premier frame, puis fondu vers la vidéo
- Tap sur le média sans effet : ajouter pause/lecture au tap, avec la règle "premier tap en mode immersif ne fait que restaurer le chrome"
- Aucune barre de progression ni seek : ajouter ReelScrubBar (glisser pour chercher, position/durée, haptique, teinte d'accent de l'auteur) visible seulement sur le réel vidéo actif
- Boucle OK mais pas de porte d'autostart (révélation terminée, pas d'appel actif) ni de reprise à la fin d'un appel
- Le player est recréé à chaque page (remember(mediaUrl)) : brancher le pool de lecteurs mutualisé (fonctionnalité instant-switch) et libérer au retrait
- Mesure du premier frame lu et publication de la langue de piste consommée (utile à la télémétrie et au Prisme audio)
- Cadrage : iOS adapte l'aspect (poster fit) ; ici crop systématique via ResizeMode.ZOOM ; vérifier le rendu des vidéos paysage (bandes floutées ou fit)

Rendu : Média plein cadre sous le voile bas (MediaChromeVeil.reelPlayer), barre de progression fine en bas au-dessus de l'inset, teinte d'accent = authorColor, 44 dp de zone tactile utile sur la barre.

Transposition Android : AVPlayerLayer UIViewRepresentable -> PlayerView (Media3) dans AndroidView avec surface TextureView/SurfaceView ; SharedAVPlayerManager -> pool ExoPlayer partagé dans sdk-ui ; PiP éventuel -> Picture-in-Picture Android (optionnel).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Video.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelPageChrome.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### Créer un post ou réel audio : enregistrer ou importer un son, vérifier, refaire, supprimer, publier

`rfp-audio-post-composer` · Android : **partielle** · P1 · effort L

AudioPostComposerView (feuille) enchaîne les phases idle / enregistrement / transcription / aperçu. La capture passe par la feuille unifiée AudioRecorderSheet (même composant que le composer de story : enregistrement, fichiers, bibliothèque de sons), avec import de fichier audio (mp3, wav, aac, ogg, m4a ; erreur localisée) et réutilisation d'un son de la bibliothèque (téléchargement avec réessayer). La carte d'état (AudioPostStatusCard : sceau / note / spinner, durée enregistrée avec libellé VoiceOver, état de transcription) remplace la capture hors enregistrement. "Refaire" demande confirmation (message sur ce qui sera perdu), "(x) Supprimer le son" (#4696) retire un son posé avec confirmation. Annuler nettoie les fichiers. La publication envoie l'audio, la durée (qualifie un réel au-delà de 3 s) et la transcription mobile.

Écarts :
- Pas de composer audio dédié : le micro du composer ajoute une pièce m4a via MediaRecorder + pilule d'enregistrement, sans phases, sans aperçu ni lecture avant publication
- Pas d'import de fichier audio avec mappage MIME (mp3/wav/aac/ogg/m4a) ni message d'erreur dédié
- Pas de bibliothèque de sons (réutiliser un son) : aucun modèle APISound / soundId côté Android hors CanvasV3
- Carte d'état (sceau, durée, transcription en cours) ; confirmations "Refaire" et "Supprimer le son" ; nettoyage des fichiers à l'annulation
- Durée transmise à la composition pour qualifier un réel (ReelComposition existe) et publication avec transcription mobile (voir transcription)

Rendu : Feuille avec titre "composer.audio.title", carte d'état centrale, bouton de confirmation, bouton Refaire, croix de suppression sur la carte du son.

Transposition Android : AudioRecorderSheet -> feuille d'enregistrement MediaRecorder/AudioRecord de sdk-ui ; import de fichier -> OpenDocument(audio/*).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioPostStatusCard.swift`
- `apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView+Deletion.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`

### Mes publications enregistrées s'affichent tout de suite depuis le cache, se complètent par page et se retirent d'un geste

`rfp-bookmarks-list` · Android : **partielle** · P1 · effort S

BookmarksViewModel sert le cache « bookmarks » d'abord (fresh : affiche, stale : affiche + revalide la première page en silence, sinon réseau), pagine par curseur, retire un favori de façon optimiste avec rollback à la position d'origine, permet d'aimer un post depuis la liste (optimiste, cache mis à jour) et affiche des toasts d'erreur (« Impossible de charger les favoris », « Impossible de retirer le favori », « Impossible d'aimer la publication »).

Écarts :
- Cache « bookmarks » (mémoire + disque) avec Stale-While-Revalidate : aujourd'hui une ouverture à froid montre un skeleton puis la première page (le code indique « no repository-level bookmark cache yet »)
- Aimer/désaimer un post depuis la liste avec mise à jour optimiste, rollback et sauvegarde du cache
- Enregistrer à nouveau le cache après chaque retrait ou page chargée (fusion avec le cache du fil)
- Toasts d'erreur dédiés au chargement, au retrait et au like
- Rollback du retrait à l'index d'origine (`OptimisticRollback.restoring`)
- Actualiser tout le cache quand un favori est ajouté depuis le fil (`bookmarkPost` écrit déjà la clé « bookmarks »)

Rendu : Liste de cartes de posts identiques au fil ; état vide illustré « Aucune publication enregistrée » ; retrait par swipe ou menu avec disparition animée.

Transposition Android : CacheCoordinator.feed("bookmarks") → table Room BookmarkEntity ou clé de FeedEntity

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksListState.kt`

### Un toucher sur le cœur d'un commentaire l'aime sans délai, même si le réseau temps réel tombe

`rfp-comment-heart-reaction` · Android : **partielle** · P1 · effort S

toggleCommentLike est protégé contre le double tap (set des cœurs en cours), applique un delta local sur le compteur, envoie la réaction ❤️ par socket (`comment:reaction-add/remove`, délai maximal de réaction sociale) et retombe sur le REST like/unlike en cas d'échec ; il n'annule l'optimiste que si les deux échouent. applyCommentReactionAggregate rejoue le total serveur en conservant l'état du lecteur.

Écarts :
- Émettre `comment:reaction-add` / `comment:reaction-remove` avec accusé (ack) depuis SocialSocketManager (seule l'écoute existe) et basculer sur REST like/unlike si le socket échoue ou dépasse le délai
- Garde anti double-tap par commentaire pendant l'envoi
- Rejouer l'agrégat serveur (`reactorUserIds`, compteur) en gardant l'état « j'ai aimé » du lecteur et le delta local
- Propager le même mécanisme aux commentaires de réels et de stories
- Retour haptique léger

Rendu : Petit cœur à droite du commentaire, plein rouge/indigo quand aimé avec rebond, compteur en police monospace.

Transposition Android : withTaskTimeout → withTimeout de coroutines ; émission Socket.IO avec ack

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel+CommentLike.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentLikeState.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`

### Copier, imager, modifier, signaler, supprimer ou retirer un commentaire depuis son menu ...

`rfp-comment-more-menu` · Android : **partielle** · P1 · effort M

UN seul menu (CommentMoreMenu, #8709) pour les commentaires de post et de story, dont la loi est CommentMenuPolicy (directive 2026-09-29) : Copier le texte (texte servi par le Prisme ; jamais pour un commentaire protégé flouté/vue unique/éphémère), Imager (compose la carte du commentaire avec l'arbre de réponses, le post en tête ou la story en héros ; refusé comme la carte le refuse), Modifier (auteur), Signaler (autres : feuille motif + toasts succès/erreur), Supprimer (auteur), Retirer (modération avec motif, #11151) ; sous-menu limité en taille ; les mêmes entrées sont des actions personnalisées VoiceOver du bouton ; haptiques par action.

Écarts :
- Seule la suppression par l'auteur existe (CommentDeleteButton) : ajouter le menu ... avec les entrées de la politique, ordre et visibilité selon auteur/protection
- Copier le texte servi (désactivé si protégé), Signaler (dialogue de motifs + ReportRepository existant) avec toasts, Modifier (voir édition)
- Imager : composition de la carte de partage image (dépend d'un exporteur de carte de message, absent) incluant l'arbre de réponses, le post ou la story
- Retirer (modération) avec motif quand la loi l'autorise ; actions personnalisées TalkBack équivalentes
- Politique pure CommentMenuPolicy testée (entrées, protégé, rôles)

Rendu : Bouton ... discret à droite de la ligne, entrées avec icônes (copie, imager, crayon, drapeau, corbeille), destructif en rouge.

Transposition Android : Menu SwiftUI -> DropdownMenu ; actions VoiceOver -> semantics customActions.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentMenuPolicy.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentMoreMenu.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/report/ReportRepository.kt`

### Répondre à un commentaire en le gardant en vue, avec @mention automatique

`rfp-comment-reply-compose` · Android : **partielle** · P1 · effort M

Toucher Répondre pose la cible, ouvre le clavier et affiche la bannière "en réponse à" (CommentReplyBanner, croix annule) ; pour une réponse à une réponse, une @mention est auto-injectée (suivie pour être retirée proprement si la cible change) ; la liste reste calée sur la cible (KeepsReplyTargetInView : défilement différé de 0,3 s, le temps que le clavier monte et que la liste se rétrécisse, ancre comment-<id> pour racine et réponse dépliée, rien si la réponse se referme) — un commentaire de la moitié basse ne passe plus SOUS le clavier. Le composer du détail (PostDetailView+CommentComposer, #6578) compose, stage et envoie (mention autocomplete contexte .post : auteur du post, commentateurs, contacts ; vocal à tenir/envoyer ; effets/flou ; pastille de langue ; garde d'envoi CommentSendGate : envoyer / garder pendant la préparation / rien) avec ligne optimiste tmp_ et retour arrière. Le bandeau d'édition partage la même zone.

Écarts :
- Chip de réponse et préremplissage @mention présents (ReplyTargetChip, ReplyMentionPrefill) ; manque le défilement qui garde la cible en vue au-dessus du clavier (ancre + délai après IME)
- Pas de vocal, pas de pièces jointes, pas d'effets/flou ni de pastille de langue dans le composer de commentaire
- Garde d'envoi (envoyer / attendre la préparation / rien) et rollback complet de la ligne optimiste
- Bandeau commun édition/réponse avec annulation qui efface le texte
- Mention autocomplete : source à confirmer (auteur du post, commentateurs, contacts)

Rendu : Bannière compacte au-dessus du champ avec nom de la cible et croix 24 dp, champ avec bouton envoyer, cible mise en évidence brièvement.

Transposition Android : ScrollViewReader.scrollTo -> LazyListState.animateScrollToItem avec WindowInsets.ime.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentSheetBanners.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentReplyFocus.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+CommentComposer.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/ReplyMentionPrefill.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentMentionRoster.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`

### Lire un commentaire : auteur, humeur, traduction, cœur, réponses dépliables

`rfp-comment-row-thread` · Android : **partielle** · P1 · effort M

CommentRowView (Equatable) : avatar (tap = profil, anneau de story, présence, humeur du statut), nom, heure, bouton traduction et drapeaux (demande de traduction vers la langue préférée), corps rendu par le moteur de texte (mentions, liens) avec effets et voile de flou (commentBody), média joint inline, cœur avec compteur (a11y like/unlike), bouton Répondre avec nombre de réponses, "Voir les réponses" qui déplie un fil à deux niveaux paginé, surlignage de la cible d'une notification. PostDetailCommentThread monte la section threadée d'un premier niveau avec like optimiste + réaction socket cœur, surlignage et résolveurs d'humeur/story/présence (l'ancre comment-<id> reste posée par l'hôte).

Écarts :
- Avatar sans navigation profil, sans anneau de story, sans présence ni humeur
- Corps sans effets de commentaire (flou/lueur/pulse…) ni voile de flou protégeant le corps seul
- Pas de média joint inline ; pas de menu contextuel ... sur la ligne (voir menu)
- Surlignage de la cible d'une notification et ancrage comment-<id> pour le défilement
- Libellés TalkBack riches (corps, auteur, like/unlike avec hint, répondre, voir les réponses)
- Mentions et liens tappables dans le texte du commentaire (rendu riche partagé)

Rendu : Avatar 32-36 dp, nom semibold, texte du thème, ligne d'actions (cœur + compteur, Répondre + compteur), fil de réponses indenté d'un niveau.

Transposition Android : Equatable + .equatable() -> @Immutable/@Stable sur CommentPresentation et clés stables.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentRowView.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailCommentThread.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentPresentation.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentThreadState.kt`

### Retrouver un commentaire qui n'est pas parti et le relancer, reprendre ou jeter

`rfp-comment-unsent-retry` · Android : **partielle** · P1 · effort M

Quand la file renonce, le commentaire (et ses pièces) reste à l'écran, marqué (CommentUnsentBadge : ligne qui porte encore son identifiant client cmid_/tmp_), relançable d'un toucher (Réessayer), reprenable dans le composer (le texte repris s'ajoute à ce qui s'y trouve, rien ne se perd) ou supprimable ; il se relit depuis la FILE donc survit à la fermeture de la feuille et au redémarrage de l'app (pièces lues dans le dossier durable) ; la raison vient du registre des limites du jour, lue une fois ; haptiques ; la marque lit l'état de SA ligne sans s'abonner à un singleton.

Écarts :
- Le réel a un "Failed - tap to retry" mais les commentaires ne passent pas par l'outbox durable : ajouter un OutboxKind de commentaire avec pièces, et relire les commentaires non partis au rechargement (survie à la fermeture et au redémarrage)
- Détail : même marque (Réessayer / Reprendre dans le composer / Supprimer) que le réel, avec raison de l'échec
- Reprendre = fusionner le texte au brouillon sans rien perdre ; haptiques

Rendu : Pastille rouge d'erreur sous la ligne avec trois actions (Réessayer, Reprendre, Supprimer) en texte accentué.

Transposition Android : OfflineQueue -> OutboxRepository + WorkManager.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentUnsentBadge.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsReducer.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`

### Voir les commentaires arriver, changer et disparaître en direct, avec cœurs fiables

`rfp-comments-live-sync` · Android : **partielle** · P1 · effort S

CommentsSheetLiveSync abonne la feuille aux événements du post et réconcilie liste, fils, compteur et cœurs : comment:added (jumeau optimiste dédupliqué), comment:updated (remplacement en place : contenu, effets, traductions), comment:deleted (retrait + compteur absolu), traduction arrivée (posée seulement si la langue est préférée, qu'aucune traduction n'est affichée et que la langue d'origine n'occupe pas un rang au moins aussi prioritaire — règle unique du Prisme), agrégat ABSOLU des réactions (mon cœur dérivé de aggregation.userIds, pas de hasCurrentUser relatif à l'acteur), mise à jour des médias (comment:media-updated) et écriture au cache. CommentHeartTransport envoie le cœur par réaction socket (source unique, timeout dur de protection contre un socket pendu) avec repli REST idempotent, retour arrière uniquement si les deux échouent.

Écarts :
- PostCommentsViewModel gère added/deleted/updated/traduction/réaction : manque l'événement de mise à jour des médias de commentaire (comment:media-updated) et l'écriture des changements live au cache
- Transport du cœur : ajouter le timeout dur et le repli REST idempotent quand le socket échoue, avec rollback uniquement si les deux échouent
- ReelCommentsViewModel écoute séparément (observeIncoming) : fusionner avec la logique du détail pour éviter la divergence (agrégat absolu, règle de rang pour la traduction)
- Vérifier que "mon cœur" dérive de la liste des userIds de l'agrégat et non du drapeau relatif à l'acteur

Rendu : Aucun élément visuel (réactivité).

Transposition Android : Combine publishers -> Flows du SocialSocketManager.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/CommentsSheetLiveSync.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentHeartTransport.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentLikeState.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`

### Composer un post ou un réel en plein écran : type, audience, pièces, langue, lieu

`rfp-composer-sheet` · Android : **partielle** · P1 · effort M

FeedComposerSheet (plein écran, #6040) : sélecteur Post / Réel (affiché seulement si la composition peut être un réel : vidéo, audio ou >= 2 images ; sinon toujours un post), audience (public, amis, sauf, uniquement avec liste d'identifiants nommés), champ de texte, rangée d'actions (photo, appareil photo, emoji, fichier, position, enregistrer un audio) avec libellés d'accessibilité, rangée des pièces en attente (tuiles en préparation avec progression et annulation, prêtes, tuile de lieu 72x72), pastille de langue du post, retouche des images/vidéos dans l'éditeur unique de la caméra (scène), sélecteur initial paramétrable (photo/camera/file/location), toasts publié / en attente hors ligne / erreur, aperçu de citation pour un post cité.

Écarts :
- Audiences EXCEPT/ONLY avec liste d'utilisateurs nommés (Android : public/amis/privé seulement)
- Pas de sélecteur d'emoji dans la barre d'actions, pas de retouche d'image/vidéo dans l'éditeur de scène de la caméra
- Sélecteur initial paramétrable depuis le placeholder du fil (photo/camera/file/location)
- Rangée de pièces : annulation d'une préparation en cours, tuile de lieu dédiée, états de préparation fidèles
- Publication hors ligne : toast "en attente" et file durable (voir rfp-composer-offline-draft) ; toasts publié/erreur distincts pour audio
- Mentions et hashtags : saisie assistée (autocomplétion @) à confirmer
- Composer audio dédié depuis l'icône micro (voir rfp-audio-post-composer) au lieu d'une simple pièce m4a

Rendu : Feuille plein écran, bascule Post/Réel en capsule en haut, avatar + champ multi-ligne, rangée d'icônes 44 dp, tuiles de pièces 72x72 avec croix en coin, pastille de langue.

Transposition Android : PhotosPicker -> Photo Picker (ActivityResultContracts.PickVisualMedia) ; caméra -> CameraX / ACTION_IMAGE_CAPTURE ; éditeur de scène -> éditeur de stories partagé.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedComposerSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedComposerAttachmentsRow.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerAttachmentPolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ReelComposition.kt`

### Mon temps de lecture, mes lectures de vidéo et mes micro-gestes sont mesurés proprement et envoyés même après une coupure

`rfp-engagement-dwell-telemetry` · Android : **partielle** · P1 · effort L

EngagementTracker garde une session par surface (détail, reels, story, bulle de mood) : temps passé monotone avec la règle « la surface du dessus tient l'horloge » (une surcouche met celle du dessous en pause), micro-actions horodatées (commentaires ouverts, profil touché, texte déplié, rejoué, son coupé/activé, pause/reprise, balayé, réagi, partagé, enregistré, commenté, signalé), échantillons de lecture et durée du média. Une session ne compte que si ≥ 1 s de présence ou ≥ 2 s de lecture ou terminée. Le consentement d'analyse retire les micro-actions et la trace de lecture mais la session de portée est toujours enregistrée (ouvertures, lectures, vues qualifiées). Chaque session est annoncée à l'ouverture (premier contact), sauvegardée en checkpoint, finalisée dans une outbox durable et envoyée par `POST /social/events` (sessions dwell) ; hors-ligne, un rejeu automatique a lieu à la reconnexion et toutes les 30 s.

Écarts :
- Le consentement est traité à l'envers : `EngagementSessions.begin(consentGranted=false)` n'ouvre aucune session alors que iOS compte toujours la portée (ouvertures, lectures, vues qualifiées) et ne retire que micro-actions et trace de lecture
- Modèle `EngagementSession` complet (sessionId, userId, postId, contentType POST/REEL/STORY/STATUS, surface, startedAt, dwellMs, watchMs, mediaDurationMs, completed, truncated, consent, actions, watchSamples) et micro-actions `EngagementAction`
- Envoi `POST /social/events` (dwell + view + impression avec source et entrée) à la place de `posts/{id}/view` seul ; annonce d'ouverture (`announceSession`) puis finalisation fusionnée côté serveur
- Outbox durable de sessions (Room) avec checkpoint périodique et à l'arrière-plan, flush à la fin, au retour du réseau et toutes les 30 s hors-ligne (WorkManager)
- `attachWatch` : durée de lecture, durée du média, complétion et échantillons de position envoyés par les lecteurs vidéo/audio
- Instrumenter les micro-actions (reacted, shared, bookmarked, commented, openedComments, muted/unmuted…) depuis les surfaces
- Filtrage par `userId` du compte courant au moment de l'envoi (sessions d'un autre compte rejetées)

Rendu : Aucun rendu ; contrat de télémétrie. Respecter la préférence « Autoriser les statistiques » dans les réglages de confidentialité.

Transposition Android : Task + EngagementOutbox → WorkManager + Room ; NetworkConditionMonitor → ConnectivityManager.NetworkCallback ; UserPreferencesManager.privacy.allowAnalytics → PrivacyPreferencesStore

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/EngagementTracker.swift`
- `apps/ios/Meeshy/Features/Main/Services/EngagementDispatcher.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EngagementModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusesViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Lire qui publie, d'où ça vient et agir via le menu ... d'une carte du fil

`rfp-feed-card-header-menu` · Android : **partielle** · P1 · effort M

L'en-tête d'une carte (FeedPostCard+Header) : avatar (présence en direct, anneau de story, humeur) tap = profil ; nom, @pseudo, heure avec marque de points (PostDatePoints) ; verbe de republication ("republié de @x", icône avant tout) ; crédit du son de fond (BackgroundSoundBadge) ; pour l'auteur seul les métriques de portée (impressions · vues), tap ouvrant la liste des vues pour ADMIN/BIGBOSS ; menu ... : Ouvrir, Copier le texte, Partager (lien suivi), Enregistrer le média, Enregistrer/Retirer le favori, Épingler, Modifier, Signaler, Supprimer ou Retirer (modération), Voir près d'ici. Haptiques légère/succès/moyenne par action.

Écarts :
- Avatar sans anneau de story ni présence en direct ; tap avatar/nom ne mène pas au profil
- Pas de @pseudo ni de marque de points ; heure relative seule
- Pas d'attribution de republication en tête (icône + "republié de @x") ni de badge du son de fond
- Pas de ligne de portée de l'auteur (impressions, vues) ni d'ouverture de la liste des vues
- Menu ... : manque Ouvrir, Copier le texte (a Copier le lien), Enregistrer le média, Modifier, Retirer (modération), Voir près d'ici ; Épingler/Signaler/Supprimer présents
- Haptiques par action

Rendu : Ligne 1 : nom (semibold, accent de l'auteur) · @pseudo · heure ; ligne 2 : verbe de republication ; menu en trois points aligné à droite, séparateurs point médian.

Transposition Android : Menu SwiftUI -> DropdownMenu (PostOptionsButton existant) ; contextMenu items -> long-press menu.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Header.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostActionMenu.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostPresentation.kt`

### Aimer, enregistrer, republier et partager avec retour instantané et cohérence temps réel

`rfp-feed-engagement-optimistic` · Android : **partielle** · P1 · effort S

FeedPostEngagementState tient en un seul état local les ids aimés/enregistrés/republiés et les deltas de compteurs, amorcés depuis les posts chargés (isLiked, favoris du cache) et réconciliés quand la liste change ; les sockets post:liked/unliked, réaction ajoutée/retirée (compteur absolu) et favori ajustent l'état sans muter FeedPost. Le cœur est socket d'abord (verrou anti double-tap, timeout, repli REST, observation du résultat de la file avec retour arrière), le favori et le repartage sont optimistes avec rollback. La rangée d'actions FeedPostActionsBar (Equatable) montre le cœur avec anneau d'éclat et bordure d'accent quand aimé, le nombre de commentaires, un menu Repartager / Citer / Annuler, Enregistrer et Partager avec compteurs, états VoiceOver (valeur, hint), cibles de 44 pt.

Écarts :
- Android passe par l'outbox durable (LIKE_POST/UNLIKE_POST/BOOKMARK_POST), plus robuste que iOS hors ligne ; vérifier la réconciliation des événements socket entrants (post:liked/unliked, réaction ajoutée/retirée avec compteur absolu, favori) pour que les autres appareils et lecteurs se mettent à jour
- Pas d'animation d'éclat du cœur (anneau) ni de bordure d'accent sur le glyphe aimé
- StatRow : pas de compteur de partages ni d'état "republié" actif dans la barre (le repartage vit dans le menu ...) ; iOS expose Repartager/Citer/Annuler directement sur l'icône avec valeur d'accessibilité
- Pas de palette d'émojis à l'appui long sur le cœur (voir rfp-post-reaction-palette)
- Cibles tactiles >= 44 dp et libellés TalkBack avec valeur/hint par action
- Hydratation des favoris depuis le cache pour que l'icône soit pleine dès le premier rendu

Rendu : Cœur plein accent + anneau qui s'étend en 0,3 s, compteur à droite du glyphe, bordure d'accent sur le cœur de l'utilisateur, glyphes 22-24 dp dans une zone de 44 dp.

Transposition Android : Socket-first + REST fallback iOS -> outbox durable Android (comportement équivalent hors ligne).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostEngagementState.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostActionsBar.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostCommand.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Un écran « Découvrir » regroupe Demandes, Découvrir et Bloqués avec onglets fins et badge de demandes

`rfp-people-discovery-hub` · Android : **partielle** · P1 · effort S

PeopleDiscoveryView héberge trois sous-onglets (Découvrir par défaut, Demandes avec badge du nombre de demandes reçues, Bloqués) dans la zone d'en-tête repliable, la barre d'onglets restant épinglée pendant que le contenu défile ; le défilement est relayé à l'en-tête sans réinvalider le corps. Les ViewModels sont conservés pendant la bascule, une haptique légère accompagne le changement et l'en-tête se redéploie. Accessible depuis le menu flottant et par lien profond (`Route.peopleDiscovery(DiscoveryTab)`). ConversationDiscoveryRowFetcher retrouve la ligne de conversation d'un résultat (liste riche des 20 dernières, sinon getById).

Écarts :
- Point d'entrée dédié « Découvrir » (menu flottant / route avec onglet initial) séparé de l'annuaire : Android mélange Contacts, Demandes, Découvrir et Bloqués dans un seul TabRow
- En-tête repliable (CollapsibleHeader) avec barre d'onglets épinglée, défilement relayé sans recomposer le corps
- Onglets à icône + libellé avec badge temps réel du nombre de demandes reçues (FriendshipCache) plutôt qu'un simple Badge statique
- Haptique légère au changement d'onglet et animation par ressort ; réinitialiser le décalage de l'en-tête au changement
- Conserver les ViewModels des trois onglets pendant la bascule
- `ConversationDiscoveryRowFetcher` : retrouver la conversation d'un résultat de découverte pour l'ouvrir (liste récente puis `getById`)

Rendu : Onglets fins soulignés intégrés à la surface de l'en-tête, qui remonte avec le défilement ; titre « Découvrir » en couleur texte primaire, flèche retour indigo ; séparateur léger sous la barre.

Transposition Android : CollapsibleHeader + HubTabButton → TopAppBar avec scrollBehavior + SecondaryTabRow ; deep link peopleDiscovery → NavDeepLink meeshy://discover?tab=

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift`
- `apps/ios/Meeshy/Features/Main/Services/ConversationDiscoveryRowFetcher.swift`

</details>

Android existant : `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsViewModel.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/DiscoverTab.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/BlockedTab.kt`

### Comprendre pourquoi un post n'est pas là : disparu, panne réseau, panne serveur

`rfp-post-detail-absence` · Android : **partielle** · P1 · effort S

PostDetailAbsenceReason (pure, ordre des questions éprouvé) décide entre présent, encore en chargement, indisponible (404/403/inconnu), échec réseau et échec serveur — un 500 ne dit plus "vérifiez votre connexion" à un utilisateur connecté (#6503, #6508). PostDetailView+AbsenceStates rend les écrans côte à côte (même silhouette, actions différentes : Retour seul pour une disparition, Réessayer pour un échec) avec mots, icône et offre de réessai de ContentFetchFailure+Copy, partagés avec la cible story et le lecteur de réels.

Écarts :
- Un seul placeholder (notFound vs errorMessage) : introduire ContentFetchFailure (indisponible / réseau / serveur) classé depuis le code HTTP ou l'I/O et un enum d'absence testé
- Écrans distincts avec icône, texte et action adaptés (Retour vs Réessayer) ; Réessayer seulement si cela peut aboutir
- Partage du même composant/copy avec le lecteur de réels et la cible story
- Chaînes dans les locales du module feed

Rendu : Même silhouette centrée : icône, titre, détail, bouton principal.

Transposition Android : Aucun.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailAbsenceReason.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+AbsenceStates.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`

### Voir les médias d'un post en détail : image, vidéo, audio, document et grille +N

`rfp-post-detail-media` · Android : **partielle** · P1 · effort M

PostDetailView+Media (#6696) : pour chaque type — image (tap = plein écran, libellés a11y), vidéo (la vidéo primaire jouée inline), audio (lecteur avec transcription, avec l'auteur du post CITÉ pour l'attribution d'un repost), document (carte avec nom, pages, ouverture) — et grille visuelle jusqu'à 4 cellules avec "+N" sur la quatrième ; un tap ouvre le plein écran partagé avec haptique légère ; DetailMediaAuthor porte le bon auteur pour le post extérieur ou le repost cité.

Écarts :
- Seules les images (PostImageLayout) sont rendues : ajouter vidéo inline, audio avec transcription, carte document
- Grille de 4 avec "+N" et ouverture de la galerie sur le média tapé
- Auteur porteur du média pour un repost cité (attribution de l'audio)
- Libellés TalkBack (image, vidéo, document, plus)

Rendu : Médias pleine largeur, grille 2x2 avec badge +N, carte document avec icône de type.

Transposition Android : Mêmes composables que le fil (partage de la couche média).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Media.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostMedia.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaMosaic.kt`

### Lire un post dans ma langue et explorer les autres d'un tap sur un drapeau

`rfp-post-detail-prism` · Android : **partielle** · P1 · effort S

PostDetailView+Prism : langue affichée, contenu servi (rang du Prisme), bande de drapeaux (buildAvailableFlags : original, langues préférées, traductions, max 4) dont le haptique appartient à LanguageFlagChip, tap sur un drapeau (handleFlagTap) = panneau de traduction secondaire inline (PostDetailSecondaryTranslationPanel : séparateur coloré par langue, drapeau + nom, texte traduit, libellé a11y), vidéo YouTube détectée, carte des liens suivis [url: token].

Écarts :
- Panneau secondaire inline (séparateur coloré, drapeau + nom, texte) à vérifier/ajouter après le tap sur un drapeau
- Rendu des liens suivis et des mentions/hashtags dans le texte servi
- Façade vidéo YouTube détectée dans le contenu
- Vérifier que la règle de rang du Prisme (l'original concourt à son rang, pas de court-circuit) est celle de LanguageResolver.preferredTranslation

Rendu : Drapeaux sous le texte, panneau secondaire à fond pastel de la langue avec trait coloré à gauche.

Transposition Android : LanguageFlagChip -> chip de sdk-ui existante.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Prism.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailSecondaryTranslationPanel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostTranslationRows.kt`

### Ouvrir un post en détail : en-tête qui révèle l'auteur, actions, menu, portée, états

`rfp-post-detail-screen` · Android : **partielle** · P1 · effort M

PostDetailView : CollapsibleHeader flottant dont la puce centrée de l'auteur (portée épinglée) se révèle quand le bloc auteur inline sort ; bloc auteur (avatar, nom, @pseudo, et POUR L'AUTEUR SEUL vues · impressions, "vues" = viewCount de chaque ouverture, uniqueViewCount = personnes distinctes), zone de texte avec drapeaux (Prisme), barre d'actions (cœur avec compteur et palette, commentaires, republier avec alerte Repartager/Citer, favori avec toasts "ajouté/retiré/erreur", partager) à cibles de 45 pt, menu ... (Copier le lien, Partager, Enregistrer le média, Épingler, Modifier, Signaler, Supprimer), bouton "charger plus" de commentaires. À l'ouverture (openDetail) : cache-first, état d'engagement semé depuis le post servi (isBookmarkedByMe/isRepostedByMe, repli sur le cache), rejoint la room du post, compte l'ouverture, déclare le post visible pour filtrer ses bannières, reprend le brouillon de commentaire ; closeDetail quitte la room. Présentations par-dessus : traduction, profil, partage, édition, lieu plein écran, galerie, audio plein écran, enregistrement local.

Écarts :
- En-tête flottant avec puce d'auteur révélée au défilement et portée épinglée (PostDetailScreen utilise une barre simple)
- Menu ... du détail (Copier le lien, Partager, Enregistrer le média, Épingler, Modifier, Signaler, Supprimer) absent de l'écran de détail
- Palette de réactions sur le cœur et action TalkBack équivalente ; barre d'actions complète avec partager et compteurs
- Toasts d'état des favoris (ajouté/retiré/erreur) et alerte Repartager/Citer avec libellés dédiés
- Ouverture : amorçage des états depuis le post servi et le cache, anti-spam de bannière pour le post visible, reprise du brouillon de commentaire
- Présentations : feuille de traduction, profil, édition de post, galerie, audio plein écran, enregistrement local, lieu plein écran
- Cibles tactiles de 45 dp (engagementHitArea) autour du glyphe et pas de la police
- Ligne de portée : confirmer vues = viewCount (chaque ouverture) et uniques ; chiffres jamais tronqués (2,3 M)

Rendu : Puce centrée de l'auteur avec ses vues/impressions dans l'en-tête replié, actions en barre sous le texte avec glyphes dans des zones de 45 dp, ligne de portée "@pseudo · vues · impressions" en secondaire.

Transposition Android : CollapsibleHeader -> TopAppBar à défilement ; alert -> AlertDialog.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Opening.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Header.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+EngagementHitArea.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Presentations.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailReachAndVisibility.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostReachFormatter.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostActionMenu.kt`

### Aimer ou enregistrer un post répond immédiatement et se rattrape tout seul en cas d'échec

`rfp-post-like-bookmark-optimistic` · Android : **partielle** · P1 · effort S

likePost inverse isLiked/likes localement (PostLikeMutation borne à 0), met en outbox `.toggleLikePost` avec clientMutationId, patche le cache partout et la persistance, puis rollback + toast « Impossible d'aimer la publication » quand la ligne s'épuise (avec le message de limite quotidienne si c'est la cause). bookmarkPost ajoute le post au cache « bookmarks » avant l'appel réseau, toast « Ajouté aux favoris », et restaure le cache en cas d'échec.

Écarts :
- Message de limite quotidienne de gestes (`DailyGestureLimitNotice`) quand une ligne like/bookmark est épuisée : Android restaure silencieusement
- Toasts de confirmation et d'erreur (« Ajouté aux favoris », « Impossible d'enregistrer le favori », « Impossible d'aimer la publication ») : Android n'a qu'un `errorMessage` global du feed
- Retour haptique léger au like
- Patcher le post dans tous les caches (fil, favoris, détail, hashtag) et le cache disque, pas seulement l'overlay du fil
- Même mutation optimiste dans les listes Favoris et Hashtag (aujourd'hui lecture seule côté Android)

Rendu : Cœur plein rouge/indigo avec léger rebond (spring) et compteur qui change instantanément ; haptique légère ; compteur jamais négatif.

Transposition Android : OfflineQueue.toggleLikePost → OutboxKind.LIKE_POST/UNLIKE_POST/BOOKMARK_POST déjà présents ; FeedbackToastManager → Snackbar/Toast Material

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+Reactions.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/PostLikeMutation.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`

### Les compteurs d'un post sont lus naturellement par le lecteur d'écran (« 1 like », « 3 commentaires »)

`rfp-post-stats-accessibility` · Android : **partielle** · P1 · effort S

PostStatAccessibility fournit les libellés VoiceOver singulier/pluriel des compteurs de likes, commentaires, reposts et réponses, localisés.

Écarts :
- Ressources plurielles (`plurals`) likes, commentaires, reposts, réponses en fr/en/es/pt (et autres langues de l'app) utilisées en `contentDescription`/`semantics` de chaque statistique
- Fusionner icône + compteur en un seul nœud sémantique avec libellé complet (« 12 likes ») sur la carte, le détail et les reels
- Cible tactile ≥ 48 dp pour chaque statistique cliquable

Rendu : Aucun changement visuel.

Transposition Android : accessibilityLabel → semantics { contentDescription } ; String(localized:) pluralisé → pluralStringResource

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Cells/PostStatAccessibility.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/feed/src/main/res/values-fr/strings.xml`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostReachFormatter.kt`

### Le texte et les légendes de chaque post s'affichent dans ma langue, avec la possibilité de forcer une autre langue

`rfp-post-translation-prisme` · Android : **partielle** · P1 · effort S

setTranslationOverride/clearTranslationOverride permettent de choisir manuellement une langue de traduction pour un post (le choix manuel survit aux mises à jour temps réel `post:translation-updated`), requestTranslation demande une traduction à la volée, et receiveMediaCaptionTranslation applique les traductions de légende de média (posts et commentaires) en patchant tous les caches. PostTranslation porte texte, modèle et score de confiance.

Écarts :
- Traductions de légende de média pour les commentaires (`mediaId` + `commentId` dans `media-caption-translation-updated`) : Android ne traite que les légendes de post
- Patcher le cache disque (`patchEverywhere`) à la réception d'une traduction, pas seulement l'état en mémoire
- Conserver la langue choisie manuellement quand une nouvelle traduction du post arrive (`preserveManualOverride`) et pouvoir la réinitialiser
- Garder `confidenceScore` et `translationModel` dans le modèle affiché (info « traduit automatiquement »)
- Appliquer le même Prisme aux commentaires de post déjà en cache lors d'un changement de langue préférée

Rendu : Pastille de langue discrète sous le texte (drapeau + code), tap = voir l'original ou une autre langue, aucun bandeau intrusif ; le texte traduit s'affiche comme du natif.

Transposition Android : PrismTranslationResolver → LanguageResolver / resolveLastMessagePreview existants

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+Translation.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel+MediaCaptionTranslation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PostTranslation.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PostTranslationMerge.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostTranslationRows.kt`

### Voir l'original, les traductions disponibles et en demander d'autres pour un post

`rfp-post-translation-sheet` · Android : **partielle** · P1 · effort M

PostTranslationSheet : en-tête avec fermer, section contenu original (langue), traductions disponibles avec drapeau, nom et score de confiance (libellé d'accessibilité), et "Autres langues" avec bouton Traduire par langue (état demandé / erreur), haptique légère ; ouverte depuis l'icône translate de la carte et du détail. Le drapeau est celui de la source unique (code en capitales à défaut, jamais le globe).

Écarts :
- Pas de feuille de traduction : l'API posts/{id}/translate et la fusion de traductions existent mais aucun écran ; créer ModalBottomSheet (original, disponibles + confiance, autres langues + Traduire, états demandée/erreur)
- Entrée par l'icône translate (carte, détail, réel) en plus du tap sur un drapeau
- Résultat appliqué en direct via l'événement socket de traduction de post (merge existant)

Rendu : Sections titrées, lignes de langue avec drapeau et barre/valeur de confiance, bouton Traduire en pilule.

Transposition Android : Sheet -> ModalBottomSheet ; drapeau -> source unique de langue de sdk-ui.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostTranslationRows.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PostTranslationMerge.kt`

### Une vidéo ou un son propose automatiquement de devenir un Réel, une photo reste un Post

`rfp-publication-target-reel-rules` · Android : **partielle** · P1 · effort S

ReelComposition décide si une composition se qualifie comme Réel (une vidéo ou un audio d'au moins 3 s, ou au moins 2 images) et propose le type par défaut. ReelOffer n'offre le format Réel que pour un post simple d'une seule vidéo qualifiante, ni repost ni édition, et si l'auteur n'a pas déjà choisi. PublicationTarget (POST/REEL/STORY) donne la cible par défaut d'un média selon son type MIME (image → post, vidéo/audio → réel, +story) et exige une confirmation pour une capture faite dans l'app.

Écarts :
- Porter `ReelComposition.offersReelForPost` (ReelOffer) : une seule vidéo, pas de repost, pas d'édition, format non choisi par l'auteur
- Porter `PublicationTarget` + `PublicationTargetRule.defaultTarget/targets/needsCaptureConfirmation` pour les entrées « publier ce média » (galerie, caméra, partage entrant)
- Vérifier la parité de `qualifiesAsReel` sur les durées inconnues (durée nulle ⇒ ne qualifie pas) et sur `forcePlainPost`
- Exposer le type par défaut (`defaultType`) dans le composeur et dans l'édition (`reelIsChoosable`)

Rendu : Bannière discrète « Publier en Réel ? » sous le composeur avec bascule Post/Réel ; un message motivé quand le Réel n'est pas offert.

Transposition Android : AttachmentKind(mimeType:) → classification MIME existante côté média Android

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PublicationTarget.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReelComposition.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReelOffer.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ReelComposition.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Un bouton coupe ou active le son de la vidéo, et le choix vaut pour tout le fil

`rfp-reel-sound-toggle` · Android : **partielle** · P1 · effort S

ReelFeedSoundButton est un bouton de chrome plein écran dont l'icône suit l'état audible et dont le libellé VoiceOver dit « Couper le son de la vidéo » ou « Activer le son de la vidéo ».

Écarts :
- L'état muet est un `rememberSaveable` local à l'écran des reels : le partager avec les vidéos inline du fil et le conserver entre sessions (préférence)
- Bouton réutilisable de chrome plein écran (même composant fil et reels) avec icône haut-parleur coupé/actif
- Libellés d'accessibilité dédiés « Couper le son de la vidéo » / « Activer le son de la vidéo »
- Enregistrer l'action `muted`/`unmuted` dans les micro-actions d'engagement

Rendu : Bouton rond translucide en haut à droite, pictogramme haut-parleur barré quand muet, 44 dp minimum.

Transposition Android : FullscreenChromeButton → IconButton Compose avec fond translucide

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ReelFeedSoundButton.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/res/values-fr/strings.xml`

### Aimer, commenter, enregistrer, republier et agir depuis le rail de droite d'un réel

`rfp-reels-action-rail` · Android : **partielle** · P1 · effort M

Le rail vertical (ReelActionRail, FullscreenActionRail) porte J'aime (cœur plein teinté erreur quand actif, appui long = bande d'émojis FullscreenReactionStrip qui s'ouvre vers la gauche), Commenter, Enregistrer (favori, teinte warning quand actif) et Republier (teinte success quand actif), avec compteurs vivants et mises à jour optimistes ; chaque glyphe prend la teinte que commande la luminance du réel affiché (mediaChromeRail). Le menu ... (ReelMoreOptionsMenu, dans la barre haute) offre Ouvrir (détail du post), Copier le texte, Partager (lien suivi), Enregistrer le média (PostSaveRoute : scène rendue ou fichier brut, avec bouton de progression), Épingler, Modifier (EditPostSheet) et Signaler. Haptiques légère/moyenne/succès par action.

Écarts :
- Pas d'appui long sur J'aime pour ouvrir la bande d'émojis (n'importe quel émoji) ; voir fonctionnalité palette de réactions
- Republier sans état actif/teinte success ; Enregistrer a la teinte warning mais pas d'état visuel "participé" cohérent avec iOS
- Le bouton Partager envoie le lien brut https://meeshy.me/post/{id} : utiliser le lien suivi minté par la passerelle (voir rfp-post-share-link)
- Pas de menu ... : ajouter Ouvrir, Copier le texte, Partager, Enregistrer le média (rendu de scène ou fichier), Épingler, Modifier, Signaler (dialogue de motifs), selon l'auteur
- Teinte des glyphes selon la luminance du réel affiché (lisibilité AA sur images claires) et libellés/hints TalkBack riches ("J'aime", "Commenter", "Enregistrer", "Repartager")
- Pas de feedback haptique par action (HapticFeedbackType.TextHandleMove/Confirm selon le cas) ni d'anneau d'animation du cœur
- Rail réactif au ViewModel : compteurs optimistes déjà présents ; ajouter commentaire +1 après envoi depuis la feuille (onCommentSent)

Rendu : Colonne alignée à droite, espacement lg, glyphes 28-32 dp avec ombre légère, compteur sous chaque glyphe, teinte active : cœur rouge d'erreur, signet ambre, republier vert, bande d'émojis en pilule de verre qui s'étire vers la gauche avec ressort.

Transposition Android : ContextMenu/Menu SwiftUI -> DropdownMenu Material ; FullscreenReactionStrip -> Popup/Row animée ancrée au bouton ; HapticFeedback -> LocalHapticFeedback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`

### Lire l'auteur, la légende, le lieu, les langues et le crédit du son sur un réel

`rfp-reels-info-overlay` · Android : **partielle** · P1 · effort M

Le bloc d'infos bas-gauche (ReelPageView+Info, ReelMetaRow dans ReelPageChrome) montre : avatar de l'auteur (tap = sa story active sinon son profil, anneau de story), nom (tap = profil), @pseudo, et POUR L'AUTEUR SEUL la portée (impressions puis vues, séparées par un point médian), l'heure suivie de la bascule de traduction et des drapeaux de langues disponibles (original d'abord, max 4, dédupliqués, drapeau actif souligné à sa couleur, rangée en registre overlay à cibles de 32 pt), la légende rendue avec @mentions et #hashtags teintés et cliquables (fond toujours sombre, variante isDark épinglée), expansion/réduction de la description, le sticker de position (tap = plein écran carte), l'annonce du son de fond sur sa propre ligne (BackgroundSoundBadge + bouton muet seulement s'il existe un lecteur local à piloter) et le crédit d'un son emprunté (ReelBorrowedSoundCredit). Le Prisme choisit la légende servie ; une légende de scène remplace un texte vide. Les statistiques et la légende prennent la teinte de lisibilité du schéma de luminance.

Écarts :
- Avatar en simple MeeshyAvatar sans photo, sans anneau de story, sans navigation : tap avatar -> story active sinon profil ; tap nom -> profil
- Pas de @pseudo, pas de ligne de portée visible de l'auteur seul (impressions, vues avec libellés abrégés), pas d'heure relative
- Aucune rangée de langues (bascule de traduction + drapeaux max 4 + soulignement actif) ni Prisme de la légende : la légende est brute, tronquée à 3 lignes sans expansion
- Légende sans rendu des mentions/hashtags/liens suivis (voir rfp-feed-card-body-prism)
- Pas de sticker de position ni de plein écran de lieu, pas d'annonce du son de fond (crédit, titre, auteur, durée) ni de bouton muet dédié
- Pas de teinte adaptative à la luminance du média (lisibilité du texte et des glyphes sur images claires)
- Légende de scène (storyEffects) utilisée quand le post n'a pas de texte

Rendu : Bloc ancré en bas à gauche (limité à ~72 % de la largeur), avatar 34-36 dp, ombre portée discrète sur le texte, drapeaux 32 dp, légende 2-3 lignes avec bouton Voir plus, sticker de lieu en pilule indigo50 avec pin d'erreur.

Transposition Android : MessageTextRenderer -> AnnotatedString avec ClickableText/LinkAnnotation ; BackgroundSoundBadge -> composable sdk-ui à créer (partagé fil/détail/stories).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelPageView+Info.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelPageChrome.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`

### Parcourir les réels plein écran d'un glissé vertical, un réel à la fois

`rfp-reels-player-pager` · Android : **partielle** · P1 · effort M

Le lecteur de réels iOS est un pager vertical plein écran (AdaptiveVerticalPager) alimenté par le fil (réels de départ + id de départ) et paginé à l'apparition. Il masque la barre d'état, ferme par bouton retour ou glissé depuis le bord, rejoint/quitte la room socket du post actif, consomme les notifications du réel affiché (onPostOpened/onPostClosed), met vidéo et audio en pause dès qu'un appel devient actif, et s'ouvre via ReelsPresenter (present avec commentaire ciblé, presentFresh, dismiss) depuis le bouton Réels du fil ou un tap de carte, avec une révélation liquide (masque circulaire ondulé) née à la position du bouton, remplacée par un fondu sous Reduce Motion. Depuis une notification de commentaire, la feuille de commentaires s'ouvre seule 450 ms après l'apparition et défile jusqu'au commentaire ciblé.

Écarts :
- Pas de révélation circulaire née à la position du bouton Réels (ni fondu de repli quand les animations sont réduites) : l'écran apparaît sans transition
- Aucune prise en compte d'un appel actif : un appel entrant ne met pas en pause la vidéo (focus audio / Telecom) et ne reprend pas à la fin de l'appel
- Pas de réception du commentaire ciblé (commentId / parentCommentId) : la feuille de commentaires ne s'ouvre pas seule 450 ms après l'arrivée, ni ne défile jusqu'au commentaire
- Les notifications du réel affiché ne sont pas marquées consommées (onPostOpened/onPostClosed) : elles restent non lues et les bannières in-app du post visible ne sont pas filtrées
- Fermeture uniquement par la croix : pas de glissé depuis le bord de début de lecture (zone de 18 dp, seuil 70 dp, contenu qui suit le doigt, sens inversé en RTL) ni de retour haptique léger au changement de réel
- ReelBuilder ne retient que les réels dont le média est une vidéo : les réels image, audio et scène sont écartés du pager (voir fonctionnalités dédiées)
- Pas d'ouverture par présentateur global avec ensemble de départ (liste des réels du fil + id) : le seed est un simple id rechargé ; pas de lecteur ouvrable dans une fenêtre séparée sur tablette
- Le son démarre coupé et se règle par un bouton global ; iOS joue le réel avec son (politique à trancher et aligner)

Rendu : Fond noir plein cadre, média sous barre d'état, bouton retour verre en haut à gauche (au moins 50 dp sous le haut pour passer sous le notch), contenu décalé horizontalement pendant le glissé de bord, haptique légère à chaque changement de page.

Transposition Android : AdaptiveVerticalPager -> VerticalPager (déjà utilisé) ; révélation liquide -> clip circulaire animé via graphicsLayer/Path avec Shape personnalisée ; CallKit awareness -> AudioFocus + état d'appel du Telecom ConnectionService ; StatusBarHidden -> WindowInsetsController immersif ; fenêtre détachée iPad -> multi-fenêtre tablette (optionnel).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelsPresenter.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelsRevealContainer.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelPresentation.kt`

### Voir un état clair quand il n'y a pas de réel : chargement, vide, échec avec réessayer

`rfp-reels-states-failure` · Android : **partielle** · P1 · effort S

Quand le pager n'a aucun réel, iOS distingue trois états (ReelsPlayerView+EmptyState) : un placeholder plein cadre scintillant au démarrage à froid (jamais un spinner nu), le vide "Aucun réel pour le moment", et l'échec de chargement avec message et bouton Réessayer (avant, une panne réseau se lisait "aucun réel"). Quand le réel visé par une notification est introuvable, le lecteur s'ouvre sur ReelOpenFailureView avec la cause (contenu indisponible, panne réseau, panne serveur) et propose Réessayer seulement si cela peut aboutir, ou Retour ; la phrase est partagée avec le détail de post.

Écarts :
- Chargement à froid : CircularProgressIndicator blanc au lieu d'un placeholder plein cadre avec shimmer (squelette, pas de spinner)
- Vide et échec indistincts : un seul Text(errorMessage ?: "") centré, sans message "Aucun réel pour le moment", sans bouton Réessayer
- Aucune classification de la cause (indisponible / réseau / serveur) pour un réel ouvert depuis une notification : prévoir un ContentFetchFailure partagé (404/403 -> indisponible, I/O -> réseau, 5xx -> serveur) avec libellés et icônes
- Réessayer doit remplir le lecteur déjà ouvert sans repasser par le détail du post, et n'être offert que si la cause est réessayable
- Chaînes à ajouter dans les 4 locales de feature/reels (vide, échec, réessayer, retour) ; glyphe héros décoratif masqué à TalkBack

Rendu : Fond noir, glyphe héros décoratif (taille scalable), titre et détail centrés en blanc atténué, bouton Réessayer en pilule, shimmer plein cadre identique au poster de chargement.

Transposition Android : ContentUnavailableView -> composable d'état maison (icône + titre + détail + bouton) ; shimmer -> modifier shimmer de sdk-ui (MeeshySkeleton).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+EmptyState.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelOpenFailureView.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`

### Reposter ou citer un post fonctionne même sans réseau, sans doublon et avec un message clair si la source a disparu

`rfp-repost-quote-offline` · Android : **partielle** · P1 · effort M

RepostIntent porte un clientMutationId (idempotence) et trois formes : repost simple, citation avec commentaire, citation déclarée. RepostPublisher envoie en direct ou, hors-ligne, met en outbox `.repostPost` (refus si le type de cible est inconnu) avec un registre en vol qui empêche le double envoi du même post et détecte « déjà en file ». RepostFailure classe les échecs : source supprimée (404), élargissement d'audience interdit (403), autre ; les deux premiers sont terminaux. RepostTargeting vise toujours la racine, jamais un repost intermédiaire. RepostContent embarque l'auteur, le texte, les médias, les effets de scène, les mentions et l'expiration de la source.

Écarts :
- Ajouter `OutboxKind.REPOST_POST` : le repost Android part en direct et échoue hors-ligne avec un message générique
- Envoyer `X-Client-Mutation-Id` pour l'idempotence du rejeu et empêcher le double tap (registre de posts en vol, issues `sent/queued/alreadyInFlight/alreadyQueued`)
- Classer les échecs (404 source supprimée, 403 audience élargie) et afficher un message précis plutôt que l'erreur brute ; état terminal sans retry
- Cible de repost explicitement typée (`targetType` POST/REEL/STORY/STATUS) et refus hors-ligne si le type est inconnu
- Option `visibility` du repost et citation déclarée sans texte (isQuote=true)
- Étendre le modèle d'embed aux champs `audioUrl`, `moodEmoji`, `storyEffects`, `mentions`, `expiresAt`, `originalRepostOfId` de RepostContent (l'embed Android ne couvre que le texte et les images)

Rendu : Bottom sheet « Citer » avec aperçu de la source encadré (auteur + extrait + média), bouton Reposter désactivé pendant l'envoi, toast d'erreur spécifique (« Ce post n'existe plus », « Audience trop large »).

Transposition Android : RepostInFlightRegistry (actor) → Mutex + Set<String> dans le repository ; OfflineQueue.hasUnsentRow → requête DAO outbox

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/RepostIntent.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/RepostContent.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostCommand.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedCell.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedPresentation.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Feuilleter les médias d'un post, d'un commentaire ou d'un réel dans une galerie plein écran unique

`rfp-social-gallery` · Android : **partielle** · P1 · effort L

UN plein écran (ConversationMediaGalleryView) sert quatre surfaces sociales — carte du fil, détail, commentaire, réel — via un site unique (socialMediaGallery) : médias visuels du post et SCÈNES comme pages d'une même galerie (pièce jointe synthétique inerte pour les chemins média), légende par média servie dans la langue du lecteur (Prisme), auteur par page, et en bas la pellicule listant les images du post ET les médias en commentaires (source cache d'abord PostGalleryCommentSource puis réseau, sans écriture), avec bouton pour commenter le média (citation CommentQuotedMedia et cible de composition). Les lecteurs (play/pause) pilotent les scènes de page.

Écarts :
- MeeshyImageViewer ne gère que les images (légendes, auteurs, horodatages, miniatures, alt, enregistrement) : ajouter des pages vidéo (lecteur) et scène (ScenePlayer) et un modèle de page typé
- Site unique de composition de la galerie (sélection des médias visuels, auteur par page, carte des légendes) pour fil, détail, commentaire, réel, au lieu d'un montage par surface
- Pellicule du bas listant images du post ET médias de commentaires (cache des commentaires d'abord, réseau ensuite, aucune écriture) avec navigation vers la page
- Action "commenter ce média" : citation du média (CommentQuotedMedia) et cible de composition
- Légende servie par le Prisme (même règle que la conversation) et libellés TalkBack
- Disponible depuis le lecteur de réels (pastille N/total)

Rendu : Fond noir, glisser horizontal entre pages, légende en pied de page avec Développer, pellicule de miniatures arrondies, page active soulignée d'accent.

Transposition Android : fullScreenCover -> destination de navigation plein écran / Dialog ; pellicule -> LazyRow de miniatures.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SocialMediaGalleryPresentation.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostGalleryLot.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostGalleryCommentSource.swift`
- `apps/ios/Meeshy/Features/Main/Views/CommentMediaGallery.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaGallery.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerSource.kt`

### Je publie mon humeur et vois celle de mes amis dans la barre, même sans réseau

`rfp-status-mood-bar-compose` · Android : **partielle** · P1 · effort M

StatusViewModel charge la barre d'humeurs cache-first (fresh/stale/expired) en deux modes (amis, découverte), pagine, réagit en direct aux `status:created/updated/deleted/reacted/unreacted`, enregistre les impressions, applique une réaction de façon optimiste avec delta d'agrégat (jamais sous zéro) et rollback. setStatus publie un mood (emoji, texte, audience, personnes, vocal, repost avec mentions) : en ligne par `POST /posts` type STATUS, hors-ligne par la même ligne outbox `.createPost` avec toast « Humeur en attente d'envoi ». L'ancrage republie un mood en POST permanent. Récupération d'un mood bloqué comme brouillon. StatusEntry porte emoji, texte, audio, expiration (« Expire dans 3h »), « via @user » et résumé de réactions ; StatusService couvre list/create/delete/react.

Écarts :
- Publication hors-ligne d'un mood par outbox (`CREATE_POST` type STATUS avec cmid) et toast « Humeur en attente d'envoi » : `StatusesViewModel.setStatus` envoie en direct
- Humeur vocale (enregistrement dans le composeur et lecture dans la bulle) : `audioUrl` est transporté mais jamais enregistré ni lu
- Audience nominative et mentions dans le composeur de mood (`visibilityUserIds`, `mentions`) ; Android n'offre que Public/Communautés/Contacts/Privé
- Ancrage : republier un mood en POST permanent (`anchorStatusAsPost`) avec commentaire ajouté vs repost simple, via RepostPublisher
- Récupération d'un mood bloqué (> 60 s) comme brouillon et remplacement (`recoverUnsentStatus`/`supersedeRecoveredStatus`)
- Persister chaque mutation temps réel (créé, supprimé, réagi) dans le cache disque de la barre pour qu'elle survive au redémarrage
- Résumé de réactions avec delta prudent, jamais négatif, ignoré pour mes propres réactions (déjà posées en optimiste)
- Mood visible sur les avatars des listes (tap handler `moodTapHandler`) qui ouvre la bulle d'humeur

Rendu : Barre horizontale de pastilles (avatar + emoji) en tête du fil avec pastille « + » pour le mien, bascule Amis/Découvrir, composeur en feuille (grille d'emojis, 122 caractères avec compteur, lignes d'audience), expiration relative dans la bulle.

Transposition Android : CacheCoordinator.statuses → StatusBarCacheRepository (Room) déjà présent ; MoodStatusExpiry déjà porté

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StatusEntry.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusesViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerSheet.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/status/StatusRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/status/StatusBarCacheRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MoodStatusExpiry.kt`

### Retrouver mes publications enregistrées, posts et réels, filtrables

`rfp-bookmarks` · Android : **partielle** · P2 · effort S

BookmarksView liste les publications enregistrées (GET /posts/bookmarks mélange posts et réels) avec un en-tête partagé fixe (pas de surimpression sur le tirer-pour-rafraîchir), un filtre Tout / Postes / Réels affiché seulement si la liste contient les deux natures, des cartes standard, un tap menant au détail pour un post et au lecteur immersif pour un réel, le tap sur l'avatar d'auteur ouvrant sa story (première non vue), signalement avec toasts, comptage des impressions de la liste, pull to refresh, cache-first, état vide "Aucun favori".

Écarts :
- Pas de filtre Tout/Postes/Réels (visible seulement si les deux natures existent) avec libellé d'accessibilité du sélecteur
- Tap sur l'avatar d'auteur -> story de cet auteur
- Carte d'un réel en placeholder (comme dans le fil) : réutiliser la carte réel/standard définitive
- Signalement depuis la liste avec toasts de succès/erreur
- Comptage des impressions de la liste, hauteur/retour opérant dans tous les contextes de présentation

Rendu : Titre "Favoris", segmenté en haut quand pertinent, cartes pleine largeur, état vide centré avec icône signet.

Transposition Android : Picker segmenté -> SingleChoiceSegmentedButtonRow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksListState.kt`

### Publier un post ou réel avec un son de la bibliothèque, crédit conservé

`rfp-borrowed-sound-post` · Android : **partielle** · P2 · effort S

BorrowedSoundPost construit de façon pure, pour les deux surfaces de publication (fil et feuille du composer), un blob storyEffects portant l'unique piste empruntée (soundId + mediaURL serveur, postMediaId vide) exactement comme StoryComposerViewModel.addBorrowedSound, pour que lecteur, export et capture serveur (usage, crédit) suivent le même chemin ; un son de 3 s ou plus qualifie un RÉEL (ReelComposition, miroir de la règle gateway étendue aux sons empruntés), forcePlainPost respecté.

Écarts :
- ReelComposition existe mais ne connaît pas encore le son emprunté (seuil 3 s) ; porter la construction du blob storyEffects à piste unique empruntée
- Aucune bibliothèque de sons côté Android (modèle APISound, recherche, téléchargement) : dépendance à créer ou à partager avec le composer de stories
- Chemin de publication post/réel sans média uploadé (référence soundId)

Rendu : Aucun élément visuel propre.

Transposition Android : Fonction pure Kotlin dans core:model, testable sans UI.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/BorrowedSoundPost.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ReelComposition.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`

### Un compteur de caractères lisible passe au rouge à l'approche de la limite et se lit complètement au lecteur d'écran

`rfp-character-count-label` · Android : **partielle** · P2 · effort S

CharacterCountLabel affiche « n/limite » avec nombres localisés en chiffres tabulaires (sans saut de mise en page), vire au rouge dès 80 % de la limite (seuil configurable), accepte un gris propre au fond (plateau sombre du composeur) et annonce « n caractères sur m » au lecteur d'écran.

Écarts :
- Composable réutilisable `CharacterCountLabel(count, limit, warningThreshold, mutedColor)` : Android a un compteur propre au composeur de mood (`NEAR_LIMIT`) mais aucun composant commun (signalement, édition de post, commentaires, bio)
- Nombres localisés (NumberFormat) et chiffres tabulaires (`fontFeatureSettings = "tnum"`)
- Seuil par défaut à 80 % arrondi au supérieur et couleur d'alerte sémantique non surchargeable
- Description d'accessibilité « n caractères sur m » localisée (ordre des mots par arguments positionnels)

Rendu : Texte 11 sp semibold en textMuted, rouge (error) à partir de 80 % de la limite, aligné à droite sous le champ.

Transposition Android : Text monospacedDigit → Text avec fontFeatureSettings tnum

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CharacterCountLabel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerSheet.kt`

### Voir le post cité sous le champ quand on compose une citation

`rfp-composer-quote-preview` · Android : **partielle** · P2 · effort S

FeedComposerQuotedPostPreview : carte teintée à l'accent de l'auteur cité sous le champ du composer — avatar avec présence et anneau, nom en accent, séparateur, heure relative, et jusqu'à 4 lignes du contenu servi, bordure d'accent (20 %).

Écarts :
- QuoteComposerSheet affiche seulement nom + 3 lignes dans un cadre inputBorder neutre : ajouter avatar (présence/anneau), nom à l'accent de l'auteur, heure relative, 4 lignes, fond surfaceGradient + bordure d'accent 20 %
- Contenu servi (Prisme) plutôt que le texte brut

Rendu : Carte arrondie smPlus, padding md, nom semibold à l'accent, métadonnées en texte atténué.

Transposition Android : Aucun.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedComposerQuotedPostPreview.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

### Voir où un post a été publié : pastille de position et carte plein écran

`rfp-feed-location` · Android : **partielle** · P2 · effort M

Deux rendus du lieu partagé d'un post/réel : FeedPostLocationSticker (pilule pin d'erreur + nom, fond indigo50, texte indigo900, même langage que la pastille de story) qui ouvre un plein écran de lieu (LocationFullscreenView : carte, "Ouvrir dans Plans", "Itinéraire"), et FeedPostLocationMapCard pour un post à position seule : carte statique pleine largeur (vignette via LocationMapThumbnailProviding, jamais de réseau de tuiles dans la liste) avec le texte du post en overlay sur un scrim et le sticker posé dessus.

Écarts :
- Le tap ouvre une application de cartes externe (intent geo) : ajouter un plein écran de lieu dans l'app (carte + Ouvrir dans l'app de cartes + Itinéraire) partagé avec chat/stories
- Post à position seule : carte statique pleine largeur avec texte en overlay sur scrim ; nécessite une source de vignette de carte (aucune dépendance de carte dans le projet : choisir Maps Compose, MapLibre ou une image statique fournie par la passerelle)
- Libellés TalkBack (feed.location.shared)

Rendu : Pilule compacte (pin rouge d'erreur, nom en indigo900 sur indigo50), carte statique arrondie avec scrim dégradé et texte blanc en overlay.

Transposition Android : MapKit snapshot -> Google Maps Static / MapLibre snapshot ; "Ouvrir dans Plans" -> intent geo: / Google Maps.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FeedPostLocationView.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedLocationPresentation.kt`

### Voir un post qui repartage un réel comme une carte citée compacte qui se lit en muet

`rfp-feed-reel-repost-cell` · Android : **partielle** · P2 · effort S

Quand un POST repartage un REEL, le fil (ReelRepostEmbedCell, dans ReelRepostEmbedContainer) le rend en carte pleine largeur compacte plutôt qu'en portrait 9:16 : bande média courte (poster rogné pour une vidéo, logo de réel + note de musique centrée pour un audio), puis auteur original, légende et compteurs (likes) ; bouton lecture central, lecture inline muette élue par le coordinateur d'autoplay sur l'id du post CONTENANT (jamais l'id du réel repartagé : un réel montré nativement ET en repost n'élit qu'une surface), bouton son partagé, tap = détail du réel. Feuille Equatable à entrées-valeurs.

Écarts :
- RepostEmbedCell générique : pas de variante "repost de réel" (bande poster rogné / logo + note audio, centre bouton lecture)
- Pas de lecture inline muette ni de bouton son : brancher l'élection d'autoplay sur l'id du post conteneur
- Compteur de likes du réel cité et libellés d'accessibilité dédiés ("Republié par", "likes")

Rendu : Carte bordée teintée d'accent, bande média de ~120-160 dp, glyphe lecture central en verre, métadonnées sur deux lignes sous la bande.

Transposition Android : Composable dédié dans feature/feed réutilisant le pool de lecteurs.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedCell.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedPresentation.kt`

### Chaque média d'un post peut avoir un texte alternatif et une légende par langue

`rfp-media-alt-caption-texts` · Android : **partielle** · P2 · effort S

ComposerMediaTexts regroupe les textes alt et légende par média (1000 caractères max chacun), et ne produit un payload que s'il y a du texte. Les légendes sont traduites côté serveur (`captionTranslations`) et résolues par le Prisme ; le texte alt sert de description d'accessibilité.

Écarts :
- Ajouter la légende (`mediaCaption`) à côté du texte alt déjà géré dans le composeur (`FeedPostPublishRequest` n'a que `mediaAlt`)
- Modèle commun `ComposerMediaTexts` (alt + caption) avec limite 1000 et payload nul si vide, partagé par composeur et édition
- Utiliser `alt` (puis la légende résolue) comme contentDescription des images du fil et de la visionneuse
- Envoyer alt/légende dans l'édition de post (`mediaAlt`, `mediaCaption`)

Rendu : Champ de texte multi-ligne sous chaque vignette dans le composeur, compteur discret, libellés « Texte alternatif » et « Légende ».

Transposition Android : accessibilityDescription → contentDescription Compose

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/PostMediaText.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Post.kt`

### Découvrir les publications autour de soi : carte, densité, liste, populaires, rayon

`rfp-nearby-discovery` · Android : **partielle** · P2 · effort L

NearbyDiscoveryView (spec 2026-08-02 §4) offre trois lectures d'un même rayon — densité, pins, liste — plus "populaires", un sélecteur de mode Nearby/Discover (Discover réservé au staff), des puces de rayon, une carte MKMapView native (PostsMapRepresentable : annotations par publication, ajustement animé, sélection d'un pin ouvrant une carte de post), un rafraîchissement, et un tableau d'états vides distincts avec action : localisation refusée (ouvrir les réglages), localisation en attente, hors ligne, connexion requise, service indisponible, rien dans le rayon, rien sur la carte. La distance est celle servie par le serveur (jamais recalculée localement). Un menu contextuel "Voir près d'ici" (SeeNearbyContextMenu) sur un badge de position ouvre la carte autour de ce lieu, sans opt-in de découvrabilité.

Écarts :
- Android n'a que la lecture liste (permission, fix de position, rafraîchissement, vide, pagination) : manquent les lectures densité, pins (carte) et populaires, et le sélecteur de mode ; aucune dépendance de carte dans le projet (choisir Maps Compose ou MapLibre)
- Puces de rayon (km) pilotant la requête scope=nearby
- Matrice d'états vides : localisation refusée (avec ouvrir les paramètres), en attente, hors ligne, connexion requise, service indisponible, rien dans le rayon, rien sur la carte, chacun avec titre, détail et action
- Mode Discover réservé au staff (NearbyDiscoverAccess) et carte des publications du fil portant un lieu
- Carte du post sélectionné au tap d'un pin ; ajustement animé de la caméra sur les annotations
- Entrée "Voir près d'ici" (appui long ou menu ...) sur le badge de position d'un post

Rendu : Puces de rayon scrollables, bascule de modes en segmented, carte plein écran avec carte de post en bas, états vides illustrés avec icône dédiée par cause.

Transposition Android : MKMapView -> GoogleMap Compose ou MapLibre ; Settings app deep link -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NearbyDiscoveryView.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedPostsMapView.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyListState.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyDistanceFormat.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/location/DeviceLocationFix.kt`

### « À proximité » montre les publications autour de moi en densité, points, liste ou popularité, avec des états vides explicites

`rfp-nearby-discovery` · Android : **partielle** · P2 · effort L

NearbyDiscoveryViewModel orchestre l'écran de découverte : sections Nearby (Densité, Points, Liste) et Discover réservé au staff (BIGBOSS/ADMIN/MODERATOR : Densité, Populaire à partir du cache du fil). Rayons proposés 5/25/100/500 km, recentrage manuel, focus sur une cellule de densité. Cache-first SWR par clé de cellule géographique, lecture toujours servie du cache hors-ligne (jamais de carte vidée), âge du cache et indicateur de revalidation. Six raisons de vide disjointes : position refusée, en attente de position, hors-ligne, connexion requise, service indisponible, rien dans le rayon (+ rien sur la carte pour Discover). Le fournisseur de position attend la décision de l'utilisateur à la première autorisation. Le service gère `GET /posts/nearby` (offset, 50 max) et `GET /posts/nearby/density` (cellules 1/10/100 km selon le rayon) avec points consentis et précision.

Écarts :
- Modes de lecture Densité (carte de chaleur par cellule), Points (pins avec cercle de précision) et Popularité : Android n'a que la liste
- Section Discover pour le staff (rôle BIGBOSS/ADMIN/MODERATOR) alimentée depuis le cache du fil, avec mode Populaire (vues et impressions)
- Sélecteur de rayon 5/25/100/500 km, recentrage par déplacement de carte, focus sur une cellule (`focus(on:)`), `GET posts/nearby/density` avec taille de cellule 1/10/100 km
- Cache SWR par clé de cellule (`NearbyDiscoveryQuery.cacheKey`) : afficher le cache avant le réseau, indiquer l'âge, ne jamais vider la carte hors-ligne
- Raisons de vide explicites (position refusée avec lien Réglages, en attente de position, hors-ligne, connexion requise, serveur indisponible, rien dans le rayon, rien sur la carte) au lieu d'un seul « Aucune publication »
- Attendre la décision de permission avant de conclure à un échec de position ; relire le statut pour nommer la bonne raison
- Pagination par offset (`NearbyDiscoveryPage.nextOffset`), plafond de rayon 20 000 km et limite 50, distance par post, position consentie quantifiée (`geoPoint` + `geoPrecision`)
- Bibliothèque de carte (Maps Compose ou MapLibre) non présente dans le module feed

Rendu : Sélecteur segmenté en haut (Nearby \| Discover) puis picker contextuel des modes ; carte plein écran avec cellules de chaleur ou pins cernés d'un cercle de précision, feuille inférieure avec la liste ; message d'état vide centré avec action adaptée (Réglages, Réessayer, Élargir le rayon) ; barre de rayon en pastilles.

Transposition Android : CLLocationManager/MapKit → FusedLocation + Maps Compose ou MapLibre ; autorisation Réglages → Intent ACTION_APPLICATION_DETAILS_SETTINGS

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/NearbyDiscoveryViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/NearbyDiscoveryService.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyListState.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/location/DeviceLocationFix.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyDistanceFormat.kt`

### Voir le contenu repartagé dans le détail : post cité, story republiée, sa propre langue

`rfp-post-detail-repost-embed` · Android : **partielle** · P2 · effort M

PostDetailView+RepostEmbed (#4841) : attribution compacte d'une story republiée, embed complet d'un contenu republié (avatar de l'auteur d'origine, nom, @pseudo, tap = profil avec haptique, contenu avec SA propre résolution de langue et son panneau secondaire, médias, nombre de likes, mention "original" avec hint), rendu d'une scène de story republiée via le lecteur (renderedItem), drapeaux de langue du post cité (repostLanguageFlags) et état de langue actif séparé de celui du post extérieur.

Écarts :
- Pas de drapeaux ni de panneau secondaire pour la langue du post cité, ni d'état de langue indépendant
- Rendu d'une story republiée comme scène (attribution compacte + canvas) absent
- Tap auteur -> profil avec retour haptique ; compteur de likes du cité

Rendu : Carte citée bordée avec auteur en tête, texte avec ses drapeaux, likes en pied.

Transposition Android : Aucun.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+RepostEmbed.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedCell.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/RepostEmbedPresentation.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`

### Savoir qui a vu mon contenu et ce que chacun en a fait

`rfp-publication-viewers` · Android : **partielle** · P2 · effort M

La feuille "Vues" (PublicationViewersSheet, enveloppe StoryViewersSheet pour les stories) liste les personnes qui ont vu une story, un statut, un post ou un réel et, sous chaque nom, ce qu'elles y ont fait (réactions avec leurs émojis, commentaires, réponses, republications, partages, favori ; un compteur à zéro ne se dessine pas) ; un tap ouvre le détail d'engagement (heure de vue, ouverture du profil). Accès (#9727) : l'auteur d'une story/statut, ADMIN/BIGBOSS pour tout (lecture journalisée) ; l'auteur d'un post ou réel ne voit que le NOMBRE (la passerelle reste l'autorité, 403 géré). États chargement, interdit, vide, en-tête vues + impressions, compteur de visiteurs.

Écarts :
- La feuille existe pour les stories uniquement : généraliser en PublicationViewersSheet (sujet story | publication) pour posts et réels, avec la règle d'accès PublicationViewersAccess (ADMIN/BIGBOSS pour posts/réels)
- Bande d'engagement par spectateur (réactions emojis, commentaires, réponses, republications, partages, favori) et vue de détail d'engagement (heure de vue, profil)
- États forbidden (403), vide, chargement ; en-tête "vues + impressions" et compteur de visiteurs (un/plusieurs)
- Entrée depuis les compteurs de portée d'une carte/détail/réel pour ceux qui y ont droit

Rendu : Lignes avatar + nom + bande de pastilles d'engagement, en-tête avec totaux, détail en plein écran modal.

Transposition Android : Sheet SwiftUI -> ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PublicationViewersSheet.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersPresentation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryViewer.kt`

### Compter correctement les vues et le temps de visionnage d'un réel

`rfp-reels-engagement-telemetry` · Android : **partielle** · P2 · effort S

Chaque réel affiché ouvre une session d'engagement (begin au passage posé, end avant le begin du suivant dans la même tâche pour ne pas perdre la vue qualifiée) ; à la fin on attache le temps réel regardé, les échantillons de battements (règle serveur 30 %/90 %) et le drapeau terminé (fin atteinte ou >= 95 %), mais seulement pour un réel vidéo dont le moteur partagé a bien chargé CE média (ReelWatchAttachmentPolicy, sinon la vue irait au mauvais réel). Les impressions sont vidées à la sortie, et recordView est appelé à chaque nouveau réel.

Écarts :
- Android calcule un dwell via EngagementSessions mais n'envoie ni watchMs réel, ni échantillons de battements, ni durée du média, ni drapeau completed (playCount) : brancher la position/durée du player et un drainWatchSamples
- Règle d'attachement : ne lire le moteur que si le réel est une vidéo dont le média chargé correspond (éviter d'attribuer la lecture d'un autre réel)
- Marquer comme lues les notifications du réel affiché et filtrer ses bannières (voir pager)
- Vidage des impressions et fin de session à la sortie du lecteur et à chaque changement (ordre end -> begin dans la même coroutine)

Rendu : Aucun élément visuel.

Transposition Android : EngagementTracker -> EngagementSessions (déjà portée) + Player.currentPosition/duration.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ReelPlaybackRules.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`

### Retrouver tous mes messages étoilés, toutes conversations confondues

`rfp-starred-messages` · Android : **partielle** · P2 · effort S

StarredMessagesView liste les messages étoilés en lignes autonomes (expéditeur, aperçu du contenu, pastille de la conversation source, bascule d'étoile) qui fonctionnent même si la conversation est archivée ou hors ligne (instantané local) ; un tap navigue vers le message dans sa conversation via le flux de mise en évidence du routeur (surbrillance bornée à la conversation cible) ; menu verre ... "Tout retirer" ; appui long = menu contextuel (retirer) ; en-tête partagé (retour verre) ; état vide natif.

Écarts :
- Pas de menu "Tout retirer" (avec confirmation) ni d'appui long contextuel
- Pastille de la conversation source dans la ligne (vérifier le rendu) et hint d'accessibilité de ligne
- Navigation vers le message avec surbrillance bornée à la conversation (jumpToMessage) à confirmer
- Écran empilé/panneau/feuille : retour opérant dans les trois contextes (tablette)

Rendu : Lignes : nom de l'expéditeur, aperçu 2 lignes, pastille de conversation colorée, étoile jaune à droite ; menu à trois points en disque de verre.

Transposition Android : Menu verre -> DropdownMenu dans la TopAppBar.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/StarredMessagesStore.kt`

### Mes messages étoilés se retrouvent sur tous mes appareils et suivent leurs modifications

`rfp-starred-messages-sync` · Android : **partielle** · P2 · effort S

StarredMessagesStore conserve des instantanés de messages étoilés (identifiant serveur, conversation, expéditeur, aperçu 280 caractères, type de pièce jointe, dates), ordonnés par date d'étoile, persistés, vidés à la déconnexion. `follow(mutation)` répond aux mutations temps réel : `message:starred` pose l'étoile placée depuis un autre appareil (aperçu relu en base dans la langue du lecteur), un unstar, une suppression ou une expiration la retirent, une modification met à jour l'aperçu. StarredSnapshotFactory compose l'instantané (traduction préférée, sinon texte, sinon libellé du média).

Écarts :
- Étoile purement locale : écouter `message:starred` / unstarred pour placer l'étoile venue d'un autre appareil (`placeRemote`) en relisant l'aperçu du message dans la langue du lecteur
- Retirer automatiquement l'étoile d'un message supprimé ou expiré et mettre à jour l'aperçu quand il est édité (`updatePreview`)
- Vider le store à la déconnexion (`resetForLogout`)
- Aperçu tronqué à 280 caractères avec repli sur le libellé du média (« Photo », « Vidéo »…) et traduction préférée du Prisme
- Ordre par date d'étoile décroissante à l'insertion

Rendu : Liste de messages étoilés groupés par conversation avec couleur d'accent de la conversation, aperçu sur deux lignes et horodatage.

Transposition Android : UserDefaults JSON → SharedPreferences/DataStore existant ; RealtimeMessageMutation → collecteur des événements socket message:*

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/StarredMessagesStore.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/StarredSnapshotFactory.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/StarredMessagesStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StarredMessages.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesViewModel.kt`

### Aimer un post en détail avec retour immédiat et mises à jour en direct des autres lecteurs

`rfp-post-detail-heart-live` · Android : **complète** · P2 · effort S

PostDetailView+Heart : bascule du cœur optimiste par le socket avec repli REST (retour arrière seulement si le REST échoue aussi) et réception temps réel des réactions de la room du post (cœur ajouté/retiré, compteur absolu des autres lecteurs).

Rendu : Même rendu que la barre d'actions.

Transposition Android : Socket + REST iOS -> outbox durable + room du post (comportement équivalent, plus robuste hors ligne).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PostDetailView+Heart.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`

