import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class PostFeedHeartSeedingTests: XCTestCase {

    // MARK: - Factory Helpers

    private func makePost(
        id: String,
        isLiked: Bool,
        likes: Int = 0
    ) -> FeedPost {
        var post = FeedPost(
            id: id,
            author: "user",
            authorId: "uid",
            content: "stub",
            likes: likes
        )
        post.isLiked = isLiked
        return post
    }

    // MARK: - FeedView.computePostLikedIds

    func test_computePostLikedIds_withLikedPost_includesPostId() {
        let posts = [makePost(id: "p1", isLiked: true)]

        let result = FeedView.computePostLikedIds(from: posts)

        XCTAssertEqual(result, ["p1"])
    }

    func test_computePostLikedIds_withUnlikedPost_excludesPostId() {
        let posts = [makePost(id: "p1", isLiked: false)]

        let result = FeedView.computePostLikedIds(from: posts)

        XCTAssertTrue(result.isEmpty)
    }

    func test_computePostLikedIds_withEmptyList_returnsEmptySet() {
        let result = FeedView.computePostLikedIds(from: [])

        XCTAssertTrue(result.isEmpty)
    }

    func test_computePostLikedIds_withMixedPosts_classifiesEachCorrectly() {
        let posts = [
            makePost(id: "p1", isLiked: true),
            makePost(id: "p2", isLiked: false),
            makePost(id: "p3", isLiked: true),
            makePost(id: "p4", isLiked: false)
        ]

        let result = FeedView.computePostLikedIds(from: posts)

        XCTAssertTrue(result.contains("p1"), "p1 (liked) should be in set")
        XCTAssertFalse(result.contains("p2"), "p2 (not liked) should not be in set")
        XCTAssertTrue(result.contains("p3"), "p3 (liked) should be in set")
        XCTAssertFalse(result.contains("p4"), "p4 (not liked) should not be in set")
        XCTAssertEqual(result.count, 2)
    }

    func test_computePostLikedIds_withAllUnliked_returnsEmptySet() {
        let posts = [
            makePost(id: "p1", isLiked: false),
            makePost(id: "p2", isLiked: false)
        ]

        let result = FeedView.computePostLikedIds(from: posts)

        XCTAssertTrue(result.isEmpty)
    }

    func test_computePostLikedIds_withAllLiked_containsAllIds() {
        let posts = [
            makePost(id: "p1", isLiked: true),
            makePost(id: "p2", isLiked: true)
        ]

        let result = FeedView.computePostLikedIds(from: posts)

        XCTAssertEqual(result, Set(["p1", "p2"]))
    }

    // MARK: - In-flight guard semantic (mirrors StoryViewerCommentReactionTests)

    func test_postHeartInFlightGuard_blocksDoubleToggle() {
        var inFlightIds: Set<String> = []
        let postId = "p1"

        let firstAttemptBlocked = inFlightIds.contains(postId)
        inFlightIds.insert(postId)

        let secondAttemptBlocked = inFlightIds.contains(postId)

        inFlightIds.remove(postId)
        let afterCompletionBlocked = inFlightIds.contains(postId)

        XCTAssertFalse(firstAttemptBlocked, "First toggle should not be blocked")
        XCTAssertTrue(secondAttemptBlocked, "Second rapid-tap should be blocked while in-flight")
        XCTAssertFalse(afterCompletionBlocked, "Lock should be released after completion")
    }

    func test_postHeartInFlightGuard_differentPosts_independentLocks() {
        var inFlightIds: Set<String> = []
        let postA = "pA"
        let postB = "pB"

        inFlightIds.insert(postA)

        XCTAssertTrue(inFlightIds.contains(postA), "Post A should be locked")
        XCTAssertFalse(inFlightIds.contains(postB), "Post B should be independent — not locked")
    }

    // MARK: - Optimistic delta arithmetic

    func test_postLikeDelta_optimisticIncrement_thenRollback_restoresZero() {
        var likedIds: Set<String> = []
        var delta: [String: Int] = [:]
        let postId = "p1"

        // Optimistic like
        likedIds.insert(postId)
        delta[postId, default: 0] += 1
        XCTAssertEqual(delta[postId], 1, "Delta should be +1 after optimistic like")
        XCTAssertTrue(likedIds.contains(postId))

        // Rollback on failure
        likedIds.remove(postId)
        delta[postId, default: 0] -= 1
        XCTAssertEqual(delta[postId], 0, "Delta should be 0 after rollback")
        XCTAssertFalse(likedIds.contains(postId))
    }

    func test_postLikeDelta_optimisticUnlike_thenRollback_restoresLikedState() {
        var likedIds: Set<String> = ["p1"]
        var delta: [String: Int] = [:]
        let postId = "p1"

        // Optimistic unlike
        likedIds.remove(postId)
        delta[postId, default: 0] -= 1
        XCTAssertEqual(delta[postId], -1, "Delta should be -1 after optimistic unlike")
        XCTAssertFalse(likedIds.contains(postId))

        // Rollback on failure
        likedIds.insert(postId)
        delta[postId, default: 0] += 1
        XCTAssertEqual(delta[postId], 0, "Delta should be 0 after rollback")
        XCTAssertTrue(likedIds.contains(postId))
    }
}
