import XCTest
import MeeshySDK
@testable import Meeshy

/// `ProfilePostsCounts` — calcul pur des compteurs du bandeau de stats en tête
/// de l'onglet Postes d'un profil (phase 1, dérivée des postes chargés).
@MainActor
final class ProfilePostsCountsTests: XCTestCase {

    private func post(_ id: String, _ type: String) -> FeedPost {
        FeedPost(id: id, author: "alice", authorId: "a1", type: type, content: "c")
    }

    func test_compute_countsEachTypeSeparately() {
        let posts = [
            post("1", "POST"),
            post("2", "REEL"),
            post("3", "STORY"),
            post("4", "POST"),
            post("5", "REEL")
        ]

        let counts = ProfilePostsCounts.compute(from: posts, hasMore: false)

        XCTAssertEqual(counts.posts, 2)
        XCTAssertEqual(counts.reels, 2)
        XCTAssertEqual(counts.stories, 1)
    }

    func test_compute_emptyPosts_allZero() {
        let counts = ProfilePostsCounts.compute(from: [], hasMore: false)
        XCTAssertEqual(counts, ProfilePostsCounts(posts: 0, reels: 0, stories: 0, isApproximate: false))
    }

    func test_compute_hasMore_marksApproximate() {
        XCTAssertTrue(ProfilePostsCounts.compute(from: [post("1", "POST")], hasMore: true).isApproximate)
        XCTAssertFalse(ProfilePostsCounts.compute(from: [post("1", "POST")], hasMore: false).isApproximate)
    }

    func test_displayValue_appendsPlusOnlyWhenApproximateAndPositive() {
        XCTAssertEqual(ProfilePostsCounts.displayValue(5, isApproximate: true), "5+")
        XCTAssertEqual(ProfilePostsCounts.displayValue(5, isApproximate: false), "5")
        XCTAssertEqual(ProfilePostsCounts.displayValue(0, isApproximate: true), "0")
        XCTAssertEqual(ProfilePostsCounts.displayValue(0, isApproximate: false), "0")
    }
}
