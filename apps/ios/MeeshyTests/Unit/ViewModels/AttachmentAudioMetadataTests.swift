import XCTest
@testable import Meeshy
import MeeshySDK

final class AttachmentAudioMetadataTests: XCTestCase {

    private func makeTranscription(attachmentId: String, text: String) -> MessageTranscription {
        MessageTranscription(attachmentId: attachmentId, text: text, language: "fr")
    }

    private func makeAudio(attachmentId: String, language: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            attachmentId: attachmentId, language: language, url: "https://cdn/\(attachmentId)-\(language).mp3",
            transcription: "t", durationMs: 1000, format: "mp3", cloned: false, quality: 1, voiceModelId: nil,
            ttsModel: "tts", segments: []
        )
    }

    private func makeEntry(
        message: String = "m1", attachment: String, text: String? = nil, audios: [String] = []
    ) -> AttachmentAudioEntry {
        AttachmentAudioEntry(
            messageId: message,
            attachmentId: attachment,
            transcription: text.map { makeTranscription(attachmentId: attachment, text: $0) },
            translatedAudios: audios.map { makeAudio(attachmentId: attachment, language: $0) }
        )
    }

    func test_recordWithTranscription_fillsPerMessageAndPerAttachment() {
        let entry = makeEntry(attachment: "a1", text: "bonjour", audios: ["en"])

        let state = AttachmentAudioMetadata.merged([entry], into: AttachmentAudioState(), forceOverwrite: false)

        XCTAssertEqual(state.transcriptions["m1"]?.text, "bonjour")
        XCTAssertEqual(state.transcriptionsByAttachment["a1"]?.text, "bonjour")
        XCTAssertEqual(state.translatedAudios["m1"]?.count, 1)
        XCTAssertEqual(state.translatedAudiosByAttachment["a1"]?.count, 1)
    }

    func test_withoutForceOverwrite_keepsExistingEntries() {
        var current = AttachmentAudioState()
        current.transcriptions["m1"] = makeTranscription(attachmentId: "a1", text: "ancien")
        current.transcriptionsByAttachment["a1"] = makeTranscription(attachmentId: "a1", text: "ancien")

        let state = AttachmentAudioMetadata.merged(
            [makeEntry(attachment: "a1", text: "nouveau")], into: current, forceOverwrite: false
        )

        XCTAssertEqual(state.transcriptions["m1"]?.text, "ancien")
        XCTAssertEqual(state.transcriptionsByAttachment["a1"]?.text, "ancien")
    }

    func test_withoutForceOverwrite_multiAudioMessage_firstTrackWinsPerMessage_eachKeepsItsOwn() {
        let entries = [makeEntry(attachment: "a1", text: "un"), makeEntry(attachment: "a2", text: "deux")]

        let state = AttachmentAudioMetadata.merged(entries, into: AttachmentAudioState(), forceOverwrite: false)

        XCTAssertEqual(state.transcriptions["m1"]?.text, "un")
        XCTAssertEqual(state.transcriptionsByAttachment["a2"]?.text, "deux")
    }

    func test_forceOverwrite_replaces() {
        var current = AttachmentAudioState()
        current.transcriptions["m1"] = makeTranscription(attachmentId: "a1", text: "ancien")

        let state = AttachmentAudioMetadata.merged(
            [makeEntry(attachment: "a1", text: "nouveau")], into: current, forceOverwrite: true
        )

        XCTAssertEqual(state.transcriptions["m1"]?.text, "nouveau")
    }

    func test_emptyEntry_changesNothing() {
        let state = AttachmentAudioMetadata.merged(
            [makeEntry(attachment: "a1")], into: AttachmentAudioState(), forceOverwrite: true
        )

        XCTAssertEqual(state, AttachmentAudioState())
    }

    func test_undecodableAttachmentsJson_isSkipped() {
        let record = MessageRecord.audioMetadataFixture(localId: "l1", serverId: nil, attachmentsJson: Data("pas du json".utf8))

        let entries = AttachmentAudioMetadata.entries(fromRecords: [record])

        XCTAssertTrue(entries.isEmpty)
    }

    func test_recordWithEmbeddedTranscription_keysByServerIdWhenPresent() throws {
        let attachment = MeeshyMessageAttachment(
            id: "a1", mimeType: "audio/m4a",
            transcription: MeeshyMessageAttachment.EmbeddedTranscription(text: "salut", language: "fr")
        )
        let json = try JSONEncoder().encode([attachment])
        let record = MessageRecord.audioMetadataFixture(localId: "cid_1", serverId: "srv1", attachmentsJson: json)

        let entries = AttachmentAudioMetadata.entries(fromRecords: [record])

        XCTAssertEqual(entries.first?.messageId, "srv1")
        XCTAssertEqual(entries.first?.transcription?.text, "salut")
    }
}

extension MessageRecord {
    static func audioMetadataFixture(localId: String, serverId: String?, attachmentsJson: Data?) -> MessageRecord {
        MessageRecord(
            localId: localId, serverId: serverId,
            conversationId: "000000000000000000000077", senderId: "u1",
            content: nil, originalLanguage: "fr",
            messageType: "audio", messageSource: "user", contentType: "audio",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: Date(), sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: Date(),
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 1
        )
    }
}
