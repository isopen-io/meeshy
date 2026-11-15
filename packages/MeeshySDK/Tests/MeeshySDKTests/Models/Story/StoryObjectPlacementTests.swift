import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Un objet neuf se pose au centre de la scène** (#18719). Les sites qui
/// posent sont éprouvés côté composer (`StoryComposerNewObjectCentreTests`).
final class StoryObjectPlacementTests: XCTestCase {

    func test_center_isTheMiddleOfTheScene() {
        XCTAssertEqual(StoryObjectPlacement.center, CGPoint(x: 0.5, y: 0.5))
    }
}
