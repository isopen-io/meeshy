# La bannière se tire et devient la conversation ; l'aperçu d'appui long est un morphisme à ressort — design

Directive porteur du 2026-11-15 (soir) : « dans la notification in-app de message en conversation, on doit pouvoir TIRER la notification et avoir un effet de morphisme et d'élasticité ANNULABLE qui transforme la notification en conversation à ouvrir ! La conversation reste NON LUE sauf si l'utilisateur envoie un message, une réaction ou une pièce jointe. De la même manière, l'appui long sur une conversation affiche l'aperçu avec un effet morphique de la ligne de conversation, puis le menu apparaît ; quand on réduit ou agrandit le menu, on doit ressentir un ressort sur l'aperçu ; enfin le détachement de l'aperçu en élément déplaçable vers une catégorie suit un morphisme à ressort : on tire fort vers le bas avant que ça décroche et devienne une ligne à déplacer. »

iOS d'abord (référence des deux autres clients) ; jumelles web et Android ouvertes.

## 0. Ce qui existe, mesuré (origin/dev, 2026-11-15)

- **Bannière in-app** : `NotificationToastView` (SDK, `MeeshyUI/Notifications/`), montée par `RootNotificationToastOverlay` (`RootLayers/RootSharedLayers.swift`). Loi pure `NotificationBannerSwipe.outcome(translation:predictedEnd:)` : vers le haut ⇒ `dismiss`, vers le bas > 36 pt ⇒ `preview` (une FEUILLE d'aperçu, #8723), tap ⇒ ouverture après consommation. L'offset ne suit le doigt que vers le haut (`min(0, dragLift)`). Ouvrir la conversation la marque lue (`ConversationViewModel+Lifecycle` : `ExplicitUnreadMarks.clear`, `ConversationReadSignal.markReadLocally`, `markAsRead`).
- **Appui long sur une conversation** (`ConversationListView+Overlays.swift`, #17242) : un aperçu personnalisé (carte) + menu (`ConversationContextMenuView`), voile (#17316 en cours), entrée par `ConversationPreviewEntranceMotion` (échelle depuis `previewScale`, `previewEmergeOffset`), un **morph drag** existe déjà : tirer la carte vers le bas la réduit en « chip » déplaçable (`dragMorphProgress`, `ConversationPeekPullDown.progress/dismissDistance`, `chipModeLatched`), déposable sur un en-tête de section (`+DragDrop`, `+SectionHeader`). Le menu a deux crans (#17279 pour les messages ; pour la conversation, `ConversationContextMenuView` panneaux racine / favori / déplacer / plus).

Ce que la directive change : la bannière ne va plus vers une feuille d'aperçu, elle DEVIENT la conversation ; l'aperçu naît de la LIGNE (morphisme) et non d'une échelle depuis le centre ; le menu et l'aperçu sont liés par un ressort ; le décrochage en chip demande une traction franche et se sent.

## 1. Lot A — la bannière se tire et devient la conversation (#A)

- **Geste** : tirer la bannière vers le bas. La carte suit le doigt (offset y ≥ 0 désormais possible), **s'élargit et s'étire** à mesure (loi pure `NotificationBannerPull.progress(translation:) ∈ [0, 1]`, avec résistance élastique au-delà du seuil : `elasticOffset(translation:)` du type `d · k / (k + d)`), et **se transforme** : la carte grandit vers le cadre de la conversation (largeur plein écran, coins qui s'ouvrent, l'avatar et le titre glissent vers la position de l'en-tête de conversation) — `matchedGeometryEffect` entre la bannière et l'en-tête de `ConversationView`, ou, si l'en-tête n'est pas montable à l'avance, une **enveloppe de transition** (`BannerToConversationMorph`) qui peint la carte à sa taille interpolée puis laisse place à la conversation.
- **Annulable** : relâcher avant `NotificationBannerPull.commitDistance` (≈ 96 pt) ou avec une vitesse de retour ⇒ la carte revient à sa place (ressort `MeeshyAnima`/`MeeshyMotion`, variante réduite = fondu). Au-delà, ou lancée vers le bas ⇒ la conversation s'ouvre, la bannière se fond dans son en-tête. Le balayage vers le HAUT ferme toujours (loi existante). Le tap garde son comportement (ouverture consommée ⇒ lue).
- **Non lue** : une conversation ouverte PAR TRACTION s'ouvre en mode **regard** (`ConversationOpening.peek`) : `ConversationViewModel` ne pose ni `ExplicitUnreadMarks.clear`, ni `ConversationReadSignal.markReadLocally`, ni `markAsRead` à l'ouverture ni au défilement ; la pastille reste ; le premier **acte** de l'utilisateur — envoi d'un message, d'une réaction, d'une pièce jointe (vocal compris) — bascule en lecture normale (`peek → read`) et marque lue à ce moment. Loi pure `PeekReadLaw.marksRead(on: action)` (envoi/réaction/pièce jointe ⇒ oui ; défilement, lecture d'un vocal, ouverture d'un média ⇒ non). Si l'utilisateur quitte sans agir, la conversation reste non lue, y compris côté serveur (aucun `markRead`). Rétrocompatible : aucun changement de protocole.
- **Reduce motion** : pas d'étirement, un fondu croisé bannière → conversation ; la loi du geste est la même.
- **Témoins** : `NotificationBannerPullTests` (progress, élasticité monotone et bornée, commit/annulation, direction haut inchangée), `PeekReadLawTests`, `ConversationViewModelPeekTests` (ouverte en regard : aucun marquage ; après `sendMessage`/`toggleReaction`/pièce jointe : marquage), garde de montage (la bannière passe `.peek` à la présentation).

## 2. Lot B — l'aperçu naît de la ligne (#B)

- L'appui long capture le **cadre de la rangée** (comme `overlaySourceFrame` le fait pour un message, #11208) ; l'aperçu **part de ce cadre** : même position, même hauteur, coins de la rangée, puis s'étend (largeur de l'aperçu, hauteur de la carte) par un ressort (`MeeshyMotion.previewEmerge` ou jeton existant) — loi pure `ConversationPreviewMorph.frame(progress:from:to:)` (interpolation du cadre et du rayon). Pendant la première moitié, la carte montre le CONTENU DE LA RANGÉE (avatar, titre, aperçu du dernier message) ; dans la seconde, l'aperçu complet (derniers messages) se fond dedans.
- **Le menu vient ensuite** : il n'apparaît qu'à la fin du morphisme (ou à 80 % de progression), depuis le bas de la carte, en ressort court. Un appui long qui a ouvert l'aperçu n'ouvre jamais la conversation (#17316 reste vrai).
- La rangée source se **vide** (opacité 0 ou `.hidden`) le temps de l'aperçu, pour que l'œil ne voie qu'une seule ligne qui se transforme ; elle revient au retrait (morphisme inverse jusqu'au cadre de la rangée).
- Reduce motion : fondu, sans déplacement.
- Témoins : `ConversationPreviewMorphTests` (progress 0 ⇒ cadre de la rangée, 1 ⇒ cadre de l'aperçu, monotone, rayon interpolé), garde de montage (la rangée pressée passe son cadre ; le menu attend le seuil).

## 3. Lot C — le ressort entre le menu et l'aperçu (#C)

- Quand le menu **s'étend** (cran compact → cran large, ou ouverture d'un sous-panneau Déplacer/Plus) la carte d'aperçu **recule** d'un ressort (échelle 1 → 0,96 et remontée de quelques points), et quand il **se réduit** elle **revient** avec un dépassement visible (ressort `MeeshyAnima.elasticFrank` ou le jeton « chaîne élastique franche » déjà posé pour le menu flottant, 0,24 + 0,065 s par rang, amorti 0,62 — retour porteur du 2026-11-14). Loi pure `PreviewMenuSpring.scale(forMenuHeight:)` et `.offset(forMenuHeight:)` : dérivées de la hauteur du menu, jamais d'un drapeau.
- Reduce motion : aucun ressort, une opacité.
- Témoins : `PreviewMenuSpringTests` (hauteur plus grande ⇒ échelle plus petite, bornée ; monotone), garde que la carte lit la hauteur du menu (préférence) et non un état parallèle.

## 4. Lot D — le décrochage en chip demande une traction franche (#D)

- Le morph drag existant devient un **ressort à cran** : en tirant vers le bas, la carte suit avec **résistance croissante** (`ConversationPeekPullDown.elasticTranslation(_:)`), se **comprime** vers la forme de LIGNE de conversation (hauteur de rangée, largeur de rangée, avatar à gauche, titre), puis, au-delà de `detachDistance` (≈ 140 pt) **ou** d'une vitesse franche, **décroche** : haptique `.rigid`, la ligne « saute » légèrement (ressort de libération) et devient la chip déplaçable (comportement actuel `chipModeLatched`). Avant le décrochage, relâcher ramène la carte en aperçu avec un ressort (annulable).
- Loi pure `ConversationPeekPullDown.stage(translation:velocity:)` ∈ `.holding(progress)` / `.detached` ; `progress` pilote l'interpolation carte → ligne (`ConversationPreviewMorph` réutilisé à l'envers, jusqu'au cadre d'une rangée).
- Reduce motion : la compression se fait sans ressort ; le décrochage reste au même seuil.
- Témoins : `ConversationPeekPullDownStageTests` (sous le seuil ⇒ holding, progress monotone et borné ; au-delà ou vitesse franche ⇒ detached ; hystérésis : une fois détachée, remonter ne rattache pas), garde que l'haptique de décrochage n'est jouée qu'une fois.

## 5. Transversal

- Jetons de mouvement : aucun ressort littéral ; `MeeshyMotion` / `MeeshyAnima` (ajouter les jetons manquants au SDK, nommés : `bannerPull`, `previewMorph`, `menuSpring`, `peekDetach`), chacun avec sa variante réduite.
- Performance : 120 fps sur iPhone ; tout dérive d'une valeur de geste (pas de `withAnimation` empilés) ; aucune recomposition de la liste pendant le geste (la rangée source se cache par opacité).
- Accessibilité : VoiceOver garde les actions nommées (ouvrir, fermer, déplacer), les gestes ont leur équivalent (bouton « Ouvrir » sur la bannière, actions du menu).
- Sécurité : conversation verrouillée par PIN ou chiffrée : la bannière n'ouvre que ce que le tap ouvre déjà (#12642), le mode regard ne contourne aucune garde.

## 6. Preuve

Par lot : tests rouges puis verts, gardes CI texte, build + suites ciblées ; recette au simulateur par la télécommande avec vidéos (`simctl io recordVideo`) et planches ffmpeg à 20 i/s pour juger les ressorts ; recette finale sur l'iPhone du porteur. Les issues se ferment à la CI de dev verte.

## 7. Choix faits sans le porteur

1. La traction de la bannière ouvre la conversation (plus de feuille d'aperçu intermédiaire) ; la feuille d'aperçu de #8723 disparaît du geste de traction, le tap et le balayage vers le haut ne changent pas.
2. « Acte » qui marque lue : envoi de message, réaction, pièce jointe ; pas la lecture d'un vocal ni l'ouverture d'un média.
3. Seuils initiaux : traction de bannière 96 pt, décrochage de l'aperçu 140 pt ou vitesse > 900 pt/s ; à ajuster à la recette sur iPhone.
