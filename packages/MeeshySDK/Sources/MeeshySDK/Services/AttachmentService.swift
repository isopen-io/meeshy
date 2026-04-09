import Foundation

public final class AttachmentService: @unchecked Sendable {
    public static let shared = AttachmentService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func requestTranscription(attachmentId: String) async throws {
        let _: SimpleAPIResponse = try await api.request(
            endpoint: "/attachments/\(attachmentId)/transcribe",
            method: "POST"
        )
    }

    public func getStatusDetails(attachmentId: String) async throws -> [AttachmentStatusUser] {
        let response: OffsetPaginatedAPIResponse<[AttachmentStatusUser]> = try await api.request(
            endpoint: "/attachments/\(attachmentId)/status-details"
        )
        return response.data
    }
}
