# Timeline Editor — Plan 2 : Logic Core (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementer les 3 composants Swift PURS (zero dependance UIKit/SwiftUI) qui constituent la fondation logique de la timeline : `SnapEngine` (snap multi-cible), `CommandStack` (Undo/Redo persistable), `KeyframeInterpolator` (lerp generique avec easing). Plus la verification que les implementations `apply`/`revert` des 12 EditCommand livrees par Plan 1 sont correctes et idempotentes.

**Architecture:** Module Logic/ isole en pure Swift, testable a 100% sans simulateur. Couverture cible : 95%+. Aucune dependance vers d'autres modules sauf Plan 1 (SDK Models).

**Tech Stack:** Swift 6 strict mode, iOS 17+, Foundation, CoreGraphics (CGFloat/CGPoint/CGSize), XCTest.

**Reference spec:** `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` sections 4 et 9.2 (phase 1).

**Depend de:** Plan 1 (SDK Models) merge — fournit `StoryEasing`, `StoryClipTransition`, `StoryTransitionKind`, `StoryKeyframe`, `TimelineProject`, `TimelineClipKind`, `EditCommand` protocol, `AnyEditCommand` enum, et les 12 commandes concretes (`AddClipCommand`, `DeleteClipCommand`, `MoveClipCommand`, `TrimClipCommand`, `SplitClipCommand`, `AddTransitionCommand`, `RemoveTransitionCommand`, `ChangeTransitionCommand`, `AddKeyframeCommand`, `MoveKeyframeCommand`, `DeleteKeyframeCommand`, `SetClipPropertyCommand`).

**Output module:** `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/` (cree dans la Task 0).
**Output tests:** `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/`.

---

## Convention de testing (xcodebuild, scheme MeeshySDK-Package)

**Pourquoi xcodebuild et non `swift test`** : le module `MeeshyUI` (qui contient `Logic/`) importe SwiftUI et est compilé pour iOS Simulator. `swift test` standalone échoue avec `no such module 'UIKit'` / `no such module 'SwiftUI'`.

**Pourquoi `MeeshySDK-Package` et non `MeeshyUI`** : le scheme `MeeshyUI` est library-only (aucune action test configurée). Le scheme auto-généré `MeeshySDK-Package` couvre tous les targets de tests (MeeshySDKTests + MeeshyUITests).

**Pattern complet pour les tests Logic** :
```bash
xcodebuild test \
  -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK \
  -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyUITests/SnapEngineTests
```

**Filtrage par méthode** : `-only-testing:MeeshyUITests/<TestClass>/<test_method>` (nom complet exact). Pour TDD red→green sur une méthode : utiliser le nom complet ; pour exécuter toute la classe : omettre le suffixe.

**Régression check full SDK** :
```bash
xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
```

**Simulator UDID** : `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (iPhone 16 Pro, iOS 18.2). Booté via `xcrun simctl boot 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 || true` (idempotent).

**Scope rules:**
- Aucun `import UIKit`, `import SwiftUI`. `import Foundation` et `import CoreGraphics` autorises.
- Aucun acces a un singleton (`*.shared`).
- Aucune extension publique sur des types Foundation (`Float`, `CGPoint`...) sauf via le protocole `Lerpable` documente.
- Toutes les API publiques `Sendable`, `Codable` quand persistees.
- Tous les fichiers < 400 lignes (regle d'architecture spec section 1).

---

## Vue d'ensemble des tasks

| # | Task | Fichier livre | Tests |
|---|------|---------------|-------|
| 0 | Bootstrap module + dossiers + sanity test | `Logic/.gitkeep`, test placeholder | 1 |
| 1 | `SnapCandidate` + `SnapResult` types | `SnapEngine.swift` (partiel) | 4 |
| 2 | `SnapEngine` init + tolerance | `SnapEngine.swift` | 3 |
| 3 | `SnapEngine.snap` — disabled flag | `SnapEngine.swift` | 2 |
| 4 | `SnapEngine.snap` — empty / out-of-tolerance | `SnapEngine.swift` | 3 |
| 5 | `SnapEngine.snap` — single candidate within tolerance | `SnapEngine.swift` | 2 |
| 6 | `SnapEngine.snap` — pick nearest of multiple | `SnapEngine.swift` | 2 |
| 7 | `SnapEngine.snap` — priority tie-break | `SnapEngine.swift` | 4 |
| 8 | `SnapEngine.snap` — exact match (distance 0) | `SnapEngine.swift` | 2 |
| 9 | `SnapEngine.snap` — negative time + edge cases | `SnapEngine.swift` | 2 |
| 10 | `Lerpable` protocol + `Float` conformance | `KeyframeInterpolator.swift` | 3 |
| 11 | `Lerpable` for `CGFloat`, `CGPoint`, `CGSize` | `KeyframeInterpolator.swift` | 4 |
| 12 | `KeyframeInterpolator.interpolate` — empty/single keyframe | `KeyframeInterpolator.swift` | 3 |
| 13 | `KeyframeInterpolator.interpolate` — clamp before/after | `KeyframeInterpolator.swift` | 3 |
| 14 | `KeyframeInterpolator.interpolate` — N keyframes linear | `KeyframeInterpolator.swift` | 2 |
| 15 | `KeyframeInterpolator.interpolate` — N keyframes with easing | `KeyframeInterpolator.swift` | 3 |
| 16 | `KeyframeInterpolator.interpolate` — unsorted input safety | `KeyframeInterpolator.swift` | 1 |
| 17 | `KeyframeInterpolator.interpolate` — exact-time hit | `KeyframeInterpolator.swift` | 1 |
| 18 | `CommandStackSnapshot` Codable struct | `CommandStack.swift` (partiel) | 2 |
| 19 | `CommandStack` init + canUndo/canRedo (empty) | `CommandStack.swift` | 3 |
| 20 | `CommandStack.push` — single + canUndo flips | `CommandStack.swift` | 2 |
| 21 | `CommandStack.undo` — pops + canRedo flips | `CommandStack.swift` | 3 |
| 22 | `CommandStack.redo` — restores | `CommandStack.swift` | 2 |
| 23 | `CommandStack.push` — branch truncation after undo | `CommandStack.swift` | 2 |
| 24 | `CommandStack.push` — coalescing same-type same-clip within window | `CommandStack.swift` | 4 |
| 25 | `CommandStack.push` — coalescing rejects different clip / different type / outside window | `CommandStack.swift` | 3 |
| 26 | `CommandStack` — FIFO cap (maxSize) | `CommandStack.swift` | 2 |
| 27 | `CommandStack.snapshot` / `restore` round-trip | `CommandStack.swift` | 3 |
| 28 | `CommandStack.didChange` callback fires on push/undo/redo/restore | `CommandStack.swift` | 4 |
| 29 | `EditCommand` apply/revert idempotence integration sweep | (test only) | 12 |
| 30 | Final coverage + cleanup + module README | (refactor + commit) | 0 |

**Total tasks:** 31 (0 through 30).
**Total steps (approx):** ~155 (5 par task TDD x 31).
**Estimation effort:** 3-4 jours dev senior Swift.

---

### Task 0: Bootstrap module structure

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/.gitkeep`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/LogicModuleSmokeTests.swift`

- [ ] **Step 0.1: Create directory structure**

```bash
mkdir -p packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic
mkdir -p packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic
touch packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/.gitkeep
touch packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/.gitkeep
```

- [ ] **Step 0.2: Write the smoke test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/LogicModuleSmokeTests.swift`:

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Smoke test: verifies that Plan 1 SDK types are reachable from MeeshyUI tests.
/// If this test fails to compile, Plan 1 is not merged correctly.
final class LogicModuleSmokeTests: XCTestCase {
    func test_plan1Types_areReachable() {
        let easing = StoryEasing.linear
        XCTAssertEqual(easing.apply(0.5), 0.5, accuracy: 0.0001)

        let kind = StoryTransitionKind.crossfade
        XCTAssertEqual(kind.rawValue, "crossfade")

        let kf = StoryKeyframe(time: 1.0, opacity: 0.5)
        XCTAssertEqual(kf.time, 1.0, accuracy: 0.0001)

        let clipKind = TimelineClipKind.video
        XCTAssertEqual(clipKind.rawValue, "video")
    }
}
```

- [ ] **Step 0.3: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/LogicModuleSmokeTests`
Expected: PASS (Plan 1 types are reachable). If FAIL with "Cannot find type 'StoryEasing'", abort and verify Plan 1 is merged.

- [ ] **Step 0.4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic
git commit -m "$(cat <<'EOF'
feat(timeline-logic): bootstrap Logic module skeleton

Creates the empty Logic/ source dir and Logic/ tests dir with a smoke
test that verifies Plan 1 SDK types are reachable from MeeshyUI tests
target. Foundation for SnapEngine, CommandStack, KeyframeInterpolator.
EOF
)"
```

---

### Task 1: `SnapCandidate` + `SnapResult` types

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 1.1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`:

```swift
import XCTest
@testable import MeeshyUI

final class SnapEngineTests: XCTestCase {

    // MARK: - SnapCandidate / SnapResult value semantics

    func test_snapCandidate_init_assignsAllFields() {
        let c = SnapCandidate(kind: .playhead, time: 1.5, label: "playhead")
        XCTAssertEqual(c.kind, .playhead)
        XCTAssertEqual(c.time, 1.5, accuracy: 0.0001)
        XCTAssertEqual(c.label, "playhead")
    }

    func test_snapCandidate_isEquatable_sameFieldsAreEqual() {
        let a = SnapCandidate(kind: .clipStart, time: 2.0, label: "A")
        let b = SnapCandidate(kind: .clipStart, time: 2.0, label: "A")
        XCTAssertEqual(a, b)
    }

    func test_snapCandidate_isEquatable_differentKindAreNotEqual() {
        let a = SnapCandidate(kind: .clipStart, time: 2.0, label: nil)
        let b = SnapCandidate(kind: .clipEnd,   time: 2.0, label: nil)
        XCTAssertNotEqual(a, b)
    }

    func test_snapResult_init_assignsAllFields() {
        let c = SnapCandidate(kind: .gridMajor, time: 1.0, label: nil)
        let r = SnapResult(snappedTime: 1.0, matched: c)
        XCTAssertEqual(r.snappedTime, 1.0, accuracy: 0.0001)
        XCTAssertEqual(r.matched, c)
    }
}
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: FAIL with "Cannot find type 'SnapCandidate'" (or similar).

- [ ] **Step 1.3: Write minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`:

```swift
import Foundation

// MARK: - SnapCandidate

/// A candidate point in time that the SnapEngine can snap a raw user time to.
public struct SnapCandidate: Equatable, Sendable {

    /// The semantic kind of a snap candidate. Used to break ties (priority order).
    public enum Kind: Sendable, Equatable {
        case playhead
        case clipStart
        case clipEnd
        case gridMajor
        case gridMinor
        case keyframe
        case slideStart
        case slideEnd
    }

    public let kind: Kind
    public let time: Float
    public let label: String?

    public init(kind: Kind, time: Float, label: String? = nil) {
        self.kind = kind
        self.time = time
        self.label = label
    }
}

// MARK: - SnapResult

/// The output of `SnapEngine.snap`. `matched == nil` means no snap occurred
/// (raw time was returned unchanged).
public struct SnapResult: Equatable, Sendable {
    public let snappedTime: Float
    public let matched: SnapCandidate?

    public init(snappedTime: Float, matched: SnapCandidate?) {
        self.snappedTime = snappedTime
        self.matched = matched
    }
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (4 tests).

- [ ] **Step 1.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "$(cat <<'EOF'
feat(timeline-logic): add SnapCandidate and SnapResult value types

Pure value types for the snap engine input/output. Equatable + Sendable
for predictable use in @MainActor view models. Eight Kind cases match
the spec section 4.1 priority hierarchy.
EOF
)"
```

---

### Task 2: `SnapEngine` init + tolerance

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 2.1: Write the failing test**

Append to `SnapEngineTests`:

```swift
    // MARK: - SnapEngine init / tolerance

    func test_snapEngine_init_storesTolerance() {
        let engine = SnapEngine(toleranceSeconds: 0.25)
        XCTAssertEqual(engine.toleranceSeconds, 0.25, accuracy: 0.0001)
    }

    func test_snapEngine_init_clampsNegativeToleranceToZero() {
        let engine = SnapEngine(toleranceSeconds: -1.0)
        XCTAssertEqual(engine.toleranceSeconds, 0.0, accuracy: 0.0001)
    }

    func test_snapEngine_isSendable_compileTimeCheck() {
        // Compile-time only: this should compile without warnings.
        let engine = SnapEngine(toleranceSeconds: 0.1)
        let _: any Sendable = engine
        XCTAssertEqual(engine.toleranceSeconds, 0.1, accuracy: 0.0001)
    }
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: FAIL with "Cannot find 'SnapEngine' in scope".

- [ ] **Step 2.3: Write minimal implementation**

Append to `SnapEngine.swift`:

```swift
// MARK: - SnapEngine

/// Pure value-type snap engine. Picks the best snap candidate within tolerance,
/// using priority hierarchy to break ties.
///
/// This type is `Sendable` and contains no mutable state.
public struct SnapEngine: Sendable {

    /// Tolerance in seconds. A candidate is eligible if `|candidate.time - rawTime| <= tolerance`.
    /// Clamped to 0 if a negative value is provided.
    public let toleranceSeconds: Float

    public init(toleranceSeconds: Float) {
        self.toleranceSeconds = max(0, toleranceSeconds)
    }
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (7 tests total: 4 from Task 1 + 3 here).

- [ ] **Step 2.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "feat(timeline-logic): add SnapEngine struct with tolerance"
```

---

### Task 3: `SnapEngine.snap` — disabled flag

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 3.1: Write the failing test**

Append to `SnapEngineTests`:

```swift
    // MARK: - SnapEngine.snap — disabled

    func test_snap_disabledTrue_returnsRawTime_evenWithCandidatesInRange() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let result = engine.snap(rawTime: 2.05, candidates: [candidate], disabled: true)
        XCTAssertEqual(result.snappedTime, 2.05, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_disabledDefaultsToFalse() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let result = engine.snap(rawTime: 2.05, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 2.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: FAIL — `snap(rawTime:candidates:disabled:)` does not exist.

- [ ] **Step 3.3: Write minimal implementation**

Append the `snap` method to `SnapEngine` struct in `SnapEngine.swift`:

```swift
extension SnapEngine {

    /// Returns the snapped time and matching candidate (if any).
    ///
    /// - Parameters:
    ///   - rawTime: The raw user-input time (e.g. from a drag gesture).
    ///   - candidates: All snap candidates to consider for the current frame.
    ///   - disabled: If `true` (e.g. user is doing a 2-finger override drag),
    ///               returns `rawTime` unchanged with `matched: nil`.
    /// - Returns: A `SnapResult` with `snappedTime` (= candidate.time when matched)
    ///            and `matched` (the winning candidate or nil).
    ///
    /// - Complexity: O(n) over `candidates`. Safe to call at 60 fps.
    public func snap(
        rawTime: Float,
        candidates: [SnapCandidate],
        disabled: Bool = false
    ) -> SnapResult {
        if disabled {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        // Will be expanded in subsequent tasks. For now: only handle the disabled
        // path and the trivial single-in-range case via Task 5.
        return Self.pickBest(rawTime: rawTime, candidates: candidates, tolerance: toleranceSeconds)
    }

    /// Internal helper — extracted for testability and to keep `snap` readable
    /// as more behaviour is added in subsequent tasks.
    static func pickBest(rawTime: Float, candidates: [SnapCandidate], tolerance: Float) -> SnapResult {
        guard !candidates.isEmpty else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        // Filter to in-range candidates.
        let inRange = candidates.filter { abs($0.time - rawTime) <= tolerance }
        guard let winner = inRange.first else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        // Naive single-pick for now (Task 6+ refines).
        return SnapResult(snappedTime: winner.time, matched: winner)
    }
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (9 tests total).

- [ ] **Step 3.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "feat(timeline-logic): SnapEngine.snap honours disabled flag (2-finger drag override)"
```

---

### Task 4: `SnapEngine.snap` — empty / out-of-tolerance

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 4.1: Write the failing test**

Append:

```swift
    // MARK: - SnapEngine.snap — empty / out of tolerance

    func test_snap_emptyCandidates_returnsRawTimeUnchanged() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let result = engine.snap(rawTime: 3.14, candidates: [])
        XCTAssertEqual(result.snappedTime, 3.14, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_allCandidatesOutOfTolerance_returnsRawTimeUnchanged() {
        let engine = SnapEngine(toleranceSeconds: 0.1)
        let candidates = [
            SnapCandidate(kind: .playhead, time: 0.0, label: nil),
            SnapCandidate(kind: .clipStart, time: 5.0, label: nil)
        ]
        let result = engine.snap(rawTime: 2.5, candidates: candidates)
        XCTAssertEqual(result.snappedTime, 2.5, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_zeroTolerance_onlyExactMatchesSnap() {
        let engine = SnapEngine(toleranceSeconds: 0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let exact = engine.snap(rawTime: 2.0, candidates: [candidate])
        let nearMiss = engine.snap(rawTime: 2.0001, candidates: [candidate])
        XCTAssertEqual(exact.matched, candidate)
        XCTAssertNil(nearMiss.matched)
    }
```

- [ ] **Step 4.2: Run test to verify it passes (logic from Task 3 already covers these cases)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (12 tests total). If FAIL, the `pickBest` helper has a bug — fix before continuing.

- [ ] **Step 4.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "test(timeline-logic): SnapEngine handles empty/out-of-range/zero-tolerance"
```

---

### Task 5: `SnapEngine.snap` — single candidate within tolerance

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 5.1: Write the failing test**

Append:

```swift
    // MARK: - SnapEngine.snap — single candidate

    func test_snap_singleCandidateWithinTolerance_snapsAndReturnsMatch() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let candidate = SnapCandidate(kind: .clipEnd, time: 3.0, label: "clipA end")
        let result = engine.snap(rawTime: 3.2, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 3.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }

    func test_snap_singleCandidateAtToleranceBoundary_snaps() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let candidate = SnapCandidate(kind: .clipEnd, time: 3.0, label: nil)
        // |2.5 - 3.0| == 0.5, exactly at the boundary
        let result = engine.snap(rawTime: 2.5, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 3.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }
```

- [ ] **Step 5.2: Run test to verify it passes (covered by Task 3 implementation)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (14 tests).

- [ ] **Step 5.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "test(timeline-logic): SnapEngine snaps single candidate at tolerance boundary"
```

---

### Task 6: `SnapEngine.snap` — pick nearest of multiple

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 6.1: Write the failing test**

Append to `SnapEngineTests`:

```swift
    // MARK: - SnapEngine.snap — nearest

    func test_snap_multipleCandidatesInRange_picksNearest() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let near = SnapCandidate(kind: .gridMinor, time: 2.1, label: nil)
        let far  = SnapCandidate(kind: .gridMinor, time: 2.8, label: nil)
        // Order in array intentionally puts far first to verify that proximity wins, not order.
        let result = engine.snap(rawTime: 2.0, candidates: [far, near])
        XCTAssertEqual(result.matched, near)
        XCTAssertEqual(result.snappedTime, 2.1, accuracy: 0.0001)
    }

    func test_snap_multipleCandidatesInRange_skipsOutOfRange() {
        let engine = SnapEngine(toleranceSeconds: 0.3)
        let outOfRange = SnapCandidate(kind: .gridMajor, time: 1.0, label: nil)
        let inRange    = SnapCandidate(kind: .gridMinor, time: 2.05, label: nil)
        let result = engine.snap(rawTime: 2.0, candidates: [outOfRange, inRange])
        XCTAssertEqual(result.matched, inRange)
    }
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests
Expected: FAIL — current naive pick returns the first in-range, not the nearest.

- [ ] **Step 6.3: Update `pickBest` to score by distance**

Replace the body of `pickBest` in `SnapEngine.swift`:

```swift
    static func pickBest(rawTime: Float, candidates: [SnapCandidate], tolerance: Float) -> SnapResult {
        guard !candidates.isEmpty else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        var best: (candidate: SnapCandidate, distance: Float)?
        for c in candidates {
            let d = abs(c.time - rawTime)
            if d > tolerance { continue }
            if best == nil || d < best!.distance {
                best = (c, d)
            }
        }
        guard let winner = best?.candidate else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return SnapResult(snappedTime: winner.time, matched: winner)
    }
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (16 tests).

- [ ] **Step 6.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "feat(timeline-logic): SnapEngine picks nearest candidate (distance-based)"
```

---

### Task 7: `SnapEngine.snap` — priority tie-break

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

Spec section 4.1 priority order (highest first):
`playhead > clipStart/clipEnd > keyframe > gridMajor > gridMinor > slideStart/slideEnd`.

- [ ] **Step 7.1: Write the failing test**

Append to `SnapEngineTests`:

```swift
    // MARK: - SnapEngine.snap — priority tie-break

    func test_snap_equalDistance_playheadBeatsClipEnd() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let playhead = SnapCandidate(kind: .playhead,  time: 2.5, label: nil)
        let clipEnd  = SnapCandidate(kind: .clipEnd,   time: 1.5, label: nil)
        // rawTime 2.0 is exactly equidistant between both
        let result = engine.snap(rawTime: 2.0, candidates: [clipEnd, playhead])
        XCTAssertEqual(result.matched, playhead)
    }

    func test_snap_equalDistance_clipStartBeatsKeyframe() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let clipStart = SnapCandidate(kind: .clipStart, time: 2.5, label: nil)
        let keyframe  = SnapCandidate(kind: .keyframe,  time: 1.5, label: nil)
        let result = engine.snap(rawTime: 2.0, candidates: [keyframe, clipStart])
        XCTAssertEqual(result.matched, clipStart)
    }

    func test_snap_equalDistance_keyframeBeatsGridMajor() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let keyframe  = SnapCandidate(kind: .keyframe,  time: 2.5, label: nil)
        let gridMajor = SnapCandidate(kind: .gridMajor, time: 1.5, label: nil)
        let result = engine.snap(rawTime: 2.0, candidates: [gridMajor, keyframe])
        XCTAssertEqual(result.matched, keyframe)
    }

    func test_snap_equalDistance_slideStartBeatsNothingHigher() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let slideStart = SnapCandidate(kind: .slideStart, time: 2.5, label: nil)
        let gridMinor  = SnapCandidate(kind: .gridMinor,  time: 1.5, label: nil)
        // gridMinor priority > slideStart priority
        let result = engine.snap(rawTime: 2.0, candidates: [slideStart, gridMinor])
        XCTAssertEqual(result.matched, gridMinor)
    }
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: FAIL on at least one of the four tie-break tests.

- [ ] **Step 7.3: Add priority weights and refine `pickBest`**

Replace the `extension SnapEngine` block (Tasks 3+6) in `SnapEngine.swift` with the version below, adding a `priority` helper and using `(distance, -priority)` lexicographic ordering:

```swift
extension SnapEngine {

    /// Higher value = higher priority (wins tie-break at equal distance).
    /// Order matches spec section 4.1 priority hierarchy.
    static func priority(for kind: SnapCandidate.Kind) -> Int {
        switch kind {
        case .playhead:                return 70
        case .clipStart, .clipEnd:     return 60
        case .keyframe:                return 50
        case .gridMajor:               return 40
        case .gridMinor:               return 30
        case .slideStart, .slideEnd:   return 20
        }
    }

    public func snap(
        rawTime: Float,
        candidates: [SnapCandidate],
        disabled: Bool = false
    ) -> SnapResult {
        if disabled {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return Self.pickBest(rawTime: rawTime, candidates: candidates, tolerance: toleranceSeconds)
    }

    static func pickBest(rawTime: Float, candidates: [SnapCandidate], tolerance: Float) -> SnapResult {
        guard !candidates.isEmpty else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        var best: (candidate: SnapCandidate, distance: Float, priority: Int)?
        for c in candidates {
            let d = abs(c.time - rawTime)
            if d > tolerance { continue }
            let p = priority(for: c.kind)
            if let cur = best {
                let isCloser = d < cur.distance - 1e-6
                let isTieAndHigherPriority = abs(d - cur.distance) <= 1e-6 && p > cur.priority
                if isCloser || isTieAndHigherPriority {
                    best = (c, d, p)
                }
            } else {
                best = (c, d, p)
            }
        }
        guard let winner = best?.candidate else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return SnapResult(snappedTime: winner.time, matched: winner)
    }
}
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (20 tests).

- [ ] **Step 7.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "feat(timeline-logic): SnapEngine breaks ties via spec priority hierarchy"
```

---

### Task 8: `SnapEngine.snap` — exact match (distance 0)

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 8.1: Write the failing test**

Append:

```swift
    // MARK: - SnapEngine.snap — exact match

    func test_snap_exactMatch_returnsExactCandidate() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let candidate = SnapCandidate(kind: .playhead, time: 4.0, label: nil)
        let result = engine.snap(rawTime: 4.0, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 4.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }

    func test_snap_exactMatch_higherPriorityWinsOverEqualDistanceLowerPriority() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let lowPri  = SnapCandidate(kind: .slideStart, time: 4.0, label: nil)
        let highPri = SnapCandidate(kind: .playhead,   time: 4.0, label: nil)
        let result = engine.snap(rawTime: 4.0, candidates: [lowPri, highPri])
        XCTAssertEqual(result.matched, highPri)
    }
```

- [ ] **Step 8.2: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (22 tests).

- [ ] **Step 8.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "test(timeline-logic): SnapEngine resolves exact-match priority correctly"
```

---

### Task 9: `SnapEngine.snap` — negative time + edge cases

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift`

- [ ] **Step 9.1: Write the failing test**

Append:

```swift
    // MARK: - SnapEngine.snap — edge cases

    func test_snap_negativeRawTime_handledAsNumber() {
        // SnapEngine is a pure number cruncher — clamping to >= 0 is the caller's job.
        let engine = SnapEngine(toleranceSeconds: 0.2)
        let candidate = SnapCandidate(kind: .slideStart, time: 0.0, label: nil)
        let result = engine.snap(rawTime: -0.1, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 0.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }

    func test_snap_largeNumberOfCandidates_picksCorrectly() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        var candidates: [SnapCandidate] = []
        for i in 0..<1_000 {
            candidates.append(SnapCandidate(kind: .gridMinor, time: Float(i), label: nil))
        }
        let target = SnapCandidate(kind: .playhead, time: 500.4, label: nil)
        candidates.append(target)
        let result = engine.snap(rawTime: 500.4, candidates: candidates)
        XCTAssertEqual(result.matched, target)
    }
```

- [ ] **Step 9.2: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests`
Expected: PASS (24 tests — matches spec target).

- [ ] **Step 9.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/SnapEngineTests.swift
git commit -m "test(timeline-logic): SnapEngine handles negative time and large candidate lists"
```

---

### Task 10: `Lerpable` protocol + `Float` conformance

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 10.1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`:

```swift
import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

final class KeyframeInterpolatorTests: XCTestCase {

    // MARK: - Lerpable: Float

    func test_float_lerp_atZero_returnsFrom() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 0), 10, accuracy: 0.0001)
    }

    func test_float_lerp_atOne_returnsTo() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 1), 20, accuracy: 0.0001)
    }

    func test_float_lerp_atMidpoint_returnsAverage() {
        XCTAssertEqual(Float.lerp(from: 10, to: 20, t: 0.5), 15, accuracy: 0.0001)
    }
}
```

- [ ] **Step 10.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: FAIL — `Float` has no static `lerp` method.

- [ ] **Step 10.3: Write minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`:

```swift
import Foundation
import CoreGraphics
import MeeshySDK

// MARK: - Lerpable

/// Capability for linear interpolation between two values of the same type.
///
/// `t` is in `[0, 1]` and is **not** clamped by the protocol — the caller is
/// expected to clamp/ease before calling. The `KeyframeInterpolator` performs
/// clamping itself before invoking `lerp`.
public protocol Lerpable: Sendable {
    static func lerp(from: Self, to: Self, t: Float) -> Self
}

extension Float: Lerpable {
    public static func lerp(from: Float, to: Float, t: Float) -> Float {
        return from + (to - from) * t
    }
}
```

- [ ] **Step 10.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (3 tests).

- [ ] **Step 10.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "feat(timeline-logic): add Lerpable protocol with Float conformance"
```

---

### Task 11: `Lerpable` for `CGFloat`, `CGPoint`, `CGSize`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 11.1: Write the failing test**

Append to `KeyframeInterpolatorTests`:

```swift
    // MARK: - Lerpable: CGFloat

    func test_cgFloat_lerp_atMidpoint() {
        let result = CGFloat.lerp(from: 0, to: 10, t: 0.5)
        XCTAssertEqual(result, 5, accuracy: 0.0001)
    }

    // MARK: - Lerpable: CGPoint

    func test_cgPoint_lerp_componentWise() {
        let result = CGPoint.lerp(from: CGPoint(x: 0, y: 0),
                                  to: CGPoint(x: 10, y: 20),
                                  t: 0.5)
        XCTAssertEqual(result.x, 5, accuracy: 0.0001)
        XCTAssertEqual(result.y, 10, accuracy: 0.0001)
    }

    // MARK: - Lerpable: CGSize

    func test_cgSize_lerp_componentWise() {
        let result = CGSize.lerp(from: CGSize(width: 100, height: 200),
                                 to: CGSize(width: 200, height: 100),
                                 t: 0.25)
        XCTAssertEqual(result.width,  125, accuracy: 0.0001)
        XCTAssertEqual(result.height, 175, accuracy: 0.0001)
    }

    // MARK: - Lerpable: extrapolation past 1.0 (no clamping in the protocol itself)

    func test_float_lerp_pastOne_extrapolates() {
        XCTAssertEqual(Float.lerp(from: 0, to: 10, t: 1.5), 15, accuracy: 0.0001)
    }
```

- [ ] **Step 11.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: FAIL — `CGFloat`, `CGPoint`, `CGSize` do not conform to `Lerpable`.

- [ ] **Step 11.3: Add conformances**

Append to `KeyframeInterpolator.swift`:

```swift
extension CGFloat: Lerpable {
    public static func lerp(from: CGFloat, to: CGFloat, t: Float) -> CGFloat {
        return from + (to - from) * CGFloat(t)
    }
}

extension CGPoint: Lerpable {
    public static func lerp(from: CGPoint, to: CGPoint, t: Float) -> CGPoint {
        return CGPoint(
            x: CGFloat.lerp(from: from.x, to: to.x, t: t),
            y: CGFloat.lerp(from: from.y, to: to.y, t: t)
        )
    }
}

extension CGSize: Lerpable {
    public static func lerp(from: CGSize, to: CGSize, t: Float) -> CGSize {
        return CGSize(
            width:  CGFloat.lerp(from: from.width,  to: to.width,  t: t),
            height: CGFloat.lerp(from: from.height, to: to.height, t: t)
        )
    }
}
```

- [ ] **Step 11.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (7 tests total).

- [ ] **Step 11.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "feat(timeline-logic): conform CGFloat, CGPoint, CGSize to Lerpable"
```

---

### Task 12: `KeyframeInterpolator.interpolate` — empty / single keyframe

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 12.1: Write the failing test**

Append to `KeyframeInterpolatorTests`:

```swift
    // MARK: - KeyframeInterpolator.interpolate — degenerate

    func test_interpolate_emptyKeyframes_returnsNil() {
        let result: Float? = KeyframeInterpolator.interpolate(
            keyframes: [],
            at: 0.5
        )
        XCTAssertNil(result)
    }

    func test_interpolate_singleKeyframe_atKeyframeTime_returnsValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 42.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 42.0, accuracy: 0.0001)
    }

    func test_interpolate_singleKeyframe_afterKeyframeTime_returnsValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 42.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 5.0)
        XCTAssertEqual(result, 42.0, accuracy: 0.0001)
    }
```

- [ ] **Step 12.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: FAIL — `KeyframeInterpolator` namespace does not exist.

- [ ] **Step 12.3: Write minimal implementation**

Append to `KeyframeInterpolator.swift`:

```swift
// MARK: - KeyframeInterpolator

/// Pure-Swift keyframe interpolation. The input is a list of
/// `(time, value, easing)` tuples (sorted by time on entry — see Task 16
/// for unsorted-input safety).
///
/// - 0 keyframes -> returns `nil`. The caller falls back to the static value.
/// - 1 keyframe  -> returns its value (constant for all `t`).
/// - N keyframes -> finds the segment `[k_i, k_{i+1}]` such that
///   `k_i.time <= t <= k_{i+1}.time`, computes
///   `u = (t - k_i.time) / (k_{i+1}.time - k_i.time)`, applies
///   `k_i.easing.apply(u)`, and returns `T.lerp(from: k_i.value, to: k_{i+1}.value, t: easedU)`.
/// - `t < k_0.time` -> returns `k_0.value` (clamp).
/// - `t > k_n.time` -> returns `k_n.value` (clamp).
public enum KeyframeInterpolator {

    public static func interpolate<T: Lerpable>(
        keyframes: [(time: Float, value: T, easing: StoryEasing)],
        at time: Float
    ) -> T? {
        guard !keyframes.isEmpty else { return nil }

        // Defensive sort — see Task 16. Cheap when already sorted.
        let sorted = keyframes.sorted { $0.time < $1.time }

        if sorted.count == 1 {
            return sorted[0].value
        }
        if let first = sorted.first, time <= first.time {
            return first.value
        }
        if let last = sorted.last, time >= last.time {
            return last.value
        }

        // Find the bracketing segment.
        for i in 0..<(sorted.count - 1) {
            let lo = sorted[i]
            let hi = sorted[i + 1]
            if time >= lo.time && time <= hi.time {
                let span = hi.time - lo.time
                let u = span > 0 ? (time - lo.time) / span : 0
                let easedU = lo.easing.apply(u)
                return T.lerp(from: lo.value, to: hi.value, t: easedU)
            }
        }

        // Should be unreachable due to clamps above, but be defensive.
        return sorted.last?.value
    }
}
```

- [ ] **Step 12.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (10 tests total).

- [ ] **Step 12.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "feat(timeline-logic): KeyframeInterpolator handles empty/single keyframe"
```

---

### Task 13: `KeyframeInterpolator.interpolate` — clamp before/after

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 13.1: Write the failing test**

Append:

```swift
    // MARK: - KeyframeInterpolator — clamp

    func test_interpolate_beforeFirstKeyframe_clampsToFirstValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 10.0, easing: .linear),
            (time: 3.0, value: 30.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 0.0)
        XCTAssertEqual(result, 10.0, accuracy: 0.0001)
    }

    func test_interpolate_afterLastKeyframe_clampsToLastValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 1.0, value: 10.0, easing: .linear),
            (time: 3.0, value: 30.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 100.0)
        XCTAssertEqual(result, 30.0, accuracy: 0.0001)
    }

    func test_interpolate_negativeTime_clampsToFirstValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 5.0, easing: .linear),
            (time: 2.0, value: 25.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: -1.0)
        XCTAssertEqual(result, 5.0, accuracy: 0.0001)
    }
```

- [ ] **Step 13.2: Run test to verify it passes (covered by Task 12 implementation)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (13 tests total).

- [ ] **Step 13.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "test(timeline-logic): KeyframeInterpolator clamps before/after range"
```

---

### Task 14: `KeyframeInterpolator.interpolate` — N keyframes linear

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 14.1: Write the failing test**

Append:

```swift
    // MARK: - KeyframeInterpolator — N keyframes linear

    func test_interpolate_twoKeyframes_atMidpoint_returnsAverage() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .linear),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 5.0, accuracy: 0.0001)
    }

    func test_interpolate_threeKeyframes_secondSegment() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,   easing: .linear),
            (time: 1.0, value: 10.0,  easing: .linear),
            (time: 2.0, value: 100.0, easing: .linear)
        ]
        // t = 1.5 is mid-second-segment: 10 + (100-10) * 0.5 = 55
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.5)
        XCTAssertEqual(result, 55.0, accuracy: 0.0001)
    }
```

- [ ] **Step 14.2: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (15 tests total).

- [ ] **Step 14.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "test(timeline-logic): KeyframeInterpolator handles linear N-keyframe segments"
```

---

### Task 15: `KeyframeInterpolator.interpolate` — N keyframes with easing

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 15.1: Write the failing test**

Append:

```swift
    // MARK: - KeyframeInterpolator — easing

    func test_interpolate_easeIn_atMidpoint_isLessThanLinearMid() {
        // For easeIn (t*t), at t=0.5 the eased value is 0.25, so the result
        // is 0 + (10 - 0) * 0.25 = 2.5 (less than linear which would be 5.0)
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeIn),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 2.5, accuracy: 0.0001)
    }

    func test_interpolate_easeOut_atMidpoint_isGreaterThanLinearMid() {
        // For easeOut (1 - (1-t)^2), at t=0.5 the eased value is 0.75
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeOut),
            (time: 2.0, value: 10.0, easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 7.5, accuracy: 0.0001)
    }

    func test_interpolate_easingComesFromOriginKeyframe_notDestination() {
        // Verify the easing of the *origin* keyframe is applied, not the destination.
        // First segment uses easeIn (origin), second segment ignored here.
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,  easing: .easeIn),    // applies to first segment
            (time: 2.0, value: 10.0, easing: .easeOut)    // applies to (non-existent) next segment
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 2.5, accuracy: 0.0001) // easeIn(0.5) = 0.25 -> 2.5
    }
```

- [ ] **Step 15.2: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (18 tests total).

- [ ] **Step 15.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "test(timeline-logic): KeyframeInterpolator applies origin keyframe easing"
```

---

### Task 16: `KeyframeInterpolator.interpolate` — unsorted input safety

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 16.1: Write the failing test**

Append:

```swift
    // MARK: - KeyframeInterpolator — unsorted input

    func test_interpolate_unsortedKeyframes_sortsBeforeUsing() {
        // Same data as test_interpolate_threeKeyframes_secondSegment but reordered
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 2.0, value: 100.0, easing: .linear),
            (time: 0.0, value: 0.0,   easing: .linear),
            (time: 1.0, value: 10.0,  easing: .linear)
        ]
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.5)
        XCTAssertEqual(result, 55.0, accuracy: 0.0001)
    }
```

- [ ] **Step 16.2: Run test to verify it passes (Task 12 sorts defensively)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (19 tests).

- [ ] **Step 16.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "test(timeline-logic): KeyframeInterpolator tolerates unsorted input"
```

---

### Task 17: `KeyframeInterpolator.interpolate` — exact-time hit on a non-boundary keyframe

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift`

- [ ] **Step 17.1: Write the failing test**

Append:

```swift
    // MARK: - KeyframeInterpolator — exact time hit

    func test_interpolate_exactlyOnInteriorKeyframe_returnsItsValue() {
        let kfs: [(time: Float, value: Float, easing: StoryEasing)] = [
            (time: 0.0, value: 0.0,   easing: .linear),
            (time: 1.0, value: 10.0,  easing: .linear),
            (time: 2.0, value: 100.0, easing: .linear)
        ]
        // At t=1.0 (exactly the second keyframe), expected value is 10
        // (segment [0,1] gives lo=0,hi=10,u=1.0 -> 10)
        let result = KeyframeInterpolator.interpolate(keyframes: kfs, at: 1.0)
        XCTAssertEqual(result, 10.0, accuracy: 0.0001)
    }
```

- [ ] **Step 17.2: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/KeyframeInterpolatorTests`
Expected: PASS (20 tests). Spec target was 16, we have 20 — over-coverage acceptable.

- [ ] **Step 17.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/KeyframeInterpolatorTests.swift
git commit -m "test(timeline-logic): KeyframeInterpolator returns exact value on interior keyframe hit"
```

---

### Task 18: `CommandStackSnapshot` Codable struct

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 18.1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`:

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class CommandStackTests: XCTestCase {

    // MARK: - Helpers

    /// Factory: produces a fresh AddClipCommand wrapped in AnyEditCommand.
    /// Each call creates a new UUID + timestamp.
    private func makeAddCmd(clipId: String = UUID().uuidString,
                            timestamp: Date = Date()) -> AnyEditCommand {
        return .addClip(AddClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            postMediaId: "pm-\(clipId)",
            kind: .video,
            startTime: 0,
            duration: 1.0,
            content: nil
        ))
    }

    private func makeMoveCmd(clipId: String = "c1",
                             oldStart: Float = 0,
                             newStart: Float = 1,
                             timestamp: Date = Date()) -> AnyEditCommand {
        return .moveClip(MoveClipCommand(
            id: UUID().uuidString,
            timestamp: timestamp,
            clipId: clipId,
            kind: .video,
            oldStartTime: oldStart,
            newStartTime: newStart
        ))
    }

    // MARK: - CommandStackSnapshot

    func test_snapshot_init_storesCommandsAndCursor() {
        let cmds = [makeAddCmd(), makeAddCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 1)
        XCTAssertEqual(snap.commands.count, 2)
        XCTAssertEqual(snap.cursor, 1)
    }

    func test_snapshot_codableRoundTrip() throws {
        let cmds = [makeAddCmd(), makeMoveCmd()]
        let snap = CommandStackSnapshot(commands: cmds, cursor: 2)

        let data = try JSONEncoder().encode(snap)
        let decoded = try JSONDecoder().decode(CommandStackSnapshot.self, from: data)

        XCTAssertEqual(decoded.commands.count, 2)
        XCTAssertEqual(decoded.cursor, 2)
    }
}
```

- [ ] **Step 18.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `CommandStackSnapshot` does not exist.

- [ ] **Step 18.3: Write minimal implementation**

Create `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`:

```swift
import Foundation
import MeeshySDK

// MARK: - CommandStackSnapshot

/// Persistable snapshot of a CommandStack — written to `{draft}.commands.json`
/// alongside the draft itself. Versioning is by JSON shape; any new field added
/// later must be `Optional` + `decodeIfPresent` to preserve forward compat.
///
/// NOTE: Originally specced as `Equatable` but Plan 1 shipped `AnyEditCommand`
/// without `Equatable`, so synthesis is not possible. None of Plan 2's 32
/// CommandStackTests asserts `==` on snapshots — they compare via individual
/// fields (commands.count, cursor, JSON round-trip). If Equatable is later
/// needed, Plan 3+ should add it on `AnyEditCommand` first.
public struct CommandStackSnapshot: Codable, Sendable {
    public let commands: [AnyEditCommand]
    public let cursor: Int

    public init(commands: [AnyEditCommand], cursor: Int) {
        self.commands = commands
        self.cursor = cursor
    }
}
```

- [ ] **Step 18.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (2 tests).

- [ ] **Step 18.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): add CommandStackSnapshot Codable struct"
```

---

### Task 19: `CommandStack` init + canUndo/canRedo (empty)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 19.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack init

    func test_init_default_emptyState() {
        let stack = CommandStack()
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_init_customParameters_storedCorrectly() {
        let stack = CommandStack(maxSize: 10, coalesceWindow: 1.0)
        XCTAssertEqual(stack.maxSize, 10)
        XCTAssertEqual(stack.coalesceWindow, 1.0, accuracy: 0.0001)
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_init_clampsMaxSize_atLeastOne() {
        // maxSize 0 or negative would make push() unable to retain the new command — clamp to 1.
        let stack = CommandStack(maxSize: 0)
        XCTAssertEqual(stack.maxSize, 1)
    }
```

- [ ] **Step 19.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `CommandStack` does not exist.

- [ ] **Step 19.3: Write minimal implementation**

Append to `CommandStack.swift`:

```swift
// MARK: - CommandStack

/// Linear undo/redo stack with FIFO cap and time-based coalescing.
///
/// Thread safety: a single instance is intended to be owned by one
/// `@MainActor` view model. The class is `@unchecked Sendable` because all
/// mutation goes through methods, but the contract is "one owner, main actor".
public final class CommandStack: @unchecked Sendable {

    /// Maximum number of commands kept on the stack. Older commands are evicted
    /// FIFO when the cap is reached. Always >= 1.
    public let maxSize: Int

    /// Time window in seconds during which a same-kind, same-target command
    /// will be merged into the previous one (the new replaces the old).
    public let coalesceWindow: TimeInterval

    /// Optional callback fired after any state-changing operation:
    /// push (whether coalesced or not), undo, redo, restore.
    public var didChange: ((CommandStack) -> Void)?

    private var commands: [AnyEditCommand] = []
    private var cursor: Int = 0
    // cursor invariant: commands[0..<cursor] are "applied", commands[cursor..<count] are "redo-able"

    public init(maxSize: Int = 50, coalesceWindow: TimeInterval = 0.5) {
        self.maxSize = max(1, maxSize)
        self.coalesceWindow = coalesceWindow
    }

    public var canUndo: Bool { cursor > 0 }
    public var canRedo: Bool { cursor < commands.count }
}
```

- [ ] **Step 19.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (5 tests total).

- [ ] **Step 19.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): add CommandStack init + canUndo/canRedo"
```

---

### Task 20: `CommandStack.push` — single + canUndo flips

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 20.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack.push

    func test_push_singleCommand_canUndoBecomesTrue() {
        let stack = CommandStack()
        stack.push(makeAddCmd())
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }

    func test_push_twoCommands_bothUndoable() {
        let stack = CommandStack(coalesceWindow: 0) // disable coalescing for this test
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        XCTAssertTrue(stack.canUndo)
        XCTAssertEqual(stack.count, 2)
    }
```

- [ ] **Step 20.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `push(_:)` and `count` do not exist.

- [ ] **Step 20.3: Add `push` + `count`**

Append to `CommandStack.swift`:

```swift
extension CommandStack {

    /// Total number of commands currently retained on the stack
    /// (includes both undone and applied).
    public var count: Int { commands.count }

    /// Push a command on top of the stack.
    ///
    /// Side effects:
    ///   - Truncates any redo branch (commands at index >= cursor are dropped).
    ///   - May coalesce with the previous command (Task 24).
    ///   - May evict the oldest command FIFO if `maxSize` is exceeded (Task 26).
    ///   - Calls `didChange` after the mutation completes.
    public func push(_ command: AnyEditCommand) {
        // Truncate redo branch first.
        if cursor < commands.count {
            commands.removeSubrange(cursor..<commands.count)
        }
        commands.append(command)
        cursor = commands.count
        didChange?(self)
    }
}
```

- [ ] **Step 20.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (7 tests).

- [ ] **Step 20.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack.push appends and truncates redo branch"
```

---

### Task 21: `CommandStack.undo` — pops + canRedo flips

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 21.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack.undo

    func test_undo_emptyStack_returnsNil() {
        let stack = CommandStack()
        XCTAssertNil(stack.undo())
    }

    func test_undo_oneCommand_returnsItAndCanRedo() {
        let stack = CommandStack(coalesceWindow: 0)
        let cmd = makeAddCmd(clipId: "x")
        stack.push(cmd)
        let undone = stack.undo()
        XCTAssertNotNil(undone)
        XCTAssertFalse(stack.canUndo)
        XCTAssertTrue(stack.canRedo)
    }

    func test_undo_returnsCommandsInLIFOOrder() {
        let stack = CommandStack(coalesceWindow: 0)
        let a = makeAddCmd(clipId: "a")
        let b = makeAddCmd(clipId: "b")
        stack.push(a)
        stack.push(b)
        let firstUndone = stack.undo()
        let secondUndone = stack.undo()
        // We compare clipId via the underlying command (b first because LIFO)
        if case let .addClip(cmd) = firstUndone {
            XCTAssertEqual(cmd.clipId, "b")
        } else {
            XCTFail("Expected first undo to return last pushed (b)")
        }
        if case let .addClip(cmd) = secondUndone {
            XCTAssertEqual(cmd.clipId, "a")
        } else {
            XCTFail("Expected second undo to return first pushed (a)")
        }
    }
```

- [ ] **Step 21.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `undo()` does not exist.

- [ ] **Step 21.3: Add `undo`**

Append to `CommandStack.swift`:

```swift
extension CommandStack {

    /// Move the cursor one step back and return the command that was undone.
    /// Returns `nil` if there is nothing to undo (cursor at 0).
    /// The command is **not** removed from the stack — it remains available for redo.
    /// Calls `didChange` after the mutation completes.
    @discardableResult
    public func undo() -> AnyEditCommand? {
        guard canUndo else { return nil }
        cursor -= 1
        let cmd = commands[cursor]
        didChange?(self)
        return cmd
    }
}
```

- [ ] **Step 21.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (10 tests).

- [ ] **Step 21.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack.undo returns commands in LIFO order"
```

---

### Task 22: `CommandStack.redo` — restores

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 22.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack.redo

    func test_redo_withoutPriorUndo_returnsNil() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        XCTAssertNil(stack.redo())
    }

    func test_redo_afterUndo_restoresAndReturnsCommand() {
        let stack = CommandStack(coalesceWindow: 0)
        let cmd = makeAddCmd(clipId: "z")
        stack.push(cmd)
        _ = stack.undo()
        let redone = stack.redo()
        XCTAssertNotNil(redone)
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }
```

- [ ] **Step 22.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `redo()` does not exist.

- [ ] **Step 22.3: Add `redo`**

Append to `CommandStack.swift`:

```swift
extension CommandStack {

    /// Move the cursor one step forward (re-applying the previously undone command)
    /// and return that command. Returns `nil` if there is nothing to redo.
    /// Calls `didChange` after the mutation completes.
    @discardableResult
    public func redo() -> AnyEditCommand? {
        guard canRedo else { return nil }
        let cmd = commands[cursor]
        cursor += 1
        didChange?(self)
        return cmd
    }
}
```

- [ ] **Step 22.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (12 tests).

- [ ] **Step 22.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack.redo re-applies undone command"
```

---

### Task 23: `CommandStack.push` — branch truncation after undo

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 23.1: Write the failing test**

Append:

```swift
    // MARK: - CommandStack — branch truncation

    func test_push_afterUndo_truncatesRedoBranch() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        XCTAssertEqual(stack.count, 3)

        _ = stack.undo() // undo c
        _ = stack.undo() // undo b
        XCTAssertTrue(stack.canRedo)
        XCTAssertEqual(stack.count, 3) // still 3 retained, just cursor is at 1

        stack.push(makeAddCmd(clipId: "d")) // new branch — should drop b and c
        XCTAssertEqual(stack.count, 2) // a + d
        XCTAssertFalse(stack.canRedo)
    }

    func test_push_afterUndo_undoReturnsTheNewCommandFirst() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        _ = stack.undo() // undo b
        stack.push(makeAddCmd(clipId: "c"))
        let firstUndo = stack.undo()
        if case let .addClip(cmd) = firstUndo {
            XCTAssertEqual(cmd.clipId, "c")
        } else {
            XCTFail("Expected first undo after branch to return c")
        }
    }
```

- [ ] **Step 23.2: Run test to verify it passes (Task 20 already truncates)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (14 tests).

- [ ] **Step 23.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "test(timeline-logic): CommandStack truncates redo branch on push after undo"
```

---

### Task 24: `CommandStack.push` — coalescing same-type same-clip within window

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

Coalescing rule (spec section 4.2): if the new command and the previous one are
of the same type, target the same clip, AND are spaced by less than
`coalesceWindow`, the new command **replaces** the previous one in place. The
stack count does not grow. This is the mechanism that turns "100 frames of
drag" into a single `MoveClipCommand` with the original `oldStartTime` and the
final `newStartTime`.

When merging a `MoveClipCommand`, we preserve `oldStartTime` from the previous
command (so undo still goes to the original position) and take `newStartTime`
from the new command. For other coalesceable commands (currently
`SetClipPropertyCommand`), we do the same `(old=previous.old, new=current.new)`
merge.

- [ ] **Step 24.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack — coalescing

    func test_push_coalesce_twoMovesOnSameClipWithinWindow_collapsedToOne() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        let m1 = makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1.0, timestamp: now)
        let m2 = makeMoveCmd(clipId: "c1", oldStart: 1.0, newStart: 2.0,
                             timestamp: now.addingTimeInterval(0.1))
        stack.push(m1)
        stack.push(m2)
        XCTAssertEqual(stack.count, 1)
    }

    func test_push_coalesce_preservesOriginalOldStartTime() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        let m1 = makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1.0, timestamp: now)
        let m2 = makeMoveCmd(clipId: "c1", oldStart: 1.0, newStart: 5.0,
                             timestamp: now.addingTimeInterval(0.2))
        stack.push(m1)
        stack.push(m2)
        let undone = stack.undo()
        if case let .moveClip(cmd) = undone {
            XCTAssertEqual(cmd.oldStartTime, 0, accuracy: 0.0001)
            XCTAssertEqual(cmd.newStartTime, 5.0, accuracy: 0.0001)
        } else {
            XCTFail("Expected coalesced moveClip command")
        }
    }

    func test_push_coalesce_didChangeFiresOncePerPush() {
        let stack = CommandStack(coalesceWindow: 0.5)
        var changeCount = 0
        stack.didChange = { _ in changeCount += 1 }
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 1, newStart: 2,
                               timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(changeCount, 2) // didChange always fires, even when coalesced
    }

    func test_push_coalesce_repeatedDragFrames_singleCommandRetained() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        for i in 0..<100 {
            stack.push(makeMoveCmd(clipId: "c1",
                                   oldStart: Float(i),
                                   newStart: Float(i + 1),
                                   timestamp: now.addingTimeInterval(Double(i) * 0.001)))
        }
        XCTAssertEqual(stack.count, 1)
    }
```

- [ ] **Step 24.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — coalescing not yet implemented (count is 100 instead of 1).

- [ ] **Step 24.3: Add coalescing logic**

Replace the existing `push(_:)` extension in `CommandStack.swift` with:

```swift
extension CommandStack {

    public var count: Int { commands.count }

    /// Push a command on top of the stack with optional coalescing.
    public func push(_ command: AnyEditCommand) {
        // Truncate redo branch first.
        if cursor < commands.count {
            commands.removeSubrange(cursor..<commands.count)
        }

        // Try to coalesce with the previous command if any.
        if let last = commands.last,
           let merged = Self.coalesce(previous: last, with: command,
                                      windowSeconds: coalesceWindow) {
            commands[commands.count - 1] = merged
        } else {
            commands.append(command)
        }
        cursor = commands.count
        didChange?(self)
    }

    /// Returns a merged command if `previous` and `next` are coalesceable,
    /// otherwise `nil`. Two commands coalesce iff:
    ///   - they target the same clipId,
    ///   - they are of the same EditCommand type,
    ///   - they are within `windowSeconds` of each other,
    ///   - they belong to the (small) set of commands declared coalesceable
    ///     (currently MoveClip and SetClipProperty).
    static func coalesce(previous: AnyEditCommand,
                         with next: AnyEditCommand,
                         windowSeconds: TimeInterval) -> AnyEditCommand? {
        switch (previous, next) {
        case let (.moveClip(p), .moveClip(n))
            where p.clipId == n.clipId
              && p.kind == n.kind
              && abs(n.timestamp.timeIntervalSince(p.timestamp)) <= windowSeconds:
            let merged = MoveClipCommand(
                id: n.id,
                timestamp: n.timestamp,
                clipId: n.clipId,
                kind: n.kind,
                oldStartTime: p.oldStartTime,
                newStartTime: n.newStartTime
            )
            return .moveClip(merged)
        default:
            return nil
        }
    }
}
```

Note: `SetClipPropertyCommand` coalescing is added in Task 25.

- [ ] **Step 24.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (18 tests). The 100-frame-drag test should retain a single command with `oldStartTime: 0, newStartTime: 100`.

- [ ] **Step 24.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack coalesces same-clip MoveClip within window"
```

---

### Task 25: `CommandStack.push` — coalescing rejects different clip / different type / outside window

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 25.1: Write the failing test**

Append:

```swift
    // MARK: - CommandStack — coalescing rejection rules

    func test_push_coalesce_rejectsDifferentClipId() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c2", oldStart: 0, newStart: 1,
                               timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(stack.count, 2)
    }

    func test_push_coalesce_rejectsDifferentCommandType() {
        let stack = CommandStack(coalesceWindow: 0.5)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeAddCmd(clipId: "c1", timestamp: now.addingTimeInterval(0.1)))
        XCTAssertEqual(stack.count, 2)
    }

    func test_push_coalesce_rejectsOutsideTimeWindow() {
        let stack = CommandStack(coalesceWindow: 0.1)
        let now = Date()
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 0, newStart: 1, timestamp: now))
        stack.push(makeMoveCmd(clipId: "c1", oldStart: 1, newStart: 2,
                               timestamp: now.addingTimeInterval(0.5))) // beyond window
        XCTAssertEqual(stack.count, 2)
    }
```

- [ ] **Step 25.2: Run test to verify it passes (Task 24 implementation enforces these constraints)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (21 tests).

- [ ] **Step 25.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "test(timeline-logic): CommandStack rejects coalescing across clip/type/window boundaries"
```

---

### Task 26: `CommandStack` — FIFO cap (maxSize)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 26.1: Write the failing test**

Append to `CommandStackTests`:

```swift
    // MARK: - CommandStack — FIFO cap

    func test_push_overMaxSize_dropsOldestFIFO() {
        let stack = CommandStack(maxSize: 3, coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        stack.push(makeAddCmd(clipId: "d")) // should evict 'a'
        XCTAssertEqual(stack.count, 3)
        // Undo three times, expect d, c, b in order
        var ids: [String] = []
        for _ in 0..<3 {
            if case let .addClip(cmd) = stack.undo() {
                ids.append(cmd.clipId)
            }
        }
        XCTAssertEqual(ids, ["d", "c", "b"])
    }

    func test_push_overMaxSize_cursorStaysAtTop() {
        let stack = CommandStack(maxSize: 2, coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        stack.push(makeAddCmd(clipId: "c"))
        XCTAssertEqual(stack.count, 2)
        XCTAssertTrue(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }
```

- [ ] **Step 26.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — count is 4 instead of 3.

- [ ] **Step 26.3: Update `push` to enforce FIFO cap**

Replace the existing `push(_:)` body in `CommandStack.swift` with:

```swift
    public func push(_ command: AnyEditCommand) {
        // Truncate redo branch first.
        if cursor < commands.count {
            commands.removeSubrange(cursor..<commands.count)
        }

        // Try to coalesce with the previous command if any.
        if let last = commands.last,
           let merged = Self.coalesce(previous: last, with: command,
                                      windowSeconds: coalesceWindow) {
            commands[commands.count - 1] = merged
        } else {
            commands.append(command)
            // Enforce FIFO cap (only when we actually grew the stack).
            while commands.count > maxSize {
                commands.removeFirst()
            }
        }
        cursor = commands.count
        didChange?(self)
    }
```

- [ ] **Step 26.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (23 tests).

- [ ] **Step 26.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack enforces FIFO cap (maxSize)"
```

---

### Task 27: `CommandStack.snapshot` / `restore` round-trip

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 27.1: Write the failing test**

Append:

```swift
    // MARK: - CommandStack — snapshot / restore

    func test_snapshot_capturesCommandsAndCursor() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd(clipId: "a"))
        stack.push(makeAddCmd(clipId: "b"))
        _ = stack.undo()
        let snap = stack.snapshot()
        XCTAssertEqual(snap.commands.count, 2)
        XCTAssertEqual(snap.cursor, 1)
    }

    func test_restore_rebuildsStackState() {
        let original = CommandStack(coalesceWindow: 0)
        original.push(makeAddCmd(clipId: "a"))
        original.push(makeAddCmd(clipId: "b"))
        original.push(makeAddCmd(clipId: "c"))
        _ = original.undo()
        let snap = original.snapshot()

        let restored = CommandStack(coalesceWindow: 0)
        restored.restore(snap)
        XCTAssertEqual(restored.count, 3)
        XCTAssertTrue(restored.canUndo)
        XCTAssertTrue(restored.canRedo)
        // Calling redo on restored should give us back command 'c'
        if case let .addClip(cmd) = restored.redo() {
            XCTAssertEqual(cmd.clipId, "c")
        } else {
            XCTFail("Expected restored stack to expose c on redo")
        }
    }

    func test_restore_clampsCursorToCommandCount() {
        let stack = CommandStack()
        let bogus = CommandStackSnapshot(commands: [], cursor: 99)
        stack.restore(bogus)
        XCTAssertEqual(stack.count, 0)
        XCTAssertFalse(stack.canUndo)
        XCTAssertFalse(stack.canRedo)
    }
```

- [ ] **Step 27.2: Run test to verify it fails**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: FAIL — `snapshot()` and `restore(_:)` do not exist.

- [ ] **Step 27.3: Add snapshot / restore**

Append to `CommandStack.swift`:

```swift
extension CommandStack {

    /// Capture the current state for persistence. Safe to call on the main actor.
    public func snapshot() -> CommandStackSnapshot {
        return CommandStackSnapshot(commands: commands, cursor: cursor)
    }

    /// Replace the current state with a previously captured snapshot.
    /// Cursor is clamped to `[0, commands.count]` to tolerate corrupted snapshots.
    /// Calls `didChange` after the restore completes.
    public func restore(_ snapshot: CommandStackSnapshot) {
        self.commands = snapshot.commands
        self.cursor = max(0, min(snapshot.cursor, snapshot.commands.count))
        didChange?(self)
    }
}
```

- [ ] **Step 27.4: Run test to verify it passes**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (26 tests).

- [ ] **Step 27.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "feat(timeline-logic): CommandStack.snapshot/restore round-trip with cursor clamp"
```

---

### Task 28: `CommandStack.didChange` callback fires on push/undo/redo/restore

**Files:**
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift`

- [ ] **Step 28.1: Write the failing test**

Append:

```swift
    // MARK: - CommandStack — didChange callback

    func test_didChange_firesOnPush() {
        let stack = CommandStack(coalesceWindow: 0)
        var count = 0
        stack.didChange = { _ in count += 1 }
        stack.push(makeAddCmd())
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnUndo() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.undo()
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnRedo() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        _ = stack.undo()
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.redo()
        XCTAssertEqual(count, 1)
    }

    func test_didChange_firesOnRestore() {
        let stack = CommandStack()
        var count = 0
        stack.didChange = { _ in count += 1 }
        stack.restore(CommandStackSnapshot(commands: [], cursor: 0))
        XCTAssertEqual(count, 1)
    }

    func test_didChange_doesNotFireWhenUndoIsNoop() {
        let stack = CommandStack()
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.undo() // empty stack — no-op
        XCTAssertEqual(count, 0)
    }

    func test_didChange_doesNotFireWhenRedoIsNoop() {
        let stack = CommandStack(coalesceWindow: 0)
        stack.push(makeAddCmd())
        var count = 0
        stack.didChange = { _ in count += 1 }
        _ = stack.redo() // nothing to redo
        XCTAssertEqual(count, 0)
    }
```

- [ ] **Step 28.2: Run test to verify it passes**

The `undo()`, `redo()` implementations from Tasks 21/22 already early-return without firing `didChange` when there is nothing to (un|re)do. Verify:

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/CommandStackTests`
Expected: PASS (32 tests). If `test_didChange_doesNotFireWhenUndoIsNoop` fails, audit Tasks 21 and 22 — `didChange` must NOT fire on early-return.

- [ ] **Step 28.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/CommandStackTests.swift
git commit -m "test(timeline-logic): CommandStack.didChange fires on mutation, skips on no-op"
```

---

### Task 29: `EditCommand` apply/revert idempotence integration sweep

Plan 1 already implements `apply` / `revert` for the 12 commands and tests each one in isolation against `TimelineProject` (see Plan 1 Tasks 12-22). This task adds an **integration sweep** that exercises the full `apply -> revert -> apply` cycle for every command shape via `AnyEditCommand`, ensuring no command leaves residual state and the round-trip preserves the project.

This sweep lives in the MeeshyUI test target (it depends on AnyEditCommand only, which is in MeeshySDK) and serves two purposes:
1. Detect regressions in Plan 1 commands when CommandStack starts driving them.
2. Document the "apply -> revert -> apply" contract that CommandStack relies on for undo/redo.

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/EditCommandIdempotenceTests.swift`

- [ ] **Step 29.1: Write the test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/EditCommandIdempotenceTests.swift`:

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Integration sweep: verifies that for every concrete EditCommand,
/// the cycle `apply -> revert -> apply` returns the project to the same
/// state as `apply` alone (i.e., revert is a true inverse of apply).
///
/// This is what CommandStack.undo() relies on: undoing then redoing must
/// yield the same project state.
final class EditCommandIdempotenceTests: XCTestCase {

    // MARK: - Factories

    private func makeBaseProject(slideId: String = "s1",
                                 slideDuration: Float = 10) -> TimelineProject {
        var p = TimelineProject(
            slideId: slideId,
            slideDuration: slideDuration,
            mediaObjects: [],
            audioPlayerObjects: [],
            textObjects: [],
            clipTransitions: []
        )
        p.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm1",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 5),
            StoryMediaObject(id: "v2", postMediaId: "pm2",
                             mediaType: "video", placement: "media",
                             startTime: 5, duration: 5)
        ]
        p.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pma",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [],
                                   startTime: 0, duration: 5)
        ]
        p.textObjects = [
            StoryTextObject(id: "t1", content: "hi",
                            startTime: 1, displayDuration: 3)
        ]
        return p
    }

    /// Encodes a project to JSON for stable equality check via byte comparison.
    private func canonicalJSON(_ project: TimelineProject) throws -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(project)
    }

    /// Asserts apply -> revert -> apply produces the same final state as apply alone.
    private func assertRoundTrip(_ command: AnyEditCommand,
                                 base: TimelineProject,
                                 file: StaticString = #filePath,
                                 line: UInt = #line) throws {
        var directApply = base
        try command.apply(to: &directApply)
        let directJSON = try canonicalJSON(directApply)

        var roundTrip = base
        try command.apply(to: &roundTrip)
        try command.revert(from: &roundTrip)
        try command.apply(to: &roundTrip)
        let roundTripJSON = try canonicalJSON(roundTrip)

        XCTAssertEqual(directJSON, roundTripJSON,
                       "apply -> revert -> apply must equal apply",
                       file: file, line: line)

        // Also verify revert is a true inverse: apply + revert returns to base.
        var pingPong = base
        try command.apply(to: &pingPong)
        try command.revert(from: &pingPong)
        let pingPongJSON = try canonicalJSON(pingPong)
        let baseJSON = try canonicalJSON(base)
        XCTAssertEqual(pingPongJSON, baseJSON,
                       "revert must be the inverse of apply",
                       file: file, line: line)
    }

    // MARK: - 12 commands

    func test_addClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .addClip(AddClipCommand(
            clipId: "v3", postMediaId: "pm3", kind: .video,
            startTime: 7, duration: 2
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_deleteClipCommand_applyRevertRoundTrip() throws {
        let base = makeBaseProject()
        let cmd: AnyEditCommand = .deleteClip(DeleteClipCommand(
            clipId: "v1", kind: .video,
            snapshot: base.mediaObjects[0]
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_moveClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .moveClip(MoveClipCommand(
            clipId: "v1", kind: .video,
            oldStartTime: 0, newStartTime: 3
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_trimClipCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .trimClip(TrimClipCommand(
            clipId: "v1", kind: .video,
            oldStartTime: 0, newStartTime: 1,
            oldDuration: 5, newDuration: 4
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_splitClipCommand_applyRevertRoundTrip() throws {
        let base = makeBaseProject()
        let cmd: AnyEditCommand = .splitClip(SplitClipCommand(
            clipId: "v1", kind: .video,
            splitAtTime: 2.5,
            originalSnapshot: base.mediaObjects[0],
            newClipId: "v1b"
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_addTransitionCommand_applyRevertRoundTrip() throws {
        let transition = StoryClipTransition(
            id: "tr1", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        let cmd: AnyEditCommand = .addTransition(AddTransitionCommand(transition: transition))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_removeTransitionCommand_applyRevertRoundTrip() throws {
        let transition = StoryClipTransition(
            id: "tr1", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        var base = makeBaseProject()
        base.clipTransitions = [transition]
        let cmd: AnyEditCommand = .removeTransition(RemoveTransitionCommand(
            transitionId: "tr1",
            snapshot: transition
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_changeTransitionCommand_applyRevertRoundTrip() throws {
        let oldT = StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                                       kind: .crossfade, duration: 0.5)
        let newT = StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                                       kind: .dissolve, duration: 1.0)
        var base = makeBaseProject()
        base.clipTransitions = [oldT]
        let cmd: AnyEditCommand = .changeTransition(ChangeTransitionCommand(
            transitionId: "tr1",
            oldValue: oldT,
            newValue: newT
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_addKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        let cmd: AnyEditCommand = .addKeyframe(AddKeyframeCommand(
            targetClipId: "v1",
            targetKind: .video,
            keyframe: kf
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }

    func test_moveKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        var base = makeBaseProject()
        base.mediaObjects[0].keyframes = [kf]
        let cmd: AnyEditCommand = .moveKeyframe(MoveKeyframeCommand(
            targetClipId: "v1",
            targetKind: .video,
            keyframeId: "kf1",
            oldTime: 1.0,
            newTime: 2.0
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_deleteKeyframeCommand_applyRevertRoundTrip() throws {
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        var base = makeBaseProject()
        base.mediaObjects[0].keyframes = [kf]
        let cmd: AnyEditCommand = .deleteKeyframe(DeleteKeyframeCommand(
            targetClipId: "v1",
            targetKind: .video,
            snapshot: kf
        ))
        try assertRoundTrip(cmd, base: base)
    }

    func test_setClipPropertyCommand_applyRevertRoundTrip() throws {
        let cmd: AnyEditCommand = .setClipProperty(SetClipPropertyCommand(
            clipId: "a1",
            kind: .audio,
            property: .volume(old: 1.0, new: 0.5)
        ))
        try assertRoundTrip(cmd, base: makeBaseProject())
    }
}
```

**IMPORTANT:** Field names in command initialisers (`snapshot`, `oldValue`, `targetKind`, `targetClipId`, etc.) must match exactly what Plan 1 ships. If any differ, audit Plan 1 source files (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`) and update the test BEFORE running. The plan above uses the names from Plan 1 spec; Plan 1 author may have refined them — adapt verbatim.

- [ ] **Step 29.2: Run test to verify it passes (or surfaces Plan 1 bugs)**

Run: `cd packages/MeeshySDK && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/EditCommandIdempotenceTests`
Expected: PASS (12 tests).

If FAIL on a specific command:
1. Inspect the failing command's `apply` and `revert` in `StoryModels.swift`.
2. The bug is in Plan 1, not this plan. Open a bugfix PR against Plan 1 with the failing test as repro.
3. Do NOT add a workaround in this test file.

- [ ] **Step 29.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/EditCommandIdempotenceTests.swift
git commit -m "test(timeline-logic): integration sweep — apply/revert round-trip for 12 EditCommands"
```

---

### Task 30: Final coverage + cleanup + module READ-ME header

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`
- Delete: `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/.gitkeep` (no longer needed)
- Delete: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/.gitkeep`

- [ ] **Step 30.1: Run full test suite**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyUITests/SnapEngineTests -only-testing:MeeshyUITests/CommandStackTests -only-testing:MeeshyUITests/KeyframeInterpolatorTests -only-testing:MeeshyUITests/EditCommandIdempotenceTests -only-testing:MeeshyUITests/LogicModuleSmokeTests`
Expected: PASS — 24 + 32 + 20 + 12 + 1 = **89 tests** total for Plan 2.

- [ ] **Step 30.2: Verify file size budget**

Run:
```bash
wc -l packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/*.swift
```
Expected: each file < 400 lines (architecture rule, spec section 1).

If any file is over 400 lines, split it (e.g. extract `Lerpable` extensions into their own file).

- [ ] **Step 30.3: Add documentation header to each public file**

Edit `SnapEngine.swift` — replace the existing `import Foundation` line with:

```swift
//
// SnapEngine.swift
// MeeshyUI / Story / Timeline / Logic
//
// Pure-Swift snap engine: takes a raw user time + a list of candidate
// snap points and returns the snapped time + matched candidate.
//
// Used by TimelineViewModel during clip drag, keyframe drag, playhead
// drag, and duration-handle drag. Tolerance is computed by the UI as
// `6pt / pixelsPerSecond` so snap feel adapts to zoom level.
//
// Spec: docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md §4.1
//
// No UIKit / SwiftUI imports — testable as pure logic.
//

import Foundation
```

Edit `KeyframeInterpolator.swift` — prepend before `import Foundation`:

```swift
//
// KeyframeInterpolator.swift
// MeeshyUI / Story / Timeline / Logic
//
// Generic keyframe interpolation with `Lerpable` protocol.
// Supports Float, CGFloat, CGPoint, CGSize values with StoryEasing
// applied per origin keyframe.
//
// Spec: docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md §4.3
//
// No UIKit / SwiftUI imports — pure value computations.
//
```

Edit `CommandStack.swift` — prepend before `import Foundation`:

```swift
//
// CommandStack.swift
// MeeshyUI / Story / Timeline / Logic
//
// Linear undo/redo stack with FIFO cap (default 50) and time-based
// coalescing (default 0.5s). Snapshot/restore enables persistence to
// `{draft}.commands.json` so undo history survives composer close/reopen.
//
// Spec: docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md §4.2
//
// No UIKit / SwiftUI imports — testable as pure logic.
//
```

- [ ] **Step 30.4: Remove placeholder `.gitkeep` files**

Run:
```bash
rm packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/.gitkeep
rm packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic/.gitkeep
```

- [ ] **Step 30.5: Run full SDK test suite to ensure no regressions**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"`
Expected: ALL tests PASS (the 89 new ones + the entire pre-existing suite). If any pre-existing test fails, do not proceed — investigate the regression introduced by the new module.

- [ ] **Step 30.6: Verify the iOS app still builds**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED. No symbol clash with existing `TimelinePlaybackEngine` (the new types live in a sub-folder, no naming collision).

- [ ] **Step 30.7: Final commit**

```bash
git add -A packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Logic
git commit -m "$(cat <<'EOF'
chore(timeline-logic): add documentation headers + cleanup placeholders

Plan 2 (Logic Core) is now complete:
- SnapEngine: 24 tests covering priority, tolerance, disabled, edges
- KeyframeInterpolator: 20 tests covering 0/1/N kfs, easings, clamps
- CommandStack: 32 tests covering push/undo/redo/coalesce/cap/snapshot/restore
- EditCommand idempotence sweep: 12 commands x apply/revert round-trip
- 1 smoke test verifying Plan 1 SDK types are reachable

89 tests total. Module isolated in Logic/, zero UIKit/SwiftUI imports,
all types Sendable. Ready for Plan 3 (Engine Playback) consumption.
EOF
)"
```

---

## Self-review checklist (run before declaring Plan 2 complete)

- [ ] All 31 tasks merged on `dev`
- [ ] `xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"` (full SDK suite) green
- [ ] `./apps/ios/meeshy.sh build` green
- [ ] Each file in `Logic/` is < 400 lines (`wc -l`)
- [ ] No `import UIKit` and no `import SwiftUI` in `Logic/` (`grep -r 'import UIKit\|import SwiftUI' packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic`) — should return zero hits
- [ ] No singleton access in `Logic/` (`grep -r '\.shared' packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic`) — should return zero hits
- [ ] All `public` types in `Logic/` are `Sendable`
- [ ] `CommandStackSnapshot` is `Codable` and round-trips via JSON in tests
- [ ] `assertRoundTrip` helper proves `revert` is a true inverse of `apply` for all 12 commands
- [ ] `didChange` callback fires on push/undo/redo/restore but NOT on no-op undo/redo
- [ ] Coalescing demo (100-frame drag = 1 command) is in the test suite

## Hand-off to Plan 3 (Engine Playback)

Plan 3 consumers depend on the following stable public surface from this plan:

```swift
// SnapEngine
public struct SnapCandidate: Equatable, Sendable { /* ... */ }
public struct SnapResult: Equatable, Sendable { /* ... */ }
public struct SnapEngine: Sendable {
    public init(toleranceSeconds: Float)
    public func snap(rawTime: Float, candidates: [SnapCandidate], disabled: Bool = false) -> SnapResult
}

// KeyframeInterpolator
public protocol Lerpable: Sendable { static func lerp(from: Self, to: Self, t: Float) -> Self }
extension Float: Lerpable {}
extension CGFloat: Lerpable {}
extension CGPoint: Lerpable {}
extension CGSize: Lerpable {}
public enum KeyframeInterpolator {
    public static func interpolate<T: Lerpable>(
        keyframes: [(time: Float, value: T, easing: StoryEasing)],
        at time: Float
    ) -> T?
}

// CommandStack
public struct CommandStackSnapshot: Codable, Sendable, Equatable { /* ... */ }
public final class CommandStack: @unchecked Sendable {
    public init(maxSize: Int = 50, coalesceWindow: TimeInterval = 0.5)
    public var canUndo: Bool { get }
    public var canRedo: Bool { get }
    public var count: Int { get }
    public var didChange: ((CommandStack) -> Void)?
    public func push(_ command: AnyEditCommand)
    @discardableResult public func undo() -> AnyEditCommand?
    @discardableResult public func redo() -> AnyEditCommand?
    public func snapshot() -> CommandStackSnapshot
    public func restore(_ snapshot: CommandStackSnapshot)
}
```

Any breaking change to these signatures requires bumping Plan 3 acceptance criteria.

