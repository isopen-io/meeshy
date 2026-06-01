import Foundation
import MeeshySDK

/// Pure transformer that turns a list of `MeeshyMessage` into an ordered queue
/// of unlistened audio attachments to play sequentially. No UI, no engine, no
/// coordinator — fully deterministic and testable.
///
/// Rules:
///  1. Only attachments with `type == .audio` are considered.
///  2. Self-audios (sender == `currentUserId`) are excluded — EXCEPT the
///     cursor message (the one containing `startingAfterAttachmentId`). The
///     user can tap-play their own multi-audio message, and the tail must
///     include that same message's later sibling tracks so auto-advance walks
///     through tracks #2/#3 (BUG F).
///  3. Attachments whose id is in `listenedAttachmentIds` are excluded.
///  4. When a cursor (`startingAfterAttachmentId`) is provided, only audios
///     that come strictly AFTER it (by `receivedAt`, then by message
///     attachment-index when within the same message) are kept.
///  5. Output is sorted by `receivedAt` ascending, ties broken by
///     `attachmentId` lex ascending (stability).
///  6. Within a single source message, the original attachment order is
///     preserved — overriding the lex tie-breaker for siblings.
public enum AudioQueueBuilder {

    public static func build(
        from messages: [MeeshyMessage],
        startingAfterAttachmentId: String?,
        currentUserId: String,
        listenedAttachmentIds: Set<String>
    ) -> [QueuedAudio] {
        let cursorReceivedAt: Date? = startingAfterAttachmentId.flatMap { cursorId in
            messages.first { $0.attachments.contains(where: { $0.id == cursorId }) }
                .map(\.createdAt)
        }
        // BUG F — the cursor message is exempt from the self-author filter so
        // the user's own multi-audio message yields its sibling tracks into
        // the tail (auto-advance through #2/#3). Other self-authored messages
        // stay excluded.
        let cursorMessageIdForSelfExemption: String? = startingAfterAttachmentId
            .flatMap { findMessageId(for: $0, in: messages) }

        let candidates: [QueuedAudio] = messages.flatMap { message -> [QueuedAudio] in
            let isCursorMessage = message.id == cursorMessageIdForSelfExemption
            guard message.senderId != currentUserId || isCursorMessage else { return [] }
            return message.attachments.compactMap { att -> QueuedAudio? in
                guard att.type == .audio else { return nil }
                guard !listenedAttachmentIds.contains(att.id) else { return nil }
                return QueuedAudio(
                    attachmentId: att.id,
                    messageId: message.id,
                    conversationId: message.conversationId,
                    fileUrl: att.fileUrl,
                    durationMs: att.duration ?? 0,
                    senderName: message.senderName ?? "",
                    senderAvatarURL: message.senderAvatarURL,
                    receivedAt: message.createdAt
                )
            }
        }

        let filteredByCursor: [QueuedAudio]
        if let cursorDate = cursorReceivedAt, let cursorId = startingAfterAttachmentId {
            let cursorMessageId = findMessageId(for: cursorId, in: messages)
            filteredByCursor = candidates.filter { audio in
                if audio.receivedAt > cursorDate { return true }
                if audio.receivedAt == cursorDate {
                    if audio.attachmentId == cursorId { return false }
                    if let mid = cursorMessageId, audio.messageId == mid {
                        return isAfterInMessage(cursorId, target: audio.attachmentId, in: messages)
                    }
                    return false
                }
                return false
            }
        } else {
            filteredByCursor = candidates
        }

        let sorted = filteredByCursor.sorted { lhs, rhs in
            if lhs.receivedAt != rhs.receivedAt { return lhs.receivedAt < rhs.receivedAt }
            return lhs.attachmentId < rhs.attachmentId
        }

        return reorderByMessageAttachmentIndex(sorted, messages: messages)
    }

    // MARK: - Helpers

    private static func findMessageId(for attachmentId: String, in messages: [MeeshyMessage]) -> String? {
        messages.first { $0.attachments.contains(where: { $0.id == attachmentId }) }?.id
    }

    private static func isAfterInMessage(_ cursorId: String, target: String, in messages: [MeeshyMessage]) -> Bool {
        guard let message = messages.first(where: { msg in
            msg.attachments.contains { $0.id == cursorId } &&
            msg.attachments.contains { $0.id == target }
        }) else { return true }
        let ids = message.attachments.map(\.id)
        guard let cursorIdx = ids.firstIndex(of: cursorId),
              let targetIdx = ids.firstIndex(of: target) else { return true }
        return targetIdx > cursorIdx
    }

    private static func reorderByMessageAttachmentIndex(
        _ queue: [QueuedAudio], messages: [MeeshyMessage]
    ) -> [QueuedAudio] {
        let grouped = Dictionary(grouping: queue, by: { $0.messageId })
        var result: [QueuedAudio] = []
        var emittedMessageIds: Set<String> = []
        for audio in queue {
            guard !emittedMessageIds.contains(audio.messageId) else { continue }
            emittedMessageIds.insert(audio.messageId)
            guard let group = grouped[audio.messageId] else { continue }
            if let message = messages.first(where: { $0.id == audio.messageId }) {
                let orderedIds = message.attachments.map(\.id)
                let ordered = group.sorted { lhs, rhs in
                    let li = orderedIds.firstIndex(of: lhs.attachmentId) ?? Int.max
                    let ri = orderedIds.firstIndex(of: rhs.attachmentId) ?? Int.max
                    return li < ri
                }
                result.append(contentsOf: ordered)
            } else {
                result.append(contentsOf: group)
            }
        }
        return result
    }
}
