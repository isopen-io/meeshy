import XCTest
import SwiftUI
import UIKit
@testable import Meeshy

/// Every user-visible measurement the app takes of "how much room do I have"
/// must come from the window it is rendered in — resolved through one rule.
///
/// Two failure modes were spread across the app, both invisible on iPhone and
/// both wrong the moment a second window exists:
///
/// 1. **The display instead of the window.** `UIScreen.main.bounds` is the
///    physical display. Under Split View, Slide Over or Stage Manager the app
///    owns a fraction of it, so a ratio taken against the screen is a ratio of
///    space the app does not have: caps stop capping, estimates overshoot.
///
/// 2. **An arbitrary scene instead of the active one.** `connectedScenes` is an
///    unordered `Set`. `.first` therefore returns *any* scene — routinely a
///    background one in multi-window — so the app measured, titled, or rotated
///    a window the user was not looking at.
///
/// `DeviceLayout.activeWindowScene` / `activeWindow` is the single resolution;
/// `windowSize`, `safeAreaBottom` and `safeAreaTop` are the readers over it.
@MainActor
final class WindowMetricsSSOTTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Comment lines are stripped before matching: the doc-comments deliberately
    /// name the banned APIs to explain *why* they are banned, and a guard that
    /// trips on its own rationale is a guard nobody keeps.
    private func codeLines(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
    }

    private static let deviceLayout = "Meeshy/Core/DeviceLayout.swift"

    /// Every file converged in this iteration. Each one previously either walked
    /// `connectedScenes` by hand or measured against `UIScreen.main.bounds`.
    private static let convergedFiles = [
        "Meeshy/Features/Main/Views/ConversationView.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
        "Meeshy/Features/Main/Views/StoryViewerView.swift",
        "Meeshy/Features/Main/Views/StoryViewerView+Content.swift",
        "Meeshy/Features/Main/Views/ReelFeedCard.swift",
        "Meeshy/Features/Main/Views/AudioFullscreenView.swift",
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/VideoLegacySupport.swift",
        "Meeshy/Features/Main/Components/ComposerModels.swift",
        "Meeshy/Features/Main/Components/IslandEmergingBanner.swift",
        "Meeshy/Features/Main/Components/RecentMediaStrip.swift"
    ]

    // MARK: - L'ancrage du bouton « redescendre en bas »

    /// Le défaut, en une assertion : le bouton suivait `composerHeight`, donc
    /// chaque ligne tapée le faisait remonter — pendant que l'utilisateur
    /// relisait son historique.
    func test_scrollButtonAnchor_whileComposing_doesNotFollowTheGrowingComposer() {
        let anchor = ConversationView.resolvedScrollButtonAnchor(
            current: 130,
            composerHeight: 186,
            isComposing: true
        )

        XCTAssertEqual(anchor, 130,
                       "écrire trois lignes ne doit pas déplacer le bouton de retour au bas")
    }

    func test_scrollButtonAnchor_withAnEmptyComposer_realignsOnIt() {
        let anchor = ConversationView.resolvedScrollButtonAnchor(
            current: 130,
            composerHeight: 164,
            isComposing: false
        )

        XCTAssertEqual(anchor, 164,
                       "champ vide : plus aucune position de lecture en jeu, l'ancrage se recale")
    }

    /// Les autres causes de redimensionnement — options ouvertes, barre de
    /// réponse — ne sont pas « écrire » et doivent continuer de déplacer le
    /// bouton : elles passent par `isComposing == false`.
    func test_scrollButtonAnchor_shrinkingComposer_isFollowedWhenNotComposing() {
        XCTAssertEqual(
            ConversationView.resolvedScrollButtonAnchor(current: 186, composerHeight: 130, isComposing: false),
            130
        )
    }

    // MARK: - The composer height rule, without a window

    /// The safe area is added only while the keyboard is down. `nil` means
    /// "leave `composerHeight` alone" — the caller must not fall back to a
    /// default, which would collapse the composer on every keyboard frame.
    func test_composerHeight_whileKeyboardIsUp_declinesToUpdate() {
        XCTAssertNil(
            ConversationView.resolvedComposerHeight(contentHeight: 130, keyboardHeight: 336, safeAreaBottom: 34),
            "With the keyboard up the bottom inset is already 0 and the GeometryReader fires on " +
            "every animation frame — recomputing there loops the height against itself."
        )
    }

    func test_composerHeight_withKeyboardDown_addsTheWindowInset() {
        XCTAssertEqual(
            ConversationView.resolvedComposerHeight(contentHeight: 130, keyboardHeight: 0, safeAreaBottom: 34),
            164 as CGFloat?
        )
    }

    /// A window with no home indicator (or no foreground scene at all) reports
    /// `0`, and the composer is then exactly its content height — not a
    /// screen-derived guess padded onto the bottom.
    func test_composerHeight_withoutAnInset_isTheContentHeight() {
        XCTAssertEqual(
            ConversationView.resolvedComposerHeight(contentHeight: 130, keyboardHeight: 0, safeAreaBottom: 0),
            130 as CGFloat?
        )
    }

    /// The defect, in one assertion. An iPhone-class inset (34 pt) read off a
    /// *background* scene while the foreground window is a home-indicator-less
    /// iPad Split View pane (0 pt) shifts the composer by a full 34 pt — enough
    /// to float it clear of the bar it is supposed to sit against.
    func test_composerHeight_isSensitiveToWhichWindowTheInsetCameFrom() {
        let fromTheActiveWindow = ConversationView.resolvedComposerHeight(
            contentHeight: 130, keyboardHeight: 0, safeAreaBottom: 0
        )
        let fromABackgroundWindow = ConversationView.resolvedComposerHeight(
            contentHeight: 130, keyboardHeight: 0, safeAreaBottom: 34
        )

        XCTAssertNotEqual(
            fromTheActiveWindow, fromABackgroundWindow,
            "If these agreed, which window the inset came from would not matter and there would " +
            "be nothing to fix — the assertion exists to keep the resolution honest."
        )
    }

    // MARK: - One resolution rule

    func test_deviceLayout_resolvesTheSceneByActivationState() throws {
        let code = codeLines(try source(Self.deviceLayout))

        XCTAssertTrue(
            code.contains("windowScene.activationState == .foregroundActive"),
            "The scene must be picked by activation state, never by position in an unordered Set."
        )
        XCTAssertTrue(
            code.contains("static var activeWindowScene: UIWindowScene?"),
            "The scene resolution must be exposed so scene-targeted requests (rotation, window " +
            "title) share it instead of re-deriving their own."
        )
        XCTAssertTrue(
            code.contains("static var activeWindow: UIWindow?"),
            "The window resolution must be exposed so every metric reads the same window."
        )
    }

    /// The three metrics are readers over the one resolution. If any of them
    /// grew its own scene walk again, the answers could disagree between call
    /// sites — which is precisely the class of bug this consolidates away.
    func test_windowMetrics_areReadersOverTheSingleResolution() throws {
        let code = codeLines(try source(Self.deviceLayout))

        for metric in ["activeWindow?.bounds.size",
                       "activeWindow?.safeAreaInsets.bottom",
                       "activeWindow?.safeAreaInsets.top"] {
            XCTAssertTrue(
                code.contains(metric),
                "\(metric) must be derived from activeWindow, not from its own scene walk."
            )
        }

        XCTAssertEqual(
            code.components(separatedBy: "connectedScenes").count - 1, 1,
            "DeviceLayout must touch connectedScenes exactly once — in activeWindowScene."
        )
    }

    // MARK: - No call site keeps its own walk

    func test_convergedFiles_doNotWalkConnectedScenes() throws {
        for path in Self.convergedFiles {
            XCTAssertFalse(
                codeLines(try source(path)).contains("connectedScenes"),
                "\(path) must resolve its scene through DeviceLayout: connectedScenes is an " +
                "unordered Set, so .first can hand back a background scene."
            )
        }
    }

    func test_convergedFiles_doNotMeasureAgainstTheDisplay() throws {
        for path in Self.convergedFiles {
            XCTAssertFalse(
                codeLines(try source(path)).contains("UIScreen.main.bounds"),
                "\(path) must measure against DeviceLayout.windowSize: under Split View the " +
                "display is space the app does not own."
            )
        }
    }

    /// `UIScreen.main` survives in exactly three places, all deliberate:
    /// `DeviceLayout`'s own last resort, and two image-decode sites that want
    /// the largest width an image could ever need (sizing those to the current
    /// window would under-decode and blur the moment the window grows).
    ///
    /// Asserted as an equality, not an inclusion: an inclusion would stay green
    /// if a new screen-derived measurement appeared, which is the only thing
    /// this is here to catch.
    func test_displayMeasurements_areConfinedToTheDeliberateSites() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")

        let deliberate: Set<String> = [
            "DeviceLayout.swift",              // the last resort when no scene exists
            "BubbleStandardLayout.swift",      // decode target: widest the image may need
            "ConversationMediaGalleryView.swift" // decode target: widest the image may need
        ]

        var found: Set<String> = []
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: appRoot.path))

        for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
            let code = codeLines(
                try String(contentsOf: appRoot.appendingPathComponent(relativePath), encoding: .utf8)
            )
            if code.contains("UIScreen.main.bounds") {
                found.insert((relativePath as NSString).lastPathComponent)
            }
        }

        XCTAssertEqual(
            found, deliberate,
            "New display-derived measurement, or a deliberate site removed without updating this " +
            "guard. Layout reads DeviceLayout.windowSize; only image-decode targets read the screen."
        )
    }

    /// `connectedScenes` outside `DeviceLayout` survives in one place:
    /// `CallManager` asks whether *any* connected scene is being captured, which
    /// is a question about all scenes rather than about the active one.
    func test_sceneWalks_areConfinedToTheResolverAndTheAllScenesQuery() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")

        let deliberate: Set<String> = [
            "DeviceLayout.swift",  // the single resolution
            "CallManager.swift"    // screen-capture probe: genuinely about every scene
        ]

        var found: Set<String> = []
        let walker = try XCTUnwrap(FileManager.default.enumerator(atPath: appRoot.path))

        for case let relativePath as String in walker where relativePath.hasSuffix(".swift") {
            let code = codeLines(
                try String(contentsOf: appRoot.appendingPathComponent(relativePath), encoding: .utf8)
            )
            if code.contains("connectedScenes") {
                found.insert((relativePath as NSString).lastPathComponent)
            }
        }

        XCTAssertEqual(
            found, deliberate,
            "New hand-rolled scene walk. Use DeviceLayout.activeWindowScene / activeWindow — " +
            "connectedScenes is unordered, so .first is not the window the user is looking at."
        )
    }

    // MARK: - The dead share is gone

    /// `StoryViewerView+Content.shareStory()` had no call site: the live path is
    /// `mintAndShareStory` in `StoryViewerView+Sidebar`, which mints a trackable
    /// `meeshy.me/l/<token>` and presents through `.sheet(item:)`. The orphan
    /// carried a hardcoded `meeshy.me/story/<id>` (untrackable), presented on a
    /// scene picked out of an unordered Set, and set a popover `sourceView` with
    /// no `sourceRect` — so it would have anchored at the view's corner on iPad.
    func test_storyViewer_hasNoOrphanedActivitySheet() throws {
        let code = codeLines(try source("Meeshy/Features/Main/Views/StoryViewerView+Content.swift"))

        XCTAssertFalse(
            code.contains("func shareStory()"),
            "shareStory() is dead code superseded by mintAndShareStory — it must not come back."
        )
        XCTAssertFalse(
            code.contains("UIActivityViewController("),
            "The story viewer shares through ShareSheet inside a .sheet, never a hand-rolled " +
            "activity controller."
        )
        XCTAssertFalse(
            code.contains("meeshy.me/story/"),
            "The shared URL must be the minted trackable link, not a hardcoded story path."
        )
    }
}
