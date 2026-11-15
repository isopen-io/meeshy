# Parité iOS → Android : `story-composer-canvas`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**61 features iOS** : 31 absentes, 21 partielles, 9 divergentes, 0 complètes sur Android. **52 lots** planifiés (≈50130 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**story-composer-canvas#1** (couverture Android estimée ≈ 20 %)

Cette partie est le moteur de scène des stories sur iOS (MeeshyUI/Story/Canvas, 115 fichiers, environ 24 600 lignes). Une UIView unique, StoryCanvasUIView, rend une StorySlide en mode édition (tous les objets visibles, gestes, horloge 60/120 Hz) comme en mode lecture (fenêtres temporelles, keyframes, fondus, transitions d'ouverture et de fermeture). Elle délègue à StoryRenderer, le même moteur que le compositeur AVFoundation de l'export MP4. Les calques CALayer rendent le fond (couleur, dégradé, image, vidéo, bandes floutées), les médias, les textes (18 styles, 6 cadres, verre flouté, effets), les stickers (gabarits, bitmaps, GIF, mouvements), la pastille de lieu et les puces audio. Autour d'eux : manipulation au doigt (pan, pinch, rotation, aimantation, zoom à 3 doigts), sélection, menu d'appui long, édition du texte en place, accessibilité VoiceOver, lecture synchronisée (dérive, pause, tampon, minuteur), scrub du lecteur, mixage audio avec ducking, couvertures statiques et export MP4 avec filigrane animé, intro et outro de marque. Android est à environ 20 % : le lecteur Compose affiche fond, médias de premier plan, textes (un seul poids de police), dessin et deux pistes audio, avec des briques pures portées (keyframes, fondus, transitions de clips, aimantation, zone de sécurité). Le composer Compose gère texte, stickers emoji et dessin. Manquent presque tout le rendu des stickers, des lieux et des puces audio, les transitions de slide, le verre, les bandes floutées, les filtres au lecteur, le scrub, le pilotage des vidéos par le temps de la timeline, l'export MP4 et la marque. Le composer et le lecteur sont deux implémentations séparées, donc l'aperçu n'est pas le lecteur. Priorité : unifier le rendu (canvas unique), rendre stickers, textes complets et médias, puis lecture synchronisée, puis export.

**story-composer-canvas#2** (couverture Android estimée ≈ 10 %)

Cette partie porte le « plateau » créatif du composer iOS : le dessin à main levée (traits à largeur variable selon la pression du stylet ou la vitesse du doigt, lissage courbe/droite, marqueur translucide, gomme par trait, barre de bulles flottantes, liste des traits), la feuille de stickers unique (onglets Recherche/Favoris/Récents, un onglet par pack, Personnalisés, Smileys, Boutique) avec ses ~200 gabarits dessinés procéduralement en 20 familles, les 164 films Lottie de Mee et Meo, les 100 Instants dont le texte est redessiné en natif, « Mes stickers » (coller/détourer), l'hôte SwiftUI du canvas de scène, les bulles et panneaux d'édition de texte (18 styles, 25 effets, cadres, bordures, langue), les boutons de sourdine sur le canvas, la règle d'adoption des médias à la publication et le petit panneau des effets de message. Côté Android, seul un socle existe : le modèle de trait (StoryDrawingStroke) et son réducteur d'annulation/rétablissement (StoryDrawingBoard), une couche de dessin à largeur constante et sans gomme, un sélecteur d'emoji dans un AlertDialog, une barre d'outils de texte à 5 styles, un panneau d'effets de message en feuille modale et un greffage d'identifiants de médias à la publication. Tout le pan « sticker riche » (gabarits, Mee/Meo, Instants, bibliothèque, packs, boutique, favoris/récents) est absent, y compris dans le chat ; le modèle StorySticker Android ne porte ni templateId, ni slots, ni animation, donc un sticker gabarit publié depuis iOS dégrade en emoji de repli. Le rendu des traits iOS dans le lecteur Android est divergent (largeur constante, lissage et marqueur ignorés). Le gros du volume (≈ 56 % des lignes iOS) est le dessin des gabarits, à réimplémenter en Canvas Compose avec une table d'icônes équivalente aux SF Symbols. Couverture globale estimée très faible, autour de 10 %.

## Notes transverses

DECISION D'ARCHITECTURE STRUCTURANTE. Le moteur de scène iOS vit dans MeeshyUI (SDK), pas dans l'app. Côté Android on le miroite : (1) les LOIS pures (plan de rendu, géométrie, keyframes, fondus, pose de transition, largeur de trait, lissage, volume, export) vont dans :core:model sous le sous-paquet me.meeshy.sdk.model.scene (Kotlin pur, prouvé en local par ./apps/android/meeshy.sh jvm-check, seul vrai gate hors CI) ; (2) le rendu Compose (SceneCanvas et ses couches, feuille de stickers, gabarits, Mee/Instants) va dans :sdk-ui, parce que :feature:feed, :feature:reels et :feature:chat ne peuvent pas dépendre de :feature:stories (règle « jamais feature vers feature ») alors qu'iOS réutilise le même canvas pour le fil, le repost et le chat ; (3) :feature:stories ne garde que le câblage d'écran mince (composer, viewer) et les réducteurs d'état. Les lois pures déjà présentes dans :feature:stories (interpolateur de keyframes, fondus, fenêtres, cadrage du fond, espace de dessin, matrice de filtre…) sont déplacées d'abord par le lot lois-de-scene-vers-core-model ; aucun autre lot ne doit être démarré avant lui s'il importe ces fichiers.

FICHIERS CHAUDS ET ORDRE DE PROPRIÉTÉ. StoryComposerScreen.kt (2022 lignes), StoryComposerViewModel.kt (1235), StoryViewerScreen.kt (1113) et StoryViewerViewModel.kt (999) dépassent ou frôlent le plafond de 1200 lignes ; ajouter à un fichier hors budget est interdit. Règle : le lot composer-ecran-et-viewmodel-decoupes éclate d'abord le composer (écran en ≥8 fichiers, logique VM en réducteurs purs) ; le lot canvas-scene-unique-en-lecture est le seul propriétaire du viewer pendant sa vague. Tout lot ultérieur qui touche un de ces fichiers le fait par un ajout de quelques lignes de câblage, rebasé sur la tête de dev, et est planifié dans une vague différente d'un autre lot qui le touche. Les fichiers de build (libs.versions.toml, build.gradle.kts de sdk-ui / sdk-core / feature:stories) sont centralisés dans le lot dependances-gradle-scene-medias pour éviter tout conflit parallèle.

POINTS D'EXTENSION PAR COUCHE. Le lot canvas-scene-unique-en-lecture crée UN fichier par type d'objet (SceneBackgroundLayer, SceneMediaLayer, SceneTextLayer, SceneStickerLayer, SceneLocationLayer et SceneAudioChipLayer en squelettes, SceneDrawingLayer) et un dispatcher SceneItemRenderer ; les lots 10 à 17 et 23 sont ensuite propriétaires exclusifs de leur fichier de couche et peuvent tourner en parallèle. De même, le lot gabarits-socle-registre-et-contour crée les 20 fichiers de famille squelettes et la table complète : les six lots de familles ne remplissent que leur(s) fichier(s) et ne touchent jamais la table.

CYCLE DANS L'INVENTAIRE, RÉSOLU. scc-reader-playback-control dépendait de scc-video-timeline-sync qui dépendait de lui : fusionnés dans le lot lecture-horloge-pause-et-synchro-video (avec la cadence énergétique). scc-reader-scrub et scc-stall-gated-progress sont fusionnés dans lecture-barre-attente-et-scrub (même barre de progression, même ViewModel).

PRISME LINGUISTIQUE. Le plan de rendu (lot plan-de-rendu-de-scene-unique) est le site UNIQUE de résolution de langue du contenu de scène : il descend le prisme de bout en bout via LanguageResolver (jamais translations.first ; absence de traduction vers la langue préférée = contenu original) pour les textes, et il injecte la langue lecteur dans tous les types d'objet qui portent une langue (locale d'ObjectV3, sourceLanguage). Les chaînes d'accessibilité lisent le texte servi, pas l'original. Le texte d'un sticker Instant (slots) est de l'auteur et n'est pas traduit. Toute évolution des règles de rang touche les TROIS miroirs (web, iOS, Android).

RÉTROCOMPATIBILITÉ DU FIL (directive prod #9223). Les nouveaux champs de StorySticker (templateId, slots, animation), de StoryTextObject (fontWeight, frameShape…), de StoryMediaObject (adjustments) et le nouvel objet lieu sont tous optionnels avec défaut neutre, et un champ ou un kind de scène inconnu doit être conservé verbatim à la republication (le lot modele-scene-stickers-lieux-reglages-texte l'exige par test). Un ancien client Android continue de décoder un document écrit par le nouveau. Le contrat message sticker Mee reste templateId « mee.<id> » + emoji + slots.

DIVERGENCES VOLONTAIRES / BOGUES D'ÉCART À CONSIGNER. (a) StoryKeyframeResolver Android soustrait startTime pour tous les canaux alors qu'iOS ne le fait que pour la position : on garde la version Android (conforme à la spec timeline), à documenter dans l'issue du plan de rendu. (b) Le clamp d'échelle du média de premier plan du lecteur (0,2 à 3) diverge de SceneObjectScalePolicy (0,3 à 4) ; le composer est déjà à 0,3 à 4. (c) Les cibles de snap Android (1/3, 1/2, 2/3 à 0,025) divergent d'iOS (0,18 / 0,25 / 0,5 / 0,75 / 0,82 à 0,02 ; fond 0 / 0,5 / 1 à 0,035) ; la grille de tiers permanente pendant le glisser est à trancher contre la planche (décision-produit éventuelle). (d) Le blob PencilKit hérité (drawingData) n'a pas de rendu Android et le fichier iOS LegacyDrawingMigration est not-applicable : une ancienne story iOS qui n'a QUE ce blob est invisible sur Android ; à signaler au porteur en issue décision-produit (rastérisation côté serveur ?) et non à corriger dans ces lots. (e) Rendre le contour de sticker (die-cut) seulement dans la feuille et la bulle, jamais dans la scène de story.

RISQUES TECHNIQUES À SPIKER AVANT ENGAGEMENT. (1) Export MP4 : piste privilégiée = Media3 Transformer 1.4.1 avec une piste de base (vidéo de fond ou piste synthétique) et un OverlayEffect / BitmapOverlay dont getBitmap(presentationTimeUs) est fourni par le rendu hors écran Compose (GraphicsLayer.toImageBitmap) ; à valider sur appareil (coût par image, 30 fps, 5 Mbps, mémoire). Le gate CI ne teste pas l'encodage ; prévoir un test instrumenté manuel documenté. (2) Verre : RenderEffect.createBlurEffect n'existe qu'à partir de l'API 31 ; repli API 26 à 30 = voile teinté ou flou boîte sur bitmap réduit, comportement à valider visuellement. (3) Détourage : ML Kit Subject Segmentation dépend de Google Play Services (bêta) : capacité injectée, absente (pas grisée) si indisponible. (4) 18 polices embarquées : choisir des équivalents SIL OFL (Great Vibes, Pinyon Script, Patrick Hand, Orbitron, Fredoka, Playfair, Bebas, Permanent Marker, etc.), vérifier le poids de l'APK ; la table d'équivalence va dans une décision d'architecture. (5) Lottie : 264 fichiers .lottie (1,7 Mo) en assets ; viser lottie-compose et un script de synchronisation pour ne jamais les copier à la main. (6) Tout est vérifié en CI uniquement (dl.google.com inaccessible aux conteneurs) : pousser un maximum de logique en :core:model et garder les écrans minces.

DÉPENDANCES EXTERNES AU DOMAINE (ext:). ext:story-timeline-editor (frise de montage, autre domaine) pour le moniteur d'aperçu ; ext:chat-sticker-message (envoi d'un sticker dans une conversation, format message sticker) pour la destination « conversation » de la feuille ; ext:shared-place-picker (sélecteur de lieu / carte et lieux alentour, autre domaine) pour l'onglet Lieu des gabarits ; ext:feed-story-embed (le fil et le repost consomment la surface de lecture réutilisable du lot lecture-prechargement-et-surface-reutilisable) ; ext:gateway-packs-shop (routes services/gateway/src/routes/packs-shop.ts et routes/me/stickers.ts existent déjà, aucun client Android aujourd'hui) ; ext:media-upload (téléversement d'un sticker de bibliothèque ou d'un média, StoryMediaUploader existe côté composer).

VAGUES SUGGÉRÉES (pour l'orchestrateur). Vague 0, en parallèle, fichiers disjoints : dependances-gradle-scene-medias, lois-de-scene-vers-core-model, geometrie-design-1080-et-echelle-objets, modele-scene-stickers-lieux-reglages-texte, lois-traits-pression-lissage-gomme, lois-audio-volume-ducking-mixage, lois-export-video-et-marque, adoption-des-medias-a-la-publication, composer-ecran-et-viewmodel-decoupes, catalogue-mee-meo-et-instants-genere. Vague 1 : plan-de-rendu-de-scene-unique, puis canvas-scene-unique-en-lecture. Vague 2, en parallèle sur couches disjointes : fond, médias, stickers, lieu, texte (polices), dessin-rendu, feuille de stickers, gabarits-socle, composer-canvas. Vague 3 : texte cadres, verre, filtres, horloge, composer manipulation, texte saisi sur la scène, dessin capture, stickers Mee, gabarits grille. Vague 4 : barre/attente/scrub, prélecture, transitions, mixeur, puce audio, couverture hors écran, format paysage, gestes du fond, sélection/menu, réglages texte, premières familles de gabarits. Vague 5 : export (rendu, audio, service), instants, bibliothèque, packs, familles restantes, marque, pont de frise, effets de message, sourdine.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `adoption-des-medias-a-la-publication` | E | P0 | S | 300 |  | Un média posé sur la scène reste visible pour tous après publication |
| `canvas-scene-unique-en-lecture` | E | P0 | L | 1800 | plan-de-rendu-de-scene-unique, dependances-gradle-scene-medias, story-model-split-un-type-par-fichier, story-viewer-decomposition-and-nav-graph | Le lecteur de story affiche tous les objets de la scène (texte, média, sticker, dessin) avec un seul canvas |
| `dependances-gradle-scene-medias` | F0 | P0 | S | 90 |  | Les bibliothèques médias de la scène (Lottie, GIF animés, Media3 Transformer, détourage) sont disponibles pour tous les lots |
| `fond-de-scene-ajustement-et-bandes-floues` | E | P0 | M | 1000 | canvas-scene-unique-en-lecture, geometrie-design-1080-et-echelle-objets | Le fond de la story (couleur, dégradé, photo ou vidéo) s'affiche sans flash, se cadre au doigt et ne laisse jamais de bandes noires |
| `geometrie-design-1080-et-echelle-objets` | E | P0 | M | 450 |  | La scène garde les mêmes proportions sur tous les écrans, en portrait 9:16 comme en paysage 16:9 |
| `lecture-horloge-pause-et-synchro-video` | E | P0 | L | 1500 | fond-de-scene-ajustement-et-bandes-floues, medias-de-premier-plan-sur-la-scene, story-viewer-decomposition-and-nav-graph | Maintenir un doigt gèle toute la story d'un bloc, les vidéos restent calées sur le temps, et une scène immobile ne chauffe pas |
| `lois-de-scene-vers-core-model` | E | P0 | M | 160 |  | Les règles de scène déjà écrites (keyframes, fondus, fenêtres, cadrage du fond) vivent dans le module partagé et restent vertes |
| `medias-de-premier-plan-sur-la-scene` | E | P0 | M | 1100 | canvas-scene-unique-en-lecture, geometrie-design-1080-et-echelle-objets | Photos, vidéos et GIF posés sur la scène se cadrent, se rognent, tournent et se jouent sans accroc |
| `modele-scene-stickers-lieux-reglages-texte` | E | P0 | M | 650 | story-model-split-un-type-par-fichier | Un sticker gabarit, un lieu, un texte en cadre ou une image réglée publiés depuis iOS gardent leur identité sur Android |
| `plan-de-rendu-de-scene-unique` | E | P0 | L | 1100 | lois-de-scene-vers-core-model, geometrie-design-1080-et-echelle-objets, modele-scene-stickers-lieux-reglages-texte | Ce qu'on compose, ce qu'on lit et ce qu'on exporte se décide dans le même plan de rendu |
| `stickers-et-mouvements-sur-la-scene` | E | P0 | M | 1200 | canvas-scene-unique-en-lecture, modele-scene-stickers-lieux-reglages-texte | Les stickers (emoji, images collées, GIF, gabarits) s'affichent nets dans la scène et bougent quand ils sont animés |
| `texte-de-scene-18-styles-et-effets` | E | P0 | M | 950 | canvas-scene-unique-en-lecture, modele-scene-stickers-lieux-reglages-texte | Les textes de story se lisent avec leurs 18 styles, leur poids, leur contour et leurs effets lumineux |
| `catalogue-mee-meo-et-instants-genere` | E | P1 | M | 800 | dependances-gradle-scene-medias | Les 164 stickers de Mee et Meo et les 100 Instants sont décrits par un catalogue généré, jamais recopié à la main |
| `composer-canvas-meme-scene-que-le-lecteur` | E | P1 | L | 1800 | composer-socle-decoupage-et-dependances, canvas-scene-unique-en-lecture, medias-de-premier-plan-sur-la-scene, stickers-et-mouvements-sur-la-scene, texte-de-scene-18-styles-et-effets | Dans le composer, la scène que je compose est exactement celle que le lecteur jouera |
| `composer-format-paysage-et-reprojection` | E | P1 | M | 450 | geometrie-design-1080-et-echelle-objets, composer-canvas-meme-scene-que-le-lecteur, composer-socle-decoupage-et-dependances | Importer un fond paysage bascule la scène en 16:9, et un repost vers un autre format repositionne les éléments |
| `composer-gestes-du-fond-et-zoom` | E | P1 | M | 580 | composer-manipulation-et-aimantation, composer-socle-decoupage-et-dependances | Toucher, double-toucher ou appuyer longtemps sur le fond a un effet juste, et pincer à trois doigts zoome la scène |
| `composer-manipulation-et-aimantation` | E | P1 | M | 1200 | composer-canvas-meme-scene-que-le-lecteur, geometrie-design-1080-et-echelle-objets, composer-socle-decoupage-et-dependances | Je déplace, pince et fais tourner texte, sticker et média au doigt, avec un seul objet à la fois et des lignes d'aimantation justes |
| `composer-selection-menu-et-accessibilite` | E | P1 | M | 1350 | composer-manipulation-et-aimantation | L'objet sélectionné est encadré avec son plan et son niveau, son menu n'offre que des actions utiles, et TalkBack décrit la scène |
| `couverture-et-rendu-hors-ecran` | E | P1 | M | 450 | canvas-scene-unique-en-lecture, stickers-et-mouvements-sur-la-scene, texte-de-scene-18-styles-et-effets, story-tray-rings-metrics-and-cells | Les vignettes de mes stories et de mes brouillons montrent la vraie scène composée |
| `dessin-capture-barre-et-liste-des-traits` | E | P1 | L | 1250 | dessin-rendu-trait-variable, composer-socle-decoupage-et-dependances, composer-manipulation-et-aimantation | Je dessine au stylet ou au doigt avec ma pression, je gomme en frôlant, et je règle chaque trait depuis des bulles et une liste |
| `dessin-rendu-trait-variable` | E | P1 | M | 550 | lois-traits-pression-lissage-gomme, canvas-scene-unique-en-lecture | Un trait dessiné s'affiche à l'identique partout : largeur variable, lissage, marqueur translucide, halo de sélection |
| `export-mp4-audio-et-fond-video` | E | P1 | M | 900 | export-mp4-rendu-image-par-image, lois-audio-volume-ducking-mixage | La vidéo exportée porte le bon son : voies de la scène, rampes de volume et son de la vidéo de fond |
| `export-mp4-rendu-image-par-image` | E | P1 | XL | 2400 | lois-export-video-et-marque, couverture-et-rendu-hors-ecran, fond-en-verre-flou-reel, image-edition-rendu-gpu, dependances-gradle-scene-medias | Je peux enregistrer ma story en vidéo MP4 fidèle à l'écran, légère et rapide |
| `export-mp4-service-galerie-et-partage` | E | P1 | M | 800 | export-mp4-rendu-image-par-image, composer-socle-decoupage-et-dependances, story-action-rail-plan-and-layout, story-header-identity-and-options-menu, dependances-gradle-scene-medias | L'export de ma story continue en arrière-plan avec sa progression, puis je l'enregistre dans la galerie ou je la partage |
| `feuille-de-stickers-onglets-recents-favoris` | E | P1 | M | 1450 | modele-scene-stickers-lieux-reglages-texte, composer-socle-decoupage-et-dependances | Une seule feuille de stickers à onglets (Recherche, Favoris, Récents, packs, Personnalisés, Smileys) pose un emoji et retient mes habitudes |
| `fond-en-verre-flou-reel` | E | P1 | L | 900 | texte-de-scene-cadres-et-mise-en-lignes, fond-de-scene-ajustement-et-bandes-floues | Le fond en verre d'un texte floute réellement ce qui passe derrière, même sur une vidéo |
| `gabarits-famille-amour-texte-dispo-reponses` | E | P1 | L | 1400 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations Amour, Texte, Disponibilité et Réponses se dessinent avec mes mots |
| `gabarits-famille-lieu-heure-meteo` | E | P1 | L | 1700 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations Lieu, Heure et Météo se dessinent nettes, avec leurs données |
| `gabarits-grille-et-remplissage-automatique` | E | P1 | M | 1100 | feuille-de-stickers-onglets-recents-favoris, gabarits-socle-registre-et-contour, location-picker-screen | Je choisis une décoration dans une grille de vignettes dont le contenu (heure, date, texte, lieu) se remplit tout seul |
| `gabarits-socle-registre-et-contour` | E | P1 | M | 1300 | modele-scene-stickers-lieux-reglages-texte, dependances-gradle-scene-medias, story-sticker-animation-and-scene-motion | Chaque décoration se dessine avec les mêmes briques, et le contour blanc découpé de Mee et Meo est prêt |
| `lecture-barre-attente-et-scrub` | E | P1 | M | 1150 | lecture-horloge-pause-et-synchro-video, story-playback-hold-and-stall, story-viewer-decomposition-and-nav-graph | La barre de progression attend que la story soit prête, se fige quand la vidéo charge et se parcourt au doigt |
| `lecture-prechargement-et-surface-reutilisable` | E | P1 | M | 600 | canvas-scene-unique-en-lecture, lecture-barre-attente-et-scrub, video-moteur-partage-et-montage, story-viewer-decomposition-and-nav-graph | La story suivante s'affiche instantanément, et le lecteur se réutilise dans le fil, le repost et l'aperçu de post |
| `lois-audio-volume-ducking-mixage` | E | P1 | S | 450 | lois-de-scene-vers-core-model | Plusieurs pistes sonores se règlent et s'effacent sous la voix selon les mêmes règles que sur iPhone |
| `lois-export-video-et-marque` | E | P1 | M | 650 |  | Les réglages d'export vidéo, le plan de marque et la résolution des entrées sont fixés et prouvés avant tout encodage |
| `lois-traits-pression-lissage-gomme` | E | P1 | M | 550 |  | Un trait dessiné garde la même épaisseur, le même lissage et le même effacement que sur iPhone |
| `mixeur-audio-multipistes-et-ducking` | E | P1 | L | 1100 | lois-audio-volume-ducking-mixage, lecture-horloge-pause-et-synchro-video, story-viewer-decomposition-and-nav-graph | Plusieurs pistes sonores jouent ensemble, la musique s'efface sous la voix et chaque piste peut être coupée |
| `pastille-de-lieu-sur-la-scene` | E | P1 | M | 600 | canvas-scene-unique-en-lecture, modele-scene-stickers-lieux-reglages-texte, story-canvas-card-floor-and-sentinel, story-gesture-tap-zones-and-pause | Une pastille de lieu (épingle et nom) se pose sur la scène comme un sticker |
| `puce-audio-sur-la-scene` | E | P1 | M | 800 | canvas-scene-unique-en-lecture, lois-audio-volume-ducking-mixage, fond-en-verre-flou-reel | Une piste audio posée sur la scène s'affiche en puce avec onde ou crédit défilant |
| `stickers-mee-meo-animes` | E | P1 | M | 1000 | catalogue-mee-meo-et-instants-genere, feuille-de-stickers-onglets-recents-favoris, dependances-gradle-scene-medias, chat-bulle-decoupage-composants, composer-socle-decoupage-et-dependances | Mee et Meo, les deux colibris, jouent leurs stickers animés que je peux poser ou envoyer |
| `texte-de-scene-cadres-et-mise-en-lignes` | E | P1 | M | 900 | texte-de-scene-18-styles-et-effets | Un texte de story se met en lignes proprement et s'encadre en bulle, pilule, losange ou nuage |
| `texte-saisi-directement-sur-la-scene` | E | P1 | M | 700 | texte-de-scene-18-styles-et-effets, composer-manipulation-et-aimantation, composer-socle-decoupage-et-dependances | Je tape mon texte directement sur la scène, centré au-dessus du clavier |
| `transitions-douverture-et-fermeture-de-slide` | E | P1 | M | 450 | canvas-scene-unique-en-lecture, lecture-horloge-pause-et-synchro-video, story-canvas-card-floor-and-sentinel | Chaque slide s'ouvre et se ferme par un fondu, un zoom, un glissement ou une révélation circulaire |
| `composer-sourdine-des-medias-sur-le-canvas` | E | P2 | S | 280 | composer-canvas-meme-scene-que-le-lecteur, puce-audio-sur-la-scene, lois-audio-volume-ducking-mixage, composer-socle-decoupage-et-dependances | Je coupe ou rétablis le son d'une vidéo ou d'un son posé sur le canvas d'un simple appui sur sa puce |
| `effets-de-message-panneau-compact` | E | P2 | S | 220 | composer-glass-shell | Un petit panneau au-dessus de la barre d'outils arme l'animation d'entrée et l'effet permanent de mon message |
| `export-marque-intro-fin-et-jingles` | E | P2 | L | 1500 | export-marque-logo-et-filigrane, export-mp4-audio-et-fond-video | La vidéo exportée s'ouvre sur l'identité de l'auteur et se ferme sur la carte Meeshy, avec leurs jingles |
| `export-marque-logo-et-filigrane` | E | P2 | M | 700 | export-mp4-rendu-image-par-image, lois-export-video-et-marque, composer-socle-decoupage-et-dependances | La vidéo exportée porte un discret filigrane animé Meeshy qui change de coin |
| `gabarits-famille-joie-stupeur-humeur` | E | P2 | L | 1300 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations de Joie, de Stupeur et d'Humeur se dessinent, animées quand elles le sont |
| `gabarits-famille-nature-gourmand-sport` | E | P2 | L | 1800 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations Nature, Gourmand et Sport se dessinent avec leurs tracés riches |
| `gabarits-famille-salut-reactions-fete-bravo` | E | P2 | L | 1700 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations de Salut, Réactions, Fête et Bravo se dessinent, animées quand elles le sont |
| `gabarits-famille-voyage-travail-musique` | E | P2 | L | 1700 | gabarits-socle-registre-et-contour, gabarits-grille-et-remplissage-automatique | Les décorations Voyage, Travail et Musique se dessinent avec leurs tracés riches |
| `instants-mee-texte-natif` | E | P2 | M | 700 | stickers-mee-meo-animes, gabarits-grille-et-remplissage-automatique | J'envoie un Instant de Mee ou Meo qui écrit à ma place le message, l'heure, le lieu ou la météo sur le sticker |
| `pont-frise-apercu-et-repetition-transitions` | E | P2 | M | 600 | transitions-douverture-et-fermeture-de-slide, composer-canvas-meme-scene-que-le-lecteur, scene-frise-mode-anime, composer-socle-decoupage-et-dependances | Derrière la frise de montage, la scène montre en direct l'instant de la tête de lecture, et choisir une transition la rejoue aussitôt |

### Lots fusionnés ou retirés par l'architecture

- `filtres-et-reglages-image-en-direct` → `image-edition-rendu-gpu` (merge-into) : Même moteur de filtres et réglages en direct.
- `texte-reglages-bulles-et-panneaux` → `texte-styles-effets-barre-et-panneau-editeur` (drop-duplicate) : Même barre de bulles et panneau d'édition du texte. Hérite : texte-de-scene-cadres-et-mise-en-lignes.
- `stickers-bibliotheque-coller-detourer` → `stickers-gabarits-animations-et-bibliotheque` (merge-into) : Même « Mes stickers » (coller, détourer). Hérite : feuille-de-stickers-onglets-recents-favoris.
- `packs-de-stickers-et-boutique` → `pack-shop-ui-and-settings` (drop-duplicate) : Même boutique de packs.
- `composer-ecran-et-viewmodel-decoupes` → `composer-socle-decoupage-et-dependances` (drop-duplicate) : Même découpage de StoryComposerScreen / ViewModel.

## Features

### Une piste audio posée sur la scène s'affiche en puce avec onde ou crédit défilant, jusque dans la vidéo exportée

`scc-audio-chip-render` · Android : **absente** · P1 · effort M

StoryAudioChipPainter peint les puces des sons de premier plan telles que le lecteur les montre, dans les rendus en un coup (export MP4, couverture) : capsule de verre (flou du dessous teinté), icône waveform en dégradé de marque (indigo #6366F1 vers #4338CA) ou waveform.slash atténuée quand la piste est coupée, onde ou crédit défilant, rotation et échelle d'auteur. Les mesures sont celles de la vue de référence (icône 18, contenu 54 ou 92, marges 12 × 8, espacement 8) projetées à la largeur rendue. Le modèle (StoryAudioChipTemplate) met en cache ce qui ne varie pas d'une image à l'autre ; seule la zone de l'onde ou du crédit change, à coût borné par image.

Écarts :
- Les sons de premier plan jouent sans puce : StoryAudioPlayerObject (x, y, waveformSamples) n'est pas rendu ; créer le composable de puce (la vue vivante SwiftUI AudioForegroundChip est hors de cette partie).
- Placement pur (StoryAudioChipPlacement) : position, rotation, échelle, secondes depuis l'apparition ; mesures projetées à la largeur rendue.
- Peinture hors écran (export, couverture) : capsule de verre, icône dégradée, onde ou crédit défilant, cache de l'invariant par forme et résolution.
- Crédit rasterisé en bande à largeur naturelle, qui défile quand il déborde (jamais tronqué).
- Manipulation de la puce (déplacer, pincer 0,3–4, tourner) ; elle est exclue du canvas UIKit côté iOS, l'hôte la gère.

Rendu : Capsule translucide teintée sombre, liseré fin, icône à gauche en dégradé indigo, onde animée par la piste (barres arrondies) ou texte du crédit en défilement continu.

Transposition Android : CoreGraphics + CIFilter blur → Canvas Compose / Bitmap + RenderEffect ; waveform SF Symbol → ImageVector personnalisé.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAudioChipPainter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAudioChipTemplate.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Toucher, double-toucher ou appuyer longtemps sur le fond a un effet juste selon ce qu'il contient

`scc-background-gestures` · Android : **absente** · P1 · effort S

Un tap sur le fond désélectionne (le tap simple n'émet qu'après l'échec du double-tap, pour ne pas ouvrir deux fois le panneau). Un double-tap sur le fond bascule ajusté / rempli. L'appui long sur une scène réellement vide ouvre le viseur caméra, avec suivi du doigt (début, déplacement, fin) pour tenir une prise. Sur une scène qui porte déjà un média de fond, l'appui long ouvre les outils de ce fond (onBackgroundMediaLongPressed) et non le viseur. L'appui long n'est reconnu qu'en édition, au début du geste, et pas sur un objet (qui a son menu).

Écarts :
- Le canvas Android ne gère que le tap de désélection et la transformation du fond ; ajouter double-tap (bascule ajusté / rempli) et appui long.
- Résultat pur de l'appui long : vide, donc viseur ; fond média présent, donc outils du fond ; objet touché, donc rien (le menu de l'objet).
- Appui long en trois temps (début, déplacement, fin) pour piloter la caméra en prise maintenue.
- Tap simple différé tant que le double-tap peut encore advenir.

Rendu : Haptique léger à l'ouverture du viseur et à la bascule ajusté / rempli.

Transposition Android : UILongPressGestureRecognizer + UITapGestureRecognizer require(toFail:) → detectTapGestures(onDoubleTap, onLongPress, onTap) ou awaitLongPressOrCancellation.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasBackgroundLongPress.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Un fond ajusté ne laisse jamais de bandes noires : elles se remplissent d'un flou de l'image

`scc-background-letterbox-fill` · Android : **absente** · P1 · effort S

Quand le fond est ajusté (ratio différent du cadre), les bandes se remplissent d'une image de 32 px de côté long tirée du ThumbHash ou du bitmap, étirée donc lissée sans filtre. Une teinte unie peut aussi être choisie (StoryBackdrop). La couche de bande est toujours insérée sous le contenu, y compris sous l'AVPlayerLayer attaché plus tard. Elle se supprime quand l'hôte ne présente pas le cadre entier.

Écarts :
- Calculer la source de la bande (hash du média, sinon bitmap réduit) et la peindre étirée sous le média, y compris derrière une vidéo ExoPlayer.
- Gérer le backdrop de teinte unie choisie par l'auteur et le drapeau servesLetterboxFill.
- Supprimer le remplissage quand le lecteur ne montre que le rectangle de l'image.

Rendu : Bande plein cadre floue et douce, de la couleur dominante de l'image ; le média ajusté reste net par-dessus.

Transposition Android : CALayer sous le contenu → Image(painter = ThumbHashPainter) en Box sous le média avec ContentScale.FillBounds ; la 32 px bitmap suffit comme flou (pas de RenderEffect).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+LetterboxFill.swift`

</details>

### Enregistrer ou partager la story en vidéo MP4 fidèle à l'écran, légère et rapide

`scc-export-mp4-pipeline` · Android : **absente** · P1 · effort XL

StoryExporter exporte une slide en MP4 en pilotant une composition AVFoundation par StoryAVCompositor : chaque image de sortie est dessinée par le même StoryRenderer que le canvas vivant (pont de la file de travail vers le main actor, jamais appelé en synchrone depuis le main). Substrat de pistes : fond vidéo (fenêtre de source, boucle ou non, avec queue transparente), sinon piste vidéo synthétique d'une seconde mise en cache pour une slide statique. Les médias visuels sont ramenés à des fichiers locaux, les images de stickers résolues, les vidéos de premier plan décodées image par image (StoryForegroundVideoFrameSource). Audio : pistes de voies résolues, rampes de volume, son de fond de vidéo. L'encodage passe par AVAssetReader + AVAssetWriter pour plafonner le débit : 30 fps, H.264 High, image-clé toutes les 2 s, ~5 Mbps à 1080×1920 (0,08 bit / pixel / image, bornes min et max), Display P3. Plusieurs scènes se rendent une par une puis s'enchaînent sans ré-encodage (concaténation passthrough). Progression remontée, survie à l'arrière-plan (~30 s), annulation propre.

Écarts :
- Aucun export vidéo, aucune dépendance Media3 Transformer / MediaMuxer : concevoir le pipeline (Transformer avec effets GL personnalisés, ou rendu Canvas / GL image par image vers MediaCodec par Surface, puis MediaMuxer).
- Dessiner chaque image avec le moteur de rendu commun (texte, stickers, lieux, puces audio, dessin, fondus, keyframes, transitions, verre flouté, filtres) comme l'écran.
- Substrat : fond vidéo avec fenêtre de source, boucle et queue ; piste synthétique pour les slides statiques ; décodage image par image des vidéos de premier plan (MediaMetadataRetriever / Transformer).
- Audio : voies résolues, rampes de volume, son de fond de vidéo ; muet de fond honoré ; fenêtre de rognage de source honorée.
- Encodage 30 fps H.264 High, image-clé 2 s, débit cible ≈ 5 Mbps à 1080×1920 (0,08 bpp × fps, avec bornes min / max), 1080×607 en paysage.
- Résolution des entrées : URL distantes, relatives (/api/v1/attachments/...), file:// du composer (existence locale), images en mémoire prioritaires sur les adresses, octets animés des GIF.
- Concaténation sans ré-encodage de plusieurs scènes d'un post.
- Progression, annulation, erreurs typées (aucune vidéo de fond, URL invalide, piste vidéo manquante, session impossible, échec, annulation, substrat synthétique impossible) et survie à la mise en arrière-plan : WorkManager expédié ou service de premier plan avec notification.
- Enregistrer dans la galerie (MediaStore) et partager (ACTION_SEND) le MP4 produit.

Rendu : La vidéo livrée doit être indiscernable de la scène à l'écran ; poids ≈ 37 Mo par minute (≈ 5 Mbps) ; 30 images par seconde.

Transposition Android : AVMutableComposition + AVVideoCompositing + AVAssetWriter → Media3 Transformer avec GlEffect / OverlayEffect ou pipeline MediaCodec + EGL ; beginBackgroundTask → WorkManager (setExpedited) ou service de premier plan ; AVAssetImageGenerator → MediaMetadataRetriever.

<details><summary>Sources iOS (11)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter+SourceWindow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter+SyntheticTrack.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter+VisualMedia.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportEncoder.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportVideoSettings.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportFrameRate.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportInputs.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportSequence.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryForegroundVideoFrameSource.swift`

</details>

### Le fond en verre d'un texte floute réellement ce qui passe derrière, même en lecture vidéo

`scc-glass-backdrop` · Android : **absente** · P1 · effort L

Le verre d'un texte est un flou gaussien (sigma configurable, 24 par défaut) de la scène située derrière le texte. Voie préférée : le canvas capture la scène sans les textes en verre dans une texture Metal, découpe la région du texte, applique MPSImageGaussianBlur. Voie de secours : un filtre gaussianBlur privé sur le calque. En lecture, la capture ne se refait que si la clé change (slide, révision, taille, langues, objets visibles) ou à cadence bornée (~18 images par seconde) quand le dessous bouge (vidéo). Le tampon d'alimentation évite de re-nourrir une couche déjà à jour. Le même flou est cuit dans l'export.

Écarts :
- Le fond en verre est un voile blanc translucide (18 %), sans flou : implémenter un flou réel du contenu situé derrière le texte.
- Capture du dessous : graphicsLayer enregistrée en RenderNode et RenderEffect.createBlurEffect (API 31+), solution de repli pour API 26–30 (bitmap réduit + RenderScript remplaçant / Toolkit, ou voile teinté avec flou box).
- Clé de capture (slide, révision, taille de rendu, langues, ensemble des objets visibles à l'instant) pour ne recapturer qu'au changement ; cadence bornée à ~18 fps quand le dessous bouge (vidéo de fond).
- Tampon d'alimentation par couche pour ne pas re-nourrir ce qui est déjà à jour.
- Même flou cuit dans l'export MP4 (voir scc-export-mp4-pipeline).
- Sigma configurable (rayon de verre de l'auteur, 24 par défaut).

Rendu : Le texte en verre montre la scène floutée à travers son cadre arrondi, teintée légèrement ; le flou suit la vidéo de fond sans à-coup.

Transposition Android : MPSImageGaussianBlur sur MTLTexture + CARenderer → RenderEffect.createBlurEffect / graphicsLayer.renderEffect sur API 31+, GL (GlShaderProgram) dans l'export ; CAFilter gaussianBlur de secours → voile teinté si API < 31.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBlurFilter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackdropCapture.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryGlassBackdropPlayback.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryEditBackdropThrottle.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextBackground.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Une pastille de lieu (épingle et nom) se pose sur la scène comme un sticker

`scc-location-pill` · Android : **absente** · P1 · effort M

StoryLocationLayer rend un StoryLocationObject en pastille rasterisée (glyphe d'épingle et libellé du lieu), selon le même motif que les stickers : une image pré-rasterisée assignée à contents, donc compatible avec la capture du canvas et l'export. Le libellé vient du lieu partagé, le style choisit un gabarit parmi ceux du registre, avec ses emplacements. Les mesures sont en espace design projetées par la géométrie, pour la même position sur iPhone, iPad et dans la vidéo exportée. La pastille compte comme élément de premier plan (donc manipulable) et porte ses quatre champs de timing comme ses sœurs.

Écarts :
- Aucun modèle StoryLocationObject ni rendu dans les stories ; FeedPostLocationSticker n'existe que pour les posts du fil.
- Porter le modèle (lieu partagé, style, position, échelle, rotation, fenêtres de temps) et le libellé résolu.
- Dessin de la pastille (épingle + libellé, 42 px design de base, marges 22 / 14, espacement 10) ou du gabarit de lieu correspondant.
- Pastille manipulable (compte comme premier plan) et animable (timing, fondus, keyframes), incluse dans les menus et l'accessibilité (libellé « Lieu »).
- Sélecteur de lieu du composer (autre domaine) pour poser la pastille.

Rendu : Capsule arrondie claire, épingle de marque à gauche et nom du lieu en police système demi-grasse, liseré indigo discret, même position relative sur tous les écrans.

Transposition Android : CALayer pré-rasterisé → Bitmap mis en cache ou Canvas Compose ; Pin SF Symbol → ImageVector Material (Place).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryLocationLayer.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`

### L'objet sélectionné est entouré d'un cadre violet à quatre poignées avec son plan et son niveau z

`scc-selection-marker` · Android : **absente** · P1 · effort S

setSelectionMarker(id, badge) dessine, autour de l'objet sélectionné, un cadre violet (#8F7DF8, rayon 8) avec quatre poignées d'angle (rayon 3) et un badge sombre (noir 0,043 à 75 %, rayon 5) posé au-dessus et portant par exemple « TEXT · PLAN FG · z 2 ». Le badge rend lisibles les actions Monter / Descendre qui, sans lui, empilaient à l'aveugle. « Trois plans, un seul objet à la fois. » (planche 1c).

Écarts :
- Aucun cadre de sélection sur la scène Android : le seul indice est la barre d'outils qui change.
- Dessiner cadre, quatre poignées et badge au-dessus de l'objet, qui suivent le déplacement, l'échelle et la rotation.
- Badge de type, plan et z (par exemple « TEXT · PLAN FG · z 2 ») pour que Monter / Descendre aient un retour visible ; chaînes localisées.
- Couleur violette de marque (#8F7DF8) issue des tokens, pas codée en dur.

Rendu : Cadre violet #8F7DF8 de rayon 8 pt, poignées carrées de 6 pt environ (rayon 3), badge sombre translucide à coins 5 pt au-dessus, texte blanc condensé.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+SelectionMarker.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Chaque slide s'ouvre et se ferme par un fondu, un zoom, un glissement ou une révélation circulaire

`scc-slide-opening-closing-transitions` · Android : **absente** · P1 · effort M

Les effets d'ouverture et de fermeture de slide sont fade, zoom, slide et reveal. L'ouverture s'anime seule au passage édition vers lecture. La fermeture est pilotée par la tête de lecture (progression calculée depuis la durée totale). Zoom : de 1,08 à 1. Slide : décalage de 8 % de la largeur. Reveal : masque circulaire qui grandit d'un point à tout le cadre. Fade : animation d'opacité. Durée commune de 1,2 s. Une même courbe de pose est échantillonnée par le lecteur et par l'export, qui n'a pas de moteur d'animation.

Écarts :
- Le champ opening/closing existe sur le modèle (StoryTransitionEffect : FADE, ZOOM, SLIDE, REVEAL) mais le lecteur ne les rend jamais.
- Implémenter la courbe de pose pure (zoom 1,08 vers 1, glissement 0,08 × largeur, révélation circulaire, fondu) échantillonnée à partir d'un temps écoulé, utilisée aussi par l'export.
- Progression de fermeture dérivée de la durée totale effective de la slide et de la tête de lecture ; palier d'horloge haut juste avant la fenêtre de fermeture.
- Réinitialiser la transformée et le masque racine à l'état neutre après l'effet.

Rendu : Durée 1,2 s ; zoom de 1,08 vers 1 ; glissement d'un demi-pas depuis +0,08 × largeur vers 0 à l'ouverture et de 0 vers −0,08 × largeur à la fermeture ; révélation depuis un cercle de 1 pt jusqu'au recouvrement complet.

Transposition Android : sublayerTransform + CAShapeLayer mask → graphicsLayer (scale, translationX, alpha) et clip par Path circulaire (drawWithContent / clipPath).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer+RootTransitions.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Les stickers décoratifs bougent (pulse, heartbeat, wobble, bounce, float, spin, blink, shake, swing)

`scc-sticker-motion` · Android : **absente** · P1 · effort M

Une décoration qui déclare une animation (9 mouvements) prend sa pose par StickerAnimation.pose(at:), fonction pure du temps écoulé depuis son apparition. En composition, StoryStickerMotionClock fournit ce temps (le playhead n'avance pas en .edit) et refreshStickerMotion repose seulement transformée et opacité sur les calques déjà montés, sans reconstruire. Dans l'export, advanceAnimatedStickers avance aussi les GIF image par image depuis l'apparition du sticker, car render(in:) ne fait tourner aucune animation.

Écarts :
- Aucun modèle d'animation de sticker : porter StickerAnimation (9 cas) et sa fonction pure pose(t), avec bornes de lisibilité (contraste WCAG) identiques.
- Horloge d'apparition par sticker en composition ; ne poser que transformée + opacité, sans recomposer la scène.
- Filtrer la liste des stickers qui déclarent un mouvement (coût nul pour une scène sans décoration animée).
- Dans l'export, avancer les GIF à l'instant exact de l'image rendue.

Rendu : Mouvements courts et discrets (pulse gonfle doucement, heartbeat bat deux fois, wobble oscille, bounce rebondit, float flotte, spin tourne sans fin, blink clignote, shake tremble, swing se balance).

Transposition Android : CAKeyframeAnimation / pose par tick → rememberInfiniteTransition ou valeur dérivée de withFrameNanos dans graphicsLayer.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerMotionClock.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+StickerMotion.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer+AnimatedStickers.swift`

</details>

### Les stickers à gabarit (heure, lieu, cœur, enseigne, etc.) se dessinent nets avec un contour blanc découpé

`scc-sticker-templates-diecut` · Android : **absente** · P1 · effort L

StickerTemplateRenderer est le registre des dessinateurs de gabarits (palette MeeshyColors : encre, liseré indigo, accent, cœurs, ampoule ambre), leurs métriques (sticker, aperçu, lieu), la mesure de taille d'un gabarit, le rendu d'image et son cache. StickerDieCut ajoute le contour blanc découpé de Mee et Meo : papier blanc qui déborde de 1,6 % du côté, seize directions de dilatation, ombre d'encre douce décalée vers le bas. Le contour est une couche de présentation (feuille, bulle, PNG envoyé), absente de la scène d'une story.

Écarts :
- Registre de gabarits (templateID vers dessinateur) et API image(templateID, slots, taille) avec cache : les dessinateurs eux-mêmes vivent dans Canvas/Templates (autre partie du domaine).
- Palette de décoration issue des tokens MeeshyColors, jamais des couleurs système.
- Métriques par usage (sticker de scène, aperçu, pastille de lieu) et mesure de taille par gabarit.
- Contour découpé : dilatation de la silhouette sur 16 directions, papier blanc 1,6 %, ombre d'encre alpha 0,26, marge ajoutée par bord.
- Utilisation du gabarit comme image de sticker de scène et du contour dans la feuille de choix et la bulle de message.

Rendu : Dessins vectoriels nets à toute taille ; contour blanc épais de 1,6 % avec ombre douce (encre 26 %) uniquement dans la feuille et la bulle.

Transposition Android : CGContext / UIGraphicsImageRenderer → Canvas Compose ou Bitmap + android.graphics.Canvas ; NSCache → LruCache.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StickerTemplateRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StickerDieCut.swift`

</details>

### Les vidéos de la scène restent calées sur la musique et la barre de progression

`scc-video-timeline-sync` · Android : **absente** · P1 · effort M

La tête de lecture avance du temps réel écoulé entre deux ticks (au-delà de 0,25 s, c'est une suspension et on n'avance que d'une image), de sorte qu'une image perdue ne désynchronise plus la scène de l'audio. Toutes les 0,5 s le canvas mesure la dérive de chaque vidéo qui joue dans sa fenêtre et ne la recale que si elle dépasse le seuil, par un seek tolérant (moins que la moitié du seuil de part et d'autre) pour éviter une rafale de recalages. Le démarrage et la reprise recalent aussi sur la timeline.

Écarts :
- Horloge de playhead par temps réel écoulé (plafond d'écart 0,25 s) au lieu d'une Animatable linéaire dissociée du son.
- Contrôle de dérive périodique (0,5 s) : comparer la position ExoPlayer à la cible timeline, recaler au-delà du seuil par seek tolérant, ne toucher qu'un clip qui joue dans sa fenêtre.
- Calage au démarrage et à la reprise (resume en place sans saut si déjà aligné).
- Décision pure testable (shouldSeekToAlign, driftCorrection) partagée par fond et premier plan.

Rendu : Aucune correction visible tant que l'écart reste sous le seuil ; la correction n'interrompt jamais le son.

Transposition Android : CADisplayLink + CMTime seek → Choreographer / withFrameNanos + Player.currentPosition + seekTo avec SeekParameters.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer+Drift.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/VideoDriftCorrection.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/PlayheadTickClock.swift`

</details>

### Mee et Meo, les deux colibris, jouent leurs 164 stickers animés que je peux envoyer ou poser

`scc2-mee-films` · Android : **absente** · P1 · effort M

MeeStickerCatalog (généré depuis le script web mee-ios-stickers.ts) liste 164 films Lottie (.lottie, bundle MeeStickers) classés par personnage (Mee, Meo, Duo) et par intention (bonjour, amour, fête, soutien, râle, coup de mou, surprise, quotidien, humour noir), chacun avec titre, emoji de repli et drapeau animé. L'onglet « Mee & Meo » (et ses trois onglets de pack) affiche des sections par intention (titre + indication en 12 pt) en rangées de 3 cases de 96 pt. MeeStickerFilmView affiche d'abord une image fixe (première image, cache 24 Mo), attend 150 ms (annulable : une case qui ne fait que passer ne monte rien) puis joue le film en boucle, sauf si « Réduire les animations » est actif ; décodage plafonné à 360 px (180 en grille), cache de films 96 Mo, film libéré à la disparition, transparent aux touchers (appui long, double tap, glisser-répondre restent ceux de la bulle). Choisir un Mee l'envoie ou le pose avec le contrat message templateId « mee.<id> » + emoji ; appui long = favori. Android n'a aucun sticker animé, pas de dépendance Lottie, et pas de sticker dans le chat.

Écarts :
- Ajouter une dépendance Lottie Compose (lecture .lottie/dotLottie ou conversion en JSON) et embarquer les 264 fichiers mee.*.lottie (164 Mee/Meo + 100 Instants) depuis packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers comme assets Android (script de synchronisation).
- Générer le catalogue Kotlin (id, personnage, intention, titre, emoji, animé) depuis le même script web que l'index Swift pour éviter toute dérive ; ordre des intentions imposé (bonjour, amour, fête, soutien, râle, coup de mou, surprise, quotidien, humour noir).
- Titres et indications d'intention fr/en/es/pt (MeeSticker.Intent.title/hint) et titres des stickers.
- Vue film : image fixe immédiate, délai 150 ms annulable avant de charger l'animation, boucle, arrêt si « Supprimer les animations » système (ANIMATOR_DURATION_SCALE = 0) ou si hors écran ; plafond de décodage 360 px, 180 px en grille ; caches (images fixes ~24 Mo, films ~96 Mo) ; libération à la disparition.
- La vue film est transparente aux gestes de la bulle (pas de capture de touches).
- Sections de l'onglet : rangées de 3 cases 96 dp, espacement 8, en-tête d'intention (symbole oiseau + titre en capitales + indication secondaire 12 sp).
- Contrat d'envoi/pose : sticker de message { templateId: « mee.<id> », emoji } et sticker de scène équivalent ; lecture des messages reçus avec ce templateId (nécessite le support sticker dans le chat Android).
- Récents/favoris : entrée de type mee ; filtrage des entrées Mee si l'hôte ne sait pas les poser.

Rendu : Cases carrées 96 dp sans fond, animation en boucle fluide, image fixe d'abord (jamais de case vide), transparence conservée. Rangées de 3 ; titre d'intention avec glyphe d'oiseau en dégradé de marque ; hint 12 sp arrondi secondaire. Aucune marque de mouvement sur les films Mee.

Transposition Android : Lottie iOS → lottie-compose ; NSCache → LruCache dimensionné par octets ; Reduce Motion → Settings.Global.ANIMATOR_DURATION_SCALE / AccessibilityManager.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerCatalog.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerCatalog+Index.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerFilmView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Mee.swift`

</details>

### Les décorations d'information se dessinent : Lieu, Heure, Météo, Amour, Texte, Disponibilité et Réponses

`scc2-template-families-info` · Android : **absente** · P1 · effort L

Onze fichiers dessinent les familles pilotées par une donnée ou un propos : Lieu (pastille d'origine inchangée au pixel près, carte postale à double filet, plus de variantes dont des cartouches étendues), Heure (horloge et variantes, date type feuille de calendrier, compte à rebours, plus 7 dessins supplémentaires), Météo (cartouches dégradés avec icônes tracées : soleil, nuage…), Amour (date et cœurs, plus 7 variantes), Texte (dix cadres à MOTS libres : prose repliée, capitales, chasse fixe), Disponibilité (dispo, occupé…) et Réponses (oui/non/peut-être…). Chaque dessinateur sait mesurer son texte puis se rasteriser. Les noms sont localisés. Android n'en a aucun ; les lecteurs Android affichent au mieux l'emoji de repli.

Écarts :
- Réimplémenter en Kotlin les dessinateurs des familles Lieu (pastille + carte postale + variantes LocationMore/Extra), Heure (+TimeExtra), Météo, Amour (+LoveExtra), Texte, Disponibilité et Réponses, chacun avec mesure(), dessin(), nom localisé et emplacements déclarés.
- Respecter les invariants de rendu : la pastille de lieu garde la police système non arrondie et le dessin d'avant la refonte au pixel près (une garde iOS l'exige) ; la famille Texte replie la prose à 9 × corps et utilise un texte d'exemple « Coucou ! » quand vide.
- Fournir les noms de gabarits et libellés (heure, date, météo, réponses) en fr/en/es/pt.
- Comportement de la famille Lieu : cartouches alimentées par nom et détail de lieu (placeName/placeDetail) avec spécimen quand aucun lieu n'est connu.
- Golden tests par gabarit pour verrouiller le rendu.

Rendu : Cartouches arrondis (≈ 0,30 × hauteur) à fond dégradé vertical pour la météo, surface claire à double filet pour la carte postale, texte arrondi semi-gras/gras, icône à gauche et texte à droite avec intervalle de métrique.

Transposition Android : Voir scc2-template-toolkit ; icônes météo = tracés propres (Path) plutôt que dépendre d'une police d'icônes.

<details><summary>Sources iOS (11)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Location.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+LocationExtra.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+LocationMore.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Time.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+TimeExtra.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Weather.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Love.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+LoveExtra.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Text.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Availability.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Answer.swift`

</details>

### Je choisis une décoration dans une grille de vignettes (Texte, Amour, Heure, Météo, Lieu et seize autres familles) dont le contenu se remplit tout seul

`scc2-template-picker` · Android : **absente** · P1 · effort M

Les onglets de gabarits de la feuille (20 familles : texte, amour, joie, stupeur, humeur, salut, réactions, fête, dispo, nature, bravo, réponses, gourmand, sport, voyage, travail, musique, heure, météo, lieu) affichent des grilles de 3 colonnes de vignettes de 104 pt (fond arrondi 12 teinté 5 %, dessin rendu en asynchrone avec clé de tâche = gabarit+emplacements+contour+échelle, repli emoji pendant le rendu). Les emplacements sont remplis par l'hôte : heure et date figées à l'ouverture (famille Heure et Amour), texte saisi (champ capsule « Écrivez vos mots… », grille désactivée tant que vide), lieu choisi (Lieu : puces de lieux alentour dans l'en-tête, puce « Ma position… » ouvrant un sélecteur de carte, spécimen « Votre lieu / autour de vous » tant qu'aucun lieu n'est connu, grille désactivée sans lieu, message « Active la position pour épingler un lieu » ou « Aucun lieu trouvé autour de vous », permission de localisation demandée à l'arrivée sur la section, pas à l'ouverture). Les gabarits animés montrent leur mouvement (pose calculée à 30 i/s, en pause hors écran et une fois stabilisée, coupée si « Réduire les animations ») et un badge durable « livephoto » en bas à droite. Libellé d'accessibilité = nom + valeurs + mouvement ; appui long = favori ; la pose alimente les récents. Android n'a aucun gabarit.

Écarts :
- Modèle StickerTemplate (id, famille, emplacements {nom, nature valeur|prose}, emoji de repli, échelle de pose, animation) et catalogue (environ 10 gabarits par famille × 20 familles, certains lieux/heure étendus) avec noms fr/en/es/pt.
- Remplisseur d'emplacements (StickerSlotFiller) : heure, date, texte, nom et détail de lieu ; horloge figée à l'ouverture de la feuille (horloge injectable pour les tests).
- Grille 3 colonnes de vignettes 104 dp, espacement 10, rendu asynchrone avec repli emoji (taille 0,34 × côté) ; re-rendu quand les emplacements, le contour blanc ou la densité changent.
- Onglet Texte : champ capsule « Écrivez vos mots… » (hauteur min 40, libellé d'accessibilité « Texte de la décoration »), grille désactivée à 55 % d'opacité tant que le texte est vide ; ceinture dans le geste de pose.
- Onglet Lieu : lieux alentour fournis par l'app, puces dans l'en-tête de section, puce « Ma position… » (sélecteur de carte) seulement si le fournisseur existe, spécimen non posable tant que le lieu n'est pas choisi, permission de localisation demandée à l'arrivée sur la section et relancée quand elle est accordée pendant que la feuille est ouverte.
- Messages d'état du lieu distincts : fournisseur absent (« Active la position pour épingler un lieu ») vs rien trouvé (« Aucun lieu trouvé autour de vous »), sans retirer les styles de la grille.
- Mouvement : modèle StickerAnimation (pose = rotation, échelle, décalage, opacité en fonction du temps, délai de stabilisation), vignette animée à 30 i/s, en pause hors écran et une fois stabilisée, désactivée par les paramètres d'animation système ; badge durable (disque noir 45 %, glyphe blanc, taille 0,11 × côté, coin bas droit, marge 5).
- Accessibilité : libellé « <nom> — <valeurs> » + description du mouvement ; appui long = épingler ; la pose enregistre le récent.
- Variante « contour blanc » (die-cut) pour la conversation, nue sur une scène, via un paramètre de la feuille.
- Chemin spécial de la famille Lieu : poser un gabarit de lieu transmet le lieu complet (coordonnées) et pas seulement des textes.

Rendu : Vignette 104 dp, fond arrondi 12 dp à 5 % de l'encre, dessin centré avec 8 dp de marge, badge de mouvement discret en bas à droite. Une grille désactivée est à 55 % d'opacité. Le contenu montré est un SPÉCIMEN honnête (jamais un lieu inventé comme « Paris »).

Transposition Android : TimelineView(.animation) → withFrameNanos / animateFloat à 30 i/s ; CLLocationManager + MapKit picker → FusedLocationProviderClient + sélecteur de lieu (carte) existant ; SF Symbol livephoto → icône Material (motion photos on).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Templates.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerMotionMark.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPaletteEnvironment.swift`

</details>

### Chaque décoration se dessine avec les mêmes briques : police arrondie, cartouches, dégradés, cœur, étoile, nuage, icônes

`scc2-template-toolkit` · Android : **absente** · P1 · effort M

Le socle du dessin des gabarits : le contrat StickerTemplateDrawer (id, nom localisé, mesure(slots, métriques) → taille, dessin(slots, métriques, échelle écran) → image + taille), la table famille → dessinateurs (20 familles), les assistants partagés de StickerTemplateDrawing (police système arrondie et chiffres à chasse fixe, mesure et dessin de texte centré ou replié, fonds en dégradé vertical, rasterize à l'échelle écran, formes cœur/pilule/étoile/burst/nuage, glyphes SF Symbol / emoji / personnalisé, cartouches « légende + glyphe »). Les métriques (corps de police, marges, intervalle) pilotent toute la taille ; le texte détermine la taille de l'image. Android doit recréer ce moteur de dessin avec Compose Canvas/Paint (ou Bitmap) et une table d'équivalence des SF Symbols utilisés.

Écarts :
- Définir l'interface TemplateDrawer {id, name, measure(slots, metrics): Size, draw(slots, metrics, density): Bitmap/ImageBitmap} et la table famille → liste de dessinateurs pour les 20 familles.
- Métriques de gabarit (fontSize, horizontalPadding, verticalPadding, gap) et palette (surface, label, pin, hairline…) partagées, avec variantes clair/sombre si iOS en a.
- Assistants de texte : police système arrondie semi-gras, chiffres à chasse fixe gras, mesure, centrage, repli de ligne (maxWidth = 9 × corps) avec alignement.
- Assistants de forme : cœur (deux arcs + courbes), pilule, étoile à N branches avec ratio intérieur, burst, nuage, dégradé vertical dans un tracé, rasterize à l'échelle de densité (bitmap non opaque).
- Glyphes : table d'équivalence SF Symbol → ImageVector Material Symbols pour tous les symboles utilisés par les 20 familles, avec émission d'un emoji quand aucune icône n'équivaut ; mise à l'échelle conservant le rapport d'aspect.
- Rendu hors écran déterministe (même image pour l'aperçu, la pose et l'export) et cache par (gabarit, emplacements, taille, densité).
- Tests de non-régression visuelle par gabarit (golden) car aucun dessin n'a de contrôle autre que la comparaison d'images.

Rendu : Coins de cartouche ≈ 0,28–0,30 × hauteur ; filet de contour ≈ 0,045 × corps de police ; texte semi-gras arrondi ; glyphe mis à l'échelle sans déformation. Les images sont rendues non opaques sur fond transparent à l'échelle écran.

Transposition Android : UIBezierPath/UIGraphicsImageRenderer/NSAttributedString → android.graphics.Path/Canvas/StaticLayout (ou Compose Canvas + TextMeasurer) ; SF Symbols → Material Symbols/ImageVector ; UIFont .rounded → famille arrondie embarquée (ex. Nunito/Quicksand sous licence libre) ou FontFamily.SansSerif.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplateDrawer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplateDrawing.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplateDrawing+Shapes.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplateFamilyTable.swift`

</details>

### La vidéo exportée porte la marque Meeshy : intro d'auteur, filigrane animé et carte de fin

`scc-export-branding` · Android : **absente** · P2 · effort L

L'emballage de marque s'applique en une seule passe d'encodage (plutôt qu'un ré-encodage par pièce) via un plan de marque (StoryExportBranding.Plan). Interlude d'identité en tête : bannière de l'auteur ou dégradé de teinte, avatar, nom d'affichage, @username, capsule de mood (emoji et message) ; tenu à pleine opacité 1,2 s puis fondu enchaîné 0,5 s sur la story, sur la signature sonore d'entrée. Carte de fin : logo trois traits qui se trace puis respire sur fond de marque (opaque, 2 s), avec en option une fermeture d'auteur en deux temps (logo 1,5 s puis identité 2,0 s). Filigrane : logo animé et mot « meeshy » plus @handle, qui alterne de coin (bas-droite puis haut-gauche) par segments de 12 s avec fondu de 0,4 s, trace de logo échelonnée puis respiration (cycle 3 s), opacité de base 0,22. Jingles d'entrée et de sortie synthétisés de façon déterministe et mis en cache. La fabrique d'intro (StoryExportIntroFactory) résout l'identité de l'utilisateur ou de l'auteur d'une story emportée, avec nom, bannière, mood et repli ThumbHash.

Écarts :
- Dessin procédural du logo trois traits (trace échelonnée puis respiration) partagé par filigrane, intro et carte de fin, aux mêmes constantes (couleur de marque #6366F1, largeur de trait 112 en design).
- Filigrane : segment de 12 s, fondu 0,4 s, coin alterné (bas-droite / haut-gauche), opacité 0,22, texte « meeshy » et @handle pré-rendus.
- Intro d'identité 1,2 s + fondu 0,5 s : bannière aspect-fill ou dégradé d'accent, scrim, initiales de repli, capsule de mood ; dimension identique à la story (gabarit de la slide).
- Carte de fin 2 s, et fermeture d'auteur en deux temps (logo 1,5 s, identité 2,0 s, fondu d'entrée 0,4 s).
- Jingles d'entrée et de sortie : PCM déterministe synthétisé une seule fois et mis en cache (clé = résumé de l'identité).
- Fabrique d'identité : utilisateur courant ou auteur d'une story emportée, nom d'affichage résolu, bannière / avatar / ThumbHash, mood via statut éphémère.
- Application en une seule passe d'encodage dans le pipeline d'export, jamais en trois.

Rendu : Logo trois traits indigo qui se trace en 1,1 s puis respire ; mot « meeshy » blanc ; filigrane discret à 22 % qui change de coin ; intro sur fond de bannière sombre avec avatar rond, nom en gras et capsule de mood.

Transposition Android : CoreGraphics + AVAssetWriter → Canvas / Bitmap par image pour l'intro, l'outro et le filigrane (OverlayEffect Media3) ; jingle PCM → AudioTrack / synthèse avec Media3 AudioProcessor.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportBranding.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportIntro.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportIntroFactory.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportOutro.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportWatermark.swift`

</details>

### Une scène immobile ne chauffe pas le téléphone

`scc-playback-cadence-power` · Android : **absente** · P2 · effort S

StoryPlaybackCadence choisit le palier d'horloge selon le contenu : haut seulement quand quelque chose suit le playhead image par image (vidéo, son, keyframes, fondus, décorations animées, transitions, ou hôte qui lit onPlaybackTime) ; bas sinon. Le palier haut d'un appareil faible vise 30 Hz (bas) ou 60 Hz (moyen) ; la plage va de 10–30 à 60–120 Hz. EditClockThrottle met l'horloge d'édition au repos après un délai sans interaction (sauf si un média joue vraiment), ce qui suspend aussi la boucle d'aperçu et ré-éveille au premier geste. Le re-nourrissage du flou est borné à ~18 images par seconde.

Écarts :
- Décision pure du palier de cadence à partir de la slide (contenu temporisé ou non) et du niveau d'appareil.
- Repos de l'horloge d'édition après inactivité (sauf lecture de média réelle) avec réveil au premier toucher ; suspendre aussi la boucle vidéo / audio d'aperçu.
- Plage de fréquence (10–30, 30–60, 60–120 Hz) projetée sur Surface.setFrameRate / Window.preferredDisplayModeId.
- Aligner sur le niveau média de l'appareil (bas / moyen / haut / pro) du SDK.

Rendu : Aucun effet visible ; la chauffe et la batterie s'améliorent sur une scène sans mouvement.

Transposition Android : CADisplayLink.preferredFrameRateRange → Surface.setFrameRate / SurfaceControl.Transaction.setFrameRate ; ProMotion → fréquence variable Android 11+.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryPlaybackCadence.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/EditClockThrottle.swift`

</details>

### On parcourt la story au doigt sur la barre de progression et la scène suit

`scc-reader-scrub` · Android : **absente** · P2 · effort M

Le lecteur fige la lecture au toucher de la barre, redessine la scène à l'instant pointé pendant le glissé (vidéos en pause, calées par seek tolérant pour ne pas geler sur la décompression), puis reprend la lecture depuis cet instant. Un fond bouclé est calé sur le tour en cours. L'audio est soldé puis replanifié depuis la nouvelle ancre au relâcher. Une fraction non finie vaut le début.

Écarts :
- La barre segmentée (SegmentedProgress) est passive : ajouter begin / scrub / end avec pause immédiate de tout média et reprise optionnelle au relâcher.
- Redessiner la scène à l'instant pointé (fenêtres, keyframes, fondus) et caler les vidéos par seek tolérant (ExoPlayer SeekParameters.CLOSEST_SYNC) plutôt qu'exact.
- Caler le fond bouclé sur son tour en cours (phase = playhead modulo durée de la source).
- Replanifier l'audio depuis la nouvelle ancre au relâcher.

Rendu : La barre suit le doigt sans à-coup ; la scène se redessine à l'instant correspondant, vidéos immobiles sur l'image la plus proche.

Transposition Android : CMTime seek avec tolérance → Player.setSeekParameters(CLOSEST_SYNC) puis seekTo ; geste = pointerInput(detectDragGestures) sur la barre.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ReaderScrub.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+ReaderScrub.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Les vignettes de mes stories et de mes brouillons montrent la vraie scène composée

`scc-static-cover-snapshot` · Android : **absente** · P2 · effort M

StoryStaticSnapshot rend une slide en UIImage par le même pipeline que le canvas vivant et l'export (polices, tailles, couleurs, verre, débord d'encre identiques) : fond (couleur, dégradé, image) peint à part puis arbre de premier plan par-dessus. Il sert aux couvertures personnelles (grille Mes stories, sauvegarde automatique du brouillon, couverture optimiste de publication), pas au contenu d'autrui qui reste sur le rendu composite plus léger. StoryCoverCacheKey fixe le schéma de clé (story-cover:<id>) et la taille 9:16 de la couverture dans le cache disque de vignettes, partagés entre l'app et le SDK.

Écarts :
- Aucune couverture rendue : l'anneau et la grille utilisent l'avatar ou le média brut.
- Rendu hors écran d'une slide complète (fond + texte + stickers + dessin) vers un Bitmap 9:16, réutilisant le moteur de rendu commun.
- Écriture de la couverture à la sauvegarde automatique du brouillon et à la publication optimiste ; clé de cache story-cover:<id> et taille fixe 9:16.
- Bitmaps déjà en mémoire (médias retouchés, stickers image) fournis au rendu, avec l'ancien fond plat en repli.

Rendu : Couverture 9:16 nette (anneau de tray et carte de grille), identique à la scène éditée.

Transposition Android : UIGraphicsImageRenderer → Bitmap + Canvas / View.drawToBitmap ou PixelCopy ; cache disque des vignettes → DiskLruCache / Coil disk cache.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStaticSnapshot.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCoverCacheKey.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`

### La scène derrière la frise de montage montre en direct l'instant de la tête de lecture

`scc-timeline-preview-monitor` · Android : **absente** · P2 · effort M

Quand la feuille de timeline est ouverte, le canvas du composer devient le moniteur d'aperçu : chaque mouvement de la tête (scrub ou tick du moteur) rend la slide à cet instant avec la sémantique lecture (fenêtres, keyframes, transitions). L'audio vient du moteur de timeline, donc les players du canvas sont muets. À l'arrêt, les objets hors fenêtre apparaissent en fantôme (0,25). Un pont (StoryCanvasTimelineBridge) expose scrub, setPlaying, end et la répétition de transitions.

Écarts :
- Aucune timeline dans le composer Android : dépend de l'éditeur de timeline (autre domaine).
- Mode de rendu effectif lecture pendant l'aperçu sans toucher aux gestes d'édition ; mute des players du canvas tant que l'aperçu est actif.
- Scrub : vidéos en pause calées par seek tolérant ; lecture : players relancés calés sur le playhead, sans re-seek à chaque tick.

Rendu : Maquette Main.dc.html : hors de sa fenêtre un objet est caché en lecture et fantôme à 0,25 à l'arrêt.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+TimelinePreview.swift`

</details>

### Choisir une transition la rejoue aussitôt sur la scène en composition

`scc-transition-rehearsal` · Android : **absente** · P2 · effort S

Au choix d'une ouverture ou d'une fermeture dans le composer, la scène rejoue l'ouverture, marque une courte pause sur la scène entière, joue la fermeture, puis revient à l'état neutre d'édition. Les deux fonctions appelées sont celles du lecteur, donc ce que l'auteur voit est ce que le lecteur jouera. Choisir un autre effet pendant la répétition la reprend de zéro. Sans effet hors mode édition.

Écarts :
- Plan pur de répétition (ouverture, pause sur scène entière, fermeture, neutre) avec horloge démarrée au premier tick.
- Relancer la répétition au changement de choix d'effet et l'interrompre proprement.
- Pont entre le sélecteur de transitions du composer et le canvas (équivalent de StoryCanvasTimelineBridge.rehearseTransitions).

Rendu : La scène entière reste visible entre l'entrée et la sortie ; la fermeture suit l'ouverture sans se lire comme un seul geste.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+TransitionRehearsal.swift`

</details>

### Pincer à trois doigts zoome la scène entière, et un double-tap la remet à l'échelle 1

`scc-viewport-zoom` · Android : **absente** · P2 · effort S

Un reconnaisseur dédié détecte un pincement à exactement trois doigts (distance moyenne au centroïde, annulé si un quatrième doigt arrive) pour zoomer le viewport du canvas sans entrer en collision avec le pincement à deux doigts d'un objet. L'échelle est bornée à 0,5–4 puis aimantée à 1 si elle retombe à ±0,08 de l'identité (le chrome - barre du haut, bouton de réinitialisation - retrouve son état normal). Le double-tap sur le fond, quand la scène est zoomée et qu'aucun objet n'est touché, réinitialise le viewport ; à l'échelle 1 il garde le cycle ajusté / rempli du fond.

Écarts :
- Détecteur de pincement à trois doigts (centroïde, distance moyenne, état annulé au 4e doigt) exclusif du pincement à deux doigts d'un objet.
- Politique pure : bornes 0,5–4, aimantation à l'identité sous 0,08, double-tap de réinitialisation seulement si zoomé et hors objet.
- Chrome du composer qui réagit à l'état zoomé (barre du haut masquée, bouton de réinitialisation).
- Callback onCanvasZoomScaleChanged et onViewportZoomResetRequested.

Rendu : Le zoom viewport ne change pas le modèle ; la barre du haut se masque tant que la scène est zoomée, un bouton de réinitialisation apparaît.

Transposition Android : UIGestureRecognizer sous-classé → pointerInput avec awaitPointerEventScope (compter les pointeurs).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/ThreeFingerPinchGestureRecognizer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasViewportZoomPolicy.swift`

</details>

### Je coupe ou rétablis le son d'une vidéo ou d'un son posé sur le canvas d'un simple appui sur sa puce

`scc2-canvas-media-mute` · Android : **absente** · P2 · effort S

Sur le canvas d'édition, des boutons de sourdine ronds de 30 pt (matière ultrafine, bord blanc 30 %) sont posés sur chaque vidéo : en haut à gauche de la scène (inset 18) pour la vidéo de FOND — le cas le plus courant, longtemps sans affordance —, et au coin haut-droit (inset 18, borné aux bords) du cadre projeté pour chaque vidéo de premier plan. Une puce audio de premier plan (AudioForegroundChip) se déplace, se sélectionne au tap et se coupe au bouton. Couper met le volume à 0 en mémorisant le niveau précédent, rétablir restaure ce niveau (pas 1,0 forcé). Les overlays disparaissent pendant le dessin. Libellés « Couper le son de la vidéo » / « Activer le son de la vidéo », icônes speaker.wave.2 / speaker.slash, haptique léger. Android a le champ volume dans le modèle de média mais aucune affordance dans le composer.

Écarts :
- Bouton de sourdine de la vidéo de fond (coin haut gauche, inset 18 dp) et des vidéos de premier plan (coin haut-droit du cadre projeté, borné à l'intérieur de la scène) ; disque 30 dp matière translucide, bord blanc 30 %, icône 13 sp gras blanche.
- toggleMute avec mémoire du niveau : couper → volume 0 en retenant le niveau, rétablir → niveau d'avant (modèle StoryVolumeCarrying).
- Puces audio de premier plan (glisser, sélection, sourdine) pour les pistes audio posées sur la scène.
- Masquer ces overlays pendant le mode dessin ; haptique léger ; libellés d'accessibilité fr/en/es/pt.
- Prérequis : le canvas Android doit d'abord porter plusieurs objets média (vidéo de premier plan, audio) ; aujourd'hui un seul média de fond existe.

Rendu : Disque 30 dp en matière translucide, icône haut-parleur 13 sp gras blanche, position à 18 dp du coin ; le bouton de la vidéo de premier plan suit la projection du cadre (échelle/centre) sans suivre la rotation.

Transposition Android : ultraThinMaterial → surface translucide avec flou (API 31+) ou fond noir 40 % ; speaker.wave/slash → Icons.AutoMirrored.VolumeUp / VolumeOff.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasMediaMuteOverlays.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Je retrouve chaque trait dans une liste avec sa miniature pour changer sa couleur, son style ou son épaisseur, ou le supprimer

`scc2-drawing-stroke-list` · Android : **absente** · P2 · effort S

DrawingStrokeList affiche, quand il y a des traits, « N trait(s) » puis une liste verticale (hauteur max 230) : par ligne une miniature 30×48 du trait (rendu réel), un bouton couleur (pastille 26 avec échelle 1,12 si dépliée), un bouton Style (lissage), un bouton Épaisseur et une corbeille rouge. Toucher un bouton sélectionne le trait (halo sur le canvas) et déplie sous la ligne le même panneau DrawingEditToolOptions appliqué AU TRAIT ; la ligne sélectionnée a un fond indigo400 18 % et un liseré 60 %. Supprimer vide la pile de rétablissement et désélectionne. Android possède la logique pure (StoryDrawingBoard : select, delete, recolorSelected, resizeSelected, smoothSelected) mais aucune interface de liste.

Écarts :
- Créer la liste des traits (compteur « N trait(s) », LazyColumn bornée à 230 dp) avec miniature rendue par le moteur de trait (30×48 dp, fond noir 6 %, bord blanc 25 %).
- Boutons par ligne : couleur, style, épaisseur (bascule du panneau d'options correspondant, sélection du trait au toucher) et corbeille (haptique moyen) ; libellés « Style du trait », « Épaisseur du trait », « Supprimer le trait ».
- Brancher select/delete/recolor/resize/smooth du StoryDrawingBoard sur le ViewModel du composer (aujourd'hui seuls commit et undo sont appelés) et sur le halo de sélection du canvas.
- Animation ressort 0,28/0,85 sur l'ouverture d'une ligne ; ligne sélectionnée fond indigo400 18 % + liseré 60 %.
- Chaînes fr/en/es/pt.

Rendu : Lignes arrondies 12 dp, padding 10, espacement 6 ; pastilles et boutons ronds 26–30 dp ; la corbeille est rouge sur fond rouge 12 %. Le panneau d'options se déplie à l'intérieur de la ligne sélectionnée (transition fondu + glissement depuis le haut).

Transposition Android : ScrollView + VStack → LazyColumn ; bouton rond teinté error pour la corbeille.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingStrokeList.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+DrawingEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`

### J'envoie un Instant de Mee ou Meo qui écrit à ma place le message, l'heure, le lieu ou la météo sur le sticker

`scc2-mee-instants` · Android : **absente** · P2 · effort M

Les 100 Instants (généré depuis mee-ios-instants.ts) sont des films Mee dont le texte dépend de la saisie : quatre familles (Messages, Moments, Lieux, Météo) présentées dans Personnalisés sous « Instants » (« Ce que vous écrivez s'affiche sur le sticker »). Chaque Instant déclare ses emplacements (message, lieu, heure, météo), ses valeurs par défaut, un bandeau (ligne forte + ligne douce, fond/encre/contour propres) et/ou des textes libres posés sur un support du film (position, rotation, graisse, couleur, tailles selon la longueur saisie, coupe à N caractères). iOS redessine ce texte en natif par-dessus le film (MeeInstantOverlay) : bandeau en rectangle arrondi, ligne principale coupée à 20 caractères en 19 pt (15 pt au-delà de 14), sous-ligne coupée à 28 en 11,5 pt, boîte de vue -8…208. Ce qui part au fil : les emplacements déclarés, non vides, sans espaces de bord ; ce qui s'affiche : la valeur saisie sinon le défaut. Les valeurs saisies viennent du champ texte de l'onglet Texte, du lieu courant et de l'heure d'ouverture de la feuille. L'image envoyée est « cuite » (still + overlay, 360 px). Android n'a rien de comparable.

Écarts :
- Modèle MeeInstant (id, famille, titre, emoji, animé, emplacements, défauts, bandeau, textes libres) et catalogue Kotlin généré depuis le même script web que l'index Swift.
- Règles de texte : clip(texte, max) avec ellipse « … » et rognage des espaces ; mise en page du bandeau (taille 19/15 selon 14 caractères, ligne douce 11,5, lignes de base, rectangle et rayon) ; taille des textes libres selon la longueur ; ancrage début/milieu/fin ; rotation.
- Superposition native Compose (Canvas) alignée sur la boîte de vue du film (-8, -8, 216×216) pour que le texte redessiné épouse la géométrie du film.
- Règle d'emplacements envoyés (déclarés, non vides, sans espaces) et valeurs affichées (saisie sinon défaut) ; contrat message { templateId: « mee.<id> », slots, emoji }.
- Valeurs saisies : message = texte de l'onglet Texte, lieu = lieu courant, heure = horloge figée à l'ouverture de la feuille ; météo laissée au défaut.
- Cuisson de l'image envoyée (image fixe + overlay, 360 px) pour les destinataires/clients qui ne rejouent pas le natif.
- Section « Instants » dans Personnalisés : titres de famille (Messages / Moments / Lieux / Météo), rangées de 3 cases de 96 dp, libellé = titre ; chaînes fr/en/es/pt.

Rendu : Le texte doit être pixel-aligné sur le film : mêmes coordonnées dans la boîte -8…208, mêmes graisses (noir/lourd/gras/semi) et mêmes couleurs ; le bandeau a un contour de 2,4 unités ; la sous-ligne est à 78 % d'opacité de l'encre.

Transposition Android : SwiftUI Canvas + GraphicsContext.draw(Text) → Compose Canvas + TextMeasurer ; ImageRenderer → Picture/ImageBitmap Compose ou capture via Graphics Layer.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeInstant.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeInstantCatalog+Index.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeInstantView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+MeeInstants.swift`

</details>

### Je colle une image ou détoure le sujet d'une photo pour la garder dans « Mes stickers » et la poser en sticker

`scc2-sticker-library` · Android : **absente** · P2 · effort M

L'onglet « Mes stickers » (section de Personnalisés) propose deux alimentations : coller une image du presse-papiers (PasteButton, formats image dont GIF/APNG animés) et, si l'app a injecté la capacité, « Détourer » le sujet d'une photo choisie dans la photothèque (le détourage est absent, jamais grisé, sur les OS qui ne le supportent pas ; une photo sans sujet laisse la grille inchangée, l'app affichant un toast). La bibliothèque s'affiche en grille de 5 colonnes de vignettes de 52 pt (rayon 10, remplissage en recadrage, animées si le sticker est animé), vide : « Collez une image pour commencer votre bibliothèque ». Toucher une vignette la pose et l'enregistre dans les récents ; appui long pour épingler. Les récents de la bibliothèque sont chargés à l'ouverture de la feuille. Android n'a ni bibliothèque, ni collage, ni détourage.

Écarts :
- Magasin de bibliothèque (fichiers locaux + index) : id, vignette, données animées optionnelles (GIF/WebP/APNG), budget de pixels de vignette ; chargement des récents à l'ouverture de la feuille.
- Coller depuis le presse-papiers (ClipboardManager, ClipData image/*, GIF/WebP animés) avec bouton icône seule capsule de hauteur minimale 32 dp.
- Détourage du sujet d'une photo (Photo Picker + segmentation du sujet sur l'appareil, par exemple ML Kit Subject Segmentation) ; capacité injectée seulement si disponible sur l'appareil (absente, pas grisée) ; retour « aucun sujet » traité par un toast de l'app.
- Grille 5 colonnes de vignettes 52 dp rayon 10 (ContentScale.Crop), lecture animée via ImageDecoder/AnimatedImageDrawable ou coil-gif ; libellé d'accessibilité « Autocollant de votre bibliothèque ».
- État vide « Collez une image pour commencer votre bibliothèque ».
- Poser un sticker de bibliothèque = téléverser l'image et référencer son postMediaId (provider) dans le sticker de la scène ; enregistrer dans Récents ; épinglage par appui long.
- Chaînes story.sticker.library.* en fr/en/es/pt.

Rendu : Section tout en haut de « Personnalisés » ; les deux boutons d'alimentation alignés à droite sur une rangée ; vignettes carrées 52 dp aux angles 10 ; espacement de grille 8 ; texte vide centré 12 sp secondaire avec marge verticale 24.

Transposition Android : PasteButton → ClipboardManager + sélecteur ; PhotosPicker → PickVisualMedia ; détourage Vision (iOS 17) → ML Kit Subject Segmentation ou repli absent ; AnimatedImageDecoder → ImageDecoder / coil-gif.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Emoji.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView.swift`

</details>

### J'installe des packs de stickers dans une boutique et chacun a son onglet dans la feuille

`scc2-sticker-packs-shop` · Android : **absente** · P2 · effort M

La feuille ajoute un onglet par pack installé : les trois packs intégrés (Mee, Meo, Mee & Meo, filtrés par les slugs installés quand la liste est connue) puis les packs tiers non vides, chacun en grille de 3 colonnes de cases de 96 pt (images fixes ou animées, emoji de repli, libellé d'accessibilité = titre, en-tête « <nom> » + « par <auteur> »). Une page Boutique (StickerPackShopView/PackShopView) liste les packs du catalogue avec couverture (film Mee ou image distante), nom, auteur, description et un bouton installer/retirer à état optimiste (ensemble de packs en cours, bandeau d'échec) ; depuis la conversation elle propose en bas « Plus dans la boutique » qui ferme la feuille et ouvre la vitrine unique des packs de stickers par lien profond. Android n'a ni notion de pack, ni boutique, ni API correspondante.

Écarts :
- Modèle StickerPack (slug, nom, auteur, description, coverUrl, installed, removable, items[] avec fileUrl/emoji/isAnimated/titre) et endpoints : packs installés, catalogue, installer/retirer (à relever côté passerelle, aucun client Android aujourd'hui).
- Magasin de packs avec chargement des installés à l'ouverture de la feuille, catalogue à l'ouverture de la boutique, bascule installer/retirer optimiste avec ensemble « en cours » et indicateur d'échec.
- Pages de la feuille : un onglet par pack installé (icône oiseau pour les intégrés, pile de cartes pour les tiers), packs tiers à grille 3 colonnes 96 dp avec en-tête « par <auteur> », images animées ou fixes avec repli sur l'emoji.
- Boutique : liste de lignes (couverture, nom, auteur, description, bouton installer/retirer ; non retirables sans bouton), état de chargement/échec, couverture Mee par film local.
- Lien « Plus dans la boutique » vers la vitrine unique (lien profond packShop domaine sticker) uniquement depuis la conversation ; vérifier l'existence d'une vitrine côté Android avant de câbler.
- Poser un élément de pack = référence postMediaId/provider du sticker (image intégrée) ; envoi en conversation selon le contrat message sticker.
- Chaînes sticker.sheet.tab.shop, sticker.sheet.pack.by, sticker.sheet.shopMore en fr/en/es/pt.

Rendu : Grille de packs 3 colonnes, espacement 10, cases 96 dp ; en-tête de page avec symbole de marque + nom en capitales + sous-titre « par <auteur> » 12 sp secondaire.

Transposition Android : AnimatedCachedImage/CachedAsyncImage → Coil (AsyncImage + décodeur GIF/WebP animé) ; deep link DeepLinkRouter → navigation interne Android (lien profond de l'app).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Packs.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPackShopView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerSheetPage.swift`

</details>

### Mes stickers récents et épinglés se retrouvent d'un appui long dans Récents et Favoris, par compte

`scc2-sticker-usage` · Android : **absente** · P2 · effort S

StickerUsageStore garde, par compte (clé suffixée @userId, migration de l'ancienne clé non suffixée vers le compte connecté, rechargement au changement de compte), jusqu'à 50 récents (le plus récent d'abord, doublons remontés) et une liste de favoris (le dernier épinglé en tête), persistés en JSON. Une entrée a un type (emoji, gabarit, bibliothèque, Mee) et une valeur. Poser un sticker l'enregistre dans les récents depuis TOUS les chemins (emoji, gabarit, Mes stickers, Mee) ; un appui long sur n'importe quelle cellule ouvre un menu « Épingler aux favoris » / « Retirer des favoris » (haptique léger). Les onglets Récents et Favoris recomposent des sections Mee & Meo, Mes stickers, Décorations, Smileys à partir des entrées ; une entrée dont l'élément n'existe plus (image effacée, gabarit retiré) disparaît sans être purgée. Android n'a rien d'équivalent pour les stickers (seul un classeur d'emoji de réaction existe).

Écarts :
- Créer un StickerUsageStore (DataStore) avec entrées {type emoji|template|library|mee, valeur}, 50 récents MRU sans doublon, favoris, clés par compte avec migration de l'ancienne clé globale.
- Menu contextuel d'appui long sur chaque cellule (emoji, gabarit, Mes stickers, Mee) : « Épingler aux favoris » / « Retirer des favoris », haptique léger.
- Enregistrer l'usage au seul endroit qui pose (chaque chemin de pose appelle noteUse) pour éviter un chemin sans mémoire.
- Onglets Récents/Favoris : sections Mee & Meo, Mes stickers, Décorations, Smileys ; tolérer les entrées orphelines ; masquer les entrées Mee si l'hôte ne sait pas les poser.
- Flux observable (StateFlow) pour que la feuille se mette à jour immédiatement.

Rendu : Aucune marque visuelle propre : le menu d'appui long est un menu système à deux libellés avec icône étoile / étoile barrée.

Transposition Android : UserDefaults → Preferences DataStore (clé par compte) ; ObservableObject → StateFlow ; contextMenu → combinedClickable(onLongClick) + DropdownMenu.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerUsageStore.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerSheetTabBar.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiUsageRanker.kt`

### Les décorations d'émotion et de fête se dessinent : Joie, Stupeur, Humeur, Salut, Réactions, Fête et Bravo

`scc2-template-families-emotion` · Android : **absente** · P2 · effort L

Sept familles de gabarits expressifs (≈ 10 par famille) : Joie (sparkles, éclats), Stupeur (bulle d'exclamation, impacts), Humeur, Salut (bonjour/coucou), Réactions (pouce, mains), Fête (confettis, ballons, anniversaire) et Bravo (applaudissements, médailles). Beaucoup sont animés (StickerAnimation) et sont marqués d'un badge de mouvement dans la feuille. Chaque dessinateur mesure puis rasterise ; les noms sont localisés. Aucun équivalent Android.

Écarts :
- Réimplémenter les dessinateurs des 7 familles (Joie, Stupeur, Humeur, Salut, Réactions, Fête, Bravo) avec mesure, dessin et noms localisés fr/en/es/pt.
- Associer à chaque gabarit son StickerAnimation éventuel et son échelle de pose (posedScale) tels que déclarés par le catalogue.
- Golden tests par gabarit ; vérifier la lisibilité à 104 dp (vignette) et à l'échelle de pose sur la scène.

Rendu : Formes pleines et colorées (cœurs, étoiles, burst, bulles) sur cartouches arrondis, texte arrondi gras ; les gabarits animés portent un mouvement doux et bornés dans le temps (stabilisation).

Transposition Android : Voir scc2-template-toolkit et scc2-template-picker (mouvement).

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Joy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Surprise.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Mood.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Greeting.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Reaction.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Party.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Cheer.swift`

</details>

### Les décorations du monde se dessinent : Nature, Gourmand, Sport, Voyage, Travail et Musique

`scc2-template-families-world` · Android : **absente** · P2 · effort L

Six familles thématiques (≈ 10 gabarits chacune) : Nature (feuilles, fleurs, éléments), Gourmand (plats, boissons), Sport (balles, trophées), Voyage (avion, valise, carte), Travail (réunion, tâche, dossier) et Musique. Elles reposent sur les mêmes briques de dessin (cartouches, glyphes, dégradés) avec des tracés plus riches, d'où le plus gros volume du dossier (≈ 4 800 lignes Swift). Aucun équivalent Android.

Écarts :
- Réimplémenter les dessinateurs des 6 familles (Nature, Gourmand, Sport, Voyage, Travail, Musique) avec mesure, dessin et noms localisés fr/en/es/pt.
- Tracés riches à convertir en Path Compose (courbes de Bézier) en conservant proportions et couleurs ; table d'icônes pour les symboles SF utilisés.
- Golden tests par gabarit.

Rendu : Même grammaire graphique que les autres familles : cartouches arrondis, dégradés verticaux, glyphe + libellé, couleurs thématiques par famille.

Transposition Android : Voir scc2-template-toolkit ; envisager de factoriser les tracés répétés en tables de données pour réduire le volume Kotlin.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Nature.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Food.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Sport.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Travel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Work.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Templates/StickerTemplates+Music.swift`

</details>

### Je vois mon texte en aperçu et choisis son style dans une grille de vignettes « Aa » sur deux rangées

`scc2-text-style-specimen-band` · Android : **absente** · P2 · effort S

TextStyleSpecimenBand affiche, sous le titre, un aperçu d'une ligne du texte saisi dans le style choisi (24 pt, tronqué en fin, masqué à l'accessibilité) puis une grille horizontale de deux rangées de vignettes « Aa » de 48 pt (espacement 8, rayon 12) pour les 18 styles, la vignette choisie portant le dégradé de marque et le texte blanc. Les marges vivent sur le contenu pour que le défilement traverse toute la largeur. Chaque vignette est annoncée par le nom de la famille (les noms de polices ne se traduisent pas) avec trait sélectionné. Mode sur surface sombre (encre blanche, fond de vignette blanc 14 %). Android n'a qu'une rangée de puces textuelles pour 5 styles.

Écarts :
- Composable de bande : aperçu mono-ligne 24 sp du texte dans le style choisi + grille horizontale 2 rangées de vignettes 48 dp « Aa » (police du style, 19 sp), espacement 8, rayon 12.
- Sélection : dégradé de marque + texte blanc ; repos : gris 18 % (ou blanc 14 % sur surface sombre) ; haptique léger.
- Accessibilité : libellé = nom de la famille de style, état sélectionné ; aperçu masqué.
- Marges horizontales appliquées au contenu défilant (pas au conteneur).

Rendu : Vignettes carrées 48 dp, « Aa » centré dans la police de chaque style ; aperçu 24 sp aligné à gauche avec la même marge que la grille (par défaut 10 dp).

Transposition Android : LazyHGrid(rows 2) → LazyHorizontalGrid(GridCells.Fixed(2)).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/TextStyleSpecimenBand.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Le composer et le lecteur montrent la même scène vivante, du même canvas

`scc-canvas-host-unified` · Android : **divergente** · P0 · effort L

StoryCanvasUIView est la surface unique : mode .edit (tous les objets visibles, gestes, horloge d'édition jusqu'à 120 Hz) et mode .play (lecture pilotée par le temps). Elle est enveloppée pour SwiftUI (StoryComposerCanvasView) avec : comparaison de slides pour éviter les reconstructions superflues, pont des bitmaps retouchés (cookie de version monotone, cache d'images invalidé), empreinte de structure de slide, reconstruction à la passe de mise en page, coins arrondis configurables, reconstruction défensive sur changement de classes de taille (Stage Manager, Split View), annonces de démontage et remontage du composer (brouillon écrit puis rouvert). Les mutations de la slide sont différées pendant un geste.

Écarts :
- Deux implémentations Compose séparées (StoryCanvasSurface dans StoryComposerScreen, calques privés dans StoryViewerScreen) : créer un composable unique StoryCanvas(slide, mode Edit|Play) pour que l'aperçu soit le lecteur.
- Le composer n'affiche pas sur la scène les médias de premier plan, puces audio ni pastilles de lieu (médias seulement dans un tiroir de vignettes) ; le lecteur n'affiche pas les stickers.
- Pas de diff de slide : ne pas recomposer toute la scène pendant un geste actif, mutations différées jusqu'au lâcher (équivalent de slidesEqualForCanvas et de l'empreinte de structure).
- Pont d'invalidation des bitmaps retouchés (version monotone) pour afficher l'image éditée sous une URL constante.
- Coins arrondis configurables et reconstruction sur changement de taille (pliage, multi-fenêtre, tablette) sans animation implicite ni clignotement.
- Démontage du composer sans sortie demandée (rotation, pliage) : écrire le brouillon et le rouvrir sur la racine suivante (StoryComposerDraftStore existe, l'événement n'est pas câblé).
- Événements de canvas vers l'hôte (onItemTapped, onItemDoubleTapped, onItemModified, onItemMenuRequested, onContentReady, onPlaybackTime) à exposer en callbacks Compose.

Rendu : Aucun fondu implicite à la reconstruction (CATransaction sans actions) : la scène ne clignote jamais pendant un redimensionnement ou un changement de mode. Le fond occupe tout le cadre, les objets sont dessinés par-dessus dans l'ordre plan puis z.

Transposition Android : UIViewRepresentable + arbre CALayer → composable Compose (Canvas / graphicsLayer par objet) ; NotificationCenter → SharedFlow du ViewModel ; changement de size class → onSizeChanged / WindowSizeClass.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Core.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Rendering.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+SlideChange.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Lifecycle.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasNotifications.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StorySlideStructureRules.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### On tape le texte directement sur la scène, centré au-dessus du clavier

`scc-text-inline-editing` · Android : **divergente** · P0 · effort M

Éditer un texte le recentre dans la bande libre entre le bouton Terminé et les bulles d'outils, sous un UITextView transparent stylé comme le texte (police, couleur, alignement, ombre, taille d'édition). Le reste du canvas passe sous un voile. Le fond du texte (plein, verre, losange, bulle) reste visible et suit les changements de style en direct. Basculer d'un texte à l'autre restitue le premier à sa place. Dans l'éditeur d'objet, la saisie cède au doigt : un geste de manipulation, ou le clavier qui se range, rend le texte à sa position réelle (il se déplace, zoome, tourne sans quitter la saisie), et toucher le texte reprend la saisie. La politique de touche garantit que le tap atteint le champ (clavier affiché).

Écarts :
- Android édite le texte dans un OutlinedTextField sous le canvas (editorText), pas sur la scène : remplacer par un BasicTextField transparent superposé au texte, avec les mêmes styles.
- Recentrer le texte édité dans la zone libre (haut = bas du bouton Terminé, bas = haut des outils / clavier, via IME insets) sans muter x / y / rotation du modèle ; jamais sous le clavier, jamais tourné.
- Voile d'ombrage sur le reste du canvas pendant l'édition et fond du texte qui suit les styles en direct.
- Placeholder « story.textEditor.placeholder » localisé (fr, en, es, pt).
- Saisie suspendue par un geste de manipulation ou par la fermeture du clavier dans l'éditeur d'objet, reprise au tap.
- Bascule directe d'un texte A vers un texte B : A retrouve glyphes et position immédiatement.
- Callbacks onInlineTextChanged / onInlineTextEditEnded vers le ViewModel.

Rendu : Texte centré dans la bande utile, taille d'édition identique à la scène (pas de saut de taille), voile sombre sur le reste, curseur et sélection aux couleurs du texte, jamais de décalage entre le champ et le calque.

Transposition Android : UITextView superposé + UITextViewDelegate → BasicTextField dans un Box avec Modifier.imePadding() et WindowInsets ; first responder → FocusRequester + SoftwareKeyboardController.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineEditYield.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasInlineEditTouchPolicy.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### L'appui long sur un objet propose seulement les actions qui ont un effet

`scc-context-menu-actions` · Android : **divergente** · P1 · effort M

Le menu d'appui long (et les actions VoiceOver) offre, dans l'ordre : Modifier, Rogner (vidéo ou son), Dupliquer, Monter, Descendre, Sortir de la scène (devient une slide du post), Mettre en fond / Remplacer le fond (mot selon qu'un fond existe), Supprimer. La règle est « une action absente, jamais grisée » : empilement offert seulement s'il existe un frère de plan et si l'objet n'est pas un fond, Modifier seulement si l'hôte a un éditeur, Rogner seulement si la source est rognable, Sortir / Devenir fond seulement si l'hôte sait le faire. Un objet verrouillé (badge d'attribution d'un repost) n'offre que l'empilement. Les mêmes prédicats (verrouillé, fond, frère de plan, source rognable) servent le rail de droite du composer.

Écarts :
- Menu limité aux textes (EDIT, DUPLICATE, 4 empilements, DELETE) : l'étendre aux stickers, médias, lieux et au fond.
- Android grise les lignes inapplicables (enabled=false) ; iOS les retire : appliquer « absente, jamais grisée ».
- Ajouter Rogner la source (vidéo, son), Sortir de la scène, Mettre en fond / Remplacer le fond avec le bon libellé selon la présence d'un fond.
- Verrouillage (isLocked) : n'offrir que l'empilement sur le badge d'attribution du repost.
- Prédicats purs partagés (isLocked, isBackground, hasTrimmableSource, sharesPlaneWithAnother) pour le menu, le rail et l'accessibilité.
- Libellés localisés (story.canvas.action.*) en fr, en, es, pt et icônes cohérentes.
- Aperçu ciblé de l'objet pendant le menu (targetedPreview).

Rendu : Menu au-dessus de l'objet, ordre fixe, icônes SF Symbols remplacées par Material équivalents, action destructive (Supprimer) en rouge en dernier.

Transposition Android : UIContextMenuInteraction + UIMenu → DropdownMenu ancré à l'objet ou ModalBottomSheet, plus customActions sémantiques.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ContextMenu.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StorySceneObjectPredicates.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Les objets se déplacent, grandissent et se fondent exactement comme prévu par l'auteur

`scc-object-keyframes-fades` · Android : **divergente** · P1 · effort S

Les keyframes (x, y, scale, opacity, easing) s'interpolent canal par canal. Avant la première keyframe d'un canal, l'objet garde sa position, son échelle ou son opacité de base (aucun saut). Les keyframes sont relatives au startTime de l'objet. L'enveloppe fadeIn/fadeOut d'un clip prime sur l'opacité des keyframes (fondu, puis keyframe, puis base). Les transitions de clips (fondu enchaîné, dissolve dégradé en fondu enchaîné au lecteur) multiplient les opacités sortante et entrante d'un même média.

Écarts :
- StoryKeyframeInterpolator renvoie la valeur de la première keyframe dès t=0 (at <= first.time) : iOS garde la valeur de base de chaque canal tant que la première keyframe de CE canal n'est pas atteinte ; corriger par canal.
- Les keyframes s'appliquent au texte et au média de premier plan ; stickers et pastilles de lieu ne sont pas animés au lecteur (ils ne sont pas rendus).
- Aligner le test de visibilité et la combinaison fondu / keyframe / base sur StoryRenderer (resolvedNonMediaOpacity pour les objets non-média).

Rendu : Aucun saut au début d'un clip : l'objet reste à sa place de base jusqu'à sa première keyframe puis s'interpole avec l'easing du segment qui commence à cette keyframe.

Transposition Android : CAKeyframeAnimation / pose absolue par tick → Animatable ou valeur dérivée du playhead dans un composable.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer+Keyframes.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderResolvers.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeInterpolator.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`

### Pendant un geste, les lignes d'aimantation et le contour de la scène disent où l'objet va se couper

`scc-snap-guides-limits` · Android : **divergente** · P1 · effort S

Pendant déplacement, pincement ou rotation, le canvas trace le contour de la scène (là où le contenu se coupe : blanc 90 %, 2 pt) et les lignes magnétiques de snap (blanc 30 %, 0,5 pt). La ligne engagée reste en trait rose 1 pt. Les cibles de snap objet valent 0,18, 0,25, 0,5, 0,75 et 0,82 (tolérance 0,02) ; celles du fond valent 0, 0,5 et 1 (tolérance 0,035). Au repos, rien n'est peint sur la scène.

Écarts :
- Cibles de snap différentes : Android aimante à 1/3, 1/2, 2/3 avec seuil 0,025 ; iOS à 0,18, 0,25, 0,5, 0,75, 0,82 avec 0,02 (fond : 0, 0,5, 1 à 0,035) ; aligner les valeurs.
- Contour de scène blanc 90 % 2 pt et lignes magnétiques blanc 30 % 0,5 pt affichés seulement pendant un geste, retirés au lâcher.
- Guide engagé en trait rose 1 pt (Android dessine une grille de tiers et une zone de sécurité en permanence pendant le glisser ; vérifier la parité visuelle avec la planche).
- Le contour doit suivre le rayon de coin du canvas (cornerRadius − 1).

Rendu : Contour blanc 90 % épaisseur 2 pt, lignes d'aimantation blanc 30 % 0,5 pt, ligne engagée rose (systemPink) 1 pt ; rien au repos.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Limits.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySnapResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySafeZoneGrid.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Une seule feuille de stickers à onglets (Recherche, Favoris, Récents, packs, Personnalisés, Smileys, Boutique) pour la conversation et pour la scène

`scc2-sticker-sheet` · Android : **divergente** · P1 · effort M

StickerPickerView est la feuille unique montée par MeeshyStickerSheet pour la conversation (envoi, gabarits contournés de blanc) comme pour les scènes de story/post/réel (pose) : détentes medium+large avec poignée, fond dégradé indigo (clair/sombre), en-tête (croix 32 pt dans une cible 44, glyphe de marque, titre « Stickers »), barre d'onglets capsule de verre (défile au-delà de 6 entrées, pastille qui glisse au ressort, haptique léger) et contenu en UNE liste verticale paresseuse aux en-têtes de section en capitales espacées. Les pages sont StickerSheetPage : onglets fixes, un onglet par pack installé (Mee, Meo, Mee & Meo puis packs tiers) et la Boutique. L'onglet Recherche filtre les familles figées par titre (insensible casse/accents, état vide « Aucune famille ne correspond. ») ; Personnalisés regroupe Mes stickers, Texte, Lieu, Heure, Météo et Instants ; Smileys les 8 catégories d'emoji. Changer d'onglet repart du haut. L'hôte injecte les capacités (lieux alentour, bibliothèque, Mee, Instants, packs, horloge) : une capacité absente retire l'onglet au lieu de le griser. Android n'a qu'un AlertDialog avec champ de recherche et 8 puces de catégories d'emoji.

Écarts :
- Remplacer l'AlertDialog par une ModalBottomSheet (moitié + plein écran, poignée visible) à fond dégradé indigo50/100/200 (clair) ou indigo950/noir 92 %/indigo950 85 % (sombre).
- En-tête : bouton fermer (cible 44 dp, disque 32), glyphe de marque en dégradé, titre « Stickers » 15 sp semi-gras arrondi ; chaînes sticker.sheet.* en fr/en/es/pt.
- Barre d'onglets capsule de verre : entrées de 40 dp de haut (icône 13 + libellé 9), ≤ 6 entrées en largeur flexible, au-delà défilement horizontal avec entrées de 64 dp et recentrage de l'onglet choisi ; sélection = dégradé de marque + capsule blanche 12 %/85 % qui glisse ; haptique léger ; testTag par onglet (équivalent de StickerAccessibilityID).
- Modèle de pages : fixes [Recherche, Favoris, Récents] + packs Mee/Meo/Mee & Meo (selon packs installés) + packs tiers non vides + [Personnalisés, Smileys] + Boutique si l'hôte la fournit ; la page choisie retombe sur la première si elle disparaît.
- Onglet Recherche : champ capsule « Chercher un sticker… » avec bouton d'effacement, filtrage des familles par titre (casse et accents ignorés), état vide « Aucune famille ne correspond. ».
- Contenu en LazyColumn unique avec en-têtes de section (glyphe en dégradé 11 sp + titre en capitales 11 sp gras interlettrage 0,6 + accessoire), espacement xxl entre sections (8 dp pour les grilles Mee), marge horizontale xl, retour en haut à chaque changement d'onglet.
- États vides dessinés pour Favoris (« Appuie longuement sur une décoration pour l'épingler ici. ») et Récents (« Ce que tu poses apparaîtra ici. »).
- Un SEUL site de montage de la feuille (conversation et scènes) avec une destination qui décide ce que devient le choix : emoji, bibliothèque, gabarit, gabarit de lieu, Mee, Instant, élément de pack ; option « contouré de blanc » pour la conversation.
- Capacités injectées (lieux alentour, bibliothèque, Mee, Instants, packs, horloge de la feuille) : une capacité absente retire l'onglet/section sans le griser.
- Étendre StorySticker/CanvasV3 (templateId, slots, animation, postMediaId/provider) avant de poser autre chose qu'un emoji ; sinon la feuille riche ne peut rien produire de publiable.

Rendu : Dégradé en diagonale topLeading→bottomTrailing. Barre d'onglets : capsule de verre, marge horizontale 16, padding interne 4, espacement 4, libellé 9 sp (gras si choisi, sinon medium, arrondi, échelle min 0,75). Titres de section en capitales, secondaires, sans fond ni filet. Cases d'emoji 44 dp (police 30), cases Mee 96 dp, gabarits 104 dp. Cible tactile minimale 44 dp.

Transposition Android : sheet + presentationDetents → ModalBottomSheet ; adaptiveGlass → surface translucide ; EnvironmentValues d'injection → CompositionLocal ou paramètres d'un hôte unique ; accessibilityIdentifier → Modifier.testTag.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Vertical.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerSheetPage.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerSheetTab.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerSheetTabBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerAccessibilityID.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPaletteEnvironment.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`

### Un trait dessiné s'affiche à l'identique partout : largeur variable, lissage courbe ou droit, marqueur translucide, halo de sélection

`scc2-stroke-render` · Android : **divergente** · P1 · effort M

iOS rend chaque StoryDrawingStroke comme un ruban polygonal rempli : largeur effective par point (base = largeur × 2 pour le marqueur ; si captureVersion ≥ 1 facteur 0,4→1 selon la pression, plafonné à la base, plancher 1), lissage Catmull-Rom (8 échantillons par segment, largeurs interpolées) ou Ramer-Douglas-Peucker (tolérance 8 px design) pour le mode droite, bouchons ronds aux extrémités, marqueur à 45 % d'opacité, halo indigo sur le trait sélectionné, cache de géométrie par hachage des points. Le même moteur sert l'aperçu live, le lecteur et le « bake » (StoryStrokeRasterizer rasterise les traits en image transparente à l'échelle écran). Une migration iOS-only convertit les anciens PKDrawing (voir unmapped). Android a le modèle de trait complet (outil, lissage, captureVersion) mais StoryDrawingLayer trace une polyligne à largeur CONSTANTE sans lissage, sans alpha marqueur, sans variation de pression : un dessin iOS lu dans le lecteur Android n'a pas le même aspect.

Écarts :
- Porter StrokeWidthMapping (base ×2 pour le marqueur ; facteur pression 0,4→1 si captureVersion ≥ 1 ; plancher 1 ; plafond = base) et l'appliquer par point au rendu.
- Porter CatmullRomSmoother (8 échantillons/segment, courbe des largeurs incluse) et RamerDouglasPeucker (tolérance 8 px design) ; aujourd'hui le champ smoothing est écrit (CURVE) mais jamais interprété au rendu.
- Porter VariableWidthStrokeBuilder : tessellation en ruban (sommets gauche/droite = point ± normale × largeur/2, tangente = point suivant − point précédent) + disques de bouchon aux deux extrémités (rayon max(0,5, w/2)), avec cache par hachage points+largeur+lissage+outil+captureVersion.
- Rendre le marqueur à 45 % d'opacité (la largeur ×2 vient du mapping) et ignorer les traits d'outil gomme au rendu.
- Dessiner le halo du trait sélectionné : ligne centrale épaissie de +14 px design, indigo400 à 55 %.
- Étirement design→bounds NON uniforme (1080×1920 vers la taille réelle), identique pour l'aperçu, le lecteur et l'export ; StoryDrawingCanvasSpace le fait déjà pour les coordonnées, à réutiliser.
- Créer le rasteriseur (Bitmap ARGB transparent, échelle écran ≥ 1) pour le bake/export des traits vers l'image publiée.
- Le lecteur (StoryViewerScreen) doit utiliser le même moteur de rendu que le composer, sinon un dessin iOS paraît plus épais/anguleux sur Android.
- createdAt est optionnel côté Android alors que le fil iOS l'encode en Date : vérifier la tolérance aller-retour (ISO vs epoch) sur un document iOS réel.

Rendu : Le trait est un polygone rempli, pas un stroke de Path : bords nets, extrémités arrondies. Marqueur = même couleur à 45 %. Halo de sélection indigo400 @55 % (+14 px design). Toujours projeter le design 1080×1920 sur les bounds en étirement non uniforme. Aucun anticrénelage manuel : activer isAntiAlias sur la Paint du rasteriseur.

Transposition Android : CoreGraphics/SwiftUI Canvas → Compose Canvas + androidx.compose.ui.graphics.Path (remplissage du ruban) ; UIGraphicsImageRenderer → Bitmap + android.graphics.Canvas ; NSCache → LruCache.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryDrawingStroke.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokePathBuilder.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeSmoothing.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthDriver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthMapping.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/VariableWidthStrokeBuilder.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/MeeshyStrokeCanvas.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StoryStrokeRasterizer.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryDrawingStroke.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingLayer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingCanvasSpace.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Huit bulles flottantes règlent mon texte : un tap fait défiler la valeur, un appui long ouvre le panneau complet

`scc2-text-edit-bubbles` · Android : **divergente** · P1 · effort M

En édition de texte, iOS affiche huit bulles de verre de 36 pt (défilement horizontal en filet) : Style, Effet, Couleur, Alignement, Fond, Cadre, Bordure, Langue. Chaque bulle montre la valeur courante : lettre dans la police du style, lettre avec l'ombre de l'effet, pastille de couleur, échantillon de fond (plein, verre, aucun), code (par exemple « FR »), ou symbole d'alignement/cadre/bordure. Un tap fait avancer l'attribut au suivant de son cycle (haptique léger), un appui long de 0,4 s (haptique moyen) ouvre le panneau d'options de l'outil ; l'outil actif porte le dégradé de marque. Chaque bulle est un contrôle d'accessibilité avec valeur parlée et deux actions (faire défiler, ouvrir le panneau). Android a une barre d'outils d'éléments de texte à puces (5 styles, alignement, taille cyclique, contour cyclique, fondus, timing, dupliquer, z-order, couleurs, fonds) : fonctionnellement différente de ce modèle bulle+cycle+panneau.

Écarts :
- Rangée de huit bulles (Style, Effet, Couleur, Alignement, Fond, Cadre, Bordure, Langue) en défilement horizontal, espacement 7 dp, bulle de 36 dp, actif = dégradé de marque, inactif = verre.
- Indicateur par bulle selon la valeur : lettre stylée, lettre avec ombre d'effet (blanche), pastille de couleur 18 dp avec bord blanc 60 %, échantillon de fond (carré arrondi 5, ou « verre »/« aucun »), code de langue, symbole avec graisse selon l'emphase.
- Cycle d'attribut au tap (StoryTextAttributeCycle) avec haptique léger ; appui long 0,4 s → panneau + haptique moyen.
- Accessibilité : élément « bouton à cycle » avec valeur parlée de l'attribut et actions personnalisées (faire défiler / ouvrir le panneau).
- Déplacer hors de cette barre ce que Android y met en plus (taille, contour, fondus, timing, dupliquer, z-order) vers les endroits où iOS les place, ou documenter l'écart assumé.
- Chaînes d'accessibilité fr/en/es/pt par outil (Style, Effet, Couleur, Alignement, Fond, Cadre, Bordure, Langue).

Rendu : Bulles circulaires de verre 36 dp alignées sur une ligne, huit tenant dans 337 dp ; l'indicateur est centré (lettre 15 sp, pastille 18 dp) ; l'ombre de l'effet est rendue en blanc sur la lettre témoin.

Transposition Android : onTapGesture + onLongPressGesture(0,4 s) → combinedClickable(onClick, onLongClick) ; accessibilityAdjustableAction/custom actions → semantics { customActions }.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`

### Un petit panneau au-dessus de la barre d'outils arme l'animation d'entrée et l'effet permanent de mon message

`scc2-message-effects-panel` · Android : **divergente** · P2 · effort S

Depuis la directive du 2026-09-25 (#7967), l'EffectsPickerView iOS est un petit panneau dans le verre du composeur, de même forme que le rail de la durée éphémère : deux rangées de capsules défilantes — « Animation d'entrée » (Secousse, Zoom, Explosion, Confettis, Feux d'artifice, Waouh) et « Effet permanent » (Lueur, Pulsation, Arc-en-ciel, Scintillant) — qu'un tap arme ou désarme (haptique léger, animation ressort, capsule pleine teinte d'accent + texte blanc si active, sinon teinte 8 % + liseré). Un lien « Tout effacer » (rouge, apparaît seulement si un effet du panneau est armé) retire UNIQUEMENT les drapeaux du panneau et ne touche pas aux protections (éphémère, flou, vue unique) que la barre d'outils règle déjà ; chaque capsule se lit « libellé, actif/inactif ». Android a un panneau fonctionnellement équivalent mais présenté en feuille modale avec titre, bouton OK, TROIS sections (Comportement, Animation d'entrée, Effet permanent), ligne de durée éphémère et résumé « N effet(s) actif(s) ».

Écarts :
- Remplacer la feuille modale par un petit panneau ancré au-dessus de la barre d'outils du composeur, dans le verre du composeur, avec deux rangées de capsules défilantes (Animation d'entrée, Effet permanent).
- Retirer la section « Comportement » du panneau (éphémère, flou, vue unique restent dans la barre d'outils pour ne pas dupliquer un réglage) ; décider si la durée éphémère et le résumé restent ailleurs.
- « Tout effacer » (rouge, visible seulement si un effet du panneau est armé) ne retire que les drapeaux du panneau (entrée + permanent), jamais les protections.
- Capsule : icône caption2 + libellé caption semi-gras, active = fond plein teinte d'accent + texte blanc, inactive = teinte d'accent à faible opacité + liseré ; animation ressort 0,3/0,8 ; haptique léger.
- Alignement des libellés avec iOS : « Confettis » (et non « Confetti »), « Waouh » (et non « Waoo »), « Feux d'artifice », « Scintillant », « Arc-en-ciel » ; es/pt/en équivalents.
- Accessibilité : libellé « <effet>, actif|inactif », trait sélectionné, en-têtes de section.

Rendu : Fond arrondi (rayon large) avec liseré d'accent à faible opacité ; titres de section caption2 semi-gras secondaires ; capsules : marge horizontale moyenne+, verticale petite+, espacement 8 ; défilement horizontal par rangée.

Transposition Android : Panneau de verre du composeur → Surface translucide ancrée au-dessus de la barre ; Capsule → FilterChip/AssistChip avec forme CircleShape.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsEditor.kt`, `apps/android/feature/chat/src/main/res/values-fr/strings.xml`

### Le fond de la story (couleur, dégradé, photo ou vidéo) s'affiche sans flash et se cadre au doigt

`scc-background-layer` · Android : **partielle** · P0 · effort M

Le fond peut être une couleur, un dégradé, une image (ThumbHash en attente puis bitmap décodé hors du fil principal) ou une vidéo qui boucle sans interruption (AVPlayerLooper, avec volume et mute d'auteur). Le fond porte une transformation (zoom, décalage, rotation, mode d'ajustement). Le mode d'ajustement vaut auto (paysage en mode ajusté, portrait en remplissage), fit ou fill forcé. L'identité visuelle du fond évite de reconstruire une couche inchangée mais reconstruit à la moindre nouvelle couleur. Un fond vidéo prend la durée de la slide (règle minimale de 6 s en boucles entières, StoryDurationPolicy).

Écarts :
- Mode d'ajustement du fond absent : auto selon l'orientation (paysage ajusté, portrait rempli), fit ou fill forcés ; Android fait toujours ContentScale.Crop.
- Pas de bande autour d'un média ajusté (voir scc-background-letterbox-fill) ni de choix de fond de bande (backdrop).
- La vidéo de fond ne boucle pas par un looper sans coupure ; volume d'auteur, mute global et automation de volume non appliqués au lecteur vidéo de fond (muted=false codé en dur).
- Identité du contenu de fond (couleur, dégradé, image, vidéo) pour éviter de reconstruire à chaque mise à jour, et reconstruction synchrone pour les fonds couleur / dégradé.
- Placeholder ThumbHash seulement pour l'image ; prévoir l'affichage de l'affiche vidéo avant la première image.
- Fond de média hors réseau : résolution du postMediaId vers un fichier local du composer (file://) avant l'URL distante.
- Alignement du fond de vidéo au playhead (alignToTimelineThenPlay) et recalage sans saut visible à la reprise.

Rendu : Zoom / décalage / rotation du fond appliqués par-dessus un remplissage de base, découpés au cadre. Aucun flash noir : ThumbHash flouté tant que le bitmap charge. La vidéo de fond est un décor (muet par défaut sauf réglage d'auteur).

Transposition Android : CALayer contents + AVPlayerLayer + AVPlayerLooper → AsyncImage / SubcomposeAsyncImage + ExoPlayer (REPEAT_MODE_ONE ou ConcatenatingMediaSource) dans un PlayerView avec resize mode FIT/ZOOM ; CATransform3D → graphicsLayer (scaleX, scaleY, rotationZ, translation).

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Identity.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Playback.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayerState.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/BackgroundTransform.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundMedia.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundFraming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySlideDuration.kt`

### Photos, vidéos et GIF posés sur la scène se cadrent, se rognent et se jouent sans accroc

`scc-foreground-media-layer` · Android : **partielle** · P0 · effort M

Un média de premier plan (image, vidéo, GIF) est placé dans l'espace design avec anchor, échelle, rotation, rognage rectangulaire (contentsRect) et ordre z. L'image est décodée hors du fil principal (preparingForDisplay), l'orientation EXIF est honorée, la première image d'une vidéo se génère en moins de 100 ms (VideoToolbox) et l'image reste visible pendant le rechargement. Les fenêtres de rognage de source (sourceStart/sourceEnd) sont non destructives. Volume et mute suivent l'automation et le mute global. Une image retouchée du composer remplace sa version sans trou.

Écarts :
- Le lecteur ignore rotation, rognage rectangulaire (StoryMediaCrop existe au modèle) et ordre z ; il utilise ContentScale.Crop et une largeur de base fixe.
- Volume d'auteur, mute global et automation de volume non appliqués aux vidéos de premier plan (muted=false codé en dur).
- Le composer ne pose pas les médias sur la scène (pas de manipulation, pas de rendu sur le canvas) : seulement des vignettes dans un tiroir.
- GIF / APNG animés de premier plan : décodeur Coil animé à brancher et à tester.
- Première image d'une vidéo (VideoFirstFrameExtractor) à utiliser comme affiche immédiate, image conservée pendant le rechargement.
- Image retouchée remplacée sans trou ni ancienne image (bitmap en mémoire prioritaire sur l'URL).
- Limites du fichier local : un file:// publié est invalide sur un autre appareil, résoudre vers l'URL du serveur.

Rendu : Média dimensionné en pourcentage de la largeur design, centré sur son ancre, avec rotation autour de son centre. Rognage non destructif. Aucun trou pendant un remplacement.

Transposition Android : CALayer contents / AVPlayerLayer → AsyncImage (Coil, GifDecoder / AnimatedImageDecoder) ou ExoPlayer ; preparingForDisplay → Coil décode hors UI ; EXIF → Coil ou ExifInterface ; AVAssetImageGenerator → MediaMetadataRetriever / Coil video frame decoder.

<details><summary>Sources iOS (9)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer+ImageLoading.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayerRules.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayerState.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaImageLoading.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaImageRequest.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryLayerImageDecoding.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/CanvasImageOrientation.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryMediaDecoder.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### On déplace, pince et fait tourner texte, sticker et média au doigt, avec un seul objet manipulé à la fois

`scc-manipulation-gestures` · Android : **partielle** · P0 · effort M

Le canvas pose pan, pinch (2 doigts) et rotation en simultané (pan exclusif) sur l'objet sous le doigt. La couche manipulable se verrouille en cascade : slide vierge (aucune manipulation), fond seul (le fond est manipulable), dès qu'un premier plan existe (texte, sticker, média, lieu) seul le premier plan l'est. Deux jetons de bordure (Arrière-plan / Premier plan) forcent la couche tant qu'elle correspond à du contenu réel. Les mises à jour du binding du composer sont limitées à 30 Hz (front montant puis dernière valeur au front descendant). Le geste lit sa propre copie de la slide et ne reconstruit qu'au lâcher. Un haptique léger ponctue l'aimantation. Sur iPad / Mac, un pointeur (hover) et un geste de pointeur sont supportés.

Écarts :
- Seuls texte et sticker emoji se manipulent ; pas de média, pastille de lieu ni puce audio sur le canvas du composer.
- Couche manipulable en cascade (canvas / background / foreground) avec calcul pur de la couche à partir du contenu de la slide, et jetons Arrière-plan / Premier plan.
- Déplacement, pincement et rotation du fond média (zoom du fond dans le cadre), avec aimantation propre au fond (0, 0,5, 1 ; tolérance 0,035).
- Hit-test de l'objet sous le doigt en tenant compte de la rotation et de l'échelle, de haut en bas selon z ; les verrous (isLocked) interdisent le déplacement de l'attribution de repost.
- Arbitrage : pinch + rotation simultanés, pan exclusif, appui long distinct ; manipulation suspendue en mode dessin.
- Limiteur d'écriture à 30 Hz du binding (BindingWriteThrottle) et reconstruction différée au lâcher.
- Haptique léger quand un objet se verrouille sur un guide.
- Tablette / ChromeOS : survol souris et stylet (pointerHoverIcon, curseur main) sur les objets.

Rendu : Guide rose 1 pt pendant l'aimantation ; rien ne se dessine sur la scène au repos. L'objet manipulé suit le doigt sans reconstruction : seule la transformée du calque change.

Transposition Android : UIPan/Pinch/RotationGestureRecognizer → pointerInput + detectTransformGestures / awaitEachGesture ; UIPointerInteraction → Modifier.pointerHoverIcon ; HapticFeedback.light → HapticFeedbackType.TextHandleMove ou LongPress.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Gestures.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Manipulation.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasManipulationLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/BindingWriteThrottle.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+PointerAndDelegates.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Maintenir un doigt gèle toute la story d'un bloc, et un seul canvas parle à la fois

`scc-reader-playback-control` · Android : **partielle** · P0 · effort M

Le lecteur met en pause d'un coup le fond vidéo, chaque vidéo de premier plan, le moteur audio et l'horloge d'effets (pause douce : ni détruire le CADisplayLink, ni les players, pour éviter une reconstruction à chaque cycle). Un registre de canvas actifs en lecture préempte tous les autres : un canvas évincé coupe son son et ses vidéos tout de suite. L'entrée en .play enregistre le canvas, la sortie le retire. Cycle de vie : au passage en arrière-plan puis au retour (UIScene), la lecture reprend à l'état juste, et un canvas mis en pause qui revient à l'écran garde sa pause. Le playhead peut être pré-positionné (seed / reseed) pour une ouverture sur une carte ou un scrub. Les notifications pause / reprise du viewer pilotent le canvas.

Écarts :
- Pas de pause par maintien du doigt : le lecteur gère tap (précédent / suivant) et glissés, pas un appui maintenu qui gèle la barre, les vidéos et l'audio ensemble.
- Pause d'un seul geste de tous les médias (fond, vidéos de premier plan, audio) et de l'horloge de progression ; ExoPlayer actuels toujours isActive = true.
- Registre de lecture actif : un canvas évincé (feuille, commentaires, groupe suivant) coupe son et vidéo.
- Cycle de vie : pause en arrière-plan (ON_STOP) et reprise juste, état de pause préservé au retour à l'écran.
- Positionner le playhead initial (seed / reseed) pour l'ouverture depuis une carte ou après un scrub.
- Mute global et mute verrouillé (locksMute) propagés à tous les médias de la scène.

Rendu : Maintenir : la barre segmentée se fige, le chrome se masque, un relâcher reprend sans saut.

Transposition Android : CADisplayLink soft pause + AVPlayer.pause → Lifecycle (ON_PAUSE / ON_RESUME) + Player.pause() pour chaque ExoPlayer, un PlaybackCoordinator partagé ; UIScene → ProcessLifecycleOwner.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Playback.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Ce qu'on compose, ce qu'on lit et ce qu'on exporte sont dessinés par le même moteur

`scc-scene-renderer-single-source` · Android : **partielle** · P0 · effort L

StoryRenderer.render(slide, mode) construit l'arbre de calques de premier plan (texte, média, sticker, lieu) pour l'édition, la lecture, la couverture statique et chaque image de l'export. RenderMode.edit montre tout ; RenderMode.play respecte startTime/duration, fadeIn/fadeOut, keyframes et transitions de clips. StoryRendererCache réutilise un calque d'une image à l'autre tant que sa signature (id, pose interpolée, visibilité, langues) ne change pas. StoryRenderer+Ghost pose un fantôme à 0,25 hors de la fenêtre d'un objet quand l'aperçu de la frise est à l'arrêt. StoryRenderingContext est le contexte Core Image partagé (Display P3, GPU Metal), pour que aperçu, vignette et export donnent les mêmes pixels.

Écarts :
- Pas de moteur partagé : modèle RenderableItem unifié (texte, média, sticker, lieu, puce audio) trié par plan puis z, avec fenêtres de temps, fondus et keyframes appliqués par le même code en édition, lecture, couverture et export.
- Mode édition (tout visible) et mode lecture (fenêtres respectées) à distinguer dans le même rendu ; aujourd'hui seul le lecteur filtre par fenêtre (StoryElementVisibility).
- Fantôme à opacité 0,25 des objets hors fenêtre quand l'aperçu timeline est à l'arrêt, retiré dès que l'objet rentre dans sa fenêtre.
- Cache de nœuds par signature (id, pose, visibilité, langues) pour tenir 60/120 fps sans tout recomposer : états Compose stables par objet.
- Langues du lecteur (Prisme Linguistique) injectées dans le rendu de tous les types d'objets, aujourd'hui seulement le texte.
- Espace colorimétrique commun (Display P3 vers sRGB) et contexte de rendu partagé pour que filtres, aperçu, vignette et export donnent les mêmes pixels.

Rendu : Ordre de peinture : fond, puis plan média/contenu, puis texte, sticker, lieu par z croissant. Un objet hors fenêtre n'existe pas en lecture ; en édition il est plein ; à l'arrêt dans l'aperçu timeline il est à 0,25.

Transposition Android : CALayer + CARenderer + CIContext partagé → arbre de composables Compose pour l'écran, et rendu hors écran identique (Canvas sur Bitmap ou GL) réutilisé par l'export ; Display P3 → Bitmap.Config.RGBA_F16 ou ColorSpace.Named.DISPLAY_P3 selon l'API.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer+Ghost.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext+Bitmap.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementVisibility.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`

### Les stickers (emoji, images collées, GIF, gabarits) s'affichent dans la scène, au lecteur comme au composer

`scc-sticker-layer` · Android : **partielle** · P0 · effort M

StoryStickerLayer rend un sticker de trois formes : dessin de gabarit, bitmap collé (image distante ou locale, GIF / APNG animés décodés avec budget de pixels), ou glyphe emoji rasterisé par StoryStickerRasterizer. Les emoji rasterisés se mettent en cache (emoji\|taille entière), vidés à l'avertissement mémoire. La taille de base est en pixels design projetés par la géométrie du canvas. Un sticker image est chargé par le même chargeur de cache que les médias (mémoire, disque, réseau) et annule son chargement en vol quand la couche est reconfigurée.

Écarts :
- Le lecteur n'affiche aucun sticker (stickerObjects n'est pas rendu dans StoryViewerScreen) : afficher emoji, bitmap et gabarit avec rotation, échelle, fenêtres de temps, fondus et keyframes.
- Le composer ne rend que des emoji ; ajouter les stickers image (postMediaId), le collage d'image depuis le presse-papiers ou la galerie, et les gabarits.
- GIF / APNG de sticker : décodage animé avec budget de pixels (side × scale) et démarrage à l'apparition (startTime).
- Rasterisation emoji mise en cache par (emoji, taille entière) et purge sur onTrimMemory.
- Chargement d'un sticker image annulé à la reconfiguration de la couche ; résolution par postMediaId au lecteur, par id d'élément au composer.
- Taille de base (baseSize en px design, 140 par défaut) projetée par la géométrie du canvas.

Rendu : Sticker centré sur son ancre, taille de base × échelle, rotation autour du centre, emoji nets (rasterisés à la taille rendue).

Transposition Android : CALayer.contents + CGImage cache → AsyncImage ou Painter mis en cache ; NSCache + UIApplication.didReceiveMemoryWarning → LruCache + ComponentCallbacks2.onTrimMemory ; UIImage animée → Coil AnimatedImageDecoder / GifDecoder.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Les textes de story ont 18 styles, 6 cadres, un fond plein ou en verre, un liseré et des effets lumineux

`scc-text-layer-typography` · Android : **partielle** · P0 · effort L

StoryTextLayer rend un texte avec la typographie en pixels design : 18 styles (bold, neon, typewriter, handwriting, classic, calligraphy, cartoon, futuristic, fantasy, curve, tag, italic, retro, elegant, poster, bubble, note, brush) résolus en polices nommées embarquées (SnellRoundhand, Zapfino, Chalkboard, Futura, Papyrus, Savoye, MarkerFelt, Georgia Italic, American Typewriter, Didot, Avenir Next Condensed, Arial Rounded, Noteworthy, Bradley Hand), fontFamily personnalisée et poids imposable. Le cadre vaut none, rounded, pill, rectangle, diamond, cloud ou speech (bulle BD avec queue), avec fond plein ou verre. La mise en lignes se fait à l'échelle 1 contre 88 % de la largeur (44 % pour le losange), avec marge d'un « o » minimum quand le texte est encadré. L'encre qui déborde l'avance typographique est réservée. Le pincement agrandit le cadre entier, sans recouper les lignes. Contour (largeur en design px) et ombre/lueur sont pilotés par la table des effets.

Écarts :
- Seulement 5 styles sur 18 (bold, neon, typewriter, handwriting, classic) ; ajouter calligraphy, cartoon, futuristic, fantasy, curve, tag, italic, retro, elegant, poster, bubble, note, brush avec polices Android équivalentes embarquées (Google Fonts en ressources).
- Le lecteur rend tout en FontWeight.SemiBold : ignorer fontFamily et poids d'auteur est une divergence visible ; appliquer StoryTextTypography du style.
- Aucune forme de cadre (rounded, pill, rectangle, diamond, cloud, speech avec queue) : tracer ces six cadres, dont les trois par chemin (losange, nuage, bulle BD).
- Mise en lignes : largeur de coupe 88 % de la largeur design (44 % pour le losange), marge d'un « o » pour un texte encadré, réserve d'encre pour les glyphes qui débordent (calligraphie, Zapfino).
- Le pincement doit agrandir le cadre entier (police, marges, liseré, fond) sans recouper les lignes ; Android multiplie la taille de police par l'échelle, donc la coupe change.
- Contour du lecteur absent (StoryTextOutline n'est pas appliqué à la scène lue) : trait + remplissage pondérés par la taille de police.
- Fond en verre : aujourd'hui un voile blanc 18 %, remplacer par le vrai flou (voir scc-glass-backdrop).
- Rasterisation netteté pour un texte agrandi (plafond de texture), direction RTL (StoryTextDirection existe).

Rendu : Rendu au rayon de la police design (96 px design pour un style courant) × échelle écran ; alignement left / center / right ; marge symétrique ; un texte encadré ne colle jamais aux glyphes ; ombre ou lueur selon la table (glow, aura, neon, neonPink / Cyan / Violet, gold, relief...).

Transposition Android : CATextLayer + NSAttributedString + CoreText → Text / BasicText avec TextStyle, Paint.setShadowLayer, drawText + Stroke ; polices nommées Apple → fichiers .ttf embarqués (res/font) choisis pour l'esprit de chaque style ; CAShapeLayer → Path / Shape.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer+FrameScale.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextEffectRendering.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextObjectView.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextBackground.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextEffectShadow.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextOutline.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextDirection.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTextEffect.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Plusieurs pistes sonores jouent ensemble, la musique s'efface sous les vidéos et on peut couper chaque piste

`scc-audio-mixing-ducking` · Android : **partielle** · P1 · effort L

Le canvas pilote un mixeur audio (ReaderAudioMixer) qui planifie toute la passe d'une slide : pistes de fond et de premier plan, vidéos, avec une ancre d'origine commune au playhead (back-datée quand on entre en cours). La clé d'identité de la passe dépend de la composition (ajout ou suppression d'objet), pas des éditions, donc éditer ou déplacer ne coupe pas la musique. L'automation de volume résout à chaque tick le volume de chaque média pour la position courante (jusqu'à un gain maximum). Le ducking atténue la piste des vidéos sous l'audio de fond (la musique des clips de premier plan n'est jamais atténuée). Le mute par piste est supporté. En composition, le dernier canvas monté possède le son (pile) et le rend au précédent quand il se ferme, sans le faire repartir de zéro. Les interruptions de session audio sont gérées.

Écarts :
- Seules deux pistes (fond et premier plan) jouent par deux ExoPlayer sans horloge commune ; supporter N pistes d'audioPlayerObjects avec fenêtres de temps, fondus, boucle et rognage de source.
- Ancre d'origine partagée avec le playhead (entrée en cours de slide sans écho ni retour à zéro) et clé de passe liée à la composition, pas aux éditions.
- Automation de volume par tick (courbe de volume par média, gain jusqu'à StoryVolume.maxGain).
- Ducking : atténuer la piste des vidéos quand un audio de fond joue, sans toucher aux clips audio de premier plan.
- Mute par piste et mute global propagé à toutes les couches ; mute verrouillé.
- Propriété du son en composition : pile de canvas, le dernier monté joue, les autres se taisent, sans repartir depuis le début.
- Focus audio Android (AudioFocus), interruptions (appel, autre app), casque débranché ; sonde de piste audio d'une vidéo (assetHasAudioTrack).
- Sons locaux du composer résolus avant l'URL distante (loadedAudioURLs par audio.id).

Rendu : Aucun visuel propre ; la musique de fond baisse sous la voix d'une vidéo et remonte après, sans coupure.

Transposition Android : AVAudioEngine + AVAudioPlayerNode → un ExoPlayer par piste coordonné par une horloge commune (ou AudioTrack mixé) ; AVAudioSession → AudioManager + AudioFocusRequest ; ducking → Player.setVolume.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Audio.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Volume.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasEditAudioOwnership.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`

### VoiceOver / TalkBack décrit la scène et chaque objet, avec des actions pour modifier, dupliquer, supprimer et réordonner

`scc-canvas-accessibility` · Android : **partielle** · P1 · effort M

En édition, la scène expose un élément de résumé (« 1 objet » / « N objets : … ») puis chaque objet avec son libellé : « Texte … », « Sticker <nom unicode> », « Lieu … », « Vidéo » / « Image », et le fond annoncé « Photo de fond » / « Vidéo de fond ». Chaque élément porte ses actions personnalisées (Modifier, Supprimer, Dupliquer, Mettre à l'arrière...) tirées de l'inventaire du menu. En lecture, les textes sont lus dans la langue du Prisme Linguistique (système, régionale, personnalisée, appareil). Les frames d'accessibilité se calculent depuis la projection du canvas. Pas de résumé fantôme sur une slide vide (l'écran des modèles de démarrage a ses propres libellés).

Écarts :
- Pas d'élément de résumé de composition ni de libellés par objet de la scène (texte, sticker avec son nom, lieu, média, fond photo / vidéo).
- Aucune action personnalisée (customActions sémantiques) alignée sur l'inventaire du menu d'appui long.
- Lecture : annoncer les textes dans la langue résolue du Prisme Linguistique, et le fond (« Photo de fond », « Vidéo de fond »).
- Zones d'accessibilité calculées depuis la géométrie de chaque objet (centrée sur l'ancre, taille projetée).
- Chaînes localisées (story.canvas.a11y.*, story.composer.a11y.*) dans fr, en, es, pt ; nom Unicode d'un emoji lu proprement au lieu de l'épeler.
- Cibles tactiles minimales 48 dp pour les poignées et les boutons du composer.

Rendu : Ordre de lecture : résumé, fond, puis objets par z croissant ; focus visible suivant l'objet.

Transposition Android : UIAccessibilityElement + accessibilityCustomActions → Modifier.semantics { contentDescription, customActions, liveRegion } par objet ; TalkBack remplace VoiceOver.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Accessibility.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### La scène garde les mêmes proportions sur tous les écrans, en portrait 9:16 comme en paysage 16:9

`scc-canvas-geometry` · Android : **partielle** · P1 · effort M

Le canvas travaille dans un espace design de 1080 de large. La hauteur design vaut 1920 en portrait 9:16 et 607,5 en paysage 16:9. Toute longueur (police, taille de sticker, pastille de lieu) est projetée par un facteur unique (largeur rendue / 1080), donc iPhone, iPad et export donnent les mêmes proportions. Importer un fond paysage bascule le cadre de la scène. CanvasReprojector convertit les positions normalisées d'un format à l'autre (le centre est préservé, les débordements sont ramenés dans [0,1] avec un avertissement) pour les reposts. SceneObjectScalePolicy borne l'échelle d'un objet à 0,3–4 pour tous les gestes.

Écarts :
- Canvas paysage 16:9 absent : le composer et le lecteur figent un cadre 9:16 et n'exploitent pas carrierAspect de la scène v3 ; l'import d'un fond paysage doit basculer le cadre et la hauteur design (607,5).
- Pas de projection design unique : le lecteur utilise des constantes locales (FOREGROUND_WIDTH_FRACTION, TEXT_DESIGN_CANVAS_WIDTH) ; introduire un CanvasGeometry (scaleFactor = largeur / 1080) consommé par texte, sticker, lieu et média.
- CanvasReprojector.kt existe mais n'a aucun appelant : le brancher sur le repost et le changement de forme, et afficher la bannière discrète « N élément(s) repositionné(s) pour le nouveau format ».
- Le clamp d'échelle du média de premier plan du lecteur (0,2–3) diverge de SceneObjectScalePolicy (0,3–4) : un seul objet de règle partagé par tous les gestes et tous les types d'objets.
- Densité d'écran : LocalDensity suffit, aucun travail propre à prévoir.

Rendu : Cadre 9:16 centré, lettre-boxé dans l'espace disponible (aspectFitSize) ; en paysage la scène devient 16:9. Les positions Y normalisées se projettent sur la hauteur design du cadre courant, les X sur 1080. Aucune taille de police ou de sticker ne dépend de l'appareil.

Transposition Android : CGFloat design → dp via LocalDensity ; UITraitCollection.displayScale → Density ; CGSize → Size.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasDisplayScale.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/SceneObjectScalePolicy.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/CanvasReprojector.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### On dessine à main levée sur la scène, et la scène reprend les traits en rouvrant le mode

`scc-drawing-overlay` · Android : **partielle** · P1 · effort S

setDrawingMode active le dessin PencilKit au-dessus du canvas : les gestes d'objet sont suspendus pour que le canvas de dessin capte tous les touchers. En quittant, le composer lit currentDrawingData et le range dans la slide ; ré-entrer restaure les traits précédents. Les traits éditables modernes sont des drawingStrokes ; le blob PKDrawing (drawingData) n'est plus qu'un format hérité décodé en lecture.

Écarts :
- Le blob PKDrawing hérité (drawingData) n'a pas de rendu Android : prévoir un repli (image rasterisée par le serveur ou conversion) pour les anciennes stories iOS, aujourd'hui invisibles.
- Vérifier la parité des outils de dessin (stylo, surligneur, gomme, largeur et couleur) et l'annulation avec l'éditeur iOS.
- Le dessin doit rester sous les objets de premier plan ou au-dessus selon le z du modèle, comme sur iOS.

Rendu : Traits arrondis à largeur design (px design projetés), couleur choisie dans la palette ; les gestes d'objet sont inertes pendant le dessin.

Transposition Android : PKCanvasView → Canvas Compose avec pointerInput et Path ; PKDrawing → liste de StoryDrawingStroke (déjà modélisée).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Core.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingLayer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingCanvasSpace.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingPalette.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryDrawingStroke.kt`

### Filtres et réglages d'image s'affichent en direct, partout, sans saccade

`scc-look-filters-adjustments` · Android : **partielle** · P1 · effort L

Le rendu d'un fond ou d'un média se compose d'un filtre de slide puis de réglages (exposition, contraste, couleur, température, vignette, netteté, flou) en une seule chaîne Core Image redressée par l'orientation EXIF. Le résultat est cuit hors du fil principal (dernier cran gagnant) pour que le curseur reste fluide, avec cache indexé par instance d'image et valeurs. Un fond vidéo ou un média vidéo reçoit les réglages par composition vidéo (sans netteté ni flou, rien du tout si neutres). Le même rendu sert l'aperçu, la vignette composite et l'export.

Écarts :
- Le filtre de slide n'est appliqué que dans l'aperçu du composer (ColorMatrix) : le lecteur Android ne l'applique pas à l'image ni à la vidéo de fond.
- Réglages d'image par média (exposition, contraste, saturation, température, vignette, netteté, flou) absents : modèle ImageAdjustments, curseurs et rendu.
- Filtre puis réglages en une chaîne unique (ColorMatrix + RenderEffect ou GPUImage / GlShaderProgram), jamais deux rendus successifs.
- Cuisson hors du fil principal d'un bitmap pour un curseur fluide (dernier cran gagnant), cache par instance d'image et valeurs.
- Vidéo : composition de réglages par trame (Media3 Effects / GlEffect), aucune composition quand tout est neutre.
- Calcul en lumière linéaire (température, exposition) pour la même force que iOS.

Rendu : Le curseur reste à 60 fps : le bitmap affiché demeure jusqu'au suivant, la cuisson part hors UI. Aucun réglage n'altère une vidéo neutre (zéro coût par trame).

Transposition Android : Core Image CIFilter + AVVideoComposition → ColorMatrixColorFilter / RenderEffect / Media3 Effect (GlEffect) ; LatestWinsRenderLoop → Flow.conflate() sur Dispatchers.Default.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackgroundLook.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryLookBake.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryLiveLook.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryVideoAdjustmentsProcessor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Look.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer+VideoLook.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### La story suivante s'affiche instantanément et le lecteur s'intègre partout (viewer, repost, aperçu de post)

`scc-reader-surface-prefetch` · Android : **partielle** · P1 · effort M

StoryReaderRepresentable enveloppe le canvas en mode .play pour le Prisme Linguistique, l'audio, la minuterie de fin et le cache d'images, avec trois initialiseurs (story du viewer, repost, post-story du fil). StoryReaderContext transporte les paramètres d'exécution : langues, mute (et verrou de mute), callback d'achèvement, résolveur d'URL des médias de post, lecteur d'images, résolveur d'audio local, fournisseur du player porteur, médias adoptés rendus à leur fichier local. StoryReaderPrefetcher garde une fenêtre glissante de 4 canvas déjà amorcés [N-1, N, N+1, N+2] (un pas en arrière, deux en avant) avec éviction hors fenêtre, de sorte que la première image du slide suivant n'a ni décodage d'image ni démarrage Metal ni création d'AVPlayer. Règle de durée : un média de fond court boucle un nombre entier de fois jusqu'à 6 s.

Écarts :
- La prélecture ne couvre que les images à venir (StoryPrefetchPlanner) : amorcer aussi la vidéo de fond, le premier bitmap et les players de la slide N+1 et N+2 (ExoPlayer préparé et en pause).
- Garder un pas en arrière (N-1) pour le retour rapide ; évincer hors fenêtre pour borner la mémoire.
- Surface de lecture réutilisable pour repost et post-story du fil (embed et aperçu), pas seulement le viewer plein écran.
- Contexte de lecture unique (langues, mute et verrou, achèvement, résolveurs d'URL et d'audio, médias adoptés).
- Hôte qui rogne la carte au rectangle de l'image (hostPresentsFullCanvas) : supprimer le remplissage de bande en conséquence.
- Gel de la timeline canvas en phase avec la barre du viewer quand une feuille s'ouvre.
- La règle des 6 s (boucles entières) existe dans StorySlideDuration ; vérifier la parité des cas limites.

Rendu : La slide suivante apparaît sans écran noir ni délai ; la minuterie démarre à l'affichage effectif.

Transposition Android : UIViewRepresentable + fenêtre de vues amorcées → fenêtre de ExoPlayer / états préparés mis en cache par id de slide ; AVPlayer préparé → ExoPlayer.prepare() sans play.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderContext.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPrefetchPlanner.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySlideDuration.kt`

### La barre de progression attend que la story soit prête et se fige quand la vidéo charge

`scc-stall-gated-progress` · Android : **partielle** · P1 · effort M

Le minuteur de lecture est piloté par un contrôleur (StoryReaderTimerController) : il reste en attente tant que le canvas de la slide courante n'a pas signalé que le contenu est prêt (fond couleur / dégradé tout de suite, image au premier bitmap réel ou ThumbHash, vidéo au statut readyToPlay, médias de premier plan prêts), puis démarre le compte à rebours. Le contrôle de santé (StoryPlaybackHealth) fige le temps quand la vidéo principale bufferise et le laisse courir dans tous les cas ambigus (aucune vidéo principale, pause utilisateur, échec, watchdog de 5 s dépassé, audio jamais planifié). Les signaux de prélecture (slides voisines) sont ignorés.

Écarts :
- StoryAutoAdvanceGate ne gate que les images (URL résolue) : ajouter la vidéo de fond prête (STATE_READY), les vidéos de premier plan et le fond audio.
- Le temps ne se fige pas quand la vidéo principale bufferise (STATE_BUFFERING) : brancher StoryPlaybackHealth (pur, avec toutes ses gardes anti-blocage et le watchdog de 5 s).
- Signal de prêt une seule fois par slide et ignoré hors slide courante (fenêtre de prélecture).
- État visuel d'attente : boucleur autour de la flèche / compte à rebours tant que le contenu n'est pas prêt.
- La barre doit suivre la lecture réelle (callback onPlaybackTime) pour qu'un réel ou une carte de galerie la dessine.

Rendu : Pendant l'attente, un petit boucleur tourne dans l'anneau de la flèche ; il laisse place au compte à rebours quand le contenu est prêt.

Transposition Android : KVO AVPlayerItem.status → Player.Listener (onPlaybackStateChanged, onRenderedFirstFrame) ; CADisplayLink du minuteur → LaunchedEffect + withFrameNanos.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryPlaybackHealth.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ContentReadiness.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryAutoAdvanceGate.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Un média posé sur la scène reste visible après publication : le canvas ne désigne que des médias que le post possède

`scc2-canvas-media-adoption` · Android : **partielle** · P1 · effort S

CanvasMediaAdoption est une règle PURE de publication : une photo posée est téléversée deux fois (pré-montage à la pose puis publication), et si le canvas garde l'identité de la première, il désigne un média que le post ne possède pas — le lecteur peint alors une scène VIDE pour tous les spectateurs, sans erreur ni journal. La règle expose : orphanIds (identifiants désignés mais absents du post, hors identifiants vides), designatedIds (médias désignés où qu'ils vivent : objets runtime ET scènes de canvasV3, deux orthographes postMediaId/mediaId), publicationMediaIds (ce que le dispatch a téléversé puis tout ce que le document désigne, audio compris, sans doublons), isCoherent, et adopting (reconstruit, jamais muté, les médias, sons, stickers et objets canvasV3 avec l'identité et l'URL du téléversement de publication, en retirant l'ancien mediaId). Elle sert les chemins publication et édition/republication. Android greffe les identifiants de médias dans la requête de publication (PublishMediaWriteBack.graft ne réécrit que mediaIds) mais n'a ni détection d'orphelins ni adoption dans le document de canvas.

Écarts :
- Porter la règle pure (orphanIds, designatedIds, publicationMediaIds, isCoherent, adopting) dans sdk-core/story avec tests, applicable aux objets runtime (mediaObjects, audioPlayerObjects, stickerObjects) et aux scènes canvasV3.
- Vérifier et garantir que storyEffects.mediaObjects[].postMediaId et mediaURL reçoivent l'identité du téléversement de publication : le greffage actuel ne réécrit que CreateStoryRequest.mediaIds, ce qui laisse le document désigner le média pré-téléversé (risque de scène blanche) — à confirmer sur le chemin réel.
- Appliquer l'adoption sur les DEUX chemins (publication initiale et édition/republication), qui divergent déjà côté iOS (même structure, même oubli historique).
- Inclure les pistes audio et stickers adoptés dans mediaIds pour qu'ils soient rattachés au post et non balayés comme téléversements abandonnés.
- Reconstruire immuablement les scènes en conservant ouverture, fermeture, transitions, durée, thumbHash et ratio porteur.
- Journaliser les adoptions impossibles et les objets sans asset ; le contrôle de cohérence doit pouvoir bloquer ou avertir avant l'envoi.

Rendu : Aucun rendu : un manquement se manifeste par une scène blanche chez tous les spectateurs, sans message.

Transposition Android : Règle pure Swift → objet Kotlin pur testable (sdk-core) ; journal MeeshyLog → logger du SDK.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CanvasMediaAdoption.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PublishMediaWriteBack.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`

### Je dessine au stylet ou au doigt avec une épaisseur qui suit ma pression ou ma vitesse, je gomme un trait en le frôlant et je pince pour zoomer

`scc2-drawing-capture` · Android : **partielle** · P1 · effort M

StrokeCaptureLayer est une vue de capture tactile sur mesure (sans PencilKit) : un seul doigt trace (un doigt supplémentaire devient un pinch de viewport zoom+pan, centroïde mesuré en coordonnées fenêtre), les points coalescés sont tous gardés, et la pression est calculée par trait : au stylet (force qui varie de plus de 0,05) force/forceMax, au doigt 1 − vitesse lissée normalisée (moyenne glissante 5, vMax 4000 px design/s, neutre 0,5). Le trait en cours est émis en aperçu (non commis) ; au relâchement il est commis avec captureVersion = 1, l'outil, la couleur, la largeur et le lissage actifs, et vide la pile de rétablissement. Avec l'outil gomme, le tracé ne crée rien : il supprime tout trait dont un point rendu passe à moins de largeur/2 + 28 px design d'un point de gomme (haptique léger si quelque chose est effacé) et efface l'aperçu. MeeshyDrawingSurface assemble le canvas figé, l'aperçu live et la capture. Android capture un glissement monodoigt, pression fixée à 1,0, sans gomme, sans pinch pendant le dessin, sans aperçu à largeur variable.

Écarts :
- Capturer la pression réelle : MotionEvent.getPressure / toolType STYLUS ; décider stylet vs doigt comme iOS (étendue de pression > 0,05 ⇒ stylet, pression = force/forceMax).
- Pour le doigt, calculer la pression pseudo-dynamique : vitesse point à point en px design/s, moyenne glissante fenêtre 5, normalisation vMax 4000, pression = 1 − vitesse normalisée, premier point neutre 0,5 (StrokeWidthDriver) ; écrire captureVersion = 1.
- Conserver les points historiques/coalescés (PointerInputChange.historical) pour ne pas perdre de détail aux gestes rapides.
- Implémenter l'outil gomme par trait : tracé de gomme → suppression de chaque trait dont un point rendu est à ≤ largeur/2 + 28 px design d'un point de gomme ; ne rien commettre ; effacer l'aperçu ; haptique léger si au moins un trait est supprimé.
- Aperçu live du trait en cours rendu avec le même moteur (largeur variable, marqueur translucide) et non une polyligne constante.
- Pinch/pan du viewport PENDANT le dessin : un second doigt ne démarre pas de trait, il pilote zoom+pan ; sortir du mode dessin réinitialise le zoom si le canvas est zoomé. Aujourd'hui le canvas cède entièrement ses gestes à la couche de dessin.
- Garde multi-touch : un trait par pointeur actif, annulation propre sur ACTION_CANCEL (aperçu supprimé, rien de commis).
- Un trait d'un seul point (tap) : iOS commet un point (disque) ; Android abandonne les traits de moins de 2 points — décider de la parité (iOS rend un point unique grâce aux bouchons ronds).
- Smoothing/outil/couleur/largeur du trait commis doivent venir de l'état de pinceau actif (outil, lissage) et non être figés à PEN/CURVE comme aujourd'hui.

Rendu : Aucun contrôle posé sur la scène pendant le tracé : l'aperçu live est le trait lui-même (même rendu que le trait commis). Haptique léger à l'effacement. Le pinch viewport doit rester fluide (pas de reconstruction de la liste de traits à chaque frame : le canvas figé est Equatable/mémoïsé et seul l'aperçu change).

Transposition Android : UITouch.force/coalescedTouches → PointerInputChange.pressure + historical ; Apple Pencil → stylet S Pen/USI (MotionEvent.TOOL_TYPE_STYLUS) ; UIPinchGestureRecognizer → detectTransformGestures avec garde du pointeur de tracé.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/MeeshyDrawingSurface.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthDriver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+DrawingEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingLayer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingCanvasSpace.kt`

### Des bulles flottantes me laissent choisir pinceau, couleur, épaisseur et lissage, annuler/rétablir un trait et fermer le dessin

`scc2-drawing-edit-bar` · Android : **partielle** · P1 · effort M

En mode dessin, iOS affiche (sans bandeau de fond, directive « icônes flottantes ») une rangée de bulles de verre : Pinceau, Couleur, Épaisseur, Lissage, puis Annuler le dernier trait, Rétablir le trait annulé (grisés à 40 % si indisponibles) et une bulle rouge « Terminer l'édition du dessin ». Taper une bulle déplie un panneau d'options en îlot de verre au-dessus : Pinceau (stylo / marqueur / gomme, symboles pencil.tip / paintbrush.pointed.fill / eraser.fill ; choisir un pinceau bascule en dessin plein écran « immersif »), Couleur (9 pastilles FFFFFF 000000 FF2E63 08D9D6 F8B500 9B59B6 2ECC71 FF6B6B 3498DB, anneau blanc + échelle 1,1 sur la sélection), Épaisseur (slider 1–30 pas 1 avec valeur monospace), Lissage (Brut / Courbe / Droite). La machine d'état DrawingEditingMode (inactif \| actif(trait sélectionné, outil déplié)) fait que les mêmes options éditent soit le pinceau, soit le trait sélectionné. Annuler/rétablir utilisent des piles ; un nouveau trait ou une suppression vide la pile de rétablissement. Android a une barre pleine largeur (undo, 8 couleurs, 3 largeurs 6/14/28, valider) et le réducteur StoryDrawingBoard (redo/select/recolor/resize/smooth) qui n'est pas relié à l'interface.

Écarts :
- Remplacer la barre pleine largeur par la rangée de bulles flottantes sans fond (4 outils + undo + redo + fermer rouge) avec états actif (dégradé de marque) / inactif (verre) et libellés d'accessibilité fr/en/es/pt.
- Exposer le Rétablir (redo) : StoryDrawingBoard.redo existe mais le ViewModel n'a que onDrawUndo ; ajouter bulle, état canRedo et chaînes (« Rétablir le trait annulé »).
- Ajouter le choix de pinceau stylo/marqueur/gomme (StrokeTool existe dans le modèle) et le lissage Brut/Courbe/Droite (StrokeSmoothing existe) au ViewModel et à l'interface ; le ViewModel fige PEN + CURVE.
- Palette de 9 couleurs iOS (FFFFFF 000000 FF2E63 08D9D6 F8B500 9B59B6 2ECC71 FF6B6B 3498DB) à la place des 8 couleurs Android ; pastille à anneau blanc et échelle 1,1 animée au ressort.
- Épaisseur par slider continu 1–30 (pas 1) avec valeur monospace, à la place des 3 pastilles 6/14/28.
- Panneau d'options en îlot de verre qui se déplie au-dessus des bulles avec transition bas + fondu ; un second appui sur la même bulle le replie ; sélectionner un trait existant bascule les options sur LE TRAIT (couleur/épaisseur/lissage du trait via recolorSelected/resizeSelected/smoothSelected).
- Mode dessin plein écran « immersif » déclenché par le choix d'un pinceau (hors édition d'un trait existant) et sortie qui réinitialise le zoom du canvas.
- Haptiques : léger sur chaque choix, moyen sur fermer ; animation ressort (réponse 0,3 / amortissement 0,85) sur le changement de mode.
- Hôte : le bouton Terminer doit libérer l'outil actif (la capture est conditionnée à l'outil) ET sortir du mode d'édition, comme endDrawing().

Rendu : Bulles circulaires de 44 dp (regular control), icônes 16–18 dp semi-gras, actif = dégradé/teinte brandPrimary icône blanche, inactif = verre ; fermer = teinte error rouge, icône ✕ blanche. Undo/redo juste à gauche du ✕, séparés des 4 outils par un espace flexible. Îlot d'options : coins 20, padding 12×10, verre ; boutons de pinceau 38 dp de haut, rayon 10, dégradé de marque si sélectionné sinon gris 18 %. Pastilles de couleur 32 dp, bord noir 15 % en 0,5.

Transposition Android : adaptiveGlass → Surface translucide avec flou (Modifier.blur/ RenderEffect API 31+, repli Surface semi-opaque) ; HapticFeedback → LocalHapticFeedback / View.performHapticFeedback ; SF Symbols → Material Symbols (edit, brush, ink_eraser, undo, redo, close).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingEditFloatingBubbles.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingEditToolOptions.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryDrawingToolbar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+DrawingEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingLayer.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingPalette.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/res/values-fr/strings.xml`

### Le canvas de scène s'affiche en carte au bon format, se sélectionne, s'édite en place et se laisse recouvrir par l'outil actif

`scc2-embedded-scene-canvas` · Android : **partielle** · P1 · effort M

EmbeddedSceneCanvas héberge le canvas UIKit de composition dans une carte au ratio portrait : projection SceneCardProjection (carte rendue à sa taille de référence 402×874 puis réduite, rayon d'angle compensé par l'échelle, coins 22 continus), objets sélectionnables (texte, média ; types éditables paramétrables), rappels pour tap, double tap, demande de recadrage (trim), menu d'élément avec point d'ancrage, tap sur le fond, appui long sur le fond ou sur un média de fond avec suivi du doigt (changé/terminé), édition de texte EN PLACE (editingTextId, texte modifié, fin d'édition, option « l'édition cède à la manipulation »), badge de sélection exposé comme valeur d'accessibilité (sinon un lecteur d'écran ne sait pas quel objet est réglé). Un calque d'objets (sous l'outil) et un calque d'outil (dessin) sont bornés à la carte, même découpe ; pendant qu'un calque capte, le canvas cesse de recevoir les touches. CanvasElement n'est qu'un protocole d'élément (id, type texte/image/vidéo/audio, zIndex). Android a StoryCanvasSurface : tap de désélection, pinch/pan, glisser des éléments, appui long → menu, grille de zone sûre et guides d'aimantation, mais pas ces fonctions.

Écarts :
- Projection de carte : rendre le canvas à une taille de référence (402×874) puis l'échelle à la zone allouée en conservant le ratio, avec angles arrondis compensés par l'échelle (22 dp à l'écran).
- Double tap sur un élément, demande de recadrage/trim d'un élément média, menu d'élément ancré au point du toucher (Android ouvre un menu mais sans point d'ancrage ni types éditables paramétrables).
- Appui long sur le fond et sur un média de fond avec rappels de suivi (changé/terminé) pour les gestes de fond (changer le fond, glisser).
- Édition de texte en place sur le canvas (champ superposé, changements propagés en direct, fin d'édition, option « cède à la manipulation » quand l'utilisateur déplace) ; Android passe par un dialogue.
- Badge de sélection exposé en sémantique (valeur d'accessibilité attachée au conteneur du canvas) : nom de l'objet sélectionné, plan, z.
- Calque d'objets sous l'outil et calque d'outil bornés à la carte, même découpe ; désactiver les touches du canvas quand un calque d'outil (dessin) capte.
- Types d'objets du canvas : texte, image, vidéo, audio (CanvasElementType) et z-order unifié ; Android ne gère que le texte, le sticker emoji et un média de fond.
- Hôtes : la même carte est utilisée par l'éditeur d'objet, la surface de scène et la surface de document — prévoir un composable réutilisable avec ces trois hôtes.

Rendu : Carte au ratio portrait, angles 22 dp continus, centrée dans la zone parente (jamais l'écran entier). Le badge de sélection est dessiné DANS le canvas (« TEXT · FG PLANE · z 1 ») et doit aussi être annoncé par TalkBack.

Transposition Android : UIViewRepresentable StoryComposerCanvasView → composable Compose avec Modifier.pointerInput ; accessibilityValue → Modifier.semantics { stateDescription / contentDescription }.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/EmbeddedSceneCanvas.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/CanvasElement.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySnapResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySafeZoneGrid.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`

### Un sticker gabarit, Mee, Instant ou image de pack posé sur une story garde son identité au lieu de retomber en emoji

`scc2-sticker-wire-model-gap` · Android : **partielle** · P1 · effort S

Lacune de modèle qui conditionne tous les stickers riches : sur iOS, StorySticker porte templateId (gabarit ou « mee.<id> »), slots (emplacements saisis), animation (StickerAnimation) et postMediaId/provider (image intégrée), avec une règle de rang (templateId gagne sur postMediaId qui gagne sur emoji) et un emoji de repli dérivé du gabarit. Le StorySticker Android ne déclare ni templateId, ni slots, ni animation : ces champs sont jetés au décodage, donc une story iOS affichée sur Android tombe sur l'emoji de repli et une republication perd l'identité du sticker. Cette fonctionnalité de socle n'a pas de fichier iOS dans cette partie (modèle dans l'autre partie du domaine) ; elle est déclarée ici car chaque fonctionnalité de sticker en dépend.

Écarts :
- Ajouter à StorySticker les champs templateId (chaîne vide par défaut), slots (Map<String,String>) et animation (chaîne énumérée StickerAnimation), tolérants à l'absence comme le reste du modèle.
- Projeter ces champs dans CanvasV3Projection (objet kind « sticker », payload templateId/slots/animation/postMediaId) dans les deux sens, et conserver verbatim ce que l'on ne sait pas rendre pour qu'une republication ne perde rien.
- Règle de rang d'affichage : templateId > postMediaId > emoji ; emoji de repli par gabarit (StickerTemplateCatalog.fallbackEmoji).
- Rendre en lecture un sticker gabarit/Mee/Instant (dès que les moteurs de dessin existent) ; en attendant, afficher l'emoji de repli plutôt qu'un vide.
- StoryStickerElement (composer) ne connaît que emoji : introduire une variante sticker riche (gabarit+slots, Mee, Instant, image) avec ses transformations (position, échelle, rotation) déjà prêtes.

Rendu : Aucun rendu propre ; sert de contrat. Le sticker posé garde baseSize 140 (déjà côté Android) et son échelle de pose (posedScale par gabarit).

Transposition Android : Codable Swift → kotlinx.serialization avec valeurs par défaut et ignoreUnknownKeys (déjà la convention de core/model).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPaletteEnvironment.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Chaque réglage de texte a son panneau : taille, graisse, 18 styles, 25 effets, couleurs, alignement, fonds, cadres, bordure, langue

`scc2-text-edit-options` · Android : **partielle** · P1 · effort M

TextEditToolOptions rend un panneau nu par outil (l'îlot de verre est posé ailleurs). Style : slider de taille 14–160 (pas 1, valeur monospace) + rangée de 18 vignettes « Aa » (gras, néon, machine, manuscrit, classique, calligraphie, cartoon, futuriste, fantaisie, courbe, tag, italique, rétro, élégant, affiche, bulle, note, pinceau) dans la police du style. Effet : 25 vignettes (aucun, lueur, halo doux, aura, néon, néon rose/cyan/violet, doré, braise, auréole, contour, contour clair, ombre, ombre douce, portée, élévation, latérale, flottant, ombre longue, relief, gaufré, imprimé, écho, fantôme) montrées sur « Aa » avec l'effet. Couleur : palette de pastilles. Alignement : gauche/centré/droite + slider de graisse (fin, normal, semi, gras). Fond : préréglages (aucun, verre, pleins…). Cadre : forme (aucun, arrondi, pilule, carré, losange, nuage, bulle BD), marge intérieure, épaisseur et palette de bordure de cadre. Bordure du texte : slider 0–12 (défaut 4), palette. Langue : puces FR EN ES DE IT PT AR + langue courante (sourceLanguage). Trois mises en page : rangée, grille (5 colonnes de boîtes 56 pt avec le nom SOUS la boîte, bordure dégradé 2,5 si choisie) et colonne adaptative ; seules style, effet et fond passent en grille. Android a 5 styles sur 18, le modèle des 25 effets (rendu d'ombre) mais aucun sélecteur d'effet, une taille par cycle, pas de graisse, pas de cadre, bordure par cycle de contour, pas de choix de langue.

Écarts :
- Slider de taille 14–160 (pas 1, valeur affichée en monospace, icônes A- / A+) à la place du cycle de tailles.
- Slider de graisse à 4 crans (Fin, Normal, Semi, Gras) avec libellé de valeur ; champ fontWeight à ajouter/projeter dans le modèle de texte.
- Passer de 5 à 18 styles de texte (calligraphie, cartoon, futuriste, fantaisie, courbe, tag, italique, rétro, élégant, affiche, bulle, note, pinceau en plus) avec une police par style (polices libres embarquées ou polices système) et la table de typographie correspondante.
- Sélecteur des 25 effets (le modèle StoryTextEffect Android les a tous avec ombre) : vignette « Aa » rendue avec l'effet sur le style courant, nom localisé, sélection par dégradé de marque ; « Aucun » s'écrit null.
- Mise en page en grille (5 colonnes, boîtes 56 dp rayon 12, nom sous la boîte 10 sp, bordure dégradé 2,5 si choisie sinon primaire 14 % en 1) pour Effet, Style et Fond, ou colonne adaptative ; fond de spécimen en dégradé gris et encre = couleur du texte.
- Cadre du texte : forme (aucun, arrondi, pilule, carré, losange, nuage, bulle BD), marge intérieure, épaisseur de bordure de cadre et palette ; défauts initialisés quand le cadre est neutre ; champs frameShape/framePadding/frameBorderColor/frameBorderWidth à ajouter au modèle et à la projection canvas.
- Bordure de texte : slider continu 0–12 (défaut 4) + palette ; épaisseur 0 = aucun trait.
- Langue du texte : puces FR EN ES DE IT PT AR (+ la langue courante normalisée si hors liste) qui écrivent sourceLanguage ; le Prisme Linguistique s'appuie dessus.
- Alignement : gauche / centré / droite avec libellés ; aujourd'hui des boutons à icônes seuls.
- Palette de couleurs de texte iOS (StoryTextColors) et fonds préréglés (aucun, verre, pleins) à aligner.
- Haptique léger à chaque choix ; libellés d'accessibilité et états sélectionnés ; chaînes story.textEdit.* en fr/en/es/pt.

Rendu : Vignettes de style 46×38 dp (rangée) rayon 10, dégradé de marque si choisie, sinon gris 18 % ; boîtes de grille 56 dp rayon 12 avec nom 10 sp dessous (gras et brandPrimary si choisi) ; marge de 4 dp autour des vignettes à lueur pour ne pas rogner le halo ; slider teinté brandPrimary.

Transposition Android : Slider SwiftUI → Material 3 Slider ; polices iOS (cursive, machine à écrire…) → polices Google libres embarquées (FontFamily personnalisée) ; storyTextEffect (ombres SwiftUI) → TextStyle(shadow) / drawBehind pour glow et contour.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptionsGrid.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextBackground.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextOutline.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextSize.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextEffectShadow.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTextEffect.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Je pose un emoji comme sticker depuis des catégories claires, avec appui long pour l'épingler

`scc2-sticker-emoji` · Android : **partielle** · P2 · effort S

L'onglet Smileys affiche les 8 catégories (Smileys, Animaux, Nourriture, Activités, Voyage, Objets, Symboles, Drapeaux) en sections verticales (une grille de 7 colonnes, cases tactiles de 44 pt, emoji en 30 pt), environ 14 à 21 emoji par catégorie. Un tap pose l'emoji (haptique moyen) et l'enregistre dans les récents ; un appui long propose l'épinglage ; chaque cellule porte le libellé « Autocollant X ». Android a déjà un catalogue de 128 emoji en 8 catégories avec mots-clés et une recherche globale (supérieure à iOS sur ce point), mais présenté en puces + grille de 6 colonnes dans un dialogue, sans récents, sans favoris, sans haptique ni libellé d'accessibilité dédié.

Écarts :
- Présenter les catégories en sections verticales avec en-têtes (glyphe emoji de la catégorie + titre en capitales) dans la feuille, à la place des puces ; grille de 7 colonnes, cases 44 dp, emoji 30 sp.
- Libellé d'accessibilité « Autocollant X » et testTag par emoji ; haptique moyen à la pose.
- Brancher noteUse (récents) et l'épinglage par appui long.
- Garder la recherche par mots-clés d'Android (atout sur iOS) dans l'onglet Recherche ou comme filtre des Smileys, en documentant que c'est un surplus assumé.
- Chaînes de catégories déjà présentes (stories_composer_sticker_cat_*) ; vérifier es/pt et aligner l'ordre des catégories.

Rendu : Cases 44×44 dp, emoji 30 sp, espacement horizontal 4, vertical 8 ; pas de fond de case, retour visuel du toucher uniquement.

Transposition Android : LazyVGrid 7 colonnes → LazyVerticalGrid(GridCells.Fixed(7)) dans la LazyColumn de la feuille.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Emoji.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

