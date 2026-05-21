# Édition de texte en place sur le canvas — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'overlay plein écran d'édition de texte des stories par une édition **en place** directement sur le canvas, avec barre d'outils dockée au-dessus du clavier.

**Architecture:** Un `UITextView` transparent (`StoryInlineTextEditor`) est superposé, dans la vue UIKit du canvas (`StoryCanvasUIView`), sur la `StoryTextLayer` éditée ; les glyphes de cette calque sont rendus transparents (`setGlyphsHidden`) pendant que son fond solide/glass reste visible. La barre d'outils (`StoryTextEditToolbar`) est dockée au-dessus du clavier ; le canvas se décale vers le haut pour garder le texte visible.

**Tech Stack:** Swift 6, SwiftUI + UIKit interop, `CATextLayer`, `UITextView`, SPM (target `MeeshyUI`). Tests XCTest via le scheme `MeeshySDK-Package`.

**Spec de référence:** `docs/superpowers/specs/2026-05-17-story-inline-text-editing-design.md`

---

## Conventions communes

- **Build/test** : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/<Suite>`
- **Build app** : `./apps/ios/meeshy.sh build` (depuis la racine du repo).
- Le package `MeeshySDK` est SPM : les nouveaux fichiers `.swift` sont auto-découverts, **aucune entrée `.pbxproj`** à ajouter.
- Messages de commit : sans trailer `Co-Authored-By`.
- `MeeshyUI` est sous `defaultIsolation(MainActor)` : les nouveaux types UIKit (`UIView`/`UITextView`) sont déjà MainActor. Les classes de test correspondantes sont `@MainActor`.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `…/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift` *(nouveau)* | Résolution `UIFont` partagée depuis un `StoryTextObject`. |
| `…/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift` *(modifié)* | Délègue la police à `StoryTextFontResolver` ; nouvelle API `setGlyphsHidden(_:)`. |
| `…/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift` *(nouveau)* | `UITextView` transparent stylé comme un `StoryTextObject`. |
| `…/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` *(modifié)* | Propriétés stockées d'édition + hook `rebuildLayers()`. |
| `…/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift` *(nouveau)* | begin/end/reposition + `UITextViewDelegate`. |
| `…/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift` *(modifié)* | Entrée `editingTextId` + callbacks. |
| `…/MeeshyUI/Story/StoryTextEditToolbar.swift` *(nouveau, ex-`FloatingTextEditOverlay.swift`)* | Barre d'outils dockée. |
| `…/MeeshyUI/Story/TextEditCenteredField.swift` *(supprimé)* | — |
| `…/MeeshyUI/Story/StoryComposerView.swift` *(modifié)* | Observation clavier + décalage canvas + pose de la barre. |

Préfixe commun : `packages/MeeshySDK/Sources/`. Tests sous `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/`.

---

## Task 1: `StoryTextFontResolver` — résolution de police partagée

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextFontResolverTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

```swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTextFontResolverTests: XCTestCase {

    private func makeText(style: String, family: String = "system") -> StoryTextObject {
        // Ordre des arguments = ordre de déclaration de l'init : fontFamily avant textStyle.
        StoryTextObject(id: "t1", text: "Hello", fontFamily: family, textStyle: style)
    }

    func test_resolveFont_boldStyle_isHeaviestWeight() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "bold"), size: 40)
        XCTAssertEqual(font.pointSize, 40, accuracy: 0.01)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        let weight = traits?[.weight] as? CGFloat ?? 0
        XCTAssertEqual(weight, UIFont.Weight.black.rawValue, accuracy: 0.01)
    }

    func test_resolveFont_typewriterStyle_isMonospaced() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "typewriter"), size: 24)
        XCTAssertTrue(font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace))
    }

    func test_resolveFont_unknownStyle_fallsBackToSystem() {
        let font = StoryTextFontResolver.resolveFont(forTextObject: makeText(style: "classic"), size: 18)
        XCTAssertEqual(font.pointSize, 18, accuracy: 0.01)
    }
}
```

- [ ] **Step 2: Lancer le test — il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryTextFontResolverTests 2>&1 | tail -20`
Expected: échec compilation — `cannot find 'StoryTextFontResolver' in scope`.

- [ ] **Step 3: Créer `StoryTextFontResolver.swift`**

Contenu — extraction verbatim de la logique privée `StoryTextLayer.resolveFont(forTextObject:size:)` :

```swift
import UIKit
import MeeshySDK

/// Source unique de résolution `UIFont` pour le rendu canvas d'un
/// `StoryTextObject`. Extraite de `StoryTextLayer` pour être partagée avec
/// `StoryInlineTextEditor` sans dupliquer la logique de style. Le pendant
/// SwiftUI `storyFont(for:size:)` (`FontStylePicker.swift`) reste séparé : il
/// renvoie un `Font` SwiftUI ; ce resolver n'unifie que le côté UIKit.
public enum StoryTextFontResolver {

    /// Résout la `UIFont` d'un `StoryTextObject` : police custom (`fontFamily`)
    /// prioritaire, sinon dérivée du `textStyle`.
    public static func resolveFont(forTextObject text: StoryTextObject,
                                   size: CGFloat) -> UIFont {
        if text.fontFamily != "system",
           let custom = UIFont(name: text.fontFamily, size: size) {
            return custom
        }
        switch text.parsedTextStyle {
        case .bold:
            return UIFont.systemFont(ofSize: size, weight: .black)
        case .neon:
            let base = UIFont.systemFont(ofSize: size, weight: .semibold)
            let descriptor = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .typewriter:
            return UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
        case .handwriting:
            if let name = text.parsedTextStyle.fontName,
               let custom = UIFont(name: name, size: size) {
                return custom
            }
            let base = UIFont.systemFont(ofSize: size, weight: .regular)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .classic:
            let base = UIFont.systemFont(ofSize: size, weight: .medium)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        }
    }
}
```

- [ ] **Step 4: Lancer le test — il passe**

Run: idem Step 2.
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Faire déléguer `StoryTextLayer`**

Dans `StoryTextLayer.swift`, remplacer les deux appels à `resolveFont(forTextObject:size:)` (≈ lignes 53 et 91) par `StoryTextFontResolver.resolveFont(forTextObject:size:)`, puis **supprimer** la méthode privée `resolveFont(forTextObject:size:)` (≈ lignes 200-229). Laisser `resolveFont(family:size:)` inchangée.

Exemple ligne 53 :
```swift
let designFont = StoryTextFontResolver.resolveFont(forTextObject: text, size: designFontSize)
```
Exemple ligne 91 :
```swift
let renderedFont = StoryTextFontResolver.resolveFont(forTextObject: text, size: renderedFontSize)
```

- [ ] **Step 6: Vérifier la non-régression**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryTextFontResolverTests -only-testing:MeeshyUITests/StoryCanvasSnapshotTests 2>&1 | tail -25`
Expected: `** TEST SUCCEEDED **` (le rendu canvas est inchangé — même logique de police).

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextFontResolverTests.swift
git commit -m "refactor(story): extract StoryTextFontResolver for shared UIFont resolution"
```

---

## Task 2: `StoryTextLayer.setGlyphsHidden(_:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextLayerGlyphSuppressionTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

```swift
import XCTest
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTextLayerGlyphSuppressionTests: XCTestCase {

    private func makeGlassLayer() -> StoryTextLayer {
        let text = StoryTextObject(id: "g1", text: "GLASS",
                                   x: 0.5, y: 0.5,
                                   backgroundStyle: .glass(radius: 24))
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .edit)
        return layer
    }

    func test_setGlyphsHidden_true_keepsBoundsAndBackgroundSublayer() {
        let layer = makeGlassLayer()
        let boundsBefore = layer.bounds
        let glassBefore = layer.sublayers?.contains { $0 is StoryGlassBackdropLayer } ?? false
        XCTAssertTrue(glassBefore, "le fond glass doit être un sous-calque")

        layer.setGlyphsHidden(true)

        XCTAssertEqual(layer.bounds, boundsBefore)
        XCTAssertTrue(layer.sublayers?.contains { $0 is StoryGlassBackdropLayer } ?? false,
                      "setGlyphsHidden ne doit PAS retirer le fond")
    }

    func test_setGlyphsHidden_makesForegroundTransparent_thenRestores() {
        let layer = makeGlassLayer()

        layer.setGlyphsHidden(true)
        let hidden = layer.string as? NSAttributedString
        let hiddenColor = hidden?.attribute(.foregroundColor, at: 0, effectiveRange: nil)
        XCTAssertEqual((hiddenColor as! CGColor).alpha, 0, accuracy: 0.001)

        layer.setGlyphsHidden(false)
        let shown = layer.string as? NSAttributedString
        let shownColor = shown?.attribute(.foregroundColor, at: 0, effectiveRange: nil)
        XCTAssertGreaterThan((shownColor as! CGColor).alpha, 0.5)
    }
}
```

- [ ] **Step 2: Lancer le test — il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryTextLayerGlyphSuppressionTests 2>&1 | tail -20`
Expected: échec — `value of type 'StoryTextLayer' has no member 'setGlyphsHidden'`.

- [ ] **Step 3: Ajouter les propriétés et l'API à `StoryTextLayer`**

Dans `StoryTextLayer.swift`, ajouter sous les propriétés privées existantes (sous `glassBackdropLayer`) :
```swift
    /// Chaînes attribuées mémorisées par `configure`, permettant à
    /// `setGlyphsHidden` de basculer les glyphes sans toucher `bounds` ni les
    /// sous-calques de fond.
    private var visibleString: NSAttributedString?
    private var hiddenString: NSAttributedString?
    public private(set) var glyphsHidden: Bool = false
```

Dans `configure(with:geometry:mode:)`, juste après la ligne `string = renderedAttr` (≈ ligne 97), ajouter :
```swift
        visibleString = renderedAttr
        hiddenString = NSAttributedString(string: text.text, attributes: [
            .font: renderedFont,
            .foregroundColor: UIColor.clear.cgColor,
            .paragraphStyle: para
        ])
        if glyphsHidden { string = hiddenString }
```

Ajouter la méthode publique (par ex. après `configure`) :
```swift
    /// Rend les glyphes invisibles (couleur de premier plan transparente) tout
    /// en conservant `bounds` et les sous-calques de fond (solide / glass).
    /// Utilisé pendant l'édition de texte en place : `StoryInlineTextEditor`
    /// peint les glyphes éditables par-dessus, le vrai fond reste visible.
    @MainActor
    public func setGlyphsHidden(_ hidden: Bool) {
        glyphsHidden = hidden
        string = hidden ? hiddenString : visibleString
    }
```

- [ ] **Step 4: Lancer le test — il passe**

Run: idem Step 2.
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextLayerGlyphSuppressionTests.swift
git commit -m "feat(story): add StoryTextLayer.setGlyphsHidden for in-place text editing"
```

---

## Task 3: `StoryInlineTextEditor`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryInlineTextEditorTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

```swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryInlineTextEditorTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    func test_apply_setsColorAlignmentAndText() {
        let text = StoryTextObject(id: "t1", text: "Bonjour",
                                   textColor: "FF0000", textAlign: "left")
        let editor = StoryInlineTextEditor()
        editor.apply(textObject: text, geometry: geometry, setText: true)

        XCTAssertEqual(editor.text, "Bonjour")
        XCTAssertEqual(editor.textAlignment, .left)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        editor.textColor?.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 1, accuracy: 0.02)
        XCTAssertEqual(g, 0, accuracy: 0.02)
    }

    func test_apply_setFalse_doesNotOverwriteText() {
        let editor = StoryInlineTextEditor()
        editor.text = "déjà tapé"
        let text = StoryTextObject(id: "t1", text: "valeur modèle")
        editor.apply(textObject: text, geometry: geometry, setText: false)
        XCTAssertEqual(editor.text, "déjà tapé")
    }

    func test_placeholder_visibleWhenEmpty_hiddenWhenTyped() {
        let editor = StoryInlineTextEditor()
        let text = StoryTextObject(id: "t1", text: "")
        editor.apply(textObject: text, geometry: geometry, setText: true)
        XCTAssertFalse(editor.isPlaceholderHidden)

        editor.text = "x"
        editor.updatePlaceholderVisibility()
        XCTAssertTrue(editor.isPlaceholderHidden)
    }
}
```

- [ ] **Step 2: Lancer le test — il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryInlineTextEditorTests 2>&1 | tail -20`
Expected: échec — `cannot find 'StoryInlineTextEditor' in scope`.

- [ ] **Step 3: Créer `StoryInlineTextEditor.swift`**

```swift
import UIKit
import MeeshySDK

/// `UITextView` transparent stylé comme un `StoryTextObject`, superposé sur la
/// `StoryTextLayer` correspondante dans `StoryCanvasUIView` pendant l'édition
/// en place. Le vrai fond (solide / glass) reste rendu par la calque dessous ;
/// ce champ ne peint que les glyphes éditables.
public final class StoryInlineTextEditor: UITextView {

    private let placeholderLabel = UILabel()

    /// `true` quand le placeholder est masqué (le champ contient du texte).
    public var isPlaceholderHidden: Bool { placeholderLabel.isHidden }

    public init() {
        super.init(frame: .zero, textContainer: nil)
        backgroundColor = .clear
        isScrollEnabled = false
        isOpaque = false
        textContainerInset = .zero
        textContainer.lineFragmentPadding = 0
        tintColor = UIColor(red: 0.647, green: 0.706, blue: 0.988, alpha: 1) // indigo300
        spellCheckingType = .no
        placeholderLabel.numberOfLines = 0
        placeholderLabel.isUserInteractionEnabled = false
        placeholderLabel.text = String(localized: "story.textEditor.placeholder",
                                       defaultValue: "Saisissez votre texte…",
                                       bundle: .module)
        addSubview(placeholderLabel)
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryInlineTextEditor does not support NSCoder")
    }

    /// Applique le style d'un `StoryTextObject` : police (via
    /// `StoryTextFontResolver`), couleur, alignement. `setText` n'est `true`
    /// qu'à l'ouverture de l'édition — en cours de frappe le champ est la
    /// source de vérité de la chaîne et ne doit pas être réécrit.
    public func apply(textObject: StoryTextObject,
                      geometry: CanvasGeometry,
                      setText: Bool) {
        let renderedSize = geometry.render(CGFloat(textObject.fontSize * textObject.scale))
        let resolved = StoryTextFontResolver.resolveFont(forTextObject: textObject,
                                                         size: renderedSize)
        font = resolved
        textColor = Self.color(hex: textObject.textColor) ?? .white
        textAlignment = Self.alignment(from: textObject.textAlign)
        if setText { text = textObject.text }

        placeholderLabel.font = resolved
        placeholderLabel.textColor = (textColor ?? .white).withAlphaComponent(0.45)
        placeholderLabel.textAlignment = textAlignment
        updatePlaceholderVisibility()
    }

    /// Masque le placeholder dès que le champ contient du texte.
    public func updatePlaceholderVisibility() {
        placeholderLabel.isHidden = !(text ?? "").isEmpty
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        placeholderLabel.frame = bounds.inset(by: textContainerInset)
    }

    // MARK: - Helpers

    private static func alignment(from raw: String?) -> NSTextAlignment {
        switch raw?.lowercased() {
        case "left":  return .left
        case "right": return .right
        default:      return .center
        }
    }

    private static func color(hex: String?) -> UIColor? {
        guard var trimmed = hex?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        if trimmed.hasPrefix("#") { trimmed.removeFirst() }
        guard trimmed.count == 6 || trimmed.count == 8 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb) else { return nil }
        if trimmed.count == 8 {
            return UIColor(red: CGFloat((rgb & 0xFF000000) >> 24) / 255,
                           green: CGFloat((rgb & 0x00FF0000) >> 16) / 255,
                           blue: CGFloat((rgb & 0x0000FF00) >> 8) / 255,
                           alpha: CGFloat(rgb & 0x000000FF) / 255)
        }
        return UIColor(red: CGFloat((rgb & 0xFF0000) >> 16) / 255,
                       green: CGFloat((rgb & 0x00FF00) >> 8) / 255,
                       blue: CGFloat(rgb & 0x0000FF) / 255,
                       alpha: 1)
    }
}
```

- [ ] **Step 4: Lancer le test — il passe**

Run: idem Step 2.
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryInlineTextEditorTests.swift
git commit -m "feat(story): add StoryInlineTextEditor transparent text view"
```

---

## Task 4: `StoryCanvasUIView` — API d'édition en place

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCanvasUIViewInlineEditTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

```swift
import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryCanvasUIViewInlineEditTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        let text = StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.5)
        let slide = StorySlide(id: "s1", effects: StoryEffects(textObjects: [text]))
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        canvas.layoutIfNeeded()
        return canvas
    }

    private func textLayer(_ canvas: StoryCanvasUIView, id: String) -> StoryTextLayer? {
        canvas.layer.sublayers?
            .flatMap { $0.sublayers ?? [] }
            .flatMap { $0.sublayers ?? [] }
            .compactMap { $0 as? StoryTextLayer }
            .first { $0.name == id }
    }

    func test_beginInlineTextEdit_suppressesGlyphs_andTracksId() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        XCTAssertEqual(canvas.inlineEditingTextId, "t1")
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, true)
    }

    func test_endInlineTextEdit_restoresGlyphs() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        canvas.endInlineTextEdit()
        XCTAssertNil(canvas.inlineEditingTextId)
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, false)
    }

    func test_rebuildDuringEditing_keepsGlyphsSuppressed() {
        let canvas = makeCanvas()
        canvas.beginInlineTextEdit(textId: "t1")
        // Une mutation de slide déclenche rebuildLayers() via slide.didSet.
        var slide = canvas.slide
        slide.effects.textObjects[0].text = "Salut!"
        canvas.slide = slide
        XCTAssertEqual(textLayer(canvas, id: "t1")?.glyphsHidden, true)
    }
}
```

> Le helper `textLayer(_:id:)` descend `layer → rootLayer → itemsContainer → StoryTextLayer`. Vérifier la profondeur réelle de la hiérarchie (`StoryCanvasUIView.init` : `layer ▸ rootLayer ▸ itemsContainer`) et ajuster le nombre de `flatMap` si besoin.

- [ ] **Step 2: Lancer le test — il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryCanvasUIViewInlineEditTests 2>&1 | tail -20`
Expected: échec — `has no member 'beginInlineTextEdit'`.

- [ ] **Step 3: Ajouter les propriétés stockées dans `StoryCanvasUIView.swift`**

Les extensions Swift ne peuvent pas porter de propriété stockée — déclarer celles-ci dans la classe (fichier principal), section « Inline text editing », sous les propriétés de display link :
```swift
    // MARK: - Inline text editing

    /// Champ d'édition en place, sous-vue du canvas. Non-nil pendant l'édition.
    var inlineEditor: StoryInlineTextEditor?
    /// Id du texte en cours d'édition en place (nil hors édition).
    public private(set) var inlineEditingTextId: String?
    /// Notifié à chaque frappe : (textId, nouvelle chaîne).
    public var onInlineTextChanged: ((String, String) -> Void)?
    /// Notifié quand l'édition se termine (textId).
    public var onInlineTextEditEnded: ((String) -> Void)?
```

- [ ] **Step 4: Brancher le hook dans `rebuildLayers()`**

Dans `StoryCanvasUIView.swift`, à la **fin** de `rebuildLayers()` (après `scheduleContentReadyEvaluation(for: bgKind)`), ajouter :
```swift
        reapplyInlineEditingIfNeeded()
```

- [ ] **Step 5: Créer l'extension `StoryCanvasUIView+InlineTextEdit.swift`**

```swift
import UIKit
import MeeshySDK

extension StoryCanvasUIView: UITextViewDelegate {

    /// Démarre l'édition en place du texte `textId` : superpose un
    /// `StoryInlineTextEditor` sur sa `StoryTextLayer`, supprime les glyphes de
    /// cette calque (son fond reste visible) et ouvre le clavier.
    public func beginInlineTextEdit(textId: String) {
        guard inlineEditingTextId != textId,
              let textLayer = textLayer(forId: textId),
              let textObject = textLayer.textObject else { return }

        let editor = inlineEditor ?? StoryInlineTextEditor()
        editor.delegate = self
        if editor.superview == nil { addSubview(editor) }
        inlineEditor = editor
        inlineEditingTextId = textId

        position(editor, over: textLayer)
        editor.apply(textObject: textObject, geometry: geometry, setText: true)
        textLayer.setGlyphsHidden(true)
        editor.becomeFirstResponder()
    }

    /// Termine l'édition en place : retire le champ, restaure les glyphes.
    public func endInlineTextEdit() {
        guard let id = inlineEditingTextId else { return }
        textLayer(forId: id)?.setGlyphsHidden(false)
        let editor = inlineEditor
        inlineEditor = nil
        inlineEditingTextId = nil
        editor?.resignFirstResponder()
        editor?.removeFromSuperview()
    }

    /// Hook appelé en fin de `rebuildLayers()` : la calque éditée vient d'être
    /// reconstruite à neuf — re-supprimer ses glyphes et re-synchroniser le
    /// style + la géométrie du champ (SANS réécrire la chaîne : le `UITextView`
    /// est la source de vérité du texte pendant l'édition).
    func reapplyInlineEditingIfNeeded() {
        guard let id = inlineEditingTextId,
              let textLayer = textLayer(forId: id) else { return }
        textLayer.setGlyphsHidden(true)
        if let editor = inlineEditor, let textObject = textLayer.textObject {
            position(editor, over: textLayer)
            editor.apply(textObject: textObject, geometry: geometry, setText: false)
        }
    }

    // MARK: - Private

    private func textLayer(forId id: String) -> StoryTextLayer? {
        itemsContainer.sublayers?
            .first { $0.name == id } as? StoryTextLayer
    }

    /// Positionne le champ sur la calque : `bounds` + `center` + rotation.
    /// `center` (centre géométrique de la `UIView`) est dérivé de `position`
    /// (point d'ancrage de la calque) corrigé de l'`anchorPoint` — exact pour
    /// l'ancrage par défaut (0.5, 0.5) de tous les textes.
    private func position(_ editor: StoryInlineTextEditor, over layer: CALayer) {
        editor.transform = .identity
        editor.bounds = layer.bounds
        let anchor = layer.anchorPoint
        editor.center = CGPoint(
            x: layer.position.x + (0.5 - anchor.x) * layer.bounds.width,
            y: layer.position.y + (0.5 - anchor.y) * layer.bounds.height
        )
        let angle = atan2(layer.transform.m12, layer.transform.m11)
        if angle != 0 { editor.transform = CGAffineTransform(rotationAngle: angle) }
    }

    // MARK: - UITextViewDelegate

    public func textViewDidChange(_ textView: UITextView) {
        (textView as? StoryInlineTextEditor)?.updatePlaceholderVisibility()
        guard let id = inlineEditingTextId else { return }
        onInlineTextChanged?(id, textView.text ?? "")
    }

    public func textViewDidEndEditing(_ textView: UITextView) {
        guard let id = inlineEditingTextId else { return }
        onInlineTextEditEnded?(id)
    }
}
```

> `itemsContainer` est `private` dans `StoryCanvasUIView.swift`. Comme l'extension est dans le **même module et même type**, la passer en `internal` (retirer `private` sur sa déclaration ≈ ligne 125) pour que l'extension y accède. Idem pour `geometry` qui est déjà `public`.

- [ ] **Step 6: Lancer le test — il passe**

Run: idem Step 2.
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryCanvasUIViewInlineEditTests.swift
git commit -m "feat(story): add in-place text editing API to StoryCanvasUIView"
```

---

## Task 5: `StoryComposerCanvasView` — câblage du representable

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`

(Pas de test unitaire dédié : un `UIViewRepresentable` se valide via le test d'intégration Task 8 ; la logique métier est déjà couverte par Task 4.)

- [ ] **Step 1: Ajouter les entrées au representable**

Dans `StoryComposerCanvasView`, ajouter les propriétés et paramètres d'init :
```swift
    public var editingTextId: String?
    public var onInlineTextChanged: ((String, String) -> Void)?
    public var onInlineTextEditEnded: ((String) -> Void)?
```
Ajouter ces trois paramètres à `init(...)` **après `onItemDuplicated`** (avec défaut `nil`) et les assigner à `self.`. L'ordre est important : le site d'appel (Task 7) fournit les nouveaux arguments en dernier.

- [ ] **Step 2: Câbler `makeUIView` et `updateUIView`**

Dans `makeUIView`, après les autres assignations :
```swift
        view.onInlineTextChanged = onInlineTextChanged
        view.onInlineTextEditEnded = onInlineTextEditEnded
```

Dans `updateUIView`, **après** le bloc qui pousse `uiView.slide = slide` (donc après `rebuildLayers()`), ajouter :
```swift
        uiView.onInlineTextChanged = onInlineTextChanged
        uiView.onInlineTextEditEnded = onInlineTextEditEnded
        if uiView.inlineEditingTextId != editingTextId {
            if let id = editingTextId {
                uiView.beginInlineTextEdit(textId: id)
            } else {
                uiView.endInlineTextEdit()
            }
        }
```
L'ordre (slide poussé d'abord) garantit que la `StoryTextLayer` cible existe au moment du `beginInlineTextEdit`.

- [ ] **Step 3: Compiler**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift
git commit -m "feat(story): wire inline text editing through StoryComposerCanvasView"
```

---

## Task 6: `StoryTextEditToolbar` (refonte de `FloatingTextEditOverlay`) + suppression de `TextEditCenteredField`

**Files:**
- Rename/rewrite: `…/MeeshyUI/Story/FloatingTextEditOverlay.swift` → `…/MeeshyUI/Story/StoryTextEditToolbar.swift`
- Delete: `…/MeeshyUI/Story/TextEditCenteredField.swift`

- [ ] **Step 1: Renommer le fichier et remplacer son contenu**

```bash
git mv packages/MeeshySDK/Sources/MeeshyUI/Story/FloatingTextEditOverlay.swift packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift
```

Remplacer tout le contenu de `StoryTextEditToolbar.swift` par :
```swift
import SwiftUI
import MeeshySDK

/// Barre d'outils de mise en forme du texte, dockée en bas de l'écran (le
/// `StoryComposerView` la remonte au-dessus du clavier). Remplace l'ancien
/// `FloatingTextEditOverlay` plein écran : plus de voile sombre, plus de champ
/// recentré — le texte s'édite en place dans le canvas via `StoryInlineTextEditor`.
///
/// Vide tant que `viewModel.textEditingMode` est `.inactive`.
struct StoryTextEditToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel

    var body: some View {
        if case .active(let textId, let expandedTool) = viewModel.textEditingMode,
           let binding = textObjectBinding(for: textId) {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(spacing: 10) {
                    if let tool = expandedTool {
                        TextEditToolOptions(tool: tool, textObject: binding)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    TextEditFloatingBubbles(
                        expandedTool: expandedTool,
                        onSelectTool: { tool in
                            viewModel.setExpandedTool(expandedTool == tool ? nil : tool)
                            HapticFeedback.light()
                        },
                        onDismiss: { viewModel.exitTextEditingMode() }
                    )
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.85),
                       value: viewModel.textEditingMode)
        }
    }

    /// Binding live vers le `StoryTextObject` édité — alimente les outils de
    /// mise en forme. Retourne `nil` si l'élément n'existe plus.
    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard viewModel.currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: {
                viewModel.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newValue
                    viewModel.currentEffects = effects
                }
            }
        )
    }
}
```

> `onDismiss` appelle `exitTextEditingMode()` → `textEditingMode` devient `.inactive` → `StoryComposerView` passe `editingTextId = nil` au representable → `endInlineTextEdit()` résigne le clavier. Les autres sorties (tap zone vide, dismiss interactif) passent par `textViewDidEndEditing` → `onInlineTextEditEnded` → `exitTextEditingMode()` (idempotent).

- [ ] **Step 2: Supprimer `TextEditCenteredField.swift`**

```bash
git rm packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditCenteredField.swift
```

- [ ] **Step 3: Mettre à jour la référence dans `StoryComposerView` (build vert)**

Le renommage casse la référence dans `StoryComposerView.mainContent`. Pour
garder le build vert, renommer la référence (≈ ligne 297) :
```swift
            StoryTextEditToolbar(viewModel: viewModel)
```
(remplace `FloatingTextEditOverlay(viewModel: viewModel)`). Le placement
définitif — padding clavier, `ignoresSafeArea` — est traité en Task 7.

- [ ] **Step 4: Compiler**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditCenteredField.swift packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(story): replace FloatingTextEditOverlay with docked StoryTextEditToolbar"
```

---

## Task 7: `StoryComposerView` — clavier, décalage du canvas, pose de la barre

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

- [ ] **Step 1: Ajouter l'état clavier + décalage**

Près des autres `@State` de `StoryComposerView`, ajouter :
```swift
    @State private var keyboardHeight: CGFloat = 0
    @State private var canvasEditShift: CGFloat = 0
    /// Frame naturelle (non décalée) du canvas, mesurée hors `.offset`.
    @State private var canvasNaturalFrame: CGRect = .zero
```

- [ ] **Step 2: Mesurer la frame naturelle du canvas**

Dans `canvasComposerLayer` (≈ ligne 1033), ajouter un `.background` AVANT le `.offset` ajouté au Step 3, pour capturer la frame non décalée :
```swift
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { canvasNaturalFrame = proxy.frame(in: .global) }
                        .onChange(of: proxy.frame(in: .global)) { _, f in
                            canvasNaturalFrame = f
                        }
                }
            )
```

- [ ] **Step 3: Décaler le canvas**

Sur `canvasComposerLayer`, ajouter (après le `.background` du Step 2) :
```swift
            .offset(y: -canvasEditShift)
            .animation(.spring(response: 0.32, dampingFraction: 0.85), value: canvasEditShift)
```

- [ ] **Step 4: Passer l'id édité + callbacks au representable**

Dans `canvasCore`, sur l'appel `StoryComposerCanvasView(...)`, ajouter les arguments :
```swift
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, str in
                guard let i = viewModel.currentEffects.textObjects.firstIndex(where: { $0.id == id })
                else { return }
                var effects = viewModel.currentEffects
                effects.textObjects[i].text = str
                viewModel.currentEffects = effects
            },
            onInlineTextEditEnded: { _ in
                viewModel.exitTextEditingMode()
            }
```

- [ ] **Step 5: Positionner la barre au-dessus du clavier**

Dans `mainContent`, remplacer la ligne `StoryTextEditToolbar(viewModel: viewModel)` (posée en Task 6, ≈ ligne 297) par :
```swift
            StoryTextEditToolbar(viewModel: viewModel)
                .padding(.bottom, keyboardHeight)
```

Et ajouter `.ignoresSafeArea(.keyboard)` sur le `ZStack` de `mainContent` (après `.statusBarHidden()`), pour désactiver l'évitement-clavier automatique de SwiftUI (tout est piloté manuellement via `keyboardHeight`) :
```swift
        .ignoresSafeArea(.keyboard)
```

- [ ] **Step 6: Observer le clavier et calculer le décalage**

Ajouter sur le `ZStack` de `mainContent` (à côté des autres `.onReceive`/`.onChange`) :
```swift
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillShowNotification)) { note in
            let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
                as? NSValue)?.cgRectValue ?? .zero
            keyboardHeight = frame.height
            recomputeCanvasShift()
        }
        .onReceive(NotificationCenter.default.publisher(
            for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardHeight = 0
            canvasEditShift = 0
        }
        .onChange(of: viewModel.textEditingMode) { _, _ in recomputeCanvasShift() }
```

Ajouter la méthode de calcul dans `StoryComposerView` :
```swift
    /// Décale le canvas vers le haut juste assez pour que le texte édité reste
    /// au-dessus de (clavier + barre d'outils). Basé sur la position normalisée
    /// `y` du modèle — pas de pont de coordonnées UIKit↔SwiftUI.
    private func recomputeCanvasShift() {
        guard keyboardHeight > 0,
              let id = viewModel.textEditingMode.activeTextId,
              let textObj = viewModel.currentEffects.textObjects.first(where: { $0.id == id }),
              canvasNaturalFrame.height > 0 else {
            canvasEditShift = 0
            return
        }
        let toolbarHeight: CGFloat = 132   // barre bulles + marge (ajuster au visuel)
        let margin: CGFloat = 24
        let screenHeight = UIScreen.main.bounds.height
        let textCenterY = canvasNaturalFrame.minY
            + CGFloat(textObj.y) * canvasNaturalFrame.height
        let visibleBottom = screenHeight - keyboardHeight - toolbarHeight - margin
        canvasEditShift = max(0, textCenterY - visibleBottom)
    }
```

- [ ] **Step 7: Compiler**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 8: Vérifier la non-régression des tests Story**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests/StoryComposerViewModel_TextEditingTests -only-testing:MeeshyUITests/StoryCanvasSnapshotTests 2>&1 | tail -25`
Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(story): shift canvas and dock toolbar for in-place text editing"
```

---

## Task 8: Vérification d'intégration au simulateur

**Files:** aucun (vérification manuelle pilotée).

- [ ] **Step 1: Build + install + launch**

Run: `./apps/ios/meeshy.sh run` (laisser tourner pour le stream de logs).

- [ ] **Step 2: Parcours de validation**

Se connecter (`atabeth` / `<DEMO_PASSWORD — see apps/ios/fastlane/.env>`), ouvrir le composer de stories, puis vérifier :
1. Ajouter un texte → taper dessus → le texte s'édite **en place**, le reste de la story reste visible (pas de voile sombre).
2. La barre d'outils est dockée juste au-dessus du clavier.
3. Placer un texte en bas du canvas → l'éditer → le canvas se décale vers le haut, le texte reste visible.
4. Texte à fond `.solid` clair et texte à fond `.glass` → le fond reste visible pendant la frappe (le texte n'est jamais illisible).
5. Changer couleur / taille via la barre → le texte édité se met à jour live.
6. Sortir via : le X de la barre ; un tap sur une zone vide du canvas ; un swipe-down du clavier — les trois ferment l'édition proprement.
7. Aucun crash (régression du bug glass déjà couverte par `StoryGlassBackdropLayerFilterRetainTests`).

- [ ] **Step 3: Capturer une preuve**

Faire une capture d'écran de l'édition en place (texte + barre + canvas décalé) et la joindre au résumé de livraison.

- [ ] **Step 4: Suite de tests complète Story**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -derivedDataPath /Users/smpceo/Documents/v2_meeshy/apps/ios/Build -only-testing:MeeshyUITests 2>&1 | tail -30`
Expected: `** TEST SUCCEEDED **`, aucune régression.

---

## Notes de plan

- **Décalage du canvas (Task 7)** : le plan utilise la position normalisée `y` du modèle plutôt que `inlineEditingItemFrame()` (spec §7). C'est une simplification délibérée — elle évite un pont de coordonnées UIKit↔SwiftUI et la boucle de rétroaction du `.offset`. `inlineEditingItemFrame()` n'est donc PAS implémenté ; mettre à jour la spec §5.2, §7 et §8 en conséquence lors de la livraison.
- **`toolbarHeight = 132`** dans `recomputeCanvasShift()` est une constante à caler sur le rendu réel de `StoryTextEditToolbar` à l'étape de vérification (Task 8, Step 2.3).
- Perf `rebuildLayers()` par frappe : hors périmètre (cf. spec §10).
