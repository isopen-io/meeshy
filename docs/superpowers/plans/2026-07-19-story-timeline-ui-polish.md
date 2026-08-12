# Story Timeline UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polir l'éditeur Timeline du composer story (Simple/Pro) : parité du coin arrondi du sheet, contenu pleine largeur, Liquid Glass sur tout le chrome, étiquettes de piste enrichies (icône + durée live + type), et config piste au long-press (nom persisté + timing lié début/fin/durée).

**Architecture:** Aucune nouvelle architecture. On suit les patterns déjà en place dans cet arbre : fonctions `static` pures testables consommées par des vues fines, wrapper `Compatibility/AdaptiveGlass` pour le verre, `SetClipPropertyCommand`/`commandStack` pour les mutations undoable, Codable custom sur les modèles story.

**Tech Stack:** Swift 6, SwiftUI, XCTest, Swift Package (`packages/MeeshySDK`, targets `MeeshySDK` core + `MeeshyUI`).

## Global Constraints

- Chaque ligne de production est écrite en réponse à un test qui échoue d'abord (RED → GREEN → REFACTOR). Exception : les changements purement visuels (Liquid Glass, clipShape) n'ont pas de logique isolable — ils sont vérifiés par grep d'assertion + capture simulateur, pas par test unitaire.
- Pas de `any` dans le package shared ; strict-mode partout (déjà le cas).
- Format nom de type des pistes : **`TYPE_index`** en majuscules avec underscore et index 1-based — `IMAGE_1`, `AUDIO_2`, `VIDEO_1`, `TEXT_1` (choix user explicite, distinct du titre localisé « Image » de la barre de clip et de la clé existante `story.timeline.track.section.image` = « IMAGE %lld » qui utilise un espace).
- Hauteur de piste cible après enrichissement : **54 pt** (Quick et Pro identiques), colonne d'étiquette **44 pt**.
- Catalogue de localisation : `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`, référencé via `bundle: .module`. Convention de clé : `story.timeline.<area>.<leaf camelCase>`. Localisations présentes : `en` + `fr` uniquement.
- Lancer les tests : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:<Cible>/<Classe>` (scopé), sans `-only-testing` pour la suite complète avant de clore un lot.
- **Avant la Task 9** (seule à toucher `Story/Controls/ComposerBottomBand.swift`), refaire `git status --short` : un round précédent signalait du travail Liquid Glass en vol sur ce fichier. Vérifier qu'il a atterri / n'est plus en conflit avant d'éditer.
- Le chantier F (effets d'apparition/disparition **riches** par clip : fade/zoom/slide/reveal) est **hors de ce plan** — spec séparée. Ici, la section fondu `fadeIn`/`fadeOut` existante devient seulement atteignable en Simple par effet de bord de la Task 8 ; son mécanisme (opacité, 5 presets) est inchangé.

---

## Task 1: Unifier la largeur de colonne d'étiquette en une source unique

Refactor pur, zéro changement visuel. Aujourd'hui la largeur `72` est codée en dur à deux endroits non reliés : `TimelineScrubArea.laneLabelWidth` (offsette ruler + playhead + poignée) et le littéral `72` dans `TrackBarView.body`. On fait de `TimelineScrubArea.laneLabelWidth` la source unique et on passe la valeur à `TrackBarView` via un paramètre. La valeur reste 72 (la Task 3 la réduira à 44).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift` (ajouter param `labelColumnWidth`, remplacer le littéral `72` ligne 51)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift:299-308` (passer `labelColumnWidth:` au `TrackBarView`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift:400-408` (idem)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift` (créer si absent)

**Interfaces:**
- Consumes: `TimelineScrubArea.laneLabelWidth` (static existant, `TimelineScrubArea.swift:18`, vaut 72).
- Produces: `TrackBarView.init(..., labelColumnWidth: CGFloat = TimelineScrubArea.laneLabelWidth, ...)` — nouveau paramètre, consommé par la Task 3.

- [ ] **Step 1: Écrire le test qui échoue**

Créer/compléter `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TrackBarViewTests: XCTestCase {

    func test_labelColumnWidth_defaultsToSharedLaneLabelConstant() {
        // La largeur de colonne DOIT venir de la source unique partagée avec
        // le ruler/playhead (TimelineScrubArea.laneLabelWidth), pas d'un
        // littéral 72 dupliqué — sinon ruler et pistes se désalignent si l'un
        // change sans l'autre (refactor 2026-07-19).
        let view = TrackBarView(
            title: "Vidéo 1", isLocked: false, isSelected: false,
            tintHex: "6366F1", isDark: false, laneWidth: 600, laneHeight: 40,
            iconName: "video.fill"
        ) { Color.clear }
        XCTAssertEqual(view.labelColumnWidth,
                       TimelineScrubArea<Color>.laneLabelWidth, accuracy: 0.01)
    }

    func test_accessibilityLabel_includesTitle() {
        let view = TrackBarView(
            title: "Vidéo 1", isLocked: false, isSelected: false,
            tintHex: "6366F1", isDark: false, laneWidth: 600, laneHeight: 40,
            iconName: "video.fill"
        ) { Color.clear }
        XCTAssertEqual(view.accessibilityComposedLabel, "Vidéo 1")
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests`
Expected: FAIL — `view.labelColumnWidth` n'existe pas (erreur de compilation). `TimelineScrubArea<Color>.laneLabelWidth` compile déjà (static `nonisolated`).

- [ ] **Step 3: Implémenter — ajouter le paramètre et remplacer le littéral**

Dans `TrackBarView.swift`, ajouter la propriété stockée (après `iconName`, ligne 18) :

```swift
    public let iconName: String?
    /// Largeur de la colonne d'étiquette collante. Source unique = valeur
    /// passée par le conteneur (typiquement `TimelineScrubArea.laneLabelWidth`)
    /// pour que ruler, playhead et étiquette restent alignés au pixel.
    public let labelColumnWidth: CGFloat
    private let lane: () -> Content
```

Mettre à jour l'init (lignes 21-41) — ajouter le paramètre avec défaut :

```swift
    public init(
        title: String,
        isLocked: Bool,
        isSelected: Bool,
        tintHex: String,
        isDark: Bool,
        laneWidth: CGFloat,
        laneHeight: CGFloat,
        iconName: String? = nil,
        labelColumnWidth: CGFloat = TimelineScrubArea<Color>.laneLabelWidth,
        @ViewBuilder lane: @escaping () -> Content
    ) {
        self.title = title
        self.isLocked = isLocked
        self.isSelected = isSelected
        self.tintHex = tintHex
        self.isDark = isDark
        self.laneWidth = laneWidth
        self.laneHeight = laneHeight
        self.iconName = iconName
        self.labelColumnWidth = labelColumnWidth
        self.lane = lane
    }
```

Remplacer le littéral `72` dans `body` (ligne 51) :

```swift
            label
                .frame(width: labelColumnWidth, height: laneHeight, alignment: .leading)
                .background(isDark ? Color.black.opacity(0.25) : Color.white.opacity(0.6))
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift
git commit -m "refactor(sdk/timeline): TrackBarView takes shared labelColumnWidth (no visual change)"
```

Note : les callers `QuickTimelineView`/`ProTimelineView` n'ont pas besoin de changer maintenant (le défaut du paramètre couvre l'ancien comportement). Ils passeront explicitement `labelColumnWidth` à la Task 3.

---

## Task 2: Lane pilotée par la largeur disponible du sheet (pleine largeur)

Aujourd'hui `TimelineScrubArea.laneWidth = max(geometry.width(for: totalDuration), minLaneWidth)` avec `minLaneWidth` = 200 (Quick) / 320 (Pro) — un plancher magique déconnecté de la largeur réelle du sheet. On le remplace par un plancher = largeur visible − insets, mesuré via `GeometryReader`, identique dans les deux modes.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift` (signature `laneWidth`, `GeometryReader` dans `body`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift:275` (`minLaneWidth: 200` → `120`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift:382` (`minLaneWidth: 320` → `120`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TimelineScrubAreaTests.swift` (créer si absent)

**Interfaces:**
- Consumes: `TimelineGeometry.width(for:)`, `TimelineScrubArea.playheadLeadingInset`, `TimelineScrubArea.horizontalPadding` (existants).
- Produces: `TimelineScrubArea.laneWidth(totalDuration:geometry:availableWidth:minLaneWidth:) -> CGFloat` (signature enrichie).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TimelineScrubAreaTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TimelineScrubAreaTests: XCTestCase {

    func test_laneWidth_shortDuration_fillsAvailableWidth() {
        // Durée courte : la lane naturelle (durée × pixels/s) est plus petite
        // que l'écran → on remplit la largeur visible moins les insets, pas un
        // plancher magique 200/320.
        let geometry = TimelineGeometry(zoomScale: 1.0) // 50 px/s
        let width = TimelineScrubArea<Color>.laneWidth(
            totalDuration: 2.0,            // naturel = 100 pt
            geometry: geometry,
            availableWidth: 402,           // iPhone portrait
            minLaneWidth: 120
        )
        let inset = TimelineScrubArea<Color>.playheadLeadingInset
                  + TimelineScrubArea<Color>.horizontalPadding
        XCTAssertEqual(width, 402 - inset, accuracy: 0.01)
    }

    func test_laneWidth_longDuration_usesTimeProportionalWidth() {
        // Durée longue : la lane naturelle dépasse l'écran → on garde la
        // largeur proportionnelle au temps (scroll horizontal).
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let width = TimelineScrubArea<Color>.laneWidth(
            totalDuration: 60.0,           // naturel = 3000 pt
            geometry: geometry,
            availableWidth: 402,
            minLaneWidth: 120
        )
        XCTAssertEqual(width, geometry.width(for: 60.0), accuracy: 0.01)
    }

    func test_laneWidth_zeroAvailableWidth_fallsBackToMinFloor() {
        // Avant la première mesure GeometryReader (availableWidth == 0), on
        // retombe sur le plancher absolu au lieu d'une largeur négative.
        let geometry = TimelineGeometry(zoomScale: 1.0)
        let width = TimelineScrubArea<Color>.laneWidth(
            totalDuration: 1.0,            // naturel = 50 pt
            geometry: geometry,
            availableWidth: 0,
            minLaneWidth: 120
        )
        XCTAssertEqual(width, 120, accuracy: 0.01)
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineScrubAreaTests`
Expected: FAIL — `laneWidth(totalDuration:geometry:availableWidth:minLaneWidth:)` n'existe pas (la signature actuelle n'a pas `availableWidth`).

- [ ] **Step 3: Implémenter — nouvelle signature + GeometryReader**

Dans `TimelineScrubArea.swift`, remplacer la static `laneWidth` (lignes 26-30) :

```swift
    /// Largeur de lane partagée par le ruler, chaque `TrackBarView` et le
    /// playhead. Plancher = largeur VISIBLE moins les insets de contenu (pour
    /// remplir le sheet), avec un plancher absolu `minLaneWidth` en secours
    /// tant que la largeur n'a pas été mesurée (availableWidth == 0). Au-delà,
    /// la largeur suit le temps (scroll horizontal).
    public nonisolated static func laneWidth(totalDuration: Float,
                                             geometry: TimelineGeometry,
                                             availableWidth: CGFloat,
                                             minLaneWidth: CGFloat) -> CGFloat {
        let contentInset = playheadLeadingInset + horizontalPadding
        let visibleFloor = availableWidth > 0
            ? max(minLaneWidth, availableWidth - contentInset)
            : minLaneWidth
        return max(geometry.width(for: totalDuration), visibleFloor)
    }
```

Dans `body` (lignes 109-141), envelopper d'un `GeometryReader` et passer sa largeur :

```swift
    public var body: some View {
        GeometryReader { outer in
            let laneWidth = Self.laneWidth(totalDuration: totalDuration,
                                           geometry: geometry,
                                           availableWidth: outer.size.width,
                                           minLaneWidth: minLaneWidth)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        RulerView(
                            totalDuration: totalDuration,
                            geometry: geometry,
                            isDark: isDark,
                            height: rulerHeight,
                            onTapTime: onScrub,
                            onScrubBegan: onScrubBegan,
                            onScrubEnded: onScrubEnded
                        )
                        .equatable()
                        .frame(width: laneWidth, alignment: .leading)
                        .padding(.leading, Self.laneLabelWidth)
                        tracks(laneWidth)
                    }
                    .padding(.horizontal, Self.horizontalPadding)
                    .overlay(alignment: .topLeading) { snapGuideOverlay }
                    .overlay(alignment: .topLeading) { playheadOverlay }
                    .overlay(alignment: .topLeading) { durationHandleOverlay }
                    .background(alignment: .topLeading) { playheadAnchor }
                }
                .adaptiveOnChange(of: currentTime) { _, time in
                    followPlayheadIfPlaying(time: time, proxy: proxy)
                }
                .simultaneousGesture(pinchZoomGesture)
            }
        }
    }
```

Puis dans `QuickTimelineView.swift:275` remplacer `minLaneWidth: 200,` par `minLaneWidth: 120,` et dans `ProTimelineView.swift:382` remplacer `minLaneWidth: 320,` par `minLaneWidth: 120,`.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe + chercher d'autres appelants de l'ancienne signature**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineScrubAreaTests`
Expected: PASS (3 tests).

Avant de commit, chercher tout autre appelant de l'ancienne static `laneWidth(totalDuration:geometry:minLaneWidth:)` qui casserait à la compilation :
`grep -rn "\.laneWidth(totalDuration" packages/MeeshySDK/` — mettre à jour chaque appel trouvé pour passer `availableWidth:` (les tests existants éventuels aussi). Relancer la suite `MeeshyUITests` complète (sans `-only-testing`) pour confirmer zéro régression.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TimelineScrubAreaTests.swift
git commit -m "fix(sdk/timeline): lane width fills the sheet in both modes (drop divergent 200/320 floor)"
```

---

## Task 3: Étiquette de piste enrichie — icône + durée live + type, pistes plus hautes

`TrackBarView` passe d'un label mono-ligne (icône + titre tronqué « VID… ») à une pile deux-lignes : ligne 1 = icône + durée totale (auto-recalculée), ligne 2 = nom de type/custom (`IMAGE_1`). Colonne réduite à 44 pt, hauteur de piste portée à 54 pt.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift` (label deux-lignes, nouveaux params `durationLabel`, `typeLabel`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift:18` (`laneLabelWidth` 72 → 44)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift` (formateur de durée + type, `laneHeight` 36 → 54, frame math, passer les nouveaux params)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift` (idem, `laneHeight` 40 → 54)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift`, `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/QuickTimelineViewTests.swift` (compléter/créer)

**Interfaces:**
- Consumes: `TimelineGeometry.effectiveClipDuration(startTime:duration:slideDuration:)` (existant, utilisé par les barres de clip).
- Produces:
  - `TrackBarView.formatTrackDuration(_ seconds: Float) -> String` (static pure)
  - `QuickTimelineView.typeLabel(kind:index:customName:) -> String` (static pure ; `customName` non-nil l'emporte)
  - `TrackBarView.init(..., durationLabel: String, typeLabel: String, ...)` — le param `title` reste pour l'accessibilité.

- [ ] **Step 1: Écrire les tests qui échouent (fonctions pures)**

Ajouter à `TrackBarViewTests.swift` :

```swift
    func test_formatTrackDuration_subMinute_usesSecondsWithComma() {
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(3.2), "3,2 s")
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(0), "0,0 s")
    }

    func test_formatTrackDuration_overMinute_usesClock() {
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(64), "1:04")
        XCTAssertEqual(TrackBarView<Color>.formatTrackDuration(125), "2:05")
    }
```

Ajouter à `QuickTimelineViewTests.swift` (créer le fichier si absent, avec l'en-tête `@testable import MeeshyUI` + `@testable import MeeshySDK`) :

```swift
    func test_typeLabel_usesUppercaseUnderscoreIndex() {
        XCTAssertEqual(
            QuickTimelineView.typeLabel(kind: .bgImage, index: 1, customName: nil),
            "IMAGE_1")
        XCTAssertEqual(
            QuickTimelineView.typeLabel(kind: .audio, index: 2, customName: nil),
            "AUDIO_2")
        XCTAssertEqual(
            QuickTimelineView.typeLabel(kind: .video, index: 1, customName: nil),
            "VIDEO_1")
        XCTAssertEqual(
            QuickTimelineView.typeLabel(kind: .text, index: 3, customName: nil),
            "TEXT_3")
    }

    func test_typeLabel_customNameOverridesTypeTag() {
        XCTAssertEqual(
            QuickTimelineView.typeLabel(kind: .bgImage, index: 1, customName: "Intro"),
            "Intro")
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests -only-testing:MeeshyUITests/QuickTimelineViewTests`
Expected: FAIL — `formatTrackDuration` et `typeLabel` n'existent pas.

- [ ] **Step 3: Implémenter les fonctions pures**

Dans `TrackBarView.swift`, ajouter (avant `body`) :

```swift
    /// Durée totale formatée pour l'étiquette de piste : « 3,2 s » sous la
    /// minute, « 1:04 » au-delà. Pure — testée sans monter la vue.
    public static func formatTrackDuration(_ seconds: Float) -> String {
        let total = max(0, seconds)
        if total < 60 {
            return String(format: "%.1f s", total).replacingOccurrences(of: ".", with: ",")
        }
        let minutes = Int(total) / 60
        let remainder = Int(total.rounded()) % 60
        return String(format: "%d:%02d", minutes, remainder)
    }
```

Dans `QuickTimelineView.swift`, ajouter (près de `clipTitle`, vers ligne 147) :

```swift
    /// Étiquette de type d'une piste : `TYPE_index` (IMAGE_1, AUDIO_2…), en
    /// majuscules avec underscore (format demandé). Un `customName` non-nil et
    /// non-vide l'emporte sur le tag de type. Pure — testée sans monter la vue.
    public static func typeLabel(kind: CompactTrack.Kind, index: Int,
                                 customName: String?) -> String {
        if let customName, !customName.trimmingCharacters(in: .whitespaces).isEmpty {
            return customName
        }
        let tag: String
        switch kind {
        case .bgVideo, .video: tag = "VIDEO"
        case .bgImage, .image: tag = "IMAGE"
        case .bgAudio, .audio: tag = "AUDIO"
        case .text:            tag = "TEXT"
        }
        return "\(tag)_\(index)"
    }
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests -only-testing:MeeshyUITests/QuickTimelineViewTests`
Expected: PASS.

- [ ] **Step 5: Câbler la pile deux-lignes dans TrackBarView + réduire la colonne**

Dans `TrackBarView.swift`, ajouter les propriétés stockées (après `labelColumnWidth`) :

```swift
    /// Durée totale de la piste, pré-formatée par le conteneur via
    /// `formatTrackDuration`. Ligne 1 de l'étiquette (à droite de l'icône).
    public let durationLabel: String
    /// Nom de type/custom (`IMAGE_1` ou nom renommé). Ligne 2 de l'étiquette.
    public let typeLabel: String
```

Ajouter les deux paramètres à l'init (avec défauts vides pour compat) :

```swift
        iconName: String? = nil,
        labelColumnWidth: CGFloat = TimelineScrubArea<Color>.laneLabelWidth,
        durationLabel: String = "",
        typeLabel: String = "",
        @ViewBuilder lane: @escaping () -> Content
    ) {
        ...
        self.iconName = iconName
        self.labelColumnWidth = labelColumnWidth
        self.durationLabel = durationLabel
        self.typeLabel = typeLabel
        self.lane = lane
    }
```

Remplacer `label` (lignes 66-100) par la pile deux-lignes :

```swift
    private var label: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(MeeshyColors.warning)
                        .accessibilityHidden(true)
                } else if let iconName {
                    ZStack {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Color(hex: tintHex).opacity(isDark ? 0.30 : 0.18))
                            .frame(width: 16, height: 16)
                        Image(systemName: iconName)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(Color(hex: tintHex))
                    }
                    .accessibilityHidden(true)
                }
                Text(durationLabel)
                    .font(.system(size: 9, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            Text(typeLabel)
                .font(.system(size: 9, weight: isSelected ? .bold : .semibold))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo900)
                .lineLimit(1)
                .allowsTightening(true)
                .minimumScaleFactor(0.7)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
```

Mettre à jour `accessibilityComposedLabel` (ligne 43) pour inclure la durée :

```swift
    public var accessibilityComposedLabel: String {
        let lockSuffix = isLocked ? " (verrouillée)" : ""
        let dur = durationLabel.isEmpty ? "" : " — \(durationLabel)"
        return title + dur + lockSuffix
    }
```

Réduire la colonne : dans `TimelineScrubArea.swift:18`, remplacer `{ 72 }` par `{ 44 }`.

- [ ] **Step 6: Câbler les conteneurs — durée live, type label, hauteur 54**

Dans `QuickTimelineView.swift`, la fabrique `trackRows` (lignes 294-341) rend un `TrackBarView` par piste. Une piste (`CompactTrack`) porte `clipIds` — calculer la durée totale et l'index. Remplacer l'appel `TrackBarView(...)` (lignes 299-308) par :

```swift
                let clipDuration = Self.trackDurationSeconds(
                    track: track, project: viewModel.project)
                let index = Self.trackTypeIndex(for: track)
                let customName = Self.trackCustomName(
                    track: track, project: viewModel.project)
                TrackBarView(
                    title: track.title,
                    isLocked: false,
                    isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                    tintHex: tint(for: track.kind),
                    isDark: colorScheme == .dark,
                    laneWidth: laneWidth,
                    laneHeight: 54,
                    iconName: Self.iconName(for: track.kind),
                    durationLabel: TrackBarView<AnyView>.formatTrackDuration(clipDuration),
                    typeLabel: Self.typeLabel(kind: track.kind, index: index, customName: customName)
                ) {
```

Puis mettre à jour la même construction dans `clipBar` calls : remplacer `laneHeight: 36` par `laneHeight: 54` aux lignes 311, 316, 326 (les `clipBar(...)`, `LaneKeyframeOverlays`, `LaneTransitionOverlays` reçoivent tous `laneHeight`).

Ajouter les helpers pure dans `QuickTimelineView.swift` (près de `typeLabel`) :

```swift
    /// Durée totale (secondes) d'une piste = borne de fin max de ses clips,
    /// via la même règle que les barres (`effectiveClipDuration`) — se
    /// recalcule à chaque rendu depuis `project`, donc suit trim/split/move.
    static func trackDurationSeconds(track: CompactTrack, project: TimelineProject) -> Float {
        var maxEnd: Float = 0
        for id in track.clipIds {
            if let m = project.mediaObjects.first(where: { $0.id == id }) {
                let start = Float(m.startTime ?? 0)
                let dur = TimelineGeometry.effectiveClipDuration(
                    startTime: start, duration: m.duration.map { Float($0) },
                    slideDuration: project.slideDuration)
                maxEnd = max(maxEnd, start + dur)
            } else if let a = project.audioPlayerObjects.first(where: { $0.id == id }) {
                let start = a.startTime ?? 0
                let dur = TimelineGeometry.effectiveClipDuration(
                    startTime: start, duration: a.duration,
                    slideDuration: project.slideDuration)
                maxEnd = max(maxEnd, start + dur)
            } else if let t = project.textObjects.first(where: { $0.id == id }) {
                let start = Float(t.startTime ?? 0)
                let dur = TimelineGeometry.effectiveClipDuration(
                    startTime: start, duration: t.duration.map { Float($0) },
                    slideDuration: project.slideDuration)
                maxEnd = max(maxEnd, start + dur)
            }
        }
        return maxEnd
    }

    /// Index 1-based extrait de l'id de piste ("image-2" → 2) pour le tag
    /// `TYPE_index`. `resolveAllTracks` numérote déjà les pistes par kind.
    static func trackTypeIndex(for track: CompactTrack) -> Int {
        Int(track.id.split(separator: "-").last.map(String.init) ?? "1") ?? 1
    }

    /// Nom custom persisté du premier clip de la piste, s'il existe.
    static func trackCustomName(track: CompactTrack, project: TimelineProject) -> String? {
        guard let id = track.clipIds.first else { return nil }
        if let m = project.mediaObjects.first(where: { $0.id == id }) { return m.name }
        if let a = project.audioPlayerObjects.first(where: { $0.id == id }) { return a.name }
        if let t = project.textObjects.first(where: { $0.id == id }) { return t.name }
        return nil
    }
```

Note : `.name` sur les modèles vient de la Task 5 — cette Task 3 est ordonnancée AVANT la Task 5, donc à ce stade `m.name` ne compile pas encore. **Ordonner : faire la Task 5 (champ modèle) AVANT la Task 3.** Voir la note d'ordre en fin de plan ; les numéros sont l'ordre d'implémentation recommandé après ce swap.

Répéter le câblage dans `ProTimelineView.swift` `tracksScroll` (lignes 399-408, `TrackBarView`) : ajouter les mêmes `durationLabel`/`typeLabel`/`laneHeight: 54`, réutilisant `QuickTimelineView.trackDurationSeconds`/`trackTypeIndex`/`trackCustomName`/`typeLabel`. Remplacer `laneHeight: 40` par `laneHeight: 54` (lignes 407, 412, 419, 428).

Dans `QuickTimelineView.scrubRegion` (ligne 289), corriger la frame math pour la nouvelle hauteur : remplacer `CGFloat(tracks.count) * 40 + 8 + 22` par `CGFloat(tracks.count) * 58 + 8 + 22` (54 lane + 4 spacing).

- [ ] **Step 7: Lancer la suite + vérif visuelle**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TrackBarViewTests -only-testing:MeeshyUITests/QuickTimelineViewTests`
Expected: PASS. Puis suite `MeeshyUITests` complète : PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineScrubArea.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/TrackBarViewTests.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/QuickTimelineViewTests.swift
git commit -m "feat(sdk/timeline): enriched track label (icon + live duration + TYPE_i), taller lanes, narrow column"
```

---

## Task 4: Liquid Glass sur tout le chrome de navigation/contrôle

Appliquer le wrapper existant `Compatibility/AdaptiveGlass` (verre réel iOS 26+, fallback identique < 26) aux quatre zones aujourd'hui plates. Changement purement visuel — pas de test unitaire, vérifié par grep + capture. Surface = matériau, contrôles = glass groupés en `AdaptiveGlassContainer` (règle canonique : le verre ne peut pas échantillonner du verre).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift:87-140` (`backButton` + `switchChip`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineModeSwitcher.swift:53-93` (container + segment actif)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift:98-162` (undo/redo/snap/ruler)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift:145-263` (play/zoom/mute/undo-redo)

**Interfaces:**
- Consumes: `View.adaptiveGlass(in:tint:interactive:)`, `View.adaptiveGlassProminent(in:tint:)`, `AdaptiveGlassContainer` (`Compatibility/AdaptiveGlass.swift:28,47,115`).
- Produces: rien de consommé par d'autres tasks.

- [ ] **Step 1: (A) Rangée outils — backButton + switchChips**

Dans `ComposerToolPanelHost.swift`, envelopper la rangée de chips dans un `AdaptiveGlassContainer` et remplacer les fonds. `headerRow` (lignes 73-85) :

```swift
    @ViewBuilder
    private var headerRow: some View {
        AdaptiveGlassContainer(spacing: 8) {
            HStack(spacing: 8) {
                backButton
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(otherTools, id: \.rawValue) { other in
                            switchChip(for: other)
                        }
                    }
                }
            }
        }
    }
```

`backButton` (ligne 99) : remplacer `.background(.ultraThinMaterial, in: Capsule())` par
`.adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)`.

`switchChip` (lignes 122-131) : remplacer le bloc `.background(Capsule().fill(...)).overlay(Capsule().stroke(...))` par
`.adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)` (appliqué APRÈS le `.padding`, avant `.foregroundColor` reste au-dessus).

- [ ] **Step 2: (B) TimelineModeSwitcher**

Dans `TimelineModeSwitcher.swift`, remplacer le fond du container (lignes 57-69, les deux `.background(Capsule().fill(.ultraThinMaterial))` + tint + `.overlay(Capsule().strokeBorder(...))`) par :

```swift
        .padding(4)
        .adaptiveGlass(in: Capsule(), tint: isDark
            ? MeeshyColors.indigo900.opacity(0.35)
            : MeeshyColors.indigo100.opacity(0.55))
        .accessibilityElement(children: .contain)
```

Dans `segment` (lignes 88-93), le segment ACTIF prend du glass prominent, l'inactif reste transparent — remplacer le `.background(Capsule().fill(isActive ? brandGradient : Color.clear))` par :

```swift
            .background {
                if isActive {
                    Color.clear.adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
                }
            }
            .contentShape(Capsule())
```

(Le `foregroundStyle(activeForeground(...))` déjà présent garde le blanc sur actif.)

- [ ] **Step 3: (C) TimelineToolbar — boutons + pastilles**

Dans `TimelineToolbar.swift`, grouper la rangée. Repérer le `body` (là où `undoButton`, `redoButton`, `divider`, `snapToggle`, `rulerLabel` sont assemblés) et l'envelopper d'un `AdaptiveGlassContainer(spacing: 8) { ... }`.

`undoButton` (lignes 98-108) : ajouter, après `.contentShape(Rectangle().inset(by: -7))` sur l'`Image`,
`.frame(width: 30, height: 30).adaptiveGlass(in: Circle(), tint: MeeshyColors.indigo500)` — appliqué sur le label du bouton. Idem `redoButton`.

`snapToggle` (lignes 141-146) : remplacer `.background(Capsule().fill(isSnapEnabled ? indigo500.opacity(0.15) : gray.opacity(0.1)))` par
`.adaptiveGlass(in: Capsule(), tint: isSnapEnabled ? MeeshyColors.success : nil, interactive: true)`.

`rulerLabel` (ligne 160) : remplacer `.background(Capsule().fill(Color.gray.opacity(0.1)))` par
`.adaptiveGlass(in: Capsule())`.

- [ ] **Step 4: (D) TransportBar — play/zoom/mute/undo-redo**

Dans `TransportBar.swift`, envelopper la rangée de contrôles dans `AdaptiveGlassContainer(spacing: 8) { ... }`.

`playButton` (lignes 145-165) : il porte déjà un `Circle().fill(brandGradient)` — le laisser tel quel (emphase de marque), OU remplacer par `.adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.indigo500)` sur le `ZStack` pour cohérence. Choix : **garder le gradient de marque** (le bouton lecture est l'accent principal), ne pas le toucher.

Les boutons sans fond (zoom out/reset/in, mute, undo/redo) : sur chaque label `Image`/`Text`, après `.frame(width: 30, height: 30).contentShape(...)`, ajouter `.adaptiveGlass(in: Circle(), tint: MeeshyColors.indigo500)` (pour le cluster zoom, le libellé `Text` reset utilise `.adaptiveGlass(in: Capsule())`). Exemple pour `muteButton` (lignes 251-263) :

```swift
    private var muteButton: some View {
        Button(action: onMuteToggle) {
            Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .frame(width: 30, height: 30)
                .adaptiveGlass(in: Circle(), tint: isMuted ? MeeshyColors.error : MeeshyColors.indigo500)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isMuted ? MeeshyColors.error : MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: isMuted
            ? "story.timeline.transport.unmute"
            : "story.timeline.transport.mute",
            bundle: .module))
    }
```

Appliquer le même ajout `.adaptiveGlass(in: Circle()/Capsule(), tint: MeeshyColors.indigo500)` à : `onZoomOut`, `onZoomReset` (Capsule, car libellé texte), `onZoomIn` (dans `zoomCluster`, lignes 221-249) et aux deux boutons de `undoRedoCluster` (lignes 191-219).

- [ ] **Step 5: Vérifier — aucun fond opaque non-gaté ne subsiste + build**

Grep de contrôle (doit ne plus renvoyer de `.ultraThinMaterial`/`Capsule().fill` de fond dans ces 4 zones hors AdaptiveGlass) :
`grep -n "ultraThinMaterial\|Capsule().fill\|Capsule().strokeBorder" packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineModeSwitcher.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift`
Attendu : plus aucun fond de contrôle (les `rowBackground` gardent leur `Color.clear`/matériau — c'est voulu). Puis :
`./apps/ios/meeshy.sh build` → build vert.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineModeSwitcher.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift
git commit -m "feat(sdk/timeline): Liquid Glass on all nav/control chrome (tool switcher, mode toggle, toolbar, transport)"
```

---

## Task 5: Champ `name` persisté sur les trois modèles de clip

Ajouter `name: String?` optionnel (rétro-compatible) à `StoryMediaObject`, `StoryAudioPlayerObject`, `StoryTextObject`. Fondation du renommage (Task 6/7) et de l'étiquette custom (Task 3).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (les trois structs)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift` (append)

**Interfaces:**
- Produces: `StoryMediaObject.name: String?`, `StoryAudioPlayerObject.name: String?`, `StoryTextObject.name: String?` (nouveau champ Codable optionnel).

- [ ] **Step 1: Écrire les tests qui échouent (roundtrip + back-compat)**

Append à `StoryModelsExtensionsTests.swift` :

```swift
    func test_storyMediaObject_name_roundtrips() throws {
        var m = StoryMediaObject(aspectRatio: 1.0)
        m.name = "Intro"
        let data = try JSONEncoder().encode(m)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.name, "Intro")
    }

    func test_storyMediaObject_legacyWithoutName_decodesToNil() throws {
        let json = #"{"id":"m1","postMediaId":"p","mediaType":"image","aspectRatio":1.0}"#
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: Data(json.utf8))
        XCTAssertNil(decoded.name)
    }

    func test_storyAudioPlayerObject_name_roundtrips() throws {
        var a = StoryAudioPlayerObject()
        a.name = "Musique"
        let data = try JSONEncoder().encode(a)
        let decoded = try JSONDecoder().decode(StoryAudioPlayerObject.self, from: data)
        XCTAssertEqual(decoded.name, "Musique")
    }

    func test_storyTextObject_name_roundtrips() throws {
        var t = StoryTextObject(text: "Hello")
        t.name = "Titre"
        let data = try JSONEncoder().encode(t)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        XCTAssertEqual(decoded.name, "Titre")
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/StoryModelsExtensionsTests`
Expected: FAIL — `.name` n'existe sur aucun des trois modèles.

- [ ] **Step 3a: `StoryAudioPlayerObject` (Codable synthétisé)**

Dans `StoryModels.swift` (struct ligne 783) : ajouter `public var name: String?` après `sourceLanguage` (ligne 807), ajouter `case name` dans `CodingKeys` (ligne 810-813), ajouter `name: String? = nil` à l'init (après `sourceLanguage`, ligne 823) et `self.name = name` dans le corps (après `self.sourceLanguage = sourceLanguage`, ligne 831).

- [ ] **Step 3b: `StoryMediaObject` (Codable custom)**

Struct ligne 555. Quatre points :
1. Propriété : après `sourceLanguage` (ligne 587), ajouter `public var name: String?`.
2. `CodingKeys` (ligne 612-619) : ajouter `name` à la liste `case sourceLanguage, keyframes, thumbHash` → `case sourceLanguage, keyframes, thumbHash, name`.
3. Init memberwise (lignes 621-661) : ajouter `name: String? = nil,` (après `thumbHash: String? = nil`) et `self.name = name` dans le corps. **Aussi** l'init de convenance `init(..., kind:, ...)` (lignes 738-778) : ajouter `name: String? = nil,` et le passer via `name: name` au `self.init(...)`.
4. Decoder (lignes 664-700) : ajouter `name = try c.decodeIfPresent(String.self, forKey: .name)` (après la ligne `thumbHash = ...`). Encoder (lignes 702-727) : ajouter `try c.encodeIfPresent(name, forKey: .name)`.

- [ ] **Step 3c: `StoryTextObject` (Codable custom)**

Struct ligne 266. Quatre points :
1. Propriété : après `keyframes` (ligne 323), ajouter `public var name: String?`.
2. `CodingKeys` (lignes 325-336) : ajouter `case name` à la ligne `case isLocked, keyframes` → `case isLocked, keyframes, name`.
3. Init memberwise (lignes 338-380) : ajouter `name: String? = nil` (après `keyframes: [StoryKeyframe]? = nil`) et `self.name = name` dans le corps.
4. Decoder (lignes 384-439) : ajouter `name = try c.decodeIfPresent(String.self, forKey: .name)` (après `keyframes = ...`). Encoder (lignes 441-470) : ajouter `try c.encodeIfPresent(name, forKey: .name)`.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/StoryModelsExtensionsTests`
Expected: PASS (4 nouveaux tests). Puis suite `MeeshySDKTests` complète : PASS (zéro régression Codable sur les stories existantes).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk/story): add optional persisted name to media/audio/text clip models"
```

---

## Task 6: Commande `.name` undoable + `TimelineViewModel.setClipName`

Étendre `SetClipPropertyCommand.ClipProperty` avec `.name(old:new:)` (undoable, comme volume/fade), et ajouter la méthode ViewModel `setClipName(id:name:)` sur le modèle de `setClipVolume`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:3158-3337` (`ClipProperty` + apply overloads)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift` (`setClipName`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelClipNameTests.swift` (créer)

**Interfaces:**
- Consumes: `StoryMediaObject.name` / `StoryAudioPlayerObject.name` / `StoryTextObject.name` (Task 5), `SetClipPropertyCommand`, `commandStack.push(.setClipProperty(_))`, `clipKind(forId:)`.
- Produces: `TimelineViewModel.setClipName(id: String, name: String?)`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelClipNameTests.swift` (réutiliser le pattern de bootstrap des tests ViewModel existants — `MockStoryTimelineEngine`, `bootstrap(project:...)`, `await vm.awaitConfigured()`) :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineViewModelClipNameTests: XCTestCase {

    private func makeSUT(media: [StoryMediaObject]) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: media, audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_setClipName_persistsOnModel() async {
        let m = StoryMediaObject(id: "m1", postMediaId: "p", kind: .image, aspectRatio: 1)
        let sut = await makeSUT(media: [m])
        sut.setClipName(id: "m1", name: "Intro")
        XCTAssertEqual(sut.project.mediaObjects.first(where: { $0.id == "m1" })?.name, "Intro")
    }

    func test_setClipName_isUndoable() async {
        let m = StoryMediaObject(id: "m1", postMediaId: "p", kind: .image, aspectRatio: 1)
        let sut = await makeSUT(media: [m])
        sut.setClipName(id: "m1", name: "Intro")
        sut.undo()
        XCTAssertNil(sut.project.mediaObjects.first(where: { $0.id == "m1" })?.name)
    }
}
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineViewModelClipNameTests`
Expected: FAIL — `setClipName` n'existe pas.

- [ ] **Step 3a: Étendre `ClipProperty` avec `.name`**

Dans `StoryModels.swift`, `ClipProperty` (lignes 3158-3234) :

Ajouter le case (après `.isLocked`, ligne 3164) :
```swift
        case name(old: String?, new: String?)
```
`CodingKeys` (ligne 3167) → ajouter des clés string :
```swift
            case type, oldFloat, newFloat, oldBool, newBool, oldString, newString
```
`Tag` (ligne 3171) → ajouter `name` :
```swift
            case volume, fadeIn, fadeOut, loop, isBackground, isLocked, name
```
`init(from:)` (dans le `switch tag`, après le case `.isLocked`, ligne 3201) :
```swift
            case .name:
                let old = try c.decodeIfPresent(String.self, forKey: .oldString)
                let new = try c.decodeIfPresent(String.self, forKey: .newString)
                self = .name(old: old, new: new)
```
`encode(to:)` (dans le `switch self`, après le case `.isLocked`, ligne 3231) :
```swift
            case .name(let old, let new):
                try c.encode(Tag.name, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldString)
                try c.encodeIfPresent(new, forKey: .newString)
```

- [ ] **Step 3b: Gérer `.name` dans les trois apply overloads**

`apply(to media:)` (lignes 3282-3299) — remplacer `case .isLocked: break` par :
```swift
        case .isLocked:
            break
        case .name(let old, let new):
            media.name = useNew ? new : old
```
`apply(to audio:)` (lignes 3301-3320) — remplacer `case .isLocked: break` par :
```swift
        case .isLocked:
            break
        case .name(let old, let new):
            audio.name = useNew ? new : old
```
`apply(to text:)` (lignes 3322-3337) — le catch-all est `case .volume, .loop, .isBackground: break`. Ajouter `.name` en case propre :
```swift
        case .name(let old, let new):
            text.name = useNew ? new : old
        case .volume, .loop, .isBackground:
            break
```

- [ ] **Step 3c: Ajouter `setClipName` au ViewModel**

Dans `TimelineViewModel+Plan4Helpers.swift`, après `setClipBackground` (ligne 232+), sur le modèle de `setClipVolume` :

```swift
    /// Renomme un clip (nom persisté sur le modèle, undoable). `nil`/vide
    /// remet le nom à `nil` (retour au tag de type par défaut).
    public func setClipName(id: String, name: String?) {
        guard let kind = clipKind(forId: id) else { return }
        let normalized = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let newName = (normalized?.isEmpty ?? true) ? nil : normalized
        let oldName: String?
        switch kind {
        case .video, .image:
            oldName = project.mediaObjects.first(where: { $0.id == id })?.name
        case .audio:
            oldName = project.audioPlayerObjects.first(where: { $0.id == id })?.name
        case .text:
            oldName = project.textObjects.first(where: { $0.id == id })?.name
        }
        guard oldName != newName else { return }
        let cmd = SetClipPropertyCommand(clipId: id, kind: kind,
                                         property: .name(old: oldName, new: newName))
        applySetClipProperty(cmd)
    }
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/TimelineViewModelClipNameTests`
Expected: PASS (2 tests). Puis suites `MeeshySDKTests` + `MeeshyUITests` complètes (le changement `ClipProperty` touche du Codable partagé) : PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelClipNameTests.swift
git commit -m "feat(sdk/timeline): undoable clip rename (SetClipProperty .name + setClipName)"
```

---

## Task 7: Résolveur de timing lié + `ClipInspector` (nom + bloc début/fin/durée)

Ajouter à `ClipInspector` un champ nom éditable et remplacer les deux `steppableTimeField` (début, durée) par un bloc à trois valeurs liées (début/fin/durée sous contrainte `fin = début + durée`).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift` (snapshot `name`, callbacks `onNameChanged`/`onEndAdjusted`, résolveur pur, UI)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift` (append/créer)

**Interfaces:**
- Consumes: `ClipInspector.timeStep` (existant, 0.1).
- Produces:
  - `ClipInspector.resolveLinkedTiming(field:start:end:duration:slideDuration:) -> (start: Float, end: Float, duration: Float)` (static pure)
  - `ClipInspector.ClipSnapshot.name: String?`
  - `ClipInspector.onNameChanged: (String?) -> Void`, `ClipInspector.onEndAdjusted: (Float) -> Void`

- [ ] **Step 1: Écrire les tests qui échouent (résolveur pur)**

Ajouter à `ClipInspectorTests.swift` :

```swift
    func test_resolveLinkedTiming_editDuration_movesEndKeepsStart() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .duration, start: 2, end: 6, duration: 5, slideDuration: 20)
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 5, accuracy: 0.001)
        XCTAssertEqual(r.end, 7, accuracy: 0.001)   // start + duration
    }

    func test_resolveLinkedTiming_editEnd_keepsStartRecomputesDuration() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .end, start: 2, end: 8, duration: 4, slideDuration: 20)
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001)
        XCTAssertEqual(r.duration, 6, accuracy: 0.001)   // end - start
    }

    func test_resolveLinkedTiming_editStart_movesClipKeepsDuration() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .start, start: 3, end: 6, duration: 4, slideDuration: 20)
        XCTAssertEqual(r.start, 3, accuracy: 0.001)
        XCTAssertEqual(r.duration, 4, accuracy: 0.001)   // duration preserved
        XCTAssertEqual(r.end, 7, accuracy: 0.001)        // start + duration
    }

    func test_resolveLinkedTiming_clampsDurationNonNegativeAndEndWithinSlide() {
        let neg = ClipInspector.resolveLinkedTiming(
            field: .end, start: 5, end: 3, duration: 2, slideDuration: 20)
        XCTAssertGreaterThanOrEqual(neg.duration, 0)      // end < start clamps duration to 0
        let over = ClipInspector.resolveLinkedTiming(
            field: .duration, start: 18, end: 19, duration: 10, slideDuration: 20)
        XCTAssertLessThanOrEqual(over.end, 20)            // end clamped to slideDuration
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ClipInspectorTests`
Expected: FAIL — `resolveLinkedTiming` / `TimingField` n'existent pas.

- [ ] **Step 3a: Résolveur pur + snapshot `name` + callbacks**

Dans `ClipInspector.swift`, ajouter le champ à `ClipSnapshot` (après `isBackground`, ligne 32) : `public let name: String?` — et l'ajouter à l'init de `ClipSnapshot` (paramètre `name: String? = nil,` + `self.name = name`).

Ajouter le résolveur pur (près de `timeStep`, ligne 108) :

```swift
    public enum TimingField: Sendable, Equatable { case start, end, duration }

    /// Résout les trois valeurs liées début/fin/durée sous la contrainte
    /// `fin = début + durée`, selon le champ édité. Clamps : durée ≥ 0,
    /// fin ≤ slideDuration, début ≥ 0. Pure — testée sans monter la vue.
    public static func resolveLinkedTiming(field: TimingField,
                                           start: Float, end: Float,
                                           duration: Float,
                                           slideDuration: Float) -> (start: Float, end: Float, duration: Float) {
        switch field {
        case .start:
            let s = max(0, min(start, slideDuration))
            let e = min(slideDuration, s + max(0, duration))
            return (s, e, e - s)
        case .duration:
            let s = max(0, start)
            let e = min(slideDuration, s + max(0, duration))
            return (s, e, e - s)
        case .end:
            let s = max(0, start)
            let e = max(s, min(end, slideDuration))
            return (s, e, e - s)
        }
    }
```

Ajouter les callbacks à `ClipInspector` (près des `let onStartAdjusted`/`onDurationAdjusted`, lignes 102-105) :

```swift
    /// Renommage du clip (nil/vide = retour au nom par défaut).
    public let onNameChanged: (String?) -> Void
    /// Ajustement de la FIN (garde le début, recalcule la durée).
    public let onEndAdjusted: (Float) -> Void
```

Les ajouter à l'init (avec défauts no-op, comme les autres) :

```swift
                onStartAdjusted: @escaping (Float) -> Void = { _ in },
                onDurationAdjusted: @escaping (Float) -> Void = { _ in },
                onNameChanged: @escaping (String?) -> Void = { _ in },
                onEndAdjusted: @escaping (Float) -> Void = { _ in }) {
        ...
        self.onStartAdjusted = onStartAdjusted
        self.onDurationAdjusted = onDurationAdjusted
        self.onNameChanged = onNameChanged
        self.onEndAdjusted = onEndAdjusted
```

- [ ] **Step 3b: UI — champ nom + troisième champ fin**

Ajouter un `@State private var draftName: String` initialisé depuis `clip.name ?? ""` dans l'init (`_draftName = State(initialValue: clip.name ?? "")`), et le resync dans le `.adaptiveOnChange(of: clip)` (ajouter `draftName = newClip.name ?? ""`).

Dans `header` (lignes 279-317), remplacer le `Text(clip.displayName)` (ligne 285-288) par un `TextField` de nom (commit sur fin d'édition) :

```swift
            TextField(
                String(localized: "story.timeline.inspector.name.placeholder",
                       defaultValue: "Nom de la piste", bundle: .module),
                text: $draftName
            )
            .font(.headline)
            .textInputAutocapitalization(.words)
            .submitLabel(.done)
            .onSubmit { onNameChanged(draftName) }
            .lineLimit(1)
```

Dans `metadataRow` (lignes 342-357), ajouter un troisième `steppableTimeField` pour la fin, et brancher chaque champ via le résolveur. Remplacer `metadataRow` par :

```swift
    private var metadataRow: some View {
        let end = clip.startTime + clip.duration
        return HStack(spacing: 12) {
            steppableTimeField(
                title: String(localized: "story.timeline.inspector.start",
                              defaultValue: "Début", bundle: .module),
                value: clip.startTime,
                onAdjust: onStartAdjusted
            )
            steppableTimeField(
                title: String(localized: "story.timeline.inspector.end",
                              defaultValue: "Fin", bundle: .module),
                value: end,
                onAdjust: onEndAdjusted
            )
            steppableTimeField(
                title: String(localized: "story.timeline.inspector.duration",
                              defaultValue: "Durée", bundle: .module),
                value: clip.duration,
                onAdjust: onDurationAdjusted
            )
        }
    }
```

Note : `onStartAdjusted`/`onDurationAdjusted` restent des DELTAS (±timeStep) branchés côté conteneur sur `dragClip`/`trimClipEnd` (déjà en place). `onEndAdjusted` (nouveau delta) sera branché côté conteneur (Task 8) sur `trimClipEnd` (bouger la fin = trim de fin). Le résolveur pur `resolveLinkedTiming` sert de source de vérité testée pour la règle, réutilisable si un futur champ passe en saisie absolue ; ici les trois champs restent des steppers ±0,1 s cohérents avec l'UI existante.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ClipInspectorTests`
Expected: PASS. Suite `MeeshyUITests` complète : PASS (le `ClipSnapshot` gagne un champ à défaut nil — vérifier que les constructions existantes de `ClipSnapshot` compilent toujours ; le défaut `name: String? = nil` les couvre).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift
git commit -m "feat(sdk/timeline): ClipInspector gains name field + linked start/end/duration block"
```

---

## Task 8: Long-press → sheet (Quick) / popover (Pro), câblage nom + fin

Router le nom et la fin depuis `ClipInspector` vers `TimelineViewModel`, propager `name` dans `resolveClipSnapshot`, et monter l'inspecteur en Simple via un vrai `.sheet` déclenché au long-press.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift` (propager `name` dans `resolveClipSnapshot`, ajouter `onNameChanged`/`onEndAdjusted` au call site, long-press = ouvre inspecteur)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift` (état `inspectorClipId`, `.sheet`, long-press ouvre le sheet)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewTests.swift` (append — assertion snapshot `name`)

**Interfaces:**
- Consumes: `TimelineViewModel.setClipName`, `trimClipEnd`, `dragClip`, `selectClip` (existants/Task 6) ; `ClipInspector(presentation:.sheet)`, `resolveLinkedTiming` (Task 7).
- Produces: rien pour d'autres tasks.

- [ ] **Step 1: Écrire le test qui échoue (snapshot propage name)**

Append à `ProTimelineViewTests.swift` (ou créer) :

```swift
    func test_resolveClipSnapshot_propagatesName() async {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        var m = StoryMediaObject(id: "m1", postMediaId: "p", kind: .image, aspectRatio: 1)
        m.name = "Intro"
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              mediaObjects: [m], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        vm.selectClip(id: "m1")
        let snap = ProTimelineView.resolveClipSnapshot(viewModel: vm)
        XCTAssertEqual(snap?.name, "Intro")
    }
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ProTimelineViewTests`
Expected: FAIL — `snap?.name` est nil (le résolveur ne propage pas encore `name`).

- [ ] **Step 3a: Propager `name` dans `resolveClipSnapshot` + ajouter la branche texte**

Dans `ProTimelineView.swift`, `resolveClipSnapshot` (lignes 102-145) : ajouter `name: media.name` au `ClipInspector.ClipSnapshot(...)` de la branche média (après `isBackground: media.isBackground`) et `name: audio.name` à la branche audio.

`resolveClipSnapshot` ne gère aujourd'hui QUE média + audio (retourne `nil` pour le texte) — donc sans ajout, le long-press sur un TEXTE n'ouvrirait aucun sheet, alors que le spec l'exige. Ajouter une branche texte AVANT le `return nil` final :

```swift
        if let text = viewModel.project.textObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: text.id,
                displayName: text.text,
                kind: .text,
                startTime: Float(text.startTime ?? 0),
                duration: Float(text.duration ?? 0),
                volume: 1.0,                    // le texte n'a pas de volume ; slider masqué (hasAudioAffordances(.text) == false)
                fadeInDuration: Float(text.fadeIn ?? 0),
                fadeOutDuration: Float(text.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: text.name
            )
        }
        return nil
```

Ajouter aussi un test dans `ProTimelineViewTests.swift` : un `StoryTextObject` sélectionné → `resolveClipSnapshot` renvoie `kind == .text` et propage `name`.

- [ ] **Step 3b: Câbler les nouveaux callbacks au call site Pro**

Dans `clipInspectorOverlay` (lignes 507-536), ajouter après `onDurationAdjusted` :

```swift
            onNameChanged: { [viewModel] name in
                viewModel.setClipName(id: clipId, name: name)
            },
            onEndAdjusted: { [viewModel] delta in
                viewModel.trimClipEnd(id: clipId, deltaTimeSeconds: delta)
            }
```

- [ ] **Step 3c: Long-press ouvre l'inspecteur (Pro = équivalent tap)**

Dans `ProTimelineView.clipBar(...)`, chaque `onLongPress` fait aujourd'hui `viewModel.selectClip(id:)` — c'est déjà ce qui ouvre le popover (via l'overlay). Aucun changement fonctionnel nécessaire en Pro : le long-press sélectionne, l'overlay popover s'affiche. Confirmer par vérif visuelle (Step 5).

- [ ] **Step 3d: Quick — état + `.sheet` + long-press**

Dans `QuickTimelineView.swift`, ajouter l'état (près de `@State private var isExpanded`, ligne 14) :

```swift
    @State private var inspectorClipId: String?
```

Dans chaque `clipBar(...)` de Quick (média, audio, texte), remplacer `onLongPress: { viewModel.selectClip(id: <id>) }` par :

```swift
                onLongPress: {
                    viewModel.selectClip(id: <id>)
                    inspectorClipId = <id>
                },
```

(où `<id>` = `media.id` / `audio.id` / `text.id` selon la branche.)

Ajouter le `.sheet` sur le `body` du `QuickTimelineView` (après `.accessibilityLabel(...)`, ligne 225) :

```swift
        .sheet(item: Binding(
            get: { inspectorClipId.map { ClipIdItem(id: $0) } },
            set: { inspectorClipId = $0?.id }
        )) { item in
            if let snapshot = ProTimelineView.resolveClipSnapshot(viewModel: viewModel),
               snapshot.id == item.id {
                ClipInspector(
                    presentation: .sheet,
                    clip: snapshot,
                    onVolumeChanged: { viewModel.setClipVolume(id: item.id, volume: $0) },
                    onFadeInChanged: { viewModel.setClipFadeIn(id: item.id, fadeIn: $0) },
                    onFadeOutChanged: { viewModel.setClipFadeOut(id: item.id, fadeOut: $0) },
                    onLoopToggled: { viewModel.setClipLoop(id: item.id, isLooping: $0) },
                    onBackgroundToggled: { viewModel.setClipBackground(id: item.id, isBackground: $0) },
                    onAddKeyframe: { viewModel.addKeyframeAtPlayhead() },
                    onDelete: { viewModel.deleteClip(id: item.id); inspectorClipId = nil },
                    onClose: { inspectorClipId = nil },
                    onStartAdjusted: { viewModel.dragClip(id: item.id, deltaTimeSeconds: $0, isCommitted: true) },
                    onDurationAdjusted: { viewModel.trimClipEnd(id: item.id, deltaTimeSeconds: $0) },
                    onNameChanged: { viewModel.setClipName(id: item.id, name: $0) },
                    onEndAdjusted: { viewModel.trimClipEnd(id: item.id, deltaTimeSeconds: $0) }
                )
                .presentationDetents([.medium, .large])
                .adaptiveSheetGlassBackground()
            }
        }
```

Ajouter le type d'item `Identifiable` en haut du fichier (hors de la struct, ou en type imbriqué) :

```swift
private struct ClipIdItem: Identifiable { let id: String }
```

- [ ] **Step 4: Lancer le test + build**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshyUITests/ProTimelineViewTests`
Expected: PASS. Puis `./apps/ios/meeshy.sh build` : build vert. Suite `MeeshyUITests` complète : PASS.

- [ ] **Step 5: Vérification simulateur (long-press → sheet)**

Installer, ouvrir l'éditeur Timeline en Simple, long-press sur une piste → le sheet nom/timing s'ouvre ; renommer, fermer, rouvrir → le nom persiste et apparaît sur l'étiquette (Task 3). En Pro, long-press sélectionne et affiche le popover.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/ProTimelineViewTests.swift
git commit -m "feat(sdk/timeline): long-press opens clip config (sheet in Simple, popover in Pro) with name + timing"
```

---

## Task 9: Parité du coin arrondi du sheet (Simple = Pro)

Corriger le coin carré du sheet en Simple (Pro est correct). Le rayon `bandShape` (24 pt) est identique au code entre les deux modes ; la différence de rendu vient de la structure de sous-arbre. Après les Tasks 2/3 (qui ont changé cette structure : GeometryReader, hauteurs), **d'abord re-vérifier** si le bug reproduit encore, puis appliquer un clip déterministe si besoin.

**Files:**
- Modify (si besoin): `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift` (clip du contenu à `bandShape`)

**Interfaces:** aucune (changement visuel).

- [ ] **Step 1: Re-vérifier le bug sur simulateur**

`git status --short` (constraint globale — s'assurer qu'aucun travail concurrent n'est en vol sur `ComposerBottomBand.swift`). Build + install. Ouvrir l'éditeur Timeline. Basculer Simple↔Pro et capturer le coin haut-gauche/haut-droit :

```bash
xcrun simctl io <UDID> screenshot /tmp/pro.png   # en Pro
xcrun simctl io <UDID> screenshot /tmp/simple.png # en Simple
python3 - <<'PY'
from PIL import Image
for label,p in [("PRO","/tmp/pro.png"),("SIMPLE","/tmp/simple.png")]:
    im=Image.open(p).convert('RGB'); px=im.load(); w,h=im.size
    # première ligne non-noire près du haut du panneau, mesurer l'indentation du coin
    for y in range(0,h):
        x=0
        while x<w and sum(px[x,y])<30: x+=1
        if x<w:
            print(label,"top y=",y,"left-indent=",x); break
PY
```

Si `left-indent` en Simple est ~0 et en Pro > 10, le bug persiste → Step 2. S'il a disparu (Tasks 2/3 l'ont incidemment corrigé), **sauter à Step 4** (documenter, pas de code).

- [ ] **Step 2: Appliquer un clip déterministe**

Dans `ComposerBottomBand.swift`, `body` (lignes 79-152), ajouter un `.clipShape(Self.bandShape)` APRÈS `.background(bandBackground)` (ligne 149) et AVANT `.shadow(...)` (ligne 150), pour que le contenu ne puisse jamais peindre dans les coins quelle que soit la structure Quick/Pro :

```swift
        .frame(maxWidth: .infinity)
        .background(bandBackground)
        .clipShape(Self.bandShape)
        .shadow(color: .black.opacity(0.25), radius: 14, y: -6)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: stateKey)
```

- [ ] **Step 3: Re-capturer et confirmer la parité**

Re-lancer le script du Step 1. Attendu : `left-indent` identique (±1 px) entre Simple et Pro, > 0 dans les deux. Confirmer aussi que l'ombre (`.shadow`) et le verre (`.glassEffect`, à l'intérieur de `bandBackground`) rendent toujours correctement (pas de coin dur du verre, pas d'ombre rognée) — le `.clipShape` étant appliqué après `bandBackground` mais avant `.shadow`.

- [ ] **Step 4: Build + commit**

`./apps/ios/meeshy.sh build` : vert.

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift
git commit -m "fix(sdk/story): clip composer band content to bandShape so Simple sheet keeps rounded corners"
```

(Si Step 1 a montré que le bug avait disparu : pas de commit de code — noter dans le rapport de vérif final que la parité était déjà rétablie par les Tasks 2/3.)

---

## Task 10: Vérification bout-en-bout sur simulateur

**Aucun code de production** — vérification manuelle/scriptée de tous les points.

- [ ] **Step 1:** Build frais `./apps/ios/meeshy.sh build`, install sur le simulateur iOS 26 (UDID `C295B364-8CA6-4214-BC52-E411A97EBFE2`) et lancer. Générer un média distinguable (ex. `ffmpeg -f lavfi -i testsrc` + image `drawtext`) et le semer via `xcrun simctl addmedia` (les assets synthétiques unis du simu ne permettent pas de valider le rendu).
- [ ] **Step 2:** Créer une slide avec image + vidéo + audio + texte. Ouvrir l'éditeur Timeline.
- [ ] **Step 3 (A):** Basculer Simple↔Pro plusieurs fois → coin arrondi du sheet stable et identique (script pixel du Step 1 de la Task 9).
- [ ] **Step 4 (B):** À durée courte, le ruler et les pistes s'étendent jusqu'au bord droit du sheet en Simple ET en Pro ; le ruler reste aligné avec les clips.
- [ ] **Step 5 (C):** Sur iOS 26, les boutons de navigation/contrôle (rangée outils, toggle Simple/Pro, toolbar Pro, transport) sont en verre réfractif ; si un runtime < 26 est disponible, confirmer le fallback matériau/gradient identique à l'ancien.
- [ ] **Step 6 (D):** Chaque piste affiche icône + durée (ligne 1) et `TYPE_i`/nom custom (ligne 2). Trimmer/déplacer un clip → la durée de l'étiquette bouge visiblement. Aucun texte « VID… » tronqué.
- [ ] **Step 7 (E):** Long-press une piste en Simple → sheet nom/timing. Renommer → l'étiquette (D) suit. Éditer début, puis fin, puis durée → les trois restent cohérents (`fin = début + durée`). Fermer/rouvrir l'éditeur → le nom persiste. Répéter en Pro (long-press = popover).
- [ ] **Step 8:** Rapport final : lister chaque point A-E avec statut PASS/écart. Tout écart devient un constat séparé, pas un patch silencieux dans les tasks déjà committées.

---

## Note d'ordre d'implémentation

La Task 3 (étiquette enrichie) lit `m.name`/`a.name`/`t.name`, introduits par la Task 5 (champ modèle). **Implémenter dans l'ordre : 1 → 2 → 5 → 6 → 3 → 4 → 7 → 8 → 9 → 10.** (5 et 6 avant 3 pour que `trackCustomName` compile ; 4 est indépendant et peut s'insérer n'importe où après 1 ; 7/8 après 6.) Les numéros de section ci-dessus sont thématiques ; cette note fixe l'ordre d'exécution réel.
