import Foundation

public final class AttachmentService {
    public static let shared = AttachmentService()
    private init() {}
    private var api: APIClient { APIClient.shared }

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
