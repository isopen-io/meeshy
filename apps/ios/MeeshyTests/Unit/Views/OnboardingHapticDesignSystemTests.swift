import XCTest
@testable import Meeshy

/// Iteration 217i — routes the last nine hand-rolled haptics through the design
/// system's `HapticFeedback` (MeeshyUI), eight of them in the onboarding flow.
///
/// `HapticFeedback` keeps its `UIImpactFeedbackGenerator`s as `@MainActor`
/// singletons and calls `prepare()` before every event. Its own doc-comment says
/// why: *"without it the very first tap feels missing"*. A generator that is
/// allocated, fired and destroyed in a single expression —
/// `UIImpactFeedbackGenerator(style: .light).impactOccurred()` — is never warm,
/// so **every** tap is a first tap. The engine may still be at rest and the
/// taptic lands late or not at all.
///
/// That made onboarding the one journey in the app with unreliable tactile
/// feedback, which is also the first journey a user ever walks. Two lesser costs
/// came with it: an allocation per tap on repeat-tap surfaces (step indicator,
/// language list, username suggestions), and the loss of the wrapper's
/// `#if canImport(UIKit) && os(iOS)` guard at each site.
///
/// The four files already imported `MeeshyUI` — none of them called
/// `HapticFeedback` even once. This is a pure 1:1 substitution: no import moved,
/// no intensity changed.
@MainActor
final class OnboardingHapticDesignSystemTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let animations = "Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift"
    private static let flowView = "Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift"
    private static let stepViews = "Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift"
    private static let appEntry = "Meeshy/MeeshyApp.swift"

    private static let convergedFiles = [animations, flowView, stepViews, appEntry]

    /// Expected number of `HapticFeedback.` call sites per file — exactly the
    /// number of generators removed. Asserting the count, not just the presence,
    /// is what makes "deleted the haptic instead of converging it" a red test.
    private static let expectedCallCount: [String: Int] = [
        animations: 2,   // step indicator (.light) + primary CTA (.medium)
        flowView: 2,     // back (.light) + close (.light)
        stepViews: 4,    // suggestion, language tab, language row, terms checkbox
        appEntry: 1      // NotificationToastManager.hapticPlayer
    ]

    private func readSource(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Production source with comment-only lines dropped, so asserting the
    /// *absence* of an API is not defeated by a comment that documents why the
    /// API was removed.
    private func code(_ relativePath: String) throws -> String {
        try readSource(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var index = haystack.startIndex
        while let found = haystack.range(of: needle, range: index..<haystack.endIndex) {
            count += 1
            index = found.upperBound
        }
        return count
    }

    // MARK: - Per-site convergence

    /// Both sites are anchored on the statement they sit next to. A bare
    /// `contains("HapticFeedback.light()")` would stay green even if the two
    /// sites had collapsed onto the same (wrong) intensity.
    func test_onboardingAnimations_usesDesignSystemHaptics() throws {
        let source = try readSource(Self.animations)

        XCTAssertTrue(
            source.contains("onStepTapped(step)\n                    HapticFeedback.light()"),
            "The step indicator must fire the design-system light haptic, not a freshly " +
            "allocated generator: it is a repeat-tap surface and its taptic must not be dropped."
        )
        XCTAssertTrue(
            source.contains("guard isEnabled && !isLoading else { return }\n            HapticFeedback.medium()"),
            "The primary onboarding CTA must keep its medium intensity, through HapticFeedback."
        )
    }

    func test_onboardingFlowView_usesDesignSystemHaptics() throws {
        let source = try readSource(Self.flowView)

        XCTAssertTrue(
            source.contains("viewModel.previousStep()\n                    }\n                    HapticFeedback.light()"),
            "The back control of the onboarding top bar must use HapticFeedback.light()."
        )
        XCTAssertTrue(
            source.contains("dismiss()\n                    HapticFeedback.light()"),
            "The close control of the onboarding top bar must use HapticFeedback.light()."
        )
    }

    func test_onboardingStepViews_usesDesignSystemHaptics() throws {
        let source = try readSource(Self.stepViews)

        XCTAssertTrue(
            source.contains("viewModel.selectSuggestion(suggestion)\n                        HapticFeedback.light()"),
            "Picking a username suggestion must use HapticFeedback.light()."
        )
        XCTAssertTrue(
            source.contains("editingTarget = target }\n            HapticFeedback.light()"),
            "Switching the language target tab must use HapticFeedback.light()."
        )
        XCTAssertTrue(
            source.contains("viewModel.acceptTerms.toggle() }\n            HapticFeedback.light()"),
            "Toggling the terms checkbox must use HapticFeedback.light()."
        )
    }

    /// The SDK types this hook `(@MainActor () -> Void)?`
    /// (`NotificationToastManager.swift:51`), so the design-system call — itself
    /// `@MainActor` — drops straight in.
    func test_notificationToastHapticPlayer_usesDesignSystemHaptic() throws {
        let source = try readSource(Self.appEntry)

        XCTAssertTrue(
            source.contains("hapticPlayer = {\n                        HapticFeedback.light()\n                    }"),
            "The in-app toast haptic handed to the SDK must be the warm design-system " +
            "generator, not a per-toast allocation."
        )
    }

    // MARK: - Single-source-of-truth lock

    /// Scoped to the four converged files on purpose. `CallManager` still owns
    /// two *style-parameterised* private wrappers (`playHaptic(_:)`,
    /// `playNotificationHaptic(_:)`) that `HapticFeedback` has no equivalent for;
    /// converging them means widening the SDK API first (218i). Widening this
    /// sweep repo-wide today would fail for a reason that has nothing to do with
    /// this iteration.
    func test_convergedFiles_containNoHandRolledFeedbackGenerator() throws {
        for path in Self.convergedFiles {
            let source = try code(path)

            XCTAssertFalse(
                source.contains("UIImpactFeedbackGenerator("),
                "\(path) must not build its own impact generator: an instance destroyed right " +
                "after impactOccurred() is never prepared, so the taptic can be dropped."
            )
            XCTAssertFalse(
                source.contains("UINotificationFeedbackGenerator("),
                "\(path) must not build its own notification generator — use " +
                "HapticFeedback.success() / .error()."
            )
        }
    }

    /// Conservation: one design-system call replaced exactly one generator. A
    /// site removed rather than converged — a haptic silently lost — turns red
    /// here even though the lock above would stay green.
    func test_everyRemovedGeneratorWasReplacedOneForOne() throws {
        for (path, expected) in Self.expectedCallCount {
            let source = try code(path)

            XCTAssertEqual(
                occurrences(of: "HapticFeedback.", in: source), expected,
                "\(path) must call HapticFeedback exactly \(expected) time(s) — one per haptic " +
                "site that previously allocated its own generator."
            )
        }
    }
}
