import Foundation
import GRDB

extension APIMessageUpsert {

    struct MergeGuards {
        let keepLocalPlaintext: Bool
        let pendingEdit: Bool
        let pendingDelete: Bool
        let staleLiveCall: Bool
        let pendingReaction: Bool
    }

    static func mergeGuards(
        existing: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        pending: PendingMutations
    ) -> MergeGuards {
        MergeGuards(
            keepLocalPlaintext: api.isEncrypted == true
                && !existing.isEncrypted
                && !(existing.content ?? "").isEmpty,
            pendingEdit: pending.edits.contains(api.id),
            pendingDelete: pending.deletes.contains(api.id),
            staleLiveCall: MessagePersistenceActor.isStaleLiveCallSnapshot(
                existing: existing.callSummaryJson,
                incoming: columns.callSummaryJson
            ),
            pendingReaction: pending.reactions.contains(api.id)
        )
    }

    static func merged(
        _ existing: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        reply: MessagePersistenceActor.IngestedReply,
        pending: PendingMutations
    ) -> MessageRecord {
        let guards = mergeGuards(existing: existing, api: api, columns: columns, pending: pending)
        var record = mergedContent(existing, api: api, columns: columns, guards: guards)
        record = mergedNature(record, api: api, columns: columns, guards: guards)
        record = mergedReferences(record, api: api, columns: columns, reply: reply)
        record = mergedMedia(record, api: api, columns: columns, guards: guards)
        record = mergedSender(record, api: api, columns: columns)
        guard record.viewOnceOpenedAt != nil || api.consumedByMe == true else { return record }
        record.sealAsOpenedViewOnce(at: Date())
        record.deletedAt = existing.deletedAt
        return record
    }

    static func mergedContent(
        _ record: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        guards: MergeGuards
    ) -> MessageRecord {
        var next = record
        if !guards.keepLocalPlaintext && !guards.pendingEdit && !guards.pendingDelete && !guards.staleLiveCall {
            next.content = api.content
        }
        next.serverId = api.id
        next.createdAt = api.createdAt
        next.sentAt = api.createdAt
        next.cachedTimeString = columns.timeString
        if !guards.pendingEdit {
            next.isEdited = api.isEdited ?? false
            next.editedAt = api.editedAt
        }
        if !guards.pendingDelete {
            next.deletedAt = api.deletedAt
        }
        if !guards.keepLocalPlaintext {
            next.isEncrypted = api.isEncrypted ?? next.isEncrypted
            next.encryptionMode = api.encryptionMode ?? next.encryptionMode
        }
        return next
    }

    static func mergedNature(
        _ record: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        guards: MergeGuards
    ) -> MessageRecord {
        var next = record
        next.messageSource = api.messageSource ?? next.messageSource
        next.messageType = api.messageType ?? next.messageType
        next.joinNoticeJson = columns.joinNoticeJson ?? next.joinNoticeJson
        next.callSummaryJson = guards.staleLiveCall
            ? next.callSummaryJson
            : (columns.callSummaryJson ?? next.callSummaryJson)
        next.locationJson = columns.locationJson ?? next.locationJson
        next.stickerJson = columns.stickerJson ?? next.stickerJson
        next.trackedLinksJson = columns.trackedLinksJson ?? next.trackedLinksJson
        next.effectFlags = columns.effectFlags
        next.adoptServedOriginalLanguage(api.originalLanguage)
        next.expiresAt = api.expiresAt ?? next.expiresAt
        next.ephemeralDuration = api.ephemeralDuration ?? next.ephemeralDuration
        return next
    }

    static func mergedReferences(
        _ record: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        reply: MessagePersistenceActor.IngestedReply
    ) -> MessageRecord {
        var next = record
        next.replyToJson = reply.persisted(over: next.replyToJson)
        next.forwardedFromJson = columns.forwardedFromJson
        next.forwardedFromId = api.forwardedFromId ?? next.forwardedFromId
        next.forwardedFromConversationId = api.forwardedFromConversationId ?? next.forwardedFromConversationId
        next.replyToId = api.replyToId ?? next.replyToId
        next.storyReplyToId = api.storyReplyToId ?? next.storyReplyToId
        next.mentionedUsersJson = columns.mentionedUsersJson
        return next
    }

    static func mergedMedia(
        _ record: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns,
        guards: MergeGuards
    ) -> MessageRecord {
        var next = record
        next.attachmentsJson = columns.attachmentsJson ?? next.attachmentsJson
        if !guards.pendingReaction {
            next.reactionsJson = columns.reactionsJson
            next.reactionCount = columns.reactionCount
        }
        next.adoptServedReceipts(
            deliveredCount: columns.deliveredCount, readCount: columns.readCount,
            recipientCount: api.recipientCount,
            deliveredToAllAt: api.deliveredToAllAt, readByAllAt: api.readByAllAt,
            computedState: columns.computedState
        )
        return next
    }

    static func mergedSender(
        _ record: MessageRecord,
        api: APIMessage,
        columns: IncomingColumns
    ) -> MessageRecord {
        var next = record
        next.senderId = columns.resolvedSenderUserId
        next.senderName = columns.senderName
        next.senderUsername = columns.senderUsername
        next.senderAvatarURL = columns.senderAvatarURL
        next.senderIsAnonymous = api.sender.map(\.isAnonymous) ?? next.senderIsAnonymous
        next.senderHasAccount = api.sender.map(\.hasAccount) ?? next.senderHasAccount
        next.senderRingJson = MessageRecord.servedSenderRingJson(api.sender, id: api.id) ?? next.senderRingJson
        return next
    }

    static func persistMerged(
        _ updated: MessageRecord,
        before: MessageRecord,
        api: APIMessage,
        in db: Database
    ) throws -> Bool {
        let rowChanged = !upsertMutatedFieldsEqual(updated, before)
            || (api.updatedAt != nil && api.updatedAt != before.updatedAt)
        guard rowChanged else { return false }
        var row = updated
        row.updatedAt = api.updatedAt ?? Date()
        row.changeVersion += 1
        try row.update(db)
        guard row.localId != api.id else { return true }
        try MessageRecord.deleteOne(db, key: api.id)
        try PendingIdRecord(
            localId: row.localId, serverId: api.id,
            conversationId: api.conversationId, reconciledAt: Date()
        ).save(db)
        return true
    }

    static func inserted(
        api: APIMessage,
        columns: IncomingColumns,
        reply: MessagePersistenceActor.IngestedReply
    ) -> MessageRecord {
        var record = MessageRecord(
            localId: api.id, serverId: api.id,
            conversationId: api.conversationId,
            senderId: columns.resolvedSenderUserId,
            content: api.content,
            originalLanguage: api.originalLanguage ?? "fr",
            messageType: api.messageType ?? "text",
            messageSource: api.messageSource ?? "user",
            contentType: "text",
            state: columns.computedState,
            retryCount: 0, lastError: nil,
            isEncrypted: api.isEncrypted ?? false,
            encryptionMode: api.encryptionMode,
            encryptedPayload: nil,
            replyToId: api.replyToId,
            storyReplyToId: api.storyReplyToId,
            forwardedFromId: api.forwardedFromId,
            forwardedFromConversationId: api.forwardedFromConversationId,
            replyToJson: reply.persisted(over: nil),
            forwardedFromJson: columns.forwardedFromJson,
            expiresAt: api.expiresAt,
            effectFlags: columns.effectFlags,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: api.isEdited ?? false,
            editedAt: api.editedAt,
            deletedAt: api.deletedAt,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: columns.senderName,
            senderUsername: columns.senderUsername,
            senderColor: nil,
            senderAvatarURL: columns.senderAvatarURL,
            deliveredCount: columns.deliveredCount,
            readCount: columns.readCount,
            deliveredToAllAt: api.deliveredToAllAt,
            readByAllAt: api.readByAllAt,
            createdAt: api.createdAt,
            sentAt: api.createdAt,
            deliveredAt: api.deliveredToAllAt,
            readAt: api.readByAllAt,
            updatedAt: api.updatedAt ?? Date(),
            attachmentsJson: columns.attachmentsJson,
            reactionsJson: columns.reactionsJson,
            reactionCount: columns.reactionCount,
            currentUserReactionsJson: nil,
            mentionedUsersJson: columns.mentionedUsersJson,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            cachedTimeString: columns.timeString,
            changeVersion: 0,
            callSummaryJson: columns.callSummaryJson,
            joinNoticeJson: columns.joinNoticeJson,
            recipientCount: api.recipientCount ?? 0,
            locationJson: columns.locationJson,
            stickerJson: columns.stickerJson,
            ephemeralDuration: api.ephemeralDuration,
            trackedLinksJson: columns.trackedLinksJson,
            senderIsAnonymous: api.sender.map(\.isAnonymous), senderHasAccount: api.sender.map(\.hasAccount),
            senderRingJson: MessageRecord.servedSenderRingJson(api.sender, id: api.id) ?? nil
        )
        if api.consumedByMe == true {
            record.sealAsOpenedViewOnce(at: Date())
        }
        return record
    }

    static func persistInserted(_ record: MessageRecord, api: APIMessage, in db: Database) throws {
        try record.insert(db)
        try PendingIdRecord(
            localId: api.id, serverId: api.id,
            conversationId: api.conversationId,
            reconciledAt: Date()
        ).save(db)
    }

    static func persistTranslations(for api: APIMessage, in db: Database) throws {
        let viewOnceOpenedForReader = try api.consumedByMe == true
            || MessageRecord
                .filter(Column("localId") == api.id || Column("serverId") == api.id)
                .filter(Column("viewOnceOpenedAt") != nil)
                .fetchCount(db) > 0
        guard !viewOnceOpenedForReader, let apiTranslations = api.translations, !apiTranslations.isEmpty else { return }
        let now = Date()
        for t in apiTranslations {
            let record = TranslationRecord(
                id: t.id,
                messageLocalId: api.id,
                messageServerId: api.id,
                targetLanguage: t.targetLanguage,
                translatedContent: t.translatedContent,
                translationModel: t.translationModel ?? "",
                confidenceScore: t.confidenceScore,
                sourceLanguage: t.sourceLanguage,
                receivedAt: now
            )
            try TranslationRecordWriter.upsert(record, in: db)
        }
    }
}
