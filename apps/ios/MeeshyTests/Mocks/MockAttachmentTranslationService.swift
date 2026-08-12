import Foundation
import MeeshySDK
import XCTest

final class MockAttachmentTranslationService: AttachmentTranslationProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var translateResult: Result<AttachmentTranslateResponse, Error> = .success(
        AttachmentTranslateResponse(status: "completed", jobId: nil, translations: [])
    )

    /// Artificial delay before `translateResult` resolves — lets a test
    /// observe in-flight state before the call completes, without a flaky
    /// race against an instant mock response.
    var translateDelayNanoseconds: UInt64 = 0

    // MARK: - Call Tracking

    var translateCallCount = 0
    var lastAttachmentId: String?
    var lastTargetLanguages: [String]?
    var lastSourceLanguage: String?
    var lastGenerateVoiceClone: Bool?

    // MARK: - Protocol Conformance

    nonisolated func translate(
        attachmentId: String,
        targetLanguages: [String],
        sourceLanguage: String?,
        generateVoiceClone: Bool?
    ) async throws -> AttachmentTranslateResponse {
        await MainActor.run {
            translateCallCount += 1
            lastAttachmentId = attachmentId
            lastTargetLanguages = targetLanguages
            lastSourceLanguage = sourceLanguage
            lastGenerateVoiceClone = generateVoiceClone
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
        lastAttachmentId = nil
        lastTargetLanguages = nil
        lastSourceLanguage = nil
        lastGenerateVoiceClone = nil
        translateDelayNanoseconds = 0
    }
}
