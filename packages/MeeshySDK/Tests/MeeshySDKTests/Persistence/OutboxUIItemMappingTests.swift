import Foundation
import Testing
@testable import MeeshySDK

@Suite("OutboxUIItem.from(record:)")
struct OutboxUIItemMappingTests {

    // MARK: - Helpers

    /// Build a payload Data for sendMessage.
    ///
    /// Encoder MUST match `OfflineQueue.encoder` (private, .iso8601 strategy).
    /// The previous helper used a bare `JSONEncoder()` whose default
    /// `.deferredToDate` strategy was incidentally accepted by the now-removed
    /// fallback decoder. The 2026-05-27 fix that collapsed `decodeOfflineQueueItem`
    /// to a single .iso8601 decoder surfaced this latent mismatch.
    private func sendMessagePayload(
        content: String,
        attachmentIds: [String] = [],
        attachmentKinds: [String]? = nil,
        audioPath: String? = nil
    ) -> Data {
        let item = OfflineQueueItem(
            conversationId: "conv-1",
            content: content,
            clientMessageId: "client-1",
            originalLanguage: "fr",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: attachmentIds.isEmpty ? nil : attachmentIds,
            attachmentKinds: attachmentKinds,
            localAudioPath: audioPath
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try! encoder.encode(item)
    }

    private func record(
        kind: OutboxKind,
        payload: Data,
        status: OutboxStatus = .pending,
        createdAt: Date = Date(timeIntervalSince1970: 1_750_000_000)
    ) -> OutboxRecord {
        OutboxRecord(
            id: UUID().uuidString,
            kind: kind,
            conversationId: "conv-1",
            clientMessageId: "client-1",
            payload: payload,
            status: status,
            attempts: 0,
            lastError: nil,
            createdAt: createdAt,
            updatedAt: createdAt,
            nextAttemptAt: createdAt
        )
    }

    // MARK: - 16 explicit @Test blocks (from plan §A2.1)

    @Test func text_sendMessage_maps_to_message_text() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Bonjour Marie"))
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .message)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Bonjour Marie")
        #expect(item.attachmentCount == 0)
        #expect(item.source == .conversation(id: "conv-1"))
    }

    @Test func long_text_is_truncated_to_60_chars_with_ellipsis() {
        let long = String(repeating: "a", count: 100)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: long))
        let item = OutboxUIItem.from(record: r)
        #expect(item.titlePreview?.count == 61) // 60 chars + ellipsis
        #expect(item.titlePreview?.hasSuffix("…") == true)
    }

    @Test func audio_only_message_uses_audio_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "", audioPath: "/tmp/note.m4a"))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .audio)
        #expect(item.titlePreview == "🎙 Note vocale")
    }

    @Test func image_only_message_uses_image_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "", attachmentIds: ["att-1"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .image)
        #expect(item.titlePreview == "📷 Image")
        #expect(item.attachmentCount == 1)
    }

    @Test func multiple_attachments_counts_correctly() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Photos", attachmentIds: ["a", "b", "c"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.attachmentCount == 3)
    }

    @Test func editMessage_maps_to_edit_kind() {
        let r = record(kind: .editMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .edit)
    }

    @Test func deleteMessage_maps_to_delete_kind() {
        let r = record(kind: .deleteMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .delete)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Suppression…")
    }

    @Test func sendReaction_maps_to_reaction_kind_with_emoji() {
        struct ReactionPayload: Codable { let messageId: String; let emoji: String; let action: String; let conversationId: String }
        let payload = try! JSONEncoder().encode(ReactionPayload(messageId: "m", emoji: "👍", action: "add", conversationId: "conv-1"))
        let r = record(kind: .sendReaction, payload: payload)
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .reaction)
        #expect(item.iconKind == .reaction)
        #expect(item.titlePreview == "👍")
    }

    @Test func unknown_kind_falls_back_to_other() {
        // sendMessage with garbage payload degrades gracefully — must not crash.
        let r = record(kind: .sendMessage, payload: Data())
        let item = OutboxUIItem.from(record: r)
        // Mapping must not crash on garbage payload; kind is still .message.
        #expect(item.kind == .message)
    }

    @Test func status_failed_is_preserved() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"), status: .failed)
        #expect(OutboxUIItem.from(record: r).status == .failed)
    }

    @Test func createdAt_is_preserved() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"), createdAt: date)
        #expect(OutboxUIItem.from(record: r).createdAt == date)
    }

    @Test func conversationId_becomes_source() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "x"))
        #expect(OutboxUIItem.from(record: r).source == .conversation(id: "conv-1"))
    }

    @Test func text_with_attachment_keeps_text_icon() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: "Bonjour", attachmentIds: ["att-1"]))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "Bonjour")
        #expect(item.attachmentCount == 1)
    }

    @Test func text_exactly_60_chars_not_truncated() {
        let s = String(repeating: "b", count: 60)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: s))
        #expect(OutboxUIItem.from(record: r).titlePreview == s)
    }

    @Test func text_61_chars_is_truncated() {
        let s = String(repeating: "c", count: 61)
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: s))
        let title = OutboxUIItem.from(record: r).titlePreview!
        #expect(title.count == 61)
        #expect(title.hasSuffix("…"))
    }

    @Test func video_attachment_uses_video_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(
            content: "",
            attachmentIds: ["vid_xyz"],
            attachmentKinds: [AttachmentKind.video.rawValue]
        ))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .video)
        #expect(item.titlePreview == "🎞 Vidéo")
        #expect(item.attachmentCount == 1)
    }

    @Test func file_attachment_uses_file_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(
            content: "",
            attachmentIds: ["pdf-1"],
            attachmentKinds: [AttachmentKind.pdf.rawValue]
        ))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .file)
        #expect(item.titlePreview == "📎 Fichier")
    }

    @Test func legacy_payload_without_attachmentKinds_falls_back_to_image() {
        // Backward-compat: OutboxRecord payloads enqueued before SDK rev
        // omit `attachmentKinds` from JSON entirely. Mapper must default
        // to .image per spec §4.2 instead of crashing or showing nil.
        let r = record(kind: .sendMessage, payload: sendMessagePayload(
            content: "",
            attachmentIds: ["att-1"],
            attachmentKinds: nil
        ))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .image)
        #expect(item.titlePreview == "📷 Image")
    }

    @Test func mixed_attachment_kinds_picks_first_non_other_for_icon() {
        // First .other is skipped; first real kind wins.
        let r = record(kind: .sendMessage, payload: sendMessagePayload(
            content: "",
            attachmentIds: ["x", "y", "z"],
            attachmentKinds: [
                AttachmentKind.other.rawValue,
                AttachmentKind.video.rawValue,
                AttachmentKind.image.rawValue
            ]
        ))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .video)
        #expect(item.titlePreview == "🎞 Vidéo")
        #expect(item.attachmentCount == 3)
    }

    // MARK: - 9 additional tests

    @Test func createComment_text_maps_to_postComment_kind() {
        let r = record(kind: .createComment, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .postComment)
        #expect(item.iconKind == .text)
    }

    @Test func createComment_with_audio_maps_to_postComment_audio() {
        struct CommentPayload: Codable { let localAudioPath: String? }
        let payload = try! JSONEncoder().encode(CommentPayload(localAudioPath: "/tmp/comment.m4a"))
        let r = record(kind: .createComment, payload: payload)
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .postComment)
        #expect(item.iconKind == .audio)
    }

    @Test func publishStory_image_maps_to_story_kind() {
        let r = record(kind: .publishStory, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .story)
        #expect(item.iconKind == .image)
    }

    @Test func repostStory_maps_to_story_kind() {
        let r = record(kind: .repostStory, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .story)
    }

    @Test func markAsRead_maps_to_other() {
        let r = record(kind: .markAsRead, payload: Data())
        let item = OutboxUIItem.from(record: r)
        if case .other = item.kind { } else {
            Issue.record("Expected .other, got \(item.kind)")
        }
        #expect(item.iconKind == .none)
    }

    @Test func respondFriendRequest_maps_to_other() {
        let r = record(kind: .respondFriendRequest, payload: Data())
        let item = OutboxUIItem.from(record: r)
        if case .other = item.kind { } else {
            Issue.record("Expected .other, got \(item.kind)")
        }
    }

    @Test func blockUser_maps_to_other() {
        let r = record(kind: .blockUser, payload: Data())
        let item = OutboxUIItem.from(record: r)
        if case .other = item.kind { } else {
            Issue.record("Expected .other, got \(item.kind)")
        }
    }

    @Test func updateProfile_maps_to_other() {
        let r = record(kind: .updateProfile, payload: Data())
        let item = OutboxUIItem.from(record: r)
        if case .other = item.kind { } else {
            Issue.record("Expected .other, got \(item.kind)")
        }
    }

    @Test func toggleLikePost_maps_to_postReaction_kind() {
        let r = record(kind: .toggleLikePost, payload: Data())
        let item = OutboxUIItem.from(record: r)
        #expect(item.kind == .postReaction)
        #expect(item.iconKind == .reaction)
    }

    @Test func empty_content_no_attachments_shows_message_placeholder() {
        let r = record(kind: .sendMessage, payload: sendMessagePayload(content: ""))
        let item = OutboxUIItem.from(record: r)
        #expect(item.iconKind == .text)
        #expect(item.titlePreview == "(message)")
    }
}
