# Timeline Editor — Plan 1 : SDK Models (Phase 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au SDK Swift Meeshy les nouveaux types Codable nécessaires à la refonte de l'éditeur timeline (`StoryClipTransition`, `StoryKeyframe`, `TimelineProject`, `EditCommand`/`AnyEditCommand` + 12 commandes), sans aucun changement UI ni breaking change wire.

**Architecture:** Tous les ajouts sont des extensions optionnelles aux modèles existants (`StoryEffects`, `StoryMediaObject`, `StoryTextObject`) ou de nouveaux types Codable Sendable indépendants. Compatibilité JSON 100% : `decodeIfPresent` partout, JSON V1 décode sans erreur en V2.

**Tech Stack:** Swift 6 strict mode, iOS 17+, Foundation, XCTest, Swift Package Manager (SPM).

**Référence spec:** `docs/superpowers/specs/2026-05-05-story-timeline-editor-design.md` sections 2 et 9.2 (phase 0).

---

## Convention de testing (xcodebuild, pas swift test)

**Pourquoi xcodebuild et non `swift test`** : le module `MeeshySDK` importe `UIKit` via `Cache/CacheCoordinator.swift`. La commande `swift test` standalone échoue avec `no such module 'UIKit'` car SPM compile pour la plateforme hôte (macOS). Toutes les commandes de test ci-dessous utilisent `xcodebuild` avec un destination iOS Simulator.

**Pattern complet** :
```bash
xcodebuild test \
  -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK \
  -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/StoryModelsExtensionsTests
```

**Filtrage par méthode** : `xcodebuild` n'accepte pas de wildcard. Pour filtrer une méthode spécifique : `-only-testing:MeeshySDKTests/StoryModelsExtensionsTests/test_storyEasing_linear_returnsInputUnchanged` (nom complet exact). Pour exécuter toute la classe (recommandé pour les RED→GREEN steps), omettre le suffixe `/test_xxx`.

**Simulator UDID** : `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (iPhone 16 Pro). Si indisponible, lancer `xcrun simctl list devices iPhone 16 Pro`.

**Gain de temps** : booter le simulator avant de démarrer la session — `xcrun simctl boot 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 || true` (idempotent, ignore si déjà booté).

---

## Notes d'implémentation

- **Ne pas confondre "extension"** au sens du spec et au sens Swift : Swift n'autorise pas les stored properties dans une `extension`. Les nouveaux champs `clipTransitions`, `keyframes` sont donc ajoutés directement à la définition de `StoryEffects`, `StoryMediaObject`, `StoryTextObject` (struct definitions dans `StoryModels.swift`), avec mise à jour du `init`, du `CodingKeys` et de la décode/encode logic existante. C'est conceptuellement une extension (champ optionnel ajouté), techniquement un ajout de stored property.
- **`StoryEffects` n'a pas d'`init(from:)` explicite** ni de `CodingKeys` — son `Codable` est synthétisé. Ajouter un nouveau champ `Optional` y est rétro-compat sans toucher au CodingKeys (synthèse automatique).
- **`StoryTextObject` et `StoryMediaObject` ont des `CodingKeys` explicites** — il faut donc y ajouter le case `keyframes` et le décoder via `decodeIfPresent` (mais comme ils utilisent la synthèse Codable et non un `init(from:)` custom, on a juste besoin d'ajouter `keyframes` au `CodingKeys` enum et la propriété au struct ; Swift gérera le `decodeIfPresent` automatiquement pour un `Optional`).
- **`StorySlide` a un `init(from:)` custom** mais ne contient pas directement les nouveaux champs (ils sont dans `effects`), donc pas de modification nécessaire.
- **Tous les nouveaux types** sont `public`, `Sendable`, `Codable`. Les protocoles `EditCommand` et `Sendable` se composent : `protocol EditCommand: Codable, Sendable`.
- **`AnyEditCommand` est `Codable` via une stratégie discriminée** : un champ `type: String` + un champ `payload`. Pas de `Codable` synthétisé sur enum à cas associés (Swift ne le supporte pas avec valeurs concrètes hétérogènes), donc on écrit `init(from:)` et `encode(to:)` à la main. La doc Apple fournit ce pattern.
- **`TimelineProject` est dans `StoryModels.swift`** (Phase 0) puis sera bougé vers `Sources/MeeshySDK/Story/Timeline/Model/TimelineProject.swift` en Phase 1+ si besoin. Pour Phase 0, regroupé dans le même fichier pour simplicité de revue.
- **Effort estimé** : 1-2 jours dev senior, 24 tasks atomiques.

---

## Pre-flight

- [ ] **Step 0.1: Verify SDK builds and tests pass before starting**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" 2>&1 | tail -30`
Expected: "Test Suite 'All tests' passed" (or skipped-but-no-failure baseline). Si rouge, stop et résoudre avant de continuer.

- [ ] **Step 0.2: Create the test file scaffold**

**Files:**
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

```swift
import XCTest
@testable import MeeshySDK

final class StoryModelsExtensionsTests: XCTestCase {
    // Tests added in subsequent steps.
}
```

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests`
Expected: PASS (suite vide, 0 test).

- [ ] **Step 0.3: Commit scaffold**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "test(sdk): scaffold StoryModelsExtensionsTests for timeline phase 0"
```

---

### Task 1: `StoryEasing` enum + `apply(_:)` method

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (append at end of file, before legacy "MARK: - Story Item" if grouping by topic — but appending at file end is fine)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 1.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryEasing

    func test_storyEasing_linear_returnsInputUnchanged() {
        XCTAssertEqual(StoryEasing.linear.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.25), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.75), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeIn_isQuadratic() {
        XCTAssertEqual(StoryEasing.easeIn.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(0.5), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeOut_invertsEaseIn() {
        XCTAssertEqual(StoryEasing.easeOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(0.5), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeInOut_isSCurve() {
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_allEasings_areMonotonicOnUnitInterval() {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            var previous: Float = -.infinity
            for step in stride(from: Float(0), through: Float(1), by: 0.05) {
                let current = easing.apply(step)
                XCTAssertGreaterThanOrEqual(current, previous,
                    "\(easing) is not monotonic at t=\(step)")
                previous = current
            }
        }
    }

    func test_storyEasing_codableRoundTrip_allCases() throws {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            let data = try JSONEncoder().encode(easing)
            let decoded = try JSONDecoder().decode(StoryEasing.self, from: data)
            XCTAssertEqual(decoded, easing)
        }
    }
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -20`
Expected: FAIL with `cannot find 'StoryEasing' in scope` (compilation error).

- [ ] **Step 1.3: Write minimal implementation**

Append at the end of `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`:

```swift
// MARK: - Story Easing (Timeline V2)

/// Easing curve applied between two interpolated values (transitions, keyframes).
/// All curves map [0, 1] -> [0, 1] monotonically with `apply(0) == 0` and `apply(1) == 1`.
public enum StoryEasing: String, Codable, CaseIterable, Sendable {
    case linear
    case easeIn
    case easeOut
    case easeInOut

    public func apply(_ t: Float) -> Float {
        switch self {
        case .linear:
            return t
        case .easeIn:
            return t * t
        case .easeOut:
            return 1 - (1 - t) * (1 - t)
        case .easeInOut:
            return t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
        }
    }
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 6 tests executed.

- [ ] **Step 1.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryEasing enum with apply for timeline interpolation"
```

---

### Task 2: `StoryTransitionKind` enum

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 2.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryTransitionKind

    func test_storyTransitionKind_rawValues_matchSpec() {
        XCTAssertEqual(StoryTransitionKind.crossfade.rawValue, "crossfade")
        XCTAssertEqual(StoryTransitionKind.dissolve.rawValue, "dissolve")
    }

    func test_storyTransitionKind_codableRoundTrip_allCases() throws {
        for kind in StoryTransitionKind.allCases {
            let data = try JSONEncoder().encode(kind)
            let decoded = try JSONDecoder().decode(StoryTransitionKind.self, from: data)
            XCTAssertEqual(decoded, kind)
        }
    }
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'StoryTransitionKind' in scope`.

- [ ] **Step 2.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `StoryEasing` enum:

```swift
// MARK: - Story Transition Kind (Timeline V2)

/// Kind of inter-clip transition rendered by the timeline compositor.
/// Launch-supported: `crossfade` (opacity ramp) and `dissolve` (CIDissolveTransition mask).
/// Future: `push`, `wipe`, `swipeLeft`, `swipeRight`, `zoomIn`, `zoomOut`.
public enum StoryTransitionKind: String, Codable, CaseIterable, Sendable {
    case crossfade
    case dissolve
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 2 tests executed.

- [ ] **Step 2.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryTransitionKind enum (crossfade, dissolve)"
```

---

### Task 3: `StoryClipTransition` struct

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 3.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryClipTransition

    func test_storyClipTransition_init_assignsProperties() {
        let t = StoryClipTransition(
            id: "tr-1",
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: .crossfade,
            duration: 0.5,
            easing: .easeInOut
        )
        XCTAssertEqual(t.id, "tr-1")
        XCTAssertEqual(t.fromClipId, "clip-a")
        XCTAssertEqual(t.toClipId, "clip-b")
        XCTAssertEqual(t.kind, .crossfade)
        XCTAssertEqual(t.duration, 0.5)
        XCTAssertEqual(t.easing, .easeInOut)
    }

    func test_storyClipTransition_init_defaultsEasingToNil_andGeneratesUUID() {
        let t = StoryClipTransition(
            fromClipId: "a",
            toClipId: "b",
            kind: .dissolve,
            duration: 1.0
        )
        XCTAssertFalse(t.id.isEmpty)
        XCTAssertNil(t.easing)
    }

    func test_storyClipTransition_codableRoundTrip_full() throws {
        let original = StoryClipTransition(
            id: "tr-42",
            fromClipId: "intro.mp4",
            toClipId: "photo1",
            kind: .dissolve,
            duration: 0.8,
            easing: .easeOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.fromClipId, original.fromClipId)
        XCTAssertEqual(decoded.toClipId, original.toClipId)
        XCTAssertEqual(decoded.kind, original.kind)
        XCTAssertEqual(decoded.duration, original.duration, accuracy: 0.0001)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyClipTransition_codableRoundTrip_omittingEasing() throws {
        let original = StoryClipTransition(
            fromClipId: "a", toClipId: "b",
            kind: .crossfade, duration: 0.4
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryClipTransition.self, from: data)
        XCTAssertNil(decoded.easing)
        XCTAssertEqual(decoded.kind, .crossfade)
    }
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'StoryClipTransition' in scope`.

- [ ] **Step 3.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `StoryTransitionKind` enum:

```swift
// MARK: - Story Clip Transition (Timeline V2)

/// Transition between two adjacent clips of the same slide (intra-slide).
/// Distinct from `StoryTransitionEffect` which is the inter-slide opening/closing animation.
public struct StoryClipTransition: Codable, Identifiable, Sendable {
    public let id: String
    public let fromClipId: String
    public let toClipId: String
    public let kind: StoryTransitionKind
    public let duration: Float
    public let easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                fromClipId: String,
                toClipId: String,
                kind: StoryTransitionKind,
                duration: Float,
                easing: StoryEasing? = nil) {
        self.id = id
        self.fromClipId = fromClipId
        self.toClipId = toClipId
        self.kind = kind
        self.duration = duration
        self.easing = easing
    }
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 3.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryClipTransition struct with codable round-trip"
```

---

### Task 4: `StoryKeyframe` struct

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 4.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryKeyframe

    func test_storyKeyframe_init_assignsAllProperties() {
        let kf = StoryKeyframe(
            id: "kf-1",
            time: 1.5,
            x: 0.3,
            y: 0.7,
            scale: 1.25,
            opacity: 0.9,
            easing: .easeIn
        )
        XCTAssertEqual(kf.id, "kf-1")
        XCTAssertEqual(kf.time, 1.5)
        XCTAssertEqual(kf.x, 0.3)
        XCTAssertEqual(kf.y, 0.7)
        XCTAssertEqual(kf.scale, 1.25)
        XCTAssertEqual(kf.opacity, 0.9)
        XCTAssertEqual(kf.easing, .easeIn)
    }

    func test_storyKeyframe_init_defaultsAllPropertiesToNil() {
        let kf = StoryKeyframe(time: 2.0)
        XCTAssertFalse(kf.id.isEmpty)
        XCTAssertEqual(kf.time, 2.0)
        XCTAssertNil(kf.x)
        XCTAssertNil(kf.y)
        XCTAssertNil(kf.scale)
        XCTAssertNil(kf.opacity)
        XCTAssertNil(kf.easing)
    }

    func test_storyKeyframe_codableRoundTrip_full() throws {
        let original = StoryKeyframe(
            id: "kf-99",
            time: 3.25,
            x: 0.5, y: 0.5,
            scale: 1.0, opacity: 1.0,
            easing: .easeInOut
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.time, original.time, accuracy: 0.0001)
        XCTAssertEqual(decoded.x, original.x)
        XCTAssertEqual(decoded.y, original.y)
        XCTAssertEqual(decoded.scale, original.scale)
        XCTAssertEqual(decoded.opacity, original.opacity)
        XCTAssertEqual(decoded.easing, original.easing)
    }

    func test_storyKeyframe_codableRoundTrip_partial_onlyTimeAndX() throws {
        let original = StoryKeyframe(time: 0.5, x: 0.42)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: data)
        XCTAssertEqual(decoded.x, 0.42)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }

    func test_storyKeyframe_decodeJSON_withoutOptionalFields() throws {
        let json = #"{"id":"kf-bare","time":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryKeyframe.self, from: json)
        XCTAssertEqual(decoded.id, "kf-bare")
        XCTAssertEqual(decoded.time, 1.0)
        XCTAssertNil(decoded.x)
        XCTAssertNil(decoded.y)
        XCTAssertNil(decoded.scale)
        XCTAssertNil(decoded.opacity)
        XCTAssertNil(decoded.easing)
    }
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'StoryKeyframe' in scope`.

- [ ] **Step 4.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `StoryClipTransition` struct:

```swift
// MARK: - Story Keyframe (Timeline V2)

/// Single keyframe for animating an object's position / scale / opacity over time.
/// `time` is the offset (seconds) relative to the owning object's `startTime`.
/// All transform fields are optional — only non-nil fields are interpolated.
///
/// Note de déviation par rapport au spec §2.1 : `time` est `var` (mutable) et non
/// `let`, car `MoveKeyframeCommand` (Task 19) doit pouvoir muter ce champ pour
/// l'undo/redo. `id` reste `let`. Aucune propagation visible côté consumer car
/// `StoryKeyframe` reste un value type (les copies sont indépendantes).
public struct StoryKeyframe: Codable, Identifiable, Sendable {
    public let id: String
    public var time: Float
    public var x: CGFloat?
    public var y: CGFloat?
    public var scale: CGFloat?
    public var opacity: CGFloat?
    public var easing: StoryEasing?

    public init(id: String = UUID().uuidString,
                time: Float,
                x: CGFloat? = nil,
                y: CGFloat? = nil,
                scale: CGFloat? = nil,
                opacity: CGFloat? = nil,
                easing: StoryEasing? = nil) {
        self.id = id
        self.time = time
        self.x = x
        self.y = y
        self.scale = scale
        self.opacity = opacity
        self.easing = easing
    }
}
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 5 tests executed.

- [ ] **Step 4.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryKeyframe struct with optional position/scale/opacity"
```

---

### Task 5: Add `clipTransitions` field to `StoryEffects`

`StoryEffects` uses synthesized Codable (no explicit `init(from:)` nor `CodingKeys`). Adding an optional stored property keeps backward JSON compat automatically.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (lines ~493-578, struct + init)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 5.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryEffects.clipTransitions extension

    func test_storyEffects_clipTransitions_defaultsToNil() {
        let effects = StoryEffects()
        XCTAssertNil(effects.clipTransitions)
    }

    func test_storyEffects_clipTransitions_canBeAssignedAndPersisted() throws {
        var effects = StoryEffects()
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "a", toClipId: "b",
                                kind: .crossfade, duration: 0.5)
        ]
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(decoded.clipTransitions?.count, 1)
        XCTAssertEqual(decoded.clipTransitions?.first?.kind, .crossfade)
    }

    func test_storyEffects_decodeOldJSON_withoutClipTransitions_succeeds() throws {
        let json = #"{"background":"FFFFFF","mediaObjects":[]}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: json)
        XCTAssertNil(decoded.clipTransitions)
        XCTAssertEqual(decoded.background, "FFFFFF")
    }
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `value of type 'StoryEffects' has no member 'clipTransitions'`.

- [ ] **Step 5.3: Write minimal implementation**

Edit `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` — locate the `StoryEffects` struct property block (after `public var slideDuration: Float?` around line 534) and add:

```swift
    // Timeline V2 — transitions between adjacent clips of this slide
    public var clipTransitions: [StoryClipTransition]?
```

Then locate the `init(...)` of `StoryEffects` (around line 544) and:

1. Add the parameter at the END of the init signature (last parameter, with default `nil`):

```swift
                slideDuration: Float? = nil,
                clipTransitions: [StoryClipTransition]? = nil) {
```

2. Add the assignment at the END of the init body (before the closing brace):

```swift
        self.slideDuration = slideDuration
        self.clipTransitions = clipTransitions
    }
```

(The `self.slideDuration` line already exists — only add the `self.clipTransitions = clipTransitions` line.)

- [ ] **Step 5.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 3 tests executed.

- [ ] **Step 5.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryEffects.clipTransitions optional field"
```

---

### Task 6: Add `keyframes` field to `StoryMediaObject`

`StoryMediaObject` has explicit `CodingKeys` — must add the new key. Codable synthesis still handles `decodeIfPresent` for `Optional` automatically since there is no custom `init(from:)`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (lines ~232-304)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 6.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryMediaObject.keyframes extension

    func test_storyMediaObject_keyframes_defaultsToNil() {
        let media = StoryMediaObject()
        XCTAssertNil(media.keyframes)
    }

    func test_storyMediaObject_keyframes_canBeAssignedAndPersisted() throws {
        var media = StoryMediaObject(postMediaId: "pm-1", mediaType: "video")
        media.keyframes = [
            StoryKeyframe(time: 0.0, x: 0.0, y: 0.0, scale: 1.0, opacity: 0.0),
            StoryKeyframe(time: 1.0, x: 0.5, y: 0.5, scale: 1.5, opacity: 1.0,
                          easing: .easeOut)
        ]
        let data = try JSONEncoder().encode(media)
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: data)
        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?[1].easing, .easeOut)
    }

    func test_storyMediaObject_decodeOldJSON_withoutKeyframes_succeeds() throws {
        let json = #"{"id":"m1","postMediaId":"pm","mediaType":"image","placement":"media","x":0.5,"y":0.5,"scale":1.0,"rotation":0,"volume":1.0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)
        XCTAssertNil(decoded.keyframes)
        XCTAssertEqual(decoded.id, "m1")
    }
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `value of type 'StoryMediaObject' has no member 'keyframes'`.

- [ ] **Step 6.3: Write minimal implementation**

Edit `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`:

1. In `StoryMediaObject` (around line 232-260), after `public var sourceLanguage: String?`, add:

```swift
    // Timeline V2 — animation keyframes (position/scale/opacity)
    public var keyframes: [StoryKeyframe]?
```

2. Update `CodingKeys` (around line 257) to include `keyframes`:

```swift
    enum CodingKeys: String, CodingKey {
        case id, postMediaId, mediaType, placement, x, y, scale, rotation, volume
        case isBackground, zIndex
        case startTime, duration, loop, fadeIn, fadeOut, sourceLanguage
        case keyframes
    }
```

3. Update the FIRST `init(...)` (the raw-string one around line 263) — add at the end of signature and body:

Signature change (replace the closing of the parameter list):

```swift
                sourceLanguage: String? = nil,
                keyframes: [StoryKeyframe]? = nil) {
```

Body change (add at the end before the closing brace):

```swift
        self.sourceLanguage = sourceLanguage
        self.keyframes = keyframes
    }
```

4. Update the SECOND convenience `init(...)` (the typed `StoryMediaKind` one around line 283) — add the parameter and forward it:

Signature change:

```swift
                sourceLanguage: String? = nil,
                keyframes: [StoryKeyframe]? = nil) {
```

Body change — locate the `self.init(...)` call and add `keyframes: keyframes` as the last argument:

```swift
        self.init(id: id, postMediaId: postMediaId,
                  mediaType: kind.rawValue, placement: placement,
                  x: x, y: y, scale: scale, rotation: rotation,
                  volume: volume, isBackground: isBackground,
                  startTime: startTime, duration: duration,
                  loop: loop, fadeIn: fadeIn, fadeOut: fadeOut,
                  sourceLanguage: sourceLanguage,
                  keyframes: keyframes)
    }
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 3 tests executed.

- [ ] **Step 6.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryMediaObject.keyframes optional field"
```

---

### Task 7: Add `keyframes` field to `StoryTextObject`

Same pattern as Task 6.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (lines ~142-218)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 7.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - StoryTextObject.keyframes extension

    func test_storyTextObject_keyframes_defaultsToNil() {
        let text = StoryTextObject(content: "hello")
        XCTAssertNil(text.keyframes)
    }

    func test_storyTextObject_keyframes_canBeAssignedAndPersisted() throws {
        var text = StoryTextObject(content: "hi")
        text.keyframes = [
            StoryKeyframe(time: 0.5, opacity: 0.0),
            StoryKeyframe(time: 1.5, opacity: 1.0, easing: .easeIn)
        ]
        let data = try JSONEncoder().encode(text)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        XCTAssertEqual(decoded.keyframes?.count, 2)
        XCTAssertEqual(decoded.keyframes?[0].opacity, 0.0)
        XCTAssertEqual(decoded.keyframes?[1].easing, .easeIn)
    }

    func test_storyTextObject_decodeOldJSON_withoutKeyframes_succeeds() throws {
        let json = #"{"id":"t1","content":"hello","x":0.5,"y":0.5,"scale":1.0,"rotation":0}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: json)
        XCTAssertNil(decoded.keyframes)
        XCTAssertEqual(decoded.content, "hello")
    }
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `value of type 'StoryTextObject' has no member 'keyframes'`.

- [ ] **Step 7.3: Write minimal implementation**

Edit `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`:

1. In `StoryTextObject` (around lines 142-180), after `public var isLocked: Bool?` (around line 173), add:

```swift
    // Timeline V2 — animation keyframes (position/scale/opacity)
    public var keyframes: [StoryKeyframe]?
```

2. Update `CodingKeys` (around line 175) to include `keyframes`:

```swift
    enum CodingKeys: String, CodingKey {
        case id, content, x, y, scale, rotation, translations, sourceLanguage, zIndex
        case textStyle, textColor, textSize, textAlign, textBg
        case startTime, displayDuration, fadeIn, fadeOut
        case isLocked
        case keyframes
    }
```

3. Update `init(...)` (around line 182) — add the parameter and assignment at the end:

Signature change (replace the closing of the parameter list):

```swift
                isLocked: Bool? = nil,
                keyframes: [StoryKeyframe]? = nil) {
```

Body change (add at the end before the closing brace):

```swift
        self.isLocked = isLocked
        self.keyframes = keyframes
    }
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 3 tests executed.

- [ ] **Step 7.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add StoryTextObject.keyframes optional field"
```

---

### Task 8: Round-trip test on full slide (Codable retro-compat)

Validate that a JSON-encoded V1 slide (no clipTransitions, no keyframes) decodes cleanly into the V2 struct.

**Files:**
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 8.1: Write the test (no implementation needed)**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - Retro-compat: V1 slide JSON decodes into V2

    func test_storySlide_decodeV1JSON_withoutTimelineV2Fields_succeeds() throws {
        let json = #"""
        {
          "id": "s1",
          "mediaURL": "https://x.test/img.jpg",
          "content": "Hi",
          "effects": {
            "background": "FFFFFF",
            "mediaObjects": [
              {"id":"m1","postMediaId":"pm","mediaType":"image","placement":"media","x":0.5,"y":0.5,"scale":1.0,"rotation":0,"volume":1.0}
            ],
            "textObjects": [
              {"id":"t1","content":"hello","x":0.5,"y":0.5,"scale":1.0,"rotation":0}
            ]
          },
          "duration": 5,
          "order": 0
        }
        """#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StorySlide.self, from: json)
        XCTAssertEqual(decoded.id, "s1")
        XCTAssertNil(decoded.effects.clipTransitions)
        XCTAssertNil(decoded.effects.mediaObjects?.first?.keyframes)
        XCTAssertNil(decoded.effects.textObjects?.first?.keyframes)
    }

    func test_storySlide_encodeV2_thenDecode_preservesTimelineFields() throws {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "m1", postMediaId: "pm",
                             mediaType: "image", placement: "media")
        ]
        effects.mediaObjects?[0].keyframes = [
            StoryKeyframe(time: 0.0, x: 0.0, y: 0.0),
            StoryKeyframe(time: 2.0, x: 1.0, y: 1.0)
        ]
        effects.clipTransitions = [
            StoryClipTransition(fromClipId: "m1", toClipId: "m2",
                                kind: .dissolve, duration: 0.4,
                                easing: .easeInOut)
        ]
        let slide = StorySlide(id: "s2", effects: effects, duration: 10, order: 0)
        let data = try JSONEncoder().encode(slide)
        let decoded = try JSONDecoder().decode(StorySlide.self, from: data)
        XCTAssertEqual(decoded.effects.clipTransitions?.first?.kind, .dissolve)
        XCTAssertEqual(decoded.effects.mediaObjects?.first?.keyframes?.count, 2)
    }
```

- [ ] **Step 8.2: Run test to verify it passes (no impl change)**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 2 tests executed.

- [ ] **Step 8.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "test(sdk): retro-compat StorySlide decode V1 + encode V2 round-trip"
```

---

### Task 9: `TimelineProject` snapshot struct

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 9.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - TimelineProject

    private func makeSlideForProject() -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(id: "m1", postMediaId: "pm-1",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 3.0)
        ]
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm-2",
                                   placement: "overlay",
                                   volume: 0.8, waveformSamples: [0.1, 0.2])
        ]
        effects.textObjects = [
            StoryTextObject(id: "t1", content: "Hello",
                            startTime: 0, displayDuration: 2.0)
        ]
        effects.clipTransitions = [
            StoryClipTransition(id: "tr1",
                                fromClipId: "m1", toClipId: "m2",
                                kind: .crossfade, duration: 0.4)
        ]
        return StorySlide(id: "slide-1", effects: effects, duration: 8.0, order: 0)
    }

    func test_timelineProject_initFromSlide_capturesAllArrays() {
        let slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        XCTAssertEqual(project.slideId, "slide-1")
        XCTAssertEqual(project.slideDuration, 8.0)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.audioPlayerObjects.count, 1)
        XCTAssertEqual(project.textObjects.count, 1)
        XCTAssertEqual(project.clipTransitions.count, 1)
    }

    func test_timelineProject_initFromSlide_handlesNilArraysAsEmpty() {
        let slide = StorySlide(id: "empty", effects: StoryEffects(),
                               duration: 5, order: 0)
        let project = TimelineProject(from: slide)
        XCTAssertTrue(project.mediaObjects.isEmpty)
        XCTAssertTrue(project.audioPlayerObjects.isEmpty)
        XCTAssertTrue(project.textObjects.isEmpty)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_timelineProject_apply_writesArraysBackToSlide() {
        let original = makeSlideForProject()
        let project = TimelineProject(from: original)
        var blank = StorySlide(id: "slide-1", effects: StoryEffects(),
                               duration: 0, order: 0)
        project.apply(to: &blank)
        XCTAssertEqual(blank.duration, 8.0)
        XCTAssertEqual(blank.effects.mediaObjects?.count, 1)
        XCTAssertEqual(blank.effects.audioPlayerObjects?.count, 1)
        XCTAssertEqual(blank.effects.textObjects?.count, 1)
        XCTAssertEqual(blank.effects.clipTransitions?.count, 1)
    }

    func test_timelineProject_roundTrip_initThenApply_isIdempotent() throws {
        var slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        project.apply(to: &slide)
        // Re-encoding both should produce identical JSON
        let json1 = try JSONEncoder().encode(slide.effects.mediaObjects)
        let json2 = try JSONEncoder().encode(project.mediaObjects)
        XCTAssertEqual(json1, json2)
        XCTAssertEqual(slide.effects.clipTransitions?.count, 1)
    }

    func test_timelineProject_codableRoundTrip() throws {
        let slide = makeSlideForProject()
        let project = TimelineProject(from: slide)
        let data = try JSONEncoder().encode(project)
        let decoded = try JSONDecoder().decode(TimelineProject.self, from: data)
        XCTAssertEqual(decoded.slideId, project.slideId)
        XCTAssertEqual(decoded.slideDuration, project.slideDuration, accuracy: 0.0001)
        XCTAssertEqual(decoded.mediaObjects.count, project.mediaObjects.count)
        XCTAssertEqual(decoded.clipTransitions.first?.kind, .crossfade)
    }
```

- [ ] **Step 9.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'TimelineProject' in scope`.

- [ ] **Step 9.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `StoryKeyframe` struct:

```swift
// MARK: - Timeline Project (Snapshot for Command Pattern)

/// Snapshot Codable d'un slide pour le pattern Command (undo/redo).
/// Round-trip garanti : `TimelineProject(from: slide).apply(to: &slide)` est no-op.
public struct TimelineProject: Codable, Sendable {
    public var slideId: String
    public var slideDuration: Float
    public var mediaObjects: [StoryMediaObject]
    public var audioPlayerObjects: [StoryAudioPlayerObject]
    public var textObjects: [StoryTextObject]
    public var clipTransitions: [StoryClipTransition]

    public init(slideId: String,
                slideDuration: Float,
                mediaObjects: [StoryMediaObject] = [],
                audioPlayerObjects: [StoryAudioPlayerObject] = [],
                textObjects: [StoryTextObject] = [],
                clipTransitions: [StoryClipTransition] = []) {
        self.slideId = slideId
        self.slideDuration = slideDuration
        self.mediaObjects = mediaObjects
        self.audioPlayerObjects = audioPlayerObjects
        self.textObjects = textObjects
        self.clipTransitions = clipTransitions
    }

    public init(from slide: StorySlide) {
        self.slideId = slide.id
        self.slideDuration = Float(slide.duration)
        self.mediaObjects = slide.effects.mediaObjects ?? []
        self.audioPlayerObjects = slide.effects.audioPlayerObjects ?? []
        self.textObjects = slide.effects.textObjects ?? []
        self.clipTransitions = slide.effects.clipTransitions ?? []
    }

    public func apply(to slide: inout StorySlide) {
        slide.duration = TimeInterval(slideDuration)
        slide.effects.mediaObjects = mediaObjects
        slide.effects.audioPlayerObjects = audioPlayerObjects
        slide.effects.textObjects = textObjects
        slide.effects.clipTransitions = clipTransitions
    }
}
```

- [ ] **Step 9.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 5 tests executed.

- [ ] **Step 9.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add TimelineProject snapshot for command pattern"
```

---

### Task 10: `EditCommand` protocol

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 10.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - EditCommand protocol

    func test_editCommand_protocol_isCodableAndSendable() {
        // Compile-time check via type erasure into Sendable / Codable contexts.
        let cmd: any EditCommand = AddClipCommand(
            clipId: "c1", postMediaId: "pm", kind: .video,
            startTime: 0, duration: 1.0
        )
        XCTAssertFalse(cmd.id.isEmpty)
        XCTAssertNotNil(cmd.timestamp)
    }
```

Note: this test will fail compilation until `AddClipCommand` (Task 12) is also defined. We define both together: Task 10 adds the protocol skeleton + a `defaultId/timestamp` helper, Task 12 adds the first concrete command (which uses the protocol). To unblock compilation in Task 10 alone, add a minimal placeholder. But to keep TDD strict and avoid placeholders, we will defer this assertion to Task 12 and only verify protocol existence here:

Replace the test above with this lighter compile-only check:

```swift
    // MARK: - EditCommand protocol

    func test_editCommand_protocol_existsAndComposesCodableSendable() {
        // Compile-only: verifies protocol composition. A concrete conformer is
        // added in Task 12 (AddClipCommand) and will be exercised there.
        func acceptsAny<T: EditCommand>(_ value: T) -> String { value.id }
        // Defining a private one-off conforming type to close compilation.
        struct LocalNoop: EditCommand {
            let id: String = "noop"
            let timestamp: Date = Date()
            func apply(to project: inout TimelineProject) throws {}
            func revert(from project: inout TimelineProject) throws {}
        }
        XCTAssertEqual(acceptsAny(LocalNoop()), "noop")
    }
```

- [ ] **Step 10.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find type 'EditCommand' in scope`.

- [ ] **Step 10.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `TimelineProject` struct:

```swift
// MARK: - Edit Command (Pattern Command for Undo/Redo)

/// Atomic, reversible operation on a `TimelineProject`. Each conforming type
/// captures the minimum delta required to apply and to revert the operation.
public protocol EditCommand: Codable, Sendable {
    var id: String { get }
    var timestamp: Date { get }
    func apply(to project: inout TimelineProject) throws
    func revert(from project: inout TimelineProject) throws
}

/// Errors thrown when applying or reverting an `EditCommand` against a project
/// whose state no longer matches the assumptions captured at command creation.
public enum EditCommandError: Error, Sendable, Equatable {
    case clipNotFound(id: String)
    case transitionNotFound(id: String)
    case keyframeNotFound(id: String)
    case invalidState(reason: String)
}
```

- [ ] **Step 10.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 1 test executed.

- [ ] **Step 10.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add EditCommand protocol + EditCommandError for timeline undo"
```

---

### Task 11: `ClipKind` helper enum (used by Add/Set commands)

A thin enum to identify which collection on the project a command targets. Avoids stringly-typed APIs.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 11.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - TimelineClipKind

    func test_timelineClipKind_rawValues_matchSpec() {
        XCTAssertEqual(TimelineClipKind.video.rawValue, "video")
        XCTAssertEqual(TimelineClipKind.image.rawValue, "image")
        XCTAssertEqual(TimelineClipKind.audio.rawValue, "audio")
        XCTAssertEqual(TimelineClipKind.text.rawValue, "text")
    }

    func test_timelineClipKind_codableRoundTrip_allCases() throws {
        for kind in TimelineClipKind.allCases {
            let data = try JSONEncoder().encode(kind)
            let decoded = try JSONDecoder().decode(TimelineClipKind.self, from: data)
            XCTAssertEqual(decoded, kind)
        }
    }
```

- [ ] **Step 11.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'TimelineClipKind' in scope`.

- [ ] **Step 11.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `EditCommandError` enum:

```swift
// MARK: - Timeline Clip Kind (target collection identifier)

/// Identifies which collection of a `TimelineProject` a command targets.
/// `video` and `image` both live in `mediaObjects` but the kind is preserved
/// to drive UI / engine routing without re-deriving from `mediaType`.
public enum TimelineClipKind: String, Codable, CaseIterable, Sendable {
    case video
    case image
    case audio
    case text
}
```

- [ ] **Step 11.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 2 tests executed.

- [ ] **Step 11.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add TimelineClipKind enum for command routing"
```

---

### Task 12: `AddClipCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 12.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - AddClipCommand

    private func makeEmptyProject() -> TimelineProject {
        TimelineProject(slideId: "s1", slideDuration: 10.0)
    }

    func test_addClipCommand_apply_addsToCorrectCollection_video() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm-v1",
            kind: .video, startTime: 0.5, duration: 3.0
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.mediaObjects.first?.id, "v1")
        XCTAssertEqual(project.mediaObjects.first?.mediaType, "video")
        XCTAssertEqual(project.mediaObjects.first?.startTime, 0.5)
        XCTAssertEqual(project.mediaObjects.first?.duration, 3.0)
    }

    func test_addClipCommand_apply_addsToCorrectCollection_audio() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "a1", postMediaId: "pm-a1",
            kind: .audio, startTime: 1.0, duration: 5.0
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects.count, 1)
        XCTAssertEqual(project.audioPlayerObjects.first?.id, "a1")
    }

    func test_addClipCommand_apply_addsToCorrectCollection_text() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "t1", postMediaId: "",
            kind: .text, startTime: 0, duration: 2.0,
            content: "Hi"
        )
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects.count, 1)
        XCTAssertEqual(project.textObjects.first?.content, "Hi")
        XCTAssertEqual(project.textObjects.first?.displayDuration, 2.0)
    }

    func test_addClipCommand_revert_isInverseOfApply_idempotentRoundTrip() throws {
        var project = makeEmptyProject()
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm-v1",
            kind: .video, startTime: 0, duration: 2.0
        )
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_addClipCommand_codableRoundTrip() throws {
        let cmd = AddClipCommand(
            clipId: "v1", postMediaId: "pm",
            kind: .video, startTime: 0, duration: 1.0
        )
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddClipCommand.self, from: data)
        XCTAssertEqual(decoded.id, cmd.id)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.kind, .video)
    }
```

- [ ] **Step 12.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'AddClipCommand' in scope`.

- [ ] **Step 12.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `TimelineClipKind` enum:

```swift
// MARK: - Edit Commands (12 concrete cases)

public struct AddClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let postMediaId: String
    public let kind: TimelineClipKind
    public let startTime: Float
    public let duration: Float
    public let content: String?

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                postMediaId: String,
                kind: TimelineClipKind,
                startTime: Float,
                duration: Float,
                content: String? = nil) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.postMediaId = postMediaId
        self.kind = kind
        self.startTime = startTime
        self.duration = duration
        self.content = content
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            let mediaType = kind == .video ? "video" : "image"
            project.mediaObjects.append(
                StoryMediaObject(id: clipId, postMediaId: postMediaId,
                                 mediaType: mediaType, placement: "media",
                                 startTime: startTime, duration: duration)
            )
        case .audio:
            project.audioPlayerObjects.append(
                StoryAudioPlayerObject(id: clipId, postMediaId: postMediaId,
                                       placement: "overlay",
                                       waveformSamples: [],
                                       startTime: startTime, duration: duration)
            )
        case .text:
            project.textObjects.append(
                StoryTextObject(id: clipId, content: content ?? "",
                                startTime: startTime,
                                displayDuration: duration)
            )
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            project.textObjects.removeAll { $0.id == clipId }
        }
    }
}
```

- [ ] **Step 12.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 5 tests executed.

- [ ] **Step 12.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add AddClipCommand for timeline command pattern"
```

---

### Task 13: `DeleteClipCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 13.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - DeleteClipCommand

    func test_deleteClipCommand_apply_removesVideo() throws {
        var project = makeEmptyProject()
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media",
                                     startTime: 0, duration: 2)
        project.mediaObjects = [media]
        let cmd = DeleteClipCommand(clipId: "v1", kind: .video,
                                    snapshotMedia: media,
                                    snapshotAudio: nil,
                                    snapshotText: nil,
                                    insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_deleteClipCommand_revert_restoresClipAtOriginalIndex() throws {
        var project = makeEmptyProject()
        let m1 = StoryMediaObject(id: "v1", postMediaId: "pm1",
                                  mediaType: "video", placement: "media")
        let m2 = StoryMediaObject(id: "v2", postMediaId: "pm2",
                                  mediaType: "video", placement: "media")
        let m3 = StoryMediaObject(id: "v3", postMediaId: "pm3",
                                  mediaType: "video", placement: "media")
        project.mediaObjects = [m1, m2, m3]
        let cmd = DeleteClipCommand(clipId: "v2", kind: .video,
                                    snapshotMedia: m2, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 1)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.map(\.id), ["v1", "v3"])
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects.map(\.id), ["v1", "v2", "v3"])
    }

    func test_deleteClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = DeleteClipCommand(clipId: "ghost", kind: .video,
                                    snapshotMedia: nil, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 0)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_deleteClipCommand_codableRoundTrip() throws {
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media")
        let cmd = DeleteClipCommand(clipId: "v1", kind: .video,
                                    snapshotMedia: media, snapshotAudio: nil,
                                    snapshotText: nil, insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(DeleteClipCommand.self, from: data)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.snapshotMedia?.id, "v1")
    }
```

- [ ] **Step 13.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'DeleteClipCommand' in scope`.

- [ ] **Step 13.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `AddClipCommand`:

```swift
public struct DeleteClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let snapshotMedia: StoryMediaObject?
    public let snapshotAudio: StoryAudioPlayerObject?
    public let snapshotText: StoryTextObject?
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                snapshotMedia: StoryMediaObject?,
                snapshotAudio: StoryAudioPlayerObject?,
                snapshotText: StoryTextObject?,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.snapshotMedia = snapshotMedia
        self.snapshotAudio = snapshotAudio
        self.snapshotText = snapshotText
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard project.mediaObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects.removeAll { $0.id == clipId }
        case .audio:
            guard project.audioPlayerObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects.removeAll { $0.id == clipId }
        case .text:
            guard project.textObjects.contains(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects.removeAll { $0.id == clipId }
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let snap = snapshotMedia else {
                throw EditCommandError.invalidState(reason: "missing media snapshot")
            }
            let idx = min(insertionIndex, project.mediaObjects.count)
            project.mediaObjects.insert(snap, at: idx)
        case .audio:
            guard let snap = snapshotAudio else {
                throw EditCommandError.invalidState(reason: "missing audio snapshot")
            }
            let idx = min(insertionIndex, project.audioPlayerObjects.count)
            project.audioPlayerObjects.insert(snap, at: idx)
        case .text:
            guard let snap = snapshotText else {
                throw EditCommandError.invalidState(reason: "missing text snapshot")
            }
            let idx = min(insertionIndex, project.textObjects.count)
            project.textObjects.insert(snap, at: idx)
        }
    }
}
```

- [ ] **Step 13.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 13.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add DeleteClipCommand with snapshot-based revert"
```

---

### Task 14: `MoveClipCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 14.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - MoveClipCommand

    func test_moveClipCommand_apply_changesStartTimeOfMedia() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             startTime: 1.0, duration: 2.0)
        ]
        let cmd = MoveClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 1.0, newStartTime: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].startTime, 3.0)
    }

    func test_moveClipCommand_revert_restoresOldStartTime() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [],
                                   startTime: 0.5, duration: 1.0)
        ]
        let cmd = MoveClipCommand(clipId: "a1", kind: .audio,
                                  oldStartTime: 0.5, newStartTime: 2.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].startTime, 0.5)
    }

    func test_moveClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = MoveClipCommand(clipId: "ghost", kind: .text,
                                  oldStartTime: 0, newStartTime: 1)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_moveClipCommand_codableRoundTrip() throws {
        let cmd = MoveClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, newStartTime: 1)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(MoveClipCommand.self, from: data)
        XCTAssertEqual(decoded.clipId, "v1")
        XCTAssertEqual(decoded.newStartTime, 1)
    }
```

- [ ] **Step 14.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'MoveClipCommand' in scope`.

- [ ] **Step 14.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `DeleteClipCommand`:

```swift
public struct MoveClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let newStartTime: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                newStartTime: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.newStartTime = newStartTime
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime)
    }

    private func mutate(project: inout TimelineProject, startTime: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = startTime
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = startTime
        }
    }
}
```

- [ ] **Step 14.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 14.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add MoveClipCommand for time-shifting clips"
```

---

### Task 15: `TrimClipCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 15.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - TrimClipCommand

    func test_trimClipCommand_apply_changesStartAndDuration() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 5.0)
        ]
        let cmd = TrimClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, oldDuration: 5.0,
                                  newStartTime: 1.0, newDuration: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].startTime, 1.0)
        XCTAssertEqual(project.mediaObjects[0].duration, 3.0)
    }

    func test_trimClipCommand_apply_textUsesDisplayDuration() throws {
        var project = makeEmptyProject()
        project.textObjects = [
            StoryTextObject(id: "t1", content: "hi",
                            startTime: 0, displayDuration: 5.0)
        ]
        let cmd = TrimClipCommand(clipId: "t1", kind: .text,
                                  oldStartTime: 0, oldDuration: 5.0,
                                  newStartTime: 0.5, newDuration: 4.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects[0].startTime, 0.5)
        XCTAssertEqual(project.textObjects[0].displayDuration, 4.0)
    }

    func test_trimClipCommand_revert_restoresOldValues() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [],
                                   startTime: 0, duration: 4.0)
        ]
        let cmd = TrimClipCommand(clipId: "a1", kind: .audio,
                                  oldStartTime: 0, oldDuration: 4.0,
                                  newStartTime: 1.0, newDuration: 2.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].startTime, 0)
        XCTAssertEqual(project.audioPlayerObjects[0].duration, 4.0)
    }

    func test_trimClipCommand_codableRoundTrip() throws {
        let cmd = TrimClipCommand(clipId: "v1", kind: .video,
                                  oldStartTime: 0, oldDuration: 5,
                                  newStartTime: 1, newDuration: 3)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(TrimClipCommand.self, from: data)
        XCTAssertEqual(decoded.newDuration, 3)
    }
```

- [ ] **Step 15.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'TrimClipCommand' in scope`.

- [ ] **Step 15.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `MoveClipCommand`:

```swift
public struct TrimClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let oldStartTime: Float
    public let oldDuration: Float
    public let newStartTime: Float
    public let newDuration: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                oldStartTime: Float,
                oldDuration: Float,
                newStartTime: Float,
                newDuration: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.oldStartTime = oldStartTime
        self.oldDuration = oldDuration
        self.newStartTime = newStartTime
        self.newDuration = newDuration
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: newStartTime, duration: newDuration)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, startTime: oldStartTime, duration: oldDuration)
    }

    private func mutate(project: inout TimelineProject,
                        startTime: Float, duration: Float) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.mediaObjects[idx].startTime = startTime
            project.mediaObjects[idx].duration = duration
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.audioPlayerObjects[idx].startTime = startTime
            project.audioPlayerObjects[idx].duration = duration
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            project.textObjects[idx].startTime = startTime
            project.textObjects[idx].displayDuration = duration
        }
    }
}
```

- [ ] **Step 15.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 15.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add TrimClipCommand changing start + duration with revert"
```

---

### Task 16: `SplitClipCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 16.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - SplitClipCommand

    func test_splitClipCommand_apply_replacesOneVideoWithTwo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 5.0)
        ]
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 2.0,
                                   leftId: "v1L", rightId: "v1R")
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 2)
        XCTAssertEqual(project.mediaObjects[0].id, "v1L")
        XCTAssertEqual(project.mediaObjects[0].duration, 2.0)
        XCTAssertEqual(project.mediaObjects[1].id, "v1R")
        XCTAssertEqual(project.mediaObjects[1].startTime, 2.0)
        XCTAssertEqual(project.mediaObjects[1].duration, 3.0)
    }

    func test_splitClipCommand_revert_restoresOriginalSingleClip() throws {
        var project = makeEmptyProject()
        let original = StoryMediaObject(id: "v1", postMediaId: "pm",
                                        mediaType: "video", placement: "media",
                                        startTime: 0, duration: 5.0)
        project.mediaObjects = [original]
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 2.0,
                                   leftId: "v1L", rightId: "v1R")
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
        XCTAssertEqual(project.mediaObjects[0].id, "v1")
        XCTAssertEqual(project.mediaObjects[0].duration, 5.0)
    }

    func test_splitClipCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = SplitClipCommand(clipId: "ghost", kind: .video,
                                   splitAtRelativeTime: 1.0,
                                   leftId: "L", rightId: "R")
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_splitClipCommand_codableRoundTrip() throws {
        let cmd = SplitClipCommand(clipId: "v1", kind: .video,
                                   splitAtRelativeTime: 1.5,
                                   leftId: "L", rightId: "R")
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(SplitClipCommand.self, from: data)
        XCTAssertEqual(decoded.splitAtRelativeTime, 1.5)
    }
```

- [ ] **Step 16.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'SplitClipCommand' in scope`.

- [ ] **Step 16.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `TrimClipCommand`:

```swift
public struct SplitClipCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let splitAtRelativeTime: Float
    public let leftId: String
    public let rightId: String

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                splitAtRelativeTime: Float,
                leftId: String,
                rightId: String) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.splitAtRelativeTime = splitAtRelativeTime
        self.leftId = leftId
        self.rightId = rightId
    }

    public func apply(to project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.mediaObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            var left = original
            left.id = leftId
            left.duration = splitAtRelativeTime
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitAtRelativeTime
            right.duration = max(0, originalDuration - splitAtRelativeTime)
            project.mediaObjects.replaceSubrange(idx...idx, with: [left, right])
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.audioPlayerObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.duration ?? 0
            var left = original
            left.id = leftId
            left.duration = splitAtRelativeTime
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitAtRelativeTime
            right.duration = max(0, originalDuration - splitAtRelativeTime)
            project.audioPlayerObjects.replaceSubrange(idx...idx, with: [left, right])
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            let original = project.textObjects[idx]
            let originalStart = original.startTime ?? 0
            let originalDuration = original.displayDuration ?? 0
            var left = original
            left.id = leftId
            left.displayDuration = splitAtRelativeTime
            var right = original
            right.id = rightId
            right.startTime = originalStart + splitAtRelativeTime
            right.displayDuration = max(0, originalDuration - splitAtRelativeTime)
            project.textObjects.replaceSubrange(idx...idx, with: [left, right])
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        switch kind {
        case .video, .image:
            guard let leftIdx = project.mediaObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.mediaObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.mediaObjects[leftIdx]
            let right = project.mediaObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.mediaObjects.replaceSubrange(lower...upper, with: [restored])
        case .audio:
            guard let leftIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.audioPlayerObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.audioPlayerObjects[leftIdx]
            let right = project.audioPlayerObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.duration = (left.duration ?? 0) + (right.duration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.audioPlayerObjects.replaceSubrange(lower...upper, with: [restored])
        case .text:
            guard let leftIdx = project.textObjects.firstIndex(where: { $0.id == leftId }),
                  let rightIdx = project.textObjects.firstIndex(where: { $0.id == rightId }) else {
                throw EditCommandError.clipNotFound(id: leftId)
            }
            let left = project.textObjects[leftIdx]
            let right = project.textObjects[rightIdx]
            var restored = left
            restored.id = clipId
            restored.displayDuration = (left.displayDuration ?? 0) + (right.displayDuration ?? 0)
            let lower = min(leftIdx, rightIdx)
            let upper = max(leftIdx, rightIdx)
            project.textObjects.replaceSubrange(lower...upper, with: [restored])
        }
    }
}
```

- [ ] **Step 16.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 16.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add SplitClipCommand with reversible left/right split"
```

---

### Task 17: `AddTransitionCommand` and `RemoveTransitionCommand`

Both commands operate on the `clipTransitions` array. We add them in one task because they are mutually inverse and share factory test data.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 17.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - AddTransitionCommand & RemoveTransitionCommand

    private func makeTransitionFixture() -> StoryClipTransition {
        StoryClipTransition(id: "tr1", fromClipId: "v1", toClipId: "v2",
                            kind: .crossfade, duration: 0.5)
    }

    func test_addTransitionCommand_apply_appendsToArray() throws {
        var project = makeEmptyProject()
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        try cmd.apply(to: &project)
        XCTAssertEqual(project.clipTransitions.count, 1)
        XCTAssertEqual(project.clipTransitions.first?.id, "tr1")
    }

    func test_addTransitionCommand_revert_removesIt() throws {
        var project = makeEmptyProject()
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_addTransitionCommand_codableRoundTrip() throws {
        let cmd = AddTransitionCommand(transition: makeTransitionFixture())
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.transition.id, "tr1")
    }

    func test_removeTransitionCommand_apply_removesByIdAndStoresSnapshot() throws {
        var project = makeEmptyProject()
        let snap = makeTransitionFixture()
        project.clipTransitions = [snap]
        let cmd = RemoveTransitionCommand(transitionId: "tr1", snapshot: snap, insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.clipTransitions.isEmpty)
    }

    func test_removeTransitionCommand_revert_restoresAtIndex() throws {
        var project = makeEmptyProject()
        let snap = makeTransitionFixture()
        project.clipTransitions = [snap]
        let cmd = RemoveTransitionCommand(transitionId: "tr1", snapshot: snap, insertionIndex: 0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.clipTransitions.first?.id, "tr1")
    }

    func test_removeTransitionCommand_apply_throwsWhenMissing() {
        var project = makeEmptyProject()
        let cmd = RemoveTransitionCommand(transitionId: "ghost",
                                          snapshot: makeTransitionFixture(),
                                          insertionIndex: 0)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .transitionNotFound(id: "ghost"))
        }
    }

    func test_removeTransitionCommand_codableRoundTrip() throws {
        let cmd = RemoveTransitionCommand(transitionId: "tr1",
                                          snapshot: makeTransitionFixture(),
                                          insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(RemoveTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.transitionId, "tr1")
    }
```

- [ ] **Step 17.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'AddTransitionCommand' in scope`.

- [ ] **Step 17.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `SplitClipCommand`:

```swift
public struct AddTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transition: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transition: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transition = transition
    }

    public func apply(to project: inout TimelineProject) throws {
        project.clipTransitions.append(transition)
    }

    public func revert(from project: inout TimelineProject) throws {
        project.clipTransitions.removeAll { $0.id == transition.id }
    }
}

public struct RemoveTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let snapshot: StoryClipTransition
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                snapshot: StoryClipTransition,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        guard project.clipTransitions.contains(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions.removeAll { $0.id == transitionId }
    }

    public func revert(from project: inout TimelineProject) throws {
        let idx = min(insertionIndex, project.clipTransitions.count)
        project.clipTransitions.insert(snapshot, at: idx)
    }
}
```

- [ ] **Step 17.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10 && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 7 tests executed in total (3 + 4).

- [ ] **Step 17.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add AddTransitionCommand + RemoveTransitionCommand"
```

---

### Task 18: `ChangeTransitionCommand`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 18.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - ChangeTransitionCommand

    func test_changeTransitionCommand_apply_replacesTransitionAtSameIndex() throws {
        var project = makeEmptyProject()
        let original = StoryClipTransition(id: "tr1", fromClipId: "a",
                                           toClipId: "b", kind: .crossfade,
                                           duration: 0.5)
        project.clipTransitions = [original]
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.2,
                                          easing: .easeInOut)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: original,
                                          updated: updated)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.clipTransitions.first?.kind, .dissolve)
        XCTAssertEqual(project.clipTransitions.first?.duration, 1.2)
    }

    func test_changeTransitionCommand_revert_restoresPrevious() throws {
        var project = makeEmptyProject()
        let original = StoryClipTransition(id: "tr1", fromClipId: "a",
                                           toClipId: "b", kind: .crossfade,
                                           duration: 0.5)
        project.clipTransitions = [original]
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.0)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: original,
                                          updated: updated)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.clipTransitions.first?.kind, .crossfade)
    }

    func test_changeTransitionCommand_apply_throwsWhenMissing() {
        var project = makeEmptyProject()
        let prev = StoryClipTransition(id: "tr1", fromClipId: "a",
                                       toClipId: "b", kind: .crossfade,
                                       duration: 0.5)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: prev, updated: prev)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .transitionNotFound(id: "tr1"))
        }
    }

    func test_changeTransitionCommand_codableRoundTrip() throws {
        let prev = StoryClipTransition(id: "tr1", fromClipId: "a",
                                       toClipId: "b", kind: .crossfade,
                                       duration: 0.5)
        let updated = StoryClipTransition(id: "tr1", fromClipId: "a",
                                          toClipId: "b", kind: .dissolve,
                                          duration: 1.0)
        let cmd = ChangeTransitionCommand(transitionId: "tr1",
                                          previous: prev, updated: updated)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(ChangeTransitionCommand.self, from: data)
        XCTAssertEqual(decoded.updated.kind, .dissolve)
    }
```

- [ ] **Step 18.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'ChangeTransitionCommand' in scope`.

- [ ] **Step 18.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `RemoveTransitionCommand`:

```swift
public struct ChangeTransitionCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let transitionId: String
    public let previous: StoryClipTransition
    public let updated: StoryClipTransition

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                transitionId: String,
                previous: StoryClipTransition,
                updated: StoryClipTransition) {
        self.id = id
        self.timestamp = timestamp
        self.transitionId = transitionId
        self.previous = previous
        self.updated = updated
    }

    public func apply(to project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = updated
    }

    public func revert(from project: inout TimelineProject) throws {
        guard let idx = project.clipTransitions.firstIndex(where: { $0.id == transitionId }) else {
            throw EditCommandError.transitionNotFound(id: transitionId)
        }
        project.clipTransitions[idx] = previous
    }
}
```

- [ ] **Step 18.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 4 tests executed.

- [ ] **Step 18.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add ChangeTransitionCommand for editing transition properties"
```

---

### Task 19: `AddKeyframeCommand`, `MoveKeyframeCommand`, `DeleteKeyframeCommand`

Three keyframe commands grouped in one task — they share the same `(clipId, kind)` targeting + `keyframes` array on either `StoryMediaObject` or `StoryTextObject`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 19.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - Keyframe Commands (Add / Move / Delete)

    private func makeProjectWithMedia() -> TimelineProject {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 5)
        ]
        return project
    }

    func test_addKeyframeCommand_apply_appendsToObject() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, x: 0.5)
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video, keyframe: kf)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.count, 1)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.id, "kf1")
    }

    func test_addKeyframeCommand_revert_removesKeyframe() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0)
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video, keyframe: kf)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertTrue(project.mediaObjects[0].keyframes?.isEmpty ?? true)
    }

    func test_addKeyframeCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = AddKeyframeCommand(clipId: "ghost", kind: .video,
                                     keyframe: StoryKeyframe(time: 0))
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_moveKeyframeCommand_apply_changesKeyframeTime() throws {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = [StoryKeyframe(id: "kf1", time: 1.0)]
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 1.0, newTime: 3.0)
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.time, 3.0)
    }

    func test_moveKeyframeCommand_revert_restoresOldTime() throws {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = [StoryKeyframe(id: "kf1", time: 1.0)]
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 1.0, newTime: 3.0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.time, 1.0)
    }

    func test_moveKeyframeCommand_apply_throwsWhenKeyframeMissing() {
        var project = makeProjectWithMedia()
        project.mediaObjects[0].keyframes = []
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "ghost",
                                      oldTime: 0, newTime: 1)
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .keyframeNotFound(id: "ghost"))
        }
    }

    func test_deleteKeyframeCommand_apply_removesAndStoresSnapshot() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        project.mediaObjects[0].keyframes = [kf]
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: kf, insertionIndex: 0)
        try cmd.apply(to: &project)
        XCTAssertTrue(project.mediaObjects[0].keyframes?.isEmpty ?? true)
    }

    func test_deleteKeyframeCommand_revert_restoresAtIndex() throws {
        var project = makeProjectWithMedia()
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)
        project.mediaObjects[0].keyframes = [kf]
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: kf, insertionIndex: 0)
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.mediaObjects[0].keyframes?.first?.opacity, 0.5)
    }

    func test_addKeyframeCommand_codableRoundTrip() throws {
        let cmd = AddKeyframeCommand(clipId: "v1", kind: .video,
                                     keyframe: StoryKeyframe(id: "kf1", time: 1))
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(AddKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.keyframe.id, "kf1")
    }

    func test_moveKeyframeCommand_codableRoundTrip() throws {
        let cmd = MoveKeyframeCommand(clipId: "v1", kind: .video,
                                      keyframeId: "kf1",
                                      oldTime: 0, newTime: 1)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(MoveKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.newTime, 1)
    }

    func test_deleteKeyframeCommand_codableRoundTrip() throws {
        let cmd = DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                        keyframeId: "kf1",
                                        snapshot: StoryKeyframe(id: "kf1", time: 1),
                                        insertionIndex: 0)
        let data = try JSONEncoder().encode(cmd)
        let decoded = try JSONDecoder().decode(DeleteKeyframeCommand.self, from: data)
        XCTAssertEqual(decoded.keyframeId, "kf1")
    }
```

- [ ] **Step 19.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'AddKeyframeCommand' in scope`.

- [ ] **Step 19.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `ChangeTransitionCommand`:

```swift
// MARK: - Keyframe array helpers (private to this file)

private extension TimelineProject {
    mutating func mutateKeyframes(clipId: String,
                                  kind: TimelineClipKind,
                                  block: (inout [StoryKeyframe]) throws -> Void) throws {
        switch kind {
        case .video, .image:
            guard let idx = mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = mediaObjects[idx].keyframes ?? []
            try block(&arr)
            mediaObjects[idx].keyframes = arr
        case .text:
            guard let idx = textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            var arr = textObjects[idx].keyframes ?? []
            try block(&arr)
            textObjects[idx].keyframes = arr
        case .audio:
            throw EditCommandError.invalidState(reason: "audio clips do not support keyframes")
        }
    }
}

public struct AddKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframe: StoryKeyframe

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframe: StoryKeyframe) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframe = keyframe
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.append(keyframe)
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            arr.removeAll { $0.id == keyframe.id }
        }
    }
}

public struct MoveKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    public let oldTime: Float
    public let newTime: Float

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                oldTime: Float,
                newTime: Float) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.oldTime = oldTime
        self.newTime = newTime
    }

    public func apply(to project: inout TimelineProject) throws {
        try setTime(project: &project, time: newTime)
    }

    public func revert(from project: inout TimelineProject) throws {
        try setTime(project: &project, time: oldTime)
    }

    private func setTime(project: inout TimelineProject, time: Float) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard let idx = arr.firstIndex(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            arr[idx].time = time
        }
    }
}

public struct DeleteKeyframeCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let keyframeId: String
    public let snapshot: StoryKeyframe
    public let insertionIndex: Int

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                keyframeId: String,
                snapshot: StoryKeyframe,
                insertionIndex: Int) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.keyframeId = keyframeId
        self.snapshot = snapshot
        self.insertionIndex = insertionIndex
    }

    public func apply(to project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            guard arr.contains(where: { $0.id == keyframeId }) else {
                throw EditCommandError.keyframeNotFound(id: keyframeId)
            }
            arr.removeAll { $0.id == keyframeId }
        }
    }

    public func revert(from project: inout TimelineProject) throws {
        try project.mutateKeyframes(clipId: clipId, kind: kind) { arr in
            let idx = min(insertionIndex, arr.count)
            arr.insert(snapshot, at: idx)
        }
    }
}
```

- [ ] **Step 19.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10 && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10 && xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 11 tests executed in total (4 + 4 + 3).

- [ ] **Step 19.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add Add/Move/DeleteKeyframeCommand with reversible mutations"
```

---

### Task 20: `SetClipPropertyCommand`

Generic property setter — supports `volume`, `fadeIn`, `fadeOut`, `loop`, `isBackground` for media/audio and `isLocked` for text. Discriminated by `property: ClipProperty` enum carrying the `(oldValue, newValue)` payload.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 20.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - SetClipPropertyCommand

    func test_setClipPropertyCommand_apply_setsVolumeOnAudio() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .volume(old: 1.0, new: 0.4))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].volume, 0.4)
    }

    func test_setClipPropertyCommand_revert_restoresOldVolume() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .volume(old: 1.0, new: 0.4))
        try cmd.apply(to: &project)
        try cmd.revert(from: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].volume, 1.0)
    }

    func test_setClipPropertyCommand_apply_setsFadeInOnVideo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media")
        ]
        let cmd = SetClipPropertyCommand(clipId: "v1", kind: .video,
                                         property: .fadeIn(old: nil, new: 0.5))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].fadeIn, 0.5)
    }

    func test_setClipPropertyCommand_apply_setsLoopOnVideo() throws {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm",
                             mediaType: "video", placement: "media")
        ]
        let cmd = SetClipPropertyCommand(clipId: "v1", kind: .video,
                                         property: .loop(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.mediaObjects[0].loop, true)
    }

    func test_setClipPropertyCommand_apply_setsIsBackgroundOnAudio() throws {
        var project = makeEmptyProject()
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                   placement: "overlay",
                                   waveformSamples: [])
        ]
        let cmd = SetClipPropertyCommand(clipId: "a1", kind: .audio,
                                         property: .isBackground(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.audioPlayerObjects[0].isBackground, true)
    }

    func test_setClipPropertyCommand_apply_setsIsLockedOnText() throws {
        var project = makeEmptyProject()
        project.textObjects = [StoryTextObject(id: "t1", content: "x")]
        let cmd = SetClipPropertyCommand(clipId: "t1", kind: .text,
                                         property: .isLocked(old: nil, new: true))
        try cmd.apply(to: &project)
        XCTAssertEqual(project.textObjects[0].isLocked, true)
    }

    func test_setClipPropertyCommand_apply_throwsWhenClipMissing() {
        var project = makeEmptyProject()
        let cmd = SetClipPropertyCommand(clipId: "ghost", kind: .video,
                                         property: .volume(old: 1.0, new: 0.5))
        XCTAssertThrowsError(try cmd.apply(to: &project)) { error in
            XCTAssertEqual(error as? EditCommandError,
                           .clipNotFound(id: "ghost"))
        }
    }

    func test_setClipPropertyCommand_codableRoundTrip_eachVariant() throws {
        let variants: [SetClipPropertyCommand.ClipProperty] = [
            .volume(old: 1.0, new: 0.5),
            .fadeIn(old: nil, new: 0.3),
            .fadeOut(old: 0.2, new: nil),
            .loop(old: false, new: true),
            .isBackground(old: nil, new: true),
            .isLocked(old: nil, new: true),
        ]
        for property in variants {
            let cmd = SetClipPropertyCommand(clipId: "c", kind: .video, property: property)
            let data = try JSONEncoder().encode(cmd)
            let decoded = try JSONDecoder().decode(SetClipPropertyCommand.self, from: data)
            XCTAssertEqual(decoded.clipId, "c")
            XCTAssertEqual(decoded.property, property)
        }
    }
```

- [ ] **Step 20.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'SetClipPropertyCommand' in scope`.

- [ ] **Step 20.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `DeleteKeyframeCommand`:

```swift
public struct SetClipPropertyCommand: EditCommand {
    public enum ClipProperty: Codable, Sendable, Equatable {
        case volume(old: Float, new: Float)
        case fadeIn(old: Float?, new: Float?)
        case fadeOut(old: Float?, new: Float?)
        case loop(old: Bool?, new: Bool?)
        case isBackground(old: Bool?, new: Bool?)
        case isLocked(old: Bool?, new: Bool?)

        private enum CodingKeys: String, CodingKey {
            case type, oldFloat, newFloat, oldBool, newBool
        }

        private enum Tag: String, Codable {
            case volume, fadeIn, fadeOut, loop, isBackground, isLocked
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let tag = try c.decode(Tag.self, forKey: .type)
            switch tag {
            case .volume:
                let old = try c.decode(Float.self, forKey: .oldFloat)
                let new = try c.decode(Float.self, forKey: .newFloat)
                self = .volume(old: old, new: new)
            case .fadeIn:
                let old = try c.decodeIfPresent(Float.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Float.self, forKey: .newFloat)
                self = .fadeIn(old: old, new: new)
            case .fadeOut:
                let old = try c.decodeIfPresent(Float.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Float.self, forKey: .newFloat)
                self = .fadeOut(old: old, new: new)
            case .loop:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .loop(old: old, new: new)
            case .isBackground:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isBackground(old: old, new: new)
            case .isLocked:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isLocked(old: old, new: new)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .volume(let old, let new):
                try c.encode(Tag.volume, forKey: .type)
                try c.encode(old, forKey: .oldFloat)
                try c.encode(new, forKey: .newFloat)
            case .fadeIn(let old, let new):
                try c.encode(Tag.fadeIn, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .fadeOut(let old, let new):
                try c.encode(Tag.fadeOut, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .loop(let old, let new):
                try c.encode(Tag.loop, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isBackground(let old, let new):
                try c.encode(Tag.isBackground, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isLocked(let old, let new):
                try c.encode(Tag.isLocked, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            }
        }
    }

    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let property: ClipProperty

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                property: ClipProperty) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.property = property
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: true)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: false)
    }

    private func mutate(project: inout TimelineProject, useNew: Bool) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.mediaObjects[idx], useNew: useNew)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.audioPlayerObjects[idx], useNew: useNew)
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.textObjects[idx], useNew: useNew)
        }
    }

    private func apply(property: ClipProperty,
                       to media: inout StoryMediaObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            media.volume = useNew ? new : old
        case .fadeIn(let old, let new):
            media.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            media.fadeOut = useNew ? new : old
        case .loop(let old, let new):
            media.loop = useNew ? new : old
        case .isBackground(let old, let new):
            media.isBackground = useNew ? new : old
        case .isLocked:
            break
        }
    }

    private func apply(property: ClipProperty,
                       to audio: inout StoryAudioPlayerObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            audio.volume = useNew ? new : old
        case .fadeIn(let old, let new):
            audio.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            audio.fadeOut = useNew ? new : old
        case .loop(let old, let new):
            audio.loop = useNew ? new : old
        case .isBackground(let old, let new):
            audio.isBackground = useNew ? new : old
        case .isLocked:
            break
        }
    }

    private func apply(property: ClipProperty,
                       to text: inout StoryTextObject,
                       useNew: Bool) {
        switch property {
        case .isLocked(let old, let new):
            text.isLocked = useNew ? new : old
        case .fadeIn(let old, let new):
            text.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            text.fadeOut = useNew ? new : old
        case .volume, .loop, .isBackground:
            break
        }
    }
}
```

- [ ] **Step 20.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 8 tests executed.

- [ ] **Step 20.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add SetClipPropertyCommand with discriminated ClipProperty enum"
```

---

### Task 21: `AnyEditCommand` enum (type-erased Codable wrapper)

This is the persistable union of the 12 commands. Codable encoding uses a discriminated `type: String` + `payload`.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 21.1: Write the failing test**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - AnyEditCommand

    private func makeAllCommandCases() -> [AnyEditCommand] {
        let media = StoryMediaObject(id: "v1", postMediaId: "pm",
                                     mediaType: "video", placement: "media")
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pm",
                                           placement: "overlay",
                                           waveformSamples: [])
        let text = StoryTextObject(id: "t1", content: "hi")
        let transition = StoryClipTransition(id: "tr1", fromClipId: "v1",
                                             toClipId: "v2", kind: .crossfade,
                                             duration: 0.4)
        let kf = StoryKeyframe(id: "kf1", time: 1.0, opacity: 0.5)

        return [
            .addClip(AddClipCommand(clipId: "v1", postMediaId: "pm",
                                    kind: .video, startTime: 0, duration: 1)),
            .deleteClip(DeleteClipCommand(clipId: "v1", kind: .video,
                                          snapshotMedia: media,
                                          snapshotAudio: nil,
                                          snapshotText: nil,
                                          insertionIndex: 0)),
            .moveClip(MoveClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, newStartTime: 1)),
            .trimClip(TrimClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, oldDuration: 5,
                                      newStartTime: 1, newDuration: 3)),
            .splitClip(SplitClipCommand(clipId: "v1", kind: .video,
                                        splitAtRelativeTime: 1,
                                        leftId: "L", rightId: "R")),
            .addTransition(AddTransitionCommand(transition: transition)),
            .removeTransition(RemoveTransitionCommand(transitionId: "tr1",
                                                     snapshot: transition,
                                                     insertionIndex: 0)),
            .changeTransition(ChangeTransitionCommand(transitionId: "tr1",
                                                     previous: transition,
                                                     updated: transition)),
            .addKeyframe(AddKeyframeCommand(clipId: "v1", kind: .video,
                                            keyframe: kf)),
            .moveKeyframe(MoveKeyframeCommand(clipId: "v1", kind: .video,
                                              keyframeId: "kf1",
                                              oldTime: 0, newTime: 1)),
            .deleteKeyframe(DeleteKeyframeCommand(clipId: "v1", kind: .video,
                                                  keyframeId: "kf1",
                                                  snapshot: kf,
                                                  insertionIndex: 0)),
            .setClipProperty(SetClipPropertyCommand(clipId: "v1", kind: .video,
                                                    property: .volume(old: 1, new: 0.5))),
        ]
    }

    func test_anyEditCommand_hasExactlyTwelveCases() {
        XCTAssertEqual(makeAllCommandCases().count, 12)
    }

    func test_anyEditCommand_underlying_returnsConcreteCommand() {
        for any in makeAllCommandCases() {
            let underlying = any.underlying
            XCTAssertFalse(underlying.id.isEmpty)
        }
    }

    func test_anyEditCommand_codableRoundTrip_allCases() throws {
        for any in makeAllCommandCases() {
            let data = try JSONEncoder().encode(any)
            let decoded = try JSONDecoder().decode(AnyEditCommand.self, from: data)
            XCTAssertEqual(decoded.typeTag, any.typeTag,
                           "Tag mismatch for case \(any.typeTag)")
        }
    }

    func test_anyEditCommand_apply_dispatchesToUnderlying() throws {
        var project = makeEmptyProject()
        let any = AnyEditCommand.addClip(
            AddClipCommand(clipId: "v1", postMediaId: "pm",
                           kind: .video, startTime: 0, duration: 1)
        )
        try any.apply(to: &project)
        XCTAssertEqual(project.mediaObjects.count, 1)
    }

    func test_anyEditCommand_revert_dispatchesToUnderlying() throws {
        var project = makeEmptyProject()
        let any = AnyEditCommand.addClip(
            AddClipCommand(clipId: "v1", postMediaId: "pm",
                           kind: .video, startTime: 0, duration: 1)
        )
        try any.apply(to: &project)
        try any.revert(from: &project)
        XCTAssertTrue(project.mediaObjects.isEmpty)
    }

    func test_anyEditCommand_decode_unknownType_throws() {
        let json = #"{"type":"alienCommand","payload":{}}"#.data(using: .utf8)!
        XCTAssertThrowsError(try JSONDecoder().decode(AnyEditCommand.self, from: json))
    }
```

- [ ] **Step 21.2: Run test to verify it fails**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: FAIL with `cannot find 'AnyEditCommand' in scope`.

- [ ] **Step 21.3: Write minimal implementation**

Append in `StoryModels.swift` immediately after the `SetClipPropertyCommand`:

```swift
// MARK: - AnyEditCommand (type-erased Codable wrapper)

/// Type-erased wrapper around `EditCommand` allowing the 12 concrete command
/// types to be persisted as a single homogeneous array (`CommandStack`).
/// Encoded as `{"type": "<tag>", "payload": <concrete>}`.
public enum AnyEditCommand: Codable, Sendable {
    case addClip(AddClipCommand)
    case deleteClip(DeleteClipCommand)
    case moveClip(MoveClipCommand)
    case trimClip(TrimClipCommand)
    case splitClip(SplitClipCommand)
    case addTransition(AddTransitionCommand)
    case removeTransition(RemoveTransitionCommand)
    case changeTransition(ChangeTransitionCommand)
    case addKeyframe(AddKeyframeCommand)
    case moveKeyframe(MoveKeyframeCommand)
    case deleteKeyframe(DeleteKeyframeCommand)
    case setClipProperty(SetClipPropertyCommand)

    public var underlying: any EditCommand {
        switch self {
        case .addClip(let c):           return c
        case .deleteClip(let c):        return c
        case .moveClip(let c):          return c
        case .trimClip(let c):          return c
        case .splitClip(let c):         return c
        case .addTransition(let c):     return c
        case .removeTransition(let c):  return c
        case .changeTransition(let c):  return c
        case .addKeyframe(let c):       return c
        case .moveKeyframe(let c):      return c
        case .deleteKeyframe(let c):    return c
        case .setClipProperty(let c):   return c
        }
    }

    public func apply(to project: inout TimelineProject) throws {
        try underlying.apply(to: &project)
    }

    public func revert(from project: inout TimelineProject) throws {
        try underlying.revert(from: &project)
    }

    public var typeTag: String {
        switch self {
        case .addClip:           return "addClip"
        case .deleteClip:        return "deleteClip"
        case .moveClip:          return "moveClip"
        case .trimClip:          return "trimClip"
        case .splitClip:         return "splitClip"
        case .addTransition:     return "addTransition"
        case .removeTransition:  return "removeTransition"
        case .changeTransition:  return "changeTransition"
        case .addKeyframe:       return "addKeyframe"
        case .moveKeyframe:      return "moveKeyframe"
        case .deleteKeyframe:    return "deleteKeyframe"
        case .setClipProperty:   return "setClipProperty"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type, payload
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let tag = try c.decode(String.self, forKey: .type)
        switch tag {
        case "addClip":
            self = .addClip(try c.decode(AddClipCommand.self, forKey: .payload))
        case "deleteClip":
            self = .deleteClip(try c.decode(DeleteClipCommand.self, forKey: .payload))
        case "moveClip":
            self = .moveClip(try c.decode(MoveClipCommand.self, forKey: .payload))
        case "trimClip":
            self = .trimClip(try c.decode(TrimClipCommand.self, forKey: .payload))
        case "splitClip":
            self = .splitClip(try c.decode(SplitClipCommand.self, forKey: .payload))
        case "addTransition":
            self = .addTransition(try c.decode(AddTransitionCommand.self, forKey: .payload))
        case "removeTransition":
            self = .removeTransition(try c.decode(RemoveTransitionCommand.self, forKey: .payload))
        case "changeTransition":
            self = .changeTransition(try c.decode(ChangeTransitionCommand.self, forKey: .payload))
        case "addKeyframe":
            self = .addKeyframe(try c.decode(AddKeyframeCommand.self, forKey: .payload))
        case "moveKeyframe":
            self = .moveKeyframe(try c.decode(MoveKeyframeCommand.self, forKey: .payload))
        case "deleteKeyframe":
            self = .deleteKeyframe(try c.decode(DeleteKeyframeCommand.self, forKey: .payload))
        case "setClipProperty":
            self = .setClipProperty(try c.decode(SetClipPropertyCommand.self, forKey: .payload))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c,
                debugDescription: "Unknown AnyEditCommand type: \(tag)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(typeTag, forKey: .type)
        switch self {
        case .addClip(let v):           try c.encode(v, forKey: .payload)
        case .deleteClip(let v):        try c.encode(v, forKey: .payload)
        case .moveClip(let v):          try c.encode(v, forKey: .payload)
        case .trimClip(let v):          try c.encode(v, forKey: .payload)
        case .splitClip(let v):         try c.encode(v, forKey: .payload)
        case .addTransition(let v):     try c.encode(v, forKey: .payload)
        case .removeTransition(let v):  try c.encode(v, forKey: .payload)
        case .changeTransition(let v):  try c.encode(v, forKey: .payload)
        case .addKeyframe(let v):       try c.encode(v, forKey: .payload)
        case .moveKeyframe(let v):      try c.encode(v, forKey: .payload)
        case .deleteKeyframe(let v):    try c.encode(v, forKey: .payload)
        case .setClipProperty(let v):   try c.encode(v, forKey: .payload)
        }
    }
}
```

- [ ] **Step 21.4: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 6 tests executed.

- [ ] **Step 21.5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "feat(sdk): add AnyEditCommand discriminated codable enum (12 cases)"
```

---

### Task 22: Apply/Revert idempotence sweep test

A meta-test that for each `AnyEditCommand` case verifies `apply -> revert` returns the project to its initial state (round-trip equality on the JSON encoding).

**Files:**
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift`

- [ ] **Step 22.1: Write the test (no impl change)**

Append inside the `StoryModelsExtensionsTests` class:

```swift
    // MARK: - Apply/Revert idempotence sweep

    private func makeRichProject() -> TimelineProject {
        var project = makeEmptyProject()
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm1",
                             mediaType: "video", placement: "media",
                             startTime: 0, duration: 5),
            StoryMediaObject(id: "v2", postMediaId: "pm2",
                             mediaType: "video", placement: "media",
                             startTime: 5, duration: 3),
        ]
        project.mediaObjects[0].keyframes = [
            StoryKeyframe(id: "kf-existing", time: 1, opacity: 0.5)
        ]
        project.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "a1", postMediaId: "pmA",
                                   placement: "overlay", volume: 1.0,
                                   waveformSamples: [], startTime: 0, duration: 8)
        ]
        project.textObjects = [
            StoryTextObject(id: "t1", content: "Title",
                            startTime: 0, displayDuration: 4)
        ]
        project.clipTransitions = [
            StoryClipTransition(id: "tr-existing", fromClipId: "v1",
                                toClipId: "v2", kind: .crossfade, duration: 0.5)
        ]
        return project
    }

    private func encodedJSON(_ project: TimelineProject) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(project)
    }

    func test_allEditCommands_applyThenRevert_isIdempotentOnRichProject() throws {
        // We pair each command case with the right baseline so that:
        //  - "Add"-style commands target new ids not present in the baseline
        //    (so revert truly removes only what apply added)
        //  - "Mutating"-style commands target ids that DO exist
        //  - "Delete"-style commands carry a snapshot equal to the baseline entry
        let media = StoryMediaObject(id: "v1", postMediaId: "pm1",
                                     mediaType: "video", placement: "media",
                                     startTime: 0, duration: 5)
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pmA",
                                           placement: "overlay", volume: 1.0,
                                           waveformSamples: [],
                                           startTime: 0, duration: 8)
        let text = StoryTextObject(id: "t1", content: "Title",
                                   startTime: 0, displayDuration: 4)
        let existingTransition = StoryClipTransition(
            id: "tr-existing", fromClipId: "v1", toClipId: "v2",
            kind: .crossfade, duration: 0.5
        )
        let existingKf = StoryKeyframe(id: "kf-existing", time: 1, opacity: 0.5)

        let cases: [AnyEditCommand] = [
            // Add* uses NEW ids not in the baseline:
            .addClip(AddClipCommand(clipId: "vNEW", postMediaId: "pmN",
                                    kind: .video, startTime: 6, duration: 1)),
            .addTransition(AddTransitionCommand(
                transition: StoryClipTransition(id: "tr-NEW", fromClipId: "v1",
                                                toClipId: "v2",
                                                kind: .dissolve, duration: 0.4))),
            .addKeyframe(AddKeyframeCommand(clipId: "v1", kind: .video,
                                            keyframe: StoryKeyframe(id: "kf-NEW",
                                                                    time: 2,
                                                                    scale: 1.2))),

            // Mutating commands (target existing ids):
            .moveClip(MoveClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, newStartTime: 2)),
            .trimClip(TrimClipCommand(clipId: "v1", kind: .video,
                                      oldStartTime: 0, oldDuration: 5,
                                      newStartTime: 1, newDuration: 3)),
            .splitClip(SplitClipCommand(clipId: "v1", kind: .video,
                                        splitAtRelativeTime: 2,
                                        leftId: "v1L", rightId: "v1R")),
            .changeTransition(ChangeTransitionCommand(
                transitionId: "tr-existing",
                previous: existingTransition,
                updated: StoryClipTransition(id: "tr-existing",
                                             fromClipId: "v1", toClipId: "v2",
                                             kind: .dissolve, duration: 1.0))),
            .moveKeyframe(MoveKeyframeCommand(clipId: "v1", kind: .video,
                                              keyframeId: "kf-existing",
                                              oldTime: 1, newTime: 3)),
            .setClipProperty(SetClipPropertyCommand(
                clipId: "a1", kind: .audio,
                property: .volume(old: 1.0, new: 0.4))),

            // Delete* commands carry snapshots equal to the existing entries:
            .deleteClip(DeleteClipCommand(clipId: "v1", kind: .video,
                                          snapshotMedia: media,
                                          snapshotAudio: nil,
                                          snapshotText: nil,
                                          insertionIndex: 0)),
            .removeTransition(RemoveTransitionCommand(
                transitionId: "tr-existing",
                snapshot: existingTransition, insertionIndex: 0)),
            .deleteKeyframe(DeleteKeyframeCommand(
                clipId: "v1", kind: .video,
                keyframeId: "kf-existing",
                snapshot: existingKf, insertionIndex: 0)),
        ]
        XCTAssertEqual(cases.count, 12, "Idempotence sweep must cover all 12 commands")

        let baselineJSON = try encodedJSON(makeRichProject())
        for any in cases {
            var project = makeRichProject()
            try any.apply(to: &project)
            try any.revert(from: &project)
            let after = try encodedJSON(project)
            XCTAssertEqual(after, baselineJSON,
                "Command \(any.typeTag) is not apply-revert idempotent")
        }
    }
```

- [ ] **Step 22.2: Run test to verify it passes**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -10`
Expected: PASS, 1 test executed.

- [ ] **Step 22.3: Commit**

```bash
git add packages/MeeshySDK/Tests/MeeshySDKTests/Models/StoryModelsExtensionsTests.swift
git commit -m "test(sdk): apply/revert idempotence sweep for all 12 EditCommands"
```

---

### Task 23: Full-suite green run + cleanup

- [ ] **Step 23.1: Run the entire `StoryModelsExtensionsTests` suite**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | tail -20`
Expected: All tests pass. Count must be ~70+ test methods (precise count: 1 + 1 + 4 + 5 + 3 + 3 + 3 + 2 + 5 + 1 + 2 + 5 + 4 + 4 + 4 + 4 + 7 + 4 + 11 + 8 + 6 + 1 = ~88, depending on grouping).

- [ ] **Step 23.2: Run the full SDK test suite (regression check)**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" 2>&1 | tail -30`
Expected: 0 failures. If the existing `StoryModelsTests` suite picks up errors due to the new optional fields breaking some `==`/synthesized assumptions, fix them in this step (most likely a no-op since all new fields are `Optional` and default to `nil`).

- [ ] **Step 23.3: Build the iOS app to verify SDK consumers still compile**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -20`
Expected: BUILD SUCCEEDED. If the app uses `StoryEffects(...)` positional initializers anywhere, the new trailing parameter `clipTransitions: [StoryClipTransition]? = nil` keeps source compat (it has a default).

- [ ] **Step 23.4: Verify file size discipline**

Run: `wc -l /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
Expected: < 2200 lines. Si > 2000, c'est OK pour Phase 0 (le spec section 1 prevoit que `StoryClipTransition+SDK.swift` et `StoryKeyframe+SDK.swift` soient dans le module Timeline cible, mais Phase 0 garde tout dans `StoryModels.swift` pour minimiser la surface de revue). Le split sera fait en Phase 1 quand le module `Sources/MeeshyUI/Story/Timeline/Model/` est cree.

Note : si on depasse 2500 lignes, ouvrir un sous-fichier `StoryTimelineModels.swift` dans le meme dossier `Models/` et y deplacer les nouveaux types — ne PAS toucher aux types existants. Mais cela reste optionnel pour Phase 0.

- [ ] **Step 23.5: Commit (only if anything changed in Step 23.2 / 23.3)**

```bash
git add -A
git status
# If clean, skip the commit. Otherwise:
git commit -m "fix(sdk): regression fixes after timeline phase 0 model additions"
```

---

### Task 24: Update Codex/Claude review checklist

- [ ] **Step 24.1: Self-review checklist (no commit)**

Verify, by re-reading the diff (`git log --oneline -25` then `git show --stat`):

1. All new types are `public`.
2. All new types are `Sendable`.
3. All new types are `Codable`.
4. All new fields on existing structs are `Optional`.
5. No usage of `try!` or `as!` in production code.
6. No `print()`; production code logs via `Logger.media` if needed (none required in Phase 0 — pure model code).
7. `apps/ios/CLAUDE.md` rules respected: naming `{Verb}{Noun}Command`, `is`/`has` for booleans (none added that needed it), `Sendable` everywhere.
8. Commit messages all start with `feat(sdk):` / `test(sdk):` and contain no `Co-Authored-By` trailer.
9. Total commit count ≈ 23 (one per task + scaffold).
10. The test file `StoryModelsExtensionsTests.swift` covers every new type with a Codable round-trip.

- [ ] **Step 24.2: Final tally**

Run: `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshySDKTests/StoryModelsExtensionsTests 2>&1 | grep -E "Test Suite 'StoryModelsExtensionsTests' passed|executed [0-9]+ tests"`
Expected output line containing `executed XX tests` with `XX >= 80`.

- [ ] **Step 24.3: Stop. Phase 0 complete.**

The next plan (`2026-05-05-timeline-plan-2-logic-core.md`, future work) builds on top of these types: `SnapEngine`, `CommandStack` (consumes `AnyEditCommand`), `KeyframeInterpolator`. None require further model changes.

---

## Final acceptance criteria for Phase 0

- [ ] All 24 tasks committed independently
- [ ] `xcodebuild test -workspace /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"` green
- [ ] `./apps/ios/meeshy.sh build` green
- [ ] No mutation to existing public APIs (only additions)
- [ ] Old V1 JSON drafts decode without error in V2 (proven by `test_storySlide_decodeV1JSON_withoutTimelineV2Fields_succeeds` and per-type tests)
- [ ] Every new `EditCommand` is reversible (`apply` → `revert` returns project to encoded equality with baseline)
- [ ] `AnyEditCommand` round-trips for all 12 cases
- [ ] Zero `Co-Authored-By` lines in commit history
