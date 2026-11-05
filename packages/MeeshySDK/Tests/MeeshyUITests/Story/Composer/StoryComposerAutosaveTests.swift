import XCTest
import Combine
@testable import MeeshyUI
@testable import MeeshySDK

/// E1 — crash-safe editing. The draft used to be persisted ONLY on
/// scenePhase == .background: a hard crash (OOM, fatalError) while editing
/// lost everything since the last backgrounding. The composer now autosaves
/// on a debounced trigger after ANY ViewModel mutation.
///
/// These tests pin the two testable cores:
/// - `StoryComposerViewModel.autosaveTrigger` — a STABLE stored publisher
///   (an inline `objectWillChange.debounce` in `body` would be re-subscribed
///   on every render, perpetually resetting the timer) that fires once per
///   mutation burst.
/// - `StoryComposerView.mediaKeysFingerprint` — the pure key-set diff that
///   gates the heavy `saveMedia` (bitmap copies) to actual media changes.
@MainActor
final class StoryComposerAutosaveTests: XCTestCase {

    // MARK: - Debounced trigger

    func test_autosaveTrigger_firesOnceAfterMutationBurst() {
        let vm = StoryComposerViewModel()
        vm.autosaveDebounceInterval = 0.05
        var fireCount = 0
        let fired = expectation(description: "autosave trigger fired")
        let cancellable = vm.autosaveTrigger.sink { _ in
            fireCount += 1
            if fireCount == 1 { fired.fulfill() }
        }

        vm.selectedElementId = "a"
        vm.selectedElementId = "b"
        vm.selectedElementId = "c"

        wait(for: [fired], timeout: 2.0)
        // Let any (wrong) extra emissions land before asserting the count.
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        XCTAssertEqual(fireCount, 1,
                       "A burst of mutations must coalesce into exactly ONE autosave")
        _ = cancellable
    }

    func test_autosaveTrigger_firesAgainAfterSecondBurst() {
        let vm = StoryComposerViewModel()
        vm.autosaveDebounceInterval = 0.05
        var fireCount = 0
        let firedOnce = expectation(description: "first burst settled")
        let firedTwice = expectation(description: "autosave trigger fired twice")
        let cancellable = vm.autosaveTrigger.sink { _ in
            fireCount += 1
            if fireCount == 1 { firedOnce.fulfill() }
            if fireCount == 2 { firedTwice.fulfill() }
        }

        vm.selectedElementId = "first-burst"
        wait(for: [firedOnce], timeout: 2.0)
        vm.selectedElementId = "second-burst"

        wait(for: [firedTwice], timeout: 2.0)
        XCTAssertEqual(fireCount, 2,
                       "Each settled mutation burst gets its own autosave")
        _ = cancellable
    }

    // MARK: - Media fingerprint (gates the heavy saveMedia)

}
