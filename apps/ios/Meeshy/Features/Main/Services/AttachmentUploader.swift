import Foundation
import MeeshySDK
import UIKit

protocol AttachmentUploading: Sendable {
    /// Synchronous online-only upload of a JPEG avatar.
    /// Compression to maxSizeKB is applied internally.
    func uploadAvatar(_ data: Data) async throws -> URL
}

final class AttachmentUploader: AttachmentUploading {
    static let shared = AttachmentUploader()

    private let apiClient: APIClient
    private let urlSession: URLSession
    private let maxSizeKB: Int

    init(
        apiClient: APIClient = .shared,
        urlSession: URLSession = .shared,
        maxSizeKB: Int = 500
    ) {
        self.apiClient = apiClient
        self.urlSession = urlSession
        self.maxSizeKB = maxSizeKB
    }

    func uploadAvatar(_ data: Data) async throws -> URL {
        let compressed = Self.compress(data, maxSizeKB: maxSizeKB)
        let boundary = UUID().uuidString

        guard let url = URL(string: "\(apiClient.baseURL)/attachments/upload") else {
            throw APIError.invalidURL
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"avatar.jpg\"\r\n"
            .data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(compressed)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)",
                         forHTTPHeaderField: "Content-Type")
        if let token = apiClient.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body

        let (responseData, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else {
            throw APIError.serverError(
                (response as? HTTPURLResponse)?.statusCode ?? 500,
                "Echec de l'envoi de l'avatar"
            )
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: responseData)
        guard let urlString = decoded.data.attachments.first?.fileUrl,
              let avatarURL = URL(string: urlString) else {
            throw APIError.noData
        }
        return avatarURL
    }

    /// JPEG re-encode until `.count <= maxSizeKB * 1024`.
    /// Public static so test code can verify the size invariant
    /// without touching the network path.
    static func compress(_ data: Data, maxSizeKB: Int) -> Data {
        guard let image = UIImage(data: data) else { return data }
        var compression: CGFloat = 0.8
        var compressed = image.jpegData(compressionQuality: compression) ?? data
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = image.jpegData(compressionQuality: compression) ?? data
        }
        return compressed
    }

    private struct UploadResponse: Decodable {
        let success: Bool
        let data: UploadData
    }
    private struct UploadData: Decodable { let attachments: [UploadedAttachment] }
    // The gateway's `messageAttachmentSchema` (packages/shared/types/api-schemas.ts)
    // serializes the accessible URL under `fileUrl` — there is no `url` key on
    // this response. Requiring `url` here made `JSONDecoder().decode(UploadResponse.self, ...)`
    // above throw `DecodingError.keyNotFound` on every single avatar upload,
    // before the code ever reached the `.noData` guard below.
    private struct UploadedAttachment: Decodable { let fileUrl: String }
}
