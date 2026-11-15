import XCTest
@testable import Meeshy
import MeeshySDK

/// Où mène le bouton de la carte (#9379) : chaque action de la loi a une destination.
@MainActor
final class GameGuideTargetTests: XCTestCase {

    func test_everyActionOfTheLaw_hasADestination() {
        for action in GuideAction.allCases {
            _ = GameGuideTarget.target(for: action)
        }
        // 19 depuis 17b1041c2c : `regain-levels` et `relight-badge` ont quitté la loi partagée avec les étincelles.
        XCTAssertEqual(GuideAction.allCases.count, 19)
    }

    func test_thePhotoActionsOpenThePhoto() {
        XCTAssertEqual(GameGuideTarget.target(for: .takeStartPhoto), .photo)
        XCTAssertEqual(GameGuideTarget.target(for: .takePhoto), .photo)
    }

    func test_startingTheGameLeavesForTheConversations() {
        XCTAssertEqual(GameGuideTarget.target(for: .startGame), .conversations)
        XCTAssertEqual(GameGuideTarget.target(for: .earnFirstPoints), .conversations)
    }


    func test_theOtherActionsScrollToTheCardTheyName() {
        XCTAssertEqual(GameGuideTarget.target(for: .seeLevel), .scroll(.level))
        XCTAssertEqual(GameGuideTarget.target(for: .seeMissions), .scroll(.missions))
        XCTAssertEqual(GameGuideTarget.target(for: .seeFlame), .scroll(.flame))
        XCTAssertEqual(GameGuideTarget.target(for: .seeRank), .scroll(.rank))
        XCTAssertEqual(GameGuideTarget.target(for: .seeMeeshes), .scroll(.treasury))
        XCTAssertEqual(GameGuideTarget.target(for: .mintOrClimb), .scroll(.mint))
        XCTAssertEqual(GameGuideTarget.target(for: .relightFlame), .scroll(.flamePanel))
    }
}
