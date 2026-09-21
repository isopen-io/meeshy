import XCTest
@testable import Meeshy

/// I3 (#7349) — la fiche « Vu par » (`MessageViewsDetailView`) ne rechargeait
/// le statut de lecture qu'à `.onAppear` (`guard readStatusData == nil` dans
/// `loadReadStatus()`) : une fois ouverte, elle restait figée même si
/// `read-status:updated` annonçait un changement pendant qu'elle était
/// visible — il fallait la refermer puis la rouvrir pour la voir bouger.
///
/// `shouldFetchReadStatus` extrait la garde pure qui décide si un appel
/// (initial ou déclenché par le socket) doit vraiment repartir au réseau —
/// testable sans monter la vue SwiftUI, comme `positionFraction` l'est déjà
/// pour ce même fichier (`MessageViewsDetailMediaConsumptionTests`).
@MainActor
final class MessageViewsDetailReadStatusRefreshTests: XCTestCase {

    func test_shouldFetchReadStatus_noExistingData_fetches() {
        XCTAssertTrue(
            MessageViewsDetailView.shouldFetchReadStatus(
                hasExisting: false, isLoading: false, force: false, hasServerId: true
            )
        )
    }

    func test_shouldFetchReadStatus_existingData_noForce_doesNotRefetch() {
        XCTAssertFalse(
            MessageViewsDetailView.shouldFetchReadStatus(
                hasExisting: true, isLoading: false, force: false, hasServerId: true
            ),
            "onAppear must not re-issue a request once data is already loaded"
        )
    }

    /// The fix: a `read-status:updated` for this conversation must be able to
    /// force a refetch even though `readStatusData` is already populated —
    /// otherwise the sheet never updates once open.
    func test_shouldFetchReadStatus_existingData_forced_refetches() {
        XCTAssertTrue(
            MessageViewsDetailView.shouldFetchReadStatus(
                hasExisting: true, isLoading: false, force: true, hasServerId: true
            ),
            "a live read-status update must be able to refresh an already-open sheet"
        )
    }

    func test_shouldFetchReadStatus_alreadyLoading_neverRefetches() {
        XCTAssertFalse(
            MessageViewsDetailView.shouldFetchReadStatus(
                hasExisting: false, isLoading: true, force: true, hasServerId: true
            ),
            "a request already in flight must not be duplicated, forced or not"
        )
    }

    func test_shouldFetchReadStatus_noServerId_neverFetches() {
        XCTAssertFalse(
            MessageViewsDetailView.shouldFetchReadStatus(
                hasExisting: false, isLoading: false, force: true, hasServerId: false
            ),
            "an optimistic message with no server id has no /read-status route to call"
        )
    }
}
