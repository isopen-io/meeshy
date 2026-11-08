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

    func test_attached_aRefusedSticker_reachesTheViewModelHook() {
        let composer = ComposerLimitFeedback.attached(to: StoryComposerViewModel())
        XCTAssertNotNil(composer.onLimitReached)
    }

    func test_attached_typingPastTheCapOnTheScene_saysTheBound() {
        ComposerLimitFeedback.attached(to: StoryComposerViewModel())
        ComposerLimitCapsule.shared.retire()

        NotificationCenter.default.post(name: StoryInlineTextLengthGate.limitReached, object: nil)

        XCTAssertEqual(ComposerLimitCapsule.shared.message,
                       ComposerLimitFeedback.message(for: .textLength),
                       "la limite se dit par la capsule posée sur la scène (#17111), plus par un toast")
    }

    func test_composerRetouchTextRule_capIsTheSharedTextLimit() {
        XCTAssertEqual(ComposerRetouchTextRule.cap, StoryComposerLimits.maxTextsPerScene)
    }
}
