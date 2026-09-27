import Foundation
import MeeshySDK
@testable import Meeshy

@MainActor
final class MockCallFeedbackService: CallFeedbackServiceProviding {
    nonisolated deinit {}

    var lastPromptDateResult: Date?

    private(set) var recordPromptCallCount = 0
    private(set) var lastRecordedPromptDate: Date?
    private(set) var submitCallCount = 0
    private(set) var submitted: [CallQualityFeedback] = []

    func lastPromptDate() -> Date? {
        lastPromptDateResult
    }

    func recordPrompt(at date: Date) {
        recordPromptCallCount += 1
        lastRecordedPromptDate = date
        lastPromptDateResult = date
    }

    func submit(_ feedback: CallQualityFeedback) {
        submitCallCount += 1
        submitted.append(feedback)
    }

    func reset() {
        lastPromptDateResult = nil
        recordPromptCallCount = 0
        lastRecordedPromptDate = nil
        submitCallCount = 0
        submitted = []
    }
}
