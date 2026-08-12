# Éditeur de texte story — rangée unique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramener les neuf outils de l'éditeur de texte story sur une rangée unique de sept bulles (tap = valeur suivante, appui long = panneau), garder le canvas plein écran pendant l'édition, et donner au cadre un « Aucun », une marge et un liseré.

**Architecture:** Le modèle (`StoryTextObject`) gagne trois champs optionnels et un cas d'énuméré, tous rétro-compatibles. `StoryTextLayer` — seul rendu haute fidélité (canvas, reader, export vidéo) — les honore. Côté vue, `TextEditTool` perd `.size` et `.weight` (devenus des curseurs dans le panneau Police), `StoryTextEditTopBar` se réduit à « Terminé », et `TextEditFloatingBubbles` absorbe la mécanique tap+appui long qui vivait dans la rangée haute.

**Tech Stack:** Swift 6 (`swift-tools-version 6.2`), iOS 16+, SwiftUI + UIKit/CALayer, SPM. Tests : Swift Testing (`@Test` / `#expect`) pour les modèles purs, XCTest pour l'UI et la géométrie.

**Spec:** `docs/superpowers/specs/2026-07-28-story-text-editor-single-row-design.md`

## Global Constraints

- **Package** : `packages/MeeshySDK/`. Le target `MeeshySDK` n'importe **jamais** SwiftUI ; seul `MeeshyUI` le fait.
- **Isolation** : le package pose `.defaultIsolation(MainActor.self)` (SE-0466). Tout helper pur doit être `nonisolated` **sur le TYPE**, pas méthode par méthode — sinon extensions et conformances ne suivent pas.
- **`StoryTextFrameShape.none` doit TOUJOURS être qualifié.** Écrit `.none` dans un contexte optionnel, Swift le lie silencieusement à `Optional.none` : `XCTAssertEqual(obj.frameShape, .none)` compare alors à `nil` et passe pour de mauvaises raisons. Toujours `StoryTextFrameShape.none`.
- **Rétro-compatibilité JSON** : tout champ ajouté est `Optional`, décodé par `decodeIfPresent`, encodé par `encodeIfPresent`. `nil` doit rendre exactement le comportement d'avant. Aucune story publiée ne doit changer d'apparence.
- **Pas de commentaire décoratif.** Le code se documente lui-même ; un commentaire n'existe que pour expliquer un *pourquoi* non déductible.
- **Couleurs** : `MeeshyColors` uniquement (`indigo50`…`indigo950`, `brandPrimary`, `brandGradient`, `success`/`error`/`warning`/`info`). Jamais de hex en dur dans une vue.
- **`.onChange` interdit en SwiftUI brut** : utiliser `adaptiveOnChange`.
- **Commandes de vérification** :
  - Build app : `./apps/ios/meeshy.sh build`
  - Tests SDK : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet`
  - Filtrer : `-only-testing:MeeshyUITests/StoryTextAttributeCycleTests`
  - `meeshy.sh build` **ne compile pas** le bundle de tests. Toute tâche qui change une signature exige un `build-for-testing`.

---

### Task 1 : Modèle — `StoryTextFrameShape.none`, marge, liseré

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (enum ~244-262, struct ~296-497)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryTextFrameBoxTests.swift` (créer)

**Interfaces:**
- Consomme : rien.
- Produit :
  - `StoryTextFrameShape.none` (rawValue `"none"`, `usesCustomPath == false`, premier de `allCases`)
  - `StoryTextObject.framePaddingScale: Double?`
  - `StoryTextObject.frameBorderWidth: Double?`
  - `StoryTextObject.frameBorderColor: String?`
  - `StoryTextObject.resolvedFramePaddingScale: Double` (borné 0…3, défaut 1)
  - `StoryTextObject.hasFrameBox: Bool`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryTextFrameBoxTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

/// La boîte de cadre d'un texte se détache du fond : elle peut exister en
/// liseré seul, et « Aucun » la supprime quoi qu'il arrive. Trois champs
/// optionnels la décrivent — leur absence doit rendre EXACTEMENT le
/// comportement d'avant, sans quoi les stories déjà publiées changeraient
/// d'apparence à la première relecture.
struct StoryTextFrameBoxTests {

    private func text(background: StoryTextBackgroundStyle? = nil,
                      frameShape: String? = nil,
                      frameBorderWidth: Double? = nil) -> StoryTextObject {
        var obj = StoryTextObject(id: "t1", text: "Bonjour")
        obj.backgroundStyle = background
        obj.frameShape = frameShape
        obj.frameBorderWidth = frameBorderWidth
        return obj
    }

    // MARK: - hasFrameBox

    @Test func aFondSeulSuffitAFaireUneBoite() {
        #expect(text(background: .solid(hex: "000000")).hasFrameBox)
        #expect(text(background: .glass(radius: 24)).hasFrameBox)
    }

    @Test func unLisereSeulSuffitAussi_sansAucunFond() {
        #expect(text(frameBorderWidth: 2).hasFrameBox)
    }

    @Test func sansFondNiLisere_aucuneBoite() {
        #expect(!text().hasFrameBox)
        #expect(!text(frameBorderWidth: 0).hasFrameBox)
    }

    @Test func aucunCadreSupprimeLaBoite_memeAvecUnFondEtUnLisere() {
        let obj = text(background: .solid(hex: "000000"),
                       frameShape: StoryTextFrameShape.none.rawValue,
                       frameBorderWidth: 4)
        #expect(!obj.hasFrameBox)
    }

    @Test func formeAbsente_resteArrondi_jamaisAucun() {
        #expect(text().parsedFrameShape == StoryTextFrameShape.rounded)
    }

    @Test func aucunCadreNeTracePasDeChemin() {
        #expect(!StoryTextFrameShape.none.usesCustomPath)
    }

    // MARK: - Marge

    @Test func margeAbsente_vautUn() {
        #expect(text().resolvedFramePaddingScale == 1.0)
    }

    @Test func margeBorneeEntreZeroEtTrois() {
        var obj = text()
        obj.framePaddingScale = -5
        #expect(obj.resolvedFramePaddingScale == 0)
        obj.framePaddingScale = 99
        #expect(obj.resolvedFramePaddingScale == 3)
        obj.framePaddingScale = 1.4
        #expect(obj.resolvedFramePaddingScale == 1.4)
    }

    // MARK: - Codable

    @Test func lesTroisChampsSurvivent_auRoundTrip() throws {
        var obj = StoryTextObject(id: "t1", text: "Bonjour")
        obj.frameShape = StoryTextFrameShape.speech.rawValue
        obj.framePaddingScale = 1.8
        obj.frameBorderWidth = 3.5
        obj.frameBorderColor = "FF2E63"

        let data = try JSONEncoder().encode(obj)
        let back = try JSONDecoder().decode(StoryTextObject.self, from: data)

        #expect(back.parsedFrameShape == StoryTextFrameShape.speech)
        #expect(back.framePaddingScale == 1.8)
        #expect(back.frameBorderWidth == 3.5)
        #expect(back.frameBorderColor == "FF2E63")
    }

    /// Un JSON écrit AVANT ce travail n'a aucun des trois champs : il doit se
    /// décoder sans erreur et rendre le comportement historique.
    @Test func unJsonLegacySeDecode_enComportementHistorique() throws {
        let json = Data("""
        {"id":"t1","text":"Bonjour","x":0.5,"y":0.5,"scale":1,"rotation":0,
         "zIndex":0,"fontSize":96,"fontFamily":"system"}
        """.utf8)

        let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)

        #expect(obj.framePaddingScale == nil)
        #expect(obj.frameBorderWidth == nil)
        #expect(obj.frameBorderColor == nil)
        #expect(obj.resolvedFramePaddingScale == 1.0)
        #expect(obj.parsedFrameShape == StoryTextFrameShape.rounded)
        #expect(!obj.hasFrameBox)
    }
}
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshySDKTests/StoryTextFrameBoxTests
```

Attendu : ÉCHEC de compilation — `value of type 'StoryTextObject' has no member 'hasFrameBox'`, `'framePaddingScale'`, `'frameBorderWidth'`, `'frameBorderColor'`, et `type 'StoryTextFrameShape' has no member 'none'`.

- [ ] **Step 3 : Ajouter le cas `.none` à l'énuméré**

Dans `StoryModels.swift`, remplacer le corps de `StoryTextFrameShape` (~244-262). `none` est placé **en tête** : c'est aussi l'ordre du cycle au tap.

```swift
public enum StoryTextFrameShape: String, Codable, CaseIterable, Sendable {
    case none        // aucune boîte, quels que soient le fond et le liseré
    case rounded     // cornerRadius ≈ 15% of height (default)
    case pill        // full capsule (cornerRadius = 50% of height)
    case rectangle   // near-square corners
    case diamond     // losange (path-based)
    case cloud       // bulle de pensée nuage (path-based)
    case speech      // bulle de conversation BD avec queue (path-based)

    /// Les formes historiques se rendent par `cornerRadius` sur la calque ;
    /// les nouvelles formes passent par un tracé `CGPath` dédié (losange,
    /// nuage, bulle BD). Le renderer et l'export s'appuient sur ce flag pour
    /// choisir le pipeline.
    public var usesCustomPath: Bool {
        switch self {
        case .none, .rounded, .pill, .rectangle: return false
        case .diamond, .cloud, .speech: return true
        }
    }
}
```

- [ ] **Step 4 : Déclarer les trois champs**

Juste après `public var frameShape: String?` (~302) :

```swift
    /// Multiplicateur de la marge du cadre — l'espace entre les glyphes et le
    /// bord de la boîte. `nil` ⇒ 1.0, la marge historique. Un multiplicateur
    /// et non des points : la marge automatique vaut « au moins la chasse d'un
    /// *o* », elle dépend donc de la police ET de la taille — une valeur
    /// absolue deviendrait fausse au premier changement de l'une des deux.
    public var framePaddingScale: Double?

    /// Liseré tracé sur le bord de la boîte de cadre, en design-pixels.
    /// `nil` ou `0` ⇒ aucun liseré. À ne pas confondre avec `borderWidth`,
    /// qui contoure les GLYPHES et non la boîte.
    public var frameBorderWidth: Double?
    /// Couleur du liseré de la boîte. `nil` ⇒ blanc dès que la largeur > 0.
    public var frameBorderColor: String?
```

- [ ] **Step 5 : Câbler les `CodingKeys`, l'`init` mémberwise, le décodeur et l'encodeur**

`CodingKeys` (~331) — ajouter à la ligne `case fontWeight, frameShape` :

```swift
        case fontWeight, frameShape
        case framePaddingScale, frameBorderWidth, frameBorderColor
```

`init` mémberwise — ajouter les paramètres après `frameShape: String? = nil,` (~354) :

```swift
                framePaddingScale: Double? = nil,
                frameBorderWidth: Double? = nil,
                frameBorderColor: String? = nil,
```

et l'affectation après `self.fontWeight = fontWeight; self.frameShape = frameShape` (~375) :

```swift
        self.framePaddingScale = framePaddingScale
        self.frameBorderWidth = frameBorderWidth
        self.frameBorderColor = frameBorderColor
```

`init(from:)` — après `frameShape = try c.decodeIfPresent(...)` (~425) :

```swift
        framePaddingScale = try c.decodeIfPresent(Double.self, forKey: .framePaddingScale)
        frameBorderWidth = try c.decodeIfPresent(Double.self, forKey: .frameBorderWidth)
        frameBorderColor = try c.decodeIfPresent(String.self, forKey: .frameBorderColor)
```

`encode(to:)` — après `try c.encodeIfPresent(frameShape, forKey: .frameShape)` (~464) :

```swift
        try c.encodeIfPresent(framePaddingScale, forKey: .framePaddingScale)
        try c.encodeIfPresent(frameBorderWidth, forKey: .frameBorderWidth)
        try c.encodeIfPresent(frameBorderColor, forKey: .frameBorderColor)
```

- [ ] **Step 6 : Ajouter les deux propriétés calculées**

Juste après `parsedFrameShape` (~497) :

```swift
    /// Marge du cadre effectivement appliquée, bornée à 0…3. Le bornage vit
    /// ici et non dans la vue : un JSON hostile ou un curseur futur ne doivent
    /// pas pouvoir faire exploser les bounds du calque.
    public var resolvedFramePaddingScale: Double {
        min(3, max(0, framePaddingScale ?? 1))
    }

    /// Le texte porte-t-il une boîte de cadre ? Source de vérité unique,
    /// partagée par le calque, les tests et les panneaux d'outils.
    ///
    /// La boîte existe dès qu'une forme est choisie ET qu'il y a quelque chose
    /// à voir — un fond, un liseré, ou les deux. C'est ce qui détache le cadre
    /// du fond : avant, sans fond il n'y avait pas de boîte, donc choisir une
    /// forme forçait un fond noir et repeignait le texte sans qu'on l'ait
    /// demandé.
    public var hasFrameBox: Bool {
        guard parsedFrameShape != StoryTextFrameShape.none else { return false }
        if resolvedBackgroundStyle != StoryTextBackgroundStyle.none { return true }
        return (frameBorderWidth ?? 0) > 0
    }
```

- [ ] **Step 7 : Lancer le test pour vérifier qu'il passe**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshySDKTests/StoryTextFrameBoxTests
```

Attendu : SUCCÈS, 10 tests.

- [ ] **Step 8 : Faire passer la suite complète**

Ajouter `StoryTextFrameShape.none` casse tout `switch` exhaustif sur cette forme. Le compilateur les liste ; les traiter **sans changer de comportement** — `.none` se range avec `.rounded` partout à cette étape :

- `StoryTextLayer.frameCornerRadius(height:)` → `case .none, .rounded, .diamond, .cloud, .speech:`
- `StoryTextLayer.framePath(shape:in:)` → `case .none, .rounded, .pill, .rectangle: return nil`
- `StoryTextLayer.frameMetrics(...)` → ajouter `.none` au `case .rounded, .pill, .rectangle:`
- `TextEditLabels.title(for shape:)` → `case .none: return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)`
- `TextEditToolOptions.frameChipRadius(_:)` → ajouter `.none` au `case .rounded, .diamond, .cloud, .speech:`
- `StoryTextAttributeCycle.frameSymbol(_:)` → `case .none: return "square.slash"`

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS, aucune régression.

- [ ] **Step 9 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryTextFrameBoxTests.swift
git commit -m "feat(story/text): le cadre se détache du fond — aucun, marge, liseré"
```

---

### Task 2 : `StoryTextLayer` — marge réglable, liseré, boîte sans fond

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextLayerFrameGeometryTests.swift`

**Interfaces:**
- Consomme : `hasFrameBox`, `resolvedFramePaddingScale`, `frameBorderWidth`, `frameBorderColor` (Task 1).
- Produit : `StoryTextLayer.frameMetrics(shape:isFramed:textSize:oGlyphWidth:paddingScale:)` — `paddingScale` a une valeur par défaut de `1`, les appelants existants restent valides.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `StoryTextLayerFrameGeometryTests.swift`, dans la classe :

```swift
    // MARK: - Marge réglable

    /// La marge à 1 doit rendre EXACTEMENT la géométrie historique : c'est ce
    /// qui garantit qu'aucune story publiée ne bouge.
    func test_paddingScaleOfOne_reproducesTheHistoricGeometry() {
        let size = CGSize(width: 200, height: 60)
        let legacy = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: true, textSize: size, oGlyphWidth: 30)
        let explicit = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: true, textSize: size, oGlyphWidth: 30,
            paddingScale: 1)

        XCTAssertEqual(legacy.bounds, explicit.bounds)
        XCTAssertEqual(legacy.glyphRect, explicit.glyphRect)
    }

    func test_paddingScaleOfZero_hugsTheGlyphs() {
        let size = CGSize(width: 200, height: 60)
        let metrics = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: true, textSize: size, oGlyphWidth: 30,
            paddingScale: 0)

        XCTAssertEqual(metrics.bounds, size, "à marge nulle la boîte épouse le texte")
        XCTAssertEqual(metrics.glyphRect, CGRect(origin: .zero, size: size))
    }

    func test_paddingScaleGrowsBothAxesSymmetrically() {
        let size = CGSize(width: 200, height: 60)
        let single = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: true, textSize: size, oGlyphWidth: 30)
        let double = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: true, textSize: size, oGlyphWidth: 30,
            paddingScale: 2)

        XCTAssertEqual(double.bounds.width - size.width,
                       (single.bounds.width - size.width) * 2)
        XCTAssertEqual(double.bounds.height - size.height,
                       (single.bounds.height - size.height) * 2)
    }

    /// Un texte SANS boîte garde la marge de 8 px historique quelle que soit
    /// la valeur du curseur : le curseur ne règle que la boîte, et un texte nu
    /// n'en a pas.
    func test_unframedTextIgnoresThePaddingScale() {
        let size = CGSize(width: 200, height: 60)
        let scaled = StoryTextLayer.frameMetrics(
            shape: .rounded, isFramed: false, textSize: size, oGlyphWidth: 0,
            paddingScale: 3)

        XCTAssertEqual(scaled.bounds, CGSize(width: size.width + 16,
                                             height: size.height + 16))
    }

    /// La bande réservée à la queue de la bulle BD est une caractéristique de
    /// la FORME, pas une marge : elle ne doit pas suivre le curseur, sinon la
    /// queue se détache du corps.
    func test_speechTailHeightIsNotScaledByThePadding() {
        let size = CGSize(width: 200, height: 60)
        let single = StoryTextLayer.frameMetrics(
            shape: .speech, isFramed: true, textSize: size, oGlyphWidth: 30)
        let double = StoryTextLayer.frameMetrics(
            shape: .speech, isFramed: true, textSize: size, oGlyphWidth: 30,
            paddingScale: 2)

        XCTAssertEqual(double.bounds.height - single.bounds.height, 16,
                       "seule la marge double, la queue garde sa hauteur")
    }
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextLayerFrameGeometryTests
```

Attendu : ÉCHEC de compilation — `extra argument 'paddingScale' in call`.

- [ ] **Step 3 : Faire suivre la marge à `frameMetrics`**

Remplacer entièrement `frameMetrics` (~430-464) :

```swift
    nonisolated static func frameMetrics(shape: StoryTextFrameShape,
                                         isFramed: Bool,
                                         textSize: CGSize,
                                         oGlyphWidth: CGFloat,
                                         paddingScale: CGFloat = 1) -> FrameMetrics {
        let w = ceil(textSize.width)
        let h = ceil(textSize.height)
        // Un texte NU n'a pas de boîte : le curseur de marge ne le concerne
        // pas, et lui appliquer changerait la mise en page de toutes les
        // stories sans cadre.
        let scale = isFramed ? max(0, paddingScale) : 1
        let hPad = max(8, oGlyphWidth) * scale
        let vPad = 8 * scale
        guard isFramed, shape.usesCustomPath else {
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + vPad * 2),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        }
        switch shape {
        case .none, .rounded, .pill, .rectangle:
            // Couvert par le guard (usesCustomPath == false) — jamais atteint.
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + vPad * 2),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        case .diamond:
            let width = max(w * 2, w + hPad * 2)
            let height = max(h * 2, h + vPad * 2)
            return FrameMetrics(bounds: CGSize(width: width, height: height),
                                glyphRect: CGRect(x: (width - w) / 2,
                                                  y: (height - h) / 2,
                                                  width: w, height: h))
        case .speech:
            // `speechTailHeight` est une caractéristique de la forme et non une
            // marge : la faire suivre le curseur détacherait la queue du corps.
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2,
                                               height: h + vPad * 2 + speechTailHeight),
                                glyphRect: CGRect(x: hPad, y: vPad, width: w, height: h))
        case .cloud:
            let puff = cloudPuffRadius
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2 + puff * 2,
                                               height: h + vPad * 2 + puff * 2 + cloudThoughtHeight),
                                glyphRect: CGRect(x: hPad + puff, y: vPad + puff,
                                                  width: w, height: h))
        }
    }
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextLayerFrameGeometryTests
```

Attendu : SUCCÈS.

- [ ] **Step 5 : Brancher `hasFrameBox` et la marge dans `configure`**

Dans `configure`, remplacer la ligne `let isFramed = text.resolvedBackgroundStyle != .none` (~106) :

```swift
        let isFramed = text.hasFrameBox
```

et l'appel à `frameMetrics` (~157) :

```swift
        let metrics = Self.frameMetrics(shape: frameShape,
                                        isFramed: isFramed,
                                        textSize: effectiveDesignSize,
                                        oGlyphWidth: oGlyphWidth,
                                        paddingScale: CGFloat(text.resolvedFramePaddingScale))
```

et la garde du tracé path-based (~169) :

```swift
        if isFramed, frameShape.usesCustomPath {
```

reste inchangée — `isFramed` porte désormais `hasFrameBox`.

- [ ] **Step 6 : Écrire le test du liseré**

Ajouter à `StoryTextLayerFrameGeometryTests.swift` :

```swift
    // MARK: - Liseré de la boîte

    private func layer(configuredWith text: StoryTextObject) -> StoryTextLayer {
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 393, height: 699)),
                        mode: .edit)
        return layer
    }

    func test_aFrameBorderPaintsTheLayerBorder() {
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.backgroundStyle = .solid(hex: "000000")
        text.frameBorderWidth = 4
        text.frameBorderColor = "FF2E63"

        let layer = layer(configuredWith: text)

        XCTAssertGreaterThan(layer.borderWidth, 0)
        XCTAssertNotNil(layer.borderColor)
    }

    func test_noFrameBorderLeavesTheLayerBorderClear() {
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.backgroundStyle = .solid(hex: "000000")

        let layer = layer(configuredWith: text)

        XCTAssertEqual(layer.borderWidth, 0)
    }

    /// Le liseré seul, sans aucun fond : c'est le cas qui prouve que le cadre
    /// s'est bien détaché du fond.
    func test_aFrameBorderAloneWithoutAnyBackgroundStillPaints() {
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.frameBorderWidth = 3

        let layer = layer(configuredWith: text)

        XCTAssertTrue(text.hasFrameBox)
        XCTAssertGreaterThan(layer.borderWidth, 0)
    }

    func test_shapeNoneSuppressesTheBorderEvenWhenAWidthIsSet() {
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.frameShape = StoryTextFrameShape.none.rawValue
        text.backgroundStyle = .solid(hex: "000000")
        text.frameBorderWidth = 4

        let layer = layer(configuredWith: text)

        XCTAssertEqual(layer.borderWidth, 0)
    }
```

- [ ] **Step 7 : Lancer pour vérifier l'échec**

Attendu : ÉCHEC — `borderWidth` vaut 0 alors qu'on l'attend > 0.

- [ ] **Step 8 : Tracer le liseré**

Dans `applyBackgroundStyle`, remplacer le `case .none: return` (~266-267) — la forme doit pouvoir être tracée sans être remplie :

```swift
        case .none:
            // Boîte en LISERÉ SEUL : il n'y a rien à remplir, mais il y a bien
            // une forme à tracer. Les formes à coins passent par le `border`
            // du calque (posé par `applyFrameBorder`) ; les formes path-based
            // ont besoin de leur `CAShapeLayer` porteur, créé ici sans fond.
            if let framePath = pathFramePath, textObject?.hasFrameBox == true {
                let shape = CAShapeLayer()
                shape.frame = CGRect(origin: .zero, size: bounds.size)
                shape.path = framePath
                shape.fillColor = nil
                shape.zPosition = -1
                shape.contentsScale = UIScreen.main.scale
                addSublayer(shape)
                backgroundFillLayer = shape
                installGlyphSublayer(frame: pathGlyphFrame ?? bounds)
            }
            return
```

Ajouter la méthode juste après `applyBackgroundStyle` :

```swift
    /// Liseré du bord de la boîte de cadre. Les formes à coins le portent sur
    /// le `border` du calque lui-même, qui suit automatiquement le
    /// `cornerRadius` déjà posé ; les formes path-based le portent sur le
    /// `strokeColor` de leur `CAShapeLayer`, seul objet qui connaisse le tracé.
    ///
    /// Appelé APRÈS `applyBackgroundStyle` : c'est elle qui crée (ou détruit)
    /// `backgroundFillLayer`, dont dépend le choix du support.
    @MainActor
    private func applyFrameBorder(_ text: StoryTextObject, geometry: CanvasGeometry) {
        let width = text.frameBorderWidth ?? 0
        guard text.hasFrameBox, width > 0 else {
            borderWidth = 0
            borderColor = nil
            backgroundFillLayer?.strokeColor = nil
            backgroundFillLayer?.lineWidth = 0
            return
        }
        let color = parseHexColor(text.frameBorderColor ?? "FFFFFF") ?? .white
        let rendered = geometry.render(CGFloat(width))
        if let shape = backgroundFillLayer, text.parsedFrameShape.usesCustomPath {
            shape.strokeColor = color.cgColor
            shape.lineWidth = rendered
            borderWidth = 0
            borderColor = nil
        } else {
            borderWidth = rendered
            borderColor = color.cgColor
            cornerRadius = frameCornerRadius(height: bounds.height)
        }
    }
```

Enfin, appeler la méthode à la fin de `configure`, juste après `applyBackgroundStyle` (~228) :

```swift
        applyBackgroundStyle(text.resolvedBackgroundStyle, geometry: geometry)
        applyFrameBorder(text, geometry: geometry)
```

- [ ] **Step 9 : Lancer les tests du calque**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextLayerFrameGeometryTests \
  -only-testing:MeeshyUITests/StoryTextLayerSolidBackgroundTests \
  -only-testing:MeeshyUITests/StoryTextLayerGlassZOrderTests \
  -only-testing:MeeshyUITests/StoryTextLayerBorderTests
```

Attendu : SUCCÈS partout. Les deux suites `SolidBackground` et `GlassZOrder` gardent la régression « boîte noire vide » de juin — elles doivent rester vertes après le découpage de `applyBackgroundStyle`.

- [ ] **Step 10 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryTextLayerFrameGeometryTests.swift
git commit -m "feat(story/text): le calque rend la marge et le liseré du cadre"
```

---

### Task 3 : Extraire les fonds préréglés en constante partagée

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextBackgroundPresets.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift` (`backgroundOptions`, ~305-328)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/StoryTextBackgroundStyleTests.swift`

**Interfaces:**
- Consomme : rien.
- Produit : `StoryTextBackgroundPresets.all: [StoryTextBackgroundStyle]` (12 entrées, `.none` en tête) et `StoryTextBackgroundPresets.label(for:) -> String`.

Les douze fonds vivent aujourd'hui en dur dans le corps de vue de `backgroundOptions`. La rotation au tap (Task 4) doit parcourir exactement la même liste : la laisser inline garantirait qu'elles divergent au premier ajout.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `StoryTextBackgroundStyleTests.swift` :

```swift
    func test_thePresetListStartsWithNoneAndHasNoDuplicates() {
        let all = StoryTextBackgroundPresets.all

        XCTAssertEqual(all.first, StoryTextBackgroundStyle.none)
        XCTAssertEqual(all.count, 12)
        for (index, style) in all.enumerated() {
            XCTAssertFalse(all[(index + 1)...].contains(style),
                           "\(style) figure deux fois dans les préréglages")
        }
    }

    func test_everyPresetHasANonEmptyLabel() {
        for style in StoryTextBackgroundPresets.all {
            XCTAssertFalse(StoryTextBackgroundPresets.label(for: style).isEmpty)
        }
    }
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextBackgroundStyleTests
```

Attendu : ÉCHEC de compilation — `cannot find 'StoryTextBackgroundPresets' in scope`.

- [ ] **Step 3 : Créer le fichier de préréglages**

`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextBackgroundPresets.swift` :

```swift
import Foundation
import MeeshySDK

/// Les fonds de texte proposés, dans l'ordre où ils sont offerts.
///
/// Le panneau d'options ET la rotation au tap lisent cette liste : deux
/// sources séparées divergeraient au premier fond ajouté, et la rotation
/// deviendrait incapable d'atteindre une valeur que le panneau propose.
enum StoryTextBackgroundPresets {

    static let all: [StoryTextBackgroundStyle] = [
        .none,
        .glass(radius: 24),
        .solid(hex: "000000"),
        .solid(hex: "000000A6"),
        .solid(hex: "FFFFFF"),
        .solid(hex: "FFFFFFA6"),
        .solid(hex: "6366F1"),
        .solid(hex: "6366F1A6"),
        .solid(hex: "F472B6"),
        .solid(hex: "34D399"),
        .solid(hex: "FBBF24"),
        .solid(hex: "F87171")
    ]

    @MainActor
    static func label(for style: StoryTextBackgroundStyle) -> String {
        switch style {
        case .none:
            return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)
        case .glass:
            return String(localized: "story.textEdit.bg.glass", defaultValue: "Verre", bundle: .module)
        case .solid(let hex):
            return solidLabel(hex)
        }
    }

    @MainActor
    private static func solidLabel(_ hex: String) -> String {
        switch hex.uppercased() {
        case "000000":   return String(localized: "story.textEdit.bg.black", defaultValue: "Noir", bundle: .module)
        case "000000A6": return String(localized: "story.textEdit.bg.black65", defaultValue: "Noir 65%", bundle: .module)
        case "FFFFFF":   return String(localized: "story.textEdit.bg.white", defaultValue: "Blanc", bundle: .module)
        case "FFFFFFA6": return String(localized: "story.textEdit.bg.white65", defaultValue: "Blanc 65%", bundle: .module)
        case "6366F1":   return String(localized: "story.textEdit.bg.indigo", defaultValue: "Indigo", bundle: .module)
        case "6366F1A6": return String(localized: "story.textEdit.bg.indigo65", defaultValue: "Indigo 65%", bundle: .module)
        case "F472B6":   return String(localized: "story.textEdit.bg.pink", defaultValue: "Rose", bundle: .module)
        case "34D399":   return String(localized: "story.textEdit.bg.green", defaultValue: "Vert", bundle: .module)
        case "FBBF24":   return String(localized: "story.textEdit.bg.amber", defaultValue: "Ambre", bundle: .module)
        case "F87171":   return String(localized: "story.textEdit.bg.red", defaultValue: "Rouge", bundle: .module)
        default:         return hex
        }
    }
}
```

- [ ] **Step 4 : Faire consommer la liste par le panneau**

Remplacer `backgroundOptions` dans `TextEditToolOptions.swift` (~305-328) :

```swift
    private var backgroundOptions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(StoryTextBackgroundPresets.all.enumerated()), id: \.offset) { _, style in
                    backgroundChip(style)
                }
            }
        }
    }

    private func backgroundChip(_ style: StoryTextBackgroundStyle) -> some View {
        let isSel = textObject.resolvedBackgroundStyle == style
        return Button {
            textObject.backgroundStyle = style
            textObject.textBg = nil
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                if case .solid(let hex) = style {
                    Circle()
                        .fill(Color(hex: hex))
                        .frame(width: 16, height: 16)
                        .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 0.5))
                }
                Text(StoryTextBackgroundPresets.label(for: style))
                    .font(.system(size: Self.chipFontSize, weight: .semibold))
            }
            .foregroundStyle(isSel ? Color.white : Color.primary)
            .padding(.horizontal, 9)
            .frame(height: Self.chipHeight)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                : AnyShapeStyle(Color.gray.opacity(0.18)))
            )
        }
        .buttonStyle(.plain)
    }
```

Supprimer alors `bgChip`, `bgSolidChip`, `isBgNone`, `isBgGlass` et `isBgSolid(_:)`, devenus sans appelant.

- [ ] **Step 5 : Lancer les tests**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextBackgroundStyleTests
```

Attendu : SUCCÈS.

- [ ] **Step 6 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextBackgroundPresets.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Property/StoryTextBackgroundStyleTests.swift
git commit -m "refactor(story/text): les fonds préréglés deviennent une source unique"
```

---

### Task 4 : `StoryTextAttributeCycle` — les sept outils tournent

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextAttributeCycle.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryTextAttributeCycleTests.swift`

**Interfaces:**
- Consomme : `StoryTextBackgroundPresets.all` (Task 3), `StoryTextFrameShape.none` (Task 1).
- Produit :
  - `StoryTextAttributeCycle.advance(_:on:)` couvre `.style`, `.color`, `.background`, `.language` en plus des quatre existants
  - `Indicator.styledGlyph(String, style: StoryTextStyle)`
  - `Indicator.colorDot(hex: String)`
  - `Indicator.backgroundSwatch(hex: String?, isGlass: Bool)`
  - `Indicator.code(String)`
  - `StoryTextAttributeCycle.defaultFrameBorderWidth: Double = 2`

Le cas `.glyph(_, weight:)` et la rotation `.weight` restent en place à cette étape : ils ne disparaissent qu'en Task 8, quand `TextEditTool` perd le cas.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `StoryTextAttributeCycleTests.swift` :

```swift
    // MARK: - Rotations nouvellement couvertes

    func test_style_visitsEveryFamilyThenWrapsAround() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.textStyle = StoryTextStyle.bold.rawValue
        var seen: [StoryTextStyle] = []
        for _ in 0..<StoryTextStyle.allCases.count {
            StoryTextAttributeCycle.advance(.style, on: &obj)
            seen.append(obj.parsedTextStyle)
        }
        XCTAssertEqual(Set(seen), Set(StoryTextStyle.allCases))
        XCTAssertEqual(obj.parsedTextStyle, .bold, "un tour complet revient au départ")
    }

    func test_color_visitsEveryPaletteEntryThenWrapsAround() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.textColor = StoryTextColors.palette[0]
        for _ in 0..<StoryTextColors.palette.count {
            StoryTextAttributeCycle.advance(.color, on: &obj)
        }
        XCTAssertEqual(obj.textColor, StoryTextColors.palette[0])
    }

    /// La rotation doit écrire `backgroundStyle` ET purger le champ legacy
    /// `textBg` : sinon le renderer, qui préfère `backgroundStyle` mais lit
    /// encore `textBg` en repli, garderait un fond fantôme.
    func test_background_advancesAndClearsTheLegacyField() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.textBg = "123456"
        StoryTextAttributeCycle.advance(.background, on: &obj)

        XCTAssertNil(obj.textBg)
        XCTAssertEqual(obj.backgroundStyle, StoryTextBackgroundPresets.all[1])
    }

    func test_background_wrapsAroundTheWholePresetList() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.backgroundStyle = StoryTextBackgroundPresets.all[0]
        for _ in 0..<StoryTextBackgroundPresets.all.count {
            StoryTextAttributeCycle.advance(.background, on: &obj)
        }
        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundPresets.all[0])
    }

    func test_language_visitsEveryOfferedCodeThenWrapsAround() {
        let codes = TextEditToolOptions.languageChoices(current: nil)
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.sourceLanguage = codes[0]
        for _ in 0..<codes.count {
            StoryTextAttributeCycle.advance(.language, on: &obj)
        }
        XCTAssertEqual(obj.sourceLanguage, codes[0])
    }

    // MARK: - Le cadre inclut « Aucun » et ne repeint plus le texte

    func test_frame_includesNoneInTheRotation() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.frameShape = StoryTextFrameShape.speech.rawValue
        StoryTextAttributeCycle.advance(.frame, on: &obj)
        XCTAssertEqual(obj.parsedFrameShape, StoryTextFrameShape.none,
                       "après la dernière forme vient Aucun")
    }

    /// Le comportement d'avant posait un fond noir 65 % pour rendre la forme
    /// visible — ce qui recouvrait le texte sans qu'on l'ait demandé. On pose
    /// un liseré : même intention, geste non destructeur.
    func test_frame_leavingNoneLaysAThinBorderRatherThanRepaintingTheText() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.frameShape = StoryTextFrameShape.none.rawValue

        StoryTextAttributeCycle.advance(.frame, on: &obj)

        XCTAssertEqual(obj.parsedFrameShape, StoryTextFrameShape.rounded)
        XCTAssertEqual(obj.frameBorderWidth, StoryTextAttributeCycle.defaultFrameBorderWidth)
        XCTAssertEqual(obj.frameBorderColor, "FFFFFF")
        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundStyle.none,
                       "le fond du texte n'est pas touché")
    }

    func test_frame_keepsAnExistingBackgroundAndAddsNoBorder() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.frameShape = StoryTextFrameShape.none.rawValue
        obj.backgroundStyle = .solid(hex: "6366F1")

        StoryTextAttributeCycle.advance(.frame, on: &obj)

        XCTAssertEqual(obj.resolvedBackgroundStyle, StoryTextBackgroundStyle.solid(hex: "6366F1"))
        XCTAssertNil(obj.frameBorderWidth, "un fond suffit déjà à rendre la forme visible")
    }

    // MARK: - Indicateurs

    func test_indicator_forStyle_showsTheCurrentFamily() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.textStyle = StoryTextStyle.neon.rawValue
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.style, of: obj),
                       .styledGlyph("Aa", style: .neon))
    }

    func test_indicator_forColor_showsTheCurrentSwatch() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.textColor = "FF2E63"
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.color, of: obj),
                       .colorDot(hex: "FF2E63"))
    }

    func test_indicator_forBackground_distinguishesNoneGlassAndSolid() {
        var obj = StoryTextObject(id: "t1", text: "X")

        obj.backgroundStyle = StoryTextBackgroundStyle.none
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: nil, isGlass: false))

        obj.backgroundStyle = .glass(radius: 24)
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: nil, isGlass: true))

        obj.backgroundStyle = .solid(hex: "34D399")
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.background, of: obj),
                       .backgroundSwatch(hex: "34D399", isGlass: false))
    }

    func test_indicator_forLanguage_showsTheUppercasedCode() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.sourceLanguage = "pt-BR"
        XCTAssertEqual(StoryTextAttributeCycle.indicator(.language, of: obj),
                       .code("PT"))
    }
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextAttributeCycleTests
```

Attendu : ÉCHEC de compilation — `type 'StoryTextAttributeCycle.Indicator' has no member 'styledGlyph'` et consorts.

- [ ] **Step 3 : Étendre l'énuméré `Indicator`**

Dans `StoryTextAttributeCycle.swift`, remplacer `Indicator` (~16-22) :

```swift
    /// Ce qu'affiche une bulle pour son attribut. Chaque bulle rend l'état
    /// COURANT et non un pictogramme figé : c'est ce qui rend le tap-pour-
    /// tourner utilisable — sans lui, parcourir quatorze couleurs se ferait à
    /// l'aveugle.
    enum Indicator: Equatable, Sendable {
        /// Symbole SF reflétant la valeur courante. `emphasis` (0…4) rend une
        /// intensité — seul le contour s'en sert, pour montrer son épaisseur.
        case symbol(name: String, emphasis: Int)
        /// Lettre témoin rendue dans la graisse courante (bouton Graisse).
        case glyph(String, weight: StoryTextWeight)
        /// Lettre témoin rendue dans la POLICE courante (bouton Police).
        case styledGlyph(String, style: StoryTextStyle)
        /// Pastille pleine de la couleur courante (bouton Couleur).
        case colorDot(hex: String)
        /// Fond courant : `hex == nil && !isGlass` ⇒ aucun fond.
        case backgroundSwatch(hex: String?, isGlass: Bool)
        /// Code de langue en capitales (bouton Langue).
        case code(String)
    }
```

- [ ] **Step 4 : Ajouter la constante et les quatre rotations**

Ajouter la constante à côté de `defaultBorderColor` (~43) :

```swift
    /// Liseré posé quand une forme de cadre est choisie sans rien à voir. Le
    /// code posait auparavant un fond noir 65 %, qui recouvrait le texte.
    static let defaultFrameBorderWidth: Double = 2
    static let defaultFrameBorderColor = "FFFFFF"
```

Remplacer `advance` (~47-56) :

```swift
    static func advance(_ tool: TextEditTool, on text: inout StoryTextObject) {
        switch tool {
        case .weight:     advanceWeight(on: &text)
        case .align:      advanceAlign(on: &text)
        case .border:     advanceBorder(on: &text)
        case .frame:      advanceFrame(on: &text)
        case .style:      advanceStyle(on: &text)
        case .color:      advanceColor(on: &text)
        case .background: advanceBackground(on: &text)
        case .language:   advanceLanguage(on: &text)
        case .size:       break
        }
    }

    private static func advanceStyle(on text: inout StoryTextObject) {
        let steps = StoryTextStyle.allCases
        let index = steps.firstIndex(of: text.parsedTextStyle) ?? 0
        text.textStyle = steps[(index + 1) % steps.count].rawValue
    }

    private static func advanceColor(on text: inout StoryTextObject) {
        let steps = StoryTextColors.palette
        let current = text.textColor ?? steps[0]
        let index = steps.firstIndex(where: { $0.caseInsensitiveCompare(current) == .orderedSame }) ?? 0
        text.textColor = steps[(index + 1) % steps.count]
    }

    /// Purge `textBg` en même temps : le renderer préfère `backgroundStyle`
    /// mais retombe encore sur ce champ legacy, qui laisserait sinon un fond
    /// fantôme derrière un `.none` fraîchement choisi.
    private static func advanceBackground(on text: inout StoryTextObject) {
        let steps = StoryTextBackgroundPresets.all
        let index = steps.firstIndex(of: text.resolvedBackgroundStyle) ?? 0
        text.backgroundStyle = steps[(index + 1) % steps.count]
        text.textBg = nil
    }

    private static func advanceLanguage(on text: inout StoryTextObject) {
        let steps = TextEditToolOptions.languageChoices(current: text.sourceLanguage)
        let current = TextEditToolOptions.normalisedCode(text.sourceLanguage) ?? steps[0]
        let index = steps.firstIndex(of: current) ?? 0
        text.sourceLanguage = steps[(index + 1) % steps.count]
    }
```

Remplacer `advanceFrame` (~82-90) :

```swift
    /// Le cadre inclut « Aucun » dans sa rotation. Quitter « Aucun » pose un
    /// LISERÉ, pas un fond : la version précédente peignait un noir 65 % pour
    /// rendre la forme visible, ce qui recouvrait le texte de l'auteur sans
    /// qu'il l'ait demandé.
    private static func advanceFrame(on text: inout StoryTextObject) {
        let steps = StoryTextFrameShape.allCases
        let index = steps.firstIndex(of: text.parsedFrameShape) ?? 0
        text.frameShape = steps[(index + 1) % steps.count].rawValue
        guard text.parsedFrameShape != StoryTextFrameShape.none,
              text.resolvedBackgroundStyle == StoryTextBackgroundStyle.none,
              (text.frameBorderWidth ?? 0) == 0 else { return }
        text.frameBorderWidth = defaultFrameBorderWidth
        text.frameBorderColor = defaultFrameBorderColor
    }
```

- [ ] **Step 5 : Étendre `indicator`**

Remplacer `indicator` (~94-109) :

```swift
    static func indicator(_ tool: TextEditTool, of text: StoryTextObject) -> Indicator {
        switch tool {
        case .weight:
            return .glyph("A", weight: text.parsedFontWeight ?? defaultWeight)
        case .style:
            return .styledGlyph("Aa", style: text.parsedTextStyle)
        case .color:
            return .colorDot(hex: text.textColor ?? "FFFFFF")
        case .background:
            switch text.resolvedBackgroundStyle {
            case .none:            return .backgroundSwatch(hex: nil, isGlass: false)
            case .glass:           return .backgroundSwatch(hex: nil, isGlass: true)
            case .solid(let hex):  return .backgroundSwatch(hex: hex, isGlass: false)
            }
        case .language:
            let code = TextEditToolOptions.normalisedCode(text.sourceLanguage)
                ?? TextEditToolOptions.languageChoices(current: nil)[0]
            return .code(code.uppercased())
        case .align:
            return .symbol(name: alignSymbol(text.textAlign ?? defaultAlign), emphasis: 0)
        case .frame:
            return .symbol(name: frameSymbol(text.parsedFrameShape), emphasis: 0)
        case .border:
            let width = text.borderWidth ?? 0
            guard width > 0 else { return .symbol(name: "square.dashed", emphasis: 0) }
            return .symbol(name: "square", emphasis: borderEmphasis(width))
        case .size:
            return .symbol(name: tool.sfSymbol, emphasis: 0)
        }
    }
```

- [ ] **Step 6 : Lancer les tests pour vérifier qu'ils passent**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryTextAttributeCycleTests
```

Attendu : SUCCÈS. `test_frame_*` de l'ancienne suite qui affirmaient la pose d'un fond implicite doivent être supprimés — la règle a changé, c'est le sens de ce travail. Supprimer aussi la constante `implicitFrameBackground`, sans appelant.

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextAttributeCycle.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryTextAttributeCycleTests.swift
git commit -m "feat(story/text): les sept attributs tournent au tap, le cadre ne repeint plus"
```

---

### Task 5 : La rangée basse cycle au tap et ouvre à l'appui long

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditTopBar.swift` (`CycleButtonAccessibility` devient partagé)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift` (câblage du binding)

**Interfaces:**
- Consomme : `StoryTextAttributeCycle.advance/indicator` et les nouveaux cas d'`Indicator` (Task 4).
- Produit : `TextEditFloatingBubbles(textObject:expandedTool:onOpenPanel:)` — la closure `onSelectTool` est remplacée par `onOpenPanel`, appelée au seul appui long.

- [ ] **Step 1 : Rendre `CycleButtonAccessibility` partageable**

Dans `StoryTextEditTopBar.swift`, retirer le mot-clé `private` de la déclaration (~141) :

```swift
struct CycleButtonAccessibility: ViewModifier {
```

- [ ] **Step 2 : Réécrire `TextEditFloatingBubbles`**

Remplacer intégralement le fichier :

```swift
import SwiftUI
import MeeshySDK

/// Rangée unique d'outils de texte, posée au-dessus du clavier.
///
/// Un tap fait tourner la valeur d'un cran et la rend immédiatement ; un appui
/// long ouvre le panneau complet. Le geste est le même sur les sept outils :
/// la répartition précédente en deux rangées — attributs cyclables en haut,
/// ouvre-panneaux en bas — obligeait à retenir quel outil habitait quelle
/// rangée pour deux gestes différents.
///
/// Chaque bulle rend son état COURANT plutôt qu'un pictogramme figé, sans quoi
/// parcourir quatorze couleurs au tap se ferait à l'aveugle.
///
/// Icônes flottantes SANS arrière-plan explicite (directive user 2026-07-10) :
/// même langage que les actions du header — `glassControlForeground` +
/// `adaptiveGlass`, l'outil dont le panneau est ouvert passant en verre
/// proéminent teinté.
struct TextEditFloatingBubbles: View {
    @Binding var textObject: StoryTextObject
    let expandedTool: TextEditTool?
    let onOpenPanel: (TextEditTool) -> Void

    var body: some View {
        // Sept bulles tiennent sur l'écran le plus étroit supporté (300 pt
        // demandés pour 343 disponibles). Le défilement est un filet : il
        // garantit qu'un huitième outil déborde VISIBLEMENT au lieu de se
        // faire couper en silence, ce qui est le défaut qui avait imposé la
        // séparation en deux rangées.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TextEditToolbarMetrics.spacing) {
                ForEach(TextEditTool.bottomTools, id: \.self) { tool in
                    bubble(tool)
                }
            }
        }
    }

    private func bubble(_ tool: TextEditTool) -> some View {
        let isActive = expandedTool == tool
        return indicatorView(for: tool)
            .frame(width: TextEditToolbarMetrics.bubbleSize,
                   height: TextEditToolbarMetrics.bubbleSize)
            .modifier(BubbleGlass(isActive: isActive))
            .contentShape(Circle())
            .onTapGesture {
                StoryTextAttributeCycle.advance(tool, on: &textObject)
                HapticFeedback.light()
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onOpenPanel(tool)
            }
            .modifier(CycleButtonAccessibility(
                label: tool.accessibilityLabel,
                value: StoryTextEditTopBar.spokenValue(tool, of: textObject),
                onOpenPanel: { onOpenPanel(tool) }))
    }

    @ViewBuilder
    private func indicatorView(for tool: TextEditTool) -> some View {
        switch StoryTextAttributeCycle.indicator(tool, of: textObject) {
        case .glyph(let letter, let weight):
            Text(letter)
                .font(.system(size: 17, weight: weight.swiftUIWeight))
                .glassControlForeground()
        case .styledGlyph(let letter, let style):
            Text(letter)
                .font(storyFont(for: style, size: 15))
                .glassControlForeground()
        case .colorDot(let hex):
            Circle()
                .fill(Color(hex: hex))
                .frame(width: 18, height: 18)
                .overlay(Circle().stroke(Color.white.opacity(0.6), lineWidth: 1))
        case .backgroundSwatch(let hex, let isGlass):
            backgroundSwatch(hex: hex, isGlass: isGlass)
        case .code(let code):
            Text(code)
                .font(.system(size: 12, weight: .bold))
                .glassControlForeground()
        case .symbol(let name, let emphasis):
            Image(systemName: name)
                .font(.system(size: 14, weight: StoryTextEditTopBar.strokeWeight(emphasis)))
                .glassControlForeground()
        }
    }

    @ViewBuilder
    private func backgroundSwatch(hex: String?, isGlass: Bool) -> some View {
        if let hex {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(Color(hex: hex))
                .frame(width: 18, height: 18)
                .overlay(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(Color.white.opacity(0.6), lineWidth: 1))
        } else {
            Image(systemName: isGlass ? "square.on.square.dashed" : "square.slash")
                .font(.system(size: 14, weight: .semibold))
                .glassControlForeground()
        }
    }
}

/// Le verre de la bulle. Extrait en `ViewModifier` : la branche ternaire
/// posée en ligne dans `bubble` faisait dépasser le vérificateur de types de
/// son budget de temps — même cause que `CycleButtonAccessibility`.
private struct BubbleGlass: ViewModifier {
    let isActive: Bool

    func body(content: Content) -> some View {
        if isActive {
            content.adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.brandPrimary)
        } else {
            content.adaptiveGlass(in: Circle())
        }
    }
}
```

- [ ] **Step 3 : Câbler le binding dans `StoryTextEditToolbar`**

Dans `StoryTextEditToolbar.swift`, remplacer l'appel dans `bottomRow` (~63-69) :

```swift
                TextEditFloatingBubbles(
                    textObject: binding,
                    expandedTool: expandedTool,
                    onOpenPanel: { tool in
                        viewModel.setExpandedTool(expandedTool == tool ? nil : tool)
                    }
                )
```

- [ ] **Step 4 : Compiler l'app et le bundle de tests**

```
./apps/ios/meeshy.sh build
xcodebuild build-for-testing -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS des deux.

- [ ] **Step 5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditTopBar.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift
git commit -m "feat(story/text): la rangée basse tourne au tap, ouvre à l'appui long"
```

---

### Task 6 : Panneau Police — curseurs de taille et de graisse

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift` (`styleOptions`, ~89-112)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/TextEditToolOptionsSizeTests.swift`

**Interfaces:**
- Consomme : `TextEditToolOptions.displayedSize(for:)` et `applyingSliderValue(_:to:)`, inchangés.
- Produit : `TextEditToolOptions.weightSliderValue(for:) -> Double` et `applyingWeightSliderValue(_:to:)` — conversion entre le rang du curseur (0…3) et `StoryTextWeight`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `TextEditToolOptionsSizeTests.swift` :

```swift
    // MARK: - Curseur de graisse

    func test_weightSlider_readsTheCurrentWeightAsARank() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.fontWeight = StoryTextWeight.bold.rawValue
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 3)

        obj.fontWeight = StoryTextWeight.thin.rawValue
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 0)
    }

    /// Aucune graisse posée ⇒ le curseur part de « normal », la même valeur
    /// que celle lue partout ailleurs. Sans ce repli il démarrerait à « fin »
    /// et le premier drag épaissirait un texte que l'auteur n'a pas touché.
    func test_weightSlider_whenUnset_readsNormal() {
        let obj = StoryTextObject(id: "t1", text: "X")
        XCTAssertEqual(TextEditToolOptions.weightSliderValue(for: obj), 1)
    }

    func test_weightSlider_writesTheMatchingWeight() {
        var obj = StoryTextObject(id: "t1", text: "X")
        TextEditToolOptions.applyingWeightSliderValue(2, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .semibold)
    }

    func test_weightSlider_clampsOutOfRangeRanks() {
        var obj = StoryTextObject(id: "t1", text: "X")
        TextEditToolOptions.applyingWeightSliderValue(-4, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .thin)
        TextEditToolOptions.applyingWeightSliderValue(99, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .bold)
    }
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolOptionsSizeTests
```

Attendu : ÉCHEC de compilation — `type 'TextEditToolOptions' has no member 'weightSliderValue'`.

- [ ] **Step 3 : Ajouter les deux helpers**

Dans `TextEditToolOptions.swift`, juste après `applyingSliderValue(_:to:)` (~207) :

```swift
    /// Rang du curseur de graisse (0…3) pour l'état courant. `nil` se lit
    /// « normal » — la même valeur de repli que partout ailleurs — sinon le
    /// curseur démarrerait à « fin » et le premier drag épaissirait un texte
    /// que l'auteur n'a pas touché.
    nonisolated static func weightSliderValue(for text: StoryTextObject) -> Double {
        let weight = text.parsedFontWeight ?? .normal
        return Double(StoryTextWeight.allCases.firstIndex(of: weight) ?? 1)
    }

    /// Écrit la graisse correspondant à un rang de curseur, borné à la plage
    /// réelle de l'énuméré.
    nonisolated static func applyingWeightSliderValue(_ value: Double,
                                                      to text: inout StoryTextObject) {
        let steps = StoryTextWeight.allCases
        let index = min(steps.count - 1, max(0, Int(value.rounded())))
        text.fontWeight = steps[index].rawValue
    }
```

- [ ] **Step 4 : Lancer pour vérifier que ça passe**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolOptionsSizeTests
```

Attendu : SUCCÈS.

- [ ] **Step 4b : Verrouiller le rendu live des deux curseurs**

Le champ d'édition en place (`StoryInlineTextEditor`) peint les glyphes pendant la
frappe : c'est LUI qui doit refléter taille et graisse, pas seulement le calque en
dessous. Rien dans le système de types ne garantit cette propriété.

Ajouter à `packages/MeeshySDK/Tests/MeeshyUITests/Story/Canvas/StoryInlineTextEditorTests.swift` :

```swift
    // MARK: - Rendu live des curseurs du panneau Police

    func test_theInlineEditorReflectsAWeightChangeWithoutRetyping() {
        let editor = StoryInlineTextEditor()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))
        var text = StoryTextObject(id: "t1", text: "Bonjour")

        text.fontWeight = StoryTextWeight.thin.rawValue
        editor.apply(textObject: text, geometry: geometry, setText: true)
        let thin = editor.font

        text.fontWeight = StoryTextWeight.bold.rawValue
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertNotEqual(editor.font, thin, "le champ doit re-résoudre sa police")
    }

    func test_theInlineEditorReflectsASizeChangeWithoutRetyping() {
        let editor = StoryInlineTextEditor()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))
        var text = StoryTextObject(id: "t1", text: "Bonjour")

        text.fontSize = 40
        editor.apply(textObject: text, geometry: geometry, setText: true)
        let small = editor.font?.pointSize ?? 0

        text.fontSize = 120
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertGreaterThan(editor.font?.pointSize ?? 0, small)
    }

    /// Le curseur de taille écrit `fontSize` ET remet `scale` à 1 : le champ
    /// lit le PRODUIT des deux, donc un `scale` résiduel gonflerait le rendu
    /// au-delà de la valeur affichée par le curseur.
    func test_theInlineEditorReadsTheProductOfSizeAndScale() {
        let editor = StoryInlineTextEditor()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))
        var text = StoryTextObject(id: "t1", text: "Bonjour")
        text.fontSize = 50
        text.scale = 2

        editor.apply(textObject: text, geometry: geometry, setText: true)
        let doubled = editor.font?.pointSize ?? 0

        TextEditToolOptions.applyingSliderValue(50, to: &text)
        editor.apply(textObject: text, geometry: geometry, setText: false)

        XCTAssertEqual(text.scale, 1)
        XCTAssertLessThan(editor.font?.pointSize ?? 0, doubled)
    }
```

Lancer :

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryInlineTextEditorTests
```

Attendu : SUCCÈS — ces tests passent sans changer le code de production (`resolveFont(forTextObject:size:)` honore déjà les deux). Ils existent pour qu'une refonte future du champ ne casse pas le rendu live en silence.

- [ ] **Step 5 : Poser les deux curseurs au-dessus de la liste de polices**

Remplacer `styleOptions` (~89-112) :

```swift
    /// Taille et graisse coiffent la liste des polices : ce sont des valeurs
    /// continues, elles se règlent là où on choisit la famille plutôt que
    /// derrière une bulle chacune.
    private var styleOptions: some View {
        VStack(spacing: 10) {
            sizeSlider
            weightSlider
            styleFamilyRow
        }
    }

    private var sizeSlider: some View {
        HStack(spacing: 10) {
            Image(systemName: "textformat.size.smaller")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { Self.displayedSize(for: textObject) },
                    set: { Self.applyingSliderValue($0, to: &textObject) }
                ),
                in: 14...160, step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "textformat.size.larger")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
            Text("\(Int(Self.displayedSize(for: textObject)))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    private var weightSlider: some View {
        HStack(spacing: 10) {
            Text("A")
                .font(.system(size: 13, weight: .thin))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { Self.weightSliderValue(for: textObject) },
                    set: { Self.applyingWeightSliderValue($0, to: &textObject) }
                ),
                in: 0...Double(StoryTextWeight.allCases.count - 1), step: 1
            )
            .tint(MeeshyColors.brandPrimary)
            Text("A")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.secondary)
            Text(TextEditLabels.title(for: textObject.parsedFontWeight ?? .normal))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 52)
        }
    }

    private var styleFamilyRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    let isSel = textObject.parsedTextStyle == style
                    Button {
                        textObject.textStyle = style.rawValue
                        HapticFeedback.light()
                    } label: {
                        Text("Aa")
                            .font(storyFont(for: style, size: 17))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .frame(width: Self.chipMinWidth, height: Self.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
```

- [ ] **Step 6 : Compiler et lancer la suite complète**

```
./apps/ios/meeshy.sh build
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS.

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/TextEditToolOptionsSizeTests.swift
git commit -m "feat(story/text): taille et graisse deviennent des curseurs du panneau Police"
```

---

### Task 7 : Panneau Cadre — Aucun, marge, liseré

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift` (`frameOptions`, ~334-377 ; `onAppear`, ~76-84)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/TextEditToolOptionsBorderTests.swift`

**Interfaces:**
- Consomme : `framePaddingScale`, `frameBorderWidth`, `frameBorderColor`, `hasFrameBox` (Task 1) ; `defaultFrameBorderWidth` (Task 4).
- Produit : `TextEditToolOptions.initializeFrameDefaultsIfNeutral(on:)`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `TextEditToolOptionsBorderTests.swift` :

```swift
    // MARK: - Cadre

    /// Ouvrir le panneau Cadre sur un texte qui n'a ni fond ni liseré doit
    /// donner un retour visuel immédiat — sinon les sept formes se choisissent
    /// sans que rien ne change à l'écran.
    func test_openingTheFramePanelOnANeutralTextLaysAThinBorder() {
        var obj = StoryTextObject(id: "t1", text: "X")
        TextEditToolOptions.initializeFrameDefaultsIfNeutral(on: &obj)

        XCTAssertEqual(obj.frameBorderWidth, StoryTextAttributeCycle.defaultFrameBorderWidth)
        XCTAssertEqual(obj.frameBorderColor, "FFFFFF")
    }

    /// Un texte qui a DÉJÀ un fond n'a besoin de rien : lui poser un liseré
    /// changerait son apparence au seul fait de regarder ses options.
    func test_openingTheFramePanelLeavesATextWithABackgroundUntouched() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.backgroundStyle = .solid(hex: "6366F1")
        TextEditToolOptions.initializeFrameDefaultsIfNeutral(on: &obj)

        XCTAssertNil(obj.frameBorderWidth)
    }

    /// « Aucun » est un choix de l'auteur : le panneau ne doit pas le défaire
    /// en lui reposant un liseré à la réouverture.
    func test_openingTheFramePanelRespectsAnExplicitNone() {
        var obj = StoryTextObject(id: "t1", text: "X")
        obj.frameShape = StoryTextFrameShape.none.rawValue
        TextEditToolOptions.initializeFrameDefaultsIfNeutral(on: &obj)

        XCTAssertNil(obj.frameBorderWidth)
    }
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolOptionsBorderTests
```

Attendu : ÉCHEC de compilation — `type 'TextEditToolOptions' has no member 'initializeFrameDefaultsIfNeutral'`.

- [ ] **Step 3 : Ajouter l'amorçage**

Dans `TextEditToolOptions.swift`, juste après `initializeBorderDefaultsIfNeutral` (~449) :

```swift
    /// Pose un liseré discret quand le panneau Cadre s'ouvre sur un texte qui
    /// n'a rien à montrer — ni fond, ni liseré. Sans ça, les sept formes se
    /// choisissent sans qu'aucune ne se voie.
    ///
    /// Ne touche pas un texte qui a déjà un fond (la forme y est visible), ni
    /// un texte dont l'auteur a explicitement choisi « Aucun ».
    static func initializeFrameDefaultsIfNeutral(on obj: inout StoryTextObject) {
        guard obj.parsedFrameShape != StoryTextFrameShape.none,
              obj.resolvedBackgroundStyle == StoryTextBackgroundStyle.none,
              (obj.frameBorderWidth ?? 0) == 0 else { return }
        obj.frameBorderWidth = StoryTextAttributeCycle.defaultFrameBorderWidth
        obj.frameBorderColor = StoryTextAttributeCycle.defaultFrameBorderColor
    }
```

Étendre le `.onAppear` du corps (~76-84) :

```swift
        .onAppear {
            var local = textObject
            if tool == .border { Self.initializeBorderDefaultsIfNeutral(on: &local) }
            if tool == .frame { Self.initializeFrameDefaultsIfNeutral(on: &local) }
            if local.borderColor != textObject.borderColor
                || local.borderWidth != textObject.borderWidth
                || local.frameBorderColor != textObject.frameBorderColor
                || local.frameBorderWidth != textObject.frameBorderWidth {
                textObject = local
            }
        }
```

- [ ] **Step 4 : Lancer pour vérifier que ça passe**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolOptionsBorderTests
```

Attendu : SUCCÈS.

- [ ] **Step 5 : Réécrire le panneau Cadre**

Remplacer `frameOptions` (~334-366) — le `frameChipRadius` reste inchangé :

```swift
    /// Forme, marge et liseré de la boîte de cadre. La forme est indépendante
    /// du fond depuis que `hasFrameBox` existe : choisir un cadre ne repeint
    /// plus le texte d'un fond noir non demandé.
    private var frameOptions: some View {
        VStack(spacing: 10) {
            frameShapeRow
            framePaddingSlider
            frameBorderSlider
            frameBorderPalette
        }
    }

    private var frameShapeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextFrameShape.allCases, id: \.self) { shape in
                    let isSel = textObject.parsedFrameShape == shape
                    Button {
                        textObject.frameShape = shape.rawValue
                        var local = textObject
                        Self.initializeFrameDefaultsIfNeutral(on: &local)
                        textObject = local
                        HapticFeedback.light()
                    } label: {
                        Text(TextEditLabels.title(for: shape))
                            .font(.system(size: Self.chipFontSize, weight: .semibold))
                            .foregroundStyle(isSel ? Color.white : Color.primary)
                            .padding(.horizontal, 10)
                            .frame(height: Self.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: frameChipRadius(shape))
                                    .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                                : AnyShapeStyle(Color.gray.opacity(0.18)))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    /// Marge exprimée en MULTIPLICATEUR : la marge automatique vaut « au moins
    /// la chasse d'un *o* », elle dépend donc de la police et de la taille.
    /// Un réglage en points deviendrait faux au premier changement de l'une
    /// des deux.
    private var framePaddingSlider: some View {
        HStack(spacing: 10) {
            Image(systemName: "rectangle.compress.vertical")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { textObject.resolvedFramePaddingScale },
                    set: { textObject.framePaddingScale = $0 }
                ),
                in: 0...3, step: 0.1
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "rectangle.expand.vertical")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Text("×\(String(format: "%.1f", textObject.resolvedFramePaddingScale))")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 40)
        }
    }

    /// Liseré à 0 ⇒ aucun trait rendu. La couleur est conservée pour qu'on
    /// puisse remonter le curseur sans avoir à la re-choisir — même règle que
    /// le contour de glyphes.
    private var frameBorderSlider: some View {
        HStack(spacing: 10) {
            Image(systemName: "square.dashed")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            Slider(
                value: Binding(
                    get: { textObject.frameBorderWidth ?? 0 },
                    set: { newValue in
                        textObject.frameBorderWidth = newValue
                        if textObject.frameBorderColor == nil {
                            textObject.frameBorderColor = StoryTextAttributeCycle.defaultFrameBorderColor
                        }
                    }
                ),
                in: 0...12, step: 0.5
            )
            .tint(MeeshyColors.brandPrimary)
            Image(systemName: "square")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.secondary)
            Text(String(format: "%.1f", textObject.frameBorderWidth ?? 0))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 34)
        }
    }

    private var frameBorderPalette: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(StoryTextColors.palette, id: \.self) { hex in
                    let isSel = textObject.frameBorderColor?.caseInsensitiveCompare(hex) == .orderedSame
                    Button {
                        textObject.frameBorderColor = hex
                        if (textObject.frameBorderWidth ?? 0) == 0 {
                            textObject.frameBorderWidth = StoryTextAttributeCycle.defaultFrameBorderWidth
                        }
                        HapticFeedback.light()
                    } label: {
                        colorDot(hex: hex, selected: isSel, size: 28)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
        }
    }
```

- [ ] **Step 6 : Compiler et lancer la suite complète**

```
./apps/ios/meeshy.sh build
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS.

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/TextEditToolOptionsBorderTests.swift
git commit -m "feat(story/text): le panneau Cadre gagne Aucun, une marge et un liseré"
```

---

### Task 8 : La bascule — `TextEditTool` à sept, « Terminé » seul en haut

C'est la tâche où l'ancienne répartition disparaît. Le compilateur énumère les sites : `TextEditTool` perdant deux cas, tout `switch` exhaustif casse.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+TextEditing.swift` (~13-79)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditTopBar.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextAttributeCycle.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/TextEditToolbarLayoutTests.swift`

**Interfaces:**
- Produit : `TextEditTool.all: [TextEditTool]` (7 entrées, dans l'ordre d'affichage). `topTools`, `bottomTools` et `isCyclable` n'existent plus.

- [ ] **Step 1 : Réécrire les tests de disposition**

Remplacer intégralement `TextEditToolbarLayoutTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La barre d'outils du texte s'est un jour retrouvée à demander 432 pt sur un
/// écran qui en offre 361 : la première bulle et le bouton de sortie sortaient
/// de l'écran, sans scroll ni indice — le seul chemin de sortie explicite était
/// coupé en deux. La réponse d'alors fut de séparer en deux rangées ; celle
/// d'aujourd'hui est de retirer deux outils devenus des curseurs.
///
/// Ces tests tiennent le budget de largeur, pour que la troncature silencieuse
/// ne puisse pas revenir.
final class TextEditToolbarLayoutTests: XCTestCase {

    // MARK: - Composition

    func test_theRowCoversEveryToolExactlyOnce() {
        XCTAssertEqual(Set(TextEditTool.all), Set(TextEditTool.allCases))
        XCTAssertEqual(TextEditTool.all.count, TextEditTool.allCases.count,
                       "aucun doublon dans la rangée")
    }

    func test_theRowCarriesSevenTools() {
        XCTAssertEqual(TextEditTool.all.count, 7)
    }

    /// Taille et graisse sont des valeurs continues : elles vivent en curseurs
    /// dans le panneau Police, pas derrière une bulle. Ce test échoue si
    /// quelqu'un les réintroduit comme outils.
    func test_sizeAndWeightAreNotToolsAnyMore() {
        let names = TextEditTool.allCases.map(\.rawValue)
        XCTAssertFalse(names.contains("size"))
        XCTAssertFalse(names.contains("weight"))
    }

    // MARK: - Budget de largeur

    func test_theRowFitsOnTheNarrowestSupportedScreen() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.all.count,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "les sept bulles doivent tenir sur un iPhone SE")
    }

    /// La rangée haute ne porte plus que « Terminé » : elle tient par
    /// construction, mais la garde reste utile si quelqu'un y remet des outils.
    func test_theTopRowCarriesOnlyTheFinishButton() {
        XCTAssertTrue(
            TextEditToolbarMetrics.fits(
                bubbleCount: 0,
                trailing: TextEditToolbarMetrics.finishControlWidth,
                in: TextEditToolbarMetrics.narrowestUsableWidth))
    }

    /// La garde qui compte : une bulle de plus et la rangée déborde sur le
    /// plus étroit des écrans supportés. Le `ScrollView` la rend visible au
    /// lieu de la couper, mais ce test rappelle que le budget est atteint.
    func test_oneMoreBubbleWouldOverflowTheNarrowestScreen() {
        XCTAssertFalse(
            TextEditToolbarMetrics.fits(
                bubbleCount: TextEditTool.all.count + 1,
                in: TextEditToolbarMetrics.narrowestUsableWidth),
            "huit bulles ne tiennent plus sur un iPhone SE")
    }

    func test_requiredWidth_countsBubblesAndTheGapsBetweenThem() {
        let bubble = TextEditToolbarMetrics.bubbleSize
        let gap = TextEditToolbarMetrics.spacing
        let fiveBubbles: CGFloat = 5 * bubble + 4 * gap

        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 1), bubble)
        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 5), fiveBubbles)
        XCTAssertEqual(TextEditToolbarMetrics.requiredWidth(bubbleCount: 0), 0,
                       "une rangée vide n'occupe rien")
    }

    func test_requiredWidth_reservesTheGapBeforeATrailingControl() {
        let bubble = TextEditToolbarMetrics.bubbleSize
        let gap = TextEditToolbarMetrics.spacing
        let trailing: CGFloat = 100
        let expected: CGFloat = 4 * bubble + 3 * gap + gap + trailing

        XCTAssertEqual(
            TextEditToolbarMetrics.requiredWidth(bubbleCount: 4, trailing: trailing),
            expected)
    }
}
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/TextEditToolbarLayoutTests
```

Attendu : ÉCHEC de compilation — `type 'TextEditTool' has no member 'all'`.

- [ ] **Step 3 : Réduire `TextEditTool` à sept cas**

Dans `StoryComposerViewModel+TextEditing.swift`, remplacer l'énuméré (~13-79) :

```swift
/// Les outils de texte exposés en mode édition flottante, dans leur ordre
/// d'affichage sur la rangée.
///
/// Taille et graisse n'y figurent pas : ce sont des valeurs continues, réglées
/// par curseur dans le panneau Police. Les loger derrière une bulle chacune
/// coûtait deux places sur une rangée dont la largeur est comptée.
///
/// `nonisolated` sur le TYPE : le package pose `.defaultIsolation(MainActor
/// .self)` (SE-0466), qui isolerait cet énuméré sur le main actor et le
/// rendrait illisible depuis les helpers purs (`StoryTextAttributeCycle`) et
/// depuis un test non isolé. Une annotation par membre ne suffit pas.
public nonisolated enum TextEditTool: String, CaseIterable, Sendable, Equatable {
    case style
    case color
    case align
    case background
    case frame
    case border
    /// Langue dans laquelle le texte est ÉCRIT. Réglable ici, à côté des
    /// attributs visuels, parce qu'une langue source fausse ne se voit PAS à
    /// l'écriture — elle ne se paie qu'à la traduction (directive user
    /// 2026-07-25).
    case language

    /// L'ordre d'affichage de la rangée. Distinct de `allCases` pour que
    /// réordonner l'interface ne demande pas de réordonner l'énuméré, dont
    /// l'ordre des `case` porte aussi la sérialisation.
    static let all: [TextEditTool] = [.style, .color, .align, .background, .frame, .border, .language]

    var sfSymbol: String {
        switch self {
        case .style:      return "textformat"
        case .color:      return "paintpalette.fill"
        case .align:      return "text.alignleft"
        case .background: return "a.square.fill"
        case .frame:      return "rectangle.roundedtop"
        case .border:     return "square"
        case .language:   return "globe"
        }
    }

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`, généré par
    /// SPM sans annotation, tombe sous l'isolation par défaut du package. Seule
    /// la vue lit ce libellé — les helpers purs n'en ont pas besoin.
    @MainActor
    var accessibilityLabel: String {
        switch self {
        case .style:      return String(localized: "story.textEdit.tool.style", defaultValue: "Style de texte", bundle: .module)
        case .color:      return String(localized: "story.textEdit.tool.color", defaultValue: "Couleur du texte", bundle: .module)
        case .align:      return String(localized: "story.textEdit.tool.align", defaultValue: "Alignement du texte", bundle: .module)
        case .background: return String(localized: "story.textEdit.tool.background", defaultValue: "Fond du texte", bundle: .module)
        case .frame:      return String(localized: "story.textEdit.tool.frame", defaultValue: "Cadrage du texte", bundle: .module)
        case .border:     return String(localized: "story.textEdit.tool.border", defaultValue: "Contour du texte", bundle: .module)
        case .language:   return String(localized: "story.textEdit.tool.language", defaultValue: "Langue du texte", bundle: .module)
        }
    }
}
```

- [ ] **Step 4 : Suivre le compilateur**

Chaque erreur est un site à traiter :

- `TextEditFloatingBubbles.body` → `ForEach(TextEditTool.all, id: \.self)`
- `StoryTextAttributeCycle.advance` → supprimer les branches `.weight` et `.size`, ainsi que `advanceWeight` et `defaultWeight`
- `StoryTextAttributeCycle.indicator` → supprimer les branches `.weight` et `.size`, et le cas `.glyph(_, weight:)` de l'énuméré `Indicator`
- `TextEditFloatingBubbles.indicatorView` → supprimer la branche `case .glyph`
- `TextEditToolOptions.body` → supprimer `case .weight:` et `case .size:` du `switch`, et la propriété `weightOptions` (le curseur vit désormais dans `weightSlider`)
- `StoryTextEditTopBar.spokenValue` → remplacer `case .weight:` par le retour vide et ajouter `.style`, `.color`, `.background`, `.language` :

```swift
    static func spokenValue(_ tool: TextEditTool, of text: StoryTextObject) -> String {
        switch tool {
        case .frame:
            return TextEditLabels.title(for: text.parsedFrameShape)
        case .align:
            return TextEditLabels.alignTitle(for: text.textAlign ?? StoryTextAttributeCycle.defaultAlign)
        case .border:
            let width = text.borderWidth ?? 0
            guard width > 0 else {
                return String(localized: "story.composer.noEffect", defaultValue: "Aucun", bundle: .module)
            }
            return "\(Int(width)) pt"
        case .style:
            return text.parsedTextStyle.displayName
        case .language:
            return (TextEditToolOptions.normalisedCode(text.sourceLanguage) ?? "fr").uppercased()
        case .color, .background:
            return ""
        }
    }
```

- [ ] **Step 5 : Réduire la rangée haute à « Terminé »**

Dans `StoryTextEditTopBar.swift`, remplacer `body` (~19-33) :

```swift
    var body: some View {
        HStack {
            Spacer(minLength: TextEditToolbarMetrics.spacing)
            finishButton
        }
        .padding(.horizontal, TextEditToolbarMetrics.horizontalMargin)
        .padding(.top, 6)
    }
```

Supprimer `cycleButton(_:)` et `indicator(for:)`, devenus sans appelant. Garder `strokeWeight(_:)` et `spokenValue(_:of:)` : `TextEditFloatingBubbles` les consomme.

Mettre à jour le commentaire de tête du type, qui décrit une rangée d'attributs qui n'existe plus :

```swift
/// Rangée posée sous l'encoche pendant l'édition d'un texte : elle ne porte
/// plus que la sortie.
///
/// Les attributs qui l'occupaient sont redescendus sur la rangée unique
/// (`TextEditFloatingBubbles`), avec le même geste pour tous — tap pour la
/// valeur suivante, appui long pour le panneau. La séparation en deux rangées
/// répondait à un débordement de largeur ; retirer taille et graisse, devenues
/// des curseurs, l'a rendue inutile.
```

Dans `StoryTextEditTopBar`, `textObject` n'est plus lu : remplacer le `@Binding var textObject: StoryTextObject` et `onOpenPanel` par le seul `let onFinish: () -> Void`, et ajuster l'appel dans `StoryTextEditToolbar.body` :

```swift
                StoryTextEditTopBar(onFinish: { viewModel.exitTextEditingMode() })
```

- [ ] **Step 6 : Lancer les tests et compiler l'app**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
./apps/ios/meeshy.sh build
```

Attendu : SUCCÈS des deux.

- [ ] **Step 7 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story packages/MeeshySDK/Tests/MeeshyUITests/Story
git commit -m "feat(story/text): une seule rangée de sept outils, Terminé seul en haut"
```

---

### Task 9 : Le canvas reste plein écran pendant l'édition

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift` (`canvasIsCarded` ~844-857, `presentedSheetHeight` ~867-909, `chromeAtTop` ~709, appel du toolbar ~103-105)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (état `measuredTextToolbarTopY`, ~125)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift` (`onBottomEdgeChange`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift` (commentaire de `centerLayerForEditing`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerCanvasFramingTests.swift` (créer)

**Interfaces:**
- Produit : `StoryCanvasFraming.isCarded(bandPresent:drawingActive:textActive:timelineActive:)` retourne `false` dès que `textActive` est vrai, quels que soient les autres arguments.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/Composer/StoryComposerCanvasFramingTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// Pendant l'édition d'un texte, le canvas reste PLEIN ÉCRAN : les bulles et
/// « Terminé » flottent par-dessus, et le clavier recouvre le bas — c'est
/// assumé, l'attention est sur le texte.
///
/// Le piège : retirer `textActive` de la disjonction ne suffit pas. Quand
/// l'éditeur s'ouvre depuis la tuile Texte, `StoryComposerView+Canvas` appelle
/// `bandStateMachine.tapFAB` puis `tapTile` juste après `enterTextEditingMode`.
/// La band n'est donc pas `.hidden`, et `bandPresent` maintiendrait le carding
/// à lui seul — alors même que la band est masquée et non-interactive.
final class StoryComposerCanvasFramingTests: XCTestCase {

    func test_textEditingKeepsTheCanvasFullScreen_evenWhenTheBandIsPresent() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: false,
                                        textActive: true,
                                        timelineActive: false))
    }

    func test_textEditingWinsOverEveryOtherReason() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: true,
                                        textActive: true,
                                        timelineActive: true))
    }

    func test_withoutTextEditing_theBandStillCardsTheCanvas() {
        XCTAssertTrue(
            StoryCanvasFraming.isCarded(bandPresent: true,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: false))
    }

    func test_withoutTextEditing_theTimelineStillCardsTheCanvas() {
        XCTAssertTrue(
            StoryCanvasFraming.isCarded(bandPresent: false,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: true))
    }

    func test_atRest_theCanvasIsFullScreen() {
        XCTAssertFalse(
            StoryCanvasFraming.isCarded(bandPresent: false,
                                        drawingActive: false,
                                        textActive: false,
                                        timelineActive: false))
    }
}
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryComposerCanvasFramingTests
```

Attendu : ÉCHEC — les deux premiers tests retournent `true`.

- [ ] **Step 3 : Faire de l'édition texte un court-circuit**

Dans `StoryCanvasFraming.swift`, remplacer `isCarded` (~72-74) :

```swift
    /// L'édition texte court-circuite tout : le canvas reste plein écran, les
    /// contrôles flottent par-dessus. Ce n'est pas un terme de la disjonction
    /// mais une sortie anticipée — quand l'éditeur s'ouvre depuis la tuile
    /// Texte, la band n'est pas `.hidden` (elle est seulement masquée et
    /// non-interactive), et `bandPresent` seul relancerait le carding.
    public static func isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool, timelineActive: Bool = false) -> Bool {
        guard !textActive else { return false }
        return bandPresent || timelineActive
    }
```

- [ ] **Step 4 : Lancer pour vérifier que ça passe**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshyUITests/StoryComposerCanvasFramingTests
```

Attendu : SUCCÈS, 5 tests.

- [ ] **Step 5 : Retirer la réserve de hauteur devenue morte**

Dans `StoryComposerView+Canvas.swift`, `canvasIsCarded` (~844-857) — l'appel à `StoryCanvasFraming.isCarded` fait déjà le court-circuit, mais la sheet système, elle, est évaluée après. Il faut la court-circuiter aussi :

```swift
    var canvasIsCarded: Bool {
        // L'édition texte garde le canvas plein écran, sheet système comprise.
        guard viewModel.textEditingMode == .inactive else { return false }
        let bandPresent = bandStateMachine.state != .hidden
        let drawingActive = viewModel.drawingEditingMode.isActive
        if StoryCanvasFraming.isCarded(
            bandPresent: bandPresent,
            drawingActive: drawingActive,
            textActive: false,
            timelineActive: viewModel.isTimelineVisible
        ) {
            return true
        }
        return presentedSystemSheetFraction != nil
    }
```

Dans `presentedSheetHeight` (~867-909), supprimer entièrement le bloc `if viewModel.textEditingMode != .inactive { … }` : `canvasIsCarded` étant faux en édition, la garde de tête retourne déjà `0`.

Dans `chromeAtTop` (~709), retirer le terme devenu sans effet :

```swift
            let chromeAtTop = showTopBar
```

Remplacer l'appel au toolbar (~103-105) :

```swift
            StoryTextEditToolbar(viewModel: viewModel)
```

Dans `StoryTextEditToolbar.swift`, supprimer la propriété `onBottomEdgeChange`, la vue `bottomEdgeReporter` et le `.background(bottomEdgeReporter)`.

Dans `StoryComposerView.swift` (~125), supprimer l'état `measuredTextToolbarTopY` et son commentaire.

- [ ] **Step 6 : Réécrire le commentaire devenu faux**

Dans `StoryCanvasUIView+InlineTextEdit.swift`, `centerLayerForEditing` (~98-104) justifie le centrage par un carding qui n'existe plus :

```swift
    /// Recentre la calque au milieu du canvas et annule sa rotation pour la
    /// durée de l'édition — override PUREMENT visuel : le modèle (`x`, `y`,
    /// `rotation`) n'est pas touché, et `rebuildLayers()` replace toujours la
    /// calque depuis le modèle (d'où le re-recentrage dans
    /// `reapplyInlineEditingIfNeeded`). Le canvas reste plein écran pendant
    /// l'édition : son centre est donc le centre de l'écran, au-dessus du
    /// clavier sur tous les appareils supportés.
```

- [ ] **Step 7 : Compiler et lancer la suite complète**

```
./apps/ios/meeshy.sh build
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS.

- [ ] **Step 8 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story packages/MeeshySDK/Tests/MeeshyUITests/Story
git commit -m "feat(story/text): le canvas reste plein écran pendant l'édition"
```

---

### Task 10 : Vérification bout-en-bout sur simulateur

**Files:** aucun — vérification seule.

- [ ] **Step 1 : Suite complète du package**

```
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

Attendu : SUCCÈS, zéro échec.

- [ ] **Step 2 : Tests de l'app**

```
./apps/ios/meeshy.sh test
```

Attendu : SUCCÈS.

- [ ] **Step 3 : Vérification visuelle**

```
./apps/ios/meeshy.sh run
```

Parcours à dérouler, story composer → outil Texte :

1. Le canvas **ne rétrécit pas** à l'ouverture de l'éditeur. Il garde ses bords ; le clavier recouvre le bas.
2. La rangée basse porte **sept** bulles, chacune montrant sa valeur (pastille de couleur, « Aa » dans la police courante, code de langue).
3. Un **tap** sur chaque bulle change la valeur, visible tout de suite sur le texte du canvas.
4. Un **appui long** ouvre le panneau ; un second le referme.
5. Panneau Police : les curseurs Taille et Graisse agissent en direct sur le texte.
6. Panneau Cadre : « Aucun » retire la boîte ; la marge écarte la boîte des glyphes ; le liseré apparaît **sans qu'aucun fond ne soit posé**.
7. « Terminé » referme l'éditeur et le texte **retrouve sa position d'origine**, pas le centre de l'écran.

- [ ] **Step 4 : Capture d'écran de contrôle**

Comparer avec la capture d'origine de la demande : la rangée haute ne doit plus porter que « Terminé ».

- [ ] **Step 5 : Commit final si des ajustements ont été nécessaires**

```bash
git add -A packages/MeeshySDK apps/ios
git commit -m "fix(story/text): ajustements issus de la vérification simulateur"
```

---

## Notes de vérification

- `./apps/ios/meeshy.sh build` **ne compile pas** le bundle de tests. Les tâches 5, 6, 8 et 9 changent des signatures : un `build-for-testing` y est obligatoire, sinon une erreur de compilation des tests reste invisible jusqu'à la CI.
- Les suites `StoryTextLayerSolidBackgroundTests` et `StoryTextLayerGlassZOrderTests` gardent la régression « boîte noire vide » de juin 2026. La Task 2 découpe `applyBackgroundStyle` : les faire passer avant et après, systématiquement.
- Ne jamais écrire `.none` sans qualifier quand le contexte est optionnel — `StoryTextFrameShape.none`. Swift lierait sinon `Optional.none` et le test passerait pour une mauvaise raison.
