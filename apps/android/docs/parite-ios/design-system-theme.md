# Parité iOS → Android : `design-system-theme`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**100 features iOS** : 33 absentes, 55 partielles, 8 divergentes, 4 complètes sur Android. **60 lots** planifiés (≈51830 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**design-system-theme#1** (couverture Android estimée ≈ 28 %)

Cette partie regroupe la fondation visuelle de l'app iOS : palette Indigo et jetons (MeeshyColors, ThemePalette, DesignTokens), thème clair/sombre/auto synchronisé au serveur, kit d'accessibilité et de réduction de mouvement, surfaces verre et modificateurs d'animation, en-tête repliable, squelettes de chargement, toasts de retour, formats localisés, plus le moteur « Apparence » (catalogue embarqué de fonds, contours d'avatar, cadres de bannière animés, décor de profil équipé, fond personnel par conversation) et le shell iPad (deux colonnes redimensionnables, panneaux de droite, fenêtres détachées).
Côté Android, la base de marque est déjà portée de façon fidèle (MeeshyPalette, tokens clair/sombre, dégradés, Nunito, MeeshyBackground, MeeshyGlassSurface, CollapsibleHeader simplifié, ThemeStore, DynamicColorGenerator, écran de rapports de crash, toast atome), mais plusieurs valeurs ont dérivé : textes secondaire et discret sous le seuil WCAG AA (valeurs d'avant D-18), orbes d'ambiance différents, échelles d'espacement et de rayon incomplètes, comptes abrégés « K/M/B » figés en point décimal, rainbow en bordure au lieu de lettres colorées.
Absents sur Android : tout le système Apparence (catalogue, fond personnel, contours, cadres, moteur de mouvements, équipement du décor), le noyau Reduce Motion (préférence in-app + système + wrappers), le kit de sémantique a11y (état d'interrupteur, ajustables, identifiants de test), les squelettes shimmer par écran, le gestionnaire global de toasts, les états d'échec de contenu, le Prisme des chromes sur canevas (luminance), la bande de chrome du haut, l'en-tête de feuille Annuler/Terminé, la feuille d'autocollants avec packs, le badge de son d'arrière-plan, la présence de conversation (viewing:*), et toute la mise en page tablette/multi-fenêtre.
Android ne livre que 4 langues (en, fr, es, pt) contre 7 à 9 sur iOS (de, it, ar, zh-Hans manquent) : les noms du catalogue Apparence et le RTL arabe en dépendent.
Estimation globale : environ 28 % de la surface de cette partie est déjà couverte ou équivalente sur Android ; le reste est un chantier d'environ 16 000 lignes Kotlin, dont le tiers pour le moteur Apparence.

**design-system-theme#2** (couverture Android estimée ≈ 28 %)

Cette partie regroupe le « châssis » applicatif iOS : routeur et liens profonds (Router, DeepLinkRouter, EmailLinkSecret, portes story/réel/visiteur), cycle de vie (arrière-plan, base GRDB par compte, BGTasks, diagnostics de crash), langue d'interface (Prisme appliqué au chrome), feedback utilisateur (toasts, haptiques, annonces VoiceOver, états vides, squelettes) et les primitives visuelles de MeeshyUI (avatar, pastilles, glass, boutons flottants, swipe de ligne, pull-to-refresh, réactions, rendu du texte riche, pipeline d'images, légendes, bouclier de capture).
Android a déjà : un NavHost Compose avec ~60 routes et quelques deep links, ShareLinkEntryResolver (portage complet), Room + SessionTeardown, un enregistreur de crash local, des pastilles/boutons flottants déplaçables, un EmojiPicker scrubbable, un parseur de texte (gras/italique/mentions/URL), les politiques pures d'appel (thermique, image sombre) et ComposeLanguageDetector/Sentiment.
Les écarts structurants : aucune adaptation tablette/fenêtre (pas de WindowSizeClass, bulle fixe à 300 dp, pas de volets), MeeshyAvatar sans image ni contexte ni contour équipé, pas de gestionnaire global de toasts (Snackbars locales), pas de vocabulaire haptique, pas de shimmer, rendu markdown sans blocs/hashtags/liens [label](url)/trackedLinks, aucune carte, aucun bouclier de capture ni portillon de sortie (vue unique/éphémère), liens profonds limités (pas de post/story/reel/hashtag/communauté/lien de suivi/parrainage), pas de contenu visiteur sans compte, pas de synchro arrière-plan WorkManager, pas de récupération de base corrompue, interface limitée à en/fr/es/pt (iOS : fr/en/es/de/pt-BR/it/ar) et aucune consommation de reducedMotion.
Les fichiers purement iOS (version shims, SwiftUI re-render, CADisplayLink, sceaux réseau de tests) sont listés en non mappés. Estimation de parité du lot : environ 28 %, avec une base réutilisable solide (modèles purs dans :core:model) mais l'essentiel du rendu Compose et du câblage système restant à écrire.

## Notes transverses

1) Convention de chemins : values{,-fr,-es,-pt}/strings.xml designe les quatre fichiers de ressources du module cite ; apres le lot interface-allemand-italien ajouter -de et -it, apres interface-arabe-rtl ajouter -ar. Les estimations est_kotlin_lines comptent production + tests ; les trois lots de traduction comptent des lignes XML. 2) Fichiers chauds hors budget (interdit d'y ajouter, il faut extraire d'abord) : MeeshyApp.kt (1202 lignes, extrait par le lot socle), StoryComposerScreen.kt (2022), ChatScreen.kt (2953), ChatViewModel.kt (2248). Les lots qui y touchent doivent echanger une extraction contre chaque ajout. 3) Le lot socle-points-d-extension-de-l-app est le prealable de tout le chassis : il cree six points d'extension Hilt @IntoSet (AppInitializer, AppOverlay, AppLocalsProvider, RealtimeBinding, NavGraphContributor, PerAccountCache) pour que MeeshyApplication, MeeshyApp, RealtimeSessionCoordinator, SessionTeardown et les NavGraph ne soient plus edites par chaque lot, et ajoute en une fois les dependances Gradle (lottie-compose, androidx.window, material3-adaptive, media3-session, maps-compose, haze) : les conteneurs n'atteignent pas dl.google.com, la CI android.yml est le seul juge de la resolution. 4) Serialisation par depends_on des fichiers partages : Routes.kt (routeur), MainActivity.kt (liens profonds), StoryComposerScreen.kt (hex puis composer puis autocollants), ProfileScreen.kt (squelettes puis completude puis photo puis adoption), ConversationRow.kt (glisser puis fond de conversation puis fenetres detachees), SettingsScreen/ViewModel (theme puis langue), SessionTeardown.kt (socle puis base locale), PreferencesSocketManager. Le manifeste est un fichier additif partage (liens profonds, fenetres detachees, service media, cle Maps) : conflits triviaux a rebaser. 5) Les lots d'adoption (derniers) touchent chaque module feature une seule fois ; ils croisent les lots des autres domaines (chat, feed, profil, stories) : a ordonnancer avec eux. Les lots composants gardent des signatures source-compatibles (nouveaux parametres optionnels) pour que les 43 sites MeeshyAvatar et 26 sites AsyncImage compilent sans changement. 6) Infra de test : sdk-ui n'a que junit+truth (pas de Robolectric/MockK/Turbine) ; toute loi va dans :core:model (verifiable en local par ./apps/android/meeshy.sh jvm-check) ou dans un presenter pur ; le rendu Compose n'est prouve que par assembleDebug en CI. 7) Incoherence a corriger : AppLanguage.supportedCodes = fr/en/es/ar alors que les ressources livrees sont en/fr/es/pt ; la cible est fr,en,es,de,pt,it,ar (pt couvre pt-BR). Le garde StringsTranslationParityTest (lot langue-interface) empeche les lots suivants d'oublier une langue. 8) Lois a respecter : Prisme (la langue du chrome suit systemLanguage sauf choix explicite, lot langue-interface ; la legende de media servie est celle resolue par LanguageResolver ; le selecteur de traduction marque la langue lue) ; presence (hors ligne = aucun point, typing:start force online, point ici = viewing:*, aucun etat local ne prolonge la presence servie) ; accent de conversation deterministe (blend langue 0,30 / type 0,30 / theme 0,40, secondaire +30, accent -30) ; le decor de profil est visible des autres, le fond de conversation n'est visible que du lecteur. 9) Fonctions deja completes, ignorees : dst-crash-report-sheet, dst-flow-layout, dst-share-link-entry-resolver, dst-composer-text-analysis. 10) Risques/decisions : fournisseur de carte (Google Maps Compose + cle d'API en secret CI, repli placeholder sans Play Services) ; Crashlytics optionnel (NoOp sans google-services.json) ; SharedTransitionLayout est experimental en Compose 1.7 (BOM 2024.10.01) ; base par compte = nom de fichier derive de l'id et relance du processus au changement de compte (les DAO sont des singletons injectes) ; 10 occurrences left=/right= a convertir en start/end pour le RTL. 11) Copies sync a livrer avec leurs temoins : packages/shared/scripts/sync-appearance-catalog-android.ts (+ test de copie identique) et vecteurs email-link-secret.test.ts / frame-motion-svg.ts / text-blocks.ts rejoues cas pour cas en Kotlin. 12) Dette Android a consigner en commentaire de cloture (jamais en fichier) : routes communautes/progression/liens/hashtag/humeur-spotlight et ecrans reset-password/verify-email relevent d'autres domaines (ext:*).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `accessibilite-annonces-haptique-et-sens-de-lecture` | F0 | P0 | M | 900 | echelles-de-jetons-ressorts-et-typographie | Lecteurs d'ecran, clavier et toucher disposent du kit d'accessibilite d'iOS (cibles 48 dp, interrupteurs, annonces, haptique, sens de lecture) |
| `atomes-d-avatar-loi-humeur-et-non-lus` | F0 | P0 | M | 900 | reduire-les-animations-et-micro-animations, accessibilite-annonces-haptique-et-sens-de-lecture | Chaque avatar suit la meme loi de contextes et de presence, l'humeur respire discretement et la pastille de non-lus n'apparait que s'il y en a |
| `avatar-unique-et-branchement-social` | B | P0 | L | 1300 | atomes-d-avatar-loi-humeur-et-non-lus, images-instantanees-et-politique-de-telechargement, reduire-les-animations-et-micro-animations, accessibilite-annonces-haptique-et-sens-de-lecture, routeur-de-navigation-hubs-et-cibles-differees | Un avatar unique montre photo, anneau de story, humeur et presence partout, et un tap ouvre le bon lecteur |
| `boutons-flottants-contre-les-bords` | B | P0 | M | 650 | verre-flou-et-surfaces-opaques, mesures-de-fenetre-et-largeurs-de-lecture, socle-points-d-extension-de-l-app | Les deux boutons flottants se posent contre un bord a n'importe quelle hauteur, sans se chevaucher ni passer sous l'encoche |
| `catalogue-d-apparence-embarque` | B | P0 | L | 1700 |  | Le catalogue de fonds, contours et cadres est embarque, tolerant et disponible hors ligne en sept langues |
| `contours-d-avatar-equipes` | B | P0 | M | 700 | catalogue-d-apparence-embarque, mouvement-des-cadres, rendu-des-fonds-et-bannieres-de-design, decor-de-profil-equipe-et-synchronise, avatar-unique-et-branchement-social, atomes-d-avatar-loi-humeur-et-non-lus | Les avatars des autres affichent le contour qu'ils ont equipe |
| `couleurs-de-marque-et-contraste-aa` | F0 | P0 | M | 600 |  | Les couleurs de marque, d'etat de message et de media sont celles d'iOS et les textes secondaires passent le contraste AA |
| `couleurs-hex-accent-et-surfaces-teintees` | B | P0 | M | 800 | couleurs-de-marque-et-contraste-aa, socle-points-d-extension-de-l-app, composer-socle-decoupage-et-dependances | Toute couleur hexadecimale s'affiche juste, chaque conversation garde son accent deterministe et les surfaces teintees suivent iOS |
| `decor-de-profil-equipe-et-synchronise` | B | P0 | M | 900 | catalogue-d-apparence-embarque, socle-points-d-extension-de-l-app, socket-routage-evenements-ordre-arrivee, message-fil-decodage-complet-et-tolerant, story-model-split-un-type-par-fichier | J'equipe un contour, une banniere et un cadre sur mon profil et les autres le voient sur tous mes appareils |
| `echelles-de-jetons-ressorts-et-typographie` | F0 | P0 | M | 500 |  | Espacements, rayons, tailles, ressorts et typographie suivent les echelles iOS et grandissent avec la police systeme |
| `en-tete-repliable-et-pages-de-reglages` | B | P0 | L | 1300 | echelles-de-jetons-ressorts-et-typographie, reduire-les-animations-et-micro-animations, verre-flou-et-surfaces-opaques | L'en-tete de chaque ecran se reduit en douceur au defilement et les sous-pages de Reglages et de Liens ont un retour en verre |
| `entete-d-identite-de-message-post-et-commentaire` | B | P0 | M | 950 | avatar-unique-et-branchement-social, accessibilite-annonces-haptique-et-sens-de-lecture | L'en-tete d'identite d'un message, d'un post ou d'un commentaire compose nom, role, heure, statut et actions de la meme facon |
| `etats-vides-et-echecs-de-contenu` | F0 | P0 | M | 500 | couleurs-de-marque-et-contraste-aa, echelles-de-jetons-ressorts-et-typographie | Une liste vide ou un contenu introuvable explique pourquoi et ne propose Reessayer que si cela a un sens |
| `images-instantanees-et-politique-de-telechargement` | B | P0 | L | 1200 | squelettes-reflet-et-etats-de-chargement | Les images apparaissent instantanement (cache, flou ThumbHash), decodees a la bonne taille et soumises a la politique de telechargement |
| `liens-a-jeton-d-e-mail-jamais-ouverts-dans-l-app` | B | P0 | M | 700 |  | Un lien a jeton d'e-mail ne connecte jamais par accident et s'ouvre dans un navigateur, jamais dans l'app |
| `mesures-de-fenetre-et-largeurs-de-lecture` | B | P0 | M | 650 | socle-points-d-extension-de-l-app, echelles-de-jetons-ressorts-et-typographie, chat-bulle-decoupage-composants | L'interface s'adapte a la fenetre reelle (telephone, tablette, pliable, multi-fenetre) et evite l'encoche |
| `mouvement-des-cadres` | B | P0 | M | 950 | catalogue-d-apparence-embarque, reduire-les-animations-et-micro-animations | Contours et cadres s'animent sans cout de redessin et se mettent en pause hors ecran, en economie d'energie ou en reduction de mouvement |
| `rangees-glissantes-a-trois-actions` | B | P0 | M | 900 | accessibilite-annonces-haptique-et-sens-de-lecture, atomes-d-avatar-loi-humeur-et-non-lus | Glisser une ligne revele jusqu'a trois actions par cote, une seule ligne ouverte a la fois |
| `reactions-rapides-quinze-emojis` | B | P0 | M | 550 | accessibilite-annonces-haptique-et-sens-de-lecture, verre-flou-et-surfaces-opaques | Reagir par une barre de quinze emojis scrubbable, avec le selecteur complet en feuille |
| `reduire-les-animations-et-micro-animations` | F0 | P0 | M | 800 | echelles-de-jetons-ressorts-et-typographie, socle-points-d-extension-de-l-app | Reduire les animations (systeme ou app) supprime tout mouvement non essentiel et les elements reagissent au toucher avec les ressorts d'iOS |
| `rendu-des-fonds-et-bannieres-de-design` | B | P0 | L | 1000 | catalogue-d-apparence-embarque, couleurs-hex-accent-et-surfaces-teintees, reduire-les-animations-et-micro-animations, atomes-d-avatar-loi-humeur-et-non-lus | Fonds et bannieres de design se dessinent a partir de donnees vectorielles, sans saccade |
| `reprise-sur-base-locale-corrompue` | B | P0 | M | 700 | socle-points-d-extension-de-l-app, toasts-de-retour-globaux, persist-room-migrations, persist-app-lifecycle-hooks | La base locale s'ouvre toujours, meme corrompue, et se purge a la deconnexion en prevenant d'une perte d'envois |
| `routeur-de-navigation-hubs-et-cibles-differees` | B | P0 | L | 1250 | socle-points-d-extension-de-l-app, chat-viewmodel-state-split, composer-socle-decoupage-et-dependances | La navigation garde une pile coherente (hubs qui se depilent, retour predictif, surfaces qui retiennent un travail) et atterrit sur un message ou un commentaire |
| `socle-points-d-extension-de-l-app` | F0 | P0 | L | 1200 | dependances-gradle-scene-medias | Le chassis de l'app accueille de nouveaux ecrans, superpositions et taches de demarrage sans toucher a MeeshyApp |
| `squelettes-reflet-et-etats-de-chargement` | B | P0 | L | 1250 | couleurs-de-marque-et-contraste-aa, echelles-de-jetons-ressorts-et-typographie, reduire-les-animations-et-micro-animations, feed-screen-split, profile-own-page-split | Pendant un chargement a froid, des squelettes aux dimensions exactes scintillent seulement quand un chargement est reellement en cours |
| `texte-riche-loi-markdown-blocs-hashtags-liens-de-suivi` | F0 | P0 | L | 1200 |  | Le texte des messages, posts et commentaires comprend markdown, blocs, hashtags, liens de suivi et arc-en-ciel par lettre |
| `texte-riche-rendu-et-legendes-de-media` | B | P0 | L | 1100 | texte-riche-loi-markdown-blocs-hashtags-liens-de-suivi, couleurs-de-marque-et-contraste-aa, story-viewer-decomposition-and-nav-graph | Le texte riche se rend en blocs cliquables et la legende d'un reel ou d'une story se lit a l'ombre et se deplie au-dela de 30 mots |
| `toasts-de-retour-globaux` | F0 | P0 | M | 900 | socle-points-d-extension-de-l-app, accessibilite-annonces-haptique-et-sens-de-lecture, verre-flou-et-surfaces-opaques | Chaque action locale affiche un toast de retour en haut, annonce, tappable et ferme automatiquement |
| `transitions-arriere-plan-premier-plan` | B | P0 | M | 800 | socle-points-d-extension-de-l-app, reprise-sur-base-locale-corrompue, plan-ouverture-fermeture-session, persist-outbox-registre-senders | L'app passe en arriere-plan et en revient sans perdre ses sockets, ses envois en attente ni ses compteurs |
| `verre-flou-et-surfaces-opaques` | F0 | P0 | M | 650 | couleurs-de-marque-et-contraste-aa, echelles-de-jetons-ressorts-et-typographie, socle-points-d-extension-de-l-app | Les cartes et controles poses sur du verre ont un vrai flou, un relief et une bordure iOS, avec repli opaque |
| `adoption-chat-et-bulles` | B | P1 | M | 800 | avatar-unique-et-branchement-social, entete-d-identite-de-message-post-et-commentaire, texte-riche-rendu-et-legendes-de-media, reactions-rapides-quinze-emojis, images-instantanees-et-politique-de-telechargement, accessibilite-annonces-haptique-et-sens-de-lecture, fond-et-accent-de-conversation, bouclier-capture-ecran-android, mesures-de-fenetre-et-largeurs-de-lecture, presence-de-conversation-je-regarde, etats-vides-et-echecs-de-contenu, toasts-de-retour-globaux, composer-glass-shell, chat-bulle-decoupage-composants | La conversation et ses bulles utilisent les composants communs du design system sans grossir ChatScreen |
| `adoption-conversations-notifications-et-appels` | B | P1 | M | 800 | squelettes-reflet-et-etats-de-chargement, toasts-de-retour-globaux, tirer-pour-rafraichir-de-marque, avatar-unique-et-branchement-social, rangees-glissantes-a-trois-actions, fond-et-accent-de-conversation, liste-decoupage-ecran-jetons-lentille, calls-foundation-app-seams | La liste de conversations, les notifications et l'historique d'appels utilisent les composants communs du design system |
| `adoption-flux-et-reels` | B | P1 | L | 1100 | squelettes-reflet-et-etats-de-chargement, etats-vides-et-echecs-de-contenu, toasts-de-retour-globaux, tirer-pour-rafraichir-de-marque, avatar-unique-et-branchement-social, entete-d-identite-de-message-post-et-commentaire, images-instantanees-et-politique-de-telechargement, texte-riche-rendu-et-legendes-de-media, badge-du-son-d-arriere-plan, analytics-impression-queue, feuilles-pagers-adaptatifs-et-fenetre, feed-screen-split | Le fil, le detail de post, les signets, A proximite et les Reels utilisent les composants communs du design system |
| `adoption-profil-contacts-reglages-et-auth` | B | P1 | M | 900 | en-tete-repliable-et-pages-de-reglages, squelettes-reflet-et-etats-de-chargement, etats-vides-et-echecs-de-contenu, toasts-de-retour-globaux, avatar-unique-et-branchement-social, images-instantanees-et-politique-de-telechargement, photo-d-entite-recadrage-et-compression, contours-d-avatar-equipes, cadres-de-banniere, decor-de-profil-equipe-et-synchronise, signature-de-marque-logo-anime-et-jingle, settings-hub-iso-layout, profile-own-page-split | Le profil, les contacts, les reglages et l'authentification utilisent les composants communs et affichent le decor equipe |
| `adoption-stories` | B | P1 | M | 900 | chrome-sur-canevas-feuilles-et-barre-haute-plein-ecran, images-instantanees-et-politique-de-telechargement, avatar-unique-et-branchement-social, composer-de-story-barre-haute-et-couleurs, feuille-de-stickers-onglets-recents-favoris, badge-du-son-d-arriere-plan, story-reply-sender-and-admission, feuilles-pagers-adaptatifs-et-fenetre, reduire-les-animations-et-micro-animations, analytics-impression-queue, texte-riche-rendu-et-legendes-de-media, story-viewer-decomposition-and-nav-graph | Le lecteur de stories, le plateau et le composer utilisent les composants communs du design system |
| `badge-du-son-d-arriere-plan` | B | P1 | M | 560 | reduire-les-animations-et-micro-animations, accessibilite-annonces-haptique-et-sens-de-lecture, story-viewer-decomposition-and-nav-graph | Une story ou un post indique son son d'arriere-plan et permet de le couper |
| `bande-de-chrome-du-haut-appel-et-audio` | B | P1 | S | 330 | socle-points-d-extension-de-l-app, echelles-de-jetons-ressorts-et-typographie, reduire-les-animations-et-micro-animations | Une bande coloree sous la barre d'etat signale un appel ou un lecteur audio actif |
| `chrome-sur-canevas-feuilles-et-barre-haute-plein-ecran` | B | P1 | M | 830 | couleurs-hex-accent-et-surfaces-teintees, accessibilite-annonces-haptique-et-sens-de-lecture, verre-flou-et-surfaces-opaques | Les boutons poses sur une story restent lisibles, les feuilles ont Annuler/Termine en verre et les plein ecrans partagent la meme barre haute |
| `composer-de-story-barre-haute-et-couleurs` | B | P1 | M | 800 | couleurs-hex-accent-et-surfaces-teintees, verre-flou-et-surfaces-opaques, chrome-sur-canevas-feuilles-et-barre-haute-plein-ecran, accessibilite-annonces-haptique-et-sens-de-lecture, feuilles-pagers-adaptatifs-et-fenetre, composer-socle-decoupage-et-dependances | Le composer de story flotte sur le canevas avec des commandes de verre, une bande de slides utile et une bande de couleurs accessible |
| `contenus-depuis-notifications-et-liens` | B | P1 | M | 700 | routeur-de-navigation-hubs-et-cibles-differees, racine-liens-profonds-android, story-viewer-decomposition-and-nav-graph, socle-pipeline-push-et-cycle-de-vie | Toucher une notification ou un lien de contenu ouvre le bon lecteur avec la vraie cause d'un echec |
| `coque-tablette-liste-detail-redimensionnable` | B | P1 | L | 1700 | mesures-de-fenetre-et-largeurs-de-lecture, routeur-de-navigation-hubs-et-cibles-differees, en-tete-repliable-et-pages-de-reglages, toasts-de-retour-globaux, squelettes-reflet-et-etats-de-chargement, liste-decoupage-ecran-jetons-lentille, ligne-lentille-plate, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias, composer-glass-shell | Sur tablette, la liste est a gauche, la conversation ou le panneau a droite, et la colonne se redimensionne |
| `diagnostics-de-crash-natifs-et-rapport-distant` | B | P1 | M | 750 | toasts-de-retour-globaux, transitions-arriere-plan-premier-plan, configuration-firebase-native | Les crashs, ANR et depassements sont captures, listes dans l'app et envoyes au backend de rapports |
| `feuilles-pagers-adaptatifs-et-fenetre` | B | P1 | M | 950 | mesures-de-fenetre-et-largeurs-de-lecture, verre-flou-et-surfaces-opaques, texte-riche-rendu-et-legendes-de-media, bouclier-capture-ecran-android | Feuilles, selecteurs et pagers s'adaptent a la largeur et elisent la page reellement visible |
| `fond-et-accent-de-conversation` | B | P1 | M | 900 | catalogue-d-apparence-embarque, rendu-des-fonds-et-bannieres-de-design, rangees-glissantes-a-trois-actions, couleurs-hex-accent-et-surfaces-teintees, chat-appearance-model-and-sync, chat-viewmodel-state-split | Je choisis le fond et l'accent de ma conversation et ils me suivent d'un appareil a l'autre |
| `formats-localises-et-types-de-fichier` | B | P1 | M | 650 |  | Nombres, durees, compteurs et types de fichier sont ecrits et illustres selon la langue et le type |
| `gardes-async-et-journalisation-par-categorie` | B | P1 | M | 700 | diagnostics-de-crash-natifs-et-rapport-distant, feed-room-cache-and-realtime | Les actions optimistes ne se bloquent jamais et les journaux sont ranges par categorie |
| `mode-clair-sombre-synchronise-avec-le-compte` | B | P1 | M | 550 | couleurs-de-marque-et-contraste-aa, socle-points-d-extension-de-l-app, persist-outbox-registre-senders, settings-hub-iso-layout | Auto, Clair ou Sombre s'applique a toute la fenetre et suit mon compte d'un appareil a l'autre |
| `navigation-tablette-liens-et-notifications` | B | P1 | L | 1200 | racine-liens-profonds-android, contenus-depuis-notifications-et-liens, coque-tablette-liste-detail-redimensionnable, routeur-de-navigation-hubs-et-cibles-differees | Sur tablette, chaque lien et chaque notification ouvre le bon panneau sans quitter la conversation |
| `panneaux-de-droite-feuilles-et-couvertures-tablette` | B | P1 | L | 1200 | coque-tablette-liste-detail-redimensionnable, navigation-tablette-liens-et-notifications, etats-vides-et-echecs-de-contenu | Sur tablette, reglages, profils, contacts et feuilles s'ouvrent dans le panneau de droite avec un retour coherent |
| `photo-d-entite-recadrage-et-compression` | B | P1 | M | 750 | images-instantanees-et-politique-de-telechargement, completude-du-profil-et-champs-d-etiquettes, profile-own-page-split | Je choisis une photo d'avatar ou de banniere, la recadre, puis l'envoie compressee sans geler l'ecran |
| `presence-de-conversation-je-regarde` | B | P1 | M | 460 | socle-points-d-extension-de-l-app | Mes interlocuteurs voient que je regarde la conversation, et plus quand un plein ecran la couvre |
| `selecteur-de-langue-de-traduction` | B | P1 | M | 600 | feuilles-pagers-adaptatifs-et-fenetre | Choisir la langue d'une traduction place en tete les langues deja traduites et memorise mes preferees |
| `synchronisation-en-arriere-plan-econome` | B | P1 | M | 700 | transitions-arriere-plan-premier-plan | La liste de conversations se resynchronise et precharge les non lus en arriere-plan sans vider la batterie |
| `tirer-pour-rafraichir-de-marque` | B | P1 | M | 500 | accessibilite-annonces-haptique-et-sens-de-lecture, signature-de-marque-logo-anime-et-jingle | Le tirer-pour-rafraichir montre le logo Meeshy, change d'etat au seuil et confirme par une haptique |
| `cadres-de-banniere` | B | P2 | L | 1300 | catalogue-d-apparence-embarque, mouvement-des-cadres, rendu-des-fonds-et-bannieres-de-design | Mon profil peut porter un cadre ornemental sur la banniere, au centre transparent |
| `completude-du-profil-et-champs-d-etiquettes` | B | P2 | M | 450 | squelettes-reflet-et-etats-de-chargement, accessibilite-annonces-haptique-et-sens-de-lecture, profile-own-page-split | Mon profil montre l'anneau de completude rose-cyan et les preferences de conversation proposent categories et etiquettes avec suggestions |
| `fenetres-detachees-et-multi-fenetre` | B | P2 | M | 850 | coque-tablette-liste-detail-redimensionnable, rangees-glissantes-a-trois-actions, fond-et-accent-de-conversation | Je peux ouvrir une conversation ou les Reels dans leur propre fenetre en la glissant |
| `raccourcis-clavier-et-survol-souris` | B | P2 | M | 750 | racine-liens-profonds-android, mesures-de-fenetre-et-largeurs-de-lecture, mode-clair-sombre-synchronise-avec-le-compte, routeur-de-navigation-hubs-et-cibles-differees, socle-points-d-extension-de-l-app | Les raccourcis clavier materiels pilotent la navigation et la souris survole les rangees |
| `retour-depuis-le-lecteur-audio-systeme` | B | P2 | M | 550 | routeur-de-navigation-hubs-et-cibles-differees, socle-points-d-extension-de-l-app | Toucher le lecteur audio du systeme ramene a la conversation et au vocal en cours |
| `signature-de-marque-logo-anime-et-jingle` | B | P2 | L | 1100 | couleurs-de-marque-et-contraste-aa, echelles-de-jetons-ressorts-et-typographie, reduire-les-animations-et-micro-animations, socle-points-d-extension-de-l-app | La signature Meeshy (logo trace, credit services.ceo, jingle, ouvertures liquides) est identique a iOS |

### Lots fusionnés ou retirés par l'architecture

- `base-locale-separee-par-compte` → `persist-compte-cache-par-compte` (merge-into) : Même séparation des données locales par compte. Hérite : reprise-sur-base-locale-corrompue.
- `contenu-public-sans-compte` → `contenu-public-visiteur` (drop-duplicate) : Même ouverture d'un contenu public sans compte. Hérite : routeur-de-navigation-hubs-et-cibles-differees, etats-vides-et-echecs-de-contenu.
- `contenu-ephemere-noir-dans-les-captures` → `bouclier-capture-ecran-android` (merge-into) : Même registre FLAG_SECURE pour le contenu protégé.
- `langue-de-l-interface-automatique-et-sept-langues` → `langues-interface-sept-et-automatique` (drop-duplicate) : Même langue d'interface « Automatique » en sept langues.
- `interface-en-allemand-et-italien` → `langues-interface-sept-et-automatique` (drop-duplicate) : Les libellés de/it sont générés depuis les catalogues iOS par les lots libelles-* ; aucune traduction à la main.
- `interface-en-arabe-et-droite-gauche` → `arabe-mise-en-page-droite-a-gauche` (drop-duplicate) : Même interface arabe et miroir droite-gauche.
- `carte-interactive` → `map-surface-engine` (merge-into) : Même moteur de carte interactive derrière l'interface MapSurface.
- `thermique-et-image-sombre-en-appel` → `calls-thermal-and-video-survival` (merge-into) : Même gouverneur thermique de la vidéo d'appel.
- `repondre-a-une-story-ouvre-la-conversation` → `story-reply-sender-and-admission` (merge-into) : Même réponse à une story ou humeur dans la conversation directe. Hérite : routeur-de-navigation-hubs-et-cibles-differees.
- `comptage-des-affichages-et-du-temps-passe` → `analytics-impression-queue` (merge-into) : Même comptage des affichages et du temps passé, en lots.
- `feuille-d-autocollants-et-packs-installes` → `feuille-de-stickers-onglets-recents-favoris` (drop-duplicate) : Même feuille de stickers.
- `liens-profonds-meeshy-vers-le-bon-ecran` → `racine-liens-profonds-android` (merge-into) : Même routage des liens meeshy:// et meeshy.me ; MainActivity et le DeepLinkRouter n'ont qu'un propriétaire. Les destinations communautés / progression / hashtag absentes retombent sur l'écran d'accueil derrière une couture. Hérite : routeur-de-navigation-hubs-et-cibles-differees, liens-a-jeton-d-e-mail-jamais-ouverts-dans-l-app.

## Features

### Le catalogue de fonds, contours et cadres est disponible hors ligne, en 7 langues

`dst-appearance-catalog-offline` · Android : **absente** · P1 · effort M

Catalogue embarqué (copie octet pour octet de la source partagée, copie générée AppearanceCatalogData) : gamme de 16 couleurs (clé, surface et accent clair/sombre), 5 packs de fonds (essentiels 4, héritages 4, nature-et-ciel 4, illustrations 2, animes 1), 2 packs de bannières (essentielles 6, animées 1), 9 packs de contours d'avatar (essentiels 6, animés 1, puis haussmannien, arabe, grec, ancestral, technologique, rituel, celte : 2 chacun), 7 packs de cadres de bannière (2 chacun), noms en fr, en, es, pt, de, it, ar avec repli français. Modèles de fond (motif, illustration, dégradé) avec palettes clair/sombre et couche Lottie facultative. Décodage tolérant : un modèle illisible est écarté seul, jamais le pack ni le catalogue.

Écarts :
- Aucun code Apparence côté Android : ajouter le script de synchronisation (même source packages/shared, comme sync-appearance-catalog-ios.ts) qui copie le JSON dans les assets Android et un test de copie identique.
- Modèles Kotlin sérialisés : AppearanceDesign (clé, style pattern/illustration/gradient, palettes clair/sombre base, ink, soft, accent?, tile, scene avec viewBox et ancrage bottom/center/bottom-end, gradient angle + arrêts + blobs, lottie?), AppearancePaintRole (ink, accent, accent-next, accent-prev, soft, base), AppearanceDesignPack.
- Décodage tolérant par élément (LossyBox) : un design illisible ne coûte jamais le pack, un pack ne coûte jamais le catalogue ; catalogue vide si illisible, jamais un crash.
- API : wallpaper(pack, design) (inconnu donne Signature), defaultWallpapers (packs installés par défaut), designName / packName / gamutName(langue) avec repli fr ; gamme de 16 couleurs (surface/accent par schéma ; null pour une clé hors gamme).
- Chaînes localisées en 7 langues : l'app Android ne livre que en, fr, es, pt ; le catalogue porte de, it, ar — les noms doivent être servis depuis le JSON, pas depuis strings.xml.
- Charger le JSON hors du thread principal une fois (lazy) pour le premier rendu du fil.

Rendu : Les noms de packs et modèles se lisent dans la langue du lecteur ; le dessin est toujours vectoriel et identique web/iOS/Android.

Transposition Android : Resources/appearance-catalog.json vers assets/ ; Codable tolérant vers kotlinx.serialization avec serializer custom (ignoreUnknownKeys + élément nul ignoré).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/AppearanceCatalog.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/AppearanceCatalogData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/AppearanceDesign.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/AppearanceGamut.swift`

</details>

### Les fonds et bannières de design se dessinent à partir de données vectorielles, sans saccade

`dst-appearance-design-renderer` · Android : **absente** · P1 · effort M

AppearanceDesignView peint un modèle (palette du schéma, accent effectif du lecteur) : motif répété (tuile rendue une fois en bitmap, mise en cache bornée à 32, rotation avec couche agrandie x1,5 rognée, échelle 0,5 à 3), illustration (viewBox, ancrage bottom/center/bottom-end miroir en RTL) ou dégradé linéaire d'angle donné + blobs radiaux. Les rôles ink/soft/base/accent/accent-next/accent-prev se résolvent par la palette (accent-next/prev = accent tourné de +/-30°, indigo si l'accent n'est pas un hex valide). BannerDesignView réutilise le même moteur pour la bannière 3:1 qui prime sur l'image du profil, avec couche Lottie en surimpression (première image si animations coupées).

Écarts :
- Créer AppearanceDesignView (Composable égalitaire par modèle/schéma/accent) avec trois couches : motif, illustration, dégradé ; masquée de l'accessibilité.
- Rendu d'une tuile en ImageBitmap (Canvas) puis ShaderBrush / ImageShader en TileMode.Repeated ; cache LruCache de 32 entrées clé = clé + empreinte du contenu + schéma + accent + densité ; rotation par couche agrandie 1,5x puis clip.
- Analyseur de chemins SVG : androidx.compose.ui.graphics.vector.PathParser couvre le jeu de commandes ; vérifier la parité avec SVGPathData d'iOS (arcs, fermetures, relatifs) par des tests de chemins de référence.
- AppearancePaint.hex(role, palette, accent) : accent-next/prev par hueShiftedHex +/-30° (DynamicColorGenerator existe), repli indigo 6366F1 si l'accent n'est pas #RRGGBB.
- Dégradé : angle CSS (sin/cos), arrêts avec rôle, blobs radiaux (rayon relatif au plus grand côté, opacité vers 0) ; illustration : échelle min(w/viewBox) ancrée selon anchor, miroir RTL pour bottom-end.
- BannerDesignView (3:1) avec couche animée optionnelle (lottie-compose à ajouter aux dépendances) en surimpression sans imposer sa taille, clip, et animates = false pour aperçus.

Rendu : Fond équatable : ne se redessine que si (modèle, schéma, accent) change ; aucun redessin par image ; rendu identique web/iOS/Android à partir des mêmes chemins.

Transposition Android : Canvas SwiftUI / UIGraphicsImageRenderer vers Compose Canvas + DrawScope ; NSCache vers LruCache ; Lottie vers lottie-compose.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/AppearanceDesignView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/AppearancePaint.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/AppearanceTileCache.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/AppearanceTileRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/BannerDesignView.swift`

</details>

### Chaque type de fichier a son icône, sa teinte et son libellé court

`dst-attachment-kind-display` · Android : **absente** · P1 · effort S

AttachmentDisplay assemble pour un mimeType la présentation d'une pièce jointe : symbole, teinte et libellé court (Photo, Vidéo, Excel...), depuis AttachmentKind : image 4ECDC4, vidéo FF6B6B, audio 9B59B6, PDF F39C12, tableur 21803D, document 2A56B5, présentation D96921, archive/texte/autre 808080, code 6366F1.

Écarts :
- Créer l'enum AttachmentKind (image, video, audio, pdf, spreadsheet, document, presentation, archive, code, text, other) avec init(mimeType) identique : PDF, Excel/CSV, Word/RTF, PowerPoint, ZIP/TAR/7z/GZ/RAR, JSON/XML, préfixes image/ video/ audio/ text/.
- Ajouter hexTintColor et shortLabel (localisé) par famille, plus isMedia et hasTimebasedTrack.
- Créer AttachmentDisplay.make(mimeType) avec icône Material équivalente (caméra, vidéo, forme d'onde, document, tableau, texte, diapo, archive, accolades, trombone) et couleur.
- Remplacer les icônes de pièces jointes dispersées (ChatScreen, FileAttachmentDownloadOverlay, Starred, galerie) par ce point unique.

Transposition Android : SF Symbols vers Material Icons (camera.fill = PhotoCamera, doc.fill = Description, tablecells = TableChart, doc.zipper = FolderZip, curlybraces = DataObject, paperclip = AttachFile).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/AttachmentDisplay.swift`

</details>

### Les avatars des autres affichent le contour qu'ils ont équipé

`dst-avatar-ring` · Android : **absente** · P1 · effort M

AvatarRingDesign (viewBox 0 0 100 100, avatar de rayon 42, 1 à 8 couleurs fixes validées hex) : trait de base solid, double, pointillé (28 points), tirets (36), dégradé (24 arcs cycliques) ou aucun, plus ornements en chemins désignant leurs couleurs par index, dégradés et mouvements déclarés. AvatarRingView le peint au-dessus de l'avatar sans capter le toucher, mouvements en couches animées sauf si animates=false ou Reduce Motion. Un contour illisible (hex invalide, index de couleur absent) est rejeté, jamais dessiné à moitié. ProfileDecorWearer : les résumés de personne (auteur de message, participant, résultat de recherche, membre, suggestion) portent le contour équipé.

Écarts :
- Créer le modèle AvatarRingDesign / AvatarRingStroke / AvatarRingOrnamentPath / AvatarRingPack / AvatarRingCatalog avec validation fail-closed (1 à 8 couleurs, isWellFormedHex #RGB/#RRGGBB/#RRGGBBAA, index d'ornement dans la palette) et noms localisés.
- Composable AvatarRing(design, animates) dans MeeshyAvatar : rendu Canvas des cinq styles (double : second cercle à radius - 2 x largeur ; pointillé : 28 points ronds ; tirets : 36 tirets 60/40 ; dégradé : 24 arcs avec couleur cyclique ; none) et des ornements (chemin SVG, ouverture opacité, largeur, dégradé, groupe).
- Interface ProfileDecorWearer : exposer avatarRing sur ApiMessageSender, ApiParticipant, résultats de recherche, auteurs de posts/commentaires/stories ; MeeshyAvatar l'affiche partout où l'avatar apparaît (liste, bulle, fil, profil, story).
- Le contour est visible des AUTRES et identique pour tous : couleurs fixes, aucun rôle accent ; décoratif, ignore le toucher.
- Remplacer l'anneau local de ChromeAvatarButton par le contour équipé quand il existe.

Rendu : Contour proportionnel au diamètre (largeur = fraction du diamètre) ; ornements dessinés dans le viewBox 100 centré ; jamais d'animation sous Reduce Motion.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/AvatarRingDesign.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/AvatarRingView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/ProfileDecorWearer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeAvatarButton.kt`

### Une story ou un post indique le son d'arrière-plan et peut le couper

`dst-background-sound-badge` · Android : **absente** · P1 · effort M

BackgroundSoundBadge annonce le son de fond d'un post/story : « original » (note de musique + mini-waveform animée, silencieuse si coupé) ou « crédit » (note + ligne titre · @auteur · date défilante en marquee, 11 semi-gras plafonné à 18, teinte d'accent ou blanc sur média) ; bouton haut-parleur pour couper (icônes speaker.wave / speaker.slash) ; barre de note barrée quand coupé ; étiquette « Audio de fond » (+ crédit) pour le lecteur d'écran ; résolution des sources (canvasV3.sound, audioPlayerObjects.isBackground, backgroundAudioId).

Écarts :
- Android joue le son de fond (StoryViewerScreen backgroundAudioUrl, fenêtre start/end) mais n'affiche aucun badge ni ne propose de le couper : créer BackgroundSoundBadge(announcement, accentHex, isMuted).
- Porter la logique pure : BackgroundAudioAnnouncement {None, Original, Credit(title, username, duration, releasedAt)}, announcement(for storyEffects) (priorité canvasV3.sound, puis audioPlayerObjects.isBackground, puis backgroundAudioId), creditText (titre · @auteur · date localisée, « — » si inconnu), showsMuteButton, muteIconName.
- Créer le marquee de crédit (texte plus long que la largeur : défilement continu en pause quand coupé) et la mini-waveform d'état ; note barrée en diagonale à 45° quand coupé ; opacité 0,85, priorité de mise en page basse.
- Accessibilité : contentDescription « Audio de fond · {crédit} » (sans crédit : « Audio de fond »).
- Afficher le badge dans l'entête du lecteur de story, la carte de post du fil, le détail de post et le Reels ; teinte blanche sur média plein écran (overMediaAccentHex).

Rendu : Note de 10 pt + waveform 3 barres animées ; crédit sur une ligne 11 semi-gras avec défilement horizontal doux.

Transposition Android : SF Symbol music.note + Capsule diagonale vers Icon MusicNote + trait diagonal en Canvas.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/BackgroundSoundBadge.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### Les boutons posés sur une story restent lisibles quel que soit le fond de la slide

`dst-canvas-chrome-scheme` · Android : **absente** · P1 · effort S

CanvasChromeScheme choisit le schéma clair/sombre du chrome (bulles, FAB, en-tête, rails) posé sur le canevas d'une story, en composer comme en lecteur, d'après la luminance relative WCAG du fond : seuil 0,179 pour un fond uni ou dégradé (moyenne des deux arrêts) et pour un glyphe nu, 0,35 pour un fond média (luminance moyenne d'un bitmap rééchantillonné en 8x8 sRGB linéarisé) ; halo de polarité opposée sous un glyphe nu ; voile sans bord à 25 % sous un texte de scène avec encre primaire.

Écarts :
- Porter les fonctions pures dans :core:model : relativeLuminance(hex), backgroundLuminance(valeur sérialisée RRGGBB / #RRGGBB / gradient:AAAAAA:BBBBBB), scheme(background, hasMediaBackground, mediaLuminance), scheme(forBareGlyphOver), contrastRatio, luminanceUnderSceneTextVeil, constantes 0,179 / 0,35 / 0,25.
- Ajouter l'échantillonnage Android d'un fond média : Bitmap.createScaledBitmap 8x8 puis moyenne de la luminance linéarisée (hors thread principal) ; repli .dark sans bitmap mesurable.
- Épingler le schéma sur les grappes de contrôles du composeur et du lecteur de story (CompositionLocal local qui force les tokens clair/sombre et le glassControlForeground).
- Ajouter le halo (legibilityHalo) sous les rails de lecteur de story et de Réels et l'encre primaire (jamais secondaire) pour la légende de scène.
- Tests de contraste sur la mire de la palette du composeur (pire cas au moins 4,5:1 pour le texte).

Rendu : Fond clair (capture blanche) = chrome sombre ; fond sombre = chrome blanc ; glyphe nu toujours accompagné d'un halo de polarité opposée.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/CanvasChromeScheme.swift`

</details>

### Un contenu protégé (vue unique, éphémère, flouté) reste noir dans les captures et enregistrements d'écran

`dst-capture-shield` · Android : **absente** · P1 · effort M

CaptureShield enveloppe un contenu : protégé ⇒ rendu dans la couche sécurisée du système (noir dans toute capture, enregistrement ou recopie d'écran, affiché normalement à l'écran) ; non protégé ⇒ le contenu seul, coût nul. FERMÉ PAR DÉFAUT : sans couche sécurisée disponible il rend le placeholder, jamais le contenu, et signale l'incident. L'hôte UIKit réutilise la toile d'un bouclier ancêtre (citation protégée dans une cellule protégée), refuse de monter le contenu avant d'être dans une fenêtre, transmet disposition, gestes, VoiceOver, Dynamic Type, RTL et menus. Un registre compte les contenus protégés visibles pour voiler l'aperçu du sélecteur d'applications. Les lecteurs vidéo lisent la portée du bouclier pour ne sortir ni par AirPlay ni par PiP.

Écarts :
- Aucun bouclier : FLAG_SECURE n'est jamais posé hors détection d'enregistrement d'écran pendant les appels. Ajouter un CaptureShield(isProtected, placeholder) qui, protégé, rend son contenu dans une surface sécurisée (SurfaceView.setSecure(true) / fenêtre Dialog avec FLAG_SECURE) pour que capture et enregistrement donnent du noir sans masquer le reste de l'écran
- Alternative globale : FLAG_SECURE sur la fenêtre de l'activité tant qu'un contenu protégé est visible (compteur SecureCaptureRegistry) + setRecentsScreenshotEnabled(false) / voile de l'aperçu des tâches récentes
- Fermé par défaut : si la surface sécurisée est indisponible, rendre le placeholder et signaler l'incident
- Portée du bouclier en CompositionLocal : lecteurs vidéo protégés sans Cast ni PiP (ProtectedPlaybackPolicy)
- Annonce de capture à la conversation pour les contenus « annoncés » (ContentExitLaw : capture annoncée vs bloquée) via Activity.ScreenCaptureCallback (Android 14+) ou détection d'enregistrement
- Tests de non-régression : accessibilité, gestes et menus passent dans l'enveloppe

Rendu : À l'écran le contenu est normal ; dans une capture il est noir ; placeholder « contenu protégé » (icône œil barré) quand la couche sécurisée est absente.

Transposition Android : Toile du champ de mot de passe sécurisé → FLAG_SECURE / SurfaceView.setSecure ; aperçu du sélecteur d'applications → setRecentsScreenshotEnabled(false)

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CaptureShield/CaptureShield.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CaptureShield/SecureCaptureHostView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CaptureShield/SecureCaptureLayer.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/ScreenRecordingDetector.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`

### Les pages ouvertes depuis Réglages ont un retour en verre et un en-tête clair qui se réduit

`dst-collapsible-header-page` · Android : **absente** · P1 · effort S

CollapsibleHeaderPage assemble une fois la plomberie (défilement, relais d'offset, espace réservé de 64 pt sous l'en-tête) : l'écran ne fournit que titre, geste de retour, actions de fin et contenu ; couleurs passées par l'appelant, aucun singleton.

Écarts :
- Créer CollapsibleHeaderPage(title, onBack, trailing, content) : Column défilante avec Spacer(64.dp), CollapsibleHeader superposé, progression dérivée du ScrollState.
- Migrer les sous-pages de Réglages, Progression, Liens, Export de données et Profil vers ce composant plutôt que TopAppBar ou MeeshyTopBar.
- Prévoir la variante sans défilement (écran fixe) montant directement CollapsibleHeader, et le cas où l'écran porte pull-to-refresh / fermeture du clavier.

Rendu : Retour = disque de verre 40 dp aligné à 28 dp du bord ; titre arrondi qui se réduit ; contenu démarre sous l'en-tête de 64 dp.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeaderPage.swift`

</details>

### Les visionneuses retirent enregistrer, partager et copier pour un contenu qui disparaît

`dst-content-exit-gate` · Android : **absente** · P1 · effort S

ContentExitGate voyage par l'environnement : l'hôte qui présente une visionneuse (image, vidéo, document, code, galerie) le pose une fois et chaque visionneuse y lit si elle rend ses boutons d'enregistrement, de partage et de copie. Un bouton que le portillon refuse n'est pas rendu et son gestionnaire ne fait rien. Le défaut est FERMÉ : un hôte qui oublie de poser le portillon n'ouvre aucune sortie (l'oubli se voit, il ne fuit pas) ; un hôte hors conversation (post, commentaire, réel) pose « ouvert ». ContentExitGated ne monte son contenu que si le portillon laisse sortir le contenu. Règle sous-jacente : « un contenu qui disparaît ne sort pas de Meeshy ».

Écarts :
- Aucune loi de sortie côté Android : MeeshyImageViewer et GalleryImageSaver exposent enregistrer/partager sans portillon, y compris pour des contenus éphémères, à vue unique ou transférés
- Porter ContentExitLaw (nature : ordinaire, flamme temporisée, flamme après lecture, vue unique ; verdicts transférer / enregistrer-partager / capture) et ContentExitGate (miroir de packages/shared/utils/content-exit-law.ts)
- CompositionLocal LocalContentExitGate à défaut FERMÉ, posé en ouvert pour post, commentaire, réel ; composable ContentExitGated
- Visionneuses image/vidéo/document/galerie : ne pas rendre ni exécuter les boutons refusés
- Composer la loi avec les restrictions de flou et de chiffrement (qui restent propres)

Rendu : Les boutons enregistrer/partager/copier sont simplement absents (loi 4 : un contrôle sans effet est absent, jamais grisé).

Transposition Android : EnvironmentKey → compositionLocalOf avec défaut fermé

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ContentExitGateEnvironment.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`

### Un contenu introuvable explique pourquoi et propose de réessayer seulement quand cela a un sens

`dst-content-fetch-failure-states` · Android : **absente** · P1 · effort S

ContentFetchFailure (réseau, serveur, interdit, introuvable) porte symbole, titre et message localisés : « Impossible de charger ce contenu / Vérifiez votre connexion, puis réessayez » (wifi barré), « Meeshy n'a pas pu charger ce contenu / Le problème vient de notre côté » (triangle d'alerte), « Ce contenu n'est plus disponible / Il a peut-être expiré ou été retiré par son auteur » (horloge barrée) ; le bouton Réessayer n'existe pas pour une absence (interdit, introuvable).

Écarts :
- Créer l'enum ContentFetchFailure {Network, Server, Forbidden, NotFound} avec isAbsence et offersRetry, plus le mapping depuis les erreurs HTTP/réseau du SDK (403/404/410 = absence, 5xx = serveur, IOException = réseau).
- Créer un composable d'état d'échec (icône 48, titre, message, bouton Réessayer conditionnel) réutilisé par détail de post, reel, story, notification cible.
- Ajouter les clés feed_post_detail_loadFailed / serverFailed / unavailable (titre + corps) dans toutes les langues Android.
- Remplacer les messages d'erreur ad hoc de PostDetail, Nearby, UserPosts et Bookmarks.

Rendu : Icône centrée, titre en gras, message secondaire, bouton plein indigo ; jamais de bouton Réessayer pour un contenu retiré.

Transposition Android : SF Symbols wifi.exclamationmark / exclamationmark.triangle / clock.badge.xmark vers WifiOff / Warning / EventBusy ou HourglassDisabled.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ContentFetchFailure+Copy.swift`

</details>

### Je choisis le fond et l'accent de ma conversation, et ils me suivent d'un appareil à l'autre

`dst-conversation-personal-appearance` · Android : **absente** · P1 · effort M

ConversationAppearance (version 1) : fond Signature (défaut), Modèle d'un pack (pack, design), Uni (couleur) ou Photo (pièce jointe, voile 0 à 0,8 par pas de 0,05, flou 0 à 24) + accent de la gamme (nil = accent calculé) + animation (ignorée sous Reduce Motion). Stocké sur les préférences du lecteur et synchronisé via user:preferences-updated ; décodage tolérant par champ (kind inconnu : Signature, sans perdre l'accent). ConversationAppearanceChange relaie le changement local optimiste, l'écho d'un autre appareil ou la liste rafraîchie vers le fil ouvert et garde le dernier état connu ; WallpaperPackOptions limite le sélecteur aux packs possédés et installés (404 d'un ancien serveur : aucun pack, sélecteur réduit à Signature, gamme et photo).

Écarts :
- Créer le modèle ConversationAppearance / ConversationBackground (signature, design, solid, photo avec bornes veil 0,8 et blur 24) avec lecture tolérante par champ (readConversationAppearance) et écriture avec accent nul explicite (le serveur valide nullable).
- Ajouter appearance aux préférences de conversation (ConversationPreferences) et à PreferencesSocketManager (écho user:preferences-updated).
- Créer ConversationAppearanceChange (SharedFlow + dernier état par conversation, reset à la déconnexion) pour qu'un fil ouvert réagisse sans relire la liste et qu'un fil ouvert après le changement ne parte pas d'une valeur périmée.
- Créer WallpaperPackOptions : liste des packs installés (/packs/wallpaper/installed), 404 = aucun pack, panne = packs installés d'office ; filtre installed && owned.
- Brancher dans la conversation : fond de la liste de messages (design / uni / photo avec voile et flou), accent des bulles et de l'en-tête, aperçu de liste ; ajouter le sélecteur dans les options de conversation (voir domaine conversation).

Rendu : Le fond n'est jamais plus visible que le texte : voile maximal 0,8 sur photo, flou jusqu'à 24 ; Signature = dégradé de marque par défaut.

Transposition Android : NotificationCenter (relais interne) vers SharedFlow ; UserDefaults vers cache Room des préférences.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/ConversationAppearance.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/ConversationAppearanceChange.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/WallpaperPackOptions.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/PreferencesSocketManager.kt`

### Mes interlocuteurs voient que je regarde la conversation, et plus quand un plein écran la couvre

`dst-conversation-viewing-presence` · Android : **absente** · P1 · effort S

reportsConversationViewing(conversationId) annonce l'apparition/disparition de l'écran de conversation au ConversationViewingReporter (viewing:start / viewing:stop, viewing:activity throttlé, ré-émission à chaque reconnexion socket, arrêt en arrière-plan) ; coversConversationViewing met en pause le signal quand un plein écran (lecteur de story, réel, appel) recouvre la conversation ; conversationCover applique les deux.

Écarts :
- Aucun événement viewing:start / viewing:stop / viewing:activity / viewing:snapshot côté Android (sdk-core ne les écoute ni ne les émet) : ajouter émission et réception dans MessageSocketManager (noms exacts de packages/shared/types/socketio-events/presence.ts).
- Créer ConversationViewingReporter (émet start quand l'écran est visible ET l'app au premier plan, stop à la fermeture/arrière-plan, activité throttlée comme ACTIVITY_THROTTLE_MS, ré-émission après chaque reconnexion).
- Créer les modificateurs Compose ReportsConversationViewing(conversationId) (DisposableEffect + lifecycle) et CoversConversationViewing pour les plein écrans.
- Respecter la visibilité de présence : le signal n'est servi qu'aux amis acceptés (règle serveur), sans état local prolongé.
- Afficher côté lecteur les pairs en train de regarder (voir domaine présence).

Rendu : Aucun visuel direct ; alimente l'indicateur « regarde » des conversations.

Transposition Android : onAppear/onDisappear + scenePhase vers ProcessLifecycleOwner + DisposableEffect.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Modifiers/ConversationViewingVisibilityModifier.swift`

</details>

### La liste de conversations se resynchronise et précharge les messages non lus en arrière-plan, sans vider la batterie

`dst-lifecycle-background-sync` · Android : **absente** · P1 · effort M

BackgroundTaskManager planifie deux tâches : sync des conversations (BGAppRefresh ≈ toutes les 15–30 min avec jitter ±20 %, intervalle minimal 30 s, retard exponentiel 2^n plafonné à 2^8 après échec) et préchargement des messages (BGProcessing, Wi-Fi SEULEMENT : jusqu'à 10 conversations non lues × 30 messages, traductions et réponses incluses). Sans session vivante, la tâche se termine sans se replanifier ; à la déconnexion les deux requêtes sont annulées (le filet de flush du cache a son propre identifiant). setTaskCompleted rendu une seule fois (expiration ou fin).

Écarts :
- Seul OutboxFlushWorker existe : ajouter un PeriodicWorkRequest « conversation-sync » (contrainte réseau, jitter, backoff exponentiel plafonné) qui rejoue la synchro depuis le dernier checkpoint (SyncSeqState)
- Worker de préchargement (Wi-Fi uniquement, contrainte NetworkType.UNMETERED) des 10 conversations non lues × 30 messages avec traductions/réponses
- Pas de réplanification et fin immédiate si pas de session vivante ; annulation des deux unique works à la déconnexion
- Décision pure « le préchargement doit-il tourner dans cet état réseau ? » + tests
- Résultat success/retry selon l'issue réelle du travail

Rendu : Aucun visuel ; à l'ouverture, listes et conversations non lues apparaissent déjà à jour (cache-first).

Transposition Android : BGAppRefreshTask/BGProcessingTask → WorkManager PeriodicWorkRequest/OneTimeWorkRequest avec Constraints

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/BackgroundTaskManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/sync/SyncSeqState.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`

### Choisir ou voir un lieu sur une carte interactive (position, partage de lieu, à proximité)

`dst-map-surface` · Android : **absente** · P1 · effort M

AdaptiveInteractiveMap rend une carte interactive avec épingles personnalisées et recentrage par MapTarget (centre + étendue en mètres), indépendante de la version de MapKit. La région par défaut quand la cible est absente ne doit JAMAIS se résoudre en « position utilisateur automatique » (boucle de ré-entrée MapKit/updateUIView) : région explicite. Utilisée par le sélecteur de lieu et la vue plein écran d'un lieu partagé ; la découverte « à proximité » utilise une carte native avec surcouche de densité.

Écarts :
- Aucune dépendance de carte dans le projet (ni Google Maps Compose, ni MapLibre/OSM) : aucun rendu cartographique pour le lieu partagé, le sélecteur de lieu, la position en direct ou « à proximité »
- Composable MeeshyInteractiveMap(target, pins, onRegionChange) avec MapTarget (centre, latitudinalMeters, longitudinalMeters) et égalité approximative pour ne pas boucler
- Région initiale explicite quand aucune cible (jamais « suivre l'utilisateur » implicite)
- Épingles personnalisées Compose (avatar, couleur d'accent) et recentrage animé
- Choisir le fournisseur (Google Maps SDK si Play Services, repli MapLibre) sans casser les builds sans services Google
- Surcouche de densité pour la découverte « à proximité »

Rendu : Carte plein cadre, épingles aux couleurs d'accent de la conversation, recentrage animé sur la cible, thème clair/sombre de la carte.

Transposition Android : MapKit (Map/MKMapView) → Maps Compose ou MapLibre Native avec composable épingle

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/NearbyScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/location/LiveLocationBadge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/location/DeviceLocationFix.kt`

### Ouvrir une conversation referme proprement les plein écrans et feuilles sans perdre un travail en cours

`dst-nav-presented-surfaces` · Android : **absente** · P1 · effort S

Un registre déclare chaque surface présentée par-dessus la navigation (lecteur de stories, réels, couverture de conversation, galerie, composer, feuille, lieu, recherche, photo de profil, carte de contact, écran de jeu) avec sa fenêtre, une réponse « closes » (elle se referme) ou « retains » (elle tient un travail qu'une fermeture perdrait : composer, partie de jeu — la conversation s'ouvre quand elle part). Le contenu présenté s'enregistre à l'apparition et se retire à la disparition. Une ouverture ne referme que les surfaces de sa propre fenêtre.

Écarts :
- Aucun registre de surfaces : les dialogs/feuilles Compose se ferment seulement parce que navigate() démonte leur destination, sans notion de surface qui RETIENT (composer de story avec brouillon, partie de jeu)
- Ajouter un PresentedSurfaceRegistry (CompositionLocal + DisposableEffect) avec réponses closes/retains et fermeture ordonnée avant navigation
- Portée par fenêtre (multi-fenêtre/freeform) : une ouverture ne ferme que les surfaces de sa fenêtre
- Ouverture sans animation parasite quand une surface se ferme au-dessus de la destination

Rendu : La surface qui retient reste visible et la conversation s'ouvre à son départ ; sinon fermeture immédiate sans clignotement.

Transposition Android : fullScreenCover/sheet → Dialog, ModalBottomSheet et destinations plein écran Navigation Compose ; registre par CompositionLocal

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/PresentedSurfaceRegistry.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/PresentedSurfaceModifier.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Répondre à une story ou une humeur ouvre la conversation directe avec son auteur avec la réponse préparée

`dst-nav-story-reply-dm` · Android : **absente** · P1 · effort S

Depuis n'importe quel site du lecteur de stories, une action « répondre » résout le DM avec l'auteur (cache local d'abord, sinon API findDirectWith puis create si absent), pose le contexte de réponse (story ou status) en attente et navigue vers la conversation. La liste de conversations est optionnelle : un simple chemin rapide.

Écarts :
- Le lecteur n'a qu'un « envoyer à » (StorySendTo) ; aucune action « répondre » qui ouvre le DM auteur
- Résolution du DM : cache local puis findDirectWith puis création si absent
- ReplyContext (story/status : id, auteur, aperçu) transmis au ChatViewModel et affiché dans le composer comme citation, bulle de réponse déjà rendue par BubbleContentBuilder
- Navigation vers la conversation après résolution, erreur affichée en toast si la création échoue

Rendu : Le composer de la conversation s'ouvre avec la story citée au-dessus du champ, clavier prêt.

Transposition Android : Router.pendingReplyContext → argument/SavedStateHandle de la route chat

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/Router+StoryReply.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToViewModel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Un lien public de post, réel ou story s'ouvre sans compte avec une carte d'invitation à rejoindre

`dst-nav-visitor-content` · Android : **absente** · P1 · effort M

Un lien universel vers une publication, un réel ou une story PUBLICS s'ouvre sans session via GET /posts/:id sans jeton. L'écran visiteur montre le contenu (en lecture, servi avec le nom de qui l'a partagé quand le lien /l/<jeton> le nomme, refusé 404/403 = carte d'invitation seule, panne = « Réessayer ») sous une carte d'invitation à créer un compte. VisitorContentReach compte le service d'un contenu comme un affichage ET une vue : impression « detail » sur la surface « visitor » à la première mise en service, puis vue avec durée de lecture à la sortie (plafond 5 min, la passerelle garde la plus longue).

Écarts :
- Aucun écran visiteur : un lien de post/réel/story reçu sans session n'ouvre rien d'utile (seul GuestJoin couvre les liens de conversation)
- Modèle VisitorContentRequest/State (pending, served(post, sharer), refused, failed) + ViewModel + écran Compose avec carte d'invitation
- Nom de qui a partagé (TrackedLinkSharer) issu de la résolution du lien de suivi
- Impression « detail » sur la surface « visitor » au premier service uniquement (un Réessayer qui rend le même post ne recompte pas) et vue avec durée à la sortie (plafond 300 s), entrée (lien de suivi, ?via=, autre) marquée par le routeur
- États dessinés : lecture, servi, refusé (carte seule), échec avec Réessayer, hors-ligne

Rendu : Contenu plein cadre avec carte d'invitation en bas (compte requis pour interagir) ; états refusé/échec dessinés comme cartes centrées avec CTA.

Transposition Android : Écran visiteur Compose sans authentification ; ImpressionBatcher existant pour le comptage

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/VisitorContent.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/VisitorContentReach.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinScreen.kt`

### J'équipe un contour, une bannière de design et un cadre sur mon profil et les autres le voient

`dst-profile-decor-equip` · Android : **absente** · P1 · effort M

ProfileDecor : le décor servi d'un profil (contour d'avatar, bannière de design = fond, cadre de bannière) lu de façon tolérante par côté ; référence {pack, item, origin builtin/..., contract <sha16>.json}. Écriture (ProfileDecorWrite) par côté : équiper, retirer ou ne pas toucher, avec état optimiste (equip puis confirm ou rollback) et événement socket ProfileDecorUpdatedEvent appliqué à mon compte. ProfileDecorResolver résout une référence vers son modèle (embarqué ou contrat récupéré), la bannière prime sur la photo (ProfileBannerPaint) ; ProfileDecorOptions construit les groupes d'options à partir des packs installés (builtin par défaut).

Écarts :
- Modèles ServedProfileDecor / ServedProfileDecorItem (pack, item, origin, contract?) ajoutés à l'utilisateur et à ses résumés (tolérants : un côté illisible n'emporte pas les autres, un profil sans décor se rend comme avant).
- Endpoint d'écriture (PATCH décor du profil) avec ProfileDecorWrite {avatarRing, banner, bannerFrame} en trois états par côté (équiper, retirer, inchangé) et ProfileDecorState (equip optimiste, confirm, rollback sur échec, apply(event) si l'événement concerne mon compte).
- Écouter l'événement socket profile-decor:updated (nom exact dans packages/shared/types/socketio-events) pour mettre à jour contour/bannière d'un profil ouvert et de mon propre profil.
- ProfileDecorResolver : ring / banner / bannerFrame depuis le catalogue builtin ou le contrat servi par l'adresse <sha16>.json ; bannerPaint(photo, decor) = bannière de design si équipée, sinon photo.
- ProfileDecorOptions : groupes (packs possédés et installés, builtin installés par défaut si la liste est inconnue) pour le sélecteur de décor du profil ; écran ProfileDecorSheet (voir domaine profil).
- Cache hors ligne des contrats récupérés.

Rendu : Le sélecteur propose trois rangées (contours, bannières, cadres) groupées par pack avec noms localisés ; l'équipement est instantané (optimiste).

Transposition Android : Codable tolérant vers kotlinx.serialization ; PATCH vers Retrofit/Ktor.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/ProfileDecor.swift`

</details>

### « Réduire les animations » du système ou de l'app supprime tout mouvement non essentiel

`dst-reduce-motion-preference` · Android : **absente** · P1 · effort S

Reduce Motion a deux interrupteurs combinés par un OU : réglage système et override applicatif persisté (MeeshyAccessibilityPreferences, clé me.meeshy.accessibilityPreferences, sauvegarde différée 100 ms), injecté à la racine. L'override ne peut qu'ajouter de la réduction. Les animations (meeshyAnimation), apparitions échelonnées, rebonds, flottement, reflets, mouvements de cadres et transitions de chrome s'y conforment ; la waveform de repos devient statique (hauteurs 0,30 / 0,72 / 0,45 / 1,00 / 0,38 / 0,86 / 0,55).

Écarts :
- Créer MeeshyAccessibilityPreferences (DataStore, objet {reduceMotion}) et un CompositionLocal LocalForceReduceMotion fourni à la racine de MeeshyTheme.
- Détecter le réglage système : Settings.Global.ANIMATOR_DURATION_SCALE == 0 (et ValueAnimator.areAnimatorsEnabled) ; fonction pure shouldReduce(system, userForced) = system || userForced, testée.
- Fournir des wrappers meeshyAnimateFloatAsState / meeshySpec qui renvoient snap() quand la réduction est active, et les imposer dans tous les nouveaux composants (chrome, squelettes, frames, toasts).
- Brancher VoiceRecordingPill sur la valeur résolue (aujourd'hui reduceMotion = false en dur) et ajouter RestingWaveform statique avec les 7 ratios.
- Prévoir (optionnel, iOS ne l'expose pas encore) un interrupteur « Réduire les animations » dans Réglages Accessibilité qui écrit la préférence.

Rendu : Sous réduction : apparition immédiate en état final, aucun rebond ni flottement, transitions de chrome en fondu au lieu de glissement, aucune animation de cadre ou de reflet.

Transposition Android : accessibilityReduceMotion vers ANIMATOR_DURATION_SCALE ; EnvironmentValues.meeshyForceReduceMotion vers CompositionLocal.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`
- `apps/ios/Meeshy/Features/Main/Components/ReduceMotion.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/VoiceRecordingSession.kt`

### Les gestes glissés respectent le sens de lecture, y compris en arabe

`dst-rtl-reading-direction` · Android : **absente** · P1 · effort S

ReadingDirection.readingDelta inverse la translation horizontale en mise en page droite-gauche pour que « glisser dans le sens de la lecture » répondre à un commentaire ou fermer par le bord d'un Reels garde la même signification en arabe.

Écarts :
- Créer readingDelta(translationX, layoutDirection) pur (RTL : -x) dans :sdk-ui et l'utiliser dans SwipeToReply, le geste de bord des Réels, le balayage de ConversationRow, le lecteur de stories.
- Android a supportsRtl=true mais aucun de ces gestes ne lit LayoutDirection ; ajouter des tests RTL.
- Livrer les ressources arabes (values-ar) pour tester réellement le RTL : l'app n'est publiée qu'en en, fr, es, pt.

Rendu : Toutes les marges et icônes directionnelles en start/end, jamais left/right.

Transposition Android : LayoutDirection (SwiftUI) vers LocalLayoutDirection (Compose).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ReadingDirection.swift`

</details>

### Sur tablette, chaque lien, notification ou résumé ouvre le bon panneau sans quitter la conversation

`dst-tablet-panel-routing-deeplinks` · Android : **absente** · P1 · effort L

iPadRootView+Navigation et iPadRootViewLayers : ouverture d'une conversation (ferme les surfaces présentées, spring), fermeture des panneaux, tape sur la pastille de synchronisation (ouvre la conversation et le message ou le post), liens profonds (appel, lien tracké, rejoindre/chat par identifiant avec choix de compte ou invité, conversation, post, reel, story, profil, mon profil, mes liens, hashtag, communauté, non lues, conversation récente, lien externe, jeu, vitrine de packs, lien tracké non résolu avec toast « Ce lien n'a pas pu être ouvert »), rejoindre via lien de partage (404, 410, interdit), message vers un utilisateur, navigation poussée vers une route, réponse de story, navigation depuis chaque type de notification (messages, amitié, communauté, appels, publications, succès, jeux, sécurité...), aperçu de conversation depuis une notification en feuille moyenne/grande, ouverture d'un reel avec échec et réessai, fenêtres couvrantes (lecteur de story, composeur, feuille de partage, profil en feuille). Les ~35 destinations de panneau (réglages, profil, contacts, découverte, communautés, notifications, stats, progression, liens, export, détail de post, hashtag, signets, favoris, demandes d'amis, cible de story, humeur) vivent dans un NavigationStack avec une piste de jeu (GamePanelTrail).

Écarts :
- Sur tablette, router chaque DeepLink et chaque type de notification vers une destination de panneau de droite (route) plutôt qu'un écran plein ; sur téléphone la même table de routes alimente la pile (une seule source).
- Piste de jeu : GamePanelTrail (racine, chemin, routes) avec push/pop conservant l'empilement au-dessus d'un panneau racine ; bouton retour/fermer en tête de panneau avec haptique légère et libellé « Fermer ».
- Table de navigation des notifications (navigateFromNotification) par type, y compris légacy, avec la résolution sociale (story / reel / post) et l'ouverture ciblée de commentaire/parent.
- Liens de partage : ShareLinkEntryResolver (connecté ou non, conversations connues) -> ouverture directe, choix « continuer avec mon compte / rejoindre anonymement », erreurs 404/410/interdit avec messages dédiés.
- Feuilles : profil en feuille (large/moyen), participant, partage (contenu en attente, moyen/grand), nouvelle conversation, aperçu de notification (ConversationView previewMode avec « ouvrir la conversation complète »).
- Couvertures plein écran : lecteur de story (avec réponse), composeur de story, relais de partage, reels (échec avec réessai/fermer), engagement reveal.
- Services de démarrage (socket, abonnements stories/statuts, relais temps réel, ménage de rétention différé de 5 s, file d'envoi, plancher de version, chargement parallèle stories + statuts + conversations + non lus).
- Sur dérive d'un lien, toast d'erreur (FeedbackToastManager) plutôt que silence.

Rendu : Le panneau de droite remplace la conversation sans transition brutale (ressort 0,3/0,85) ; la liste de gauche garde sa sélection surlignée.

Transposition Android : DeepLink/NSUserActivity vers Intent filters + NavDeepLink ; fullScreenCover vers destinations plein écran / Dialog ; sheet vers ModalBottomSheet.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Navigation.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift`
- `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift`

</details>

### Sur tablette, la liste est à gauche, la conversation ou le panneau à droite, et la colonne se redimensionne

`dst-tablet-two-column-shell` · Android : **absente** · P1 · effort M

iPadRootView : deux colonnes. Gauche = fil (Feed) tant qu'aucune conversation n'est ouverte, liste de conversations (avec bouton « Flux » pour revenir) sinon ; droite = conversation ouverte, ou panneau de route (réglages, profil, contacts, notifications...), ou liste. Séparateur déplaçable (poignée 20 pt, trait 4x36, ratio gardé par fenêtre, défaut 0,38) borné par ColumnWidthLaw à 320-480 pt, réglable au lecteur d'écran par pas de 16 pt, curseur de redimensionnement. En-tête de colonne avec bouton Flux (capsule), cloche + badge de notifications non lues, engrenage. Bandeaux en attente et toasts de notification en superposition. Titre de scène « Meeshy — {titre} ». Passage d'un état à l'autre en ressort 0,35/0,85.

Écarts :
- Aucune mise en page adaptative : ajouter androidx.window / material3-adaptive (WindowSizeClass, ListDetailPaneScaffold ou Row custom) et choisir le seuil Medium/Expanded pour passer en deux colonnes ; pliables : posture table / livre (WindowInfoTracker).
- Porter ColumnWidthLaw (min 320, max 480, ratio par défaut 0,38, width(ratio, windowWidth), dragged(from, translation, windowWidth), stepped(ratio, steps) par pas de 16, entrées non finies donnent le minimum) en fonctions pures testées.
- Composable ResizableHandle : zone 20 dp, trait 1 dp + poignée 4x36 qui passe en indigo400 pendant le glisser, DragGesture avec seuil de 8 dp, pointeur de redimensionnement (PointerIcon HorizontalResize), sémantique ajustable (étiquette « Séparateur de colonnes », valeur « n points », indice de bornes, incrément ±16).
- iPadRightColumn.resolve(conversation, panelRoute) (panneau prioritaire, puis conversation, puis liste) et visibleConversationId (nul si un panneau est ouvert) ; règle iPadSelectionRule.closesDetail (retire le détail quand la conversation active est supprimée/quittée).
- iPadLeftColumnHeader : bouton Flux (icône pile, dégradé indigo500 vers indigo700, fond indigo100 15 % sombre / plein clair), titre 20 gras (heading), cloche avec badge d'erreur 16 min (NotificationBadge), engrenage ; haptique légère.
- Persistance du ratio par fenêtre (SceneStorage meeshy.ipad.leftColumnRatio) : DataStore par task/fenêtre.
- Superposer bandeaux en attente, toasts de notification (tap = ouvre, aperçu = feuille) et titre de tâche (setTaskDescription) « Meeshy — {titre} ».
- Restauration de la navigation à la reconstruction de la racine (RootNavigationHandoff.tabletPlacement : dernière conversation + routes de panneau).
- Conserver le téléphone en pile unique : la même logique de routes alimente les deux mises en page.

Rendu : Colonne gauche 320 à 480 pt (38 % par défaut), séparateur d'un filet 1 pt avec poignée 4x36 qui s'allume en indigo400 ; en-tête de colonne avec padding 16/12 et fond backgroundPrimary à 95 %.

Transposition Android : iPad regular width / NavigationSplitView-like vers WindowSizeClass Expanded + ListDetailPaneScaffold ; SceneStorage vers rememberSaveable + DataStore ; pointeur Mac vers PointerIcon.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/iPadRootView.swift`
- `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift`
- `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Overlays.swift`
- `apps/ios/Meeshy/Features/Main/Views/iPadRootSheetTargets.swift`
- `apps/ios/Meeshy/Features/Main/Views/ColumnWidthLaw.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyLayout.kt`

### Une bande colorée sous la barre d'état signale un appel ou un lecteur audio actif

`dst-top-chrome-band` · Android : **absente** · P1 · effort S

TopChromeTint résout la teinte de la bande placée dans l'inset haut de la fenêtre (appel actif ou lecteur audio : CallBannerContrast.bannerTop ; sinon la bannière en cours) ; TopChromeBarMotion décide de la sortie (glissement vers le haut avec dégagement de l'inset sur la dernière barre, simple fondu sous Reduce Motion, ressort 0,4/1) et de l'ordre des couches (dernière barre 2, appel 0,6, audio 0,5) ; une préférence de clé TopChromeInsetKey agrège la hauteur maximale.

Écarts :
- Créer TopChromeTint.resolve(callIsActive, audioContext, banner) pur (priorité appel, puis audio, puis bannière) avec la couleur CallBannerContrast.bannerTop.
- Peindre la bande dans WindowInsets.statusBars (edge-to-edge) avec transition slideOut vers le haut + offset -inset pour la dernière barre, fondu si réduction de mouvement.
- Reprendre l'ordre des couches (2 / 0,6 / 0,5) et agréger la hauteur du chrome du haut (max des barres) pour décaler les écrans.
- Brancher sur la bannière d'appel flottante et le mini-lecteur audio de conversation quand ils seront portés.

Rendu : Bande pleine largeur, hauteur = inset haut, couleur de la bannière d'appel, glisse hors écran vers le haut.

Transposition Android : safeAreaInsets.top vers WindowInsets.statusBars ; appel actif vers Telecom / notification en cours.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/TopChromeTint.swift`
- `apps/ios/Meeshy/Features/Main/Components/TopChromeBarMotion.swift`

</details>

### Les contours d'avatar et cadres de bannière équipés se dessinent depuis le catalogue (chemins SVG)

`dst-avatar-ring-svg` · Android : **absente** · P2 · effort M

SVGPathData convertit une chaîne de chemin SVG (M, L, H, V, C, S, Q, A et variantes relatives ; arcs elliptiques de l'annexe F.6 découpés en cubiques ≤ 90°) en Path ; une chaîne mal formée arrête le parse sans deviner. Alimente les contours d'avatar et cadres de bannière du catalogue d'apparence (tuiles, traits, transformations).

Écarts :
- Modèles d'apparence présents (transform, champ de particules) mais aucun rendu : pas de PathParser (androidx.compose.ui.graphics.vector.PathParser couvre déjà M/L/H/V/C/S/Q/A) ni de rendu de contour d'avatar / cadre de bannière
- Utilitaire SvgPath.toPath(d) tolérant (arrêt propre sur chaîne invalide) + calcul de boîte englobante pour recadrer
- Rendu des traits (couleur, épaisseur, bouts) et animations d'apparence du catalogue autour de MeeshyAvatar et de la bannière de profil

Rendu : Contour posé autour de l'avatar sans changer sa taille de mise en page ; trait aux bouts ronds selon l'élément du catalogue.

Transposition Android : CGPath/SVG manuel → androidx.compose.ui.graphics.vector.PathParser + Canvas drawPath

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SVGPathData.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppearanceTransform.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppearanceParticleField.kt`

### Mon profil peut porter un cadre ornemental sur la bannière, centre transparent

`dst-banner-frame` · Android : **absente** · P2 · effort M

BannerFrameDesign (gabarit 0 0 300 100, 1 à 8 couleurs, dégradés) : bordure et filets tracés à la largeur réelle (largeur logique = largeur x 100 / hauteur), pièces ancrées début/centre/fin, frises répétant leur module (mode repeat : modules entiers centrés ; mode justify : module recalculé), coins (carrés de 20 max) et cartouche central. Le centre transparent est une loi : tout est découpé au pourtour de border.width (au plus 9,6) plus coins et cartouche. BannerFrameRenderer calcule la géométrie et le chemin de découpe à enroulement non nul ; BannerFrameView rasterise le dessin fixe une fois par taille et pose les couches animées ; Lottie facultatif découpé à la région.

Écarts :
- Modèles BannerFrameDesign (palette, gradients, border, reach corner/cartouche, pieces, friezes, motion, lottie) avec bornes du TypeScript (module non nul, couleurs désignées dans la palette) ; sur divergence le TypeScript fait foi.
- Géométrie : elements(design, width) (frises d'abord, pièces ensuite), instances de frise repeat / justify, ancrages start/center/end ; drawableRegion(width) (bord, trou, coins, cartouche) et chemin de découpe à enroulement non nul.
- Composable BannerFrame(design, animates) : dessin fixe rastérisé une fois par taille (cache par design+taille+densité), couches animées au-dessus, Lottie découpé à la région, non interactif et masqué à l'accessibilité.
- Catalogue des cadres builtin (7 packs de 2 cadres) et noms localisés ; décodage tolérant par cadre.
- Superposer le cadre à la bannière du profil (photo ou fond) sans jamais la remplacer ; tests de la région dessinable (aucun pixel dans le centre).

Rendu : Cadre posé sur la photo de bannière 3:1 ; les motifs courent le long des bords, coins ornés, cartouche au milieu haut/bas ; le centre reste parfaitement transparent.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/BannerFrameDesign.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/BannerFrameRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/BannerFrameView.swift`

</details>

### La signature sonore de Meeshy accompagne l'interlude d'identité d'un export de story

`dst-brand-jingle` · Android : **absente** · P2 · effort S

MeeshyBrandJingle synthétise (pas de fichier) une signature de 2,2 s : arpège de La majeur A4 (440), C#5 (554,37), E5 (659,25) puis résolution A5 (880) aux instants 0 / 0,28 / 0,56 / 0,84 s, sinusoïdes avec un partiel à l'octave à -18 dB, attaque 25 ms, décroissance exponentielle (demi-vie 0,62 s), fondu final jusqu'au silence exact ; version de fermeture (2 s) en miroir descendant calée sur la carte de fin. 48 kHz mono, identique à l'échantillon près sur tous les appareils.

Écarts :
- Porter la synthèse PCM pure (FloatArray 48 kHz mono) dans :core:model avec les deux motifs, l'enveloppe et le fondu ; test de signature (durée, silence final, énergie).
- Mélanger la signature sous l'interlude d'ouverture et la fermeture lors de l'export de story/vidéo (Media3 Transformer ou MediaCodec) quand l'export Android sera porté.
- Aucun asset audio à versionner : même résultat sur tous les appareils.

Transposition Android : AVFoundation buffer vers AudioTrack / Media3 AudioProcessor.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Theme/MeeshyBrandJingle.swift`

</details>

### Les contours et cadres s'animent par rotation, pulsation, reflet, scintillement et inclinaison, sans coût de redessin

`dst-frame-motion-engine` · Android : **absente** · P2 · effort M

FrameDecor déclare dégradés (FrameGradient, index conservé même si illisible) et mouvements (rotate 1 à 360°, pulse 0,01 à 0,3, sweep, twinkle, skew ; durée 0,5 à 180 s, délai max 30, stagger max 10, origine frame/self/top/bottom, direction normal/reverse/alternate, 8 mouvements et 16 cibles max ; un mouvement inconnu ou hors bornes est ignoré). FrameMotionPlan (pur) transforme ces mouvements en couches : éléments qui bougent exactement ensemble partagent une couche, reflet laisse sa cible fixe et glisse au-dessus. FrameMotionLayers les exécute en couches natives (transform et opacité seuls), en pause hors écran, hors fenêtre, en arrière-plan, en économie d'énergie ou sous Reduce Motion.

Écarts :
- Modèles FrameMotion (kind, targets, duration, delay, stagger, direction, amplitude, origin) et FrameGradient avec bornes strictes et décodage tolérant (mouvement invalide ignoré, dégradé illisible garde son index).
- Porter FrameMotionPlan.make(elements, motions, center) (pur, JVM-testable) : étapes rotate/pulse/twinkle/skew avec from/to, linéaire si 360°, origine par défaut (rotate=frame, pulse=self, skew=top), regroupement des éléments identiques, plans de reflet.
- Exécuteur Compose : un seul rememberInfiniteTransition par cadre animant graphicsLayer (rotationZ, scale, alpha, skew via matrice) sur des couches pré-dessinées ; reflet = Brush glissant sous masque de la forme des cibles ; jamais de recomposition par image.
- Pause quand non visible (LocalLifecycleOwner, visibilité dans la liste), mode économie d'énergie (PowerManager.isPowerSaveMode), et Reduce Motion ; animates=false pour aperçus.
- Tests unitaires du plan avec les mêmes vecteurs que le TypeScript (frame-motion-svg.ts).

Rendu : Mouvements lents et discrets (durées de 0,5 à 180 s), sur transform et opacité uniquement.

Transposition Android : CABasicAnimation/CAGradientLayer vers Compose graphicsLayer + Animatable / infiniteTransition ; Lottie vers lottie-compose.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Appearance/FrameDecor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/FrameMotionPlan.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Appearance/FrameMotionLayers.swift`

</details>

### Je peux ouvrir une conversation ou les Réels dans leur propre fenêtre en la glissant

`dst-multi-window-detached` · Android : **absente** · P2 · effort M

AdaptiveRootView choisit la racine compacte (téléphone) ou régulière (tablette) et gère le multi-fenêtre : DetachedWindowOpener (conversation ou réels dans une fenêtre dédiée), MainWindowRegistry (une seule fenêtre principale ; une seconde instance affiche « Meeshy est déjà ouvert / Aller à la fenêtre principale »), DetachedWindowView (conversation ou Réels, repli « Cette conversation n'a pas pu être ouverte », « Connectez-vous dans la fenêtre principale »), propriété du compte (adopte, garde, ferme si autre compte, attend la connexion), bannière « Ouvrir la fenêtre principale » quand elle manque, glisser-déposer d'une ligne de conversation (ConversationDragItemProvider) pour ouvrir une fenêtre, restauration de la pile de navigation (RootNavigationHandoff) et recomposition du brouillon de composeur démonté, activation NowPlaying/Activité en direct de la lecture vocale.

Écarts :
- Déclarer resizeableActivity et activités secondaires (conversation, réels) en launchMode multiple/documents avec FLAG_ACTIVITY_LAUNCH_ADJACENT / NEW_DOCUMENT pour s'ouvrir en écran partagé ou freeform ; extra conversationId/startId.
- Garde de fenêtre principale unique (registre d'instances) et écran « Meeshy est déjà ouvert » avec bouton vers la fenêtre principale.
- DetachedWindowView : charger la conversation depuis le cache (fresh/stale) puis l'API, repli d'indisponibilité, titre de tâche ; propriété du compte (verdict adopt / keep / close / waitForSignIn) et fermeture à la déconnexion/changement de compte.
- Glisser-déposer d'une ligne de conversation vers un autre côté d'écran (View.dragAndDropSource, ClipData avec type me.meeshy.conversation-row) et réception pour ouvrir en fenêtre adjacente.
- Restauration de la pile et du brouillon de composeur au changement de racine compacte/régulière (rotation, pliage, redimensionnement) sans perdre la conversation ouverte.
- Brancher le lecteur audio de conversation (notification média en cours) au démarrage de la racine.

Rendu : Fenêtre secondaire minimale : fond thématisé, contenu de la conversation sans chrome racine ; message centré 20 pt de marge si indisponible.

Transposition Android : UIScene / openWindow vers activités multi-instances et mode multi-fenêtre ; NSUserActivity de glisser vers ClipData drag-and-drop ; Live Activity de lecture vocale vers notification média.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift`

</details>

### Les raccourcis clavier matériels pilotent la navigation (nouvelle conversation, recherche, sections, retour, envoyer)

`dst-nav-keyboard-shortcuts` · Android : **absente** · P2 · effort M

Sur iPad/Mac, MeeshyCommands expose des menus « Aller » et « Message » avec ⌘N (nouvelle conversation), ⌘F (rechercher), ⌘W (fermer la fenêtre), ⌘1–4 (conversations, contacts, notifications, réglages), ⌘[ (retour), ⌘↩ (envoyer). Les actions sont publiées par la scène focalisée (valeur stable, un propriétaire par action pour éviter les boucles de rendu), grisées si sans cible, et désactivables par la préférence keyboardShortcutsEnabled. Une fenêtre détachée a son propre jeu d'actions.

Écarts :
- Aucun raccourci clavier (onPreviewKeyEvent / onKeyEvent) : la préférence keyboardShortcutsEnabled existe dans Preferences.kt mais n'est lue nulle part
- Ctrl+N, Ctrl+F, Ctrl+W, Ctrl+1..4, Ctrl+[, Ctrl+Entrée à mapper sur les actions de la scène courante (ChromeViewModel/NavController)
- Annoncer les raccourcis dans le panneau système (Activity.onProvideKeyboardShortcuts / KeyboardShortcutGroup)
- Actions grisées/inactives si aucun récepteur (pas dans une conversation → pas d'envoi)
- Fenêtre secondaire (multi-fenêtre/freeform) : lancer une conversation dans une tâche séparée, avec ses propres actions

Rendu : Pas d'élément visuel propre ; les raccourcis apparaissent dans l'aide système Ctrl+/ avec les mêmes libellés et icônes sémantiques.

Transposition Android : Commands/KeyboardShortcut → Modifier.onPreviewKeyEvent + Activity.onProvideKeyboardShortcuts ; fenêtre détachée → activité en nouvelle tâche (multi-instance)

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/MeeshyCommands.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/MeeshyShortcut.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/SceneCommandFocus.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/SceneCommandHosts.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Toucher le lecteur audio système ramène à la conversation et au vocal en cours

`dst-nav-now-playing-return` · Android : **absente** · P2 · effort M

iOS n'émet aucun signal quand on touche la carte Now Playing : le retour au premier plan après un VRAI passage en arrière-plan pendant qu'un audio de conversation JOUE ramène vers la conversation et le message audio concernés, via le chemin de la notification (navigation + surlignage scopé). Décision pure : pas de navigation si la lecture est en pause, sans contexte, ou si l'id porteur n'est pas une conversation connue (audio de post/commentaire). Le mini-lecteur ouvre aussi la conversation sur la bulle du vocal.

Écarts :
- La lecture audio est un ExoPlayer in-process sans MediaSession : pas de contrôles écran verrouillé/notification média, pas de lecture en arrière-plan
- Ajouter un MediaSessionService (media3) exposant titre/conversation, avec PendingIntent ouvrant chat/{conversationId}?messageId=
- Politique NowPlayingReturnPolicy pure (lecture en cours + conversation connue → cible, sinon rien)
- Dépend de l'argument messageId de la route chat pour atterrir sur la bulle

Rendu : Notification média avec titre de la conversation, nom de l'expéditeur et pochette avatar ; tap = ouverture sur la bulle audio.

Transposition Android : MPNowPlayingInfoCenter + retour foreground → media3 MediaSessionService + notification MediaStyle + PendingIntent de contenu

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/NowPlayingReturnNavigation.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Souris et trackpad : survol qui épouse la forme de la rangée et curseur de redimensionnement des colonnes

`dst-pointer-hover` · Android : **absente** · P2 · effort S

meeshyPointerInteractive ajoute un effet de survol au pointeur dont la zone épouse la rangée (rectangle arrondi, capsule, cercle, sans arrondi) ; le style de bouton plain pointer-aware ; meeshyColumnResizePointer pose le curseur de redimensionnement sur la poignée de colonne de l'iPad.

Écarts :
- Aucun état de survol (hoverable/collectIsHoveredAsState) ni pointerHoverIcon pour souris/trackpad (ChromeOS, tablettes, DeX)
- Modifier meeshyPointerInteractive(shape) : surbrillance douce de la rangée selon la forme
- Curseur de redimensionnement (PointerIcon.Crosshair/HorizontalResize) sur les séparateurs de colonnes tablette

Rendu : Léger voile d'accent sur la rangée survolée, aucun changement de taille, curseur flèche par défaut.

Transposition Android : UIPointerInteraction/hoverEffect → Modifier.hoverable + pointerHoverIcon

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/PointerInteractive.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/PointerPlainButtonStyle.swift`

</details>

### Les feuilles à valider affichent Annuler à gauche et Terminé à droite en capsules de verre

`dst-sheet-header-cancel-done` · Android : **absente** · P2 · effort S

MeeshySheetHeader : titre centré sur la feuille (ZStack, ne bouge pas quand un libellé s'allonge), boutons capsule en verre Annuler (restitue l'état d'avant l'ouverture, pas seulement fermer) et Terminé, 44 pt de haut minimum, titre 16 semi-gras (en-tête d'accessibilité), marges 16/16/8. Utilisé par les feuilles Hashtag et Mention.

Écarts :
- Créer MeeshySheetHeader(title, onCancel, onDone) pour ModalBottomSheet : Box avec titre centré et Row de deux capsules verre, hauteur minimale 48 dp, titre heading().
- Ajouter les chaînes common_cancel et common_done (Annuler, Terminé) dans les langues Android (fr, en, es, pt) puis de, it, ar.
- Contrat à respecter : onCancel doit restituer l'état antérieur (brouillon, sélection) ; ne pas monter l'en-tête si l'hôte ne peut pas restituer.
- Brancher les feuilles Hashtag et Mention du composeur quand elles seront portées.

Rendu : Titre 16 semi-gras centré sur la feuille ; actions 15 semi-gras ; capsules verre ; padding horizontal 16 ; libellé tronqué sur une ligne.

Transposition Android : adaptiveGlass(in: Capsule()) vers MeeshyGlassSurface(shape = CircleShape/pill).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshySheetHeader.swift`

</details>

### Le splash se dissout en agrandissant, et une story s'ouvre par un cercle qui grandit

`dst-splash-gate-reveal` · Android : **absente** · P2 · effort S

fullScreenGate fait entrer/sortir une couche plein écran par opacité et échelle 1,1 vers 1, avec sa transparence au toucher et son masquage d'accessibilité ; RevealCircleShape est un masque animable (rayon = diagonale x progression, 0 invisible, 1 plein écran) utilisé pour l'ouverture « reveal » d'une story.

Écarts :
- Créer Modifier.fullScreenGate(isPresented) : alpha 0/1, scale 1,1 vers 1, bloquer les événements tactiles et masquer de l'accessibilité quand absent ; l'appliquer à la couverture du splash.
- Créer RevealCircleShape(progress) (Shape Compose, cercle centré de rayon diagonale x progression) et l'utiliser en clip animé pour l'ouverture « reveal » des stories (StoryEffects.opening == reveal) ; progression de 0,001 à 1 selon l'état.
- Respecter Reduce Motion : ouverture immédiate sans cercle.

Transposition Android : Shape animatableData vers GenericShape + animateFloatAsState.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/FullScreenGate.swift`
- `apps/ios/Meeshy/Features/Main/Views/RevealCircleShape.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`

### Chaque action donne un retour immédiat par un toast qui émerge de l'encoche (succès, erreur, info, tappable)

`dst-feedback-toasts` · Android : **divergente** · P0 · effort M

FeedbackToastManager est l'entonnoir unique : show/showSuccess/showError (avec action au tap, par exemple ouvrir les Réglages après un refus de permission), annonce VoiceOver, haptique selon le type, fermeture automatique (3 s ; plus longtemps si tappable ; au moins 6 s sous VoiceOver), purge de tout toast en attente et de son handler à la déconnexion. FeedbackToastView : pilule avec icône de type (succès vert, erreur rouge, info indigo) qui émerge de l'encoche/Dynamic Island et se rétracte à la fermeture. DailyGestureLimitNotice formule les refus DAILY_COMMENT_LIMIT / DAILY_REACTION_LIMIT avec l'heure de remise à zéro dans le fuseau de l'appareil.

Écarts :
- MeeshyFeedbackToast n'est qu'un atome statique non utilisé : les écrans emploient des SnackbarHost locaux. Créer un FeedbackToastManager singleton (StateFlow du toast courant, file/remplacement, tapAction optionnelle) monté une fois à la racine au-dessus du NavHost
- Fermeture automatique : 3 s, plus longue si tappable, minimum 6 s si TalkBack actif (AccessibilityManager) ; annonce d'accessibilité à l'apparition
- Haptique par type (succès/erreur) via le vocabulaire haptique commun
- Purge à la déconnexion (toast et handler) pour ne pas afficher le toast du compte sorti
- Animation « émerge de l'encoche » : début replié et remonté vers la découpe caméra puis déploiement ; rétraction vers le haut à la fermeture
- Message de limite quotidienne (commentaires/réactions) localisé avec heure de remise à zéro dans le fuseau de l'appareil
- Interface FeedbackToastSurfacing injectable pour les ViewModels (showSuccess/showError/showError(tapAction))
- Icône d'erreur Warning à remplacer par le disque croix pour parité (xmark.circle.fill)

Rendu : Pilule verre à coins pilule, icône 20 dp teintée (succès vert, erreur rouge, info indigo), texte 2 lignes max, émergence depuis le haut sous la découpe caméra.

Transposition Android : FeedbackToastManager @MainActor → singleton Hilt exposant StateFlow ; toast → surcouche Compose animée (pas Snackbar Material)

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/FeedbackToastManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/FeedbackToastSurfacing.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FeedbackToastView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyToast.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationToastHost.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationToastViewModel.kt`

### Glisser une ligne révèle jusqu'à trois actions de chaque côté, une seule ligne ouverte à la fois, qui se referme au toucher ailleurs

`dst-swipe-rows` · Android : **divergente** · P0 · effort M

SwipeableRow : ligne glissable avec zones d'action à gauche (leading) et à droite (trailing), jusqu'à trois actions par côté (directive 2026-10-14), rubber-banding au-delà des limites, ouverture/fermeture persistante au seuil d'une fraction de la zone, cellule d'action tappable dont l'échelle passe de 0,4 à 1,0 au fil de la révélation, fonds d'action rognés sur l'axe du glissement. SwipeRowCoordinator garantit qu'une seule ligne reste ouverte et la referme dès qu'on touche en dehors (observation des touchers de la fenêtre qui échoue aussitôt, sans retenir ni retarder aucun toucher), état tenu hors de SwiftUI pour ne ré-évaluer aucune autre ligne.

Écarts :
- SwipeToDismissBox déclenche UNE action par côté puis revient (épingler / archiver) : remplacer par une ligne glissable qui RESTE ouverte et expose jusqu'à 3 boutons tappables par côté
- Seuil d'ouverture/fermeture en fraction de la zone d'action, rubber-banding au-delà des limites, révélation avec échelle 0,4→1,0 des cellules
- Coordinateur : une seule ligne ouverte à la fois, fermeture au toucher hors de la ligne ouverte (pointerInput sans consommer ni retarder) et au défilement
- Plafonner à 3 actions par côté (SwipeRowCoordinator.capped)
- Cohérence avec le glisser pour répondre dans le chat et le menu contextuel (long press)
- Accessibilité : actions exposées en customActions TalkBack, haptique à l'ouverture

Rendu : Fonds d'action colorés (épingler indigo, archiver, supprimer rouge…) glissant sous la ligne, boutons ronds 56 dp avec icône + libellé, ligne qui suit le doigt avec élasticité.

Transposition Android : DragGesture + offset → Modifier.draggable/anchoredDraggable avec AnchoredDraggableState

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeableRow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeRowCoordinator.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/SwipeToReply.kt`

### Les textes secondaires et discrets restent lisibles (WCAG AA) en clair comme en sombre

`dst-text-contrast-aa-tokens` · Android : **divergente** · P0 · effort S

iOS a relevé textSecondary et textMuted au cran minimal qui passe 4,5:1 sur les fonds déclarés : clair indigo700 à 80 % pour les deux (4,76:1 sur F8F7FF, 4,60:1 sur EEF2FF), sombre secondaire indigo300 opaque et discret indigo300 à 70 % (5,13:1 et 4,65:1). Verrouillé par un test de contraste.

Écarts :
- LightMeeshyTokens.textSecondary vaut 0x994338CA (indigo700 à 60 %, 2,70-3,12:1) : le remplacer par indigo700 à 80 % (0xCC4338CA).
- LightMeeshyTokens.textMuted vaut 0x666366F1 (indigo500 à 40 %, 1,67:1) : le remplacer par indigo700 à 80 %.
- DarkMeeshyTokens.textMuted vaut 0x80818CF8 (indigo400 à 50 %, 2,46:1) : le remplacer par indigo300 (A5B4FC) à 70 %.
- Aligner MeeshyLightColorScheme.onSurfaceVariant et les usages de tokens.textMuted/textSecondary sur les nouvelles valeurs.
- Ajouter un test JVM de contraste WCAG (composition alpha puis luminance) qui exige au moins 4,5:1 pour textSecondary et textMuted sur backgroundSecondary et backgroundTertiary dans les deux thèmes.

Rendu : Le texte discret ne change pas de famille (jamais un gris neutre) : toujours dans la rampe indigo ; les valeurs sont plus appuyées qu'avant, c'est voulu.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemePalette.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyThemeTokens.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyColorScheme.kt`

### Les nombres, durées et compteurs sont écrits et lus selon la langue de l'utilisateur

`dst-compact-count-localized` · Android : **divergente** · P1 · effort S

CompactCountLabel abrège un entier par CLDR dans la locale du lecteur (« 1,5 k » en français, « 1.5K » en anglais, « 1,5 mil » en espagnol, ١٫٥ ألف en arabe ; 1000 devient « 1 k », jamais « 1.0k »). LocalizedNumber rend nombre exact, pourcentage, durées (m:ss, mm:ss, h:mm:ss) et durées parlées (« 1 minute 5 secondes »). ReachMetricLabel affiche icône + compteur abrégé avec libellé et valeur exacte lue au lecteur d'écran.

Écarts :
- formatCompactCount (profil) fige K/M/B avec point décimal quelle que soit la langue : remplacer par CompactCountLabel.text(count, locale) basé sur android.icu.text.CompactDecimalFormat (minSdk 26 suffit) avec locale injectable pour les tests.
- Rechercher et supprimer les autres copies de l'abréviation (cartes de communauté, FeedPostCard, reels, ConversationRow, stats) au profit du point unique ; ajouter un test garde de non-duplication.
- Créer LocalizedNumber.exact / percent / duration(clock: minuteSecond, paddedMinuteSecond, hourMinuteSecond) / spokenDuration (unités larges, zéros masqués) via NumberFormat, MeasureFormat et chiffres natifs (arabe).
- Créer ReachMetricLabel (icône + compteur 11 sp medium, teinte fournie) avec contentDescription = libellé et stateDescription = nombre exact localisé.
- Cas limites : valeurs négatives ou non finies bornées à 0, Int32 max pour les secondes.

Rendu : Compteur 11 pt medium à côté d'une icône 11 pt semi-gras, espacement 3, teinte de la surface.

Transposition Android : IntegerFormatStyle.notation(.compactName) vers CompactDecimalFormat ; Duration.formatted vers DateUtils / MeasureFormat.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/CompactCountLabel.swift`
- `apps/ios/Meeshy/Features/Main/Components/LocalizedNumber.swift`
- `apps/ios/Meeshy/Features/Main/Components/ReachMetricLabel.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/UserStatsPresentation.kt`

### Les contrôles et panneaux flottants ont un vrai rendu verre (flou, teinte, reflet, liseré) et un fondu de bord haut

`dst-glass-surfaces` · Android : **divergente** · P1 · effort M

adaptiveGlass applique le Liquid Glass réel en iOS 26 (régulier translucide ou proéminent teinté, interactif) et se dégrade en matière floue (régulière) ou en fond teinté plein (proéminent) avec liseré fin ; adaptiveLiquidGlass fabrique à la main un vrai verre pour les surfaces (blur matière, voile de teinte, reflet spéculaire dégradé depuis le bord supérieur, liseré plus clair côté éclairé que côté ombré, ombre portée), selon sombre/clair et teinté ou non (recette inspectable LiquidGlassFallbackRecipe). TopBarBottomFade fournit la rampe verticale noir → transparent servant de voile ou masque sous une barre haute.

Écarts :
- MeeshyGlassSurface n'est qu'un remplissage translucide avec liseré dégradé : aucun flou d'arrière-plan (utiliser RenderEffect.createBlurEffect/Modifier.blur API 31+ ou une lib type Haze, repli translucide en dessous)
- Deux variantes : régulier (secondaire/neutre) et proéminent (teinté plein), paramètres tint et interactive
- Recette « liquid glass » fabriquée : reflet spéculaire depuis le bord haut, liseré lumineux haut vs ombré bas, ombre portée qui décolle la surface, comportement différent en sombre/teinté
- Rampe TopBarBottomFade (fractions transparente/dégradé, début/fin du fondu) comme scrim ou masque sous les barres hautes
- Appliquer en dernier dans la chaîne de modificateurs après dimensionnement ; aucune dépendance au produit (forme + couleur en paramètres)

Rendu : Surfaces translucides à coins arrondis (pilule ou rect), liseré 1 dp dégradé plus clair en haut-gauche, teinte d'accent à faible opacité, ombre douce ; barre haute avec fondu vers le contenu.

Transposition Android : glassEffect/.ultraThinMaterial → RenderEffect blur + Modifier.drawWithContent (reflet, liseré, ombre)

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveGlass.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveLiquidGlass.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Components/TopBarBottomFade.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyGlassSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`

### L'interface s'adapte à la fenêtre réelle (téléphone, tablette, pliable, multi-fenêtre) et évite l'îlot/encoche

`dst-layout-window-metrics` · Android : **divergente** · P1 · effort M

DeviceLayout/WindowMetrics/SceneWindowSize mesurent la fenêtre qui porte la vue (jamais l'écran physique ni connectedScenes.first) : taille, marges de zone sûre haut/bas (clavier exclu), détection d'une Dynamic Island (inset haut ≥ 59 pt), scène active (celle qui tient la fenêtre clé), plusieurs scènes, enregistrement d'écran sur n'importe quelle scène, fenêtre de mesure hors surcouche d'appel. bubbleMaxWidth(containerWidth, sizeClass) borne la bulle à 70 % (62 % et plafond 560 en grande largeur). IslandGeometry donne la géométrie de la capsule (126×37,33, centrée dans l'inset haut, air 12 pt dessous) pour que les bannières naissent dans l'îlot.

Écarts :
- Largeur de bulle fixe widthIn(max = 300.dp) dans MessageBubble : adopter le ratio 0,70 du conteneur (0,62 et plafond 560 dp en classe de largeur Medium/Expanded)
- Aucune WindowSizeClass / WindowMetricsCalculator : fournir un LocalWindowInfo (taille de fenêtre, classe de largeur/hauteur, posture pliable) pour tous les écrans
- Seul formColumnWidth (600 dp) existe ; ajouter les autres plafonds de lecture (conversation, feed) pour tablette
- Insets : exposer des marges de zone sûre fiables (barres système, clavier exclu) pour les surfaces edge-to-edge
- Géométrie de la découpe caméra (DisplayCutout) pour que la bannière in-app naisse du trou/encoche avec 12 dp d'air dessous (IslandGeometry)
- Détecter l'enregistrement/recopie d'écran toutes fenêtres (Android 14 Activity.ScreenCaptureCallback, DisplayManager pour l'affichage externe) hors appels
- Multi-fenêtre/Split-screen/freeform : mesurer la fenêtre de l'activité, pas l'écran

Rendu : Bulle 70 % de la largeur (62 % et ≤560 dp sur grand écran), colonne de formulaire centrée 600 dp, éléments sous l'îlot avec 12 dp d'air minimum.

Transposition Android : UIWindowScene/safeAreaInsets → androidx.window WindowMetrics + WindowSizeClass + WindowInsets ; Dynamic Island → DisplayCutout ; iPad → tablettes et pliables

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Core/DeviceLayout.swift`
- `apps/ios/Meeshy/Core/IslandGeometry.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/SceneWindowSize.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/WindowMetrics.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyLayout.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/compatibility/PackageVersionCompat.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### Le tirer-pour-rafraîchir de Meeshy montre le logo, change d'état au seuil et confirme par une haptique

`dst-pull-to-refresh` · Android : **divergente** · P1 · effort M

MeeshyRefreshableScroll enveloppe une liste/ScrollView avec un indicateur de marque (MeeshyPullIndicator : logo en traits, dégradé indigo, respiration) piloté par une loi pure de phases idle → pulling(progress) → armed (seuil 90 pt : logo à 100 %, rotation 180°) → refreshing → completing → idle, dimensionné par la progression du tirage, avec haptique au franchissement du seuil puis succès/erreur à la fin et délai de respiration final. Utilisé par le fil, la liste de conversations et la racine.

Écarts :
- Material PullToRefreshBox standard : remplacer par un indicateur de marque (logo à trois traits, dégradé indigo, respiration) dont la hauteur croît avec le tirage jusqu'à 90 dp
- Loi de phases pure (idle, pulling, armed, refreshing, completing) testable en JVM, rendue sans écriture d'état quand rien ne change
- Haptique au franchissement du seuil, succès/erreur à la fin, délai final avant retour à idle
- Même composant réutilisé par le feed, la liste de conversations, les communautés et le profil

Rendu : Indicateur centré au-dessus de la liste, hauteur 0 au repos, pleine hauteur (90 dp) pendant le rafraîchissement, logo qui pivote de 180° à l'armement.

Transposition Android : .refreshable + ScrollView → PullToRefreshBox personnalisé (state + indicator)

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyPullIndicator.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/BookmarksScreen.kt`

### L'effet arc-en-ciel d'un message colore chaque lettre de façon stable

`dst-rainbow-letters` · Android : **divergente** · P2 · effort S

RainbowLetters peint chaque lettre non blanche d'un message d'une couleur de palette (6 teintes claires en sombre, 6 profondes en clair), choisie par un générateur déterministe (FNV-1a + SplitMix64) graine = identifiant du message, sans deux lettres voisines identiques ; ne touche ni les liens ni les mentions ; supprime le contour arc-en-ciel de la bulle.

Écarts :
- Android dessine une bordure balayée (sweepGradient 2 dp) pour RAINBOW ; iOS colore les lettres et retire le contour : remplacer par un AnnotatedString avec SpanStyle(color) par lettre.
- Porter les palettes sombre (A5B4FC, F0ABFC, FDA4AF, FCD34D, 6EE7B7, 7DD3FC) et claire (4338CA, A21CAF, BE123C, 92400E, 047857, 0369A1).
- Porter à l'identique colorIndices(count, seed, paletteSize) : FNV-1a 64 bits de la graine, SplitMix64 par lettre, et décalage anti-répétition ((index + 1 + (état>>32) % (taille-1)) % taille) pour obtenir les mêmes couleurs qu'iOS pour un même message.
- Exclure espaces, liens et mentions ; la graine n'existe que pour les messages portant l'effet rainbow ; rowEffects retire le drapeau rainbow du contour de bulle.
- Tests de vecteurs dorés : mêmes indices que le Swift pour des graines fixes.

Rendu : Couleur par lettre, jamais par mot ; aucune animation ; palette adaptée au thème pour garder le contraste.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/RainbowLetters.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageEffectModifiers.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`

### Un avatar unique montre photo, anneau de story, humeur et présence dans tous les contextes (liste, bulle, en-tête, profil)

`dst-avatar` · Android : **partielle** · P0 · effort L

MeeshyAvatar rend un avatar rond selon 20 contextes de taille (tray de stories 88, compact 36, lecteur 44, composer 36, auteur de post 44, commentaire 28, réaction 20, bulle 32, saisie 24, liste de conversations 52, en-têtes 44/44/28, participant récent 20, bannière 90, édition 80, feuille 80, liste d'utilisateurs 44, notification 44, personnalisé). Image (URL + ThumbHash) ou initiales sur dégradé d'accent déterministe (DynamicColorGenerator) ; anneau de story non lue (rotation continue seulement dans les contextes sans liste pour préserver le scroll) ou lue ; pastille d'humeur qui pulse (contextes autorisés, gate Reduce Motion) ; point de présence (vert/orange/gris, hors ligne = aucun point, servi dans tous les contextes) ; point « ici » (le pair a l'écran de CETTE conversation ouvert, couleur primaire, pulse quand il agit) avec transitions de remplacement ; contour équipé servi (profileDecor.avatarRing résolu par catalogue) ; types utilisateur/autre ; tap, voir profil, voir story, tap humeur (avec point), tap présence, menu contextuel dédupliqué ; libellé VoiceOver (nom, humeur, « dans la conversation »).

Écarts :
- MeeshyAvatar Android = initiales sur dégradé uniquement : aucune image (avatarURL) ni ThumbHash ; les écrans réinjectent AsyncImage à la main (ProfileScreen, 43 sites). Charger l'image dans l'atome (pipeline d'images partagé) avec fallback initiales et fondu depuis le ThumbHash
- Enum AvatarContext (20 contextes) portant taille, épaisseur d'anneau, largeur/écart, drapeaux d'animation (anneau tournant, mood qui pulse) à reprendre à l'identique ; aucune taille contextuelle côté Android
- Anneau de story : non lue (dégradé tournant, linéaire en continu, désactivé en liste) vs lue (anneau discret) ; l'anneau Android est un simple liseré fixe indigo
- Pastille d'humeur animée (spring repeatForever avec délai aléatoire, désactivée en liste et sous reduce motion) + callback de tap qui transmet le point d'ancrage
- Point de présence servi dans tous les contextes (vert/orange/gris, jamais pour hors-ligne) avec transition entrée/sortie (diminue, puis rebondit) uniquement sur changement réel
- Point « ici » (isHere : absent/présent/actif) couleur primaire, pulse quand le pair écoute/agit, visible même si la présence est masquée
- Contour équipé (profileDecor.avatarRing) résolu depuis le catalogue embarqué et dessiné autour de l'avatar
- AvatarKind (utilisateur / communauté / …) et accent par défaut déterministe depuis le nom
- Callbacks onTap / onViewProfile / onViewStory / onMoodTap / onOnlineTap et menu contextuel (appui long) avec déduplication des entrées « Voir le profil » partagées par tous les hôtes
- Libellé TalkBack complet : nom + humeur + « dans la conversation » ; l'humeur masque le point de présence
- Reduce Motion : portillon commun aux animations infinies

Rendu : Disque dégradé accent→secondaire (accent par nom), initiales Nunito bold à 38 % du diamètre, anneau de story 2,5 dp (1,5 sous 32), pastille d'humeur en bas à droite ≈ 40 % du diamètre, point de présence ≈ 26 % + 4 dp avec liseré fond ; aucune pastille hors ligne.

Transposition Android : SwiftUI ZStack + gestes → Box + Modifier.combinedClickable + DropdownMenu ; ThumbHash existant (ThumbHashPainter) pour le fond flou

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/AvatarInitials.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`

### Les couleurs de marque, d'état de message et de média sont exactement celles d'iOS

`dst-brand-color-tokens` · Android : **partielle** · P0 · effort S

MeeshyColors est la source unique des teintes : rampe Indigo 50-950, accents violets, neutres, couleurs sémantiques (succès, erreur, alerte, info, accusé de lecture), variantes tonales de dégradés, code couleur des états d'un message (vue unique, ouverte, éphémère, masqué, échec), teintes de tuile, plans nommés clair/sombre, échelle « chrome sur média » (onMedia, scrims), voiles adaptatifs (surfaceFill, controlFill, hairline), couleurs de mention et de hashtag conformes AA, dégradés de marque.

Écarts :
- Ajouter à MeeshyPalette les jetons absents : errorInk C81E1E (encre d'icône d'alerte sur fond clair, 3:1), meeshSilver A8B1BF, blue500 3B82F6, orange500 F97316, amber500 F59E0B, blockedNeutral 888888, plateauNoir 000000, violet950 2E1065.
- Ajouter le code couleur des états de message (#7599) : stateViewOnce 6366F1, stateOpened 9CA3AF, stateEphemeral F97316, stateConcealed 6B7280, stateFailed EF4444, afin que les pictogrammes de bulle ne redéclarent plus leurs couleurs.
- Ajouter les teintes de tuile (coral FF6B6B, saffron F8B500, blue 3498DB, amethyst 9B59B6, sky 45B7D1, emerald 2ECC71, teal 4ECDC4, cyan 08D9D6, rose FF2E63) et les plans nommés (surfaceDarkBase 09090B, Deep 0F0D19, Raised 13111C, Input 16142A, surfaceLightRaised F8F7FF, Mist FAFAFF, Input F5F3FF).
- Ajouter l'échelle média fermée : onMedia FFFFFF, onMediaSecondary 85 %, onMediaMuted 70 %, mediaFill 15 %, mediaHairline 20 %, mediaBackdrop 000000, scrimSoft 30 %, scrim 50 %, scrimStrong 70 %, mediaScrimTop et mediaScrimBottom (dégradé noir 55 % vers 0), onBrand blanc.
- Ajouter mentionColor(isDark) (indigo300 sombre, indigo600 clair) et hashtagColor(isDark) (indigo400 sombre, indigo800 clair) et les consommer dans RichMessageText, posts, commentaires.
- Ajouter surfaceFill (blanc 6 % / noir 4 %), controlFill (blanc 10 % / noir 5 %) et hairline (blanc 8 % / noir 5 %) paramétrés par isDark.
- Ajouter les accents de surfaces de liens (trackingAccent indigo600, shareAccent indigo400, communityAccent warning) et les alias de teintes en chaîne hexadécimale (brandPrimaryHex, successHex, errorHex...) utilisés comme paramètres accentColor.
- Étendre MeeshyTokenParityTest pour comparer chaque nouveau jeton à packages/design-tokens/ios.css (source générée) et interdire la redéclaration locale de hex dans les features.

Rendu : Teinte de marque = Indigo 500 (6366F1) vers Indigo 700 (4338CA) en diagonale haut-gauche vers bas-droite ; un état de message ne se dit que par UNE teinte (rouge d'erreur jamais pour un éphémère, orange F97316 pour la flamme) ; chrome sur média toujours blanc sur voile noir quel que soit le thème.

Transposition Android : Color SwiftUI vers androidx.compose.ui.graphics.Color ; Material.ultraThin vers fond translucide (voir dst-glass-surfaces).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPalette.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyThemeTokens.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`

### L'en-tête de chaque écran se réduit en douceur pendant le défilement

`dst-collapsible-header` · Android : **partielle** · P0 · effort M

CollapsibleHeader : hauteur 64 pt repliée à 44 pt (progress = -offset / 60), titre arrondi 24 vers 17 (gras puis semi-gras à mi-course), sous-titre qui s'efface (15 vers 12 puis 12 à 50 % une fois replié), bouton retour en disque de verre 40 pt avec gouttière de bord 28 pt, slot leading mis à l'échelle 1 vers 0,8, vue de titre personnalisée 1 vers 0,65, actions de fin (cible 44, marge 28), contenu central révélé après 60 % du repli (hauteur x1,3), accessoire sous l'en-tête, et accessoire de titre (bande compacte de stories) qui prend la place du titre entre 78 et 148 pt de défilement (hauteur repliée 44 vers 60). Suivi du décalage de défilement corrigé pour iOS 18.

Écarts :
- Taille de titre repliable 28 vers 17 sur Android contre 24 vers 17 sur iOS : aligner à 24, ajouter titleBottomPadding 6 vers 0 et echelle de la vue de titre 1 vers 0,65.
- Ajouter le bouton retour en disque de verre 40 dp (showBackButton, onBack) avec taille de flèche 18 vers 16 et gouttière latérale 28 (leadingBackInset = trailingActionsInset).
- Ajouter le sous-titre (expanded 15 vers 12 à 60 % d'opacité, fondu jusqu'à 60 % de progression ; replié 12 à 50 % après 70 %).
- Ajouter les slots leading (échelle 1 vers 0,8), titleView personnalisée, centerReveal (opacité après 0,6, décalage 6 dp, hauteur repliée x1,3), accessory sous la barre.
- Ajouter titleAccessory avec révélation 78 vers 148 dp (CollapsibleHeaderMetrics.inlineAccessoryReveal), hauteur repliée 44 vers 60, fondu croisé du titre, accessoryTrailingClearance = 2 x 44 + 28 ; Android a le paramètre mais l'accessoire est réservé (« unused this lot »).
- Ajouter les métriques : titleActionsGap 8, trailingActionsInset 16, roundChromeDiameter 40, barHorizontalPadding 12 et la priorité de mise en page des actions (jamais de débordement).
- Garder le titre en dégradé de marque Android uniquement si iOS le fait : iOS prend titleColor fourni par l'appelant ; paramétrer plutôt que fixer le brush.
- Courbe de progression : iOS = -offset/60 pt de défilement continu ; Android dérive de firstVisibleItemIndex/offset avec seuil : ajouter la variante basée sur un offset total (ScrollState / nestedScroll) pour les écrans non Lazy.

Rendu : Hauteur 64 vers 44 ; fond de verre qui apparaît avec le repli ; filet inférieur à 30 % max ; disque retour et actions de 40 pt ; les actions se masquent pendant le défilement actif et réapparaissent après 160 ms d'immobilité (déjà fait).

Transposition Android : PreferenceKey + onScrollGeometryChange (contournement iOS 18) sans objet : LazyListState / ScrollState / NestedScrollConnection donnent l'offset exact.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetTracking.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeader.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeaderMotion.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/ScrollMotionVisibility.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyTopBar.kt`

### Un lien meeshy:// ou meeshy.me ouvre le bon écran, même avant la connexion

`dst-deeplink-parser` · Android : **partielle** · P0 · effort M

DeepLinkParser classe toute URL en destination : profil (me, u/users/<pseudo>), conversation (c, conversation, contact, quickreply?text=, send?contactId&message=), lien d'invitation (join, chat), lien de suivi (/l/<jeton> résolu puis rejoué), post (post, p, feeds/post), story (story, stories, s), réel (reel, reels?seed=), communauté, hashtag, parrainage (signup?ref\|parrain\|affiliate), liens utilisateur, partage (share?text&url), appel (call?contactId&type=video), jeu (me/…), vitrine de packs (settings/packs?domaine&pack), conversations/recent et conversations/unread (élection de la conversation récente / filtre non lus), liens e-mail (magic link, vérification, réinitialisation), le reste partant en navigateur. Les hôtes reconnus incluent l'origine web de l'environnement actif. DeepLinkRouter garde un lien en attente rejoué après connexion pour les destinations qui l'autorisent, mémorise l'origine d'un lien de suivi (via) et la file « compte requis pour un lien de partage ».

Écarts :
- Pas de parseur unique : seuls des navDeepLink isolés existent (meeshy://chat|conversation(s)|c|profile|story|join|conversations, https://meeshy.me/u|chat|join|auth/magic-link) ; écrire un DeepLinkParser pur (Kotlin) miroir de l'iOS et de packages/shared, testé par table
- Destinations manquantes : post (post/p/feeds/post), story par id de contenu (story/stories/s), réel (reel, reels?seed), communauté, hashtag, parrainage (signup), liens utilisateur (links), partage entrant par URL (share?text&url), appel par lien (call?contactId&type), jeu, vitrine de packs, conversations/recent et conversations/unread
- Lien de suivi /l/<jeton> : résoudre le jeton côté serveur puis rejouer la destination, conserver l'origine (via) pour l'impression, repli « lien non résolu »
- Lien en attente rejoué après connexion (opensAfterSignIn) : mémoriser la destination, la rejouer à l'ouverture de session, ne jamais rejouer join/chat/magic/vérification/appel
- Intent-filters App Links manquants pour /post, /p, /story, /s, /reel, /reels, /l, /hashtag, /community, /signup, /me, /links, /share (+ assetlinks.json), et alias custom-scheme contact/quickreply/send
- Élection « conversation récente » (hors archivées/fermées) et filtre « non lus » pour les widgets et App Shortcuts : aujourd'hui le tap ouvre la liste sans cible
- Hôtes meeshy.me/www/app + origine web de l'environnement actif (ServerEnvironment) à reconnaître comme liens internes
- Normalisation du slug de pack (minuscules/chiffres/tirets, ≤64) pour settings/packs

Rendu : Aucun écran propre : le lien atterrit directement sur la destination (profil en feuille, conversation, détail), avec repli navigateur pour tout hôte inconnu.

Transposition Android : Universal Links + scheme meeshy:// → Android App Links vérifiés (assetlinks.json) + intent-filters + navDeepLink ; pendingDeepLink → SavedStateHandle/DataStore rejoué après session ; App Intents → App Shortcuts

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/PackFocusSlug.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/ConversationListEntry.swift`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/model/ProfileShareLink.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/widget/QuickReplyDeepLink.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/shortcuts/DynamicShortcutsPublisher.kt`

### Espacements, rayons, tailles, bordures, opacités, ombres et ressorts suivent les échelles iOS

`dst-design-token-scales` · Android : **partielle** · P0 · effort S

DesignTokens définit les échelles partagées : MeeshySpacing (2 à 32), MeeshyRadius (4 à 24 et full), tailles de police nommées (9 à 34), tailles d'icône (10 à 48), tailles de contrôle (28, 32, 36, 40, cible 44, bouton 52), bordures (0,5 à 2), opacités nommées (0,04 à 0,85), ombres subtle/medium/strong, animations ressort et délai d'échelonnement, largeurs de lecture iPad (formulaire 600, contenu 700) avec iPadFormWidth.

Écarts :
- MeeshySpacing Android n'a que 8 crans sur une grille de 4 : ajouter xxs 2, xsPlus 6, smPlus 10, mdPlus 14 (les écrans iOS les utilisent) et retirer la contrainte de grille 4 dp du test.
- MeeshyRadius Android n'a que sm 10, md 14, lg 16, xl 20, xxl 24 : ajouter xxs 4, xs 8, smPlus 12, lgPlus 18 (cartes de fil, squelettes), xlPlus 22.
- Créer MeeshyFontSize (micro 9, caption 10, footnote 11, small 12, subhead 13, label 14, body 15, callout 16, headline 17, subtitle 18, title3 20, title 22, display 28, largeTitle 34), MeeshyIconSize (10, 12, 14, 16, 18, 20, 22, 28, 48), MeeshyControlSize (28, 32, 36, 40, tapTarget 44, buttonHeight 52), MeeshyBorder (0,5 ; 1 ; 1,5 ; 2) et MeeshyOpacity (0,04 ; 0,08 ; 0,15 ; 0,3 ; 0,5 ; 0,7 ; 0,85).
- Ajouter MeeshyShadow subtle (10 %, rayon 4, y 2), medium (20 %, 8, 4), strong (30 %, 12, 6).
- Aligner MeeshyMotion sur les ressorts iOS : springFast (réponse 0,25, amortissement 0,7), springDefault (0,4 / 0,75), springBouncy (0,5 / 0,6) convertis en dampingRatio et stiffness ; staggerDelay 0,04 s (Android 45 ms).
- Ajouter MeeshyLayout.contentMaxWidth 700 à côté de formMaxWidth 600 et un modificateur contentColumnWidth.

Rendu : Les valeurs doivent rester des noms de jeton dans les écrans : aucun littéral dp/sp dans une feature.

Transposition Android : CGFloat (points) vers Dp ; Animation.spring(response, dampingFraction) vers spring(dampingRatio, stiffness) avec stiffness = (2 pi / response)^2.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyDimens.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyMotion.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyLayout.kt`

### Les liens à jeton d'e-mail n'ouvrent jamais de session par accident et les liens Meeshy touchés dans un message s'ouvrent dans l'app

`dst-email-link-secret-inapp-links` · Android : **partielle** · P0 · effort M

EmailLinkSecret est le miroir Swift de packages/shared/utils/email-link-secret.ts : une lecture LARGE (le chemin, normalisé contre casse, barres doublées, backslash, encodages multiples, caractères invisibles, point-virgule, espaces, . et .., est-il celui d'un lien à jeton ou SOUS lui ?) et une lecture ÉTROITE (forme exacte écrite par les e-mails, https sans identifiants ni port : magic-link, vérification d'e-mail, réinitialisation). Un lien à jeton touché dans un bulle, un post ou un commentaire ne connecte JAMAIS : il s'ouvre dans un navigateur intégré. InAppLinks route les autres liens Meeshy touchés dans l'app vers le routeur interne (comme au lancement système), laisse partir en navigateur les invitations, parrainages et liens e-mail.

Écarts :
- Seul le magic link (préfixe https://meeshy.me/auth/magic-link) est protégé ; portage de EmailLinkSecret (normalisation large + forme exacte) pour magic-link, verify-email, reset-password, revoke-sessions, account/deletion, settings/verify-email-change et alias email-link
- Liens de vérification d'e-mail et de réinitialisation de mot de passe non pris en charge côté Android (iOS : emailVerificationLink, passwordResetLink)
- Un lien à jeton tapé dans un message doit s'ouvrir en Custom Tab uniquement (jamais renvoyé à l'app comme App Link) : aujourd'hui ChatLinkOpener ouvre toute URL https en Custom Tab, et un lien meeshy.me d'App Link vérifié peut être rerouté par le système
- Les liens Meeshy (post, story, profil, hashtag, communauté…) touchés dans un message, un post ou un commentaire doivent être routés par le DeepLinkParser interne plutôt que par un Custom Tab
- Invitations, parrainages et liens e-mail touchés dans l'app partent en navigateur (comportement iOS #8075, #10868)
- Table de tests alignée cas pour cas sur le témoin TypeScript

Rendu : Navigateur intégré teinté de l'accent de la conversation ; aucune bascule visuelle pour un lien Meeshy routé en interne.

Transposition Android : OpenURLAction + SFSafariViewController → LocalUriHandler / interception des liens du texte riche + Chrome Custom Tabs ; EXTRA_EXCLUDE_COMPONENTS ou navigation interne pour éviter le renvoi App Link

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/EmailLinkSecret.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/InAppLinks.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkOpenPolicy.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/EmailRecovery.kt`

### Les deux boutons flottants (Flux et Menu) se posent à n'importe quelle hauteur contre un bord, sans se chevaucher, et s'effacent pendant le défilement

`dst-floating-buttons` · Android : **partielle** · P0 · effort M

FreeFloatingButtonsContainer pose les deux boutons à la hauteur choisie contre le bord gauche ou droit (côté + fraction de la hauteur d'écran, persistés), bornés par la zone sûre RÉELLE mesurée (îlot, indicateur d'accueil), repoussés l'un de l'autre (écart minimal du même côté), positions par défaut (Flux haut gauche, Menu haut droit, sous la bande de stories). Le disque suit le doigt image par image, à la levée la géométrie décide de ce qu'il faut écrire ; tap, appui long, libellé/indice/valeur/action d'accessibilité. FloatingButtonPlacement relit aussi les anciens formats (v2 fraction de plage, x,y legacy). ScrollMotionVisibility : en mouvement ⇒ pas de boutons (silence de 160 ms pour déclarer l'arrêt, fondu court, boutons non tappables tant qu'effacés).

Écarts :
- Position Android = (x,y) normalisés dans [0,1] avec aimantation de X seulement ; iOS stocke côté (L/R) + fraction de la hauteur d'ÉCRAN (le bouton est toujours contre un bord) bornée par la zone sûre réelle mesurée
- Aucune résolution de chevauchement entre les deux boutons du même côté (écart minimal entre centres) ni de bande réservée sous l'en-tête étendu / la bande de stories / le champ de recherche
- Zone sûre réelle (WindowInsets système + cutout) au lieu de systemBarsInsetsCompat() seul ; relecture d'un conteneur qui ne touche pas le haut de l'écran (bannière de lecteur audio qui le pousse vers le bas)
- Géométrie unique (FloatingButtonGeometry) partagée par le conteneur, l'échelle du menu et l'ancre des réels
- Après relâchement, n'écrire la position que si le déplacement dépasse un seuil (évite les micro-écritures)
- Hors-hit-testing pendant le mouvement (le doigt qui freine la liste ne doit pas toucher un bouton effacé) ; ScrollMotionVisibility existe côté Android mais vérifier son câblage sur toutes les listes
- Anciens formats de position (compatibilité de préférences) : pas nécessaire côté Android (préférence locale)

Rendu : Deux disques de verre (≈ 56 dp, cible 48+ dp) collés aux bords, jamais sous l'encoche/indicateur ; fondu 0↔1 en ≈ 220 ms ; position retrouvée après relance.

Transposition Android : DragGesture + GeometryReader → Modifier.pointerInput/draggable + onGloballyPositioned ; @AppStorage → DataStore (FloatingButtonPositionStore)

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtonPlacement.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ScrollMotionVisibility.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtons.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyMenuFab.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/ScrollMotionVisibility.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/chrome/FloatingButtonPosition.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/chrome/FloatingMenuGeometry.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chrome/FloatingButtonPositionStore.kt`

### Les cartes et contrôles posés sur verre gardent contraste, relief et bordure iOS

`dst-glass-surfaces` · Android : **partielle** · P0 · effort M

GlassCard : matériau ultra-fin, rayon 20, bordure dégradée 1 pt (glassBorderGradient), ombre noire 20 % rayon 10 y 5. GlassControlForeground : encre blanche en sombre, indigo950 en clair pour icônes et libellés sur verre. MeeshySurface : translucide ou opaque, forcé opaque quand « Réduire la transparence » est actif.

Écarts :
- MeeshyGlassSurface n'a ni ombre (noir 20 %, rayon 10, y 5) ni flou d'arrière-plan : ajouter l'ombre et, à partir de l'API 31, un vrai flou du contenu derrière (RenderEffect / bibliothèque haze) avec repli opaque teinté avant l'API 31.
- Rayon par défaut du verre 16 dp alors que glassCard iOS vaut 20 : exposer cornerRadius et prendre 20 par défaut.
- Ajouter glassControlForeground() (blanc en sombre, indigo950 en clair) et l'imposer aux icônes de MeeshyFloatingButtons, CollapsibleHeaderActionButton, menus.
- Ajouter MeeshySurface {Translucent, Opaque} résolu en opaque quand la transparence réduite est demandée (préférence in-app ou contraste élevé système) et avant l'API 31.
- Coin sélectif (RoundedCorner) : utiliser RoundedCornerShape(topStart...) avec miroir RTL.

Rendu : Verre = remplissage translucide teinté indigo (60 % sombre, 72 % clair) + bordure dégradée 1 dp (indigo400 30 % vers indigo700 10 % en sombre) + ombre douce ; texte et icônes jamais blancs sur verre clair.

Transposition Android : Material.ultraThin / adaptiveGlass (Liquid Glass iOS 26) vers fond translucide + bordure spéculaire + flou RenderEffect sur API 31+.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshySurface.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyGlassSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyCard.kt`

### Toute couleur hexadécimale reçue s'affiche correctement et le texte posé dessus reste lisible

`dst-hex-color-readable-ink` · Android : **partielle** · P0 · effort S

Un analyseur unique accepte RRGGBB, #RRGGBB et RRGGBBAA (alpha en dernier, convention du dépôt), tolérant, avec chemin rapide sans allocation. readableInk élit noir ou blanc selon l'égalité de contraste WCAG (seuil sqrt(0,05 x 1,05) - 0,05, environ 0,179) ; luminance WCAG ; palette de conversation vers couleurs ; fond uni de Cadre (StoryBackdrop.solidColor).

Écarts :
- hexColor() n'accepte que 6 chiffres : ajouter RRGGBBAA (alpha en dernier, pas ARGB Android) et # RGB tolérant, avec valeur Unspecified documentée pour une entrée illisible.
- Supprimer les copies locales parseHexColor / parseBackingColor du StoryComposerScreen et toute autre redéclaration au profit d'un seul parseur dans :core:model (HexColor pur) plus extension Compose.
- Ajouter Color.luminance() WCAG et Color.readableInk (noir ou blanc par égalité de contraste, formule exacte, pas un seuil arrondi 0,5 ou 0,6).
- Ajouter les extensions ConversationColorPalette vers Color (primary, secondary, accent) et StoryBackdrop.solidColor.
- Tests : 000000A6 donne noir à 65 %, 6366F1A6 donne indigo à 65 %.

Transposition Android : UIColor.getRed vers calcul direct des canaux ; Scanner hex vers Long.parseLong radix 16.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Theme/HexColor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ColorExtensions.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/StoryBackdrop+Color.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/ColorHex.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### L'en-tête d'identité d'un message, commentaire ou post compose nom, pseudo, rôle, heure, statut d'envoi, drapeaux de langue et actions

`dst-identity-bar` · Android : **partielle** · P0 · effort M

UserIdentityBar assemble une rangée d'éléments déclaratifs (nom, @pseudo, badge de rôle créateur/admin/modérateur, heure, statut de livraison, drapeaux de langue avec tap, bouton traduire, présence, membre depuis, bouton d'action, menu d'actions, texte libre) avec avatar configurable (contour équipé inclus). Statuts de livraison dessinés : envoi, invisible, horloge, lent, envoyé, remis, lu, échec. Variante messageBubble (groupe : heure en ligne avec l'auteur).

Écarts :
- Pas de composant d'en-tête d'identité partagé : MessageBubble, commentaires et posts recomposent chacun leur ligne ; créer IdentityBarElement (sealed) + MeeshyUserIdentityBar réutilisable
- Éléments manquants/à aligner : badge de rôle (créateur ambre, admin indigo 500, modérateur indigo 400, membre rien), « membre depuis », bouton traduire, menu d'actions, texte libre étiqueté
- Statuts de livraison complets (envoi, invisible, horloge, lent, envoyé, remis, lu, échec) rendus à l'identique, DeliveryStatusResolver et SendingClockRevealPresenter existent déjà
- Variante bulle de groupe : heure en ligne avec l'auteur ; drapeaux de langue cliquables (actif surligné)
- Avatar configurable (AvatarConfig) avec contour équipé servi

Rendu : Nom en gras, @pseudo secondaire, heure à droite en légende, petits drapeaux 14 sp cliquables, badge de rôle pastille colorée ; une seule ligne, troncature du nom en premier.

Transposition Android : HStack d'éléments → Row/FlowRow Compose avec composables par élément

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/DeliveryStatusResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/SendingClockRevealPresenter.kt`

### Les images apparaissent instantanément (cache, flou ThumbHash), décodées à la bonne taille et respectant la politique de téléchargement

`dst-image-pipeline` · Android : **partielle** · P0 · effort M

CachedAsyncImage charge une image en cache-first : image résidente en mémoire/disque (sonde disque jamais répétée dans un body, WarmImageProbe mémorise seulement l'ABSENCE, NSCache d'abord), puis réseau ; affiche un ThumbHash décodé (~32 px) en fond pendant le chargement ; décode à la taille utile (DecodeBudget : plein écran, adapté à un cadre, pleine largeur) plutôt qu'au plafond de 1200 px ; spinner et bouton Réessayer désactivables pour les surfaces décoratives ; politique de téléchargement (Wi-Fi/données/économiseur) qui retient la requête jusqu'à un geste (un tap manuel l'outrepasse, un fichier local file:// n'y est jamais soumis) ; reflet de chargement selon l'état réel (loading / failed / deferred). LocalImagePresence dit si une image est déjà sur l'appareil (coût réseau nul).

Écarts :
- 22 sites utilisent Coil AsyncImage/ImageRequest directement : créer MeeshyAsyncImage(url, thumbHash, targetSize, showsLoadingChrome, forceLoad) unique avec ThumbHash (ThumbHashPainter existe) comme fond flou immédiat et fondu vers l'image
- DecodeBudget : taille de décodage selon la surface (plein écran = largeur écran × densité ; adapté = max(w,h) × densité ; pleine largeur) pour éviter les bitmaps pleine résolution (avatars, couvertures)
- Politique de téléchargement automatique (MediaAutoDownload/NetworkConditionMonitor/MediaDownloadPreferencesStore existent) appliquée aux images : requête retenue sans geste ; un tap manuel (visionneuse plein écran) outrepasse ; un fichier local n'est jamais soumis
- Sonde de cache sans E/S disque dans la composition (mémoïser l'absence, borner le mémo) : utiliser ImageLoader.memoryCache?.get avant toute lecture disque
- États dessinés : chargement (reflet), échec avec bouton Réessayer, différé (icône « toucher pour télécharger »), décoratif sans chrome
- LocalImagePresence : savoir si l'image est déjà sur l'appareil (disque ou mémoire) pour choisir la bonne URL sans attente
- Relance par jeton (retryToken) quand le média arrive par un autre chemin sous la même URL

Rendu : Fond flou ThumbHash qui se précise en fondu, jamais de case vide ni de saut de mise en page ; placeholder à reflet uniquement pendant un chargement réel.

Transposition Android : URLSession + NSCache + DiskCacheStore → Coil 3 (memory/disk cache, size resolver, Transformation) + ThumbHashPainter

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/WarmImageProbe.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/DecodeBudget.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ThumbHash.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`

### L'app passe en arrière-plan et en revient sans perdre ses sockets, sa base ni ses envois en attente

`dst-lifecycle-app-transitions` · Android : **partielle** · P0 · effort M

AppLifecycleHooks installe UNE fois, hors de toute fenêtre, les signaux d'application (revient actif avec indicateur « vrai passage en arrière-plan », entre en arrière-plan, session ouverte/fermée) ; un aller-retour « inactif » (centre de contrôle, Face ID) ne réarme rien. BackgroundTransitionCoordinator exécute enterBackground sous une enveloppe beginBackgroundTask (suspend la base et les sockets, vide le cache, accuse les push, étapes bornées et annulables) et resumeFromBackground (reprend base et sockets, flush de l'outbox, flush d'engagement borné, étape média rejouée) avec registre d'époque ; resumeWithoutSession couvre invité et écran de connexion. BackgroundTaskLease termine la tâche exactement une fois (fin normale ou expiration).

Écarts :
- MeeshyApplication ne câble que presence:app-state sur ON_START/ON_STOP : ajouter une vraie transition (ProcessLifecycleOwner) qui, en arrière-plan, suspend les sockets après un délai de grâce et flush le cache, et, au retour, reconnecte, rejoue l'outbox (OutboxFlushWorker.enqueue immédiat) et resynchronise depuis le dernier checkpoint
- Étapes bornées dans le temps et annulables (flush d'engagement avec budget), équivalent d'un foreground-service court/expedited work pour ne pas perdre l'envoi à la mise en arrière-plan
- Indicateur « retour d'un vrai arrière-plan » vs simple perte de focus (multi-fenêtre, dialogue système) pour ne pas tout réarmer
- Reprise sans session (invité entré par lien, écran de connexion) : reconstruire la socket invité à partir du jeton anonyme
- Registre d'époque pour qu'un enterBackground tardif ne suspende pas une app déjà revenue au premier plan
- Hook d'authentification unique au niveau Application (indépendant de toute activité) qui démonte le chiffrement/les caches du compte sorti

Rendu : Aucun visuel ; le retour doit afficher instantanément le cache et resynchroniser en silence (pas de spinner).

Transposition Android : UIApplication didEnterBackground/didBecomeActive + beginBackgroundTask → ProcessLifecycleOwner + WorkManager expedited work / foreground service ; 0xDEAD10CC (SQLite suspendu) sans équivalent Android

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Core/AppLifecycleHooks.swift`
- `apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Services/BackgroundTaskLease.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeLifecyclePlan.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### La base locale s'ouvre toujours (même corrompue), reste propre à chaque compte et se purge à la sortie

`dst-lifecycle-db-bootstrap` · Android : **partielle** · P0 · effort M

DependencyContainer ouvre la base du compte actif (clé lue du trousseau en synchrone pour servir cache-first avant la fin de checkSession), via un MessageStoreRouter à sessions par compte : adoption de l'ancien store, reprise après corruption (fichier corrompu mis en quarantaine .corrupted.<ts> avec ses -wal/-shm, recréation), repli sur un chemin secondaire puis sur un stockage éphémère pour ne jamais boucler en crash, diagnostics (premier échec, quarantaine, repli) remontés à l'app/Crashlytics et à l'écran de récupération. Le changement de compte conserve ou purge selon la rétention ; une purge de logout est inconditionnelle (fuite inter-comptes) et, quand elle suit une invalidation serveur avec des envois en attente, un toast prévient de la perte. Le pont de persistance du feed est possédé par le container (pas par l'écran).

Écarts :
- Une seule base Room non namespacée, fallbackToDestructiveMigration : ajouter une base par compte (nom de fichier dérivé de l'id utilisateur) pour que le changement de compte conserve les caches du compte quitté selon la politique de rétention
- Aucune reprise sur base corrompue : intercepter SQLiteException/DatabaseCorruptException à l'ouverture, mettre le fichier en quarantaine, recréer, puis repli sur base en mémoire (jamais de crash en boucle)
- DatabaseInitDiagnostics (premier échec, récupération tentée, chemin de quarantaine, repli) exposés à l'app, au rapport de crash et à un écran de récupération
- Toast « des messages en attente ont été perdus » quand la purge de logout suit une invalidation serveur de session avec outbox non vide (jamais pour un logout volontaire)
- Purge de logout aussi quand l'app démarre déjà déconnectée (état « résolu, personne ») sans purger à chaque démarrage à froid sur session valide
- Ouverture de la base du compte actif en synchrone au démarrage pour servir le cache avant la fin de la restauration de session
- Pont de persistance du feed possédé par le conteneur applicatif (réactions, commentaires, traductions reçus même hors écran du feed)

Rendu : Écran de récupération simple (« Mode dégradé ») avec bouton réessayer/exporter les diagnostics ; toast d'avertissement pour la perte d'envois.

Transposition Android : GRDB DatabasePool + App Group → Room (une base par compte) dans filesDir ; protection fichier → chiffrement SQLCipher optionnel

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Core/DependencyContainer.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`

### Naviguer dans une pile unique où les hubs se dépilent, avec retour cohérent et cibles différées (message à surligner, recherche, composer)

`dst-nav-router-stack` · Android : **partielle** · P0 · effort M

Le Router iOS porte un enum Route typé (conversation, réglages, profil, contacts(onglet), découverte, à proximité, communautés, notifications, stats, progression/jeu, liens, affiliation, liens de suivi/partage/communauté, export, détail de post avec commentaire ciblé, hashtag, signets, favoris, demandes d'amis, cible de story, spotlight humeur), des titres localisés, la notion de hub (renaviguer vers un hub déjà empilé dépile jusqu'à lui, une route identique à la courante est ignorée), push/pop/popToRoot/replaceStack, navigateToConversation qui ferme d'abord les surfaces présentées, des états différés consommables une fois (message à surligner scopé conversation, ouvrir recherche, ouvrir composer du fil, contexte de réponse versionné, mode de lecture forcé, reveal d'engagement), le suivi analytique de chaque route, une façade RouterCommands, le retour dans un panneau (PanelBackAction) et le geste de retour par le bord réactivé quand la barre est masquée (refusé à la racine, désactivable pour les écrans à défilement horizontal).

Écarts :
- Routes absentes côté Android : communautés (liste, détail, création, réglages, membres, invitation), progression/jeu (hub, sections, règles, chronique, pages de jeu, concepts, tableau de bord), liens (Liens, affiliation, liens de suivi, liens de communauté), résultats de hashtag, demandes d'amis, cible de notification de story par id de contenu, spotlight humeur
- Routes.CHAT ne porte que conversationId : ajouter l'argument optionnel messageId (atterrissage et surlignage du message, scopé à la conversation, consommé une seule fois)
- POST_DETAIL sans showComments / commentId / parentCommentId : impossible d'ouvrir un post directement sur un commentaire ou une réponse
- Règle de hub : renaviguer vers un hub déjà dans la pile doit appeler popBackStack(route, inclusive=false) au lieu d'empiler ; ignorer une route égale à la courante (launchSingleTop systématique)
- États différés « consommables une fois » absents (ouvrir la recherche, ouvrir le composer du fil, contexte de réponse versionné, reveal d'engagement, mode de lecture forcé) : prévoir un holder SharedFlow/Channel ou SavedStateHandle
- Aucun suivi analytique de route (trackRoute) à chaque changement de destination
- Titre de scène localisé par route (displayTitle) absent, nécessaire aux volets tablette et aux fenêtres détachées
- Geste de retour : activer le retour prédictif (enableOnBackInvokedCallback), exclure les zones de swipe horizontal (systemGestureExclusion) pour les carrousels/rivière, ne jamais lancer le pop à la racine
- Retour dans un volet de détail tablette (PanelBackAction) absent, dépend du layout adaptatif

Rendu : Transitions push/pop natives, aucune animation parasite quand une surface plein écran se ferme sous l'ouverture d'une conversation ; le titre de scène suit la route courante.

Transposition Android : NavigationStack + path → Navigation Compose NavHost (routes typées) ; Transaction.disablesAnimations → NavOptions sans animation ; interactivePopGestureRecognizer → retour prédictif + systemGestureExclusion ; panneau droit iPad → NavigableListDetailPaneScaffold

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/RouterCommands.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/PanelBackAction.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/InteractivePopEnabler.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/CallRoute.kt`

### Réagir par une barre d'émojis rapide (15 par défaut), scrubbable au doigt, avec le sélecteur complet en feuille

`dst-reactions-picker` · Android : **partielle** · P0 · effort M

EmojiReactionPicker : rangée d'émojis rapides en pilule (capsule verre ou nue), échelle par défaut 1,5 pour TOUTES les surfaces (story, message, image, commentaire, attachement), scrollable pour dépasser la largeur, tuile survolée par le scrub agrandie ×1,35 avec rebond (les cadres de tuiles sont publiés dans un espace de coordonnées nommé pour le hit-testing du scrub), haptique légère, bouton « + » vers le sélecteur complet (catégories Réactions, Visages, Gestes, Coeurs, Animaux, Objets, avec onglets, fermeture de la feuille par glissement). MeeshyQuickReactions est la liste unique de repli (15 émojis : 👍 ❤️ 😂 😮 😢 🙏 🔥 🎉 💯 😍 👀 🤣 💪 ✨ 🥺) quand l'historique d'usage est vide ; le cœur ❤️ est l'émoji du geste simple (double-tap).

Écarts :
- Liste de repli Android = 8 émojis (❤️ 😂 🔥 👏 😮 😢 🥰 👍) : passer aux 15 de MeeshyQuickReactions.standard (ordre 👍 ❤️ 😂 😮 😢 🙏 🔥 🎉 💯 😍 👀 🤣 💪 ✨ 🥺) et exposer l'émoji du double-tap (❤️)
- Échelle unique 1,5 appliquée à tous les hôtes (story, message, image, commentaire, attachement) via un paramètre scale par défaut ; aucun hôte ne surcharge sans justification
- Habillage de rangée paramétrable : capsule (verre) par défaut, nue (aucun cadre) pour les stories plein écran et le voile d'appui long
- Mode défilant (scrollable) avec la pilule de fond sans clipping, scrub avec rebond ×1,35 et haptique légère par tuile (déjà partiellement : onTileBounds)
- Sélecteur complet : 6 catégories avec onglets, style dark/light, fermeture par glissement vers le bas
- Style de rangée dark/light selon le fond (story vs message)

Rendu : Pilule de verre flottante, émojis ×1,5 (≈ 36 sp), tuile survolée ×1,35 qui rebondit, « + » terminal, indicateur de réaction déjà posée en accent.

Transposition Android : HStack d'émojis + DragGesture → Row/LazyRow + pointerInput de scrub ; sheet → ModalBottomSheet

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyQuickReactions.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiCatalog.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiUsageRanker.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt`

### Le texte des messages, posts et commentaires rend le markdown, les blocs, les mentions, hashtags et liens de suivi de façon cliquable

`dst-rich-text` · Android : **partielle** · P0 · effort M

MessageTextRenderer traite le texte en une passe par pipeline de règles : markdown inline (**gras**, *italique*, ~~barré~~, __souligné__, ***gras italique***, `code`, [libellé](https://…)/(mailto:…)) imbriqué par récursion, blocs (#/##/### titres, listes à puces et numérotées, citations >, blocs de code ```), adresses sans schéma (www… → https, a@b.fr → mailto), liens Meeshy m+TOKEN → <origine web>/l/TOKEN, mentions @pseudo (nom affiché si fourni, seuls les pseudos réels deviennent liens quand l'appelant les connaît), hashtags #tag → /hashtag/<tag>, URLs, [[https://…]] ouvert directement. LinkDisplayLaw lit la carte trackedLinks servie par la passerelle : une URL mappée s'affiche m+<jeton> et s'ouvre par /l/<jeton>, un [libellé](url) mappé ouvre /l/<jeton>. Texte d'un auteur sans compte : liens inertes (affichés tels quels, jamais cliquables). plainText produit le texte sans notation pour les aperçus d'une ligne et les libellés VoiceOver.

Écarts :
- Markdown manquant : ***gras italique***, `code` inline, [libellé](https://…) et [libellé](mailto:…), blocs (titres #/##/###, listes à puces/numérotées, citations, blocs de code ```), miroir de packages/shared/utils/text-blocks.ts avec chemin rapide hasBlockSyntax
- Hashtags #tag → https://meeshy.me/hashtag/<tag> absents (les titres # suivis d'un espace ne sont pas des hashtags)
- Adresses sans schéma : www.… → https://www…, a@b.fr → mailto:, [[https://…]] ouvert directement
- trackedLinks (carte url → jeton servie avec le contenu) et LinkDisplayLaw : affichage m+<jeton> et ouverture via <origine web>/l/<jeton> (origine de l'environnement ACTIF) ; seul m+TOKEN littéral est géré aujourd'hui
- validUsernames : seuls les pseudos existants deviennent liens (posts, stories, réels) ; liens inertes (linksAreInert) pour un auteur sans compte
- Couleurs de mention/hashtag/accent paramétrables, taille relative (échelle de police système)
- plainText(text) pour les aperçus d'une ligne et les descriptions TalkBack (retirer **, [], # etc.)
- Rendu Compose des blocs (titre plus grand en gras, liste à puces avec retrait, citation avec barre, code monospace sur fond)

Rendu : Liens soulignés à la couleur d'accent, mentions et hashtags colorés tappables, citation avec barre latérale, bloc de code monospace sur fond secondaire, titres plus gras/grands sans devenir des titres de document.

Transposition Android : AttributedString + NSRegularExpression → AnnotatedString + Regex/LinkAnnotation (Compose 1.7) + Text block layout

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer+Blocks.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageTextParser.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/RichMessageText.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewParser.kt`

### Pendant un premier chargement à froid, des squelettes qui scintillent remplacent les spinners

`dst-skeleton-loading` · Android : **partielle** · P0 · effort M

Squelettes dédiés avec reflet animé (SkeletonShape + skeletonShimmer, bande 120 pt, 1,5 s, teinte textMuted 30 %, actif seulement en phase « chargement » et hors Reduce Motion) pour le fil (carte de post : entête cercle 40 + lignes, 3 lignes de corps dont la dernière à 220, média 200, rangée de 4 actions), le profil (bannière 120, avatar 90 chevauchant, identité, bio 2 lignes, 3 cellules de stats), le plateau de stories (6 anneaux 96/88 + libellé 72x7) et les lignes de liens (4 largeurs alternées). SkeletonVisibilityResolver unique : jamais de squelette si le cache a des données, uniquement en état « loading ».

Écarts :
- MeeshySkeletonBox est un aplat statique : ajouter le reflet (Brush linéaire animé, bande 120 dp, durée 1,5 s, teinte textMuted 30 %) via un modificateur skeletonShimmer qui s'arrête hors phase « chargement » et sous Reduce Motion ; variante « voile » (blanc 15 %, bande 60 % de la largeur, 2 s).
- Créer SkeletonShape(width?, height=16, cornerRadius=14) (remplissage textMuted 15 %, masqué du lecteur d'écran).
- Créer SkeletonFeedPost / SkeletonFeedList(count=3, espacement 16 ; count=2 pour « charger plus ») aux dimensions iOS (carte rayon 18, padding 16, bordure 1, média 200 rayon 14, 4 actions).
- Créer SkeletonProfileHeader (bannière 120 rayon 16, avatar 90 avec anneau 4 chevauchant de -45, identité 160x18 et 100x12, bio 2 lignes dont la dernière à 200, 3 cellules de stats rayon 14) : ProfileScreen affiche aujourd'hui un CircularProgressIndicator à froid.
- Créer SkeletonStoryThumb / SkeletonStoryTrayRow (anneau 96, avatar 88, libellé 72x7, 6 éléments espacés de 12, défilement horizontal) et SkeletonLinkRow / SkeletonLinkList (largeurs de titre 140/110/168/96, de sous-titre 180/150/120/200, pastille de fin 20x20).
- Teintes : placeholder blanc 8 % (sombre) ou noir 4 % (clair), fond de carte blanc 4 % ou noir 2 %, bordure 4 %.
- Étiquettes d'accessibilité : « Chargement d'une publication », « Chargement du profil », « Chargement des stories », « Chargement d'un lien » ; vignettes de stories masquées individuellement.
- Centraliser SkeletonVisibilityResolver.shouldShowSkeleton(loadState, hasCachedData) / (isLoading, hasCachedData) (pur, testé) et l'imposer à Feed, Profil, Plateau de stories, Liens, Communautés ; interdire les spinners sur cache non vide.

Rendu : Les formes reprennent la géométrie exacte du contenu réel pour éviter tout saut de mise en page à l'arrivée des données ; reflet diagonal lent, pas de pulsation.

Transposition Android : LoadingSheen (CAGradient) vers Brush.linearGradient animé par rememberInfiniteTransition.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonFeedPost.swift`
- `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonLinkRow.swift`
- `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonProfileHeader.swift`
- `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonStoryThumb.swift`
- `apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonVisibilityResolver.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListContent.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### Les surfaces teintées, bordures, boutons et fonds d'ambiance suivent la palette iOS

`dst-theme-palette-surfaces` · Android : **partielle** · P0 · effort S

ThemePalette dérive du mode clair/sombre : fond primaire/secondaire/tertiaire, surface(tint, intensity) et surfaceGradient (0,15 puis 0,08 en clair, décroissant x0,3), border(tint) dégradé, accentText(hex) adapté au thème (luminosité min 0,70 en sombre, max 0,60 en clair), buttonGradient (couleur vers 75 %) et buttonShadow (50 % sombre, 30 % clair), quatre orbes d'ambiance, dégradé de fond à 3 arrêts, champs de saisie. La palette est injectée dans l'environnement (ThemePaletteEnvironment) pour que les cellules de liste ne dépendent d'aucun singleton observé.

Écarts :
- Ajouter au thème Compose les fonctions surface(tint, intensity), surfaceGradient(tint), border(tint, intensity=0.4) (clair : 0,6 x intensité vers 0,1 x ; sombre : intensité vers 0,2 x), accentText(hex) enveloppant DynamicColorGenerator.adaptedColor, buttonGradient(color) et buttonShadow(color).
- MeeshyBackground a 3 orbes (260/320/200 dp, alphas 0,14/0,12/0,08, flou 70 dp) : les remplacer par les 4 orbes iOS (6366F1 300 pt offset -100,-200 ; 4338CA 350 pt 150,300 ; 818CF8 250 pt 100,-100 ; A5B4FC 200 pt -150,200) avec opacités 0,10/0,10/0,08/0,06 en sombre et 0,05/0,05/0,04/0,03 en clair.
- Ajouter backgroundGradient (sombre 09090B, 0F0D19, 13111C ; clair FFFFFF, FAFAFF, F8F7FF) distinct de mainBackground (09090B, 13111C, 1E1B4B / FFFFFF, F8F7FF, EEF2FF), utilisé par RootThemedBackground.
- Exposer la palette via CompositionLocal (déjà LocalMeeshyTokens) en garantissant que les items de LazyColumn reçoivent isDark en primitive et non un état observé (règle Zero Unnecessary Re-render).
- Fournir un repli opaque du matériau « verre » avant API 31 (voir dst-glass-surfaces).

Rendu : Les orbes sont flous (rayon = 25 % de la taille), très discrets en clair ; la surface teintée est un voile de la couleur d'accent de la conversation, jamais une couleur pleine.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemePalette.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemePaletteEnvironment.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyThemeTokens.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyTheme.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyBackground.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`

### Les lecteurs d'écran annoncent les événements sans changement de focus (nouveau message, résultat asynchrone, toast)

`dst-a11y-announcements` · Android : **partielle** · P1 · effort S

AdaptiveAccessibility publie une annonce VoiceOver/technologie d'assistance avec priorité (iOS 17+ : l'annonce n'est pas perdue si le lecteur parle déjà ; iOS 16 : notification simple). Tous les points d'entrée sont sans effet quand aucune technologie d'assistance n'est active.

Écarts :
- Un seul usage de liveRegion : ajouter un MeeshyAccessibilityAnnouncer (View.announceForAccessibility / semantics { liveRegion }) appelé par les toasts, les messages entrants, les résultats asynchrones
- No-op si TalkBack/accessibilité inactive (AccessibilityManager.isEnabled)
- Priorité d'annonce : assertive vs polite, sans couper une annonce en cours
- Consommation du réglage « réduire les animations » (reducedMotion existe dans Preferences.kt mais n'est lu nulle part) comme portillon commun des animations infinies

Rendu : Sans visuel ; cibles tactiles ≥ 48 dp et libellés TalkBack pour chaque contrôle.

Transposition Android : AccessibilityNotification.Announcement → View.announceForAccessibility + semantics.liveRegion ; Reduce Motion → Settings.Global.ANIMATOR_DURATION_SCALE + préférence in-app

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveAccessibility.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubbleAccessibilityLabel.kt`

### Les contrôles s'annoncent, se règlent et se testent de la même façon qu'avec VoiceOver

`dst-a11y-semantics-kit` · Android : **partielle** · P1 · effort M

Kit d'accessibilité partagé : cible tactile minimale (44 pt) avec géométrie des marges, élément décoratif masqué, interrupteur annoncé « Activé / Désactivé » (trait toggle), contrôles ajustables par pas (0,1 s, 1 %) avec valeurs parlées localisées (secondes, pourcentage), identifiants stables pour tests UI (login.submit, composer.send, composer.quickEmoji, composer.textSticker, composer.textField, conversation.messageList, conversation.scrollToBottom, conversation.row, toast.container, call.control.*, join.submit, community.create.submit), fermeture par Échap (clavier matériel et action d'accessibilité), séparateur « · » masqué du lecteur d'écran.

Écarts :
- Créer Modifier.meeshyTapTarget(min = 48.dp) et MeeshyTapTarget.inset/overlaps (géométrie pure testée) pour garantir la cible tout en gardant le glyphe à sa taille.
- Ajouter Modifier.decorative() (clearAndSetSemantics) et l'utiliser sur halos, anneaux, cadres, séparateurs.
- Ajouter Modifier.toggleState(isToggle, isActive) : Role.Switch ou ToggleButton plus stateDescription localisé « Activé / Désactivé » (4 langues puis 7).
- Ajouter MeeshyAdjustStep (0,1 s, 0,01) et MeeshyAccessibleValue.seconds/percent localisés, exposés en semantics progressBarRangeInfo + setProgress + actions personnalisées augmenter/diminuer pour les poignées de découpe, scrubbers et séparateur de colonnes.
- Définir MeeshyA11yID en constantes de testTag identiques aux identifiants iOS pour partager les scénarios de test UI.
- Ajouter Modifier.dismissOnEscape(action) : Key.Escape en onPreviewKeyEvent (clavier Bluetooth, ChromeOS) plus action sémantique de fermeture.
- Masquer le séparateur « · » (MetaSeparator) aux lecteurs d'écran partout où il sépare des métadonnées.
- Marquer les en-têtes (heading()) et annoncer les messages éphémères par liveRegion.

Rendu : Aucun changement visuel : le glyphe garde sa taille de conception, seule la zone sensible grandit.

Transposition Android : VoiceOver vers TalkBack (semantics) ; accessibilityAdjustableAction vers progressBarRangeInfo + CustomAccessibilityAction ; keyboardShortcut(.cancelAction) vers onPreviewKeyEvent(Escape).

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyAdjustable.swift`
- `apps/ios/Meeshy/Features/Main/Components/ToggleStateAccessibility.swift`
- `apps/ios/Meeshy/Features/Main/Components/EscapeDismiss.swift`
- `apps/ios/Meeshy/Features/Main/Components/MetaSeparator.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubbleAccessibilityLabel.kt`

### Les actions optimistes ne se bloquent jamais (délai maximal), les rafales sont fusionnées et les réarmements ne s'empilent pas

`dst-async-guards` · Android : **partielle** · P1 · effort S

TaskTimeout borne toute opération async (course contre un sleep, SLA partagés — ex. délai dur des actions socket optimistes : réaction/like) pour qu'un identifiant « en vol » ne reste pas indéfiniment dans l'ensemble et ne verrouille pas le bouton. Debouncer : apaisement différé réarmable qui ne chaîne pas les blocs. DelayedUI : exécutions retardées avec résultats performed/settled/skipped/cancelled. MainTurnCoalescer : une rafale de demandes = UNE exécution au tour de boucle suivant.

Écarts :
- Pas de SLA centralisés : définir des constantes (timeout socket optimiste, etc.) et un helper withTimeoutOrRollback appliqué aux ensembles « en vol » (like, réaction, commentaire) pour garantir rollback + nettoyage
- Utilitaires Kotlin équivalents : debounce réarmable (Flow.debounce / Job annulable), apaisement différé « settle » comparant une valeur, coalescence d'une rafale en une exécution par frame (conflate / Choreographer)
- Garde anti-capture d'état (ne pas retenir l'ancien Job dans une chaîne) — surtout un point d'attention de revue

Rendu : Aucun visuel ; un bouton ne reste jamais grisé après un échec réseau.

Transposition Android : Task/withThrowingTaskGroup → withTimeout / coroutines ; Debouncer → Flow.debounce / Job.cancel

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/TaskTimeout.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/Debouncer.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/DelayedUI.swift`
- `apps/ios/Meeshy/Features/Main/Services/MainTurnCoalescer.swift`

</details>

Android existant : `apps/android/core/common/src/main/kotlin/me/meeshy/core/common/CoroutineDispatchers.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

### La qualité vidéo d'un appel baisse avec la chaleur de l'appareil et s'avertit quand l'image est trop sombre

`dst-call-thermal-darkframe` · Android : **partielle** · P1 · effort S

ThermalStateMonitor observe l'état thermique du système et fournit un plafond de capture (nominal 30 fps/1280×720, fair 24/960×540, serious 15/640×360, critical 0 = vidéo coupée). DarkFrameDetector estime la luminance moyenne des trames capturées (échantillonnage tous les 8 pixels, plan Y des formats YUV 420) hors du fil principal, pour proposer le mode faible lumière.

Écarts :
- Politiques pures présentes mais aucune colle système : brancher PowerManager.addThermalStatusListener / getCurrentThermalStatus (API 29+) sur ThermalState.fromAndroidThermalStatus puis sur l'encodeur WebRTC (fps/résolution plafonnés, vidéo coupée en critical)
- Analyseur de luminance sur les trames de la caméra WebRTC (VideoProcessor/VideoSink, plan Y I420, pas de 8) alimentant DarkFramePolicy et LowLightBoostPolicy
- Exécution hors du fil principal (thread de capture WebRTC)
- Retour utilisateur : bandeau « image sombre / vidéo réduite pour refroidir » dans l'écran d'appel

Rendu : Indicateur discret dans l'écran d'appel quand la vidéo est réduite ou la lumière insuffisante.

Transposition Android : ProcessInfo.thermalState → PowerManager thermal status ; CVPixelBuffer → I420Buffer WebRTC

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ThermalStateMonitor.swift`
- `apps/ios/Meeshy/Features/Main/Services/DarkFrameDetector.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/VideoSenderCap.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/DarkFramePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/FrameLuminance.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/LowLightBoostPolicy.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/WebRtcCallCoordinator.kt`

### La barre haute du composer est faite de commandes de verre flottantes (✕, rail de scènes, audience, aperçu, publier, ⋯) qui n'apparaissent que si elles servent

`dst-composer-top-bars` · Android : **partielle** · P1 · effort M

ComposerTopBar (planche P4) : ✕ · rail des scènes (slot opaque monté par l'hôte, une mini-preview par scène) · ⋯, partagée par toutes les surfaces du meuble, croix en verre TEINTÉ du plateau sur la scène plein écran (pour rester sombre sur photo claire), marge de bord 16 pt (plus large sur grand écran), accessoire de fin (le « + » d'une nouvelle scène), barre qui remonte jusque sous la Dynamic Island. StoryComposerView+TopBar : chaque commande est une icône de verre individuelle qui FLOTTE sur le canvas plein écran (X à gauche, actions à droite) ; la bande de slides vit sur la même rangée entre le X et le sélecteur d'audience, visible seulement quand utile (navigation entre plusieurs slides, ou slide avec contenu) ; assemblage par prédicat pur selon qui peint le chrome de publication (.atelier : audience, œil, flèche ; .host : meuble qui les reprend — une commande reprise est ABSENTE, jamais grisée). StoryTextEditTopBar : pendant l'édition d'un texte la rangée ne porte plus que « Terminé » (referme sans supprimer) ; valeurs courantes annoncées par VoiceOver (cadre, alignement, bordure, style, effet, langue, couleur, fond).

Écarts :
- L'en-tête du composer Android est une barre classique avec un TextButton « Publier » : passer à des icônes de verre individuelles flottant sur le canvas (✕ à gauche, audience, aperçu (œil), publier (flèche) à droite)
- Bande de miniatures de slides sur la même rangée entre ✕ et audience, visible seulement si plusieurs slides ou slide avec contenu (composer vierge = canvas nu), avec le « + » d'ajout de scène
- Prédicat pur d'assemblage des commandes selon le peintre du chrome (atelier / hôte) : une commande reprise est absente
- Croix en verre teinté du plateau sur scène plein écran pour garder le contraste sur photo claire
- Édition de texte : rangée réduite à « Terminé » ; attributs (taille, graisse, contour, style, effet, langue, couleur, fond) sur la rangée de bulles flottantes avec valeur courante annoncée par TalkBack
- Marge latérale 16 dp (plus large sur tablette) et barre remontant jusque sous la découpe caméra
- Feuille d'audience (ONLY / EXCEPT) translucide avec détentes partielles laissant l'en-tête atteignable

Rendu : Icônes de verre rondes 40 dp espacées sur le canvas, bande de slides en pilule centrale, aucune barre pleine largeur ni fond opaque.

Transposition Android : HStack de boutons verre → Row de IconButton glass sur Box plein écran avec windowInsetsPadding

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Composer/ComposerTopBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+TopBar.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditTopBar.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ComposerBandState.kt`

### Les crashs, blocages et dépassements sont capturés, listés dans l'app et envoyés au backend de rapports

`dst-crash-diagnostics` · Android : **partielle** · P1 · effort M

CrashDiagnosticsManager capture les incidents sur deux couches : sur l'appareil (MetricKit : crash, hang, watchdog 0x8BADF00D, 0xDEAD10CC, exceptions CPU et écritures disque, livrés au lancement suivant ; handler d'exception non interceptée) persistés dans Documents/crash_diagnostics et signalés par un toast à usage unique ; à distance, un CrashReporting pluggable (Crashlytics en production, NoOp sinon) reçoit chaque diagnostic en non-fatal avec codes d'erreur stables par type (1001 NSException … 1005 disque), identifiant utilisateur associé et effacé au logout, et fil d'Ariane (breadcrumbs).

Écarts :
- Seule l'exception JVM non interceptée est capturée : lire ApplicationExitInfo (API 30+, getHistoricalProcessExitReasons) au lancement suivant pour CRASH natif, ANR, CPU/mémoire (équivalent MetricKit), avec trace d'ANR/tombstone jointe
- Interface CrashReporting pluggable (record, setUserId, log) avec NoOp par défaut et implémentation Firebase Crashlytics optionnelle (google-services.json absent ⇒ NoOp) ; codes d'erreur stables par CrashKind
- Associer l'utilisateur au rapport à la connexion et l'effacer à la déconnexion ; fil d'Ariane (log) joint au prochain rapport
- Toast à usage unique au lancement suivant (« un rapport est disponible ») avec action ouvrant l'écran des diagnostics
- Rétention bornée des rapports et partage texte (format déjà prévu)
- Chaînage vers le handler précédent (Crashlytics) sans double comptage

Rendu : Écran de diagnostics existant : badges de sévérité (erreur rouge, avertissement ambre, info bleu), partage du rapport en texte.

Transposition Android : MetricKit + NSSetUncaughtExceptionHandler → ApplicationExitInfo + Thread.setDefaultUncaughtExceptionHandler ; Crashlytics iOS → Firebase Crashlytics Android

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/CrashDiagnosticsManager.swift`
- `apps/ios/Meeshy/Features/Main/Services/CrashlyticsReporter.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashDiagnosticsRecorder.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/FileCrashDiagnosticsStore.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashReportScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/diagnostics/CrashDiagnostic.kt`

### Chaque conversation, post et profil reçoit sa couleur déterministe, identique à iOS

`dst-dynamic-color-generator` · Android : **partielle** · P1 · effort S

DynamicColorGenerator calcule la palette d'accent d'une conversation (langue 30 %, type 30 %, thème 40 %, secondaire +30° de teinte, accent -30°), la couleur d'un post, la couleur d'un nom (hachage stable sur 20 couleurs vives), la couleur de profil (graine = identifiant, nom à défaut), la couleur adaptée au thème pour du texte. UserColorCache mémorise les mélanges d'accent de conversation (30 %) avec l'indigo de marque (70 %) et les couleurs d'utilisateurs, vidé à la déconnexion.

Écarts :
- Ajouter profileAccentHex(userId, name) : graine = userId si non vide, sinon le nom (avatar sans photo, bannière de design, sélecteur de décor).
- Ajouter ConversationColorPalette.derived(fromPrimary, saturationBoost) et bareHex (retire le dièse, majuscules) : secondaire +30°, accent -30°, requis par l'accent personnel de conversation.
- Créer UserColorCache (blendedColor(accent) = 30 % accent + 70 % 6366F1, colorForUser(name), invalidateAll à la déconnexion, stats de cache) pour éviter de recalculer dans les cellules de liste.
- Brancher invalidateAll sur la déconnexion (logout) du SessionRepository.

Transposition Android : actor Swift vers objet thread-safe (Mutex / ConcurrentHashMap).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`

### Un message composé seulement de 1 à 4 émojis s'affiche en gros, sans bulle

`dst-emoji-only` · Android : **partielle** · P1 · effort S

EmojiDetector.analyze classe un texte : un seul emoji, deux, trois, quatre ou « pas seulement des emojis » (clusters de graphèmes, séquences ZWJ, tons de peau, drapeaux). La taille d'un emoji dans un texte est multipliée par 4 jusqu'à deux emojis, 3 à trois, 2 à quatre.

Écarts :
- Le détecteur Android plafonne à 3 clusters (MAX_CLUSTERS = 3) : porter le cas à 4 emojis (quadruple) avec les multiplicateurs ×4 (1–2), ×3 (3), ×2 (4)
- Retourner une taille/multiplicateur par résultat (single, double, triple, quadruple, notEmojiOnly) plutôt qu'un simple compte
- Tests alignés sur la table iOS (ZWJ, tons de peau, drapeaux régionaux, variation selectors)

Rendu : Emoji à ×4 de la taille du texte (×3 pour trois, ×2 pour quatre), sans fond de bulle.

Transposition Android : Character.isEmoji / grapheme → BreakIterator + machine à états de code points (déjà portée)

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/EmojiDetector.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EmojiDetector.kt`

### Chaque liste vide, en erreur ou hors-ligne affiche le même état dessiné (icône, titre, sous-titre, action)

`dst-empty-states` · Android : **partielle** · P1 · effort S

EmptyStateView (37 usages iOS) : icône SF Symbol, titre, sous-titre, libellé d'action optionnel, couleur d'accent, variante compacte. AdaptiveContentUnavailableView reproduit le ContentUnavailableView système sur les anciennes versions pour le même rendu.

Écarts :
- L'état vide est propre à la liste de conversations (EmptyStateVisual) ; créer un MeeshyEmptyState(icon, title, subtitle, actionLabel, accentColor, compact) dans sdk-ui et l'utiliser dans toutes les listes (contacts, notifications, feed, signets, appels, recherche, favoris)
- Variantes : vide à froid, filtre sans résultat, erreur serveur avec Réessayer, hors-ligne
- Couleur d'accent de la conversation/section pour l'icône et l'action
- Accessibilité : regroupement sémantique titre+sous-titre, action atteignable

Rendu : Icône 48–64 dp teintée accent au-dessus du titre (headline) et du sous-titre (subhead, couleur secondaire) centrés, bouton pilule d'accent optionnel ; compact = icône et textes réduits sans bouton.

Transposition Android : ContentUnavailableView → composable MeeshyEmptyState

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/EmptyStateVisual.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### Chaque action locale affiche un toast de retour en haut, annoncé et cliquable

`dst-feedback-toast-overlay` · Android : **partielle** · P1 · effort S

FeedbackToastManager (singleton) présente un toast à la fois (succès, erreur, info) avec haptique (léger, erreur, succès), annonce d'accessibilité (priorité haute pour une erreur), fermeture automatique à 3 s (6 s si cliquable, au moins 6 s sous VoiceOver), action au toucher puis fermeture, écoute des toasts du SDK (notification meeshy.showToast), purge à la déconnexion. FeedbackToastOverlay l'affiche en haut (marge 24, z 999) avec la transition feedbackToastReveal et le ressort bondissant, identifiant toast.container.

Écarts :
- MeeshyFeedbackToast est un atome sans hôte : 0 site d'appel ; 8 fichiers utilisent Snackbar à la place. Créer FeedbackToastManager (StateFlow du toast courant + action) avec show / showSuccess / showError et variantes avec tapAction.
- Créer l'hôte FeedbackToastHost à la racine de MeeshyApp : AnimatedVisibility glissement + fondu, ressort bondissant, padding haut 24, au-dessus de tout (zIndex), testTag toast.container.
- Durées : 3 s, 6 s si cliquable, au moins 6 s si TalkBack actif ; annonce par liveRegion (assertive pour l'erreur, polite sinon) ; haptique (CONFIRM / REJECT / CLOCK_TICK).
- Tap : exécuter l'action puis fermer ; swipe vers le haut pour fermer ; un nouveau toast remplace le courant sans empilement.
- Fournir un bus pour les toasts émis depuis le SDK (équivalent de la notification meeshy.showToast) et vider à la déconnexion.
- Migrer les Snackbar des écrans vers le gestionnaire pour l'iso visuel (pastille verre, icône de sévérité).

Rendu : Pastille de verre en capsule, icône de sévérité 20, message sur 1 à 2 lignes, apparition par le haut avec ressort bondissant.

Transposition Android : UIAccessibility.post(announcement) vers semantics liveRegion ; HapticFeedback vers LocalHapticFeedback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/FeedbackToastOverlay.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyToast.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationToastViewModel.kt`

### Tous les plein écrans partagent la même barre haute : ✕ à gauche, identité de l'auteur, actions à droite

`dst-fullscreen-top-bar` · Android : **partielle** · P1 · effort S

FullscreenTopBar a la même géographie partout (#8878) : [✕] [identité] ··· [actions de fin] — la porte de sortie au bord de début de lecture (croix pour un plein écran posé sur l'écran, retour ‹ pour une navigation qu'on quitte aussi par le bord, comme le lecteur de réels), l'identité de l'auteur juste après quand la surface la place en haut (story), le menu « ⋯ » au bord de fin ; la barre respecte la zone sûre alors que voile et média l'ignorent. FullscreenIdentityRow montre qui a publié et quand (avatar fourni par l'hôte, nom, date, accessoire sous le nom : crédit d'un son, attribution de republication). La marge latérale place le DISQUE visible sur la gouttière du chrome, sa cible déborde vers le bord.

Écarts :
- Chaque lecteur (stories, réels, visionneuse d'image) dessine sa propre barre : extraire MeeshyFullscreenTopBar(leading, identity, trailing) et FullscreenIdentityRow(avatar, name, date, accessory)
- Géographie imposée : porte de sortie au bord de début (✕ ou ‹ selon la surface), identité juste après, menu ⋯ au bord de fin
- Barre dans la zone sûre, voile (scrim) et média plein écran ; disque visible aligné sur la gouttière du chrome, cible tactile 48 dp qui déborde vers le bord
- Accessoire sous le nom (crédit d'un son, attribution de republication — StoryRepostAttribution existe)

Rendu : Disques de verre 36–40 dp pour ✕/⋯, identité (avatar 44 + nom + date relative) à côté, voile dégradé noir→transparent derrière.

Transposition Android : HStack + safeAreaInset → Row dans Scaffold edge-to-edge avec WindowInsets.safeDrawing

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenTopBar.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### Chaque geste a son retour haptique (léger, moyen, lourd, rigide, succès, avertissement, erreur)

`dst-haptics` · Android : **partielle** · P1 · effort S

HapticFeedback est un enrobage court des générateurs UIFeedback (light, medium, heavy, rigid, success, warning, error), singletons préparés (prepare() avant chaque événement pour éviter le premier tap muet) afin que les chemins de swipe/drag à des dizaines d'événements par seconde n'allouent pas. HapticSurfacing en expose success/error comme protocole injectable pour les ViewModels.

Écarts :
- Seul HapticFeedbackType.LongPress est utilisé (13 sites) : créer un MeeshyHaptics (light/medium/heavy/rigid/success/warning/error/selection) mappé sur HapticFeedbackConstants (CONFIRM, REJECT, CLOCK_TICK, GESTURE_THRESHOLD_ACTIVATE, KEYBOARD_TAP… avec garde de niveau d'API) ou VibrationEffect
- Interface HapticSurfacing injectable (success/error) pour les ViewModels et tests
- Respect de la préférence utilisateur de retour haptique et du réglage système
- Utilisation systématique : seuil de pull-to-refresh, swipe de ligne, scrub de réactions, fin d'enregistrement, succès/échec d'envoi

Rendu : Pas de visuel ; retours courts, jamais continus.

Transposition Android : UIFeedbackGenerator → View.performHapticFeedback / HapticFeedbackConstants / VibrationEffect

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/HapticFeedback.swift`
- `apps/ios/Meeshy/Features/Main/Services/HapticSurfacing.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtons.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### L'interface suit ma langue (Prisme linguistique appliqué au chrome) en 7 langues, avec un choix « automatique »

`dst-i18n-ui-language` · Android : **partielle** · P1 · effort M

UILanguageOverride force le chrome de l'app (menus, boutons, libellés système) dans la langue principale du compte (systemLanguage) plutôt que dans la locale de l'appareil, sauf choix explicite dans les Réglages ; la valeur sentinelle « auto » suit la langue principale. Jamais une langue absente des catalogues traduits (fr, en, es, de, pt-BR, it, ar) : normalisation (pt/pt_PT → pt-BR, réduction à la base 2 lettres), no-op total sinon. Appliqué au tout début du lancement (AppleLanguages), mis en cache à chaque changement de langue principale, et publié aux extensions de notification (langue de bannière, actions de notification ré-enregistrées).

Écarts :
- Ressources de chaînes présentes seulement en en/fr/es/pt (values, values-fr, values-es, values-pt dans chaque module) : ajouter de (allemand), it (italien), ar (arabe, RTL) et pt-BR (aujourd'hui values-pt) pour les 13 modules et le catalogue app, SDK et notifications — travail de ressources, pas de code
- AppLanguage.supportedCodes (fr/en/es/ar) diverge de la liste iOS (fr, en, es, de, pt-BR, it, ar) : aligner l'ensemble, la normalisation pt → pt-BR et la liste des choix des Réglages sur les catalogues réellement traduits
- Prisme sur le chrome : sans choix explicite, retomber sur la langue principale du compte (systemLanguage) et non sur la locale de l'appareil ; « automatique » = suivre la langue principale
- Choix « auto » explicite distinct de « langue de l'appareil » dans les Réglages
- Langue des notifications : MeeshyFcmService/NotificationChannelInstaller doivent composer bannières et actions dans la langue résolue, et se ré-enregistrer à chaque changement
- Application tôt au lancement (attachBaseContext/AppCompatDelegate.setApplicationLocales) pour éviter un flash de la mauvaise langue
- Support RTL complet (arabe) : miroirs de layout, icônes directionnelles

Rendu : Liste de langues avec drapeau et nom natif, option « Automatique (langue principale) » en tête, application sans redémarrage visible.

Transposition Android : AppleLanguages + UserDefaults → AppCompatDelegate.setApplicationLocales / LocaleManager (API 33) + locale_config.xml

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Core/UILanguageOverride.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/language/InterfaceLanguageStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppLanguage.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/theme/LanguageViewModel.kt`

### Choisir une photo d'avatar/bannière/entité, la recadrer dans l'éditeur, puis l'envoyer compressée sans geler l'écran

`dst-image-pick-edit-compress` · Android : **partielle** · P1 · effort M

EntityImagePickerFlow enchaîne : sélecteur de photos → chargement des données → éditeur d'image plein écran (MeeshyImageEditorView, contexte et accent) → compression hors thread principal jusqu'à une taille cible en Ko (maxSizeKB, max 1280 px) → callback. PickedMedia copie le fichier reçu du sélecteur dans le tmp de l'app sous un nom unique en gardant l'extension du conteneur (un .mov reste un .mov), hors fil principal, sans laisser de fichier derrière un échec ; renommage sans seconde copie. ImageCompressor ré-encode itérativement en JPEG (jusqu'à ~8 passes) et propose un encodage unique, hors thread principal.

Écarts :
- Aucun éditeur d'image (recadrage, rotation, filtres) entre le sélecteur et l'envoi : PickVisualMedia part directement à l'upload ; ajouter un écran d'édition plein écran avec Accepter/Annuler (annuler remet le choix à zéro)
- Compression itérative hors thread principal jusqu'à maxSizeKB (qualité JPEG décroissante, dimension max 1280) : ImageCompressionPlan existe côté modèle mais l'exécuteur Bitmap/JPEG app-side est à vérifier/compléter, toujours sur Dispatchers.IO/Default
- Copie du média choisi dans le cache de l'app avec extension conservée et nom unique, nettoyage au lancement des fichiers temporaires orphelins, aucune copie laissée derrière un échec
- Un seul flux réutilisable (modifier/launcher) pour avatar, bannière, image de conversation, de communauté

Rendu : Éditeur plein écran avec masque de cadrage circulaire (avatar) ou large (bannière), actions Annuler/Accepter ; indicateur de progression pendant la compression et l'envoi.

Transposition Android : PhotosPicker + fullScreenCover → rememberLauncherForActivityResult(PickVisualMedia) + écran d'édition Compose ; UIImage.jpegData → Bitmap.compress

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/EntityImagePickerFlow.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/ImageCompressor.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/PickedMedia.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/AvatarBannerUploadViewModel.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ImageCompression.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ImageUpload.kt`

### Choisir la langue d'une traduction dans une feuille qui place en tête les langues déjà traduites et mémorise mes préférées

`dst-language-picker` · Android : **partielle** · P1 · effort M

LanguagePickerSheet : feuille plein écran de langues de traduction (id BCP-47, regroupement par famille sous un même drapeau pour de futures variantes, style dark/light, fenêtre porteuse en multi-fenêtre) qui remonte en tête et marque d'une pastille les langues DÉJÀ traduites (choix instantané, une langue absente déclenche une demande de traduction), montre la langue actuellement lue. LanguageUsageTracker trie les langues par fréquence d'usage. LanguageDisplay donne drapeau, nom natif et couleur de chaque langue (couleur par défaut gris) et l'ensemble de 18 langues de l'explorateur de traductions de message/transcription (source unique remplaçant trois tables copiées).

Écarts :
- LanguagePickerDialog est un AlertDialog générique de lignes radio : créer la feuille de traduction (plein écran) avec les langues déjà traduites en tête et pastille, langue actuellement lue marquée, regroupement par famille/drapeau
- LanguageUsageTracker : compter les langues choisies (DataStore) et trier la barre rapide par fréquence, les jamais utilisées gardent l'ordre d'origine
- Ensemble curé de 18 langues pour l'explorateur de traductions (messages et transcriptions) comme vue ordonnée de LanguageData, supprimer les tables dupliquées
- Différencier choix instantané (traduction disponible) et demande de traduction à la demande (état « en cours »)

Rendu : Liste de drapeaux + noms natifs, pastille de couleur de la langue pour les traductions disponibles, recherche en tête, langue active en accent.

Transposition Android : Sheet SwiftUI → ModalBottomSheet plein hauteur ; UserDefaults compteurs → DataStore

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/LanguagePickerSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/LanguageDisplay.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguagePickerDialog.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`

### Les pagers horizontaux et verticaux (réels, galeries) élisent la page vraiment visible et suivent la page courante

`dst-layout-pagers` · Android : **partielle** · P1 · effort S

AdaptiveHorizontalPager/AdaptiveVerticalPager : conteneurs paginés avec liaison bidirectionnelle sur l'id de la page courante, rendu paresseux (seuls la page visible et ses voisines existent, important quand chaque page porte une surface vidéo), mode « selection » où l'insertion de pages avant la courante ne décale pas la page affichée. VerticalPagerMajority élit une page quand plus de la moitié (strictement) de sa hauteur est dans la zone visible, pour démarrer le média au bon instant dans les deux sens ; onMajorityPage est appelé PENDANT le défilement.

Écarts :
- Pas de composable Meeshy partagé : Reels, carrousel du feed et visionneuse utilisent chacun VerticalPager/HorizontalPager directement
- Règle de majorité (> 50 % de la page dans le viewport, strictement) pour déclencher lecture/préchargement pendant le défilement dans les deux sens
- Liaison sur l'id (et non l'index) de la page courante, stable quand des pages sont insérées avant
- Limiter la composition aux pages voisines (beyondBoundsPageCount) quand chaque page porte une vidéo ; drapeau isActive dérivé de la page courante

Rendu : Snap page par page type TikTok, aucune page voisine visible sans geste, lecture démarrée dès que la page est majoritaire.

Transposition Android : ScrollView + scrollTargetBehavior(.paging) → HorizontalPager/VerticalPager (Foundation) + snapshotFlow

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePagingScroll.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveVerticalPager.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/VerticalPagerMajority.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaCarousel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### La légende posée sur un reel ou une story se lit à l'ombre, se déplie à 30 mots et garde ses liens cliquables

`dst-media-caption` · Android : **partielle** · P1 · effort M

MediaCaptionOverlay est la légende POSÉE SUR un canvas (story en lecture, réel plein écran) : texte à l'OMBRE plutôt que dans une boîte opaque, voile dégradé en bas de la scène, seuil en MOTS (au-delà de 30 mots on montre les 15 premiers et un « plus » tappable) et non en lignes, dépliée elle prend l'écran ancrée au coin bas-gauche avec défilement et fond de fermeture, le tap hors texte referme sans naviguer ; l'hôte décide de suspendre la lecture. MediaCaptionRichText rend adresses, mentions et hashtags cliquables (blanc sur la scène) via MessageTextRenderer et la carte trackedLinks ; un seul rendu pour légendes de story, galerie, scène et réel.

Écarts :
- Réels et stories affichent la légende en texte simple (reel.caption) : créer MediaCaptionOverlay(text, isExpanded, onToggle, onDismiss) commun, avec ombre portée et voile dégradé bas (pas de boîte)
- Seuil en mots : > 30 mots ⇒ 15 premiers + « plus » ; plus de troncature par lignes
- État déplié : plein écran ancré en bas-gauche, défilable, fond de fermeture, tap hors texte referme sans naviguer ; suspension de la lecture décidée par l'hôte
- Légende riche : adresses, mentions, hashtags cliquables, trackedLinks m+<jeton>, blanc sur scène
- Accessibilité : libellé et indice « déplier la légende »

Rendu : Texte blanc à ombre portée, voile noir→transparent sur le tiers bas, « …plus » discret, version dépliée quasi plein écran avec scroll vertical.

Transposition Android : Text + shadow → Text avec Modifier.shadow / TextStyle(shadow=…) ; expansion → AnimatedVisibility

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MediaCaptionRichText.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### L'emoji d'humeur au coin d'un avatar respire discrètement, sauf si je réduis les animations

`dst-mood-badge` · Android : **partielle** · P1 · effort S

MeeshyMoodBadge est l'unique écriture de la pastille d'humeur : emoji, diamètre, animation « spring repeatForever » avec délai de départ aléatoire et garde anti-double animation. L'intention de l'appelant peut seulement être RETIRÉE (jamais ajoutée) par le réglage système Reduce Motion ou l'override in-app ; le contexte d'avatar et la peau Lentille décident de leur côté si elle pulse (jamais en liste/en-tête). Accessibilité : l'humeur est lue par VoiceOver.

Écarts :
- L'humeur n'est qu'un Text statique dans MeeshyAvatar ; extraire MeeshyMoodBadge(emoji, diameter, animates) avec ressort infini et délai de départ aléatoire
- Portillon Reduce Motion (système ANIMATOR_DURATION_SCALE et préférence in-app reducedMotion) intégré à l'atome
- Contextes qui animent vs contextes de liste qui n'animent pas (décidé par l'avatar)
- Tap sur la pastille avec point d'ancrage (spotlight humeur) et libellé d'accessibilité

Rendu : Emoji ≈ 40 % du diamètre de l'avatar, léger battement d'échelle, pas de fond, ancré en bas à droite.

Transposition Android : spring repeatForever → infiniteRepeatable(spring) / animateFloat

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MoodBadge.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MoodStatusExpiry.kt`

### Les éléments réagissent au toucher et apparaissent avec les mêmes ressorts qu'iOS

`dst-motion-modifiers` · Android : **partielle** · P1 · effort M

Boîte à outils de micro-animations : pressable (échelle 0,93, luminosité -5 %, ressort 0,2/0,6), bounceOnTap (0,92), bounceOnFocus (1,02), bounceOnAppear (0,5 vers 1), staggeredAppear (délai index x 0,05 s, glissement 20 pt, échelle 0,95, ressort 0,45/0,8), floating (amplitude 15, 4 s aller-retour), pulse (intensité 0,04), shimmer (délègue au reflet de chargement), transitions de zoom source/destination. Tous respectent Reduce Motion.

Écarts :
- Créer Modifier.pressable(), bounceOnTap(scale=0.92), bounceOnFocus(), bounceOnAppear(delay), staggeredAppear(index, baseDelay=0.05), floating(range, duration) et pulse(intensity) en Compose (graphicsLayer + Animatable) avec les ressorts d'iOS.
- Faire respecter la réduction de mouvement (voir dst-reduce-motion-preference) : état final immédiat sans décalage ni échelle.
- Remplacer l'échelonnement 45 ms de MeeshyMotion par la valeur iOS (50 ms par index, 40 ms dans DesignTokens) et centraliser.
- Transitions zoom (zoomTransitionSource/Destination) : implémenter avec SharedTransitionLayout / sharedBounds pour l'ouverture de story depuis le plateau de stories.
- Documenter qu'aucun modificateur ne doit lire un singleton observé (paramètres primitifs uniquement).

Rendu : Ressorts toujours (jamais d'easing linéaire) ; rebond léger sur l'apparition, retour de pression rapide (200 ms).

Transposition Android : withAnimation/.animation vers animate*AsState/Animatable ; matchedGeometry / zoom transition vers SharedTransitionLayout (Compose 1.7).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyMotion.kt`

### Toucher une notification ou un lien de contenu ouvre le bon lecteur (réel, story, humeur, post) avec la vraie cause d'un échec

`dst-nav-content-doors` · Android : **partielle** · P1 · effort M

NotificationContentRouter décide quelle surface ouvre une notification sociale (réel, story/humeur/status, détail de post) à partir de l'entité portée par metadata.postType / contentType, en repli sur le type de notification puis un indice de cache — le TYPE seul n'est pas un discriminant (un commentaire de réel ne doit pas ouvrir une story). ReelDoor est la porte unique d'un réel nommé (cache d'abord, une seule requête, post non-réel → détail, échec → lecteur ouvert sur la cause réelle) ; StoryDoor trouve le groupe d'une story, la charge si le tray l'ignore et garde le postId jusqu'au lecteur (repli détail du post si story morte) ; DetailOpenSource marque l'entrée d'un contenu (direct, notification, lien partagé) pendant 60 s pour attribuer l'impression d'ouverture.

Écarts :
- Story adressée par id d'auteur seulement (Routes.story(userId)) : ajouter l'ouverture d'une story par id de contenu (storyNotificationTarget) avec ensureStoryLoaded cache-first et repli sur le détail du post
- Surface éphémère (story/humeur/status) vs réel vs post : résolution par metadata.postType/contentType puis type puis cache n'est que partielle (résolution limitée à friend_new_story pour la story)
- Ouverture d'un réel : cache d'abord (le payload push précharge le post), une seule requête, post non-réel → détail, échec → lecteur ouvert avec la cause (hors-ligne vs serveur), jamais une double requête
- Marque d'entrée (DetailOpenSources : direct / notification / shared_link, durée de vie 60 s, lecture unique, purge à chaque marque) absente : les impressions de détail n'ont pas de source
- Tap sur une notification de commentaire : ouvrir le contenu au commentaire/parent ciblé (commentId, parentCommentId)

Rendu : Le lecteur de réels/stories s'ouvre immédiatement sur le contenu en cache ; une erreur est affichée dans le lecteur lui-même avec « Réessayer ».

Transposition Android : Notification tap PendingIntent → LaunchRouter ; cache-first par SwrCacheSource existant

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/NotificationContentRouter.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/ReelDoor.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/ReelNotificationOpener.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/StoryDoor.swift`
- `apps/ios/Meeshy/Features/Main/Navigation/DetailOpenSource.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Partout, un avatar montre l'humeur et l'anneau de story de la personne, et un tap ouvre le lecteur ou le spotlight

`dst-nav-social-chrome-resolvers` · Android : **partielle** · P1 · effort S

SocialChromeEnvironment injecte par l'environnement SwiftUI des résolveurs : emoji d'humeur d'un utilisateur, état de l'anneau de story, handler de tap sur la pastille d'humeur, ouverture du lecteur de stories, éditeur de publication (file durable des stories) et demande d'ouverture de l'atelier sur une graine. Absent de la hiérarchie (feuilles, previews, tests) la valeur est nil : l'entrée n'est pas peinte, jamais de crash ; l'état de présentation vit au-dessus de ce qui le reconstruit.

Écarts :
- Chaque écran passe lui-même storyRing/moodEmoji au MeeshyAvatar : introduire des CompositionLocal (MoodResolver, StoryRingResolver, onMoodTap, onOpenStory, StoryPublisher) fournis à la racine et dégradant en null
- Tap sur la pastille d'humeur → spotlight humeur (route absente) ; tap avatar à anneau → lecteur de stories
- Demande d'ouverture de l'atelier sur une graine depuis le média d'un post (« Composer ») sans état de présentation perdu à la recomposition

Rendu : Anneau de story et pastille d'humeur identiques dans listes, commentaires, en-têtes et résultats de recherche.

Transposition Android : EnvironmentValues → CompositionLocal

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/SocialChromeEnvironment.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`

### Les écrans à froid affichent des squelettes qui scintillent seulement quand un chargement est réellement en cours

`dst-skeleton-sheen` · Android : **partielle** · P1 · effort S

SkeletonView fournit SkeletonShape, SkeletonConversationRow, SkeletonMessageBubble et skeletonShimmer ; LoadingSheen est l'unique reflet animé du SDK : un balayage de bande (largeurs en points ou fraction) qui n'anime QUE si un chargement est en cours (phase loading) — jamais quand le chargement a échoué (failed) ni quand la politique de téléchargement le retient (deferred), et jamais sous Reduce Motion. L'hôte d'un placeholder (images) déclare la phase dans l'environnement.

Écarts :
- MeeshySkeletonBox est un bloc statique sans balayage : ajouter un shimmer (gradient horizontal animé) piloté par une phase loading/failed/deferred
- Squelettes dédiés : rangée de conversation, bulle de message, formes génériques (SkeletonShape) réutilisés par toutes les listes à froid
- Pas d'animation si Reduce Motion (préférence reducedMotion non consommée aujourd'hui) ni si le contenu est « différé » ou « échoué »
- CompositionLocal LoadingSheenPhase posé par l'hôte de placeholder d'image

Rendu : Reflet diagonal discret au teint de la surface tertiaire (clair/sombre), même rayon que le contenu final ; pas de spinner quand un cache non vide existe.

Transposition Android : LoadingSheen → Modifier.shimmer avec rememberInfiniteTransition, CompositionLocal de phase

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SkeletonView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/LoadingSheen.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### La feuille d'autocollants propose emojis, bibliothèque, modèles, Mee, instants et packs installés

`dst-sticker-sheet` · Android : **partielle** · P1 · effort M

MeeshyStickerSheet héberge le sélecteur partagé en feuille moyenne/grande avec poignée : emoji, autocollant de bibliothèque, modèle à champs, modèle de lieu, Mee, instant, élément d'un pack installé ; étagère des packs installés (recharge à l'ouverture), écran boutique de packs (installer / désinstaller, état en attente, échec), lien « Plus dans la boutique » (cible 44) menant à la vitrine par lien profond ; option de découpe (diesCut) et accent de conversation.

Écarts :
- Créer l'enum StickerSheetChoice (Emoji, Library, Template(slots), LocationTemplate, Mee, Instant(slots), PackItem) et StickerSheetDestination (diesCut, leadsToVitrine, onChoice) comme contrat unique pour composeur de message, de story et commentaires.
- Ajouter StickerPackStore (installed, catalogue, pending, failed) : GET packs installés (/packs/sticker/installed), catalogue, toggle d'installation optimiste avec retour arrière.
- Ajouter l'étagère des packs installés dans la feuille et l'écran StickerPackShop (liste, état en attente, échec) plus le lien « Plus dans la boutique » vers le lien profond packShop(domain: sticker).
- Feuille ModalBottomSheet à deux ancrages (moyen/grand) avec poignée visible ; accent de conversation ; chargement de l'étagère à l'ouverture.
- Brancher emoji, bibliothèque de stories, modèles de lieu (lieux proches) et Mee/instants quand ces domaines seront portés.

Rendu : Feuille à deux hauteurs avec poignée ; bouton « Plus dans la boutique » indigo500 footnote semi-gras, 44 de haut, centré.

Transposition Android : presentationDetents([.medium, .large]) vers ModalBottomSheet partiallyExpanded / expanded.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MeeshyStickerSheet.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Le choix Auto / Clair / Sombre s'applique partout, se mémorise et se synchronise avec mon compte

`dst-theme-mode-preference` · Android : **partielle** · P1 · effort S

ThemeManager porte la préférence (système, clair, sombre) avec icône, libellé et teinte par option, la persiste, la résout contre le schéma système à chaque retour au premier plan, force le colorScheme de la fenêtre, et relit la préférence serveur (application.theme) après chaque synchronisation de préférences (login, retour au premier plan) sans écraser un choix local jamais synchronisé.

Écarts :
- Relire application.theme du serveur dans ThemeStore après chaque PreferencesSyncCoordinator.fetch (login, foreground) avec la garde « seulement si une synchro vient d'aboutir » pour ne pas écraser un choix local jamais envoyé ; mapping auto vers AUTO, light vers LIGHT, dark vers DARK.
- Pousser le choix local vers application.theme (PATCH préférences) à chaque changement depuis Réglages (iOS : syncThemeToPrefs).
- Appliquer le choix explicite à la fenêtre via AppCompatDelegate.setDefaultNightMode pour que les dialogues, menus système et barres système suivent le thème forcé (équivalent de preferredColorScheme).
- Exposer par option l'icône (cercle moitié, soleil, lune), le libellé localisé (Auto, Clair, Sombre) et la teinte (818CF8, 6366F1, A5B4FC) pour le sélecteur de Réglages.
- Tester le mapping distant et l'idempotence (même valeur : aucune émission) comme mapRemoteTheme.

Rendu : Le changement se voit sans clignotement au démarrage à froid : la valeur persistée peint la première frame.

Transposition Android : UITraitCollection.userInterfaceStyle vers isSystemInDarkTheme() ; UserDefaults vers DataStore (déjà fait).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemeManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ThemeStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppTheme.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/theme/ThemeViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Le texte garde la hiérarchie iOS et grandit avec la taille de police du système

`dst-typography-dynamic-type` · Android : **partielle** · P1 · effort S

MeeshyFont.relative(size, weight, design) range chaque taille héritée sur le style de texte relatif le plus proche (caption2 à largeTitle) pour suivre Dynamic Type en conservant poids et design ; MeeshyFont.emoji(size) fixe un emoji seul à sa taille exacte (90, 60, 45) sans suivre le plafond largeTitle. Les titres utilisent le design arrondi, le corps la police système.

Écarts :
- Fournir une fonction meeshyText(sizeSp, weight, rounded) qui reproduit le mapping taille vers rôle Material pour porter les écrans iOS sans réécrire chaque taille (tailles 9 à 34 de MeeshyFontSize).
- Définir un plafond d'agrandissement (fontScale maximal cohérent avec Dynamic Type accessibilité) et vérifier en capture à 1,3x et 2,0x que les en-têtes, chips et cellules ne se coupent pas.
- Ajouter emojiTextStyle(size) non mis à l'échelle (dp converti en sp via LocalDensity) pour les messages d'emojis seuls (90/60/45).
- Décision visuelle : Nunito est appliqué à tout le texte alors qu'iOS réserve le design arrondi aux titres et chiffres ; limiter Nunito aux rôles titre pour l'iso ou documenter l'écart assumé.
- Ajouter les tailles manquantes dans MeeshyTypography : 9 (micro), 10 (caption), 12 (small), 14 (label), 16 (callout), 18 (subtitle), 20 (title3), 28 (display).

Rendu : Hiérarchie iOS : titre d'écran 46 gras arrondi, largeTitle 34, titre 22, headline 17, body 15, subhead 13, footnote 11, caption 10.

Transposition Android : Font.TextStyle vers Typography / TextStyle ; Dynamic Type vers fontScale (sp).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyType.kt`

### La pastille rouge chiffrée d'une conversation n'apparaît que s'il y a des non lus

`dst-unread-badge` · Android : **partielle** · P1 · effort S

UnreadCountBadge est un atome (count, isDark) : le portillon count > 0 vit DANS l'atome (à zéro ou négatif, rien n'est rendu et aucune place n'est occupée), disque/pilule rouge chiffrée, plafonnée (99+), utilisée par les deux peaux de la rangée de conversation.

Écarts :
- Badge Material standard inline dans ConversationRow : extraire MeeshyUnreadBadge(count, isDark) dans sdk-ui avec portillon interne (jamais de pastille vide), teinte rouge Meeshy et contraste clair/sombre
- Plafond d'affichage identique à iOS (99+) et taille/typographie de l'atome (Nunito, chiffres tabulaires)
- Libellé d'accessibilité « N non lus » et réutilisation par onglets/boutons flottants/widgets

Rendu : Pilule rouge (error) au texte blanc gras 11–12 sp, minimum disque, alignée en bas à droite de l'avatar ou à la fin de la rangée.

Transposition Android : Capsule SwiftUI → Surface pilule Compose

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UnreadCountBadge.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/chrome/UnreadBadge.kt`

### Un nom d'affichage unique et cohérent pour tout utilisateur (displayName, sinon prénom nom, sinon pseudo, sinon repli)

`dst-user-display-name` · Android : **partielle** · P1 · effort S

getUserDisplayName résout le nom d'affichage d'un utilisateur, d'un expéditeur de message, d'un participant de conversation ou d'un auteur de post avec la même chaîne : displayName, sinon prénom + nom, sinon @pseudo, sinon un repli « Utilisateur inconnu ».

Écarts :
- Pas de fonction unique : plusieurs résolveurs locaux (NewConversationLogic.displayName, MentionRoster) ; créer getUserDisplayName(user | sender | participant | author, fallback) dans :core:model
- Chaîne identique : displayName → « prénom nom » → pseudo → repli localisé (« Utilisateur inconnu »)
- Remplacer les concaténations ad hoc dans listes, bulles, commentaires, notifications

Rendu : Aucun visuel ; repli traduit dans la langue de l'interface.

Transposition Android : Fonctions libres Swift → fonctions d'extension Kotlin pures

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/UserDisplayName.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationLogic.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MentionRoster.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`

### Le logo Meeshy se dessine, se transforme en révélation liquide et les icônes réagissent (rebond, pulsation, bascule animée)

`dst-brand-motion` · Android : **partielle** · P2 · effort M

AnimatedLogoView trace les trois traits du logo (MeeshyDashesShape, bouts ronds, opacités de repos 0,7 · 1 · 0,75) avec animation continue optionnelle et respect de Reduce Motion ; MeeshyBrandMark expose la géométrie pure du logo (espace 1024×1024, épaisseur 112/1024, bornes encrées) pour dessiner hors fil principal (cadres d'appel, filigranes d'export). LiquidRevealShape est un masque « vague liquide » : un disque au bord ondulé par une sinusoïde qui naît d'un point (le bouton source) et grandit jusqu'à couvrir tout le rect (amplitude enveloppée par sin(progress·π)), utilisé pour l'ouverture des réels. AdaptiveSymbolEffects : rebond à chaque changement de valeur, pulsation répétée, bascule animée entre deux symboles (lecture ↔ pause, cœur plein/vide).

Écarts :
- BrandLogo dessine un « M » dans un carré arrondi (ancienne charte) : aligner sur les trois traits de MeeshyDashesShape pour tous les usages (toolbar, vide, chargement)
- Composable AnimatedMeeshyLogo(color, lineWidth, continuous) sans animation si reducedMotion
- Géométrie pure du logo (traits dans l'espace 1024, bornes encrées) exploitable pour les filigranes de capture d'appel
- LiquidRevealShape : clip Shape Compose (disque à bord sinusoïdal, baseRadius → maxRadius, amplitude, fréquence, phase animable) pour l'ouverture des réels depuis le bouton flottant
- Effets de symbole : rebond au changement de valeur, pulsation répétée, bascule animée play/pause et cœur plein/vide (AnimatedContent / graphicsLayer) avec garde Reduce Motion

Rendu : Trois traits alignés à gauche de longueurs décroissantes, bouts ronds, animation de dessin séquentielle ; révélation liquide dont l'ondulation n'existe qu'à mi-course.

Transposition Android : Shape SwiftUI → Shape/Path Compose ; symbolEffect → animate*AsState / AnimatedContent

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/AnimatedLogoView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyBrandMark.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/LiquidRevealShape.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveSymbolEffects.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/SplashLogoGeometry.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/BrandLogo.kt`

### La version, le crédit services.ceo et le logo s'affichent en pied des écrans d'accueil

`dst-brand-signature` · Android : **partielle** · P2 · effort S

BrandSignature empile « Meeshy {version} · {build} » (14 arrondi, 90 % muted, réduction jusqu'à 70 %), le lien « by services.ceo » ouvrant https://services.ceo dans le navigateur (zone sensible étendue de 14 pt, indice d'accessibilité) et le logo de pied 28 pt teinté d'erreur à 85 %. Utilisé par le splash, la connexion, le lien magique et l'accueil.

Écarts :
- BrandSignature est privé au splash : l'extraire en composant public réutilisé par connexion, accueil, lien magique.
- Le crédit est un texte brut « Services CEO » : en faire un lien « by services.ceo » ouvrant https://services.ceo (Intent ACTION_VIEW) avec zone sensible étendue de 14 dp et contentDescription + indice « Ouvre la plateforme services.ceo dans le navigateur ».
- Lire versionName et versionCode (BuildConfig) pour « Meeshy 1.2.3 · 45 » avec contentDescription « Meeshy version X, build Y. ».
- Appliquer minimumScaleFactor 0,7 (autoSize ou maxLines + réduction) et la police arrondie 14 (labelSize) ; opacités 0,85 et 0,7 des jetons.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`

### La bande de pastilles de couleur du composeur est facile à toucher et annonce « Couleur 3 sur 17 »

`dst-color-swatch-strip` · Android : **partielle** · P2 · effort S

BackgroundColorPalette : défilement horizontal de pastilles rondes 28 pt avec contour textSecondary 25 %, cible tactile 44 x 44 (le dessin n'est pas la cible), espacement 10, marge 16, groupe nommé « Arrière-plan », chaque pastille annoncée positionnellement (« Couleur n sur N », nombres localisés).

Écarts :
- Extraire un composant BackgroundColorPalette partagé (composeur de story et de document) : LazyRow, pastille 28 dp dans une zone cliquable 48 dp, contour 25 %, espacement 10, marge 16.
- Annonce positionnelle « Couleur {n} sur {N} » via contentDescription localisé (nombres selon la locale), nom du groupe sur le conteneur.
- Vérifier que ColorSwatch / BackgroundSwatch du StoryComposerScreen aient la cible ≥ 48 dp (le dessin est de 28 dp).

Rendu : Disque 28 dp, anneau fin discret, bande qui défile sans scrollbar.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/BackgroundColorPalette.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Le temps passé sur un contenu est mesuré par un modificateur déclaratif

`dst-engagement-tracking` · Android : **partielle** · P2 · effort S

trackEngagement(postId, contentType, surface) ouvre une session d'engagement à l'apparition de l'écran et la clôt (envoi si qualifiée) à sa disparition, sans doublon.

Écarts :
- Le moteur d'état existe (EngagementSessions, surfaces DETAIL, REELS, STORY_VIEWER, STATUS_BUBBLE) mais chaque ViewModel le pilote à la main : fournir un composable TrackEngagement(postId, contentType, surface) basé sur DisposableEffect/lifecycle qui appelle begin/end une seule fois (garde d'activité).
- Vérifier la paire begin/end sur rotation, navigation arrière et passage en arrière-plan (ON_STOP) pour ne pas perdre ni doubler une session.
- Prévoir la surface FEED si iOS la porte et la file persistée d'envoi (engagement-outbox) pour un envoi hors ligne.

Transposition Android : onAppear/onDisappear vers DisposableEffect / LifecycleEventObserver.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Modifiers/TrackEngagementModifier.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EngagementSessions.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailViewModel.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Feuilles et sélecteurs s'adaptent à la largeur : feuille large et popover ancré sur tablette, détentes translucides pour l'audience

`dst-layout-adaptive-sheets-pickers` · Android : **partielle** · P2 · effort M

MeeshySheet/AdaptiveSheetSizing demandent la feuille « page » (grande) selon la classe de taille de la fenêtre qui PRÉSENTE (pas le type d'appareil : un iPad en Slide Over est étroit). AnchoredPicker présente un popover ancré en largeur régulière et une feuille en compact (un sélecteur de langue, d'émoji…). AudiencePickerPresentation : feuille translucide (ultraThinMaterial), détentes medium/0,85 sans .large pour laisser visible l'en-tête du composer de story.

Écarts :
- 22 ModalBottomSheet sans règle commune : créer un MeeshySheet (largeur max selon WindowSizeClass, sheetMaxWidth, feuille « page » sur tablette)
- Sélecteur ancré : popup/DropdownMenu ancré sur écrans larges, ModalBottomSheet en compact (AnchoredPicker)
- Feuille d'audience du composer de story : arrière-plan translucide et détentes partielle/0,85 sans plein écran pour garder l'en-tête atteignable
- Décision par classe de taille de la fenêtre présentatrice, pas par type d'appareil

Rendu : Coins arrondis hauts, poignée de glissement, fond translucide pour l'audience ; popover à flèche remplacé par popup ombré ancré.

Transposition Android : sheet/popover/presentationDetents → ModalBottomSheet, Popup, ExposedDropdownMenu, WindowSizeClass

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AnchoredPicker.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/MeeshySheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveSheetSizing.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AudiencePickerPresentation.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewersSheet.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySendToSheet.kt`

### Les journaux sont rangés par sous-système et catégorie, et les erreurs sont enregistrées

`dst-logging-categories` · Android : **partielle** · P2 · effort S

MeeshyLog donne un Logger par catégorie (plus de 100 catégories : network, auth, messages, socket, cache, composer, calls, e2ee, impressions...) et par sous-système (app, sdk, anciens identifiants, extension de contenu de notification), plus un enregistreur d'erreurs (ErrorRecording / RecordedFailure avec contexte, catégorie, type, message).

Écarts :
- Android journalise avec Timber en texte libre : créer MeeshyLog.logger(category) (enum Category reprenant les noms iOS) en tag Timber structuré pour filtrer logcat par catégorie.
- Créer l'interface ErrorRecording et MeeshyLog.record(error, context, category) branchée sur CrashDiagnosticsRecorder (non fatales visibles dans l'écran de rapports) et les helpers « best effort » qui journalisent au lieu d'avaler.
- Aucune donnée personnelle dans les messages de log (privacy: public/private iOS) : documenter la règle.

Transposition Android : os.Logger / OSLogErrorRecorder vers Timber + Tree structuré ; sous-systèmes sans objet (un seul processus applicatif).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Logging/MeeshyLog.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Logging/MeeshyLog+Category.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Logging/MeeshyLog+Subsystem.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashDiagnosticsRecorder.kt`

### Mon profil montre un anneau de complétude en pourcentage avec dégradé rose→cyan

`dst-profile-completion-ring` · Android : **partielle** · P2 · effort S

ProfileCompletionRing : cercle à trait progressif 0–100 % en dégradé rose→cyan, pourcentage « XX % » centré en gras arrondi, animation à ressort à l'apparition, utilisé dans l'onglet détails de la feuille de profil.

Écarts :
- L'anneau Android est privé à ProfileScreen, de couleur unie indigo : extraire un ProfileCompletionRing(progress) réutilisable dans sdk-ui avec dégradé rose→cyan (sweep gradient) et texte « XX % » centré
- Animation de progression à ressort à l'apparition
- Utiliser l'anneau aussi dans la feuille de profil / onglet détails comme sur iOS

Rendu : Trait arrondi ≈ 6–8 dp sur piste discrète, pourcentage Nunito bold centré.

Transposition Android : Circle.trim + AngularGradient → Canvas drawArc + Brush.sweepGradient

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ProfileCompletionRing.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileHeaderPresentation.kt`

### Les affichages de posts sont comptés en lot avec rang et visibilité

`dst-reach-impression-collector` · Android : **partielle** · P2 · effort S

ReachImpressionRecording : record(postId), recordListed(postId, position, isVideo) rendant un eventId, noteVisible(fraction, eventId), noteGone(eventId) ; ReachImpressionCollector accumule les affichages d'une surface du SDK avec leur heure réelle et les envoie en UN lot à la sortie via POST /social/events (un envoi refusé est perdu : compteur d'audience).

Écarts :
- ImpressionBatcher n'envoie que des postId bruts : ajouter l'événement social horodaté (StampedSocialEvent impression avec source, surface ReachSurface, position, isVideo) via POST /social/events.
- Ajouter recordListed / noteVisible(fraction) / noteGone (mesure de visibilité de la carte, fraction visible par seuil) pour le rang rendu dans un listing.
- Ajouter le flush à l'arrière-plan et la persistance qui survit à un kill (non portés aujourd'hui, de l'aveu du code).
- Créer l'interface ReachImpressionRecording et un ReachImpressionCollector minimal pour les surfaces du SDK qui montent leur propre liste (profil, hashtag).

Transposition Android : Task détachée + PostService vers CoroutineScope dédié + PostRepository ; ProcessLifecycleOwner pour le flush.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ReachImpressionCollector.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Chaque affichage d'un contenu dans une liste est compté une fois, sans double comptage des rangées jumelles

`dst-reach-impressions` · Android : **partielle** · P2 · effort S

Règle de comptage du porteur (2026-10-13) : un contenu se compte CHAQUE fois qu'il est listé (aucun dédoublonnage dans le temps ni par montage), mais pas lors d'un simple re-rendu ; seul l'événement d'apparition compte. recountsOnChange recompte quand la vue reste mais montre un autre contenu (humeur remplacée). ReachPresence évite le double comptage de deux vues du même contenu au même endroit (grande rangée et rangée épinglée du rail) : un contenu ne compte qu'en entrant alors qu'aucune vue ne le montre déjà, et pas s'il revient moins de 2 s après sa sortie (rejoinGrace).

Écarts :
- ImpressionBatcher groupe l'envoi mais aucun modifier d'apparition (LazyList item visible) ne déclenche le comptage de façon uniforme sur rail de stories, feed, réels, statuts
- Règle ReachPresence : refcount par contenu et rejoinGrace de 2 s pour les rangées jumelles du rail (12 % d'impressions répétées mesurées sur iOS)
- recountsOnChange : recompter quand l'avatar affiche une nouvelle humeur
- Ne jamais compter à la recomposition ; compter uniquement à l'entrée dans le viewport

Rendu : Aucun visuel.

Transposition Android : onAppear/onDisappear → LaunchedEffect/DisposableEffect sur visibilité LazyList (layoutInfo)

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ReachImpressions.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusesViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`

### Dans les préférences d'une conversation, choisir sa catégorie et saisir ses étiquettes avec suggestions et création à la volée

`dst-tag-category-fields` · Android : **partielle** · P2 · effort S

CategoryPickerField affiche la catégorie choisie en puce amovible au-dessus d'un champ de recherche/création, liste toutes les catégories connues à la prise de focus (filtrées par le texte tapé) et permet de créer une catégorie. TagInputField suit la même disposition puce-puis-saisie : ajout par validation, suggestions, retrait d'une puce.

Écarts :
- Les modèles purs (CategoryPicker, TagAutocomplete) existent mais l'UI inline puce + saisie + liste de suggestions dans l'écran des préférences de conversation est à compléter (ConversationTagsEditor ne fait que 18 lignes)
- Création d'une catégorie depuis la saisie (asynchrone, état en cours/erreur) avec sélection immédiate
- Liste des catégories au focus, filtrée par la saisie, puces amovibles colorées de façon déterministe
- Même disposition puce-puis-saisie pour catégorie et étiquettes (cohérence visuelle)

Rendu : Puces arrondies colorées (couleur déterministe par étiquette) avec croix, champ de saisie à la suite, liste de suggestions sous le champ.

Transposition Android : HStack/FlowLayout → FlowRow + InputChip + OutlinedTextField avec suggestions

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagsEditor.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationCategoryPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationTagAutocomplete.kt`

### Le composer détecte la langue pendant la frappe (puis la fige après 10 mots) et affiche l'émoji de sentiment

`dst-composer-text-analysis` · Android : **complète** · P1 · effort S

TextAnalyzer détecte la langue à chaque frappe tant que le brouillon a moins de 10 mots, la fige au seuil si elle a atteint 86 % de confiance (sinon reste sur le défaut « fr »), permet un forçage manuel et une réinitialisation, et calcule un score de sentiment mappé sur 7 niveaux d'émojis (très négatif 😡 … très positif 🤩).

Rendu : Emoji de sentiment en icône de fin du champ de saisie, drapeau de langue détectée.

Transposition Android : Portage direct (déjà fait).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/ComposeLanguageDetector.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ComposerLanguageState.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Sentiment.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### Un lien de partage propose la bonne entrée (rejoindre avec mon compte, anonymement, reprendre ma session invité)

`dst-share-link-entry-resolver` · Android : **complète** · P1 · effort S

ShareLinkEntryResolver réunit les faits (aperçu public du lien, authentification, appartenance déjà acquise, compte exigé, session invité stockée pour CE lien) puis interroge la règle pure ShareLinkEntryPolicy. La page d'invitation s'affiche avec le lien déjà résolu, sans second appel ; un lien exigeant un compte y passe aussi pour ne rien engager en silence.

Rendu : Page d'invitation avec choix d'identité ; rien à ajouter.

Transposition Android : Portage direct (déjà fait).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Navigation/ShareLinkEntryResolver.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryResolver.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkEntryPolicy.kt`

### Je peux consulter, partager et vider les rapports de crash de l'app

`dst-crash-report-sheet` · Android : **complète** · P2 · effort S

Liste des diagnostics (crash, exception, blocage, CPU, écriture disque) avec badge de gravité coloré, résumé, détails monospace sélectionnables dépliables un à la fois, date relative, partage groupé en texte et fermeture.

Rendu : Badge capsule rouge pour crash/exception, orange pour blocage/CPU, bleu pour écriture disque.

Transposition Android : MetricKit vers UncaughtExceptionHandler + ApplicationExitInfo ; ShareLink vers ACTION_SEND.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashReportScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashReportViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/CrashDiagnosticsRecorder.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/FileCrashDiagnosticsStore.kt`

### Les puces et étiquettes passent à la ligne quand la rangée est pleine

`dst-flow-layout` · Android : **complète** · P2 · effort S

FlowLayout dispose des sous-vues de gauche à droite avec espacement 8 et retour à la ligne ; une puce plus large que la rangée est contrainte à la largeur de rangée.

Rendu : Espacement 8 dans les deux axes ; hauteur de ligne = plus haute puce.

Transposition Android : Layout personnalisé vers FlowRow (androidx.compose.foundation.layout, horizontalArrangement = spacedBy(8.dp), verticalArrangement = spacedBy(8.dp)).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/FlowLayout.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`

