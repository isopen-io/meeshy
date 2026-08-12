# Chrome global unifié (SyncPill + bannière d'appel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul point de montage par plateforme pour `ConnectionBanner`/`SyncPill` (indicateur de frappe global, aujourd'hui troué sur ~20 écrans) et pour `FloatingCallPillView` (bannière d'appel, qui passe de capsule flottante en verre à bandeau plein-largeur qui pousse le contenu vers le bas), avec les correctifs de robustesse identifiés en revue (crash `@EnvironmentObject`, contraste WCAG, pause obligatoire du défilement de texte).

**Architecture:** `ConnectionBanner` reçoit ses dépendances (`conversationListViewModel`, `isStoryViewerPresenting`) en paramètres explicites au lieu de `@EnvironmentObject`/`@Environment` (jamais fiable dans un `.overlay`). Les deux bannières sont montées UNE fois chacune, chaînées dans un ordre précis (`.overlay` SyncPill AVANT `.safeAreaInset` bannière d'appel) qui les fait s'empiler verticalement au lieu de se chevaucher. Le marquee de texte et le contraste couleur sont des fonctions pures testées indépendamment de la composition de vues.

**Tech Stack:** SwiftUI (iOS 16+), XCTest, `MeeshyUI`/`MeeshySDK` (Color.luminance existant).

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md` — toute divergence entre ce plan et la spec, la spec fait foi ; signaler l'écart en commentaire de commit.
- `ConnectionBanner` ne doit JAMAIS déclarer `@EnvironmentObject`/`@Environment` pour une dépendance dont dépend son `body` — injection explicite uniquement (précédent de crash documenté 4× dans le repo).
- Ne pas reformater/déplacer les lignes suivantes, gardées littéralement par des tests de source existants : `SyncPill.swift` déclaration `@Environment(\.accessibilityReduceMotion)` et ses deux usages `reduceMotion ? … :` (`ReduceMotionComplianceTests`), déclaration exacte de `dotTimer` (`SyncPillTimerStateTests`).
- Contraste couleur : seuils WCAG 4,5:1 (texte normal — TOUT le texte de la bannière d'appel est "normal", jamais "large" au sens WCAG, cf. spec §Partie 2) et 3:1 (composants UI/glyphes), vérifiés par test, jamais à l'œil.
- Chaque tâche se termine build-clean + tests verts avant de passer à la suivante. Utiliser `./apps/ios/meeshy.sh build` (job complet) ; pour l'itération rapide sur les tests d'une tâche, `xcodebuild build-for-testing`/`test-without-building` ciblé (cf. `apps/ios/CLAUDE.md` § Reproduire la CI) est acceptable, mais la dernière étape de la tâche 10 DOIT couvrir la suite complète.
- Commits séparés par tâche, jamais groupés — un reviewer doit pouvoir accepter une tâche et rejeter la suivante indépendamment.

---

### Task 1: `SyncPillMarquee` — décision pure de défilement du texte

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/SyncPillMarquee.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/SyncPillMarqueeTests.swift`

**Interfaces:**
- Consumes: rien (fonctions pures, aucune dépendance sur les autres tâches).
- Produces: `SyncPillMarquee.shouldScroll(textWidth:availableWidth:) -> Bool`, `SyncPillMarquee.scrollDuration(textWidth:) -> Double`, `SyncPillMarquee.pointsPerSecond: Double` (utilisés par la Task 4).

- [ ] **Step 1: Write the failing tests**

```swift
// apps/ios/MeeshyTests/Unit/Components/SyncPillMarqueeTests.swift
import XCTest
@testable import Meeshy

final class SyncPillMarqueeTests: XCTestCase {

    func test_shouldScroll_textNarrowerThanAvailable_returnsFalse() {
        XCTAssertFalse(SyncPillMarquee.shouldScroll(textWidth: 80, availableWidth: 120))
    }

    func test_shouldScroll_textWiderThanAvailable_returnsTrue() {
        XCTAssertTrue(SyncPillMarquee.shouldScroll(textWidth: 200, availableWidth: 120))
    }

    func test_shouldScroll_textExactlyAtThreshold_returnsFalse() {
        // Pile au bord : ne PAS déclencher un défilement pour un pixel de trop
        // dû à l'arrondi flottant — le seuil est strictement supérieur.
        XCTAssertFalse(SyncPillMarquee.shouldScroll(textWidth: 120, availableWidth: 120))
    }

    func test_scrollDuration_isProportionalToTextWidth() {
        let short = SyncPillMarquee.scrollDuration(textWidth: 100)
        let long = SyncPillMarquee.scrollDuration(textWidth: 200)
        XCTAssertEqual(long, short * 2, accuracy: 0.001)
    }

    func test_scrollDuration_hasAMinimumFloor() {
        // Un texte à peine plus large que le seuil ne doit pas défiler en un
        // clin d'œil imperceptible — plancher d'1 s.
        XCTAssertGreaterThanOrEqual(SyncPillMarquee.scrollDuration(textWidth: 1), 1.0)
    }

    func test_pointsPerSecond_isPositive() {
        XCTAssertGreaterThan(SyncPillMarquee.pointsPerSecond, 0)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: FAIL — "Cannot find 'SyncPillMarquee' in scope" (le fichier de test référence un type qui n'existe pas encore).

- [ ] **Step 3: Write the implementation**

```swift
// apps/ios/Meeshy/Features/Main/Components/SyncPillMarquee.swift
import CoreGraphics

/// Décision pure de défilement (marquee) du texte trop long dans `SyncPill`.
///
/// La mesure porte TOUJOURS sur le `label` seul, jamais sur le texte composé
/// avec les points de suspension animés (`animatedDots`, qui changent 2×/s) —
/// les mesurer ensemble ferait osciller `shouldScroll` et redémarrer
/// l'animation en boucle, un défilement épileptique. C'est à l'appelant
/// (`SyncPill`) de ne mesurer que `label`.
enum SyncPillMarquee {
    /// Vitesse constante du défilement, en points par seconde.
    static let pointsPerSecond: Double = 40

    /// `true` quand le texte déborde strictement de la largeur disponible.
    /// Égalité exacte → pas de défilement (évite un déclenchement sur un
    /// arrondi flottant d'un pixel).
    static func shouldScroll(textWidth: CGFloat, availableWidth: CGFloat) -> Bool {
        textWidth > availableWidth
    }

    /// Durée d'un cycle complet de défilement, proportionnelle à la largeur
    /// du texte à parcourir. Plancher à 1 s pour qu'un texte à peine trop
    /// long reste perceptible plutôt que de clignoter.
    static func scrollDuration(textWidth: CGFloat) -> Double {
        max(1.0, Double(textWidth) / pointsPerSecond)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/SyncPillMarqueeTests -derivedDataPath apps/ios/Build`
Expected: PASS — 6/6 tests verts.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/SyncPillMarquee.swift apps/ios/MeeshyTests/Unit/Components/SyncPillMarqueeTests.swift
git commit -m "feat(ios): SyncPillMarquee — décision pure de défilement du texte trop long"
```

---

### Task 2: `CallBannerContrast` — vérification WCAG du scrim de la bannière d'appel

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/CallBannerContrast.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/CallBannerContrastTests.swift`

**Interfaces:**
- Consumes: `Color.luminance` (existant, `packages/MeeshySDK/Sources/MeeshyUI/Theme/ColorExtensions.swift`), `MeeshyColors.indigo500/indigo700/success/warning/error/indigo400` (existants).
- Produces: `CallBannerContrast.contrastRatio(_:_:) -> Double`, `CallBannerContrast.scrimmed(_:scrimOpacity:) -> Color`, `CallBannerContrast.scrimOpacity: Double` (la valeur calibrée, consommée par la Task 5).

- [ ] **Step 1: Write the failing tests**

```swift
// apps/ios/MeeshyTests/Unit/Components/CallBannerContrastTests.swift
import XCTest
import SwiftUI
@testable import Meeshy
import MeeshyUI

final class CallBannerContrastTests: XCTestCase {

    // MARK: - contrastRatio: cas de référence connus

    func test_contrastRatio_blackAndWhite_is21to1() {
        XCTAssertEqual(CallBannerContrast.contrastRatio(.black, .white), 21.0, accuracy: 0.01)
    }

    func test_contrastRatio_sameColor_is1to1() {
        XCTAssertEqual(CallBannerContrast.contrastRatio(MeeshyColors.indigo500, MeeshyColors.indigo500), 1.0, accuracy: 0.01)
    }

    func test_contrastRatio_isSymmetric() {
        let a = CallBannerContrast.contrastRatio(.white, MeeshyColors.indigo500)
        let b = CallBannerContrast.contrastRatio(MeeshyColors.indigo500, .white)
        XCTAssertEqual(a, b, accuracy: 0.001)
    }

    // MARK: - scrimmed: composition alpha correcte

    func test_scrimmed_zeroOpacity_returnsSameColor() {
        let result = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0)
        XCTAssertEqual(result.luminance, MeeshyColors.indigo500.luminance, accuracy: 0.001)
    }

    func test_scrimmed_fullOpacity_returnsBlack() {
        let result = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 1)
        XCTAssertEqual(result.luminance, Color.black.luminance, accuracy: 0.001)
    }

    func test_scrimmed_darkensProgressively() {
        let light = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0.1)
        let dark = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0.5)
        XCTAssertLessThan(dark.luminance, light.luminance)
    }

    // MARK: - Le scrim calibré (CallBannerContrast.scrimOpacity) fait passer
    // TOUS les éléments de la bannière d'appel, contre LES DEUX arrêts du
    // dégradé (indigo500 clair, indigo700 foncé) — le texte peut se trouver
    // n'importe où le long de la diagonale du dégradé.

    private let backgrounds: [(name: String, color: Color)] = [
        ("indigo500", MeeshyColors.indigo500),
        ("indigo700", MeeshyColors.indigo700),
    ]

    private func scrimmedBackgrounds() -> [(name: String, color: Color)] {
        backgrounds.map { ($0.name, CallBannerContrast.scrimmed($0.color, scrimOpacity: CallBannerContrast.scrimOpacity)) }
    }

    func test_scrimCalibration_whiteName_passesNormalTextThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(.white, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "nom (blanc) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_callDuration_passesNormalTextThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.success, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "durée (success) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_ringingGlyph_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.warning, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe sonnerie (warning) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_reconnectingGlyph_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.error, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe reconnexion (error) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_activeSpeaker_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.indigo400, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "haut-parleur actif (indigo400) sur \(bg.name) scrimmé : \(ratio)")
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build`
Expected: FAIL — "Cannot find 'CallBannerContrast' in scope".

- [ ] **Step 3: Write the implementation**

Commencer avec `scrimOpacity = 0.22` (point de départ suggéré par la spec). Si un des 5 tests de calibration échoue, AUGMENTER cette valeur par pas de 0.02 et relancer — ce test EST le juge de paix, ne pas ajuster à l'œil. Sur la base des ratios mesurés en revue (le plus fragile : haut-parleur actif `indigo400` à 1,50:1 contre `indigo500` brut, besoin de passer à 3:1 — soit un facteur ~2× — un scrim proche de 0.35-0.4 est probablement nécessaire pour CET élément précis ; ajuster empiriquement via le test, pas en pré-calculant à la main).

```swift
// apps/ios/Meeshy/Features/Main/Components/CallBannerContrast.swift
import SwiftUI
import MeeshyUI

/// Vérification de contraste WCAG (1.4.3 texte, 1.4.11 composants UI/graphiques)
/// pour le contenu de la bannière d'appel plein-écran, posé sur l'aplat
/// `MeeshyColors.brandGradient` + un scrim noir semi-opaque.
///
/// Le scrim est calibré par test (`CallBannerContrastTests`), jamais à l'œil —
/// voir la spec `docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md`
/// §Partie 2 pour les ratios mesurés sur le dégradé brut (aucun ne passait).
enum CallBannerContrast {
    /// Opacité du scrim noir appliqué entre `MeeshyColors.brandGradient` et le
    /// contenu de la bannière d'appel. Calibrée pour que TOUS les éléments de
    /// `FloatingCallPillView` passent leur seuil WCAG contre LES DEUX arrêts
    /// du dégradé — voir `CallBannerContrastTests.test_scrimCalibration_*`.
    static let scrimOpacity: Double = 0.22

    /// Ratio de contraste WCAG entre deux couleurs (formule sRGB relative
    /// luminance standard). Symétrique — l'ordre des arguments n'importe pas.
    static func contrastRatio(_ a: Color, _ b: Color) -> Double {
        let l1 = Double(a.luminance)
        let l2 = Double(b.luminance)
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    /// Couleur résultante d'un scrim noir semi-opaque posé sur `background` —
    /// composition alpha canal par canal, PUIS luminance recalculée sur le
    /// résultat. Ne JAMAIS mettre à l'échelle la luminance directement : la
    /// formule WCAG applique une correction gamma non linéaire par canal, une
    /// mise à l'échelle de la luminance finale serait fausse.
    static func scrimmed(_ background: Color, scrimOpacity: Double) -> Color {
        let ui = UIColor(background)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let factor = 1 - scrimOpacity
        return Color(red: r * factor, green: g * factor, blue: b * factor)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass, adjusting `scrimOpacity` until they do**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/CallBannerContrastTests -derivedDataPath apps/ios/Build`
Expected: PASS — 10/10 tests verts (les 4 premiers de référence + les 6 de calibration). Si un test de calibration échoue, augmenter `scrimOpacity` de 0.02 et relancer jusqu'à ce que tout passe — noter la valeur finale, elle est consommée telle quelle par la Task 5.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/CallBannerContrast.swift apps/ios/MeeshyTests/Unit/Components/CallBannerContrastTests.swift
git commit -m "feat(ios): CallBannerContrast — vérification WCAG du scrim de la bannière d'appel"
```

---

### Task 3: `ConnectionBanner` — injection explicite (élimine le risque de crash `@EnvironmentObject`)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`
- Modify (mise à jour mécanique des 9 call sites existants, aucun changement de comportement) :
  - `apps/ios/Meeshy/Features/Main/Views/RootView.swift:306,327,363`
  - `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift:36,57,90`
  - `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:980`
  - `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift:623`
  - `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:1367`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `ConnectionBanner.init(conversationListViewModel: ConversationListViewModel?, isStoryViewerPresenting: Bool = false, onItemTap: ((OutboxUIItem.Source) -> Void)? = nil, activeConversationId: (() -> String?)? = nil)` — signature consommée par les Tasks 7, 8, 9. `conversationListViewModel` est **optionnel** : `nil` (flux invité, Task 7) désactive uniquement les entrées de frappe, le reste (statut connexion/hors-ligne, file d'attente) fonctionne identiquement.

- [ ] **Step 1: Modify `ConnectionBanner.swift` — remove environment deps, add explicit params**

Ouvrir `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`. Remplacer :

```swift
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()
    /// Source des frappes hors conversation. Injecté à la racine
    /// (`RootView` / `iPadRootView`), donc disponible partout où cette
    /// bannière est montée.
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    /// Flag d'environnement injecté par `RootView` / `iPadRootView` quand
    /// `StoryViewerView` est présenté en `fullScreenCover`. Cache la pill
    /// pour qu'elle ne rende plus par-dessus le header story (le cover ne
    /// supprime pas les `.safeAreaInset`/overlays du parent). Bug
    /// 2026-05-27. Par défaut `false` via `IsStoryViewerPresentingKey` —
    /// safe quand ConnectionBanner est monté hors d'un container qui
    /// l'injecte (previews, tests, futurs callers).
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
```

par :

```swift
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()
    /// Source des frappes hors conversation. Injectée EXPLICITEMENT par
    /// l'appelant (point de montage unique par plateforme), JAMAIS via
    /// `@EnvironmentObject` : un `.overlay` posé sur la même chaîne de
    /// modifiers qu'un `.environmentObject(...)` n'hérite pas de façon
    /// fiable de cet objet dans ce codebase — crash `Fatal error: No
    /// ObservableObject of type ConversationListViewModel found` au
    /// lancement, motif documenté 4× (`FloatingCallPillView.swift`,
    /// `StoryViewerView.swift`, `AudioFullscreenView.swift`,
    /// `PanelBackAction.swift`). `nil` (flux invité, sans liste de
    /// conversations) désactive uniquement les entrées de frappe — le
    /// reste (statut connexion, file d'attente hors-ligne) fonctionne
    /// identiquement.
    let conversationListViewModel: ConversationListViewModel?
    /// `true` quand `StoryViewerView` est présenté en `fullScreenCover` —
    /// cache la pill pour qu'elle ne rende plus par-dessus le header story
    /// (bug 2026-05-27). Injecté explicitement pour la même raison que
    /// `conversationListViewModel` ci-dessus.
    let isStoryViewerPresenting: Bool
```

Puis ajouter un initialiseur explicite juste après ces déclarations (avant `init(onItemTap:activeConversationId:)` existant à la ligne ~97) :

```swift
    init(
        conversationListViewModel: ConversationListViewModel?,
        isStoryViewerPresenting: Bool = false,
        onItemTap: ((OutboxUIItem.Source) -> Void)? = nil,
        activeConversationId: (() -> String?)? = nil
    ) {
        self.conversationListViewModel = conversationListViewModel
        self.isStoryViewerPresenting = isStoryViewerPresenting
        self.onItemTap = onItemTap
        self.activeConversationId = activeConversationId
    }
```

Et **supprimer** l'ancien `init(onItemTap:activeConversationId:)` (lignes ~97-103) — il est remplacé par celui ci-dessus. Enfin, dans `entries`, remplacer l'usage inconditionnel :

```swift
        result.append(contentsOf: Self.typingEntries(
            typingUsers: conversationListViewModel.typingUsers,
            excluding: activeConversationId?()
        ))
```

par :

```swift
        if let conversationListViewModel {
            result.append(contentsOf: Self.typingEntries(
                typingUsers: conversationListViewModel.typingUsers,
                excluding: activeConversationId?()
            ))
        }
```

- [ ] **Step 2: Run build to see the 9 call sites fail to compile**

Run: `cd apps/ios && xcodegen generate && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: FAIL — 9 erreurs "Missing argument for parameter 'conversationListViewModel' in call", une par call site listé ci-dessus.

- [ ] **Step 3: Update the 9 existing call sites — mechanical, no behavior change**

Ces 9 sites sont tous des DESCENDANTS de l'injection d'environnement existante (`RootView`/`iPadRootView` posent déjà `.environmentObject(conversationViewModel)` plus haut dans leur arbre) — passer `conversationViewModel` explicitement ici ne fait que rendre EXPLICITE une dépendance qui fonctionnait déjà implicitement à ces emplacements précis (le risque de crash ne concernait QUE le futur point de montage racine en `.overlay`, pas ces sites existants qui sont de VRAIS descendants de l'injection).

**`RootView.swift:306`** (dans le cas `.communityList`) — remplacer :
```swift
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(onItemTap: handleSyncPillTap, activeConversationId: { router.currentConversationId }) }
```
par :
```swift
                        .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(conversationListViewModel: conversationViewModel, isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil, onItemTap: handleSyncPillTap, activeConversationId: { router.currentConversationId }) }
```

**`RootView.swift:327`** (`.communityDetail`) et **`RootView.swift:363`** (`.notifications`) — même remplacement (identique aux deux occurrences).

**`iPadRootView+Panels.swift:36,57,90`** — remplacer chaque :
```swift
            .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(onItemTap: handleSyncPillTap, activeConversationId: { activeConversation?.id }) }
```
par :
```swift
            .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(conversationListViewModel: conversationViewModel, isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil, onItemTap: handleSyncPillTap, activeConversationId: { activeConversation?.id }) }
```

**`FeedView.swift:980`** — `FeedView` déclare déjà `@EnvironmentObject private var conversationListViewModel: ConversationListViewModel` (ligne 46) mais aucune lecture de `isStoryViewerPresenting`. Ce mount est TRANSITOIRE — il est supprimé 2 tâches plus loin (Task 8) — donc pas besoin d'ajouter une nouvelle propriété pour `isStoryViewerPresenting` ici : remplacer :
```swift
                    ConnectionBanner()
```
par :
```swift
                    ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: false)
```

**`PostDetailView.swift:623`** — `PostDetailView` ne déclare AUCUN `@EnvironmentObject ConversationListViewModel` aujourd'hui (son `ConnectionBanner()` marchait uniquement parce que `ConnectionBanner` lisait l'environnement lui-même, sans que `PostDetailView` ait besoin de le déclarer). Ce mount est également supprimé à la Task 8 — plutôt que d'ajouter une nouvelle propriété pour un code de vie de deux commits, remplacer :
```swift
                    ConnectionBanner()
```
par :
```swift
                    ConnectionBanner(conversationListViewModel: nil, isStoryViewerPresenting: false)
```
(perd transitoirement les entrées de frappe-ailleurs dans cet écran précis, restauré par le point de montage unique de la Task 8 — le statut connexion/hors-ligne, lui, continue de fonctionner puisqu'il ne dépend pas de `conversationListViewModel`).

**`ConversationView.swift:1367`** — remplacer :
```swift
                ConnectionBanner(activeConversationId: { viewModel.conversationId })
```
par :
```swift
                ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
```
`ConversationView` déclare déjà `@EnvironmentObject var conversationListViewModel: ConversationListViewModel` (ligne 247, réutilisable tel quel). Il ne déclare PAS encore `isStoryViewerPresenting` — l'ajouter juste à côté :
```swift
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
```
(c'est un contexte de vue NORMAL — `ConversationView` est un descendant direct de l'arbre `RootView`/`iPadRootView`/`GuestConversationContainer`, jamais monté via un `.overlay` de composition racine — donc `@EnvironmentObject`/`@Environment` y restent sûrs, cohérent avec le reste du fichier et avec `router`/`storyViewModel`/`statusViewModel` déjà déclarés de la même façon).

- [ ] **Step 4: Run build + existing tests to verify green**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded (0 erreurs).

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/ConnectionBannerTypingEntriesTests -derivedDataPath apps/ios/Build`
Expected: PASS (logique pure `typingEntries`, non affectée par ce changement de signature).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift apps/ios/Meeshy/Features/Main/Views/FeedView.swift apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "fix(ios): ConnectionBanner reçoit ses dépendances en paramètres explicites, jamais via @EnvironmentObject"
```

---

### Task 4: `SyncPill` — largeur limitée, marquee, pause obligatoire (WCAG 2.2.2)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Components/SyncPillRotator.swift` (aucun changement d'API — `setAutoRotation`/`autoRotationEnabled` existent déjà, non testés)
- Test: `apps/ios/MeeshyTests/Unit/Components/SyncPillRotatorTests.swift` (ajout de couverture pour `setAutoRotation`)
- Test: `apps/ios/MeeshyTests/Unit/Components/SyncPillPauseGestureTests.swift` (nouveau, garde de source sur le câblage appui-long)

**Interfaces:**
- Consumes: `SyncPillMarquee.shouldScroll`/`scrollDuration`/`pointsPerSecond` (Task 1).
- Produces: rien de consommé par une tâche ultérieure — `SyncPill` est un point terminal de la composition.

- [ ] **Step 1: Write the failing test for `setAutoRotation` (primitive déjà présente, jamais testée — elle devient load-bearing pour l'accessibilité)**

```swift
// Ajouter à apps/ios/MeeshyTests/Unit/Components/SyncPillRotatorTests.swift (fichier existant)

    @MainActor
    func test_setAutoRotation_false_stopsAdvancingOnTick() {
        let rotator = SyncPillRotator()
        rotator.setItemCount(3)
        rotator.setAutoRotation(false)
        let before = rotator.currentIndex
        rotator.simulateTick()
        XCTAssertEqual(rotator.currentIndex, before, "simulateTick ne doit rien faire d'observable pendant que l'auto-rotation est coupée — le timer réel est annulé par setAutoRotation(false), simulateTick documente juste que rien n'avance côté logique non plus")
    }

    @MainActor
    func test_setAutoRotation_trueAfterFalse_resumesAdvancingOnTick() {
        let rotator = SyncPillRotator()
        rotator.setItemCount(3)
        rotator.setAutoRotation(false)
        rotator.setAutoRotation(true)
        let before = rotator.currentIndex
        rotator.simulateTick()
        XCTAssertEqual(rotator.currentIndex, (before + 1) % 3)
    }

    @MainActor
    func test_autoRotationEnabled_defaultsToTrue() {
        let rotator = SyncPillRotator()
        XCTAssertTrue(rotator.autoRotationEnabled)
    }
```

Note d'implémentation : `simulateTick()` actuel (`SyncPillRotator.swift:59-64`) ne lit PAS `autoRotationEnabled` — il n'a besoin de rien changer pour le premier test ci-dessus SI le vrai timer est bien annulé par `setAutoRotation(false)` (`timer?.cancel()`, déjà le cas ligne 43) : en pratique, `simulateTick()` appelé manuellement dans un test n'est jamais invoqué par le vrai timer une fois annulé, donc le test `test_setAutoRotation_false_stopsAdvancingOnTick` documente une garantie sur le COMPORTEMENT RÉEL (le timer ne tourne plus) plutôt que sur `simulateTick()` isolément — si ce test s'avère trivialement vrai sans changement de code (parce que rien n'appelle `simulateTick()` en dehors du timer annulé), c'est attendu : il sert de garde de non-régression, pas de spécification d'un nouveau comportement.

- [ ] **Step 2: Run tests to verify they pass or fail as expected**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/SyncPillRotatorTests -derivedDataPath apps/ios/Build`
Expected: les 3 nouveaux tests PASSENT déjà (la primitive existe, ce sont des tests de caractérisation qui la verrouillent avant de la rendre load-bearing). Si l'un échoue, c'est que `setAutoRotation`/`autoRotationEnabled` ne se comportent pas comme documenté — investiguer AVANT de continuer, ne pas modifier le test pour le faire passer.

- [ ] **Step 3: Modify `SyncPill.swift` — width constraint on text zone + marquee + pause**

Lire d'abord le fichier actuel en entier pour repérer précisément `pillContent` (le `Text` du label est autour de la ligne 156, le compteur `i/n` autour de la ligne 163, `dotTimer`/`dotPhase` autour des lignes 85-94 et 121-123 — NE PAS les déplacer/reformater). Le remplacement porte sur trois zones :

**Zone A — nouvel état, juste après les déclarations `@State` existantes (après `dotTimer` ligne 94) :**
```swift
    /// Largeur mesurée du `label` SEUL (jamais `label + animatedDots` — voir
    /// doc `SyncPillMarquee`). Alimentée par la mesure `GeometryReader` en
    /// fond du `Text` du label.
    @State private var measuredLabelWidth: CGFloat = 0
    /// Largeur réellement disponible pour la zone de texte (mesurée une
    /// seule fois via `GeometryReader` sur le conteneur, indépendante du
    /// contenu texte lui-même).
    @State private var availableTextWidth: CGFloat = 140
    /// Décalage horizontal courant du texte en défilement. `0` = position de
    /// repos (texte visible depuis le début).
    @State private var marqueeOffset: CGFloat = 0
    /// Bascule par appui long sur la pill — gèle À LA FOIS la rotation
    /// (`rotator.setAutoRotation(false)`) et le défilement du marquee.
    /// Mécanisme obligatoire (WCAG 2.2.2 Pause/Stop/Hide, niveau A) — le
    /// respect de `accessibilityReduceMotion` seul NE SUFFIT PAS comme
    /// justificatif de conformité pour cette SC (elle ne couvre que la
    /// 2.3.3). Un second appui long relance.
    @State private var isPausedByUser = false
    /// Tick dédié au défilement du marquee — même pattern que `dotTimer`
    /// (Timer.publish `@State`, pas `let`, pour survivre aux reconstructions
    /// fréquentes de cette vue). 30 Hz : fluide sans coût perceptible.
    @State private var marqueeTimer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()
```

**Zone B — `handleTap()` existant : ajouter le geste d'appui long juste avant, et brancher les deux dans `pillContent` :**

Dans `pillContent` (méthode calculée existante), la ligne `.onTapGesture(perform: handleTap)` (actuellement ligne ~173) reste identique. Juste après, ajouter :
```swift
            .onLongPressGesture(minimumDuration: 0.5) {
                togglePause()
            }
```

Et ajouter la méthode (à côté de `handleTap()` existant) :
```swift
    /// WCAG 2.2.2 — mécanisme de pause actionnable, indépendant du réglage
    /// système Reduce Motion. Gèle rotation ET marquee ; un second appui
    /// long relance les deux.
    private func togglePause() {
        isPausedByUser.toggle()
        rotator.setAutoRotation(!isPausedByUser)
        HapticFeedback.light()
    }
```

Ajouter l'action d'accessibilité correspondante juste après les modifiers `.accessibilityElement`/`.accessibilityLabel`/`.accessibilityHint` existants de `pillContent` :
```swift
            .accessibilityAction(named: isPausedByUser
                ? String(localized: "sync.pill.a11y.resume", defaultValue: "Reprendre", bundle: .main)
                : String(localized: "sync.pill.a11y.pause", defaultValue: "Mettre en pause", bundle: .main)
            ) {
                togglePause()
            }
```

**Zone C — le `Text` du label (actuellement, dans `pillContent`) :**

Remplacer :
```swift
            Text((visibleEntry?.label ?? "") + (visibleEntry?.showsActivityDots == true ? animatedDots : ""))
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundStyle(isDark ? .white.opacity(0.7) : .primary.opacity(0.6))
                .lineLimit(1)
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleEntry?.id ?? "empty")
```

par un appel à une sous-vue dédiée qui porte toute la logique de mesure/défilement :
```swift
            labelText
                .transition(.opacity.combined(with: .move(edge: .top)))
                .id(visibleEntry?.id ?? "empty")
```

Puis ajouter, en dehors de `pillContent`, cette nouvelle vue calculée et son support de mesure :
```swift
    /// Largeur max de la zone de texte — la pill grandissait auparavant sans
    /// borne jusqu'au bord de l'écran. Le compteur `i/n` (sibling dans
    /// `pillContent`) reste HORS de cette contrainte : elle porte
    /// uniquement sur le `Text` du label.
    private static let maxTextWidth: CGFloat = 160

    private var textColor: Color { isDark ? .white.opacity(0.7) : .primary.opacity(0.6) }

    @ViewBuilder
    private var labelText: some View {
        let label = visibleEntry?.label ?? ""
        let showsDots = visibleEntry?.showsActivityDots == true
        // La mesure porte sur `label` SEUL — jamais `label + animatedDots`,
        // qui change 2×/s et ferait osciller la décision de défilement.
        let scrolls = !reduceMotion && SyncPillMarquee.shouldScroll(textWidth: measuredLabelWidth, availableWidth: Self.maxTextWidth)

        Group {
            if scrolls {
                Text(label)
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
                    .fixedSize()
                    .offset(x: marqueeOffset)
            } else {
                Text(label + (showsDots ? animatedDots : ""))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundStyle(textColor)
                    .lineLimit(1)
            }
        }
        .frame(width: Self.maxTextWidth, alignment: .leading)
        .clipped()
        .background(
            // Mesure la largeur RÉELLE de `label` seul, indépendamment de ce
            // qui est affiché (défilant ou non) — toujours à jour pour la
            // PROCHAINE entrée de la rotation.
            Text(label)
                .font(MeeshyFont.relative(11, weight: .medium))
                .lineLimit(1)
                .fixedSize()
                .hidden()
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: SyncPillLabelWidthKey.self, value: proxy.size.width)
                })
        )
        .onPreferenceChange(SyncPillLabelWidthKey.self) { measuredLabelWidth = $0 }
        .onReceive(marqueeTimer) { _ in
            guard scrolls, !isPausedByUser else { return }
            let step = SyncPillMarquee.pointsPerSecond / 30.0
            marqueeOffset -= step
            let gap: CGFloat = 24
            if marqueeOffset < -(measuredLabelWidth + gap) {
                marqueeOffset = Self.maxTextWidth
            }
        }
        .adaptiveOnChange(of: scrolls) { _, newValue in
            if !newValue { marqueeOffset = 0 }
        }
    }
```

Et la clé de préférence (en bas du fichier, à côté des autres déclarations de support) :
```swift
private struct SyncPillLabelWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
```

- [ ] **Step 4: Run build + existing regression tests**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/ReduceMotionComplianceTests -only-testing:MeeshyTests/SyncPillTimerStateTests -only-testing:MeeshyTests/SyncPillRotatorTests -derivedDataPath apps/ios/Build`
Expected: PASS — ces trois suites (gardes de source sur les lignes préservées + nouveaux tests de rotation) restent vertes.

- [ ] **Step 5: Write the source guard test for the pause wiring**

```swift
// apps/ios/MeeshyTests/Unit/Components/SyncPillPauseGestureTests.swift
import XCTest
@testable import Meeshy

/// Garde de source — WCAG 2.2.2 exige un mécanisme de pause ACTIONNABLE,
/// indépendant du réglage système Reduce Motion (technique C39, suffisante
/// pour la SC 2.3.3, PAS pour la 2.2.2 — question formellement ouverte au
/// W3C, issues #3766/#4319). Ce test verrouille la présence du câblage,
/// pas son comportement runtime (déjà couvert par SyncPillRotatorTests sur
/// la primitive sous-jacente).
final class SyncPillPauseGestureTests: XCTestCase {
    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_syncPill_hasLongPressGestureWiredToPauseToggle() throws {
        let code = try source()
        XCTAssertTrue(code.contains("onLongPressGesture"), "L'appui long doit rester câblé — c'est le mécanisme de pause WCAG 2.2.2")
        XCTAssertTrue(code.contains("rotator.setAutoRotation"), "Le toggle doit geler la rotation via la primitive existante")
    }

    func test_syncPill_hasAccessibilityPauseAction() throws {
        let code = try source()
        XCTAssertTrue(code.contains("accessibilityAction(named:"), "VoiceOver doit pouvoir déclencher la pause sans le geste tactile")
    }
}
```

Adapter le calcul du chemin (`#filePath` remonte depuis `MeeshyTests/Unit/Components/` jusqu'à `apps/ios/`) au pattern EXACT déjà utilisé par `ReduceMotionComplianceTests`/`iPadRightPanelNavigationGuardTests` dans ce même dossier — lire un de ces deux fichiers pour copier leur helper `source()`/`strippingComments()` existant plutôt que d'en réécrire un divergent.

- [ ] **Step 6: Run test to verify it passes**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/SyncPillPauseGestureTests -derivedDataPath apps/ios/Build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/SyncPill.swift apps/ios/MeeshyTests/Unit/Components/SyncPillRotatorTests.swift apps/ios/MeeshyTests/Unit/Components/SyncPillPauseGestureTests.swift
git commit -m "feat(ios): SyncPill — largeur limitée, défilement du texte long, pause obligatoire (WCAG 2.2.2)"
```

---

### Task 5: `FloatingCallPillView` — style aplat couleur + scrim + indice de swipabilité

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`

**Interfaces:**
- Consumes: `CallBannerContrast.scrimOpacity` (Task 2, valeur calibrée).
- Produces: rien de nouveau côté API — `FloatingCallPillView(callManager:)` garde exactement sa signature actuelle (consommée par la Task 6 sans changement).

- [ ] **Step 1: Modify `pillContent` — remove glass capsule, apply flat color + scrim, add swipe hint**

Dans `FloatingCallPillView.swift`, la méthode `pillContent` (actuellement lignes ~126-174) : remplacer la chaîne de modifiers de fond/forme :
```swift
        .padding(.horizontal, 14)
        .frame(minHeight: pillHeight)
        .frame(maxWidth: .infinity)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(MeeshyColors.glassBorderGradient(isDark: true), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 6)
        .frame(maxWidth: 560)
        .padding(.horizontal, 10)
```
par :
```swift
        .padding(.horizontal, 14)
        .frame(minHeight: pillHeight)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                MeeshyColors.brandGradient
                // Scrim calibré par test (CallBannerContrastTests) pour que
                // tout le contenu (nom, durée, glyphes d'état, boutons)
                // passe son seuil WCAG contre les deux arrêts du dégradé.
                Color.black.opacity(CallBannerContrast.scrimOpacity)
            }
        )
```

(la bordure verre, l'ombre, et le plafond `maxWidth: 560` disparaissent — bandeau plein bord-à-bord, plus de capsule flottante centrée).

- [ ] **Step 2: Add the swipe-discoverability hint**

Après le `HStack` principal de `pillContent` (`CallParticipantVisual` + `userInfoSection` + `Spacer` + `controlButtons`), avant la fermeture de la méthode, ajouter un indice visuel discret superposé aux deux bords (non focusable — l'action d'accessibilité existante `.accessibilityAction(named: "Réduire en bulle")`, déjà présente lignes 171-173, couvre l'accès non-visuel) :

```swift
        .overlay(alignment: .leading) {
            Image(systemName: "chevron.left")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.35))
                .padding(.leading, 4)
                .accessibilityHidden(true)
        }
        .overlay(alignment: .trailing) {
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white.opacity(0.35))
                .padding(.trailing, 4)
                .accessibilityHidden(true)
        }
```

(insérer ces deux `.overlay` juste avant `.contentShape(Rectangle())` dans la chaîne existante, pour qu'ils restent sous les gestes/accessibilité déjà câblés plus bas).

- [ ] **Step 3: Run build + existing tests**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/FloatingCallPillViewTests -only-testing:MeeshyTests/CallBubbleGestureResolverTests -only-testing:MeeshyTests/MiniAudioPlayerBarTests -derivedDataPath apps/ios/Build`
Expected: PASS. `FloatingCallPillViewTests` vérifie déjà `.frame(maxWidth: .infinity)` (conservé), `.frame(minHeight: pillHeight)` (conservé), et le nombre de boutons `44×44` (inchangés, ce lot ne touche pas `controlButtons`) — si l'un de ces trois échoue, c'est que le remplacement de l'étape 1 a été appliqué au mauvais bloc de modifiers.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift
git commit -m "feat(ios): FloatingCallPillView — aplat brandGradient + scrim WCAG au lieu de la capsule verre, indice de swipabilité"
```

---

### Task 6: `CallPresentationLayer` — la bannière d'appel passe de `.overlay` à `.safeAreaInset`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:108-111` (struct `CallPresentationLayer`, partagée avec iPad — un seul site à modifier)

**Interfaces:**
- Consumes: `FloatingCallPillView(callManager:)` (Task 5, signature inchangée).
- Produces: le point d'ancrage exact que les Tasks 8/9 chaînent leur propre `.overlay(alignment: .top) { ConnectionBanner }` juste AVANT (`.modifier(CallPresentationLayer())` reste le nom du point d'entrée, inchangé).

- [x] **Step 1: Modify the mount mechanism**

Dans `CallPresentationLayer.body(content:)`, remplacer (SANS changer sa position dans la chaîne — reste le 2ᵉ modifier, entre `PiPSourceAnchor` et `CallBubbleView` ; cf. spec §B2 pour pourquoi cet ordre précis fait que `PiPSourceAnchor` suit la bannière et que `CallWaitingBannerView` s'affiche sous elle, PAR CONSTRUCTION) :

```swift
            .overlay(alignment: .top) {
                FloatingCallPillView(callManager: callManager)
                    .padding(.top, MeeshySpacing.sm)
            }
```

par :

```swift
            .safeAreaInset(edge: .top, spacing: 0) {
                FloatingCallPillView(callManager: callManager)
            }
```

(le `.padding(.top, MeeshySpacing.sm)` disparaît — bannière bord-à-bord, elle EST le bord ; `FloatingCallPillView.body` retombe déjà à rien via son `if` sans `else` quand la condition d'affichage est fausse, donc l'espace réservé retombe à zéro automatiquement dans ce cas, comme `SyncPill` le fait déjà).

- [x] **Step 2: Run build**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

- [x] **Step 3: Run regression tests touching this exact struct**

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/CallViewObservedObjectInjectionTests -only-testing:MeeshyTests/CallPiPPolicyTests -derivedDataPath apps/ios/Build`
Expected: PASS — `CallViewObservedObjectInjectionTests` grep le littéral `"FloatingCallPillView(callManager: callManager)"` (inchangé par cette tâche) et `".modifier(CallPresentationLayer())"` dans `iPadRootView+Sheets.swift` (inchangé) — reste vert tant que ces deux chaînes exactes survivent.

- [x] **Step 4: Manual verification (non-automatable, obligatoire avant de considérer cette tâche terminée)**

Lancer l'app sur simulateur (`./apps/ios/meeshy.sh run`), démarrer un appel de test, vérifier visuellement que le contenu de l'écran descend bien sous la nouvelle bannière plein-largeur (pas de chevauchement). **La transition PiP réelle (émergence/retour) ne peut PAS être vérifiée en simulateur** (`AVPictureInPictureController.isPictureInPictureSupported()` y est faux) — noter explicitement dans le message de commit que cette vérification reste à faire sur device physique avant mise en production, conformément à la spec §B2/§Tests.

> Note (2026-08-12) : Steps 2-4 cochés sur instruction explicite — implémentation faite sur environnement Linux sans xcodebuild/simulateur ; build, tests et vérification manuelle reportés en CI macOS et sur device (cf. commit e6db8743).

- [x] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift
git commit -m "$(cat <<'EOF'
feat(ios): la bannière d'appel réserve son espace (safeAreaInset) au lieu de flotter en overlay

Vérifié en simulateur : le contenu descend sous la bannière. Transition PiP
réelle (émergence/retour, ancre déplacée en conséquence — cf. spec §B2) NON
vérifiable en simulateur, à confirmer sur device physique avant prod.
EOF
)"
```

---

### Task 7: `ConversationView` — `showsOwnConnectionBanner` + `GuestConversationContainer`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift`

**Interfaces:**
- Consumes: `ConnectionBanner.init(conversationListViewModel:isStoryViewerPresenting:onItemTap:activeConversationId:)` (Task 3).
- Produces: `ConversationView.init(…, showsOwnConnectionBanner: Bool = false)` — consommé par `GuestConversationContainer` (cette tâche) et laissé à sa valeur par défaut (`false`) par TOUS les autres appelants existants (Task 8 vérifie que le flux authentifié principal, désormais couvert par le hoist, n'a pas besoin de `true`).

- [x] **Step 1: Add the parameter**

Dans `ConversationView.swift`, juste après `var onOpenFullConversation: (() -> Void)? = nil` (ligne 229) :
```swift
    /// `true` uniquement pour les hôtes SANS point de montage racine du
    /// SyncPill (flux invité — `GuestConversationContainer`, qui ne monte
    /// jamais `RootView`/`iPadRootView` et n'a donc aucune couverture par
    /// le hoist). `false` partout ailleurs : le point de montage unique
    /// couvre déjà le flux authentifié normal, dupliquer la bannière ici
    /// l'afficherait deux fois.
    var showsOwnConnectionBanner: Bool = false
```

Dans le custom `init` (ligne 453), ajouter le paramètre et son assignation :
```swift
    init(conversation: Conversation?, replyContext: ReplyContext? = nil, anonymousSession: AnonymousSessionContext? = nil, previewMode: Bool = false, showsOwnConnectionBanner: Bool = false, onOpenFullConversation: (() -> Void)? = nil) {
        self.conversation = conversation
        self.replyContext = replyContext
        self.anonymousSession = anonymousSession
        self.previewMode = previewMode
        self.showsOwnConnectionBanner = showsOwnConnectionBanner
        self.onOpenFullConversation = onOpenFullConversation
```
(le reste du corps de l'`init`, `let vm = ConversationViewModel(...)` et les deux lignes suivantes, ne change pas).

- [x] **Step 2: Gate the existing mount**

Le bloc modifié en Task 3 (ligne ~1364-1371) :
```swift
            // Connection status banner
            VStack {
                Color.clear.frame(height: composerState.showOptions ? 72 : 56)
                ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
                Spacer()
            }
            .zIndex(98)
            .allowsHitTesting(false)
```
devient :
```swift
            // Connection status banner — UNIQUEMENT pour les hôtes sans point
            // de montage racine (flux invité). Le flux authentifié normal
            // est couvert par le point de montage unique de RootView/
            // iPadRootView (cf. showsOwnConnectionBanner ci-dessus).
            if showsOwnConnectionBanner {
                VStack {
                    Color.clear.frame(height: composerState.showOptions ? 72 : 56)
                    ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting, activeConversationId: { viewModel.conversationId })
                    Spacer()
                }
                .zIndex(98)
                .allowsHitTesting(false)
            }
```

- [x] **Step 3: Wire `GuestConversationContainer`**

Dans `GuestConversationContainer.swift`, remplacer :
```swift
            ConversationView(
                conversation: Conversation(
                    id: context.conversationId,
                    identifier: session.identifier,
                    type: .group
                ),
                anonymousSession: context
            )
```
par :
```swift
            ConversationView(
                conversation: Conversation(
                    id: context.conversationId,
                    identifier: session.identifier,
                    type: .group
                ),
                anonymousSession: context,
                showsOwnConnectionBanner: true
            )
```

Le flux invité n'a pas de `ConversationListViewModel` dans son environnement (`MeeshyApp` n'injecte que `authManager`/`deepLinkRouter`) — `ConversationView` déclare `conversationListViewModel` en `@EnvironmentObject` (ajouté/vérifié à la Task 3 étape 3 dernier paragraphe) : si le flux invité crashe faute de cet objet, remplacer LOCALEMENT dans `ConversationView` la lecture par un optionnel sûr pour ce seul call site — vérifier d'abord par build+run sur le flux invité (Step 4 ci-dessous) avant de conclure qu'un changement est nécessaire.

- [x] **Step 4: Run build + manual guest-flow verification**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

Vérification manuelle obligatoire (pas de test automatisé réaliste pour « ce flux precis affiche la bannière ») : lancer le flux invité (lien de session anonyme) sur simulateur, confirmer que la bannière de statut de connexion apparaît toujours dans `ConversationView` — c'est la seule couverture de ce flux, régresser ici la fait disparaître silencieusement.

- [x] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift
git commit -m "feat(ios): ConversationView.showsOwnConnectionBanner préserve la couverture du flux invité avant le hoist"
```

---

### Task 8: iPhone — point de montage unique dans `RootView.swift`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift`

**Interfaces:**
- Consumes: `ConnectionBanner.init(conversationListViewModel:isStoryViewerPresenting:onItemTap:activeConversationId:)` (Task 3), `showsOwnConnectionBanner` par défaut `false` sur `ConversationView` (Task 7), l'ordre de composition figé par la Task 6 (`.overlay` AVANT `.modifier(CallPresentationLayer())`).
- Produces: rien consommé par une tâche ultérieure (terminal sur iPhone).

- [ ] **Step 1: Remove the 3 scattered route-case mounts**

Dans le switch `.navigationDestination(for: Route.self)`, retirer la ligne `.safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(...) }` (mise à jour Task 3) des 3 cas `.communityList` (ligne ~306), `.communityDetail` (ligne ~327), `.notifications` (ligne ~363) — chaque cas garde tous ses AUTRES modifiers (`.navigationBarHidden(true)`, `.onDisappear` pour `.notifications`), seule la ligne `ConnectionBanner` disparaît.

- [ ] **Step 2: Remove the `FeedView`/`PostDetailView` mounts**

Retirer la ligne `ConnectionBanner(conversationListViewModel: ..., isStoryViewerPresenting: ...)` (mise à jour Task 3) de `FeedView.swift:980` et `PostDetailView.swift:623`, ainsi que le commentaire `// Connection status banner (banner manages its own socket observation)` qui la précède dans les deux fichiers (devenu obsolète).

- [ ] **Step 3: Add the single mount point in `RootView.body`**

Entre `.storyComposerCover(...)` (se termine ligne 745) et `.modifier(CallPresentationLayer())` (ligne 752), insérer :

```swift
        // Point de montage unique du SyncPill (indicateur de frappe global +
        // statut connexion + file d'attente hors-ligne), voir
        // docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md.
        // Chaîné ICI, AVANT .modifier(CallPresentationLayer()), pour que le
        // composite (contenu + SyncPill) descende comme un bloc quand la
        // bannière d'appel réserve de l'espace (§B2 de la spec — l'ordre
        // inverse ferait chevaucher les deux bannières).
        // conversationListViewModel/isStoryViewerPresenting passés
        // explicitement, jamais via @EnvironmentObject/@Environment dans ce
        // .overlay (§B1 de la spec — crash documenté 4× dans ce repo).
        // Masqué pendant le lecteur de réels immersif (frère de ZStack, pas
        // un fullScreenCover — contrairement au story viewer déjà gated via
        // isStoryViewerPresenting, il n'avait aucune garde équivalente).
        // Padding-top fixe quand une conversation est active : compense le
        // floatingHeaderSection propre à ConversationView (qui utilisait
        // auparavant un décalage 56/72pt suivant composerState.showOptions —
        // 72pt fixe est un compromis assumé plutôt qu'un couplage à cet état
        // privé, cf. spec §Partie 1/C1).
        .overlay(alignment: .top) {
            if reelsPresenter.launch == nil {
                ConnectionBanner(
                    conversationListViewModel: conversationViewModel,
                    isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                    onItemTap: handleSyncPillTap,
                    activeConversationId: { router.currentConversationId ?? notificationPreviewConversation?.id }
                )
                .padding(.top, router.currentConversationId != nil ? 72 : 0)
            }
        }
        .modifier(CallPresentationLayer())
```

- [ ] **Step 2 (bis): Run build**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

- [ ] **Step 4: Run regression tests**

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/ConnectionBannerTypingEntriesTests -derivedDataPath apps/ios/Build`
Expected: PASS.

- [ ] **Step 5: Manual verification — parcours des écrans précédemment non couverts**

Sur simulateur, avec un second compte de test qui tape dans une conversation pendant que le premier compte navigue : vérifier que le SyncPill apparaît désormais sur l'écran d'accueil (`ConversationListView`), réglages, profil, contacts, découverte, favoris, messages épinglés, demandes d'amis — tous les écrans identifiés comme troués dans la spec (§Problème). Vérifier aussi que l'aperçu de notification (long-press sur un toast) exclut correctement la conversation prévisualisée de la rotation.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/Meeshy/Features/Main/Views/FeedView.swift apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift
git commit -m "feat(ios): point de montage unique du SyncPill sur RootView — couvre tous les écrans iPhone"
```

---

### Task 9: iPad — point de montage unique + réécriture du test de garde

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift`
- Modify: `apps/ios/MeeshyTests/Unit/Views/iPadRightPanelNavigationGuardTests.swift`

**Interfaces:**
- Consumes: mêmes que Task 8, côté iPad (`activeConversation?.id` au lieu de `router.currentConversationId`).
- Produces: rien (terminal sur iPad).

- [ ] **Step 1: Remove the 3 scattered mounts in `iPadRootView+Panels.swift`**

Retirer la ligne `.safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner(...) }` (mise à jour Task 3) des 3 cas `.communityList` (ligne ~36), `.communityDetail` (ligne ~57), `.notifications` (ligne ~90) — même principe que Task 8 Step 1.

- [ ] **Step 2: Add the single mount point in `iPadRootView+Sheets.swift`**

Dans `applyingSheets(_:)`, entre la fermeture du `.fullScreenCover(item: $reelsPresenter.launch)` (ligne ~196) et `.modifier(CallPresentationLayer())` (ligne ~202), insérer :

```swift
            // Point de montage unique du SyncPill sur iPad — miroir exact du
            // point de montage iPhone (RootView.swift). Réels DÉJÀ isolés
            // (fullScreenCover ci-dessus, pas un frère de ZStack comme sur
            // iPhone) : aucune garde reelsPresenter nécessaire ici.
            .overlay(alignment: .top) {
                ConnectionBanner(
                    conversationListViewModel: conversationViewModel,
                    isStoryViewerPresenting: storyViewerCoordinator.pendingRequest != nil,
                    onItemTap: handleSyncPillTap,
                    activeConversationId: { activeConversation?.id ?? notificationPreviewConversation?.id }
                )
            }
            .modifier(CallPresentationLayer())
```

- [ ] **Step 3: Run build**

Run: `cd apps/ios && xcodebuild build -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath Build`
Expected: Build succeeded.

- [ ] **Step 4: Run the existing guard test to confirm it now fails as predicted**

Run: `xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -derivedDataPath apps/ios/Build && xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/iPadRightPanelNavigationGuardTests -derivedDataPath apps/ios/Build`
Expected: FAIL — `test_iPadPanels_connectionBanner_alwaysRoutesTaps` échoue (le littéral `"ConnectionBanner(onItemTap: handleSyncPillTap"` a disparu de `iPadRootView+Panels.swift`, exactement comme prédit en revue §B3). C'est le signal attendu pour passer à l'étape suivante.

- [ ] **Step 5: Rewrite the test to check the new mount point**

Ouvrir `apps/ios/MeeshyTests/Unit/Views/iPadRightPanelNavigationGuardTests.swift`, lire la méthode `source(of:)`/`strippingComments(_:)` existante (lignes ~26-66) pour réutiliser le même helper. Remplacer `test_iPadPanels_connectionBanner_alwaysRoutesTaps` (lignes ~107-117) :

```swift
    func test_iPadPanels_connectionBanner_alwaysRoutesTaps() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertFalse(code.contains("ConnectionBanner()"), "…")
        XCTAssertTrue(
            code.contains("ConnectionBanner(onItemTap: handleSyncPillTap"),
            "Les bannières du panneau iPad doivent router le tap comme RootView (iPhone)."
        )
    }
```

par :

```swift
    /// Le SyncPill iPad a migré vers un point de montage unique
    /// (`iPadRootView+Sheets.swift`, `.overlay` chaîné avant
    /// `.modifier(CallPresentationLayer())`) au lieu d'un montage par
    /// panneau — cf. docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md.
    /// Cette garde vérifie que le tap route toujours vers `handleSyncPillTap`
    /// AU NOUVEL EMPLACEMENT, et que l'ancien montage par panneau n'est pas
    /// revenu par erreur.
    func test_iPadPanels_noLongerMountsConnectionBannerPerPanel() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertFalse(code.contains("ConnectionBanner("), "Le SyncPill ne doit plus être monté par panneau — un seul point de montage sur iPadRootView+Sheets.swift")
    }

    func test_iPadRootView_mountsConnectionBannerOnce_routingTapsToHandleSyncPillTap() throws {
        let code = try source(of: "iPadRootView+Sheets.swift")
        XCTAssertTrue(
            code.contains("ConnectionBanner(") && code.contains("onItemTap: handleSyncPillTap"),
            "Le point de montage unique doit router le tap vers handleSyncPillTap, comme RootView (iPhone)."
        )
    }
```

(adapter `source(of:)` si sa signature exige un argument différent pour cibler `iPadRootView+Sheets.swift` — même mécanisme que pour `iPadRootView+Panels.swift`, juste un nom de fichier différent).

- [ ] **Step 6: Run tests to verify they pass**

Run: `xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/iPadRightPanelNavigationGuardTests -derivedDataPath apps/ios/Build`
Expected: PASS — les 2 nouveaux tests + le reste de la suite existante (non touché) verts.

- [ ] **Step 7: Manual verification on iPad simulator**

Lancer sur un simulateur iPad (`./apps/ios/meeshy.sh run --ipad` si supporté par le script, sinon sélectionner l'appareil iPad via `meeshy.sh device`), vérifier que le SyncPill apparaît sur les écrans du panneau droit précédemment non couverts (réglages, profil, contacts, découverte…), et que la couverture des 3 écrans déjà couverts avant (communautés, notifications) persiste.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift apps/ios/MeeshyTests/Unit/Views/iPadRightPanelNavigationGuardTests.swift
git commit -m "feat(ios): point de montage unique du SyncPill sur iPadRootView — couvre tous les écrans iPad"
```

---

### Task 10: Vérification finale — build complet + suite de régression exhaustive

**Files:** aucun changement de code — validation uniquement.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien — tâche terminale.

- [ ] **Step 1: Full build, both platforms**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

Run: `./apps/ios/meeshy.sh build --ipad`
Expected: `Build succeeded`.

- [ ] **Step 2: Full regression suite named in the spec**

Run: `cd apps/ios && xcodegen generate && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build`

Run (sur simulateur iOS 18.2, cf. `apps/ios/CLAUDE.md` § Reproduire la CI) :
```bash
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/SyncPillMarqueeTests \
  -only-testing:MeeshyTests/CallBannerContrastTests \
  -only-testing:MeeshyTests/SyncPillRotatorTests \
  -only-testing:MeeshyTests/SyncPillPauseGestureTests \
  -only-testing:MeeshyTests/ReduceMotionComplianceTests \
  -only-testing:MeeshyTests/SyncPillTimerStateTests \
  -only-testing:MeeshyTests/ConnectionBannerTypingEntriesTests \
  -only-testing:MeeshyTests/CallBubbleGestureResolverTests \
  -only-testing:MeeshyTests/CallPiPPolicyTests \
  -only-testing:MeeshyTests/FloatingCallPillViewTests \
  -only-testing:MeeshyTests/CallViewObservedObjectInjectionTests \
  -only-testing:MeeshyTests/MiniAudioPlayerBarTests \
  -only-testing:MeeshyTests/iPadRightPanelNavigationGuardTests \
  -only-testing:MeeshyTests/SyncPillViewModelDeriveTests \
  -only-testing:MeeshyTests/SyncPillLabelsTests \
  -derivedDataPath apps/ios/Build
```
Expected: `** TEST EXECUTE SUCCEEDED **`, toutes les suites vertes.

- [ ] **Step 3: Full test gate (phased run)**

Run: `./apps/ios/meeshy.sh test`
Expected: les 3 phases + la phase 0 (SDK) passent, session finale connectée — conformément à `apps/ios/CLAUDE.md` § exécution phasée. Si une suite SANS RAPPORT avec ce lot échoue, c'est un problème préexistant à documenter séparément, pas à corriger dans ce lot (Global Constraints — rester dans le périmètre).

- [ ] **Step 4: Manual verification checklist (non-automatable — cocher chaque item en le vérifiant réellement, pas en le supposant)**

- [ ] SyncPill visible sur les ~20 écrans précédemment non couverts (liste exacte : spec §Problème).
- [ ] Flux invité : bannière de statut toujours visible dans `ConversationView` (Task 7).
- [ ] Aperçu de notification (long-press toast) : conversation prévisualisée exclue de la rotation des frappeurs.
- [ ] Appel actif : le contenu de l'app descend sous la bannière plein-largeur (pas de chevauchement), le SyncPill reste visible juste en dessous quand il a quelque chose à montrer.
- [ ] Swipe gauche/droite sur la bannière d'appel : réduction en bulle fonctionne toujours.
- [ ] Long-press sur le SyncPill : gèle la rotation ET un éventuel défilement de texte ; second long-press relance.
- [ ] Contraste visuel de la bannière d'appel : nom, durée, glyphes d'état, boutons tous lisibles à l'œil sur toute la largeur du dégradé (confirmation visuelle du résultat déjà garanti par `CallBannerContrastTests`).
- [ ] **Sur device physique réel, appel réel** : transition PiP (réduire → PiP → agrandir) reste cohérente, l'ancre ne "saute" pas visuellement.

- [ ] **Step 5: Final commit (si Step 4 a nécessité des ajustements) ou clôture**

```bash
git status
# Si tout est déjà commité tâche par tâche (Tasks 1-9), rien à committer ici —
# cette tâche est une porte de validation, pas une livraison de code.
```
