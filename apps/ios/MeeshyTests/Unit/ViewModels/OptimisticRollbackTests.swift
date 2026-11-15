import XCTest
@testable import Meeshy

final class OptimisticRollbackTests: XCTestCase {

    private struct Row: Identifiable, Equatable { let id: String }

    /// Le refus de la file arrive après des commentaires reçus par socket et un
    /// autre envoi optimiste : seule la ligne refusée part.
    func test_withdrawing_keepsWhatArrivedDuringTheWait() {
        let now = [Row(id: "socket-1"), Row(id: "cmid-other"), Row(id: "cmid-refused"), Row(id: "old")]
        let result = OptimisticRollback.withdrawing("cmid-refused", from: now)
        XCTAssertEqual(result.items.map(\.id), ["socket-1", "cmid-other", "old"])
        XCTAssertTrue(result.removed)
    }

    func test_withdrawing_anAbsentRow_changesNothing() {
        let now = [Row(id: "a")]
        let result = OptimisticRollback.withdrawing("gone", from: now)
        XCTAssertEqual(result.items, now)
        XCTAssertFalse(result.removed)
        XCTAssertEqual(OptimisticRollback.decremented(3, removed: false), 3)
        XCTAssertEqual(OptimisticRollback.decremented(0, removed: true), 0)
    }

    /// La suppression échoue : le post revient à sa place, et ce qui a été
    /// chargé pendant l'appel reste.
    func test_restoring_putsTheRowBack_withoutLosingNewRows() {
        let now = [Row(id: "fresh"), Row(id: "a"), Row(id: "c")]
        let restored = OptimisticRollback.restoring(Row(id: "b"), at: 2, into: now)
        XCTAssertEqual(restored.map(\.id), ["fresh", "a", "b", "c"])
        XCTAssertEqual(OptimisticRollback.restoring(Row(id: "a"), at: 0, into: now), now, "déjà revenu : rien de doublé")
        XCTAssertEqual(OptimisticRollback.restoring(Row(id: "z"), at: 99, into: now).last?.id, "z")
    }

    func test_noRollback_restoresAPreAwaitSnapshotAnymore() throws {
        let units = [
            "Meeshy/Features/Main/ViewModels/PostDetailViewModel+CommentSend.swift",
            "Meeshy/Features/Main/ViewModels/FeedViewModel+PendingPublication.swift",
            "Meeshy/Features/Main/ViewModels/ReelsViewModel.swift",
        ]
        for path in units {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            for pattern in ["comments = snapshot", "posts = snapshot", "reels = snapshot", "comments = snapshotComments", "= snapshotReplies"] {
                XCTAssertFalse(code.contains(pattern), "\(path) : « \(pattern) » efface ce qui est arrivé pendant l'attente")
            }
        }
        let feed = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/FeedViewModel.swift"))
        XCTAssertFalse(feed.contains("posts = snapshot"))
        XCTAssertFalse(feed.contains("comments = snapshot"))
    }
}
