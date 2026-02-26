import Foundation

public final class TranslationService {
    public static let shared = TranslationService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func translate(text: String, sourceLanguage: String, targetLanguage: String) async throws -> TranslateResponse {
        let body = TranslateRequest(text: text, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage)
        let response: APIResponse<TranslateResponse> = try await api.post(endpoint: "/translate-blocking", body: body)
        return response.data
    }
}
