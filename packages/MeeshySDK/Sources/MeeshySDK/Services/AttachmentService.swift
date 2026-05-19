import Foundation

public final class AttachmentService: @unchecked Sendable {
    public static let shared = AttachmentService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func requestTranscription(attachmentId: String, force: Bool = false) async throws {
        let bodyData = try JSONEncoder().encode(TranscribeRequest(force: force))
        let _: SimpleAPIResponse = try await api.request(
            endpoint: "/attachments/\(attachmentId)/transcribe",
            method: "POST",
            body: bodyData
        )
    }

    public func getStatusDetails(attachmentId: String) async throws -> [AttachmentStatusUser] {
        let response: OffsetPaginatedAPIResponse<[AttachmentStatusUser]> = try await api.request(
            endpoint: "/attachments/\(attachmentId)/status-details"
        )
        return response.data
    }

    public func delete(attachmentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/attachments/\(attachmentId)"
        )
    }

    // MARK: - translate

    /// Calls `POST /attachments/:id/translate` (synchronous — result is in the
    /// HTTP response body, not delivered asynchronously via Socket.IO).
    ///
    /// On HTTP 403 with a consent payload the method throws
    /// `AttachmentConsentError` instead of the generic `MeeshyError.forbidden`.
    public func translate(
        attachmentId: String,
        targetLanguages: [String],
        sourceLanguage: String? = nil,
        generateVoiceClone: Bool? = nil
    ) async throws -> AttachmentTranslateResponse {
        let request = AttachmentTranslateRequest(
            targetLanguages: targetLanguages,
            sourceLanguage: sourceLanguage,
            generateVoiceClone: generateVoiceClone
        )
        do {
            let response: APIResponse<AttachmentTranslateResponse> = try await api.post(
                endpoint: "/attachments/\(attachmentId)/translate",
                body: request
            )
            return response.data
        } catch let meeshyError as MeeshyError {
            if let consent = AttachmentService.consentError(from: meeshyError) { throw consent }
            throw meeshyError
        }
    }

    static func consentError(from meeshyError: MeeshyError) -> AttachmentConsentError? {
        guard case .forbidden(_, let body) = meeshyError,
              let data = body,
              let decoded = try? JSONDecoder().decode(AttachmentConsentErrorBody.self, from: data),
              let consents = decoded.requiredConsents else { return nil }
        return AttachmentConsentError(
            code: decoded.error,
            message: decoded.message ?? "Consent required",
            requiredConsents: consents
        )
    }
}
