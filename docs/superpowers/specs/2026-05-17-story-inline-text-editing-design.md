# Édition de texte en place sur le canvas de la story

**Date** : 2026-05-17
**Statut** : Conception validée — prêt pour le plan d'implémentation
**Cible** : `apps/ios` + `packages/MeeshySDK` (target `MeeshyUI`)

## 1. Contexte et problème

Le composer de stories (`StoryComposerView`) permet d'ajouter du texte sur le
canvas. Aujourd'hui, taper sur un texte ouvre `FloatingTextEditOverlay` : un
overlay **plein écran** qui

1. assombrit tout l'écran à 55 % d'opacité (`Color.black.opacity(0.55)`) — le
   canvas de la story disparaît ;
2. affiche le texte dans un champ **recentré** (`TextEditCenteredField`), à un
   emplacement qui n'a aucun rapport avec sa vraie position sur le canvas ;
3. masque la barre du haut et la zone du bas du composer.

L'utilisateur perd le contexte visuel de sa story et n'édite pas le texte « là
où il est ». La demande : **éditer le texte directement, en place, sur le
canvas de la story — ne pas créer un second canvas séparé**.

### Bug corrigé en amont (hors périmètre de ce chantier)

Un crash `EXC_BAD_ACCESS` se produisait à l'édition d'un texte à fond `.glass` :
`StoryGlassBackdropLayer.applyCAFilterFallback()` consommait un `+1` fantôme via
`Unmanaged.takeRetainedValue()` sur l'objet `+0` autoreleased retourné par
`+[CAFilter filterWithName:]` → sur-libération → double-free au drain de
l'autorelease pool. Corrigé (`takeRetainedValue()` → `takeUnretainedValue()`,
`StoryGlassBackdropLayer.swift:93`) et couvert par
`StoryGlassBackdropLayerFilterRetainTests`. Ce correctif est **déjà livré** ;
la présente spec ne couvre que la refonte UX.

## 2. Objectifs et non-objectifs

### Objectifs
- Le texte s'édite **en place** sur le canvas, à sa position/échelle/rotation
  réelles, avec sa police/couleur/alignement réels.
- Le reste de la story reste **visible** pendant l'édition (pas de voile sombre).
- Le **fond** du texte (solide / glass) reste visible pendant l'édition.
- Les 6 contrôles de mise en forme (style, couleur, taille, alignement, fond,
  contour) forment une **barre dockée juste au-dessus du clavier**.
- Quand le clavier monte, le canvas **se décale vers le haut** pour que le texte
  édité reste visible au-dessus de (clavier + barre d'outils).
- La géométrie du texte (`x/y/scale/rotation/zIndex/fontSize`) n'est **jamais**
  mutée pour l'édition (règle CLAUDE.md déjà en vigueur).

### Non-objectifs
- Pas de changement du modèle de données (`StoryTextObject` inchangé).
- Pas de refonte des outils eux-mêmes (`TextEditToolOptions` réutilisé tel quel).
- Pas de changement du pipeline d'export ni du rendu reader.
- Pas d'optimisation du `rebuildLayers()` par frappe (perf pré-existante,
  laissée en suivi — voir §10).

## 3. Architecture actuelle

```
StoryComposerView.mainContent (ZStack)
├─ Color.black
├─ canvasComposerLayer → StoryComposerCanvasView (UIViewRepresentable)
│                         └─ StoryCanvasUIView (UIKit, CALayer)
│                              itemsContainer ⊃ StoryTextLayer (CATextLayer, name = textId)
├─ topBar            (opacity 0 si textEditingMode ≠ .inactive)
├─ bottomRegion      (opacity 0 si textEditingMode ≠ .inactive)
└─ FloatingTextEditOverlay  (voile 55 % + TextEditCenteredField + bulles + options)
```

- Tap sur un texte du canvas → `StoryCanvasUIView.onItemTapped` →
  `viewModel.enterTextEditingMode(textId:)` → `textEditingMode = .active(...)`.
- `FloatingTextEditOverlay` s'affiche tant que `textEditingMode` est `.active`.
- `TextEditCenteredField` est un `TextField` SwiftUI lié au `StoryTextObject`
  via un `Binding` dérivé de `viewModel.currentEffects.textObjects`.
- `StoryTextLayer.configure(with:geometry:mode:)` calcule `bounds` /
  `position` / `anchorPoint` / `transform` (rotation seule — `text.scale` est
  fondu dans `fontSize`) et `name = text.id`. Le fond solide/glass est un
  **sous-calque** de la `StoryTextLayer` (`backgroundFillLayer` /
  `StoryGlassBackdropLayer`).

## 4. Architecture cible

```
StoryComposerView.mainContent (ZStack, .ignoresSafeArea(.keyboard))
├─ Color.black
├─ canvasComposerLayer  ── .offset(y: -canvasEditShift)  ← décalage clavier
│   └─ StoryComposerCanvasView
│        └─ StoryCanvasUIView
│             ├─ itemsContainer ⊃ StoryTextLayer (glyphes supprimés pour
│             │                    l'élément édité — son fond reste visible)
│             └─ StoryInlineTextEditor (UITextView, superposé sur l'élément édité)
├─ topBar            (opacity 0 pendant l'édition)
├─ bottomRegion      (opacity 0 pendant l'édition)
└─ StoryTextEditToolbar  ← barre dockée, positionnée à `keyboardHeight` du bas
     (TextEditFloatingBubbles + TextEditToolOptions, SANS voile, SANS champ)
```

Le champ de saisie quitte SwiftUI et descend **dans le canvas UIKit**. Raison :
`StoryCanvasUIView` possède déjà la géométrie de chaque élément
(`StoryTextLayer` calcule `bounds`/`position`/`transform`) ; un champ SwiftUI
superposé devrait re-matcher ces coordonnées à la main à travers la frontière
UIKit↔SwiftUI — fragile, surtout avec rotation et échelle. Dans le canvas, le
champ partage le repère de `itemsContainer` et suit toute transformation.

**Alternative écartée** : champ SwiftUI transparent positionné par-dessus le
canvas. Rejetée pour le matching de coordonnées fragile.

## 5. Composants

### 5.1 `StoryInlineTextEditor` (nouveau) — `MeeshyUI/Story/Canvas/`
Sous-classe `UITextView`. Responsabilité unique : **être un `UITextView` stylé
comme un `StoryTextObject`**.
- `func apply(textObject: StoryTextObject, geometry: CanvasGeometry)` : police,
  `textColor`, `textAlignment`, et `text` UNIQUEMENT à l'ouverture (voir §6
  pour la non-réécriture en cours de frappe).
- Police : via le helper partagé `StoryTextFontResolver` (§5.8) — PAS de
  duplication de la logique de `StoryTextLayer`.
- Fond **transparent** (`backgroundColor = .clear`) : le fond réel (solide /
  glass) reste rendu par la `StoryTextLayer` sous le champ (§5.2). `isScrollEnabled
  = false`, pas de barre ; `textContainerInset` / `lineFragmentPadding` calibrés
  pour que les glyphes éditables coïncident avec ceux du `CATextLayer`.
- Placeholder : `UITextView` n'en a pas nativement — afficher « Saisissez votre
  texte… » via un sous-`UILabel`, masqué dès que `text` est non vide.
- Pas de protocole `Providing` : c'est un composant `UIView`, pas un service
  (la règle protocole-d'abord de CLAUDE.md vise services/ViewModels).

### 5.2 `StoryCanvasUIView` — API d'édition en place
Nouvelle capacité publique, isolée dans une extension dédiée
(`StoryCanvasUIView+InlineTextEdit.swift`) pour ne pas grossir le fichier
principal (déjà ~1880 lignes) :
- `private var inlineEditor: StoryInlineTextEditor?`
- `func beginInlineTextEdit(textId: String)` :
  1. retrouve la `StoryTextLayer` via `itemsContainer.sublayers.first { $0.name == textId }` ;
  2. crée/positionne le `StoryInlineTextEditor` (sous-vue du canvas) :
     `bounds` = bounds de la calque, `center` = `position` de la calque,
     `transform` = rotation de la calque ;
  3. **supprime les glyphes de la calque** (`textLayer.setGlyphsHidden(true)`)
     SANS la masquer : son fond solide / glass reste visible — le `UITextView`
     transparent peint les glyphes éditables exactement par-dessus le vrai
     fond. (Masquer toute la calque masquerait aussi ses sous-calques de fond ;
     un texte clair sur fond solide clair deviendrait illisible en frappe.)
  4. style le champ via `apply(textObject:geometry:)` ;
  5. `becomeFirstResponder()`.
- `func endInlineTextEdit()` : retire le champ, restaure les glyphes de la
  calque (`setGlyphsHidden(false)`).
- `var inlineEditingTextId: String?` — id en cours d'édition (nil sinon).
- `func inlineEditingItemFrame() -> CGRect?` — frame de l'élément édité dans le
  repère de la vue canvas (pour le décalage clavier, §7).
- Callbacks : `onInlineTextChanged: ((String, String) -> Void)?` (id, nouveau
  texte) et `onInlineTextEditEnded: ((String) -> Void)?` (id).
- `rebuildLayers()` : après reconstruction, si `inlineEditingTextId != nil`,
  ré-appliquer `setGlyphsHidden(true)` sur la calque de cet id et
  re-synchroniser style + géométrie du `StoryInlineTextEditor` (sans réécrire
  la chaîne — voir §6).
- `StoryCanvasUIView` est le délégué `UITextViewDelegate` : `textViewDidChange`
  → `onInlineTextChanged` ; `textViewDidEndEditing` → `onInlineTextEditEnded`.

### 5.3 `StoryComposerCanvasView` (representable) — câblage
- Nouvelle entrée : `textEditingMode: TextEditingMode` (ou l'id édité).
- `updateUIView` : pousser d'abord tout changement de `slide` (donc
  `rebuildLayers()`), PUIS, si l'id édité change → `beginInlineTextEdit` /
  `endInlineTextEdit`. Cet ordre garantit que la `StoryTextLayer` cible existe
  dans `itemsContainer` au moment du `beginInlineTextEdit`.
- Nouveaux callbacks `onInlineTextChanged` / `onInlineTextEditEnded` passés au
  composer, qui met à jour `viewModel.currentEffects.textObjects[i].text` et
  appelle `exitTextEditingMode()` respectivement.

### 5.4 `FloatingTextEditOverlay` → `StoryTextEditToolbar` (renommé + refondu)
- Supprime `Color.black.opacity(0.55)` (le voile) et l'appel à
  `TextEditCenteredField`.
- Dock en bas une **barre** contenant la rangée `TextEditFloatingBubbles`
  (6 outils + X, réutilisée telle quelle) et, dépliées, les `TextEditToolOptions`.
- Position : la barre est ancrée en bas du `ZStack` et remontée **manuellement**
  via la hauteur de clavier observée (§5.6) — PAS via l'évitement-clavier
  automatique de SwiftUI (qui entrerait en conflit avec le décalage du canvas).
- Le `Binding<StoryTextObject>` est conservé : les outils écrivent couleur /
  taille / alignement / fond / contour en live.
- Le funnel de sortie passe du `@FocusState` SwiftUI au cycle de vie du
  `UITextView` : `textViewDidEndEditing` est l'unique point de sortie.

### 5.5 `TextEditCenteredField` — supprimé
Son rôle (saisie du texte) passe au `StoryInlineTextEditor` du canvas.

### 5.6 `StoryComposerView` — décalage du canvas et clavier
- Source unique de hauteur clavier : `@State private var keyboardHeight: CGFloat`,
  alimentée par les notifications `keyboardWillShow/Hide`.
- `.ignoresSafeArea(.keyboard)` sur le `ZStack` du composer : on **désactive**
  l'évitement-clavier automatique de SwiftUI pour tout piloter manuellement
  (sinon SwiftUI pousserait aussi le canvas, en conflit avec notre décalage).
- `StoryTextEditToolbar` est positionnée à `keyboardHeight` du bas.
- `@State private var canvasEditShift: CGFloat` : décalage calculé (§7) à
  l'ouverture du clavier ; `.offset(y: -canvasEditShift)` sur
  `canvasComposerLayer` ; animé à 0 à la fermeture.

### 5.7 `StoryComposerViewModel+TextEditing` — inchangé sur l'essentiel
- `enterTextEditingMode` / `exitTextEditingMode` / `setExpandedTool`
  conservés. Les tests existants restent valides. Seul change QUI les appelle
  (callbacks du canvas au lieu du `@FocusState` de l'overlay).

### 5.8 `StoryTextFontResolver` (nouveau) + `StoryTextLayer`
- `StoryTextFontResolver` : helper extrait de la logique privée
  `StoryTextLayer.resolveFont(forTextObject:size:)`. Source **unique** de
  résolution `UIFont` pour le canvas — `StoryTextLayer` ET
  `StoryInlineTextEditor` l'appellent (respect de Single Source of Truth).
  Le pendant SwiftUI `storyFont(for:size:)` de `FontStylePicker.swift` reste
  séparé : il renvoie un `Font` SwiftUI ; cette spec n'unifie que le côté UIKit.
- `StoryTextLayer` : gagne `func setGlyphsHidden(_ hidden: Bool)` — re-rend sa
  `string` avec une couleur de premier plan transparente (glyphes invisibles)
  tout en conservant `bounds` et les sous-calques de fond ; `false` restaure les
  vrais glyphes. `configure(with:…)` délègue sa résolution de police à
  `StoryTextFontResolver`.

## 6. Flux de données

**Ouverture** : tap texte → `onItemTapped` → `enterTextEditingMode(textId:)` →
`textEditingMode = .active` → `updateUIView` → `beginInlineTextEdit(textId:)` →
champ positionné + glyphes de la calque supprimés (fond conservé) + clavier
ouvert + `StoryTextEditToolbar` affichée.

**Frappe** : `textViewDidChange` → `onInlineTextChanged(id, str)` →
`viewModel.currentEffects.textObjects[i].text = str` → le modèle se propage →
`updateUIView` → `slide` poussé → `rebuildLayers()`. La calque reconstruite de
l'élément édité voit ses glyphes **re-supprimés** immédiatement (le fond se
reconstruit identique, sans animation via `CATransaction`) → la reconstruction
est invisible. **La chaîne du `UITextView` n'est jamais réécrite depuis le
modèle** (sinon le curseur saute) : le `UITextView` est la source de vérité de
la chaîne pendant l'édition ; le modèle n'est qu'un miroir descendant.

**Outils** : `TextEditToolOptions` écrit une propriété de style via le
`Binding` → modèle → `rebuildLayers()` → le canvas re-synchronise le **style**
(police/couleur/alignement/fond) du `StoryInlineTextEditor` depuis le
`StoryTextObject` mis à jour, ainsi que sa géométrie (la taille peut changer).

**Sortie** — trois déclencheurs, tous convergent vers `endEditing(true)` sur le
canvas → `textViewDidEndEditing` :
1. X de `StoryTextEditToolbar` ;
2. tap sur une zone vide du canvas (geste de tap simple existant) ;
3. fermeture interactive du clavier (drag).
→ `onInlineTextEditEnded(id)` → `exitTextEditingMode()` → `endInlineTextEdit()`
→ champ retiré, glyphes de la calque restaurés avec le texte final,
`canvasEditShift` → 0, barre masquée.

## 7. Géométrie et décalage clavier

**Position du champ** : le `StoryInlineTextEditor` est une **sous-vue** de
`StoryCanvasUIView`. `StoryTextLayer` expose `bounds`, `position`,
`anchorPoint`, `transform` (rotation). Le champ prend `bounds` =
`textLayer.bounds`, `center` = `textLayer.position` (corrigé de `anchorPoint`
si ≠ (0.5, 0.5)), `transform` = `CGAffineTransform(rotationAngle:)` extrait du
`transform` de la calque. `text.scale` est déjà fondu dans la taille de police
projetée — pas de scale séparé sur le champ. Conversion de repère :
`rootLayer` et `itemsContainer` sont à l'origine, sans transform — les
coordonnées de calque se mappent donc directement dans le repère de la vue
canvas. Si un transform est un jour introduit sur ces conteneurs, convertir
explicitement via `CALayer.convert(_:from:)`.

**Décalage** : à l'ouverture du clavier, soit `frame` le rectangle de
l'élément édité dans le repère de `StoryComposerView` (obtenu via
`inlineEditingItemFrame()` + offset du canvas), `kbTop` le haut du clavier,
`barH` la hauteur de `StoryTextEditToolbar`, `margin` une marge (~16 pt) :

```
zoneVisible = kbTop - barH - margin
shift = max(0, frame.maxY - zoneVisible)
canvasEditShift = shift   (animé, spring)
```

Le canvas remonte juste assez ; un texte déjà au-dessus de la zone ne provoque
aucun décalage. À la fermeture : `canvasEditShift = 0` animé.

## 8. Découpage en unités

| Unité | Rôle | Dépend de |
|---|---|---|
| `StoryTextFontResolver` | résolution `UIFont` depuis un `StoryTextObject` | `StoryTextObject` |
| `StoryInlineTextEditor` | UITextView stylé depuis un `StoryTextObject` | `StoryTextFontResolver`, `CanvasGeometry` |
| `StoryCanvasUIView+InlineTextEdit` | begin/end/reposition + délégation UITextView | `StoryInlineTextEditor`, `itemsContainer` |
| `StoryTextLayer.setGlyphsHidden` | supprime/restaure les glyphes, fond conservé | — |
| `StoryTextEditToolbar` | barre d'outils dockée (ex-`FloatingTextEditOverlay`) | `TextEditFloatingBubbles`, `TextEditToolOptions` |
| décalage canvas | offset SwiftUI piloté par le clavier | `keyboardHeight`, `inlineEditingItemFrame()` |

Chaque unité est testable isolément (voir §9).

## 9. Stratégie de test

- **`StoryTextFontResolverTests`** (nouveau) : résout la bonne `UIFont` pour
  chaque `textStyle` (bold/neon/typewriter/handwriting/classic) et `fontFamily`.
- **`StoryInlineTextEditorTests`** (nouveau) : `apply(textObject:geometry:)`
  mappe correctement la police (via le resolver partagé), couleur hex →
  `textColor`, `textAlign` → `textAlignment`, chaîne initiale ; placeholder
  visible si chaîne vide, masqué sinon.
- **`StoryTextLayer` glyph suppression** (nouveau) : `setGlyphsHidden(true)`
  rend les glyphes invisibles mais conserve `bounds` et les sous-calques de
  fond (`backgroundFillLayer` / `StoryGlassBackdropLayer`) ; `false` restaure.
- **`StoryCanvasUIViewInlineEditTests`** (nouveau) : `beginInlineTextEdit(textId:)`
  supprime les glyphes de la calque cible (son fond reste visible) et expose
  `inlineEditingTextId` ; `endInlineTextEdit()` restaure les glyphes ; un
  `rebuildLayers()` déclenché pendant l'édition laisse les glyphes supprimés ;
  `inlineEditingItemFrame()` renvoie un rectangle non nul.
- **`StoryComposerViewModel+TextEditing`** : tests existants conservés tels
  quels (transitions `textEditingMode`).
- **Régression crash glass** : déjà couverte par
  `StoryGlassBackdropLayerFilterRetainTests`.
- **Snapshots** : `StoryCanvasSnapshotTests` — vérifier qu'aucune baseline ne
  régresse (l'édition en place ne change pas le rendu hors-édition).
- **Vérification visuelle simulateur** en fin de parcours : composer → ajouter
  un texte → l'éditer en place ; tester un texte bas (décalage clavier), un
  texte `.glass` et un texte `.solid` (fond visible en frappe), changer
  couleur/taille via la barre, les 3 sorties.

TDD : chaque unité suit RED→GREEN→REFACTOR. `UITextViewDelegate` et l'API
publique définis avant implémentation. Tests via le scheme `MeeshySDK-Package`.

## 10. Risques et mitigations

| Risque | Mitigation |
|---|---|
| `CATextLayer.frame` mal défini sous `transform` non-identité | Positionner via `bounds` + `center` + `transform` séparés, pas `frame`. |
| Masquer la calque éditée masque aussi son fond (solide/glass) → texte illisible en frappe | Ne PAS masquer la calque : supprimer seulement ses glyphes, le fond reste rendu (`setGlyphsHidden`). |
| Reconstruction de calque par frappe restaure les glyphes de l'élément édité | `rebuildLayers()` ré-applique `setGlyphsHidden(true)` sur l'id édité. |
| Glyphes du `UITextView` désalignés des glyphes finaux du `CATextLayer` | Calibrer `textContainerInset` / `lineFragmentPadding` sur le padding +16 design-px ; vérifier au simulateur (pas de saut visible à la sortie). |
| Réécriture de la chaîne du `UITextView` depuis le modèle → curseur sauté | Le modèle ne pousse jamais la chaîne vers le champ pendant l'édition. |
| `anchorPoint` ≠ (0.5, 0.5) → champ décalé | Corriger `center` de l'offset d'ancrage ; texte par défaut centré (0.5, 0.5). |
| Évitement-clavier SwiftUI auto + décalage manuel = conflit | `.ignoresSafeArea(.keyboard)` ; tout piloter depuis `keyboardHeight` observé. |
| `rebuildLayers()` par frappe = coût perf | Hors périmètre. Suivi : ne re-synchroniser que les calques non-éditées, ou debouncer le round-trip de chaîne. |
| Police custom indisponible | Même fallback que `StoryTextFontResolver` (system semibold). |

## 11. Récapitulatif des fichiers

**Nouveaux**
- `…/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift`
- `…/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift`
- `…/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift` — résolution
  `UIFont` partagée, extraite de `StoryTextLayer.resolveFont(forTextObject:size:)`.
- `…/Tests/MeeshyUITests/Story/Canvas/StoryInlineTextEditorTests.swift`
- `…/Tests/MeeshyUITests/Story/Canvas/StoryCanvasUIViewInlineEditTests.swift`
- `…/Tests/MeeshyUITests/Story/Canvas/StoryTextFontResolverTests.swift`

**Modifiés**
- `StoryCanvasUIView.swift` — hook `rebuildLayers()`, `UITextViewDelegate`.
- `StoryTextLayer.swift` — nouvelle API `setGlyphsHidden(_:)` ; délègue la
  résolution de police à `StoryTextFontResolver`.
- `StoryCanvasRepresentable.swift` — entrée `textEditingMode`, callbacks.
- `FloatingTextEditOverlay.swift` → renommé `StoryTextEditToolbar.swift`,
  refondu (sans voile, sans champ).
- `StoryComposerView.swift` — décalage canvas + observation clavier.

**Supprimés**
- `TextEditCenteredField.swift`

**Inchangés** : `StoryComposerViewModel+TextEditing.swift`,
`TextEditFloatingBubbles.swift`, `TextEditToolOptions.swift`, `StoryTextObject`.
```
