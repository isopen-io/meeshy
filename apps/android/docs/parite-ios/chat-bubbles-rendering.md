# Parité iOS → Android : `chat-bubbles-rendering`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**57 features iOS** : 20 absentes, 31 partielles, 5 divergentes, 1 complètes sur Android. **40 lots** planifiés (≈24030 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**chat-bubbles-rendering** (couverture Android estimée ≈ 28 %)

Cette partie couvre tout ce qui dessine une conversation sur iOS : la bulle (fond par conversation, pied avec heure et coches, identité de l'expéditeur, citation à trois zones, réactions à cheval sur le coin, médias en grille, vidéo inline, vocal, stickers, avis d'appel et d'arrivée, messages protégés flou / vue unique / éphémère), la liste inversée UIKit (séparateurs de jour et de non-lus, suivi de lecture exact, bulle « écrit… », défilement vérifié vers une citation, dépliage « Lire la suite » en place), les feuilles de détail d'un message (Vu par, réactions, langues, modifications, signalement, sentiment) et quelques briques SDK (registre éphémère, service de réactions, carte d'export, détail de notification).
Android possède une bulle Compose (MessageBubble.kt, 1 200 lignes) et une liste LazyColumn inversée avec séparateurs de jour, séparateur de non-lus, glisser-pour-répondre, pastille de défilement, flou/vue unique consommée, badge éphémère, explorateur de langues, détail des réactions et signalement. Elle reste très en deçà de l'iso : aucune heure sur les bulles, aucune vidéo, aucun lecteur vocal inline (un toucher ouvre une application externe), pas d'avatar ni de rôle de l'expéditeur, pas de sticker, d'avis d'appel, d'avis d'arrivée, de « Lire la suite », de carrousel, d'overlay de réactions ni de fiche « Vu par ».
Deux écarts sont des défauts de confidentialité ou de cohérence à corriger en premier : la règle du badge « Transféré » (liste noire sur Android, liste blanche sur iOS, qui nomme encore un groupe privé) et la couleur de la bulle envoyée (accent de conversation sur Android, indigo de marque ou accent personnel sur iOS). Le panneau de traduction secondaire est aussi remplacé par un changement de langue primaire, une divergence assumée dans le code Android mais contraire à l'iso demandé.
Le chantier le plus lourd est le socle de rendu des pièces jointes (modèle de bulle enrichi, grille et vidéo, lecteur vocal avec coordinateur Media3, fichiers / contacts / positions), puis le modèle BubbleContent dont tout dépend. Estimation de couverture iso actuelle de la partie : environ 28 %.

## Notes transverses

1. ORDRE ET FICHIERS CHAUDS. Trois fichiers dépassent le plafond de 1200 lignes de la racine : ChatScreen.kt (2953), ChatViewModel.kt (2248) et MessageBubble.kt (1202). Règle du dépôt : on extrait avant d'ajouter. Les lots 'chat-bulle-decoupage-composants', 'chat-ecran-decoupage-liste', 'chat-ecran-decoupage-feuilles' et 'chat-viewmodel-decoupage-controleurs' sont donc des PRÉREQUIS à comportement constant, à fusionner en premier (le premier et le dernier n'ont aucune dépendance et partent en parallèle). Après eux, chaque lot possède ses propres fichiers (un composable ou un contrôleur par responsabilité) et ne touche aux points d'assemblage partagés que par des ajouts d'une ligne : BubbleStandardLayout.kt, BubbleCallbacks.kt, BubbleContent.kt, ChatMessageRow.kt, ChatMessageList.kt, MessageActionMenu.kt. Ces conflits sont mécaniques ; l'ordonnanceur doit tout de même fusionner les lots d'une même vague qui partagent un de ces fichiers un par un.\n2. CYCLES DE L'INVENTAIRE TRANCHÉS. L'inventaire déclare plusieurs dépendances circulaires ; elles sont cassées ainsi : écran protégé AVANT registre éphémère (le voile ne lit que la consommation serveur, le registre se branche ensuite sur BubbleRenderKindPresenter) ; moteur de lecture partagé AVANT lecteur vocal inline (le coordinateur arrière-plan/mini-lecteur vient après) ; grille AVANT plein écran AVANT vidéo inline ; glisser Répondre/Transférer AVANT sélection multiple (la sélection éteint le glisser par un drapeau) ; l'arbitre de gestes BubbleGestureArbiter est créé dans le lot de découpage de la bulle pour que carrousel, vocal et swipe le consomment sans se référencer ; identité de l'expéditeur AVANT présence « ici » (fusionnées en un lot).\n3. MODÈLE BULLE. Les lots 'chat-dto-messages-riches' (DTO filaire) puis 'chat-bulle-contenu-pieces-et-types' (kind complet, classement des pièces, protection, sticker, appel) sont le socle de presque tout. Les messages sont cachés en JSON dans MessageEntity.payload : ajouter des champs optionnels à ApiMessage / ApiMessageAttachment ne demande AUCUNE migration Room. BubbleContent est déjà une data class (égalité structurelle) : l'égalité 'comparant les champs mutables' d'iOS se prouve par des tests témoins dans 'chat-liste-items-types-et-entrees', pas par du code d'égalité à écrire.\n4. CHAÎNE MÉDIA. Briques partagées créées ici et réutilisables par d'autres domaines (feed, stories, réels, appels) : PlaybackCoordinator (chat-lecteur-media-moteur-partage, aussi cité par ARCHITECTURE.md § 15), MediaAvailabilityResolver (chat-media-disponibilite-et-telechargement, qui compose MediaAutoDownloadDecider et MediaBlobStore déjà présents), BubbleGestureArbiter, BubbleSkin, MessageDetailHost. Le lot 'chat-audio-arriere-plan-mini-lecteur' ajoute androidx.media3:media3-session au catalogue (gradle/libs.versions.toml) et un service de premier plan de type mediaPlayback au manifeste : à revoir avec les règles de permissions API 34.\n5. PRISME / PRÉSENCE / ACCENT. Le lot 'chat-bulle-prisme-drapeaux-et-panneau-secondaire' ANNULE la divergence assumée de LanguageFlagTapResolver (le toucher d'un drapeau changeait la langue primaire) : l'iso demande le panneau secondaire ; l'ADR correspondant doit être consigné dans apps/android/decisions.md. La piste audio traduite est élue par la langue du TEXTE SERVI, jamais par une descente indépendante (cycle 128). La présence n'est jamais fabriquée côté client : absente du serveur, aucun point (et 'ici' vient des seuls événements viewing:*). Couleurs : bulle envoyée = indigo de marque (#6366F1) ou accent personnel avec encre calculée ; bulle reçue = teinte OPAQUE de l'accent de conversation ; aucune couleur de bulle en dur. L'accent personnel dépend de ext:conversation-appearance (aucun modèle ConversationAppearance n'existe encore côté Android) : le lot de peau livre l'indigo de marque et un paramètre d'accent personnel nul par défaut.\n6. LOIS PURES DANS :core:model. Pour que le gate local ./apps/android/meeshy.sh jvm-check prouve l'essentiel, chaque lot pousse sa règle dans :core:model (Kotlin pur) : ForwardAttribution, ProtectionDescriptor, AttachmentKind/BubbleAttachmentLayout, BubbleFooterModel, BubbleSkin/BubbleInk, QuotedReplyPresentation, ReactionAnimationGate, LongMessageExcerpt, SeenMessageAccumulator, ScrollToMessageSettleLaw, EphemeralReceiptLedger, ReadStatus/MessageViewsFilter, CarouselAnchorLaw, VCardParser, StickerAnimation… Les écrans restent minces et sont prouvés par la CI android.yml (assembleDebug + testDebugUnitTest). :sdk-ui ne dispose que de junit+truth en test ; :feature:chat dispose de Robolectric, Turbine, MockK et coroutines-test.\n7. CHAÎNES. Chaque lot ajoute ses chaînes dans un fichier de ressources qui lui est propre (strings_<sujet>.xml) dans values, values-fr, values-es et values-pt du module concerné, jamais dans strings.xml, pour éviter les conflits. iOS sert 7 langues : Android n'en livre que 4 (en, fr, es, pt) ; ce manque est transversal (dimension 13) et n'est pas résolu par ce domaine.\n8. RISQUES CONNUS. (a) Moteur MessageCard : l'inventaire estime 1800 lignes mais le moteur iOS (MeeshySDK/MessageCard + MeeshyUI/MessageCard) pèse 4777 lignes ; le lot de loi est donc chiffré à 2000 lignes et doit être remesuré avant de démarrer. (b) Cartes de position : aucune dépendance de carte n'est dans le catalogue ; le lot propose des tuiles statiques sans clé d'API, choix à confirmer par le porteur (décision-produit) avant de coder. (c) 'chat-historique-envoi-tentatives' ajoute une table Room : migration et schéma exporté obligatoires, test de migration. (d) Les routes exactes de lecture par messages (suivi exact), de consommation de pièce et de présence 'viewing:*' sont à confirmer contre la passerelle (voir docs/superpowers/specs/2026-07-24-read-exactness-design.md et packages/shared/types/socketio-events.ts) avant le lot concerné. (e) Le lot de sticker dépend de ext:sticker-catalog-partage : StickerCatalog vit dans :feature:stories et un module ne peut pas dépendre d'une feature ; il faut le remonter dans :sdk-ui ou :core:model (domaine stories).\n9. HORS PÉRIMÈTRE ASSUMÉ. cbr-reactions-service est complet (rien à faire). MessageListViewController+ConversationStartCell est inerte côté iOS (ne pas porter). Les scènes complètes des modes de lecture Focal / Script / Rivière / Résumé (cbr-focal-reading-modes, 2500 lignes) appartiennent à un autre domaine : ici seul un petit lot de crochets de liste (chat-liste-crochets-modes-lecture, P2) est prévu, dépendant de ext:modes-lecture-focal. Le menu 'Plus' iOS (MessageMoreSheet) relève du domaine des actions de message : 'chat-fiche-message-hote' n'ajoute que les entrées de MessageAction nécessaires à ce domaine et doit être réconcilié avec lui.\n10. DOCTRINE. Chaque lot garde cache-first (jamais de spinner sur un cache non vide), mises à jour optimistes, dégradation hors ligne, 'Réduire les animations' respecté, libellés TalkBack, et tient le budget de fichier de 1200 lignes (1000 comme seuil de découpage). Le gel Kotlin est levé (#11570) : la dette du miroir Kotlin se solde ici, chaque lot qui touche une loi à miroirs (Prisme, présence, badge Transféré, résumé d'appel) la met à jour en même temps que les deux autres miroirs.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `chat-bulle-contenu-pieces-et-types` | C | P0 | M | 1000 | message-fil-decodage-complet-et-tolerant, chat-bulle-decoupage-composants | Chaque bulle sait ce qu'elle contient : vidéos, contacts, stickers, appels et protection |
| `chat-bulle-decoupage-composants` | C | P0 | L | 1300 | composer-glass-shell | La bulle se compose de petits composants à responsabilité unique, sans changement visible |
| `chat-bulle-grille-medias` | C | P0 | M | 900 | chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types, voile-puce-et-flou-des-contenus-proteges, media-disponibilite-et-telechargement-auto | Les photos et vidéos d'un message s'affichent en grille nette avec « +N » |
| `chat-bulle-peau-et-forme` | C | P0 | M | 450 | chat-bulle-decoupage-composants, chat-screen-composables-split | La bulle prend la couleur de marque, une teinte opaque de la conversation et des coins de 18 |
| `chat-bulle-pied-heure-et-coches` | C | P0 | M | 800 | chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types | Chaque bulle affiche son heure, sa coche de livraison et la marque « modifié » dans un pied soigné |
| `chat-bulle-prisme-drapeaux-et-panneau-secondaire` | C | P0 | M | 600 | chat-screen-composables-split, chat-bulle-pied-heure-et-coches, chat-viewmodel-state-split | Le Prisme se lit dans le pied : bouton traduire, drapeaux et traduction affichée sous le texte |
| `chat-citation-carte` | C | P0 | M | 900 | citation-reponse-loi-pure, media-disponibilite-et-telechargement-auto, lecture-focus-audio-et-coordination-des-lecteurs, chat-viewmodel-state-split, chat-bulle-decoupage-composants | La citation d'un message montre l'auteur, un aperçu, le média cité et le nombre de pièces |
| `chat-liste-coalescence-et-differe` | C | P0 | M | 600 | chat-liste-items-types-et-entrees, chat-viewmodel-state-split | Les rafales de traductions ne secouent pas la liste, et rien ne bouge pendant un geste |
| `chat-liste-items-types-et-entrees` | C | P0 | M | 650 | chat-screen-composables-split, chat-bulle-contenu-pieces-et-types, chat-viewmodel-state-split | La liste reste fluide : items typés, clés stables et entrées primitives par cellule |
| `chat-reactions-bande-debordante` | C | P0 | M | 600 | chat-bulle-decoupage-composants, chat-screen-composables-split, chat-bulle-peau-et-forme, chat-viewmodel-state-split | Les réactions se posent à cheval sur le coin de la bulle, avec « + » sur le dernier message reçu |
| `chat-transfere-liste-blanche` | C | P0 | S | 130 |  | Le badge « Transféré » ne nomme plus jamais un groupe privé |
| `chat-accessibilite-bulle-groupee` | C | P1 | S | 250 | chat-bulle-contenu-pieces-et-types, voile-puce-et-flou-des-contenus-proteges, chat-citation-zones-tactiles | Chaque bulle se lit d'un seul bloc au lecteur d'écran, avec ses actions nommées |
| `chat-bulle-avis-systeme-supprime-arrivee` | C | P1 | M | 450 | message-fil-decodage-complet-et-tolerant, chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types | Messages supprimés, avis système et arrivées se distinguent d'un tour de parole |
| `chat-bulle-badges-epingle-transfere-modifie` | C | P1 | S | 250 | chat-transfere-liste-blanche, chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types | Un message épinglé ou transféré le dit discrètement, au-dessus de la bulle |
| `chat-bulle-bande-renvoi` | C | P1 | S | 200 | chat-screen-composables-split, chat-bulle-peau-et-forme, chat-bulle-pied-heure-et-coches | Un message en échec porte une bande orange pour le renvoyer d'un toucher |
| `chat-bulle-carrousel-images` | C | P1 | M | 450 | chat-bulle-grille-medias, video-lecteur-en-ligne-dans-le-fil | On feuillette toutes les images d'un message dans un carrousel inline |
| `chat-bulle-citation-story` | C | P1 | S | 350 | chat-bulle-decoupage-composants, chat-bulle-badges-epingle-transfere-modifie, citation-reponse-loi-pure | Répondre à une story cite la scène elle-même, pas une ligne de texte |
| `chat-bulle-identite-expediteur-et-presence-ici` | C | P1 | M | 700 | chat-screen-composables-split, chat-bulle-contenu-pieces-et-types, chat-bulle-pied-heure-et-coches, socket-routage-evenements-ordre-arrivee, chat-viewmodel-state-split, atomes-d-avatar-loi-humeur-et-non-lus | En tête de groupe, l'expéditeur montre avatar, nom, rôle, pseudo et présence, et on voit qui est dans la conversation |
| `chat-citation-zones-tactiles` | C | P1 | M | 500 | chat-citation-carte, chat-gallery-pager-core, lecture-focus-audio-et-coordination-des-lecteurs, persist-messages-fenetre-ui-saut | Toucher une citation fait ce que l'œil attend : profil, média ou saut au message |
| `chat-emoji-seul-sans-bulle` | C | P1 | S | 200 | chat-bulle-decoupage-composants, chat-bulle-pied-heure-et-coches, chat-citation-zones-tactiles | Un emoji seul s'affiche en grand, sans bulle, avec son heure à côté |
| `chat-feuilles-reactions-et-signalement-completes` | C | P1 | S | 350 | chat-screen-hosts-and-composer-split, chat-viewmodel-state-split | Le détail des réactions s'ajoute d'un geste et le signalement demande une confirmation |
| `chat-fiche-message-hote` | C | P1 | S | 350 | chat-screen-hosts-and-composer-split | Les fiches d'un message s'ouvrent depuis un seul hôte et un seul menu |
| `chat-glisser-repondre-transferer` | C | P1 | M | 400 | chat-bulle-decoupage-composants, chat-screen-composables-split | Glisser une bulle répond ou transfère, avec un geste qui ne gêne pas la lecture |
| `chat-langues-explorateur-complet` | C | P1 | M | 550 | chat-bulle-prisme-drapeaux-et-panneau-secondaire, vocal-langue-de-piste-et-traduction-a-la-demande, chat-fiche-message-hote, chat-viewmodel-state-split | L'explorateur de langues d'un message montre chaque traduction, texte et audio, et sait en demander une |
| `chat-lien-integre-video-conversation-apercu` | C | P1 | M | 650 | chat-screen-composables-split, chat-bulle-contenu-pieces-et-types, socle-points-d-extension-de-l-app | Un lien se déplie en lecteur vidéo, en carte de conversation ou en aperçu |
| `chat-liste-prechargement-et-encarts` | C | P1 | M | 450 | chat-liste-items-types-et-entrees | Le défilement charge l'historique en avance et suit le clavier sans à-coup |
| `chat-pieces-reaction-et-apercu` | C | P1 | M | 600 | chat-screen-composables-split, chat-bulle-grille-medias, chat-viewmodel-state-split, lecture-moteur-audio-media3, video-moteur-partage-et-montage, persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee | Chaque pièce d'un lot se réagit d'un double toucher et s'inspecte d'un appui long |
| `chat-position-carte-et-plein-ecran` | C | P1 | M | 800 | chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types, map-surface-engine, envoi-message-relation-typee-et-requete, plein-ecran-kit-chrome, composer-glass-shell | Une position partagée s'affiche sur une carte miniature et s'ouvre en plein écran |
| `chat-separateurs-jour-et-non-lus` | C | P1 | M | 400 | chat-liste-items-types-et-entrees, chat-list-states-pill-and-jump | Les jours se séparent par une pastille et le fil s'ouvre sur « N messages non lus » gelé |
| `chat-sticker-gabarits-et-bulle` | C | P1 | L | 1100 | chat-sticker-loi-et-animation, chat-bulle-decoupage-composants, chat-bulle-contenu-pieces-et-types, chat-reactions-bande-debordante, feuille-de-stickers-onglets-recents-favoris, gabarits-socle-registre-et-contour, envoi-message-relation-typee-et-requete, persist-messages-repository-decoupage, composer-glass-shell, chat-viewmodel-state-split | Un sticker est le message : sans bulle, animé et qui flotte |
| `chat-sticker-loi-et-animation` | C | P1 | M | 500 | message-fil-decodage-complet-et-tolerant | Les règles d'un sticker (priorité de rendu, animation, flottement) sont fixées et testées |
| `chat-texte-long-lire-la-suite` | C | P1 | M | 450 | chat-bulle-decoupage-composants, chat-screen-composables-split, chat-bulle-peau-et-forme, prisme-surfaces-descente-unique | Un long message se replie sur un extrait et se déplie en place, sans saut |
| `chat-vu-par-donnees-et-regles` | C | P1 | M | 500 |  | Qui a reçu, lu ou pas encore vu un message se charge sans clignoter |
| `chat-vu-par-fiche` | C | P1 | M | 800 | chat-fiche-message-hote, chat-vu-par-donnees-et-regles, chat-bulle-pied-heure-et-coches, chat-bulle-identite-expediteur-et-presence-ici | La fiche « Vu par » dit qui a reçu, lu ou pas encore vu un message |
| `chat-carte-message-loi-mise-en-page` | C | P2 | L | 2000 | imager-sujet-protection-et-citation | Un message se met en page en belle carte image, selon la même loi que iOS et le web |
| `chat-carte-message-rendu-et-export` | C | P2 | M | 900 | chat-carte-message-loi-mise-en-page, chat-fiche-message-hote | Un message s'exporte en belle carte image signée Meeshy |
| `chat-fiche-historique-modifications-et-sentiment` | C | P2 | M | 600 | chat-fiche-message-hote, persist-room-migrations, persist-messages-repository-decoupage, chat-viewmodel-state-split | L'historique des modifications se relit version par version, et le sentiment se lit d'un coup d'œil |
| `chat-gestes-barre-primaire-et-glisser-deposer` | C | P2 | M | 500 | chat-selection-and-forward, chat-bulle-contenu-pieces-et-types | Un double toucher ouvre une barre d'actions primaires, et sur tablette on glisse un message hors de l'app |
| `chat-liste-crochets-modes-lecture` | C | P2 | S | 350 | chat-liste-coalescence-et-differe, fil-rangee-plate-structure | La liste sait s'endormir sous un panneau opaque et reste prête pour d'autres modes de lecture |
| `chat-vu-par-consommation-pieces` | C | P2 | M | 500 | message-fil-decodage-complet-et-tolerant, chat-vu-par-fiche | On voit qui a écouté, visionné ou ouvert chaque pièce jointe |

### Lots fusionnés ou retirés par l'architecture

- `notification-detail-message-riche` → `push-message-detail` (drop-duplicate) : Même détail de position / contact / invitation dans la notification.
- `chat-dto-messages-riches` → `message-fil-decodage-complet-et-tolerant` (merge-into) : Même ApiMessage complet et tolérant.
- `chat-citation-modele-presentation` → `citation-reponse-loi-pure` (merge-into) : Même loi de citation.
- `chat-vue-unique-consommation-serveur` → `vue-unique-consommee-par-chaque-lecteur` (merge-into) : Même consommation serveur de la vue unique par lecteur.
- `chat-bulle-protegee-voiles-et-chrome` → `voile-puce-et-flou-des-contenus-proteges` (merge-into) : Même voile des contenus protégés. Hérite : chat-bulle-decoupage-composants.
- `chat-ephemere-registre-reception` → `ephemere-echeance-par-lecteur-et-reveil-unique` (merge-into) : Même registre de réception éphémère et réveil unique.
- `chat-ecran-decoupage-liste` → `chat-screen-composables-split` (drop-duplicate) : Même découpage de ChatScreen.kt.
- `chat-ecran-decoupage-feuilles` → `chat-screen-hosts-and-composer-split` (drop-duplicate) : Même extraction des feuilles (ChatSheetsHost).
- `chat-viewmodel-decoupage-controleurs` → `chat-viewmodel-state-split` (drop-duplicate) : Même découpage de ChatViewModel.kt en contrôleurs.
- `chat-lecture-suivi-exact` → `chat-room-sync-and-read-receipts` (merge-into) : Même suivi exact de lecture. Hérite : chat-liste-items-types-et-entrees.
- `chat-liste-saut-verifie-et-flash` → `persist-messages-fenetre-ui-saut` (merge-into) : Même saut vérifié au message cité avec flash.
- `chat-bulle-ecrit-dans-le-fil` → `chat-list-states-pill-and-jump` (merge-into) : Même bulle « X écrit… » en bas du fil.
- `chat-supprimer-pour-moi-fiable` → `chat-message-removal-and-command-hardening` (merge-into) : Même « supprimer pour moi » durable par compte.
- `chat-selection-multiple` → `chat-selection-and-forward` (merge-into) : Même sélection multiple. Hérite : chat-glisser-repondre-transferer.
- `chat-historique-envoi-tentatives` → `persist-messages-etat-envoi-historique` (drop-duplicate) : Même historique des tentatives d'envoi.
- `chat-bulle-avis-appel` → `calls-summary-metadata-bubble` (drop-duplicate) : Même bulle de résumé d'appel rappelable.
- `chat-media-plein-ecran` → `chat-gallery-pager-core` (drop-duplicate) : Même plein écran d'image ou vidéo depuis la conversation. Hérite : media-disponibilite-et-telechargement-auto, lecture-focus-audio-et-coordination-des-lecteurs.
- `chat-video-integree` → `video-lecteur-en-ligne-dans-le-fil` (drop-duplicate) : Même vidéo lue dans la bulle. Hérite : chat-bulle-grille-medias.
- `chat-media-disponibilite-et-telechargement` → `media-disponibilite-et-telechargement-auto` (drop-duplicate) : Même disponibilité et téléchargement automatique.
- `chat-lecteur-media-moteur-partage` → `lecture-focus-audio-et-coordination-des-lecteurs` (drop-duplicate) : Même PlaybackCoordinator (un seul lecteur actif).
- `chat-vocal-lecteur-inline` → `vocal-bulle-branchement-fil` (drop-duplicate) : Même lecteur vocal dans la bulle. Hérite : chat-bulle-decoupage-composants, chat-bulle-pied-heure-et-coches.
- `chat-vocal-transcription-traductions-piles` → `vocal-langue-de-piste-et-traduction-a-la-demande` (merge-into) : Mêmes pistes traduites et transcription dans la bulle. Hérite : chat-bulle-prisme-drapeaux-et-panneau-secondaire.
- `chat-audio-arriere-plan-mini-lecteur` → `mini-lecteur-audio-global` (drop-duplicate) : Même mini-lecteur.
- `chat-fichiers-cartes-contact-et-code` → `document-fiche-et-apercu-integre` (merge-into) : Même rendu de fichier joint ; la carte de visite = carte-visite-bulle, le code = code-visionneuse-coloration. Hérite : chat-bulle-decoupage-composants.
- `feed-reactions-palette-et-commentaires-par-niveau` → `post-reaction-palette` (merge-into) : Même palette de réactions d'un post ; l'indentation des commentaires = comment-row-rich.

## Features

### Une vidéo se lit directement dans la bulle, avec trois contrôles

`cbr-inline-video` · Android : **absente** · P0 · effort M

La vidéo du fil joue sur place : son, lecture/pause, plein écran. Toucher la surface ailleurs que sur les contrôles ouvre le plein écran en reprenant la position. Le ratio natif décide de la hauteur (portrait 9:16 haut, paysage court), sans plafond. Le lecteur passe par un résolveur de disponibilité (cache, politique, téléchargeur) et une barre de progression de consommation du lecteur courant ; un badge de vues est posé dessus. Un seul lecteur actif, libéré hors écran.

Écarts :
- Écran de lecture inline Media3/ExoPlayer pour une pièce vidéo de message : boutons son, lecture/pause, plein écran (contrôles inlineMinimal), bouton lecture de 64 dp (seule) ou 44 dp (grille)
- Toucher la surface hors contrôles ouvre le plein écran à la même position ; les gestes vivent dans le lecteur (un seul déclencheur par toucher)
- Ratio natif sans plafond : hauteur = largeur / ratio (9:16 haut, 16:9 court), ratio par défaut 16:9
- Résolveur de disponibilité : cache disque → politique de téléchargement automatique (réseau, taille) → téléchargeur, avec bouton de téléchargement manuel et progression
- Barre de progression de consommation (currentUserConsumption) en bas et remontée de la consommation au serveur
- Un seul lecteur actif à la fois, arrêt et libération hors écran, reprise de position
- Poster net avant la première image (vignette serveur ou première image extraite)

Rendu : Fond noir, coins écrêtés par la bulle, contrôles minimalistes en bas (son à gauche, plein écran à droite, play centré), barre fine d'accent en bas, badge de vues en haut à droite.

Transposition Android : Media3 ExoPlayer + PlayerView/Compose surface ; un singleton de lecteur actif partagé avec la liste ; VideoPosterSource existant pour l'image de départ.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/ConversationVideoPoster.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoPosterSource.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaDownload.kt`

### Le son continue en arrière-plan avec carte « en lecture » et mini-lecteur

`cbr-audio-coordinator` · Android : **absente** · P1 · effort M

Un routeur coordonne les surfaces audio hors conversation (fil, commentaires, détail de post) : actif, le lecteur reçoit le moteur du coordinateur (carte Now Playing, lecture en arrière-plan, mini-lecteur) ; inactif, un moteur local est possédé par la vue et le premier toucher démarre une file d'un élément sur le coordinateur. Les réels n'y passent pas (profil transitoire).

Écarts :
- Service de lecture Media3 (MediaSessionService) avec notification média : titre, artwork, play/pause/suivant
- Coordinateur singleton : une piste active, file d'attente, reprise, bascule moteur local ↔ moteur partagé selon l'état actif
- Mini-lecteur persistant dans l'app tant qu'un audio joue hors de l'écran source
- Surfaces feed/commentaires/détail de post branchées sur le routeur (nowPlayingName, artwork, makeQueuedAudio)
- Réels exclus (profil transitoire, sans carte Now Playing)

Rendu : Notification média standard avec artwork de l'avatar ou de la conversation ; mini-lecteur en barre basse avec play/pause et fermer.

Transposition Android : CarPlay/Now Playing → MediaSessionService + notification média Media3 + écran verrouillé ; Control Center → MediaSession.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/CoordinatedAudioPlayer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Le résumé d'un appel dans le fil se rappelle d'un toucher

`cbr-call-notice` · Android : **absente** · P1 · effort M

Un message système avec métadonnées d'appel devient une capsule compacte alignée comme une bulle (sortant à droite, entrant/manqué à gauche) : un glyphe qui porte tout le sens (média audio ou vidéo + puce de direction flèche entrante/sortante), un titre (« Appel vidéo entrant », manqué, refusé/rejeté, annulé, interrompu, en cours), une ligne de métriques « ⏱ 00:49 · ⇅ ~9,3 Mo » et l'heure en bas à droite. Un point pulse pour un appel en cours. Toucher rappelle (ou rejoint l'appel en cours), appui long ouvre la fiche détaillée (type, horodatage précis, durée, données, qualité réseau, rappel).

Écarts :
- Décoder les métadonnées callSummary d'un message système (type, statut, durée, données échangées, qualité réseau, direction par lecteur) : aujourd'hui ApiMessage ne les porte pas, le message rend du texte plat dans BubbleSystemNoticeView
- Capsule d'appel : glyphe média + puce de direction (flèche entrante vers le bas-gauche, sortante vers le haut-droit), titre selon le statut, ligne de métriques, heure en bas à droite ; hug du contenu, jamais étirée
- Point pulsant pour l'appel en cours (animation infinie sans minuteur par cellule, coupée par Réduire les animations)
- Toucher = rappeler avec le même média (ou rejoindre l'appel en cours) ; réutiliser la logique de RejoinCallPill et l'appel Telecom
- Appui long = feuille de détail de l'appel (type, horodatage précis, durée, données, qualité réseau, rappel en un geste)
- Libellés TalkBack pour chaque statut + actions nommées « Rappeler / Rejoindre l'appel » et « Détails de l'appel »
- Libellés localisés pour les 8 statuts et les suffixes entrant/sortant

Rendu : Capsule teintée de l'accent de la conversation, glyphe 20–24 dp à gauche, titre callout semibold + métriques caption atténuées, heure caption bas-droite, point d'appel en cours vert pulsant.

Transposition Android : CallKit → Telecom ConnectionService déjà en place côté calls ; le rappel appelle le même point d'entrée que le bouton d'appel de l'en-tête.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### La fiche « Vu par » dit qui a reçu, lu ou pas encore vu un message

`cbr-detail-read-status` · Android : **absente** · P1 · effort M

Onglet « Qui a vu » d'un message : sous-filtres Envoyé, Distribué, Lu, Non vu (et Écouté, Vu, Ouvert pour les médias) avec compteurs, ouvert sur l'onglet le plus pertinent calé sur le décompte SERVEUR. Chargement SWR : le spinner n'appartient qu'au démarrage à froid, un read-status:updated vivant rafraîchit sans clignotement, erreur « Impossible de charger les données » avec « Réessayer ». Carte de l'expéditeur avec badge de livraison (envoi, envoyé, distribué, lu, échec), méta du message (id, type, source, langue, modifié, transféré, répond à), listes de membres avec présence servie, bannière de chronologie, états vides parlants. Ouvre en touchant les coches ou par « Plus → Vues ».

Écarts :
- Feuille de détail « Vues » ouverte par le toucher des coches et par l'action « Plus » du menu de message
- Modèle ReadStatusData (messageId, totalMembers, receivedCount, readCount, notSeenCount, receivedBy[], readBy[], notSeenBy[] avec participantId, displayName, avatarURL, receivedAt / readAt) et GET /messages/:id/read-status
- Onglets chips (Envoyé, Distribué, Lu, Non vu, Écouté, Vu, Ouvert) avec icône, libellé et compteur ; onglet initial par MessageViewsFilter.initial(readCount, deliveredCount, showReadReceipts) recalé sur le décompte serveur quand il arrive
- SWR : shouldFetch(hasExisting, isLoading, force, hasServerId) et showsSpinner(isLoading, hasExisting) ; rechargement forcé sur read-status:updated sans remplacer des données existantes par un spinner
- Erreurs « Erreur serveur » / « Erreur de connexion » et « Impossible de charger les données » + bouton « Réessayer »
- Carte de l'expéditeur avec badge de livraison (0 envoi, 1 envoyé, 2 distribué, 3 lu, autre échec) et lignes de méta (id tronqué à 12 caractères, type, source, langue, modifié, transféré, répond à)
- Listes d'utilisateurs avec avatar et présence servie (cache des membres par identifiant de participation), états vides « Personne n'a lu ce message », « Tout le monde a reçu le message », « Aucune confirmation de distribution », « Pas encore vu » avec pluriel
- Bannière de chronologie (icône, titre, détail, compteur monospace) partagée avec l'historique d'édition ; respect de showReadReceipts

Rendu : Chips défilants en tête, cartes arrondies teintées d'accent, rangées utilisateurs avec avatar 32 dp, bannière chronologique avec compteur en capsule monospace.

Transposition Android : ModalBottomSheet Compose ; l'onglet « Plus » du menu d'appui long existant ouvre la feuille.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsFilter.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsReadStatusData.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsReadStatusRules.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDeliveryBadge.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsMemberPresence.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsMetaRow.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageDetailChrome.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### On feuillette toutes les images d'un message dans un carrousel inline

`cbr-media-carousel` · Android : **absente** · P1 · effort M

Le carrousel de la bulle est un pager horizontal natif : sa hauteur est celle du plus grand ratio, chaque page respecte son format, un indicateur donne la position. Quand la liste de pièces change sous lui, il se ré-ancre sur la pièce montrée (jamais « 3 / 2 »). Quitter une page libère sa vidéo, le badge « télécharger » se tait pour les images arrivées, l'heure et la coche flottent en overlay, et le glisser Répondre/Transférer de la bulle s'efface tant qu'il est ouvert.

Écarts :
- HorizontalPager Compose avec hauteur = max(largeur / ratio) des pièces, pages letterboxées dans cette hauteur
- Indicateur de page et ré-ancrage sur l'identifiant de la pièce montrée quand la liste évolue (réordonnée, retirée, ajoutée), avec repli sur la page voisine bornée
- Libérer le lecteur vidéo de la page quittée (même si la pièce a quitté la liste) et mémoriser les images arrivées pour masquer leur badge de téléchargement
- Footer en overlay (heure + coche) et fermeture du carrousel
- Signaler « pagination inline active » à la liste pour désengager le swipe Répondre/Transférer tant que le carrousel est ouvert
- Ouverture depuis la tuile « +N » de la grille

Rendu : Pager pleine largeur de bulle, coins arrondis, indicateur « n / N » en capsule scrim, transitions douces.

Transposition Android : Pager Compose ; le signal « pagination active » remonte par un CompositionLocal ou un état hissé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCarouselView.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedMediaCarousel.kt`

### On sélectionne plusieurs messages en cochant un cercle à gauche

`cbr-multi-select` · Android : **absente** · P1 · effort M

En mode sélection multiple, chaque cellule loge un cercle de 20 pt TOUJOURS à gauche (colonne unique de cases à cocher façon Mail/Fichiers), la bulle se décale (3× le diamètre en bulles, 2× en rangée plate) et un toucher n'importe où bascule la sélection grâce à un capteur transparent posé par-dessus le contenu (donc quoi que fasse la bulle en dessous). Swipe et appui long s'effacent : une seule intention à la fois.

Écarts :
- État de sélection multiple dans le ViewModel (ensemble d'ids, mode actif) et barre d'actions de sélection (transférer, copier, supprimer, partager ; l'écran hôte existe sur iOS hors de cette partie)
- Cercle de sélection 20 dp à gauche pour toutes les bulles, envoyées comme reçues, bulle décalée de 3× (60 dp)
- Capteur de toucher transparent qui bascule la sélection par-dessus le contenu (carrousel, traduction, média) ; désengager swipe et appui long
- Entrée dans le mode par l'appui long / menu « Sélectionner » ; sortie par retour ou par désélection du dernier élément
- Accessibilité : état sélectionné annoncé, cible ≥ 48 dp

Rendu : Cercle de 20 dp (vide/plein accentué avec coche), marge gauche de 60 dp pour toutes les bulles en mode sélection, animation douce du décalage.

Transposition Android : Sélection à la Google Messages : surbrillance + barre d'actions contextuelle ; cercle de sélection pour iso.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`

</details>

### Chaque pièce d'un lot se réagit d'un double toucher et s'inspecte d'un appui long

`cbr-piece-actions` · Android : **absente** · P1 · effort M

Dans un message à plusieurs pièces : double toucher = sélecteur de réaction de CETTE pièce (sauf image seule, protégée ou chiffrée), appui long = aperçu de la pièce seule avec défilement vers les autres pièces (jamais prioritaire sur le toucher simple), et action d'accessibilité nommée équivalente. Une citation qui nomme une pièce allume un anneau d'accent sur la tuile citée à l'arrivée du saut, puis l'éteint.

Écarts :
- Réaction par pièce : double tap (avant le simple tap, avec délai de désambiguïsation assumé) ouvre le sélecteur ; envoi POST de réaction sur l'attachement ; loi AttachmentReactionOffer (pas sur pièce seule, protégée, chiffrée)
- Pastille des réactions par pièce (emojis + total, renfort si j'ai réagi) dans les coins de la tuile
- Appui long sur une tuile d'un lot ouvre l'aperçu de CETTE pièce avec défilement vers les autres (clé d'environnement posée par la cellule : attachmentId + messageId), simultané au long press de la bulle (réservation MessagePressClaim)
- Pièce seule ou protégée : l'appui long reste à la bulle (message entier)
- Anneau d'accent (PieceSpotlightRing) émis par le saut vers une citation qui nomme une pièce, allumé puis éteint ; aucune mise en évidence pour une citation du message entier
- Actions TalkBack nommées pour l'aperçu de pièce et la réaction

Rendu : Pastille de réactions 24 dp en bas-gauche de la tuile ; anneau d'accent 2–3 dp qui se dissipe en 1–2 s ; haptique moyen à l'ouverture du sélecteur.

Transposition Android : combinedClickable (onDoubleClick/onLongClick) sur la tuile ; aperçu via l'overlay d'appui long existant (MessageOverlayPreviewHero/OverlayMediaPreview).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessagePieceLongPress.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/PieceSpotlight.swift`

</details>

### Un sticker est le message : sans bulle, animé et qui flotte

`cbr-sticker` · Android : **absente** · P1 · effort L

Le message-sticker n'a ni fond, ni coin, ni bordure : une image de 200 pt alignée du côté de l'expéditeur, méta compacte à côté et réactions à cheval sur le coin. Il se dessine par priorité : gabarit vectoriel natif, film Mee/Meo embarqué, PNG joint, sinon emoji de 118 pt. La place est RÉSERVÉE avant la rasterisation. L'animation est une fonction pure du temps depuis l'apparition (un coup joue une fois par affichage, une animation continue boucle et se met en pause hors écran) ; le sticker flotte lentement (4 pt, demi-période 2,1 s) avec une ombre douce. Réduire les animations fige le mouvement mais garde la décoration.

Écarts :
- Décoder le sticker d'un message (gabarit, id Mee/Meo, PNG, emoji) dans BubbleContent et le rendre sans chrome de bulle
- Priorité de rendu pure : gabarit connu → film embarqué → image jointe → emoji (repli quand un gabarit est inconnu de ce binaire)
- Moteur de gabarits : dessin vectoriel natif (Canvas) à l'échelle de l'écran, boîte 1,5× plus large que haute pour un cartouche, place réservée avant la première rasterisation pour éviter le saut de cellule
- Animation pure du temps (StickerAnimation.pose(at:)) via une horloge par frame depuis l'apparition ; un coup unique joué une fois par affichage, continue en boucle mais en pause hors écran
- Flottement : décalage 4 dp, demi-période 2,1 s, ombre alpha 0,18 / rayon 8 / décalage vertical 6 ; retiré sous Réduire les animations (l'ombre reste)
- Côté de référence 200 dp, glyphe emoji 118 dp, méta compacte à côté et réactions à cheval sur le coin
- Réutiliser StickerCatalog des stories pour les gabarits si les définitions sont communes

Rendu : Sticker de 200 dp sans fond, ombre portée douce sous la silhouette, flottement lent, aligné à droite si envoyé, à gauche sinon.

Transposition Android : Canvas Compose + withFrameNanos pour l'horloge ; Lottie ou animations vectorielles pour les films Mee/Meo selon le format fourni.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSticker.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageStickerArtwork.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStickerFloat.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`

### Un long message se replie sur un extrait et se déplie en place, sans saut

`cbr-text-expandable` · Android : **absente** · P1 · effort M

Au-delà d'un seuil, la bulle ne montre qu'un quart du texte coupé au mot suivi de « … Lire la suite » ; toucher déplie le message DANS le fil (« Réduire » replie), sans feuille de lecture. Un seul message est déplié à la fois (le précédent se replie), la hauteur s'anime en 300 ms en tenant immobile le bord ancré, et le déplié reçoit l'effet Focal (bloc de verre épousant la bulle, voisins atténués). Le lien est souligné, à l'encre du texte, et exclut le coin des réactions.

Écarts :
- Porter LongMessageExcerpt (loi partagée) : seuil, quart du texte coupé au mot, « … » ; le texte reçu est le texte servi par le Prisme
- Lien « Lire la suite » / « Réduire » souligné à l'encre du texte (contraste AA), aligné en bas à droite avec 48 dp de marge pour dégager le bouton de réaction, cible ≥ 48 dp, valeur d'accessibilité replié/déplié
- État de dépliage porté par la liste (un seul message déplié, replie le précédent, toggle par messageId)
- Dépliage en place sans saut de défilement : tenir le bord ancré immobile jusqu'à la pose de la hauteur, animation 300 ms (courbe d'expansion partagée), désactivable par Réduire les animations
- Effet Focal sur le déplié (bloc de verre aux dimensions de la bulle, voisins atténués) ou équivalent Material assumé

Rendu : Extrait suivi d'une ellipse puis du lien « Lire la suite » en semibold souligné à droite ; déplié : texte complet + « Réduire », bulle légèrement mise en avant.

Transposition Android : animateContentSize + LazyListState.scrollBy pour tenir le bord ; l'état d'expansion vit dans le ViewModel de la liste.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/LongMessageFocus.swift`
- `apps/ios/Meeshy/Features/Main/Views/LongMessageExpansionState.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift`

</details>

### L'historique des modifications d'un message se relit version par version

`cbr-detail-edit-history` · Android : **absente** · P2 · effort S

Fiche « Historique » d'un message modifié : bannière (« Historique », compteur, « n versions précédentes ») puis la version ACTUELLE en tête (contenu + horodatage) et les révisions antérieures par ordre antichronologique (« Version n »). État vide « Aucune modification » / « L'historique des modifications apparaît ici ». Les révisions viennent d'un store local qui ajoute la version précédente à chaque édition.

Écarts :
- EditHistoryStore local (persisté) : à chaque édition réussie, ajouter le contenu précédent comme révision (EditRevision) avec horodatage
- Fiche d'historique : bannière avec compteur et pluriel « n version(s) précédente(s) », carte « Actuel » (contenu + editedAt/updatedAt), puis « Version n » du plus récent au plus ancien
- État vide parlant et libellés localisés
- Action « Historique » dans le menu d'un message modifié

Rendu : Bannière à icône crayon-liste et compteur en capsule, cartes de version avec en-tête de version et horodatage atténué.

Transposition Android : Room ou DataStore pour les révisions ; feuille Compose.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageDetailChrome.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEditability.kt`

### On voit qui a écouté, visionné ou ouvert chaque pièce jointe

`cbr-detail-media-consumption` · Android : **absente** · P2 · effort M

Dans la fiche « Vu par », les onglets Écouté / Vu / Ouvert montrent, pour CHAQUE pièce, qui l'a consommée, combien de fois, jusqu'où (barre de progression pour les médias à piste uniquement), avec « complet » et « Téléchargé <date> ». La partition se fait par l'ABSENCE de piste : audio = écouté, vidéo = visionné, tout le reste (image, PDF, tableur, archive, code, texte…) = ouvert. États vides « Pas encore écouté / visionné / ouvert ».

Écarts :
- Modèle MediaConsumptionFamily (listened, watched, opened) dérivé du type de pièce, avec partition par absence de piste (onze AttachmentKind)
- Appel GET /attachments/:id/status-details pour toutes les pièces (pas seulement les médias à piste)
- Carte par pièce : icône (waveform, film, symbole du type), nom, utilisateurs, nombre d'écoutes/ouvertures, position, barre de progression (pistes), libellé « complet », « Téléchargé <date> »
- États vides spécifiques par famille et chargement SWR
- Présence des membres sur les rangées de la carte

Rendu : Carte avec pastille d'icône 32 dp, nom en caption semibold, barre fine d'accent, liste d'utilisateurs en dessous.

Transposition Android : Contenu des onglets de la feuille cbr-detail-read-status.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsConsumption.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsConsumptionCard.swift`

</details>

### Un message envoyé montre l'historique de ses tentatives d'envoi

`cbr-detail-send-attempts` · Android : **absente** · P2 · effort M

Dans la fiche d'un message ENVOYÉ par soi, une carte « Historique d'envoi » liste les tentatives locales : numéro (« 1re tentative », « Tentative n »), issue (Réussi / Échec) et transport (Temps réel, Repli temps réel, Nouvelle tentative automatique), avec le compte au pluriel. La carte n'est pas montée pour les messages reçus.

Écarts :
- Enregistrer les tentatives d'envoi (SendAttemptRecord : transport, issue, numéro, horodatage) dans la file d'envoi / Room pour les messages sortants
- Carte « Historique d'envoi » avec libellé pluriel (« n tentatives »), « 1re tentative », ligne par tentative (Réussi / Échec, transport)
- Ne pas monter la carte pour un message reçu
- Libellés localisés des trois transports (socket temps réel, repli, relance automatique)

Rendu : Carte arrondie avec icône horloge fléchée en tête, lignes chronologiques, pastille verte/rouge selon l'issue.

Transposition Android : Table Room des tentatives alimentée par le sender ; carte Compose dans la fiche.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsSendAttemptsCard.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/message/MessageStateMachine.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Le sentiment d'un message se lit d'un coup d'œil, calculé sur l'appareil

`cbr-detail-sentiment` · Android : **absente** · P2 · effort S

Onglet « Sentiment » : emoji héros de 56 pt (colère, tristesse, neutre, sourire, joie selon les seuils −0,6 / −0,2 / 0,2 / 0,6), libellé (« Très négatif » … « Très positif »), jauge dégradée erreur → warning → succès avec curseur blanc, « Score : 0,42 », le tout regroupé pour VoiceOver (« Sentiment » puis « Positif, score 0,42 »). L'analyse se fait entièrement sur l'appareil, sans réseau.

Écarts :
- Onglet/feuille par message qui réutilise SentimentAnalyzer.score et SentimentLevel (déjà présents pour le composeur) ; vérifier la parité des seuils −0,6 / −0,2 / 0,2 / 0,6 et des cinq emojis
- Jauge dégradée de 12 dp (error → warning → warning → success) avec curseur blanc de 18 dp et ombre, position = (score + 1) / 2
- Libellés localisés des cinq niveaux, « Score : %.2f » et contenu TalkBack groupé (jauge décorative masquée)
- Équivalent de NLTagger : l'analyseur Android est à base de lexique ; documenter l'écart de précision ou introduire un modèle on-device

Rendu : Emoji de 56 dp centré, libellé callout semibold, jauge pleine largeur avec marges 24 dp, score en footnote atténué.

Transposition Android : NLTagger.sentimentScore → SentimentAnalyzer (lexique) existant ou ML Kit on-device.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetailSentimentTab.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Sentiment.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisSheet.kt`

### Un double toucher ouvre une barre d'opérations primaires

`cbr-double-tap-menu` · Android : **absente** · P2 · effort S

Le double toucher sur une bulle présente le menu d'édition système (UIEditMenuInteraction) réduit aux opérations primaires : répondre, transférer, modifier, sélectionner, copier, supprimer et « plus », avec l'apparence système de la version. Le menu riche de Meeshy reste à l'appui long. Sans action, rien ne s'ouvre (pas de barre vide).

Écarts :
- Détecter le double tap sur la bulle (sans entrer en conflit avec le double tap d'une tuile de média qui ouvre la réaction de la pièce)
- Barre flottante ancrée à la bulle avec les opérations primaires (répondre, transférer, modifier, sélectionner, copier, supprimer, plus…) en réutilisant MessageActionMenu.actions
- Ne rien présenter quand la liste d'actions est vide ; « Plus… » ouvre le menu d'appui long existant
- Respecter l'apparence Material du système (barre flottante tonale)

Rendu : Barre horizontale flottante au-dessus de la bulle avec icônes + libellés courts, fermeture au toucher extérieur.

Transposition Android : UIEditMenuInteraction → barre d'outils flottante (ActionMode.Callback2 FLOATING ou Popup Compose) ancrée à la bulle.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/NativeMessageEditMenu.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`

### Sur tablette, on glisse un message hors de l'app

`cbr-drag-source` · Android : **absente** · P2 · effort S

Sur grand écran, une bulle devient une source de glisser-déposer : le texte servi (ou, à défaut, la première pièce image/vidéo avec nom suggéré et type) peut être déposé dans une autre app. Refusé pour un message non utilisateur, supprimé, chiffré ou dont l'offre de sortie n'autorise pas le partage.

Écarts :
- Politique pure BubbleDragPolicy.source(for:servedText:isLargeWidth:standalone:) : message utilisateur non supprimé, offre « share » non chiffrée, pièce prioritaire sinon texte servi non vide
- Brancher dragAndDropSource (Compose) avec ClipData (texte ou URI de média), nom suggéré et type MIME, seulement en largeur régulière (tablette/pliable)
- Pas de source pour un aperçu isolé (standalone) ni pour un message chiffré ou éphémère protégé

Rendu : Aperçu de glisser = la bulle elle-même (ombre de drag système).

Transposition Android : iPad drag → Compose dragAndDropSource / View.startDragAndDrop sur tablettes et pliables (WindowSizeClass Expanded).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDragSource.swift`

</details>

### Les modes de lecture Focal et Script mettent en avant le message au centre de l'écran

`cbr-focal-reading-modes` · Android : **absente** · P2 · effort L

Scène Focal du fil : ligne de focus au centre de la région visible (descend au bord bas au repos sur le dernier message), élection du message focal, loupe de l'élu et perspective minimale uniquement pendant un geste utilisateur, carte et détails différés en plein fling, aplatissement au repos, verrou de scène. S'y ajoutent la veille de la liste sous les panneaux opaques Rivière / Résumé et la mise à jour allégée sous couverture. Ces modes appartiennent à une autre partie (dossier Focal) ; seuls leurs crochets de liste sont ici.

Écarts :
- Décision de reprise des modes de lecture (Bulles / Script / Focal / Rivière / Résumé) : Android n'a que le mode Bulles
- Ligne de focus, élection du message focal, effet loupe et perspective pendant le geste uniquement, aplatissement au repos, carte de détails différée en fling
- Verrou de scène qui empêche tout défilement non voulu pendant l'effet
- Veille de la liste sous un panneau opaque (Rivière/Résumé) : neutraliser le puits d'application, rejouer l'état au réveil
- Équivalent de la mise à jour allégée sous couverture : ne recomposer la liste que si une valeur utile change

Rendu : Message élu agrandi légèrement avec bloc de verre, voisins atténués ; au repos tout est plat.

Transposition Android : Dépend de la décision de porter les modes de lecture ; les effets de perspective passent par graphicsLayer par item visible.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+FocalScene.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ThreadQuiescence.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListView+CoveredUpdate.swift`

</details>

### Un message s'exporte en belle carte image signée Meeshy

`cbr-message-card-export` · Android : **absente** · P2 · effort L

Le moteur de peinture d'une carte d'export (miroir du moteur web) mesure avec les vraies polices, peint en 1080 px de large (1920 en paysage) et produit un PNG signé Meeshy dans ses métadonnées. Le même moteur sert l'image exportée, les vignettes de template et chaque image d'une carte animée ; une vignette n'est qu'une échelle réduite avec des traits épaissis pour rester lisibles ; la peinture d'une carte story (1080 × 1920) tourne hors du fil principal. L'aperçu pose des zones touchables sur l'image, la coupe vient des médias et le pincement s'arrête à l'échelle maximale.

Écarts :
- Porter la loi pure MessageCardLayout (partagée avec le web message-card-paint.ts) et ses entrées (MessageCardInput, polices MessageCardFont, médias MessageCardPictures)
- Moteur de peinture Canvas/Bitmap : 1080 px de large (1920 paysage), polices mesurées, médias par identifiant chargés par l'app
- Export PNG avec métadonnées signées Meeshy (chunk texte) via MessageCardPNGMetadata
- Vignettes de template (échelle réduite, traits lisibles) et images de carte animée (frame(input, pictures, w, h))
- Exécution hors main thread (Dispatchers.Default) pour les cartes 1080×1920 ; partage via ACTION_SEND
- Zones touchables de l'aperçu et pincement borné par l'échelle maximale des médias

Rendu : Carte portrait ou paysage aux couleurs du template choisi, texte et médias mesurés, signature Meeshy discrète.

Transposition Android : UIGraphicsImageRenderer → android.graphics.Canvas/Bitmap ; PNG avec tEXt via une petite écriture de chunk ; partage par FileProvider + ACTION_SEND.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/MessageCard/MessageCardRenderer.swift`

</details>

### Une notification de message montre la position, le contact, l'invitation ou le lien reçu

`cbr-notification-detail` · Android : **absente** · P2 · effort M

Pour un message sans texte lisible, la passerelle pose dans la charge de la notification le détail d'une position, d'une carte de visite, d'une invitation ou d'un lien. Un seul lecteur sert l'extension de notification, la bannière in-app et les actions : priorité position > contact > invitation > lien ; corps détaillé (« 📍 Nom · adresse », « 👤 Nom », « ✉️ Invitation · Titre », « 🔗 domaine — titre »), catégorie d'actions dédiée (position, contact, invitation) et remplacement d'un corps vide ou qui n'est que l'URL brute. Aucune garde de protection ici : le serveur retire ces clés pour un message protégé et chaque hôte pose son second verrou.

Écarts :
- Lecteur unique NotificationMessageDetail en Kotlin pur (clés locationLat/Lon/Name/Address, contactName/Phone/Email, inviteUrl/ConversationTitle/MemberCount, linkUrl/Domain/Title/ImageUrl, thumbnailUrl, storyReply) lisant une Map<String,String> FCM (nombres en chaînes) et une charge socket
- Priorité position > contact > invitation > lien, schémas d'URL autorisés (https/http, meeshy pour l'invitation)
- Corps détaillé et règle de remplacement quand le corps servi est vide ou n'est que l'URL
- Actions de notification par catégorie (ouvrir dans Maps, ajouter le contact, rejoindre l'invitation) dans MeeshyFcmService
- Second verrou local : ne pas utiliser le détail si la notification porte une clé de protection (notificationLocKey)
- Bannière in-app (notification:new) alimentée par le même lecteur

Rendu : Corps de notification court avec emoji de tête, une à trois actions de notification, aperçu image pour un lien.

Transposition Android : Notification Service Extension → FirebaseMessagingService (message de données) + NotificationCompat.Action ; UNNotificationCategory → actions de notification.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationMessageDetail.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PushPresentationPolicy.kt`

### Sur un post ou un réel, appui bref = cœur, appui long = palette de six emojis

`cbr-post-reaction-palette` · Android : **absente** · P2 · effort S

Un modificateur unique écrit le geste pour toutes les surfaces (détail de post, lecteur de réels) : appui bref envoie le cœur, appui long (0,45 s, simultané pour ne pas être avalé par un bouton) ouvre une palette ancrée à la cible (cadre séparé de la cible, large et libre), avec haptique moyen et ressort. Une action d'accessibilité « Plus de réactions » donne le même accès. Chaque surface garde son propre envoi optimiste.

Écarts :
- Modificateur Compose commun reactionPaletteTrigger(isPresented) : appui long 450 ms simultané au clic, haptique moyen, action sémantique « Plus de réactions »
- Cadre de palette séparé de la cible (ancre bas-gauche, offsets configurables) affichant six emojis en pastille avec animation ressort
- Brancher chaque surface (détail de post, réels) sur son envoi optimiste existant ; Android n'a aujourd'hui qu'un bouton J'aime sans palette
- Style clair/sombre de la palette

Rendu : Palette en pilule flottante au-dessus du bouton, six emojis de 28 dp, apparition par ressort (réponse 0,3 / amortissement 0,7).

Transposition Android : combinedClickable(onLongClick) + Popup ancrée ; haptique via LocalHapticFeedback.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReactionPaletteModifier.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostDetailScreen.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt`

### On voit qui a l'écran de la conversation ouvert en ce moment

`cbr-presence-here` · Android : **absente** · P2 · effort S

iOS lit une seule fois par configuration de cellule le roster « est dans la conversation » (et « actif ») de la conversation, le remet aux rangées en valeur et reconfigure les cellules visibles quand l'ensemble change. Il alimente l'avatar de l'expéditeur et la bulle « écrit… ».

Écarts :
- Écouter l'événement socket de présence de conversation (viewers) et exposer un roster par conversation (ConversationHereRoster) dans un StateFlow
- Passer le roster comme valeur primitive aux lignes visibles (jamais observé par chaque cellule)
- Respecter la visibilité de présence serveur (amis acceptés, soi, ADMIN/BIGBOSS) : aucun état fabriqué côté client

Rendu : Petit indicateur sur l'avatar (anneau ou pastille « ici ») ; même emplacement que le point de présence.

Transposition Android : StateFlow dans le ViewModel de chat collecté une fois au niveau de la liste.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ConversationViewers.swift`

</details>

### Un message vocal se joue dans la bulle avec onde, transcription et traductions

`cbr-audio-inline-player` · Android : **divergente** · P0 · effort L

Le vocal est rendu par un lecteur complet routé vers le coordinateur partagé : bouton lecture/pause, onde, glissé de position, durée, vitesse, transcription (révélée automatiquement pour mes vocaux ou si la préférence l'autorise, sinon à la demande, avec re-transcription), pistes audio traduites par langue (piste élue par la langue du texte servi), pied intégré au widget, citation hébergée dans le widget, disponibilité (cache, politique, téléchargement), plusieurs pistes en pile horizontale, plein écran audio. Un glissé sur l'onde désarme le swipe de la bulle.

Écarts :
- Remplacer la ligne AudioBubble (un toucher fait uriHandler.openUri(audio.url), donc ouvre une application externe) par un vrai lecteur inline : lecture/pause, onde, glissé de position, durée écoulée/totale, vitesse 1×/1,5×/2×
- Brancher le lecteur sur un coordinateur partagé (une seule piste active, reprise, file d'attente, voir cbr-audio-coordinator)
- Transcription sous le lecteur : révélée automatiquement pour mes vocaux ou si audio.autoTranscribeIncoming, sinon bouton ; demande et re-transcription via l'API de transcription ; surlignage karaoké (TranscriptionKaraokeResolver existe)
- Pistes audio traduites : sélection par drapeau, élection par la langue du texte SERVI (Prisme), demande de traduction audio par attachmentId
- Plusieurs vocaux dans un message : pile horizontale (AudioStackView) au lieu de lignes empilées
- Disponibilité : résolveur cache → politique → téléchargeur avec bouton de téléchargement et progression
- Pied de bulle (heure, coche, drapeaux) et citation hébergés DANS le widget lorsque le message ne contient que de l'audio
- Postures de chrome (carte riche, bande nue, bande enrichie) selon AudioPlayerChromePlan, plein écran audio
- Un glissé sur l'onde ou le curseur désarme le swipe de la bulle (MediaScrubbingPreferenceKey)

Rendu : Carte arrondie accentuée (couleur d'accent de la conversation), bouton play circulaire à gauche, onde au centre qui se remplit, durée à droite, transcription en italique sous la carte avec chevron pour déplier.

Transposition Android : Media3 ExoPlayer + MediaSession dans un service ; waveform dessinée sur Canvas à partir des échantillons de l'attachement ; modèles purs (AudioPlayerChromePlan, karaoke) déjà présents.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Attachments.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AudioPlayerChromePlan.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`

### Le badge « Transféré » ne nomme que ce qu'il a le droit de nommer

`cbr-forward-attribution` · Android : **divergente** · P0 · effort S

Règle produit de confidentialité (porteur, 2026-08-23) : seuls les groupes AU MOINS publics (public, global, broadcast, channel, community) sont nommés ; un tête-à-tête (direct, bot) nomme la personne ; tout le reste (group privé, type inconnu ou absent) reste anonyme (« Transféré »). Trois issues exhaustives (group, person, anonymous), liste BLANCHE : un type neuf n'est jamais nommable par défaut, et « ? » n'est pas un nom.

Écarts :
- Réécrire ForwardBadgePolicy.kt : il applique l'ancienne liste NOIRE {direct, bot} qui nomme encore un groupe privé (type group) ; passer à la liste BLANCHE {public, global, broadcast, channel, community}
- Ajouter le cas « personne » : tête-à-tête (direct, bot) nomme senderName, écarté si vide ou « ? » ; sinon anonyme (type inconnu ou absent = échec FERMÉ)
- Retourner un type somme ForwardAttribution (group, person, anonymous) à la place de String? pour qu'un appelant ne puisse pas retomber sur le nom de la personne par oubli
- Résoudre l'attribution UNE fois dans le builder (BubbleContent.forwardAttribution) et la faire consommer par les trois rendus ; mettre à jour la règle jumelle web
- Libellés « Transféré de <groupe> », « Fwd. de <personne> », « Transféré » ; tests JVM de chaque type de conversation

Rendu : Rendu par le badge de cbr-meta-badges ; aucune surface propre.

Transposition Android : Pure Kotlin dans core/model, testée JVM.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ForwardBadgePolicy.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### La bulle prend la forme, le fond et l'encre propres à la conversation

`cbr-shell-skin` · Android : **divergente** · P0 · effort M

Fond PLAT (pas de dégradé) à coins de 18 pt. La bulle envoyée prend la peau de la conversation : indigo de marque, ou l'accent personnel choisi avec une encre noire ou blanche calculée pour le contraste. La bulle reçue est une teinte OPAQUE de l'accent mêlée à la surface de l'app, avec un liseré fin de l'accent (0,34 en sombre, 0,26 en clair). Largeur maximale pilotée par la classe de taille et la largeur du conteneur, espaceur de 50 pt côté opposé, constantes d'animation partagées (easeOut 0,18 s). La peau se repeint quand l'apparence de la conversation change.

Écarts :
- Corriger la couleur de la bulle ENVOYÉE : Android passe l'accent de conversation (outgoingColor = accentColor) alors qu'iOS utilise l'indigo de marque, ou l'accent personnel de l'apparence de conversation
- Introduire BubbleSkin : fond envoyé + encre lisible noire/blanche (équivalent de readableInk) appliquée au texte, aux méta, aux liens, à la citation et aux pièces, jamais un blanc en dur
- Bulle REÇUE : teinte opaque de l'accent de conversation mêlée à la surface (BubbleSkin.receivedFillHex) + liseré de 1 dp à 0,34 (sombre) / 0,26 (clair), au lieu de backgroundTertiary uni
- Rayon 18 dp (lgPlus) au lieu de MeeshyRadius.xl, identique pour le liseré arc-en-ciel des effets
- Largeur max = 70 % du conteneur en téléphone, plafond resserré en tablette (DeviceLayout.bubbleMaxWidth) au lieu de 300 dp fixes ; espaceur minimal de 50 dp côté opposé
- Observer ConversationAppearance (accent personnel, fond) et ne repeindre les cellules que si la peau change
- Aplats opaques uniquement : aucun dégradé ni ombre par bulle (coût au scroll)
- Aligner les constantes de mouvement (easeOut 180 ms) pour layout, swipe, pulsation de réaction et fondu de l'overlay

Rendu : Fond plat, rayon 18 dp. Envoyée : indigo de marque (#6366F1) ou accent perso, encre contrastée. Reçue : teinte opaque de l'accent de la conversation + liseré de 1 dp. Sens de lecture : reçues alignées à gauche, envoyées à droite, espaceur de 50 dp à l'opposé. Les effets de message (lueur, pulsation, arc-en-ciel) existent déjà dans MessageEffectModifiers.

Transposition Android : BubbleSkin devient une data class fournie par un CompositionLocal ; la largeur max vient de WindowSizeClass + BoxWithConstraints.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+TextBubble.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSkin.swift`
- `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Appearance.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageEffectModifiers.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Le Prisme se lit dans le pied : drapeaux, bouton traduire et traduction inline

`cbr-translation-flags` · Android : **divergente** · P0 · effort M

Les drapeaux des langues disponibles vivent dans le pied, précédés du bouton traduire. Toucher un drapeau applique BubbleLanguageFlagController : retour à la langue primaire, ouverture d'un panneau SECONDAIRE inline sous le texte (séparateur trait-point-trait de la couleur de la langue, mentions/hashtags/liens teintés), fermeture au second toucher, ou demande de traduction si la langue n'a pas de contenu. Le panneau vaut aussi pour la transcription d'un audio.

Écarts :
- Trancher la divergence assumée dans LanguageFlagTapResolver (le toucher d'un drapeau change la langue PRIMAIRE) : l'iso demande le panneau secondaire inline, avec états switchPrimary / openSecondary / closeSecondary / requestTranslation
- Ajouter le panneau secondaire sous le texte : séparateur trait-point-trait (couleur de la langue à 0,4), texte à opacité « intense », teintes mention/hashtag/lien, liens suivis, liens inertes pour un auteur sans compte
- Déplacer les drapeaux dans le pied (leading) et ajouter le bouton traduire (glyphe indigo400) en première position stable, masqué quand des drapeaux existent ; Android les rend en FlowRow sous le texte
- Haptique léger au toucher d'un drapeau et animation d'ouverture/fermeture du panneau
- Étendre le panneau à la transcription des vocaux (voir cbr-audio-inline-player)
- Ordre du Prisme : rang 1 → 4 sans repli arbitraire ; pas de traduction qui correspond → afficher l'original

Rendu : Chaque drapeau en pastille de 20 dp ; le panneau secondaire s'ouvre sous le texte avec un trait-point-trait coloré par langue, contenu en légère opacité réduite.

Transposition Android : État secondaire (code + contenu) porté par la cellule ou le ViewModel ; panneau en Column animée sous le texte.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Reveal.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/LanguageFlagTapResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Répondre à une story cite la scène elle-même, pas une ligne de texte

`cbr-story-citation` · Android : **divergente** · P1 · effort M

La story répondue est une carte en portrait 9:16, non recadrée, posée au-dessus du contenu, sur le fond de la conversation (au rang de l'épingle et du badge éphémère), jamais dans le fond coloré. Un bandeau porte « réponse à sa story » et la date relative atténuée. La carte se rend toujours et le toucher tente toujours d'ouvrir : l'échec se dit chez l'hôte, sans inférer l'expiration. Une humeur garde un rendu dédié (emoji, contenu, date).

Écarts :
- Sortir StoryReplyPreview de la bulle colorée : carte indépendante posée au-dessus du contenu, sur le fond de conversation
- Scène en 9:16 sans recadrage (vignette de la story gravée dans la citation), bandeau « réponse à sa story » + date de publication relative atténuée
- Rendre la carte même si la story a expiré et laisser le toucher tenter l'ouverture ; message d'échec affiché par l'écran hôte quand la story est introuvable (aucune règle d'expiration locale)
- Humeur (moodEmoji) : garder le rendu en citation (emoji + contenu + date)
- Teinte du bandeau et du repli de scène = accent de la conversation ; égalité comparant tous les champs rendus

Rendu : Carte portrait d'environ 0,7 de ratio hauteur/largeur de bulle, bandeau d'accent en haut, date en caption atténuée, coins arrondis.

Transposition Android : Carte Compose avec aspectRatio(9f/16f) ; ouverture via la navigation vers le visionneur de stories existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStoryCitationCard.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`

### Chaque bulle se rend depuis un modèle unique, construit une fois par message

`cbr-content-model` · Android : **partielle** · P0 · effort L

iOS construit un BubbleContent immuable et comparable : kind (standard, supprimé, vue unique scellée, vue unique ouverte, éphémère expiré, système), pièces classées en grille visuelle / audio / non-média / mixte, texte avec premier lien, vidéo intégrée et carte de conversation précalculés, traduction et drapeaux, citation, sticker, avis d'appel, attribution de transfert, descripteur de protection, pied et identité de l'expéditeur. Les sous-vues ne lisent jamais le message brut ; l'égalité compare aussi les champs mutables d'une pièce (vignette, flou, compteur de vues, réactions par pièce).

Écarts :
- Ajouter au BubbleContent Android : vidéos (le builder ne garde que images, fichiers, positions, audios), sticker, carte de contact, avis d'appel (callSummary), avis d'arrivée, descripteur de protection (éphémère, vue unique, flou, chiffré) et état scellé sans contenu monté (sealedForDisplay)
- Remplacer les booléens isViewOnce/viewOnceCount par un kind complet : standard, deleted, viewOnceOpened, viewOnceSealed, ephemeralExpired, system
- Classer les pièces comme iOS : visualGrid (images et vidéos), audio (une ou plusieurs pistes), nonMedia (fichier, position, contact) et mixed
- Porter une ReplyReference complète (auteur, identifiant de compte, pièce citée, dimensions, durée, taille, thumbHash, quotedPieceCount, protection du média cité, story ou humeur) au lieu de replyToText + miniature
- Porter ForwardAttribution à trois issues (group, person, anonymous) à la place de forwardedFromName
- Précalculer dans le builder le premier lien, la vidéo intégrable (YouTube), la cible de carte de conversation, la table de liens suivis et le drapeau « liens inertes » (auteur sans compte)
- Porter l'heure formatée, l'identité de l'expéditeur (nom, pseudo, rôle, avatar, accent, humeur, présence, anneau de story) et le modèle de pied dans le contenu
- Égalité structurelle qui inclut les champs mutables d'une pièce (thumbnailUrl, fileUrl, isBlurred, viewOnceCount, durée, dimensions, réactions par pièce) et clés LazyColumn stables pour zéro recomposition inutile
- Tests JVM du builder pour chaque kind et chaque combinaison de pièces

Rendu : Aucun rendu propre : le modèle conditionne la fluidité (recomposition ignorée tant que le contenu ne change pas) et fixe l'ordre vertical du contenu d'une bulle : épingle, transféré, chrome de protection, carte de story, puis corps de la bulle.

Transposition Android : Data classes @Immutable construites par un builder pur testé JVM ; l'équivalent du Equatable SwiftUI est l'égalité structurelle plus des clés stables dans la LazyColumn.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleRenderKindPresenter.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/BubbleMemoCache.kt`

### Chaque bulle affiche son heure, sa coche et ses contrôles de traduction dans un pied soigné

`cbr-footer-meta` · Android : **partielle** · P0 · effort M

Pied unique à trois styles : row (sous le texte, l'emoji ou l'audio), overlay (capsule sombre posée sur l'image, la vidéo ou le carrousel) et compact (à côté d'un emoji seul). Il porte à gauche le bouton traduire puis les drapeaux de langue, à droite la marque « modifié » (crayon, ou flèches qui tournent pendant l'enregistrement), l'heure sur CHAQUE bulle et la coche de livraison. Le Layout du corps donne au pied exactement la largeur résolue du contenu, sans jamais l'élargir. Un échec d'envoi expose un bouton « Renvoyer ». Toucher les coches ouvre la fiche « Vu par ».

Écarts :
- Afficher l'HEURE (HH:mm localisée) sur chaque bulle, alignée à droite avec la coche : Android ne montre aucun horodatage, createdAtIso ne sert qu'au débounce de l'horloge d'envoi
- Créer un modèle de pied (BubbleFooterModel) comparable et un composable unique à trois styles : row, overlay (capsule scrim, texte blanc, caption2 semibold, posée en coin sur image/vidéo/carrousel) et compact (emoji seul, même baseline)
- Marque « modifié » DANS le pied (crayon ; flèches circulaires en rotation pendant l'enregistrement de l'édition) à la place du texte « edited » isolé
- Bouton traduire (glyphe translate, indigo400) toujours en PREMIÈRE position stable, suivi des drapeaux ; le glyphe disparaît dès qu'un drapeau existe ; absent pour emoji seul, position, fichier, média seul
- Layout corps+pied : le pied reçoit exactement la largeur résolue du corps, n'élargit jamais la bulle, plancher = largeur intrinsèque de sa méta ; mesure mise en cache par (messageId, contenu)
- Échec d'envoi : coche rouge + bouton « Renvoyer le message » (haptique léger), sauf si la bande de renvoi est affichée (état dit une seule fois)
- Toucher les coches de livraison ouvre la fiche de détail sur l'onglet « Vues » (onShowReadStatus)
- Couleurs de méta distinctes envoyé / reçu / overlay (readTint indigo400 sombre, indigo600 clair)

Rendu : Heure en caption medium (couleur méta atténuée, blanche semibold dans l'overlay), coche à droite de l'heure, marge basse de 8 dp. Gauche : glyphe translate puis pastilles de drapeaux. Overlay : capsule MeeshyColors.mediaScrim, padding 6/2 dp. Compact : heure + coche collées à l'emoji sans fond.

Transposition Android : Layout Compose personnalisé (SubcomposeLayout ou Layout) pour caler le pied sur la largeur du corps ; capsule overlay en Box alignée BottomEnd.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBodyFooterLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Footer.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/SendingClockRevealPresenter.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### La liste de messages reste fluide et à jour sans reconstruire tout le fil

`cbr-list-host-data` · Android : **partielle** · P0 · effort L

L'hôte de la liste (UICollectionView inversée hébergeant des bulles SwiftUI) construit des items par type (bulle, jour, frappe, séparateur de non-lus) pour des pools de réutilisation distincts, applique les snapshots avec un reconfigure ciblé (items vs tous) jamais pendant un geste puis rejoué à l'arrêt, regroupe en 80 ms les rafales de traductions / transcriptions / audios, résout serverId ↔ localId, compense les suppressions sous la fenêtre, endort ses mises à jour sous un panneau opaque, et fige par cellule des entrées primitives (compte de destinataires, dernier message reçu, queue de groupe) sans lire le ViewModel dans la bulle.

Écarts :
- Items typés avec contentType distincts (bulle, jour, frappe, non-lus) pour des pools de composition réutilisés correctement
- Coalescer en 80 ms les événements de traduction, transcription et traduction audio avant de recomposer les bulles touchées ; ne recomposer QUE les items concernés (diff par id), jamais toute la liste
- Ne pas appliquer de reconfiguration globale pendant un geste de défilement : mémoriser le delta et le rejouer à l'arrêt (union accumulée)
- Veille de la liste sous un panneau opaque (mode Rivière/Résumé si repris) : les flux continuent mais le puits est neutralisé
- Table serverId ↔ localId pour les messages optimistes et compensation des suppressions sous la fenêtre affichée
- Entrées primitives par cellule : compte de destinataires (direct / serveur / membres), dernier message reçu, tête/queue de groupe, langue préférée, consentement vocal, terme de recherche ; aucune lecture directe du ViewModel dans la bulle
- Cache-first : jamais de spinner sur un cache non vide ; skeleton uniquement à froid (existe via ChatSkeleton)
- Marqueur « Début de la conversation » inerte côté iOS : ne pas le porter

Rendu : Marge horizontale de section 12 dp identique dans tous les modes ; contenu inversé, bas visuel = index 0.

Transposition Android : LazyColumn(reverseLayout) + ImmutableList + keys stables + snapshotFlow ; remplacer le diffable data source par des états immuables comparables.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Rows.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ApplySnapshot.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Snapshot.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Observation.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageCellHandlers.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+MessageCellInputs.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/BubbleMemoCache.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOrdering.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Les photos et vidéos d'un message s'affichent en grille nette avec « +N »

`cbr-media-grid` · Android : **partielle** · P0 · effort M

Grille visuelle de la bulle : 1 pièce (240 pt de haut pour une image, ratio natif pour une vidéo), 2 (côte à côte, 180 pt), 3 (60/40, 240 pt), 4 et plus (2×2, 240 pt, tuile « +N » qui ouvre le carrousel). Chaque cellule choisit la variante d'image selon sa largeur, affiche un ThumbHash flou, un badge « télécharger » tant que l'image n'est pas arrivée, un badge de compteur de vues, la pastille des réactions de la pièce et un poster de vidéo (vignette serveur, sinon première image extraite) avec badge lecture et durée. Un toucher ouvre le plein écran.

Écarts :
- Inclure les VIDÉOS dans la grille (aujourd'hui seules les images passent par BubbleImageGrid) avec poster net : vignette serveur, sinon première image extraite et mise en cache, sinon ThumbHash, sinon aplat
- Refaire les 4 agencements iOS : 1 pièce 240 dp (ratio natif pour la vidéo), 2 pièces 180 dp, 3 pièces 60/40 sur 240 dp, 4+ en 2×2 de 240 dp avec espacement de grille ; Android fait 1 grande puis 2×2 de 124 dp
- Choisir la variante d'image (miniature ou originale) d'après la largeur de cellule en dp × densité
- Badge « télécharger » centré tant que l'image affichée n'est pas arrivée, branché sur la politique de téléchargement automatique (MediaAutoDownload)
- Badge compteur de vues (« N vues ») et pastille des réactions de la pièce (coin bas-gauche ; haut-gauche pour la vidéo)
- Tuile débordement « +N » qui ouvre le carrousel (et non le plein écran d'une seule image)
- Fond noir derrière chaque cellule, ThumbHash en placeholder, badge lecture de 64 dp (pièce seule) ou 44 dp (grille) et durée sur le poster
- Pièce protégée (vue unique, floutée) : poster seul, geste de révélation avant le plein écran

Rendu : Largeur de grille = largeur utile de la bulle ; coins arrondis de la bulle écrêtés ; badges 24–28 dp avec scrim ; « +N » centré en blanc sur voile noir à 0,45.

Transposition Android : MosaicLayout (déjà portée pour les posts) fournit les cadres ; AsyncImage/Coil + ThumbHashPainter pour les placeholders.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/ConversationVideoPoster.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoPosterSource.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MediaAutoDownload.kt`

### Les messages protégés se dévoilent au toucher : flou, vue unique et éphémère

`cbr-protected-veil` · Android : **partielle** · P0 · effort M

Un contenu flouté ou à vue unique est voilé tant que le lecteur n'a pas fait le geste. Toucher révèle pour une durée (5 s par défaut) puis rejoue brouillard-flou-brouillard. La vue unique commence par CONSOMMER le compteur côté serveur. Une vue unique scellée n'est que la puce « (1) · Touchez pour afficher » (aucun contenu monté, donc rien dans l'arbre d'accessibilité, la légende ou la file de téléchargement) ; une fois ouverte par CE lecteur : « (1) · Déjà ouvert ». Le chrome de protection au-dessus de la bulle porte le décompte éphémère, la vue unique et le flou. Les pièces ont leurs propres voiles.

Écarts :
- Câbler la consommation SERVEUR de la vue unique avant la révélation (BubbleBlurReveal le note : « until that endpoint is wired ») avec rappel de succès ; la révélation locale seule laisse le secret rejouable
- État scellé : puce « (1) · Touchez pour afficher » SANS contenu monté (ni texte, ni légende, ni fichier, ni pièce) et état permanent « (1) · Déjà ouvert » calculé pour CE lecteur (pas par le compteur global du serveur)
- Texte à vue unique qui sort de l'écran passe à « déjà ouvert »
- ProtectedVeilAffordance : indication de geste (indice TalkBack) différente pour vue unique vs flou
- Chrome de protection unique (MessageProtectionChrome) au-dessus de la bulle : flamme + décompte éphémère, vue unique, flou ; un état se dit une seule fois
- Voiles par pièce : « Voir une fois » / « Contenu masqué » + « Toucher pour voir », badge « N vues », ouverture plein écran directe après révélation ; libellés TalkBack des voiles
- Message chiffré (fail-closed) : aucun contenu clair, libellé de protection ; vérifier l'enchaînement fogIn 0,4 s / blurApply 0,4 s / fogOut 0,5 s

Rendu : Puce capsule centrée sur la bulle (icône œil/flamme, libellé), voile de brouillard animé, bulle ré-floutée à l'expiration de la visibilité.

Transposition Android : Blur natif (Modifier.blur, API 31+) déjà utilisé avec voile opaque de repli ; état scellé = kind du BubbleContent, sans composition du contenu.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleViewOnceViews.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Reveal.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`

### La citation d'un message répond au regard : auteur, aperçu, média et pièces cités

`cbr-quote-card` · Android : **partielle** · P0 · effort M

La carte de citation dit qui est cité (avatar de 22 pt avec présence, « Vous » pour moi), un aperçu à budget de lignes par peau et par taille de texte, une ligne de détails (dimensions, durée, taille du média cité), des états supprimé / éphémère expiré, la FACE du média cité (vignette, poster de vidéo extrait de la première image si la vignette serveur manque, capsule vocale avec onde figée et bouton lecture) et un badge « +N » quand elle cite un message de plusieurs pièces. Un média protégé n'a aucune face, aucun détail, aucun thumbHash. Deux styles : carte dans la bulle ou intégrée au média.

Écarts :
- Remplacer ReplyPreview (barre d'accent + miniature 32 dp + une ligne) par la carte complète : avatar 22 dp de l'auteur cité avec point de présence, nom (« Vous » si moi), aperçu sur 2 lignes
- Ligne de détails pour le média cité : dimensions, durée « 0:42 », taille ; règle UNIQUE QuotedReplyPresentation partagée par bulle, rangée plate et bandeau du composeur
- Budget de caractères/lignes de l'aperçu adapté à la taille de police du lecteur (font scale) et coupure au mot
- Face du média : vignette (image ou vidéo), poster extrait de la première image de la vidéo citée sous clé thumb:<url> sinon ThumbHash sinon aplat de la couleur de l'auteur, capsule vocale 30 dp (cible 44) avec bouton lecture et onde figée qui se remplit pendant la lecture
- Badge « +N » (QuotedExtraPiecesBadge) au coin de la face pour une citation de message entier à plusieurs pièces ; absent si la citation nomme une pièce ou si le contenu est protégé
- États « Message supprimé » et « Message éphémère expiré » dans la citation
- Protection : média cité à vue unique, flouté ou chiffré = aucune vignette, aucun poster, aucune onde, aucun détail
- Deux styles : card (fond teinté d'accent, coins 12) et inline (sans enveloppe, pour le conteneur média+réponse) ; mentions résolues dans l'aperçu

Rendu : Barre d'accent verticale de 2 dp, fond d'accent à 12 %, avatar 22 dp, miniature 38 dp, texte callout 2 lignes, badge « +N » en capsule scrim sur le coin bas-droit de la face.

Transposition Android : Règle de présentation pure en Kotlin (testée JVM) consommée par la bulle, la rangée plate éventuelle et le bandeau de réponse du composeur.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedReplyPresentation.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedReplyPresentation+MediaFace.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedReplyPresentation+DynamicType.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedAudioPreview.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedVideoPoster.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedExtraPiecesBadge.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`

### Les réactions se posent à cheval sur le coin de la bulle, avec un bouton « + » sur le dernier message reçu

`cbr-reactions-strip` · Android : **partielle** · P0 · effort M

La bande de réactions est un overlay ancré au bas de la bulle, côté opposé au bord d'écran (reçue : s'étend vers la droite ; envoyée : vers la gauche), décalé de 18 pt. Jusqu'à 4 pastilles + une pastille « +N » qui ouvre le détail ; un bouton d'ajout (24 pt visible, cible 40 pt) n'existe que sur le DERNIER message reçu. Toucher bascule la réaction, appui long (0,4 s) ouvre le détail ; la pastille « moi » est saturée (fond 0,65 sombre / 0,5 clair, liseré 2,5 pt, ombre). Une réaction NOUVELLE entre en « comète » (zoom 2,6×, chute de 18 pt, ressort, tremblement amorti), jamais rejouée par un simple recyclage de cellule.

Écarts :
- Sortir ReactionStrip du flux interne de la bulle pour en faire un overlay en bas-coin (opposé à l'écran, offset 18 dp, padding −4), monté seulement s'il y a du contenu
- Limiter à 4 pastilles et ajouter la pastille « +N » (monospace bold) qui ouvre le détail des réactions
- Bouton d'ajout rapide (smiley) sur le DERNIER message reçu : tap = réaction rapide (haptique léger), appui long 0,4 s = sélecteur complet (haptique moyen), cible de 40 dp
- Pastille « moi » saturée (fond 0,65/0,5, liseré 2,5 dp, ombre) vs pastille standard (fond 0,08/0,04) avec la teinte de la bulle hôte
- Animation « comète » à l'arrivée d'une réaction NOUVELLE seulement (garde ReactionAnimationGate : toggle local ou socket reaction:added), sans rejeu au recyclage, sous Réduire les animations = état final immédiat
- Libellés/indices TalkBack (« Ajouter une réaction », « n réactions de plus », « Appuyer pour basculer, maintenir pour voir toutes les réactions ») et actions d'accessibilité équivalentes

Rendu : Bande de 22 dp de haut, pastilles caption2, emoji + compteur en bold si > 1, chevauchement d'environ moitié sous / moitié hors de la bulle.

Transposition Android : Box en overlay (Modifier.offset) avec zIndex ; animation par Animatable (scale/offset/rotation) déclenchée par un événement modèle, pas par la composition.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReactionBreakdown.kt`

### Seuls les messages réellement vus sont accusés de lecture

`cbr-seen-tracking` · Android : **partielle** · P0 · effort M

Le suivi de lecture exact : un accumulateur (présence ≥ 300 ms, lots de 50, plafond de 2 000 rapportés) est alimenté par l'apparition et la disparition des cellules, vidé au rythme de 4 Hz et immédiatement quand le lecteur déclare regarder le bas (arrivée en bas, demande, ouverture, arrière-plan, fermeture). Les messages optimistes (sans serverId) sont écartés, seuls les modes qui rendent le fil comptent, et chaque vidage rapporte aussi ce que la liste montre.

Écarts :
- Accumulateur SeenMessageAccumulator (présence ≥ 300 ms, lot 50, plafond 2 000) alimenté par la visibilité des items de la LazyColumn ; Android ne marque que la conversation (markReadOptimistic/mark-as-read)
- Vidage périodique à 250 ms et flush immédiat à : arrivée en bas du fil, demande explicite, ouverture de l'écran, passage en arrière-plan, démontage
- Écarter les messages optimistes (sans serverId) et mes propres messages ; rapporter aussi la liste des ids visibles au serveur avec le lot
- Ne compter que ce que le mode de lecture rend (aucun accusé pour un panneau opaque qui recouvre la liste)
- Ré-annoter comme apparues les cellules déjà à l'écran au retour vers un mode rendu

Rendu : Aucun rendu propre ; effet visible = coches « lu » côté expéditeur et badge de non-lus qui baisse.

Transposition Android : LazyListState.layoutInfo.visibleItemsInfo observé par un snapshotFlow ; flush via lifecycle (ON_STOP).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+SeenTracking.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Chaque bulle se lit d'un seul bloc au lecteur d'écran, avec ses actions nommées

`cbr-a11y-label` · Android : **partielle** · P1 · effort S

La bulle regroupe ses enfants et remplace son libellé par une phrase composée : expéditeur (« Expéditeur inconnu » sinon), réponse à qui avec extrait (« Réponse à vous / à X : … »), nombre d'images, de vidéos, de vocaux, état édité, épinglé, étiquettes de protection et réactions. S'y ajoutent des actions nommées pour les zones de la citation et pour répondre, transférer, ouvrir le menu.

Écarts :
- Appliquer le libellé composé à la bulle INTERACTIVE de la liste (aujourd'hui il n'est posé que sur le héros de l'overlay d'appui long car clearAndSetSemantics efface les cibles) en conservant des customActions pour les zones
- Distinguer images et vidéos dans le libellé (le BubbleContent Android ne porte pas la vidéo)
- Actions TalkBack nommées : Répondre, Transférer, Menu du message, plus les trois actions de zones de citation
- Intégrer les étiquettes de protection (éphémère, vue unique, flou, chiffré) du descripteur de protection
- Inclure l'heure et l'état de livraison selon les règles iOS

Rendu : Aucun rendu visuel ; ordre de lecture : expéditeur, réponse, contenu, méta, réactions.

Transposition Android : semantics { contentDescription + customActions } avec mergeDescendants = true.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Accessibility.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubbleAccessibilityLabel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### « Supprimer pour moi » masque un message localement, par compte, pour toujours

`cbr-delete-for-me` · Android : **partielle** · P1 · effort S

Ensemble persisté des identifiants masqués (suppression locale à la WhatsApp, jamais envoyée au serveur), qui survit aux redémarrages. À la déconnexion, les masquages du compte sortant partent (sinon ils filtrent les conversations du compte suivant). Quand un message optimiste se réconcilie temp → serveur, l'identifiant masqué est re-clé pour ne pas réapparaître. Annulation (unhide) et instantané brut pour pré-filtrer la liste.

Écarts :
- Vider le store à la déconnexion (fuite de masquages entre comptes : aucun hook de logout côté Android)
- migrate(from, to) lors de la réconciliation d'un id optimiste vers l'id serveur, sinon un message masqué réapparaît
- unhide pour une action « Annuler » après suppression locale
- clearAll et instantané brut (visibleIds) pour pré-calculer la liste filtrée sans verrou par ligne
- Tests : idempotence, migration, persistance

Rendu : Aucun rendu propre ; le message disparaît de la liste immédiatement (mise à jour optimiste).

Transposition Android : SharedPreferences déjà utilisé ; ajouter un collecteur de l'événement de déconnexion.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/LocallyHiddenMessagesStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/LocallyHiddenMessagesStore.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### La coche de livraison dit chaque état de l'envoi, jusqu'au sablier hors-ligne

`cbr-delivery-check` · Android : **partielle** · P1 · effort S

Un glyphe unique pour tous les pieds : invisible, envoi (horloge révélée après 200 ms), lent, envoyé, distribué, lu (indigo clair en sombre / indigo foncé en clair, jamais blanc ni gras) et échec ; en hors-ligne, un envoi en vol devient un sablier orange (warning). Même glyphe en overlay avec un blanc dédié.

Écarts :
- Teinte « lu » adaptée au thème : indigo400 en sombre ou sur overlay, indigo600 en clair (Android utilise le jeton info)
- Sablier hors-ligne en couleur warning (orange) au lieu d'un gris à 50 % d'opacité
- Variante pour l'overlay média : coches blanches, lu en indigo400
- États intermédiaires lent / invisible distincts de l'envoi, avec libellés d'accessibilité dédiés
- Tailles de glyphe via le jeton d'icône xxs (semibold) au lieu de 16 dp fixes
- Rendre la coche cliquable (ouvre « Vu par ») et masquer la coche d'échec quand la bande de renvoi est montrée

Rendu : Glyphe caption2 semibold aligné sur la ligne de l'heure ; lu en indigo (pas bleu iOS), échec en rouge stateFailed, hors-ligne en orange.

Transposition Android : Icônes Material (Schedule, HourglassEmpty, Done, DoneAll, ErrorOutline) déjà utilisées ; ajouter les teintes thématiques.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleDeliveryCheck.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/SendingClockRevealPresenter.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/DeliveryStatusResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SendLifecycleResolver.kt`

### L'explorateur de langues d'un message montre chaque traduction et sait en demander une

`cbr-detail-language-explorer` · Android : **partielle** · P1 · effort M

Feuille du Prisme Linguistique : bannière « Original • langue », une ligne par langue avec aperçu, sélection de la traduction à afficher, demande de traduction (texte et audio) et « Retraduire ». L'état « en cours » par langue est possédé par le ViewModel et survit à la fermeture de la feuille, les échecs de demande remontent, et la même feuille sert les posts (traductions fournies, sans appel /messages/<id>/translations).

Écarts :
- Piste audio : traductions audio par langue (translatedAudios), sélection de la langue de lecture, demande de traduction audio par attachmentId, transcription
- État « en cours » par langue (texte et audio) tenu par le ViewModel et conservé à la fermeture/réouverture de la feuille
- Remontée d'un échec de demande (TranslationRequestFailure) en message à l'utilisateur
- Lecture des traductions via GET /messages/:id/translations (sauf contenu de post, dont les traductions sont passées en entrée)
- Ordre des langues : Android privilégie les langues configurées puis les candidates, iOS une liste de 18 langues : trancher la divergence
- Libellés « Original • %@ », « Fermer la traduction », « Retraduire », « Traduire » et accessibilité

Rendu : Bannière d'original teintée de la couleur de la langue, rangées avec drapeau, nom, aperçu tronqué, indicateur de progression ou bouton Retraduire à droite.

Transposition Android : ModalBottomSheet existant (MessageLanguageExplorerSheet) ; ajouter l'audio et l'état persistant du VM.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageDetailExplorer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`

### Le détail des réactions se filtre par emoji et permet d'en ajouter une

`cbr-detail-reactions` · Android : **partielle** · P1 · effort S

Feuille « Réactions » d'un message : onglets Toutes + un par emoji (compteur), liste des personnes (avatar, nom, « Inconnu » si absent), état vide « Aucune réaction ». Elle sert aussi à AJOUTER une réaction : bande rapide des 12 emojis les plus utilisés, plus un sélecteur complet, avec haptique léger.

Écarts :
- Ajouter en tête de la feuille la bande rapide des 12 emojis les plus utilisés (EmojiUsageStore.top) + bouton vers le sélecteur complet ; envoi de la réaction avec haptique léger et enregistrement de l'usage
- Compteur dans chaque onglet de filtre et libellé d'accessibilité « n réaction(s) »
- État de chargement du détail (skeleton si cache vide) et libellé « Inconnu » pour un utilisateur sans nom
- Lecture seule quand aucun gestionnaire d'ajout n'est fourni

Rendu : Onglets horizontaux défilants (emoji + compteur), ligne par utilisateur (avatar 36 dp, nom), séparateur fin sous la bande rapide.

Transposition Android : ModalBottomSheet existant ; réutiliser EmojiPicker et EmojiUsageStore.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReactionBreakdown.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`

### Signaler un message demande une confirmation avant d'alerter la modération

`cbr-detail-report` · Android : **partielle** · P1 · effort S

Feuille de signalement : « Pourquoi signalez-vous ce message ? » avec sept motifs (spam, contenu inapproprié, harcèlement, violence, discours haineux, usurpation d'identité, autre) ; après le choix d'un motif, un champ « Détails (facultatif) » de 3 à 6 lignes ; bouton « Envoyer le signalement » qui ouvre une CONFIRMATION (« Signaler ce message ? » / « Le message sera transmis à la modération ») avant l'envoi, puis la feuille se ferme.

Écarts :
- Ajouter la boîte de confirmation obligatoire avant l'envoi (« Signaler ce message ? » / « Le message sera transmis à la modération », Annuler / Envoyer) : action de modération, retour du porteur du 2026-07-14
- Afficher le champ « Détails (facultatif) » seulement après la sélection d'un motif (3–6 lignes)
- Bouton désactivé tant qu'aucun motif n'est choisi ou pendant l'envoi

Rendu : Rangées de motifs radio, champ multiligne arrondi, bouton plein largeur en rouge d'erreur.

Transposition Android : AlertDialog Material devant ReportMessageForm existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageForm.kt`

### Un emoji seul s'affiche en grand, sans bulle, avec son heure à côté

`cbr-emoji-only-bubble` · Android : **partielle** · P1 · effort S

Un message composé uniquement d'emojis s'affiche en grand (original, jamais traduit) sans fond de bulle, avec l'heure et la coche collées sur la même baseline dans un bloc indissociable aligné sur le bord côté expéditeur ; le contenu secondaire (langue alternative) descend dessous et les réactions chevauchent le coin. En réponse, la citation est posée au-dessus, l'emoji est centré et la citation garde ses zones tactiles.

Écarts :
- Méta compacte (heure + coche) sur la même baseline que l'emoji, bloc fixe collé au bord côté expéditeur (Android ne montre aucune heure)
- Vérifier les tailles d'emoji (Android : 1 → 90, 2 → 60, 3 → 45 sp) contre la règle iOS ×4 / ×3 / ×2 et la fonte emoji dédiée
- Emoji non traduit : toujours le contenu original ; contenu secondaire sous le bloc
- Réponse à un emoji : citation au-dessus avec zones, emoji centré sous elle
- Réactions à cheval sur le coin, comme une bulle ordinaire

Rendu : Emoji de 45–90 sp sans fond, heure en caption atténuée à droite de la baseline, coche à côté.

Transposition Android : Row avec alignment LastBaseline ; EmojiDetector existant.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+TextBubble.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+EmojiReply.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EmojiDetector.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### Un message éphémère meurt à l'heure, même après un redémarrage

`cbr-ephemeral-clock` · Android : **partielle** · P1 · effort M

La réception est la seule horloge qui démarre un éphémère, et elle survit au redémarrage : un registre persisté (partagé entre l'app et l'extension de notification) grave la première réception de chaque message, de façon idempotente et monotone (un resync ne relance pas l'horloge), avec un plafond de rétention ; un second registre garde la mémoire des MORTS pour qu'un message détruit ne renaisse jamais. Le sélecteur propose « Après lecture » (détruit quand le lecteur quitte la conversation) en plus de durées courtes, avec libellés de pastille et d'accessibilité.

Écarts :
- Registre persisté des premières réceptions (SharedPreferences/DataStore) : noteReception idempotent et monotone, rétention plafonnée (contrat #7451 point 9) ; Android lit uniquement expiresAt et ne mémorise aucune réception
- Registre des destructions (« un mort ne renaît pas », #7552), consulté AVANT tout stamp de réception, jamais effacé
- Partager le registre avec le gestionnaire FCM pour que l'arrivée la plus précoce démarre le décompte (équivalent de l'extension de notification)
- Choix « Après lecture » : EphemeralDuration Android n'a que 30 s, 1 min, 5 min, 1 h, 24 h ; ajouter afterRead (détruit à la sortie de la conversation) et la durée 15 s si le contrat l'inclut
- Libellés : pastille courte (« Après lecture » / « 15s ») et libellé complet pour TalkBack (« Après lecture, quand le lecteur quitte la conversation »)
- Aperçu de liste : afficher la DURÉE sans décompte tant que le message n'a pas été reçu

Rendu : Pastille flamme + décompte monospace en rouge d'erreur au-dessus de la bulle (existe) ; le sélecteur affiche une flamme-œil nommée pour « Après lecture ».

Transposition Android : UserDefaults app group → SharedPreferences/DataStore de l'application lu aussi par MeeshyFcmService.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/EphemeralReceiptLedger.swift`
- `apps/ios/Meeshy/Features/Main/Components/EphemeralChoiceCopy.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsEditor.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Un message en échec porte une bande orange pour le renvoyer d'un toucher

`cbr-failed-retry-bar` · Android : **partielle** · P1 · effort S

Une bande orange (stateFailed) collée au bord côté écran de la bulle envoyée en échec, intégrée au rectangle arrondi : le contenu et le pied restent lisibles. Au repos elle est fixe avec un glyphe flèche circulaire ; au toucher elle bascule en spinner et clignote doucement (désactivé sous Réduire les animations), disparaît quand le message quitte l'état échec et réapparaît fixe si l'envoi échoue de nouveau. La bande entière est la cible (≥ 44 pt) et gagne sur l'appui long.

Écarts :
- Remplacer la ligne de texte « Appuyer pour réessayer » sous la bulle par la bande verticale orange intégrée au bord de la bulle (contenu inset à gauche)
- Glyphe refresh au repos ; spinner blanc + clignotement doux (opacité 0,92 ↔ 1) après le toucher, gated par Réduire les animations
- Retirer la bande dès que le statut quitte Failed ; la recréer fixe si l'échec se répète
- Cible de toucher ≥ 48 dp sur toute la bande, prioritaire sur le long press de la bulle
- Masquer la coche rouge de l'échec quand la bande est montrée

Rendu : Bande d'environ 32 dp de large sur la hauteur de la bulle, couleur stateFailed, glyphe blanc centré.

Transposition Android : Box clippée dans la forme de la bulle ; animation via rememberInfiniteTransition gated par LocalReduceMotion.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFailedRetryBar.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Fichiers, cartes de contact et positions se rendent dans la bulle comme des objets à part entière

`cbr-file-contact-location` · Android : **partielle** · P1 · effort L

Pièces non-média : une vCard devient une carte de visite (testée AVANT la détection de code), un fichier de code s'affiche avec coloration syntaxique selon le langage détecté, un document avec son icône de type et ses actions de téléchargement/partage, une position avec une carte miniature qui ouvre un plein écran (nom, adresse, accent, expéditeur). Le partage passe par la feuille système.

Écarts :
- Carte de visite (text/vcard) : nom, téléphone, e-mail et actions (ajouter aux contacts, appeler) ; testée avant la détection de code
- Visionneuse de code : langage détecté par nom/mime, coloration syntaxique, ouverture plein écran
- Carte de document : icône par AttachmentKind (PDF ≠ Word), nom, taille, états téléchargement/ouvrir/partager ; Android n'a qu'une ligne nom+taille
- Position : carte miniature avec repère (au lieu d'une ligne « position partagée »), toucher = plein écran dédié (nom, adresse, accent, expéditeur) ; itinéraire par Intent geo
- Plein écran de position pour message.location (SharedPlace avec adresse) et pour une position en pièce jointe (lat/lon + nom)
- Feuille de partage système (ACTION_SEND) pour fichier et lien partageable
- Position sans coordonnées : cas inatteignable côté iOS, garder l'état dégradé Android sans régression

Rendu : Cartes de 252 dp de large alignées sur la grille média, icône de type à gauche sur pastille accentuée, nom en callout semibold, détails en caption atténué ; carte de position avec coin arrondi et nom en légende.

Transposition Android : Maps Compose ou tuile statique + Intent geo: ; vCard via ContactsContract Intent ; FileProvider pour le partage.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Attachments.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownload.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentIntentResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/location/LiveLocationBadge.kt`

### Une image ou une vidéo s'ouvre en plein écran avec légende, enregistrement et partage

`cbr-fullscreen-media` · Android : **partielle** · P1 · effort M

Le plein écran de bulle présente l'image (zoom, légende du message avec mentions, action « Enregistrer » dans un flux unifié avec feuille de destinations) ou la vidéo (lecteur plein écran reprenant le moteur partagé à la même position, pastille d'auteur, légende, nom de fichier, télécharger, partager, fermer). Une pièce à vue unique révélée s'ouvre directement depuis la grille ; les lieux ont leur propre plein écran.

Écarts :
- Plein écran VIDÉO dans la conversation (contrôles complets, reprise de position, pastille d'auteur avec avatar, légende, nom de fichier, partage, téléchargement, fermeture) : seul le visionneur d'images existe
- Légende = contenu du message (si non vide) avec mentions résolues, affichée sur l'image et sur la vidéo
- Flux « Enregistrer » unifié avec feuille de destinations (galerie, fichiers) pour image et vidéo ; GalleryImageSaver ne couvre que les images
- Galerie de toutes les pièces visuelles du message, balayage entre images et vidéos
- Pièce à vue unique/floutée révélée : ouverture directe depuis l'hôte, sans passer par un état intermédiaire
- Choix de l'URL plein écran de l'image (variante la plus nette) et poster vidéo résolu côté app

Rendu : Fond noir, barre supérieure translucide (fermer, partager, enregistrer), légende en bas sur dégradé sombre, pastille d'auteur discrète en haut à gauche.

Transposition Android : Dialog plein écran Compose ou destination de navigation ; MediaStore pour l'enregistrement, ACTION_SEND pour le partage.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Reveal.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerSource.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Un lien se déplie en lecteur vidéo, en carte de conversation ou en aperçu

`cbr-link-embed` · Android : **partielle** · P1 · effort M

Sous le texte, la première URL (précalculée une fois) rend : une façade de lecteur pour une vidéo intégrable (YouTube), sinon une carte de conversation Meeshy qui permet de rejoindre, quitter ou ouvrir (lien de partage ou lien direct), sinon l'aperçu OpenGraph. Le suivi de liens (/l/<token>) s'applique et un auteur sans compte n'a aucun lien actif.

Écarts :
- Façade de lecteur pour les vidéos intégrables (YouTube) avec URL suivie (trackedURL) ; toucher charge le lecteur ou ouvre watchURL canonique
- Carte de conversation Meeshy (#8099) pour un lien de partage ou un lien direct : titre, membres, accent, boutons rejoindre / quitter / ouvrir selon l'état
- Ordre de priorité : vidéo intégrable > carte de conversation > aperçu OpenGraph
- Précalculer la première URL et sa classification dans le builder (aujourd'hui calculée dans ChatScreen via LinkPreviewParser.firstUrl à chaque composition)
- Aucun aperçu, carte ni lecteur quand l'auteur n'a pas de compte (liens inertes)
- Intégrer l'aperçu dans la bulle (padding top xs) plutôt qu'en ligne séparée sous la bulle

Rendu : Carte large de la largeur de bulle, coins arrondis, image à gauche ou en tête, titre et domaine en dessous, bouton d'action aligné à droite pour la carte de conversation.

Transposition Android : WebView ou Chrome Custom Tab/IFrame API pour la façade YouTube ; navigation interne pour rejoindre une conversation.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleLinkEmbed.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewFetcher.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkPreviewParser.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/link/LinkOpenPolicy.kt`

### Le défilement charge l'historique en avance et suit le clavier sans à-coup

`cbr-list-scroll-insets` · Android : **partielle** · P1 · effort M

Le délégué de défilement charge l'ancien à 4 hauteurs d'écran d'avance (on ne frappe jamais le bord chargé), détecte le seuil « près du bas » pour afficher le bouton « dernier message » et son compteur de non-lus, déclare une lecture en arrivant au bas, rejoue les reconfigurations différées au repos et masque les actions d'en-tête pendant le geste. Les encarts de la liste (réserve basse du composeur, marge horizontale 12 pt) rejoignent leur nouvelle valeur SUR la courbe de l'appelant (clavier, composeur qui grandit) pour qu'il n'y ait qu'un mouvement.

Écarts :
- Pré-chargement de l'historique à 4 hauteurs d'écran avant le bord (jamais de rebond ni d'insertion visible) ; vérifier le seuil Android actuel
- Seuil de confort « près du bas » bien aligné et resynchronisation du badge de non-lus après un défilement programmatique
- Atteindre le bas déclare la lecture (flush immédiat du suivi, voir cbr-seen-tracking)
- Rejouer les mises à jour différées au VRAI arrêt (fin de fling), pas à la levée du doigt
- Masquer les boutons d'action de l'en-tête pendant le geste (ScrollMotion) et les ramener à l'arrivée
- Encarts animés : la réserve basse suit la courbe du clavier/composeur au lieu de sauter en une frame (insets IME animés), marge de section 12 dp, indicateur de défilement décalé

Rendu : Bouton « dernier message » avec badge compteur et aperçu du plus récent non lu (existe) ; chrome d'en-tête qui s'efface pendant le défilement.

Transposition Android : WindowInsets.ime + animateDpAsState/ imeAnimation ; NestedScrollConnection pour l'état de geste.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScrollDelegate.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Insets.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ScrollAffordance.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/RejoinPillPolicy.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Un message épinglé, transféré ou modifié le dit discrètement

`cbr-meta-badges` · Android : **partielle** · P1 · effort S

Trois badges de bulle : « épinglé » (glyphe + libellé, posé au-dessus de la bulle), « Transféré » (flèche, italique caption2, couleur atténuée, au-dessus de la bulle, nom du groupe ou de la personne selon la règle d'attribution) et « modifié » / « enregistrement… » (désormais dans le pied). Les badges d'épingle et de transfert vivent sur le fond de conversation, pas dans la bulle colorée.

Écarts :
- Ajouter l'indicateur « épinglé » au-dessus de la bulle (pinnedAtIso est connu mais n'est lu que par le libellé d'accessibilité), avec libellé « Message épinglé »
- Sortir le badge « Transféré » de la bulle colorée : le placer au-dessus, sur le fond de conversation, en caption italique textMuted avec glyphe flèche pleine, une ligne
- Trois libellés selon l'attribution : « Transféré de <groupe> », « Fwd. de <personne> », « Transféré » (voir cbr-forward-attribution)
- État « enregistrement… » de l'édition (flèches en rotation, désactivé sous Réduire les animations) à la place du texte « edited »

Rendu : Icônes 11–12 dp, texte caption2 italique, couleur textMuted du thème (pas l'encre de la bulle), padding bas xxs, alignement selon le côté de la bulle.

Transposition Android : Colonne verticale au-dessus du ZStack de la bulle, comme iOS (épingle, transféré, chrome de protection, carte de story).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/PinnedMessages.kt`

### Toucher une citation fait ce que l'œil attend : profil, média ou saut au message

`cbr-quote-zones` · Android : **partielle** · P1 · effort M

LOI DES ZONES : une citation n'offre que trois zones tactiles. 1) l'avatar de l'auteur cité ouvre son profil (jamais sans identifiant de compte) ; 2) la miniature ou l'icône de lecture joue ou affiche le média cité : image et vidéo en plein écran, audio joué SUR PLACE (un toucher joue, le second met en pause), rien pour un média protégé ; 3) tout le reste, nom compris, saute au message cité et le fait clignoter, avec mise en évidence de la pièce citée. Les actions sont nommées pour le lecteur d'écran et une zone non câblée n'est pas posée.

Écarts :
- Zone 1 : toucher l'avatar de la citation ouvre le profil du compte (identifiant de COMPTE exigé, le message cité du store prime sur l'instantané, visiteur sans compte → fiche de participation)
- Zone 2 : toucher la miniature/icône ouvre l'image ou la vidéo citée en plein écran ; audio cité joué sur place par le lecteur partagé (toggle lecture/pause) ; protégé, expiré ou sans adresse → saut à l'original
- Élection de la pièce citée (citedAttachment(among:)) même si le message cité est hors de la fenêtre chargée : reconstruite depuis la citation, jamais pour un secret
- Zone 3 : tout le reste mène au message cité avec flash de cellule (Android n'a qu'un seul tap global onReplyPreviewClick) ; si le message n'est pas chargé, paginer vers l'ancien au lieu de rester inerte (ReplyJump.TargetNotLoaded)
- Actions TalkBack nommées : « Afficher le profil de l'auteur cité », « Écouter le message cité » / « Ouvrir le média cité », « Aller au message cité » ; une action suit l'armement, jamais la seule présence à l'écran
- Emoji seul en réponse : l'emoji est centré sous la citation, la citation garde ses zones
- Ne pas poser de geste sur une zone sans gestionnaire (pas de cible morte)

Rendu : Zone 1 = avatar 22 dp, zone 2 = miniature 38 dp (ou capsule vocale 30 dp, cible 44), zone 3 = reste de la carte ; flash de cellule bref sur le message atteint.

Transposition Android : Trois zones = trois clickable distincts dans la carte ; actions d'accessibilité via semantics { customActions }.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedMediaOpening.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedAuthorProfileTarget.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/QuotedZoneAccessibility.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+QuotedMedia.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+EmojiReply.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### Aller à un message cité atterrit pile dessus et le fait clignoter

`cbr-scroll-to-message` · Android : **partielle** · P1 · effort M

Le saut vers un message (citation, recherche, notification) retrouve l'item par identifiant local ou serveur, défile en animation puis VÉRIFIE l'atterrissage (centre visé, tolérance, passes restantes, re-visée), enfin fait clignoter la cellule (fort ou faible). Si le message n'est pas dans la fenêtre, la liste charge de l'ancien en défilant lentement (~80 pt/s) pour que l'utilisateur voie les messages passer. « Aller au dernier message » remplace toute visée en cours et resynchronise le badge de non-lus.

Écarts :
- Flash de la cellule d'atterrissage (fort/faible) ; Android défile mais n'indique pas le message atteint
- Visée vérifiée : loi ScrollToMessageSettleLaw (offset centré, tolérance, nombre de passes, verdict posé/corriger/abandon) rejouée après chaque animation
- Message hors fenêtre : charger vers l'ancien avec défilement lent continu (~80 dp/s) jusqu'à trouver la cible, au lieu de ReplyJump.TargetNotLoaded inerte
- Résoudre un identifiant serveur vers l'item local de la liste ; ignorer la visée avant le premier instantané
- « Aller au dernier message » annule toute visée vérifiée en cours ; resynchroniser près-du-bas et badge après un défilement programmatique
- Mise en évidence de la pièce citée (voir cbr-piece-actions)

Rendu : Flash : fond d'accent qui apparaît et s'estompe sur environ 1 s ; défilement lent perceptible mais sans flou.

Transposition Android : LazyListState.animateScrollToItem + vérification via layoutInfo ; boucle de scroll lent par scrollBy dans une coroutine.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScrollNavigation.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ScrollSettle.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/InitialScrollTarget.kt`

### En tête de groupe, l'expéditeur montre son avatar, son nom, son rôle et sa présence

`cbr-sender-identity` · Android : **partielle** · P1 · effort M

Pour le dernier message reçu d'un groupe, le pied rend une barre d'identité : avatar du contexte messageBubble avec anneau de story, humeur, point de présence (règle 1/3/5 min, aucun point hors ligne), contour équipé et indicateur « est dans la conversation » ; nom tronqué à 16 caractères, badge de rôle (MemberRole), @pseudo (rien pour un anonyme), méta alignée à droite. Toucher l'avatar ouvre le profil (visiteur sans compte : fiche de participation), l'anneau ouvre la story, la pastille d'humeur et l'appui long ouvrent leurs menus.

Écarts :
- Afficher MeeshyAvatar (déjà doté de la présence et de StoryRingState) dans le pied du dernier message reçu d'un groupe, avec accent de conversation
- Ajouter @pseudo (rien si vide), badge de rôle et troncature du nom à 16 caractères (DisplayName.truncated) ; Android n'affiche qu'un nom en labelMedium
- Humeur de l'auteur (emoji + toucher qui ouvre le détail de l'humeur) et contour de profil équipé (ServedProfileDecorItem)
- Gestes : toucher l'avatar = profil (ou fiche de participation pour un invité), anneau = voir la story, appui long = menu contextuel de l'avatar
- Présence servie uniquement (aucun point si absente) et pastille « est dans la conversation »
- Réserver la barre aux têtes de groupe reçues ; sinon méta seule (heure + coche)

Rendu : Avatar 28–32 dp à gauche du bloc nom/pseudo ; nom footnote semibold une ligne, pseudo caption2 à 0,8 d'opacité ; badge de rôle en pastille ; méta à droite de la première ligne.

Transposition Android : Composable IdentityBar dans le pied ; réutilise meeshyPresenceDotColor et l'anneau de story du MeeshyAvatar.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooterModel.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageGrouping.kt`

### Glisser une bulle répond ou transfère, avec un geste qui ne gêne pas la lecture

`cbr-swipe-actions` · Android : **partielle** · P1 · effort M

Le conteneur de glisser latéral : un côté répond (côté qui « pointe vers » l'expéditeur : droite pour une reçue, gauche pour une envoyée), l'autre transfère ; l'indicateur dans l'espace libéré affiche « jour mois / hh:mm » avant le seuil, le glissé suit le doigt dans une zone de 72 pt puis freine à 15 % (élastique), valide à 66 pt avec un retour haptique. La résistance est relevée pour une bulle audio/vidéo, et le glissé s'efface pendant le scrubbing d'un média ou tant que le carrousel inline est ouvert. Actions TalkBack nommées : Répondre, Transférer, Menu ; la cellule se masque pendant l'overlay d'appui long.

Écarts :
- Ajouter le glisser TRANSFÉRER du côté opposé (SwipeToReply ne gère que la réponse), avec icône d'action et le même seuil / élastique (72 / 0,15 / 66 existent déjà)
- Indicateur « jour mois / hh:mm » dans l'espace libéré avant le franchissement du seuil (préformaté une fois, pas à chaque frame)
- Niveau de résistance .resistant pour audio/vidéo (seuil relevé) et désengagement pendant le scrubbing et le carrousel inline (signaux remontés par les widgets média)
- Géométrie uniforme pour une éventuelle rangée plate (reply = glisser vers la droite)
- Actions d'accessibilité nommées « Répondre », « Transférer », « Menu » ; masquer la cellule (opacité 0, fondu) tant que l'overlay d'appui long la présente
- Mode sélection : swipe et appui long s'effacent

Rendu : Icône d'action dans l'espace libéré avec alpha croissant jusqu'au seuil ; stamp jour/heure en caption avant le seuil ; la bulle glisse avec l'élastique de 15 %.

Transposition Android : detectHorizontalDragGestures déjà utilisé ; ajouter customActions semantics et un CompositionLocal pour la résistance.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
- `apps/ios/Meeshy/Features/Main/Views/BubbleSwipeResistance.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/SwipeToReply.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Messages supprimés, avis système et arrivées se distinguent d'un tour de parole

`cbr-system-notices` · Android : **partielle** · P1 · effort M

Un message supprimé est une capsule « Message supprimé » (glyphe interdit, italique, fond de surface + liseré fin) alignée du côté de l'expéditeur, hors de la bulle colorée. Un avis système (texte localisé par la passerelle) est une capsule CENTRÉE sans avatar ni côté, l'heure gravée en premier. Un avis d'arrivée (« X a rejoint la conversation ») montre l'arrivant (icône personne+, ou masques « sans compte » pour un anonyme), se touche (double toucher en accessibilité) pour « Voir la fiche » et affiche les règles d'entrée (peut écrire des messages / envoyer des fichiers / envoyer des photos, ou non).

Écarts :
- Message supprimé : capsule autonome (icône nosign, texte italique textMuted, fond surfaceFill + liseré hairline), alignée côté expéditeur, au lieu de texte italique dans une bulle colorée
- Avis système : capsule centrée, heure gravée en premier, sans avatar, sans glyphe d'appel parasite ; fallback pour tout système sans métadonnées riches
- Avis d'arrivée (BubbleJoinNoticeView) : arrivant, icône person.badge.plus ou masques pour un anonyme avec mention « sans compte », bouton « Voir la fiche » (haptique moyen) ouvrant la fiche et les conditions d'entrée
- Bande de règles (JoinNoticeRulesStrip) : peut/ne peut pas écrire des messages, envoyer des fichiers, envoyer des photos
- JoinNoticePresentation : nom principal, anonymat, règles ; libellé TalkBack « <nom> a rejoint la conversation » et conseil d'activation
- Le message système porte l'identifiant de l'arrivant : ne pas le regrouper avec sa première vraie bulle (voir cbr-day-separators)

Rendu : Capsules 12–16 dp de padding horizontal, texte subhead/footnote, hairline 1 dp, avis centré avec l'heure au début ; supprimé aligné à gauche/droite.

Transposition Android : Composables de capsule centrée dans la LazyColumn ; texte serveur déjà localisé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`

### « X écrit… » est une vraie bulle en bas du fil

`cbr-typing-bubble` · Android : **partielle** · P1 · effort M

L'indicateur de frappe est une cellule à part entière, dernière du flux inversé (donc bas visuel) : une bulle avec avatars des personnes qui écrivent, points animés, accent de la conversation, version plate selon le mode de lecture et pastille « ici ». Son insertion est immédiate même sous le doigt, la liste la fait apparaître (défilement) la première fois qu'elle surgit si le lecteur est près du bas, et un chemin court de reconfiguration par empreinte du roster évite de reconstruire tout le fil.

Écarts :
- Remplacer TypingIndicator (ligne de texte labelSmall sous la liste) par un item de liste « bulle de frappe » en dernière position du flux : avatars des participants, trois points animés, teinte d'accent
- Auto-défilement pour faire apparaître l'indicateur lors de sa première apparition quand le lecteur est près du bas
- Insertion immédiate de l'item même pendant un geste de défilement ; mise à jour par empreinte du roster sans reconstruire les autres items
- Pastille « est dans la conversation » sur les avatars qui écrivent (voir cbr-presence-here)
- Animation coupée sous Réduire les animations

Rendu : Bulle de réception compacte avec 3 points qui pulsent, avatars 20 dp à gauche, alignée comme une bulle reçue.

Transposition Android : Item de LazyColumn avec contentType dédié ; TypingAvatarCluster de l'en-tête réutilisable.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+TypingCell.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/Typing.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Le fil s'ouvre sur une ligne « N messages non lus » gelée à l'ouverture

`cbr-unread-separator` · Android : **partielle** · P1 · effort S

Au premier affichage d'une conversation avec des non-lus, un séparateur de deux traits et d'un libellé pluriel « N message(s) non lu(s) » (sept langues) se pose sur la frontière élue par FirstUnreadBoundary. La frontière (identifiant du premier non lu + compte) est gelée UNE fois ensemble pour que le libellé ne décrive jamais une autre position. Il utilise la couleur PRIMAIRE de marque (indigo300 en sombre, brandPrimary en clair), jamais l'accent de la conversation.

Écarts :
- Libellé avec le COMPTE et le pluriel correct (« 3 messages non lus ») en sept langues ; Android affiche un « Messages non lus » générique sans nombre
- Couleur de marque (indigo300 sombre / brandPrimary clair, traits à 0,45 / 0,3) au lieu de l'accent de conversation ; texte caption semibold sans capsule de fond
- Geler la frontière (identifiant du premier non lu + compte) une fois à l'ouverture et ne plus la déplacer quand de nouveaux messages arrivent
- Marquer le séparateur comme titre d'accessibilité (heading) avec le libellé complet
- Position : insérer juste au-dessus du premier non lu dans le sens de lecture (en layout inversé, après lui dans l'index)

Rendu : Deux traits horizontaux de 1 dp de part et d'autre du libellé, padding horizontal 16 dp, vertical 8 dp.

Transposition Android : plurals Android pour le pluriel ; UnreadCountLabel équivalent dans core/model.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/FirstUnreadSeparatorRow.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+UnreadSeparator.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/UnreadMarker.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/InitialScrollTarget.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Commentaires et réponses s'indentent par niveau, avec « Voir N réponses de plus »

`cbr-comment-cells` · Android : **partielle** · P2 · effort S

Cellules de fil de commentaires (stories) : commentaire racine (avatar 32, nom, texte, horodatage relatif, cœur, « Répondre »), réponse indentée par profondeur (16 + 40 pt par niveau, nom/contenu/heure), ligne « Voir N réponses de plus » (pluriel explicite, accent indigo, cible ≥ 44 pt, indice « Affiche les réponses restantes de ce fil ») et cellule de post texte (avatar 40, nom, @pseudo, contenu, heure, compteurs J'aime / commentaires / reposts). Libellé VoiceOver composé « Nom, réponse. Contenu. Heure ».

Écarts :
- Indentation par profondeur (16 dp + 40 dp par niveau) : Android ne gère qu'un niveau de réponses
- Ligne « Voir N réponses de plus » avec pluriel explicite en sept langues, couleur indigo400 (sombre) / indigo500 (clair), cible ≥ 48 dp et indice TalkBack
- Libellé TalkBack composé « <nom>, réponse. <contenu>. <heure> » pour chaque réponse, et libellé pour le commentaire racine
- Cellule de post texte (TextPostCell) : à n'implémenter que si l'écran de fil de story l'utilise
- Tailles de police adaptées à l'échelle de texte du système
- Horodatage relatif court partagé (RelativeTimeFormatter.shortString) pour tous les fils de commentaires

Rendu : Avatar 32 dp, nom subheadline semibold, contenu body, heure caption tertiaire ; réponse retraitée de 40 dp par niveau ; lien de chargement en subheadline couleur d'accent.

Transposition Android : LazyColumn items avec padding start variable ; plurals pour le libellé.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentRepliesState.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentThreadState.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentPresentation.kt`, `apps/android/feature/reels/src/main/kotlin/me/meeshy/app/reels/ReelCommentsSheet.kt`

### Les jours se séparent par une pastille, et un nouveau venu n'avale pas la bulle suivante

`cbr-day-separators` · Android : **partielle** · P2 · effort S

Séparateur de jour sous forme de capsule de verre (texte indigo, liseré hairline), libellé relatif « Aujourd'hui / Hier / Avant-hier / jour de semaine / date complète (avec l'année si différente) » recalculé à chaque rendu pour suivre minuit. Un jour collant en tête reste sous l'en-tête mesuré (plancher de 60 pt, grandit avec la taille de texte). Une loi unique de regroupement (tête et queue de groupe) distingue un message système (l'annonce d'arrivée porte l'identifiant de l'arrivant) d'une vraie bulle : l'arrivée ne regroupe pas la première vraie bulle du nouveau venu. La pastille flottante « jour · heure » a été retirée.

Écarts :
- Style de la pastille : capsule en matériau fin (ultraThin) avec liseré hairline, texte indigo200 (sombre) / indigo700 (clair), bordure indigo900 / indigo200, caption semibold ; Android utilise un fond backgroundTertiary à 0,7
- Libellé de jour marqué comme titre d'accessibilité (heading) ; recalcul à chaque rendu pour suivre minuit
- Jour collant décalé sous la hauteur MESURÉE de l'en-tête (plancher 60 dp + gain de taille de police) au lieu d'un padding fixe
- Vérifier la règle de tête/queue de groupe avec message système (l'avis d'arrivée ne regroupe pas la première bulle de l'arrivant) dans MessageGrouping
- Ne pas réintroduire la pastille flottante « jour · heure » (retirée sur iOS)

Rendu : Pastille centrée, 12 dp de padding horizontal, 4 dp vertical, texte caption semibold indigo, marge verticale 6 dp.

Transposition Android : Surface Material avec blur léger (ou couleur tonale opaque) ; ChatListItem.DayHeader et PinnedDayHeader existants.

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayGrouping.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayLabel.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDaySeparator.swift`
- `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayStickyOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+DayHeaderCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+DayOverlays.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListViewController+RowGrouping.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageGrouping.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/PinnedDayHeader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Ajouter, retirer et relire les réactions d'un message se synchronise de bout en bout

`cbr-reactions-service` · Android : **complète** · P0 · effort S

Service de réactions : ajout et retrait par message et emoji (la réponse REST est ignorée, le broadcast socket reaction:added fait foi) et lecture des détails (groupes et utilisateurs). Android couvre déjà ces trois appels et les événements socket.

Rendu : Aucun rendu propre.

Transposition Android : Retrofit ReactionApi + ReactionRepository + écoute socket : équivalent direct.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ReactionService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReactionApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/ReactionRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`

