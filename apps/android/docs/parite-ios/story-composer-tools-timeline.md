# Parité iOS → Android : `story-composer-tools-timeline`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**149 features iOS** : 81 absentes, 56 partielles, 9 divergentes, 3 complètes sur Android. **60 lots** planifiés (≈121050 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**story-composer-tools-timeline#1** (couverture Android estimée ≈ 15 %)

Cette partie couvre le « meuble » MeeshyComposer côté app iOS (dossier Features/Main/Composer : 205 fichiers, ~46,8 k lignes) : un hôte unique piloté par la porte d'entrée (neuf origines) et une table de profils pure, quatre formats (story, post, réel, mood) basculables sans perte, trois surfaces (scène 9:16 plein écran à rails flottants, document de post, mood), le socle Publier/audience avec menu « Publier comme » et raisons de refus, l'éditeur d'objet, la frise de temps du mode Animé, le son (fond, contenu, puce), l'import/collage de médias, la pré-montée TUS, l'autosave, les stickers (Mes stickers, détourage, lieux alentour), l'édition/republication, la porte d'upgrade et un viseur complet (gestes, cadenas, segments, filtres/effets/cadres Metal, retouche crop/trim/volume, galerie EXIF). Côté Android il n'existe que trois composers indépendants et beaucoup plus étroits : StoryComposerScreen (canvas, texte à 5 styles, stickers emoji, dessin, filtres de slide, slides, fond, durées, 4 visibilités, autosave story sans traits, upload TUS), FeedComposerSheet (médias, caméra par intents système, micro, lieu brut, langue, texte alternatif, bascule réel) et StatusComposerSheet (grille d'emojis, 122 caractères, 4 visibilités). Absents : hôte unifié et capsule Publier/format, audience ONLY/EXCEPT, hashtags et mentions de publication, rails de portes et de contrôleurs, éditeur d'objet complet, frise, son de composition, caméra intégrée (CameraX absent du catalogue) et tout le pipeline looks/retouche, édition et recomposition de contenus publiés, outbox durable post/mood, collage riche, Mes stickers, upgrade gate. Couverture estimée de la parité pour cette partie : environ 15 %, le chemin critique P0 (hôte, capsule, audience, document, scène plein écran, rails, intake média) représentant ~16 k lignes Kotlin sur ~57 k estimées au total.

**story-composer-tools-timeline#2** (couverture Android estimée ≈ 12 %)

Cette partie couvre le coeur de l'atelier de story MeeshyUI (StoryComposerView + ViewModel et ses ~25 extensions), la timeline (plan 2D, règle, tête de lecture, transport, export MP4), le mixeur audio de lecture, les mentions/références, l'audience, les brouillons, les vignettes de scène et le cadrage de scène du fil. Sur iOS, une slide est une scène 9:16 d'objets libres (textes, médias, sons, stickers, lieux) avec sélection unique, historique global undo/redo (50 étapes), timeline à pistes empilées par plan, 18 styles de texte et leurs effets, filtres par vignette, référence de personnes en 4 modes, brouillon avec bandeau de reprise, publication en arrière-plan multi-format et export vidéo de marque. Android a un composer plus simple (StoryComposerScreen 2022 l. + ViewModel 1235 l.) : slides avec légende, médias en rangée sous la toile (un fond), textes à 5 styles, stickers emoji, dessin, filtre + intensité, durée, fond de la palette (complet), visibilité à 4 modes, autosave de brouillon silencieux, publication via outbox durable, repères d'alignement/zone sûre et placeholder thumbHash du lecteur. Absents : objets média/son/lieu sur le canvas, timeline et export, undo/redo global, mentions/références dans la story, sélecteur ONLY/EXCEPT, bandeau de reprise, mixeur audio, vignettes composites, cadrage de scène du fil, bibliothèque de sons. Couverture estimée de la parité de cette partie : environ 12 %.

**story-composer-tools-timeline#3** (couverture Android estimée ≈ 7 %)

Cette partie couvre tout ce qui entoure le canvas du composer iOS : viseur caméra intégré (AVCaptureSession, bascule d'objectif en cours de prise, segments fusionnés, zoom/torche/mise au point), grille des médias récents de la photothèque, rangée canonique de 7 outils (Médias, Son, Texte, Dessin, Fond, Effets, Timeline) avec bande basse redimensionnable et politique de chrome, bibliothèque de sons, puces audio, annulation globale, et surtout l'éditeur de montage complet (moteur synchronisé sur une ancre hôte, mixeur audio, compositeurs de transitions, plan 2D par plans, pistes vidéo/audio/texte, inspecteurs clip/keyframe/transition, aimantation, pile de commandes, accessibilité). S'y ajoutent le player de scène unique (reader/preview/card/reel), l'intention de publication unifiée PublishIntent et l'écriture durable des stories. Côté Android, le composer actuel est un composer à deux FABs (Contenu/Effets) avec texte, stickers, dessin, fond, filtres, durée de slide et file de publication durable. Il n'a ni caméra intégrée (intents système), ni médias récents, ni audio à la création, ni timeline, ni inspecteurs, ni annulation globale, ni ouverture animée, ni player de scène. Existent seulement des briques de lecture (interpolation de keyframes, fondus, opacité des transitions, fenêtre audio ExoPlayer, snap spatial) et le texte alternatif du composer de feed. Le gap est massif mais ordonnable : fondations du chrome (rangée, bande, hôte de panneaux) d'abord, puis audio/son, puis moteur et éditeur de timeline, puis caméra et médias récents.

## Notes transverses

ARCHITECTURE. (1) L'hôte unifié et toutes les surfaces neuves vivent dans :feature:stories, sous-paquet me.meeshy.app.stories.composer.* : feed et stories ne peuvent pas se dépendre (feature->feature interdit, vérifié dans les build.gradle.kts) et StoryComposerScreen y habite. Les lois pures et ComposerIntent vivent dans :core:model (me.meeshy.sdk.model.composer.*, prouvables en local par ./apps/android/meeshy.sh jvm-check) pour que :feature:feed, :feature:chat et :app les voient. Les entrées (fil, statuts, tray, partage, retouche de pièce) passent par des callbacks câblés dans :app (ComposerNavigation.kt). Alternative écartée : un module :feature:composer, qui obligerait à déménager ~3 300 lignes du composer de story. (2) Deux familles d'UI cohabitent comme sur iOS : l'ATELIER (rangée de 7 outils + bande basse + montage complet Plan2D) = le composer de story existant relevé ; la SCÈNE incrustée (rails + frise simple) = surface neuve ; elles partagent le moteur d'objets, le brouillon, la publication et les lois. (3) FeedComposerSheet / StatusComposerSheet restent routés jusqu'au lot final de retrait (la refonte préserve l'ancien chemin).

FICHIERS CHAUDS, ordonnés par depends_on (ne jamais paralléliser deux lots qui les touchent) : StoryComposerViewModel / UiState / StorySlideDeck (socle -> scene-objets-modele -> canevas+historique -> audience -> texte -> republier) ; Story.kt de :core:model (publication-contrat -> texte -> stickers -> scene-fond -> media-filtres) ; StoryViewerScreen.kt (lecteur-mixeur -> extraction -> ouverture -> unique -> chargement) ; PostApi.kt (publication-contrat seul) ; OutboxModel / OutboxFlushWorker (file-durable seul) ; MeeshyApp.kt (hôte seul, les suivants n'éditent que ComposerNavigation.kt) ; libs.versions.toml (socle seul) ; NetworkModule / MeeshyApi (ecran-mise-a-jour crée un accesseur générique, hashtags et sons s'enregistrent par module Hilt dédié) ; AndroidManifest (brouillon seul) ; ComposerAttachmentTray (medias-recents puis retouche-piece). Chaînes : un fichier res/values/composer_<lot>_strings.xml par lot (+ fr/es/pt, seules locales du module : l'écart aux 7 langues produit est une dette i18n hors domaine).

BUDGET DE TAILLE : StoryComposerScreen (2 022 l.) et StoryComposerViewModel (1 235 l.) dépassent déjà le plafond de 1 200 : le lot socle précède tout lot touchant le composer de story, et chaque lot ajoute dans des fichiers neufs (plusieurs lots approchent 3 000 l. : ne pas les gonfler).

RISQUES / DÉCISIONS. (a) CameraX, Media3 transformer/effect et ML Kit sont absents du catalogue et non résolvables hors CI (dl.google.com) : seule la CI android.yml prouve ces lots. (b) Android n'écrit que du canvas v1 (X-Canvas-Caps: 3 = lecture seule) : ne pas basculer sur v3 ici ; tout champ ajouté (adjustments, fitMode/backdrop, layout, mediaCaption, mentions…) est additif, décodé tolérant, et se vérifie contre les schémas Zod de la passerelle avant émission (rétrocompatibilité de production). (c) Routes gateway à confirmer avant les lots concernés : GET /app/min-version, GET /hashtags/trending, /sounds/*, PATCH /posts/:id, storyEffects sur POST /posts. (d) Décisions produit à ouvrir : fournisseur des lieux alentour (endpoint gateway, Places ou Overpass) et carte (MapLibre ou Google Maps) ; transcription locale du vocal (SpeechRecognizer ou pipeline serveur) ; 13 familles de polices libres (OFL) à choisir pour les 18 styles. (e) lecteur-de-scene-cadrage-et-extraction déplace du code de :feature:stories vers :sdk-ui : refactor à risque, tests du lecteur inchangés. (f) etagere-des-cadres-de-packs dépend de ext:boutique-packs (aucune Boutique sur Android). (g) Lois transverses : Prisme (légendes, alt, captions, descriptions résolus par resolveUserLanguage / ReaderPrism, langue source 'fr' des objets), présence jamais fabriquée dans les listes de personnes (AudienceUserPicker, mentions), accentColor sur les coches d'audience, contenus à vue unique / flou / chiffrés jamais exposés par un aperçu, une graine ou un export.

COUVERTURE. Doublons des trois inventaires fusionnés : annuler/rétablir (3), rangée d'outils / bande / rails (deux familles d'UI), timeline (frise de scène vs montage Plan2D), pré-montée, autosave, publish-intent / file d'attente, mixeur audio. Ignorés car complets : stc2-background-style-palette, sct-reader-slide-cache, sct-keyframe-interpolation. Toute autre feature_key est couverte par au moins un lot (vérifié par script). Les lots à lois pures sont prouvables en local, les autres par la CI.

VAGUES. W0 sans dépendance : fondations, socle, objet-editeur-regles, publication-contrat, ecran-mise-a-jour, lecteur-mixeur, mentions-suggestions, montage-lois, packs, texte-a-vue-unique. Chemin critique P0 : socle -> scene-objets-modele -> canevas+historique -> audience -> publier -> document -> document-envoi (puis modifier-un-contenu) ; la chaîne la plus profonde (10) est le montage (jusqu'à montage-inspecteurs). Les lots P2 (looks, retouche, packs, compose-depuis, retrait) sont en queue. Somme ~132 000 lignes Kotlin pour 67 lots (moyenne ~2 000, plafond 3 000).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `composer-socle-decoupage-et-dependances` | E | P0 | XL | 2450 | dependances-gradle-scene-medias | Le composer est découpé en fichiers courts et les bibliothèques caméra, montage et vision sont déclarées |
| `publication-contrat-post-etendu` | E | P0 | M | 750 | post-domain-models | Un post composé part avec sa scène, ses légendes et ses alternatives sans rien perdre en route |
| `atelier-chrome-amorces-et-collage` | E | P1 | XL | 2700 | atelier-rangee-7-outils-et-bande-basse, media-entree-regles-de-pose-et-series, composer-socle-decoupage-et-dependances | Sur une page blanche je démarre en un geste, et je colle texte, image, vidéo ou son au bon endroit |
| `atelier-panneaux-par-outil-et-accessibilite-medias` | E | P1 | XL | 2550 | atelier-chrome-amorces-et-collage, publication-contrat-post-etendu, composer-socle-decoupage-et-dependances | Chaque outil s'édite dans son panneau avec retour direct, et je décris mes médias pour les lecteurs d'écran |
| `atelier-rangee-7-outils-et-bande-basse` | E | P1 | L | 1400 | composer-socle-decoupage-et-dependances, composer-fondations-intention-profils-et-plateau | Je choisis un de sept outils (médias, son, texte, dessin, fond, effets, timeline) et tire la bande basse pour la redimensionner ou la fermer |
| `audience-six-modes-feuille-et-selecteur` | E | P1 | L | 2350 | publication-contrat-post-etendu, composer-hote-unifie-et-navigation, canevas-cadrage-reperes-et-historique, composer-socle-decoupage-et-dependances | Je choisis qui verra ma publication parmi six audiences, avec les conséquences et un sélecteur de personnes instantané |
| `brouillon-complet-modele-disque-et-reprise` | E | P1 | XL | 2900 | scene-vignettes-vives-et-bande-des-scenes, document-regles-et-surface-post | Mon brouillon garde tout (traits, médias, sons, lieux) pour tous les formats et me propose de le reprendre |
| `camera-gestes-mise-au-point-flash-et-bascule` | E | P1 | XL | 3000 | camera-session-reprise-et-enregistrement-galerie | Un seul déclencheur lu du geste, mise au point au toucher, zoom par crans, vrai flash et bascule d'objectif fluide |
| `camera-montage-dans-la-scene` | E | P1 | L | 2200 | camera-gestes-mise-au-point-flash-et-bascule, scene-plein-ecran-etages-et-invite, media-entree-regles-de-pose-et-series | Le viseur vit dans la scène : une carte qui grandit en plein écran sans jamais changer de vue |
| `camera-segments-chrono-et-abandon` | E | P1 | L | 2300 | camera-montage-dans-la-scene | Je filme par segments avec chrono, retire le dernier, valide d'un ✓ et ne jette jamais une prise en silence |
| `camera-session-reprise-et-enregistrement-galerie` | E | P1 | XL | 2900 | composer-socle-decoupage-et-dependances, composer-fondations-intention-profils-et-plateau | Je filme ou photographie dans un viseur intégré, il repart seul après interruption, et ma prise rejoint la galerie selon ma politique |
| `canevas-cadrage-reperes-et-historique` | E | P1 | L | 1800 | scene-objets-modele-plafonds-et-pile, composer-socle-decoupage-et-dependances | Le canevas se cadre en carte au-dessus du clavier, m'aide à placer mes objets, et j'annule tout (50 étapes) |
| `composer-fondations-intention-profils-et-plateau` | E | P1 | L | 1650 |  | Le composer s'ouvre déterminé par sa porte, sur un plateau sombre où tout contrôle rebondit sous le doigt |
| `composer-hote-unifie-et-navigation` | E | P1 | L | 2300 | composer-fondations-intention-profils-et-plateau, composer-socle-decoupage-et-dependances, socle-points-d-extension-de-l-app, feed-screen-split | Un seul composer s'ouvre depuis le tray, le fil ou la puce mood, déjà réglé par sa porte |
| `document-envoi-porte-et-actifs-de-scene` | E | P1 | L | 1350 | document-regles-et-surface-post, post-publish-outbox, feed-screen-split, feed-room-cache-and-realtime | Publier un post depuis le composer unifié envoie texte, médias, son posé et sticker importé, même depuis une porte sans fil |
| `document-regles-et-surface-post` | E | P1 | XL | 2950 | publier-formats-capsule-et-menu, media-entree-regles-de-pose-et-series | J'écris un post : texte, rangée d'outils, pièces jointes et langue, avec des refus d'envoi dits en clair |
| `hashtags-loi-feuille-et-tendances` | E | P1 | M | 1050 | audience-six-modes-feuille-et-selecteur, porte-mise-a-jour-obligatoire | J'ajoute un hashtag depuis une feuille (tendances) ou en tapant #, sans liste parallèle |
| `lieux-de-publication-proximite-et-stickers` | E | P1 | L | 1850 | document-regles-et-surface-post, stickers-gabarits-animations-et-bibliotheque | J'ajoute un lieu à ma publication (découvrabilité à proximité en option) ou une pastille de lieu à ma story |
| `media-entree-regles-de-pose-et-series` | E | P1 | XL | 2750 | scene-objets-medias-gestes-et-chargement, composer-hote-unifie-et-navigation | Mes photos, vidéos et fichiers entrent dans le composer avec le bon rôle et se retirent sans rien laisser derrière |
| `media-filtres-et-reglages-par-objet` | E | P1 | L | 2400 | objet-editeur-plein-ecran-et-inspecteur, scene-fond-cadre-et-menu-du-fond, atelier-panneaux-par-outil-et-accessibilite-medias, story-model-split-un-type-par-fichier | Je choisis un filtre sur de vraies vignettes et règle exposition, contraste, flou… par photo, avec « Comparer » à l'original |
| `media-pre-montee-etat-et-adoption` | E | P1 | M | 950 | media-entree-regles-de-pose-et-series | Pendant que je compose, mes médias montent déjà : « PRÊT » ou « MONTÉE EN COURS · 34 % — 4,8 / 14,2 Mo » |
| `media-recadrer-pivoter-couper` | E | P1 | L | 1700 | objet-editeur-plein-ecran-et-inspecteur | Je recadre, pivote par quarts de tour, coupe et mets en sourdine un média, et l'objet garde la même forme partout |
| `medias-recents-grille-regle-et-apercu` | E | P1 | L | 1900 | composer-fondations-intention-profils-et-plateau | Je choisis parmi mes derniers médias en un tap, avec sélection multiple ordonnée, aperçu en appui long et pièces déjà jointes marquées |
| `mentions-references-de-publication` | E | P1 | L | 1350 | hashtags-loi-feuille-et-tendances, lieux-de-publication-proximite-et-stickers | Je nomme quelqu'un dans ma publication avec un mode choisi (dans le texte, badge, « Avec… », notification seule) |
| `modifier-un-contenu-publie` | E | P1 | L | 1400 | brouillon-complet-modele-disque-et-reprise, publication-story-arriere-plan-et-file-durable, document-envoi-porte-et-actifs-de-scene, socle-points-d-extension-de-l-app, composer-socle-decoupage-et-dependances | Je modifie une story ou un post publié : le composer rouvre sur le contenu et n'envoie que ce qui change |
| `montage-inspecteurs-clip-keyframe-et-transition` | E | P1 | XL | 3000 | montage-pistes-barres-et-vignettes | Je règle précisément un clip, son volume, une image-clé ou une transition depuis un inspecteur flottant |
| `montage-lois-fenetre-aimant-plan-commandes` | E | P1 | L | 1750 |  | Les règles du montage sont pures et testées : fenêtre d'un clip, aimantation, plan 2D et pile de commandes annulables |
| `montage-moteur-mixeur-et-fondus` | E | P1 | XL | 2800 | montage-lois-fenetre-aimant-plan-commandes, mixeur-audio-multipistes-et-ducking, composer-socle-decoupage-et-dependances | Je lis mon montage multi-pistes en aperçu, audio et vidéo synchronisés, avec fondus enchaînés |
| `montage-pistes-barres-et-vignettes` | E | P1 | XL | 2700 | montage-regle-transport-et-ecran | Je lis et manipule mes clips sur leur piste : pellicule vidéo, image, onde audio, poignées de rognage, boucle |
| `montage-projet-liaison-slide-et-edition-clips` | E | P1 | XL | 2600 | montage-moteur-mixeur-et-fondus, brouillon-complet-modele-disque-et-reprise | Ma timeline reste synchronisée avec ma slide : je sélectionne, déplace, rogne et règle un clip, tout est annulable et sauvegardé |
| `montage-regle-transport-et-ecran` | E | P1 | XL | 2900 | montage-projet-liaison-slide-et-edition-clips, atelier-panneaux-par-outil-et-accessibilite-medias, scene-export-menu-ellipse-et-habillage | Je pilote mon montage depuis un écran : règle, tête de lecture, transport, aimant, zoom, +10 s et export |
| `mood-composer-complet` | E | P1 | L | 1400 | audience-six-modes-feuille-et-selecteur, post-publish-outbox, persist-outbox-kinds-social-stories | Je publie une humeur en un geste : grille d'emojis, un mot de 122 caractères, audience, republication, confirmation sans mot |
| `objet-editeur-plein-ecran-et-inspecteur` | E | P1 | XL | 2500 | texte-styles-effets-barre-et-panneau-editeur, scene-rails-portes-et-controleurs | J'édite un objet en plein écran, avec un seul panneau ouvert, un inspecteur de valeurs et un clavier qui ne gêne pas |
| `objet-editeur-regles-timing-et-copie` | E | P1 | M | 800 |  | L'éditeur d'objet n'ouvre jamais deux sections à la fois et règle la fenêtre d'apparition sans état invalide |
| `ouverture-fermeture-des-slides-choix-et-lecture` | E | P1 | L | 1300 | scene-rails-portes-et-controleurs, canvas-scene-unique-en-lecture, story-viewer-decomposition-and-nav-graph | Je choisis l'animation d'ouverture de ma slide (fondu, zoom, glissement, révélation) et le lecteur la joue à l'identique |
| `publication-story-arriere-plan-et-file-durable` | E | P1 | L | 1550 | publication-contrat-post-etendu, scene-objets-modele-plafonds-et-pile, persist-outbox-flusher-classifie, persist-media-file-queue, persist-stories-brouillons-stockage, composer-socle-decoupage-et-dependances | Je publie en un tap : la story part en arrière-plan, même hors ligne, et les slides vides ne partent pas |
| `publier-formats-capsule-et-menu` | E | P1 | XL | 2600 | audience-six-modes-feuille-et-selecteur | Je publie d'un geste et choisis story, post, réel ou mood depuis le chevron, avec la raison de chaque refus |
| `republier-et-recomposer-une-story` | E | P1 | L | 1550 | media-entree-regles-de-pose-et-series, texte-styles-effets-barre-et-panneau-editeur, composer-socle-decoupage-et-dependances | Je republie ou recompose une story : toute la scène est reprise, l'audience ne s'élargit jamais, les médias sont rapatriés |
| `scene-export-menu-ellipse-et-habillage` | E | P1 | XL | 2900 | scene-plein-ecran-etages-et-invite, camera-session-reprise-et-enregistrement-galerie | Depuis le menu ⋯ j'aperçois, enregistre ou transfère ma scène en image ou en vidéo habillée Meeshy |
| `scene-fond-cadre-et-menu-du-fond` | E | P1 | M | 1150 | scene-rails-portes-et-controleurs, stickers-gabarits-animations-et-bibliotheque, story-model-split-un-type-par-fichier | Je choisis le fond de la scène et règle Ajuster/Remplir avec le fond des bandes |
| `scene-frise-mode-anime` | E | P1 | L | 1650 | scene-rails-portes-et-controleurs | Mode Animé : une frise de temps avec lecture, tête ambre et une piste par objet que je déplace ou raccourcis |
| `scene-legende-calque-de-lecture` | E | P1 | M | 900 | scene-plein-ecran-etages-et-invite, hashtags-loi-feuille-et-tendances, mention-contacts-and-lookup | Je lis et j'écris la légende sur la scène telle que le lecteur la verra, repliable d'un chevron |
| `scene-objets-medias-gestes-et-chargement` | E | P1 | L | 1600 | canevas-cadrage-reperes-et-historique | J'ajoute photos et vidéos comme objets de la scène, que je déplace, pince et pivote, avec chargement et alerte si un média est perdu |
| `scene-objets-modele-plafonds-et-pile` | E | P1 | L | 1800 | composer-socle-decoupage-et-dependances | Je compose chaque slide comme une scène d'objets libres (textes, médias, sons, stickers, lieux) que je sélectionne un à un |
| `scene-plein-ecran-etages-et-invite` | E | P1 | L | 2200 | composer-hote-unifie-et-navigation, canevas-cadrage-reperes-et-historique | Je compose sur une scène plein écran avec une invite claire et des étages du bas qui se remplacent |
| `scene-rails-portes-et-controleurs` | E | P1 | XL | 3000 | scene-plein-ecran-etages-et-invite, media-entree-regles-de-pose-et-series, objet-editeur-regles-timing-et-copie | Le rail de gauche ajoute de la matière à la scène, celui de droite pilote l'objet, et l'appui long ouvre le même menu |
| `scene-vignettes-vives-et-bande-des-scenes` | E | P1 | L | 2100 | scene-plein-ecran-etages-et-invite, media-entree-regles-de-pose-et-series | Je navigue entre mes scènes (dix au plus) par des vignettes vivantes et fidèles, légères en mémoire |
| `sons-ajout-roles-et-disposition` | E | P1 | L | 1850 | sons-bibliotheque-selecteur-et-page, media-entree-regles-de-pose-et-series | J'ajoute un son : enregistrer un vocal, emprunter un son ou importer un fichier, avec sa place choisie |
| `sons-bibliotheque-selecteur-et-page` | E | P1 | L | 2100 | composer-fondations-intention-profils-et-plateau, porte-mise-a-jour-obligatoire | Je retrouve mes sons et les sons tendance, les écoute, les renomme, les retire et vois les publications qui les utilisent |
| `sons-cellule-puces-traces-et-spectrogramme` | E | P1 | XL | 2900 | sons-ajout-roles-et-disposition, atelier-panneaux-par-outil-et-accessibilite-medias, document-regles-et-surface-post | Je gère mes pistes audio (cellule, puces sur la scène) et le son se voit : note, onde, crédit, durée et spectre |
| `stickers-gabarits-animations-et-bibliotheque` | E | P1 | XL | 2800 | texte-styles-effets-barre-et-panneau-editeur, atelier-chrome-amorces-et-collage, feuille-de-stickers-onglets-recents-favoris, story-model-split-un-type-par-fichier | Je pose des stickers vivants (gabarits, animations), garde mes images collées dans « Mes stickers » et détoure un sujet |
| `texte-styles-effets-barre-et-panneau-editeur` | E | P1 | XL | 2750 | mention-contacts-and-lookup, audience-six-modes-feuille-et-selecteur, texte-de-scene-cadres-et-mise-en-lignes, story-model-split-un-type-par-fichier, composer-socle-decoupage-et-dependances | J'écris mes textes en 18 styles et effets, avec une rangée de bulles flottantes et un panneau d'édition à sections |
| `composer-depuis-un-media-recu` | E | P2 | M | 1000 | modifier-un-contenu-publie | Je compose à partir d'un média reçu : la photo, la vidéo ou la scène devient la graine d'une nouvelle publication |
| `composer-retrait-des-anciens-composers` | E | P2 | M | 700 | mood-composer-complet, republier-et-recomposer-une-story, retouche-piece-de-conversation, feed-screen-split | Les anciens composers du fil et des statuts sont retirés une fois la parité du composer unifié atteinte |
| `etagere-des-cadres-de-packs` | E | P2 | L | 1400 | pack-shop-ui-and-settings | Je parcours les cadres d'un pack installé avec la condition d'usage de chacun |
| `looks-effets-de-visage-cadres-et-export-video` | E | P2 | XL | 3000 | looks-moteur-de-rendu-et-filtres | Mes prises reçoivent lissage, effets de visage et cadres vivants, gardés image par image à l'export malgré la chauffe |
| `looks-moteur-de-rendu-et-filtres` | E | P2 | XL | 2800 | camera-segments-chrono-et-abandon | Filtres en direct dans une bande de miniatures vivantes, appliqués à l'aperçu, à la photo et à la vidéo |
| `retouche-de-la-prise-recadrage-decoupe-et-volume` | E | P2 | XL | 3000 | looks-moteur-de-rendu-et-filtres | Après la prise, je recadre, coupe à la milliseconde, règle le volume de 0 à 200 % et valide avec Terminé |
| `retouche-piece-de-conversation` | E | P2 | M | 750 | retouche-de-la-prise-recadrage-decoupe-et-volume, medias-recents-grille-regle-et-apercu, composer-depuis-un-media-recu | Je retouche une photo ou une vidéo avant de l'envoyer en conversation avec les mêmes outils que la caméra |
| `texte-a-vue-unique-se-referme` | E | P2 | S | 350 |  | Un texte à vue unique se referme dès que je le retouche ou qu'il quitte l'écran |

### Lots fusionnés ou retirés par l'architecture

- `ecran-mise-a-jour-requise` → `porte-mise-a-jour-obligatoire` (drop-duplicate) : Même écran de mise à jour obligatoire.
- `lecteur-de-scene-cadrage-et-extraction` → `canvas-scene-unique-en-lecture` (merge-into) : Extraction déjà faite par SceneCanvas ; la loi de cadrage de carte de fil rejoint le plan de rendu.
- `lecteur-de-scene-unique-par-mode` → `lecture-prechargement-et-surface-reutilisable` (merge-into) : Même lecteur de scène à modes reader / preview / card / reel.
- `lecteur-mixeur-audio-lois-et-integration` → `mixeur-audio-multipistes-et-ducking` (merge-into) : Même mixeur audio multipistes de la scène.
- `lecteur-chargement-flou-et-voisinage` → `story-reader-prefetch-window` (merge-into) : Même préparation des stories voisines. Hérite : lecture-prechargement-et-surface-reutilisable.
- `file-durable-post-et-mood` → `post-publish-outbox` (merge-into) : Même file durable de post ; l'humeur = mood-composer-complet.
- `mentions-suggestions-arobase` → `mention-contacts-and-lookup` (drop-duplicate) : Même suggestion @ cache d'abord puis annuaire.

## Features

### Publier d'un geste, et choisir story, post, réel ou mood depuis le chevron avec la raison de chaque refus

`scomp-publish-capsule-format-menu` · Android : **absente** · P0 · effort M

Le socle (bas du meuble, jamais réorganisé) porte la chip d'audience, le bouton « texte du post » (porte content) et la capsule [Publier … \| v]. Le chevron ARME un choix sans publier ; seul l'appui sur la partie principale envoie. Le menu « Publier comme » liste les formats de la porte dans son ordre, un format impossible est grisé AVEC sa raison (« Demande une vidéo, un son ou deux photos », « Écrivez d'abord quelque chose », « Ne porte que du texte »…), le Post déplie le sous-menu des dispositions, une story peut partir aussi en réel (« Publier la story et le réel »). Un canal par format (scène, document, atelier, non supporté) décide du chemin d'envoi et refuse en le disant. Un hint explique pourquoi Publier est bloqué (audience vide, rien à publier).

Écarts :
- Créer la capsule Publier à deux zones (principale = publie au format armé ; chevron = ouvre le menu qui ne publie pas) avec libellés « Publier la story / le post / le réel / la story et le réel ».
- Menu « Publier comme » (DropdownMenu/ModalBottomSheet) : entrées dans l'ordre de la porte, entrée refusée grisée avec raison localisée (reel, mood, post, story), coche de l'entrée armée, sous-menu des dispositions pour Post.
- Règle pure ComposerPublishMenuRule (entries/menu/armed/toggled/companionReelOffered) : un choix que le menu n'offre plus retombe sur le format de la porte ; chevron absent si un seul geste serait offert.
- Canal de publication par format (scène, document, atelier, non supporté) avec refus explicite « Ce format ne peut pas encore être publié d'ici » ; multi-scènes avec médias non portables refusé en le disant.
- Hint de blocage sous le socle (audience sans personne, document vide, scène vide) et état « publication en cours » accessible (annonce TalkBack).
- Aujourd'hui le format est figé par l'écran (Feed = post, Stories = story) : aucun choix de type à l'envoi.

Rendu : Capsule pleine largeur de la partie droite du socle : libellé « Publier la story » + séparateur + chevron ; état armé coché dans le menu ; entrée refusée atténuée avec sous-titre de raison ; padding bas faible (frôle la zone du geste d'accueil).

Transposition Android : Menu SwiftUI liquid glass -> Material3 DropdownMenu ancré sur la capsule (ou bottom sheet en compact) avec effet verre tinté du plateau (RenderEffect blur API 31+, repli translucide).

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerPublishMenu.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFormatAvailability.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPublishChannel.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFloatingSocle.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerHostRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Mise au point au toucher, zoom par crans, vrai flash (écran blanc en selfie, intensité réglable) et bascule d'objectif fluide

`scomp-capture-focus-zoom-flash-switch` · Android : **absente** · P1 · effort M

Au repos l'objectif suit le sujet tout seul (mise au point + exposition continues) ; un toucher fixe les deux sur le point une fois puis surveille la scène et revient en continu (l'image réellement affichée sert à convertir le toucher, y compris sous un cadre ou en miroir). Barre de zooms par crans selon l'objectif (puce unique quand pas de crans) qui MORPHE pendant la bascule avant/arrière. Flash : off -> on -> auto ; objectif arrière = lampe/torche, objectif avant = l'ÉCRAN éclaire (sol blanc, luminosité au maximum 0,25 s de rampe, maintien 0,45 s) avec curseur vertical d'intensité 0,3..1 (par défaut 1, persistée), qui s'efface 2 s après la dernière interaction ; en plein écran le blanc n'est activé qu'au moment de la prise (burst). La bascule d'objectif voile scène ET vignettes (flou, fondu, léger recul sauf animations réduites) pour masquer les 400 ms de reconfiguration.

Écarts :
- Mise au point continue + tap-to-focus via CameraX (FocusMeteringAction / MeteringPointFactory), retour auto au centre après changement de scène ; conversion touch -> point capteur sur l'image affichée (filled/slotInView/devicePoint, miroir pour l'avant).
- Zoom : crans selon les caméras logiques (ultra-grand-angle/grand-angle/télé), puce de facteur sans crans, morphing de la barre pendant la bascule (phase hidden/presets/chip/morphing).
- Flash tri-état (off/on/auto) : torche/flashMode (ImageCapture.FLASH_MODE_*) à l'arrière ; selfie = écran blanc + WindowManager.LayoutParams.screenBrightness au max (rampe 0,25 s, maintien photo 0,45 s) + restauration, intensité 0,3..1 persistée (DataStore) avec curseur vertical de 132 dp.
- Voile de bascule (ComposerCameraSwitchVeil : flou, fondu, échelle 0,x sauf animations réduites) sur la scène et les vignettes pendant le rebind CameraX.
- Plein écran + selfie : le sol blanc n'apparaît qu'au moment de la prise (showsFloor/showsBurst) ; carte + selfie : sol blanc continu.
- Libellés : « Flash activé / désactivé / automatique », « Intensité du flash », « Changer d'objectif », « Zoom ».

Rendu : Curseur de flash vertical 132 dp sous le bouton (glisser vers le haut éclaire plus), pastilles de zoom type capsule au-dessus de la bande, morphing en capsule unique avec glyphe de bascule qui tourne.

Transposition Android : AVCaptureDevice.focusPointOfInterest -> CameraControl.startFocusAndMetering ; torch -> CameraControl.enableTorch ; UIScreen.brightness -> window.attributes.screenBrightness.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureFocus.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureFocusGeometry.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraFlash.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFlashIntensitySlider.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraSwitchVeil.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraSwitchVeilStyle.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureMotion.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Switch.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift`

</details>

### Un seul déclencheur lu du geste : toucher = mise au point, double toucher = photo, maintenir = filmer, glisser = cadenas, pincer/glisser = zoom

`scomp-capture-gestures-shutter-lock` · Android : **absente** · P1 · effort L

Table pure zone × geste × phase × verrou -> action (ComposerCaptureGesture) : zones scène / case choisie / déclencheur simple / autre case / rail ; actions focus, photoToEdit, photoToGallery, filmSegment, filmToGallery, stopTake, zoom, steerTake, close, select, openFamily, reframe, toggleEditChrome. Règle du double toucher (fenêtre 0,3 s, jamais d'une zone à l'autre, le toucher qui a armé le viseur ne compte pas, le premier vise tout de suite) ; sur un déclencheur le 2e toucher d'un double est absorbé (pas deux photos). Maintenir 0,8 s filme ; glisser de 64 pt vers la droite VERROUILLE (cadenas qui se remplit puis se SCELLE, rebondit, passe au vert et part) ; en tenant, glisser à la verticale ZOOME (160 pt par doublement, plafond x10), pincer zoome (grâce 0,4 s). Contour de la case choisie qui rougit et bat pendant la prise. Équivalents VoiceOver nommés (Prendre une photo, Filmer, Arrêter, Mettre au point, Photo/Vidéo vers la galerie).

Écarts :
- Porter la table pure ComposerCaptureGesture (zones, gestes, contexte, actions) et ComposerCaptureTapRule (doubleTapWindow 0,3 s, holdReleaseWindow 0,3 s) en Kotlin pur testé.
- Déclencheur à intentions lues du geste (ComposerShutterGesture : holdToFilm 0,8 s, slideToLock 64 dp, outcome/locks/lockProgress) via pointerInput/awaitEachGesture ; verrou mesuré sur la translation PHYSIQUE vers la droite (indépendant du RTL).
- Clé du verrou (ComposerCaptureLockTrack) : apparaît à droite en tenant, se remplit sous le glissé, se scelle (échelle 1,3, rebond élastique, liseré vert, 0,6 s / 0,35 s en animations réduites) avant de partir.
- Zoom au glissé vertical pendant la prise (pointsPerDoubling 160, ceiling x10) et au pincement (pinchGrace 0,4 s) ; badge de facteur ; pas d'accessibilité de x1,25 par action.
- Contour du déclencheur (ComposerTriggerOutline) posé AUTOUR du flux (pas dessus), rouge et pulsé en enregistrement, immobile si animations réduites.
- Actions TalkBack nommées (customActions) projetées de la table, jamais une liste réécrite ; « Arrêter » offert pendant une prise.

Rendu : Cadenas à droite du déclencheur (sens physique), chevron toujours pointé à droite ; contour de case 2 dp détaché de `gap` du bord, coins suivant la case ; haptique légère à l'armement, moyenne au verrouillage.

Transposition Android : DragGesture/LongPress/Magnify -> Compose pointerInput(awaitPointerEventScope) + transformable ; VoiceOver actions -> semantics { customActions }.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureGesture.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureTapRule.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerShutterGesture.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureHold.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureLockTrack.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Tap.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerTriggerOutline.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureMotion.swift`

</details>

### Filmer par segments avec chrono, retirer le dernier, valider d'un ✓ et ne jamais jeter une prise en silence

`scomp-capture-video-segments` · Android : **absente** · P1 · effort L

Chaque segment est déjà un FICHIER : supprimer le dernier supprime un fichier, valider concatène des pistes encodées (sortie quasi instantanée). Rangée haute dictée par une règle (ComposerCaptureTopRow) : à gauche la croix puis, dès qu'une vidéo se prend, la puce du chrono « 3 – » (segments), à droite [ ] / retirer le dernier / ✓ / flash / bascule ; pendant l'enregistrement seuls la croix et le chrono restent. Bas : crans de zoom, bande de looks (ou déclencheur simple), cadenas à droite, phrase du geste (« maintenir pour filmer · relâcher pour poser dans la scène », « toucher pour lancer — les mains libres »…). (x) pendant une prise, avec segments en attente ou en retouche demande « Abandonner la vidéo ? / la photo ? » (Continuer / Abandonner) et la question survit à une recréation de vue. Mode mains libres (toucher pour lancer/arrêter). La session unique (ComposerCaptureSession) orchestre phase (viser/retoucher), segments, verrou, look, flash, thermique, sauvegarde galerie en attente (« La prise précédente s'enregistre encore »).

Écarts :
- Enregistrement par segments fichiers (CameraX VideoCapture + Recorder, un fichier par maintien), total/elapsed/shares pour la barre de segments, retirer le dernier, valider -> concaténation (Media3 Transformer / MediaMuxer) sans ré-encodage quand possible.
- Rangée haute pure (leading/trailing selon stage, editing, pendingSegments, offersSizeToggle, offersSave), puce de chrono + indicateur « n – », contrôleurs de segment à gauche de flash/bascule.
- Confirmation d'abandon portée par la session (ComposerCaptureDiscardPrompt) pour enregistrement en cours, segments en attente, retouche ; libellés « Abandonner la vidéo ? / la photo ? », Continuer/Abandonner.
- Phrase du geste par mode+étape (photo, vidéo, vidéo en tenue, mains libres départ/arrêt) et accessibilité « n segments » (pluriel de la langue).
- Voile sombre de lisibilité sous le chrome quand un cadre clair est choisi (contraste >= 4,5:1 en blanc).
- Session ComposerCaptureSession (StateFlow) unique pour les deux montages ; sauvegardes galerie en attente comptées ; prise précédente encore en cours d'écriture signalée.

Rendu : Puce chrono rouge avec point, indicateur de segments « 3 – », rangée haute de contrôles 44 dp espacés de 4, phrase du geste en monospace 85 % blanc avec ombre.

Transposition Android : AVCaptureMovieFileOutput -> CameraX Recorder ; concat AVMutableComposition -> Media3 Transformer ; alertes -> AlertDialog.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSegments.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureTopRow.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraCopy.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureChromeLegibility.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCapturePhase.swift`

</details>

### Le viseur vit dans la scène : une carte qui grandit en plein écran sans jamais changer de vue

`scomp-capture-viewfinder-mount` · Android : **absente** · P1 · effort L

Un appui long sur une scène vide arme la caméra DANS la scène (jamais une feuille) : le fond de la scène devient la caméra. ComposerCaptureMount monte UN aperçu qui grandit (deux couches : l'IMAGE ignore les marges système, les COMMANDES les respectent), carte aux coins arrondis (rayon 24) <-> plein écran par un ressort fluide ; bouton [ ] pour agrandir/réduire (absent dans la barre de conversation qui est déjà plein écran, et absent sous flash écran en selfie), glissé vertical vers le bas pour fermer (seuil 110, course 180, fondu). Les modes dépendent du format (Réel : vidéo + mains libres ; Story/Post : photo, vidéo, mains libres ; Mood : aucun). Accès refusé : panneau explicatif + ouverture des Réglages, la croix reste en haut à gauche. La même coquille sert les portes sans scène (ComposerViewfinder : barre de conversation, statut, page blanche, citation) et le décodage de la capture en objets de scène (CameraResult photo/vidéo -> fond ou premier plan).

Écarts :
- Android délègue la caméra aux intents système (ACTION_IMAGE_CAPTURE / VIDEO_CAPTURE) sans permission ni viseur intégré : introduire CameraX (androidx.camera:camera-core/camera2/lifecycle/video/view, absents du catalogue de versions) avec PreviewView/Compose CameraXViewfinder, ProcessCameraProvider, ImageCapture, VideoCapture.
- Montage unique en deux couches (image plein cadre / commandes dans les insets) qui grandit carte <-> plein écran par animation de bounds (SharedTransition/animateRect), rayon 24 dp, flou de bascule.
- Armement par appui long sur scène vide (armedHoldDuration 0,5 s ; readinessTimeout 3 s) ; l'ouverture du composer n'arme jamais la caméra (ComposerSceneCaptureGesture).
- Modes par format (ComposerSceneCamera.modes(for:)) : status aucun, reel vidéo+mains libres, story/post photo+vidéo+mains libres ; mode initial par format+ouverture (CameraCaptureMode).
- Glissé vertical pour fermer (dismissThreshold 110, dismissTravel 180, opacité dégressive) et bouton plein écran/réduire ; règle offersSizeToggle(hostHasCard, screenFlash, editing) et showsFloor/showsBurst.
- Écran d'accès refusé (CAMERA/RECORD_AUDIO) : explication + bouton vers les paramètres de l'app ; croix toujours visible.
- Viseur seul plein écran (ComposerViewfinder) pour la barre de conversation, le statut, l'atelier vide, la citation ; livraison CameraResult -> objet de scène (fond si pas de fond, sinon premier plan).

Rendu : Carte 9:16 aux coins 24 dp qui s'agrandit sans coupure, chrome blanc sur voile sombre sous un cadre clair (contraste 4,5:1), aucun contrôle ne reste sur l'image hors rangée haute/bas.

Transposition Android : AVCaptureSession/CameraModel -> CameraX ProcessCameraProvider + Preview + ImageCapture + VideoCapture<Recorder> ; permission -> Accompanist/ActivityResult CAMERA + RECORD_AUDIO ; Réglages -> ACTION_APPLICATION_DETAILS_SETTINGS.

<details><summary>Sources iOS (11)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureMount.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureStage.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureViews.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCapturePlacement.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCamera.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraFrame.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCaptureGesture.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureRefusedChrome.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerViewfinder.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### Modifier une story ou un post publié : le composer rouvre sur le contenu existant et n'envoie que ce qui change

`scomp-edit-published-post-story` · Android : **absente** · P1 · effort M

« Modifier » ouvre le meuble (plus l'ancien sheet) : PostEditRoute décide de la porte selon le TYPE du post (story -> meuble hydraté, post/réel -> feuille d'édition). StoryEditComposer présente le meuble sur une session d'édition (StoryEditSession), ComposerHydration hydrate l'atelier depuis la story (graine StoryItem) ou la republication, et la publication met à jour. Seul post <-> réel est convertible à l'édition (le serveur refuse le reste) ; changer le format d'un contenu publié est le rôle du repost.

Écarts :
- Aucune édition de post/story côté Android (aucun editStory/updatePost) : ajouter les appels PATCH /posts/:id et les routes de mise à jour dans StoryRepository/PostRepository.
- Action « Modifier » dans PostActionMenu routée par PostEditRoute.resolve(for: post) (cinq montages : détail, fil, profil, réels, racine).
- Hydratation du composer depuis une story/post existant (slides, médias distants réutilisés, audience, langue) avec édition limitée : post <-> réel uniquement, story et status sans choix de format.
- Session d'édition identifiable (StoryEditSession) et brouillon d'édition distinct de la création (editingPostId).

Rendu : Même meuble que la création ; titre/état « Modification » et bouton Publier devient « Enregistrer ».

Transposition Android : fullScreenCover -> destination NavHost plein écran paramétrée par postId.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/StoryEditComposer.swift`
- `apps/ios/Meeshy/Features/Main/Composer/PostEditRoute.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerHydration.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostActionMenu.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Ajouter un hashtag depuis une feuille (tendances) ou en tapant #, sans liste parallèle

`scomp-hashtags` · Android : **absente** · P1 · effort M

Les hashtags sont DÉRIVÉS du texte de la publication (regex lettres/chiffres/_ précédée d'une frontière), jamais déclarés à côté : la feuille Hashtags (champ « Ajouter un hashtag » + section TENDANCES chargée depuis l'API) bascule la balise dans le texte, annuler rejoue la différence symétrique, la comparaison est insensible à la casse mais la balise est rendue telle qu'écrite. Les hashtags de la scène apparaissent au pied de la scène (puces #tag) avec leur libellé VoiceOver ; pour un réel, la légende est mémoïsée et fusionne texte + légendes de slides.

Écarts :
- Aucune notion de hashtag dans le composer Android : porter ComposerHashtags (tags(in:), inserting, removing, togglesRestoring, prose(of:), content(type:text:captions:)) en Kotlin pur avec la même regex Unicode.
- Feuille « Hashtags » : champ + bouton Ajouter, section TENDANCES (appel API hashtags tendances, limite 20), Annuler qui rejoue la différence symétrique.
- Porte/outil hashtag du rail (glyphe #) en niveau publication (bas) hors story et en niveau objet en story.
- Pied de scène : puces #tag colorées (couleur hashtag du thème sombre) sous la scène, et mentions référencées (pas INLINE, pas cachées) ; libellé d'accessibilité groupé.
- Légende de réel mémoïsée (ReelCaptionMemo) fusionnant texte de la publication et légendes de slides.

Rendu : Puces capsule 32 dp mini, fond blanc 7 %, liseré 12 %, texte couleur hashtag, croix 9 sp ; section TENDANCES en capitales discrètes.

Transposition Android : ModalBottomSheet + FlowRow de puces ; suggestions via le même endpoint tendances que le web.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerHashtags.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerHashtagSheet.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneReferenceFooter.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Audience.swift`

</details>

### Nommer quelqu'un avec un mode choisi (dans le texte, badge, « Avec… », notification seule) et le voir au pied de la scène

`scomp-mention-references` · Android : **absente** · P1 · effort M

Une référence (ComposerReference) est un pseudo + id optionnel + mode (INLINE, PINNED badge sur la scène, NOTE rangée « Avec… », SILENT notifiée seulement). L'éditeur plein écran d'objet et la description montent une bande de suggestions « @ » ; la porte Mention ouvre la feuille de mode ; seules les références non INLINE sont déclarées dans CreatePostRequest.mentions (nil et jamais [] pour ne pas effacer). Les références PINNED/NOTE se voient au pied de la scène. Une mention hors audience est signalée.

Écarts :
- MentionComposer (chat) et CommentMention* existent mais aucune mention n'est posée dans un post/story/mood : ajouter le modèle ComposerReference (username, userId?, display) et le payload mentions (null si vide, jamais liste vide).
- Bande de suggestions « @ » au-dessus du clavier dans la description, le document et l'éditeur d'objet ; « Aucune personne trouvée ».
- Feuille de choix du mode (dans le texte / badge sur la scène / rangée « Avec… » / notifiée seulement) et rangée « Avec… » de la publication.
- Rendu des références au pied de la scène (hors INLINE) et dans la feuille d'audience avec avertissement hors audience.
- Retrait de la porte mention en Mood si pas de scène ; en Story la mention reste une métadonnée de publication (pas un objet de scène).

Rendu : Bande de suggestions horizontale avatars + pseudo ; mode affiché en capsule 10,5 sp sur fond blanc 8 % ; avertissement ambre avec triangle.

Transposition Android : Réutiliser MentionComposer (sdk-core) et le répertoire de contacts ; bande de suggestions = LazyRow au-dessus de l'IME (imePadding).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView+Mentions.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneReferenceFooter.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAudienceReach.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Draft.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Audience.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionComposer.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentMentionDirectory.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentMentionRoster.kt`

### Mode Animé : une frise de temps avec lecture, tête ambre et une piste par objet qu'on déplace ou raccourcit

`scomp-scene-frise-timeline` · Android : **absente** · P1 · effort L

La bascule « Animé » (éclair du rail gauche) rend la scène animée et ouvre la frise : plaque de verre avec transport (lecture / pause rond blanc 36 pt dans une cible 44), libellé « 1.2 s / 6 s », jetons « Entre ici » / « Sort ici » quand une piste est choisie, règle qu'on touche/glisse pour déplacer la tête (scrub), puis une piste par objet (colonne de noms 72 pt + barre) : toucher choisit l'objet ET pose la tête ; glisser la barre la DÉPLACE ; tirer les poignées début/fin (cibles 24 pt) allonge/raccourcit. La tête ambre (#fbbf24) ne capte aucun toucher. Les gestes marchent pendant la lecture, la fenêtre n'est écrite qu'au lâcher (une entrée d'annulation) et rendue à la slide tout de suite. Un objet posé sur une scène animée entre à la tête (au plus tard 80 % de la durée). État vide « Posez un texte ou un sticker : chaque objet devient une piste. » VoiceOver : règle ajustable (pas 0,5 s), actions « Plus tôt / Plus tard » par piste.

Écarts :
- Aucune timeline en composition : le lecteur honore déjà startTime/duration/keyframes (StoryElementVisibility, StoryKeyframeResolver, StoryPlayback) mais le composer ne propose ni transport, ni pistes, ni tête.
- Créer SceneFriseViewModel (project, currentTime, isPlaying, selection, sceneFriseTracks) + ComposerSceneFriseMetrics (dragged, fraction, timeLabel, windowLabel, labelLane 72, handleHit 24, accessibilityStep 0,5) en Kotlin pur.
- UI de la frise : bouton lecture/pause, libellé temps, jetons Entrée/Sortie, règle scrub, pistes avec barre déplaçable et poignées, tête ambre ; aperçu du geste hors projet, commit au lâcher en UNE entrée d'historique.
- Placement des nouveaux objets à la tête sur scène animée (SceneEntryWindow.forNewObject) et bascule Animé (rail gauche) / Temps (rail droit) ; état vide localisé.
- Accessibilité : règle ajustable, actions nommées Plus tôt / Plus tard, pistes sélectionnables (traits isSelected).
- L'éditeur de montage complet (zoom, transitions, images-clés) reste hors périmètre : la scène ne porte que le geste nominal.

Rendu : Plaque de verre teinté, piste = barre arrondie xxs, choisie en brandPrimary sinon blanc 35 %, fond de piste blanc 7 %, règle capsule 14 dp blanc 12 %, tête ambre 2 dp traversant règle+pistes, haptique légère sur sélection/lecture.

Transposition Android : Canvas/Box + pointerInput(detectDragGestures) ; lecture pilotée par un Clock Compose (withFrameNanos) et ExoPlayer pour les médias.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneFrise.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Animated.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeInterpolator.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementVisibility.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`

### Ajouter un son : enregistrer un vocal, emprunter un son de la bibliothèque ou importer un fichier, avec sa place choisie

`scomp-sound-sheet-sources` · Android : **absente** · P1 · effort L

La porte Son ouvre une feuille dont la surface principale est le micro (ordre : enregistrer, emprunter, importer). Le son prend un RÔLE : fond de la slide (se joue sans lecteur visible), contenu de publication (pièce jointe du post avec lecteur) ou puce sur la scène (déplaçable, redimensionnable) ; un son emprunté à la bibliothèque reste crédité à son auteur et ne peut pas devenir une pièce jointe. Poser un fond alors qu'un fond existe ne détruit plus l'occupant : il est rétrogradé en contenu (deux vocaux = deux cartes) ou écarté selon une règle pure (ComposerSoundDisposition.fate). Un appui long sur un son offre « Supprimer le son » et « Mettre sur la scène » (sortir du fond, atterrir à une position libre).

Écarts :
- Aucun son dans le composer de story/scène (le lecteur sait lire backgroundAudio mais rien ne l'écrit) : créer la feuille « Ajouter un son » avec trois sources (enregistrer un vocal, emprunter un son, importer un fichier audio) — l'enregistreur MediaRecorder + VoiceRecordingPill de Feed/Chat est réutilisable.
- Bibliothèque de sons « Emprunter un son » (liste, aperçu, crédit à l'auteur) : endpoint et écran à créer ; son emprunté jamais pièce jointe (message dédié).
- Sélecteur de rôle (Fond de la slide / Contenu de publication / Puce sur la scène) avec détail localisé et libellé dépendant de la destination (scène vs post).
- Règle ComposerSoundDisposition.fate(background, newRole) -> none | demoteToContent | discard, et ComposerSoundPromotion.promotableId/landing pour « Mettre sur la scène ».
- Menu d'appui long partagé par toutes les surfaces (« Supprimer le son », « Mettre sur la scène ») ; retrait du fond effaçant crédit et trace.
- Import fichier audio (OpenDocument audio/*) avec FileImportIntent (media vs sound).

Rendu : Feuille « Place du son » avec trois lignes à titre + détail ; micro mis en avant ; confirmations haptiques légères.

Transposition Android : AVAudioRecorder -> MediaRecorder (AAC/MPEG_4) ; fileImporter(audio) -> OpenDocument(audio/*) ; lecture -> ExoPlayer.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Sound.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundDisposition.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundPromotion.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundActionsMenu.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingFile.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`

### « Mise à jour requise » : un binaire périmé est bloqué avec un seul bouton vers le store

`scomp-upgrade-gate` · Android : **absente** · P1 · effort S

Deux entrées pour un seul état : le 426 vécu (APIClient poste la notification .meeshyUpgradeRequired) et le plancher de version lu au démarrage (GET /app/min-version, route publique, best-effort silencieux : un avion ou un gateway en redéploiement ne bloquent pas une app qui lit hors ligne). L'écran n'a AUCUNE sortie (pas de croix) : titre « Mise à jour requise », message « Cette version de Meeshy ne peut plus échanger avec le serveur. Installez la dernière version pour continuer. », « Version minimale : x », bouton « Mettre à jour » vers le store.

Écarts :
- Aucun en-tête de version (X-App-Version) ni gestion du 426 côté Android : ajouter l'intercepteur OkHttp qui envoie la version et publie un événement UpgradeRequired sur 426.
- Contrôleur de plancher (GET /app/min-version) appelé au démarrage des deux racines, silencieux en cas d'échec, comparaison de versions sémantiques (AppVersionHeader.isBelow).
- Écran bloquant sans bouton de fermeture (BackHandler désactivé) avec bouton « Mettre à jour » vers Google Play (market://details?id=…) et version minimale.
- Condition de la rétrocompatibilité de production : c'est la seule façon d'inviter à mettre à jour avant de retirer un ancien chemin.

Rendu : Plein écran, icône dégradé indigo400->indigo700, titre 24 bold centré, message callout secondaire, version minimale label medium, bouton plein largeur dégradé indigo500->700 rayon lg, ombre indigo douce.

Transposition Android : App Store URL -> Play Store (market:// avec repli https) ; NotificationCenter -> SharedFlow dans une couche réseau partagée.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/UpgradeGateController.swift`
- `apps/ios/Meeshy/Features/Main/Composer/UpgradeGateView.swift`

</details>

### Le langage visuel du composer : plateau sombre à trois teintes, rails en verre, rebond sur chaque contrôle, grands écrans

`scomp-visual-language-plateau` · Android : **absente** · P1 · effort M

Le plateau est le fond permanent du composer, toujours sombre (noir, indigo profond, violet profond — jetons MeeshyColors, mesurés en contraste) pour que la scène soit la seule source de lumière. Tout contrôle touché REBONDIT (s'enfonce puis dépasse avant de se poser ; fondu sous 'réduire les animations'). Géométrie des rails (44 pt, marge 10, gouttière 8, réserve d'historique, largeur laissée à la scène), verre d'une carte-colonne ou boutons séparés, glyphes blancs en relief sur la scène, mise en page 'roomy' sur grand écran (marge 24, panneau 320).

Écarts :
- Définir les trois teintes de plateau comme jetons du thème Meeshy (plateauNoir, indigo950, violet950) et forcer les premiers plans isDark:true dans le composer.
- Style de bouton à rebond (scale pressé + overshoot ressort, fondu quand animations réduites : Settings.Global.ANIMATOR_DURATION_SCALE) appliqué à tout contrôle du composer.
- Constantes de géométrie des rails (railWidth 44, outerMargin 10, gutter 8, floatingEntrySpacing 2, roomyMargin 24, roomyPanelWidth 320) et calcul de la largeur de scène (sceneWidth(usableWidth, railsShown)) ; adaptation tablette/pliable via WindowSizeClass.
- Verre : modificateur adaptiveGlass (blur API 31+, repli translucide) pour plaques/cartes ; relief des glyphes (ombre) sur la scène plein écran.

Rendu : Cibles 44 dp, ressort de rebond ~0,92 d'échelle, rayon xl pour les plaques, relief blanc ; teintes sombres de plateau, texte blanc.

Transposition Android : MeeshyColors.plateau* -> MeeshyPalette ; adaptiveGlass -> Modifier.glass() (RenderEffect) ; iPad -> WindowSizeClass.Expanded.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerPlateau.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerBounceButtonStyle.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailGlass.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailGeometry.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFloatingSocle.swift`

</details>

### Voir et manipuler les sons de premier plan comme pastilles sur la scène

`sct-audio-foreground-chip` · Android : **absente** · P1 · effort M

AudioForegroundChip est la pastille d'un son de premier plan, en deux modes : composer (double tap = sélection, glisser pour déplacer, pincer pour redimensionner, actions d'accessibilité Agrandir/Réduire la puce) et reader (tap = couper/activer cette piste, onde animée en pause quand coupée, état annoncé « Coupé/Actif »). StoryReaderAudioMuteRegistry porte le mute par piste (icône waveform vs waveform.slash) et la commande au mixeur ; StoryReaderPlayheadState la tête de lecture globale. SceneSoundChipLayer pose les pastilles sur le canvas d'une scène avec sa propre horloge (SceneSoundChipClock : appartenance aux fenêtres, pas le temps), selon la même règle SceneAudioStageRule (un son de fond n'y paraît jamais). Android : AudioTrackSurface joue les pistes sans aucune pastille.

Écarts :
- Pastille d'onde/sinusoïde positionnée sur le canvas (x, y, échelle, rotation) avec drag + pinch en mode composer et sélection au double tap
- Mode lecteur : tap = couper/activer la piste, registre de mute par piste propre à la scène, onde figée quand coupée
- Horloge de pastilles par surface (apparition/disparition selon les fenêtres de temps de la piste)
- Règle d'étage : seuls les sons de premier plan ont une pastille
- Actions d'accessibilité Agrandir/Réduire/Couper, libellés localisés
- Commande de mute transmise au mixeur du lecteur

Rendu : Pastille capsule verre avec onde (barres ou sinusoïde) teintée accent, icône barrée quand coupée, taille bornée par pincement.

Transposition Android : Composable avec detectTransformGestures/combinedClickable, Canvas pour l'onde ; état de mute dans le ViewModel du lecteur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SceneSoundChipLayer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Basculer caméra avant/arrière pendant l'enregistrement sans couper la vidéo

`sct-camera-lens-switch-segments` · Android : **absente** · P1 · effort M

CameraInputInstaller construit la nouvelle entrée AVANT de retirer l'ancienne (aperçu jamais noir, position vraie), en UNE reconfiguration : orientation debout, miroir à l'avant, ouverture ×1, exposition neutre, mise au point continue ; une image figée (switchCover) couvre l'aperçu pendant la bascule. En cours de prise, le segment courant se ferme, l'objectif change, un nouveau segment s'ouvre (le chrono ne retombe pas), puis CameraSegmentMerger fusionne les segments en un fichier (CameraSegmentMergePolicy choisit le preset d'export selon les formats, CameraSegmentOrientation uniformise les transformations). Android : absent.

Écarts :
- Bouton de bascule avant/arrière avec état « bascule en cours » et couverture figée de l'aperçu (bitmap du dernier frame)
- Rebind CameraX du bon CameraSelector sans écran noir et sans changer la position publiée tant que le rebind n'a pas réussi
- Bascule pendant une prise : fermer le segment, rebinder, rouvrir un segment ; chrono continu
- Fusion des segments en un seul MP4 (concat Media3 Transformer), choix transcodage/passthrough selon la compatibilité des formats, orientation uniforme des segments
- Réinitialiser zoom ×1, exposition neutre et mise au point continue à l'ouverture de chaque objectif
- Nettoyage des segments intermédiaires et des fichiers temporaires à l'abandon

Rendu : Pastille de bascule dans le chrome du viseur ; transition sans flash noir ; chrono inchangé pendant la bascule.

Transposition Android : CameraX : changer CameraSelector et rebinder les use cases ; segments successifs du Recorder ; concat via Media3 Transformer (EditedMediaItemSequence) ; rotation via effets de présentation.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraInputInstaller.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraSegmentMergePolicy.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraSegmentMerger.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraSegmentOrientation.swift`

</details>

### Voir un écran clair quand la caméra est refusée, et filmer muet si le micro l'est

`sct-camera-permission-audio` · Android : **absente** · P1 · effort S

CameraPermissionPanel remplace le fond noir par un écran de refus (glyphe caméra, « Accès à la caméra refusé », explication, bouton capsule blanche 44 pt « Ouvrir les Réglages ») : sur une carte de scène un fond noir serait indiscernable d'une scène vide. CameraAudioArming décide quand le micro entre dans la session : tout de suite s'il est autorisé et qu'aucune autre musique ne joue, sinon seulement quand le son sert ; un refus du micro n'empêche pas de filmer, avec un toast (camera.microphone.denied). Android : absent côté caméra de story.

Écarts :
- Panneau de refus caméra avec bouton vers les réglages de l'app (ACTION_APPLICATION_DETAILS_SETTINGS) et textes localisés
- Demande CAMERA à l'ouverture du viseur, jamais de prompt tant qu'on n'ouvre pas la caméra
- Micro armé seulement si autorisé et qu'aucune musique ne joue ; sinon demandé au premier besoin de son (ne pas couper la musique d'une autre app avant de filmer)
- Refus du micro : filmer muet et annoncer par un toast, sans bloquer

Rendu : Icône caméra 38 pt fine, titre callout semibold, corps subhead centré, bouton capsule blanche à texte noir ; fond scrim ; grande taille de texte respectée.

Transposition Android : ActivityResultContracts.RequestPermission, AudioManager.isMusicActive pour ne pas préempter la musique, VideoCapture avec audio activé seulement au démarrage de la prise.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraPermissionPanel.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraAudioArming.swift`

</details>

### Zoomer, allumer la torche et fixer la netteté au toucher dans le viseur

`sct-camera-zoom-torch-focus` · Android : **absente** · P1 · effort S

setZoom borne le facteur entre les limites de l'objectif et expose une échelle affichée (ComposerCaptureZoomScale, ×1 affiché au départ, ultra grand-angle inclus) ; setTorch(mode, niveau) règle la torche et son intensité ; CameraFocusControl applique la netteté/exposition au point touché (planifiée par ComposerCaptureFocus, point posé AVANT le mode), surveille le changement de scène pour revenir au continu et lisse la netteté pendant une prise. Les conversions point écran → capteur passent par CameraPreviewFocusPoints. Android : absent.

Écarts :
- Geste pincer pour zoomer et sélecteur d'échelle (0,5×/1×/2×) avec valeur affichée
- Torche à plusieurs niveaux d'intensité avec état actif visible
- Tap pour mettre au point et exposer, anneau de visée animé, retour au mode continu au changement de scène
- Netteté lissée pendant l'enregistrement vidéo
- Gérer les objectifs sans point de mise au point (l'aim est refusé sans erreur)

Rendu : Anneau de mise au point blanc fin qui s'estompe, étiquette de zoom en capsule de verre, torche en pastille jaune quand active.

Transposition Android : CameraX : CameraControl.setZoomRatio / setLinearZoom, enableTorch, startFocusAndMetering avec MeteringPointFactory du PreviewView ; ScaleGestureDetector ou transformable pour le pincer.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraFocusControl.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift`

</details>

### Régler précisément un clip : fenêtre au doigt, début/fin/durée au chiffre, position, volume, fondus, boucle

`sct-clip-inspector` · Android : **absente** · P1 · effort L

ClipInspector est la fiche d'édition d'un clip (sections header, timing, transform, volume, animation, toggles, actions) dont les sections visibles dépendent du type de clip (support transform, ducking, boucle, fondu, keyframes, scission, suppression, bascule fond). Timing : ClipTimingBar (poignée gauche = début, droite = fin, segment central = déplacement, delta commité au relâché) + champs numériques (ClipInspectorNumericField : clavier + pas, saisie liée start/end/durée). Transform : position dans le plan, taille, rotation, plan. Volume avec gain affiché, « Atténuer sous la musique », fondus par puces (ClipFadeChipRow), Boucle, Fond, « Animer au playhead », « Suivre la slide », « Diviser » (à la tête de lecture), nom de piste, Supprimer avec confirmation (« Supprimer ce clip ? »). Android : absent.

Écarts :
- Snapshot de clip (type, fenêtre, volume, mute, fondus, boucle, fond, transform, nom, plan) et sections visibles par type
- Barre de timing tactile (déplacer / rogner début / rogner fin) avec aperçu local clampé et commit au relâché, libellés TalkBack
- Champs numériques saisissables et à pas, brouillons vidés sur undo, saisie liée début/fin/durée
- Section transformation (x, y, échelle, rotation, plan) au chiffre près
- Volume avec gain (jusqu'à 200 %), ducking « Atténuer sous la musique », mute, fondus par puces (off + presets), boucle, bascule fond
- Actions : Animer au playhead, Suivre la slide, Diviser, Supprimer avec confirmation
- Fermeture explicite de l'inspecteur

Rendu : Boutons avec icône + texte (jamais icône seule), puces indigo, barre de timing avec deux poignées et un segment central, lecture début/durée/fin sous la barre.

Transposition Android : Panneau flottant Compose avec Slider, OutlinedTextField numérique, AlertDialog de confirmation ; barre de timing = Canvas + pointerInput(detectDragGestures).

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector+ClipSnapshot.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspectorActionsRow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspectorNumericField.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspectorTransformSection.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipTimingBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipFadeChipRow.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextFade.kt`

### Voir le montage comme un plan : une piste par objet, empilées par plan (arrière, milieu, avant)

`sct-plan2d-layout` · Android : **absente** · P1 · effort M

Plan2DLayout dérive les pistes du runtime du composer (StoryEffects) : texte, sticker, lieu, dessin, média, audio, fond visuel, fond sonore legacy, chacune avec son plan (Plane du contrat v3), sa barre (TrackBar.timed ou ghost = suit la slide) et ses losanges de keyframes (identité du StoryKeyframe d'origine) ; empilées dans l'ordre de l'écran. Plan2DZoom (fit/detail). Plan2DProjectAdapter lit le projet timeline vers StoryEffects sans fabriquer de faux fond. Plan2DReorderResolver traduit un dépôt (id, index parmi toutes les pistes) en nouveau z ET plan de la piste, sans effet si déjà en place. Android : absent.

Écarts :
- Dérivation pure des pistes (texte, sticker, lieu, dessin, média, audio, fonds) avec plan, barre temporelle ou fantôme, marqueurs de keyframes, étiquette glyphe + nom
- Distinguer une piste fantôme (suit la slide) d'une durée fixée pour ne pas figer par accident à l'ouverture
- Zoom fit/detail et mapping temps → x
- Adaptateur projet → effets sans inventer le fond
- Résolveur de dépôt (id, index) → nouveau z + plan, null si sans effet
- Empilement dans l'ordre exact de l'écran

Transposition Android : Fonctions pures Kotlin dans core/model ; modèle de piste immuable.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/Plan2DLayout.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/Plan2DProjectAdapter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/Plan2DReorderResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementVisibility.kt`

### Un média déjà joint est marqué dans la grille et ne se joint pas deux fois

`sct-recent-media-attachment-link` · Android : **absente** · P1 · effort S

RecentMediaAttachmentLink est la règle pure du lien zone d'attachement ↔ grille : une carte pièce → asset, valable pour les seules pièces vivantes (préparation ou prêtes), dont l'ensemble des assets joints se DÉRIVE (rien mémorisé à côté) ; retirer une pièce libère sa tuile. Il règle aussi la présélection du sélecteur système (assets joints puis sélection, plafonnée), la décoche d'un asset joint (retrait de la pièce au retour du sélecteur), les doublons d'un même lot et l'ingestion des éléments sans identifiant ; RecentMediaCachingWindow calcule le delta de pré-chargement des vignettes. RecentMediaAsset porte l'octet d'origine de la photo (jamais une image décodée) ou le fichier vidéo copié. Android : absent.

Écarts :
- Modèle pur attachedAssetIds / linking / fresh / ingestibleIndices / pickerPreselection / deselectedAttachmentIds avec élagage borné par la zone
- Fenêtre de pré-chargement (ids autour de la dernière cellule, delta entrée/sortie)
- Payload d'asset : octets d'origine pour les photos (compression en aval), fichier temporaire pour les vidéos
- Tests unitaires de bascule cochée/décochée et de doublons de lot

Transposition Android : Logique pure Kotlin (core/model) ; identifiant = Uri/_ID MediaStore au lieu de PHAsset.localIdentifier.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/RecentMediaAttachmentLink.swift`

</details>

### Choisir parmi ses derniers médias en un tap, avec sélection multiple ordonnée

`sct-recent-media-grid` · Android : **absente** · P1 · effort M

RecentMediaStrip affiche une grille (40 assets de tête, colonnes adaptées à la largeur, espacement 8) des photos/vidéos récentes avec rafraîchissement en direct (observer de photothèque, accès limité compris) et pré-chargement des vignettes autour de la cellule visible. Tap = ajoute ; appui long = menu Ajouter / Sélectionner / Éditer ; mode sélection avec pastille d'ordre 1-based, boutons Annuler et « Ajouter (n) » ; tuile finale « Ouvrir toute la photothèque ». États : accès refusé / à autoriser (« Autoriser l'accès aux photos », astuce vers les Réglages), cellule en résolution, pièce déjà jointe (voile + coche, refus avec haptique warning), échec de résolution annoncé. RecentMediaCell : durée des vidéos en dégradé, vignette grise + ProgressView. Android : le composer utilise le sélecteur système, l'échelle du composer chat connaît le drapeau hasRecentMediaStrip (faux).

Écarts :
- Requête MediaStore paginée (images + vidéos, tri date) avec ContentObserver pour le rafraîchissement en direct
- Gestion de l'accès partiel Android 14 (READ_MEDIA_VISUAL_USER_SELECTED) et des états refusé / à autoriser avec CTA vers les réglages
- Grille LazyVerticalGrid adaptative avec vignettes en cache, pastille durée vidéo, placeholder gris
- Mode sélection multiple avec numéro d'ordre, barre Annuler / Ajouter (n), retours haptiques light/medium/warning
- Menu d'appui long Ajouter / Sélectionner / Éditer (Éditer seulement si l'hôte câble un éditeur)
- Tuile « Ouvrir toute la photothèque » vers le Photo Picker système
- Annonce d'échec de résolution (singulier/pluriel) et libellés TalkBack (Photo récente, Vidéo récente, Sélectionné, Déjà dans les pièces jointes)

Rendu : Cellules carrées arrondies (MeeshyRadius.smPlus), badge de sélection en haut à droite (cercle vide ou pastille accent avec rang), coche pleine sur voile pour les pièces déjà jointes, dégradé noir bas pour la durée vidéo ; couleur d'accent de la conversation/composer.

Transposition Android : MediaStore + ContentObserver + Coil/Glide thumbnails ; PHPhotoLibraryChangeObserver → ContentObserver ; PHCachingImageManager → préchargement Coil.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/RecentMediaStrip.swift`
- `apps/ios/Meeshy/Features/Main/Components/RecentMediaCell.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`

### Choisir un son dans « Mes sons » ou « Tendances », l'écouter, le renommer ou le retirer

`sct-sound-library-picker` · Android : **absente** · P1 · effort M

SoundLibraryPicker (« Choisir un son ») a deux onglets : Mes sons (sons dont l'appelant est l'auteur, nommables ; sans titre la ligne affiche la date d'envoi, filtrage local) et Tendances (liste publique triée par usage, recherche titre ou pseudo envoyée au serveur avec débounce Combine). Chaque ligne : écouter/arrêter (état « Préparation… » le temps du téléchargement, SoundPreviewPlayer ne rend true que si la lecture a vraiment démarré), Utiliser, compteurs publications/lectures, menu Renommer / Retirer de ma bibliothèque (confirmation « Retirer ce son de votre bibliothèque ? », échec annoncé) et accès à la page du son. Pagination loadMore, états vides (« Aucun son public pour le moment », « Vos sons apparaîtront ici… », recherche sans résultat). Android : seul le modèle StoryBackgroundAudioEntry existe.

Écarts :
- Écran de sélection avec onglets Mes sons / Tendances, recherche (débounce, serveur côté Tendances, locale côté Mes sons), bouton d'effacement
- Lecture d'aperçu (téléchargement puis lecture, état « Préparation… », arrêt automatique en fin de piste sans effacer la sélection courante)
- Renommer (alerte avec titre) et retirer avec confirmation, échec « Le son n'a pas pu être retiré. Réessayez. »
- Pagination infinie, états vide / recherche vide, titre affiché (date d'envoi si sans titre, « Son original »)
- Endpoints sons (liste mes sons, tendances, renommer, retirer, pagination) dans core/network et un SoundRepository
- Libellés TalkBack de résumé de ligne et du bouton lecture

Rendu : Segmented control en tête, champ de recherche capsule, lignes avec bouton lecture rond à gauche, compteurs en secondaire ; accent indigo.

Transposition Android : ModalBottomSheet + LazyColumn + ExoPlayer pour l'aperçu ; recherche avec Flow.debounce ; Retrofit pour les routes sons ; confirmation par AlertDialog.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundLibraryPicker.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundLibraryPickerModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundPreviewPlayer.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Gérer chaque piste audio d'une slide : lecture, forme d'onde, fond ou premier plan, volume, suppression

`sct-story-audio-cell` · Android : **absente** · P1 · effort M

StoryAudioCell est la cellule du panneau Son : bouton lecture/pause local (AudioPlaybackManager), forme d'onde de 40 barres (cache WaveformCache), durée mm:ss, bascule fond / premier plan (haptique light), bouton couper/activer le son de la piste, curseur de volume 0–1 (libellé « Volume »), bouton supprimer (haptique medium). Libellés d'accessibilité distincts par état (Lire/Pause, Fond/Premier plan, Couper/Activer le son). Android : absent (le composer ne gère aucun audio).

Écarts :
- Modèle d'objets audio dans le deck du composer (StoryAudioPlayerObject : source, volume, fond/premier plan, mute, fenêtre)
- Cellule : lecture/pause, onde de 40 barres échantillonnée et mise en cache, durée, bascule fond/premier plan, mute, volume, suppression
- Entrées audio : import de fichier, enregistrement vocal, bibliothèque de sons
- Un seul fond sonore à la fois, plusieurs pistes de premier plan ; état persistant dans le brouillon
- Libellés TalkBack par état

Rendu : Cellule verre, lecture à gauche, onde au centre teintée accent, durée alignée à droite, actions en icônes 44 pt.

Transposition Android : Row Compose avec Slider Material3, ExoPlayer pour l'aperçu local, analyse d'onde via MediaCodec/AudioRecord en tâche de fond, cache disque.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryAudioCell.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Écouter plusieurs pistes audio à la seconde exacte pendant l'aperçu du montage

`sct-timeline-audio-mixer` · Android : **absente** · P1 · effort M

AudioMixer (AudioMixerProviding) configure tous les clips audio de la timeline (nœuds AVAudioPlayerNode), puis les démarre depuis un temps de timeline à une heure hôte commune (play(from:atHostTime:)) pour que chaque clip tombe à sa position exacte et non à l'heure de démarrage du moteur ; pause, seek, volume par piste (intendedVolume), mute global, prepareAllNodes, teardown/shutdown idempotents. TimelineAudioWindow convertit rognage + temps écoulé en position/longueur de frames, partagée avec le lecteur. Android : absent.

Écarts :
- Mixeur multi-pistes (configure(audios, urls), play(from, atHostTime), pause, seek, volume par piste, mute global)
- Chaque clip démarre à son startTime de timeline, aligné sur l'ancre commune avec la vidéo
- Fenêtre de frames d'un clip rogné et entrée en cours de piste (aucune lecture si l'ouverture est après la fin)
- Teardown idempotent propriétaire, préchauffage des nœuds

Transposition Android : Media3 : un ExoPlayer par piste synchronisé sur un clock partagé, ou AudioTrack + AudioMixer maison ; AudioTrack.getTimestamp comme ancre ; Composition/Transformer pour l'export.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Audio/TimelineAudioWindow.swift`

</details>

### Régler un clip au clavier ou au lecteur d'écran, sans glisser

`sct-timeline-clip-bar-accessibility` · Android : **absente** · P1 · effort S

ClipBarAccessibility expose à VoiceOver/TalkBack les actions d'une barre de clip (Commencer plus tard / plus tôt, Finir plus tard / plus tôt, Inspecter, Couper/Rétablir le son), l'ajustement par incrément qui déplace le clip d'un pas, et un libellé composé (type, nom, fenêtre). ClipBarCallbacks relaie chaque action vers le même chemin que le geste. Les poignées de rognage ont aussi leur libellé et leur ajustement. Android : absent.

Écarts :
- Actions personnalisées TalkBack sur chaque barre (début ±, fin ±, inspecter, mute)
- Ajustement par incrément (semantics progress / scrollBy) qui déplace d'un pas
- Libellé composé et description de la fenêtre pour chaque clip
- Même chemin de code que les gestes (pas de logique dupliquée)

Transposition Android : Modifier.semantics { customActions = listOf(CustomAccessibilityAction(...)); stateDescription } et AccessibilityAction pour l'ajustement.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/ClipBarAccessibility.swift`

</details>

### Sélectionner, déplacer, rogner et régler un clip de la timeline, annulable

`sct-timeline-clip-editing` · Android : **absente** · P1 · effort L

TimelineViewModel est le chef d'orchestre : sélection (surlignage au tap) distincte de l'inspection (fiche ouverte au double tap, inspectedClipId ⇒ selectedClipId), glisser un clip avec aimantation magnétique (haptique light à l'accroche, drift évité par originalStartTime), démarrer/terminer/annuler un drag, trim début/fin avec limite de durée native du média, nudge, début/fin/durée au chiffre (borné par ClipWindowResolver), transformation (position, échelle, rotation, plan), volume, mute, fondus, boucle, bascule fond/premier plan, ajout média/audio, extension de durée de slide (+10 s), recalcul de la durée de slide avec annonce, undo/redo, scrub, reconfiguration du moteur à la volée, callbacks vers le canvas à chaque mouvement de tête. Android : seule la durée de slide épinglée et les cycles début/durée d'un texte existent.

Écarts :
- ViewModel de timeline : projet, sélection vs inspection (double tap), drag actif avec type d'aimant (tête/bord/keyframe/grille)
- Drag, trim et nudge via ClipWindowResolver, coalescés dans la pile de commandes
- Clip permanent (sans durée stockée) : matérialiser sa fenêtre effective pour que les poignées répondent
- Volume, mute, fondus, boucle, fond/premier plan, transformation par type de clip (vidéo, image, audio, texte, sticker, lieu)
- Recalcul automatique de la durée de slide avec bannière, extension +10 s
- Ajout de média/audio, split à la tête de lecture, suppression avec confirmation
- Callbacks vers le canvas (tête, lecture/pause, fin naturelle), bascule undo/redo

Rendu : Haptique light à chaque accroche d'aimant ; drag à deux axes une fois armé (vertical = empilement, horizontal = durée).

Transposition Android : ViewModel Hilt avec StateFlow immuable (projet, sélection, drag) ; HapticFeedback au snap.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryDurationPin.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySlideDuration.kt`

### Ouvrir la timeline du montage : plan, tête de lecture, échos de boucle, jonctions et bandeaux d'état

`sct-timeline-host` · Android : **absente** · P1 · effort L

StoryTimelineHost est le conteneur racine de la feuille Timeline : dessine le plan (vertical = empilement par plan, horizontal = durée), la tête de lecture, les échos d'un fond qui boucle (LoopEcho, tuilage), les jonctions de transition, le scroller avec armement du geste (appui court puis glisser = déplacer un clip, le glissement nu appartient au scroller). TimelineBanner annonce « Durée recalculée : x → y » (2,5 s) et « Story en attente — elle partira au retour du réseau » (4 s ; l'offline prime). TimelineEmptyState : « Aucune piste / Ajoute une vidéo, une photo, du son ou du texte depuis la barre du composer. » TimelineMetrics fixe la hauteur de lane (52). StoryTimelineView (conteneur historique à 3 pistes + déployer) n'est plus l'entrée de production. Android : absent.

Écarts :
- Écran Timeline (panneau 392 pt, ouvert depuis l'outil Timeline) avec transport, barre d'opérations, règle, plan et inspecteur flottant
- Tête de lecture déplaçable, échos d'un fond bouclé, jonctions de transition cliquables
- Geste de déplacement armé (appui court puis glisser) à deux axes ; scroll horizontal préservé
- Bandeaux d'annonce (durée recalculée, en attente hors ligne) et état vide « Aucune piste »
- Hauteur de lane commune (52) et libellé d'accessibilité « Timeline »
- Teintes de pistes : vidéo 6366F1, image 8B5CF6, audio 818CF8, texte A5B4FC, sticker C7D2FE

Rendu : Lanes de 52 pt, colonne d'étiquette collante de 72 pt, teintes indigo par type, bandeau capsule en haut, état vide centré avec icône.

Transposition Android : Écran Compose (ModalBottomSheet ou panneau) avec Layout personnalisé et LazyColumn de lanes ; HorizontalScroll synchronisé avec la règle.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineHost.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineBanner.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineEmptyState.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/TimelineMetrics.swift`

</details>

### Toucher un clip, une image-clé ou une transition ouvre le bon inspecteur flottant

`sct-timeline-inspector-host` · Android : **absente** · P1 · effort M

TimelineInspectorHost résout la sélection partagée (selectedClipId, bus commun clip / keyframe / transition) en exactement UN inspecteur par priorité clip → keyframe → transition, construit les snapshots (clip vidéo/image/audio/texte/sticker/lieu, propriétaire d'une keyframe audio, transition), mappe les easings, résout le mute par piste (global vs piste audio), vérifie l'existence d'un fond audio, et pose l'inspecteur en overlay flottant (InspectorPresentation.popover, ou sheet selon l'hôte). La sélection par identité, pas par valeurs : un tap ouvre l'éditeur, plus d'impasse. Android : absent.

Écarts :
- Routage sélection → un seul inspecteur (clip > keyframe > transition) avec snapshots par type de clip
- Résolution du propriétaire d'une keyframe et de la couche audio (mute global vs piste)
- Présentation flottante (popover) ou en feuille selon l'hôte, fermeture explicite
- Mapper les easings de l'inspecteur vers StoryEasing (spring → easeInOut)
- Volume points et existence d'un fond audio pour le ducking

Transposition Android : Box overlay Compose ou Popup ancrée à la piste ; sealed interface SelectionKind.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift`

</details>

### Lire le montage multi-clips en aperçu, vidéo et audio synchronisés à la milliseconde

`sct-timeline-playback-engine` · Android : **absente** · P1 · effort L

StoryTimelineEngine configure un projet (assets vidéo avec retry, images, sources via TimelineMediaSource) et le joue : play/pause/toggle/seek (précis ou tolérant, fins de seek invalidées par un geste postérieur), arrêt, mode, export avec presets 720p/1080p/4K. TimelinePlaybackSync fixe UNE ancre en temps hôte partagée par la vidéo (setRate atHostTime), l'audio et l'horloge interne des slides sans vidéo (driveClock), supprimant le décalage fixe audible (#9702). ActiveClipResolver n'émet que les CHANGEMENTS de clip actif pour que l'inspecteur suive la lecture. La session audio et sa taille de tampon sont restituées au shutdown. Erreurs typées (assetLoadFailed, audioEngineUnavailable, configurationFailed, noProjectConfigured). Android : absent.

Écarts :
- Moteur d'aperçu (interface TimelineEngineProviding) : configure(projet, URLs, images), play/pause/seek/stop/toggle, temps courant publié à 60 Hz
- Ancre de lecture commune vidéo + audio + horloge interne pour les slides sans vidéo (marge de démarrage, saturation d'overflow)
- Seek précis vs tolérant ; invalider les fins de seek dépassées
- Clip actif résolu à chaque tick, changements seuls signalés
- Chargement d'assets avec nouvelle tentative, erreurs typées, export avec presets de qualité
- Gérer la session audio (focus, tampon) et libérer à shutdown idempotent
- Instrumentation de durée des intervalles chauds (trace)

Rendu : Aucun visuel propre : alimente playhead, canvas et inspecteur.

Transposition Android : Media3 : ExoPlayer/CompositionPlayer pour la vidéo, Transformer pour l'export, AudioFocus pour la session ; horloge = SystemClock.elapsedRealtimeNanos / AudioTrack timestamp comme ancre.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelinePlaybackSync.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/ActiveClipResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`

### La timeline reste fluide : seule la tête de lecture se redessine à chaque tick

`sct-timeline-render-perf` · Android : **absente** · P1 · effort S

PlayheadClock isole la tête de lecture dans son propre objet observé : un tick du moteur (60 par seconde) ne publie que sur lui, que seules les feuilles qui DESSINENT la tête observent (PlayheadTimeReader), au lieu de réévaluer transport, plan, inspecteur, frise et bandeau ; un temps identique ne republie pas. KeyedMemo mémoïse à UNE entrée par révision de projet (révisions uniques pour tout le processus) les résolveurs hoistés de la timeline. TimelineSignposter instrumente les intervalles chauds du moteur (OSSignposter, agrégés via MetricKit). Android : absent.

Écarts :
- Horloge de tête dans un State/Flow séparé lu uniquement par les composables feuilles qui dessinent le curseur et le libellé de temps
- Pas de republication d'un temps identique (scrub qui retombe sur la même image)
- Mémoïsation des résolveurs de pistes/jonctions/marqueurs par révision de projet unique
- Traces de performance sur les intervalles chauds (android.os.Trace / Perfetto) et agrégation JankStats
- Mesurer 60/120 fps au scroll et au scrub sur appareil réel

Rendu : Aucun visuel ; objectif fluidité 60/120 fps.

Transposition Android : derivedStateOf + remember(revision), State lu en lambda (deferred read) pour le curseur ; android.os.Trace.beginSection ; androidx.metrics JankStats.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/KeyedMemo.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/PlayheadClock.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift`

</details>

### Parcourir le temps au doigt : règle, scrub, pincer pour zoomer, la poignée de défilement

`sct-timeline-scrub-scroll` · Android : **absente** · P1 · effort M

TimelineScrubArea porte UN scroller horizontal pour la règle et les lanes (ticks, clips et tête partagent la même géométrie temps→x), la tête déplaçable sur toute la hauteur, le zoom par pincer (MagnificationGesture, ancre conservée) et le suivi automatique de la tête pendant la lecture (TimelineScrollAnchor : ancre invisible à décalage dans le LAYOUT). TimelineScrollBar est la poignée sous les pistes : largeur = part visible, position = où l'on est, glissable, incrémentale pour l'accessibilité (« Défilement de la timeline »). TimelineScrollMetrics en calcule la géométrie (largeur minimale du curseur, cas limites). Android : absent.

Écarts :
- Règle graduée et pistes dans un même scroller, tête déplaçable (scrub) avec libellé de temps
- Zoom au pincer 0,05–8 avec ancre conservée et boutons +/− du transport
- Défilement automatique qui suit la tête pendant la lecture
- Poignée de défilement (largeur = part visible, glissable, largeur minimale, actions d'accessibilité incrément/décrément)
- Largeur de lane selon durée totale et zoom ; cas limites (contenu plus court que la fenêtre)

Rendu : Poignée fine sous les pistes, curseur ≥ largeur tactile minimale, tête verticale accent sur toute la hauteur.

Transposition Android : Modifier.horizontalScroll + ScrollState, detectTransformGestures pour le zoom, animateScrollTo pour suivre la tête ; Modifier.semantics { scrollBy } pour la barre.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrollBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrollMetrics.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrollAnchor.swift`

</details>

### Déplacer un clip avec aimantation sur la tête de lecture, les bords et la grille, sans jamais produire un état invalide

`sct-timeline-snap-and-window` · Android : **absente** · P1 · effort M

ClipWindowResolver est la SOURCE UNIQUE des bornes d'une fenêtre (start ≥ 0, durée ≥ minimum, fin ≤ maximum) pour les trois affordances (barre tactile, champs de timing, poignées) avec quatre éditions (move, setStart, setEnd, setDuration) ; aucune borne sur la durée de slide, c'est le clip qui l'étend. SnapEngine choisit le meilleur candidat dans la tolérance selon une hiérarchie de priorité (tête de lecture 70 > bords de clips 60 > keyframe 50 > grille majeure 40 > mineure 30 > début/fin de slide 20). TimelineGeometry porte le contrat px/seconde et plafonne la tolérance d'aimantation en secondes pour ne pas happer à tout zoom. Android : seul un snap SPATIAL de guides sur le canvas existe.

Écarts :
- Résolveur de fenêtre pur (move/setStart/setEnd/setDuration) partagé par toutes les affordances de timing
- Moteur d'aimantation temporelle avec hiérarchie de priorité et tolérance bornée en secondes (indépendante du zoom)
- Géométrie temps ↔ x (px/seconde, zoom) et durée effective de clip
- Candidats magnétiques (bords des autres clips, tête de lecture, keyframes, grille majeure/mineure, début/fin de slide)
- Tests unitaires purs en Kotlin (types valeur)

Transposition Android : Objets Kotlin purs dans core/model (pas de dépendance Android).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/ClipWindowResolver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySnapResolver.kt`

### Annuler et rétablir chaque geste du montage, avec fusion des déplacements voisins

`sct-timeline-undo-redo-commands` · Android : **absente** · P1 · effort M

CommandStack est une pile linéaire undo/redo à plafond FIFO et coalescence temporelle : une commande de même nature et même cible dans la fenêtre de temps remplace la précédente (moveClip, trimClip, moveKeyframe), si bien qu'un glissé continu n'est qu'une étape. La pile est persistable (CommandStackSnapshot, versionnée par forme JSON, champs optionnels pour la compatibilité) à côté du brouillon dans {draft}.commands.json. Android : le modèle précise que la machinerie EditCommand n'est volontairement pas portée.

Écarts :
- Commandes d'édition inversibles (ajouter/déplacer/rogner/supprimer clip, keyframes, transitions) et pile avec plafond FIFO
- Coalescence d'un même type/cible dans la fenêtre de temps
- Persistance du snapshot de la pile avec le brouillon et restauration à la reprise
- Callback de changement pour les boutons annuler/rétablir désactivés
- Tests de fusion et d'éviction

Transposition Android : Sealed interface EditCommand + ArrayDeque ; sérialisation kotlinx pour le snapshot dans le brouillon.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Lire et manipuler les clips sur leur piste : filmstrip, onde, texte, poignées de rognage, boucle

`sct-track-clip-bars` · Android : **absente** · P1 · effort M

TrackBarView est la ligne d'une piste : étiquette collante à gauche (72 pt, glyphe + libellé, teinte indigo pour le Fond) et lane défilante. VideoClipBar (teinte verte, filmstrip extrait en asynchrone et mis en cache, dégradés de fondus, poignées, mute inline), AudioClipBar (WaveformStrip partagée, mute inline) et TextClipBar (extrait du texte) partagent les gestes : tap = sélectionner, double tap = ouvrir la fiche, glisser (distance minimale 4, haute priorité) = déplacer avec commit annulable au relâché. ClipTrimHandles : poignées de rognage affichées à la sélection, deltas incrémentaux ancrés au geste (jamais la translation cumulée). LoopRepeatOverlay dessine les échos décoratifs d'un fond qui boucle jusqu'à la durée de slide. Android : absent.

Écarts :
- Ligne de piste : étiquette collante icône + libellé, durée formatée, variante Fond
- Barre vidéo : filmstrip extrait en asynchrone (cache), fondus en dégradés, poignées de rognage, mute inline
- Barre audio : onde (mesure décibels ou champ publié linéaire), durée, mute inline ; barre texte : extrait
- Gestes : tap sélectionne, double tap ouvre la fiche, glisser déplace (commit au relâché, deltas incrémentaux), appui long armé
- Poignées de rognage visibles à la sélection (hors clip verrouillé), libellés TalkBack
- Échos de boucle décoratifs d'un fond jusqu'à la durée de slide
- Barres comparables (Equatable) pour limiter les recompositions

Rendu : Lane de 52 pt ; vidéo teinte verte, audio indigo, texte indigo clair ; poignées fines aux extrémités à la sélection, fondus en dégradés.

Transposition Android : Composables stables (@Immutable/@Stable) + Canvas pour l'onde et le filmstrip (Coil/MediaMetadataRetriever) ; pointerInput(detectDragGestures) en haute priorité.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/ClipTrimHandles.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/WaveformStrip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/LoopRepeatOverlay.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`

### J'ajoute un son à ma story : enregistrement vocal, fichier ou morceau de la bibliothèque, au premier plan ou en fond

`stc2-audio-objects-voice` · Android : **absente** · P1 · effort M

Les sons sont des StoryAudioPlayerObject (rôle premier plan ou fond, volume, rognage, boucle) posés par enregistrement vocal (AudioRecorderSheet avec puces Fichiers et Bibliothèque), fichier, collage ou morceau EMPRUNTÉ à la bibliothèque (sans postMediaId, avec titre et crédit) ; l'éditeur audio rogne et transcrit ; StoryAudioIdentity montre note + onde pour un enregistrement, titre + crédit pour un morceau de bibliothèque.

Écarts :
- Aucun son dans le composer Android (le lecteur ne fait que jouer les pistes) : créer des objets audio avec rôle premier plan/fond, volume, rognage, boucle (plafond 5).
- Feuille d'enregistrement vocal (pastille de niveau, minuteur) avec puces « Fichiers » (SAF audio/*) et « Bibliothèque de sons ».
- Éditeur audio (rognage + transcription locale) dont les transcriptions sont rattachées à la slide ; analyse de la forme d'onde et durée à la pose.
- Sons empruntés : objet sans postMediaId, avec mediaURL de bibliothèque, titre et crédit, résolu par l'adresse unique partagée lecture/export.

Rendu : Piste audio : capsule avec note musicale et onde (enregistrement) ou titre + crédit (bibliothèque), bouton couper/activer.

Transposition Android : AVAudioRecorder -> MediaRecorder / AudioRecord (AAC m4a) ; AVAudioEngine waveform -> amplitude metering existant (AudioLevelMetering).

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioIdentity.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Voice.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+MediaObjects.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+PastedAudio.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Sur une page blanche, je démarre en un geste : écrire, prendre une photo/vidéo, reprendre ma dernière photo ou coller

`stc2-blank-canvas-starters` · Android : **absente** · P1 · effort M

La page blanche ne réserve plus de grille de tuiles : l'indice « Touchez pour écrire » (tapable), une capsule « Caméra », la vignette de la dernière photo de la pellicule (ou à défaut une capsule « Galerie » qui demande l'accès au tap, avec repli sur le sélecteur système), et une capsule « Coller » sur une seconde rangée centrée disparaissent au premier contenu.

Écarts :
- Créer l'état vide du composer : indice « Touchez pour écrire », capsules Caméra / Galerie (dernière photo) / Coller, masquées dès qu'un objet existe.
- Capture caméra plein écran (CameraX) injectée par l'app, retournant photo ou vidéo posée comme média de premier plan ; capsule absente sans fournisseur ou au plafond média.
- Dernière photo via MediaStore (accès partiel Android 14) sans demande de permission à l'ouverture ; au tap, accès puis insertion, sinon Photo Picker.
- Gestes : swipe bas = éditeur texte, appui long 450 ms = caméra (annulé au-delà de 12 dp de mouvement, priorité sur le swipe), avec haptique.

Rendu : Capsules centrées sur le canvas, capsule Coller seule sur la rangée du dessous (Caméra et Galerie restent au centre).

Transposition Android : Caméra app-side AVCaptureSession -> CameraX (Preview + ImageCapture/VideoCapture).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerBlankCanvasStarters.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasStarterEnvironment.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`

### Je nomme quelqu'un dans ma story sans l'écrire : badge, note « Avec… », notification silencieuse, ou dans le texte

`stc2-reference-modes` · Android : **absente** · P1 · effort M

Quatre modes de référence (inline, pinned, note, silent) : tap sur une suggestion = inline (le serveur relit le @handle), appui long = menu de mode dont tout choix autre qu'inline retire le @handle du texte. PINNED pose un badge texte avec referenceUserId (uniquement quand le contenu a un canevas, donc la story).

Écarts :
- Modèle ComposerReference / PostReference (username, userId, mode inline|pinned|note|silent) et déclaration au serveur dans la requête de publication.
- Menu de mode (Insérer dans le texte, Référencer, Poser un badge, Notifier seulement) en appui long sur une suggestion et au tap d'une pastille déjà posée.
- Rangée compacte de pastilles sous la barre d'outils (👤 N personnes + pastille de mode) permettant de retirer une référence silencieuse.
- Feuille « Mentionner » avec recherche, section « Déjà référencées », bouton Annuler qui restitue l'état d'ouverture, et mention de visibilité hors audience.

Rendu : Pastilles capsule 36 dp mini (symbole de mode + @pseudo, secondaire pour silent), sections au titre 12 sp semibold secondaire, en-tête de feuille explicite Annuler/OK (pas de barre de navigation système).

Transposition Android : ContextMenu -> DropdownMenu sur combinedClickable ; Menu SwiftUI -> ExposedDropdown/Popup ; feuille -> ModalBottomSheet.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceChipRow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceComposerEntries.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceModeMenu.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReferenceNoteRow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+References.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Edit.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestions.swift`

</details>

### Dans le fil, une carte de story cadre le contenu utile de la scène au lieu d'un 9:16 plein de vide

`stc2-scene-feed-framing` · Android : **absente** · P1 · effort M

SceneFraming cadre la carte de fil sur la ZONE de contenu d'une scène (image/vidéo seule ou fond uni, plafond de hauteur 1,4 x largeur, côté mini 0,42) ; SceneFocusFrame agrandit/décale/rogne sans toucher au contenu ; SceneCardHeightCap plafonne sans rogner ; SceneBackdropView peint le hors-champ (noir, thumbHash étiré, couleur dominante).

Écarts :
- Porter SceneFraming (focus, cardAspect, backgroundAspect, presentedSize, cardFocus, placement) en Kotlin pur testé.
- Composable de cadre de focus : scale + offset + clip d'une scène 9:16 entière vers une zone, sans modifier le contenu.
- Plafond de hauteur de carte sans rognage (bandes latérales) via un layout personnalisé.
- Peintre du hors-champ à trois fonds (noir, thumbHash étiré, couleur dominante) identique pour carte et immersif.

Rendu : Carte de fil au rapport naturel du contenu, plafond de hauteur 1,4 x largeur, bandes latérales discrètes (thumbHash flouté), aucune réserve de hauteur inutile.

Transposition Android : SceneV3/ObjectV3 existent côté Android (CanvasV3.kt) : réutiliser le modèle.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneFraming.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneFocusFrame.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneCardHeightCap.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneBackdropView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`

### Chaque slide et brouillon a une vignette fidèle (fond, texte, médias, dessin, stickers), noire si la scène est vide, légère en mémoire

`stc2-scene-thumbnails-composite` · Android : **absente** · P1 · effort M

SceneThumbnailContent.isBlank donne une vignette noire mais présente pour une scène vide ; SceneThumbnailStore (empreinte, 40 entrées/4 Mo) ne recalcule que ce qui change ; SceneImageDownsampling ne décode jamais au-delà de 2048 px (taille publiée) ; StorySlideRenderer compose à ~100x178 tous les calques pour le thumbHash (~28 octets).

Écarts :
- Rendu composite d'une slide en bitmap basse résolution (fond, texte stylé, médias, dessin, stickers, lieux, marqueur audio) pour thumbHash et vignettes (Canvas Android hors écran).
- Calcul et encodage thumbHash du composite à la publication/au premier enregistrement de brouillon, jamais bloquant.
- Vignette noire (mais présente) pour une scène vide ; empreinte de vignette (slide, fond, images) pour ne recalculer que sur changement.
- Décodage borné : jamais au-delà de 2048 px de grand côté ni au-delà de la tuile affichée ; fichier source jamais réécrit.

Rendu : Vignettes 9:16, coins arrondis, marqueur audio discret dans la tuile, index de slide ; fond thumbHash flouté en attendant le média plein.

Transposition Android : UIGraphicsImageRenderer -> Bitmap + android.graphics.Canvas ; ImageIO downsample -> ImageDecoder/Coil ; NSCache -> LruCache.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneThumbnail.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneImageDownsampling.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`

### Je retrouve mes sons et les sons tendance, les renomme, les retire de ma bibliothèque et vois les publications qui les utilisent

`stc2-sound-library-service` · Android : **absente** · P1 · effort M

SoundLibraryService expose « Mes sons » (GET /sounds/mine paginé par curseur, recherche côté client) et « Tendances » (GET /stories/audio trié par usageCount, recherche titre OU pseudo), rename (titre vide = retirer), posts d'un son (« Page du son ») et remove (DELETE /sounds/:id, #9848, sans casser les publications existantes).

Écarts :
- Endpoints Retrofit : GET /sounds/mine (curseur Date), GET /stories/audio?q&limit, PATCH /sounds/:id {title}, GET des posts d'un son (curseur), DELETE /sounds/:id.
- Modèles APISound, SoundPage {sounds,nextCursor}, SoundPostPage, SoundRemoval {id,deletedAt,postCount} avec décodage tolérant.
- Recherche « Mes sons » filtrée localement ; recherche « Tendances » côté serveur (titre ou pseudo uploadeur).
- Renommage avec titre vide autorisé (retire le titre) ; retrait de bibliothèque sans effet sur les publications qui l'utilisent déjà.

Rendu : Liste de sons avec titre (ou « Sans titre »), uploadeur, usageCount et bouton de lecture d'aperçu.

Transposition Android : Protocol Swift SoundLibraryServiceProviding -> interface Kotlin + implémentation Retrofit/Repository Hilt ; Date de curseur -> Instant ISO-8601.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/SoundLibraryService.swift`

</details>

### Ma timeline reste synchronisée avec ma slide : je l'ouvre, l'édite et tout est sauvegardé même si je publie sans la fermer

`stc2-timeline-composer-binding` · Android : **absente** · P1 · effort M

StoryComposerViewModel+Timeline crée à la demande le TimelineViewModel (lazy, jamais instancié si la timeline n'est jamais ouverte), charge la slide courante dans le projet de timeline (loadCurrentSlideIntoTimeline, fond image synthétique en clip) et la commit en effets (commitTimelineToCurrentSlide, résolution des URLs média/audio, timelineDuration, clipTransitions) à la fermeture de la feuille.

Écarts :
- Projet de timeline dérivé de la slide (pistes média/texte/audio, fond synthétique, durée, transitions de clips) et écriture retour dans les effets de la slide.
- ViewModel de timeline instancié paresseusement et arrêté proprement à la fermeture ; état playback (temps, lecture, zoom, défilement, mute) exposé.
- Flush de la timeline OUVERTE avant autosave/publication (les éditions vivent dans le projet tant que la feuille n'est pas fermée).
- Persistance de l'historique de commandes de la timeline avec le brouillon et restauration à la reprise.

Rendu : Timeline présentée inline dans la bande basse comme les autres outils (le canvas se carde au-dessus).

Transposition Android : TimelineViewModel lazy -> by lazy dans le ViewModel Hilt ; feuille de timeline inline dans la bande (pas une sheet système).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Timeline.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Model/TimelineEngineMode.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Je règle ma timeline en un plan unique : barres de pistes empilées par plan, trim aux bords, déplacement dans le temps et réordonnancement

`stc2-timeline-plan2d-tracks` · Android : **absente** · P1 · effort M

Plan2DView dessine en un seul passe Canvas les barres de pistes empilées par plan, fantômes pointillés, losanges de keyframes et cadenas, avec colonne d'étiquettes collante 84 pt et zoom fit/detail. Tap = sélection ; trim par poignées ; appui court puis glisser arme la piste et élit un axe (vertical = ordre, horizontal = temps) avec scroller verrouillé ; actions d'accessibilité début/fin, monter/descendre.

Écarts :
- Aucune timeline côté Android (seuls des cycles de début/durée par texte existent) : créer le plan 2D en un passe Canvas Compose avec pistes empilées par plan (fg/contenu/fond).
- Colonne d'étiquettes collante 84 dp, zoom fit/detail en scroll horizontal, couleur par plan (indigo300/500/700 en sombre, indigo500/600/800 en clair).
- Gestes : tap piste/keyframe (bord prioritaire sur le losange, rayon 16 dp), trim sur piste sélectionnée, armement par appui court ou glissement horizontal franc, un seul axe élu.
- Verrouiller le scroll pendant un trim ou un déplacement armé ; rendre la main au scroller sur glissement vertical nu.

Rendu : Barres arrondies avec vignettes de lane, étiquette collante à gauche, cadre pointillé pour fantôme, losange 16 dp de rayon de tap, barre sélectionnée avec poignées de bord.

Transposition Android : SwiftUI Canvas -> Compose Canvas / DrawScope ; DragGesture(minimumDistance 0) -> pointerInput + awaitPointerEventScope.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView+Accessibility.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`

### Je balaie la règle et la tête de lecture pour me placer à l'image près, avec repères d'aimantation et losanges de keyframes

`stc2-timeline-ruler-playhead` · Android : **absente** · P1 · effort M

RulerView gradue le temps en paliers ronds choisis selon le zoom (libellés sans chevauchement) et scrub par tap/glissement ; PlayheadView suit currentTime depuis un ancrage de drag ; SnapGuideView trace le repère d'aimantation magenta EC4899 ; KeyframeMarker* projette les keyframes des médias et textes en losanges (tap = sélection, appui long = édition, drag = décalage).

Écarts :
- Règle graduée avec échelle de paliers ronds sélectionnée selon le zoom et libellés sans chevauchement (écart mini = 2 x demi-largeur + 8).
- Scrub par tap/glissement sur la règle et la tête de lecture : seek rapide (tolérance ~50 ms) pendant le geste, seek précis à l'image au relâchement (évite le gel de décompression GOP).
- Tête de lecture : x calculé depuis l'ancrage de début de drag (pas de jitter), ajustement VoiceOver/TalkBack d'une frame, couleur selon thème.
- Repère d'aimantation magenta EC4899 avec libellé du point d'accroche, sans animation si l'animation système est réduite.

Rendu : Règle fine avec ticks et libellés 9-10 sp, tête de lecture ligne + triangle, repère d'aimantation magenta (exception de design vs indigo de marque), losanges 8-10 dp.

Transposition Android : DragGesture -> detectDragGestures ; ViewThatFits/Equatable -> remember + @Stable params ; formatTick -> formatage ms/s/min localisé.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerResolver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/LaneKeyframeOverlays.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ScrubHitResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`

### Je pilote la lecture de ma timeline : lecture/pause, annuler/rétablir, aimant, zoom, son, +10 s et export

`stc2-timeline-transport-ops` · Android : **absente** · P1 · effort M

TransportBar (API de primitives pour éviter les réévaluations) porte le bouton lecture, enregistrer en vidéo (juste après la lecture), un readout courant/durée observé par le seul readout (#9874), annuler/rétablir compacts, chip d'aimantation avec état annoncé, zoom - / + / reset (libellé %) et mute.

Écarts :
- Barre de transport : lecture/pause, mute, zoom -/+/reset avec libellé %, annuler/rétablir, chip aimant (point vert actif), readout temps courant/durée compact.
- Adaptation à la largeur (équivalent ViewThatFits) : retirer d'abord les libellés informatifs (temps puis zoom %) jamais les boutons fonctionnels, jusqu'aux écrans 360 dp.
- Bande d'opérations : historique, aimant, chip « +10 s » (durée d'auteur distincte servant de plancher au recalcul), bouton d'export vidéo.
- Raccourci clavier espace = lecture/pause (tablettes, claviers externes) porté par un seul élément.

Rendu : Rangée 44 dp mini, lecture épinglée à gauche, cluster droit (temps, undo/redo, snap, zoom, son) ; chips capsule indigo500 15 % ; point vert (success) pour l'aimant actif.

Transposition Android : ViewThatFits -> BoxWithConstraints / SubcomposeLayout ; keyboardShortcut(.space) -> onPreviewKeyEvent.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineOperationsBar.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Annuler et rétablir couvre tout mon travail de composition, pas seulement le dernier trait

`stc2-undo-redo-global` · Android : **absente** · P1 · effort M

StoryComposerViewModel+History tient un historique global de 50 étapes (HistoryStore<Data>) : pushHistorySnapshot capture un instantané des slides depuis un déclencheur débouncé (dédoublonné, hors périmètre pendant le dessin actif), undoGlobal/redoGlobal restaurent, canUndoGlobal/canRedoGlobal sont publiés.

Écarts :
- Historique global (cap 50) d'instantanés encodés des slides avec déclenchement débouncé et dédoublonnage ; aucun snapshot pendant le dessin actif (un seul à la sortie).
- Boutons annuler/rétablir activés selon canUndoGlobal/canRedoGlobal dans la colonne de contrôles et le transport timeline.
- Libérer bitmaps et animations retenus par un undo dès qu'aucune étape ne les référence (éviction par cap ou troncature de la branche redo).
- Persister l'historique avec le brouillon sans le faire traverser une restauration.

Rendu : Deux flèches uturn.backward / forward (indigo600, 35 % d'opacité quand inactives) ; haptique légère au déclenchement.

Transposition Android : HistoryStore -> deque bornée d'instantanés sérialisés (kotlinx.serialization) ; raccourcis -> onKeyEvent.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+History.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Retoucher la prise avant de la poser : recadrer (crochets, ratios), couper (bande + précision à la milliseconde), régler le volume 0–200 %

`scomp-capture-edit-crop-trim-sound` · Android : **absente** · P2 · effort L

Après la prise, même interface, autre source : la photo figée (ou la vidéo en boucle) devient la source du peintre unique ; l'objectif se repose. La prise retouchée tient dans une scène aux coins arrondis posée sur le sol, (x) et Terminé au-dessus du sol. Outils composables et tous actifs d'office (photo : recadrer ; vidéo : recadrer + couper + son si elle en a ; audio : couper + son). Crochets d'angle arrondis pour tirer librement le recadrage + bande de proportions (presets) sous la scène ; bande de découpe avec vignettes, poignées début/fin (cibles 44 pt), tête de lecture, précision à la milliseconde en maintenant (réglage fin sur trait fixe) ; piste de son avec gain 0..2 (100 % au milieu) et muet réversible qui s'entend à l'aperçu et se grave au rendu (la part >100 % par ComposerTakeGain) ; un glissé vertical montre/cache le chrome d'édition (seuil 48) ; seul le recadrage réduit la prise ; Terminé rend la photo/vidéo retouchée à l'hôte. Flèche ⬇︎ « Enregistrer dans Photos » (rendu avec cadre+filtre).

Écarts :
- Mode édition de prise : source figée (Bitmap) ou boucle ExoPlayer, cadrage (ComposerFraming.window/settled/panned/zoomed — fenêtre la plus grande aux proportions de la cible, jamais de bord vide) et outils crop/trim/sound avec ComposerEditTools.offered(take).
- Crochets de recadrage arrondis aux quatre angles (tirage libre, tracé seul pendant le geste, application à la levée) + presets de proportions (original, 1:1, 4:5, 9:16…) et bande sous la scène.
- Bande de découpe : vignettes (images(url, count)), poignées, tête de lecture, précision ms en maintenant (preciseZoom, minimumPrecisePointsPerSecond 500), durée minimale ; rendu final par Media3 Transformer (ClippingConfiguration).
- Piste de son : gain 0..200 % (100 % au milieu), muet réversible, aperçu et rendu identiques (loi unique ComposerTakeGain), spectre sous la bande.
- Chrome d'édition montré/caché par glissé vertical (seuil 48 dp, mode swipe vs reframe) et toucher ; (x)/Terminé cachés quand une famille ou un outil est montré ; panneaux ordonnés crop, sound, trim.
- Orientation vidéo (preferredTransform -> rotations/miroirs), espace colorimétrique, cadence de la boucle égale à celle de l'aperçu ; trames à `editFPS` du budget thermique.
- Terminé rend l'image/vidéo retouchée (CameraResult) et libère la session ; abandon confirmé.

Rendu : Scène arrondie sur sol sombre, quatre crochets blancs arrondis, bande de proportions défilante, piste de trim avec spectre, ligne de volume 0..200 % avec repère à 100 %, tête de lecture ambre.

Transposition Android : AVPlayerItemVideoOutput -> ExoPlayer + GL surface ; AVMutableComposition/AVAssetExportSession -> Media3 Transformer ; Metal -> GL.

<details><summary>Sources iOS (11)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerEditScene.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerEditSources.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerEditTools.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCropBrackets.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerTrimRule.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerTrimTrack.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundTrack.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFraming.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCapturePhase.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerEditedObject.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`

### Enregistrer la prise dans la galerie selon la politique choisie, avec l'EXIF de la prise et une photo toujours debout

`scomp-capture-gallery-save-exif` · Android : **absente** · P2 · effort M

La politique d'enregistrement (CaptureSavePolicy) se règle dans Réglages › Médias : l'ORIGINAL ne rejoint plus la galerie par défaut (savesOriginal=false) et la version avec effets+cadre s'enregistre à la demande (manual : flèche ⬇︎) ou à la validation (automatic). La photo rendue garde les métadonnées de la prise (date, lieu, appareil, objectif ; orientation 1, dimensions du rendu), encodée en HEIC/JPEG/PNG selon l'original, avec orientation appliquée (une photo encodée sans son orientation arrivait couchée). Album Meeshy, octets tels quels, refus de la photothèque dit (« Impossible d'enregistrer dans Photos »). États du bouton : idle (visible), saving, saved (disparaît ; un autre cadre le fait revenir).

Écarts :
- Écrire dans MediaStore (album Pictures/Meeshy, IS_PENDING) en octets tels quels, avec refus de stockage signalé ; saveImageFile/saveVideo asynchrones et ordonnés.
- Politique CaptureSavePolicy (savesOriginal, renderedMode manual|automatic) stockée dans DataStore et exposée dans Réglages › Médias ; décision de destination (CaptureSaveLaw.destination).
- Encodage de la photo rendue avec ExifInterface : copie des tags de prise (date, GPS, appareil, objectif), orientation=1, dimensions du rendu ; extension/MIME déduits des octets (heic/png/jpeg).
- Redresser une photo selon son orientation avant encodage (ComposerCaptureOrientation.upright) pour éviter la photo couchée.
- État ComposerTakeSaveState (idle/saving/saved) avec libellés « Enregistrer dans Photos », « Enregistrement dans Photos… », « Enregistré dans Photos ».

Rendu : Flèche vers le bas dans la rangée haute de la retouche ; bascule d'icône en coche une fois enregistré.

Transposition Android : PHPhotoLibrary -> MediaStore ; ImageIO/CGImageDestination -> ExifInterface + Bitmap.compress / HEIC via ImageDecoder.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerGallery.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoEncoding.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureOrientation.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`

### Filtres, Effets (lissage, crapaud, ange, démon, éruption) et Cadres vivants dans une bande, appliqués à l'aperçu, à la photo et à la vidéo

`scomp-capture-looks-filters-effects-frames` · Android : **absente** · P2 · effort XL

Rail Filtres · Effets · Cadres à gauche de la bande de miniatures (cases 56x100) : chaque case MONTRE en direct le look qu'elle produirait ; filtre et cadre et effet se COMBINENT (look = filtre + effet de visage + cadre). Un seul peintre (ComposerLookPainter, un CIContext Metal partagé) dessine l'aperçu Metal plein canevas, la bande (atlas de cases, repeinture seulement des cases neuves ou changées), la photo, la boucle de retouche et la vidéo exportée image par image (ComposerLookVideoExporter) à la date et à l'auteur de la session. Cadres cuits une fois par (look, toile, date, auteur) dans un cache NSCache borné, jamais sur le fil principal. Le défilement choisit la case au milieu automatiquement ; bande repliée = miniature vivante du look choisi qui sert de déclencheur (ou déclencheur simple si rien n'est choisi) ; le look est figé tant que des segments attendent. Budget thermique : nominal/fair/serious/critical dégradent l'aperçu (15 i/s, 0 vignette…) mais JAMAIS la photo ni l'export ; notice « Aperçu simplifié : l'appareil chauffe. La prise garde tout l'effet. ». Cadence permise sur échéance glissante (tolérance 0,45). Effets de visage (landmarks sur une sonde debout).

Écarts :
- Aucun look en capture : Android n'a qu'une matrice de filtres de slide (StoryFilterMatrix) et une politique de dégradation d'appel (VideoFilterDegradePolicy) ; créer le moteur de rendu unique (OpenGL ES / AGSL RuntimeShader / CameraX Effects Framework + OverlayEffect) partagé par aperçu, bande, photo et vidéo.
- Trois familles Filtres/Effets/Cadres (ComposerLookFamily) combinées en un ComposerPhotoLook ; bande de cases 56x100 dp avec miniatures vivantes, rail de familles aligné sur la hauteur des cases, nom du choix en 10 sp sous la bande.
- Effets de visage (Lissage de peau, Crapaud, Ange, Démon, Éruption) via ML Kit Face Mesh/MediaPipe Face Landmarker sur une sonde réduite ; partager avec les effets de caméra d'appel (CallFaceEffect).
- Cadres (Photomaton, Carte postale, Faire-part, styles classiques) cuits en arrière-plan et mis en cache LRU par (look, toile, date, auteur) ; aucune cuisson sur le fil principal ; échec retentable avec back-off.
- Sélection automatique de la case au centre au défilement (ComposerLookStripFollow : rejoindre la cible vs choisir), snapping et inset legacy, cases figées sous palier 'serious'.
- Budget thermique via PowerManager.addThermalStatusListener : paliers 4 (preview fps, vignettes fps/cellules) et notice ; la photo et l'export reçoivent TOUJOURS l'effet complet.
- Exporteur vidéo : appliquer le look image par image (Media3 Transformer + GlEffect) sur la prise brute et mélanger le gain audio ; repli : la prise brute repart plutôt que perdue.
- Cadence permise (admit(presentedAt)) sur échéance glissante et première trame annoncée pour détacher l'aperçu système.

Rendu : Bande horizontale de miniatures vivantes avec case choisie encadrée à l'extérieur, rail vertical Filtres/Effets/Cadres à gauche, texte du nom en 10 sp, contour rouge pulsé en prise.

Transposition Android : CIContext/Metal/MTKView -> GLSurfaceView/TextureView + shaders AGSL (API 33) ou Media3 effects ; ThermalStateMonitor -> PowerManager thermal status ; Vision face landmarks -> ML Kit Face Mesh.

<details><summary>Sources iOS (15)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStrip.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripPainting.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripRule.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLook.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookPainter.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookSceneCache.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLook.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFaceEffects.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraFeed.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFramePacing.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerThermalBudget.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoFilterDegradePolicy.kt`

### « Composer » à partir d'un média reçu : la photo, vidéo ou son devient la graine d'une scène

`scomp-compose-from-received-media` · Android : **absente** · P2 · effort M

La porte média (MediaComposerDoor) sème un canvas depuis un média de conversation, de post ou de story selon ComposerMediaSeeding (vidéo, image, audio ; un audio que l'atelier ne sait pas placer n'est pas offert) et monte le meuble avec des hôtes de prévisualisation et des états de matérialisation (pending -> prêt) ; la règle ne dit pas où le pont peut envoyer les octets, elle dit si la graine peut se poser sur un canvas.

Écarts :
- Ajouter l'action « Composer » sur les médias reçus (galerie de conversation, détail de post, lecteur de story) qui télécharge le fichier puis ouvre le composer avec la graine.
- Règle ComposerMediaSeeding.seed(...) -> graine image/vidéo/scène (audio non offert) et états de matérialisation avec erreur 'Ce média n'est pas disponible'.
- Origine 'share' : ShareTargetActivity (ACTION_SEND) n'envoie qu'en conversation ; proposer aussi « Créer une story / un post ».

Rendu : Spinner court de matérialisation sur la tuile avant l'ouverture, jamais une page d'attente.

Transposition Android : Share Extension -> ShareTargetActivity (déjà là pour chat) ; MediaSaveSourceResolving -> cache Coil/OkHttp.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/MediaComposerDoor.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`

### Retoucher une photo ou une vidéo avant de l'envoyer en conversation, avec les mêmes outils que la caméra

`scomp-conversation-piece-retouch` · Android : **absente** · P2 · effort M

La retouche de la caméra s'ouvre sur une pièce à envoyer (image fixe ou vidéo d'un message en cours) : même montage (ComposerCaptureMount), mêmes outils visibles d'emblée, (x) et Terminé cachés tant qu'un outil est ouvert, lecture et volume en haut à droite. « Terminé » rend la pièce retouchée ; « Abandonner » la retire. Le média choisi ne repart pas en galerie (il y est déjà). Les pièces candidates sont filtrées parmi les pièces jointes (image/vidéo seulement).

Écarts :
- Le plateau de pièces jointes du chat (ComposerAttachmentTray) n'offre aucune retouche : ajouter l'action « Retoucher » sur une image/vidéo qui ouvre le mode édition (recadrer, couper, filtres, volume).
- Retour typé ComposerReturnedMedia (image | vidéo) et remplacement de la pièce dans le plateau ; « Abandonner » retire la pièce.
- Filtrer les candidats (kind image/vidéo, audio/fichier/lieu exclus) et rendre la pièce retouchée à la place de l'originale sans rejouer la galerie.

Rendu : Retouche plein écran avec (x) / Terminé, outils sous la scène, chrome qui se montre/cache d'un glissé vertical.

Transposition Android : fullScreenCover -> destination plein écran avec résultat renvoyé par savedStateHandle.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ConversationPieceRetouch.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRetouchSeries.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerReturnMedia.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`

### Choisir comment les scènes d'un post se disposent (image par image, défilement, héros, vague, zigzag)

`scomp-mosaic-layout-choice` · Android : **absente** · P2 · effort S

Pour un Post de plusieurs scènes, le menu Publier déplie les cinq dispositions du fil (MosaicLayoutMode : carrousel, défilement continu, hero, vague, sinusoïde) avec libellés et glyphes ; le choix voyage dans CanvasV3.layout. Sans choix la publication retombait sur le carrousel.

Écarts :
- Le lecteur Android sait déjà peindre les cinq dispositions (MosaicLayout, FeedMediaMosaic) mais le composer ne propose aucun choix et n'écrit pas CanvasV3.layout : ajouter la règle isServed(slideCount, format) et la liste ordonnée.
- Libellés localisés (« Image par image », « Défilement continu », « Une grande, les autres à côté », « En vague », « En zigzag ») et glyphes équivalents Material.

Rendu : Entrée Post dépliable dans le menu ; la disposition cochée est visible ; pictogrammes en ligne.

Transposition Android : Sous-menu du chevron Publier.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerMosaicChoice.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MosaicLayoutMode.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaMosaic.kt`

### Un inspecteur de jetons qui affiche les valeurs de l'objet choisi (STYLE · NÉON, TAILLE 38, 0:00 → 0:06)

`scomp-object-chips-inspector` · Android : **absente** · P2 · effort M

Vue 1c : une rangée de jetons au-dessus du socle porte les VALEURS (style, taille, alignement, fenêtre de temps, son, rotation, badge de type · plan · z) au lieu d'icônes. Chaque jeton ouvre sa section. La rangée change de contenu selon le kind, jamais de place ; elle n'est servie que si un outil n'est pas ouvert et qu'au moins un jeton mène quelque part.

Écarts :
- Aucun inspecteur de valeurs côté Android : ajouter ComposerObjectChips.chips(forSelected, slide) (texte, média, sticker, lieu, son) et la rangée de capsules.
- Copie localisée des valeurs (NÉON, GRAS, CLASSIQUE, MANUSCRIT, MACHINE ; ALIGN · GAUCHE/CENTRÉ/DROITE ; ROTATION n° ; PLAN FG/BG ; SON %).
- Jeton -> ouvre la section correspondante seulement si la destination est servie (pas de jeton inerte).

Rendu : Capsules monospace en majuscules, valeur lisible sans toucher, au-dessus du socle ; hauteur stable.

Transposition Android : LazyRow de AssistChip/Surface capsule.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectChips.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectChipsCopy.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectChipsRow.swift`

</details>

### Le menu ⋯ : aperçu comme le lecteur, couleur/retrait du fond, enregistrer dans la photothèque, transférer, tout effacer

`scomp-overflow-menu-export` · Android : **absente** · P2 · effort L

Le ⋯ n'existe que s'il a au moins une entrée servie : Aperçu (voir la scène comme elle sera lue), Couleur de fond, Retirer le fond, Enregistrer (bake la scène exportable — timeline commitée, vidéos résolues en fichiers locaux, fond du composer injecté — puis écrit dans Photos), Transférer (même bake remis à la feuille de partage), Tout effacer (absent sur composer vierge). L'export est local à l'auteur (jamais envoyé au serveur), un voile « Export en cours… » avec fraction de progression couvre la scène, annulable ; messages « Enregistré dans la photothèque » / « L'export a échoué. Réessayez. ».

Écarts :
- Créer le menu ⋯ et ComposerOverflowPolicy.served(...) (preview, pickBackground, removeBackground, saveToPhotos, share, clearAll) ; clearAll caché sur composer vierge ; aucun menu à zéro entrée.
- Export de scène : composer image ou vidéo exportable (rasteriser les objets texte/sticker/dessin sur le fond, MediaCodec/Transformer Media3 pour la vidéo) puis MediaStore.Images/Video (photothèque) ou ACTION_SEND (Transférer).
- Voile de progression ComposerExportProgressVeil (fraction nil -> aucun voile), annulation et états Terminé/Échec avec libellés.
- Aperçu plein écran de la scène comme le lecteur la lira (même player que StoryViewer).

Rendu : Voile semi-opaque avec libellé « Export en cours… » et barre de progression ; confirmations en toast/snackbar discrets.

Transposition Android : PHPhotoLibrary -> MediaStore + scoped storage ; UIActivityViewController -> Intent.createChooser(ACTION_SEND) ; AVAssetExportSession -> Media3 Transformer.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Overflow.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneExportController.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerExportProgressVeil.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSurfaceRules.swift`

</details>

### Coller ou déposer des images, vidéos, sons, documents et texte dans le composer selon la surface

`scomp-paste-drop-into-composer` · Android : **absente** · P2 · effort M

Règle O12 à deux axes indépendants : la SURFACE (scène, stickers) décide du budget et de la mémorisation, le TYPE collé décide du produit (média de scène, sticker, pièce jointe). Tout élément lu du presse-papier tombe dans exactement un bac parmi cinq (conservation) ; ce que la scène de story ne peut pas héberger est dit (« Un document se joint à un post, pas au canevas d'une story », « Le texte se colle dans l'outil Texte ») avec destination alternative.

Écarts :
- Aucun collage de médias sur Android (seul LargePasteDetector pour le texte dans le chat) : implémenter la réception de contenu riche (Modifier.contentReceiver / OnReceiveContentListener, ClipboardManager ClipData URIs) dans la description, le document et la scène.
- Règle PasteDestination.resolve(surface, ingest) -> mediaObject | sticker | attachment ; budget d'image différent par surface ; collage dans la scène n'alimente jamais « Mes stickers ».
- Lot ComposerPasteBatch avec cinq bacs (conservation) et messages localisés (non lisible, document -> post, texte -> outil Texte).
- Dépôt (drag and drop) pour tablettes/ChromeOS (dragAndDropTarget).

Rendu : Toast court indiquant ce qui n'a pas pu être collé ; aucun dialogue.

Transposition Android : NSItemProvider/UIPasteboard -> ClipData + ContentResolver ; onDrop -> DragAndDropTarget.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/PasteDestination.swift`
- `apps/ios/Meeshy/Features/Main/Composer/PasteIntoComposer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Choisir un effet d'ouverture/fermeture ou un effet visuel de la scène dans un carrousel en bas

`scomp-scene-effects-carousel` · Android : **absente** · P2 · effort M

Quand la scène a un fond média, le rail droit propose deux catégories d'effets : Ouverture (transitions d'ouverture et de fermeture de slide, deux rangées) et Visuel (un filtre cuit dans l'image, seulement sur fond image). Toucher une catégorie ouvre un carrousel dans une plaque de verre à la place de l'audience et de Publier ; la retoucher ou toucher « Fermer les effets » le referme ; toucher l'autre bascule.

Écarts :
- Le lecteur résout les transitions (StoryClipTransitionResolver, sérialiseur tolérant) mais le composer ne propose aucun choix d'ouverture/fermeture ; ajouter ComposerSceneEffects.served(background) + Transitions(opening, closing) et le carrousel.
- Carrousel « Effet d'ouverture » (rangées Ouverture/Fermeture) et « Effet visuel » (grille de filtres) dans une plaque de verre qui remplace le socle ; libellés « Effets de la scène », « Fermer les effets ».
- Règle toggled(tapped, open) : retoucher referme, toucher l'autre bascule ; effet visuel absent pour une vidéo de fond.

Rendu : Plaque de verre teintée du plateau portant le nom de la catégorie, sa sortie (x) et le contenu défilant.

Transposition Android : LazyRow de vignettes d'effet ; plaque = Surface translucide.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneEffectCarousel.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneColumns.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneColumns.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`

### « Mes stickers » : coller une image la garde (animation conservée) dans une bibliothèque bornée

`scomp-sticker-library-my-stickers` · Android : **absente** · P2 · effort M

Coller dans le panneau stickers range l'image dans « Mes stickers » : un GIF/WebP animé garde TOUTES ses images (octets d'origine) + un PNG fixe de repli ; magasin sur disque avec index sidecar caché, budget 64 Mo et éviction LRU, liste « récents » ; messages pour ce qui ne peut pas devenir sticker (texte, non-images). Entrée dans la palette et dans le menu du lecteur (« Sticker ajouté à Mes stickers », « Déjà dans Mes stickers »).

Écarts :
- La palette Android est un catalogue d'emojis (StickerCatalog) : ajouter un magasin Mes stickers (fichiers + index JSON + LRU 64 Mo), la conservation des octets d'origine pour les GIF/WebP animés et un PNG de repli.
- Onglet « Mes stickers » dans la palette avec récents ; enregistrement depuis le lecteur de story (long press sur un sticker) avec messages « Déjà dans Mes stickers » / « Enregistrement impossible ».
- Messages de refus (« Seules les images deviennent des stickers », « Le texte ne devient pas un sticker »).

Rendu : Grille de stickers carrés avec animation lue au focus, onglet dédié dans la palette.

Transposition Android : actor + FileManager -> classe Kotlin avec Mutex + java.io.File ; lecture animée -> Coil + ImageDecoder (AnimatedImageDrawable).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/StickerLibraryArtwork.swift`
- `apps/ios/Meeshy/Features/Main/Composer/StickerLibraryPaste.swift`
- `apps/ios/Meeshy/Features/Main/Composer/StickerLibraryStore.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Détourer le sujet d'une photo pour en faire un sticker

`scomp-sticker-subject-lift` · Android : **absente** · P2 · effort S

Le détourage (Vision, iOS 17+) isole le sujet d'une photo, borne la sortie et l'ajoute à « Mes stickers » ; échecs typés (non supporté, illisible, aucun sujet) avec messages « Aucun sujet trouvé sur cette photo », « Image illisible », « Le détourage demande iOS 17 » ; succès « Sujet détouré et ajouté à Mes stickers ».

Écarts :
- Ajouter le détourage avec ML Kit Subject Segmentation (Play Services) ou MediaPipe Image Segmenter, orientation EXIF respectée, taille bornée avant entrée dans la bibliothèque.
- Échecs typés unsupported/unreadable/noSubject avec messages localisés ; repli propre si le modèle n'est pas téléchargé.

Rendu : Action « Détourer » dans le menu de la photo ; indicateur de progression pendant le calcul.

Transposition Android : VNGenerateForegroundInstanceMaskRequest -> ML Kit SubjectSegmentation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/StickerSubjectLift.swift`

</details>

### Le crédit d'un son emprunté défile « titre · @pseudo » dans la pastille audio

`sct-audio-chip-credit-marquee` · Android : **absente** · P2 · effort M

AudioChipDisplay choisit ce que la pastille montre : l'onde pour un son original (jamais de faux crédit), un défilement « titre · @pseudo » (ou @pseudo seul, ou « @auteur · date » sans titre) pour un son EMPRUNTÉ à la bibliothèque, le discriminant étant soundId. Il calcule aussi la fin de lecture, le temps restant et le compte à rebours (chiffres des minutes selon la durée totale). AudioChipMarquee anime le défilement (offset selon le temps écoulé, reprise d'époque) ; AudioChipRemainingTimeText affiche le temps restant. Android : absent.

Écarts :
- Annonce du fond audio (aucune / original / crédit avec titre, pseudo, durée, date de publication) et choix onde vs marquee
- Défilement horizontal continu du crédit avec reprise et libellé d'accessibilité
- Fenêtre de lecture, temps restant et compte à rebours formatés (m:ss / mm:ss)
- Date relative localisée du son quand le titre manque
- Ne jamais dégénérer un crédit en « original » quand les métadonnées sont absentes (cache froid)

Rendu : Texte 11–12 pt défilant dans la pastille, fondu aux bords, compte à rebours monospace.

Transposition Android : Compose basicMarquee ou offset animé par infiniteTransition ; fonctions pures dans core/model.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioChipDisplay.swift`

</details>

### Voir la dernière photo de la pellicule en amorce d'une page blanche, sans prompt surprise

`sct-camera-roll-latest-thumbnail` · Android : **absente** · P2 · effort S

RecentCameraRollAsset.latest() rend la vignette de la photo la plus récente dès que l'accès est déjà accordé, sans JAMAIS demander l'autorisation à l'affichage du composer ; la demande est un geste explicite (tap sur la capsule « Galerie » → requestAccess, puis PhotosPicker si refus). fullImage(for:) rend le bitmap (borné à 1080 pt) à insérer au tap. Le composer SDK n'affiche la vignette que si l'app fournit ce provider (storyRecentCameraRollProvided) ; sinon repli sur la capsule Galerie. Un loquet PhotoKitResumeLatch protège contre les rappels multiples de PhotoKit. Android : absent.

Écarts :
- Provider injecté : dernière image MediaStore si la permission est déjà accordée, sinon aucune vignette (jamais de prompt à l'ouverture)
- Capsule « Galerie » qui demande l'accès au tap puis ouvre le sélecteur
- Chargement plein format borné à 1080 px de côté pour l'insertion dans la slide
- Repli propre sans provider (capsule seule)
- Protection contre la reprise multiple des callbacks asynchrones

Rendu : Vignette arrondie dans les amorces d'une page blanche, à côté de « Touchez pour écrire » et de la caméra.

Transposition Android : MediaStore.Images.Media (ORDER BY DATE_ADDED DESC LIMIT 1) + ContentResolver.loadThumbnail ; permission READ_MEDIA_IMAGES demandée seulement au tap.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/RecentCameraRollAssetProvider.swift`

</details>

### Le viseur repart tout seul quand le système l'a interrompu

`sct-camera-session-recovery` · Android : **absente** · P2 · effort S

CameraModel+Recovery observe l'erreur d'exécution, l'interruption et la fin d'interruption de la session ; sur erreur ou reprise elle vide le flux (dernière trame rendue au pool) et relance la session si le viseur la veut encore, au lieu de laisser un flux figé où photo et vidéo refusent en silence (bug du selfie qui se fige, #10308). Android : absent.

Écarts :
- Surveiller CameraState (erreurs, CLOSED inattendu) et rebinder si le viseur est toujours affiché
- Journaliser la cause d'arrêt (code d'erreur) pour le diagnostic
- Vider l'aperçu pendant l'interruption pour ne pas montrer une image figée
- Test de récupération simulant une erreur de caméra

Transposition Android : CameraX Camera.cameraInfo.cameraState (CameraState.Error) + rebind ; l'interruption système passe par le cycle de vie.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraModel+Recovery.swift`

</details>

### Dessiner l'évolution du volume d'un clip avec des points posés à la tête de lecture

`sct-clip-volume-automation` · Android : **absente** · P2 · effort S

ClipVolumeAutomation est la SEULE surface d'édition de la courbe de volume (la piste de 52 pt réserve ses gestes au déplacement et au rognage) : bouton « Point de volume à m:ss » qui fige le volume courant à la tête de lecture, liste des points triés avec retrait d'un point, légende « Sans point, le volume reste constant sur toute la durée du clip. » VolumeCurveOverlay trace cette courbe en LECTURE SEULE au-dessus de la piste, avec une signature pour ne se recalculer que si les points changent. Android : absent.

Écarts :
- Ajouter un point de volume à la tête de lecture et supprimer un point (libellé d'accessibilité)
- Liste triée des points et légende d'aide
- Courbe en lecture seule superposée à la piste, recalculée seulement sur changement de signature
- Appliquer l'automation au mixeur et au lecteur (volume effectif)
- Observer la tête de lecture par le seul libellé du bouton (pas de recomposition de l'inspecteur)

Rendu : Courbe fine indigo sur la piste, points en losanges, bouton « Point de volume » en capsule.

Transposition Android : Canvas Compose pour la courbe ; liste LazyColumn de points.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipVolumeAutomation.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VolumeCurveOverlay.swift`

</details>

### Créer une story ou un post à partir d'un média ou d'une scène déjà publiés

`sct-create-from-existing-media` · Android : **absente** · P2 · effort S

ComposableAttachmentSurfaces applique UNE conjonction d'offre (seedPlan) aux trois surfaces (message, post, story recomposée) : le porteur n'est pas masqué (vue unique, flou, chiffrement), exactement une pièce composable, aucune pièce protégée voisine, quelque chose à semer. Un post sème sa description via displayContent (texte servi par le Prisme, traduction comprise) ; une pièce d'un plein écran sème « Créer avec CE média » ; une story recomposée sème la scène entière sans média. Android : absent (seul le repost existe).

Écarts :
- Règle d'offre pure (SeedSource → SeedPlan?) mutualisée entre message, post, pièce de plein écran et story recomposée
- Description pré-remplie dans la langue servie au lecteur (Prisme), normalisée une fois
- Action « Créer avec ce média » dans les menus de média/post/story quand la règle l'autorise, jamais sur un porteur masqué
- Ouverture du composer avec la graine (média ou scène recomposée)

Transposition Android : Menu contextuel Compose + navigation vers StoryComposerScreen avec argument de graine.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposableAttachmentSurfaces.swift`

</details>

### Parcourir les cadres d'un pack installé avec la condition d'usage de chacun

`sct-frame-pack-shelf` · Android : **absente** · P2 · effort M

La Boutique propose d'abord la Boutique puis un onglet par pack INSTALLÉ (PackShopTabBar, capsules défilantes) ; l'onglet d'un pack (FramePackShelfLoader) charge le détail, vérifie le contrat par son empreinte, lit les chaînes de la langue du lecteur (sinon le français), puis rend un cadre par vignette avec le libellé de SON usage (« Rang Ambassadeur IV uniquement »). États : chargement, contrat d'une version inconnue (« Mets à jour Meeshy »), indisponible (« n'ont pas pu se charger »), cadres ; l'affiché reste en cas d'échec de relecture. Un pack retiré pendant que son onglet est ouvert ramène à la Boutique. Android : absent.

Écarts :
- Barre d'onglets Boutique + un onglet par pack installé, onglet fantôme impossible
- Chargement du contrat de cadres par pack versionné, vérification d'empreinte, magasin adressé par contenu et élagage des fichiers non retenus
- Chaînes localisées du pack (langue du lecteur puis français), nom du cadre par identifiant en repli
- Libellé d'usage des cadres (rang, rareté, famille de moment) avec noms du jeu localisés
- États chargement / mise à jour requise / indisponible, avec conservation de l'affiché sur échec

Rendu : Capsules défilantes pour les onglets, tuile de cadre avec vignette, nom traduit et libellé d'usage en secondaire ; haptique light au changement d'onglet.

Transposition Android : Compose ScrollableTabRow / LazyVerticalGrid + store de fichiers adressé par contenu (hash) dans filesDir ; chaînes via contrat JSON.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/FramePackShelfLoader.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Packs/FramePackShelfView.swift`

</details>

### Régler une image-clé : instant, position et courbe d'interpolation

`sct-keyframe-inspector` · Android : **absente** · P2 · effort S

KeyframeInspector est la fiche ouverte au tap sur un marqueur de keyframe : instant (pas, aligné sur ClipInspector), position x/y par curseurs (commits en MoveKeyframeCommand), suppression (DeleteKeyframeCommand), choix de courbe (Linear, Ease In, Ease Out, Ease In/Out, Spring) — seul Linear est exposé tant que le mode avancé n'est pas activé (exposedEasings(advanced:)). Même contrat snapshot/callbacks que ClipInspector, bouton Fermer, libellés d'accessibilité. Android : absent.

Écarts :
- Fiche de keyframe : instant (± pas), position x/y, courbe, suppression, fermeture
- Easings exposés selon le drapeau avancé (linear seul par défaut)
- Commits en commandes annulables (déplacement, suppression)
- Libellés d'accessibilité (instant, keyframe, fermeture)

Transposition Android : Panneau flottant Compose avec Slider et segmented buttons ; mêmes callbacks que l'inspecteur de clip.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeInterpolator.kt`

### Choisir l'animation d'ouverture d'une slide (Fondu, Zoom, Glissement, Révélation)

`sct-opening-effect-chips` · Android : **absente** · P2 · effort M

OpeningEffectChips est la rangée de chips « Aucune / Fondu / Zoom / Glissement / Révélation » qui règle effects.opening de la slide courante, rendue par le lecteur au passage édition → lecture et par l'export (durée commune 1,2 s). Une seule UI et une seule vérité (viewModel.openingEffect) partagées entre la feuille Transitions et le panneau Fond ; haptique light au choix. Android : le modèle porte opening/closing mais ni le composer ni le lecteur ne les rendent (aucune occurrence dans feature/stories).

Écarts :
- Rangée de chips Aucune / Fondu / Zoom / Glissement / Révélation dans le panneau Fond (et la feuille Transitions)
- Persister effects.opening dans le deck et la publication (champ déjà au modèle)
- Rendre l'animation d'ouverture dans le lecteur de story (1,2 s) et dans l'aperçu du composer
- Haptique light, libellés localisés, état sélectionné visible

Transposition Android : FilterChip Compose ; animations Compose (alpha, scale, offset, clip reveal) pilotées par un spec partagé entre composer et lecteur.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/OpeningEffectChips.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Prévisualiser un média récent en grand par appui long, vidéo avec son

`sct-recent-media-preview` · Android : **absente** · P2 · effort S

RecentMediaPreview est l'aperçu du menu contextuel d'une cellule : photo pleine qualité, vidéo avec image d'affiche immédiate puis lecture en boucle AVEC le son dès que l'item est prêt (session audio .playback via la source unique call-aware du SDK : muette pendant un appel, audible même interrupteur silence enclenché). Surface vidéo sans contrôles (AVPlayerLayer nu) pour laisser voir l'affiche pendant la mise en tampon. Dimensionné au vrai ratio de l'asset. Android : absent.

Écarts :
- Aperçu plein cadre au ratio réel (popup d'appui long), photo en pleine qualité
- Vidéo : affiche instantanée puis boucle avec son via ExoPlayer, sans contrôles
- Prise de focus audio adaptée (pas de lecture pendant un appel, respect du mode silencieux)
- Fermeture au relâché ; libération du player

Transposition Android : Popup/Dialog Compose + ExoPlayer (PlayerView sans contrôleur) + AudioFocus ; menu contextuel iOS → appui long + DropdownMenu.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/RecentMediaPreview.swift`

</details>

### La scène d'un post a exactement la même carte et le même sol que celle d'une story

`sct-scene-card-floor` · Android : **absente** · P2 · effort S

SceneCard est la carte unique d'une scène (directive 2026-09-17, #6904) : cadre 9:16 arrondi, fond dominant du ThumbHash dans la carte, média posé sans rognage, rayon identique sur les quatre surfaces (unscaledCornerRadius selon la disposition). SceneFloorView est l'unique SOL peint autour de la carte (teinte sombre dérivée du ThumbHash, plus de noir pur dans la galerie de post), en cadré comme en immersif. Android : absent.

Écarts :
- Composable SceneCard (cadre, rayon, fond ThumbHash) partagé entre story, galerie de post et fil
- SceneFloor : teinte sombre dérivée du ThumbHash autour de la carte, cadré et immersif
- Calcul du rayon selon la disposition (échelle appliquée)
- Même résultat visuel que le lecteur de stories sur toutes les surfaces

Rendu : Carte 9:16 arrondie, sol ThumbHash assombri, aucun noir pur.

Transposition Android : Box clip(RoundedCornerShape) + ThumbHashPainter existant pour le fond.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/SceneCard.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/SceneFloorView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`

### Ouvrir une scène en plein écran reprend la lecture où elle en était, et la barre se parcourt au doigt

`sct-scene-playback-handoff` · Android : **absente** · P2 · effort S

ScenePlaybackPositions est une mémoire PARTAGÉE (clé = porteur + index de scène) où la carte du fil publie sa position pour que le plein écran, qui naît dans un fullScreenCover hors de son arbre, redémarre aligné (vidéo comme fond sonore) au lieu de repartir de zéro (#6580). ScenePlaybackScrubber relie une barre de progression au canvas : begin au toucher, scrub(toFraction:) en glissant, end au relâché, en poussant directement dans la vue sans réévaluer SwiftUI à la cadence du doigt (#7878). Android : absent.

Écarts :
- Mémoire de positions par scène (publish/position/reset) lue à l'ouverture du plein écran
- Reprise alignée de la vidéo et du son de fond depuis cette position
- Scrub d'une scène au doigt (begin / scrub(fraction) / end) sans recomposition à chaque mouvement
- Réinitialisation de la mémoire quand on quitte le contexte

Transposition Android : Singleton Kotlin scoped (Hilt) + callbacks du ScenePlayer ; Slider avec onValueChange/onValueChangeFinished qui appelle le state holder du lecteur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/ScenePlaybackPositions.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/ScenePlaybackScrubber.swift`

</details>

### Voir ce qui a été publié avec un son, puis l'utiliser à son tour

`sct-sound-detail-page` · Android : **absente** · P2 · effort M

SoundDetailView est la page du son : identité en tête, mêmes compteurs que la ligne du sélecteur (qui décrivent exactement la grille dessous), puis grille des publications utilisant ce son (cascade vignette → thumbHash → aplat, nombre de lectures). Actions : Utiliser, Retirer de ma bibliothèque (quand la page s'ouvre sur un de SES sons, avec confirmation par l'hôte). SoundDetailModel pagine par curseur d'usages (plusieurs pages vides consécutives ≠ fin) et envoie les impressions des publications affichées à la fermeture (#10483). États : chargement, erreur « Impossible de charger les publications. », vide « Personne n'a encore publié avec ce son. » Android : absent.

Écarts :
- Page de détail du son avec identité, compteurs, grille de publications (thumbnailUrl → thumbHash → aplat)
- Pagination par curseur qui tolère les pages vides consécutives (non publiques écartées)
- Impressions des publications affichées envoyées à la fermeture de la page
- Actions Utiliser et Retirer (si le son est à soi), états chargement/erreur/vide
- Route des publications d'un son dans core/network

Transposition Android : Écran Compose avec LazyVerticalGrid et pagination par curseur ; Coil + ThumbHashPainter existant pour le repli de vignette.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundDetailModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundDetailView.swift`

</details>

### Autoriser ou non d'autres personnes à réutiliser la bande-son de mes vidéos

`sct-sound-extraction-toggle` · Android : **absente** · P2 · effort S

SoundExtractionToggle est l'interrupteur d'opt-in de l'auteur, formulé à l'endroit avec sa conséquence : « Autoriser la reprise du son » et la légende « D'autres personnes pourront réutiliser la bande-son des vidéos de ce post. » Un seul interrupteur pour tout le post (Post.allowSoundExtraction), monté uniquement dans le panneau Médias ; défaut tenu par le store (activé depuis #8012, le refus est explicite), vue purement relais. Le flag voyage jusqu'à la publication (voie story et voie document). Android : aucune trace de allowSoundExtraction.

Écarts :
- Interrupteur + légende conséquence dans le panneau Médias (un seul par post)
- Champ allowSoundExtraction dans CreatePostRequest et CreateStoryRequest, défaut activé, nil quand l'auteur n'a rien décidé
- Persister le choix dans le brouillon et la file durable
- Libellés localisés et accessibilité du Switch

Transposition Android : Row Compose avec Switch Material3 et texte de légende ; champ ajouté au modèle réseau.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/SoundExtractionToggle.swift`

</details>

### Dans le composer plein écran, voir pour chaque objet une barre de sa fenêtre d'apparition

`sct-timeline-scene-frise` · Android : **absente** · P2 · effort S

TimelineViewModel+SceneFrise expose les pistes de la frise de SCÈNE (SceneFriseTrack : texte, sticker, image, vidéo, audio, lieu) : un objet, une barre, sa fenêtre d'apparition, dans l'ordre de la pile du plan (ce qu'on voit derrière d'abord), sans piste pour le fond. L'étiquette nomme le texte posé, l'emoji ou le nom du lieu ; setClipEntry/setClipExit règlent l'entrée et la sortie. Les deux frises lisent le même projet et ne peuvent pas se contredire. Android : absent.

Écarts :
- Pistes de frise dérivées du projet partagé (type, étiquette, fenêtre) sans piste de fond
- Réglage de l'entrée et de la sortie d'un objet depuis la frise
- Ordre = pile du plan, étiquette vide pour média/son (l'hôte met le mot de sa langue)
- Cohérence stricte avec la timeline de montage (même source)

Rendu : Une barre par objet avec glyphe + nom court, fenêtre d'apparition dessinée sur l'axe du temps.

Transposition Android : Projection pure du modèle de projet ; Row/Box Compose pour les barres.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+SceneFrise.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`

### Ajouter et régler une transition entre deux clips depuis le losange à la couture

`sct-transition-badges-inspector` · Android : **absente** · P2 · effort M

TransitionJunctionResolver résout les jonctions entre clips média consécutifs (ancre au milieu entre la fin amont et le début aval, chevauchement ou trou). LaneTransitionOverlays pose, à chaque couture, un losange plein (TransitionBadge : tap = sélectionner/inspecter, appui long 0,4 s, glisser, accessibilité) ou un losange fantôme « + » (TransitionCreationBadge : « Ajouter une transition », crée un crossfade par défaut annulable et route vers l'inspecteur). TransitionInspector : type (dissolve exclu, rendu identique au crossfade), Durée, Courbe (Accélère / Décélère / Douce), supprimer ; notice quand la courbe est désactivée. TransitionChromeLane affiche en lecture seule, au-dessus de la règle, l'animation d'ouverture/fermeture de la slide (Fondu, Zoom, Glissement, Révélation, 1,2 s). Android : le lecteur sait l'opacité des transitions ; aucun éditeur.

Écarts :
- Résolution pure des jonctions entre clips média consécutifs (ancre centrée sur la couture)
- Losange plein (existante) / fantôme « + » (création d'un crossfade par défaut, annulable) à chaque couture
- Inspecteur de transition : type (sans dissolve), durée, courbe, suppression, notice de courbe désactivée
- Bande chrome de la slide : badges Ouverture / Fermeture (lecture seule, 1,2 s)
- Libellés d'accessibilité et action par défaut du losange

Rendu : Losange indigo plein ou contour pointillé avec « + » à la couture, bande de chrome fine au-dessus de la règle.

Transposition Android : Canvas Compose (Path losange) + combinedClickable/pointerInput ; sheet ou popup pour l'inspecteur.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionCreationBadge.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionJunctionResolver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionChromeLane.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/LaneTransitionOverlays.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`

### Régler le volume d'un clip jusqu'à 200 % et l'atténuer sous la musique

`sct-volume-gain-ducking` · Android : **absente** · P2 · effort S

StoryVolume fixe le plafond de gain à 2,0 (miroir du max(2) du schéma Zod de la gateway : un écart ferait rejeter la publication en 400). StoryVolumeResolver calcule le volume effectif d'un clip (base × automation) et applique le ducking (le son d'une vidéo descend tant que l'audio de fond joue) selon l'option de la slide et le désactivable par clip. Android : aucune trace de ducking ni de gain > 1 ; seuls les fondus existent.

Écarts :
- Constante de plafond 2,0 alignée sur le schéma gateway
- Volume effectif (base, courbe d'automation, ducking) pur et testable
- Ducking sous le fond sonore avec choix par slide et désactivation par clip
- Appliquer le résultat au lecteur ExoPlayer (volume > 1 via LoudnessEnhancer ou gain)

Transposition Android : Objet Kotlin pur ; LoudnessEnhancer/AudioProcessor pour le gain au-delà de 1.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/StoryVolumeResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`

### Je vois la forme fréquentielle de mon son (spectrogramme) quand je le rogne ou le place

`stc2-audio-spectrogram` · Android : **absente** · P2 · effort S

AudioSpectrogramRenderer calcule par FFT (fenêtre 64, 32 bandes) les bins d'un échantillon audio et AudioSpectrogramView les dessine en barres 44 pt colorées avec mélange bas/haut (blendColor) à partir du tableau de samples et d'une couleur de barre.

Écarts :
- Calculer les bins par FFT 64 points / 32 bandes hors fil principal (implémentation FFT pure Kotlin ou android.media.audiofx.Visualizer).
- Vue Canvas de barres 44 dp de haut avec dégradé de teinte bas->haut fréquences, couleur de barre injectée.
- Réutiliser le cache de formes d'onde et l'échelle d'affichage pour ne pas recalculer à chaque recomposition.

Rendu : Piste 44 dp, barres arrondies, couleur de piste (accent) avec montée de luminosité vers les hautes fréquences.

Transposition Android : Accelerate vDSP FFT -> FFT Kotlin (JTransforms ou implémentation maison) ; Canvas Compose pour le dessin.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/AudioSpectrogramView.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`

### Le composer ne fait jamais perdre ma composition sous pression mémoire et nettoie ses fichiers temporaires

`stc2-composer-memory-lifecycle` · Android : **absente** · P2 · effort S

Une alerte mémoire purge des CACHES (vignettes de scène, vignettes vidéo), jamais la composition : loadedImages/slideImages/loadedVideoURLs/loadedAudioURLs sont les SEULES références de ce que l'auteur a posé (#6922) et la publication les lit telles quelles.

Écarts :
- Brancher ComponentCallbacks2.onTrimMemory : vider uniquement les caches recalculables (vignettes), jamais la composition.
- Nettoyer les fichiers temporaires vidéo/audio de session à la fermeture/au démontage du composer.
- reset() public (tout effacer) sans monter l'atelier ; enregistrement idempotent de l'observateur.

Rendu : Aucun visuel.

Transposition Android : UIApplication.didReceiveMemoryWarning -> ComponentCallbacks2.onTrimMemory ; NSTemporaryDirectory -> cacheDir.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Lifecycle.swift`

</details>

### Depuis un autre écran (document, caméra, collage), j'ouvre l'atelier avec un texte, un média, un son ou une scène déjà posés

`stc2-composer-seed-host` · Android : **absente** · P2 · effort M

StoryComposerSeed est une graine OPAQUE (audio, vidéo, scène recomposée, texte, avec origine) posée avant le premier rendu ; applyContentText/Media/Audio font entrer dans la scène courante les médias locaux déjà composés ailleurs, avec rôle fond/premier plan élu par règle pure et rognage source.

Écarts :
- Type de graine (texte, image, vidéo, audio, scène recomposée) consommé à l'ouverture de l'atelier et posé avant le premier rendu.
- applyContentText / applyContentMedia / applyContentAudio : pose d'un média local déjà composé sur la slide courante avec rôle (fond/premier plan) élu par règle pure.
- Rognage source par objet (setSourceTrim) et lecture (sourceTrim) pour les médias venant du document.

Rendu : Aucun visuel propre : la scène s'ouvre déjà garnie.

Transposition Android : Intent d'entrée (ACTION_SEND, ActivityResult) -> argument de navigation sérialisé ; fichiers via FileProvider.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+ContentMedia.swift`

</details>

### Je règle la langue d'un média, d'un son, d'un sticker ou d'un lieu depuis une barre flottante, comme pour un texte

`stc2-element-language-bar` · Android : **absente** · P2 · effort S

StoryElementLanguageBar n'apparaît que quand un objet NON-texte est sélectionné (selectedElementSupportsLanguage, loi : jamais de contrôle inerte) et écrit via le point d'entrée unique updateElementLanguage ; ses choix de langue sont ceux de TextEditToolOptions.languageChoices (aucune liste recopiée).

Écarts :
- Barre flottante de puces de langue dans le canvas, visible uniquement pour la sélection média/audio/sticker/lieu.
- Écrire la langue d'origine par objet via un point d'entrée unique, réutilisant la liste de langues du texte.
- Langue source par défaut 'fr' pour tout objet créé (Prisme).

Rendu : Capsules de langue (code ISO en majuscules) alignées sous l'objet sélectionné, état sélectionné = accentColor ; 44 dp de cible.

Transposition Android : Puces = FilterChip Material dans un Row scrollable ; flottante = overlay dans le Box du canvas.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryElementLanguageBar.swift`

</details>

### Je colle texte, image, vidéo ou son et Meeshy le pose au bon endroit de la story

`stc2-paste-into-composer` · Android : **absente** · P2 · effort S

StoryPastePolicy décide où va ce qu'on colle : un texte de plus de 10 mots devient la description, sinon un objet texte portant déjà son contenu (sans passer par l'éditeur) ; un son est posé en premier plan ; image ou vidéo suivent le même chemin, sauf si aucun fond n'existe (alors fond).

Écarts :
- Port de la règle pure StoryPastePlacement (seuil 10 mots -> description vs objet texte) avec tests.
- Lecture du presse-papiers (texte, URI image/vidéo/audio via ContentResolver) et pose via les chemins d'insertion existants, jamais un pipeline neuf.
- Collage de son : analyse de la forme d'onde, mesure de durée et pose d'un objet audio avec rôle premier plan/fond.

Rendu : Capsule « Coller » discrète sous Caméra/Galerie ; rien d'affiché si le presse-papiers ne porte rien d'acceptable (loi : pas d'affordance sans effet).

Transposition Android : PasteButton / UTType -> ClipboardManager + ClipDescription.MIMETYPE_* ; pas de bouton système unique, afficher une capsule app.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryPastePlacement.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+PastedAudio.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ClipboardContent.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LargePasteDetector.kt`

### Quand je republie une story, on ne me propose jamais une audience plus large que l'original

`stc2-repost-audience-cap` · Android : **absente** · P2 · effort S

StoryRepostAudience est le miroir client de la loi serveur (« même audience ou plus restreinte, jamais plus large », 403 REPOST_AUDIENCE_WIDENING) : allowed(from:) plafonne le sélecteur d'audience du composer ; inheritsAudienceList indique si la liste ONLY/EXCEPT est héritée. Ce n'est qu'une affordance, la garantie reste serveur.

Écarts :
- Porter la règle allowed(from:) et plafonner le sélecteur d'audience quand le composer est ouvert en republication.
- Gérer l'erreur 403 REPOST_AUDIENCE_WIDENING avec un message clair si l'audience est refusée.
- Hériter de la liste d'utilisateurs ONLY/EXCEPT de l'original (inheritsAudienceList).

Rendu : Choix non permis simplement absents du sélecteur (pas grisés).

Transposition Android : Pure logique Kotlin testable JVM.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryRepostAudience.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Je choisis l'animation d'ouverture de ma slide (fondu, zoom, glissement, révélation)

`stc2-slide-transitions` · Android : **absente** · P2 · effort S

Le panneau Transitions (feuille médium « Transitions », bouton OK) pilote l'animation d'OUVERTURE du slide courant (effects.opening) via OpeningEffectChips ; setSlideTransitions écrit opening/closing directement sur la slide pour que canvas et atelier lisent la même valeur.

Écarts :
- Feuille « Transitions » avec chips Fondu / Zoom / Glissement / Révélation et titre « Ouverture du slide ».
- Écrire effects.opening (et closing) sur la slide courante via un point d'entrée unique du ViewModel, persistant dans le brouillon.
- Rendre l'ouverture dans l'aperçu composer et dans le lecteur (le résolveur de transition existe côté lecteur Android pour les clips).

Rendu : Chips d'effet avec icône, sélection accentColor ; feuille arrondie avec poignée visible ; fond sombre, texte blanc et indice à 55 %.

Transposition Android : presentationDetents(.medium) -> ModalBottomSheet partiel ; animations de lecture -> graphicsLayer/AnimatedContent.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Transitions.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryTransitionTolerantSerializer.kt`

### J'enregistre ma story en vidéo MP4 (filigrane, interlude et carte de fin Meeshy), la prévisualise, la partage ou l'enregistre dans Photos

`stc2-timeline-export-preview` · Android : **absente** · P2 · effort M

Le bouton d'export du transport bake la slide en MP4 local (effets, transitions, audio des lanes) avec filigrane portant le pseudo, interlude de marque prépendu et carte de fin logo + signature sonore toujours ajoutée ; un échec d'emballage n'annule pas l'export.

Écarts :
- Export MP4 local de la slide (Media3 Transformer + Composition) avec effets, transitions, audio des pistes et filigrane pseudo.
- Interlude de marque prépendu et carte de fin logo + signature sonore, tous deux dégradant sans perdre l'export en cas d'échec.
- Contrôleur de phase idle / exporting(fraction) / finished / failed, barre de progression, annulation, reprise de la lecture au retour.

Rendu : Overlay de progression centré avec bouton Annuler ; aperçu plein écran noir avec barre d'actions (fermer, partager, enregistrer).

Transposition Android : AVAssetExportSession/StoryExporter -> Media3 Transformer ; AVKit VideoPlayer -> PlayerView ; Photos -> MediaStore.Video + permission d'écriture.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineExportFlow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Export.swift`

</details>

### Les pistes de la timeline montrent de vraies vignettes : pellicule vidéo, image fixe et onde audio

`stc2-timeline-lane-previews` · Android : **absente** · P2 · effort S

VideoFilmstrip extrait N images réparties sur la durée d'un clip (cache NSCache clé URL+nombre+hauteur+échelle, jamais deux extractions) ; ImageStill décode une vignette fixe à la taille cible via CGImageSource (jamais le bitmap plein format).

Écarts :
- Pellicule vidéo : extraction asynchrone de N frames (MediaMetadataRetriever.getScaledFrameAtTime ou Media3 Transformer) avec cache LruCache clé URL+count+hauteur+densité.
- Vignette image fixe décodée à la taille cible (ImageDecoder.setTargetSize / BitmapFactory.inSampleSize), hors fil principal, avec cache.
- Onde audio d'une piste : échantillonnage RMS, hauteur d'affichage échelonnée, cache partagé avec l'éditeur audio.

Rendu : Pellicule continue dans la barre de piste, image fixe répétée/étirée, onde RMS arrondie ; hauteur de lane constante, aucun saut au chargement.

Transposition Android : ImageIO/CGImageSource -> ImageDecoder / Coil ; AVAssetImageGenerator -> MediaMetadataRetriever ; NSCache -> LruCache (taille en octets).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/VideoFilmstrip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/ImageStill.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/SOTAImageThumbnail.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/AudioWaveform.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`

### Le composer s'ouvre déjà déterminé par sa porte et garde la composition quand on change de format

`scomp-host-doors-surfaces` · Android : **divergente** · P0 · effort L

Un seul « meuble » (MeeshyComposerHost) remplace les composers historiques. Il est piloté par une intention (ComposerIntent = origine + format d'ouverture souhaité) et par une table pure de profils : neuf portes (tray des stories, composer du fil, puce mood, repost, édition, brouillon, partage, média de conversation, média de post/story) donnent le format initial, les formats offerts (story, post, réel, mood), la présence des slides et de la timeline, l'ouverture (appareil prêt, clavier sur le contenu, appareil vidéo, grille mood, reprise, média semé) et le droit de capture. Le format est un CHAMP qu'on bascule sans perdre le travail ; la surface montée (atelier de scène, scène incrustée, document sans scène, mood) est dérivée du couple ouverture/format ; une seule feuille modale nommée est ouverte à la fois (ComposerPortal) ; une règle dit qui peint la croix, l'audience et Publier selon la surface. Une story crée son canvas automatiquement ; la première vue n'autorise que AJOUTER, BOUGER, DÉCRIRE.

Écarts :
- Trois composers indépendants (StoryComposerScreen, FeedComposerSheet, StatusComposerSheet) : introduire un hôte unique (ComposerHostViewModel) piloté par ComposerIntent(origine, ouverture) et une table de profils pure (format initial, formats offerts, slides, timeline, ouverture, capture).
- Ajouter les neuf origines (storyTray, feedComposer, moodChip, repost(postId, sourceFormat), edit(postId, format), draft(id), share, conversationMedia, socialMedia) et les brancher à la navigation Android (tray de stories, FAB du fil, puce mood, menus Reposter/Modifier, cible ACTION_SEND, appui long sur un média).
- Bascule de format post/story/réel/mood qui conserve texte, scènes, médias et audience ; un format hors éventail n'est pas affiché (pas grisé) ; le réel n'entre dans l'éventail que si la composition qualifie, le mood seulement depuis le fil.
- Routage pur ouverture × format → surface (atelier, scène incrustée, document, mood) et type ComposerMountedView ; règle de propriété du chrome (qui peint croix, audience, Publier) par surface.
- Une seule feuille modale à la fois (sealed ComposerPortal : lieu, emoji, sticker, son, bibliothèque de sons, référence, langue, caméra, hashtag, audience) au lieu de plusieurs booléens d'état.
- Création automatique du canvas d'une story (graine de slide, showsCanvas, hasPublishableCanvas) et passage atelier → document/scène sans perte (AtelierHandOff).
- Règle « première vue = ajouter, bouger, décrire » : aucune édition d'objet ni bande d'options dans la première vue, l'édition passe par l'éditeur d'objet.

Rendu : Plateau sombre permanent (3 teintes), scène 9:16 figée qui prend toute la largeur, contrôles flottants au-dessus ; le type de publication se choisit à l'envoi (capsule Publier + chevron), aucun sélecteur de format en haut ; transitions ressort, haptique légère à chaque bascule, animations réduites respectées.

Transposition Android : MeeshyComposerHost (View SwiftUI + @State) -> ComposerHostViewModel (StateFlow + sealed UiState) + Compose ComposerHost ; ComposerIntent/ComposerProfile -> data classes pures dans :feature:stories ; fullScreenCover/sheet -> destinations NavHost plein écran et ModalBottomSheet.

<details><summary>Sources iOS (14)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSurfaceRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerMountedView.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerStoryCanvas.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerHostRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPortal.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFirstView.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+MountedView.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Layers.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Resolution.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneState.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+AtelierHandOff.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Portals.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerSheet.kt`

### Composer sur une scène plein écran dont les rails flottent, l'étage du bas se remplaçant selon l'outil ouvert

`scomp-scene-stage-floating-chrome` · Android : **divergente** · P0 · effort L

ComposerSceneSurface est la quatrième vue du meuble : la scène 9:16 figée occupe toute la largeur sur le plateau sombre ; les deux rails (portes à gauche, contrôleurs à droite) flottent sans disque de verre (glyphes blancs en relief) et la scène ne perd aucun pixel. En bas, les « étages » se remplacent : socle (audience + Publier) quand aucun outil n'est actif, options de l'outil ouvert, bande contextuelle (palette de fond, cadre), frise de temps, carrousel d'effets. Au-dessus de la scène : trace du son de fond, description repliable (chevron V/^), bouton « < N » (nombre d'objets). Une scène vide affiche l'invite « Ceci est votre scène — Ajoutez-y un texte, un dessin, une image ou une vidéo — et faites-la vôtre. ». Le fond de scène (sol) est recalculé par une clé de hachage (couleur de fond, version des images) ; les mesures (zone sûre haute, cadre libre, hauteur des étages) remontent par des PreferenceKey.

Écarts :
- StoryComposerScreen est un canvas avec une bande basse à deux FAB (Contenu / Effets) et une rangée de tuiles : refondre en scène plein écran avec rails flottants gauche/droite, sans bande permanente, plateau sombre à 3 teintes.
- Étages du bas exclusifs (ComposerLowZone : toolOptions | band | nothing ; ComposerCanonicalZone : socle) calculés par une règle pure resolve(toolIsOpen, band) ; un outil ouvert prend TOUTE la place (rails gauche et droit se transforment, croix/socle cèdent).
- Bandes contextuelles ComposerSceneBand (palette de fond, cadre) ouvertes par les portes Fond/Cadre, jamais superposées à la frise.
- Invite de scène vide (titre + corps localisés), bouton « < N » (nombre d'objets actifs, libellé parlé) à la place d'« Edit object », bouton V/^ de la description.
- Mesures remontées par le layout (zone sûre haute, cadre de la zone libre, hauteur des étages) pour positionner trace du son, description et carrousel ; clé de sol recalculée seulement quand fond/images changent.
- Garde de lisibilité : jetons isDark:true sur le plateau (le thème clair de l'app ne doit pas dégrader le contraste).
- Android a déjà le canvas pinch/pan, la grille de zone sûre et l'aimantation (StorySnapResolver, StorySafeZoneGrid) à réutiliser.

Rendu : Scène 9:16 centrée avec lettrebox sombre ; rails à 10 dp du bord (outerMargin) ; pastilles 44 dp ; étages du bas en plaque de verre teintée du plateau (opacité 55 %, rayon xl) ; invite centrée en texte secondaire.

Transposition Android : ZStack Compose plein écran + WindowInsets ; PreferenceKey -> onGloballyPositioned + CompositionLocal/State remonté ; safeAreaInset -> systemBars/displayCutout.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneSurfaceKeys.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneFloorRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneBand.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerFirstView.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneState.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySafeZoneGrid.kt`

### Ouvrir un des 7 outils depuis une rangée canonique, avec badge du nombre d'éléments

`sct-composer-tool-row` · Android : **divergente** · P0 · effort M

ComposerToolRow est la rangée de l'atelier : sept entrées de 44 pt (Médias, Son, Texte, Dessin, Fond, Effets, Timeline), chacune avec son glyphe, sa teinte d'outil (média rouge, son/texte indigo400, dessin vert, fond orange, effets bleu, timeline indigo300), un badge du nombre d'éléments actifs, et un libellé d'accessibilité « Ouvrir l'outil X » avec valeur « n élément(s) actif(s) » ou « Aucun élément ». Tap = ouvre/ferme (haptique medium) ; balayage haut ouvre, balayage bas masque le chrome (UIPanGestureRecognizer). ComposerRowFit garantit que la rangée TIENNE dans la largeur : l'écart se resserre sans passer sous son plancher, au-delà la rangée défile et la dernière entrée DÉPASSE du bord pour signaler qu'on peut défiler. Android : deux FABs « Contenu / Effets » ouvrant un tiroir de tuiles.

Écarts :
- Remplacer le modèle à 2 catégories (CONTENU/EFFETS, 4 tuiles) par la rangée canonique de 7 outils : Médias, Son, Texte, Dessin, Fond, Effets, Timeline
- Badge par outil (nombre d'éléments), état actif visuellement distinct, teinte propre à chaque outil
- Gestes : tap ouvre/ferme, balayage haut ouvre le panneau, balayage bas masque le chrome ; haptique medium
- Loi de tenue (RowFit) : resserrer l'écart jusqu'au plancher, puis défiler avec la dernière entrée qui dépasse ; tester à taille de texte maximale
- Accessibilité : libellé « Ouvrir l'outil X », valeur d'état, indice « Touchez deux fois pour fermer/ouvrir »

Rendu : Pastilles verre 36 pt (cible 44 pt), glyphe SF Symbols → Material équivalents, badge numérique en coin, étiquette sous l'icône ; tokens MeeshyColors (error, indigo400/300, success, warning, info).

Transposition Android : LazyRow/Row Compose avec pointerInput(detectVerticalDragGestures) ; HapticFeedback ; semantics { stateDescription } pour le badge.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolRow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerRowFit.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryToolbarPlacement.kt`

### Je compose chaque slide comme une scène 9:16 d'objets libres (textes, médias, sons, stickers, lieux) que je sélectionne, déplace et pivote

`stc2-composer-scene-model` · Android : **divergente** · P0 · effort L

L'atelier iOS pilote une scène 9:16 par slide depuis un seul StoryComposerViewModel (source de vérité) : objets texte (max 5), médias (max 10 dont 5 images et 4 vidéos), sons (max 5), stickers et lieux, chacun avec position normalisée, taille, rotation, zIndex, timing et langue source (défaut fr).

Écarts :
- Android modélise une slide comme légende + mediaIds + textes + stickers + traits : les médias ne sont pas des objets posés sur le canevas.
- Aligner les plafonds sur iOS : 5 textes, 10 médias (5 images, 4 vidéos), 5 sons, 10 slides, et les exposer via canAddText/canAddMedia/canAddAudio pour griser les entrées.
- Sélection unique d'un objet quel que soit son type avec gestes drag + pinch + rotation sur tout objet (aujourd'hui limité aux textes et stickers) et couche de manipulation en cascade.
- Cascade de position des objets neufs (nextObjectPosition, #4939) : ne jamais poser deux objets au même point, hors fonds.

Rendu : Canevas 9:16 centré, coins arrondis, objets en z-order ; sélection = cadre accentColor de la slide avec poignées.

Transposition Android : Pas d'équivalent UIKit CALayer : rendre les objets dans un Canvas/Box Compose à pointerInput unifié, état dans un StateFlow unique du ViewModel Hilt (équivalent ObservableObject).

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+GranularSync.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerProviding.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Elements.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerChildViews.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Régler d'où à où un objet apparaît dans la slide (début, fin, ou visible tout du long)

`scomp-object-timing-window` · Android : **divergente** · P1 · effort S

Le modèle porte startTime et duration, tous deux optionnels (nil = dès le début / jusqu'à la fin). ComposerObjectTiming convertit la paire stockée (début + durée) en fenêtre début-fin réglable à deux glissières, conserve le nil du mode « permanent » (« Visible du début à la fin »), garde la fin >= début et dans la durée de slide ; contrôles de plan 2D (position/échelle/rotation) dans le même panneau. Libellés « De 1,2 s à 6 s ».

Écarts :
- Android règle début/durée par taps cycliques (1, 2, 3, 5, 10, 15, 30 s puis retour à aucun) : remplacer par deux sliders début/fin 0..durée de la slide avec toggle « permanent ».
- Règle pure ComposerObjectTiming (moved, trimmingStart, trimmingEnd) qui préserve nil=permanent et borne à slideDuration ; affichage « De X à Y s ».
- Contrôles de plan 2D (ComposerObjectPlanControls) dans le panneau d'apparition.

Rendu : Deux curseurs étiquetés Début / Fin avec valeurs en secondes ; badge « Visible du début à la fin » quand permanent.

Transposition Android : RangeSlider Material3 pour la fenêtre ; Slider pour un seul bord.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectTiming.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectTimingControls.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementTiming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementVisibility.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`

### Prendre une photo ou filmer dans un viseur intégré au composer, sans quitter l'app

`sct-camera-viewfinder-capture` · Android : **divergente** · P1 · effort M

CameraModel pilote une AVCaptureSession avec deux modes (CameraCaptureMode photo/vidéo, le viseur s'ouvre sur le mode promis par la porte), un déclencheur photo avec flash, un déclencheur vidéo avec chrono (recordingDuration) et un jeton par prise qui suit le fichier jusqu'à sa livraison. CameraPreviewLayer pose l'aperçu (miroir à l'avant). CameraRecordingReadiness interdit toute prise sans session tournante ni connexion vidéo active et activée (sinon AVFoundation lève une exception fatale). CameraResult.photo garde les octets d'origine (EXIF) à côté de l'image. pauseRunning/resumeRunning suspendent la session pendant l'édition sans rien démonter. Android : le composer de story n'a aucune caméra ; chat et feed délèguent à l'appli caméra système.

Écarts :
- Aucun viseur intégré ni session CameraX : tout passe par ACTION_IMAGE_CAPTURE / CaptureVideo, qui quitte l'app et ne rend ni chrono, ni bascule, ni flash dans le chrome Meeshy ; le composer de story n'offre aucune caméra
- Deux modes photo/vidéo avec ouverture sur le mode promis par la porte (vidéo directe pour « caméra vidéo prête »)
- Déclencheur photo (flash auto/on/off) et vidéo (chrono mm:ss, arrêt) derrière une garde de préparation : use cases liés et actifs avant tout takePicture/start
- Jeton de prise par enregistrement suivi jusqu'à la livraison du fichier ; prise perdue signalée (abandonedRecordingId) ; une nouvelle prise attend la livraison ou la perte de la précédente
- Résultat photo = octets JPEG d'origine + EXIF sans ré-encodage ; résultat vidéo = fichier ; contrat de livraison unique vers le composer
- Suspendre/reprendre la session à l'entrée/sortie de l'édition (unbind/bind) en conservant les réglages
- Aperçu miroir à l'avant, capture non miroir

Rendu : Viseur plein cadre sur fond noir, déclencheur central, onglets Photo/Vidéo, chrono rouge pendant la prise, contrôles en verre (MeeshyColors.mediaChromeForeground/Tertiary, scrim mediaScrim) ; retour haptique léger au déclenchement.

Transposition Android : CameraX : ProcessCameraProvider + Preview (PreviewView ou viewfinder Compose) + ImageCapture + VideoCapture<Recorder>, liés au LifecycleOwner du composer ; pause/reprise = unbind/bind ; OutputFileResults pour les octets JPEG et l'EXIF.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraModel+Recording.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraModel+Pause.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraRecordingReadiness.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraResult.swift`
- `apps/ios/Meeshy/Features/Main/Components/CameraPreviewLayer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerCameraChooser.kt`

### À la réouverture, un bandeau compact me propose de reprendre ou de recommencer mon brouillon sans bloquer le canvas

`stc2-draft-resume-banner` · Android : **divergente** · P1 · effort S

DraftResumeCard est un bandeau horizontal (cover 40x68, « Reprendre votre story ? », « N slide(s) · fraîcheur », boutons Recommencer en contour et Reprendre en dégradé, 44 pt, hauteur max 132) posé en bas sans rien recouvrir ; DraftResumeState : ranger n'est pas jeter, seul « Recommencer » efface.

Écarts :
- Android restaure le brouillon silencieusement si le composer est vierge : afficher à la place le bandeau de reprise avec cover composite du premier slide, nombre de slides et fraîcheur.
- Machine DraftResumeState (offer / hideBanner / decide) : ranger n'est pas jeter ; sans contenu réel créé, l'offre revient à l'ouverture suivante.
- Bandeau rangé par la moindre interaction d'authoring (tap canvas, panneau, entrée texte) sans couper l'autosave pour le reste de la session.

Rendu : Capsules 44 dp, bandeau arrondi xl, fond verre sombre quel que soit le thème, cover rognée en scaledToFill avec bordure indigo400 60 %.

Transposition Android : Bandeau = Card/Surface Material en bas de l'écran, fond translucide, bouton gradient de marque ; ultraThinMaterial -> Surface avec alpha.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraftResumeCard.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/DraftResumeState.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Je saisis mon texte dans un panneau à sections repliables (style, couleur, taille, timing) avec mentions @ intégrées

`stc2-text-editor-panel` · Android : **divergente** · P1 · effort M

StoryTextEditorView est un panneau hiérarchique : champ « Saisissez votre texte… », suggestions @ au-dessus de la frappe, actions rapides et onglets repliables Style (18 styles), Couleur (pastilles 30 pt), Taille et Timing (début, durée, fondu in/out) ; l'appui long sur une suggestion choisit un mode de référence que le texte ne peut pas porter.

Écarts :
- Android édite le texte dans un unique OutlinedTextField sous le canvas (même champ pour légende et élément).
- Intégrer la liste de suggestions @ au-dessus du champ (contacts puis annuaire) avec choix du mode de référence en appui long.
- Palette de couleurs en pastilles 30 dp avec anneau de sélection, zoom 1,15 et bord subtil pour les teintes claires en thème clair.
- Sections Taille et Timing (début, durée, fondu in/out) en curseurs continus plutôt qu'en cycles de bouton.

Rendu : Panneau au-dessus du clavier : saisie, chips d'actions, onglets de section, contenu animé du bas ; typographie arrondie, aucune ombre lourde, fond translucide.

Transposition Android : Panneau SwiftUI repliable -> AnimatedVisibility dans une colonne ancrée au clavier ; Haptic light -> HapticFeedbackType.TextHandleMove.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`

### Je choisis mon outil (média, son, dessin, texte, filtres, timeline, fond) et ses options s'affichent dans la bande, pas sur la scène

`stc2-tool-modes-options-panel` · Android : **divergente** · P1 · effort M

StoryToolMode fixe l'ordre canonique unique des sept outils (média, audio, dessin, texte, filtres, timeline, texture) partagé par la barre de FABs, les chips de bascule et la grille d'état vide, avec leurs symboles. MeeshyToolOptionsPanel affiche les options de l'outil déplié (palette, épaisseur, dix-huit styles) dans la bande, pendant que les bulles-contrôleurs restent dans le rail de gauche.

Écarts :
- Android n'a que deux familles (Contenu/Effets) et quatre tuiles : introduire l'énum à sept outils dans l'ordre canonique avec un rail de FABs unique.
- Panneau d'options de l'outil actif (couleur, épaisseur, styles) dans la bande basse, les contrôleurs remplaçant la colonne de gauche avec un (x) final.
- Inspecteur contextuel de la sélection : n'apparaît que pour un objet média (grille de filtres de l'objet).
- Binding unique vers l'objet texte courant (textObjectBinding) réutilisé par la bande, la barre flottante et l'éditeur plein écran.

Rendu : Rail leading de bulles 44 pt ; options latérales comparables dans une bande scrollable horizontalement.

Transposition Android : BottomSheet/Band = ModalBottomSheet ou panneau ancré personnalisé (pas de .presentationDetents).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerToolModes.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeshyToolOptionsPanel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/EmbeddedSceneInspector.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Choisir qui verra la publication dans une feuille qui montre les conséquences (personnes, mentions hors audience)

`scomp-audience-sheet` · Android : **partielle** · P0 · effort M

La chip d'audience du socle ouvre une feuille plein écran (vue 2l) : six audiences (Public, Communauté, Amis, Privé, Seulement certaines personnes, Tout le monde sauf…) avec sous-titre explicatif et coche ; les modes ONLY/EXCEPT ouvrent le sélecteur de personnes dans le même geste et affichent « N sélectionnées ». Une section MENTIONS liste les personnes nommées avec leur mode (dans le texte, badge sur la scène, rangée « Avec… », notifiée seulement) et avertit en ambre quand une mention n'est pas servie par l'audience (« Hors de l'audience choisie — cette personne ne verra pas sa mention »). Une section HASHTAGS permet d'en retirer. Bouton Appliquer ; l'audience appartient à la publication et survit au changement de format ; mémoire par format ; une republication ne propose pas ONLY/EXCEPT (la liste est celle de la source).

Écarts :
- Visibilités incomplètes : FeedPostVisibility = 3 valeurs, StoryVisibility et StatusVisibility = 4 ; iOS en sert six (PUBLIC, COMMUNITY, FRIENDS, PRIVATE, ONLY, EXCEPT). Ajouter ONLY/EXCEPT + COMMUNITY au post.
- Sélecteur de personnes (AudienceUserPicker) pour ONLY/EXCEPT avec liste nominative qui voyage avec l'audience (le gateway refuse une liste vide) ; sous-titre « N sélectionnées » / « Choisir des personnes ».
- Feuille d'audience unique (au lieu de rangées de pastilles par écran) avec sous-titres : « Tout le monde, y compris hors abonnés », « Vos contacts acceptés », « Les membres de vos communautés », « Vous seul — rien n'est publié ».
- Règle ComposerAudienceReach (reaches / excluded / unknown) et avertissement ambre par mention hors audience ; note de portée « L'audience appartient à la publication, jamais à une slide ».
- Mémoire d'audience par format (clé unique statusKey/postKey…) et offre d'audiences plafonnée sur une republication (pas ONLY/EXCEPT).
- Section HASHTAGS de la feuille (puces retirables) et bouton Appliquer ; gate de publication « Choisissez au moins une personne pour publier ».

Rendu : Fond plateau sombre ; lignes 60 dp minimum avec icône 22 dp, titre body medium blanc, sous-titre 11,5 sp à 55 % ; coche pleine teinte accentColor de la conversation/plateau ou cercle vide 20 dp ; séparateur 1 dp à 7 % ; avertissement ambre MeeshyColors.warning.

Transposition Android : ModalBottomSheet plein écran (ou écran de navigation) ; DataStore pour la mémoire d'audience par format.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerAudienceSheet.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAudienceReach.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSurfaceRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Audience.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Socle.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerSheet.kt`

### Un post part même hors ligne et n'oublie aucun fichier (file durable, son posé, sticker importé)

`scomp-document-send-durable` · Android : **partielle** · P0 · effort L

Le document choisit le chemin d'envoi : texte seul -> création directe/file durable ; média + hors ligne -> file durable avec aperçu local et vidage à la reconnexion ; média en ligne -> upload tus puis création ; citation -> repost direct. ComposerDocumentSendPlan refuse en le disant (mauvais format, brouillon vide, réel sans média qualifiant, chemin non durable, refus du publieur). La porte du document (DocumentComposerDoor) monte le meuble, envoie, ferme ; ComposerDocumentDurablePublisher publie depuis une porte sans fil (tray). ComposerSceneAssetCarriage emporte dans le brouillon durable le son posé et le sticker importé (fichiers locaux matérialisés) pour qu'ils partent même si la pré-montée n'a pas abouti.

Écarts :
- PostRepository.createPost et StatusRepository.setStatus sont en ligne seulement : l'outbox n'a que PUBLISH_STORY (pas de CREATE_POST/PUBLISH_MOOD). Ajouter des OutboxKind durables pour post (texte seul, média), réel et mood, avec aperçu optimiste local dans le fil et vidage FIFO à la reconnexion.
- Table pure ComposerDocumentSendPlan.path(...) -> {quotedRepost, textOnly, durableOutbox, upload} et motifs de refus (wrongFormat, emptyDraft, reelWithoutQualifyingMedia, nonDurablePath, publisherRejected).
- Publication depuis une porte sans fil (ComposerDocumentDurablePublisher) : insérer le post optimiste là où un fil existe, sinon seulement enfiler l'envoi.
- Portage des actifs de scène dans le brouillon durable (son posé, sticker importé) : matérialiser les fichiers locaux, ne jamais laisser un file:// nettoyé par le sanitizer.
- Brouillon de document : projection ComposerDocumentDraft (texte, médias locaux, lieu + précision de découvrabilité, langue, références, audience + liste, type) distincte pour post/réel/mood.

Rendu : Post optimiste en tête du fil avec indicateur d'envoi discret, jamais de spinner bloquant ; échec -> carte « Échec de la publication » avec réessayer.

Transposition Android : OutboxKind (Room) + WorkManager pour le vidage ; TUS déjà présent (TusUploadRepository).

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSendRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentDurablePublisher.swift`
- `apps/ios/Meeshy/Features/Main/Composer/DocumentComposerDoor.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneAssetCarriage.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Draft.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`

### Écrire un post : texte, rangée d'outils (photo, caméra, emoji, texte-scène, fichier, lieu, micro, mention), pièces jointes et langue

`scomp-document-surface-post` · Android : **partielle** · P0 · effort L

Surface « document sans scène » : avatar + zone de texte (invite « Qu'avez-vous en tête ? »), carte du son de contenu sous le texte avec transcription défilante, médias joints (10 max, message « Dix médias au maximum par post — celui-ci n'a pas été ajouté »), capsule de langue du document, lieu, couleur de fond du texte (palette) et rangée d'outils canonique [photo, caméra, emoji, texte-scène, document, lieu, micro, mention]. Chaque outil a un EFFET déclaré (attache un média local photothèque/caméra/fichiers, insère un emoji, compose une scène de texte, ouvre le sélecteur de référence, attache un lieu, attache un audio transcrit) ; un outil sans effet est absent (jamais grisé). La rangée défile avec un indice de débordement (dernière tuile qui dépasse) et cibles 44 pt. Les légendes de média (rôle caption) et le corps du post (rôle content) sont deux textes distincts selon le profil.

Écarts :
- FeedComposerSheet couvre photo/vidéo (PickVisualMedia), caméra système (TakePicture/CaptureVideo), fichier, micro (MediaRecorder) et lieu brut, langue et texte alternatif ; il manque l'emoji dans le texte (picker non livré), l'outil mention, l'outil « texte-scène » (composer un texte sur une scène) et la palette de fond du texte.
- Pas de plafond affiché « Dix médias au maximum par post » ni de rangée à débordement signalé (tuile qui dépasse) ; ajouter la règle ComposerDocumentToolRow (largeur, overflow, lastTilePeeks) pour garantir que tous les outils sont atteignables à 360 dp.
- Carte du son de contenu sous le texte avec lecteur et transcription qui défile (ComposerForegroundSound) ; micro iOS ouvre un composer audio dédié avec transcription locale puis choix de langue, absent côté Android.
- Distinguer corps du post (content) et légende de média (caption) selon le format (ComposerSlideTextRole) : en Post la légende du média courant et le corps sont deux champs.
- Rangée d'outils déclarative : ComposerDocumentToolEffect (attachesLocalMedia(photoLibrary|camera|files), insertsEmojiIntoText, composesTextScene, opensReferencePicker, attachesLocation, attachesTranscribedAudio) et servedRow = outils ayant un effet.
- Lieu : sélecteur plein écran avec carte, recherche, reverse-géocodage (nom/adresse) au lieu d'un simple fix GPS ; chip retirable.
- Libellés d'accessibilité de groupe (outils du document, médias joints, lieu et langue de la publication).

Rendu : Fond plateau sombre ; avatar + texte en haut, médias en rangée, rangée d'outils au bas du clavier ; couleurs de premier plan = jetons isDark:true (jamais le thème de l'app) ; cellules 44 dp mini ; scroll interactif qui ferme le clavier.

Transposition Android : PhotosPicker -> PickVisualMedia ; fileImporter -> OpenMultipleDocuments ; CameraView -> intent système (rapide) puis viseur CameraX (voir scomp-capture-*) ; LocationPickerView -> Maps Compose/MapLibre + Geocoder.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface+Copy.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentToolRow.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSlideTextRole.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+DocumentSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Captions.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaPicker.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CameraCaptureFile.kt`

### Le rail de gauche ajoute de la matière à la scène (média, son, texte, fond, dessin, sticker, mention, hashtag, lieu, corps du post)

`scomp-leading-rail-doors` · Android : **partielle** · P0 · effort M

Dix portes canoniques (content, media, sound, text, background, drawing, sticker, mention, hashtag, place ; la porte description existe pour donner le focus à la légende, qui s'écrit sur la scène) classées par NIVEAU (publication, slide, objet, scène) : le niveau décide où la porte se pose (objets/scène = rail gauche ; publication/slide = ligne basse), il dépend du format (en Story lieu/hashtag/mention/texte deviennent des objets à gauche). Une porte non servie est ABSENTE, jamais grisée ; Mood retire lieu et texte ; Post ajoute « corps du post », Story retire la description. Le rail a deux états : portes (ajout additif) ou contrôleurs de l'outil en cours (dessin / texte) terminés par (x). Chaque porte porte un compteur de ce qu'elle contient déjà (textes, stickers, traits, sons, médias), l'appui long de Média propose « Prendre une photo » ou « Depuis les fichiers », et un appui long de son propose enregistrer/emprunter/importer. Géométrie : rail 44 pt, rangée qui défile avec indice de débordement, libellés masqués aux grandes tailles de police.

Écarts :
- Android n'a que 4 tuiles (TEXT, MEDIA, STICKER, DRAW) dans une bande : ajouter son, fond, mention, hashtag, lieu, corps du post (et la porte description qui donne le focus à la légende), et la logique de niveau ComposerRailDoor.level(for: format).
- Règle offered(served, format, allowsCapture) : porte absente si non servie, retraits par format (Story sans description, hors Post sans corps, Mood sans lieu/texte/objets).
- Mode du rail : doors | tool(contrôleurs dessin ou texte + (x) « Terminer l'outil ») — le dessin capture le doigt sur toute la scène et prime sur le texte.
- Compteur sur chaque porte (ComposerRailDoorBadge.matter/count : description 0/1, contenu, médias, sons, textes, traits, stickers) en pastille, avec libellé d'accessibilité.
- Appui long sur la porte Média : menu « Prendre une photo » (si le format sert la caméra et que le viseur n'est pas armé) / « Depuis les fichiers » ; actions nommées TalkBack équivalentes.
- Rail positionné en « début » (start) et non « gauche » pour l'arabe (RTL) ; rangée basse qui défile avec dernière tuile entrevue ; libellés masqués si fontScale élevé.
- Une porte média pose un MeeshySceneObject de premier plan, le fond est une porte distincte à plan background.

Rendu : Glyphes en ligne blancs avec relief (ombre portée), tinte accent pour l'outil actif ; aucune capsule autour de chaque porte sur la scène plein écran ; 44 dp ; espacement 2 dp entre entrées flottantes ; (x) toujours en dernière position.

Transposition Android : Column/Row Compose avec LazyColumn défilable ; BadgedBox pour le compteur ; DropdownMenu pour l'appui long (combinedClickable).

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerLeadingRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailDoor.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailDoorBadge.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailDoorLongPress.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerRailMode.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`

### Un média ajouté devient le fond ou un objet de premier plan selon son rôle, depuis photothèque, fichiers, caméra, collage ou graine

`scomp-media-intake-placement` · Android : **partielle** · P0 · effort L

Tout média visuel entre avec un RÔLE (fond / premier plan) et une PORTE d'entrée (rangée du document, rail de la scène, série de scènes) ; ComposerMediaPlacement décide de la pose : pas de fond -> il devient le fond, sinon objet de premier plan, plusieurs médias à l'ouverture fondent autant de scènes (jusqu'à dix), 'railPosesNextMedia' force le premier plan. À l'ouverture, 'opensOnPicker' montre la photothèque selon l'origine. Photothèque (PhotosPicker, charge en parallèle, plafond dix), fichiers (importer), caméra, collage (voir scomp-paste-drop-into-composer) et GRAINES (média de conversation, de post, de story, de partage) passent par le même pont URL source -> objet. Huit porteurs (listes de fichiers, index slide<-URL, rôle par URL, légendes…) sont tenus par un store observable unique (ComposerMediaPorterStore) au lieu de huit @State. Une graine est ingérée côté document (ComposerSeedIngestion). Politique de source (photothèque / caméra / fichiers) et refus si caméra non servie.

Écarts :
- Android choisit des médias via PickVisualMedia et les range en tuiles/arrière-plan par bascule manuelle (« Set as background ») ; implémenter la décision de pose automatique (pas de fond -> fond, sinon premier plan) et le rôle par entrée (ComposerMediaRole / ComposerMediaDoor / ComposerRailPosing).
- Série de scènes : plusieurs médias choisis à l'ouverture fondent autant de scènes (jusqu'à 10) ; message de plafond ; règle opensOnPicker(origin, compositionIsEmpty).
- Store de porteurs observable unique (équivalent de ComposerMediaPorterStore) tenant fichiers locaux, index slide<-URL, rôles, légendes, bitmaps ; invariant « un média posé deux fois » interdit (syncPostMediaIntoSlides reconnaît un média à son URL).
- Graines : ouvrir le composer sur un média de conversation / de post / de story / de partage (ACTION_SEND) avec ingestion document (ComposerSeedIngestion.plan).
- Pont document <-> scène (carryContentIntoSceneIfNeeded, seedStoryCanvasIfNeeded) lors des bascules de format.
- Chargement photothèque en parallèle avec états 'Préparation du média…' et 'Ce média n'est pas disponible. Vérifiez votre connexion, puis réessayez.'.

Rendu : Spinner non bloquant sur la tuile pendant la préparation ; aucune image figée ; bitmaps décodés à 1080 px max.

Transposition Android : PhotosPicker -> PickVisualMedia/PickMultipleVisualMedia ; Transferable -> contentResolver + copie dans cache app ; App Group -> Intent extras.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaPlacement.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaPorterStore.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSeedIngestion.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Ingestion.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+ScenePicking.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Porters.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaPicker.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaUploader.kt`

### Le rail de droite pilote l'objet sélectionné, l'outil ouvert ou les effets de la scène, avec temps et historique en pied

`scomp-trailing-rail-object-controls` · Android : **partielle** · P0 · effort M

Colonne de contrôleurs dont le contenu dépend du FOCUS : aucun objet ni outil -> effets de la scène (Ouverture, Visuel quand le fond est un média) ; un outil ouvert -> ses contrôleurs + (x) ; un objet sélectionné -> « Modifier », puis les sous-outils de son édition en place (texte : police, couleur, alignement, fond, contour, effet, langue ; média : filtre, réglages, effets, rogner, actions, décrire ; timing ; plan 2D), puis les actions (monter, reculer, sortir de la scène, dupliquer, supprimer) et (x). Les options du sous-outil ouvert se déplient À DROITE depuis le haut dans une plaque de verre qui défile (largeur libérée par la colonne gauche vide pendant l'édition). Le pied de colonne est TOUJOURS l'historique (annuler/rétablir) sous « Temps » quand la scène est animée. Nouvelle slide « + » dès qu'une slide existe.

Écarts :
- Android édite via une TextStyleToolbar fixe et un menu d'élément : introduire la colonne trailing à focus (scène / outil / objet) avec liste d'entrées calculée par une règle pure (ComposerTrailingColumn.options).
- Famille d'édition (ComposerInlineFamily : text, image, video, audio, sticker, place, background(isVideo)) qui décide des sous-outils servis ; un objet qui devient fond change de famille et ferme son édition.
- Panneau d'options à droite depuis le haut (ComposerInlinePanelLayout) : largeur = largeur libérée, hauteur = contenu jusqu'au maximum libre, au-delà défile ; un seul sous-outil ouvert à la fois.
- Actions d'objet unifiées avec l'appui long (modifier, avancer, reculer, sortir de la scène, dupliquer, supprimer) — même liste, autre géographie.
- Pied de colonne = historique (undo/redo) + « Temps » (frise) ; (x) d'outil et (x) de sélection qui ne défilent jamais.
- Entrées d'effets de scène (Ouverture / Visuel) uniquement quand la scène a un fond média (Visuel seulement sur image).

Rendu : Pastilles 44 dp en relief blanc, état ouvert teinté ; plaque d'options en verre teinté du plateau, coin xl ; défilement vertical dans la plaque ; entrées alignées au haut de la colonne.

Transposition Android : Colonne Compose + panneau (Surface) ancré en haut-fin ; combinedClickable pour double tap = Modifier.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerTrailingRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneColumns.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerInlineEdit.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerInlineToolPanel.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneColumns.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+InlineEdit.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+ObjectEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextObjectView.kt`

### Ouvrir, agrandir, réduire ou fermer le panneau d'outils en le tirant par sa poignée

`sct-composer-bottom-band` · Android : **partielle** · P0 · effort M

ComposerBottomBand pose le panneau sous le canvas selon BandStateMachine (hidden, toolPanel(outil), formatPanel(texte ou média, id)) avec l'invariant INV-1 : chrome masqué volontairement ⇒ état hidden. La poignée (zone de contact 44 pt, libellé « Poignée de la barre d'outils ») redimensionne le panneau pour TOUT outil (min/max), et tirer nettement sous le minimum le FERME et rend la rangée ; hors redimensionnement un balayage bas ferme. Le fond de verre saigne sous l'indicateur d'accueil, la hauteur réelle et le haut réel de la bande sont remontés au parent pour réserver le canvas, un changement de slide réinitialise la machine. Animation spring (0,3 / 0,85). Android : tiroir animé qui se ferme au balayage bas et change de catégorie au balayage latéral.

Écarts :
- Machine d'états à 3 cas (hidden / toolPanel(outil) / formatPanel(texte|média, id)) et invariant chrome masqué ⇒ hidden
- Poignée redimensionnable (min/max) pour tous les outils, fermeture quand on tire plus de 50 pt sous le minimum, libellé et indice d'accessibilité
- Remonter hauteur réelle et bord haut réel de la bande pour que le canvas se recale exactement au-dessus (jamais recouvert)
- Réinitialiser la machine au changement de slide ; fond de la bande sous la zone des gestes système
- Animation spring de montée/descente et transition move+opacity

Rendu : Panneau verre arrondi en haut, poignée grise 5 pt, panneaux de hauteur par défaut : média/son 220, dessin/texte 280, fond 236, effets 180, timeline 392.

Transposition Android : Modifier.draggable/anchoredDraggable ou BottomSheetScaffold avec détente personnalisée ; WindowInsets pour la zone des gestes ; onGloballyPositioned pour remonter la hauteur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Le chrome du composer ne montre que ce qui sert : amorces, bandeau de reprise, tap sur le fond, restauration

`sct-composer-chrome-policy` · Android : **partielle** · P0 · effort M

ComposerChromePolicy résout, depuis un contexte brut unique (ComposerChromeContext : bande, chrome masqué, édition de texte, dessin liste/immersif, viewport zoomé, timeline, page blanche, bandeau de reprise), l'état de bande effectif (priorité dessin liste > dessin immersif > timeline > machine), la visibilité du chrome plein, les amorces d'une page blanche (« Touchez pour écrire », Caméra, dernière photo), le bandeau de reprise de brouillon (rangé par toute interaction) et l'action d'un tap sur le fond (5 cas non commutatifs : ignorer, ranger le bandeau, démarrer le texte, basculer le chrome, fermer le panneau). ComposerControlsLayer porte la couche : poignée de récupération du chrome (« Afficher les outils »/« Masquer les outils », action d'accessibilité), balayage bas pour fermer, état d'un panneau fermé quel que soit le chemin. Android : brouillon sauvegardé automatiquement, sans cette politique.

Écarts :
- Contexte de chrome unique (valeur pure) et fonctions pures : bande effective, chrome plein visible, page blanche d'auteur, amorces, bandeau de reprise, action du tap sur le fond, issue de la fermeture
- Amorces d'une page blanche : indice « Touchez pour écrire », caméra, dernière photo ; masquées dès qu'un outil est ouvert
- Bandeau de reprise de brouillon non modal, rangé par toute interaction sans jeter le brouillon
- Masquer/afficher volontairement le chrome (tap sur fond au repos, balayage bas) avec poignée de restauration 44 pt et action d'accessibilité
- Fermeture d'un panneau par tous les chemins (Retour, balayage, poignée, tap sur le fond) sans laisser l'écran nu
- Réinitialisation du chrome au changement de slide ; cohérence stricte entre en-tête et FABs (une seule vérité)

Rendu : Poignée de restauration discrète en bas, bandeau de reprise en overlay bas dégageant le rail (réserve de 48 pt de FAB + marge + safe area).

Transposition Android : Objet Kotlin pur + StateFlow d'état de chrome dans StoryComposerViewModel ; Compose AnimatedVisibility ; semantics { customActions } pour la restauration.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerChromePolicy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`

### Éditer chaque outil dans son panneau, avec retour et bascule directe vers un autre outil

`sct-composer-tool-panel-host` · Android : **partielle** · P0 · effort M

ComposerToolPanelHost rend le panneau de l'outil ouvert : une pastille « Retour » (+ titre de l'outil) et des chips pour basculer vers les autres outils (haptique light), puis le contenu. Panneau Médias : une rangée par média (fond/premier plan, couper/rétablir le son d'une vidéo, ouvrir l'éditeur de recadrage, accessibilité inline, supprimer) ; Son : importer un fichier, enregistrer, bibliothèque, liste des pistes (cellules audio) ; Dessin : liste des traits ; Texte : une rangée par texte (ajouter et éditer, modifier) ; Fond : couleurs + rangée « Ouverture » ; Effets ; Timeline (392 pt). Hauteurs par défaut par outil, marges horizontales par outil. Il ouvre aussi les sélecteurs de stickers, de lieu et de mention. Android : tuiles Contenu et rangées Fond / Filtres / Durée / Visibilité sans notion de panneau par outil.

Écarts :
- Panneau par outil avec en-tête Retour + chips de bascule (les 6 autres outils), libellés localisés Médias/Son/Texte/Dessin/Fond/Effets/Timeline
- Panneau Médias : rangée par média (fond/premier plan, son vidéo, recadrage, accessibilité, suppression) au lieu de la simple vignette actuelle
- Panneau Son : importer / enregistrer / bibliothèque + liste des pistes audio (aujourd'hui aucun audio à la création)
- Panneau Texte : liste des textes avec ajout+édition immédiate ; Panneau Dessin : liste des traits
- Panneau Fond : couleurs et rangée Ouverture ; panneau Timeline intégré
- Hauteurs par défaut et marges par outil ; ouverture des sélecteurs sticker / lieu / mention depuis les panneaux
- Le magasin d'accessibilité vit au-dessus de l'hôte pour survivre à ses démontages

Rendu : Pastille Retour en capsule ultraThinMaterial (chevron + titre 14 semibold), chips de bascule 12 medium fond blanc 8 % / indigo950 6 %, trait hairline ; gouttière horizontale propre à chaque outil.

Transposition Android : Composable par outil derrière un when(StoryToolMode) ; état de saisie hissé dans le ViewModel ; sélecteurs en ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`

### J'ajoute photos et vidéos comme objets de la scène (galerie ou caméra), avec chargement, mesure et alerte si un média est perdu

`stc2-foreground-media-objects` · Android : **partielle** · P0 · effort M

Les photos et vidéos sont posées comme StoryMediaObject sur la slide épinglée (galerie ou caméra), avec chargement hors fil principal et downsample 1080, vignette et mesure unique de la vidéo (ratio, durée), indicateur « Chargement de l'image/vidéo… », échec de chargement annoncé, pool de lecteurs vidéo borné, légendes vidéo et alerte « Médias indisponibles » après restauration d'un brouillon incomplet.

Écarts :
- Android montre les médias dans une rangée sous la toile avec un seul fond : créer de vrais objets média (position, taille, rotation, ratio, durée) posés sur le canevas.
- Chargement hors fil principal avec downsample 1080 (ImageDecoder), vignette vidéo et overlay « Chargement… » avec progression.
- Mesure vidéo unique (vignette + ratio + durée) pour les DEUX chemins de pose (galerie et caméra) afin que le ratio ne soit jamais perdu.
- Épingler la slide visée par un travail asynchrone : une slide supprimée entre-temps ne redirige pas le média vers la slide courante.

Rendu : Médias de premier plan rendus avec coins arrondis et cadre de sélection ; overlay de chargement centré (spinner + libellé + barre), jamais de saut de mise en page.

Transposition Android : PhotosPicker/PHPickerViewController -> Photo Picker (PickVisualMedia) ; ImageIO downsampling -> ImageDecoder.setTargetSize.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Capture.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+MediaObjects.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+VideoMeasure.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoCaptionMetadata.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Media.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaPicker.kt`

### Je publie en un tap : la story part en arrière-plan, les slides vides ne partent pas et le bon format (story, post, réel) est annoncé

`stc2-publication-handoff` · Android : **partielle** · P0 · effort M

publishAllSlides refuse un double tap, flushe la timeline ouverte, rabat les effets du canvas, filtre les slides VIERGES (repli sur la liste d'origine), annonce « Publication de la story/du réel/du post lancée » et remet à l'hôte slides, médias, langue, audience servie (ids ONLY/EXCEPT), références, texte alternatif/légendes, opt-in d'extraction du son et « aussi en réel ».

Écarts :
- Android publie via l'outbox durable et ferme optimistement : conserver, et ajouter le filtre des slides vierges (slideHasContent / deservesAPost) avec repli sur la liste complète.
- Rabattre les effets du canvas courant sur la slide courante et flusher la timeline ouverte avant le hand-off.
- Loquet anti double-tap posé seulement sur un hand-off accepté (un refus ne grise pas Publier à vie).
- Annonces TalkBack localisées par format publié (story, réel, post) et retour haptique de succès.

Rendu : Aucun écran de progression bloquant : le composer se ferme tout de suite, un toast final signale succès/échec ; bouton Publier désactivé tant que rien de publiable.

Transposition Android : Hand-off en arrière-plan -> outbox durable (déjà en place) / WorkManager ; annonce VoiceOver -> View.announceForAccessibility.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Publication.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryThumbHashEnricher.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`

### Choisir le fond de la scène (couleur, image, vidéo) et régler Ajuster/Remplir avec le fond des bandes

`scomp-background-frame-tools` · Android : **partielle** · P1 · effort M

La porte Fond (niveau scène) déplie la bande palette (couleurs + effet d'ouverture) ; sous un fond média la porte est remplacée par le bouton Cadre du rail droit qui ouvre le panneau CADRE : Ajuster (le média entier) ou Remplir (couvre la scène), et fond des bandes d'un média ajusté (Flou, Noir, Blanc, Indigo, Sable). Un appui long sur le fond média offre « Modifier / Ramener en avant / Supprimer » (+ « Reprendre une photo » si la caméra est servie). Le sol de la scène reflète le fond choisi. Un tap sur le fond vide arme la caméra (scène vide) selon une politique pure.

Écarts :
- Android sait poser un média en fond avec cadrage (StoryBackgroundFraming) et une rangée de pastilles de couleurs ; il manque le panneau CADRE (Ajuster/Remplir) et les cinq fonds de bande (Flou, Noir, Blanc, Indigo, Sable) ainsi que la règle fitMode/backdrop sur StoryBackgroundTransform.
- Menu d'appui long du fond média (Modifier, Ramener en avant, Supprimer destructif en dernier, Reprendre une photo) avec titre « Fond de la scène ».
- Politique de tap sur le fond (ComposerSceneBackgroundTapPolicy) : arme la caméra sur fond vide, sinon sélectionne/édite le fond ; outils du fond (entrée/sortie annoncées).
- Porte Fond cachée sous un média de fond (le Cadre prend le relais).

Rendu : Pastilles rondes de fond (flou en dégradé), choix Ajuster/Remplir en deux boutons icône+texte, titre « Cadre » ; menu destructif en rouge séparé.

Transposition Android : DropdownMenu au point du doigt ; Brush pour pastilles de fond ; flou = RenderEffect.createBlurEffect.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerFrameBand.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerBackgroundMenu.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneFloorRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Frame.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+BackgroundMenu.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundMedia.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundFraming.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`

### Une création en cours est sauvegardée toute seule et rouverte à l'identique (médias, scènes, audience, choix de publication)

`scomp-composer-autosave-draft` · Android : **partielle** · P1 · effort L

Un contrôleur débouncé (1,2 s) capture l'état du meuble sur le fil principal et écrit hors fil : snapshot.json + media/ sous Application Support/ComposerAutosave/<compte+environnement>/<slot>/ (hors tmp, hors sauvegarde cloud). L'aller-retour codec (URL <-> nom de fichier par la même table pour les huit porteurs, bitmaps, blobs) est pur et testable. Trois règles : une session n'écrase jamais un brouillon qu'elle n'a pas fait sien (graine/partage ne restaure rien), vider la création efface le brouillon (seulement le sien), après une publication acceptée plus rien n'écrit. Un brouillon n'est jamais servi hors du couple compte+environnement. Un seul tiroir « creation » par compte+environnement : le FORMAT, le texte du document, les huit porteurs de média, le lieu et les personnes nommées voyagent dans le snapshot ; l'atelier du SDK garde son propre brouillon (StoryDraftStore, reprise « Mes stories », édition par editingPostId, adoptée à la réouverture de « Modifier »). Flush sur passage en arrière-plan.

Écarts :
- L'autosave Android ne couvre que la story (texte, filtre, fond, éléments, stickers) ; les traits de dessin (strokes) ne survivent pas à la fermeture/process death (StoryDraftSlideSnapshot sans champ strokes) : ajouter strokes au snapshot.
- Brouillon absent pour le post/document, le réel et le mood (FeedComposerDraft/StatusComposerDraft sont en mémoire) : étendre à tous les formats avec un tiroir unique « creation » dont le snapshot porte le format (code story/post/reel/status).
- Persister les médias (copies locales sous filesDir/ComposerAutosave/<compte+env>/<slot>/media), la table URL<->nom et les bitmaps (stickers importés), pas seulement des références.
- Règles d'écriture : mayWrite/ownsStoredDraft (une session semée ne restaure ni n'efface), discard après publication acceptée, vider = effacer son propre brouillon, couple compte+environnement.
- Débounce 1,2 s, écriture sur dispatcher IO, capture des valeurs sur le thread principal ; flush au passage en arrière-plan (onStop) ; waitForPendingWrites pour les tests.
- Décision d'ouverture pure (restores / preservesStoredDraft / disabled selon atelier, hydratation, reprise, graine, mood) et adoption du brouillon d'édition le plus récent hors publication en vol (ComposerEditDraftResumption.draftId).

Rendu : Aucun visuel ; restauration silencieuse sans écran d'attente.

Transposition Android : Application Support -> Context.filesDir (hors cache, exclu des sauvegardes via android:fullBackupContent) ; JSON -> kotlinx.serialization ; scenePhase -> Lifecycle ON_STOP.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerAutosaveCodec.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAutosaveController.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAutosaveSnapshot.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAutosaveStore.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Autosave.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryComposerDraftStore.kt`

### Régler une image ou une vidéo posée : filtre, réglages, bloom/grain, comparer à l'original, rogner, muet, pivoter, texte alternatif

`scomp-media-adjust-filter-trim-alt` · Android : **partielle** · P1 · effort L

Sous-outils média de l'éditeur (vue 2d) : Filtre (teinte de la SLIDE), Réglages (exposition, luminosité, contraste, saturation, vibrance, température, netteté, flou, vignette — une propriété de l'objet cuite par le player ; la vidéo reçoit les réglages sans netteté ni flou), Effets (bloom, grain, image seulement), Rogner (bande de rognage d'une source avec durée), Actions (muet, quart de tour), Recadrer (rapports mesurés), Décrire (texte alternatif de CE média). « Comparer » maintenu affiche l'original sans toucher au modèle (ni historique ni autosave) avec indice « Affiche l'image d'origine tant que vous maintenez ». Le fond média reçoit aussi les réglages.

Écarts :
- Android applique un filtre de slide à 9 presets avec intensité (StoryFilterMatrix) ; il manque les 9 réglages par objet (exposition…vignette, température, netteté, flou) et les effets bloom/grain, appliqués par ColorMatrix/RenderEffect/GL à l'image et trame par trame à la vidéo.
- Comparer (appui maintenu) : projection shown(slide, comparing id) sans écrire le modèle ; libellés « Comparer », « Image d'origine », « Vidéo d'origine » ; bouton « Réinitialiser ».
- Rognage d'une source avec durée (bande, MediaTrimBounds) : StorySourceWindow et StoryMediaCrop existent côté lecteur mais aucun UI ; ajouter bande de rognage (vignettes + poignées) et règle minimumSegment.
- Actions média : Muet (switch) et Pivoter (quart de tour) ; Recadrer avec proportions (Original, 1:1, 4:5…) et crochets.
- Texte alternatif par média (Décrire) dans l'éditeur de scène (FeedComposerSheet l'a pour les pièces jointes de post mais pas pour la scène).
- Sections servies = filtre, réglages, effets, rogner, actions, décrire dans cet ordre ; crop et split non servis tant que le contrat ne les porte pas.

Rendu : Curseurs étiquetés avec valeur, bouton Comparer en bas de la section, bande de rognage avec poignées 44 dp et vignettes de trames, indices localisés sept langues.

Transposition Android : CIFilter -> GPUImage/RenderScript remplacé par AGSL RuntimeShader (API 33+) ou ColorMatrix + OpenGL ; AVAssetImageGenerator -> MediaMetadataRetriever/Media3 ; MediaTrimStrip -> composable bande avec vignettes.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaAdjust.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaControls.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerInlineToolPanel.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView+Media.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Captions.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`

### Pendant qu'on compose, les médias montent déjà : « PRÊT » ou « MONTÉE EN COURS · 34 % — 4,8 / 14,2 Mo »

`scomp-media-preupload` · Android : **partielle** · P1 · effort M

Un registre de pré-montées indexé par fichier (états idle / uploading(sent,total) / ready(postMediaId, remoteURL) / failed) lance la montée TUS des fichiers >= 64 Ko dès l'ajout (chunk 5 Mo, parallélisme borné, échec qui ne bloque pas), de sorte qu'à la publication il ne reste qu'un accusé à attendre. Rogner n'invalide pas la montée (les bornes voyagent avec la publication). L'état se dit en octets ET pourcentage (formatage localisé, unités adaptées), et un fichier prêt est réutilisé au publier. Au publier la pré-montée s'arrête proprement. Payant seulement pour certains formats (pays(for:)).

Écarts :
- Android téléverse à la sélection (TUS + file durable) mais n'expose pas l'état par fichier (sent/total, prêt, échec) ni la réutilisation au publier ; ajouter un registre ComposerPreUploadRegistry (StateFlow<Map<Uri, State>>) avec règles mayBegin(fileSize>=64Ko, alreadyRemote), pays(for:), publishReuses(state).
- Libellés d'état « PRÊT » / « MONTÉE EN COURS · 34 % » + « 4,8 / 14,2 Mo » (ByteCountFormatter localisé) sur les tuiles média.
- Concurrence bornée et drain FIFO ; un échec reste récupérable (retry au publier) et n'invalide jamais la composition.
- Fichier en attente retrouvé par postMediaId + mediaURL (pendingFile) après redémarrage ; arrêt propre à la publication (stopForPublication).

Rendu : Mention d'état en capitales discrètes sur la tuile, barre fine de progression ; jamais de spinner modal.

Transposition Android : TUS client déjà présent (TusUploadRepository + checkpoints Room) ; WorkManager pour la reprise.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerPreUpload.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPreUploadCopy.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerPreUploadRegistry.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+PreUpload.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaUploader.kt`

### Retirer un média ou une scène nettoie tout ce qu'il laisse derrière lui (uploads, fichiers, index)

`scomp-media-retraction-cleanup` · Android : **partielle** · P1 · effort S

Le composer tient deux porteurs de la liste des médias : ce que la vue peint (effects.mediaObjects) et ce que la publication téléverse (huit champs). Retirer un objet ou une scène purge les deux : recensement du canvas (ComposerCanvasCensus), survivants, fichiers orphelins, pré-montées annulées. Sans cela un média supprimé partait quand même à la publication.

Écarts :
- onRemoveMedia annule l'upload durable et StoryDraftMediaReconciler réconcilie au rechargement ; ajouter une rétraction complète (objets d'une scène supprimée, fichiers locaux uniquement référencés par elle, index URL, rôles, légendes).
- Recensement pur du canvas (ComposerCanvasCensus.of(slides)) pour savoir ce qui survit à un retrait ; tests de conservation.

Rendu : Aucun visuel propre ; aucun média orphelin ni fichier résiduel.

Transposition Android : Fonctions pures dans :feature:stories.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaRetraction.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerMediaPorterStore.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Retract.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Publier une humeur en un geste : grille d'emojis, un mot de 122 caractères, audience, republication, confirmation sans mot

`scomp-mood-composer` · Android : **partielle** · P1 · effort M

Surface Mood : titre-question « Comment tu te sens ? » (ou « Republier un status » + bandeau « Status de @X »), grille de 5 colonnes d'emojis (cellules 56 pt) avec bascule (retaper désélectionne) et dernière cellule « Autres emojis » ouvrant la feuille complète (l'emoji choisi hors grille s'affiche dans la grille), ruban d'audience (offre plafonnée en republication), champ mot tronqué à 122 caractères (compteur qui change de couleur à 101), entrées de références. Publier est dans l'en-tête (verre) et exige un emoji. Sans mot, une confirmation « Publier ton humeur sans un petit mot ? » propose « Ajouter un mot » (focus champ) ou « Publier quand même ». La porte récupère un mood bloqué hors ligne (supplante la ligne de l'outbox au lieu de la doubler) ; une republication de mood peut s'ancrer en post.

Écarts :
- Déjà là : grille d'emojis, texte plafonné à 122, 4 visibilités, republication avec via/audio. Manque : audience ONLY/EXCEPT + liste nominative, références/mentions, feuille complète « Autres emojis » avec l'emoji hors grille réinjecté dans la grille.
- Confirmation « Publier ton humeur sans un petit mot ? » (Ajouter un mot / Publier quand même) à la validation sans texte, avec ramener le focus au champ.
- Récupération hors ligne d'un mood bloqué (recoverUnsentStatus + supersede par clientMutationId) : nécessite une entrée outbox dédiée (OutboxKind) et la reprise des champs emoji/texte/audience/liste.
- Ancrage d'un mood republié en post (anchorStatusAsPost, refus 403 REPOST_AUDIENCE_WIDENING dit sans perdre la saisie) et plafond d'audience d'une republication.
- Compteur de caractères qui passe en alerte à 101/122 ; annonce d'accessibilité « Choisissez un emoji pour publier votre status » / « Publication en cours ».
- Bouton Publier dans l'en-tête (verre) à côté de la croix, plus un socle séparé ; titre-question unique.

Rendu : Grille 5 colonnes, cellules 56 dp, espacement lg ; sélection teintée indigo400 ; bandeau de republication en capsule indigo500 à 15 % avec icône arrow.2.squarepath ; contenu scrollable (Dynamic Type) ; premiers plans isDark:true.

Transposition Android : StatusComposerSheet existant à enrichir ; ModalBottomSheet plein hauteur ; boutons verre = Surface translucide.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerMoodSurface.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerMoodBarePublish.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MoodComposerDoor.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusComposerDraft.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusesViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MoodStatusExpiry.kt`

### Éditer un objet en plein écran avec un seul panneau d'options ouvert à la fois et un clavier qui ne gêne pas

`scomp-object-editor-fullscreen` · Android : **partielle** · P1 · effort L

L'éditeur d'objet (mélange des vues 1c et 2e) montre la scène en grand, une rangée de sous-outils et UN panneau déplié à la fois (dix sections : police, couleur, alignement, fond, contour, effet, langue, cadre, apparition, plan 2D ; pour un média : filtre, réglages, effets, rogner, actions, décrire). La règle « jamais deux sections ouvertes » est pure et testée. Le clavier du canvas et le panneau d'options s'excluent (focus clavier -> panneau replié ; ouvrir un panneau -> focus perdu). Bande de suggestions « @ » au-dessus du clavier, bande de bord pour sortir, rail d'historique, bouton Terminé. Copie des libellés dans un type testable.

Écarts :
- Android a une TextStyleToolbar à 5 styles (bold, neon, typewriter, handwriting, classic) en barre unique ; iOS offre ~18 polices en grille, couleur, alignement, fond, contour, effet (glow, neon, aura…), langue du texte, cadre, apparition et plan 2D en sections dépliables.
- Éditeur plein écran dédié (ouvert par double tap / « Modifier ») avec scène réduite à la zone utile, un seul panneau ouvert (règle ComposerObjectEditorSection.opened sur toutes les paires), rail d'historique et bouton Terminé.
- Exclusion clavier/panneau d'options (IME visible -> panneau replié, panneau ouvert -> clavier fermé) via WindowInsets.ime.
- Sections média dans le même écran (filtre, réglages, effets, rogner, muet/pivoter, décrire) — voir scomp-media-adjust-filter-trim-alt.
- Bande de mentions « @ » dans l'éditeur (là où la frappe a vraiment lieu) ; coquille de texte vide supprimée à la fermeture.
- Libellés dans un objet de copy testable (ComposerObjectEditorCopy) : sept langues, secondes formatées « De 1,2 s à 6 s », « Visible du début à la fin ».

Rendu : Entêtes de sections en capitales discrètes (STYLE, TAILLE, ALIGNEMENT, FOND, CONTOUR, EFFET, LANGUE, CADRE, TIMELINE, APPARITION) ; une seule section au contenu visible ; scène 2D assez large pour positionner ; Terminé en haut à droite.

Transposition Android : fullScreenCover -> destination plein écran ou Dialog fullscreen ; @FocusState -> FocusRequester + WindowInsets.isImeVisible.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView+Keyboard.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView+Media.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorView+Mentions.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerObjectEditorCopy.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerEditedObject.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+ObjectEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextBackground.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextOutline.kt`

### Ajouter un lieu à une publication et choisir (opt-in) si elle est découvrable à proximité

`scomp-post-location-nearby-discoverability` · Android : **partielle** · P1 · effort M

L'outil Lieu ouvre un sélecteur de position (carte, recherche, ma position) ; le lieu est un attribut de la PUBLICATION (pas un objet de scène, retiré en Mood : « une humeur d'une heure ne dit pas d'où elle est écrite »). Quand un lieu et une audience compatible existent, un second opt-in « découvrable à proximité » (précision choisie, désactivé par défaut) est offert par la même garde que le contrôle (FeedNearbyDiscoverability.offers) et part avec le brouillon.

Écarts :
- Android ne pose qu'un fix brut (coordonnées sans nom/adresse) : ajouter un sélecteur de lieu avec carte, recherche, bouton « Ma position » et reverse-géocodage.
- Opt-in de découvrabilité à proximité (NearbyDiscoverabilityChoice, off par défaut) + champ discoverabilityPrecision dans CreatePostRequest, conditionné par la garde offers(hasPlace, visibility).
- Pas de lieu en Mood ; en Story le lieu est un sticker posé (voir scomp-sticker-pose-places-templates).

Rendu : Chip de lieu retirable sous le texte ; interrupteur de proximité avec libellé de précision, discret.

Transposition Android : CLLocation/MapKit -> FusedLocation/LocationManager + Maps Compose ou MapLibre ; Geocoder pour l'adresse.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSendRules.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentDurablePublisher.swift`
- `apps/ios/Meeshy/Features/Main/Composer/DocumentComposerDoor.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Draft.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedLocationPresentation.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyScreen.kt`

### Une vidéo, un son ou deux photos proposent le réel, et une scène qui l'exige bascule seule

`scomp-reel-qualification-offer` · Android : **partielle** · P1 · effort S

Le gate du réel (ComposerReelGate) projette la composition RÉELLE (objets des slides, fonds, médias du document) vers le prédicat partagé ReelComposition (vidéo ou audio >= 3 s connu, ou au moins deux images). À la publication d'un post qui ne porte qu'une vidéo, une feuille « Publier en réel ? » (« C'est un Post » / « C'est un Réel ») demande ; une scène dont la composition exige un réel arme le format réel automatiquement (annonce « Publication passée en réel ») et se désarme quand la condition tombe.

Écarts :
- Le prédicat ReelComposition existe côté modèle et FeedComposerSheet a une bascule ReelTypeToggle, mais il manque la projection de la composition de SCÈNE (objets média, fond, audio) vers MediaKind.
- Feuille de confirmation « Publier en réel ? » avec corps « Votre post n'a qu'une vidéo : en réel, elle s'ouvre en plein écran dans les Réels » et deux actions.
- Bascule automatique vers le format réel quand la scène l'exige (et retour quand elle ne l'exige plus) avec annonce d'accessibilité.
- Règle composedMedia qui compte une fois un média du document ponté sur la scène (pas de double comptage).

Rendu : Dialogue centré titre + corps + deux boutons textuels ; aucun spinner.

Transposition Android : AlertDialog Material3 ; annonce via semantics liveRegion.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+ReelOffer.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+ReelAutoSwitch.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerHostRules.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ReelComposition.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`

### Appui long sur un objet ou sur le fond de la scène : menu d'actions posé au doigt

`scomp-scene-context-menu` · Android : **partielle** · P1 · effort S

ComposerSceneMenu transforme une cible (objet d'un kind donné, ou fond) et le point du doigt normalisé sur la carte en un menu : actions de l'objet (modifier, avancer, reculer, sortir de la scène, dupliquer, supprimer — destructif séparé) ou du fond. Le menu se dismisse sur tap extérieur, se positionne en gardant sa taille mesurée dans la carte, et le fond n'a pas de point (menu centré).

Écarts :
- StoryElementMenu couvre les actions d'un élément texte (éditer, dupliquer, z-order) ; étendre à tous les kinds d'objets et au fond, avec point du doigt normalisé et contrainte à la carte.
- Entrées typées (Entry.object(StoryCanvasContextAction) | Entry.background(ComposerBackgroundMenuAction)) avec marqueur destructif et identifiants stables d'accessibilité.

Rendu : Menu compact en verre, entrée destructive en rouge, haptique moyenne à l'ouverture.

Transposition Android : Popup/DropdownMenu ancré aux coordonnées de l'appui long (pointerInput + detectTapGestures onLongPress).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneMenu.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerBackgroundMenu.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneMenu.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+BackgroundMenu.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`

### Lire et écrire la légende sur la scène telle que le lecteur la verra, repliable d'un chevron

`scomp-scene-description-panel` · Android : **partielle** · P1 · effort M

La description n'est pas un champ mais un calque de LECTURE : au repos elle se rend avec le même renderer que le lecteur (mentions, hashtags, troncature, taille) ; un tap la déplie en édition, un chevron V/^ juste au-dessus de la scène, toujours disponible, la replie/déplie (texte présent par-dessus la scène, sinon l'invitation « Ajouter une légende »). Le panneau floute/fond fondu la scène derrière (bords en dégradé), mesure sa hauteur pour pousser le reste, valide avec une coche, et choisit sa cible selon le rôle du texte (contenu de slide en Story/Réel/Mood, légende du média courant ou corps du post en Post).

Écarts :
- Android a un champ de légende (invite « Share a moment… », compteur) mais pas de calque de lecture partageant le renderer du lecteur ; créer le composant ReaderText partagé (mentions, hashtags, troncature) pour le composer et le lecteur.
- Panneau repliable avec chevron V/^ au-dessus de la scène et libellés « Replier la description » / « Afficher la description » ; invite « Ajouter une légende » et libellé « Touchez pour modifier la légende ».
- Flou de scène sous le panneau et fondu des bords (dégradé) ; mesure de la hauteur de l'éditeur pour décaler le contenu ; coche de validation.
- Cibles de description selon le rôle (slideContent / mediaCaption(url) / postContent) et fusion des légendes de média avec le panneau d'accessibilité au moment de la publication.

Rendu : Texte superposé en bas de la scène sur fond flouté fondu, chevron 44 dp centré au-dessus de la scène ; animation de repli ressort.

Transposition Android : Compose AnnotatedString + ClickableText ; Modifier.blur (API 31+) avec repli scrim.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneDescriptionPanel.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneDescriptionEditor.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSlideTextRole.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Captions.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextDirection.kt`

### Une vignette par scène (dix au plus) pour naviguer, ajouter et supprimer, avec le nombre d'objets de la scène

`scomp-slide-rail-multi-scene` · Android : **partielle** · P1 · effort M

Rangée haute de vignettes 9:16 de 44 pt (une par scène, repeinte quand l'empreinte de la scène change, jamais de trou pendant un geste) : la scène courante cerclée de brandPrimary, corbeille (x) seulement sur la tuile courante, une vignette seule n'est pas un bouton. « Nouvelle slide » depuis le rail droit dès qu'une slide existe ; plafond dix scènes (« Dix scènes au maximum — supprimez-en une pour en créer une autre »). Le bouton « < N » indique le nombre d'objets posés sur la scène active (l'objet visible à l'instant et non seulement présent).

Écarts :
- SlideStrip Android permet ajouter/dupliquer/supprimer/réordonner (StorySlideDeck, MAX_SLIDES) ; il manque la vignette VIVANTE (composite des objets, repeinte sur empreinte, bitmaps réduits à la tuile) au lieu d'un simple numéro/placeholder.
- Règles ComposerHeaderTiles : une vignette seule n'est pas un bouton ; corbeille uniquement sur la tuile courante ; retrait d'une scène qui purge ses médias/porteurs (retractScene).
- Message de plafond « Dix scènes au maximum » et libellés d'accessibilité « Scène n sur N », « Supprimer la scène n ».
- Compteur « < N » (ComposerSceneObjectCount.posed, positions pour l'évitement à la pose) et libellé parlé.

Rendu : Tuiles 44 dp de haut, ratio 9:16, rayon xxs, contour 1,5 dp brandPrimary si courante sinon blanc 25 % à 0,5 dp, croix 8 sp sur disque noir 55 % décalée de (4, -4).

Transposition Android : LazyRow ; vignette rendue par un renderer partagé scène -> Bitmap (Canvas hors écran) mis en cache par empreinte.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSlideRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneObjectCount.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Retract.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/SlideReorderResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`

### Republier ou recomposer une story : audience plafonnée, ancrage en post, médias rapatriés

`scomp-story-republish-recompose` · Android : **partielle** · P1 · effort M

« Reposter » et « Composer » sur une story ouvrent le meuble avec la graine de la source : StoryRepublishComposer porte le canal de scène (identifiant de la source capturé), le plafond d'audience (loi 10 : on n'élargit pas), l'ancrage en post (garder pour de bon). StoryRecompositionSeeding rapatrie les médias (cache typé sinon réseau, en parallèle), décode les images au plafond de 1080 px et remet le tout à la graine de scène.

Écarts :
- Android a onRepostSource (attribution « Reposted from @… ») mais pas de recomposition : ajouter l'ouverture du composer sur la scène de la source avec médias rapatriés (téléchargements en parallèle, images ≤ 1080 px).
- Plafond d'audience d'une republication (StoryRepostAudience.allowed) et ancrage de la story éphémère en post permanent.
- Bascule de format offerte : [sourceFormat, post] (story/mood -> post), reposter un post ne propose pas deux fois.

Rendu : Bandeau « Reposté de @… » dans le composer ; sélecteur d'audience restreint.

Transposition Android : Coil/OkHttp cache pour rapatrier ; coroutines async/awaitAll.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/StoryRepublishComposer.swift`
- `apps/ios/Meeshy/Features/Main/Composer/StoryRecompositionSeeding.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Annuler et rétablir les gestes de la scène depuis le pied du rail de droite

`scomp-undo-redo-history` · Android : **partielle** · P1 · effort M

L'historique photographie les slides (la scène et ses objets) et n'est servi que sur une vue montée qui a une scène (scène incrustée ou atelier), jamais sur le document texte (où le clavier annule déjà la frappe) : un « annuler » qui défait autre chose que le dernier geste visible est pire qu'absent. Les boutons Annuler/Rétablir vivent en pied du rail de droite, y compris pendant un outil (dessin) ; l'historique est débouncé pour ne pas empiler un état par image de geste.

Écarts :
- Android n'a qu'un undo de traits de dessin (StoryDrawingBoard.undo/redo) : ajouter un historique de slides (snapshots débouncés) couvrant pose/déplacement/suppression d'objets, changement de fond, ordre d'empilement.
- Règle servesHistory(mountedView) (scène ou atelier seulement) et libellés « Annuler » / « Rétablir » avec état désactivé quand la pile est vide.
- Positionner undo/redo en pied du rail droit, y compris pendant un outil ouvert ; la comparaison « Comparer » ne doit jamais alimenter l'historique.

Rendu : Deux pastilles flèches courbes en pied de colonne, atténuées quand indisponibles.

Transposition Android : Pile de snapshots immuables dans le ViewModel (StateFlow<List<StorySlide>>) avec debounce 300 ms.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerTrailingRail.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneColumns.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneState.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Annuler et rétablir n'importe quelle action du composer, pas seulement le dernier trait

`sct-composer-global-undo-redo` · Android : **partielle** · P1 · effort M

HistoryStore<S> est une pile d'états générique (cap 50) de l'undo/redo GLOBAL : elle empile l'état complet des slides (instantané plutôt que commandes), déduplique les états consécutifs identiques, tronque la branche redo, évince le plus ancien au-delà du cap en le RETOURNANT (purge différée des bitmaps orphelins) et expose la trajectoire encore joignable. Les mutations convergent vers trois points (sync des panneaux, fin de geste canvas, opérations de slides). Une colonne annuler/rétablir apparaît dans l'en-tête. Android : seul le dessin a un undo/redo (StoryDrawingBoard).

Écarts :
- Pile d'états générique avec cap 50, déduplication, troncature redo, éviction retournée à l'appelant
- Empiler le deck de slides complet à chaque mutation (texte, sticker, fond, filtre, durée, médias, dessin) via 3 points d'entrée
- Libération différée des ressources (bitmaps/uploads) plus référencées par aucun instantané
- Colonne annuler/rétablir dans l'en-tête avec états désactivés et haptique
- Raccourcis d'accessibilité (actions personnalisées) ; ne pas effacer la pile au simple changement de panneau

Transposition Android : Data class immuable HistoryStore<S> + StateFlow de canUndo/canRedo dans StoryComposerViewModel (le deck est déjà immuable).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/HistoryStore.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDrawingBoard.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`

### Chaque commande du composer se touche facilement (zone ≥ 44 pt) sans changer son rendu

`sct-composer-hit-targets` · Android : **partielle** · P1 · effort S

ComposerControlMetrics fixe le diamètre visuel de la pastille de verre (36), le côté minimal de contact (44 pt), l'inset transparent de chaque côté, l'interstice du groupe d'actions (zéro : écart visuel de 8 pt) et celui de la colonne annuler/rétablir (10 pt conservés). composerHitTarget() élargit la boîte de layout (et non un fond) pour étendre réellement le hit-test sans déplacer le rendu ; les cibles voisines sont jointives, jamais chevauchantes. Appliqué aux pastilles d'en-tête, à la capsule d'audience, à la poignée de restauration, au reset de zoom, aux chips de couche, à la poignée de la bande. Android : à auditer.

Écarts :
- Auditer toutes les commandes du composer (pastilles, chips, poignées) : cible ≥ 48 dp avec rendu inchangé (minimumInteractiveComponentSize / sizeIn)
- Constantes partagées (diamètre visuel, cible, interstices) en un objet ComposerControlMetrics
- Cibles jointives sans chevauchement dans les groupes d'actions
- Tests d'accessibilité TalkBack sur les petites pastilles

Transposition Android : Modifier.minimumInteractiveComponentSize() / Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp) autour d'un visuel plus petit.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlHitTarget.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Décrire chaque média pour les lecteurs d'écran (texte alternatif) et le légender

`sct-media-alt-text` · Android : **partielle** · P1 · effort M

MediaAccessibilityStore collecte PAR média un texte alternatif et une légende, plus UN choix d'extraction de son pour tout le post (défaut activé depuis #8012) ; il vit au-dessus de la bande (ComposerControlsLayer) pour survivre aux démontages du panneau. Le panneau MediaAccessibilityPanel s'ouvre inline sous la rangée du média (champ MediaAltTextField : « Texte alternatif », indice VoiceOver, libellé « Légende »), le store se sauvegarde/restaure dans le brouillon et alimente les payloads mediaAlt / mediaCaption à la publication. Android : le composer de feed a des champs d'alt par média et le contrat mediaAlt, pas le composer de story.

Écarts :
- Champs alt + légende par média dans le panneau Médias du composer de story (saisie fluide, commit sur perte de focus)
- Store hissé au-dessus du panneau pour ne pas perdre le texte saisi à la fermeture du panneau
- Sauvegarde/restauration dans le brouillon (instantané d'accessibilité) et élagage à la suppression du média
- Payloads mediaAlt / mediaCaption (clés = ids serveur) à la publication ; mediaCaption absent de CreatePostRequest
- Libellés et indices TalkBack de la saisie elle-même

Transposition Android : OutlinedTextField Compose avec semantics ; store = état dans le ViewModel ; map mediaId → texte persistée dans StoryComposerDraftSnapshot.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/MediaAccessibilityPanel.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/MediaAccessibilityStore.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/MediaAltTextField.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerSheet.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Publier un post ou un réel composé avec sa scène, ses légendes et ses alternatives, sans rien perdre en route

`sct-publish-intent` · Android : **partielle** · P1 · effort M

PublishIntent est la matière d'une publication composée UNE fois, par geste nommé (document, audioRecording) sans valeur par défaut ni init public : jeton d'envoi clientMutationId, type serveur POST/REEL élu par ReelComposition (un type DÉCLARÉ gagne), fichiers locaux et MIME alignés par index, texte, visibilité (+ liste d'ids), langue, mentions, lieu, précision de découvrabilité, transcription mobile, storyEffects (le canvas composé : sans lui la scène était perdue), légendes et textes alternatifs par média, id d'objet de canvas à adopter après upload, autorisation d'extraction du son. Un vocal prend la langue de sa transcription. Android : CreatePostRequest couvre contenu, médias, lieu, mediaAlt, transcription mais pas le canvas ni les légendes.

Écarts :
- Champ storyEffects absent de CreatePostRequest : un post composé avec fond/texte/dessin/sticker perd sa scène
- Légendes par média (mediaCaption) et id d'objet de canvas par média (mediaObjectIds) à aligner par INDEX sur les fichiers
- Autorisation allowSoundExtraction, visibilityUserIds, mentions, précision de découvrabilité absentes de la requête
- Jeton d'idempotence clientMutationId propre à l'envoi (jamais dérivé du contenu)
- Fabrique unique par geste (document / audioRecording) sans valeurs par défaut, type déclaré prioritaire sur la déduction ReelComposition
- Vocal : langue = celle de la transcription, pas celle du sélecteur de texte
- Garde de source interdisant les valeurs par défaut sur la fabrique

Transposition Android : Data class Kotlin immuable à constructeur privé + fabriques nommées ; sérialisation kotlinx vers CreatePostRequest ; file durable via OutboxRepository.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ReelComposition.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedComposerDraft.kt`

### Le son d'un clip entré en cours de piste garde le bon volume et ses fondus

`sct-reader-audio-envelope` · Android : **partielle** · P1 · effort S

AudioEnvelope calcule l'enveloppe de volume d'un clip dont la lecture commence à elapsedInClip : volume initial juste, rampe de fondu entrant restante (jamais rejouée depuis le silence), fondu sortant ancré à clipDuration − fadeOut, sans collision de deux rampes (#6580). ReaderAudioScheduler remet au moteur la fenêtre de frames (fichier entier ou segment) et l'heure de planification (« immédiat » plutôt qu'une heure passée), via un protocole observable. TimelineAudioWindow en est la loi de fenêtre partagée. Android : AudioTrackSurface joue une seule piste par URL avec fenêtre de rognage mais sans enveloppe.

Écarts :
- Enveloppe pure (rampes restantes, volume initial) pour les clips audio avec fondu entrant/sortant
- Entrée en cours de piste : démarrer à la bonne position avec volume correct (seek + volume courant), jamais depuis zéro
- Planifier plusieurs pistes audio (début à un offset de slide, fenêtre de rognage) au lieu d'un seul fond + un seul premier plan
- Contrat testable de planification (fenêtre + instant) sans moteur audio réel
- Tolérer secondes non finies / négatives (traitées comme zéro)

Transposition Android : ExoPlayer par piste + volume rampé par coroutine (ou ramp via Media3 AudioProcessor) ; ClippingConfiguration pour la fenêtre.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Audio/AudioEnvelope.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Audio/ReaderAudioScheduler.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`

### Un seul lecteur de scène pour l'histoire, l'aperçu, la carte du fil et le réel

`sct-scene-player` · Android : **partielle** · P1 · effort L

MeeshyScenePlayer joue un document CanvasV3 en enveloppant l'hôte canvas du reader, selon ScenePlayerMode (reader, preview, card, reel) : tous naissent en pause ; seule la carte du fil verrouille le mute (boucle muette) ; le reader joue une fois ; le réel boucle AVEC le son et porte la chrome de progression. Un porteur (carrier) fournit l'adresse des médias, l'aspect, les durées et l'audio ; SharedCarrierPlayerProvider partage un AVPlayer entre surfaces ; une chaîne de langues du Prisme est passée en opaque. Fournit le fil de position (onPlaybackTime). Android : le lecteur de story rend les slides, avec projection CanvasV3 au modèle, mais ni modes carte/aperçu/réel ni player unifié pour posts.

Écarts :
- Composable ScenePlayer(document, mode, config) réutilisable par story, aperçu du composer, carte de post et réel
- Règles par mode : démarrage en pause, mute proposé/verrouillé (carte), lecture unique (reader), boucle avec son (réel)
- Porteur (carrier) pour hydrater médias, aspect, durées et audio d'un post ; partage du lecteur vidéo du porteur entre surfaces
- Prisme (chaîne de langues) transmis au rendu de scène
- Fil de position (onPlaybackTime) et durée jouée pour la chrome du réel
- Scènes de POST rendues avec le même lecteur que les stories (rien côté feed actuellement)

Rendu : Carte 9:16 arrondie, fond dominant du ThumbHash dans la carte, média sans rognage, un seul peintre ; mêmes ombres et rayons sur toutes les surfaces.

Transposition Android : Composable unique piloté par un state holder ; ExoPlayer partagé via un provider ; Canvas/graphicsLayer pour le rendu de scène.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/MeeshyScenePlayer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/ScenePlayerMode.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPlayback.kt`

### Publier une story hors ligne ou app tuée en plein envoi, et la retrouver au retour

`sct-story-publish-queue` · Android : **partielle** · P1 · effort M

StoryPublishIntentWriter écrit la publication de façon durable AVANT l'envoi (write-ahead), sur les deux chemins hors ligne et en ligne : médias recopiés sur disque dans un dossier propre à la story (meeshy_offline_queue/<tempStoryId>), payload des slides encodé, item mis en file ; un kill mid-upload laisse l'item repris au drain de boot ; le dossier est supprimé au succès ou à l'annulation. L'item porte format choisi (story/post), octets animés des stickers, id de republication, références déclarées, mentions par slide, textes alternatifs, « aussi en réel ». Une erreur d'écriture d'un média garde la composition et le nomme (story.publish.queue.encodeError). TimelineViewModel+OfflinePublish compose l'item (audioURLPaths vs mediaURLPaths, visibilité PUBLIC/FRIENDS/PRIVATE). Android : outbox durable avec reprise/abandon, mais payload réduit.

Écarts :
- Persister le format choisi (story / post / réel) dans l'item de file : un rejeu ne doit pas republier en story un « post »
- Médias copiés dans un dossier par story, nettoyé au succès/annulation ; erreur d'écriture d'un média nommée sans perdre la composition
- Octets animés des stickers, mentions par slide, références déclarées, textes alternatifs et « aussi en réel » portés par l'item (CreateStoryRequest ne porte que contenu, effets, visibilité, langue, mediaIds, repost)
- Reprise au drain de démarrage d'un envoi interrompu en plein upload, item marqué in-flight puis retiré au succès
- Séparation audio / média dans l'item hors ligne (audioURLPaths vs mediaURLPaths) pour les sons de la timeline
- Bannière « Story en attente — elle partira au retour du réseau » côté composer

Transposition Android : OutboxRepository + MediaUploadQueue existants (dépendances dependsOn) ; WorkManager pour le drain au démarrage ; dossier dans filesDir/offline_queue/<tempId>.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel+PublishIntent.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+OfflinePublish.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PendingStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/FailedStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PublishMediaWriteBack.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPublishFailures.kt`

### Je choisis l'audience de ma story, dont « Seulement ces personnes » et « Tout le monde sauf », via un sélecteur de contacts instantané

`stc2-audience-picker-visibility` · Android : **partielle** · P1 · effort M

PostVisibility compte six modes (Public, Communautés, Contacts, Sauf…, Seulement…, Privé) avec icône et libellé ; EXCEPT/ONLY ouvrent AudienceUserPickerView : en-tête Annuler/OK, recherche débattue 350 ms, puces des choisis, liste cache-first des contacts locaux fusionnée avec /users/search dédoublonné, feuille translucide à hauteur partielle.

Écarts :
- Android ne propose que PUBLIC, FRIENDS, COMMUNITY, PRIVATE : ajouter EXCEPT et ONLY (wire EXCEPT/ONLY) et leurs libellés/icônes.
- Sélecteur d'utilisateurs : champ de recherche (debounce 350 ms), puces des sélectionnés retirables, liste initiale issue du cache d'amis.
- Transmettre visibilityUserIds à la publication et restaurer visibilité + ids depuis un brouillon (restorableVisibility).
- Mémoriser le dernier choix d'audience de l'utilisateur comme défaut (repli Contacts/friends) et le semer à l'ouverture, avec précédence édition > brouillon > mémorisé > friends.

Rendu : Ligne 56 dp : avatar de contexte userListItem + nom 16 sp medium + @pseudo 13 sp secondaire, coche accent pleine à droite ; puces capsule fond tertiaire.

Transposition Android : Sheet SwiftUI avec en-tête custom -> ModalBottomSheet partiel ; recherche -> UserRepository.searchUsers ; présence via le résolveur central.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/AudienceUserPickerView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Le canvas se réduit en carte entière au-dessus du panneau ou du clavier, et reste immersif quand rien ne le recouvre

`stc2-canvas-framing-carded-immersive` · Android : **partielle** · P1 · effort M

StoryCanvasFraming est un solveur pur (scale, offset, cornerRadius) qui place le canevas 9:16 dans la région libre entre l'en-tête et le panneau bas, en trois présentations (free, carded, immersive) avec alignement vertical centre/haut/bas.

Écarts :
- Android fixe la toile à fillMaxHeight + aspectRatio 9/16 : ajouter le solveur de cadrage.
- Carder le canvas dès qu'un panneau, l'éditeur texte ou une feuille réduit la zone visible (jamais de bas masqué).
- Évitement clavier basé sur WindowInsets.ime et la fenêtre réelle (multi-fenêtre, pliables), pas sur la hauteur brute.
- Letterbox flouté (RenderEffect/blur) du média de fond autour de la carte, repli couleur de fond, et tap sur les bandes routé vers la même action que le fond du canvas.

Rendu : Carte avec ombre portée douce (pas de liseré ni de trait pointillé) pour détacher le canvas du plateau ; bandes latérales/verticales remplies du fond flou.

Transposition Android : SafeArea iOS -> WindowInsets (systemBars + ime) ; Stage Manager/Split View -> multi-window et écrans pliables via WindowMetrics.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasSheetRules.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasLetterbox.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryKeyboardOverlap.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SceneCardProjection.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`

### Un tap sur le fond du canvas fait ce que j'attends : écrire, masquer/afficher les contrôles ou fermer le panneau ouvert

`stc2-chrome-tap-policy-header-accessories` · Android : **partielle** · P1 · effort S

ComposerChromePolicy route le tap sur le fond du canvas vers une seule action (ignorer, ranger le bandeau de reprise de brouillon, démarrer la saisie de texte sur page blanche, basculer le chrome, fermer le panneau actif) à partir d'un contexte de chrome construit en un seul site (en-tête, colonne annuler/rétablir, FABs, chips de couche).

Écarts :
- Android ne fait que désélectionner au tap fond : implémenter la politique à cinq issues (ignorer, ranger le bandeau de reprise, démarrer le texte, basculer le chrome, fermer le panneau) avec haptique légère.
- Construire le contexte de chrome en un seul endroit (bande visible, outil actif, sélection, bandeau brouillon, édition texte) pour que en-tête, FABs et tap fond ne divergent jamais.
- Point d'entrée unique 'écrire sur page blanche' partagé par tap canvas, tap letterbox, tap sur l'indice et swipe bas (addText + ouverture de l'éditeur).

Rendu : Rangée haute flottante de pastilles 44 pt de cible ; aucune hauteur réservée quand l'accessoire est absent.

Transposition Android : Environnement SwiftUI (EnvironmentKey) -> CompositionLocal / paramètres de slot composables.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Chrome.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerHeaderAccessories.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Mon brouillon se sauvegarde tout seul et survit à la fermeture, à l'interruption et au kill de l'app, avec tous ses médias

`stc2-draft-autosave-engine` · Android : **partielle** · P1 · effort M

Le brouillon est persisté (base locale + fichiers média) derrière une garde unique des écritures silencieuses : jamais par-dessus une offre de reprise posée, jamais après un jet ou une publication, seulement si du contenu réel existe. mergeEffects n'écrase que les champs pilotés par le canvas.

Écarts :
- Les traits de dessin (strokes) ne survivent pas à la fermeture/au kill (absents de StoryDraftSlideSnapshot) : ajouter strokes au snapshot (:core:model) et aux deux fonctions miroir.
- Persister aussi objets média/son/lieu, vignette composite (thumbHash dès le 1er enregistrement), historique undo/redo (blob), texte alternatif des médias et références.
- Garde unique des écritures silencieuses (offre de reprise posée, brouillon jeté/publié, aucun contenu réel) partagée entre autosave débouncé et passage en arrière-plan (ON_STOP).
- mergeEffects : copie intégrale de l'état courant puis écrasement des seuls champs pilotés par le canvas, pour qu'aucun champ ne soit perdu silencieusement.

Rendu : Aucun retour visuel à l'autosave (silencieux, sans haptique) ; seule la reprise est visible via le bandeau.

Transposition Android : GRDB + fichiers -> Room (StoryComposerDraftStore) + dossier privé filesDir.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Autosave.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerAutosave.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`

### Je mets un objet au premier plan, à l'arrière, le déplace précisément ou règle quand il apparaît et combien de temps

`stc2-element-layering-placement` · Android : **partielle** · P1 · effort M

ZOrder tient un zIndexMap en mémoire réhydraté depuis les zIndex persistés de la slide (un élément remonté sur la slide 0 garde son rang au retour) avec bringToFront, sendToBack, bringForward, sendBackward et moveMedia.

Écarts :
- Android ne restacke que les éléments TEXTE (StoryZOrder) : étendre le z-order à stickers, médias, sons-vignettes et lieux avec un classement unique de tous les objets.
- Réhydrater le z-order depuis les zIndex persistés à chaque changement de slide ; nextZIndex avance au-delà du maximum persisté.
- Verbes publics moveElement(id,to) et setSceneObjectTiming(id,startTime,duration) pour les surfaces non gestuelles (accessibilité, timeline).
- Réordonner les médias d'un fond/premier plan (moveMedia) depuis la liste ; menu contextuel d'objet avec Avant/Arrière/Plus haut/Plus bas.

Rendu : Actions de calque dans le menu d'appui long ; le rang se voit immédiatement (pas de panneau dédié).

Transposition Android : Menu contextuel d'élément déjà en Compose (StoryElementMenu) -> étendre aux autres types d'objets.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+ZOrder.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Placement.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`

### Je recadre et pivote un média par quarts de tour, et l'objet garde la même forme partout

`stc2-media-crop-rotate` · Android : **partielle** · P1 · effort M

setMediaCrop applique un recadrage normalisé (MediaCropRect) avec bitmap recadré (MediaCropBitmap, lu dans l'orientation d'affichage EXIF) et rafraîchit les aperçus périmés à la restauration ; MediaCropPresentation donne le cadre de base au rapport effectif du recadrage et la part gardée de l'image sans copie.

Écarts :
- Seul le modèle de recadrage existe côté Android (lecture) : ajouter l'éditeur de recadrage d'un média (poignées, ratios) écrivant MediaCropRect normalisé.
- Bouton « Pivoter » : quart de tour -90 degrés avec règle normalized/turned (un += 90 naïf dérive), appliqué sur le canvas, les vignettes et l'export.
- Bitmap recadré lu dans l'orientation d'affichage (ExifInterface) et rafraîchissement des aperçus de recadrage périmés à la restauration d'un brouillon.
- Rapport effectif = rapport du recadrage s'il existe, pour que l'objet ne change pas de forme selon qui le peint.

Rendu : Poignées de recadrage 44 dp, aperçu live sur l'objet, rotation animée par quart de tour (ressort court).

Transposition Android : CGImage cropping -> Bitmap.createBitmap / Rect de sous-région ; contentsRect -> Modifier.drawWithContent + srcRect.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+MediaCrop.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCropPresentation.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaRotation.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryMediaCrop.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StorySourceWindow.kt`

### Je choisis un filtre dans une grille de vignettes qui montrent mon vrai fond, pour le fond ou pour un seul média

`stc2-media-filter-grid` · Android : **partielle** · P1 · effort M

StoryFilterGridView affiche « Original » + les huit filtres (vintage, bw, warm, cool, dramatic, vivid, fade, chrome) en vignettes 64 pt rendues hors fil principal (recadrage carré + 8 passes Core Image, cache par source) avec repli dégradé ; StoryFilterProcessor est la source unique du rendu (canvas, tuiles, ancien sélecteur).

Écarts :
- Android liste les filtres en chips textuelles avec ColorMatrix : rendre des vignettes 64 dp du fond courant (recadrage carré) pour chaque filtre.
- Une source de rendu unique pour tuiles et canvas afin que la vignette montre exactement ce que la scène rendra (aujourd'hui matrice 4x5 approximée).
- Filtre et réglages (luminosité, contraste, saturation... ImageAdjustments) PAR objet média, sans toucher au filtre de la slide ; curseur d'intensité réservé au filtre de slide.
- Tuile sélectionnée : bordure brandPrimary 2 pt, libellé en gras, trait accessibilité isSelected ; haptique légère au choix ; fondu à l'arrivée de la vignette.

Rendu : Rangée horizontale scrollable de tuiles 64x64 dp (rayon 8), libellé 10 sp sous la tuile, sélection brandPrimary ; curseur « Intensité » sous la rangée.

Transposition Android : Core Image CIFilter -> ColorMatrix / RenderEffect (API 31+) ou GPUImage/RenderScript remplacé par AGSL ; cache NSCache -> LruCache.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterProcessor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterThumbnails.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+ObjectFilter.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryFilterMatrix.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Quand je tape @, mes contacts apparaissent tout de suite, se filtrent à la 1re lettre et l'annuaire s'ajoute à la 2e

`stc2-mention-autocomplete` · Android : **partielle** · P1 · effort M

Règle unique (2026-09-05) : @ nu = contacts en entier (cache, zéro réseau) ; @a = filtre local ; @al… = mêmes + annuaire via recherche débattue. ComposerMentionQuery détecte le handle en cours (pas d'e-mail) ; MentionSuggestionRule ordonne contacts, participants, autres (dédoublonnés, auteur exclu) ; liste cache-first avec état « Aucune personne trouvée ».

Écarts :
- Les briques existent pour le chat (extractQuery, filterCandidates, seuil distant 2, mergeSuggestions) mais ne sont pas branchées sur le texte de story : les câbler.
- Fournisseur de contacts cache-first (liste d'amis en cache) qui répond instantanément puis se réchauffe en arrière-plan si le cache est vide ou périmé.
- Ordre contacts -> participants -> autres, dédoublonnage par premier groupe, auteur exclu.
- Interface liste (hauteur max 200 dp au-dessus d'un champ, illimitée en feuille) avec ligne avatar + nom + @pseudo, état vide « Aucune personne trouvée », 44 dp mini.

Rendu : Liste verticale compacte, avatars avec présence résolue par le résolveur central, texte principal 16 sp medium + @pseudo 13 sp secondaire, coche/cercle de sélection à droite dans le sélecteur.

Transposition Android : UserService.searchUsers/cache GRDB amis -> UserRepository.searchUsers + cache Room des amis ; contextMenu -> combinedClickable + DropdownMenu.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestionRule.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MentionSuggestions.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionComposer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionSearch.kt`

### Les sons de ma story démarrent à la milliseconde prévue, bouclent sans trou et s'estompent proprement, sans couper la musique d'une autre app par erreur

`stc2-reader-audio-mixer` · Android : **partielle** · P1 · effort M

ReaderAudioMixer remplace les AVPlayer par un unique AVAudioEngine (48 kHz stéréo) qui épingle chaque clip sur un temps hôte dérivé de startTime (précision à l'échantillon), avec mute global/par piste, volume par piste, slot de fond unique (enveloppe par défaut : fondu d'entrée 1,2 s, sortie 0,5 s, plancher 0,30), ducking, pause/reprise sans replanification, rognage et fondus.

Écarts :
- Android joue chaque piste dans un ExoPlayer indépendant (boucle, rognage, volume) : concevoir un mixeur unique (Oboe/AudioTrack ou ExoPlayer) avec départ au temps prévu sans gigue.
- Enveloppe par défaut du fond (plancher 0,30, queue 0,05, fondu d'entrée 1,2 s, sortie 0,5 s) et fondus explicites par piste lus sur le temps réel (rampe 60 Hz).
- Boucle sans trou : une passe d'avance, rebouclage lié à l'époque de lecture ; correction du clip qui se taisait après deux tours.
- Ducking du fond sous le premier plan, mute global et par piste, volume prévu vs volume appliqué.

Rendu : Aucun visuel ; la perception compte : démarrage exactement à l'instant du clip, fondus doux, pas de coupure ni de doublon à la reprise.

Transposition Android : AVAudioEngine/hostTime -> Oboe/AAudio (temps de sortie) ou Media3 ExoPlayer + ConcatenatingAudio/MixingAudioProcessor.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer+Background.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioLoop.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderVolumeRamp.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioActivationPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioSourceResolver.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### À l'ouverture d'une story, un flou immédiat puis la miniature nette s'affichent pendant que les voisines se préparent

`stc2-reader-loading-prefetch` · Android : **partielle** · P1 · effort S

StoryReaderLoadingOverlay empile des placeholders cache-first (thumbHash flouté ou dégradé indigo, puis miniature nette dès qu'elle est en cache, puis spinner armé après 200 ms) jusqu'à 95 % de progression ; StoryNeighborWindow prépare l'anneau N±2, le reste du groupe (6) et 2 groupes suivants x 2 slides, avec atterrissage d'avance d'auteur.

Écarts :
- Android résout le thumbHash et précharge 2 images : ajouter l'empilement thumbHash, miniature nette en cache, puis spinner armé après 200 ms (disparition à 95 %).
- Remplacer le planificateur linéaire par la fenêtre de voisinage (rayon 2, 6 du reste du groupe, 2 groupes suivants x 2 slides, atterrissage d'avance d'auteur).
- Priorité de préparation par distance et par direction de navigation (avant/arrière) ; préchauffer aussi vidéos et audios, pas que les images.

Rendu : Flou plein cadre à la frame 0, miniature nette en fondu, spinner petit centré ; aucune frame noire.

Transposition Android : ThumbHash déjà porté ; préchargement via Coil ImageLoader + Media3 preload ; ZStack -> Box.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryReaderLoadingOverlay.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryNeighborWindow.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryPrefetchPlanner.kt`

### Je « compose à partir » d'une story publiée ou la republie : toute la scène est reprise, sans puce « Reposté de »

`stc2-recompose-repost` · Android : **partielle** · P1 · effort M

StoryRecomposition reprend la SCÈNE entière d'une story publiée (objets, positions, timeline, textes, stickers, effets, sons, tous les médias — pas seulement le premier) à partir de la slide que le lecteur peint ; une recomposition crée une publication NEUVE donc chaque média est DÉTACHÉ (postMediaId vide) et listé en assets à matérialiser avant la montée sous le nouvel auteur.

Écarts :
- Android ne porte que repostOfId et l'attribution d'en-tête : cloner la scène source (objets, effets, timeline, sons) dans le composer.
- Recomposition = nouvelle publication : détacher chaque média de son postMediaId et lister des assets à télécharger localement avant publication.
- Préchargement des médias de la source via le cache d'images avec la bonne clé de rangement (fond de slide vs objet de canevas) pour que le canvas peigne instantanément au montage.
- Retirer toute puce « Reposté de @auteur » héritée du contenu cloné (le crédit est dans l'en-tête, après la date).

Rendu : Le canvas s'ouvre déjà peint (aucune toile vide), sans puce de crédit ajoutée sur la scène.

Transposition Android : CacheCoordinator 3 niveaux -> Coil memory+disk cache ; POST /posts/{id}/repost déjà dans StoryApi.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryRecomposition.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Repost.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/RepostMediaPreload.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryRepostCredit.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRepostAttribution.kt`

### Je navigue entre mes slides par des vignettes fidèles, j'en ajoute, duplique, supprime, réordonne, et un appui long ouvre le fond

`stc2-slide-strip-thumbnails` · Android : **partielle** · P1 · effort M

La bande de slides affiche une vignette 9:16 de 42 pt par slide (SlideMiniPreview : fond couleur/dégradé/image + filtre approximé, dessin, médias, textes, stickers, lieux, marqueur audio, pastille d'index et point de couleur de fond) et une vignette pointillée « + » (masquée au plafond de 10 slides et en édition d'une story publiée).

Écarts :
- Android montre des FilterChip « Diapo N » : remplacer par des vignettes 9:16 fidèles (fond, filtre, dessin, médias, textes, stickers, lieux, marqueur audio, index).
- Vignette « + » pointillée en fin de bande, masquée à 10 slides et en édition d'une story publiée (une story publiée = une slide).
- Menu d'appui long : Dupliquer, Supprimer, Éditer le fond (visible seulement si l'hôte peut ouvrir l'éditeur d'objet) ; supprimer est refusé sur la dernière slide.
- Figer le canvas courant dans sa slide avant de basculer et recharger le canvas depuis la nouvelle (sync d'effets), avec ressort 0,25 s et haptique légère.

Rendu : Vignettes 42 dp de haut (largeur = 42 x ratio 9:16), rayon 3, sélection avec cadre de marque, chrome blanc en sombre / indigo950 en clair (lisible sur la top bar translucide).

Transposition Android : ScrollView horizontal -> LazyRow ; contextMenu -> combinedClickable + DropdownMenu ; couleurs de chrome indigo950 / blanc selon thème.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SlideStrip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SlideMiniPreview.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/SlideThumbEditAffordance.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Slides.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/SlideReorderResolver.kt`

### J'ajoute stickers (emoji, gabarits vivants, images collées) et pastilles de lieu, lus correctement par VoiceOver/TalkBack

`stc2-stickers-places` · Android : **partielle** · P1 · effort M

addSticker(emoji\|template\|image) pose en cascade (jamais au même point) des stickers emoji, des gabarits (Cadran « 14:32 »…) et des images collées avec octets animés conservés ; addLocation(place:styleId:) pose une pastille de lieu en bas de slide, centrée, hors timeline, avec gabarit décoratif optionnel.

Écarts :
- Android ne pose que des stickers emoji (catalogue par catégories + recherche) : ajouter les gabarits à valeurs vivantes (cadran, etc.) avec décoration/animation, et les images collées.
- Animations de sticker (pulse, heartbeat, wobble, bounce, blink, float, shake, spin, swing, tada, pop) rendues au canvas et à l'export.
- Pastille de lieu : sélecteur de lieu injecté (Places/Maps), pose en bas de slide centrée avec cascade pour deux lieux, chip « Lieu » masqué sans fournisseur.
- Annonce accessibilité du canvas composée (textes, stickers avec nom de gabarit + valeurs, glyphe emoji, mouvement) via un site unique ; descriptions localisées « qui clignote… ».

Rendu : Stickers posés au centre avec décalage en cascade, sélection = cadre ; pastille lieu = capsule en bas de la scène avec icône de position et nom.

Transposition Android : MapKit/CoreLocation -> Places SDK / Google Maps + FusedLocationProvider injectés par l'app.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+StickersAndPlaces.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryStickerAccessibility.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryLocationPickerEnvironment.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Pendant que j'écris, une rangée de bulles flottantes règle police, couleur, alignement, fond, contour, cadrage, effet et langue d'un tap

`stc2-text-floating-toolbar` · Android : **partielle** · P1 · effort M

StoryTextEditToolbar ancre en haut le bouton « Terminé » et en bas, au-dessus du clavier, une rangée unique de bulles (TextEditFloatingBubbles) plus le panneau de l'outil déplié ; toucher hors d'un panneau le referme sans quitter l'édition.

Écarts :
- Remplacer la TextStyleToolbar actuelle par la rangée de bulles iOS à huit outils (align, border, frame, style, color, background, language, effect) affichant l'état courant.
- Mode d'édition texte distinct (enterTextEditingMode/exitTextEditingMode) : bouton « Terminé » en haut, rangée au-dessus du clavier, tap hors panneau = referme le panneau seulement.
- Rapporter le bord supérieur de la rangée au canvas pour garder la dernière ligne éditée au-dessus du clavier (zone d'édition centrée, texte long défilant).
- Liste de fonds partagée panneau/rotation avec libellés localisés (Noir, Noir 65 %, Verre, Indigo, Rose, Vert, Ambre...).

Rendu : Bulles 44 dp en une rangée, l'outil déplié ouvre un panneau au-dessus.

Transposition Android : Rangée au-dessus du clavier -> WindowInsets.ime + Modifier.imePadding ; SF Symbols -> icônes Material.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextAttributeCycle.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextBackgroundPresets.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+TextEditing.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`

### Mes textes se déclinent en 18 styles et une trentaine d'effets (lueur, néon, ombre, contour) rendus à l'identique partout

`stc2-text-styles-effects` · Android : **partielle** · P1 · effort M

StoryTextStyle compte 18 familles sur polices embarquées (bold, neon, typewriter, handwriting, classic, calligraphy, cartoon, futuristic, fantasy, curve, tag, italic, retro…), résolues par storyFont ; l'axe EFFET (StoryTextEffect : lueurs, néons colorés, halos, contours, ombres en fractions de la taille) est orthogonal à la police et projeté par StoryTextEffectModifier.

Écarts :
- Android ne propose que 5 styles : ajouter les 13 autres familles avec polices embarquées (aucune ne doit retomber en serif).
- Exposer l'axe EFFET dans le composer : le modèle StoryTextEffect (table d'ombres en em) existe mais le composer ne fait que presetEffect() (GLOW pour neon).
- Rendu partagé de l'effet pour vignettes de panneau, bulle d'outil et aperçus (modifier Compose Shadow/Paint.setShadowLayer, teintes Text/Dark/Light/Tint).
- Ordre de allCases = ordre du cycle d'attributs et des pickers : ne rien insérer au milieu.

Rendu : Vignette « Aa » 52x40 dp dans la police, sélection fond brandPrimary ; l'effet se voit dans la bulle (lueur/ombre réelle) ; tailles de police 18 pt dans le panneau.

Transposition Android : Polices embarquées iOS -> fonts Android (res/font) équivalentes libres ; shadow SwiftUI -> Paint.setShadowLayer / TextStyle(shadow).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFont.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEffectStyle.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextEffectShadow.kt`

### Le son se voit : note, spectre, crédit et durée à côté de l'avatar, sous la scène ou en puce déplaçable

`scomp-sound-traces-badges` · Android : **partielle** · P2 · effort M

Un son de FOND est un attribut de la publication : trace « note · onde · crédit · durée » sans capsule au-dessus de la carte (surface scène) ou capsule à côté de l'avatar (surface document, qui fait descendre le texte). Un son de CONTENU ne paraît JAMAIS à côté de l'avatar : carte de lecture sous la zone de texte avec transcription défilante (cues). Un son posé sur la scène est une puce (ComposerSceneSoundChips) déplaçable/redimensionnable. Une règle (avatarBadge, opensEditor, supersededId, served) tranche ce qui s'affiche où ; touche -> édite le son (« Modifier le son de fond »).

Écarts :
- Android lit le son (AudioTrackSurface, viewer) mais n'a aucune trace de composition : créer ComposerSoundTraceRow (note + spectre + crédit + durée) avec libellé parlé (spokenLabel).
- Capsule de son de fond à côté de l'avatar du document et trace sans capsule au-dessus de la carte de scène ; le texte descend de la place occupée.
- Carte de son de contenu sous la zone de texte avec transcription qui défile (AudioTranscriptCue), résolue depuis la transcription renvoyée (survivingTranscription).
- Puce sonore posée sur la scène (déplaçable, redimensionnable) et règle d'exclusivité fond/contenu/puce (ComposerSoundDestination).
- Crédit d'un son emprunté (ComposerSoundCredit) affiché dans la trace.

Rendu : Ligne note 14 sp + onde + crédit + durée mono, texte blanc, sans fond sur la scène ; capsule indigo discrète à côté de l'avatar.

Transposition Android : Waveform déjà disponible côté chat (MicAmplitude/AudioLevelMetering) ; Canvas pour l'onde.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneSoundHeader.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundTraceRow.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerAvatarSoundBadge.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSoundColumn.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneSoundChips.swift`
- `apps/ios/Meeshy/Features/Main/Composer/ComposerForegroundSound.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Poser un sticker de la palette : emoji, bibliothèque, gabarit (heure, lieu, décorations), lieux alentour et « Ma position »

`scomp-sticker-pose-places-templates` · Android : **partielle** · P2 · effort M

La palette de stickers (SDK) rend un choix (StickerSheetChoice : emoji, bibliothèque, gabarit avec emplacements, gabarit de lieu, mee) que l'app pose sur la scène (SceneStickerPose.pose) ; les octets d'un sticker de pack viennent du cache d'images (fichier tel quel, animation conservée, repli image). Les lieux ALENTOUR (MapKit + localisation ponctuelle, tri par distance) et « Ma position » exacte alimentent l'onglet lieu.

Écarts :
- Android ne pose que des emojis (8 catégories, recherche) ; ajouter les gabarits (heure, lieu, décorations animées avec mouvement pulse/bounce/spin… déclaré par le gabarit), les stickers de pack (octets via cache d'images) et l'onglet Lieux.
- Lieux alentour (Places/Overpass ou API Meeshy) avec une seule localisation ponctuelle, tri par distance, 'Ma position' exacte reverse-géocodée (sticker.place.exact), fusion exacte+alentour.
- Poser en évitant les positions existantes (ComposerSceneObjectCount.positions) et renvoyer l'id de l'objet pour le sélectionner.
- Mouvement d'une décoration = propriété du sticker, lecture figée sur les clients qui ne le rendent pas.

Rendu : Palette plein hauteur à cinq onglets ; vignette animée marquée d'un glyphe de mouvement.

Transposition Android : CLLocationManager one-shot -> FusedLocation getCurrentLocation ; MKLocalSearch -> Places API ou serveur.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/SceneStickerPose.swift`
- `apps/ios/Meeshy/Features/Main/Composer/StickerNearbyPlaces.swift`
- `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Pickers.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedPostLocationSticker.kt`

### Retrouver sa prise dans la galerie, et être prévenu quand l'enregistrement est refusé

`sct-camera-save-original` · Android : **partielle** · P2 · effort S

CameraModel+PhotoLibrary enregistre le brut de chaque prise dans l'album Meeshy si Réglages › Médias le demande (CaptureSavePolicy) ; le verdict est rendu : un refus d'accès à Photos affiche un toast d'erreur (camera.save.failed) ou, si l'accès est refusé, un toast avec action vers les Réglages. Le média part de toute façon dans le composer. Android : une brique d'écriture MediaStore existe pour la galerie du viewer, rien pour la caméra.

Écarts :
- Brancher la sauvegarde du brut (octets d'origine, EXIF) sur la prise caméra, selon le réglage « enregistrer l'original »
- Verdict rendu à l'appelant : n'annoncer « enregistré » que sur succès
- Toast d'erreur « Impossible d'enregistrer » avec action vers les réglages quand c'est un refus de permission (stockage scoped : surtout API ≤ 28)
- Ne jamais bloquer l'envoi dans le composer sur l'échec de sauvegarde

Transposition Android : MediaStore (RELATIVE_PATH Pictures/Meeshy, IS_PENDING) via GalleryImageSaver ; WRITE_EXTERNAL_STORAGE seulement ≤ API 28.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CameraModel+PhotoLibrary.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GallerySaveTarget.kt`

### Choisir si les gestes pilotent l'arrière-plan ou le premier plan

`sct-canvas-layer-chips` · Android : **partielle** · P2 · effort S

CanvasLayerIndicator affiche sur la bordure gauche deux chips tappables « Arrière-plan » / « Premier plan » (directive 2026-07-14) qui désignent le groupe recevant pan/pinch/rotate : le média de fond (zoom, rotation, position) ou le premier plan (textes, stickers, médias ajoutés). Ils ne sont montés que quand les DEUX couches portent du contenu et que le chrome ou le viewport zoomé s'y prête ; le tap poste storyComposerSelectManipulationLayer au canvas. Android : le canvas pince/déplace le fond quand aucun élément n'est touché, sans sélecteur de couche.

Écarts :
- Chips « Arrière-plan » / « Premier plan » (cible 44 pt) pour forcer la couche manipulée
- Visibles seulement quand fond ET premier plan portent du contenu (sinon l'auto-dérivation gagne)
- Couche active surlignée ; aucune puce active sur une slide vierge
- Router l'override vers les gestes du canvas (détection pan/pinch/rotate)

Rendu : Deux chips verticaux sur la bordure gauche, icône + libellé, accent actif.

Transposition Android : FilterChip/Surface verre sur le bord gauche ; état de couche dans le ViewModel consommé par les détecteurs de gestes du canvas.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/CanvasLayerIndicator.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryCanvasTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryBackgroundObjectTransform.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Dupliquer un texte, un média ou un sticker avec un léger décalage

`sct-composer-object-duplicate` · Android : **partielle** · P2 · effort S

StoryComposerObject+Duplicate fournit duplicated(withNewId:offsetBy:) pour StoryTextObject, StoryMediaObject et StorySticker : même contenu, nouvel identifiant, position décalée d'un delta pour que la copie se voie. Android : seule la duplication d'un texte existe (onDuplicateTextElement).

Écarts :
- Dupliquer un sticker (copie, nouvel id, décalage)
- Dupliquer un média de premier plan (même source, nouvel id, décalage), sans toucher au fond
- Action « Dupliquer » dans le menu contextuel de chaque type d'élément
- Décalage identique à iOS (delta CGPoint) et sélection de la copie

Transposition Android : Fonctions copy() des data classes avec nouvel UUID et offset normalisé.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryComposerObject+Duplicate.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryElementMenu.kt`

### Voir les fondus enchaînés entre deux clips dans l'aperçu et l'export

`sct-timeline-video-compositing` · Android : **partielle** · P2 · effort M

VideoCompositor transforme un projet en AVMutableVideoComposition : segments de la composition annotés des clips actifs, rampes d'opacité pour crossfade natif, haute précision de timescale (600 000) pour des transitions courtes, appariement clips ↔ pistes. DissolveVideoCompositor applique CIDissolveTransition sur GPU (Metal) pour les transitions dissolve. CustomTransitionCompositor est un compositeur réservé aux futurs push/wipe/zoom/swipe. Android : le lecteur calcule l'opacité des transitions (StoryClipTransitionResolver) mais pas de composition d'export.

Écarts :
- Calcul pur des segments de composition et des rampes d'opacité (crossfade) à partir du projet
- Dissolve rendu comme crossfade partout où il se joue (cohérent avec ReaderTransitionResolver)
- Précision temporelle élevée pour les durées de transition courtes
- Appariement clips ↔ pistes vidéo de la composition ; réservé : push/wipe/zoom/swipe
- Rendu dans l'aperçu du composer et l'export MP4

Transposition Android : Media3 effects (OverlayEffect, MultipleInputVideoGraph) / Compositor ; opacité par rampes ; export Transformer.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/DissolveVideoCompositor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryClipTransitionResolver.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaFadeResolver.kt`

### Un texte à vue unique se referme dès qu'on le retouche ou qu'il quitte l'écran

`sct-view-once-text-retouch` · Android : **partielle** · P2 · effort S

ViewOnceRetouchModifier pose un TapGesture SIMULTANÉ (il n'avale ni l'appui long du menu ni un lien touché) qui, tant que le texte à vue unique est actif, le fait passer à « (1) · Déjà ouvert » dès le retouchage ; la seconde porte (sortie d'écran) est tenue par l'hôte de chaque peau (Bulles, Focal/Script, Rivière). Inactif, il ne pose aucun geste. Android : un voile flou « toucher pour révéler » existe pour les bulles, sans consommation à la retouche ni à la sortie.

Écarts :
- Retoucher le texte révélé le referme (état « (1) · Déjà ouvert ») sans bloquer l'appui long ni les liens
- Fermeture aussi à la sortie de l'écran / disparition de la bulle, pour les trois peaux de conversation
- Consommer réellement le compteur serveur à la révélation (le commentaire de BubbleBlurReveal indique l'endpoint non câblé)
- Aucun geste posé quand le message n'est pas à vue unique

Transposition Android : Modifier.pointerInput(detectTapGestures) non consommant + DisposableEffect pour la sortie d'écran.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ViewOnceRetouchModifier.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Pendant que je déplace un objet, la zone sûre, les repères d'alignement et l'avertissement hors-cadre m'aident à bien le placer

`stc2-canvas-guides-safe-zone` · Android : **partielle** · P2 · effort S

StorySafeZone (18 % haut, 25 % bas, 5 % côtés) ; StoryAlignmentSnap aimante sur bords de la zone sûre, tiers et centre (tolérance 0,015) ; SafeZoneOverlay (pointillés + puce « Zone sûre ») n'apparaît que pendant un drag ; OutOfBoundsWarningOverlay pulse (0,6 s), sans animation si Reduce Motion.

Écarts :
- Pendant le drag Android trace rectangle sûr + grille de tiers sans libellé ; iOS ne trace que le rectangle pointillé indigo300 70 % avec la puce « Zone sûre ».
- Aligner l'aimantation : tolérance 0,015 (Android 0,025) et cibles = bords de la zone sûre + tiers + centre (Android : centre + tiers, marge 0,06).
- Avertissement hors-cadre pulsant (opacité 0,5->0,9, épaisseur 1,5->2,5 pt, cycle 0,6 s), statique si les animations système sont réduites.

Rendu : Pointillés 1 pt [4,4] indigo300 à 70 %, puce capsule indigo500 à 85 % centrée au-dessus du rectangle, texte 10 pt arrondi blanc ; repères 1 pt non interactifs.

Transposition Android : Reduce Motion iOS -> Settings.Global.ANIMATOR_DURATION_SCALE / LocalReduceMotion ; traits dessinés dans le DrawScope du canvas.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasGuides.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySafeZoneGrid.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySnapResolver.kt`

### Mes médias sont déjà chez le serveur quand j'appuie sur Publier, et la scène adopte l'asset monté sans clignoter

`stc2-media-preupload-adopt` · Android : **partielle** · P2 · effort S

adoptPreUploadedMedia(localURL:postMediaId:remoteURL:) fait cesser l'objet d'être local une fois l'asset téléversé à la pose (#5086) : la recherche se fait par URL LOCALE sur TOUTES les slides (l'objet a pu changer de slide pendant la montée) et non par identifiant d'objet.

Écarts :
- Android téléverse les médias à la sélection (file durable hors-ligne UPLOAD_MEDIA) mais ne remplace pas un objet de scène local par son asset monté.
- Conserver l'URL locale pour l'aperçu tout en pointant postMediaId/remoteURL (aucun clignotement au changement de source).
- Ignorer sans erreur une adoption dont l'objet a été supprimé entre-temps.

Rendu : Aucun visuel ; pas de re-peinture du média à l'adoption.

Transposition Android : Montée à la pose -> WorkManager/outbox existant ; correspondance par URI locale.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+PreUpload.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryMediaUploader.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/MediaUploadRetryPolicy.kt`

### Animer un élément entre ses images-clés avec la bonne courbe

`sct-keyframe-interpolation` · Android : **complète** · P2 · effort S

KeyframeInterpolator interpole des (temps, valeur, easing) : 0 keyframe → nil (valeur statique), 1 → constante, N → segment [ki, ki+1] avec easing, entrée non triée tolérée ; Lerpable pour Float, CGFloat, CGPoint et CGSize. Android : le lecteur a le même calcul par canal (StoryKeyframeInterpolator, easings) avec tri de sécurité.

Transposition Android : Déjà en place : interpolation par canal avec easings.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeInterpolator.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryKeyframeResolver.kt`

### La barre de progression d'une story ne recompose pas la slide à chaque tick

`sct-reader-slide-cache` · Android : **complète** · P2 · effort S

RenderableSlideCache est un cache à une entrée du StorySlide renderable de la slide courante : toRenderableSlide résout les traductions (Prisme) et hydrate les durées média, et l'appeler 3 fois par body à chaque tick recomposerait toute la slide. Invalidation par empreinte (id + chaîne de langues + nombre de traductions par texte, ce qui couvre les merges temps réel story:translation-updated). Android : le ViewModel calcule toSlideView une fois au chargement et à chaque événement de traduction ; aucun recalcul par tick.

Transposition Android : Équivalent déjà en place : slides précalculées dans l'état du ViewModel (StorySlideView) et remplacées sur événement de traduction.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RenderableSlideCache.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Je choisis un fond de slide en couleur unie ou en dégradé dans une palette cohérente

`stc2-background-style-palette` · Android : **complète** · P2 · effort S

storyBackgroundStyle(raw, fallbackHex) convertit la valeur d'effets en ShapeStyle (hex ou dégradé a->b, repli 1A1A2E) ; StoryBackgroundPalette (17 couleurs unies, 6 dégradés, couleur pastel aléatoire hors presets) est la source unique de la palette du composer, avec applyBackground/clearBackground et une luminance du fond qui pilote le thème clair/sombre du chrome.

Rendu : Pastilles de fond en rangée, dégradés linéaires a->b, fond aléatoire pastel basse saturation / forte luminosité.

Transposition Android : Palette portée à l'identique (valeurs hex sans #), pinceau Compose Brush.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryBackgroundStyle.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerSupportTypes.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryBackgroundPalette.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryBackgroundValue.kt`

