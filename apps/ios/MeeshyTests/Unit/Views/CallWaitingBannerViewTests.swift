import XCTest
@testable import Meeshy

/// Source-code inspection tests for `CallWaitingBannerView`.
///
/// The view is a SwiftUI struct (not directly instantiable without a hosting
/// controller), so these tests read the source file and pin invariants that
/// a code-review or refactor could silently break:
///
/// 1. Auto-dismiss uses `Task { @MainActor in }` + `Task.sleep`, NOT a `Timer` —
///    a Timer would not honour Task cancellation and would leak if the view
///    disappeared before it fired.
/// 2. `onDisappear` cancels the Task — prevents ghost auto-dismiss after the
///    banner is already gone.
/// 3. UIAccessibility announcement fires on `onAppear` — required for
///    VoiceOver users who are in a foreground conversation when a new call arrives.
/// 4. `scheduleAutoDismiss()` guards `autoDismissSeconds > 0` — prevents
///    scheduling a 0-second sleep that would dismiss the banner immediately.
/// 5. `dismiss()` cancels the Task before setting `isVisible = false` — prevents
///    a race where the Task wakes up and dismisses AFTER the user already acted.
/// 6. `isVisible` is `@Binding`, not `@State` — the parent owns visibility so it
///    can read it back for its own state management.
/// 7. `.environment(\.colorScheme, .dark)` is forced — the banner uses white text
///    on a glass surface; the dark pin keeps it legible in Light Mode.
@MainActor
final class CallWaitingBannerViewTests: XCTestCase {

    // MARK: - Source helper

    private func bannerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallWaitingBannerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Auto-dismiss uses Task, not Timer

    func test_scheduleAutoDismiss_usesTask_notTimer() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("Task { @MainActor in") || source.contains("Task<Void, Never>"),
            "scheduleAutoDismiss() must use a structured Task, not a Timer — " +
            "Timer does not participate in cooperative cancellation."
        )
        XCTAssertFalse(
            source.contains("Timer.scheduledTimer") || source.contains("Timer.publish"),
            "scheduleAutoDismiss() must NOT use Timer — it cannot be cancelled cooperatively."
        )
    }

    func test_scheduleAutoDismiss_usesSleep_notDispatchAfter() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("Task.sleep"),
            "scheduleAutoDismiss() must await Task.sleep — DispatchQueue.asyncAfter " +
            "cannot be cancelled after the fact."
        )
        XCTAssertFalse(
            source.contains("DispatchQueue.main.asyncAfter"),
            "scheduleAutoDismiss() must NOT use DispatchQueue.asyncAfter — not cancellable."
        )
    }

    func test_scheduleAutoDismiss_checksCancellationAfterSleep() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("Task.isCancelled"),
            "scheduleAutoDismiss() must check Task.isCancelled after sleep — prevents " +
            "a ghost dismiss when the banner has already been manually dismissed."
        )
    }

    // MARK: - onDisappear cancels the auto-dismiss Task

    func test_onDisappear_cancelsAutoDismissTask() throws {
        let source = try bannerSource()
        guard let disappearRange = source.range(of: ".onDisappear") else {
            XCTFail("CallWaitingBannerView must have an .onDisappear modifier")
            return
        }
        let end = source.index(disappearRange.lowerBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[disappearRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("autoDismissTask?.cancel()"),
            ".onDisappear must cancel autoDismissTask to prevent a ghost auto-dismiss " +
            "firing after the banner has already been removed."
        )
    }

    // MARK: - UIAccessibility announcement on appear

    func test_onAppear_postsAccessibilityAnnouncement() throws {
        let source = try bannerSource()
        guard let appearRange = source.range(of: ".onAppear") else {
            XCTFail("CallWaitingBannerView must have an .onAppear modifier")
            return
        }
        let end = source.index(appearRange.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[appearRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("UIAccessibility.post") && body.contains(".announcement"),
            ".onAppear must post a UIAccessibility .announcement so VoiceOver users " +
            "who are in a conversation are informed of the incoming call."
        )
    }

    // MARK: - scheduleAutoDismiss guards autoDismissSeconds > 0

    func test_scheduleAutoDismiss_guardsPositiveDuration() throws {
        let source = try bannerSource()
        guard let fnRange = source.range(of: "func scheduleAutoDismiss()") else {
            XCTFail("scheduleAutoDismiss() not found in CallWaitingBannerView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("autoDismissSeconds > 0"),
            "scheduleAutoDismiss() must guard autoDismissSeconds > 0 — a zero value " +
            "would dismiss the banner immediately without the user seeing it."
        )
    }

    // MARK: - Auto-dismiss timeout must reject the pending call, not just hide the banner

    func test_scheduleAutoDismiss_callsOnReject() throws {
        // Regression 2026-07-02: before this fix, the 15s auto-dismiss timeout
        // only flipped `isVisible = false` and never called `onReject()` —
        // unlike the explicit "Refuser" button, which calls both. That left
        // the second caller ringing indefinitely (no busy signal sent) with
        // no visible UI for the user to act on once the banner vanished.
        let source = try bannerSource()
        guard let fnRange = source.range(of: "private func scheduleAutoDismiss()") else {
            XCTFail("scheduleAutoDismiss() not found in CallWaitingBannerView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("onReject()"),
            "scheduleAutoDismiss()'s Task body must call onReject() after the timeout " +
            "fires — mirroring the explicit reject button — so the caller receives a " +
            "busy/reject signal instead of being left ringing until their own timeout."
        )
    }

    // MARK: - dismiss() cancels the Task before hiding

    func test_dismiss_cancelsTaskBeforeHiding() throws {
        let source = try bannerSource()
        guard let fnRange = source.range(of: "private func dismiss()") else {
            XCTFail("dismiss() not found in CallWaitingBannerView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 250, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("autoDismissTask?.cancel()"),
            "dismiss() must cancel autoDismissTask before setting isVisible = false — " +
            "prevents a race where the Task wakes up and tries to dismiss again."
        )
    }

    // MARK: - isVisible must be @Binding (parent-owned)

    func test_isVisible_isBinding_notState() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("@Binding var isVisible"),
            "isVisible must be @Binding — the parent owns the visibility flag so it " +
            "can read it back. @State would scope it to the banner struct itself."
        )
        XCTAssertFalse(
            source.contains("@State var isVisible") || source.contains("@State private var isVisible"),
            "isVisible must NOT be @State — visibility is parent-driven."
        )
    }

    // MARK: - Dark colour scheme is pinned

    func test_colorScheme_isPinnedToDark() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains(".environment(\\.colorScheme, .dark)"),
            "CallWaitingBannerView must pin .colorScheme to .dark — the banner uses " +
            "white text on a glass surface; without this pin the text becomes illegible " +
            "in Light Mode where .ultraThinMaterial produces a light background."
        )
    }

    // MARK: - Reduce Motion support

    func test_banner_readsReduceMotionEnvironment() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("accessibilityReduceMotion"),
            "CallWaitingBannerView must read @Environment(\\.accessibilityReduceMotion) " +
            "to conditionally skip animated transitions for motion-sensitive users."
        )
    }

    func test_banner_transition_usesConditionalOpacityWhenReduceMotion() throws {
        let source = try bannerSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? .opacity"),
            "CallWaitingBannerView transition must collapse to .opacity when reduceMotion " +
            "is true — .move animations can trigger vestibular discomfort."
        )
    }

    func test_dismiss_checksReduceMotionBeforeSpring() throws {
        let source = try bannerSource()
        guard let fnRange = source.range(of: "private func dismiss()") else {
            XCTFail("dismiss() not found in CallWaitingBannerView.swift"); return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("isReduceMotionEnabled"),
            "dismiss() must check UIAccessibility.isReduceMotionEnabled before using " +
            "withAnimation(.spring(...)) — motion-sensitive users must not see a spring bounce."
        )
    }
}
