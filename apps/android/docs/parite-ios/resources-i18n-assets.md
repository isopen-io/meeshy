# Parité iOS → Android : `resources-i18n-assets`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**41 features iOS** : 12 absentes, 20 partielles, 8 divergentes, 0 complètes sur Android. **22 lots** planifiés (≈9760 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**resources-i18n-assets** (couverture Android estimée ≈ 25 %)

Les ressources non-Swift d'Android sont à environ 25 % de l'iso iOS. Côté chaînes, iOS compte 6 433 clés d'app, 1 885 clés SDK et 54 clés d'extensions, en 7 langues (fr, en, es, de, it, pt-BR, ar). Android porte 1 587 chaînes et 6 plurals, en 4 langues (en, fr, es, pt) : 14 fichiers par langue, sans aucune clé manquante entre les 4 locales. Mesures (2026-10-22) : 1 001 chaînes Android ont leur texte anglais exact chez iOS ; 1 358 clés d'app et 393 clés SDK iOS ont un équivalent Android. Les chaînes portées sont fidèles aux traductions iOS à 90 % (fr), 89 % (es) et 83 % (pt). Les 7 domaines de clés iOS sans module Android (game 961, game2 287, progression 113, achievement 53, composer 398, focal 23, lentille 30) pèsent 1 865 clés. Les écarts structurants sont les suivants. (1) Il n'existe aucune chaîne de génération xcstrings vers strings.xml : le portage est manuel, avec des noms snake_case sans table de correspondance. (2) Le sélecteur de langue Android propose fr/en/es/ar, mais values-ar n'existe pas et values-pt n'est pas proposé ; de, it et pt-BR sont absents. (3) Il y a 6 plurals contre 64 clés plurielles iOS (61 avec les 6 catégories arabes), et au moins 30 chaînes comptées sont écrites au singulier ou en « (s) ». (4) Les garde-fous se limitent à un test de parité sur :feature:feed, là où iOS a check_localization.py et LocalizationCatalogGuardTests. (5) Les tonalités d'appel utilisent ToneGenerator et la sonnerie système au lieu de Ringtone.caf et RingbackTone.caf. (6) Les icônes de notification FCM sont des drawables système. (7) Aucune des classes d'assets riches n'existe : 264 stickers dotLottie, appearance-catalog.json (440 Ko), 6 polices des cadres de gloire (2,6 Mo), shaders Metal, mapping de 312 SF Symbols. (8) Il manque READ_CONTACTS, USE_BIOMETRIC, les permissions Telecom et MediaProjection, ainsi que les textes de justification et d'état refusé des permissions. (9) Il n'y a ni équivalent du PrivacyInfo.xcprivacy (Data Safety Play) ni métadonnées de fiche store (iOS : 7 locales). (10) Le logo BrandLogo in-app dessine un « M », alors que MeeshyLogo.imageset et l'icône du lanceur sont trois barres empilées. Les couleurs sont hand-portées (6 jetons iOS sur 58 sont absents du Kotlin) sans générateur ni garde ; iOS dérive pourtant ios.css de MeeshyColors.swift pour le web.

## Notes transverses

DECISIONS D'ARCHITECTURE DU DOMAINE (a lire avant de planifier)
1) Fichiers generes et fichiers a la main restent separes. Le generateur (lot generateur-chaines-ios) ecrit UNIQUEMENT res/values*/strings_generated.xml (en par defaut, fr, es, de, it, pt, ar) ; strings.xml reste a la main et ne garde que les chaines propres a Android. Cela inverse la proposition de l'inventaire (strings_android_only.xml) pour une raison de fusion : les autres domaines continuent d'ajouter des chaines a strings.xml pendant tout le chantier, et deplacer 1 593 entrees dans un autre fichier les ferait toutes entrer en conflit. Une chaine passe du fichier a la main au fichier genere par ADOPTION, module par module (lots libelles-*), en supprimant le nom de strings.xml dans les sept dossiers de locale. Deux fichiers d'un meme dossier values-xx ne doivent jamais definir le meme nom (AAPT refuse) : le garde le verifie.
2) Le manifeste par module (apps/android/i18n/manifest/<module>.json) est le contrat que les AUTRES domaines doivent utiliser. Un lot d'un autre domaine qui porte un ecran iOS ajoute les cles iOS de cet ecran au manifeste de son module (statut disabled -> adopted) ; il n'ecrit jamais a la main un libelle qui existe dans le catalogue iOS. Les familles de cles sans ecran Android (jeu et progression 1 414, composer 398, focal 23, lentille 30, appels 380 hors strings existantes, partage 100, onboarding 108, activation) ne sont PAS des lots ici : elles naissent avec leurs ecrans. Le lot table-correspondance-chaines leur prepare les manifestes (scaffold en statut disabled), ce qui couvre res-strings-domain-game-progression et res-strings-domain-composer-focal-lentille.
3) Les 592 chaines Android sans equivalent exact iOS ne sont pas toutes des libelles propres a Android : la table les classe une par une (android-only ou candidate par sens). Les android-only gardent sept traductions ecrites a la main dans chaque module (de, it, ar sont a produire : environ 600 x 3). Relecture native recommandee pour l'arabe avant publication. Les libelles iOS-only (Face ID, Siri, Live Activities, CarPlay) deviennent des android-only : biometrie, Assistant Google, notifications persistantes.
4) Le seul gate CI est android.yml (assembleDebug + testDebugUnitTest) : le lint n'y est pas. Les gardes de ce domaine sont donc des tests JUnit JVM (module :app, working dir apps/android/app, retrouvent la racine par gradle/libs.versions.toml comme SplashThemeGuardTest), pas des regles lint. Les lois pures (CLDR, choix de langue, miroir de geste, politique de police, plan de permission, repli des textes push, etat des activites) vont dans :core:model et se prouvent par ./apps/android/meeshy.sh jvm-check. :sdk-ui n'a PAS Robolectric : ses tests restent JVM purs.
5) Cliquets plutot que echecs en bloc : hardcoded-ui-baseline.txt, known-gaps.txt, la baseline des icones directes (lot table-icones) et l'ecart du selecteur de langue. Une ligne qui devient fausse fait echouer le test, comme les cliquets mesures du depot.
6) pt : on garde values-pt (portugais generique, regenere depuis le catalogue pt-BR) au lieu de values-pt-rBR + values-pt. Android resout pt-BR vers values-pt et un appareil pt-PT recoit du portugais plutot que de l'anglais. Le code d'interface stocke est pt-BR (comme UILanguageOverride), locales_config.xml liste pt-BR.
7) 'system' devient 'auto' (UILanguageOverride.automaticCode) : null reste la valeur canonique persistee, mais le sens passe de 'suivre l'appareil' a 'suivre la langue principale du compte, puis l'appareil' (Prisme Linguistique applique au chrome, regle 1 puis 4). Retrocompatible : le jeton stocke 'system' se decode toujours en null.
8) est_kotlin_lines compte tout le code ecrit a la main d'un lot, tests compris, y compris Python et Node (les lots generateur, table, tokens, catalogue, stickers sont pour moitie des scripts). Les XML generes (des milliers de lignes par lot libelles-*) ne sont pas comptes : ces lots ont un gros diff mecanique mais peu de code.

CORRECTIONS A L'INVENTAIRE (verifiees dans l'arbre)
- Sonnerie : sur iPhone, le destinataire entend la sonnerie systeme (CallManager.swift : ringtoneSound = nil, CallKit) ; Ringtone.caf ne joue que sur iOS-app-sur-Mac. Android GARDE donc la sonnerie appareil pour l'appele (iso) et n'embarque que RingbackTone et deux cues. Ne pas poser android.resource://raw/ringtone sur le canal d'appel entrant.
- MeeshyTokenParityTest.kt existe deja (litteraux iOS ecrits a la main). 'Aucune garde' est donc inexact : il manque la generation et la couverture des 30 jetons absents, pas un premier test.
- apps/web/public/.well-known/assetlinks.json ne liste que me.meeshy.app et me.meeshy.app.debug (la coque Capacitor) avec get_login_creds deja present ; les entrees me.meeshy.android et me.meeshy.android.debug restent a ajouter (docs/magic-link-app-links.md). Tant qu'elles manquent, les App Links verifies de l'app native ouvrent le navigateur. L'empreinte release doit venir du porteur.
- windowSplashScreenBrandingImage est ignore depuis Android 13 : ne pas l'ajouter pour reproduire AppIconFooter ; le pied de page de signature vit dans le Composable BrandSignature.
- La premiere ligne du garde de feed (FeedStringLocalizationParityTest) devient redondante : le garde transverse la remplace.
- Les icones PNG de repli du lanceur sont inutiles avec minSdk 26 mais LauncherIconManifestGuardTest les suppose : leur retrait est hors lot.

POINTS CHAUDS (fichiers editables par plusieurs lots, a serialiser par depends_on ou rebase)
- AndroidManifest.xml : libelle du point de partage (libelles-appels-notifications-app), android:localeConfig (langue-interface-systeme-android), meta-data FCM (notifications-identite-et-canaux), dataExtractionRules, networkSecurityConfig et hotes (manifeste-confidentialite-et-liens), service typé (activites-en-direct). Hunks disjoints, conflit textuel seulement.
- MeeshyFcmService.kt : notifications-identite-et-canaux -> langue-interface-systeme-android -> textes-push-proteges-et-repli (chaine de depends_on voulue). NotificationChannelInstaller.kt : identite-et-canaux puis sons-appel-de-marque.
- .github/workflows/android.yml : table-correspondance-chaines puis jetons-couleurs-generes-depuis-ios.
- app/src/main/res/values/colors.xml : notifications-identite-et-canaux puis identite-visuelle-logo-et-lancement.
- hardcoded-ui-baseline.txt : on n'y retire que des lignes (libelles-composants-partages, notifications-identite-et-canaux).
- ChatScreen.kt (plus de 2 800 lignes) : le lot libelles-chat ne change que 5 sites stringResource.

RISQUES ET DECISIONS HORS CODE
- Notifications app tuee : un push avec bloc notification est rendu par l'OS dans la langue que la passerelle a deja resolue (Prisme serveur) ; la table locale ne joue que pour onMessageReceived (premier plan ou data-only). Un rendu local pour l'app tuee demande android.notification.bodyLocKey cote passerelle (ext:gateway-android-body-loc-key, hors domaine). Les canaux par categorie iOS (messages, mentions, contacts, appels, systeme) demandent aussi un channelId par categorie cote passerelle ; ce domaine localise les canaux existants seulement.
- Poids : +1,7 Mo (stickers), +2,6 Mo (polices cadres de gloire), +0,44 Mo (catalogue d'apparence), +0,2 Mo (police arabe). Si l'APK depasse le budget, basculer sur Play Asset Delivery plutot que retirer.
- Juridique (agent conformite-juridique) : declaration Data Safety, traductions de/it/ar des textes legaux (les documents legaux restent en/fr/es/pt avec repli anglais explicite), nom de police reserve Cinzel (fichiers non modifies), droits d'usage des sons de RingbackTone. Date 'derniere mise a jour' des conditions : Android dit 23 aout 2026, iOS 24 fevrier 2026, pour un texte identique -> issue decision-produit assignee au porteur, a trancher avant de livrer libelles-reglages-et-textes-legaux.
- Lottie : verifier que la version de lottie-compose retenue lit les archives .lottie ; sinon decompresser (manifest.json + animations) au build dans le generateur.
- RTL : le canevas de story ne se miroite JAMAIS (coordonnees absolues, comme sur iOS) ; seuls les chromes se miroitent. Les 4 sites offset(x=) sont a decider un par un.
- Le --check de generation en CI est bloquant pour une PR qui touche apps/android et consultatif (continue-on-error) pour une PR iOS seule, pour ne pas faire echouer le travail iOS sur une regeneration Android.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `garde-localisation-android` | F0 | P0 | M | 650 |  | Une chaîne manquante, mal formatée ou écrite en dur fait échouer la CI sur tous les modules |
| `generateur-chaines-ios` | F0 | P0 | L | 1000 |  | Les chaînes Android se génèrent depuis les catalogues de traduction iOS |
| `table-correspondance-chaines` | F0 | P0 | M | 650 | generateur-chaines-ios, garde-localisation-android | Chaque chaîne Android sait de quelle clé iOS elle vient, ou dit qu'elle n'en a pas |
| `arabe-mise-en-page-droite-a-gauche` | B | P1 | L | 850 | langues-interface-sept-et-automatique, composer-glass-shell, composer-socle-decoupage-et-dependances, story-viewer-decomposition-and-nav-graph | L'application se lit de droite à gauche en arabe : mise en page, gestes, police et chiffres |
| `identite-visuelle-logo-et-lancement` | B | P1 | M | 330 | libelles-composants-partages, notifications-identite-et-canaux | Le logo, l'écran de lancement et l'icône Play affichent la marque aux trois barres, comme iOS |
| `jetons-couleurs-generes-depuis-ios` | B | P1 | M | 480 | table-correspondance-chaines | Les couleurs Android sont générées depuis MeeshyColors.swift et ne peuvent plus dériver |
| `langue-interface-systeme-android` | B | P1 | M | 420 | langues-interface-sept-et-automatique, notifications-identite-et-canaux, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias, socle-pipeline-push-et-cycle-de-vie | La langue d'interface vaut aussi dans les Réglages système, les notifications et les widgets |
| `langues-interface-sept-et-automatique` | B | P1 | M | 420 | libelles-conversations, libelles-chat, libelles-feed-stories-reels, libelles-reglages-et-textes-legaux, libelles-auth-profil-contacts, libelles-appels-notifications-app, libelles-composants-partages, socle-points-d-extension-de-l-app, settings-hub-iso-layout, socle-pipeline-push-et-cycle-de-vie | L'interface se choisit en sept langues, dont « Automatique » qui suit la langue principale du compte |
| `libelles-appels-notifications-app` | B | P1 | M | 300 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines, socle-points-d-extension-de-l-app | Les appels, les notifications, les widgets et le partage vers Meeshy parlent comme iOS |
| `libelles-auth-profil-contacts` | B | P1 | M | 220 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines | La connexion, le profil et les contacts disent les mêmes mots qu'iOS, en sept langues |
| `libelles-chat` | B | P1 | L | 380 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines, composer-glass-shell | Le fil de discussion et son compositeur disent les mêmes mots qu'iOS, avec de vrais pluriels |
| `libelles-composants-partages` | B | P1 | M | 330 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines, chat-bulle-decoupage-composants | Les composants partagés sont localisés comme iOS et lus correctement par TalkBack |
| `libelles-conversations` | B | P1 | M | 260 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines | La liste des conversations, la recherche et les liens de partage parlent comme iOS, en sept langues |
| `libelles-feed-stories-reels` | B | P1 | L | 340 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines | Le fil d'actualité, les stories et les reels disent les mêmes mots qu'iOS, y compris « traduction disponible » |
| `libelles-reglages-et-textes-legaux` | B | P1 | L | 380 | generateur-chaines-ios, garde-localisation-android, table-correspondance-chaines | Les réglages, l'export des données et les textes légaux sont alignés sur iOS, en sept langues |
| `manifeste-confidentialite-et-liens` | B | P1 | M | 420 | garde-localisation-android | Le manifeste Android déclare ses permissions, sa sauvegarde et ses liens vérifiés comme la fiche de confidentialité iOS |
| `notifications-identite-et-canaux` | B | P1 | M | 320 | libelles-appels-notifications-app, garde-localisation-android, socle-pipeline-push-et-cycle-de-vie | Les notifications portent l'icône Meeshy et des canaux nommés dans la langue de l'utilisateur |
| `permissions-cablage-ecrans` | B | P1 | M | 380 | media-permissions-au-bon-moment, libelles-chat, libelles-feed-stories-reels, libelles-appels-notifications-app, socle-points-d-extension-de-l-app, composer-glass-shell, calls-foundation-app-seams | Micro, caméra, localisation et notifications se demandent avec explication et un refus qui guérit |
| `textes-push-proteges-et-repli` | B | P1 | M | 380 | langue-interface-systeme-android, notifications-identite-et-canaux, libelles-appels-notifications-app, socle-pipeline-push-et-cycle-de-vie | Une notification protégée, chiffrée ou vocale affiche le bon texte localisé, jamais un corps vide |
| `metadonnees-fiche-google-play` | B | P2 | S | 180 | langues-interface-sept-et-automatique, identite-visuelle-logo-et-lancement | La fiche Google Play existe en sept langues et ses longueurs sont contrôlées |
| `polices-cadres-de-gloire-et-licences` | B | P2 | M | 320 | libelles-reglages-et-textes-legaux | Les polices des cadres de gloire sont embarquées intactes, chargées à la demande et créditées dans l'app |
| `table-icones-sf-symbols` | B | P2 | L | 750 | garde-localisation-android | Chaque symbole iOS a une icône Android décidée, et les nouvelles icônes passent par MeeshyIcons |

### Lots fusionnés ou retirés par l'architecture

- `activites-en-direct-notifications-persistantes` → `ongoing-activity-host` (drop-duplicate) : Même notification vivante (enregistrement, lecture, envoi, appel) ; couverte par l'hôte des activités en cours et ses contrôleurs.
- `catalogue-apparence-modele-et-synchro` → `catalogue-d-apparence-embarque` (drop-duplicate) : Même catalogue d'apparence embarqué.
- `catalogue-apparence-anneaux-et-fonds` → `rendu-des-fonds-et-bannieres-de-design` (drop-duplicate) : Mêmes fonds et anneaux d'avatar dessinés.
- `catalogue-apparence-bannieres-et-cadres` → `cadres-de-banniere` (drop-duplicate) : Mêmes bannières et cadres animés.
- `effets-jeu-shaders-agsl` → `game-shader-effects` (drop-duplicate) : Mêmes shaders AGSL du jeu.
- `permissions-explications-et-refus-composants` → `media-permissions-au-bon-moment` (merge-into) : Mêmes composants d'explication et de refus de permission.
- `sons-appel-de-marque` → `calls-incoming-ring-and-tones` (merge-into) : Mêmes sons de marque d'appel (ringback).
- `stickers-mee-catalogue-genere` → `catalogue-mee-meo-et-instants-genere` (drop-duplicate) : Même catalogue Mee/Meo généré.
- `stickers-mee-animes-et-selecteur` → `stickers-mee-meo-animes` (drop-duplicate) : Mêmes stickers Mee/Meo animés.
- `widgets-apercus-presence-lecture` → `widget-recent-conversations-faces` (merge-into) : Mêmes aperçus de widget avec présence et marquer lu.

## Features

### Arabe : ressources values-ar complètes et rendu RTL

`res-strings-lang-ar-rtl` · Android : **absente** · P0 · effort L

iOS livre l'arabe à 100 % (6 424 clés d'app, 1 757 du SDK, extensions, InfoPlist, métadonnées store ar-SA) et sait le rendre en RTL. Android : LanguageData.interfaceLanguageCodes = fr,en,es,ar, donc le sélecteur de langue propose l'arabe, mais aucun dossier values-ar n'existe : le choix retombe sur l'anglais sans le dire. Le manifeste a supportsRtl=true et 53 fichiers utilisent Icons.AutoMirrored, 50 usages d'Alignment Start/End ; restent à auditer 8 Modifier.offset(x=...) absolus, 18 fichiers à gestes de glissement horizontaux, et un test d'aperçu en RTL. La police Nunito (277 Ko, variable) ne contient pas les glyphes arabes : prévoir la police de repli (Noto Naskh/Kufi système ou embarquée), les chiffres arabo-indiens selon la locale et le formatage des dates et nombres. L'arabe requiert les 6 catégories plurielles.

Écarts :
- Aucun values-ar dans aucun des 14 modules à chaînes (~1 593 entrées + généré depuis iOS)
- Le sélecteur propose ar alors que la ressource n'existe pas : comportement trompeur
- Police Nunito sans glyphes arabes : repli à définir (FontFamily) pour TextStyle et saisie
- 8 offset(x=...) absolus et 18 fichiers à gestes horizontaux à contrôler en RTL ; sens des swipes et des carrousels à inverser
- Rendu RTL jamais vérifié : pas de capture ni de test @Preview en LayoutDirection.Rtl
- Pluriels arabes à 6 catégories (voir res-strings-plurals-cldr)
- Chiffres arabo-indiens et formats de date relatifs (RelativeTimeLongTextTest ne couvre que partiellement)
- Métadonnées de fiche store ar-SA absentes

Rendu : Miroir horizontal complet : tab bar, swipes, flèches, bulles (côté expéditeur), barres de progression. Les logos, nombres et médias ne se miroitent pas.

Transposition Android : values-ar générés ; CompositionLocalProvider(LocalLayoutDirection) déduit de la locale ; Modifier.offset absolu remplacé par des équivalents sensibles à la direction ; Icons.AutoMirrored systématique ; FontFamily avec repli Noto.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (ar: 6 424 clés)`
- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- `apps/ios/Meeshy/InfoPlist.xcstrings`
- `apps/ios/Meeshy/Core/UILanguageOverride.swift`
- `apps/ios/fastlane/metadata/ar-SA`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyType.kt`

### Chaîne de génération Localizable.xcstrings vers strings.xml Android (source de vérité unique)

`res-strings-xcstrings-sync-pipeline` · Android : **absente** · P0 · effort L

Aujourd'hui les strings.xml Android sont portées à la main depuis les catalogues iOS : noms snake_case propres à Android (conversations_title) sans table de correspondance avec les clés iOS (conversation.list.title, ou du français brut pour 598 clés « naturelles »). Résultat : 1 593 entrées Android pour 8 300 clés iOS, aucune traçabilité, dérive silencieuse (le fr Android diverge de 10 % du fr iOS, le pt de 17 %). Il faut un générateur (script Python ou Node, sur le modèle de packages/design-tokens/scripts/generate-from-ios.mjs) qui lit apps/ios/Meeshy/Localizable.xcstrings, packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings, les catalogues d'extensions et InfoPlist.xcstrings, et émet par module Android les values/, values-fr/, values-es/, values-de/, values-it/, values-pt-rBR/, values-ar/. Il doit gérer : conversion des spécificateurs (%@ vers %s, %lld vers %d, %.2f ; 886 chaînes anglaises à format, dont 58 à plusieurs spécificateurs non positionnels qui exigent la forme %1$s), %% (12 chaînes), retours ligne (5), balisage markdown ** (4 chaînes à convertir en AnnotatedString ou en <b>), échappement des apostrophes et des @, filtre des 488 entrées stale et des 256 clés jamais référencées, variantes plurielles, clés source fr sans localisation fr (389). Il faut aussi une table de correspondance versionnée clé iOS vers nom Android pour garder les noms existants (aucun call site à renommer) et un mode --check pour la CI.

Écarts :
- Aucun script xcstrings vers strings.xml dans apps/android/scripts (seul generate_legacy_launcher_icons.py existe)
- Pas de table de correspondance clé iOS vers nom de ressource Android : impossible de savoir quelle clé iOS est couverte sans comparer les textes (63 % de recouvrement exact seulement)
- Conversion %@/%lld/%d vers %1$s/%1$d à écrire, dont 58 chaînes multi-spécificateurs non positionnelles
- Markdown ** (4 chaînes) et retours ligne à traduire en AnnotatedString ou balises
- Filtrage des 488 entrées stale et des 256 clés non référencées par le code Swift
- Un mode --check en CI pour détecter la dérive entre catalogue et XML généré
- Découpage par module Android (auth, chat, conversations, feed, stories, settings...) à partir des préfixes de clés et des dossiers Swift référenceurs

Rendu : Aucun rendu direct, mais conditionne l'iso de tous les libellés (mêmes mots, même ton) entre les deux apps.

Transposition Android : xcstrings (JSON) vers res/values-<qualifier>/strings.xml ; pt-BR vers values-pt-rBR ; zh-Hans/pt partiels des extensions ignorés. Le générateur est un script du dépôt (Python/Node) ; est_kotlin_lines couvre uniquement le test JVM de parité et l'éventuelle tâche Gradle de vérification.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings`
- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- `apps/ios/Meeshy/InfoPlist.xcstrings`
- `apps/ios/scripts/check_localization.py`
- `packages/design-tokens/scripts/generate-from-ios.mjs`

</details>

Android existant : `apps/android/feature/*/src/main/res/values/strings.xml`, `apps/android/scripts/`

### Équivalent du PrivacyInfo.xcprivacy : Data Safety Google Play et règles de sauvegarde

`res-privacy-manifest-data-safety` · Android : **absente** · P1 · effort S

iOS déclare dans PrivacyInfo.xcprivacy : NSPrivacyTracking=false, 14 types de données collectées (identifiant utilisateur, e-mail, téléphone, contacts, localisation précise et grossière, photos/vidéos, audio, contenu utilisateur, données de crash et de performance, identifiant d'appareil, interactions produit, historique de recherche) et 4 catégories d'API à raison requise (boot time 35F9.1, UserDefaults CA92.1, file timestamp C617.1, active keyboards 3EC4.1). Android n'a aucun équivalent versionné : pas de déclaration Data Safety dans le dépôt, pas de dataExtractionRules (backup Android 12+), pas de networkSecurityConfig, alors que Firebase Analytics/Crashlytics/Messaging collectent les mêmes types. La déclaration Play doit rester cohérente avec la politique de confidentialité et le principe du carnet d'adresses (aucun contact non inscrit stocké en clair).

Écarts :
- Pas de document versionné des déclarations Data Safety (14 types à rapprocher)
- android:dataExtractionRules / fullBackupContent absents (allowBackup=false seul)
- Pas de network_security_config.xml (cleartext désactivé explicitement)
- Les SDK tiers (Firebase, WebRTC) doivent figurer dans la déclaration
- Avis juridique à recueillir (agent conformite-juridique)

Transposition Android : Fichier docs/ ou fastlane (supply) décrivant la fiche Data Safety, plus res/xml/data_extraction_rules.xml et network_security_config.xml.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/PrivacyInfo.xcprivacy`
- `apps/ios/PRIVACY_POLICY.md`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`

### Allemand : values-de à générer depuis le catalogue iOS

`res-strings-lang-de` · Android : **absente** · P1 · effort S

iOS livre l'allemand à 100 % (6 424 clés d'app, 1 757 du SDK, extensions, InfoPlist, fastlane/metadata/de-DE). Android n'a ni values-de ni l'entrée dans interfaceLanguageCodes. Les traductions existent déjà côté iOS : le coût est la génération (res-strings-xcstrings-sync-pipeline) plus l'ajout de la langue au sélecteur et la vérification des débordements de texte (mots composés longs) dans les composants à largeur contrainte.

Écarts :
- Aucun dossier values-de
- de absent de LanguageData.interfaceLanguageCodes
- Revue visuelle des troncatures (boutons, chips, onglets) en allemand
- Métadonnées de fiche store de-DE absentes

Transposition Android : values-de généré ; ajout du code « de » à AppLanguage et au sélecteur des Réglages.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (de)`
- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings (de)`
- `apps/ios/fastlane/metadata/de-DE`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`

### Italien : values-it à générer depuis le catalogue iOS

`res-strings-lang-it` · Android : **absente** · P1 · effort S

iOS livre l'italien à 100 % depuis le 2026-07-25 (app, SDK, extension de notification, descriptions d'autorisation, métadonnées store it). Android n'a ni values-it ni entrée dans le sélecteur. Même régime que l'allemand : génération + ajout à la liste des langues d'interface + contrôle visuel.

Écarts :
- Aucun dossier values-it
- it absent de interfaceLanguageCodes
- Métadonnées de fiche store it absentes

Transposition Android : values-it généré ; code « it » ajouté au sélecteur.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (it)`
- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings (it)`
- `apps/ios/fastlane/metadata/it`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`

### Catalogue d'apparence (fonds, bannières, anneaux d'avatar, cadres de bannière) en JSON partagé

`res-appearance-catalog-json` · Android : **absente** · P2 · effort XL

appearance-catalog.json (440 Ko, version 1) est synchronisé depuis packages/shared (scripts/sync-appearance-catalog-ios.ts + test appearance-catalog-ios-copy.test.ts) et embarqué en Swift (AppearanceCatalogData.swift). Contenu : 16 gamuts de couleurs, 5 packs de fonds d'écran (motifs de tuiles SVG et dégradés à blobs), 2 packs de bannières, 9 packs d'anneaux d'avatar (styles solid, double, dotted, gradient, dashed, ornements en chemins SVG), 7 packs de cadres de bannière (friezes, pièces d'angle, animations twinkle et sweep) et des chaînes fr/en/es. Android n'a aucun équivalent : les seuls fichiers « Appearance » (AppearanceParticleField, AppearanceTransform) concernent les effets de message, pas ce catalogue. Aucun moteur de rendu de chemins SVG paramétrés (PathParser Compose) pour tuiles, anneaux et cadres.

Écarts :
- Catalogue absent d'Android : fonds d'écran de conversation, bannières, anneaux d'avatar et cadres non rendus
- Synchronisation à étendre : un 3e copie Android avec la même garde d'identité que celle d'iOS
- Moteur de rendu : tuiles (patterns), dégradés à blobs, anneaux à styles, cadres à pièces/friezes/animations (twinkle, sweep), via Canvas et PathParser
- Chaînes fr/en/es du catalogue à aligner avec les 7 langues
- Respect du mode sombre (palettes light/dark par design)

Rendu : Les renderers doivent reproduire à l'identique motifs (opacités 0,06 à 0,32), anneaux (stroke relatif à 0,02 à 0,05 du rayon) et cadres (viewBox 300x100).

Transposition Android : app/src/main/assets/appearance-catalog.json copié par un script de sync depuis packages/shared ; parseur kotlinx.serialization + renderers Compose Canvas.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Resources/appearance-catalog.json`
- `packages/shared/scripts/sync-appearance-catalog-ios.ts`
- `packages/shared/__tests__/appearance-catalog-ios-copy.test.ts`

</details>

### Polices des cadres de gloire (Cinzel, Cormorant, Fraunces, Manrope) et licence OFL

`res-fonts-glory-frames` · Android : **absente** · P2 · effort M

iOS embarque 6 polices Google Fonts non modifiées (2,6 Mo : CinzelDecorative Black/Bold, Cinzel[wght], CormorantGaramond + Italic, Fraunces[SOFT,WONK,opsz,wght], Manrope[wght]) avec GloryFrameFonts-OFL.txt et NOTICE.md (empreintes sha256), enregistrées à la demande (CTFontManagerRegisterFontsForURL). Cinzel Decorative porte le nom de police réservé « Cinzel » : aucune conversion, sous-ensemble ni renommage sans avis de l'agent conformite-juridique (#10158). Android n'a aucune de ces polices ni de cadres de gloire. Le chargement Android doit être paresseux (assets/ ou res/font non compressé), les fichiers d'origine, le texte OFL accessible dans l'app.

Écarts :
- 6 fichiers .ttf (2,6 Mo) absents ; ajout dépendant de la fonctionnalité cadres de gloire
- Texte OFL + NOTICE à embarquer et à afficher (écran de licences)
- Conserver les fichiers tels que distribués (nom réservé Cinzel)
- Chargement à la demande pour ne pas alourdir le démarrage ni l'APK (+2,6 Mo)

Transposition Android : assets/fonts/glory/*.ttf + Typeface.createFromAsset / FontFamily(Font(assetManager, path)) enregistrés à la demande.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Resources/Fonts/GloryFrames`
- `apps/ios/Meeshy/Resources/Fonts/GloryFrames/NOTICE.md`
- `apps/ios/Meeshy/Resources/Fonts/GloryFrames/GloryFrameFonts-OFL.txt`

</details>

### Stickers animés Mee et Meo (264 fichiers .lottie) et leur index

`res-lottie-mee-stickers` · Android : **absente** · P2 · effort L

packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers contient 264 fichiers .lottie (archives dotLottie, 1,7 Mo) : 100 « instant », 64 « duo », 50 « meo », 50 « mee », avec l'index MeeStickerCatalog+Index.swift (164 entrées : mee, meo, duo, sans les instants) filtré par intention (bonjour, amour, fête, soutien, râle, coup de mou, surprise, quotidien, humour noir), tab, titre VoiceOver, emoji de repli et MeeStickerFilmView. Le contrat du message est celui du web (templateId « mee.<id> »). Android : le sélecteur de stickers de stories n'a que 8 catégories d'emoji (StickerCatalog.kt), aucune dépendance lottie-compose dans libs.versions.toml, aucun fichier .lottie. Les stickers reçus d'iOS ou du web s'afficheraient donc en emoji de repli.

Écarts :
- Aucune dépendance Lottie/dotLottie Android (vérifier le support du format .lottie par la version retenue)
- 264 fichiers (1,7 Mo) à embarquer ou à servir depuis le CDN pour ne pas alourdir l'APK
- Index des 164 stickers à générer depuis MeeStickerCatalog+Index.swift (ou depuis apps/web/src/lib/mee/)
- Rendu des stickers reçus (templateId mee.*) dans les bulles et les stories, avec repli emoji + PNG joint
- Sections par intention et libellés d'accessibilité (VoiceOver) à porter
- Les 100 « instants » dépendent de données saisies à l'envoi (lieu, heure, météo, message)

Transposition Android : lottie-compose (dotLottie) + catalogue Kotlin généré ; assets sous assets/mee_stickers/ ou téléchargement paresseux ; alternative : consommer les WebP du web.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerCatalog.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerCatalog+Index.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/MeeStickerFilmView.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`

### Shaders du jeu (GameShaders.metal) vers AGSL

`res-shaders-agsl-game` · Android : **absente** · P2 · effort M

packages/MeeshySDK/Sources/MeeshyUI/Resources/Shaders/GameShaders.metal (5 Ko) alimente les effets visuels du jeu (pièces, cérémonie de frappe). Android n'a ni module jeu ni shader. Équivalent : AGSL RuntimeShader (API 33+) avec repli Canvas ou dégradé statique sur API 26-32.

Écarts :
- Aucun shader AGSL
- Repli API 26-32 à définir (minSdk 26, RuntimeShader exige API 33)
- Dépend du module jeu

Transposition Android : Metal (MSL) vers AGSL (RuntimeShader + ShaderBrush) ; repli statique en dessous de l'API 33.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Shaders/GameShaders.metal`

</details>

### Fiche store : métadonnées localisées pour Google Play

`res-store-listing-metadata` · Android : **absente** · P2 · effort M

iOS embarque fastlane/metadata dans 7 dossiers (ar-SA, de-DE, en-US, es-ES, fr-FR, it, pt-BR) : name, subtitle, description (≈2,4 Ko), keywords, promotional_text, release_notes, urls, avec check_metadata.sh. Android n'a ni dossier de métadonnées Play, ni captures, ni icône 512x512, ni feature graphic dans le dépôt. Le texte de la fiche (name, short description 80 car., full description 4 000 car., release notes) est un livrable localisé, produit d'une dérivation des textes iOS.

Écarts :
- Aucun fastlane/metadata/android/<locale>/ (title, short_description, full_description, changelogs)
- Aucune icône 512x512, feature graphic 1024x500 ni captures téléphone/tablette
- 7 locales iOS à dériver (pt-BR, ar, de, it à créer)
- Contrôle de longueur Play (80/4 000 car.) à ajouter au check

Transposition Android : Dossier apps/android/fastlane/metadata/android/<locale> (supply) ; identifiant de publication me.meeshy.android.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/fastlane/metadata`
- `apps/ios/fastlane/check_metadata.sh`

</details>

### Chaînes MeeshyComposer, Focal, Lentille (aucun module équivalent)

`res-strings-domain-composer-focal-lentille` · Android : **absente** · P2 · effort XL

iOS : composer 398 clés, focal 23, lentille 30 (31 vues mobiles du MeeshyComposer, doctrine des rails, styles de texte, timeline). Android compose les stories (StoryComposerScreen, 140 chaînes stories_composer_*) et le chat avec un composer différent ; il n'a ni Focal ni Lentille. 60 clés composer sont appariées exactement (15 %). Les libellés du composer suivent le vocabulaire de docs/product/meeshy-composer-modele.md.

Écarts :
- Pas de MeeshyComposer natif : 338 clés composer sans équivalent
- Focal (3 sur 23) et Lentille (5 sur 30) quasi absents
- Les libellés des rails/portes/niveaux suivent la sémantique du modèle composer

Transposition Android : Génération à l'arrivée des modules ; les chaînes composer existantes de :feature:stories restent jusqu'à convergence.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes composer., focal., lentille.)`
- `apps/ios/Meeshy/Features/Main/Composer`
- `apps/ios/Meeshy/Features/Main/Focal`
- `apps/ios/Meeshy/Features/Main/Lentille`

</details>

Android existant : `apps/android/feature/stories/src/main/res/values/strings.xml`

### Chaînes jeu, progression et succès (aucun module Android)

`res-strings-domain-game-progression` · Android : **absente** · P2 · effort XL

iOS : 1 414 clés (game 961, game2 287, progression 113, achievement 53) pour la couche jeu (pièces Meeshy, sparks, rangs, rituels, cadres de gloire, atlas des règles). Android n'a aucun module ni aucune chaîne jeu (18 clés game appariées sur 961, soit des libellés génériques). C'est 17 % du catalogue iOS d'app. Ces chaînes naissent avec les écrans : elles ne se portent pas isolément.

Écarts :
- Pas de module :feature:game
- 1 414 clés à générer, avec 12 plurals de progression (points, streak, meesh)
- Cadres de gloire, pièces et rangs liés à des assets (voir res-assets-brand-logo-images, res-fonts-glory-frames)

Transposition Android : Création d'un module :feature:game ; ses chaînes sont générées dans son res/values*.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes game., game2., progression., achievement.)`
- `apps/ios/Meeshy/Features/Main/Game`

</details>

### Logos et images de marque (MeeshyLogo, AppIconFooter, CallKitIcon, pièce Meeshy)

`res-assets-brand-logo-images` · Android : **divergente** · P1 · effort S

iOS : MeeshyLogo.imageset (2x/3x, trois barres blanches sur carré indigo), AppIconFooter.imageset (signature de bas de splash), CallKitIcon.imageset (icône dans l'écran d'appel système) et MeeshCoin.svg (pièce du jeu, SVG currentColor). Android : BrandLogo.kt dessine un carré arrondi dégradé avec la lettre « M » en Text, alors que le logo iOS et l'icône du lanceur sont les trois barres : le logo in-app diverge de la marque. Pas de drawable vectoriel pour logo, footer ni pièce (res/drawable ne contient que les 3 couches du lanceur). Pas d'icône équivalente à CallKitIcon (PhoneAccount / CallStyle).

Écarts :
- BrandLogo dessine un « M » : remplacer par le glyphe des trois barres (déjà disponible dans ic_launcher_foreground.xml)
- Aucun drawable vectoriel pour logo / AppIconFooter / pièce Meeshy
- CallKitIcon sans équivalent (icône de PhoneAccount Telecom)
- Variante sombre du logo (fond noir, barres dégradées) non prévue

Rendu : Logo = trois barres arrondies blanches, longueurs décroissantes (≈ 579, 479, 379 px sur 1024) alignées à gauche, sur dégradé Indigo500 vers Indigo700 ; en sombre, fond noir et barres en dégradé.

Transposition Android : VectorDrawable (importer le SVG, ImageVector pour Compose) ; BrandLogo consomme painterResource.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Assets.xcassets/MeeshyLogo.imageset`
- `apps/ios/Meeshy/Assets.xcassets/AppIconFooter.imageset`
- `apps/ios/Meeshy/Assets.xcassets/CallKitIcon.imageset`
- `apps/ios/Meeshy/Assets.xcassets/MeeshCoin.imageset/MeeshCoin.svg`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/BrandLogo.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`

### Icône de notification de marque (petite icône monochrome, couleur d'accent)

`res-assets-notification-small-icon` · Android : **divergente** · P1 · effort S

Les notifications FCM posent setSmallIcon(android.R.drawable.sym_call_incoming) pour les appels et android.R.drawable.ic_dialog_email pour les messages (MeeshyFcmService.kt:224 et :281) : des drawables système, pas la marque Meeshy. Il n'y a pas de drawable ic_stat_meeshy (silhouette blanche des trois barres sur fond transparent) ni de meta-data com.google.firebase.messaging.default_notification_icon / default_notification_color, donc une notification affichée automatiquement par FCM (app fermée) utilise l'icône par défaut du système. iOS affiche toujours l'icône d'app et le thème indigo.

Écarts :
- Icône de petite taille système (ic_dialog_email, sym_call_incoming) au lieu de la marque
- Pas de ic_stat_meeshy 24 dp monochrome
- Pas de default_notification_icon/color dans le manifeste (affichage FCM en arrière-plan)
- Couleur d'accentuation (Indigo500 #6366F1) non posée via setColor
- Aucune icône d'avatar d'appelant dans le style d'appel (CallStyle) équivalente à CallKitIcon

Rendu : Silhouette 24 dp, uniquement alpha : trois barres décroissantes.

Transposition Android : drawable/ic_stat_meeshy.xml (vector blanc) + <meta-data> FCM dans le manifeste + NotificationCompat.setColor.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset`
- `apps/ios/Meeshy/Assets.xcassets/CallKitIcon.imageset`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/res/drawable/ic_launcher_monochrome.xml`

### Langue d'interface : sélecteur, locales_config et propagation hors Compose

`res-interface-language-per-app-locale` · Android : **divergente** · P1 · effort M

iOS applique la langue de chrome par UILanguageOverride (sentinelle « auto » = langue principale du compte, repli sur la locale appareil, liste supportedUICodes = 7 langues, garde LocalizationCatalogGuardTests). Android applique la langue via LocalizedContent (MainActivity.kt) en recréant le Context dans l'arbre Compose seulement : les chaînes de MeeshyFcmService (canal d'appel, texte de repli d'appel entrant), des widgets et des notifications utilisent la locale appareil, pas la langue choisie dans l'app. Il n'y a ni res/xml/locales_config.xml ni android:localeConfig, donc la page système « Langues des apps » (Android 13+) n'affiche rien. La liste est fr/en/es/ar, 4 codes contre 7 ; 'system' équivaut à « auto » mais sans l'étape « langue principale du compte ». Prisme Linguistique appliqué au chrome : la langue primaire du compte doit primer sur la locale appareil quand le choix est « auto ».

Écarts :
- AppLanguage.supportedCodes = fr,en,es,ar (4) contre 7 chez iOS
- Pas de locales_config.xml ni android:localeConfig : la langue ne se choisit pas dans les Réglages système Android 13+
- Chaînes du service FCM, des widgets et des notifications non soumises à la langue choisie dans l'app
- « auto » n'élit pas la langue primaire du compte (rang 1 du Prisme) avant la locale appareil
- Aucun test d'accord entre liste de langues, dossiers values-* et locales_config (voir res-strings-localization-guards)

Transposition Android : AppCompatDelegate.setApplicationLocales (ou LocaleManager API 33+) + res/xml/locales_config.xml dérivé des dossiers values-* ; Context localisé injecté dans le service FCM et les Glance widgets.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Core/UILanguageOverride.swift`
- `apps/ios/Meeshy/Info.plist (CFBundleLocalizations: fr,en,de,es,pt-BR,it,ar)`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppLanguage.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/language/InterfaceLanguageStore.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Portugais du Brésil : aligner values-pt sur pt-BR et l'exposer

`res-strings-lang-pt-br` · Android : **divergente** · P1 · effort S

iOS publie pt-BR (CFBundleLocalizations, 6 424 clés). Android livre values-pt (portugais générique) : sur les 942 chaînes appariées avec iOS, seules 83 % sont identiques à la traduction pt-BR d'iOS (contre 90 % en fr et 89 % en es), donc le pt Android a dérivé ou mélange des formes européennes. De plus « pt » n'est pas dans interfaceLanguageCodes : les utilisateurs ne peuvent pas le choisir (il ne sert que si la locale appareil est portugaise). Il faut régénérer en values-pt-rBR depuis le catalogue pt-BR, garder values-pt comme repli identique, et exposer « pt-BR » au sélecteur.

Écarts :
- 17 % des chaînes portées diffèrent de pt-BR iOS (à régénérer, pas à corriger à la main)
- pt absent de interfaceLanguageCodes : langue livrée mais non sélectionnable
- Qualificateur : passer à values-pt-rBR (+ values-pt en repli)
- Métadonnées de fiche store pt-BR absentes

Transposition Android : values-pt vers values-pt-rBR ; AppLanguage reconnaît « pt-BR » ; Locale.forLanguageTag("pt-BR") dans LocalizedContent.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (pt-BR)`
- `apps/ios/Meeshy/Core/UILanguageOverride.swift (supportedUICodes)`
- `apps/ios/fastlane/metadata/pt-BR`

</details>

Android existant : `apps/android/feature/*/src/main/res/values-pt/strings.xml`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`

### Textes système en dur en anglais (canaux de notification, contentDescription, signatures)

`res-strings-system-surfaces-hardcoded` · Android : **divergente** · P1 · effort S

Les écrans Compose utilisent bien les ressources (3 Text("...") littéraux seulement, aucun visible). Restent en dur : NotificationChannelInstaller (canal « Messages » + description « New messages and mentions »), 10 contentDescription littéraux (BrandLogo « Meeshy », VoiceRecordingPill « Cancel recording / Stop and add to attachment / Send voice message », LiveLocationBadge, MeeshySplashScreen), ainsi que les libellés d'actions de notification (déclin). iOS n'a pas ces trous : chaque clé passe par le catalogue en 7 langues. Les noms de canaux apparaissent dans les Réglages système Android : un utilisateur francophone voit « Messages », un arabophone aussi.

Écarts :
- Canal de notification « Messages » et sa description en dur en anglais
- 10 contentDescription littéraux (accessibilité TalkBack non localisée)
- Pas de garde qui interdise les littéraux UI (voir res-strings-localization-guards)
- Canaux de notification : un canal par catégorie iOS (messages, mentions, contacts, appels, système) à créer avec noms localisés

Transposition Android : getString(R.string.…) à l'installation des canaux, avec recréation si la langue change (les canaux sont immuables : nommer les ids par version).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings`
- `apps/ios/scripts/check_localization.py`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationChannelInstaller.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/BrandLogo.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/location/LiveLocationBadge.kt`

### Iconographie : correspondance SF Symbols vers icônes Android

`res-assets-icons-sf-symbols` · Android : **divergente** · P2 · effort L

iOS utilise au moins 312 noms de SF Symbols distincts en littéraux (systemName, systemImage) ; Android emploie 185 icônes Material distinctes (material-icons-extended) dans 91 fichiers. Il n'existe aucune table de correspondance, aucun VectorDrawable propre (res/drawable ne contient que le lanceur) : le rendu des icônes diffère (épaisseur, remplissage, glyphes manquants comme les variantes .fill et les symboles spécifiques de messagerie). Pour l'iso visuelle, la table SF vers ImageVector doit être explicite et versionnée, avec des vectors dédiés quand Material n'a pas d'équivalent.

Écarts :
- 312 symboles iOS contre 185 icônes Android : table de correspondance inexistante
- Pas de pack d'icônes de marque (ImageVector) pour les symboles sans équivalent Material
- Variantes .fill / .circle / .badge à rendre cohérentes (Filled vs Outlined)
- RTL : choisir AutoMirrored pour tous les symboles directionnels

Rendu : SF Symbols : traits fins à poids variable suivant la police ; Material arrondi : conserver le poids visuel et le remplissage par rôle.

Transposition Android : Objet MeeshyIcons (Compose) : une propriété par rôle sémantique (send, reply, translate…) mappée vers ImageVector Material ou vector maison.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views`
- `packages/MeeshySDK/Sources/MeeshyUI`

</details>

Android existant : `apps/android/gradle/libs.versions.toml (material-icons-extended)`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component`

### Sonneries d'appel de marque (Ringtone.caf, RingbackTone.caf) et sons système

`res-audio-call-tones` · Android : **divergente** · P2 · effort S

iOS embarque Ringtone.caf (245 Ko, sonnerie côté appelé, in-app sur Mac ; iOS passe par CallKit) et RingbackTone.caf (1,3 Mo, boucle côté appelant, volume 0,6), lus par RingbackTonePlayer, plus deux sons système (SystemSoundID 1057 « Tink », 1075 « fin »). Android n'a aucun fichier audio (ni res/raw ni assets) : CallToneController utilise ToneGenerator (TONE_SUP_RINGTONE pour le ringback, bips pour les cues) et RingtoneManager.TYPE_RINGTONE (sonnerie du téléphone), et le canal d'appel entrant pose la sonnerie système avec une vibration. Résultat : l'identité sonore est celle de l'appareil, pas de Meeshy, et le ringback diffère selon l'opérateur.

Écarts :
- Aucun res/raw : Ringtone et RingbackTone à convertir en ogg/wav (conserver durée et boucle), droits d'utilisation à vérifier
- ToneGenerator remplacé par un lecteur de ressource (MediaPlayer/SoundPool) pour le ringback
- Canal d'appel entrant : son = android.resource://…/raw/ringtone au lieu de la sonnerie système, ou choix utilisateur ; respecter le mode silencieux
- Cues « Tink » et « fin » : 2 sons courts à embarquer
- Réglage utilisateur de la sonnerie (iOS passe par CallKit) à décider

Transposition Android : res/raw/ringtone.ogg, ringback.ogg, cue_connect.ogg, cue_end.ogg ; CallToneController lit ces ressources (CallSoundPolicy inchangée).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Resources/Ringtone.caf`
- `apps/ios/Meeshy/Resources/RingbackTone.caf`
- `apps/ios/Meeshy/Features/Main/Services/RingbackTonePlayer.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallToneController.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallSoundPolicy.kt`

### Typographie : SF Pro (Rounded) d'iOS contre Nunito variable d'Android

`res-fonts-typography-nunito` · Android : **divergente** · P2 · effort S

iOS emploie la police système (SF, design arrondi pour les grands titres via MeeshyFont) et Dynamic Type. Android embarque une seule famille, Nunito (res/font/nunito.ttf, 277 Ko, axe wght 200-1000), substitut assumé de SF Pro Rounded, avec l'échelle iOS en sp (caption 10, footnote 11, subhead 13, body 15, headline 17, title 22, largeTitle 34, écran 46). Écarts : Nunito n'a ni glyphes arabes ni CJK (repli système non défini explicitement) ; les styles de texte de story Android utilisent FontFamily.Serif/Monospace/Cursive génériques (StoryComposerScreen.kt:1223) au lieu de polices embarquées ; pas d'équivalent aux ajustements de Dynamic Type (courbes non linéaires). La licence OFL de Nunito est dans apps/android/licenses.

Écarts :
- Pas de repli explicite pour l'arabe, le CJK et l'emoji
- Styles de texte de story en FontFamily génériques : rendu variable selon l'appareil
- Aucun écran de licences listant les polices embarquées
- Mise à l'échelle de la taille de police système (font scale) à comparer à Dynamic Type

Rendu : Substitution assumée : Nunito (arrondie) remplace SF Pro Rounded ; ne pas la remplacer par la police par défaut Roboto.

Transposition Android : FontFamily(Font(R.font.nunito), repli système) ; polices de story via res/font ou assets sous OFL.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift`
- `apps/ios/Meeshy/Resources/Fonts/GloryFrames/NOTICE.md`

</details>

Android existant : `apps/android/sdk-ui/src/main/res/font/nunito.ttf`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyType.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/licenses/OFL-Nunito.txt`

### Garde-fous CI de localisation Android (parité des locales, placeholders, plurals, chaînes en dur)

`res-strings-localization-guards` · Android : **partielle** · P0 · effort M

iOS a deux garde-fous : apps/ios/scripts/check_localization.py (bidirectionnel : toute clé identifiant utilisée existe en en, toute clé du catalogue est utilisée) et LocalizationCatalogGuardTests (cohérence entre CFBundleLocalizations, UILanguageOverride.supportedUICodes et catalogues). Android n'a qu'un test, FeedStringLocalizationParityTest, limité au module :feature:feed. Mesure ce jour : 0 clé manquante entre en/fr/es/pt et 0 incohérence de placeholders sur les 14 fichiers, mais rien ne le garantit pour les autres modules ni pour les locales à venir (ar, de, it, pt-BR). Il faut un test JVM transversal (ou un lint fatal) qui vérifie sur tous les modules : chaque clé de values/ existe dans chaque locale livrée, mêmes spécificateurs, catégories plurielles CLDR complètes par langue (ar : zero/one/two/few/many/other), absence de chaîne UI en dur, et accord entre AppLanguage.supportedCodes et les dossiers values-* présents.

Écarts :
- Un seul module couvert (feed) sur 13
- Aucun test que AppLanguage.supportedCodes (fr,en,es,ar) correspond aux values-* livrés : ar est proposé sans ressource, pt livré sans être proposé
- Aucune vérification des catégories plurielles par langue
- Pas de lint MissingTranslation/ExtraTranslation/StringFormatInvalid en erreur fatale (à confirmer dans build.gradle)
- Pas de contrôle iOS vers Android (clé iOS utilisée par une feature portée mais absente d'Android)
- 10 contentDescription et la chaîne du canal de notification restent en dur (voir res-strings-system-surfaces-hardcoded)

Transposition Android : Test JUnit JVM qui parse les res/values* du dépôt (comme FeedStringLocalizationParityTest) plus règles lint Android en error pour MissingTranslation, ExtraTranslation, PluralsCandidate, StringFormatMatches.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/scripts/check_localization.py`
- `apps/ios/MeeshyTests/Unit/Architecture/LocalizationCatalogGuardTests.swift`
- `apps/ios/Meeshy/Core/UILanguageOverride.swift`

</details>

Android existant : `apps/android/feature/feed/src/test/kotlin/me/meeshy/app/feed/FeedStringLocalizationParityTest.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`

### Jetons de couleur : génération depuis MeeshyColors.swift et garde de parité Android

`res-design-tokens-colors-generation` · Android : **partielle** · P1 · effort M

packages/design-tokens/scripts/generate-from-ios.mjs lit MeeshyColors.swift + DesignTokens.swift et écrit ios.css (182 lignes, généré, gardé par --check en CI) pour le web. Android recopie à la main MeeshyPalette.kt (≈ 30 couleurs « strict 1:1 port »), MeeshyColorScheme.kt et MeeshyThemeTokens.kt, sans générateur ni garde. Mesure : sur 58 couleurs Color(hex:) d'iOS, 6 n'existent nulle part dans le Kotlin (violet950 #2E1065, errorInk #C81E1E, meeshSilver #A8B1BF, surfaceDarkDeep #0F0D19, surfaceLightMist #FAFAFF, blockedNeutral #888888) et 24 manquent à MeeshyPalette.kt (états view-once/ephemeral/concealed, tuiles coral/saffron/amber, tracking/share/communityAccent, etc. — certains vivent peut-être dans d'autres fichiers). Il faut étendre le générateur pour émettre un fichier Kotlin et un test qui compare.

Écarts :
- 6 jetons iOS absents du Kotlin, 24 absents de MeeshyPalette.kt
- Aucun générateur iOS vers Kotlin : les valeurs sont recopiées, donc divergent
- Pas de garde de parité (test comparant Color(hex:) iOS aux constantes Kotlin)
- Couleur d'accent de conversation (ColorGeneration.swift : mélange langue 30 % / type 30 % / thème 40 %, décalage de teinte ±30°) à vérifier contre Android
- Échelle de typographie et rayons (DesignTokens.swift) à comparer à MeeshyType.kt / MeeshyDimens.kt

Transposition Android : Script Node (même source Swift) émettant MeeshyPaletteGenerated.kt ; test JUnit qui échoue si MeeshyColors.swift change sans régénération.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift`
- `packages/design-tokens/scripts/generate-from-ios.mjs`
- `packages/design-tokens/ios.css`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPalette.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyColorScheme.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyThemeTokens.kt`

### Permissions et capacités du manifeste (équivalents des clés Info.plist et entitlements)

`res-manifest-permissions-capabilities` · Android : **partielle** · P1 · effort M

Manifeste Android : INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, FOREGROUND_SERVICE (+ _MICROPHONE, _CAMERA), RECORD_AUDIO, CAMERA, MODIFY_AUDIO_SETTINGS, ACCESS_FINE/COARSE_LOCATION, DETECT_SCREEN_RECORDING, USE_FULL_SCREEN_INTENT. Face aux capacités iOS (Info.plist + entitlements) il manque : READ_CONTACTS (carnet d'adresses, NSContactsUsageDescription), USE_BIOMETRIC (Face ID : le verrouillage de conversation, conversations_lock_*, existe côté Android sans biométrie : aucune occurrence de BiometricPrompt), MANAGE_OWN_CALLS + FOREGROUND_SERVICE_PHONE_CALL (équivalent CallKit/VoIP, alors que core/model contient TelecomCallPolicy), FOREGROUND_SERVICE_MEDIA_PLAYBACK (mode audio en arrière-plan), FOREGROUND_SERVICE_MEDIA_PROJECTION (partage d'écran, extension Broadcast), BLUETOOTH_CONNECT (routage audio d'appel), RECEIVE_BOOT_COMPLETED sert au travail différé (BGTaskScheduler). Pas de networkSecurityConfig (iOS : ATS NSAllowsArbitraryLoads=false), pas de dataExtractionRules (allowBackup=false est posé).

Écarts :
- READ_CONTACTS absente (carnet d'adresses et « X a rejoint Meeshy » : une empreinte HMAC pour les non-inscrits, directive #9225)
- USE_BIOMETRIC absente (verrou de conversation)
- Telecom (MANAGE_OWN_CALLS, ConnectionService) absent alors que la politique existe
- FGS mediaPlayback et mediaProjection absents
- BLUETOOTH_CONNECT absente
- Pas de network_security_config.xml ni android:dataExtractionRules
- Chaque ajout doit déclarer sa justification (res-permission-rationales-and-denied-states) et rester rétrocompatible avec la fiche Play

Transposition Android : Info.plist NS*UsageDescription vers uses-permission + invite runtime ; CallKit vers Telecom Jetpack (CallsManager) ; Face ID vers BiometricPrompt ; Live Activities vers notifications persistantes (FGS typé).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Info.plist`
- `apps/ios/Meeshy/Meeshy.entitlements`
- `apps/ios/MeeshyBroadcastExtension`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/TelecomCallPolicy.kt`

### Textes de justification et états « permission refusée » (Info.plist vs Android)

`res-permission-rationales-and-denied-states` · Android : **partielle** · P1 · effort M

iOS : 9 NS*UsageDescription localisées en 7 langues (caméra, contacts, Face ID, localisation, micro, photothèque en lecture et en ajout, reconnaissance vocale, + NSVoIPUsageDescription) via InfoPlist.xcstrings, plus environ 25 clés d'état refusé avec bouton « Ouvrir les Réglages » (permission.camera.denied, camera.permission.denied.*, composer.recent.accessDenied, feed.nearby.empty.denied.*, contacts.sync.access-denied, call.video.permission.denied, story.mine.save.photosDenied, game.photo.camera.denied). Android : les permissions sont demandées (RequestPermission/RequestMultiplePermissions dans CallScreen, ChatComposer, FeedComposerSheet, NearbyScreen) mais sans écran de justification avant demande, et seules 3 chaînes « permission » existent (nearby_permission_title/message/action). Aucun usage de shouldShowRequestPermissionRationale, aucun lien vers les Réglages de l'app quand l'utilisateur coche « ne plus demander ».

Écarts :
- Pas de dialogue de justification (rationale) avant RECORD_AUDIO, CAMERA, ACCESS_*_LOCATION, POST_NOTIFICATIONS, READ_CONTACTS
- Pas d'état « refusé » avec bouton vers Settings.ACTION_APPLICATION_DETAILS_SETTINGS : micro refusé en appel, caméra refusée, photo non sauvegardée, localisation refusée (seule la carte « À proximité » en a un)
- ~25 chaînes iOS d'état refusé à porter (7 langues)
- Caméra du chat par intent de capture : aucune permission CAMERA nécessaire, mais le texte « autoriser la caméra » diffère

Transposition Android : Composable commun PermissionRationale/PermissionDenied dans :sdk-ui ; textes depuis InfoPlist.xcstrings (descriptions) et permission.* (états).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/InfoPlist.xcstrings`
- `apps/ios/Meeshy/Info.plist`
- `apps/ios/Meeshy/Localizable.xcstrings (permission.*, camera.permission.*, composer.recent.accessDenied.*)`

</details>

Android existant : `apps/android/feature/feed/src/main/res/values/strings.xml`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPermissions.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Chaînes auth, onboarding, vérification e-mail, lien magique, 2FA

`res-strings-domain-auth-onboarding` · Android : **partielle** · P1 · effort M

iOS : environ 376 clés (auth 103, onboarding 114, emailVerification 26, signInLink 10, twofactor 5, welcome 5, guest/visitor/joinFlow/worldEntry/upgradeGate/arrival/discovery…), référencées par Features/Auth (146 clés), Features/Onboarding (117), Features/Activation (21). Android :feature:auth a 94 chaînes (54 appariées exactement à iOS, 57 %). Écart d'environ 280 clés, majoritairement l'onboarding gamifié (6 clés appariées sur 114), l'activation et les parcours visiteur/invité.

Écarts :
- onboarding.* : 6 clés sur 114 couvertes (parcours d'accueil, récompenses de points)
- Activation (20 clés) et visiteur/invité (joinFlow, guest*, worldEntry) non couverts
- emailVerification : 4 clés sur 26
- Écarts de libellés sur 40 chaînes auth non appariées
- Les écrans correspondants ne sont pas tous portés (voir domaines feature)

Transposition Android : Chaînes générées par module ; les écrans manquants relèvent des domaines features, ce lot ne couvre que le catalogue.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes auth., onboarding., emailVerification., signInLink., twofactor.)`
- `apps/ios/Meeshy/Features/Auth`
- `apps/ios/Meeshy/Features/Onboarding`
- `apps/ios/Meeshy/Features/Activation`

</details>

Android existant : `apps/android/feature/auth/src/main/res/values/strings.xml`

### Chaînes d'appel (effets, sous-titres, enregistrement, qualité, partage d'écran)

`res-strings-domain-calls` · Android : **partielle** · P1 · effort L

iOS : 463 clés (call 413 + calls 50), l'écart le plus fort entre les deux apps : effets d'appel, légendes en direct, transcription, enregistrement, qualité réseau, journal réseau, partage d'écran, cadre live, humeurs. Android :feature:calls n'a que 45 chaînes (31 appariées, 69 %). Environ 380 clés iOS n'ont aucun équivalent, car les écrans correspondants n'existent pas côté Android (CallScreen, notification d'appel entrant, décliner).

Écarts :
- 45 chaînes Android pour 463 clés iOS (10 %)
- Absents : effets d'appel (CallEffects*), sous-titres/transcription, enregistrement, qualité réseau, feedback d'appel, partage d'écran, cadre live, capture
- Chaînes de permission d'appel (caméra/micro refusés, capture) absentes (voir res-permission-rationales-and-denied-states)
- Textes de notification d'appel entrant (call_incoming_audio/video, call_channel_*) à vérifier contre iOS

Transposition Android : Génération des clés pour les écrans portés ; les clés des fonctions d'appel absentes arrivent avec leurs écrans.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes call., calls., call.transcription., call.video., call.capture.)`
- `apps/ios/Meeshy/Features/Main/Views/CallView*.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/res/values/strings.xml`

### Chaînes contacts, profil, invitations, liens de partage, communautés

`res-strings-domain-contacts-profile-share` · Android : **partielle** · P1 · effort M

iOS : environ 485 clés (contacts 94, profile 70, participantProfile 42, share 151, shareLink 59, invite 37, community 19, communityLink 7, friends 5, communities). Android : :feature:contacts 47 + :feature:profile 67 = 114 chaînes (74 appariées, 65 %) ; une partie du partage vit dans :feature:conversations (share_link_*, my_share_links_*). Le carnet d'adresses (contacts.sync.*, NSContactsUsageDescription) n'a pas d'équivalent : aucune permission READ_CONTACTS côté Android.

Écarts :
- share.* : 48 clés appariées sur 151 (écran de partage unifié absent)
- contacts.* : 23 sur 94
- community.* : 4 sur 19
- Parcours carnet d'adresses / « X a rejoint Meeshy » sans chaînes ni permission

Transposition Android : Génération par module.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes contacts., profile., participantProfile., share., shareLink., invite., community.)`
- `apps/ios/Meeshy/Features/Contacts`

</details>

Android existant : `apps/android/feature/contacts/src/main/res/values/strings.xml`, `apps/android/feature/profile/src/main/res/values/strings.xml`, `apps/android/feature/conversations/src/main/res/values/strings.xml`

### Chaînes conversations, bulles, messages, pièces jointes, médias

`res-strings-domain-conversations-chat` · Android : **partielle** · P1 · effort L

iOS : environ 931 clés sur conversation, conversations, conversationCard, bubble, message, forward, attachment, media, media_hub, participants, thread, typing, reaction, reading_mode, draft, new_conversation, linkpreview, effects, emoji, swipe, sticker, starred, bookmarks, search, voice, audio, video, camera, gallery, location, reveal, viewer. Android a :feature:conversations (237 chaînes) et :feature:chat (278), soit 515 chaînes, dont 350 appariées exactement à iOS (68 %). Reste environ 580 clés iOS dont la majorité correspond à des écrans non portés (voice profile, media_hub, reading_mode, gallery, reveal, location 0 sur 24).

Écarts :
- location.* : 0 clé sur 24 couverte
- media_hub 7/26, voice 8/60, camera 0/11, reveal 2/15, reading_mode 1/17
- bubble.* : 15 sur 84
- Une partie des chaînes iOS vit dans des écrans non portés (galerie, profil vocal, lecture)
- Libellés d'état (vide/chargement/erreur/hors-ligne) à vérifier un à un contre iOS

Transposition Android : Génération par module ; les écrans manquants sont couverts par les lots feature correspondants.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes conversation., bubble., message., attachment., media., participants., voice., camera., location.)`
- `apps/ios/Meeshy/Features/Main/Views/Bubble`

</details>

Android existant : `apps/android/feature/conversations/src/main/res/values/strings.xml`, `apps/android/feature/chat/src/main/res/values/strings.xml`

### Chaînes feed, posts, commentaires, stories, status, reels

`res-strings-domain-feed-stories-reels` · Android : **partielle** · P1 · effort L

iOS : environ 508 clés (feed 216, story 193, post 21, comment(s) 21, status 20, reels 12, mood, hashtag, quote, riviere, streak…). Android : :feature:feed 150 chaînes + 4 plurals, :feature:stories 140 + 1 plural, :feature:reels 19, soit 309 chaînes, 177 appariées exactement (57 %). Les familles du Prisme (posts/commentaires, légendes de story) exigent que les libellés « traduction disponible » soient identiques.

Écarts :
- story.* : 44 clés appariées sur 193
- feed.* : 47 sur 216
- Reels : 12 clés iOS, 19 Android, textes en grande partie différents (11 appariés)
- Composer story : styles de texte, filtres, cadres (voir domaines composer et polices)

Transposition Android : Génération par module.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes feed., story., post., comment., status., reels.)`
- `apps/ios/Meeshy/Features/Stories`

</details>

Android existant : `apps/android/feature/feed/src/main/res/values/strings.xml`, `apps/android/feature/stories/src/main/res/values/strings.xml`, `apps/android/feature/reels/src/main/res/values/strings.xml`

### Chaînes de notifications in-app et textes de substitution de push (NSE)

`res-strings-domain-notifications-push` · Android : **partielle** · P1 · effort M

iOS : clés notification.*/notifications.* (53) + catalogue de la NSE (7 : message vocal, invitation, position partagée, message chiffré, éphémère avec échéance, message masqué, vue unique) + NotificationContentExtension (6). Android : :feature:notifications 23 chaînes (19 appariées, 83 %). Côté push, la passerelle pose notificationLocKey sur les messages protégés, la NSE iOS le rend depuis sa table ; MeeshyFcmService n'a aucune table équivalente (aucune lecture de notificationLocKey dans apps/android), donc un message à vue unique, chiffré ou éphémère affiche ce que le corps du push contient, sans rendu localisé local.

Écarts :
- Pas de table de textes de substitution par notificationLocKey côté Android (message vocal, chiffré, éphémère, vue unique, masqué)
- Libellé « disparaît à %@ » (éphémère) absent
- Textes de notification déployée (contact card, ouvrir dans Plans, vitesse de lecture) sans équivalent
- Catégories de notifications et libellés de canaux à aligner (voir res-strings-system-surfaces-hardcoded)

Transposition Android : MeeshyFcmService lit notificationLocKey et rend la chaîne depuis res/values-*, dans la langue d'interface élue (res-interface-language-per-app-locale).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/MeeshyNotificationExtension/Localizable.xcstrings`
- `apps/ios/MeeshyNotificationContentExtension/Localizable.xcstrings`
- `apps/ios/Meeshy/Localizable.xcstrings (préfixes notification., notifications.)`

</details>

Android existant : `apps/android/feature/notifications/src/main/res/values/strings.xml`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Chaînes réglages, compte, sessions, export RGPD, aide, à propos

`res-strings-domain-settings-account` · Android : **partielle** · P1 · effort L

iOS : environ 1 050 clés (settings 214, export 123, a11y 125, accessibility 38, sessions 34, about 34, dashboard 32, notification(s), account 25, moderation 22, report 34, tracking 48, affiliate 20, sync 60, support 16, security 14, crash 8…). Android : :feature:settings a 347 chaînes (311 + 36 légales), 203 appariées (59 %). Les groupes a11y/accessibility (163 clés iOS, 34 appariées), export (123, 18 appariées), tracking (48, 8), sync (60, 2) sont les plus en retard. Le total settings couvre la parité §L (export GDPR) en partie.

Écarts :
- a11y.* + accessibility.* : 34 clés appariées sur 163 : descriptions TalkBack à compléter
- export.* : 18 sur 123
- tracking.* : 8 sur 48 ; sync.* : 2 sur 60
- moderation 2/22, report 22/34, sessions 5/34
- Libellés propres à iOS (Face ID, Siri, Live Activities) à traduire en équivalents Android (biométrie, Google Assistant, notifications persistantes)

Transposition Android : Génération ; les libellés iOS-only (Siri, Live Activities, Face ID) sont remplacés par la forme Android dans le fichier strings_android_only.xml.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (préfixes settings., export., a11y., accessibility., sessions., about., tracking., sync.)`
- `apps/ios/Meeshy/Features/Main/Views/AboutView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/res/values/strings.xml`, `apps/android/feature/settings/src/main/res/values/legal.xml`

### fr, en, es : alignement du texte sur les catalogues iOS

`res-strings-lang-fr-en-es-wording` · Android : **partielle** · P1 · effort M

Les 3 langues déjà livrées sont complètes entre elles (14 fichiers x 3 locales, 0 clé manquante, 0 incohérence de placeholder). Mais 37 % des chaînes Android n'ont pas leur texte anglais exact côté iOS (592 sur 1 593) et, parmi les 920 chaînes appariées, 10 % (fr) et 11 % (es) diffèrent de la traduction iOS. Quelques valeurs semblent non traduites (identiques à l'anglais hors noms propres : 12 en fr dans chat, 18 dans settings, etc., dont une grande part de cognats légitimes). Le principe « mêmes mots, même ton » (dimension 6) exige de lever ces écarts en régénérant depuis le catalogue.

Écarts :
- 592 chaînes Android dont le texte anglais n'existe pas chez iOS (libellés Android spécifiques ou reformulés)
- 10 % du fr et 11 % de l'es portés diffèrent de la traduction iOS correspondante
- Vérifier les ~100 valeurs identiques à l'anglais pour séparer cognats et oublis
- Décider par chaîne : l'iOS fait foi, sauf libellé purement Android (retour système, partage) à garder

Transposition Android : Régénération depuis xcstrings avec table de correspondance ; les libellés propres à Android restent dans un fichier non généré (strings_android_only.xml).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (en, fr, es)`

</details>

Android existant : `apps/android/feature/*/src/main/res/values/strings.xml`, `apps/android/feature/*/src/main/res/values-fr/strings.xml`, `apps/android/feature/*/src/main/res/values-es/strings.xml`

### Pluriels CLDR par langue (6 plurals Android contre 64 clés plurielles iOS)

`res-strings-plurals-cldr` · Android : **partielle** · P1 · effort M

iOS déclare 64 clés à variations plurielles : 61 avec les 6 catégories arabes (zero, one, two, few, many, other), 3 en one/other en arabe, et one/other pour les 6 autres langues. Exemples : conversation.members-count, composer.effects.active, feed.post.stat.likes, thread.repliesCount, progression.points, widget.preview.memberCount. Android ne possède que 6 plurals (chat 1, feed 4, stories 1) et 12 sites getQuantityString/pluralStringResource. Au moins 30 chaînes à compteur sont écrites en forme invariable ou avec « (s) » : chat_effects_active_count (« %1$d effect(s) active »), chat_forward_members (« %d members », non positionnel), chat_header_members, chat_pinned_count, chat_typing_many, my_share_links_joined_count, global_search_members, reels_comments_count, twofactor_backup_codes_remaining, etc. En français (0 et 1 au singulier), en espagnol/portugais (catégorie many) et surtout en arabe, ces formes sont fausses.

Écarts :
- 58 plurals iOS sans équivalent Android
- 30+ chaînes comptées en forme invariable à convertir en <plurals> (stringResource vers pluralStringResource)
- « effect(s) » à remplacer par un vrai pluriel
- chat_forward_members utilise %d non positionnel (échoue le lint avec plusieurs langues)
- Catégories zero/two/few/many manquantes pour l'arabe (61 clés), many pour es/pt/fr (millions)
- Le générateur doit émettre <plurals> depuis les variations xcstrings et vérifier les quantités requises par langue

Transposition Android : xcstrings variations.plural vers <plurals><item quantity=...> ; call sites vers pluralStringResource(R.plurals.x, count, count). Les formats de nombre suivent la locale (Arabic-Indic digits selon locale appareil).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Localizable.xcstrings (64 clés avec variations plural)`

</details>

Android existant : `apps/android/feature/chat/src/main/res/values/strings.xml`, `apps/android/feature/feed/src/main/res/values/strings.xml`, `apps/android/feature/stories/src/main/res/values/strings.xml`, `apps/android/feature/conversations/src/main/res/values/strings.xml`

### Catalogue SDK MeeshyUI (1 885 clés) face à :sdk-ui (80 chaînes)

`res-strings-sdk-ui-catalog` · Android : **partielle** · P1 · effort M

packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings contient 1 885 clés (1 757 localisées en 7 langues) pour les composants partagés : bulles, pickers, story, media, packs, pastilles de présence. :sdk-ui n'a que 80 chaînes (44 appariées exactement à iOS, 55 %). 393 clés SDK iOS ont un équivalent Android au texte identique ; les autres composants SDK (stories viewer, stickers, shop, médias) sont partiellement portés avec leurs propres chaînes dans les features.

Écarts :
- 80 chaînes pour 1 885 clés : environ 5 %
- Chaînes SDK dupliquées par les features Android (bubble_* dans sdk-ui, mais aussi dans chat) : à dédoublonner par clé source
- Générateur à étendre au catalogue SDK, avec attribution de chaque clé au module Android qui l'affiche

Transposition Android : Clés SDK dans :sdk-ui/res/values*, consommées par les features via R.string du module.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`

</details>

Android existant : `apps/android/sdk-ui/src/main/res/values/strings.xml`, `apps/android/sdk-ui/src/main/res/values-fr/strings.xml`

### Liens d'application (applinks, webcredentials) face aux filtres d'intention

`res-app-links-associated-domains` · Android : **partielle** · P2 · effort S

iOS : associated domains applinks sur meeshy.me, www.meeshy.me, api.meeshy.me, gate.meeshy.me et webcredentials sur meeshy.me, www.meeshy.me ; schéma meeshy://. Android : schéma meeshy:// (+ hôtes chat/profile), App Links vérifiés sur https://meeshy.me pour /auth/magic-link, /u/, /chat/, /join/ ; la vérification suppose apps/web/public/.well-known/assetlinks.json avec le SHA-256 de la clé de release (docs/magic-link-app-links.md). Absents : www.meeshy.me, gate.meeshy.me et api.meeshy.me, et l'équivalent webcredentials (Digital Asset Links delegate_permission/common.get_login_creds pour Credential Manager / mots de passe). Deux identifiants d'application (me.meeshy.android natif, me.meeshy.app coque Capacitor) : assetlinks doit lister les deux.

Écarts :
- Hôte www.meeshy.me absent des filtres autoVerify
- Hôtes api/gate : à décider (liens servis par la passerelle)
- Pas de relation webcredentials / get_login_creds dans assetlinks.json
- assetlinks.json doit contenir les deux package names et les empreintes de release
- Chemins supportés à comparer avec la liste iOS (ExternalEntry)

Transposition Android : intent-filter autoVerify par hôte + public/.well-known/assetlinks.json (apps/web) ; Credential Manager pour webcredentials.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Meeshy.entitlements`
- `apps/ios/Meeshy/Info.plist (CFBundleURLTypes)`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/docs/magic-link-app-links.md`

### Icône d'application (adaptive icon et variantes)

`res-assets-app-icon` · Android : **partielle** · P2 · effort S

iOS : AppIcon.appiconset avec Light/Dark/Tinted 1024 + 10 tailles macOS. Android : icône adaptative (fond en dégradé Indigo500 vers Indigo700, premier plan trois barres blanches mesurées sur Icon-Light-1024, variante monochrome pour les icônes thématiques Android 13+), plus 10 PNG de repli (mdpi à xxxhdpi, normaux et ronds) générés par scripts/generate_legacy_launcher_icons.py. Le rendu est fidèle à la variante Light. Il manque l'icône Play 512x512 et la décision pour la variante sombre (sur iOS le fond devient noir avec barres dégradées ; sur Android 13+ le thème monochrome la remplace).

Écarts :
- Pas d'icône Play Store 512x512
- 10 PNG de repli inutiles : minSdk=26, les mipmap-anydpi-v26 suffisent (à confirmer par le lanceur)
- Pas de variante « sombre » du fond pour les lanceurs qui la supportent (Android 15+ : icônes sombres automatiques)
- logo_master.svg d'iOS dessine une bulle avec traits, différent de l'icône publiée (barres) : choisir la source graphique unique

Rendu : Trois barres arrondies blanches décroissantes alignées à gauche sur dégradé indigo ; zone de sécurité 66 dp déjà respectée.

Transposition Android : Adaptive icon (vector) + monochrome ; source unique à désigner entre logo_master.svg et Icon-Light-1024.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset`
- `apps/ios/logo_master.svg`
- `apps/ios/logo_dark.svg`
- `apps/ios/logo_tinted.svg`

</details>

Android existant : `apps/android/app/src/main/res/drawable/ic_launcher_background.xml`, `apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml`, `apps/android/app/src/main/res/drawable/ic_launcher_monochrome.xml`, `apps/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, `apps/android/scripts/generate_legacy_launcher_icons.py`

### Écran de lancement, couleur d'accent et thèmes XML (clair/sombre)

`res-assets-launch-screen-accent-theme` · Android : **partielle** · P2 · effort S

iOS : UILaunchScreen avec UIColorName=AccentColor (AccentColor.colorset : sRGB 0.345/0.478/1.000, soit #587AFF, identique en clair et en sombre), puis splash animé SwiftUI. Android : Theme.Meeshy.Starting (SplashScreen API, fond splash_background #1E1B4B = Indigo950, icône = ic_launcher_foreground) puis MeeshySplashScreen Compose ; res/values ne contient que ce 1 jeton de couleur et 2 styles, pas de values-night. Deux écarts : (1) la couleur de lancement iOS (#587AFF) n'est ni l'Indigo500 (#6366F1) ni l'Indigo950 d'Android ; (2) le thème XML est DayNight sans couleur de fenêtre, donc l'éclair avant le premier frame Compose utilise les couleurs par défaut de Material en mode clair.

Écarts :
- #587AFF (iOS) contre #1E1B4B (Android) : décision de marque à documenter
- Pas de values-night/colors.xml ni de couleur de fond de fenêtre cohérente avec MeeshyColorScheme
- Pas de windowSplashScreenBrandingImage (équivalent AppIconFooter)
- Pas de couleur de barre système (statusBar/navigationBar) dans le thème XML

Transposition Android : values/colors.xml + values-night/colors.xml dérivés du générateur de jetons (res-design-tokens-colors-generation).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Assets.xcassets/AccentColor.colorset`
- `apps/ios/Meeshy/Info.plist (UILaunchScreen)`

</details>

Android existant : `apps/android/app/src/main/res/values/colors.xml`, `apps/android/app/src/main/res/values/themes.xml`, `apps/android/app/src/test/kotlin/me/meeshy/app/SplashThemeGuardTest.kt`

### Textes légaux (conditions d'utilisation et politique de confidentialité)

`res-strings-legal-documents` · Android : **partielle** · P2 · effort S

Les deux apps portent les textes intégralement : iOS dans TermsOfServiceView/PrivacyPolicyView (en et fr, sélecteur de langue du document, clés legal.* = 14), Android dans legal.xml (36 chaînes x 4 locales). Le contenu convergent (même clause de crédit d'auteur), mais les dates affichées divergent : Android « Terms : Last updated August 23, 2026 » contre iOS « legal.terms.lastUpdated : February 24, 2026 » pour un texte pourtant identique ; l'une des deux dates est périmée. iOS limite les documents à en/fr ; Android les livre en en/fr/es/pt. Quand les nouvelles langues arrivent, un avis juridique est requis avant de publier les traductions (agent conformite-juridique).

Écarts :
- Date « dernière mise à jour » des conditions : août 2026 côté Android, février 2026 côté iOS pour un texte identique : trancher la bonne date
- Les documents légaux n'ont pas de source unique (Swift d'un côté, XML de l'autre)
- Traductions es/pt/de/it/ar des textes légaux sans relecture juridique
- Pas de sélecteur de langue du document (le document suit la langue d'interface)

Transposition Android : legal.xml reste un fichier non généré ; sa date et son texte pointent vers une source unique (packages/shared ou docs) à décider.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift`
- `apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift`
- `apps/ios/Meeshy/Localizable.xcstrings (legal.*)`

</details>

Android existant : `apps/android/feature/settings/src/main/res/values/legal.xml`, `apps/android/feature/settings/src/main/res/values-fr/legal.xml`

### Chaînes des widgets, du partage d'écran et de l'extension de partage

`res-strings-widgets-and-extensions` · Android : **partielle** · P2 · effort S

iOS : MeeshyWidgets 28 clés (3 widgets + QuickReply + intents), MeeshyBroadcastExtension 2 (erreur d'appel, partage arrêté), MeeshyShareExtension (nom « Share to Meeshy » en 7 langues). Android : 16 chaînes widget_* dans le module app pour 4 widgets Glance, textes proches de ceux d'iOS mais non identiques (« All caught up » contre « All Read »). Absents : libellés de présence des widgets (online/away/idle/offline), « Mark as read », intent MarkRead, aperçus (groupCount, linkCount, memberCount, shareJoined…), et les 14 clés widget.* plurielles. ShareTargetActivity utilise app_name comme libellé : « Partager sur Meeshy » n'existe pas.

Écarts :
- Libellé du point de partage Android = app_name au lieu d'un « Partager vers Meeshy » localisé
- Présence (online/away/idle/offline) et « Marquer comme lu » absents des widgets
- Textes de partage d'écran (MediaProjection) absents
- Textes d'aperçu widget pluriels non portés

Transposition Android : Chaînes widget dans :app ; ShareTargetActivity reçoit son propre android:label localisé.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/MeeshyWidgets/Localizable.xcstrings`
- `apps/ios/MeeshyBroadcastExtension/Localizable.xcstrings`
- `apps/ios/MeeshyShareExtension/InfoPlist.xcstrings`

</details>

Android existant : `apps/android/app/src/main/res/values/strings.xml`, `apps/android/app/src/main/AndroidManifest.xml`

### Widgets d'écran d'accueil (aperçus) et Live Activities vers notifications persistantes

`res-widgets-previews-live-activities` · Android : **partielle** · P2 · effort M

iOS : MeeshyWidgets (iOS 17) = widgets de messages non lus, conversations récentes, contacts favoris, réponse rapide, plus 4 Live Activities (appel, file d'envoi, lecture vocale, enregistrement vocal), avec attributs et styles (LiveActivityStyle, LiveActivityAvatarStore). Android : 4 widgets Glance déclarés (unread_count, recent_conversations, favorite_contacts, quick_reply), 4 fichiers res/xml/*_widget_info.xml dont android:previewImage pointe sur @mipmap/ic_launcher (l'icône du lanceur sert d'aperçu dans le sélecteur de widgets, donc aucun vrai aperçu) et initialLayout = glance_default_loading_layout. Aucun équivalent des Live Activities : pas de notification persistante pour l'enregistrement vocal, la lecture vocale, la file d'envoi.

Écarts :
- android:previewImage = icône du lanceur : fournir de vrais aperçus (previewLayout API 31+ ou drawable) par widget
- Live Activities : 4 équivalents (enregistrement vocal, lecture vocale, envoi en cours, appel) via notifications persistantes/foreground services typés (API 36 : notifications centrées sur la progression)
- Présence et « marquer comme lu » dans les widgets
- Adapter la taille (targetCellWidth) aux familles iOS (small/medium/large)

Transposition Android : AppWidgetProviderInfo + previewLayout ; Live Activities vers NotificationCompat ongoing + ProgressStyle (API 36) avec repli.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/MeeshyWidgets/MeeshyWidgets.swift`
- `apps/ios/MeeshyWidgets/CallLiveActivity.swift`
- `apps/ios/MeeshyWidgets/OutboxLiveActivity.swift`
- `apps/ios/MeeshyWidgets/VoicePlaybackLiveActivity.swift`
- `apps/ios/MeeshyWidgets/VoiceRecordingLiveActivity.swift`

</details>

Android existant : `apps/android/app/src/main/res/xml/unread_count_widget_info.xml`, `apps/android/app/src/main/res/xml/recent_conversations_widget_info.xml`, `apps/android/app/src/main/res/xml/favorite_contacts_widget_info.xml`, `apps/android/app/src/main/res/xml/quick_reply_widget_info.xml`

### share-placeholder.mp4 : ressource iOS sans objet sur Android

`res-ios-only-share-placeholder` · Android : **sans objet** · P2 · effort S

share-placeholder.mp4 (1,5 Ko, vidéo H.264 noire 16x16) sert à ShareFilePlaceholder : une feuille de partage iOS décide de ses activités sur les placeholders de UIActivityItemSource avant que le fichier réel n'existe (#9682). Android partage par Intent.ACTION_SEND avec un URI FileProvider (file_paths.xml existe), sans placeholder : aucune action requise.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Resources/Share/share-placeholder.mp4`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/ShareFilePlaceholder.swift`

</details>

Android existant : `apps/android/app/src/main/res/xml/file_paths.xml`

