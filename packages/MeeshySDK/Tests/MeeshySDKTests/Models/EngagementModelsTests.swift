import XCTest
@testable import MeeshySDK

final class EngagementModelsTests: XCTestCase {
    private func makeSession() -> EngagementSession {
        EngagementSession(
            sessionId: "11111111-1111-1111-1111-111111111111",
            userId: "u1",
            postId: "p1",
            contentType: .reel,
            surface: .reels,
            startedAt: Date(timeIntervalSince1970: 1_700_000_000),
            dwellMs: 4200,
            watchMs: 3900,
            mediaDurationMs: 15000,
            completed: false,
            truncated: false,
            consent: "granted",
            actions: [EngagementAction(type: .replayed, atMs: 1200)],
            watchSamples: [WatchSample(positionMs: 0, atMs: 0), WatchSample(positionMs: 3900, atMs: 3900)]
        )
    }

    func test_session_roundTrips_throughCodable_withSortedKeys() throws {
        let session = makeSession()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]   // iOS 26 key-order non-déterministe
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(session)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(EngagementSession.self, from: data)

        XCTAssertEqual(decoded, session)
    }

    func test_contentType_usesUppercaseRawValues() {
        XCTAssertEqual(EngagementSession.ContentType.post.rawValue, "POST")
        XCTAssertEqual(EngagementSession.ContentType.reel.rawValue, "REEL")
        XCTAssertEqual(EngagementSession.ContentType.story.rawValue, "STORY")
        XCTAssertEqual(EngagementSession.ContentType.status.rawValue, "STATUS")
    }

    func test_session_isSendableValueType_equatableByValue() {
        XCTAssertEqual(makeSession(), makeSession())
    }
}
