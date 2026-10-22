import Foundation

extension PostService {
    public func like(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(PostsEndpoint.byPostIdLike(postId: postId), method: "POST")
        emitInteraction(.react, postId: postId)
    }

    public func unlike(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(PostsEndpoint.byPostIdLike(postId: postId))
        emitInteraction(.unreact, postId: postId)
    }

    public func bookmark(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(PostsEndpoint.byPostIdBookmark(postId: postId), method: "POST")
        emitInteraction(.save, postId: postId)
    }

    public func repost(
        postId: String,
        targetType: PostType? = nil,
        content: String? = nil,
        isQuote: Bool = false,
        visibility: String? = nil
    ) async throws -> APIPost {
        let body = RepostRequest(
            content: content,
            isQuote: isQuote,
            targetType: targetType?.rawValue,
            visibility: visibility
        )
        let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.byPostIdRepost(postId: postId), body: body)
        return response.data
    }

    /// Surcharge porteuse du jeton : envoyé en header `X-Client-Mutation-Id`,
    /// le gateway dédoublonne les rejeux (`withMutationOutcome`,
    /// `replayCost: 'diverges'`) et rend 410 quand le repost a été supprimé
    /// entre l'envoi et le rejeu.
    ///
    /// **AUCUNE valeur par défaut sur ces six paramètres**, contrairement à la
    /// surcharge ci-dessus qui les défaute tous : deux surcharges défautées se
    /// disputeraient chaque appel partiel (`repost(postId:)` deviendrait
    /// ambigu). L'unique appelant applicatif — `RepostPublisher` — les passe
    /// tous, explicitement.
    public func repost(
        postId: String,
        targetType: PostType?,
        content: String?,
        isQuote: Bool,
        visibility: String?,
        clientMutationId: String?
    ) async throws -> APIPost {
        let body = RepostRequest(
            content: content,
            isQuote: isQuote,
            targetType: targetType?.rawValue,
            visibility: visibility
        )
        guard let clientMutationId, !clientMutationId.isEmpty else {
            let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.byPostIdRepost(postId: postId), body: body)
            return response.data
        }
        let response: APIResponse<APIPost> = try await api.requestWithHeaders(
            PostsEndpoint.byPostIdRepost(postId: postId),
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func share(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(PostsEndpoint.byPostIdShare(postId: postId), method: "POST")
    }

    /// Records a share and (optionally) mints a TrackingLink. When
    /// `generateLink` is `true` the response carries an absolute
    /// `meeshy.me/l/<token>` URL the caller can hand to a system share
    /// sheet — the gateway owns the link creation, the client only
    /// surfaces the result. Counter-only callers can keep using
    /// `share(postId:)`.
    public func share(
        postId: String,
        platform: String? = nil,
        generateLink: Bool = false
    ) async throws -> PostShareResult {
        var body: [String: Any] = [:]
        if let platform { body["platform"] = platform }
        if generateLink { body["generateLink"] = true }
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let response: APIResponse<PostShareResult> = try await api.request(
            PostsEndpoint.byPostIdShare(postId: postId),
            method: "POST",
            body: bodyData
        )
        emitInteraction(.share, postId: postId, destination: SocialInteractionEvents.shareDestination(platform: platform))
        return response.data
    }

    public func removeBookmark(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(PostsEndpoint.byPostIdBookmark(postId: postId))
        emitInteraction(.unsave, postId: postId)
    }

    public func pinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.request(PostsEndpoint.byPostIdPin(postId: postId), method: "POST")
    }

    public func unpinPost(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(PostsEndpoint.byPostIdPin(postId: postId))
    }
}
