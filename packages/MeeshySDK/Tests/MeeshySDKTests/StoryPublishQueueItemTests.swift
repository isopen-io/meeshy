import XCTest
@testable import MeeshySDK

final class StoryPublishQueueItemTests: XCTestCase {
    func test_codableRoundTrip_preservesVisibilityUserIds() throws {
        let item = StoryPublishQueueItem(
            visibility: "ONLY",
            slidesPayload: Data([1, 2, 3]),
            visibilityUserIds: ["a", "b"]
        )
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: data)
        XCTAssertEqual(decoded.visibilityUserIds, ["a", "b"])
    }

    func test_decodeLegacyItem_withoutVisibilityUserIds_defaultsNil() throws {
        // A row persisted before this field existed must still decode.
        let legacy = #"{"id":"1","tempStoryId":"pending_1","visibility":"PUBLIC","slidesPayload":"AQID","createdAt":0,"retryCount":0}"#
            .data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: legacy)
        XCTAssertNil(decoded.visibilityUserIds)
        XCTAssertEqual(decoded.visibility, "PUBLIC")
    }
}
