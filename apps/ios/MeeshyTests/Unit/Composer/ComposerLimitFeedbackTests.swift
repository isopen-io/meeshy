import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class ComposerLimitFeedbackTests: XCTestCase {

    func test_message_everyLimit_namesItsBound() {
        for limit in StoryComposerLimit.allCases {
            XCTAssertTrue(ComposerLimitFeedback.message(for: limit).contains("\(limit.value)"),
                          "\(limit) : le message doit chiffrer la borne atteinte")
        }
    }

    func test_attach_aRefusedSticker_reachesTheViewModelHook() {
        let composer = StoryComposerViewModel()
        ComposerLimitFeedback.attach(to: composer)
        XCTAssertNotNil(composer.onLimitReached)
    }

    func test_composerRetouchTextRule_capIsTheSharedTextLimit() {
        XCTAssertEqual(ComposerRetouchTextRule.cap, StoryComposerLimits.maxTextsPerScene)
    }
}
