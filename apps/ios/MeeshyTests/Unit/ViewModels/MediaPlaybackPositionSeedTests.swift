import XCTest
@testable import Meeshy

/// Pure decision backing `ConversationViewModel.seedMediaConsumption`'s new
/// resume-store seeding: the server-synced position must never clobber an
/// existing LOCAL resume position (further-along, or intentionally
/// abandoned — the server can't tell the difference from a stale value).
final class MediaPlaybackPositionSeedTests: XCTestCase {

    func test_noLocalPosition_seedsFromServerPosition() {
        let seconds = ConversationViewModel.seedResumePositionSeconds(
            positionMs: 4_500, hasLocalPosition: false
        )
        XCTAssertEqual(seconds, 4.5)
    }

    func test_existingLocalPosition_neverSeeds() {
        let seconds = ConversationViewModel.seedResumePositionSeconds(
            positionMs: 4_500, hasLocalPosition: true
        )
        XCTAssertNil(seconds)
    }

    func test_noServerPosition_seedsNothing() {
        let seconds = ConversationViewModel.seedResumePositionSeconds(
            positionMs: nil, hasLocalPosition: false
        )
        XCTAssertNil(seconds)
    }

    func test_zeroServerPosition_seedsNothing() {
        let seconds = ConversationViewModel.seedResumePositionSeconds(
            positionMs: 0, hasLocalPosition: false
        )
        XCTAssertNil(seconds)
    }
}
