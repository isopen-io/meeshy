import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// P0 Prisme Linguistique regression suite.
///
/// Before this fix, `TimelineViewModel+OfflinePublish.buildOfflineQueueItem`
/// hardcoded `originalLanguage: nil` when persisting an offline-queued story.
/// Stories created offline would flush to the gateway without a source language
/// tag — the NLLB-200 router cannot pick a translation pair without it, so the
/// Prisme Linguistique pipeline silently breaks for every offline-authored story.
///
/// These tests pin the contract: every queued item carries a non-nil, non-empty
/// `originalLanguage`. The caller's chosen value is forwarded verbatim; an empty
/// or whitespace-only override falls back to the Prisme default (`"fr"`) so an
/// upstream bug cannot reintroduce the silent-drop failure mode.
///
/// S6 — exercises `buildOfflineQueueItem` directly rather than through
/// `handlePublishTap` (removed as dead orchestration code, zero production
/// call sites): the function under test is a pure transformer of `project` +
/// its arguments, so calling it directly is a MORE precise vehicle, not a
/// weaker one — no network/queue mocks needed to observe its return value.
@MainActor
final class OfflineQueueOriginalLanguageTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> TimelineViewModel {
        let vm = TimelineViewModel(
            engine: MockStoryTimelineEngine(),
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.06)
        )
        vm.bootstrap(project: TimelineProjectFactory.emptyProject(),
                     mediaURLs: [:], images: [:])
        return vm
    }

    // MARK: - Tests

    /// The caller-supplied `originalLanguage` MUST be persisted on the queued
    /// item verbatim — this is what the Prisme Linguistique pipeline relies on
    /// to route NLLB-200 translations on flush.
    func test_buildOfflineQueueItem_includesOriginalLanguage_fromCallerParam() async {
        let vm = makeSUT()
        await vm.awaitConfigured()

        let item = vm.buildOfflineQueueItem(visibility: .public, originalLanguage: "es")

        XCTAssertEqual(item.originalLanguage, "es",
                       "Caller-provided originalLanguage MUST round-trip onto the queued item (Prisme Linguistique)")
    }

    /// Invariant: even when an upstream caller hands in a degenerate empty
    /// string, the persisted item MUST carry the Prisme default (`"fr"`) so
    /// the gateway always has a routable language tag.
    func test_buildOfflineQueueItem_fallsBackToFr_whenEmpty_invariant() async {
        let vm = makeSUT()
        await vm.awaitConfigured()

        let item = vm.buildOfflineQueueItem(visibility: .public, originalLanguage: "")

        XCTAssertEqual(item.originalLanguage, "fr",
                       "Empty originalLanguage MUST fall back to the Prisme default 'fr', never nil/empty")
    }

    /// Hard invariant: NO matter the caller's input or the project shape, the
    /// persisted item never carries a nil language. This is the regression
    /// guard for the original P0 bug (`originalLanguage: nil` hardcoded).
    func test_buildOfflineQueueItem_neverSetsNilLanguage() async {
        let vm = makeSUT()
        await vm.awaitConfigured()

        // Input designed to be hostile to a naive impl: whitespace-only tag.
        let item = vm.buildOfflineQueueItem(visibility: .friends, originalLanguage: "   \n\t  ")

        XCTAssertNotNil(item.originalLanguage,
                        "originalLanguage MUST never be nil on a queued story — gateway NLLB-200 routing breaks otherwise")
        XCTAssertFalse(item.originalLanguage?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                       "originalLanguage MUST never be whitespace-only either — invariant equivalent to nil for the gateway")
    }
}
