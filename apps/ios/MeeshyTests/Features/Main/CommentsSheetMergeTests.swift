import XCTest
@testable import Meeshy
import MeeshySDK

/// `CommentsSheetView.loadFullCommentsIfNeeded()` fetches the full comment
/// page on sheet mount and used to do `liveComments = fetched` — a plain
/// overwrite. That silently discarded any comment that landed in
/// `liveComments` while the GET was in flight: the composer's own optimistic
/// `tmp_` insert, or a `comment:added` socket echo from another user. These
/// tests pin the merge behavior of `CommentsSheetView.mergeFetchedComments`,
/// the pure helper that replaced the overwrite.
@MainActor
final class CommentsSheetMergeTests: XCTestCase {

    // MARK: - Factory Helpers

    private func makeComment(
        id: String,
        authorId: String = "author",
        content: String = "hello",
        likes: Int = 0
    ) -> FeedComment {
        FeedComment(id: id, author: "Author", authorId: authorId, content: content, likes: likes)
    }

    // MARK: - No local-only rows

    func test_mergeFetchedComments_noLocalOnly_returnsFetchedComments() {
        let fetched = [makeComment(id: "c1"), makeComment(id: "c2")]

        let merged = CommentsSheetView.mergeFetchedComments(current: fetched, fetched: fetched)

        XCTAssertEqual(merged.map(\.id), ["c1", "c2"])
    }

    func test_mergeFetchedComments_emptyCurrent_returnsFetchedAsIs() {
        let fetched = [makeComment(id: "c1"), makeComment(id: "c2")]

        let merged = CommentsSheetView.mergeFetchedComments(current: [], fetched: fetched)

        XCTAssertEqual(merged.map(\.id), ["c1", "c2"])
    }

    func test_mergeFetchedComments_emptyFetched_returnsCurrentAsIs() {
        let current = [makeComment(id: "tmp_1")]

        let merged = CommentsSheetView.mergeFetchedComments(current: current, fetched: [])

        XCTAssertEqual(merged.map(\.id), ["tmp_1"])
    }

    // MARK: - Preserves in-flight optimistic / socket-reconciled rows

    func test_mergeFetchedComments_preservesOptimisticTmpEntry_notInFetchedSnapshot() {
        // The user just hit send: the composer inserted a `tmp_` row at index
        // 0 while `loadFullCommentsIfNeeded`'s GET (started earlier, before
        // the send) is still resolving.
        let current = [makeComment(id: "tmp_abc", content: "just sent"), makeComment(id: "c1")]
        let fetched = [makeComment(id: "c1")] // server snapshot predates the send

        let merged = CommentsSheetView.mergeFetchedComments(current: current, fetched: fetched)

        XCTAssertTrue(merged.contains { $0.id == "tmp_abc" }, "optimistic send must survive the merge")
        XCTAssertEqual(merged.map(\.id), ["tmp_abc", "c1"], "local-only row stays ahead of the server snapshot")
    }

    func test_mergeFetchedComments_preservesSocketReconciledEntry_notInFetchedSnapshot() {
        // Another user's comment arrived via `comment:added` after the GET
        // request left the client but before its response landed.
        let current = [makeComment(id: "server_new"), makeComment(id: "c1")]
        let fetched = [makeComment(id: "c1")]

        let merged = CommentsSheetView.mergeFetchedComments(current: current, fetched: fetched)

        XCTAssertTrue(merged.contains { $0.id == "server_new" }, "socket-added comment must survive the merge")
        XCTAssertEqual(merged.count, 2)
    }

    // MARK: - Fetched wins on id collision (server-authoritative)

    func test_mergeFetchedComments_fetchedTakesPrecedence_whenIdMatches() {
        // Same id in both — e.g. the socket already reconciled the row by the
        // time the GET resolves too. The server-authoritative copy (possibly
        // with an updated like count) must win, with no duplicate.
        let current = [makeComment(id: "c1", likes: 0)]
        let fetched = [makeComment(id: "c1", likes: 5)]

        let merged = CommentsSheetView.mergeFetchedComments(current: current, fetched: fetched)

        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.likes, 5)
    }

    func test_mergeFetchedComments_mixedLocalOnlyAndOverlap_dedupesAndPreservesLocalOnly() {
        let current = [
            makeComment(id: "tmp_new", content: "brand new"),
            makeComment(id: "c1", likes: 0),
            makeComment(id: "c2")
        ]
        let fetched = [makeComment(id: "c1", likes: 3), makeComment(id: "c3")]

        let merged = CommentsSheetView.mergeFetchedComments(current: current, fetched: fetched)

        // local-only (tmp_new, c2) stay, server rows (c1 updated, c3 new) form the base.
        XCTAssertEqual(merged.map(\.id), ["tmp_new", "c2", "c1", "c3"])
        XCTAssertEqual(merged.first(where: { $0.id == "c1" })?.likes, 3, "server copy of c1 wins over the stale local one")
    }
}
