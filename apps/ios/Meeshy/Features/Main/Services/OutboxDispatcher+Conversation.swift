import Foundation
import Combine
import MeeshySDK
import os

extension OutboxDispatcher {

    // MARK: - Conversation & content mutations

    /// `POST /conversations/:id/mark-read` — the gateway treats read
    /// receipts as monotonic + idempotent at the storage layer (a higher
    /// cursor wins, a lower one is a no-op), so the route does NOT wrap
    /// through `MutationLog`. We still dispatch via the outbox so an
    /// offline mark survives an app kill ; we just don't forward the
    /// `X-Client-Mutation-Id` header (no server-side dedup to feed).
    /// A 404 means the conversation was deleted while the row was pending
    /// — swallow as success so the flusher removes the row.
    /// R6 — la vue d'une story, rejouée par la porte unique
    /// `POST /social/events` (#10483) : elle y porte l'entrée du lecteur
    /// (provenance, origine d'un listing), que l'alias historique
    /// `POST /posts/:id/view` refuserait (`additionalProperties: false`). Mêmes
    /// effets côté passerelle (l'alias délègue au même cœur). Une story
    /// supprimée/expirée n'est plus un 404 mais un événement `rejected` : la
    /// ligne sort de la file dans les deux cas.
    /// #10500 — la vue rejouée par la file garde l'identité de sa ligne
    /// (`clientMutationId`) et l'heure de sa mise en file : une ligne
    /// renvoyée après une réponse perdue n'est pas recomptée.
    nonisolated static func storyView(_ payload: MarkStoryViewedPayload, queuedAt: Date) -> StampedSocialEvent {
        StampedSocialEvent(
            event: .view(postId: payload.storyId, durationMs: nil, surface: .story, entry: payload.entry),
            stamp: SocialEventStamp(eventId: SocialEventStamp.stableEventId(from: payload.clientMutationId), occurredAt: queuedAt)
        )
    }

    func dispatchMarkStoryViewed(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: MarkStoryViewedPayload.self)
        do {
            _ = try await PostService.shared.recordSocialEvents(
                [Self.storyView(payload, queuedAt: record.createdAt)],
                credential: .account
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
    func dispatchReportAttachmentStatus(_ record: OutboxRecord) async throws {
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
            let _: APIResponse<DiscardedResponseBody> = try await APIClient.shared.post(
                AttachmentsEndpoint.byAttachmentIdStatus(attachmentId: payload.attachmentId),
                body: body
            )
            logger.info("reportAttachmentStatus dispatched att=\(payload.attachmentId, privacy: .public) action=\(payload.action, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("reportAttachmentStatus 404 att=\(payload.attachmentId, privacy: .public) — attachement disparu, accepté comme succès")
        }
    }

    /// #8303 — la consommation des flammes-œil lues, rejouée jusqu'à ce que la
    /// passerelle l'accepte. Idempotente : un rejeu ne consomme rien de plus,
    /// et une conversation disparue (404) n'a plus rien à consommer.
    func dispatchConsumeAfterRead(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ConsumeAfterReadPayload.self)
        do {
            let consumed = try await MessageService.shared.consumeAfterRead(
                conversationId: payload.conversationId, messageIds: payload.messageIds)
            logger.info("consumeAfterRead dispatched conv=\(payload.conversationId, privacy: .public) consumed=\(consumed.count, privacy: .public)/\(payload.messageIds.count, privacy: .public)")
        } catch let MeeshyError.server(statusCode, _) where statusCode == 404 {
            logger.warning("consumeAfterRead 404 conv=\(payload.conversationId, privacy: .public) — conversation disparue, accepté")
        }
    }

    /// #9617 — une capture d'un contenu qui disparaît, déclarée tant que la
    /// passerelle l'accepte : une panne ou un budget dépassé se rejouent avec
    /// le recul exponentiel de la file, un refus FINAL fait partir la ligne.
    /// Sans risque de double annonce : la passerelle en écrit au plus une par
    /// (acteur, message, sorte de capture).
    func dispatchReportContentCapture(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: ReportContentCapturePayload.self)
        let result: Result<[String], Error>
        do {
            result = .success(try await ContentCaptureService.shared.sendContentCapture(payload.report))
        } catch {
            result = .failure(error)
        }
        switch ContentCaptureDispatchOutcome.of(result, declared: payload.messageIds, attempts: record.attempts) {
        case .done:
            logger.info("reportContentCapture dispatched conv=\(payload.conversationId, privacy: .public) kind=\(payload.kind.rawValue, privacy: .public)")
        case .drop:
            logger.warning("reportContentCapture refused for good conv=\(payload.conversationId, privacy: .public)")
        case .retry:
            if case .failure(let error) = result { throw error }
            throw ContentCaptureRefusal(code: "NOT_YET_NOTICED")
        }
    }

    func dispatchMarkAsRead(_ record: OutboxRecord) async throws {
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
    func dispatchCreateConversation(_ record: OutboxRecord) async throws {
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
    func dispatchUpdateConversation(_ record: OutboxRecord) async throws {
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
    func dispatchUpdateSettings(_ record: OutboxRecord) async throws {
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

    /// `POST /posts/:id/repost` — gateway wraps through `withMutationLog`
    /// (fil rouge du repost, lot 7 tâche 7.1) : le cmid dédoublonne un rejeu
    /// réseau, `repostPost` n'étant PAS naturellement idempotent (chaque
    /// appel fabrique un `Post` neuf).
    ///
    /// `targetType` voyage TOUJOURS depuis `RepostPostPayload` (jamais
    /// optionnel) — Loi 5 (« le repost miroite »):
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
    func dispatchRepostPost(_ record: OutboxRecord) async throws {
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

    // `dispatchCreateComment` vit dans `OutboxDispatcher+Comments.swift` : il
    // téléverse les pièces du commentaire avant de l'écrire (#9743).

    /// `DELETE /posts/:postId/comments/:commentId` — gateway wraps
    /// through `withMutationLog`. The route needs `postId` so the
    /// payload carries it ; without it we'd have to look up the comment
    /// owner which defeats the offline-first invariant.
    /// 404 = comment gone (raced with another delete), accept as success.
    func dispatchDeleteComment(_ record: OutboxRecord) async throws {
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
    func dispatchToggleLikeComment(_ record: OutboxRecord) async throws {
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
}
