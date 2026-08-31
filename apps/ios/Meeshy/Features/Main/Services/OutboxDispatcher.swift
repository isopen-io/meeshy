import Foundation
import Combine
import MeeshySDK
import os

// MARK: - OutboxDispatcher

/// Real dispatcher that drives outbox rows directly to the network layer.
///
/// Each row is decoded from its `kind`-typed payload and sent via the
/// matching `MessageService` / `ReactionService` call. On success the
/// flusher deletes the row; on failure it schedules a backoff retry.
/// Retries therefore live entirely in the outbox table — no re-enqueueing
/// to the in-memory queues.
struct OutboxDispatcher: OutboxDispatching {

    private let logger = Logger(subsystem: "com.meeshy.ios", category: "outbox-dispatcher")

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func dispatch(_ record: OutboxRecord) async throws {
        switch record.kind {
        case .sendMessage:
            try await dispatchSendMessage(record)

        case .editMessage:
            try await dispatchEditMessage(record)

        case .deleteMessage:
            try await dispatchDeleteMessage(record)

        case .sendReaction:
            try await dispatchSendReaction(record)

        case .blockUser:
            try await dispatchBlockUser(record)

        case .unblockUser:
            try await dispatchUnblockUser(record)

        case .sendFriendRequest:
            try await dispatchSendFriendRequest(record)

        case .respondFriendRequest:
            try await dispatchRespondFriendRequest(record)

        case .updateProfile:
            try await dispatchUpdateProfile(record)

        case .markAsRead:
            try await dispatchMarkAsRead(record)

        case .markStoryViewed:
            try await dispatchMarkStoryViewed(record)

        case .reportAttachmentStatus:
            try await dispatchReportAttachmentStatus(record)

        case .createConversation:
            try await dispatchCreateConversation(record)

        case .updateConversation:
            try await dispatchUpdateConversation(record)

        case .updateSettings:
            try await dispatchUpdateSettings(record)

        case .createPost:
            try await dispatchCreatePost(record)

        case .toggleLikePost:
            try await dispatchToggleLikePost(record)

        case .createComment:
            try await dispatchCreateComment(record)

        case .deleteComment:
            try await dispatchDeleteComment(record)

        case .toggleLikeComment:
            try await dispatchToggleLikeComment(record)

        case .repostPost:
            try await dispatchRepostPost(record)

        case .publishStory, .repostStory:
            // Story publish/repost remains routed through `StoryOfflineQueue`
            // until Tier C merges the two persistence stores. A row landing
            // here is a programming error — surface it loudly instead of
            // silently retrying forever.
            logger.error("OutboxDispatcher received \(record.kind.rawValue, privacy: .public) but story publish lives in StoryOfflineQueue (record \(record.id, privacy: .public))")
            throw NSError(
                domain: "OutboxDispatcher",
                code: 501,
                userInfo: [
                    NSLocalizedDescriptionKey: "Outbox kind '\(record.kind.rawValue)' is handled by StoryOfflineQueue, not OutboxDispatcher"
                ]
            )
        }
    }

    // MARK: - Social mutations

    /// Decoded the typed payload from `record.payload`. Treats a decode
    /// failure as permanent so the flusher escalates to `.exhausted` after
    /// the next attempt instead of looping forever on a corrupt row.
    ///
    /// Throws a typed `MeeshyError.server(statusCode: 400, _)` — not a raw
    /// `NSError` — so `OutboxFlusher.isPermanentServerRejection` (which
    /// pattern-matches on `MeeshyError`) recognizes a corrupt local payload
    /// as permanent and dead-letters it on the first attempt, the same as
    /// any other 4xx rejection, instead of burning the full retry budget
    /// (~1 min of exponential backoff) on a row that can never succeed.
    private func decodePayload<P: Decodable>(_ record: OutboxRecord, as type: P.Type) throws -> P {
        do {
            return try decoder.decode(P.self, from: record.payload)
        } catch {
            logger.error("Failed to decode \(String(describing: P.self), privacy: .public) for outbox \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw MeeshyError.server(
                statusCode: 400,
                message: "Corrupt \(record.kind.rawValue) payload for \(record.id)"
            )
        }
    }

    /// 4xx responses from the gateway are NOT transient — replaying the
    /// same request will produce the same error. We rethrow as-is so the
    /// flusher escalates to `.exhausted` once `maxAttempts` is reached.
    /// 5xx and network errors are also rethrown but those are inherently
    /// transient and the flusher's exponential backoff will retry.
    private func dispatchBlockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: BlockUserPayload.self)
        // `PUT /directory/blocks/{id}` (#4164) — et c'est CE chemin-ci qui rend
        // la migration urgente : le rejeu hors ligne rejoue des mutations
        // enregistrées avant une mise à jour, et l'ancienne route rendait `409`
        // sur un blocage DÉJÀ appliqué. Le dispatcher traitait donc un succès
        // comme un échec 4xx non transitoire, et l'enregistrement mourait en
        // `.exhausted` alors que le serveur avait écrit ce qu'il fallait.
        let _: APIResponse<BlockActionResponse> = try await APIClient.shared.requestWithHeaders(
            DirectoryEndpoint.blocksByUserId(userId: payload.targetUserId),
            method: "PUT",
            body: try JSONEncoder().encode([String: String]()),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("blockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `BlockActionResponse`, comme son jumeau `dispatchBlockUser` — et
    /// **c'est tout le correctif** du rapport porteur 2026-08-28 (« impossible
    /// de débloquer les contacts bloqués »).
    ///
    /// Ce site attendait `[String: Bool]`. Le gateway répond
    /// `{ "message": "User unblocked" }`, ce que son propre schéma déclare :
    /// décoder cette charge en dictionnaire de `Bool` LÈVE. Le dispatcher
    /// jetait donc TOUJOURS, l'enregistrement d'outbox n'était jamais acquitté,
    /// et l'écran affichait « Impossible de débloquer » — sur un serveur qui
    /// avait pourtant écrit le déblocage.
    ///
    /// Un type de réponse trop STRICT transforme un succès serveur en échec
    /// client : ni erreur réseau, ni refus explicite, juste une divergence
    /// entre ce qui EST et ce qui se voit. Les deux jumeaux frappent la même
    /// route sous deux verbes et rendent la même forme — leur asymétrie était
    /// le défaut, et `OutboxDispatcherUnblockDecodingTests` interdit son retour.
    private func dispatchUnblockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UnblockUserPayload.self)
        let _: APIResponse<BlockActionResponse> = try await APIClient.shared.requestWithHeaders(
            DirectoryEndpoint.blocksByUserId(userId: payload.targetUserId),
            method: "DELETE",
            body: nil,
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("unblockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// POST /friend-requests — gateway expects `{ receiverId, message? }`.
    /// The iOS payload uses `targetUserId` to match the consumer-facing
    /// naming ; we translate at the wire boundary.
    private func dispatchSendFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: SendFriendRequestPayload.self)
        struct SendFriendRequestBody: Encodable {
            let receiverId: String
        }
        let body = SendFriendRequestBody(receiverId: payload.targetUserId)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            // `/directory/friend-requests` (#4162) — et c'est CE chemin-ci qui
            // rend la migration urgente : le rejeu hors ligne rejoue des
            // mutations enregistrées AVANT la mise à jour, et une bascule
            // partielle les enverrait sur une famille éteinte.
            DirectoryEndpoint.friendRequests,
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("sendFriendRequest dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `PATCH /directory/friend-requests/:id` — le corps porte une ACTION,
    /// jamais un statut (#4162).
    ///
    /// L'ADRESSE et le CORPS changent ENSEMBLE. Migrer l'une sans l'autre
    /// enverrait `{ status }` à une route qui déclare `action` en `required` :
    /// AJV refuserait en 400, un code que le dispatcher traite en 4xx NON
    /// transitoire — l'enregistrement mourrait en `.exhausted`, et la réponse
    /// à une demande d'amitié faite hors ligne serait perdue en silence.
    private func dispatchRespondFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: RespondFriendRequestPayload.self)
        struct RespondBody: Encodable {
            let action: String
        }
        let status = payload.action == .accept ? "accept" : "reject"
        let body = RespondBody(action: status)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            DirectoryEndpoint.friendRequestsById(id: payload.friendRequestId),
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("respondFriendRequest dispatched for \(payload.friendRequestId, privacy: .public) status=\(status, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// PATCH /users/me — only sends fields that are non-nil. The gateway's
    /// `updateUserProfileSchema` (packages/shared/utils/validation.ts) is
    /// `.strict()` and has no `avatar` (nor `avatarUrl`) property, so an
    /// `avatar` key in this body 400s the WHOLE request every single time —
    /// silently blocking displayName/bio right alongside it. Avatar changes
    /// are dispatched separately through the dedicated `PATCH /users/me/avatar`
    /// endpoint (`updateAvatarSchema`, `{ avatar: string }`), matching the
    /// online path (`UserService.updateAvatar`).
    private func dispatchUpdateProfile(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateProfilePayload.self)

        if let avatarUrl = payload.avatarUrl {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                UsersEndpoint.meAvatar,
                method: "PATCH",
                body: try JSONEncoder().encode(UpdateProfileAvatarBody(avatar: avatarUrl)),
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("updateProfile avatar dispatched cmid=\(payload.clientMutationId, privacy: .public)")
        }

        guard payload.displayName != nil || payload.bio != nil else {
            logger.info("updateProfile dispatched (avatar-only) cmid=\(payload.clientMutationId, privacy: .public)")
            return
        }

        let body = UpdateProfileFieldsBody(
            displayName: payload.displayName,
            bio: payload.bio
        )
        // The /users/me response wraps the updated user under `data.user`,
        // which doesn't match `APIResponse<MeeshyUser>`. We don't need the
        // result (caller refreshes via AuthManager.checkExistingSession()
        // after enqueue), so decode the envelope shape loosely as a dictionary.
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            UsersEndpoint.me,
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("updateProfile dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }

    // MARK: - Conversation & content mutations

    /// `POST /conversations/:id/mark-read` — the gateway treats read
    /// receipts as monotonic + idempotent at the storage layer (a higher
    /// cursor wins, a lower one is a no-op), so the route does NOT wrap
    /// through `MutationLog`. We still dispatch via the outbox so an
    /// offline mark survives an app kill ; we just don't forward the
    /// `X-Client-Mutation-Id` header (no server-side dedup to feed).
    /// A 404 means the conversation was deleted while the row was pending
    /// — swallow as success so the flusher removes the row.
    /// R6 — `POST /posts/:id/view`, même contrat que le chemin direct
    /// historique (`StoryService.markViewed`) : le gateway renvoie
    /// `{ viewed: true }` (Bool) et un P2002 (déjà vu) est un no-op serveur.
    /// Une story supprimée/expirée (404) rend le « vu » obsolète — succès.
    private func dispatchMarkStoryViewed(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: MarkStoryViewedPayload.self)
        do {
            let _: APIResponse<[String: Bool]> = try await APIClient.shared.request(
                PostsEndpoint.byPostIdView(postId: payload.storyId),
                method: "POST",
                body: nil,
                queryItems: nil
            )
            logger.info("markStoryViewed dispatched story=\(payload.storyId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("markStoryViewed 404 story=\(payload.storyId, privacy: .public) — story gone, accepting as success")
        }
    }

    /// Point 7 — rejoue un rapport de consommation média.
    ///
    /// Un attachement supprimé entre-temps (404) rend le rapport sans objet :
    /// on l'accepte comme un succès pour que la ligne quitte la file, sinon
    /// elle serait rejouée jusqu'à épuisement des tentatives pour un média qui
    /// n'existe plus.
    private func dispatchReportAttachmentStatus(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ReportAttachmentStatusPayload.self)
        let body = AttachmentStatusBody(
            action: payload.action,
            playPositionMs: payload.playPositionMs,
            durationMs: payload.durationMs,
            complete: payload.complete,
            wasZoomed: payload.wasZoomed,
            stretches: payload.stretches,
            language: payload.language
        )
        do {
            let _: APIResponse<[String: String]> = try await APIClient.shared.post(
                AttachmentsEndpoint.byAttachmentIdStatus(attachmentId: payload.attachmentId),
                body: body
            )
            logger.info("reportAttachmentStatus dispatched att=\(payload.attachmentId, privacy: .public) action=\(payload.action, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("reportAttachmentStatus 404 att=\(payload.attachmentId, privacy: .public) — attachement disparu, accepté comme succès")
        }
    }

    private func dispatchMarkAsRead(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: MarkAsReadPayload.self)
        do {
            // Le corps porte les messages RÉELLEMENT affichés. Sans lui, le
            // gateway retombe sur son chemin par fenêtre temporelle, qui
            // déclare lus des messages jamais montrés. Un payload legacy
            // (`messageIds == nil`) continue de poster sans corps : c'est le
            // seul comportement sûr pour un enregistrement non informé.
            let reported = payload.messageIds.map(MarkAsReadBody.cap) ?? []
            // Le rattrapage voyage même quand le plafond a rogné le lot : c'est
            // une borne de curseur, pas un identifiant à figer, et la perdre
            // laisserait le badge plein précisément dans le cas — deux cents
            // messages d'un coup — où il gêne le plus.
            let body = (reported.isEmpty && payload.caughtUpToMessageId == nil)
                ? nil
                : try JSONEncoder().encode(
                    MarkAsReadBody(
                        messageIds: reported,
                        language: payload.language,
                        messageLanguages: MarkAsReadBody.scopedLanguages(
                            payload.messageLanguages, to: reported
                        ),
                        caughtUpToMessageId: payload.caughtUpToMessageId
                    )
                )

            // Decode the envelope loosely as a dictionary (same pattern as
            // `dispatchUpdateProfile` / `dispatchCreateConversation` above).
            // The mark-read response `data` carries a string `message` field,
            // so the previous `[String: Int]` decode threw a DecodingError on
            // an otherwise-successful 2xx — the read receipt looked like a
            // failure and was retried until exhausted for nothing.
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.request(
                ConversationsEndpoint.byIdMarkRead(id: payload.conversationId),
                method: "POST",
                body: body,
                queryItems: nil
            )
            // Le nombre d'ids rapportés est le seul moyen de distinguer, en
            // production, un marquage exact d'un repli par fenêtre : sans lui,
            // un observateur débranché passerait inaperçu.
            logger.info("markAsRead dispatched for conversation \(payload.conversationId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public) reportedIds=\(reported.isEmpty ? "none(window-fallback)" : String(reported.count), privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("markAsRead 404 for conversation \(payload.conversationId, privacy: .public) — conversation gone, accepting as success")
        }
    }

    /// `POST /conversations` — the gateway accepts the canonical
    /// `{ type, title?, participantIds }` shape. The route does not yet
    /// wrap through `MutationLog`, so the cmid is sent on a best-effort
    /// basis (gateway middleware records it but `withMutationLog` is not
    /// yet invoked) — a future gateway upgrade picks the dedup up for
    /// free without an iOS-side change.
    private func dispatchCreateConversation(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreateConversationPayload.self)
        struct CreateConversationBody: Encodable {
            let type: String
            let title: String?
            let participantIds: [String]
        }
        let body = CreateConversationBody(
            type: payload.type,
            title: payload.title,
            participantIds: payload.participantIds
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            ConversationsEndpoint.root,
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("createConversation dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `PUT /conversations/:id` — the gateway accepts a partial update
    /// shape ; we forward only the fields the payload carries non-nil.
    /// A 404 means the conversation was deleted while the row was
    /// pending — swallow as success so the flusher removes the row.
    private func dispatchUpdateConversation(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateConversationPayload.self)
        struct UpdateConversationBody: Encodable {
            let title: String?
            let description: String?
            let avatar: String?

            enum CodingKeys: String, CodingKey { case title, description, avatar }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let title { try container.encode(title, forKey: .title) }
                if let description { try container.encode(description, forKey: .description) }
                if let avatar { try container.encode(avatar, forKey: .avatar) }
            }
        }
        let body = UpdateConversationBody(
            title: payload.title,
            description: payload.description,
            avatar: payload.avatarUrl
        )
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                ConversationsEndpoint.byId(id: payload.conversationId),
                method: "PUT",
                body: try JSONEncoder().encode(body),
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("updateConversation dispatched for \(payload.conversationId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("updateConversation 404 for \(payload.conversationId, privacy: .public) — conversation gone, accepting as success")
        }
    }

    /// `PATCH /me/preferences/:category` — the gateway path is
    /// category-typed (`privacy`, `audio`, …) and dedupes via
    /// `kind = updateSettings:${category}`. The opaque `body` blob is
    /// the JSON-encoded category-specific preferences struct produced
    /// by the caller at enqueue time.
    private func dispatchUpdateSettings(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateSettingsPayload.self)
        // La catégorie arrive d'un enregistrement PERSISTÉ : elle peut porter
        // n'importe quelle chaîne, y compris celle d'une version antérieure de
        // l'app. L'interpoler telle quelle produisait un 404 SILENCIEUX au
        // rejeu — l'action était consommée, la préférence jamais écrite.
        // La convertir fait de ce cas une erreur qui se voit.
        guard let category = PreferenceCategory(rawValue: payload.category) else {
            throw MeeshyError.server(
                statusCode: 0,
                message: "Catégorie de préférences inconnue « \(payload.category) » — "
                    + "aucune adresse ne la sert, l'action ne peut pas être rejouée.")
        }
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            category.endpoint,
            method: "PATCH",
            body: payload.body,
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("updateSettings dispatched for category \(payload.category, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `POST /posts` — gateway wraps through `withMutationLog`. Body
    /// shape matches `CreatePostSchema` ; `attachmentIds` becomes
    /// `mediaIds` at the wire boundary to match the gateway field name.
    private func dispatchCreatePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreatePostPayload.self)

        // An offline media post carries local file paths; upload them via TUS
        // on reconnect, then create the post with the resulting ids. TUS
        // checkpoint resume fires on re-upload (same sha256 key), so a kill
        // mid-upload resumes from the saved offset.
        var resolvedMediaIds = payload.attachmentIds
        var uploadedLocalPaths: [String] = []
        if let pendingMediaPaths = payload.localMediaPaths, !pendingMediaPaths.isEmpty {
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin),
                  let token = APIClient.shared.authToken else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 401,
                    userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload post media"]
                )
            }
            let uploader = TusUploadManager(baseURL: baseURL)
            var uploadedIds: [String] = []
            for (index, stored) in pendingMediaPaths.enumerated() {
                let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                guard FileManager.default.fileExists(atPath: absolutePath) else {
                    logger.error("Post media file missing on dispatch, path=\(stored, privacy: .public)")
                    continue
                }
                do {
                    // Le MIME **DÉCLARÉ** par le site d'envoi l'emporte ; la
                    // dérivation depuis l'extension n'est que le REPLI des
                    // lignes qui n'en portent pas. L'extension ne suffit pas :
                    // un vocal importé en `.caf` / `.aiff` / `.opus` s'y
                    // re-dérivait en `application/octet-stream`, et le gateway
                    // ne reconnaît un média audio qu'à
                    // `mimeType.startsWith('audio/')` — la transcription
                    // embarquée était alors ignorée ET Whisper jamais
                    // déclenché, pour un fichier que l'expéditeur savait
                    // pourtant être une voix.
                    let mime = payload.declaredMimeType(at: index)
                        ?? MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                    let tusResult = try await uploader.uploadFile(
                        fileURL: URL(fileURLWithPath: absolutePath),
                        mimeType: mime,
                        credential: .bearer(token),
                        // POUR QUI ce fichier est téléversé — et sans lui, le
                        // gateway crée un `MessageAttachment` puis répond 201
                        // avec un id parfaitement valide. `PostService.createPost`
                        // ne réclame ensuite que des `PostMedia` : il n'en
                        // réclame AUCUN, ne journalise qu'un `logger.warn`, et le
                        // post arrive publié et VIDE. Les trois chemins EN LIGNE
                        // le passaient déjà ; seule la file durable ne le passait
                        // pas, si bien que le média perdu ne l'était QUE hors
                        // ligne — la condition la moins observée de toutes.
                        uploadContext: "post"
                    )
                    uploadedIds.append(tusResult.id)
                    uploadedLocalPaths.append(absolutePath)
                } catch {
                    logger.error("Post media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                }
            }
            guard !uploadedIds.isEmpty else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 503,
                    userInfo: [NSLocalizedDescriptionKey: "No media uploaded for offline post media dispatch"]
                )
            }
            resolvedMediaIds = uploadedIds + payload.attachmentIds
        }

        let body = CreatePostBody(
            content: payload.content,
            mediaIds: resolvedMediaIds.isEmpty ? nil : resolvedMediaIds,
            visibility: payload.visibility,
            originalLanguage: payload.originalLanguage,
            type: payload.type,
            moodEmoji: payload.moodEmoji,
            audioUrl: payload.audioUrl,
            audioDuration: payload.audioDuration,
            visibilityUserIds: payload.visibilityUserIds,
            location: payload.location,
            mentions: payload.mentions,
            discoverabilityPrecision: payload.discoverabilityPrecision,
            repostOfId: payload.repostOfId,
            mobileTranscription: payload.mobileTranscription
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.root,
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        for path in uploadedLocalPaths {
            do { try FileManager.default.removeItem(atPath: path) } catch {
                logger.warning("createPost: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        logger.info("createPost dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `POST|DELETE /posts/:id/like` — gateway wraps through
    /// `withMutationLog`. Both directions are naturally idempotent at
    /// the storage layer, so a 404 ("post gone") is treated as success.
    private func dispatchToggleLikePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleLikePostPayload.self)
        let method = payload.liked ? "POST" : "DELETE"
        let body = try ToggleLikePostBody.encoded(for: payload)
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
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

    /// `POST /posts/:id/repost` — gateway wraps through `withMutationLog`
    /// (fil rouge du repost, lot 7 tâche 7.1) : le cmid dédoublonne un rejeu
    /// réseau, `repostPost` n'étant PAS naturellement idempotent (chaque
    /// appel fabrique un `Post` neuf).
    ///
    /// `targetType` voyage TOUJOURS depuis `RepostPostPayload` (jamais
    /// optionnel) — Loi 5 (« le repost miroite », spec 2026-08-23) :
    /// laisser le serveur retomber sur son défaut `?? PostType.POST`
    /// transformerait silencieusement une source éphémère en post permanent.
    ///
    /// Contrairement à `dispatchToggleLikePost`, un 404 n'est PAS avalé : la
    /// source a disparu, le geste demandé (publier CE contenu) n'a pas eu
    /// lieu — ce n'est pas un no-op idempotent comme un like sur un post
    /// déjà parti. L'erreur remonte telle quelle ;
    /// `OutboxFlusher.isPermanentServerRejection` (400/403/404/413/422) la
    /// fait terminer en `.exhausted` dès la première tentative plutôt que de
    /// consommer tout le budget de retry.
    private func dispatchRepostPost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: RepostPostPayload.self)
        struct RepostBody: Encodable {
            let targetType: String
            let content: String?
            let isQuote: Bool
            let visibility: String?
        }
        let body = RepostBody(
            targetType: payload.targetType,
            content: payload.content,
            isQuote: payload.isQuote,
            visibility: payload.visibility
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.byPostIdRepost(postId: payload.postId),
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("repostPost dispatched for \(payload.postId, privacy: .public) targetType=\(payload.targetType, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `POST /posts/:id/comments` — gateway wraps through
    /// `withMutationLog`. Body matches `CreateCommentSchema` :
    /// `{ content, parentId? }`.
    private func dispatchCreateComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreateCommentPayload.self)
        struct CreateCommentBody: Encodable {
            let content: String
            let parentId: String?
            /// Lieu partagé — même clé `location` que le chemin direct
            /// (`PostService.addComment`), hissée par le gateway depuis
            /// `metadata.location`.
            let location: SharedPlace?
            let effectFlags: Int?

            enum CodingKeys: String, CodingKey { case content, parentId, location, effectFlags }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(content, forKey: .content)
                if let parentId { try container.encode(parentId, forKey: .parentId) }
                try container.encodeIfPresent(location, forKey: .location)
                try container.encodeIfPresent(effectFlags, forKey: .effectFlags)
            }
        }
        let body = CreateCommentBody(
            content: payload.content,
            parentId: payload.parentCommentId,
            location: payload.location,
            effectFlags: payload.effectFlags
        )
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.byPostIdComments(postId: payload.postId),
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("createComment dispatched on \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `DELETE /posts/:postId/comments/:commentId` — gateway wraps
    /// through `withMutationLog`. The route needs `postId` so the
    /// payload carries it ; without it we'd have to look up the comment
    /// owner which defeats the offline-first invariant.
    /// 404 = comment gone (raced with another delete), accept as success.
    private func dispatchDeleteComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: DeleteCommentPayload.self)
        // `DeleteCommentPayload` only carries `commentId`. The gateway
        // route is `/posts/:postId/comments/:commentId`. We persist the
        // `postId` in `OutboxRecord.conversationId` at enqueue time so
        // the dispatcher can recover it here without re-introducing it
        // in the payload schema (which is shared with the gateway
        // `MutationLog` dedup key).
        let postId = record.conversationId
        guard postId != OfflineQueue.globalConversationSentinel else {
            logger.error("deleteComment record \(record.id, privacy: .public) missing postId in conversationId field — dropping")
            return
        }
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                PostsEndpoint.byPostIdCommentsByCommentId(postId: postId, commentId: payload.commentId),
                method: "DELETE",
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("deleteComment dispatched for \(payload.commentId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("deleteComment 404 for \(payload.commentId, privacy: .public) — comment gone, accepting as success")
        }
    }

    /// `POST|DELETE /posts/:postId/comments/:commentId/like` — like and
    /// unlike are naturally idempotent at the storage layer ; the route
    /// does NOT currently wrap through `MutationLog` (only the post-level
    /// like/unlike does), but we still send the cmid header so a future
    /// gateway upgrade picks it up for free.
    /// 404 = comment gone, accept as success.
    private func dispatchToggleLikeComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ToggleLikeCommentPayload.self)
        let postId = record.conversationId
        guard postId != OfflineQueue.globalConversationSentinel else {
            logger.error("toggleLikeComment record \(record.id, privacy: .public) missing postId in conversationId field — dropping")
            return
        }
        let method = payload.liked ? "POST" : "DELETE"
        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                PostsEndpoint.byPostIdCommentsByCommentIdLike(postId: postId, commentId: payload.commentId),
                method: method,
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("toggleLikeComment \(payload.liked, privacy: .public) dispatched for \(payload.commentId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("toggleLikeComment 404 for \(payload.commentId, privacy: .public) — comment gone, accepting as success")
        }
    }

    // MARK: - Send Message

    /// Durably reconciles a successful message send — independent of whether a
    /// `ConversationViewModel` is currently alive for the conversation.
    ///
    /// Without this, the optimistic→server transition (`serverAck`) only ran
    /// from `ConversationViewModel`'s `retrySucceeded` Combine sink. When a
    /// flush completed while the user was outside the conversation, that
    /// transient `PassthroughSubject` event was dropped, the optimistic GRDB
    /// row stayed `.sending`, and a cold reload duplicated it against the real
    /// server message. Applying the `serverAck` here — at the always-alive
    /// dispatcher — guarantees the row flips to `.sent` and a `PendingIdRecord`
    /// is written regardless of UI state. When a VM IS alive its sink runs the
    /// same `applyEvent` again as a harmless no-op on the already-`.sent` row.
    private func reconcileSuccessfulMessageSend(
        clientMessageId: String,
        serverId: String,
        conversationId: String
    ) async {
        let persistence = await DependencyContainer.shared.messagePersistence
        do {
            _ = try await persistence.applyEvent(
                localId: clientMessageId,
                event: .serverAck(serverId: serverId, at: Date())
            )
        } catch {
            // Le serveur a accepté le message mais la ligne locale n'est pas
            // passée `.sent` : la bulle reste « en cours d'envoi » jusqu'au
            // prochain resync.
            logger.error("Server ACK not applied for \(clientMessageId, privacy: .public), bubble stays 'sending': \(error.localizedDescription, privacy: .public)")
        }
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { cached in
            cached.filter { $0.id != clientMessageId }
        }
        OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
            clientMessageId: clientMessageId,
            serverId: serverId,
            conversationId: conversationId,
            kind: .sendMessage
        ))
    }

    /// Résout `copyAttachmentsFromMessageId` pour CETTE ligne — un partage
    /// multi-destinataires COPIE les pièces jointes du message porté par
    /// l'origine, jamais un transfert (voir `ShareFanoutOriginResolver`).
    ///
    /// Sortie anticipée sur `item.copyAttachmentsFromClientMessageId == nil`
    /// (round 1 de revue, Minor) : un message ORDINAIRE — l'écrasante
    /// majorité — ne paie plus une lecture GRDB sur la clé `""` dont le
    /// résultat était de toute façon ignoré.
    ///
    /// L'origine non encore acquittée lève `OutboxDeferralError
    /// .waitingForFanoutOrigin` — erreur TYPÉE, pas un `NSError` générique —
    /// pour qu'`OutboxFlusher` la reconnaisse (`isWaitingForFanoutOrigin`) et
    /// replanifie la ligne SANS consommer `attempts`, borné par
    /// `OutboxFlusher.fanoutOriginWaitTimeout` : partir maintenant livrerait
    /// un message VIDE de pièces jointes, mais un simple `NSError` (round 1
    /// précédent) épuisait le budget de tentatives en ~30s — exactement le
    /// délai qu'un upload photo/vidéo sur réseau médiocre dépasse en usage
    /// nominal.
    ///
    /// **`item.copyAttachmentsFromServerMessageId` court-circuite la
    /// résolution GRDB quand il est déjà connu** (défaut bloquant corrigé) :
    /// une origine servie par l'extension de partage n'a JAMAIS de ligne
    /// locale (l'extension poste en REST sans dépendance SDK), donc
    /// `resolveServerId(for: originClientMessageId)` résout `nil` pour
    /// TOUJOURS dans ce cas — la ligne se reporterait indéfiniment jusqu'à
    /// épuiser son budget. `SharePendingSendConsumer` lit alors l'identifiant
    /// serveur déjà écrit sur la fiche (`PendingTarget.serverMessageId`) et
    /// le transmet ici tel quel. Une origine partie par l'app (chemin
    /// existant, non régressé) ne pose jamais ce champ : la résolution
    /// GRDB ci-dessous s'applique alors normalement.
    private func resolveCopyAttachmentsFromMessageId(for item: OfflineQueueItem) async throws -> String? {
        guard let originClientMessageId = item.copyAttachmentsFromClientMessageId else { return nil }
        let resolvedServerId: String?
        if let known = item.copyAttachmentsFromServerMessageId, !known.isEmpty {
            resolvedServerId = known
        } else {
            resolvedServerId = try? await DependencyContainer.shared.messagePersistence
                .resolveServerId(for: originClientMessageId)
        }
        let fanout = ShareFanoutOriginResolver.resolve(
            copyAttachmentsFromClientMessageId: originClientMessageId,
            resolvedServerId: resolvedServerId
        )
        switch fanout {
        case .notAFanout:
            return nil
        case .ready(let serverMessageId):
            return serverMessageId
        case .waitingForOrigin(let clientMessageId):
            throw OutboxDeferralError.waitingForFanoutOrigin(clientMessageId: clientMessageId)
        }
    }

    private func dispatchSendMessage(_ record: OutboxRecord) async throws {
        if record.id.hasPrefix("ofq_") {
            let item: OfflineQueueItem
            do {
                item = try decoder.decode(OfflineQueueItem.self, from: record.payload)
            } catch {
                // Corrupt payload — accept to let the flusher remove the row.
                logger.error("Corrupt OfflineQueueItem payload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
                return
            }

            // Multi-track audio offline replay. The canonical field is
            // `localAudioPaths` (array); legacy rows may still carry only
            // `localAudioPath` (scalar). Both are resolved so the dispatcher
            // handles every row shape. Each track is uploaded via TUS
            // independently; missing or failed tracks are skipped
            // (best-effort). All uploaded ids go out in a single
            // `message:send-with-attachments` socket event.
            let pendingAudioPaths: [String] = {
                if let many = item.localAudioPaths, !many.isEmpty { return many }
                if let one = item.localAudioPath, !one.isEmpty { return [one] }
                return []
            }()

            // Round 1 de revue (Important 3) : `sendWithAttachmentsAsync` —
            // donc les deux branches socket ci-dessous (rejeu audio/média
            // hors-ligne) — n'a AUCUN moyen de transmettre
            // `copyAttachmentsFromMessageId`. Le handler gateway
            // `handleMessageSendWithAttachments` ne le lit pas non plus (seul
            // `message:send`, le path texte, le fait —
            // `SocketMessageSendWithAttachmentsSchema` côté gateway ne
            // déclare pas le champ, Zod le supprimerait en silence). Aucune
            // cible non-origine ne porte de média local aujourd'hui
            // (`SharePendingSendConsumer.enqueue` ne pose
            // `copyAttachmentsFromClientMessageId` QUE sur les lignes SANS
            // média local) : cette combinaison n'arrive jamais en pratique,
            // mais rien ne l'empêchait STRUCTURELLEMENT, et le champ aurait
            // disparu EN SILENCE. Échoue fort plutôt que de laisser partir un
            // message vide de la promesse de copie.
            let hasLocalMediaToReplay = !pendingAudioPaths.isEmpty || !(item.localMediaPaths?.isEmpty ?? true)
            if hasLocalMediaToReplay, let unsupportedOriginId = item.copyAttachmentsFromClientMessageId {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 501,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Fan-out de partage (\(unsupportedOriginId)) non supporté sur le chemin socket média/audio local"]
                )
            }

            if !pendingAudioPaths.isEmpty {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                // Rejeu d'une pièce jointe de MESSAGE : accessible à un
                // invité de lien partagé, contrairement aux médias de post.
                guard let baseURL = URL(string: serverOrigin),
                      let credential = APIClient.shared.requestCredential else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload audio"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []

                for stored in pendingAudioPaths {
                    let absolutePath = OfflineQueue.absoluteAudioPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Audio file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: "audio/mp4",
                            credential: credential
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Audio track TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No audio track uploaded for offline audio dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId,
                    // Lieu partagé rejoué au renvoi — le canal socket porte la
                    // même clé `location` que le corps REST.
                    location: item.location
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline audio dispatch"]
                    )
                }

                // Best-effort cleanup of uploaded tracks. Failure here is
                // benign — skipped (failed-but-present) track files are
                // reclaimed by `OutboxFlusher.cleanupLocalFiles(for:)` when
                // the outbox record terminates (applied or exhausted), which
                // now sweeps both `localAudioPath` and `localAudioPaths`.
                for path in uploadedPaths {
                    do { try FileManager.default.removeItem(atPath: path) } catch {
                        logger.warning("audio dispatch: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                )
                return
            }

            // Offline visual-media (photo/video) replay. Each pending file
            // (relocated under Documents/pending-media/ by enqueueMedia) is
            // uploaded via TUS with a MIME derived from its extension (unlike
            // the audio branch which hardcodes audio/mp4), then all ids go out
            // in one message:send-with-attachments. TUS checkpoint resume fires
            // on re-upload (same sha256 key), so a kill mid-upload resumes from
            // the saved offset.
            if let pendingMediaPaths = item.localMediaPaths, !pendingMediaPaths.isEmpty {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                // Rejeu d'une pièce jointe de MESSAGE : accessible à un
                // invité de lien partagé, contrairement aux médias de post.
                guard let baseURL = URL(string: serverOrigin),
                      let credential = APIClient.shared.requestCredential else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 401,
                        userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload media"]
                    )
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var uploadedIds: [String] = []
                var uploadedPaths: [String] = []

                for stored in pendingMediaPaths {
                    let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                    guard FileManager.default.fileExists(atPath: absolutePath) else {
                        logger.error("Media file missing on dispatch, path=\(stored, privacy: .public)")
                        continue
                    }
                    do {
                        let mime = MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                        let tusResult = try await uploader.uploadFile(
                            fileURL: URL(fileURLWithPath: absolutePath),
                            mimeType: mime,
                            credential: credential
                        )
                        uploadedIds.append(tusResult.id)
                        uploadedPaths.append(absolutePath)
                    } catch {
                        logger.error("Media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                    }
                }

                guard !uploadedIds.isEmpty else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 503,
                        userInfo: [NSLocalizedDescriptionKey: "No media uploaded for offline media dispatch"]
                    )
                }

                let ack = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                    conversationId: item.conversationId,
                    content: item.content.isEmpty ? nil : item.content,
                    attachmentIds: uploadedIds,
                    replyToId: item.replyToId,
                    storyReplyToId: nil,
                    originalLanguage: item.originalLanguage,
                    clientMessageId: item.clientMessageId,
                    // Lieu partagé rejoué au renvoi — même clé `location` que
                    // le corps REST.
                    location: item.location
                )
                guard let ack else {
                    throw NSError(
                        domain: "OutboxDispatcher",
                        code: 502,
                        userInfo: [NSLocalizedDescriptionKey: "Socket ACK missing for offline media dispatch"]
                    )
                }

                for path in uploadedPaths {
                    do { try FileManager.default.removeItem(atPath: path) } catch {
                        logger.warning("media dispatch: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
                    }
                }

                await reconcileSuccessfulMessageSend(
                    clientMessageId: item.clientMessageId,
                    serverId: ack.messageId,
                    conversationId: item.conversationId
                )
                return
            }

            // Fan-out de partage : les cibles 2..N réclament une COPIE des
            // pièces jointes du message porté par la première — jamais un
            // transfert, qui ferait afficher « Transféré depuis <conversation
            // source> » au destinataire (décision user, invariant produit).
            let copyAttachmentsFromMessageId = try await resolveCopyAttachmentsFromMessageId(for: item)

            let request = SendMessageRequest(
                content: item.content,
                replyToId: item.replyToId,
                forwardedFromId: item.forwardedFromId,
                forwardedFromConversationId: item.forwardedFromConversationId,
                attachmentIds: item.attachmentIds,
                clientMessageId: item.clientMessageId,
                // Lieu partagé rejoué au renvoi, comme pour un post et un
                // commentaire : clé top-level `location`, omise quand nil.
                location: item.location,
                copyAttachmentsFromMessageId: copyAttachmentsFromMessageId
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            // Reconcile the optimistic clientMessageId durably (GRDB row +
            // PendingIdRecord + cache) so neither a `message:new` socket echo
            // nor a cold reload duplicates the row.
            await reconcileSuccessfulMessageSend(
                clientMessageId: item.clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )

        } else if record.id.hasPrefix("mrq_") {
            // `MessageRetryQueue` was removed but legacy `mrq_*` rows may
            // still live on devices that upgraded mid-queue. The payload
            // format was a strict superset of the fields needed for replay;
            // we hand-roll a minimal struct here instead of keeping the
            // deleted public types around just for legacy decoding.
            //
            // Decoded rows are sent through the same unified
            // `OfflineQueue.shared.retrySucceeded` signal as `ofq_*` rows
            // so ConversationViewModel reconciles via a single subscription.
            struct LegacyMrqPayload: Decodable {
                let conversationId: String
                let content: String
                let originalLanguage: String?
                let replyToId: String?
                let attachmentIds: [String]?
                let clientMessageId: String?
            }
            let item: LegacyMrqPayload
            do {
                item = try decoder.decode(LegacyMrqPayload.self, from: record.payload)
            } catch {
                logger.error("Corrupt legacy mrq_* payload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
                return
            }
            guard let clientMessageId = item.clientMessageId else {
                logger.error("Legacy mrq_* payload without clientMessageId for record \(record.id, privacy: .public), dropping")
                return
            }
            let request = SendMessageRequest(
                content: item.content,
                originalLanguage: item.originalLanguage ?? "fr",
                replyToId: item.replyToId,
                attachmentIds: item.attachmentIds,
                clientMessageId: clientMessageId
            )
            let response = try await MessageService.shared.send(
                conversationId: item.conversationId, request: request
            )
            await reconcileSuccessfulMessageSend(
                clientMessageId: clientMessageId,
                serverId: response.id,
                conversationId: item.conversationId
            )
        }
        // Unknown namespace prefix — stale row, accept so the flusher removes it.
    }

    // MARK: - Edit Message

    private func dispatchEditMessage(_ record: OutboxRecord) async throws {
        let payload: OfflineEditPayload
        do {
            payload = try decoder.decode(OfflineEditPayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt OfflineEditPayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        _ = try await MessageService.shared.edit(
            messageId: payload.messageId,
            content: payload.content
        )
        logger.info("Edit dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Delete Message

    private func dispatchDeleteMessage(_ record: OutboxRecord) async throws {
        let payload: OfflineDeletePayload
        do {
            payload = try decoder.decode(OfflineDeletePayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt OfflineDeletePayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        try await MessageService.shared.delete(
            conversationId: payload.conversationId,
            messageId: payload.messageId
        )
        logger.info("Delete dispatched for message \(payload.messageId, privacy: .public)")
    }

    // MARK: - Send Reaction

    private func dispatchSendReaction(_ record: OutboxRecord) async throws {
        let payload: ReactionOutboxPayload
        do {
            payload = try decoder.decode(ReactionOutboxPayload.self, from: record.payload)
        } catch {
            logger.error("Corrupt ReactionOutboxPayload for record \(record.id, privacy: .public), dropping: \(error.localizedDescription, privacy: .public)")
            return
        }
        do {
            switch payload.action {
            case .add:
                try await ReactionService.shared.add(
                    messageId: payload.messageId,
                    emoji: payload.emoji
                )
            case .remove:
                try await ReactionService.shared.remove(
                    messageId: payload.messageId,
                    emoji: payload.emoji
                )
            }
            logger.info("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) dispatched for message \(payload.messageId, privacy: .public)")
            // Reactions have no server-assigned id (the gateway broadcasts
            // `reaction:added` / `reaction:removed` over the socket), but
            // the success signal still carries enough context for any
            // pending-indicator UI to clear its hint. `serverId` is set to
            // `clientMessageId` as a stable non-empty placeholder.
            OfflineQueue.shared.retrySucceeded.send(OfflineRetrySuccess(
                clientMessageId: payload.clientMessageId,
                serverId: payload.clientMessageId,
                conversationId: payload.conversationId,
                kind: .sendReaction,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                )
            ))
        } catch APIError.serverError(let code, _) where code == 404 || code == 409 || code == 410 {
            // Permanent rejection — 404/410 (message gone) and 409 (state
            // conflict: already reacted / already removed). Replaying the
            // same request would bounce forever, so we treat the row as
            // exhausted right now, emit the unified signal so the optimistic
            // UI rolls back, and return success so the flusher deletes the
            // row instead of retrying.
            logger.warning("Reaction \(payload.action.rawValue, privacy: .public) \(payload.emoji, privacy: .public) on \(payload.messageId, privacy: .public) rejected (\(code, privacy: .public)) — dropping")
            OfflineQueue.shared.retryExhausted.send(OfflineRetryExhausted(
                kind: .sendReaction,
                clientMessageId: payload.clientMessageId,
                conversationId: payload.conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: payload.messageId,
                    emoji: payload.emoji,
                    action: payload.action
                ),
                lastError: "HTTP \(code)"
            ))
            // Returning normally drains the row. The flusher.deleteOne path
            // is the same as for a true success — gateway dedup means the
            // server-side outcome is already terminal regardless.
        }
    }
}

// MARK: - toggleLikePost wire body

/// Corps de `POST /posts/:id/like` quand la ligne porte une RÉACTION (story) :
/// `{ emoji }`, la forme que `LikeSchema` lit côté gateway et que le chemin
/// direct émet déjà (`ReactionRequest`, `StoryInteractionService.react`). Un
/// like simple n'a pas d'emoji et garde son corps vide — le gateway retombe
/// alors sur son défaut, exactement comme avant ce champ.
/// `nonisolated` et `internal`, comme `MarkAsReadBody` : le dispatch hérite de
/// l'isolation de son appelant, et le contrat d'encodage se lit depuis
/// `MeeshyTests`.
nonisolated struct ToggleLikePostBody: Encodable {
    let emoji: String

    /// `nil` sans emoji : un like simple ne change pas de forme sur le fil.
    static func encoded(for payload: ToggleLikePostPayload) throws -> Data? {
        try payload.emoji.map { try JSONEncoder().encode(ToggleLikePostBody(emoji: $0)) }
    }
}

// MARK: - updateProfile wire bodies

/// Wire body for `PATCH /users/me/avatar` — mirrors the online path's
/// `UserService.updateAvatar(url:)` body shape (`updateAvatarSchema` on the
/// gateway: `{ avatar: string }`).
nonisolated struct UpdateProfileAvatarBody: Encodable {
    let avatar: String
}

/// Corps de `POST /conversations/:id/mark-read` — les messages RÉELLEMENT
/// affichés. `MarkReadBodySchema` est `.strict()` côté gateway : toute clé non
/// déclarée rejette la requête ENTIÈRE en 400, ce qui perdrait aussi les
/// lectures légitimes du même lot. D'où un type qui ne porte que `messageIds`.
/// `internal` (et non `private`) pour que son contrat d'encodage soit
/// directement testable depuis `MeeshyTests`.
///
/// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
nonisolated struct MarkAsReadBody: Encodable {
    let messageIds: [String]

    /// Version linguistique affichée pendant que le lot défilait.
    var language: String?

    /// EXCEPTIONS à `language`, par message : sans traduction disponible, c'est
    /// l'ORIGINAL qui s'affiche. Restreintes au lot réellement envoyé — le
    /// gateway n'accepte que des identifiants qu'il vient de recevoir, une clé
    /// écartée par le plafond ferait rejeter le corps entier.
    var messageLanguages: [String: String]?

    /// Le lecteur a atteint ce message, le plus récent : le curseur de non-lus
    /// avance jusque-là et le badge tombe à zéro côté serveur. N'élargit PAS
    /// l'ensemble des messages marqués lus — cf. `MarkAsReadPayload`.
    var caughtUpToMessageId: String?

    /// Plafond accepté par le gateway.
    static let limit = 200

    /// Tronque en gardant les PLUS RÉCENTS : ce sont ceux que l'utilisateur
    /// vient de voir, et dépasser la borne ferait rejeter tout le lot.
    static func cap(_ ids: [String]) -> [String] {
        ids.count <= limit ? ids : Array(ids.suffix(limit))
    }

    /// Restreint les exceptions aux identifiants effectivement rapportés.
    static func scopedLanguages(
        _ table: [String: String]?,
        to reported: [String]
    ) -> [String: String]? {
        guard let table, !table.isEmpty else { return nil }
        let allowed = Set(reported)
        let scoped = table.filter { allowed.contains($0.key) }
        return scoped.isEmpty ? nil : scoped
    }
}

/// Wire body for `PATCH /users/me`. Deliberately has NO `avatar` property —
/// the gateway's `updateUserProfileSchema` (packages/shared/utils/validation.ts)
/// is `.strict()` and rejects any key it doesn't declare with a 400 that takes
/// down the WHOLE request, so an `avatar` key here previously blocked
/// displayName/bio from ever saving. `internal` (not `private`) so its
/// encoding contract is directly testable from `MeeshyTests`.
nonisolated struct UpdateProfileFieldsBody: Encodable {
    let displayName: String?
    let bio: String?

    enum CodingKeys: String, CodingKey { case displayName, bio }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let displayName { try container.encode(displayName, forKey: .displayName) }
        if let bio { try container.encode(bio, forKey: .bio) }
    }
}

// MARK: - On-demand outbox drain

/// Triggers an immediate outbox drain. `OutboxFlusher.flush()` otherwise
/// only runs at app boot (`MeeshyApp`) and on background→foreground
/// transitions (`BackgroundTransitionCoordinator`) — so an optimistic
/// mutation enqueued mid-session (a reaction in particular, which has no
/// other send path) would sit `pending` in the outbox until one of those
/// events and never reach the server. Call this right after enqueueing so
/// the change leaves the device immediately.
@MainActor
enum OutboxFlushTrigger {
    static func flushNow() async {
        let flusher = OutboxFlusher(
            pool: DependencyContainer.shared.dbPool,
            dispatcher: OutboxDispatcher(),
            onOutcome: { @Sendable outcome in
                Task { await OfflineQueue.shared.publishOutcome(outcome) }
            },
            isNetworkReachable: { @Sendable in
                await MainActor.run { NetworkConditionMonitor.shared.isOnline }
            }
        )
        let nextRetry = await flusher.flush()
        OutboxRetryScheduler.shared.schedule(at: nextRetry)
    }
}

/// Possède l'unique timer de re-flush de l'outbox.
///
/// `OutboxFlusher` repousse `nextAttemptAt` sur échec (backoff exponentiel)
/// mais ne se rappelle jamais lui-même : sans ce planificateur, un record en
/// backoff attendait le prochain évènement de cycle de vie (boot, retour au
/// premier plan, enqueue, BGTask) pour être retenté. Ici, dès qu'un flush
/// laisse un record différé, on (ré)arme un timer unique qui rejoue le flush
/// pile à l'échéance. Le timer est dédupliqué : `schedule` annule toujours le
/// précédent, il n'y a donc jamais plus d'un timer en vol.
@MainActor
final class OutboxRetryScheduler {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = OutboxRetryScheduler()
    private var timer: Task<Void, Never>?
    private var networkCancellable: AnyCancellable?
    private var mutationCancellable: AnyCancellable?
    private init() {}

    /// Réveille le flusher à chaque transition réseau offline→online.
    ///
    /// `OutboxFlusher.flush()` est bandwidth-gated : une mutation enqueueée
    /// hors-ligne court-circuite, et comme rien n'est différé, AUCUN timer de
    /// backoff n'est armé (`schedule(at: nil)` annule le précédent). Sans ce
    /// trigger, elle resterait `pending` jusqu'à un évènement de cycle de vie
    /// incident (boot / retour au premier plan). On s'abonne à la MÊME source
    /// d'état réseau que le gate du flusher (`NetworkConditionMonitor`) pour
    /// garantir que trigger et gate s'accordent. Publisher + flush injectés
    /// pour la testabilité ; à appeler une fois au démarrage de l'app.
    func startObservingNetworkReconnect(
        conditionPublisher: AnyPublisher<NetworkCondition, Never> = NetworkConditionMonitor.shared.$condition.eraseToAnyPublisher(),
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        networkCancellable = conditionPublisher
            .map { $0 != .offline }
            .removeDuplicates()
            .dropFirst()            // ignore la valeur courante rejouée à l'abonnement
            .filter { $0 }          // uniquement offline→online
            .sink { _ in Task { @MainActor in await flush() } }
    }

    /// outbox-04 — réveille le flusher juste après une mutation sociale
    /// enfilée EN LIGNE (like/post/commentaire) : sans ce trigger la row
    /// reste `.pending` jusqu'au prochain événement de cycle de vie incident
    /// (reconnect, boot, foreground). Débounce 250 ms : une rafale (double-tap
    /// like, commentaires d'affilée) ne déclenche qu'un seul flush groupé.
    /// Publisher + flush injectés pour la testabilité — même pattern que
    /// `startObservingNetworkReconnect`.
    func startObservingMutationEnqueued(
        mutationPublisher: AnyPublisher<Void, Never> = OfflineQueue.shared.mutationEnqueued.publisher,
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        mutationCancellable = mutationPublisher
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
            .sink { _ in Task { @MainActor in await flush() } }
    }

    /// (Ré)arme le timer pour rejouer un flush à `date`. `nil` annule le
    /// timer en attente (plus rien n'est différé).
    func schedule(at date: Date?) {
        timer?.cancel()
        guard let date else {
            timer = nil
            return
        }
        timer = Task {
            // Cap à 1 h : au-delà, un évènement de cycle de vie aura de toute
            // façon redéclenché un flush entre-temps.
            let delay = min(max(0, date.timeIntervalSinceNow), 3600)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await OutboxFlushTrigger.flushNow()
        }
    }
}

/// Corps de `POST /posts` tel que la file durable l'émet — hissé au niveau du
/// fichier pour être encodable en test, comme `UpdateProfileFieldsBody`.
/// `attachmentIds` devient `mediaIds` au passage du fil, pour épouser le nom
/// du champ côté gateway.
/// `nonisolated` : l'app compile sous `defaultIsolation(MainActor)`, et une
/// conformance `Encodable` isolée ne peut pas servir depuis le dispatch, qui
/// hérite de l'isolation de son appelant.
nonisolated struct CreatePostBody: Encodable {
    let content: String?
    let mediaIds: [String]?
    let visibility: String
    let originalLanguage: String?
    /// Post type forwarded to `CreatePostSchema`. Omitted when nil so the
    /// gateway applies its `POST` default — keeps legacy rows (written
    /// before reel-offline carried no `type`) replaying as plain posts.
    let type: String?
    // STATUS/mood fields — only set for `type == "STATUS"` rows; omitted
    // (and ignored by the gateway) otherwise.
    let moodEmoji: String?
    let audioUrl: String?
    let audioDuration: Int?
    let visibilityUserIds: [String]?
    /// Task 17 — même clé top-level `location` que le chemin direct
    /// (`CreatePostRequest`, `PostService.create`) : sans elle ici, la
    /// position survivrait jusqu'au décodage de `CreatePostPayload` mais
    /// serait tout de même jetée en silence à l'ultime saut réseau.
    let location: SharedPlace?
    /// Les références DÉCLARÉES (note, silence) — même clé que le chemin
    /// direct. Sans elle, nommer quelqu'un dans un post TEXTE, le cas le plus
    /// courant de l'app, ne produirait rien : ces posts-là n'empruntent que
    /// ce chemin.
    let mentions: [PostMentionInput]?
    /// Le SECOND opt-in de position — même clé top-level `discoverabilityPrecision`
    /// que le chemin direct (`CreatePostRequest`). Sans elle ICI, le
    /// consentement survivrait jusqu'au décodage de `CreatePostPayload` puis
    /// serait jeté en silence à l'ultime saut réseau : exactement le défaut
    /// que `location` a payé avant lui, et sur le chemin que prend le cas
    /// nominal (post TEXTE + lieu).
    let discoverabilityPrecision: DiscoverabilityPrecision?
    /// La publication REPARTAGÉE — même clé top-level `repostOfId` que le
    /// chemin direct (`CreatePostRequest`). Sans elle ICI, l'attribution
    /// survivrait jusqu'au décodage de `CreatePostPayload` puis serait jetée en
    /// silence à l'ultime saut réseau : le défaut que `location` a payé avant
    /// elle. **Seul porteur de l'attribution** — pas de `viaUsername`, que le
    /// gateway n'a jamais lu.
    let repostOfId: String?
    /// La transcription faite SUR L'APPAREIL. Le gateway la persiste sur le
    /// premier `PostMedia` audio et évite alors la re-transcription Whisper.
    /// Sa graphie (`duration_ms`, `speaker_id`) est portée par les
    /// `CodingKeys` du type lui-même — ne pas la réécrire ici.
    let mobileTranscription: MobileTranscriptionPayload?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let content, !content.isEmpty { try container.encode(content, forKey: .content) }
        if let mediaIds, !mediaIds.isEmpty { try container.encode(mediaIds, forKey: .mediaIds) }
        try container.encode(visibility, forKey: .visibility)
        if let originalLanguage, !originalLanguage.isEmpty { try container.encode(originalLanguage, forKey: .originalLanguage) }
        if let type, !type.isEmpty { try container.encode(type, forKey: .type) }
        if let moodEmoji, !moodEmoji.isEmpty { try container.encode(moodEmoji, forKey: .moodEmoji) }
        if let audioUrl, !audioUrl.isEmpty { try container.encode(audioUrl, forKey: .audioUrl) }
        if let audioDuration { try container.encode(audioDuration, forKey: .audioDuration) }
        if let visibilityUserIds, !visibilityUserIds.isEmpty { try container.encode(visibilityUserIds, forKey: .visibilityUserIds) }
        if let location { try container.encode(location, forKey: .location) }
        // Vide vaut absent à la CRÉATION : il n'existe encore aucune ligne à
        // effacer, et le `[]` du tri-état n'a de sens qu'à l'édition.
        if let mentions, !mentions.isEmpty { try container.encode(mentions, forKey: .mentions) }
        // Encodé seulement quand il existe : le schéma gateway est un
        // `z.enum().optional()`, qui REJETTE un `null` explicite — et
        // l'ABSENCE de la clé vaut « non découvrable ».
        if let discoverabilityPrecision {
            try container.encode(discoverabilityPrecision, forKey: .discoverabilityPrecision)
        }
        // Encodés seulement quand ils existent : un post d'origine n'a pas de
        // source, un post visuel n'a pas de voix — et un `null` explicite est
        // une affirmation là où il n'y en a aucune.
        if let repostOfId, !repostOfId.isEmpty { try container.encode(repostOfId, forKey: .repostOfId) }
        if let mobileTranscription {
            try container.encode(mobileTranscription, forKey: .mobileTranscription)
        }
    }

    enum CodingKeys: String, CodingKey {
        case content, mediaIds, visibility, originalLanguage, type
        case moodEmoji, audioUrl, audioDuration, visibilityUserIds, location, mentions
        case discoverabilityPrecision, repostOfId, mobileTranscription
    }
}
