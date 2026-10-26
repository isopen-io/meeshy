import Foundation
import MeeshySDK

/// How a comment leaves the device: the one publisher (`CommentPublisher`,
/// the only door) and, when the network fails, the offline queue with its
/// pieces (`CommentMediaDelivery.entrust`).
struct CommentSendTransport {
    var publish: @MainActor (CreateCommentPayload, [PendingCommentMedia]) async throws -> APIPostComment?
    var entrust: @MainActor (CreateCommentPayload, [PendingCommentMedia], [UploadedCommentMedia]) async throws -> Void

    static var live: CommentSendTransport {
        CommentSendTransport(
            publish: { payload, media in
                try await CommentPublisher.live.publish(payload, pieces: CommentPublisher.pieces(media))
            },
            entrust: { payload, media, acquired in
                try await CommentMediaDelivery.entrust(payload, medias: media, acquired: acquired)
            })
    }
}

/// How a send ended. `refused` and `unqueued` have withdrawn the optimistic
/// row: the comment goes back to the composer.
enum CommentSendOutcome: Equatable {
    case delivered
    case entrusted
    /// A refusal the queue would only repeat (daily limit, permanent server refusal).
    case refused(cause: Error)
    /// Neither sent nor accepted by the queue.
    case unqueued

    static func == (lhs: CommentSendOutcome, rhs: CommentSendOutcome) -> Bool {
        switch (lhs, rhs) {
        case (.delivered, .delivered), (.entrusted, .entrusted), (.refused, .refused), (.unqueued, .unqueued): true
        default: false
        }
    }
}

enum OptimisticPlacement {
    case first
    case last
}

extension FeedComment {

    /// The row a comment shows while it travels, keyed by its client
    /// mutation id: the server deduplicates a replay by it and echoes it back
    /// in `comment:added`, so the row is reconciled by exact id.
    static func optimistic(
        id: String, by author: MeeshyUser?, content: String, parentId: String?,
        effectFlags: Int?, originalLanguage: String?, media: [FeedMedia] = [],
        location: SharedPlace? = nil, quoted: CommentQuotedMedia? = nil, fallbackName: String = ""
    ) -> FeedComment {
        FeedComment(
            id: id, author: author?.displayName ?? author?.username ?? fallbackName,
            authorId: author?.id ?? "", authorUsername: author?.username, authorAvatarURL: author?.avatar,
            content: content, timestamp: Date(), likes: 0, replies: 0, parentId: parentId,
            effectFlags: effectFlags ?? 0, originalLanguage: originalLanguage, media: media,
            location: location, quotedMedia: quoted)
    }

    /// The row the gateway served for a comment just published. The citation
    /// is the SERVED one: the server may keep only the anchor of a media that
    /// vanished between the choice and the send.
    init(sent api: APIPostComment, parentId: String?, effectFlags: Int?, quoted: CommentQuotedMedia?) {
        self.init(
            id: api.id, author: api.author.name, authorId: api.author.id,
            authorUsername: api.author.username, authorAvatarURL: api.author.avatar,
            content: api.content, timestamp: api.createdAt, likes: 0, replies: 0, parentId: parentId,
            effectFlags: api.effectFlags ?? effectFlags ?? 0, originalLanguage: api.originalLanguage,
            media: (api.media ?? []).map { $0.toFeedMedia() }, quotedMedia: api.quotedCitation ?? quoted)
    }
}

/// The optimistic send (#13133): the row, the direct publish and its
/// reconcile, the queue, the rollback — one rule for the three surfaces.
extension CommentThreadViewModel {

    /// A reply goes under its parent (thread expanded, parent counts one more
    /// reply); a root goes at the head of the list, or at its end (`.last`,
    /// the story overlay).
    func insertOptimistic(_ row: FeedComment, at placement: OptimisticPlacement = .first) {
        guard let parentId = row.parentId else {
            roots = placed(row, in: roots, placement)
            return
        }
        replies[parentId] = placed(row, in: replies[parentId] ?? [], placement)
        expandedThreads.insert(parentId)
        if let index = roots.firstIndex(where: { $0.id == parentId }) { roots[index].replies += 1 }
    }

    /// Withdraws the optimistic row `id` — and only it
    /// (`FeedCommentThread.withdrawingOptimistic`). `true` when it was there.
    @discardableResult
    func withdrawOptimistic(_ id: String, parentId: String?) -> Bool {
        let withdrawal = thread.withdrawingOptimistic(id, parentId: parentId)
        thread = withdrawal.thread
        return withdrawal.removed
    }

    /// Swaps the optimistic row for the served one — in place, or at the head
    /// when the socket echo already took it away. Idempotent.
    func reconcileSent(_ server: FeedComment, replacing tempId: String) {
        func swapped(_ rows: [FeedComment]) -> [FeedComment] {
            if let index = rows.firstIndex(where: { $0.id == tempId }) {
                return rows.enumerated().map { $0.offset == index ? server : $0.element }
            }
            return rows.contains { $0.id == server.id } ? rows : [server] + rows
        }
        guard let parentId = server.parentId else {
            roots = swapped(roots)
            return
        }
        replies[parentId] = swapped(replies[parentId] ?? [])
    }

    /// Publishes the comment; on success the served row replaces the
    /// optimistic one. When the network fails the SAME payload (same cmid)
    /// joins the queue with its pieces, and the row stays for the echo. A
    /// refusal the queue would only repeat, or a queue that refuses, withdraws
    /// the row. Nothing is written into a thread the surface has left.
    func deliver(
        _ payload: CreateCommentPayload, media: [PendingCommentMedia],
        quoted: CommentQuotedMedia? = nil, for sentFor: CommentThreadEntity? = nil
    ) async -> CommentSendOutcome {
        let target = sentFor ?? entity
        let parentId = payload.parentCommentId
        do {
            let served = try await transport.publish(payload, media)
            CommentMediaUploader.discardLocalFiles(media)
            CommentSendTrace.log(served == nil ? "direct : confirmé sans description (rejeu dédoublonné)" : "direct : créé")
            if let served, entity == target {
                reconcileSent(FeedComment(sent: served, parentId: parentId, effectFlags: payload.effectFlags, quoted: quoted),
                              replacing: payload.clientMutationId)
            }
            return .delivered
        } catch {
            CommentSendTrace.log("direct : échec — \(String(describing: error))")
            if CommentMediaDelivery.isPermanentRefusal(error) {
                if entity == target { withdrawOptimistic(payload.clientMutationId, parentId: parentId) }
                return .refused(cause: CommentMediaDelivery.cause(of: error))
            }
            do {
                try await transport.entrust(payload, media, CommentMediaDelivery.acquired(from: error))
                return .entrusted
            } catch {
                if entity == target { withdrawOptimistic(payload.clientMutationId, parentId: parentId) }
                return .unqueued
            }
        }
    }

    private func placed(_ row: FeedComment, in rows: [FeedComment], _ placement: OptimisticPlacement) -> [FeedComment] {
        placement == .first ? [row] + rows : rows + [row]
    }
}
