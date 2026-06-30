import Foundation
import MeeshySDK

/// Loads the paginated reply list under a parent message. Used by
/// `ThreadView` (full-screen thread reader).
///
/// F2 follow-up to PR #280. Kept as a small, single-purpose service
/// rather than a `ThreadService` god-object so each call site stays
/// trivially injectable for tests. If more thread endpoints ever land
/// (e.g. unread-only replies, replies since timestamp), promote into a
/// single `ThreadService` in one focused PR.
@MainActor
final class ThreadRepliesLoader {

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Returns the converted replies. Sends `replyToId=<parentId>` so
    /// the gateway filters server-side; client-side filtering is not
    /// performed because the parent thread can be arbitrarily large.
    /// `limit` defaults to 50 (matches the previous behaviour pinned by
    /// the existing UX — one screen of replies on first open).
    func loadReplies(
        conversationId: String,
        parentMessageId: String,
        currentUserId: String,
        currentUsername: String?,
        limit: Int = 50
    ) async throws -> [MeeshyMessage] {
        let response: OffsetPaginatedAPIResponse<[APIMessage]> = try await api.request(
            endpoint: "/conversations/\(conversationId)/messages",
            method: "GET",
            body: nil,
            queryItems: [
                URLQueryItem(name: "replyToId", value: parentMessageId),
                URLQueryItem(name: "limit", value: String(limit)),
            ]
        )
        return response.data.map {
            $0.toMessage(currentUserId: currentUserId, currentUsername: currentUsername)
        }
    }
}
