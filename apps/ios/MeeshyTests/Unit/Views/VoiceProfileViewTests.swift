import XCTest
@testable import Meeshy

@MainActor
final class VoiceProfileViewTests: XCTestCase {

    func test_wizardView_initializes_withAccentColor() {
        let view = VoiceProfileWizardView(accentColor: "#6366F1")
        XCTAssertNotNil(view)
    }

    func test_manageView_initializes_withAccentColor() {
        let view = VoiceProfileManageView(accentColor: "#6366F1")
        XCTAssertNotNil(view)
    }

    func test_wizardView_initializes_withArbitraryColor() {
        let view = VoiceProfileWizardView(accentColor: "#FF0000")
        XCTAssertNotNil(view)
    }

    func test_manageView_initializes_withArbitraryColor() {
        let view = VoiceProfileManageView(accentColor: "#FF0000")
        XCTAssertNotNil(view)
    }
}
