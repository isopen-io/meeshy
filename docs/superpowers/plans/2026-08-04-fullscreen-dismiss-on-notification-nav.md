# Fermeture du plein écran depuis une notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Taper une notification pendant qu'un Réel, une Story, ou un appel est affiché en plein écran doit fermer/minimiser cette surface avant de naviguer, pour que l'utilisateur voie effectivement le changement (conversation, détail de post, etc.) au lieu de rester bloqué derrière le contenu plein écran.

**Architecture:** Une policy pure et stateless (`FullScreenDismissPolicy`) décide QUELLES actions de fermeture exécuter, à partir de l'état des trois surfaces (Réel/Story/Appel) et de la cible de la notification. `RootView.navigateFromNotification` devient un wiring mince qui consulte cette policy puis exécute les actions retournées sur les objets existants (`ReelsPresenter`, `StoryViewerCoordinator`, `CallManager`) — jamais de coordinateur central, jamais de changement de leur API publique.

**Tech Stack:** Swift 6, SwiftUI, XCTest.

## Global Constraints

- Spec source de vérité : `docs/superpowers/specs/2026-08-04-notification-dismiss-and-silent-dm-visibility-design.md`, section « Problème 1 ».
- Minimiser un appel = `CallManager.shared.displayMode = .pip`. **Jamais** `CallManager.shared.endCall()`.
- Tester le comportement (policy pure), pas seulement le câblage — `CLAUDE.md` racine : « Test behavior, not implementation ».
- Tout nouveau fichier `.swift` sous `apps/ios/Meeshy/` est auto-inclus par XcodeGen au prochain `xcodegen generate` (`apps/ios/CLAUDE.md`) — nécessaire pour que `meeshy.sh test` (qui ne régénère PAS le projet) voie le nouveau fichier de test.
- Build/test via `./apps/ios/meeshy.sh build` / `./apps/ios/meeshy.sh test` uniquement — jamais `xcodebuild` directement (`apps/ios/CLAUDE.md`).

---

### Task 1: `FullScreenDismissPolicy` — policy pure et ses tests de comportement

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/FullScreenDismissPolicy.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/FullScreenDismissPolicyTests.swift`

**Interfaces:**
- Produces: `enum FullScreenDismissPolicy` avec `enum Target: Equatable { case reel, story, other }`, `struct ActiveSurfaces { let reelsActive: Bool; let storyActive: Bool; let callFullScreen: Bool }`, `enum DismissAction: Equatable { case closeReels, dismissStory, minimizeCall }`, et `static func actions(for target: Target, active: ActiveSurfaces) -> [DismissAction]`. Task 2 consomme exactement ces noms et signatures.

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import Meeshy

final class FullScreenDismissPolicyTests: XCTestCase {
    private func makeActive(
        reels: Bool = false,
        story: Bool = false,
        call: Bool = false
    ) -> FullScreenDismissPolicy.ActiveSurfaces {
        .init(reelsActive: reels, storyActive: story, callFullScreen: call)
    }

    // Rien d'actif → jamais d'action, quelle que soit la cible.
    func test_actions_noSurfacesActive_returnsEmpty() {
        for target: FullScreenDismissPolicy.Target in [.reel, .story, .other] {
            XCTAssertEqual(
                FullScreenDismissPolicy.actions(for: target, active: makeActive()),
                [],
                "target: \(target)"
            )
        }
    }

    // Un réel est ouvert, la notification pointe ailleurs (conversation, post,
    // appel...) → on le ferme.
    func test_actions_reelActive_targetOther_closesReels() {
        let result = FullScreenDismissPolicy.actions(
            for: .other,
            active: makeActive(reels: true)
        )
        XCTAssertEqual(result, [.closeReels])
    }

    // Un réel est ouvert, la notification pointe vers UN AUTRE réel → ne rien
    // fermer, `present(...)` remplace déjà l'état en place (pas de flicker).
    func test_actions_reelActive_targetReel_noAction() {
        let result = FullScreenDismissPolicy.actions(
            for: .reel,
            active: makeActive(reels: true)
        )
        XCTAssertEqual(result, [])
    }

    func test_actions_storyActive_targetOther_dismissesStory() {
        let result = FullScreenDismissPolicy.actions(
            for: .other,
            active: makeActive(story: true)
        )
        XCTAssertEqual(result, [.dismissStory])
    }

    func test_actions_storyActive_targetStory_noAction() {
        let result = FullScreenDismissPolicy.actions(
            for: .story,
            active: makeActive(story: true)
        )
        XCTAssertEqual(result, [])
    }

    // Un réel actif, la notification pointe vers une STORY → fermer le réel,
    // la story ne l'était pas donc rien à faire pour elle.
    func test_actions_reelActive_targetStory_closesReelsOnly() {
        let result = FullScreenDismissPolicy.actions(
            for: .story,
            active: makeActive(reels: true)
        )
        XCTAssertEqual(result, [.closeReels])
    }

    // L'appel plein écran se minimise pour N'IMPORTE QUELLE cible de
    // notification, y compris une notification mineure (réaction) — décision
    // produit explicite, il n'y a pas de cible "appel" qui l'exempterait.
    func test_actions_callFullScreen_anyTarget_minimizesCall() {
        for target: FullScreenDismissPolicy.Target in [.reel, .story, .other] {
            XCTAssertEqual(
                FullScreenDismissPolicy.actions(for: target, active: makeActive(call: true)),
                [.minimizeCall],
                "target: \(target)"
            )
        }
    }

    // Les trois surfaces actives en même temps, cible = conversation → les
    // trois actions, dans un ordre stable pour des tests déterministes.
    func test_actions_allSurfacesActive_targetOther_returnsAllThree() {
        let result = FullScreenDismissPolicy.actions(
            for: .other,
            active: makeActive(reels: true, story: true, call: true)
        )
        XCTAssertEqual(result, [.closeReels, .dismissStory, .minimizeCall])
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `FullScreenDismissPolicy` n'existe pas encore (erreur de compilation du bundle de tests).

- [ ] **Step 3: Write the minimal implementation**

```swift
/// Décide quelles surfaces plein écran fermer/minimiser avant de router une
/// notification ailleurs. Pure — aucune dépendance à ReelsPresenter,
/// StoryViewerCoordinator, ou CallManager : le wiring (RootView) construit
/// `ActiveSurfaces` depuis ces objets et exécute les `DismissAction` retournées.
enum FullScreenDismissPolicy {
    /// Ce que la notification s'apprête à présenter — dérivé de son type
    /// (et, pour le contenu social, de `NotificationContentRouter.surface`).
    enum Target: Equatable {
        case reel
        case story
        case other
    }

    struct ActiveSurfaces {
        let reelsActive: Bool
        let storyActive: Bool
        let callFullScreen: Bool
    }

    enum DismissAction: Equatable {
        case closeReels
        case dismissStory
        case minimizeCall
    }

    static func actions(for target: Target, active: ActiveSurfaces) -> [DismissAction] {
        var result: [DismissAction] = []
        if active.reelsActive, target != .reel {
            result.append(.closeReels)
        }
        if active.storyActive, target != .story {
            result.append(.dismissStory)
        }
        if active.callFullScreen {
            result.append(.minimizeCall)
        }
        return result
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — tous les cas de `FullScreenDismissPolicyTests`.

- [ ] **Step 5: Regenerate the Xcode project so `meeshy.sh` sees the new files**

Run: `cd apps/ios && xcodegen generate && cd -`

Puis relancer `./apps/ios/meeshy.sh test` pour confirmer que le nouveau fichier de test tourne bien dans le bundle (pas seulement compilé en isolation).

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FullScreenDismissPolicy.swift \
        apps/ios/MeeshyTests/Unit/Views/FullScreenDismissPolicyTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj \
        apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme
git commit -m "feat(ios): add FullScreenDismissPolicy pure decision type"
```

---

### Task 2: Wiring dans `navigateFromNotification`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift:1367` (fonction `navigateFromNotification`, insérer avant le `switch ctx.type` existant)
- Test: `apps/ios/MeeshyTests/Unit/Views/RootViewNotificationDismissWiringTests.swift`

**Interfaces:**
- Consumes: `FullScreenDismissPolicy.actions(for:active:)`, `FullScreenDismissPolicy.Target`, `FullScreenDismissPolicy.ActiveSurfaces`, `FullScreenDismissPolicy.DismissAction` (Task 1). `RootView.socialSurface(_:postId:)` (existant, `RootView.swift:1317-1324`, retourne `NotificationContentSurface` avec cases `.reel`/`.story`/`.post`). `RootView.closeReels()` (existant, `:1709`). `reelsPresenter.launch` (`RootView.swift:179`), `storyViewerCoordinator.pendingRequest` (`:198`), `CallManager.shared.callState`/`.displayMode`, `CallState.shouldPresentFullScreenCover(callState:displayMode:)` (`CallManager.swift:102-107`).
- Produces: `RootView.dismissTarget(for:)` — utilisé uniquement en interne à ce fichier (`private`).

Ce fichier étant volumineux (RootView.swift compte >1700 lignes) et déjà source-inspecté par ailleurs, ce test reste un test de câblage léger — la décision elle-même est déjà couverte en comportement par `FullScreenDismissPolicyTests` (Task 1). Suivre le style déjà établi de `CallBubbleViewMiniMenuWiringTests.swift` (lecture du code source, pas d'instanciation de `RootView`).

- [ ] **Step 1: Write the failing wiring test**

```swift
import XCTest
@testable import Meeshy

/// Source-inspection : la décision (quelle action pour quelle combinaison de
/// surfaces/cible) est déjà couverte en comportement par
/// FullScreenDismissPolicyTests. Ce test vérifie seulement que RootView
/// consulte bien la policy et exécute les actions retournées, sans dupliquer
/// la logique de décision.
final class RootViewNotificationDismissWiringTests: XCTestCase {
    private func loadRootViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Views
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .appendingPathComponent("Meeshy/Features/Main/Views/RootView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_navigateFromNotification_consultsFullScreenDismissPolicy() throws {
        let source = try loadRootViewSource()
        guard let range = source.range(of: "private func navigateFromNotification"),
              let switchRange = source.range(of: "switch ctx.type {", range: range.upperBound..<source.endIndex) else {
            XCTFail("navigateFromNotification not found")
            return
        }
        let body = source[range.lowerBound..<switchRange.lowerBound]

        XCTAssertTrue(body.contains("FullScreenDismissPolicy.actions("), "must consult the policy before routing")
        XCTAssertTrue(body.contains(".closeReels"), "must handle the closeReels action")
        XCTAssertTrue(body.contains(".dismissStory"), "must handle the dismissStory action")
        XCTAssertTrue(body.contains(".minimizeCall"), "must handle the minimizeCall action")
        XCTAssertFalse(body.contains("endCall()"), "must never hang up — minimize only")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test`
Expected: FAIL — `navigateFromNotification` ne contient pas encore `FullScreenDismissPolicy.actions(`.

- [ ] **Step 3: Write the minimal implementation**

Insérer, juste avant `switch ctx.type {` en tête de `navigateFromNotification` (`RootView.swift:1368`) :

```swift
    private func navigateFromNotification(_ ctx: NotificationNavContext) {
        let target = dismissTarget(for: ctx)
        let active = FullScreenDismissPolicy.ActiveSurfaces(
            reelsActive: reelsPresenter.launch != nil,
            storyActive: storyViewerCoordinator.pendingRequest != nil,
            callFullScreen: CallState.shouldPresentFullScreenCover(
                callState: CallManager.shared.callState,
                displayMode: CallManager.shared.displayMode
            )
        )
        for action in FullScreenDismissPolicy.actions(for: target, active: active) {
            switch action {
            case .closeReels: closeReels()
            case .dismissStory: storyViewerCoordinator.dismiss()
            case .minimizeCall: CallManager.shared.displayMode = .pip
            }
        }

        switch ctx.type {
        // ... corps existant inchangé ...
```

Ajouter, juste après `socialSurface(_:postId:)` (`RootView.swift:1324`), le petit helper de classification qui réutilise cette même fonction déjà existante plutôt que de dupliquer les cases du switch social :

```swift
    /// Classifie la cible d'une notification pour `FullScreenDismissPolicy` —
    /// seul le sous-ensemble "contenu social" (`socialSurface`) peut résoudre
    /// vers `.reel`/`.story` ; tout le reste (conversation, appel, système...)
    /// n'est jamais un réel ni une story.
    private func dismissTarget(for ctx: NotificationNavContext) -> FullScreenDismissPolicy.Target {
        switch ctx.type {
        case .postLike, .legacyPostLike, .postRepost, .friendNewPost,
             .postComment, .legacyPostComment, .commentLike, .commentReply, .commentReaction,
             .storyReaction, .statusReaction,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .friendNewStory, .friendNewMood:
            guard let postId = ctx.postId, !postId.isEmpty else { return .other }
            switch socialSurface(ctx, postId: postId) {
            case .reel: return .reel
            case .story: return .story
            case .post: return .other
            }
        default:
            return .other
        }
    }
```

**Note** : ce helper duplique volontairement (en lecture seule, sans effet de bord) la liste de cases déjà présente dans le `switch ctx.type` du corps de `navigateFromNotification` (section « SOCIAL CONTENT », `RootView.swift:1440-1444`). Alternative écartée : faire remonter la valeur calculée par le switch principal jusqu'en tête de fonction aurait demandé de restructurer les ~140 lignes de `navigateFromNotification`, une fonction déjà subtile et couverte par un comportement de production — risque disproportionné pour ce correctif. Si les deux listes divergent un jour, `RootViewNotificationDismissWiringTests` ne le détecte pas : à surveiller si `socialSurface`/le switch social évoluent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — `RootViewNotificationDismissWiringTests` et l'ensemble de la suite (pas de régression sur les tests de navigation existants).

- [ ] **Step 5: Manual verification**

`./apps/ios/meeshy.sh run` puis, sur le simulateur (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`) : ouvrir un Réel, déclencher une notification de message (ou taper une notification existante depuis le centre de notifications), confirmer que le Réel se ferme et que la conversation apparaît. Répéter pour une Story ouverte, puis pour un appel actif (confirmer qu'il se minimise en PiP/bulle et reste joignable, jamais raccroché).

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/RootView.swift \
        apps/ios/MeeshyTests/Unit/Views/RootViewNotificationDismissWiringTests.swift
git commit -m "fix(ios): dismiss fullscreen reel/story/call when a notification navigates elsewhere"
```
