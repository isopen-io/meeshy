import Foundation
import GRDB

enum APIMessageUpsert {

    struct Context: Sendable {
        let currentUserId: String?
        let preferredLanguages: [String]
    }

    struct PendingMutations: Sendable {
        let reactions: Set<String>
        let edits: Set<String>
        let deletes: Set<String>

        static func load(_ db: Database) -> PendingMutations {
            PendingMutations(
                reactions: PendingOutboxLookup.messageIds(
                    db, kind: .sendReaction, payload: ReactionOutboxPayload.self
                ) { $0.messageId },
                edits: PendingOutboxLookup.messageIds(
                    db, kind: .editMessage, payload: OfflineEditPayload.self
                ) { $0.messageId },
                deletes: PendingOutboxLookup.messageIds(
                    db, kind: .deleteMessage, payload: OfflineDeletePayload.self
                ) { $0.messageId }
            )
        }
    }

    struct IncomingColumns {
        let attachmentsJson: Data?
        let reactionsJson: Data?
        let reactionCount: Int
        let forwardedFromJson: Data?
        let mentionedUsersJson: Data?
        let callSummaryJson: Data?
        let joinNoticeJson: Data?
        let locationJson: String?
        let stickerJson: String?
        let trackedLinksJson: String?
        let effectFlags: UInt32
        let deliveredCount: Int
        let readCount: Int
        let computedState: MessageState
        let timeString: String
        let resolvedSenderUserId: String
        let senderName: String?
        let senderUsername: String?
        let senderAvatarURL: String?
    }

    static func upsertBatch(_ apiMessages: [APIMessage], context: Context, in db: Database) throws -> Set<String> {
        let pending = PendingMutations.load(db)
        let encoder = JSONEncoder()
        var changedConversationIds: Set<String> = []
        for api in apiMessages {
            if let conversationId = try upsertOne(api, context: context, pending: pending, encoder: encoder, in: db) {
                changedConversationIds.insert(conversationId)
            }
        }
        return changedConversationIds
    }

    static func upsertOne(
        _ api: APIMessage,
        context: Context,
        pending: PendingMutations,
        encoder: JSONEncoder,
        in db: Database
    ) throws -> String? {
        let incoming = columns(for: api, context: context, encoder: encoder)
        let reply = MessagePersistenceActor.ingestedReply(
            for: api, currentUserId: context.currentUserId,
            preferredLanguages: context.preferredLanguages, encoder: encoder,
            quotedDeletedAt: try MessagePersistenceActor.deletedAtOfQuotedMessage(api.replyToId, in: db)
        )
        let changedConversationId: String?
        if let existing = try existingRecord(for: api, in: db) {
            let updated = merged(existing, api: api, columns: incoming, reply: reply, pending: pending)
            let written = try persistMerged(updated, before: existing, api: api, in: db)
            changedConversationId = written ? api.conversationId : nil
        } else {
            try persistInserted(inserted(api: api, columns: incoming, reply: reply), api: api, in: db)
            changedConversationId = api.conversationId
        }
        try persistTranslations(for: api, in: db)
        return changedConversationId
    }

    static func columns(for api: APIMessage, context: Context, encoder: JSONEncoder) -> IncomingColumns {
        let senderName = api.sender?.name
        let uiReactions = MeeshyReaction.reconstructFromSummary(
            messageId: api.id,
            reactionSummary: api.reactionSummary,
            currentUserReactions: api.currentUserReactions,
            currentUserId: context.currentUserId
        )
        let deliveredCount = api.deliveredCount ?? 0
        let readCount = api.readCount ?? 0
        return IncomingColumns(
            attachmentsJson: attachmentsJson(for: api, senderName: senderName, encoder: encoder),
            reactionsJson: uiReactions.isEmpty ? nil : encoder.encodeOrLog(uiReactions, field: "reactionsJson", id: api.id),
            reactionCount: uiReactions.count,
            forwardedFromJson: forwardedFromJson(for: api, encoder: encoder),
            mentionedUsersJson: api.mentionedUsers.flatMap {
                $0.isEmpty ? nil : encoder.encodeOrLog($0, field: "mentionedUsersJson", id: api.id)
            },
            callSummaryJson: api.callSummary.flatMap { encoder.encodeOrLog($0, field: "callSummaryJson", id: api.id) },
            joinNoticeJson: api.systemNoticeJson(encoder: encoder),
            locationJson: MessageRecord.encodeJSONText(api.location, field: "locationJson", id: api.id),
            stickerJson: MessageRecord.encodeJSONText(api.sticker, field: "stickerJson", id: api.id),
            trackedLinksJson: MessageRecord.encodeJSONText(
                api.trackingLinks.flatMap { $0.isEmpty ? nil : $0 }, field: "trackedLinksJson", id: api.id),
            effectFlags: effectFlags(for: api),
            deliveredCount: deliveredCount,
            readCount: readCount,
            computedState: computedState(deliveredCount: deliveredCount, readCount: readCount, api: api),
            timeString: MessageRecord.computeTimeString(for: api.createdAt),
            resolvedSenderUserId: api.sender?.resolvedUserId ?? api.senderId,
            senderName: senderName,
            senderUsername: api.sender?.username,
            senderAvatarURL: api.sender?.resolvedAvatar
        )
    }

    static func computedState(deliveredCount: Int, readCount: Int, api: APIMessage) -> MessageState {
        if readCount > 0 || api.readByAllAt != nil { return .delivered }
        if deliveredCount > 0 || api.deliveredToAllAt != nil { return .delivered }
        return .sent
    }

    static func effectFlags(for api: APIMessage) -> UInt32 {
        let served = api.effectFlags ?? 0
        guard served == 0 else { return served }
        var flags = MessageEffectFlags()
        if api.isBlurred == true { flags.insert(.blurred) }
        if api.isViewOnce == true { flags.insert(.viewOnce) }
        if api.expiresAt != nil { flags.insert(.ephemeral) }
        return flags.rawValue
    }

    static func existingRecord(for api: APIMessage, in db: Database) throws -> MessageRecord? {
        if let cid = api.clientMessageId, !cid.isEmpty,
           let byClientId = try MessageRecord.fetchOne(db, key: cid) {
            return byClientId
        }
        if let pendingMatch = try PendingIdRecord.filter(Column("serverId") == api.id).fetchOne(db),
           let optimistic = try MessageRecord.fetchOne(db, key: pendingMatch.localId) {
            return optimistic
        }
        if let direct = try MessageRecord.fetchOne(db, key: api.id) {
            return direct
        }
        return try MessageRecord.filter(Column("serverId") == api.id).fetchOne(db)
    }
}
