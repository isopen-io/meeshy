import Foundation

public final class TranslationService: @unchecked Sendable {
    public static let shared = TranslationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
        messageId: String? = nil
    ) async throws -> TranslateResponse {
        let body = TranslateRequest(
            text: text, sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage, messageId: messageId
        )
        let response: APIResponse<TranslateResponse> = try await api.post(endpoint: "/translate-blocking", body: body)
        return response.data
    }
}
