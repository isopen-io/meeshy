# Compositeur iOS : la scène d'abord, les contrôles posés dessus, et rien n'est aplati avant la publication

Date : 2026-10-30 · Issues : #13839 (disposition) et #13840 (édition non destructive) · Jumelles Android : #13834–#13838, #13841.
Références, qui font foi dans cet ordre :
1. La maquette validée par le porteur le 2026-10-30, `docs/product/composer-scene-d-abord/maquette.html`. Elle fait foi pour la DISPOSITION, la HIÉRARCHIE, les ÉTATS et les GESTES. Les polices, couleurs, rayons et glyphes viennent du design system iOS (`MeeshyColors`, `MeeshyFont`, SF Symbols, `ComposerPlateau`).
2. La spec partagée, `docs/superpowers/specs/2026-10-30-composer-scene-d-abord-design.md` (écrite pour Android, copiée ici à l'identique). Elle porte les états, le vocabulaire et l'addendum « rien n'est aplati ». **Ce document ne la répète pas : il dit seulement ce qui change sur iOS.**
3. L'inventaire exhaustif, `docs/product/composer-scene-d-abord/inventaire-options.md`. Chaque option iOS y a sa ligne, sa nouvelle place, son état Android et son lot. **Aucune option ne disparaît sans qu'une ligne nomme la jumelle qui la remplace.**

## 1. Décision de géographie (citée)

La directive du porteur du 2026-10-30 dit : « simplifier, afficher UNIQUEMENT ce qu'il faut à un instant T, préférer l'overlay au-dessus de la scène, réduire la scène quand le clavier ou une feuille s'affiche » ; « les détails nombre de caractères, nombre max… sont inutiles : on l'indique quand on atteint la limite » ; le type se choisit par le chevron de Publier ; sur grand écran, des rails d'icônes LIBELLÉS.

Elle remplace la géographie « aucun contrôle ne se pose sur le canvas, les rails vivent dans les couloirs du plateau » de #4561 et #4633. Cette géographie est écrite dans `apps/ios/CLAUDE.md` § « Le composer met ses portes SUR LE PLATEAU » (§ 1 à 2 quater, déjà en partie supersédé par #8281) et dans le `CLAUDE.md` racine, § MeeshyComposer, à la phrase « *Exception en vigueur* — la géographie des rails ». **Le lot L1 réécrit ces deux textes** : il cite la directive du 2026-10-30 et #13839, et garde l'ancien texte sous un bandeau CLOS, comme le dépôt le fait pour les directives remplacées. Les doc-comments qui disent « rien ne se pose sur la scène » (`ComposerRailGeometry`, `ComposerLeadingRail`, `ComposerTrailingRail`, `ComposerFloatingSocle`, `ComposerSceneColumns`) sont réécrits dans le lot qui change le comportement qu'ils décrivent.

Les gardes qui protègent l'ancienne loi (`ComposerRailGeographyByFormatTests`, `ComposerSceneFloatingRailTests`, `ComposerRailPlateauOrderTests`, `ComposerRailMountGeometryTests`, `ComposerPlateauTests`) ne sont jamais supprimées seules. Chacune est remplacée par le témoin de la loi nouvelle dans le même commit.

La crainte de #4561, « un contrôle sur la scène fait mentir l'aperçu », se traite comme sur Android. Les surimpressions sont du chrome de l'éditeur : elles n'entrent ni dans `ComposerSceneExportController`, ni dans la capture du player, ni dans la vignette. Un toucher sur une surimpression n'atteint jamais le canvas. Un toucher hors surimpression garde les gestes de la scène.

## 2. Adaptations iOS des états de la spec partagée

### 2.1 Repos (état 1, L1)
- **Scène** : le plus grand 9:16 qui tient dans la zone sûre (`safeAreaInsets` lus par une préférence de géométrie, jamais depuis l'intérieur de la fenêtre clé : mémoire « mesurer la fenêtre clé fige SwiftUI »). Il n'y a ni carte ni couloir. La scène reste un seul `StoryComposerCanvasView` ; sa taille change par `scaleEffect` + `offset` dans **une seule transaction** (`withAnimation(.spring(response: 0.32, dampingFraction: 0.88))`), sans relayout du canvas.
- **Surimpressions** : ✕ en haut à gauche ; ↶ ↷ en haut à droite, seulement avec un historique non vide. Colonne droite : Texte · Média · Sticker · Son · Dessin · ⋯. En bas : « 🌐 Public » puis « Publier la story ▾ ». Boutons ronds de 44 pt sur du verre (`.glassEffect` sous `#available(iOS 26, *)`, sinon `.ultraThinMaterial` + voile de 38 %). Chaque bouton a un `accessibilityLabel` ; la colonne se lit dans l'ordre.
- **Rangée des diapos** : dès 2 diapos, en surimpression entre ✕ et ↶↷. Cibles de 44 pt. Elle reprend `ComposerSlideRail` (réordonner, supprimer avec confirmation #13616).
- **⋯** : un `Menu` SwiftUI (thème sombre), dont les entrées sont celles du § C de l'inventaire. Chacune n'est servie que si elle a un effet (`ComposerOverflowPolicy` étendu en `ComposerMoreMenuPolicy`, loi pure).
- **Publier ▾** : le corps publie. Le chevron est un `Menu` séparé, avec un `accessibilityLabel` « Type de publication » ; il porte `ComposerPublishMenuRule` et `ComposerMosaicChoice` tels quels. Sans autre format, il n'y a pas de chevron.
- **Disparaissent** : rail gauche à glyphes, colonne droite au repos, badges de compte, champ de légende permanent et son chevron, bloc d'aide (il ne reste qu'une ligne sur scène vide), barre haute (✕ · vignettes · + · ⋯), sélecteur Photos imposé à l'ouverture.

### 2.2 Frappe (état 2, L4)
- La hauteur du clavier se lit par `keyboardLayoutGuide` (UIKit, hôte du canvas) ou par la notification `keyboardWillChangeFrame`, avec sa courbe et sa durée. **La scène se réduit dans la même animation que le clavier** : on n'a pas deux mouvements.
- La barre (Aa · ● · ≡ · ▣ · OK) est un `inputAccessoryView` du champ en place du canvas. Il n'y a pas de second champ : c'est `StoryTextEditToolbar` réduit à quatre familles.
- **Clavier OU options** (règle #6156, déjà dans `ComposerObjectEditorView+Keyboard.swift`). Toucher une icône rend le premier répondant et monte un panneau de la hauteur mesurée du clavier. La scène ne bouge pas ; toucher le texte rend le clavier.
- Les panneaux regroupent les huit `TextEditTool` selon le § G de l'inventaire. Aa : police, taille, interlettrage, effet, puis « Langue du texte ». ● : couleur, puis contour. ≡ : alignement. ▣ : fond, puis cadre. Il y a une seule palette.
- Le même état sert pour la légende (« ⋯ › Légende ») et pour le corps du post (« ⋯ › Écrire le post », `ComposerWriting`). Le drapeau de langue de la légende devient le libellé « Langue : FR », avec son action.
- Aucune puce d'état (`ComposerObjectChipsRow`) et aucun compteur avant la limite.

### 2.3 Sélection (état 3, L5)
- **Cadre** : pointillé blanc de 2 pt, décalé de 3 pt, aux bornes du calque. Il est peint par le canvas du SDK, comme une surimpression d'édition exclue de l'export (`StoryCanvasUIView` gagne une couche de sélection ; l'app ne la dessine pas).
- **Barre d'actions** : Modifier · Ordre · Dupliquer · Temps · Retirer, chacune avec un glyphe et un mot. Elle est posée au-dessus de Public/Publier. Une action sans effet n'est pas servie (loi 4, `ComposerSelectionActions.served(kind:animated:)`). Le menu contextuel (`StoryCanvasContextAction`) n'en est qu'un raccourci, et il ne s'ouvre plus à la fin d'un glissé.
- **Modifier** ouvre la feuille de la famille. Texte : l'état 2. Média : la feuille non destructive du § 3. Sticker : la feuille Stickers, qui remplace l'emoji. Son : la feuille Son. Lieu : la feuille Lieu.
- **Ordre** : premier plan, arrière-plan, mettre en fond, sortir de la scène. **Temps** : début et fin, images clés, frise de l'objet, en feuille. Cela fusionne APPARITION et TIMELINE.
- Toucher la scène à vide désélectionne.

### 2.4 Feuilles, limites et confirmations (L3)
- **Toute feuille réduit la scène au-dessus d'elle.** Les feuilles concernées sont : Stickers, Son, Audience, Mentions, Hashtags, Lieu, Fond, Durée, Animation, Temps et Modifier. Ce sont des feuilles **propres au compositeur**, ancrées en bas, sans voile et de hauteur mesurée. Elles ne sont plus des `.sheet` système, qui couvrent la scène, ni des `fullScreenCover`. Il n'y a qu'une feuille à la fois (`ComposerPortal`), le thème est sombre, et toutes portent un **OK** à droite. Glisser vers le bas ferme la feuille. Pour iOS 16, on n'utilise pas de `presentationDetents` personnalisés : la feuille est une vue posée dans la pile du meuble, et sa hauteur se publie par une préférence.
- **Limites** : on reprend `ComposerLimitFeedback`. Le message bref s'affiche à la limite, accompagné de `UIAccessibility.post(.announcement)` et d'un retour haptique d'avertissement. Rien n'est affiché au repos.
- **Confirmations** : « Fermer le brouillon ? » (Garder le brouillon / Abandonner) pour un brouillon non vide, et « Tout effacer ? » (Effacer / Annuler). On utilise `confirmationDialog`, disponible sous iOS 16. « Tout effacer » remet le fond neutre de la scène : le fond rose résiduel est un défaut.

### 2.5 iPad et grand écran (L6)
- La bascule dépend de la **place libre**, jamais de `horizontalSizeClass` seul ni du modèle d'appareil. C'est une loi pure `ComposerSceneArrangement.resolve(width:height:)`, au même seuil et avec la même hystérésis que la spec partagée (§ 4.5, valeurs en points). On l'alimente par la taille du conteneur (`GeometryReader` à la racine du meuble). Elle se rejoue en Split View, en Slide Over, en Stage Manager et à la rotation, sans perdre l'état.
- **Rail gauche libellé**, d'environ 112 pt : Fermer · Texte · Média · Sticker · Son · Dessin · Fond, puis les entrées de ⋯ qui tiennent, puis « ⋯ Plus ». **Rail droit libellé** « SÉLECTION », vide sans sélection, avec ↶ ↷ au pied. Publier se place sous la scène, à sa largeur ou au moins à 300 pt.
- Le clavier matériel et le trackpad : Tab parcourt les rails ; Retour valide OK ; Échap ferme une feuille ou désélectionne. Les raccourcis passent par `.keyboardShortcut`, avec des libellés localisés. On n'ajoute pas de `focusedValue` à fermeture neuve (mémoire : cela fige l'app).

### 2.6 Contraintes transverses
- iOS 16 → 27. Toute API d'iOS 17 ou plus est derrière `#available`. Les fermetures `async` sont annotées `@MainActor` (`NonisolatedNonsendingByDefault`).
- Fluidité : la scène ne recompose pas son contenu quand le chrome change. Les surimpressions reçoivent des primitives et sont `Equatable` quand c'est utile. On n'observe aucun singleton global dans les feuilles.
- Les chaînes vont dans `Localizable.xcstrings`, en 7 langues, sans chaîne en dur. Les clés partagées avec Android passent par `i18n/manifest`.
- Les fichiers restent sous 1 200 lignes, les fonctions sous 80 lignes et les types sous 1 500 lignes (`check_cohesion_budget.sh`). `MeeshyComposerHost.swift` (950), `+Surfaces` (990) et `ComposerSceneSurface.swift` (988) sont proches du seuil : on extrait d'abord, on ajoute ensuite.

## 3. #13840 : le chemin d'aplatissement aujourd'hui, et le modèle non destructif

### 3.1 Ce qui cuit aujourd'hui (constaté dans le code)

1. **« Modifier » d'un média local n'ouvre pas l'éditeur non destructif. Il ouvre la retouche de la caméra.** `MeeshyComposerHost+SceneColumns.swift:226-231` (`editSceneItem`, cas `.media`) et `MeeshyComposerHost+BackgroundMenu.swift:49` (menu du fond, `.edit`) appellent `requestSceneMediaRetouch`. Dès que le média a une source locale (`ComposerSceneMediaRetouchRule.origin`, `ComposerSceneMediaRetouch.swift:36-41`, c'est-à-dire le cas de tout média qu'on vient de poser), on présente `ConversationPieceRetouch` en plein écran (`ComposerSceneMediaRetouchCover`, `:111-124`). L'éditeur en place non destructif (`MediaEditTool.served` = filtre, réglages, effets, découpe, actions, texte alternatif ; `ComposerObjectEditorRail.swift:62-141`) n'est plus atteint que par un média distant sans fichier.
2. **La retouche peint le look, le cadrage, la découpe, le gain ET les textes dans un fichier neuf.** Au « Terminé » (`ComposerCaptureSession+Edit.swift:98-176`), `finishPhoto` appelle `photoRender` (`:178-195`). Celui-ci appelle `ComposerLookPainter.renderPhoto(look:framing:aspect:overlay:)`, avec `overlay` = `retouchTexts.overlay(...)`, c'est-à-dire les textes de `ComposerRetouchTextBoard` (« texte cuit », `ComposerEditTextLayer.swift:7-16`). `finishVideo` appelle `videoRender` (`:200-216`), qui appelle `ComposerLookVideoExporter.export(look:framing:timeRange:audioGain:overlay:)`. Le résultat est une `UIImage` ou une URL (`ComposerReturnedMedia`).
3. **Le fichier cuit REMPLACE l'objet.** `completeSceneMediaRetouch` (`MeeshyComposerHost+MediaRetouch.swift:17-30`) écrit le fichier (`ComposerSceneMediaRetouch.delivery`, `:88-108`), puis `ComposerMediaSwapRun.apply` (`ComposerMediaSwap.swift:89-114`) appelle `StoryMediaSourceSwap.swap` (SDK, `StoryMediaSourceSwap.swift`). L'objet reçoit un **nouvel identifiant**, `postMediaId` est vidé, et **`crop`, `sourceStart` et `sourceEnd` sont remis à zéro**. L'ancien bitmap part en réserve d'annulation.
4. **La retouche ne garde rien.** Chaque ouverture crée une session neuve (`ConversationPieceRetouchOpening.session()`, `ConversationPieceRetouch.swift:143-151`). `beginEditing` repart d'un cadrage `.identity` (`ComposerCaptureSession+Edit.swift:16-29`), et `leaveEditing` (`:236-256`) efface le cadrage, la découpe, le son et les textes (`retouchTexts.reset()`). **Rouvrir la retouche rouvre donc une image cuite, réglages neutres** : on ne peut ni retirer le filtre, ni changer le cadre, ni déplacer un texte posé dans la retouche.
5. **Conséquences pour l'utilisateur** : les textes et émojis tapés dans la retouche sont des pixels, et on ne peut plus les déplacer. Le filtre et le cadre ne se reprennent pas. Le recadrage et la découpe de la scène sont perdus. Le son d'une vidéo est cuit à son gain. La plainte du porteur « on ne pouvait plus poser une musique » doit être **reproduite au simulateur dans le témoin rouge de L2** avant d'être attribuée. Le code montre que l'objet change d'identité et de fichier ; il ne montre pas, à lui seul, ce qui bloque l'ajout d'un son.
6. **Même cuisson hors de la story.** Les pièces d'une conversation (`ConversationComposerLayers.swift:133-165`), d'un commentaire (`CommentSceneRetouch.swift:109-173`) et de la feuille du fil (`FeedComposerSheet.swift:472-495`) passent par le même atelier. Rouvrir une pièce retouchée rouvre l'image cuite.
7. **Destruction secondaire** : rogner un son dans « Création audio » écrit un nouveau fichier (`MeeshyComposerHost+Sound.swift`, `survivingTranscription`), alors que `backgroundAudioStart` et `backgroundAudioEnd` existent.

### 3.2 Modèle cible : des réglages persistés, peints en direct, cuits à l'export

**Principe.** Un média de la scène garde son **fichier d'origine** jusqu'à la publication. Tout ce qu'on lui fait est un **réglage de l'objet** ou un **calque de la scène** :

| Réglage | Champ | Existe ? | Peint en direct par |
|---|---|---|---|
| Filtre de la story | `StoryMediaObject.filter` | oui | canvas SDK (`StoryLookBake`, `StoryMediaLayer+VideoLook`) |
| Réglages et effets (11) | `StoryMediaObject.adjustments` | oui | idem |
| Recadrage et proportions | `StoryMediaObject.crop` (`MediaCropRect`) + cadrage | `crop` oui, cadrage (zoom, décalage) **à ajouter** dans `StoryMediaLook.framing` | canvas SDK (`StoryMediaLayerRules`) |
| Découpe | `sourceStart`, `sourceEnd` | oui | player |
| Gain et muet | `volume`, `mutedVolumeMemento` | oui | player |
| **Filtre, cadre et effet de l'appel** | **`StoryMediaObject.look: StoryMediaLook?`** (nouveau, optionnel, `Codable`) : `filterPreset: String?`, `frameId: String?`, `faceEffect: String?`, `framing: StoryMediaFraming?` | **à ajouter** | le peintre unique de l'app (`ComposerLookPainter`), branché sur le canvas par un protocole opaque du SDK |
| Textes, émojis, stickers, dessin, son | objets de la slide (`StoryTextObject`, `StorySticker`, traits, `StoryAudioPlayerObject`) | oui | canvas SDK |

- **Pureté du SDK.** `StoryMediaLook` ne porte que des identifiants opaques (des chaînes). Le SDK ne connaît ni `VideoFilterPreset`, ni `CallMontageChoice`, ni `CallFaceEffect`, qui restent dans l'app. Le SDK expose `public protocol StoryMediaLookPainting { func paint(_ image: CIImage, look: StoryMediaLook, extent: CGRect) -> CIImage ; func videoComposition(for asset: AVAsset, look: StoryMediaLook) -> AVVideoComposition? }`. L'app l'injecte (`StoryMediaLookPainterRegistry.shared = ComposerLookPainter.adapter`) et le canvas l'appelle pour un objet qui a un `look`. **C'est le même peintre en direct et à l'export** (loi 6).
- **« Modifier » (S›M) ouvre UNE feuille non destructive**, qui réduit la scène. Ses sections fusionnent la retouche et l'éditeur en place : Filtre (filtres de l'appel, puis `StoryFilter`), Cadres, Effets, Réglages, Recadrer (équerres, proportions, quart de tour), Découper, Son (gain, muet), Description (texte alternatif). Chaque geste écrit le champ de l'objet par le `StoryComposerViewModel`, donc **l'historique ↶ ↷ le couvre**. On ne crée pas de fichier, l'objet ne change pas d'identifiant, et `ComposerMediaSwapRun` n'est plus appelé depuis « Modifier ». **Rouvrir « Modifier » relit les champs** : le filtre et le cadre choisis sont là.
- **Le texte de la retouche disparaît du compositeur de story** : on pose un texte par le bouton Texte, sur la scène. `ComposerRetouchTextBoard` reste pour la retouche d'une pièce de message (§ 3.4).
- **Cuisson à l'export, et seulement là** :
  - **Publication** : dans `StoryViewModel+PublicationUpload.swift`, `runStoryUpload` (vers les lignes 118-204), puis `runStoryUpdate` (vers 529-600). Avant d'encoder un média qui porte un `look`, on le peint avec `ComposerLookPainter.renderPhoto` ou `ComposerLookVideoExporter.export`, sur une **copie dérivée**, puis on téléverse ce rendu. **Le `look` est retiré de la charge envoyée** : le lecteur publié, et les anciens clients, reçoivent un média ordinaire. `filter`, `adjustments`, `crop` et `sourceStart/End` restent des champs du fil, comme aujourd'hui, et le player les peint.
  - **« Enregistrer dans Photos » et « Partager »** (`ComposerSceneExportController.swift`) : la scène est capturée par le canvas, qui peint déjà le `look` par le peintre injecté.
  - **La flèche ⬇︎ de la retouche du viseur** (`saveTakeToPhotos`) reste un enregistrement explicitement demandé : c'est le seul aplatissement permis hors export.
- **Viseur.** La prise faite dans la scène (`poseSceneCapture`, `MeeshyComposerHost+Viewfinder.swift:123`) pose désormais le **brut** et son `look` (filtre, cadre et effet choisis en direct, découpe, gain) comme réglages de l'objet. Elle ne pose plus un rendu.
- **Son rogné** : « Création audio » écrit `backgroundAudioStart` et `backgroundAudioEnd` (ou les bornes de l'objet sonore) au lieu de réécrire le fichier.

### 3.3 Rétrocompatibilité
- **Brouillons existants** (`ComposerAutosaveCodec`, `ComposerAutosaveSnapshot`, `ComposerSceneAssetCarriage`) : `look` est optionnel, donc un ancien brouillon se décode avec `look == nil`. Un média que l'ancienne retouche avait déjà cuit reste un fichier cuit : on le lit et on l'affiche tel quel, et on ne peut pas le « décuire ». Le témoin vérifie qu'un instantané d'avant la refonte se relit à l'identique.
- **Stories publiées** : le fil ne change pas, puisque `look` n'y est jamais envoyé. `StoryEditComposer` rouvre une story publiée avec des médias sans `look`. Un `look` posé pendant la modification se cuit à `runStoryUpdate`.
- **Le mode Animé est conservé** dans le brouillon (défaut 27).
- **Un ancien client qui lit un brouillon synchronisé** : sans objet, le brouillon est local. Un serveur qui recevrait par erreur un `look` l'ignore (champ inconnu). Le témoin de charge vérifie qu'il n'est pas envoyé.

### 3.4 Pièces de message (conversation, commentaires, fil)
La règle porteur vaut « tant qu'on n'a pas envoyé ». Une pièce en attente garde son **fichier d'origine** et une **recette** `ComposerRetouchRecipe` (look, cadrage, proportions, découpe, gain, textes en `StoryTextObject`), tenue par l'état du compositeur de message à côté de la pièce. Rouvrir la retouche **restaure la session depuis la recette** : `beginEditing(…, recipe:)` remplit `look`, `framing`, `trim`, `takeSound` et `retouchTexts`. La cuisson se fait à l'envoi, par le même `photoRender` / `videoRender`. Une pièce de message est un fichier plat, et ses textes se cuisent donc à l'envoi, mais pas avant. Ce lot partage le type de recette avec la story, sans dupliquer de peintre.

### 3.5 Android sur le même point
- **Le compositeur de story Android n'aplatit pas.** « Modifier » d'un média ouvre les sections en place : filtre, réglages, effets, découpe, rognage d'image, texte alternatif (`ComposerSelectionSections.kt`, `ComposerObjectEditorSection.kt`, `PlacedMediaLayer.kt` : `SceneLookRecipe.forStory(filter, adjustments)`). Le brouillon les garde (`StoryComposerAutosave.kt`). Il n'offre cependant **ni les filtres, ni les cadres, ni les effets de l'appel**, ni le recadrage avec proportions de la retouche.
- **La retouche Android du chat et du fil cuit**, comme iOS. `ComposerRetouchBake` (`core/model/.../composer/look`), `RetouchTextPainter` et `RetouchGlassPainter` (`sdk-ui/.../retouch`) peignent les textes, et `ComposerRetouchDelivery.RENDERED` rend un rendu. Rouvrir une pièce rouvre le rendu. C'est l'objet de #13841 pour les pièces, et du lot de parité pour le look en story.

## 4. Table de placement

La table complète, ligne par ligne avec les fichiers, est l'inventaire (`docs/product/composer-scene-d-abord/inventaire-options.md`). En résumé :

| Nouvelle place | Ce qu'elle reçoit |
|---|---|
| Repos, colonne droite | Texte, Média (appui long : photothèque / fichiers), Sticker, Son, Dessin, ⋯ |
| Repos, haut | ✕ (confirmation si brouillon non vide), rangée des diapos dès 2, ↶ ↷ |
| Repos, bas | 🌐 Public, Publier la story ▾ |
| ⋯ | Ajouter une diapo · Fond (couleurs, transitions, effet visuel) · Cadrage du fond · Animation · Durée de la diapo · Légende · Écrire le post · Mentionner · Hashtags · Lieu · Aperçu · Choisir un fond · Retirer le fond de la scène · Enregistrer dans Photos · Partager hors de Meeshy · Tout effacer (confirmation) |
| Barre clavier | Aa (police, taille, interlettrage, effet, langue du texte) · ● (couleur, contour) · ≡ (alignement) · ▣ (fond, cadre) · OK ; bande @ des mentions |
| Sélection | Modifier · Ordre (devant, derrière, mettre en fond, sortir de la scène) · Dupliquer · Temps (début, fin, images clés, frise) · Retirer |
| Modifier d'un média | Filtre · Cadres · Effets · Réglages · Recadrer · Découper · Son · Description · Faire un sticker (détourer) · Reprendre la photo (fond) |
| Feuilles | Stickers (9 onglets, Mes stickers, détourer, lieux, boutique) · Son (actuel, enregistrer, fichiers, bibliothèque, langue, rôle, rogner, transcription, volume) · Audience (sans « Appliquer ») · Mentions · Hashtags · Lieu · Fond · Durée · Animation · Temps |
| Publier ▾ | Story / Post (+ agencement : carrousel, réel, héros, vague, sinus) / Réel, avec la raison d'un refus |
| Viseur | inchangé, avec une sortie visible ; la prise pose son brut et ses réglages |
| Dessin | barre basse : Stylo, Marqueur, Gomme · Couleur · Épaisseur · Lissage · ↶ · OK |
| iPad | rail gauche libellé (Fermer, Texte, Média, Sticker, Son, Dessin, Fond, puis ⋯) · rail droit « SÉLECTION » (mêmes actions, ↶ ↷ au pied) · Publier sous la scène |

## 5. Les six lots

| Lot | Issue | Contenu |
|---|---|---|
| L1 | #13839 | fondation du repos, et réécriture des doctrines `CLAUDE.md` |
| L2 | #13840 | édition non destructive : `StoryMediaLook`, peintre injecté, feuille Modifier non destructive, cuisson à la publication, recette des pièces de message, son rogné par bornes |
| L3 | #13839 | feuilles ancrées qui réduisent la scène ; limites montrées à la limite seulement ; audience sans « Appliquer » ; confirmations de fermeture et de « Tout effacer » |
| L4 | #13839 | frappe : scène réduite dans l'animation du clavier, barre collée, clavier OU options, légende et corps du post |
| L5 | #13839 | sélection : cadre du SDK, barre d'actions, Modifier par famille (dont le média de L2), Ordre, Temps fusionné, menu contextuel réduit à un raccourci |
| L6 | #13839 | grand écran : `ComposerSceneArrangement`, deux rails libellés, Publier sous la scène, clavier matériel |

Chaque lot se prouve ainsi : témoins XCTest rouges puis verts (`test_{méthode}_{condition}_{attendu}`), `build-for-testing` et `test-without-building` ciblé sous le verrou `ios-build.lock`, puis les gardes `check_house_rules.sh`, `check_cohesion_budget.sh`, `check_localization.py`, `check_pbxproj_consistency.sh` et `check_test_registration.sh`. S'y ajoute une capture du simulateur « Compo-iPhone » (staging uniquement) de l'état visé, et, pour L6, une capture iPad en pleine largeur et en Split View. L2 se prouve en plus par le témoin du critère de fin de #13840 : poser un texte et un sticker, ouvrir Modifier sur le média, changer le filtre et le cadre, revenir ; le texte se déplace, on ajoute un son, on rouvre Modifier et on retrouve le filtre et le cadre.

## 6. Non-objectifs
- Le trait de dessin sélectionnable et « Reprendre / Recommencer » sur un brouillon restauré (comme Android, § 8).
- `MediaEditTool.split`, hors contrat.
- Les surfaces mood et document gardent leur plateau. Le compositeur de story et le compositeur de post à scène adoptent la disposition.
- Décuire un média que l'ancienne retouche a déjà cuit : c'est impossible.
