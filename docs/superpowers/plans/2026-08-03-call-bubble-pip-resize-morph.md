# Bulle d'appel — redimensionnement PiP par pinch + fix long-press — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the minimized call bubble (`CallBubbleView`) 4 pinch-resizable size tiers (circle → small/medium/large rectangle, 9:16), with a continuous shape morph, a persistent mute/speaker/hangup bar at the rectangle tiers, and a fixed long-press menu that no longer blocks the rest of the screen behind an invisible full-screen dismiss layer.

**Architecture:** A new `CallBubbleSizeTier` enum (`.circle/.small/.medium/.large`) lives on `CallManager.bubbleSizeTier`, orthogonal to `displayMode`. `CallBubbleGestureResolver` gains pure functions mapping a continuous `progress: CGFloat` (0...3) to size/corner-radius/control-bar-opacity, plus a scale→progress mapper and a release-time snap-to-nearest-tier resolver. `CallParticipantVisual` — already shared between the pill (44pt circle) and the bubble (56pt circle) — gets a second, rectangle-capable initializer so its `RoundedRectangle(cornerRadius:)` clip renders either a perfect circle (existing call sites, unchanged) or an arbitrary rectangle (new PiP tiers), which is what makes the morph continuous without a custom `Shape`. `CallBubbleView` drives all of this off a single `MagnificationGesture`, live during the pinch, snapping on release.

**Tech Stack:** SwiftUI (iOS 16.0+ floor), XCTest source-inspection tests (this project's established convention for SwiftUI view wiring — no runtime gesture-simulation harness, see `apps/ios/CLAUDE.md`).

## Global Constraints

- iOS 16.0+ floor — no iOS 17+-only APIs (`MagnificationGesture`, `.accessibilityAdjustableAction`, `RoundedRectangle(cornerRadius:style:)` are all iOS 13+/15+, fine).
- No SDK changes — everything in this plan is app-level (`apps/ios/Meeshy/Features/Main/...`), per `apps/ios/CLAUDE.md`'s SDK-purity rule (this is orchestration/UX, not a reusable atom).
- Test convention: XCTest reading the target `.swift` file as a string and asserting on its content (no XCUITest / gesture simulation), matching every existing test in `CallBubbleViewMiniMenuWiringTests.swift`, `CallBubbleGestureResolverTests.swift`, `FloatingCallPillViewTests.swift`.
- `./apps/ios/meeshy.sh build` / `test` — never call `xcodebuild` directly (per `apps/ios/CLAUDE.md`).
- Spec: `docs/superpowers/specs/2026-08-03-call-bubble-pip-resize-morph-design.md` — every task below traces back to a section of it.

---

### Task 1: State plumbing — `CallBubbleSizeTier` + `CallManager.bubbleSizeTier`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift:934` (right after `enum BubbleHorizontalEdge`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:270` (right after `bubbleVerticalFraction`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift:354-372` (`collapseToBubble`)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift` (inside `CallManagerBubblePositionTests`, after line 6045)
- Test: `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift` (inside `FloatingCallPillViewTests`, after `test_pillContent_delegatesAvatarToCallParticipantVisual`)

**Interfaces:**
- Produces: `enum CallBubbleSizeTier: Int, Sendable, CaseIterable { case circle = 0, small = 1, medium = 2, large = 3 }`; `CallManager.bubbleSizeTier: CallBubbleSizeTier` (`@Published`, default `.circle`).

- [ ] **Step 1: Write the failing tests**

In `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`, inside `CallManagerBubblePositionTests` (after `test_bubbleVerticalFraction_defaultsNearTop`, line 6045):

```swift
    func test_bubbleSizeTier_defaultsToCircle() {
        XCTAssertEqual(CallManager.shared.bubbleSizeTier, .circle)
    }
```

In `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift`, inside `FloatingCallPillViewTests` (after `test_pillContent_delegatesAvatarToCallParticipantVisual`, around line 227):

```swift
    func test_collapseToBubble_resetsSizeTierToCircle() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private func collapseToBubble(exitTranslation: CGFloat) {") else {
            XCTFail("collapseToBubble not found in FloatingCallPillView.swift"); return
        }
        let end = source.range(of: "\n    // MARK: - Actions", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("callManager.bubbleSizeTier = .circle"),
            "collapseToBubble must reset bubbleSizeTier to .circle — the only entry point " +
            "into .bubble mode, so a PiP left enlarged in a previous session must not " +
            "reappear already expanded."
        )
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `bubbleSizeTier` does not exist on `CallManager` (compile error), `callManager.bubbleSizeTier = .circle` not found in source.

- [ ] **Step 3: Add the enum**

In `WebRTCTypes.swift`, right after `enum BubbleHorizontalEdge: Sendable { case leading, trailing }` (line 934):

```swift

/// Palier de taille du PiP quand la bulle est repliée (`.bubble` displayMode)
/// — cercle par défaut, agrandi par pincement jusqu'à `.large`. Ordre des
/// cas = ordre d'agrandissement, `rawValue` sert directement d'axe de
/// progression continue dans `CallBubbleGestureResolver`.
enum CallBubbleSizeTier: Int, Sendable, CaseIterable {
    case circle = 0
    case small = 1
    case medium = 2
    case large = 3
}
```

- [ ] **Step 4: Add the published property**

In `CallManager.swift`, right after `@Published var bubbleVerticalFraction: CGFloat = 0.08` (line 270):

```swift
    /// Palier de taille du PiP quand la bulle est repliée (`.bubble`
    /// displayMode) — cercle par défaut, agrandi par pincement jusqu'à
    /// `.large` (spec 2026-08-03-call-bubble-pip-resize-morph-design.md).
    /// Contrairement à `bubbleEdge`/`bubbleVerticalFraction` juste au-dessus
    /// (mutés par le drag de repositionnement, donc réinitialisés
    /// explicitement en fin d'appel), celui-ci n'a qu'un seul point d'entrée
    /// en mode bulle — `FloatingCallPillView.collapseToBubble()` — qui le
    /// repose déjà à `.circle` à chaque fois : pas de reset défensif
    /// redondant nécessaire ici.
    @Published var bubbleSizeTier: CallBubbleSizeTier = .circle
```

- [ ] **Step 5: Wire the reset into `collapseToBubble`**

In `FloatingCallPillView.swift`, inside `collapseToBubble(exitTranslation:)` (lines 354-372), change:

```swift
            guard callManager.callState.isActive else { return }
            callManager.displayMode = .bubble
            pillDragOffset = 0
```

to:

```swift
            guard callManager.callState.isActive else { return }
            callManager.displayMode = .bubble
            callManager.bubbleSizeTier = .circle
            pillDragOffset = 0
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift \
        apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift
git commit -m "feat(ios/call): bubbleSizeTier state, reset on entering .bubble mode"
```

---

### Task 2: Fix long-press — remove the full-screen `dismissLayer`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift:29-53, 88-92, 105-108`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallBubbleViewMiniMenuWiringTests.swift`

**Interfaces:**
- Consumes: none new.
- Produces: `.onTapGesture` on the bubble cluster now closes the mini-menu on retap instead of no-op'ing; `dismissLayer` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `CallBubbleViewMiniMenuWiringTests.swift`, add (after `test_hangupButton_hasAccessibilityHint`):

```swift

    func test_dismissLayer_isRemoved() throws {
        let source = try callBubbleViewSource()
        XCTAssertFalse(
            source.contains("dismissLayer"),
            "The full-screen dismissLayer must be gone — while it existed, ANY tap " +
            "anywhere on screen while the mini-menu was open was swallowed just to " +
            "close the menu, blocking interaction with the rest of the app."
        )
    }

    func test_tapOnBubble_whenMenuRevealed_closesMenuInstead() throws {
        let source = try callBubbleViewSource()
        guard let range = source.range(of: ".onTapGesture {") else {
            XCTFail(".onTapGesture not found in CallBubbleView.swift"); return
        }
        let end = source.range(of: ".accessibilityElement(children: .contain)", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("closeMenu()"),
            "Tapping the bubble while the mini-menu is open must close it (retap-to-dismiss) " +
            "now that the full-screen dismissLayer is gone — otherwise there is no way to " +
            "close the menu short of waiting 3s or hitting a button."
        )
        XCTAssertFalse(
            body.contains("guard !isMenuRevealed else { return }"),
            "The old no-op guard must be replaced — a tap while the menu is open must " +
            "actively close it, not do nothing."
        )
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `dismissLayer` still present; tap body still contains the old guard, not `closeMenu()`.

- [ ] **Step 3: Remove `dismissLayer` and its usage in `body`**

In `CallBubbleView.swift`, change `body` (lines 29-44) from:

```swift
    var body: some View {
        if callManager.displayMode == .bubble && callManager.callState.isActive && !callManager.isSystemPiPActive {
            GeometryReader { geometry in
                ZStack {
                    if isMenuRevealed {
                        dismissLayer
                    }
                    bubbleCluster(in: geometry)
                        .position(bubbleCenter(in: geometry))
                }
            }
            .ignoresSafeArea()
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75), value: callManager.displayMode)
        }
    }

    // MARK: - Dismiss layer (taps outside the cluster close the mini-menu)

    private var dismissLayer: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { closeMenu() }
            .accessibilityHidden(true)
    }
```

to:

```swift
    var body: some View {
        if callManager.displayMode == .bubble && callManager.callState.isActive && !callManager.isSystemPiPActive {
            GeometryReader { geometry in
                bubbleCluster(in: geometry)
                    .position(bubbleCenter(in: geometry))
            }
            .ignoresSafeArea()
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75), value: callManager.displayMode)
        }
    }
```

- [ ] **Step 4: Make retap close the menu instead of no-op'ing**

In `CallBubbleView.swift`, change the tap gesture (lines 88-92) from:

```swift
        .onTapGesture {
            guard !isMenuRevealed else { return }
            HapticFeedback.medium()
            callManager.displayMode = .fullScreen
        }
```

to:

```swift
        .onTapGesture {
            if isMenuRevealed {
                closeMenu()
            } else {
                HapticFeedback.medium()
                callManager.displayMode = .fullScreen
            }
        }
```

- [ ] **Step 5: Update the now-stale comment above the close-menu accessibility action**

In `CallBubbleView.swift`, change (lines 105-108):

```swift
        // Le calque de fermeture (dismissLayer) est `.accessibilityHidden` —
        // sans cette action, un utilisateur VoiceOver qui ouvre le mini-menu
        // n'a aucun moyen de le refermer autrement qu'attendre les 3s d'auto-
        // dismiss ou déclencher raccrocher (destructif).
```

to:

```swift
        // Retaper la bulle referme le menu (voir .onTapGesture ci-dessus),
        // mais VoiceOver navigue par swipe, pas par tap direct sur la bulle —
        // sans cette action explicite, fermer le menu exigerait d'attendre
        // les 3s d'auto-dismiss ou de déclencher raccrocher (destructif).
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — all of `CallBubbleViewMiniMenuWiringTests` green, including the 2 new tests.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift \
        apps/ios/MeeshyTests/Unit/Views/CallBubbleViewMiniMenuWiringTests.swift
git commit -m "fix(ios/call): retire le dismissLayer plein écran du mini-menu de la bulle"
```

---

### Task 3: `CallBubbleGestureResolver` — pure sizing / morph / snap functions

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallBubbleGestureResolverTests.swift`

**Interfaces:**
- Consumes: `CallBubbleSizeTier` (Task 1).
- Produces: `CallBubbleGestureResolver.size(for:) -> CGSize`, `.interpolatedSize(progress:) -> CGSize`, `.interpolatedCornerRadius(progress:) -> CGFloat`, `.controlBarOpacity(progress:) -> Double`, `.progress(startingTier:scale:) -> CGFloat`, `.nextTier(progress:velocity:) -> CallBubbleSizeTier`. Constants `rectangleCornerRadius`, `magnificationSensitivity`, `tierVelocityThreshold`.

- [ ] **Step 1: Write the failing tests**

Append to `CallBubbleGestureResolverTests.swift` (new `// MARK:` sections at the end of the class, before the closing `}`):

```swift

    // MARK: - size(for:) / interpolatedSize(progress:)

    func test_size_forEachTier() {
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .circle), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .small), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .medium), CGSize(width: 120, height: 213))
        XCTAssertEqual(CallBubbleGestureResolver.size(for: .large), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_atExactTierBoundaries_matchesSize() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 1), CGSize(width: 90, height: 160))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 3), CGSize(width: 160, height: 284))
    }

    func test_interpolatedSize_midway_isLinearMidpoint() {
        // Between .circle (56,56) and .small (90,160): midpoint (73,108).
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 0.5), CGSize(width: 73, height: 108))
    }

    func test_interpolatedSize_clampsBelowZeroAndAboveMax() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: -5), CGSize(width: 56, height: 56))
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedSize(progress: 99), CGSize(width: 160, height: 284))
    }

    // MARK: - interpolatedCornerRadius(progress:)

    func test_interpolatedCornerRadius_atCircle_isHalfDiameter() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 0), 28)
    }

    func test_interpolatedCornerRadius_atOrPastFirstRectangleTier_isFixedTwenty() {
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 1), 20)
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 2.5), 20)
    }

    func test_interpolatedCornerRadius_midwayToFirstRectangleTier_isLinearMidpoint() {
        // 28 + (20 - 28) * 0.5 = 24
        XCTAssertEqual(CallBubbleGestureResolver.interpolatedCornerRadius(progress: 0.5), 24)
    }

    // MARK: - controlBarOpacity(progress:)

    func test_controlBarOpacity_belowHalf_isZero() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0), 0)
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0.5), 0)
    }

    func test_controlBarOpacity_fadesInBetweenHalfAndOne() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 0.75), 0.5, accuracy: 0.0001)
    }

    func test_controlBarOpacity_atOrPastFirstRectangleTier_isFullyOpaque() {
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 1), 1)
        XCTAssertEqual(CallBubbleGestureResolver.controlBarOpacity(progress: 2.5), 1)
    }

    // MARK: - progress(startingTier:scale:)

    func test_progress_noScaleChange_returnsStartingTierRawValue() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .medium, scale: 1.0), 2)
    }

    func test_progress_pinchOutFromCircle_reachesSmallAtQuarterZoom() {
        // sensitivity 4: (1.25 - 1) * 4 = 1.0
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .circle, scale: 1.25), 1.0, accuracy: 0.0001)
    }

    func test_progress_pinchInFromSmall_returnsToCircleAtQuarterPinchIn() {
        // (0.75 - 1) * 4 = -1.0, starting tier .small (1) → 0
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .small, scale: 0.75), 0, accuracy: 0.0001)
    }

    func test_progress_clampsToValidRange() {
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .circle, scale: 0.2), 0)
        XCTAssertEqual(CallBubbleGestureResolver.progress(startingTier: .large, scale: 3.0), 3)
    }

    // MARK: - nextTier(progress:velocity:)

    func test_nextTier_belowMidpoint_snapsDown() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.4, velocity: 0), .circle)
    }

    func test_nextTier_aboveMidpoint_snapsUp() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.6, velocity: 0), .small)
    }

    func test_nextTier_fastOutwardFlick_skipsATierAhead() {
        // biased = 1.0 + 0.5 = 1.5 → rounds to 2 (.medium), one tier past a plain snap of .small.
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 1.0, velocity: 2.0), .medium)
    }

    func test_nextTier_fastInwardFlick_snapsATierEarlyOnTheWayDown() {
        // biased = 0.9 - 0.5 = 0.4 → rounds to 0 (.circle) even though plain progress alone (0.9) would round to 1.
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 0.9, velocity: -2.0), .circle)
    }

    func test_nextTier_clampsToValidTierRange() {
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: -1, velocity: 0), .circle)
        XCTAssertEqual(CallBubbleGestureResolver.nextTier(progress: 5, velocity: 0), .large)
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — none of these functions exist yet (compile error).

- [ ] **Step 3: Implement the resolver additions**

In `CallBubbleGestureResolver.swift`, add after `bubbleDiameter`/`fabExclusionZoneHeight` (after line 26) and before the existing `shouldCollapse` function:

```swift
    /// Rayon de coin fixe (pt) partagé par les 3 paliers rectangle — seul le
    /// palier `.circle` a un rayon dérivé (moitié du diamètre, cercle parfait).
    static let rectangleCornerRadius: CGFloat = 20
    /// Sensibilité du mapping pinch → progression : un delta d'échelle de 0.25
    /// (25% de zoom) parcourt un palier plein. Valeur de confort, ajustable au
    /// ressenti.
    static let magnificationSensitivity: CGFloat = 4
    /// Vitesse de progression (paliers/s) au-delà de laquelle un relâchement
    /// biaise le snap d'un demi-palier dans le sens du geste — même principe
    /// que `collapseVelocityThreshold` pour le drag de la pilule.
    static let tierVelocityThreshold: CGFloat = 1.5

    /// Taille (pt) du palier donné. `.circle` est un carré (cercle une fois
    /// clippé en `RoundedRectangle(cornerRadius: diameter/2)`) ; les paliers
    /// rectangle suivent un ratio 9:16, aligné sur `preferredContentSize` du
    /// PiP système (`PiPCallController.swift`).
    static func size(for tier: CallBubbleSizeTier) -> CGSize {
        switch tier {
        case .circle: return CGSize(width: bubbleDiameter, height: bubbleDiameter)
        case .small: return CGSize(width: 90, height: 160)
        case .medium: return CGSize(width: 120, height: 213)
        case .large: return CGSize(width: 160, height: 284)
        }
    }

    /// Taille interpolée linéairement pour une progression continue
    /// `0...3` (`.circle...large`), clampée aux bornes. Alimente le morphing
    /// en direct pendant le pinch — `progress` fractionnaire retombe toujours
    /// entre deux paliers adjacents.
    static func interpolatedSize(progress: CGFloat) -> CGSize {
        let maxTier = CallBubbleSizeTier.allCases.count - 1
        let clamped = min(max(progress, 0), CGFloat(maxTier))
        let lowerRaw = Int(clamped.rounded(.down))
        let upperRaw = min(lowerRaw + 1, maxTier)
        let lowerTier = CallBubbleSizeTier(rawValue: lowerRaw) ?? .circle
        let upperTier = CallBubbleSizeTier(rawValue: upperRaw) ?? .large
        let fraction = clamped - CGFloat(lowerRaw)
        let lowerSize = size(for: lowerTier)
        let upperSize = size(for: upperTier)
        return CGSize(
            width: lowerSize.width + (upperSize.width - lowerSize.width) * fraction,
            height: lowerSize.height + (upperSize.height - lowerSize.height) * fraction
        )
    }

    /// Rayon de coin interpolé. `RoundedRectangle(cornerRadius:)` rend un
    /// cercle parfait à `progress == 0` (rayon = moitié du diamètre) ; au-delà
    /// de `progress == 1` le rayon reste fixe (`rectangleCornerRadius`) — les
    /// 3 paliers rectangle partagent le même arrondi, seule la taille varie
    /// entre eux.
    static func interpolatedCornerRadius(progress: CGFloat) -> CGFloat {
        let clamped = min(max(progress, 0), CGFloat(CallBubbleSizeTier.allCases.count - 1))
        guard clamped < 1 else { return rectangleCornerRadius }
        let circleRadius = bubbleDiameter / 2
        return circleRadius + (rectangleCornerRadius - circleRadius) * clamped
    }

    /// Opacité de la barre de contrôle persistante (mute/speaker/hangup) aux
    /// paliers rectangle : invisible tant qu'on est encore proche du cercle
    /// (`progress <= 0.5`), fondu progressif jusqu'à pleine opacité à
    /// `progress == 1`.
    static func controlBarOpacity(progress: CGFloat) -> Double {
        let clamped = min(max(progress, 0), CGFloat(CallBubbleSizeTier.allCases.count - 1))
        guard clamped > 0.5 else { return 0 }
        guard clamped < 1 else { return 1 }
        return Double((clamped - 0.5) / 0.5)
    }

    /// Progression continue (0...3) correspondant à l'échelle cumulée d'un
    /// `MagnificationGesture` en cours, ancrée sur le palier de départ du
    /// geste. `scale == 1` (aucun pinch) retombe exactement sur
    /// `startingTier.rawValue`.
    static func progress(startingTier: CallBubbleSizeTier, scale: CGFloat) -> CGFloat {
        let maxTier = CGFloat(CallBubbleSizeTier.allCases.count - 1)
        let raw = CGFloat(startingTier.rawValue) + (scale - 1) * magnificationSensitivity
        return min(max(raw, 0), maxTier)
    }

    /// Palier de destination au relâchement du pinch : arrondi de `progress`
    /// au palier le plus proche, biaisé d'un demi-palier dans le sens du
    /// geste si le relâchement est rapide (flick), même principe que
    /// `shouldCollapse` pour le drag de la pilule.
    static func nextTier(progress: CGFloat, velocity: CGFloat) -> CallBubbleSizeTier {
        let maxTier = CGFloat(CallBubbleSizeTier.allCases.count - 1)
        let clamped = min(max(progress, 0), maxTier)
        let velocityBias: CGFloat = abs(velocity) > tierVelocityThreshold ? (velocity > 0 ? 0.5 : -0.5) : 0
        let biased = min(max(clamped + velocityBias, 0), maxTier)
        let rawValue = Int(biased.rounded())
        return CallBubbleSizeTier(rawValue: rawValue) ?? .circle
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift \
        apps/ios/MeeshyTests/Unit/Views/CallBubbleGestureResolverTests.swift
git commit -m "feat(ios/call): fonctions pures de morphing/snap pour les paliers PiP de la bulle"
```

---

### Task 4: `CallParticipantVisual` — support des paliers rectangle

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift` (inside `CallParticipantVisualTests`, line 359+)

**Interfaces:**
- Consumes: none new.
- Produces: `CallParticipantVisual.init(diameter:callManager:)` (unchanged behavior — kept for the pill's 44pt call and any circular call site), `CallParticipantVisual.init(width:height:cornerRadius:callManager:)` (new — for `CallBubbleView`'s rectangle tiers).

- [ ] **Step 1: Write the failing tests**

In `FloatingCallPillViewTests.swift`, inside `CallParticipantVisualTests` (after `test_resolvesRemoteProfile_cacheFirst`, before the closing `}` at line 384):

```swift

    func test_circularInit_derivesSquareFrameAndHalfRadius() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("init(diameter: CGFloat, callManager: CallManager)"),
            "The circular convenience initializer must stay so existing call sites " +
            "(pill 44pt, bubble circle tier) keep compiling unchanged."
        )
        XCTAssertTrue(
            src.contains("self.cornerRadius = diameter / 2"),
            "The circular initializer must derive cornerRadius from the diameter so " +
            "RoundedRectangle(cornerRadius:) renders a perfect circle, matching the " +
            "previous Circle()-clipped behavior exactly."
        )
    }

    func test_clipsWithRoundedRectangle_notFixedCircle() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)"),
            "The video clip shape must be a RoundedRectangle driven by the instance's " +
            "cornerRadius (not a fixed Circle()) so CallBubbleView's rectangle PiP tiers " +
            "can reuse this component."
        )
        XCTAssertFalse(
            src.contains(".clipShape(Circle())"),
            "The fixed Circle() clip must be gone — it can no longer represent the " +
            "rectangle PiP tiers."
        )
    }

    func test_avatarFallback_sizedFromSmallerDimension() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("size: min(width, height)"),
            "The avatar fallback must size itself from the smaller dimension so it never " +
            "stretches out of its circular aspect at a rectangle PiP tier."
        )
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — none of these strings/inits exist yet.

- [ ] **Step 3: Rewrite `CallParticipantVisual.swift`**

Replace the full file content with:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visuel partagé du correspondant d'appel — flux vidéo distant si actif,
/// sinon avatar (cache-first, `resolveRemoteProfile`). Utilisé à 44pt
/// (cercle) dans `FloatingCallPillView`, et à 56pt (cercle) ou aux paliers
/// rectangle small/medium/large dans `CallBubbleView` : extrait pour ne pas
/// dupliquer ni le layout ni la résolution de profil entre les sites de
/// montage (spec 2026-07-07-call-banner-swipe-collapse-design.md, §
/// CallBubbleView). `RoundedRectangle(cornerRadius:)` rend un cercle parfait
/// quand `cornerRadius == min(width, height) / 2` — l'initialiseur
/// `diameter:` s'appuie sur cette identité pour garder ses sites d'appel
/// circulaires existants visuellement inchangés (spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md).
struct CallParticipantVisual: View {
    let width: CGFloat
    let height: CGFloat
    let cornerRadius: CGFloat

    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift /
    // CallBubbleView.swift) — injected by the caller instead of a
    // `= CallManager.shared` default. Both mount sites (FloatingCallPillView,
    // CallBubbleView) already hold their own @ObservedObject callManager and
    // re-evaluate their body on every call tick (duration/quality/mute), which
    // reconstructs this struct; a defaulted @ObservedObject would tear down
    // and rebuild its objectWillChange subscription on every such tick.
    @ObservedObject var callManager: CallManager
    @State private var remoteProfile: MeeshyUser?

    /// Initialiseur circulaire — les deux sites d'appel préexistants (avatar
    /// de la pilule, palier cercle de la bulle) continuent de passer un seul
    /// `diameter:`.
    init(diameter: CGFloat, callManager: CallManager) {
        self.width = diameter
        self.height = diameter
        self.cornerRadius = diameter / 2
        self.callManager = callManager
    }

    /// Initialiseur rectangle — paliers small/medium/large de `CallBubbleView`,
    /// où largeur et hauteur divergent et le rayon de coin ne dérive plus
    /// d'un diamètre unique.
    init(width: CGFloat, height: CGFloat, cornerRadius: CGFloat, callManager: CallManager) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
        self.callManager = callManager
    }

    var body: some View {
        Group {
            if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
                    .frame(width: width, height: height)
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(Color.white.opacity(0.25), lineWidth: 1)
                    )
                    .accessibilityHidden(true)
            } else {
                avatarView
            }
        }
        .task(id: callManager.remoteUserId) {
            await resolveRemoteProfile(userId: callManager.remoteUserId)
        }
    }

    private var avatarView: some View {
        // CachedAvatarImage : échec silencieux (initiales 2 lettres + accent
        // indigo), zéro bouton retry sur un cercle d'appel 44-56pt — la
        // résolution du profil reste cache-first via resolveRemoteProfile.
        // Aux paliers rectangle (width != height), l'avatar reste à sa
        // taille naturelle (min(width, height)) et centré sur un fond
        // assorti à la forme, plutôt que d'étirer un portrait carré hors de
        // son ratio.
        ZStack {
            if width != height {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.black.opacity(0.55))
            }
            CachedAvatarImage(
                urlString: remoteProfile?.avatar,
                thumbHash: remoteProfile?.avatarThumbHash,
                name: callManager.remoteUsername ?? "?",
                size: min(width, height),
                accentColor: MeeshyColors.brandPrimaryHex
            )
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }

    /// Résolution cache-first (Instant App) : `.fresh`/`.stale` servis
    /// immédiatement, pas d'appel réseau ici — `CallView` rafraîchit et
    /// ré-alimente le cache quand l'appel passe en plein écran.
    private func resolveRemoteProfile(userId: String?) async {
        guard let userId, !userId.isEmpty else {
            remoteProfile = nil
            return
        }
        switch await CacheCoordinator.shared.profiles.load(for: userId) {
        case .fresh(let users, _), .stale(let users, _):
            remoteProfile = users.first
        case .expired, .empty:
            break
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — including the pre-existing `test_pillContent_delegatesAvatarToCallParticipantVisual` (still finds the literal `CallParticipantVisual(diameter: 44, callManager: callManager)` untouched) and `test_resolvesRemoteProfile_cacheFirst`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift \
        apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift
git commit -m "feat(ios/call): CallParticipantVisual accepte des tailles rectangle"
```

---

### Task 5: Wire pinch, tier rendering, and the persistent control bar into `CallBubbleView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift` (state after Task 2)
- Modify: `apps/ios/MeeshyTests/Unit/Views/CallViewObservedObjectInjectionTests.swift:160` (existing assertion, now stale)
- Test: `apps/ios/MeeshyTests/Unit/Views/CallBubbleViewSizeTierWiringTests.swift` (new file)

**Interfaces:**
- Consumes: `CallBubbleSizeTier`, `CallManager.bubbleSizeTier` (Task 1); `CallBubbleGestureResolver.{size,interpolatedSize,interpolatedCornerRadius,controlBarOpacity,progress,nextTier}` (Task 3); `CallParticipantVisual.init(width:height:cornerRadius:callManager:)` (Task 4).
- Produces: pinch-to-resize on the bubble cluster; a persistent control bar at the rectangle tiers; an `accessibilityAdjustableAction` VoiceOver equivalent.

- [ ] **Step 1: Write the failing tests**

Create `apps/ios/MeeshyTests/Unit/Views/CallBubbleViewSizeTierWiringTests.swift`:

```swift
import XCTest
@testable import Meeshy

/// Wiring guards for the pinch-to-resize PiP tiers (spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md) — same source-inspection
/// convention as `CallBubbleViewMiniMenuWiringTests` (no SwiftUI gesture
/// simulation harness in this project, see `apps/ios/CLAUDE.md`).
@MainActor
final class CallBubbleViewSizeTierWiringTests: XCTestCase {

    private func callBubbleViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallBubbleView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_pinchGesture_isAttachedToCluster() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains(".simultaneousGesture(pinchGesture)"),
            "The pinch-to-resize MagnificationGesture must be attached to the same " +
            "cluster as drag/long-press/tap, not swapped in per tier — a gesture handed " +
            "off between views loses continuity across a tier transition."
        )
    }

    func test_pinchGesture_usesResolverForProgressAndSnap() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.progress(startingTier:"),
            "The pinch gesture must derive live progress from the pure resolver, not " +
            "inline scale math in the view."
        )
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.nextTier(progress:"),
            "Releasing the pinch must snap via the pure resolver's nextTier(...), matching " +
            "the drag gesture's existing delegation to CallBubbleGestureResolver."
        )
    }

    func test_callParticipantVisual_usesInterpolatedRectangleInitializer() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)"),
            "CallBubbleView must drive CallParticipantVisual's size from the live " +
            "interpolated tier size, not a fixed circle diameter."
        )
    }

    func test_tierControlBar_opacityFollowsResolverCurve() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.controlBarOpacity(progress:"),
            "The persistent mute/speaker/hangup bar at the rectangle tiers must fade in " +
            "using the resolver's curve, not pop in abruptly at a tier boundary."
        )
    }

    func test_miniMenu_isGatedToCircleRegion() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("isCircleRegion && isMenuRevealed"),
            "The long-press mini-menu cluster must only render in the circle region " +
            "(progress < 0.5) — at the rectangle tiers, controls are already always-on " +
            "via the persistent bar, so the long-press cluster must not double up."
        )
    }

    func test_revealMenu_guardsAgainstNonCircleRegion() throws {
        let source = try callBubbleViewSource()
        guard let range = source.range(of: "private func revealMenu()") else {
            XCTFail("revealMenu not found"); return
        }
        let end = source.range(of: "private func closeMenu()", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("guard currentProgress < 0.5 else { return }"),
            "revealMenu() must refuse to open the mini-menu outside the circle region — " +
            "long-pressing an already-enlarged rectangle tier must not summon a redundant menu."
        )
    }

    func test_accessibilityAdjustableAction_changesTier() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains(".accessibilityAdjustableAction { direction in"),
            "VoiceOver users cannot pinch — an adjustable action (swipe up/down with the " +
            "rotor) must let them cycle through the PiP size tiers instead."
        )
    }

    func test_bubbleCenter_derivesFromCurrentSize_notFixedDiameter() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("private func bubbleCenter(in geometry: GeometryProxy, size: CGSize)"),
            "bubbleCenter must take the current interpolated size so a large rectangle " +
            "tier is vertically clamped by its own half-height, not the small circle's " +
            "fixed radius — otherwise a .large tier can render off-screen or into the FAB zone."
        )
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `pinchGesture`, `isCircleRegion`, `currentProgress`, the new `bubbleCenter` signature, and the new `CallParticipantVisual` call none exist yet in `CallBubbleView.swift`.

- [ ] **Step 3: Rewrite `CallBubbleView.swift`**

Replace the full file content with (this supersedes Task 2's version of the same file):

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bulle avatar circulaire — forme repliée de l'appel en cours, atteinte par
/// swipe depuis `FloatingCallPillView`. Déplaçable (drag libre, clipse au
/// bord le plus proche), pinçable (4 paliers de taille cercle → small →
/// medium → large, morphing continu — spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md), tap → plein écran,
/// appui long (palier cercle uniquement) → mini-menu rapide
/// (mute/haut-parleur/raccrocher). Aux paliers rectangle, ces 3 actions sont
/// à la place une barre persistante en haut du cadre. Montée sans condition
/// à deux endroits (`RootView`, `iPadRootView+Sheets`), garde interne
/// symétrique à celle de `FloatingCallPillView`.
struct CallBubbleView: View {
    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift) —
    // injected by the caller instead of a `= CallManager.shared` default, so
    // the parent's body re-evaluating for unrelated churn (unread counts,
    // presence, navigation) doesn't tear down and rebuild this view's
    // objectWillChange subscription. Both mount sites (RootView,
    // iPadRootView+Sheets) already hold their own @ObservedObject callManager.
    @ObservedObject var callManager: CallManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isMenuRevealed = false
    @State private var dragTranslation: CGSize = .zero
    @State private var menuDismissTask: Task<Void, Never>?
    @State private var pinchScale: CGFloat = 1.0
    @State private var pinchLastSample: (time: Date, progress: CGFloat)?

    private let circleDiameter = CallBubbleGestureResolver.bubbleDiameter
    private let menuButtonDiameter: CGFloat = 44
    private let menuButtonGap: CGFloat = 8

    var body: some View {
        if callManager.displayMode == .bubble && callManager.callState.isActive && !callManager.isSystemPiPActive {
            GeometryReader { geometry in
                bubbleCluster(in: geometry)
                    .position(bubbleCenter(in: geometry, size: CallBubbleGestureResolver.interpolatedSize(progress: currentProgress)))
            }
            .ignoresSafeArea()
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75), value: callManager.displayMode)
        }
    }

    // MARK: - Pinch progress

    /// Progression continue (0...3, `.circle...large`) — ancrée sur le
    /// palier snappé au repos (`pinchScale == 1`), suit l'échelle du doigt en
    /// direct pendant un pinch actif.
    private var currentProgress: CGFloat {
        CallBubbleGestureResolver.progress(startingTier: callManager.bubbleSizeTier, scale: pinchScale)
    }

    /// Vrai tant que la forme est encore proche du cercle — c'est cette
    /// région, et elle seule, qui garde le mini-menu déclenché par long-press
    /// (au-delà, la barre de contrôle persistante prend le relais).
    private var isCircleRegion: Bool {
        currentProgress < 0.5
    }

    // MARK: - Cluster (bubble + revealed menu / persistent control bar)

    @ViewBuilder
    private func bubbleCluster(in geometry: GeometryProxy) -> some View {
        let progress = currentProgress
        let size = CallBubbleGestureResolver.interpolatedSize(progress: progress)
        let cornerRadius = CallBubbleGestureResolver.interpolatedCornerRadius(progress: progress)
        let controlOpacity = CallBubbleGestureResolver.controlBarOpacity(progress: progress)
        let menuOffset = isMenuRevealed
            ? CallBubbleGestureResolver.menuOffset(edge: callManager.bubbleEdge, screenWidth: geometry.size.width, buttonDiameter: menuButtonDiameter)
            : 0
        let sideButtonOffset = circleDiameter / 2 + menuButtonGap + menuButtonDiameter / 2

        ZStack {
            if isCircleRegion && isMenuRevealed {
                muteButton.offset(x: -sideButtonOffset)
                speakerButton.offset(x: sideButtonOffset)
                hangupButton.offset(y: sideButtonOffset)
            }

            CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)
                .shadow(color: Color.black.opacity(0.3), radius: 8, y: 4)
                .overlay(alignment: .topTrailing) {
                    TransientCallSignalGlyph(strength: signalStrength)
                        .padding(6)
                        .background(Circle().fill(Color.black.opacity(0.55)))
                        .offset(x: 16, y: -16)
                }
                .overlay(alignment: .top) {
                    tierControlBar
                        .opacity(controlOpacity)
                        .allowsHitTesting(controlOpacity > 0.5)
                }
        }
        .offset(x: menuOffset)
        .offset(dragTranslation)
        .simultaneousGesture(dragGesture(in: geometry))
        .simultaneousGesture(pinchGesture)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)
                .onEnded { _ in revealMenu() }
        )
        .onTapGesture {
            if isMenuRevealed {
                closeMenu()
            } else {
                HapticFeedback.medium()
                callManager.displayMode = .fullScreen
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.bubble.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityValue(accessibilityTierLabel(for: callManager.bubbleSizeTier))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.bubble.expand", defaultValue: "Revenir au plein écran", bundle: .main)) {
            callManager.displayMode = .fullScreen
        }
        .accessibilityAction(named: String(localized: "a11y.call.bubble.quickMenu", defaultValue: "Ouvrir le mini-menu d'appel", bundle: .main)) {
            revealMenu()
        }
        // Retaper la bulle referme le menu (voir .onTapGesture ci-dessus),
        // mais VoiceOver navigue par swipe, pas par tap direct sur la bulle —
        // sans cette action explicite, fermer le menu exigerait d'attendre
        // les 3s d'auto-dismiss ou de déclencher raccrocher (destructif).
        .accessibilityAction(named: String(localized: "a11y.call.bubble.closeMenu", defaultValue: "Fermer le mini-menu d'appel", bundle: .main)) {
            closeMenu()
        }
        .accessibilityAdjustableAction { direction in
            let newRawValue: Int
            switch direction {
            case .increment: newRawValue = callManager.bubbleSizeTier.rawValue + 1
            case .decrement: newRawValue = callManager.bubbleSizeTier.rawValue - 1
            @unknown default: return
            }
            guard let newTier = CallBubbleSizeTier(rawValue: newRawValue) else { return }
            withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.8)) {
                callManager.bubbleSizeTier = newTier
            }
            HapticFeedback.light()
        }
    }

    private var tierControlBar: some View {
        HStack(spacing: 12) {
            muteButton
            speakerButton
            hangupButton
        }
        .padding(.top, 10)
    }

    private func accessibilityTierLabel(for tier: CallBubbleSizeTier) -> String {
        switch tier {
        case .circle: return String(localized: "call.bubble.size.circle", defaultValue: "Cercle", bundle: .main)
        case .small: return String(localized: "call.bubble.size.small", defaultValue: "Petit", bundle: .main)
        case .medium: return String(localized: "call.bubble.size.medium", defaultValue: "Moyen", bundle: .main)
        case .large: return String(localized: "call.bubble.size.large", defaultValue: "Grand", bundle: .main)
        }
    }

    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(level: callManager.liveVideoQualityLevel, connection: callManager.connectionQuality)
    }

    // MARK: - Positioning

    private func bubbleCenter(in geometry: GeometryProxy, size: CGSize) -> CGPoint {
        let margin = CallBubbleGestureResolver.bubbleEdgeMargin
        let halfWidth = size.width / 2
        let safeArea = geometry.safeAreaInsets
        let x: CGFloat = callManager.bubbleEdge == .trailing
            ? geometry.size.width - safeArea.trailing - margin - halfWidth
            : safeArea.leading + margin + halfWidth
        let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
        let rawY = callManager.bubbleVerticalFraction * availableHeight
        let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
            rawY, availableHeight: availableHeight, bubbleRadius: size.height / 2
        )
        return CGPoint(x: x, y: safeArea.top + clampedY)
    }

    // MARK: - Reposition drag

    private func dragGesture(in geometry: GeometryProxy) -> some Gesture {
        // `minimumDistance: 10` — matches the pill's own collapse gesture
        // (`FloatingCallPillView.collapseDragGesture`). A near-zero threshold
        // co-fires with `.onTapGesture` on ordinary finger jitter during a
        // tap, causing a redundant edge-snap + haptic alongside the tap's
        // own full-screen expansion.
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                guard !isMenuRevealed else { return }
                dragTranslation = value.translation
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let size = CallBubbleGestureResolver.interpolatedSize(progress: currentProgress)
                let center = bubbleCenter(in: geometry, size: size)
                let releasedX = center.x + value.translation.width
                let releasedY = center.y + value.translation.height
                let edge = CallBubbleGestureResolver.snappedEdge(centerX: releasedX, screenWidth: geometry.size.width)

                let safeArea = geometry.safeAreaInsets
                let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
                let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
                    releasedY - safeArea.top, availableHeight: availableHeight, bubbleRadius: size.height / 2
                )

                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    dragTranslation = .zero
                    callManager.bubbleEdge = edge
                    callManager.bubbleVerticalFraction = availableHeight > 0 ? clampedY / availableHeight : 0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Pinch resize

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                guard !isMenuRevealed else { return }
                // Sample BEFORE updating pinchScale, so onEnded can diff
                // against the second-to-last progress — an instantaneous
                // velocity estimate, matching dragGesture's own pre-update
                // sampling convention in FloatingCallPillView.
                pinchLastSample = (Date(), currentProgress)
                pinchScale = value
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let finalProgress = CallBubbleGestureResolver.progress(startingTier: callManager.bubbleSizeTier, scale: value)
                let velocity: CGFloat
                if let sample = pinchLastSample {
                    let elapsed = Date().timeIntervalSince(sample.time)
                    velocity = elapsed > 0 ? (finalProgress - sample.progress) / CGFloat(elapsed) : 0
                } else {
                    velocity = 0
                }
                pinchLastSample = nil
                let resolvedTier = CallBubbleGestureResolver.nextTier(progress: finalProgress, velocity: velocity)
                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    callManager.bubbleSizeTier = resolvedTier
                    pinchScale = 1.0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Mini-menu (long-press reveal, circle region only)

    private func revealMenu() {
        guard currentProgress < 0.5 else { return }
        HapticFeedback.medium()
        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.75)) {
            isMenuRevealed = true
        }
        armAutoDismiss()
    }

    private func closeMenu() {
        menuDismissTask?.cancel()
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.8)) {
            isMenuRevealed = false
        }
    }

    private func armAutoDismiss() {
        menuDismissTask?.cancel()
        menuDismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            closeMenu()
        }
    }

    private var muteButton: some View {
        Button {
            callManager.toggleMute()
            HapticFeedback.light()
            armAutoDismiss()
        } label: {
            Image(systemName: callManager.isMuted ? "mic.slash.fill" : "mic.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isMuted ? MeeshyColors.error : .white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(Circle().fill(callManager.isMuted ? MeeshyColors.error.opacity(0.2) : Color.black.opacity(0.55)))
        }
        .pressable()
        .accessibilityLabel(callManager.isMuted
            ? String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro")
            : String(localized: "call.pill.mute", defaultValue: "Couper le micro"))
        .callToggleAccessibility(isToggle: true, isActive: callManager.isMuted)
    }

    private var speakerButton: some View {
        Button {
            callManager.toggleSpeaker()
            HapticFeedback.light()
            armAutoDismiss()
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isSpeaker ? MeeshyColors.indigo400 : .white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(Circle().fill(callManager.isSpeaker ? MeeshyColors.indigo400.opacity(0.2) : Color.black.opacity(0.55)))
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
        .callToggleAccessibility(isToggle: true, isActive: callManager.isSpeaker)
    }

    private var hangupButton: some View {
        Button {
            closeMenu()
            callManager.endCall()
            HapticFeedback.error()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(
                    Circle().fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.bubble.hangup", defaultValue: "Raccrocher l'appel"))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }
}
```

- [ ] **Step 4: Fix the now-stale assertion in `CallViewObservedObjectInjectionTests.swift`**

In `CallViewObservedObjectInjectionTests.swift`, change `test_callBubbleView_injectsOwnCallManagerIntoCallParticipantVisual` (lines 157-163) from:

```swift
    func test_callBubbleView_injectsOwnCallManagerIntoCallParticipantVisual() throws {
        let source = try source(of: "Views/CallBubbleView.swift")
        XCTAssertTrue(
            source.contains("CallParticipantVisual(diameter: diameter, callManager: callManager)"),
            "CallBubbleView must pass its own `callManager` into CallParticipantVisual."
        )
    }
```

to:

```swift
    func test_callBubbleView_injectsOwnCallManagerIntoCallParticipantVisual() throws {
        let source = try source(of: "Views/CallBubbleView.swift")
        XCTAssertTrue(
            source.contains("CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)"),
            "CallBubbleView must pass its own `callManager` into CallParticipantVisual."
        )
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — `CallBubbleViewSizeTierWiringTests`, `CallBubbleViewMiniMenuWiringTests` (unchanged button-wiring tests still hold since `muteButton`/`speakerButton`/`hangupButton` bodies are untouched), `CallViewObservedObjectInjectionTests`, and the full existing suite all green.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift \
        apps/ios/MeeshyTests/Unit/Views/CallBubbleViewSizeTierWiringTests.swift \
        apps/ios/MeeshyTests/Unit/Views/CallViewObservedObjectInjectionTests.swift
git commit -m "feat(ios/call): pinch-to-resize PiP (4 paliers) + barre de contrôle persistante sur la bulle"
```

---

### Task 6: Full local verification pass

**Files:** none (verification only).

- [ ] **Step 1: Regenerate the Xcode project and build for testing (CI parity)**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Expected: `** TEST BUILD SUCCEEDED **`. If it fails, the failure is a compile error — read the `error:` line immediately above and fix it (per `apps/ios/CLAUDE.md`, exit 65 here means compile failure, not flaky tests).

- [ ] **Step 2: Run the full test suite on the pinned 18.2 runtime**

```bash
SIM=$(xcrun simctl create tmp182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests \
  -derivedDataPath apps/ios/Build
```

Expected: all suites pass, including the 6 test classes touched in this plan (`CallManagerBubblePositionTests`, `FloatingCallPillViewTests`, `CallParticipantVisualTests`, `CallBubbleGestureResolverTests`, `CallBubbleViewMiniMenuWiringTests`, `CallBubbleViewSizeTierWiringTests`, `CallViewObservedObjectInjectionTests`).

- [ ] **Step 3: Clean up the throwaway simulator and repo churn from the CI-parity repro**

```bash
xcrun simctl delete "$SIM"
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Meeshy.xcworkspace 2>/dev/null || true
git status --short apps/ios/ | grep -v "^??" || true
```

Confirm no unexpected `project.pbxproj`/`Package.resolved` churn is left staged (per `apps/ios/CLAUDE.md`: `xcodegen generate` and SPM resolution rewrite these as build artifacts — never commit that churn from a local repro).

- [ ] **Step 4: Manual smoke check on the dev simulator**

```bash
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh run
```

On the running app (simulator UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`, iPhone 16 Pro): place or join a call, minimize to the pill, swipe it into the circle bubble, and confirm by hand:
- Long-press the circle → mute/speaker/hangup cluster appears; tapping elsewhere in the app (e.g. a tab bar icon) now reaches that element instead of just closing the menu; retapping the bubble closes the menu.
- Pinch-out on the circle → it morphs continuously into a rectangle, control bar fades in past the midpoint; releasing snaps to the nearest tier with a spring.
- Pinch-in from a rectangle tier → morphs back down; releasing near the circle boundary returns it to a perfect circle (no rectangular corners left).
- Drag repositions the bubble at every tier, still snapping to the nearest screen edge on release.
- Tapping the video area (not a control button) at any tier returns to full screen.

Note any discrepancy from the spec in a follow-up task rather than silently deviating from it.

- [ ] **Step 5: Final commit if Step 4 required fixes**

If Step 4 uncovered a real bug, fix it with its own RED→GREEN test cycle (do not silently patch without a failing test first), then:

```bash
git add -A apps/ios/Meeshy apps/ios/MeeshyTests
git commit -m "fix(ios/call): corrige [description précise du bug trouvé en vérification manuelle]"
```

If Step 4 found nothing wrong, skip this step — there is nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** § Modèle d'état → Task 1. § Paliers de taille → Task 3 (`size(for:)`). § Geste de pinch et morphing continu → Task 3 (`interpolatedSize`/`interpolatedCornerRadius`/`progress`/`nextTier`) + Task 5 (wiring). § Barre de contrôle → Task 3 (`controlBarOpacity`) + Task 5 (`tierControlBar`). § Fix du long-press → Task 2. § Accessibilité → Task 5 (`accessibilityAdjustableAction`, `accessibilityTierLabel`). § Limites de composant → `tierControlBar`/`accessibilityTierLabel` extracted as dedicated members rather than inlined, keeping gesture wiring and per-tier rendering visually separated within the file. § Hors périmètre → untouched, no task references `FloatingCallPillView`'s `.pip` rendering or `PiPCallController`.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `CallBubbleSizeTier` (Task 1) is the same type used in Task 3's resolver signatures and Task 5's view code throughout — verified by re-reading Task 3/5 against Task 1's declaration. `CallParticipantVisual`'s new initializer signature (Task 4) matches exactly what Task 5's call site invokes (`width:height:cornerRadius:callManager:`, same order).
- **Cross-task regression caught during planning:** `CallViewObservedObjectInjectionTests.swift:160` asserted the OLD `CallParticipantVisual(diameter: diameter, callManager: callManager)` call site — Task 5 Step 4 updates it; without that step the full suite would go red after Task 5 despite the feature working correctly.
