# Call Banner Swipe-to-Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a swipe-left/right gesture on the in-call floating pill (`FloatingCallPillView`) that collapses it into a draggable circular avatar bubble (`CallBubbleView`) with a signal-quality badge and a long-press-revealed mini-menu (mute / speaker / hangup).

**Architecture:** A 3rd `CallDisplayMode` case (`.bubble`) plus two new `@Published` position properties on `CallManager` (`bubbleEdge`, `bubbleVerticalFraction`) drive a new `CallBubbleView`, mounted unconditionally next to the existing `FloatingCallPillView` at both app-root mount sites. All gesture-commit decisions (collapse threshold, edge-snapping, menu-button screen-fit, vertical clamp away from the main FAB) are extracted into a pure, fully unit-tested `CallBubbleGestureResolver` enum — mirroring the existing `BubbleSwipeResistance` pattern. The pill's video/avatar visual is extracted into a shared `CallParticipantVisual(diameter:)` view reused at 44pt (pill) and 56pt (bubble).

**Tech Stack:** SwiftUI (iOS 16.0+ floor), Swift 6.2, XCTest, XcodeGen (`apps/ios/project.yml`).

## Global Constraints

- **iOS 16.0+ deployment floor** (`apps/ios/project.yml:10`) — `DragGesture.Value.velocity` is iOS 17+ only and MUST NOT be used; velocity is computed manually from elapsed wall-clock time (no existing precedent uses `.velocity` in this codebase).
- **44×44pt minimum touch target** (Apple HIG, `apps/ios/CLAUDE.md` Accessibility rules) — every mini-menu button and the bubble itself must meet this.
- **No SwiftUI gesture-level XCTest** — this project's convention (confirmed by the spec and by `MessageListView`/`BubbleSwipeContainer` precedent) is to extract gesture *decisions* into pure functions and unit-test those; the gesture wiring itself is verified by build + manual run, never a UI test harness.
- **Source-guard test pattern** — where wiring is trivial (a button's action calls an existing, already-tested method) and no pure-logic extraction is possible, this codebase asserts on the view file's own source text (see `AudioRouteChangeStateReconciliationTests` in `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift:2402`). Read the code being asserted on, never comment text.
- **XcodeGen source of truth** — `apps/ios/project.yml` globs `Meeshy/**` and `MeeshyTests/**` recursively. Any task that adds a **new** `.swift` file MUST run `cd apps/ios && xcodegen generate && cd ..` before that file will compile via `meeshy.sh` — `meeshy.sh` itself never runs `xcodegen`. Never commit the resulting `project.pbxproj`/`Meeshy.xcscheme` churn from a local repro — `git checkout --` them after verifying (per `apps/ios/CLAUDE.md`), then re-apply just the intended `project.yml` diff if any (none is needed in this plan — no new target, no new scheme).
- **Never use `xcodebuild` directly for building the app** — always `./apps/ios/meeshy.sh build`. The one exception, per `apps/ios/CLAUDE.md`, is reproducing the CI **test** run exactly, which is what the test-verification steps below do.
- **Simulator for test runs**: iOS 18.2 specifically (18.5+/26.x crash at XCTest teardown, per `apps/ios/CLAUDE.md`). This plan creates one dedicated simulator named `meeshy-plan-182` in Task 1 and reuses it by name in every later task — the creation command is idempotent (`|| true`) so re-running it in later tasks is harmless.
- **Colors**: mute uses `MeeshyColors.error` when active, speaker uses `MeeshyColors.indigo400` when active (verified against the real `CallView.swift:1344-1352` and `FloatingCallPillView.swift:322-324` — the spec's own prose said `MeeshyColors.info` for speaker, which does not match either precedent; this plan uses the code, not the prose).
- **No `Co-Authored-By` trailer** in commits (user preference, this project).

---

### Task 1: `CallDisplayMode.bubble` + `CallManager` bubble-position state

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift:820-823`
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:176-180` (new properties), `:733-750` (reset on new call)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift` (append new class at end of file)

**Interfaces:**
- Produces: `enum CallDisplayMode: Sendable { case fullScreen, pip, bubble }` (WebRTCTypes.swift)
- Produces: `enum BubbleHorizontalEdge: Sendable { case leading, trailing }` (WebRTCTypes.swift)
- Produces: `CallManager.shared.bubbleEdge: BubbleHorizontalEdge` (default `.trailing`), `CallManager.shared.bubbleVerticalFraction: CGFloat` (default `0.08`) — both `@Published var`, both read/written directly by later tasks (Task 4, Task 5).

- [ ] **Step 1: Write the failing tests**

Open `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift` and append at the very end of the file (after the last `final class ... { ... }`):

```swift
// MARK: - Bubble Position State (Call Banner Swipe-to-Collapse)

@MainActor
final class CallManagerBubblePositionTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_bubbleEdge_defaultsToTrailing() {
        XCTAssertEqual(CallManager.shared.bubbleEdge, .trailing)
    }

    func test_bubbleVerticalFraction_defaultsNearTop() {
        XCTAssertEqual(CallManager.shared.bubbleVerticalFraction, 0.08, accuracy: 0.0001)
    }

    /// `resetEndedStateForNewCall` is private and touches live singleton/CallKit
    /// state — exercising it end-to-end would require mocking WebRTC/CallKit far
    /// beyond this feature's scope. Source-guard instead (same technique as
    /// `AudioRouteChangeStateReconciliationTests` above in this file): assert the
    /// reset lines exist in the function body, so a new call never inherits the
    /// previous call's dragged bubble position.
    func test_resetEndedStateForNewCall_resetsBubblePositionToDefaults() throws {
        let source = try callManagerSource()
        guard let range = source.range(of: "private func resetEndedStateForNewCall()") else {
            XCTFail("resetEndedStateForNewCall not found in CallManager.swift"); return
        }
        let bodyEnd = source.range(
            of: "\n    /// Starts an outgoing call",
            range: range.upperBound..<source.endIndex
        )?.lowerBound ?? source.endIndex
        let body = String(source[range.lowerBound..<bodyEnd])
        XCTAssertTrue(
            body.contains("bubbleEdge = .trailing"),
            "resetEndedStateForNewCall must reset bubbleEdge to .trailing so a new call starts at the default bubble position"
        )
        XCTAssertTrue(
            body.contains("bubbleVerticalFraction = 0.08"),
            "resetEndedStateForNewCall must reset bubbleVerticalFraction to its default — a new call must not inherit the previous call's dragged position"
        )
    }
}
```

- [ ] **Step 2: Run tests to verify they fail (compile error — types don't exist yet)**

```bash
xcrun simctl create meeshy-plan-182 "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2 2>/dev/null || true
cd apps/ios && xcodegen generate && cd ..
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: **BUILD FAILED** — `error: type 'CallManager' has no member 'bubbleEdge'` (and `bubbleVerticalFraction`).

- [ ] **Step 3: Implement the minimal code**

In `apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift`, replace:

```swift
enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
}
```

with:

```swift
enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
    case bubble
}

/// Bord horizontal d'ancrage de la bulle d'appel repliée (`CallBubbleView`),
/// mis à jour au relâchement du drag de repositionnement.
enum BubbleHorizontalEdge: Sendable { case leading, trailing }
```

In `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, right after line 180 (`@Published private(set) var isSystemPiPActive: Bool = false`), insert:

```swift
    /// Bord d'ancrage de la bulle d'appel repliée (`.bubble` displayMode). Vit
    /// sur CallManager (pas en `@State` local d'une View) car visible depuis
    /// deux sites de montage distincts (`RootView`, `iPadRootView`) — même
    /// rationale que `displayMode` juste au-dessus.
    @Published var bubbleEdge: BubbleHorizontalEdge = .trailing
    /// Position verticale de la bulle, en fraction de la zone sûre (0 = haut,
    /// 1 = bas) — survit à la rotation/redimensionnement, contrairement à un
    /// point absolu. Proche du haut par défaut, sous la Dynamic Island.
    @Published var bubbleVerticalFraction: CGFloat = 0.08
```

In `resetEndedStateForNewCall()` (around line 733-750), right after `isSpeaker = false`, insert:

```swift
            bubbleEdge = .trailing
            bubbleVerticalFraction = 0.08
```

so the block reads (unchanged lines omitted for brevity — only the two new lines are added between `isSpeaker = false` and `videoSurvivalController.reset()`):

```swift
            isMuted = false
            isSpeaker = false
            bubbleEdge = .trailing
            bubbleVerticalFraction = 0.08
            videoSurvivalController.reset()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=meeshy-plan-182" \
  -only-testing:MeeshyTests/CallManagerBubblePositionTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: `** TEST SUCCEEDED **`, all 3 tests green.

- [ ] **Step 5: Clean up XcodeGen churn and commit**

```bash
cd apps/ios && git checkout -- Meeshy.xcodeproj/project.pbxproj Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme Package.resolved 2>/dev/null; cd ..
git add apps/ios/Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift \
        apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift
git commit -m "feat(ios): add .bubble display mode + bubble position state to CallManager"
```

---

### Task 2: `CallBubbleGestureResolver` (pure gesture-decision logic)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallBubbleGestureResolverTests.swift`

**Interfaces:**
- Consumes: `BubbleHorizontalEdge` (Task 1, `WebRTCTypes.swift`)
- Produces:
  - `CallBubbleGestureResolver.shouldCollapse(translationWidth: CGFloat, velocityWidth: CGFloat) -> Bool`
  - `CallBubbleGestureResolver.snappedEdge(centerX: CGFloat, screenWidth: CGFloat) -> BubbleHorizontalEdge`
  - `CallBubbleGestureResolver.menuOffset(edge: BubbleHorizontalEdge, screenWidth: CGFloat, buttonDiameter: CGFloat) -> CGFloat`
  - `CallBubbleGestureResolver.clampedVerticalPosition(_ y: CGFloat, availableHeight: CGFloat, bubbleRadius: CGFloat) -> CGFloat`
  - Constants: `bubbleDiameter: CGFloat = 56`, `bubbleEdgeMargin: CGFloat = 20`, `menuButtonGap: CGFloat = 8`, `fabExclusionZoneHeight: CGFloat = 148`, `collapseDistanceThreshold: CGFloat = 80`, `collapseVelocityThreshold: CGFloat = 500` — all consumed by Task 4 (pill) and Task 5 (bubble).

- [ ] **Step 1: Write the failing tests**

Create `apps/ios/MeeshyTests/Unit/Views/CallBubbleGestureResolverTests.swift`:

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

@MainActor
final class CallBubbleGestureResolverTests: XCTestCase {

    // MARK: - shouldCollapse

    func test_shouldCollapse_belowBothThresholds_false() {
        XCTAssertFalse(CallBubbleGestureResolver.shouldCollapse(translationWidth: 40, velocityWidth: 100))
    }

    func test_shouldCollapse_aboveDistanceThreshold_rightward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: 90, velocityWidth: 0))
    }

    func test_shouldCollapse_aboveDistanceThreshold_leftward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: -90, velocityWidth: 0))
    }

    func test_shouldCollapse_aboveVelocityThreshold_rightward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: 10, velocityWidth: 600))
    }

    func test_shouldCollapse_aboveVelocityThreshold_leftward_true() {
        XCTAssertTrue(CallBubbleGestureResolver.shouldCollapse(translationWidth: -10, velocityWidth: -600))
    }

    func test_shouldCollapse_exactlyAtThresholds_false() {
        // `>` not `>=` at the threshold itself — a small safety margin before commit.
        XCTAssertFalse(CallBubbleGestureResolver.shouldCollapse(translationWidth: 80, velocityWidth: 500))
    }

    // MARK: - snappedEdge

    func test_snappedEdge_centerLeftOfMiddle_isLeading() {
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 100, screenWidth: 390), .leading)
    }

    func test_snappedEdge_centerRightOfMiddle_isTrailing() {
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 300, screenWidth: 390), .trailing)
    }

    func test_snappedEdge_exactlyAtMiddle_isTrailing() {
        // Deterministic tie-break: dead center resolves to .trailing.
        XCTAssertEqual(CallBubbleGestureResolver.snappedEdge(centerX: 195, screenWidth: 390), .trailing)
    }

    // MARK: - menuOffset

    func test_menuOffset_clusterAlreadyFits_returnsZero() {
        // Small button (12pt): overflow = 12 + 8 - 20 = 0 → already fits, both edges.
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .trailing, screenWidth: 390, buttonDiameter: 12), 0)
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .leading, screenWidth: 390, buttonDiameter: 12), 0)
    }

    func test_menuOffset_anchoredTrailing_shiftsClusterLeft() {
        // Real HIG button (44pt): overflow = 44 + 8 - 20 = 32 → shift left (negative).
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .trailing, screenWidth: 390, buttonDiameter: 44), -32)
    }

    func test_menuOffset_anchoredLeading_shiftsClusterRight() {
        XCTAssertEqual(CallBubbleGestureResolver.menuOffset(edge: .leading, screenWidth: 390, buttonDiameter: 44), 32)
    }

    // MARK: - clampedVerticalPosition

    func test_clampedVerticalPosition_withinBounds_unchanged() {
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(200, availableHeight: 700, bubbleRadius: 28), 200)
    }

    func test_clampedVerticalPosition_aboveTop_clampsToRadius() {
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(-10, availableHeight: 700, bubbleRadius: 28), 28)
    }

    func test_clampedVerticalPosition_intoFabZone_clampsAboveIt() {
        // availableHeight 700, fabExclusionZoneHeight 148, bubbleRadius 28 → max = 700-148-28 = 524
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(680, availableHeight: 700, bubbleRadius: 28), 524)
    }

    func test_clampedVerticalPosition_tinyAvailableHeight_neverInverted() {
        // maxY would compute negative here — must clamp to minY (28), never invert the range.
        XCTAssertEqual(CallBubbleGestureResolver.clampedVerticalPosition(1000, availableHeight: 100, bubbleRadius: 28), 28)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ios && xcodegen generate && cd ..
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `error: cannot find 'CallBubbleGestureResolver' in scope`.

- [ ] **Step 3: Implement**

Create `apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift`:

```swift
import CoreGraphics

/// Logique pure de décision pour le geste swipe-to-collapse de la bannière
/// d'appel (pill → bulle) et le positionnement de la bulle repliée. Aucune
/// dépendance UI — testable, même principe que `BubbleSwipeResistance`
/// (`BubbleSwipeResistance.swift`).
enum CallBubbleGestureResolver {
    /// Distance horizontale (pt) au-delà de laquelle un swipe engage le
    /// collapse même relâché lentement.
    static let collapseDistanceThreshold: CGFloat = 80
    /// Vélocité horizontale (pt/s) au-delà de laquelle un swipe engage le
    /// collapse même sous le seuil de distance (flick rapide et court).
    static let collapseVelocityThreshold: CGFloat = 500

    /// Diamètre fixe de la bulle — partagé avec `CallBubbleView`.
    static let bubbleDiameter: CGFloat = 56
    /// Marge entre le bord de la bulle et le bord d'écran quand ancrée (même
    /// convention que `minEdgePadding` du FAB principal, `FloatingButtons.swift:68`).
    static let bubbleEdgeMargin: CGFloat = 20
    /// Écart entre la bulle et un bouton du mini-menu.
    static let menuButtonGap: CGFloat = 8
    /// Hauteur (pt), depuis le bas de la zone sûre, réservée au FAB principal —
    /// la bulle ne doit jamais s'y déposer, quel que soit son bord d'ancrage.
    /// Reprend le pire cas `bottomSafeZoneWithSearch` (110pt,
    /// `FloatingButtons.swift:70`) + le rayon du bouton FAB (52/2=26pt) + marge 12pt.
    static let fabExclusionZoneHeight: CGFloat = 148

    /// Vrai si le relâchement du drag doit replier la pill en bulle : distance
    /// OU vélocité au-delà du seuil, direction gauche ou droite indifféremment.
    static func shouldCollapse(translationWidth: CGFloat, velocityWidth: CGFloat) -> Bool {
        abs(translationWidth) > collapseDistanceThreshold
            || abs(velocityWidth) > collapseVelocityThreshold
    }

    /// Bord d'ancrage le plus proche du centre de la bulle au relâchement du
    /// drag de repositionnement. Pile au milieu de l'écran → `.trailing`
    /// (choix déterministe).
    static func snappedEdge(centerX: CGFloat, screenWidth: CGFloat) -> BubbleHorizontalEdge {
        centerX >= screenWidth / 2 ? .trailing : .leading
    }

    /// Décalage horizontal (pt) à appliquer au cluster bulle+3 boutons à la
    /// révélation du mini-menu pour que le bouton du côté ancré (haut-parleur
    /// si `.trailing`, mute si `.leading`) reste entièrement dans l'écran.
    /// Retourne 0 si le cluster tient déjà. Note : avec des marges fixes en
    /// points (pas proportionnelles), le résultat ne dépend pas de
    /// `screenWidth` — le paramètre reste pour la symétrie d'API avec
    /// `snappedEdge` et si les marges deviennent un jour proportionnelles.
    static func menuOffset(edge: BubbleHorizontalEdge, screenWidth: CGFloat, buttonDiameter: CGFloat) -> CGFloat {
        let overflow = buttonDiameter + menuButtonGap - bubbleEdgeMargin
        guard overflow > 0 else { return 0 }
        switch edge {
        case .trailing: return -overflow
        case .leading: return overflow
        }
    }

    /// Clampe une position Y candidate (pt, relative au haut de la zone sûre)
    /// dans les bornes valides pour le centre de la bulle : jamais dans la
    /// zone du FAB principal en bas, jamais hors zone sûre en haut.
    static func clampedVerticalPosition(_ y: CGFloat, availableHeight: CGFloat, bubbleRadius: CGFloat) -> CGFloat {
        let minY = bubbleRadius
        let maxY = max(availableHeight - fabExclusionZoneHeight - bubbleRadius, minY)
        return min(max(y, minY), maxY)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=meeshy-plan-182" \
  -only-testing:MeeshyTests/CallBubbleGestureResolverTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: `** TEST SUCCEEDED **`, all 13 tests green.

- [ ] **Step 5: Clean up XcodeGen churn and commit**

```bash
cd apps/ios && git checkout -- Meeshy.xcodeproj/project.pbxproj Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme Package.resolved 2>/dev/null; cd ..
git add apps/ios/Meeshy/Features/Main/Views/CallBubbleGestureResolver.swift \
        apps/ios/MeeshyTests/Unit/Views/CallBubbleGestureResolverTests.swift
git commit -m "feat(ios): add CallBubbleGestureResolver pure logic for bubble gestures"
```

---

### Task 3: Extract `CallParticipantVisual` and adopt it in `FloatingCallPillView`

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift:95, 118-124, 162-235`
- Modify: `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift:209-221` (relocate a source-guard test that this extraction would otherwise silently break)

**Interfaces:**
- Consumes: `CallManager.shared` (singleton, already `@ObservedObject`-compatible), `CacheCoordinator.shared.profiles.load(for:)` (existing SDK API, unchanged).
- Produces: `struct CallParticipantVisual: View { init(diameter: CGFloat) }` — self-contained (owns its own profile resolution), consumed by `FloatingCallPillView` (this task, at 44pt) and `CallBubbleView` (Task 5, at 56pt).

**Design note (read before implementing):** the pill's existing video branch clips to `RoundedRectangle(cornerRadius: 10)` while its avatar branch clips to `Circle()` — an existing inconsistency. Since the bubble's whole premise is a circular avatar, this extraction unifies both branches to `Circle()`. This is a minor, intentional visual change to the pill's video-thumbnail corner (rounded square → circle) as a direct consequence of sharing one layout between pill and bubble — not a bug.

**Pre-existing test that WILL break if not updated:** `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift:209-221` (`test_avatar_resolvesRemoteProfile_cacheFirst`) source-guards `FloatingCallPillView.swift` for the literal string `"CacheCoordinator.shared.profiles.load(for:"`. That string moves to the new file in this task, so the test must move with it — Step 3 below handles this. This is exactly the kind of pre-existing-test fallout the self-review checklist at the end of this plan is meant to catch; it was caught here by actually reading `FloatingCallPillViewTests.swift` before writing this task, not by assumption.

- [ ] **Step 1: Create the shared view**

Create `apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift`:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visuel partagé du correspondant d'appel — flux vidéo distant si actif,
/// sinon avatar (cache-first, `resolveRemoteProfile`). Utilisé à 44pt dans
/// `FloatingCallPillView` et à 56pt dans `CallBubbleView` : extrait pour ne
/// pas dupliquer ni le layout ni la résolution de profil entre les deux
/// sites de montage (spec 2026-07-07-call-banner-swipe-collapse-design.md,
/// § CallBubbleView). Toujours circulaire.
struct CallParticipantVisual: View {
    let diameter: CGFloat

    @ObservedObject private var callManager = CallManager.shared
    @State private var remoteProfile: MeeshyUser?

    var body: some View {
        Group {
            if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
                    .frame(width: diameter, height: diameter)
                    .clipShape(Circle())
                    .overlay(
                        Circle().stroke(Color.white.opacity(0.25), lineWidth: 1)
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
        let name = callManager.remoteUsername ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(MeeshyColors.brandGradient)

            Text(initial)
                .font(.system(.callout, design: .rounded).weight(.bold))
                .foregroundColor(.white)

            if let avatar = remoteProfile?.avatar, !avatar.isEmpty {
                CachedAsyncImage(
                    url: avatar,
                    targetSize: CGSize(width: diameter, height: diameter),
                    thumbHash: remoteProfile?.avatarThumbHash
                ) {
                    Color.clear
                }
                .scaledToFill()
                .frame(width: diameter, height: diameter)
                .clipShape(Circle())
            }
        }
        .frame(width: diameter, height: diameter)
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

- [ ] **Step 2: Adopt it in `FloatingCallPillView` and remove the duplicated code**

In `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`:

1. Delete the `@State private var remoteProfile: MeeshyUser?` property (line 95).
2. In `body`, remove the `.task(id: callManager.remoteUserId) { await resolveRemoteProfile(userId: callManager.remoteUserId) }` modifier (it moved into `CallParticipantVisual`), so `body` becomes:

```swift
    var body: some View {
        if callManager.displayMode == .pip && callManager.callState.isActive && !callManager.isSystemPiPActive {
            pillContent
                .environment(\.colorScheme, .dark)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75), value: callManager.displayMode)
                .zIndex(999)
        }
    }
```

3. In `pillContent`, replace `pillLeadingVisual` with `CallParticipantVisual(diameter: 44)`:

```swift
    private var pillContent: some View {
        HStack(spacing: 12) {
            CallParticipantVisual(diameter: 44)
            userInfoSection
            Spacer(minLength: 8)
            controlButtons
        }
        .padding(.horizontal, 14)
        // ... rest unchanged
```

4. Delete the entire `// MARK: - Leading Visual (remote video thumbnail or avatar)` section (the `pillLeadingVisual` computed property, doc comment included).
5. Delete the entire `// MARK: - Avatar` section (the `avatarView` computed property).
6. Delete the `resolveRemoteProfile(userId:)` private function and its doc comment.

- [ ] **Step 3: Relocate the source-guard test that this extraction breaks**

In `apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift`, replace the existing `test_avatar_resolvesRemoteProfile_cacheFirst` (lines 209-221) with a test that asserts the pill correctly *delegates* instead of reimplementing:

```swift
    func test_pillContent_delegatesAvatarToCallParticipantVisual() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("CallParticipantVisual(diameter: 44)"),
            "FloatingCallPillView must delegate its video/avatar visual to the shared " +
            "CallParticipantVisual component (reused at 56pt by CallBubbleView) instead " +
            "of reimplementing the cache-first avatar resolution locally."
        )
        XCTAssertFalse(
            source.contains("UserService.shared.getProfileById"),
            "The pill must NOT hit the network for the profile directly."
        )
    }
```

Then append a new test class at the end of the same file (after the closing `}` of `FloatingCallPillViewTests`), so the cache-first behavior itself stays covered at its new home:

```swift

// MARK: - CallParticipantVisual Source Inspection Tests

@MainActor
final class CallParticipantVisualTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallParticipantVisual.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_resolvesRemoteProfile_cacheFirst() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("CacheCoordinator.shared.profiles.load(for:"),
            "CallParticipantVisual must resolve the remote user's real avatar cache-first " +
            "(Instant App) instead of always showing the initial fallback."
        )
        XCTAssertFalse(
            src.contains("UserService.shared.getProfileById"),
            "CallParticipantVisual must NOT hit the network for the profile — CallView " +
            "already refreshes and re-feeds the cache; this component serves cached data only."
        )
    }
}
```

- [ ] **Step 4: Run the existing + relocated tests to confirm no regression**

```bash
cd apps/ios && xcodegen generate && cd ..
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=meeshy-plan-182" \
  -only-testing:MeeshyTests/FloatingCallPillViewTests \
  -only-testing:MeeshyTests/CallParticipantVisualTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -60
```

Expected: `** TEST SUCCEEDED **` — every pre-existing `FloatingCallPillViewTests` assertion still passes (mute/speaker/hangup accessibility, reduce-motion, full-width, min-height are all untouched by this extraction) plus the new `test_pillContent_delegatesAvatarToCallParticipantVisual` and `CallParticipantVisualTests.test_resolvesRemoteProfile_cacheFirst`.

- [ ] **Step 5: Clean up XcodeGen churn and commit**

```bash
cd apps/ios && git checkout -- Meeshy.xcodeproj/project.pbxproj Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme Package.resolved 2>/dev/null; cd ..
git add apps/ios/Meeshy/Features/Main/Views/CallParticipantVisual.swift \
        apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift \
        apps/ios/MeeshyTests/Unit/Views/FloatingCallPillViewTests.swift
git commit -m "refactor(ios): extract CallParticipantVisual shared by pill and bubble"
```

---

### Task 4: Swipe-to-collapse gesture on `FloatingCallPillView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`

**Interfaces:**
- Consumes: `CallBubbleGestureResolver.shouldCollapse(translationWidth:velocityWidth:)` (Task 2), `callManager.displayMode = .bubble` (Task 1), `HapticFeedback.light()/.success()` (existing SDK API).
- Produces: nothing new consumed by later tasks — this is the pill-side half of the feature; Task 5/6 do not depend on it.

No new pure logic here beyond what Task 2 already tests — this task wires an existing tested decision function into a gesture, plus an accessibility escape hatch. Per this project's convention (no SwiftUI gesture-level XCTest), verify via build + the self-review checklist at the end of this plan, not a new test file.

- [ ] **Step 1: Add drag state and the collapse gesture**

In `apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift`, add two new `@State` properties right after `@State private var remoteProfile: MeeshyUser?` was deleted in Task 3 (i.e., as the first `@State` declarations in the struct, after the `@Environment` line):

```swift
    /// Suit le drag horizontal en direct pour l'offset + fondu visuels ; ne
    /// persiste rien (contrairement à `bubbleEdge`/`bubbleVerticalFraction`
    /// sur `CallManager`, qui ne concernent que la bulle repliée).
    @State private var pillDragOffset: CGFloat = 0
    @State private var pillDragStartTime: Date?
```

Then, in `pillContent`, add the drag gesture and the visual offset/fade right before `.contentShape(Rectangle())`:

```swift
        .offset(x: pillDragOffset)
        .opacity(pillDragOpacity)
        .simultaneousGesture(collapseDragGesture)
        .contentShape(Rectangle())
        .onTapGesture {
            expandToFullScreen()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.pill.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityHint(String(localized: "call.pill.tapToReturn", defaultValue: "Touchez pour revenir à l'appel en plein écran"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.pill.collapse", defaultValue: "Réduire en bulle", bundle: .main)) {
            collapseToBubble(exitTranslation: 1)
        }
```

(This replaces the existing tail of `pillContent` from `.contentShape(Rectangle())` through `.accessibilityAddTraits(.isButton)` — every line shown is unchanged from the current file except 4 additions: `.offset(x: pillDragOffset)`, `.opacity(pillDragOpacity)`, `.simultaneousGesture(collapseDragGesture)`, and the trailing `.accessibilityAction(...)`.)

Add the new private computed properties and methods in a new `// MARK: - Collapse Gesture` section, right before `// MARK: - Actions`:

```swift
    // MARK: - Collapse Gesture

    private var pillDragOpacity: Double {
        let progress = min(abs(pillDragOffset) / 300, 1.0)
        return 1.0 - Double(progress) * 0.6
    }

    private var collapseDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                if pillDragStartTime == nil { pillDragStartTime = Date() }
                pillDragOffset = value.translation.width
            }
            .onEnded { value in
                // iOS 16 floor — `DragGesture.Value.velocity` is iOS 17+, so
                // velocity is approximated from elapsed wall-clock time
                // instead (no existing precedent in this codebase uses the
                // iOS 17 API either).
                let elapsed = pillDragStartTime.map { Date().timeIntervalSince($0) } ?? 0
                let velocityWidth = elapsed > 0 ? Double(value.translation.width) / elapsed : 0
                pillDragStartTime = nil

                if CallBubbleGestureResolver.shouldCollapse(
                    translationWidth: value.translation.width,
                    velocityWidth: CGFloat(velocityWidth)
                ) {
                    collapseToBubble(exitTranslation: value.translation.width)
                } else {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.7)) {
                        pillDragOffset = 0
                    }
                    HapticFeedback.light()
                }
            }
    }

    private func collapseToBubble(exitTranslation: CGFloat) {
        HapticFeedback.success()
        let exitOffset: CGFloat = exitTranslation >= 0 ? 500 : -500
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.25)) {
            pillDragOffset = exitOffset
        }
        Task { @MainActor in
            if !reduceMotion {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            callManager.displayMode = .bubble
            pillDragOffset = 0
        }
    }
```

- [ ] **Step 2: Build to verify**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -40
```

Expected: build succeeds with zero errors.

- [ ] **Step 3: Manual smoke check (no XCTest coverage for this gesture per project convention)**

```bash
./apps/ios/meeshy.sh run
```

Start or simulate an active call so the pill is visible (`displayMode == .pip`), then swipe it left or right past ~80pt: it should slide off-screen, haptic-success, and disappear (bubble mounts in Task 5/6 — until Task 6 lands, the call will have no visible minimized UI at all after this swipe; that's expected and temporary within this plan, not a regression to chase down now).

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift
git commit -m "feat(ios): swipe-to-collapse gesture on the call pill"
```

---

### Task 5: `CallBubbleView` (bubble, drag-to-reposition, long-press mini-menu)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/CallBubbleViewMiniMenuWiringTests.swift`

**Interfaces:**
- Consumes: `CallBubbleGestureResolver.{shouldCollapse is not needed here, snappedEdge, menuOffset, clampedVerticalPosition, bubbleDiameter, bubbleEdgeMargin}` (Task 2), `CallParticipantVisual(diameter:)` (Task 3), `callManager.{bubbleEdge, bubbleVerticalFraction, displayMode, isMuted, isSpeaker, toggleMute(), toggleSpeaker(), endCall(), liveVideoQualityLevel, connectionQuality, remoteUsername}` (Task 1 + existing `CallManager`), `TransientCallSignalGlyph`/`CallSignalStrength` (existing, `CallSignalGlyph.swift`), `callToggleAccessibility(isToggle:isActive:)` (existing `View` extension, `CallView.swift:1772-1790`, internal — visible from this file, same module), `.pressable()` (existing `MeeshyUI` modifier).
- Produces: `struct CallBubbleView: View` (no init params) — mounted by Task 6.

- [ ] **Step 1: Write the failing test (mini-menu button wiring, source-guard)**

Create `apps/ios/MeeshyTests/Unit/Views/CallBubbleViewMiniMenuWiringTests.swift`:

```swift
import XCTest
@testable import Meeshy

/// `CallBubbleView`'s mini-menu buttons only call existing, already-tested
/// `CallManager` methods (`toggleMute`/`toggleSpeaker`/`endCall` — see
/// `CallManagerTests.swift`) — there is no new behavior to exercise at
/// runtime, and this project does not write SwiftUI tap-simulation tests
/// (see `apps/ios/CLAUDE.md`). Source-guard confirms the wiring itself,
/// matching the existing convention in `CallManagerTests.swift`
/// (`AudioRouteChangeStateReconciliationTests`) — read the code, not comments.
@MainActor
final class CallBubbleViewMiniMenuWiringTests: XCTestCase {

    private func callBubbleViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallBubbleView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of propertyDeclaration: String, upTo nextDeclaration: String, in source: String) throws -> String {
        guard let range = source.range(of: propertyDeclaration) else {
            XCTFail("\(propertyDeclaration) not found in CallBubbleView.swift")
            return ""
        }
        let end = source.range(of: nextDeclaration, range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[range.lowerBound..<end])
    }

    func test_muteButton_callsToggleMute() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var muteButton", upTo: "\n    private var speakerButton", in: source)
        XCTAssertTrue(body.contains("callManager.toggleMute()"))
    }

    func test_speakerButton_callsToggleSpeaker() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var speakerButton", upTo: "\n    private var hangupButton", in: source)
        XCTAssertTrue(body.contains("callManager.toggleSpeaker()"))
    }

    func test_hangupButton_callsEndCall() throws {
        let source = try callBubbleViewSource()
        let body = try body(of: "private var hangupButton", upTo: "\n    // MARK:", in: source)
        XCTAssertTrue(body.contains("callManager.endCall()"))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/ios && xcodegen generate && cd ..
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -30
```

Expected: **BUILD FAILED** — `error: cannot find 'CallBubbleView' in scope` (referenced only by the test file's path construction being irrelevant at this stage — the actual failure is the missing type when the test target's other files reference it; if nothing yet references `CallBubbleView` this step may instead fail at `test-without-building` with a file-not-found `String(contentsOf:)` throw. Either failure mode confirms the view doesn't exist yet.)

- [ ] **Step 3: Implement `CallBubbleView`**

Create `apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift`:

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bulle avatar circulaire — forme repliée de l'appel en cours, atteinte par
/// swipe depuis `FloatingCallPillView`. Déplaçable (drag libre, clipse au bord
/// le plus proche), tap → plein écran, appui long → mini-menu rapide
/// (mute/haut-parleur/raccrocher). Montée sans condition à deux endroits
/// (`RootView`, `iPadRootView+Sheets`), garde interne symétrique à celle de
/// `FloatingCallPillView`.
struct CallBubbleView: View {
    @ObservedObject private var callManager = CallManager.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isMenuRevealed = false
    @State private var dragTranslation: CGSize = .zero
    @State private var menuDismissTask: Task<Void, Never>?

    private let diameter = CallBubbleGestureResolver.bubbleDiameter
    private let menuButtonDiameter: CGFloat = 44
    private let menuButtonGap: CGFloat = 8

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

    // MARK: - Cluster (bubble + revealed menu buttons)

    @ViewBuilder
    private func bubbleCluster(in geometry: GeometryProxy) -> some View {
        let offset = isMenuRevealed
            ? CallBubbleGestureResolver.menuOffset(edge: callManager.bubbleEdge, screenWidth: geometry.size.width, buttonDiameter: menuButtonDiameter)
            : 0
        let sideButtonOffset = diameter / 2 + menuButtonGap + menuButtonDiameter / 2

        ZStack {
            if isMenuRevealed {
                muteButton.offset(x: -sideButtonOffset)
                speakerButton.offset(x: sideButtonOffset)
                hangupButton.offset(y: sideButtonOffset)
            }

            CallParticipantVisual(diameter: diameter)
                .clipShape(Circle())
                .shadow(color: Color.black.opacity(0.3), radius: 8, y: 4)
                .overlay(alignment: .topTrailing) {
                    TransientCallSignalGlyph(strength: signalStrength)
                        .padding(6)
                        .background(Circle().fill(Color.black.opacity(0.55)))
                        .offset(x: 16, y: -16)
                }
        }
        .offset(x: offset)
        .offset(dragTranslation)
        .simultaneousGesture(dragGesture(in: geometry))
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)
                .onEnded { _ in revealMenu() }
        )
        .onTapGesture {
            guard !isMenuRevealed else { return }
            HapticFeedback.medium()
            callManager.displayMode = .fullScreen
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.bubble.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.bubble.expand", defaultValue: "Revenir au plein écran", bundle: .main)) {
            callManager.displayMode = .fullScreen
        }
        .accessibilityAction(named: String(localized: "a11y.call.bubble.quickMenu", defaultValue: "Ouvrir le mini-menu d'appel", bundle: .main)) {
            revealMenu()
        }
    }

    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(level: callManager.liveVideoQualityLevel, connection: callManager.connectionQuality)
    }

    // MARK: - Positioning

    private func bubbleCenter(in geometry: GeometryProxy) -> CGPoint {
        let margin = CallBubbleGestureResolver.bubbleEdgeMargin
        let radius = diameter / 2
        let safeArea = geometry.safeAreaInsets
        let x: CGFloat = callManager.bubbleEdge == .trailing
            ? geometry.size.width - safeArea.trailing - margin - radius
            : safeArea.leading + margin + radius
        let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
        let y = safeArea.top + callManager.bubbleVerticalFraction * availableHeight
        return CGPoint(x: x, y: y)
    }

    // MARK: - Reposition drag

    private func dragGesture(in geometry: GeometryProxy) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                guard !isMenuRevealed else { return }
                dragTranslation = value.translation
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let center = bubbleCenter(in: geometry)
                let releasedX = center.x + value.translation.width
                let releasedY = center.y + value.translation.height
                let edge = CallBubbleGestureResolver.snappedEdge(centerX: releasedX, screenWidth: geometry.size.width)

                let safeArea = geometry.safeAreaInsets
                let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
                let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
                    releasedY - safeArea.top, availableHeight: availableHeight, bubbleRadius: diameter / 2
                )

                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    dragTranslation = .zero
                    callManager.bubbleEdge = edge
                    callManager.bubbleVerticalFraction = availableHeight > 0 ? clampedY / availableHeight : 0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Mini-menu (long-press reveal)

    private func revealMenu() {
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
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,name=meeshy-plan-182" \
  -only-testing:MeeshyTests/CallBubbleViewMiniMenuWiringTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: `** TEST SUCCEEDED **`, all 3 tests green.

- [ ] **Step 5: Clean up XcodeGen churn and commit**

```bash
cd apps/ios && git checkout -- Meeshy.xcodeproj/project.pbxproj Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme Package.resolved 2>/dev/null; cd ..
git add apps/ios/Meeshy/Features/Main/Views/CallBubbleView.swift \
        apps/ios/MeeshyTests/Unit/Views/CallBubbleViewMiniMenuWiringTests.swift
git commit -m "feat(ios): add CallBubbleView with reposition drag and mini-menu"
```

---

### Task 6: Mount `CallBubbleView` at both app-root sites

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:574-577`
- Modify: `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift:147-150`

**Interfaces:**
- Consumes: `CallBubbleView()` (Task 5, no init params).
- Produces: nothing further — this is the final task; the feature is fully wired end-to-end after this.

- [ ] **Step 1: Mount in `RootView.swift`**

Right after the existing pill overlay (`RootView.swift:574-577`):

```swift
        .overlay(alignment: .top) {
            FloatingCallPillView()
                .padding(.top, MeeshySpacing.sm)
        }
```

add:

```swift
        .overlay {
            CallBubbleView()
        }
```

- [ ] **Step 2: Mount in `iPadRootView+Sheets.swift`**

Right after the existing pill overlay (`iPadRootView+Sheets.swift:147-150`):

```swift
            .overlay(alignment: .top) {
                FloatingCallPillView()
                    .padding(.top, 8)
            }
```

add:

```swift
            .overlay {
                CallBubbleView()
            }
```

- [ ] **Step 3: Build to verify**

```bash
cd apps/ios && xcodegen generate && cd ..
./apps/ios/meeshy.sh build 2>&1 | tail -40
```

Expected: build succeeds with zero errors.

- [ ] **Step 4: Full phased test suite (final verification of the whole feature)**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -60
```

Expected: all 3 phases green, including the new `CallManagerBubblePositionTests`, `CallBubbleGestureResolverTests`, and `CallBubbleViewMiniMenuWiringTests` classes from Tasks 1/2/5.

- [ ] **Step 5: Manual end-to-end smoke check**

```bash
./apps/ios/meeshy.sh run
```

During an active call: swipe the pill left/right → bubble appears near the pill's last-known edge; drag the bubble to the opposite screen edge → it snaps there and stays there for the rest of the call; tap the bubble → returns to full screen; long-press the bubble → mute/speaker/hangup buttons appear around it, tapping mute/speaker toggles state and icon without closing the menu, tapping hangup ends the call; tapping outside the revealed menu (or waiting 3s) closes it without side effects.

- [ ] **Step 6: Clean up XcodeGen churn and commit**

```bash
cd apps/ios && git checkout -- Meeshy.xcodeproj/project.pbxproj Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme Package.resolved 2>/dev/null; cd ..
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift \
        apps/ios/Meeshy/Features/Main/Views/iPadRootView+Sheets.swift
git commit -m "feat(ios): mount CallBubbleView at both app-root sites"
```

- [ ] **Step 7: Clean up the throwaway test simulator**

```bash
xcrun simctl delete meeshy-plan-182 2>/dev/null || true
```

---

## Self-Review

**Spec coverage:**
- Swipe pill → bubble collapse (same effect both directions, distance/velocity threshold): Task 2 (`shouldCollapse`) + Task 4 (gesture wiring). ✅
- Bubble shows video/avatar + signal badge top-right, `NotificationBadge`-style: Task 3 (`CallParticipantVisual`) + Task 5 (badge overlay). ✅
- Bubble draggable, snaps to nearest edge on release: Task 2 (`snappedEdge`) + Task 5 (`dragGesture`). ✅
- Tap bubble → full screen directly: Task 5 (`onTapGesture` in `bubbleCluster`). ✅
- Long-press → mini-menu (mute left, speaker right, hangup below): Task 5 (`revealMenu` + button layout). ✅
- Mute/speaker are persistent toggles, hangup closes menu + ends call immediately: Task 5 (button actions). ✅
- Menu-edge overflow handling (cluster shifts inward when anchored near the screen edge): Task 2 (`menuOffset`) + Task 5 (`bubbleCluster` offset). ✅
- Dismiss layer + 3s auto-dismiss: Task 5 (`dismissLayer`, `armAutoDismiss`). ✅
- Accessibility actions/labels on pill and bubble, 44pt minimum: Task 4 + Task 5 (all buttons are 44pt, bubble itself is 56pt). ✅
- FAB-zone exclusion on vertical drag: Task 2 (`clampedVerticalPosition`, `fabExclusionZoneHeight`) + Task 5 (`dragGesture` onEnded). ✅
- Bubble position resets to default on call end / doesn't persist across calls: Task 1 (`resetEndedStateForNewCall`). ✅
- `CallDisplayMode.bubble`, mount sites unconditional with internal guard mirroring the pill: Task 1 (enum) + Task 6 (mount) + Task 5 (guard). ✅
- No camera control on the bubble, no change to pill↔fullscreen chevron behavior: neither is touched by any task. ✅ (non-objective, correctly left alone)

**Placeholder scan:** no "TBD"/"TODO" remain — every numeric constant (thresholds, margins, colors) is a concrete, justified value; the one spec ambiguity ("à mesurer en implémentation" for the FAB exclusion) is resolved concretely in Task 2 (`fabExclusionZoneHeight = 148`, derived from `FloatingButtons.swift`'s own constants, cited).

**Type consistency:** `BubbleHorizontalEdge` (Task 1) is the single type used consistently by `CallBubbleGestureResolver.snappedEdge`/`menuOffset` (Task 2), `CallManager.bubbleEdge` (Task 1), and `CallBubbleView.bubbleCenter`/`dragGesture` (Task 5) — no renaming drift. `CallParticipantVisual(diameter:)` (Task 3) is called identically at both call sites (44 in Task 3, `CallBubbleGestureResolver.bubbleDiameter` i.e. 56 in Task 5).

**Pre-existing test fallout (caught by reading the actual test suite, not assumed):** `FloatingCallPillViewTests.swift` was read in full before finalizing Task 3. One existing source-guard test (`test_avatar_resolvesRemoteProfile_cacheFirst`) directly asserted on a string (`CacheCoordinator.shared.profiles.load(for:`) that Task 3's extraction moves out of `FloatingCallPillView.swift` — left alone, that test would fail immediately after Task 3 with no plan-level warning. Task 3 now explicitly relocates that assertion to a new `CallParticipantVisualTests` class and replaces it with a positive "pill delegates to `CallParticipantVisual`" check, and Task 3's verification step runs both by name instead of a plain build. The rest of `FloatingCallPillViewTests.swift` (reduce-motion, toggle accessibility, full-width, min-height) and `CallViewObservedObjectInjectionTests.swift` (which only checks `CallView`/`RootView`/`iPadRootView` `callManager` injection strings, unaffected by pill/bubble changes) were also read and confirmed unaffected by every other task in this plan.
