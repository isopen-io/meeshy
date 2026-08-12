# Parité iPad, orientation, cartes immersives et citation de mood — Design

Date : 2026-08-10
Statut : proposé
Périmètre : `apps/ios/Meeshy`, `packages/MeeshySDK/Sources`, et — pour le seul
défaut 9 — `services/gateway/src/services/messaging`

## Problème

L'app déclare `TARGETED_DEVICE_FAMILY = "1,2"` et possède une racine iPad deux
colonnes (`iPadRootView`) fonctionnelle, mais l'expérience iPad n'a jamais été
tenue. Un passage sur simulateur iPad Pro 11" (build Debug, session du
2026-08-10) donne l'inventaire suivant, chaque ligne rattachée à sa cause dans
le code — aucune n'est une conjecture.

| # | Symptôme observé | Cause |
|---|---|---|
| 1 | L'iPad ne pivote jamais : le paysage est inatteignable | `OrientationManager.orientationLock` vaut `.portrait` et `AppDelegate.application(_:supportedInterfaceOrientationsFor:)` le renvoie pour **toute** fenêtre. `unlock()` et `lockPortrait()` ne sont appelés **nulle part** — code mort hérité du lecteur vidéo plein écran supprimé en Phase 5. L'`Info.plist` déclare pourtant les 4 orientations sur iPad. |
| 2 | Appui long sur un message : l'aperçu de bulle sort de l'écran à droite, texte tronqué | `messageBubbleFrame` est capturée en repère `.global` (`MessageFrameTracker`) puis consommée dans le `GeometryReader` de `MessageOverlayMenu`, hôte **local à la colonne droite**. `nlMenuX` et `nlEmojiX` sont bornés par `geometry.size.width` (largeur de colonne, pas de fenêtre) ; l'aperçu de bulle, lui, n'est pas borné du tout. |
| 3 | Voile modal à demi-écran : la colonne gauche reste claire et cliquable pendant qu'un menu est ouvert | `dismissBackground` vit dans l'hôte de colonne. Même défaut pour le menu d'appui long de ligne de conversation. |
| 4 | En-tête de la colonne gauche : « Meeshy Chats » tronqué **sous** les boutons dès qu'une conversation est ouverte | `CollapsibleHeader` ne contraint pas la largeur du `titleView` par celles du `leading` et du `trailing`. Le `minimumScaleFactor(0.55)` déjà posé (et commenté comme correctif) ne s'engage donc jamais. |
| 5 | Onboarding et login étirés sur 834 pt, CTA pleine largeur, vides verticaux énormes | Aucune borne de largeur en classe `regular`. |
| 6 | Aucun survol pointeur, aucun raccourci clavier | `onHover` : 0 occurrence, `hoverEffect` : 0, `pointerStyle` : 0. `keyboardShortcut` n'existe que dans la barre de transport de la timeline story. |
| 7 | Carte de feed : un clip vertical s'affiche en petit, letterboxé au centre d'une carte large | `mediaPreview` impose `.frame(height: 220)` par-dessus `FeedVideoMediaCell`, dont la hauteur propre vaut `largeur / ratio` (≈ 1,6 × largeur pour un portrait). Le cadre extérieur écrase le calcul de la cellule. |
| 8 | Citation d'une réponse à un mood : le contenu est écrasé et coupé à 2 lignes | `BubbleMoodReplyPreview` empile emoji + date relative + puce + contenu dans **un seul `HStack`**. La date consomme la largeur du contenu. |
| 9 | Citation d'un mood : l'auteur disparaît après rechargement, le titre retombe sur le libellé générique « Humeur » | `APIMessage.uiReplyTo` construit la référence mood avec `authorName: ""` (`MessageModels.swift:743`). En amont, le snapshot gateway `PostReplyTo` (`postReplySnapshot.ts`) **ne porte aucun champ auteur**. Le nom n'existe que dans la référence optimiste locale (`entry.username`) et se perd au premier écho serveur. |

Ce qui fonctionne déjà sur iPad et ne doit pas régresser : menu contextuel de
ligne de conversation, menu d'avatar de story, menu d'avatar d'en-tête de
conversation, dépôt de fichier dans le composer, poignée de redimensionnement
des colonnes.

## Décisions produit

Actées avec le porteur du produit le 2026-08-10 :

1. **Ambition** : parité fonctionnelle et accessibilité, architecture deux
   colonnes conservée. Pas de `NavigationSplitView`, pas de refonte de la
   navigation.
2. **Orientation** : déverrouillage **partout**, iPhone compris.
3. **Surfaces 9:16** : verrou portrait **ciblé** sur viewer de story, lecteur de
   réels, composer de story et caméra. `lockPortrait()` / `unlock()` reprennent
   du service au lieu d'être supprimés.
4. **Géométrie modale** : hôte d'overlay au niveau **fenêtre**.
5. **Cartes de feed** : deux modèles distincts, et non un seul. La carte de
   **réel** est immersive — média en fond, chrome en surimpression ; elle est
   déjà conforme. La carte de **post** garde l'ordre texte puis média, sans
   surimpression ; seul son cadrage de média est à corriger. Cette décision
   révise en cours de spec un premier arbitrage « tout immersif » (cf. lot 4).

## Conception

### Lot 0 — Hôte d'overlay au niveau fenêtre

Corrige les défauts 2 et 3, et ferme la classe de bugs pour toute surface
modale future.

Le repo a déjà résolu ce problème une fois. `iPadRootView` porte ce commentaire,
daté du 2026-07-30 :

> Hôte UNIQUE de la bulle de mood pour toute la fenêtre iPad : couvre les DEUX
> colonnes dans un seul repère. Les colonnes sont des vues SŒURS — un hôte par
> colonne rendait DEUX bulles, chacune convertissant l'ancre globale dans son
> propre repère.

C'est le même défaut, sur une autre surface. On applique le même motif.

**`MessageOverlayController`** — `@MainActor final class`, singleton `shared`,
sur le modèle exact de `StatusBubbleController` :

```
@Published var request: MessageOverlayRequest?
func present(_ request: MessageOverlayRequest)
func dismiss()
```

**`MessageOverlayRequest`** porte l'identité et les actions, pas un instantané
de données :

- `messageId: String`, `sourceFrame: CGRect` (repère `.global`)
- `viewModel: ConversationViewModel` — référence, pas copie
- le jeu de fermetures déjà passées à `MessageOverlayMenu` (`onCopy`, `onEdit`,
  `onPin`, `onToggleStar`, `onReact`, `onDelete`, `onShowMore`…)

L'hôte observe `viewModel`, donc étoile, traductions, transcription et audios
traduits restent **vivants** malgré le déport. C'est le point qui interdit de
stocker un `AnyView` figé dans le contrôleur : la vue capturerait l'état du
`body` de `ConversationView` au moment du `present`, et cesserait de suivre.

**`.withMessageOverlay()`** se monte une seule fois, à la racine de `RootView`
et de `iPadRootView`, au même endroit que `.withStatusBubble()`.

`AnyView` reste posé **à l'hôte**. C'est le garde-fou documenté dans
`ConversationView.overlayMenuContent` contre le débordement de pile du décodeur
de métadonnées Swift (`swift_getTypeByMangledName`) au premier rendu sur device.
Le déplacer sans le conserver rouvrirait ce crash.

**`MessageOverlayLayout`** — le calcul de position (lignes 196–253 de
`MessageOverlayMenu`) sort dans une fonction **pure** :

```
struct MessageOverlayLayout {
    static func resolve(
        sourceFrame: CGRect,
        container: CGSize,
        safeArea: EdgeInsets,
        isMe: Bool,
        actionCount: Int
    ) -> Resolved   // emojiCenter, bubbleCenter, bubbleScale, menuCenter
}
```

C'est elle qui porte l'invariant testable : **aucun des trois éléments ne sort
du conteneur**, quel que soit le `sourceFrame`. L'aperçu de bulle est borné au
même titre que le menu et la barre d'emojis — l'absence de borne sur ce seul
élément est la cause directe du symptôme 2.

Le menu d'appui long de ligne de conversation passe par le même hôte : son
voile couvre alors la fenêtre entière.

Sur iPhone, fenêtre et colonne coïncident : le résultat du calcul est identique
à l'actuel. Aucun changement de comportement attendu, et c'est une assertion à
tester, pas une espérance.

### Lot 1 — Orientation

`OrientationManager.orientationLock` démarre à `.all` sur iPad et
`.allButUpsideDown` sur iPhone.

Le verrou devient **compté**, pas booléen :

```
private var portraitLockCount = 0
func lockPortrait()   // count += 1, applique .portrait au premier
func releasePortrait() // count -= 1, restaure le masque libre à zéro
```

Un composer de story présenté au-dessus d'un viewer ne doit pas déverrouiller
la fenêtre en se fermant pendant que le viewer est encore là. Un booléen produit
exactement ce bug, et il se diagnostique mal après coup.

Un modifieur `.portraitLocked()` (verrou à `onAppear`, libération à
`onDisappear`) est posé sur : `StoryViewerView`, `ReelsPlayerView`, le composer
de story et les surfaces de capture caméra.

Passe paysage sur les parcours principaux : conversation, feed, liste, login,
onboarding, réglages.

**Conséquence à traiter dans ce lot.** En paysage, un iPhone Pro Max passe en
classe horizontale `regular` : `AdaptiveRootView` basculerait sur `iPadRootView`
— deux colonnes sur un téléphone. La bascule est donc conditionnée à l'idiome
**et** à la classe de taille (`DeviceLayout.isPad && sizeClass == .regular`),
pour que le paysage iPhone reste la racine téléphone. `DeviceLayout.isPad`
existe déjà.

Ce prédicat « iPad en `regular` » devient le critère unique de toutes les
adaptations tablette de cette spec, lots 2 à 4 compris. La classe de taille
seule ne suffit pas : elle attraperait l'iPhone en paysage.

### Lot 2 — Surfaces en classe `regular`

`CollapsibleHeader` : le `titleView` est contraint par les largeurs mesurées du
`leading` et du `trailing`, de sorte que `minimumScaleFactor` s'engage au lieu
que le titre glisse sous les boutons. La correction vit dans le composant, pas
dans `ConversationListHeader` : tout écran à en-tête repliable a le défaut.

Login et onboarding : contenu borné (~460 pt) et centré en classe `regular`,
CTA borné à la même largeur. Audit des autres formulaires pleine largeur.

### Lot 3 — Affordances iPad

- **Survol** : `hoverEffect` sur lignes de conversation, avatars, boutons de
  chrome et actions de carte.
- **Clavier** : bloc `.commands` au niveau `Scene` — ⌘N nouvelle conversation,
  ⌘F recherche, ⌘, réglages, ⌘⇧A feed — plus `.keyboardShortcut` locaux : ⌘↩
  envoyer, ⎋ fermer l'overlay actif.
- **Focus** : `@FocusState` sur le composer, parcours au Tab cohérent.
- **Glisser-déposer** : dépôt externe vers le composer (le socle
  `UniversalComposerBar+Drop` existe — à vérifier sur iPad, pas à réécrire), et
  glissement d'une pièce jointe d'une bulle vers une autre app.

### Lot 4 — Cartes de feed : deux modèles distincts

**Révision du 2026-08-10, en cours de spec.** La première rédaction rendait
*toute* carte de feed portant un média entièrement immersive sur iPad. La
directive produit qui a suivi sépare les deux familles, et c'est cette
séparation qui fait foi :

> Pour les Réels, le contenu en fond. Pour plusieurs images et vidéos, le
> premier contenu — ou la vidéo parmi eux — est mis en fond. Les cartes de post :
> le texte est affiché, puis le média.

#### Carte de réel — immersive

**Déjà conforme, rien à construire.** `ReelFeedCard` rend le média en fond
aspect-fill sur toute la carte, l'auteur, le texte et les boutons en surimpression
sur un voile bas, le logo réel en haut à droite. `reelCardHeight`
(`ReelFeedLayout.swift`) borne la hauteur entre 0,75 × et 1,25 × la largeur.

Le choix du média de fond est déjà porté par `FeedPost.primaryReelDisplayMedia`
(`FeedModels.swift:750`) : **vidéo d'abord, sinon audio, sinon image**.

Un seul écart avec la directive, à trancher à l'implémentation : la règle
énoncée est « la vidéo parmi eux, sinon le **premier** contenu », alors que le
code retombe sur *le premier audio* avant *la première image*. Un post
`[image, audio]` met donc l'audio en fond là où la directive mettrait l'image.
Le travail se réduit à aligner ce dernier maillon et à le couvrir par un test —
pas à réécrire la sélection.

#### Carte de post — texte puis média

**L'ordre demandé est déjà celui du code** : `FeedPostCard.body` pose
`authorHeader`, puis le texte, puis `mediaPreview`. Aucune inversion à faire, et
**aucune surimpression** : le post n'est pas immersif.

Ce qui est cassé, et le seul objet de ce lot, c'est le **cadrage du média**
(défaut 7). `mediaPreview` impose `.frame(height: 220)` par-dessus
`FeedVideoMediaCell`, dont la hauteur propre vaut `largeur / ratio`. Les deux se
contredisent, le lecteur se replie au centre, et un clip vertical s'affiche en
timbre-poste letterboxé — la capture qui a motivé la demande.

Correctif : le média occupe toute la largeur de la carte, hauteur dérivée du
ratio source et bornée entre 0,75 × et 1,4 × cette largeur. La borne haute
empêche un clip vertical d'avaler la colonne ; la borne basse empêche un
panorama de dégénérer en filet. Le `.frame(height: 220)` extérieur disparaît :
c'est lui la cause.

Par type, sur la carte de post :

- *Vidéo* et *image* : aspect-fill sur toute la largeur, plus de bandes noires.
- *Audio* : conserve son rendu compact actuel (`mediaIsCompact` renvoie déjà
  `true`), il n'a pas de surface visuelle à remplir dans une carte non immersive.
- *Multi-média* : la mosaïque existante (2, 3, 4+) est conservée.

**Contrainte de performance.** `FeedPostCard` et `ReelFeedCard` sont des cellules
de liste. La règle « Zero Unnecessary Re-render » s'applique : entrées
primitives, `Equatable` conservé, aucun `@ObservedObject` sur singleton ajouté.

**Ce que cette révision annule** : la structure `ZStack` chrome-sur-média pour
les cartes de post, le voile dégradé et son critère de contraste WCAG associé, et
la tuile audio remplie par un dégradé. Ces trois éléments ne concernaient que le
modèle immersif appliqué aux posts, qui n'a plus lieu d'être — le modèle
immersif existe déjà, il s'appelle la carte de réel.

### Lot 5 — Citation de réponse à un mood

Non spécifique à l'iPad : le défaut se voit sur tous les idiomes.

Aujourd'hui `BubbleMoodReplyPreview` rend un unique `HStack` :
emoji · date relative · puce · contenu limité à 2 lignes. La date occupe la
largeur qui manque ensuite au contenu, qui se coupe.

Cible :

- La **date remonte sur la ligne du titre**, en fin de ligne, à côté de
  « Humeur » — c'est la position demandée et celle qui libère la largeur.
- `BubbleMoodReplyPreview` ne rend plus que l'emoji et le contenu, sur toute la
  largeur disponible, avec une limite de lignes relevée à 3.
- Le `.fixedSize(horizontal: false, vertical: true)` de `BubbleQuotedReply` est
  conservé : il empêche la barre d'accent, infiniment flexible en hauteur,
  d'absorber l'excédent proposé par un hôte média. La hauteur idéale devient
  simplement « titre + 3 lignes ».

Le slot de date est ajouté à la ligne de titre de `BubbleQuotedReply` et n'est
peuplé que dans le cas mood ; les citations de message et de story sont
inchangées.

**Auteur du mood perdu à l'écho serveur (défaut 9).** Traité dans le même lot,
parce qu'il touche la même ligne de titre : sans nom d'auteur, la date remontée
sur cette ligne l'accompagnerait d'un libellé générique « Humeur » au lieu de
« Belva Tano ». C'est visible sur la capture d'origine, dont le titre est
littéralement « Mood ».

Le champ manque de bout en bout, la correction traverse donc les deux côtés :

- **Gateway** — `PostReplySnapshotablePost` et `PostReplyTo` gagnent l'auteur
  (identifiant, nom d'affichage, nom d'utilisateur) ; `POST_REPLY_SNAPSHOT_SELECT`
  charge la relation. Les snapshots déjà persistés n'ont pas le champ :
  `normalizePostReplyTo` doit le rendre optionnel et ne pas invalider une
  citation ancienne.
- **iOS** — `APIMessage.uiReplyTo` peuple `authorName` depuis le snapshot au
  lieu de la chaîne vide. Le repli existant de `quotedTitle` vers « Humeur »
  reste en place : il redevient ce qu'il aurait dû être, un filet pour les
  citations d'avant la correction, et non le cas nominal.

Sans le volet gateway, le volet iOS n'a rien à afficher — l'ordre entre les deux
n'est pas libre.

## Tests

TDD par lot, selon les règles du repo (test rouge d'abord, comportement et non
implémentation, fonctions fabriques, pas de mutation partagée).

**Logique pure — le gros du filet.**

- `MessageOverlayLayout.resolve` : conteneur deux colonnes iPad, bulle
  `isMe` collée au bord droit → les trois éléments restent dans les bornes.
  Conteneur iPhone → résultat identique à l'actuel (test de non-régression).
  Bulle très haute → facteur d'échelle plancher respecté.
- `OrientationManager` : verrous imbriqués — deux `lockPortrait` puis un
  `releasePortrait` laissent le verrou actif ; le second le lève. Un
  `releasePortrait` en trop ne descend pas sous zéro.
- Hauteur du média d'une carte de post : fonction pure de (ratio source, largeur
  carte) → bornes 0,75×/1,4× respectées pour portrait, paysage et carré. Le test
  du portrait est celui qui échoue aujourd'hui.
- Sélection du média de fond d'un réel : `[vidéo, image]` → la vidéo ;
  `[image, image]` → la première ; `[image, audio]` → l'image (c'est le cas qui
  diverge du code actuel).

**Gardes de source** — ancrées sur le comportement, pas sur une fenêtre de
caractères (cf. dette connue des gardes à fenêtre fixe) :

- `AppDelegate` ne renvoie plus de masque constant.
- `.withMessageOverlay()` monté exactement une fois par racine.
- `mediaPreview` ne pose plus de hauteur fixe sur le chemin immersif.

**Snapshots** — enregistrés sur le runtime **18.2**, baseline du repo :
en-tête de liste en `regular` conversation ouverte, login et onboarding en
`regular`, carte de post avec vidéo verticale (le cas letterboxé) et avec image
paysage, carte de réel, citation de mood à contenu long.

**Vérification réelle** sur simulateur iPad en **18.2 et en 26.1**, portrait et
paysage. Le chemin des menus contextuels diffère entre les deux — overlay custom
sous iOS 26, `.contextMenu` natif au-delà — et une vérification sur un seul
runtime ne conclut pas.

Note d'outillage : `idb ui tap --duration` n'est **pas** un appui long (il
envoie un tap et dort après le relâchement). Les appuis longs se rejouent par le
flux HID du client python fb-idb. Un échec d'appui long via l'option `--duration`
ne prouve rien sur le code.

## Risques

**Déverrouiller l'orientation partout expose toutes les surfaces d'un coup.**
C'est le risque principal et il a été accepté explicitement. Les verrous ciblés
du lot 1 et la passe paysage sur les parcours listés en sont la contrepartie.
Le lot 1 doit être vérifié écran par écran, pas seulement « ça tourne ».

**Le déport de l'overlay touche le chemin le plus chaud de l'app.** D'où la
fonction de calcul pure, les gardes de source et le maintien de `AnyView` à
l'hôte pour ne pas rouvrir le crash de décodage de métadonnées sur device.

**Le lot 4 a déjà changé de forme une fois.** Il est passé de « toute carte de
feed devient immersive » à « la carte de réel l'est déjà, la carte de post ne le
devient pas ». Toute nouvelle directive sur les cartes doit être rapportée à
cette séparation avant d'être traduite en travail, sous peine de réintroduire la
surimpression sur les posts.

**Hygiène de dépôt** : `apps/ios/project.yml` est la source de vérité, tout
nouveau `.swift` sous `Meeshy/` est auto-inclus par `xcodegen generate`. Ne
jamais éditer `project.pbxproj` à la main, ne jamais committer le churn d'une
régénération locale — le dépôt a des sessions concurrentes et un pbxproj
régénéré publie le travail en cours d'autrui.

## Hors périmètre

Décidé, pas oublié :

- `NavigationSplitView`, sidebar à trois colonnes, refonte de la navigation.
- Multi-fenêtre et Stage Manager comme fonctionnalité à part entière
  (`UIApplicationSupportsMultipleScenes` est déjà à `true` ; le paysage rendra
  Split View utilisable, sans travail dédié à la gestion de scènes).
- Apple Pencil, barre de menus macOS.
- Rendre la carte de post immersive, sur iPhone comme sur iPad — explicitement
  écarté par la directive du 2026-08-10.

## Séquencement

Le lot 0 précède tout : il change l'endroit où vivent les overlays, et les
autres lots toucheraient sinon du code destiné à bouger. Les lots 1 à 5 sont
indépendants entre eux et parallélisables — s'ils sont confiés à des agents
concurrents, chacun dans son worktree, avec `project.pbxproj` géré par le
dernier à fusionner.
