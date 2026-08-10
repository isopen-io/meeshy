import XCTest
import MeeshySDK
@testable import Meeshy

/// `AudioFullscreenSource.queuedAudio(urlString:)` maps a fullscreen source
/// (conversation OR standalone feed/comment/post/reel) into the `QueuedAudio`
/// the shared `ConversationAudioCoordinator` needs to keep the mini-player +
/// Now Playing card + queue alive once the fullscreen page hands playback
/// off to it. Conversation-context fields fall back to the attachment id /
/// empty string for standalone surfaces, which never carry a `messageId` or
/// `conversationId`.
@MainActor
final class AudioFullscreenSourceQueueTests: XCTestCase {

    func test_queuedAudio_mapsSourceFields() {
        let att = MessageAttachment(
            id: "att-9", fileName: "a.m4a", originalName: "a.m4a",
            mimeType: "audio/m4a", fileSize: 100, fileUrl: "https://x/original.m4a",
            width: nil, height: nil, duration: 4200
        )
        let created = Date(timeIntervalSince1970: 1_754_000_000)
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: "Ashley",
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: created, messageId: "msg-1", conversationId: "conv-1"
        )

        let queued = source.queuedAudio(urlString: "https://x/es.m4a")

        XCTAssertEqual(queued.attachmentId, "att-9")
        XCTAssertEqual(queued.messageId, "msg-1")
        XCTAssertEqual(queued.conversationId, "conv-1")
        XCTAssertEqual(queued.fileUrl, "https://x/es.m4a")
        XCTAssertEqual(queued.durationMs, 4200)
        XCTAssertEqual(queued.senderName, "Ashley")
        XCTAssertEqual(queued.receivedAt, created)
    }

    func test_queuedAudio_standaloneSource_fallsBackToAttachmentIds() {
        let att = MessageAttachment(
            id: "att-7", fileName: "f.m4a", originalName: "f.m4a",
            mimeType: "audio/m4a", fileSize: 100, fileUrl: "https://x/feed.m4a",
            width: nil, height: nil, duration: nil
        )
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: nil,
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: Date()
        )

        let queued = source.queuedAudio(urlString: att.fileUrl)

        XCTAssertEqual(queued.messageId, "att-7")
        XCTAssertEqual(queued.conversationId, "")
        XCTAssertEqual(queued.durationMs, 0)
        XCTAssertEqual(queued.senderName, "ashley")
    }
}
