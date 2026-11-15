import Foundation
import MeeshySDK
import os

/// **Les bascules d'un post rejouées depuis la file durable** : « J'aime » et
/// « Enregistrer ». Toutes deux portent l'état VOULU (`liked`, `bookmarked`),
/// jamais un basculement : rejouées, elles ne peuvent que poser cet état, et un
/// 404 (« le post n'existe plus ») n'a plus rien à poser.
extension OutboxDispatcher {

    func dispatchPostEngagement(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .toggleBookmarkPost:
            try await dispatchToggleBookmarkPost(record)
        default:
            try await dispatchToggleLikePost(record)
        }
    }

    /// `POST|DELETE /posts/:id/like` — gateway wraps through
    /// `withMutationLog`. Both directions are naturally idempotent at
    /// the storage layer, so a 404 ("post gone") is treated as success.
    private func dispatchToggleLikePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleLikePostPayload.self)
        let method = payload.liked ? "POST" : "DELETE"
        let body = try ToggleLikePostBody.encoded(for: payload)
        do {
            let _: APIResponse<DiscardedResponseBody> = try await APIClient.shared.requestWithHeaders(
                PostsEndpoint.byPostIdLike(postId: payload.postId),
                method: method,
                body: body,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("toggleLikePost \(payload.liked, privacy: .public) dispatched for \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("toggleLikePost 404 for \(payload.postId, privacy: .public) — post gone, accepting as success")
        }
    }

    /// `POST|DELETE /posts/:id/bookmark` (#15997). La passerelle n'a pas
    /// besoin du journal de mutations pour dédoublonner un rejeu : la ligne
    /// `PostBookmark` est unique par (post, lecteur), un second POST tombe sur
    /// P2002 et ne recompte rien, un second DELETE ne trouve rien à retirer.
    /// L'en-tête `X-Client-Mutation-Id` voyage quand même, comme pour le like
    /// d'un commentaire. Un refus (403 d'audience, 404 d'un post parti) n'est
    /// PAS avalé : le favori demandé n'existe pas, la carte doit le dire.
    private func dispatchToggleBookmarkPost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleBookmarkPostPayload.self)
        let _: APIResponse<DiscardedResponseBody> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.byPostIdBookmark(postId: payload.postId),
            method: payload.bookmarked ? "POST" : "DELETE",
            body: nil,
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("toggleBookmarkPost \(payload.bookmarked, privacy: .public) dispatched for \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }
}
