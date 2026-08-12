import Foundation
import MeeshySDK
import XCTest

final class MockTranslationService: TranslationServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var translateResult: Result<TranslateResponse, Error> = .success(
        JSONStub.decode("""
        {"translated_text":"stub","source_language":"en"}
        """)
    )

    /// Artificial delay before `translateResult` resolves — lets a test
    /// observe in-flight state before the call completes, without a flaky
    /// race against an instant mock response.
    var translateDelayNanoseconds: UInt64 = 0

    // MARK: - Call Tracking

    var translateCallCount = 0
    var lastText: String?
    var lastSourceLanguage: String?
    var lastTargetLanguage: String?
    var lastMessageId: String?

    // MARK: - Protocol Conformance

    nonisolated func translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
        messageId: String?
    ) async throws -> TranslateResponse {
        await MainActor.run {
            translateCallCount += 1
            lastText = text
            lastSourceLanguage = sourceLanguage
            lastTargetLanguage = targetLanguage
            lastMessageId = messageId
        }
        let delay = await MainActor.run { translateDelayNanoseconds }
        if delay > 0 {
            try? await Task.sleep(nanoseconds: delay)
        }
        return try await MainActor.run { translateResult }.get()
    }

    // MARK: - Reset

    func reset() {
        translateCallCount = 0
        lastText = nil
        lastSourceLanguage = nil
        lastTargetLanguage = nil
        lastMessageId = nil
        translateDelayNanoseconds = 0
    }
}
