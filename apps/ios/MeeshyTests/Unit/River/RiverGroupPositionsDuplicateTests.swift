import XCTest
@testable import Meeshy

/// Un même message reçu deux fois (écho socket puis REST) donnait deux bulles au même identifiant :
/// `groupPositions` trappait (`uniqueKeysWithValues`) quand `contents`, juste en dessous, tolérait le doublon.
final class RiverGroupPositionsDuplicateTests: XCTestCase {

    private func bubble(_ id: String, head: Bool) -> RiverLaneResolver.RiverBubble {
        RiverLaneResolver.RiverBubble(messageId: id, laneId: "u", laneIndex: 0, rank: 0, createdAtMs: 0,
                                      isViewer: false, replyToMessageId: nil, isFirstInGroup: head, isSystem: false)
    }

    func test_aDuplicatedMessageId_doesNotTrap_andKeepsTheFirstPosition() {
        let positions = RiverConversationMapping.groupPositions(bubbles: [
            bubble("m1", head: true), bubble("m2", head: false), bubble("m1", head: true),
        ])
        XCTAssertEqual(positions["m1"], .head)
        XCTAssertEqual(positions["m2"], .tail)
    }
}
