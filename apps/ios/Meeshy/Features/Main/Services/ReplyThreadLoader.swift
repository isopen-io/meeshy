import Foundation
import MeeshySDK

/// Loads the parent message + its replies for a thread overlay. Used by
/// `ReplyThreadOverlay` when the parent message isn't in the in-memory
/// `allMessages` index (e.g. user deep-links into a reply chain from a
/// notification).
///
/// Extracted from `ReplyThreadOverlay.loadThreadFromAPI` (F1 follow-up
/// to PR #280) so the view body stays free of `APIClient.shared` calls
/// and so the network path is unit-testable through `MockAPIClientForApp`.
///
/// Returns the already-converted domain models (`MeeshyMessage`) — the
/// view-layer caller never sees the raw `APIMessage` shape and never has
/// to know about `AuthManager.shared` for the conversion.
@MainActor
final class ReplyThreadLoader {

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    func loadThread(
        conversationId: String,
        parentMessageId: String,
        currentUserId: String,
        currentUsername: String?
    ) async throws -> ThreadResult {
        let response: APIResponse<ThreadData> = try await api.request(
            endpoint: "/conversations/\(conversationId)/threads/\(parentMessageId)"
        )
        let parent = response.data.parent.toMessage(
            currentUserId: currentUserId,
            currentUsername: currentUsername
        )
        let replies = response.data.replies.map {
            $0.toMessage(currentUserId: currentUserId, currentUsername: currentUsername)
        }
        return ThreadResult(parent: parent, replies: replies)
    }

    // `MeeshyMessage` is not `Equatable` (see CoreModels.swift), so we
    // don't promise it here either — callers in the overlay and the test
    // suite access `.parent` / `.replies` field-by-field rather than
    // comparing the whole struct.
    struct ThreadResult {
        let parent: MeeshyMessage
        let replies: [MeeshyMessage]
    }
}
