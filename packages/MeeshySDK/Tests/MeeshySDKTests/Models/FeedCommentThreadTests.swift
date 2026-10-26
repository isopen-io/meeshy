import XCTest
@testable import MeeshySDK

/// One comment thread (roots + loaded replies) for posts, stories and reels:
/// the in-place edit, the removal and the arrival of a translation follow ONE
/// rule, whatever surface shows the thread (#13133).
final class FeedCommentThreadTests: XCTestCase {

    private func comment(_ id: String, parentId: String? = nil, content: String = "x",
                         replies: Int = 0, originalLanguage: String? = nil) -> FeedComment {
        FeedComment(id: id, author: "bob", content: content, replies: replies,
                    parentId: parentId, originalLanguage: originalLanguage)
    }

    func test_replacing_aRoot_replacesItInPlace() {
        let thread = FeedCommentThread(roots: [comment("a"), comment("b")])

        let result = thread.replacing(comment("b", content: "edited"))

        XCTAssertEqual(result.roots.map(\.id), ["a", "b"])
        XCTAssertEqual(result.roots[1].content, "edited")
    }

    func test_replacing_aReply_replacesItInItsThread() {
        let thread = FeedCommentThread(roots: [comment("root")],
                                       replies: ["root": [comment("r1", parentId: "root"), comment("r2", parentId: "root")]])

        let result = thread.replacing(comment("r2", parentId: "root", content: "edited"))

        XCTAssertEqual(result.replies["root"]?.map(\.content), ["x", "edited"])
        XCTAssertEqual(result.roots.map(\.id), ["root"])
    }

    func test_replacing_anUnknownComment_neverInserts() {
        let thread = FeedCommentThread(roots: [comment("a")], replies: ["a": [comment("r1", parentId: "a")]])

        let result = thread.replacing(comment("ghost", parentId: "a"))

        XCTAssertEqual(result.roots.map(\.id), ["a"])
        XCTAssertEqual(result.replies["a"]?.map(\.id), ["r1"])
    }

    func test_removing_aRoot_takesItsRepliesAndCountsThem() {
        let root = comment("root", replies: 2)
        let thread = FeedCommentThread(roots: [root, comment("b")],
                                       replies: ["root": [comment("r1", parentId: "root"), comment("r2", parentId: "root")]])

        let removal = thread.removing(root)

        XCTAssertEqual(removal.thread.roots.map(\.id), ["b"])
        XCTAssertNil(removal.thread.replies["root"])
        XCTAssertEqual(removal.removedCount, 3)
    }

    func test_removing_aReply_decrementsItsParentOnce() {
        let r1 = comment("r1", parentId: "root")
        let thread = FeedCommentThread(roots: [comment("root", replies: 2)],
                                       replies: ["root": [r1, comment("r2", parentId: "root")]])

        let removal = thread.removing(r1)

        XCTAssertEqual(removal.thread.replies["root"]?.map(\.id), ["r2"])
        XCTAssertEqual(removal.thread.roots.first?.replies, 1)
        XCTAssertEqual(removal.removedCount, 1)
    }

    func test_removing_aReply_neverDrivesItsParentBelowZero() {
        let r1 = comment("r1", parentId: "root")
        let thread = FeedCommentThread(roots: [comment("root", replies: 0)], replies: ["root": [r1]])

        XCTAssertEqual(thread.removing(r1).thread.roots.first?.replies, 0)
    }

    func test_mergingTranslation_onARoot_followsThePrismRank() {
        let thread = FeedCommentThread(roots: [comment("c1", content: "Salut", originalLanguage: "fr")])

        let english = thread.mergingTranslation("Hi", commentId: "c1", language: "en", preferredLanguages: ["en", "fr"])
        let french = thread.mergingTranslation("Hi", commentId: "c1", language: "en", preferredLanguages: ["fr", "en"])

        XCTAssertEqual(english.roots.first?.translatedContent, "Hi")
        XCTAssertNil(french.roots.first?.translatedContent, "the original language at rank 1 wins")
    }

    func test_mergingTranslation_onAReply_reachesTheReply() {
        let thread = FeedCommentThread(roots: [comment("root")],
                                       replies: ["root": [comment("r1", parentId: "root", content: "Salut", originalLanguage: "fr")]])

        let result = thread.mergingTranslation("Hi", commentId: "r1", language: "en", preferredLanguages: ["en"])

        XCTAssertEqual(result.replies["root"]?.first?.translatedContent, "Hi")
    }

    func test_mergingTranslation_ofANonPreferredLanguage_isKeptForALanguageChange() {
        let thread = FeedCommentThread(roots: [comment("c1", content: "Salut", originalLanguage: "fr")])

        let result = thread.mergingTranslation("Hola", commentId: "c1", language: "es", preferredLanguages: ["en"])

        XCTAssertNil(result.roots.first?.translatedContent)
        XCTAssertEqual(result.roots.first?.resolved(preferredLanguages: ["es"]).displayContent, "Hola")
    }

    func test_mergingTranslation_ofAnUnknownComment_changesNothing() {
        let thread = FeedCommentThread(roots: [comment("c1", content: "Salut", originalLanguage: "fr")])

        let result = thread.mergingTranslation("Hi", commentId: "ghost", language: "en", preferredLanguages: ["en"])

        XCTAssertNil(result.roots.first?.translatedContent)
        XCTAssertNil(result.roots.first?.translations)
    }

    // MARK: - Withdrawing a refused optimistic comment

    func test_withdrawingOptimistic_aRoot_removesOnlyIt_andSaysSo() {
        let thread = FeedCommentThread(roots: [comment("kept"), comment("cmid_1"), comment("socket")])

        let result = thread.withdrawingOptimistic("cmid_1", parentId: nil)

        XCTAssertEqual(result.thread.roots.map(\.id), ["kept", "socket"])
        XCTAssertTrue(result.removed)
    }

    func test_withdrawingOptimistic_aReply_leavesItsThreadAndDecrementsItsParent() {
        let thread = FeedCommentThread(roots: [comment("p", replies: 2)],
                                       replies: ["p": [comment("r1", parentId: "p"), comment("cmid_r", parentId: "p")]])

        let result = thread.withdrawingOptimistic("cmid_r", parentId: "p")

        XCTAssertEqual(result.thread.replies["p"]?.map(\.id), ["r1"])
        XCTAssertEqual(result.thread.roots.first?.replies, 1)
        XCTAssertTrue(result.removed)
    }

    func test_withdrawingOptimistic_aReplyWhoseThreadWasRefetched_stillUndoesTheParentBump() {
        let thread = FeedCommentThread(roots: [comment("p", replies: 1)])

        let result = thread.withdrawingOptimistic("cmid_r", parentId: "p")

        XCTAssertEqual(result.thread.roots.first?.replies, 0)
        XCTAssertNil(result.thread.replies["p"])
        XCTAssertFalse(result.removed)
    }

    func test_withdrawingOptimistic_neverTakesAParentBelowZero() {
        let thread = FeedCommentThread(roots: [comment("p", replies: 0)])

        XCTAssertEqual(thread.withdrawingOptimistic("cmid_r", parentId: "p").thread.roots.first?.replies, 0)
    }

    func test_withdrawingOptimistic_anUnknownRoot_changesNothing() {
        let thread = FeedCommentThread(roots: [comment("kept")])

        let result = thread.withdrawingOptimistic("gone", parentId: nil)

        XCTAssertEqual(result.thread.roots.map(\.id), ["kept"])
        XCTAssertFalse(result.removed)
    }
}
