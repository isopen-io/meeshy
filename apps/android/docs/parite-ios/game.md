# Parité iOS → Android : `game`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**95 features iOS** : 91 absentes, 3 partielles, 1 divergentes, 0 complètes sur Android. **69 lots** planifiés (≈53670 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**game#1** (couverture Android estimée ≈ 2 %)

Ce lot est le coeur du Jeu Meeshy sur iOS : l'écran Progression (première page à 15 cartes de concepts, fiches par concept, sous-pages Badges / Défis / Succès, hub historique de repli), la couche de jeu (niveau et paliers, Étincelles, Meesh frappées, rang de Gloire, Flamme, missions du jour + coffre, ligue, saison, Renaissance, vitrine, Atlas), le guide de Mee et Meo, le carnet des règles illustré, la bannière du joueur dans le bandeau du haut, la célébration plein écran d'un palier, GameService (≈24 routes /me/game, requestId d'idempotence par intention), la lecture cache-first de GET /me/engagement avec gestes optimistes + restauration + événement socket game:updated, et ≈28 briques de dessin vectoriel (anneau de niveau, 20 emblèmes de palier, blasons, médailles, pièce Meesh sur géométrie JSON partagée, Flamme, coffre, coupes, gemmes, QR de parrainage, shaders Metal). Android : quasi rien. Il ne porte que la liste textuelle des succès du profil (nom + pourcentage, issue de /users/stats), trois types de notification (achievement_unlocked, streak_milestone, badge_earned), les modèles Affiliate (sans API ni UI) et quelques socles réutilisables (CollapsibleHeader, MeeshyCard, MeeshyMotion, NotificationDestinationResolver). Aucune route /me/engagement ni /me/game, aucun écran Progression, aucune brique graphique, aucune mascotte Mee/Meo, aucun type level_up ni game_*. Le texte pèse 1 432 clés x 7 langues (ar, de, en, es, fr, it, pt-BR) côté iOS contre 4 locales Android (en, es, fr, pt). Le chantier est un module neuf (:feature:game + briques dans :sdk-ui + API/dépôt dans :core:network/:sdk-core + lois pures dans :core:model) estimé à ≈26 000 lignes Kotlin, dont l'ossature P0 (service, lois, ViewModel optimiste, première page, fiches, briques de base) pèse environ 12 000.

**game#2** (couverture Android estimée ≈ 0 %)

Cette partie couvre le coeur du Jeu Meeshy sur iOS : les 29 fichiers de la vague 2 (pages Ligue, Saison, Prestige, Vitrine, Atlas, Reglages, archives, duo, bandeau de profil, guide Mee et Meo, copie localisee, modele de gestes optimistes, cache disque par compte), les 15 choregraphies (ceremonie de frappe plein ecran a ~2 600 particules, coffre, badge, ecu de rang, haptiques, irisation du Prisme), le parcours Photo (proposition apres une celebration, camera selfie, cadre 9:16 et 1:1 avec plaque d'auteur, carnet local, carte de parrainage a QR) et 38 fichiers du SDK (modeles tolerants du bloc game, lois miroirs de packages/shared/utils/game rejouees sur vecteurs partages). Mesure sur apps/android : AUCUNE trace du jeu (ni route /me/game ou /me/engagement-game, ni en-tete X-Meeshy-Game-Version, ni modele, ni ecran, ni notification gameEnabled, ni Lottie, ni CameraX dans le catalogue de versions). Couverture Android : 0 %. Seuls des briques generiques sont reutilisables : MeeshyCard/MeeshySkeleton/CollapsibleHeader/MeeshyMotion (sdk-ui), HapticFeedbackType, GalleryImageSaver (MediaStore), zxing + ACTION_SEND (ProfileShareSheet), Retrofit + kotlinx.serialization + DataStore + Room, et SparkleField (particules du chat). Le chantier est XL (~19 400 lignes Kotlin hors tests, ~410 chaines x 9 variantes de langue) : fondation SDK d'abord (modeles, lois levels/glory, modele de gestes, cache, coque de pages, copie), puis pages (Ligue, Saison, Prestige, Vitrine, Atlas, Reglages), puis bandeau de profil, puis choregraphies et photo (P2). Les lois restent du TypeScript de reference (packages/shared/utils/game) : le portage Kotlin se prouve sur les memes vecteurs JSON (game.vectors.json, sparks.vectors.json, mint-ceremony.vectors.json).

## Notes transverses

SYNTHESE. 69 lots, ~50 000 lignes de production Kotlin (hors tests, hors ~10 000 lignes XML de chaines generees). Les deux parties d'inventaire (game#1, game#2) se recouvrent sur 12 capacites (modeles du bloc game, service/depot, ViewModel optimiste, guide Mee/Meo, bandeau du joueur, lois de niveau/gloire, briques rang/trophee/coffre, textes, parrainage) : elles ont ete dedoublonnees, chaque capacite n'apparait que dans UN lot. GameGaugesView.swift (vestigiale, sans site d'appel) n'est pas portee.

AJOUTS ABSENTS DE L'INVENTAIRE mais indispensables (les deux parties les citent comme "autre partie du domaine") : (a) game-engagement-progress-model : EngagementProgress/Resolver/Catalog/Reveal et la reponse de frappe, base de TOUT l'ecran Progression (GET /me/engagement) ; (b) game-mee-meo-figures : le pack Mee et Meo (films .lottie du pack MeeStickers) que citent guide, blason, trophees, prestige, cartes photo - ajoute la dependance lottie-compose ; (c) game-navigation-map-and-links + game-navigation-wiring : pilotage de la navigation, des liens profonds et des notifications ; (d) game-streak-reminders (gap du ViewModel). Les lots 'ext:' restent a confirmer aupres des autres domaines : ext:interface-languages-it-de-ar (config de locales it/de/ar, Android n'a que en/es/fr/pt) et ext:contact-card-detail-sheet (la fiche carte de contact n'existe pas sur Android).

ORDRE ET VAGUES. Vague 0 (racines, parallelisables) : game-module-scaffold, game-block-models, game-brick-foundations, game-mee-meo-figures. Vague 1 : modeles wave2/engagement, toutes les lois pures de :core:model (5 a 12), copy-helpers, strings. Vague 2 : modeles de concepts, couche reseau/cache/depots, briques de dessin. Vague 3 : ViewModels, primitives UI, feuille de details, cartes. Vague 4 : ecrans (accueil, fiches, missions, frappe, guide, etagere de badges, fiche de concept) puis navigation/cablage. Vague 5 : pages vague 2 (ligue, saison, prestige, vitrine, atlas, reglages), banniere du joueur, ceremonie de frappe. Vague 6 (P2) : parcours Photo, parrainage QR, rappels de serie, bande de carte de contact. Regle de priorite : un lot dont depend un lot P0 est P0 ; la fermeture P0 (~22 000 lignes) est plus lourde que les 12 000 de l'inventaire parce que les 15 cartes de la premiere page exigent leurs emblemes (anneau, blason, pieces, Flamme, medaille).

POINTS CHAUDS DE FICHIERS PARTAGES (a serialiser par depends_on, jamais en parallele) : core/network MeeshyApi.kt + NetworkModule.kt (lots 19 puis 68) ; core/database MeeshyDatabase.kt + DatabaseModule.kt, version Room 16->17 (lot 20 ; toute autre migration du depot se conflit : rebaser) ; sdk-core DefaultSessionTeardown + SdkModule.providesSessionTeardown (lot 20 : la deconnexion DOIT purger caches et reglages du jeu - conformite A-9) ; RealtimeSessionCoordinator.attachAll (lot 22) ; app MeeshyApp.kt (1202 lignes, DEJA au plafond 1200 du budget : le lot game-navigation-wiring doit EXTRAIRE le graphe de navigation du jeu dans feature/game, ne rien ajouter d'autre qu'un appel gameGraph(...) et deux constantes ; les lots 57 et 59 ne touchent MeeshyApp.kt que par une ligne, apres le lot 50) ; settings.gradle.kts, app/build.gradle.kts (lot 1 seul) ; gradle/libs.versions.toml et sdk-ui/build.gradle.kts (lot 27 : lottie ; lot 65 : CameraX) ; feature/profile ProfileScreen.kt (lot 57 seul) ; feature/settings (lot 56 seul) ; core/model NotificationTypeToggle.kt (lot 56) vs Notification.kt/NotificationAccent.kt/NotificationFilterCategory.kt (lot 50). Les fichiers de ressources sont tous NOUVEAUX et propres au module : les lots n'editent jamais le strings.xml d'un autre lot.

CONVENTIONS RETENUES. (1) Lois pures dans :core:model sous me.meeshy.sdk.model.game.* (aucun import android.*, verifiables par ./apps/android/meeshy.sh jvm-check) ; les phrases ne sont jamais composees dans la loi : elle rend un descripteur GameText (cle fermee + arguments), resolu en Compose par stringResource - c'est ce qui permet de tester ProgressionConceptModel et ses 15 concepts sur JVM nue. (2) Nom de ressource Android = cle iOS avec '.' et '-' remplaces par '_' (game.concept.level.name -> game_concept_level_name), positionnels %1$s/%2$s : les lots d'UI peuvent donc nommer leurs ressources avant que le lot game-strings-seven-languages ne les genere, et sa garde de parite casse si une cle manque. (3) Les mises a parite sur les memes vecteurs JSON que iOS et le web : packages/shared/fixtures/reading-modes/{game,sparks,mint-ceremony,engagement-progress,badge-guide,meesh-display-edition}.vectors.json et packages/shared/design/meesh-coin.json (lus par chemin relatif comme PrismPreviewVectorParityTest) - sur divergence le TypeScript a raison. Le jeu devient un TROISIEME miroir pour : levels/glory/missions/mint/league/season/rank-crest/tier-emblem/meesh-coin/photo layout/achievement-catalog (loi a miroirs : toute evolution touche web+iOS+Android). (4) Navigation : chaque ecran livre son propre fichier *Destinations.kt qui implemente GameDestinationContributor (Hilt @IntoSet, interface posee par game-navigation-map-and-links) - le cablage n'a donc pas a etre reedite a chaque ecran. Un ecran livre avant le cablage est compile et teste mais non atteignable (acceptable, derriere le lot 50). (5) Ecritures : requestId UUID genere UNE fois par intention, rejoue au reessai, renouvele apres succes ou REQUEST_ID_CONFLICT ; hors ligne les gestes d'ecriture du jeu se TAISENT avec la raison dite (pas de file Outbox pour eux, comme iOS). Le corps brut d'un refus 409 est lu depuis retrofit2.Response.errorBody() (extras racine sparksDebt, price...) : ne PAS modifier ApiCall.kt/ApiError. (6) La langue de l'interface commande tous les textes du jeu, nombres et noms de langue (Atlas) ; jamais la langue de contenu du Prisme. Le jeu n'utilise pas l'accent de conversation : teintes par concept/palier, couleurs semantiques (success/warning/error) statiques. La presence n'est pas touchee, mais la Flamme n'est JAMAIS montree sur la fiche d'un autre membre, et le serveur decide de ce qui est servi (rien servi = rien dessine, un refus ne se distingue pas d'une absence).

ACCESSIBILITE / MOUVEMENT. Toute brique est decorative (clearAndSetSemantics) sauf libelle fourni par l'hote qui en fait UN element image ; cibles >= 48 dp ; aucune etat porte par la seule couleur ; animations reduites = valeur posee ou fondu 0,25 s (LocalReduceMotion derive de Settings.Global.ANIMATOR_DURATION_SCALE dans game-brick-foundations, car Android n'a pas de reglage Meeshy de reduction). Les boucles (Flamme, eclats du prisme, tilt) s'arretent hors ecran. RTL : bandeau, ordre des pieces et QR retournes en arabe, scene de ceremonie forcee LTR.

RISQUES. (a) Perf : ceremonie de frappe (~2 600 a 4 500 particules en UN Canvas) a profiler sur appareil milieu de gamme + stride automatique ; AGSL exige API 33 (minSdk 26 : repli en degrades, jamais d'erreur). (b) Locales : Android ne livre que en/es/fr/pt ; it/de/ar doivent etre ajoutees par ext:interface-languages-it-de-ar (locales_config.xml, resConfigs) avant que la parite des 7 langues soit prouvable ; pt-BR iOS alimente values-pt (pas de values-pt-rBR distinct). (c) Poids : 1 432 cles x 7 langues ; le generateur Python est la seule source, jamais d'edition manuelle. (d) Le catalogue d'atlas doit rester egal a SUPPORTED_LANGUAGE_CODES. (e) Aucun lot ne se declare vert sans run android.yml vert (assembleDebug + testDebugUnitTest) ; les lots :core:model se prouvent localement par meeshy.sh jvm-check. (f) E2EE/Prisme non concernes par le jeu, mais les images de carte Photo ne partent jamais au serveur ('aucune image n'est envoyee') et aucun jeton de parrainage n'est cree sans geste explicite (conformite H-8).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `game-achievement-reveal` | E | P2 | M | 600 | game-engagement-progress-model, game-laws-showcase-atlas-prestige, game-brick-medal-badge, game-ui-scaffold-primitives, game-brick-foundations, game-copy-helpers, socle-points-d-extension-de-l-app, story-viewer-decomposition-and-nav-graph | Quand je décroche un palier, une carte posée me le montre en grand avec mon pseudo gravé, et le lecteur de stories se fige dessous |
| `game-badge-shelf` | E | P2 | M | 880 | game-brick-medal-badge, game-element-detail-sheet, game-engagement-progress-model, game-ui-scaffold-primitives, game-brick-foundations, game-copy-helpers | Mes badges sont rangés par famille, un par axe, avec leurs étoiles et la suite des paliers, et s'allument avec une matière qui monte |
| `game-block-models` | E | P2 | M | 850 |  | Le bloc Jeu du serveur se lit sans jamais casser l'application, devant un serveur ancien comme récent |
| `game-brick-flame-chest-trophy-gem` | E | P2 | M | 780 | game-brick-foundations, game-mee-meo-figures, game-brick-rank-blason, game-laws-day-missions-flame-chest | Ma Flamme vacille, mon coffre s'ouvre et mes coupes, gemmes de ligue et tampons d'Atlas sont de vraies pièces dessinées |
| `game-brick-foundations` | E | P2 | L | 1250 |  | Toutes les pièces du jeu partagent les mêmes matières, la même Signature, la même accessibilité et le même mouvement |
| `game-brick-level-ring` | E | P2 | M | 700 | game-brick-foundations, game-laws-levels-glory | Mon niveau est un anneau qui se remplit, avec l'emblème de mon palier en filigrane et son chiffre romain |
| `game-brick-medal-badge` | E | P2 | M | 700 | game-brick-foundations, game-engagement-progress-model | Mes badges sont de vraies médailles de métal avec perles de palier, ruban et arc de progression |
| `game-brick-meesh-coin` | E | P2 | L | 1400 | game-brick-foundations, game-mee-meo-figures, game-laws-mint-economy | La Meesh est une vraie pièce frappée, avers et revers, en trois éditions, identique au web module pour module |
| `game-brick-rank-blason` | E | P2 | M | 850 | game-brick-foundations, game-mee-meo-figures, game-laws-levels-glory | Mon rang est un blason de métal avec ma division et, plus haut, Mee et Meo qui le tiennent |
| `game-cache-and-settings-store` | E | P2 | M | 700 | game-network-api, game-wave2-block-models, socle-points-d-extension-de-l-app, persist-room-migrations | Le Jeu s'affiche depuis le disque avant le réseau, par compte, et se purge à la déconnexion |
| `game-concept-card-model` | E | P2 | M | 900 | game-block-models, game-engagement-progress-model, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy, game-progression-catalog-laws, game-copy-helpers | Chaque concept dit la même chose partout : un nom, une valeur, une ligne, et jamais deux fois le même fait |
| `game-concept-emblems-and-cards` | E | P2 | M | 820 | game-concept-card-model, game-ui-scaffold-primitives, game-element-detail-sheet, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-brick-medal-badge, game-brick-meesh-coin | Chaque concept est reconnaissable à son emblème dessiné et à sa carte tactile qui rebondit |
| `game-concept-fiche-model` | E | P2 | M | 800 | game-concept-card-model, game-engagement-progress-model, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy | Chaque fiche de concept s'ouvre sur sa tête, sans redire ce que la tête dit déjà |
| `game-concept-fiche-page` | E | P2 | M | 750 | game-concept-card-model, game-concept-fiche-model, game-progression-viewmodel, game-ui-scaffold-primitives, game-element-detail-sheet, game-concept-emblems-and-cards, game-hero-and-fiche-heads-ui, game-missions-chest-flame-ui, game-meesh-mint-section, game-badge-shelf, game-navigation-map-and-links | Chaque concept a sa fiche : C'est quoi, où j'en suis, comment en gagner, à toi de jouer, aller plus loin |
| `game-concept-model-wave2` | E | P2 | M | 400 | game-concept-card-model, game-laws-league-duo, game-laws-season-archive, game-laws-showcase-atlas-prestige | Ligue, saison, Prestige, vitrine et Atlas ont leur carte et leur ligne sur la première page de Progression |
| `game-contact-card-strip` | E | P2 | S | 200 | game-visitor-schedule-archive-repositories, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-profile-surfaces, carte-visite-fiche-detail | Dans la fiche d'un contact Meeshy je vois son niveau, son rang, son trésor et trois coupes |
| `game-copy-helpers` | E | P2 | M | 650 | game-module-scaffold, game-block-models | Les nombres, accords et noms du jeu se disent selon la langue de l'interface |
| `game-element-detail-sheet` | E | P2 | M | 1000 | game-ui-scaffold-primitives, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-brick-medal-badge, game-brick-meesh-coin, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy, game-engagement-progress-model, game-copy-helpers | Je touche un élément du jeu et une feuille m'explique ce que c'est, où j'en suis et comment l'obtenir |
| `game-element-details-collectibles` | E | P2 | M | 500 | game-element-detail-sheet, game-wave2-block-models, game-laws-league-duo, game-laws-season-archive, game-laws-showcase-atlas-prestige, game-progression-catalog-laws, game-brick-medal-badge | Je touche un badge, un succès, un trophée, un tampon ou une étape de saison et je sais comment l'obtenir |
| `game-engagement-progress-model` | E | P2 | M | 1100 | game-block-models | La progression de mes badges, séries et niveaux se résout à l'identique du web et d'iOS |
| `game-engagement-repository` | E | P2 | M | 800 | game-network-api, game-cache-and-settings-store, game-engagement-progress-model, socle-points-d-extension-de-l-app | La progression se peint tout de suite depuis le cache et ne rejoue jamais un état plus ancien qu'un geste confirmé |
| `game-guide-session-and-card` | E | P2 | M | 1000 | game-laws-guide-v1, game-write-repository, game-cache-and-settings-store, game-brick-foundations, game-mee-meo-figures, game-ui-scaffold-primitives, game-copy-helpers | Mee et Meo m'accueillent, me disent ce qui vient d'arriver et m'indiquent l'étape d'après, sans bulle |
| `game-guide-wave2-events` | E | P2 | M | 600 | game-guide-session-and-card, game-wave2-block-models, game-laws-league-duo, game-laws-season-archive, game-laws-showcase-atlas-prestige, game-cache-and-settings-store | Mee et Meo racontent ma montée de ligue, ma fin de saison, mon trophée ou mon tampon à l'ouverture suivante |
| `game-hero-and-fiche-heads-ui` | E | P2 | M | 750 | game-concept-fiche-model, game-progression-viewmodel, game-brick-level-ring, game-brick-rank-blason, game-brick-meesh-coin, game-ui-scaffold-primitives, game-element-detail-sheet, game-copy-helpers | Le héros du jeu montre où j'en suis (niveau, rang, Étincelles) et les fiches Étincelles et Héritage s'ouvrent sur ce que je possède |
| `game-hub-sections` | E | P2 | M | 900 | game-engagement-progress-model, game-progression-catalog-laws, game-ui-scaffold-primitives, game-element-detail-sheet, game-badge-shelf, game-achievement-reveal, game-progression-viewmodel, game-brick-medal-badge | Je retrouve mes badges, défis et succès dans des pages dédiées, avec le compte en capsule de verre |
| `game-laws-day-missions-flame-chest` | E | P2 | M | 1000 | game-block-models | Mes missions du jour, mon minuteur, ma Flamme, mes boosts et mon coffre suivent les mêmes règles qu'iOS, hors ligne compris |
| `game-laws-guide-v1` | E | P2 | M | 350 | game-block-models, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy | Mee et Meo choisissent le bon moment pour me parler, la même carte au même moment que sur iOS et le web |
| `game-laws-league-duo` | E | P2 | M | 700 | game-wave2-block-models | Ma ligue de la semaine, ma place sur 30 et ma mission en duo suivent les règles du serveur |
| `game-laws-levels-glory` | E | P2 | M | 830 | game-block-models | Mon niveau, mon palier, mon rang de Gloire et ma place au Mythe se calculent comme sur le serveur |
| `game-laws-mint-economy` | E | P2 | M | 600 | game-block-models, game-laws-levels-glory | Le prix d'une Meesh, ma poche d'étincelles et mon trésor se calculent avant le geste |
| `game-laws-season-archive` | E | P2 | M | 700 | game-wave2-block-models | Ma saison de huit semaines, son calendrier servi et ses archives se calculent comme sur le serveur |
| `game-laws-showcase-atlas-prestige` | E | P2 | M | 1000 | game-wave2-block-models, game-laws-levels-glory | Ma vitrine, mon Atlas, ma constellation et mon Prestige suivent les règles de confidentialité du serveur |
| `game-league-and-duo-pages` | E | P2 | M | 1100 | game-pages-shell-and-format, game-wave2-gesture-model, game-laws-league-duo, game-brick-flame-chest-trophy-gem, game-ui-scaffold-primitives, game-element-details-collectibles, game-copy-helpers | Je vois ma ligue de la semaine, ma place sur 30 et le temps restant, je consens ou je quitte, et je joue un duo avec un ami |
| `game-mee-meo-figures` | E | P2 | M | 350 | dependances-gradle-scene-medias | Mee et Meo apparaissent partout où le jeu les convoque, animés ou en image fixe selon le mouvement |
| `game-meesh-mint-section` | E | P2 | M | 1000 | game-progression-viewmodel, game-optimistic-state, game-laws-mint-economy, game-brick-meesh-coin, game-mee-meo-figures, game-brick-foundations, game-ui-scaffold-primitives, game-element-detail-sheet, game-copy-helpers | Je frappe une Meesh : le prix est dit une fois, la pièce attend en flan vierge puis repose sur son revers numéroté |
| `game-mint-ceremony-flow` | E | P2 | M | 450 | game-mint-ceremony-law, game-mint-ceremony-scene, game-progression-viewmodel, game-meesh-mint-section, game-concept-fiche-page, game-brick-foundations | Frapper une Meesh ouvre une cérémonie plein écran qui se referme seule, pendant que la réponse du serveur arrive |
| `game-mint-ceremony-law` | E | P2 | M | 1000 | game-block-models, game-engagement-progress-model, game-laws-mint-economy, game-laws-levels-glory | La cérémonie de frappe se joue à la milliseconde près, avec les mêmes milliers d'étincelles que sur le web |
| `game-mint-ceremony-scene` | E | P2 | M | 800 | game-mint-ceremony-law, game-brick-meesh-coin, game-mee-meo-figures, game-brick-foundations, game-copy-helpers | La frappe d'une Meesh se joue en scène : des milliers d'étincelles tissent un cercle, Mee et Meo forgent la pièce et la frappent |
| `game-missions-chest-flame-ui` | E | P2 | L | 1300 | game-progression-viewmodel, game-brick-flame-chest-trophy-gem, game-ui-scaffold-primitives, game-element-detail-sheet, game-laws-day-missions-flame-chest, game-copy-helpers | Je vois mes trois missions du jour avec leur minuteur, j'en change une, j'ouvre le coffre et je veille sur ma Flamme |
| `game-module-scaffold` | E | P2 | S | 150 |  | Le module Jeu existe, compile et est branché à l'application |
| `game-navigation-map-and-links` | E | P2 | M | 550 | game-progression-catalog-laws, game-module-scaffold | Les liens et les entrées du jeu ouvrent toujours la bonne fiche, jamais une page orpheline |
| `game-navigation-wiring` | E | P2 | M | 800 | game-navigation-map-and-links, game-progression-home, game-concept-fiche-page, socle-points-d-extension-de-l-app | Les notifications de jeu, les liens profonds et l'application ouvrent la page Progression |
| `game-network-api` | E | P2 | M | 450 | game-block-models, game-wave2-block-models, game-engagement-progress-model, reseau-pipeline-reessai-erreurs | Les gestes et lectures du Jeu partent vers les bonnes routes du serveur, avec l'en-tête de version |
| `game-optimistic-state` | E | P2 | M | 900 | game-block-models, game-engagement-progress-model, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy | Chaque geste du Jeu change l'écran à l'instant et revient en arrière s'il est refusé |
| `game-pages-shell-and-format` | E | P2 | M | 600 | game-wave2-gesture-model, game-cache-and-settings-store, game-ui-scaffold-primitives, game-copy-helpers, game-wave2-block-models | Chaque page de la vague 2 s'ouvre avec le cache d'abord, l'état hors ligne dit et les dates et noms dans ma langue |
| `game-photo-author-plate` | E | P2 | M | 580 | game-photo-laws, game-laws-showcase-atlas-prestige, game-brick-foundations, game-mee-meo-figures, game-copy-helpers | Ma photo d'un succès, d'un rang ou d'une fin de mission porte une plaque gravée à mon pseudo, posée sur une petite carte |
| `game-photo-camera-and-frame` | E | P2 | M | 900 | game-photo-laws, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-brick-meesh-coin, game-mee-meo-figures, game-referral-link-qr, game-copy-helpers, dependances-gradle-scene-medias | Le selfie du moment se prend dans un cadre en direct qui donne exactement la même image à l'export |
| `game-photo-flow-and-offers` | E | P2 | L | 1500 | game-photo-laws, game-photo-notebook, game-photo-camera-and-frame, game-photo-author-plate, game-referral-link-qr, game-progression-viewmodel, game-guide-session-and-card, game-guide-wave2-events, game-brick-foundations, game-ui-scaffold-primitives, game-copy-helpers | Mee me propose « On immortalise ? » après une célébration, et je prends la photo : selfie, carte seule ou plus tard |
| `game-photo-laws` | E | P2 | M | 900 | game-wave2-block-models, game-laws-levels-glory, game-laws-day-missions-flame-chest, game-laws-mint-economy, game-laws-league-duo, game-laws-season-archive, game-laws-showcase-atlas-prestige | Les grands moments du jeu sont des moments qu'on peut photographier, dans l'ordre, sans en sauter aucun |
| `game-photo-notebook` | E | P2 | M | 950 | game-photo-laws, game-cache-and-settings-store, game-ui-scaffold-primitives, game-copy-helpers | La Chronique garde mes photos du jeu sur l'appareil : je les partage, les retire ou en photographie une nouvelle |
| `game-player-banner` | E | P2 | L | 1400 | game-engagement-repository, game-cache-and-settings-store, game-laws-levels-glory, game-laws-league-duo, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-brick-meesh-coin, game-navigation-wiring, game-copy-helpers, socle-points-d-extension-de-l-app | Mon niveau, mes Meesh, mon rang, ma ligue et ma Flamme s'affichent en bandeau en haut à l'ouverture de l'application, puis s'effacent |
| `game-prestige-page` | E | P2 | S | 300 | game-pages-shell-and-format, game-wave2-gesture-model, game-laws-showcase-atlas-prestige, game-brick-level-ring, game-brick-flame-chest-trophy-gem, game-mee-meo-figures, game-ui-scaffold-primitives, game-brick-foundations | Au niveau 100 je peux passer en Prestige après une confirmation claire de ce qui repart et de ce qui reste |
| `game-profile-surfaces` | E | P2 | M | 600 | game-navigation-wiring, game-visitor-schedule-archive-repositories, game-laws-levels-glory, game-brick-level-ring, game-brick-rank-blason, game-copy-helpers, socle-points-d-extension-de-l-app, profile-own-page-split | Mon profil propose Progression, montre mes succès en tuiles rondes, et la bannière d'un membre affiche son niveau et son rang selon ses réglages |
| `game-progression-catalog-laws` | E | P2 | M | 800 | game-block-models, game-engagement-progress-model, game-copy-helpers | Les concepts de Progression et les succès générés s'affichent dans le même ordre et les mêmes conditions que sur iOS |
| `game-progression-home` | E | P2 | M | 900 | game-progression-viewmodel, game-cache-and-settings-store, game-concept-emblems-and-cards, game-ui-scaffold-primitives, game-guide-session-and-card, game-navigation-map-and-links, game-brick-rank-blason, game-brick-meesh-coin, game-element-detail-sheet | La page Progression montre une carte par concept du jeu, avec rang et Meesh en tête, sans spinner |
| `game-progression-viewmodel` | E | P2 | M | 800 | game-write-repository, game-engagement-repository, game-optimistic-state, game-progression-catalog-laws, game-laws-day-missions-flame-chest, game-laws-mint-economy | L'écran Progression réagit tout de suite à chaque geste et se réconcilie avec le serveur |
| `game-referral-link-qr` | E | P2 | M | 1000 | game-network-api, game-brick-foundations, game-brick-flame-chest-trophy-gem, reseau-pipeline-reessai-erreurs | Ma carte partagée porte un bandeau « Rejoins-moi sur Meeshy » avec mon lien de parrainage en QR lisible, identique au web |
| `game-rules-book` | E | P2 | M | 1100 | game-ui-scaffold-primitives, game-mee-meo-figures, game-brick-level-ring, game-brick-rank-blason, game-brick-flame-chest-trophy-gem, game-brick-medal-badge, game-brick-meesh-coin, game-navigation-map-and-links, game-copy-helpers | Le carnet « Comment ça marche » explique toutes les règles du jeu avec les mêmes dessins que l'application |
| `game-season-and-archive-pages` | E | P2 | M | 1000 | game-pages-shell-and-format, game-wave2-gesture-model, game-visitor-schedule-archive-repositories, game-laws-season-archive, game-brick-flame-chest-trophy-gem, game-ui-scaffold-primitives, game-element-details-collectibles, game-copy-helpers | Je suis ma saison de huit semaines, je réclame mes étapes, et j'ouvre une saison ou une semaine passée par un lien |
| `game-settings-page` | E | P2 | M | 350 | game-pages-shell-and-format, game-wave2-gesture-model, game-cache-and-settings-store, game-ui-scaffold-primitives, settings-hub-iso-layout | Je règle ce que le jeu me montre et montre aux autres : célébrations, jeu masqué, notifications, qui voit quoi, ligues |
| `game-shader-effects` | E | P2 | M | 400 | game-brick-foundations | Les médailles et la pièce brillent : reflet qui passe, onde de frappe et irisation du prisme sur les appareils récents |
| `game-showcase-and-atlas-pages` | E | P2 | M | 900 | game-pages-shell-and-format, game-wave2-gesture-model, game-visitor-schedule-archive-repositories, game-laws-showcase-atlas-prestige, game-brick-flame-chest-trophy-gem, game-element-details-collectibles, game-ui-scaffold-primitives, game-copy-helpers | Je range mes trophées dans ma vitrine, j'allume ma constellation et je tamponne mon passeport des langues |
| `game-streak-reminders` | E | P2 | M | 350 | game-engagement-repository, game-engagement-progress-model, game-module-scaffold, game-cache-and-settings-store, socle-points-d-extension-de-l-app | Mes rappels de série sont replanifiés à chaque lecture pour ne pas perdre ma Flamme |
| `game-strings-seven-languages` | E | P2 | M | 300 | game-module-scaffold, generateur-chaines-ios, langues-interface-sept-et-automatique | Tous les mots du jeu existent dans les sept langues, mot pour mot comme sur iOS et le web |
| `game-ui-scaffold-primitives` | E | P2 | M | 1030 | game-module-scaffold, game-brick-foundations, game-copy-helpers | Toutes les pages du jeu partagent le même grand titre qui se réduit, les mêmes cartes teintées et les mêmes états vide, hors ligne et erreur |
| `game-visitor-schedule-archive-repositories` | E | P2 | M | 800 | game-network-api, game-cache-and-settings-store, game-laws-season-archive, game-laws-showcase-atlas-prestige, game-wave2-block-models | Le calendrier des saisons, les archives et le jeu d'un autre membre se lisent depuis le disque d'abord |
| `game-wave2-block-models` | E | P2 | M | 700 | game-block-models | Ligue, duo, saison, vitrine, atlas et Prestige se lisent un par un, sans qu'une extension illisible emporte les autres |
| `game-wave2-gesture-model` | E | P2 | M | 900 | game-write-repository, game-visitor-schedule-archive-repositories, game-cache-and-settings-store, game-laws-league-duo, game-laws-season-archive, game-laws-showcase-atlas-prestige | Consentir, inviter, réclamer, ranger, passer en Prestige ou masquer le jeu répond tout de suite et se rétablit proprement |
| `game-write-repository` | E | P2 | M | 700 | game-network-api, game-block-models | Chaque geste du Jeu part au serveur sans jamais s'appliquer deux fois |

## Features

### Ma Flamme grandit et vacille avec ma série, de la Braise au Soleil, sans consommer hors écran

`game-brick-flame` · Android : **absente** · P0 · effort S

FlameView : cinq formes (Braise 1 à 6 j petite sans Signature ; Flamme 7 à 29 j avec la Signature blanche au coeur ; Brasier 30 à 99 j pleine hauteur ; Astre 100 à 364 j avec halo d'or en pointillé ; Soleil 365 j et plus avec un second halo plus large), réduites autour du pied pour rester entières. Elle vacille (1,6 s aller-retour) tant qu'elle est visible et s'arrête quand l'utilisateur limite les animations ou que la vue quitte la zone visible (GameOnScreen). Une Flamme éteinte se montre désaturée (opacité 0,45).

Écarts :
- FlameView Compose avec cinq formes (échelle par forme), halos, Signature au coeur, vacillement infinite transition (1,6 s) arrêté hors écran ou en animations réduites.
- État éteint : désaturation + opacité 0,45 sans vacillement.
- Libellé a11y fourni par l'hôte (« Flamme 23 jours »).

Rendu : Flamme en dégradé orange/or, Signature blanche à partir de 7 jours, halo d'or en pointillé à 100 j, second halo à 365 j ; pas coupée en bas du cadre.

Transposition Android : withAnimation autoreverses -> rememberInfiniteTransition ; onScrollVisibilityChange -> visibilité via onGloballyPositioned.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/FlameView.swift`

</details>

### Toutes les pièces du jeu partagent les mêmes matières métalliques, la même Signature et la même accessibilité

`game-brick-foundations` · Android : **absente** · P0 · effort M

Socle de dessin : GameMaterial (8 matières : cuivre, bronze, argent, or, platine, obsidienne, prisme, flamme, avec encre gravée et dégradés transcrits stop pour stop de la planche), LevelTierPalette (couleur spectrale par palier, Galaxie en prisme), GamePalette (couleurs, dégradés, pièce), SignatureMark/GameSignature (les trois traits de la marque 500·400·300 dans 1 024, opacités 0,7·1·0,75 ; styles flat, struck [relief frappé], engraved [gravé]), GameSVGPath (lecteur de chemins SVG partagé), GameAccessibility (une brique est décorative et masquée, sauf libellé fourni par l'hôte qui en fait UN élément image), GameOnScreen (visible dès qu'un point de la frame rencontre la fenêtre, pour arrêter les boucles d'animation hors écran même dans un ScrollView non paresseux), GameTypeScale (échelle typographique).

Écarts :
- GameMaterial (enum + ink + Brush linéaire par matière), LevelTierPalette.color(tier) pour les 20 paliers, GamePalette (coin silver/gold/diamond, prism stops).
- SignatureMark Compose (flat / struck / engraved) avec les proportions fixes jamais déformées ; réutiliser le tracé de la marque existant (BrandLogo / SplashLogoGeometry).
- Parseur de chemins SVG : androidx.compose.ui.graphics.vector.PathParser pour tous les chemins du jeu (chest, medal, trophy, flame…).
- Modificateur gameAccessibility(label) : null = décoratif (clearAndSetSemantics), sinon un seul élément image.
- Détection de visibilité pour suspendre les animations en boucle (Flamme, éclats du prisme) hors écran, y compris dans une Column scrollable non paresseuse.
- Une palette indigo existe déjà (MeeshyPalette/MeeshyGradients) mais aucune matière de jeu.

Rendu : Dégradés exacts de la planche (conception § II.7) ; Signature = trois traits à bouts ronds alignés à gauche, longueurs 500/400/300 sur 1 024 ; frappée = relief ombre bas-droite + éclat haut-gauche ; gravée = creux plus sombre que la matière.

Transposition Android : GraphicsContext/Canvas -> DrawScope ; SVGPathData -> PathParser ; accessibilityHidden -> clearAndSetSemantics ; Metal inutile ici.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameMaterial.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/SignatureMark.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameSVGPath.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameAccessibility.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameOnScreen.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPalette.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`

### Mon niveau est un anneau qui se remplit, avec l'emblème de mon palier en filigrane et son chiffre romain

`game-brick-level-ring` · Android : **absente** · P0 · effort M

LevelRingView : anneau dont l'arc (Circle.trim animable) se remplit avec la barre du niveau, de la couleur du PALIER (change tous les dix niveaux ; Galaxie en prisme). Disque central de bas en haut : l'EMBLÈME du palier en filigrane transparent, le niveau en chiffres arabes au premier plan (taille adaptée au nombre de chiffres, contour détouré), le PALIER en chiffres romains I à X dans un cartouche au contour détouré sous le niveau ; repère de RECORD (un cran sur l'anneau que la barre ne dépasse pas après redescente) ; jusqu'à cinq étoiles de PRESTIGE sous l'anneau ; chiffre qui roule. GameTierEmblem définit les vingt emblèmes de palier (Étincelle -> Galaxie pour 1 à 100, puis Nébuleuse -> Singularité) comme primitives (disque, anneau, trait, SVG, étoile, rayons, éventail, constellation) dans une boîte de 100 avec Signature de 30 au coeur, plein ou ouvert ; miroir de tier-emblem.ts. La brique n'anime rien d'elle-même.

Écarts :
- LevelRing Compose (Canvas) : piste, arc animé, repère de record, étoiles de prestige, disque central avec emblème filigrane, niveau contouré, cartouche romain.
- GameTierEmblem.design(tier) pour les 20 paliers (primitives paramétrées, constellation, étoiles polaires) et garde de parité coordonnées avec tier-emblem.ts.
- levelTypeSize(forLevel:) pour adapter la taille du chiffre ; libellé a11y « niveau N, palier » fourni par l'hôte.
- Animation pilotée par l'hôte (remplissage 0,6 s, vidage 0,8 s) ; aucune animation propre.

Rendu : Arc teinte du palier sur piste textMuted ~light ; disque central avec filigrane d'emblème, niveau en gros chiffres, cartouche romain contouré dessous ; étoiles de prestige jusqu'à 5 ; hauteur augmentée de 66/56 quand prestige > 0.

Transposition Android : Circle.trim animable -> Canvas drawArc avec animateFloatAsState ; contentTransition numericText -> AnimatedContent.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/LevelRingView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameTierEmblem.swift`

</details>

### Chaque concept est reconnaissable à son emblème dessiné et à sa carte tactile

`game-concept-cards-front` · Android : **absente** · P0 · effort M

ProgressionConceptEmblem dessine l'emblème de chaque concept avec les briques du jeu (anneau de palier pour la Lumière, jeton Étincelles, pièce Meesh, blason pour le Rang, Flamme, coffre/missions, gemme de ligue, coupe de saison, prestige, élans, médaille, défis, succès, trophées, tampon d'Atlas) et à défaut par la Signature Meeshy, jamais par une bulle. ProgressionConceptCardView compose la carte entière (emblème + nom/valeur/ligne + chevron) en un bouton qui rebondit. GameValueRoll fait rouler la valeur au changement. GameStaggeredEntrance gère l'entrée décalée. ProgressionConceptRow est la ligne simple (carnet, règles, réglages, sous-pages). ProgressionConceptFacts liste les paires libellé -> valeur, chacune touchable pour ses précisions. ProgressionConceptSectionTitle et ProgressionGuideLine complètent. Un seul élément pour TalkBack, l'emblème est décoratif sauf quand il porte un fait (l'anneau dit le niveau).

Écarts :
- ConceptEmblem(concept, game, size) composant les briques de dessin Android (anneau, blason, pièce, flamme, gemme, coupe, tampon, Signature).
- ConceptCard avec rebond, valeur qui roule, ligne urgente avec point d'attention, label a11y composé (cardA11y) et indice « ouvre la fiche ».
- Modificateur d'entrée décalée et ligne simple 44 dp ; faits cliquables ouvrant la feuille de précisions.
- Respect d'animations réduites (valeur sans roulement, carte simplement là).

Rendu : Emblème 40 dp à gauche avec Signature, carte rayon md sur backgroundSecondary, min 44 dp ; valeur title3 bold arrondie qui roule ; point d'attention warning 8 dp ; chevron brandPrimary.

Transposition Android : GameBounceButton -> clickable avec échelle ressort ; accessibilityElement(.ignore)+label -> semantics(mergeDescendants) + contentDescription.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptViews.swift`

</details>

### Chaque concept a sa fiche : C'est quoi, où j'en suis, comment en gagner, à toi de jouer, aller plus loin

`game-concept-fiche-page` · Android : **absente** · P0 · effort M

ProgressionConceptPage est le deuxième niveau du jeu, un gabarit unique pour les 15 concepts : (1) la tête — emblème en grand, valeur, une ligne, jauge ; ou Ta lumière (Étincelles) ; ou la pièce de jeu du concept à sa place (anneau, Héritage et frappe, détail de la joute, Élans) — jamais les deux ; (2) « C'est quoi ? » (what, puis why et how) ; (3) « Où j'en suis » seulement avec ce que la tête ne dit pas ; (4) « Comment en gagner » (deux conseils) puis « Comment m'en servir » ; (5) « À toi de jouer » — les GESTES du concept (frapper, ouvrir le coffre, changer une mission, protéger ou rallumer la Flamme, détail de joute) ; (6) « Aller plus loin » — sous-pages (classement, parcours de saison, Prestige, vitrine, Atlas, Badges/Défis/Succès, règle visée). La page est AUTONOME dans la pile (elle lit sa propre progression, cache d'abord) ; une entrée extérieure peut demander une section (act / more) où la fiche se pose une seule fois, sous la barre compacte. Elle porte aussi la présentation plein écran de la célébration d'un palier et du déroulé photo. GameElementTile expose les éléments touchables de la fiche.

Écarts :
- ConceptScreen(concept, section) générique, avec ConceptHero (ou pièce de jeu), sections nommées et titres de section localisés.
- ConceptGestures : exist(for:) et isHero(for:) pour décider quels gestes vivent dans la fiche ; intégration des vues missions/coffre, Flamme, frappe, ligue, badges (autres features).
- Section demandée par une entrée extérieure : scroll une seule fois sous la barre compacte, sans reprendre le regard à chaque relecture.
- Instance de ViewModel autonome qui se peint avec la dernière lecture connue, relecture silencieuse.
- Plein écran pour la célébration de palier et pour le déroulé photo ; feuille pour le guide complet.

Rendu : Tête en haut puis sections à titre de section (ProgressionConceptSectionTitle), phrases en bodySize, cartes teintées par la couleur du concept, bouton « Voir la fiche » en ligne avec chevron.

Transposition Android : fullScreenCover(item:) -> destination plein écran ; sheet(item:) -> ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptPage.swift`

</details>

### Chaque concept dit la même chose partout : un nom, une valeur, une ligne, et jamais deux fois le même fait

`game-concept-model-law` · Android : **absente** · P0 · effort L

ProgressionConceptModel est la loi pure qui lit progression + bloc game servis (aucun calcul de niveau, rang ou prix, tout nombre vient du serveur) et produit : la carte de la première page (trois étages : nom, valeur, UNE ligne ; la ligne « urgente » prend la place — Offrande prête, acte qui expire, Flamme en danger, frappe possible, Renaissance possible), les têtes de fiche par concept (niveau, points, Meesh, gloire, flamme, missions, ligue, saison, prestige, élans, badges, défis, succès, trophées, atlas), la jauge vers l'étape suivante, les liens de sous-pages, la phrase d'état et les points convertibles. ProgressionConceptFiche décide de la tête (générique, Étincelles, ou la pièce de jeu du concept) et de « Où j'en suis », qui ne redit rien. ProgressionFactID donne une IDENTITÉ à chaque fait (≈60 : level, sparks_pocket, meesh_held, mint_price…) : un fait ne paraît qu'UNE fois par écran, le dédoublonnage compare des identités, jamais des chaînes ; GameFactsTag (PreferenceKey) permet aux témoins de détecter un doublon. ProgressionConceptCopy porte ≈190 clés game.concept.<clé>.name\|why\|how\|tip.1\|tip.2, les pastilles, états, et tous les « il manque » qui nomment leur cible (le niveau, la Meesh, le rang, la zone). Miroir de progression-concepts.ts et progression-state.ts.

Écarts :
- Port de conceptView / ficheView : ProgressionConceptCard, ProgressionConceptFact, ProgressionConceptLink, ConceptHeadParts et les 15 têtes de concept dans :core:model (pur, testable JVM).
- ProgressionFactID et dédoublonnage par identité (gesturesShow, Shown, rows) ; outil de témoin équivalent à GameFactsTag pour tests Compose.
- Phrases d'état (stateLine) : niveau avec/sans progression, points prêts/manquants, Meesh gardées, avec formatage par locale et pluriels.
- Jauge par concept (gauge) et liens de sous-pages (links) identiques à iOS ; mapping ancre -> concept et emblème photo -> concept.
- ≈190 clés game.concept.* et game.fiche.* dans strings.xml (7 langues) avec les noms de concept (La Lumière, Étincelles, L'Héritage, Le Rang, La Flamme, Le Rêve, La Joute, Le Voyage, La Renaissance…).
- Tests de parité avec progression-concepts.ts : mêmes cartes pour les mêmes entrées.

Rendu : Pas de rendu : la loi décide de la hiérarchie (nom en petit, valeur en grand, une ligne en petit ; ligne urgente prioritaire).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptModel.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptFiche.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionFactIdentity.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptCopy.swift`

</details>

### Les concepts de Progression s'affichent dans le même ordre et les mêmes conditions sur web, iOS et Android

`game-concepts-order` · Android : **absente** · P0 · effort S

ProgressionConcept liste les 15 concepts dans l'ordre d'écran : level, points, meesh, glory, flame, missions, league, season, prestige, elans, badges, defis, succes, showcase, atlas. ProgressionConceptSource ne lit que la PRÉSENCE des morceaux servis (solde meesh, sections de défis, bloc game, ligue, saison, prestige, trophées, atlas) ; une extension sans le bloc game qui la porte est ignorée, et la saison est lue comme servie dès qu'une autre extension de la vague 2 l'est (le décodage ne distingue pas absente et nulle). ProgressionConcepts.served filtre : level, flame, elans, badges, succes toujours ; meesh si solde ou bloc game ; defis si la carte d'atteignabilité a une section ; points, glory, missions si bloc game ; les autres selon leur extension. Devant un ancien serveur l'écran se raccourcit, il n'affiche jamais « 0 / 0 ». ProgressionLayout.blocks compose le hub historique : dernier succès, niveau, meesh (si servi), élans, flamme, puis les portes Badges / Défis (si des défis existent) / Succès. Miroir de packages/shared/utils/progression-layout.ts.

Écarts :
- Enum ProgressionConcept (15 cas, ordre = ordre d'écran) et ProgressionConceptSource dans :core:model.
- Fonction served(progress, game) avec les règles de présence, dont la lecture « saison servie même nulle ».
- ProgressionBlock / ProgressionSection / blocks(progress) pour le hub de repli sans bloc game.
- Test de parité Kotlin contre la liste PROGRESSION_CONCEPTS du partagé (la loi à miroirs se lit de nouveau « les trois »).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ProgressionConcepts.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ProgressionLayout.swift`

</details>

### Tous les mots du jeu existent dans les sept langues, avec les accords, pluriels et nombres de la langue

`game-copy-i18n` · Android : **absente** · P0 · effort M

GameCopy est le catalogue des noms, accords et phrases de refus du jeu (miroir de game-copy.ts) : accord qui sait que le français et le portugais lisent zéro au singulier (isSingular), nombres formatés par la locale AVANT d'entrer dans la phrase (un seul %@ par trou), compactCount (« 8,7 k » dès 10 000), noms des paliers et ordinaux, des matières, des rangs/divisions/places mythiques, des contenants du trésor, des formes de Flamme, des éditions de Meesh, des difficultés, ≈100 gabarits de titre de mission (templateKey + cible), messages d'erreur par GameErrorCode (31 clés game.error.*), durées calmes, fins de mission, plages horaires. Le jeu pèse 1 432 clés (game.concept 189, game.guide 106, game.detail 97, game.mission 66, game.photo 56, game.rules 54, game2.league 50, game.atlas 42, progression.axis 40, game.tier 40…) toutes en ar, de, en, es, fr, it, pt-BR. Les accesseurs sont des clés littérales que la garde du catalogue sait lire.

Écarts :
- GameCopy.kt (isSingular fr/pt, formatCount, compactCount, points, meeshes, days, tierName/ordinal, materialName, rankLabel, treasuryName, flameFormName, editionName, missionTitle, errorMessage(GameErrorCode), missionEnding/timerLine/windowRange/clock) avec Locale.
- ≈1 432 clés dans strings.xml (préfixes game., game2., progression., achievement., reveal., profile.progression) : Android n'a que en/es/fr/pt ; il faut ajouter it, de et ar (RTL) et migrer pt vers pt-BR.
- Pluriels : ressources quantity avec les six formes de l'arabe ; chiffres localisés.
- Garde de parité clé par clé avec le catalogue iOS/web (même mécanisme que ios-catalog-parity) pour que toute phrase soit identique sur les trois plateformes.
- RTL complet : bandeau et ordre des pièces retournés en arabe.

Transposition Android : String(localized:) + xcstrings -> strings.xml + plurals ; Locale.current -> LocalConfiguration/Locale.getDefault ; formatted(.number) -> NumberFormat.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProgressionCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionConceptCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameDetailCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameFicheCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameSparksCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameMintCostCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/PlayerBannerCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/AchievementCopy.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/res/values/strings.xml`

### Le héro du jeu montre où j'en suis (niveau, rang, Étincelles) et comment gagner, avec un anneau qui se remplit

`game-hero-level-rank` · Android : **absente** · P0 · effort M

GameHeroView est la carte pleine largeur du niveau et du rang : fond teinté par la couleur du palier (12 % + filet 28 %) avec la Signature en grand filigrane à droite ; la ligne courte de Mee en coin (un toucher ouvre le guide complet) ; la rangée niveau (anneau, niveau en grand, étapes de niveau) ; les deux PAIRES d'Étincelles TOUJOURS montrées (Ta lumière / reçues depuis toujours ; niveau actuel / ta plus haute lumière, qui survit à la Renaissance) ; la rangée rang (blason + division) ; « Comment gagner » : une puce par famille d'actions dérivée du barème EngagementCatalog.familyTopPoints, triée par poids décroissant (à égalité, l'ordre du catalogue), avec pictogramme et points, et si la famille est active ces jours-ci d'après l'élan. Animation : l'anneau se remplit et le chiffre roule (0,6 s), il se vide calmement à la frappe (0,8 s), la tape légère ne couronne qu'une montée CONFIRMÉE, l'écu monte quand la marche est GAGNÉE ; rien ne se joue au premier rendu. GameSparkPairs/GameSparksCopy fournissent les paires et leurs phrases (« 4 200 cet Âge · 12 000 en tout »).

Écarts :
- Composable GameHero avec fond teinté palier + Signature filigrane + anneau + rangée niveau/rang + GameSparkPairsRow + GameHeroEarn.
- GameHero.earnItems(weights) trié par poids décroissant, ordre du catalogue à égalité ; poids lus dans un EngagementCatalog Kotlin miroir.
- GameSparkPairs (pocket, cycle, lifetime, level, levelMax) et phrases cumulLine / cumulValue / levelRecordLine / levelMaxAccessibility.
- Animations et haptiques : remplissage anneau 0,6 s + roulement du chiffre, vidage 0,8 s à la frappe, pas de tape sauf montée confirmée (GameLevelConfirmation), joue l'écu seulement sur marche gagnée (standingOrder).
- Aucune animation au premier rendu ; animations réduites = valeur posée.
- Ligne de niveau (GameLevelStepRow) : étapes de 10 à 100 avec but, progression et état.

Rendu : Rayon lg continu, fond backgroundSecondary + teinte palier 12 % + filet 28 % ; Signature 240 dp à 7 % d'opacité décalée (x +70, y -60) ; puce famille : pictogramme + points, couleur d'émail de la médaille de la famille (contenu indigo, lien rose, conversation violet, commentaire sarcelle, outil ambre) ; padding lg, espacement lg.

Transposition Android : GameHaptics.shared -> HapticFeedback/Vibrator avec motifs ; contentTransition numericText -> AnimatedContent ; adaptiveOnChange -> LaunchedEffect(key).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameHeroView.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameHeroModel.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameHeroParts.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameSparkPairs.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameSparksCopy.swift`

</details>

### Le rang de Gloire, ses divisions et les cent places du Mythe se lisent comme sur iOS

`game-law-glory-mythe` · Android : **absente** · P0 · effort M

Dix rangs gagnés par la Gloire (Murmure 0, Écho 2 000, Voix, Conteur, Passeur, Polyglotte, Ambassadeur, Orateur, Oracle, Légende 600 000) chacun coupé en cinq divisions V à I (début + ⌊étendue x k / 5⌋), Légende I au-delà jusqu'au seuil du Mythe (1 000 000). Le Mythe a cent places attribuées par la passerelle dans l'ordre d'arrivée, chacune avec une émission ; le client ne calcule jamais l'attribution, il DESSINE la Signature unique de l'émission (lignes, perles, halo, gemme sur un repère 1 024). Gloire en registre à ajout seul, ne baisse jamais ; points de gloire par événement (succès par rareté, saison, Prestige).

Écarts :
- Porter GloryRank (11 cas), GloryDivision / GloryDivision5, GloryStanding, GloryStep, MythicSeatRef, table `points` (succès, saison, Prestige) et `levelCap(forRank:)`
- Porter GameMythe : MythicArrival, MythicSeatGrant et le générateur déterministe MythicSignatureDesign (lignes, perles, halo, gemme) — mêmes nombres que mythic-signature.ts
- Tests sur game.vectors.json (glory, mythe) et mythic-signature

Rendu : Le rang se lit en toutes lettres (« Murmure V ») ; la matière de l'écu (cuivre, bronze, argent, or, platine, obsidienne, prisme) est dérivée du rang.

Transposition Android : Lois pures Kotlin dans :core:model ; la Signature est une donnée (liste de segments/perles) rendue ensuite par un Canvas Compose.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGlory.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameMythe.swift`

</details>

### Le niveau, le palier et l'étape de niveau se calculent à l'identique du serveur et d'iOS

`game-law-levels` · Android : **absente** · P0 · effort M

Lois pures miroirs de levels.ts et level-steps.ts : 20 paliers de niveau (Étincelle, Lueur, Lumière, Éclat, Rayon, Aurore, Comète, Étoile, Constellation, Galaxie, Nébuleuse, Pulsar, Quasar, Supernova, Magnétar, Amas, Superamas, Cosmos, Infini, Singularité), seuil(N) = 100 x N², plafond de niveau ouvert par le rang de Gloire (499 sous Ambassadeur, 1000 Ambassadeur/Orateur, illimité dès Oracle), niveau 100 = seuil du Prestige. Une ÉTAPE tous les dix niveaux (10 à 100) sur des faits qui ne se défont jamais (Meeshes frappées à vie, missions du jour accomplies à vie, record de Flamme, rang de Gloire) : le niveau attend au palier précédent (9, 19… 99) tant que l'étape n'est pas faite. Niveau servi = min(points, plafond du rang, palier des étapes).

Écarts :
- Porter GameLevels (LevelTierKey 20 entrées, progress(forScore:cap:), level(forScore:cap:), GameNewLevels) et GameLevelSteps (LevelStepKind, règles, faits cumulés, étape ouverte) dans :core:model
- Fonction levelCap(forRank) partagée avec la loi de gloire
- Tests sur game.vectors.json (lois levels et level-steps) ; aucune horloge ni aléa implicite

Rendu : Aucun rendu direct ; alimente l'anneau de niveau (LevelRingView : emblème du palier, chiffre romain, étoiles de Prestige) et les barres de progression.

Transposition Android : enum/struct Swift -> enum class / data class Kotlin purs dans :core:model (sans dépendance Android) ; testables JVM.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameLevels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameLevelSteps.swift`

</details>

### Le solde de Meesh est toujours sous le doigt en haut à droite et ouvre la fiche pour en frapper une

`game-meesh-counter-entry` · Android : **absente** · P0 · effort S

ProgressionMeeshEntry : le solde (headline bold arrondi, chiffres à chasse fixe, teinte ambre) suivi de la pièce d'argent (glyphe vectoriel Phosphor coin-fill, teinté meeshSilver, identique au web) dans UNE seule pièce de verre à rayon smPlus, à la hauteur des chromes ronds de l'en-tête. Il rebondit au toucher, le chiffre « roule » quand le solde change (animation 0,35 s), et le toucher ouvre la FICHE des Meesh, seul site de la frappe. ProgressionMeeshDetail (aussi utilisé dans la fiche) montre l'en-tête pièce + « Meesh », la scène de frappe de Mee et Meo, le solde, le total frappé depuis toujours, première et dernière frappe, une barre vers la prochaine Meesh, le bouton « Frapper » (état « Frappe en cours… » avec indicateur, erreur inline avec triangle d'alerte) ou la phrase de ce qui manque. GameMintStrike porte numéro, édition, compteur de rejeu et état « reste sur son revers ».

Écarts :
- Composable MeeshCounterEntry : capsule verre (MeeshyGlassSurface) + solde + glyphe de pièce ; cible 44 dp ; libellé a11y « N Meesh » et indice « ouvre la fiche ».
- Roulement du chiffre au changement de solde (AnimatedContent par chiffre ou animateInt) ; figé si animations réduites.
- Rebond au toucher (échelle ressort) identique à tous les éléments tactiles du jeu.
- Détail Meesh : bornes datées localisées, barre de progression, bouton Frapper avec états, erreur inline, scène de frappe.
- Glyphe MeeshCoin en vecteur Android (VectorDrawable ou ImageVector) teinté meeshSilver.

Rendu : Pièce de verre unique teintée ambre 14 % (pas deux bulles séparées), padding horizontal md, hauteur min = diamètre des chromes ronds (puis 44 dp tactile), interactive ; solde headline bold arrondi monospace ; pièce 20 dp à droite du chiffre.

Transposition Android : adaptiveGlass -> MeeshyGlassSurface (existant) ; contentTransition numericText -> AnimatedContent ; GameBounceButtonStyle -> Modifier.clickable + animateFloatAsState ressort.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift`

</details>

### Je frappe une Meesh avec Mee et Meo : le prix est dit une fois, la pièce se retourne sur son revers numéroté

`game-mint-frame` · Android : **absente** · P0 · effort M

GameMintPreviewView est LA section de frappe, dans la fiche de l'Héritage : (1) la scène sur toute la largeur (Mee, l'enclume, le flan, Meo et son marteau), (2) « La Meesh n° 92 », (3) UNE phrase où le prix paraît une seule fois (« Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. »), (4) le bouton « Frapper avec Mee et Meo » avec « +1 000 de gloire » en petit dedans, (5) une phrase de Mee. Quand la frappe est impossible, AUCUN bouton grisé : ce qu'il manque ou ce qui la ferme (l'Ombre = dette d'étincelles, la réserve du trésor, un rang). La frappe confirmée retourne la pièce sur son revers. GameMintSequence est la machine à états : l'écran montre l'image d'avant le toucher pendant les 1,2 s de la scène (le compteur ne s'incrémente qu'après), tandis que la mise à jour reste optimiste. GameMintCostCopy dit le prix effectif, la ligne « Pièce entière 1 221 · 54,5 % au niveau 9 », le passage de niveau (« Ton niveau passera de 9 à 8 »), le bloqueur et l'échec.

Écarts :
- MintFrame composable avec modèle GameMintFrameModel (blocker, mee, mintedLine) ; bouton Frapper seulement si possible, sinon phrase de manque / de blocage.
- GameMintSequence<Held> (begin/finish/duration 1,2 s, reduceMotion plus court) pour retenir l'image d'avant jusqu'à la fin de la scène.
- Cérémonie : retour de la pièce sur le revers après règlement serveur (GameMintSettlement), onCeremonyEnded pour que la tête de l'Héritage rattrape le compte.
- Scène MintStrikeScene (Mee, enclume, flan, Meo, marteau) et haptique strike — composant d'une autre partie du domaine.
- Textes : coût effectif, ligne de prix de base × facteur de niveau, passage de niveau, bloqueurs (dette, réserve trop haute pour le rang), messages d'échec par code.
- Un fait ne paraît qu'une fois par écran (identités de fait sur chaque chiffre).

Rendu : Scène pleine largeur au-dessus, phrases centrées (une idée par phrase), bouton plein largeur capsule avec sous-texte de gloire, phrase de Mee en dessous ; aucun bouton grisé quand impossible.

Transposition Android : HapticFeedback pattern strike -> VibrationEffect composite ; contenu animé -> Compose animation (animations réduites = fondu).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameMintPreviewView.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameMintSequence.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameMintCostCopy.swift`

</details>

### Je vois mes trois missions du jour avec leur minuteur, je peux en changer une, et j'ouvre le coffre quand tout est fait

`game-missions-chest` · Android : **absente** · P0 · effort M

GameMissionsView (« Le rêve de cette nuit ») : trois missions du jour avec avancement, plus une mission personnelle à plage de deux heures, un changement par jour pour 1 Meesh, et le coffre. Verrouillé tant que le niveau requis n'est pas atteint (note + puce d'exigence). Notes « Jour du Prisme » (un acte dans une autre langue) et « Heure du Prisme » (plage où chaque acte compte double). Chaque carte : puces (Personnelle, difficulté, Prisme, fin de fenêtre / Réalisé), titre, barre de progression, ligne « x / y · +N étincelles · +G de gloire », bouton « Changer » (désactivé hors ligne, en attente ou faute de Meesh), bouton photo (mission personnelle accomplie), minuteur rafraîchi par TimelineView selon le temps restant dans le fuseau du COMPTE ; toucher la mission ouvre ses précisions. La rangée de dépense dit les Meesh en poche, le prix et ce qui restera (ou ce qui manque). Le coffre garde son contenu SECRET fermé ; phases locked / ready / opening / claimed ; à l'ouverture il est déjà ouvert (retour instantané) et les récompenses se posent AU-DESSUS de lui (1,4 s, une tape par récompense). Notes « Hors ligne ».

Écarts :
- MissionsCard : états verrouillé / jour du Prisme / heure du Prisme / hors ligne, 3 missions + personnelle, rangée de dépense (GameSpend.preview), erreurs par geste.
- GameMissionClock (phase, refreshInterval, endOfDay dans le fuseau du compte) et minuteur périodique sans fuite (LaunchedEffect).
- Bouton Changer (reroll) avec conditions (en ligne, pas en attente, abordable, fenêtre ouverte) ; bouton photo pour la mission personnelle accomplie.
- ChestCard : quatre phases, ouverture instantanée, contenu secret fermé, récompenses au-dessus (ChestStage 1,4 s), haptique chest(rewards:n).
- Titres de mission localisés par templateKey + cible (≈100 gabarits dans GameCopy.missionTitle).
- Précisions d'une mission / du coffre au toucher (feuille).

Rendu : Carte mission : fond textMuted 10 %, rayon sm, padding md ; puces en FlowLayout (difficulté or = warning, sinon brandPrimary ; fin = success/warning) ; barre verte si fait, brandPrimary sinon ; bouton Changer capsule brandPrimary 12 %, 44 dp de haut ; icône minuteur + texte small semibold muted ; opacité 0,6 en attente.

Transposition Android : TimelineView(.periodic) -> LaunchedEffect + delay ; photo -> ouverture du déroulé photo (feature suivante du domaine).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameMissionsView.swift`

</details>

### Les notifications et liens du jeu ouvrent toujours la bonne fiche, jamais une page orpheline

`game-navigation-links` · Android : **absente** · P0 · effort M

GameNavigationMap est une table pure de la navigation à trois niveaux : Progression (concepts) -> fiche d'un concept (aussi Carnet, Comment ça marche, Réglages) -> sous-page (classement, parcours de saison, Prestige, vitrine, Atlas, pages Badges/Défis/Succès, règle visée). Chaque route a UN parent et le retour ramène toujours au niveau d'au-dessus ; une entrée EXTÉRIEURE (notification de mission, de ligue, de saison, bandeau du joueur) ouvre la fiche de son concept à sa section (act = « À toi de jouer », more = « Aller plus loin »), posée au-dessus de la première page. entry(for: MeeshyNotificationType) mappe les types game_*. GameLink/GameLinkParser lisent https://meeshy.me/me/progression/saison/{n} et .../ligue/{lundi} (et meeshy://me/progression/...) ; la forme nue ou un paramètre invalide ouvre la saison/semaine EN COURS ; GamePageFocus porte la saison ou la semaine visée. GameGuideTarget rend, pour chaque action du guide, un lien profond exhaustif (défiler à une ancre de Progression, quitter vers les conversations, ouvrir la porte des badges, ouvrir le déroulé photo) ; GameAnchor liste les ancres (level, missions, flame, treasury, rank, mint, flamePanel).

Écarts :
- Routes du nav graph pour Progression, fiche de concept (concept, section), sous-pages et table parent/niveau pure et testable (GameNavigationMap.level/parent/chain).
- Ajouter à NotificationDestinationResolver les types level_up, badge_earned, achievement_unlocked, streak_milestone, game_duo_invited, game_duo_accepted, game_league_result, game_season_step, game_mission_window (aujourd'hui seuls trois types de gamification existent côté Android et aucun n'a de destination).
- Liens profonds https/meeshy:// pour /me/progression/saison/{n} et /ligue/{lundi} (intent-filters App Links + parseur avec gardes de paramètre, saison max 9999, clé de semaine = lundi).
- Cible du guide : GuideTarget exhaustif (scroll vers ancre, conversations, badges, photo) et GameAnchor.
- Entrée extérieure posée AU-DESSUS de la première page, jamais une sous-page orpheline dont le retour sortirait du jeu.

Transposition Android : Route enum + NavigationStack -> NavHost destinations + deep links ; universal links -> Android App Links ; NotificationContentRouter -> NotificationDestinationResolver.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameNavigationMap.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameLink.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideTarget.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`

### Chaque geste du Jeu change l'écran à l'instant (niveau, rang, trésor, prix suivant) et revient en arrière s'il est refusé

`game-optimistic-state` · Android : **absente** · P0 · effort M

GameOptimistic transforme le couple (bloc game, solde meesh) de façon pure : afterMint, afterFreeze, afterReroll, afterChestOpening, afterRelight, plus les versions « réponse serveur » withRerolled, withChestReward, withRelit, withGuideSeen. Elles recalculent niveau, rang, trésor et prix suivant par la MÊME loi que la passerelle (level-wire.ts), gardent game.treasury.held et meesh.balance synchrones, ne devinent jamais ce que seul le serveur connaît (mission tirée, contenu du coffre, série rallumée) et rendent la MÊME valeur quand le geste est impossible (le témoin d'égalité prouve qu'il n'y a rien à restaurer). GameBlock.*.replacing(...) reconstruit des copies de valeurs immuables avec initialiseur exhaustif (un champ ajouté fait échouer la compilation). GameReadOrder (Ticket / Confirmed / isCurrent) ordonne les lectures. GameLevelConfirmation décide qu'une montée est « gagnée » : on compare au dernier niveau confirmé, une fois les gestes réglés, pour ne pas fêter un niveau restauré après refus.

Écarts :
- Porter les lois de niveau, rang, trésor et aperçu de frappe de MeeshySDK/Game (autre partie du domaine) puis GameOptimistic.* en fonctions pures sur data class immuables (copy() remplace replacing).
- Compteurs de frappe (withMintCounters), prochaine pièce (nextPreview), décalage de solde synchrone game.treasury.held / meesh.balance.
- GameReadOrder (tickets, Confirmed.raised, isCurrent) et GameLevelConfirmation.observe(level, settled).
- Garde de parité avec level-wire.ts / mintOnTheWire : aucune valeur inventée côté client, absente jusqu'à la réponse.
- Tests de comportement : geste impossible = même instance ; refus = état identique à l'instantané.

Transposition Android : struct immuable + replacing -> data class + copy ; Equatable -> equals structurel.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameOptimistic.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameBlock+Replacing.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameLevelConfirmation.swift`

</details>

### Chaque page du jeu s'ouvre dans la pile de navigation avec un grand titre qui se réduit au défilement, l'état hors ligne dit et le cache d'abord

`game-pages-shell` · Android : **absente** · P0 · effort M

Six pages poussées dans la pile (jamais en feuille) depuis Progression, le profil ou un guide : Ligue, Saison, Vitrine, Atlas, Prestige, Réglages (enum GamePage, noms d'analytics `Game.League`…). GamePageShell = en-tête dynamique commun (grand titre -> barre compacte au défilement). GameWave2Host lit la progression cache-first (cache d'abord, réseau en silence), affiche un bandeau « hors ligne » si besoin, un bandeau d'erreur avec relance, un squelette SEULEMENT sur cache vide, et « cette partie du jeu n'est pas disponible » devant un serveur qui ne sert pas le bloc `game`. Briques communes : choix « qui voit » (GameVisibilityPickerView : trois pastilles Tout le monde / Amis / Moi seul, suspendu pendant l'enregistrement mais pas désactivé pour garder le focus lecteur d'écran, empilées au-delà du texte XL), GameProgressBar (le texte voisin dit l'info), GameOfflineNote, GameQuietButton (44 pt, destructif en rouge), GameSwitchRow, aiguilleur GamePageView.

Écarts :
- Routes de navigation game/{page}?focus=… dans :core:navigation (six destinations) et points d'entrée depuis Progression, profil et cartes du guide
- Scaffold de page avec en-tête collapsible (réutiliser CollapsibleHeader de sdk-ui/chrome) et titre grand -> compact
- Hôte cache-first : lecture progression (ViewModel partagé), ProgressionNotice offline/erreur avec relance, squelette (MeeshySkeletonBox) sur cache vide, état « non disponible »
- Composables GameVisibilityPicker (pills 44 dp, sélection via semantics selected, bascule colonne si fontScale > XL), GameProgressBar, GameOfflineNote, GameQuietButton, GameSwitchRow (>= 44 dp)
- Événements analytics par page (`Game.<Page>`)
- Gérer le retour système (back gesture) et la restauration de focus

Rendu : Cartes (GameCard) avec spacing xl entre blocs, titre bodySize bold en heading, notes footnote en couleur atténuée ; cibles >= 44 dp (>= 48 dp côté toucher Android) ; pills pleines teintées brandPrimary 12-16 % + liseré quand sélectionnées.

Transposition Android : NavigationStack + Route.gamePage -> NavHost destinations dans :core:navigation ; GamePageScaffold -> CollapsibleHeader/MeeshyTopBar ; Toggle -> Switch Material ; accessibilityIdentifier -> Modifier.testTag.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GamePage.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2Parts.swift`

</details>

### La page Progression montre une carte par concept du jeu, avec rang et Meesh en tête, sans spinner

`game-progression-home` · Android : **absente** · P0 · effort M

Première page du jeu : en-tête qui se réduit (titre au repos, barre compacte au défilement) avec à droite UN groupe (blason de rang de Gloire + compteur de Meesh, chacun rebondit au toucher et ouvre ses précisions / la fiche des Meesh) ; au-dessus la ligne courte de Mee (guide du moment, un toucher ouvre la version complète en feuille) ; la liste d'une carte par concept servi (15 au plus) qui entrent en scène une seule fois, l'une après l'autre ; en dessous trois lignes : Carnet (La Chronique), Comment ça marche, Réglages du jeu. Aucun geste du jeu dans la liste : frapper, ouvrir le coffre, changer une mission, geler/rallumer se font dans la fiche du concept. Une fiche est POUSSÉE dans la pile (retour, historique, glissement depuis le bord), jamais présentée. « Jeu masqué » (commodité par appareil) remplace la liste par une carte masquée et retire l'en-tête du jeu. Pull-to-refresh, squelette uniquement à froid, hors ligne l'instantané reste avec son avis. Rien du blason ni du compteur sans donnée servie (pas de 0 Meesh pour un compte non calculé).

Écarts :
- Écran ProgressionScreen (:feature:game) : LazyColumn de cartes de concepts + ligne de Mee + trois lignes Carnet / Règles / Réglages, sur la base du scaffold de page du jeu.
- Groupe d'en-tête à droite du titre : blason de rang 30 pt (cible tactile 44 pt, libellé a11y du rang) et compteur de Meesh ; masqués sans donnée servie.
- Entrée en scène unique des cartes (état conservé tant que la page vit, rien ne rejoue au retour d'une fiche) ; désactivée avec animations réduites.
- Mode « Jeu masqué » et « Célébrations » : deux préférences d'appareil (DataStore) + lecture de GET /me/game/privacy ; aucune requête quand le compte masque le jeu.
- États : squelette froid, hors ligne avec/sans instantané, erreur + Réessayer, vide dessiné (« ta première médaille s'allume dès le premier geste »).
- Route de navigation poussée par fiche (pas de dialog), retour système prédictif.
- Entrée depuis le profil (rangée Progression) et depuis les notifications de jeu.

Rendu : Carte : fond backgroundSecondary, rayon md, padding horizontal lg / vertical md, hauteur min 44 ; nom en petit (footnote semibold, majuscules, muted), valeur en grand (title3 bold arrondie, 1 ligne, réduction jusqu'à 0,6), ligne en petit (subhead semibold) ; chevron brandPrimary à droite ; point d'attention 8 dp warning quand la ligne est urgente. Entrée : décalage 0,04 s par carte plafonné à 0,4 s, montée de 14 dp et opacité 0,35 vers 1, ressort GameMotion.release ; aucune animation si animations réduites. Le titre de page est un grand titre qui se réduit en barre compacte translucide.

Transposition Android : CollapsibleHeader + NavigationStack push -> LargeTopAppBar/CollapsibleHeader + NavHost ; refreshable -> PullToRefreshBox ; fullScreenCover -> destination plein écran du nav graph.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProgressionView.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionFrontList.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionHeaderStanding.swift`

</details>

### Les barres, cartes d'état et squelettes de Progression disent toujours si je suis hors ligne, vide ou en erreur

`game-progression-primitives` · Android : **absente** · P0 · effort M

ProgressionComponents fournit les briques feuilles de l'écran : ProgressionCard (surface teintée), ProgressionBar (fraction entre deux paliers, VoiceOver lit la valeur avec le libellé de l'échelle), ProgressionTierDots, ProgressionStreakCard (flamme, « N jours », record, barre vers le prochain jalon, prochaine étape), ProgressionAxisRow (ligne d'axe de badge), ProgressionAchievementRow (ligne de succès avec liseré de rareté), ProgressionNotice (trois états : vide « Aucune activité pour l'instant… », hors ligne avec ou sans instantané, erreur + Réessayer), ProgressionSkeleton (squelette froid) et ProgressionGeneratedAchievements / chips (sections de succès générés).

Écarts :
- ProgressionBar Compose avec sémantique de progression (valeur + libellé d'échelle) ; ProgressionTierDots ; ProgressionNotice (vide / hors ligne / erreur + Réessayer, icônes sparkles / wifi.slash / alerte).
- ProgressionSkeleton froid (jamais sur un cache non vide).
- StreakCard, AxisRow, AchievementRow, GeneratedAchievements (sections et chips de défis).
- Cartes teintées partagées avec game-surface-components.

Rendu : Carte teintée rayon md ; notice : icône 24 dp à gauche teintée (brandPrimary vide / warning hors ligne / error), texte subhead medium, Réessayer à droite en small semibold ; barre fine arrondie teinte de l'échelle.

Transposition Android : ProgressView.tint -> LinearProgressIndicator personnalisé ; wifi.slash -> Icons.Rounded.WifiOff.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProgressionComponents.swift`

</details>

### L'écran Progression se peint tout de suite depuis le cache et ne rejoue jamais un état plus ancien qu'un geste confirmé

`game-progression-viewmodel` · Android : **absente** · P0 · effort M

ProgressionViewModel charge GET /me/engagement en cache-first (instantané affiché immédiatement, revalidation silencieuse, squelette seulement à froid, hors ligne l'instantané reste affiché avec un avis, même un cache expiré). Il dérive EngagementProgress et le bloc game ; garde la dernière lecture connue par processus pour qu'une page poussée se peigne dès la première image ; ordonne les lectures par tickets et par révision du jeu (une charge partie avant le dernier geste est refusée) ; compte les gestes en vol, défait seulement ce que son geste a changé, et se réconcilie par relecture quand deux gestes échouent ensemble ; écoute game:updated {gameRevision, reason, game} (game nul = relire) ; persiste l'instantané (notification lue par la bannière du joueur) en différé tant qu'un geste est en vol ; porte le guide de Mee et Meo et le carnet de photos ; replanifie à chaque lecture les rappels de série locaux. L'extension Game ajoute reroll, claimChest, buyFreeze et relight avec la règle capturer l'instantané -> appliquer en local -> envoyer -> restaurer, une erreur dite en une phrase dans la carte du geste, un requestId par intention renouvelé après succès. mint() produit une MintCelebration et un GameMintSettlement qui pilotent la cérémonie de frappe.

Écarts :
- EngagementRepository (:sdk-core) : GET /me/engagement, cache Room clé engagement:<userId> avec fresh/stale/expired/empty, squelette uniquement sur cache vide, instantané conservé hors ligne avec avis « Hors ligne — progression telle qu'à la dernière ouverture ».
- GameViewModel exposant StateFlow<EngagementUiState> (progress, game, loadState, pending par geste, erreurs par geste, celebration, mintSettlement, isOnline, isMinting, mintError).
- Gestes reroll / claimChest / buyFreeze / relight / mint en optimiste avec restauration, requestId par intention, libération de l'id sur conflit 409, relecture forcée après refus ou après frappe.
- Ordre des lectures : ticket au départ, révision de jeu confirmée et Meesh frappées confirmées, refus d'une charge plus ancienne ; réconciliation quand deux gestes échouent en même temps.
- Abonnement socket game:updated (SocketEvent à ajouter au manager Android) avec décodage tolérant d'un bloc game illisible = relecture.
- Dernière lecture connue partagée entre pages poussées (singleton par utilisateur) pour éviter tout squelette entre deux pages qui lisent la même charge.
- Écritures différées du cache tant qu'un geste est en vol ; diffusion d'un signal « instantané persisté » lu par la bannière du joueur.
- Rappels de série locaux (équivalent StreakReminderScheduler) : WorkManager/AlarmManager + canal de notification, replanifiés à chaque lecture avec jours tenus et geste du jour.
- Les gestes d'écriture se taisent hors ligne avec la raison dite (NetworkMonitor), jamais un bouton grisé sans explication.

Rendu : Aucun spinner sur un cache non vide ; squelette uniquement à froid ; erreur de chargement en phrase unique « Impossible de charger la progression » avec Réessayer.

Transposition Android : CacheFirstLoader/CacheCoordinator -> repository Room + Flow ; NotificationCenter.default.publisher -> SharedFlow ; StreakReminderScheduler (UNUserNotificationCenter) -> WorkManager + NotificationManager ; @MainActor/ObservableObject -> ViewModel + StateFlow.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ProgressionViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Game/ProgressionViewModel+Game.swift`

</details>

### Le bloc « game » du serveur se lit sans jamais casser l'app, devant un serveur plus ancien comme plus récent

`game-sdk-block-models` · Android : **absente** · P0 · effort M

Couche de modèles du jeu : le bloc `game` de GET /me/engagement (niveau + échelle, gloire/rang, missions du jour + mission personnelle, coffre, Flamme, boosts, trésor, frappe) et ses SEPT extensions de la vague 2 (ligue, duo, saison, saison à venir, trophées, atlas, Prestige, visibilités, raretés, fragments d'étoile). Tolérance stricte : un bloc absent ou partiel vaut nil, une extension illisible tombe SEULE (try? par extension) sans emporter le niveau, la Flamme ni le coffre. Inclut les requêtes/réponses des écritures (requestId d'idempotence par INTENTION, statuts gardés en chaînes), l'en-tête `X-Meeshy-Game-Version: 2` et les 26 codes d'erreur 409 (INSUFFICIENT_POINTS, TREASURY_LOCKED, MINT_BLOCKED_BY_DEBT, PRICE_CHANGED, LEAGUE_*, DUO_*, SEASON_*, PRESTIGE_*…). Les clés optionnelles s'encodent en null pour que la copie disque relue hors ligne soit la réponse serveur clé pour clé.

Écarts :
- Créer les data classes kotlinx.serialization du bloc game (Level/Ladder, Glory, Mission(s) + personal, Chest(status), Flame, Boosts/PrismHour, treasury, mint ladder/lock) dans :core:model, miroir de packages/shared/types/game.ts et game-v2.ts
- Décodage tolérant : `GameBlock.parse` rend null si absent/partiel ; chaque extension vague 2 décodée dans un runCatching isolé (league, duo, season, seasonUpcoming, trophies, atlas, prestige, visibility, rarity, starFragments) ; mission personnelle illisible tombe seule
- Ajouter au client Retrofit les routes /me/engagement (bloc game), /me/meesh/mint, /me/game/missions/:id/reroll, /chest/claim, /flame/freezes, /flame/relight, /guide/seen, /league/{consent,pseudonym,week,friends,weeks/:weekKey}, /duo/{invite,:id/accept,:id/abandon}, /season/steps/:n/claim, /season/seal, /seasons/:n, /seasons/calendar, /showcase/order, /visibility, /prestige, /privacy (GET+PUT), /users/:id/game, /users/:id/game/showcase, /frames/atmosphere, /photo-moments/{invitations,presented}
- Intercepteur OkHttp posant `X-Meeshy-Game-Version: 2` sur les appels du jeu (sans lui la passerelle sert l'ancien comportement)
- Enum GameErrorCode (26 codes) + décodage du corps de refus 409 avec champs racine (sparksDebt ; number/price/basePrice/costFactor pour PRICE_CHANGED)
- Générateur de requestId (UUID) UNE fois par intention, conservé au réessai et renouvelé après succès ou REQUEST_ID_CONFLICT
- Encodage des clés optionnelles en null (explicitNulls = true) pour que le cache disque reste fidèle à la réponse serveur
- Tests rejoués sur packages/shared/fixtures/reading-modes/game.vectors.json et schémas Zod (comme GameBlockModelsTests/GameRoutesTests iOS)

Rendu : Aucun rendu : couche de données. Les erreurs 409 remontent en phrases (jamais en codes) vers les écrans.

Transposition Android : Codable Swift -> @Serializable kotlinx.serialization avec JsonObject manuel pour la tolérance par extension ; URLSession -> Retrofit/OkHttp existants ; catalogue généré MeEndpoint.game* -> interface Retrofit GameApi dans :core:network.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameBlockModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameWave2Models.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameWriteModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameRoutes.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePersonalMission.swift`

</details>

### Les gestes du Jeu (missions, coffre, Flamme, saison, ligue) partent au serveur sans jamais s'appliquer deux fois

`game-sdk-service` · Android : **absente** · P0 · effort M

GameService expose quatre protocoles séparés pour ne pas casser les doubles de test : GameServiceProviding (5 écritures du lot 1 : changer une mission pour 1 Meesh une fois par jour, ouvrir le coffre du jour, acheter un gel de Flamme, rallumer une Flamme éteinte, marquer des moments du guide comme vus), GameWave2ServiceProviding (consentement et pseudonyme de ligue, semaine de ligue, ligue des amis, duo inviter/accepter/abandonner, réclamer une étape de saison, sceau de saison, ordre et visibilités de la vitrine, vitrine d'un membre, Renaissance, vie privée du jeu), GameIntegrationServiceProviding (réglages du jeu GET /me/game/privacy, jeu d'un autre membre GET /users/:id/game) et GameArchiveServiceProviding (saison par numéro, semaine de ligue par lundi). Chaque requestId (UUID) est généré UNE fois par intention de l'utilisateur et rejoué tel quel en cas de réessai : la passerelle rend le résultat de la première écriture. Un refus d'état (409) lève MeeshyError.rejected et GameService.refusal(of:) en lit le GameErrorCode ; un code inconnu d'un serveur plus récent vaut nil. La lecture du bloc game voyage dans GET /me/engagement, pas à une adresse propre.

Écarts :
- Déclarer l'interface Retrofit GameApi dans :core:network pour les ≈24 routes /api/v1/me/game/* : POST missions/{id}/reroll, chest/claim, flame/freezes, flame/relight, guide/seen, league/consent, duo/invite, duo/{id}/accept, duo/{id}/abandon, season/steps/{n}/claim, season/seal, prestige ; PUT league/pseudonym, showcase/order, visibility, privacy ; GET league/week, league/friends, privacy, seasons/{n}, league/weeks/{weekKey} ; GET /users/{id}/game et /users/{id}/game/showcase.
- Créer GameRepository (:sdk-core) avec les mêmes quatre contrats que iOS (lot 1, vague 2, intégration, archives) pour que les tests puissent doubler un seul contrat sans casser les autres.
- Générer le requestId une fois par intention et ne le renouveler qu'après un succès (réessai réseau = même id) ; le libérer sur conflit.
- Traduire un refus 409 en GameErrorCode (enum miroir de packages/shared) puis en phrase localisée ; un code inconnu ne doit jamais faire échouer l'appel.
- DTO de réponse miroirs de packages/shared (MissionRerollResponse, ChestClaimResponse, FlameFreezeResponse, FlameRelightResponse, GuideSeenResponse, League*/Duo*/Season*/Showcase*/Prestige*/GamePrivacy*) avec décodage tolérant aux champs absents.
- Tolérer un serveur antérieur : les routes de la vague 2 sont opt-in (404/absent = fonction masquée, pas d'erreur) et l'écran de saison/ligue retombe sur l'en-cours quand l'archive n'est pas servie.

Transposition Android : APIClient.post/put/request -> Retrofit + kotlinx.serialization dans :core:network ; MeeshyError.rejected -> exception typée portant le code serveur ; Sendable/protocol -> interfaces Kotlin injectées par Hilt.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/GameService.swift`

</details>

### Tout le texte du jeu (~410 phrases) est dit dans la langue de l'utilisateur, avec les mêmes mots que le web et iOS

`game-wave2-copy-i18n` · Android : **absente** · P0 · effort M

Miroir des clés `game.*` du catalogue web (apps/web/src/lib/interface-catalogs/catalog-game-<langue>.ts) : MÊME phrase, dans les langues du jeu, sur toutes les plateformes. Clés iOS `game2.*` (ligue, saison, vitrine, atlas, Prestige, duo, réglages, guide, archives, profil visiteur), `game.photo.*`, `game.frappe.*`, `game.chest.*`. Arguments positionnels (%1$@, %2$@) pour les ordres de mots qui changent selon la langue ; accord singulier/pluriel choisi sur l'entier (catégorie ordinale : français `one` « 1re », anglais one/two/few/other, autres langues une seule forme). iOS localise ar, de, en, es, fr, it, pt, pt-BR, zh-Hans.

Écarts :
- Extraire les ~410 chaînes de cette partie (game2.*, game.photo.*, game.frappe.*, game.chest.*) du catalogue web/xcstrings vers res/values*/strings_game.xml
- Android ne livre que values (en), values-fr, values-es, values-pt : ajouter values-it, values-de, values-ar, values-zh-rCN (+ pt-BR) pour les langues du jeu, ou restreindre explicitement le périmètre
- Remplacer les marques positionnelles par %1$s/%2$s et choisir les pluriels par `plurals` + règle ordinale (GameOrdinal) plutôt que par == 1
- Accesseurs GameText typés (un par clé) et garde de test qui vérifie que chaque clé existe dans toutes les locales livrées (équivalent de GameWave2CopyTests)
- Écriture RTL (arabe) : les phrases sont déjà bidi-sûres ; vérifier les glyphes de monnaie (✦ étincelles, ♛ Gloire)

Rendu : Ton du jeu : tutoiement, voix de Mee et Meo ; aucune chaîne en dur dans les Composables.

Transposition Android : String(localized:) / Localizable.xcstrings -> res/values-<qualifier>/strings.xml + stringResource/pluralStringResource ; génération d'accesseurs Kotlin optionnelle.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2CopyCommon.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2CopyCollection.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2CopyGuide.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2CopyLeague.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2CopySettings.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameArchiveCopy.swift`

</details>

### Chaque geste du jeu (consentir, inviter, réclamer, ranger, passer en Prestige, masquer) répond tout de suite et se rétablit proprement en cas d'échec

`game-wave2-gesture-model` · Android : **absente** · P0 · effort M

Modèle des gestes de la vague 2 (GameWave2Model, ObservableObject) : règle des Instant App Principles — capturer l'instantané, appliquer en local, envoyer, restaurer si échec. Identifiant d'idempotence né une fois par intention, renouvelé seulement après un succès ou un conflit d'identifiant. Un refus d'état (409) dit que l'écran était périmé : il se relit au lieu de laisser mentir ce qu'on vient de restaurer. États par lecture (GameLoad : valeur du cache ou servie, rafraîchissement en cours, échec qui ne PRIME jamais sur une valeur déjà là ; squelette seulement sur cache vide), gestes en vol par intention (consent, pseudonym, invite, accept, duo, claimingStep, seal, order, visibility, prestige, hide, friendsOptOut) et dernière erreur en une phrase, jamais un code. Gestes : setConsent, setPseudonym, invite/accept/abandon (duo), claim(step), buySeal, saveOrder, setVisibility(showcase/rank/treasury/atlas), passPrestige, setHidden (geste COMPOSÉ : masque l'appareil puis ferme les 4 visibilités à « moi seul » et la ligue publique côté serveur ; si le serveur refuse l'interrupteur se rouvre), setFriendsLeagueOptOut. Lectures cache-first : loadSettings (GET /me/game/privacy), loadSeasonSchedule, loadWeek, loadFriendsLeague, loadFriends, showcase(of:). Copies optimistes immuables des blocs (GameWave2Optimistic) : un champ ajouté fait rougir la compilation.

Écarts :
- ViewModel GameWave2ViewModel (StateFlow) exposant GameLoad<T>, pending, errors et isOnline (observateur réseau existant)
- Helper `run(gesture)` : snapshot -> optimistic copy -> appel Retrofit -> rollback + relecture sur 409 ; requestId par intention
- Copies optimistes de GameLeagueBlock, GameDuoBlock, GameSeasonBlock, GamePrestigeBlock via data class `copy` (sans mutation)
- Geste setHidden composé (appareil + PUT /me/game/privacy + fermeture des visibilités + sortie de ligue) avec rétablissement si refus et suspension hors ligne
- Hors ligne : gestes désactivés avec la phrase « Hors ligne : ce geste reprendra avec la connexion. » (pas de file d'attente pour ces gestes)
- Tests ViewModel : succès, échec réseau (rollback), 409 périmé (relecture), idempotence du requestId

Rendu : Jamais de spinner sur cache non vide ; le bouton d'action RESTE pendant le geste avec son état (indicateur d'activité), il ne disparaît pas au tap.

Transposition Android : ObservableObject @MainActor -> ViewModel + StateFlow dans :feature (nouveau module :feature:game ou sous :feature:profile) ; Task async -> viewModelScope.launch.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2Model.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2Optimistic.swift`

</details>

### Le classement, la ligue Amis et la vitrine s'affichent depuis le disque avant le réseau, par compte, et se purgent à la sortie

`game-wave2-local-store` · Android : **absente** · P0 · effort M

Cache DISQUE du jeu (acteur GameWave2DiskCache) dans le dossier des caches (purgeable, hors sauvegarde), rangé par compte sous `meeshy-game-v2/<userId>/`, identifiants encodés avant d'entrer dans un chemin, ne gardant que ce que la passerelle a servi. Conformité A-9 : pseudonymes et totaux des autres membres ne restent pas sur l'appareil d'une personne qui n'y joue plus — suppression à la sortie de ligue et purge du dossier de tout autre compte à l'ouverture. Réglages d'appareil (GameDevicePrefsStore) : jeu masqué, célébrations (défaut permises), opposition à la ligue Amis telle que confirmée par le serveur ; `offersPhotos = !hidden && celebrations`. Amis ACCEPTÉS lus dans le cache des contacts (nom d'affichage, sinon pseudo, jamais un identifiant). Chargeur de vitrine d'un autre : disque d'abord, réseau ensuite ; la copie disque ne remplace le réseau QUE sur panne de transport (pas de réseau, délai, serveur en panne) — une réponse du serveur (refus, blocage, réglage fermé) fait oublier la copie (conformité D-5).

Écarts :
- Cache disque par compte (filesDir/cacheDir `meeshy-game-v2/<userId>/`) avec load/save/remove/purgeOtherAccounts, sérialisation JSON, noms de fichiers sûrs
- DataStore Preferences par compte pour hidden / celebrations / friendsLeagueOptOut (défauts : jeu visible, célébrations permises)
- Fournisseur d'amis acceptés branché sur le repository des contacts Android existant
- GameShowcaseLoader/GameUserGameLoader : distinction panne de transport (IOException/timeout) vs réponse serveur
- Purge à la déconnexion et au changement de compte

Rendu : Aucun rendu ; garantit qu'aucun écran n'affiche un spinner quand le disque a une valeur.

Transposition Android : Caches/ iOS -> Context.cacheDir (purgeable) ; UserDefaults -> DataStore Preferences ; actor -> Mutex + Dispatchers.IO.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2Support.swift`

</details>

### Les succès générés (Défis) se rangent du moins au plus complexe et gardent toujours le prochain objectif visible

`game-achievement-catalog` · Android : **absente** · P1 · effort M

AchievementCatalog rejoue la grammaire des succès du partagé : familles section.subject.verb.scale (cercles, parole… avec échelle « count » 1/10/100/1 000/10 000 ou « size » 10 à 1 000 000), atteignabilité qui RETIRE un palier que le produit ne peut pas rendre vrai, tri par baseDifficulty + log10(palier), fenêtre d'affichage max(7, acquis + 2). AchievementCopy habille chaque famille par un gabarit (≈8 clés rendent une cinquantaine de succès) avec le nombre formaté par la locale du lecteur, un singulier au palier 1, un titre de section, et rend nil pour une famille hors catalogue (jamais une clé technique affichée).

Écarts :
- AchievementFamily et AchievementCatalog (familles, countTiers, sizeTiers, windowMinimum = 7, windowStep = 2, key(tier), difficulty(tier)) dans :core:model ; le modèle Achievement actuel d'Android (id, name, progress, threshold) n'est qu'une liste plate venant de /users/stats.
- Atteignabilité, tri par difficulté et fenêtre « max(7, acquis + 2) » identiques au web et à iOS, avec la même exclusion de decouverte et de community.leave.count.
- Libellés par gabarit dans strings.xml (singulier palier 1, nombre formaté par la locale du lecteur, titres de section) et résolution nil pour une famille inconnue.
- Garde de parité contre achievement-catalog.ts / achievement-view.ts / achievement-labels.ts : le catalogue devient un TROISIÈME miroir à tenir.

Transposition Android : NumberFormatter.localizedString -> NumberFormat.getInstance(locale) ; String(localized:) -> plurals/strings.xml.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/AchievementCatalog.swift`
- `apps/ios/Meeshy/Features/Main/Views/AchievementCopy.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Stats.kt`

### Quand je décroche un palier, une carte posée me le montre en grand avec mon pseudo gravé, avant de me ramener à la progression

`game-achievement-reveal` · Android : **absente** · P1 · effort M

AchievementRevealView : une CARTE bornée (300 pt), inclinée d'un degré et demi, posée sur un voile qui laisse voir l'écran couvert ; toucher le voile referme. Deux occasions : célébration (haptique de succès, « Succès débloqué », sortie qui MÈNE à la progression) et consultation (retour depuis le tableau de bord ; on n'y refête rien et un succès non obtenu s'y lit avec la condition pour l'avoir). Contenu selon la nature du palier : succès nommé, palier généré (« Un palier de plus dans « Cercles » »), badge d'axe (« 100 messages texte »), série (« 23 jours d'affilée »), niveau. Un succès obtenu porte la plaque d'auteur (pseudo gravé au métal de sa rareté), une ligne de rareté (« Épique · 4 % des comptes ») et un liseré — FAIL-CLOSED : une rareté non mesurée ne pose aucun liseré (20 titulaires, 1 000 comptes). RevealMedal montre la médaille du badge d'accumulation célébré (famille, pictogramme, matière du palier, seuil sur le ruban). Boutons : action offerte en premier remplie (Voir la progression), « Photographier » (moment photo), fermeture en retrait quand une action est offerte. Entrée par ressort (0,55 s) + halo 0,9 s ; animations réduites = POSÉ à l'état final.

Écarts :
- EngagementReveal (achievement, composedAchievement, badge, streak, level) et Occasion (celebration / consultation) puis AchievementRevealCard : carte 300 dp inclinée 1,5 deg sur voile cliquable, titre/explication par type de palier.
- Plaque d'auteur (pseudo gravé à la matière de la rareté) et ligne de rareté ; liseré de rareté (RevealRim) fail-closed sur données non mesurées.
- RevealMedal (famille, pictogramme, matière, seuil) avec GameMedalView.
- Haptique succès à la célébration seulement ; animation ressort 0,55 s + halo ; sans animation si animations réduites.
- Déclenchement depuis les notifications achievement_unlocked / badge_earned / streak_milestone / level_up (aujourd'hui sans destination) et depuis les lignes de succès (consultation).
- Publier le signal GameMomentPresence pendant l'affichage.

Rendu : Carte 300 dp inclinée 1,5 deg, voile sombre translucide, médaille/badge en grand avec halo, titre calloutSize semibold, boutons capsule min 52 dp (action remplie teinte du palier, fermeture contour blanc 60 %) ; entrée ressort response 0,55 / damping 0,62.

Transposition Android : fullScreenCover -> Dialog plein écran ou destination ; HapticFeedback.success -> HapticFeedbackConstants.CONFIRM (API 30+) / VibrationEffect.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AchievementRevealView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AchievementRevealMedal.swift`

</details>

### Mon passeport des langues garde un tampon pour chaque langue avec laquelle j'ai vraiment échangé

`game-atlas-page` · Android : **absente** · P1 · effort M

Page Atlas (conception II.8) : une langue est TAMPONNÉE quand un message est envoyé ET un reçu avec quelqu'un qui l'écrit. En-tête (« n / total langues » + barre + introduction), carte des tampons (grille 3 colonnes, tampon 64 pt incliné alternativement -6/+8 degrés teinté de la couleur de la langue, nom dans la langue de l'interface, date du tampon ; jusqu'à 3 pastilles « à découvrir » puis le reste compté en texte), carte des échanges à moitié faits (un sens manque : « envoyé » ou « reçu »), carte « Qui voit mon Atlas » (PRIVÉ par défaut « moi seul » — conformité E-1/E-2 : une langue minoritaire peut révéler une origine ou une conviction ; l'Atlas n'entre dans aucune liste ni aucun tri servi à autrui ; seulement la langue, les deux sens et la date). Chaque tampon se touche (rebond + précisions). Loi miroir d'atlas.ts (catalogue = langues servies par la passerelle).

Écarts :
- Porter GameAtlas (AtlasEvent, AtlasStep, AtlasStamp, AtlasPending, AtlasSummary, catalogue des langues servies) + test de parité du catalogue avec SUPPORTED_LANGUAGE_CODES
- Écran Atlas : en-tête, grille de tampons (3 colonnes, inclinaisons alternées), pastilles « à découvrir » (max 3), échanges à moitié faits, carte de visibilité (défaut Moi seul)
- Composable AtlasStamp (états stamped / pending / undiscovered) teinté par la couleur de langue (palette langues existante côté Android à brancher)
- Précisions d'élément au toucher d'un tampon avec rebond
- États : atlas non servi -> « non disponible » ; vide -> message

Rendu : Tampon 64 dp avec code de langue, rotation -6 / +8 degrés ; en liste, tampon 36 dp à gauche + nom bodySize semibold + sous-ligne smallSize atténuée ; ligne >= 44 dp.

Transposition Android : LanguageData.info(for:).colorHex -> palette de langues Android (LanguagePickerDialog/LanguageQuickStrip) ; noms de langues via Locale.getDisplayLanguage.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameAtlasViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameAtlas.swift`

</details>

### Mes badges d'accumulation sont rangés par famille, un par axe, avec leurs étoiles et la suite des paliers

`game-badge-shelf` · Android : **absente** · P1 · effort M

GameBadgeShelfView : étagère des badges rangée PAR FAMILLE (contenu, commentaire, conversation, outil, lien), un badge par axe (son plus haut palier), chacun avec ses étoiles sur sept, la SUITE de ses paliers à venir (matière et seuil) et un lien « Comprendre les badges » vers la section badges du carnet. Un badge GAGNÉ est allumé (médaille : lunette de métal, émail à la couleur de la famille, pictogramme d'axe, perles de palier, ruban à partir de l'Or, arc de progression vers le palier suivant) ; un badge éteint par une frappe devient une EMPREINTE avec ce qu'il manque pour le rallumer (« −37 ») ; un badge jamais gagné n'apparaît pas. Matières par seuil : Cuivre 1, Bronze 10, Argent 50, Or 100, Platine 500, Obsidienne 1 000, Prisme 5 000. GameBadgeGuideModel/Rung/Ladder/Upcoming/Stars construisent le guide de badge. Un badge se touche : il rebondit et ouvre ses précisions ; haptique badgeLit quand un badge s'allume.

Écarts :
- GameBadges.shelf/items/material(forThreshold) et GameBadgeItem (lit, missing, value, nextThreshold, progress) en lois pures ; BadgeGuideResolver et GameBadgeGuideModel.make (raisons, prochain palier, échelons).
- BadgeShelf Compose : groupes par famille, cellule médaille 64x72 dp avec lecture a11y (éteint, toward…), étoiles, échelle, paliers à venir.
- Rebond au toucher + feuille de précisions ; haptique badgeLit sur passage éteint -> allumé.
- Lien « Comprendre les badges » (environnement gameOpenBadgesGuide) vers la section badges du carnet.

Rendu : Titre de famille en caption2 semibold majuscules muted ; ProgressionCard teintée brandPrimary ; séparateurs textMuted 20 % ; cellule 64x72 dp ; étoiles 7 ; paliers à venir sous la ligne.

Transposition Android : EnvironmentKey -> CompositionLocal ; haptics.play(badgeLit) -> pattern Vibration.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameBadgeShelf.swift`

</details>

### Le coffre du jour s'ouvre en levant son couvercle et en laissant monter trois étincelles d'or

`game-brick-chest` · Android : **absente** · P1 · effort S

ChestView : un coffre d'indigo avec bandeau d'or et serrure à la Signature gravée ; fermé le couvercle est un dôme, ouvert il se lève et trois étincelles d'or montent. openProgress (0 à 1) s'anime : couvercle et étincelles se fondent sous withAnimation. La brique ne décide ni quand le coffre s'ouvre ni ce qui monte : c'est la chorégraphie de l'app (ChestStage).

Écarts :
- ChestView Compose (Canvas 90x72) : corps, bandeau d'or, serrure, dôme fermé / couvercle ouvert / étincelles interpolés par openProgress.
- Chemins SVG exacts (closedLid, openLid, sparkles) et libellé a11y optionnel.

Rendu : Corps indigo, bandeau d'or, dôme M10 34 a35 22 0 0 1 70 0 ; couvercle ouvert qui se lève ; trois étincelles d'or à 30/45/60.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/ChestView.swift`

</details>

### Mes badges sont de vraies médailles de métal avec perles de palier, ruban et arc de progression

`game-brick-medal-badge` · Android : **absente** · P1 · effort M

GameMedalView (miroir de medal() § XII.2) : lunette de métal biseautée (sept matières), champ ÉMAILLÉ à la couleur de la FAMILLE de l'axe (contenu indigo, lien rose, conversation violet, commentaire sarcelle, outil ambre), PICTOGRAMME d'axe au trait au centre (GameMedalGlyph, jamais une bulle), SEPT perles de palier en haut (autant d'allumées que le rang de la matière), poinçon Signature en bas, RUBAN à partir de l'Or avec le seuil en cartouche, ARC extérieur = progression vers le palier suivant. Éteinte (une frappe l'a fait redescendre) : EMPREINTE en creux sans métal avec ce qu'il manque pour la rallumer ; le prisme (5 000) irise son émail avec l'inclinaison du téléphone (gamePrismTilt). GameBadgeView : les trois formes historiques (accumulation = hexagone, record = losange, collection = médaillon à pastilles pleines/vides), la Signature gravée, l'empreinte pointillée « −37 ».

Écarts :
- GameMedalFamily / GameMedalGlyph (pictogrammes d'axe au trait, ≈20) et GameMedalView Compose : lunette, émail, perles, ruban + cartouche, arc, empreinte, glyphes.
- GameBadgeView (formes accumulation / record / collection) et état lit / imprint.
- Irisation du prisme pilotée par l'inclinaison (voir game-shader-effects) ; sans mouvement l'irisation reste à une inclinaison fixe.
- Libellés a11y composés par l'hôte (matière, x sur y vers le palier suivant).

Rendu : Médaille ronde : lunette métal + champ émaillé de la famille + pictogramme + 7 perles en arc + Signature en bas + ruban dès l'Or ; arc extérieur fin pour la progression ; empreinte = même forme en creux, pointillé.

Transposition Android : CoreMotion inclinaison -> SensorManager rotation vector, filtré et borné.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameMedalView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameBadgeView.swift`

</details>

### La Meesh est une vraie pièce frappée, avers et revers, en trois éditions, identique au web module pour module

`game-brick-meesh-coin` · Android : **absente** · P1 · effort M

MeeshCoinView/Painter/Geometry/Layout/DecorGeometry/Faces rejouent la géométrie partagée packages/shared/design/meesh-coin.json (repère 120x120, angles horaires depuis 3 h) : AVERS pour toutes les éditions (couronne UNIVERSELLE « MEESHY · 1 MEESH » jamais traduite, l'or remplace ses points par de petites étoiles, Signature frappée, tranche cannelée) ; REVERS : Mee (argent), Meo (or) ou Mee et Meo face à face (prisme) GRAVÉS dans le métal et COLORÉS (GameEngravedBirds : lumière haute -1,3 blanc 0,85, ombre basse +2,4 indigo 0,6, boîte 140), couronne royale du prisme, lauriers de l'or, « Nº » (o monté et souligné, nombre en petit) et l'année. Trois éditions décidées par la loi partagée meeshEdition : argent veiné d'or (sobre), or pur centre compris (raffiné), or mêlé de diamant à la tranche irisée (royal). Décors : veines, grènetis, rosace, étoiles, lauriers, cabochons, soleil, éclats du prisme qui scintillent (immobiles si animations réduites ou hors écran). Un témoin décode le JSON partagé et exige l'égalité champ pour champ avec la copie du client. Se retourne, reçoit l'onde de frappe et le reflet par les modificateurs de game-shader-effects (chorégraphie de l'app).

Écarts :
- Embarquer packages/shared/design/meesh-coin.json (asset ou ressource brute générée) et le décoder (MeeshCoinGeometry + DecorGeometry) avec un test qui compare à la copie partagée.
- MeeshCoinLayout : mêmes formules que coin-geometry.ts au millième près (perles, glyphes sur l'anneau, cabochons, rosace, lauriers, soleil, éclats).
- MeeshCoinPainter Compose : métal, tranche cannelée, grènetis, champ guilloché, avers (inscription tournée + Signature), revers (oiseaux gravés, couronne, lauriers, Nº souligné, année), éclats scintillants.
- GameEngravedBirds : les deux figures meeJoy / meoOpen trait pour trait (ordre, chemins, teintes, boîte 140) avec relief ombre + lumière.
- Édition (sobre / raffiné / royal) via meeshEdition porté du partagé ; retournement avers/revers animé par l'hôte.
- Scintillement arrêté hors écran et en animations réduites ; libellé a11y fourni par l'hôte.

Rendu : Pièce ronde : avers = couronne « MEESHY · 1 MEESH » + Signature frappée ; revers = oiseaux colorés gravés + Nº + année ; argent sobre veiné d'or, or raffiné (lauriers, rosace), prisme royal irisé (cabochons, soleil, couronne).

Transposition Android : Resources de paquet SwiftPM -> assets Android ; GraphicsContext shading -> Brush.linear/sweep ; TimelineView scintillement -> withFrameNanos.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinPainter.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinLayout.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinDecorGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/MeeshCoinFaces.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameEngravedBirds.swift`

</details>

### Mon rang est un blason de métal avec ma division et, plus haut, Mee et Meo qui le tiennent

`game-brick-rank-blason` · Android : **absente** · P1 · effort M

RankBlasonView : un écu par rang (onze rangs), la matière monte avec lui (cuivre -> prisme) ; à partir d'Ambassadeur Mee et Meo tiennent l'écu, à Légende ils sont couronnés (GameHeraldry.drawCrown), à Mythe auréolés (drawHalo). Géométrie ajoutée par #9636 : décoration propre à chaque rang à la Signature derrière l'écu, NIVEAU gravé dans la pointe, DIVISION en cinq encoches sous la pointe (V = 1 … I = 5, les vides en creux), pour Mythe la Signature unique de son ÉMISSION en halo prismatique et son numéro gravé sous l'écu. Table partagée GameRankCrest (miroir de rank-crest.ts). Sous 60 pt le blason se recadre sur l'écu et sa décoration (tenants, ruban, chiffres se taisent). Ruban de nom pour Ambassadeur et au-delà. GameFigures désigne les films de Mee et Meo qui tiennent l'écu (première image fixe).

Écarts :
- RankBlason Compose (Canvas) : écu, décoration par rang depuis GameRankCrest, niveau gravé, 5 encoches de division, halo mythique, ruban, mode compact < 60 dp.
- GameRankCrest (table de pièces par rang) en port Kotlin avec garde de parité sur rank-crest.ts.
- Tenants : intégrer les films de Mee et Meo en image fixe (pack de stickers du domaine) + couronne et auréole.
- Libellé a11y fourni par l'hôte (« Voix IV, niveau 34 »).

Rendu : Écu de métal par rang, encoches de division sous la pointe, ruban de nom à partir d'Ambassadeur, couronne d'or sur la tête des tenants à Légende, auréole d'or à Mythe, halo arc-en-ciel pour Mythe.

Transposition Android : MeeStickerCatalog -> pack d'animations vectorielles Android.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/RankBlasonView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameHeraldry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameFigures.swift`

</details>

### J'ouvre le coffre du jour : le couvercle s'ouvre et les récompenses montent une à une

`game-chest-open-choreography` · Android : **absente** · P1 · effort S

Loi du coffre (miroir de chest.ts) : gratuit et déterministe par utilisateur, jour, EFFORT des missions du jour et cours de la Meesh ; contenu certain (500 à 10 000 points selon l'effort), Gloire (un point pour dix de ces points), PRIME en points au cours de la prochaine Meesh (1 chance sur 20 le prix entier, sinon 1 sur 6 son cinquième arrondi), UN fragment d'étoile une fois sur six, un gel de Flamme une fois sur vingt ; contenu et probabilités affichés AVANT l'ouverture ; aucune Meesh ne sort d'un coffre. Scène 1,4 s : le couvercle s'ouvre, les récompenses montent en capsules ambre (« +N points », « +N de gloire », « Prime : +N, le prix d'une Meesh » / « un cinquième de Meesh », « Un fragment d'étoile », « Une Veilleuse pour ta Flamme ») avec une tape haptique chacune (0,5 s + 0,3 s). La scène ne tire rien, elle MONTRE ce que la passerelle a tiré ; `nil` tant que la passerelle n'a pas répondu ; ouvert au repos (écran rouvert) il montre son contenu sans rejouer ; sous « réduire les animations » le contenu apparaît en fondu.

Écarts :
- Porter GameChest (ChestOdds, ChestBonus, DailyChest, ChestContent, tirage déterministe) et GameStarFragments (StarFragmentsTotal) + tests chest
- Composable ChestStage(reward?, isOpen, play) 110x88 dp : couvercle animé (ChestView), capsules de récompenses (GameChestLines) avec opacité/décalage 22 dp
- Textes d'accord (singulier/pluriel fragments d'étoile, prime entière/cinquième)
- Écriture POST /me/game/chest/claim (ChestClaimResponse, statut already-*) via le modèle de gestes de game#1 ; haptique chest(rewards:)

Rendu : Capsules : texte smallSize semibold, fond warning 20 %, rayon capsule ; colonne centrée au-dessus du coffre ; montée de 22 dp avec fondu.

Transposition Android : ChestView SwiftUI -> Canvas Compose (couvercle pivotant).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/ChestStage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameChest.swift`

</details>

### Toutes les animations du jeu se jouent à la milliseconde près, tiennent 60/120 images et se réduisent à un fondu si j'ai limité les animations

`game-choreography-engine` · Android : **absente** · P1 · effort S

Moteur commun des chorégraphies (conception partie V) : ChoreographyClock rend à chaque image le temps écoulé depuis le dernier déclenchement (`play` incrémenté pour (re)jouer ; 0 = jamais joué, le contenu reçoit nil) — pas une animation implicite mais une lecture, ce qui rend les durées exactes, cale les haptiques sur des instants précis et met en pause immédiatement hors écran ; rien ne tourne au repos. GameTimeline : fonctions pures du temps (window, smooth) et durées de la planche : frappe 1,2 s (tchak à 0,45 s), rang 1,6 s, niveau gagné 0,6 s, niveau perdu 0,8 s, badge 0,7 s, coffre 1,4 s, fondu réduit 0,25 s. GameBounce : UN rebond pour tout ce qui se touche (carte de concept, badge, trophée, pastille, ligne de donnée, blason, compteur) — s'enfonce à 0,94 (ressort 0,18/0,82), dépasse au relâché (ressort 0,36/0,52), l'emblème des précisions entre à 0,6 ; sous « réduire les animations » le ressort devient un fondu d'opacité 0,6 ; style de bouton basé sur l'état pressé du système (jamais un DragGesture(minimumDistance 0) qui dispute le défilement).

Écarts :
- Composable ChoreographyClock(play, duration) { seconds: Double?, reduceMotion } basé sur withFrameNanos / LaunchedEffect ; arrêt hors composition et hors écran
- Objet GameTimeline : window/smooth, durées (strike 1.2, rank 1.6, levelGain 0.6, levelLoss 0.8, badge 0.7, chest 1.4, reduced 0.25) et fonctions strike/rank/badgeFill/chestLid/reward
- GameMotion + Modifier.gameBounce / ButtonStyle équivalent : pressScale 0.94, spring(0.82 damping, haute raideur) à l'enfoncement, spring(dampingRatio ~0.52, stiffness ~ moyenne-basse) au relâché, entranceScale 0.6 ; version fondu 0.6 si réduction
- CompositionLocal LocalReduceMotion alimentée par Settings.Global.ANIMATOR_DURATION_SCALE == 0 (et le réglage de réduction de Meeshy s'il existe)
- Utiliser interactionSource.collectIsPressedAsState (pas de pointerInput détectant le drag) pour ne pas voler le geste au défilement
- Tests des fonctions de temps (valeurs aux instants clés, ex. marteau en bas à 0,45 s)

Rendu : Une animation explique ce qui arrive, ne bloque jamais un geste. Rebond : s'enfonce à 94 %, dépasse puis se pose.

Transposition Android : TimelineView(.animation) -> withFrameNanos en boucle (Choreographer) ; accessibilityReduceMotion -> ANIMATOR_DURATION_SCALE ; MeeshyMotion.bouncySpring existant (sdk-ui/theme) en base mais valeurs différentes à régler.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/ChoreographyClock.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/GameTimeline.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/GameBounce.swift`

</details>

### Les Étincelles et les Élans ont chacun leur emblème gravé au motif de leur concept

`game-concept-emblems` · Android : **absente** · P1 · effort S

GameConceptEmblems dessine deux emblèmes dans un carré de 72 (miroir de concept-emblems.ts) : Points = un jeton rond indigo avec une étincelle d'or à quatre branches en haut à droite ; Élans = un carré arrondi couleur flamme avec un chevron qui monte au-dessus de la Signature. ConceptEmblemDesign est une table (corps cercle/rectangle, accent étincelle ou trait, Signature) ; ConceptMarkView la parcourt. Décoratif : l'hôte dit le nom du concept.

Écarts :
- Table ConceptEmblemDesign (Kind points/elans, Paint indigo/flame, Body, Accent, Signature, box 72) et composable Canvas qui la parcourt à l'échelle.
- Garde de parité avec concept-emblems.ts (mêmes coordonnées).
- Contenu a11y vide (décoratif).

Rendu : Carré 72 : Points = disque indigo + étincelle d'or 4 branches coin haut droit ; Élans = carré arrondi flamme + chevron montant ; Signature gravée dedans.

Transposition Android : Path/Canvas SwiftUI -> DrawScope.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameConceptEmblems.swift`

</details>

### Je fais une mission en duo hebdomadaire avec un ami accepté, récompense double si nous finissons tous les deux

`game-duo-card` · Android : **absente** · P1 · effort M

Carte « Mission en duo » (niveau record 20 requis des deux côtés, invitation ACCEPTÉE, quittable à tout moment — conformité B-4, aucune pression : le duo n'envoie rien). Cinq états lus de `duo.status` : verrouillé (ligne d'exigence niveau 20), invité (messages différents invité/inviteur, bouton « Accepter » + « Décliner/Annuler »), actif ou réussi (titre de mission par gabarit, ma part et celle du partenaire en barres de progression distinctes, objectif commun, récompense simple ou DOUBLÉE en vert, « Quitter le duo »), aucun/abandonné/expiré (phrase d'état + jusqu'à 8 amis proposés en boutons « Inviter X », ou « pas d'amis »). Tirage déterministe de la mission par la paire triée des comptes et la semaine.

Écarts :
- Porter GameDuo (DuoTemplate, DuoMission, DuoProgress, DuoReward, DuoInviteRefusal/Decision, DuoStatus, DuoAction, tirage par paire triée) + tests duo
- Composable GameDuoCard avec les 5 états, boutons d'action avec busy/disabled hors ligne, 8 amis max
- Barres de progression moi (brandPrimary) / partenaire (success) avec libellé texte et accessibilité
- Charger les amis (GameFriendsProviding) à l'ouverture si `duo.unlocked`
- Messages d'erreur DUO_NOT_FRIENDS / DUO_ALREADY_ACTIVE / DUO_TRANSITION_REFUSED en phrases

Rendu : Bouton d'action ambre (warning) à encre sombre indigo950 pour le contraste dans les deux thèmes ; récompense doublée en couleur success.

Transposition Android : Aucun équivalent plateforme particulier ; boutons Material personnalisés aux tokens Meeshy.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameDuoViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameDuo.swift`

</details>

### Je touche n'importe quel élément du jeu et une feuille m'explique ce que c'est, où j'en suis et comment l'obtenir

`game-element-detail-sheet` · Android : **absente** · P1 · effort M

Tout élément qui porte un sens répond au toucher : il rebondit puis une feuille dit ses précisions. GameElementKind liste 20 familles fermées (badge, succès, défi, trophée, tampon, étape de saison, sceau, gemme de ligue, étoile de prestige, rang, forme de flamme, gel, mission, coffre, pièce, anneau, trésor, famille d'élan, étape de niveau…). GameElementDetails bâtit, par une fonction pure par famille, un GameElementDetail depuis le bloc game et la progression (aucun calcul, aucune donnée inventée) : emblème, nom, état (obtenu avec la date servie, verrouillé avec ce qu'il manque et sa jauge, ou une valeur), ce que c'est (what), comment l'obtenir / ce que ça donne (how), faits (37 données game.detail.fact.<donnée>), rareté quand elle est servie. GameElementSheet est UNE feuille à détente ajustée au contenu (ou grande), poignée visible, verre natif ; l'emblème entre en grand avec le même ressort que le rebond ; le focus d'accessibilité va au nom après 350 ms ; liens « Voir la fiche » et « Comprendre les badges ». GameDetailText : 19 familles × 2 phrases + 37 faits dans les 7 langues, mêmes clés que le web.

Écarts :
- Types GameElementKind, GameDetailFactKey, GameElementEmblem, GameElementStatus, GameElementDetail et ≈25 constructeurs purs (badge, achievement, challenge, trophy, stamp, seasonStep, seal, leagueGem, player, prestigeStar, rank, flameForm, freeze, mission, chest, coin, treasuryTier, levelRing, levelStep, elanFamily, fact, hero).
- Modificateur gameElement(detail) : rebond puis ouverture ; CompositionLocal d'ouverture ; sheet par .sheet(item) = ModalBottomSheet à hauteur mesurée (partielle puis étendue) avec poignée.
- Contenu de la feuille : emblème animé (ressort), nom en titre, statut (obtenu/verrouillé/valeur), barre, étoiles de badge, sections what/how, carte de faits, rareté, lien Voir la fiche, bouton Fermer.
- Accessibilité : focus TalkBack sur le nom après la pose, libellé « <nom> — ouvre ses précisions », saturation 0,2 pour un élément verrouillé.
- Catalogue : 19 familles × (what, how) + 37 phrases de faits dans strings.xml (7 langues), mêmes clés que web et iOS.

Rendu : Emblème 112 dp centré (saturation 0,2 si verrouillé), nom titleSize bold arrondi centré, ligne d'état (coche success / cadenas muted / valeur subtitle bold), sections avec titres, carte de faits teintée par la couleur du concept, bouton Fermer discret ; entrée avec échelle GameMotion.entranceScale + opacité 0,2 vers 1, fondu simple si animations réduites.

Transposition Android : presentationDetents([.height(measured), .large]) + presentationDragIndicator -> ModalBottomSheet partiel/étendu ; AccessibilityFocusState -> accessibility focus via semantics + requestFocus.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameElementDetail.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameElementSheet.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameDetailCopy.swift`

</details>

### Je peux protéger ma Flamme avec des gels ou la rallumer, avec le prix et ce qui restera dits avant d'acheter

`game-flame-panel` · Android : **absente** · P1 · effort S

GameFlamePanelView (« Veiller sur ta Flamme ») : un gel couvre un jour manqué (2 en réserve au plus, 1 Meesh chacun) ; une Flamme éteinte se rallume sous 48 h, une fois par mois, pour 3 Meesh ; une Flamme trop longtemps éteinte ne propose rien et annonce qu'une nouvelle commence au prochain geste. Prix et bornes viennent du bloc game. Un bouton qui ne peut pas servir SE TAIT en disant pourquoi (réserve pleine, pas assez de Meesh, hors ligne) ; avant chaque achat, la rangée de dépense dit les Meesh en poche, le prix et ce qui restera ou ce qu'il manque. Miroir de game-flame-panel.tsx.

Écarts :
- FlamePanelCard avec états (en vie / en danger / éteinte rallumable / trop ancienne), boutons acheter un gel et rallumer, spinners par geste, erreurs.
- Rangées de dépense via GameSpend.preview(held, cost) et phrases « il manque » qui nomment le geste visé (spendMissingFreeze, spendMissingRelight).
- Raisons d'indisponibilité dites (réserve pleine, trop de Meesh manquantes, hors ligne) au lieu d'un bouton grisé muet.

Rendu : GameCard titre bodySize bold ; notes en muted ; boutons GameActionButton ; rangées de puces faits (GameFactChipRow) tinté flamme.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameFlamePanelView.swift`

</details>

### Mee et Meo choisissent le bon moment pour me parler, la même carte au même moment que sur les autres plateformes

`game-guide-laws` · Android : **absente** · P1 · effort M

Lois du guide : GameGuide (vague 1) choisit UN moment parmi douze (premier niveau, nouveau palier, missions débloquées, première frappe possible, première frappe, le prix monte, nouveau rang, palier du trésor, Flamme menacée, Flamme éteinte, retour après absence, niveau 100) et sept étapes d'intégration (bienvenue, premiers points, niveaux, missions, Flamme, Meesh, rang) avec locuteur (Mee/Meo), humeur et action ; GameGuideV2 prolonge sans toucher la vague 1 par huit moments (première ligue, ligue gagnée, ligue perdue, début/fin de saison, trophée, Prestige, tampon d'atlas) et `chooseMoment` choisit UNE carte par ouverture d'écran sur l'ensemble. La loi ne dit rien en toutes lettres : elle rend clé stable, locuteur, humeur, chiffres cités, étape d'après, et présentation COMPLÈTE (première fois) ou COURTE ensuite. Miroir de guide.ts / guide-v2.ts / photo-moments.ts.

Écarts :
- Porter GuideSpeaker/GuideMood/GuideAction/OnboardingStepKey(7)/OnboardingStep/GuideMomentKey(12)/GuideEvent/GuidePresentation et GameGuide.chooseMoment
- Porter GuideActionV2/GuideMomentKeyV2(8)/GuideEventV2/GuideMomentV2/GuideAnyEvent/GuideAnyMoment/PhotoMomentEmblemV2 et GameGuideV2.chooseMoment
- Tests sur game.vectors.json (guide, guide-v2) et badge-guide.vectors.json

Rendu : Aucun rendu direct ; le rendu des cartes est GameGuideCard (game#1).

Transposition Android : Lois pures :core:model.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGuide.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGuideV2.swift`

</details>

### Mee et Meo m'accueillent, me disent ce qui vient d'arriver et m'indiquent l'étape d'après, sans bulle

`game-guide-mee-meo` · Android : **absente** · P1 · effort M

Le guide est une carte à quatre temps (ce qui vient d'arriver, ce que ça veut dire, l'étape d'après, un bouton qui y mène), à côté de Mee et/ou Meo (films du pack de stickers, image fixe si les animations sont limitées ; un grand moment les montre ensemble). Version complète la première fois, UNE ligne les fois suivantes ; le bouton « ? » rouvre toujours la version complète ; « Plus tard » écarte ; pendant l'intégration : « Étape 3 sur 7 » et « Passer l'intégration » (les étapes restantes partent vues en UN envoi) ; certains moments proposent « Immortaliser » (photo). GameGuideEvents relève dans l'état : standing (à l'ouverture : découvertes dites une fois ; Flamme en danger, Flamme éteinte, retour après 7 jours dits à chaque ouverture) et transitions (palier franchi, frappe, badge éteint). GameGuideSession observe chaque lecture réglée, mémorise le dernier snapshot entre deux ouvertures (pour raconter une montée de ligue arrivée app fermée), marque les clés vues localement puis envoie POST /me/game/guide/seen avec un requestId. GameClock.dayKey et GameVisitStoring (dernier passage) servent le « content de te revoir ». GameGuideCopy habille 13 moments d'origine + vague 2 + 7 étapes d'intégration au tutoiement.

Écarts :
- Lois GameGuide / GameGuideV2 (chooseMoment, nextOnboardingStep, onboardingSteps, clés vues) miroirs de utils/game/guide.ts, et GuideCard (key, speaker, mood, copy, action, presentation, step, photo, wave2Page, photoMoment).
- GameGuideEvents.standing/transitions (urgences redites à chaque ouverture, découvertes une fois, absence 7 jours) et GameGuideEventsV2 (vague 2, snapshot entre deux ouvertures).
- GameGuideSession (StateFlow<GuideCard?>) : observe(game, settled), dismiss, skipAll, markSeen local + POST guide/seen ; stockage du dernier jour de visite et du snapshot (DataStore/Room).
- Carte Compose : Mee et/ou Meo à côté du texte à quatre temps, version courte/complète, bouton « ? », Passer, Immortaliser ; lecture TalkBack de la carte entière.
- Pack de stickers animés de Mee et Meo (films mee-sourire, meo-salut, mee-bonjour… ; absent côté Android) : l'afficher en image fixe sous animations réduites.
- Copy : ≈150 clés game.guide.* / game2.guide.* dans les 7 langues, nombres déjà formatés dans les phrases, tutoiement.

Rendu : Pas de bulle de conversation : le guide est à côté du texte. Mee à gauche, Meo retourné (miroir) à droite pour un grand moment ; ligne courte du héro dite par Mee dans le coin ; bouton d'action principal sous le texte.

Transposition Android : UserDefaults -> DataStore ; MeeStickerFilmView -> lecteur d'animation vectorielle/Lottie ; accessibilityReduceMotion -> animations réduites du système.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameGuideCard.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideCardView.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideCopy.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideEvents.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideSession.swift`

</details>

### Mee et Meo racontent ma montée de ligue, ma fin de saison, mon trophée ou mon tampon à l'ouverture suivante

`game-guide-wave2-events` · Android : **absente** · P1 · effort M

Relève des huit événements du guide vague 2 dans l'état du jeu (miroir de events-v2.ts). `standing` lit l'ÉTAT à l'ouverture : seules deux découvertes s'y lisent (première ligue, début d'une saison), chacune dite UNE fois tant que sa clé n'est pas vue. `between` compare deux INSTANTANÉS (GuideSnapshotV2 : prestige, ligue courante/semaine, saison, clés de trophées, langues de l'atlas) : montée, descente, trophée nouveau, nouveau tampon, Prestige — dits chaque fois, version complète la première fois, courte ensuite. L'instantané se garde sur l'appareil entre deux ouvertures par COMPTE (UserDefaults) : une montée de ligue arrive le dimanche soir et se raconte à l'ouverture SUIVANTE. Rien n'est inventé : une extension absente d'UNE des deux lectures ne produit aucune transition. Les moments se convertissent aussi en moments photo.

Écarts :
- GuideSnapshotV2 (Serializable) + GameGuideEventsV2.standing/between/transition
- GuideSnapshotStoring avec DataStore par compte (équivalent UserDefaultsGuideSnapshotStore)
- Textes des cartes guide vague 2 (GameGuideCopy extension) pour les 8 moments, courts/complets
- Conversion GuideMomentV2 -> PhotoMoment (game-photo-moments-catalog)
- Persistance de « vu » via POST /me/game/guide/seen (clés)

Rendu : Carte du guide avec Mee ou Meo (film), phrase du moment, action ; version courte = une ligne.

Transposition Android : UserDefaults -> DataStore Preferences (JSON de l'instantané par compte).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameGuideV2.swift`

</details>

### Les fiches Étincelles et Héritage s'ouvrent sur leur plus gros chiffre : ce que je possède

`game-heritage-sparks-heads` · Android : **absente** · P1 · effort M

GameSparksHeadModel (Ta lumière) : la poche en grand lue PAR SON NOM (sparkFacts.pocket), le « reçues depuis toujours » en petit, et l'Ombre (dette d'étincelles) en ligne qui passe AVANT tout. GameHeritageHeadModel (L'Héritage) : la dernière pièce frappée en emblème, le contenant en tête (« Ton Coffret », « Ta Bourse », « Ton Escarcelle », « Ton Coffre », « Ton Trésor », « Ta Réserve »), les Meesh gardées en grand, le contenant suivant (« le Coffre s'ouvre à 100 »), les frappées depuis toujours. GameHeritageHold retient le compte affiché pendant la cérémonie de frappe et le rattrape à la fin. GameFicheHead/GameSparksHeadView/GameHeritageHeadView/GameHeritageCoinView les rendent. GameFicheCopy porte les phrases (held, opens, minted, mintSentence, mintMissing, meeNextGold, meeNextPrism). Miroir de game-fiche-heads.tsx.

Écarts :
- Modèles GameSparksHeadModel et GameHeritageHeadModel (facts exposés dans l'ordre de lecture) et GameHeritageHold (shown(served, hold, settled)).
- Têtes Compose : nom en petit, chiffre en grand, deux tailles au plus ; emblème = dernière pièce frappée pour l'Héritage.
- Clés game.fiche.* pour les six contenants et leurs « s'ouvre à N » dans les 7 langues.
- Identités de fait pour dédoublonnage avec la fiche.

Rendu : Nom en petit au-dessus, chiffre en grand, puis le contenant suivant et le « depuis toujours » en petit ; l'Ombre en ligne d'avertissement en tête.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameFicheHeads.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameFicheCopy.swift`

</details>

### Quand j'ai masqué le jeu, une carte me le dit et me laisse le réafficher ou ouvrir les réglages

`game-hidden-card` · Android : **absente** · P1 · effort S

Carte « Jeu masqué » qui remplace le jeu sur l'appareil quand la personne l'a masqué : phrase, bouton « Réafficher » (dit aussi au serveur que le jeu revient `gameHidden=false` mais ne rouvre RIEN d'autre : les visibilités fermées restent fermées), porte vers les réglages. Les portes de la vague 2 (Ligue, Saison, Vitrine, Atlas, Prestige) sont des CARTES DE CONCEPT sur la première page de Progression ; ce fichier ne garde que cette carte.

Écarts :
- Composable GameHiddenCard (message, bouton réafficher, lien Réglages) affiché par l'écran Progression quand `prefs.hidden`
- Geste réafficher : prefs.hidden=false local immédiat + PUT /me/game/privacy {gameHidden:false} sans rien rouvrir
- Aucun point d'entrée du jeu (bandeau, bannière de profil, propositions de photo) ne doit s'afficher tant que hidden

Rendu : Carte unique, texte explicatif atténué, bouton principal brandPrimary ; ton calme, sans culpabilisation.

Transposition Android : Aucun équivalent plateforme particulier.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameDoorsView.swift`

</details>

### Je retrouve mes badges, défis et succès dans des pages dédiées, avec le compte en capsule de verre

`game-hub-sections` · Android : **absente** · P1 · effort M

ProgressionHub fournit les héros historiques (dernier succès — ou le prochain à défaut —, niveau, élans, flamme) utilisés quand le serveur ne sert pas le bloc game, et ProgressionSectionPage : les trois pages Badges / Défis / Succès dans le gabarit de page du jeu, avec le compte « fait / total » en capsule de verre teintée à droite du titre (brandPrimary, warning, success), le tirer-pour-rafraîchir, le lien « Comprendre les badges », les axes de badge par famille (ligne d'axe qui se touche + la SUITE des paliers), les succès (ligne qui rebondit et ouvre la célébration en grand en mode consultation, liseré de rareté si mesurée, « Jeu masqué » le retire) et les défis générés par section. ProgressionCopy fournit tous les mots : titres des ≈25 axes, ce que chacun compte (whatCounts), symboles, titres de famille, succès nommés et leur condition, titres de niveau, élans (facteur, familles, fenêtre), Meesh (solde, frappées, manque), série (jours, record, prochain jalon).

Écarts :
- Pages BadgesPage / DefisPage / SuccesPage (ProgressionSectionPage) avec capsule de compte, axes groupés par famille, succès cliquables, défis générés.
- Héros de repli : ProgressionLastAchievementHero (obtenu : balaie succès nommés ET paliers générés ; rien d'obtenu : prochain), LevelHero, ElansHero, FlammeHero, ProgressionWrap.
- ProgressionCopy complet (axes, familles, succès, niveau, élans, Meesh, série, étapes suivantes, date d'obtention) en 7 langues ; énumérations exhaustives pour que tout axe ajouté force un libellé.
- Ouverture de la célébration en mode consultation depuis une ligne de succès ; liseré de rareté lu dans game.wave2.achievementRarities.
- Rien d'équivalent côté Android : le profil n'affiche que nom + pourcentage de chaque succès.

Rendu : Capsule de compte : body bold, couleur de la section, verre teinté 18 %, padding md/xsPlus ; titres de famille en caption2 semibold majuscules ; cartes ProgressionCard par famille.

Transposition Android : fullScreenCover(item:) -> destination plein écran ; adaptiveGlass(Capsule) -> MeeshyGlassSurface.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProgressionHub.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProgressionCopy.swift`
- `apps/ios/Meeshy/Features/Main/Views/ProgressionComponents.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### Les tirages du jour (missions, coffre, Heure du Prisme) sont identiques à ceux du serveur, hors ligne compris

`game-law-day-seed` · Android : **absente** · P1 · effort S

Clé de jour AAAA-MM-JJ calculée dans le fuseau de l'utilisateur, graine FNV-1a 32 bits sur les octets UTF-8 de `userId\|jour\|sel`, générateur pseudo-aléatoire déterministe. Le serveur et les clients tirent donc les mêmes missions, le même coffre, la même Heure du Prisme ; aucune horloge ni aléa implicite.

Écarts :
- Porter GameDay.dayKey(timezone), GameSeed (FNV-1a 32 bits UTF-8) et GameRandom (suite déterministe) bit pour bit
- Tests sur day-prng dans game.vectors.json ; attention aux entiers non signés 32 bits (Long/UInt en Kotlin)

Rendu : Aucun rendu.

Transposition Android : java.time.ZoneId à la place de TimeZone/Calendar Swift ; arithmétique non signée via Long masqué ou UInt Kotlin.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameDay.swift`

</details>

### Le prix d'une Meesh, la poche d'étincelles et le trésor se calculent avant le geste, comme sur iOS

`game-law-meesh-mint-economy` · Android : **absente** · P1 · effort M

Prix(n) = round(1221 x 1,3^⌊(n-1)/10⌋) plafonné à 16 556 ; éditions Argent, Or (chaque centième) et Prisme (chaque millième) ; prévisualisation de frappe (GameMintPreview) rejouable hors ligne avec la poche d'étincelles (POCHE qui paie et fait le niveau, CYCLE et TOTAL À VIE indicatifs), facteur de coût du niveau actuel, pièce barrée si elle fait entrer dans une réserve du trésor que le rang n'ouvre pas, blocages (dette d'étincelles, niveau, rang). Trésor : six paliers de Meeshes gardées (Bourse 1, Escarcelle 10, Coffret 50, Coffre 100, Trésor 500, Réserve 1000). Prévisualisation de dépense/exigence (SpendPreview/RequirementPreview) montrée AVANT le geste : ce qu'on a, ce que ça coûte, ce qui restera ou ce qui manque.

Écarts :
- Porter GameMint (prix, MeeshEdition, displayEdition, GameMintLadder/GameMintLock/GameRankRequirement, GameMintPreview.Blocker)
- Porter GameSparks (MintBlock, Facts, Ledger) et previewSparksMint / treasuryReserveAccess / treasuryLockFor
- Porter GameSpend.preview/requirement (SpendPreview, RequirementPreview) et GameTreasury (TreasuryTierKey, TreasuryStanding.Next/Access)
- Tests rejoués cas pour cas sur sparks.vectors.json et game.vectors.json (sur divergence, le TS a raison)

Rendu : Les nombres sont formatés par la locale (séparateurs de milliers) ; l'accord singulier/pluriel se choisit sur l'entier, jamais sur un `== 1` isolé.

Transposition Android : Lois pures :core:model. La frappe elle-même (POST /me/meesh/mint) est portée par l'écran Meesh (game#1) et déclenche game-mint-ceremony-flow.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameMint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSparks.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSparksMint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSpend.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameTreasury.swift`

</details>

### Les missions du jour, leur minuteur, la Flamme et les boosts suivent les mêmes règles qu'iOS

`game-law-missions-flame-boosts` · Android : **absente** · P1 · effort M

Trois missions par jour (facile, moyenne, difficile ; la difficile devient mission d'Or dès le niveau 50 ou 50 Meeshes gardées) tirées de gabarits qui ne demandent qu'un geste que la passerelle crédite ; mission personnelle de deux heures pleines servie à côté. Minuteur de chaque carte (GameMissionClock : à venir, en cours avec temps restant, faite, Terminée, Manquée) jusqu'à la fin de plage — fin du jour de jeu = minuit dans le fuseau DU COMPTE (User.timezone, UTC par défaut), pas celui de l'appareil. Flamme à cinq formes (Braise 1 jour, Flamme 7, Brasier 30, Astre 100, Soleil 365), états allumée/menacée/couverte/éteinte, gels (1 Meesh, 2 en réserve), rallumage dans les 48 h. Boosts : Vent arrière x1,25 sur les étincelles quand le niveau est assez sous le record, Heure du Prisme (fenêtre en minutes locales) où les missions comptent double.

Écarts :
- Porter MissionTemplate/MissionSignal/DailyMissionDraw (tirage déterministe) et le catalogue de gabarits miroir de mission-catalog.ts
- Porter GameMissionClock.Phase + fin de jour dans le fuseau du compte (java.time.ZoneId)
- Porter FlameFormKey/FlameStatus/FlameTransition, refus de gel (FREEZE_AT_MAXIMUM) et de rallumage (RELIGHT_NOT_ALLOWED), fenêtre 48 h en jours calendaires
- Porter PrismHourWindow, Vent arrière (seuil d'écart au record #10896) et l'ancienne loi pour comptes sans étincelles
- Tests sur game.vectors.json (missions, flame, boosts) et clock

Rendu : Le compte à rebours est CALME (jours et heures, puis heures, puis minutes — jamais de secondes qui défilent).

Transposition Android : Lois pures dans :core:model ; le rafraîchissement du minuteur est fait par l'hôte (ticker lifecycle-aware), jamais par la loi.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameMissions.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameMissionClock.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameFlame.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameBoosts.swift`

</details>

### Je vois ma ligue de la semaine, ma place sur 30, la zone de promotion et le temps restant, ou je consens/quitte la ligue publique

`game-league-page` · Android : **absente** · P1 · effort M

Page Ligue (huit ligues Quartz à Prisme, groupes de 30, classement des points GAGNÉS dans la semaine, fermeture dimanche 20 h local) avec deux onglets « Ma ligue » / « Amis » (boutons 44 pt, haptique légère, sélection annoncée). Quatre états servis par `access` : verrouillée (niveau record 10 requis, ligne d'exigence), fermée aux mineurs, consentement requis, ouverte. Consentement (RGPD) : notice COMPLÈTE avant le geste (ce qui est montré, à qui, comment on est placé, le risque, comment se retirer), pseudonyme tiré au sort par le serveur (le choix est fermé par conformité A-5), bouton « Accepter » désactivé hors ligne. Carte « place » : gemme de ligue 64 pt qui SE TOUCHE (rebond + précisions), nom, « n sur 30 », zone colorée (promotion vert, maintien atténué, relégation rouge) + points manquants, compte à rebours rafraîchi chaque minute. Classement SOUS PSEUDONYMES figé à 4 h (seule la ligne `isMe` est en direct, l'écran le dit) : en-têtes de zone en capitales, lignes >= 44 pt, ligne de moi surlignée, coupe éventuelle, liseré de zone, libellé VoiceOver complet. Carte compte : pseudonyme, « Quitter la ligue » destructif (consentement retirable aussi simplement qu'il se donne, efface le classement du disque). Onglet Amis : ligue entre amis acceptés (seul endroit avec des noms ; « Un ami » si inconnu). La mission en duo s'affiche sous l'onglet. Ouverture sur une semaine passée par lien (archive).

Écarts :
- Porter GameLeague (LeagueKey 8 ligues, zones, coupes, LeagueMoment/semaine par lundi local, répartition déterministe des groupes de 30, gains, LeagueAccess, validation de pseudonyme, prochaine fermeture) + tests league dans game.vectors.json
- Écran Ligue avec onglets, 4 états d'accès, carte de consentement (notice 5 lignes + pseudo tiré au sort + accepter), carte place, classement, carte compte, ligue Amis
- Squelette 5 lignes (3 pour Amis) sur cache vide, bloc de relance sur échec sans valeur, notes « classement figé à 4 h »
- Gemme de ligue (LeagueGemView) et coupe (TrophyView) en Composables Canvas — voir game#1/UI
- Précisions d'élément au toucher (GameElementDetails.leagueGem / player) avec rebond
- Compte à rebours rafraîchi toutes les 60 s (ticker lifecycle-aware)
- Libellés d'accessibilité complets par ligne (rang, nom, moi, zone, coupe, points) ; ligne = élément unique
- Interdits de conformité : aucun avatar, drapeau ni langue sur les lignes ; vider le cache disque du classement à la sortie de ligue

Rendu : Couleurs sémantiques MeeshyColors.success/error + atténué pour les zones ; ligne isMe fond brandPrimary 12 %, rayon sm ; liseré vertical 3 dp de la couleur de zone à gauche (à droite en RTL) ; en-têtes de zone footnote semibold en capitales ; ligne >= 44 dp.

Transposition Android : TabBar maison de deux boutons -> Row de deux boutons toggle (pas TabRow Material pour garder le rendu) ; TimelineView.periodic(60) -> produceState + delay ; LazyVStack -> Column (liste <= 30 lignes) ou LazyColumn.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameLeagueViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameLeague.swift`

</details>

### Frapper une Meesh ouvre une cérémonie plein écran qui se referme seule ; la réponse du serveur arrive pendant que la scène se joue

`game-mint-ceremony-flow` · Android : **absente** · P1 · effort M

Présentation et pilotage de la cérémonie (#11177) : l'écran qui frappe pose `request` au toucher, la cérémonie s'ouvre aussitôt en plein écran SANS animation de présentation (elle fait elle-même son fondu d'ouverture, l'écran du dessous transparaît) et se referme d'elle-même à la fin, ou au toucher. La réponse de la passerelle (pièce frappée, déjà frappée par la même intention, ou refus et son code ; NETWORK quand le réseau ne l'a pas portée) lui parvient pendant le tissage : l'attente se cache dans le geste, jamais dans un indicateur de chargement. MintCeremonyRun : horloge, plan live (tant que la passerelle n'a pas répondu les coups restent levés ; passé un délai la lumière revient), gouverneur de rendu (4 images lentes au-delà de 1/60,5 s => ne peindre qu'un fil et un grain sur deux), appareil modeste (<= 4 coeurs ou mode économie d'énergie) = moitié moins de particules, vibrations planifiées à chaque impact (le dernier plus fort, un coup passé de plus de 0,25 s ne vibre plus), `skip()` applique l'état final d'un coup. Loi partagée GameMintCeremony (miroir de mint-ceremony.ts rejoué sur mint-ceremony.vectors.json) : instants en ms depuis le toucher (ouverture 0-400, émission 350-1400, tresse 350-2200, resserrement 2000-2550, poussière 2200-2900, flan 3300-3800, descente 3800-4200, enclume, marteau prêt à 4800), 3 modes (normal, réduit, refus), coups par édition (argent 1, or 3, prisme 3), refus (ombre, locked, light, offline, other) qui REMONTE le temps jusqu'au départ des étincelles, budget 4 500 particules.

Écarts :
- Porter GameMintCeremony (MintCeremonyMode, Span, Phase, Hitter, Strike, DustMaterial, Dust, Particles, MintRefusalReason, plan normal/refused/reduced, strikeReadyMs=4800, particleBudget=4500) + tests mint-ceremony.vectors.json
- MintCeremonyRun (ViewModel) : edition/look/number, answer (minted/already-minted/insufficient/NETWORK), plan live, timers de haptique, stride 2 après 4 images lentes, appareil modeste, give-up de passerelle muette, skip/finish
- Hôte plein écran : Dialog(usePlatformDefaultWidth=false) ou destination sans animation, fond transparent pour voir l'écran dessous, barre d'état masquée (WindowInsetsController)
- Mapping des réponses serveur vers MintRefusalReason (INSUFFICIENT_POINTS, TREASURY_LOCKED, MINT_BLOCKED_BY_DEBT, PRICE_CHANGED, NETWORK…) ; relancer la frappe avec requestId stable
- Mode réduit (reduceMotion) = fondu 260 ms puis maintien 2,6 s ; toucher partout (zones sûres comprises) passe la scène

Rendu : Aucun indicateur d'attente ; mot « Toucher pour passer » en coin bas (11 pt, teinte discrète de l'édition) ; un seul élément pour TalkBack qui dit la phrase de Mee (« La n° N rejoint ton Héritage. » / « est d'or. Tes aïeux l'ont vue. » / « est de prisme : toutes les langues y brillent. ») ou le refus.

Transposition Android : fullScreenCover(item:) sans animation -> Dialog plein écran / route NavHost sans transition ; presentationBackground(.clear) -> Window flags translucides ; ProcessInfo.isLowPowerModeEnabled -> PowerManager.isPowerSaveMode ; processorCount -> Runtime.availableProcessors().

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyCover.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyRun.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameMintCeremony.swift`

</details>

### La frappe d'une Meesh se joue en scène : des milliers d'étincelles tissent un cercle, Mee et Meo forgent la pièce et la frappent

`game-mint-ceremony-scene` · Android : **absente** · P1 · effort L

Scène plein écran image par image (#11177, épopée § 7) sur un repère 360 x 640 mis à l'échelle sans déformation : fond « forge de nuit » (dégradé radial), ~2 600 étincelles qui quittent « ta lumière » et tissent le cercle en deux brins croisés, poussières que Mee et Meo y sèment (argent et un peu d'or ; or pur ; or et diamant), flan qui se fige et descend sur l'enclume, Mee pose le coin, Meo lève le marteau (gardé levé tant que la passerelle n'a pas répondu), puis la frappe arrive EN DERNIER : gravure sous le marteau, secousse (shake), onde/anneau, rayons, pièce qui se lève et montre son revers numéroté, Mee et Meo la fêtent, la pièce file dans l'Héritage, « +N de gloire », « TCHAK ! », aïeux (or : « chaque centième pièce porte leur lumière », prisme : « chaque millième pièce réunit toutes les langues »). Au refus, une Ombre voile le cercle et les étincelles reviennent à ta lumière par le chemin pris ; Mee dit ce qui bloque. Particules tirées UNE fois par frappe depuis le numéro de la pièce (générateur mulberry32 de la maquette) : la même pièce tisse le même cercle sur web et iOS ; rendu groupé par couleur et palier d'opacité (lots peints d'un seul trait) dans UN Canvas. Palette par édition (argent/or/prisme/diamant). Miroir de apps/web/src/lib/game/choreography-mint-ceremony.ts et components/game/mint-ceremony.tsx, nombre pour nombre.

Écarts :
- Porter MintCeremonyChoreography (MintCeremonyPlan -> Frame : acteurs, marteaux (angles repos/levé/impact), coin/die, glow, ring, tchak, rays, shadow, glory, shake, backdrop ; refus qui remonte le temps via sceneTime)
- Porter MintCeremonyParticles : générateur mulberry32 seedé par le numéro de pièce, Weave/Grain/Spark/Puff, batching par couleur x palier d'opacité (MintCeremonyBatch), stride 1/2 — tests de déterminisme contre les vecteurs web
- Couche de rendu Compose : Canvas unique pour les particules (drawRect/drawCircle par lot, éventuellement drawPoints), couches marteau/rayons/acteurs/pièce (avers/revers), mise à l'échelle MintCeremonyFit (k, offsets), polices de scène proportionnelles
- Palette MintCeremonyPalette (bg, orb, weave, glow, iris, argent, or, diamant, acier, enclume, bois) ; textes `game.frappe.*` localisés
- Mee et Meo en images fixes/films de la scène (assets à porter, absents sur Android)
- Layout forcé LTR dans la scène ; accessibilité : scène = UN élément, phrase de Mee, action passer
- Budget de performance : 60 fps sur appareil milieu de gamme avec 4 500 particules max, stride automatique, moitié moins sur appareil modeste ; profil sur appareil réel

Rendu : Scène sombre type forge, étincelles dorées/blanches, cercle en tresse à deux brins, ombre au refus, flash blanc + anneau doré à l'impact, rayons dorés 55 %, secousse courte ; texte de scène à échelle k ; fond radial 0,5/0,45 de rayon 0,62 x la plus grande dimension.

Transposition Android : TimelineView(.animation)+Canvas SwiftUI -> Canvas Compose piloté par withFrameNanos ; shaders Metal -> AGSL (API 33+) pour la pièce, repli en dégradés ; GeometryReader -> BoxWithConstraints.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyChoreography.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyLayers.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyParticles.swift`
- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintCeremonyScene.swift`

</details>

### Mon niveau, mes Meesh, mon rang, ma ligue et ma Flamme s'affichent en bandeau en haut à l'ouverture de l'app

`game-player-banner` · Android : **absente** · P1 · effort M

PlayerBannerView (brique) dessine le bandeau du haut quand ni un appel ni un audio ne l'occupe : ordre FIXE de gauche à droite — anneau de niveau (avec emblème du palier et chiffre romain), jauge vers le niveau suivant, Meesh, blason du rang, gemme de ligue et place, Flamme ; SEULEMENT ce qui existe (GamePlayerBanner) ; la Signature en filigrane teintée par le palier, un aplat repris à l'identique par la bande de la barre d'état, la bannière de profil du joueur en translucide derrière. Hauteur d'au moins 48 pt ; au-delà de XXL en Dynamic Type la jauge passe SOUS l'anneau et les pièces se rangent en grille ; un seul élément pour le lecteur d'écran (« Niveau 34, Éclat, 78 % vers le 35, 12 Meeshes, Conteur III, ligue Jade 4e, Flamme 23 jours »). PlayerBannerHost/PlayerBannerStore orchestre : lecture CACHE D'ABORD (un cache vide ne peint rien), revalidation silencieuse (intervalle min 45 s), réglage « Jeu masqué » du COMPTE relu toutes les 5 minutes (aucune bannière ni requête quand masqué), elle ne PARAÎT qu'à l'ouverture de l'app (30 s, puis s'en va lentement en remontant 1 s ; fondu simple si animations réduites), revient si l'app a été absente longtemps, reflet qui traverse l'anneau à un franchissement de niveau, un toucher ouvre Progression. PlayerBannerPlacement décide où elle a la place (pas sur les routes profondes ni dans les reels ; règle tablette). PlayerBannerCopy fournit phrases courtes et libellé a11y ; PlayerBannerStyle les couleurs (teinte du palier 26 % en sombre, 16 % en clair).

Écarts :
- GamePlayerBanner.make(game) (showsLevel, showsScore, pieces, rank, league, flame, mission, season, trophies) en loi pure miroir de player-banner.ts / top-band.ts.
- PlayerBannerView Compose : disposition fixe, jauge, anneau, blason, gemme, Flamme, filigrane Signature, fond aplat identique à la bande de statut (Edge-to-edge), bannière de profil translucide ; hauteur >= 48 dp ; grille en police agrandie.
- PlayerBannerStore : cache d'abord, revalidation >= 45 s, réglage Jeu masqué du compte (5 min), fenêtre d'ouverture 30 s + sortie lente 1 s, retour après absence (ProcessLifecycleOwner).
- Placement : pas sur routes profondes ni reels ; arbitrage avec la bande d'appel/audio ; variante tablette.
- Mouvement : entrée/sortie à la manière des barres du haut (glisse ; sans glisser si animations réduites) et reflet de franchissement de niveau.
- Libellé TalkBack composé (niveau, palier, pourcentage, Meesh, rang, ligue, Flamme) ; phrases courtes game2.banner.* en 7 langues.
- Le NotificationBannerHost existant d'Android est une bannière de notification, pas le bandeau du joueur.

Rendu : Fond = aplat teinté par la couleur du palier (26 % sombre / 16 % clair) mélangé à la surface ; Signature en filigrane ; hauteur >= 48 dp ; anneau 56 dp (66/56 de hauteur si étoiles de prestige) ; chiffres qui roulent ; sortie : remontée lente 1 s.

Transposition Android : UIApplication.didEnterBackground/didBecomeActive -> ProcessLifecycleOwner ; couleur d'aplat de la bande d'état -> couleur de la barre d'état (enableEdgeToEdge) ; Dynamic Type -> fontScale.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/PlayerBannerView.swift`
- `apps/ios/Meeshy/Features/Main/Game/PlayerBannerHost.swift`
- `apps/ios/Meeshy/Features/Main/Game/PlayerBannerCopy.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerHost.kt`

### Le bandeau du joueur en haut de l'app ne montre que ce qui existe, s'ouvre au démarrage 30 secondes puis s'efface

`game-player-banner-model` · Android : **absente** · P1 · effort S

Modèle du bandeau (conception XIII.1, miroir de playerBannerModel web) quand ni un appel ni un audio ne l'occupe, ordre FIXE gauche->droite : anneau de niveau, jauge vers le niveau suivant, Meeshes, blason du rang, gemme de ligue + place, Flamme (plus pièces trophées, mission du jour, saison). SEULEMENT CE QUI EXISTE : élément sans donnée = nil, jamais zéro/tiret/case vide ; un joueur qui n'a rien fait n'a PAS de bandeau (détail du niveau au niveau 2, total de points au premier point, trésor à la première Meesh, rang à la première Gloire…). Chaque pièce ouvre la fiche de son concept (niveau, étincelles, Meesh, Gloire, ligue, Flamme, vitrine, missions, saison). Ouverture (#9536) : le bandeau s'ouvre avec l'app (démarrage à froid ou retour au premier plan après une VRAIE absence >= 5 min), reste 30 s puis sort lentement vers le haut (1,0 s) ; changer d'onglet ou ouvrir un fil ne le rouvre pas ; une horloge qui recule ne le prolonge pas. Machine d'état pure sur des dates (appWentAway/appCameBack/remaining/isOpen). Constantes identiques au web.

Écarts :
- Porter GamePlayerBanner (Rank, League, Flame, DailyMission, Season, Piece -> concept, init(game:)) + règles d'apparition progressive, tests player-banner
- Porter GamePlayerBannerOpening (lingers=30, exitDuration=1, realAbsence=300) et le brancher sur le cycle de vie process (ProcessLifecycleOwner ON_STOP/ON_START)
- L'hôte visuel (PlayerBannerHost, game#1) : bandeau sous la barre d'état, fondu/glissement vers le haut sur 1 s, ne gêne pas les écrans d'appel/audio

Rendu : Bandeau compact en haut, pièces dans l'ordre fixe, séparateur « · » pour les libellés ; sortie lente vers le haut (0,8 à 1,2 s).

Transposition Android : scenePhase/willEnterForeground -> ProcessLifecycleOwner + LifecycleEventObserver ; minuteur -> délai coroutine borné par remaining().

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePlayerBanner.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePlayerBannerOpening.swift`

</details>

### Au niveau 100 je peux passer en Prestige après une confirmation claire de ce qui repart et de ce qui reste

`game-prestige-page` · Android : **absente** · P1 · effort M

Page Prestige : scène (anneau de niveau + trophée de Prestige) et compteur d'étoiles « n / 5 ». Fermé sous le niveau 100 (dit où l'on en est, combien de niveaux manquent, ligne d'exigence) ; au maximum (5 étoiles) il le fête sans rien proposer. Proposition : Mee et Meo expliquent (films mee-sourire / meo-salut), bouton « Passer en Prestige » qui OUVRE UNE CONFIRMATION (aucun passage sans confirmation) : valeurs avant -> après (points en poche, niveau, record, étoiles, Gloire +N), ce qui reste (trésor, Gloire, rang, badges, Flamme), la perte d'accès à la ligue (10) et au duo (20) parce que le niveau record repart à 1 (conformité G-5) et le consentement à la ligue qui reste enregistré ; boutons « Passer » / « Rester au sommet ». Geste optimiste (le niveau repart tout de suite) avec retour arrière et message d'erreur ; haptique de succès. Chorégraphie du passage : l'anneau se vide (1,0 s ease-in-out), le trophée tombe de 60 pt (ressort 0,6 s, délai 0,5 s), l'étoile s'allume ; sous « réduire les animations » un simple fondu 0,4 s.

Écarts :
- Porter GamePrestige.transition (PrestigePassage avant -> après, PrestigeRefusal, PrestigeTransition) + tests prestige
- Écran Prestige : résumé + scène, carte de proposition avec Mee/Meo, bloc de confirmation (valeurs avant->après en pastilles GameFactChipRow, lignes de conformité), erreurs
- Scène animée (Animatable) : vidage de l'anneau, chute du trophée avec ressort, allumage d'étoile ; variante fondu si réduction des animations
- Films des guides Mee/Meo (mee-sourire, meo-salut) : pack de stickers/animations à porter (absent côté Android)
- Haptique de succès au passage ; état busy du bouton ; désactivation hors ligne ; ouverture des précisions de la prochaine étoile au toucher de la scène

Rendu : Scène : anneau 88 dp (104 avec étoiles) à gauche, trophée 88 dp à droite aligné en bas ; bloc de confirmation fond atténué 8 %, rayon md ; Mee à gauche/Meo miroir à droite, 64 dp.

Transposition Android : withAnimation spring -> animateFloatAsState/Animatable avec spring(dampingRatio 0.6) ; MeeStickerFilmView -> lecteur d'animation (Lottie/AnimatedImageDrawable/WebP animé) — dépendance à décider.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GamePrestigeViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePrestige.swift`

</details>

### Sur la bannière d'un profil je vois le niveau, les étincelles, la Gloire et le rang du membre, selon ses réglages

`game-profile-banner-badge` · Android : **absente** · P1 · effort M

Deux groupes aux deux angles BAS de la bannière de fiche (précision porteur 2026-10-11/14/16/19) : au DÉBUT (gauche, droite en RTL) le nom du palier, le cercle de niveau (progression, prestige) et les étincelles en grand (« ✦ 18 347 ») ; à la FIN la Gloire (« ♛ 18 790 »), le blason du rang, son nom et sa division (« Murmure V »). Chaque groupe sur un voile léger (24 %, sans flou), collé à son bord, SEUL le coin haut tourné vers le milieu est arrondi (coins physiques relus selon le sens de lecture, le RTL ne les inverse pas seul), même largeur ET même hauteur, s'arrête avant l'avatar (106 pt réservés au centre) ; texte blanc avec ombre portée, taille de texte bornée à XXL, scheme sombre forcé. Lecture cache-first (disque puis réseau) de GET /users/:id/game : le serveur sert niveau et rang selon le réglage `rank` du membre, les points seulement à soi et aux amis (#9541) ; rien servi (réglage fermé, blocage, jeu masqué, compte inconnu) => rien dessiné, un refus ne se distingue pas d'une absence. La Flamme n'est JAMAIS montrée sur une fiche. Cercle plein si la poche ne porte pas le niveau servi (plutôt que mentir). Libellés VoiceOver composés (niveau, palier, record, étincelles ; rang, division, Gloire). Jamais affiché si le jeu est masqué sur l'appareil.

Écarts :
- GameBannerBadgeModel.of(standing) : niveau, palier, prestige, rang, division, mythique, poche (sparks ?? points), gloire (>0), record de niveau, levelProgress (plein si poche != niveau servi)
- Composable GameBannerBadge dans la bannière de ProfileScreen (feature/profile) : deux groupes vitrés aux angles bas, coins arrondis physiques selon LayoutDirection, largeur de groupe = (largeur bannière - 106 dp) / 2, texte blanc + ombre, fontScale borné
- Chargement cache-first avec annulation (tâche liée à userId, jamais d'écrasement par un membre précédent), transition fondu 0,2 s
- Glyphes de monnaie ✦ (étincelles) et ♛ (Gloire) + libellés d'accessibilité composés
- LevelRingView et RankBlasonView en Composables (game#1/UI) — dépendances

Rendu : Verre : fond noir 24 % sans blur ; colonne = nom de palier (caption 92 %), cercle 36 dp (hauteur x 66/56 si prestige), montant bodySize bold monospaced digits ; rang : montant, blason 40 x 37 dp, nom footnote semibold ; ombre de texte pour bannière claire ; rayon md sur le seul coin haut côté milieu.

Transposition Android : UIRectCorner physiques -> RoundedCornerShape(topStart/topEnd) résolus selon LayoutDirection (en Compose les coins start/end s'inversent déjà : choisir les coins PHYSIQUES pour l'iso) ; ZStack + ancre invisible -> Box ; dynamicTypeSize(...xxLarge) -> clamp de fontScale via LocalDensity.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameBannerBadge.swift`

</details>

### Le profil propose une rangée « Progression — Badges, niveau et série » qui mène au jeu

`game-profile-entry` · Android : **absente** · P1 · effort S

ProfileProgressionEntry : une rangée à la même surface que les lignes de réglages, icône trophée sur un carré arrondi de 28 pt teinté ambre à 12 %, titre « Progression » et sous-titre « Badges, niveau et série », haptique légère au toucher. La navigation est injectée : le profil décide de la route.

Écarts :
- Ajouter la rangée au ProfileScreen (section de stats existante) avec icône trophée, tint warning à 12 %, titre/sous-titre localisés et navigation injectée vers ProgressionScreen.
- Haptique légère au toucher et cible tactile 48 dp.

Rendu : Carré 28 dp rayon sm teinte warning 12 %, icône trophée au centre ; titre labelSize semibold ; sous-titre footnote muted ; chevron à droite.

Transposition Android : HapticFeedback.light -> HapticFeedbackType.TextHandleMove / CONTEXT_CLICK.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ProfileProgressionEntry.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### L'écu d'un rang se dessine à l'identique : géométrie des pièces, divisions, halo et perles du Mythe

`game-rank-crest-geometry` · Android : **absente** · P1 · effort S

Table de géométrie du blason (cadre 200 x 184, l'écu occupe x 64-136 / y 36-119, pointe en (100,119)) : pièces cubiques, teintes (CrestTone), encoches de division, halo et perles du Mythe, angles en degrés depuis midi sens horaire. Une TABLE, pas du dessin : iOS la peint via RankBlasonView (MeeshyUI), le web en SVG.

Écarts :
- Porter CrestPiece/CrestCubic/CrestTone/BlasonViewport/DivisionNotch/MythicHalo (Point, Bead) en données pures dans :core:model (miroir de rank-crest.ts)
- Composable RankBlason (Canvas, Path.cubicTo) consommant la table, avec matière du rang (dégradés métal) et Signature gravée pour le Mythe — dans :sdk-ui
- Test de non-régression sur les coordonnées (mêmes nombres que le web)

Rendu : L'écu est décoratif (le texte dit le rang) ; il porte les tenants Mee et Meo de part et d'autre dans la version célébrée (voir game-rank-blason-rise).

Transposition Android : RankBlasonView SwiftUI -> Canvas Compose avec androidx.compose.ui.graphics.Path ; AGSL optionnel pour le reflet (API 33+).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameRankCrest.swift`

</details>

### Chaque succès dit sa rareté en toutes lettres (« Épique · 4 % des comptes ») et chaque badge a sa matière à sept paliers

`game-rarity-line-and-badge-tiers` · Android : **absente** · P1 · effort S

Ligne de rareté d'un succès : « Épique · 4 % des comptes » quand la rareté a le droit de se montrer (20 titulaires et 1 000 comptes minimum), « Rareté en cours de mesure » sous le seuil, RIEN quand le serveur ne sert aucune entrée. Client FAIL-CLOSED (G-2) : une entrée sans comptes ou sans rareté mesurée ne montre rien de plus. Le nom est lu en toutes lettres (la couleur du liseré n'est jamais seule) ; l'encre est paramétrable pour les surfaces sombres fixes (carte indigo de célébration, contraste AA). Loi miroir de rarity.ts / badge-tiers.ts : cinq raretés (commun > 40 %, rare 10-40 %, épique 2-10 %, légendaire, mythique) avec liseré (ardoise, bleu, violet…) et Gloire (10/25/60…), badges à SEPT matières (cuivre, bronze, argent, or, platine, obsidienne, prisme), empreinte du badge éteint.

Écarts :
- Porter GameRarity (RarityBorder, parts, seuils d'affichage), GameBadgeTiers (BadgeMaterialKey 7 matières, BadgeMaterial, BadgeImprint) + tests rarity/badge-tiers
- Composable GameRarityLine(entry, ink?) fail-closed
- Intégrer la ligne dans les cartes de succès/badges (game#1) et dans la carte de célébration

Rendu : Ligne footnote semibold ; couleur discrète du thème par défaut, encre claire imposée sur surface sombre fixe.

Transposition Android : Aucun équivalent plateforme particulier.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameRarityViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameRarity.swift`

</details>

### Le carnet « Comment ça marche » explique toutes les règles du jeu avec les mêmes dessins que l'app

`game-rules-book` · Android : **absente** · P1 · effort M

GameRulesPage : page qui EXPLIQUE, sans geste, hors ligne comme en ligne : intro de Mee et Meo (« Huit règles, et tout le jeu tient dedans »), « Les règles en une page » (liste numérotée), « Chaque concept, en clair » (glossaire : aucun concept de Progression n'est absent), la section « Comprendre les badges » (matières, seuils, ruban, empreinte, vingt badges par famille), l'atlas illustré, puis « Les sept étapes » de l'intégration en entier. L'atlas (GameRulesAtlas/GameRulesAtlasView) dessine neuf familles : paliers (dix, avec plafonds de niveau), pièce (avers/revers, trois éditions), trésor (paliers de contenants), rangs (onze blasons), Flammes (cinq), ligues (huit), médailles, trophées, raretés ; chaque famille s'ouvre par Mee ou Meo qui disent UNE ligne, puis une grille adaptative des objets avec les mêmes briques que partout. focusedRule : la page s'ouvre sur la règle visée (scroll animé 0,35 s, teinte 14 % pendant 1,6 s) ; focusedSection : sur la section badges.

Écarts :
- Page RulesScreen(focusedRule, focusedSection) avec scroll vers la règle (ancre 18 % du haut), surbrillance temporaire, sections identifiées.
- GameRulesAtlas : modèle des neuf familles, bandes de plafond de niveau, plaques de pièce, matériaux de médaille, formes, plaques de trophée, bordures et gloire par rareté ; GameAtlasCopy (titres, lignes, noms).
- GameRulesAtlasView : grille adaptative (une colonne de moins en police agrandie), cellules avec briques réelles (anneau, pièce, blason, flamme, gemme, médaille, coupe, liseré).
- Règles (GameGuideCopy.rules, 8), glossaire (GameRulesGlossaryKey/extras) et section badges (GameRulesBadges, GameBadgeGuideFamily).
- Les sept cartes d'intégration en entier avec figures de Mee et Meo.
- Aucune requête réseau : ouverture instantanée.

Rendu : Numéros en cercle 32 dp brandPrimary 16 %, titre bodySize bold, corps muted ; la règle visée prend un fond brandPrimary 14 % qui s'estompe en 0,4 s ; grille avec légendes qui passent à la ligne.

Transposition Android : ScrollViewReader.scrollTo -> LazyListState.animateScrollToItem / ScrollState.animateScrollTo ; adaptive grid -> LazyVerticalGrid(GridCells.Adaptive).

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameRulesView.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameRulesAtlas.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameRulesAtlasView.swift`
- `apps/ios/Meeshy/Features/Main/Game/GameGuideCopy.swift`

</details>

### Je suis ma saison de huit semaines : quarante étapes gratuites à réclamer et un Sceau cosmétique

`game-season-page` · Android : **absente** · P1 · effort M

Page Saison : en-tête (« Saison n, semaine k/8 », thème = une langue, étoiles + étapes n/40 + barre de progression, « complétée » ou étoiles avant la prochaine étape ; 4 étoiles ouvrent une étape, étoiles des missions du jour et du duo). Parcours : bouton « Réclamer l'étape n · récompense » pour la prochaine, puis grille 5 colonnes des 40 étapes (boutons 44 pt) dont l'état est DIT par texte et couleur (réclamée ✓ vert, à réclamer teinte brand + réclamation au toucher, à venir éteinte ; marques ◆ fragment, ✦ gel, ★ coupe de saison) ; une étape non réclamable ouvre ses précisions. Rangée Sceau (10 Meeshes, cosmétique SANS avantage de jeu, un par quatre étapes = 10 pastilles sur deux rangées de cinq, allumées si possédé ET atteint) avec aperçu de dépense (en poche / prix / restera ou manque) et bouton d'achat. États : saison à venir (« la saison n commence le … », thème, règle), saison ouverte sans parcours en cache (hors ligne le jour d'ouverture), aucune saison ouverte (une valeur, pas une panne). Repeinte à chaque fermeture de semaine (dimanche 20 h local) via un TimelineSchedule. Rien n'y rapporte d'argent (conformité C-1).

Écarts :
- Porter GameSeason (SeasonCalendar, SeasonProgress, SeasonReward/Kind, SeasonSeal, refus de réclamation/de Sceau, liveTense, starsPerStep=4, steps=40, weeks=8, sealEvery=4) + tests season
- Écran Saison : en-tête, parcours (grille 5 colonnes, états claimed/ready/locked, marques ◆ ✦ ★ ✓), bouton « réclamer la prochaine », rangée Sceau + aperçu de dépense + achat, cartes à venir / ouverte sans parcours / aucune saison
- Réclamation optimiste (claimingStep) avec rebond GameBounce et haptique légère ; étape verrouillée -> précisions
- Bascule à l'horloge locale : repeindre la page à chaque dimanche 20 h (flow d'instants) pour la transition à venir -> ouverte hors ligne
- Accessibilité : libellé « Étape n, état, récompense » ; état jamais porté par la seule couleur
- Signature gravée (SignatureMark) pour les pastilles de Sceau — voir game#1/UI

Rendu : Étape : carré rayon sm 44 dp, numéro bodySize bold + marque captionSize dessous ; prête = fond brand 12-20 % + liseré brand ; réclamée = vert ; à venir = transparent + liseré atténué. Sceau : médaillon or (dégradé matière or) quand allumé, plat atténué sinon.

Transposition Android : LazyVGrid(5 colonnes flexibles) -> LazyVerticalGrid(GridCells.Fixed(5)) ou FlowRow ; TimelineSchedule -> Flow<Instant> calé sur la prochaine fermeture de semaine.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameSeasonViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSeason.swift`

</details>

### Le calendrier des saisons est disponible hors ligne et se met à jour sans retélécharger quand rien n'a changé

`game-season-schedule-sync` · Android : **absente** · P1 · effort M

Loi de LECTURE du calendrier servi (GET /me/game/seasons/calendar -> {revision, seasons}, en-tête ETag `season-schedule-<revision>`) : une définition par saison programmée (numéro, lundi d'ouverture, statut, thème, points d'étape bornés, textes en sept langues). Ce qui n'est pas défini se DÉRIVE de GameSeason (saison 1 le lundi 2026-12-21, saisons de 56 jours, thème qui tourne). Lecture CONDITIONNELLE (If-None-Match, 304 garde la copie), copie disque (Caches) avec révision + ETag qui survit au redémarrage ; sans réseau ni copie : SeasonSchedule.default (jamais vide, jamais une erreur). Même calendrier pour tous : rien à purger à la déconnexion.

Écarts :
- Porter SeasonSchedule/SeasonDefinition/SeasonCopy/SeasonDefinitionStatus et la dérivation (ancre, 56 jours, rotation de thème) + tests season-schedule
- Store avec Retrofit conditionnel (If-None-Match / 304) et copie disque (revision + ETag), refresh Succeeded/NotModified/Failed
- Défaut embarqué (SeasonSchedule.default == constante GameSeason) quand rien n'est lu
- Exposer le calendrier au modèle de gestes (loadSeasonSchedule) sans bloquer l'ouverture du jeu

Rendu : Aucun rendu direct ; le thème et les dates alimentent la page Saison.

Transposition Android : URLSession + ETag -> OkHttp (Cache-Control/If-None-Match explicite ou intercepteur) ; actor -> Mutex ; Caches -> cacheDir.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSeasonSchedule.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameSeasonScheduleStore.swift`

</details>

### Je règle ce que le jeu me montre et montre aux autres : célébrations, jeu masqué, notifications, qui voit quoi, ligues

`game-settings-page` · Android : **absente** · P1 · effort S

Un seul écran de réglages : (1) Célébrations de Mee et Meo (interrupteur d'appareil ; coupe aussi les propositions de photo), (2) « Jeu masqué » — geste COMPOSÉ qui masque le jeu sur l'appareil ET sort le compte des classements, vitrines et listes (vitrine retombe à « moi seul », conformité A-7/D-2) ; le réafficher ne rouvre RIEN d'autre (dit en toutes lettres) ; désactivé hors ligne tant qu'il n'est pas masqué, (3) Notifications du jeu (préférence `notification.gameEnabled`, activée par défaut, appliquée tout de suite et envoyée en arrière-plan), (4) Qui voit quoi : rang, trésor, vitrine, Atlas (valeurs par défaut les plus fermées : amis ; Atlas moi seul), (5) Ligue publique (état + « Quitter la ligue »), (6) Opposition à la ligue entre amis. Et le carnet des règles.

Écarts :
- Écran Réglages du jeu avec les 6 cartes et GameSwitchRow / GameVisibilityPicker
- Ajouter la préférence de notification `gameEnabled` au modèle de préférences Android (NotificationPreferences, aujourd'hui sans type jeu) + son interrupteur dans Réglages > Notifications
- Brancher setHidden (composé) et setFriendsLeagueOptOut sur le modèle de gestes ; recopier l'état serveur au chargement (loadSettings)
- Entrée depuis Réglages (liste) et depuis le hub Progression
- Défauts sûrs quand le serveur ne sert pas encore la visibilité (amis / moi seul)

Rendu : Cartes GameCard empilées (spacing xl), notes explicatives sous chaque contrôle, interrupteurs >= 44 dp teintés brandPrimary.

Transposition Android : UserPreferencesManager.updateNotification -> préférences de notification Android existantes (feature/settings + core/model Notification.kt) à étendre.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameSettingsViews.swift`

</details>

### Je range mes trophées dans ma vitrine et je choisis qui la voit

`game-showcase-page` · Android : **absente** · P1 · effort M

Page Vitrine : coupes de ligue, de saison, de Prestige et de Flamme dans l'ordre que la personne a rangé (grille 2 colonnes : coupe 84 pt qui SE TOUCHE -> précisions, titre, « Obtenu le … », deux boutons 44 pt monter/descendre — pas de glisser-déposer, inaccessible au clavier et à VoiceOver). Rangement optimiste avec retour arrière ; pendant l'envoi les flèches sont suspendues sans être désactivées (le focus lecteur reste), hors ligne elles sont désactivées. Ordre parcouru = `trophies.order` calculé par la loi. Un trophée ne rapporte JAMAIS de points ni de Gloire. Carte « Qui voit ma vitrine » (Tout le monde / Amis / Moi seul, défaut Amis). Vitrine vide : message. Lecture visiteur : le serveur décide ; vitrine fermée = rien n'est dessiné (une carte « fermée » apprendrait son existence), seul le MOIS d'obtention est servi (D-3), clés inconnues d'une version plus récente non nommées. Contient aussi la constellation.

Écarts :
- Porter GameTrophies (TrophyKind, TrophySpec, clés stables, ShowcaseVisibility everyone/friends/me, ShowcaseViewer, VisitorShowcase, orderShowcase) et GameShowcaseRules (shelfOrder, moved(index,delta), GameVisitorShowcase.Entry) + tests trophies
- Écran Vitrine avec grille 2 colonnes, flèches 44 dp, dates, état vide, carte visibilité (picker), erreurs
- Geste saveOrder optimiste (PUT /me/game/showcase/order) et setVisibility(showcase) (PUT /me/game/visibility) avec valeur EFFECTIVE relue
- Composable TrophyArt/TrophyView (matières or/argent/bronze/platine/prisme, Mee/Meo couronnés pour le Prestige) — voir game#1/UI
- Rendu visiteur fail-closed (rien si fermé, mois seul, clés inconnues ignorées)

Rendu : Cellule : coupe 84 dp, titre smallSize semibold centré, date footnote atténuée ; flèches 44x44 dp fond atténué 8 %, rayon sm, opacité 50 % si désactivées ; espacement lg entre cellules.

Transposition Android : Monter/descendre en boutons plutôt que drag-and-drop pour l'accessibilité TalkBack ; Modifier.semantics { customActions } possible en complément.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameShowcaseRules.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameShowcaseViews.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameTrophies.swift`

</details>

### Le serveur me dit les réglages du jeu et ce que je peux voir du jeu d'un autre membre, jamais plus

`game-visitor-and-settings-read` · Android : **absente** · P1 · effort M

Deux lectures servies que l'app ne devine plus : (1) GET /me/game/privacy — l'état des réglages (« Jeu masqué », opposition à la ligue Amis) ; le serveur est maître, l'appareil n'en garde qu'une COPIE (utile hors ligne) et se met à jour au chargement (autre appareil du même compte compris) ; hors ligne ou refus, la copie reste en silence. (2) GET /users/:userId/game — niveau, palier, rang (réglage `rank`) et palier du trésor (réglage `treasury`) d'un AUTRE membre ; jamais la Gloire, les jours de série, les Meeshes, une date ni la présence. Chargeur cache-first : quand le serveur A RÉPONDU (refus, blocage, réglage fermé depuis — D-5) la copie est oubliée ; elle ne sert que sur panne de transport. GameVisitorRead porte l'identité de lecture pour ne jamais peindre le niveau du membre précédent sous le nom du suivant.

Écarts :
- Modèles GameSettingsResponse, GameStanding (ladder, niveau montré, rang, division, mythique, sparks/points, glory), GameShownTreasury, UserGameProfileResponse (hasSomethingToShow), GameStandingLadder + tests schéma game-v2
- GameSettingsSync.refresh() : GET privacy -> prefs locales (hidden, friendsLeagueOptOut)
- GameUserGameLoader (cached/load) avec distinction panne de transport vs réponse ; GameStandingContent.of ; GameVisitorRead.shown(for:hidden:)
- Appels Retrofit GET /me/game/privacy et /users/{id}/game

Rendu : Aucun rendu direct.

Transposition Android : Services protocol-injectés Swift -> interfaces Kotlin + Hilt/Koin existant ; cache -> game-wave2-local-store.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameIntegration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameIntegrationModels.swift`

</details>

### Les dates, durées, noms de langues, de ligues et de trophées du jeu sont dits par la locale de l'appareil

`game-wave2-formatting` · Android : **absente** · P1 · effort S

Habillage des clés stables rendues par les lois : noms de ligues (Quartz, Ambre, Jade, Saphir, Rubis, Améthyste, Diamant, Prisme), zones (promotion, maintien, relégation), coupes (or/argent/bronze), visibilités (tout le monde/amis/moi seul), raretés, états d'étape de saison (réclamée, à réclamer, à venir), libellés de récompense (+N, fragment, gel, coupe de saison). Formats : jour AAAA-MM-JJ lu en UTC pour ne jamais glisser d'un jour, « Semaine du 2 novembre », mois seul pour un visiteur (jamais le jour, conformité D-3), date complète pour le propriétaire, durée restante CALME avant la fermeture du dimanche 20 h local, numéro de semaine ISO « S44 », part de rareté (entier dès 1 %, une décimale sous 1 %, jamais sous 0,1 %), nom de langue DANS la langue de l'interface, thème de saison `language:sw` -> « Swahili ». Présentation de trophée (GameTrophyPresentation) : matière or/argent/bronze pour la ligue, platine pour la saison, prisme pour le Prestige, matière de Flamme pour 100/365 jours.

Écarts :
- GameWave2Format avec java.time (DateTimeFormatter + DateTimeFormatterBuilder.appendLocalized/ofLocalizedPattern ou skeleton via DateFormat.getBestDateTimePattern) pour day/week/month/shortMonth/awardedDate
- remaining(closes:now:) calme (jours+heures, heures, minutes) calé sur dimanche 20 h local ; isoWeekNumber(weekKey)
- rarityPercent (règles d'arrondi) et languageName via java.util.Locale.getDisplayLanguage(uiLocale)
- GameTrophyPresentation + GameSeasonStepState avec accesseurs de chaînes (ressources) pour ligues/zones/coupes/raretés/visibilités
- Tests de format sur plusieurs locales (fr, en, ar, zh) avec Locale injectée

Rendu : Les dates ne sont jamais écrites à la main ; la durée restante ne montre jamais de secondes.

Transposition Android : DateFormatter/Locale -> java.time + android.text.format.DateFormat.getBestDateTimePattern ; Locale.displayName(forLanguage) -> Locale.forLanguageTag(code).getDisplayLanguage(Locale).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameWave2Names.swift`

</details>

### Un lien ouvre une saison passée, future ou une semaine de ligue passée avec mon palmarès gravé

`game-archive-pages` · Android : **absente** · P2 · effort M

Lecture d'archives par lien (#9947, #10018) : GET /me/game/seasons/:number et GET /me/game/league/weeks/:weekKey, cache-first (copie disque par compte, par saison, par semaine ; hors ligne la copie reste, l'échec ne prime jamais sur une valeur déjà là ; changer de numéro repart de SA copie ou de rien). Au retour du réseau (#10131) la saison/semaine lue se RELIT d'elle-même (une copie « à venir » gardée hors ligne a pu basculer à l'horloge locale), et le bloc `game` gardé aussi. Écran Saison sur la saison nommée : en cours = écran habituel ; passée = PALMARÈS (étoiles, étapes n/40, récompenses réclamées, coupe gagnée/manquée, Sceau possédé, « non jouée ») ; future = thème et date d'ouverture ; ouverte sans parcours ; squelette ; échec avec relance. Écran Ligue sur une semaine passée = MON résultat gravé (ou sa purge selon la rétention) — rien de la présence d'autrui (ni pseudonyme, ni total, ni rang d'un autre).

Écarts :
- Modèles GameSeasonArchive / GameSeasonProgressArchive / GameLeagueWeekArchive / GameLeagueWeekResult / GameArchiveStatus / GameArchiveRetention (clés optionnelles encodées null)
- GameArchiveModel (ViewModel) : cache disque par saison et par semaine, état shown (current, upcoming, opened, past, skeleton, failed), onReconnect qui relit le bloc game
- Écrans GameSeasonFocusScreen, GameSeasonArchiveView, GameSeasonRecord, GameLeagueFocusScreen, GameLeagueWeekArchiveCard
- Deep link `meeshy://game/season/<n>` et `.../league/week/<weekKey>` dans :core:navigation (GamePageFocus)
- Observation du retour du réseau (ConnectivityManager callback) pour relire

Rendu : Carte palmarès : titre « Saison n (terminée) », thème brandPrimary semibold, notes de dates, barre étapes/40, coupe en vert si gagnée.

Transposition Android : Lien universel -> intent-filter + NavDeepLink ; Reachability -> ConnectivityManager.NetworkCallback.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameArchiveModel.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameArchiveViews.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameArchiveCopy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameArchive.swift`

</details>

### Un badge qui s'allume voit sa matière remonter du bas, avec un reflet et une légère tape

`game-badge-light-choreography` · Android : **absente** · P2 · effort S

Chorégraphie du badge (0,7 s) : la matière remonte du bas pour couvrir l'empreinte (le badge éteint reste dessous) à l'allumage, ou s'en retire en pointillé à l'extinction ; reflet à l'allumage, tape haptique légère à 0,5 s. Sous « réduire les animations » : fondu entre l'empreinte et la matière. Un badge d'accumulation se dessine en MÉDAILLE (famille de l'axe = couleur de l'émail, pictogramme d'axe, arc de progression vers le palier suivant) dès que l'hôte donne famille, glyphe et progression ; sans eux, l'hexagone d'avant. L'émail du Prisme s'irise avec l'inclinaison.

Écarts :
- Composable BadgeStage(shape, material, lit, play, medal?) avec remplissage clippé par le bas (GameTimeline.badgeFill) et fondu réduit
- BadgeMedal(family, glyph, progress) -> MedalView ; sinon GameBadgeView hexagonal (game#1/UI)
- Reflet spéculaire (gameSpecularSheen) et irisation Prisme conditionnelle
- Haptique badgeLit à l'allumage

Rendu : Matière qui monte en 0,7 s ease in/out, empreinte pointillée dessous ; médaille avec arc de progression.

Transposition Android : Clip + offset Compose ; ChoreographyClock défini plus haut.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/BadgeStage.swift`

</details>

### Ma ligue est une gemme taillée, mes langues des tampons d'Atlas, et la rareté d'un succès un liseré coloré

`game-brick-league-gem-stamp-rim` · Android : **absente** · P2 · effort S

GameLeagueBricks : LeagueGemView (une gemme taillée par ligue, du Quartz au Prisme — huit teintes : e5e7eb, f59e0b, 10b981, 3b82f6, e11d48, 8b5cf6, bae6fd, a855f7 —, Signature GRAVÉE en creux, le Prisme irise), AtlasStampView (cachet incliné de deux cercles, code de la langue, Signature à plat ; un tampon manquant est en pointillé, éteint), RarityBorder et le modificateur gameRarityRim (contour d'un succès à la couleur de sa rareté : ardoise, bleu, violet, or, prisme). Briques pures : valeurs opaques, aucune idée de classement ni de langue du lecteur.

Écarts :
- LeagueKey.gemColor (8 teintes) et LeagueGemView Compose avec Signature gravée ; Prisme irisé.
- AtlasStampView (états posé / manquant pointillé), RarityBorder.color et Modifier.gameRarityRim(border, cornerRadius).
- Libellés a11y fournis par l'hôte.

Rendu : Gemme taillée de la couleur de sa ligue, Signature en creux ; tampon incliné deux cercles + code de langue ; liseré 1-2 dp à la couleur de rareté.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameLeagueBricks.swift`

</details>

### Mes coupes de ligue, de saison et de Prestige sont des trophées de métal à plaque gravée

`game-brick-trophy` · Android : **absente** · P2 · effort S

TrophyView : une coupe de métal avec la Signature FRAPPÉE sur la panse et une plaque sombre qui porte l'inscription courte (« JADE · S41 », « SAISON 1 », « 365 JOURS ») ; coupe de ligue en or, argent ou bronze, coupe de saison en platine, Prestige en prisme avec Mee et Meo COURONNÉS à la base, trophée de Flamme en matière flamme. Le viewBox s'élargit de 120 à 170 avec les tenants.

Écarts :
- TrophyView Compose (Canvas 120x124 / 170x124 avec tenants) : anses, panse, plaque + inscription, Signature frappée, matières.
- Tenants couronnés (GameFigures + couronne) pour Prestige ; libellé a11y optionnel.

Rendu : Coupe : anses + panse arrondie M30 12 h60 v22 …, plaque sombre portant le texte ; Prestige : Mee et Meo couronnés de chaque côté de la base.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/TrophyView.swift`

</details>

### Chaque dixième fragment d'étoile allume une étoile de ma constellation et débloque un cosmétique de profil

`game-constellation-card` · Android : **absente** · P2 · effort S

Carte « Constellation » (loi miroir de constellation.ts) : tous les dix fragments d'étoile collectés, une étoile s'allume ; chacune débloque UN cosmétique de profil (halo, cadre, scintillement) sans avantage de jeu, clé déterministe `constellation.star-<n>.<genre>`. Le total est dérivé, jamais dépensé. Ciel dessiné en Canvas (12 points fixes, étoiles allumées reliées par une ligne brand 45 %, la suivante se remplit par un arc proportionnel à inStar/10), aperçus de cosmétiques en médaillons 28 pt. Dessin décoratif et retourné en arabe ; le texte dit tout. Un visiteur ne reçoit que des étoiles figées au mois selon le réglage de la vitrine.

Écarts :
- Porter GameConstellation (fragmentsPerStar=10, ConstellationCosmetic(kind, star, cosmeticKey), isKey) + tests constellation/constellation-key
- Composable GameConstellationCard + GameConstellationSky (Canvas, mêmes 12 points fixes que le web, flip RTL) + GameConstellationSwatch (halo avec ombre, cadre, scintillement)
- Application des cosmétiques (halo/cadre/scintillement) sur l'avatar du profil — à voir avec game#1/profil

Rendu : Ciel haut de 64 dp ; étoile allumée disque brandPrimary 12 dp, étoile éteinte contour gris 8 dp, arc 2 dp démarrant à -90 degrés.

Transposition Android : Canvas SwiftUI -> Canvas Compose ; flipsForRightToLeftLayoutDirection -> graphicsLayer scaleX = -1 selon LocalLayoutDirection ; shadow -> Modifier.shadow ou blur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameConstellation.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameShowcaseViews.swift`

</details>

### Dans la fiche d'une carte de contact Meeshy je vois son niveau, son rang, son trésor et trois coupes

`game-contact-card-strip` · Android : **absente** · P2 · effort S

Bande en lecture seule sous le nom d'un compte Meeshy dans la fiche complète d'une carte de visite : rangée compacte (anneau de niveau PLEIN 44 pt faute de connaître la barre d'un autre, « Niveau n · palier », rang + division, palier du trésor « Héritage : X », blason 36 pt) puis trois coupes au plus (sans date, #10380). Même règle que la vitrine : ce que le serveur ne sert pas ne se dessine pas ; aucune carte « fermée ». Lecture cache-first (le disque se peint tout de suite sauf si la vue montre déjà CE membre) ; une lecture ANNULÉE (la vue est passée à un autre membre) ne rend rien pour ne pas écraser la suivante ; si le membre ferme son réglage, la valeur disque est effacée. Libellé VoiceOver : « Niveau 42, palier Éclat, Voix II, Trésor : Coffre ».

Écarts :
- Composables GameStandingView et GameContactStrip + chargeur GameVisitorLoading (cache d'abord, annulation par membre)
- Branchement dans la fiche détaillée d'un contact/carte de visite Android (feature/contacts) à une place fixe, avec état lié à userId
- Rien si jeu masqué sur l'appareil ou si rien à montrer
- Libellé d'accessibilité complet ; aucune date de trophée

Rendu : Ligne : anneau 44 dp à gauche, colonne texte (smallSize bold, footnote semibold, footnote atténué), blason 36x34 à la fin ; sans valeurs inventées.

Transposition Android : AnyView injecté à une place fixe de la feuille de profil -> slot Composable avec key(userId).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameProfileViews.swift`
- `apps/ios/Meeshy/Features/Main/Game/Wave2/GameStandingViews.swift`

</details>

### Les cadres de gloire de mes photos utilisent des polices d'apparat et me proposent d'abord le cadre de mon ambiance

`game-glory-frame-fonts-and-offer` · Android : **absente** · P2 · effort M

(1) Polices : liste FERMÉE de cinq familles pour les cadres (Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope — Google Fonts SIL OFL, ni conversion ni sous-ensemble), enregistrées À LA DEMANDE (jamais au démarrage) pour le processus ; instances variables par graisse, fichier statique le plus proche pour Cinzel Decorative. Ces polices ne couvrent que le latin : un texte contenant une autre écriture (cyrillique, grec, hébreu, arabe, CJK, devanagari…) ou un emoji prend la pile système pour TOUT le texte, d'après ses plages Unicode (jamais la langue de l'interface). (2) Loi de proposition (miroir de glory-frames.ts, L4) : pour chaque étape du jeu, quels cadres proposer d'abord selon l'atmosphère choisie, le dernier choix pour la même famille et les packs installés OU embarqués ; moteur de règles SANS ÉTAT (catalogue de packs `glory-frame` fourni par l'appelant). Atmosphère enregistrée par PUT /me/game/frames/atmosphere.

Écarts :
- Embarquer les polices OFL dans res/font (variables Cinzel[wght], Cormorant Garamond roman/italique, Fraunces[SOFT,WONK,opsz,wght], Manrope[wght] ; statiques Cinzel Decorative Bold/Black) avec FontVariation pour la graisse
- GloryFrameScript.needsSystemFont(text) par plages Unicode latines (mêmes 12 plages) + repli pile système
- Porter GameGloryFrames (GloryFrameOfferFrame/Pack/Ref/OtherPack, GloryFramesOffer, StepTarget) + tests glory-frames
- Écran/choix d'atmosphère et PUT /me/game/frames/atmosphere ; installation de pack de cadres (contrats `glory-frame`) — dépend du système de packs

Rendu : Typographie d'apparat sur le cadre (titre, date, kicker) ; repli système cohérent pour les écritures non latines.

Transposition Android : CTFontManagerRegisterFontsForURL à la demande -> Typeface.Builder / FontFamily Compose chargé paresseusement depuis res/font ; polices variables via FontVariation.Settings (API 26+ via FontFamily avec axes).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Frames/GloryFrameFonts.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGloryFrames.swift`

</details>

### Chaque moment fort du jeu a sa vibration propre : choc net de la frappe, trois tapes du rang, une tape par récompense

`game-haptic-patterns` · Android : **absente** · P2 · effort S

Motifs haptiques sous forme de DONNÉES (instant, intensité, netteté) : frappe = choc net à 0,45 s puis léger rebond à 0,54 s ; frappe en place du moment photo = choc à 0 puis rebond à 0,09 s ; coup de la cérémonie = tape franche 0,6/0,75, au DERNIER coup le choc de la frappe ; rang = trois tapes (0,55 s, 0,8 s, 1,05 s, intensités 0,55/0,7/0,9) une par trait de la Signature ; niveau gagné = une tape légère à 0,45 s ; badge allumé = tape légère à 0,5 s ; coffre = une tape par récompense (0,5 s + 0,3 s x index) ; niveau perdu = aucune. Protocole GameHapticsProviding pour tester sans moteur ; Core Haptics si l'appareil le sait, sinon générateurs d'impact (moteur créé au premier usage et relancé s'il s'arrête).

Écarts :
- Objet GameHapticPattern (listes de GameHapticTap(time, intensity, sharpness)) identique au web (apps/web/src/lib/game/haptics.ts)
- GameHapticsProvider : VibrationEffect.Composition (API 30+, PRIMITIVE_CLICK/TICK avec échelle d'intensité) si `areAllPrimitivesSupported`, sinon VibrationEffect.createWaveform (minSdk 26), sinon HapticFeedbackConstants
- Planification des tapes sur les instants (coroutines) annulée à la sortie d'écran ; respect du réglage système de vibration/haptique
- Tests : séquences de motifs sans vibreur (fake provider)

Rendu : Aucun rendu ; le retour haptique est un geste de feedback à caler sur l'image d'impact.

Transposition Android : CHHapticEngine -> VibratorManager/VibrationEffect.Composition ; UIImpactFeedbackGenerator -> View.performHapticFeedback / HapticFeedbackType Compose.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/GameHaptics.swift`

</details>

### Avant de frapper, je vois où je suis dans ma ligue cette semaine

`game-league-detail-card` · Android : **absente** · P2 · effort S

GameLeagueDetailCard : la gemme de ligue, la place, les points gagnés dans le groupe depuis lundi (« 120 cette semaine ») et le temps avant la fermeture, placée AVANT le bouton de frappe (directive 2026-10-06). Seulement quand la ligue publique est ouverte ET que le joueur est placé dans un groupe ; sinon la porte de la ligue plus bas dit pourquoi (verrouillée, consentement, mineur, pas de groupe). Un toucher ouvre la page de la ligue, avec haptique légère.

Écarts :
- GameLeagueDetail.current(of:) (ligue ouverte ET groupe placé) et carte avec gemme, place, points de la semaine, compte à rebours.
- Ouverture de la page de ligue (vague 2, autre partie du domaine) ; haptique légère.
- Phrase « N cette semaine » localisée.

Rendu : Carte teintée avec gemme à gauche, place et points au centre, chevron à droite.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameLeagueDetailCard.swift`

</details>

### Sur l'écran de la frappe, la pièce attend en flan vierge sur l'enclume puis repose sur son revers numéroté

`game-mint-strike-strip` · Android : **absente** · P2 · effort S

Bande décor de l'écran Meesh (conception partie V, 1,2 s, « tchak » à 0,45 s) : Mee pose le flan, Meo frappe, la pièce se retourne et montre son numéro ; onde radiale et reflet par shaders (Metal iOS 17+, repli dégradé iOS 16) ; haptique `strike`. Avant la première frappe la pièce attend en FLAN vierge (épopée § 5) ; après, elle repose sur son revers numéroté. La frappe elle-même se joue en plein écran (MintCeremonyScene) : cette bande en est le décor. Frappée, la pièce se pose sur son revers sans rejouer la scène (écran rouvert). Sous « réduire les animations » : fondu avers->revers. Mee et Meo y sont des images FIXES (un colibri qui bat des ailes détournerait l'oeil de la pièce).

Écarts :
- Composable MintStrikeScene(play, number, edition, minted) sur GameTimeline.strike (plate, hammer, wave, flip, sheen, burst)
- Onde radiale + reflet : AGSL RuntimeShader (API 33+) avec repli en dégradé radial
- Flan vierge avant la première frappe ; revers numéroté après ; pas de rejeu à la réouverture
- Images fixes Mee/Meo (assets) et pièce Meesh (MeeshCoin, game#1/UI)

Rendu : Bande horizontale centrée sur la pièce (côté configurable), Mee à gauche, Meo à droite en images fixes, enclume dessous.

Transposition Android : Shaders Metal -> AGSL ; haptique strike -> game-haptic-patterns.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/MintStrikeScene.swift`

</details>

### Quand un événement du jeu occupe l'écran, le lecteur de stories se fige dessous

`game-moment-presence` · Android : **absente** · P2 · effort S

GameMomentPresence est un signal booléen partagé (isPresented) publié par l'hôte de révélation (célébration d'un palier, carte photo) et lu par ceux qu'il recouvre : le lecteur de stories se FIGE dessous (#9821). Le signal ne porte rien du jeu.

Écarts :
- Singleton StateFlow<Boolean> dans :sdk-core publié par l'hôte de révélation et observé par le StoryViewer pour mettre en pause minuteur et média pendant la célébration.

Transposition Android : ObservableObject singleton -> object avec MutableStateFlow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameMomentPresence.swift`

</details>

### La Chronique garde mes moments photo sur l'appareil : je les partage, les retire ou en photographie un nouveau

`game-notebook-chronique` · Android : **absente** · P2 · effort M

GameNotebookPage (« La Chronique ») : état vide dessiné, section des moments en attente (« Photographier » ouvre le déroulé photo plein écran), section de rattrapage (moments manqués), section des photos gardées (partager via la feuille de partage système, retirer), légende « rien n'est envoyé au serveur : tout reste dans l'appareil ». GameNotebookViewModel charge de façon asynchrone ; boutons d'action 44 pt avec haptique légère.

Écarts :
- Écran Chronique (liste en sections pending / catchUp / kept) et ViewModel de chargement local ; état vide, légende de lieu de stockage.
- Partage d'une image gardée via Intent.ACTION_SEND + FileProvider (infrastructure ProfileShareSheet existante) ; suppression d'une photo gardée.
- Ouverture du déroulé photo plein écran depuis « Photographier » (feature photo du domaine).

Rendu : Sections séparées par espacement xl ; boutons « Photographier »/« Partager »/« Retirer » en capsules 44 dp.

Transposition Android : UIActivityViewController -> Intent.createChooser(ACTION_SEND) ; stockage local de l'appareil -> fichiers app + index Room.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameNotebookView.swift`

</details>

### La proposition de photo d'un succès est une petite carte posée, inclinée d'un degré et demi, avec ma plaque d'auteur

`game-photo-author-card` · Android : **absente** · P2 · effort S

Carte posée (#10816) en remplacement d'un cadre plein écran qui « ne disait rien sur l'auteur » : carte bornée à 300 pt, inclinée d'un degré et demi avec ombre de table, emblème au métal de l'étape, le moment, la date et la plaque gravée au pseudo de l'auteur (photo de profil dans le médaillon). Plaque vivante : la plaque fixe + l'animation Lottie de son fini jouée une fois par le moteur unique ; sous « Réduire les animations » (système ou Meeshy) ou si le film ne se lit pas, rien ne monte — la plaque fixe est l'état final, jamais un nom caché. Les films des trois finis sont générés et lus une fois chacun. Miroir de game-author-card.tsx.

Écarts :
- Composable GameAuthorCard (carte 300 dp, rotation 1,5 degré, ombre portée, emblème, kicker, titre, date, plaque)
- Fond GameAuthorCardBackdrop et GameAuthorPlateLive (plaque fixe + animation par dessus, mémoïsation des films par fini)
- Respect de la réduction d'animations (système + préférence Meeshy)

Rendu : Carte posée sur une table (fond sombre doux), légère inclinaison, ombre diffuse, plaque en bas de carte.

Transposition Android : rotationEffect -> graphicsLayer rotationZ ; shadow -> Modifier.shadow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GameAuthorCardView.swift`

</details>

### Ma photo d'un succès, d'un rang ou d'une fin de mission porte une plaque gravée à mon pseudo

`game-photo-author-plate` · Android : **absente** · P2 · effort M

Plaque d'auteur (#10816) : le cadre d'un succès, d'un rang ou d'une fin de mission grave le PSEUDO public (jamais le nom d'affichage qui peut être un vrai nom ; un invité sans pseudo public n'a pas de plaque) dans un cartouche à bouts entaillés (boîte 360 x 100) : médaillon à gauche (photo de profil dans la carte posée, monogramme dans l'image exportée car ImageRenderer ne rend pas une image qui charge), à droite la formule de la famille en petites capitales (« Succès de », « Rang atteint par », « Mission menée par ») et `@pseudo` (16 graphèmes max, coupé et normalisé). Trois finis tirés de l'étape : gravure (lettres creusées, encre du métal et arête claire décalée) pour un succès de rareté basse/neutre (indigo), estampage (feuille d'or frappée sur champ creusé sombre) à partir d'épique et pour un rang (métal de son blason), grattage (nom doré sous une couche d'argent grattée en trois passes, obsidienne) pour une mission accomplie. Métaux : cuivre, bronze, argent, or, platine, obsidienne, prisme, indigo. Texte FIGÉ dans le cadre (ne grandit pas avec la taille de texte). Animation Lottie GÉNÉRÉE depuis le fini (jamais un fichier dessiné par variante), 1,2 s, jouée une fois : burin (point de lumière qui suit la ligne de base), estampage (quatre éclats), grattage (pièce en zigzag + paillettes d'argent), et pour tous un lustre diagonal ; ne cache jamais le nom ; absente sous « réduire les animations » ou si le film ne se lit pas (la plaque fixe est l'état final). Miroir de author-plate.ts / author-plate-motion.ts.

Écarts :
- Table GamePhotoAuthorPlate : PlateFamily, PlateFinish (engrave/emboss/scratch), PlateMetal (8), PlateStyle selon PhotoEmblem + rareté, AuthorPlate (caption, name, monogram, label), PhotoAuthor(handle, avatar), maxHandleGraphemes=16
- Composable GameAuthorPlate (Canvas 360x100 : cartouche entaillé, médaillon, petites capitales, trois finis) avec libellé TalkBack « Succès de @pseudo »
- Générateur d'animation depuis le fini (couches burin/estampage/grattage/lustre) : soit JSON Lottie + dépendance lottie-compose (absente), soit équivalent Canvas animé — décision à prendre ; jouée une fois, 1,2 s, désactivée si réduction
- Médaillon : photo de profil (Coil) dans la carte posée, monogramme dans l'export
- Chaînes `game.photo.plate.*` localisées

Rendu : Cartouche 360x100 : médaillon rond à gauche, formule en petites capitales au-dessus, @pseudo en gras dans le fini ; lustre blanc diagonal une seule fois.

Transposition Android : LottieLayerView (moteur unique iOS) -> lottie-compose (nouvelle dépendance) ou animations Canvas Compose ; Coil existant pour l'avatar.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GameAuthorPlateView.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoAuthorPlate.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoAuthorPlateMotion.swift`

</details>

### Le carnet me laisse photographier chaque étape déjà franchie, dans l'ordre, sans en sauter aucune

`game-photo-catch-up` · Android : **absente** · P2 · effort M

Rattrapage du carnet (#9961, #9962) : les étapes se DÉDUISENT de l'état du jeu, jamais d'un journal (un moment arrivé écran fermé, ou avant que le carnet n'existe, reste photographiable). Sept pistes ordonnées : départ, rang (division par division), palier de niveau, sommet et Prestige, Meesh (la première puis chaque dixième)… La première étape de chaque piste est OUVERTE, les suivantes l'attendent (« Prends d'abord … ») ; une étape reportée d'une piste suivie ne se montre QUE dans la piste. Une proposition en direct ne propose jamais une étape qui en saute une autre : la Meesh 50 sans photo de la 40 propose la 40. Ordre de préséance : un rang passe avant un palier, une Meesh en dernier. Chaque étape devient un PhotoMoment complet par les mêmes constructeurs que la proposition en direct : une photo gardée par l'une compte pour l'autre. Loi miroir de photo-catch-up.ts (lois photo-catch-up, photo-offer, photo-standing).

Écarts :
- Porter GamePhotoCatchUpLaw (PhotoTrack 7 pistes, PhotoCatchUpStanding(game), PhotoStepEmblem, PhotoLawStep, PhotoLawEntry, offer(for:standing:kept:)) + tests sur game.vectors.json
- Enveloppe app GamePhotoCatchUp : stepsReached, openAndWaiting, track(of:), conversion étape -> PhotoMoment
- Écran carnet : section « à rattraper » avec étapes ouvertes/verrouillées et libellé « Prends d'abord X »

Rendu : Étapes ouvertes en cartes actives, verrouillées atténuées avec la phrase d'attente.

Transposition Android : Lois pures + enveloppe Kotlin.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCatchUp.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePhotoCatchUpLaw.swift`

</details>

### Je prends la photo d'un moment : selfie, carte seule ou plus tard, « tchak », puis enregistrer, partager ou garder

`game-photo-flow` · Android : **absente** · P2 · effort M

Déroulé plein écran (jamais une feuille qui se glisse) piloté par un réducteur PUR (miroir de flow.ts) : offre -> caméra (opening / live / failed(raison)) -> frappe en place (selfie, carte, galerie) -> résultat (gardé oui/non) / échec / terminé (différé ou non) ; un événement hors de son étape est ignoré. Écran d'offre : Mee, « On immortalise ? », titre du moment, trois grands boutons « Selfie avec nous » (caméra), « Carte seule », « Plus tard ». Caméra : aperçu avant avec le cadre du moment en surimpression, double-tap sur la scène = prendre sans enregistrer dans Photos, toucher la case du cadre = prendre ET enregistrer dans Photos puis ouvrir le résultat (table de gestes ComposerCaptureGesture / CaptureSaveLaw partagée avec le composer), sélecteur de galerie (PhotosPicker hors processus, aucune permission), bouton carte seule, messages de refus caméra non bloquants. Frappe en place : Mee et Meo frappent l'emblème (1,2 s, « Tchak ! », haptique strikeInPlace), photo figée. Résultat : aperçu, bascule de format 9:16 story / 1:1 profil (autre version, « Enregistrer » revient si pas déjà en galerie avec ce cadre/format), bascules lien et Flamme sur la carte, avis (bon/erreur) avec action « L'enregistrer dans Photos » quand le carnet n'a plus de place, boutons Enregistrer (add-only), Partager (feuille de partage : image + lien en texte), Garder/Gardée (carnet). Croix de fermeture, accessibilité modale. La session injecte caméra, composer, carnet, photothèque, haptique, lien de parrainage (testable). Aucune image n'est envoyée au serveur.

Écarts :
- Réducteur pur PhotoFlowState/PhotoFlowEvent/PhotoCameraPhase + tests (miroir de flow.ts)
- GamePhotoSession (ViewModel) : chooseSelfie/chooseCard/later/close, take(from: zone), useGalleryPhoto, strikeInPlace, keep/save/shared, chooseFormat, chooseFrame, prepareReferral/prepareShare, notice (ton + action saveToLibrary), takeSave (CaptureSaveLaw)
- Écran plein écran : offre, caméra + surimpression + gestes (double-tap scène, tap case du cadre), galerie via PickVisualMedia, scène de frappe, résultat avec segmenté 9:16/1:1, bascules, boutons Enregistrer/Partager/Garder, croix
- Enregistrer dans la galerie : réutiliser GalleryImageSaver (MediaStore) en ajout seul ; partager via FileProvider + ACTION_SEND (image + texte du lien)
- Table de gestes de capture du composer (ComposerCaptureGesture/Zone/Action, CaptureSaveLaw) — vérifier si portée (aucune trace côté Android)
- Libellés TalkBack : aperçu caméra, déclencheur du cadre (« Prendre la photo dans le cadre … » + indice), QR, etc. (`game.photo.*`, 27 chaînes)

Rendu : Plein écran modal, croix en haut à droite, trois gros boutons en offre (le principal plein brandPrimary), résultat avec aperçu centré et rangée de boutons icône+libellé footnote semibold.

Transposition Android : fullScreenCover -> destination plein écran ; PhotosPicker -> ActivityResultContracts.PickVisualMedia ; UIActivityViewController -> Intent.createChooser(ACTION_SEND) ; PhotoLibrarySaving add-only -> MediaStore.Images (IS_PENDING) sans permission API 29+.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoFlow.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoFlowView.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoSession.swift`

</details>

### Le cadre du moment (emblème, titre, date, Mee et Meo) se superpose en direct et donne exactement la même image à l'export

`game-photo-frame-composer` · Android : **absente** · P2 · effort M

UNE seule vue sert l'aperçu en direct (sur la caméra, fond clair/transparent) ET l'image finale (ImageRenderer, fond photo, carte ou galerie) : le cadre qu'on voit au déclenchement est celui qu'on obtient. Dessinée dans l'espace pixels de l'image finale (1080 de large) et mise à l'échelle pour l'aperçu. Mise en page = DONNÉE (GamePhotoLayout, miroir de layout.ts) : emblème en haut, kicker, titre, date, Mee et Meo en bas, Signature, plaque d'auteur, bandeau de parrainage et carré QR ; deux formats 9:16 (1080x1920, story) et 1:1 (1080x1080, profil) avec proportions distinctes avec/sans parrainage, RTL géré (bandeau retourné en arabe, QR en fin de ligne ; le reste du cadre se dessine toujours LTR). Fond : photo (selfie retourné comme l'aperçu, ou galerie) ou carte aux couleurs de la marque. Frappe « en place » : l'emblème se pose (0->1) et reçoit son reflet. Aucune image asynchrone : Mee et Meo sont des images fixes déjà chargées et les emblèmes des briques sans tenants. Composition locale (aucun réseau), JPEG story + carré.

Écarts :
- Table GamePhotoLayout (PhotoFormat story/square, PhotoLayout avec emblem, kicker/title/date, mee/meo, signature, banner?, qr?, author) en pixels 1080 — mêmes nombres que layout.ts ; readsRightToLeft
- Composable GamePhotoCanvas (Background.clear/photo/card) rendu à l'écran et hors écran
- GamePhotoComposer : Compose -> Bitmap via GraphicsLayer.toImageBitmap (Compose 1.7+) ou ComposeView hors écran + drawToBitmap ; JPEG qualité équivalente ; ComposedPhoto(story, square) + aperçus
- Emblèmes (GamePhotoEmblem) pour tous les cas de PhotoEmblem sans images asynchrones (assets de Mee/Meo préchargés)
- Tests de non-régression visuelle (golden) sur les deux formats, avec/sans bandeau, LTR/RTL

Rendu : Marge 5 %, emblème centré en haut, kicker petit + titre fort + date, Mee à gauche et Meo à droite en bas, Signature discrète ; plaque d'auteur 3,6:1 (70 % de largeur en story, 44 % en carré).

Transposition Android : ImageRenderer (iOS 16+) -> GraphicsLayer.toImageBitmap / Picture ; PHPicker -> PickVisualMedia ; JPEG -> Bitmap.compress.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCanvasView.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoLayout.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoComposer.swift`

</details>

### Le selfie du moment se prend avec la caméra avant sans rien enregistrer tant que je ne le décide pas

`game-photo-front-camera` · Android : **absente** · P2 · effort S

Caméra avant du moment photo (AVCaptureSession + AVCapturePhotoOutput, protocole pour tester sans objectif) : aperçu vivant, déclenchement, aucune écriture dans Photos à la prise — la photo reste sur l'appareil dans le déroulé tant que l'utilisateur ne l'enregistre pas (« aucune image n'est envoyée au serveur »). Traitement UNIQUE de toute prise photo de l'app (redressée, bornée, améliorée). Refus nommés pour que l'écran dise quoi faire : permission refusée, aucune caméra (émulateur / appareil sans objectif), session impossible (une autre application l'utilise) ; un refus n'est pas une impasse (galerie et carte seule restent possibles). Démarrage/arrêt sur leur propre tâche.

Écarts :
- Ajouter CameraX (androidx.camera core/camera2/lifecycle/view) au catalogue de versions : absent aujourd'hui (ChatCameraCapture utilise TakePicture sans CameraX)
- GamePhotoCamera : Preview + ImageCapture (LENS_FACING_FRONT), aperçu miroir comme un selfie, capture en mémoire (pas de MediaStore), redressement EXIF + bornage + amélioration via le pipeline photo commun
- Permission CAMERA à la demande avec états denied / unsupported / unavailable et messages `game.photo.camera.*`
- Interface GamePhotoCameraProviding pour tests ; démarrage/arrêt liés au cycle de vie (bindToLifecycle)

Rendu : Aperçu plein cadre avec le cadre du moment en surimpression ; retourné comme un miroir.

Transposition Android : AVCaptureSession -> CameraX ProcessCameraProvider ; refus caméra -> ActivityResultContracts.RequestPermission + shouldShowRationale.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCamera.swift`

</details>

### Les grands moments du jeu (rang, palier, première Meesh, Flamme à 7/30/100/365 jours…) sont des moments qu'on peut photographier

`game-photo-moments-catalog` · Android : **absente** · P2 · effort S

Catalogue des moments photographiables (conception partie VI, miroir de photo-moments.ts) : photo de départ, nouveau rang ou division, nouveau palier de niveau et Prestige, première Meesh, chaque 10e et chaque édition or ou prisme, palier du trésor, Flamme à 7, 30, 100 et 365 jours, succès révélé (coupe + Signature, rareté VISIBLE qui donne son métal), fin de mission personnelle (pseudo gratté sur la plaque), trophée, ligue gagnée, coupe de saison, trophée numéroté de Prestige. Un moment est une DONNÉE : identité stable (`id`), emblème (PhotoEmblem), deux lignes (kicker « Nouveau rang », title « Voix II »). L'identité fait qu'un « plus tard » puis un retour ne propose jamais deux fois la même photo et qu'une division nouvelle est un moment nouveau. `ofTransition(from:to:)` déduit les moments d'une transition de l'état du jeu ; `fromCard(key:game:)` depuis une carte du guide.

Écarts :
- Modèle PhotoMoment/PhotoEmblem (13 cas) Serializable pour l'écriture dans le carnet
- Constructeurs start/achievement/mission/rank/tier/levelHundred/meesh/treasury/flame, seuils de Flamme [7,30,100,365], ofTransition, fromCard
- Chaînes `game.photo.kicker.*` / `game.photo.title.*` localisées
- Tests contre photo-moments.ts / vecteurs

Rendu : Aucun rendu direct ; l'emblème est gravé dans le cadre (game-photo-frame-composer).

Transposition Android : Lois pures :core:model.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoMoments.swift`

</details>

### Mon carnet de progression garde mes photos du jeu sur l'appareil et s'ouvre instantanément, hors ligne comme en ligne

`game-photo-notebook-store` · Android : **absente** · P2 · effort M

Carnet LOCAL à l'appareil (miroir de notebook.ts) : une entrée par MOMENT (garder une photo prend la place de l'attente du même moment, une reprise remplace la précédente), image 9:16 + SOURCE (`<stem>-source.jpg`, 1 440 px de grand côté, JPEG q0,85) + RECETTE (recadrage décalage/zoom, selfie oui/non, date de l'étape, cadre choisi) pour recomposer ; les anciennes entrées se relisent telles qu'écrites. « Plus tard » n'expire plus et une étape de piste reportée ne s'y écrit pas (elle se rattrape). Une photo GARDÉE ne s'efface jamais toute seule. Stockage sous Application Support/MeeshyGame/<userId>/Notebook, fichiers protégés tant que l'appareil est verrouillé, index lu/écrit par UN acteur par dossier (deux gestes concurrents ne perdent pas d'entrée). Robustesse : un disque qui refuse se lit « carnet vide », jamais une erreur ; à l'écriture « disque plein » distinct de « refusé », aucune entrée ni fichier si l'écriture échoue (l'avis propose alors d'enregistrer dans Photos). ViewModel : photos gardées (récentes d'abord), moments en attente, étapes à rattraper, vignettes décodées à la TAILLE DE LA LISTE (une photo 1080x1920 pèse 8 Mo décodée), place occupée, suppression avec échec dit, image pleine pour partager, reprise d'un moment en attente ou d'une étape. Lecture de l'état du jeu depuis le CACHE (jamais le réseau).

Écarts :
- Magasin fichier GamePhotoNotebook sous filesDir/MeeshyGame/<userId>/Notebook (index JSON atomique, story + source JPEG, entrée par moment, NotebookEntry/KeptPhoto/recette/NotebookKeepOutcome)
- Sérialisation par Mutex par dossier ; écriture atomique (tmp + rename) ; distinction disque plein (ENOSPC) / refus ; protection (stockage app-privé hors sauvegarde, EncryptedFile optionnel)
- Fonction referencedFrameIdsOfEveryAccount pour l'élagage des packs de cadres
- GameNotebookViewModel : listes kept/pending/catchUp, vignettes décodées à taille de liste (BitmapFactory inSampleSize / ImageDecoder), occupiedBytes, removalFailed, makeSession
- Écran carnet (GameNotebookView, game#1) à brancher sur ce ViewModel

Rendu : Aucun rendu direct ; l'écran carnet (game#1) affiche des vignettes en grille.

Transposition Android : Application Support -> Context.filesDir (app-privé) ; completeFileProtection -> stockage chiffré optionnel ; actor -> Mutex ; downsample -> ImageDecoder.setTargetSize.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoNotebook.swift`
- `apps/ios/Meeshy/Features/Main/Game/Photo/GameNotebookViewModel.swift`

</details>

### Une carte me propose de photographier le moment avec deux gestes : « Photographier » ou « Plus tard »

`game-photo-offer-card` · Android : **absente** · P2 · effort S

Carte du jeu (sans bulle de conversation) : Mee à côté du texte (film mee-coucou 64 pt, animé sauf réduction), titre « On immortalise ? » (heading), titre du moment en dessous, deux gestes : « Photographier » (capsule brandPrimary, 44 pt min) qui ouvre le déroulé, et « Plus tard » (texte atténué) qui laisse le moment en attente dans le carnet — la proposition ne revient pas, elle ne s'impose jamais. Haptique légère aux deux.

Écarts :
- Composable GamePhotoOfferCard(moment, onStart, onLater) avec boutons 44 dp et haptique légère
- Film Mee « coucou » animé (désactivé si réduction des animations) — asset à porter
- Emplacement dans la page de progression/guide au-dessus du contenu, accessibilité conteneur

Rendu : Carte teintée brandPrimary, Mee 64 dp en bas-gauche, titre bodySize bold, sous-titre footnote atténué, bouton plein capsule + bouton texte.

Transposition Android : ProgressionCard -> MeeshyCard ; MeeStickerFilmView -> lecteur d'animation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoOfferView.swift`

</details>

### Mee me propose « On immortalise ? » après une célébration, jamais à l'ouverture, jamais deux fois, jamais pendant un geste en vol

`game-photo-offers-coordinator` · Android : **absente** · P2 · effort S

Coordinateur des propositions (#9382) : Mee propose APRÈS la célébration, pendant que l'écran est ouvert (Flamme qui franchit 7 jours, dixième Meesh, rang gagné). Garde-fous : jamais à l'OUVERTURE (un état n'est pas une célébration), jamais deux fois le même moment dans la séance, jamais un moment que le carnet connaît déjà (gardé ou en attente), jamais pendant qu'un geste est EN VOL (`settled` faux : la lecture montrée est l'optimiste, un geste refusé ne se photographie pas). Une transition ne propose qu'UN moment (le plus marquant, sans sauter d'étape) et une proposition en attente d'un geste n'en laisse pas entrer une seconde. `start` ouvre le déroulé pour un moment (proposition, photo de départ, moment d'une carte du guide) ; `later` pose le moment en attente au carnet ; `close` ferme d'abord le déroulé (arrête la caméra). Politique des alertes (PhotoAlertPolicy.standard) : photographie chaque étape, invitations par étape / grands moments / jamais (réglage « Me proposer d'immortaliser »), arriéré qui verrouille (D20) ; rythme dans l'app 1 par jour, écart minimal 240 min, aucune invitation PASSIVE les 10 premières minutes ; push 1 par jour avec délai 60 min et nuit 21 h -> 9 h ; décisions allowed / silent (va au carnet en silence) / wait ; la loi dit quelle étape ANNONCER, laquelle PROPOSER et lesquelles ACCUSER (POST /me/game/photo-moments/presented, 64 max, idempotent).

Écarts :
- GamePhotoCoordinator (ViewModel) : observe(game, settled), offers[], active session, start/later/close, dédoublonnage proposed/offered
- Porter PhotoAlertPolicy/PhotoAlertPacing/PhotoAlert/PhotoAlertPace + loi announce/propose/reached ; tests photo-alert
- Réglage « Me proposer d'immortaliser » (PUT /me/game/photo-moments/invitations) et accusé de présentation (POST …/presented, 64 max)
- Notification locale/push pour les alertes passives hors app (FCM data-message + channel Android dédié, plage nuit 21-9 h, 1/jour, délai 60 min) — dépend de la partie serveur
- Respect de GameDevicePrefs.offersPhotos (jeu visible ET célébrations permises)

Rendu : La proposition est une carte du jeu (game-photo-offer-card), jamais une bulle de conversation ni une popup intrusive.

Transposition Android : Push d'invitation -> FCM data message + NotificationChannel « jeu » ; WorkManager pour le délai de 60 min si le serveur ne le tient pas.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GamePhotoCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePhotoAlerts.swift`

</details>

### La carte de photo peut porter mon lien d'invitation en QR et ma Flamme, et je peux les retirer avant de partager

`game-photo-referral-banner` · Android : **absente** · P2 · effort S

Ce que la carte porte en plus du moment (#7742, conformité jeu § H) : en bas du 9:16, bandeau avec la Signature, « Rejoins-moi sur Meeshy », la Flamme de l'utilisateur (forme + jours ; une Flamme éteinte ou sans série ne se montre pas) et son lien de parrainage en CARRÉ QR (#9554 : le lien ne s'écrit plus sur la carte, il se capture ; le partage transmet aussi le lien en TEXTE). H-2 : l'utilisateur voit la carte telle qu'elle partira et peut retirer sa Flamme (elle révèle un rythme d'usage) et son lien ; la carte ne porte AUCUN nom civil. H-5 : partager ne rapporte rien de plus. H-8 : sans lien disponible, la carte part sans bandeau et sans rien qui ressemble à un lien — l'aperçu montre un EMPLACEMENT vide en pointillé tant que l'utilisateur n'a aucun jeton ; AUCUN jeton n'est créé sans geste : il se crée au toucher de « Partager », la carte est recomposée avec le vrai lien AVANT de partir ; ce qui sort de l'app (Photos, carnet, partage) porte le vrai lien ou RIEN. Le lien d'un jeton existant se lit pendant la proposition (cache d'abord).

Écarts :
- Modèle ReferralCard(flame?, link, isPlaceholder) et règles : Flamme éteinte masquée, emplacement jamais exporté
- Composable bandeau (Signature, texte « Rejoins-moi sur Meeshy », Flamme, QR en fin de ligne, RTL) via zxing-core déjà dans feature/profile
- ReferralLinkProviding : lecture d'un jeton existant (cache d'abord) et création au geste « Partager » (endpoint de parrainage Android à vérifier/porter)
- Bascules « Mon lien d'invitation sur la carte » et « Ma Flamme sur la carte » recomposant l'aperçu

Rendu : Bandeau bas de carte ; carré QR en fin de ligne (inversé en arabe) ; emplacement vide en pointillé seulement dans l'aperçu.

Transposition Android : QR : zxing-core déjà utilisé par ProfileShareSheet (feature/profile) ; partage -> Intent.ACTION_SEND (image + EXTRA_TEXT).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Photo/GameReferralCard.swift`

</details>

### La pièce ou l'écu de Prisme s'irise selon l'inclinaison de mon téléphone

`game-prism-tilt-iridescence` · Android : **absente** · P2 · effort S

L'irisation du prisme suit l'inclinaison (roulis ramené en tours, borné à ±0,5, mesures à 30 Hz) et n'existe QUE pour la matière du PRISME (pièce millième, rang Mythe, émail de badge Prisme) — jamais l'argent ni l'or. Le capteur ne tourne que tant que la vue est à l'écran ET pour une irisation qui bouge : figée sous « réduire les animations » (inclinaison de repos) ; sans capteur (émulateur) elle reste au repos. Intensité 0,6 quand active, 0 sinon (inactive, elle ne peint RIEN) ; posée sur la pièce ou l'écu, jamais sur une scène qui garde un état.

Écarts :
- GameTiltSource : SensorManager TYPE_GAME_ROTATION_VECTOR (ou ROTATION_VECTOR) échantillonné à ~33 ms, roulis -> tours borné ±0,5, enregistré/désenregistré avec le cycle de vie du Composable (DisposableEffect + visibilité)
- Règle sensorRuns(active, visible, reduceMotion) et intensité 0,6
- Modifier.gamePrismTilt(active) appliquant l'irisation : AGSL RuntimeShader (API 33+) avec repli en dégradé angulaire sur API 26-32
- Tests des fonctions pures turns(fromRoll:) et sensorRuns

Rendu : Reflet irisé arc-en-ciel qui glisse sur la face selon l'inclinaison ; rien de visible quand inactif.

Transposition Android : CoreMotion CMMotionManager -> SensorManager ; shaders Metal (iOS 17+) -> AGSL RuntimeShader (API 33+), repli gradient comme iOS 16.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/GameTilt.swift`

</details>

### En gagnant un rang ou une division, l'écu monte, sa Signature se grave trait par trait et Mee et Meo se posent à côté

`game-rank-blason-rise` · Android : **absente** · P2 · effort S

Chorégraphie de rang (1,6 s) : l'écu monte en ressort (offset 18 pt, échelle 0,88->1, opacité 0,25->1), chacun des trois traits de la Signature s'allume à son tour (éclat sur la gravure, tape haptique au même instant), puis Mee et Meo (tenants) se posent de part et d'autre ; reflet spéculaire ; irisation pour Mythe. Au repos (jamais joué, ou fini) c'est le blason tel quel avec niveau gravé dans la pointe. Sous « réduire les animations » : fondu de l'écu posé. La Signature tombe en (100/200, 81/184) sur 60/200 de côté.

Écarts :
- Composable RankBlasonStage(rank, division, level, mythic, play) reposant sur ChoreographyClock et GameTimeline.rank (rise, strokes[3], tenants, sheen)
- Éclats sur les trois traits de la Signature + haptique rank
- Tenants Mee/Meo (images fixes ou films) apparaissant à tenants > 0,5
- Variante fondu réduite

Rendu : Montée douce en 1,6 s, éclats dorés successifs sur la gravure, tenants de chaque côté.

Transposition Android : Idem ChoreographyClock ; overlay Canvas pour les éclats.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/Choreography/RankBlasonStage.swift`

</details>

### Les médailles et la pièce brillent : reflet qui passe, onde de frappe et irisation du prisme selon l'inclinaison

`game-shader-effects` · Android : **absente** · P2 · effort M

GameShaders expose trois modificateurs Metal (GameShaders.metal) : gameSpecularSheen (.layerEffect — bande de lumière qui accroche le relief), gameStrikeWave (.distortionEffect — le calque frémit autour du point d'impact, anneau d'onde StrikeRing), gamePrismIridescence (.colorEffect — arc-en-ciel glissant selon l'inclinaison fournie par l'hôte). Le shader et son modificateur sont dans le SDK ; QUAND (frappe, nouveau rang), COMBIEN DE TEMPS (reflet arrêté après trois passages) et D'OÙ vient l'inclinaison (CoreMotion) sont à l'app. Garanties : iOS 17+ Metal / iOS 16 dégradé de substitution ; animations réduites = pas de reflet ni d'onde, irisation figée à une inclinaison fixe ; hors de son temps (progress <= 0 ou >= 1) AUCUN effet posé. GameShaders.precompile() préchauffe.

Écarts :
- AGSL RuntimeShader (API 33+) pour reflet spéculaire, onde de frappe (distortion) et irisation ; repli par dégradé sur API 26 à 32 (minSdk Android = 26).
- Modifier.gameSpecularSheen(progress, intensity), gameStrikeWave(progress, center, amplitude…), gamePrismIridescence(tilt, intensity) avec les mêmes règles « aucun effet hors de son temps » et animations réduites.
- Source d'inclinaison (SensorManager rotation vector borné) fournie par l'hôte et valeur fixe sans mouvement.
- Préchauffage des shaders au démarrage de l'écran.

Rendu : Reflet = bande de lumière diagonale qui traverse la matière, 3 passages au plus ; onde de frappe = frémissement radial autour de l'impact avec anneau ; irisation = arc-en-ciel doux qui glisse sur le prisme.

Transposition Android : Metal layerEffect/distortionEffect/colorEffect -> AGSL RuntimeShader + RenderEffect (API 33+) avec fallback Brush sur API 26-32 ; CoreMotion -> SensorManager.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameShaders.swift`

</details>

### Chaque succès du profil est une tuile ronde avec son anneau de progression, pas une simple ligne de texte

`game-legacy-achievement-badge` · Android : **divergente** · P2 · effort S

AchievementBadgeView (utilisée par UserStatsView et la célébration) : tuile à fond dégradé teinté par la couleur du succès avec filet 30 %, cercle de 56 pt dont le contour montre la progression (arc depuis le haut, bouts ronds) et au centre l'icône colorée du succès (grisée à 40 % si verrouillé), le nom en footnote bold sur une ligne, puis « courant/seuil » en micro arrondi ; opacité 0,7 si verrouillé ; libellé VoiceOver « nom, déverrouillé/verrouillé, x sur y ». Android affiche aujourd'hui un nom et un pourcentage en texte sur une ligne.

Écarts :
- Remplacer la ligne AchievementBadgeView de ProfileScreen par une tuile (grille adaptative) avec anneau 56 dp, icône, nom, « current/threshold ».
- Mapper le nom d'icône SF Symbol servi (achievement.icon) vers des icônes Material équivalentes avec repli neutre.
- Fond dégradé teinté de achievement.color (gris 808080 si verrouillé), filet 30 %, opacité 0,7 verrouillé.
- Libellé TalkBack complet (déverrouillé/verrouillé, x sur y) au lieu du seul pourcentage.

Rendu : Cercle 56 dp trait 3 dp, arc couleur du succès, icône 22 dp semibold ; rayon md ; padding vertical md ; texte nom footnote bold couleur du succès (muted si verrouillé).

Transposition Android : SF Symbols servis par le backend -> table de correspondance vers Icons.Rounded.*.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AchievementBadgeView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/UserStatsPresentation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Stats.kt`

### Toutes les pages du jeu partagent le même grand titre qui se réduit, le même retour et le même tirer-pour-rafraîchir

`game-page-scaffold` · Android : **partielle** · P0 · effort S

GamePageScaffold monte une seule fois pour les ~14 pages du jeu (première page, fiche de concept, tableau de bord, ligue, saison, vitrine, Atlas, Prestige, badges, défis, succès, règles, carnet, réglages) : grand titre au repos, barre compacte et translucide quand le contenu défile dessous, retour en disque de verre, geste de bord qui continue de fonctionner quand la barre native est cachée, tirer-pour-rafraîchir optionnel, emplacement « trailing » (par exemple le compte « 12 / 40 » en capsule de verre teintée), « Voir la fiche » depuis les précisions d'un élément (onOpenConcept), fond du thème, contenu qui défile SOUS l'en-tête. Le retour fonctionne dans trois contextes (pile iPhone, panneau droit iPad, feuille).

Écarts :
- Composable GamePageScaffold(title, trailing, onRefresh, onOpenConcept) posé sur le CollapsibleHeader existant : le CollapsibleHeader d'Android est l'équivalent de CollapsibleHeader iOS mais aucune page de jeu ne l'enveloppe.
- Tirer-pour-rafraîchir (PullToRefreshBox) branché sur la relecture forcée de la progression.
- Retour en disque de verre + retour système prédictif ; décider du comportement tablette/pliable (panneau secondaire) dans la lignée des layouts adaptatifs.
- Emplacement trailing en capsule de verre teintée avec réduction du texte (compte de section).
- Identifiants de test et espace réservé sous l'en-tête pour que le contenu ne soit jamais recouvert.

Rendu : Grand titre au repos, barre compacte translucide au défilement, retour en disque de verre à gauche, fond = backgroundPrimary du thème ; capsule trailing : body bold, couleur de la section, verre teinté 18 %.

Transposition Android : presentationDetents/dismiss -> destinations du nav graph ; iPad panel -> mise en page tablette/foldable ; refreshable -> PullToRefreshBox.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GamePageScaffold.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeader.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeaderMotion.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyTopBar.kt`

### Toutes les cartes, puces, boutons et notes du jeu partagent la même surface teintée et les mêmes états d'erreur

`game-surface-components` · Android : **partielle** · P0 · effort M

GameSurface fournit la surface commune : GameCard (ProgressionCard teintée avec titre bold en en-tête de section et ancre de défilement), GameChip (puce qui réduit son texte jusqu'à une échelle minimale), GameActionButton (action avec haptique légère), GameErrorLine (refus du dernier geste dit en une phrase, jamais un code), GameNote (note muted), GameFactChipItem/GameFactChipRow (rangées de faits) et GameSpendRows (spend, requirement, missingItem : prix, ce qui restera, ce qu'il manque, exigences de niveau). Des vues FEUILLES sans observation de singleton.

Écarts :
- MeeshyCard est une carte de verre neutre ; il manque la carte TEINTÉE du jeu (dégradé de surface dans la teinte + filet 1 dp, rayon md, padding mdPlus) équivalente à ProgressionCard/surfaceGradient(tint).
- GameChip avec réduction de texte, GameActionButton avec haptique, GameErrorLine (icône + phrase), GameNote, GameFactChipRow en FlowRow.
- GameSpendRows.spend/requirement/missingItem et le type SpendPreview (abordable, restera, manque) en pur.
- Ancre de défilement optionnelle (GameAnchor) pour les cartes ciblées par le guide.

Rendu : ProgressionCard : fond dégradé du thème dans la teinte, filet 1 dp, rayon md, padding mdPlus ; titre bodySize bold ; puces capsule teintées ; erreur = icône + texte sur une phrase.

Transposition Android : theme.surfaceGradient(tint:) -> Brush.verticalGradient dérivé du thème ; ScrollViewReader anchor -> Modifier.bringIntoViewRequester.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameSurface.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyCard.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyMotion.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyGlassSurface.kt`

### Ma carte partagée porte un bandeau « Rejoins-moi sur Meeshy » avec mon lien de parrainage en QR lisible

`game-referral-link-qr` · Android : **partielle** · P2 · effort M

Le lien de parrainage : ReferralLinkRule choisit le premier jeton CRÉÉ PAR le lecteur qui est actif, non expiré, non épuisé et porte un lien (nom « Invitation Meeshy ») ; un jeton inutilisable ne part jamais (pas de faux lien) ; ReferralLinkService relit les jetons (cache puis liste) ou en crée un au toucher de « Partager » (shareableLink) ou lit l'existant (existingLink). GameQRCode est un encodeur QR ISO/IEC 18004 écrit à la main (mode octet UTF-8, correction M, plus petite version possible, masque élu le moins pénalisé) pour montrer le MÊME carré que le web, module pour module (CoreImage pourrait élire un autre masque). GameReferralQRSquare dispose des rectangles en pixels ENTIERS (module entier d'au moins 2 px, marge de silence de 4 modules) ; pas de carré si la place ne le rend pas lisible ou s'il n'y a pas de lien. GameReferralBannerView est le bandeau indigo (86 %) en bas de la carte d'un moment photo : Signature, « Rejoins-moi sur Meeshy », la Flamme de l'utilisateur et le QR en fin de ligne (retourné en arabe) ; JAMAIS monté sans lien (conformité H-8), sauf dans l'aperçu où l'emplacement est vide cerné de pointillés ; couleurs fixes (image partagée hors de l'app).

Écarts :
- Android n'a que les modèles AffiliateToken / AffiliateStats / CreateAffiliateTokenRequest : aucune API (/affiliate/tokens), aucun dépôt, aucune UI.
- ReferralLinkRule (actif, non expiré strictement après l'échéance, non épuisé, maxUses nul = illimité) et ReferralLinkService (cache -> liste -> création « Invitation Meeshy »).
- Encodeur QR GameQRCode porté tel quel (versions, ECC M, masque élu) pour garantir un carré identique au web ; ne pas se reposer sur ZXing dont le masque peut différer.
- GameReferralQRSquare (module entier >= 2 px, marge 4 modules, runs horizontaux) et GameReferralBannerView Compose (Signature, titre, Flamme, QR, RTL retourné, emplacement pointillé en aperçu).
- Règle de conformité : bandeau jamais monté sans lien dans une image qui sort de l'app.

Rendu : Bandeau indigo 86 % : Signature à gauche, « Rejoins-moi sur Meeshy », Flamme, carré QR clair avec marge de silence en fin de ligne ; bandeau entier retourné en arabe ; toutes les cotes proportionnelles à la hauteur offerte.

Transposition Android : CIQRCodeGenerator écarté pour l'iso -> encodeur Kotlin pur ; carte partagée -> Bitmap rendu hors écran + Intent.ACTION_SEND.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Game/GameReferralLink.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameQRCode.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameReferralQR.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Game/GameReferralBannerView.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`

