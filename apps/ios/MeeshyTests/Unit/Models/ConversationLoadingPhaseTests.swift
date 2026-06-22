import XCTest
@testable import Meeshy

/// M2 follow-up to PR #280 — covers `ConversationLoadingPhase.derive(...)`
/// the additive projection of the ViewModel's 4 message-loading booleans
/// into a single mutually-exclusive state. The underlying booleans stay
/// in place; this enum is the canonical lens that views and a future
/// refactor will switch to.
@MainActor
final class ConversationLoadingPhaseTests: XCTestCase {

    // MARK: - Basic transitions

    func test_derive_allFalseNoData_returnsIdle() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: false,
            isLoadingOlder: false,
            isLoadingNewer: false,
            isRevalidating: false,
            hasObservedAnyData: false
        )
        XCTAssertEqual(phase, .idle)
    }

    func test_derive_allFalseWithData_returnsLoaded() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: false,
            isLoadingOlder: false,
            isLoadingNewer: false,
            isRevalidating: false,
            hasObservedAnyData: true
        )
        XCTAssertEqual(phase, .loaded)
    }

    func test_derive_initial_winsOverEverythingElse() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: true,
            isLoadingOlder: true,
            isLoadingNewer: true,
            isRevalidating: true,
            hasObservedAnyData: true
        )
        // Resolution priority: initial > older > newer > revalidating > data.
        // If two flags accidentally race to true, the louder one shows.
        XCTAssertEqual(phase, .loadingInitial)
    }

    func test_derive_olderBeatsNewerAndRevalidating() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: false,
            isLoadingOlder: true,
            isLoadingNewer: true,
            isRevalidating: true,
            hasObservedAnyData: true
        )
        XCTAssertEqual(phase, .loadingOlder)
    }

    func test_derive_newerBeatsRevalidating() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: false,
            isLoadingOlder: false,
            isLoadingNewer: true,
            isRevalidating: true,
            hasObservedAnyData: true
        )
        XCTAssertEqual(phase, .loadingNewer)
    }

    func test_derive_revalidating_returnsRevalidating() {
        let phase = ConversationLoadingPhase.derive(
            isLoadingInitial: false,
            isLoadingOlder: false,
            isLoadingNewer: false,
            isRevalidating: true,
            hasObservedAnyData: true
        )
        XCTAssertEqual(phase, .revalidating)
    }

    // MARK: - UX projections

    func test_isBlockingSpinnerNeeded_onlyForInitial() {
        XCTAssertTrue(ConversationLoadingPhase.loadingInitial.isBlockingSpinnerNeeded)
        XCTAssertFalse(ConversationLoadingPhase.loadingOlder.isBlockingSpinnerNeeded,
                       "Older pagination must NOT block — list is already painted")
        XCTAssertFalse(ConversationLoadingPhase.loadingNewer.isBlockingSpinnerNeeded)
        XCTAssertFalse(ConversationLoadingPhase.revalidating.isBlockingSpinnerNeeded,
                       "Revalidating is silent by contract (stale-while-revalidate)")
        XCTAssertFalse(ConversationLoadingPhase.idle.isBlockingSpinnerNeeded)
        XCTAssertFalse(ConversationLoadingPhase.loaded.isBlockingSpinnerNeeded)
    }

    func test_isPaginating_onlyForOlderAndNewer() {
        XCTAssertFalse(ConversationLoadingPhase.idle.isPaginating)
        XCTAssertFalse(ConversationLoadingPhase.loadingInitial.isPaginating)
        XCTAssertTrue(ConversationLoadingPhase.loadingOlder.isPaginating)
        XCTAssertTrue(ConversationLoadingPhase.loadingNewer.isPaginating)
        XCTAssertFalse(ConversationLoadingPhase.revalidating.isPaginating)
        XCTAssertFalse(ConversationLoadingPhase.loaded.isPaginating)
    }

    // MARK: - Equatable contract for view diffing

    func test_equality_sameValueAreEqual() {
        XCTAssertEqual(ConversationLoadingPhase.loadingOlder, .loadingOlder)
        XCTAssertEqual(ConversationLoadingPhase.idle, .idle)
    }

    func test_equality_differentValuesAreNotEqual() {
        XCTAssertNotEqual(ConversationLoadingPhase.idle, .loaded)
        XCTAssertNotEqual(ConversationLoadingPhase.loadingOlder, .loadingNewer)
    }
}
