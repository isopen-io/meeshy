# Parité iOS → Android : `conversation-list`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**96 features iOS** : 43 absentes, 45 partielles, 5 divergentes, 3 complètes sur Android. **56 lots** planifiés (≈46360 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**conversation-list#1** (couverture Android estimée ≈ 27 %)

Cette partie couvre la liste de conversations iOS (ConversationListView et ses 25 extensions), le conteneur racine (RootView, boutons flottants, navigation depuis notifications et liens profonds) et trois chantiers de lecture autonomes : la Lentille (liste par défaut depuis le 2026-09-14 : sections temporelles, stickers épinglés, rangs à perspective et focus), les modes de lecture Focal/Script/Bulles/Résumé/Rivière avec le Résumé vivant, et la Rivière (couloirs par voix, axe du temps, pincement). Côté iOS la liste est cache-first, sections repliables mémorisées, glisser-déposer vers les catégories, balayage à 3 actions par côté, appui long qui ouvre un aperçu flouté + menu icône, ligne de dernier message composée par le SDK (appels, réactions, éphémères, compte à rebours), barre de recherche flottante qui se masque au défilement avec bande Communautés, grille d'accès rapides en queue de liste. Android couvre le socle : liste sectionnée (Épinglées/catégories/Toutes), en-tête repliable, chips de filtre (sélection unique), barre de recherche + tableau de bord + recherche globale, bandeau de connexion, squelette/erreur/vide, balayage 1 action par côté, menu contextuel DropdownMenu avec aperçu texte, verrou par code, pastilles de boutons flottants et échelle de menu, résolution de destination des notifications, étiquette d'accessibilité des bulles, sélecteur de lien de partage. Absents sur Android : Lentille entière, modes de lecture, Résumé vivant, Rivière, glisser-déposer, pied de pagination, composeur d'aperçu enrichi, bande Communautés (aucun module communautés), accès rapides, mise en page tablette, bannières d'attente, garde de version. Écarts structurants : toutes les lignes d'une section sont composées dans un seul item de LazyColumn (pas de virtualisation), le plateau de stories est fixe au lieu de défiler avec la liste, le filtre est à sélection unique, le menu contextuel est un menu texte sans carte d'aperçu. Couverture estimée de la parité : environ 27 %.

**conversation-list#2** (couverture Android estimée ≈ 20 %)

Cette partie couvre le moteur et la peau « Lentille » de la liste de conversations iOS (drapeau ON par défaut) : rangée plate de 84 pt avec perspective de défilement, élection de la rangée focale et magnification en place ; le ConversationListViewModel et ses 9 extensions (cache-first à 6 états, pagination curseur, patch temps réel des événements socket, sections épinglées/catégories/live/temporelles/World Wide, prefetch messages et stories, aperçu d'appui long) ; la pastille de synchronisation globale (SyncPill : état outbox, libellés, rotation, marquee, dock clavier) ; les cartes de lien de conversation dans les messages (join/leave/open) ; les couches racine (routage de lancement, bannière de notification à gestes, feuilles, porte de mise à jour, bulle de mood) ; et tout le sous-système Focal/lecture (modes de lecture Auto/Focal/Script/Résumé/Rivière/Bulles, rangées plates de fil, carte de l'élu, grille de médias, pilule de temps, expansion des longs messages). Constat clé : le mode PAR DÉFAUT du fil iOS est « Script » (rangées plates, pas de bulles), y compris quand le drapeau est éteint ; Android ne rend que des bulles, donc le rendu du fil est divergent. Côté Android, la liste existe et fonctionne (cache-first Room, états squelette/vide/erreur, tirer-pour-rafraîchir, swipe épingler/archiver, menu contextuel riche, frappe en cours, brouillons, présence, anneau story) mais avec la peau legacy « carte de verre + dégradé de chaleur », une liste non paresseuse sans pagination, un rafraîchissement complet à chaque événement socket, un fourre-tout unique « Mes conversations » sans sections temporelles/live/World Wide. Absents : la pastille de synchro globale, les cartes de lien de conversation, les modes de lecture et tout Focal, la perspective/magnification, la porte de mise à jour, le prefetch, la bulle de mood racine. Couverture estimée à environ 20 % d'iso, surtout grâce au socle de données (Room/SWR, outbox, socket, brouillons) déjà prêt.

## Notes transverses

LECTURE DU DOMAINE (fusion des 2 parties d'inventaire, 106 features dont 3 complètes écartées: cl-share-link-picker, clist-root-share-link-identity, clist-vm-observation-store-merge -> 68 lots). Estimations est_kotlin_lines = production + tests, hors lignes simplement déplacées par les lots de découpage. Tout chemin cité qui n'existe pas encore dans l'arbre est un fichier À CRÉER. Gate unique = CI android.yml (conteneurs sans dl.google.com): toute logique va dans :core:model (Kotlin pur, `./apps/android/meeshy.sh jvm-check`), les écrans restent minces. SSOT à rejouer côté tests: packages/shared/fixtures/{reading-modes/{sections,sort,orchestrator,capabilities,assist-tier,bridge,focus-curve,scroll-activity,river-lanes,river-headers,river-step,prism-translation}.vectors.json, conversation-preview-cases.json, action-policy/conversation-actions.vectors.json, long-message/*} avec la recherche du fichier en remontant l'arborescence (patron de core/model/src/test/.../lang/PrismPreviewVectorParityTest.kt). Quand aucune fixture partagée n'existe (résumé vivant, synchro, liens profonds, pagination, glisser-déposer, filtres), les tests portent les XCTest iOS cités. | CORRECTIONS À L'INVENTAIRE (constatées dans l'arbre): (1) 'aucun module communautés' est inexact: CommunityRepository et ApiCommunity existent (sdk-core/community, core/model/Community.kt); manquent le cache SWR et les écrans (ext:communautes-ecrans). (2) 'Android parcourt toutes les pages à chaque synchro' est inexact: ConversationCacheSource fait déjà un delta (updatedSince + ETag 304) et ne balaie en entier que sans filigrane ou après 24 h; le lot de pagination ajoute une fenêtre d'affichage + première page d'abord, il ne réécrit pas le moteur de synchro. (3) MessageApi.search (conversations/{cid}/messages/search avec cursor) existe déjà, c'est MessageRepository qui ne l'expose pas. (4) CategoryOption n'a ni couleur, ni icône, ni isExpanded; CategoryRepository n'a pas setExpanded; ApiConversationPreferences n'a pas orderInCategory; ReportRepository n'a pas reportConversation; OutboxState n'a pas FAILED (EXHAUSTED en tient lieu). (5) Contradiction entre les 2 parties sur le mode de lecture sans drapeau: la SSOT packages/shared/utils/reading-modes.ts tranche: drapeau éteint -> 'bubbles', drapeau allumé (défaut) + auto -> 'script'; les lots suivent la SSOT. (6) feature/conversations n'a pas les dépendances de test Compose (compose-ui-test-junit4, ui-test-manifest): ajoutées par liste-decoupage-ecran-jetons-lentille comme dans feature/auth|feed|settings. (7) Le catalogue de versions n'a ni material3-window-size-class ni material3-adaptive (ajout dans tablette-liste-detail) et le BOM 2024.10.01 n'a pas scrollable2D: la Rivière se fait avec un Layout + detectTransformGestures maison. (8) Le worldWide identifier iOS est 'world' (MeeshyConversation.worldWideIdentifier). | FICHIERS CHAUDS HORS BUDGET (CLAUDE.md: plafond dur 1200, 1000 = seuil de découpage, interdit d'y ajouter): ConversationListViewModel.kt 1046, MeeshyApp.kt 1202, ChatScreen.kt 2953, ChatViewModel.kt 2248, MessageBubble.kt 1202. Remèdes imposés par la structure des lots: liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille et racine-decoupage-navigation passent en vague 0 et sont prérequis de tout lot qui touche ces fichiers; les lots 'fil-*' extraient d'abord (BubbleThreadRow, ThreadRowMux) et font décroître ChatScreen.kt; aucun lot n'ajoute à ChatViewModel.kt: on y injecte au plus un collaborateur nouveau (ChatServerSearch, ReadingModeViewModel séparé). Chaque lot qui touche encore ConversationListViewModel.kt/ConversationListUiState.kt n'y ajoute que du câblage (<= 25 lignes) et garde sa logique dans un fichier propre; ces deux fichiers restent le seul point de rebase attendu entre lots d'une même vague. | CHAÎNES: chaque lot livre son propre fichier strings_<lot>.xml dans values, values-fr, values-es, values-pt du module concerné (jamais d'édition de strings.xml existants) pour éviter les conflits; Android couvre 4 langues (fr, es, pt, en), iOS 7: l'écart est consigné, pas à combler ici. | LOIS TRANSVERSES: Prisme = descente rang par rang sur resolvePrismTranslation/LanguageResolver, jamais translations.first, langue servie portée avec le texte (aperçu de ligne, aperçu long-press, rangées Focal, bannière); le serveur résout déjà la bannière push (ne pas re-résoudre côté client). Présence = le serveur ne sert la présence qu'aux amis acceptés, soi et ADMIN: le client ne fabrique ni ne prolonge rien, offline = aucun point d'avatar, un pair qui écrit est forcé vert (ConversationTypingRoster). Accent = ApiConversation.accentColorPalette() / DynamicColorGenerator pour anneau, barre de sélection, chips, menus, carte de peek, carte de lien. | DÉCISIONS PRODUIT À POSER AVANT IMPLÉMENTATION (issues décision-produit, une par ligne): (a) le drapeau lentilleList éteint doit-il garder l'ancienne carte de verre à dégradé de chaleur (doublon de code) ou retomber sur le sectionnement classique rendu avec la rangée plate? recommandation: seconde option, ConversationActivityHeat est supprimé par ligne-lentille-plate. (b) protection d'écran des aperçus éphémères: Android n'a pas de captureShield par vue (FLAG_SECURE est par fenêtre, setContentSensitivity n'existe qu'API 35): proposer FLAG_SECURE compté par références tant qu'une ligne éphémère active est affichée, impact: captures d'écran de toute la liste bloquées. (c) échelle racine: iOS a Communautés et pas Contacts, Android a Contacts comme unique accès (voir commentaire de rememberMenuLadderItems): garder Contacts jusqu'à l'arrivée de ext:communautes-ecrans puis arbitrer. (d) 'supprimer pour tous' et 'Mentions seulement'/'Étiquettes' existent côté Android et pas dans le menu iOS: conservés en sous-entrées gardées par capacités tant qu'aucune directive ne les retire. (e) fiche 'Infos de conversation': iOS l'ouvre en feuille depuis la liste, Android la possède dans feature/chat (ConversationSettingsSheet) et feature->feature est interdit: la liste navigue vers le chat avec un argument d'ouverture de la feuille plutôt que de la dupliquer. (f) mini-lecteur audio global: aucune infrastructure n'existe, lot racine-mini-lecteur-audio à confirmer avec le domaine média/chat. | PRÉREQUIS D'AUTRES DOMAINES (ext:): ext:communautes-ecrans (liste/détail/Voir tout), ext:affiliation et ext:liens-de-suivi (tuiles de queue de liste, masquées tant qu'absentes), ext:presence-ici (événement 'le pair est dans cette conversation', badge masqué tant qu'absent), ext:jeu-progression (succès, niveaux, ligue, userStats: la navigation de notification retombe sur l'écran Notifications), ext:feed-actions-optimistes (j'aime/favori/repartage/citation du Flux et autoplay des réels: hors lot, le Flux n'est ici qu'une surcouche). Les lots touchant feature/chat (fil-*, carte-lien-*, modes-lecture-interface) et feature/notifications recoupent probablement les domaines 'chat' et 'notifications': à dédoublonner à la fusion globale par fichier (ChatScreen.kt, ChatViewModel.kt, NotificationDestination.kt, MeeshyFcmService.kt). | ORDRE DE VAGUES RECOMMANDÉ: V0 (parallèle, aucun fichier partagé): liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille, racine-decoupage-navigation, modele-conversation-enrichi, loi-sections-lentille, loi-politique-actions-conversation, loi-apercu-composeur, loi-focale-perspective-focus, loi-focale-contenu, loi-resume-vivant, loi-liens-profonds, loi-pastille-synchro, fil-etiquette-accessibilite, fil-recherche-serveur, racine-ouverture-conversation-par-id. V1: loi-modes-de-lecture, liste-chargement-cache-first, liste-temps-reel-patch-en-place, liste-sections-etat-et-ordre, liste-etats-vides-squelette, liste-filtres-composes, ligne-lentille-plate, liste-barre-recherche-flottante, racine-boutons-flottants-echelle, racine-garde-version, carte-lien-donnees, racine-presentation-et-intentions, synchro-pastille-et-bandeaux. V2: liste-virtualisee-entetes, ligne-apercu-rendu, liste-dialogues-confirmations, apercu-conversation-donnees, liste-entete-et-plateau-stories, modes-lecture-preferences-et-drapeaux, racine-liens-profonds-android, racine-navigation-notifications, racine-fiches-profil-partage, racine-couches-globales, liste-appel-en-direct. V3: liste-menu-actions-conversation, ligne-balayage-actions, ligne-avatar-gestes, liste-pagination-pied, liste-glisser-deposer, fil-rangee-plate-structure, racine-flux-surcouche, racine-banniere-notification-gestes, tablette-liste-detail. V4: apercu-appui-long-surcouche, modes-lecture-interface, fil-rangee-citation, fil-rangee-medias-protection, fil-rangees-audio-et-notices, fil-expansion-long-message, fil-chrome-defilement, carte-lien-interface, liste-bande-communautes, liste-acces-rapides, racine-reels-devoilement, racine-portes-stories-et-bulle-mood, tablette-clavier-largeur-multifenetre. V5 (P2): lentille-perspective-et-magnification, fil-perspective-et-carte-focus, resume-vivant-ecran, loi-riviere, riviere-bulles-rails, riviere-defilement-gestes, racine-mini-lecteur-audio. | COMPATIBILITÉ SERVEUR (règle rétrocompatibilité prod): tous les champs du modèle sont ajoutés avec défauts nullables et décodage tolérant (un ancien cache Room, une ancienne passerelle, un champ absent ne cassent rien); les endpoints GET /conversations/:id/card, GET /links/:identifier/card, GET /app/min-version et le paramètre cursor de GET /conversations sont additifs côté serveur, l'absence ou un 404 dégrade vers l'état 'indisponible' / aucun blocage, jamais vers une erreur bloquante. | FICHIERS iOS NON PORTÉS (rien à produire): SectionScrollPill.swift et SectionScrollPillHost.swift (non montés, doublon du sticker), ConversationLinkCardPreviewLaunch.swift (banc DEBUG), ConversationListEnvironment.swift (motif SwiftUI; Hilt + collectAsStateWithLifecycle suffisent). | BEHAVIOUR-MATRIX: packages/shared/fixtures/conformance/behaviour-matrix.json pourrait servir de témoin transverse pour la parité des lots 'loi-*'; non vérifié ici.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `fil-etiquette-accessibilite` | B | P0 | S | 280 |  | Chaque bulle est lue à voix haute dans l'ordre expéditeur, réponse, texte, médias, heure, statut |
| `fil-rangee-plate-structure` | B | P0 | L | 1900 | modes-lecture-preferences-et-drapeaux, loi-focale-perspective-focus, loi-focale-contenu, fil-etiquette-accessibilite, composer-glass-shell | Le fil se lit en rangées plates sans bulles (Script par défaut, Focal) avec identité de groupe, colonne d'heure et coches révélées au défilement |
| `ligne-apercu-rendu` | B | P0 | M | 950 | conversation-apercu-compositeur-loi, liste-conversations-fil-complet-et-contrat-apercu, ligne-lentille-plate, liste-decoupage-viewmodel | La ligne de dernier message résume appels, réactions, médias, effets et éphémères avec pictogrammes, flèche de direction et compte à rebours |
| `ligne-balayage-actions` | B | P0 | M | 650 | ligne-lentille-plate, actions-message-et-conversation-loi, liste-dialogues-confirmations | Balayer une ligne révèle trois actions à gauche (épingler, silence, verrou) et trois à droite (archiver, lu/non lu, masquer) |
| `ligne-lentille-plate` | B | P0 | M | 700 | liste-decoupage-ecran-jetons-lentille, atomes-d-avatar-loi-humeur-et-non-lus | Chaque conversation est une rangée plate de 84 dp: anneau d'accent, emojis d'état, points d'étiquettes, frappe, brouillon ou aperçu |
| `liste-chargement-cache-first` | B | P0 | M | 700 | liste-decoupage-viewmodel, socle-points-d-extension-de-l-app | La liste est déjà chargée à l'ouverture, distingue frais, périmé, hors ligne et erreur, et se répare seule au retour du réseau ou du premier plan |
| `liste-decoupage-ecran-jetons-lentille` | B | P0 | M | 750 |  | L'écran de liste est découpé par surface et les cotes de la Lentille deviennent des jetons partagés |
| `liste-decoupage-viewmodel` | B | P0 | M | 900 |  | La logique de la liste de conversations est découpée en collaborateurs testables, sans rien changer à l'écran |
| `liste-dialogues-confirmations` | B | P0 | M | 1000 | liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille, actions-message-et-conversation-loi, liste-chargement-cache-first | Bloquer, masquer, quitter, renommer, signaler et verrouiller passent par des confirmations cohérentes avec iOS, et chaque action de rangée agit tout de suite |
| `liste-etats-vides-squelette` | B | P0 | M | 380 | liste-decoupage-ecran-jetons-lentille | La liste montre un squelette animé de la taille des vraies lignes, un vide propre, 'aucun résultat' ou une erreur de synchronisation avec Réessayer |
| `liste-menu-actions-conversation` | B | P0 | M | 900 | actions-message-et-conversation-loi, liste-dialogues-confirmations, ligne-lentille-plate, liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille | Le menu d'une conversation offre épingler, silence, rechercher, appeler, détails, favori, déplacer, verrouiller, archiver, bloquer et signaler selon ce que la conversation permet |
| `liste-sections-etat-et-ordre` | B | P0 | M | 650 | liste-decoupage-viewmodel, loi-sections-lentille, liste-conversations-fil-complet-et-contrat-apercu, persist-conversations-fusion-en-place | Les sections se rangent comme sur iOS, gardent leur état replié entre les ouvertures et synchronisent l'état des catégories avec le serveur |
| `liste-temps-reel-patch-en-place` | B | P0 | M | 1000 | liste-decoupage-viewmodel, liste-conversations-fil-complet-et-contrat-apercu | Un message, un changement de titre ou un nouveau membre met la ligne à jour immédiatement et sans recharger toute la liste |
| `liste-virtualisee-entetes` | B | P0 | M | 800 | liste-decoupage-ecran-jetons-lentille, liste-sections-etat-et-ordre | La liste défile sans à-coups: une ligne par item, en-têtes épinglés, sections animées et lignes qui remontent en ressort |
| `loi-focale-contenu` | B | P0 | M | 800 |  | Le contenu du fil se compose par des lois pures: grille de médias, routage audio, protection, long message, chrome qui se retire |
| `loi-focale-perspective-focus` | B | P0 | M | 950 |  | Le fil et la liste savent estomper et compacter leurs rangées autour de l'élue, la magnifier après un défilement soutenu et dater le message sous le doigt |
| `loi-liens-profonds` | B | P0 | M | 800 |  | Un lien meeshy.me ou meeshy:// se comprend d'une seule manière partout: destination, carte de conversation ou lien externe |
| `loi-modes-de-lecture` | B | P0 | M | 800 | liste-conversations-fil-complet-et-contrat-apercu | L'app décide seule du mode de lecture d'une conversation (Script par défaut, Résumé après une longue absence) et sait résumer ce qu'on a manqué |
| `loi-sections-lentille` | B | P0 | M | 700 |  | La liste sait ranger ses conversations en sections (Épinglées, En direct, catégories, Aujourd'hui, Hier, Cette semaine, Plus ancien) comme iOS et le web |
| `modes-lecture-preferences-et-drapeaux` | B | P0 | M | 600 | loi-modes-de-lecture, settings-hub-iso-layout | Le mode de lecture se mémorise par conversation et les trois drapeaux (liste Lentille, modes de lecture, Rivière) s'activent depuis les Réglages |
| `racine-liens-profonds-android` | B | P0 | M | 1000 | loi-liens-profonds, racine-ouverture-conversation-par-id, socle-points-d-extension-de-l-app, routeur-de-navigation-hubs-et-cibles-differees, liens-a-jeton-d-e-mail-jamais-ouverts-dans-l-app | Les liens (partage, appel, profil, post, réel, story, communauté, hashtag, conversations récentes) ouvrent la bonne destination |
| `racine-ouverture-conversation-par-id` | B | P0 | S | 300 |  | Ouvrir une conversation par son identifiant marche même hors cache, avec une nouvelle tentative et un message d'erreur clair |
| `apercu-appui-long-surcouche` | B | P1 | L | 1800 | apercu-conversation-donnees, liste-menu-actions-conversation, ligne-apercu-rendu, liste-glisser-deposer, ligne-lentille-plate, composer-glass-shell, liste-decoupage-viewmodel | Un appui long sur une conversation ouvre un aperçu flouté (bannière, derniers messages) au-dessus d'un menu animé |
| `apercu-conversation-donnees` | B | P1 | M | 850 | liste-decoupage-viewmodel, liste-chargement-cache-first, persist-messages-repository-decoupage | L'aperçu d'une conversation et les messages du haut de liste sont prêts avant l'ouverture, avec chiffrés scellés et Prisme respecté |
| `carte-lien-donnees` | B | P1 | M | 700 | loi-liens-profonds, liste-conversations-fil-complet-et-contrat-apercu | La carte d'une conversation se charge depuis le cache puis se rafraîchit, et se périme quand on rejoint ou quitte depuis une autre carte |
| `carte-lien-interface` | B | P1 | L | 1200 | carte-lien-donnees, fil-rangee-plate-structure | Un lien d'invitation s'affiche comme une carte riche avec squelette, état privé ou expiré, et permet de rejoindre, quitter ou ouvrir |
| `fil-chrome-defilement` | B | P1 | M | 520 | fil-rangee-plate-structure, loi-focale-perspective-focus, loi-focale-contenu, composer-glass-shell | En lisant le fil, l'en-tête et la barre de saisie s'effacent pendant le geste, une pilule indique le jour et l'heure sous le doigt, et le premier défilement ferme d'abord le clavier |
| `fil-expansion-long-message` | B | P1 | M | 450 | fil-rangee-plate-structure, loi-focale-contenu | Un long message se déplie et se replie sur place sans faire sauter le défilement |
| `fil-rangee-citation` | B | P1 | M | 480 | fil-rangee-plate-structure, loi-focale-contenu | Une réponse affiche sa citation avec un rail vertical, saute au message d'origine au tap et traite une story citée comme une scène |
| `fil-rangee-medias-protection` | B | P1 | M | 950 | fil-rangee-plate-structure, loi-focale-contenu | Les photos et vidéos du fil forment une grille de 300 dp (1, 2, 3 ou 4+) avec flou, vue unique et double-tap pour réagir |
| `fil-rangees-audio-et-notices` | B | P1 | M | 520 | fil-rangee-plate-structure, loi-focale-contenu | Les messages audio du fil choisissent le bon rendu, et les messages supprimés, notices système et notices d'appel s'affichent comme des lignes discrètes |
| `fil-recherche-serveur` | B | P1 | M | 650 | persist-messages-repository-decoupage, chat-viewmodel-state-split | La recherche dans une conversation interroge le serveur (2 caractères ou plus), trouve aussi les traductions et charge la suite |
| `ligne-avatar-gestes` | B | P1 | M | 600 | ligne-lentille-plate, actions-message-et-conversation-loi, liste-dialogues-confirmations, liste-decoupage-viewmodel, atomes-d-avatar-loi-humeur-et-non-lus | Toucher l'avatar d'une conversation ouvre la story ou le profil, le badge d'humeur ouvre la bulle de statut, un appui long ouvre le menu de l'avatar |
| `liste-appel-en-direct` | B | P1 | M | 550 | liste-decoupage-viewmodel, loi-sections-lentille, ligne-lentille-plate, ligne-apercu-rendu | Une conversation avec un appel en cours le dit sur sa rangée ('3 voix · depuis 5 min') et propose Rejoindre |
| `liste-barre-recherche-flottante` | B | P1 | M | 550 | liste-decoupage-ecran-jetons-lentille | Une barre de recherche flottante en verre se masque en défilant, s'illumine au focus et ouvre tableau de bord et recherche globale |
| `liste-entete-et-plateau-stories` | B | P1 | M | 650 | liste-decoupage-ecran-jetons-lentille, socle-points-d-extension-de-l-app, liste-virtualisee-entetes | L'en-tête 'Meeshy Chats' se replie au défilement et le plateau de stories défile avec la liste avant de se réduire en bande épinglée |
| `liste-filtres-composes` | B | P1 | M | 380 | liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille, conversation-etat-utilisateur-unifie | Les filtres de conversations se combinent (types en OU, états en ET) et se retirent d'un second appui |
| `liste-glisser-deposer` | B | P1 | M | 800 | liste-virtualisee-entetes, loi-sections-lentille, liste-decoupage-viewmodel | On glisse une conversation sur un en-tête de catégorie pour la ranger, ou sur 'Épinglées' pour l'épingler |
| `liste-pagination-pied` | B | P1 | M | 700 | liste-chargement-cache-first, liste-virtualisee-entetes, liste-decoupage-viewmodel | Le bas de la liste charge la suite des conversations et affiche son état: chargement, tout chargé, erreur avec Réessayer |
| `loi-resume-vivant` | B | P1 | M | 750 |  | Le Résumé vivant calcule sans réseau qui attend une réponse, les épisodes et les chiffres de la conversation |
| `modes-lecture-interface` | B | P1 | M | 750 | modes-lecture-preferences-et-drapeaux, liste-menu-actions-conversation, fil-rangee-plate-structure, chat-header-actions-cluster, composer-glass-shell | Chaque conversation choisit son mode de lecture (Focal, Script, Bulles, Résumé, Rivière) en auto ou à la main depuis le fil et le menu de la liste |
| `racine-banniere-notification-gestes` | B | P1 | M | 750 | apercu-conversation-donnees, routage-du-tap-notification, socle-points-d-extension-de-l-app | La bannière de notification se balaie vers le haut pour disparaître, un appui long ou un tirage vers le bas ouvre l'aperçu de la conversation |
| `racine-couches-globales` | B | P1 | M | 550 | socle-points-d-extension-de-l-app, pastille-synchro-globale-affichage, porte-mise-a-jour-obligatoire | Le fond de l'app, la pastille de synchro, la bannière d'appel et l'onboarding vivent dans un chrome global ordonné et peu coûteux |
| `racine-fiches-profil-partage` | B | P1 | M | 700 | socle-points-d-extension-de-l-app, racine-presentation-et-intentions, profile-own-page-split | Toucher une mention ou un avatar ouvre la fiche profil en feuille, et le partage et la création de conversation passent par des feuilles de la racine |
| `racine-flux-surcouche` | B | P1 | M | 600 | socle-points-d-extension-de-l-app, boutons-flottants-contre-les-bords, liste-entete-et-plateau-stories, feed-screen-split | Le Flux se superpose à la liste depuis le bas avec ses halos, son en-tête et son composeur |
| `racine-presentation-et-intentions` | B | P1 | M | 900 | socle-points-d-extension-de-l-app, racine-ouverture-conversation-par-id | L'app s'ouvre sur le bon écran sans clignotement, et un tap sur un push, une carte de lecture, un lien ou un raccourci ouvre la destination une seule fois |
| `resume-vivant-ecran` | B | P1 | M | 800 | loi-resume-vivant, modes-lecture-interface, fil-rangee-plate-structure | Le mode Résumé affiche 'Ils t'attendent', 'Ce qui s'est passé' et 'Ce qui va disparaître' avec un bouton Reprendre le fil |
| `fil-perspective-et-carte-focus` | B | P2 | L | 1450 | fil-rangee-plate-structure, loi-focale-perspective-focus, fil-chrome-defilement | Le fil se compacte autour du message élu, qui s'agrandit dans une carte de verre avec puce d'identité, drapeaux de langue, réactions et heure |
| `lentille-perspective-et-magnification` | B | P2 | L | 1700 | loi-focale-perspective-focus, ligne-lentille-plate, liste-virtualisee-entetes, modes-lecture-interface, loi-sections-lentille, liste-decoupage-viewmodel | Pendant le défilement, les rangées s'estompent autour d'une rangée élue qui se magnifie en place avec catégorie, étiquettes, mode de lecture et date complète |
| `liste-acces-rapides` | B | P2 | M | 450 | liste-etats-vides-squelette, liste-virtualisee-entetes, parrainage-liens-affilies, analytics-trackinglink-list | En queue de liste, une grille 'Et maintenant ?' propose message, story, mood, post, invitation, lien raccourci, contacts et affiliations |
| `liste-bande-communautes` | B | P2 | M | 650 | liste-barre-recherche-flottante, liste-chargement-cache-first, communautes-liste-et-fiche, liste-decoupage-viewmodel | Au focus de la recherche, une bande Communautés propose les cartes de ses communautés avec 'Voir tout' |
| `loi-riviere` | B | P2 | L | 1500 | loi-modes-de-lecture | La Rivière sait ranger une conversation en couloirs par voix, avec échelle de temps, pas de navigation et largeur de couloir |
| `racine-portes-stories-et-bulle-mood` | B | P2 | L | 1100 | racine-presentation-et-intentions, ligne-avatar-gestes | Mes stories, le lecteur de story, les composeurs et la bulle de mood s'ouvrent depuis n'importe quel écran sans doublon |
| `racine-reels-devoilement` | B | P2 | M | 450 | boutons-flottants-contre-les-bords, socle-points-d-extension-de-l-app | Les Réels s'ouvrent par un dévoilement circulaire depuis le bouton Flux et se referment en sens inverse |
| `riviere-bulles-rails` | B | P2 | L | 1800 | loi-riviere, modes-lecture-interface, fil-rangee-plate-structure | Dans la Rivière, chaque bulle suit le rail de sa voix et les réponses se relient par des arcs |
| `riviere-defilement-gestes` | B | P2 | L | 1600 | riviere-bulles-rails, composer-glass-shell | On parcourt la Rivière en glissant, en pinçant pour élargir les couloirs et en déplaçant l'axe du temps |

### Lots fusionnés ou retirés par l'architecture

- `racine-decoupage-navigation` → `socle-points-d-extension-de-l-app` (drop-duplicate) : Même découpage de MeeshyApp.kt (1202 l.) en Routes.kt + graphes par domaine ; un seul lot touche le fichier.
- `loi-pastille-synchro` → `etat-connexion-et-regles-pastille` (merge-into) : Même loi « un seul état qui dit ce qui se passe et nomme l'opération ».
- `synchro-pastille-et-bandeaux` → `pastille-synchro-globale-affichage` (merge-into) : Même pastille ; les deux bandeaux ambre (réglages et stories en attente) rejoignent l'affichage.
- `racine-garde-version` → `porte-mise-a-jour-obligatoire` (drop-duplicate) : Même écran de mise à jour obligatoire.
- `racine-navigation-notifications` → `routage-du-tap-notification` (merge-into) : Même routage du tap de notification ; NotificationNavigation.kt n'a qu'un propriétaire. Hérite : racine-ouverture-conversation-par-id, loi-liens-profonds, socle-points-d-extension-de-l-app.
- `tablette-liste-detail` → `coque-tablette-liste-detail-redimensionnable` (drop-duplicate) : Même coque tablette liste-détail. Hérite : liste-decoupage-ecran-jetons-lentille, ligne-lentille-plate.
- `tablette-clavier-largeur-multifenetre` → `raccourcis-clavier-et-survol-souris` (merge-into) : Mêmes raccourcis clavier et multi-fenêtre.
- `racine-boutons-flottants-echelle` → `boutons-flottants-contre-les-bords` (merge-into) : Mêmes deux boutons flottants ; l'échelle de menu rejoint FloatingChrome.kt.
- `modele-conversation-enrichi` → `liste-conversations-fil-complet-et-contrat-apercu` (merge-into) : Même ApiConversation complet ; Conversation.kt n'a qu'un propriétaire.
- `loi-apercu-composeur` → `conversation-apercu-compositeur-loi` (drop-duplicate) : Même loi d'aperçu de ligne (une seule, rejouant conversation-preview-cases.json).
- `loi-politique-actions-conversation` → `actions-message-et-conversation-loi` (merge-into) : Même loi d'actions (fixtures action-policy message + conversation).
- `racine-mini-lecteur-audio` → `mini-lecteur-audio-global` (drop-duplicate) : Même mini-lecteur global. Hérite : racine-couches-globales.

## Features

### La liste classe aussi par En direct, Aujourd'hui, Hier, Cette semaine, Plus ancien avec des stickers de section épinglés

`cl-lentille-sections-stickers` · Android : **absente** · P1 · effort M

Mode Lentille (actif par défaut depuis le 2026-09-14) : LentilleSectionResolver trie épinglées > en direct > catégories (id puis ordre) > récence (lastMessageAt ?? updatedAt) puis id, et crée les sections temporelles Aujourd'hui, Hier, Cette semaine, Plus ancien (identité propre préfixée « lentille. », jamais assignables, jamais repliables, jamais cibles de dépôt). Chaque en-tête est un LentilleSticker épinglé en haut (pinnedViews) : titre MAJUSCULES 10.5 pt heavy, letter-spacing 0.1 em, padding 4/13, fond backgroundSecondary, chevron et pastille de non-lus cachés seulement quand la section est repliable (épinglées, catégories). Le contenu démarre sous la hauteur d'accessoire de l'en-tête (safeAreaInset). La pilule de défilement SectionScrollPill existe mais n'est plus montée (doublon avec le sticker).

Écarts :
- Android ne produit que Épinglées / catégories / Toutes : porter LentilleSectionResolver (ordre de comparaison, buckets temporels sur calendrier local, section En direct réservée) dans core/model avec tests de parité de vecteurs.
- Sections temporelles non repliables, non assignables, non cibles de dépôt, avec libellés « Aujourd'hui / Hier / Cette semaine / Plus ancien » (casse normale en donnée, majuscules au rendu).
- LentilleSticker : en-tête épinglé (stickyHeader) 10.5 sp heavy, tracking 0.1 em, padding 4/13 dp, fond backgroundSecondary ; chevron + pastille de non-lus cachés uniquement sur les sections repliables.
- Réserve d'espace sous l'en-tête replié (accessoire de 60 dp) pour que le premier sticker s'épingle sous la bande de stories.
- Bascule de mode par le drapeau Lentille (liste Lentille vs liste classique) : voir cl-lentille-feature-flags.

Rendu : Sticker : texte 10.5 sp, poids heavy, interlettrage 0.1 em, couleur textSecondary, fond backgroundSecondary pleine largeur, hauteur ≈ 21 dp ; chevron.down/forward même taille ; libellés en majuscules.

Transposition Android : LazyVStack(pinnedViews: .sectionHeaders) -> LazyColumn avec stickyHeader.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Chrome/LentilleSectionIdentity.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Chrome/LentilleSticker.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+StickyHeaderInset.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionHeader.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSections.kt`

### Le Résumé vivant calcule sans réseau qui attend une réponse, les épisodes et les chiffres de la conversation

`cl-living-summary-engine` · Android : **absente** · P1 · effort M

Trois moteurs déterministes. DeterministicDigestBuilder : nombre de messages réels (hors système), de participants actifs, début/fin, top expéditeurs, langues, médias (images, vidéos, audios, fichiers, lieux, liens), et « awaiting you » = mentions non répondues, réponses directes à ses propres messages, questions (message finissant par ?) postérieures à son dernier message. EpisodeSegmenter : coupe sur un silence >6 h, un changement de jour ou un changement complet de locuteurs (≥4 messages), fusionne les groupes <4 messages, plafonne à 8 épisodes, titre « Aujourd'hui · N messages » avec libellés de jour (Aujourd'hui, Hier, Avant-hier). FaceRampRanking : score = 5×mentions + 3×réponses + 2×questions + recence (demi-vie 7 jours), tri décroissant puis nom. LivingSummaryAssembly assemble le tout depuis les messages en protégeant les contenus (vue unique, éphémère, flou, chiffré = texte vide).

Écarts :
- Port Kotlin pur (core/model ou feature/chat) de DeterministicDigestBuilder, EpisodeSegmenter, FaceRampRanking avec les mêmes constantes (gap 6 h, min 4, max 8, poids 5/3/2/1, demi-vie 7 j) et tests de vecteurs de parité avec iOS.
- Assemblage depuis les messages Room : exclusion des messages système, masquage du texte des messages protégés (vue unique, éphémère, flouté, chiffré), détection de mention @username insensible à la casse, comptage des liens suivis.
- Libellés de jour localisés (focal.summary.day.*) et titres d'épisode « jour · N messages » dans 4 langues.
- Indicateur de fenêtre complète (windowCoversUnread) pour afficher « Sur les N derniers messages ».

Rendu : Pas de rendu propre : alimente le Résumé vivant.

Transposition Android : Foundation Calendar -> java.time ; algorithmes purs testés en JVM.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Summary/DeterministicDigestBuilder.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/EpisodeSegmenter.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/FaceRampRanking.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/LivingSummaryAssembly.swift`

</details>

### Le mode Résumé affiche « Ils t'attendent », « Ce qui s'est passé » et « Ce qui va disparaître » avec un bouton Reprendre le fil

`cl-living-summary-screen` · Android : **absente** · P1 · effort M

LivingSummaryView : fond noir/blanc plein, en-tête « Résumé Vivant » (title3 heavy) + ligne « N messages · M personnes » + « Sur les N derniers messages » si la fenêtre est partielle (indigo500). Sections : « Ce qui va disparaître » (messages protégés avec puce de protection et brûlure animée ; flamme-œil après lecture), « Ils t'attendent » (rampe de visages : avatars 2× la taille focale, pastille de comptage indigo500, tap = répondre à la personne), « Ce qui s'est passé » (liste d'épisodes avec ✦ si titre d'agent, chevron, tap = ouvrir les messages de l'épisode), panneau « Vue d'ensemble de l'agent » (✦, contour pointillé indigo500, texte de ConversationAnalysis.summary récupéré en arrière-plan). Un squelette de 3 barres s'affiche tant que tout est vide. Bouton capsule indigo500 flottant « Reprendre le fil » qui retourne à la conversation.

Écarts :
- Écran Résumé vivant (Compose) branché sur le moteur déterministe : en-tête compteurs, protections, rampe de visages, épisodes, panneau agent, squelette, bouton « Reprendre le fil » flottant.
- Rampe de visages : avatars avec présence et anneau de profil, pastille de comptage, tap = ouvrir le champ de réponse sur le dernier message en attente de cette personne ; accessibilité « %@, %d messages t'attendent ».
- Liste d'épisodes : titre déterministe ou d'agent (✦), tap = revenir au fil et défiler au premier message de l'épisode.
- Enrichissement par l'agent : appeler ConversationAnalysisService (le fetchAnalysis/fetchStats existent côté chat via ConversationAnalysisViewModel) pour le texte de synthèse, sans bloquer l'affichage ; échec silencieux.
- Section « Ce qui va disparaître » : puces de protection (vue unique, éphémère avec compte à rebours, flou) + animation de brûlure.
- Chaînes focal.summary.* (header, ramp, episodes, protected, agent, resume_thread, skeleton) dans 4 langues.

Rendu : Fond plein (noir sombre / blanc clair), marges lg, espacement lg entre blocs ; titres de section subhead heavy à 0.9 d'opacité ; lignes d'épisode radius md avec fond 8 %/6 % ; panneau agent : contour pointillé 5/4 indigo500 ; bouton Reprendre le fil : capsule indigo500 pleine largeur body bold blanc, padding vertical md.

Transposition Android : StateObject -> ViewModel Hilt ; ScrollView + bouton flottant -> LazyColumn + Box overlay.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Summary/LivingSummaryView.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/LivingSummaryHost.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/LivingSummaryViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/FaceRampView.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/EpisodeListView.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/SummaryProtectionsView.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Summary/ConversationAnalysisProviding.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisViewModel.kt`

### Chaque conversation choisit son mode de lecture (Focal, Script, Bulles, Résumé, Rivière) en auto ou à la main

`cl-reading-mode-selector` · Android : **absente** · P1 · effort M

ReadingModeController décide à l'ouverture le mode via ReadingModeOrchestrator (non-lus, dernière ouverture, choix collant, capacités, drapeau) : drapeau OFF -> Script ; choix « Bulles » collant respecté ; ouverture sur un message précis ramène Résumé/Rivière à Script. ReadingModePreferenceStore persiste par conversation et par portée (clés meeshy_readmode_/meeshy_lastopen_). ReadingModeChip (capsule teintée de l'accent + préfixe AUTO si automatique) cycle Focal -> Script -> Bulles au tap et propose en appui long la liste complète (coche sur le mode courant, modes indisponibles grisés) + « Automatique ». La feuille Lens liste les 5 modes dans l'ordre Focal, Script, Bulles, Résumé, Rivière avec sous-titres (« Rangée vivante, mise en scène du présent », « Rangée plate, densité uniforme », « Les bulles classiques », « L'essentiel d'abord, la preuve à un tap », « Les couloirs de la conversation ») et la raison d'indisponibilité de la Rivière (« Jamais en conversation directe », « S'ouvrira à N personnes actives — M aujourd'hui »).

Écarts :
- Porter ReadingModeOrchestrator (SDK iOS) : modes, capacités (Rivière disponible selon nombre de personnes actives et type de conversation), décision d'ouverture, préférences (auto/focal/script/résumé/rivière/bulles) avec vecteurs de parité.
- Store de préférences par conversation et portée (DataStore) + horodatage de dernière ouverture.
- Chip de mode dans l'en-tête de conversation : capsule teintée accent 28 % + bordure 50 %, préfixe « AUTO », tap = cycle (Focal, Script, Bulles), appui long = menu (modes, désactivés si indisponibles, « Automatique »).
- Feuille Lens (5 modes, sous-titres, raisons d'indisponibilité de la Rivière avec seuils).
- Ouverture sur un message précis : Résumé et Rivière retombent sur Script.
- Tous les modes autres que Bulles dépendent de leurs rendus (Focal/Script hors de cette partie, Résumé et Rivière ci-dessous) : Android n'affiche que des bulles aujourd'hui.

Rendu : Chip : capsule, texte subhead semibold, préfixe AUTO micro heavy à 65 %, fond accent 28 %, bordure hairline accent 50 %, zone tactile 44 dp ; texte blanc en sombre, textPrimary en clair.

Transposition Android : UserDefaults -> DataStore ; Menu contextuel -> DropdownMenu sur appui long du chip.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Lens/ReadingModeChip.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Lens/ReadingModeLensSheet.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Preferences/ReadingModeController.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Preferences/ReadingModePreferenceStore.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift`

</details>

### Sur grand écran, la liste et la conversation s'affichent côte à côte avec la ligne ouverte mise en évidence

`cl-root-adaptive-tablet` · Android : **absente** · P1 · effort L

RootScopeSwitch choisit une mise en page compacte (pile) ou régulière (iPad/split view) selon la classe de taille, avec un RootScopeModels partagé (story, status, conversations, notifications, upgradeGate) créé une fois. En mode régulier la liste reçoit selectedConversationId (ligne ouverte teintée d'accent avec barre de tête), l'en-tête gagne le bouton Flux, la cloche de notifications avec badge et l'engrenage, la largeur de texte des lignes suit la colonne (min(0.42 × fenêtre, 520)), la navigation clavier est active et un glisser de ligne peut ouvrir une nouvelle fenêtre ; un signpost mesure les traversées de classe de taille.

Écarts :
- Aucune mise en page adaptative : introduire WindowSizeClass (Material3 adaptive) et un ListDetailPaneScaffold / SlidingPaneLayout pour tablettes et pliables (liste à gauche, conversation à droite, états au pliage).
- Paramètre selectedConversationId et rendu de la ligne sélectionnée (teinte d'accent + barre de tête).
- En-tête large : bouton Flux, cloche avec badge de non-lus, engrenage Réglages.
- Largeur de texte des lignes liée à la colonne (min(0.42 × largeur de fenêtre, 520) sans mesure, sinon largeur de colonne - 32).
- Portée partagée des ViewModels (story, statut, liste, notifications, garde de version) hissée au niveau racine pour survivre aux changements de configuration/pliage.
- Multi-fenêtre : ouvrir une conversation dans une fenêtre adjacente (FLAG_ACTIVITY_LAUNCH_ADJACENT) sur grand écran.

Rendu : Colonne de liste ≈ 42 % de la largeur (max 520 dp), ligne sélectionnée : fond accent 12-15 % + barre de tête 3 dp couleur d'accent.

Transposition Android : iPad/split view -> tablettes, pliables, ChromeOS (WindowSizeClass, ListDetailPaneScaffold) ; DetachedWindowOpener -> multi-instance / LAUNCH_ADJACENT.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootScopeSwitch.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootScopeModels.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### On glisse une conversation sur un en-tête de catégorie pour la ranger, ou sur « Épinglées » pour l'épingler

`cl-row-drag-to-section` · Android : **absente** · P1 · effort M

Deux chemins : (1) glisser-déposer iOS (onDrag/onDrop avec jeton) : dès que le doigt survole la liste, toutes les sections se replient pour ne laisser que les en-têtes ; l'en-tête d'origine prend la couleur primaire (0.22), l'en-tête survolé s'illumine (plus-circle, liseré) avec haptique légère ; au dépôt, ChipDropResolver choisit épingler (si pas déjà épinglée), déplacer (id de section, « other » -> vide) ou rien, avec haptique succès, puis les sections se rouvrent dans leur état d'avant (+ la cible). (2) « mode chip » depuis l'aperçu d'appui long : glisser la carte >140 pt la réduit en chip qui suit le doigt ; un auto-scroll (CADisplayLink, zone 130 pt, vitesse max 900 pt/s, pas borné à 1/20 s) fait défiler la liste près des bords ; le dépôt est ignoré pendant un auto-scroll. Les sections propres à la Lentille (temporelles) refusent le dépôt. Le glisser depuis iPad peut ouvrir une nouvelle fenêtre.

Écarts :
- Aucun glisser-déposer : seule la réaffectation par menu (reassignCategory / createCategoryAndAssign) existe ; ajouter dragAndDropSource (appui long sur la ligne) et dragAndDropTarget sur chaque en-tête (Compose 1.6+).
- Repli automatique de toutes les sections pendant le glisser, restauration de l'ensemble précédent au dépôt ou à l'annulation (+ cible dépliée).
- ChipDropResolver : épingler / déplacer / aucun, avec mapping « other » -> sectionId vide et blocage pendant l'auto-scroll.
- Auto-scroll aux bords (zone 130 dp, 900 dp/s max, pas ≤ 50 ms) piloté par un frame clock Compose.
- Surbrillance de l'en-tête d'origine (primaire 22 %) et de la cible (plus-circle, liseré, couleur de section), haptique légère à l'entrée, succès au dépôt.
- Refus du dépôt sur les sections temporelles / « En direct » ; glisser une conversation hors de l'app (ClipData) ou vers une fenêtre adjacente sur grand écran.

Rendu : En-tête cible : fond couleur de section 10-15 %, liseré 2 dp couleur de section 0.5, disque d'icône échelle 1.15, plus-circle title3 ; en-tête d'origine : fond brandPrimary 22 %.

Transposition Android : onDrag/onDrop (UIKit) -> Modifier.dragAndDropSource/dragAndDropTarget ; CADisplayLink -> withFrameNanos ; DetachedWindowOpener -> FLAG_ACTIVITY_LAUNCH_ADJACENT.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+DragDrop.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ChipDrag.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationCategoryReassignment.kt`

### Un long message se déplie et se replie sur place sans faire sauter le défilement

`clist-focal-long-message-expansion` · Android : **absente** · P1 · effort M

LongMessageExpansionLaw gère l'expansion des messages de plus de 360 caractères : un seul message déplié à la fois (nextExpanded), ancrage du bord haut à l'expansion et du bord bas au repliement avec décalage de défilement compensé et borné (anchoredOffset), animation de la hauteur sur 0,3 s avec la courbe (0,2 ; 0 ; 0 ; 1) (absente en reduce-motion), fenêtre de maintien de 0,65 s, bloc de verre qui épouse la bulle (+6 horizontal, +3 vertical), et atténuation des autres rangées (alpha 0,62) tant que l'expansion est visible. Mouvement de hauteur : translation et révélation selon l'épinglage (origine ou fin, liste inversée).

Écarts :
- Aucun dépliage de long message dans le fil Android ; ajouter extrait tronqué (360 caractères), « Lire la suite » / « Réduire » et valeur TalkBack Développé/Réduit avec action dédiée.
- Loi pure : nextExpanded(current, toggled), anchor(isExpanding), pin(for anchor, listIsInverted), heightMotion(before, after, pin), regionShift, alpha(isExpandedCell, expansionVisible), glassFrame.
- Compensation de l'offset de défilement (anchoredOffset borné) pour garder le bord ancré immobile ; animation de hauteur 0,3 s cubic-bezier(0,2 ; 0 ; 0 ; 1) ; aucun mouvement en reduce-motion ; fenêtre de maintien 0,65 s.
- Atténuer les autres rangées (alpha 0,62) pendant l'expansion et poser le bloc de verre autour du message déplié.

Rendu : Courbe de hauteur (0,2 ; 0 ; 0 ; 1), durée 0,3 s ; bloc de verre rayon 18 autour du message déplié.

Transposition Android : UIView.animate sur la hauteur de cellule -> animateContentSize + LazyListState.animateScrollBy compensé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Core/LongMessageExpansionLaw.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`

### Une conversation avec un appel en cours le dit sur sa rangée (« 3 voix · depuis 5 min ») et propose Rejoindre

`clist-lentille-row-live-call` · Android : **absente** · P1 · effort S

Quand un appel est en cours dans la conversation (ConversationLiveCall), la rangée remplace la pastille de non-lus par un badge : point d'accent qui pulse (0,9 s, échelle 1,3) et « N voix · depuis 5 min » (rafraîchi chaque minute) en couleur d'accent, puis un bouton « Rejoindre » en capsule d'accent sauf si l'utilisateur l'a déjà rejoint. L'aperçu masque alors son propre bouton Rejoindre pour ne pas dupliquer l'action. Sans appel, aucun rendu (zéro donnée fabriquée).

Écarts :
- Fournisseur d'appel en cours par conversation (équivalent ConversationLiveCallProviding : nombre de voix, startedAt, joined) alimenté par ActiveCallRepository et les événements d'appel.
- Badge de rangée : point d'accent pulsant (pas de pulsation en reduce-motion) + « %lld voix · depuis %@ » relatif court rafraîchi chaque minute.
- Bouton « Rejoindre » capsule d'accent (caption semibold blanc) absent quand joined ; libellé TalkBack « Appel en cours, toucher pour rejoindre » ; le tap lance la jonction sans ouvrir la conversation.
- L'aperçu passe onJoin = nil quand le badge est affiché.

Rendu : Point d'accent de 6 dp, texte Line2 en couleur d'accent, bouton capsule caption semibold blanc sur accent ; chaînes lentille.livecall.status.

Transposition Android : TimelineView(.periodic) -> LaunchedEffect + delay(60 s) ; join -> Telecom ConnectionService / écran d'appel existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/ActiveCallRepository.kt`

### Depuis la carte on peut rejoindre (anonyme ou avec son compte nommé), quitter après confirmation ou ouvrir la conversation, avec retour d'erreur clair

`clist-linkcard-actions` · Android : **absente** · P1 · effort M

ConversationLinkCardActionsRow affiche selon les actions résolues par la carte : lien expiré (« Lien expiré », icône horloge, aucun bouton), rejoindre (invite « Rejoindre ? » puis [Anonyme] \| [compte nommé]) côte à côte si ça tient et empilés sinon, ou [Quitter] \| [Ouvrir] pour un membre. Les boutons font au moins 44 pt, le primaire est un dégradé d'accent, le secondaire un contour accent (rouge pour Quitter) ; en cours, un spinner remplace l'icône et tous les boutons sont désactivés (« En cours… »). Le ViewModel est cache-first (carte déjà vue rendue dès la première image), rafraîchit en silence, applique la jonction/le départ de façon optimiste avec retour arrière et haptiques, et se périme quand une autre carte de la même conversation change.

Écarts :
- ConversationCardActions.resolve : none / join(identifier, allowsAnonymous) / leaveOrOpen(conversationId) à partir de la carte et de la cible.
- Rejoindre avec le compte : joinAuthenticated(linkId) -> carte mise à jour (membre), haptique légère puis succès, ouverture de la conversation ; échec : retour arrière et message (404 « Lien introuvable », 410 « Ce lien n'est plus actif », 403 « Accès refusé à cette conversation », sinon « Impossible de rejoindre la conversation »), haptique erreur.
- Bouton compte nommé : nom d'affichage sinon @pseudo, sinon « Mon compte » ; libellé TalkBack « Rejoindre avec le compte @pseudo » ; absent pour une session invitée.
- Rejoindre en anonyme : demande de session invitée (requestedGuestJoin) vers le flux GuestJoin existant.
- Quitter : dialogue de confirmation « Quitter cette conversation ? / Vous ne recevrez plus ses messages. », départ optimiste (la carte passe non-membre), retour arrière et « Impossible de quitter la conversation. » ; pour un lien direct, la carte devient privée après le départ.
- Phases/pending (none, joining, leaving), garde contre le double déclenchement, périmage croisé via ConversationCardChange, message d'erreur et haptiques ; libellés dans les quatre langues Android.

Rendu : Boutons 44 dp mini, rayon smPlus, icônes SF -> Material (person.crop.circle, theatermasks, arrow.up.forward, rectangle.portrait.and.arrow.right), erreur en rouge avec triangle d'alerte, police subhead bold.

Transposition Android : confirmationDialog -> AlertDialog ; HapticFeedback -> LocalHapticFeedback / HapticFeedbackConstants ; ViewThatFits -> FlowRow.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCardActionsRow.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCardViewModel.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationCardJoinAccount.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCardCopy.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinScreen.kt`

### La carte d'une conversation se charge depuis le cache puis se rafraîchit, et se périme quand on rejoint ou quitte depuis une autre carte

`clist-linkcard-service` · Android : **absente** · P1 · effort M

ConversationCardService résout une cible par GET /api/v1/links/:identifier/card (lien de partage ou d'invitation) ou GET /api/v1/conversations/:id/card (lien direct, membre seul), sans nouvelle tentative. Cache mémoire par cible : frais 60 s, périmé servi jusqu'à 24 h, jamais servi périmé quand c'est un « indisponible ». Verdicts définitifs : 403/404 sur un lien direct = conversation privée ; autres 4xx = indisponible ; échec réseau ou 5xx = repli sur le dernier instantané sinon indisponible. L'invalidation par conversation diffuse un ConversationCardChange(conversationId, origine) pour périmer les autres cartes de la même conversation (lien de partage et lien direct).

Écarts :
- Modèles ConversationCard {kind, conversationId?, title, description, avatarUrl, bannerUrl, conversationType, stats{memberCount, messageCount?, languages}, viewer, link{identifier, expiry}, inviter, inviteMessage} et ConversationCardResolution {card, privateConversation, unavailable}.
- Deux endpoints Retrofit sans retry ; décodage de l'enveloppe APIResponse.
- Cache en mémoire avec fresh 60 s / stale 24 h (CacheResult fresh/stale/expired/empty) et règle « indisponible jamais périmé ».
- definitiveVerdict(error, target) : 403/404 direct -> privée ; autre 4xx -> indisponible ; sinon repli snapshot.
- invalidate(conversationId, origin) qui purge toutes les entrées désignant la conversation et émet un flux ConversationCardChange consommé par les ViewModels de carte.

Transposition Android : NotificationCenter -> MutableSharedFlow ; OSAllocatedUnfairLock -> ConcurrentHashMap/Mutex ; CacheResult SWR existant côté Android.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationCardService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CachePolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CacheResult.kt`

### Un lien meeshy.me d'invitation ou de conversation dans un message devient une carte de conversation

`clist-linkcard-target` · Android : **absente** · P1 · effort S

ConversationLinkTarget traduit une URL en cible de carte sans table concurrente : il s'appuie sur DeepLinkParser, la seule table des formes de lien Meeshy. Reconnu : /join/<id> et /chat/<id> (lien de partage ou d'invitation, https://meeshy.me/… ou meeshy://…), /c/<id> et /conversation/<id> (lien direct, sans texte de brouillon). Jamais /l/<token> : un lien de suivi peut viser un post, un réel ou un site externe. Les raccourcis d'appareil (meeshy://contact, quickreply, send) en sont exclus.

Écarts :
- Fonction pure target(urlString, webOrigin) -> ConversationCardTarget? { shareLink(identifier), direct(conversationId) } réutilisant le parseur de deep links existant (pas de seconde table).
- Restreindre aux schémas http, https, meeshy ; refuser /l/<token> et les raccourcis widget/app ; origine web de l'environnement courant (staging vs prod).
- Brancher dans le rendu des messages : une URL qui désigne une conversation remplace l'aperçu de lien générique par la carte.

Transposition Android : URL(string) -> android.net.Uri / java.net.URI ; DeepLinkParser -> parseur existant de LaunchRouter/Routes.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkTarget.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Un lien d'invitation s'affiche comme une carte riche (bannière, avatar, effectifs, langues, citation de l'invitant) avec squelette et états privé ou expiré

`clist-linkcard-view` · Android : **absente** · P1 · effort M

ConversationLinkCard choisit selon la phase : repli sur l'aperçu de lien générique (indisponible), squelette (cache vide seulement : bannière de 72 pt teintée d'accent, trois barres, bloc de 44), carte, ou carte neutre « Conversation privée » avec cadenas. ConversationLinkCardBody dessine la bannière de 76 pt (image ou dégradé d'accent), l'avatar carré arrondi de 52 pt qui chevauche la bannière (bordure 3 pt, initiales des deux premiers mots en repli), le titre (heavy rounded, 2 lignes), la description (2 lignes), la rangée de statistiques (membres, messages, pastilles de langue 4 puis 2 puis 0 selon la largeur) et, pour un lien de partage, la citation de l'invitation (barre d'accent, avatar 28 pt, « … vous invite à rejoindre cette conversation », message du lien entre guillemets décoratifs). Un lien expiré passe en niveaux de gris, opacité 0,6, sans statistiques.

Écarts :
- Composable ConversationLinkCard à quatre phases (loading / card / privateConversation / unavailable -> LinkPreviewCard existant) piloté par le ViewModel de carte ; squelette uniquement sur cache vide.
- Corps de carte : bannière 76 dp (image avec dégradé accent -> accent 0,6 en repli), avatar 52 dp rayon md en chevauchement de -26 dp avec bordure 3 dp et initiales de repli, titre jusqu'à 2 lignes, description jusqu'à 2 lignes.
- Rangée de stats adaptative (membres, messages, pastilles de langue) qui retire d'abord les langues (4 -> 2 -> 0) quand la largeur ou la taille de police manque (équivalent ViewThatFits).
- Citation d'invitation : barre d'accent 3 dp, avatar 28 dp de l'invitant, texte « vous invite à rejoindre cette conversation », message du lien italique avec guillemet décoratif serif de 60 sp sur fond accent 8 % (16 % en sombre).
- Carte expirée : saturation 0, opacité 0,6, statistiques masquées ; carte privée : cadenas dans un disque de 40 dp, titre « Conversation privée », indice « Seuls ses membres peuvent la voir. ».
- Accent = DynamicColorGenerator.colorForName(conversationId ?? identifier ?? titre) ; carte arrondie lg, fond indigo950 fort (sombre) / blanc intense, contour indigo800 0,6 / indigo100 ; libellé TalkBack combiné « Conversation : <titre>. <description>. Membres : N. Messages : N. Langues : … ».

Rendu : Bannière 76, avatar 52 chevauchant de moitié, rayons smPlus (groupe) / lg (carte) / md (avatar), tokens indigo (950/900/800/300/100/50), titre bodySize heavy rounded, description subheadSize, espacements sm/xsPlus.

Transposition Android : CachedAsyncImage -> Coil AsyncImage ; ViewThatFits -> SubcomposeLayout/BoxWithConstraints ; redacted(.placeholder) -> MeeshySkeletonBox existant.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCard.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCardBody.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`

### L'app décide seule du mode de lecture d'une conversation (Script par défaut, Résumé après une longue absence) et respecte le choix de l'utilisateur

`clist-reading-mode-law` · Android : **absente** · P1 · effort M

ReadingModeOrchestrator est le miroir Swift de packages/shared/utils/reading-modes.ts : types de mode (focal, script, summary, river, bubbles) et de préférence (auto, focal, script, résumé, rivière, bulles) ; décision d'ouverture (drapeau éteint -> bulles ; choix collant clampé aux capacités ; plus de 25 non-lus -> résumé ; au moins 10 non-lus ET lecteur absent depuis plus de 24 h -> résumé ; sinon script) ; capacités (inscrit : focal + script + résumé ; anonyme : focal + script ; Rivière sélectionnable seulement avec son drapeau, au moins 5 participants actifs et jamais en conversation directe, avec raison vivante) ; niveau d'assistance (agent local, agent serveur, déterministe selon appareil, E2EE, consentement). LentilleReadingModeContext traduit une Conversation en entrées de la loi et calcule la décision d'ouverture et le mode d'atterrissage (résumé et rivière retombent en script quand on atterrit sur un message).

Écarts :
- Porter la loi pure (core/model) avec les constantes exactes : unreadCap 25, absenceUnreadFloor 10, absenceWindow 24 h, riverEligibilityThreshold 5 ; mêmes types et mêmes raisons (flag-disabled, sticky, unread-over-cap, stale-absence, clamped-unavailable, default) ; tests croisés avec la version TypeScript partagée.
- resolveCapabilities (identité inscrit/anonyme, drapeaux, type de conversation, participants actifs) et resolveAssistTier (E2EE -> déterministe).
- Traduction Conversation -> entrées de la loi : types group/community/channel/bot -> group, lastReadAt ≈ lastOpenedAt, memberCount comme compte actif.
- openingDecision / landing (résumé et rivière -> script en atterrissage sur un message) / previewMode ; drapeaux readingModes et riviere (actif par défaut côté iOS) et agent_grammar (inactif par défaut).

Rendu : Aucun rendu : le mode décidé choisit le renderer du fil (script par défaut).

Transposition Android : UserDefaults/ProcessInfo drapeaux -> DataStore + BuildConfig/remote config ; MeeshyFeatureFlags -> objet de drapeaux du module core.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Core/ReadingModeOrchestrator.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleReadingModeContext.swift`

</details>

### Une version trop ancienne affiche un écran de mise à jour plein écran sans issue

`clist-root-upgrade-gate` · Android : **absente** · P1 · effort S

La porte de rupture est un fullScreenCover posé en dernier dans la chaîne de la racine (donc le plus extérieur) dont le binding est constant : UpgradeGateController n'expose aucun moyen de repasser à nul, il n'existe donc aucun geste de fermeture. Tant que isBlocked est vrai, UpgradeGateView affiche l'exigence de version et recouvre feuilles et covers déjà montés. C'est la contrepartie client de la règle de rétrocompatibilité : une version minimale invite l'utilisateur à mettre à jour avant qu'un ancien chemin serveur soit retiré.

Écarts :
- Contrôleur de rupture (UpgradeGateController) alimenté par le contrat serveur de version minimale (lecture au démarrage et réaction à une réponse 426 ou à un en-tête dédié).
- Écran bloquant plein écran sans bouton fermer, BackHandler neutralisé, posé au-dessus de toute la navigation et des feuilles.
- CTA vers le Play Store (market:// avec repli https) ; en complément Play In-App Updates en mode IMMEDIATE.
- Tests : binding non réinitialisable, recouvrement des présentations déjà ouvertes, persistance de l'état bloqué après redémarrage tant que la version reste insuffisante.

Rendu : Écran plein écran sobre : marque, message, bouton principal « Mettre à jour » ; aucun élément de navigation.

Transposition Android : fullScreenCover constant -> composable racine bloquant ou Dialog(properties = DismissOnBackPress=false, DismissOnClickOutside=false) ; Play In-App Updates API.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift`

</details>

### Une pastille flottante discrète affiche en rotation les opérations en cours, l'état hors ligne et les amis qui écrivent

`clist-syncpill-capsule` · Android : **absente** · P1 · effort M

SyncPill est une capsule globale (22 pt au repos) qui liste chaque signal utile : connexion, opérations en file, travail bloqué, frappe d'amis dans des conversations communes. Elle affiche un point d'état pulsant (marque, ambre, vert, rouge) ou une icône, le libellé, des points d'activité « … » animés dans une place réservée, et un compteur « 2/5 ». Une entrée neuve l'affiche, six secondes de silence l'effacent ; un état persistant (hors ligne, reconnexion, échec) la garde. Elle prend la grande taille ×1,6 (35 pt) uniquement pour une frappe d'ami, avec un petit gonflement ×1,1 à l'arrivée d'une nouvelle frappe. Tap : relancer l'opération échouée > naviguer vers sa source > avancer la rotation ; appui long 0,5 s : pause/reprise (WCAG 2.2.2). Elle cède la place au viewer de story, aux notifications in-app et aux réels.

Écarts :
- Composable SyncPill global (overlay racine) à la place du bandeau plat ConnectionBannerStrip propre à la liste : capsule, ombre (rayon 6, y 2), fond blanc ou gris 0,17 en sombre, texte blanc 70 % / primaire 60 %.
- Entrées SyncPillEntry (id, libellé, icône, style de point brand/warning/success/error, source de navigation, showsActivityDots, retryOutboxId) et tapOutcome retry > navigate > advance ; l'orchestrateur ConnectionBanner iOS doit produire les entrées : hors ligne, reconnexion, synchronisation, entrée verte « En ligne » transitoire (4 s) au retour, frappes d'amis, éléments d'outbox.
- Pulsation du point toutes les 0,5 s (1,0 ↔ 0,4 ; pleine en reduce-motion) et points d'activité dans une place réservée à la largeur de « … » (pas de respiration de la capsule).
- Deux tailles (compacte 22 pt/11 pt, frappe 35 pt/corps) avec transition spring 0,3/0,85, gonflement ×1,1 à la première apparition d'une entrée de frappe (TypingAnnouncementLaw) puis retour programmé.
- Visibilité : une entrée neuve affiche, 6 s sans nouvelle entrée effacent, les états warning/error persistent ; transition fondu + échelle 0,85.
- Appui long 0,5 s pause/reprise de la rotation ET du marquee avec haptique légère, actions TalkBack « Mettre en pause / Reprendre », hints « Touchez pour réessayer / ouvrir l'emplacement ».
- SyncPillVisibility : masquer sous le viewer de story, une notification in-app et le lecteur de réels.

Rendu : Hauteur 22 pt (compact) / 35 pt (frappe), police footnote 11 medium / body ; padding horizontal smPlus / lg, vertical xs / sm ; largeur max du texte 160 / 220 ; compteur monospacedDigit en caption ; point 6 / 10 pt ; ne traverse pas les feuilles modales (assumé iOS).

Transposition Android : Capsule -> Surface(CircleShape) en overlay racine avec AnimatedVisibility ; TimelineView -> withFrameNanos ; Timer 0,5 s -> LaunchedEffect + delay ; onLongPressGesture -> combinedClickable ; accessibilityAction -> customActions.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`

### La pastille nomme l'opération en cours (Envoi d'image) ou son échec (Message non envoyé)

`clist-syncpill-labels` · Android : **absente** · P1 · effort S

SyncPillLabels dérive le libellé d'une opération en file de son genre et de son icône. Les lignes en attente ou en vol utilisent un verbe d'action (Envoi d'audio, d'image, de vidéo, de fichier, de sticker, de message ; Édition ; Suppression ; Envoi de réaction ; Publication de story, vidéo ; Envoi de commentaire, audio ; Réaction au post) ; les genres sans formulation dédiée ont un verbe propre (synchronisation des lus, des vues story, des lectures média, demande d'ami, réponse, blocage, déblocage, création et mise à jour de conversation, profil, réglages, publication de post, de réel, de mood, suppression de commentaire) avec « Synchronisation » en repli. Les lignes terminales se lisent comme un échec (« … non envoyé », « Échec de synchronisation ») et jamais comme un travail en cours.

Écarts :
- Table de libellés « en cours » par genre et icône, plus formulations par genre inconnu et repli « Synchronisation ».
- Table de libellés d'ÉCHEC (Message non envoyé, Édition non envoyée, Suppression non effectuée, Réaction non envoyée, Story non publiée, Commentaire non envoyé, Lus non synchronisés, Blocage non effectué, Conversation non créée, Profil non mis à jour, Réglages non enregistrés, Post/Réel/Mood non publié, Commentaire non supprimé, défaut Échec de synchronisation).
- Mapper les 22 OutboxKind Android (SEND_MESSAGE, EDIT/DELETE, ADD/REMOVE_REACTION, READ_RECEIPT, MARK_UNREAD, UPDATE_*…, PUBLISH_STORY, UPLOAD_MEDIA, BLOCK/UNBLOCK, SEND_FRIEND_REQUEST, PIN/UNPIN, LIKE/BOOKMARK) vers ces libellés et choisir une formulation pour ceux sans équivalent iOS.
- Ressources string dans les quatre langues Android (en, fr, es, pt) ; iOS en couvre sept.

Transposition Android : String(localized:) -> stringResource + plurals dans feature/conversations ou module app (la pureté du SDK interdit les chaînes dans core).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SyncPillLabels.swift`

</details>

### L'app sait dire en un seul état ce qui se passe (échec, hors ligne, synchronisation, rien) à partir de la file d'envoi

`clist-syncpill-state` · Android : **absente** · P1 · effort M

SyncPillViewModel combine l'instantané de l'outbox (éléments d'interface avec type, icône, statut, dates) et l'état hors ligne debouncé en un PillState unique, avec la priorité failed > offline > syncing > hidden. Une ligne en vol depuis plus de 4 s est traitée comme hors ligne même réseau OK. Les lignes terminales (failed, exhausted) périment par entrée après 60 s, via un réveil unique armé sur la péremption la plus proche (jamais un Timer permanent) : passé cette fenêtre, une ligne morte n'est plus un état mais un journal et sort du carrousel sans emporter le travail encore vivant.

Écarts :
- Projection d'interface de l'outbox (OutboxUIItem) : type, icône (audio, image, vidéo, fichier, sticker, texte), source de navigation (conversation, post, story), statut pending/inflight/failed/exhausted, createdAt, updatedAt ; Android n'a que OutboxEntity/OutboxKind (22 genres) et OutboxState PENDING/INFLIGHT/EXHAUSTED sans FAILED distinct.
- PillState {hidden, syncing, offline, failed} avec priorité failed > offline > syncing > hidden et fonction pure derive(items, isOffline, now).
- Seuil de 4 s pour une ligne en vol bloquée ⇒ état hors ligne ; fenêtre de 60 s de péremption par entrée terminale avec réveil unique sur la prochaine échéance (nextExpiry).
- Combinaison de OutboxDao.observeAll() et du flux réseau debouncé (NetworkConditionMonitor) sur le thread principal.
- Aujourd'hui Android ne connaît que l'état de la socket (HIDDEN/SYNCING/RECONNECTING/OFFLINE) et ignore la file d'envoi.

Rendu : Aucun rendu direct : le dot passe au rouge (failed), jaune (offline), marque (syncing).

Transposition Android : Combine.CombineLatest -> kotlinx.coroutines.flow.combine ; Task.sleep annulable -> delay dans un Job réarmé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/SyncPillViewModel.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/OutboxDao.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`

### La liste charge 100 conversations à la fois en défilant, sans boucle infinie ni rechargement complet

`clist-vm-pagination-cursor` · Android : **absente** · P1 · effort M

loadMore pagine par curseur (100 par page) quand on atteint le bas, avec un état de pagination (idle, loadingMore, exhausted, erreur avec message). ConversationListPaginationCursor choisit le curseur : nextCursor du serveur sinon l'identifiant (24 hexadécimaux) de la plus ancienne conversation locale. Une garde « zéro progrès » (curseur identique ou aucun nouvel id) force l'état épuisé et le persiste pour casser une boucle. ConversationListPersister enregistre liste, curseur et hasMore avec un debounce de 0,2 s (savePreservingFreshness, mise à jour qui préserve l'aperçu du dernier message).

Écarts :
- Pagination par curseur de 100 déclenchée au défilement (loadMore) avec PaginationState idle / loadingMore / exhausted / error(message) et réessai ; Android synchronise TOUTES les pages à chaque synchro (coût réseau O(n)) et compose les sections avec leurs lignes en une seule fois (liste non paresseuse).
- Curseur de repli = id serveur (24 hex) de la plus ancienne conversation locale ; garde « zéro progrès » forçant exhausted + persistance du curseur.
- Persister liste, curseur et hasMore avec debounce 0,2 s (Persister) en préservant l'aperçu du dernier message et la fraîcheur.
- Pied de liste : indicateur de chargement, fin de liste et erreur avec réessai ; LazyColumn avec items paresseux par section.

Rendu : Pied de liste discret : spinner pendant loadingMore, texte sobre sur erreur avec bouton réessayer.

Transposition Android : Task debounced -> Job annulable avec delay ; savePreservingFreshness -> transaction Room qui préserve updatedAt/lastMessage.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Loading.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListPaginationCursor.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListPersister.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### Les messages du haut de la liste et les stories récentes sont préchargés pour s'ouvrir sans attente

`clist-vm-prefetch-stories-messages` · Android : **absente** · P1 · effort M

ConversationListViewModel+Prefetch planifie le préchargement des messages des conversations du haut de la liste (cibles choisies par ConversationListMessagePrefetcher, propriétaire de session vérifié, rejoué après reconnexion et rechargement) et gère le retour au premier plan. +StoryPrefetch charge 30 groupes de stories en tâche détachée de priorité utilitaire : tous les médias des 3 premiers groupes puis 2 par groupe, images par lots de 8 puis vidéos par lots de 4 dans les stores d'images et de vidéos, annulable, et ne sauvegarde le cache stories que s'il est toujours périmé.

Écarts :
- Préchargement des messages du haut de liste (sélection de cibles, vérification du propriétaire de session via stillOwner, relance après reconnexion et après rechargement du cache).
- Préchargement des stories : 30 groupes, médias des 3 premiers groupes entiers puis 2 par groupe, images par lots de 8 puis vidéos par lots de 4, annulable, priorité basse, sauvegarde du cache seulement s'il est encore périmé ; déclenché au chargement, au forceRefresh et au retour au premier plan si le cache stories est périmé.
- Respecter l'économie de données (NetworkConditionMonitor / préférences de téléchargement automatique) avant de précharger des vidéos.

Rendu : Aucun rendu : effet visible = absence d'attente à l'ouverture d'une conversation ou d'une story.

Transposition Android : Task.detached(.utility) -> WorkManager expédié ou coroutine Dispatchers.IO ; ImageStore/VideoStore -> Coil ImageLoader.enqueue + Media3 SimpleCache préchauffé.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Prefetch.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+StoryPrefetch.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerPrefetch.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Liste Lentille, modes de lecture et Rivière s'activent par drapeaux avec interrupteurs dans les Réglages

`cl-lentille-feature-flags` · Android : **absente** · P2 · effort S

LentilleFeatureFlag résout trois drapeaux (lentilleList, readingModes, riviereMode) : surcharge de processus « 1 »/« 0 » (tests UI, TestFlight) > clé UserDefaults propre si elle a été écrite (dans les deux sens) > défaut ON (sorties de bêta du 2026-09-14). setEnabled écrit true plutôt que retirer la clé ; l'ancienne préférence « Activer les bêta » est supprimée au lancement. MeeshyFeatureFlags expose isReadingModesEnabled (délégué) et un drapeau agent_grammar (OFF par défaut, soumis à décision produit écrite, ne pas activer). Les interrupteurs vivent dans Réglages > Apparence.

Écarts :
- Registre de drapeaux (DataStore) avec résolution surcharge de build/debug > valeur utilisateur > défaut, pour lentilleList, readingModes, riviereMode, agentGrammar (OFF).
- Interrupteurs dans Réglages > Apparence (3 bascules) et suppression de l'ancienne préférence bêta si elle existe.
- Instantané de l'environnement lu une seule fois (éviter les allocations par rang et par passe de rendu).
- Conserver la règle : riviereMode n'a d'effet que si readingModes est actif.

Rendu : Trois lignes à bascule dans Réglages > Apparence avec libellé et sous-titre explicatif.

Transposition Android : UserDefaults + ProcessInfo -> DataStore Preferences + BuildConfig/Intent extras pour la surcharge de test.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleFeatureFlag.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift`

</details>

### Les rangs de la Lentille ont une perspective, une respiration de focus et une carte de focus avec raccourcis

`cl-lentille-row-focus-magnification` · Android : **absente** · P2 · effort L

Chaque rang Lentille (84 pt, padding 8/16, radius 16, marge 8/8) reçoit lentillePerspective (transform d'origine 0.16/0.5), lentilleFocusBreathing et lentilleFocusCandidate : pendant le défilement seulement, un élu de focus est calculé (LentilleFocusElectionHost) sur la ligne de lecture, le rang élu se magnifie en carte de focus (124 pt, rampe de respiration 36+40 pt, gain de loupe 0.04, anneau 1.5) montrant des raccourcis (déplacer vers une section, filtrer par étiquette, retirer une étiquette, voir les participants) ; au repos la scène revient à plat après restDelay (LentilleSceneActivity). Les utilisateurs anonymes n'ont pas les actions de catégorie. Cotes : avatar compact, présence 11/2.5, nom bodySize heavy, heure 12 bold, ligne 2 subhead regular, pastille non-lu 8, étiquettes 6 pt (max 3, emoji 11, chip 8), rang en sourdine 0.55 d'opacité, agent : anneau 1.5.

Écarts :
- Aucun mécanisme de focus/perspective : concevoir l'élection de l'élu à la ligne de lecture à partir de LazyListState.layoutInfo (sans recomposer la liste), la scène « active seulement en défilement » et le retour à plat après un délai de repos.
- Rang Lentille : mise en page 84 dp, transformation de perspective (graphicsLayer rotation/échelle autour de l'origine 0.16/0.5), respiration de focus et carte de focus 124 dp avec raccourcis (déplacer vers section, filtrer par étiquette, retirer étiquette, participants) ; actions de catégorie masquées pour les anonymes.
- Skeleton de rang Lentille (LentilleSkeletonRow) et marges de liste (8 dp) cohérentes avec les cotes LentilleMetrics.
- Reduce Motion : désactiver perspective et respiration.
- Les cotes LentilleMetrics doivent devenir des tokens centralisés (Row, Avatar, PresenceDot, Name, Time, Line2, UnreadDot, FocusCard, FocusInline, ModeNotch, Sticker, Pill, Rail, Tags, Muted, Agent) dans sdk-ui.
- Le rendu détaillé du rang (LentilleConversationRow) est hors de cette partie : à cadrer avec la partie qui le porte.

Rendu : Rang 84 dp, radius 16, marge h 8 / v 8, padding h 16 / v 8, nom body heavy, heure 12 bold, ligne 2 subhead regular, pastille non-lu 8 dp, étiquettes 6 dp / chip 8 sp (3 max), sourdine 55 % ; carte de focus 124 dp radius 16 anneau 1.5 dp nom 17 sp.

Transposition Android : lentillePerspective -> Modifier.graphicsLayer ; scroll offset relay sans recomposition -> State<Float> lu dans une lambda de dessin ; geometryReader registry -> onGloballyPositioned.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ScrollChrome.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionRows.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ReaderAnonymity.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationActivityHeat.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`

### Une conversation non lue résume ce que l'on a manqué (qui, combien, quels médias) et signale un appel en cours

`cl-lentille-unread-bridge-live-call` · Android : **absente** · P2 · effort M

Le « pont » (ConversationBridge) est la ligne de reprise d'une conversation non lue : LocalBridgeProvider le calcule depuis les messages en cache (auteurs distincts hors soi, 2 noms max + « et N autres », nombre de messages, médias images/audio/fichiers) via LentilleBridgeFormatter (clés lentille.bridge.authorsOne/Two/More, messagesOne/Other, media.images/audio/files, segments joints par « · »), avec suggestion de mode (focal si unread ≤ plafond de l'orchestrateur, sinon résumé) et indicateur de fenêtre incomplète ; GatewayBridgeProvider sert le pont calculé côté serveur (conversation.bridge). LocalLiveCallProvider mémorise les appels en cours par conversation (voix, début, rejoint) et notifie les abonnés.

Écarts :
- Modèles ConversationBridge / ConversationBridgeData / ConversationLiveCall dans core/model et lecture du champ conversation.bridge de l'API.
- Formateur de pont (pur, JVM) + chaînes plurielles localisées dans les 4 langues ; fournisseur local de repli depuis le cache Room.
- Suggestion de mode de lecture (focal / résumé) selon le nombre de non-lus.
- Registre des appels en cours par conversation (alimenté par les événements d'appel) pour la section « En direct » et le bouton Rejoindre.
- Affichage du pont dans le rang Lentille non lu (hors de cette partie, à brancher).

Rendu : Ligne secondaire du rang non lu : « Alice, Bob et 3 autres · 12 messages · 2 images, 1 audio » en subhead secondaire, une ligne tronquée.

Transposition Android : Protocols Swift -> interfaces Kotlin injectées par Hilt ; NSLock -> StateFlow/Mutex.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleProviders.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleBridgeFormatter.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Core/GatewayBridgeProvider.swift`

</details>

### Au clavier, flèches haut/bas déplacent un curseur sur les conversations, Entrée ouvre, Échap relâche

`cl-list-keyboard-navigation` · Android : **absente** · P2 · effort S

ConversationListKeyboardNavigation rend la liste focusable (iOS 17+) : ↓/↑ déplacent le curseur dans l'ordre visible des conversations (premier élément si aucun curseur), Entrée ouvre la conversation sous le curseur, Échap relâche. Le curseur est réconcilié quand la liste change. Un anneau d'accent (KeyboardCursorRing, bordure strong, radius lg) entoure la ligne et un ancrage UIKit la fait défiler dans la vue.

Écarts :
- Modificateur onKeyEvent sur la liste (DPAD/flèches, Enter, Escape) avec focusable() ; logique ConversationKeyboardCursor (moved/reconciled) portée en JVM pur.
- Anneau de curseur (bordure 2 dp couleur d'accent de la conversation, radius lg) non interactif et caché à l'accessibilité.
- Faire défiler la ligne sous le curseur dans la vue (animateScrollToItem / bringIntoView).
- Concerne tablettes, Chromebooks et claviers Bluetooth ; ignorer sur téléphone sans clavier.

Rendu : Anneau de 2-3 dp couleur accentColor de la conversation, coins arrondis lg (16 dp), par-dessus la ligne.

Transposition Android : onKeyPress -> Modifier.onPreviewKeyEvent ; scrollRectToVisible -> BringIntoViewRequester.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListKeyboardNavigation.swift`

</details>

### En queue de liste, une grille « Et maintenant ? » propose message, story, mood, post, invitation, lien raccourci, contacts, affiliations

`cl-list-quick-actions-tail` · Android : **absente** · P2 · effort M

ConversationListQuickActions affiche, sous le corps de la liste (ou à la place de l'état vide en Lentille), un titre (« Et maintenant ? » ou « Aucune conversation » si vide) + sous-titre, trois « héros » pleine largeur en dégradé (Chercher des membres à qui écrire, Voir mes contacts sur Meeshy, Voir mes affiliations) tant que la liste compte ≤10 conversations, puis une grille 3 colonnes de tuiles (Nouveau message, Créer une story, Poser un mood, Publier un post, Inviter des amis, Lien raccourci). Chaque tuile a un dégradé propre, une haptique (medium pour les héros, légère pour les tuiles) et route vers : peopleDiscovery, contacts, affiliate, création de conversation, StoryComposer, MoodComposerDoor, composeur du fil, AffiliateCreateView, CreateTrackingLinkView. Hauteur minimale = moitié de la fenêtre.

Écarts :
- Composable QuickActionsTail avec 9 actions, héros ≤10 conversations (heroThreshold) puis tuiles 3 colonnes, dégradés par action (indigo/success/shareAccent/purple/warning/info), haptiques et a11y (label = titre).
- Routage Android : findMembers -> contacts/discover, myContacts -> contacts, newMessage -> conversations/new, story -> story_composer, mood -> StatusComposerSheet, post -> FeedComposerSheet ; pas d'équivalent pour myAffiliates (écran Affiliation), invite (création d'affiliation) et shortcutLink (création de lien de suivi) : à créer dans leurs domaines.
- Titre/sous-titre localisés (conversations.quick.*) dans les 4 langues ; bascule du titre selon liste vide.
- Hauteur minimale = moitié de la fenêtre pour que la queue remplisse l'écran sur liste courte ; sinon séparateur de 60 dp.

Rendu : Héros : bouton pleine largeur radius lg, dégradé topLeading->bottomTrailing, ombre 8 dp teintée, icône 28 dp + titre callout bold 2 lignes + chevron. Tuile : fond backgroundSecondary radius lg avec bordure glass 1 dp, icône dans carré dégradé 44 dp radius 14, libellé small medium centré 2 lignes.

Transposition Android : LazyVGrid -> LazyVerticalGrid(GridCells.Fixed(3)) dans un item de pied de liste ; dégradés via Brush.linearGradient.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListQuickActions.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Tail.swift`

</details>

### Dans la Rivière, chaque bulle suit le rail de sa voix et les réponses se relient par des arcs

`cl-river-bubbles-canvas` · Android : **absente** · P2 · effort L

RiverBubbleView (équatable) dessine la bulle dans son couloir : contour RiverBubbleOutline à coins selon la position de groupe, rangée d'identité (avatar avec anneau de story et présence, nom borné à 44 %, heure), texte (emoji agrandi), aperçu de lien, cartes de contact, médias, transfert, citation de story, citation de réponse (ligne ou média cité via RiverQuotedMediaFace : miniature, poster vidéo, audio avec lecture sur place) avec tap = aller au message, puce de vue unique et contenu protégé (brûlure, capture bloquée), notice système en pleine largeur. Appui long = menu du message (haptique medium) ; actions d'accessibilité « Ouvrir dans le fil » et « réponse à… ». RiverLaneCanvas dessine derrière le contenu les rails de chaque voix et les connecteurs de réponse (arcs de bow ≥34) à partir des cadres mesurés des bulles, sans animation ; décoratif, caché à l'accessibilité. RiverRendering mémoïse contenus, bulles par rang et échelle de temps.

Écarts :
- Composable RiverBubble avec contour à coins par position de groupe, rangée d'identité, citation de réponse/média cité (miniature, poster vidéo, audio lisible sur place), transfert, citation de story, protections et vue unique, aperçu de lien, cartes de contact : réutiliser les atomes de MessageBubble.
- Canvas de rails et connecteurs de réponse tracés derrière le contenu à partir des cadres mesurés (onGloballyPositioned) ; coupure naturelle par les bulles opaques ; aucun tracé animé.
- Notice système pleine largeur ; appui long = menu du message ; actions TalkBack « Ouvrir dans le fil » et « en réponse à ».
- Mémoïsation du rendu (contenus par id, bulle par rang, échelle de temps) pour éviter les recompositions.
- Zone de capture bloquée / contenu protégé : FLAG_SECURE ciblé et rapport de capture.

Rendu : Trait 2.5 dp couleur de voix (DynamicColorGenerator.colorForName), bord de bulle à la même épaisseur que le rail (le bord EST un segment de la ligne), padding de contenu 14, rayon 14, connecteurs 1.4 dp ; en-tête de bulle : nom en couleur de voix, heure secondaire.

Transposition Android : Canvas SwiftUI -> Canvas/DrawScope Compose ; PreferenceKey de cadres -> map d'offsets remontée par onGloballyPositioned.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverLaneCanvas.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverQuotedMediaFace.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverRendering.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverCoordinateSpace.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### La Rivière range les messages en couloirs par voix, avec échelle de temps et navigation par pas

`cl-river-geometry-time-scale` · Android : **absente** · P2 · effort M

Noyau de la Rivière (mode de lecture « Les couloirs de la conversation », réservé aux conversations actives à plusieurs voix). RiverConversationMapping convertit les messages en géométrie (RiverLaneResolver du SDK) : couloir par voix avec le lecteur comme rive, rangs chronologiques, positions de groupe (solo/head/middle/tail), contenu de bulle (texte affiché, réponse citée, notice système, transfert, citation de story, protection, puce vue unique, aperçu de lien, cartes de contact, taille d'emoji), empreinte pour invalider, curseur initial/présent. RiverColumnPacking réutilise les colonnes de voix aux étendues disjointes quand le nombre de couloirs dépasse le maximum (rive du lecteur réservée). RiverColumnLayout calcule largeur de couloir, gouttière, abscisse du rail, largeur de contenu et décalage horizontal pour centrer un couloir. RiverTimeScale choisit l'unité (heure <36 h, jour <21 j, semaine <120 j, mois <730 j, sinon année), génère jusqu'à 8 graduations et convertit rang <-> fraction <-> libellé. RiverNavigationController gère le curseur (pas haut/bas/gauche/droite, rebond de bord). RiverModeGate vérifie la disponibilité du mode. Métriques : ligne 2.5, couloir 300 (210-540), gouttière 28, connecteurs 1.4 (arc min 34), pointillé 3/4.

Écarts :
- Port de RiverLaneResolver (SDK) : résolution des couloirs, rangs, curseur, pas de navigation (haut/bas/gauche/droite, raisons moved/edge), en-têtes de couloir avec alpha selon le rang de focus ; vecteurs de parité.
- Mapping messages -> RiverBubbleContent (réponse, système, transfert, story, protections, vue unique, lien, contacts, emoji) en s'appuyant sur le modèle de bulle Android existant (BubbleContentBuilder).
- Packing des colonnes quand les voix dépassent le maximum (rive du lecteur réservée) et RiverColumnLayout (rail, gouttière, centrage).
- RiverTimeScale avec calendrier/locale (libellés heure/jour/semaine/mois/année, max 8 graduations).
- Contrôleur de navigation (curseur, dernière raison, jeton de rebond de bord -> haptique).
- Garde de disponibilité de la Rivière (capacités du ReadingModeOrchestrator).

Rendu : Couloir de 300 dp (pincement 210-540), gouttière 28 dp, trait de rail 2.5 dp, rayon de détour 14, écart de base 8, connecteurs 1.4 dp avec arc min 34 dp, pointillés de continuation 3/4 dp, entre-rangs 14 dp.

Transposition Android : Calendar/Locale -> java.time + DateTimeFormatter ; ObservableObject -> StateFlow.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverConversationMapping.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverColumnPacking.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverColumnLayout.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverTimeScale.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverNavigationController.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverModeGate.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverMetrics.swift`

</details>

### On parcourt la Rivière en glissant, en pinçant pour élargir les couloirs et en déplaçant l'axe du temps

`cl-river-stream-gestures` · Android : **absente** · P2 · effort L

RiverConversationHost / RiverStreamHost : ScrollView bidirectionnel (horizontal + vertical) d'une grille de rangs × couloirs, atterrissage sur le curseur (au bas à l'ouverture ; ancré à 34 % de hauteur pour un saut vers une réponse ou un instant), pincement (MagnificationGesture) qui règle la largeur de couloir entre 210 et 540, glissement de 40 pt min pour faire un pas de curseur (haut/bas, gauche/droite inversé en RTL) avec haptique légère au bord, bandeau d'en-têtes de couloirs fixe (38 pt, nom en majuscules 11.5 semibold, « Toi » pour le lecteur, fondu selon le rang de focus) avec badges « N voix à gauche/droite » hors écran, poignée d'axe du temps (RiverTimeHandle) à droite apparaissant au défilement (fondu 0.2 s) et glissable pour sauter à un instant avec étiquette flottante et graduations, indicateur de frappe en capsule en bas, expansion d'un message long (loupe, atténuation), calcul de la zone lue pour le rapport de capture, retour au présent (onReachPresent) quand le curseur atteint le dernier rang. Transitions 0.35 s (0.18 s en Reduce Motion).

Écarts :
- Surface de défilement bidirectionnel Compose (scroll horizontal + vertical synchronisés) avec grille rangs × couloirs et atterrissage animé sur le curseur (0.35 s ; ancres 100 % au bas et 34 % pour les sauts).
- Geste de pincement (transformable) pour la largeur de couloir 210-540 dp ; geste de glissement ≥40 dp pour pas de curseur avec inversion RTL et haptique au bord.
- Bandeau d'en-têtes de couloirs 38 dp avec alpha par rang de focus et badges de voix hors écran.
- Poignée d'axe du temps : piste, graduations (max 8), étiquette flottante, glisser = saut, fondu 0.2 s, valeur d'accessibilité.
- Indicateur de frappe en capsule, ouverture de réponse (saut), expansion d'un message long, retour au présent, rapport de zone visible pour la capture.
- Reduce Motion : atterrissage en 0.18 s sans animation de rails.

Rendu : Poignée de temps à droite (capsule 'line.3.horizontal' avec ombre 4 dp), piste capsule 25 % de textMuted, graduations avec étiquettes 11 sp textMuted, étiquette flottante capsule fond secondaire 96 %. Bandeau de voix : point 7 dp + nom en majuscules couleur de voix.

Transposition Android : ScrollView([.horizontal,.vertical]) -> LazyColumn imbriquée dans un horizontalScroll ou 2D scrollable (Compose 1.7 TwoDScrollable) ; MagnificationGesture -> detectTransformGestures ; UIPanGestureRecognizer de poignée -> pointerInput drag.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverConversationHost.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverLaneHeaderStrip.swift`
- `apps/ios/Meeshy/Features/Main/Riviere/View/RiverTimeHandle.swift`

</details>

### Deux bandeaux ambre signalent les réglages et les stories en attente de synchronisation au retour en ligne

`cl-root-pending-banners` · Android : **absente** · P2 · effort S

RootPendingBanners empile en haut de l'écran (zIndex 189) : « Modifications en attente (N) — Synchronisation au retour en ligne » (file SettingsActionQueue, compteur en direct) et « Stories en attente (N) — Publication au retour en ligne » (StoryPublishService.pendingCount) ; capsules dégradées warning->amber500, texte indigo950, icône (arrows / photo.stack), ombre teintée, apparition ressort 0.4/0.8 par le haut ; le bandeau de stories se masque d'un glissement (≥15 pt) ou de l'action d'accessibilité « Masquer » et ne réapparaît que si le compte change.

Écarts :
- Bandeau « Modifications en attente (N) » alimenté par la file d'actions de réglages hors ligne (compteur observable) ; la file elle-même doit exister côté sdk-core.
- Bandeau « Stories en attente (N) » alimenté par les publications en file (PendingStoryPublish) ; aujourd'hui les stories en attente apparaissent seulement comme éléments optimistes du plateau.
- Geste de masquage (glissement ≥15 dp) + action TalkBack « Masquer », mémorisation du compteur masqué.
- Style : capsule dégradée warning->amber500, texte indigo950, ombre warning 0.4, transition depuis le haut.

Rendu : Capsule radius sm, padding h md+2 / v sm, texte subhead semibold indigo950 + légende caption à 72 %, dégradé horizontal warning->amber500, ombre moyenne, marge horizontale lg, décalage haut xxxl+lg.

Transposition Android : Overlay SwiftUI -> Composable en haut du Scaffold racine avec AnimatedVisibility(slideInVertically).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootPendingBanners.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`

### Au focus de la recherche, une bande Communautés propose les cartes de ses communautés avec « Voir tout »

`cl-search-communities-band` · Android : **absente** · P2 · effort M

Quand la recherche prend le focus avec une requête vide et que l'utilisateur appartient à des communautés, une bande ultraThinMaterial (radius xxl) apparaît au-dessus de la barre : titre « Communautés » en dégradé, « Voir tout » (liste des communautés), croix de fermeture (44 pt), puis un carrousel horizontal de ThemedCommunityCard (65x55 pt, bannière en cache + dégradé noir, nom 11 pt bold 2 lignes, rebond d'échelle 0.95 au tap, haptique légère) ouvrant le détail de la communauté. Les communautés sont chargées cache-first (stale-while-revalidate, 10 premières) en parallèle de la liste et rafraîchies au pull-to-refresh.

Écarts :
- Aucun module/écran Communautés sur Android : prérequis (liste, détail, modèle APICommunity, cache SWR) avant d'afficher la bande.
- Composable CommunityCard (bannière CachedBanner, dégradé, nom, rebond) et bande horizontale avec « Voir tout » + fermeture.
- Chargeur cache-first : afficher le cache frais/périmé immédiatement, revalider en arrière-plan, ne pas bloquer la liste sur l'échec.
- Loi d'affichage : bande montrée si focus ET requête vide ET communautés non vides ; transition opacité + déplacement bas.
- Accessibilité : en-tête de bande (heading), libellés « Voir toutes les communautés » / « Fermer les communautés », carte = « nom, N membres, M conversations ».

Rendu : Bande : radius xxl, ultraThinMaterial, bordure inputBorder, ombre 14 dp noire 0.1 ; cartes 65x55 dp radius sm, nom blanc 11 sp bold 6 dp de padding, dégradé bas noir 0.5.

Transposition Android : MeeshyCommunity -> modèle core/model ; CachedBannerImage -> AsyncImage Coil avec placeholder de couleur.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationSearchCommunitiesBand.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+CommunitiesLoader.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`

</details>

### Un message rédigé par un agent se reconnaît à son anneau pointillé et à son glyphe ✦ (fonction désactivée par défaut)

`clist-focal-agent-grammar` · Android : **absente** · P2 · effort S

AgentAuthoredStyle.resolve renvoie un descripteur (anneau pointillé indigo500 de 1,5 pt à tirets 4-3 autour de l'avatar, glyphe ✦ de 11 pt masqué à l'accessibilité) seulement si le drapeau agent_grammar est actif ET que le message est rédigé par un agent ; sinon le style humain. AgentAssistContracts définit les contrats d'assistance : AgentBridgeLine (texte + ids de messages preuves obligatoires, sinon la ligne n'existe pas), AgentSuggestion ancrée à un message, AgentShortcut (clé de titre, glyphe, charge), AgentAssistProviding (pont, suggestions, raccourcis, titres d'épisodes) ; NullAgentAssistProvider est le fournisseur par défaut qui ne renvoie rien.

Écarts :
- Descripteur AgentAuthoredStyle (anneau pointillé, étincelle) résolu par (isAgentAuthored, isAgentGrammarEnabled), jamais relu dans la vue.
- Modificateur d'anneau pointillé indigo500 (1,5 dp, dash 4-3) et glyphe ✦ de 11 sp heavy, caché à TalkBack ; drapeau agent_grammar désactivé par défaut.
- Contrats d'assistance : AgentBridgeLine (preuves obligatoires), AgentSuggestion, AgentShortcut, AgentAssistProviding et fournisseur nul ; niveaux localAgent / serverAgent / deterministic liés à clist-reading-mode-law.

Rendu : Anneau pointillé indigo500 de 1,5 dp autour de l'avatar de 22 dp ; glyphe ✦ indigo500 11 sp heavy.

Transposition Android : StrokeStyle(dash:) -> drawBehind avec PathEffect.dashPathEffect.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Agent/AgentAuthoredStyle.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/AgentAssistContracts.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Agent/NullAgentAssistProvider.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AgentAnalysis.kt`

### Le message au centre de l'attention s'agrandit dans une carte de verre avec puce d'identité, drapeaux de langue, réactions et heure

`clist-focal-focus-card` · Android : **absente** · P2 · effort M

FocalFocusChrome compose la carte du message élu : un bloc de verre (FocalGlassBlock, rayon 18) qui épouse la colonne du message ; la puce d'identité (avatar 26, nom 13,5, hauteur 34) au-dessus du contenu ; sous le contenu une bande : [détails de traduction] [drapeaux de langue, jusqu'à 5 en magnification, le actif plein] [ajouter une réaction 😊] [réactions, tap = basculer, appui long 0,4 s = qui a réagi] … [puce date + coches → infos du message]. Les puces font 24 pt (fond accent à 14 %/18 %, actif 34 %/42 %, rempli d'accent quand c'est ma réaction). L'heure de l'élu suit FocalFocusTimestamp (Aujourd'hui / Hier / Avant-hier / jour de semaine jusqu'à 6 jours, puis date abrégée, avec l'année si différente). Le contenu élu grossit (loupe jusqu'à 1,26) pendant que la carte et la bande gardent leur échelle ; un message long déplié garde un bloc de verre à ses marges.

Écarts :
- Bloc de verre (rayon 18) dont les marges épousent la colonne du message élu (électedCardFrame) et dont le bas suit la bande ; équivalent Android de adaptiveLiquidGlass (MeeshyGlassSurface existant).
- Puce d'identité de l'élu (avatar 26 dp, nom 13,5, hauteur 34) et bande de puces de 24 dp : détails de traduction, drapeaux (limite 5, actif en surbrillance), ajouter réaction, réactions avec tap = basculer / appui long 0,4 s = liste des réacteurs (haptiques légère/moyenne), puce date + coches -> infos du message.
- Opacités de puce : 0,14 clair / 0,18 sombre ; actif 0,34 / 0,42 ; rempli d'accent pour une réaction à moi.
- FocalFocusTimestamp.label / listLabel : Aujourd'hui, Hier, Avant-hier, jour de semaine complet de J-3 à J-6, puis « mar. 12 oct. · 14:32 » (+ année si différente), capitalisation selon la locale, fuseau du calendrier.
- Loupe du contenu élu (max +26 %) avec carte et bande à l'échelle d'origine ; rangée longue dépliée = bloc de verre à ses marges ; heure et coches de la colonne masquées pendant l'élection (largeur stable).

Rendu : Rayon de carte 18, marge électedCardMargin = 16-6 = 10, puces de 24 dp, puce d'identité de 34 dp ; couleurs d'accent de la conversation ; heure 10,5 semibold.

Transposition Android : adaptiveLiquidGlass -> MeeshyGlassSurface (Material blur) ; anchorPreference/overlayPreferenceValue -> onGloballyPositioned + Layout personnalisé pour mesurer le contenu élu.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalFocusChrome.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalGlassBlock.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusTimestamp.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyGlassSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`

### Le fil se compacte autour de l'élu (échelle et opacité décroissantes), l'élu se magnifie après un défilement soutenu et les détails n'apparaissent qu'à vitesse lente

`clist-focal-scroll-perspective` · Android : **absente** · P2 · effort M

FocalScrollPerspective porte la géométrie du fil : courbe « fil » (distance max 380, échelle -0,40·f, alpha -0,82·f avec plancher 0,62, pivot x 0,16), bande de focus à 150 pt avec hystérésis 95, compaction symétrique (au-dessus et en dessous du focus les rangées rétrécies se rapprochent par tirage cumulatif sans interstice, ancrage haut/bas, seules les rangées messages s'échelonnent), élection de l'élu, géométrie de l'élu (carte, puce d'identité, contenu, bande, débordement tactile) et passage ouvert autour de la carte magnifiée (voisins décalés de ±dégagement). FocalMagnificationLaw arme la magnification après 4 s de défilement soutenu ou une vitesse supérieure à 1 200 pt/s, puis reste armée jusqu'au redémarrage de la scène. FocalFocusDetailsMotionLaw n'affiche les détails que si la vitesse de défilement est inférieure ou égale à 700 pt/s (ScrollSpeedMeter, intervalle minimal 1 ms).

Écarts :
- Lois pures : focusCurve(thread), pose(distance, reduceMotion), focusY(visibleTop, visibleBottom, offsetFromBottom), poses(cells, focusY) à tirage cumulatif, focusedId avec hystérésis 95 ; constantes gelées (threadMaxDistance 380, scaleDecay 0,40, alphaDecay 0,82, alphaFloor 0,62, pivot 0,16, focusBandOffset 150).
- Géométrie de l'élu : electedGeometry(isFirstInGroup, cellHeight, contentScale), electionClearance, electionShift (voisins décalés au-dessus/dessous), electedTouchOverflow, loupeScale ; tests purs.
- FocalMagnificationLaw : armement après 4 000 ms de défilement soutenu OU vitesse >= 1 200 pt/s, état armé conservé, remise à zéro au redémarrage de la scène.
- ScrollSpeedMeter et FocalFocusDetailsMotionLaw (détails seulement si vitesse <= 700 pt/s).
- Application par cellule (graphicsLayer scale/alpha/translation) lue depuis LazyListState de la liste du fil ; désactivée en reduce-motion.

Rendu : Rangées lointaines plus petites et plus transparentes (alpha >= 0,62), tassées sans interstice ; l'élu seul est net, agrandi et encadré de verre.

Transposition Android : CALayer.transform/opacity par cellule UIKit -> Modifier.graphicsLayer par item ; CATransform3D pivot -> transformOrigin ; UIAccessibility.isReduceMotionEnabled -> animator duration scale.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalScrollPerspective.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusCurve.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusDetailsMotionLaw.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`

### Le « pont » ✦ d'une conversation non lue se formule dans la langue du lecteur (dormant sur iOS)

`clist-lentille-bridge-line` · Android : **absente** · P2 · effort S

LentilleBridgeLine formule un résumé « pendant votre absence » : texte de l'agent résolu par le prisme du lecteur (le texte original si sa langue est dans le prisme avant toute traduction, sinon la traduction du rang le plus haut, sinon le texte) ou repli déterministe via LentilleBridgeFormatter (« Alice et Bob · 12 messages · 3 photo(s) »), avec suffixe « sur les %d derniers messages » quand la fenêtre de calcul est incomplète. Couleur indigo400 pour l'agent. Cette ligne n'est plus montée dans la rangée depuis #7613 (la pastille chiffrée porte le non-lu), mais le pont reste une donnée de la conversation et bridge.suggestedMode alimente encore le libellé « AUTO · Résumé ».

Écarts :
- Modèle ConversationBridge {kind agent|fallback, text, translations, originalLanguage, data{messageCount, auteurs, médias}, isComplete, suggestedMode} dans core/model et champ bridge de la conversation (alimenté par GatewayBridgeProvider).
- resolvePhrase / resolveAgentText selon le prisme du lecteur (rang d'origine avant traduction, jamais translations.first) et formatter déterministe localisé (authorsOne/Two/More, messagesOne/Other, images/audio/fichiers).
- Suffixe partiel « sur les %d derniers messages » et libellé TalkBack combiné ; à ne monter dans la rangée que si une décision produit le ramène (dormant sur iOS).

Rendu : Ligne unique Line2, couleur secondaire (ou indigo400 pour l'agent), suffixe en couleur muette.

Transposition Android : LentilleBridgeTranslator -> stringResource formatés ; prisme -> LanguageResolver existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleBridgeLine.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`

### La rangée la plus proche de la bande de focus est élue de façon stable, sans clignoter entre deux voisines

`clist-lentille-focus-election` · Android : **absente** · P2 · effort S

LentilleFocusCandidateRegistry mémorise le milieu global de chaque rang (enregistré à chaque layout, retiré à la disparition). LentilleFocusElectionHost élit le rang le plus proche de la bande de focus à chaque défilement avec une hystérésis (le courant gagne tant qu'il reste à moins de 45 pt) et une marge de bascule égale à la moitié de la hauteur d'un rang (le challenger doit gagner au moins 42 pt de proximité) ; les égalités se départagent par id. LentilleFocusElection ne notifie que si l'id change, et l'hôte est transparent aux touches.

Écarts :
- Registre des candidats (id -> midY) alimenté par onGloballyPositioned de chaque item visible ; désenregistrement à la disparition.
- electFocusRow(candidates, focusY, currentId, hysteresis 45) + holdingCurrent(margin = hauteur de rang / 2) ; tri déterministe par id sur égalité.
- Store d'élu observable qui ne publie que sur changement d'id ; recalcul à chaque variation d'offset (focusY dépend du défilement).
- Tests purs (aucune dépendance Compose) pour l'hystérésis et la marge de bascule.

Transposition Android : GeometryReader/onGeometryChange -> onGloballyPositioned ; ObservableObject -> StateFlow.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElection.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElectionHost.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusCurve.swift`

</details>

### La rangée élue se magnifie en place : catégorie et tags actionnables, aperçu sur deux lignes, mode de lecture, effectif et date complète

`clist-lentille-magnification` · Android : **absente** · P2 · effort M

Quand la scène est active et que la rangée est élue, LentilleConversationRow reçoit une LentilleMagnification et se rend magnifiée sans devenir une autre vue (aucune bordure, aucun fond) : hauteur 100 pt ; une ligne AU-DESSUS du titre avec la pastille de catégorie actionnable (menu des catégories + « Retirer de la catégorie », « Classer » si aucune) puis les étiquettes nommées (capsules colorées, 3 max + « +N », menu « Conversations avec ce tag » / « Retirer le filtre » / « Supprimer ce tag », liseré blanc si filtre actif) ; aperçu sur 2 lignes ; ligne de date avec la pastille du mode de lecture, la puce d'effectif (ouvre les participants, hors direct) et la date complète (« Lundi à 17:36 »). Les lignes de puces ne défilent horizontalement que si elles débordent. Les voisines respirent (±8 pt) et la rangée gonfle de 4 %, désactivé en reduce-motion. Tous les gestes de la rangée (swipes, glisser-déposer, appui long) restent actifs.

Écarts :
- Contexte LentilleMagnification (catégories, filtre de tag actif, callbacks déplacer/filtrer/retirer, participants, now) et rendu identique testé par rendersIdentically.
- LentilleMagnifiedTopLine : pastille de catégorie en menu (icône de la catégorie, couleur de la catégorie, « Classer » sinon, « Retirer de la catégorie »), puces de tags (menu filtre/retrait, liseré blanc 1,5 dp si filtre actif, max 3 + « +N »). Android a seulement un menu contextuel d'appui long.
- Date complète via FocalFocusTimestamp.listLabel avec mots localisés (Aujourd'hui, Hier, Avant-hier, « à ») et jours de semaine/dates abrégées.
- LentilleWholeChipsLine : défilement horizontal uniquement si contenu > largeur + 0,5.
- Respiration : push des voisines de ±8 dp (rampe 36 -> 76 dp) et loupe 4 % bornée par la marge, désactivée en reduce-motion ; animation easeInOut 0,25 s à l'élection.
- Porte d'élection LentilleMagnifiableRow : magnifiée seulement si le niveau de scène > 0 ET le rang est l'élu.

Rendu : Hauteur 100 dp (84 + 2×8) ; puces police 8 sp black, padding 6/2, fond accent 16 % ; mode pill 9,5 sp black ; catégorie teintée de sa couleur ; loupe max +4 % ; aucun cadre ni fond.

Transposition Android : Menu SwiftUI -> DropdownMenu ancré à la puce ; visualEffect -> graphicsLayer ; équivalent de ViewThatFits/ScrollView horizontal -> Row + horizontalScroll conditionnel.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleMagnification.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleFocusBreathing.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleWholeChipsLine.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationCategoryReassignment.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagsEditor.kt`

### La date des rangées n'apparaît qu'en défilant et s'efface 0,9 s après l'arrêt

`clist-lentille-meta-reveal` · Android : **absente** · P2 · effort S

LentilleRowMetaReveal masque la méta (date, marque de streak) des rangées au repos : elle apparaît en fondu 0,18 s dès le défilement et reste révélée 0,9 s (ScrollTimePillLaw.lingerMs) après le dernier mouvement. À l'ouverture de l'écran, elle se révèle une fois quand la première rangée s'affiche (armOpening / noteRowShown). La rangée magnifiée la montre toujours (alwaysVisible). Pas de fondu en reduce-motion.

Écarts :
- État partagé isRevealed avec noteScroll, armOpening, noteRowShown et masquage différé de 0,9 s.
- Composable LentilleRowMetaFade (opacité animée 0,18 s, alwaysVisible, sans animation en reduce-motion).
- Brancher noteScroll sur l'état de défilement de la liste ; révélation initiale à l'ouverture.

Rendu : Fondu de 0,18 s ; la date à droite sous la ligne 2 est invisible au repos.

Transposition Android : ObservableObject partagé -> StateFlow dans un holder injecté ; fondu -> animateFloatAsState.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleSceneActivity.swift`

</details>

### Pendant le défilement, les rangées s'estompent et rétrécissent avec la distance à la bande de focus, puis la liste redevient plate au repos

`clist-lentille-perspective-scroll` · Android : **absente** · P2 · effort M

LentillePerspective applique à chaque rang une opacité et une échelle (origine x 0,16, y 0,5) calculées sur sa distance à la bande de focus : courbe « liste » (distance max 400, alpha -0,45·f, échelle -0,10·f, plus un fondu additionnel jusqu'à -0,35 sous la bande, sur 160 pt). La bande de focus glisse du haut vers le centre du viewport selon l'offset. LentilleSceneActivity porte un niveau 0→1 : monté en 0,25 s (easeOut) au premier défilement, il retombe à 0 en 0,45 s après 4,5 s de repos, de sorte que la liste est plate au repos et que la perspective n'existe que pendant le geste. Désactivée en reduce-motion (pose identité).

Écarts :
- Loi pure focusCurve(distance, variant list|thread) avec les constantes gelées (listMaxDistance 400, listAlphaDecay 0,45, listScaleDecay 0,10, listBelowBandDistance 160, listBelowBandAlphaCap 0,35) + tests.
- LentilleFocusBand.centerY(viewportTop, viewportBottom, offsetFromTop) : bande qui descend du haut jusqu'au milieu du viewport.
- LentilleSceneActivity : level animé 0->1 en 0,25 s au premier défilement, flatten après 4,5 s de repos en 0,45 s, fusion blend(result, level).
- Application par rang via graphicsLayer (alpha, scaleX/Y, transformOrigin 0,16/0,5) lue depuis LazyListState.layoutInfo sans recomposer tout le rang.
- Désactivation en reduce-motion (pose identité).

Rendu : Aucune bordure ni couleur : seulement opacité et échelle ; origine de transformation à 16 % de la largeur ; durées 0,25 / 0,45 s, repos 4,5 s.

Transposition Android : visualEffect + ScrollOffsetRelay -> Modifier.graphicsLayer { } avec derivedStateOf sur LazyListState ; withAnimation -> animateFloatAsState.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentillePerspective.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleSceneActivity.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusCurve.swift`

</details>

### Un menu « Mode de lecture » (Auto, Focal, Script, Bulles, Résumé, Rivière) se choisit par conversation depuis la rangée ou l'appui long

`clist-reading-mode-menu` · Android : **absente** · P2 · effort M

LentilleModePill affiche « AUTO · Focal » (ou le nom du mode forcé) comme puce actionnable de la rangée magnifiée ; LentilleReadingModeSubmenu offre le sous-menu « Mode de lecture » (icône œil) du menu d'appui long. Entrées dans l'ordre Auto 🪄, Focal, Script, Bulles, Résumé, Rivière, la coche ✓ sur le choix courant, les modes indisponibles désactivés selon les capacités et la Rivière désactivée affichant sa raison vivante (« jamais en conversation directe » ou « s'ouvrira à 5 personnes actives — 3 aujourd'hui »). La préférence est stockée par conversation et par identité du lecteur (inscrit ou anonyme) dans LentilleScopedReadingModePreferenceStore (écriture optimiste, abonnement par conversation) : UNE préférence partagée par la rangée, le sous-menu, le fil et l'aperçu.

Écarts :
- Modèle de menu LentilleModeMenuModel (entrées, icônes, sélection, désactivation, raison) + libellés localisés (lentille.mode.name.*, notch « AUTO · %@ », raisons Rivière avec seuil et compte courant).
- Pastille de mode (Menu actionnable) sur la rangée magnifiée et sous-menu « Mode de lecture » dans le menu contextuel de la rangée.
- Magasin de préférences par conversation et par identité (scope inscrit/anonyme) avec get/set optimiste et onChange par conversation ; persistance DataStore.
- Accessibilité : « <mode>, <raison>, sélectionné » ; le pont peut suggérer Résumé ou Focal dans le libellé AUTO.

Rendu : Puce capsule de la couleur d'accent à 16 % d'opacité, police 9,5 sp black ; icônes viewfinder, text.alignleft, bubble.left.and.bubble.right, sparkles, water.waves -> équivalents Material.

Transposition Android : Menu SwiftUI -> DropdownMenu/ModalBottomSheet ; UserDefaults par scope -> DataStore Preferences.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleModeMenu.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleModeLabels.swift`
- `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleReadingModeContext.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`

### La bulle de mood s'affiche une seule fois à la racine et republier un mood ouvre son composeur

`clist-root-status-bubble-layer` · Android : **absente** · P2 · effort M

RootStatusBubbleLayer est l'hôte unique de la bulle de mood pour toute la fenêtre : posée plus bas, chaque hôte frère rendait sa propre bulle décalée dans son repère. La bulle est un popover contextuel qui se ferme à toute navigation (jeton = chemin du routeur). Republier un mood ouvre MoodComposerDoor dans une feuille moyenne/grande avec la graine (emoji, texte, @viaUsername, audio) et l'origine repost(sourceFormat: status).

Écarts :
- Contrôleur de bulle de mood (StatusBubbleController) avec entrée courante, ancrage au point touché sur le badge mood d'un avatar et fermeture sur changement de route.
- Hôte unique dans le repère de la fenêtre racine ; les présentations modales gardent leur propre pose (l'overlay racine est invisible sous elles).
- Republication d'un mood : feuille moyenne/grande avec graine emoji/texte/via/audio et origine repost de format status.
- Android affiche déjà l'emoji de mood sur l'avatar de la rangée mais sans bulle ni geste.

Rendu : Bulle ancrée au badge, flèche vers l'avatar ; disparaît dès qu'on navigue.

Transposition Android : Popover SwiftUI -> Popup/overlay Compose ancré aux coordonnées du badge (onGloballyPositioned).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationMoodStatus.kt`

### Les modèles du Résumé vivant décrivent épisodes, effectifs, médias et choses en attente de réponse avec leurs preuves

`clist-summary-digest-models` · Android : **absente** · P2 · effort S

LivingSummaryModels définit les types déterministes du Résumé : messages d'entrée d'épisode et de digest (genre de média, nombre de liens, mention du lecteur), participants de digest, ConversationEpisode (début/fin, ids, titre déterministe + titre d'agent éventuel), SenderTally, LanguageTally, MediaTally, AwaitingItem (mention, réponse directe, question sans réponse ; preuves obligatoires) et DeterministicConversationDigest (isComplete). Le constructeur de digest, le segmenteur d'épisodes et les écrans du Résumé sont hors de ce lot.

Écarts :
- Porter les modèles dans core/model (EpisodeInputMessage, DigestInputMessage, DigestParticipant, ConversationEpisode, SenderTally, LanguageTally, MediaTally, AwaitingItem avec preuves non vides, DeterministicConversationDigest) ; Android n'a que des projections d'analyse serveur.
- Garantir l'usage hors ligne et en E2EE (digest local déterministe, jamais le serveur), complété plus tard par le DeterministicDigestBuilder et EpisodeSegmenter (partie 1).

Transposition Android : struct Equatable/Sendable -> data class immuables (kotlinx.serialization non requise).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Core/LivingSummaryModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationAnalysisProjection.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisSheet.kt`

### La pastille se pose juste au-dessus du chrome du bas et du clavier sans jamais recouvrir la barre de composition

`clist-syncpill-dock-placement` · Android : **absente** · P2 · effort S

SyncPillPlacement calcule le bord bas (le plus grand de la hauteur du clavier et de la zone sûre) plus la hauteur du chrome amarré plus 8 pt. SyncPillDockClaims garde une pile de réclamations par identifiant, hauteur arrondie au demi-point, le dernier réclamant gagnant ; un chrome s'amarre soit par mesure (hauteur lue + décalage), soit par déclaration, et relâche à sa disparition. La bande se monte une fois à la racine avec animation spring 0,3/0,8 ; la barre de composition d'une conversation porte la pastille.

Écarts :
- Modèle SyncPillDockClaims (réclamations par id, arrondi au 0,5, dernier gagnant) avec claim/release testables.
- Calcul keyboardAwareEdge / bottomFromScreenEdge / dockedHeight (mesure et déclaration) à partir de WindowInsets.ime et navigationBars.
- Modificateurs d'amarrage mesuré et déclaré pour la barre de composition, la barre d'onglets et tout chrome bas, relâchés à la disparition.
- Animation de la bande 0,3/0,8 quand la hauteur amarrée change.

Rendu : Écart de 8 pt entre la pastille et le chrome ; spring 0,3/0,8 lors des changements.

Transposition Android : GeometryReader/onAppear -> onGloballyPositioned + CompositionLocal d'un SyncPillDock ; clavier -> WindowInsets.ime.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SyncPillPlacement.swift`

</details>

### La pastille fait défiler ses entrées toutes les 2,7 s et fait défiler un libellé trop long sans jamais le figer de travers

`clist-syncpill-rotation-marquee` · Android : **absente** · P2 · effort S

SyncPillRotator avance d'une entrée toutes les 2,7 s, se met en pause 5 s après un geste manuel (avancer/reculer), s'arrête à une entrée ou moins, rebascule l'index quand la liste rétrécit et peut être gelée par l'utilisateur. SyncPillMarquee décide du défilement d'un libellé plus large que 160/220 pt : mesure sur le libellé seul (jamais avec les points animés, qui feraient osciller la décision), vitesse constante de 40 pt/s, écart de 24 pt, première passe depuis la position de repos, passes suivantes depuis le bord droit. Le décalage est une loi pure du temps écoulé : la pause fige l'écoulé sans jamais remettre à zéro.

Écarts :
- Rotator pur : currentIndex, setItemCount, setAutoRotation, advance, rewind, simulateTick avec horloge injectée, pause de 5 s après action manuelle, timer annulé si count <= 1.
- Marquee pur : shouldScroll(textWidth > availableWidth strict), scrollDuration (plancher 1 s), gap 24, offset(elapsed, textWidth, availableWidth) avec première passe puis tours depuis le bord droit.
- Désactivé en reduce-motion ; redémarrage à zéro quand l'entrée visible change même si deux libellés consécutifs défilent tous deux.
- Tests purs pour chaque loi (aucune dépendance Compose).

Rendu : Défilement horizontal clippé dans une largeur de 160 pt (220 en grande taille), 40 pt/s.

Transposition Android : Timer.publish -> ticker Flow / LaunchedEffect(delay) ; TimelineView(.animation) -> withFrameNanos plafonné à 30 images/s.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift`
- `apps/ios/Meeshy/Features/Main/Components/SyncPillMarquee.swift`

</details>

### Une conversation qui remonte en tête glisse avec un ressort, mais jamais pendant un défilement ni en mouvement réduit

`clist-vm-reorder-motion` · Android : **absente** · P2 · effort S

ConversationListReorderMotion anime le ré-ordonnancement uniquement pour un « bump to top » (la tête change, même effectif, le reste inchangé) avec un ressort de 0,35 s et un amortissement de 0,86. L'animation est coupée pendant un défilement (dernier tic de scroll depuis moins de 0,3 s) et quand le mouvement est réduit (réglage système ou forcé par l'utilisateur). ConversationListOrderMemory garde l'ordre précédent.

Écarts :
- Loi pure isBumpToTop(previous, current), isScrolling(lastTick, now) et animation(reduceMotion, isScrolling) ; constantes response 0,35, damping 0,86, scrollSettleInterval 0,3.
- Appliquer Modifier.animateItem(placementSpec = spring(...)) de LazyColumn seulement pour un bump et jamais pendant le défilement ni en reduce-motion (y compris reduce-motion forcé dans les réglages Meeshy).
- Mémoire de l'ordre précédent pour détecter le bump.

Rendu : Ressort 0,35 s / amortissement 0,86, déplacement vertical de la rangée vers le haut.

Transposition Android : withAnimation spring sur un tableau d'ids -> animateItem + spring(dampingRatio = 0,86, stiffness dérivée de 0,35 s).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListReorderMotion.swift`

</details>

### Balayer une ligne révèle trois actions à gauche (épingler, silence, verrou) et trois à droite (archiver, lu/non lu, masquer)

`cl-row-swipe-actions` · Android : **divergente** · P0 · effort M

SwipeableRow expose deux jeux d'actions. Glissement vers la droite : Épingler/Désépingler (pinnedBlue), Silence/Réactiver (neutral500), Verrouiller/Déverrouiller (warning ; ouvre la feuille de verrou, ou alerte « code maître requis » sans code maître). Glissement vers la gauche : Archiver/Désarchiver (warning ; Désarchiver retiré si l'archivage est imposé), Marquer lu/non lu (indigo400), Masquer (error ; ouvre la confirmation de suppression). Les icônes de swipe participent à l'égalité Equatable de la ligne.

Écarts :
- Android utilise SwipeToDismissBox avec UNE action par sens (épingler / archiver) qui se déclenche puis revient ; reproduire le panneau d'actions révélées (3 boutons de 72 dp par côté, icône + libellé, couleurs ci-contre) avec anchoredDraggable et ouverture partielle persistante.
- Actions manquantes : silence, verrou (avec garde « code maître requis »), marquer lu/non lu, masquer (confirmation).
- Règle isArchiveImposed : masquer « Désarchiver ».
- Tap sur une action referme le panneau et applique l'action en optimiste ; tap ailleurs referme.
- Accessibilité : actions exposées comme customActions TalkBack.

Rendu : Boutons plein-hauteur de ligne, icône 22 dp blanche + libellé caption2, rayon aligné à la ligne (16 dp), couleurs : pin #pinnedBlue, mute #neutral500, lock/archive #warning, mark-read #indigo400, hide #error.

Transposition Android : SwipeableRow -> anchoredDraggable (Compose Foundation) avec fond d'actions ; haptique sur ouverture.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SwipeActions.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`

### Le fil se lit en rangées plates sans bulles (Script par défaut, Focal), avec identité de groupe, colonne d'heure et coches révélées au défilement

`clist-focal-flat-message-row` · Android : **divergente** · P0 · effort L

Le mode de lecture par défaut du fil iOS est Script (aussi le repli quand le drapeau est éteint) : le fil n'affiche pas de bulles mais des rangées plates FocalRow à deux densités (focal, script). Chaque rangée a un padding vertical de 3 et horizontal de 16 (+8 en tête de groupe), un contenu indenté de 29 pt, un texte en corps body à interligne 1,42 et une colonne méta de 62 pt à droite (heure de 10,5 pt, coches de livraison, indicateur « modifié ») dont les détails ne se révèlent que pendant et juste après le défilement. L'en-tête d'identité (tête de groupe) montre l'avatar de 22 pt (story, mood, présence, ici, décor, anneau pointillé d'agent), le nom (« Toi » en indigo pour soi) et ouvre le profil. Le contenu enchaîne badges (épinglé, transféré, protection), citation, grille visuelle, audio, non-média, texte/emoji/sticker de 140 pt, aperçu de lien, ligne basse conditionnelle (drapeaux de langue + réactions) et bande de reprise d'un envoi échoué.

Écarts :
- Créer le second rendu du fil : FocalRow (densités focal et script) choisi par un mux selon la décision de mode de lecture (script par défaut), en gardant les bulles comme mode « Bulles » ; Android ne rend aujourd'hui que des bulles.
- Gabarit : padding vertical 3 / horizontal 16, tête de groupe +8, indent de contenu 29, corps body à interligne 1,42, colonne méta réservée de 62 avec espacement 6, rangée en haut-gauche même avec hauteur estimée.
- Colonne méta : heure de 10,5 sp, coches de livraison, mention « modifié » / édition en cours / historique d'édition ; heure et coches révélées uniquement pendant et après le défilement (fondu 0,28 s) ; tap sur les coches = détails de lecture.
- En-tête d'identité de tête de groupe : avatar 22 dp avec anneau de story, mood, présence, ici, décor de profil, anneau pointillé d'agent ; nom subhead heavy (« Toi » en indigo500 pour soi) ; tap = profil, tap mood = bulle.
- Ordre du contenu : badges (épinglé, transféré, protection) AU-DESSUS de l'identité, citation, grille visuelle, audio, non-média, texte/emoji/sticker 140, aperçu de lien, ligne basse conditionnelle (jamais réservée si vide), bande de reprise 72×28 pour un envoi échoué.
- États : optimiste -> opacité 0,7 ; éphémère expiré -> vide ; destruction animée ; vue unique (chip) ; capture protégée (annoncée ou noire) ; RTL ; effets de message appliqués au bloc contenu seulement.
- Accessibilité : 1 rangée = 1 élément (libellé composé par MessageAccessibilityLabelComposer, valeur Développé/Réduit, actions citation et déplier).
- FocalRowInput : valeur stable à primitives uniquement + PreviewContext réutilisé par l'aperçu d'appui long (#11208) ; rangée « Début de la conversation avec <nom> » + jour du premier message.

Rendu : Aucune bulle, aucun fond de message ; avatar 22, nom subhead heavy, heure 10,5 semibold atténuée à 55 %, texte body, interligne x1,42 ; colonne méta de 62 à droite ; espacements verticaux serrés (3) et séparation de groupe par 8 ; couleurs de rail et d'accent issues de la conversation.

Transposition Android : UICollectionView/SwiftUI hybrid avec cellules rangées -> LazyColumn avec items stables (@Immutable FocalRowInput) ; Equatable wrapper -> clés et skipping Compose ; layoutDirection -> LocalLayoutDirection.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalRow.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalRowInput.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalMetrics.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalMetaColumn.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalMetaRow.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalConversationStartRow.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/EquatableFocalRow.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageGrouping.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Chaque conversation est une rangée plate de 84 pt sans carte, avec anneau d'accent, emoji épinglé/muet/favori et ligne de frappe, brouillon ou aperçu

`clist-lentille-flat-row` · Android : **divergente** · P0 · effort M

Avec le drapeau Lentille (actif par défaut), la liste iOS n'utilise plus la carte de verre : LentilleConversationRow est un rang plat de 84 pt, sans fond ni bordure ni ombre, avatar de 44 pt entouré d'un anneau d'accent, trois lignes (nom avec 📌 🔕 emoji favori et points de tags puis pastille de non-lus ; aperçu ; date à droite). La ligne 2 suit la précédence frappe en cours > brouillon > aperçu ; un contact qui écrit force le point de présence au vert. Sourdine : opacité 0,55 ; glisser-déposer : échelle 1,02 ; ligne sélectionnée (tablette) : barre d'accent latérale. L'accessibilité combine la rangée en bouton avec le libellé complet et les points d'engagement.

Écarts :
- Remplacer la carte MeeshyGlassSurface avec dégradé de chaleur et marges par un rang PLAT de 84 dp (padding horizontal 16, vertical 8), sans fond, bordure ni ombre ; seule la rangée élue (magnification) a un traitement distinct.
- Avatar 44 dp (contexte conversationHeaderCollapsed) entouré d'un anneau d'accent de 1,5 dp à 55 % d'opacité, anneau de story, badge mood, point de présence de 11 dp (bord 2,5) ; Android : avatar 48 dp sans anneau d'accent.
- Trois lignes : (1) 📌 + nom (body heavy) + 🔕 + emoji favori + points de tags de 6 dp (max 3) puis pastille de non-lus ; (2) ligne d'aperçu ; (3) date à droite (12 sp bold, gris atténué, relative courte). Android utilise des icônes Material pour épingle/sourdine, n'affiche pas l'emoji favori et place l'heure dans une colonne à droite.
- Ligne 2 : frappe en cours (italique accent « X écrit… » + trois points de 5 dp pulsant avec délai de 0,18 s) > brouillon (« Brouillon : » en rouge + texte) > aperçu (1 ligne, ou 2 si magnifié) ; un contact qui écrit force le point de présence au vert.
- Sourdine -> opacité 0,55 de toute la rangée ; glisser-déposer -> échelle 1,02 et opacité 0,8 ; rangée sélectionnée -> barre d'accent de 3 dp à gauche, jamais un fond.
- Pastille de non-lus chiffrée « 99+ » (le pont ✦ ne remplace plus l'aperçu, décision #7613) ; Android utilise Badge capé à 99 sans plus.
- Accessibilité : un seul élément bouton (libellé complet + points d'engagement parlés), hint « ouvre la conversation », trait sélectionné ; points d'engagement et marque de streak (hors magnification) à ajouter.
- Stabilité Compose (@Immutable, clés stables, champs dérivés mémorisés) équivalente à l'égalité structurelle Equatable du rang.

Rendu : Rang 84 dp ; avatar 44 ; nom MeeshyFont.bodySize heavy ; ligne 2 subheadSize regular ; date 12 bold ; accent = palette de la conversation (displayPalette(isDark).primary) ; textes primaire/secondaire/muet via les tokens de thème ; aucun fond de carte.

Transposition Android : Equatable + .equatable() -> @Stable/@Immutable + clés LazyColumn stables ; accessibilityElement(.combine) -> semantics(mergeDescendants = true).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationActivityHeat.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRowPreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRowTime.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`

### Un appui long sur une conversation ouvre un aperçu flouté (bannière, derniers messages) au-dessus d'un menu animé

`cl-row-longpress-peek-overlay` · Android : **divergente** · P1 · effort L

Appui long de 0.4 s (rebond d'échelle 0.97 à l'appui, ressort 0.55/0.25 au déclenchement, haptique medium) sur la ligne (hors zone avatar). iOS 26 : contextMenu natif avec aperçu ConversationPreviewView (largeur bornée 240-340). Sinon : overlay plein écran ultraThinMaterial + voile 15 % ; la carte d'aperçu ÉMERGE depuis la position de la ligne (courbe 0.5/0/0.15/1.3 sur 0.55 s), puis le menu glisse depuis +70 pt avec flou 6. La carte montre bannière ou dégradé d'accent, avatar (story, humeur, présence), nom (2 lignes), épingle/silence, cadenas E2EE, badge non-lus dégradé, nombre de membres, boutons verre Appeler/Rechercher/Infos (menu Infos/Profil en direct) et les messages récents (120-300 pt) rendus avec le skin de la conversation (ConversationRecentMessagesPreview, fond d'ambiance, états chargement/vide, traductions Prisme). Gestes : glisser la carte vers le haut la replie (échelle -> 0), glisser vers le bas >110 pt ferme, glisser >140 pt passe en « mode chip » (carte réduite à 55 %, menu qui s'estompe) pour déposer sur un en-tête de section (voir cl-row-drag-to-section). Les 20 premiers rangs préchargent leur aperçu (prefetch), l'ouverture force un refresh. Respect de Reduce Motion (fondu 0.18 s).

Écarts :
- Android ouvre un DropdownMenu avec un titre et des lignes de texte (ConversationPreviewCard) : remplacer par un overlay plein écran flouté (RenderEffect/blur) avec carte d'aperçu complète (bannière, avatar, indicateurs, boutons verre Appeler/Rechercher/Infos, messages récents en mini-bulles avec skin de conversation).
- Animation d'émergence depuis la ligne (position source mesurée, échelle 0.22-0.7, timingCurve overshoot 0.55 s) et sortie ressort 0.32/0.78 ; menu qui glisse (+70 dp, flou 6) ; variante Reduce Motion (fondu 0.18 s).
- Gestes sur la carte : glisser vers le haut = replier, vers le bas >110 dp = fermer, >140 dp = mode chip (voir cl-row-drag-to-section) ; tap sur la carte ouvre la conversation, tap hors carte ferme.
- Lois de largeur : carte 240-340 dp (ConversationPreviewWidthLaw), largeur de texte de ligne = colonne - chrome (32+52+28+24) avec min 120 (ConversationRowWidthLaw).
- Préchargement des aperçus des 20 premières lignes (prefetch) + refresh à l'ouverture + empreinte (previewFingerprint) pour invalider ; états chargement/vide.
- Rebond d'échelle de la ligne à l'appui (0.97) et haptique medium au déclenchement ; action TalkBack « Ouvrir le menu ».
- Mise en évidence de la ligne sélectionnée (tablette).

Rendu : Carte : radius xl, bordure dégradé accent->secondaire 1 dp, ombre 20 dp teintée accent, en-tête 16 dp padding avec bannière (dégradé noir 0->strong) ou dégradé d'accent 8-15 %, fond de messages dégradé surface + deux halos flous accent/secondaire. Overlay : voile noir 15 % sur flou.

Transposition Android : contextMenu avec aperçu iOS 26 -> overlay Compose plein écran (Dialog/Popup) + Modifier.blur ; émergence -> animate*AsState avec position mesurée par onGloballyPositioned.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationPreviewWidthLaw.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationRowWidthLaw.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPreviewMessages.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`

### Pendant le défilement du fil, une pilule « Aujourd'hui · 14:32 » indique le jour et l'heure du message sous le doigt

`clist-focal-scroll-time-pill` · Android : **divergente** · P1 · effort S

ScrollTimePillState/Overlay affichent, en haut du fil (72 pt), une capsule en matière fine avec liseré indigo, texte subhead semibold indigo, qui indique le jour et l'heure (« Aujourd'hui · 14:32 ») du message en cours de survol. Elle est visible tant que moins de 900 ms se sont écoulées depuis le dernier défilement (ScrollTimePillLaw), masquée quand l'en-tête est déployé, non interactive et cachée à l'accessibilité, avec fondu de 0,28 s et garde d'égalité contre une publication par image. FocalTimestampRevealState partage la même loi pour révéler l'heure (10,5 pt) et les coches de livraison de chaque rangée.

Écarts :
- Android affiche une pastille de JOUR collante (PinnedDayHeader) sans heure ; ajouter l'heure du message survolé (« jour · heure ») via un formateur ScrollTimePillLabelFormatter (Aujourd'hui, Hier, Avant-hier, jour).
- Loi pure ScrollTimePillLaw (lingerMs 900, reduce scrolled/tick, isVisible) et état observable avec garde d'égalité ; masquage quand l'en-tête de conversation est déployé.
- Capsule matière fine + liseré indigo (indigo200/700, bordure indigo900/200), padding md/xs, fondu 0,28 s, positionnée à 72 dp du haut, non interactive.
- Partager la loi avec la révélation d'heure et de coches des rangées (FocalTimestampRevealState, FocalRevealedDetail/FocalRevealedTime).

Rendu : Pilule centrée en haut à 72 dp, texte subhead semibold, couleurs indigo (200 sombre / 700 clair), liseré fin, apparition en fondu 0,28 s.

Transposition Android : Material blur/scrim pour ultraThinMaterial ; ScrollActivityEvent -> flux d'événements de LazyListState.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Chrome/ScrollTimePillOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Chrome/ScrollTimePillState.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/ScrollTimePillLaw.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Chrome/FocalTimestampRevealState.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/PinnedDayHeader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/time/RelativeTime.kt`

### La liste affiche un squelette animé, un vide propre, « aucun résultat » ou une erreur de synchronisation avec Réessayer

`cl-list-empty-states` · Android : **partielle** · P0 · effort S

Quatre branches (ConversationListEmptyBranch) : skeleton (6 rangs, apparition échelonnée de 0.04 s), searchNoResults (icône loupe + « Aucun résultat » / « Essayez d'autres termes », compact en Lentille, padding haut 60), syncError (icône flèches + titre/sous-titre/bouton « Réessayer » qui force un refresh), createFirstConversation (icône bulles + CTA « Nouvelle conversation » ; remplacé par la grille d'accès rapides en Lentille). Règle anti-flash : tant que le regroupement attend le corpus (groupingAwaitsCorpus) on garde le squelette. L'emporte toujours le cache : jamais de spinner si le cache a des données.

Écarts :
- Squelette : 6 rangs avec apparition échelonnée (0.04 s par index) et forme de rang Lentille (LentilleSkeletonRow) ; Android affiche 8 rangs statiques.
- Règle groupingAwaitsCorpus : conserver le squelette tant que le corpus est non vide mais le regroupement n'a pas encore produit de sections (évite le flash « vide »).
- Distinguer « recherche sans résultat » (searchText non vide) de « filtre sans résultat » avec les chaînes search.no_results / search.try_other_terms.
- État vide à froid : CTA « Nouvelle conversation » (non Lentille) ou grille d'accès rapides (Lentille) — Android n'a aucun CTA.
- État erreur : titre conversations.error.title + sous-titre + bouton Réessayer qui appelle forceRefresh() ; transition d'opacité entre branches.

Rendu : Icône 48-64 dp teinte indigo300, titre callout semibold, sous-titre subhead secondaire, bouton plein indigo500 ; padding top 60 dp ; mode compact en Lentille (icône plus petite, moins d'espace).

Transposition Android : EmptyStateView -> Composable EmptyStateCard existant ; staggeredAppear -> AnimatedVisibility avec delay par index.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+EmptyState.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionRules.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListContent.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/EmptyStateVisual.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`

### Les conversations sont groupées en sections repliables (Épinglées, catégories, Mes conversations) avec mémoire de l'état

`cl-list-sections-collapsible` · Android : **partielle** · P0 · effort M

iOS rend la liste dans un LazyVStack de Section : épinglées, catégories utilisateur, puis « Mes conversations ». L'en-tête (SectionHeaderView) montre un disque d'icône coloré avec halo flouté quand la section est dépliée, le nom, une capsule de compte, une pastille de non-lus cachés quand la section est repliée, et un chevron qui pivote de 90°. Un appui déclenche un petit rebond (spring 0.25/0.6), une haptique légère et un repli en ressort 0.3/0.8 ; les lignes entrent avec opacité + échelle 0.95 ancrée en haut + décalage -8. Au premier affichage seules « Épinglées » et « Mes conversations » sont dépliées (ConversationListSectionMemory, mémoire de session) ; les catégories utilisateur suivent leur drapeau serveur isExpanded et persistent leur état (persistCategoryExpansion). Quand « Mes conversations » est la seule section, aucun en-tête n'est dessiné. Le chargement de la suite est déclenché à 5 lignes de la fin.

Écarts :
- Virtualisation : Android compose toutes les lignes d'une section dans UN SEUL item de LazyColumn (section.items.forEach { row(it) }) ; passer à un item par ligne (items(key = conversation.id)) avec stickyHeader par section, sinon scroll/mémoire dégradés au-delà de ~100 conversations.
- Ensemble déplié par défaut : iOS n'ouvre que Épinglées + Mes conversations (+ catégories dont isExpanded = true) ; Android ouvre tout (initiallyExpanded = true).
- Mémoire de l'état déplié/replié entre navigations (équivalent de ConversationListSectionMemory) : Android utilise rememberSaveable local à l'item, perdu au recyclage ; ajouter un état hissé dans le ViewModel.
- Persistance serveur de l'état replié des catégories utilisateur (persistCategoryExpansion) absente.
- Pastille de non-lus cachés (somme des unreadCount de la section) sur l'en-tête replié + valeur d'accessibilité « Réduite, N non lus ».
- Aucun en-tête quand la seule section est « Mes conversations » (isSingleUngroupedSection).
- Couleur et icône propres à chaque catégorie (section.color/icon) au lieu de trois couleurs par genre ; halo flouté quand déplié, fond teinté faint, capsule de compte teintée de la couleur de section.
- Animations : rebond de tap (échelle 1.2 du disque, 1.1 de la capsule), ressort 0.3/0.8 du repli, transition d'entrée/sortie des lignes (opacité + échelle 0.95 en haut + décalage -8), haptique légère.
- Chevron directionnel qui suit le sens de lecture (chevron.forward, 90° quand déplié) au lieu d'une flèche bas.
- État « cible de dépôt » de l'en-tête (liseré 2 pt, fond teinté, plus-circle) pour le glisser-déposer (voir cl-row-drag-to-section).
- Espacement : 8 pt entre sections, xsPlus entre lignes, marge horizontale 8 pt (LentilleMetrics.Row.marginHorizontal).

Rendu : En-tête : disque 28-32 dp teinté couleur de section (alpha 0.25 sombre / 0.18 clair), halo flouté 0.15 si déplié, nom en subheadline semibold (indigo50 sombre / indigo950 clair), capsule de compte caption bold teintée, chevron footnote. Fond de l'en-tête : RoundedRect radius md, teinte faint quand déplié, rien sinon. Padding vertical smPlus, horizontal md. Les lignes ont une marge horizontale de 8 dp.

Transposition Android : LazyVStack(pinnedViews) -> LazyColumn avec stickyHeader ; @State expandedSections -> StateFlow du ListViewModel + DataStore pour la mémoire de session.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionHeader.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionRows.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+SectionRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListSectionMemory.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSections.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/CollapsibleSection.kt`

### Les liens (partage, appel, profil, post, réel, story, communauté, hashtag, jeu…) ouvrent la bonne destination

`cl-root-deeplinks` · Android : **partielle** · P0 · effort M

RootView.showDeepLink traite après avoir fermé les surfaces présentées : demande d'appel (confirmation CallLinkConfirmationController, bloquée par la garde de version et l'âge), lien suivi (résolution + erreur « Ce lien n'a pas pu être ouvert »), lien de join/chat (ShareLinkEntryResolver : atterrissage « continuer avec mon compte » ou « rejoindre anonymement », sinon joinAuthenticated avec erreurs 404 « Lien introuvable », 410 « Ce lien n'est plus actif », forbidden « Accès refusé à cette conversation »), conversation par id, post, réel, story (StoryDoor, repli post), profil par pseudo, profil propre et liens (retour racine puis push), hashtag, communauté, conversations récentes/non lues (filtre Non lus ou dernière conversation), lien externe, jeu (saison, ligue), boutique de packs. S'ajoutent « envoyer un message à un utilisateur » (réutilise le direct existant sinon le crée) et les routes poussées par notification (postDetail:, storyDetail:, userStats, progression, affiliate).

Écarts :
- Android déclare des filtres pour meeshy://chat, conversations, conversation, c, profile, story, join, https://meeshy.me/chat|join|u|auth/magic-link ; manquent : post/{id}, réel, communauté, hashtag, mes liens, profil propre, conversations récentes / non lues (raccourcis d'application), lien suivi, demande d'appel, jeu, boutique de packs, lien externe.
- Résolution de lien de partage avec atterrissage « continuer avec mon compte » / « rejoindre anonymement » et messages d'erreur 404/410/forbidden localisés.
- Confirmation d'appel par lien (CallLinkConfirmationController) bloquée tant que la garde de version/âge est affichée.
- Fermer les surfaces présentées avant d'afficher la destination (équivalent router.clearPresentedSurfaces) ; revenir à la racine avant les écrans de premier niveau.
- « Envoyer un message à un utilisateur » : réutiliser le direct existant ou créer la conversation (ConversationService.create type direct) avec toast d'erreur.
- Routes poussées par notification (postDetail:/storyDetail:/userStats/progression/affiliate) vers leurs écrans (userStats, progression, affiliate n'existent pas encore).
- Raccourcis d'application (App Shortcuts) pour « Conversations récentes » et « Non lues » (équivalent App Intents) via DynamicShortcutsPublisher.

Rendu : Pas de visuel propre ; toasts d'erreur localisés (link.error.not-found, inactive, forbidden, open) et écran d'atterrissage de lien (continuer avec compte / anonyme).

Transposition Android : DeepLinkRouter -> navDeepLink + intent-filters App Links vérifiés (assetlinks.json) ; App Intents -> App Shortcuts statiques/dynamiques.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

</details>

Android existant : `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`

### Deux boutons flottants déplaçables ouvrent le Flux et une échelle de menu (liens, notifications, appels, découvrir, communautés, réglages)

`cl-root-floating-buttons-menu` · Android : **partielle** · P0 · effort M

RootFloatingChrome : bouton gauche (cercle dégradé error->indigo300, icône pile ou logo animé quand le flux est ouvert) bascule le Flux, appui long lance les Réels ; bouton droit (avatar de l'utilisateur avec anneau de profil, badge de notifications rouge) ouvre l'échelle verticale (sens haut/bas selon la place), second tap ou appui long -> profil ; action d'accessibilité « Modifier le profil ». Les positions sont libres et persistées (feedButtonPosition/menuButtonPosition, FreeFloatingButtonsContainer). L'échelle (RootMenuLadderEntry) liste Mes liens (F8B500), Notifications (FF6B6B, badge non-lus), Appels (6366F1), Découvrir (8B5CF6, badge demandes d'ami), Communautés (2ECC71), Réglages (64748B) avec animation d'apparition échelonnée 0.04 s (échelle 0.3->1, rotation -30°, ressort 0.4/0.65) ; un voile transparent referme au tap. Masqué sur routes profondes, pendant les Réels et l'onboarding.

Écarts :
- Bouton gauche : iOS = cercle plein dégradé error->indigo300 avec icône pile blanche / logo animé quand le flux est ouvert ; Android = icône DynamicFeed verte (Success) sans fond dégradé ni logo animé.
- Entrée « Communautés » absente de l'échelle Android (qui ajoute « Contacts ») : prérequis = module Communautés ; aligner l'ordre Mes liens, Notifications, Appels, Découvrir, Communautés, Réglages.
- Animation d'apparition échelonnée (échelle 0.3, rotation -30°, ressort 0.4/0.65, délai 0.04 s par entrée) et voile de fermeture au tap ; vérifier l'ouverture vers le haut/bas.
- Bouton Flux : bascule d'un overlay (voir cl-root-feed-overlay) au lieu de naviguer ; état « ouvert » du bouton.
- Masquer les boutons sur routes profondes, pendant les Réels et l'onboarding (vérifier la liste de routes Android).

Rendu : Boutons ronds ~58 dp : gauche dégradé error->indigo300 (topLeading->bottomTrailing), droit anneau dégradé indigo600->indigo300 (error->indigo300 déplié) avec avatar 38-44 dp ; entrées d'échelle 46 dp espacées de md, ThemedActionButton coloré avec halo quand ouvert.

Transposition Android : FreeFloatingButtonsContainer -> MeeshyFloatingButtons (déjà déplaçable et persisté dans FloatingButtonPositionStore).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootFloatingChrome.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootMenuLadderEntry.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeAvatarButton.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtons.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyMenuFab.kt`

### Toucher une notification ou une bannière ouvre la conversation, le post, le réel, le profil, le jeu ou l'écran voulu

`cl-root-notification-navigation` · Android : **partielle** · P0 · effort M

RootNotificationNavigator.navigateFromNotification route ~90 types (NotificationNavContext construit depuis APINotification, SocketNotificationEvent ou NotificationPayload push) : messages, réponses, réactions, mentions, traductions, édition/suppression/épinglage/transfert -> conversation avec surlignage du message (repli post si pas de conversationId) ; demandes d'ami/contacts/humeurs -> feuille de profil ; communauté/membres/ajout -> conversation ; appels manqués/refusés/terminés -> conversation ; alerte d'appel entrant -> CallManager.handleIncomingCallAlertTap (ICE servers) ; likes/commentaires/stories/statuts/réels -> surface sociale choisie par NotificationContentRouter (réel, story éphémère avec contexte, post) avec commentaire cible ; succès/niveaux/badges -> jeu avec révélation d'engagement ; invitations de jeu -> page de jeu ; affiliation ; sécurité/système -> écran Notifications. RootNotificationSource expose le compteur de non-lus (seul observé) ; un appui long sur une bannière ouvre un aperçu de conversation (peek) sans la quitter.

Écarts :
- NotificationDestinationResolver couvre conversation / post / réel / story / profil ; manquent : alerte d'appel entrant (ouvrir l'écran d'appel avec callId, ICE, vidéo), jeu et engagements (succès, niveaux, badges, invitations, ligue), affiliation, routage « sécurité/système -> écran Notifications », cible de commentaire (commentId, parentCommentId) vers le post/réel.
- Surlignage du message (messageId) à l'ouverture d'une conversation depuis une notification.
- Contexte de story (StoryNotificationContext) pour ouvrir la story éphémère au bon endroit et NotificationContentRouter (réel vs story vs post selon postType/contentType/hint de cycle de vie).
- Construction du contexte depuis les trois sources (notification API, événement socket, payload push FCM) avec un modèle commun NotificationNavContext.
- Aperçu de conversation (peek) par appui long sur la bannière in-app, avec suppression du toast et suppression du tap pendant 0.6 s.
- Compteur de non-lus exposé par une source unique (équivalent RootNotificationSource) pour badge de bouton flottant.

Rendu : Pas de visuel propre ; l'aperçu de bannière est une carte de conversation (voir cl-row-longpress-peek-overlay).

Transposition Android : Notification Service Extension -> FCM data-message handler (MeeshyFcmService) ; tap -> PendingIntent vers MainActivity avec extras alimentant le même navigateur.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootNotificationNavigator.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootView+NotificationNavContext.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootNotificationSource.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationToastHost.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerHost.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Ouvrir une conversation par son identifiant marche même hors cache, avec une nouvelle tentative et un message d'erreur clair

`cl-root-open-conversation-by-id` · Android : **partielle** · P0 · effort S

RootConversationOpener.navigateToConversationById : si la conversation est connue en mémoire, navigation immédiate (avec message à surligner) ; sinon lecture du cache (fraîche ou périmée) -> navigation immédiate puis rafraîchissement discret via ConversationService.getById, fusion dans le cache et indexation de recherche ; sinon 2 tentatives réseau espacées de 600 ms ; en cas d'échec, toast d'erreur « Impossible d'ouvrir la conversation » + détail.

Écarts :
- Ouverture cache-first d'une conversation absente de la liste en mémoire (lecture Room puis navigation immédiate + revalidation silencieuse et fusion dans la liste).
- Relance réseau (2 tentatives, 600 ms) et toast d'erreur localisé avec le détail sous-jacent ; aujourd'hui la route chat/{id} charge dans le ChatViewModel sans toast global.
- Mise à jour de l'index de recherche locale (SearchIndex) après récupération d'une conversation inconnue.
- Passage d'un messageId à surligner sur toutes les entrées (notification, lien, widget).

Rendu : Toast d'erreur MeeshyToast (rouge) 'Impossible d'ouvrir la conversation (détail)'.

Transposition Android : RootConversationOpener -> use case ConversationOpener injecté (repository + navController).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootConversationOpener.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`

### Bloquer, masquer, quitter, renommer, signaler et verrouiller passent par des confirmations et feuilles cohérentes avec iOS

`cl-row-action-dialogs-sheets` · Android : **partielle** · P0 · effort M

Les cibles d'actions sont portées par ConversationListSheetTargets (sept cibles sur le tas : blockTarget, deleteTarget, lockSheet, info, inviteSheet, preview, contextMenu, rename, leaveTarget, reportTarget). Dialogues : confirmation de blocage (« Bloquer » destructif, archive la conversation après blocage + haptique succès), confirmation « Masquer la discussion ? » / « Supprimer la conversation ? » (« sera masquée pour vous. Les autres participants la conservent »), alerte Renommer avec champ Nom, alerte « Quitter la conversation » (« Vous ne recevrez plus de messages. Votre historique restera lisible. »), feuille Signaler (types + raison -> ReportService.reportConversation, toasts succès/erreur), feuille de verrou (ConversationLockSheet : verrouiller/déverrouiller/ouvrir, avec rouverture de la conversation et recherche après déverrouillage), alerte « code maître requis » avec action vers Réglages, feuille Infos de conversation (detents medium/large), feuille Inviter mes amis, Tableau de bord (widgets) en grande feuille, couverture Recherche globale.

Écarts :
- Confirmation de blocage + archivage automatique après blocage ; débloquer sans confirmation avec haptique succès.
- Confirmation « Masquer/Supprimer » dont le titre et le message dépendent de ConversationRowMenuCapabilities.removal ; heavy haptic à la validation.
- Signaler une conversation (types + raison) avec ReportService.reportConversation et toasts ; la feuille ReportMessageSheet du chat peut être réutilisée avec un titre « Pourquoi signalez-vous cette conversation ? ».
- Alerte « code maître requis » (configurer -> Réglages) quand on verrouille sans code maître (aujourd'hui la feuille PIN couvre l'étape mais pas l'alerte).
- Feuille Infos de conversation et feuille Inviter mes amis ouvertes depuis la liste (detents medium/large, poignée visible).
- Après déverrouillage réussi : ouvrir la conversation, et armer la recherche si l'ouverture venait de « Rechercher ».
- Confirmations en un seul hôte (Color.clear 1x1 + deux confirmationDialog) côté iOS : sur Android un unique état sealed de dialogue dans le ViewModel.

Rendu : Alertes natives Material (titres et boutons destructifs rouges), feuilles avec poignée, coins xl, fond backgroundPrimary ; toasts via MeeshyToast.

Transposition Android : confirmationDialog/alert -> AlertDialog Material ; .sheet(detents) -> ModalBottomSheet.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ConfirmationAnchor.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Presentations.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListSheetTargets.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationLockPinSheet.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LockPinReducer.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DashboardScreen.kt`

### Le menu d'une conversation offre épingler, silence, rechercher, appeler, détails, favori, déplacer, verrouiller, archiver, bloquer, signaler

`cl-row-context-menu-actions` · Android : **partielle** · P0 · effort M

Le menu (natif iOS 26 ou overlay icône ConversationContextMenuView) liste : ouvrir dans une nouvelle fenêtre (iPad), Épingler, Mettre en silence, Rechercher (ouvre la conversation avec la recherche armée), Appeler (direct uniquement), Marquer lu/non lu, sous-menu Mode de lecture (Lentille), Détails, Renommer (si capacité), Favori (8 emojis ⭐️❤️🔥💎🎯✨🏆💡 + retirer), Déplacer vers… (catégories avec ✓ + « Mes conversations »), Plus d'options (Inviter mes amis, Verrouiller/Déverrouiller, Archiver/Désarchiver, Bloquer/Débloquer en direct, Signaler, Ouvrir dans l'admin), puis Quitter et Supprimer/Masquer (destructifs). La visibilité de chaque entrée vient de ConversationRowMenuCapabilities construit sur ConversationActionPolicy (type, mode de chiffrement, isActive, closedAt, canal d'annonces, rôle) : rename, invite, leave, report (jamais pour soi-même), adminOpen, removal = delete (direct) ou hide.

Écarts :
- Entrées absentes : Rechercher dans la conversation (ouvrir le chat avec la recherche armée), Appeler (appel audio direct), Détails (feuille d'infos), Inviter mes amis, Bloquer/Débloquer (BlockRepository existe), Signaler la conversation, Ouvrir dans l'admin web, Mode de lecture.
- Capacités pilotées par une politique (ConversationActionPolicy portée dans core/model) au lieu de conditions locales : rename/invite/leave/report/adminOpen/removal selon type, rôle, chiffrement, fermeture, canal d'annonces ; report masqué sur sa propre conversation.
- Sémantique de suppression : direct -> « Supprimer » (masquée pour soi), groupe -> « Masquer » ; Android propose « supprimer pour moi / pour tous » et « quitter » : aligner libellés et règles sur iOS.
- Menu « Déplacer vers… » : coche ✓ sur la catégorie courante, bascule vers « Mes conversations », icône de catégorie ; Android propose recherche de catégorie + création (extension à conserver).
- Haptiques par entrée (medium épingler/appeler/verrouiller/archiver, légère autres, heavy destructifs).
- Android ajoute « Mentions seulement » et « Étiquettes » (absents du menu iOS de cette partie) : à conserver mais à placer comme sous-entrées.

Rendu : Menu avec icônes SF Symbols équivalentes (pin.fill, bell.slash.fill, magnifyingglass, phone.fill, envelope.open.fill, info.circle.fill, pencil, star, folder.fill, ellipsis.circle.fill) ; entrées destructives en rouge séparées par un Divider ; teinte d'accent de la conversation (accentColor) sur l'overlay.

Transposition Android : contextMenu natif iOS 26 -> DropdownMenu/ModalBottomSheet d'actions Material avec icônes ; DetachedWindowOpener -> lancement en fenêtre adjacente (FLAG_ACTIVITY_LAUNCH_ADJACENT) sur grand écran uniquement.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ListRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+MoveToSectionMenuItems.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationCategoryReassignment.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTagsEditor.kt`

### La ligne de dernier message résume appels, réactions, médias, effets, éphémères avec compte à rebours et bouton Rejoindre

`cl-row-last-message-line` · Android : **partielle** · P0 · effort M

ConversationPreviewLine compose un ConversationPreview (SDK) : préfixe auteur (« Vous », nom, ou brouillon en rouge), pictogramme par nature, flèche de direction (sortant/entrant), segments séparés par « · », ton (défaut/accent/succès/danger), italique pour les protections, décompte en direct (timerInterval) pour un message éphémère tant que la deadline est proche, bouton « Rejoindre » vert pour un appel en cours, protection d'écran (captureShield) pour l'éphémère. Le catalogue de chaînes (ConversationPreviewCatalog, ~70 clés) couvre : frappe (un/deux/plusieurs), brouillon, réactions (membre/pair/soi, avec ou sans cible), appels (actif, participants, audio, vidéo, manqué, refusé, annulé, sans réponse, échec), pièces jointes (vocal, audio, vidéo, photo, fichier, contact, lieu, sticker, et pluriels/mixtes), protections (vue unique, ouverte, expiré, masqué, chiffré, après lecture), effets (secousse, zoom, explosion, confettis, feux d'artifice, waoo, lueur, pulsation, arc-en-ciel, scintillement), messages système (membre ajouté/retiré/parti/rejoint, arrivées 1-2-3-n, renommage, image, chiffrement), unités de temps. Un texte parlé (spokenPreview) est exposé à VoiceOver avec durées lues en toutes lettres.

Écarts :
- Android gère photo/vidéo/vocal/fichier/lieu, brouillon, frappe, expiré/masqué/vue unique ; manquent : appels (actif, participants, manqué, refusé, annulé, sans réponse, échec), réactions (membre/pair/soi), pièces jointes multiples et mixtes (« 3 photos »), contact, sticker, audio vs vocal, effets de message, messages système (membres, renommage, chiffrement), vue unique ouverte, après lecture, chiffré.
- Compte à rebours en direct pour l'éphémère actif (mise à jour par seconde seulement quand proche de l'échéance) et enregistrement de réception (EphemeralReceiptLedger).
- Bouton « Rejoindre » pour un appel en cours dans la ligne (voir cl-row-peer-signals-interactions).
- Flèche de direction (sortant/entrant), pictogrammes par nature, tons (accent/succès/danger), italique, auteur coloré (brouillon en rouge, sinon accent de conversation).
- Résolution du Prisme sur le dernier message (RANG par RANG, jamais translations.first) pour tous les types, y compris les transcriptions.
- Texte parlé TalkBack (contentDescription) avec durées lisibles ; protection d'écran (FLAG_SECURE) sur l'aperçu éphémère.
- Catalogue de chaînes complet dans les 4 langues du module (fr, es, pt, en) : ~70 clés à porter vers strings.xml.

Rendu : Une seule ligne caption/subhead, auteur caption semibold (accent de conversation), pictogramme + flèche colorés par ton, segments séparés par ' · ', texte secondaire par défaut, italique pour les protections ; bouton Rejoindre : capsule success, texte blanc caption semibold, zone tactile 44.

Transposition Android : ConversationPreviewComposer (SDK Swift) -> objet pur dans core/model testé en JVM ; Text(timerInterval:) -> LaunchedEffect avec ticker 1 s ; captureShield -> FLAG_SECURE ciblé.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationPreviewLine.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationPreviewCatalog.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationPreviewWidthLaw.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MessageSummaryKind.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRowPreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPreviewMessages.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LastMessageSummaryKind.kt`

### La liste s'affiche instantanément depuis le cache, distingue frais, périmé, hors ligne et erreur, et se répare à la reconnexion

`clist-vm-cache-first-load` · Android : **partielle** · P0 · effort M

ConversationListViewModel charge cache-first avec un LoadState explicite (idle, cachedFresh, cachedStale, loading, offline, error) : un cache frais ou périmé s'affiche tout de suite et déclenche une synchro silencieuse depuis le dernier checkpoint ; un cache expiré mais récupérable (loadIgnoringExpiry) s'affiche en état hors ligne ; un cache vide montre le squelette. Après fullSync, il réconcilie les non-lus et fusionne en préservant les conversations créées il y a moins de 30 s. Tirer pour rafraîchir lance forceRefresh puis invalide les caches voisins (messages, participants, stories, préférences, tags, profils, traductions) seulement si tout a réussi. Une extension de reconnexion relance un chargement échoué quand le réseau repasse de faux à vrai. Les catégories se chargent cache-first, le filtrage et le groupement se font hors du thread principal (debounce 16 ms).

Écarts :
- Exposer un LoadState explicite avec l'état « offline avec données récupérées » (cache expiré affiché sans erreur) ; Android n'a que showSkeleton / errorMessage / isSyncing.
- Réconciliation des non-lus après synchro complète (reconcileUnread avec les conversations ouvertes) et réconciliation du badge/notifications.
- Fusion qui préserve les conversations créées depuis moins de 30 s absentes de la réponse serveur (recentlyCreatedAt, TTL 30 s).
- Tirer pour rafraîchir = forceRefresh PUIS invalidation des caches voisins seulement si OK ; Android fait un refresh simple.
- Réparation à la reconnexion : un chargement échoué (loadFailed) est relancé au passage réseau false -> true.
- Retour au premier plan : relire le cache, recharger les stories si périmées, refresh + prefetch ; cacheTTL 30 s (handleForegroundReturn / handleForegroundReactivation).
- Catégories cache-first (cache puis revalidation) et conversion en sections (icône par défaut folder.fill, couleur 45B7D1, tri par ordre) ; filtre composable multi-sélection (types ∪ états, archivées) et filtre par tag, contre un filtre unique ConversationFilter côté Android.
- Index id -> position paresseux invalidé à chaque mutation ; filtrage et groupement hors thread principal (debounce 16 ms, tâche annulable).

Rendu : Aucun spinner si le cache a des données (même périmées) ; squelette seulement sur cache vide ; état hors ligne = données + bandeau, pas une erreur.

Transposition Android : Combine CombineLatest + debounce -> Flow.combine + debounce ; Task.detached -> Dispatchers.Default ; app foreground -> ProcessLifecycleOwner (ON_START) ; NetworkMonitor.isConnected -> NetworkConditionMonitor.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Loading.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+ReconnectRecovery.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListContent.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/EmptyStateVisual.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CacheResult.kt`

### Un message, un changement de titre ou un nouveau membre met la liste à jour immédiatement et sans tout recharger

`clist-vm-socket-live-updates` · Android : **partielle** · P0 · effort M

ConversationListViewModel+SocketEvents applique les événements en place. conversation:updated modifie titre (sauf direct), description, avatar, bannière, canal d'annonce, rôle d'écriture, mode lent, traduction auto ; si lastMessageAt est plus récent, la conversation remonte en tête avec un LastMessageFacet (id, aperçu, auteur résolu « Vous »/nom, date, traductions du prisme remplacées, langue d'origine, lieu) ; un lastMessage remplacé par nul efface l'aperçu. Une conversation inconnue (conversation:updated, conversation:new, notification:new de types new_conversation_direct, new_conversation_group, added_to_conversation, push) est « découverte » par un fetch par id dédupliqué puis insérée en tête. L'effectif suit participant:joined, left, banned, unbanned avec valeur absolue serveur prioritaire et drapeau de plafond ; être banni ou parti retire la conversation. Une reconnexion socket relance le prefetch.

Écarts :
- Remplacer le rafraîchissement complet coalescé (requestRefresh sur chaque unreadUpdated / messageReceived / conversationUpdated) par un patch EN PLACE des champs de la conversation (titre, description, avatar, bannière, canal d'annonce, rôle d'écriture, mode lent, traduction auto) pour éviter la relecture réseau/cache à chaque événement.
- bumpToTop avec LastMessageFacet : n'avancer que si lastMessageAt est plus récent, résoudre l'auteur (« Vous »/nom/id), appliquer les traductions du prisme remplacées (map et langue d'origine), le lieu, et l'effacement d'aperçu quand lastMessage devient nul ; gérer previewRecalculated.
- Découverte d'une conversation inconnue par id (fetch dédupliqué, insertion en tête, marquée récemment créée) depuis conversation:updated, conversation:new, notification:new (types new_conversation_direct/group, added_to_conversation) et push.
- Effectif live : participant:joined (+1, ignore soi), left/banned/unbanned (-1/+1) avec valeur absolue serveur prioritaire et drapeau memberCountCapped (jamais d'extrapolation au-delà du plafond) ; soi banni/parti -> conversation retirée et cache des messages invalidé.
- Reconnexion socket (didReconnect) -> armer et lancer le prefetch des messages du haut de liste.
- Persistance différée de 200 ms après chaque mutation locale.

Rendu : La rangée remonte en tête avec le ressort de réordonnancement (voir clist-vm-reorder-motion) ; aucun clignotement de liste.

Transposition Android : Combine sinks -> collect de SharedFlow du MessageSocketManager ; ConversationService.fetch(id) -> ConversationRepository.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+SocketEvents.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPurge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### La recherche dans une conversation interroge le serveur (2+ caractères), trouve aussi les traductions et charge la suite

`cl-chat-server-search` · Android : **partielle** · P1 · effort M

ConversationSearchHandler : requête rognée d'au moins 2 caractères (sinon résultats vides), recherche serveur 20 par page (messageService.search) avec pagination par curseur (loadMoreSearchResults), upsert des messages trouvés dans la persistance locale, résultats typés SearchResultItem (matchType « content » ou « translation », texte correspondant, expéditeur, avatar, date) en testant d'abord le contenu puis chaque traduction ; état isSearching / searchHasMore pour l'UI.

Écarts :
- Android cherche seulement dans les messages DÉJÀ chargés (ChatSearch.matchIds sur le texte affiché + original) ; ajouter l'appel serveur de recherche de messages (endpoint de recherche de conversation) avec pagination par curseur.
- Seuil de 2 caractères, état isSearching / searchHasMore, chargement de la suite au défilement des résultats.
- matchType content vs translation et affichage du texte correspondant (traduction) dans la liste de résultats avec surbrillance.
- Upsert des résultats dans Room pour pouvoir naviguer vers un message hors fenêtre chargée (saut au message).

Rendu : Liste de résultats avec avatar, nom, extrait surligné, date relative ; compteur n/N existant côté Android à conserver.

Transposition Android : Cursor pagination -> Paging/Flow dans ChatViewModel ; surbrillance déjà disponible via highlightTerm.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationSearchHandler.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Les filtres de conversations se combinent (types en OU, états en ET) et se retirent d'un second appui

`cl-filter-chips-multiselect` · Android : **partielle** · P1 · effort S

La rangée horizontale de ThemedFilterChip (Tous, Non lus, Personnel, Privée, Ouvertes, Globales, Channels, Favoris, Archives) est une sélection MULTIPLE gérée par ConversationFilterComposition : les filtres de nature (personnel, privée, ouvertes, globales, channels) se combinent par OU, ceux d'état (non lus, favoris) par ET ; « Tous » est la sélection neutre et tout retrait y ramène ; les archives n'entrent dans le corps de liste que si le filtre Archives est actif. Un chip sélectionné est plein (couleur du filtre, texte blanc, bordure 2.5), sinon fond teinté 30-40 % + bordure 0.7. Haptique légère, animation ressort 0.3/0.8, hint d'accessibilité « Toucher pour retirer/ajouter ce filtre ».

Écarts :
- Android a une sélection UNIQUE (selectedFilter) ; porter ConversationFilterComposition (toggling, isNeutral, typeFilters OU / stateFilters ET, includesArchived) dans core/model et passer l'état à un Set.
- Style des chips : plein couleur du filtre quand sélectionné avec texte blanc et bordure 2.5 dp ; fond teinté 0.3 (clair) / 0.4 (sombre) et bordure 0.7 sinon (Android utilise un FilterChip Material discret à 18 %).
- Haptique légère au toucher et animation ressort 0.3/0.8 de la sélection.
- Accessibilité : trait selected + hint « Toucher pour retirer/ajouter ce filtre » ; libellé de rangée « Filtres de conversations ».
- Les archives sont masquées partout sauf avec le filtre Archives (vérifier la règle côté liste).

Rendu : Capsule, police caption2 semibold (compact), padding horizontal 11 / vertical 5, couleurs par filtre : Tous 4ECDC4, Non lus FF6B6B, Personnel 3498DB, Privée F8B500, Ouvertes 2ECC71, Globales E74C3C, Channels 1ABC9C, Favoris F59E0B, Archives 9B59B6 ; marge horizontale lg, vertical xsPlus.

Transposition Android : ScrollView horizontal -> LazyRow ; ThemedFilterChip -> composable sur mesure (pas le FilterChip Material).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+FilterChips.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationFilterBar.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### L'en-tête « Meeshy Chats » se replie au défilement et masque ses boutons verre pendant le geste

`cl-list-header-chrome` · Android : **partielle** · P1 · effort S

ConversationListHeaderOverlay monte un CollapsibleHeader au titre dégradé indigo500->indigo700 (displaySize bold rounded, minimumScaleFactor 0.55) dont les actions (lien de partage `link.badge.plus`, nouvelle conversation `plus`, et sur iPad : bouton Flux en capsule, cloche notifications avec badge rouge « 9+ », engrenage Réglages) sont des cercles de verre (adaptiveGlass) et se masquent pendant le défilement (hiddenWhileScrolling) avant de réapparaître au repos. Accessoire de titre : la bande de stories épinglée (PinnedStoryTrailBand) qui apparaît à mesure que l'en-tête se replie. Le contenu démarre sous la hauteur déployée de l'en-tête.

Écarts :
- Accessoire de titre : la bande de stories épinglée (PinnedStoryTrailBand) n'est pas câblée dans titleAccessory du CollapsibleHeader Android.
- Boutons d'action : cercles de verre 44 pt (MeeshyControlSize.large) teinte indigo500 avec haptique ; Android utilise CollapsibleHeaderActionButton (vérifier rendu verre).
- Sur tablette : bouton « Flux » en capsule, cloche avec badge de non-lus (NotificationBadge.displayed, 9+), engrenage ; valeur d'accessibilité « N non lues ».
- Android ajoute « Déverrouiller tout » et un menu de sécurité (PIN maître) absents de l'en-tête iOS : à conserver mais à aligner (iOS les place dans Réglages).

Rendu : Titre 'Meeshy Chats' en dégradé indigo500->indigo700, taille display, gras arrondi ; fond de l'en-tête transparent déployé puis backgroundPrimary ; actions en cercles de verre 44 dp icône 24 semibold indigo500 ; espacement md puis xs (ViewThatFits).

Transposition Android : CollapsibleHeader iOS -> CollapsibleHeader Compose existant (titleAccessory + actionsVisible) ; iPad -> actions tablette via fenêtre large.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+HeaderOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListHeaderActions.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationHeaderActions.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeader.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeaderMotion.kt`

### La liste est déjà chargée à l'ouverture et se répare seule au retour du réseau ou de l'arrière-plan

`cl-list-lifecycle-prewarm` · Android : **partielle** · P1 · effort S

ConversationListVMOwner garde UN ViewModel vivant partagé (compact/régulier), préchauffe le chargement dès l'authentification (prewarm) avant que la liste ne soit montée, annule le chargement si l'utilisateur change, et répare un chargement échoué à la reconnexion du socket (repairsFailedLoadOnReconnect). La vue charge conversations et communautés en parallèle (async let), puis à chaque retour de scenePhase = active appelle handleForegroundReturn et handleForegroundReactivation. Le pull-to-refresh recharge en parallèle conversations, stories, statuts et communautés avec haptique au seuil et au succès (MeeshyRefreshableScroll).

Écarts :
- Préchauffage du chargement de la liste à l'authentification (avant la navigation vers l'écran) avec annulation si l'utilisateur change.
- Réparation automatique d'un chargement échoué à la reconnexion du socket (observer SocketConnectionState et relancer refresh() si l'état est en erreur).
- Rafraîchissement silencieux + ré-abonnement au retour au premier plan (ProcessLifecycleOwner ON_START) côté liste, pas seulement côté présence.
- Pull-to-refresh : recharger aussi stories, statuts et communautés dans le même geste ; haptique au franchissement du seuil et à la fin.
- Nettoyage de rétention différé (5 s après le démarrage) du moteur de synchronisation.

Rendu : Aucun visuel propre ; le seuil de pull-to-refresh doit déclencher une haptique (HapticFeedbackType.LongPress) et une seconde au succès, avec l'animation logo/dégradé indigo de MeeshyRefreshableScroll.

Transposition Android : ConversationListVMOwner -> ViewModel Hilt scopé à la NavGraph + initialisation dans MeeshyApplication/RealtimeSessionCoordinator ; scenePhase -> ProcessLifecycleOwner.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListVMOwner.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`

### Le bas de la liste charge la suite des conversations et affiche son état (chargement, tout chargé, erreur réessayer)

`cl-list-pagination-footer` · Android : **partielle** · P1 · effort S

Quand une ligne à moins de 5 rangs de la fin apparaît, la liste appelle loadMore(). Le pied de liste (ConversationPaginationFooter, créneau de 52 pt scalable) montre un ProgressView indigo400 pendant loadingMore, « Toutes les conversations sont chargées » (caption secondaire) une fois épuisée si plus de 30 conversations, un message d'erreur avec bouton Réessayer, ou une sentinelle 1 pt qui déclenche loadMore à son apparition quand hasMore est vrai.

Écarts :
- Android parcourt toutes les pages à la synchronisation (ConversationCacheSource) : aucune pagination pilotée par le défilement ; exposer un état de pagination (idle / loadingMore / exhausted / error) et un loadMore() appelé quand l'index visible est à ≤5 de la fin.
- Pied de liste : spinner indigo400, texte « Toutes les conversations sont chargées » (>30 conversations), erreur + bouton Réessayer, créneau de hauteur fixe pour éviter un saut de mise en page.
- Chaînes localisées conversations.pagination.allLoaded / errorTitle / retry dans les 4 langues du module.

Rendu : Pied centré, hauteur 52 dp, caption secondaire, bouton Réessayer en caption medium indigo400, spinner indigo400.

Transposition Android : onAppear sentinelle -> LaunchedEffect sur layoutInfo.visibleItemsInfo avec snapshotFlow ; item de pied de liste dans le LazyColumn.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`

### Chaque bulle est lue à voix haute dans l'ordre expéditeur, réponse, texte, médias, heure, statut

`cl-message-a11y-label` · Android : **partielle** · P1 · effort S

MessageAccessibilityLabelComposer compose l'étiquette VoiceOver d'une bulle : expéditeur (ou « expéditeur inconnu »), puce de vue unique seule si présente, réponse (« en réponse à vous/nom : extrait »), texte (sauf flouté), compte d'images et de vidéos séparés, audios, lieu, cartes de contact (nom/compte), fichiers, heure, statut de livraison pour ses messages (en cours d'envoi, envoi lent, envoyé, distribué, lu, échec), modifié, épinglé, chrome de protection (éphémère, vue unique…), réactions (« emoji N »). Ordre figé, séparateur « , ».

Écarts :
- Pas de distinction images/vidéos (un seul compteur « images ») : Android porte les deux types dans la même liste ; séparer.
- Réponse : pas de formulation « à vous » (flag isMe de la cible de réponse absent du modèle Android).
- Puce de vue unique et chrome de protection (éphémère, vue unique ouverte, après lecture, flouté) absents hors expiration éphémère ; message flouté doit taire son texte.
- Cartes de contact : étiquette par carte (nom + compte Meeshy résolu) absente ; fichiers OK.
- Statut « envoi lent » absent (Android : pending/queued/sent/delivered/read/failed) ; l'heure n'est ajoutée que si l'appelant la fournit.

Rendu : Aucun visuel ; contentDescription unique par bulle, ordre figé, phrases localisées (a11y.message.*, a11y.delivery.*) dans les 4 langues.

Transposition Android : VoiceOver label -> semantics { contentDescription } (clearAndSetSemantics) pour TalkBack.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Preferences/MessageAccessibilityLabelComposer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubbleAccessibilityLabel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### Le Flux se superpose à la liste depuis le bas avec composeur, stories, publications, réels autoplay et actions optimistes

`cl-root-feed-overlay` · Android : **partielle** · P1 · effort M

ThemedFeedOverlay est un écran plein sur la liste (transition asymétrique : entrée par le bas + fondu, sortie bas + échelle 0.95 + fondu) : fond dégradé de thème avec deux halos flottants, CollapsibleHeader « Meeshy Feed » (boutons Réels et À proximité), plateau de stories + mood, carte composeur « Partager quelque chose » (avatar, icône photo) ouvrant le composeur complet, squelette tant qu'aucune donnée en cache, puis cartes : réels (ReelFeedCardContainer avec autoplay selon visibilité) ou publications standard (FeedPostCard équatable). Actions optimistes avec bascule et rollback : j'aime (socket puis REST), favori (seed depuis le cache, retrait du cache), repartage, partage par lien, citation, modification ; compteurs delta par post ; prefetch média/commentaires à l'apparition ; impressions comptées ; abonnement aux réactions socket. Pull-to-refresh recharge flux, stories, statuts.

Écarts :
- Android présente le Flux comme une route d'onglet, pas comme un overlay superposé à la liste avec la transition bas/échelle 0.95 ; décider du comportement cible (overlay animé sur téléphone, volet sur tablette).
- Fond : dégradé de thème + deux halos flous flottants (indigo400 et error à 6-10 %).
- Cartes réels : autoplay piloté par la visibilité dans le viewport (ReelFeedAutoplayCoordinator) ; vérifier l'équivalent dans FeedScreen.
- Actions optimistes complètes avec delta local et rollback : j'aime via socket puis repli REST, favori, repartage, partage par lien, citation de l'original, modification ; seed des favoris depuis le cache.
- En-tête : boutons Réels (play.rectangle.on.rectangle.fill) et À proximité (dot.radiowaves.left.and.right) en cercles de verre, bande de stories épinglée en accessoire.
- Impressions listées (countsListedImpression) et suivi des liens sortants ; consommation d'une demande de composeur en attente (router.pendingOpenFeedComposer).
- Squelette uniquement si aucune donnée en cache (SkeletonVisibilityResolver).

Rendu : Halos : cercle 300 dp indigo400 6-10 % flou 80 déplacé (-80,-100) et cercle 250 dp error 6-10 % flou 70 déplacé (100,200), dérive lente ; espacement md entre cartes ; padding bas 100 dp pour dégager les boutons flottants ; composeur : carte radius lg fond inputBackground bordure inputBorder.

Transposition Android : ThemedFeedOverlay -> FeedScreen en overlay (AnimatedVisibility) au-dessus du NavHost ou route avec transition verticale.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedHeader.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/StatusBarView.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### Au démarrage, socket, stories, statuts, conversations et compteur de notifications se chargent en parallèle, avec garde de version minimale

`cl-root-services-startup` · Android : **partielle** · P1 · effort S

RootView.startRootServices : connecte le socket des messages, abonne statuts et stories, arme les relais temps réel (RealtimeRelays), planifie un nettoyage de rétention du moteur de synchronisation 5 s plus tard, observe la synchronisation de la liste, branche les callbacks du contrôleur de bulle de statut (réponse -> conversation de réponse à la story, republier) et du service de publication de stories, puis lance en parallèle : vérification du plancher de version (UpgradeGate), stories, statuts, conversations (via le préchauffage) et compteur de notifications non lues. Le conteneur gère aussi le mini-lecteur audio (tap = revenir à la conversation et au message), le pill de synchronisation (tap = ouvrir la source en file) et les bannières.

Écarts :
- Garde de version minimale (UpgradeGateController.checkFloor) : écran bloquant « mettre à jour » quand la version est sous le plancher publié par le serveur ; absent sur Android.
- Chargements parallèles au démarrage (stories, statuts, conversations, compteur de notifications non lues) coordonnés dans un point d'entrée unique et non pas dans chaque écran.
- Pill de synchronisation de la file de sortie (OutboxUIItem) cliquable : ouvrir la conversation/post/story source ; aujourd'hui seul un bandeau de connexion existe.
- Mini-lecteur audio persistant avec tap -> conversation et message en cours (MiniPlayerTapPolicy).
- Callbacks de la bulle de statut (réponse confirmée -> conversation de réponse à la story, republier).

Rendu : Écran de mise à jour obligatoire plein écran (logo, message, bouton vers le Play Store) ; mini-lecteur en capsule au-dessus de la barre.

Transposition Android : startRootServices -> initialisation dans MeeshyApplication/RealtimeSessionCoordinator + ViewModel racine ; UpgradeGate -> écran bloquant piloté par Remote Config/endpoint de version.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeViewModel.kt`

### Toucher l'avatar d'une conversation ouvre la story ou le profil, le badge d'humeur ouvre la bulle de statut

`cl-row-peer-signals-interactions` · Android : **partielle** · P1 · effort M

Pour les conversations directes, la liste calcule l'anneau de story (storyRingState), le statut d'humeur (StatusEntry) et le signal « ici » (ConversationHere : le pair est dans cette conversation). Dans la ligne : toucher l'avatar ouvre la story si l'anneau est actif sinon le profil (ProfileSheet) ; toucher le badge d'humeur ouvre la bulle de statut ancrée (StatusBubbleController) ; toucher le nom ouvre les infos de conversation ; une conversation avec appel en cours montre « Rejoindre » (LiveCallJoiner). La zone d'avatar est exclue du geste d'appui long de la ligne.

Écarts :
- Anneau de story et emoji d'humeur sont affichés mais non interactifs : ajouter onViewStory (ouvre story/{userId} si anneau), onViewProfile (feuille profil), onMoodBadgeTap (bulle de statut ancrée), onViewConversationInfo.
- Signal « le pair est ici » (PresenceManager.here(userId, conversationId)) et son rendu dans la ligne : absent.
- Bouton « Rejoindre » pour appel en cours (LiveCallJoinRequest / LiveCallJoiner) dans la ligne et dans la ligne d'aperçu.
- Exclusion de la zone d'avatar du geste d'appui long (largeur md + ringSize) pour que le tap avatar ne déclenche pas le menu.
- Compter l'impression du statut d'humeur (SharedImpressionBatchers.moodAvatar) à l'affichage de la ligne.

Rendu : Avatar conversationList avec anneau de story, pastille de présence 11 dp bordure 2.5, badge d'humeur en coin ; « Rejoindre » = capsule success caption semibold blanche, hauteur tactile 44.

Transposition Android : StatusBubbleController -> Popup/bulle ancrée Compose ; ConversationHere -> StateFlow de présence par conversation.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+PeerSignals.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationStoryRing.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationMoodStatus.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Une barre de recherche flottante en verre se masque en défilant, s'illumine au focus et ouvre tableau de bord et recherche globale

`cl-search-bar-floating` · Android : **partielle** · P1 · effort M

ConversationListBottomBar ancre en bas une capsule ultraThinMaterial (radius xlPlus) : loupe qui devient dégradé error->indigo300 avec échelle 1.15 quand active, champ « Rechercher… » (état partagé via ConversationSearchTextModel), croix error pour effacer, bouton Tableau de bord (grid, dégradé warning->indigo500, haptique medium) qui ouvre les widgets, bouton Recherche globale (text.magnifyingglass, dégradé indigo600->indigo300). Au focus : rebond de la barre (ressort 0.35/0.55), bordure dégradé 2 pt avec halo, bande Communautés au-dessus. Loi de masquage au défilement (ConversationSearchBarScrollLaw) : visible dans les 30 premiers pt, masquée quand la profondeur augmente de ≥12 pt (hystérésis), ré-affichée quand elle diminue de ≥12 ; jamais masquée pendant la saisie ; perd le focus quand elle se masque. Le sync pill vient se loger au-dessus (docksSyncPill).

Écarts :
- Loi de masquage : iOS utilise une profondeur absolue avec zone haute de 30 pt et hystérésis de 12 pt ; Android compare des deltas d'index/offset avec seuil 8 dp (peut clignoter) : porter ConversationSearchBarScrollLaw.
- Bouton de recherche à gauche qui bascule le focus (état actif en dégradé, échelle 1.15) et bouton « effacer » (xmark.circle.fill, error) : absents côté Android.
- Rebond d'entrée au focus (ressort 0.35/0.55), bordure dégradé error->indigo300 2 dp + ombre indigo300 0.25 quand actif.
- Bande Communautés affichée au focus quand la requête est vide (voir cl-search-communities-band).
- La barre perd le focus quand elle se masque (clavier fermé) ; scrollDismissesKeyboard interactif.
- Sync pill amarré au-dessus de la barre (aujourd'hui bandeau de connexion en haut).

Rendu : Capsule radius xlPlus (~28 dp), padding h lg / v md, 3-4 icônes 20-22 dp, bordure 1 dp inputBorder (2 dp dégradé quand actif), marge horizontale lg et basse lg, remonte de 150 dp et s'estompe quand masquée (0.25 s easeOut).

Transposition Android : ultraThinMaterial -> MeeshyGlassSurface (blur Android 12+, fallback translucide) ; FocusState -> FocusRequester/onFocusChanged ; scrollDismissesKeyboard -> NestedScrollConnection + clearFocus.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+BottomBar.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationSearchTextModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationSearchCommunitiesBand.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSearchBarVisibility.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DashboardScreen.kt`

### Le plateau de stories défile avec la liste et se réduit en bande épinglée sous le titre

`cl-story-rail-pinned-trail` · Android : **partielle** · P1 · effort M

En tête du contenu défilant, ConversationListStoryRail monte StoryTrayView (stories des contacts + bouton « ajouter un mood ») : un appui ouvre le visionneur de stories à la première non vue (fromTray = true) ; « ajouter » ouvre le composeur de mood. En défilant, une version compacte (PinnedStoryTrailBand) se révèle dans l'en-tête réduit (hauteur d'accessoire 60). Le pull-to-refresh recharge aussi les stories (forceNetwork).

Écarts :
- Le StoryTray Android est posé dans un slot fixe au-dessus de la barre de filtres (il ne défile pas avec la liste) ; le déplacer en premier item du LazyColumn.
- Bande de stories épinglée dans l'en-tête réduit (PinnedStoryTrailBand) absente.
- Bouton « Poser un mood » du plateau -> StatusComposerSheet depuis la liste (aujourd'hui seul « ajouter une story » est câblé).

Rendu : Rail : avatars 48 dp, anneau 3.5 dp (dégradé non vu / gris vu), 6 entrées max visibles dans la bande épinglée (LentilleMetrics.Rail), padding vertical 8.

Transposition Android : StoryTrayView -> StoryTray (feature/stories) en item de liste ; bande épinglée -> titleAccessory du CollapsibleHeader.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+StoryRail.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`

### Les photos et vidéos d'un message forment une grille de 300 pt (1, 2, 3 ou 4+) avec flou, vue unique et double-tap pour réagir

`clist-focal-attachments-grid` · Android : **partielle** · P1 · effort M

FocalAttachmentBlock calcule la grille visuelle : largeur max 300 pt (réduite par la colonne disponible), espacement 2 pt ; 1 média 300×240 (vidéo seule : hauteur selon le ratio, plafond 1,6× la largeur), 2 médias 2×(150×180), 3 médias 60/40 % sur 240 de haut, 4 et plus en quadrillage 2×2 de 240 avec « +N » sur la quatrième case. Chaque case gère la protection (flou 18 pt ou vue unique) : tap = révéler sur place (haptique moyenne) puis plein écran avec re-flou à la sortie ; badge « Voir une fois / Contenu masqué / Toucher pour voir » et compteur de vues ; double-tap = réagir (posé seulement si la pièce l'offre, pour ne pas retarder le tap simple). FocalNonMediaBlock rend le lieu partagé (carte plein écran au tap) et les fichiers (partage de fichier), indentés de 29.

Écarts :
- Table de slots FocalMediaGridLayout (1 -> 300×240, 2 -> 150×180, 3 -> 60/40 % sur 240, 4+ -> 2×2 de 240 avec +N) et largeur de grille contrainte par la colonne ; cas vidéo solo selon le ratio.
- Protection par case (FocalMediaProtection : none / blurred(isViewOnce)) : tap révèle sur place puis ouvre en plein écran avec re-flou à la sortie de visibilité ; haptique moyenne ; badges Voir une fois / Contenu masqué / Toucher pour voir ; compteur de vues.
- Double-tap pour réagir sur une case, monté seulement si la pièce offre la réaction (sinon le tap simple attend la désambiguïsation).
- Bloc non-média : lieu partagé (LocationMessageView, plein écran au tap, libellé par défaut), fichiers (BubbleAttachmentView, partage de fichier) avec indent 29.
- Rayon des médias 16 dp et rendu des cases image/vidéo (vignette, bouton lecture, plein écran).

Rendu : Grille max 300 dp, espacement 2 dp, rayon 16 dp ; voile avec flou 18 et icône œil ; badge de vues en coin.

Transposition Android : BubbleGridCell -> composable de case réutilisant MosaicLayout ; haptique medium -> HapticFeedbackConstants.CONTEXT_CLICK/LONG_PRESS.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalNonMediaBlock.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MosaicLayoutMode.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`

### Les messages audio du fil choisissent le bon rendu : carrousel, seul avec pied, hôte de réponse ou de légende, autonome

`clist-focal-audio-block` · Android : **partielle** · P1 · effort M

FocalAudioRouting décide d'un mode unique pour les pièces audio d'un message : aucun, pile (carrousel quand un message audio pur contient plus d'une piste), seul avec pied (audio sans texte ni citation), hôte de réponse, hôte de légende (texte ou lieu qui n'est pas une transcription, sans visuel) ou autonome ; un message audio pur accompagné de texte reste « seul avec pied » car le texte EST la transcription. FocalAudioBlock rend les lecteurs avec les enrichissements (transcription, audios traduits par langue, file audio de la conversation pour l'enchaînement) et l'avis de consentement voix manquant.

Écarts :
- Fonction pure mode(for content) -> FocalAudioMode {none, stack, soleWithFooter, hostsReply, hostsCaption, standalone} avec les règles exactes (carrousel uniquement pour un audio pur multi-pistes ; audio pur + texte = soleWithFooter).
- Bloc audio plat : lecteur par piste, carrousel de pistes, pied (durée, transcription), enrichissements (transcription, traductions audio par langue, file de lecture).
- Hébergement de la légende/réponse selon le mode et avis de consentement voix manquant (onTapConsentNotice).

Rendu : Lecteur aligné à l'indent de 29 ; pied avec durée et transcription repliable.

Transposition Android : AudioItem -> pistes Media3 existantes (AudioTrackSurface) ; file audio de la conversation -> playlist ExoPlayer.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalAudioBlock.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AudioPlayerChromePlan.kt`

### Un message flouté ou à vue unique est voilé jusqu'au toucher qui le révèle, sans jamais s'afficher en clair

`clist-focal-protected-content` · Android : **partielle** · P1 · effort S

FocalProtectedContent enveloppe le bloc contenu d'un message protégé (citation comprise, jamais l'identité ni la méta) : flou de 18 pt, brouillard animé en matière fine, affordance « Voir une fois / Contenu masqué » ; le tap demande la révélation (haptique moyenne) et, pour une vue unique, consomme la vue côté serveur avec callback. Après révélation, un tap sur le média ouvre le plein écran (tapAfterReveal). Une clé d'environnement indique aux cellules enfants que le message est révélé pour qu'elles ne se re-voilent pas. Le wrapper ne se monte que pour un message protégé.

Écarts :
- Voile appliqué au BLOC contenu de la rangée plate (citation comprise), pas à l'identité ni à la méta ; monté uniquement si requiresVeil.
- Brouillard animé (opacité pilotée par le contrôleur de révélation) + flou 18 dp + affordance avec haptique moyenne ; consommation de la vue unique via callback serveur.
- tapAfterReveal (ouvrir le média en plein écran) et clé d'environnement focalMessageRevealed (CompositionLocal) pour éviter le re-voilage des enfants.

Rendu : Flou 18, rayon FocusCard 16 pour le brouillard, icône œil et libellé centrés.

Transposition Android : blur(radius) -> Modifier.blur (API 31+) avec repli opaque + scrim sur API plus anciennes ; ultraThinMaterial -> scrim translucide.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalProtectedContent.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`

### Une réponse affiche la citation avec un rail vertical, saute au message d'origine au tap et traite une story citée comme une scène

`clist-focal-quoted-reply` · Android : **partielle** · P1 · effort M

FocalQuotedReplyView dessine la citation avec FocalQuoteRail (rail de 2,5 pt, couleur d'accent pour soi, couleur de l'auteur sinon), le nom (« Vous », « Humeur » ou l'auteur), le texte cité avec ses mentions (flux inline sans coupure de ligne au milieu d'un signe), la miniature du média cité (« Médias » en repli), et les gestes : tap = saut vers l'original, tap auteur = profil, tap média cité = ouverture, actions d'accessibilité dédiées. Une story citée est une scène : FocalStoryCitationQuote affiche la carte de citation de story avec le rail et ouvre la story. La citation prend sa hauteur idéale pour que le rail ne s'étire pas dans une cellule à hauteur estimée.

Écarts :
- Rail vertical de 2,5 dp arrondi (couleur accent pour soi, couleur de l'auteur sinon) à gauche d'une citation plate, indentée de 29 ; Android cite dans la bulle.
- Libellés d'auteur « Vous » / « Humeur » / nom ; texte cité avec mentions et lineLimit selon la densité (QuotedReplyPresentation.previewLineLimit(.focal)) ; miniature du média cité et repli « Médias ».
- Gestes : tap = saut à l'original (ReplyJump), tap sur l'auteur = fiche profil, tap sur le média cité = visionneuse ; actions TalkBack équivalentes.
- Citation d'une story rendue comme carte-scène avec rail, qui ouvre la story (opensQuotedTarget).

Rendu : Rail de 2,5 dp, espacement 8 dp avec la carte, indent gauche de 29 ; titre sur une ligne, aperçu sur 2 lignes.

Transposition Android : Text concaténé inline -> AnnotatedString avec inline content pour les mentions ; fixedSize vertical -> Modifier.height(IntrinsicSize.Min).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalQuoteRail.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyThreads.kt`

### Les messages supprimés, notices système et notices d'appel s'affichent comme des lignes discrètes du fil

`clist-focal-system-rows` · Android : **partielle** · P1 · effort S

FocalSystemRows rend les messages non standard dans le fil plat : « Message supprimé » en italique muet indenté de 29 pt, notice système centrée (texte 12,5 pt medium muet avec heure de 9,5 pt au-dessus), et notice d'appel (BubbleCallNoticeView) dont le tap rappelle (onCallBack) et dont l'appui long ouvre le détail d'appel, ainsi que les arrivées/départs sans avatar.

Écarts :
- Les types de rendu existent (System, Deleted, Burned) mais s'affichent dans le gabarit bulle ; fournir les rangées plates correspondantes (supprimé italique muet à indent 29, notice centrée 12,5 sp medium muette avec heure 9,5 sp).
- Notice d'appel avec rappel au tap et détail d'appel en appui long (CallSummaryMetadata) ; ouverture du profil d'un participant depuis une notice d'arrivée.
- Libellé TalkBack combiné pour chaque notice.

Rendu : Texte muet centré 12,5 pt medium ; heure 9,5 pt semibold à 70 % d'opacité ; suppression en italique body.

Transposition Android : Switch sur content.kind -> when sur BubbleRenderKind.Kind existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Row/FocalSystemRows.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleRenderKindPresenter.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### L'avatar d'une rangée a ses propres gestes : profil ou infos, story, mood, menu contextuel et indicateur « il est ici »

`clist-lentille-row-avatar-actions` · Android : **partielle** · P1 · effort S

LentilleRowAvatar branche l'avatar de la rangée : tap = profil de l'interlocuteur pour un direct, infos de la conversation pour un groupe ; tap sur l'anneau de story d'un direct = ouvre le viewer ; tap sur le badge mood = bulle ancrée au point touché ; menu contextuel dédié (direct : infos conversation + voir le profil ; groupe/public/global/broadcast : infos conversation + créer un lien de partage si autorisé). L'avatar porte aussi la présence (amis acceptés seulement), le badge « le pair est ici » (#8892, direct) et l'anneau décoré du profil.

Écarts :
- Tap avatar : direct -> profil de l'interlocuteur ; groupe/public/global -> feuille d'infos de la conversation (Android ouvre toujours le fil).
- Tap sur l'anneau de story (direct avec story) -> viewer de story ; tap sur le badge mood -> bulle ancrée (voir clist-root-status-bubble-layer).
- Menu contextuel d'avatar à rôles (ConversationAvatarMenu.directRoles / groupRoles(canShare)) : Infos conversation, Voir le profil, Créer un lien de partage pour group/public/global/broadcast.
- Badge « le pair est ici » (isPeerHere) sur l'avatar d'un direct et anneau décoré du profil (participantRing) ; avatar de groupe = image de la conversation, avatar de direct = avatar du pair.
- Présence sur l'avatar uniquement pour les amis acceptés (la loi serveur filtre déjà) ; ne jamais fabriquer de pastille quand la donnée est absente.

Rendu : Menu d'avatar : icônes SF info.circle.fill, person.circle.fill, link.badge.plus -> équivalents Material ; ancrage sur l'avatar de 44 dp.

Transposition Android : AvatarContextMenuItem -> DropdownMenu ancré à l'avatar ; onTap callbacks -> paramètres lambda de MeeshyAvatar.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`

### Au démarrage à froid la liste montre des rangées squelettes de la même taille que les vraies, jamais un spinner sur un cache non vide

`clist-lentille-skeleton-row` · Android : **partielle** · P1 · effort S

LentilleSkeletonRow reproduit le gabarit de la rangée réelle (84 pt, avatar de 44 pt, trois lignes dont la date à droite) avec des textes de substitution masqués par le redacted/shimmer, pour que l'hydratation ne fasse pas sauter la ligne 2. Caché à l'accessibilité. Affiché uniquement sur cache vide.

Écarts :
- Aligner SkeletonList (8 lignes, avatar 48 dp) sur le gabarit de la rangée plate : hauteur 84 dp, avatar 44 dp, nom + aperçu + date à droite avec mêmes polices.
- Shimmer/placeholder masqué à TalkBack ; ne jamais afficher le squelette quand le cache contient des données (même périmées).

Rendu : Cercle 44 dp gris muet à 30 %, trois barres de la largeur des textes réels, date alignée à droite.

Transposition Android : redacted(reason: .placeholder) -> MeeshySkeletonBox / Modifier.placeholder shimmer.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`

### La pastille de synchro, la bannière d'appel, le mini-lecteur audio et l'onboarding vivent dans un chrome global ordonné

`clist-root-chrome-layer` · Android : **partielle** · P1 · effort M

RootChromeLayer monte, dans un ordre précis, la pastille de synchronisation (bande du bas, masquée pendant le lecteur de réels), la couche de présentation d'appel (cover plein écran, PiP, pastille, bulle, bannière d'appel en attente, isolée pour que le tick de durée à 1 Hz et les stats WebRTC n'invalident que cette couche), le mini-lecteur audio hoisté (masqué quand on est déjà dans la conversation qui joue ; son tap navigue vers la conversation par id), la bannière du joueur (Progression), les animations spring du flux et du menu, puis en tout dernier calque l'onboarding post-inscription et la feuille « Validez votre compte ».

Écarts :
- Pastille de synchro globale dans la bande du bas avec masquage pendant les réels (voir clist-syncpill-capsule) ; Android n'a qu'un bandeau plat dans la liste.
- Isoler la présentation d'appel dans un scope de recomposition dédié pour que le tick de durée ne recompose pas la racine.
- Mini-lecteur audio global hoisté à la racine : barre de lecture hors conversation, masquée dans la conversation qui joue, tap -> navigation par id vers le message audio.
- Onboarding post-inscription et invitation d'activation (« Validez votre compte ») posés comme DERNIER calque au-dessus de la pastille, du mini-lecteur et de la bannière d'appel.
- Animations spring (0,4/0,85) du flux et spring par défaut du menu flottant à aligner sur MeeshyFloatingChrome.

Rendu : Ordre z : contenu < pastille < bannière d'appel/mini-lecteur < onboarding ; modales (appel plein écran, composeurs) au-dessus de tout.

Transposition Android : overlay SwiftUI chaîné -> Box racine avec ordre z explicite ; mini-lecteur -> contrôles MediaSession + barre Compose ; PiP -> Picture-in-Picture Android.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/ChromeAvatarButton.kt`

### Un tap sur un push, une carte de lecture, un lien ou un raccourci ouvre le bon écran une seule fois

`clist-root-intent-routing` · Android : **partielle** · P1 · effort M

RootIntentRoutingLayer branche neuf récepteurs d'intentions dans un ordre fixe : navigateToConversation, tap push (le payload en attente est rejoué à un montage tardif puis effacé, ce qui sert le démarrage à froid), navigation par id avec message surligné, retour depuis la carte Now Playing vers la conversation et le message audio en cours, sendMessageToUser, openProfileSheet, openStoryComposer, pushNavigateToRoute et l'URL de partage. Seules les URL .share passent par le Router ; toutes les autres passent par DeepLinkRouter pour ne pas déclencher deux fois l'appel et la navigation. Le composer de story démonté avec une racine précédente est rouvert sur son brouillon, une seule fois.

Écarts :
- Consommation unique du payload push en attente (rejoué si le composant monte après le splash, effacé après navigation) ; vérifier le démarrage à froid via FCM data message.
- Navigation par id avec highlight de message scopé (StarredMessages -> conversation + message) et sans helpers de résolution dans la vue appelante.
- Retour depuis la notification média (équivalent Now Playing) vers la conversation et le message audio en cours de lecture, avec garde isKnownConversation.
- Intentions sendMessageToUser, openProfileSheet (userId, username), openStoryComposer (depuis StoryExpiredContent), pushNavigateToRoute.
- Un seul chemin pour les URL : seules les intentions de partage passent par le routeur, le reste via le résolveur de deep link, pour éviter le double appel API et la course de navigation.
- Réouverture du composer de story démonté avec la racine précédente (changement de racine tablette/pliable) sur son brouillon, une seule fois ; reprise de la pile par la nouvelle racine (rootNavigationHandoff).

Rendu : Aucun rendu propre : tout est routage ; aucune navigation en double ni clignotement d'écran d'accueil.

Transposition Android : NotificationCenter -> SharedFlow exposé par un holder d'intentions + onNewIntent ; carte Now Playing -> PendingIntent de la notification MediaSession ; iPad root -> classes de taille de fenêtre (WindowSizeClass).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`

### L'app s'ouvre sur le bon écran (connecté, connexion ou rien) sous un splash sans clignotement, avec la célébration d'arrivée

`clist-root-launch-routing` · Android : **partielle** · P1 · effort S

RootPresentationRules est une loi pure : la route est « connected » dès que la session est authentifiée ; sinon « login » seulement une fois la session vérifiée, hors aperçu et hors changement de compte, et « none » dans tous les autres cas (jamais d'écran de connexion qui clignote). Elle décide aussi de la couverture invité (session invitée délibérée par-dessus un compte), de l'éligibilité du contenu visiteur, de l'onboarding (jamais terminé, non authentifié, splash fini, ni session invitée, ni demande visiteur) et de la célébration. RootScene empile le contenu de session (opacité 0 tant que le splash couvre), la célébration d'arrivée plein écran (fondu 0,35 s, bouton Passer, contenu sous-jacent masqué à l'accessibilité) et le splash en trois phases dont la tenue est plafonnée.

Écarts :
- Extraire une loi pure testable (core/model) équivalente à RootPresentationRules.route : connected / login / none, avec none pendant la vérification de session, le changement de compte et l'aperçu.
- showsGuestCover : une session invitée délibérée (lien de partage) recouvre le compte même connecté ; une session invitée non délibérée seulement si non authentifié.
- showsOnboarding et visitorContentIsEligible : onboarding seulement si jamais terminé, non authentifié, splash non couvrant, sans session invitée ni demande visiteur.
- Splash en trois phases covering / revealing / gone avec contenu à opacité 0 sous le splash et holdSplashUntilCeiling (plafond d'attente) ; Android n'a qu'un booléen showSplash avec plancher de 1,2 s.
- Célébration d'arrivée plein écran (ArrivalCelebrationView) après inscription : fondu 0,35 s, bouton Passer, zIndex au-dessus du contenu, contenu sous-jacent exclu de TalkBack pendant la célébration.
- Les écrans de preview DEBUG (onboarding, carte de lien, mot de passe oublié…) ne sont pas à porter.

Rendu : Fondu de la célébration 0,35 s easeInOut ; le splash couvre tout au démarrage à froid et se retire en fondu ; aucun écran de connexion ne doit apparaître avant la fin de la vérification de session.

Transposition Android : Splash -> SplashScreen API (Android 12+) puis overlay Compose ; ZStack -> Box avec zIndex ; fullScreenGate -> overlay plein écran qui consomme les touches.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/App/RootPresentationRules.swift`
- `apps/ios/Meeshy/App/RootScene.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/LaunchRouter.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshySplashScreen.kt`

### La bannière de notification se balaie vers le haut pour disparaître et un appui long ou un tirage vers le bas ouvre l'aperçu de la conversation

`clist-root-notification-toast` · Android : **partielle** · P1 · effort M

RootNotificationToastOverlay monte au sommet de la racine le toast temps réel (notification:new). Tap : la notification est consommée (consume) puis le contenu s'ouvre, sauf si le tap est supprimé. Balayage vers le haut : la carte suit le doigt (offset y limité aux valeurs négatives) et se ferme au-delà du seuil ou de la vélocité prédite. Appui long 0,35 s ou tirage vers le bas : ouvre l'aperçu, une feuille grande/moyenne contenant la conversation en mode preview (derniers messages + composeur simple) avec un bouton pour ouvrir la conversation complète (la feuille se ferme, puis le push est joué 100 ms plus tard). Transition spring bouncy + déplacement par le haut ; en reduce-motion simple fondu 0,2 s.

Écarts :
- Geste de balayage vers le haut avec la carte qui suit le doigt et décision pure (dismiss / preview / none) selon translation et fin prédite (NotificationBannerSwipe.outcome).
- Appui long 0,35 s et tirage vers le bas : ouvrir l'aperçu de la conversation en ModalBottomSheet (grande/moyenne, poignée visible) ; nécessite un mode preview du ChatScreen (lecture des derniers messages + composeur simple) qui n'existe pas côté Android.
- Bouton « ouvrir la conversation complète » depuis l'aperçu : fermer la feuille puis naviguer 100 ms après pour éviter la course présentation/fermeture.
- Tap : consommer la notification (marquée lue localement et côté serveur, #6999) avant de naviguer, comme une ligne de cloche tapée ; supprimer le tap quand un overlay modal le justifie (suppressToastTap).
- Transition spring bouncy + glissement depuis le haut (fondu simple 0,2 s en reduce-motion) ; marge haute xxl sous la barre système ; z-order au-dessus de toute la racine, y compris la pastille de synchro, qui lui cède la place.
- Présentation résolue UNE fois à la pose du toast (currentToastPresentation) : la vue ne la recalcule pas à chaque recomposition.

Rendu : Carte en verre alignée en haut sous la barre système, padding horizontal 12 dp ; ressort rebondissant à l'entrée ; la carte ne descend jamais sous le doigt (seul le haut suit).

Transposition Android : Toast SwiftUI -> overlay Compose avec pointerInput/detectVerticalDragGestures et combinedClickable ; sheet detents -> ModalBottomSheet ; reduce-motion -> Settings.Global.ANIMATOR_DURATION_SCALE.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerHost.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationBannerViewModel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyToast.kt`

### Toucher une mention ou un avatar ouvre la fiche profil en feuille, et le partage et la création de conversation passent par des feuilles

`clist-root-profile-share-sheets` · Android : **partielle** · P1 · effort M

RootSheetsLayer porte les présentations modales de la racine : fiche d'un participant sans compte (par conversation + participant), fiche profil par deep link (grande/moyenne, poignée, humeur, présence connue, liste des posts de l'utilisateur qui ouvre un post ou un réel, bouton Appeler qui ferme la feuille et lance l'appel 0,3 s plus tard), feuille de partage unique pilotée par le contenu à partager (se ferme à l'ouverture d'une conversation), relais de partage venu de l'extension, nouvelle conversation, confirmation d'un lien d'appel. Le flux (feed) se replie quand la pile devient non vide et revient au retour, avec accès rapide « Publier un post ». Un deep link reçu avant le montage de la racine est consommé dès l'apparition.

Écarts :
- Fiche profil par mention/deep link en FEUILLE (grande/moyenne) avec humeur, présence résolue, liste de posts de l'utilisateur (ouvrir un post pousse postDetail et ferme la feuille ; ouvrir un réel lance le lecteur) et bouton Appeler (ferme puis appelle après 0,3 s) ; Android ouvre un écran plein route profile/{userId}.
- Fiche d'un participant visiteur sans compte (identité vivant dans la conversation) accessible depuis la racine et pas seulement depuis le chat.
- Feuille de partage unique (moyenne/grande) pilotée par pendingShareContent, fermée à l'ouverture d'une conversation, et relais de partage d'extension qui la rouvre (cas sans session ou conversation chiffrée).
- Nouvelle conversation présentée en feuille depuis n'importe quel écran (NewConversationSheetHost) et non seulement comme route.
- Confirmation d'un lien d'appel (callLinkConfirmationSheet) dans la fenêtre principale.
- Flux de publication rapide : le feed se replie/revient avec la pile (spring 0,3/0,8) et pendingOpenFeedComposer ouvre le composeur de post.

Rendu : Feuilles grande/moyenne avec indicateur de drag ; la fiche profil garde ses onglets de posts ; animation spring 0,3/0,8 pour le feed.

Transposition Android : .sheet(item:) avec detents -> ModalBottomSheet ; Share Extension -> ACTION_SEND (ShareTargetActivity existe déjà) ; App Group handoff -> fichier/contentprovider interne.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`

### Chaque destination s'ouvre dans la pile avec son propre en-tête, et ouvrir une conversation depuis une notification remplace proprement la précédente

`clist-root-route-registry` · Android : **partielle** · P1 · effort M

RootRouteDestination est le registre des 27 routes poussées dans la NavigationStack : conversation, réglages, profil, contacts, découverte de personnes et à proximité, communautés (liste, détail, création, réglages, membres, invitation), notifications, stats, progression/jeu (6 pages), hub de liens, affiliation, liens de suivi, liens de partage, liens de communauté, export de données, détail de post, hashtag, favoris, messages étoilés, demandes d'ami, cible de notification de story, projecteur de mood. Chaque écran masque la barre système et porte son en-tête (retour en verre). La conversation reçoit un contexte de réponse en attente, un mode de lecture forcé éphémère et un message d'atterrissage, et est identifiée par id : ouvrir B depuis A (notification) force la reconstruction de la vue et vide le brouillon de A.

Écarts :
- Routes iOS sans écran Android : communityList, communityDetail, communityCreate, communitySettings, communityMembers, communityInvite, userStats, progression et ses pages (section, règles, carnet, concept), gamePage, hub de liens, affiliate, trackingLinks, communityLinks, hashtagResults, friendRequests, storyNotificationTarget, moodSpotlight (chaque écran relève de son domaine ; ici déclarer les routes typées et leurs deep links).
- Conversation : consommer un replyContext en attente à l'arrivée puis le remettre à nul ; forcedReadingMode strictement éphémère (jamais écrit en préférence) ; landsOnMessage pour atterrir sur un message précis.
- Identité par conversation : ouvrir B alors que A est affiché doit remplacer la pile (path = [B]) et détruire la vue de A avec flush de son brouillon, au lieu de réutiliser l'instance et de rester sur A.
- reportsConversationViewing : déclarer la conversation affichée au gestionnaire de notifications pour supprimer bannières et notifications système de l'écran ouvert (Android ne le fait que pour la bannière in-app via les arguments de route).
- Fermeture de la liste des notifications : rafraîchir le compteur de non-lus à la disparition de l'écran.
- Depuis le détail d'une communauté, convertir l'ApiConversation sélectionnée avec le currentUserId avant de pousser la route conversation.

Rendu : Aucune barre de navigation système : chaque écran porte son en-tête avec bouton retour en verre ; le glissement depuis le bord reste servi.

Transposition Android : NavigationStack(path) + Router -> NavHost avec routes typées (Navigation Compose type-safe) ; pendingReplyContext et forcedReadingMode -> SavedStateHandle ou ViewModel partagé à portée activité.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootRouteDestination.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/core/navigation/src/main/kotlin/me/meeshy/core/navigation/Module.kt`

### Une section repliée affiche le total de ses messages non lus à côté du chevron, accordé correctement dans chaque langue

`clist-unread-folded-section` · Android : **partielle** · P1 · effort S

Replié, une section retire ses rangées et leurs pastilles : SectionFoldedUnread somme donc les non-lus (max 0 par rangée) sur l'en-tête quand la section est repliée et vaut zéro quand elle est dépliée (les rangées le portent). Sans plafond ici : « 99+ » est le fait de la pastille et le lecteur d'écran annonce le nombre exact. La valeur d'accessibilité dit « Développée » ou « Réduite, N messages non lus ». UnreadCountLabel porte les libellés pluriels accordés (messages, notifications) par le catalogue (variations plural) en un seul site de rendu.

Écarts :
- Compte des non-lus de la section repliée à côté du chevron (0 si dépliée) ; Android affiche le nombre de LIGNES (count = items.size).
- Valeur d'accessibilité de l'en-tête : « Développée » / « Réduite, N messages non lus » (semantics stateDescription).
- Libellés pluriels via plurals (messages non lus, notifications non lues) pour l'accord genre/nombre en fr, es, pt et en ; la pastille de rangée coupe à 99 sans « + » (coerceAtMost(99)) au lieu de « 99+ ».
- Persister l'état déplié/replié de chaque catégorie côté serveur (persistCategoryExpansion -> categoryStore.setExpanded) ; Android le garde en rememberSaveable local.

Rendu : Pastille de non-lus à côté du chevron de l'en-tête de section, même pastille que les rangées (rouge, chiffre blanc, 99+).

Transposition Android : String(localized:) pluriels -> res/values/plurals.xml (quantity one/other) ; VoiceOver value -> semantics { stateDescription }.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SectionFoldedUnread.swift`
- `apps/ios/Meeshy/Features/Main/Components/UnreadCountLabel.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/CollapsibleSection.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRow.kt`

### La liste s'organise en sections World Wide, épinglées, catégories, appels en cours puis périodes (aujourd'hui, hier…), avec les brouillons en tête

`clist-vm-ordering-sections` · Android : **partielle** · P1 · effort M

ConversationListViewModel+Ordering regroupe les conversations filtrées. ConversationListWorldHead extrait la conversation mondiale (isWorldWide, non archivée) en une première section dédiée (id world.head, ordre -1). Avec Lentille (défaut), les sections sont : épinglées (sans catégorie), catégories de l'utilisateur (tri orderInCategory), section LIVE (appels en cours), puis sections temporelles (aujourd'hui, hier, cette semaine… selon listActivityAt et le fuseau local) via LentilleSectionResolver. L'ordre intra-section met les épinglées d'abord (par activité), les brouillons ensuite (par date du brouillon), puis listActivityAt décroissant. Le calcul se fait hors du thread principal et est annulable.

Écarts :
- Section « World Wide » (conversation isWorldWide non archivée) servie en tête avec identité dédiée ; absente côté Android.
- Sections Lentille : épinglées -> catégories (tri orderInCategory) -> LIVE (appels en cours) -> sections temporelles (aujourd'hui, hier, cette semaine…) selon le fuseau local ; Android a épinglées -> catégories -> un seul fourre-tout « Mes conversations ».
- Ordre intra-section aligné : épinglées par activité, brouillons par date du brouillon, puis listActivityAt décroissant ; une catégorie manquante ramène la conversation dans le fourre-tout.
- Calcul des sections hors thread principal, annulable, avec groupedCorpusCount ; la section LIVE dépend d'un fournisseur d'appels en cours (clist-lentille-row-live-call).

Rendu : En-têtes de section avec icône/couleur de catégorie, chevron de repli et pastille de non-lus repliés ; World Wide en tête sans en-tête propre à confirmer.

Transposition Android : Task.detached -> withContext(Dispatchers.Default) dans un flow combiné ; fuseau -> java.time.ZoneId.systemDefault().

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Ordering.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListWorldHead.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSections.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DraftAwareOrdering.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationFilterBar.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationActivityHeat.kt`

### L'aperçu d'appui long montre les derniers messages avec chargement, vide ou indisponible, déchiffrés ou scellés, dans la langue du lecteur

`clist-vm-preview-loader` · Android : **partielle** · P1 · effort M

ConversationListPreviewLoader charge les cinq derniers messages d'une conversation avec des phases (loading, loaded, empty, unavailable) et trois intentions : prefetch (cache seul), ensure (réseau si le cache est absent ou périmé) et open (réseau toujours), dédoublonnées avec montée en gamme d'une charge en vol. Un résultat réseau n'est jamais écrasé par un cache plus ancien (provenance). Les messages chiffrés non déchiffrés sur l'appareil sont scellés (contenu vidé), les déchiffrés restent lisibles. Les traductions du cache sont élues par le prisme du lecteur (texte servi par message) et une empreinte (id, mises à jour, édition, suppression, langue servie) évite les redessins inutiles.

Écarts :
- Phases explicites loading / loaded / empty / unavailable ; Android charge uniquement depuis le cache Room (jamais le réseau) et ne distingue que null/liste.
- Intentions prefetch / ensure / open avec dédoublonnage et montée en gamme (open > ensure > prefetch) et suivi de provenance (staleCache, freshCache, network).
- Cinq derniers messages ; E2EE : message chiffré non déchiffré sur l'appareil scellé (contenu vidé), déchiffré lisible.
- Traductions du cache élues par le prisme du lecteur (ReaderPrism / PrismTranslationResolver) -> texte et langue servis par message ; Android applique displayContent par message mais sans élection de rang ni empreinte.
- Empreinte de rendu (id, updatedAt, editedAt, deletedAt, langue servie) pour ne redessiner que si changée ; rendu de l'aperçu avec le même composant de rangée plate (#11208).

Rendu : Carte d'aperçu compacte dans le menu : 5 lignes max, état de chargement discret, texte « vide » ou « indisponible » sobre.

Transposition Android : ObservableObject @Published states -> StateFlow<Map<String, PreviewState>> ; contextMenu preview -> aperçu dans le menu d'appui long ou BottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListPreviewLoader.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPreviewMessages.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Épingler, rendre muet, archiver, supprimer, renommer, classer ou marquer non lu agit tout de suite et survit à la synchro

`clist-vm-row-actions-optimistic` · Android : **partielle** · P1 · effort S

ConversationListViewModel+Actions applique les actions de rangée de façon optimiste via le store : épingler/désépingler, muet, renommer (OfflineQueue updateConversation avec clientMutationId et titre rogné non vide), marquer lu (ignoré côté réseau si la conversation est déjà ouverte ; purge locale), marquer non lu (avec ExplicitUnreadMarks qui fait survivre le marquage à la réconciliation serveur et ferme le détail ouvert), archiver/désarchiver, supprimer pour moi (balaie aussi les transcriptions d'appel locales), déplacer vers une section et emoji favori. clearUnreadLocally met aussi à jour les groupes déjà calculés.

Écarts :
- ExplicitUnreadMarks (note / consume / clear) : un « marquer non lu » explicite doit survivre à la réconciliation des non-lus après synchro et fermer le détail ouvert (conversationLeavesDetail) ; non vérifié côté Android (markUnreadOptimistic seulement).
- Marquer lu : ne pas dispatcher le read-receipt réseau quand la conversation est déjà ouverte (gestionnaire de toasts ou socket active), faire seulement la purge locale (shouldDispatchListMarkAsRead).
- Renommage via la file hors ligne (updateConversation) avec clientMutationId et titre rogné non vide ; Android utilise setCustomName via préférences.
- Supprimer pour moi : balayer les transcriptions d'appel locales (CallTranscriptStore) des messages de la conversation.
- clearUnreadLocally : mettre aussi à jour les groupes de sections déjà calculés pour que la pastille disparaisse sans attendre le regroupement.

Rendu : Retour visuel instantané sur la rangée (épingle, muet, disparition) ; swipe pin/archive existant à conserver.

Transposition Android : ConversationStore.apply(.setPinned…) -> ConversationRepository.*Optimistic ; OfflineQueue -> OutboxDrainer/OutboxFlushWorker existants.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Actions.swift`
- `apps/ios/Meeshy/Features/Main/Services/ExplicitUnreadMarks.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationCategoryReassignment.kt`

### Un push de message fait remonter la conversation, les brouillons se trient en tête et le badge de l'app suit les non-lus

`clist-vm-subscriptions-push-drafts-badge` · Android : **partielle** · P1 · effort S

ConversationListViewModel+Subscriptions écoute le signal de notification de message : si la conversation est connue elle remonte en tête (sauf si c'est déjà son dernier message), sinon elle est découverte par id. Les changements du DraftStore (debounce 300 ms) recalculent les résumés de brouillon (texte rogné + date) et re-trient la liste. Le badge de l'application et le registre des notifications se synchronisent sur les changements d'identifiants, de non-lus ou d'épingle (debounce 200 ms, seulement après le premier chargement).

Écarts :
- Signal de push de message -> bump en tête d'une conversation connue (ignoré si déjà le dernier message) ou découverte par id d'une inconnue.
- Brouillons : écouter le store avec debounce 300 ms, recalculer les résumés (texte rogné, updatedAt) et re-trier ; vérifier la réactivité d'Android au changement de brouillon.
- Badge d'icône et registre de notifications synchronisés avec le total de non-lus / épinglées (debounce 200 ms, après le premier chargement) ; Android s'appuie sur les notifications système sans enregistrement explicite des conversations.

Rendu : Aucun rendu propre ; la rangée remonte et la pastille se met à jour.

Transposition Android : NotificationCoordinator.registerConversations -> NotificationManager (canaux, groupes par conversation) ; badge d'icône -> badge de notification du lanceur.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Subscriptions.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DraftAwareOrdering.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/ConversationDraftStore.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/NotificationRevocation.kt`

### Les Réels s'ouvrent par un dévoilement depuis le bouton Flux et se referment en sens inverse

`cl-root-reels-reveal` · Android : **partielle** · P2 · effort M

Quand ReelsPresenter reçoit un lancement, ReelsRevealContainer révèle le lecteur avec un masque issu de la position du bouton Flux (progression 0->1 en 0.35 s, 0.18 s en Reduce Motion), puis retire le masque et active les gestes ; à la fermeture, pause vidéo/audio, haptique légère et masque inverse en 0.3 s. Le conteneur du lecteur gère l'échec d'ouverture (ReelOpenFailureView avec Réessayer/Fermer), l'ouverture du profil, d'une story (groupe unique) ou du détail d'un post, et masque l'écran de liste sous-jacent pendant la couverture (ReelsCover).

Écarts :
- Android ouvre les Réels comme une route (reels?seed=) sans dévoilement circulaire depuis le bouton flottant ni transition inverse.
- Écran d'échec d'ouverture d'un réel (depuis notification/lien) avec Réessayer et Fermer.
- Pause de tout média (vidéo partagée + audio) et haptique à la fermeture ; masquage de l'écran dessous pour économiser le rendu.
- Navigation depuis le lecteur vers profil, story (groupe unique) ou détail de post.

Rendu : Dévoilement circulaire depuis le centre du bouton Flux, 0.35 s easeOut (ouverture) et 0.3 s easeIn (fermeture).

Transposition Android : Masque animé -> Modifier.drawWithContent avec clip circulaire (Path) animé par Animatable, ou SharedTransition vers l'écran Réels.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

</details>

Android existant : `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsViewModel.kt`

### En lisant le fil, l'en-tête et la barre de saisie s'effacent pendant le geste, et le premier défilement ferme d'abord le clavier

`clist-focal-chrome-hide-keyboard-first` · Android : **partielle** · P2 · effort S

EdgeHiddenChrome translate l'en-tête et la barre de composition de 28 pt vers leur bord et les fond en 0,25 s (easeOut), en coupant les touches pendant qu'ils sont masqués. FocalChromeReturn les ramène seulement quand le doigt est levé et que la décélération restante est inférieure ou égale à 160 pt. KeyboardFirstScroll fait fermer le clavier AVANT de replier le chrome lors d'un premier défilement vers les anciens messages, et empêche le chrome de se replier si le clavier était ouvert au début du geste.

Écarts :
- ScrollMotionVisibility (seuil 160 ms) n'est utilisé que par la liste et le feed ; l'appliquer au fil avec les règles iOS (masqué pendant le geste, retour quand décélération restante <= 160).
- Translation de 28 dp vers le bord + fondu easeOut 0,25 s + hit-testing désactivé pendant le masquage (EdgeHiddenChrome).
- KeyboardFirstScroll : loi pure dismissesKeyboard(keyboardOpen, towardOlder) et chromeMayCollapse(keyboardOpenAtGestureStart, keyboardOpen) ; ferme le clavier (IME) au premier défilement vers les anciens messages avant de replier le chrome.

Rendu : Glissement de 28 dp vers le haut (en-tête) ou le bas (composeur), fondu à 0 en 0,25 s.

Transposition Android : keyboardWillShow/Hide -> WindowInsets.isImeVisible ; nestedScroll connection pour suivre le geste et la décélération.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Chrome/EdgeHiddenChrome.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/FocalChromeReturn.swift`
- `apps/ios/Meeshy/Features/Main/Focal/Core/KeyboardFirstScroll.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/ScrollMotionVisibility.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Mes stories, le lecteur de story et les composeurs s'ouvrent depuis n'importe quel écran sans doublon

`clist-root-story-doors` · Android : **partielle** · P2 · effort M

RootStoryDoorsLayer monte une seule fois à la racine : la page « Mes stories » (en cours et passées) ouverte depuis la tuile du profil avec ses actions (ouvrir le lecteur, créer, éditer, reprendre un brouillon), le lecteur de story en plein écran avec transition zoom et réponse qui ouvre la conversation avec contexte de réponse, le composeur de création (monté une fois car la tray de stories est instanciée deux fois), le cover d'édition, le cover « entrée externe » alimenté par le dossier d'extension de partage, la célébration d'un palier d'engagement, plus la tâche de démarrage de la racine (connexion socket, abonnements, chargements parallèles).

Écarts :
- Page « Mes stories » (en cours + passées) en feuille depuis la tuile Stories du profil, avec écouteur unique pour .openMyStories et actions viewer / créer / éditer / reprendre un brouillon.
- Viewer de story présenté depuis une conversation avec transition zoom et réponse -> navigation vers la conversation avec le contexte de réponse (navigateToStoryReply).
- Composeur de création monté une seule fois à la racine (jamais par tray), cover d'édition (StoryEditSession) et cover d'entrée externe alimenté par le consommateur de handoff de partage.
- Célébration d'un palier d'engagement (engagementReveal) posée à la racine, partagée entre téléphone et tablette.
- Le titre de scène de fenêtre (iPad Stage Manager) est sans objet côté téléphone ; à traiter seulement pour le mode multi-fenêtre Android.

Rendu : Transition zoom depuis l'anneau de story de la rangée vers le viewer ; les composeurs sont des covers plein écran, jamais empilés.

Transposition Android : fullScreenCover -> destination plein écran ou Dialog fullscreen ; zoomTransitionNamespace -> SharedTransitionLayout / shared element transition.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`

### Le fond de l'app (dégradé et orbes ambiants) suit le thème courant sans coût par image

`clist-root-themed-background` · Android : **partielle** · P2 · effort S

RootThemedBackground peint le dégradé du thème et ses orbes ambiants (couleur, opacité, taille, offset propres à chaque palette, flou de 25 % de la taille) rasterisés en une seule texture (drawingGroup) pour ne coûter aucune composition par frame ; il est identique sur iPhone et iPad.

Écarts :
- Orbes lus depuis la palette du thème courant (ThemePalette.ambientOrbs : couleur, opacité, taille, offset par thème) ; Android code en dur trois orbes indigo avec une échelle 0,6 en clair.
- Rasteriser le fond une seule fois (graphicsLayer offscreen/cache) ; Modifier.blur(70.dp) est recalculé sans mise en cache et dégrade sous API 31.
- Flou proportionnel à la taille de l'orbe (rayon = taille × 0,25) au lieu d'une constante.

Rendu : Dégradé du thème plein écran ignorant les safe areas ; orbes diffus aux positions par thème.

Transposition Android : drawingGroup -> Modifier.graphicsLayer(compositingStrategy = Offscreen) / drawWithCache.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyBackground.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyGradients.kt`

### « X écrit… » apparaît sur la rangée et disparaît quand X envoie son message ou après 15 s de silence

`clist-vm-typing-tracker` · Android : **partielle** · P2 · effort S

ConversationListTypingTracker suit qui écrit dans chaque conversation : sa propre frappe est ignorée, plusieurs frappeurs sont gérés, le nom affiché est choisi de façon déterministe (tri par nom d'affichage puis pseudo), un typing:stop ne retire que cet utilisateur et la ligne reste allumée tant qu'un autre écrit. Un délai de sécurité de 15 s par conversation, réarmé à chaque typing:start, efface la frappe si le stop est perdu ; un message reçu de l'expéditeur met aussi fin à sa frappe dans cette conversation.

Écarts :
- Un message reçu de l'expéditeur doit terminer sa frappe dans cette conversation (messageReceived -> handleTypingStopped) ; Android ne réagit qu'à typing:stop et au délai de sécurité.
- Harmoniser le délai de sécurité : iOS le réarme par conversation (15 s), Android par couple conversation + utilisateur.

Transposition Android : Timer.scheduledTimer -> Job avec delay(15 s) ; Combine PassthroughSubject -> SharedFlow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListTypingTracker.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTypingRoster.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Le bouton lien de partage ouvre un sélecteur des conversations pour lesquelles on peut inviter

`cl-share-link-picker` · Android : **complète** · P1 · effort S

Depuis l'en-tête, la feuille ShareLinkPickerSheet liste uniquement les conversations dont la capacité invite est vraie (ConversationRowMenuCapabilities.invite), avec icône de type (groupe/globe), nom, type, icône lien ; état vide « Aucune conversation éligible » ; le choix ferme la feuille et ouvre la feuille Inviter mes amis de la conversation (création de lien).

Rendu : Liste simple, icône indigo500 dans un carré 32 dp, nom callout medium, type subhead secondaire, icône lien indigo400 à droite.

Transposition Android : Feuille medium/large -> écran plein (Routes.SHARE_LINK_PICKER) ; l'éligibilité vient de ShareLinkEligibility.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationListView+ShareLinkPicker.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkPickerScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ShareLinkPickerViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/CreateShareLinkScreen.kt`

### Ouvrir un lien d'invitation propose Continuer avec mon compte ou Rejoindre en anonyme, et ouvre directement si on est déjà membre

`clist-root-share-link-identity` · Android : **complète** · P1 · effort S

La page d'invitation (#7795) ne se monte que pour un lien qu'on n'a pas encore rejoint ; déjà membre, ShareLinkEntryPolicy ouvre la conversation sans rien montrer. Elle propose le compte courant (nom d'affichage ou pseudo) ou l'entrée anonyme, la session invitée étant portée par la racine au-dessus de cette vue.

Transposition Android : Feuille d'identité -> écran dédié ShareLinkEntryScreen sur la route join/{id} avec états Resolving / ChooseIdentity / OpenConversation / RequiresAccount / GuestForm / Failed.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryViewModel.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLinkEntryPolicy.kt`

### Les changements d'état d'une conversation (épingle, muet, catégorie, lecture) se reflètent dans la liste sans rechargement

`clist-vm-observation-store-merge` · Android : **complète** · P1 · effort S

ConversationListViewModel+Observation relie la liste aux sources de vérité : les changements du moteur de synchro (debounce 200 ms) relisent le cache, la liste du store fusionne l'état utilisateur (userState) dans les rangées existantes et retire celles qui ont disparu, et le store des catégories applique les nouvelles catégories (dropFirst). reloadFromCache restaure curseur et hasMore puis applique le cache frais ou périmé.

Transposition Android : Publishers du ConversationStore/CacheCoordinator -> Room Flow (source unique) + SwrCacheSource ; CategoryStore -> CategoryRepository/CategoryCatalog.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel+Observation.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CategorySocketManager.kt`

