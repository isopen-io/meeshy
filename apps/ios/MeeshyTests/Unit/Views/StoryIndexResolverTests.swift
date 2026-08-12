import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryIndexResolverTests: XCTestCase {

    private func makeGroup(storyIDs: [String]) -> StoryGroup {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let stories = storyIDs.enumerated().map { offset, id in
            StoryItem(id: id, createdAt: base.addingTimeInterval(TimeInterval(offset)))
        }
        return StoryGroup(id: "user-1", username: "alice", avatarColor: "FF2E63", stories: stories)
    }

    func test_index_postIdInMiddleOfGroup_returnsItsIndex() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "s2", in: group, fallback: 0)

        XCTAssertEqual(result, 1)
    }

    func test_index_postIdResolvingToIndexZero_returnsZeroExplicitly() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "s1", in: group, fallback: 7)

        XCTAssertEqual(result, 0, "index 0 must be honored explicitly, not confused with the fallback")
    }

    func test_index_postIdAbsentFromGroup_returnsFallback() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: "unknown", in: group, fallback: 2)

        XCTAssertEqual(result, 2)
    }

    func test_index_postIdNil_returnsFallback() {
        let group = makeGroup(storyIDs: ["s1", "s2", "s3"])

        let result = StoryIndexResolver.index(forPostId: nil, in: group, fallback: 1)

        XCTAssertEqual(result, 1)
    }

    func test_index_singleStoryGroup_matchingPostId_returnsZero() {
        let group = makeGroup(storyIDs: ["only-story"])

        let result = StoryIndexResolver.index(forPostId: "only-story", in: group, fallback: 5)

        XCTAssertEqual(result, 0)
    }
}
