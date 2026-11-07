import Foundation

/// Corps de `PATCH /posts/:postId/comment-settings` (#16541).
struct PostCommentSettingsBody: Encodable, Sendable {
    let commentsDisabled: Bool
}

/// Accusé de `PATCH /posts/:postId/comment-settings` : l'état que la
/// passerelle a ÉCRIT, qui fait foi sur l'état demandé.
struct PostCommentSettingsReceipt: Decodable, Sendable {
    let postId: String?
    let commentsDisabled: Bool
}

public extension PostServiceProviding {
    func setCommentsDisabled(postId: String, disabled: Bool) async throws -> Bool {
        throw APIError.serverError(501, "setCommentsDisabled not implemented by \(Self.self)")
    }
}

extension PostService {
    public func setCommentsDisabled(postId: String, disabled: Bool) async throws -> Bool {
        let response: APIResponse<PostCommentSettingsReceipt> = try await api.patch(
            PostsEndpoint.byPostIdCommentSettings(postId: postId),
            body: PostCommentSettingsBody(commentsDisabled: disabled)
        )
        return response.data.commentsDisabled
    }
}
