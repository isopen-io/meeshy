import Foundation

extension PostService {
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: nil)
    }

    /// Seule surcharge qui envoie réellement `location` au gateway — le
    /// commentaire d'un post ET la réponse/commentaire d'une story empruntent
    /// tous deux `POST /posts/:id/comments` (une story est un post de type
    /// STORY), donc ce chemin unique couvre les deux surfaces.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?, location: SharedPlace?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: location, clientMutationId: nil)
    }

    /// Surcharge porteuse du cmid : envoyé en header `X-Client-Mutation-Id`,
    /// le gateway dédoublonne les rejeux (MutationLog) et ré-émet le cmid dans
    /// l'écho `comment:added` pour la réconciliation optimiste de l'émetteur.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?, location: SharedPlace?, clientMutationId: String?) async throws -> APIPostComment {
        try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags,
                             attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                             originalLanguage: originalLanguage, location: location,
                             clientMutationId: clientMutationId, quotedPostMediaId: nil)
    }

    /// **Le SEUL site qui compose la requête de création d'un commentaire.**
    /// Les trois surcharges au-dessus y mènent — un second site qui composerait
    /// son propre `CreateCommentRequest` retiendrait en silence chaque champ
    /// ajouté ici, ce qui est arrivé ligne pour ligne aux médias joints.
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                           attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                           originalLanguage: String?, location: SharedPlace?, clientMutationId: String?,
                           quotedPostMediaId: String?) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags,
                                        attachmentIds: attachmentIds, mobileTranscription: mobileTranscription,
                                        originalLanguage: originalLanguage, location: location,
                                        quotedPostMediaId: quotedPostMediaId)
        guard let clientMutationId, !clientMutationId.isEmpty else {
            let response: APIResponse<APIPostComment> = try await api.post(PostsEndpoint.byPostIdComments(postId: postId), body: body)
            return response.data
        }
        let response: APIResponse<APIPostComment> = try await api.requestWithHeaders(
            PostsEndpoint.byPostIdComments(postId: postId),
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    func addComment(
        postId: String,
        content: String,
        parentId: String? = nil,
        effectFlags: Int? = nil,
        clientMutationId: String? = nil
    ) async throws -> APIPostComment {
        guard let clientMutationId, !clientMutationId.isEmpty else {
            return try await addComment(
                postId: postId,
                content: content,
                parentId: parentId,
                effectFlags: effectFlags,
                attachmentIds: nil,
                mobileTranscription: nil,
                originalLanguage: nil
            )
        }
        let body = CreateCommentRequest(content: content, parentId: parentId, effectFlags: effectFlags)
        let response: APIResponse<APIPostComment> = try await api.requestWithHeaders(
            PostsEndpoint.byPostIdComments(postId: postId),
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?, originalLanguage: String?) async throws -> APIPostComment {
        let body = UpdateCommentRequest(content: content, effectFlags: effectFlags, originalLanguage: originalLanguage)
        let response: APIResponse<APIPostComment> = try await api.patch(
            PostsEndpoint.byPostIdCommentsByCommentId(postId: postId, commentId: commentId), body: body
        )
        return response.data
    }

    /// Traduction d'un commentaire à la demande vers UNE langue (Prisme —
    /// « Exploration ») : fire-and-forget, le résultat arrive via l'événement
    /// socket `comment:translation-updated`. Miroir de `requestTranslation`
    /// (posts) ; `force` rejoue une langue déjà traduite.
    public func requestCommentTranslation(postId: String, commentId: String, targetLanguage: String, force: Bool = false) async throws {
        struct TranslateCommentRequest: Encodable {
            let targetLanguage: String
            let force: Bool?
        }
        // Payload `{ requested: Bool, targetLanguage: String }` — typé a
        // minima : le résultat utile arrive par le socket
        // comment:translation-updated, pas par cette réponse.
        struct TranslateCommentResponse: Decodable {
            let requested: Bool?
        }
        let body = TranslateCommentRequest(targetLanguage: targetLanguage, force: force ? true : nil)
        let _: APIResponse<TranslateCommentResponse> = try await api.post(
            PostsEndpoint.byPostIdCommentsByCommentIdTranslate(postId: postId, commentId: commentId), body: body
        )
    }

    public func likeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            PostsEndpoint.byPostIdCommentsByCommentIdLike(postId: postId, commentId: commentId), method: "POST"
        )
    }

    public func getComments(postId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(PostsEndpoint.byPostIdComments(postId: postId), cursor: cursor, limit: limit)
    }

    public func unlikeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(PostsEndpoint.byPostIdCommentsByCommentIdLike(postId: postId, commentId: commentId))
    }

    public func deleteComment(postId: String, commentId: String) async throws {
        try await deleteComment(postId: postId, commentId: commentId, reason: nil)
    }

    public func deleteComment(postId: String, commentId: String, reason: String?) async throws {
        try await api.deleteRemovingContent(PostsEndpoint.byPostIdCommentsByCommentId(postId: postId, commentId: commentId), reason: reason)
    }

    // MARK: - Comment Replies

    public func getCommentReplies(postId: String, commentId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        try await api.paginatedRequest(PostsEndpoint.byPostIdCommentsByCommentIdReplies(postId: postId, commentId: commentId), cursor: cursor, limit: limit)
    }
}
