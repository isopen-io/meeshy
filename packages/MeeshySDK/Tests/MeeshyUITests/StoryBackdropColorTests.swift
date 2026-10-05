import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Le sol du composer se peint de la teinte du Cadre : seul le flou n'en a pas.
final class StoryBackdropColorTests: XCTestCase {

    func test_solidColor_flou_nAPasDeTeinte() {
        XCTAssertNil(StoryBackdrop.blur.solidColor)
    }

    func test_solidColor_fondsUnis_ontLeurTeinte() {
        for fond in StoryBackdrop.allCases where fond != .blur {
            XCTAssertNotNil(fond.solidColor, "\(fond)")
        }
    }
}
