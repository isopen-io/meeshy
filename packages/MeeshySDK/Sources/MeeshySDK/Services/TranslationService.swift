import Foundation

public protocol TranslationServiceProviding: Sendable {
    func translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
        messageId: String?
    ) async throws -> TranslateResponse
}

public final class TranslationService: TranslationServiceProviding, @unchecked Sendable {
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
        let response: APIResponse<TranslateResponse> = try await api.post(TranslateBlockingEndpoint.root, body: body)
        return response.data
    }
}
